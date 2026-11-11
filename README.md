# Stiebel Eltron Dashboard

![Stiebel Eltron Dashboard](docs/images/banner.svg)

Ein Lovelace-Dashboard für Stiebel-Eltron-Wärmepumpen, installierbar über HACS –
gedacht für eine oder mehrere Anlagen im selben Home Assistant.

> **Status: Repository-Gerüst (v0.1.0).**
> HACS-Metadaten, Release-Pipeline und ein ladefähiges Platzhalter-Dashboard
> stehen. Die eigentlichen Geräte-, Kennzahlen- und Störungskarten folgen.
> Aktuell zeigt das Dashboard nur eine Hinweis-Karte.

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
| `dashboards/stiebel_eltron.yaml` | Quelle des Dashboards (hier wird entwickelt) |
| `dist/` | Auslieferung an HACS: Dashboard-YAML + `.js`-Einstiegspunkt |
| `hacs.json` | HACS-Metadaten (Name, Mindest-HA-Version, Einstiegspunkt) |
| `scripts/` | `sync_dist.py`, `validate.py`, `check_ha_parse.py`, `build_release.py` |
| `docs/architecture.md` | Entscheidungen: HACS-Kategorie, Layout, Release-Weg |
| `.github/workflows/` | Validierung (push/PR) und Release (Tag `vX.Y.Z`) |

## Entwicklung

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt

python scripts/sync_dist.py       # dashboards/ -> dist/
python scripts/validate.py        # hacs.json, YAML-Struktur, dist-Sync
python scripts/build_release.py --version 0.1.0

# Optional: YAML mit dem echten Home-Assistant-Loader prüfen (~100 Pakete)
uv run --with homeassistant python scripts/check_ha_parse.py
```

Release: Tag `vX.Y.Z` pushen – der Workflow baut das Archiv und veröffentlicht
es mit Prüfsumme.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
