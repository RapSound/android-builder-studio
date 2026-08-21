#!/usr/bin/env python3
"""
repair_utils.py — Fonctions communes partagées par tous les scripts de réparation.
"""
import os
import re
import json
import shutil
import hashlib
from pathlib import Path
from typing import Optional


# ─── Compatibilité AGP / Gradle / Java ────────────────────────────────────────

AGP_GRADLE_JAVA = [
    # (agp_min, agp_max, gradle_min, gradle_recommended, java_version)
    ("8.4", "8.99", "8.6", "8.7",  "17"),
    ("8.3", "8.3",  "8.4", "8.5",  "17"),
    ("8.2", "8.2",  "8.2", "8.3",  "17"),
    ("8.1", "8.1",  "8.0", "8.1",  "17"),
    ("8.0", "8.0",  "8.0", "8.0",  "17"),
    ("7.4", "7.99", "7.5", "7.6",  "11"),
    ("7.3", "7.3",  "7.4", "7.4",  "11"),
    ("7.2", "7.2",  "7.3", "7.4",  "11"),
    ("7.1", "7.1",  "7.2", "7.3",  "11"),
    ("7.0", "7.0",  "7.0", "7.2",  "11"),
    ("4.2", "4.99", "6.7", "7.0",  "11"),
    ("4.1", "4.1",  "6.5", "6.7",  "11"),
    ("4.0", "4.0",  "6.1", "6.5",  "11"),
    ("0.0", "3.99", "5.6", "6.5",  "8"),
]

def version_tuple(v: str):
    try:
        return tuple(int(x) for x in str(v).split("."))
    except Exception:
        return (0,)

def compatible_gradle_for_agp(agp_version: str):
    """Retourne (gradle_min, gradle_recommended, java_version) pour un AGP donné."""
    av = version_tuple(agp_version)
    for agp_min, agp_max, gmin, grec, java in AGP_GRADLE_JAVA:
        if version_tuple(agp_min) <= av <= version_tuple(agp_max):
            return gmin, grec, java
    return "8.0", "8.7", "17"


# ─── Snapshot / rapport ───────────────────────────────────────────────────────

def load_report(path: str) -> dict:
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"moved": [], "created": [], "modified": [], "deleted": [], "warnings": [], "errors": []}

def save_report(path: str, report: dict):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

def log_action(report: dict, action: str, **kwargs):
    entry = {k: v for k, v in kwargs.items()}
    if action in report:
        report[action].append(entry)

def snapshot_dir(src: str, dst: str):
    """Copie src → dst sans écraser si dst existe déjà."""
    if os.path.exists(dst):
        return
    shutil.copytree(src, dst, symlinks=False)


# ─── Lecture de fichier sûre ─────────────────────────────────────────────────

def read_text(path: str) -> Optional[str]:
    for enc in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            with open(path, "r", encoding=enc, errors="replace") as f:
                return f.read()
        except Exception:
            pass
    return None

