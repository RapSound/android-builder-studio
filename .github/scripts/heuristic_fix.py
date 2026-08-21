#!/usr/bin/env python3
"""
heuristic_fix.py — Correction heuristique déterministe des erreurs de compilation Android.

Catégories de corrections :
  IMPORT_FIX       — imports manquants (Kotlin / Java)
  MANIFEST_FIX     — android:exported, namespace, package
  GRADLE_FIX       — repositories, namespace, compileSdk
  KOTLIN_FIX       — options JVM target
  JAVA_FIX         — compatibilité sourceCompatibility / targetCompatibility
  RESOURCE_FIX     — noms de ressources avec majuscules
  DEPENDENCY_FIX   — dépôts maven manquants
  PACKAGE_FIX      — déclaration de package manquante
  WRAPPER_FIX      — version Gradle incompatible

Usage : heuristic_fix.py <chemin_log_gradle> <racine_projet>
Sortie : résumé sur stdout.
Code de sortie : 0 = au moins une correction, 1 = aucune correction reconnue.
"""
import re
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from repair_utils import read_text, write_text, detect_agp_version, compatible_gradle_for_agp

# ─── Table des imports connus ─────────────────────────────────────────────────

KNOWN_IMPORTS = {
    # Core Android
    "Log":                         "android.util.Log",
    "Context":                     "android.content.Context",
    "Intent":                      "android.content.Intent",
    "Bundle":                      "android.os.Bundle",
    "Handler":                     "android.os.Handler",
    "Looper":                      "android.os.Looper",
    "Build":                       "android.os.Build",
    "View":                        "android.view.View",
    "ViewGroup":                   "android.view.ViewGroup",
    "LayoutInflater":              "android.view.LayoutInflater",
    "KeyEvent":                    "android.view.KeyEvent",
    "MotionEvent":                 "android.view.MotionEvent",
    "TextView":                    "android.widget.TextView",
    "Button":                      "android.widget.Button",
    "EditText":                    "android.widget.EditText",
    "Toast":                       "android.widget.Toast",
    "ImageView":                   "android.widget.ImageView",
    "CheckBox":                    "android.widget.CheckBox",
    "Switch":                      "android.widget.Switch",
    "ProgressBar":                 "android.widget.ProgressBar",
    "Spinner":                     "android.widget.Spinner",
    "ListView":                    "android.widget.ListView",
    "SharedPreferences":           "android.content.SharedPreferences",
    "BroadcastReceiver":           "android.content.BroadcastReceiver",
    "ContentProvider":             "android.content.ContentProvider",
    "Service":                     "android.app.Service",
    "Activity":                    "android.app.Activity",
    "Application":                 "android.app.Application",
    "NotificationManager":        "android.app.NotificationManager",
    "NotificationChannel":        "android.app.NotificationChannel",
    "Notification":               "android.app.Notification",
    "PendingIntent":              "android.app.PendingIntent",
    "AlarmManager":               "android.app.AlarmManager",
    "PackageManager":             "android.content.pm.PackageManager",
    "ActivityCompat":             "androidx.core.app.ActivityCompat",
    "ContextCompat":              "androidx.core.content.ContextCompat",
    "NotificationCompat":         "androidx.core.app.NotificationCompat",
    "AppCompatActivity":          "androidx.appcompat.app.AppCompatActivity",
    "ComponentActivity":          "androidx.activity.ComponentActivity",
    "FragmentActivity":           "androidx.fragment.app.FragmentActivity",
    "Fragment":                   "androidx.fragment.app.Fragment",
    "RecyclerView":               "androidx.recyclerview.widget.RecyclerView",
    "LinearLayoutManager":        "androidx.recyclerview.widget.LinearLayoutManager",
    "GridLayoutManager":          "androidx.recyclerview.widget.GridLayoutManager",
    "DiffUtil":                   "androidx.recyclerview.widget.DiffUtil",
    "ListAdapter":                "androidx.recyclerview.widget.ListAdapter",
    "SwipeRefreshLayout":         "androidx.swiperefreshlayout.widget.SwipeRefreshLayout",
    "DrawerLayout":               "androidx.drawerlayout.widget.DrawerLayout",
    "ConstraintLayout":           "androidx.constraintlayout.widget.ConstraintLayout",
    # Lifecycle / ViewModel
    "ViewModel":                   "androidx.lifecycle.ViewModel",
    "ViewModelProvider":           "androidx.lifecycle.ViewModelProvider",
    "ViewModelStore":              "androidx.lifecycle.ViewModelStore",
    "LiveData":                    "androidx.lifecycle.LiveData",
    "MutableLiveData":             "androidx.lifecycle.MutableLiveData",
    "Observer":                    "androidx.lifecycle.Observer",
    "viewModels":                  "androidx.activity.viewModels",
    "lifecycleScope":              "androidx.lifecycle.lifecycleScope",
    "repeatOnLifecycle":           "androidx.lifecycle.repeatOnLifecycle",
    "Lifecycle":                   "androidx.lifecycle.Lifecycle",
    # Coroutines / Flow
    "CoroutineScope":             "kotlinx.coroutines.CoroutineScope",
    "GlobalScope":                "kotlinx.coroutines.GlobalScope",
    "Dispatchers":                "kotlinx.coroutines.Dispatchers",
    "launch":                     "kotlinx.coroutines.launch",
    "async":                      "kotlinx.coroutines.async",
    "withContext":                "kotlinx.coroutines.withContext",
    "delay":                      "kotlinx.coroutines.delay",
    "Flow":                       "kotlinx.coroutines.flow.Flow",
    "StateFlow":                  "kotlinx.coroutines.flow.StateFlow",
    "MutableStateFlow":           "kotlinx.coroutines.flow.MutableStateFlow",
    "SharedFlow":                 "kotlinx.coroutines.flow.SharedFlow",
    "MutableSharedFlow":          "kotlinx.coroutines.flow.MutableSharedFlow",
    "collect":                    "kotlinx.coroutines.flow.collect",
    "collectAsState":             "androidx.compose.runtime.collectAsState",
    "collectAsStateWithLifecycle":"androidx.lifecycle.compose.collectAsStateWithLifecycle",
    # Compose
    "Composable":                 "androidx.compose.runtime.Composable",
    "remember":                   "androidx.compose.runtime.remember",
    "rememberSaveable":           "androidx.compose.runtime.saveable.rememberSaveable",
    "mutableStateOf":             "androidx.compose.runtime.mutableStateOf",
    "mutableIntStateOf":          "androidx.compose.runtime.mutableIntStateOf",
    "mutableLongStateOf":         "androidx.compose.runtime.mutableLongStateOf",
    "mutableFloatStateOf":        "androidx.compose.runtime.mutableFloatStateOf",
    "derivedStateOf":             "androidx.compose.runtime.derivedStateOf",
    "LaunchedEffect":             "androidx.compose.runtime.LaunchedEffect",
    "DisposableEffect":           "androidx.compose.runtime.DisposableEffect",
    "SideEffect":                 "androidx.compose.runtime.SideEffect",
    "ProduceState":               "androidx.compose.runtime.produceState",
    "Modifier":                   "androidx.compose.ui.Modifier",
    "Column":                     "androidx.compose.foundation.layout.Column",
    "Row":                        "androidx.compose.foundation.layout.Row",
    "Box":                        "androidx.compose.foundation.layout.Box",
    "Spacer":                     "androidx.compose.foundation.layout.Spacer",
    "fillMaxSize":                "androidx.compose.foundation.layout.fillMaxSize",
    "fillMaxWidth":               "androidx.compose.foundation.layout.fillMaxWidth",
    "fillMaxHeight":              "androidx.compose.foundation.layout.fillMaxHeight",
    "padding":                    "androidx.compose.foundation.layout.padding",
    "height":                     "androidx.compose.foundation.layout.height",
    "width":                      "androidx.compose.foundation.layout.width",
    "wrapContentHeight":          "androidx.compose.foundation.layout.wrapContentHeight",
    "Arrangement":                "androidx.compose.foundation.layout.Arrangement",
    "PaddingValues":              "androidx.compose.foundation.layout.PaddingValues",
    "Text":                       "androidx.compose.material3.Text",
    "Button":                     "androidx.compose.material3.Button",
    "OutlinedButton":             "androidx.compose.material3.OutlinedButton",
    "TextButton":                 "androidx.compose.material3.TextButton",
    "IconButton":                 "androidx.compose.material3.IconButton",
    "Icon":                       "androidx.compose.material3.Icon",
    "Scaffold":                   "androidx.compose.material3.Scaffold",
    "TopAppBar":                  "androidx.compose.material3.TopAppBar",
    "BottomAppBar":               "androidx.compose.material3.BottomAppBar",
    "FloatingActionButton":       "androidx.compose.material3.FloatingActionButton",
    "NavigationBar":              "androidx.compose.material3.NavigationBar",
    "NavigationBarItem":          "androidx.compose.material3.NavigationBarItem",
    "NavigationDrawer":           "androidx.compose.material3.NavigationDrawer",
    "Card":                       "androidx.compose.material3.Card",
    "OutlinedCard":               "androidx.compose.material3.OutlinedCard",
    "ElevatedCard":               "androidx.compose.material3.ElevatedCard",
    "AlertDialog":                "androidx.compose.material3.AlertDialog",
    "DropdownMenu":               "androidx.compose.material3.DropdownMenu",
    "DropdownMenuItem":           "androidx.compose.material3.DropdownMenuItem",
    "Checkbox":                   "androidx.compose.material3.Checkbox",
    "Switch":                     "androidx.compose.material3.Switch",
    "Slider":                     "androidx.compose.material3.Slider",
    "TextField":                  "androidx.compose.material3.TextField",
    "OutlinedTextField":          "androidx.compose.material3.OutlinedTextField",
    "CircularProgressIndicator":  "androidx.compose.material3.CircularProgressIndicator",
    "LinearProgressIndicator":    "androidx.compose.material3.LinearProgressIndicator",
    "Divider":                    "androidx.compose.material3.Divider",
    "Surface":                    "androidx.compose.material3.Surface",
    "MaterialTheme":              "androidx.compose.material3.MaterialTheme",
    "ColorScheme":                "androidx.compose.material3.ColorScheme",
    "Typography":                 "androidx.compose.material3.Typography",
    "LazyColumn":                 "androidx.compose.foundation.lazy.LazyColumn",
    "LazyRow":                    "androidx.compose.foundation.lazy.LazyRow",
    "LazyGrid":                   "androidx.compose.foundation.lazy.grid.LazyVerticalGrid",
    "items":                      "androidx.compose.foundation.lazy.items",
    "itemsIndexed":               "androidx.compose.foundation.lazy.itemsIndexed",
    "Alignment":                  "androidx.compose.ui.Alignment",
    "ContentScale":               "androidx.compose.ui.layout.ContentScale",
    "LocalContext":               "androidx.compose.ui.platform.LocalContext",
    "LocalConfiguration":        "androidx.compose.ui.platform.LocalConfiguration",
    "LocalDensity":               "androidx.compose.ui.platform.LocalDensity",
    "LocalFocusManager":         "androidx.compose.ui.platform.LocalFocusManager",
    "KeyboardActions":            "androidx.compose.ui.text.input.KeyboardActions",
    "KeyboardOptions":            "androidx.compose.ui.text.input.KeyboardOptions",
    "ImeAction":                  "androidx.compose.ui.text.input.ImeAction",
    "KeyboardType":               "androidx.compose.ui.text.input.KeyboardType",
    "PasswordVisualTransformation":"androidx.compose.ui.text.input.PasswordVisualTransformation",
    "verticalScroll":             "androidx.compose.foundation.verticalScroll",
    "horizontalScroll":           "androidx.compose.foundation.horizontalScroll",
    "rememberScrollState":        "androidx.compose.foundation.rememberScrollState",
    "rememberCoroutineScope":     "androidx.compose.runtime.rememberCoroutineScope",
    "clickable":                  "androidx.compose.foundation.clickable",
    "background":                 "androidx.compose.foundation.background",
    "border":                     "androidx.compose.foundation.border",
    "clip":                       "androidx.compose.ui.draw.clip",
    "alpha":                      "androidx.compose.ui.draw.alpha",
    "shadow":                     "androidx.compose.ui.draw.shadow",
    "RoundedCornerShape":         "androidx.compose.foundation.shape.RoundedCornerShape",
    "CircleShape":                "androidx.compose.foundation.shape.CircleShape",
    "CutCornerShape":             "androidx.compose.foundation.shape.CutCornerShape",
    "Color":                      "androidx.compose.ui.graphics.Color",
    "Brush":                      "androidx.compose.ui.graphics.Brush",
    "dp":                         "androidx.compose.ui.unit.dp",
    "sp":                         "androidx.compose.ui.unit.sp",
    "Dp":                         "androidx.compose.ui.unit.Dp",
    "TextStyle":                  "androidx.compose.ui.text.TextStyle",
    "FontWeight":                 "androidx.compose.ui.text.font.FontWeight",
    "TextAlign":                  "androidx.compose.ui.text.style.TextAlign",
    "TextOverflow":               "androidx.compose.ui.text.style.TextOverflow",
    "painterResource":            "androidx.compose.ui.res.painterResource",
    "stringResource":             "androidx.compose.ui.res.stringResource",
    "colorResource":              "androidx.compose.ui.res.colorResource",
    "dimensionResource":          "androidx.compose.ui.res.dimensionResource",
    "Image":                      "androidx.compose.foundation.Image",
    # Navigation Compose
    "NavHost":                    "androidx.navigation.compose.NavHost",
    "NavController":              "androidx.navigation.NavController",
    "NavBackStackEntry":          "androidx.navigation.NavBackStackEntry",
    "rememberNavController":      "androidx.navigation.compose.rememberNavController",
    "composable":                 "androidx.navigation.compose.composable",
    # Room
    "Entity":                     "androidx.room.Entity",
    "Dao":                        "androidx.room.Dao",
    "Database":                   "androidx.room.Database",
    "PrimaryKey":                 "androidx.room.PrimaryKey",
    "ForeignKey":                 "androidx.room.ForeignKey",
    "ColumnInfo":                 "androidx.room.ColumnInfo",
    "Index":                      "androidx.room.Index",
    "Insert":                     "androidx.room.Insert",
    "Update":                     "androidx.room.Update",
    "Delete":                     "androidx.room.Delete",
    "Query":                      "androidx.room.Query",
    "Room":                       "androidx.room.Room",
    "RoomDatabase":               "androidx.room.RoomDatabase",
    "TypeConverter":              "androidx.room.TypeConverter",
    "TypeConverters":             "androidx.room.TypeConverters",
    "OnConflictStrategy":         "androidx.room.OnConflictStrategy",
    # Biometric
    "BiometricPrompt":            "androidx.biometric.BiometricPrompt",
    "BiometricManager":           "androidx.biometric.BiometricManager",
    # WorkManager
    "WorkManager":                "androidx.work.WorkManager",
    "OneTimeWorkRequest":         "androidx.work.OneTimeWorkRequest",
    "PeriodicWorkRequest":        "androidx.work.PeriodicWorkRequest",
    "Worker":                     "androidx.work.Worker",
    "CoroutineWorker":            "androidx.work.CoroutineWorker",
    "WorkerParameters":           "androidx.work.WorkerParameters",
    "Data":                       "androidx.work.Data",
    "Constraints":                "androidx.work.Constraints",
    # Coil
    "AsyncImage":                 "coil.compose.AsyncImage",
    "rememberAsyncImagePainter":  "coil.compose.rememberAsyncImagePainter",
    # DataStore
    "DataStore":                  "androidx.datastore.core.DataStore",
    "Preferences":                "androidx.datastore.preferences.core.Preferences",
    "preferencesDataStore":       "androidx.datastore.preferences.preferencesDataStore",
    # Hilt
    "HiltViewModel":              "dagger.hilt.android.lifecycle.HiltViewModel",
    "HiltAndroidApp":             "dagger.hilt.android.HiltAndroidApp",
    "AndroidEntryPoint":          "dagger.hilt.android.AndroidEntryPoint",
    "Inject":                     "javax.inject.Inject",
    # Serialization
    "Serializable":               "kotlinx.serialization.Serializable",
    "SerialName":                 "kotlinx.serialization.SerialName",
    "Json":                       "kotlinx.serialization.json.Json",
}

