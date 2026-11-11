#!/usr/bin/env python3
"""Prüft die Jinja-Makros aus `dashboards/templates/jinja/` ohne Home Assistant.

Der Abnahmetest `render_test.py` braucht die echte HA-Template-Engine. Dieser Test
hier läuft überall dort, wo `jinja2` installiert ist (repo-checks in der CI) und
sichert die Regeln ab, die sich leicht wieder kaputt machen lassen:

  * Sentinel-Werte (`0x8000` → `-3276,8 °C`, `3276,8 °C`) werden zu „—“,
  * echte Messwerte bleiben Messwerte (Dezimalkomma, Einheit),
  * `mrow()` blendet Zeilen ohne Entität aus, ohne die Markdown-Tabelle zu zerreißen,
  * `pair()` verbindet Ist/Soll, `bin()` liefert ja/nein/—.

Aufruf:
    python scripts/test_macros.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import jinja2

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = ROOT / "dashboards" / "templates" / "jinja"

STATES = {
    "sensor.ok": "5.512",
    "sensor.sentinel_neg": "-3276.80004882812",
    "sensor.sentinel_pos": "32768.0",
    "sensor.unknown": "unknown",
    "sensor.unavailable": "unavailable",
    "sensor.humidity": "45.4",
    "sensor.humidity_sentinel": "32768.0",
    "sensor.second": "12.0",
    "binary_sensor.running": "on",
    "binary_sensor.idle": "off",
}
UNITS = {
    "sensor.ok": "°C",
    "sensor.sentinel_neg": "°C",
    "sensor.sentinel_pos": "°C",
    "sensor.humidity": "%",
    "sensor.humidity_sentinel": "%",
    "sensor.second": "°C",
}

failures: list[str] = []
checks = 0


def check(actual: object, expected: object, message: str) -> None:
    global checks
    checks += 1
    if actual != expected:
        failures.append(f"{message}: erwartet {expected!r}, erhalten {actual!r}")


def has_value(entity_id: str) -> bool:
    return STATES.get(entity_id) not in (None, "", "unknown", "unavailable")


def states(entity_id: str) -> str:
    return STATES.get(entity_id, "unknown")


def state_attr(entity_id: str, attribute: str) -> object:
    if attribute == "unit_of_measurement":
        return UNITS.get(entity_id)
    return None


def is_state(entity_id: str, state: str) -> bool:
    return STATES.get(entity_id) == state


def build_environment() -> jinja2.Environment:
    source = "\n".join(
        (TEMPLATE_DIR / name).read_text(encoding="utf-8")
        for name in ("resolver.j2", "functions.j2", "status.j2")
    )
    env = jinja2.Environment(undefined=jinja2.StrictUndefined, autoescape=False)
    env.globals.update(
        states=states,
        state_attr=state_attr,
        has_value=has_value,
        is_state=is_state,
    )
    # Die Makros stehen in derselben Vorlage, damit sie ohne Import sichtbar sind.
    env.globals["_macro_source"] = source
    return env


def main() -> int:
    env = build_environment()
    source = env.globals.pop("_macro_source")
    cases = {
        "wert": "{{ num(['sensor.ok'], ['ok']) }}",
        "sentinel_neg": "{{ num(['sensor.sentinel_neg'], ['sentinel_neg']) }}",
        "sentinel_pos": "{{ num(['sensor.sentinel_pos'], ['sentinel_pos']) }}",
        "prozent": "{{ num(['sensor.humidity'], ['humidity'], 0) }}",
        "prozent_sentinel": "{{ num(['sensor.humidity_sentinel'], ['humidity_sentinel'], 0) }}",
        "unknown": "{{ num(['sensor.unknown'], ['unknown']) }}",
        "unavailable": "{{ num(['sensor.unavailable'], ['unavailable']) }}",
        "keine_entitaet": "{{ num([], ['aussentemp']) }}",
        "paar": "{{ pair(['sensor.ok', 'sensor.second'], ['ok'], ['second']) }}",
        "zeile_ja": "{{ mrow('X', '1,0 °C', '1') }}",
        "zeile_nein": "{{ mrow('X', '1,0 °C', '') }}",
        "binaer_an": "{{ bin(['binary_sensor.running'], ['running']) }}",
        "binaer_aus": "{{ bin(['binary_sensor.idle'], ['idle']) }}",
        "binaer_fehlt": "{{ bin([], ['verdichter']) }}",
        "duplikat": "{{ pick(['sensor.second'], ['second']) }}",
        "suffix_exakt": "{{ pick(['sensor.aussentemp_sommerbetrieb'], ['aussentemp']) }}",
    }

    results = {}
    for name, expression in cases.items():
        template = env.from_string(source + "\n" + expression)
        results[name] = template.render()

    check(results["wert"], "5,5 °C", "Messwert mit Dezimalkomma und Einheit")
    check(results["sentinel_neg"], "—", "negativer Sentinel (0x8000) wird zu „—“")
    check(results["sentinel_pos"], "—", "positiver Sentinel wird zu „—“")
    check(results["prozent"], "45%", "Prozent ohne Leerzeichen")
    check(results["prozent_sentinel"], "—", "Sentinel in Prozent wird zu „—“")
    check(results["unknown"], "—", "unknown wird zu „—“")
    check(results["unavailable"], "—", "unavailable wird zu „—“")
    check(results["keine_entitaet"], "—", "fehlende Entität wird zu „—“")
    check(results["paar"], "5,5 °C / 12,0 °C", "pair() verbindet Ist und Soll")
    check(results["zeile_ja"], "\n| X | 1,0 °C |", "mrow() rendert die Zeile mit Zeilenumbruch davor")
    check(results["zeile_nein"], "", "mrow() lässt die Zeile ohne Entität weg")
    check(results["binaer_an"], "ja", "bin() mit on")
    check(results["binaer_aus"], "nein", "bin() mit off")
    check(results["binaer_fehlt"], "—", "bin() ohne Entität")
    check(results["duplikat"], "sensor.second", "pick() findet exakten Suffix")
    check(results["suffix_exakt"], "", "pick() matcht nicht auf zusammengesetzte Suffixe")

    for failure in failures:
        print(f"FAIL {failure}")
    if failures:
        print(f"\n{len(failures)} von {checks} Prüfungen fehlgeschlagen.")
        return 1
    print(f"OK: {checks} Makro-Prüfungen bestanden (Sentinel, Degradation, Tabellenzeilen).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
