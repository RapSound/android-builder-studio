// ============================================================
// Android Builder Studio — script.js
// ============================================================

const CFG = window.ABS_CONFIG;

const STEP_ORDER = ["prepare", "extract", "analyze", "gradle", "compile", "sign", "apk", "publish", "done"];
const STEP_LABEL_TO_KEY = {
  "Préparation": "prepare",
  "Extraction": "extract",
  "Analyse": "analyze",
  "Installation Gradle": "gradle",
  "Compilation": "compile",
  "Signature": "sign",
  "Création APK": "apk",
  "Publication": "publish",
};

const state = {
  token: localStorage.getItem("abs_token") || null,
  githubOwner: localStorage.getItem("abs_owner") || CFG.GITHUB_OWNER,
  githubRepo: localStorage.getItem("abs_repo") || CFG.GITHUB_REPO,
  settings: JSON.parse(localStorage.getItem("abs_settings") || "{}"),
  history: JSON.parse(localStorage.getItem("abs_history") || "[]"),
  currentZip: null,
  currentZipBytes: null,
  currentProject: null,
  pollTimer: null,
  startedAt: null,
};

// ---------- DOM shortcuts ----------
const $ = (id) => document.getElementById(id);
const dropzone = $("dropzone");
const fileInput = $("fileInput");

// ============================================================
// Toasts
// ============================================================
function toast(message, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  $("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// ============================================================
// Panels (settings / history)
// ============================================================
document.querySelectorAll(".navbtn[data-panel]").forEach((btn) => {
  btn.addEventListener("click", () => togglePanel(btn.dataset.panel));
});
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => togglePanel(btn.dataset.close, true));
});
function togglePanel(name, forceClose = false) {
  const panel = $(name + "Panel");
  if (forceClose) panel.classList.add("hidden");
  else panel.classList.toggle("hidden");
}

// ============================================================
// Device Flow authentication
// ============================================================
$("authBtn").addEventListener("click", () => {
  if (state.token) {
    localStorage.removeItem("abs_token");
    state.token = null;
    updateAuthButton();
    toast("Déconnecté de GitHub.");
    return;
  }
  startDeviceFlow();
});

function updateAuthButton() {
  $("authBtn").textContent = state.token ? "Connecté ✓ (déconnexion)" : "Se connecter à GitHub";
}
updateAuthButton();

async function startDeviceFlow() {
  if (!CFG.GITHUB_CLIENT_ID || CFG.GITHUB_CLIENT_ID.startsWith("REPLACE")) {
    toast("Configure GITHUB_CLIENT_ID dans config.js avant de te connecter.", "error");
    return;
  }
  if (!CFG.CORS_PROXY_URL || CFG.CORS_PROXY_URL.includes("REPLACE")) {
    toast("Configure CORS_PROXY_URL dans config.js (voir proxy/worker.js).", "error");
    return;
  }

  try {
    const res = await fetch(`${CFG.CORS_PROXY_URL}/device/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: CFG.GITHUB_CLIENT_ID, scope: CFG.OAUTH_SCOPES }),
    });
    const data = await res.json();
    if (!data.device_code) throw new Error(data.error_description || "Réponse inattendue de GitHub.");

    $("authUri").href = data.verification_uri;
    $("authUri").textContent = data.verification_uri;
    $("authCode").textContent = data.user_code;
    $("authModal").classList.remove("hidden");

    pollForToken(data.device_code, data.interval || 5);
  } catch (err) {
    toast("Échec de la connexion GitHub : " + err.message, "error");
  }
}

document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => {
    $("authModal").classList.add("hidden");
    if (state.devicePollTimer) clearTimeout(state.devicePollTimer);
  });
});

function pollForToken(deviceCode, interval) {
  const poll = async () => {
    try {
      const res = await fetch(`${CFG.CORS_PROXY_URL}/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: CFG.GITHUB_CLIENT_ID,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });
      const data = await res.json();

      if (data.access_token) {
        state.token = data.access_token;
        localStorage.setItem("abs_token", state.token);
        $("authModal").classList.add("hidden");
        updateAuthButton();
        toast("Connecté à GitHub.", "success");
        return;
      }
      if (data.error === "authorization_pending") {
        state.devicePollTimer = setTimeout(poll, interval * 1000);
      } else if (data.error === "slow_down") {
        state.devicePollTimer = setTimeout(poll, (interval + 5) * 1000);
      } else if (data.error) {
        toast("Connexion refusée ou expirée : " + data.error, "error");
        $("authModal").classList.add("hidden");
      }
    } catch (err) {
      toast("Erreur réseau pendant la connexion.", "error");
    }
  };
  state.devicePollTimer = setTimeout(poll, interval * 1000);
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${state.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// ============================================================
// Drag & drop / sélection du ZIP
// ============================================================
$("chooseZipBtn").addEventListener("click", () => fileInput.click());
dropzone.addEventListener("click", (e) => {
  if (e.target.id !== "chooseZipBtn") fileInput.click();
});
fileInput.addEventListener("change", (e) => {
  if (e.target.files[0]) handleZip(e.target.files[0]);
});
["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  })
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleZip(file);
});

