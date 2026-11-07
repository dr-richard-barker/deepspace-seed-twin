// Procedural cellular-resolution template of a mature Arabidopsis seed.
//
// SCHEMATIC GEOMETRY. No open, segmented 3D mesh of the mature Arabidopsis embryo exists
// (checked 2026-11-06: 3DCellAtlas data on request only; MorphoGraphX2 deposit has no
// embryo). The template is built from the anatomical dimensions and cell counts in the
// parameter ledger, and its topology follows Bassel et al. 2014: the embryonic axis is a
// stack of transverse "slices", and every cortical cell is indexed by its position from
// the quiescent centre (QC). Slice k = 1 is the first slice above the QC.
//
// Structure-of-arrays with spare capacity so the seedling stage can add root cells.
import { p, type Params } from "./params";

export const enum Tissue {
  Epidermis = 0,
  Cortex = 1,
  Endodermis = 2,
  Stele = 3,
  Cap = 4,
  Mesophyll = 5,
  CotEpidermis = 6,
  Endosperm = 7,
}
export const TISSUE_NAMES = [
  "epidermis",
  "cortex",
  "endodermis",
  "stele (provasculature)",
  "root cap / QC",
  "cotyledon mesophyll",
  "cotyledon epidermis",
  "endosperm",
];

export const enum Region {
  Radicle = 0,
  Hypocotyl = 1,
  Cotyledon = 2,
  Cap = 3,
  Endosperm = 4,
}
export const REGION_NAMES = ["radicle", "hypocotyl", "cotyledon", "root cap", "endosperm"];

export interface RingSpec {
  tissue: Tissue;
  nAround: number;
  /** inner and outer radius as a fraction of the slice radius */
  r0: number;
  r1: number;
}

export interface Slice {
  id: number;
  region: Region;
  /** index from the QC at creation (Bassel numbering); root slices made later get negative ids */
  qcIndex: number;
  cells: number[];
  rings: RingSpec[];
  /** slice radius (µm) at t = 0, before radial growth */
  radius0: number;
  /** turning angle (rad) across this slice, for gravitropism / apical hook. Stored as an
   *  angle, not a curvature, so uniform elongation conserves it (a stretched arc keeps its angle). */
  bend: number;
  /** true for slices of the mature embryo template (the Bassel-indexed cells) */
  embryo: boolean;
}

export interface Cells {
  capacity: number;
  n: number;
  tissue: Uint8Array;
  region: Uint8Array;
  slice: Int32Array; // slice id, -1 for non-axis cells
  ringIdx: Uint8Array;
  around: Uint16Array;
  nAround: Uint16Array;
  cot: Int8Array; // -1 none, 0/1 cotyledon
  gu: Int16Array; // cotyledon grid (length, width, thickness)
  gv: Int16Array;
  gw: Int16Array;
  shellTheta: Float64Array; // endosperm shell coordinates
  shellPhi: Float64Array;
  micropylar: Uint8Array; // 1 = micropylar endosperm (cap over the radicle tip)
  len: Float64Array; // µm along the organ axis
  wid: Float64Array; // µm circumferential
  dep: Float64Array; // µm radial
  len0: Float64Array;
  vol0: Float64Array; // µm³ at t = 0
  wallT: Float64Array; // µm, wall thickness carrying the turgor load
}

export interface Template {
  cells: Cells;
  slices: Slice[];
  /** slice ids ordered from the root tip upward to the cotyledon node */
  order: number[];
  colletSliceId: number;
  qcSliceId: number;
  seed: { a: number; b: number; testa: number; endo: number; mucilage: number };
  embryo: { xTip: number; yAxis: number; cotY: [number, number]; cotLen: number; cotWid: number; cotThk: number };
  cotGrid: [number, number, number];
}

function allocCells(capacity: number): Cells {
  return {
    capacity,
    n: 0,
    tissue: new Uint8Array(capacity),
    region: new Uint8Array(capacity),
    slice: new Int32Array(capacity).fill(-1),
    ringIdx: new Uint8Array(capacity),
    around: new Uint16Array(capacity),
    nAround: new Uint16Array(capacity),
    cot: new Int8Array(capacity).fill(-1),
    gu: new Int16Array(capacity),
    gv: new Int16Array(capacity),
    gw: new Int16Array(capacity),
    shellTheta: new Float64Array(capacity),
    shellPhi: new Float64Array(capacity),
    micropylar: new Uint8Array(capacity),
    len: new Float64Array(capacity),
    wid: new Float64Array(capacity),
    dep: new Float64Array(capacity),
    len0: new Float64Array(capacity),
    vol0: new Float64Array(capacity),
    wallT: new Float64Array(capacity),
  };
}