KOTLIN_UNRESOLVED = re.compile(
    r"^e:\s*(?:file://)?(.+?\.kt):\s*\((\d+),\s*\d+\):\s*Unresolved reference[:.]?\s*'?(\w+)'?",
    re.MULTILINE
)
JAVA_SYMBOL = re.compile(
    r"(.+?\.java):(\d+): error: cannot find symbol[\s\S]*?symbol:\s+\w+\s+(\w+)"
)


# ─── Error classifiers ────────────────────────────────────────────────────────

ERROR_CLASSIFIERS = {
    "MANIFEST_EXPORTED": re.compile(r"android:exported.*must be explicitly specified|Manifest merger failed.*exported", re.I),
    "NAMESPACE_MISSING":  re.compile(r"Namespace not specified|namespace.*missing|set the 'android.namespace'", re.I),
    "COMPILE_SDK":        re.compile(r"compileSdk.*missing|Specify a 'compileSdk'", re.I),
    "JAVA_VERSION":       re.compile(r"jlink.*core-for-system-modules|Unsupported class file.*version|incompatible types.*java.lang", re.I),
    "GRADLE_VERSION":     re.compile(r"Gradle.*requires.*Java|Minimum supported Gradle version", re.I),
    "DUPLICATE_CLASS":    re.compile(r"Duplicate class", re.I),
    "DEP_NOT_FOUND":      re.compile(r"Could not find|Could not resolve|Failed to resolve", re.I),
    "XML_MALFORMED":      re.compile(r"AAPT.*XML|malformed.*xml|Error parsing XML", re.I),
    "KOTLIN_JVM_TARGET":  re.compile(r"jvmTarget.*not supported|KotlinJvmOptions", re.I),
    "MISSING_REPO":       re.compile(r"Could not GET|repositories.*needed|Repository.*not found", re.I),
}


