# Architektur- und Entscheidungsnotizen

Dieses Dokument begründet die Struktur des Repositories. Es ist die Referenz
für alle, die daran weiterarbeiten (Dashboard-Implementierung, Doku, Release).

## Ziel

Ein Lovelace-Dashboard für Stiebel-Eltron-Wärmepumpen, das

- über HACS installier- und aktualisierbar ist,
- mit einer **oder mehreren** Anlagen im selben Home Assistant funktioniert,
- ohne eigene Integration auskommt (reines YAML, keine Python-Laufzeit),
- nach der Installation in wenigen Schritten in der Seitenleiste auftaucht.

## Entscheidung 1: HACS-Kategorie **Dashboard** (intern `plugin`)

**Entscheidung:** Das Repository wird als HACS-Kategorie `Dashboard`
(`plugin`) ausgeliefert – nicht als `integration`, `template` oder `theme`.

**Begründung:**

| Kategorie | Anforderung (HACS-Doku/Code) | passt hier? |
|---|---|---|
| `integration` | `custom_components/<domain>/manifest.json` mit `domain`, `version`, `documentation`, `issue_tracker`, `codeowners`; HA lädt Python-Code | Nein: Wir liefern keine Python-Laufzeit, keine Entitäten, keinen Config-Flow. Eine Attrappe würde bei jedem HA-Start geladen und Fehler produzieren. |
| `template` | `.jinja`-Datei im Root + `filename` in `hacs.json` | Nein: Jinja-Templates sind nicht dasselbe wie Dashboard-YAML; HACS legt sie in `custom_templates/` ab, dort liest kein Dashboard. |
| `theme` | Theme-YAML mit `themes`-Schlüssel | Nein: Wir liefern kein Farbschema. |
| **`dashboard`** (`plugin`) | `.js`-Datei in `dist/` (oder Root), deren Name zu `hacs.json → filename` passt; HACS lädt **alle** Dateien aus `dist/` nach `config/www/community/<repo>/` | **Ja:** HACS ist genau der von der Home-Assistant-Doku vorgesehene Weg, Dateien nach `config/www/community/` zu verteilen und zu versionieren. |

Belege im HACS-Quellcode (`custom_components/hacs/repositories/plugin.py`):

- `localpath` = `config/www/community/<repository>`.
- `update_filenames()` akzeptiert `dist/<filename>`; ist `filename` in
  `hacs.json` gesetzt, gilt ausschließlich dieser Name.
- Der Download sammelt **alle** Dateien unter dem gefundenen Pfad ein – auch
  Nicht-JS-Dateien (HACS-Doku: „If your plugin requires files that are not js
  files, place all files (including the card file) in the dist directory“).

Damit ist die YAML-Kartei Teil des HACS-Updates, ohne dass eine Integration
nötig wäre.

### Warum trotzdem eine `.js`-Datei?

Die Kategorie `dashboard` verlangt zwingend einen JS-Einstiegspunkt; fehlt er,
meldet HACS `Repository structure ... is not compliant`. `dist/stiebel-eltron-dashboard.js`
erfüllt genau diese Anforderung und ist bewusst **kein UI-Code**: Sie setzt
einen Marker (`globalThis.__stiebelEltronDashboard`) und schreibt eine
Konsolenzeile. Sie ist kein Ersatz für das Dashboard und enthält keine Karten.

Da das Dashboard im **YAML-Modus** läuft, registriert HACS außerdem keine
Lovelace-Ressource (`YAML mode detected, can not update resources`) – die Datei
wird von Home Assistant gar nicht geladen. Sie existiert ausschließlich für die
Strukturprüfung und als Herkunftsmarker.

## Entscheidung 2: `dashboards/` ist Quelle, `dist/` ist Auslieferung

HACS liefert nur den Inhalt von `dist/` aus. Gleichzeitig soll das Dashboard
lesbar und versioniert an einer normalen Stelle liegen.

