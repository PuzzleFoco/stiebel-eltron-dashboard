#!/usr/bin/env python3
"""Synchronisiert die kanonischen Jinja-Blöcke in die Dashboard-Karten.

Die Makros (Resolver, Status, Discovery) und der Funktionskatalog stehen genau
einmal unter `dashboards/templates/jinja/`. In den Karten stehen Marker:

    {# @@SYNC:templates/jinja/resolver.j2@@ #}
    … generierter Block …
    {# @@END@@ #}

`sync_jinja.py` ersetzt den Block zwischen den Markern durch den Inhalt der
Quelldatei (eingerückt wie der Marker). Damit gibt es keine Kopien, die
auseinanderlaufen. `.j2`-Dateien werden nicht nach `dist/` ausgeliefert; sie
sind reine Entwicklungsquellen.

Aufruf:
    python scripts/sync_jinja.py           # schreiben
    python scripts/sync_jinja.py --check   # nur prüfen (Exit 1 bei Abweichung)
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "dashboards"
TEMPLATE_DIR = SOURCE_DIR / "templates" / "jinja"

MARKER_RE = re.compile(r"^(?P<indent>[ \t]*)\{#\s*@@SYNC:(?P<source>[^@]+?)\s*@@\s*#\}[ \t]*$", re.MULTILINE)
END_RE = re.compile(r"^[ \t]*\{#\s*@@END\s*@@\s*#\}[ \t]*$")


class SyncError(RuntimeError):
    """Marker oder Quelle sind inkonsistent."""


def yaml_files() -> list[Path]:
    """Alle Karten-/View-YAMLs, die Marker enthalten dürfen."""
    return sorted(
        path
        for path in SOURCE_DIR.rglob("*")
        if path.is_file()
        and path.suffix in {".yaml", ".yml"}
        and TEMPLATE_DIR not in path.parents
    )


def expand(path: Path) -> tuple[str, bool]:
    """Marker in einer Datei ersetzen. Rückgabe: (neuer Text, geändert)."""
    lines = path.read_text(encoding="utf-8").split("\n")
    output: list[str] = []
    changed = False
    index = 0

    while index < len(lines):
        line = lines[index]
        marker = MARKER_RE.match(line)
        if marker is None:
            if "@@SYNC" in line:
                raise SyncError(f"{path.relative_to(ROOT)}:{index + 1}: SYNC-Marker nicht erkannt")
            output.append(line)
            index += 1
            continue

        end = index + 1
        while end < len(lines) and END_RE.match(lines[end]) is None:
            if MARKER_RE.match(lines[end]):
                raise SyncError(
                    f"{path.relative_to(ROOT)}:{end + 1}: verschachtelter SYNC-Marker "
                    f"vor @@END@@"
                )
            end += 1
        if end >= len(lines):
            raise SyncError(f"{path.relative_to(ROOT)}:{index + 1}: @@END@@ fehlt")

        source = ROOT / "dashboards" / marker.group("source")
        if not source.is_file():
            raise SyncError(f"{path.relative_to(ROOT)}:{index + 1}: Quelle fehlt: {source}")

        indent = marker.group("indent")
        body = [
            (indent + source_line) if source_line.strip() else ""
            for source_line in source.read_text(encoding="utf-8").rstrip("\n").split("\n")
        ]

        output.append(line)
        output.extend(body)
        output.append(lines[end])

        if lines[index + 1 : end] != body:
            changed = True
        index = end + 1

    return "\n".join(output), changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="nichts schreiben, nur prüfen")
    args = parser.parse_args()

    if not TEMPLATE_DIR.is_dir():
        print(f"FEHLER: Vorlagenordner fehlt: {TEMPLATE_DIR}")
        return 1

    used: set[Path] = set()
    problems: list[str] = []
    changed: list[str] = []

    for path in yaml_files():
        text = path.read_text(encoding="utf-8")
        for match in MARKER_RE.finditer(text):
            used.add((SOURCE_DIR / match.group("source")).resolve())

        try:
            new_text, is_changed = expand(path)
        except SyncError as exception:
            problems.append(str(exception))
            continue

        if not is_changed:
            continue
        changed.append(str(path.relative_to(ROOT)))
        if args.check:
            problems.append(f"{path.relative_to(ROOT)}: Jinja-Block ist nicht aktuell")
        else:
            path.write_text(new_text, encoding="utf-8")
            print(f"aktualisiert: {path.relative_to(ROOT)}")

    for template in sorted(TEMPLATE_DIR.rglob("*.j2")):
        if template.resolve() not in used:
            print(f"WARNUNG: {template.relative_to(ROOT)} wird von keiner Karte verwendet")

    if args.check:
        for problem in problems:
            print(f"FEHLER: {problem}")
        if problems:
            print("Hinweis: 'python scripts/sync_jinja.py' ausführen und Ergebnis committen.")
            return 1
        print(f"OK: alle Jinja-Blöcke sind synchron ({len(used)} Quelle(n))")
        return 0

    if problems:
        for problem in problems:
            print(f"FEHLER: {problem}")
        return 1

    print(f"OK: {len(changed)} Datei(en) aktualisiert")
    return 0


if __name__ == "__main__":
    sys.exit(main())
