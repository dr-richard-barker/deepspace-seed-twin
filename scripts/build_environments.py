#!/usr/bin/env python3
"""Write the hardware environment presets (data/environments/*.json) from their sources.

Values are READ from the sibling repos' curated records wherever such a record exists,
so a preset can be re-derived and audited:
  ~/Documents/Hardware_OSDR_review/hardware/*.yaml   sourced hardware records (value + quote)
  ~/Documents/Hardware_OSDR_review/results/tables/T11_flight_ground.csv   measured ISS dose
  ~/Documents/LunarLeaf-CFD/validation/dishes.ts                          dish geometry (T19)
  ~/Documents/arabidopsis-exploration-atmosphere-tabpfn  (Table S6A)       exploration atmosphere
  ~/Documents/LEAF_GBC2_pot_model/README.md                                GBC1 geometry + pump
  results/tables/seed_air_speed.csv (this repo, scripts/lbm_seed_runs.ts)  LBM air speed at the seed
Anything with no source is written with tier "assumed" and a note saying so.

Run: python3 scripts/build_environments.py
"""
from __future__ import annotations

import csv
import json
import math
import re
import statistics
import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT.parent
HW = DOCS / "Hardware_OSDR_review"
LL = DOCS / "LunarLeaf-CFD"
LEAF = DOCS / "LEAF_GBC2_pot_model"
EXPLO = DOCS / "Exploration_atmosphere_Biomni_lab_downloads_20261016_234156" / "arabidopsis_exploration_atmosphere"
OUT = ROOT / "data" / "environments"
PARAMS = ROOT / "data" / "params" / "parameter_ledger.csv"


def commit(repo: Path, rel: str) -> str:
    r = subprocess.run(["git", "-C", str(repo), "log", "-1", "--format=%h", "--", rel], capture_output=True, text=True)
    return r.stdout.strip() or "untracked"


def src(repo: Path, rel: str, anchor: str = "") -> str:
    return f"repo:{repo.name}/{rel}@{commit(repo, rel)}" + (f"#{anchor}" if anchor else "")


def F(value, unit, source="", tier="assumed", note=""):
    return {"value": float(value), "unit": unit, "source": source, "tier": tier, "note": note}


def hwyaml(name: str) -> dict:
    return yaml.safe_load((HW / "hardware" / f"{name}.yaml").read_text())


def hwfield(name: str, path: str):
    d = hwyaml(name)
    for k in path.split("."):
        d = d[k]
    return d


def ledger_value(pid: str) -> float:
    for row in csv.DictReader(PARAMS.open()):
        if row["id"] == pid:
            return float(row["value"])
    raise KeyError(pid)


# ---------------------------------------------------------------- shared sources
def iss_dose() -> dict:
    rel = "results/tables/T11_flight_ground.csv"
    vals = {}
    for r in csv.DictReader((HW / rel).open()):
        if r["mean_daily_dose_mGy"]:
            vals[r["mission"]] = float(r["mean_daily_dose_mGy"])
    med = statistics.median(vals.values())
    return F(round(med, 4), "mGy/d", src(HW, rel, "mean_daily_dose_mGy"), "derived",
             f"median of the mean daily dose of {len(vals)} Rodent Research missions with EDA dose data ({', '.join(sorted(vals))})")


def dish_headspace_ml(key: str) -> tuple[float, str]:
    txt = (LL / "validation" / "dishes.ts").read_text()
    m = re.search(r"'" + re.escape(key) + r"': \{[^}]*widthMm: ([^,]+), floorCm2: ([^,]+), heightMm: ([0-9.]+), agarMl: ([0-9.]+)", txt)
    if not m:
        raise KeyError(key)
    wall = 1.0  # dishes.ts WALL (assumed there, TODO confirm)
    if key.startswith("BRIC"):
        bric_w = (54.8 + 55.6) / 2 - 2 * wall
        floor = math.pi * (bric_w / 20) ** 2
    else:
        floor = float(m.group(2))
    height, agar = float(m.group(3)), float(m.group(4))
    agar_mm = agar / floor * 10
    head_mm = height - wall - agar_mm
    ml = floor * head_mm / 10
    return round(ml, 2), f"floor {floor:.1f} cm2 x headspace {head_mm:.2f} mm (height {height} - wall {wall} - agar {agar_mm:.2f} mm, dishes.ts geometry)"