- **Quelle:** `dashboards/stiebel_eltron.yaml` (Unterordner wie
  `dashboards/templates/` werden mit ausgeliefert – für `!include`-Bruchstücke)
- **Auslieferung:** `dist/` (byte-genau gespiegelte Ordnerstruktur)
- **Werkzeug:** `python scripts/sync_dist.py` (schreiben), `--check` (CI)
- **Absicherung:** `scripts/validate.py` und der Workflow schlagen fehl, wenn
  `dist/` von `dashboards/` abweicht. Damit kann kein veraltetes Artefakt
  released werden.

## Entscheidung 3: YAML-Modus statt Storage-Dashboard

Ein per HACS verteiltes Dashboard kann nicht in der UI angelegt werden (das
läge in `.storage`). Deshalb wird es in `configuration.yaml` als YAML-Dashboard
registriert:

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

Randbedingungen aus Home Assistant (`homeassistant/components/lovelace`):

- `title` ist Pflicht, `icon`, `show_in_sidebar`, `require_admin` sind optional.
- `filename` wird relativ zum Konfigurationsverzeichnis aufgelöst.
- Der URL-Pfad (Schlüssel unter `dashboards:`) muss einen Bindestrich enthalten.
- Das globale `lovelace: mode:` ist veraltet (Entfall in 2026.8) – nicht verwenden.

## Mindest-Home-Assistant-Version

`hacs.json → homeassistant: "2024.10.0"`.

Begründung: Das Gerüst selbst braucht nichts, die geplanten Bordmittel-Karten
brauchen aber `type: sections`/`heading` (ab 2024.3) und Karten-`visibility`
(ab 2024.10). **Regel:** Wird im Dashboard eine Funktion genutzt, die neuer ist,
muss dieser Wert im selben PR angehoben werden – sonst bricht die Installation
bei Nutzern mit älterer HA-Version mitten im Update ab.

## Release-Weg

1. `CHANGELOG.md` pflegen, Version committen.
2. Tag `vX.Y.Z` pushen (SemVer, ohne Suffixe).
3. `.github/workflows/release.yml` prüft das Repo, baut
   `release/stiebel-eltron-dashboard-vX.Y.Z.zip` (Inhalt von `dist/` plus
   `README.md`, `LICENSE`, `hacs.json`) und `release/SHA256SUMS.txt` und
   veröffentlicht beides als GitHub-Release.

**Harte Regel:** Kein Release-Asset darf exakt `stiebel-eltron-dashboard.js`
heißen. HACS prüft bei gesetztem `filename` zuerst die Release-Assets; ein
Treffer schaltet es in den Einzeldatei-Modus (`content.single = True`) und die
Dashboard-YAML würde nie installiert. Der `Artefakt prüfen`-Step im Workflow
bricht deshalb ab, wenn `release/*.js` existiert.

HACS ermittelt die angebotene Version aus dem neuesten Release-Tag; ohne
Release-Tags zeigt es nur den Commit-Hash und bietet kein sauberes Update an.

## Repository-Layout

```
hacs.json                      HACS-Metadaten (name, render_readme, homeassistant, filename)
README.md                      Installation, Einbindung, Entwicklung
LICENSE                        MIT
CHANGELOG.md                   Versionen
dashboards/stiebel_eltron.yaml Quelle des Dashboards
dist/                          Auslieferung: YAML + .js-Einstiegspunkt
docs/architecture.md           diese Datei
docs/images/banner.svg         README-Banner (kein Screenshot, bewusst)
scripts/sync_dist.py           dashboards/ -> dist/ (Spiegel)
scripts/validate.py            hacs.json, YAML-Struktur, dist-Sync (offline)
scripts/check_ha_parse.py      YAML mit HAs eigenem Loader + CONFIG_SCHEMA (braucht HA)
scripts/build_release.py       Release-Archiv + SHA256SUMS.txt
.github/workflows/validate.yml Repo-Checks, actionlint, HA-Loader, HACS-Action
.github/workflows/release.yml  Tag -> Release mit Archiv + Prüfsumme
```

