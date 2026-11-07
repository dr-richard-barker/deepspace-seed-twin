// Environments: flight-hardware presets plus user overrides.
//
// A preset is a JSON file in data/environments/. Every field carries its value, unit,
// source and evidence tier, so the UI can show where each boundary condition came from.
// The model only ever sees the resolved numbers (`Env`).
import type { Tier } from "./params";

export interface EnvField {
  value: number;
  unit: string;
  source: string;
  tier: Tier;
  note?: string;
}

export interface AirSpeedPoint {
  g: number;
  u_m_s: number;
  source: string;
  tier: Tier;
}

export interface EnvPreset {
  id: string;
  label: string;
  hardware: string;
  description: string;
  fields: Record<string, EnvField>;
  /** local air speed at the seed surface vs gravity level (interpolated linearly in g) */
  air_speed_by_g: AirSpeedPoint[];
}

/** Field ids every preset must define. */
export const ENV_KEYS = [
  "gravity_g",
  "p_total_kpa",
  "o2_frac",
  "co2_ppm",
  "temp_c",
  "light_umol",
  "light_h_per_cycle",
  "cycle_h",
  "headspace_ml",
  "seeds",
  "vent_ach",
  "eth_scrub_per_h",
  "eth_inlet_ppm",
  "substrate_psi_mpa",
  "wetted_frac_1g",
  "wetted_frac_0g",
  "film_um_1g",
  "film_um_0g",
  "substrate_scale_mm",
  "dose_mgy_d",
  "spe_dose_mgy",
  "spe_start_h",
  "spe_dur_h",
] as const;
export type EnvKey = (typeof ENV_KEYS)[number];

export type Env = Record<EnvKey, number> & { airSpeed: (g: number) => number; presetId: string };

/**
 * Overrides a run may set: any preset field, plus `air_speed_m_s`, a fixed local air speed at
 * the seed surface that replaces the preset's air_speed_by_g curve (used to sweep airflow).
 */
export type EnvOverrides = Partial<Record<EnvKey, number>> & { air_speed_m_s?: number };

export function resolveEnv(preset: EnvPreset, overrides: EnvOverrides = {}): Env {
  const out: Partial<Env> = {};
  for (const k of ENV_KEYS) {
    const f = preset.fields[k];
    if (!f) throw new Error(`environment preset ${preset.id} is missing field ${k}`);
    (out as Record<string, number>)[k] = overrides[k] ?? f.value;
  }
  const pts = [...preset.air_speed_by_g].sort((a, b) => a.g - b.g);
  const fixedU = overrides.air_speed_m_s;
  if (fixedU !== undefined && Number.isFinite(fixedU) && fixedU >= 0) {
    out.airSpeed = () => fixedU;
    out.presetId = preset.id;
    return out as Env;
  }
  out.airSpeed = (g: number) => {
    if (pts.length === 0) return 0;
    if (g <= pts[0].g) return pts[0].u_m_s;
    for (let i = 0; i + 1 < pts.length; i++) {
      if (g <= pts[i + 1].g) {
        const f = (g - pts[i].g) / (pts[i + 1].g - pts[i].g);
        return pts[i].u_m_s + f * (pts[i + 1].u_m_s - pts[i].u_m_s);
      }
    }
    return pts[pts.length - 1].u_m_s;
  };
  out.presetId = preset.id;
  return out as Env;
}

/** Light on/off at time t (h) from the photoperiod fields. */
export function lightOn(env: Env, t: number): number {
  if (env.light_umol <= 0 || env.light_h_per_cycle <= 0) return 0;
  if (env.light_h_per_cycle >= env.cycle_h) return 1;
  return t % env.cycle_h < env.light_h_per_cycle ? 1 : 0;
}

/** Dose rate in mGy/h at time t, including an optional solar-particle-event pulse. */
export function doseRate(env: Env, t: number): number {
  let r = env.dose_mgy_d / 24;
  if (env.spe_dose_mgy > 0 && env.spe_dur_h > 0 && t >= env.spe_start_h && t < env.spe_start_h + env.spe_dur_h) {
    r += env.spe_dose_mgy / env.spe_dur_h;
  }
  return r;
}
