# Stiebel Eltron / Tecalor an Home Assistant — Anbindungswege, Entitäten, Grenzen

**Stand:** 11.11.2026 · **Getestete HA-Version:** 2026.11.1 · **Integrationen:** HACS `stiebel_eltron_isg` 2026.11, HACS `stiebel_eltron_http` 0.1.0, HA-Core `stiebel_eltron` (dev), HA-Core `modbus`
**Zweck:** Belastbare Grundlage für das Dashboard-Projekt (Kanban t_04e2d7f6 → t_aa58d507/t_093e7b2e). Alle Aussagen sind auf Quellen unten zurückführbar; wo etwas nicht belegt ist, steht es ausdrücklich als offener Punkt.

---

## 0. Kurzfassung

Es gibt **drei ernstzunehmende Wege**, an eine Stiebel-Eltron-/Tecalor-Wärmepumpe in Home Assistant zu kommen:

1. **ISG (web/plus/Connect) + Modbus TCP** — der einzige vom Hersteller dokumentierte Weg. In HA entweder über die HACS-Integration `stiebel_eltron_isg` (reichhaltig, lesend **und** schreibend, ~30 s Polling) oder über die HA-Core-`modbus`-Integration mit handgepflegter Registerliste (maximale Kontrolle, viel Handarbeit).
2. **ISG + HTTP-Scraping der Servicewelt** — HACS `stiebel_eltron_http`: ohne Modbus-Firmware, **nur lesend**, 17 Sensoren + 6 Binärsensoren, 60 s. Bricht bei Servicewelt-Layoutänderungen.
3. **CAN-Bus direkt (ESPHome)** — kein ISG, keine Herstellerfreigabe, dafür ~90–3800 Signale und Latenz im Sekundenbereich. In diesem Haushalt bereits produktiv; generisch über `bullitt186/ha-stiebel-control`.

**Empfehlung:** Für ein allgemein verteilbares HACS-Dashboard **Variante A (`stiebel_eltron_isg`)** als Primärziel, weil nur sie einen breiten, schreibbaren und stabil dokumentierten Entitätssatz liefert. Für **diesen** Haushalt ist der einfachste Weg trotzdem **Variante E**, weil das CAN-Gateway schon läuft und ein ISG ~500–800 € kosten würde, ohne einen einzigen zusätzlichen Messwert zu liefern. Das Dashboard muss deshalb **beide Präfixwelten** bedienen können (siehe § 9.1).

---

## 1. Ausgangslage

### 1.1 Generisch

Stiebel Eltron und Tecalor sind dieselben Geräte unter zwei Marken (z. B. Tecalor THM eco = Stiebel Eltron HM(S) Trend, Tecalor TTL ACS = Stiebel WPL-A …). Der Wärmepumpenregler (WPM) ist die Datenquelle; nach außen gibt es genau zwei Hersteller-Schnittstellen:

- **Servicewelt** (lokale Webseite des ISG, HTML) — Anzeige/Bedienung, keine dokumentierte API.
- **Modbus TCP** (ISG als Slave, Port 502, Slave-ID 1) — dokumentiert in der „Software-Dokumentation Modbus TCP/IP“ (321798-44755-9770).

Ohne ISG gibt es **keine** Herstellerschnittstelle. Die CAN-Bus-Protokolle (Elster/„CAN B“) sind nicht veröffentlicht; alles, was dort funktioniert, ist Community-Reverse-Engineering.

### 1.2 Dieser Haushalt (Ist-Zustand, verifiziert)

| Punkt | Wert |
|---|---|
| Anlage | Tecalor **TTL 7,6 ACS** (= Stiebel WPL-A 07) + **THM eco**, Regler **WPM4** |
| ISG | **nicht vorhanden** |
| Gateway | ESP32-PoE (`<gateway-ip>`), ESPHome `kr0ner/OneESP32ToRuleThemAll`, Paket `wpl_a07.yaml` |
| HA | 2026.11.1, Sprache **de**, Host `<ha-host-ip>` |
| Entitäten | ~90 Sensoren/Binärsensoren/Numbers/Selects unter `sensor.esp32_poe_technik_*`, `sensor.heatingpump_*`, `binary_sensor.esp32_poe_technik_*` |
| Lüftung | **eigener Bus** (LWZ 180/280, ESP32 `<vent-ip>`), nicht Teil des WPM-CAN |
| Bekannte Einschränkung | Wärmemengenzähler liefern unplausible Werte (COP ≈ 39 rechnerisch) — für COP-Karten **nicht** ungeprüft verwenden |

Der WPM4 dokumentiert das ISG ausdrücklich: „Schließen Sie das Internet Service Gateway an eine der Klemmen **CAN B** (ohne „+“) an“ (Tecalor WPM 4, Inbetriebnahme, Kap. 4.4). Ein ISG wäre also technisch nachrüstbar — auch **parallel** zum vorhandenen ESP32, weil beide an CAN B als weitere Busteilnehmer hängen. Buslast und Adressvergabe sind damit aber nicht erprobt (offener Punkt, § 11).

### 1.3 Konsequenz für die Empfehlung

Ein Dashboard, das nur für diesen Haushalt gedacht wäre, müsste gar keine Integration voraussetzen — die Entitäten sind da. Ein **HACS-verteilbares** Dashboard muss dagegen mit dem rechnen, was fremde Anlagen typischerweise haben: ISG + `stiebel_eltron_isg`. Deshalb: **Dashboard generisch auf Variante A auslegen, Variante E als gleichwertige zweite Quelle mitdenken** (Mapping-Schicht, siehe § 9.1).

---

## 2. Varianten im Vergleich

