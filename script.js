// ============================================================
// Android Builder Studio — script.js
// Moteur d'analyse et reconstruction ZIP côté client
// ============================================================

const CFG = window.ABS_CONFIG;

const STEP_ORDER = ["prepare", "extract", "analyze_project", "reconstruct", "analyze", "gradle", "compile", "sign", "apk", "publish", "done"];
const STEP_LABEL_TO_KEY = {
  "Préparation":          "prepare",
  "Extraction":           "extract",
  "Analyse du projet":    "analyze_project",
  "Reconstruction du projet": "reconstruct",
  "Lecture config":       "analyze",
  "Installation Java":    "gradle",
  "Installation Gradle Wrapper": "gradle",
  "Compilation":          "compile",
  "Signature":            "sign",
  "Création APK":         "apk",
  "Publication APK":      "publish",
};

const state = {
  token: localStorage.getItem("abs_token") || null,
  githubOwner: localStorage.getItem("abs_owner") || CFG.GITHUB_OWNER,
  githubRepo:  localStorage.getItem("abs_repo")  || CFG.GITHUB_REPO,
  settings:  JSON.parse(localStorage.getItem("abs_settings") || "{}"),
  history:   JSON.parse(localStorage.getItem("abs_history")  || "[]"),
  currentZip: null,
  currentZipBytes: null,
  currentZipName: null,
  currentProject: null,
  analysisResult: null,
  repairPlan: null,
  pollTimer: null,
  startedAt: null,
};

