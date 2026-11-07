#!/usr/bin/env bash
# Rebuild every generated artefact from sources, in dependency order.
# Calibration is NOT re-run here (it is slow and its result is versioned in
# data/calibration/fit_*.json); run `npm run calibrate` / `npm run calibrate:seedling`
# and `python3 scripts/apply_fit.py <file>` first if the model changed.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/build_ledger.py
python3 scripts/extract_decoder.py          # needs ../deepspace-seed-stress-decoder
npm run lbm                                 # GBC1 seed-bed air speed (slow)
python3 scripts/build_environments.py       # needs ../Hardware_OSDR_review, ../LunarLeaf-CFD, ../LEAF_GBC2_pot_model
npm run gates
npm run kernels
python3 -m pytest python/tests -q
npm run export
python3 python/make_figures.py
python3 python/build_manuscript_inputs.py
(cd manuscript && tectonic -X compile main.tex && cp main.pdf deepspace_seed_twin_draft.pdf)
npm run build
