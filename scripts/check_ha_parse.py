#!/usr/bin/env python3
"""Prüft die Dashboard-YAML mit Home Assistants eigenem YAML-Loader.

Home Assistant validiert Lovelace-Karten nicht serverseitig (das macht das
Frontend), parst die YAML-Datei aber selbst – genau an dieser Stelle scheitern
kaputte Dashboards ("Error loading dashboard"). Dieses Skript nutzt deshalb
denselben Code wie HA (`homeassistant.util.yaml.load_yaml_dict`, aufgerufen aus
`components/lovelace/dashboard.py`) und prüft zusätzlich, dass das in der
README dokumentierte `lovelace:`-Snippet gegen `lovelace.CONFIG_SCHEMA` gültig
ist – inklusive Slug-Regel (Bindestrich im URL-Pfad) und `filename`-Pfad.

Home Assistant ist absichtlich **nicht** in requirements-dev.txt (zieht ~100
Pakete). Aufruf:

    uv run --with homeassistant python scripts/check_ha_parse.py
    # oder in einer Umgebung, in der homeassistant installiert ist:
    python scripts/check_ha_parse.py
"""

from __future__ import annotations

import re
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent

try:
    from homeassistant.components.lovelace import CONFIG_SCHEMA
    from homeassistant.const import __version__ as HA_VERSION
    from homeassistant.util.yaml import Secrets, load_yaml_dict
except ImportError as exception:  # pragma: no cover - Umgebung ohne HA
    print(f"ÜBERSprungen: Home Assistant nicht installiert ({exception})")
    sys.exit(2)

errors: list[str] = []


def check_dashboard(path: Path) -> None:
    """Dashboard mit dem HA-Loader parsen."""
    label = path.relative_to(ROOT)
    with tempfile.TemporaryDirectory() as config_dir:
        try:
            config = load_yaml_dict(str(path.resolve()), Secrets(Path(config_dir)))
        except Exception as exception:  # noqa: BLE001 - HA wirft diverse Fehler
            errors.append(f"{label}: HA-Loader konnte die Datei nicht parsen: {exception}")
            return

    if not isinstance(config, dict):
        errors.append(f"{label}: Root ist kein Mapping")
        return
    views = config.get("views")
    if not isinstance(views, list) or not views:
        errors.append(f"{label}: 'views' fehlt oder ist leer")
        return
    for index, view in enumerate(views):
        if not isinstance(view, dict):
            errors.append(f"{label}: views[{index}] ist kein Mapping (!include nicht aufgelöst?)")
            return
        if not view.get("sections") and not view.get("cards"):
            errors.append(f"{label}: views[{index}] hat weder 'sections' noch 'cards'")
            return

    print(f"OK: {label} – HA {HA_VERSION} parst title={config.get('title')!r}, {len(views)} View(s)")


def check_readme_snippet() -> None:
    """Das dokumentierte lovelace:-Snippet gegen HA-Schema prüfen."""
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    blocks = re.findall(r"```ya?ml\n(.*?)```", readme, flags=re.DOTALL)
    snippet = next((block for block in blocks if block.lstrip().startswith("lovelace:")), None)
    if snippet is None:
        errors.append("README.md: kein ```yaml-Block mit 'lovelace:' gefunden")
        return

    try:
        parsed = yaml.safe_load(snippet)
        CONFIG_SCHEMA(parsed)
    except Exception as exception:  # noqa: BLE001 - Schema-Fehler sind beliebig
        errors.append(f"README.md: lovelace-Snippet ist ungültig: {exception}")
        return

    print("OK: README.md – lovelace-Snippet ist gegen CONFIG_SCHEMA gültig")


def main() -> int:
    for source in sorted((ROOT / "dashboards").glob("*.yaml")):
        check_dashboard(source)
    for target in sorted((ROOT / "dist").glob("*.yaml")):
        check_dashboard(target)

    check_readme_snippet()

    for message in errors:
        print(f"FEHLER: {message}")
    if errors:
        return 1

    print(f"\nOK: YAML lädt mit dem echten Home-Assistant-Loader ({HA_VERSION}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
