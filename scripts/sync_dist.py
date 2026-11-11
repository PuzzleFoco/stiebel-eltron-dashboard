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
    """Alle YAML-Dateien, die ausgeliefert werden (auch Unterordner für Includes)."""
    return sorted(
        path
        for path in SOURCE_DIR.rglob("*")
        if path.is_file() and path.suffix in {".yaml", ".yml"}
    )


def sync(check: bool) -> int:
    """Spiegelt dashboards/ rekursiv nach dist/ und meldet Abweichungen."""
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
        relative = source.relative_to(SOURCE_DIR)
        target = TARGET_DIR / relative
        if target.is_file() and filecmp.cmp(source, target, shallow=False):
            continue
        changed.append(str(relative))
        if check:
            problems.append(f"dist/{relative} ist nicht aktuell (Quelle: dashboards/{relative})")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            print(f"aktualisiert: dist/{relative}")

    # Verwaiste YAML-Dateien in dist/ (Quelle gelöscht/umbenannt?)
    for target in sorted(TARGET_DIR.rglob("*")):
        if not target.is_file() or target.suffix not in {".yaml", ".yml"}:
            continue
        relative = target.relative_to(TARGET_DIR)
        if not (SOURCE_DIR / relative).is_file():
            problems.append(f"dist/{relative} hat keine Quelle in dashboards/ (bitte löschen)")

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