| # | Variante | Hardware / Zugang | Auth | Entitäten | Schreiben | Polling | Mehrere Geräte | Aufwand / Kosten | Urteil |
|---|---|---|---|---|---|---|---|---|---|
| **A** | **ISG + HACS `stiebel_eltron_isg`** (Modbus TCP) | ISG web/plus/Connect am CAN B; LAN; Modbus ab Werk installiert | keine (Modbus ohne Auth) | bis ~150 Sensoren, 57 Binärsensoren, 49 Numbers, 5 Climate, 2 Selects, 3 Switches, 1 Button — **modellabhängig** | **ja** (Holding-Register, mit Bereichsprüfung + Schreibbestätigung) | 30 s, **nicht konfigurierbar** | ja, ein Entry pro ISG | ISG 490–870 € + HACS-Klick | **Referenzweg**, reichhaltigster Entitätssatz |
| **B** | **ISG + HACS `stiebel_eltron_http`** (HTML-Scraping) | ISG web/plus/Connect; LAN; **kein** Modbus nötig | keine; Servicewelt-Login muss aus sein | 17 Sensoren + 6 Binärsensoren | **nein** (read-only) | 60 s | ja, ein Entry pro ISG | ISG + HACS-Klick | Notlösung ohne Modbus-Firmware |
| **C** | **HA-Core `stiebel_eltron`** | ISG web + Modbus | keine | **1 Climate-Entität**, HK1 | ja (Betriebsart/Sollwert) | 30 s | ja | ISG + Core | Nur LWZ; für WPM **nicht** geeignet |
| **D** | **HA-Core `modbus` + Registerliste** | ISG web + Modbus | keine | frei definierbar (YAML) | ja (`modbus.write_register`) | 30 s default, frei | ja, ein Hub pro ISG | ISG + YAML-Pflege | Maximale Kontrolle, hoher Pflegeaufwand |
| **E** | **ESPHome / CAN-Gateway** | ESP32 + CAN-Transceiver am „CAN B“; kein ISG | keine | lokal ~90; `bullitt186` bis 3800+ | ja (YAML-Writes, ungeprüft/optimistisch) | Sekunden | ja, pro Gerät ein Node | 15–40 € + Löten/Flash | Einziger Weg **ohne** ISG; DIY-Risiko |
| **F** | **MyStiebel-Cloud** (`sanderkwantes/mystiebel`) | Internet + Herstellerkonto | OAuth/Cloud | cloudabhängig | teils | cloudabhängig | ja | 0 € Hardware | **verworfen**: Cloud, LAN-only-Prämisse verletzt |

Preisspannen sind Straßenpreise deutscher Händler (11/2026), keine UVP: ISG web 229336 ≈ 490–630 €, ISG plus 233493 ≈ 700–870 €, ISG Connect 206780 ≈ 530–820 €.

---

## 3. Variante A — ISG + HACS `stiebel_eltron_isg` (Modbus TCP)

### 3.1 Hardware und Zugang

- **ISG web (229336)** genügt für Modbus. Bei aktuellen Geräten ist die Modbus-TCP/IP-Software laut ISG-Installationsanleitung **ab Werk installiert**; ältere Geräte brauchen ein Firmware-Update (kostenlos über den Kundendienst) — in älteren Dokumenten ist noch die kostenpflichtige Softwareerweiterung **316303** genannt. Vor dem Kauf den Softwarestand des konkreten Geräts prüfen.
- **ISG plus (233493)** = ISG web + Smart Energy Extension (SG-Ready-Kontakt / PV-Eigenverbrauch) — für ein Dashboard **nicht nötig**.
- **ISG Connect (206780)** = neuere Generation mit Modbus **und** §14a-Leistungsbegrenzung; EEBus wird im Datenblatt/Handel genannt, die Anleitung (04/2025) beschreibt für §14a jedoch Relais/KNX/Modbus — vor einer §14a-/EEBus-Planung schriftlich beim Hersteller bestätigen lassen. Für ein reines Dashboard **nicht nötig**.
- **Version:** Release 2026.11 (07.11.2026) setzt laut README **Home Assistant ≥ 2026.9** voraus; ältere HA-Stände brauchen eine ältere Integrationsversion.
- Anschluss: ISG an eine freie **CAN-B**-Klemme des WPM (Tecalor WPM 4, Inbetriebnahme, Kap. 4.4), LAN an den Router. Standard-IP 192.168.0.126, per DHCP eine andere; DHCP-Reservierung empfohlen.
- Modbus: **Port 502, Slave-ID 1 (unveränderlich)**, 1-basierte Adressierung. In HA/pymodbus wird **eine Adresse niedriger** angesprochen: Dokument 1501 → `address: 1500`; Dokument 507 → `address: 506`.

### 3.2 Auth

Keine. Weder Modbus noch die HACS-Integration kennen Benutzer/Passwort. Die Servicewelt-Anmeldung ist davon unabhängig.

### 3.3 Datenweg und Register

Das ISG liest den WPM-CAN und legt die Werte in zwei Registerblöcken ab:

- **Read Input Register (FC 04)** — nur lesbar: Systemwerte 501–…, Status 2501–…, Energie 3501–…
- **Read/Write Holding Register (FC 03/06/16)** — les- und schreibbar: Systemparameter 1501–…, Energie-Management 4001–…
- Nicht vorhandene Objekte liefern **32768 (0x8000)**. Die Integration macht daraus `unavailable` — gut fürs Dashboard, weil kein Fantasiewert angezeigt wird.
- **Skalierung:** Temperaturen/Druck/Volumenstrom kommen als Zehntel (203 = 20,3 °C). Manche Register (z. B. Drücke im erweiterten Block) nutzen 0,01.
- **Störungen quittieren geht nur über die Servicewelt**, nicht über Modbus (Software-Doku, Kap. 4, PDF-S. 4).

### 3.4 Entitäten

Die Integration beschreibt (Stand 2026.11) **152 Sensoren, 57 Binärsensoren, 49 Numbers, 5 Climate-, 2 Select-, 3 Switch- und 1 Button-Plattform** — je nach Reglerfamilie wird nur eine Teilmenge angelegt. Unterstützte Regler laut Manifest/README: `WPM 3`, `WPM 3i`, `WPMsystem`, `LWZ`, `LWZ x04 SOL`, `LWZ R290`. **`WPM 4` steht nicht in der Liste**; die ISG-Kompatibilitätsliste führt die Schwesteranlage WPL-A 05/07 … aber unter **WPMsystem**. Ob der WPM4 die Modell-ID 449 (`WPMsystem`) meldet, ist vor einem Kauf zu prüfen (§ 11).

Wichtige Plattformen:

