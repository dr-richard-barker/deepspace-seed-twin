// Calibrate the germination model against data/calibration/targets.json by Nelder–Mead
// (log-transformed parameters). Writes data/calibration/fit_result.json; then
// `python3 scripts/apply_fit.py` copies the fitted values into the ledger with tier "fitted".
//   npx esbuild scripts/calibrate.ts --bundle --platform=node --format=esm --loader:.json=json --outfile=scripts/calibrate.mjs && node scripts/calibrate.mjs
import { writeFileSync } from "node:fs";
import targetsFile from "../data/calibration/targets.json";
import { defaultParams, type Params } from "../app/src/model/params";
import { evaluate, type Metrics } from "./metrics";

const FREE = [
  "hormone_time_unit_h",
  "integrator_growth_k",
  "wall_extensibility",
  "wall_yield_mpa",
  "testa_strength_mpa",
  "cap_strength0_mpa",
  "cap_weakening_rate",
  "ga_source_lambda",
  "aba_imbibition_catabolism",
] as const;

function loss(m: Metrics): number {
  let L = 0;
  for (const t of targetsFile.targets) {
    const v = m[t.id as keyof Metrics];
    L += ((v - t.value) / t.sd) ** 2;
  }
  if (m.testa_rupture_h >= m.endosperm_rupture_h) L += 25;
  return L;
}

function nelderMead(f: (x: number[]) => number, x0: number[], step: number, iters: number) {
  const n = x0.length;
  let simplex = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step : v)))];
  let vals = simplex.map(f);
  for (let k = 0; k < iters; k++) {
    const order = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    simplex = order.map((i) => simplex[i]);
    vals = order.map((i) => vals[i]);
    const c = Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
    const worst = simplex[n];
    const xr = c.map((v, j) => v + (v - worst[j]));
    const fr = f(xr);
    if (fr < vals[0]) {
      const xe = c.map((v, j) => v + 2 * (v - worst[j]));
      const fe = f(xe);
      if (fe < fr) (simplex[n] = xe), (vals[n] = fe);
      else (simplex[n] = xr), (vals[n] = fr);
    } else if (fr < vals[n - 1]) {
      simplex[n] = xr;
      vals[n] = fr;
    } else {
      const xc = c.map((v, j) => v + 0.5 * (worst[j] - v));
      const fc = f(xc);
      if (fc < vals[n]) (simplex[n] = xc), (vals[n] = fc);
      else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          vals[i] = f(simplex[i]);
        }
      }
    }
    if (k % 10 === 0) console.log(`iter ${k} best loss ${vals[0].toFixed(3)}`);
  }
  const iBest = vals.indexOf(Math.min(...vals));
  return { x: simplex[iBest], f: vals[iBest] };
}

const base = defaultParams();
const toParams = (x: number[]): Params => {
  const p = { ...base };
  FREE.forEach((id, i) => (p[id] = Math.exp(x[i])));
  return p;
};
const x0 = FREE.map((id) => Math.log(base[id]));
const iters = Number(process.argv[2] ?? 120);
console.log("start", evaluate(base), "loss", loss(evaluate(base)).toFixed(3));
const res = nelderMead((x) => loss(evaluate(toParams(x))), x0, 0.4, iters);
const best = toParams(res.x);
const metrics = evaluate(best);
console.log("best loss", res.f.toFixed(3), metrics);
writeFileSync(
  "data/calibration/fit_result.json",
  JSON.stringify(
    {
      method: "Nelder-Mead on log-parameters, sum of squared standardised residuals (data/calibration/targets.json)",
      iterations: iters,
      loss: res.f,
      fitted: Object.fromEntries(FREE.map((id) => [id, best[id]])),
      metrics,
      targets: targetsFile.targets,
      generated: new Date().toISOString(),
    },
    null,
    1,
  ) + "\n",
);
