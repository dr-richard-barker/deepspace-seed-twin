// Headless single run: npx esbuild scripts/run_case.ts --bundle --platform=node --format=esm --loader:.json=json --outfile=scripts/run_case.mjs && node scripts/run_case.mjs <preset> <hours>
import { defaultParams } from "../app/src/model/params";
import { resolveEnv } from "../app/src/model/environment";
import { PRESET_BY_ID } from "../app/src/model/presets";
import { SeedTwin } from "../app/src/model/simulate";

const id = process.argv[2] ?? "ground_petri";
const hours = Number(process.argv[3] ?? 120);
const preset = PRESET_BY_ID.get(id);
if (!preset) throw new Error(`no preset ${id}`);
const t0 = performance.now();
const sim = new SeedTwin(defaultParams(), resolveEnv(preset));
sim.runTo(hours);
const ms = performance.now() - t0;
console.log(`${id}: ${hours} h in ${ms.toFixed(0)} ms, cells ${sim.cells.n}, divisions ${sim.seedling.divisions}`);
console.log("milestones", sim.milestones);
const keys = ["t", "hydration", "turgor_mpa", "restraint_mpa", "cap_strength_mpa", "o2_surface_kpa", "o2_tip_kpa", "o2_core_min_kpa", "eth_int_ppb", "aba_tip", "ga_tip", "integ_tip", "axis_len_um", "root_len_um", "hyp_len_um", "reserve", "hook_deg", "root_angle_deg"] as const;
console.log(keys.join("\t"));
for (const s of sim.samples.filter((s) => Math.abs(s.t % 6) < 1e-6 || s.t === 0)) {
  console.log(keys.map((k) => (typeof s[k] === "number" ? (s[k] as number).toPrecision(3) : s[k])).join("\t"));
}
const prof = sim.cortexVolumeByIndex();
console.log("cortex volume by QC index:", prof.map((x) => `${x.index}:${x.volume.toFixed(0)}`).join(" "));