| Plattform | Anzahl | Bedeutung |
|---|---|---|
| `climate` | 5 (HK 1–5) | Heizkreis mit HVAC-Modus (AUTO/OFF/HEAT), Presets (`ready`, `program`, `eco`, `comfort`, `water_heating`, `emergency`), Zieltemperatur |
| `select` | 1–2 | **Betriebsart** (Register 1501) |
| `number` | bis 49 | Sollwerte: Komfort/Eco je HK, WW Komfort/Eco, Heizkurve, Bivalenz, Lüfterstufen |
| `sensor` | bis ~150 | Temperaturen, Drücke, Volumenstrom, Energie, Laufzeiten, Effizienz |
| `binary_sensor` | bis 57 | Verdichter, Heizbetrieb, WW-Betrieb, Pumpen, Störung, EVU-Sperre, Abtauung, Filter |
| `switch` | 3 | SG Ready aktiv / Eingang 1 / Eingang 2 |
| `button` | 1 | Wärmepumpe zurücksetzen |

### 3.5 Grenzen

- **Kein `water_heater`.** Warmwasser wird über `number`-Sollwerte und Sensoren abgebildet, nicht als eigene Wassererwärmer-Entität.
- **Polling fest 30 s**, kein Options-Flow. Schneller geht nur mit eigener Modbus-Konfiguration.
- **Schreibzugriffe sind echte Holding-Register-Writes.** Die Integration prüft Wertebereiche und wartet auf eine Gerätebestätigung; ein `optimistic`-Verhalten wie beim ESPHome-Gateway gibt es hier nicht.
- **ISG-Modbus ist nicht mit anderen ISG-Softwareerweiterungen kombinierbar** (Ausnahme: lesend parallel zu EMI). Wer EMI für PV nutzt, muss mit überschriebenen Writes rechnen.
- **Ein Config Entry pro ISG.** Mehrere Anlagen sind möglich (bei DHCP-Discovery ist die Unique ID die MAC, bei manueller Einrichtung Host/Port), aber alle heißen standardmäßig „Stiebel Eltron `<Modell>`“; HA hängt bei Kollision `_2`, `_3` an.
- **Entitätsnamen sind modell- und sprachabhängig** (siehe § 9.1) — der wichtigste Fallstrick fürs Dashboard.

---

## 4. Variante B — ISG + HTTP-Scraping (`stiebel_eltron_http`, pmq)

### 4.1 Hardware und Zugang

ISG web/plus/Connect im LAN, **keine** Modbus-Freischaltung nötig — die Integration liest die lokale Servicewelt per HTTP. Kein Cloud-Konto, kein Abo.

### 4.2 Auth

Keine Zugangsdaten im Config Flow (nur Host). Ein in der Servicewelt gesetztes Login führt zu 401/403 und damit zum Setup-Fehler — **Servicewelt-Login muss aus sein**.

### 4.3 Datenweg

HTML-Seiten der Servicewelt, u. a.:

| Pfad | Inhalt |
|---|---|
| `/?s=1,0` | Info → System (Versionen, MAC) |
| `/?s=1,1` | Info → Wärmepumpe (Temperaturen, Wärmemengen, Leistungsaufnahme, Starts) |
| `/?s=2,0` | Diagnose → Systemstatus |
| `/?s=2,2` | Diagnose → Wärmepumpenstatus |
| `/?s=2,7` | Diagnose → System |
| `/?s=5,0` | Profil → Netzwerk |

Es gibt **keine dokumentierte JSON-API**. Aussagen über `values.js`/`values.json` sind nicht belegt; alle bekannten Tools (pmq, `isg_exporter`, `stiebel-eltron-apiserver`, `janni83/isg-client`) parsen HTML bzw. posten Formulare. Ein „HTTP/JSON-Weg“ existiert damit **nicht** als belastbare Variante.

### 4.4 Entitäten (vollständig, weil klein)

| key | Name | Einheit |
|---|---|---|
| `room_temperature` | Room temperature | °C |
| `room_relative_humidity` | Room relative humidity | % |
| `outside_temperature` | Outside temperature | °C |
| `dhw_temperature` | DHW temperature | °C |
| `target_dhw_temperature` | Target DHW temperature | °C |
| `heating_energy` | Heating (today) | kWh |
| `total_heating_energy` | Total heating | kWh |
| `power_consumption` | Energy consumption (today) | kWh |
| `power_consumption_dhw` | Energy consumption DHW (today) | kWh |
| `total_power_consumption` | Total energy consumption | kWh |
| `total_power_consumption_dhw` | Total energy consumption DHW | kWh |
| `flow_temperature` | Flow temperature | °C |
| `target_flow_temperature` | Target flow temperature | °C |
| `compressor_starts` | Compressor starts | — |
| `compressor_status` | Compressor status | on/off |
| `auxiliary_heater_status` | Auxiliary heater status | on/off |
| `booster_heater_1_status` / `_2_` | Booster heater stage 1/2 | on/off |
| `defrost_status` | Defrost status | on/off |

**Beispiel-entity_id:** Gerätename ist fest „Stiebel Eltron ISG“, die Entitäten heißen also `sensor.stiebel_eltron_isg_outside_temperature`, `sensor.stiebel_eltron_isg_dhw_temperature`, `binary_sensor.stiebel_eltron_isg_compressor_status`. **Achtung:** Dieselben Präfixe nutzt eine Altinstallation von `stiebel_eltron_isg` (Modbus) — beide Integrationen parallel erzeugen `_2`-Kollisionen und sind nicht zu empfehlen. Die Einheiten stehen in der Tabelle oben.

### 4.5 Grenzen

- **Read-only.** Keine Sollwerte, keine Betriebsart, kein SG Ready.
- **Weniger Werte als Modbus:** keine HK2/HK3, keine Drücke, keine Heißgastemperatur, keine Verdichterlaufzeiten, keine Effizienz.
- **Layoutabhängig:** Firmware-Update der Servicewelt kann Selektoren brechen; Fehler zeigen sich als `UpdateFailed`.
- **60 s Polling**, fest.
- Die Binärsensoren werden in v0.1.0 aus der Sensor-Plattform heraus angelegt (technische Besonderheit der Integration); im laufenden System prüfen, in welcher Domain sie tatsächlich landen.

---

## 5. Variante C — HA-Core `stiebel_eltron`

