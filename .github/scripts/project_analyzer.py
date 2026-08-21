#!/usr/bin/env python3
"""
project_analyzer.py — Analyse complète d'un répertoire de projet Android.

Usage : python3 project_analyzer.py <project_root> [--json]
Sortie JSON sur stdout.
"""
import os
import re
import sys
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

# Ajoute le dossier courant pour repair_utils
sys.path.insert(0, os.path.dirname(__file__))
from repair_utils import (
    walk_files, read_text, detect_package, package_to_path,
    detect_agp_version, detect_gradle_version_from_wrapper,
    RESOURCE_DIRS, is_resource_dir, KOTLIN_VERSION_RE,
)

KOTLIN_EXTS = (".kt",)
JAVA_EXTS   = (".java",)
SOURCE_EXTS = (".kt", ".java")

GRADLE_FILES = {
    "build.gradle", "build.gradle.kts",
    "settings.gradle", "settings.gradle.kts",
    "gradle.properties", "libs.versions.toml",
    "gradlew", "gradlew.bat",
    "gradle-wrapper.jar", "gradle-wrapper.properties",
    "proguard-rules.pro", "consumer-rules.pro", "local.properties",
}

ANDROID_NS = "http://schemas.android.com/apk/res/android"


# ─── Analyse du Manifest ─────────────────────────────────────────────────────

def analyze_manifest(path: str) -> dict:
    result = {
        "path": path,
        "package": None,
        "activities": [],
        "launcher_activity": None,
        "permissions": [],
        "services": [],
        "receivers": [],
        "providers": [],
        "valid_xml": False,
    }
    content = read_text(path)
    if not content:
        return result

    # Détection du package via regex (plus robuste que XML si namespace manquant)
    pm = re.search(r'<manifest[^>]+package\s*=\s*["\']([^"\']+)["\']', content)
    if pm:
        result["package"] = pm.group(1)

    try:
        tree = ET.parse(path)
        root = tree.getroot()
        result["valid_xml"] = True

        if not result["package"]:
            result["package"] = root.get("package")

        ns = {"android": ANDROID_NS}
        app = root.find("application")
        if app is not None:
            for act in app.findall("activity") + app.findall("activity-alias"):
                name = act.get(f"{{{ANDROID_NS}}}name", "")
                exported = act.get(f"{{{ANDROID_NS}}}exported")
                is_launcher = False
                for intf in act.findall("intent-filter"):
                    actions = [a.get(f"{{{ANDROID_NS}}}name","") for a in intf.findall("action")]
                    cats    = [c.get(f"{{{ANDROID_NS}}}name","") for c in intf.findall("category")]
                    if "android.intent.action.MAIN" in actions and "android.intent.category.LAUNCHER" in cats:
                        is_launcher = True
                result["activities"].append({"name": name, "exported": exported, "launcher": is_launcher})
                if is_launcher:
                    result["launcher_activity"] = name

            for svc in app.findall("service"):
                result["services"].append(svc.get(f"{{{ANDROID_NS}}}name", ""))
            for rec in app.findall("receiver"):
                result["receivers"].append(rec.get(f"{{{ANDROID_NS}}}name", ""))
            for prv in app.findall("provider"):
                result["providers"].append(prv.get(f"{{{ANDROID_NS}}}name", ""))

        for perm in root.findall("uses-permission"):
            result["permissions"].append(perm.get(f"{{{ANDROID_NS}}}name", ""))

    except ET.ParseError:
        result["valid_xml"] = False

    return result


# ─── Analyse des fichiers Gradle ─────────────────────────────────────────────

def analyze_gradle(project_root: str, gradle_files: list) -> dict:
    result = {
        "has_root_build": False,
        "has_app_build": False,
        "has_settings": False,
        "has_wrapper_properties": False,
        "has_wrapper_jar": False,
        "has_gradlew": False,
        "has_gradle_properties": False,
        "agp_version": None,
        "kotlin_version": None,
        "gradle_version": None,
        "modules_declared": [],
        "uses_kotlin_dsl": False,
        "dependencies": [],
    }

    for abs_p, rel_p in gradle_files:
        name = os.path.basename(rel_p)
        parts = Path(rel_p).parts

        if name == "gradlew":
            result["has_gradlew"] = True
        if name == "gradle-wrapper.jar":
            result["has_wrapper_jar"] = True
        if name == "gradle.properties":
            result["has_gradle_properties"] = True
        if name == "gradle-wrapper.properties":
            result["has_wrapper_properties"] = True
            content = read_text(abs_p) or ""
            v = detect_gradle_version_from_wrapper(content)
            if v:
                result["gradle_version"] = v

        if name in ("build.gradle", "build.gradle.kts"):
            if name.endswith(".kts"):
                result["uses_kotlin_dsl"] = True
            content = read_text(abs_p) or ""
            depth = len(parts)
            if depth == 1:
                result["has_root_build"] = True
                agp = detect_agp_version(content)
                if agp:
                    result["agp_version"] = agp
            elif depth == 2:
                result["has_app_build"] = True
                if not result["agp_version"]:
                    agp = detect_agp_version(content)
                    if agp:
                        result["agp_version"] = agp

            # Dépendances
            for m in re.finditer(r'(implementation|api|kapt|ksp|annotationProcessor)\s*\(?\s*["\']([^"\']+)["\']', content):
                dep = {"type": m.group(1), "artifact": m.group(2)}
                if dep not in result["dependencies"]:
                    result["dependencies"].append(dep)

            # Kotlin version
            km = KOTLIN_VERSION_RE.search(content)
            if km and not result["kotlin_version"]:
                result["kotlin_version"] = km.group(1) or km.group(2)

        if name in ("settings.gradle", "settings.gradle.kts"):
            result["has_settings"] = True
            content = read_text(abs_p) or ""
            mods = re.findall(r"""include\s+['"]:?([\w:./]+)['"]""", content)
            result["modules_declared"] = mods

    return result


