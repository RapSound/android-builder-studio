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

// Le seul vrai bloquant : aucun code source Android détectable.
// Sans ça, il n'y a rien à compiler et rien de fiable à générer.
// Tout le reste (manifest, fichiers Gradle, wrapper...) est régénérable
// automatiquement à partir du code source trouvé.

const DEFAULT_GRADLE_PROPERTIES = `android.useAndroidX=true
android.nonTransitiveRClass=true
org.gradle.jvmargs=-Xmx2048m
`;
const DEFAULT_WRAPPER_PROPERTIES = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
const DEFAULT_GITIGNORE = `*.iml
.gradle
/local.properties
/.idea
.DS_Store
/build
/captures
.externalNativeBuild
.cxx
local.properties
`;

async function handleZip(file) {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    showVerify({ blocking: ["Le fichier doit être une archive .zip"], optional: [], plan: [] });
    return;
  }

  const buffer = await file.arrayBuffer();
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    showVerify({ blocking: ["ZIP invalide ou corrompu : impossible de le lire."], optional: [], plan: [] });
    return;
  }

  const paths = Object.keys(zip.files);
  const rootPrefix = detectRootPrefix(paths);
  const result = await inspectProject(zip, paths, rootPrefix);

  state.currentZip = zip;
  state.currentZipBytes = buffer;
  state.currentZipName = file.name;
  state.currentZipRootPrefix = rootPrefix;
  state.lastValidation = result;

  showVerify(result);

  if (result.blocking.length > 0) {
    $("projectCard").classList.add("hidden");
    return;
  }

  await renderProjectCard(zip, paths, rootPrefix, file);
}

