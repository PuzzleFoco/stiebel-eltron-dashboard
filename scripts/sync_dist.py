#!/usr/bin/env python3
"""Synchronisiert die Dashboard-Quellen aus dashboards/ nach dist/.

HACS liefert bei der Kategorie "Dashboard" (intern "plugin") ausschließlich
den Inhalt von dist/ aus. Quelle der Wahrheit ist deshalb dashboards/;
dist/ ist generiert und wird hier byte-genau gespiegelt.

Aufruf:
    python scripts/sync_dist.py           # schreiben
    python scripts/sync_dist.py --check   # nur prüfen (Exit 1 bei Abweichung)
"""

from __future__ import annotations

import argparse
import filecmp
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "dashboards"
TARGET_DIR = ROOT / "dist"


def source_files() -> list[Path]:
    """Alle YAML-Dashboards, die ausgeliefert werden."""
    return sorted(SOURCE_DIR.glob("*.yaml"))


def sync(check: bool) -> int:
    """Spiegelt dashboards/*.yaml nach dist/ und meldet Abweichungen."""
    if not SOURCE_DIR.is_dir():
        print(f"FEHLER: Quellordner fehlt: {SOURCE_DIR}")
        return 1

    files = source_files()
    if not files:
        print(f"FEHLER: keine Dashboard-YAML in {SOURCE_DIR}")
        return 1

    problems: list[str] = []
    changed: list[str] = []

    for source in files:
        target = TARGET_DIR / source.name
        if target.is_file() and filecmp.cmp(source, target, shallow=False):
            continue
        changed.append(source.name)
        if check:
            problems.append(f"dist/{source.name} ist nicht aktuell (Quelle: dashboards/{source.name})")
        else:
            TARGET_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            print(f"aktualisiert: dist/{source.name}")

    # Verwaiste YAML-Dateien in dist/ (Quelle gelöscht/umbenannt?)
    for target in sorted(TARGET_DIR.glob("*.yaml")):
        if not (SOURCE_DIR / target.name).is_file():
            problems.append(f"dist/{target.name} hat keine Quelle in dashboards/ (bitte löschen)")

    if check:
        if problems:
            for problem in problems:
                print(f"FEHLER: {problem}")
            print("Hinweis: 'python scripts/sync_dist.py' ausführen und Ergebnis committen.")
            return 1
        print(f"OK: dist/ ist synchron ({len(files)} Datei(en))")
        return 0

    print(f"OK: {len(changed)} Datei(en) aktualisiert")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="nichts schreiben, nur prüfen ob dist/ aktuell ist",
    )
    args = parser.parse_args()
    return sync(check=args.check)


if __name__ == "__main__":
    sys.exit(main())
