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
const STRATEGY_VERSION = "__VERSION__";

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
      // auto-entities setzt bei jeder Treffer-Karte selbst `entity:`.
      if (concrete && typeof concrete === "object" && !concrete.entity) {
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
