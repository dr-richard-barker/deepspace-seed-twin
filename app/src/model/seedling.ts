// Seedling establishment after radicle protrusion (to ~120 h).
//
// Germination itself is mechanistic (Lockhart growth under seed-coat restraint in
// simulate.ts). After protrusion the twin switches to calibrated growth KINEMATICS, the
// standard description of root and hypocotyl growth:
//   root       meristem cells grow and divide (new slices are inserted, so cells really are
//              produced); cells that leave the meristem elongate in an elongation zone to a
//              mature length (Beemster & Baskin 1998 framework). Gravitropic bending happens
//              in the elongation zone, scaled by the gravity → auxin-asymmetry curve.
//   hypocotyl  cells elongate without dividing (Gendreau et al. 1997), faster in darkness;
//              ethylene inhibits elongation and thickens the hypocotyl in darkness and
//              exaggerates the apical hook — the triple response (Guzmán & Ecker 1990).
//   cotyledons are pushed out once the root anchors, then open only in light.
// Environment, ethylene, O2-limited energy and radiation damage modulate every rate.
import asymmetry from "../../../data/calibration/gravity_auxin_asymmetry.json";
import { buildSlice, copyCell, Region } from "./geometry";
import { p } from "./params";
import type { SeedTwin } from "./simulate";

export interface SeedlingState {
  photosynthesis: number; // reserve units per hour added by open green cotyledons
  hookDeg: number;
  rootTipAngleDeg: number;
  hypElongationStart: number | null;
  hypLen0: number;
  divisions: number;
  /** photomorphogenic (de-etiolation) state: 0 = etiolated, 1 = fully light-grown; irreversible */
  deetiolation: number;
  lengths(sim: SeedTwin): { root: number; hypocotyl: number };
}

const DOWN = -Math.PI / 2;
const UP = Math.PI / 2;

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Relative auxin asymmetry at gravity g, normalised to 1 at 1 g. */
export function gravityResponse(g: number): number {
  const pts = (asymmetry as { points: { g: number; asymmetry_pct: number }[] }).points;
  const gg = Math.max(0, Math.min(2, g));
  let v = pts[pts.length - 1].asymmetry_pct;
  for (let i = 0; i + 1 < pts.length; i++) {
    if (gg <= pts[i + 1].g) {
      const f = (gg - pts[i].g) / (pts[i + 1].g - pts[i].g);
      v = pts[i].asymmetry_pct + f * (pts[i + 1].asymmetry_pct - pts[i].asymmetry_pct);
      break;
    }
  }
  const at1 = pts.find((q) => q.g === 1)?.asymmetry_pct ?? 1;
  return v / at1;
}

export function initSeedling(sim: SeedTwin): SeedlingState {
  const st: SeedlingState = {
    photosynthesis: 0,
    hookDeg: 0,
    rootTipAngleDeg: (sim.pose.rootAngle0 * 180) / Math.PI,
    hypElongationStart: null,
    hypLen0: 0,
    divisions: 0,
    deetiolation: 0,
    lengths(s: SeedTwin) {
      const t = s.template;
      const kColl = t.order.indexOf(t.colletSliceId);
      let root = 0;
      let hyp = 0;
      t.order.forEach((sid, k) => {
        const L = s.meanLenOf(sid);
        if (k < kColl) root += L;
        else hyp += L;
      });
      return { root, hypocotyl: hyp };
    },
  };
  st.hypLen0 = st.lengths(sim).hypocotyl;
  return st;
}

interface Drivers {
  light: number;
  ethResp: number;
  fT: number;
}

/** Split root slice `sid` into two slices of half length (the new one sits above it). */
function divideSlice(sim: SeedTwin, sid: number): void {
  const t = sim.template;
  const c = t.cells;
  const src = t.slices[sid];
  const newId = t.slices.length;
  const radius = src.radius0;
  const fresh = buildSlice(c, sim.params, newId, src.qcIndex, src.region, radius, 1);
  fresh.embryo = false;
  src.bend /= 2; // the turning angle is shared between the two daughters
  fresh.bend = src.bend;
  // copy state cell-by-cell (same ring layout), halve the length of both daughters
  for (let k = 0; k < src.cells.length && k < fresh.cells.length; k++) {
    const a = src.cells[k];
    const b = fresh.cells[k];
    copyCell(c, a, b);
    c.slice[b] = newId;
    c.len[a] /= 2;
    c.len[b] = c.len[a];
    c.len0[b] = c.len0[a];
    sim.h.aba[b] = sim.h.aba[a];
    sim.h.ga[b] = sim.h.ga[a];
    sim.h.integ[b] = sim.h.integ[a];
    sim.h.z[b] = sim.h.z[a];
    sim.h.acc[b] = sim.h.acc[a];
    sim.o2[b] = sim.o2[a];
    sim.energy[b] = sim.energy[a];
    sim.ros[b] = sim.ros[a];
    sim.radSens[b] = sim.radSens[a];
  }
  t.slices.push(fresh);
  const pos = t.order.indexOf(sid);
  t.order.splice(pos + 1, 0, newId);
}

