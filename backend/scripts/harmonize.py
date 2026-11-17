"""Lance l'harmonisation MODIS / VIIRS (pipeline §3.3) en ligne de commande.

Exemples :
    python -m scripts.harmonize                 # incrémental
    python -m scripts.harmonize --mode full     # recalcul complet
"""

import argparse
import asyncio

from app.services.harmonization import run_harmonization


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["incremental", "full"], default="incremental")
    parser.add_argument("--cluster-max-km", type=float, default=None)
    parser.add_argument("--cluster-max-hours", type=float, default=None)
    args = parser.parse_args()
    print(asyncio.run(run_harmonization(args.mode, args.cluster_max_km, args.cluster_max_hours)))


if __name__ == "__main__":
    main()
