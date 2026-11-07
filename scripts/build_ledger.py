#!/usr/bin/env python3
"""Build the model's parameter set from the human-readable ledger.

    data/params/parameter_ledger.csv  ->  app/src/model/params.generated.json

The ledger is the single source of truth for every number the simulation uses. This
script refuses to build if a row is malformed, so a parameter cannot reach the model
without a unit, a tier and (unless it is explicitly *assumed*) a source.

Tiers
  measured  value read from a cited measurement (text/table/figure of the source)
  standard  textbook / compiled physical constant with a citable source
  derived   computed from other ledger rows or cited values; the arithmetic is in `note`
  fitted    calibrated by scripts/calibrate.* against the targets in data/calibration/
  assumed   no source found; a modelling choice, shown as *assumed* in the UI

Run:  python3 scripts/build_ledger.py   (also exposed as `npm run ledger`)
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "data" / "params" / "parameter_ledger.csv"
REFS = ROOT / "data" / "params" / "references.csv"
OUT = ROOT / "app" / "src" / "model" / "params.generated.json"

TIERS = {"measured", "standard", "derived", "fitted", "assumed"}
REQUIRED = ["id", "value", "unit", "tier", "group", "description", "source", "note"]
ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def main() -> int:
    refs = {}
    with REFS.open(newline="") as fh:
        for row in csv.DictReader(fh):
            refs[row["key"]] = row
    errors: list[str] = []
    seen: set[str] = set()
    entries = []
    with LEDGER.open(newline="") as fh:
        reader = csv.DictReader(fh)
        missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
        if missing:
            print(f"ledger is missing columns: {missing}", file=sys.stderr)
            return 1
        for n, row in enumerate(reader, start=2):
            pid = row["id"].strip()
            where = f"line {n} ({pid or '?'})"
            if not ID_RE.match(pid):
                errors.append(f"{where}: bad id")
                continue
            if pid in seen:
                errors.append(f"{where}: duplicate id")
            seen.add(pid)
            try:
                value = float(row["value"])
            except ValueError:
                errors.append(f"{where}: value {row['value']!r} is not a number")
                continue
            tier = row["tier"].strip()
            if tier not in TIERS:
                errors.append(f"{where}: tier {tier!r} not in {sorted(TIERS)}")
            if not row["unit"].strip():
                errors.append(f"{where}: empty unit (use '1' for dimensionless)")
            source = row["source"].strip()
            if tier != "assumed":
                keys = [k for k in re.split(r"[;\s]+", source) if k]
                if not keys:
                    errors.append(f"{where}: tier {tier} needs a source")
                for k in keys:
                    if k.startswith("ledger:"):
                        if k[7:] not in seen and k[7:] not in {r["id"] for r in entries}:
                            pass  # forward references are resolved below
                    elif k.startswith("repo:") or k.startswith("calibration:"):
                        pass
                    elif k not in refs:
                        errors.append(f"{where}: source key {k!r} is not in references.csv")
            entries.append(
                {
                    "id": pid,
                    "value": value,
                    "unit": row["unit"].strip(),
                    "tier": tier,
                    "group": row["group"].strip(),
                    "description": row["description"].strip(),
                    "source": source,
                    "note": row["note"].strip(),
                }
            )
    ids = {e["id"] for e in entries}
    for e in entries:
        for k in re.split(r"[;\s]+", e["source"]):
            if k.startswith("ledger:") and k[7:] not in ids:
                errors.append(f"{e['id']}: derived from unknown ledger id {k[7:]!r}")
    if errors:
        print("parameter ledger has errors:", file=sys.stderr)
        for e in errors:
            print("  -", e, file=sys.stderr)
        return 1
    used_refs = sorted({k for e in entries for k in re.split(r"[;\s]+", e["source"]) if k in refs})
    out = {
        "generated_from": "data/params/parameter_ledger.csv",
        "params": entries,
        "references": [refs[k] for k in used_refs],
    }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    counts = {t: sum(1 for e in entries if e["tier"] == t) for t in sorted(TIERS)}
    print(f"wrote {OUT.relative_to(ROOT)}: {len(entries)} params {counts}, {len(used_refs)} references")
    return 0


if __name__ == "__main__":
    sys.exit(main())