# ─── Analyse principale ───────────────────────────────────────────────────────

def analyze_project(project_root: str) -> dict:
    project_root = os.path.abspath(project_root)

    analysis = {
        "project_root": project_root,
        "modules": [],
        "sourceSets": [],
        "manifests": [],
        "resources": [],
        "gradleFiles": [],
        "kotlinFiles": [],
        "javaFiles": [],
        "possiblePackages": [],
        "launcherActivities": [],
        "missingFiles": [],
        "misplacedFiles": [],
        "duplicates": [],
        "gradle": {},
        "score": {},
    }

    # ── Collecte brute ────────────────────────────────────────────────────────
    all_files = list(walk_files(project_root))
    manifests_raw  = []
    gradle_raw     = []
    kt_files       = []
    java_files     = []
    res_files      = []

    for abs_p, rel_p in all_files:
        name = os.path.basename(rel_p)
        if name == "AndroidManifest.xml":
            manifests_raw.append((abs_p, rel_p))
        if name in GRADLE_FILES or name.endswith((".gradle", ".gradle.kts", ".toml")):
            gradle_raw.append((abs_p, rel_p))
        if abs_p.endswith(KOTLIN_EXTS):
            kt_files.append((abs_p, rel_p))
        if abs_p.endswith(JAVA_EXTS):
            java_files.append((abs_p, rel_p))

        # Ressources
        parts = Path(rel_p).parts
        for i, part in enumerate(parts):
            if is_resource_dir(part):
                res_files.append((abs_p, rel_p))
                break

    analysis["kotlinFiles"] = [r for _, r in kt_files]
    analysis["javaFiles"]   = [r for _, r in java_files]
    analysis["gradleFiles"] = [r for _, r in gradle_raw]
    analysis["resources"]   = [r for _, r in res_files]

    # ── Packages ──────────────────────────────────────────────────────────────
    packages = set()
    for abs_p, rel_p in kt_files + java_files:
        pkg = detect_package(abs_p)
        if pkg:
            packages.add(pkg)
    analysis["possiblePackages"] = sorted(packages)

    # ── Manifests ─────────────────────────────────────────────────────────────
    manifest_infos = []
    for abs_p, rel_p in manifests_raw:
        info = analyze_manifest(abs_p)
        info["rel_path"] = rel_p
        manifest_infos.append(info)
        if info["launcher_activity"]:
            analysis["launcherActivities"].append({
                "activity": info["launcher_activity"],
                "package": info["package"],
                "manifest": rel_p,
            })
    analysis["manifests"] = manifest_infos

    # ── Gradle ────────────────────────────────────────────────────────────────
    analysis["gradle"] = analyze_gradle(project_root, gradle_raw)

    # ── Modules / SourceSets ──────────────────────────────────────────────────
    source_roots = {}  # module_root -> {lang, java_files, kt_files}
    for abs_p, rel_p in kt_files + java_files:
        lang = "kotlin" if abs_p.endswith(".kt") else "java"
        for marker in ("src/main/kotlin/", "src/main/java/",
                       "src/debug/kotlin/", "src/debug/java/",
                       "src/release/kotlin/", "src/release/java/",
                       "src/test/kotlin/", "src/test/java/",
                       "src/androidTest/kotlin/", "src/androidTest/java/"):
            idx = rel_p.find(marker)
            if idx != -1:
                module_root = rel_p[:idx].rstrip("/")
                if module_root not in source_roots:
                    source_roots[module_root] = {"lang": lang, "files": 0}
                source_roots[module_root]["files"] += 1
                break

    analysis["modules"] = [{"root": k, **v} for k, v in source_roots.items()]

    # ── Fichiers mal placés ───────────────────────────────────────────────────
    misplaced = []

    # Sources Kotlin/Java en dehors de src/main/{kotlin,java}
    for abs_p, rel_p in kt_files + java_files:
        lang = "kotlin" if abs_p.endswith(".kt") else "java"
        if "src/main/kotlin/" not in rel_p and "src/main/java/" not in rel_p \
           and "src/test/" not in rel_p and "src/androidTest/" not in rel_p \
           and "src/debug/" not in rel_p and "src/release/" not in rel_p:
            pkg = detect_package(abs_p)
            if pkg:
                sub = "kotlin" if lang == "kotlin" else "java"
                expected = f"app/src/main/{sub}/{package_to_path(pkg)}/{os.path.basename(rel_p)}"
                misplaced.append({
                    "file": rel_p,
                    "reason": f"source hors de src/main — package détecté: {pkg}",
                    "expected": expected,
                    "category": "SOURCE",
                })

    # Manifest hors de src/main
    for info in manifest_infos:
        rel = info["rel_path"]
        if "src/main/AndroidManifest.xml" not in rel and \
           "src/debug/AndroidManifest.xml" not in rel and \
           "src/release/AndroidManifest.xml" not in rel:
            misplaced.append({
                "file": rel,
                "reason": "AndroidManifest.xml hors de src/main/",
                "expected": "app/src/main/AndroidManifest.xml",
                "category": "MANIFEST",
            })

    # Ressources hors de src/main/res
    for abs_p, rel_p in res_files:
        if "src/main/res/" not in rel_p:
            parts = Path(rel_p).parts
            for i, part in enumerate(parts):
                if is_resource_dir(part):
                    expected = "app/src/main/res/" + "/".join(parts[i:])
                    misplaced.append({
                        "file": rel_p,
                        "reason": f"ressource hors de src/main/res/",
                        "expected": expected,
                        "category": "RESOURCE",
                    })
                    break

    analysis["misplacedFiles"] = misplaced

    # ── Fichiers manquants ────────────────────────────────────────────────────
    gradle = analysis["gradle"]
    missing = []
    if not gradle["has_root_build"]:
        missing.append({"file": "build.gradle", "category": "GRADLE"})
    if not gradle["has_settings"]:
        missing.append({"file": "settings.gradle", "category": "GRADLE"})
    if not gradle["has_gradle_properties"]:
        missing.append({"file": "gradle.properties", "category": "GRADLE"})
    if not gradle["has_wrapper_properties"]:
        missing.append({"file": "gradle/wrapper/gradle-wrapper.properties", "category": "WRAPPER"})
    if not gradle["has_wrapper_jar"]:
        missing.append({"file": "gradle/wrapper/gradle-wrapper.jar", "category": "WRAPPER"})
    if not gradle["has_gradlew"]:
        missing.append({"file": "gradlew", "category": "WRAPPER"})
    if not manifest_infos:
        missing.append({"file": "app/src/main/AndroidManifest.xml", "category": "MANIFEST"})
    if not (gradle["has_app_build"] or any("build.gradle" in r for r in analysis["gradleFiles"] if "/" in r)):
        missing.append({"file": "app/build.gradle", "category": "GRADLE"})

    analysis["missingFiles"] = missing

    # ── Doublons ─────────────────────────────────────────────────────────────
    from collections import defaultdict
    by_name = defaultdict(list)
    for _, rel_p in all_files:
        by_name[os.path.basename(rel_p)].append(rel_p)
    analysis["duplicates"] = [
        {"name": n, "paths": paths}
        for n, paths in by_name.items()
        if len(paths) > 1 and n in {"AndroidManifest.xml", "build.gradle", "build.gradle.kts",
                                     "settings.gradle", "settings.gradle.kts", "MainActivity.kt", "MainActivity.java"}
    ]

    # ── Score de préparation ──────────────────────────────────────────────────
    checks = {
        "sources": bool(kt_files or java_files),
        "manifest": bool(any("src/main/AndroidManifest.xml" in i["rel_path"] for i in manifest_infos)),
        "root_gradle": gradle["has_root_build"],
        "app_gradle": gradle["has_app_build"],
        "settings": gradle["has_settings"],
        "gradle_properties": gradle["has_gradle_properties"],
        "wrapper": gradle["has_gradlew"] and gradle["has_wrapper_jar"],
        "no_misplaced": len(misplaced) == 0,
    }
    score = sum(1 for v in checks.values() if v)
    analysis["score"] = {
        "total": score,
        "max": len(checks),
        "pct": round(score / len(checks) * 100),
        "checks": checks,
    }

    # ── sourceSets résumés ────────────────────────────────────────────────────
    seen_ss = set()
    for abs_p, rel_p in kt_files + java_files:
        for ss in ("src/main", "src/debug", "src/release", "src/test", "src/androidTest"):
            if ss in rel_p:
                key = rel_p[:rel_p.index(ss) + len(ss)]
                if key not in seen_ss:
                    seen_ss.add(key)
                    analysis["sourceSets"].append(key)

    return analysis


# ─── CLI ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: project_analyzer.py <project_root> [--json]", file=sys.stderr)
        sys.exit(1)

    root = sys.argv[1]
    result = analyze_project(root)

    if "--json" in sys.argv or True:
        print(json.dumps(result, indent=2, ensure_ascii=False))
              