const $ = (id) => document.getElementById(id);

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
// Panels
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
// Auth Device Flow
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
    toast("Configure GITHUB_CLIENT_ID dans config.js.", "error"); return;
  }
  if (!CFG.CORS_PROXY_URL || CFG.CORS_PROXY_URL.includes("REPLACE")) {
    toast("Configure CORS_PROXY_URL dans config.js.", "error"); return;
  }
  try {
    const res = await fetch(`${CFG.CORS_PROXY_URL}/device/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: CFG.GITHUB_CLIENT_ID, scope: CFG.OAUTH_SCOPES }),
    });
    const data = await res.json();
    if (!data.device_code) throw new Error(data.error_description || "Réponse inattendue.");
    $("authUri").href = data.verification_uri;
    $("authUri").textContent = data.verification_uri;
    $("authCode").textContent = data.user_code;
    $("authModal").classList.remove("hidden");
    pollForToken(data.device_code, data.interval || 5);
  } catch (err) {
    toast("Échec connexion GitHub : " + err.message, "error");
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
      if (data.error === "authorization_pending") state.devicePollTimer = setTimeout(poll, interval * 1000);
      else if (data.error === "slow_down") state.devicePollTimer = setTimeout(poll, (interval + 5) * 1000);
      else if (data.error) { toast("Connexion refusée : " + data.error, "error"); $("authModal").classList.add("hidden"); }
    } catch (err) { toast("Erreur réseau pendant la connexion.", "error"); }
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
const dropzone = $("dropzone");
const fileInput = $("fileInput");

$("chooseZipBtn").addEventListener("click", () => fileInput.click());
dropzone.addEventListener("click", (e) => { if (e.target.id !== "chooseZipBtn") fileInput.click(); });
fileInput.addEventListener("change", (e) => { if (e.target.files[0]) handleZip(e.target.files[0]); });
["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("dragover"); })
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleZip(file);
});

// ============================================================
// MOTEUR D'ANALYSE ZIP — Détection de structure réelle
// ============================================================

const RESOURCE_DIRS = new Set([
  "drawable","mipmap","values","layout","xml","raw","menu",
  "navigation","font","anim","animator","color","transition",
  "interpolator",
]);

function isResourceDir(name) {
  return RESOURCE_DIRS.has(name.split("-")[0]);
}

function detectRootPrefix(paths) {
  // Détecte les préfixes parasites : MonProjet/MonProjet/app/... → MonProjet/
  const topLevel = new Set(paths.map((p) => p.split("/")[0]));
  const hasRootFiles = paths.some(
    (p) => p === "settings.gradle" || p === "build.gradle" ||
           p === "settings.gradle.kts" || p === "build.gradle.kts"
  );
  if (hasRootFiles || topLevel.size > 5) return "";
  if (topLevel.size === 1) {
    const only = [...topLevel][0];
    return only ? only + "/" : "";
  }
  return "";
}

function detectNestedRoot(paths, rootPrefix) {
  // Cherche si tout le contenu est dans un sous-dossier supplémentaire
  // ex: MonProjet/MonProjet/app/... → retourne "MonProjet/MonProjet/"
  const subPaths = paths.map((p) => (rootPrefix ? p.slice(rootPrefix.length) : p)).filter(Boolean);
  const secondLevel = new Set(subPaths.map((p) => p.split("/")[0]).filter(Boolean));
  if (secondLevel.size === 1) {
    const sub = [...secondLevel][0];
    const subSubPaths = subPaths.map((p) => p.slice(sub.length + 1)).filter(Boolean);
    const androidHints = ["app", "build.gradle", "build.gradle.kts", "settings.gradle", "gradlew", "src"];
    const hasHint = subSubPaths.some((p) => androidHints.includes(p.split("/")[0]));
    if (hasHint) return rootPrefix + sub + "/";
  }
  return rootPrefix;
}

async function readFileText(zipEntry) {
  try { return await zipEntry.async("text"); } catch { return ""; }
}

function extractPackage(content) {
  const m = content.match(/^\s*package\s+([\w.]+)\s*;?\s*$/m);
  return m ? m[1] : null;
}

function packageToPath(pkg) {
  return pkg.replace(/\./g, "/");
}

function detectAgpVersion(content) {
  let m = content.match(/com\.android\.tools\.build:gradle:([0-9.]+)/);
  if (m) return m[1];
  m = content.match(/['""]com\.android\.application['""][^'"]*version[^'"]*['""]([0-9.]+)['"]/);
  if (m) return m[1];
  return null;
}

function compatibleGradle(agpVersion) {
  const table = [
    ["8.4","8.7"], ["8.3","8.5"], ["8.2","8.3"], ["8.1","8.1"],
    ["8.0","8.0"], ["7.4","7.6"], ["7.3","7.4"], ["7.2","7.3"],
    ["7.1","7.2"], ["7.0","7.0"],
  ];
  if (!agpVersion) return "8.7";
  const av = agpVersion.split(".").map(Number);
  for (const [agp, gradle] of table) {
    const ag = agp.split(".").map(Number);
    if (av[0] === ag[0] && av[1] >= ag[1]) return gradle;
  }
  return "8.7";
}

// ── Cartographie complète du ZIP ──────────────────────────────────────────────

async function buildProjectMap(zip, paths, root) {
  const map = {
    root,
    kotlinFiles: [],
    javaFiles: [],
    manifests: [],
    gradleFiles: [],
    resourceFiles: [],
    wrapperJar: false,
    gradlew: false,
    packages: new Set(),
    agpVersion: null,
    gradleVersion: null,
    usesKotlinDsl: false,
    modules: new Map(),  // modulePath → {hasManifest, hasBuildGradle, files}
  };

  for (const p of paths) {
    const rel = root ? p.slice(root.length) : p;
    const name = rel.split("/").pop();
    const entry = zip.file(p);
    if (!entry || entry.dir) continue;

    // Code source
    if (p.endsWith(".kt")) { map.kotlinFiles.push({ path: p, rel }); }
    if (p.endsWith(".java")) { map.javaFiles.push({ path: p, rel }); }

    // Manifest
    if (name === "AndroidManifest.xml") { map.manifests.push({ path: p, rel }); }

    // Gradle
    if (["build.gradle","build.gradle.kts","settings.gradle","settings.gradle.kts",
         "gradle.properties","gradlew","gradlew.bat","gradle-wrapper.properties",
         "libs.versions.toml"].includes(name) || p.endsWith(".gradle") || p.endsWith(".gradle.kts")) {
      map.gradleFiles.push({ path: p, rel, name });
      if (name === "gradlew") map.gradlew = true;
      if (name.endsWith(".kts")) map.usesKotlinDsl = true;
    }
    if (name === "gradle-wrapper.jar") { map.wrapperJar = true; }

    // Ressources
    const parts = rel.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      if (isResourceDir(parts[i])) { map.resourceFiles.push({ path: p, rel }); break; }
    }
  }

  // Lecture des packages des sources
  for (const f of [...map.kotlinFiles, ...map.javaFiles].slice(0, 50)) {
    const content = await readFileText(zip.file(f.path));
    const pkg = extractPackage(content);
    if (pkg) map.packages.add(pkg);
  }

  // Lecture AGP depuis Gradle
  for (const f of map.gradleFiles) {
    const content = await readFileText(zip.file(f.path));
    const agp = detectAgpVersion(content);
    if (agp) map.agpVersion = agp;
    const gm = content.match(/gradle-(\d+\.\d+[\.\d]*)-/);
    if (gm) map.gradleVersion = gm[1];
  }

  return map;
}

// ── Plan de reconstruction ────────────────────────────────────────────────────

async function buildRepairPlan(zip, paths, root) {
  // Double-check racine imbriquée
  const realRoot = detectNestedRoot(paths, root);

  const map = await buildProjectMap(zip, paths, realRoot);
  const plan = {
    map,
    realRoot,
    toMove: [],       // { fromPath, toRel, reason, category }
    toCreate: [],     // { toRel, content, reason, category }
    missingCritical: [],
    warnings: [],
    packages: [...map.packages],
    mainPackage: null,
    moduleName: "app",
    lang: map.kotlinFiles.length > 0 ? "kotlin" : "java",
  };

  // Déterminer le package principal
  plan.mainPackage = [...map.packages][0] || null;

  // ── Détecter le module principal ─────────────────────────────────────────
  let moduleRoot = null;
  for (const f of [...map.kotlinFiles, ...map.javaFiles]) {
    const rel = f.rel;
    for (const marker of ["src/main/kotlin/","src/main/java/","src/debug/kotlin/","src/debug/java/"]) {
      const idx = rel.indexOf(marker);
      if (idx !== -1) {
        moduleRoot = rel.slice(0, idx).replace(/\/$/, "") || "app";
        plan.moduleName = moduleRoot;
        break;
      }
    }
    if (moduleRoot !== null) break;
  }

  // Pas de structure src/main → sources mal placées
  const hasProperSources = map.kotlinFiles.some(f => f.rel.includes("src/main/"))
                        || map.javaFiles.some(f => f.rel.includes("src/main/"));

  if (!hasProperSources && (map.kotlinFiles.length > 0 || map.javaFiles.length > 0)) {
    // Recréer l'arborescence pour chaque fichier source
    for (const f of [...map.kotlinFiles, ...map.javaFiles]) {
      const lang = f.path.endsWith(".kt") ? "kotlin" : "java";
      const content = await readFileText(zip.file(f.path));
      const pkg = extractPackage(content) || plan.mainPackage || "com.example.app";
      const fname = f.rel.split("/").pop();
      const subdir = lang === "kotlin" ? "kotlin" : "java";
      const toRel = `app/src/main/${subdir}/${packageToPath(pkg)}/${fname}`;
      if (f.rel !== toRel) {
        plan.toMove.push({
          fromPath: f.path,
          toRel,
          reason: `Source hors de src/main — package: ${pkg}`,
          category: "SOURCE",
        });
      }
      if (!plan.mainPackage) plan.mainPackage = pkg;
    }
    plan.moduleName = "app";
    moduleRoot = "app";
  }

  const mod = plan.moduleName || "app";

  // ── Manifest ─────────────────────────────────────────────────────────────
  const correctManifest = map.manifests.find(m => m.rel.includes("src/main/AndroidManifest.xml"));
  if (!correctManifest && map.manifests.length > 0) {
    // Déplacer le premier manifest trouvé
    const best = map.manifests.find(m => !m.rel.includes("src/debug") && !m.rel.includes("src/release"))
              || map.manifests[0];
    const toRel = `${mod}/src/main/AndroidManifest.xml`;
    plan.toMove.push({
      fromPath: best.path,
      toRel,
      reason: "AndroidManifest.xml hors de src/main/",
      category: "MANIFEST",
    });
  } else if (!correctManifest && map.manifests.length === 0) {
    plan.toCreate.push({
      toRel: `${mod}/src/main/AndroidManifest.xml`,
      content: null,  // sera généré avec les infos détectées
      reason: "AndroidManifest.xml absent — à générer",
      category: "MANIFEST",
    });
  }

  // ── Ressources mal placées ────────────────────────────────────────────────
  for (const f of map.resourceFiles) {
    if (f.rel.includes("src/main/res/")) continue;
    const parts = f.rel.split("/");
    let resIdx = -1;
    for (let i = 0; i < parts.length - 1; i++) {
      if (isResourceDir(parts[i])) { resIdx = i; break; }
    }
    if (resIdx !== -1) {
      const toRel = `${mod}/src/main/res/` + parts.slice(resIdx).join("/");
      plan.toMove.push({
        fromPath: f.path,
        toRel,
        reason: `Ressource hors de src/main/res/`,
        category: "RESOURCE",
      });
    }
  }

  // ── Gradle manquants ──────────────────────────────────────────────────────
  const hasRootBuild = map.gradleFiles.some(f => f.rel === "build.gradle" || f.rel === "build.gradle.kts");
  const hasSettings  = map.gradleFiles.some(f => f.rel === "settings.gradle" || f.rel === "settings.gradle.kts");
  const hasAppBuild  = map.gradleFiles.some(f =>
    f.rel === `${mod}/build.gradle` || f.rel === `${mod}/build.gradle.kts`
    || (f.rel.split("/").length === 2 && (f.name === "build.gradle" || f.name === "build.gradle.kts"))
  );
  const hasGradleProps  = map.gradleFiles.some(f => f.name === "gradle.properties");
  const hasWrapperProps = map.gradleFiles.some(f => f.name === "gradle-wrapper.properties");

  const agp = map.agpVersion || "8.4.0";
  const gradleVer = map.gradleVersion || compatibleGradle(agp);
  const kts = map.usesKotlinDsl;
  const lang = plan.lang;
  const pkg = plan.mainPackage || "com.example.app";

  if (!hasRootBuild) {
    plan.toCreate.push({ toRel: kts ? "build.gradle.kts" : "build.gradle",
      content: genRootBuildGradle(agp, lang, kts), reason: "build.gradle racine absent", category: "GRADLE" });
  }
  if (!hasSettings) {
    plan.toCreate.push({ toRel: kts ? "settings.gradle.kts" : "settings.gradle",
      content: genSettingsGradle(mod, kts), reason: "settings.gradle absent", category: "GRADLE" });
  }
  if (!hasAppBuild) {
    plan.toCreate.push({ toRel: `${mod}/${kts ? "build.gradle.kts" : "build.gradle"}`,
      content: genAppBuildGradle(pkg, lang, agp, kts), reason: "build.gradle module absent", category: "GRADLE" });
  }
  if (!hasGradleProps) {
    plan.toCreate.push({ toRel: "gradle.properties",
      content: DEFAULT_GRADLE_PROPERTIES, reason: "gradle.properties absent", category: "GRADLE" });
  }
  if (!hasWrapperProps) {
    plan.toCreate.push({ toRel: "gradle/wrapper/gradle-wrapper.properties",
      content: genWrapperProperties(gradleVer), reason: "wrapper absent", category: "WRAPPER" });
  }
  if (!map.gradlew) {
    plan.warnings.push("gradlew / gradle-wrapper.jar : régénérés automatiquement par le CI");
  }

  // ── Source code absent → bloquant ────────────────────────────────────────
  if (map.kotlinFiles.length === 0 && map.javaFiles.length === 0) {
    plan.missingCritical.push("Aucun code source Android trouvé (.kt ou .java). Impossible de reconstruire.");
  }

  return plan;
}

// ── Application du plan (modification du ZIP) ─────────────────────────────────

async function applyRepairPlan(zip, plan) {
  const applied = { moved: 0, created: 0 };

  // Déplacer les fichiers
  for (const op of plan.toMove) {
    const entry = zip.file(op.fromPath);
    if (!entry) continue;
    const content = await entry.async("arraybuffer");
    zip.file(op.toRel, content);
    zip.remove(op.fromPath);
    applied.moved++;
  }

  // Créer les fichiers manquants
  for (const op of plan.toCreate) {
    let content = op.content;

    // Manifest : générer avec les infos détectées
    if (op.category === "MANIFEST" && !content) {
      const launcherActs = await detectLauncherActivities(zip, plan);
      content = genManifest(plan.mainPackage || "com.example.app", launcherActs[0] || null);
    }

    if (!zip.file(op.toRel)) {
      zip.file(op.toRel, content);
      applied.created++;
    }
  }

  return applied;
}

async function detectLauncherActivities(zip, plan) {
  const results = [];
  const sources = [...plan.map.kotlinFiles, ...plan.map.javaFiles].slice(0, 60);
  for (const f of sources) {
    const entry = zip.file(f.toRel || f.path);
    if (!entry) continue;
    const text = await readFileText(entry);
    const isKt = f.path.endsWith(".kt");
    const classRe = isKt
      ? /class\s+(\w+)\s*(?::|extends)\s*\w*Activity/
      : /class\s+(\w+)\s+extends\s+\w*Activity/;
    const m = text.match(classRe);
    if (m) {
      const pkgM = text.match(/package\s+([\w.]+)/);
      results.push({ className: m[1], packageName: pkgM ? pkgM[1] : plan.mainPackage });
    }
  }
  return results;
}

// ============================================================
// Handlers ZIP
// ============================================================

async function handleZip(file) {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    showAnalysisPanel({ critical: ["Le fichier doit être une archive .zip"], plan: null });
    return;
  }

  // Reset UI
  $("analysisPanel").classList.remove("hidden");
  $("projectCard").classList.add("hidden");
  $("resultCard").classList.add("hidden");
  $("errorCard").classList.add("hidden");
  $("progressCard").classList.add("hidden");

  setAnalysisStatus("loading", "Lecture du ZIP en cours…");

  const buffer = await file.arrayBuffer();
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    showAnalysisPanel({ critical: ["ZIP invalide ou corrompu."], plan: null });
    return;
  }

  const paths = Object.keys(zip.files);
  const root  = detectRootPrefix(paths);

  setAnalysisStatus("loading", "Analyse de la structure…");
  const plan = await buildRepairPlan(zip, paths, root);

  state.currentZip      = zip;
  state.currentZipBytes = buffer;
  state.currentZipName  = file.name;
  state.repairPlan      = plan;

  showAnalysisPanel({ critical: plan.missingCritical, plan });

  if (plan.missingCritical.length === 0) {
    renderProjectCard(zip, paths, plan, file);
  }
}

// ============================================================
// UI : Panneau d'analyse
// ============================================================

function setAnalysisStatus(kind, msg) {
  const el = $("analysisStatus");
  el.className = "analysis-status " + kind;
  el.textContent = msg;
}

function showAnalysisPanel({ critical, plan }) {
  const panel = $("analysisPanel");
  panel.classList.remove("hidden");

  if (critical && critical.length > 0) {
    setAnalysisStatus("error", "✕ Projet invalide");
    $("analysisCritical").innerHTML =
      critical.map((m) => `<li>${escapeHtml(m)}</li>`).join("");
    $("analysisCriticalSection").classList.remove("hidden");
    $("analysisRepairSection").classList.add("hidden");
    $("analysisScoreSection").classList.add("hidden");
    return;
  }

  $("analysisCriticalSection").classList.add("hidden");

  if (!plan) return;

  const map = plan.map;
  const allSources = map.kotlinFiles.length + map.javaFiles.length;
  const misplaced  = plan.toMove.length;
  const missing    = plan.toCreate.length;

  // Score de préparation
  const checks = {
    "Code source":         allSources > 0,
    "Manifest":            map.manifests.some(m => m.rel.includes("src/main/")),
    "build.gradle":        map.gradleFiles.some(f => f.rel === "build.gradle" || f.rel === "build.gradle.kts"),
    "settings.gradle":     map.gradleFiles.some(f => f.name.includes("settings")),
    "gradle.properties":   map.gradleFiles.some(f => f.name === "gradle.properties"),
    "Gradle Wrapper":      map.wrapperJar && map.gradlew,
    "Structure correcte":  misplaced === 0,
  };
  const scoreNum = Object.values(checks).filter(Boolean).length;
  const scorePct = Math.round(scoreNum / Object.keys(checks).length * 100);

  $("analysisScoreSection").classList.remove("hidden");
  $("scoreBar").style.width = scorePct + "%";
  $("scorePct").textContent = scorePct + "%";

  const checkHTML = Object.entries(checks).map(([k, v]) =>
    `<div class="check-item ${v ? "ok" : "warn"}">
      <span class="check-icon">${v ? "✓" : "⚠"}</span>
      <span>${k}</span>
    </div>`
  ).join("");
  $("scoreChecks").innerHTML = checkHTML;

  // Résumé stats
  $("statSourceFiles").textContent  = allSources;
  $("statPackages").textContent     = [...map.packages].join(", ") || "—";
  $("statManifests").textContent    = map.manifests.length;
  $("statModules").textContent      = plan.moduleName || "app";
  $("statLang").textContent         = plan.lang === "kotlin" ? "Kotlin" : "Java";
  $("statAgp").textContent          = map.agpVersion || "—";

  // Plan de réparation
  if (misplaced > 0 || missing > 0) {
    $("analysisRepairSection").classList.remove("hidden");
    $("repairSummary").innerHTML = buildRepairSummaryHTML(plan);
    $("autoRepairBtn").onclick = () => autoRepairZip();
  } else {
    $("analysisRepairSection").classList.add("hidden");
  }

  if (plan.warnings.length > 0) {
    $("analysisWarnings").innerHTML = plan.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("");
    $("analysisWarningsSection").classList.remove("hidden");
  } else {
    $("analysisWarningsSection").classList.add("hidden");
  }

  setAnalysisStatus("ok", `✓ ${allSources} fichiers source détectés — ${misplaced} à déplacer, ${missing} à créer`);
}

function buildRepairSummaryHTML(plan) {
  let html = "";
  if (plan.toMove.length > 0) {
    html += `<p class="repair-group-title">📁 Fichiers à déplacer (${plan.toMove.length}) :</p><ul>`;
    for (const op of plan.toMove.slice(0, 15)) {
      html += `<li><code>${escapeHtml(op.fromPath)}</code> → <code>${escapeHtml(op.toRel)}</code> <span class="hint">${escapeHtml(op.reason)}</span></li>`;
    }
    if (plan.toMove.length > 15) html += `<li class="hint">… et ${plan.toMove.length - 15} autre(s).</li>`;
    html += "</ul>";
  }
  if (plan.toCreate.length > 0) {
    html += `<p class="repair-group-title">📄 Fichiers à générer (${plan.toCreate.length}) :</p><ul>`;
    for (const op of plan.toCreate) {
      html += `<li><code>${escapeHtml(op.toRel)}</code> <span class="hint">${escapeHtml(op.reason)}</span></li>`;
    }
    html += "</ul>";
  }
  return html;
}

async function autoRepairZip() {
  if (!state.currentZip || !state.repairPlan) return;
  setAnalysisStatus("loading", "Reconstruction en cours…");
  $("autoRepairBtn").disabled = true;

  try {
    const applied = await applyRepairPlan(state.currentZip, state.repairPlan);
    const newBuffer = await state.currentZip.generateAsync({ type: "arraybuffer" });
    state.currentZipBytes = newBuffer;

    // Re-analyser
    const newPaths = Object.keys(state.currentZip.files);
    const newRoot  = detectRootPrefix(newPaths);
    const newPlan  = await buildRepairPlan(state.currentZip, newPaths, newRoot);
    state.repairPlan = newPlan;

    toast(`Reconstruction : ${applied.moved} déplacé(s), ${applied.created} créé(s).`, "success");
    showAnalysisPanel({ critical: newPlan.missingCritical, plan: newPlan });

    if (newPlan.missingCritical.length === 0) {
      renderProjectCard(state.currentZip, newPaths, newPlan, null);
    }
  } catch (err) {
    toast("Erreur lors de la reconstruction : " + err.message, "error");
    $("autoRepairBtn").disabled = false;
  }
}

// ============================================================
// Carte projet
// ============================================================

async function renderProjectCard(zip, paths, plan, file) {
  const map = plan.map;

  // Données du manifest
  let pkg = plan.mainPackage || "—";
  let versionName = "—", minSdk = "—", targetSdk = "—";

  const mainManifest = map.manifests.find(m => m.rel.includes("src/main/")) || map.manifests[0];
  if (mainManifest) {
    try {
      const xmlText = await readFileText(zip.file(mainManifest.path));
      const doc = new DOMParser().parseFromString(xmlText, "text/xml");
      const el = doc.querySelector("manifest");
      if (el) {
        pkg = el.getAttribute("package") || pkg;
        versionName = el.getAttribute("android:versionName") || "—";
      }
      const sdk = doc.querySelector("uses-sdk");
      if (sdk) {
        minSdk    = sdk.getAttribute("android:minSdkVersion") || "—";
        targetSdk = sdk.getAttribute("android:targetSdkVersion") || "—";
      }
    } catch {}
  }

  const totalFiles = paths.length;
  const fileSize   = file ? file.size : state.currentZipBytes.byteLength;

  state.currentProject = { pkg, versionName, minSdk, targetSdk };

  $("pcName").textContent      = state.currentZipName || (file && file.name) || "—";
  $("pcSize").textContent      = formatBytes(fileSize);
  $("pcFiles").textContent     = totalFiles;
  $("pcPackage").textContent   = pkg;
  $("pcVersion").textContent   = versionName;
  $("pcSdkMin").textContent    = minSdk;
  $("pcSdkTarget").textContent = targetSdk;
  $("pcLang").textContent      = plan.lang === "kotlin" ? "Kotlin" : "Java";
  $("pcModule").textContent    = plan.moduleName || "app";
  $("pcAgp").textContent       = map.agpVersion || "détecté CI";

  $("projectCard").classList.remove("hidden");
  $("resultCard").classList.add("hidden");
  $("errorCard").classList.add("hidden");
  $("progressCard").classList.add("hidden");
}

// ============================================================
// Génération de fichiers
// ============================================================

const DEFAULT_GRADLE_PROPERTIES = `android.useAndroidX=true
android.nonTransitiveRClass=true
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
org.gradle.configuration-cache=false
`;

function genWrapperProperties(gradleVer) {
  return `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${gradleVer}-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
}

function genManifest(pkg, actInfo) {
  let actBlock = "";
  if (actInfo) {
    let name = actInfo.className;
    if (actInfo.packageName && name && !name.startsWith(".") && actInfo.packageName !== pkg) {
      name = actInfo.packageName + "." + name;
    } else if (!name.includes(".")) {
      name = "." + name;
    }
    actBlock = `        <activity
            android:name="${name}"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>\n`;
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${pkg}">

    <application
        android:allowBackup="true"
        android:label="Application"
        android:supportsRtl="true">
${actBlock}    </application>

</manifest>
`;
}

function genRootBuildGradle(agp, lang, kts) {
  agp = agp || "8.4.0";
  const kv = "1.9.24";
  if (kts) {
    const kl = lang === "kotlin" ? `\n    id("org.jetbrains.kotlin.android") version "${kv}" apply false` : "";
    return `plugins {\n    id("com.android.application") version "${agp}" apply false${kl}\n}\n`;
  }
  const kl = lang === "kotlin" ? `\n    id 'org.jetbrains.kotlin.android' version '${kv}' apply false` : "";
  return `plugins {\n    id 'com.android.application' version '${agp}' apply false${kl}\n}\n`;
}

function genSettingsGradle(mod, kts) {
  const repos = `pluginManagement {
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
`;
  if (kts) return repos + `include(":${mod}")\n`;
  return repos + `include ':${mod}'\n`;
}

function genAppBuildGradle(pkg, lang, agp, kts) {
  pkg = pkg || "com.example.app";
  const java = "17";
  if (kts) {
    const kp = lang === "kotlin" ? `\n    id("org.jetbrains.kotlin.android")` : "";
    const ko = lang === "kotlin" ? `\n    kotlinOptions { jvmTarget = "${java}" }` : "";
    return `plugins {\n    id("com.android.application")${kp}\n}\n\nandroid {\n    namespace = "${pkg}"\n    compileSdk = 35\n\n    defaultConfig {\n        applicationId = "${pkg}"\n        minSdk = 24\n        targetSdk = 35\n        versionCode = 1\n        versionName = "1.0"\n    }\n\n    buildTypes {\n        release { isMinifyEnabled = false }\n    }\n\n    compileOptions {\n        sourceCompatibility = JavaVersion.VERSION_${java}\n        targetCompatibility = JavaVersion.VERSION_${java}\n    }${ko}\n}\n\ndependencies {\n    implementation("androidx.core:core-ktx:1.13.1")\n    implementation("androidx.appcompat:appcompat:1.7.0")\n    implementation("com.google.android.material:material:1.12.0")\n}\n`;
  }
  const kp = lang === "kotlin" ? `\n    id 'org.jetbrains.kotlin.android'` : "";
  const ko = lang === "kotlin" ? `\n    kotlinOptions { jvmTarget = '${java}' }` : "";
  return `plugins {\n    id 'com.android.application'${kp}\n}\n\nandroid {\n    namespace '${pkg}'\n    compileSdk 35\n\n    defaultConfig {\n        applicationId '${pkg}'\n        minSdk 24\n        targetSdk 35\n        versionCode 1\n        versionName '1.0'\n    }\n\n    buildTypes {\n        release { minifyEnabled false }\n    }\n\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_${java}\n        targetCompatibility JavaVersion.VERSION_${java}\n    }${ko}\n}\n\ndependencies {\n    implementation 'androidx.core:core-ktx:1.13.1'\n    implementation 'androidx.appcompat:appcompat:1.7.0'\n    implementation 'com.google.android.material:material:1.12.0'\n}\n`;
}

// ============================================================
// Compilation
// ============================================================

$("compileBtn").addEventListener("click", startCompilation);

async function startCompilation() {
  if (!state.token) { toast("Connecte-toi à GitHub avant de compiler.", "error"); return; }
  if (!state.currentZip) { toast("Importe d'abord un projet.", "error"); return; }
  if (state.repairPlan && state.repairPlan.missingCritical.length > 0) {
    toast("Le projet est invalide — code source manquant.", "error"); return;
  }

  $("projectCard").classList.add("hidden");
  $("resultCard").classList.add("hidden");
  $("errorCard").classList.add("hidden");
  $("progressCard").classList.remove("hidden");
  $("analysisPanel").classList.add("hidden");
  resetSteps();
  setStep("prepare", "active");
  state.startedAt = Date.now();
  state.currentJobId = null;
  state.currentFailedStep = null;
  log("Préparation de l'envoi vers GitHub…");

  try {
    const owner = state.githubOwner;
    const repo  = state.githubRepo;
    const branch = CFG.GITHUB_BUILD_BRANCH;

    const baseSha = await ensureBuildBranch(owner, repo, branch);

    log("Envoi de l'archive du projet…");
    const zipBase64    = arrayBufferToBase64(state.currentZipBytes);
    const blobSha      = await createBlob(owner, repo, zipBase64, "base64");
    const buildConfig  = collectBuildConfig();
    const configBlobSha = await createBlob(owner, repo, JSON.stringify(buildConfig, null, 2), "utf-8");

    const baseCommit = await ghJson(`/repos/${owner}/${repo}/git/commits/${baseSha}`);
    const treeSha    = await createTree(owner, repo, baseCommit.tree.sha, [
      { path: "builds/incoming.zip",      mode: "100644", type: "blob", sha: blobSha },
      { path: "builds/build-config.json", mode: "100644", type: "blob", sha: configBlobSha },
    ]);

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
    buildType:   $("buildType").value || "debug",
    apkName:     $("apkName").value || state.currentZipName.replace(/\.zip$/i, ""),
    appName:     $("appName").value || "",
    versionName: $("versionName").value || "",
    versionCode: $("versionCode").value || "",
    orientation: $("orientation").value || "auto",
  };
}

// ── Git Data API ──────────────────────────────────────────────────────────────

async function ensureBuildBranch(owner, repo, branch) {
  try {
    const ref = await ghJson(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    return ref.object.sha;
  } catch {
    const repoInfo = await ghJson(`/repos/${owner}/${repo}`);
    const def = repoInfo.default_branch;
    const defRef = await ghJson(`/repos/${owner}/${repo}/git/ref/heads/${def}`);
    await ghJson(`/repos/${owner}/${repo}/git/refs`, "POST", {
      ref: `refs/heads/${branch}`, sha: defRef.object.sha,
    });
    return defRef.object.sha;
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erreur API GitHub (${res.status})`);
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
// Suivi du workflow
// ============================================================

async function waitForRunAndPoll(owner, repo, commitSha) {
  log("Recherche du run associé au commit " + commitSha.slice(0, 7) + "…");
  let run = null;
  for (let i = 0; i < 24 && !run; i++) {
    await sleep(3000);
    const runs = await ghJson(`/repos/${owner}/${repo}/actions/runs?head_sha=${commitSha}&per_page=5`);
    if (runs.workflow_runs && runs.workflow_runs.length > 0) run = runs.workflow_runs[0];
  }
  if (!run) {
    showError("Le workflow n'a pas démarré",
      "Vérifie que .github/workflows/build.yml est sur la branche '" + CFG.GITHUB_BUILD_BRANCH + "'.");
    return;
  }
  log(`Run #${run.run_number} démarré.`);

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
    } catch {}
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
  let title   = `Échec à l'étape « ${stepName} »`;
  let message = `Conclusion du workflow : ${run.conclusion}.`;
  let logsTail = "";
  try {
    if (state.currentJobId) {
      logsTail = await fetchJobLogTail(owner, repo, state.currentJobId, 100);
    }
  } catch (e) {
    logsTail = "Logs inaccessibles : " + e.message + "\nVoir : " + run.html_url;
  }
  if (/Aucun code source Android/i.test(logsTail))
    message = "Aucun code source Android trouvé dans le ZIP.";
  else if (/could not resolve|could not find|failed to resolve/i.test(logsTail))
    message = "Gradle n'a pas pu résoudre une dépendance.";
  else if (/jlink|core-for-system-modules/i.test(logsTail))
    message = "Incompatibilité Java / Android Gradle Plugin.";
  else if (/SDK location not found|licenses have not been accepted/i.test(logsTail))
    message = "Problème de configuration du SDK Android sur le runner.";

  showError(title, message + ` Run : ${run.html_url}`, logsTail);
}

async function fetchJobLogTail(owner, repo, jobId, maxLines) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, {
    headers: ghHeaders(),
  });
  if (!res.ok) throw new Error(`Logs indisponibles (${res.status})`);
  const text  = await res.text();
  const lines = text.split("\n");
  const errorPattern = /^e:\s|: error:|FAILURE:|What went wrong|Execution failed for/i;
  const errorLines = lines.filter((l) => errorPattern.test(l));
  const tail = lines.slice(-maxLines);
  if (errorLines.length > 0) {
    return "── Erreurs ──\n" + errorLines.slice(0, 60).join("\n") + "\n\n── Fin du log ──\n" + tail.join("\n");
  }
  return tail.join("\n");
}