export function addCell(c: Cells): number {
  if (c.n >= c.capacity) throw new Error(`cell capacity ${c.capacity} exceeded`);
  return c.n++;
}

/** Copy every per-cell field from `src` to `dst` (used when a root cell divides). */
export function copyCell(c: Cells, src: number, dst: number): void {
  c.tissue[dst] = c.tissue[src];
  c.region[dst] = c.region[src];
  c.slice[dst] = c.slice[src];
  c.ringIdx[dst] = c.ringIdx[src];
  c.around[dst] = c.around[src];
  c.nAround[dst] = c.nAround[src];
  c.cot[dst] = c.cot[src];
  c.gu[dst] = c.gu[src];
  c.gv[dst] = c.gv[src];
  c.gw[dst] = c.gw[src];
  c.shellTheta[dst] = c.shellTheta[src];
  c.shellPhi[dst] = c.shellPhi[src];
  c.micropylar[dst] = c.micropylar[src];
  c.len[dst] = c.len[src];
  c.wid[dst] = c.wid[src];
  c.dep[dst] = c.dep[src];
  c.len0[dst] = c.len0[src];
  c.vol0[dst] = c.vol0[src];
  c.wallT[dst] = c.wallT[src];
}

export function ringsFor(params: Params, region: Region): RingSpec[] {
  const epi = p(params, "geo_n_epidermis");
  const cor = p(params, "geo_n_cortex");
  const corIn = p(params, "geo_n_cortex_inner");
  const endo = p(params, "geo_n_endodermis");
  const ste = p(params, "geo_n_stele");
  const rSte = p(params, "geo_r_frac_stele");
  const rEnd = p(params, "geo_r_frac_endodermis");
  const rEpi = p(params, "geo_r_frac_epidermis_inner");
  if (region === Region.Hypocotyl && p(params, "geo_cortex_layers_hypocotyl") >= 2) {
    const mid = (rEnd + rEpi) / 2;
    return [
      { tissue: Tissue.Stele, nAround: ste, r0: 0, r1: rSte },
      { tissue: Tissue.Endodermis, nAround: endo, r0: rSte, r1: rEnd },
      { tissue: Tissue.Cortex, nAround: corIn, r0: rEnd, r1: mid },
      { tissue: Tissue.Cortex, nAround: cor, r0: mid, r1: rEpi },
      { tissue: Tissue.Epidermis, nAround: epi, r0: rEpi, r1: 1 },
    ];
  }
  return [
    { tissue: Tissue.Stele, nAround: ste, r0: 0, r1: rSte },
    { tissue: Tissue.Endodermis, nAround: endo, r0: rSte, r1: rEnd },
    { tissue: Tissue.Cortex, nAround: cor, r0: rEnd, r1: rEpi },
    { tissue: Tissue.Epidermis, nAround: epi, r0: rEpi, r1: 1 },
  ];
}

/** Fill one axis slice with cells; returns the slice. */
export function buildSlice(
  cells: Cells,
  params: Params,
  id: number,
  qcIndex: number,
  region: Region,
  radius: number,
  cellLen: number,
): Slice {
  const rings = ringsFor(params, region);
  const tExt = p(params, "wall_t_exterior_um");
  const tInt = p(params, "wall_t_interior_um");
  const slice: Slice = { id, region, qcIndex, cells: [], rings, radius0: radius, bend: 0, embryo: true };
  rings.forEach((ring, ri) => {
    const rIn = ring.r0 * radius;
    const rOut = ring.r1 * radius;
    const rMid = (rIn + rOut) / 2;
    const n = Math.max(1, Math.round(ring.nAround));
    for (let a = 0; a < n; a++) {
      const i = addCell(cells);
      cells.tissue[i] = ring.tissue;
      cells.region[i] = region;
      cells.slice[i] = id;
      cells.ringIdx[i] = ri;
      cells.around[i] = a;
      cells.nAround[i] = n;
      cells.len[i] = cellLen;
      cells.len0[i] = cellLen;
      cells.dep[i] = Math.max(rOut - rIn, 1);
      cells.wid[i] = ring.tissue === Tissue.Stele && rIn === 0 ? Math.max((2 * Math.PI * rMid) / n, rOut) : (2 * Math.PI * rMid) / n;
      cells.vol0[i] = cells.len[i] * cells.wid[i] * cells.dep[i];
      cells.wallT[i] = ring.tissue === Tissue.Epidermis ? tExt : tInt;
      slice.cells.push(i);
    }
  });
  return slice;
}