## Verifikation: was geprüft wird und was nicht

Home Assistant validiert **Lovelace-Karten nicht serverseitig** – Karten kennt
nur das Frontend. Ein "Dashboard lädt fehlerfrei" heißt in HA deshalb:

1. Die Datei ist gültiges YAML (HA parst sie mit `load_yaml_dict`).
2. Das Root-Mapping enthält eine nicht-leere `views`-Liste.
3. Die Registrierung in `configuration.yaml` entspricht `lovelace.CONFIG_SCHEMA`.

Genau diese drei Punkte prüft dieses Repository automatisiert:

| Ebene | Werkzeug | Prüft |
|---|---|---|
| offline | `scripts/validate.py` | hacs.json gegen HACS-Schema (unbekannte Schlüssel = Fehler), Struktur `dist/` + `filename`, Views/Karten-Typen, Duplikat-Schlüssel im YAML, `dist/`-Sync |
| HA-Code | `scripts/check_ha_parse.py` | parst `dashboards/` und `dist/` mit `homeassistant.util.yaml.load_yaml_dict` (derselbe Aufruf wie `LovelaceYAML._load_config`) und validiert das README-Snippet gegen `lovelace.CONFIG_SCHEMA` |
| Workflows | actionlint (gepinnt) | Syntax/Ausdrücke der GitHub-Workflows |
| HACS | `hacs/action` Kategorie `plugin` | dieselbe Prüfung wie beim Hinzufügen in HACS |
| YAML-Stil | yamllint | Einrückung, Tabs, Länge, `truthy` |

Nachgewiesen am Gerüst: HA 2026.2.3 parst `dashboards/stiebel_eltron.yaml` und
`dist/stiebel_eltron.yaml` ohne Fehler; das README-Snippet wird von
`CONFIG_SCHEMA` akzeptiert. Nicht geprüft wird die spätere Karten-Optik (nur im
Browser sichtbar) und das Verhalten ohne Stiebel-Eltron-Anbindung (der
Platzhalter enthält bewusst keine Entitäten).


## Namenskopplung (wichtig beim Anlegen des GitHub-Repositories)

HACS installiert nach `config/www/community/<repository-name>`. Der Name des
GitHub-Repositories muss deshalb **`stiebel-eltron-dashboard`** lauten – sonst
passt der `filename`-Pfad in der README-Einbindung nicht mehr und die
Installationsanleitung ist falsch.

Der `.js`-Einstiegspunkt ist davon entkoppelt: `hacs.json → filename` erzwingt
unabhängig vom Repo-Namen die Datei `dist/stiebel-eltron-dashboard.js`.

## GitHub-Repository-Einstellungen (einmalig, nicht im Repo)

Die HACS-Action prüft Metadaten des GitHub-Repositories, die sich nicht
versionieren lassen:

- **Description:** „Lovelace dashboard for Stiebel Eltron heat pumps (HACS)“
- **Topics:** `home-assistant`, `hacs`, `lovelace`, `dashboard`, `stiebel-eltron`, `heat-pump`
- **Issues:** aktiviert
- **Releases:** nicht als Draft, erstes Release `v0.1.0` aus dem Tag
- **Sichtbarkeit:** öffentlich (HACS unterstützt nur öffentliche Repositories)

Bis diese Punkte gesetzt sind, schlägt der Job `hacs` im Workflow `Validate`
erwartungsgemäß fehl (Checks `description`, `topics`, `images`).

## Abgrenzung / offene Punkte

- Dashboard-Inhalt, Mehrgeräte-Erkennung und Entity-Konventionen sind **nicht**
  Teil dieses Gerüsts (siehe [design.md](design.md)).
- Kein HACS-Default-Repository: dafür ist ein PR im Store-Repository nötig und
  erst sinnvoll, wenn das Dashboard Inhalt hat.
- Screenshot für README/HACS-Store fehlt bewusst noch (kein Fake-Bild); wird
  nach der ersten echten Dashboard-Version ergänzt.
