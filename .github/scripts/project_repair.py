#!/usr/bin/env python3
"""
project_repair.py — Moteur de reconstruction automatique d'un projet Android.

Usage : python3 project_repair.py <project_root> [--dry-run]
Sortie : repair-report.json dans <project_root>/../repair-report.json
Code de sortie : 0 = réparations effectuées ou pas nécessaires, 1 = projet non reconstructible.
"""
import os
import re
import sys
import json
import shutil
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from repair_utils import (
    walk_files, read_text, write_text, detect_package, package_to_path,
    is_resource_dir, safe_move, load_report, save_report, log_action,
    snapshot_dir,
)
from project_analyzer import analyze_project

DRY_RUN = "--dry-run" in sys.argv

QUARANTINE = ".repair/quarantine"

# ─── Reconstruction de la structure source ───────────────────────────────────

def repair_sources(project_root: str, analysis: dict, report: dict):
    """Déplace les fichiers .kt/.java hors de src/main vers le bon chemin."""
    for entry in analysis["misplacedFiles"]:
        if entry["category"] != "SOURCE":
            continue
        src  = os.path.join(project_root, entry["file"])
        dst  = os.path.join(project_root, entry["expected"])
        if not os.path.isfile(src):
            continue
        if DRY_RUN:
            print(f"[DRY] MOVE {entry['file']} → {entry['expected']}  ({entry['reason']})")
            continue
        safe_move(src, dst, os.path.join(project_root, QUARANTINE), report)
        log_action(report, "moved",
                   from_=entry["file"], to=entry["expected"], reason=entry["reason"])
        print(f"[MOVE] {entry['file']} → {entry['expected']}")


# ─── Reconstruction du Manifest ──────────────────────────────────────────────

def repair_manifest(project_root: str, analysis: dict, report: dict):
    """Déplace/génère AndroidManifest.xml."""
    manifests = analysis["manifests"]

    # Manifest déjà au bon endroit → rien à faire
    correct = [m for m in manifests if "src/main/AndroidManifest.xml" in m["rel_path"]]
    if correct:
        return

    # Manifest mal placé → déplacer le premier candidat
    misplaced_manifests = [m for m in manifests if "src/debug" not in m["rel_path"]
                           and "src/release" not in m["rel_path"]]
    if misplaced_manifests:
        best = misplaced_manifests[0]
        # Déterminer le module cible
        modules = analysis.get("modules", [])
        mod_root = modules[0]["root"] if modules else "app"
        dst_rel = f"{mod_root}/src/main/AndroidManifest.xml"
        src = os.path.join(project_root, best["rel_path"])
        dst = os.path.join(project_root, dst_rel)
        if DRY_RUN:
            print(f"[DRY] MOVE Manifest {best['rel_path']} → {dst_rel}")
            return
        safe_move(src, dst, os.path.join(project_root, QUARANTINE), report)
        log_action(report, "moved",
                   from_=best["rel_path"], to=dst_rel, reason="manifest hors de src/main")
        print(f"[MOVE] Manifest {best['rel_path']} → {dst_rel}")
        return

    # Aucun manifest → en générer un
    _generate_manifest(project_root, analysis, report)


def _generate_manifest(project_root: str, analysis: dict, report: dict):
    modules = analysis.get("modules", [])
    mod_root = modules[0]["root"] if modules else "app"
    dst_rel = f"{mod_root}/src/main/AndroidManifest.xml"
    dst = os.path.join(project_root, dst_rel)

    # Activité principale
    launcher_acts = analysis.get("launcherActivities", [])
    act_info = launcher_acts[0] if launcher_acts else None

    # Package
    packages = analysis.get("possiblePackages", [])
    pkg = (act_info["package"] if act_info else None) or (packages[0] if packages else "com.example.app")

    act_block = ""
    if act_info:
        cls = act_info["activity"]
        if not cls.startswith(".") and pkg and cls.startswith(pkg):
            cls = "." + cls[len(pkg):]
        act_block = f"""        <activity
            android:name="{cls}"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>\n"""

    content = f"""<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="{pkg}">

    <application
        android:allowBackup="true"
        android:label="Application"
        android:supportsRtl="true">
{act_block}    </application>

</manifest>
"""
    if DRY_RUN:
        print(f"[DRY] CREATE {dst_rel}")
        return
    write_text(dst, content)
    log_action(report, "created", file=dst_rel, reason="manifest absent — généré")
    print(f"[CREATE] {dst_rel}")


# ─── Reconstruction des ressources ───────────────────────────────────────────