def air_speed_table(hardware: str, pump_l_min: float | None = None):
    """LBM-derived local air speed at the seed (written by scripts/lbm_seed_runs.ts)."""
    path = ROOT / "results" / "tables" / "seed_air_speed.csv"
    if not path.exists():
        return None
    pts = []
    for r in csv.DictReader(path.open()):
        if r["hardware"] == hardware and (pump_l_min is None or abs(float(r["pump_l_min"]) - pump_l_min) < 1e-9):
            pts.append({"g": float(r["gravity_g"]), "u_m_s": float(r["u_seed_m_s"]),
                        "source": f"repo:deepspace-seed-twin/results/tables/seed_air_speed.csv (LBM job {r['job']})",
                        "tier": "derived",
                        "note": f"2-D LBM (vendored LunarLeaf solver), pump {r['pump_l_min']} L/min, outflow/inflow {float(r['outflow_over_inflow']):.3f}; no buoyancy source during germination, so identical at every g"})
    return pts or None


def still_air(note: str):
    return [{"g": 0.0, "u_m_s": 0.0, "source": "", "tier": "assumed", "note": note},
            {"g": 1.0, "u_m_s": 0.0, "source": "", "tier": "assumed", "note": note}]


AIR = 101.325
O2_AIR = F(0.2095, "fraction", "", "assumed", "conventional dry-air O2 mole fraction (~20.95 %); not verified against a primary source here")


def common(**over) -> dict:
    """Defaults that every preset overrides where it has a source."""
    base = {
        "gravity_g": F(1, "g", "definition", "standard", "Earth surface, 1 g by definition"),
        "p_total_kpa": F(AIR, "kPa", "definition", "standard", "1 standard atmosphere = 101.325 kPa (exact by definition)"),
        "o2_frac": O2_AIR,
        "co2_ppm": F(420, "ppm", "", "assumed", "present-day ambient CO2 (approximate)"),
        "temp_c": F(22, "degC", "", "assumed"),
        "light_umol": F(0, "umol m-2 s-1", "", "assumed"),
        "light_h_per_cycle": F(0, "h", "", "assumed"),
        "cycle_h": F(24, "h", "", "assumed"),
        "headspace_ml": F(20, "mL", "", "assumed"),
        "seeds": F(30, "seeds", "", "assumed"),
        "vent_ach": F(0, "1/h", "", "assumed", "sealed"),
        "eth_scrub_per_h": F(0, "1/h", "", "assumed", "no scrubber"),
        "eth_inlet_ppm": F(0, "ppm", "", "assumed", "no ethylene in the exchange air"),
        "substrate_psi_mpa": F(0, "MPa", "", "assumed", "water-saturated substrate (psi ~ 0)"),
        "wetted_frac_1g": F(0.35, "fraction", "", "assumed", "agar: seed lies on the gel surface"),
        "wetted_frac_0g": F(0.45, "fraction", "", "assumed", "agar: capillary film creeps further up the seed"),
        "film_um_1g": F(10, "um", "", "assumed"),
        "film_um_0g": F(20, "um", "", "assumed"),
        "substrate_scale_mm": F(5, "mm", "", "assumed", "length scale of free water on the substrate"),
        "dose_mgy_d": F(0, "mGy/d", "", "assumed", "ground: background dose neglected"),
        "spe_dose_mgy": F(0, "mGy", "", "assumed"),
        "spe_start_h": F(24, "h", "", "assumed"),
        "spe_dur_h": F(2, "h", "", "assumed"),
    }
    base.update(over)
    return base


