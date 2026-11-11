#!/usr/bin/env python3
"""Offline-Validierung des HACS-Repository-Gerüsts.

Prüft alles, was ohne laufende Home-Assistant-Instanz prüfbar ist:

1. hacs.json gegen das HACS-Manifest-Schema (unbekannte Schlüssel sind Fehler).
2. HACS-Strukturanforderung "Dashboard/plugin": die in hacs.json genannte
   .js-Datei liegt in dist/.
3. Dashboard-YAML: YAML-parsebar, Root-Mapping, views-Liste mit Einträgen,
   jede View hat title oder path, cards ist eine Liste.
4. dist/ ist byte-genau synchron zu dashboards/.
5. Pflichtdateien für ein HACS-Repository sind vorhanden.

Aufruf:
    python scripts/validate.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent.parent
HACS_JSON = ROOT / "hacs.json"
DASHBOARD_SOURCE_DIR = ROOT / "dashboards"
DIST_DIR = ROOT / "dist"

# Schlüssel aus HACS_MANIFEST_JSON_SCHEMA (custom_components/hacs/utils/validate.py,
# extra=vol.PREVENT_EXTRA). Unbekannte Schlüssel lehnt HACS ab.
HACS_JSON_SCHEMA: dict[str, type | tuple[type, ...]] = {
    "name": str,
    "content_in_root": bool,
    "country": (str, list),
    "filename": str,
    "hacs": str,
    "hide_default_branch": bool,
    "homeassistant": str,
    "persistent_directory": str,
    "render_readme": bool,
    "zip_release": bool,
}

VERSION_RE = re.compile(r"^\d{4}\.\d{1,2}\.\d{1,2}(b\d+)?$")

errors: list[str] = []
warnings: list[str] = []


def fail(message: str) -> None:
    """Fehler sammeln."""
    errors.append(message)


def warn(message: str) -> None:
    """Warnung sammeln."""
    warnings.append(message)


class HADashboardLoader(yaml.SafeLoader):
    """SafeLoader mit Home-Assistant-Tags und Duplikat-Erkennung."""

    def construct_mapping(self, node: yaml.MappingNode, deep: bool = False) -> dict:
        self.flatten_mapping(node)
        mapping: dict[Any, Any] = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in mapping:
                raise yaml.constructor.ConstructorError(
                    "while constructing a mapping",
                    node.start_mark,
                    f"doppelter Schlüssel: {key!r}",
                    key_node.start_mark,
                )
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def _stub_tag(loader: HADashboardLoader, node: yaml.Node) -> str:
    """HA-Tags (!include, !secret, ...) beim Prüfen nur markieren."""
    if isinstance(node, yaml.ScalarNode):
        return f"<{node.tag}:{node.value}>"
    return f"<{node.tag}>"


for _tag in (
    "!include",
    "!include_dir_list",
    "!include_dir_named",
    "!include_dir_merge_list",
    "!include_dir_merge_named",
    "!secret",
    "!env_var",
    "!input",
):
    HADashboardLoader.add_constructor(_tag, _stub_tag)


def check_hacs_json() -> dict[str, Any]:
    """hacs.json einlesen und gegen das HACS-Schema prüfen."""
    if not HACS_JSON.is_file():
        fail("hacs.json fehlt im Repository-Root")
        return {}

    try:
        data = json.loads(HACS_JSON.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exception:
        fail(f"hacs.json ist kein valides JSON: {exception}")
        return {}

    if not isinstance(data, dict):
        fail("hacs.json muss ein JSON-Objekt sein")
        return {}

    for key, value in data.items():
        expected = HACS_JSON_SCHEMA.get(key)
        if expected is None:
            fail(f"hacs.json: unbekannter Schlüssel {key!r} (HACS lehnt das ab)")
            continue
        if isinstance(value, bool) and expected is not bool:
            fail(f"hacs.json: {key!r} hat den falschen Typ (erwartet {expected})")
        elif not isinstance(value, expected):
            fail(f"hacs.json: {key!r} hat den falschen Typ (erwartet {expected})")

    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        fail("hacs.json: 'name' ist Pflicht und darf nicht leer sein")

    if data.get("zip_release"):
        fail("hacs.json: 'zip_release' wird von HACS nur für Integrationen unterstützt")

    if "persistent_directory" in data:
        fail("hacs.json: 'persistent_directory' wird von HACS nur für Integrationen unterstützt")

    ha_version = data.get("homeassistant")
    if ha_version is not None and not VERSION_RE.match(str(ha_version)):
        fail(f"hacs.json: 'homeassistant' ist keine gültige HA-Version: {ha_version!r}")

    return data


def check_hacs_structure(data: dict[str, Any]) -> None:
    """HACS-Kategorie Dashboard/plugin: .js-Einstiegspunkt aus hacs.json."""
    content_in_root = bool(data.get("content_in_root", False))
    base = ROOT if content_in_root else DIST_DIR

    if not base.is_dir():
        fail(f"Zielordner für HACS-Inhalte fehlt: {base.relative_to(ROOT)}")
        return

    entry = data.get("filename")
    if not isinstance(entry, str) or not entry.strip():
        fail("hacs.json: 'filename' fehlt – HACS findet den .js-Einstiegspunkt dann nur über den Repo-Namen")
    elif not entry.endswith(".js"):
        fail(f"hacs.json: 'filename' muss eine .js-Datei benennen, ist aber {entry!r}")
    elif not (base / entry).is_file():
        fail(f"HACS-Struktur: {base.relative_to(ROOT)}/{entry} fehlt (Kategorie Dashboard braucht die .js-Datei)")

    js_files = sorted(base.glob("*.js"))
    if not js_files:
        fail(f"HACS-Struktur: keine .js-Datei in {base.relative_to(ROOT)}/")


def check_dashboard_yaml(path: Path) -> None:
    """Struktur einer Lovelace-Dashboard-YAML prüfen."""
    label = path.relative_to(ROOT)
    try:
        config = yaml.load(path.read_text(encoding="utf-8"), Loader=HADashboardLoader)
    except yaml.YAMLError as exception:
        fail(f"{label}: YAML nicht parsebar: {exception}")
        return

    if not isinstance(config, dict):
        fail(f"{label}: Root muss ein Mapping sein (title/views)")
        return

    unknown = set(config) - {"title", "views"}
    if unknown:
        warn(f"{label}: unbekannte Root-Schlüssel {sorted(unknown)} (HA kennt nur title/views)")

    views = config.get("views")
    if not isinstance(views, list) or not views:
        fail(f"{label}: 'views' muss eine nicht-leere Liste sein")
        return

    for index, view in enumerate(views):
        where = f"{label}: views[{index}]"
        if not isinstance(view, dict):
            fail(f"{where} muss ein Mapping sein")
            continue
        if not view.get("title") and not view.get("path"):
            fail(f"{where} braucht 'title' oder 'path'")
        if "path" in view and not isinstance(view["path"], str):
            fail(f"{where}: 'path' muss ein String sein")
        if "cards" in view:
            cards = view["cards"]
            if not isinstance(cards, list):
                fail(f"{where}: 'cards' muss eine Liste sein")
            elif not all(isinstance(card, dict) for card in cards):
                fail(f"{where}: jede Karte muss ein Mapping sein")
            elif any(not card.get("type") for card in cards):
                fail(f"{where}: jede Karte braucht 'type'")

    print(f"OK: {label} ({len(views)} View(s))")


def check_dist_sync() -> None:
    """dist/ muss byte-genau aus dashboards/ erzeugt sein (rekursiv)."""
    sources = sorted(
        path
        for path in DASHBOARD_SOURCE_DIR.rglob("*")
        if path.is_file() and path.suffix in {".yaml", ".yml"}
    )
    if not sources:
        fail("dashboards/: keine Dashboard-YAML gefunden")
        return

    for source in sources:
        relative = source.relative_to(DASHBOARD_SOURCE_DIR)
        target = DIST_DIR / relative
        if not target.is_file():
            fail(f"dist/{relative} fehlt (python scripts/sync_dist.py ausführen)")
        elif target.read_bytes() != source.read_bytes():
            fail(f"dist/{relative} weicht von dashboards/{relative} ab (sync_dist.py ausführen)")

    for target in sorted(DIST_DIR.rglob("*")):
        if not target.is_file() or target.suffix not in {".yaml", ".yml"}:
            continue
        relative = target.relative_to(DIST_DIR)
        if not (DASHBOARD_SOURCE_DIR / relative).is_file():
            fail(f"dist/{relative} hat keine Quelle in dashboards/")


def check_yaml_parses(path: Path) -> None:
    """Nur Syntax prüfen (für Bruchstücke/Includes, die kein Dashboard sind)."""
    label = path.relative_to(ROOT)
    try:
        yaml.load(path.read_text(encoding="utf-8"), Loader=HADashboardLoader)
    except yaml.YAMLError as exception:
        fail(f"{label}: YAML nicht parsebar: {exception}")
        return
    print(f"OK: {label} (Syntax)")


def check_required_files() -> None:
    """Dateien, die ein HACS-Repository braucht."""
    for name in ("README.md", "LICENSE", "CHANGELOG.md"):
        if not (ROOT / name).is_file():
            fail(f"Pflichtdatei fehlt: {name}")


def main() -> int:
    data = check_hacs_json()
    if data:
        check_hacs_structure(data)

    for source in sorted(DASHBOARD_SOURCE_DIR.rglob("*")):
        if not source.is_file() or source.suffix not in {".yaml", ".yml"}:
            continue
        if source.parent == DASHBOARD_SOURCE_DIR:
            check_dashboard_yaml(source)
        else:
            # Bruchstücke für !include & Co.: nur Syntax prüfen
            check_yaml_parses(source)

    check_dist_sync()
    check_required_files()

    for message in warnings:
        print(f"WARNUNG: {message}")
    for message in errors:
        print(f"FEHLER: {message}")

    if errors:
        print(f"\n{len(errors)} Fehler – Repository ist so nicht HACS-konform.")
        return 1

    print("\nOK: Repository-Gerüst ist HACS-konform.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