def repair_resources(project_root: str, analysis: dict, report: dict):
    """Déplace les ressources hors de src/main/res vers le bon endroit."""
    modules = analysis.get("modules", [])
    mod_root = modules[0]["root"] if modules else "app"

    for entry in analysis["misplacedFiles"]:
        if entry["category"] != "RESOURCE":
            continue
        src = os.path.join(project_root, entry["file"])
        dst = os.path.join(project_root, entry["expected"].replace("app/", mod_root + "/", 1))
        if not os.path.isfile(src):
            continue
        if DRY_RUN:
            print(f"[DRY] MOVE resource {entry['file']} → {entry['expected']}")
            continue
        safe_move(src, dst, os.path.join(project_root, QUARANTINE), report)
        log_action(report, "moved",
                   from_=entry["file"], to=entry["expected"], reason=entry["reason"])
        print(f"[MOVE] resource {entry['file']} → {entry['expected']}")


# ─── Détection de la vraie racine (suppression des racines parasites) ─────────

def flatten_root(project_root: str, report: dict) -> bool:
    """
    Si le projet a une racine parasite (MonProjet/MonProjet/app/...) on monte tout.
    Retourne True si un aplatissement a été fait.
    """
    items = [i for i in os.listdir(project_root) if not i.startswith(".")]
    if len(items) != 1:
        return False
    sub = os.path.join(project_root, items[0])
    if not os.path.isdir(sub):
        return False
    sub_items = os.listdir(sub)
    android_hints = {"app", "build.gradle", "build.gradle.kts", "settings.gradle",
                     "settings.gradle.kts", "gradlew", "src"}
    if not any(i in android_hints for i in sub_items):
        return False

    # Aplatit
    if DRY_RUN:
        print(f"[DRY] FLATTEN racine parasite '{items[0]}/'")
        return True
    tmp = project_root + ".__flatten_tmp__"
    shutil.move(sub, tmp)
    for name in os.listdir(tmp):
        src = os.path.join(tmp, name)
        dst = os.path.join(project_root, name)
        if not os.path.exists(dst):
            shutil.move(src, dst)
    shutil.rmtree(tmp, ignore_errors=True)
    log_action(report, "modified", file=project_root,
               reason=f"racine parasite '{items[0]}/' aplatie")
    print(f"[FLATTEN] racine parasite '{items[0]}/' supprimée")
    return True


# ─── Point d'entrée ──────────────────────────────────────────────────────────

def repair(project_root: str) -> dict:
    project_root = os.path.abspath(project_root)
    report_path  = os.path.join(project_root, "..", "repair-report.json")
    report       = load_report(report_path)

    # 1. Snapshot
    snapshot_dst = os.path.join(project_root, "..", "project-original")
    if not os.path.exists(snapshot_dst):
        try:
            snapshot_dir(project_root, snapshot_dst)
            print(f"[SNAPSHOT] Sauvegarde dans {snapshot_dst}")
        except Exception as e:
            print(f"[WARN] Snapshot impossible : {e}")

    # 2. Aplatir si nécessaire
    changed = True
    passes  = 0
    while changed and passes < 3:
        changed = flatten_root(project_root, report)
        passes += 1

    # 3. Analyser
    print("[ANALYZE] Analyse du projet en cours…")
    analysis = analyze_project(project_root)

    # 4. Vérification minimale
    has_sources = bool(analysis["kotlinFiles"] or analysis["javaFiles"])
    if not has_sources:
        print("[ERROR] Aucun code source Android trouvé (.kt ou .java). Reconstruction impossible.")
        log_action(report, "errors", msg="Aucun code source — reconstruction impossible")
        save_report(report_path, report)
        sys.exit(1)

    # 5. Réparations dans l'ordre
    repair_sources(project_root, analysis, report)
    repair_resources(project_root, analysis, report)
    repair_manifest(project_root, analysis, report)

    # 6. Gradle / wrapper → délégué à gradle_repair.py
    from gradle_repair import repair_gradle
    repair_gradle(project_root, analysis, report)

    # 7. Re-analyse post-réparation
    analysis2 = analyze_project(project_root)
    report["post_repair_score"] = analysis2["score"]

    save_report(report_path, report)

    # 8. Résumé
    print("\n=== RÉSUMÉ DES RÉPARATIONS ===")
    print(f"  Déplacés    : {len(report.get('moved', []))}")
    print(f"  Créés       : {len(report.get('created', []))}")
    print(f"  Modifiés    : {len(report.get('modified', []))}")
    print(f"  Avertissements : {len(report.get('warnings', []))}")
    print(f"  Score final : {analysis2['score']['pct']}% ({analysis2['score']['total']}/{analysis2['score']['max']})")

    return report


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: project_repair.py <project_root> [--dry-run]", file=sys.stderr)
        sys.exit(1)
    repair(sys.argv[1])
      