def classify_errors(log: str) -> set:
    found = set()
    for name, pattern in ERROR_CLASSIFIERS.items():
        if pattern.search(log):
            found.add(name)
    return found


# ─── Corrections spécialisées ─────────────────────────────────────────────────

def fix_exported(project_root: str, log: str, fixes: list) -> bool:
    if "MANIFEST_EXPORTED" not in classify_errors(log):
        return False
    changed = False
    for dirpath, _, files in os.walk(project_root):
        if "AndroidManifest.xml" not in files:
            continue
        path = os.path.join(dirpath, "AndroidManifest.xml")
        content = read_text(path) or ""
        # Ajoute android:exported="true" aux activités avec intent-filter sans exported
        new_content = re.sub(
            r'(<activity\b(?![^>]*android:exported)[^>]*?)(\s*>)\s*(<intent-filter)',
            r'\1 android:exported="true"\2\n        \3',
            content
        )
        if new_content != content:
            write_text(path, new_content)
            rel = os.path.relpath(path, project_root)
            fixes.append(f"[MANIFEST_FIX] android:exported ajouté → {rel}")
            changed = True
    return changed


def fix_namespace(project_root: str, log: str, fixes: list) -> bool:
    if "NAMESPACE_MISSING" not in classify_errors(log):
        return False
    # Extrait le namespace depuis les logs (ou le détecte)
    pkg_from_log = None
    m = re.search(r"applicationId\s+['\"]([^'\"]+)['\"]", log)
    if m:
        pkg_from_log = m.group(1)

    changed = False
    for dirpath, _, files in os.walk(project_root):
        for fname in ("build.gradle", "build.gradle.kts"):
            if fname not in files:
                continue
            path = os.path.join(dirpath, fname)
            content = read_text(path) or ""
            if "com.android.application" not in content and "com.android.library" not in content:
                continue
            if "namespace" in content:
                continue
            # Détecte package
            pkg = pkg_from_log
            if not pkg:
                m2 = re.search(r"""applicationId\s+['"]([\w.]+)['"]""", content)
                pkg = m2.group(1) if m2 else "com.example.app"

            sep = "=" if fname.endswith(".kts") else ""
            new_c = re.sub(r"(android\s*\{)", f"\\1\n    namespace {sep}'{pkg}'", content, count=1)
            if new_c != content:
                write_text(path, new_c)
                rel = os.path.relpath(path, project_root)
                fixes.append(f"[GRADLE_FIX] namespace '{pkg}' ajouté → {rel}")
                changed = True
    return changed


