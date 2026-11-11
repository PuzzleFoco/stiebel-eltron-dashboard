# Design: Ein Dashboard für 1..n Stiebel-Eltron-Wärmepumpen

**Stand:** 11.11.2026 · **Basis:** [`docs/research-integration.md`](research-integration.md) (Kanban t_04e2d7f6) · **Ziel-Task:** t_aa58d507
**Geprüft gegen:** Home Assistant 2026.11.1, lokale Anlage (ESPHome-CAN, 120 Entitäten) und HA-eigenen YAML-Loader.

Dieses Dokument ist die verbindliche Vorlage für die Implementierung (t_093e7b2e). Es beschreibt
Konventionen, Erkennung, Resolver, Seitenaufbau, Karten, Abhängigkeiten, Dateistruktur und die
Grenzen, die Lovelace selbst setzt. Wo eine Aussage nicht belegt ist, steht sie unter „Offene Punkte“.

> **Nachtrag v0.4.0:** Dieses Design beschreibt die YAML-Quelle und die YAML-Variante (Weg B).
> Für die HACS-Auslieferung baut `scripts/build_strategy.py` daraus eine Lovelace-Strategie, die
> die `auto-entities`-Karten zur Laufzeit je Gerät auflöst. Die Aussage „auto-entities ist
> Pflicht“ gilt damit nur noch für Weg B; siehe `docs/architecture.md`, Entscheidung 0.

---

## 0. Kurzfassung — die sechs Entscheidungen

1. **Gerät ≠ Entity-Präfix.** Die Identität einer Wärmepumpe ist die **Device-ID** im HA-Geräteregister,
   nicht ein Präfix wie `stiebel_eltron_wpmsystem_`. Entity-IDs sind sprach-, versions- und
   area-abhängig (Research § 9.1) und werden nie hartcodiert.
2. **Discovery über Label → Integration → Signatur.** Ein Gerät ist eine Wärmepumpe, wenn es das
   Label `stiebel_eltron` trägt, aus einer Stiebel-Integration kommt oder mindestens drei
   WP-Signaturen besitzt. `area_id` und `expand()` werden bewusst **nicht** zur Gerätebildung benutzt.
3. **Wiederholung über `custom:auto-entities`, Anker ist die Außentemperatur-Entität.** Pro Gerät
   erzeugt auto-entities genau eine Markdown-Karte; die Karte löst über `device_id(this.entity_id)`
   alle weiteren Werte auf. Ein zweites Gerät = zweite Außentemperatur-Entität = zweite Karte, ohne
   YAML-Änderung.
4. **Drei Views:** `Übersicht` (Status-Ampel + Kern-KPIs), `Geräte` (eine Detailkarte pro Anlage),
   `Bedienung` (Sollwerte/Betriebsart als Tile-Karten). Eine View „pro Gerät“ gibt es nicht, weil
   Lovelace zur Laufzeit keine Views erzeugen kann (siehe § 12).
5. **Ein Pflicht-Baustein von HACS: `auto-entities`.** Alles andere sind HA-Bordmittel
   (`markdown`, `tile`, `grid`, `heading`, `sections`). Mushroom/ApexCharts sind optional und in v1
   nicht nötig; `card-mod` wird nicht verwendet.
6. **Dateien:** `dashboards/stiebel_eltron.yaml` + `includes/` (Laufzeit-`!include`) +
   `templates/jinja/` (Makros, per `sync_jinja.py` in die Karten injiziert). `dist/` bleibt
   HACS-Auslieferung.

**Datenfluss in einem Satz:**

```
Geräteregister → Discovery (Label/Integration/Signatur) → device_id
   → Resolver (device_entities + Domain + Suffix) → Markdown-Karte
   → auto-entities (Anker = Außentemperatur) → n Karten, ohne YAML pro Gerät
```

---

## 1. Randbedingungen, die das Design bestimmen

| Randbedingung | Konsequenz |
|---|---|
| Entity-IDs entstehen aus Gerätename + lokalisiertem Entitätsnamen; Area-Präfix und `_2`-Suffixe sind real (Research § 9.1) | Keine festen Entity-IDs. Auflösung nur über `device_id` + Funktions-Suffixe. |
| pail23 (`stiebel_eltron_isg`) liefert ~150 Sensoren, 49 Numbers, 5 Climate, 1–2 Selects; HTTP liefert 17 Sensoren, read-only; ESPHome liefert ~90–120 lokale Entitäten | Ein Resolver mit Kandidatenlisten für DE/EN/lokal; Schreibkarten nur, wenn `select`/`number`/`climate` existieren. |
| Kein `water_heater`, keine Zeitprogramme als Entität, Störungen nur in der Servicewelt quittierbar | Warmwasser über `number` + `sensor`; Zeitprogramme nicht abbilden; kein Quittier-Button. |
| `0x8000` wird von pail23 zu `unavailable`; Roh-Modbus liefert 32768 | `unavailable`/`unknown` immer als „—“ darstellen, nie als 0 oder „aus“. |
| WPM4 steht nicht in pail23s Reglerliste; Modell-ID 449 unbestätigt | Dashboard zeigt nur vorhandene Entitäten; fehlende Gruppen degradieren sichtbar, kein Setup-Fehler. |
| Lokale Wärmemengenzähler unplausibel (COP ≈ 39), Einheit `el_energieaufnahme_*_summe_kwh` fragwürdig | COP standardmäßig **aus**; Energiezähler nur mit Geräte-Einheit und Hinweis, nie umgerechnet. |
| Lovelace kennt keine Schleifen und keine Laufzeit-Views | Wiederholung nur über Jinja (Markdown) oder eine Custom-Card (`auto-entities`); Detail = n Karten auf einer View. |
| HA-Markdown sanitized HTML | Kein `style`, kein `id`, kein `class`; erlaubt sind u. a. `table`, `details`, `summary`, `font[color]`, `ha-icon`, `ha-alert`. |

### 1.1 Was Lovelace nicht kann (und warum das Design so aussieht)

- **Keine Karten-Schleife.** Ein `views:`-Baum ist statisch. Jinja wird nur in bestimmten Feldern
  gerendert (u. a. `markdown.content` und Mushroom-Templates).
- **Keine Laufzeit-Views.** Ein „eigener Link pro Gerät“ würde eine Custom-Strategy oder ein
  JS-Dashboard voraussetzen. Beides ist bewusst nicht Teil von v1 (siehe § 6.4).
- **Kein Jinja in `entity:`-Feldern.** Deshalb kommen die automatisch erzeugten Karten aus
  `auto-entities`, das die Kartenkonfiguration pro Treffer instanziiert.

---

## 2. Grundmodell: Gerät, Funktion, Entität

### 2.1 Drei Ebenen

```
Gerät (device_id, Geräteregister)
  └─ Funktion  (z. B. „Warmwasser Ist“)        ← stabile, sprachunabhängige Idee
       └─ Entität (entity_id, domain)          ← vom Integrationshersteller erzeugt
```

Das Dashboard spricht **nie** von `sensor.stiebel_eltron_wpmsystem_ist_temperatur_warmwasser`.
Es spricht von der Funktion `ww_ist` und sucht sie im Gerät:

```
Funktion + Gerät  →  device_entities(device_id)  →  Domain + Suffix-Kandidat  →  entity_id
```

### 2.2 Namenskonvention

| Ebene | Konvention | Beispiel | Pflicht? |
|---|---|---|---|
| **Geräte-Label** | `stiebel_eltron` (Label-ID, ASCII, klein) | Label am Gerät „ESP32-PoE Technik“ | **Empfohlen**; ohne Label greifen Integration/Signatur |
| **Gerätename** | `Stiebel Eltron <Standort>` oder vorhandener Name | „Wärmepumpe Keller“ | Nein, nur Anzeige |
| **Dashboard-Schlüssel** | `slug(device_name)` + erste 8 Zeichen der Device-ID | `waermepumpe-keller-1b33e9b1` | Intern (Debug/Log), nicht in Entity-IDs |
| **Entity-Label „Anker“** | `stiebel_anker` auf **einer** Entity pro Gerät | Außentemperatur-Entity | Nur für Geräte ohne Außentemperatur-Entity |
| **Entity-Label „bedienbar“** | `stiebel_bedienbar` (optional) | `select.…_programmschalter` | Nicht nötig; Bedienung filtert über Domain + Suffix |
| **Entity-Umbenennung** | `stiebel_<standort>_<funktion>` | `sensor.stiebel_keller_aussentemperatur` | **Optional**, nie Voraussetzung |

**Die vorgeschlagene Präfix-Konvention `stiebel_<raum/geraet>_` ist also eine Empfehlung für
Menschen und für neue Installationen, nicht der Vertrag des Dashboards.** Wer sie anwendet, bekommt
lesbare IDs; wer sie nicht anwendet, bekommt trotzdem ein funktionierendes Dashboard. Das ist der
entscheidende Unterschied zu einem Dashboard, das `stiebel_eltron_wpmsystem_*` hartcodiert.

### 2.3 Warum kein festes Präfix

Belegt durch Research § 9.1 und den Live-Test:

- pail23: `sensor.stiebel_eltron_wpmsystem_aussentemperatur` (neue Namen) **oder**
  `sensor.stiebel_eltron_isg_aussentemperatur` (Altinstallation).
- HA kann bei vorhandener Area ein Präfix voranstellen:
  `number.keller_esp32_poe_technik_can_scan_start` (im Live-System vorhanden).
- Ein zweites gleiches Gerät bekommt `_2`, `_3` an der Entity-ID.
- Lokal heißen die Entitäten **nicht** einheitlich: `sensor.heatingpump_aussentemp` **und**
  `sensor.esp32_poe_technik_vorlaufisttemp_wp` gehören zum selben Gerät.

Ein Präfix-basiertes Dashboard würde an jeder dieser vier Varianten scheitern. Die Device-ID ist
dagegen stabil, solange das Gerät nicht gelöscht und neu angelegt wird.

### 2.4 Label-Schema

| Label | Vergabe | Wirkung |
|---|---|---|
| `stiebel_eltron` | am **Gerät** (Settings → Devices & Services → Devices → Label) | Discovery, auto-entities-Filter für alle Entities des Geräts, Scoping der Karten |
| `stiebel_anker` | an **einer Entity** (Außentemperatur) | Nur für Geräte ohne automatisch erkannte Außentemperatur-Entity; erzeugt die Karte |
| `stiebel_bedienbar` | optional an schreibbaren Entities | Optionaler Fallback, wenn die Muster-Filter der Bedienung nicht passen |

