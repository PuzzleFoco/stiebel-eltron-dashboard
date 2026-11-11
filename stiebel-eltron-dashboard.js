/*
 * stiebel-eltron-dashboard.js -- GENERIERT, NICHT BEARBEITEN.
 * Quelle: dashboards/ + scripts/strategy_runtime.js
 * Bauen: python scripts/build_strategy.py
 * Version: 0.4.2
 *
 * HACS-Kategorie Dashboard (plugin). Registriert die Lovelace-
 * Dashboard-Strategie `custom:stiebel-eltron`.
 */

const DASHBOARD_CONFIG = {
 "title": "Stiebel Eltron",
 "views": [
  {
   "title": "Übersicht",
   "path": "uebersicht",
   "icon": "mdi:heat-pump",
   "type": "sections",
   "max_columns": 2,
   "sections": [
    {
     "type": "grid",
     "cards": [
      {
       "type": "markdown",
       "content": "{# @@SYNC:templates/jinja/resolver.j2@@ #}\n{#- Entity-Resolver — Quelle: templates/jinja/resolver.j2 (sync_jinja.py).\n    Vertrag: docs/design.md §4. `ents` = domain-vorgefilterte entity_ids, Suffixe in\n    Prioritätsreihenfolge, exakter Suffix (plus `_2`/`_3`), fehlend/unavailable → „—“.\n-#}\n\n{#- Suffix-Treffer inkl. HA-Duplikatsuffix (_2, _3 …) nach dem Funktionsnamen. -#}\n{%- macro suffix_hit(cand, s) -%}\n  {%- set tail = cand.split('.')[-1] -%}\n  {%- if tail == s or tail.endswith('_' ~ s) -%}1\n  {%- elif ('_' ~ s ~ '_') in tail and ((tail.split('_' ~ s ~ '_')[-1]) | int(-1)) >= 0 -%}1\n  {%- endif -%}\n{%- endmacro -%}\n\n{#- Erste Entität, deren Objekt-ID auf einen der Suffixe endet. Leerstring, wenn keine. -#}\n{%- macro pick(ents, suffixes) -%}\n  {%- set ns = namespace(e='') -%}\n  {%- for s in suffixes -%}\n    {%- if not ns.e -%}\n      {%- for cand in ents -%}\n        {%- if not ns.e and s in cand and suffix_hit(cand, s) | trim -%}\n          {%- set ns.e = cand -%}\n        {%- endif -%}\n      {%- endfor -%}\n    {%- endif -%}\n  {%- endfor -%}\n  {{- ns.e -}}\n{%- endmacro -%}\n\n{#- \"1\", wenn eine passende Entität existiert — für `{% if has(...) | trim %}`. -#}\n{%- macro has(ents, suffixes) -%}\n  {%- if pick(ents, suffixes) | trim -%}1{%- endif -%}\n{%- endmacro -%}\n\n{#- Rohzustand oder „—“; `unavailable`, `unknown` und leer werden zu „—“ (nicht 0). -#}\n{%- macro val_e(e) -%}\n  {%- if e and has_value(e) -%}{{ states(e) }}{%- else -%}—{%- endif -%}\n{%- endmacro -%}\n\n{%- macro val(ents, suffixes) -%}{{- val_e(pick(ents, suffixes) | trim) -}}{%- endmacro -%}\n\n{#- Plausibilität je Einheit. Fängt die 0x8000-Sentinels der Anlage ab\n    (z. B. -3276,8 °C für „nicht verfügbar“), die sonst als Messwert erschienen.\n    Grenzen sind physikalisch großzügig: Heizungswasser bleibt zwischen -60 und 150 °C. -#}\n{%- macro plausible(f, u) -%}\n  {%- if u == '°C' -%}{{ 1 if -60 <= f <= 150 else 0 }}\n  {%- elif u == '%' -%}{{ 1 if 0 <= f <= 100 else 0 }}\n  {%- elif u == 'bar' -%}{{ 1 if 0 <= f <= 40 else 0 }}\n  {%- else -%}1{%- endif -%}\n{%- endmacro -%}\n\n{#- Tabellenzeile, die nur erscheint, wenn die Anlage die Größe überhaupt hat.\n    `exists` ist die Verkettung von has(...)-Aufrufen; leer = Zeile weglassen. -#}\n{%- macro mrow(label, value, exists) -%}\n{%- if exists | trim %}{{ '\\n' }}| {{ label }} | {{ value }} |{% endif -%}\n{%- endmacro -%}\n\n{#- Zahl mit Geräte-Einheit, deutsches Dezimalkomma (7,0 °C). Keine Umrechnung.\n    Unplausible Werte (Sentinels) werden wie fehlende Werte zu „—“ (nicht 0). -#}\n{%- macro num_e(e, prec=1, unit=none) -%}\n  {%- if e and has_value(e) -%}\n    {%- set u = unit if unit is not none else (state_attr(e, 'unit_of_measurement') or '') -%}\n    {%- set f = states(e) | float(0) -%}\n    {%- if plausible(f, u) | trim != '1' -%}\n      {{- '—' -}}\n    {%- else -%}\n      {%- if prec > 0 -%}\n        {#-  \"%.1f\" | format(x) ist der HA-übliche Weg; der Punkt wird zum Komma.  -#}\n        {{- (('%.' ~ prec ~ 'f') | format(f)) | replace('.', ',') -}}\n      {%- else -%}\n        {{- f | round(0) | int -}}\n      {%- endif -%}\n      {%- if u -%}{{- ('' if u == '%' else ' ') ~ u -}}{%- endif -%}\n    {%- endif -%}\n  {%- else -%}\n    {{- '—' -}}\n  {%- endif -%}\n{%- endmacro -%}\n\n{%- macro num(ents, suffixes, prec=1, unit=none) -%}\n  {{- num_e(pick(ents, suffixes) | trim, prec, unit) -}}\n{%- endmacro -%}\n\n{#- Zwei Zahlen als „Ist / Soll“ — hält die Kartenzeilen kurz. -#}\n{%- macro pair(ents, a, b, prec=1) -%}\n  {{- (num(ents, a, prec) | trim) ~ ' / ' ~ (num(ents, b, prec) | trim) -}}\n{%- endmacro -%}\n\n{#- Ganzzahl ohne Dezimalkomma (Starts, Laufzeiten, Fehlernummer). -#}\n{%- macro ints(ents, suffixes) -%}\n  {%- set e = pick(ents, suffixes) | trim -%}\n  {%- if e and has_value(e) -%}{{ states(e) | int(0) }}{%- else -%}—{%- endif -%}\n{%- endmacro -%}\n\n{#- Binärwert als ja/nein/—. -#}\n{%- macro bin(ents, suffixes) -%}\n  {%- set e = pick(ents, suffixes) | trim -%}\n  {%- if e and has_value(e) -%}{{ 'ja' if is_state(e, 'on') else 'nein' }}{%- else -%}—{%- endif -%}\n{%- endmacro -%}\n\n{#- Einheit der gefundenen Entität (leer, wenn keine) — für Hinweise/Einheitenprüfung. -#}\n{%- macro unit_of(ents, suffixes) -%}\n  {%- set e = pick(ents, suffixes) | trim -%}\n  {%- if e -%}{{ state_attr(e, 'unit_of_measurement') or '' }}{%- endif -%}\n{%- endmacro -%}\n{# @@END@@ #}\n{# @@SYNC:templates/jinja/discovery.j2@@ #}\n{#- Discovery — Quelle: templates/jinja/discovery.j2 (sync_jinja.py).\n    Label → Stiebel-Integration → Signatur ≥ 3 (ESPHome) → Fallback über alle Geräte.\n    Setzt ns.n_devs, ns.n_cards, ns.n_nocard, ns.n_noanchor, ns.rows, ns.nocards, ns.noanchor.\n    Details: docs/design.md §3.\n-#}\n{%- set ns = namespace(devs=[], label=[], integ=[]) -%}\n{%- set anchor_suffixes = ['aussentemp', 'aussentemperatur', 'outside_temperature'] -%}\n{%- set sig = ['aussentemp', 'aussentemperatur', 'outdoor_temperature',\n               'vorlaufisttemp_wp', 'speicheristtemp', 'programmschalter', 'verdichter'] -%}\n\n{#- 1. Explizites Label am Gerät: vertrauen, ohne Signaturprüfung. -#}\n{%- set label_devs = label_devices('stiebel_eltron') -%}\n{%- for d in label_devs -%}\n  {%- if d and d not in ns.devs -%}{%- set ns.devs = ns.devs + [d] -%}{%- endif -%}\n{%- endfor -%}\n{%- set ns.label = label_devs -%}\n\n{#- 2. Stiebel-Integrationen: Geräte vertrauen (auch ein LWZ mit nur einer climate-Entität). -#}\n{%- for dom in ['stiebel_eltron_isg', 'stiebel_eltron_http', 'stiebel_eltron'] -%}\n  {%- for e in integration_entities(dom) -%}\n    {%- set d = device_id(e) -%}\n    {%- if d -%}\n      {%- if dom in ['stiebel_eltron_isg', 'stiebel_eltron_http'] and d not in ns.integ -%}\n        {%- set ns.integ = ns.integ + [d] -%}\n      {%- endif -%}\n      {%- if d not in ns.devs -%}{%- set ns.devs = ns.devs + [d] -%}{%- endif -%}\n    {%- endif -%}\n  {%- endfor -%}\n{%- endfor -%}\n\n{#- 3./4. Kandidaten der Signaturprüfung: erst ESPHome, im Leerfall alle Geräte. -#}\n{%- set cand = namespace(ids=[]) -%}\n{%- for e in integration_entities('esphome') -%}\n  {%- set d = device_id(e) -%}\n  {%- if d and d not in cand.ids -%}{%- set cand.ids = cand.ids + [d] -%}{%- endif -%}\n{%- endfor -%}\n{%- if ns.devs | count == 0 -%}\n  {%- for s in states -%}\n    {%- set d = device_id(s.entity_id) -%}\n    {%- if d and d not in cand.ids -%}{%- set cand.ids = cand.ids + [d] -%}{%- endif -%}\n  {%- endfor -%}\n{%- endif -%}\n{%- for d in cand.ids -%}\n  {%- if d not in ns.devs -%}\n    {%- set hits = namespace(l=[]) -%}\n    {%- for e in device_entities(d) | sort -%}\n      {%- for x in sig -%}\n        {%- if e.endswith('_' ~ x) and x not in hits.l -%}{%- set hits.l = hits.l + [x] -%}{%- endif -%}\n      {%- endfor -%}\n    {%- endfor -%}\n    {%- if hits.l | count >= 3 -%}{%- set ns.devs = ns.devs + [d] -%}{%- endif -%}\n  {%- endif -%}\n{%- endfor -%}\n\n{#- Anzeigeliste: Name, Bereich, Anker, Kartenfähigkeit. -#}\n{%- set lst = namespace(rows=[], nocards=[], noanchor=[]) -%}\n{%- for d in ns.devs -%}\n  {%- set ents = device_entities(d) | sort -%}\n  {%- set sens = ents | select('match', '^sensor\\\\.') | list -%}\n  {%- set anchor = pick(sens, anchor_suffixes) | trim -%}\n  {%- set nm = device_attr(d, 'name_by_user') or device_attr(d, 'name') or d -%}\n  {%- set area = (area_name(anchor) if anchor else (area_name(ents[0]) if ents else none)) or '—' -%}\n  {%- set carded = (d in ns.label) or (d in ns.integ) -%}\n  {%- set lst.rows = lst.rows + [{'name': nm, 'area': area, 'anchor': anchor, 'carded': carded}] -%}\n  {%- if anchor -%}\n    {%- if not carded -%}{%- set lst.nocards = lst.nocards + [nm] -%}{%- endif -%}\n  {%- else -%}\n    {%- set lst.noanchor = lst.noanchor + [nm] -%}\n  {%- endif -%}\n{%- endfor -%}\n\n{%- set ns.rows = lst.rows | sort(attribute='name') -%}\n{%- set ns.nocards = lst.nocards -%}\n{%- set ns.noanchor = lst.noanchor -%}\n{%- set ns.n_devs = lst.rows | count -%}\n{%- set ns.n_nocard = lst.nocards | count -%}\n{%- set ns.n_noanchor = lst.noanchor | count -%}\n{%- set ns.n_anchor = ns.n_devs - ns.n_noanchor -%}\n{%- set ns.n_cards = ns.n_anchor - ns.n_nocard -%}\n{# @@END@@ #}\n## Stiebel Eltron\n\n{% if ns.n_devs > 0 %}\n**{{ ns.n_devs }} {{ 'Anlage' if ns.n_devs == 1 else 'Anlagen' }}** erkannt · {{ ns.n_cards }} {{ 'Karte' if ns.n_cards == 1 else 'Karten' }} · {{ ns.n_anchor }} mit Außentemperatur-Anker\n\n🟢 Bereit · 🔵 Verdichter läuft · 🟡 EVU-Sperre · 🔴 Störung · ⚪ Keine Daten\n\n{% if ns.n_nocard > 0 %}\n> ⚠️ **{{ ns.n_nocard }} Anlage(n) ohne Karte:** {{ ns.nocards | join(', ') }}. Es fehlt das Geräte-Label `stiebel_eltron` (Einstellungen → Geräte & Dienste → Geräte → Label). Ohne Label greifen nur die Integrationsfilter (ISG/HTTP); ESPHome-Geräte brauchen es.\n{% endif %}\n{% if ns.n_noanchor > 0 %}\n> ℹ️ **Ohne Anker:** {{ ns.noanchor | join(', ') }} — keine `*_aussentemp`, `*_aussentemperatur` oder `*_outside_temperature`-Entität gefunden. Diese Anlagen werden nicht als Karte angezeigt.\n{% endif %}\n\n[Alle Geräte →](/stiebel-eltron/geraete) · [Bedienung →](/stiebel-eltron/bedienung)\n\n<details>\n<summary>Anlagen erkannt, aber keine Karte sichtbar?</summary>\n\n- **Nur YAML-Variante:** Ist `custom:auto-entities` installiert? HACS → Dashboard → Suche `auto-entities` → Herunterladen. Die HACS-Strategie (`custom:stiebel-eltron`) braucht diese Karte nicht – sie löst die Karten selbst auf.\n- **Gerät gelabelt?** Einstellungen → Geräte & Dienste → Geräte → Gerät öffnen → Label `stiebel_eltron` setzen.\n- **Geräte-Registry geändert?** Nach dem Anlegen oder Umbenennen eines Geräts die Seite neu laden (Lovelace liest das Geräteregister beim Rendern).\n\n</details>\n{% else %}\n_Noch keine Wärmepumpe erkannt — die Einrichtungshilfe steht in der Karte darunter._\n{% endif %}\n"
      }
     ]
    },
    {
     "type": "grid",
     "cards": [
      {
       "type": "heading",
       "heading": "Anlagen",
       "heading_style": "title",
       "icon": "mdi:heat-pump"
      },
      {
       "type": "custom:auto-entities",
       "card": {
        "type": "grid",
        "columns": 1,
        "square": false
       },
       "card_param": "cards",
       "unique": "entity",
       "show_empty": false,
       "sort": {
        "method": "device",
        "ignore_case": true
       },
       "filter": {
        "include": [
         {
          "domain": "sensor",
          "entity_id": "/_(aussentemp|aussentemperatur|outside_temperature)(_[0-9]+)?$/",
          "or": [
           {
            "label": "stiebel_eltron"
           },
           {
            "integration": "stiebel_eltron_isg"
           },
           {
            "integration": "stiebel_eltron_http"
           }
          ],
          "options": {
           "type": "markdown",
           "content": "{# @@SYNC:templates/jinja/resolver.j2@@ #}\n{#- Entity-Resolver — Quelle: templates/jinja/resolver.j2 (sync_jinja.py).\n    Vertrag: docs/design.md §4. `ents` = domain-vorgefilterte entity_ids, Suffixe in\n    Prioritätsreihenfolge, exakter Suffix (plus `_2`/`_3`), fehlend/unavailable → „—“.\n-#}\n\n{#- Suffix-Treffer inkl. HA-Duplikatsuffix (_2, _3 …) nach dem Funktionsnamen. -#}\n{%- macro suffix_hit(cand, s) -%}\n  {%- set tail = cand.split('.')[-1] -%}\n  {%- if tail == s or tail.endswith('_' ~ s) -%}1\n  {%- elif ('_' ~ s ~ '_') in tail and ((tail.split('_' ~ s ~ '_')[-1]) | int(-1)) >= 0 -%}1\n  {%- endif -%}\n{%- endmacro -%}\n\n{#- Erste Entität, deren Objekt-ID auf einen der Suffixe endet. Leerstring, wenn keine. -#}\n{%- macro pick(ents, suffixes) -%}\n  {%- set ns = namespace(e='') -%}\n  {%- for s in suffixes -%}\n    {%- if not ns.e -%}\n      {%- for cand in ents -%}\n        {%- if not ns.e and s in cand and suffix_hit(cand, s) | trim -%}\n          {%- set ns.e = cand -%}\n        {%- endif -%}\n      {%- endfor -%}\n    {%- endif -%}\n  {%- endfor -%}\n  {{- ns.e -}}\n{%- endmacro -%}\n\n{#- \"1\", wenn eine passende Entität existiert — für `{% if has(...) | trim %}`. -#}\n{%- macro has(ents, suffixes) -%}\n  {%- if pick(ents, suffixes) | trim -%}1{%- endif -%}\n{%- endmacro -%}\n\n{#- Rohzustand oder „—“; `unavailable`, `unknown` und leer werden zu „—“ (nicht 0). -#}\n{%- macro val_e(e) -%}\n  {%- if e and has_value(e) -%}{{ states(e) }}{%- else -%}—{%- endif -%}\n{%- endmacro -%}\n\n{%- macro val(ents, suffixes) -%}{{- val_e(pick(ents, suffixes) | trim) -}}{%- endmacro -%}\n\n{#- Plausibilität je Einheit. Fängt die 0x8000-Sentinels der Anlage ab\n    (z. B. -3276,8 °C für „nicht verfügbar“), die sonst als Messwert erschienen.\n    Grenzen sind physikalisch großzügig: Heizungswasser bleibt zwischen -60 und 150 °C. -#}\n{%- macro plausible(f, u) -%}\n  {%- if u == '°C' -%}{{ 1 if -60 <= f <= 150 else 0 }}\n  {%- elif u == '%' -%}{{ 1 if 0 <= f <= 100 else 0 }}\n  {%- elif u == 'bar' -%}{{ 1 if 0 <= f <= 40 else 0 }}\n  {%- else -%}1{%- endif -%}\n{%- endmacro -%}\n\n{#- Tabellenzeile, die nur erscheint, wenn die Anlage die Größe überhaupt hat.\n    `exists` ist die Verkettung von has(...)-Aufrufen; leer = Zeile weglassen. -#}\n{%- macro mrow(label, value, exists) -%}\n{%- if exists | trim %}{{ '\\n' }}| {{ label }} | {{ value }} |{% endif -%}\n{%- endmacro -%}\n\n{#- Zahl mit Geräte-Einheit, deutsches Dezimalkomma (7,0 °C). Keine Umrechnung.\n    Unplausible Werte (Sentinels) werden wie fehlende Werte zu „—“ (nicht 0). -#}\n{%- macro num_e(e, prec=1, unit=none) -%}\n  {%- if e and has_value(e) -%}\n    {%- set u = unit if unit is not none else (state_attr(e, 'unit_of_measurement') or '') -%}\n    {%- set f = states(e) | float(0) -%}\n    {%- if plausible(f, u) | trim != '1' -%}\n      {{- '—' -}}\n    {%- else -%}\n      {%- if prec > 0 -%}\n        {#-  \"%.1f\" | format(x) ist der HA-übliche Weg; der Punkt wird zum Komma.  -#}\n        {{- (('%.' ~ prec ~ 'f') | format(f)) | replace('.', ',') -}}\n      {%- else -%}\n        {{- f | round(0) | int -}}\n      {%- endif -%}\n      {%- if u -%}{{- ('' if u == '%' else ' ') ~ u -}}{%- endif -%}\n    {%- endif -%}\n  {%- else -%}\n    {{- '—' -}}\n  {%- endif -%}\n{%- endmacro -%}\n\n{%- macro num(ents, suffixes, prec=1, unit=none) -%}\n  {{- num_e(pick(ents, suffixes) | trim, prec, unit) -}}\n{%- endmacro -%}\n\n{#- Zwei Zahlen als „Ist / Soll“ — hält die Kartenzeilen kurz. -#}\n{%- macro pair(ents, a, b, prec=1) -%}\n  {{- (num(ents, a, prec) | trim) ~ ' / ' ~ (num(ents, b, prec) | trim) -}}\n{%- endmacro -%}\n\n{#- Ganzzahl ohne Dezimalkomma (Starts, Laufzeiten, Fehlernummer). -#}\n{%- macro ints(ents, suffixes) -%}\n  {%- set e = pick(ents, suffixes) | trim -%}\n  {%- if e and has_value(e) -%}{{ states(e) | int(0) }}{%- else -%}—{%- endif -%}\n{%- endmacro -%}\n\n{#- Binärwert als ja/nein/—. -#}\n{%- macro bin(ents, suffixes) -%}\n  {%- set e = pick(ents, suffixes) | trim -%}\n  {%- if e and has_value(e) -%}{{ 'ja' if is_state(e, 'on') else 'nein' }}{%- else -%}—{%- endif -%}\n{%- endmacro -%}\n\n{#- Einheit der gefundenen Entität (leer, wenn keine) — für Hinweise/Einheitenprüfung. -#}\n{%- macro unit_of(ents, suffixes) -%}\n  {%- set e = pick(ents, suffixes) | trim -%}\n  {%- if e -%}{{ state_attr(e, 'unit_of_measurement') or '' }}{%- endif -%}\n{%- endmacro -%}\n{# @@END@@ #}\n{# @@SYNC:templates/jinja/status.j2@@ #}\n{#-\n  Status-Ampel — kanonische Quelle: templates/jinja/status.j2\n  Wird von scripts/sync_jinja.py in die Karten kopiert. Nicht in den Karten ändern.\n  Setzt die Makros aus resolver.j2 voraus (pick, has_value, is_state).\n-#}\n\n{#- Ampel in fester Präzedenz: Störung > Keine Daten > EVU-Sperre > Verdichter > Bereit. -#}\n{%- macro dot(sens, bsens) -%}\n  {%- set f = pick(bsens, ['fehlerstatus', 'stoerung', 'error_status']) | trim -%}\n  {%- set o = pick(sens, ['aussentemp', 'aussentemperatur', 'outside_temperature']) | trim -%}\n  {%- set evu = pick(bsens, ['sperrzeit_evu', 'evu_sperre', 'power_off']) | trim -%}\n  {%- set c = pick(bsens, ['verdichter', 'compressor_on']) | trim -%}\n  {%- if f and is_state(f, 'on') -%}🔴\n  {%- elif not o or not has_value(o) -%}⚪\n  {%- elif evu and is_state(evu, 'on') -%}🟡\n  {%- elif c and is_state(c, 'on') -%}🔵\n  {%- else -%}🟢{%- endif -%}\n{%- endmacro -%}\n\n{#- Klartext zur Ampel — Farbe ist nie die einzige Information (Barrierefreiheit). -#}\n{%- macro status_text(sens, bsens) -%}\n  {%- set s = dot(sens, bsens) | trim -%}\n  {{- 'Störung' if s == '🔴'\n      else ('Keine Daten' if s == '⚪'\n      else ('EVU-Sperre' if s == '🟡'\n      else ('Verdichter läuft' if s == '🔵' else 'Bereit'))) -}}\n{%- endmacro -%}\n{# @@END@@ #}\n{# @@SYNC:templates/jinja/functions.j2@@ #}\n{#- Funktionskatalog — Quelle: templates/jinja/functions.j2 (sync_jinja.py).\n    F.<funktion> = Suffix-Kandidaten in Prioritätsreihenfolge. Quelle: docs/design.md §4.2.\n-#}\n{%- set F = {\n  'aussen': ['aussentemp', 'aussentemperatur', 'outside_temperature'],\n  'vorlauf_wp': ['vorlaufisttemp_wp', 'vorlauftemperatur_wp', 'flow_temperature_wp'],\n  'vorlauf': ['vorlauftemperatur', 'vorlauftemp', 'flow_temperature'],\n  'ruecklauf': ['ruecklaufisttemp_wp', 'rucklauftemperatur', 'return_temperature'],\n  'puffer_ist': ['pufferisttemperatur', 'ist_temperatur_puffer', 'actual_temperature_buffer'],\n  'puffer_soll': ['puffersolltemperatur', 'soll_temperatur_puffer', 'target_temperature_buffer'],\n  'ww_ist': ['speicheristtemp', 'ist_temperatur_warmwasser', 'actual_temperature_water'],\n  'ww_soll': ['speichersolltemp', 'soll_temperatur_warmwasser', 'target_temperature_water'],\n  'hk1_ist': ['isttemperatur_hk1', 'ist_temperatur_hk_1', 'actual_temperature_hk_1'],\n  'hk1_soll': ['solltemperatur_hk1', 'soll_temperatur_hk_1', 'target_temperature_hk_1'],\n  'raum_ist': ['raumisttemp', 'ist_raumtemperatur_hk_1', 'actual_room_temperature_hk_1'],\n  'raum_soll': ['raumsolltemp', 'soll_raumtemperatur_hk_1', 'target_room_temperature_hk_1'],\n  'raumfeuchte': ['raumfeuchte', 'luftfeuchtigkeit_hk_1', 'actual_humidity_hk_1'],\n  'taupunkt': ['taupunkttemp', 'taupunkttemperatur', 'dew_point_temperature'],\n  'heizdruck': ['heizungsdruck', 'heizdruck', 'heater_pressure'],\n  'volumenstrom': ['volumenstrom', 'volume_stream'],\n  'heissgas': ['heissgastemp', 'heissgastemperatur', 'hot_gas_temperature'],\n  'hochdruck': ['druck_hochdruck', 'hochdruck', 'high_pressure'],\n  'niederdruck': ['druck_niederdruck', 'niederdruck', 'low_pressure'],\n  'betriebsart': ['programmschalter', 'betriebsart', 'operation_mode'],\n  'hk1_climate': ['heizkreis_1', 'heat_circuit_1'],\n  'komfort': ['komforttemperatur', 'tagbetrieb_temperatursoll_hk_1', 'comfort_temperature_target_hk1'],\n  'eco': ['ecotemperatur', 'absenkbetrieb_temperatursoll_hk_1', 'eco_temperature_target_hk1'],\n  'heizkurve': ['steigung_heizkurve', 'heizkurve_steilheit_hk_1', 'heating_curve_rise_hk1'],\n  'ww_komfort': ['einstell_speichersolltemp', 'tagbetrieb_warmwasser_temperatursoll', 'comfort_water_temperature_target'],\n  'ww_eco': ['ww_eco_temp', 'absenkbetrieb_warmwasser_temperatursoll', 'eco_water_temperature_target'],\n  'bivalenz_hzg': ['bivalenztemperatur_hzg', 'bivalenztemperatur_heizung', 'dualmode_temperature_hzg'],\n  'bivalenz_ww': ['bivalenztemperatur_warmwasser', 'dualmode_temperature_ww'],\n  'sg_ready': ['sg_ready_aktiv', 'sg_ready_active'],\n  'verdichter': ['verdichter', 'compressor_on'],\n  'heizbetrieb': ['heizbetrieb', 'is_heating'],\n  'ww_betrieb': ['warmwasserbetrieb', 'is_heating_boiler'],\n  'sommerbetrieb': ['sommerbetrieb', 'is_summer_mode'],\n  'kuehlbetrieb': ['kuehlbetrieb', 'is_cooling'],\n  'abtauung': ['verdampferabtauung', 'evaporator_defrost'],\n  'evu': ['sperrzeit_evu', 'evu_sperre', 'power_off'],\n  'fehler': ['fehlerstatus', 'stoerung', 'error_status'],\n  'fehlernr': ['aktiver_fehler', 'active_error'],\n  'hk1_pumpe': ['heizkreispumpe_1', 'heizkreis_1_pumpe', 'heating_circuit_1_pump'],\n  'ww_ladepumpe': ['pufferladepumpe_1', 'warmwasser_ladepumpe', 'dhw_charging_pump'],\n  'quellenpumpe': ['quellenpumpe', 'source_pump'],\n  'nhz': ['nhz_1', 'nhz_stufen_aktiv', 'nhz_stages_running'],\n  'heizwaerme_heute': ['waermeertrag_heiz_tag_summe_kwh', 'erzeugte_heizwarme_heute', 'produced_heating_today'],\n  'heizwaerme_gesamt': ['waermeertrag_heiz_summe_mwh', 'erzeugte_heizwarme_gesamt', 'produced_heating_total'],\n  'ww_waerme_heute': ['waermeertrag_ww_tag_summe_kwh', 'erzeugte_warmwasserwarme_heute', 'produced_water_heating_today'],\n  'ww_waerme_gesamt': ['waermeertrag_ww_summe_mwh', 'erzeugte_warmwasserwarme_gesamt', 'produced_water_heating_total'],\n  'strom_heiz_heute': ['verbrauchte_heizenergie_heute', 'consumed_heating_today'],\n  'strom_heiz_gesamt': ['el_energieaufnahme_heiz_summe_kwh', 'verbrauchte_heizenergie_gesamt', 'consumed_heating_total'],\n  'strom_ww_heute': ['verbrauchte_warmwasserenergie_heute', 'consumed_water_heating_today'],\n  'strom_ww_gesamt': ['el_energieaufnahme_ww_summe_kwh', 'verbrauchte_warmwasserenergie_gesamt', 'consumed_water_heating_total'],\n  'laufzeit_heiz': ['laufzeit_vd_heizen', 'verdichter_heizung', 'compressor_heating'],\n  'laufzeit_ww': ['laufzeit_vd_warmwasser', 'verdichter_warmwasser', 'compressor_heating_water'],\n  'starts': ['verdichter_starts', 'verdichterstarts', 'compressor_starts'],\n  'cop_heiz': ['effizienz_heizung_letzte_24_h', 'efficiency_heating_1_24_h'],\n  'cop_ww': ['effizienz_warmwasser_letzte_24_h', 'efficiency_dhw_1_24_h']\n} -%}\n{# @@END@@ #}\n{%- set dev = device_id('this.entity_id') -%}\n{%- set all = device_entities(dev) | sort if dev else [] -%}\n{%- set sens = all | select('match', '^sensor\\\\.') | list -%}\n{%- set bsens = all | select('match', '^binary_sensor\\\\.') | list -%}\n{%- set sels = all | select('match', '^select\\\\.') | list -%}\n{% if dev %}\n### {{ dot(sens, bsens) | trim }} {{ device_attr(dev, 'name_by_user') or device_attr(dev, 'name') or 'Wärmepumpe' }}\n\n{{ area_name('this.entity_id') or area_name(dev) or '—' }} · **{{ status_text(sens, bsens) | trim }}**{% if device_attr(dev, 'model') and device_attr(dev, 'model') not in ['esp32dev', 'ESP32', 'esp32', 'esp32s3'] %} · {{ device_attr(dev, 'model') }}{% endif %}\n\n| Kennzahl | Wert |\n|---|---|\n| Außen | {{ num(sens, F.aussen, 1) }} |\n| Vorlauf WP | {{ num(sens, F.vorlauf_wp, 1) }} |\n| Rücklauf | {{ num(sens, F.ruecklauf, 1) }} |\n| Warmwasser | {{ num(sens, F.ww_ist, 1) }} / {{ num(sens, F.ww_soll, 1) }} |\n| Modus | {{ val(sels, F.betriebsart) }} |\n| Verdichter | {{ bin(bsens, F.verdichter) }} |\n| Störung | {{ bin(bsens, F.fehler) }} |\n\n[Details →](/stiebel-eltron/geraete) · [Bedienung →](/stiebel-eltron/bedienung)\n{% else %}\n_Anker-Entität `{{ 'this.entity_id' }}` ist keinem Gerät zugeordnet. Die Karte bleibt sichtbar, damit der Fehler nicht still verschwindet._\n{% endif %}\n"
          }
         }
        ]
       },
       "else": {
        "type": "markdown",
        "content": "## Keine Wärmepumpe gefunden\n\nDieses Dashboard hat in deinem Home Assistant keine Anlage erkannt. Es ist **kein Fehler der YAML** — die Karten warten auf ein Gerät. Drei Wege führen zum Ziel:\n\n### 1. Label setzen (ESPHome / MQTT / Modbus)\n\nEinstellungen → **Geräte & Dienste** → **Geräte** → deine Wärmepumpe öffnen → **Label** → `stiebel_eltron` anlegen und zuweisen. Danach diese Seite neu laden.\n\n### 2. Integration nutzen (ISG / HTTP)\n\nLäuft die Anlage über **Stiebel Eltron ISG** (`stiebel_eltron_isg`) oder **Stiebel Eltron HTTP** (`stiebel_eltron_http`), wird ihr Gerät ohne Label erkannt. Prüfe, ob der Config Entry geladen ist (Einstellungen → Geräte & Dienste).\n\n### 3. Signatur prüfen (automatische Erkennung)\n\nOhne Label erkennt das Dashboard ein Gerät, wenn es mindestens **drei** dieser Merkmale als Entitäten hat:\n\n`*_aussentemp` / `*_aussentemperatur` / `*_outside_temperature`,\n`*_vorlaufisttemp_wp`, `*_speicheristtemp`, `*_programmschalter`, `*_verdichter`\n\nZusätzlich braucht jede Karte eine **Außentemperatur-Entität** als Anker — sie verbindet Karte und Gerät.\n\n<details>\n<summary>Warum kein fester Entity-Präfix?</summary>\n\nEntity-IDs entstehen aus Gerätename und lokalisiertem Entitätsnamen. Sie ändern sich mit Sprache, Umbenennung, Area und einem zweiten Gerät (`_2`).\nLokal heißen die Entitäten sogar innerhalb eines Geräts unterschiedlich\n(`sensor.heatingpump_aussentemp` und `sensor.esp32_poe_technik_vorlaufisttemp_wp`).\n\nDas Dashboard sucht deshalb **Funktion + Gerät** (Device-ID) statt Präfix + Name. Details: `docs/design.md` im Repository.\n\n</details>\n\n_Das ist die Bordmittel-Karte; sie erscheint nur, solange keine Anlage erkannt wird._\n"
       }
      }
     ]
    }
   ]
  },
  {
   "title": "Geräte",
   "path": "geraete",
   "icon": "mdi:heat-pump-outline",
   "type": "sections",
   "max_columns": 1,
   "sections": [
    {
     "type": "grid",
     "cards": [
      {
       "type": "heading",
       "heading": "Alle Anlagen",
       "heading_style": "title",
       "icon": "mdi:format-list-bulleted"
      },
      {
       "type": "custom:auto-entities",
       "card": {
        "type": "grid",
        "columns": 1,
        "square": false
       },
       "card_param": "cards",
       "unique": "entity",
       "show_empty": false,
       "sort": {
        "method": "device",
        "ignore_case": true
       },
       "filter": {
        "include": [
         {
          "domain": "sensor",
          "entity_id": "/_(aussentemp|aussentemperatur|outside_temperature)(_[0-9]+)?$/",
          "or": [
           {
            "label": "stiebel_eltron"
           },
           {
            "integration": "stiebel_eltron_isg"
           },
           {
            "integration": "stiebel_eltron_http"
           }
          ],
          "options": {
           "type": "markdown",
           "content": "{# @@SYNC:templates/jinja/resolver.j2@@ #}\n{#- Entity-Resolver — Quelle: templates/jinja/resolver.j2 (sync_jinja.py).\n    Vertrag: docs/design.md §4. `ents` = domain-vorgefilterte entity_ids, Suffixe in\n    Prioritätsreihenfolge, exakter Suffix (plus `_2`/`_3`), fehlend/unavailable → „—“.\n-#}\n\n{#- Suffix-Treffer inkl. HA-Duplikatsuffix (_2, _3 …) nach dem Funktionsnamen. -#}\n{%- macro suffix_hit(cand, s) -%}\n  {%- set tail = cand.split('.')[-1] -%}\n  {%- if tail == s or tail.endswith('_' ~ s) -%}1\n  {%- elif ('_' ~ s ~ '_') in tail and ((tail.split('_' ~ s ~ '_')[-1]) | int(-1)) >= 0 -%}1\n  {%- endif -%}\n{%- endmacro -%}\n\n{#- Erste Entität, deren Objekt-ID auf einen der Suffixe endet. Leerstring, wenn keine. -#}\n{%- macro pick(ents, suffixes) -%}\n  {%- set ns = namespace(e='') -%}\n  {%- for s in suffixes -%}\n    {%- if not ns.e -%}\n      {%- for cand in ents -%}\n        {%- if not ns.e and s in cand and suffix_hit(cand, s) | trim -%}\n          {%- set ns.e = cand -%}\n        {%- endif -%}\n      {%- endfor -%}\n    {%- endif -%}\n  {%- endfor -%}\n  {{- ns.e -}}\n{%- endmacro -%}\n\n{#- \"1\", wenn eine passende Entität existiert — für `{% if has(...) | trim %}`. -#}\n{%- macro has(ents, suffixes) -%}\n  {%- if pick(ents, suffixes) | trim -%}1{%- endif -%}\n{%- endmacro -%}\n\n{#- Rohzustand oder „—“; `unavailable`, `unknown` und leer werden zu „—“ (nicht 0). -#}\n{%- macro val_e(e) -%}\n  {%- if e and has_value(e) -%}{{ states(e) }}{%- else -%}—{%- endif -%}\n{%- endmacro -%}\n\n{%- macro val(ents, suffixes) -%}{{- val_e(pick(ents, suffixes) | trim) -}}{%- endmacro -%}\n\n{#- Plausibilität je Einheit. Fängt die 0x8000-Sentinels der Anlage ab\n    (z. B. -3276,8 °C für „nicht verfügbar“), die sonst als Messwert erschienen.\n    Grenzen sind physikalisch großzügig: Heizungswasser bleibt zwischen -60 und 150 °C. -#}\n{%- macro plausible(f, u) -%}\n  {%- if u == '°C' -%}{{ 1 if -60 <= f <= 150 else 0 }}\n  {%- elif u == '%' -%}{{ 1 if 0 <= f <= 100 else 0 }}\n  {%- elif u == 'bar' -%}{{ 1 if 0 <= f <= 40 else 0 }}\n  {%- else -%}1{%- endif -%}\n{%- endmacro -%}\n\n{#- Tabellenzeile, die nur erscheint, wenn die Anlage die Größe überhaupt hat.\n    `exists` ist die Verkettung von has(...)-Aufrufen; leer = Zeile weglassen. -#}\n{%- macro mrow(label, value, exists) -%}\n{%- if exists | trim %}{{ '\\n' }}| {{ label }} | {{ value }} |{% endif -%}\n{%- endmacro -%}\n\n{#- Zahl mit Geräte-Einheit, deutsches Dezimalkomma (7,0 °C). Keine Umrechnung.\n    Unplausible Werte (Sentinels) werden wie fehlende Werte zu „—“ (nicht 0). -#}\n{%- macro num_e(e, prec=1, unit=none) -%}\n  {%- if e and has_value(e) -%}\n    {%- set u = unit if unit is not none else (state_attr(e, 'unit_of_measurement') or '') -%}\n    {%- set f = states(e) | float(0) -%}\n    {%- if plausible(f, u) | trim != '1' -%}\n      {{- '—' -}}\n    {%- else -%}\n      {%- if prec > 0 -%}\n        {#-  \"%.1f\" | format(x) ist der HA-übliche Weg; der Punkt wird zum Komma.  -#}\n        {{- (('%.' ~ prec ~ 'f') | format(f)) | replace('.', ',') -}}\n      {%- else -%}\n        {{- f | round(0) | int -}}\n      {%- endif -%}\n      {%- if u -%}{{- ('' if u == '%' else ' ') ~ u -}}{%- endif -%}\n    {%- endif -%}\n  {%- else -%}\n    {{- '—' -}}\n  {%- endif -%}\n{%- endmacro -%}\n\n{%- macro num(ents, suffixes, prec=1, unit=none) -%}\n  {{- num_e(pick(ents, suffixes) | trim, prec, unit) -}}\n{%- endmacro -%}\n\n{#- Zwei Zahlen als „Ist / Soll“ — hält die Kartenzeilen kurz. -#}\n{%- macro pair(ents, a, b, prec=1) -%}\n  {{- (num(ents, a, prec) | trim) ~ ' / ' ~ (num(ents, b, prec) | trim) -}}\n{%- endmacro -%}\n\n{#- Ganzzahl ohne Dezimalkomma (Starts, Laufzeiten, Fehlernummer). -#}\n{%- macro ints(ents, suffixes) -%}\n  {%- set e = pick(ents, suffixes) | trim -%}\n  {%- if e and has_value(e) -%}{{ states(e) | int(0) }}{%- else -%}—{%- endif -%}\n{%- endmacro -%}\n\n{#- Binärwert als ja/nein/—. -#}\n{%- macro bin(ents, suffixes) -%}\n  {%- set e = pick(ents, suffixes) | trim -%}\n  {%- if e and has_value(e) -%}{{ 'ja' if is_state(e, 'on') else 'nein' }}{%- else -%}—{%- endif -%}\n{%- endmacro -%}\n\n{#- Einheit der gefundenen Entität (leer, wenn keine) — für Hinweise/Einheitenprüfung. -#}\n{%- macro unit_of(ents, suffixes) -%}\n  {%- set e = pick(ents, suffixes) | trim -%}\n  {%- if e -%}{{ state_attr(e, 'unit_of_measurement') or '' }}{%- endif -%}\n{%- endmacro -%}\n{# @@END@@ #}\n{# @@SYNC:templates/jinja/status.j2@@ #}\n{#-\n  Status-Ampel — kanonische Quelle: templates/jinja/status.j2\n  Wird von scripts/sync_jinja.py in die Karten kopiert. Nicht in den Karten ändern.\n  Setzt die Makros aus resolver.j2 voraus (pick, has_value, is_state).\n-#}\n\n{#- Ampel in fester Präzedenz: Störung > Keine Daten > EVU-Sperre > Verdichter > Bereit. -#}\n{%- macro dot(sens, bsens) -%}\n  {%- set f = pick(bsens, ['fehlerstatus', 'stoerung', 'error_status']) | trim -%}\n  {%- set o = pick(sens, ['aussentemp', 'aussentemperatur', 'outside_temperature']) | trim -%}\n  {%- set evu = pick(bsens, ['sperrzeit_evu', 'evu_sperre', 'power_off']) | trim -%}\n  {%- set c = pick(bsens, ['verdichter', 'compressor_on']) | trim -%}\n  {%- if f and is_state(f, 'on') -%}🔴\n  {%- elif not o or not has_value(o) -%}⚪\n  {%- elif evu and is_state(evu, 'on') -%}🟡\n  {%- elif c and is_state(c, 'on') -%}🔵\n  {%- else -%}🟢{%- endif -%}\n{%- endmacro -%}\n\n{#- Klartext zur Ampel — Farbe ist nie die einzige Information (Barrierefreiheit). -#}\n{%- macro status_text(sens, bsens) -%}\n  {%- set s = dot(sens, bsens) | trim -%}\n  {{- 'Störung' if s == '🔴'\n      else ('Keine Daten' if s == '⚪'\n      else ('EVU-Sperre' if s == '🟡'\n      else ('Verdichter läuft' if s == '🔵' else 'Bereit'))) -}}\n{%- endmacro -%}\n{# @@END@@ #}\n{# @@SYNC:templates/jinja/functions.j2@@ #}\n{#- Funktionskatalog — Quelle: templates/jinja/functions.j2 (sync_jinja.py).\n    F.<funktion> = Suffix-Kandidaten in Prioritätsreihenfolge. Quelle: docs/design.md §4.2.\n-#}\n{%- set F = {\n  'aussen': ['aussentemp', 'aussentemperatur', 'outside_temperature'],\n  'vorlauf_wp': ['vorlaufisttemp_wp', 'vorlauftemperatur_wp', 'flow_temperature_wp'],\n  'vorlauf': ['vorlauftemperatur', 'vorlauftemp', 'flow_temperature'],\n  'ruecklauf': ['ruecklaufisttemp_wp', 'rucklauftemperatur', 'return_temperature'],\n  'puffer_ist': ['pufferisttemperatur', 'ist_temperatur_puffer', 'actual_temperature_buffer'],\n  'puffer_soll': ['puffersolltemperatur', 'soll_temperatur_puffer', 'target_temperature_buffer'],\n  'ww_ist': ['speicheristtemp', 'ist_temperatur_warmwasser', 'actual_temperature_water'],\n  'ww_soll': ['speichersolltemp', 'soll_temperatur_warmwasser', 'target_temperature_water'],\n  'hk1_ist': ['isttemperatur_hk1', 'ist_temperatur_hk_1', 'actual_temperature_hk_1'],\n  'hk1_soll': ['solltemperatur_hk1', 'soll_temperatur_hk_1', 'target_temperature_hk_1'],\n  'raum_ist': ['raumisttemp', 'ist_raumtemperatur_hk_1', 'actual_room_temperature_hk_1'],\n  'raum_soll': ['raumsolltemp', 'soll_raumtemperatur_hk_1', 'target_room_temperature_hk_1'],\n  'raumfeuchte': ['raumfeuchte', 'luftfeuchtigkeit_hk_1', 'actual_humidity_hk_1'],\n  'taupunkt': ['taupunkttemp', 'taupunkttemperatur', 'dew_point_temperature'],\n  'heizdruck': ['heizungsdruck', 'heizdruck', 'heater_pressure'],\n  'volumenstrom': ['volumenstrom', 'volume_stream'],\n  'heissgas': ['heissgastemp', 'heissgastemperatur', 'hot_gas_temperature'],\n  'hochdruck': ['druck_hochdruck', 'hochdruck', 'high_pressure'],\n  'niederdruck': ['druck_niederdruck', 'niederdruck', 'low_pressure'],\n  'betriebsart': ['programmschalter', 'betriebsart', 'operation_mode'],\n  'hk1_climate': ['heizkreis_1', 'heat_circuit_1'],\n  'komfort': ['komforttemperatur', 'tagbetrieb_temperatursoll_hk_1', 'comfort_temperature_target_hk1'],\n  'eco': ['ecotemperatur', 'absenkbetrieb_temperatursoll_hk_1', 'eco_temperature_target_hk1'],\n  'heizkurve': ['steigung_heizkurve', 'heizkurve_steilheit_hk_1', 'heating_curve_rise_hk1'],\n  'ww_komfort': ['einstell_speichersolltemp', 'tagbetrieb_warmwasser_temperatursoll', 'comfort_water_temperature_target'],\n  'ww_eco': ['ww_eco_temp', 'absenkbetrieb_warmwasser_temperatursoll', 'eco_water_temperature_target'],\n  'bivalenz_hzg': ['bivalenztemperatur_hzg', 'bivalenztemperatur_heizung', 'dualmode_temperature_hzg'],\n  'bivalenz_ww': ['bivalenztemperatur_warmwasser', 'dualmode_temperature_ww'],\n  'sg_ready': ['sg_ready_aktiv', 'sg_ready_active'],\n  'verdichter': ['verdichter', 'compressor_on'],\n  'heizbetrieb': ['heizbetrieb', 'is_heating'],\n  'ww_betrieb': ['warmwasserbetrieb', 'is_heating_boiler'],\n  'sommerbetrieb': ['sommerbetrieb', 'is_summer_mode'],\n  'kuehlbetrieb': ['kuehlbetrieb', 'is_cooling'],\n  'abtauung': ['verdampferabtauung', 'evaporator_defrost'],\n  'evu': ['sperrzeit_evu', 'evu_sperre', 'power_off'],\n  'fehler': ['fehlerstatus', 'stoerung', 'error_status'],\n  'fehlernr': ['aktiver_fehler', 'active_error'],\n  'hk1_pumpe': ['heizkreispumpe_1', 'heizkreis_1_pumpe', 'heating_circuit_1_pump'],\n  'ww_ladepumpe': ['pufferladepumpe_1', 'warmwasser_ladepumpe', 'dhw_charging_pump'],\n  'quellenpumpe': ['quellenpumpe', 'source_pump'],\n  'nhz': ['nhz_1', 'nhz_stufen_aktiv', 'nhz_stages_running'],\n  'heizwaerme_heute': ['waermeertrag_heiz_tag_summe_kwh', 'erzeugte_heizwarme_heute', 'produced_heating_today'],\n  'heizwaerme_gesamt': ['waermeertrag_heiz_summe_mwh', 'erzeugte_heizwarme_gesamt', 'produced_heating_total'],\n  'ww_waerme_heute': ['waermeertrag_ww_tag_summe_kwh', 'erzeugte_warmwasserwarme_heute', 'produced_water_heating_today'],\n  'ww_waerme_gesamt': ['waermeertrag_ww_summe_mwh', 'erzeugte_warmwasserwarme_gesamt', 'produced_water_heating_total'],\n  'strom_heiz_heute': ['verbrauchte_heizenergie_heute', 'consumed_heating_today'],\n  'strom_heiz_gesamt': ['el_energieaufnahme_heiz_summe_kwh', 'verbrauchte_heizenergie_gesamt', 'consumed_heating_total'],\n  'strom_ww_heute': ['verbrauchte_warmwasserenergie_heute', 'consumed_water_heating_today'],\n  'strom_ww_gesamt': ['el_energieaufnahme_ww_summe_kwh', 'verbrauchte_warmwasserenergie_gesamt', 'consumed_water_heating_total'],\n  'laufzeit_heiz': ['laufzeit_vd_heizen', 'verdichter_heizung', 'compressor_heating'],\n  'laufzeit_ww': ['laufzeit_vd_warmwasser', 'verdichter_warmwasser', 'compressor_heating_water'],\n  'starts': ['verdichter_starts', 'verdichterstarts', 'compressor_starts'],\n  'cop_heiz': ['effizienz_heizung_letzte_24_h', 'efficiency_heating_1_24_h'],\n  'cop_ww': ['effizienz_warmwasser_letzte_24_h', 'efficiency_dhw_1_24_h']\n} -%}\n{# @@END@@ #}\n{%- set dev = device_id('this.entity_id') -%}\n{%- set all = device_entities(dev) | sort if dev else [] -%}\n{%- set sens = all | select('match', '^sensor\\\\.') | list -%}\n{%- set nums = all | select('match', '^number\\\\.') | list -%}\n{%- set sels = all | select('match', '^select\\\\.') | list -%}\n{%- set sws = all | select('match', '^switch\\\\.') | list -%}\n{%- set bsens = all | select('match', '^binary_sensor\\\\.') | list -%}\n{%- set clims = all | select('match', '^climate\\\\.') | list -%}\n{%- set miss = namespace(l=[]) -%}\n{%- set diag = namespace(rows=[]) -%}\n{%- if dev -%}\n  {%- if not (has(sens, F.aussen) | trim) -%}{%- set miss.l = miss.l + ['Außentemperatur'] -%}{%- endif -%}\n  {%- if not (has(sens, F.vorlauf_wp) | trim) -%}{%- set miss.l = miss.l + ['Vorlauf WP'] -%}{%- endif -%}\n  {%- if not (has(sens, F.ww_ist) | trim) -%}{%- set miss.l = miss.l + ['Warmwasser'] -%}{%- endif -%}\n  {%- if not (has(sels, F.betriebsart) | trim) -%}{%- set miss.l = miss.l + ['Betriebsart'] -%}{%- endif -%}\n  {%- if has(sens, F.heissgas) | trim -%}{%- set diag.rows = diag.rows + ['| Heißgas | ' ~ (num(sens, F.heissgas, 1) | trim) ~ ' |'] -%}{%- endif -%}\n  {%- if has(sens, F.hochdruck) | trim -%}{%- set diag.rows = diag.rows + ['| Hochdruck | ' ~ (num(sens, F.hochdruck, 1) | trim) ~ ' |'] -%}{%- endif -%}\n  {%- if has(sens, F.niederdruck) | trim -%}{%- set diag.rows = diag.rows + ['| Niederdruck | ' ~ (num(sens, F.niederdruck, 1) | trim) ~ ' |'] -%}{%- endif -%}\n  {%- if has(sens, F.volumenstrom) | trim -%}{%- set diag.rows = diag.rows + ['| Volumenstrom | ' ~ (num(sens, F.volumenstrom, 1) | trim) ~ ' |'] -%}{%- endif -%}\n  {%- if has(bsens, F.hk1_pumpe) | trim -%}{%- set diag.rows = diag.rows + ['| HK1-Pumpe | ' ~ (bin(bsens, F.hk1_pumpe) | trim) ~ ' |'] -%}{%- endif -%}\n  {%- if has(bsens, F.quellenpumpe) | trim -%}{%- set diag.rows = diag.rows + ['| Quellenpumpe | ' ~ (bin(bsens, F.quellenpumpe) | trim) ~ ' |'] -%}{%- endif -%}\n  {%- if has(sens, F.cop_heiz) | trim -%}{%- set diag.rows = diag.rows + ['| Effizienz 24 h Heizung (Anlagenangabe) | ' ~ (num(sens, F.cop_heiz, 2) | trim) ~ ' |'] -%}{%- endif -%}\n  {%- if has(sens, F.cop_ww) | trim -%}{%- set diag.rows = diag.rows + ['| Effizienz 24 h Warmwasser (Anlagenangabe) | ' ~ (num(sens, F.cop_ww, 2) | trim) ~ ' |'] -%}{%- endif -%}\n{%- endif -%}\n{% if dev %}\n## {{ dot(sens, bsens) | trim }} {{ device_attr(dev, 'name_by_user') or device_attr(dev, 'name') or 'Wärmepumpe' }}\n\n{{ area_name('this.entity_id') or area_name(dev) or '—' }} · **{{ status_text(sens, bsens) | trim }}**{% if device_attr(dev, 'model') and 'esp32' not in (device_attr(dev, 'model') | lower) %} · {{ device_attr(dev, 'manufacturer') or '' }} {{ device_attr(dev, 'model') }}{% endif %}\n\n{% if miss.l %}\n> **Nicht verfügbar:** {{ miss.l | join(', ') }}. Diese Zeilen zeigen „—“ — die Karte bleibt vollständig.\n{% endif %}\n\n### Temperaturen\n\n| Messpunkt | Wert |\n|---|---|\n| Außen | {{ num(sens, F.aussen, 1) }} |\n| Vorlauf WP | {{ num(sens, F.vorlauf_wp, 1) }} |\n| Rücklauf | {{ num(sens, F.ruecklauf, 1) }} |\n{{- mrow('Vorlauf gesamt', num(sens, F.vorlauf, 1), has(sens, F.vorlauf)) }}\n{{- mrow('Puffer (Ist / Soll)', pair(sens, F.puffer_ist, F.puffer_soll), has(sens, F.puffer_ist) ~ has(sens, F.puffer_soll)) }}\n{{- mrow('Heizkreis 1 (Ist / Soll)', pair(sens, F.hk1_ist, F.hk1_soll), has(sens, F.hk1_ist) ~ has(sens, F.hk1_soll)) }}\n{{- mrow('Raum (Ist / Soll)', pair(sens, F.raum_ist, F.raum_soll), has(sens, F.raum_ist) ~ has(sens, F.raum_soll)) }}\n{{- mrow('Raumfeuchte', num(sens, F.raumfeuchte, 0), has(sens, F.raumfeuchte)) }}\n{{- mrow('Taupunkt', num(sens, F.taupunkt, 1), has(sens, F.taupunkt)) }}\n{{- mrow('Heizdruck', num(sens, F.heizdruck, 1), has(sens, F.heizdruck)) }}\n\n### Warmwasser\n\n| Größe | Wert |\n|---|---|\n| Ist | {{ num(sens, F.ww_ist, 1) }} |\n| Soll (Ist-Wert der Anlage) | {{ num(sens, F.ww_soll, 1) }} |\n{{- mrow('Komfort-Soll', num(nums + sens, F.ww_komfort, 1), has(nums + sens, F.ww_komfort)) }}\n{{- mrow('Eco-Soll', num(nums + sens, F.ww_eco, 1), has(nums + sens, F.ww_eco)) }}\n{{- mrow('Ladepumpe', bin(bsens, F.ww_ladepumpe), has(bsens, F.ww_ladepumpe)) }}\n{{- mrow('Warmwasserbetrieb', bin(bsens, F.ww_betrieb), has(bsens, F.ww_betrieb)) }}\n\n### Betrieb\n\n| Größe | Wert |\n|---|---|\n| Betriebsart | {{ val(sels, F.betriebsart) }} |\n{{- mrow('Heizkreis 1 (Climate)', val(clims, F.hk1_climate), has(clims, F.hk1_climate)) }}\n{{- mrow('Komfort HK1', num(nums + sens, F.komfort, 1), has(nums + sens, F.komfort)) }}\n{{- mrow('Eco HK1', num(nums + sens, F.eco, 1), has(nums + sens, F.eco)) }}\n{{- mrow('Heizkurve', num(nums + sens, F.heizkurve, 2), has(nums + sens, F.heizkurve)) }}\n{{- mrow('Bivalenz Heizung', num(nums + sens, F.bivalenz_hzg, 1), has(nums + sens, F.bivalenz_hzg)) }}\n{{- mrow('Bivalenz Warmwasser', num(nums + sens, F.bivalenz_ww, 1), has(nums + sens, F.bivalenz_ww)) }}\n{{- mrow('SG Ready', bin(sws, F.sg_ready), has(sws, F.sg_ready)) }}\n\n### Energie\n\n| Größe | Wert |\n|---|---|\n| Heizwärme heute | {{ num(sens, F.heizwaerme_heute, 1) }} |\n| Heizwärme gesamt | {{ num(sens, F.heizwaerme_gesamt, 1) }} |\n| Warmwasser-Wärme heute | {{ num(sens, F.ww_waerme_heute, 1) }} |\n| Warmwasser-Wärme gesamt | {{ num(sens, F.ww_waerme_gesamt, 1) }} |\n| Strom Heizung heute | {{ num(sens, F.strom_heiz_heute, 1) }} |\n| Strom Heizung gesamt ⚠ | {{ num(sens, F.strom_heiz_gesamt, 1) }} |\n| Strom Warmwasser heute | {{ num(sens, F.strom_ww_heute, 1) }} |\n| Strom Warmwasser gesamt ⚠ | {{ num(sens, F.strom_ww_gesamt, 1) }} |\n| Laufzeit Verdichter Heizung | {{ num(sens, F.laufzeit_heiz, 0) }} |\n| Laufzeit Verdichter Warmwasser | {{ num(sens, F.laufzeit_ww, 0) }} |\n| Verdichterstarts | {{ ints(sens, F.starts) }} |\n\n⚠ Gerätezähler: Einheit wird unverändert übernommen (kWh/MWh wie geliefert), nicht umgerechnet. Ein lokaler Wärmemengenzähler ist ungeprüft — **COP berechnet das Dashboard deshalb nicht** (Details unter „Diagnose“, sofern die Anlage eine Effizienzangabe liefert).\n\n### Störungen und Zustand\n\n| Größe | Wert |\n|---|---|\n| Fehlerstatus | {{ bin(bsens, F.fehler) }} |\n| EVU-Sperre | {{ bin(bsens, F.evu) }} |\n{{- mrow('Aktiver Fehler (Nummer)', ints(sens, F.fehlernr), has(sens, F.fehlernr)) }}\n{{- mrow('Abtauung', bin(bsens, F.abtauung), has(bsens, F.abtauung)) }}\n{{- mrow('Heizbetrieb', bin(bsens, F.heizbetrieb), has(bsens, F.heizbetrieb)) }}\n{{- mrow('Sommerbetrieb', bin(bsens, F.sommerbetrieb), has(bsens, F.sommerbetrieb)) }}\n{{- mrow('Kühlbetrieb', bin(bsens, F.kuehlbetrieb), has(bsens, F.kuehlbetrieb)) }}\n{{- mrow('Not-/Zusatzheizung (NHZ)', bin(bsens, F.nhz), has(bsens, F.nhz)) }}\n\n_Störungen werden nur in der Servicewelt des Geräts quittiert — dieses Dashboard zeigt sie an und schaltet nichts._\n\n{% if diag.rows %}\n### Diagnose\n\n<details>\n<summary>Technische Zusatzwerte (nur vorhandene)</summary>\n\n| Kennzahl | Wert |\n|---|---|\n{{ diag.rows | join('\\n') }}\n\n</details>\n{% endif %}\n\n[Bedienung →](/stiebel-eltron/bedienung) · [Übersicht →](/stiebel-eltron/uebersicht)\n{% else %}\n_Anker-Entität `{{ 'this.entity_id' }}` ist keinem Gerät zugeordnet. Die Karte bleibt sichtbar, damit der Fehler nicht still verschwindet._\n{% endif %}\n"
          }
         }
        ]
       },
       "else": {
        "type": "markdown",
        "content": "## Keine Wärmepumpe gefunden\n\nDieses Dashboard hat in deinem Home Assistant keine Anlage erkannt. Es ist **kein Fehler der YAML** — die Karten warten auf ein Gerät. Drei Wege führen zum Ziel:\n\n### 1. Label setzen (ESPHome / MQTT / Modbus)\n\nEinstellungen → **Geräte & Dienste** → **Geräte** → deine Wärmepumpe öffnen → **Label** → `stiebel_eltron` anlegen und zuweisen. Danach diese Seite neu laden.\n\n### 2. Integration nutzen (ISG / HTTP)\n\nLäuft die Anlage über **Stiebel Eltron ISG** (`stiebel_eltron_isg`) oder **Stiebel Eltron HTTP** (`stiebel_eltron_http`), wird ihr Gerät ohne Label erkannt. Prüfe, ob der Config Entry geladen ist (Einstellungen → Geräte & Dienste).\n\n### 3. Signatur prüfen (automatische Erkennung)\n\nOhne Label erkennt das Dashboard ein Gerät, wenn es mindestens **drei** dieser Merkmale als Entitäten hat:\n\n`*_aussentemp` / `*_aussentemperatur` / `*_outside_temperature`,\n`*_vorlaufisttemp_wp`, `*_speicheristtemp`, `*_programmschalter`, `*_verdichter`\n\nZusätzlich braucht jede Karte eine **Außentemperatur-Entität** als Anker — sie verbindet Karte und Gerät.\n\n<details>\n<summary>Warum kein fester Entity-Präfix?</summary>\n\nEntity-IDs entstehen aus Gerätename und lokalisiertem Entitätsnamen. Sie ändern sich mit Sprache, Umbenennung, Area und einem zweiten Gerät (`_2`).\nLokal heißen die Entitäten sogar innerhalb eines Geräts unterschiedlich\n(`sensor.heatingpump_aussentemp` und `sensor.esp32_poe_technik_vorlaufisttemp_wp`).\n\nDas Dashboard sucht deshalb **Funktion + Gerät** (Device-ID) statt Präfix + Name. Details: `docs/design.md` im Repository.\n\n</details>\n\n_Das ist die Bordmittel-Karte; sie erscheint nur, solange keine Anlage erkannt wird._\n"
       }
      }
     ]
    }
   ]
  },
  {
   "title": "Bedienung",
   "path": "bedienung",
   "icon": "mdi:tune-variant",
   "type": "sections",
   "max_columns": 2,
   "sections": [
    {
     "type": "grid",
     "cards": [
      {
       "type": "markdown",
       "content": "## Bedienung\n\n⚠️ **Schreibzugriffe gehen direkt an die Anlage.** Es gibt keine Bestätigungsstufe und keine Automatik in diesem Dashboard — jede Änderung ist eine bewusste Tap-/Slider-Aktion.\n\n- **ISG / Modbus:** Schreiben über Holding-Register mit Bereichsprüfung und Gerätebestätigung.\n- **ESPHome / CAN:** Schreiben ist `optimistic` — Home Assistant zeigt den gesendeten Wert, auch wenn das Gerät ihn nicht übernimmt. Nach dem Ändern den Ist-Wert der Anlage prüfen.\n- **Nur lesende Anbindung (HTTP):** keine schreibbaren Entitäten; die Gruppen unten zeigen dann einen Hinweis.\n\nBewusst **nicht** enthalten: Zeitprogramme (nicht als Entität vorhanden), Störungs-Quittierung (nur Servicewelt), Frostschutz-/Sicherheitsparameter.\n"
      },
      {
       "type": "heading",
       "heading": "Betriebsart",
       "heading_style": "title",
       "icon": "mdi:swap-horizontal"
      },
      {
       "type": "custom:auto-entities",
       "card": {
        "type": "grid",
        "columns": 2,
        "square": false
       },
       "card_param": "cards",
       "unique": "entity",
       "show_empty": false,
       "filter": {
        "include": [
         {
          "domain": "select",
          "entity_id": "/_(programmschalter|betriebsart|operation_mode)(_[0-9]+)?$/",
          "or": [
           {
            "label": "stiebel_eltron"
           },
           {
            "integration": "stiebel_eltron_isg"
           }
          ],
          "options": {
           "type": "tile",
           "features": [
            {
             "type": "select-options",
             "style": "dropdown"
            }
           ]
          }
         }
        ],
        "exclude": [
         {
          "integration": "stiebel_eltron_http"
         }
        ]
       },
       "else": {
        "type": "markdown",
        "content": "_Keine schaltbare Betriebsart gefunden._ Bei einer rein lesenden Anbindung (HTTP) lässt sich die Betriebsart nur am Gerät bzw. in der Servicewelt ändern; bei ESPHome/ISG fehlt die Entität `*_programmschalter` bzw. `*_betriebsart`.\n"
       }
      }
     ]
    },
    {
     "type": "grid",
     "cards": [
      {
       "type": "heading",
       "heading": "Warmwasser",
       "heading_style": "title",
       "icon": "mdi:water-thermometer"
      },
      {
       "type": "custom:auto-entities",
       "card": {
        "type": "grid",
        "columns": 2,
        "square": false
       },
       "card_param": "cards",
       "unique": "entity",
       "show_empty": false,
       "filter": {
        "include": [
         {
          "domain": "number",
          "entity_id": "/_(einstell_speichersolltemp|tagbetrieb_warmwasser_temperatursoll|comfort_water_temperature_target|ww_eco_temp|absenkbetrieb_warmwasser_temperatursoll|eco_water_temperature_target)(_[0-9]+)?$/",
          "or": [
           {
            "label": "stiebel_eltron"
           },
           {
            "integration": "stiebel_eltron_isg"
           }
          ],
          "options": {
           "type": "tile",
           "features": [
            {
             "type": "numeric-input",
             "style": "buttons"
            }
           ]
          }
         }
        ],
        "exclude": [
         {
          "integration": "stiebel_eltron_http"
         }
        ]
       },
       "else": {
        "type": "markdown",
        "content": "_Keine Warmwasser-Sollwerte gefunden._ Diese Gruppe braucht `number`-Entitäten wie `*_einstell_speichersolltemp` (ISO) bzw. `*_tagbetrieb_warmwasser_temperatursoll` (ISG). Eine rein lesende Anbindung (HTTP) bietet sie nicht.\n"
       }
      },
      {
       "type": "heading",
       "heading": "Heizkreis",
       "heading_style": "title",
       "icon": "mdi:radiator"
      },
      {
       "type": "custom:auto-entities",
       "card": {
        "type": "grid",
        "columns": 2,
        "square": false
       },
       "card_param": "cards",
       "unique": "entity",
       "show_empty": false,
       "filter": {
        "include": [
         {
          "domain": "number",
          "entity_id": "/_(komforttemperatur|ecotemperatur|steigung_heizkurve|tagbetrieb_temperatursoll_hk_1|absenkbetrieb_temperatursoll_hk_1|heizkurve_steilheit_hk_1|comfort_temperature_target_hk1|eco_temperature_target_hk1|heating_curve_rise_hk1)(_[0-9]+)?$/",
          "or": [
           {
            "label": "stiebel_eltron"
           },
           {
            "integration": "stiebel_eltron_isg"
           }
          ],
          "options": {
           "type": "tile",
           "features": [
            {
             "type": "numeric-input",
             "style": "buttons"
            }
           ]
          }
         }
        ],
        "exclude": [
         {
          "integration": "stiebel_eltron_http"
         }
        ]
       },
       "else": {
        "type": "markdown",
        "content": "_Keine Heizungs-Sollwerte gefunden._ Erwartet werden `number`-Entitäten wie `*_komforttemperatur`, `*_ecotemperatur` oder `*_steigung_heizkurve` (ISG: `*_tagbetrieb_temperatursoll_hk_1` usw.). Eine rein lesende Anbindung (HTTP) bietet sie nicht.\n"
       }
      },
      {
       "type": "custom:auto-entities",
       "card": {
        "type": "grid",
        "columns": 2,
        "square": false
       },
       "card_param": "cards",
       "unique": "entity",
       "show_empty": false,
       "filter": {
        "include": [
         {
          "domain": "climate",
          "entity_id": "/_(heizkreis_1|heat_circuit_1)(_[0-9]+)?$/",
          "or": [
           {
            "label": "stiebel_eltron"
           },
           {
            "integration": "stiebel_eltron_isg"
           }
          ],
          "options": {
           "type": "tile",
           "features": [
            {
             "type": "climate-hvac-modes"
            },
            {
             "type": "target-temperature"
            }
           ]
          }
         }
        ],
        "exclude": [
         {
          "integration": "stiebel_eltron_http"
         }
        ]
       },
       "else": {
        "type": "markdown",
        "content": "_Kein Heizkreis als `climate`-Entität gefunden._ Das ist normal, wenn die Anbindung nur Sensoren und Sollwert-`number` liefert — die Sollwerte stehen dann in der Gruppe darüber.\n"
       }
      }
     ]
    },
    {
     "type": "grid",
     "cards": [
      {
       "type": "heading",
       "heading": "SG Ready",
       "heading_style": "title",
       "icon": "mdi:transmission-tower"
      },
      {
       "type": "custom:auto-entities",
       "card": {
        "type": "grid",
        "columns": 2,
        "square": false
       },
       "card_param": "cards",
       "unique": "entity",
       "show_empty": false,
       "filter": {
        "include": [
         {
          "domain": "switch",
          "entity_id": "/_(sg_ready_aktiv|sg_ready_active)(_[0-9]+)?$/",
          "or": [
           {
            "label": "stiebel_eltron"
           },
           {
            "integration": "stiebel_eltron_isg"
           }
          ],
          "options": {
           "type": "tile"
          }
         }
        ],
        "exclude": [
         {
          "integration": "stiebel_eltron_http"
         }
        ]
       },
       "else": {
        "type": "markdown",
        "content": "_Kein SG-Ready-Schalter gefunden._ Die Anlage bietet keine `switch`-Entität `*_sg_ready_aktiv`; §14a-/SG-Ready-Steuerung läuft dann außerhalb dieses Dashboards.\n"
       }
      }
     ]
    }
   ]
  }
 ]
};