async function renderProjectCard(zip, paths, rootPrefix, file) {
  const manifestPath = paths.find((p) => p === rootPrefix + "AndroidManifest.xml" || (p.endsWith("/AndroidManifest.xml") && p.startsWith(rootPrefix + "app/")));
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
  if (pkg === "—" && state.lastValidation && state.lastValidation.meta) {
    pkg = state.lastValidation.meta.packageGuess + " (détecté)";
  }

  state.currentProject = { pkg, versionName, minSdk, targetSdk, fileCount: paths.length };

  $("pcName").textContent = state.currentZipName || (file && file.name) || "—";
  $("pcSize").textContent = formatBytes(file ? file.size : state.currentZipBytes.byteLength);
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

// ---------- Détection du module Android à partir du code source ----------
function findAppModule(paths) {
  for (const p of paths) {
    const jIdx = p.indexOf("src/main/java/");
    const kIdx = p.indexOf("src/main/kotlin/");
    const idx = jIdx !== -1 ? jIdx : kIdx;
    if (idx !== -1 && (p.endsWith(".java") || p.endsWith(".kt"))) {
      return { appRoot: p.slice(0, idx), lang: jIdx !== -1 ? "java" : "kotlin", samplePath: p };
    }
  }
  return null;
}

function packageFromPath(fullPath, lang) {
  const marker = lang === "kotlin" ? "src/main/kotlin/" : "src/main/java/";
  const idx = fullPath.indexOf(marker);
  if (idx === -1) return null;
  const rel = fullPath.slice(idx + marker.length);
  const segs = rel.split("/");
  segs.pop();
  return segs.join(".") || null;
}

async function detectLauncherActivity(zip, paths, appRoot, lang) {
  const regex = lang === "kotlin" ? /class\s+(\w+)\s*:\s*\w*Activity/ : /class\s+(\w+)\s+extends\s+\w*Activity/;
  const candidates = paths.filter((p) => p.startsWith(appRoot) && p.includes("src/main/") && (p.endsWith(".kt") || p.endsWith(".java")));
  for (const p of candidates.slice(0, 40)) {
    try {
      const text = await zip.file(p).async("text");
      const m = text.match(regex);
      if (m) {
        const pkgMatch = text.match(/package\s+([\w.]+)/);
        return { className: m[1], packageName: pkgMatch ? pkgMatch[1] : packageFromPath(p, lang) };
      }
    } catch (e) { /* fichier illisible, on passe */ }
  }
  return null;
}

async function inspectProject(zip, paths, root) {
  const found = findAppModule(paths);
  if (!found) {
    return {
      blocking: ["Aucun code source Android trouvé (dossier src/main/java ou src/main/kotlin contenant au moins un fichier .java ou .kt)."],
      optional: [],
      plan: [],
    };
  }

  const { appRoot, lang, samplePath } = found;
  if (appRoot.length <= root.length) {
    return {
      blocking: ["Le code source doit être dans un sous-module (ex. app/) — structure Android Studio standard requise."],
      optional: [],
      plan: [],
    };
  }

  const moduleName = appRoot.slice(root.length).replace(/\/$/, "");
  const activityInfo = await detectLauncherActivity(zip, paths, appRoot, lang);
  const packageGuess = (activityInfo && activityInfo.packageName) || packageFromPath(samplePath, lang) || "com.example.app";

  const has = (p) => paths.includes(p);
  const optional = [];
  const plan = [];

  if (!has(appRoot + "src/main/AndroidManifest.xml")) {
    optional.push("AndroidManifest.xml");
    plan.push((z) => z.file(appRoot + "src/main/AndroidManifest.xml", genManifest(activityInfo)));
  }
  if (!has(appRoot + "build.gradle") && !has(appRoot + "build.gradle.kts")) {
    optional.push(moduleName + "/build.gradle");
    plan.push((z) => z.file(appRoot + "build.gradle", genAppBuildGradle(packageGuess, lang)));
  }
  if (!has(root + "settings.gradle") && !has(root + "settings.gradle.kts")) {
    optional.push("settings.gradle");
    plan.push((z) => z.file(root + "settings.gradle", genSettingsGradle(moduleName)));
  }
  if (!has(root + "build.gradle") && !has(root + "build.gradle.kts")) {
    optional.push("build.gradle (racine)");
    plan.push((z) => z.file(root + "build.gradle", genRootBuildGradle(lang)));
  }
  if (!has(root + "gradle.properties")) {
    optional.push("gradle.properties");
    plan.push((z) => z.file(root + "gradle.properties", DEFAULT_GRADLE_PROPERTIES));
  }
  if (!has(root + "gradle/wrapper/gradle-wrapper.properties")) {
    optional.push("gradle/wrapper/gradle-wrapper.properties");
    plan.push((z) => z.file(root + "gradle/wrapper/gradle-wrapper.properties", DEFAULT_WRAPPER_PROPERTIES));
  }
  if (!has(root + ".gitignore")) {
    optional.push(".gitignore");
    plan.push((z) => z.file(root + ".gitignore", DEFAULT_GITIGNORE));
  }
  const hasWrapper = has(root + "gradlew") && has(root + "gradle/wrapper/gradle-wrapper.jar");
  if (!hasWrapper) {
    optional.push("gradlew / gradle-wrapper.jar (régénéré automatiquement pendant la compilation)");
  }

  return { blocking: [], optional, plan, meta: { appRoot, root, moduleName, lang, packageGuess, activityInfo } };
}

// ---------- Génération de fichiers manquants ----------
function genManifest(activityInfo) {
  let activityBlock = "";
  if (activityInfo) {
    const name = activityInfo.packageName ? "." + activityInfo.className : activityInfo.className;
    activityBlock = `        <activity
            android:name="${name}"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
`;
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:label="Application"
        android:supportsRtl="true">
${activityBlock}    </application>

</manifest>
`;
}

function genRootBuildGradle(lang) {
  const kotlinLine = lang === "kotlin" ? "\n    id 'org.jetbrains.kotlin.android' version '1.9.24' apply false" : "";
  return `plugins {
    id 'com.android.application' version '8.4.0' apply false${kotlinLine}
}
`;
}

function genSettingsGradle(moduleName) {
  return `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "GeneratedProject"
include ':${moduleName}'
`;
}

function genAppBuildGradle(packageName, lang) {
  const pkg = packageName || "com.example.app";
  const plugins = lang === "kotlin"
    ? `plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}`
    : `plugins {
    id 'com.android.application'
}`;
  const kotlinBlock = lang === "kotlin" ? `

    kotlinOptions {
        jvmTarget = '17'
    }` : "";
  return `${plugins}

android {
    namespace '${pkg}'
    compileSdk 34

    defaultConfig {
        applicationId "${pkg}"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            minifyEnabled false
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }${kotlinBlock}
}

dependencies {
    implementation 'androidx.core:core-ktx:1.13.1'
    implementation 'androidx.appcompat:appcompat:1.7.0'
}
`;
}

async function autoCompleteZip() {
  if (!state.currentZip || !state.lastValidation) return;
  const zip = state.currentZip;
  const plan = state.lastValidation.plan || [];

  if (plan.length === 0) {
    toast("Rien à compléter automatiquement.");
    return;
  }

  plan.forEach((apply) => apply(zip));

  const newBuffer = await zip.generateAsync({ type: "arraybuffer" });
  state.currentZipBytes = newBuffer;

  const paths = Object.keys(zip.files);
  const root = state.currentZipRootPrefix;
  const result = await inspectProject(zip, paths, root);
  state.lastValidation = result;
  showVerify(result);

  if (result.blocking.length === 0) {
    await renderProjectCard(zip, paths, root, null);
  }

  toast("Projet complété automatiquement (" + plan.length + " fichier(s) généré(s)).", "success");
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

function showVerify(result) {
  const { blocking, optional, plan } = result;
  const el = $("verifyResult");
  el.classList.remove("hidden", "ok", "error");

  if (blocking.length > 0) {
    el.classList.add("error");
    el.innerHTML =
      "✕ Projet invalide :" +
      "<ul>" + blocking.map((m) => `<li>${escapeHtml(m)}</li>`).join("") + "</ul>" +
      "<p class=\"hint\">Il faut du code source Android réel dans le ZIP (dossier src/main/java ou src/main/kotlin) — ça, l'interface ne peut pas l'inventer.</p>";
    return;
  }

  let html = "✓ Projet Android valide, prêt à compiler.";
  if (optional.length > 0) {
    html +=
      "<p class=\"hint\" style=\"margin-top:10px;\">Éléments manquants (non bloquants, complétables automatiquement) :</p>" +
      "<ul>" + optional.map((m) => `<li>${escapeHtml(m)}</li>`).join("") + "</ul>";
  }
  if (plan && plan.length > 0) {
    html += `<button id="autoCompleteBtn" class="btn btn-ghost" style="margin-top:8px;">Compléter automatiquement</button>`;
  }
  el.classList.add("ok");
  el.innerHTML = html;

  const btn = document.getElementById("autoCompleteBtn");
  if (btn) btn.addEventListener("click", autoCompleteZip);
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
  if (state.lastValidation && state.lastValidation.blocking.length > 0) {
    toast("Corrige d'abord les éléments manquants requis.", "error");
    return;
  }

  $("projectCard").classList.add("hidden");
  $("resultCard").classList.add("hidden");
  $("errorCard").classList.add("hidden");
  $("progressCard").classList.remove("hidden");
  resetSteps();
  setStep("prepare", "active");
  state.startedAt = Date.now();
  state.currentJobId = null;
  state.currentFailedStep = null;
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
          await handleFailure(owner, repo, run.id, current);
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
  const job = jobs.jobs[0];
  state.currentJobId = job.id;
  const steps = job.steps || [];
  let completedCount = 0;
  let failedStepName = null;
  steps.forEach((s) => {
    const key = STEP_LABEL_TO_KEY[s.name];
    if (!key) return;
    if (s.status === "completed") {
      setStep(key, s.conclusion === "success" ? "done" : "error");
      completedCount++;
      if (s.conclusion && s.conclusion !== "success" && !failedStepName) failedStepName = s.name;
    } else if (s.status === "in_progress") {
      setStep(key, "active");
    }
  });
  if (failedStepName) state.currentFailedStep = failedStepName;
  const pct = Math.min(95, Math.round((completedCount / (STEP_ORDER.length - 1)) * 100));
  $("progressBarInner").style.width = pct + "%";
  $("progressPercent").textContent = pct + "%";
}

async function handleFailure(owner, repo, runId, run) {
  state.lastFailedRun = { owner, repo, runId };
  const stepName = state.currentFailedStep || "étape inconnue";
  let title = `Échec à l'étape « ${stepName} »`;
  let message = `Conclusion du workflow : ${run.conclusion}.`;
  let logsTail = "";

  try {
    if (state.currentJobId) {
      logsTail = await fetchJobLogTail(owner, repo, state.currentJobId, 100);
    }
  } catch (e) {
    logsTail = "Impossible de récupérer les logs automatiquement : " + e.message + "\nVoir directement : " + run.html_url;
  }

  // Messages plus parlants pour les cas fréquents détectés dans les logs
  if (/AndroidManifest\.xml introuvable|Projet incomplet/i.test(logsTail)) {
    message = "Le projet extrait ne contient pas les fichiers requis (voir détail ci-dessous).";
  } else if (/could not resolve|could not find|failed to resolve/i.test(logsTail)) {
    message = "Gradle n'a pas pu résoudre une dépendance (vérifie les versions dans build.gradle).";
  } else if (/compileDebugJavaWithJavac|compileReleaseJavaWithJavac/i.test(logsTail) && /jlink|core-for-system-modules/i.test(logsTail)) {
    message = "Incompatibilité entre la version de Java et l'Android Gradle Plugin du projet.";
  } else if (/SDK location not found|licenses have not been accepted/i.test(logsTail)) {
    message = "Problème de configuration du SDK Android sur le runner.";
  }

  showError(title, message + ` Run complet : ${run.html_url}`, logsTail);
}

async function fetchJobLogTail(owner, repo, jobId, maxLines) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, {
    headers: ghHeaders(),
  });
  if (!res.ok) throw new Error(`Logs indisponibles (${res.status})`);
  const text = await res.text();
  const lines = text.split("\n");

  // Sur un échec de compilation, la stack trace Gradle/Kotlin peut faire
  // des centaines de lignes et noyer la vraie erreur ("e: fichier.kt: ...").
  // On fait remonter ces lignes-là en priorité, avant la fin brute du log.
  const errorPattern = /^e:\s|: error:|FAILURE:|What went wrong|Execution failed for/i;
  const errorLines = lines.filter((l) => errorPattern.test(l));
  const tail = lines.slice(-maxLines);

  if (errorLines.length > 0) {
    return "── Erreurs détectées ──\n" + errorLines.slice(0, 60).join("\n") + "\n\n── Fin du log ──\n" + tail.join("\n");
  }
  return tail.join("\n");
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
function showError(title, message, preciseLogs) {
  clearInterval(state.pollTimer);
  $("progressCard").classList.add("hidden");
  $("errorTitle").textContent = title;
  $("errorMessage").textContent = message;
  $("errorLogs").textContent = (preciseLogs ? preciseLogs + "\n\n---\n" : "") + $("logsOutput").textContent;
  $("errorCard").classList.remove("hidden");
  pushHistory({
    name: state.currentZipName || "projet",
    date: new Date().toISOString(),
    status: "error",
    message,
  });
}