const REQUIRED_ENTRIES = ["AndroidManifest.xml", "settings.gradle", "build.gradle", "gradlew", "app/"];

async function handleZip(file) {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    showVerify(false, ["Le fichier doit être une archive .zip"]);
    return;
  }

  const buffer = await file.arrayBuffer();
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    showVerify(false, ["ZIP invalide ou corrompu."]);
    return;
  }

  const paths = Object.keys(zip.files);
  // Le projet peut être à la racine ou dans un sous-dossier unique (ex: monprojet/app/...)
  const rootPrefix = detectRootPrefix(paths);
  const missing = REQUIRED_ENTRIES.filter((req) => {
    return !paths.some((p) => p === rootPrefix + req || p.startsWith(rootPrefix + req));
  });

  if (missing.length > 0) {
    showVerify(false, missing.map((m) => `Élément manquant : ${m}`));
    return;
  }

  showVerify(true, []);

  state.currentZip = zip;
  state.currentZipBytes = buffer;
  state.currentZipName = file.name;
  state.currentZipRootPrefix = rootPrefix;

  const manifestPath = paths.find((p) => p === rootPrefix + "AndroidManifest.xml" || p.endsWith("/AndroidManifest.xml") && p.startsWith(rootPrefix + "app/"));
  const manifestEntry = zip.file(manifestPath) || zip.file(rootPrefix + "app/src/main/AndroidManifest.xml");
  let pkg = "—", versionName = "—", minSdk = "—", targetSdk = "—";

  if (manifestEntry) {
    try {
      const xmlText = await manifestEntry.async("text");
      const doc = new DOMParser().parseFromString(xmlText, "text/xml");
      const manifestEl = doc.querySelector("manifest");
      if (manifestEl) {
        pkg = manifestEl.getAttribute("package") || pkg;
        versionName = manifestEl.getAttribute("android:versionName") || versionName;
      }
      const usesSdk = doc.querySelector("uses-sdk");
      if (usesSdk) {
        minSdk = usesSdk.getAttribute("android:minSdkVersion") || minSdk;
        targetSdk = usesSdk.getAttribute("android:targetSdkVersion") || targetSdk;
      }
    } catch (e) { /* pas bloquant : champs laissés à "—" */ }
  }

  state.currentProject = { pkg, versionName, minSdk, targetSdk, fileCount: paths.length };

  $("pcName").textContent = file.name;
  $("pcSize").textContent = formatBytes(file.size);
  $("pcFiles").textContent = paths.length;
  $("pcPackage").textContent = pkg;
  $("pcVersion").textContent = versionName;
  $("pcSdkMin").textContent = minSdk;
  $("pcSdkTarget").textContent = targetSdk;

  $("projectCard").classList.remove("hidden");
  $("resultCard").classList.add("hidden");
  $("errorCard").classList.add("hidden");
  $("progressCard").classList.add("hidden");
}

function detectRootPrefix(paths) {
  const topLevel = new Set(paths.map((p) => p.split("/")[0]));
  const hasRootFiles = paths.some((p) => p === "settings.gradle" || p === "build.gradle");
  if (hasRootFiles || topLevel.size > 3) return "";
  if (topLevel.size === 1) {
    const only = [...topLevel][0];
    return only ? only + "/" : "";
  }
  return "";
}

