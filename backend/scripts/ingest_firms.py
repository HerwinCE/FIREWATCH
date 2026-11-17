"""Importe les CSV FIRMS dans RAW puis dans les détections normalisées."""

import asyncio
import argparse
import csv
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import asyncpg

from app.settings import settings


ROOT = Path(__file__).resolve().parents[2]
INPUT_DIR = ROOT / "data" / "raw" / "firms"

SOURCE_PREFIXES = (
    "MODIS_NRT",
    "VIIRS_SNPP_NRT",
    "VIIRS_NOAA20_NRT",
    "VIIRS_NOAA21_NRT",
)

SATELLITE_NAMES = {
    "N20": "NOAA-20",
    "N21": "NOAA-21",
    "NPP": "Suomi-NPP",
}


def connection_url() -> str:
    return settings.database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


def parse_acquisition_time(row: dict[str, str]) -> datetime:
    date = datetime.strptime(row["acq_date"], "%Y-%m-%d").date()
    # FIRMS fournit acq_time au format HHMM (UTC), parfois sans zéros initiaux : "104" = 01:04.
    hhmm = row["acq_time"].strip().zfill(4)
    hours, minutes = int(hhmm[:2]), int(hhmm[2:])
    if not (0 <= hours < 24 and 0 <= minutes < 60):
        raise ValueError(f"acq_time invalide : {row['acq_time']}")
    return datetime.combine(date, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=hours, minutes=minutes)


def row_identity(row: dict[str, str], source_name: str) -> str:
    serialized = json.dumps(
        {"source": source_name, "row": row},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


async def get_source_id(connection, source_name: str):
    return await connection.fetchval(
        "SELECT id FROM firewatch.sources WHERE name = $1",
        source_name,
    )


async def import_source(connection, source_name: str, path: Path) -> dict[str, int | str]:
    if not path.exists():
        return {"source": source_name, "status": "MISSING", "received": 0, "inserted": 0, "rejected": 0}

    source_id = await get_source_id(connection, source_name)
    if source_id is None:
        raise RuntimeError(f"Source non initialisée en base : {source_name}")

    received = inserted = rejected = 0
    async with connection.transaction():
        run_id = await connection.fetchval(
            """
            INSERT INTO firewatch.ingestion_runs (source_id, status, request_parameters)
            VALUES ($1, 'RUNNING', $2::jsonb)
            RETURNING id
            """,
            source_id,
            json.dumps({"file": str(path.relative_to(ROOT)), "scope": "world", "days": 1}),
        )

        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                received += 1
                try:
                    latitude = float(row["latitude"])
                    longitude = float(row["longitude"])
                    acquisition_time = parse_acquisition_time(row)
                    external_id = row_identity(row, source_name)
                    satellite = SATELLITE_NAMES.get(row.get("satellite", ""), row.get("satellite", "UNKNOWN"))
                    instrument = row.get("instrument", source_name.split("_")[0])
                    confidence = row.get("confidence") or None
                    frp_value = float(row["frp"]) if row.get("frp") else None
                    payload = json.dumps(row, ensure_ascii=False)

                    raw_id = await connection.fetchval(
                        """
                        INSERT INTO firewatch.raw_detections
                            (source_id, external_id, payload, payload_hash)
                        VALUES ($1, $2, $3::jsonb, $4)
                        ON CONFLICT (source_id, external_id)
                        DO UPDATE SET payload = EXCLUDED.payload
                        RETURNING id
                        """,
                        source_id,
                        external_id,
                        payload,
                        external_id,
                    )
                    if raw_id is None:
                        raw_id = await connection.fetchval(
                            "SELECT id FROM firewatch.raw_detections WHERE source_id = $1 AND external_id = $2",
                            source_id,
                            external_id,
                        )

                    result = await connection.execute(
                        """
                        INSERT INTO firewatch.detections
                            (source_id, raw_detection_id, external_id, sensor, satellite,
                             instrument, acquisition_time, latitude, longitude,
                             confidence, frp, daynight, source_product)
                        VALUES
                            ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                             $10, $11, $12, $13)
                        ON CONFLICT (source_id, external_id) DO NOTHING
                        """,
                        source_id,
                        raw_id,
                        external_id,
                        "MODIS" if instrument == "MODIS" else "VIIRS",
                        satellite,
                        instrument,
                        acquisition_time,
                        latitude,
                        longitude,
                        confidence,
                        frp_value,
                        row.get("daynight") or None,
                        row.get("version") or source_name,
                    )
                    if result.endswith("1"):
                        inserted += 1
                except (KeyError, TypeError, ValueError):
                    rejected += 1

        status = "SUCCEEDED" if rejected == 0 else "PARTIAL"
        await connection.execute(
            """
            UPDATE firewatch.ingestion_runs
            SET finished_at = now(), status = $2,
                records_received = $3, records_inserted = $4, records_rejected = $5
            WHERE id = $1
            """,
            run_id,
            status,
            received,
            inserted,
            rejected,
        )

    return {
        "source": source_name,
        "status": "OK",
        "received": received,
        "inserted": inserted,
        "rejected": rejected,
    }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", default=str(INPUT_DIR))
    args = parser.parse_args()
    input_dir = Path(args.input_dir)
    if not input_dir.is_absolute():
        input_dir = Path(__file__).resolve().parent.parent / input_dir
    input_dir = input_dir.resolve()

    connection = await asyncpg.connect(connection_url())
    try:
        results = []
        for source_name in SOURCE_PREFIXES:
            files = sorted(input_dir.glob(f"{source_name}_*.csv"))
            if files:
                results.append(await import_source(connection, source_name, files[-1]))
            else:
                results.append({
                    "source": source_name,
                    "status": "MISSING",
                    "received": 0,
                    "inserted": 0,
                    "rejected": 0,
                })
        for result in results:
            print(result)
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
