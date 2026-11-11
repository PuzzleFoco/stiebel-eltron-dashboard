# Stiebel Eltron Dashboard

![Stiebel Eltron Dashboard](docs/images/banner.svg)

Ein Lovelace-Dashboard für Stiebel-Eltron-Wärmepumpen – für **eine oder mehrere Anlagen** im
selben Home Assistant. Installation über HACS, danach ohne YAML-Arbeit: ein zweites Gerät
erscheint automatisch als zweiter Block.

> **Status: v0.2.1** · Drei Views (Übersicht, Geräte, Bedienung) · Geräteerkennung über
> Label, Integration oder Signatur · fehlende Werte werden sichtbar zu „—“ statt zu 0.
>
> **Pflicht-Baustein:** die HACS-Karte **`auto-entities`** (`custom:auto-entities`).
> Ohne sie bleiben Geräte- und Bedienkarten leer – die Zusammenfassung nennt die Ursache.

## Was du bekommst

| View | Inhalt | Adresse |
|---|---|---|
| **Übersicht** | Kopfzeile mit Anzahl erkannter Anlagen, eine Karte je Anlage mit den Kernwerten (Außen, Vorlauf, Warmwasser, Modus, Verdichter, Störung) | `/stiebel-eltron/uebersicht` |
| **Geräte** | je Anlage eine vollständige Detailkarte: Temperaturen, Warmwasser, Betrieb, Energie, Störungen, optionale Diagnosewerte | `/stiebel-eltron/geraete` |
| **Bedienung** | schaltbare Betriebsart, Warmwasser- und Heizungs-Sollwerte, Heizkreis, SG Ready – nur bei schreibfähiger Anbindung | `/stiebel-eltron/bedienung` |

Status-Ampel in jeder Karte:
🟢 Bereit · 🔵 Verdichter läuft · 🟡 EVU-Sperre · 🔴 Störung · ⚪ Keine Daten

