"""Construit le masque des sources statiques (cahier des charges §3.3.4).

Cellules de 0,01° contenant au moins une détection d'archive SP de type 1 (volcan),
2 (source terrestre statique : torchère, industrie) ou 3 (offshore), plus les 8 cellules
voisines : un tampon d'environ 1 km. Une détection temps réel (sans attribut type)
qui tombe dans le masque est ensuite classée non végétale (type_basis = static_mask).

    python -m scripts.build_static_mask
"""

import asyncio
from collections import Counter, defaultdict

import asyncpg

from app.services.harmonization import connection_url


def buffered_cells(cells: dict[str, Counter]) -> dict[str, int]:
    """{cellule: compteur des types} -> {cellule ou voisine: type majoritaire}."""
    votes: dict[str, Counter] = defaultdict(Counter)
    for cell, types in cells.items():
        row, col = (int(v) for v in cell.split("_"))
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                votes[f"{row + dr}_{col + dc}"].update(types)
    return {cell: counter.most_common(1)[0][0] for cell, counter in votes.items()}


async def build_mask() -> dict:
    connection = await asyncpg.connect(connection_url())
    try:
        rows = await connection.fetch(
            """SELECT grid_cell_id, detection_type, COUNT(*) AS n
               FROM firewatch.harmonized_detections
               WHERE type_basis = 'firms_type' AND detection_type IN (1, 2, 3)
               GROUP BY 1, 2"""
        )
        cells: dict[str, Counter] = defaultdict(Counter)
        for r in rows:
            cells[r["grid_cell_id"]][r["detection_type"]] += r["n"]
        mask = buffered_cells(cells)
        async with connection.transaction():
            await connection.execute("DELETE FROM firewatch.static_source_mask")
            await connection.copy_records_to_table(
                "static_source_mask", schema_name="firewatch",
                records=[(cell, "firms_type_archive", t) for cell, t in mask.items()],
                columns=["grid_cell_id", "origin", "detection_type"],
            )
        return {"static_mask": {"source_cells": len(cells), "mask_cells": len(mask),
                                "by_type": dict(Counter(mask.values()))}}
    finally:
        await connection.close()


async def build_reference_domain() -> dict:
    """Carreaux de 0,1° contenant au moins une détection d'archive : territoire couvert par l'historique."""
    connection = await asyncpg.connect(connection_url())
    try:
        async with connection.transaction():
            await connection.execute("DELETE FROM firewatch.reference_domain")
            await connection.execute(
                """INSERT INTO firewatch.reference_domain (tile)
                   SELECT DISTINCT floor(latitude * 10)::int || '_' || floor(longitude * 10)::int
                   FROM firewatch.harmonized_detections WHERE quality_level = 'SP'""")
        return {"reference_domain_tiles": await connection.fetchval("SELECT COUNT(*) FROM firewatch.reference_domain")}
    finally:
        await connection.close()


if __name__ == "__main__":
    print(asyncio.run(build_mask()))
    print(asyncio.run(build_reference_domain()))
