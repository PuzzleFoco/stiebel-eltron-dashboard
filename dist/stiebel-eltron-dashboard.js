/**
 * stiebel-eltron-dashboard.js
 *
 * HACS-Einstiegspunkt für dieses Repository.
 *
 * Warum gibt es diese Datei, obwohl das Produkt ein Lovelace-YAML-Dashboard ist?
 * HACS akzeptiert die Kategorie "Dashboard" (intern "plugin") nur, wenn im
 * Repository eine .js-Datei liegt, deren Name dem Schlüssel `filename` aus
 * hacs.json entspricht. Fehlt sie, bricht HACS mit
 * "Repository structure ... is not compliant" ab.
 *
 * Diese Datei liefert absichtlich keine UI und registriert keine Karte.
 * Das Dashboard selbst ist reines YAML:
 *   dist/stiebel_eltron.yaml
 * und wird in configuration.yaml als YAML-Dashboard eingebunden (siehe README).
 *
 * Da das Dashboard im YAML-Modus läuft, registriert HACS hier auch keine
 * Lovelace-Ressource – die Datei wird von Home Assistant nicht geladen.
 * Sie existiert ausschließlich für die HACS-Strukturprüfung und als
 * eindeutiger Versions-/Herkunftsmarker im Browser (falls sie doch als
 * Ressource eingebunden wird).
 */

const REPOSITORY = "stiebel-eltron-dashboard";
const DASHBOARD_YAML = "stiebel_eltron.yaml";

const marker = {
  repository: REPOSITORY,
  dashboard: DASHBOARD_YAML,
  kind: "lovelace-yaml-dashboard",
};

globalThis.__stiebelEltronDashboard = marker;

console.info(
  `[${REPOSITORY}] HACS-Einstiegspunkt geladen. ` +
    `Dashboard-YAML: ${DASHBOARD_YAML} (Einbindung siehe README).`
);

export default marker;
