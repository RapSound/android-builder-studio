#!/usr/bin/env python3
"""
Correction heuristique déterministe des erreurs de compilation Android
les plus courantes — PAS d'IA, PAS d'appel réseau, PAS de coût.

Portée volontairement limitée : ce script ne comprend pas le code, il
reconnaît des motifs mécaniques bien identifiés (import manquant pour un
symbole Android/Kotlin/Compose/Room/Navigation/Biometric/WorkManager connu)
et les corrige. Toute erreur de logique métier reste hors de portée et
remonte normalement dans les logs pour correction manuelle.

Usage : heuristic_fix.py <chemin_log_gradle> <racine_projet>
Sortie : imprime un résumé des corrections appliquées sur stdout.
Code de sortie : 0 si au moins une correction a été appliquée, 1 sinon
(le workflow s'arrête alors, inutile de recompiler à l'identique).
"""
import re
import sys
import os

# Symbole -> chemin d'import complet.
# Liste volontairement bornée aux cas les plus fréquents (Core Android,
# Lifecycle, Coroutines, Compose, Navigation, Room, Biometric, WorkManager).
KNOWN_IMPORTS = {
    # Core Android
    "Log": "android.util.Log",
    "Context": "android.content.Context",
    "Intent": "android.content.Intent",
    "Bundle": "android.os.Bundle",
    "View": "android.view.View",
    "ViewGroup": "android.view.ViewGroup",
    "LayoutInflater": "android.view.LayoutInflater",
    "TextView": "android.widget.TextView",
    "Button": "android.widget.Button",
    "EditText": "android.widget.EditText",
    "Toast": "android.widget.Toast",
    "SharedPreferences": "android.content.SharedPreferences",
    "AppCompatActivity": "androidx.appcompat.app.AppCompatActivity",
    "ComponentActivity": "androidx.activity.ComponentActivity",
    "FragmentActivity": "androidx.fragment.app.FragmentActivity",
    "RecyclerView": "androidx.recyclerview.widget.RecyclerView",
    "LinearLayoutManager": "androidx.recyclerview.widget.LinearLayoutManager",
    # Lifecycle / ViewModel
    "ViewModel": "androidx.lifecycle.ViewModel",
    "ViewModelProvider": "androidx.lifecycle.ViewModelProvider",
    "LiveData": "androidx.lifecycle.LiveData",
    "MutableLiveData": "androidx.lifecycle.MutableLiveData",
    "viewModels": "androidx.activity.viewModels",
    "lifecycleScope": "androidx.lifecycle.lifecycleScope",
    # Coroutines / Flow
    "CoroutineScope": "kotlinx.coroutines.CoroutineScope",
    "Dispatchers": "kotlinx.coroutines.Dispatchers",
    "Flow": "kotlinx.coroutines.flow.Flow",
    "StateFlow": "kotlinx.coroutines.flow.StateFlow",
    "MutableStateFlow": "kotlinx.coroutines.flow.MutableStateFlow",
    "collectAsState": "androidx.compose.runtime.collectAsState",
    "collectAsStateWithLifecycle": "androidx.lifecycle.compose.collectAsStateWithLifecycle",
    # Compose
    "Composable": "androidx.compose.runtime.Composable",
    "remember": "androidx.compose.runtime.remember",
    "rememberSaveable": "androidx.compose.runtime.saveable.rememberSaveable",
    "mutableStateOf": "androidx.compose.runtime.mutableStateOf",
    "LaunchedEffect": "androidx.compose.runtime.LaunchedEffect",
    "DisposableEffect": "androidx.compose.runtime.DisposableEffect",
    "SideEffect": "androidx.compose.runtime.SideEffect",
    "Modifier": "androidx.compose.ui.Modifier",
    "Column": "androidx.compose.foundation.layout.Column",
    "Row": "androidx.compose.foundation.layout.Row",
    "Box": "androidx.compose.foundation.layout.Box",
    "Text": "androidx.compose.material3.Text",
    "Scaffold": "androidx.compose.material3.Scaffold",
    "TopAppBar": "androidx.compose.material3.TopAppBar",
    "FloatingActionButton": "androidx.compose.material3.FloatingActionButton",
    "NavigationBar": "androidx.compose.material3.NavigationBar",
    "LazyColumn": "androidx.compose.foundation.lazy.LazyColumn",
    "LazyRow": "androidx.compose.foundation.lazy.LazyRow",
    "Alignment": "androidx.compose.ui.Alignment",
    "PaddingValues": "androidx.compose.foundation.layout.PaddingValues",
    "MaterialTheme": "androidx.compose.material3.MaterialTheme",
    "verticalScroll": "androidx.compose.foundation.verticalScroll",
    "horizontalScroll": "androidx.compose.foundation.horizontalScroll",
    "rememberScrollState": "androidx.compose.foundation.rememberScrollState",
    "rememberCoroutineScope": "androidx.compose.runtime.rememberCoroutineScope",
    # Navigation Compose
    "NavHost": "androidx.navigation.compose.NavHost",
    "NavController": "androidx.navigation.NavController",
    "rememberNavController": "androidx.navigation.compose.rememberNavController",
    # Room
    "Entity": "androidx.room.Entity",
    "Dao": "androidx.room.Dao",
    "Database": "androidx.room.Database",
    "PrimaryKey": "androidx.room.PrimaryKey",
    "ForeignKey": "androidx.room.ForeignKey",
    "Insert": "androidx.room.Insert",
    "Update": "androidx.room.Update",
    "Delete": "androidx.room.Delete",
    "Query": "androidx.room.Query",
    "Room": "androidx.room.Room",
    "RoomDatabase": "androidx.room.RoomDatabase",
    "TypeConverters": "androidx.room.TypeConverters",
    # Biometric
    "BiometricPrompt": "androidx.biometric.BiometricPrompt",
    "BiometricManager": "androidx.biometric.BiometricManager",
    # WorkManager
    "WorkManager": "androidx.work.WorkManager",
    "OneTimeWorkRequest": "androidx.work.OneTimeWorkRequest",
    "PeriodicWorkRequest": "androidx.work.PeriodicWorkRequest",
    "Worker": "androidx.work.Worker",
    "WorkerParameters": "androidx.work.WorkerParameters",
    # Coil
    "AsyncImage": "coil.compose.AsyncImage",
}