/*
 * Laufzeit der Dashboard-Strategie "custom:stiebel-eltron".
 *
 * Wird von scripts/build_strategy.py zusammen mit der aufgelösten
 * Dashboard-Konfiguration zu stiebel-eltron-dashboard.js gebaut.
 *
 * Aufgaben:
 *   1. Dashboard-Strategie für Home Assistant registrieren
 *      (Elementname: ll-strategy-dashboard-stiebel-eltron).
 *   2. Die auto-entities-Karten der YAML-Quelle zur Laufzeit in konkrete
 *      Karten je Anlage auflösen. Dadurch braucht die HACS-Variante weder
 *      auto-entities noch eine YAML-Datei im Dateisystem.
 *
 * Die Jinja-Templates in den Markdown-Karten bleiben unverändert; sie werden
 * von Home Assistant serverseitig gerendert.
 */

const STRATEGY_TAG = "ll-strategy-dashboard-stiebel-eltron";
const STRATEGY_VERSION = "0.4.2";

function isUsable(entity) {
  return Boolean(entity) && !entity.disabled_by && !entity.hidden_by;
}

function deviceOf(hass, entity) {
  return (entity && entity.device_id && hass.devices && hass.devices[entity.device_id]) || null;
}

function deviceName(hass, entity) {
  const device = deviceOf(hass, entity);
  return (device && (device.name_by_user || device.name)) || "";
}