def write(preset: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{preset['id']}.json").write_text(json.dumps(preset, indent=1) + "\n")
    print("wrote", preset["id"])


def main() -> None:
    iss = iss_dose()
    temp_pdfu = hwfield("bric_pdfu", "environment.temperature_C")
    bric_ml, bric_note = dish_headspace_ml("BRIC-mid")
    cara_ml, cara_note = dish_headspace_ml("CARA-mid")
    seeds_led = F(30, "seeds", src(HW, "hardware/bric_led.yaml", "nutrients"), "measured",
                  "BRIC-LED-001: 'Approximately 30 seeds were plated on each 60mm round petri plate'")

    write({
        "id": "ground_petri", "label": "Ground control (taped Petri dish, lab)", "hardware": "lab Petri dish",
        "description": "1 g laboratory control: seeds on agar in a taped 60 mm dish, 16 h light / 8 h dark.",
        "fields": common(
            light_umol=F(100, "umol m-2 s-1", "", "assumed", "typical growth-room light"),
            light_h_per_cycle=F(16, "h", "", "assumed"),
            headspace_ml=F(bric_ml, "mL", src(LL, "validation/dishes.ts", "BRIC-mid"), "derived", bric_note),
            vent_ach=F(0.5, "1/h", "", "assumed", "taped lid leak, uncalibrated"),
            seeds=seeds_led,
        ),
        "air_speed_by_g": air_speed_table("dish_sealed") or still_air("no fan; seed-scale buoyancy negligible"),
    })

    write({
        "id": "bric_pdfu", "label": "BRIC-PDFU (sealed, dark) on ISS", "hardware": "BRIC-PDFU",
        "description": "Sealed 60 mm dish in a Petri Dish Fixation Unit, dark, no ventilation, microgravity.",
        "fields": common(
            gravity_g=F(0, "g", "", "assumed", "idealised orbital microgravity (residual micro-g neglected)"),
            temp_c=F(sum(temp_pdfu["value"]) / 2, "degC", src(HW, "hardware/bric_pdfu.yaml", "environment.temperature_C"), "measured",
                     f"midpoint of measured {temp_pdfu['value']} degC"),
            headspace_ml=F(bric_ml, "mL", src(LL, "validation/dishes.ts", "BRIC-mid"), "derived",
                           bric_note + "; the PDFU dish-chamber air volume for agar plates is not sourced (bric_pdfu.yaml)"),
            seeds=F(30, "seeds", "", "assumed", "PDFU seed number not sourced; BRIC-LED value used"),
            co2_ppm=F(420, "ppm", "", "assumed", "gas sealed at integration on the ground"),
            dose_mgy_d=iss,
        ),
        "air_speed_by_g": air_speed_table("dish_sealed") or still_air("sealed, unpowered, no fan"),
    })

    led = hwfield("bric_led", "environment.light")
    write({
        "id": "bric_led", "label": "BRIC-LED (sealed, 4 h light / 2 h dark) on ISS", "hardware": "BRIC-LED",
        "description": "Sealed 60 mm dish with LED lighting (BRIC-LED-001), microgravity.",
        "fields": common(
            gravity_g=F(0, "g", "", "assumed", "idealised orbital microgravity (residual micro-g neglected)"),
            light_umol=F(60, "umol m-2 s-1", src(HW, "hardware/bric_led.yaml", "environment.light"), "measured", led["value"]),
            light_h_per_cycle=F(4, "h", src(HW, "hardware/bric_led.yaml", "environment.light"), "measured"),
            cycle_h=F(6, "h", src(HW, "hardware/bric_led.yaml", "environment.light"), "measured"),
            headspace_ml=F(bric_ml, "mL", src(LL, "validation/dishes.ts", "BRIC-mid"), "derived", bric_note),
            seeds=seeds_led,
            dose_mgy_d=iss,
        ),
        "air_speed_by_g": air_speed_table("dish_sealed") or still_air("sealed; canister cooled externally"),
    })

    write({
        "id": "cara", "label": "CARA (taped 120 mm square dish) on ISS", "hardware": "CARA dish",
        "description": "Taped 120 mm square dish (CARA), microgravity; tape leak uncalibrated.",
        "fields": common(
            gravity_g=F(0, "g", "", "assumed", "idealised orbital microgravity (residual micro-g neglected)"),
            headspace_ml=F(cara_ml, "mL", src(LL, "validation/dishes.ts", "CARA-mid"), "derived", cara_note),
            vent_ach=F(0.5, "1/h", "", "assumed", "tape leak, uncalibrated (LunarLeaf membraneK 0.01 is also uncalibrated)"),
            light_umol=F(100, "umol m-2 s-1", "", "assumed"),
            light_h_per_cycle=F(24, "h", "", "assumed"),
            co2_ppm=F(hwfield("_iss_cabin", "environment.co2_ppm")["value"], "ppm", src(HW, "hardware/_iss_cabin.yaml", "environment.co2_ppm"), "derived",
                      "ISS cabin CO2 (EDA RR-1 telemetry) for the tape-leak exchange air"),
            dose_mgy_d=iss,
        ),
        "air_speed_by_g": air_speed_table("dish_sealed") or still_air("no fan inside the dish"),
    })

    aph_v = hwfield("aph", "run_setpoints.PH04")
    write({
        "id": "aph", "label": "Advanced Plant Habitat (forced air, KMnO4 scrubber)", "hardware": "APH",
        "description": "APH growth chamber: 100 L, forced air at plant level, arcillite, ethylene scrubber. PH-04 set points.",
        "fields": common(
            gravity_g=F(0, "g", "", "assumed", "idealised orbital microgravity (residual micro-g neglected)"),
            temp_c=F(aph_v["temperature_C"]["value"], "degC", src(HW, "hardware/aph.yaml", "run_setpoints.PH04"), "measured", "PH-04 set point"),
            co2_ppm=F(aph_v["co2_ppm"]["value"], "ppm", src(HW, "hardware/aph.yaml", "run_setpoints.PH04"), "measured", "PH-04 set point"),
            light_umol=F(aph_v["ppfd_umol_m2_s"]["value"], "umol m-2 s-1", src(HW, "hardware/aph.yaml", "run_setpoints.PH04"), "measured", "PH-04 set point"),
            light_h_per_cycle=F(16, "h", "", "assumed"),
            headspace_ml=F(hwfield("aph", "geometry.free_air_volume_L")["value"] * 1000, "mL", src(HW, "hardware/aph.yaml", "geometry.free_air_volume_L"), "measured"),
            seeds=F(100, "seeds", "", "assumed"),
            vent_ach=F(0.05, "1/h", src(HW, "hardware/aph.yaml", "walls.gas_permeability"), "measured",
                       "closed recirculating chamber; on-orbit leak 5 %/h (Monje et al. 2020), applied as exchange with cabin air"),
            eth_scrub_per_h=F(1.0, "1/h", "", "assumed", "KMnO4/Purafil scrubber present (aph.yaml); removal rate not sourced"),
            substrate_psi_mpa=F(-0.01, "MPa", "", "assumed", "watered arcillite"),
            wetted_frac_1g=F(0.3, "fraction", "", "assumed", "arcillite particle contact"),
            wetted_frac_0g=F(0.4, "fraction", "", "assumed"),
            substrate_scale_mm=F(2, "mm", "", "assumed", "arcillite pore scale"),
            dose_mgy_d=iss,
        ),
        "air_speed_by_g": [
            {"g": 0.0, "u_m_s": aph_v["air_velocity_m_s"]["value"], "source": src(HW, "hardware/aph.yaml", "run_setpoints.PH04.air_velocity_m_s"), "tier": "measured", "note": "PH-04 set point; forced flow dominates buoyancy (APH OpenFOAM T9: 0 g and 1 g nearly identical)"},
            {"g": 1.0, "u_m_s": aph_v["air_velocity_m_s"]["value"], "source": src(HW, "hardware/aph.yaml", "run_setpoints.PH04.air_velocity_m_s"), "tier": "measured"},
        ],
    })

    emcs_t = hwfield("emcs", "environment.temperature_C")
    emcs_co2 = hwfield("emcs", "environment.co2_ppm")
    write({
        "id": "emcs", "label": "EMCS (centrifuge, blotter paper)", "hardware": "EMCS",
        "description": "European Modular Cultivation System: seeds on blotter paper in cassettes; centrifuge sets g from 0 to 1+.",
        "fields": common(
            gravity_g=F(0, "g", "", "assumed", "set by the centrifuge: 0 (static rotor) up to 1 g; adjust with the gravity slider"),
            temp_c=F(emcs_t["value"], "degC", src(HW, "hardware/emcs.yaml", "environment.temperature_C"), "measured"),
            co2_ppm=F(sum(emcs_co2["value"]) / 2, "ppm", src(HW, "hardware/emcs.yaml", "environment.co2_ppm"), "measured", f"midpoint of {emcs_co2['value']}"),
            o2_frac=F(hwfield("emcs", "environment.o2_percent")["value"] / 100, "fraction", src(HW, "hardware/emcs.yaml", "environment.o2_percent"), "measured"),
            light_umol=F(35, "umol m-2 s-1", src(HW, "hardware/emcs.yaml", "environment.light"), "measured", "white LEDs 30-40 umol m-2 s-1 (midpoint)"),
            light_h_per_cycle=F(16, "h", src(HW, "hardware/emcs.yaml", "environment.light"), "measured", "16:8 (some runs continuous)"),
            headspace_ml=F(hwfield("emcs", "geometry.free_air_volume_L")["value"] * 1000, "mL", src(HW, "hardware/emcs.yaml", "geometry.free_air_volume_L"), "measured", "per experiment container"),
            vent_ach=F(1.0, "1/h", "", "assumed", "gas exchange through the EC inlet; flow not sourced"),
            eth_scrub_per_h=F(1.0, "1/h", "", "assumed", "ethylene removal present (emcs.yaml); rate not sourced"),
            wetted_frac_1g=F(0.5, "fraction", "", "assumed", "seeds glued on membrane over wet blotter"),
            wetted_frac_0g=F(0.7, "fraction", "", "assumed"),
            film_um_1g=F(15, "um", "", "assumed"),
            film_um_0g=F(40, "um", "", "assumed"),
            substrate_scale_mm=F(10, "mm", "", "assumed", "wet blotter paper"),
            dose_mgy_d=iss,
        ),
        "air_speed_by_g": air_speed_table("emcs") or [
            {"g": 0.0, "u_m_s": 0.01, "source": "", "tier": "assumed", "note": "no CFD exists for EMCS"},
            {"g": 1.0, "u_m_s": 0.01, "source": "", "tier": "assumed"}],
    })

    readme = (LEAF / "README.md").read_text()
    head = float(re.search(r"headspace air volume = ([0-9.]+) cm", readme).group(1))
    write({
        "id": "leaf_gbc1", "label": "LEAF GBC1 (lunar surface, pumped)", "hardware": "LEAF Growth Chamber 1",
        "description": "LEAF (Artemis III) growth chamber 1: 54 cm3 headspace flushed by a pump, lunar gravity.",
        "fields": common(
            gravity_g=F(1.62 / 9.80665, "g", "nasa_moon_factsheet", "standard", "lunar surface gravity 1.62 m/s2"),
            headspace_ml=F(head, "mL", src(LEAF, "README.md", "headspace"), "derived", "from the GBC1 CAD (M09024F pot + M09025F lid) as reported in the README"),
            seeds=F(100, "seeds", src(LEAF, "README.md"), "assumed", "100 Arabidopsis in the middle compartment (README); primary hardware source not verified"),
            vent_ach=F(round(0.25 * 60 / (head / 1000), 1), "1/h", src(LEAF, "README.md", "pump"), "assumed",
                       "0.25 L/min germination flow from the LEAF_GBC2_pot_model README scenario (not a verified hardware spec)"),
            light_umol=F(0, "umol m-2 s-1", "", "assumed", "germination phase"),
            temp_c=F(22, "degC", src(LEAF, "README.md"), "assumed", "assumed in LEAF_GBC2_pot_model"),
            substrate_psi_mpa=F(-0.01, "MPa", "", "assumed", "porous substrate blocks"),
            dose_mgy_d=F(0.317, "mGy/d", "zhang2020", "derived", "lunar surface charged-particle dose 13.2 uGy/h in water x 24 h (Chang'e-4 LND, Zhang et al. 2020); neutrals excluded; LEAF shielding not modelled"),
        ),
        "air_speed_by_g": air_speed_table("leaf_gbc1", 0.25) or [
            {"g": 0.0, "u_m_s": 0.005, "source": "", "tier": "assumed", "note": "PENDING LBM run"},
            {"g": 1.0, "u_m_s": 0.005, "source": "", "tier": "assumed"}],
    })


def atmospheres() -> None:
    """Atmosphere options: standard sea level + the NASA set points of Table S6A."""
    rel = "tables/Table_S6A_NASA_Exploration_Atmosphere_Counterfactual_Predictions.csv"
    out = [{"id": "sea_level", "label": "Sea level (101.3 kPa, 20.95 % O2)", "p_total_kpa": AIR, "o2_frac": 0.2095,
            "source": "definition", "tier": "standard", "note": "1 atm by definition; 20.95 % O2 conventional"}]
    seen = set()
    for r in csv.DictReader((EXPLO / rel).open()):
        name = r["Setpoint_Name"]
        if name in seen:
            continue
        seen.add(name)
        P, x = float(r["P_total_kPa"]), float(r["O2_frac"])
        out.append({"id": name, "label": f"{name.replace('_', ' ')}", "p_total_kpa": P, "o2_frac": x,
                    "po2_kpa": float(r["pO2_kPa"]), "source": src(EXPLO, rel, name), "tier": "derived",
                    "note": "set point as used in arabidopsis-exploration-atmosphere-tabpfn Table S6A (cites Norcross et al. 2013, NASA/TM-2013-217377); no CO2 set point is defined"})
    (OUT / "_atmospheres.json").write_text(json.dumps(out, indent=1) + "\n")
    print("wrote _atmospheres:", [a["id"] for a in out])


def radiation() -> None:
    """Radiation scenarios: chronic dose rate + optional solar-particle-event pulse."""
    iss = iss_dose()
    out = [
        {"id": "none", "label": "None (ground)", "dose_mgy_d": 0, "spe_dose_mgy": 0, "source": "", "tier": "assumed", "note": "terrestrial background neglected"},
        {"id": "iss", "label": f"ISS interior ({iss['value']:.3f} mGy/d)", "dose_mgy_d": iss["value"], "spe_dose_mgy": 0,
         "source": iss["source"], "tier": iss["tier"], "note": iss["note"] + "; cf. Straube et al. 2024 EAD 314 +/- 14 uGy/d (absorbed)"},
        {"id": "lunar_surface", "label": "Lunar surface (0.317 mGy/d)", "dose_mgy_d": 0.317, "spe_dose_mgy": 0, "source": "zhang2020", "tier": "derived",
         "note": "Chang'e-4 LND: charged-particle dose 13.2 uGy/h in water x 24 h (Zhang et al. 2020); the neutral component (3.1 uGy/h in Si) is not included"},
        {"id": "deep_space", "label": "Interplanetary cruise (0.48 mGy/d)", "dose_mgy_d": 0.48, "spe_dose_mgy": 0, "source": "simonsen2020", "tier": "measured",
         "note": "MSL RAD cruise dose rate as cited by Simonsen et al. 2020 (secondary source)"},
        {"id": "deep_space_spe", "label": "Cruise + solar particle event (150 mGy in 24 h)", "dose_mgy_d": 0.48, "spe_dose_mgy": 150, "spe_start_h": 24, "spe_dur_h": 24,
         "source": "simonsen2020 shavers2024", "tier": "derived",
         "note": "SPE: midpoint of the 115-188 mGy design-event estimates behind 20 g/cm2 shielding (Shavers et al. 2024, model estimates, not a measurement); 24 h duration assumed"},
    ]
    (OUT / "_radiation.json").write_text(json.dumps(out, indent=1) + "\n")
    print("wrote _radiation:", [r["id"] for r in out])


if __name__ == "__main__":
    main()
    atmospheres()
    radiation()