/** Profile helper: value rising from `tip` to `base` with e-folding length `lambda` slices. */
function profile(k: number, tip: number, base: number, lambda: number): number {
  return base - (base - tip) * Math.exp(-(k - 1) / Math.max(lambda, 1e-6));
}

export function buildTemplate(params: Params, capacity = 24000): Template {
  const cells = allocCells(capacity);
  const slices: Slice[] = [];
  const order: number[] = [];

  const L = p(params, "geo_seed_length_um");
  const W = p(params, "geo_seed_width_um");
  const testa = p(params, "geo_testa_um");
  const endoT = p(params, "geo_endosperm_um");
  const mucilage = p(params, "geo_mucilage_max_um");
  const a = L / 2;
  const b = W / 2;

  const K = Math.round(p(params, "geo_axis_slices"));
  const collet = Math.round(p(params, "geo_collet_index"));
  const capTiers = Math.round(p(params, "geo_cap_tiers"));
  const capPerTier = Math.round(p(params, "geo_cap_cells_per_tier"));
  const lTip = p(params, "geo_cell_len_tip_um");
  const lBase = p(params, "geo_cell_len_base_um");
  const lLam = p(params, "geo_cell_len_lambda");
  const rTip = p(params, "geo_axis_r_tip_um");
  const rBase = p(params, "geo_axis_r_base_um");
  const rLam = p(params, "geo_axis_r_lambda");
  const tInt = p(params, "wall_t_interior_um");
  const tExt = p(params, "wall_t_exterior_um");

  // --- root cap + QC tiers (slice ids -capTiers .. 0), tier 0 holds the QC
  let nextId = 0;
  for (let tier = capTiers; tier >= 0; tier--) {
    const id = nextId++;
    const s: Slice = { id, region: Region.Cap, qcIndex: -tier, cells: [], rings: [], radius0: 0, bend: 0, embryo: true };
    const rr = rTip * (0.35 + 0.65 * (1 - tier / (capTiers + 1)));
    s.radius0 = rr;
    const nRing = tier === 0 ? Math.max(4, Math.round(capPerTier / 2)) : capPerTier;
    s.rings = [
      { tissue: Tissue.Cap, nAround: 1, r0: 0, r1: 0.35 },
      { tissue: Tissue.Cap, nAround: nRing, r0: 0.35, r1: 1 },
    ];
    for (const [ri, ring] of s.rings.entries()) {
      for (let k = 0; k < ring.nAround; k++) {
        const i = addCell(cells);
        cells.tissue[i] = Tissue.Cap;
        cells.region[i] = Region.Cap;
        cells.slice[i] = id;
        cells.ringIdx[i] = ri;
        cells.around[i] = k;
        cells.nAround[i] = ring.nAround;
        const rMid = ((ring.r0 + ring.r1) / 2) * rr;
        cells.len[i] = lTip * 0.8;
        cells.len0[i] = cells.len[i];
        cells.dep[i] = (ring.r1 - ring.r0) * rr;
        cells.wid[i] = ring.nAround === 1 ? 2 * ring.r1 * rr : (2 * Math.PI * rMid) / ring.nAround;
        cells.vol0[i] = cells.len[i] * cells.wid[i] * cells.dep[i];
        cells.wallT[i] = ri === 1 ? tExt : tInt;
        s.cells.push(i);
      }
    }
    slices.push(s);
    order.push(id);
  }
  const qcSliceId = nextId - 1;

  // --- axis slices k = 1..K: radicle below the collet, hypocotyl from the collet up
  let colletSliceId = -1;
  for (let k = 1; k <= K; k++) {
    const region = k < collet ? Region.Radicle : Region.Hypocotyl;
    const radius = profile(k, rTip, rBase, rLam);
    const len = profile(k, lTip, lBase, lLam);
    const s = buildSlice(cells, params, nextId++, k, region, radius, len);
    if (k === collet) colletSliceId = s.id;
    slices.push(s);
    order.push(s.id);
  }

  // --- embryo placement inside the seed (x = long axis, radicle tip at the micropylar end)
  // centre the folded embryo (axis + two stacked cotyledons) in the seed cavity
  const axisLen = order.reduce((acc, id) => acc + meanLen(cells, slices[id]), 0);
  const xTip = -axisLen / 2;
  const rMax = rBase;
  const cotThk = p(params, "geo_cot_thickness_um");
  const stackH = 2 * rMax + 2 * cotThk + 2;
  const yAxis = -stackH / 2 + rMax;
  const cot0 = yAxis + rMax + cotThk / 2 + 1;
  const cot1 = cot0 + cotThk + 1;

  // --- cotyledons: folded back alongside the axis (bent-cotyledon embryo)
  const nu = Math.round(p(params, "geo_cot_cells_length"));
  const nv = Math.round(p(params, "geo_cot_cells_width"));
  const nw = Math.round(p(params, "geo_cot_cells_thickness"));
  const cotLen = p(params, "geo_cot_length_um");
  const cotWid = p(params, "geo_cot_width_um");
  for (let side = 0; side < 2; side++) {
    for (let u = 0; u < nu; u++)
      for (let v = 0; v < nv; v++)
        for (let w = 0; w < nw; w++) {
          const i = addCell(cells);
          const surface = w === 0 || w === nw - 1;
          cells.tissue[i] = surface ? Tissue.CotEpidermis : Tissue.Mesophyll;
          cells.region[i] = Region.Cotyledon;
          cells.cot[i] = side;
          cells.gu[i] = u;
          cells.gv[i] = v;
          cells.gw[i] = w;
          cells.len[i] = cotLen / nu;
          cells.len0[i] = cells.len[i];
          cells.wid[i] = cotWid / nv;
          cells.dep[i] = cotThk / nw;
          cells.vol0[i] = cells.len[i] * cells.wid[i] * cells.dep[i];
          cells.wallT[i] = surface ? tExt : tInt;
        }
  }

  // --- endosperm: one cell layer on an ellipsoidal shell (Fibonacci lattice)
  const nEndo = Math.round(p(params, "geo_endosperm_cells"));
  const micropylarFrac = p(params, "geo_micropylar_fraction");
  const golden = Math.PI * (3 - Math.sqrt(5));
  const ea = a - testa - endoT / 2;
  const eb = b - testa - endoT / 2;
  const area = 4 * Math.PI * Math.pow((Math.pow(ea * eb, 1.6) * 2 + Math.pow(eb * eb, 1.6)) / 3, 1 / 1.6);
  const edge = Math.sqrt(area / nEndo);
  for (let k = 0; k < nEndo; k++) {
    const i = addCell(cells);
    const xN = 1 - (2 * (k + 0.5)) / nEndo; // -1..1 along the long axis
    const theta = Math.acos(xN);
    const phi = k * golden;
    cells.tissue[i] = Tissue.Endosperm;
    cells.region[i] = Region.Endosperm;
    cells.shellTheta[i] = theta;
    cells.shellPhi[i] = phi;
    cells.micropylar[i] = xN < -1 + 2 * micropylarFrac ? 1 : 0;
    cells.len[i] = edge;
    cells.len0[i] = edge;
    cells.wid[i] = edge;
    cells.dep[i] = endoT;
    cells.vol0[i] = edge * edge * endoT;
    cells.wallT[i] = tInt;
  }

  return {
    cells,
    slices,
    order,
    colletSliceId,
    qcSliceId,
    seed: { a, b, testa, endo: endoT, mucilage },
    embryo: { xTip, yAxis, cotY: [cot0, cot1], cotLen, cotWid, cotThk },
    cotGrid: [nu, nv, nw],
  };
}

export function meanLen(cells: Cells, s: Slice): number {
  // the slice's axial length is its cortex mean (or all cells for cap slices)
  let sum = 0;
  let n = 0;
  for (const i of s.cells) {
    if (s.region === Region.Cap || cells.tissue[i] === Tissue.Cortex) {
      sum += cells.len[i];
      n++;
    }
  }
  if (n === 0) for (const i of s.cells) (sum += cells.len[i]), n++;
  return sum / Math.max(n, 1);
}

/** Total length of the embryonic axis from the QC to the cotyledon node (µm). */
export function axisLength(t: Template): number {
  let L = 0;
  for (const id of t.order) {
    const s = t.slices[id];
    if (s.region === Region.Cap) continue;
    L += meanLen(t.cells, s);
  }
  return L;
}
