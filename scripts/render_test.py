#!/usr/bin/env python3
"""Abnahmetest: rendert die Dashboard-Karten gegen eine simulierte Geräteregistry.

Der Test beantwortet die Abnahmekriterien aus dem Kanban-Task ohne laufende
Home-Assistant-Instanz:

  * Zwei Wärmepumpen mit **unterschiedlichen Entity-Präfixen** ergeben zwei
    Geräteblöcke, ohne dass die YAML angepasst wird.
  * Jede Karte zeigt nur die Werte ihres eigenen Geräts (kein Durchgriff).
  * Eine fehlende Kennzahl wird zu „—“ (nicht 0, nicht der Wert der anderen Anlage).
  * Ein Gerät ohne Daten wird zu ⚪ / „Keine Daten“.
  * Die Lüftung (nur eine WP-Signatur) wird nicht als Wärmepumpe erkannt.
  * Eine rein lesende HTTP-Anbindung bekommt Karten, aber keine Bedien-Tiles.

Gerendert wird mit Home Assistants eigener `TemplateEnvironment` (Sandbox,
Senior-Filter, `strict` = undefinierte Variablen sind Fehler). Nur die
Registry-Funktionen (`states`, `device_id`, `device_entities`, `device_attr`,
`area_name`, `label_devices`, `integration_entities`, `state_attr`, `is_state`,
`has_value`) sind durch eine Registry-Attrappe ersetzt — genau die Funktionen,
die HA zur Laufzeit aus dem Geräteregister beantwortet.

Zusätzlich werden die auto-entities-Filter aus der YAML in Python nachgebaut
(Glob/Regex/`or`/`exclude` exakt wie in `src/filter.ts` + `src/match.ts`), damit
die Aussage „zwei Anker → zwei Karten“ nicht nur die Jinja-Seite abdeckt.

Aufruf:
    uv run --with homeassistant python scripts/render_test.py
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

from homeassistant.helpers.template import TemplateEnvironment
from homeassistant.util.yaml import Secrets, load_yaml_dict

ROOT = Path(__file__).resolve().parent.parent
DASHBOARD = ROOT / "dashboards" / "stiebel_eltron.yaml"

STATE_UNAVAILABLE = "unavailable"
STATE_UNKNOWN = "unknown"

failures: list[str] = []
checks = 0


def check(condition: bool, message: str) -> None:
    """Eine Behauptung prüfen."""
    global checks
    checks += 1
    if not condition:
        failures.append(message)


def check_contains(text: str, needle: str, message: str) -> None:
    """Behauptung: Text enthält needle."""
    check(needle in text, f"{message} (fehlt: {needle!r})")


def check_not_contains(text: str, needle: str, message: str) -> None:
    """Behauptung: Text enthält needle nicht."""
    check(needle not in text, f"{message} (unerwartet vorhanden: {needle!r})")


@dataclass
class Entity:
    """Minimales Entity-Registry-Objekt inkl. Zustand."""

    entity_id: str
    device_id: str
    platform: str
    state: str
    attributes: dict[str, Any] = field(default_factory=dict)
    labels: list[str] = field(default_factory=list)

    @property
    def domain(self) -> str:
        return self.entity_id.split(".")[0]


@dataclass
class Device:
    """Minimales Gerät."""

    id: str
    name: str
    area: str
    labels: list[str] = field(default_factory=list)
    name_by_user: str | None = None
    model: str | None = None
    manufacturer: str | None = None

    @property
    def display_name(self) -> str:
        return self.name_by_user or self.name


class Registry:
    """Geräteregister-Attrappe mit den HA-Semantiken, die die Karten nutzen."""

    def __init__(self) -> None:
        self.devices: dict[str, Device] = {}
        self.entities: dict[str, Entity] = {}

    def add_device(self, device: Device) -> Device:
        self.devices[device.id] = device
        return device

    def add(
        self,
        entity_id: str,
        device: Device,
        state: str,
        unit: str | None = None,
        labels: list[str] | None = None,
        **attributes: Any,
    ) -> None:
        attrs = dict(attributes)
        if unit is not None:
            attrs["unit_of_measurement"] = unit
        self.entities[entity_id] = Entity(
            entity_id=entity_id,
            device_id=device.id,
            platform=device.id.split(":")[0],
            state=state,
            attributes=attrs,
            labels=labels or [],
        )

    # --- HA-Template-Funktionen -------------------------------------------
    def states(self) -> "StatesProxy":
        return StatesProxy(self)

    def state_attr(self, entity_id: str, name: str) -> Any:
        entity = self.entities.get(entity_id)
        return entity.attributes.get(name) if entity else None

    def is_state(self, entity_id: str | list[str], value: str) -> bool:
        if isinstance(entity_id, list):
            return any(self.is_state(item, value) for item in entity_id)
        entity = self.entities.get(entity_id)
        return bool(entity and entity.state == value)

    def has_value(self, entity_id: str) -> bool:
        entity = self.entities.get(entity_id)
        if entity is None:
            return False
        return entity.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN, "")

    def device_id(self, entity_id: str) -> str | None:
        entity = self.entities.get(entity_id)
        return entity.device_id if entity else None

    def device_entities(self, device_id: str) -> list[str]:
        return [e.entity_id for e in self.entities.values() if e.device_id == device_id]

    def device_attr(self, device_id: str, attr: str) -> Any:
        device = self.devices.get(device_id)
        if device is None:
            return None
        return getattr(device, attr, None)

    def area_name(self, identifier: str) -> str | None:
        if identifier in self.devices:
            return self.devices[identifier].area
        entity = self.entities.get(identifier)
        if entity is not None:
            entity_area = entity.attributes.get("area_id")
            if entity_area:
                return str(entity_area)
            device = self.devices.get(entity.device_id)
            return device.area if device else None
        return None

    def label_devices(self, label_id: str) -> list[str]:
        return [d.id for d in self.devices.values() if label_id in d.labels]

    def label_entities(self, label_id: str) -> list[str]:
        return [e.entity_id for e in self.entities.values() if label_id in e.labels]

    def integration_entities(self, platform: str) -> list[str]:
        return [e.entity_id for e in self.entities.values() if e.platform == platform]


class StatesProxy:
    """Wie HAs `states`: aufrufbar (`states('sensor.x')`) und iterierbar."""

    def __init__(self, registry: Registry) -> None:
        self._registry = registry

    def __call__(self, entity_id: str) -> str:
        entity = self._registry.entities.get(entity_id)
        return entity.state if entity else STATE_UNKNOWN

    def __iter__(self) -> Iterator[Entity]:
        return iter(self._registry.entities.values())

    def __len__(self) -> int:
        return len(self._registry.entities)


# --- auto-entities-Nachbau -------------------------------------------------


def match_pattern(pattern: Any, value: Any) -> bool:
    """Glob/Regex/String-Vergleich wie auto-entities `matcher()`."""
    if not isinstance(pattern, str):
        return value == pattern
    if pattern.startswith("/") and pattern.endswith("/") and len(pattern) > 2:
        return re.search(pattern[1:-1], str(value)) is not None
    if "*" in pattern:
        regex = "^" + re.escape(pattern).replace(r"\*", ".*") + "$"
        return re.search(regex, str(value)) is not None
    return value == pattern


def filter_matches(registry: Registry, rule: dict[str, Any], entity: Entity) -> bool:
    """Eine auto-entities-Filterzeile auswerten (alle Regeln UND-verknüpft)."""
    device = registry.devices.get(entity.device_id)
    for key, value in rule.items():
        name = str(key).strip().split(" ")[0].strip()
        if name in {"options", "sort", "type"}:
            continue
        if name == "domain":
            if not match_pattern(value, entity.domain):
                return False
        elif name == "entity_id":
            if not match_pattern(value, entity.entity_id):
                return False
        elif name == "integration":
            if not match_pattern(value, entity.platform):
                return False
        elif name == "label":
            labels = list(entity.labels) + (device.labels if device else [])
            if not any(match_pattern(value, label) for label in labels):
                return False
        elif name == "or":
            if not any(filter_matches(registry, sub, entity) for sub in value):
                return False
        elif name == "and":
            if not all(filter_matches(registry, sub, entity) for sub in value):
                return False
        elif name == "not":
            if filter_matches(registry, value, entity):
                return False
        else:  # pragma: no cover - validate.py verbietet unbekannte Regeln
            raise AssertionError(f"unbekannte auto-entities-Regel: {key}")
    return True


def auto_entities_matches(registry: Registry, card: dict[str, Any]) -> list[str]:
    """Treffer einer custom:auto-entities-Karte (ohne Karten-Cache)."""
    filters = card["filter"]
    hits: list[str] = []
    for rule in filters.get("include", []):
        for entity in registry.entities.values():
            if filter_matches(registry, rule, entity):
                hits.append(entity.entity_id)
    excludes = filters.get("exclude", [])
    result: list[str] = []
    for entity_id in hits:
        entity = registry.entities[entity_id]
        if any(filter_matches(registry, rule, entity) for rule in excludes):
            continue
        if entity_id not in result:
            result.append(entity_id)
    return result


# --- Rendern ---------------------------------------------------------------


def make_env(registry: Registry) -> TemplateEnvironment:
    """HA-Template-Umgebung mit Registry-Attrappe statt hass."""
    env = TemplateEnvironment(hass=None, limited=False, strict=True, log_fn=lambda *_: None)
    env.globals.update(
        states=StatesProxy(registry),
        state_attr=registry.state_attr,
        is_state=registry.is_state,
        has_value=registry.has_value,
        device_id=registry.device_id,
        device_entities=registry.device_entities,
        device_attr=registry.device_attr,
        area_name=registry.area_name,
        label_devices=registry.label_devices,
        label_entities=registry.label_entities,
        integration_entities=registry.integration_entities,
    )
    return env


def render(registry: Registry, content: str) -> str:
    """Karteninhalt rendern; `this.entity_id` wird wie bei auto-entities ersetzt."""
    return make_env(registry).from_string(content).render()


def load_dashboard() -> dict[str, Any]:
    """Dashboard-YAML mit HAs eigenem Loader (inkl. !include) laden."""
    return load_yaml_dict(str(DASHBOARD), Secrets(ROOT / ".secrets-test"))


def find_cards(node: Any, predicate) -> list[dict[str, Any]]:
    """Alle Karten im Baum finden, die das Prädikat erfüllen."""
    found: list[dict[str, Any]] = []
    if isinstance(node, dict):
        if "type" in node and predicate(node):
            found.append(node)
        for value in node.values():
            found.extend(find_cards(value, predicate))
    elif isinstance(node, list):
        for item in node:
            found.extend(find_cards(item, predicate))
    return found


def view_by_path(config: dict[str, Any], path: str) -> dict[str, Any]:
    """View über ihren Pfad holen."""
    for view in config["views"]:
        if view.get("path") == path:
            return view
    raise AssertionError(f"View {path!r} fehlt")


def card_options(config: dict[str, Any], view_path: str) -> list[dict[str, Any]]:
    """Die options-Karten (Markdown-Vorlagen) einer auto-entities-Liste."""
    view = view_by_path(config, view_path)
    options: list[dict[str, Any]] = []
    for card in find_cards(view, lambda c: c.get("type") == "custom:auto-entities"):
        for rule in card["filter"].get("include", []):
            if "options" in rule and rule["options"] not in options:
                options.append(rule["options"])
    return options


# --- Fixtures --------------------------------------------------------------


def fixture_two_devices() -> tuple[Registry, dict[str, Device]]:
    """Zwei Wärmepumpen (ESPHome mit Label, ISG ohne Label) plus Lüftung."""
    reg = Registry()

    keller = reg.add_device(
        Device(
            id="esphome:esp32_poe_technik",
            name="ESP32-PoE Technik",
            name_by_user="Wärmepumpe Keller",
            area="Keller",
            labels=["stiebel_eltron"],
            model="esp32dev",
        )
    )
    reg.add("sensor.heatingpump_aussentemp", keller, "7.0", "°C")
    reg.add("sensor.esp32_poe_technik_vorlaufisttemp_wp", keller, "34.2", "°C")
    reg.add("sensor.esp32_poe_technik_ruecklaufisttemp_wp", keller, "31.8", "°C")
    reg.add("sensor.heatingpump_speicheristtemp", keller, "48.1", "°C")
    reg.add("sensor.heatingpump_speichersolltemp", keller, "50.0", "°C")
    reg.add("select.esp32_poe_technik_programmschalter", keller, "Komfort")
    reg.add("binary_sensor.esp32_poe_technik_verdichter", keller, "off")
    reg.add("binary_sensor.esp32_poe_technik_stoerung", keller, "off")
    reg.add("binary_sensor.esp32_poe_technik_evu_sperre", keller, "off")
    reg.add("sensor.esp32_poe_technik_el_energieaufnahme_heiz_summe_kwh", keller, "6.9", "kWh")
    reg.add("sensor.esp32_poe_technik_waermeertrag_heiz_summe_mwh", keller, "18.2", "MWh")
    reg.add("number.esp32_poe_technik_komforttemperatur", keller, "21.5", "°C")
    reg.add("number.esp32_poe_technik_ecotemperatur", keller, "19.0", "°C")
    reg.add("number.esp32_poe_technik_steigung_heizkurve", keller, "1.2")
    reg.add("switch.esp32_poe_technik_sg_ready_aktiv", keller, "off")
    # Diagnosewerte: nur diese Anlage hat sie — der <details>-Block darf nur hier erscheinen.
    reg.add("sensor.esp32_poe_technik_heissgastemp", keller, "71.4", "°C")
    reg.add("sensor.esp32_poe_technik_hochdruck", keller, "24.1", "bar")
    reg.add("sensor.esp32_poe_technik_volumenstrom", keller, "12.5", "l/min")
    reg.add("binary_sensor.esp32_poe_technik_heizkreispumpe_1", keller, "on")

    garage = reg.add_device(
        Device(
            id="stiebel_eltron_isg:wpmsystem",
            name="Wärmepumpe Garage",
            area="Garage",
            model="WPMsystem",
            manufacturer="Stiebel Eltron",
        )
    )
    # Zweiter Entity-Präfix, _2-Suffix und deutsche ISG-Namen — bewusst anders.
    reg.add("sensor.stiebel_eltron_wpmsystem_aussentemperatur", garage, "3.5", "°C")
    reg.add("sensor.stiebel_eltron_wpmsystem_vorlauftemperatur_wp", garage, "45.0", "°C")
    reg.add("sensor.stiebel_eltron_wpmsystem_ist_temperatur_warmwasser", garage, "52.0", "°C")
    reg.add("sensor.stiebel_eltron_wpmsystem_soll_temperatur_warmwasser", garage, "55.0", "°C")
    reg.add("select.stiebel_eltron_wpmsystem_programmschalter_2", garage, "Eco")
    reg.add("binary_sensor.stiebel_eltron_wpmsystem_verdichter", garage, "on")
    reg.add("binary_sensor.stiebel_eltron_wpmsystem_stoerung", garage, "on")
    reg.add("number.stiebel_eltron_wpmsystem_tagbetrieb_warmwasser_temperatursoll", garage, "55.0", "°C")
    reg.add("number.stiebel_eltron_wpmsystem_tagbetrieb_temperatursoll_hk_1", garage, "22.0", "°C")

    ventilation = reg.add_device(
        Device(id="esphome:lueftung", name="Lüftung LWZ", area="Keller", model="esp32dev")
    )
    reg.add("sensor.lueftung_aussentemperatur", ventilation, "6.0", "°C")
    reg.add("sensor.lueftung_ablufttemperatur", ventilation, "20.0", "°C")
    reg.add("select.lueftung_lwz_stufe", ventilation, "2")
    reg.add("sensor.lueftung_zulufttemperatur", ventilation, "18.5", "°C")

    return reg, {"keller": keller, "garage": garage, "ventilation": ventilation}


def fixture_unavailable() -> Registry:
    """Anlage mit unavailable-Gateway und einzelnen fehlenden Funktionen.

    Der Anker existiert (sonst gäbe es keine Karte), liefert aber `unavailable`;
    Vorlauf und Betriebsart fehlen ganz — beides muss sichtbar degradieren.
    """
    reg = Registry()
    device = reg.add_device(
        Device(id="esphome:wp_aus", name="Wärmepumpe Dachboden", area="Dachboden",
               labels=["stiebel_eltron"])
    )
    reg.add("sensor.dachboden_aussentemp", device, STATE_UNAVAILABLE)
    reg.add("sensor.dachboden_speicheristtemp", device, STATE_UNAVAILABLE)
    return reg


def fixture_http_readonly() -> Registry:
    """Schreibbare Label-Anlage plus rein lesende HTTP-Anlage."""
    reg = Registry()
    local = reg.add_device(
        Device(id="esphome:wp", name="Wärmepumpe", area="Keller", labels=["stiebel_eltron"])
    )
    reg.add("sensor.local_aussentemp", local, "5.0", "°C")
    reg.add("select.local_programmschalter", local, "Komfort")
    reg.add("number.local_komforttemperatur", local, "21.0", "°C")

    http = reg.add_device(
        Device(id="stiebel_eltron_http:isg", name="Wärmepumpe HTTP", area="Hauswirtschaft")
    )
    reg.add("sensor.http_outside_temperature", http, "4.0", "°C")
    reg.add("sensor.http_flow_temperature_wp", http, "38.0", "°C")
    reg.add("select.http_operation_mode", http, "Auto")
    reg.add("number.http_comfort_temperature_target_hk1", http, "21.0", "°C")
    return reg


# --- Tests -----------------------------------------------------------------


def test_two_devices(config: dict[str, Any]) -> None:
    """Kernkriterium: zweite Anlage ohne YAML-Änderung, getrennte Werte."""
    reg, devices = fixture_two_devices()
    summary = render(reg, find_cards(
        view_by_path(config, "uebersicht"),
        lambda c: c.get("type") == "markdown" and "Stiebel Eltron" in c.get("content", ""),
    )[0]["content"])

    check_contains(summary, "**2 Anlagen** erkannt", "Zusammenfassung zählt zwei Anlagen")
    check_contains(summary, "2 Karten", "Zusammenfassung zählt zwei Karten")
    check_not_contains(summary, "ohne Karte", "Beide Anlagen sind kartenfähig")

    overview = card_options(config, "uebersicht")[0]
    lists = find_cards(
        view_by_path(config, "uebersicht"),
        lambda c: c.get("type") == "custom:auto-entities",
    )
    anchors = auto_entities_matches(reg, lists[0])
    check(sorted(anchors) == [
        "sensor.heatingpump_aussentemp",
        "sensor.stiebel_eltron_wpmsystem_aussentemperatur",
    ], f"genau zwei Anker erwartet, gefunden: {sorted(anchors)}")

    cards = {anchor: render(reg, overview["content"].replace("this.entity_id", anchor))
             for anchor in anchors}
    keller = cards["sensor.heatingpump_aussentemp"]
    garage = cards["sensor.stiebel_eltron_wpmsystem_aussentemperatur"]

    check_contains(keller, "Wärmepumpe Keller", "Karte 1 zeigt den Gerätenamen")
    check_contains(keller, "**Bereit**", "Karte 1 zeigt Status Bereit")
    check_contains(keller, "7,0 °C", "Karte 1 zeigt die Außentemperatur mit Dezimalkomma")
    check_contains(keller, "34,2 °C", "Karte 1 zeigt den Vorlauf")
    check_contains(keller, "48,1 °C / 50,0 °C", "Karte 1 zeigt Warmwasser Ist/Soll")
    check_contains(keller, "Komfort", "Karte 1 zeigt den Modus")

    check_contains(garage, "Wärmepumpe Garage", "Karte 2 zeigt den Gerätenamen")
    check_contains(garage, "🔴", "Karte 2 zeigt die Störung als Ampel")
    check_contains(garage, "**Störung**", "Karte 2 zeigt die Störung als Text")
    check_contains(garage, "3,5 °C", "Karte 2 zeigt die eigene Außentemperatur")
    check_contains(garage, "45,0 °C", "Karte 2 zeigt den eigenen Vorlauf")
    check_contains(garage, "Eco", "Karte 2 zeigt den eigenen Modus")
    check_contains(garage, "| Rücklauf | — |", "Fehlender Rücklauf wird zu „—“")

    check_not_contains(keller, "Garage", "Karte 1 zeigt keine Werte von Anlage 2")
    check_not_contains(keller, "45,0", "Karte 1 enthält keinen Vorlauf von Anlage 2")
    check_not_contains(garage, "Keller", "Karte 2 zeigt keine Werte von Anlage 1")
    check_not_contains(garage, "34,2", "Karte 2 enthält keinen Vorlauf von Anlage 1")

    detail = card_options(config, "geraete")[0]
    detail_keller = render(reg, detail["content"].replace(
        "this.entity_id", "sensor.heatingpump_aussentemp"))
    check_contains(detail_keller, "| Heizwärme gesamt | 18,2 MWh |",
                   "Detailkarte zeigt die Geräte-Einheit unverändert (MWh)")
    check_contains(detail_keller, "| Strom Heizung gesamt ⚠ | 6,9 kWh |",
                   "Detailkarte zeigt den Stromzähler mit Geräte-Einheit")
    check_contains(detail_keller, "<details>", "Diagnose-Block erscheint bei vorhandenen Werten")
    check_contains(detail_keller, "| Heißgas | 71,4 °C |", "Diagnose zeigt den Heißgaswert")
    check_contains(detail_keller, "| HK1-Pumpe | ja |", "Diagnose zeigt die Heizkreispumpe")

    detail_garage = render(reg, detail["content"].replace(
        "this.entity_id", "sensor.stiebel_eltron_wpmsystem_aussentemperatur"))
    check_contains(detail_garage, "### Temperaturen", "Detailkarte hat die Temperaturgruppe")
    check_contains(detail_garage, "| Rücklauf | — |", "Detailkarte: fehlender Wert als „—“")
    check_contains(detail_garage, "Stiebel Eltron WPMsystem", "Detailkarte zeigt Hersteller/Modell")
    check_not_contains(detail_garage, "34,2", "Detailkarte enthält keinen Fremdwert")
    check_not_contains(detail_garage, "<details>",
                       "Diagnose-Block fehlt, wenn die Anlage keine Diagnosewerte hat")

    # Die Lüftung darf nirgends als Wärmepumpe auftauchen.
    check_not_contains(summary, "Lüftung", "Lüftung wird nicht als Wärmepumpe erkannt")
    for text in cards.values():
        check_not_contains(text, "Lüftung LWZ", "Lüftung bekommt keine Gerätekarte")


def test_empty(config: dict[str, Any]) -> None:
    """Nur Lüftung vorhanden: Discovery bleibt leer, kein Fehler."""
    reg, _ = fixture_two_devices()
    reg.devices.pop("esphome:esp32_poe_technik")
    reg.devices.pop("stiebel_eltron_isg:wpmsystem")
    reg.entities = {
        key: value for key, value in reg.entities.items()
        if value.device_id == "esphome:lueftung"
    }
    summary = render(reg, find_cards(
        view_by_path(config, "uebersicht"),
        lambda c: c.get("type") == "markdown" and "Stiebel Eltron" in c.get("content", ""),
    )[0]["content"])
    check_contains(summary, "Noch keine Wärmepumpe erkannt", "Leerzustand wird angezeigt")


def test_unavailable(config: dict[str, Any]) -> None:
    """Alle Werte unavailable: ⚪, keine Daten, überall „—“."""
    reg = fixture_unavailable()
    summary = render(reg, find_cards(
        view_by_path(config, "uebersicht"),
        lambda c: c.get("type") == "markdown" and "Stiebel Eltron" in c.get("content", ""),
    )[0]["content"])
    check_contains(summary, "1 Anlage", "Eine unavailable-Anlage wird gezählt")
    check_contains(summary, "1 Karte", "Sie bekommt eine Karte (kein stilles Verschwinden)")

    overview = card_options(config, "uebersicht")[0]
    card = render(reg, overview["content"].replace("this.entity_id", "sensor.dachboden_aussentemp"))
    check_contains(card, "⚪", "Ampel zeigt Keine Daten")
    check_contains(card, "Keine Daten", "Status ist im Klartext benannt")
    check_contains(card, "| Außen | — |", "Unavailable wird zu „—“ (nicht 0)")
    check_not_contains(card, "0,0 °C", "Kein erfundener 0-Wert")

    detail = card_options(config, "geraete")[0]
    detail_text = render(reg, detail["content"].replace("this.entity_id", "sensor.dachboden_aussentemp"))
    check_contains(detail_text, "**Nicht verfügbar:** Vorlauf WP, Betriebsart",
                   "Detailkarte nennt fehlende Kerngrößen")
    check_contains(detail_text, "⚪", "Detailkarte zeigt die Ampel")
    check_contains(detail_text, "**Keine Daten**", "Detailkarte benennt den Zustand")
    check_not_contains(detail_text, "0,0 °C", "Detailkarte erfindet keinen 0-Wert")


def test_http_readonly(config: dict[str, Any]) -> None:
    """HTTP-Anlage: Karte ja, Bedien-Tiles nein."""
    reg = fixture_http_readonly()
    summary = render(reg, find_cards(
        view_by_path(config, "uebersicht"),
        lambda c: c.get("type") == "markdown" and "Stiebel Eltron" in c.get("content", ""),
    )[0]["content"])
    check_contains(summary, "**2 Anlagen** erkannt", "HTTP-Anlage wird als Anlage erkannt")

    bedienung = view_by_path(config, "bedienung")
    groups = find_cards(bedienung, lambda c: c.get("type") == "custom:auto-entities")
    check(len(groups) >= 4, f"Bedienungsgruppen vorhanden (gefunden: {len(groups)})")
    for group in groups:
        hits = auto_entities_matches(reg, group)
        check(
            not any(entity_id.startswith(("select.http_", "number.http_")) for entity_id in hits),
            f"HTTP-Entitäten sind aus der Bedienung ausgeschlossen: {hits}",
        )

    bedienung_entities = {
        entity_id for group in groups for entity_id in auto_entities_matches(reg, group)
    }
    check(
        {"select.local_programmschalter", "number.local_komforttemperatur"} <= bedienung_entities,
        f"Schreibbare Label-Entitäten erscheinen in der Bedienung: {sorted(bedienung_entities)}",
    )


def test_filters(config: dict[str, Any]) -> None:
    """auto-entities-Filter wählen genau die Anker der beiden Anlagen."""
    reg, _ = fixture_two_devices()
    overview = view_by_path(config, "uebersicht")
    lists = find_cards(overview, lambda c: c.get("type") == "custom:auto-entities")
    check(len(lists) == 1, "Übersicht hat genau eine auto-entities-Liste")
    hits = auto_entities_matches(reg, lists[0])
    check(sorted(hits) == [
        "sensor.heatingpump_aussentemp",
        "sensor.stiebel_eltron_wpmsystem_aussentemperatur",
    ], f"Filter treffen genau beide Anker, gefunden: {sorted(hits)}")

    bedienung = view_by_path(config, "bedienung")
    for group in find_cards(bedienung, lambda c: c.get("type") == "custom:auto-entities"):
        for entity_id in auto_entities_matches(reg, group):
            check(
                not entity_id.endswith(("outdoor_temperature", "outside_temperature")),
                "Bedienung enthält keine Anker-Sensoren",
            )


def main() -> int:
    config = load_dashboard()
    check(len(config["views"]) == 3, "Dashboard hat drei Views")
    check([v["path"] for v in config["views"]] == ["uebersicht", "geraete", "bedienung"],
          "View-Pfade sind uebersicht/geraete/bedienung")

    test_two_devices(config)
    test_empty(config)
    test_unavailable(config)
    test_http_readonly(config)
    test_filters(config)

    for message in failures:
        print(f"FEHLER: {message}")
    if failures:
        print(f"\n{len(failures)} von {checks} Prüfungen fehlgeschlagen.")
        return 1

    print(f"OK: {checks} Prüfungen bestanden — zwei Anlagen, Degradation und Filter korrekt.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
