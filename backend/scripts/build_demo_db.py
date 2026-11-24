"""Construit une base de démonstration allégée (firewatch_demo) pour l'hébergement en ligne gratuit.

Conservé : toute la couche harmonisée (archives et temps réel), les événements, les petites tables de
référence. Écarté : les tables brutes (detections, raw_detections, event_detections, laissées vides) et
un index inutile en lecture seule. Environ 250 Mo, sous la limite d'une base Postgres gratuite (0,5 Go).

Usage (depuis le dossier backend) : .venv\\Scripts\\python scripts\\build_demo_db.py
La base principale n'est jamais modifiée.
"""

import asyncio
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

import asyncpg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.harmonization import connection_url  # noqa: E402

PG_BIN = Path(os.environ.get("PG_BIN", r"C:\Program Files\PostgreSQL\17\bin"))
DEMO = "firewatch_demo"
COPIES = {
    "sources": "SELECT * FROM firewatch.sources",
    "ingestion_runs": "SELECT * FROM firewatch.ingestion_runs",
    "harmonization_runs": "SELECT * FROM firewatch.harmonization_runs",
    "static_source_mask": "SELECT * FROM firewatch.static_source_mask",
    "reference_domain": "SELECT * FROM firewatch.reference_domain",
    "harmonized_detections": "SELECT * FROM firewatch.harmonized_detections",
    "harmonized_events": "SELECT * FROM firewatch.harmonized_events",
}
DROP_INDEXES = ["idx_hd_cell_time"]


async def main() -> None:
    src_url = connection_url()
    parts = urlsplit(src_url)
    env = dict(os.environ, PGPASSWORD=parts.password or "")
    common = ["-h", parts.hostname or "localhost", "-p", str(parts.port or 5432), "-U", parts.username or "postgres"]

    admin = await asyncpg.connect(src_url)
    await admin.execute(f"DROP DATABASE IF EXISTS {DEMO}")
    await admin.execute(f"CREATE DATABASE {DEMO}")
    await admin.close()

    # Schéma identique (tables, contraintes, index), sans données.
    schema = subprocess.run([str(PG_BIN / "pg_dump"), *common, "--schema-only", "--no-owner", "--no-acl",
                             "-n", "firewatch", parts.path.lstrip("/")], env=env, capture_output=True, check=True).stdout
    subprocess.run([str(PG_BIN / "psql"), *common, "-q", "-v", "ON_ERROR_STOP=1", "-d", DEMO], input=schema,
                   env=env, capture_output=True, check=True)

    demo_url = src_url.rsplit("/", 1)[0] + "/" + DEMO
    src, dst = await asyncpg.connect(src_url), await asyncpg.connect(demo_url)
    # Les tables brutes restent vides : on retire les clés étrangères qui les exigent, et les index inutiles.
    for table, name in await dst.fetch("""
            SELECT conrelid::regclass::text, conname FROM pg_constraint
            WHERE contype = 'f' AND connamespace = 'firewatch'::regnamespace"""):
        await dst.execute(f'ALTER TABLE {table} DROP CONSTRAINT "{name}"')
    for idx in DROP_INDEXES:
        await dst.execute(f"DROP INDEX IF EXISTS firewatch.{idx}")
    with tempfile.TemporaryDirectory() as tmp:
        for table, query in COPIES.items():
            path = Path(tmp) / f"{table}.copy"
            await src.copy_from_query(query, output=str(path), format="binary")
            await dst.copy_to_table(table, schema_name="firewatch", source=str(path), format="binary")
            print(f"{table:24s} {await dst.fetchval(f'SELECT COUNT(*) FROM firewatch.{table}'):>9,} lignes")
    await src.close()
    await dst.execute("VACUUM ANALYZE")
    print("taille :", await dst.fetchval("SELECT pg_size_pretty(pg_database_size(current_database()))"))
    await dst.close()


if __name__ == "__main__":
    asyncio.run(main())
