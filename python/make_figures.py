#!/usr/bin/env python3
"""Manuscript figures, generated ONLY from files written by `npm run export`
(results/tables/*.csv) and the sourced inputs in data/. No number is typed here except
plotting choices; observed reference values are read from data/calibration/*.json.

Run: python3 python/make_figures.py
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from scipy.stats import spearmanr  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
T = ROOT / "results" / "tables"
FIG = ROOT / "figures"
FIG.mkdir(exist_ok=True)
plt.rcParams.update({"font.size": 8, "axes.spines.top": False, "axes.spines.right": False, "figure.dpi": 150})
OK = ["#2a7f62", "#d9822b", "#3b6fb6", "#b04a9b", "#c23b3b", "#8a8a2e", "#5e5e5e"]


def read(name):
    with (T / name).open() as fh:
        return list(csv.DictReader(fh))


def f(x):
    return float(x) if x not in ("", None) else np.nan


targets = {t["id"]: t for t in json.loads((ROOT / "data/calibration/targets.json").read_text())["targets"]}
seedling_targets = {t["id"]: t for t in json.loads((ROOT / "data/calibration/targets_seedling.json").read_text())["targets"]}

# ---------------------------------------------------------------- Fig 2: calibration
prof = read("cortex_expansion_profile.csv")
fig, ax = plt.subplots(1, 3, figsize=(7.2, 2.4))
for k, t in enumerate([16, 22, 28, 32]):
    rows = [r for r in prof if int(float(r["hours"])) == t]
    if rows:
        ax[0].plot([int(r["cortical_index"]) for r in rows], [f(r["rel_to_3h"]) for r in rows], color=OK[k], label=f"{t} h")
ax[0].axvspan(targets["peak_expansion_index"]["value"] - 0.5, targets["peak_expansion_index"]["value"] + 0.5, color="#bbbbbb", alpha=0.4, lw=0)
ax[0].set_xlabel("cortical cell index from the QC")
ax[0].set_ylabel("volume / volume at 3 h")
ax[0].set_title("a  expansion by position", loc="left")
ax[0].legend(frameon=False, fontsize=6)

summ = {r["scenario"]: r for r in read("scenario_summary.csv")}
ref = summ["ground_light"]
names = ["testa rupture", "endosperm rupture", "cotyledons out", "cotyledons open"]
model = [f(ref["testa_rupture_h"]), f(ref["endosperm_rupture_h"]), f(ref["cot_emerged_h"]), f(ref["cot_open_h"])]
obs = [targets["testa_rupture_h"], targets["endosperm_rupture_h"], seedling_targets["cot_emerged_h"], seedling_targets["cot_open_h"]]
y = np.arange(len(names))[::-1]
ax[1].errorbar([o["value"] for o in obs], y, xerr=[o["sd"] for o in obs], fmt="s", color="#888888", ms=4, capsize=2, label="observed ± sd")
ax[1].plot(model, y, "o", color=OK[0], ms=5, label="twin")
ax[1].set_yticks(y, names)
ax[1].set_xlabel("hours after imbibition")
ax[1].set_title("b  milestones", loc="left")
ax[1].legend(frameon=False, fontsize=6, loc="lower right")

hyd = read("hydrotime_check.csv")
psi = [f(r["psi_mpa"]) for r in hyd]
ax[2].plot(psi, [f(r["hydrotime_rate_per_h"]) * 100 for r in hyd], "-", color="#888888", label="hydrotime model (Footitt 2019)")
ax[2].plot(psi, [f(r["model_rate_per_h"]) * 100 for r in hyd], "o", color=OK[2], ms=4, label="twin (not fitted)")
ax[2].set_xlabel("substrate water potential (MPa)")
ax[2].set_ylabel("germination rate (% per h)")
ax[2].set_title("c  out-of-sample: water stress", loc="left")
ax[2].legend(frameon=False, fontsize=6)
fig.tight_layout()
fig.savefig(FIG / "fig2_calibration.png", dpi=300)
fig.savefig(FIG / "fig2_calibration.pdf")
plt.close(fig)

# ---------------------------------------------------------------- Fig 3: hardware environments
hw = ["ground_light", "bric_pdfu_1g", "bric_pdfu", "bric_led", "cara", "aph", "emcs_1g", "leaf_gbc1"]
lab = ["ground", "BRIC 1 g", "BRIC-PDFU", "BRIC-LED", "CARA", "APH", "EMCS 1 g", "LEAF GBC1"]
fig, ax = plt.subplots(1, 4, figsize=(7.4, 2.5))
x = np.arange(len(hw))
ax[0].bar(x, [f(summ[h]["min_o2_surface_kpa"]) for h in hw], color=OK[2])
ax[0].bar(x, [f(summ[h]["min_o2_core_kpa"]) for h in hw], color=OK[4], width=0.45)
ax[0].set_ylabel("min O₂ (kPa): surface / core")
ax[1].bar(x, [f(summ[h]["peak_eth_headspace_ppb"]) for h in hw], color=OK[5])
ax[1].set_ylabel("peak headspace ethylene (ppb)")
ax[2].bar(x, [f(summ[h]["endosperm_rupture_h"]) for h in hw], color=OK[0])
ax[2].set_ylabel("endosperm rupture (h)")
ax[3].bar(x - 0.2, [f(summ[h]["root_len_120h_um"]) / 1000 for h in hw], width=0.4, color=OK[1], label="root")
ax[3].bar(x + 0.2, [f(summ[h]["hyp_len_120h_um"]) / 1000 for h in hw], width=0.4, color=OK[3], label="hypocotyl")
ax[3].set_ylabel("length at 120 h (mm)")
ax[3].legend(frameon=False, fontsize=6)
for a, t in zip(ax, "abcd"):
    a.set_xticks(x, lab, rotation=60, ha="right", fontsize=6)
    a.set_title(t, loc="left")
fig.tight_layout()
fig.savefig(FIG / "fig3_hardware.png", dpi=300)
fig.savefig(FIG / "fig3_hardware.pdf")
plt.close(fig)

# ---------------------------------------------------------------- Fig 4: gravity, atmosphere, radiation
fig, ax = plt.subplots(1, 3, figsize=(7.2, 2.4))
for k, sc in enumerate(["emcs_0g", "emcs_0.166g", "emcs_0.38g", "emcs_1g"]):
    ts = read(f"timeseries_{sc}.csv")
    ax[0].plot([f(r["t"]) for r in ts], [f(r["root_angle_deg"]) - 180 for r in ts], color=OK[k], label=sc.replace("emcs_", ""))
ax[0].set_xlabel("hours")
ax[0].set_ylabel("root tip turned (°)")
ax[0].set_title("a  gravitropism vs g (EMCS)", loc="left")
ax[0].legend(frameon=False, fontsize=6)
for k, sc in enumerate(["ground_light", "ground_exploration", "ground_staged", "ground_counterfactual", "ground_hypoxia_10pct"]):
    ts = read(f"timeseries_{sc}.csv")
    ax[1].plot([f(r["t"]) for r in ts], [f(r["o2_core_min_kpa"]) for r in ts], color=OK[k], label=summ[sc]["note"])
ax[1].set_xlabel("hours")
ax[1].set_ylabel("coldest-core O₂ (kPa)")
ax[1].set_title("b  atmosphere", loc="left")
ax[1].legend(frameon=False, fontsize=5)
for k, sc in enumerate(["ground_light", "deep_space_spe", "deep_space_spe_hyp"]):
    ts = read(f"timeseries_{sc}.csv")
    ax[2].plot([f(r["t"]) for r in ts], [f(r["root_len_um"]) / 1000 for r in ts], color=OK[k], ls="--" if sc.endswith("hyp") else "-", label=summ[sc]["note"][:38])
ax[2].set_xlabel("hours")
ax[2].set_ylabel("root length (mm)")
ax[2].set_title("c  radiation (dashed = hypothesis)", loc="left")
ax[2].legend(frameon=False, fontsize=5)
fig.tight_layout()
fig.savefig(FIG / "fig4_gravity_atmosphere_radiation.png", dpi=300)
fig.savefig(FIG / "fig4_gravity_atmosphere_radiation.pdf")
plt.close(fig)

# ---------------------------------------------------------------- Fig 5: exposure vs decoder
ex = read("exposure_vs_decoder.csv")
fig, ax = plt.subplots(1, 2, figsize=(6.4, 2.6))
stats = {}
for k, sc in enumerate(["bric_pdfu", "ground_counterfactual"]):
    rows = [r for r in ex if r["scenario"] == sc and r["observed_low_oxygen_nes"] not in ("", "null")]
    xs = np.array([f(r["o2_deficit_kpa"]) for r in rows])
    ys = np.array([f(r["observed_low_oxygen_nes"]) for r in rows])
    rho, pv = spearmanr(xs, ys)
    stats[sc] = (rho, pv, len(rows))
    ax[k].scatter(xs, ys, s=14, color=OK[2])
    for r, xx, yy in zip(rows, xs, ys):
        ax[k].annotate(r["cluster"], (xx, yy), fontsize=5, xytext=(2, 2), textcoords="offset points")
    ax[k].set_xlabel("simulated O₂ deficit at 24 h (kPa)")
    ax[k].set_ylabel("observed low-oxygen NES (decoder)")
    ax[k].set_title(f"{'ab'[k]}  {sc}: Spearman ρ = {rho:.2f} (p = {pv:.2f}, n = {len(rows)})", loc="left", fontsize=7)
fig.tight_layout()
fig.savefig(FIG / "fig5_exposure_vs_decoder.png", dpi=300)
fig.savefig(FIG / "fig5_exposure_vs_decoder.pdf")
plt.close(fig)
(T / "exposure_vs_decoder_stats.csv").write_text(
    "scenario,spearman_rho,p_value,n_clusters\n" + "".join(f"{k},{v[0]:.4f},{v[1]:.4f},{v[2]}\n" for k, v in stats.items())
)

# ---------------------------------------------------------------- Fig 6: populations
pop = read("population_curves.csv") if (T / "population_curves.csv").exists() else []
if pop:
    fig, ax = plt.subplots(figsize=(3.4, 2.4))
    for k, sc in enumerate(sorted({r["scenario"] for r in pop})):
        ts = sorted(f(r["endosperm_rupture_h"]) for r in pop if r["scenario"] == sc and r["endosperm_rupture_h"])
        n = sum(1 for r in pop if r["scenario"] == sc)
        ax.step([0] + ts + [96], [0] + [100 * (i + 1) / n for i in range(len(ts))] + [100 * len(ts) / n], where="post", color=OK[k], label=sc)
    ax.axvspan(31, 45, color="#bbbbbb", alpha=0.35, lw=0, label="Dekkers 2013 31–45 h")
    ax.set_xlabel("hours after imbibition")
    ax.set_ylabel("% endosperm rupture")
    ax.legend(frameon=False, fontsize=5)
    fig.tight_layout()
    fig.savefig(FIG / "fig6_populations.png", dpi=300)
    fig.savefig(FIG / "fig6_populations.pdf")
    plt.close(fig)
print("figures written to", FIG)
