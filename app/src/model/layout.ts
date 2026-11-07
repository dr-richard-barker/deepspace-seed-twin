// World-space layout of every cell from the current organ state.
//
// The embryonic axis (and later the seedling root and hypocotyl) is a planar curve in the
// x–y plane (gravity = −y; the plate/substrate normal is z). Each slice is a disc of cells
// placed around the curve with a rotation-free frame. While the embryo is inside the seed
// the cotyledon node is held fixed by the seed coat, so axial growth pushes the radicle
// tip toward the micropylar end; once the root anchors, the collet becomes the fixed point
// and hypocotyl growth lifts the cotyledons out.
import { Region, meanLen, type Template } from "./geometry";

export interface OrganPose {
  /** world position of the fixed point used while inside the seed (cotyledon node) */
  node: [number, number];
  /** once anchored, the collet stays at this position */
  colletAnchor: [number, number] | null;
  /** direction the radicle points when it leaves the seed (rad, world) */
  rootAngle0: number;
  /** 0 = cotyledons folded inside the seed, 1 = fully open */
  cotOpen: number;
  /** 1 once cotyledons are out of the seed coat */
  cotOut: number;
  /** volumetric swelling factor from imbibition (1 = dry) */
  swell: number;
  /** endosperm cap ruptured (micropylar cells pushed aside) */
  endospermRuptured: boolean;
  /** testa ruptured (shell split) */
  testaRuptured: boolean;
  /** seed coat + endosperm shed after the cotyledons emerge */
  shed?: boolean;
}

export interface Layout {
  n: number;
  pos: Float32Array;
  quat: Float32Array;
  scale: Float32Array;
  visible: Uint8Array;
  tip: [number, number];
  node: [number, number];
  collet: [number, number];
  /**
   * Seed-coat frame [tx, ty, phi]: a point p of the seed (testa, endosperm) sits at R(phi)·p + t.
   * Identity while the root is unanchored; afterwards the cotyledons carry the seed with them.
   */
  shell: [number, number, number];
  bbox: [number, number, number, number, number, number];
}

export function allocLayout(capacity: number): Layout {
  return {
    n: 0,
    pos: new Float32Array(capacity * 3),
    quat: new Float32Array(capacity * 4),
    scale: new Float32Array(capacity * 3),
    visible: new Uint8Array(capacity),
    tip: [0, 0],
    node: [0, 0],
    collet: [0, 0],
    shell: [0, 0, 0],
    bbox: [0, 0, 0, 0, 0, 0],
  };
}

// quaternion from an orthonormal basis (columns X, Y, Z)
function quatFromBasis(
  out: Float32Array,
  o: number,
  xx: number, xy: number, xz: number,
  yx: number, yy: number, yz: number,
  zx: number, zy: number, zz: number,
) {
  const tr = xx + yy + zz;
  let qw: number, qx: number, qy: number, qz: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    qw = 0.25 * s;
    qx = (yz - zy) / s;
    qy = (zx - xz) / s;
    qz = (xy - yx) / s;
  } else if (xx > yy && xx > zz) {
    const s = Math.sqrt(1 + xx - yy - zz) * 2;
    qw = (yz - zy) / s;
    qx = 0.25 * s;
    qy = (yx + xy) / s;
    qz = (zx + xz) / s;
  } else if (yy > zz) {
    const s = Math.sqrt(1 + yy - xx - zz) * 2;
    qw = (zx - xz) / s;
    qx = (yx + xy) / s;
    qy = 0.25 * s;
    qz = (zy + yz) / s;
  } else {
    const s = Math.sqrt(1 + zz - xx - yy) * 2;
    qw = (xy - yx) / s;
    qx = (zx + xz) / s;
    qy = (zy + yz) / s;
    qz = 0.25 * s;
  }
  out[o] = qx;
  out[o + 1] = qy;
  out[o + 2] = qz;
  out[o + 3] = qw;
}

/** Radial growth factor of a slice: sqrt of mean cross-section area ratio of its cells. */
function radialFactor(t: Template, sid: number): number {
  const c = t.cells;
  let acc = 0;
  let n = 0;
  for (const i of t.slices[sid].cells) {
    const a0 = c.vol0[i] / c.len0[i];
    const a = c.wid[i] * c.dep[i];
    acc += a / a0;
    n++;
  }
  return Math.sqrt(acc / Math.max(n, 1));
}

export function initialPose(t: Template): OrganPose {
  let total = 0;
  for (const id of t.order) total += meanLen(t.cells, t.slices[id]);
  return {
    node: [t.embryo.xTip + total, t.embryo.yAxis],
    colletAnchor: null,
    rootAngle0: Math.PI,
    cotOpen: 0,
    cotOut: 0,
    swell: 1,
    endospermRuptured: false,
    testaRuptured: false,
  };
}

