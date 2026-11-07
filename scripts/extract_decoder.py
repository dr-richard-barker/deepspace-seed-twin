#!/usr/bin/env python3
"""Extract per-cell-type stress susceptibility from deepspace-seed-stress-decoder.

Reads the decoder's reference matrix (GSEA normalised enrichment scores, NES, of 49
stress contrasts projected onto 123 seed panels) and keeps the 15 germinating-embryo
clusters of Liew et al. 2024 (germ_cluster::1..15). For each stressor class it averages
the NES over that class's contrasts. Writes data/decoder/nes_by_cluster.json, which the
twin uses to colour cells by OBSERVED susceptibility (real data) beside the SIMULATED
exposure.

Excluded on purpose (see the plan's "do not use as inputs"):
  desiccation_seed            built from the same file as the dry_seed panel (circular)
  ros_spaceflight_latent_shift   a log reconstruction-error ratio, not a fold change

Run: python3 scripts/extract_decoder.py
"""
from __future__ import annotations

import csv
import json
import statistics
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEC = ROOT.parent / "deepspace-seed-stress-decoder"
MATRIX = "results/tables/decoder_nes_matrix_v8.csv"
CLASSES = "results/tables/contrast_classes.csv"
CLUSTERS = "panels/germination_cluster_annotations.csv"
EXCLUDE = {"desiccation_seed", "ros_spaceflight_latent_shift"}


def commit(rel: str) -> str:
    return subprocess.run(["git", "-C", str(DEC), "log", "-1", "--format=%h", "--", rel], capture_output=True, text=True).stdout.strip()


def main() -> None:
    classes = {}
    with (DEC / CLASSES).open() as fh:
        for r in csv.reader(fh):
            if r and r[0] and r[0] != "":
                if r[1] != "stressor_class":
                    classes[r[0]] = r[1]
    with (DEC / MATRIX).open() as fh:
        rows = list(csv.reader(fh))
    header = rows[0]
    contrasts = header[1:]
    clusters = {}
    with (DEC / CLUSTERS).open() as fh:
        for r in csv.DictReader(fh):
            clusters[r["cluster"]] = r
    by_class: dict[str, dict[str, float]] = {}
    contrasts_used: dict[str, list[str]] = {}
    for r in rows[1:]:
        term = r[0]
        if not term.startswith("germ_cluster::"):
            continue
        cl = term.split("::")[1]
        vals: dict[str, list[float]] = {}
        for c, v in zip(contrasts, r[1:]):
            if c in EXCLUDE or c not in classes or v in ("", "NA", "nan"):
                continue
            vals.setdefault(classes[c], []).append(float(v))
            contrasts_used.setdefault(classes[c], [])
            if c not in contrasts_used[classes[c]]:
                contrasts_used[classes[c]].append(c)
        for k, v in vals.items():
            by_class.setdefault(k, {})[cl] = round(statistics.fmean(v), 4)
    out = {
        "description": "Mean GSEA NES per stressor class for the 15 germinating-embryo clusters (Liew et al. 2024, 12/24/48 h after imbibition). Positive = the stress signature is enriched in that cell type's marker programme. OBSERVED data from the decoder, not model output.",
        "source": f"repo:deepspace-seed-stress-decoder/{MATRIX}@{commit(MATRIX)}",
        "classes_source": f"repo:deepspace-seed-stress-decoder/{CLASSES}@{commit(CLASSES)}",
        "excluded_contrasts": sorted(EXCLUDE),
        "contrasts_by_class": contrasts_used,
        "clusters": {k: {"cell_type": v["cell_type"], "organ": v["organ"], "peak_time": v["peak_time"]} for k, v in clusters.items()},
        "nes": by_class,
    }
    dst = ROOT / "data" / "decoder" / "nes_by_cluster.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", dst.relative_to(ROOT), "classes:", sorted(by_class))


if __name__ == "__main__":
    main()