KOTLIN_UNRESOLVED = re.compile(r"^e:\s*(?:file://)?(.+?\.kt):\s*\((\d+),\s*\d+\):\s*Unresolved reference[:.]?\s*'?(\w+)'?", re.MULTILINE)
JAVA_SYMBOL = re.compile(r"(.+?\.java):(\d+): error: cannot find symbol[\s\S]*?symbol:\s+\w+\s+(\w+)")


def find_source_file(project_root, log_path):
    """Le chemin dans le log peut être absolu (runner) ou relatif ; on le
    ramène à un chemin réel sous project_root."""
    candidates = [
        log_path,
        os.path.join(project_root, log_path),
        os.path.join(project_root, os.path.basename(log_path)),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    # dernier recours : recherche par nom de fichier dans l'arborescence
    base = os.path.basename(log_path)
    for dirpath, _, files in os.walk(project_root):
        if base in files:
            return os.path.join(dirpath, base)
    return None


def add_import(file_path, import_line):
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


def main():
    if len(sys.argv) != 3:
        print("Usage: heuristic_fix.py <log> <project_root>", file=sys.stderr)
        sys.exit(1)

    log_path, project_root = sys.argv[1], sys.argv[2]
    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        log = f.read()

    fixes = []
    seen = set()

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
            fixes.append(f"+ import {KNOWN_IMPORTS[symbol]}  →  {os.path.relpath(src, project_root)} (référence non résolue : {symbol}, ligne {line_no})")

    for m in JAVA_SYMBOL.finditer(log):
        file_hint, symbol = m.group(1), m.group(2)
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
            fixes.append(f"+ import {KNOWN_IMPORTS[symbol]}  →  {os.path.relpath(src, project_root)} (symbole introuvable : {symbol})")

    if fixes:
        print("Corrections automatiques appliquées (imports manquants) :")
        for f in fixes:
            print("  " + f)
        sys.exit(0)
    else:
        print("Aucune correction automatique reconnue pour cette erreur.")
        sys.exit(1)


if __name__ == "__main__":
    main()