Labels sind keine Entitäten und erzeugen keinen Zustand. Sie überleben Umbenennungen von Entitäten
und werden von `label_devices()` / `label_entities()` gelesen (im Live-Test aufgerufen; Rückgabe
`[]`, weil dort noch kein `stiebel_eltron`-Label gesetzt ist).

---

## 3. Discovery: Welche Geräte sind Wärmepumpen?

### 3.1 Priorität

1. **Label** `stiebel_eltron` am Gerät → vertrauen, ohne weitere Prüfung.
2. **Integration** `stiebel_eltron_isg`, `stiebel_eltron_http`, `stiebel_eltron` → Geräte aus
   `integration_entities()` sammeln, ohne Signaturprüfung (auch ein LWZ mit nur einer
   `climate`-Entität ist gültig).
3. **Signatur** für `esphome` (und bei Bedarf `mqtt`/`modbus`): Gerät nur übernehmen, wenn es
   mindestens **3** WP-Signaturen hat. Das verhindert, dass Lüftung, Thermostate oder
   Wetterstationen als Wärmepumpe erscheinen.
4. **Fallback** über alle `states`, gleiche Signatur und Schwelle — nur wenn 1–3 leer sind.

### 3.2 Signatur

Eine Entität zählt als Signatur, wenn ihre `object_id` auf einen dieser Suffixe endet:

```
aussentemp, aussentemperatur, outdoor_temperature,
vorlaufisttemp_wp, speicheristtemp, programmschalter, verdichter
```

Ein Gerät mit `aussentemperatur` **und** `speicheristtemp` **und** `verdichter` ist eine
Wärmepumpe. Ein Raumthermostat mit nur `aussentemperatur` (Bosch RBSH) fällt durch. Die Lüftung
mit `aussentemperatur` und `ablufttemperatur` fällt ebenfalls durch (Live-Test: 1 Signatur).

### 3.3 Getesteter Discovery-Block

Der folgende Block wurde gegen die lokale HA-Instanz (2026.11.1) gerendert. Er liefert **ein**
Gerät („ESP32-PoE Technik“, 120 Entities); die Lüftung (26 Entities) wird korrekt ausgeschlossen.

```jinja
{%- set ns = namespace(devs=[]) -%}

{# 1. Explizites Label am Gerät #}
{%- for d in label_devices('stiebel_eltron') -%}
  {%- if d not in ns.devs -%}{%- set ns.devs = ns.devs + [d] -%}{%- endif -%}
{%- endfor -%}

{# 2. Stiebel-Integrationen: Geräte vertrauen #}
{%- for dom in ['stiebel_eltron_isg', 'stiebel_eltron_http', 'stiebel_eltron'] -%}
  {%- for e in integration_entities(dom) -%}
    {%- set d = device_id(e) -%}
    {%- if d and d not in ns.devs -%}{%- set ns.devs = ns.devs + [d] -%}{%- endif -%}
  {%- endfor -%}
{%- endfor -%}

{# 3. ESPHome: nur mit Signatur >= 3 #}
{%- set sig = ['aussentemp', 'aussentemperatur', 'outdoor_temperature',
               'vorlaufisttemp_wp', 'speicheristtemp',
               'programmschalter', 'verdichter'] -%}
{# mqtt/modbus nur aufnehmen, wenn die Anlage darüber angebunden ist;
   die Liste kostet sonst unnötig Renderzeit. #}
{%- for dom in ['esphome'] -%}
  {%- set cand = namespace(ids=[]) -%}
  {%- for e in integration_entities(dom) -%}
    {%- set d = device_id(e) -%}
    {%- if d and d not in cand.ids -%}{%- set cand.ids = cand.ids + [d] -%}{%- endif -%}
  {%- endfor -%}
  {%- for d in cand.ids -%}
    {%- set hitlist = namespace(l=[]) -%}
    {%- for e in device_entities(d) -%}
      {%- for x in sig -%}
        {%- if e.endswith('_' ~ x) and x not in hitlist.l -%}
          {%- set hitlist.l = hitlist.l + [x] -%}
        {%- endif -%}
      {%- endfor -%}
    {%- endfor -%}
    {%- if hitlist.l | count >= 3 and d not in ns.devs -%}
      {%- set ns.devs = ns.devs + [d] -%}
    {%- endif -%}
  {%- endfor -%}
{%- endfor -%}

{# 4. Anzeigeliste mit Name und Area, alphabetisch #}
{%- set devs = namespace(list=[]) -%}
{%- for d in ns.devs -%}
  {%- set nm = device_attr(d, 'name') or d -%}
  {%- set ents = device_entities(d) -%}
  {%- set first = ents[0] if ents else '' -%}
  {%- set devs.list = devs.list + [{
        'id': d,
        'name': nm,
        'area': area_name(first) if first else '—'
      }] -%}
{%- endfor -%}
{%- for dev in devs.list | sort(attribute='name') -%}
  {{ dev.name }} ({{ dev.area }})
{%- endfor -%}
```

> **Pflichtregel:** Alle Jinja-Blöcke in Lovelace-Markdown müssen Whitespace-kontrolliert sein
> (`{%- … -%}`). Ohne diese Kontrolle erzeugt die Schleife über alle States so viel Leerraum, dass
> HA mit `Template output exceeded maximum size of 262144 characters` abbricht. Das ist im
> Live-Test reproduziert worden, nicht theoretisch.

Für die Ankerprüfung ruft die Summary zusätzlich
`find(d, ['aussentemp', 'aussentemperatur', 'outside_temperature'], 'sensor')` auf; die Makros
kommen aus `templates/jinja/resolver.j2`. Der Fallback über alle `states` (Schritt 4) benutzt
denselben Signatur-Score, wird aber nur ausgeführt, wenn `ns.devs` nach Schritt 1–3 leer ist.

### 3.4 Warum `area_id` und `expand()` nicht zur Gerätebildung taugen

| Werkzeug | Problem |
|---|---|
| `area_id` / `area_entities()` | Ein Keller kann Wärmepumpe **und** Heizungspuffer **und** Fremdgeräte enthalten. Zwei Wärmepumpen können in derselben Area stehen. Die Area gruppiert Räume, nicht Anlagen. |
| `expand('area…')` | Löst Gruppen/Areas in eine flache Entitätsliste auf. Die Gerätezugehörigkeit geht verloren; `device_entities()` ist die richtige Ebene. |
| `auto-entities`-Filter `device` | Erwartet einen Gerätenamen **pro Karte** und würde die n-Geräte-Liste wieder statisch machen. Die dynamische Zuordnung passiert in Jinja über `device_id()` / `device_entities()`. |
| Entity-Präfix | Sprach-, versions- und area-abhängig; `_2`-Suffixe; lokal zwei Präfixe pro Gerät. |

`area_name()` wird nur **zur Anzeige** benutzt (mit Fallback auf die Geräte-Area, im Live-Test
verifiziert).

### 3.5 Anker-Entity

Die automatische Kartenwiederholung braucht **eine** Entität pro Gerät, an der die Karte hängt.
Default ist die Außentemperatur:

```
*_aussentemp          (lokal: sensor.heatingpump_aussentemp)
*_aussentemperatur    (pail23 DE)
*_outside_temperature (pail23 EN / HTTP)
```

Sie wird nicht über einen festen Präfix gefunden, sondern über den Suffix-Glob in
`auto-entities`; die Karte löst daraus die Device-ID und alle weiteren Werte auf. Geräte ohne
Außentemperatur-Entität bekommen keine automatische Karte; dafür gibt es das optionale Label
`stiebel_anker` auf einer beliebigen Entity (§ 8.5). Die Core-Integration `stiebel_eltron` (nur
LWZ, eine `climate`-Entität) ist kein Ziel dieses Dashboards; sie wird in der Discovery zwar
gefunden, bekommt aber ohne Anker keine Karte (offener Punkt § 12).

### 3.6 Live-Beleg

| Prüfung | Ergebnis |
|---|---|
| Discovery gegen lokale HA | 1 Gerät: „ESP32-PoE Technik“, 120 Entities |
| Lüftung (26 Entities) | korrekt ausgeschlossen (nur 1 Signatur) |
| Außentemperatur | `sensor.heatingpump_aussentemp` (nicht `sensor.esp32_poe_technik_aussentemp` — die Research-Tabelle ist hier ungenau) |
| Vorlauf | `sensor.esp32_poe_technik_vorlaufisttemp_wp` — anderes Präfix, gleiches Gerät |
| Zustand während des Tests | Gerät `unavailable`; Status rendert ⚪ „Keine Daten“, alle KPIs „—“ |
| `!include` verschachtelt | mit HA-eigenem `annotatedyaml`-Loader geparst (Root → View → Card) |

Damit ist genau der Fall belegt, an dem ein präfixbasiertes Dashboard scheitern würde.

---

## 4. Entity-Resolver

### 4.1 Makros

Alle Karten benutzen dieselben vier Basis-Makros (plus `dot` für die Ampel). Sie liegen in
`dashboards/templates/jinja/resolver.j2` und werden per `sync_jinja.py` in die Karten kopiert.