export function stepSeedling(sim: SeedTwin, dt: number, d: Drivers): void {
  const P = sim.params;
  const t = sim.template;
  const c = t.cells;
  const st = sim.seedling;
  const tG = sim.milestones.endospermRupture ?? sim.t;
  const since = sim.t - tG;
  const eTip = sim.mean(sim.energy, sim.tipCells);
  const g = sim.env.gravity_g;
  const gResp = gravityResponse(g);

  // ---------------- root: division in the meristem, elongation in the EZ
  const delay = p(P, "root_meristem_delay_h");
  const zMer = p(P, "root_meristem_len_um");
  const zEz = p(P, "root_ez_len_um");
  const lDiv = p(P, "root_division_len_um");
  const lMat = p(P, "root_mature_len_um");
  const mu = (Math.LN2 / p(P, "root_cell_cycle_h")) * d.fT;
  const rEz = p(P, "root_ez_rate") * d.fT;
  const ethRoot = 1 / (1 + p(P, "eth_root_inhibition") * d.ethResp);
  // ethylene inhibits root growth by shortening the final cell length, not only the rate
  const lMatEth = lMat * ethRoot;
  const radDiv = 1 / (1 + p(P, "ros_to_division_arrest") * sim.mean(sim.ros, sim.tipCells));
  const kColl = t.order.indexOf(t.colletSliceId);
  let z = 0; // distance from the QC (µm)
  let ezLen = 0;
  const ezSlices: number[] = [];
  const toDivide: number[] = [];
  for (let k = 0; k < kColl; k++) {
    const sid = t.order[k];
    const s = t.slices[sid];
    if (s.region === Region.Cap) continue;
    const L = sim.meanLenOf(sid);
    const zc = z + L / 2;
    z += L;
    if (since < delay) continue;
    let rate = 0;
    if (zc < zMer) {
      rate = mu * radDiv * eTip;
      if (L * Math.exp(rate * dt) >= 2 * lDiv) toDivide.push(sid);
    } else if (zc < zMer + zEz && L < lMatEth) {
      rate = rEz * ethRoot * eTip;
      ezSlices.push(sid);
      ezLen += L;
    }
    if (rate > 0) {
      const f = Math.exp(rate * dt);
      for (const i of s.cells) {
        c.len[i] = Math.min(c.len[i] * f, zc < zMer ? lMat : lMatEth);
        sim.growthRate[i] = rate;
      }
    } else for (const i of s.cells) sim.growthRate[i] = 0;
  }
  if (toDivide.length && c.n + toDivide.length * 64 < c.capacity) {
    for (const sid of toDivide) divideSlice(sim, sid);
    st.divisions += toDivide.length;
    sim.rebuildGraph();
    sim.refreshCellFields();
  }

  // gravitropism of the root tip: rotate toward −y in the elongation zone
  let theta = sim.pose.rootAngle0;
  {
    const kc = t.order.indexOf(t.colletSliceId);
    for (let k = kc - 1; k >= 0; k--) theta += t.slices[t.order[k]].bend;
  }
  st.rootTipAngleDeg = (theta * 180) / Math.PI;
  if (ezLen > 0 && g > 0) {
    const omega = p(P, "root_gravitropic_rate_deg_h") * (Math.PI / 180) * gResp * eTip;
    const dTheta = -omega * Math.sin(wrap(theta - DOWN)) * dt;
    for (const sid of ezSlices) t.slices[sid].bend += (dTheta * sim.meanLenOf(sid)) / ezLen;
  }

  // ---------------- anchoring: root hairs fix the collet, hypocotyl growth now lifts the shoot
  if (sim.milestones.anchored === null && since >= p(P, "anchor_delay_h")) {
    sim.updateLayout();
    sim.pose.colletAnchor = [sim.layout.collet[0], sim.layout.collet[1]];
    sim.milestones.anchored = sim.t;
  }

  // ---------------- hypocotyl: elongation without division, acropetal, light/ethylene-gated
  st.deetiolation = Math.min(1, st.deetiolation + p(P, "deetiolation_rate") * d.light * dt);
  const dark = 1 - st.deetiolation;
  const rHyp = (dark * p(P, "hyp_rate_dark") + st.deetiolation * p(P, "hyp_rate_light")) * d.fT;
  const lHypMax = dark * p(P, "hyp_cell_max_dark_um") + st.deetiolation * p(P, "hyp_cell_max_light_um");
  const ethHyp = 1 / (1 + dark * p(P, "eth_hyp_inhibition") * d.ethResp);
  const thick = dark * p(P, "eth_hyp_thickening") * d.ethResp;
  const wave = p(P, "hyp_acropetal_delay_h");
  const hypDelay = p(P, "hyp_elongation_delay_h");
  const hypSlices = t.order.slice(kColl);
  const nHook = Math.round(p(P, "hook_slices"));
  hypSlices.forEach((sid, j) => {
    const s = t.slices[sid];
    if (since < hypDelay + j * wave) return;
    const rate = rHyp * ethHyp * eTip;
    const f = Math.exp(rate * dt);
    const fr = Math.exp(thick * dt);
    for (const i of s.cells) {
      if (c.len[i] < lHypMax) c.len[i] = Math.min(c.len[i] * f, lHypMax);
      if (thick > 0 && c.dep[i] < (c.vol0[i] / (c.len0[i] * c.wid[i])) * p(P, "eth_hyp_thick_max")) {
        c.dep[i] *= fr;
        c.wid[i] *= fr;
      }
      sim.growthRate[i] = rate;
    }
  });

  // apical hook: curvature in the top slices; closed in darkness (exaggerated by ethylene), opens in light
  const hookTarget = (p(P, "hook_angle_dark_deg") * (1 + p(P, "eth_hook_exaggeration") * d.ethResp) * dark * Math.PI) / 180;
  const top = hypSlices.slice(Math.max(0, hypSlices.length - nHook));
  const tau = p(P, "hook_tau_h");
  let hook = 0;
  if (since >= hypDelay) {
    for (const sid of top) {
      const s = t.slices[sid];
      const target = hookTarget / Math.max(top.length, 1);
      s.bend += ((target - s.bend) * dt) / tau;
      hook += s.bend;
    }
  }
  st.hookDeg = (hook * 180) / Math.PI;

  // hypocotyl negative gravitropism (below the hook)
  if (g > 0 && sim.milestones.anchored !== null) {
    let a = sim.pose.rootAngle0 + Math.PI;
    const body = hypSlices.slice(0, Math.max(0, hypSlices.length - nHook));
    let bodyLen = 0;
    for (const sid of body) {
      a += t.slices[sid].bend;
      bodyLen += sim.meanLenOf(sid);
    }
    const omega = p(P, "hyp_gravitropic_rate_deg_h") * (Math.PI / 180) * gResp;
    const dA = -omega * Math.sin(wrap(a - UP)) * dt;
    for (const sid of body) t.slices[sid].bend += (dA * sim.meanLenOf(sid)) / Math.max(bodyLen, 1);
  }

  // ---------------- cotyledons: out once the hypocotyl has lifted them, open in light
  const hypGrowth = st.lengths(sim).hypocotyl - st.hypLen0;
  if (sim.milestones.anchored !== null && sim.pose.cotOut < 1) {
    sim.pose.cotOut = Math.min(1, hypGrowth / Math.max(t.embryo.cotLen, 1));
    if (sim.pose.cotOut >= 1 && sim.milestones.cotEmerged === null) {
      sim.milestones.cotEmerged = sim.t;
      sim.pose.shed = true;
    }
  }
  if (sim.pose.cotOut >= 1 && d.light > 0 && st.deetiolation > 0.2) {
    sim.pose.cotOpen = Math.min(1, sim.pose.cotOpen + p(P, "cot_open_rate") * d.light * dt);
    if (sim.pose.cotOpen >= 0.95 && sim.milestones.cotOpen === null) sim.milestones.cotOpen = sim.t;
    // cotyledon cell expansion in light
    const rc = p(P, "cot_expansion_rate") * d.fT * d.light;
    const maxF = p(P, "cot_expansion_max");
    const f = Math.exp(rc * dt);
    for (let i = 0; i < c.n; i++) {
      if (c.cot[i] < 0) continue;
      if (c.len[i] < c.len0[i] * maxF) {
        c.len[i] *= f;
        c.wid[i] *= f;
      }
    }
  }
  st.photosynthesis = sim.pose.cotOpen > 0.5 ? p(P, "cot_photosynthesis_rate") * d.light * sim.pose.cotOpen : 0;
}
