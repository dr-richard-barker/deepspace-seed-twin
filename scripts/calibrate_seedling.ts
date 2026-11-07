// Calibrate seedling-stage rates against data/calibration/targets_seedling.json
// (germination parameters stay as fitted by calibrate.ts). Writes data/calibration/fit_seedling.json.
import { writeFileSync } from "node:fs";
import targetsFile from "../data/calibration/targets_seedling.json";
import { resolveEnv } from "../app/src/model/environment";
import { defaultParams, type Params } from "../app/src/model/params";
import { PRESET_BY_ID } from "../app/src/model/presets";
import { SeedTwin } from "../app/src/model/simulate";

const FREE = ["hyp_rate_dark", "hyp_rate_light", "cot_open_rate", "hyp_elongation_delay_h", "root_meristem_delay_h", "eth_yield_mol_m3"] as const;

function maxRate(s: SeedTwin, key: "hyp_len_um"): number {
  let best = 0;
  for (let i = 4; i < s.samples.length; i++) {
    const a = s.samples[i - 4];
    const b = s.samples[i];
    best = Math.max(best, ((b[key] - a[key]) / (b.t - a.t)) * 24 / 1000);
  }
  return best;
}

export function seedlingMetrics(params: Params) {
  const env = resolveEnv(PRESET_BY_ID.get("ground_petri")!);
  const light = new SeedTwin(params, env);
  light.runTo(120);
  const dark = new SeedTwin(params, resolveEnv(PRESET_BY_ID.get("ground_petri")!, { light_umol: 0, light_h_per_cycle: 0 }));
  dark.runTo(120);
  const last = light.samples.slice(-5);
  const rootRate = (last[last.length - 1].root_len_um - last[0].root_len_um) / (last[last.length - 1].t - last[0].t);
  const eth = light.samples.filter((r) => r.t >= 72).map((r) => r.eth_prod_pl_h);
  return {
    cot_emerged_h: light.milestones.cotEmerged ?? 160,
    cot_open_h: light.milestones.cotOpen ?? 160,
    hyp_max_rate_dark_mm_d: maxRate(dark, "hyp_len_um"),
    hyp_max_rate_light_mm_d: maxRate(light, "hyp_len_um"),
    root_rate_120h_um_h: rootRate,
    eth_prod_pl_h: eth.reduce((a, b) => a + b, 0) / Math.max(eth.length, 1),
  };
}

type M = ReturnType<typeof seedlingMetrics>;
const loss = (m: M) => targetsFile.targets.reduce((L, t) => L + ((m[t.id as keyof M] - t.value) / t.sd) ** 2, 0);

function nelderMead(f: (x: number[]) => number, x0: number[], step: number, iters: number) {
  const n = x0.length;
  let S = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step : v)))];
  let F = S.map(f);
  for (let k = 0; k < iters; k++) {
    const o = F.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map((q) => q[1]);
    S = o.map((i) => S[i]);
    F = o.map((i) => F[i]);
    const c = Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
    const w = S[n];
    const xr = c.map((v, j) => 2 * v - w[j]);
    const fr = f(xr);
    if (fr < F[0]) {
      const xe = c.map((v, j) => 3 * v - 2 * w[j]);
      const fe = f(xe);
      [S[n], F[n]] = fe < fr ? [xe, fe] : [xr, fr];
    } else if (fr < F[n - 1]) [S[n], F[n]] = [xr, fr];
    else {
      const xc = c.map((v, j) => 0.5 * (v + w[j]));
      const fc = f(xc);
      if (fc < F[n]) [S[n], F[n]] = [xc, fc];
      else for (let i = 1; i <= n; i++) (S[i] = S[i].map((v, j) => 0.5 * (v + S[0][j]))), (F[i] = f(S[i]));
    }
    if (k % 10 === 0) console.log(`iter ${k} loss ${F[0].toFixed(3)}`);
  }
  const b = F.indexOf(Math.min(...F));
  return { x: S[b], f: F[b] };
}

const base = defaultParams();
const toP = (x: number[]) => {
  const q = { ...base };
  FREE.forEach((id, i) => (q[id] = Math.exp(x[i])));
  return q;
};
const iters = Number(process.argv[2] ?? 80);
const m0 = seedlingMetrics(base);
console.log("start", m0, "loss", loss(m0).toFixed(2));
// ethylene production scales linearly with the yield: start from the analytic rescale
base["eth_yield_mol_m3"] *= 0.4 / Math.max(m0.eth_prod_pl_h, 1e-30);
const res = nelderMead((x) => loss(seedlingMetrics(toP(x))), FREE.map((id) => Math.log(base[id])), 0.3, iters);
const best = toP(res.x);
const m = seedlingMetrics(best);
console.log("best", res.f.toFixed(3), m);
writeFileSync(
  "data/calibration/fit_seedling.json",
  JSON.stringify({ method: "Nelder-Mead on log-parameters, seedling targets (data/calibration/targets_seedling.json)", iterations: iters, loss: res.f, fitted: Object.fromEntries(FREE.map((id) => [id, best[id]])), metrics: m, targets: targetsFile.targets, generated: new Date().toISOString() }, null, 1) + "\n",
);