export function computeLayout(t: Template, pose: OrganPose, L: Layout): void {
  const c = t.cells;
  L.n = c.n;
  const lin = Math.cbrt(pose.swell);
  const order = t.order;
  const nS = order.length;
  const len = new Float64Array(nS);
  const bend = new Float64Array(nS);
  for (let k = 0; k < nS; k++) {
    len[k] = meanLen(c, t.slices[order[k]]) * lin;
    bend[k] = t.slices[order[k]].bend;
  }
  const kColl = Math.max(0, order.indexOf(t.colletSliceId));

  // centre point + tangent angle of every slice. The shape is always built from the collet,
  // with the collet pointing along rootAngle0 — the frame the seedling dynamics use for root
  // gravitropism, the hook and hypocotyl gravitropism (seedling.ts) — so the drawn root points
  // where the model says it does. Before the root anchors, the seed coat holds the cotyledon
  // node, so the same shape is translated to keep the node fixed; after anchoring the collet
  // stays put. The two cases agree at the moment of anchoring, so the seedling never jumps.
  const cx = new Float64Array(nS);
  const cy = new Float64Array(nS);
  const th = new Float64Array(nS); // tangent pointing toward the root tip
  {
    const origin: [number, number] = pose.colletAnchor ?? [0, 0];
    // collet fixed: walk down to the tip and up to the node
    let x = origin[0];
    let y = origin[1];
    let a = pose.rootAngle0;
    // collet slice itself centred on the anchor
    cx[kColl] = x;
    cy[kColl] = y;
    th[kColl] = a;
    for (let k = kColl - 1; k >= 0; k--) {
      const step = (len[k + 1] + len[k]) / 2;
      a += (bend[k + 1] + bend[k]) / 2;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      cx[k] = x;
      cy[k] = y;
      th[k] = a;
    }
    x = origin[0];
    y = origin[1];
    a = pose.rootAngle0 + Math.PI; // pointing up the hypocotyl
    for (let k = kColl + 1; k < nS; k++) {
      const step = (len[k - 1] + len[k]) / 2;
      a += (bend[k - 1] + bend[k]) / 2;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      cx[k] = x;
      cy[k] = y;
      th[k] = a + Math.PI;
    }
    if (!pose.colletAnchor) {
      // inside the seed: shift the whole axis so its top end sits on the fixed node
      const topA = th[nS - 1] + Math.PI;
      const nx = cx[nS - 1] + (Math.cos(topA) * len[nS - 1]) / 2;
      const ny = cy[nS - 1] + (Math.sin(topA) * len[nS - 1]) / 2;
      const dx = pose.node[0] - nx;
      const dy = pose.node[1] - ny;
      for (let k = 0; k < nS; k++) {
        cx[k] += dx;
        cy[k] += dy;
      }
    }
  }

  let xmin = Infinity, ymin = Infinity, zmin = Infinity, xmax = -Infinity, ymax = -Infinity, zmax = -Infinity;
  const put = (i: number, x: number, y: number, z: number) => {
    L.pos[3 * i] = x;
    L.pos[3 * i + 1] = y;
    L.pos[3 * i + 2] = z;
    if (L.visible[i]) {
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
      if (z < zmin) zmin = z;
      if (z > zmax) zmax = z;
    }
  };

  // --- axis + cap cells
  for (let k = 0; k < nS; k++) {
    const s = t.slices[order[k]];
    const rf = radialFactor(t, s.id) * lin;
    const R = s.radius0 * rf;
    const tx = Math.cos(th[k]);
    const ty = Math.sin(th[k]);
    const nx = -ty;
    const ny = tx;
    for (const i of s.cells) {
      const ring = s.rings[c.ringIdx[i]];
      const nA = c.nAround[i];
      const phi = (2 * Math.PI * (c.around[i] + 0.5)) / nA;
      const r = nA === 1 && ring.r0 === 0 ? 0 : ((ring.r0 + ring.r1) / 2) * R;
      const rx = Math.cos(phi) * nx;
      const ry = Math.cos(phi) * ny;
      const rz = Math.sin(phi);
      L.visible[i] = 1;
      put(i, cx[k] + r * rx, cy[k] + r * ry, r * rz);
      // basis: X = tangent, Y = radial, Z = X × Y (circumferential)
      const zx = ty * rz - 0 * ry;
      const zy = 0 * rx - tx * rz;
      const zz = tx * ry - ty * rx;
      quatFromBasis(L.quat, 4 * i, tx, ty, 0, rx, ry, rz, zx, zy, zz);
      L.scale[3 * i] = c.len[i] * lin;
      L.scale[3 * i + 1] = c.dep[i] * lin;
      L.scale[3 * i + 2] = c.wid[i] * lin;
    }
  }
  L.tip = [cx[0], cy[0]];
  L.collet = [cx[kColl], cy[kColl]];
  const topTh = th[nS - 1] + Math.PI; // pointing out of the top of the hypocotyl
  const node: [number, number] = [
    cx[nS - 1] + (Math.cos(topTh) * len[nS - 1]) / 2,
    cy[nS - 1] + (Math.sin(topTh) * len[nS - 1]) / 2,
  ];
  L.node = node;

  // --- seed-coat frame: the seed rides on the cotyledons. With a straight, unanchored embryo the
  // node sits at pose.node and the top of the axis points along rootAngle0 + π, so this is the
  // identity; once the hypocotyl lifts and hooks the cotyledons, the seed moves and turns with them.
  const phi = topTh - (pose.rootAngle0 + Math.PI);
  const cphi = Math.cos(phi);
  const sphi = Math.sin(phi);
  L.shell = [node[0] - (cphi * pose.node[0] - sphi * pose.node[1]), node[1] - (sphi * pose.node[0] + cphi * pose.node[1]), phi];
  const [stx, sty] = L.shell;

  // --- cotyledons
  const [, nv, nw] = t.cotGrid;
  const topR = t.slices[order[nS - 1]].radius0;
  const Tx = Math.cos(topTh);
  const Ty = Math.sin(topTh);
  const Nx = -Ty;
  const Ny = Tx;
  const open = Math.max(0, Math.min(1, pose.cotOpen));
  const stack = [t.embryo.cotY[0] - t.embryo.yAxis, t.embryo.cotY[1] - t.embryo.yAxis];
  for (let i = 0; i < c.n; i++) {
    const side = c.cot[i];
    if (side < 0) continue;
    const sign = side === 0 ? 1 : -1;
    // folded: point back down the axis (β = π) offset along +N; open: β = ±0.42π
    const betaOpen = sign * 0.42 * Math.PI;
    const betaFold = Math.PI;
    const beta = betaFold + (betaOpen - betaFold) * open;
    const dx = Math.cos(beta) * Tx + Math.sin(beta) * Nx;
    const dy = Math.cos(beta) * Ty + Math.sin(beta) * Ny;
    const px = -dy; // in-plane perpendicular (thickness direction)
    const py = dx;
    // folded: stacked beside the axis; open: just either side of the node
    const off = (1 - open) * stack[side] + open * sign * topR * 0.3;
    const lu = c.len[i] * lin;
    const lv = c.wid[i] * lin;
    const lw = c.dep[i] * lin;
    const u = (c.gu[i] + 0.5) * lu;
    const v = (c.gv[i] + 0.5 - nv / 2) * lv;
    const w = (c.gw[i] + 0.5 - nw / 2) * lw;
    L.visible[i] = 1;
    put(i, node[0] + Nx * off + px * w + dx * u, node[1] + Ny * off + py * w + dy * u, v);
    quatFromBasis(L.quat, 4 * i, dx, dy, 0, px, py, 0, 0, 0, 1);
    L.scale[3 * i] = lu;
    L.scale[3 * i + 1] = lw;
    L.scale[3 * i + 2] = lv;
  }

  // --- endosperm shell (moves with the seed coat: local seed coordinates, then the seed frame)
  const ea = (t.seed.a - t.seed.testa - t.seed.endo / 2) * Math.cbrt(Math.min(pose.swell, 1.25));
  const eb = (t.seed.b - t.seed.testa - t.seed.endo / 2) * Math.cbrt(Math.min(pose.swell, 1.25));
  for (let i = 0; i < c.n; i++) {
    if (c.region[i] !== Region.Endosperm) continue;
    const thS = c.shellTheta[i];
    const ph = c.shellPhi[i];
    const x = ea * Math.cos(thS);
    const y = eb * Math.sin(thS) * Math.cos(ph);
    const z = eb * Math.sin(thS) * Math.sin(ph);
    let gx = x / (ea * ea);
    let gy = y / (eb * eb);
    let gz = z / (eb * eb);
    const gn = Math.hypot(gx, gy, gz) || 1;
    gx /= gn;
    gy /= gn;
    gz /= gn;
    // tangent: project x-axis onto the tangent plane
    let ax = 1 - gx * gx;
    let ay = -gx * gy;
    let az = -gx * gz;
    const an = Math.hypot(ax, ay, az);
    if (an < 1e-6) {
      ax = 0;
      ay = 1;
      az = 0;
    } else {
      ax /= an;
      ay /= an;
      az /= an;
    }
    const zx = ay * gz - az * gy;
    const zy = az * gx - ax * gz;
    const zz = ax * gy - ay * gx;
    L.visible[i] = pose.shed || (pose.endospermRuptured && c.micropylar[i] && x < -ea * 0.82) ? 0 : 1;
    const rx = (u: number, v: number) => cphi * u - sphi * v;
    const ry = (u: number, v: number) => sphi * u + cphi * v;
    put(i, rx(x, y) + stx, ry(x, y) + sty, z);
    quatFromBasis(L.quat, 4 * i, rx(ax, ay), ry(ax, ay), az, rx(gx, gy), ry(gx, gy), gz, rx(zx, zy), ry(zx, zy), zz);
    L.scale[3 * i] = c.len[i];
    L.scale[3 * i + 1] = c.dep[i];
    L.scale[3 * i + 2] = c.wid[i];
  }
  L.bbox = [xmin, ymin, zmin, xmax, ymax, zmax];
}
