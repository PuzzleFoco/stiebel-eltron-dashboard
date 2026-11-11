# Stiebel Eltron Dashboard

![Stiebel Eltron Dashboard](docs/images/banner.svg)

Ein Lovelace-Dashboard für Stiebel-Eltron-Wärmepumpen, installierbar über HACS –
gedacht für eine oder mehrere Anlagen im selben Home Assistant.

> **Status: v0.2.0 – funktionsfähiges Dashboard.**
> Drei Views (Übersicht, Geräte, Bedienung), automatische Erkennung einer oder
> mehrerer Anlagen über Geräte-Label, Integration oder Signatur, sichtbare
> Degradation bei fehlenden Entitäten. Pflicht-Abhängigkeit: die HACS-Karte
> **Auto Entities** (`custom:auto-entities`) für die Geräte- und Bedienkarten.

## Voraussetzungen

- Home Assistant **≥ 2024.10** (`sections`-View, `heading`- und `tile`-Karten).
- **Auto Entities** aus HACS (Frontend): ohne diese Karte fehlen Geräte- und
  Bedienkarten; die Zusammenfassung bleibt sichtbar und nennt die Ursache.
- Eine eingebundene Wärmepumpe: Stiebel Eltron ISG (Modbus, `stiebel_eltron_isg`),
  ISG/HTTP (`stiebel_eltron_http`) oder ein ESPHome-CAN-Gateway.

Die Karten suchen keine festen Entity-Präfixe. Sie erkennen eine Anlage am
**Gerät** und lösen die Werte über Funktions-Suffixe auf (`*_aussentemp`,
`*_speicheristtemp`, `*_programmschalter`, …). Details: [`docs/design.md`](docs/design.md).

## Ein Gerät sichtbar machen

| Anbindung | Was zu tun ist |
|---|---|
| ISG (Modbus) / ISG-HTTP | nichts – das Gerät der Integration wird automatisch erkannt |
| ESPHome / MQTT / Modbus (eigene YAML) | Gerät mit dem Label **`stiebel_eltron`** versehen (Einstellungen → Geräte & Dienste → Geräte) |

Ohne Label erkennt das Dashboard eine Anlage mit mindestens drei WP-Signaturen,
zeigt sie aber erst als Karte, wenn sie gelabelt oder Teil einer Stiebel-Integration
ist. Die Zusammenfassung sagt in diesem Fall ausdrücklich, welches Gerät ein Label
braucht.

**Zweite Anlage:** zweiten Config Entry anlegen bzw. zweites Gerät labeln – es
erscheint automatisch ein zweiter Geräteblock, **ohne YAML-Änderung**.


## Installation über HACS

1. HACS öffnen → **Integrationen**-Menü oben rechts → **Benutzerdefinierte Repositories**.
2. Repository-URL eintragen, Kategorie **Dashboard** wählen, hinzufügen.
3. Das Repository in HACS öffnen und **Herunterladen**.
4. Home Assistant neu starten.

HACS legt die Dateien unter `config/www/community/stiebel-eltron-dashboard/` ab.
Die Dashboard-YAML liegt danach hier:

```
config/www/community/stiebel-eltron-dashboard/stiebel_eltron.yaml
```

## Dashboard in Home Assistant einbinden

YAML-Dashboard in `configuration.yaml` registrieren (der Pfad ist relativ zum
Konfigurationsverzeichnis):

```yaml
lovelace:
  dashboards:
    stiebel-eltron:
      mode: yaml
      title: Stiebel Eltron
      icon: mdi:heat-pump
      show_in_sidebar: true
      filename: www/community/stiebel-eltron-dashboard/stiebel_eltron.yaml
```

Danach **Entwicklerwerkzeuge → YAML → Konfiguration prüfen** und Home Assistant
neu starten. Das Dashboard erscheint in der Seitenleiste.

> Der Schlüssel `stiebel-eltron` ist der URL-Pfad und muss einen Bindestrich
> enthalten (Vorgabe von Home Assistant).

## Updates

HACS zeigt neue Releases automatisch an; ein Update ersetzt die YAML-Datei an
derselben Stelle. Eigene Anpassungen gehören deshalb **nicht** in
`config/www/community/...`, sondern in eine Kopie oder ein eigenes Dashboard.

## Repository-Aufbau

| Pfad | Zweck |
|---|---|
| `dashboards/stiebel_eltron.yaml` | Einstiegspunkt: Titel + drei Views (nur `!include`) |
| `dashboards/includes/views/` | je eine View (Übersicht, Geräte, Bedienung) |
| `dashboards/includes/cards/` | Karten und `auto-entities`-Vorlagen |
| `dashboards/templates/jinja/` | kanonische Makros (Resolver, Status, Discovery, Funktionskatalog) |
| `dist/` | Auslieferung an HACS: Dashboard-YAML (gespiegelt) + `.js`-Einstiegspunkt |
| `hacs.json` | HACS-Metadaten (Name, Mindest-HA-Version, Einstiegspunkt) |
| `scripts/` | `sync_jinja.py`, `sync_dist.py`, `validate.py`, `check_ha_parse.py`, `render_test.py`, `build_release.py` |
| `docs/design.md` | verbindliches Design: Discovery, Resolver, Karten, Degradation |
| `docs/architecture.md` | Entscheidungen: HACS-Kategorie, Layout, Release-Weg |
| `.github/workflows/` | Validierung (push/PR) und Release (Tag `vX.Y.Z`) |

## Entwicklung

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt

python scripts/sync_jinja.py      # Makros aus templates/jinja/ in die Karten
python scripts/sync_dist.py       # dashboards/ -> dist/
python scripts/validate.py        # hacs.json, Includes, Kartenstruktur, dist-Sync
python scripts/build_release.py --version 0.2.0

# Optional: echter HA-Loader + Abnahmetest mit zwei simulierten Anlagen
uv run --with homeassistant python scripts/check_ha_parse.py
uv run --with homeassistant python scripts/render_test.py
```

`scripts/render_test.py` rendert die Karten mit Home Assistants eigener
Template-Umgebung gegen eine simulierte Geräteregistry (zwei Anlagen mit
unterschiedlichen Präfixen, eine `unavailable`-Anlage, eine rein lesende
HTTP-Anlage) und prüft die Abnahmekriterien dieses Repositories.


Release: Tag `vX.Y.Z` pushen – der Workflow baut das Archiv und veröffentlicht
es mit Prüfsumme.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
