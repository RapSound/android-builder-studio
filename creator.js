// Android Builder Studio — creator.js
// Constructeur no-code déterministe pour un premier écran Android mobile.
// Aucune IA ni service de génération externe n’est utilisé.

const creatorState = {
  appName: "Mon application",
  packageName: "com.example.monapp",
  accent: "#7c3aed",
  selectedId: null,
  elements: [
    { id: "title-initial", type: "title", text: "Bienvenue", size: 28, align: "center" },
    { id: "text-initial", type: "text", text: "Créez votre première application mobile sans code.", size: 17, align: "center" },
  ],
};

function creatorId() {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function creatorSelected() {
  return creatorState.elements.find((element) => element.id === creatorState.selectedId) || null;
}

function creatorSetStatus(message, kind = "") {
  const status = $("creatorExportStatus");
  status.textContent = message;
  status.className = `creator-export-status ${kind}`;
}

function creatorEscapeXml(value) {
  return String(value || "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", "\"": "&quot;",
  }[char]));
}

function creatorAndroidPackage(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
  const parts = normalized.split(".").filter(Boolean).map((part, index) => {
    const safe = part.replace(/^[^a-z]/, index === 0 ? "com" : "app");
    return safe || (index === 0 ? "com" : "app");
  });
  return parts.length >= 2 ? parts.join(".") : "com.example.monapp";
}

function creatorColor(hex) {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#7c3aed";
}

function renderCreator() {
  const canvas = $("creatorCanvas");
  const phone = $("creatorPhone");
  if (!canvas || !phone) return;
  phone.style.setProperty("--creator-accent", creatorState.accent);
  canvas.innerHTML = "";

  if (creatorState.elements.length === 0) {
    const empty = document.createElement("div");
    empty.className = "creator-empty-canvas";
    empty.textContent = "Votre écran est vide. Ajoutez un titre, un texte ou une image depuis la palette.";
    canvas.appendChild(empty);
  }

  creatorState.elements.forEach((element) => {
    let node;
    if (element.type === "image") {
      node = document.createElement("img");
      node.className = "creator-element creator-image";
      node.src = element.dataUrl;
      node.alt = element.alt || "Image de l’application";
    } else {
      node = document.createElement("div");
      node.className = `creator-element creator-${element.type}`;
      node.textContent = element.text;
      node.style.fontSize = `${element.size || (element.type === "title" ? 26 : 17)}px`;
      node.style.textAlign = element.align || "left";
      if (element.type === "title") node.style.color = creatorState.accent;
    }
    node.dataset.creatorId = element.id;
    if (element.id === creatorState.selectedId) node.classList.add("selected");
    node.addEventListener("click", () => {
      creatorState.selectedId = element.id;
      renderCreator();
      renderCreatorInspector();
    });
    canvas.appendChild(node);
  });
}