- Offizielle Integration, Config Flow, Auto-Discovery über DHCP-Hostname `servicewelt*`.
- **Nur LWZ-Geräte** (getestet: LWZ 504e, LWZ 404 eco, LWZ 304, LWZ 304 Trend); die Implementierung nutzt ausschließlich `pystiebeleltron.lwz`.
- **Genau eine Entität**: `climate.…`, Heizkreis 1, mit HVAC-Modi AUTO/HEAT/OFF und Presets. Beispiel: Gerät „Stiebel Eltron LWZ“ → `climate.stiebel_eltron_lwz`.
- Für WPM-Anlagen (also auch hier) **nicht verwendbar**. Als Vergleich aufgenommen, weil viele Suchergebnisse sie fälschlich als „die Stiebel-Integration“ bezeichnen.

---

## 6. Variante D — HA-Core `modbus` + Stiebel-Registerliste

Für Anlagen mit ISG, aber ohne HACS-Integration (oder für Register, die die HACS-Integration nicht liest).

> **Namensklärung:** Ein HACS-Repo namens `stiebel-eltron-modbus` existiert **nicht** (GitHub-Suche 11/2026: 14 Treffer, keiner mit diesem Namen). Wenn in Foren davon die Rede ist, ist entweder `pail23/stiebel_eltron_isg_component` oder eine eigene `modbus:`-YAML-Konfiguration wie die folgende gemeint.

```yaml
modbus:
  - name: isg
    type: tcp
    host: <isg-ip>
    port: 502
    delay: 0
    timeout: 5
    sensors:
      - name: "WP Außentemperatur"
        unique_id: isg_aussentemperatur
        slave: 1
        address: 506          # Dokument 507, 1-basiert → -1
        input_type: input     # FC 04
        data_type: int16
        scale: 0.1
        precision: 1
        unit_of_measurement: "°C"
        device_class: temperature
        state_class: measurement
      - name: "WP Betriebsart"
        unique_id: isg_betriebsart
        slave: 1
        address: 1500         # Dokument 1501, Holding
        input_type: holding
        data_type: uint16
```

- Schreiben: `modbus.write_register` mit `hub: isg`, `address: 1500`, `value: 3` (Komfort).
- **Scaling pro Register verschieden** (0,1 vs. 0,01) — aus der Spalte „Datentyp“ der Software-Doku ableiten, nicht raten.
- **0x8000 (32768) wird nicht automatisch gefiltert** → Template-Sensoren oder `availability` ergänzen, sonst steht „32768 °C“ im Dashboard.
- **Kein Modell-Mapping, keine Bereichsprüfung beim Schreiben.** Falsche Werte können die Anlage in einen unerwünschten Betriebszustand bringen.
- Ein Hub pro ISG; mehrere Anlagen = mehrere Hubs.

Geeignet für gezielte Ergänzungen (z. B. Register, die pail23 nicht kennt), nicht als Dashboard-Basis.

---

## 7. Variante E — ESPHome / CAN-Gateway (ohne ISG)

### 7.1 Weg

ESP32 (klassisch + MCP2515 oder ESP32-S3 mit TWAI) an **CAN B** des WPM; 20–50 kBit/s je nach Modell; keine Termination am ESP32 nötig. Zwei Ausprägungen:

- **`bullitt186/ha-stiebel-control`**: fertige ESPHome-Firmware, veröffentlicht 3800+ Signale per MQTT-Discovery, Modell-YAMLs u. a. für WPL 09/10/13/17/18, TTL 33, WPF 10. Writes und SG Ready teils unverifiziert.
- **Eigene Firmware** (`kr0ner/OneESP32ToRuleThemAll`, hier: `wpl_a07.yaml`): ~90 kuratierte Entitäten, deutsch benannt, inkl. schreibbarer Numbers/Select (`wp_number.yaml`), CAN-Scan-Werkzeug.

### 7.2 Entitäten (dieser Haushalt, real existierend)

| Funktion | entity_id | Einheit |
|---|---|---|
| Außentemperatur | `sensor.esp32_poe_technik_aussentemp` | °C |
| Vorlauf WP | `sensor.esp32_poe_technik_vorlaufisttemp_wp` | °C |
| Rücklauf WP | `sensor.esp32_poe_technik_ruecklaufisttemp_wp` | °C |
| Warmwasser Ist | `sensor.heatingpump_speicheristtemp` | °C |
| Warmwasser Soll (wirksam) | `sensor.heatingpump_speichersolltemp` | °C |
| Puffer Ist | `sensor.esp32_poe_technik_pufferisttemperatur` | °C |
| HK1 Ist / Soll | `sensor.esp32_poe_technik_isttemperatur_hk1` / `…_solltemperatur_hk1` | °C |
| Betriebsart | `select.esp32_poe_technik_programmschalter` | Komfort/… |
| Heizkurve | `number.esp32_poe_technik_steigung_heizkurve` | — |
| WW-Soll Komfort / Eco | `number.esp32_poe_technik_einstell_speichersolltemp` / `…_ww_eco_temp` | °C |
| Verdichter | `binary_sensor.esp32_poe_technik_verdichter` | on/off |
| Störung | `binary_sensor.esp32_poe_technik_stoerung` | on/off |
| EVU-Sperre | `binary_sensor.esp32_poe_technik_evu_sperre` | on/off |
| Kühlbetrieb | `binary_sensor.esp32_poe_technik_kuehlbetrieb` | on/off |
| Heizdruck | `sensor.esp32_poe_technik_heizungsdruck` | bar |
| Volumenstrom | `sensor.esp32_poe_technik_volumenstrom` | l/min |
| Heißgas / Hochdruck / Niederdruck | `…_heissgastemp` / `…_druck_hochdruck` / `…_druck_niederdruck` | °C / bar |
| Verdichterstarts | `sensor.esp32_poe_technik_verdichter_starts` | — |
| Wärme Heizen/WW heute | `…_waermeertrag_heiz_tag_summe_kwh` / `…_waermeertrag_ww_tag_summe_kwh` | kWh |
| Strom Heizen/WW gesamt | `…_el_energieaufnahme_heiz_summe_kwh` / `…_el_energieaufnahme_ww_summe_kwh` | kWh |
| Laufzeit VD Heizen / WW | `…_laufzeit_vd_heizen` / `…_laufzeit_vd_warmwasser` | h |
| Lüftungsstufe (LWZ, eigener Bus) | `select.dachboden_luftung_lwz_stufe` | 1–3 |
| Zuluft/Abluft Temperatur | `sensor.dachboden_luftung_lwz_zulufttemperatur` / `…_ablufttemperatur` | °C |
| Abluftfeuchte | `sensor.dachboden_luftung_lwz_abluftfeuchte` | % |

