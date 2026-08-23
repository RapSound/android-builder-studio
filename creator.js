// Android Builder Studio — creator.js
// Constructeur no-code déterministe pour une application Android mobile
// multi-écrans avec navigation entre pages.
// Aucune IA ni service de génération externe n’est utilisé.

const creatorState = {
  appName: "Mon application",
  packageName: "com.example.monapp",
  accent: "#7c3aed",
  selectedId: null,
  homePageId: "page-accueil",
  currentPageId: "page-accueil",
  variables: [],
  bottomNav: { enabled: false, tabs: [] },
  pages: [
    {
      id: "page-accueil",
      name: "Accueil",
      elements: [
        { id: "title-initial", type: "title", text: "Bienvenue", size: 28, align: "center" },
        { id: "text-initial", type: "text", text: "Créez votre première application mobile sans code.", size: 17, align: "center" },
      ],
    },
  ],
};

function creatorId() {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function currentPage() {
  return creatorState.pages.find((page) => page.id === creatorState.currentPageId) || creatorState.pages[0];
}

function creatorSelected() {
  const page = currentPage();
  if (!page) return null;
  return page.elements.find((element) => element.id === creatorState.selectedId) || null;
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

function getByPath(obj, path) {
  if (!path) return obj;
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function buildYoutubeUrl(youtube) {
  const params = new URLSearchParams({
    key: youtube.apiKey || "",
    channelId: youtube.channelId || "",
    part: "snippet",
    order: youtube.order || "date",
    maxResults: String(Math.max(1, Math.min(50, Number(youtube.maxResults) || 10))),
    type: "video",
  });
  return `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
}

function updateYoutubeApiConfig(element) {
  if (!element.youtube) return;
  element.api = {
    url: buildYoutubeUrl(element.youtube),
    method: "GET",
    listPath: "items",
    titlePath: "snippet.title",
    subtitlePath: "snippet.description",
    imagePath: "snippet.thumbnails.medium.url",
    limit: Math.max(1, Math.min(50, Number(element.youtube.maxResults) || 10)),
  };
}

// ── Variables ────────────────────────────────────────────────────────────

function creatorSanitizeVarName(value) {
  const clean = String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/^[0-9]+/, "");
  return clean || `variable${creatorState.variables.length + 1}`;
}

function creatorUniqueVarName(base) {
  const names = new Set(creatorState.variables.map((variable) => variable.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base}${index}`)) index += 1;
  return `${base}${index}`;
}

function addCreatorVariable() {
  const name = creatorUniqueVarName(creatorSanitizeVarName(`variable${creatorState.variables.length + 1}`));
  creatorState.variables.push({ id: creatorId(), name, type: "text", defaultValue: "" });
  renderVariablesList();
  renderCreator();
  renderCreatorInspector();
}

function removeCreatorVariable(variableId) {
  const variable = creatorState.variables.find((candidate) => candidate.id === variableId);
  if (!variable) return;
  if (!window.confirm(`Supprimer la variable « ${variable.name} » ? Les actions et conditions qui l’utilisent seront réinitialisées.`)) return;
  creatorState.variables = creatorState.variables.filter((candidate) => candidate.id !== variableId);
  creatorState.pages.forEach((page) => {
    page.elements.forEach((element) => {
      if (element.visibility && element.visibility.variableId === variableId) {
        element.visibility = { type: "always", variableId: null, value: "" };
      }
      if (element.type === "button" && element.action && element.action.type === "setVariable" && element.action.variableId === variableId) {
        element.action = { type: "none", targetPageId: null };
      }
    });
  });
  renderVariablesList();
  renderCreator();
  renderCreatorInspector();
}

function renderVariablesList() {
  const list = $("creatorVariablesList");
  if (!list) return;
  list.innerHTML = "";
  if (creatorState.variables.length === 0) {
    const empty = document.createElement("p");
    empty.className = "variables-empty";
    empty.textContent = "Aucune variable pour le moment.";
    list.appendChild(empty);
    return;
  }
  creatorState.variables.forEach((variable) => {
    const row = document.createElement("div");
    row.className = "variable-row";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = variable.name;
    nameInput.maxLength = 24;
    nameInput.addEventListener("change", () => {
      const sanitized = creatorUniqueVarName(creatorSanitizeVarName(nameInput.value));
      variable.name = sanitized;
      nameInput.value = sanitized;
      renderCreator();
      renderCreatorInspector();
    });

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.placeholder = "Valeur initiale";
    valueInput.value = variable.defaultValue;
    valueInput.maxLength = 60;
    valueInput.addEventListener("input", () => {
      variable.defaultValue = valueInput.value;
      renderCreator();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "variable-remove";
    removeBtn.textContent = "✕";
    removeBtn.title = "Supprimer la variable";
    removeBtn.addEventListener("click", () => removeCreatorVariable(variable.id));

    row.append(nameInput, valueInput, removeBtn);
    list.appendChild(row);
  });
}

function substituteVariables(text) {
  let result = String(text || "");
  creatorState.variables.forEach((variable) => {
    result = result.split(`{{${variable.name}}}`).join(variable.defaultValue || "");
  });
  return result;
}

function elementIsVisibleInEditor(element) {
  if (!element.visibility || element.visibility.type !== "ifVariable") return true;
  const variable = creatorState.variables.find((candidate) => candidate.id === element.visibility.variableId);
  if (!variable) return true;
  return (variable.defaultValue || "") === (element.visibility.value || "");
}

// ── Navigation basse ─────────────────────────────────────────────────────

function addBottomNavTab() {
  if (creatorState.bottomNav.tabs.length >= 5) {
    creatorSetStatus("5 onglets maximum pour la navigation basse.", "error");
    return;
  }
  creatorState.bottomNav.tabs.push({ id: creatorId(), label: `Onglet ${creatorState.bottomNav.tabs.length + 1}`, pageId: creatorState.pages[0].id });
  renderBottomNavTabsList();
  renderCreator();
}

function removeBottomNavTab(tabId) {
  creatorState.bottomNav.tabs = creatorState.bottomNav.tabs.filter((tab) => tab.id !== tabId);
  renderBottomNavTabsList();
  renderCreator();
}

function renderBottomNavTabsList() {
  const list = $("creatorBottomNavTabs");
  if (!list) return;
  list.innerHTML = "";
  creatorState.bottomNav.tabs.forEach((tab) => {
    const row = document.createElement("div");
    row.className = "bottom-nav-tab-row";

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = tab.label;
    labelInput.maxLength = 16;
    labelInput.addEventListener("input", () => {
      tab.label = labelInput.value;
      renderCreator();
    });

    const pageSelect = document.createElement("select");
    creatorState.pages.forEach((page) => {
      const option = document.createElement("option");
      option.value = page.id;
      option.textContent = page.name;
      pageSelect.appendChild(option);
    });
    pageSelect.value = tab.pageId;
    pageSelect.addEventListener("change", () => {
      tab.pageId = pageSelect.value;
      renderCreator();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "variable-remove";
    removeBtn.textContent = "✕";
    removeBtn.title = "Supprimer l’onglet";
    removeBtn.addEventListener("click", () => removeBottomNavTab(tab.id));

    row.append(labelInput, pageSelect, removeBtn);
    list.appendChild(row);
  });
}

function renderBottomNavPreview() {
  const nav = $("creatorBottomNav");
  if (!nav) return;
  const enabled = creatorState.bottomNav.enabled && creatorState.bottomNav.tabs.length > 0;
  nav.classList.toggle("hidden", !enabled);
  nav.innerHTML = "";
  if (!enabled) return;
  creatorState.bottomNav.tabs.forEach((tab) => {
    const item = document.createElement("div");
    item.className = `creator-bottom-nav-tab${tab.pageId === creatorState.currentPageId ? " active" : ""}`;
    item.textContent = tab.label || "Onglet";
    item.addEventListener("click", () => {
      creatorState.currentPageId = tab.pageId;
      creatorState.selectedId = null;
      renderPageTabs();
      renderCreator();
      renderCreatorInspector();
    });
    nav.appendChild(item);
  });
}

// ── Pages ────────────────────────────────────────────────────────────────

function renderPageTabs() {
  const bar = $("creatorPageTabs");
  if (!bar) return;
  bar.innerHTML = "";
  creatorState.pages.forEach((page) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `page-tab${page.id === creatorState.currentPageId ? " active" : ""}`;
    tab.setAttribute("role", "tab");
    tab.innerHTML = `${page.id === creatorState.homePageId ? '<span class="home-star">★</span>' : ""}<span>${creatorEscapeXml(page.name)}</span>`;
    tab.addEventListener("click", () => {
      creatorState.currentPageId = page.id;
      creatorState.selectedId = null;
      renderPageTabs();
      renderCreator();
      renderCreatorInspector();
    });
    bar.appendChild(tab);
  });
}

function creatorUniquePageName(base) {
  const names = new Set(creatorState.pages.map((page) => page.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function addCreatorPage(name) {
  const page = {
    id: `page-${creatorId()}`,
    name: creatorUniquePageName(name || `Page ${creatorState.pages.length + 1}`),
    elements: [],
  };
  creatorState.pages.push(page);
  creatorState.currentPageId = page.id;
  creatorState.selectedId = null;
  renderPageTabs();
  renderBottomNavTabsList();
  renderCreator();
  renderCreatorInspector();
  creatorSetStatus(`Page « ${page.name} » créée.`, "success");
}

function duplicateCurrentPage() {
  const page = currentPage();
  if (!page) return;
  const copy = {
    id: `page-${creatorId()}`,
    name: creatorUniquePageName(`${page.name} copie`),
    elements: page.elements.map((element) => ({
      ...element,
      id: creatorId(),
      ...(element.visibility ? { visibility: { ...element.visibility } } : {}),
      ...(element.action ? { action: { ...element.action } } : {}),
    })),
  };
  creatorState.pages.push(copy);
  creatorState.currentPageId = copy.id;
  creatorState.selectedId = null;
  renderPageTabs();
  renderBottomNavTabsList();
  renderCreator();
  renderCreatorInspector();
  creatorSetStatus(`Page dupliquée sous « ${copy.name} ».`, "success");
}

function renameCurrentPage() {
  const page = currentPage();
  if (!page) return;
  const name = window.prompt("Nouveau nom de la page :", page.name);
  if (!name || !name.trim()) return;
  page.name = creatorUniquePageName(name.trim().slice(0, 30));
  clearNavigateTargetsIfNeeded();
  renderPageTabs();
  renderBottomNavTabsList();
  renderCreatorInspector();
  creatorSetStatus(`Page renommée en « ${page.name} ».`, "success");
}

function setCurrentPageAsHome() {
  const page = currentPage();
  if (!page) return;
  creatorState.homePageId = page.id;
  renderPageTabs();
  creatorSetStatus(`« ${page.name} » est désormais la page d’accueil.`, "success");
}

function deleteCurrentPage() {
  if (creatorState.pages.length <= 1) {
    creatorSetStatus("Impossible de supprimer la dernière page.", "error");
    return;
  }
  const page = currentPage();
  if (!window.confirm(`Supprimer la page « ${page.name} » ? Les boutons qui y menaient perdront leur action.`)) return;
  creatorState.pages = creatorState.pages.filter((candidate) => candidate.id !== page.id);
  if (creatorState.homePageId === page.id) creatorState.homePageId = creatorState.pages[0].id;
  creatorState.currentPageId = creatorState.pages[0].id;
  creatorState.selectedId = null;
  clearNavigateTargetsIfNeeded();
  renderPageTabs();
  renderBottomNavTabsList();
  renderCreator();
  renderCreatorInspector();
  creatorSetStatus(`Page « ${page.name} » supprimée.`, "success");
}

function clearNavigateTargetsIfNeeded() {
  const validIds = new Set(creatorState.pages.map((page) => page.id));
  creatorState.pages.forEach((page) => {
    page.elements.forEach((element) => {
      if (element.type === "button" && element.action && element.action.type === "navigate") {
        if (!validIds.has(element.action.targetPageId)) {
          element.action = { type: "none", targetPageId: null };
        }
      }
    });
  });
  creatorState.bottomNav.tabs = creatorState.bottomNav.tabs.filter((tab) => validIds.has(tab.pageId));
}

// ── Canvas / éléments ────────────────────────────────────────────────────

function renderCreator() {
  const canvas = $("creatorCanvas");
  const phone = $("creatorPhone");
  const page = currentPage();
  if (!canvas || !phone || !page) return;
  phone.style.setProperty("--creator-accent", creatorState.accent);
  canvas.innerHTML = "";

  if (page.elements.length === 0) {
    const empty = document.createElement("div");
    empty.className = "creator-empty-canvas";
    empty.textContent = `La page « ${page.name} » est vide. Ajoutez un titre, un texte, un bouton ou une image depuis la palette.`;
    canvas.appendChild(empty);
  }

  page.elements.forEach((element) => {
    let node;
    if (element.type === "image") {
      node = document.createElement("img");
      node.className = "creator-element creator-image";
      node.src = element.dataUrl;
      node.alt = element.alt || "Image de l’application";
    } else if (element.type === "button") {
      node = document.createElement("div");
      node.className = "creator-element creator-button";
      node.textContent = substituteVariables(element.text);
      node.style.fontSize = `${element.size || 16}px`;
    } else if (element.type === "divider") {
      node = document.createElement("div");
      node.className = "creator-element creator-divider";
    } else if (element.type === "card") {
      node = document.createElement("div");
      node.className = "creator-element creator-card";
      node.textContent = substituteVariables(element.text);
      node.style.fontSize = `${element.size || 17}px`;
      node.style.textAlign = element.align || "left";
    } else if (element.type === "apiList") {
      node = document.createElement("div");
      node.className = "creator-element creator-api-list";
      const label = document.createElement("div");
      label.className = "creator-api-list-label";
      label.textContent = substituteVariables(element.text) || "Liste API";
      const info = document.createElement("div");
      info.className = "creator-api-list-info";
      info.textContent = element.api && element.api.url ? `Source : ${element.api.url}` : "Aucune URL configurée — ouvrez les propriétés pour la définir.";
      node.append(label, info);
    } else {
      node = document.createElement("div");
      node.className = `creator-element creator-${element.type}`;
      node.textContent = substituteVariables(element.text);
      node.style.fontSize = `${element.size || (element.type === "title" ? 26 : 17)}px`;
      node.style.textAlign = element.align || "left";
      if (element.type === "title") node.style.color = creatorState.accent;
    }
    node.dataset.creatorId = element.id;
    if (element.visibility && element.visibility.type === "ifVariable") {
      node.classList.add("creator-conditional");
      node.title = "Affichage conditionnel";
      if (!elementIsVisibleInEditor(element)) node.style.opacity = "0.4";
    }
    if (element.id === creatorState.selectedId) node.classList.add("selected");
    node.addEventListener("click", () => {
      creatorState.selectedId = element.id;
      renderCreator();
      renderCreatorInspector();
    });
    canvas.appendChild(node);
  });
  renderBottomNavPreview();
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
  const isButton = selected.type === "button";
  const isDivider = selected.type === "divider";
  const isApiList = selected.type === "apiList";
  $("creatorElementText").disabled = isImage || isDivider || isApiList;
  $("creatorFontSize").disabled = isImage || isDivider || isApiList;
  $("creatorTextAlign").disabled = isImage || isButton || isDivider || isApiList;
  $("creatorElementText").value = isImage ? "Image importée" : isDivider ? "Séparateur (aucun contenu)" : isApiList ? "Voir la section API ci-dessous" : selected.text;
  $("creatorFontSize").value = selected.size || (selected.type === "title" ? 26 : 17);
  $("creatorTextAlign").value = selected.align || "left";

  const actionFields = $("creatorActionFields");
  const targetField = $("creatorActionTargetField");
  const setVariableFields = $("creatorSetVariableFields");
  if (isButton) {
    actionFields.classList.remove("hidden");
    if (!selected.action) selected.action = { type: "none", targetPageId: null };
    $("creatorActionType").value = selected.action.type || "none";
    const targetSelect = $("creatorActionTarget");
    targetSelect.innerHTML = "";
    creatorState.pages.forEach((page) => {
      const option = document.createElement("option");
      option.value = page.id;
      option.textContent = page.name;
      targetSelect.appendChild(option);
    });
    targetSelect.value = selected.action.targetPageId || creatorState.pages[0].id;
    targetField.classList.toggle("hidden", selected.action.type !== "navigate");

    const setVarSelect = $("creatorSetVariableSelect");
    setVarSelect.innerHTML = "";
    creatorState.variables.forEach((variable) => {
      const option = document.createElement("option");
      option.value = variable.id;
      option.textContent = variable.name;
      setVarSelect.appendChild(option);
    });
    if (selected.action.type === "setVariable") {
      setVarSelect.value = selected.action.variableId || (creatorState.variables[0] && creatorState.variables[0].id) || "";
      $("creatorSetVariableValue").value = selected.action.value || "";
    }
    setVariableFields.classList.toggle("hidden", selected.action.type !== "setVariable" || creatorState.variables.length === 0);
  } else {
    actionFields.classList.add("hidden");
  }

  const apiFields = $("creatorApiFields");
  if (isApiList) {
    apiFields.classList.remove("hidden");
    if (!selected.api) selected.api = { url: "", method: "GET", listPath: "", titlePath: "title", subtitlePath: "", imagePath: "", limit: 10 };
    $("creatorApiLabel").value = selected.text || "";
    const isYoutube = selected.preset === "youtube";
    $("creatorYoutubeFields").classList.toggle("hidden", !isYoutube);
    $("creatorRawApiFields").classList.toggle("hidden", isYoutube);
    if (isYoutube) {
      if (!selected.youtube) selected.youtube = { channelId: "", apiKey: "", order: "date", maxResults: 10 };
      $("creatorYoutubeChannelId").value = selected.youtube.channelId || "";
      $("creatorYoutubeApiKey").value = selected.youtube.apiKey || "";
      $("creatorYoutubeOrder").value = selected.youtube.order || "date";
      $("creatorYoutubeMaxResults").value = selected.youtube.maxResults || 10;
    } else {
      $("creatorApiUrl").value = selected.api.url || "";
      $("creatorApiMethod").value = selected.api.method || "GET";
      $("creatorApiListPath").value = selected.api.listPath || "";
      $("creatorApiTitlePath").value = selected.api.titlePath || "title";
      $("creatorApiSubtitlePath").value = selected.api.subtitlePath || "";
      $("creatorApiImagePath").value = selected.api.imagePath || "";
      $("creatorApiLimit").value = selected.api.limit || 10;
    }
    $("creatorApiTestResult").textContent = selected.api._testResult || "";
  } else {
    apiFields.classList.add("hidden");
  }

  const visibilityType = $("creatorVisibilityType");
  const visibilityFields = $("creatorVisibilityFields");
  if (!selected.visibility) selected.visibility = { type: "always", variableId: null, value: "" };
  visibilityType.value = selected.visibility.type || "always";
  const visVarSelect = $("creatorVisibilityVariable");
  visVarSelect.innerHTML = "";
  creatorState.variables.forEach((variable) => {
    const option = document.createElement("option");
    option.value = variable.id;
    option.textContent = variable.name;
    visVarSelect.appendChild(option);
  });
  if (selected.visibility.type === "ifVariable") {
    visVarSelect.value = selected.visibility.variableId || (creatorState.variables[0] && creatorState.variables[0].id) || "";
    $("creatorVisibilityValue").value = selected.visibility.value || "";
  }
  visibilityFields.classList.toggle("hidden", selected.visibility.type !== "ifVariable" || creatorState.variables.length === 0);
}

function updateCreatorForm() {
  creatorState.appName = $("creatorAppName").value.trim().slice(0, 40) || "Mon application";
  creatorState.packageName = $("creatorPackage").value.trim() || "com.example.monapp";
  creatorState.accent = $("creatorAccent").value || "#7c3aed";
  renderCreator();
}

function addCreatorElement(type, fields = {}) {
  const page = currentPage();
  if (!page) return;
  const element = {
    id: creatorId(), type,
    text: fields.text || (type === "title" ? "Nouveau titre" : type === "button" ? "Bouton" : "Votre texte ici"),
    size: fields.size || (type === "title" ? 27 : type === "button" ? 16 : 17),
    align: fields.align || "left",
    visibility: { type: "always", variableId: null, value: "" },
    ...(type === "button" ? { action: { type: "none", targetPageId: null } } : {}),
    ...(type === "apiList" ? { api: { url: "", method: "GET", listPath: "", titlePath: "title", subtitlePath: "", imagePath: "", limit: 10 } } : {}),
    ...fields,
  };
  page.elements.push(element);
  creatorState.selectedId = element.id;
  renderCreator();
  renderCreatorInspector();
}

// ── Génération du projet Android (multi-activités) ──────────────────────

function creatorPageClassName(page, isHome, usedNames) {
  if (isHome) return "MainActivity";
  const base = String(page.name || "Page")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join("");
  let className = /^[A-Za-z]/.test(base) && base ? `${base}Activity` : "PageActivity";
  let attempt = 1;
  let finalName = className;
  while (usedNames.has(finalName)) {
    attempt += 1;
    finalName = `${className.replace(/Activity$/, "")}${attempt}Activity`;
  }
  usedNames.add(finalName);
  return finalName;
}

function buildTextExpression(text, variables) {
  let expr = JSON.stringify(text || "");
  variables.forEach((variable) => {
    if (text && text.includes(`{{${variable.name}}}`)) {
      expr = `${expr}.replace(${JSON.stringify(`{{${variable.name}}}`)}, AppState.${variable.name})`;
    }
  });
  return expr;
}

function buildVisibilityCondition(element) {
  if (!element.visibility || element.visibility.type !== "ifVariable" || !element.visibility.variableId) return null;
  const variable = creatorState.variables.find((candidate) => candidate.id === element.visibility.variableId);
  if (!variable) return null;
  return `java.util.Objects.equals(AppState.${variable.name}, ${JSON.stringify(element.visibility.value || "")})`;
}

function buildActivityViews(elements, accent, classNameByPageId, currentClassName) {
  const variables = creatorState.variables;
  return elements.map((element, index) => {
    const name = `element${index}`;
    let block;
    if (element.type === "image") {
      const asset = element.assetName || `image_${index}.png`;
      block = `        ImageView ${name} = new ImageView(this);\n        try (InputStream stream = getAssets().open(${JSON.stringify(asset)})) {\n            ${name}.setImageBitmap(BitmapFactory.decodeStream(stream));\n            ${name}.setAdjustViewBounds(true);\n            ${name}.setPadding(0, 12, 0, 12);\n            root.addView(${name}, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));\n        } catch (Exception ignored) { }`;
    } else if (element.type === "button") {
      const onClickLines = [];
      if (element.action && element.action.type === "navigate") {
        const targetClass = classNameByPageId.get(element.action.targetPageId);
        if (targetClass) onClickLines.push(`startActivity(new Intent(${currentClassName}.this, ${targetClass}.class));`);
      } else if (element.action && element.action.type === "setVariable") {
        const variable = creatorState.variables.find((candidate) => candidate.id === element.action.variableId);
        if (variable) {
          onClickLines.push(`AppState.${variable.name} = ${JSON.stringify(element.action.value || "")};`);
          onClickLines.push(`AppState.save(${currentClassName}.this);`);
          onClickLines.push(`recreate();`);
        }
      }
      const onClick = onClickLines.length
        ? `${name}.setOnClickListener(v -> {\n            ${onClickLines.join("\n            ")}\n        });`
        : "";
      block = `        Button ${name} = new Button(this);\n        ${name}.setText(${buildTextExpression(element.text, variables)});\n        ${name}.setTextSize(${Number(element.size) || 16}f);\n        ${name}.setBackgroundColor(Color.parseColor(${JSON.stringify(accent)}));\n        ${name}.setTextColor(Color.WHITE);\n        ${onClick}\n        root.addView(${name}, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));`;
    } else if (element.type === "divider") {
      block = `        View ${name} = new View(this);\n        ${name}.setBackgroundColor(Color.rgb(226, 232, 240));\n        LinearLayout.LayoutParams ${name}Params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 2);\n        ${name}Params.setMargins(0, 20, 0, 20);\n        root.addView(${name}, ${name}Params);`;
    } else if (element.type === "card") {
      const gravity = element.align === "center" ? "Gravity.CENTER_HORIZONTAL" : element.align === "right" ? "Gravity.END" : "Gravity.START";
      block = `        LinearLayout ${name} = new LinearLayout(this);\n        ${name}.setOrientation(LinearLayout.VERTICAL);\n        ${name}.setPadding(28, 28, 28, 28);\n        GradientDrawable ${name}Bg = new GradientDrawable();\n        ${name}Bg.setColor(Color.WHITE);\n        ${name}Bg.setCornerRadius(24f);\n        ${name}.setBackground(${name}Bg);\n        TextView ${name}Text = new TextView(this);\n        ${name}Text.setText(${buildTextExpression(element.text, variables)});\n        ${name}Text.setTextSize(${Number(element.size) || 17}f);\n        ${name}Text.setTextColor(Color.rgb(35, 43, 58));\n        ${name}Text.setGravity(${gravity});\n        ${name}.addView(${name}Text);\n        LinearLayout.LayoutParams ${name}Params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);\n        ${name}Params.setMargins(0, 10, 0, 10);\n        root.addView(${name}, ${name}Params);`;
    } else if (element.type === "apiList") {
      block = buildApiListBlock(element, name, accent, variables);
    } else {
      const gravity = element.align === "center" ? "Gravity.CENTER_HORIZONTAL" : element.align === "right" ? "Gravity.END" : "Gravity.START";
      const color = element.type === "title" ? `Color.parseColor(${JSON.stringify(accent)})` : "Color.rgb(35, 43, 58)";
      block = `        TextView ${name} = new TextView(this);\n        ${name}.setText(${buildTextExpression(element.text, variables)});\n        ${name}.setTextSize(${Number(element.size) || (element.type === "title" ? 27 : 17)}f);\n        ${name}.setTextColor(${color});\n        ${name}.setGravity(${gravity});\n        ${name}.setPadding(0, 10, 0, 10);\n        root.addView(${name}, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));`;
    }
    const condition = buildVisibilityCondition(element);
    if (!condition) return block;
    const indented = block.split("\n").map((line) => `    ${line}`).join("\n");
    return `        if (${condition}) {\n${indented}\n        }`;
  }).join("\n\n") || "        TextView empty = new TextView(this);\n        empty.setText(\"Cette page est prête à être personnalisée.\");\n        root.addView(empty);";
}

function buildApiListBlock(element, name, accent, variables) {
  const api = element.api || {};
  const url = api.url || "";
  const method = (api.method || "GET").toUpperCase();
  const listPath = api.listPath || "";
  const titlePath = api.titlePath || "title";
  const subtitlePath = api.subtitlePath || "";
  const limit = Math.max(1, Math.min(50, Number(api.limit) || 10));
  const labelBlock = element.text
    ? `        TextView ${name}Label = new TextView(this);\n        ${name}Label.setText(${buildTextExpression(element.text, variables)});\n        ${name}Label.setTextSize(19f);\n        ${name}Label.setTextColor(Color.parseColor(${JSON.stringify(accent)}));\n        ${name}Label.setPadding(0, 16, 0, 8);\n        root.addView(${name}Label, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));\n`
    : "";
  const subtitleBlock = subtitlePath
    ? `                            String ${name}Subtitle = String.valueOf(ApiUtils.getByPath(${name}Item, ${JSON.stringify(subtitlePath)}));\n                            TextView ${name}SubtitleView = new TextView(this);\n                            ${name}SubtitleView.setText(${name}Subtitle);\n                            ${name}SubtitleView.setTextSize(13f);\n                            ${name}SubtitleView.setTextColor(Color.rgb(100, 116, 139));\n                            ${name}Row.addView(${name}SubtitleView);\n`
    : "";
  return `${labelBlock}        LinearLayout ${name}List = new LinearLayout(this);\n        ${name}List.setOrientation(LinearLayout.VERTICAL);\n        root.addView(${name}List, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));\n        TextView ${name}Status = new TextView(this);\n        ${name}Status.setText("Chargement…");\n        ${name}Status.setTextColor(Color.rgb(100, 116, 139));\n        ${name}List.addView(${name}Status);\n        new Thread(() -> {\n            try {\n                java.net.URL ${name}Url = new java.net.URL(${JSON.stringify(url)});\n                java.net.HttpURLConnection ${name}Conn = (java.net.HttpURLConnection) ${name}Url.openConnection();\n                ${name}Conn.setRequestMethod(${JSON.stringify(method)});\n                ${name}Conn.setConnectTimeout(15000);\n                ${name}Conn.setReadTimeout(15000);\n                java.io.InputStream ${name}Stream = ${name}Conn.getInputStream();\n                java.util.Scanner ${name}Scanner = new java.util.Scanner(${name}Stream, "UTF-8").useDelimiter("\\\\A");\n                String ${name}Body = ${name}Scanner.hasNext() ? ${name}Scanner.next() : "";\n                ${name}Scanner.close();\n                String ${name}Trimmed = ${name}Body.trim();\n                Object ${name}Parsed = ${name}Trimmed.startsWith("[") ? new org.json.JSONArray(${name}Trimmed) : new org.json.JSONObject(${name}Trimmed);\n                Object ${name}Node = ApiUtils.getByPath(${name}Parsed, ${JSON.stringify(listPath)});\n                org.json.JSONArray ${name}Items = ${name}Node instanceof org.json.JSONArray ? (org.json.JSONArray) ${name}Node : new org.json.JSONArray();\n                runOnUiThread(() -> {\n                    ${name}List.removeAllViews();\n                    int ${name}Max = Math.min(${name}Items.length(), ${limit});\n                    if (${name}Max == 0) {\n                        TextView ${name}Empty = new TextView(this);\n                        ${name}Empty.setText("Aucun résultat.");\n                        ${name}Empty.setTextColor(Color.rgb(100, 116, 139));\n                        ${name}List.addView(${name}Empty);\n                        return;\n                    }\n                    for (int ${name}i = 0; ${name}i < ${name}Max; ${name}i++) {\n                        try {\n                            Object ${name}Item = ${name}Items.get(${name}i);\n                            String ${name}Title = String.valueOf(ApiUtils.getByPath(${name}Item, ${JSON.stringify(titlePath)}));\n                            LinearLayout ${name}Row = new LinearLayout(this);\n                            ${name}Row.setOrientation(LinearLayout.VERTICAL);\n                            ${name}Row.setPadding(20, 20, 20, 20);\n                            GradientDrawable ${name}RowBg = new GradientDrawable();\n                            ${name}RowBg.setColor(Color.WHITE);\n                            ${name}RowBg.setCornerRadius(18f);\n                            ${name}Row.setBackground(${name}RowBg);\n                            TextView ${name}TitleView = new TextView(this);\n                            ${name}TitleView.setText(${name}Title);\n                            ${name}TitleView.setTextSize(16f);\n                            ${name}TitleView.setTextColor(Color.rgb(15, 23, 42));\n                            ${name}Row.addView(${name}TitleView);\n${subtitleBlock}                            LinearLayout.LayoutParams ${name}RowParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);\n                            ${name}RowParams.setMargins(0, 0, 0, 12);\n                            ${name}List.addView(${name}Row, ${name}RowParams);\n                        } catch (Exception ${name}RowError) { }\n                    }\n                });\n            } catch (Exception ${name}Error) {\n                runOnUiThread(() -> {\n                    ${name}List.removeAllViews();\n                    TextView ${name}ErrorView = new TextView(this);\n                    ${name}ErrorView.setText("Impossible de charger les données.");\n                    ${name}ErrorView.setTextColor(Color.rgb(220, 38, 38));\n                    ${name}List.addView(${name}ErrorView);\n                });\n            }\n        }).start();`;
}

function buildApiUtilsJava(packageName) {
  return `package ${packageName};\n\nimport org.json.JSONArray;\nimport org.json.JSONObject;\n\n// Résout un chemin en notation pointée (ex: "data.items") dans une réponse JSON.\npublic final class ApiUtils {\n    public static Object getByPath(Object root, String path) {\n        if (path == null || path.trim().isEmpty()) return root;\n        Object current = root;\n        for (String part : path.split("\\\\.")) {\n            if (current instanceof JSONObject) {\n                current = ((JSONObject) current).opt(part);\n            } else {\n                return null;\n            }\n        }\n        return current;\n    }\n}\n`;
}

function buildBottomNavJava(classNameByPageId, currentPageId, currentClassName, accent) {
  const items = creatorState.bottomNav.tabs.map((tab, index) => {
    const name = `navTab${index}`;
    const targetClass = classNameByPageId.get(tab.pageId);
    const isActive = tab.pageId === currentPageId;
    const onClick = targetClass && !isActive
      ? `${name}.setOnClickListener(v -> { startActivity(new Intent(${currentClassName}.this, ${targetClass}.class)); finish(); });`
      : "";
    const color = isActive ? `Color.parseColor(${JSON.stringify(accent)})` : "Color.rgb(100, 116, 139)";
    return `        TextView ${name} = new TextView(this);\n        ${name}.setText(${JSON.stringify(tab.label || "Onglet")});\n        ${name}.setGravity(Gravity.CENTER);\n        ${name}.setPadding(0, 18, 0, 18);\n        ${name}.setTextColor(${color});\n        ${isActive ? `${name}.setTypeface(${name}.getTypeface(), android.graphics.Typeface.BOLD);\n        ` : ""}${onClick}\n        bottomNav.addView(${name}, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));`;
  }).join("\n\n");
  return `        LinearLayout bottomNav = new LinearLayout(this);\n        bottomNav.setOrientation(LinearLayout.HORIZONTAL);\n        bottomNav.setBackgroundColor(Color.WHITE);\n${items}\n`;
}

function buildActivityJava(packageName, className, viewsCode, bottomNavCode) {
  const bodyWithNav = bottomNavCode
    ? `        LinearLayout page = new LinearLayout(this);\n        page.setOrientation(LinearLayout.VERTICAL);\n        ScrollView scroll = new ScrollView(this);\n        scroll.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));\n        LinearLayout root = new LinearLayout(this);\n        root.setOrientation(LinearLayout.VERTICAL);\n        root.setPadding(32, 40, 32, 40);\n        root.setBackgroundColor(Color.rgb(248, 250, 252));\n${viewsCode}\n        scroll.addView(root);\n        page.addView(scroll);\n${bottomNavCode}        page.addView(bottomNav);\n        setContentView(page);`
    : `        ScrollView scroll = new ScrollView(this);\n        LinearLayout root = new LinearLayout(this);\n        root.setOrientation(LinearLayout.VERTICAL);\n        root.setPadding(32, 40, 32, 40);\n        root.setBackgroundColor(Color.rgb(248, 250, 252));\n${viewsCode}\n        scroll.addView(root);\n        setContentView(scroll);`;
  return `package ${packageName};\n\nimport android.app.Activity;\nimport android.content.Intent;\nimport android.graphics.BitmapFactory;\nimport android.graphics.Color;\nimport android.graphics.drawable.GradientDrawable;\nimport android.os.Bundle;\nimport android.view.Gravity;\nimport android.view.View;\nimport android.widget.Button;\nimport android.widget.ImageView;\nimport android.widget.LinearLayout;\nimport android.widget.ScrollView;\nimport android.widget.TextView;\nimport java.io.InputStream;\n\npublic final class ${className} extends Activity {\n    @Override public void onCreate(Bundle state) {\n        super.onCreate(state);\n        AppState.load(this);\n${bodyWithNav}\n    }\n}\n`;
}

function buildAppStateJava(packageName, variables) {
  const fields = variables.map((variable) => `    public static String ${variable.name} = ${JSON.stringify(variable.defaultValue || "")};`).join("\n");
  const loadLines = variables.map((variable) => `        ${variable.name} = prefs.getString(${JSON.stringify(variable.name)}, ${variable.name});`).join("\n");
  const saveLines = variables.map((variable) => `        editor.putString(${JSON.stringify(variable.name)}, ${variable.name});`).join("\n");
  return `package ${packageName};\n\nimport android.content.Context;\nimport android.content.SharedPreferences;\n\n// État global de l’application, généré à partir des variables définies dans le Studio.\npublic final class AppState {\n    private static final String PREFS = "app_state";\n\n${fields || "    // Aucune variable définie."}\n\n    public static void load(Context context) {\n        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);\n${loadLines}\n    }\n\n    public static void save(Context context) {\n        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();\n${saveLines}\n        editor.apply();\n    }\n}\n`;
}

function androidProjectDefinition() {
  const packageName = creatorAndroidPackage(creatorState.packageName);
  const packagePath = packageName.replace(/\./g, "/");
  const appName = creatorState.appName || "Mon application";
  const accent = creatorColor(creatorState.accent);

  // Attribue un nom de classe unique à chaque page (la page d’accueil devient MainActivity).
  const usedNames = new Set(["MainActivity"]);
  const classNameByPageId = new Map();
  creatorState.pages.forEach((page) => {
    const isHome = page.id === creatorState.homePageId;
    const className = isHome ? "MainActivity" : creatorPageClassName(page, false, usedNames);
    classNameByPageId.set(page.id, className);
  });

  const images = creatorState.pages.flatMap((page) => page.elements.filter((element) => element.type === "image"));

  const javaFiles = {};
  const manifestActivities = [];
  creatorState.pages.forEach((page) => {
    const className = classNameByPageId.get(page.id);
    const isHome = page.id === creatorState.homePageId;
    const viewsCode = buildActivityViews(page.elements, accent, classNameByPageId, className);
    const bottomNavCode = creatorState.bottomNav.enabled && creatorState.bottomNav.tabs.length > 0
      ? buildBottomNavJava(classNameByPageId, page.id, className, accent)
      : null;
    javaFiles[`app/src/main/java/${packagePath}/${className}.java`] = buildActivityJava(packageName, className, viewsCode, bottomNavCode);
    manifestActivities.push(
      isHome
        ? `        <activity android:name=".${className}" android:exported="true">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity>`
        : `        <activity android:name=".${className}" android:exported="false" />`
    );
  });
  javaFiles[`app/src/main/java/${packagePath}/AppState.java`] = buildAppStateJava(packageName, creatorState.variables);
  javaFiles[`app/src/main/java/${packagePath}/ApiUtils.java`] = buildApiUtilsJava(packageName);

  const safeName = appName.replace(/[^a-z0-9_-]/gi, "-").toLowerCase() || "application";
  const files = {
    "settings.gradle": `pluginManagement {\n    repositories { google(); mavenCentral(); gradlePluginPortal() }\n}\ndependencyResolutionManagement {\n    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)\n    repositories { google(); mavenCentral() }\n}\nrootProject.name = ${JSON.stringify(appName)}\ninclude(\":app\")\n`,
    "build.gradle": "plugins {\n    id 'com.android.application' version '8.4.0' apply false\n}\n",
    "gradle.properties": "android.useAndroidX=true\norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\n",
    "gradle/wrapper/gradle-wrapper.properties": "distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\n",
    "gradlew": "#!/bin/sh\nDIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\nexec java -classpath \"$DIR/gradle/wrapper/gradle-wrapper.jar\" org.gradle.wrapper.GradleWrapperMain \"$@\"\n",
    "gradlew.bat": "@echo off\r\njava -classpath \"%~dp0\\gradle\\wrapper\\gradle-wrapper.jar\" org.gradle.wrapper.GradleWrapperMain %*\r\n",
    "app/build.gradle": `plugins { id 'com.android.application' }\n\nandroid {\n    namespace '${packageName}'\n    compileSdk 34\n\n    defaultConfig {\n        applicationId '${packageName}'\n        minSdk 23\n        targetSdk 34\n        versionCode 1\n        versionName '1.0'\n    }\n}\n`,
    "app/src/main/AndroidManifest.xml": `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <uses-permission android:name="android.permission.INTERNET" />\n    <application android:label="${creatorEscapeXml(appName)}" android:theme="@android:style/Theme.Material.Light.NoActionBar">\n${manifestActivities.join("\n")}\n    </application>\n</manifest>\n`,
    ...javaFiles,
    "README.md": `# ${appName}\n\nProjet Android généré par Android Builder Studio.\n\n${creatorState.pages.length} page(s) : ${creatorState.pages.map((page) => page.name).join(", ")}.\n${creatorState.variables.length ? `\nVariables : ${creatorState.variables.map((variable) => variable.name).join(", ")}.\n` : ""}\n## Compilation\n\n\`./gradlew assembleDebug\`\n\nL’APK est produit dans \`app/build/outputs/apk/debug/app-debug.apk\`.\n`,
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
  $("creatorAddButton").addEventListener("click", () => addCreatorElement("button"));
  $("creatorAddCard").addEventListener("click", () => addCreatorElement("card", { text: "Titre de la carte" }));
  $("creatorAddDivider").addEventListener("click", () => addCreatorElement("divider", { text: "" }));
  $("creatorAddApiList").addEventListener("click", () => addCreatorElement("apiList", { text: "Nouvelle liste" }));
  $("creatorAddYoutube").addEventListener("click", () => {
    const element = { text: "Dernières vidéos", preset: "youtube", youtube: { channelId: "", apiKey: "", order: "date", maxResults: 10 } };
    updateYoutubeApiConfig(element);
    addCreatorElement("apiList", element);
  });
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
    if (!selected || selected.type === "image" || selected.type === "divider") return;
    selected.text = event.target.value;
    renderCreator();
  });
  $("creatorFontSize").addEventListener("input", (event) => {
    const selected = creatorSelected();
    if (!selected || selected.type === "image" || selected.type === "divider") return;
    selected.size = Number(event.target.value);
    renderCreator();
  });
  $("creatorTextAlign").addEventListener("change", (event) => {
    const selected = creatorSelected();
    if (!selected || selected.type === "image" || selected.type === "button") return;
    selected.align = event.target.value;
    renderCreator();
  });
  $("creatorActionType").addEventListener("change", (event) => {
    const selected = creatorSelected();
    if (!selected || selected.type !== "button") return;
    const type = event.target.value;
    if (type === "navigate") {
      selected.action = { type: "navigate", targetPageId: $("creatorActionTarget").value || creatorState.pages[0].id };
    } else if (type === "setVariable") {
      const firstVar = creatorState.variables[0];
      selected.action = { type: "setVariable", variableId: firstVar ? firstVar.id : null, value: "" };
    } else {
      selected.action = { type: "none", targetPageId: null };
    }
    renderCreatorInspector();
  });
  $("creatorActionTarget").addEventListener("change", (event) => {
    const selected = creatorSelected();
    if (!selected || selected.type !== "button" || !selected.action) return;
    selected.action.targetPageId = event.target.value;
  });
  $("creatorSetVariableSelect").addEventListener("change", (event) => {
    const selected = creatorSelected();
    if (!selected || selected.type !== "button" || !selected.action || selected.action.type !== "setVariable") return;
    selected.action.variableId = event.target.value;
  });
  $("creatorSetVariableValue").addEventListener("input", (event) => {
    const selected = creatorSelected();
    if (!selected || selected.type !== "button" || !selected.action || selected.action.type !== "setVariable") return;
    selected.action.value = event.target.value;
  });
  $("creatorVisibilityType").addEventListener("change", (event) => {
    const selected = creatorSelected();
    if (!selected) return;
    const type = event.target.value;
    if (type === "ifVariable") {
      const firstVar = creatorState.variables[0];
      selected.visibility = { type: "ifVariable", variableId: firstVar ? firstVar.id : null, value: "" };
    } else {
      selected.visibility = { type: "always", variableId: null, value: "" };
    }
    renderCreator();
    renderCreatorInspector();
  });
  $("creatorVisibilityVariable").addEventListener("change", (event) => {
    const selected = creatorSelected();
    if (!selected || !selected.visibility || selected.visibility.type !== "ifVariable") return;
    selected.visibility.variableId = event.target.value;
    renderCreator();
  });
  $("creatorVisibilityValue").addEventListener("input", (event) => {
    const selected = creatorSelected();
    if (!selected || !selected.visibility || selected.visibility.type !== "ifVariable") return;
    selected.visibility.value = event.target.value;
    renderCreator();
  });
  $("creatorAddVariable").addEventListener("click", addCreatorVariable);
  $("creatorApiLabel").addEventListener("input", (event) => {
    const selected = creatorSelected();
    if (!selected || selected.type !== "apiList") return;
    selected.text = event.target.value;
    renderCreator();
  });
  [
    ["creatorApiUrl", "url"], ["creatorApiMethod", "method"], ["creatorApiListPath", "listPath"],
    ["creatorApiTitlePath", "titlePath"], ["creatorApiSubtitlePath", "subtitlePath"], ["creatorApiImagePath", "imagePath"],
  ].forEach(([id, key]) => {
    $(id).addEventListener("input", (event) => {
      const selected = creatorSelected();
      if (!selected || selected.type !== "apiList") return;
      selected.api[key] = event.target.value;
      if (key === "url") renderCreator();
    });
  });
  $("creatorApiLimit").addEventListener("input", (event) => {
    const selected = creatorSelected();
    if (!selected || selected.type !== "apiList") return;
    selected.api.limit = Math.max(1, Math.min(50, Number(event.target.value) || 10));
  });
  [
    ["creatorYoutubeChannelId", "channelId"], ["creatorYoutubeApiKey", "apiKey"],
    ["creatorYoutubeOrder", "order"], ["creatorYoutubeMaxResults", "maxResults"],
  ].forEach(([id, key]) => {
    $(id).addEventListener("input", (event) => {
      const selected = creatorSelected();
      if (!selected || selected.type !== "apiList" || selected.preset !== "youtube") return;
      selected.youtube[key] = event.target.value;
      updateYoutubeApiConfig(selected);
      renderCreator();
    });
  });
  $("creatorApiTest").addEventListener("click", async () => {
    const selected = creatorSelected();
    if (!selected || selected.type !== "apiList") return;
    const resultEl = $("creatorApiTestResult");
    resultEl.textContent = "Test en cours…";
    if (!selected.api.url) {
      resultEl.textContent = "⚠ Renseignez d’abord une URL.";
      return;
    }
    try {
      const response = await fetch(selected.api.url, { method: selected.api.method || "GET" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const listNode = getByPath(data, selected.api.listPath);
      const list = Array.isArray(listNode) ? listNode : Array.isArray(data) ? data : [];
      resultEl.textContent = list.length > 0
        ? `✓ ${list.length} élément(s) trouvé(s). Premier titre : ${getByPath(list[0], selected.api.titlePath) ?? "(champ introuvable)"}`
        : "⚠ Aucun élément trouvé à ce chemin — vérifiez « Chemin vers la liste ».";
    } catch (error) {
      resultEl.textContent = `✕ Erreur : ${error.message}. L’API bloque peut-être les requêtes depuis un navigateur (CORS).`;
    }
    selected.api._testResult = resultEl.textContent;
  });
  $("creatorBottomNavEnabled").addEventListener("change", (event) => {
    creatorState.bottomNav.enabled = event.target.checked;
    renderCreator();
  });
  $("creatorAddBottomNavTab").addEventListener("click", addBottomNavTab);
  $("creatorDeleteElement").addEventListener("click", () => {
    const page = currentPage();
    if (!creatorSelected() || !page) return;
    page.elements = page.elements.filter((element) => element.id !== creatorState.selectedId);
    creatorState.selectedId = null;
    renderCreator();
    renderCreatorInspector();
  });
  $("creatorReset").addEventListener("click", () => {
    const page = currentPage();
    if (!page) return;
    page.elements = [];
    creatorState.selectedId = null;
    renderCreator();
    renderCreatorInspector();
    creatorSetStatus("Page réinitialisée.");
  });
  $("creatorAddPage").addEventListener("click", () => addCreatorPage());
  $("creatorRenamePage").addEventListener("click", renameCurrentPage);
  $("creatorDuplicatePage").addEventListener("click", duplicateCurrentPage);
  $("creatorSetHomePage").addEventListener("click", setCurrentPageAsHome);
  $("creatorDeletePage").addEventListener("click", deleteCurrentPage);
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
  renderPageTabs();
  renderVariablesList();
  renderBottomNavTabsList();
  renderCreator();
  renderCreatorInspector();
}

initCreator();