function showVerify(ok, messages) {
  const el = $("verifyResult");
  el.classList.remove("hidden", "ok", "error");
  el.classList.add(ok ? "ok" : "error");
  el.innerHTML = ok
    ? "✓ Projet Android valide."
    : "✕ Projet invalide :<ul>" + messages.map((m) => `<li>${m}</li>`).join("") + "</ul>";
  if (!ok) $("projectCard").classList.add("hidden");
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " o";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko";
  return (bytes / (1024 * 1024)).toFixed(2) + " Mo";
}

// ============================================================
// Compilation : upload via Git Data API -> push -> déclenche le workflow
// ============================================================
$("compileBtn").addEventListener("click", startCompilation);

async function startCompilation() {
  if (!state.token) {
    toast("Connecte-toi à GitHub avant de compiler.", "error");
    return;
  }
  if (!state.currentZip) {
    toast("Importe d'abord un projet.", "error");
    return;
  }

  $("projectCard").classList.add("hidden");
  $("resultCard").classList.add("hidden");
  $("errorCard").classList.add("hidden");
  $("progressCard").classList.remove("hidden");
  resetSteps();
  setStep("prepare", "active");
  state.startedAt = Date.now();
  log("Préparation de l'envoi vers GitHub…");

  try {
    const owner = state.githubOwner;
    const repo = state.githubRepo;
    const branch = CFG.GITHUB_BUILD_BRANCH;

    // 1. Référence de la branche de build (créée si absente depuis la branche par défaut)
    const baseSha = await ensureBuildBranch(owner, repo, branch);

    // 2. Blob du ZIP (base64)
    log("Envoi de l'archive du projet…");
    const zipBase64 = arrayBufferToBase64(state.currentZipBytes);
    const blobSha = await createBlob(owner, repo, zipBase64, "base64");

    // 3. Blob de la config de build
    const buildConfig = collectBuildConfig();
    const configBlobSha = await createBlob(owner, repo, JSON.stringify(buildConfig, null, 2), "utf-8");

    // 4. Arbre basé sur le dernier commit de la branche
    const baseCommit = await ghJson(`/repos/${owner}/${repo}/git/commits/${baseSha}`);
    const treeSha = await createTree(owner, repo, baseCommit.tree.sha, [
      { path: "builds/incoming.zip", mode: "100644", type: "blob", sha: blobSha },
      { path: "builds/build-config.json", mode: "100644", type: "blob", sha: configBlobSha },
    ]);

    // 5. Nouveau commit + mise à jour de la référence -> déclenche le workflow (push)
    const commitSha = await createCommit(owner, repo, `build: ${state.currentZipName}`, treeSha, baseSha);
    await updateRef(owner, repo, branch, commitSha);

    setStep("prepare", "done");
    log("Poussé sur la branche '" + branch + "'. En attente du démarrage du workflow…");

    await waitForRunAndPoll(owner, repo, commitSha);
  } catch (err) {
    showError("Erreur pendant l'envoi du projet", err.message);
  }
}

function collectBuildConfig() {
  return {
    buildType: $("buildType").value || "debug",
    apkName: $("apkName").value || state.currentZipName.replace(/\.zip$/i, ""),
    appName: $("appName").value || "",
    versionName: $("versionName").value || "",
    versionCode: $("versionCode").value || "",
    orientation: $("orientation").value || "auto",
  };
}

