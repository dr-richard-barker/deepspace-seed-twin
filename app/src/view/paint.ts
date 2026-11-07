// Per-cell colouring for each display mode.
import { Region, Tissue } from "../model/geometry";
import { clusterOf, nesFor } from "../model/identity";
import type { SeedTwin } from "../model/simulate";
import { TISSUE_COLORS, diverging, sequential, type RGB } from "./colors";

export type ColorMode =
  | "tissue"
  | "identity"
  | "expansion"
  | "growth"
  | "aba"
  | "ga"
  | "integ"
  | "ethylene"
  | "o2"
  | "energy"
  | "radiation"
  | "decoder";

export const MODES: { id: ColorMode; label: string; kind: "categorical" | "sequential" | "diverging"; unit: string }[] = [
  { id: "tissue", label: "Tissue", kind: "categorical", unit: "" },
  { id: "identity", label: "Atlas cell identity", kind: "categorical", unit: "" },
  { id: "expansion", label: "Cell expansion (V/V₀)", kind: "sequential", unit: "log₂ fold" },
  { id: "growth", label: "Growth rate", kind: "sequential", unit: "1/h" },
  { id: "aba", label: "ABA", kind: "sequential", unit: "Abley units" },
  { id: "ga", label: "GA", kind: "sequential", unit: "Abley units" },
  { id: "integ", label: "Integrator (DELLA/ABI4/ABI5)", kind: "sequential", unit: "Abley units" },
  { id: "ethylene", label: "Ethylene production (ACO)", kind: "sequential", unit: "norm./h" },
  { id: "o2", label: "O₂ partial pressure", kind: "sequential", unit: "kPa" },
  { id: "energy", label: "Energy supply", kind: "sequential", unit: "0–1" },
  { id: "radiation", label: "Radiation damage / ROS", kind: "sequential", unit: "norm." },
  { id: "decoder", label: "Decoder susceptibility (observed)", kind: "diverging", unit: "NES" },
];

// categorical palette for the 15 atlas clusters (index = cluster number)
const CLUSTER_HEX = [
  "#000000", "#e6c86e", "#c08552", "#4caf50", "#d98cb3", "#f2e394", "#7fc97f", "#d9a441",
  "#9e9e9e", "#2f6db5", "#a6d96a", "#bdbdbd", "#5b8cc9", "#66bb6a", "#e377c2", "#8e63ce",
];
const hexRgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const CLUSTER_RGB = CLUSTER_HEX.map(hexRgb);
export { CLUSTER_HEX };
const GREY: RGB = [0.55, 0.55, 0.52];

export interface PaintResult {
  min: number;
  max: number;
}

/**
 * Colour every cell for `mode`. Sequential modes rescale to the embryo's own min..max each call,
 * unless `fixed` is given; the Studio passes one range shared by all panels and all frames, so
 * colours are comparable side by side and do not flicker over time.
 */
export function paint(sim: SeedTwin, mode: ColorMode, decoderClass: string, out: Float32Array, fixed?: { min: number; max: number }): PaintResult {
  const t = sim.template;
  const c = t.cells;
  const n = c.n;
  const set = (i: number, rgb: RGB) => {
    out[3 * i] = rgb[0];
    out[3 * i + 1] = rgb[1];
    out[3 * i + 2] = rgb[2];
  };
  const field = (i: number): number | null => {
    switch (mode) {
      case "expansion":
        return Math.log2((c.len[i] * c.wid[i] * c.dep[i]) / c.vol0[i]);
      case "growth":
        return sim.growthRate[i];
      case "aba":
        return sim.h.aba[i];
      case "ga":
        return sim.h.ga[i];
      case "integ":
        return sim.h.integ[i];
      case "ethylene":
        return sim.h.aco[i];
      case "o2":
        return sim.o2[i] / 1000;
      case "energy":
        return sim.energy[i];
      case "radiation":
        return sim.ros[i];
      default:
        return null;
    }
  };

  if (mode === "tissue") {
    for (let i = 0; i < n; i++) set(i, TISSUE_COLORS[c.tissue[i]]);
    return { min: 0, max: 0 };
  }
  if (mode === "identity" || mode === "decoder") {
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < n; i++) {
      const cl = clusterOf(t, i, sim.t);
      if (mode === "identity") {
        set(i, cl ? CLUSTER_RGB[Number(cl)] : TISSUE_COLORS[Tissue.Endosperm]);
      } else {
        const v = nesFor(decoderClass, cl);
        if (v === null) set(i, GREY);
        else {
          set(i, diverging(Math.max(-1, Math.min(1, v / 2.5))));
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
    }
    return { min: mode === "decoder" ? -2.5 : 0, max: mode === "decoder" ? 2.5 : 0 };
  }
  // sequential: range over embryo cells (endosperm shown neutral)
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (c.region[i] === Region.Endosperm) continue;
    const v = field(i)!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (mode === "o2") lo = 0;
  if (mode === "expansion") lo = Math.min(lo, 0);
  if (fixed) {
    lo = fixed.min;
    hi = fixed.max;
  }
  if (!(hi > lo)) hi = lo + 1e-9;
  for (let i = 0; i < n; i++) {
    if (c.region[i] === Region.Endosperm) {
      set(i, TISSUE_COLORS[Tissue.Endosperm]);
      continue;
    }
    set(i, sequential(Math.max(0, Math.min(1, (field(i)! - lo) / (hi - lo)))));
  }
  return { min: lo, max: hi };
}
