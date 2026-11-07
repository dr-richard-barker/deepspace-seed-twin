// Colour maps. Data colours are plain hex values resolved here in JS (never CSS var() in
// SVG attributes — WebKit ignores them, ABAI lesson L018).

export type RGB = [number, number, number];

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// tissue palette (index = Tissue enum)
export const TISSUE_COLORS: RGB[] = [
  hex("#7fc97f"), // epidermis
  hex("#e6c86e"), // cortex
  hex("#c08552"), // endodermis
  hex("#5b8cc9"), // stele
  hex("#d98cb3"), // cap / QC
  hex("#4caf50"), // cotyledon mesophyll
  hex("#9bd49b"), // cotyledon epidermis
  hex("#e8dcc0"), // endosperm
];
export const TISSUE_HEX = ["#7fc97f", "#e6c86e", "#c08552", "#5b8cc9", "#d98cb3", "#4caf50", "#9bd49b", "#e8dcc0"];

// sequential: viridis-like control points
const SEQ = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"].map(hex);
// diverging (NES / signed change): blue - grey - red
const DIV = ["#2166ac", "#67a9cf", "#d9d9d9", "#ef8a62", "#b2182b"].map(hex);

function ramp(stops: RGB[], t: number): RGB {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export const sequential = (t: number): RGB => ramp(SEQ, t);
export const diverging = (t: number): RGB => ramp(DIV, (t + 1) / 2);

export function rgbHex(c: RGB): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

export const SEQ_HEX = SEQ.map(rgbHex);
export const DIV_HEX = DIV.map(rgbHex);
