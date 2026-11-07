// Cell-adjacency graph in compressed sparse row (CSR) form.
//
// Hormone transport between neighbouring cells uses the face-flux idea of the
// virtual-root model (docs/app.js step()), generalised from a 2D grid to this 3D cell
// graph: each edge carries a symmetric exchange term. The graph is rebuilt whenever the
// seedling module adds cells by division.
import { Region, Tissue, type Template } from "./geometry";

export interface Graph {
  n: number;
  offsets: Int32Array; // length n + 1
  nbr: Int32Array;
}

function mapAround(a: number, nFrom: number, nTo: number): number {
  return Math.min(nTo - 1, Math.floor(((a + 0.5) / nFrom) * nTo));
}

export function buildGraph(t: Template): Graph {
  const c = t.cells;
  const n = c.n;
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  const link = (i: number, j: number) => {
    if (i === j || i < 0 || j < 0) return;
    adj[i].add(j);
    adj[j].add(i);
  };

  // cells of one slice grouped by ring
  const byRing = (sid: number): number[][] => {
    const s = t.slices[sid];
    const rings: number[][] = s.rings.map(() => []);
    for (const i of s.cells) rings[c.ringIdx[i]][c.around[i]] = i;
    return rings;
  };
  const ringMid = (sid: number, r: number) => {
    const ring = t.slices[sid].rings[r];
    return (ring.r0 + ring.r1) / 2;
  };

  // within-slice links
  for (const sid of t.order) {
    const rings = byRing(sid);
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      const m = ring.length;
      for (let a = 0; a < m; a++) {
        if (m > 1) link(ring[a], ring[(a + 1) % m]);
        if (r + 1 < rings.length) {
          const outer = rings[r + 1];
          link(ring[a], outer[mapAround(a, m, outer.length)]);
          // every outer cell also needs an inward link
        }
      }
      if (r + 1 < rings.length) {
        const outer = rings[r + 1];
        for (let a = 0; a < outer.length; a++) link(outer[a], ring[mapAround(a, outer.length, m)]);
      }
    }
  }

  // between consecutive slices: match by closest relative ring radius and around fraction
  for (let k = 0; k + 1 < t.order.length; k++) {
    const A = t.order[k];
    const B = t.order[k + 1];
    const ra = byRing(A);
    const rb = byRing(B);
    for (let r = 0; r < ra.length; r++) {
      const mid = ringMid(A, r);
      let best = 0;
      let bestD = Infinity;
      for (let q = 0; q < rb.length; q++) {
        const d = Math.abs(ringMid(B, q) - mid);
        if (d < bestD) (bestD = d), (best = q);
      }
      for (let a = 0; a < ra[r].length; a++) link(ra[r][a], rb[best][mapAround(a, ra[r].length, rb[best].length)]);
    }
    for (let q = 0; q < rb.length; q++) {
      const mid = ringMid(B, q);
      let best = 0;
      let bestD = Infinity;
      for (let r = 0; r < ra.length; r++) {
        const d = Math.abs(ringMid(A, r) - mid);
        if (d < bestD) (bestD = d), (best = r);
      }
      for (let a = 0; a < rb[q].length; a++) link(rb[q][a], ra[best][mapAround(a, rb[q].length, ra[best].length)]);
    }
  }

  // cotyledon grids (6-neighbourhood) + attachment to the top slice at the node
  const [nu, nv, nw] = t.cotGrid;
  const cotIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) if (c.cot[i] >= 0) cotIndex.set(`${c.cot[i]}:${c.gu[i]}:${c.gv[i]}:${c.gw[i]}`, i);
  const topSlice = t.slices[t.order[t.order.length - 1]];
  const topCells = topSlice.cells.filter((i) => c.tissue[i] !== Tissue.Epidermis);
  for (const [key, i] of cotIndex) {
    const [side, u, v, w] = key.split(":").map(Number);
    const nb = [
      [u + 1, v, w],
      [u, v + 1, w],
      [u, v, w + 1],
    ];
    for (const [uu, vv, ww] of nb) {
      if (uu < nu && vv < nv && ww < nw) {
        const j = cotIndex.get(`${side}:${uu}:${vv}:${ww}`);
        if (j !== undefined) link(i, j);
      }
    }
    if (u === 0 && topCells.length) link(i, topCells[(v * nw + w + side * 7) % topCells.length]);
  }

  // endosperm shell: 6 nearest neighbours by great-circle distance on the unit sphere
  const endo: number[] = [];
  for (let i = 0; i < n; i++) if (c.region[i] === Region.Endosperm) endo.push(i);
  const xyz = endo.map((i) => {
    const th = c.shellTheta[i];
    const ph = c.shellPhi[i];
    return [Math.cos(th), Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)];
  });
  for (let a = 0; a < endo.length; a++) {
    const d: [number, number][] = [];
    for (let b = 0; b < endo.length; b++) {
      if (a === b) continue;
      const dot = xyz[a][0] * xyz[b][0] + xyz[a][1] * xyz[b][1] + xyz[a][2] * xyz[b][2];
      d.push([-dot, b]);
    }
    d.sort((x, y) => x[0] - y[0]);
    for (let k = 0; k < Math.min(6, d.length); k++) link(endo[a], endo[d[k][1]]);
  }

  const offsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + adj[i].size;
  const nbr = new Int32Array(offsets[n]);
  for (let i = 0; i < n; i++) {
    let k = offsets[i];
    for (const j of [...adj[i]].sort((x, y) => x - y)) nbr[k++] = j;
  }
  return { n, offsets, nbr };
}