```jinja
{# Findet die erste Entity im Gerät, deren object_id auf einen Kandidaten endet. #}
{%- macro find(dev, suffixes, domain) -%}
  {%- set ns = namespace(e='') -%}
  {%- for cand in device_entities(dev) | sort -%}
    {%- if not ns.e and cand.startswith(domain ~ '.') -%}
      {%- for s in suffixes -%}
        {%- if not ns.e and cand.endswith('_' ~ s) -%}{%- set ns.e = cand -%}{%- endif -%}
      {%- endfor -%}
    {%- endif -%}
  {%- endfor -%}
  {{ ns.e }}
{%- endmacro -%}

{# Rohwert oder „—“; nie 0 für unavailable. #}
{%- macro val(dev, suffixes, domain='sensor') -%}
  {%- set e = find(dev, suffixes, domain) | trim -%}
  {%- if e and has_value(e) -%}{{ states(e) }}{%- else -%}—{%- endif -%}
{%- endmacro -%}

{# Zahl mit Geräte-Einheit (oder fester Einheit), deutsches Dezimalkomma. #}
{%- macro num(dev, suffixes, prec=1, unit=None, domain='sensor') -%}
  {%- set e = find(dev, suffixes, domain) | trim -%}
  {%- if e and has_value(e) -%}
    {%- set u = unit if unit is not none else (state_attr(e, 'unit_of_measurement') or '') -%}
    {{- (states(e) | float(0)) | round(prec) | string | replace('.', ',') -}}
    {{- (' ' ~ u) if u else '' -}}
  {%- else -%}—{%- endif -%}
{%- endmacro -%}

{# Binärwert als ja/nein/—. #}
{%- macro bin(dev, suffixes) -%}
  {%- set e = find(dev, suffixes, 'binary_sensor') | trim -%}
  {%- if e and has_value(e) -%}{{ 'ja' if is_state(e, 'on') else 'nein' }}{%- else -%}—{%- endif -%}
{%- endmacro -%}
```

**Regeln:**

1. **Domain ist Pflicht.** `find(..., 'sensor')` verhindert, dass ein `binary_sensor` namens
   `…_verdichter` den Sensor `…_verdichter_starts` überschreibt.
2. **Erster Treffer in Kandidatenreihenfolge.** Spezifischere Suffixe stehen vorn
   (`vorlaufisttemp_wp` vor `vorlauf`).
3. **Exakter Suffix.** `endswith('_aussentemp')` matcht nicht `_aussentemp_sommerbetrieb`.
4. **`has_value()` statt `state != 'unavailable'`.** Deckt auch `unknown` und leere Strings ab.
5. **Keine Einheiten raten.** `num()` nimmt die Einheit aus der Entität; bei lokalen Zählern ist
   genau das wichtig (kWh vs. MWh, Research § 9.3).
6. **Deterministische Sortierung.** `device_entities(dev) | sort`, damit der erste Treffer bei
   mehreren Kandidaten reproduzierbar ist.
7. **Domain bei Nicht-Sensoren explizit setzen.** `num(..., domain='number')` für Sollwerte,
   `val(..., 'select')` für die Betriebsart, `find(..., 'climate')` für den Heizkreis. Der
   Default `sensor` findet diese Entitäten sonst nicht.

### 4.2 Funktionskatalog (kartenrelevant)

Vollständige Liste: Research § 9.2. Diese Tabelle ist die **verbindliche Kandidatenliste** für die
Karten; sie deckt ISG (DE/EN), HTTP und das lokale ESPHome-Gateway ab.

| Funktion | Domain | Suffix-Kandidaten (in dieser Reihenfolge) | Einheit |
|---|---|---|---|
| `aussentemperatur` | sensor | `aussentemp`, `aussentemperatur`, `outside_temperature` | °C |
| `vorlauf_wp` | sensor | `vorlaufisttemp_wp`, `vorlauftemperatur_wp`, `flow_temperature_wp` | °C |
| `vorlauf_gesamt` | sensor | `vorlauftemperatur`, `vorlauftemp`, `flow_temperature` | °C |
| `ruecklauf` | sensor | `ruecklaufisttemp_wp`, `rucklauftemperatur`, `return_temperature` | °C |
| `puffer_ist` | sensor | `pufferisttemperatur`, `ist_temperatur_puffer`, `actual_temperature_buffer` | °C |
| `puffer_soll` | sensor | `puffersolltemperatur`, `soll_temperatur_puffer`, `target_temperature_buffer` | °C |
| `ww_ist` | sensor | `speicheristtemp`, `ist_temperatur_warmwasser`, `actual_temperature_water` | °C |
| `ww_soll` | sensor | `speichersolltemp`, `soll_temperatur_warmwasser`, `target_temperature_water` | °C |
| `hk1_ist` | sensor | `isttemperatur_hk1`, `ist_temperatur_hk_1`, `actual_temperature_hk_1` | °C |
| `hk1_soll` | sensor | `solltemperatur_hk1`, `soll_temperatur_hk_1`, `target_temperature_hk_1` | °C |
| `raum_ist` | sensor | `raumisttemp`, `ist_raumtemperatur_hk_1`, `actual_room_temperature_hk_1` | °C |
| `raum_soll` | sensor | `raumsolltemp`, `soll_raumtemperatur_hk_1`, `target_room_temperature_hk_1` | °C |
| `raumfeuchte` | sensor | `raumfeuchte`, `luftfeuchtigkeit_hk_1`, `actual_humidity_hk_1` | % |
| `taupunkt` | sensor | `taupunkttemp`, `taupunkttemperatur`, `dew_point_temperature` | °C |
| `heizdruck` | sensor | `heizungsdruck`, `heizdruck`, `heater_pressure` | bar |
| `volumenstrom` | sensor | `volumenstrom`, `volume_stream` | l/min |
| `heissgas` | sensor | `heissgastemp`, `heissgastemperatur`, `hot_gas_temperature` | °C |
| `hochdruck` | sensor | `druck_hochdruck`, `hochdruck`, `high_pressure` | bar |
| `niederdruck` | sensor | `druck_niederdruck`, `niederdruck`, `low_pressure` | bar |
| `betriebsart` | select | `programmschalter`, `betriebsart`, `operation_mode` | — |
| `hk1_climate` | climate | `heizkreis_1`, `heat_circuit_1` | °C |
| `komfort_hk1` | number | `komforttemperatur`, `tagbetrieb_temperatursoll_hk_1`, `comfort_temperature_target_hk1` | °C |
| `eco_hk1` | number | `ecotemperatur`, `absenkbetrieb_temperatursoll_hk_1`, `eco_temperature_target_hk1` | °C |
| `heizkurve` | number | `steigung_heizkurve`, `heizkurve_steilheit_hk_1`, `heating_curve_rise_hk1` | — |
| `ww_komfort` | number | `einstell_speichersolltemp`, `tagbetrieb_warmwasser_temperatursoll`, `comfort_water_temperature_target` | °C |
| `ww_eco` | number | `ww_eco_temp`, `absenkbetrieb_warmwasser_temperatursoll`, `eco_water_temperature_target` | °C |
| `bivalenz_hzg` | number/sensor | `bivalenztemperatur_hzg`, `bivalenztemperatur_heizung`, `dualmode_temperature_hzg` | °C |
| `bivalenz_ww` | number | `bivalenztemperatur_warmwasser`, `dualmode_temperature_ww` | °C |
| `sg_ready` | switch | `sg_ready_aktiv`, `sg_ready_active` | — |
| `verdichter` | binary_sensor | `verdichter`, `compressor_on` | — |
| `heizbetrieb` | binary_sensor | `heizbetrieb`, `is_heating` | — |
| `ww_betrieb` | binary_sensor | `warmwasserbetrieb`, `is_heating_boiler` | — |
| `sommerbetrieb` | binary_sensor | `sommerbetrieb`, `is_summer_mode` | — |
| `kuehlbetrieb` | binary_sensor | `kuehlbetrieb`, `is_cooling` | — |
| `abtauung` | binary_sensor | `verdampferabtauung`, `evaporator_defrost` | — |
| `evu_sperre` | binary_sensor | `sperrzeit_evu`, `evu_sperre`, `power_off` | — |
| `fehlerstatus` | binary_sensor | `fehlerstatus`, `stoerung`, `error_status` | — |
| `fehlernummer` | sensor | `aktiver_fehler`, `active_error` | — |
| `hk1_pumpe` | binary_sensor | `heizkreispumpe_1`, `heizkreis_1_pumpe`, `heating_circuit_1_pump` | — |
| `ww_ladepumpe` | binary_sensor | `pufferladepumpe_1`, `warmwasser_ladepumpe`, `dhw_charging_pump` | — |
| `quellenpumpe` | binary_sensor | `quellenpumpe`, `source_pump` | — |
| `nhz` | binary_sensor | `nhz_1`, `nhz_stufen_aktiv`, `nhz_stages_running` | — |
| `heizwaerme_heute` | sensor | `waermeertrag_heiz_tag_summe_kwh`, `erzeugte_heizwarme_heute`, `produced_heating_today` | kWh |
| `heizwaerme_gesamt` | sensor | `waermeertrag_heiz_summe_mwh`, `erzeugte_heizwarme_gesamt`, `produced_heating_total` | kWh/MWh |
| `ww_waerme_heute` | sensor | `waermeertrag_ww_tag_summe_kwh`, `erzeugte_warmwasserwarme_heute`, `produced_water_heating_today` | kWh |
| `ww_waerme_gesamt` | sensor | `waermeertrag_ww_summe_mwh`, `erzeugte_warmwasserwarme_gesamt`, `produced_water_heating_total` | kWh/MWh |
| `strom_heiz_heute` | sensor | `verbrauchte_heizenergie_heute`, `consumed_heating_today` | kWh |
| `strom_heiz_gesamt` | sensor | `el_energieaufnahme_heiz_summe_kwh`, `verbrauchte_heizenergie_gesamt`, `consumed_heating_total` | kWh (lokal ungeprüft) |
| `strom_ww_heute` | sensor | `verbrauchte_warmwasserenergie_heute`, `consumed_water_heating_today` | kWh |
| `strom_ww_gesamt` | sensor | `el_energieaufnahme_ww_summe_kwh`, `verbrauchte_warmwasserenergie_gesamt`, `consumed_water_heating_total` | kWh (lokal ungeprüft) |
| `laufzeit_heiz` | sensor | `laufzeit_vd_heizen`, `verdichter_heizung`, `compressor_heating` | h |
| `laufzeit_ww` | sensor | `laufzeit_vd_warmwasser`, `verdichter_warmwasser`, `compressor_heating_water` | h |
| `verdichterstarts` | sensor | `verdichter_starts`, `verdichterstarts`, `compressor_starts` | — |
| `cop_heiz` | sensor | `effizienz_heizung_letzte_24_h`, `efficiency_heating_1_24_h` | COP |
| `cop_ww` | sensor | `effizienz_warmwasser_letzte_24_h`, `efficiency_dhw_1_24_h` | COP |
| `luftung_stufe` | select | `luftung_lwz_stufe`, `lufterstufe_tag`, `fan_level_comfort` | — |
| `zuluft` | sensor | `zulufttemperatur`, `supply_air_temperature` | °C |
| `abluft` | sensor | `ablufttemperatur`, `extract_air_temperature` | °C |
| `abluftfeuchte` | sensor | `abluftfeuchte`, `abluft_luftfeuchtigkeit`, `extract_air_humidity` | % |