async function ensureBuildBranch(owner, repo, branch) {
  try {
    const ref = await ghJson(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    return ref.object.sha;
  } catch (e) {
    const repoInfo = await ghJson(`/repos/${owner}/${repo}`);
    const defaultBranch = repoInfo.default_branch;
    const defaultRef = await ghJson(`/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`);
    await ghJson(`/repos/${owner}/${repo}/git/refs`, "POST", {
      ref: `refs/heads/${branch}`,
      sha: defaultRef.object.sha,
    });
    return defaultRef.object.sha;
  }
}

async function createBlob(owner, repo, content, encoding) {
  const res = await ghJson(`/repos/${owner}/${repo}/git/blobs`, "POST", { content, encoding });
  return res.sha;
}
async function createTree(owner, repo, baseTree, tree) {
  const res = await ghJson(`/repos/${owner}/${repo}/git/trees`, "POST", { base_tree: baseTree, tree });
  return res.sha;
}
async function createCommit(owner, repo, message, tree, parent) {
  const res = await ghJson(`/repos/${owner}/${repo}/git/commits`, "POST", { message, tree, parents: [parent] });
  return res.sha;
}
async function updateRef(owner, repo, branch, sha) {
  return ghJson(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, "PATCH", { sha, force: true });
}

async function ghJson(path, method = "GET", body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || `Erreur API GitHub (${res.status})`);
  }
  return res.json();
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ============================================================
// Suivi du workflow GitHub Actions
// ============================================================
async function waitForRunAndPoll(owner, repo, commitSha) {
  log("Recherche du run associé au commit " + commitSha.slice(0, 7) + "…");
  let run = null;
  for (let i = 0; i < 20 && !run; i++) {
    await sleep(3000);
    const runs = await ghJson(`/repos/${owner}/${repo}/actions/runs?head_sha=${commitSha}&per_page=5`);
    if (runs.workflow_runs && runs.workflow_runs.length > 0) run = runs.workflow_runs[0];
  }
  if (!run) {
    showError("Le workflow n'a pas démarré", "Vérifie que .github/workflows/build.yml existe sur la branche '" + CFG.GITHUB_BUILD_BRANCH + "' et écoute bien les push sur builds/incoming.zip.");
    return;
  }

  log(`Run #${run.run_number} démarré (${run.html_url}).`);

  state.pollTimer = setInterval(async () => {
    try {
      const current = await ghJson(`/repos/${owner}/${repo}/actions/runs/${run.id}`);
      await refreshStepsFromJobs(owner, repo, run.id);
      updateEta();

      if (current.status === "completed") {
        clearInterval(state.pollTimer);
        if (current.conclusion === "success") {
          setStep("done", "done");
          await handleSuccess(owner, repo, run.id);
        } else {
          showError("La compilation a échoué", `Conclusion du workflow : ${current.conclusion}. Voir les logs : ${current.html_url}`);
        }
      }
    } catch (err) {
      // erreurs transitoires de l'API tolérées, on continue le polling
    }
  }, 5000);
}

