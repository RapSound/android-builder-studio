#!/usr/bin/env python3
"""
android_repair.py — Réparations spécifiques Android : Manifest, ressources, structure.

Usage autonome : python3 android_repair.py <project_root>
"""
import os
import re
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(__file__))
from repair_utils import (
    walk_files, read_text, write_text, log_action,
    detect_package, is_resource_dir, safe_move,
)

DRY_RUN = "--dry-run" in sys.argv
ANDROID_NS = "http://schemas.android.com/apk/res/android"


# ─── Validation XML du Manifest ──────────────────────────────────────────────

def validate_and_fix_manifest(project_root: str, report: dict):
    """Vérifie et répare les problèmes XML courants dans les manifests."""
    for abs_p, rel_p in walk_files(project_root):
        if os.path.basename(abs_p) != "AndroidManifest.xml":
            continue
        content = read_text(abs_p)
        if not content:
            continue
        modified = False

        # xmlns:android manquant
        if 'xmlns:android=' not in content and '<manifest' in content:
            content = content.replace(
                "<manifest",
                '<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
                1
            )
            modified = True
            print(f"[FIX] xmlns:android ajouté dans {rel_p}")

        # package manquant dans <manifest>
        pkg = detect_package(abs_p)
        if not pkg:
            # Cherche dans les fichiers sources
            for abs_s, _ in walk_files(project_root):
                if abs_s.endswith((".kt", ".java")):
                    pkg = detect_package(abs_s)
                    if pkg:
                        break
        if pkg and 'package="' not in content and '<manifest' in content:
            content = content.replace(
                "<manifest",
                f'<manifest\n    package="{pkg}"',
                1
            )
            modified = True
            print(f"[FIX] package='{pkg}' ajouté dans {rel_p}")

        # android:exported manquant sur activités avec intent-filter
        try:
            tree = ET.parse(abs_p)
            root_el = tree.getroot()
            needs_fix = False
            app_el = root_el.find("application")
            if app_el is not None:
                for act in app_el.findall("activity"):
                    has_filter = act.find("intent-filter") is not None
                    has_exported = act.get(f"{{{ANDROID_NS}}}exported") is not None
                    if has_filter and not has_exported:
                        needs_fix = True
                        break
            if needs_fix:
                # Répare via regex (plus sûr que réécrire l'AST XML)
                new_c = re.sub(
                    r'(<activity\b(?![^>]*android:exported)[^>]*?)(\s*/?>)',
                    lambda m: m.group(1) + ' android:exported="true"' + m.group(2)
                    if '<intent-filter' in content[content.find(m.group(0)):content.find(m.group(0))+500]
                    else m.group(0),
                    content
                )
                if new_c != content:
                    content = new_c
                    modified = True
                    print(f"[FIX] android:exported ajouté dans {rel_p}")
        except ET.ParseError:
            log_action(report, "warnings", msg=f"Manifest XML invalide : {rel_p}")

        if modified and not DRY_RUN:
            write_text(abs_p, content)
            log_action(report, "modified", file=rel_p, reason="réparation Manifest XML")


# ─── Vérification des ressources ─────────────────────────────────────────────

def validate_resources(project_root: str, report: dict):
    """Détecte les ressources dupliquées ou mal nommées."""
    issues = []
    for abs_p, rel_p in walk_files(project_root):
        if "src/main/res/" not in rel_p:
            continue
        # Vérifie les noms de fichiers res (doit être snake_case)
        name = os.path.splitext(os.path.basename(abs_p))[0]
        if re.search(r'[A-Z]', name):
            issues.append(f"Ressource avec majuscules (peut causer une erreur AAPT) : {rel_p}")
            log_action(report, "warnings",
                       msg=f"Ressource avec majuscules : {rel_p}")

    if issues:
        print(f"[WARN] {len(issues)} problème(s) de ressources détecté(s)")


# ─── Vérification des dépendances dans le code ───────────────────────────────

COMMON_IMPORT_DEPS = {
    "androidx.compose": "androidx.compose.ui:ui",
    "androidx.room": "androidx.room:room-runtime",
    "androidx.navigation": "androidx.navigation:navigation-compose",
    "androidx.work": "androidx.work:work-runtime-ktx",
    "androidx.biometric": "androidx.biometric:biometric",
    "coil": "io.coil-kt:coil-compose",
    "retrofit2": "com.squareup.retrofit2:retrofit",
    "okhttp3": "com.squareup.okhttp3:okhttp",
    "dagger.hilt": "com.google.dagger:hilt-android",
    "kotlinx.coroutines": "org.jetbrains.kotlinx:kotlinx-coroutines-android",
    "kotlinx.serialization": "org.jetbrains.kotlinx:kotlinx-serialization-json",
    "com.google.firebase": "com.google.firebase:firebase-bom",
    "com.google.android.gms": "com.google.android.gms:play-services-base",
}

def suggest_missing_dependencies(project_root: str, analysis: dict, report: dict):
    """Analyse les imports du code source et suggère des dépendances manquantes."""
    existing_deps = set()
    for dep in analysis.get("gradle", {}).get("dependencies", []):
        existing_deps.add(dep.get("artifact", ""))

    import_prefixes_used = set()
    for abs_p, _ in walk_files(project_root):
        if not abs_p.endswith((".kt", ".java")):
            continue
        content = read_text(abs_p) or ""
        for line in content.splitlines():
            m = re.match(r"^\s*import\s+([\w.]+)", line)
            if m:
                import_prefixes_used.add(m.group(1))

    suggestions = []
    for prefix, dep in COMMON_IMPORT_DEPS.items():
        used = any(imp.startswith(prefix) for imp in import_prefixes_used)
        declared = any(dep.split(":")[0] in d for d in existing_deps)
        if used and not declared:
            suggestions.append({"import_prefix": prefix, "suggested_dep": dep})

    if suggestions:
        log_action(report, "warnings",
                   msg="Dépendances potentiellement manquantes",
                   suggestions=suggestions)
        print(f"[HINT] {len(suggestions)} dépendance(s) potentiellement manquante(s) détectée(s)")
        for s in suggestions:
            print(f"       import '{s['import_prefix']}.*' → {s['suggested_dep']}")


# ─── Entrée principale ────────────────────────────────────────────────────────

def repair_android(project_root: str, analysis: dict, report: dict):
    validate_and_fix_manifest(project_root, report)
    validate_resources(project_root, report)
    suggest_missing_dependencies(project_root, analysis, report)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: android_repair.py <project_root> [--dry-run]", file=sys.stderr)
        sys.exit(1)
    from project_analyzer import analyze_project
    from repair_utils import load_report, save_report

    root     = sys.argv[1]
    report   = load_report(os.path.join(root, "..", "repair-report.json"))
    analysis = analyze_project(root)
    repair_android(root, analysis, report)
    save_report(os.path.join(root, "..", "repair-report.json"), report)
          
