#!/usr/bin/env python3
"""Copy calibrated values from data/calibration/fit_result.json into the ledger (tier "fitted").

Run after scripts/calibrate.ts (or scripts/calibrate_seedling.ts, which writes
data/calibration/fit_seedling.json): python3 scripts/apply_fit.py [fit file]
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ledger_set import update  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "data" / "calibration" / "fit_result.json"
fit = json.loads(path.read_text())
rel = path.relative_to(ROOT)
targets = ", ".join(t["id"] for t in fit["targets"])
update({
    pid: dict(value=f"{v:.6g}", tier="fitted", source=f"calibration:{rel}",
              note=f"fitted ({fit['method']}; loss {fit['loss']:.3g}) against: {targets}")
    for pid, v in fit["fitted"].items()
})
print(f"applied {len(fit['fitted'])} fitted values from {rel}")