### 7.3 Grenzen

- **Keine Herstellerfreigabe, kein Support.** Falsche Writes können die Anlage stören; Writes sind hier `optimistic: true`, HA zeigt den gesendeten Wert, nicht die Gerätebestätigung.
- **WLAN-Gateway:** gemessen 15–30 % Paketverlust, Aussetzer 8–18 min, ~10×/Tag (Skill-Doku). Dashboard muss Lücken als Lücken zeigen.
- **Modellspezifische YAML** — kein generisches „funktioniert überall“.
- **Wärmemengenzähler unplausibel** (COP ≈ 39 aus 250,7 MWh Wärme / 6,46 MWh Strom). COP-Karten dürfen hier nicht auf `waermeertrag` aufbauen, solange die Zähler nicht geklärt sind.
- **Lüftung ist ein anderer Bus** und ein anderes Gerät — kein gemeinsames Gerät im Dashboard.

---

## 8. Variante F — MyStiebel-Cloud

`sanderkwantes/mystiebel` liest/schreibt über die Hersteller-Cloud. Für diesen Nutzer ausgeschlossen (LAN-only, keine Cloud-Abhängigkeit), und für ein HACS-Dashboard ungeeignet, weil es kein lokales Gerät als Datenquelle hat. Nur der Vollständigkeit halber genannt.

---

## 9. Entity-Tabelle für das Dashboard

### 9.1 Namensregeln — zuerst lesen, sonst rät das Dashboard falsch

1. **entity_id = `<domain>.<slug>`**, gebildet beim Anlegen aus **Gerätename + Entitätsname in der HA-Benutzersprache**. Deutsch → deutsche Namen, Umlaute werden transliteriert: `ü → u`, `ß → ss`, `ä → a`, `ö → o`. Beispiel: „Außentemperatur“ → `aussentemperatur`, „Rücklauftemperatur“ → `rucklauftemperatur`.
2. **Gerätename** der Integration ist aktuell **„Stiebel Eltron `<Modell>`“**, also z. B. `stiebel_eltron_wpmsystem`, `stiebel_eltron_wpm_3`. **Ältere Installationen** (vor der Umbenennung) behalten **`stiebel_eltron_isg`** in der entity_id — HA benennt bestehende Entitäten bei Geräteumbenennung nicht um. Beide Präfixe sind real (Beleg: `mrebbert/stiebel-eltron-isg-dashboard` nutzt durchgehend `…_stiebel_eltron_isg_…`).
3. **HA-Entity-ID-Format:** HA kann zusätzlich die **Area** voranstellen, wenn das Gerät beim Anlegen schon einer Area zugeordnet ist (`sensor.keller_stiebel_eltron_wpmsystem_aussentemperatur`). Das ist eine dritte Variante.
4. **Zweites identisches Gerät** bekommt `_2`, `_3` … angehängt.
5. **Fazit für das Dashboard:** **keine festen entity_ids hardcodieren.** Pro Gerät die Kandidatenliste (DE/EN/legacy) auflösen, sonst bricht das Dashboard bei jedem Sprach-/Versionswechsel. Die Design-Task muss dafür eine Mapping-Schicht vorsehen (Label am Gerät > explizite Mapping-Tabelle > Kandidatenliste).

### 9.2 Tabelle

`<g>` = Gerätepräfix, z. B. `stiebel_eltron_wpmsystem` (aktuell) oder `stiebel_eltron_isg` (Altinstallation). Register = **1-basierte Dokumentadresse**; HA-`address` = Register − 1. Einheit „—“ = dimensionslos.

