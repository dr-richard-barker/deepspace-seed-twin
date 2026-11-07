// Playback driver: owns the SeedTwin instance(s), advances them toward a target time
// within a per-frame time budget (so the UI never blocks), and rebuilds from t = 0 when
// the user scrubs backwards or changes the environment. The model only runs forward.
import { resolveEnv, type Env, type EnvOverrides } from "../model/environment";
import { clusterOf, nesFor } from "../model/identity";
import { defaultParams, p, type Params } from "../model/params";
import { ATMOSPHERES, PRESET_BY_ID, PRESETS, RADIATION } from "../model/presets";
import { SeedTwin } from "../model/simulate";

export const T_MAX = 120;

export interface RunConfig {
  presetId: string;
  atmosphereId: string | null;
  radiationId?: string | null;
  env: EnvOverrides;
  params: Record<string, number>;
}

export function defaultConfig(presetId = "ground_petri"): RunConfig {
  return { presetId, atmosphereId: null, env: {}, params: {} };
}

export function paramsFor(cfg: RunConfig): Params {
  return { ...defaultParams(), ...cfg.params };
}

export function envFor(cfg: RunConfig): Env {
  const preset = PRESET_BY_ID.get(cfg.presetId) ?? PRESETS[0];
  const atm = cfg.atmosphereId ? ATMOSPHERES.find((a) => a.id === cfg.atmosphereId) : undefined;
  const over: EnvOverrides = {};
  if (atm) {
    over.p_total_kpa = atm.p_total_kpa;
    over.o2_frac = atm.o2_frac;
  }
  const rad = cfg.radiationId ? RADIATION.find((r) => r.id === cfg.radiationId) : undefined;
  if (rad) {
    over.dose_mgy_d = rad.dose_mgy_d;
    over.spe_dose_mgy = rad.spe_dose_mgy;
    if (rad.spe_start_h !== undefined) over.spe_start_h = rad.spe_start_h;
    if (rad.spe_dur_h !== undefined) over.spe_dur_h = rad.spe_dur_h;
  }
  return resolveEnv(preset, { ...over, ...cfg.env });
}

/** Radiation sensitivity per cell from the decoder's radiation NES (hypothesis weight, default 0). */
export function decoderRadSensitivity(sim: SeedTwin): Float64Array {
  const w = p(sim.params, "rad_decoder_weight");
  const out = new Float64Array(sim.cells.n).fill(1);
  if (w === 0) return out;
  for (let i = 0; i < sim.cells.n; i++) {
    const v = nesFor("radiation_GCR", clusterOf(sim.template, i, 24));
    if (v !== null) out[i] = Math.max(0.1, 1 + (w * v) / 2.5);
  }
  return out;
}

export function makeSim(cfg: RunConfig): SeedTwin {
  return new SeedTwin(paramsFor(cfg), envFor(cfg), { radSensitivity: decoderRadSensitivity });
}

export class Driver {
  configs: RunConfig[] = [];
  sims: SeedTwin[] = [];
  target = 0;
  playing = false;
  speed = 4; // simulated hours per wall-clock second
  private listeners = new Set<() => void>();
  version = 0;

  constructor(configs: RunConfig[], target = 0) {
    this.configs = configs;
    this.target = target;
    this.rebuild();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  setConfigs(configs: RunConfig[]) {
    this.configs = configs;
    this.rebuild();
  }

  rebuild() {
    this.sims = this.configs.map(makeSim);
    this.emit();
  }

  get t(): number {
    return this.sims.length ? Math.min(...this.sims.map((s) => s.t)) : 0;
  }

  get behind(): boolean {
    return this.sims.some((s) => s.t < this.target - 1e-6);
  }

  seek(t: number) {
    this.target = Math.max(0, Math.min(T_MAX, t));
    if (this.sims.some((s) => s.t > this.target + 1e-6)) this.rebuild();
    this.emit();
  }

  /** Advance toward the target, spending at most budgetMs of wall time. Returns true if anything moved. */
  advance(budgetMs: number): boolean {
    const t0 = performance.now();
    let moved = false;
    for (const sim of this.sims) {
      while (sim.t < this.target - 1e-6 && performance.now() - t0 < budgetMs) {
        sim.step();
        moved = true;
      }
    }
    return moved;
  }

  frame(wallDt: number): boolean {
    if (this.playing && !this.behind) {
      this.target = Math.min(T_MAX, this.target + this.speed * wallDt);
      if (this.target >= T_MAX) this.playing = false;
    }
    const moved = this.advance(12);
    if (moved) this.emit();
    return moved;
  }

  togglePlay() {
    if (this.target >= T_MAX - 1e-6) this.seek(0);
    this.playing = !this.playing;
    this.emit();
  }
}

// ---------------------------------------------------------------- URL hash state
export interface UrlState {
  primary: RunConfig;
  compare: RunConfig | null;
  mode: string;
  decoderClass: string;
  t: number;
}

export function encodeState(s: UrlState): string {
  const json = JSON.stringify(s);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeState(hash: string): UrlState | null {
  try {
    const b64 = hash.replace(/^#/, "").replace(/-/g, "+").replace(/_/g, "/");
    if (!b64) return null;
    const s = JSON.parse(decodeURIComponent(escape(atob(b64)))) as UrlState;
    if (!s.primary || !PRESET_BY_ID.has(s.primary.presetId)) return null;
    return s;
  } catch {
    return null;
  }
}
