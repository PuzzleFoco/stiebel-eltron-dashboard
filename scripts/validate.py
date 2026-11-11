#!/usr/bin/env python3
"""Offline-Validierung des Dashboard-Repositories.

Prüft alles, was ohne laufende Home-Assistant-Instanz prüfbar ist:

1. hacs.json gegen das HACS-Manifest-Schema (unbekannte Schlüssel sind Fehler).
2. HACS-Strukturanforderung "Dashboard/plugin": die in hacs.json genannte
   .js-Datei liegt in dist/.
3. Dashboard-YAML: `!include` wird wie in Home Assistant relativ zur
   includierenden Datei aufgelöst; danach Strukturprüfung von Views, Sections
   und Karten (inkl. auto-entities-Filterregeln).
4. dist/ ist byte-genau synchron zu dashboards/.
5. Pflichtdateien für ein HACS-Repository sind vorhanden.
6. Die README-Installationsanleitung passt zu den ausgelieferten Dateien:
   Dashboard-Schlüssel (URL-Pfad der Kartenlinks), HACS-Installpfad und Datei.

Die Include-Auflösung ist der wichtige Teil: Ohne sie sieht der Prüfer an
`views:` nur Strings und kann die eigentliche Struktur nicht beurteilen.

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

# Namenskopplung (docs/architecture.md §Namenskopplung): HACS installiert nach
# www/community/<repository-name>/. Der Name steht im Installationspfad der
# README und ist deshalb nicht frei wählbar.
HACS_REPOSITORY_NAME = "stiebel-eltron-dashboard"
# URL-Pfad des Dashboards; die Karten verlinken fest auf /stiebel-eltron/…
README_DASHBOARD_KEY = "stiebel-eltron"

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

# Filterregeln aus auto-entities (README + src/filter.ts). Ein unbekannter
# Regelname ist dort kein Fehler, sondern macht den Filter still wirkungslos
# (`RULES[rule] ?? (() => false)`) — deshalb prüfen wir ihn hier hart.
AUTO_ENTITIES_RULES = {
    "domain",
    "state",
    "state_translated",
    "entity_id",
    "name",
    "group",
    "area",
    "floor",
    "level",
    "device",
    "label",
    "device_manufacturer",
    "device_model",
    "integration",
    "hidden_by",
    "attributes",
    "last_changed",
    "last_updated",
    "last_triggered",
    "entity_category",
    "not",
    "or",
    "and",
}
AUTO_ENTITIES_SPECIAL = {"type", "options", "sort"}
# Karten, die ihre Kinder unter `cards:` führen.
CARD_CONTAINERS = {"grid", "horizontal-stack", "vertical-stack"}

MAX_INCLUDE_DEPTH = 20

errors: list[str] = []
warnings: list[str] = []


def fail(message: str) -> None:
    """Fehler sammeln."""
    errors.append(message)


def warn(message: str) -> None:
    """Warnung sammeln."""
    warnings.append(message)


class HADashboardLoader(yaml.SafeLoader):
    """SafeLoader mit HA-Tags, Duplikat-Erkennung und echter !include-Auflösung."""

    def __init__(self, stream: Any, path: Path, depth: int = 0) -> None:
        super().__init__(stream)
        self._path = path
        self._depth = depth

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


def _construct_include(loader: HADashboardLoader, node: yaml.Node) -> Any:
    """!include wie Home Assistant: Pfad relativ zur includierenden Datei."""
    if not isinstance(node, yaml.ScalarNode):
        raise yaml.constructor.ConstructorError(
            "while constructing !include",
            node.start_mark,
            "!include erwartet einen Dateinamen (String)",
            node.start_mark,
        )
    if loader._depth >= MAX_INCLUDE_DEPTH:
        raise yaml.constructor.ConstructorError(
            "while constructing !include",
            node.start_mark,
            "zu viele verschachtelte Includes (Zyklus?)",
            node.start_mark,
        )

    target = (loader._path.parent / node.value).resolve()
    if not target.is_file():
        raise yaml.constructor.ConstructorError(
            "while constructing !include",
            node.start_mark,
            f"Datei nicht gefunden: {node.value} (erwartet: {target})",
            node.start_mark,
        )
    with target.open(encoding="utf-8") as handle:
        nested = HADashboardLoader(handle, target, loader._depth + 1)
        try:
            return nested.get_single_data()
        finally:
            nested.dispose()


def _stub_tag(loader: HADashboardLoader, node: yaml.Node) -> str:
    """Nicht genutzte HA-Tags beim Prüfen nur markieren."""
    if isinstance(node, yaml.ScalarNode):
        return f"<{node.tag}:{node.value}>"
    return f"<{node.tag}>"


HADashboardLoader.add_constructor("!include", _construct_include)
for _tag in (
    "!include_dir_list",
    "!include_dir_named",
    "!include_dir_merge_list",
    "!include_dir_merge_named",
    "!secret",
    "!env_var",
    "!input",
):
    HADashboardLoader.add_constructor(_tag, _stub_tag)


def load_yaml(path: Path) -> Any:
    """YAML mit Include-Auflösung laden."""
    with path.open(encoding="utf-8") as handle:
        loader = HADashboardLoader(handle, path)
        try:
            return loader.get_single_data()
        finally:
            loader.dispose()


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
    """HACS-Kategorie Dashboard/plugin: .js-Einstiegspunkt aus hacs.json.

    Die .js-Datei liegt seit der Strategie-Variante im Repository-Root
    (HACS liefert bei Plugins nur .js-Dateien aus). Für ältere Stände wird
    zusätzlich dist/ als Ort akzeptiert.
    """
    content_in_root = bool(data.get("content_in_root", False))
    fallback = ROOT if content_in_root else DIST_DIR

    entry = data.get("filename")
    if not isinstance(entry, str) or not entry.strip():
        fail("hacs.json: 'filename' fehlt – HACS findet den .js-Einstiegspunkt dann nur über den Repo-Namen")
        return
    if not entry.endswith(".js"):
        fail(f"hacs.json: 'filename' muss eine .js-Datei benennen, ist aber {entry!r}")
        return

    for base in (ROOT, fallback, DIST_DIR):
        if (base / entry).is_file():
            if not sorted(base.glob("*.js")):
                fail(f"HACS-Struktur: keine .js-Datei in {base.relative_to(ROOT)}/")
            return

    fail(
        f"HACS-Struktur: {entry} fehlt im Repository-Root und in "
        f"{DIST_DIR.relative_to(ROOT)}/ (Kategorie Dashboard braucht die .js-Datei)"
    )


def check_auto_entities(card: dict[str, Any], where: str) -> None:
    """Filter einer custom:auto-entities-Karte prüfen."""
    filters = card.get("filter")
    if not isinstance(filters, dict):
        fail(f"{where}: custom:auto-entities braucht 'filter' (Mapping)")
        return

    if not isinstance(card.get("card"), dict) or not card["card"].get("type"):
        fail(f"{where}: custom:auto-entities braucht 'card' mit 'type' (Zielkarte)")

    if "card_param" in card and not isinstance(card["card_param"], str):
        fail(f"{where}: 'card_param' muss ein String sein")

    else_card = card.get("else")
    if else_card is not None:
        check_card(else_card, f"{where}.else")

    for section in ("include", "exclude"):
        rules = filters.get(section)
        if rules is None:
            continue
        if not isinstance(rules, list):
            fail(f"{where}: filter.{section} muss eine Liste sein")
            continue
        for index, rule in enumerate(rules):
            if not isinstance(rule, dict):
                fail(f"{where}: filter.{section}[{index}] muss ein Mapping sein")
                continue
            effective = 0
            for key, value in rule.items():
                name = str(key).strip().split(" ")[0].strip()
                if name in AUTO_ENTITIES_SPECIAL:
                    if name == "options":
                        if not isinstance(value, dict):
                            fail(f"{where}: filter.{section}[{index}].options muss ein Mapping sein")
                        else:
                            check_card(value, f"{where}.options")
                    continue
                if name not in AUTO_ENTITIES_RULES:
                    fail(
                        f"{where}: filter.{section}[{index}]: unbekannte auto-entities-Regel "
                        f"{key!r} — auto-entities ignoriert den Filter dann still"
                    )
                    continue
                effective += 1
            if section == "include" and effective == 0:
                fail(f"{where}: filter.include[{index}] hat keine wirksame Regel (nur options/type)")


def check_card(card: Any, where: str) -> None:
    """Eine Lovelace-Karte strukturell prüfen."""
    if not isinstance(card, dict):
        fail(f"{where}: Karte muss ein Mapping sein")
        return

    card_type = card.get("type")
    if not isinstance(card_type, str) or not card_type:
        fail(f"{where}: Karte braucht 'type'")
        return

    if card_type == "custom:auto-entities":
        check_auto_entities(card, where)
        return

    if card_type in CARD_CONTAINERS:
        cards = card.get("cards")
        if not isinstance(cards, list) or not cards:
            fail(f"{where}: {card_type}-Karte braucht eine nicht-leere 'cards'-Liste")
            return
        for index, child in enumerate(cards):
            check_card(child, f"{where}.cards[{index}]")

    if "features" in card:
        features = card["features"]
        if not isinstance(features, list) or not features:
            fail(f"{where}: 'features' muss eine nicht-leere Liste sein")
        else:
            for index, feature in enumerate(features):
                if not isinstance(feature, dict) or not feature.get("type"):
                    fail(f"{where}: features[{index}] braucht 'type'")

    if card_type == "heading" and not card.get("heading"):
        fail(f"{where}: heading-Karte braucht 'heading'")


def check_view(view: Any, where: str) -> None:
    """Eine View prüfen (sections-View oder klassische Karten-View)."""
    if not isinstance(view, dict):
        fail(f"{where} muss ein Mapping sein (prüfe !include-Auflösung)")
        return
    if not view.get("title") and not view.get("path"):
        fail(f"{where} braucht 'title' oder 'path'")
    if "path" in view and not isinstance(view["path"], str):
        fail(f"{where}: 'path' muss ein String sein")

    if view.get("type") == "sections":
        sections = view.get("sections")
        if not isinstance(sections, list) or not sections:
            fail(f"{where}: sections-View braucht eine nicht-leere 'sections'-Liste")
            return
        for s_index, section in enumerate(sections):
            s_where = f"{where}.sections[{s_index}]"
            if not isinstance(section, dict):
                fail(f"{s_where} muss ein Mapping sein")
                continue
            cards = section.get("cards")
            if not isinstance(cards, list) or not cards:
                fail(f"{s_where}: Section braucht eine nicht-leere 'cards'-Liste")
                continue
            for c_index, card in enumerate(cards):
                check_card(card, f"{s_where}.cards[{c_index}]")
        return

    cards = view.get("cards")
    if not isinstance(cards, list) or not cards:
        fail(f"{where}: 'cards' muss eine nicht-leere Liste sein")
        return
    for index, card in enumerate(cards):
        check_card(card, f"{where}.cards[{index}]")


def check_dashboard_yaml(path: Path) -> None:
    """Struktur einer Lovelace-Dashboard-YAML prüfen (inkl. Includes)."""
    label = path.relative_to(ROOT)
    try:
        config = load_yaml(path)
    except yaml.YAMLError as exception:
        fail(f"{label}: YAML nicht parsebar: {exception}")
        return
    except OSError as exception:
        fail(f"{label}: Include nicht lesbar: {exception}")
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
        check_view(view, f"{label}: views[{index}]")

    print(f"OK: {label} ({len(views)} View(s), Includes aufgelöst)")


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
        load_yaml(path)
    except yaml.YAMLError as exception:
        fail(f"{label}: YAML nicht parsebar: {exception}")
        return
    except OSError as exception:
        fail(f"{label}: Include nicht lesbar: {exception}")
        return
    print(f"OK: {label} (Syntax)")


def check_readme_install() -> None:
    """README-Installationsanleitung gegen die ausgelieferten Dateien prüfen.

    Die Anleitung ist Teil des Produkts: Ein falscher Pfad, ein anderer
    Dashboard-Schlüssel oder ein nicht ausgeliefertes Include-Verzeichnis macht
    die Installation für neue Nutzer unmöglich, ohne dass YAML-Prüfungen
    anschlagen. Geprüft wird deshalb:

    * genau ein `lovelace:`-Block mit genau einem Dashboard,
    * der Schlüssel `stiebel-eltron` (die Karten verlinken fest darauf),
    * `mode: yaml` und ein `filename` unter `www/community/<repo>/`,
    * die genannte Datei existiert in `dist/` (wird von HACS ausgeliefert),
    * die Karten verlinken auf keinen anderen Dashboard-Pfad,
    * Label und Pflicht-Abhängigkeit kommen in der Anleitung vor.
    """
    if not (ROOT / "README.md").is_file():
        fail("README.md fehlt")
        return

    before = len(errors)
    text = (ROOT / "README.md").read_text(encoding="utf-8")
    blocks = re.findall(r"```ya?ml\n(.*?)```", text, flags=re.DOTALL)
    snippet = next((block for block in blocks if block.lstrip().startswith("lovelace:")), None)
    if snippet is None:
        fail("README.md: kein ```yaml-Block mit 'lovelace:' gefunden")
        return

    try:
        data = yaml.safe_load(snippet) or {}
    except yaml.YAMLError as exception:
        fail(f"README.md: lovelace-Snippet ist kein gültiges YAML: {exception}")
        return

    dashboards = ((data.get("lovelace") or {}).get("dashboards")) or {}
    if not isinstance(dashboards, dict) or len(dashboards) != 1:
        fail("README.md: lovelace.dashboards muss genau einen Eintrag enthalten")
        return
    key, config = next(iter(dashboards.items()))
    config = config or {}

    if key != README_DASHBOARD_KEY:
        fail(
            f"README.md: Dashboard-Schlüssel ist {key!r}, die Karten verlinken aber fest auf "
            f"/{README_DASHBOARD_KEY}/…"
        )
    if config.get("mode") != "yaml":
        fail("README.md: Dashboard-Eintrag braucht 'mode: yaml'")

    filename = config.get("filename")
    prefix = f"www/community/{HACS_REPOSITORY_NAME}/"
    if not isinstance(filename, str) or not filename.startswith(prefix):
        fail(
            f"README.md: 'filename' muss mit {prefix!r} beginnen "
            f"(HACS installiert nach www/community/<repository-name>/), ist: {filename!r}"
        )
    else:
        target = DIST_DIR / filename[len(prefix) :]
        if not target.is_file():
            fail(f"README.md: {filename!r} zeigt auf keine ausgelieferte Datei (dist/{target.name})")
        if not (DIST_DIR / "includes").is_dir():
            fail("dist/includes fehlt – die !includes des Dashboards würden nicht mitinstalliert")

    linked = set()
    for source in DASHBOARD_SOURCE_DIR.rglob("*.yaml"):
        linked.update(re.findall(r"\]\((/[a-z0-9-]+)/", source.read_text(encoding="utf-8")))
    foreign = sorted(linked - {f"/{README_DASHBOARD_KEY}"})
    if foreign:
        fail(f"Dashboard-YAML verlinkt auf {foreign}, README-Schlüssel ist /{README_DASHBOARD_KEY}")

    if "stiebel_eltron" not in text:
        fail("README.md: Geräte-Label 'stiebel_eltron' wird nicht erklärt")
    if "auto-entities" not in text:
        fail("README.md: Pflicht-Abhängigkeit 'auto-entities' wird nicht genannt")

    if len(errors) == before:
        print(f"OK: README.md (Schlüssel {key!r}, Pfad {filename!r}, Links konsistent)")


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
            check_yaml_parses(source)

    check_dist_sync()
    check_readme_install()
    check_required_files()

    for message in warnings:
        print(f"WARNUNG: {message}")
    for message in errors:
        print(f"FEHLER: {message}")

    if errors:
        print(f"\n{len(errors)} Fehler – Repository ist so nicht HACS-konform.")
        return 1

    print("\nOK: Repository ist HACS-konform, Dashboard-Struktur ist gültig.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