| Funktion | entity_id-Muster (DE) | Muster (EN) | Einheit | R/W | Register | Lokal (ESPHome) |
|---|---|---|---|---|---|---|
| **Temperaturen** | | | | | | |
| Außentemperatur | `sensor.<g>_aussentemperatur` | `…_outdoor_temperature` | °C | R | 507 | `sensor.esp32_poe_technik_aussentemp` |
| Vorlauf WP | `sensor.<g>_vorlauftemperatur_wp` | `…_flow_temperature_wp` | °C | R | 513 | `…_vorlaufisttemp_wp` |
| Vorlauf NHZ | `sensor.<g>_vorlauftemperatur_nhz` | `…_flow_temperature_nhz` | °C | R | 514 | `…_vorlaufisttemp_nhz` |
| Vorlauf (gesamt) | `sensor.<g>_vorlauftemperatur` | `…_flow_temperature` | °C | R | 515 | `…_vorlauftemp` |
| Rücklauf | `sensor.<g>_rucklauftemperatur` | `…_return_temperature` | °C | R | 516 | `…_ruecklaufisttemp_wp` |
| Puffer Ist | `sensor.<g>_ist_temperatur_puffer` | `…_actual_temperature_buffer` | °C | R | 518 | `…_pufferisttemperatur` |
| Puffer Soll | `sensor.<g>_soll_temperatur_puffer` | `…_target_temperature_buffer` | °C | R | 519 | — |
| Warmwasser Ist | `sensor.<g>_ist_temperatur_warmwasser` | `…_actual_temperature_water` | °C | R | 522 | `sensor.heatingpump_speicheristtemp` |
| Warmwasser Soll (wirksam) | `sensor.<g>_soll_temperatur_warmwasser` | `…_target_temperature_water` | °C | R | 523 | `sensor.heatingpump_speichersolltemp` |
| HK1 Ist | `sensor.<g>_ist_temperatur_hk_1` | `…_actual_temperature_hk_1` | °C | R | 508 | `…_isttemperatur_hk1` |
| HK1 Soll | `sensor.<g>_soll_temperatur_hk_1` | `…_target_temperature_hk_1` | °C | R | 510 | `…_solltemperatur_hk1` |
| Raum Ist HK1 | `sensor.<g>_ist_raumtemperatur_hk_1` | `…_actual_room_temperature_hk_1` | °C | R | 584 | `…_raumisttemp` |
| Raum Soll HK1 | `sensor.<g>_soll_raumtemperatur_hk_1` | `…_target_room_temperature_hk_1` | °C | R | 585 | `…_raumsolltemp` |
| Raumfeuchte HK1 | `sensor.<g>_luftfeuchtigkeit_hk_1` | `…_actual_humidity_hk_1` | % | R | 505 (WPM 3/3i) | `…_raumfeuchte` |
| Taupunkttemperatur | `sensor.<g>_taupunkttemperatur` | `…_dew_point_temperature` | °C | R | 506 | `…_taupunkttemp` |
| Heizdruck | `sensor.<g>_heizdruck` | `…_heater_pressure` | bar | R | 520 | `…_heizungsdruck` |
| Volumenstrom | `sensor.<g>_volumenstrom` | `…_volume_stream` | l/min | R | 521 | `…_volumenstrom` |
| Heißgastemperatur | `sensor.<g>_heissgastemperatur` | `…_hot_gas_temperature` | °C | R | 544 | `…_heissgastemp` |
| Hochdruck | `sensor.<g>_hochdruck` | `…_high_pressure` | bar | R | 547 | `…_druck_hochdruck` |
| Niederdruck | `sensor.<g>_niederdruck` | `…_low_pressure` | bar | R | 545 | `…_druck_niederdruck` |
| **Betrieb & Sollwerte** | | | | | | |
| Betriebsart | `select.<g>_betriebsart` | `select.…_operation_mode` | Auswahl | **R/W** | 1501 (Holding) | `select.esp32_poe_technik_programmschalter` |
| Heizkreis 1 (Climate) | `climate.<g>_heizkreis_1` | `climate.…_heat_circuit_1` | °C / Modus | **R/W** | 1501/1502/1503 | — |
| Tagbetrieb Soll HK1 | `number.<g>_tagbetrieb_temperatursoll_hk_1` | `number.…_comfort_temperature_target_hk1` | °C | **R/W** | 1502 | `number.…_komforttemperatur` |
| Absenkbetrieb Soll HK1 | `number.<g>_absenkbetrieb_temperatursoll_hk_1` | `…_eco_temperature_target_hk1` | °C | **R/W** | 1503 | `number.…_ecotemperatur` |
| Heizkurve Steilheit HK1 | `number.<g>_heizkurve_steilheit_hk_1` | `…_heating_curve_rise_hk1` | — | **R/W** | 1504 | `number.…_steigung_heizkurve` |
| WW Tagbetrieb Soll | `number.<g>_tagbetrieb_warmwasser_temperatursoll` | `…_comfort_water_temperature_target` | °C | **R/W** | 1510 | `number.…_einstell_speichersolltemp` |
| WW Absenkbetrieb Soll | `number.<g>_absenkbetrieb_warmwasser_temperatursoll` | `…_eco_water_temperature_target` | °C | **R/W** | 1511 | `number.…_ww_eco_temp` |
| Bivalenztemperatur Heizung | `number.<g>_bivalenztemperatur_heizung` | `…_dualmode_temperature_hzg` | °C | **R/W** | 1509 | `sensor.…_bivalenztemperatur_hzg` |
| Bivalenztemperatur WW | `number.<g>_bivalenztemperatur_warmwasser` | `…_dualmode_temperature_ww` | °C | **R/W** | 1513 | — |
| SG Ready aktiv | `switch.<g>_sg_ready_aktiv` | `switch.…_sg_ready_active` | on/off | **R/W** | 4001 | `switch.…_evu_sperre` (nur EVU) |
| SG Ready Eingang 1/2 | `switch.<g>_sg_ready_eingang_1` / `…_2` | `…_sg_ready_input_1` / `…_2` | on/off | **R/W** | 4002/4003 | — |
| **Status & Störungen** | | | | | | |
| Verdichter | `binary_sensor.<g>_verdichter` | `binary_sensor.…_compressor_on` | on/off | R | 2501 (Bit) | `binary_sensor.…_verdichter` |
| Heizbetrieb | `binary_sensor.<g>_heizbetrieb` | `…_is_heating` | on/off | R | 2501 | — |
| Warmwasserbetrieb | `binary_sensor.<g>_warmwasserbetrieb` | `…_is_heating_boiler` | on/off | R | 2501 | — |
| Sommerbetrieb | `binary_sensor.<g>_sommerbetrieb` | `…_is_summer_mode` | on/off | R | 2501 | `…_sommerbetrieb` |
| Kühlbetrieb | `binary_sensor.<g>_kuhlbetrieb` | `…_is_cooling` | on/off | R | 2501 | `…_kuehlbetrieb` |
| Verdampferabtauung | `binary_sensor.<g>_verdampferabtauung` | `…_evaporator_defrost` | on/off | R | 2506 | — |
| Sperrzeit (EVU) | `binary_sensor.<g>_sperrzeit_evu` | `…_power_off` | on/off | R | 2502 | `binary_sensor.…_evu_sperre` |
| Fehlerstatus | `binary_sensor.<g>_fehlerstatus` | `…_error_status` | on/off | R | 2504 | `binary_sensor.…_stoerung` |
| Aktiver Fehler (Nr.) | `sensor.<g>_aktiver_fehler` | `sensor.…_active_error` | — | R | 2507 | — |
| HK1-Pumpe | `binary_sensor.<g>_heizkreis_1_pumpe` | `…_heating_circuit_1_pump` | on/off | R | 2509 | `…_heizkreispumpe_1` |
| WW-Ladepumpe | `binary_sensor.<g>_warmwasser_ladepumpe` | `…_dhw_charging_pump` | on/off | R | 2514 | `…_pufferladepumpe_1` (X4, extern) |
| Quellenpumpe | `binary_sensor.<g>_quellenpumpe` | `…_source_pump` | on/off | R | 2515 | `…_quellenpumpe` |
| NHZ-Stufen aktiv | `binary_sensor.<g>_nhz_stufen_aktiv` | `…_nhz_stages_running` | on/off | R | 2501 | `…_nhz_1` / `_2` / `_3` |
| **Energie** | | | | | | |
| Heizwärme heute | `sensor.<g>_erzeugte_heizwarme_heute` | `…_produced_heating_today` | kWh | R | 3501 | `…_waermeertrag_heiz_tag_summe_kwh` ⚠ |
| Heizwärme gesamt | `sensor.<g>_erzeugte_heizwarme_gesamt` | `…_produced_heating_total` | kWh | R | 3502+3503 | `…_waermeertrag_heiz_summe_mwh` ⚠ |
| Heizwärme (Tag+Gesamt, Energy-Dashboard) | `sensor.<g>_erzeugte_heizwarme` | `…_produced_heating` | kWh | R | kombiniert | — |
| WW-Wärme heute | `sensor.<g>_erzeugte_warmwasserwarme_heute` | `…_produced_water_heating_today` | kWh | R | 3504 | `…_waermeertrag_ww_tag_summe_kwh` ⚠ |
| WW-Wärme gesamt | `sensor.<g>_erzeugte_warmwasserwarme_gesamt` | `…_produced_water_heating_total` | kWh | R | 3505+3506 | `…_waermeertrag_ww_summe_mwh` ⚠ |
| Strom Heizung heute | `sensor.<g>_verbrauchte_heizenergie_heute` | `…_consumed_heating_today` | kWh | R | 3511 | — |
| Strom Heizung gesamt | `sensor.<g>_verbrauchte_heizenergie_gesamt` | `…_consumed_heating_total` | kWh | R | 3512+3513 | `…_el_energieaufnahme_heiz_summe_kwh` ⚠ |
| Strom WW heute | `sensor.<g>_verbrauchte_warmwasserenergie_heute` | `…_consumed_water_heating_today` | kWh | R | 3514 | — |
| Strom WW gesamt | `sensor.<g>_verbrauchte_warmwasserenergie_gesamt` | `…_consumed_water_heating_total` | kWh | R | 3515+3516 | `…_el_energieaufnahme_ww_summe_kwh` ⚠ |
| Effizienz Heizung 24 h | `sensor.<g>_effizienz_heizung_letzte_24_h` | `…_efficiency_heating_1_24_h` | COP | R | berechnet | selbst rechnen (⚠) |
| Effizienz WW 24 h | `sensor.<g>_effizienz_warmwasser_letzte_24_h` | `…_efficiency_dhw_1_24_h` | COP | R | berechnet | selbst rechnen (⚠) |
| Laufzeit Verdichter Heizung | `sensor.<g>_verdichter_heizung` | `…_compressor_heating` | h | R | 3517 (WPM 3i) / 3539–3541 (WPMsystem, HP1) | `…_laufzeit_vd_heizen` |
| Laufzeit Verdichter WW | `sensor.<g>_verdichter_warmwasser` | `…_compressor_heating_water` | h | R | 3518 (WPM 3i) / 3542–3544 (WPMsystem, HP1) | `…_laufzeit_vd_warmwasser` |
| Verdichterstarts | `sensor.<g>_verdichterstarts` | `…_compressor_starts` | — | R | nicht im WPM-Registerblatt; pail23 nur für LWZ | `…_verdichter_starts` |
| **Lüftung (nur LWZ / Integralgeräte, nicht WPM)** | | | | | | |
| Ablufttemperatur | `sensor.<g>_ablufttemperatur` | `…_extract_air_temperature` | °C | R | LWZ-Block | `sensor.dachboden_luftung_lwz_ablufttemperatur` |
| Abluftfeuchte | `sensor.<g>_abluft_luftfeuchtigkeit` | `…_extract_air_humidity` | % | R | LWZ-Block | `…_abluftfeuchte` |
| Zulufttemperatur | `sensor.<g>_zulufttemperatur` | `…_supply_air_temperature` | °C | R | LWZ-Block | `…_zulufttemperatur` |
| Zuluftvolumenstrom | `sensor.<g>_zuluft_volumenstrom` | `…_supply_air_flow_rate` | m³/h | R | LWZ-Block | `…_zuluftvolumenstrom` |
| Lüfterstufe | `number.<g>_lufterstufe_tag` | `…_fan_level_comfort` | Stufe | **R/W** | LWZ-Block | `select.dachboden_luftung_lwz_stufe` |

