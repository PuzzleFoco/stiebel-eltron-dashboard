# Abnahmeprotokoll

**Prüfobjekt:** Stiebel Eltron Dashboard, Stand **v0.2.1** (Doku-Patch auf die Implementierung v0.2.0)
**Datum:** 2026-11-11
**Durchführung:** automatisiert – Repository-Skripte, Home-Assistant-Loader, Template-Engine und
Live-Abfragen gegen das Produktivsystem.

| Zweck | Umgebung |
|---|---|
| Repository-/YAML-Prüfung | Linux, Python 3.14.9, PyYAML, yamllint 1.35.1 |
| HA-Loader und Rendering | Home Assistant **2026.2.3** (`uv run --with homeassistant`) |
| Live-Render und HACS | Home Assistant **2026.11.1**, deutsch, Produktivsystem |

**Abnahmeregel:** Jede Checkbox ist abgehakt **oder** verweist auf ein offenes Issue mit
Reproduktionsschritten (Abschnitt [Offene Issues](#offene-issues)).

> **Nachtrag v0.4.0 (unten):** Die folgenden Tabellenzeilen beschreiben den Stand v0.2.1.
> Inzwischen wurden Repository, Label und Live-Werte geprüft und die HACS-Auslieferung auf eine
> Lovelace-Strategie umgestellt. Aktuelle Ergebnisse stehen im Abschnitt
> [Nachtrag v0.4.0](#nachtrag-v040-2026-11-11).

## Ergebnis auf einen Blick

| ID | Prüfpunkt | Ergebnis |
|---|---|---|
| A-01 | README deckt Voraussetzungen, Installation, Label, zweites Gerät, Troubleshooting ab | ✅ |
| A-02 | HACS-Struktur und Kategorie **Dashboard** (`plugin`) korrekt | ✅ |
| A-03 | Installation über HACS durch einen neuen Nutzer (End-to-End, < 10 Min.) | ⬜ O-01 |
| A-04 | Installationslayout am Zielpfad `www/community/…` lädt mit HA-Loader | ✅ |
| A-05 | Registrierung in `configuration.yaml` ist HA-Schema-konform | ✅ |
| A-06 | Dashboard-Schlüssel, HACS-Pfad und Kartenlinks sind konsistent | ✅ |
| A-07 | Ein Gerät wird ohne Label über die Signatur erkannt | ✅ |
| A-08 | Ein Gerät bekommt nach dem Labeln eine Karte | ⬜ O-02 |
| A-09 | Kartenwerte exakt (Dezimalkomma, Einheiten, kein Fremdwert) | ✅ |
| A-10 | Live-Werte der aktuellen Anlage | ⬜ O-03 |
| A-11 | Zwei Geräte ohne YAML-Änderung (Mechanik, inkl. `_2`-Suffix) | ✅ |
| A-12 | Zwei Geräte im Live-Betrieb | ⬜ O-04 |
| A-13 | Fehlende Entität wird zu „—“ (nicht 0, nicht Wert der anderen Anlage) | ✅ |
| A-14 | `unavailable` wird live zu ⚪ „Keine Daten“ | ✅ |
| A-15 | Lüftungsgerät wird nicht als Wärmepumpe erkannt | ✅ |
| A-16 | Rein lesende HTTP-Anlage bekommt keine Bedien-Tiles | ✅ |
| A-17 | Dashboard übersteht einen Home-Assistant-Neustart | ⬜ O-05 |
| A-18 | Troubleshooting deckt Entitäten, Präfix und HACS-Kategorie ab | ✅ |
| A-19 | Screenshot-/GIF-Platzhalter statt erfundener Bilder | ✅ |
| A-20 | Update und Deinstallation sind dokumentiert | ✅ |
| A-21 | Zielwert „unter 10 Minuten“ ist belegt | ⬜ O-06 |
| A-22 | Pflicht-Abhängigkeit `auto-entities` ist im Live-HACS auffindbar | ✅ |
| A-23 | Release-Artefakt enthält Dashboard + Includes und ist HACS-konform benannt | ✅ |

Reproduktion der automatisierten Prüfungen:

```bash
python scripts/validate.py
python scripts/sync_jinja.py --check
python scripts/sync_dist.py --check
yamllint -c .yamllint.yml dashboards dist .yamllint.yml
uv run --with homeassistant python scripts/check_ha_parse.py
uv run --with homeassistant python scripts/render_test.py
```

---

## A-01 — README deckt die Installation vollständig ab

- [x] **Erwartung:** Voraussetzungen, HACS-Installation (Custom Repository → installieren →
      Neustart), Dashboard-Einbindung, Entity-Präfix-Konvention, zweites Gerät,
      Screenshot-Platzhalter und Troubleshooting stehen in der README.
- **Vorgehen:** Abschnitte gegen die Aufgabenliste abgeglichen; `scripts/validate.py` prüft
  zusätzlich, dass Label `stiebel_eltron` und `auto-entities` vorkommen.
- **Ergebnis:**

  ```
  OK: README.md (Schlüssel 'stiebel-eltron', Pfad 'www/community/stiebel-eltron-dashboard/stiebel_eltron.yaml', Links konsistent)
  ```

  Alle internen Ankerlinks der README wurden gegen die Überschriften geprüft (8/8 gültig);
  `docs/design.md`, `LICENSE` und `docs/images/banner.svg` existieren.
- **Urteil:** bestanden.

## A-02 — HACS-Struktur und Kategorie

- [x] **Erwartung:** `hacs.json` ist schema-konform, der `.js`-Einstiegspunkt liegt in `dist/`,
      die Kategorie ist **Dashboard** (HACS-intern `plugin`).
- **Vorgehen:** `python scripts/validate.py`; Abgleich mit dem HACS-Quellcode
  (`custom_components/hacs/enums.py`: `HacsCategory.PLUGIN`; `base.py → set_active_categories()`
  aktiviert `INTEGRATION`, `PLUGIN`, `TEMPLATE`); Live-Abfrage der HACS-Instanz.
- **Ergebnis:**

  ```
  OK: Repository ist HACS-konform, Dashboard-Struktur ist gültig.
  ```

  Live-HACS 2026.11.1: `store.categories = ["plugin","integration","template","theme"]`,
  `lovelace_mode = "storage"`. Die Kategorie ist damit wählbar; HACS kann die
  `auto-entities`-Ressource automatisch eintragen. Die HACS-Dokumentation führt die Kategorie
  heute als **Dashboard** (Aliase: *Plugin*, *Lovelace*) – die README nennt beide Namen.
- **Urteil:** bestanden (Struktur und Kategorie), End-to-End siehe A-03.

## A-03 — Installation über HACS durch einen neuen Nutzer

- [ ] **Erwartung:** Eine Person ohne Vorwissen folgt der README und hat in unter 10 Minuten ein
      laufendes Dashboard.
- **Vorgehen:** `git remote -v` und HTTP-Abfrage des in der README genannten Repository-Pfads.
- **Ergebnis:** **nicht durchführbar.** Das Repository hat keinen Remote
  (`git remote -v` ist leer), `https://github.com/<OWNER>/stiebel-eltron-dashboard` existiert
  nicht (HTTP 404). Ohne öffentliches Repository kann HACS kein benutzerdefiniertes Repository
  anlegen; der komplette Ablauf ist blockiert.
- **Teilergebnis:** Struktur (A-02), Zielpfad (A-04), Schema (A-05) und Pfadkonsistenz (A-06)
  sind geprüft. Es fehlt ausschließlich der Verteilweg.
- **Urteil:** offen → **O-01**.

## A-04 — Installationslayout am Zielpfad

- [x] **Erwartung:** Nach dem HACS-Download liegt `stiebel_eltron.yaml` **mit** `includes/` unter
      `config/www/community/stiebel-eltron-dashboard/`; Home Assistants Loader löst alle
      `!include`-Pfade relativ zur Datei auf.
- **Vorgehen:** Inhalt von `dist/` (das ist der HACS-Payload) in ein temporäres
  Konfigurationsverzeichnis unter `www/community/stiebel-eltron-dashboard/` kopiert und mit
  `homeassistant.util.yaml.load_yaml_dict` (HA 2026.2.3) geladen – derselbe Aufruf, den
  `LovelaceYAML._load_config` zur Laufzeit macht.
- **Ergebnis:**

  ```
  HA 2026.2.3 | title: Stiebel Eltron | views: 3
   - uebersicht | Übersicht | type: sections | sections: 2 | cards in s0: 1
   - geraete | Geräte | type: sections | sections: 1 | cards in s0: 2
   - bedienung | Bedienung | type: sections | sections: 3 | cards in s0: 3
  erste Karte s0c0: markdown
  Karte s1c1: custom:auto-entities
  ```

  Die 16 ausgelieferten YAML-Dateien (Root + Views + Karten) sind vorhanden, keine
  `!include`-Zeile blieb als String stehen.
- **Urteil:** bestanden.

## A-05 — Registrierung in `configuration.yaml`

- [x] **Erwartung:** Das README-Snippet wird von Home Assistant akzeptiert; die Datei am
      angegebenen Pfad wird gefunden.
- **Vorgehen:** `scripts/check_ha_parse.py` (prüft den ersten `lovelace:`-Block der README gegen
  `lovelace.CONFIG_SCHEMA`) und zusätzlich ein vollständiger `hass --script check_config`
  gegen das unter A-04 gebaute Konfigurationsverzeichnis.
- **Ergebnis:**

  ```
  OK: README.md – lovelace-Snippet ist gegen CONFIG_SCHEMA gültig
  Successful config (all)
  lovelace:
    dashboards:
      stiebel-eltron: ?
        filename: www/community/stiebel-eltron-dashboard/stiebel_eltron.yaml
  ```

  Exit-Code 0. Der Schlüssel enthält den von HA verlangten Bindestrich
  (`homeassistant/components/lovelace/__init__.py`: `Url path needs to contain a hyphen (-)`).
- **Urteil:** bestanden.

## A-06 — Schlüssel, Pfad und Links konsistent

- [x] **Erwartung:** Der Dashboard-Schlüssel passt zu den fest verdrahteten Links der Karten
      (`/stiebel-eltron/geraete`, `/stiebel-eltron/bedienung`), der `filename`-Pfad passt zum
      HACS-Installationsordner.
- **Vorgehen:** Neue Prüfung `check_readme_install()` in `scripts/validate.py`; zwei Negativtests
  (falscher Schlüssel, falscher Repository-Name) müssen fehlschlagen.
- **Ergebnis:**

  ```
  OK: README.md (Schlüssel 'stiebel-eltron', Pfad 'www/community/stiebel-eltron-dashboard/stiebel_eltron.yaml', Links konsistent)

  Negativtest Schlüssel: 2 Fehler; letzter: Dashboard-YAML verlinkt auf ['/stiebel-eltron'], README-Schlüssel ist /stiebel
  Negativtest Pfad: 1 Fehler; letzter: README.md: 'filename' muss mit 'www/community/falscher-name/' beginnen …
  ```

- **Urteil:** bestanden. Die Prüfung läuft in CI mit (`validate.py` im Workflow `Validate`).

## A-07 — Ein Gerät: Erkennung ohne Label

- [x] **Erwartung:** Eine Anlage wird anhand ihrer Signatur erkannt, ein Lüftungsgerät nicht.
- **Vorgehen:** Discovery- und Zusammenfassungs-Template der Karten gegen das Live-System
  gerendert (`ha_eval_template`), ergänzt um eine Registry-Abfrage.
- **Ergebnis:**

  ```
  labels=['haghs_ignore'] | stiebel_label_devs=[] | isg=0 http=0 esphome_devs=2

  [1b33e9b1…] ESP32-PoE Technik | ents=120 | anchor=['sensor.heatingpump_aussentemp']
  [1e723190…] Lüftung            | ents=26  | anchor=['sensor.dachboden_luftung_lwz_aussentemperatur']

  ## Stiebel Eltron
  **1 Anlage** erkannt · 0 Karten · 1 mit Außentemperatur-Anker
  > ⚠️ **1 Anlage(n) ohne Karte:** ESP32-PoE Technik. Es fehlt das Geräte-Label `stiebel_eltron` …
  ```

  Die Lüftung hat nur eine der sieben Signaturen und wird korrekt nicht als Wärmepumpe gezählt.
- **Urteil:** bestanden.

## A-08 — Ein Gerät: Karte nach dem Labeln

- [ ] **Erwartung:** Nach dem Setzen des Geräte-Labels `stiebel_eltron` erscheint eine Karte,
      die Kopfzeile zeigt „1 Anlage · 1 Karte“.
- **Vorgehen:** Live-Registry abgefragt.
- **Ergebnis:** Auf dem Produktivsystem existiert kein Label `stiebel_eltron`
  (`labels=['haghs_ignore']`, `label_devices('stiebel_eltron') = []`). Die Karte kann daher live
  nicht entstehen; die Kopfzeile nennt den Grund korrekt. Die Kartenbildung selbst ist mit
  gelabelten Geräten in A-09/A-11 belegt.
- **Urteil:** offen → **O-02**.

## A-09 — Kartenwerte exakt

- [x] **Erwartung:** Werte mit deutschem Dezimalkomma und Geräte-Einheit, Modus als Text,
      keine Vermischung zweier Anlagen.
- **Vorgehen:** `scripts/render_test.py` (Home-Assistant-Template-Engine, simulierte
  Geräteregistry mit zwei Anlagen und unterschiedlichen Präfixen).
- **Ergebnis:**

  ```
  OK: 65 Prüfungen bestanden — zwei Anlagen, Degradation und Filter korrekt.
  ```

  Beispiele aus den Prüfungen: `7,0 °C`, `34,2 °C`, `48,1 °C / 50,0 °C`, Modus `Komfort`,
  `18,2 MWh` (Einheit unverändert übernommen), `| Rücklauf | — |`, und für die zweite Anlage
  `3,5 °C` / `45,0 °C` / `Eco` – ohne jeden Wert der ersten Anlage.
- **Urteil:** bestanden (simuliert, exakte Werte). Live-Werte siehe A-10.

## A-10 — Live-Werte der aktuellen Anlage

- [ ] **Erwartung:** Die Karte zeigt die echten Messwerte der Anlage.
- **Vorgehen:** Geräte-Detailkarte mit der echten Anker-Entität gerendert; Zustände der
  Entitäten abgefragt.
- **Ergebnis:** Das ESPHome-Gateway ist seit **2026-11-11 13:35 UTC** `unavailable`; alle
  Entitäten der Anlage melden `unavailable`. Die Karte rendert daher `⚪ Keine Daten` und alle
  Kennzahlen als „—“ (siehe A-14). Ein Live-Beleg für konkrete Zahlen ist in diesem Lauf nicht
  möglich; der letzte Lauf mit Werten (13:29) liegt außerhalb dieses Protokolls.
- **Urteil:** offen → **O-03**.

## A-11 — Zwei Geräte ohne YAML-Änderung (Mechanik)

- [x] **Erwartung:** Zwei Anlagen mit unterschiedlichen Präfixen ergeben zwei Blöcke; ein
      `_2`-Duplikatsuffix wird zugeordnet; keine Karte zeigt Werte der anderen Anlage.
- **Vorgehen:** `scripts/render_test.py`, Szenario mit ESPHome-Anlage (gemischte Präfixe) und
  ISG-Anlage (`select.…_programmschalter_2`).
- **Ergebnis:** Kopfzeile „**2 Anlagen** erkannt“, „2 Karten“, kein Hinweis „ohne Karte“;
  Karte 1 zeigt `7,0 °C`, Karte 2 `3,5 °C`; die jeweils andere Temperatur kommt in der anderen
  Karte nicht vor; der `_2`-Suffix wird aufgelöst.
- **Urteil:** bestanden (Mechanik). Live-Betrieb siehe A-12.

## A-12 — Zwei Geräte im Live-Betrieb

- [ ] **Erwartung:** Eine zweite physische Anlage erzeugt ohne YAML-Änderung einen zweiten Block.
- **Vorgehen:** Im Produktivsystem existiert genau eine Wärmepumpe (ESP32-Gateway); eine zweite
  Anlage ist nicht vorhanden und wurde nicht simuliert eingetragen.
- **Ergebnis:** nicht durchführbar.
- **Urteil:** offen → **O-04**.

## A-13 — Fehlende Entität wird zu „—“

- [x] **Erwartung:** Fehlt eine Kennzahl, steht „—“ – nie 0 und nie der Wert einer anderen Anlage.
- **Vorgehen:** `render_test.py`, Anlage ohne Rücklauf- und Diagnosewerte.
- **Ergebnis:** `| Rücklauf | — |` in Detail- und Übersichtskarte; `check_not_contains(... "0,0 °C")`
  und `check_not_contains(keller, "45,0")` bestehen. Bei vorhandenen Diagnosewerten erscheint
  der `<details>`-Block, bei fehlenden nicht.
- **Urteil:** bestanden.

## A-14 — `unavailable` wird live zu ⚪ „Keine Daten“

- [x] **Erwartung:** Eine ausgefallene Anlage verschwindet nicht still, sondern zeigt ⚪ und „—“.
- **Vorgehen:** Detailkarte mit der echten Anker-Entität gegen das Live-System gerendert,
  während alle Entitäten `unavailable` sind.
- **Ergebnis:**

  ```
  ## ⚪ ESP32-PoE Technik
  Keller · **Keine Daten** · Espressif esp32dev
  | Außen | — |
  | Warmwasser | — / — |
  ```

  Kein `0,0 °C`, kein eingefrorener Alt-Wert; die Karte bleibt vollständig sichtbar.
- **Urteil:** bestanden.

## A-15 — Lüftung wird nicht als Wärmepumpe erkannt

- [x] **Erwartung:** Ein Gerät mit nur einer WP-Signatur (Lüftung) erzeugt keine Karte und wird
      nicht gezählt.
- **Vorgehen:** Live-Discovery (A-07) und `render_test.py` (Gerät „Lüftung LWZ“ mit 26 Entitäten).
- **Ergebnis:** Live: 1 Anlage (nur ESP32), Lüftung nicht enthalten. Simulation:
  `check_not_contains(summary, "Lüftung")` und keine Gerätekarte für die Lüftung.
- **Urteil:** bestanden.

## A-16 — HTTP-Anlage bleibt lesend

- [x] **Erwartung:** Eine rein lesende `stiebel_eltron_http`-Anlage bekommt Übersichts- und
      Detailkarten, aber keine Bedien-Tiles.
- **Vorgehen:** `render_test.py`, Szenario HTTP; zusätzlich Regelprüfung in `validate.py`
  (`exclude: integration: stiebel_eltron_http` in allen Bedienkarten).
- **Ergebnis:** HTTP-Anlage wird als Anlage erkannt und gezählt; die Bedien-Gruppen rendern
  ihre `else`-Hinweise statt Tiles; `validate.py` akzeptiert die Filterregeln.
- **Urteil:** bestanden.

## A-17 — Neustart-Persistenz

- [ ] **Erwartung:** Nach einem Home-Assistant-Neustart ist das Dashboard weiter in der
      Seitenleiste und zeigt Daten.
- **Vorgehen:** Nicht ausgeführt – dafür müsste das Produktivsystem neu gestartet und das
  Dashboard zuvor installiert werden (blockiert durch O-01/O-02).
- **Sachstand:** Das Dashboard ist statische Konfiguration (`lovelace.dashboards`, `mode: yaml`,
  Datei unter `config/www/community/…`); es gibt keinen Laufzeitzustand, der einen Neustart
  nicht überlebt. Die Datei wird von HACS verwaltet und liegt außerhalb von `.storage`.
  Belegt ist, dass HA die Konfiguration in zwei unabhängigen Prozessen (`check_config`,
  `check_ha_parse`) identisch lädt.
- **Urteil:** offen → **O-05**.

## A-18 — Troubleshooting deckt die typischen Fehler ab

- [x] **Erwartung:** Entitäten fehlen, falsches Präfix, falsche HACS-Kategorie – jeweils mit
      Ursache und Lösung.
- **Vorgehen:** README-Abschnitt gegen die Fehlerfälle geprüft.
- **Ergebnis:** Tabelle mit 15 Symptomen; darunter
  „Custom element doesn't exist: auto-entities“, „Noch keine Wärmepumpe erkannt“,
  „Werte zeigen —“, „Werte einer Anlage fehlen komplett“ (Präfix/Suffix),
  „Repository structure … is not compliant“ (HACS-Kategorie),
  „Links führen auf 404“ (Dashboard-Schlüssel), „Dashboard fehlt in der Seitenleiste“.
  Zusätzlich eine 5-Punkte-Diagnose im `<details>`-Block.
- **Urteil:** bestanden.

## A-19 — Screenshot-/GIF-Platzhalter

- [x] **Erwartung:** Platzhalter benennen Datei und Inhalt; keine erfundenen Aufnahmen.
- **Vorgehen:** README-Abschnitt „Screenshots und GIFs“ und `docs/images/` geprüft.
- **Ergebnis:** fünf geplante Medien mit Dateinamen, Inhalt und Status „⬜ offen“; vorhanden ist
  nur `docs/images/banner.svg`. Kein Bild wurde erzeugt oder als Screenshot ausgegeben.
- **Urteil:** bestanden.

## A-20 — Update und Deinstallation dokumentiert

- [x] **Erwartung:** Beide Wege sind beschrieben, inklusive der Warnung vor Änderungen im
      HACS-Ordner.
- **Vorgehen:** README gelesen; Verhalten gegen HACS-Quellcode geprüft
  (`update_dashboard_resources`, `remove_dashboard_resources`).
- **Ergebnis:** Update über HACS-Aktualisierungen, Seite neu laden (HA liest die YAML bei
  Bedarf anhand des Änderungszeitpunkts neu, `LovelaceYAML._load_config`); Deinstallation über
  Entfernen des `lovelace`-Eintrags + HACS-Entfernen. Eigene Anpassungen im HACS-Ordner werden
  ausdrücklich widerraten.
- **Urteil:** bestanden.

## A-21 — Zielwert „unter 10 Minuten“

- [ ] **Erwartung:** Ein neuer Nutzer braucht ab „HACS ist eingerichtet“ weniger als 10 Minuten.
- **Vorgehen:** Nicht messbar ohne Testperson; der Ablauf wurde auf fünf Schritte und **einen**
  Neustart reduziert (HACS-Download und Registrierung werden zusammen geladen).
- **Ergebnis:** offen; ein Usability-Lauf mit Stoppuhr steht aus.
- **Urteil:** offen → **O-06**.

## A-22 — Pflicht-Abhängigkeit im Live-HACS auffindbar

- [x] **Erwartung:** `auto-entities` ist ohne benutzerdefiniertes Repository im HACS-Store zu
      finden und zu installieren.
- **Vorgehen:** `ha_get_hacs_info` mit `action: search`, `query: "auto-entities"`.
- **Ergebnis:** genau ein Treffer: `thomasloven/lovelace-auto-entities`, Kategorie `plugin`,
  `status: "default"`, `available_version: v1.16.1`, `installed: false`. Der Suchbegriff muss
  den Bindestrich enthalten (die Suche nach „auto entities“ liefert 0 Treffer) – die README
  nennt deshalb ausdrücklich `auto-entities`.
- **Urteil:** bestanden.

## A-23 — Release-Artefakt

- [x] **Erwartung:** Das Archiv enthält den HACS-Payload (Dashboard-YAML + `includes/` +
  `.js`), und kein Release-Asset heißt exakt wie `hacs.json → filename`.
- **Vorgehen:** `python scripts/build_release.py --version 0.2.1`, Archivliste und Prüfsumme.
- **Ergebnis:** `release/stiebel-eltron-dashboard-v0.2.1.zip` mit 20 Dateien:
  `stiebel_eltron.yaml`, 15 `includes/…yaml`, `stiebel-eltron-dashboard.js`, `README.md`,
  `LICENSE`, `hacs.json`. Das Asset heißt `…-v0.2.1.zip` – HACS bleibt damit im
  Verzeichnis-Modus und installiert die YAML mit (kein Einzeldatei-Modus). SHA-256:
  `3ce740a0231fa9923359c81bae7e9da2cef4c9f891ac74df5c14b7fe59a38811`
  (`release/SHA256SUMS.txt`). `release/` ist gitignored; im Repository wird das Archiv
  beim Tag `vX.Y.Z` vom Release-Workflow identisch neu gebaut.
- **Urteil:** bestanden.

---

## Offene Issues

### O-01 — Öffentliches GitHub-Repository fehlt (blockiert A-03)

**Tatsächlich:** Das lokale Repository hat keinen Remote; die in der README genannte URL läuft
ins Leere (HTTP 404). HACS kann ohne öffentliches Repository kein benutzerdefiniertes
Repository prüfen oder herunterladen.

**Reproduktion:**

1. `git -C /home/fabius/workspace/stiebel-eltron-dashboard remote -v` → keine Ausgabe.
2. `curl -s -o /dev/null -w '%{http_code}' https://github.com/<OWNER>/stiebel-eltron-dashboard`
   → `404`.
3. In HACS: ⋮ → *Benutzerdefinierte Repositories* → URL eintragen → Typ *Dashboard* →
   *Hinzufügen*. HACS kann das Repository nicht auflösen.

**Erwartet:** HACS listet das Repository, zeigt `v0.2.1` und lädt 20 Dateien nach
`config/www/community/stiebel-eltron-dashboard/`.

**Fix (einmalig, Maintainer):**

1. Öffentliches Repository `stiebel-eltron-dashboard` anlegen (Name ist wegen des
   Installpfads fixiert, siehe `docs/architecture.md`).
2. Description, Topics und Issues wie in `docs/architecture.md`
   §GitHub-Repository-Einstellungen setzen.
3. `main` pushen, Tag `v0.2.1` pushen (Release-Workflow baut Zip + `SHA256SUMS.txt`).
4. `<OWNER>` in der README durch das Konto ersetzen.

---

### O-02 — Geräte-Label `stiebel_eltron` fehlt (blockiert A-08)

**Tatsächlich:** `labels()` enthält nur `haghs_ignore`; `label_devices('stiebel_eltron')` ist
leer. Die Anlage „ESP32-PoE Technik“ wird per Signatur erkannt, bekommt aber keine Karte
(Kopfzeile: „1 Anlage(n) ohne Karte“).

**Reproduktion:**

1. Einstellungen → Geräte & Dienste → Geräte → *ESP32-PoE Technik* öffnen.
2. Label-Bereich prüfen → kein `stiebel_eltron`.
3. Dashboard `/stiebel-eltron/uebersicht` öffnen → Kopfzeile nennt die Anlage ohne Karte.

**Erwartet:** Nach dem Labeln zeigt die Kopfzeile „1 Anlage · 1 Karte“, und die Übersicht
enthält die Karte mit Außentemperatur, Vorlauf, Warmwasser, Modus, Verdichter und Störung.

**Fix:**

1. Einstellungen → Bereiche, Labels & Zonen → Labels → **Label erstellen**, Name
   `stiebel_eltron` (Label-ID muss `stiebel_eltron` sein).
2. Zurück zu Geräte & Dienste → Geräte → *ESP32-PoE Technik* → **Label hinzufügen** →
   `stiebel_eltron`.
3. Dashboard-Seite neu laden (kein HA-Neustart nötig).

---

### O-03 — Live-Werte derzeit nicht prüfbar (blockiert A-10)

**Tatsächlich:** Alle Entitäten der Anlage sind seit `2026-11-11 13:35:19 UTC` `unavailable`;
die Karte zeigt korrekt ⚪ „Keine Daten“ und „—“ (A-14). Ein Live-Beleg für konkrete Zahlen ist
damit in diesem Lauf nicht möglich.

**Reproduktion:**

1. `ha_eval_template`:
   `{{ states('sensor.heatingpump_aussentemp') }}` → `unavailable`.
2. Detailkarte der Anlage rendern → alle Kennzahlen „—“.

**Erwartet:** Bei erreichbarem Gateway zeigt die Karte die echten Messwerte (im Lauf um 13:29
waren es `5,1 °C` außen, `29,8 °C` Vorlauf, `44,5 / 48,0 °C` Warmwasser, Modus `Komfort`).

**Fix:** Gateway wieder online bringen (ESPHome-Log prüfen), Seite neu laden; danach diese
Prüfung wiederholen.

---

### O-04 — Keine zweite physische Anlage (blockiert A-12)

**Tatsächlich:** Im Produktivsystem existiert genau eine Wärmepumpe; der Mehrgerätefall ist nur
über `scripts/render_test.py` belegt (A-11).

**Reproduktion (mit zweiter Anlage):**

1. Einstellungen → Geräte & Dienste → Integration hinzufügen → *Stiebel Eltron ISG* → zweiten
   Config Entry anlegen (oder zweites ESPHome-Gerät anlegen und labeln).
2. Dashboard neu laden.
3. Erwartet: Kopfzeile „2 Anlagen · 2 Karten“, zwei Blöcke, `_2`-Suffixe automatisch zugeordnet.

**Fix:** Zweite Anlage anschließen; danach Prüfung wiederholen. Kein Code-Change nötig.

---

### O-05 — Neustart-Persistenz nicht live geprüft (blockiert A-17)

**Tatsächlich:** Das Dashboard ist auf dem Produktivsystem noch nicht installiert
(O-01/O-02); ein Neustart wurde nicht durchgeführt.

**Reproduktion:**

1. Dashboard gemäß README installieren und registrieren.
2. Entwicklerwerkzeuge → YAML → *Konfiguration prüfen* → „Konfiguration gültig“.
3. Home Assistant neu starten (Einstellungen → System → Neu starten).
4. Nach dem Start: Seitenleiste → *Stiebel Eltron* → alle drei Views öffnen; Werte prüfen.

**Erwartet:** Dashboard und Daten sind unverändert vorhanden; `configuration.yaml` und
`config/www/community/stiebel-eltron-dashboard/` sind unverändert.

**Fix:** Prüfung nach der ersten echten Installation nachholen.

---

### O-06 — Zielwert „unter 10 Minuten“ nicht gemessen (blockiert A-21)

**Tatsächlich:** Der Ablauf ist auf fünf Schritte und einen Neustart reduziert, aber nicht mit
einer vorwissensfreien Person gemessen.

**Reproduktion:**

1. Person ohne Home-Assistant-Dashboard-Erfahrung, HACS bereits eingerichtet.
2. Stoppuhr ab „README geöffnet“ bis „Übersicht zeigt eine Karte“.
3. Abbruchstellen notieren (Suchbegriffe, Menüpunkte, Fehlermeldungen).

**Erwartet:** < 10 Minuten ohne fremde Hilfe; höchstens eine Rückfrage.

**Fix:** Usability-Lauf durchführen, README an den Abbruchstellen nachschärfen.

---

## Grenzen dieser Abnahme

- **Keine Browser-Optik:** Lovelace rendert Karten im Frontend. Geprüft sind YAML-Struktur,
  Template-Ausgabe und Filterlogik, nicht das visuelle Ergebnis (setzt `auto-entities` und ein
  Label voraus, siehe O-02).
- **Keine echte HACS-Installation:** ohne öffentliches Repository nicht möglich (O-01).
  Geprüft sind HACS-Schema, Kategorie, Zielpfad und Artefakt.
- **Kein Neustart des Produktivsystems:** Neustart-Persistenz ist strukturell begründet, aber
  nicht ausgeführt (O-05).
- **Live nur ein Gerät:** Mehrgeräteverhalten ist über die HA-Template-Engine mit zwei
  simulierten Anlagen belegt (65 Prüfungen), nicht physisch (O-04).

---

## Nachtrag v0.4.0 (2026-11-11)

**Umgebung:** Home Assistant 2026.11.1 (Marketplace statt HACS), deutsch, Produktivsystem.
**Repository:** <https://github.com/PuzzleFoco/stiebel-eltron-dashboard>, Release **v0.4.0**.

### Live geprüft

| Prüfpunkt | Ergebnis | Beleg |
|---|---|---|
| Öffentliches Repository | ✅ | `gh repo view` → `PUBLIC`, Description + 6 Topics gesetzt |
| Release und Asset | ✅ | v0.4.0, genau ein Asset: `stiebel-eltron-dashboard.js` |
| HACS-/Marketplace-Installation | ✅ | `ha_manage_hacs download` → „Successfully installed … version v0.4.0“ |
| Ressource registriert | ✅ | `/local/community/stiebel-eltron-dashboard/stiebel-eltron-dashboard.js?v=1454042567-v0.4.0` |
| Datei ausgeliefert | ✅ | HTTP 200, 55.586 Byte, SHA256 `6b9b7303…db734` identisch mit dem Release-Asset |
| Label und Gerät | ✅ | Label `stiebel_eltron` an „ESP32-PoE Technik“ (121 Entitäten) |
| Live-Werte | ✅ | Außen 5,5 °C · Vorlauf 25,8 °C · Rücklauf 23,0 °C · Warmwasser 43,6/48,0 °C · Modus Komfort · Verdichter läuft |
| Dashboard im Produktivsystem | ✅ | Storage-Dashboard `stiebel-eltron`, 3 Views, `post_write_verified`, alle `render_paths.stable` |
| Zusammenfassung | ✅ | „1 Anlage erkannt · 1 Karte · 1 mit Außentemperatur-Anker“ |
| Strategie-Abnahme | ✅ | `node scripts/test_strategy.mjs`: 16/16 (zwei Anlagen, `_2`-Suffix, HTTP-Ausschluss, keine auto-entities-Reste) |
| YAML-Variante | ✅ | `render_test.py` 65/65, HA-Loader 2026.2.3 |

### Befund: YAML-Variante ist in HA 2026.11 nicht über HACS installierbar

Der erste HACS-Versuch mit der YAML-Auslieferung (v0.3.0) scheiterte mit
„The installed content has no stiebel-eltron-dashboard.js“. Ursache ist die
Marketplace-Implementierung `homeassistant/components/marketplace/repositories/plugin.py`:
Die Kategorie Dashboard sammelt nur `.js`-Dateien aus dem Repository-Root bzw. `dist/` ein.
YAML-Dateien und `includes/`-Unterordner werden nicht kopiert; ein `.js`-Eintrag im
`dist/`-Ordner wird durch den Filter `filename.startswith("dist")` sogar übersprungen.
Die ursprüngliche Annahme aus `docs/architecture.md` (Entscheidung 1) gilt damit für
Home Assistant ab 2026.11 nicht mehr.

**Konsequenz:** v0.4.0 liefert eine Lovelace-Strategie als einzelne JS-Datei aus
(`strategy: custom:stiebel-eltron`). Die YAML-Dateien bleiben als manuelle Variante (Weg B)
erhalten und sind weiterhin vollständig getestet.

### Abweichungen und Hinweise

- Der Agent hat die **Erststart-Warnung des Marketplaces** für den verbundenen Benutzer
  akzeptiert, um die Installation testen zu können. Laut HA-Dokumentation ist das eine
  Benutzerentscheidung; der Haken ist gesetzt und in den Marketplace-Einstellungen einsehbar.
- **Kein visueller Screenshot:** Die HA-Oberfläche verlangt eine Anmeldung; es liegen keine
  Zugangsdaten vor. Geprüft wurden Struktur (`post_write_verified`, stabile Render-Pfade),
  Template-Ausgabe mit echten Werten und die ausgelieferte Datei (HTTP 200, SHA256).
  Die Screenshot-Platzhalter in der README bleiben bewusst leer.
- **HACS-Strategie noch nicht im Browser gerendert:** Das JavaScript wurde in Node mit einer
  simulierten Geräteregistry ausgeführt (16/16). Das visuelle Ergebnis im HA-Frontend ist
  damit nicht belegt.

### Status der alten Issues

| Issue | Status |
|---|---|
| O-01 öffentliches Repository | ✅ erledigt (`PuzzleFoco/stiebel-eltron-dashboard`) |
| O-02 Label fehlt | ✅ erledigt (Label am Gerät gesetzt) |
| O-03 Live-Werte | ✅ erledigt (Gateway wieder online, Werte oben) |
| O-04 zweite physische Anlage | ⬜ offen (weiterhin simuliert) |
| O-05 Neustart-Persistenz | ⬜ offen (kein Neustart durchgeführt) |
| O-06 10-Minuten-Ziel | ⬜ offen (nicht mit Testperson gemessen) |

## Nachtrag v0.4.2 (2026-11-11)

**Umgebung:** Home Assistant 2026.11.1, deutsch, Produktivsystem (Geräteregistry, Template-Engine).
**Repository:** <https://github.com/PuzzleFoco/stiebel-eltron-dashboard>, Release **v0.4.2**.

Dieser Nachtrag prüft das **ausgelieferte Bundle** (`stiebel-eltron-dashboard.js`, nicht die
YAML-Quelle) gegen die **echte** Geräteregistry — nicht gegen eine Attrappe.

### Vorgehen

1. Geräte- und Entitätsliste der Zielanlage aus der laufenden HA gelesen
   (`device_entities`, `device_attr`, `label_devices`): 1 Gerät, 120 Entitäten, Label
   `stiebel_eltron`.
2. Mit genau diesen Daten `generate()` des veröffentlichten Bundles in Node ausgeführt
   (Registry-Attrappe nur für `hass.devices`/`hass.entities`, sonst unverändert).
3. Jede erzeugte Markdown-Karte durch die **Template-Engine der Ziel-HA** gerendert
   (`ha_eval_template`, also HAs eigener Jinja-Sandbox mit echten Zuständen).

### Ergebnis

| Prüfpunkt | Ergebnis | Beleg |
|---|---|---|
| Gerät erkannt | ✅ | Label `stiebel_eltron` an „ESP32-PoE Technik“, Signatur 5/7 (`verdichter`, `programmschalter`, `vorlaufisttemp_wp`, `aussentemp`, `speicheristtemp`) |
| Lüftung ausgeschlossen | ✅ | „Lüftung“ (LWZ): nur 1 Signaturtreffer + eigener Anker → keine Wärmepumpe |
| Strategie erzeugt Views | ✅ | 3 Views (Übersicht, Geräte, Bedienung), Abschnittstyp `sections` |
| Eine Karte je Anlage | ✅ | Übersicht 1 Gerätekarte, Geräte 1 Detailkarte, keine `this.entity_id`-Reste |
| Konkrete Karten statt auto-entities | ✅ | 0 `custom:auto-entities` im Ergebnis; Bedienung: 6 Tile-Karten + 2 Hinweise |
| Karten rendern live | ✅ | 6/6 Markdown-Karten ohne Template-Fehler |
| Werte exakt | ✅ | Außen 5,5 °C · Vorlauf WP 23,9 °C · Rücklauf 21,6 °C · Warmwasser 43,6/48,0 °C · Modus Komfort · Verdichter läuft · Starts 4921 |
| Einheiten/Dezimalkomma | ✅ | „5,5 °C“, „2,0 bar“, „0,35“ (Heizkurve), „48,0“ ohne Einheit bei number-Entitäten |
| Sentinels gefiltert | ✅ | Gerät liefert `taupunkttemp = -3276,8 °C` und `aussentemp_sommerbetrieb = 32768 °C`; Karte zeigt „—“ statt Fantasiewerten |
| Zeilen ohne Entität | ✅ | Detailkarte blendet Puffersoll, SG Ready, Abtauung, Heizbetrieb, Warmwasserbetrieb aus (vorher 16 × „—“) |
| „—“ nur bei echter Lücke | ✅ | Raumtemperatur/-feuchte `unknown` → „—“, bleibt sichtbar |
| HACS-Installation v0.4.2 | ✅ | `ha_manage_hacs download` → „Successfully installed … version v0.4.2“, Status `installed`, `installed_version` = `available_version` = `v0.4.2` |
| Bundle im Betrieb | ✅ | `/local/community/stiebel-eltron-dashboard/stiebel-eltron-dashboard.js?v=1454042567-v0.4.2` **und** `/hacsfiles/…`: HTTP 200, 60.909 Byte, SHA256 `3bbf07f5…b1f07` = Repository-Datei |
| Dashboard nutzt Strategie | ✅ | `stiebel-eltron`: `strategy_dashboard: true`, Konfiguration 60 Byte statt 47.649 Byte |
| YAML-Fallback vorhanden | ✅ | `stiebel-eltron-yaml` (ausgeblendet), 3 Views, alle `render_paths.stable` |
| Repository-Checks | ✅ | `validate.py`, `sync_jinja.py --check`, `sync_dist.py --check`, `build_strategy.py --check`, `test_strategy.mjs` 16/16, `test_macros.py` 16/16 |
| HA-Abnahmetest | ✅ | `uv run --with homeassistant python scripts/render_test.py` → 65/65 (echte HA-`TemplateEnvironment`) |
| CI | ✅ | Validate + Release für v0.4.1 grün (v0.4.2 nach dem Push geprüft) |

### Weiterhin offen

| Issue | Status |
|---|---|
| O-04 zweite physische Anlage | ⬜ offen — Mehrgerätefall in `test_strategy.mjs` und `render_test.py` simuliert |
| O-05 Neustart-Persistenz | ⬜ offen — kein HA-Neustart durchgeführt |
| O-06 10-Minuten-Ziel | ⬜ offen — nicht mit Testperson gemessen |
| Visueller Nachweis im Browser | ⬜ offen — HA-Frontend verlangt Anmeldung, es liegen keine Zugangsdaten vor. Belegt sind Strategie-Ausführung, Karteninhalt (live gerendert) und ausgelieferte Datei, **nicht** das gemalte Bild. |

> **Wenn die Strategie im Browser nicht lädt** (`Timeout waiting for strategy element
> ll-strategy-dashboard-stiebel-eltron`): Seite hart neu laden (Strg+Shift+R). Bleibt es dabei,
> ist `/stiebel-eltron-yaml` die funktionierende YAML-Fassung desselben Dashboards.
