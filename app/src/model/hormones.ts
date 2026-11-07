// Per-cell hormone network.
//
// CORE: the ABA–GA–Integrator model of Abley et al. 2021 (eLife 10:e59485), equations (1)–(4)
// and the default parameters of their Table 2, transcribed in data/params/research/
// hormones_ethylene.md. The Integrator I lumps the germination inhibitors (DELLAs, ABI4,
// ABI5): ABA promotes its production, GA its degradation; I promotes ABA synthesis and
// represses GA production. Z is the sowing-induced GA-production signal.
//   d[ABA]/dt = β_ABA + f_ABA([I]) − v_ABA [ABA]
//   d[GA]/dt  = β_GA + β_GA,Z [Z] + g_GA([I]) − v_GA [GA]
//   d[I]/dt   = β_I + f_I([ABA]) − (v_I + f_I([GA])) [I]
//   d[Z]/dt   = β_Z − v_Z [Z]
//   f_X(y) = C y^h / (θ^h + y^h),  g_X(y) = C / (1 + y^h/θ^h)
// Abley's time unit is arbitrary; `hormone_time_unit_h` (fitted) maps it to hours.
//
// EXTENSIONS made by this twin (each a ledger parameter with its own tier):
//   • β_Z is switched on by imbibition and graded from the radicle tip (Bassel et al. 2014:
//     GA-biosynthesis promoters first active at the radicle tip), and light-gated.
//   • GID1 abundance, graded from the radicle tip (Bassel et al. 2014), scales the
//     GA-promoted Integrator degradation term f_I([GA]) in each cell.
//   • ABA and GA exchange between neighbouring cells (Topham et al. 2017 couple regions with
//     a transport rate Ω; the face-flux kernel follows virtual-root).
//   • Imbibition induces ABA catabolism (CYP707A2; Okamoto et al. 2006 show the ABA fall on
//     imbibition depends on CYP707A2): v_ABA is multiplied by (1 + c·hydration).
//   • Ethylene lowers the Integrator (Wang et al. 2018: ethylene lowers RGA, GAI, RGL2 and
//     ABI5 transcripts) — strength `eth_integrator_degradation`.
//   • ACC → ethylene by ACC oxidase, which needs O2 (Km for O2 from tomato/apple ACO).
//   • Radiation ROS couplings to ABA synthesis and ACC synthesis (hypotheses, default 0).
import type { Graph } from "./graph";
import { p, type Params } from "./params";

export interface HormoneState {
  aba: Float64Array;
  ga: Float64Array;
  integ: Float64Array; // Abley's Integrator (DELLA/ABI4/ABI5)
  z: Float64Array;
  acc: Float64Array;
  /** ACO flux of each cell in the last step (normalised units per hour) */
  aco: Float64Array;
}

export interface HormoneInputs {
  n: number;
  /** per-cell weight of the sowing-induced GA signal (1 at the radicle tip) */
  gaSource: Float64Array;
  /** per-cell GID1 receptor abundance (1 at the radicle tip; Bassel 2014 receptor gradient) */
  gid1: Float64Array;
  o2: Float64Array; // Pa
  ros: Float64Array;
  active: Uint8Array;
  hydration: number;
  activation: number;
  light: number;
  ethResponse: number;
  fT: number;
}

export function allocHormones(capacity: number): HormoneState {
  return {
    aba: new Float64Array(capacity),
    ga: new Float64Array(capacity),
    integ: new Float64Array(capacity),
    z: new Float64Array(capacity),
    acc: new Float64Array(capacity),
    aco: new Float64Array(capacity),
  };
}

interface Core {
  bA: number; bG: number; bGZ: number; bI: number;
  vA: number; vG: number; vI: number; vZ: number;
  thAI: number; thGI: number; thIA: number; thIG: number;
  cAI: number; cGI: number; cIA: number; cIG: number;
  h: number;
}

function core(params: Params): Core {
  return {
    bA: p(params, "abley_beta_aba"),
    bG: p(params, "abley_beta_ga"),
    bGZ: p(params, "abley_beta_ga_z"),
    bI: p(params, "abley_beta_i"),
    vA: p(params, "abley_v_aba"),
    vG: p(params, "abley_v_ga"),
    vI: p(params, "abley_v_i"),
    vZ: p(params, "abley_v_z"),
    thAI: p(params, "abley_theta_aba_i"),
    thGI: p(params, "abley_theta_ga_i"),
    thIA: p(params, "abley_theta_i_aba"),
    thIG: p(params, "abley_theta_i_ga"),
    cAI: p(params, "abley_c_aba_i"),
    cGI: p(params, "abley_c_ga_i"),
    cIA: p(params, "abley_c_i_aba"),
    cIG: p(params, "abley_c_i_ga"),
    h: p(params, "abley_h"),
  };
}

const up = (C: number, th: number, h: number, y: number) => {
  const yh = Math.pow(Math.max(y, 0), h);
  return (C * yh) / (Math.pow(th, h) + yh);
};
const down = (C: number, th: number, h: number, y: number) => C / (1 + Math.pow(Math.max(y, 0), h) / Math.pow(th, h));

/**
 * Dormant initial state: Abley's "highest-[I] fixed point with β_GA,Z = 0", found by
 * integrating the core without Z from a high-I start until it stops changing.
 */
