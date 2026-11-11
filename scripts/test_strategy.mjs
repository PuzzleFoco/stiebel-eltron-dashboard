#!/usr/bin/env node
/*
 * Abnahmetest für die generierte Dashboard-Strategie.
 *
 * Lädt stiebel-eltron-dashboard.js in einer Node-Sandbox (HTMLElement und
 * customElements werden gestubbt), ruft die Strategie mit einer simulierten
 * Geräteregistry auf und prüft:
 *   - drei Views,
 *   - je eine Karte pro Anlage in Übersicht und Geräte,
 *   - Bedienkarten nur für schreibfähige Anbindungen (nicht HTTP),
 *   - `_2`-Duplikatsuffixe werden zugeordnet,
 *   - keine custom:auto-entities-Karte und kein this.entity_id mehr.
 *
 * Aufruf: node scripts/test_strategy.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bundle = path.join(root, "stiebel-eltron-dashboard.js");

let failures = 0;
function check(ok, label) {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}`);
  if (!ok) failures += 1;
}

function entity(entity_id, device_id, platform, labels = []) {
  return { entity_id, device_id, platform, labels, disabled_by: null, hidden_by: null };
}

const devices = {
  dev_a: { id: "dev_a", name: "Wärmepumpe A", name_by_user: null, labels: ["stiebel_eltron"] },
  dev_b: { id: "dev_b", name: "Wärmepumpe B", name_by_user: null, labels: [] },
  dev_c: { id: "dev_c", name: "Wärmepumpe HTTP", name_by_user: null, labels: [] },
  dev_lueftung: { id: "dev_lueftung", name: "Lüftung", name_by_user: null, labels: [] },
};

const entities = {};
for (const e of [
  entity("sensor.a_aussentemp", "dev_a", "esphome"),
  entity("sensor.a_vorlaufisttemp_wp", "dev_a", "esphome"),
  entity("sensor.a_speicheristtemp", "dev_a", "esphome"),
  entity("select.a_programmschalter", "dev_a", "esphome"),
  entity("number.a_einstell_speichersolltemp", "dev_a", "esphome"),
  entity("number.a_komforttemperatur", "dev_a", "esphome"),
  entity("number.a_ecotemperatur", "dev_a", "esphome"),
  entity("switch.a_sg_ready_aktiv", "dev_a", "esphome"),

  entity("sensor.b_aussentemp", "dev_b", "stiebel_eltron_isg"),
  entity("sensor.b_vorlaufisttemp_wp_2", "dev_b", "stiebel_eltron_isg"),
  entity("sensor.b_speicheristtemp_2", "dev_b", "stiebel_eltron_isg"),
  entity("select.b_programmschalter_2", "dev_b", "stiebel_eltron_isg"),
  entity("number.b_einstell_speichersolltemp_2", "dev_b", "stiebel_eltron_isg"),
  entity("number.b_komforttemperatur_2", "dev_b", "stiebel_eltron_isg"),
  entity("number.b_ecotemperatur_2", "dev_b", "stiebel_eltron_isg"),
  entity("switch.b_sg_ready_aktiv_2", "dev_b", "stiebel_eltron_isg"),

  entity("sensor.c_aussentemp", "dev_c", "stiebel_eltron_http"),
  entity("select.c_programmschalter", "dev_c", "stiebel_eltron_http"),
  entity("number.c_einstell_speichersolltemp", "dev_c", "stiebel_eltron_http"),

  entity("sensor.lueftung_aussentemp", "dev_lueftung", "esphome"),
]) {
  entities[e.entity_id] = e;
}

const hass = { devices, entities, states: {} };

globalThis.HTMLElement = class {};
globalThis.customElements = {
  define(name, cls) {
    globalThis.__strategies = globalThis.__strategies || {};
    globalThis.__strategies[name] = cls;
  },
};
vm.runInThisContext(fs.readFileSync(bundle, "utf8"), { filename: bundle });

const Strategy = globalThis.__strategies?.["ll-strategy-dashboard-stiebel-eltron"];
check(Boolean(Strategy), "Strategie ll-strategy-dashboard-stiebel-eltron registriert");
check(globalThis.__stiebelEltronDashboard?.viewCount === 3, "drei Views im Bundle");

const config = await Strategy.generate({}, hass);
check(Array.isArray(config.views) && config.views.length === 3, "generate liefert drei Views");
check(config.title === "Stiebel Eltron", "Dashboard-Titel gesetzt");

const overview = config.views[0].sections[1].cards[1];
const devicesView = config.views[1].sections[0].cards[1];
const mode = config.views[2].sections[0].cards[2];
const water = config.views[2].sections[1].cards[1];
const heating = config.views[2].sections[1].cards[3];
const sgReady = config.views[2].sections[2].cards[1];

check(overview.type === "grid" && overview.cards.length === 3, "Übersicht: 3 Anlagenkarten (A, B, HTTP)");
check(devicesView.type === "grid" && devicesView.cards.length === 3, "Geräte: 3 Detailkarten");
check(mode.type === "grid" && mode.cards.length === 2, "Betriebsart: nur A und B (HTTP ausgeschlossen)");
check(
  water.type === "grid" && water.cards.length === 2,
  "Warmwasser-Sollwerte: ein Sollwert je Anlage (A und B)"
);
check(
  heating.type === "grid" && heating.cards.length === 4,
  "Heizkreis-Sollwerte: Komfort und Eco je Anlage (A und B)"
);
const heatingEntities = heating.cards.map((card) => card.entity).sort();
check(
  JSON.stringify(heatingEntities) ===
    JSON.stringify([
      "number.a_ecotemperatur",
      "number.a_komforttemperatur",
      "number.b_ecotemperatur_2",
      "number.b_komforttemperatur_2",
    ]),
  "Heizkreis-Karten tragen die richtigen Entity-IDs (inkl. _2)"
);
check(sgReady.type === "grid" && sgReady.cards.length === 2, "SG Ready: A und B");

const modeEntities = mode.cards.map((card) => card.entity).sort();
check(
  JSON.stringify(modeEntities) === JSON.stringify(["select.a_programmschalter", "select.b_programmschalter_2"]),
  "Betriebsart-Karten tragen die richtigen Entity-IDs (inkl. _2)"
);

function hasAutoEntities(node) {
  if (Array.isArray(node)) return node.some(hasAutoEntities);
  if (node && typeof node === "object") {
    if (node.type === "custom:auto-entities") return true;
    return Object.values(node).some(hasAutoEntities);
  }
  return false;
}

const serialized = JSON.stringify(config);
check(!hasAutoEntities(config), "keine auto-entities-Karte mehr im Ergebnis");
check(!serialized.includes("this.entity_id"), "kein this.entity_id-Platzhalter mehr im Ergebnis");
check(
  overview.cards.every((card) => card.type === "markdown" && card.content.includes("device_id('sensor.")),
  "Übersichtskarten sind konkrete Markdown-Karten mit aufgelöster Device-ID"
);
check(
  !JSON.stringify(config).includes("sensor.lueftung_aussentemp"),
  "Lüftungsgerät ohne Label/Integration wird nicht als Wärmepumpe ausgegeben"
);

if (failures) {
  console.error(`\n${failures} Prüfung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("\nOK: alle Strategie-Prüfungen bestanden.");