> 📷 **Screenshot-Platzhalter** – `docs/images/screenshot-uebersicht.png`
> Aufnahme der Übersicht mit zwei Anlagen. Wird nach dem ersten Live-Betrieb ergänzt;
> bewusst **kein gestelltes Bild**. Siehe [Screenshots und GIFs](#screenshots-und-gifs).

## In 10 Minuten startklar

Voraussetzung: Home Assistant läuft und HACS ist bereits eingerichtet. Dann sind es fünf Schritte:

| # | Schritt | Dauer |
|---|---|---|
| 1 | [Auto Entities installieren](#1-auto-entities-installieren-pflicht) | 1–2 Min. |
| 2 | [Dashboard-Repository in HACS hinzufügen](#2-dashboard-repository-in-hacs-hinzufügen) | 2 Min. |
| 3 | [Dashboard in `configuration.yaml` registrieren](#3-dashboard-in-configurationyaml-registrieren) und Home Assistant neu starten | 3–5 Min. |
| 4 | [Gerät sichtbar machen](#4-gerät-sichtbar-machen) (nur bei ESPHome/MQTT/Modbus nötig) | 1 Min. |
| 5 | [Dashboard öffnen](#5-dashboard-öffnen) | – |

Ohne HACS: einmalig [HACS installieren](https://hacs.xyz/docs/setup/download/) (ca. 10 Minuten,
GitHub-Konto nötig). Das ist eine Voraussetzung dieses Dashboards, keine Alternative dazu.

## Voraussetzungen

- **Home Assistant ≥ 2024.10** – ältere Versionen kennen die `heading`-Karte nicht.
- **HACS 2.x** mit verbundenem GitHub-Konto.
- **Auto Entities** (`thomasloven/lovelace-auto-entities`) – die einzige Pflicht-Abhängigkeit.
- **Eine eingebundene Wärmepumpe**, eine der drei Varianten:

| Anbindung | Integration | Label nötig? |
|---|---|---|
| Stiebel Eltron ISG über Modbus | `stiebel_eltron_isg` (HACS) | nein |
| ISG über HTTP (nur lesend) | `stiebel_eltron_http` (HACS) | nein |
| ESPHome-/MQTT-/Modbus-Gateway mit eigener YAML | z. B. `esphome` | **ja**, `stiebel_eltron` am Gerät |

Alles läuft lokal. Das Dashboard fragt keine Cloud ab und sendet keine Daten nach außen.

## 1. Auto Entities installieren (Pflicht)

1. **HACS** öffnen → **Dashboard** (in HACS 1.x: *Frontend*, davor *Plugin*).
2. In der Suche **`auto-entities`** eingeben – **mit Bindestrich**, sonst findet HACS nichts.
3. Den Treffer **auto-entities** von *thomasloven* öffnen → **Herunterladen**.
4. Fertig. HACS trägt die Ressource automatisch ein (Lovelace-Ressourcenmodus *storage*).

Prüfen: **Einstellungen → Dashboards → ⋮ → Ressourcen**. Dort steht
`/hacsfiles/lovelace-auto-entities/auto-entities.js?hacstag=…`.

> **Sonderfall:** Wer seine Lovelace-Ressourcen im YAML-Modus pflegt, muss die Datei selbst
> eintragen (`/hacsfiles/lovelace-auto-entities/auto-entities.js`, Typ `module`) – HACS kann
> dann keine Ressourcen anlegen.

## 2. Dashboard-Repository in HACS hinzufügen

Das Dashboard selbst ist **kein** HACS-Standard-Repository, sondern wird als benutzerdefiniertes
Repository eingetragen:

1. **HACS** öffnen.
2. Oben rechts auf die **drei Punkte (⋮)** → **Benutzerdefinierte Repositories**.
3. Repository-URL eintragen: `https://github.com/<OWNER>/stiebel-eltron-dashboard`
   (`<OWNER>` = GitHub-Konto, unter dem das Repository liegt; die vollständige URL steht in der
   Bezugsquelle).
4. Als Typ **Dashboard** wählen – **nicht** *Integration*.
5. **Hinzufügen**, das neue Repository öffnen und **Herunterladen**.

HACS legt die Dateien unter `config/www/community/stiebel-eltron-dashboard/` ab:

```
config/www/community/stiebel-eltron-dashboard/
├── stiebel_eltron.yaml          ← Einstiegspunkt (wird gleich registriert)
├── includes/views/*.yaml
├── includes/cards/*.yaml
└── stiebel-eltron-dashboard.js  ← HACS-Einstiegspunkt, wird von HA nicht geladen
```

> **Ein Neustart genügt.** HACS kopiert die Dateien sofort. Der Neustart nach Schritt 3 lädt
> sowohl die neue Datei als auch den Dashboard-Eintrag – du musst nicht zweimal neu starten.

**Falscher Typ gewählt?** Dann meldet HACS `Repository structure … is not compliant` oder bietet
gar keinen Download an. Repository in HACS entfernen (⋮ → *Entfernen*) und mit Typ **Dashboard**
neu hinzufügen. Details: [Troubleshooting](#troubleshooting).

## 3. Dashboard in `configuration.yaml` registrieren

Das Dashboard läuft im YAML-Modus. Eintrag in `configuration.yaml` (Pfad relativ zum
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

Danach **Entwicklerwerkzeuge → YAML → Konfiguration prüfen** und Home Assistant **neu starten**.
Das Dashboard erscheint in der Seitenleiste.

Drei Regeln, an denen es sonst klemmt:

- **Der Schlüssel muss `stiebel-eltron` heißen.** Er ist der URL-Pfad; die Karten verlinken
  fest auf `/stiebel-eltron/geraete` und `/stiebel-eltron/bedienung`. Ein anderer Name ist
  erlaubt, macht aber alle Links im Dashboard zu 404ern. Ein Bindestrich ist bei Home Assistant
  Pflicht.
- **Nicht doppelt anlegen.** Gibt es in `configuration.yaml` bereits einen `lovelace:`-Block,
  den `stiebel-eltron:`-Eintrag dort unter `dashboards:` ergänzen – kein zweiter `lovelace:`-Schlüssel.
- **`filename` ohne führenden Schrägstrich** und exakt wie oben – der Pfad enthält den
  Repository-Namen, den HACS beim Herunterladen angelegt hat.

## 4. Gerät sichtbar machen

| Deine Anbindung | Was zu tun ist |
|---|---|
| **ISG (Modbus)** oder **ISG-HTTP** | nichts. Das Gerät der Integration wird automatisch erkannt. |
| **ESPHome, MQTT oder Modbus mit eigener YAML** | Gerät mit dem Label **`stiebel_eltron`** versehen (siehe unten). |

Label setzen:

1. **Einstellungen → Bereiche, Labels & Zonen → Labels → Label erstellen**,
   Name `stiebel_eltron`. (Die **Label-ID** ist entscheidend, nicht die Anzeige – HA bildet sie
   aus dem Namen.)
2. **Einstellungen → Geräte & Dienste → Geräte** → deine Wärmepumpe öffnen.
3. Beim Gerät **Label hinzufügen** (bzw. *Bearbeiten* → Label) → `stiebel_eltron` auswählen.
   Das Label muss am **Gerät** hängen, nicht an einzelnen Entitäten.
4. Dashboard-Seite neu laden.

**Warum das Label?** Bei ESPHome-Geräten kann das Dashboard die Zugehörigkeit nicht über eine
Integration ableiten. Es erkennt die Anlage zwar an ihrer Signatur (siehe unten), zeigt sie aber
erst als Karte, wenn sie gelabelt ist – sonst steht in der Zusammenfassung
„*1 Anlage(n) ohne Karte*“. Genau dieser Hinweis ist kein Fehler, sondern die Einbauanleitung.

**Anker-Entität:** Jede Karte hängt an der Außentemperatur des Geräts
(`*_aussentemp`, `*_aussentemperatur`, `*_outside_temperature`). Ein Gerät ohne solche Entität
bekommt keine Karte; die Zusammenfassung nennt es unter „Ohne Anker“.

Die automatische Erkennung ohne Label greift, wenn ein Gerät **mindestens drei** dieser
Merkmale als Entitäten hat: `*_aussentemp`, `*_aussentemperatur`, `*_outside_temperature`,
`*_vorlaufisttemp_wp`, `*_speicheristtemp`, `*_programmschalter`, `*_verdichter`.
Lüftungsgeräte (z. B. eine LWZ) erfüllen das typischerweise nicht und tauchen bewusst nicht auf.

## 5. Dashboard öffnen

Seitenleiste → **Stiebel Eltron**, oder direkt `/stiebel-eltron/uebersicht`.

Beim ersten Öffnen entscheidet die Kopfzeile, ob alles passt:

| Anzeige | Bedeutung |
|---|---|
| „**1 Anlage** erkannt · 1 Karte“ | fertig. |
| „**1 Anlage** erkannt · 0 Karten“ + ⚠️-Hinweis | Gerät gefunden, aber nicht gelabelt → Schritt 4. |
| „*Noch keine Wärmepumpe erkannt*“ | keine Anlage gefunden → [Troubleshooting](#troubleshooting). |
| „Custom element doesn't exist: auto-entities“ | auto-entities fehlt → Schritt 1. |

## Die Entity-Präfix-Konvention

**Kurzfassung: Das Präfix ist egal, der Suffix entscheidet.**

Home Assistant bildet Entity-IDs aus Gerätename, Bereich und lokalisiertem Entitätsnamen. Sie
ändern sich mit der Sprache, beim Umbenennen, beim Verschieben in einen Bereich – und beim
zweiten gleichen Gerät (`_2`). Ein Dashboard, das `sensor.stiebel_eltron_wpmsystem_*` hartcodiert,
bricht bei der ersten Umbenennung. Dieses Dashboard identifiziert die Anlage deshalb über die
**Device-ID** und sucht die Werte über ihre **Funktion** (den Suffix).

So sieht das im echten Betrieb aus – ein Gerät, zwei Präfixe:

| Entity-ID | Präfix | Suffix (entscheidend) |
|---|---|---|
| `sensor.heatingpump_aussentemp` | `heatingpump` | `aussentemp` |
| `sensor.esp32_poe_technik_vorlaufisttemp_wp` | `esp32_poe_technik` | `vorlaufisttemp_wp` |
| `sensor.heatingpump_speicheristtemp` | `heatingpump` | `speicheristtemp` |
| `select.esp32_poe_technik_programmschalter` | `esp32_poe_technik` | `programmschalter` |

Beide Präfixe gehören zum selben Gerät und erscheinen in derselben Karte. Eine Namenskonvention
wie `stiebel_<raum>_<funktion>` ist eine **Empfehlung für Menschen**, keine Voraussetzung.

### Welche Suffixe werden gelesen?

| Zweck | Suffixe (erste Übereinstimmung gewinnt) |
|---|---|
| **Anker** (Pflicht für eine Karte) | `aussentemp`, `aussentemperatur`, `outside_temperature` |
| Vorlauf Wärmepumpe | `vorlaufisttemp_wp`, `vorlauftemperatur_wp`, `flow_temperature_wp` |
| Rücklauf | `ruecklaufisttemp_wp`, `rucklauftemperatur`, `return_temperature` |
| Warmwasser | `speicheristtemp`, `speichersolltemp`, `ist_temperatur_warmwasser`, `soll_temperatur_warmwasser` |
| Betriebsart | `programmschalter`, `betriebsart`, `operation_mode` |
| Verdichter / Störung | `verdichter`, `compressor_on` / `fehlerstatus`, `stoerung`, `error_status` |
| Heizkreis-Sollwerte | `komforttemperatur`, `ecotemperatur`, `steigung_heizkurve`, `…_temperatursoll_hk_1` |
| Warmwasser-Sollwerte | `einstell_speichersolltemp`, `ww_eco_temp`, `…_temperatursoll` |
| SG Ready | `sg_ready_aktiv`, `sg_ready_active` |

Der vollständige Katalog (über 50 Funktionen, DE/EN/lokale Varianten) steht in
[`docs/design.md` §4.2](docs/design.md) und in `dashboards/templates/jinja/functions.j2`.

**Duplikate:** Ein zweites Gerät mit gleichen Entitätsnamen bekommt von Home Assistant `_2`
(oder `_3`) am Ende – `sensor.stiebel_eltron_wpmsystem_programmschalter_2`. Der Resolver
akzeptiert diesen Suffix; du musst nichts anpassen.

**Wenn dein Suffix nicht dabei ist:** Entity-ID umbenennen, nicht das Dashboard.
Einstellungen → Geräte & Dienste → Entitäten → Entität öffnen → Zahnrad → **Entity-ID**, z. B.
`sensor.wp_aussen_temperatur` → `sensor.wp_aussentemperatur`. Danach Seite neu laden. Der Wert
erscheint sofort; alle Automatisierungen, die die alte ID nutzen, müssen mitgezogen werden.

## Zweite Anlage hinzufügen

**Es ist keine YAML-Änderung nötig.** Das Dashboard erzeugt für jedes erkannte Gerät eine eigene
Karte und zählt in der Kopfzeile hoch.

| Anbindung der zweiten Anlage | Vorgehen |
|---|---|
| **ISG (Modbus/HTTP)** | Einstellungen → Geräte & Dienste → **Integration hinzufügen** → *Stiebel Eltron ISG* → zweiten Config Entry anlegen. |
| **ESPHome/MQTT/Modbus** | Zweites Gerät in Home Assistant anlegen (ESPHome-Add-on bzw. YAML) und mit `stiebel_eltron` labeln. |
| **Gemischt** | Beides kombinieren – die Erkennung ist unabhängig voneinander. |

Danach die Dashboard-Seite neu laden. Erwartet:

- Kopfzeile: „**2 Anlagen** erkannt · 2 Karten“,
- pro Anlage ein eigener Block, sortiert nach Gerätenamen,
- gleiche Entitätsnamen des zweiten Geräts bekommen `_2` – wird automatisch zugeordnet,
- jede Anlage braucht ihre **eigene Außentemperatur** als Anker; fehlt sie, nennt die
  Zusammenfassung das Gerät unter „Ohne Anker“.

Grenzen: Ein Gerät, das nur über die Signatur erkannt (aber nicht gelabelt) ist, zählt in der
Kopfzeile mit, bekommt aber keine Karte. Die Bedienung erscheint nur für gelabelte Geräte und
für ISG-Anlagen, nie für reine HTTP-Anbindungen.

## Screenshots und GIFs

Die folgenden Medien sind vorgesehen und noch nicht aufgenommen. Bis dahin stehen hier
Platzhalter – keine erfundenen Bilder:

| Datei | Inhalt | Status |
|---|---|---|
| `docs/images/screenshot-uebersicht.png` | Übersicht mit zwei Anlagen, Status-Ampel, Kopfzeile | ⬜ offen |
| `docs/images/screenshot-geraete.png` | Detailkarte einer Anlage mit Energie- und Störungswerten | ⬜ offen |
| `docs/images/screenshot-bedienung.png` | Bedien-View mit Betriebsart und Sollwerten | ⬜ offen |
| `docs/images/demo-zweite-anlage.gif` | Zweite Anlage hinzufügen → zweiter Block erscheint ohne YAML-Änderung | ⬜ offen |
| `docs/images/demo-label.gif` | Label am Gerät setzen → Karte erscheint nach Reload | ⬜ offen |

Aufnahme-Regeln: echte Anlage, echte Werte, keine nachträglich bearbeiteten Zahlen; GIFs ≤ 5 MB,
PNG ≤ 1600 px Breite. Sobald ein Bild vorliegt, hier und in `hacs.json`/README ersetzen.

## Troubleshooting

| Symptom | Ursache | Lösung |
|---|---|---|
| `Custom element doesn't exist: auto-entities` | Pflicht-Karte fehlt oder Ressource nicht geladen | Schritt 1; danach Browser-Seite **hart** neu laden (Strg/Cmd+Shift+R) |
| Dashboard fehlt in der Seitenleiste | `lovelace:`-Eintrag fehlt, YAML-Fehler oder nicht neu gestartet | `configuration.yaml` prüfen, **Konfiguration prüfen**, neu starten; `show_in_sidebar: true` |
| „Error loading dashboard“ | YAML nicht ladbar (Tippfehler, falscher Pfad, Dateien fehlen) | Pfad `www/community/stiebel-eltron-dashboard/stiebel_eltron.yaml` prüfen; HACS-Download wiederholen |
| Links führen auf 404 | Dashboard-Schlüssel heißt nicht `stiebel-eltron` | Schlüssel umbenennen (Schritt 3) |
| „Noch keine Wärmepumpe erkannt“ | keine Anlage erkannt: Label fehlt, Integration nicht geladen oder kein Anker | Label setzen, Config Entry prüfen, Außentemperatur-Entität prüfen |
| „1 Anlage(n) ohne Karte“ | Gerät erkannt, aber nicht gelabelt (ESPHome/MQTT/Modbus) | Label `stiebel_eltron` am **Gerät** setzen |
| Karte fehlt, Gerät wird unter „Ohne Anker“ genannt | keine `*_aussentemp`/`*_aussentemperatur`/`*_outside_temperature` | Entität umbenennen (Suffix) oder Anbindung prüfen |
| Werte zeigen „—“ | Entität `unavailable`/`unknown` oder Suffix passt nicht | Entität in *Entwicklerwerkzeuge → Zustände* prüfen; Suffix ggf. umbenennen |
| Werte einer Anlage fehlen komplett | falsches Präfix angenommen? | Präfix ist egal – Suffix muss passen (siehe oben) |
| Bedienung ist leer | reine HTTP-Anbindung (nur lesend) oder Gerät nicht gelabelt | bei HTTP beabsichtigt; sonst Label setzen |
| HACS meldet `Repository structure … is not compliant` | falscher Repository-Typ (meist *Integration*) | Repository entfernen, mit Typ **Dashboard** neu hinzufügen |
| HACS findet das Repository nicht | Tippfehler in der URL, Repository privat oder noch nicht veröffentlicht | URL prüfen; HACS braucht ein **öffentliches** Repository |
| HACS zeigt keine Version / kein Update | kein Release-Tag im Repository | Release veröffentlichen (`vX.Y.Z`) |
| Nach einem Update fehlen Werte | neue Entitätsnamen oder Gerät umbenannt | Changelog lesen, Suffix prüfen, Seite neu laden |
| Zweite Anlage fehlt | zweiter Config Entry fehlt oder Gerät ohne Label/Anker | Schritt „Zweite Anlage“; Zusammenfassung nennt den Grund |

<details>
<summary><strong>Diagnose in fünf Minuten</strong></summary>

1. **Ist die Datei da?** Datei-Editor/SSH: `ls config/www/community/stiebel-eltron-dashboard/`
   – erwartet: `stiebel_eltron.yaml` **und** `includes/`.
2. **Ist das Dashboard registriert?** `configuration.yaml` → `lovelace.dashboards.stiebel-eltron`
   mit `mode: yaml` und korrektem `filename`.
3. **Kennt HA das Gerät?** Einstellungen → Geräte & Dienste → Geräte → Wärmepumpe öffnen:
   Hat es das Label `stiebel_eltron`? Haben die Entitäten die erwarteten Suffixe?
4. **Ist auto-entities geladen?** Einstellungen → Dashboards → Ressourcen → Eintrag
   `auto-entities.js` vorhanden und **aktiv**?
5. **Browser-Cache?** Hart neu laden; danach Home Assistant neu starten.

</details>

## Updates und Deinstallation

**Update:** HACS zeigt neue Releases unter *Aktualisierungen* an. Herunterladen, Seite neu laden –
die Dashboard-YAML wird bei jeder Anfrage neu gelesen, ein Neustart ist dafür nicht nötig.
Eigene Anpassungen gehören **nicht** in `config/www/community/…`: HACS überschreibt sie beim
nächsten Update.

**Deinstallieren:** Dashboard-Eintrag aus `configuration.yaml` entfernen, Home Assistant neu
starten, danach das Repository in HACS entfernen. Der Ordner
`config/www/community/stiebel-eltron-dashboard/` wird von HACS mitgelöscht; Reste manuell
entfernen. `auto-entities` kann bleiben, wenn es anderswo genutzt wird.

## Entwicklung

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt

python scripts/sync_jinja.py      # Makros aus templates/jinja/ in die Karten
python scripts/sync_dist.py       # dashboards/ -> dist/
python scripts/validate.py        # hacs.json, Includes, Kartenstruktur, README-Pfade, dist-Sync
python scripts/build_release.py --version 0.2.0

# Mit echtem Home-Assistant-Loader und Abnahmetest (zwei simulierte Anlagen)
uv run --with homeassistant python scripts/check_ha_parse.py
uv run --with homeassistant python scripts/render_test.py
```

`scripts/render_test.py` rendert die Karten mit Home Assistants eigener Template-Umgebung gegen
eine simulierte Geräteregistry (zwei Anlagen mit unterschiedlichen Präfixen, eine
`unavailable`-Anlage, eine rein lesende HTTP-Anlage) und prüft die Abnahmekriterien. Die
durchgeführte Abnahme steht in [`docs/acceptance.md`](docs/acceptance.md).

Release: Tag `vX.Y.Z` pushen – der Workflow baut das Archiv und veröffentlicht es mit Prüfsumme.

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
| `docs/acceptance.md` | Abnahmeprotokoll mit offenen Punkten und Reproduktionsschritten |
| `.github/workflows/` | Validierung (push/PR) und Release (Tag `vX.Y.Z`) |

## Lizenz

MIT – siehe [LICENSE](LICENSE).