$("retryBtn").addEventListener("click", () => {
  $("errorCard").classList.add("hidden");
  startCompilation();
});

$("downloadFullLogBtn").addEventListener("click", async () => {
  if (!state.lastFailedRun) {
    toast("Aucun run associé à télécharger pour l'instant.", "error");
    return;
  }
  try {
    const { owner, repo, runId } = state.lastFailedRun;
    toast("Récupération du log complet…");
    const artifacts = await ghJson(`/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`);
    const logArtifact = (artifacts.artifacts || []).find((a) => a.name === "gradle-output-log");
    if (!logArtifact) {
      toast("Log complet indisponible pour ce run (peut-être expiré).", "error");
      return;
    }
    const res = await fetch(logArtifact.archive_download_url, { headers: ghHeaders() });
    if (!res.ok) throw new Error("Téléchargement impossible (" + res.status + ")");
    const blob = await res.blob();
    const innerZip = await JSZip.loadAsync(blob);
    const logEntry = Object.values(innerZip.files).find((f) => f.name.endsWith(".log"));
    if (!logEntry) throw new Error("Fichier log introuvable dans l'artefact.");
    const text = await logEntry.async("text");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "gradle-output.log";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    toast("Erreur au téléchargement du log : " + err.message, "error");
  }
});
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
