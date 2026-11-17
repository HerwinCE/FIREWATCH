"""Import FIRMS par lots PostgreSQL pour les fichiers mondiaux volumineux."""

import argparse
import asyncio
import csv
import hashlib
import json
from pathlib import Path

import asyncpg

from app.settings import settings
from scripts.ingest_firms import (
    SATELLITE_NAMES,
    SOURCE_PREFIXES,
    connection_url,
    parse_acquisition_time,
)


def row_identity(row: dict[str, str], source_name: str) -> str:
    payload = json.dumps(
        {"source": source_name, "row": row},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def import_file(connection, source_name: str, path: Path) -> dict:
    source_id = await connection.fetchval(
        "SELECT id FROM firewatch.sources WHERE name = $1",
        source_name,
    )
    if source_id is None:
        raise RuntimeError(f"Source inconnue : {source_name}")

    records = []
    rejected = 0
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            try:
                latitude = float(row["latitude"])
                longitude = float(row["longitude"])
                external_id = row_identity(row, source_name)
                instrument = row.get("instrument", source_name.split("_")[0])
                satellite = SATELLITE_NAMES.get(row.get("satellite", ""), row.get("satellite", "UNKNOWN"))
                frp = float(row["frp"]) if row.get("frp") else None
                payload = json.dumps(row, ensure_ascii=False)
                records.append(
                    (
                        source_id,
                        external_id,
                        payload,
                        external_id,
                        "MODIS" if instrument == "MODIS" else "VIIRS",
                        satellite,
                        instrument,
                        parse_acquisition_time(row),
                        latitude,
                        longitude,
                        row.get("confidence") or None,
                        frp,
                        row.get("daynight") or None,
                        row.get("version") or source_name,
                    )
                )
            except (KeyError, TypeError, ValueError):
                rejected += 1

    async with connection.transaction():
        run_id = await connection.fetchval(
            """
            INSERT INTO firewatch.ingestion_runs
                (source_id, status, request_parameters, records_received, records_rejected)
            VALUES ($1, 'RUNNING', $2::jsonb, $3, $4)
            RETURNING id
            """,
            source_id,
            json.dumps({"file": str(path), "mode": "batch"}),
            len(records) + rejected,
            rejected,
        )

        await connection.execute(
            """
            CREATE TEMP TABLE tmp_firms_records (
                source_id UUID,
                external_id TEXT,
                payload JSONB,
                payload_hash CHAR(64),
                sensor TEXT,
                satellite TEXT,
                instrument TEXT,
                acquisition_time TIMESTAMPTZ,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                confidence TEXT,
                frp DOUBLE PRECISION,
                daynight CHAR(1),
                source_product TEXT
            ) ON COMMIT DROP
            """
        )
        await connection.copy_records_to_table(
            "tmp_firms_records",
            records=records,
            columns=[
                "source_id", "external_id", "payload", "payload_hash", "sensor",
                "satellite", "instrument", "acquisition_time", "latitude",
                "longitude", "confidence", "frp", "daynight", "source_product",
            ],
        )
        raw_inserted = await connection.fetchval(
            """
            WITH inserted AS (
                INSERT INTO firewatch.raw_detections
                    (source_id, external_id, payload, payload_hash)
                SELECT source_id, external_id, payload, payload_hash
                FROM tmp_firms_records
                ON CONFLICT DO NOTHING
                RETURNING id
            )
            SELECT COUNT(*) FROM inserted
            """
        )
        detection_inserted = await connection.fetchval(
            """
            WITH inserted AS (
                INSERT INTO firewatch.detections
                    (source_id, raw_detection_id, external_id, sensor, satellite,
                     instrument, acquisition_time, latitude, longitude,
                     confidence, frp, daynight, source_product)
                SELECT t.source_id, r.id, t.external_id, t.sensor, t.satellite,
                       t.instrument, t.acquisition_time, t.latitude, t.longitude,
                       t.confidence, t.frp, t.daynight, t.source_product
                FROM tmp_firms_records t
                JOIN firewatch.raw_detections r
                  ON r.source_id = t.source_id AND r.external_id = t.external_id
                ON CONFLICT DO NOTHING
                RETURNING id
            )
            SELECT COUNT(*) FROM inserted
            """
        )
        await connection.execute(
            """
            UPDATE firewatch.ingestion_runs
            SET finished_at = now(), status = 'SUCCEEDED',
                records_inserted = $2
            WHERE id = $1
            """,
            run_id,
            detection_inserted,
        )

    return {
        "source": source_name,
        "file": path.name,
        "received": len(records) + rejected,
        "raw_inserted": raw_inserted,
        "detections_inserted": detection_inserted,
        "rejected": rejected,
    }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", default="../data/raw/firms/history")
    parser.add_argument("--sources", nargs="*", default=list(SOURCE_PREFIXES))
    parser.add_argument("--no-harmonize", action="store_true",
                        help="ne pas lancer l'harmonisation incrémentale après l'import")
    args = parser.parse_args()
    input_dir = Path(args.input_dir)
    if not input_dir.is_absolute():
        input_dir = Path(__file__).resolve().parent.parent / input_dir
    input_dir = input_dir.resolve()

    connection = await asyncpg.connect(connection_url())
    try:
        for source_name in args.sources:
            files = sorted(input_dir.glob(f"{source_name}_*.csv"))
            if files:
                print(await import_file(connection, source_name, files[-1]))
    finally:
        await connection.close()
    if not args.no_harmonize:
        # EF-21 : harmonisation incrémentale automatique après chaque collecte.
        from app.services.harmonization import run_harmonization
        print(await run_harmonization("incremental"))


if __name__ == "__main__":
    asyncio.run(main())