function renderCreatorInspector() {
  const selected = creatorSelected();
  const inspector = $("creatorInspector");
  const empty = $("creatorEmptyInspector");
  if (!selected) {
    inspector.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  inspector.classList.remove("hidden");
  empty.classList.add("hidden");
  const isImage = selected.type === "image";
  $("creatorElementText").disabled = isImage;
  $("creatorFontSize").disabled = isImage;
  $("creatorTextAlign").disabled = isImage;
  $("creatorElementText").value = isImage ? "Image importée" : selected.text;
  $("creatorFontSize").value = selected.size || (selected.type === "title" ? 26 : 17);
  $("creatorTextAlign").value = selected.align || "left";
}

function updateCreatorForm() {
  creatorState.appName = $("creatorAppName").value.trim().slice(0, 40) || "Mon application";
  creatorState.packageName = $("creatorPackage").value.trim() || "com.example.monapp";
  creatorState.accent = $("creatorAccent").value || "#7c3aed";
  renderCreator();
}

function addCreatorElement(type, fields = {}) {
  const element = {
    id: creatorId(), type,
    text: fields.text || (type === "title" ? "Nouveau titre" : "Votre texte ici"),
    size: fields.size || (type === "title" ? 27 : 17),
    align: fields.align || "left",
    ...fields,
  };
  creatorState.elements.push(element);
  creatorState.selectedId = element.id;
  renderCreator();
  renderCreatorInspector();
}

function androidProjectDefinition() {
  const packageName = creatorAndroidPackage(creatorState.packageName);
  const packagePath = packageName.replace(/\./g, "/");
  const appName = creatorState.appName || "Mon application";
  const accent = creatorColor(creatorState.accent);
  const images = creatorState.elements.filter((element) => element.type === "image");

  const views = creatorState.elements.map((element, index) => {
    const name = `element${index}`;
    if (element.type === "image") {
      const asset = element.assetName || `image_${index}.png`;
      return `        ImageView ${name} = new ImageView(this);\n        try (InputStream stream = getAssets().open(${JSON.stringify(asset)})) {\n            ${name}.setImageBitmap(BitmapFactory.decodeStream(stream));\n            ${name}.setAdjustViewBounds(true);\n            ${name}.setPadding(0, 12, 0, 12);\n            root.addView(${name}, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));\n        } catch (Exception ignored) { }`;
    }
    const gravity = element.align === "center" ? "Gravity.CENTER_HORIZONTAL" : element.align === "right" ? "Gravity.END" : "Gravity.START";
    const color = element.type === "title" ? `Color.parseColor(${JSON.stringify(accent)})` : "Color.rgb(35, 43, 58)";
    return `        TextView ${name} = new TextView(this);\n        ${name}.setText(${JSON.stringify(element.text || "")});\n        ${name}.setTextSize(${Number(element.size) || (element.type === "title" ? 27 : 17)}f);\n        ${name}.setTextColor(${color});\n        ${name}.setGravity(${gravity});\n        ${name}.setPadding(0, 10, 0, 10);\n        root.addView(${name}, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));`;
  }).join("\n\n") || "        TextView empty = new TextView(this);\n        empty.setText(\"Votre application est prête à être personnalisée.\");\n        root.addView(empty);";

  const safeName = appName.replace(/[^a-z0-9_-]/gi, "-").toLowerCase() || "application";
  const files = {
    "settings.gradle": `pluginManagement {\n    repositories { google(); mavenCentral(); gradlePluginPortal() }\n}\ndependencyResolutionManagement {\n    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)\n    repositories { google(); mavenCentral() }\n}\nrootProject.name = ${JSON.stringify(appName)}\ninclude(\":app\")\n`,
    "build.gradle": "plugins {\n    id 'com.android.application' version '8.4.0' apply false\n}\n",
    "gradle.properties": "android.useAndroidX=true\norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\n",
    "gradle/wrapper/gradle-wrapper.properties": "distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\n",
    "gradlew": "#!/bin/sh\nDIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\nexec java -classpath \"$DIR/gradle/wrapper/gradle-wrapper.jar\" org.gradle.wrapper.GradleWrapperMain \"$@\"\n",
    "gradlew.bat": "@echo off\r\njava -classpath \"%~dp0\\gradle\\wrapper\\gradle-wrapper.jar\" org.gradle.wrapper.GradleWrapperMain %*\r\n",
    "app/build.gradle": `plugins { id 'com.android.application' }\n\nandroid {\n    namespace '${packageName}'\n    compileSdk 34\n\n    defaultConfig {\n        applicationId '${packageName}'\n        minSdk 23\n        targetSdk 34\n        versionCode 1\n        versionName '1.0'\n    }\n}\n`,
    "app/src/main/AndroidManifest.xml": `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:label="${creatorEscapeXml(appName)}" android:theme="@android:style/Theme.Material.Light.NoActionBar">\n        <activity android:name=".MainActivity" android:exported="true">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity>\n    </application>\n</manifest>\n`,
    [`app/src/main/java/${packagePath}/MainActivity.java`]: `package ${packageName};\n\nimport android.app.Activity;\nimport android.graphics.BitmapFactory;\nimport android.graphics.Color;\nimport android.os.Bundle;\nimport android.view.Gravity;\nimport android.widget.ImageView;\nimport android.widget.LinearLayout;\nimport android.widget.ScrollView;\nimport android.widget.TextView;\nimport java.io.InputStream;\n\npublic final class MainActivity extends Activity {\n    @Override public void onCreate(Bundle state) {\n        super.onCreate(state);\n        ScrollView scroll = new ScrollView(this);\n        LinearLayout root = new LinearLayout(this);\n        root.setOrientation(LinearLayout.VERTICAL);\n        root.setPadding(32, 40, 32, 40);\n        root.setBackgroundColor(Color.rgb(248, 250, 252));\n${views}\n        scroll.addView(root);\n        setContentView(scroll);\n    }\n}\n`,
    "README.md": `# ${appName}\n\nProjet Android généré par Android Builder Studio.\n\n## Compilation\n\n\`./gradlew assembleDebug\`\n\nL’APK est produit dans \`app/build/outputs/apk/debug/app-debug.apk\`.\n`,
    "builds/build-config.json": JSON.stringify({ buildType: "debug", apkName: safeName }, null, 2) + "\n",
  };
  return { files, images, packageName, appName, safeName };
}

async function creatorBuildZip() {
  const definition = androidProjectDefinition();
  const zip = new JSZip();
  Object.entries(definition.files).forEach(([path, content]) => zip.file(path, content));
  for (const [index, image] of definition.images.entries()) {
    if (!image.dataUrl) continue;
    const asset = image.assetName || `image_${index}.png`;
    const imageBlob = await (await fetch(image.dataUrl)).blob();
    zip.file(`app/src/main/assets/${asset}`, imageBlob);
  }
  try {
    const wrapper = await fetch("assets/gradle-wrapper.jar");
    if (wrapper.ok) zip.file("gradle/wrapper/gradle-wrapper.jar", await wrapper.blob());
  } catch (_) {
    // Le workflow recrée automatiquement le wrapper si le fichier est absent.
  }
  return { blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }), definition };
}

function creatorDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function initCreator() {
  if (!$("creatorCanvas")) return;
  ["creatorAppName", "creatorPackage", "creatorAccent"].forEach((id) => $(id).addEventListener("input", updateCreatorForm));
  $("creatorAddTitle").addEventListener("click", () => addCreatorElement("title"));
  $("creatorAddText").addEventListener("click", () => addCreatorElement("text"));
  $("creatorImageInput").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      creatorSetStatus("L’image dépasse la limite de 5 Mo.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const extension = (file.name.split(".").pop() || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
      addCreatorElement("image", { dataUrl: reader.result, alt: file.name, assetName: `image_${Date.now()}.${extension}` });
      creatorSetStatus("Image ajoutée à l’écran mobile.", "success");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  });
  $("creatorElementText").addEventListener("input", (event) => {
    const selected = creatorSelected();
    if (!selected || selected.type === "image") return;
    selected.text = event.target.value;
    renderCreator();
  });
  $("creatorFontSize").addEventListener("input", (event) => {
    const selected = creatorSelected();
    if (!selected || selected.type === "image") return;
    selected.size = Number(event.target.value);
    renderCreator();
  });
  $("creatorTextAlign").addEventListener("change", (event) => {
    const selected = creatorSelected();
    if (!selected || selected.type === "image") return;
    selected.align = event.target.value;
    renderCreator();
  });
  $("creatorDeleteElement").addEventListener("click", () => {
    if (!creatorSelected()) return;
    creatorState.elements = creatorState.elements.filter((element) => element.id !== creatorState.selectedId);
    creatorState.selectedId = null;
    renderCreator();
    renderCreatorInspector();
  });
  $("creatorReset").addEventListener("click", () => {
    creatorState.elements = [];
    creatorState.selectedId = null;
    renderCreator();
    renderCreatorInspector();
    creatorSetStatus("Écran réinitialisé.");
  });
  $("creatorDownloadZip").addEventListener("click", async () => {
    try {
      creatorSetStatus("Préparation du projet Android complet…");
      const { blob, definition } = await creatorBuildZip();
      creatorDownload(blob, `${definition.safeName}-android.zip`);
      creatorSetStatus("ZIP Android complet téléchargé.", "success");
    } catch (error) {
      creatorSetStatus(`Export impossible : ${error.message}`, "error");
    }
  });
  $("creatorBuildApk").addEventListener("click", async () => {
    try {
      creatorSetStatus("Préparation du ZIP Android pour la compilation APK…");
      const { blob, definition } = await creatorBuildZip();
      const zipFile = new File([blob], `${definition.safeName}-android.zip`, { type: "application/zip" });
      $("createPanel").classList.add("hidden");
      await handleZip(zipFile);
      creatorSetStatus("Projet envoyé au pipeline APK.", "success");
    } catch (error) {
      creatorSetStatus(`Envoi vers la compilation impossible : ${error.message}`, "error");
    }
  });
  renderCreator();
  renderCreatorInspector();
}

initCreator();
      
