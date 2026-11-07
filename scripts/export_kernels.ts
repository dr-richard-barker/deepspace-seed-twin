// Export golden vectors from the TypeScript kernels for the independent Python
// re-implementation in python/seedtwin/kernels.py (tests in python/tests/test_parity.py).
//   npx esbuild scripts/export_kernels.ts --bundle --platform=node --format=esm --loader:.json=json --outfile=scripts/export_kernels.mjs && node scripts/export_kernels.mjs
import { writeFileSync } from "node:fs";
import { cylinderDrop, dAir, nuAir, seedShape, sherwood, slabDrop, transport, waterFilm } from "../app/src/model/gas";
import { dormantFixedPoint } from "../app/src/model/hormones";
import { defaultParams } from "../app/src/model/params";

const P = defaultParams();
const out: Record<string, unknown> = { params: P };

out.dAir = [
  [298.15, 101.325],
  [295.15, 56.54],
  [273.15, 25],
].flatMap(([T, Pk]) => (["o2", "co2", "eth"] as const).map((g) => ({ gas: g, T, P: Pk, value: dAir(P, g, T, Pk) })));
out.nuAir = [[298.15, 101.325], [295.15, 56.54]].map(([T, Pk]) => ({ T, P: Pk, value: nuAir(P, T, Pk) }));
out.sherwood = [[0, 1], [3.5, 0.8], [120, 0.7]].map(([re, sc]) => ({ re, sc, value: sherwood(P, re, sc) }));
out.waterFilm = [[0, 5], [0.166, 5], [1, 10]].map(([g, L]) => ({ g, L, wet1: 0.35, wet0: 0.45, film1: 10, film0: 20, value: waterFilm(P, g, L, 0.35, 0.45, 10, 20) }));
out.cylinderDrop = [{ q: 0.02, R: 5e-5, r: 1e-5, D: 2e-10, H: 1.3e-5 }].map((a) => ({ ...a, value: cylinderDrop(a.q, a.R, a.r, a.D, a.H) }));
out.slabDrop = [{ q: 0.02, h: 3e-5, x: 1e-5, D: 2e-10, H: 1.3e-5 }].map((a) => ({ ...a, value: slabDrop(a.q, a.h, a.x, a.D, a.H) }));
const shape = seedShape(490, 290);
out.transport = [
  { T: 295.15, P: 101.325, u: 0, wetted: 0.35, film: 10, testa: false },
  { T: 295.15, P: 56.54, u: 0.3, wetted: 0.4, film: 20, testa: true },
].map((a) => ({ ...a, value: transport(P, shape, a.T, a.P, a.u, a.wetted, a.film, { testaRuptured: a.testa }) }));
out.seedShape = shape;
out.dormantFixedPoint = dormantFixedPoint(P);
writeFileSync("python/tests/golden_kernels.json", JSON.stringify(out, null, 1) + "\n");
console.log("wrote python/tests/golden_kernels.json");