**Nicht** in die Karten aufgenommen: Zeitprogramme, Fehlertexte, Quittieren, Momentan-COP,
Wärmemengen-Summen als COP-Grundlage.

**Domain-Ausnahme:** `bivalenz_hzg` liegt je nach Integration als `number` oder `sensor` vor. Die
Karte ruft beide Domains auf und nimmt den ersten vorhandenen Treffer; alle anderen Funktionen
haben genau eine Domain.

### 4.3 Status-Ampel

Präzedenz (erste zutreffende Zeile gewinnt):

| Zustand | Bedingung | Anzeige |
|---|---|---|
| **Störung** | `fehlerstatus`/`stoerung` = `on` | 🔴 Störung |
| **Keine Daten** | Anker-Entity fehlt oder `has_value()` = false | ⚪ Keine Daten |
| **EVU-Sperre** | `sperrzeit_evu`/`evu_sperre` = `on` | 🟡 EVU-Sperre |
| **Verdichter läuft** | `verdichter` = `on` | 🔵 Verdichter läuft |
| **Bereit** | sonst | 🟢 Bereit |

`Abtauung` und `Sommerbetrieb` werden in der Detailkarte als eigene Zeilen gezeigt, nicht als
Ampelzustand. Es gibt **keine** Zeitverzögerung/Entprellung; ein kurzer EVU-Impuls ist kurz gelb.
Das ist bewusst: das Dashboard zeigt Zustand, keine Historie.

```jinja
{%- macro dot(dev) -%}
  {%- set f = find(dev, ['fehlerstatus', 'stoerung', 'error_status'], 'binary_sensor') | trim -%}
  {%- set o = find(dev, ['aussentemp', 'aussentemperatur', 'outside_temperature'], 'sensor') | trim -%}
  {%- set e = find(dev, ['sperrzeit_evu', 'evu_sperre', 'power_off'], 'binary_sensor') | trim -%}
  {%- set c = find(dev, ['verdichter', 'compressor_on'], 'binary_sensor') | trim -%}
  {%- if f and is_state(f, 'on') -%}🔴
  {%- elif not o or not has_value(o) -%}⚪
  {%- elif e and is_state(e, 'on') -%}🟡
  {%- elif c and is_state(c, 'on') -%}🔵
  {%- else -%}🟢{%- endif -%}
{%- endmacro -%}

{%- macro status_text(dev) -%}
  {%- set s = dot(dev) | trim -%}
  {{- 'Störung' if s == '🔴'
      else ('Keine Daten' if s == '⚪'
      else ('EVU-Sperre' if s == '🟡'
      else ('Verdichter läuft' if s == '🔵' else 'Bereit'))) -}}
{%- endmacro -%}
```

### 4.4 COP und Energie

- **COP ist standardmäßig aus.** Oben in der Detailkarte steht `{% set cop_freigabe = false %}`.
  Nur wenn die Wärmemengenzähler einer Anlage geprüft sind, wird der Block auf `true` gesetzt.
- Bei pail23 ist COP eine **Fenster-Effizienz 24 h/12 M**, kein Momentan-COP. Die Karte labelt
  entsprechend „COP (24 h-Fenster)“.
- Lokal (`waermeertrag_*`, `el_energieaufnahme_*`) werden **nicht** zu COP verrechnet. Die
  Energiezeilen zeigen den Rohwert mit der Einheit der Entität und dem Hinweis „Gerätezähler,
  Einheit ungeprüft“.
- Es werden keine Einheiten umgerechnet (kWh/MWh bleiben, wie die Entität sie liefert).

---

## 5. UI-Struktur

### 5.1 Übersicht (`/stiebel-eltron/uebersicht`)

Zweck: in 5 Sekunden sehen, ob alle Anlagen laufen; pro Anlage die sechs wichtigsten Werte.

```
┌──────────────────────────────────────────────────────────────┐
│  Stiebel Eltron                                              │
│  2 Anlagen · 2 Karten                                        │
│  🟢 Bereit  🔵 Verdichter läuft  🟡 EVU-Sperre               │
│  🔴 Störung  ⚪ Keine Daten                                   │
├──────────────────────────────────────────────────────────────┤
│  🟢 Wärmepumpe Keller                       [Details →]      │
│  Keller · Bereit                                             │
│  ┌──────────────┬──────────────────────────┐                 │
│  │ Außen        │ 7,0 °C                   │                 │
│  │ Vorlauf WP   │ 34,2 °C                  │                 │
│  │ Rücklauf     │ 31,8 °C                  │                 │
│  │ Warmwasser   │ 48,1 / 50,0 °C           │                 │
│  │ Modus        │ Komfort                  │                 │
│  │ Verdichter   │ nein                     │                 │
│  │ Störung      │ nein                     │                 │
│  └──────────────┴──────────────────────────┘                 │
├──────────────────────────────────────────────────────────────┤
│  🔴 Wärmepumpe Garage                       [Details →]      │
│  Garage · Störung                                            │
│  … gleiche Tabelle …                                         │
└──────────────────────────────────────────────────────────────┘
```

- **Kopf:** Zusammenfassung (Anlagenzahl, Ankerzahl, Legende). Kommt aus dem Discovery-Block,
  nicht aus den Karten.
- **Geräteblöcke:** je eine `markdown`-Karte aus `auto-entities`; Statuszeile + 7-Zeilen-Tabelle.
- **Link:** `[Details →](/stiebel-eltron/geraete)` führt auf die Detail-View (alle Anlagen).
- **Mobile:** eine Spalte; Tabelle bleibt lesbar.

### 5.2 Geräte / Detail (`/stiebel-eltron/geraete`)

Zweck: alle Werte einer Anlage, ohne Sprung in die Gerätekonfiguration.

```
┌──────────────────────────────────────────────────────────────┐
│  Geräte                                                      │
├──────────────────────────────────────────────────────────────┤
│  🟢 Wärmepumpe Keller · Keller · Bereit · Gerätemodell       │
│                                                              │
│  Temperaturen                                                │
│  Außen 7,0 │ Vorlauf WP 34,2 │ Vorlauf 35,1 │ Rücklauf 31,8 │
│  Puffer 42,0 / 45,0 │ WW 48,1 / 50,0 │ HK1 29,0 / 30,0      │
│  Raum 21,4 / 21,5 │ Feuchte 48 % │ Taupunkt 9,8 │ 1,8 bar   │
│                                                              │
│  Warmwasser                                                  │
│  Ist 48,1 / Soll 50,0 │ Komfort 55,0 │ Eco 45,0              │
│  Ladepumpe nein │ WW-Wärme heute 4,2 kWh                     │
│                                                              │
│  Betrieb                                                     │
│  Betriebsart Komfort │ HK1 heat / 21,5 °C                    │
│  Komfort 21,5 │ Eco 19,0 │ Heizkurve 1,20 │ Bivalenz -5,0   │
│  SG Ready aus                                                │
│                                                              │
│  Energie                                                     │
│  Heizwärme heute 12,4 kWh │ gesamt 18,2 MWh                  │
│  Strom Heizung heute 3,1 kWh │ gesamt 6,9 kWh ⚠ (Einheit)   │
│  Laufzeit VD Heizung 1.234 h │ WW 456 h │ Starts 5.678      │
│  COP: nicht freigegeben (Wärmemengenzähler ungeprüft)        │
│                                                              │
│  Störungen                                                   │
│  Fehlerstatus nein │ Aktiver Fehler — │ EVU nein             │
│  Abtauung nein │ NHZ nein                                    │
└──────────────────────────────────────────────────────────────┘
```

- Eine **Karte pro Gerät**, erzeugt aus derselben Anker-Liste wie die Übersicht.
- Modell/Hersteller nur anzeigen, wenn `device_attr(dev, 'model')` aussagekräftig ist; ESPHome
  liefert dort `esp32dev`, das ist für Nutzer Rauschen.
- Reihenfolge: Temperaturen → Warmwasser → Betrieb → Energie → Störungen → optionale Diagnose.
- Diagnosewerte (Heißgas, Hoch-/Niederdruck, Inverter) stehen in einer eigenen, eingeklappten
  `<details>`-Sektion **nur wenn vorhanden**. Markdown in `<details>` braucht Leerzeilen nach
  `<summary>`; sonst wird der Inhalt als Rohtext gerendert.
- Fehlernummer als Zahl (`| int`, 0 = keine Störung), nicht über `num` mit Dezimalkomma; Klartext
  und Quittung nur in der Servicewelt (kein Button).
- Kein `water_heater`; Warmwasser ist bewusst eine Gruppe aus `sensor`/`number`.

### 5.3 Bedienung (`/stiebel-eltron/bedienung`)

Zweck: die wenigen Werte ändern, die man im Alltag braucht — ohne YAML pro Gerät.

```
┌──────────────────────────────────────────────────────────────┐
│  Bedienung                                                   │
│  ⚠ Schreibzugriffe gehen direkt an die Anlage.               │
│  ESPHome-CAN: optimistisch, keine Gerätebestätigung.         │
├──────────────────────────────────────────────────────────────┤
│  Betriebsart                                                 │
│  ┌───────────────────────┐ ┌───────────────────────┐         │
│  │ Keller   Komfort  ▾  │ │ Garage   Notbetrieb ▾│         │
│  └───────────────────────┘ └───────────────────────┘         │
├──────────────────────────────────────────────────────────────┤
│  Warmwasser-Soll                                             │
│  ┌───────────────────────┐ ┌───────────────────────┐         │
│  │ Keller   50,0 °C  − +│ │ Garage   50,0 °C  − +│         │
│  └───────────────────────┘ └───────────────────────┘         │
├──────────────────────────────────────────────────────────────┤
│  Heizkreis 1                                                 │
│  ┌───────────────────────┐ ┌───────────────────────┐         │
│  │ Keller  heat  21,5 °C│ │ Garage  heat  20,0 °C│         │
│  └───────────────────────┘ └───────────────────────┘         │
├──────────────────────────────────────────────────────────────┤
│  Heizkurve / Komfort / Eco                                   │
│  … Tile-Karten mit numeric-input …                           │
└──────────────────────────────────────────────────────────────┘
```

