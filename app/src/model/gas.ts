// Gas exchange of one seed: O2 in, CO2 and ethylene out.
//
// Series path, outside → in:
//   headspace ─ air boundary layer ─┬─ (dry surface) ──────────────┐
//                                   └─ water film (wetted surface) ─┴─ testa ─ endosperm ─ embryo
// The air-side coefficient uses a sphere Sherwood number, Sh = 2 + a·Re^½·Sc^⅓, which
// falls to the pure-diffusion limit Sh = 2 in still air (sealed hardware at 0 g).
// Gas-phase diffusivity scales as 1/P_total, so a reduced-pressure exploration atmosphere
// changes transport independently of the O2 partial pressure.
//
// Conductances are per seed in mol s⁻¹ Pa⁻¹; partial pressures in Pa.
import { p, type Params } from "./params";

export const R_GAS = 8.314462618; // J mol⁻¹ K⁻¹ (exact SI value)

export type Gas = "o2" | "co2" | "eth";

export interface Transport {
  /** conductance headspace → enclosed embryo surface, per seed (mol s⁻¹ Pa⁻¹) */
  gOut: Record<Gas, number>;
  /** conductance per area headspace → surface of tissue that has left the seed (mol s⁻¹ m⁻² Pa⁻¹) */
  exposedPerArea: Record<Gas, number>;
  /** components for display */
  sh: number;
  re: number;
  wetted: number;
  filmUm: number;
}

export interface SeedShape {
  dEq_m: number; // equivalent-sphere diameter
  area_m2: number;
}

export function seedShape(lengthUm: number, widthUm: number): SeedShape {
  const d = Math.cbrt(lengthUm * widthUm * widthUm) * 1e-6;
  return { dEq_m: d, area_m2: Math.PI * d * d };
}

/** Gas diffusivity in air (m²/s) at temperature T and total pressure P. */
export function dAir(params: Params, gas: Gas, T_K: number, P_kPa: number): number {
  const d0 = p(params, `d_${gas}_air_m2s`);
  const Tref = p(params, "t_ref_k");
  const Pref = p(params, "p_ref_kpa");
  return d0 * (Pref / P_kPa) * Math.pow(T_K / Tref, p(params, "d_air_t_exponent"));
}

/** Kinematic viscosity of air (m²/s): ν = μ/ρ with ρ ∝ P, so ν ∝ 1/P. */
export function nuAir(params: Params, T_K: number, P_kPa: number): number {
  return p(params, "nu_air_m2s") * (p(params, "p_ref_kpa") / P_kPa) * Math.pow(T_K / p(params, "t_ref_k"), 1.75);
}

export function sherwood(params: Params, re: number, sc: number): number {
  return 2 + p(params, "sh_forced_coeff") * Math.sqrt(Math.max(re, 0)) * Math.cbrt(sc);
}

/** Wetted fraction and film thickness from substrate + gravity via a dish-scale Bond number. */
export function waterFilm(
  params: Params,
  g: number,
  substrateScaleMm: number,
  wet1: number,
  wet0: number,
  film1: number,
  film0: number,
): { wetted: number; filmUm: number; bond: number } {
  const rho = p(params, "rho_water_kgm3");
  const gamma = p(params, "gamma_water_nm");
  const L = substrateScaleMm * 1e-3;
  const bond = (rho * 9.80665 * g * L * L) / gamma;
  const w = bond / (1 + bond); // 0 at 0 g (capillary-dominated), → 1 when gravity dominates
  return { wetted: wet0 + (wet1 - wet0) * w, filmUm: film0 + (film1 - film0) * w, bond };
}

export interface BarrierState {
  testaRuptured: boolean;
}

export function transport(
  params: Params,
  shape: SeedShape,
  T_K: number,
  P_kPa: number,
  u_m_s: number,
  wetted: number,
  filmUm: number,
  barrier: BarrierState,
): Transport {
  const nu = nuAir(params, T_K, P_kPa);
  const re = (u_m_s * shape.dEq_m) / nu;
  const gOut = {} as Record<Gas, number>;
  const exposedPerArea = {} as Record<Gas, number>;
  let shOut = 2;
  for (const gas of ["o2", "co2", "eth"] as Gas[]) {
    const Da = dAir(params, gas, T_K, P_kPa);
    const sc = nu / Da;
    const sh = sherwood(params, re, sc);
    if (gas === "o2") shOut = sh;
    const h = (sh * Da) / shape.dEq_m; // m/s
    const gAirArea = h / (R_GAS * T_K); // mol s⁻¹ m⁻² Pa⁻¹
    const Dw = p(params, `d_${gas}_water_m2s`);
    const H = p(params, `h_${gas}_mol_m3pa`); // Henry solubility, dissolved conc per Pa
    const gFilmArea = (Dw * H) / Math.max(filmUm * 1e-6, 1e-9);
    const gWetArea = 1 / (1 / gAirArea + 1 / gFilmArea);
    const surf = (1 - wetted) * gAirArea + wetted * gWetArea;
    // seed coat and endosperm as diffusion layers of tissue (relative to free water)
    const Dt = Dw * p(params, "tissue_diffusivity_rel");
    const gTesta = (Dw * H * p(params, "testa_perm_rel")) / (p(params, "geo_testa_um") * 1e-6);
    const gEndo = (Dt * H) / (p(params, "geo_endosperm_um") * 1e-6);
    // tissue still inside the seed: behind the testa (except where it has split) and the endosperm
    const a = barrier.testaRuptured ? p(params, "testa_open_fraction") : 0;
    const series = (...g: number[]) => 1 / g.reduce((acc, x) => acc + 1 / x, 0);
    const perArea = (1 - a) * series(surf, gTesta, gEndo) + a * series(surf, gEndo);
    gOut[gas] = perArea * shape.area_m2;
    // tissue that has protruded (radicle, later hypocotyl/cotyledons) sees the surface path only
    exposedPerArea[gas] = surf;
  }
  return { gOut, exposedPerArea, sh: shOut, re, wetted, filmUm };
}

/**
 * Quasi-steady radial profile in a cylinder of radius R (m) with zero-order uptake q
 * (mol m⁻³ s⁻¹) and tissue diffusivity D (m²/s), expressed as a partial-pressure drop
 * below the surface value: Δp(r) = q (R² − r²) / (4 D H).
 */
export function cylinderDrop(q: number, R: number, r: number, D: number, H: number): number {
  return (q * (R * R - r * r)) / (4 * D * H);
}

/** Same for a slab of half-thickness h, distance x from the mid-plane. */
export function slabDrop(q: number, h: number, x: number, D: number, H: number): number {
  return (q * (h * h - x * x)) / (2 * D * H);
}
