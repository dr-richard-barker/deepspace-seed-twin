// Germination metrics shared by scripts/calibrate.ts and validation/gates.ts.
import { resolveEnv } from "../app/src/model/environment";
import type { Params } from "../app/src/model/params";
import { PRESET_BY_ID } from "../app/src/model/presets";
import { SeedTwin } from "../app/src/model/simulate";

export interface Metrics {
  aba_12h_ratio: number;
  testa_rupture_h: number;
  endosperm_rupture_h: number;
  expansion_onset_h: number;
  peak_expansion_index: number;
  cap_strength_ratio_at_rupture: number;
}

export function evaluate(params: Params, tEnd = 60): Metrics {
  const env = resolveEnv(PRESET_BY_ID.get("ground_petri")!);
  const sim = new SeedTwin(params, env, { germinationOnly: true, sampleEvery: 1 });
  const aba0 = sim.meanActive(sim.h.aba);
  let aba12 = NaN;
  let ref3: { index: number; volume: number }[] | null = null;
  let onset = NaN;
  let lastHour = 0;
  while (sim.t < tEnd && sim.milestones.endospermRupture === null) {
    sim.step();
    const hour = Math.floor(sim.t + 1e-9);
    if (hour !== lastHour) {
      lastHour = hour;
      if (hour === 12) aba12 = sim.meanActive(sim.h.aba);
      if (hour === 3) ref3 = sim.cortexVolumeByIndex();
      if (ref3 && Number.isNaN(onset)) {
        const prof = sim.cortexVolumeByIndex();
        for (const p of prof) {
          const r0 = ref3.find((q) => q.index === p.index)!;
          if (p.index >= 5 && p.index <= 12 && p.volume / r0.volume > 1.05) {
            onset = hour;
            break;
          }
        }
      }
    }
  }
  let peak = NaN;
  if (ref3) {
    const prof = sim.cortexVolumeByIndex();
    let best = -Infinity;
    for (const p of prof) {
      const r = p.volume / ref3.find((q) => q.index === p.index)!.volume;
      if (r > best) (best = r), (peak = p.index);
    }
  }
  return {
    aba_12h_ratio: aba12 / aba0,
    testa_rupture_h: sim.milestones.testaRupture ?? tEnd + 20,
    endosperm_rupture_h: sim.milestones.endospermRupture ?? tEnd + 20,
    expansion_onset_h: Number.isNaN(onset) ? tEnd + 20 : onset,
    peak_expansion_index: Number.isNaN(peak) ? 0 : peak,
    cap_strength_ratio_at_rupture: sim.capStrength / params["cap_strength0_mpa"],
  };
}

