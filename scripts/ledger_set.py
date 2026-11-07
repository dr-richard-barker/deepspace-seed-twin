#!/usr/bin/env python3
"""Update or add ledger rows from a small Python spec (used when sourced values arrive).

    from ledger_set import update
    update({"geo_seed_length_um": dict(value=490, tier="measured", source="klasen2025", note="...")})
"""
from __future__ import annotations

import csv
import io
from pathlib import Path

LEDGER = Path(__file__).resolve().parent.parent / "data" / "params" / "parameter_ledger.csv"


def update(spec: dict[str, dict], add_defaults: dict | None = None) -> None:
    rows = list(csv.DictReader(LEDGER.open(newline="")))
    fields = list(rows[0].keys())
    by_id = {r["id"]: r for r in rows}
    for pid, changes in spec.items():
        if pid not in by_id:
            if add_defaults is None and "unit" not in changes:
                raise KeyError(f"{pid} not in ledger and no unit/group given")
            row = {f: "" for f in fields}
            row["id"] = pid
            rows.append(row)
            by_id[pid] = row
        for k, v in changes.items():
            by_id[pid][k] = str(v)
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=fields, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    LEDGER.write_text(out.getvalue())