export function dormantFixedPoint(params: Params): { aba: number; ga: number; integ: number } {
  const k = core(params);
  let a = 10;
  let g = 0;
  let i = 50;
  for (let it = 0; it < 200000; it++) {
    const da = k.bA + up(k.cAI, k.thAI, k.h, i) - k.vA * a;
    const dg = k.bG + down(k.cGI, k.thGI, k.h, i) - k.vG * g;
    const di = k.bI + up(k.cIA, k.thIA, k.h, a) - (k.vI + up(k.cIG, k.thIG, k.h, g)) * i;
    a += 0.01 * da;
    g += 0.01 * dg;
    i += 0.01 * di;
    if (Math.abs(da) + Math.abs(dg) + Math.abs(di) < 1e-12) break;
  }
  return { aba: a, ga: g, integ: i };
}

export function initHormones(params: Params, h: HormoneState, n: number): void {
  const fp = dormantFixedPoint(params);
  for (let i = 0; i < n; i++) {
    h.aba[i] = fp.aba;
    h.ga[i] = fp.ga;
    h.integ[i] = fp.integ;
    h.z[i] = 0;
    h.acc[i] = 0;
    h.aco[i] = 0;
  }
}

/** Growth-promoting response of one cell, 0..1: the Integrator (DELLA/ABI5) represses growth. */
export function growthResponse(params: Params, h: HormoneState, i: number): number {
  const K = p(params, "integrator_growth_k");
  const n = p(params, "integrator_growth_hill");
  return 1 / (1 + Math.pow(h.integ[i] / K, n));
}

const scratch = { a: new Float64Array(0), g: new Float64Array(0) };

/** Advance hormones by dt hours (explicit Euler in Abley time units; gates check stability). */
export function stepHormones(params: Params, graph: Graph, h: HormoneState, inp: HormoneInputs, dt: number): number {
  const n = inp.n;
  if (scratch.a.length < n) {
    scratch.a = new Float64Array(n * 2);
    scratch.g = new Float64Array(n * 2);
  }
  const k = core(params);
  // model time elapsed this step: nothing happens in a dry seed; temperature scales rates
  const du = (dt / p(params, "hormone_time_unit_h")) * inp.activation * inp.fT;
  if (du <= 0) return 0;
  const bZ = p(params, "abley_beta_z");
  const dark = p(params, "ga_dark_fraction");
  const light = dark + (1 - dark) * inp.light;
  const omega = p(params, "hormone_transport_omega");
  const kE = p(params, "eth_integrator_degradation");
  const vAeff = k.vA * (1 + p(params, "aba_imbibition_catabolism") * inp.hydration);
  const rosAba = p(params, "ros_to_aba");
  const rosAcc = p(params, "ros_to_acc");
  // ACC branch is in hours (separate, normalised units)
  const sC = p(params, "acc_synth") * inp.fT * inp.activation;
  const kC = p(params, "acc_decay") * inp.fT;
  const vAco = p(params, "aco_vmax") * inp.fT * inp.activation;
  const KaccAco = p(params, "aco_km_acc");
  const Ko2Aco = p(params, "aco_km_o2_pa");

  const lapA = scratch.a;
  const lapG = scratch.g;
  for (let i = 0; i < n; i++) {
    lapA[i] = 0;
    lapG[i] = 0;
    if (!inp.active[i]) continue;
    for (let e = graph.offsets[i]; e < graph.offsets[i + 1]; e++) {
      const j = graph.nbr[e];
      if (!inp.active[j]) continue;
      lapA[i] += h.aba[j] - h.aba[i];
      lapG[i] += h.ga[j] - h.ga[i];
    }
  }

  let ethProd = 0;
  for (let i = 0; i < n; i++) {
    h.aco[i] = 0;
    if (!inp.active[i]) continue;
    const a = h.aba[i];
    const g = h.ga[i];
    const I = h.integ[i];
    const z = h.z[i];
    const ros = inp.ros[i];
    const dA = k.bA * (1 + rosAba * ros) + up(k.cAI, k.thAI, k.h, I) - vAeff * a + omega * lapA[i];
    const dG = k.bG + k.bGZ * z + down(k.cGI, k.thGI, k.h, I) - k.vG * g + omega * lapG[i];
    const dI = k.bI + up(k.cIA, k.thIA, k.h, a) - (k.vI + inp.gid1[i] * up(k.cIG, k.thIG, k.h, g) + kE * inp.ethResponse) * I;
    const dZ = bZ * inp.hydration * light * inp.gaSource[i] - k.vZ * z;
    h.aba[i] = Math.max(0, a + du * dA);
    h.ga[i] = Math.max(0, g + du * dG);
    h.integ[i] = Math.max(0, I + du * dI);
    h.z[i] = Math.max(0, z + du * dZ);
    // ethylene biosynthesis (hours)
    const c = h.acc[i];
    const o2f = inp.o2[i] / (Ko2Aco + inp.o2[i]);
    const aco = vAco * (c / (KaccAco + c)) * o2f;
    h.acc[i] = Math.max(0, c + dt * (sC * (1 + rosAcc * ros) - kC * c - aco));
    h.aco[i] = aco;
    ethProd += aco;
  }
  return ethProd;
}

/** Largest stable model-time step for the explicit scheme (used by the gates). */
export function maxStableDu(params: Params, maxDegree: number): number {
  const k = core(params);
  const omega = p(params, "hormone_transport_omega");
  const vA = k.vA * (1 + p(params, "aba_imbibition_catabolism"));
  const fastest = Math.max(vA + omega * maxDegree, k.vG + omega * maxDegree, k.vI + k.cIG, k.vZ);
  return 1 / fastest;
}