⚠ = Wert vorhanden, aber **nicht ungeprüft verwenden** (siehe § 7.3 und § 9.3). Bei `…_el_energieaufnahme_*_summe_kwh` ist schon die Einheit im ESPHome-Namen fragwürdig: der angezeigte Wert (z. B. 6,94) passt zur Displayeinheit **MWh**, nicht zu kWh — vor jeder Energie-Karte gegen das WPM-Display prüfen.

### 9.3 Werte, die regelmäßig fehlen oder täuschen

| Wert | Problem | Umgang im Dashboard |
|---|---|---|
| **COP / JAZ** | Bei pail23 nur als Fenster-Effizienz (24 h / 12 M) berechenbar, nicht als Momentan-COP. Lokal (ESPHome) sind die Wärmemengenzähler um ~8× überhöht. | Eigene Template-Sensoren, klar als „Fenster-COP“ bzw. „ungeprüft“ labeln; niemals als Momentan-COP ausgeben. |
| **Verdichterstarts** | Nicht im WPM-Modbus-Registerblatt; pail23 hat den Sensor nur für LWZ-Familien. | Aus `binary_sensor.verdichter` per `history_stats` zählen (Muster aus `mrebbert`-Dashboard). |
| **Störungstext** | Modbus liefert nur Fehlernummer (2507) + Status (2504); Klartext steht nur in der Servicewelt. | Nummer anzeigen, Klartext als Link/Servicewelt-Hinweis; **Quittieren nur in der Servicewelt**. |
| **Zeitprogramme** | Nicht als Entität vorhanden (`wp_time.yaml` read-only; Modbus hat keine Programmfenster). | Nicht abbilden; im Dashboard als „am Gerät einstellen“ kennzeichnen. |
| **Lüftung bei WPM** | WPM-Anlagen haben keine Lüftung; die Lüftung ist ein separates Gerät/Bus. | Eigene Karte/Seite, nur wenn Lüftungs-Entitäten existieren. |
| **Warmwasser als `water_heater`** | Gibt es in keiner der Integrationen. | Sollwerte über `number`, Ist über `sensor`, Betrieb über `select`/`climate`. |
| **0x8000-Sentinel** | Roh-Modbus liefert 32768 für „nicht vorhanden“. | Bei Core-`modbus` Availability/Template ergänzen; pail23 macht es selbst. |

---

## 10. Empfehlung

### 10.1 Einfachster Weg (für ein verteilbares Dashboard)

**Variante A: ISG + HACS `stiebel_eltron_isg`.**

Begründung: eine Integration, UI-Setup, Modbus ab Werk, ~270 Entitätsbeschreibungen, echte Schreibbestätigung, HACS-Default-Store, aktive Pflege (Release 2026.11 vom 07.11.2026). Keine Cloud, kein Abo, kein YAML.