function matchesRule(hass, entity, rule) {
  if (!rule || typeof rule !== "object") return false;
  if (rule.domain && !entity.entity_id.startsWith(`${rule.domain}.`)) return false;

  if (rule.integration && entity.platform !== rule.integration) return false;

  if (rule.label) {
    const device = deviceOf(hass, entity);
    const entityLabels = Array.isArray(entity.labels) ? entity.labels : [];
    const deviceLabels = device && Array.isArray(device.labels) ? device.labels : [];
    if (!entityLabels.includes(rule.label) && !deviceLabels.includes(rule.label)) return false;
  }

  if (rule.entity_id) {
    const raw = String(rule.entity_id);
    const match = /^\/(.*)\/([a-z]*)$/.exec(raw);
    if (match) {
      if (!new RegExp(match[1], match[2]).test(entity.entity_id)) return false;
    } else if (entity.entity_id !== raw) {
      return false;
    }
  }

  if (Array.isArray(rule.or) && rule.or.length) {
    const device = deviceOf(hass, entity);
    const entityLabels = Array.isArray(entity.labels) ? entity.labels : [];
    const deviceLabels = device && Array.isArray(device.labels) ? device.labels : [];
    const hit = rule.or.some((part) => {
      if (!part || typeof part !== "object") return false;
      if (part.label) {
        return entityLabels.includes(part.label) || deviceLabels.includes(part.label);
      }
      if (part.integration) {
        return entity.platform === part.integration;
      }
      return false;
    });
    if (!hit) return false;
  }

  return true;
}

