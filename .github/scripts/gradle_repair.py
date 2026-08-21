#!/usr/bin/env python3
"""
gradle_repair.py — Réparation Gradle : fichiers manquants, compatibilité AGP/Gradle/Java,
                   détection de la version, génération du wrapper.

Usage autonome : python3 gradle_repair.py <project_root>
Également appelable depuis project_repair.py.
"""
import os
import re
import sys
import json

sys.path.insert(0, os.path.dirname(__file__))
from repair_utils import (
    walk_files, read_text, write_text, log_action,
    detect_agp_version, detect_gradle_version_from_wrapper,
    compatible_gradle_for_agp, version_tuple,
)

DRY_RUN = "--dry-run" in sys.argv

# ─── Templates ───────────────────────────────────────────────────────────────

GRADLE_PROPERTIES_DEFAULT = """\
android.useAndroidX=true
android.nonTransitiveRClass=true
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
org.gradle.configuration-cache=false
"""

WRAPPER_PROPERTIES_TEMPLATE = """\
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-{version}-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
"""

ROOT_BUILD_GROOVY = """\
plugins {{
    id 'com.android.application' version '{agp}' apply false
    {kotlin_line}
}}
"""

ROOT_BUILD_KTS = """\
plugins {{
    id("com.android.application") version "{agp}" apply false
    {kotlin_line}
}}
"""

SETTINGS_GROOVY = """\
pluginManagement {{
    repositories {{
        google()
        mavenCentral()
        gradlePluginPortal()
    }}
}}
dependencyResolutionManagement {{
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {{
        google()
        mavenCentral()
    }}
}}
rootProject.name = "{name}"
{includes}
"""

SETTINGS_KTS = """\
pluginManagement {{
    repositories {{
        google()
        mavenCentral()
        gradlePluginPortal()
    }}
}}
dependencyResolutionManagement {{
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {{
        google()
        mavenCentral()
    }}
}}
rootProject.name = "{name}"
{includes}
"""

APP_BUILD_GROOVY = """\
plugins {{
    id 'com.android.application'
    {kotlin_plugin}
}}

android {{
    namespace '{pkg}'
    compileSdk {compile_sdk}

    defaultConfig {{
        applicationId "{pkg}"
        minSdk {min_sdk}
        targetSdk {target_sdk}
        versionCode 1
        versionName "1.0"
    }}

    buildTypes {{
        release {{
            minifyEnabled false
        }}
    }}

    compileOptions {{
        sourceCompatibility JavaVersion.VERSION_{java}
        targetCompatibility JavaVersion.VERSION_{java}
    }}
    {kotlin_options}
}}

dependencies {{
    implementation 'androidx.core:core-ktx:1.13.1'
    implementation 'androidx.appcompat:appcompat:1.7.0'
    implementation 'com.google.android.material:material:1.12.0'
}}
"""

APP_BUILD_KTS = """\
plugins {{
    id("com.android.application")
    {kotlin_plugin}
}}

android {{
    namespace = "{pkg}"
    compileSdk = {compile_sdk}

    defaultConfig {{
        applicationId = "{pkg}"
        minSdk = {min_sdk}
        targetSdk = {target_sdk}
        versionCode = 1
        versionName = "1.0"
    }}

    buildTypes {{
        release {{
            isMinifyEnabled = false
        }}
    }}

    compileOptions {{
        sourceCompatibility = JavaVersion.VERSION_{java}
        targetCompatibility = JavaVersion.VERSION_{java}
    }}
    {kotlin_options}
}}

dependencies {{
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
}}
"""


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _best_agp(gradle_version: str) -> str:
    """Renvoie un AGP compatible avec une version Gradle donnée."""
    gv = version_tuple(gradle_version)
    # Table inverse simplifiée
    if gv >= version_tuple("8.6"): return "8.4.0"
    if gv >= version_tuple("8.4"): return "8.3.2"
    if gv >= version_tuple("8.2"): return "8.2.2"
    if gv >= version_tuple("8.0"): return "8.1.4"
    if gv >= version_tuple("7.5"): return "7.4.2"
    if gv >= version_tuple("7.4"): return "7.3.1"
    if gv >= version_tuple("7.3"): return "7.2.2"
    return "7.4.2"

def _detect_lang(analysis: dict) -> str:
    return "kotlin" if analysis.get("kotlinFiles") else "java"

def _detect_package(analysis: dict) -> str:
    pkgs = analysis.get("possiblePackages", [])
    manifests = analysis.get("manifests", [])
    for m in manifests:
        if m.get("package"):
            return m["package"]
    return pkgs[0] if pkgs else "com.example.app"

def _detect_modules(analysis: dict) -> list:
    mods = analysis.get("modules", [])
    roots = [m["root"] for m in mods if m["root"]]
    return roots if roots else ["app"]


# ─── Repair functions ─────────────────────────────────────────────────────────

