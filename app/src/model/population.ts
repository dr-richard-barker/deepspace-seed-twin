// Population of seeds: between-seed variability in base water potential (hydrotime σψb,
// Footitt et al. 2019) drawn with the seeded RNG, each seed run to endosperm rupture.
// Germination descriptors follow Germinator-NG (python/germinator_ng/curves.py): t50 is the
// time to half of Gmax; u8416 / u7525 are uniformity spans.
import type { Env } from "./environment";
import { p, type Params } from "./params";
import { mulberry32, normal } from "./rng";
import { SeedTwin } from "./simulate";

export interface PopulationResult {
  times: (number | null)[]; // endosperm-rupture time per seed (null = not by tEnd)
  offsets: number[];
  gmax: number;
  t50: number | null;
  u8416: number | null;
  u7525: number | null;
}

function quantileTime(sorted: number[], n: number, frac: number): number | null {
  const k = frac * n;
  if (sorted.length < Math.ceil(k)) return null;
  const i = Math.max(0, Math.ceil(k) - 1);
  return sorted[i];
}

export function describe(times: (number | null)[]): Omit<PopulationResult, "times" | "offsets"> {
  const ok = times.filter((x): x is number => x !== null).sort((a, b) => a - b);
  const n = times.length;
  const gmax = ok.length / n;
  const g = ok.length;
  const at = (f: number) => (g ? quantileTime(ok, g, f) : null);
  const t16 = at(0.16), t84 = at(0.84), t25 = at(0.25), t75 = at(0.75);
  return {
    gmax,
    t50: at(0.5),
    u8416: t16 !== null && t84 !== null ? t84 - t16 : null,
    u7525: t25 !== null && t75 !== null ? t75 - t25 : null,
  };
}

export function runPopulation(
  params: Params,
  env: Env,
  n: number,
  seed = 20261106,
  tEnd = 96,
  onSeed?: (i: number, t: number | null) => void,
): PopulationResult {
  const rng = mulberry32(seed);
  const sd = p(params, "psi_base_sd_mpa");
  const times: (number | null)[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < n; i++) {
    const off = sd * normal(rng);
    offsets.push(off);
    const sim = new SeedTwin({ ...params, psi_base_seed_offset_mpa: off }, env, { germinationOnly: true, dt: 0.1, sampleEvery: 6 });
    sim.runTo(tEnd);
    times.push(sim.milestones.endospermRupture);
    onSeed?.(i, sim.milestones.endospermRupture);
  }
  return { times, offsets, ...describe(times) };
}