async function refreshStepsFromJobs(owner, repo, runId) {
  const jobs = await ghJson(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
  if (!jobs.jobs || jobs.jobs.length === 0) return;
  const steps = jobs.jobs[0].steps || [];
  let completedCount = 0;
  steps.forEach((s) => {
    const key = STEP_LABEL_TO_KEY[s.name];
    if (!key) return;
    if (s.status === "completed") {
      setStep(key, s.conclusion === "success" ? "done" : "error");
      completedCount++;
    } else if (s.status === "in_progress") {
      setStep(key, "active");
    }
  });
  const pct = Math.min(95, Math.round((completedCount / (STEP_ORDER.length - 1)) * 100));
  $("progressBarInner").style.width = pct + "%";
  $("progressPercent").textContent = pct + "%";
}

async function handleSuccess(owner, repo, runId) {
  log("Compilation réussie. Récupération de l'APK…");
  const artifacts = await ghJson(`/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`);
  const artifact = artifacts.artifacts && artifacts.artifacts[0];
  if (!artifact) {
    showError("Aucun artefact trouvé", "Le workflow a réussi mais n'a publié aucune APK.");
    return;
  }

  $("progressBarInner").style.width = "100%";
  $("progressPercent").textContent = "100%";

  const cfg = collectBuildConfig();
  const record = {
    name: cfg.apkName || state.currentZipName,
    date: new Date().toISOString(),
    status: "success",
    sizeBytes: artifact.size_in_bytes,
    version: cfg.versionName || state.currentProject?.versionName || "—",
    downloadUrl: artifact.archive_download_url,
    runUrl: `https://github.com/${owner}/${repo}/actions/runs/${runId}`,
  };
  pushHistory(record);

  $("progressCard").classList.add("hidden");
  $("resName").textContent = record.name;
  $("resSize").textContent = formatBytes(record.sizeBytes);
  $("resVersion").textContent = record.version;
  $("resDate").textContent = new Date(record.date).toLocaleString("fr-FR");
  $("resultCard").classList.remove("hidden");

  $("downloadBtn").onclick = () => downloadArtifact(record.downloadUrl, record.name);
}

async function downloadArtifact(url, name) {
  try {
    toast("Téléchargement de l'APK…");
    const res = await fetch(url, { headers: ghHeaders() });
    if (!res.ok) throw new Error("Téléchargement impossible (" + res.status + ")");
    const blob = await res.blob();
    // GitHub renvoie l'artefact sous forme de ZIP contenant l'APK
    const innerZip = await JSZip.loadAsync(blob);
    const apkEntry = Object.values(innerZip.files).find((f) => f.name.toLowerCase().endsWith(".apk"));
    if (!apkEntry) throw new Error("Aucun fichier .apk dans l'artefact.");
    const apkBlob = await apkEntry.async("blob");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(apkBlob);
    a.download = (name || "app") + ".apk";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    toast("Erreur au téléchargement : " + err.message, "error");
  }
}

// ============================================================
// Étapes / logs / erreurs
// ============================================================
function resetSteps() {
  document.querySelectorAll("#stepsList li").forEach((li) => li.classList.remove("active", "done", "error"));
  $("progressBarInner").style.width = "0%";
  $("progressPercent").textContent = "0%";
  $("logsOutput").textContent = "";
}
function setStep(key, state_) {
  const li = document.querySelector(`#stepsList li[data-step="${key}"]`);
  if (!li) return;
  li.classList.remove("active", "done", "error");
  li.classList.add(state_);
}
function log(msg) {
  const out = $("logsOutput");
  out.textContent += `[${new Date().toLocaleTimeString("fr-FR")}] ${msg}\n`;
  out.scrollTop = out.scrollHeight;
}
function updateEta() {
  if (!state.startedAt) return;
  const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
  $("progressEta").textContent = `Écoulé : ${elapsed}s`;
}
function showError(title, message) {
  clearInterval(state.pollTimer);
  $("progressCard").classList.add("hidden");
  $("errorTitle").textContent = title;
  $("errorMessage").textContent = message;
  $("errorLogs").textContent = $("logsOutput").textContent;
  $("errorCard").classList.remove("hidden");
  pushHistory({
    name: state.currentZipName || "projet",
    date: new Date().toISOString(),
    status: "error",
    message,
  });
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ============================================================
// Historique (20 dernières, localStorage)
// ============================================================
function pushHistory(record) {
  state.history.unshift(record);
  state.history = state.history.slice(0, CFG.HISTORY_LIMIT || 20);
  localStorage.setItem("abs_history", JSON.stringify(state.history));
  renderHistory();
}
function renderHistory() {
  const list = $("historyList");
  if (state.history.length === 0) {
    list.innerHTML = '<li class="history-empty">Aucune compilation pour le moment.</li>';
    return;
  }
  list.innerHTML = state.history
    .map((h) => `
      <li>
        <strong>${escapeHtml(h.name)}</strong>
        <span class="history-status ${h.status}">${h.status === "success" ? "Réussi" : "Échec"}</span>
        <span class="hint">${new Date(h.date).toLocaleString("fr-FR")}</span>
        ${h.runUrl ? `<a href="${h.runUrl}" target="_blank" rel="noopener" class="hint">Voir le run</a>` : ""}
      </li>
    `)
    .join("");
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
renderHistory();

// ============================================================
// Paramètres
// ============================================================
function loadSettingsIntoForm() {
  const s = state.settings;
  $("buildType").value = s.buildType || "debug";
  $("apkName").value = s.apkName || "";
  $("appName").value = s.appName || "";
  $("versionName").value = s.versionName || "";
  $("versionCode").value = s.versionCode || "";
  $("orientation").value = s.orientation || "auto";
  $("cfgOwner").value = state.githubOwner || "";
  $("cfgRepo").value = state.githubRepo || "";
}
loadSettingsIntoForm();

$("saveSettingsBtn").addEventListener("click", () => {
  state.settings = {
    buildType: $("buildType").value,
    apkName: $("apkName").value,
    appName: $("appName").value,
    versionName: $("versionName").value,
    versionCode: $("versionCode").value,
    orientation: $("orientation").value,
  };
  localStorage.setItem("abs_settings", JSON.stringify(state.settings));
  toast("Paramètres enregistrés.", "success");
});

$("saveGithubCfgBtn").addEventListener("click", () => {
  state.githubOwner = $("cfgOwner").value.trim();
  state.githubRepo = $("cfgRepo").value.trim();
  localStorage.setItem("abs_owner", state.githubOwner);
  localStorage.setItem("abs_repo", state.githubRepo);
  toast("Connexion au dépôt enregistrée.", "success");
});
