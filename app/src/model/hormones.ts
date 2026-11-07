// Per-cell hormone network (normalised units).
//
// Structure follows the ABA–GA antagonism of Topham et al. 2017 (doi:10.1073/pnas.1704745114)
// with the spatial onset reported by Bassel et al. 2014: GA biosynthesis switches on first
// at the radicle tip and the GID1 receptor is highest in the radicle, graded along the axis.
//   ABA   a : synthesis (repressed by GA) − CYP707A catabolism (induced by imbibition)
//   GA    g : light-gated synthesis graded from the tip (repressed by ABA) − GA2ox decay
//   DELLA d : constitutive synthesis − GA·GID1-dependent degradation
//   ACC   c : ACS synthesis − ACO conversion to ethylene (needs O2) − conjugation
// ABA and GA move between neighbouring cells along the CSR graph (virtual-root face-flux
// idea). Values are dimensionless; the parameter ledger records which rate constants are
// fitted, sourced or assumed.
import type { Graph } from "./graph";
import { p, type Params } from "./params";

export interface HormoneState {
  aba: Float64Array;
  ga: Float64Array;
  della: Float64Array;
  acc: Float64Array;
  /** ACO flux of each cell in the last step (normalised units per hour) */
  aco: Float64Array;
}

export interface HormoneInputs {
  n: number;
  /** per-cell spatial GA-synthesis weight (1 at the radicle tip) */
  gaSource: Float64Array;
  /** per-cell GID1 receptor abundance (1 at the radicle tip) */
  gid1: Float64Array;
  /** per-cell O2 partial pressure (Pa) */
  o2: Float64Array;
  /** per-cell radiation ROS / damage state (normalised) */
  ros: Float64Array;
  /** per-cell participation mask (endosperm cells excluded) */
  active: Uint8Array;
  hydration: number; // 0..1
  activation: number; // 0..1 metabolic activation
  light: number; // 0..1
  ethResponse: number; // 0..1 response to internal ethylene
  fT: number; // temperature factor (Q10)
}

export function allocHormones(capacity: number): HormoneState {
  return {
    aba: new Float64Array(capacity),
    ga: new Float64Array(capacity),
    della: new Float64Array(capacity),
    acc: new Float64Array(capacity),
    aco: new Float64Array(capacity),
  };
}

export function initHormones(params: Params, h: HormoneState, n: number): void {
  const a0 = p(params, "aba_init");
  const d0 = p(params, "della_init");
  for (let i = 0; i < n; i++) {
    h.aba[i] = a0;
    h.ga[i] = 0;
    h.della[i] = d0;
    h.acc[i] = 0;
    h.aco[i] = 0;
  }
}

/** Growth-promoting response of one cell, 0..~1: DELLA and ABA repress, ethylene relieves ABA. */
export function growthResponse(params: Params, h: HormoneState, i: number, ethResponse: number): number {
  const Kd = p(params, "k_della_repress");
  const Ka = p(params, "k_aba_repress");
  const eAba = p(params, "eth_aba_relief");
  const abaEff = h.aba[i] / (1 + eAba * ethResponse);
  return 1 / (1 + h.della[i] / Kd) / (1 + abaEff / Ka);
}

const scratchA = { buf: new Float64Array(0) };
const scratchG = { buf: new Float64Array(0) };

/** Advance hormones by dt hours (explicit Euler; the gates check the stability bound). */
export function stepHormones(params: Params, graph: Graph, h: HormoneState, inp: HormoneInputs, dt: number): number {
  const n = inp.n;
  if (scratchA.buf.length < n) {
    scratchA.buf = new Float64Array(n * 2);
    scratchG.buf = new Float64Array(n * 2);
  }
  const fT = inp.fT;
  const hyd = inp.hydration;
  const act = inp.activation;
  const sA = p(params, "aba_synth") * fT;
  const kA = p(params, "aba_decay") * fT;
  const cyp = p(params, "aba_cyp707a_induction");
  const Kga = p(params, "k_ga_represses_aba");
  const sG = p(params, "ga_synth") * fT;
  const kG = p(params, "ga_decay") * fT;
  const Kag = p(params, "k_aba_represses_ga");
  const dark = p(params, "ga_dark_fraction");
  const sD = p(params, "della_synth") * fT;
  const kD = p(params, "della_degrad") * fT;
  const Kgd = p(params, "k_ga_della");
  const sC = p(params, "acc_synth") * fT;
  const kC = p(params, "acc_decay") * fT;
  const vAco = p(params, "aco_vmax") * fT;
  const KaccAco = p(params, "aco_km_acc");
  const Ko2Aco = p(params, "aco_km_o2_pa");
  const rosAba = p(params, "ros_to_aba");
  const rosAcc = p(params, "ros_to_acc");
  const trA = p(params, "aba_transport");
  const trG = p(params, "ga_transport");
  const light = dark + (1 - dark) * inp.light;

  // transport terms (graph Laplacian over active cells)
  const lapA = scratchA.buf;
  const lapG = scratchG.buf;
  for (let i = 0; i < n; i++) {
    lapA[i] = 0;
    lapG[i] = 0;
    if (!inp.active[i]) continue;
    for (let k = graph.offsets[i]; k < graph.offsets[i + 1]; k++) {
      const j = graph.nbr[k];
      if (!inp.active[j]) continue;
      lapA[i] += h.aba[j] - h.aba[i];
      lapG[i] += h.ga[j] - h.ga[i];
    }
  }

  let ethProd = 0; // Σ ACO flux (normalised units), for diagnostics
  for (let i = 0; i < n; i++) {
    h.aco[i] = 0;
    if (!inp.active[i]) continue;
    const a = h.aba[i];
    const g = h.ga[i];
    const d = h.della[i];
    const c = h.acc[i];
    const ros = inp.ros[i];
    const da = sA * act * (1 + rosAba * ros) / (1 + g / Kga) - kA * (1 + cyp * hyd) * a + trA * lapA[i];
    const dg = sG * act * light * inp.gaSource[i] / (1 + a / Kag) - kG * g + trG * lapG[i];
    const dd = sD - kD * inp.gid1[i] * (g / (Kgd + g)) * d;
    const o2f = inp.o2[i] / (Ko2Aco + inp.o2[i]);
    const aco = vAco * act * (c / (KaccAco + c)) * o2f;
    const dc = sC * act * (1 + rosAcc * ros) - kC * c - aco;
    h.aba[i] = Math.max(0, a + dt * da);
    h.ga[i] = Math.max(0, g + dt * dg);
    h.della[i] = Math.max(0, d + dt * dd);
    h.acc[i] = Math.max(0, c + dt * dc);
    h.aco[i] = aco;
    ethProd += aco;
  }
  return ethProd;
}
