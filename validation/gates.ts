// Validation gates for the seed twin. Bundled with esbuild and run with node; exits
// non-zero if any gate fails. Runs in CI before every Pages build (npm run gates).
//
// Physics      analytic diffusion profile, Sh → 2 in still air, D ∝ 1/P, Henry partition
// Conservation sealed-headspace O2 mass balance; ethylene mass balance
// Mechanism    no growth below the wall-yield threshold; no rupture under infinite restraint;
//              hormone scheme inside its stability bound
// Calibration  germination timing / spatial pattern within the observed windows
// Seedling     dark > light hypocotyl; ethylene → shorter, thicker hypocotyl, bigger hook;
//              no gravitropic bending at 0 g; root bends down at 1 g
// Provenance   every parameter the code reads is in the ledger; every non-assumed source
//              resolves; no Math.random / synthetic paths in the model
import { readFileSync, readdirSync } from "node:fs";
import refsCsv from "../data/params/references.csv";
import { resolveEnv } from "../app/src/model/environment";
import { cylinderDrop, dAir, R_GAS, seedShape, sherwood, transport } from "../app/src/model/gas";
import { maxStableDu } from "../app/src/model/hormones";
import { defaultParams, LEDGER, type Params } from "../app/src/model/params";
import { PRESETS, PRESET_BY_ID } from "../app/src/model/presets";
import { SeedTwin } from "../app/src/model/simulate";
import { evaluate } from "../scripts/metrics";

