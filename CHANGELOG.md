# Changelog

Alle nennenswerten Änderungen an diesem Repository.
Format: [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung: [Semantic Versioning](https://semver.org/lang/de/).

## [0.4.0] - 2026-11-11

### Hinzugefügt

- **HACS-Strategie `custom:stiebel-eltron`**: `stiebel-eltron-dashboard.js` ist jetzt eine
  vollwertige Lovelace-Dashboard-Strategie. Eine HACS-Installation (Kategorie **Dashboard**)
  liefert genau eine JS-Datei; das Dashboard wird mit zwei Zeilen Raw-Konfiguration angelegt.
  Die Strategie erzeugt die drei Views und löst die Karten je Anlage zur Laufzeit selbst auf –
  **ohne `auto-entities`**, ohne `configuration.yaml`-Eintrag und ohne Neustart.
- `scripts/build_strategy.py` baut das Bundle aus `dashboards/` + `scripts/strategy_runtime.js`.
- `scripts/test_strategy.mjs`: 16 Abnahmeprüfungen gegen zwei simulierte Anlagen (Label,
  ISG-Integration, `_2`-Suffixe, HTTP-Ausschluss, keine `auto-entities`-Reste).
- README beschreibt jetzt zwei Installationswege: **Weg A – HACS + Strategie** und
  **Weg B – YAML-Dateien**.

### Geändert

- HACS-Auslieferung: Die `.js`-Datei liegt im Repository-Root und wird als Release-Asset
  veröffentlicht; `dist/` enthält nur noch die YAML-Variante. Der Release-Workflow lädt nur
  die Strategie-Datei hoch.
- `scripts/validate.py` akzeptiert den `.js`-Einstiegspunkt im Root (vorher nur `dist/`).
- Der Hinweis in der Zusammenfassungskarte unterscheidet jetzt YAML-Variante und Strategie.

### Behoben

- **HACS-Installation der reinen YAML-Variante war in Home Assistant 2026.11 nicht möglich:**
  Die Marketplace-Kategorie Dashboard liefert ausschließlich JavaScript-Dateien aus, keine
  `includes/`-Ordner. Der Download endete mit
  „The installed content has no stiebel-eltron-dashboard.js“. Die Strategie ist die
  HACS-native Lösung; die YAML-Dateien bleiben als manuelle Variante erhalten.

## [0.3.0] - 2026-11-11

### Hinzugefügt

- **Ein-Klick-Einstieg in HACS** über den offiziellen `my.home-assistant.io`-Button in der README
  (Kategorie `plugin`, also im HACS-UI **Dashboard**).
- README nennt jetzt die echte Repository-URL `PuzzleFoco/stiebel-eltron-dashboard` statt eines
  `<OWNER>`-Platzhalters.

### Geändert

- `docs/research-integration.md`: private LAN-Adressen durch Platzhalter (`<gateway-ip>`,
  `<ha-host-ip>`, `<vent-ip>`, `<isg-ip>`) ersetzt, damit die Dokumentation öffentlich
  veröffentlicht werden kann.

## [0.2.1] - 2026-11-11

### Hinzugefügt

- **Vollständige Installationsanleitung** in der README: Voraussetzungen, HACS-Ablauf
  (benutzerdefiniertes Repository → Kategorie **Dashboard** → Download), Registrierung als
  YAML-Dashboard, Geräte-Label, Erklärung der Entity-Präfix-Konvention (Suffix statt Präfix),
  Anleitung für eine zweite Anlage, Screenshot-/GIF-Platzhalter, Update/Deinstallation und
  ein Troubleshooting-Abschnitt mit 15 typischen Fehlern.
- **`docs/acceptance.md`**: durchgeführtes Abnahmeprotokoll (23 Prüfpunkte) mit Umgebung,
  Evidenz, Grenzen und sechs offenen Issues inklusive Reproduktionsschritten.
- `scripts/validate.py` prüft jetzt die README-Installationsanleitung gegen die ausgelieferten
  Dateien: Dashboard-Schlüssel `stiebel-eltron`, HACS-Installpfad, vorhandene Zieldatei,
  `includes/` im Payload und Konsistenz der Kartenlinks.

### Geändert

- Hinweis in der Zusammenfassungskarte nennt die aktuelle HACS-Kategorie **Dashboard** und den
  Suchbegriff `auto-entities` (vorher „Frontend“/„Auto Entities“).

### Behoben

- Die README erklärte den Dashboard-Schlüssel nur als „muss einen Bindestrich enthalten“.
  Tatsächlich muss er `stiebel-eltron` heißen, weil die Karten fest auf
  `/stiebel-eltron/…` verlinken; ein anderer Schlüssel erzeugte 404er.

## [0.2.0] - 2026-11-11

### Hinzugefügt

- **Dashboard-Inhalt** (`dashboards/stiebel_eltron.yaml` + `includes/`): drei Views
  (Übersicht, Geräte, Bedienung) mit Status-Ampel, Kern-KPIs, Detailwerten je Anlage,
  Betriebsart-/Sollwert-Bedienung und Störungsanzeige.
- **Mehrgeräte-Erkennung ohne YAML-Änderung**: Geräte-Identität über die Device-ID,
  Discovery per Label `stiebel_eltron` → Stiebel-Integration → Signatur (≥ 3 Merkmale).
  Ein zweites Gerät (zweiter Config Entry oder gelabeltes ESPHome-Gerät) erzeugt
  automatisch einen zweiten Geräteblock.
- **Entity-Resolver** über Funktions-Suffixe (DE/EN/lokale Namen) statt fester
  Entity-Präfixe, inklusive HA-Duplikatsuffix `_2`/`_3`.
- **Robuste Degradation**: fehlende Entitäten und `unavailable`/`unknown` werden zu
  „—“ und ⚪ „Keine Daten“ (nie 0); die Zusammenfassung nennt Anlagen ohne Karte,
  ohne Anker und fehlende Kerngrößen.
- **Deutsche Darstellung**: Dezimalkomma, Einheiten aus der Entität (kWh/MWh werden
  nicht umgerechnet), COP bewusst nicht berechnet.
- `scripts/sync_jinja.py` (kanonische Makros in die Karten), `scripts/render_test.py`
  (Abnahmetest mit zwei simulierten Anlagen über HAs Template-Umgebung).
- `scripts/validate.py` löst `!include` auf und prüft Sections/Karten sowie
  `auto-entities`-Filterregeln; CI prüft zusätzlich Makro-Sync und Abnahmetest.

### Geändert

- Platzhalter-Dashboard ersetzt; `dist/` enthält jetzt die vollständige
  Dashboard-Struktur (rekursiv, inkl. Includes).
- `line-length` in `.yamllint.yml` auf 300 angehoben (Markdown-Tabellen und
  Jinja-Aufrufe sind nicht umbrechbar).

### Bekannte Voraussetzung

- Pflicht-Abhängigkeit: HACS-Karte **Auto Entities** (`custom:auto-entities`).

## [0.1.0] - 2026-11-11

### Hinzugefügt

- HACS-Repository-Gerüst für die Kategorie **Dashboard** (`hacs.json`, `README.md`, `LICENSE`).
- Platzhalter-Dashboard `dashboards/stiebel_eltron.yaml`, das ohne Entitäten und
  ohne Stiebel-Eltron-Anbindung fehlerfrei lädt; wird nach `dist/` gespiegelt.
- HACS-Einstiegspunkt `dist/stiebel-eltron-dashboard.js` (Strukturanforderung
  der Kategorie Dashboard).
- Prüfskripte `scripts/validate.py`, `scripts/sync_dist.py`, `scripts/build_release.py`.
- GitHub-Workflows: Validierung bei Push/PR, Release bei Tag `vX.Y.Z`
  (Archiv + `SHA256SUMS.txt`).