def fix_gradle_repositories(project_root: str, log: str, fixes: list) -> bool:
    if "MISSING_REPO" not in classify_errors(log) and "DEP_NOT_FOUND" not in classify_errors(log):
        return False
    changed = False
    for dirpath, _, files in os.walk(project_root):
        for fname in ("build.gradle", "build.gradle.kts"):
            if fname not in files:
                continue
            path = os.path.join(dirpath, fname)
            content = read_text(path) or ""
            if "repositories" not in content:
                continue
            # Vérifie que google() et mavenCentral() sont présents dans repositories {}
            repos_block = re.search(r"repositories\s*\{([^}]+)\}", content, re.DOTALL)
            if repos_block:
                block = repos_block.group(1)
                additions = []
                if "google()" not in block:
                    additions.append("        google()")
                if "mavenCentral()" not in block:
                    additions.append("        mavenCentral()")
                if additions:
                    new_block = block.rstrip() + "\n" + "\n".join(additions) + "\n    "
                    new_c = content[:repos_block.start(1)] + new_block + content[repos_block.end(1):]
                    write_text(path, new_c)
                    rel = os.path.relpath(path, project_root)
                    fixes.append(f"[DEPENDENCY_FIX] google()/mavenCentral() ajoutés → {rel}")
                    changed = True
    return changed