- Jede Gruppe ist eine eigene `auto-entities`-Karte; leere Gruppen werden ausgeblendet
  (`show_empty: false`) und zeigen per `else:` einen kurzen Hinweis.
- **Nur lesende Anbindung** (HTTP) → keine Treffer → Hinweis „Diese Anbindung liefert nur Werte;
  Bedienung am Gerät/Servicewelt“.
- Kein Quittieren von Störungen, keine Zeitprogramme, kein SG-Ready-Expertenmodus in v1.
- Schreibwarnung ist Pflicht, weil ESPHome-Writes `optimistic` sind (Research § 7.3).

### 5.4 Navigation

| Von | Nach | Mechanik |
|---|---|---|
| Übersicht-Karte | Geräte | Markdown-Link `/stiebel-eltron/geraete` |
| Geräte-Karte | Bedienung | Markdown-Link `/stiebel-eltron/bedienung` |
| Seitenleiste | alle drei Views | `views:` mit `icon`/`path` |

**Keine Deep-Links pro Gerät.** Markdown entfernt `id`-Attribute (Sanitizer), also gibt es keine
stabilen Anker. Ein Link pro Gerät würde eine Laufzeit-View oder eine Custom-Card voraussetzen
(§ 12).

---

## 6. Karten und Bausteine

### 6.1 Pflicht und optional

| Baustein | Typ | Verwendung | Abhängigkeit | Ausfallverhalten |
|---|---|---|---|---|
| `sections`-View | Bordmittel | Layout aller drei Views | HA ≥ 2024.3 | — |
| `heading` | Bordmittel | Seitentitel/Abschnitte | HA ≥ 2024.3 | Titel fehlt, Inhalt bleibt |
| `markdown` | Bordmittel | Zusammenfassung, Gerätekarten, Detailkarten | keine | Text „—“; Setup-Karte |
| `grid` | Bordmittel | Container für auto-entities | keine | — |
| `tile` | Bordmittel | Betriebsart, Sollwerte, Climate | HA ≥ 2024.10 | Tap öffnet More-Info |
| `tile`-Feature `select-options` | Bordmittel | Modus-Dropdown | HA ≥ 2024.10 | Tap öffnet More-Info |
| `tile`-Feature `numeric-input` | Bordmittel | Sollwerte (−/+) | HA ≥ 2024.10 | Tap öffnet More-Info |
| `tile`-Feature `climate-hvac-modes` | Bordmittel | HK-Modus | HA ≥ 2024.10 | Tap öffnet More-Info |
| `tile`-Feature `target-temperature` | Bordmittel | HK-Sollwert | HA ≥ 2024.10 | Tap öffnet More-Info |
| `entities` | Bordmittel | optionale kompakte Störungsliste | keine | Zeilen fehlen |
| `history-graph` | Bordmittel | optionale Trends (Ausbaustufe) | keine | nur mit festen Entity-IDs |
| **`custom:auto-entities`** | **HACS-Pflicht** | Wiederholung der Geräte- und Bedienkarten | HACS `thomasloven/lovelace-auto-entities` | Karte meldet „Custom element doesn't exist“; Gerätekarten/Bedienung fehlen, Summary bleibt sichtbar |
| `custom:mushroom-template-card` | HACS optional | schönere Gerätekarte (Variante) | Mushroom | nicht in v1 verwendet |
| `custom:apexcharts-card` | HACS optional | COP-/Energieverlauf (Ausbaustufe) | ApexCharts | nicht in v1 verwendet |

**Entscheidung:** In v1 gibt es **genau eine** HACS-Abhängigkeit: `auto-entities`. Mushroom und
ApexCharts sind bereits auf der Zielanlage installiert, werden aber nicht vorausgesetzt. `card-mod`
wird nicht verwendet (keine zusätzliche Abhängigkeit, keine stillen Styles).

Läuft die HA-Instanz global im **YAML-Modus** (`lovelace: mode: yaml`), kann HACS die Ressource
nicht selbst registrieren; dann muss sie einmalig eingetragen werden:

```yaml
lovelace:
  resources:
    - url: /hacsfiles/lovelace-auto-entities/auto-entities.js
      type: module
```

Im **Storage-Modus** (Normalfall) erledigt HACS das beim Installieren.

**Inbetriebnahme in vier Schritten:**

1. `auto-entities` über HACS installieren (Dashboard-Kategorie).
2. Dieses Repository über HACS installieren und die YAML-Dashboard-Datei registrieren.
3. Das Wärmepumpen-Gerät mit `stiebel_eltron` labeln (einmal pro Anlage).
4. Dashboard neu laden; die Karte erscheint. Ein zweites Gerät braucht je nach Anbindung nur den
   zweiten Config Entry (ISG) oder Schritt 3 (ESPHome).

### 6.2 Warum `auto-entities` und nicht eine eigene Karte?

`auto-entities` ist die etablierteste Karte, die aus einem Filter **n Kartenkonfigurationen**
erzeugt. Ihr `options`-Block wird per `process_entity` in jede Kopie gemischt; `this.entity_id`
wird durch die Treffer-Entity ersetzt. Das ist in der auto-entities-README ausdrücklich als
„Entity options“ dokumentiert und im Quellcode (`process_entity.ts`) belegt. Damit kann **eine**
Markdown-Vorlage pro Gerät instanziiert werden, ohne pro Gerät YAML zu schreiben. Eine eigene
JS-Karte wäre mächtiger, würde aber die YAML-only-Architektur des Repos brechen (§ 6.4).

### 6.3 Optionale Komfort-Variante (nicht v1)

Wenn mehr Optik gewünscht ist, kann `includes/cards/uebersicht_karte.yaml` durch eine
`custom:mushroom-template-card` ersetzt werden:

```yaml
type: custom:mushroom-template-card
entity: this.entity_id
primary: "{{ device_attr(device_id(this.entity_id), 'name') }}"
secondary: >-
  {{ states('sensor…') }} °C · {{ … }}
icon: mdi:heat-pump
icon_color: >-
  {% set d = dot(device_id(this.entity_id)) %}…
tap_action:
  action: navigate
  navigation_path: /stiebel-eltron/geraete
```

Voraussetzung: Mushroom installiert; der Anker-Mechanismus bleibt identisch. Diese Variante ist
bewusst **nicht** Default, weil sie eine zweite HACS-Abhängigkeit und ein zusätzliches Template
pro Karte mitbringt, ohne die Funktion zu verbessern.

### 6.4 Verworfene Alternativen

| Alternative | Warum nicht |
|---|---|
| **Eine View pro Gerät, manuell** | Widerspricht „zweites Gerät ohne YAML-Änderung“; jede Anlage müsste dupliziert werden. |
| **`decluttering-card` / `-plus`** | Kann Vorlagen wiederverwenden, aber die Geräte-Entity-Auflösung bleibt beim Aufrufer (Prefix/Entity-IDs) oder verlangt ein zweites HACS-Paket. `auto-entities` deckt den Fall mit einer Abhängigkeit ab. |
| **Custom-JS-Strategy/-Card** | Mächtigste Lösung (echte Views pro Gerät, Deep-Links), aber kein YAML mehr, hoher Wartungsaufwand, widerspricht `docs/architecture.md` (JS ist nur HACS-Struktur-Marker). Für v2 denkbar. |
| **Reines Jinja-Markdown ohne Custom-Card** | Null Abhängigkeiten, aber keine echten Tile-Karten/Bedienelemente und eine sehr große Karte. Bleibt als **Bordmittel-Fallback** dokumentiert (§ 7.3), nicht als Default. |
| **`area_id`-Gruppierung** | Gruppiert Räume, nicht Anlagen; mehrere Pumpen pro Area möglich. |
| **`expand()`** | Verliert die Gerätezugehörigkeit. |

---

## 7. Graceful Degradation

### 7.1 Matrix

| Fall | Erkennung | Anzeige | Kein Fehler? |
|---|---|---|---|
| Keine Wärmepumpe gefunden | `devs | count == 0` | Setup-Karte: Label setzen, Integration prüfen, neu laden | ja |
| Gerät ohne Außentemperatur-Anker | Discovery findet Gerät, `find(anchor)` leer | Zusammenfassung warnt „N Karten fehlen“; Gerät taucht in keiner Karte auf | ja |
| Anker-Entity ohne Gerät | `device_id(this.entity_id)` leer | Karte zeigt „Anker ist keinem Gerät zugeordnet“ | ja |
| Einzelne Funktion fehlt | `find()` liefert `''` | `—` in der Tabelle | ja |
| Entität `unavailable`/`unknown` | `has_value()` false | `—`, Status ggf. ⚪ | ja |
| Nur lesende Integration (HTTP) | keine `select`/`number`-Treffer | Bedienung zeigt Hinweis, keine defekten Karten | ja |
| `0x8000`-Sentinel | pail23 → `unavailable` | `—`; kein „32768 °C“ | ja |
| COP unplausibel | `cop_freigabe = false` | „COP nicht freigegeben“ + Grund | ja |
| Zweites Gerät mit `_2`-Suffix | Device-ID verschieden | eigene Karte; `_2` ist irrelevant | ja |
| Area-Präfix in Entity-ID | Device-Auflösung | eigene Karte; Präfix ist irrelevant | ja |
| Gerät umbenannt | Device-ID bleibt | Karte bleibt; Anzeigename ändert sich | ja |
| Entity hart umbenannt (ohne Suffix) | `find()` leer | `—` + Warnung in der Detailkarte | ja |
| `auto-entities` fehlt | Karte rendert nicht | **harter Fehler** für Gerätekarten und Bedienung; Summary bleibt | nein → README-Pflichtabhängigkeit |
| Mushroom/ApexCharts fehlt | nicht verwendet | — | ja |
| HA < 2024.10 | `tile`/`sections` fehlen | Mindestversion in `hacs.json` prüfen | nein → Versionsanforderung |

### 7.2 Grundsätze

