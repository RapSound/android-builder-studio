#!/usr/bin/env python3
"""Crée un projet Android de secours déterministe, sans IA.

Le projet produit est volontairement simple : il permet à la chaîne GitHub Actions
livrer un APK installable lorsqu’un ZIP ne peut pas être reconstruit de manière sûre.
Il ne prétend pas reconstituer la logique fonctionnelle manquante du projet importé.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

PACKAGE = "com.androidbuilder.rescue"
APP_NAME = "Android Builder Rescue"

SETTINGS = """pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "AndroidBuilderRescue"
include(":app")
"""

ROOT_BUILD = """plugins {
    id 'com.android.application' version '8.4.0' apply false
}
"""

APP_BUILD = """plugins {
    id 'com.android.application'
}

android {
    namespace 'com.androidbuilder.rescue'
    compileSdk 34

    defaultConfig {
        applicationId 'com.androidbuilder.rescue'
        minSdk 23
        targetSdk 34
        versionCode 1
        versionName '1.0-rescue'
    }
}
"""

MANIFEST = """<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="false"
        android:label="Android Builder Rescue"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
"""

MAIN_ACTIVITY = """package com.androidbuilder.rescue;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(48, 48, 48, 48);
        root.setBackgroundColor(Color.rgb(18, 24, 38));

        TextView title = new TextView(this);
        title.setText("Android Builder Rescue");
        title.setTextColor(Color.WHITE);
        title.setTextSize(26);
        title.setGravity(Gravity.CENTER);

        TextView body = new TextView(this);
        body.setText("L’archive importée ne contenait pas assez d’éléments pour reconstruire son application d’origine.\\n\\nCet APK de secours prouve que la chaîne Android et la signature de débogage fonctionnent. Consultez le rapport de build pour les fichiers manquants.");
        body.setTextColor(Color.rgb(214, 222, 240));
        body.setTextSize(16);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, 32, 0, 0);

        root.addView(title);
        root.addView(body);
        setContentView(root);
    }
}
"""


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def source_summary(root: Path) -> dict:
    kotlin = list(root.rglob("*.kt"))
    java = list(root.rglob("*.java"))
    manifests = list(root.rglob("AndroidManifest.xml"))
    launcher = False
    for manifest in manifests:
        try:
            text = manifest.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if "android.intent.action.MAIN" in text and "android.intent.category.LAUNCHER" in text:
            launcher = True
            break
    return {
        "kotlin_files": len(kotlin),
        "java_files": len(java),
        "manifest_files": len(manifests),
        "launcher_detected": launcher,
    }


def build_rescue(destination: Path, summary: dict, reason: str) -> dict:
    if destination.exists():
        shutil.rmtree(destination)
    write(destination / "settings.gradle", SETTINGS)
    write(destination / "build.gradle", ROOT_BUILD)
    write(destination / "gradle.properties", "android.useAndroidX=true\norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\n")
    write(destination / "app" / "build.gradle", APP_BUILD)
    write(destination / "app" / "src" / "main" / "AndroidManifest.xml", MANIFEST)
    write(destination / "app" / "src" / "main" / "java" / "com" / "androidbuilder" / "rescue" / "MainActivity.java", MAIN_ACTIVITY)

    report = {
        "mode": "fallback-rescue",
        "package": PACKAGE,
        "app_name": APP_NAME,
        "reason": reason,
        "original_project_summary": summary,
        "truthful_notice": "APK de secours généré. La logique métier absente du ZIP original n’a pas été inventée.",
    }
    write(destination / "RESCUE_REPORT.json", json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    write(destination / "README.md", "# Android Builder Rescue\n\nProjet de secours généré automatiquement sans IA. Consultez `RESCUE_REPORT.json` pour connaître la cause du basculement.\n")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Crée un APK Android de secours déterministe.")
    parser.add_argument("source", help="Racine du ZIP Android extrait")
    parser.add_argument("destination", help="Répertoire du projet de secours à créer")
    parser.add_argument("--reason", default="Le projet original ne peut pas être compilé après les réparations déterministes.")
    args = parser.parse_args()

    source = Path(args.source).resolve()
    destination = Path(args.destination).resolve()
    if not source.is_dir():
        print(f"Source introuvable : {source}", file=sys.stderr)
        return 2

    report = build_rescue(destination, source_summary(source), args.reason)
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
  