function replaceEntityToken(value, entityId) {
  if (typeof value === "string") {
    return value.split("this.entity_id").join(entityId);
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceEntityToken(item, entityId));
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = replaceEntityToken(item, entityId);
    }
    return result;
  }
  return value;
}

function expandAutoEntities(card, hass) {
  const filter = card.filter || {};
  const include = Array.isArray(filter.include) ? filter.include : [];
  const exclude = Array.isArray(filter.exclude) ? filter.exclude : [];
  const entities = Object.values(hass.entities || {}).filter(isUsable);
  const found = [];

  for (const rule of include) {
    if (!rule || typeof rule !== "object") continue;
    const options = rule.options || {};
    for (const entity of entities) {
      if (!matchesRule(hass, entity, rule)) continue;
      if (exclude.some((part) => matchesRule(hass, entity, part))) continue;

      const concrete = replaceEntityToken(options, entity.entity_id);
      // auto-entities setzt bei jeder Treffer-Karte selbst `entity:`. Markdown-
      // Karten brauchen es nicht — ihr Inhalt ist bereits aufgelöst — und
      // unbekannte Schlüssel provozieren dort nur Warnungen.
      if (
        concrete &&
        typeof concrete === "object" &&
        !concrete.entity &&
        concrete.type !== "markdown"
      ) {
        concrete.entity = entity.entity_id;
      }
      found.push({
        entity: entity.entity_id,
        device: deviceName(hass, entity),
        card: concrete,
      });
    }
  }

  const seen = new Set();
  const unique = [];
  for (const item of found) {
    if (seen.has(item.entity)) continue;
    seen.add(item.entity);
    unique.push(item);
  }
  unique.sort((a, b) => a.device.localeCompare(b.device, "de"));

  const cards = unique.map((item) => item.card);
  if (!cards.length) {
    return card.else || null;
  }

  const container = { ...(card.card || { type: "grid", columns: 1 }) };
  container[card.card_param || "cards"] = cards;
  return container;
}

