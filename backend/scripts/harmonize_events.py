"""Construit des événements probables à partir des détections MODIS/VIIRS."""

import asyncio
import math
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import asyncpg

from app.settings import settings


TIME_WINDOW_HOURS = 6.0
DISTANCE_KM = 2.0
METHOD_VERSION = "spatiotemporal-v1.0"


def connection_url() -> str:
    return settings.database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return radius * 2 * math.asin(math.sqrt(a))


def confidence_score(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        numeric = float(value)
        return max(0.0, min(1.0, numeric / 100.0))
    except ValueError:
        return {"h": 0.9, "n": 0.6, "l": 0.4}.get(value.lower())


def cell_for(lat: float, lon: float) -> tuple[int, int]:
    lat_cell = int(math.floor(lat * 111.0 / DISTANCE_KM))
    cos_lat = max(0.2, abs(math.cos(math.radians(lat))))
    lon_cell = int(math.floor(lon * 111.0 * cos_lat / DISTANCE_KM))
    return lat_cell, lon_cell


class UnionFind:
    def __init__(self, size: int):
        self.parent = list(range(size))

    def find(self, item: int) -> int:
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, left: int, right: int) -> None:
        root_left, root_right = self.find(left), self.find(right)
        if root_left != root_right:
            self.parent[root_right] = root_left


async def main() -> None:
    connection = await asyncpg.connect(connection_url())
    try:
        rows = await connection.fetch(
            """
            SELECT d.id, d.acquisition_time, d.latitude, d.longitude,
                   d.sensor, d.frp, d.confidence
            FROM firewatch.detections d
            ORDER BY d.acquisition_time
            """
        )
        if not rows:
            print({"status": "EMPTY", "detections": 0, "events": 0})
            return

        uf = UnionFind(len(rows))
        buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
        for index, row in enumerate(rows):
            lat, lon = float(row["latitude"]), float(row["longitude"])
            cell_lat, cell_lon = cell_for(lat, lon)
            current_time = row["acquisition_time"]
            for lat_offset in (-1, 0, 1):
                for lon_offset in (-1, 0, 1):
                    for previous_index in buckets[(cell_lat + lat_offset, cell_lon + lon_offset)]:
                        previous = rows[previous_index]
                        hours = abs((current_time - previous["acquisition_time"]).total_seconds()) / 3600
                        if hours > TIME_WINDOW_HOURS:
                            continue
                        distance = haversine_km(
                            lat,
                            lon,
                            float(previous["latitude"]),
                            float(previous["longitude"]),
                        )
                        if distance <= DISTANCE_KM:
                            uf.union(index, previous_index)
            buckets[(cell_lat, cell_lon)].append(index)

        groups: dict[int, list[int]] = defaultdict(list)
        for index in range(len(rows)):
            groups[uf.find(index)].append(index)

        async with connection.transaction():
            await connection.execute(
                "DELETE FROM firewatch.event_detections WHERE event_id IN "
                "(SELECT id FROM firewatch.harmonized_events WHERE method_version = $1)",
                METHOD_VERSION,
            )
            await connection.execute(
                "DELETE FROM firewatch.harmonized_events WHERE method_version = $1",
                METHOD_VERSION,
            )

            event_count = 0
            link_count = 0
            for members in groups.values():
                member_rows = [rows[index] for index in members]
                lat = sum(float(row["latitude"]) for row in member_rows) / len(member_rows)
                lon = sum(float(row["longitude"]) for row in member_rows) / len(member_rows)
                start_time = min(row["acquisition_time"] for row in member_rows)
                end_time = max(row["acquisition_time"] for row in member_rows)
                sensors = {row["sensor"] for row in member_rows}
                frps = [float(row["frp"]) for row in member_rows if row["frp"] is not None]
                confidences = [
                    score for row in member_rows
                    if (score := confidence_score(row["confidence"])) is not None
                ]

                if len(member_rows) == 1:
                    score = 0.0
                else:
                    pair_scores = []
                    reference = member_rows[0]
                    for row in member_rows[1:]:
                        distance = haversine_km(
                            float(reference["latitude"]),
                            float(reference["longitude"]),
                            float(row["latitude"]),
                            float(row["longitude"]),
                        )
                        hours = abs(
                            (reference["acquisition_time"] - row["acquisition_time"]).total_seconds()
                        ) / 3600
                        pair_scores.append(
                            0.5 * (1 - min(distance / DISTANCE_KM, 1))
                            + 0.3 * (1 - min(hours / TIME_WINDOW_HOURS, 1))
                            + 0.2 * (1 if reference["sensor"] != row["sensor"] else 0.5)
                        )
                    score = sum(pair_scores) / len(pair_scores)

                event_id = await connection.fetchval(
                    """
                    INSERT INTO firewatch.harmonized_events
                        (event_code, centroid_longitude, centroid_latitude, start_time, end_time,
                         detection_count, sensor_count, max_frp, mean_confidence,
                         harmonization_score, method_version, status)
                    VALUES
                        ($1, $2, $3, $4, $5, $6,
                         $7, $8, $9, $10, $11, 'PROBABLE')
                    RETURNING id
                    """,
                    f"FH-{uuid.uuid4().hex[:12].upper()}",
                    lon,
                    lat,
                    start_time,
                    end_time,
                    len(member_rows),
                    len(sensors),
                    max(frps) if frps else None,
                    sum(confidences) / len(confidences) if confidences else None,
                    score,
                    METHOD_VERSION,
                )
                await connection.executemany(
                    """
                    INSERT INTO firewatch.event_detections
                        (event_id, detection_id, distance_km, time_difference_hours, association_score)
                    VALUES ($1, $2, NULL, NULL, $3)
                    """,
                    [(event_id, row["id"], score) for row in member_rows],
                )
                event_count += 1
                link_count += len(member_rows)

        print({
            "status": "OK",
            "method_version": METHOD_VERSION,
            "detections": len(rows),
            "events": event_count,
            "event_detection_links": link_count,
            "time_window_hours": TIME_WINDOW_HOURS,
            "distance_km": DISTANCE_KM,
        })
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