async function handleSuccess(owner, repo, runId) {
  log("Compilation réussie. Récupération de l'APK…");
  const artifacts = await ghJson(`/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`);
  const artifact  = artifacts.artifacts && artifacts.artifacts[0];
  if (!artifact) { showError("Aucun artefact", "Le workflow a réussi mais n'a pas publié d'APK."); return; }

  $("progressBarInner").style.width = "100%";
  $("progressPercent").textContent  = "100%";

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
  $("resName").textContent    = record.name;
  $("resSize").textContent    = formatBytes(record.sizeBytes);
  $("resVersion").textContent = record.version;
  $("resDate").textContent    = new Date(record.date).toLocaleString("fr-FR");
  $("resultCard").classList.remove("hidden");

  $("downloadBtn").onclick = () => downloadArtifact(record.downloadUrl, record.name);
}

async function downloadArtifact(url, name) {
  try {
    toast("Téléchargement de l'APK…");
    const res = await fetch(url, { headers: ghHeaders() });
    if (!res.ok) throw new Error("Téléchargement impossible (" + res.status + ")");
    const blob = await res.blob();
    const innerZip = await JSZip.loadAsync(blob);
    const apkEntry = Object.values(innerZip.files).find((f) => f.name.toLowerCase().endsWith(".apk"));
    if (!apkEntry) throw new Error("Aucun .apk dans l'artefact.");
    const apkBlob = await apkEntry.async("blob");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(apkBlob);
    a.download = (name || "app") + ".apk";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    toast("Erreur téléchargement : " + err.message, "error");
  }
}

