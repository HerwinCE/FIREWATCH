"""Harmonisation incrémentale : fenêtre de jours et numérotation stable des groupes."""

from datetime import date, datetime, timezone

from app.services.harmonization import _day_ranges, _numbering


def test_day_ranges_merge_contiguous_days():
    t = lambda d: datetime(2026, 11, d, 12, tzinfo=timezone.utc)
    assert _day_ranges([t(10), t(11), t(20)], 1) == [
        (date(2026, 11, 9), date(2026, 11, 13)), (date(2026, 11, 19), date(2026, 11, 22))]


def test_numbering_keeps_existing_group_ids():
    existing = [{"detection_id": "a", "group_id": 7}, {"detection_id": "b", "group_id": 7}, {"detection_id": "c", "group_id": None}]
    links = [("a", 1, False), ("b", 1, False), ("n", 1, False), ("c", None, True), ("x", 2, False), ("y", 2, False)]
    state = _numbering(links, existing, offset=50)
    assert state["a"] == state["b"] == state["n"] == (7, False)       # le groupe 7 garde son numéro
    assert state["x"][0] == state["y"][0] == 51                       # nouveau groupe : numéro neuf
    assert state["c"] == (None, True)


def test_numbering_split_group_gets_one_new_id():
    existing = [{"detection_id": k, "group_id": 4} for k in "abcd"]
    links = [("a", 1, False), ("b", 1, False), ("c", 2, False), ("d", 2, False)]
    state = _numbering(links, existing, offset=10)
    assert {state["a"][0], state["c"][0]} == {4, 11}


def test_cells_sql_builds_key_set_and_bbox():
    from app.zone_api import cells_sql
    clause, box = cells_sql([[0, 10, 12], [1, 10, 10], [999, 0, 1]])  # ligne hors bornes ignorée
    assert "ANY('{" in clause and clause.count(",") == 3
    assert box == (5.0, 0.0, 6.5, 1.0)