1. **Nie einen Wert erfinden.** `unavailable` → `—`, nicht `0`, nicht `off`, nicht `0 °C`.
2. **Nie eine ganze Karte an einer fehlenden Zeile scheitern lassen.** Zeilen sind unabhängig.
3. **Nie eine Entität annehmen, nur weil ein Präfix passt.** Immer Device + Domain + Suffix.
4. **Sichtbar warnen, nicht still verstecken.** Die Zusammenfassung nennt Geräte ohne Anker und
   Geräte ohne Label; die Detailkarte nennt fehlende Gruppen. Geräte **ohne Anker** werden als
   „ohne Anker“ gezählt, nicht als offline — sonst verfälscht die Ampel die Anlagenzahl.
5. **Schreibkarten nur bei vorhandenen Entitäten.** `show_empty: false` + `else:`-Hinweis.

### 7.3 Bordmittel-Fallback (falls `auto-entities` nicht installiert werden soll)

`dashboards/stiebel_eltron_bordmittel.yaml` (optional, nicht v1-Default) enthält **eine**
Markdown-Karte pro View, die über `for dev in devs` alle Geräte in einer Karte rendert. Damit
funktionieren Übersicht und Detail ohne jede Custom-Card; die Bedienung entfällt bzw. wird durch
einen Link auf die HA-Geräteseite ersetzt (für Admins; Family-Nutzer sehen sie nicht). Dieser
Fallback ist bewusst nicht der Default, weil er keine echten Tile-Karten und keine Inline-Bedienung
bietet — aber er ist die Antwort auf „ich will keine HACS-Frontend-Abhängigkeit“.

---

## 8. Dateiaufteilung im Repository

### 8.1 Baum

```
stiebel-eltron-dashboard/
├── dashboards/
│   ├── stiebel_eltron.yaml              # Root: title + 3 Views (nur !include)
│   ├── includes/
│   │   ├── views/
│   │   │   ├── uebersicht.yaml          # sections-View, max_columns: 2
│   │   │   ├── geraete.yaml             # sections-View, max_columns: 1
│   │   │   └── bedienung.yaml           # sections-View, max_columns: 2
│   │   └── cards/
│   │       ├── zusammenfassung.yaml     # Markdown: Discovery, Zähler, Legende
│   │       ├── uebersicht_liste.yaml    # auto-entities -> uebersicht_karte.yaml
│   │       ├── uebersicht_karte.yaml    # Markdown-Vorlage pro Gerät (kompakt)
│   │       ├── geraete_liste.yaml       # auto-entities -> geraete_karte.yaml
│   │       ├── geraete_karte.yaml       # Markdown-Vorlage pro Gerät (Detail)
│   │       ├── bedienung_hinweis.yaml   # Schreibwarnung
│   │       ├── bedienung_modus.yaml     # auto-entities: select -> tile
│   │       ├── bedienung_climate.yaml   # auto-entities: climate -> tile
│   │       ├── bedienung_warmwasser.yaml# auto-entities: number -> tile
│   │       ├── bedienung_heizung.yaml   # auto-entities: number -> tile
│   │       ├── bedienung_sg_ready.yaml  # auto-entities: switch -> tile
│   │       └── leerzustand.yaml         # Markdown: Setup-Hilfe / else
│   └── templates/
│       ├── jinja/
│       │   ├── discovery.j2             # Discovery-Block (kanonisch)
│       │   ├── resolver.j2              # find/val/num/bin (kanonisch)
│       │   └── status.j2                # dot/status_text (kanonisch)
│       └── decluttering/
│           └── README.md                # optional, v1 ungenutzt
├── dist/                                # HACS: gespiegelte YAML + .js
├── docs/design.md                       # diese Datei
├── scripts/
│   ├── sync_jinja.py                    # templates/jinja -> Karten (--check)
│   ├── sync_dist.py                     # dashboards/ -> dist/ (bestehend)
│   ├── validate.py                      # inkl. !include-Auflösung (erweitern)
│   └── check_ha_parse.py                # HA-Loader (bestehend)
└── hacs.json
```

### 8.2 Wer ist Quelle, wer ist Auslieferung?

| Ebene | Inhalt | Wird ausgeliefert? |
|---|---|---|
| `dashboards/stiebel_eltron.yaml` + `includes/` | Laufzeit-YAML, wird von HA mit `!include` geladen | ja, über `dist/` |
| `dashboards/templates/jinja/` | Makro-Quellen; werden **in** die Karten kopiert | nein (nur im Repo) |
| `dist/` | byte-genaue Spiegelung der YAML aus `dashboards/` + `.js` | ja, HACS |
| `scripts/` | Entwicklung/CI | nein |

`sync_dist.py` spiegelt bereits rekursiv alle `.yaml`/`.yml`; `includes/` wird also mit
ausgeliefert. `.j2`-Dateien bleiben außen vor.

### 8.3 `!include`-Regeln (getestet mit HAs `annotatedyaml`)

- **Mapping include:** `- !include karte.yaml` → die Datei enthält **eine** Karte (Mapping).
- **Listen include:** `cards: !include karten.yaml` → die Datei enthält **eine Liste** von Karten.
  Nicht `cards: [- !include …]` schreiben, sonst entsteht eine verschachtelte Liste.
- **Pfad:** relativ zur **includierenden Datei**, nicht zum Config-Root. Verschachtelte Includes
  funktionieren (Root → View → Card im Test geparst).
- **Laufzeit:** HA lädt YAML-Dashboards mit `load_yaml_dict`; der `!include`-Konstruktor löst
  relativ zur Datei auf. Deshalb funktioniert es auch unter
  `config/www/community/stiebel-eltron-dashboard/`.
- **Validierung:** `scripts/validate.py` muss Includes vor der Strukturprüfung auflösen; sonst
  sieht es an `views:` einen String statt einer Liste. `check_ha_parse.py` kann bleiben, weil es
  den HA-Loader benutzt.

### 8.4 Jinja-Sync statt Copy-Paste

Die Makros stehen **einmal** in `templates/jinja/*.j2`. In den Karten stehen Marker:

```jinja
{# @@SYNC:templates/jinja/resolver.j2@@ #}
… generierter Block …
{# @@END@@ #}
```

`scripts/sync_jinja.py` ersetzt den Block; `--check` schlägt in CI fehl, wenn Karte und Quelle
auseinanderlaufen. Damit gibt es keine „drei Kopien, die irgendwann divergieren“.

### 8.5 Kartenbeispiele

**Root:**

```yaml
title: Stiebel Eltron
views:
  - !include includes/views/uebersicht.yaml
  - !include includes/views/geraete.yaml
  - !include includes/views/bedienung.yaml
```

**Übersichts-View:**

```yaml
title: Übersicht
path: uebersicht
icon: mdi:heat-pump
type: sections
max_columns: 2
sections:
  - type: grid
    cards:
      - !include ../cards/zusammenfassung.yaml
      - !include ../cards/uebersicht_liste.yaml
```

**Geräteliste (Wiederholung):**

```yaml
type: custom:auto-entities
card:
  type: grid
  columns: 1
card_param: cards
unique: entity
show_empty: false
sort:
  method: name
filter:
  include:
    - domain: sensor
      label: stiebel_eltron
      entity_id: '*_aussentemp'
      options: !include uebersicht_karte.yaml
    - domain: sensor
      label: stiebel_eltron
      entity_id: '*_aussentemperatur'
      options: !include uebersicht_karte.yaml
    - domain: sensor
      label: stiebel_eltron
      entity_id: '*_outside_temperature'
      options: !include uebersicht_karte.yaml
    - domain: sensor
      integration: stiebel_eltron_isg
      entity_id: '*_aussentemperatur'
      options: !include uebersicht_karte.yaml
    - domain: sensor
      integration: stiebel_eltron_http
      entity_id: '*_outside_temperature'
      options: !include uebersicht_karte.yaml
    # Optional für Geräte ohne Außentemperatur-Entity:
    # - label: stiebel_anker
    #   options: !include uebersicht_karte.yaml
else: !include leerzustand.yaml
```

`geraete_liste.yaml` ist identisch aufgebaut, verwendet aber `geraete_karte.yaml` als `options`
und `columns: 1`; der `else`-Zweig zeigt dieselbe Setup-Karte.

**Gerätekarte (Auszug, `uebersicht_karte.yaml`):**

```yaml
type: markdown
content: |
  {%- macro find(dev, suffixes, domain) -%}…{%- endmacro -%}
  {%- macro val(dev, suffixes, domain='sensor') -%}…{%- endmacro -%}
  {%- macro num(dev, suffixes, prec=1, unit=None, domain='sensor') -%}…{%- endmacro -%}
  {%- macro bin(dev, suffixes) -%}…{%- endmacro -%}
  {%- macro dot(dev) -%}…{%- endmacro -%}
  {%- macro status_text(dev) -%}…{%- endmacro -%}
  {%- set dev = device_id(this.entity_id) -%}
  {%- if dev -%}
  ### {{ dot(dev) }} {{ device_attr(dev, 'name') }}
  {{ area_name(this.entity_id) }} · **{{ status_text(dev) }}**

  | Kennzahl | Wert |
  |---|---|
  | Außen | {{ num(dev, ['aussentemp','aussentemperatur','outside_temperature'], 1) }} |
  | Vorlauf WP | {{ num(dev, ['vorlaufisttemp_wp','vorlauftemperatur_wp','flow_temperature_wp'], 1) }} |
  | Rücklauf | {{ num(dev, ['ruecklaufisttemp_wp','rucklauftemperatur','return_temperature'], 1) }} |
  | Warmwasser | {{ num(dev, ['speicheristtemp','ist_temperatur_warmwasser','actual_temperature_water'], 1) }} / {{ num(dev, ['speichersolltemp','soll_temperatur_warmwasser','target_temperature_water'], 1) }} |
  | Modus | {{ val(dev, ['programmschalter','betriebsart','operation_mode'], 'select') }} |
  | Verdichter | {{ bin(dev, ['verdichter','compressor_on']) }} |
  | Störung | {{ bin(dev, ['fehlerstatus','stoerung','error_status']) }} |

  [Details →](/stiebel-eltron/geraete)
  {%- else -%}
  _Anker-Entity ist keinem Gerät zugeordnet._
  {%- endif -%}
```

**Bedienung (Auszug):**