def fix_jvm_target(project_root: str, log: str, fixes: list) -> bool:
    if "JAVA_VERSION" not in classify_errors(log) and "KOTLIN_JVM_TARGET" not in classify_errors(log):
        return False
    changed = False
    for dirpath, _, files in os.walk(project_root):
        for fname in ("build.gradle", "build.gradle.kts"):
            if fname not in files:
                continue
            path = os.path.join(dirpath, fname)
            content = read_text(path) or ""
            if "compileOptions" not in content:
                continue
            # Remplace VERSION_1_8 ou VERSION_8 par VERSION_17
            new_c = re.sub(r"JavaVersion\.VERSION_1_8\b", "JavaVersion.VERSION_17", content)
            new_c = re.sub(r"JavaVersion\.VERSION_8\b",   "JavaVersion.VERSION_17", new_c)
            new_c = re.sub(r"""jvmTarget\s*[=:]\s*['"]1\.8['"]""", 'jvmTarget = "17"', new_c)
            new_c = re.sub(r"""jvmTarget\s*[=:]\s*['"]8['"]""",   'jvmTarget = "17"', new_c)
            if new_c != content:
                write_text(path, new_c)
                rel = os.path.relpath(path, project_root)
                fixes.append(f"[JAVA_FIX] jvmTarget / sourceCompatibility mis à jour → {rel}")
                changed = True
    return changed