def _ensure_gradle_properties(project_root: str, report: dict):
    path = os.path.join(project_root, "gradle.properties")
    if os.path.isfile(path):
        # Vérifie qu'AndroidX est activé
        content = read_text(path) or ""
        if "android.useAndroidX" not in content:
            new_content = content.rstrip() + "\nandroid.useAndroidX=true\nandroid.nonTransitiveRClass=true\n"
            if not DRY_RUN:
                write_text(path, new_content)
                log_action(report, "modified", file="gradle.properties",
                           reason="android.useAndroidX absent — ajouté")
            print("[MODIFY] gradle.properties — android.useAndroidX ajouté")
        return

    if DRY_RUN:
        print("[DRY] CREATE gradle.properties")
        return
    write_text(path, GRADLE_PROPERTIES_DEFAULT)
    log_action(report, "created", file="gradle.properties", reason="fichier absent — généré")
    print("[CREATE] gradle.properties")


def _ensure_wrapper(project_root: str, gradle_info: dict, report: dict):
    """Génère gradle-wrapper.properties si absent. Le jar sera généré par CI."""
    props_path = os.path.join(project_root, "gradle", "wrapper", "gradle-wrapper.properties")

    # Choisir la bonne version Gradle
    agp = gradle_info.get("agp_version") or "8.4.0"
    existing_gradle = gradle_info.get("gradle_version")

    if existing_gradle:
        # Vérifier compatibilité
        gmin, grec, java = compatible_gradle_for_agp(agp)
        if version_tuple(existing_gradle) < version_tuple(gmin):
            target = grec
            print(f"[COMPAT] Gradle {existing_gradle} trop ancien pour AGP {agp} — mise à jour vers {target}")
        else:
            target = existing_gradle
    else:
        _, target, _ = compatible_gradle_for_agp(agp)

    if not os.path.isfile(props_path):
        if DRY_RUN:
            print(f"[DRY] CREATE gradle/wrapper/gradle-wrapper.properties (Gradle {target})")
            return
        content = WRAPPER_PROPERTIES_TEMPLATE.format(version=target)
        write_text(props_path, content)
        log_action(report, "created",
                   file="gradle/wrapper/gradle-wrapper.properties",
                   reason=f"absent — généré pour Gradle {target} / AGP {agp}")
        print(f"[CREATE] gradle/wrapper/gradle-wrapper.properties (Gradle {target})")
    else:
        # Mettre à jour si nécessaire
        content = read_text(props_path) or ""
        current = detect_gradle_version_from_wrapper(content)
        if current and current != target and version_tuple(current) < version_tuple(target):
            new_content = re.sub(
                r"distributionUrl=.+",
                f"distributionUrl=https\\://services.gradle.org/distributions/gradle-{target}-bin.zip",
                content
            )
            if not DRY_RUN:
                write_text(props_path, new_content)
                log_action(report, "modified",
                           file="gradle/wrapper/gradle-wrapper.properties",
                           reason=f"Gradle {current} → {target} pour AGP {agp}")
            print(f"[MODIFY] wrapper Gradle {current} → {target}")


def _ensure_settings(project_root: str, analysis: dict, gradle_info: dict, report: dict):
    has_s   = gradle_info.get("has_settings")
    use_kts = gradle_info.get("uses_kotlin_dsl", False)
    fname   = "settings.gradle.kts" if use_kts else "settings.gradle"
    path    = os.path.join(project_root, fname)

    if has_s:
        return

    modules = _detect_modules(analysis)
    if use_kts:
        includes = "\n".join(f'include(":{m}")' for m in modules)
        content  = SETTINGS_KTS.format(name="GeneratedProject", includes=includes)
    else:
        includes = "\n".join(f"include ':{m}'" for m in modules)
        content  = SETTINGS_GROOVY.format(name="GeneratedProject", includes=includes)

    if DRY_RUN:
        print(f"[DRY] CREATE {fname}")
        return
    write_text(path, content)
    log_action(report, "created", file=fname, reason="absent — généré")
    print(f"[CREATE] {fname}")


def _ensure_root_build(project_root: str, analysis: dict, gradle_info: dict, report: dict):
    if gradle_info.get("has_root_build"):
        return
    use_kts = gradle_info.get("uses_kotlin_dsl", False)
    lang    = _detect_lang(analysis)
    agp     = gradle_info.get("agp_version") or "8.4.0"
    kv      = gradle_info.get("kotlin_version") or "1.9.24"
    fname   = "build.gradle.kts" if use_kts else "build.gradle"
    path    = os.path.join(project_root, fname)

    if use_kts:
        kl = f'id("org.jetbrains.kotlin.android") version "{kv}" apply false' if lang == "kotlin" else ""
        content = ROOT_BUILD_KTS.format(agp=agp, kotlin_line=kl)
    else:
        kl = f"id 'org.jetbrains.kotlin.android' version '{kv}' apply false" if lang == "kotlin" else ""
        content = ROOT_BUILD_GROOVY.format(agp=agp, kotlin_line=kl)

    if DRY_RUN:
        print(f"[DRY] CREATE {fname}")
        return
    write_text(path, content)
    log_action(report, "created", file=fname, reason="build.gradle racine absent — généré")
    print(f"[CREATE] {fname}")