```yaml
type: custom:auto-entities
card:
  type: grid
  columns: 2
card_param: cards
unique: entity
show_empty: false
filter:
  include:
    - domain: select
      label: stiebel_eltron
      entity_id: '*programmschalter'
      options:
        type: tile
        features:
          - type: select-options
            style: dropdown
    - domain: select
      label: stiebel_eltron
      entity_id: '*betriebsart'
      options:
        type: tile
        features:
          - type: select-options
            style: dropdown
else:
  type: markdown
  content: '_Keine Betriebsart-Entität gefunden._'
```

Für ISG ohne Geräte-Label je Gruppe zusätzlich dieselben Muster mit
`integration: stiebel_eltron_isg` aufnehmen; `unique: entity` dedupliziert. Für `number`-Gruppen
dieselbe Struktur mit `options: {type: tile, features: [{type: numeric-input, style: buttons}]}`
und den Sollwert-Mustern (`*komforttemperatur`, `*ecotemperatur`, `*steigung_heizkurve`,
`*einstell_speichersolltemp`, `*ww_eco_temp` lokal; `*tagbetrieb_temperatursoll_hk_1`,
`*absenkbetrieb_temperatursoll_hk_1`, `*heizkurve_steilheit_hk_1`,
`*tagbetrieb_warmwasser_temperatursoll` bei pail23).

### 8.6 Validierung und CI

| Schritt | Werkzeug | Prüft |
|---|---|---|
| Makro-Sync | `sync_jinja.py --check` | Kartenblock == `templates/jinja/*.j2` |
| Struktur | `validate.py` (erweitert) | Includes aufgelöst, `views` nicht leer, Karten haben `type`, auto-entities hat `filter` |
| Dist-Sync | `sync_dist.py --check` | `dist/` == `dashboards/` |
| YAML-Stil | `yamllint` | Einrückung, Tabs, Duplikate; **`line-length` für `dashboards/includes/cards/` großzügiger** (Jinja-Zeilen) |
| HA-Loader | `check_ha_parse.py` | `load_yaml_dict` inkl. Includes, README-Snippet |
| HACS | `hacs/action` | Kategorie `plugin`, Struktur |

---

## 9. Zweites Gerät: was genau passiert

### 9.1 ISG-Anlage (pail23)

1. Zweites ISG ins LAN, zweiter Config Entry in `stiebel_eltron_isg`.
2. Die Integration legt ein zweites Gerät an (Unique ID = MAC) und Entitäten mit `_2`-Suffix an,
   z. B. `sensor.stiebel_eltron_wpmsystem_aussentemperatur_2`.
3. `integration_entities('stiebel_eltron_isg')` liefert beide Geräte; `device_id()` trennt sie.
4. Der Anker-Filter `integration: stiebel_eltron_isg` + `entity_id: '*_aussentemperatur'` trifft
   die neue Außentemperatur-Entity.
5. `auto-entities` erzeugt eine zweite Markdown-Karte; `device_id(this.entity_id)` zeigt auf das
   zweite Gerät; alle Resolver laufen mit dessen Entitäten.
6. **Keine YAML-Änderung.** Das `_2` im Entity-Namen stört nicht, weil nicht danach gesucht wird.

### 9.2 ESPHome-Anlage

1. Zweiter ESP32-Node (oder zweites Gerät im selben Node) erscheint in HA.
2. Gerät mit `stiebel_eltron` labeln (einmalig, 2 Klicks).
3. Der Label-Filter `label: stiebel_eltron` + `entity_id: '*_aussentemp'` trifft die neue
   Außentemperatur-Entity.
4. Zweite Karte erscheint; die Discovery-Zusammenfassung zählt zwei Anlagen.

### 9.3 Warum `_2` und Area-Präfixe nichts kaputt machen

| Variante | Entity-ID | Device-ID | Resolver |
|---|---|---|---|
| Zweites Gerät | `sensor.…_aussentemperatur_2` | neu | `device_entities(neu)` findet `…_aussentemperatur_2` |
| Area-Präfix | `number.keller_…_can_scan_start` | gleich | `device_entities(gleich)` findet sie |
| Umbenannt | `sensor.meine_wp_aussen` | gleich | Suffix `aussen` nicht im Katalog → `—`; optional Katalog erweitern |
| Altinstallation | `sensor.stiebel_eltron_isg_…` | gleich | Suffix matcht, Präfix egal |

### 9.4 Akzeptanz-Nachweis

Die Implementierung gilt als akzeptiert, wenn:

- mit einer simulierten zweiten Anlage (zweiter Anker, zweiter Device) **ohne YAML-Änderung** eine
  zweite Karte in Übersicht und Geräte erscheint;
- die Discovery-Zusammenfassung „2 Anlagen“ zählt;
- eine fehlende KPI in der zweiten Karte `—` zeigt, nicht die Werte der ersten;
- die Bedienung für die zweite Anlage eigene Tiles zeigt (sofern schreibbar).

---

## 10. Schreibzugriffe und Sicherheit

| Anbindung | Schreiben | Verhalten | Dashboard-Hinweis |
|---|---|---|---|
| pail23 / ISG | ja | Holding-Register, Bereichsprüfung, Gerätebestätigung | „Schreibt direkt auf die Anlage“ |
| ESPHome / CAN | ja | `optimistic: true`, keine Bestätigung | **deutliche** Warnung; nur alltägliche Sollwerte, keine Frostschutz-/Sicherheitsparameter |
| HTTP / pmq | nein | read-only | „Nur lesend; Bedienung am Gerät/Servicewelt“ |
| Core `modbus` (eigene YAML) | ja | rohe Register, keine Bereichsprüfung | nicht Teil des Dashboards |
| Störung quittieren | nein | nur Servicewelt | kein Button |

Weitere Regeln:

- **Keine Zeitprogramme** abbilden (nicht als Entität vorhanden).
- **Kein `water_heater`** erfinden; Warmwasser bleibt `number` + `sensor`.
- **Keine automatischen Änderungen** an Sollwerten durch das Dashboard (keine Automation im
  Repo). Das Dashboard ist Anzeige + manuelle Bedienung.
- **Keine Writes beim Laden**; nur explizite Tap-/Slider-Aktionen.

---

## 11. Performance und Grenzen

| Thema | Verhalten | Grenze |
|---|---|---|
| Discovery | `integration_entities` + Signatur-Scoring, einmal pro Render | im Live-Test ohne spürbare Verzögerung; harte Messung offen |
| Karten | eine Markdown-Karte pro Gerät; Resolver läuft pro Karte | n ≤ 10 unkritisch; > 10 wird die Seite lang |
| Markdown-Größe | HA bricht bei 262 144 Zeichen ab | mit Whitespace-Kontrolle und Detailtabellen weit darunter; bei n > 15 prüfen |
| Aktualisierung | Markdown/Jinja reagiert auf State-Änderungen; Device-Registry-Änderungen (neues Gerät) evtl. erst nach Reload | neues Gerät: Seite neu laden |
| Polling | pail23 30 s, HTTP 60 s, ESPHome sekundlich (bei Funk lückenhaft) | Dashboard zeigt Lücken als `—`/⚪, nicht als 0 |
| Verlauf | v1 keine Charts | Ausbaustufe mit `history-graph`/ApexCharts pro Gerät (statische Entity-IDs) |
| Barrierefreiheit | Emoji + Text („Störung“), nicht nur Farbe | gut |

---

## 12. Offene Punkte

1. **Keine echten Views pro Gerät.** Lovelace kann zur Laufzeit keine Views erzeugen. Die
   „Detailseite pro Gerät“ ist eine Karte pro Gerät auf **einer** View. Echte Deep-Links
   (`/stiebel-eltron/geraet/<id>`) brauchen eine Custom-Strategy oder ein JS-Dashboard — bewusst
   nicht v1.
2. **`auto-entities` ist Pflicht.** Fehlt die Ressource, fehlen Gerätekarten und Bedienung; nur
   die Summary-Karte bleibt. Das ist eine harte Installationsvoraussetzung, keine
   Entity-Degradation. README muss sie prominent nennen; ein Bordmittel-Fallback ist als optionale
   Datei skizziert (§ 7.3), nicht implementiert.
3. **Anker-Entity pro Gerät.** Geräte ohne Außentemperatur-Entität bekommen keine automatische
   Karte. Lösung: Entity mit `stiebel_anker` labeln und den optionalen Filter aktivieren. Noch
   nicht automatisiert.
4. **Label-Vergabe ist manuell.** `stiebel_eltron` am Gerät ist ein UI-Schritt. Ohne Label greifen
   die Integrationsfilter (ISG) bzw. die Signatur (ESPHome), aber die Kartenwiederholung für
   ESPHome braucht das Label. Ein Setup-Skript, das Labels per WebSocket setzt, ist nicht Teil von
   v1.
5. **WPM4 ↔ pail23 Modell-ID 449** ist unbestätigt (Research § 11). Das Dashboard zeigt nur
   vorhandene Entitäten; ob ein ISG die erwarteten Werte liefert, muss vor dem Kauf geklärt werden.
6. **Lokales Gateway war während des Designs `unavailable`.** Die Karte zeigt korrekt ⚪/„—“;
   Ursache (ESP32, Page-Cache, Funk) ist nicht Teil dieses Tasks und ohne Diagnose nicht angefasst.
7. **Research-Tabelle weicht ab:** Dort steht `sensor.esp32_poe_technik_aussentemp`; live heißt die
   Entity `sensor.heatingpump_aussentemp`. Der Resolver fängt beides, die Doku sollte korrigiert
   werden.
8. **COP/Energie lokal ungeklärt.** Einheit `el_energieaufnahme_*_summe_kwh` und Wärmemengen sind
   unplausibel. COP bleibt aus; Energie wird roh mit Geräte-Einheit gezeigt. Vor einer
   COP-Freigabe müssen Zähler/Fühler geprüft werden.
9. **Select-Optionen sind sprachabhängig.** `Komfort`/`Eco` vs. `Comfort`/`Eco` werden unverändert
   angezeigt und durchgereicht. Keine Übersetzungstabelle in v1.
10. **`auto-entities`-Verhalten `this.entity_id`** ist dokumentiert und im Quellcode belegt, aber
    nicht visuell auf der Zielanlage getestet (Ressource dort nicht installiert). Die
    Implementierung muss es mit einer Testkarte verifizieren; bei einem Major-Update von
    auto-entities erneut prüfen.
