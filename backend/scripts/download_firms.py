"""Télécharge un lot FIRMS mondial ou régional, sans exposer la clé."""

import argparse
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.settings import settings


SOURCES = [
    "MODIS_NRT",
    "VIIRS_SNPP_NRT",
    "VIIRS_NOAA20_NRT",
    "VIIRS_NOAA21_NRT",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=5, choices=range(1, 6))
    parser.add_argument("--scope", default="world")
    parser.add_argument("--output-dir", default="../data/raw/firms/history")
    args = parser.parse_args()

    if not settings.firms_map_key:
        raise RuntimeError("FIRMS_MAP_KEY est absent du fichier backend/.env")

    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = Path(__file__).resolve().parent.parent / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    with httpx.Client(timeout=180, follow_redirects=True) as client:
        for source in SOURCES:
            url = (
                "https://firms.modaps.eosdis.nasa.gov/api/area/csv/"
                f"{settings.firms_map_key}/{source}/{args.scope}/{args.days}"
            )
            response = client.get(url)
            response.raise_for_status()
            target = output_dir / f"{source}_{args.scope}_{args.days}d_{stamp}.csv"
            target.write_bytes(response.content)
            print({"source": source, "file": str(target), "bytes": len(response.content)})


if __name__ == "__main__":
    main()