function expand(node, hass) {
  if (Array.isArray(node)) {
    return node.map((item) => expand(item, hass));
  }
  if (node && typeof node === "object") {
    if (node.type === "custom:auto-entities") {
      return expandAutoEntities(node, hass);
    }
    const result = {};
    for (const [key, value] of Object.entries(node)) {
      result[key] = expand(value, hass);
    }
    return result;
  }
  return node;
}

class StiebelEltronDashboardStrategy extends HTMLElement {
  static async generate(config, hass) {
    return expand(structuredClone(DASHBOARD_CONFIG), hass);
  }
}

customElements.define(STRATEGY_TAG, StiebelEltronDashboardStrategy);

// Seit Home Assistant 2026.5 lässt sich eine Strategie im Dialog
// "Dashboard hinzufügen" unter "Community dashboards" anbieten.
globalThis.customStrategies = globalThis.customStrategies || [];
if (
  !globalThis.customStrategies.some(
    (entry) => entry && entry.type === "stiebel-eltron" && entry.strategyType === "dashboard"
  )
) {
  globalThis.customStrategies.push({
    type: "stiebel-eltron",
    strategyType: "dashboard",
    name: "Stiebel Eltron",
    description: "Wärmepumpen-Dashboard für eine oder mehrere Stiebel-Eltron-Anlagen",
    documentationURL: "https://github.com/PuzzleFoco/stiebel-eltron-dashboard",
  });
}

globalThis.__stiebelEltronDashboard = {
  strategy: STRATEGY_TAG,
  viewCount: Array.isArray(DASHBOARD_CONFIG.views) ? DASHBOARD_CONFIG.views.length : 0,
  version: STRATEGY_VERSION,
};
