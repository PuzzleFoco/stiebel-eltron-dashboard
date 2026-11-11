#!/usr/bin/env python3
"""Baut das Release-Artefakt für einen Tag (vX.Y.Z).

Ergebnis in release/:
  stiebel-eltron-dashboard-vX.Y.Z.zip   Inhalt von dist/ (Dashboard-YAML + .js)
  SHA256SUMS.txt                        Prüfsumme des Archivs

Wichtig für HACS: Es darf KEIN Release-Asset geben, das exakt so heißt wie
hacs.json -> filename (also stiebel-eltron-dashboard.js). HACS schaltet sonst
in den "release"-Modus und lädt nur diese eine Datei – die Dashboard-YAML käme
nie beim Nutzer an. Das Archiv heißt deshalb bewusst anders.

Aufruf:
    python scripts/build_release.py --version 0.1.0
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist"
RELEASE_DIR = ROOT / "release"
PACKAGE = "stiebel-eltron-dashboard"

SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")


def run(script: str, *args: str) -> None:
    """Hilfsskript aufrufen und bei Fehler abbrechen."""
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / script), *args],
        cwd=ROOT,
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(f"abgebrochen: scripts/{script} ist fehlgeschlagen")


def sha256(path: Path) -> str:
    """SHA-256 einer Datei."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build(version: str) -> int:
    """Archiv erzeugen."""
    run("validate.py")
    run("sync_dist.py", "--check")

    RELEASE_DIR.mkdir(exist_ok=True)
    archive = RELEASE_DIR / f"{PACKAGE}-v{version}.zip"

    files: list[Path] = []
    for path in sorted(DIST_DIR.rglob("*")):
        if path.is_file():
            files.append(path)
    for name in ("README.md", "LICENSE", "hacs.json"):
        candidate = ROOT / name
        if candidate.is_file():
            files.append(candidate)

    if not files:
        raise SystemExit("abgebrochen: keine Dateien für das Release gefunden")

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            if path.parent == DIST_DIR:
                arcname = path.name
            elif DIST_DIR in path.parents:
                arcname = str(path.relative_to(DIST_DIR))
            else:
                arcname = path.name
            zf.write(path, arcname)

    checksum = sha256(archive)
    sums = RELEASE_DIR / "SHA256SUMS.txt"
    sums.write_text(f"{checksum}  {archive.name}\n", encoding="utf-8")

    size_kib = archive.stat().st_size / 1024
    lines = [
        f"Release {version} gebaut",
        f"  Archiv : {archive.relative_to(ROOT)} ({size_kib:.1f} KiB, {len(files)} Dateien)",
        f"  SHA256 : {checksum}",
    ]
    print("\n".join(lines))

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write(
                f"## Release v{version}\n\n"
                f"| Artefakt | Größe | SHA-256 |\n|---|---|---|\n"
                f"| `{archive.name}` | {size_kib:.1f} KiB | `{checksum}` |\n"
            )

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True, help="Version ohne führendes v, z. B. 0.1.0")
    args = parser.parse_args()

    version = args.version.lstrip("v")
    if not SEMVER_RE.match(version):
        raise SystemExit(f"abgebrochen: '{args.version}' ist keine Version im Format X.Y.Z")

    return build(version)


if __name__ == "__main__":
    sys.exit(main())