11. **Markdown-Sanitizer** entfernt `id`/`style`/`class`. Keine Anker, kein CSS-Feintuning. Die
    Optik bleibt bewusst bordmittelnah; Mushroom ist die optionale Eskalation.
12. **Geräte mit zwei Außentemperatur-Entitäten** (`*_aussentemp` und `*_aussentemperatur`)
    erzeugen zwei Karten. Im Bestand nicht beobachtet; Filter bei Bedarf einschränken.
13. **HA-Mindestversion 2024.10** deckt `sections`/`tile`/`select-options` ab; `hacs.json` bei
    Nutzung neuerer Features im selben PR anheben.
14. **HTTP-Integration legt Binärsensoren ggf. in der Sensor-Domain an** (Research § 4.5); der
    Resolver fragt `binary_sensor` ab und zeigt sonst `—`. Im Zielsystem verifizieren.
15. **Core-Integration `stiebel_eltron` (nur LWZ)** hat eine einzelne `climate`-Entität und keinen
    Außentemperatur-Anker; sie wird in der Discovery gefunden, bekommt aber keine Karte. Eine
    eigene LWZ-Climate-Karte ist eine mögliche Ausbaustufe, kein v1-Ziel.

---

## 13. Akzeptanz-Mapping

| Kriterium aus t_aa58d507 | Umsetzung | Nachweis |
|---|---|---|
| Namenskonvention pro Gerät | § 2: Device-ID als Identität, Label `stiebel_eltron`, optionale Präfix-Empfehlung | Tabelle + Live-Test |
| Automatische Geräteerkennung | § 3: Label → Integration → Signatur; kein Prefix, kein `area_id` | Getesteter Discovery-Block |
| Übersichtsseite (alle Geräte, KPIs, Ampel) | § 5.1 + § 8.5 | Wireframe + Kartenbeispiel |
| Detailseite pro Gerät | § 5.2: eine Karte pro Gerät auf `geraete`-View | Wireframe + `auto-entities`-Mechanik |
| Karten/Bausteine + Abhängigkeiten | § 6: Bordmittel + `auto-entities`; Mushroom/Apex optional | Tabelle |
| Graceful Degradation | § 7: Matrix, `—`/⚪, Setup-Karte, COP-Flag | Matrix |
| Dateiaufteilung | § 8: Root + `includes/` + `templates/` + `scripts/` | Baum + Include-Regeln |
| Zweites Gerät ohne Duplizieren | § 9: zweiter Anker → zweite Karte, keine YAML-Änderung | Ablauf + Akzeptanzkriterien |
| Offene Punkte explizit | § 12 | 15 Punkte |

---

## 14. Anhang: getestete Bausteine

### 14.1 Discovery (Kurzfassung, live gerendert)

```jinja
{%- set ns = namespace(devs=[]) -%}
{%- for d in label_devices('stiebel_eltron') -%}
  {%- if d not in ns.devs -%}{%- set ns.devs = ns.devs + [d] -%}{%- endif -%}
{%- endfor -%}
{%- for dom in ['stiebel_eltron_isg','stiebel_eltron_http','stiebel_eltron'] -%}
  {%- for e in integration_entities(dom) -%}
    {%- set d = device_id(e) -%}
    {%- if d and d not in ns.devs -%}{%- set ns.devs = ns.devs + [d] -%}{%- endif -%}
  {%- endfor -%}
{%- endfor -%}
```

Ergebnis lokal: `label_devices` = `[]`, `integration_entities` = `[]`; der vollständige Block aus
§ 3.3 (inkl. Signatur-Fallback) liefert 1 Gerät (ESP32-PoE Technik, 120 Entities).

### 14.2 Resolver (live gerendert)

Für `device_id = 1b33e9b1…` (ESP32-PoE Technik) lieferte der Resolver:

| Funktion | Gefundene Entity |
|---|---|
| Außentemperatur | `sensor.heatingpump_aussentemp` |
| Vorlauf WP | `sensor.esp32_poe_technik_vorlaufisttemp_wp` |
| Rücklauf | `sensor.esp32_poe_technik_ruecklaufisttemp_wp` |
| WW Ist | `sensor.heatingpump_speicheristtemp` |
| WW Soll | `sensor.heatingpump_speichersolltemp` |
| Modus | `select.esp32_poe_technik_programmschalter` |
| Störung | `binary_sensor.esp32_poe_technik_stoerung` |
| Verdichter | `binary_sensor.esp32_poe_technik_verdichter` |
| EVU | `binary_sensor.esp32_poe_technik_evu_sperre` |
| Strom Heizung gesamt | `sensor.esp32_poe_technik_el_energieaufnahme_heiz_summe_kwh` |
| Wärme Heizung gesamt | `sensor.esp32_poe_technik_waermeertrag_heiz_summe_mwh` |

Das belegt: **ein Gerät, zwei verschiedene Präfixe, alle Funktionen gefunden.** Genau das ist der
Mehrgeräte-Fall, den ein präfixbasiertes Dashboard nicht könnte.

### 14.3 Zustand `unavailable`

Während des Tests war das Gateway `unavailable`. Die Karte rendert:

```
⚪ ESP32-PoE Technik
Keller · Keine Daten
| Außen | — °C |
| Vorlauf WP | — °C |
…
```

Kein `0`, kein `unknown`, kein Fehler. Das ist die geforderte Degradation.

### 14.4 `!include`

Mit HAs eigenem Loader (`annotatedyaml`) geparst:

```
root.yaml
  └─ views: !include includes/views/v.yaml
       └─ cards: !include ../cards/c.yaml
```

Ergebnis: `{'views': [{'title': 'A', 'cards': [[{'type': 'markdown', ...}]]}]}` — das ist die
**verschachtelte** Variante (`cards: [- !include …]`), also der Stolperstein. Richtig für mehrere
Karten ist `cards: !include karten.yaml`; dann steht die Liste direkt in `cards`.

---

## 15. Implementierungsnotizen (v0.2.0)

Diese Abweichungen vom Design sind bewusst und im Code umgesetzt. Sie gehören
hierher, nicht als stiller Sonderfall in die YAML.

1. **`this.entity_id` muss in Jinja in Anführungszeichen stehen.** auto-entities
   ersetzt den Text `this.entity_id` per `JSON.stringify(...).replace(...)`
   (`src/process_entity.ts`). Aus `device_id(this.entity_id)` wird damit
   `device_id(sensor.x)` — ein Jinja-Syntaxfehler. Richtig ist
   `device_id('this.entity_id')`; nach der Ersetzung steht dort ein String-Literal.
   Das Design-Beispiel §8.5 war an dieser Stelle nicht lauffähig.
2. **Resolver nimmt domain-vorgefilterte Entity-Listen** statt `dev`:
   `pick(sens, F.ww_ist)` mit `sens = device_entities(dev) | select('match','^sensor\\.')`.
   Grund: pro Detailkarte werden ~40 Funktionen aufgelöst; ein Lookup je Aufruf
   wäre unnötig teuer. Der Funktionskatalog liegt als vierte Datei
   `templates/jinja/functions.j2` (ein `F`-Dict) vor, damit Übersicht und
   Detailkarte dieselben Kandidaten nutzen.
3. **Duplikatsuffix `_2`/`_3` wird toleriert.** HA hängt ihn bei einem zweiten
   Config Entry an die Entity-ID (`…_aussentemperatur_2`). Eine reine
   `endswith('_aussentemperatur')`-Prüfung und der Glob `*_aussentemperatur`
   würden die zweite Anlage übersehen. Der Resolver akzeptiert
   `_<funktion>_<zahl>`, die auto-entities-Filter nutzen dafür einen Regex
   (`'/_(…)(_[0-9]+)?$/'`).
4. **Ein Regex-Filter statt neun Glob-Filter.** Drei Namensvarianten × drei
   Quellen (Label/ISG/HTTP) wären neun Include-Einträge je Liste; die
   `or:`-Regel von auto-entities plus ein Regex deckt dasselbe ab und bleibt
   lesbar.
5. **`stiebel_anker`-Label ist nicht aktiv.** Es ist im Design als Option für
   Geräte ohne Außentemperatur-Entität vorgesehen (§8.5). Ohne zusätzliche
   Logik würde ein gelabelter Anker bei einem Gerät mit Außentemperatur eine
   **zweite** Karte erzeugen. v0.2.0 nutzt deshalb nur Suffix-Anker und nennt
   Geräte ohne Anker in der Zusammenfassung.
6. **Die Zusammenfassung nennt Anlagen ohne Karte.** Ein per Signatur erkanntes
   Gerät ohne Label bekommt keine Karte (die ESPHome-Filter brauchen das Label).
   Statt es still fehlen zu lassen, zählt und benennt die Übersicht diese Geräte
   und nennt den nächsten Schritt.
7. **Kein `gauge`, keine Diagramme.** Die Karten bleiben bei `markdown`, `tile`,
   `grid`, `heading` und `sections`; nur `auto-entities` ist Pflicht-HACS.
8. **Mindestversion bleibt 2024.10.** `max_columns` gibt es seit 2024.4, die
   `heading`-Karte seit 2024.10, `select-options`/`numeric-input` seit 2024.10.
9. **Energie und COP** wie in §4.4: Rohwerte mit Geräte-Einheit, kein COP aus
   Wärmemengenzählern. Eine von der Anlage selbst gelieferte 24-h-Effizienz
   erscheint nur im eingeklappten Diagnoseblock und ist als „Anlagenangabe“
   gekennzeichnet.

Verifikation (siehe `scripts/render_test.py`, 65 Prüfungen): zwei Anlagen mit
unterschiedlichen Präfixen ergeben zwei Karten mit getrennten Werten; fehlende
Werte werden „—“; ein `unavailable`-Gateway ergibt ⚪/„Keine Daten“; die Lüftung
wird nicht als Wärmepumpe erkannt; eine HTTP-Anlage bekommt Karten, aber keine
Bedien-Tiles. Zusätzlich wurde der Discovery-/Resolver-Block live gegen eine
HA-2026.11-Instanz gerendert (`sensor.heatingpump_aussentemp` → 5,1 °C,
`…_vorlaufisttemp_wp` → 29,8 °C, Modus „Komfort“).

*Ende des Designs.*
