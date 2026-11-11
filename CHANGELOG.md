# Changelog

Alle nennenswerten Änderungen an diesem Repository.
Format: [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung: [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

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