# ─── Import fixer (étendu de l'original) ─────────────────────────────────────

def find_source_file(project_root: str, log_path: str):
    candidates = [
        log_path,
        os.path.join(project_root, log_path),
        os.path.join(project_root, os.path.basename(log_path)),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    base = os.path.basename(log_path)
    for dirpath, _, files in os.walk(project_root):
        if base in files:
            return os.path.join(dirpath, base)
    return None


def add_import(file_path: str, import_line: str) -> bool:
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    full_import = f"import {import_line}"
    if full_import in content:
        return False
    lines = content.split("\n")
    insert_at = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("package "):
            insert_at = i + 1
        elif stripped.startswith("import "):
            insert_at = i + 1
        elif stripped and not stripped.startswith("//") and not stripped.startswith("/*"):
            break
    lines.insert(insert_at, full_import)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return True


def fix_imports(log: str, project_root: str, fixes: list, seen: set) -> bool:
    changed = False
    for m in KOTLIN_UNRESOLVED.finditer(log):
        file_hint, line_no, symbol = m.group(1), m.group(2), m.group(3)
        if symbol not in KNOWN_IMPORTS:
            continue
        src = find_source_file(project_root, file_hint)
        if not src:
            continue
        key = (src, symbol)
        if key in seen:
            continue
        seen.add(key)
        if add_import(src, KNOWN_IMPORTS[symbol]):
            fixes.append(f"[IMPORT_FIX] import {KNOWN_IMPORTS[symbol]} → {os.path.relpath(src, project_root)} (l.{line_no})")
            changed = True

    for m in JAVA_SYMBOL.finditer(log):
        file_hint, symbol = m.group(1), m.group(3)
        if symbol not in KNOWN_IMPORTS:
            continue
        src = find_source_file(project_root, file_hint)
        if not src:
            continue
        key = (src, symbol)
        if key in seen:
            continue
        seen.add(key)
        if add_import(src, KNOWN_IMPORTS[symbol]):
            fixes.append(f"[IMPORT_FIX] import {KNOWN_IMPORTS[symbol]} → {os.path.relpath(src, project_root)}")
            changed = True

    return changed


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) != 3:
        print("Usage: heuristic_fix.py <log> <project_root>", file=sys.stderr)
        sys.exit(1)

    log_path, project_root = sys.argv[1], sys.argv[2]
    log = read_text(log_path) or ""

    fixes = []
    seen  = set()
    errors = classify_errors(log)

    if errors:
        print(f"Erreurs classifiées : {', '.join(sorted(errors))}")

    # Corrections dans l'ordre de sécurité (les plus sûres en premier)
    fix_imports(log, project_root, fixes, seen)
    fix_exported(project_root, log, fixes)
    fix_namespace(project_root, log, fixes)
    fix_gradle_repositories(project_root, log, fixes)
    fix_jvm_target(project_root, log, fixes)

    if fixes:
        print("Corrections automatiques appliquées :")
        for f in fixes:
            print("  " + f)
        sys.exit(0)
    else:
        print("Aucune correction automatique reconnue pour cette erreur.")
        sys.exit(1)


if __name__ == "__main__":
    main()
  
