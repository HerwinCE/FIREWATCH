"""Importe les archives annuelles par pays NASA FIRMS (cahier des charges §4.4).

Fichiers attendus dans data/raw/firms/archives/ (voir telecharger-archives.ps1) :
    modis_<année>_Gabon.csv, viirs-snpp_<année>_Gabon.csv, viirs-jpss1_<année>_Gabon.csv

L'import est idempotent : réimporter un fichier n'ajoute aucune ligne (test T15).
Une harmonisation incrémentale est lancée à la fin, puis le masque des sources statiques
est reconstruit et l'harmonisation complète relancée pour reclasser le temps réel.

    python -m scripts.import_archives
"""

import argparse
import asyncio
import re
from pathlib import Path

import asyncpg

from scripts.ingest_firms import connection_url
from scripts.ingest_firms_batch import import_file

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = ROOT / "data" / "raw" / "firms" / "archives"
SOURCES = {
    "modis": "MODIS_SP_COUNTRY",
    "viirs-snpp": "VIIRS_SNPP_SP_COUNTRY",
    "viirs-jpss1": "VIIRS_NOAA20_SP_COUNTRY",
}
PATTERN = re.compile(r"^(modis|viirs-snpp|viirs-jpss1)_(\d{4})_([A-Za-z_]+)\.csv$")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", default=str(DEFAULT_DIR))
    parser.add_argument("--no-harmonize", action="store_true")
    args = parser.parse_args()
    files = sorted(p for p in Path(args.input_dir).glob("*.csv") if PATTERN.match(p.name))
    if not files:
        raise SystemExit(f"Aucune archive trouvée dans {args.input_dir}. Lancez d'abord telecharger-archives.ps1.")

    connection = await asyncpg.connect(connection_url())
    totals = {"files": 0, "received": 0, "inserted": 0, "rejected": 0}
    try:
        for path in files:
            product = PATTERN.match(path.name).group(1)
            result = await import_file(connection, SOURCES[product], path)
            totals["files"] += 1
            totals["received"] += result["received"]
            totals["inserted"] += result["detections_inserted"]
            totals["rejected"] += result["rejected"]
            print(result)
    finally:
        await connection.close()
    print({"archives": totals})

    if not args.no_harmonize:
        from app.services.harmonization import run_harmonization
        from scripts.build_static_mask import build_mask, build_reference_domain

        print(await run_harmonization("incremental"))
        print(await build_mask())
        # Le masque change le classement des détections temps réel : recalcul complet.
        print(await run_harmonization("full"))
        print(await build_reference_domain())


if __name__ == "__main__":
    asyncio.run(main())