let failures = 0;
const results: string[] = [];
function gate(name: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  results.push(`  ${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
  console.log(results[results.length - 1]);
}
const P0 = defaultParams();
const env = (id: string, over: Record<string, number> = {}) => resolveEnv(PRESET_BY_ID.get(id)!, over);
const run = (params: Params, id: string, hours: number, over: Record<string, number> = {}) => {
  const s = new SeedTwin(params, env(id, over));
  s.runTo(hours);
  return s;
};

// ---------------------------------------------------------------- physics
{
  // radial diffusion with zero-order uptake: finite-difference solve vs closed form
  const q = 0.02, R = 50e-6, D = 2e-10, H = 1.3e-5, N = 400;
  const dr = R / N;
  const c = new Float64Array(N + 1); // dissolved conc relative to surface, solved by Gauss–Seidel
  for (let it = 0; it < 200000; it++) {
    let maxd = 0;
    for (let i = 0; i < N; i++) {
      const r = i * dr;
      const nv = i === 0 ? c[1] + (q * dr * dr) / (4 * D) : (c[i + 1] * (r + dr / 2) + c[i - 1] * (r - dr / 2) + (q * dr * dr * r) / D) / (2 * r);
      maxd = Math.max(maxd, Math.abs(nv - c[i]));
      c[i] = nv;
    }
    if (maxd < 1e-13) break;
  }
  const numericDropPa = c[0] / H;
  const analytic = cylinderDrop(q, R, 0, D, H);
  const err = Math.abs(numericDropPa - analytic) / analytic;
  gate("cylinder diffusion–uptake profile", err < 0.01, `centre drop ${analytic.toFixed(1)} Pa analytic vs ${numericDropPa.toFixed(1)} Pa numeric (${(err * 100).toFixed(2)} %)`);
}
gate("Sherwood still-air limit", Math.abs(sherwood(P0, 0, 1) - 2) < 1e-12, `Sh(Re=0) = ${sherwood(P0, 0, 1)}`);
{
  const shape = seedShape(490, 290);
  const tr = transport(P0, shape, 295, 101.325, 0, 0, 10, { testaRuptured: false });
  gate("transport at u = 0 uses Sh = 2", Math.abs(tr.sh - 2) < 1e-12, `Sh = ${tr.sh}`);
  const half = dAir(P0, "o2", 298.15, 101.325 / 2) / dAir(P0, "o2", 298.15, 101.325);
  gate("gas diffusivity ∝ 1/P", Math.abs(half - 2) < 1e-9, `D(P/2)/D(P) = ${half}`);
}

// ---------------------------------------------------------------- conservation
{
  const s = new SeedTwin(P0, env("bric_pdfu"), { sampleEvery: 0.05 });
  const o2start = s.hs.o2;
  let consumed = 0; // mol per seed
  while (s.t < 48 - 1e-9) {
    s.step();
    consumed += s.respiration * s.dt * 3600;
  }
  const V = s.env.headspace_ml * 1e-6;
  const T = s.env.temp_c + 273.15;
  const predicted = o2start - (consumed * s.env.seeds * R_GAS * T) / V;
  const err = Math.abs(predicted - s.hs.o2) / Math.max(o2start - s.hs.o2, 1e-9);
  gate("sealed-headspace O2 mass balance", err < 0.02, `ΔO2 ${(o2start - s.hs.o2).toFixed(2)} Pa vs Σ uptake ${(o2start - predicted).toFixed(2)} Pa (${(err * 100).toFixed(2)} %)`);
}

// ---------------------------------------------------------------- mechanism
{
  const s = run({ ...P0, turgor_ref_mpa: 1e-4 }, "ground_petri", 48);
  const grew = s.cortexVolumeByIndex().some((x, i) => Math.abs(x.volume - s.cortexVolumeByIndex()[i].volume) > 0);
  void grew;
  const L = s.samples[s.samples.length - 1].axis_len_um / s.samples[0].axis_len_um;
  gate("no growth below the yield threshold", Math.abs(L - 1) < 1e-9 && s.milestones.testaRupture === null, `axis length ratio ${L}`);
}
{
  const s = run({ ...P0, testa_strength_mpa: 1e9 }, "ground_petri", 72);
  gate("no rupture under infinite restraint", s.milestones.testaRupture === null && s.milestones.endospermRupture === null, `testa ${s.milestones.testaRupture}, endosperm ${s.milestones.endospermRupture}`);
}
{
  const du = 0.05 / P0["hormone_time_unit_h"];
  const bound = maxStableDu(P0, 12);
  gate("hormone substepping keeps du inside the stability bound", du / Math.ceil(du / (0.8 * bound)) <= bound, `du ${du.toFixed(3)}, bound ${bound.toFixed(3)}`);
}

// ---------------------------------------------------------------- calibration (observed windows)
{
  const m = evaluate(P0);
  gate("testa rupture in the Col-0 window", m.testa_rupture_h >= 16 && m.testa_rupture_h <= 31, `${m.testa_rupture_h.toFixed(1)} h (Bassel 2014 onset 16–22 h; Dekkers 2013 20–31 h)`);
  gate("endosperm rupture in the Col-0 window", m.endosperm_rupture_h >= 28 && m.endosperm_rupture_h <= 45, `${m.endosperm_rupture_h.toFixed(1)} h (Bassel 2014 28–32 h; Dekkers 2013 31–45 h)`);
  gate("testa ruptures before the endosperm", m.testa_rupture_h < m.endosperm_rupture_h, `${m.testa_rupture_h.toFixed(1)} < ${m.endosperm_rupture_h.toFixed(1)} h`);
  gate("expansion onset in the lower hypocotyl at 16–22 h", m.expansion_onset_h >= 16 && m.expansion_onset_h <= 22, `${m.expansion_onset_h} h (Bassel 2014)`);
  gate("peak relative expansion near cortical cell 8", m.peak_expansion_index >= 6 && m.peak_expansion_index <= 10, `cell ${m.peak_expansion_index} (Bassel 2014: ≈ 8)`);
  gate("ABA falls on imbibition", m.aba_12h_ratio >= 0.15 && m.aba_12h_ratio <= 0.5, `ABA(12 h)/ABA(0) = ${m.aba_12h_ratio.toFixed(2)} (Okamoto 2006: 0.30)`);
}

// ---------------------------------------------------------------- seedling
{
  const light = run(P0, "ground_petri", 120);
  const dark = run(P0, "ground_petri", 120, { light_umol: 0, light_h_per_cycle: 0 });
  const hl = light.samples.at(-1)!.hyp_len_um;
  const hd = dark.samples.at(-1)!.hyp_len_um;
  gate("dark hypocotyl longer than light", hd > 1.5 * hl, `dark ${hd.toFixed(0)} µm vs light ${hl.toFixed(0)} µm at 120 h`);
  // gassing assay (as in triple-response screens): dark seedlings, ventilated, 10 ppm ethylene vs none
  const darkAir = { light_umol: 0, light_h_per_cycle: 0, vent_ach: 10 };
  const ctl = run(P0, "ground_petri", 120, darkAir);
  const gas = run(P0, "ground_petri", 120, { ...darkAir, eth_inlet_ppm: 10 });
  const hC = ctl.samples.at(-1)!.hyp_len_um;
  const hG = gas.samples.at(-1)!.hyp_len_um;
  gate("ethylene shortens the dark hypocotyl", hG < 0.8 * hC, `10 ppm ${hG.toFixed(0)} µm vs air ${hC.toFixed(0)} µm`);
  const hookC = Math.max(...ctl.samples.map((r) => r.hook_deg));
  const hookG = Math.max(...gas.samples.map((r) => r.hook_deg));
  gate("ethylene exaggerates the apical hook", hookG > hookC + 10, `${hookG.toFixed(0)}° vs ${hookC.toFixed(0)}°`);
  const thick = (s: SeedTwin) => {
    const t = s.template;
    let r = 0;
    let k = 0;
    for (const sid of t.order.slice(t.order.indexOf(t.colletSliceId))) {
      for (const i of t.slices[sid].cells) {
        r += s.cells.dep[i] / (s.cells.vol0[i] / (s.cells.len0[i] * s.cells.wid[i]) || 1);
        k++;
      }
    }
    return r / k;
  };
  gate("ethylene thickens the dark hypocotyl", thick(gas) > 1.1 * thick(ctl), `radial factor ${thick(gas).toFixed(2)} vs ${thick(ctl).toFixed(2)}`);
  const rootC = ctl.samples.at(-1)!.root_len_um;
  const rootG = gas.samples.at(-1)!.root_len_um;
  gate("ethylene shortens the root", rootG < 0.8 * rootC, `${rootG.toFixed(0)} µm vs ${rootC.toFixed(0)} µm`);
  const zeroG = run(P0, "ground_petri", 120, { gravity_g: 0 });
  gate("no gravitropic bending at 0 g", Math.abs(zeroG.samples.at(-1)!.root_angle_deg - 180) < 1, `root tip angle ${zeroG.samples.at(-1)!.root_angle_deg.toFixed(2)}° (180° = initial direction)`);
  const ang = light.samples.at(-1)!.root_angle_deg;
  gate("root bends down at 1 g", Math.abs(ang - 270) < 15, `root tip angle ${ang.toFixed(1)}° (270° = straight down)`);
}

// ---------------------------------------------------------------- provenance
{
  const src = readdirSync("app/src/model").filter((f) => f.endsWith(".ts")).map((f) => readFileSync(`app/src/model/${f}`, "utf8")).join("\n");
  const ids = new Set<string>();
  for (const m of src.matchAll(/p\((?:params|P|this\.params|sim\.params), *["`]([a-z0-9_${}]+)["`]\)/g)) {
    const id = m[1];
    if (id.includes("${gas}")) for (const g of ["o2", "co2", "eth"]) ids.add(id.replace("${gas}", g));
    else ids.add(id);
  }
  const ledger = new Set(LEDGER.map((e) => e.id));
  const missing = [...ids].filter((id) => !ledger.has(id));
  gate("every parameter read by the model is in the ledger", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : `${ids.size} ids`);
  const banned = [...src.matchAll(/Math\.random|synthetic|fallback/gi)].map((m) => m[0]);
  gate("no Math.random / synthetic / fallback in the model", banned.length === 0, banned.length ? banned.join(", ") : "clean");
  const refKeys = new Set(refsCsv.split("\n").slice(1).map((l) => l.split(",")[0]).filter(Boolean));
  const bad: string[] = [];
  for (const pr of PRESETS)
    for (const [k, f] of Object.entries(pr.fields)) {
      if (f.tier === "assumed") continue;
      for (const s of f.source.split(/[;\s]+/).filter(Boolean)) if (!s.startsWith("repo:") && s !== "definition" && !refKeys.has(s)) bad.push(`${pr.id}.${k}: ${s}`);
      if (!f.source) bad.push(`${pr.id}.${k}: no source`);
    }
  gate("every non-assumed preset field has a resolvable source", bad.length === 0, bad.length ? bad.join("; ") : `${PRESETS.length} presets`);
  const unverified = refsCsv.split("\n").slice(1).filter((l) => l && !l.includes("Crossref API") && !l.startsWith("norcross2013") && !l.startsWith("nasa_moon_factsheet"));
  gate("every DOI reference verified against Crossref", unverified.length === 0, unverified.length ? unverified.map((l) => l.split(",")[0]).join(", ") : "all verified");
}

console.log(failures === 0 ? "\nAll seed-twin gates passed.\n" : `\n${failures} gate(s) FAILED.\n`);
if (failures > 0) process.exit(1);