// ============================================================
// Steps / logs / erreurs
// ============================================================
function resetSteps() {
  document.querySelectorAll("#stepsList li").forEach((li) => li.classList.remove("active", "done", "error"));
  $("progressBarInner").style.width = "0%";
  $("progressPercent").textContent  = "0%";
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
// ============================================================
// Système de diagnostic d'erreur avancé
// ============================================================

const ERROR_PATTERNS = [
  {
    id: "no_source",
    pattern: /Aucun code source Android|no source.*android|no.*\.kt.*\.java/i,
    cat: "manifest",
    catLabel: "Source",
    title: "Aucun code source Android",
    detail: "Le ZIP ne contient aucun fichier .kt ou .java. Sans code source, rien ne peut être compilé.",
    suggestions: [
      "Vérifiez que votre ZIP contient bien les fichiers .kt ou .java de votre application.",
      "Si vous avez exporté depuis Android Studio, utilisez File → Export → Export to ZIP.",
    ],
  },
  {
    id: "unresolved_ref",
    pattern: /Unresolved reference|cannot find symbol/i,
    cat: "import",
    catLabel: "Import",
    title: "Référence non résolue",
    detail: "Un ou plusieurs imports sont manquants dans le code source. Le correcteur automatique a tenté de les ajouter.",
    suggestions: [
      "Vérifiez les dépendances dans build.gradle (ex: androidx.compose.*, androidx.room.*).",
      "Si le correcteur n'a pas résolu l'erreur, ajoutez manuellement les imports manquants.",
    ],
  },
  {
    id: "dep_not_found",
    pattern: /Could not find|Could not resolve|Failed to resolve/i,
    cat: "dep",
    catLabel: "Dépendance",
    title: "Dépendance introuvable",
    detail: "Gradle n'a pas pu télécharger une dépendance déclarée dans build.gradle.",
    suggestions: [
      "Vérifiez que les repositories google() et mavenCentral() sont déclarés dans settings.gradle.",
      "Vérifiez que les versions des bibliothèques existent (ex: une version trop récente ou inexistante).",
      "Certaines dépendances nécessitent d'être connecté à un dépôt privé (Artifactory, etc.).",
    ],
  },
  {
    id: "manifest_exported",
    pattern: /android:exported.*must be explicitly|Manifest merger failed/i,
    cat: "manifest",
    catLabel: "Manifest",
    title: "android:exported manquant",
    detail: "Les activités avec un <intent-filter> doivent déclarer android:exported=\"true\" depuis Android 12 (API 31).",
    suggestions: [
      "Le correcteur automatique a tenté d'ajouter android:exported dans AndroidManifest.xml.",
      "Si l'erreur persiste, ouvrez AndroidManifest.xml et ajoutez android:exported=\"true\" manuellement.",
    ],
  },
  {
    id: "namespace_missing",
    pattern: /Namespace not specified|set the 'android.namespace'/i,
    cat: "gradle",
    catLabel: "Gradle",
    title: "Namespace manquant dans build.gradle",
    detail: "L'Android Gradle Plugin 8+ exige un champ namespace dans le bloc android {}.",
    suggestions: [
      "Le correcteur automatique a tenté d'ajouter namespace 'com.votre.package' dans build.gradle.",
      "Vérifiez que le namespace correspond bien à votre package principal.",
    ],
  },
  {
    id: "java_version",
    pattern: /jlink|core-for-system-modules|incompatible types.*java|Unsupported class file major version/i,
    cat: "java",
    catLabel: "Java",
    title: "Incompatibilité Java / AGP",
    detail: "La version de Java configurée dans le projet est incompatible avec l'Android Gradle Plugin utilisé.",
    suggestions: [
      "Le correcteur a tenté de mettre jvmTarget et sourceCompatibility à 17.",
      "Vérifiez que compileSdk est cohérent avec la version de l'AGP.",
      "AGP 7.x → Java 11, AGP 8.x → Java 17.",
    ],
  },
  {
    id: "duplicate_class",
    pattern: /Duplicate class/i,
    cat: "dep",
    catLabel: "Doublon",
    title: "Classe dupliquée",
    detail: "Deux dépendances fournissent la même classe, ce qui crée un conflit.",
    suggestions: [
      "Utilisez une BOM (Bill of Materials) pour aligner les versions (ex: Firebase BOM, Compose BOM).",
      "Excluez explicitement le module en doublon via exclude group: dans build.gradle.",
    ],
  },
  {
    id: "aapt_error",
    pattern: /AAPT.*error|error.*AAPT|Resource.*not found|failed.*aapt/i,
    cat: "manifest",
    catLabel: "Ressource",
    title: "Erreur de ressource Android (AAPT)",
    detail: "Une ressource XML est introuvable, mal nommée, ou contient une erreur de syntaxe.",
    suggestions: [
      "Vérifiez que les noms de ressources n'ont pas de majuscules (Android impose le snake_case).",
      "Vérifiez que toutes les ressources référencées dans le code existent bien dans res/.",
    ],
  },
  {
    id: "sdk_missing",
    pattern: /SDK location not found|licenses have not been accepted|ANDROID_HOME/i,
    cat: "gradle",
    catLabel: "SDK",
    title: "SDK Android manquant sur le runner",
    detail: "Le runner GitHub Actions n'a pas trouvé le SDK Android ou ses licences.",
    suggestions: [
      "Vérifiez que le workflow utilise actions/setup-java et que ANDROID_HOME est correctement défini.",
      "Ce problème est généralement transitoire — réessayez la compilation.",
    ],
  },
  {
    id: "network_error",
    pattern: /Connection reset|Read timed out|Could not GET|Remote host closed/i,
    cat: "dep",
    catLabel: "Réseau",
    title: "Erreur réseau transitoire",
    detail: "Un téléchargement de dépendance a échoué à cause d'un problème réseau sur le runner.",
    suggestions: [
      "Ce type d'erreur est généralement temporaire. Réessayez simplement la compilation.",
    ],
  },
  {
    id: "no_apk",
    pattern: /Compilation réussie mais aucune APK|no APK found/i,
    cat: "gradle",
    catLabel: "APK",
    title: "Compilation réussie mais APK introuvable",
    detail: "Gradle a compilé sans erreur mais l'APK n'est pas au chemin attendu.",
    suggestions: [
      "Vérifiez que le module principal s'appelle bien 'app' ou que le chemin de sortie est correct.",
      "Certains projets configurent un outputDir personnalisé dans build.gradle — vérifiez ce paramètre.",
    ],
  },
];

function buildDiagnostic(logText) {
  const matched = [];
  for (const p of ERROR_PATTERNS) {
    if (p.pattern.test(logText)) matched.push(p);
  }
  return matched;
}

function renderDiagnostic(diagnostics, suggestions) {
  if (!diagnostics || diagnostics.length === 0) {
    $("errorDiagnostic").classList.add("hidden");
    $("errorSuggestions").classList.add("hidden");
    return;
  }

  // Diagnostic
  $("errorDiagnostic").classList.remove("hidden");
  $("diagnosticContent").innerHTML = diagnostics.map((d) => `
    <div class="diagnostic-item">
      <span class="di-cat ${d.cat}">${d.catLabel}</span>
      <div>
        <div style="font-weight:600;color:var(--white);margin-bottom:2px;">${escapeHtml(d.title)}</div>
        <div>${escapeHtml(d.detail)}</div>
      </div>
    </div>
  `).join("");

  // Suggestions
  const allSuggestions = [
    ...new Set(diagnostics.flatMap((d) => d.suggestions || [])),
    ...(suggestions || []),
  ];
  if (allSuggestions.length > 0) {
    $("errorSuggestions").classList.remove("hidden");
    $("suggestionsList").innerHTML = allSuggestions
      .map((s) => `<li>${escapeHtml(s)}</li>`)
      .join("");
  } else {
    $("errorSuggestions").classList.add("hidden");
  }
}

function showError(title, message, preciseLogs) {
  clearInterval(state.pollTimer);
  $("progressCard").classList.add("hidden");
  $("errorTitle").textContent   = title;
  $("errorMessage").textContent = message;
  $("errorLogs").textContent = (preciseLogs ? preciseLogs + "\n\n---\n" : "") + $("logsOutput").textContent;
  $("errorCard").classList.remove("hidden");

  // Diagnostic automatique
  const fullLog = (preciseLogs || "") + $("logsOutput").textContent + " " + message;
  const diagnostics = buildDiagnostic(fullLog);
  renderDiagnostic(diagnostics, []);

  pushHistory({ name: state.currentZipName || "projet", date: new Date().toISOString(), status: "error", message });
}

$("retryBtn").addEventListener("click", () => { $("errorCard").classList.add("hidden"); startCompilation(); });

$("downloadFullLogBtn").addEventListener("click", async () => {
  if (!state.lastFailedRun) { toast("Aucun run associé.", "error"); return; }
  try {
    const { owner, repo, runId } = state.lastFailedRun;
    toast("Récupération du log complet…");
    const artifacts = await ghJson(`/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`);
    const logArtifact = (artifacts.artifacts || []).find((a) => a.name === "gradle-output-log");
    if (!logArtifact) { toast("Log expiré ou indisponible.", "error"); return; }
    const res = await fetch(logArtifact.archive_download_url, { headers: ghHeaders() });
    if (!res.ok) throw new Error("Téléchargement impossible (" + res.status + ")");
    const blob = await res.blob();
    const innerZip = await JSZip.loadAsync(blob);
    const logEntry = Object.values(innerZip.files).find((f) => f.name.endsWith(".log"));
    if (!logEntry) throw new Error("Fichier log introuvable.");
    const text = await logEntry.async("text");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "gradle-output.log";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    toast("Erreur : " + err.message, "error");
  }
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ============================================================
// Historique
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
    list.innerHTML = '<li class="history-empty">Aucune compilation pour le moment.</li>'; return;
  }
  list.innerHTML = state.history.map((h) => `
    <li>
      <strong>${escapeHtml(h.name)}</strong>
      <span class="history-status ${h.status}">${h.status === "success" ? "Réussi" : "Échec"}</span>
      <span class="hint">${new Date(h.date).toLocaleString("fr-FR")}</span>
      ${h.runUrl ? `<a href="${h.runUrl}" target="_blank" rel="noopener" class="hint">Voir le run</a>` : ""}
    </li>
  `).join("");
}

// ============================================================
// Paramètres
// ============================================================
function loadSettingsIntoForm() {
  const s = state.settings;
  $("buildType").value    = s.buildType    || "debug";
  $("apkName").value      = s.apkName      || "";
  $("appName").value      = s.appName      || "";
  $("versionName").value  = s.versionName  || "";
  $("versionCode").value  = s.versionCode  || "";
  $("orientation").value  = s.orientation  || "auto";
  $("cfgOwner").value     = state.githubOwner || "";
  $("cfgRepo").value      = state.githubRepo  || "";
}
loadSettingsIntoForm();

$("saveSettingsBtn").addEventListener("click", () => {
  state.settings = {
    buildType:   $("buildType").value,
    apkName:     $("apkName").value,
    appName:     $("appName").value,
    versionName: $("versionName").value,
    versionCode: $("versionCode").value,
    orientation: $("orientation").value,
  };
  localStorage.setItem("abs_settings", JSON.stringify(state.settings));
  toast("Paramètres enregistrés.", "success");
});

$("saveGithubCfgBtn").addEventListener("click", () => {
  state.githubOwner = $("cfgOwner").value.trim();
  state.githubRepo  = $("cfgRepo").value.trim();
  localStorage.setItem("abs_owner", state.githubOwner);
  localStorage.setItem("abs_repo",  state.githubRepo);
  toast("Connexion au dépôt enregistrée.", "success");
});

// ============================================================
// Utilitaires
// ============================================================
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " o";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko";
  return (bytes / (1024 * 1024)).toFixed(2) + " Mo";
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

renderHistory();