def write_text(path: str, content: str):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def file_hash(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ─── Marche dans l'arborescence ──────────────────────────────────────────────

def walk_files(root: str):
    """Génère (abs_path, rel_path) pour tous les fichiers sous root."""
    root = os.path.abspath(root)
    for dirpath, _, files in os.walk(root):
        for fname in files:
            abs_p = os.path.join(dirpath, fname)
            rel_p = os.path.relpath(abs_p, root)
            yield abs_p, rel_p

def find_files_by_name(root: str, name: str):
    results = []
    for abs_p, rel_p in walk_files(root):
        if os.path.basename(abs_p) == name:
            results.append((abs_p, rel_p))
    return results

def find_files_by_ext(root: str, ext: str):
    results = []
    for abs_p, rel_p in walk_files(root):
        if abs_p.endswith(ext):
            results.append((abs_p, rel_p))
    return results

def find_files_by_exts(root: str, exts: tuple):
    results = []
    for abs_p, rel_p in walk_files(root):
        if any(abs_p.endswith(e) for e in exts):
            results.append((abs_p, rel_p))
    return results


# ─── Détection du package ─────────────────────────────────────────────────────

PACKAGE_RE = re.compile(r"^\s*package\s+([\w.]+)\s*;?\s*$", re.MULTILINE)

def detect_package(file_path: str) -> Optional[str]:
    content = read_text(file_path)
    if not content:
        return None
    m = PACKAGE_RE.search(content)
    return m.group(1) if m else None

def package_to_path(package: str) -> str:
    return package.replace(".", "/")


# ─── Détection de ressource Android ─────────────────────────────────────────

RESOURCE_DIRS = {
    "drawable", "drawable-hdpi", "drawable-mdpi", "drawable-xhdpi",
    "drawable-xxhdpi", "drawable-xxxhdpi", "drawable-v24", "drawable-night",
    "mipmap", "mipmap-hdpi", "mipmap-mdpi", "mipmap-xhdpi",
    "mipmap-xxhdpi", "mipmap-xxxhdpi", "mipmap-anydpi-v26",
    "values", "values-night", "values-v21", "values-v27", "values-v31",
    "layout", "xml", "raw", "menu", "navigation", "font", "anim",
    "animator", "color", "transition", "interpolator",
}

def is_resource_dir(dirname: str) -> bool:
    base = dirname.split("-")[0]
    return base in RESOURCE_DIRS or dirname in RESOURCE_DIRS


def is_resource_dir_in_context(parts, index) -> bool:
    """True seulement si parts[index] est à la fois un nom de dossier ressource
    reconnu ET un enfant direct d'un dossier "res" (le seul endroit où Android
    résout réellement les ressources). Évite les faux positifs sur des segments
    de package Kotlin/Java qui partagent un nom avec un dossier ressource —
    ex. com/.../navigation/, com/.../color/, com/.../menu/ — qui ne sont PAS
    sous res/ et ne doivent jamais être déplacés là-bas.

    C'est le correctif du bug qui déplaçait
    app/src/main/java/.../navigation/NavGraph.kt vers
    app/src/main/res/navigation/NavGraph.kt : "navigation" matchait
    RESOURCE_DIRS sans vérifier qu'il s'agissait bien d'un sous-dossier de res/.
    """
    if not is_resource_dir(parts[index]):
        return False
    return index > 0 and parts[index - 1] == "res"


# ─── Détection AGP dans Gradle ───────────────────────────────────────────────

AGP_PLUGIN_RE = re.compile(
    r"(?:id\s+['\"]com\.android\.application['\"].*?version\s+['\"]([^'\"]+)['\"]"
    r"|com\.android\.tools\.build:gradle:([^\s'\"]+))",
    re.MULTILINE
)
GRADLE_VERSION_RE = re.compile(r"gradle-(\d+\.\d+(?:\.\d+)?)-")
KOTLIN_VERSION_RE = re.compile(
    r"(?:id\s+['\"]org\.jetbrains\.kotlin\.android['\"].*?version\s+['\"]([^'\"]+)['\"]"
    r"|kotlin_version\s*=\s*['\"]([^'\"]+)['\"])"
)

def detect_agp_version(gradle_content: str) -> Optional[str]:
    m = AGP_PLUGIN_RE.search(gradle_content)
    if m:
        return m.group(1) or m.group(2)
    return None

def detect_gradle_version_from_wrapper(props_content: str) -> Optional[str]:
    m = GRADLE_VERSION_RE.search(props_content)
    return m.group(1) if m else None


# ─── Safe move ───────────────────────────────────────────────────────────────

def safe_move(src: str, dst: str, quarantine_base: str, report: dict):
    """Déplace src vers dst. Si dst existe déjà, met l'ancien en quarantaine."""
    os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
    if os.path.exists(dst):
        if file_hash(src) == file_hash(dst):
            os.remove(src)
            return
        q_path = os.path.join(quarantine_base, os.path.basename(dst) + ".bak")
        os.makedirs(quarantine_base, exist_ok=True)
        shutil.move(dst, q_path)
        log_action(report, "warnings",
                   msg=f"Fichier existant déplacé en quarantaine : {dst} → {q_path}")
    shutil.move(src, dst)
    
