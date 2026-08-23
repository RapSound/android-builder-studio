#!/usr/bin/env python3
"""Extraction ZIP sécurisée pour Android Builder Studio, sans IA."""

from __future__ import annotations

import argparse
import json
import shutil
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath

MAX_FILES = 20_000
MAX_UNCOMPRESSED_BYTES = 1_500 * 1024 * 1024
MAX_RATIO = 200


def is_safe_member(info: zipfile.ZipInfo) -> bool:
    name = info.filename.replace("\\", "/")
    path = PurePosixPath(name)
    if not name or path.is_absolute() or ".." in path.parts:
        return False
    # Les liens symboliques pourraient extraire vers une destination non prévue.
    mode = info.external_attr >> 16
    return not stat.S_ISLNK(mode)


def extract(archive: Path, destination: Path) -> dict:
    if not archive.is_file():
        raise ValueError(f"Archive introuvable : {archive}")
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)

    with zipfile.ZipFile(archive) as bundle:
        members = [entry for entry in bundle.infolist() if not entry.is_dir()]
        if len(members) > MAX_FILES:
            raise ValueError(f"Archive refusée : {len(members)} fichiers (limite {MAX_FILES}).")
        total = sum(entry.file_size for entry in members)
        if total > MAX_UNCOMPRESSED_BYTES:
            raise ValueError("Archive refusée : taille décompressée excessive.")
        for entry in members:
            if not is_safe_member(entry):
                raise ValueError(f"Archive refusée : chemin ou lien non sûr ({entry.filename}).")
            if entry.compress_size and entry.file_size / entry.compress_size > MAX_RATIO:
                raise ValueError(f"Archive refusée : ratio de compression suspect ({entry.filename}).")
        bundle.extractall(destination)

    return {
        "archive": str(archive),
        "destination": str(destination),
        "files": len(members),
        "uncompressed_bytes": total,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extrait une archive ZIP Android de façon sûre.")
    parser.add_argument("archive")
    parser.add_argument("destination")
    args = parser.parse_args()
    try:
        report = extract(Path(args.archive).resolve(), Path(args.destination).resolve())
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps({"ok": True, **report}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
      
