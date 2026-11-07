#!/usr/bin/env python3
"""Write data/environments/_fields.json: magnetic-field environments for the Stories video.

The seed twin has NO magnetic-field model. This file only feeds the "fields as an open
question" scene, so every value here is a sourced observation, not a model input.

  earth_surface   NOAA NCEI Geomagnetism FAQ (verbatim range, checked 2026-11-07)
  moon_30km       NASA PDS "Lunar Crustal Magnetic Field Map" (Hood et al. 2020),
                  doi:10.17189/1520494, file Bm_30km_65S65N_0E360E.tab, column B-Mag.
                  Statistics over non-zero cells (the PDS label: "Zero values indicate no
                  reliable data"). The table is downloaded on demand and pinned by SHA-256.
  dhiman2023      Dhiman, Wu & Galland, Protoplasma 260:767-786 (2023; Epub 2022-09-21),
                  doi:10.1007/s00709-022-01811-9. Claims quoted verbatim from the abstract
                  (Europe PMC record, PMID 36129584, checked 2026-11-07).
  gaps            environments for which no verified measurement is used.

Note: ~/Documents/lunar-magnetic-biology/data/processed/lunar_mag_field_grid.csv is NOT used.
It recomputes the magnitude from the smoothed components, which gives a lower field than the
PDS B-Mag column (mean 0.78 vs 0.99 nT over non-zero cells).

Run: python3 scripts/build_fields.py
"""
from __future__ import annotations

import hashlib
import json
import statistics
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "data" / "external"
TAB_URL = "https://pds-ppi.igpp.ucla.edu/data/lunar_crust_magnetic.field_map/data/Bm_30km_65S65N_0E360E.tab"
TAB_SHA256 = "9eeba2fe2482dfaadf6455c5908fae4412a883fd34fac42adc5cec9c169d7577"
TAB = EXT / "Bm_30km_65S65N_0E360E.tab"


def fetch_tab() -> Path:
    if not TAB.exists():
        EXT.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(TAB_URL, headers={"User-Agent": "deepspace-seed-twin build_fields.py"})
        with urllib.request.urlopen(req, timeout=120) as r:
            TAB.write_bytes(r.read())
    digest = hashlib.sha256(TAB.read_bytes()).hexdigest()
    if digest != TAB_SHA256:
        raise SystemExit(f"{TAB} sha256 {digest} != pinned {TAB_SHA256}; the PDS file changed, re-verify before use")
    return TAB


def lunar_stats(path: Path) -> dict:
    vals = []
    for line in path.read_text().splitlines():
        parts = line.split()
        if len(parts) != 6:
            continue
        try:
            row = [float(x) for x in parts]
        except ValueError:
            continue
        vals.append(row[2])  # B-Mag., nT
    nz = sorted(v for v in vals if v > 0)
    return {
        "n_cells": len(vals),
        "n_no_data": len(vals) - len(nz),
        "median_nT": round(statistics.median(nz), 4),
        "mean_nT": round(sum(nz) / len(nz), 4),
        "p99_nT": round(nz[int(0.99 * len(nz))], 4),
        "max_nT": round(nz[-1], 4),
    }


def main() -> None:
    moon = lunar_stats(fetch_tab())
    out = {
        "description": "Magnetic-field environments shown in the Stories 'fields' scene. Observations only; the seed twin has no magnetic-field model.",
        "earth_surface": {
            "min_nT": 25000,
            "max_nT": 65000,
            "unit": "nT",
            "tier": "standard",
            "source": "NOAA NCEI, Geomagnetism Frequently Asked Questions, https://www.ncei.noaa.gov/products/geomagnetism-frequently-asked-questions",
            "quote": "Earth's magnetic field intensity is roughly between 25,000 - 65,000 nT (.25 - .65 gauss).",
            "checked": "2026-11-07",
        },
        "moon_30km": {
            **moon,
            "unit": "nT",
            "altitude_km": 30,
            "tier": "measured",
            "source": "Hood, Torres, Oliveira, Wieczorek & Steward, Lunar Crustal Magnetic Field Map, NASA PDS (2020), doi:10.17189/1520494; file Bm_30km_65S65N_0E360E.tab, column B-Mag (Lunar Prospector + SELENE/Kaguya magnetometer data)",
            "file_sha256": TAB_SHA256,
            "note": "30 km above the mean lunar radius, latitudes 65S-65N, smoothed map; zero cells (no reliable data) excluded. The surface field is not mapped here.",
        },
        "dhiman2023": {
            "citation": "Dhiman SK, Wu F, Galland P. Effects of weak static magnetic fields on the development of seedlings of Arabidopsis thaliana. Protoplasma 260(3):767-786 (2023; Epub 2022-09-21)",
            "doi": "10.1007/s00709-022-01811-9",
            "pmid": "36129584",
            "year": 2023,
            "verified_via": "Europe PMC abstract (https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1007/s00709-022-01811-9&resultType=core&format=json), checked 2026-11-07",
            "germination_field_uT": 50,
            "germination_acceleration_h": 20,
            "hypocotyl_maxima_uT": [9, 60],
            "max_field_tested_uT": 122,
            "quotes": [
                "A field of 50 μT accelerated seed germination by about 20 h relative to samples maintained in a near-null field.",
                "The double mutant, cry1cry2, lacking cryptochromes 1 and 2 displayed the same magnetic field-induced germination acceleration under blue light as the wild-type strain.",
                "Stimulus-response curves for hypocotyl elongation in a range between near-null to 122 μT indicated maxima near 9 and 60 μT for the wild-type strain as well as mutant cry1cry2.",
                "Magnetic field-induced germination acceleration was masked in the presence of exogenous sucrose.",
            ],
            "tier": "measured",
            "note": "Single study; mechanism unknown (not cryptochrome-dependent). Not used by the model.",
        },
        "gaps": [
            {"id": "leo", "label": "ISS / low Earth orbit"},
            {"id": "mars", "label": "Mars surface"},
            {"id": "hardware", "label": "Inside flight hardware"},
        ],
        "gaps_note": "No verified measurement is used for these environments in this project.",
    }
    dest = ROOT / "data" / "environments" / "_fields.json"
    dest.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {dest.relative_to(ROOT)}: moon median {moon['median_nT']} nT, mean {moon['mean_nT']} nT over {moon['n_cells'] - moon['n_no_data']} cells")


if __name__ == "__main__":
    main()