Reihenfolge für Nutzer ohne ISG: **erst prüfen, ob die Anlage in der ISG-Kompatibilitätsliste steht** (WPL-A 05/07 → WPMsystem ✓; Tecalor-Typenschild zuordnen), dann ISG web kaufen (nicht plus/Connect, solange §14a/EEBus kein Thema ist), Modbus bleibt unangetastet, Integration per HACS installieren.

### 10.2 Für diesen Haushalt

**Variante E bleibt der einfachste Weg** — das Gateway liefert bereits alle Werte, die das Dashboard braucht, und ein ISG würde ~500–800 € kosten, ohne einen zusätzlichen Messwert zu liefern. Ein ISG lohnt nur, wenn:

- die DIY-Firmware nicht mehr gepflegt werden soll,
- Schreibzugriffe herstellerkonform und bestätigt sein müssen (bei ESPHome `optimistic`),
- §14a/EEBus über ISG Connect gefordert ist (dann aber Connect, nicht web),
- oder ein zweites, fremdes Gerät (z. B. Mietobjekt) angebunden werden soll.

**Wichtig fürs Dashboard:** Die lokalen Entitäten sind deutsch und stabil benannt (`sensor.esp32_poe_technik_*`), aber sie sind **kein HACS-Standard**. Das Dashboard muss sie über eine Mapping-Tabelle einbinden können, sonst ist es nur für diesen einen Haushalt brauchbar.

### 10.3 Entscheidungsbaum

```
ISG vorhanden?
├─ ja → Modbus-Firmware aktiv?
│        ├─ ja → Variante A (pail23)  ← Standard
│        └─ nein → Variante B (HTTP, read-only) oder Firmware-Update
└─ nein → CAN-Zugang möglich/lust auf DIY?
         ├─ ja → Variante E (ESPHome; lokal vorhanden, generisch bullitt186)
         └─ nein → ISG kaufen + Variante A
```

---

## 11. Offene Punkte (vor Kauf/Implementierung klären)

1. **WPM4 ↔ ISG-Modell-ID.** `pystiebeleltron` kennt nur 390 (WPM 3), 391 (WPM 3i), 449 (WPMsystem), 103/104 (LWZ), 551 (LWZ R290). Ob der WPM4 im ISG als 449 erscheint, ist **nicht belegt** → beim Stiebel-Kundendienst mit Typenschild/Softwarestand erfragen, bevor ein ISG gekauft wird.
2. **ISG parallel zum vorhandenen ESP32-Gateway am CAN B.** Technisch plausibel (beide sind Busteilnehmer), aber nicht dokumentiert; Buslast, Adressvergabe und doppelte Anfragen vorher abstimmen.
3. **Wärmemengenzähler dieser Anlage** sind unplausibel (COP ≈ 39). Vor jeder COP-Karte klären, ob Zähler oder Fühler die Ursache sind.
4. **Entity-Präfix-Varianten** (DE/EN, `stiebel_eltron_isg` vs. `stiebel_eltron_wpmsystem`, Area-Präfix) müssen in der Design-Task als Mapping-Schicht umgesetzt werden; ein festes Präfix im YAML wäre ein Installationskiller.
5. **pmq v0.1.0** legt Binärsensoren aus der Sensor-Plattform an — im eigenen System verifizieren, in welcher Domain sie erscheinen, bevor das Dashboard sie erwartet.
6. **Preise** sind Händler-Straßenpreise (11/2026), keine UVP; Stiebel verkauft nicht an Endkunden, Fachbetrieb/Online-Fachhandel einplanen.

---

## 12. Quellen

| Quelle | Verwendung |
|---|---|
| Stiebel Eltron, *Software-Dokumentation Modbus TCP/IP*, 321798-44755-9770 (de/en/fr/…), Kap. 4.1/4.2/6.1/8.1 | Register, 1-basierte Adressierung, Slave-ID 1, 0x8000, Fehlerquittung, „Betriebsart **oder** Sollwert ändern“ |
| Stiebel Eltron, *Kompatibilitätsübersicht ISG Connect / ISG Web / ISG Plus*, Stand 01.05.2025 | Anlagen-/Reglerzuordnung, Modbus-Spalte, Mindestsoftware |
| Stiebel Eltron, *Bedienung und Installation ISG* (DOC-00082646) | „Modbus-TCP/IP-Software ist ab Werk installiert“, Servicewelt lokal ohne Internet |
| Tecalor, *WPM 4 Inbetriebnahme*, Kap. 4.4 | ISG an Klemme „CAN B“ (ohne „+“) |
| GitHub `pail23/stiebel_eltron_isg_component` (Release 2026.11) + `pail23/python-stiebel-eltron` (`api/wpm_*.csv`) | Entitätsumfang, Polling 30 s, unterstützte Regler, Registerzuordnung |
| GitHub `pmq/stiebel-eltron-http` v0.1.0 (`const.py`, `sensor.py`, `scrapper.py`) | HTTP-Pfade, Sensorliste, 60 s, read-only |
| Home Assistant Docs, *STIEBEL ELTRON*-Integration; Core `homeassistant/components/stiebel_eltron` (dev) | Nur LWZ, eine Climate-Entität, 30 s |
| Home Assistant Docs, *Customizing entities* | Entity-ID-Bildung aus Gerätename + lokalisiertem Entitätsnamen, Area-Präfix |
| HACS Default Store, `integration`-Liste | `pail23/stiebel_eltron_isg_component` und `pmq/stiebel-eltron-http` sind HACS-Default |
| GitHub `mrebbert/stiebel-eltron-isg-dashboard` | Reale entity_ids (`stiebel_eltron_isg_*`), Dashboard-Referenz |
| GitHub `bullitt186/ha-stiebel-control` | ESPHome/CAN-Alternative, 3800+ Signale, Modellliste |
| GitHub `sanderkwantes/mystiebel` | Cloud-Variante (verworfen) |
| HA-Instanz dieses Haushalts (2026.11.1, Sprache de) | Lokale entity_ids, Einheiten, Ist-Werte |

---

*Erzeugt im Rahmen von Kanban t_04e2d7f6. Die Datei liegt im Repo unter `docs/research-integration.md` und zusätzlich als Task-Artefakt.*
