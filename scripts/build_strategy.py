#!/usr/bin/env python3
"""Baut die HACS-fähige Dashboard-Strategie als eine JavaScript-Datei.

Die Quelle bleibt `dashboards/` (YAML mit !include). Daraus entsteht
`stiebel-eltron-dashboard.js` im Repository-Root:

  * `DASHBOARD_CONFIG` – die vollständig aufgelöste Dashboard-Konfiguration
  * die Laufzeit aus `scripts/strategy_runtime.js`, die
      - die Strategie `custom:stiebel-eltron` registriert und
      - die `custom:auto-entities`-Karten zur Laufzeit je Anlage auflöst.

Damit ist die HACS-Installation eine einzige JS-Datei; weder YAML-Dateien
noch die Karte `auto-entities` werden dafür benötigt.

Aufruf:
    python scripts/build_strategy.py            # schreiben
    python scripts/build_strategy.py --check    # nur prüfen (Exit 1)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "dashboards" / "stiebel_eltron.yaml"
RUNTIME = ROOT / "scripts" / "strategy_runtime.js"
TARGET = ROOT / "stiebel-eltron-dashboard.js"
CHANGELOG = ROOT / "CHANGELOG.md"
PLACEHOLDER_VERSION = "__VERSION__"


class IncludeLoader(yaml.SafeLoader):
    """SafeLoader, der !include relativ zur einbindenden Datei auflöst."""

    base: Path


def _include(loader: IncludeLoader, node: yaml.Node) -> Any:
    target = (loader.base / loader.construct_scalar(node)).resolve()
    text = target.read_text(encoding="utf-8")
    child = IncludeLoader(text)
    child.base = target.parent
    try:
        return child.get_single_data()
    finally:
        child.dispose()


IncludeLoader.add_constructor("!include", _include)


def load_dashboard() -> dict[str, Any]:
    """Dashboard-YAML inklusive aller Includes laden."""
    loader = IncludeLoader(SOURCE.read_text(encoding="utf-8"))
    loader.base = SOURCE.parent
    try:
        data = loader.get_single_data()
    finally:
        loader.dispose()
    if not isinstance(data, dict) or not isinstance(data.get("views"), list):
        raise SystemExit("abgebrochen: Dashboard-YAML hat keine 'views'-Liste")
    return data


def current_version() -> str:
    """Erste Version aus dem Changelog (ohne führendes v)."""
    match = re.search(r"^## \[(\d+\.\d+\.\d+)\]", CHANGELOG.read_text(encoding="utf-8"), re.M)
    if not match:
        raise SystemExit("abgebrochen: keine Version im CHANGELOG gefunden")
    return match.group(1)


def render(version: str | None = None) -> str:
    """JavaScript-Datei als Text erzeugen."""
    config = load_dashboard()
    resolved_version = version or current_version()
    runtime = RUNTIME.read_text(encoding="utf-8")
    if PLACEHOLDER_VERSION not in runtime:
        raise SystemExit(f"abgebrochen: {PLACEHOLDER_VERSION} fehlt in {RUNTIME.name}")

    config_json = json.dumps(config, ensure_ascii=False, indent=1)
    header = (
        "/*\n"
        " * stiebel-eltron-dashboard.js -- GENERIERT, NICHT BEARBEITEN.\n"
        " * Quelle: dashboards/ + scripts/strategy_runtime.js\n"
        " * Bauen: python scripts/build_strategy.py\n"
        f" * Version: {resolved_version}\n"
        " *\n"
        " * HACS-Kategorie Dashboard (plugin). Registriert die Lovelace-\n"
        " * Dashboard-Strategie `custom:stiebel-eltron`.\n"
        " */\n\n"
        f"const DASHBOARD_CONFIG = {config_json};\n\n"
    )
    return header + runtime.replace(PLACEHOLDER_VERSION, resolved_version)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="nur prüfen, nichts schreiben")
    parser.add_argument("--version", help="Version für den Marker (Default: CHANGELOG)")
    args = parser.parse_args()

    content = render(args.version)

    if args.check:
        if not TARGET.is_file():
            print(f"FEHLER: {TARGET.name} fehlt (python scripts/build_strategy.py ausführen)")
            return 1
        if TARGET.read_text(encoding="utf-8") != content:
            print(f"FEHLER: {TARGET.name} ist nicht aktuell (python scripts/build_strategy.py ausführen)")
            return 1
        print(f"OK: {TARGET.name} ist aktuell ({len(content)} Zeichen)")
        return 0

    TARGET.write_text(content, encoding="utf-8")
    print(f"OK: {TARGET.name} geschrieben ({len(content)} Zeichen, Version {args.version or current_version()})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
