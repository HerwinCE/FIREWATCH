"""Harmonisation mondiale optimisée avec PostGIS et ST_ClusterDBSCAN."""

import asyncio

import asyncpg

from app.settings import settings


METHOD_VERSION = "cluster-dbscan-v2.0-6h-2km"


def connection_url() -> str:
    return settings.database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def main() -> None:
    connection = await asyncpg.connect(connection_url())
    try:
        async with connection.transaction():
            await connection.execute("SET LOCAL statement_timeout = '10min'")

            await connection.execute(
                """
                DELETE FROM firewatch.event_detections
                WHERE event_id IN (
                    SELECT id FROM firewatch.harmonized_events
                    WHERE method_version = $1
                )
                """,
                METHOD_VERSION,
            )
            await connection.execute(
                "DELETE FROM firewatch.harmonized_events WHERE method_version = $1",
                METHOD_VERSION,
            )

            await connection.execute(
                """
                CREATE TEMP TABLE tmp_event_labels ON COMMIT DROP AS
                SELECT
                    d.id AS detection_id,
                    date_bin(
                        INTERVAL '6 hours',
                        d.acquisition_time,
                        TIMESTAMPTZ '2000-01-01 00:00:00+00'
                    ) AS bucket_start,
                    ST_ClusterDBSCAN(
                        ST_Transform(d.geometry, 3857),
                        eps => 2000,
                        minpoints => 1
                    ) OVER (
                        PARTITION BY date_bin(
                            INTERVAL '6 hours',
                            d.acquisition_time,
                            TIMESTAMPTZ '2000-01-01 00:00:00+00'
                        )
                    ) AS cluster_id
                FROM firewatch.detections d
                """
            )
            await connection.execute(
                "CREATE INDEX ON tmp_event_labels (detection_id)"
            )

            await connection.execute(
                """
                CREATE TEMP TABLE tmp_event_groups ON COMMIT DROP AS
                SELECT
                    md5(
                        bucket_start::text || ':' ||
                        cluster_id::text || ':' ||
                        min(d.acquisition_time)::text
                    ) AS event_hash,
                    bucket_start,
                    cluster_id,
                    ST_Centroid(ST_Collect(d.geometry)) AS centroid,
                    min(d.acquisition_time) AS start_time,
                    max(d.acquisition_time) AS end_time,
                    count(*)::integer AS detection_count,
                    count(DISTINCT d.sensor)::integer AS sensor_count,
                    max(d.frp) AS max_frp
                FROM tmp_event_labels l
                JOIN firewatch.detections d ON d.id = l.detection_id
                GROUP BY bucket_start, cluster_id
                """
            )

            inserted = await connection.fetchval(
                """
                WITH inserted AS (
                    INSERT INTO firewatch.harmonized_events
                        (event_code, centroid, start_time, end_time,
                         detection_count, sensor_count, max_frp,
                         harmonization_score, method_version, status)
                    SELECT
                        'FW2-' || event_hash,
                        centroid,
                        start_time,
                        end_time,
                        detection_count,
                        sensor_count,
                        max_frp,
                        NULL,
                        $1,
                        'PROBABLE'
                    FROM tmp_event_groups
                    ON CONFLICT (event_code) DO NOTHING
                    RETURNING id
                )
                SELECT COUNT(*) FROM inserted
                """,
                METHOD_VERSION,
            )

            await connection.execute(
                """
                INSERT INTO firewatch.event_detections
                    (event_id, detection_id)
                SELECT e.id, l.detection_id
                FROM tmp_event_labels l
                JOIN firewatch.detections d ON d.id = l.detection_id
                JOIN tmp_event_groups g
                  ON g.bucket_start = l.bucket_start
                 AND g.cluster_id = l.cluster_id
                JOIN firewatch.harmonized_events e
                  ON e.event_code = 'FW2-' || g.event_hash
                 AND e.method_version = $1
                ON CONFLICT DO NOTHING
                """,
                METHOD_VERSION,
            )

            await connection.execute(
                """
                WITH calculated AS (
                    SELECT
                        ed.event_id,
                        ed.detection_id,
                        ST_Distance(
                            d.geometry::geography,
                            e.centroid::geography
                        ) / 1000.0 AS distance_km,
                        abs(EXTRACT(EPOCH FROM (
                            d.acquisition_time -
                            (e.start_time + (e.end_time - e.start_time) / 2)
                        ))) / 3600.0 AS time_difference_hours,
                        CASE
                            WHEN e.detection_count = 1 THEN 0.0
                            ELSE
                                0.6 * GREATEST(
                                    0.0,
                                    1.0 - (
                                        ST_Distance(
                                            d.geometry::geography,
                                            e.centroid::geography
                                        ) / 1000.0 / 2.0
                                    )
                                )
                                + 0.4 * GREATEST(
                                    0.0,
                                    1.0 - (
                                        abs(EXTRACT(EPOCH FROM (
                                            d.acquisition_time -
                                            (e.start_time + (e.end_time - e.start_time) / 2)
                                        ))) / 3600.0 / 6.0
                                    )
                                )
                        END AS association_score
                    FROM firewatch.event_detections ed
                    JOIN firewatch.detections d ON d.id = ed.detection_id
                    JOIN firewatch.harmonized_events e ON e.id = ed.event_id
                    WHERE e.method_version = $1
                )
                UPDATE firewatch.event_detections ed
                SET distance_km = calculated.distance_km,
                    time_difference_hours = calculated.time_difference_hours,
                    association_score = calculated.association_score
                FROM calculated
                WHERE ed.event_id = calculated.event_id
                  AND ed.detection_id = calculated.detection_id
                """,
                METHOD_VERSION,
            )

            await connection.execute(
                """
                UPDATE firewatch.harmonized_events e
                SET harmonization_score = scores.mean_score
                FROM (
                    SELECT event_id, AVG(association_score) AS mean_score
                    FROM firewatch.event_detections
                    GROUP BY event_id
                ) scores
                WHERE e.id = scores.event_id
                  AND e.method_version = $1
                """,
                METHOD_VERSION,
            )

        summary = await connection.fetchrow(
            """
            SELECT COUNT(*) AS events,
                   COALESCE(SUM(detection_count), 0) AS linked_detections,
                   AVG(harmonization_score) AS average_score
            FROM firewatch.harmonized_events
            WHERE method_version = $1
            """,
            METHOD_VERSION,
        )
        print({
            "status": "OK",
            "method_version": METHOD_VERSION,
            "events": summary["events"],
            "linked_detections": summary["linked_detections"],
            "average_score": summary["average_score"],
        })
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
