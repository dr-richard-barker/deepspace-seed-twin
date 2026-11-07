"""Independent Python implementation of the seed twin's numerical kernels.

Written from the equations (see app/src/model/gas.ts and hormones.ts headers), not
translated line by line, so that python/tests/test_parity.py catches implementation slips
in either language. Parameters come from the same generated ledger JSON.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

R_GAS = 8.314462618  # J mol-1 K-1
G0 = 9.80665  # m s-2, standard gravity
GASES = ("o2", "co2", "eth")

LEDGER = Path(__file__).resolve().parents[2] / "app" / "src" / "model" / "params.generated.json"


def load_params() -> dict[str, float]:
    return {e["id"]: e["value"] for e in json.loads(LEDGER.read_text())["params"]}


def d_air(P: dict, gas: str, T: float, p_kpa: float) -> float:
    """Gas diffusivity in air: D0 (P0/P) (T/T0)^n."""
    return P[f"d_{gas}_air_m2s"] * (P["p_ref_kpa"] / p_kpa) * (T / P["t_ref_k"]) ** P["d_air_t_exponent"]


def nu_air(P: dict, T: float, p_kpa: float) -> float:
    return P["nu_air_m2s"] * (P["p_ref_kpa"] / p_kpa) * (T / P["t_ref_k"]) ** 1.75


def sherwood(P: dict, re: float, sc: float) -> float:
    return 2.0 + P["sh_forced_coeff"] * math.sqrt(max(re, 0.0)) * sc ** (1.0 / 3.0)


def water_film(P: dict, g: float, scale_mm: float, wet1: float, wet0: float, film1: float, film0: float):
    L = scale_mm * 1e-3
    bond = P["rho_water_kgm3"] * G0 * g * L * L / P["gamma_water_nm"]
    w = bond / (1.0 + bond)
    return {"wetted": wet0 + (wet1 - wet0) * w, "filmUm": film0 + (film1 - film0) * w, "bond": bond}


def seed_shape(length_um: float, width_um: float):
    d = (length_um * width_um * width_um) ** (1.0 / 3.0) * 1e-6
    return {"dEq_m": d, "area_m2": math.pi * d * d}


def cylinder_drop(q, R, r, D, H):
    return q * (R * R - r * r) / (4.0 * D * H)


def slab_drop(q, h, x, D, H):
    return q * (h * h - x * x) / (2.0 * D * H)


def _series(*g):
    return 1.0 / sum(1.0 / x for x in g)


def transport(P, shape, T, p_kpa, u, wetted, film_um, testa_ruptured):
    nu = nu_air(P, T, p_kpa)
    re = u * shape["dEq_m"] / nu
    g_out, exposed, sh_o2 = {}, {}, 2.0
    for gas in GASES:
        Da = d_air(P, gas, T, p_kpa)
        sh = sherwood(P, re, nu / Da)
        if gas == "o2":
            sh_o2 = sh
        g_air = (sh * Da / shape["dEq_m"]) / (R_GAS * T)
        Dw = P[f"d_{gas}_water_m2s"]
        H = P[f"h_{gas}_mol_m3pa"]
        g_film = Dw * H / max(film_um * 1e-6, 1e-9)
        surf = (1 - wetted) * g_air + wetted * _series(g_air, g_film)
        Dt = Dw * P["tissue_diffusivity_rel"]
        g_testa = Dw * H * P["testa_perm_rel"] / (P["geo_testa_um"] * 1e-6)
        g_endo = Dt * H / (P["geo_endosperm_um"] * 1e-6)
        a = P["testa_open_fraction"] if testa_ruptured else 0.0
        per_area = (1 - a) * _series(surf, g_testa, g_endo) + a * _series(surf, g_endo)
        g_out[gas] = per_area * shape["area_m2"]
        exposed[gas] = surf
    return {"gOut": g_out, "exposedPerArea": exposed, "sh": sh_o2, "re": re, "wetted": wetted, "filmUm": film_um}


def _up(C, th, h, y):
    yh = max(y, 0.0) ** h
    return C * yh / (th ** h + yh)


def _down(C, th, h, y):
    return C / (1.0 + max(y, 0.0) ** h / th ** h)


def abley_rhs(P, aba, ga, integ, z=0.0, gid1=1.0, eth=0.0):
    """Right-hand side of Abley et al. 2021 eqs (1)-(3) with the twin's GID1/ethylene terms."""
    h = P["abley_h"]
    dA = P["abley_beta_aba"] + _up(P["abley_c_aba_i"], P["abley_theta_aba_i"], h, integ) - P["abley_v_aba"] * aba
    dG = P["abley_beta_ga"] + P["abley_beta_ga_z"] * z + _down(P["abley_c_ga_i"], P["abley_theta_ga_i"], h, integ) - P["abley_v_ga"] * ga
    dI = P["abley_beta_i"] + _up(P["abley_c_i_aba"], P["abley_theta_i_aba"], h, aba) - (
        P["abley_v_i"] + gid1 * _up(P["abley_c_i_ga"], P["abley_theta_i_ga"], h, ga) + P["eth_integrator_degradation"] * eth
    ) * integ
    return dA, dG, dI


def dormant_fixed_point(P):
    """Highest-[I] fixed point with beta_GA,Z = 0 (Abley et al. 2021), by forward integration."""
    a, g, i = 10.0, 0.0, 50.0
    for _ in range(200000):
        dA, dG, dI = abley_rhs(P, a, g, i)
        a += 0.01 * dA
        g += 0.01 * dG
        i += 0.01 * dI
        if abs(dA) + abs(dG) + abs(dI) < 1e-12:
            break
    return {"aba": a, "ga": g, "integ": i}


def wall_stress(p_eff_mpa: float, volume_um3: float, wall_um: float) -> float:
    """Thin-shell wall stress of an equivalent sphere, sigma = P rho / (2 t)."""
    rho = (3.0 * volume_um3 / (4.0 * math.pi)) ** (1.0 / 3.0)
    return p_eff_mpa * rho / (2.0 * wall_um)


def relax(p_now: float, src: float, p_in: float, k_vent: float, k_loss: float, dt_s: float) -> float:
    """Exact solution of dp/dt = src + k_vent p_in - (k_vent + k_loss) p over dt_s."""
    k = k_vent + k_loss
    if k <= 0:
        return p_now + src * dt_s
    p_eq = (src + k_vent * p_in) / k
    return p_eq + (p_now - p_eq) * math.exp(-k * dt_s)