def _ensure_app_build(project_root: str, analysis: dict, gradle_info: dict, report: dict):
    # Vérifie si un build.gradle module existe déjà
    has_app = gradle_info.get("has_app_build")
    if has_app:
        return

    modules = _detect_modules(analysis)
    mod     = modules[0]
    use_kts = gradle_info.get("uses_kotlin_dsl", False)
    lang    = _detect_lang(analysis)
    pkg     = _detect_package(analysis)
    agp     = gradle_info.get("agp_version") or "8.4.0"
    _, _, java = compatible_gradle_for_agp(agp)
    fname   = "build.gradle.kts" if use_kts else "build.gradle"
    path    = os.path.join(project_root, mod, fname)

    if os.path.isfile(path):
        return

    kp = ko = ""
    if lang == "kotlin":
        kp = 'id("org.jetbrains.kotlin.android")' if use_kts else "id 'org.jetbrains.kotlin.android'"
        ko = f'kotlinOptions {{ jvmTarget = "{java}" }}' if not use_kts else f'kotlinOptions {{ jvmTarget = "{java}" }}'

    params = dict(pkg=pkg, compile_sdk=35, min_sdk=24, target_sdk=35,
                  java=java, kotlin_plugin=kp, kotlin_options=ko)

    content = (APP_BUILD_KTS if use_kts else APP_BUILD_GROOVY).format(**params)

    if DRY_RUN:
        print(f"[DRY] CREATE {mod}/{fname}")
        return
    write_text(path, content)
    log_action(report, "created", file=f"{mod}/{fname}", reason="build.gradle module absent — généré")
    print(f"[CREATE] {mod}/{fname}")


def _fix_namespace(project_root: str, analysis: dict, report: dict):
    """Ajoute namespace manquant dans les build.gradle (AGP >= 8 l'exige)."""
    pkg = _detect_package(analysis)
    for abs_p, rel_p in walk_files(project_root):
        if os.path.basename(abs_p) not in ("build.gradle", "build.gradle.kts"):
            continue
        content = read_text(abs_p) or ""
        if "com.android.application" not in content and "com.android.library" not in content:
            continue
        if "namespace" in content:
            continue
        # Injecter namespace dans le bloc android {}
        new_content = re.sub(
            r"(android\s*\{)",
            f"\\1\n    namespace '{pkg}'",
            content, count=1
        )
        if new_content != content:
            if not DRY_RUN:
                write_text(abs_p, new_content)
                log_action(report, "modified", file=rel_p,
                           reason=f"namespace manquant — ajouté: {pkg}")
            print(f"[MODIFY] namespace ajouté dans {rel_p}")


def _fix_exported(project_root: str, report: dict):
    """Ajoute android:exported="true" aux activités avec intent-filter si manquant."""
    for abs_p, rel_p in walk_files(project_root):
        if os.path.basename(abs_p) != "AndroidManifest.xml":
            continue
        content = read_text(abs_p) or ""
        if "android:exported" in content:
            continue
        # Ajoute exported="true" aux activités avec intent-filter
        new_content = re.sub(
            r'(<activity\b)([^>]*?)(>)\s*(<intent-filter)',
            r'\1\2 android:exported="true"\3\n        \4',
            content
        )
        if new_content != content:
            if not DRY_RUN:
                write_text(abs_p, new_content)
                log_action(report, "modified", file=rel_p,
                           reason="android:exported manquant sur activité avec intent-filter")
            print(f"[MODIFY] android:exported ajouté dans {rel_p}")


# ─── Entrée principale ────────────────────────────────────────────────────────

def repair_gradle(project_root: str, analysis: dict, report: dict):
    gradle_info = analysis.get("gradle", {})

    _ensure_gradle_properties(project_root, report)
    _ensure_wrapper(project_root, gradle_info, report)
    _ensure_settings(project_root, analysis, gradle_info, report)
    _ensure_root_build(project_root, analysis, gradle_info, report)
    _ensure_app_build(project_root, analysis, gradle_info, report)
    _fix_namespace(project_root, analysis, report)
    _fix_exported(project_root, report)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: gradle_repair.py <project_root> [--dry-run]", file=sys.stderr)
        sys.exit(1)

    import json
    from project_analyzer import analyze_project
    from repair_utils import load_report, save_report

    root    = sys.argv[1]
    report  = load_report(os.path.join(root, "..", "repair-report.json"))
    analysis = analyze_project(root)
    repair_gradle(root, analysis, report)
    save_report(os.path.join(root, "..", "repair-report.json"), report)
              
