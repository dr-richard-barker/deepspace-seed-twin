// Cell identity → germinating-embryo cluster of the single-cell atlas (Liew et al. 2024,
// doi:10.1038/s41477-024-01771-3) as annotated in deepspace-seed-stress-decoder
// (panels/germination_cluster_annotations.csv). The mapping is by tissue and region of
// the procedural template; the documented rationale for each row is in
// data/decoder/identity_map.csv. Hypocotyl cortex clusters are time-resolved in the atlas
// (early 12 h → cluster 5, mid 24 h → 7, late 48 h → 1), so cortex identity follows time.
import decoder from "../../../data/decoder/nes_by_cluster.json";
import { Region, Tissue, type Template } from "./geometry";

export interface DecoderData {
  description: string;
  source: string;
  clusters: Record<string, { cell_type: string; organ: string; peak_time: string }>;
  nes: Record<string, Record<string, number>>;
  contrasts_by_class: Record<string, string[]>;
}
export const DECODER = decoder as unknown as DecoderData;

/** Stressor classes offered for the overlay (subset relevant to the environments). */
export const OVERLAY_CLASSES = [
  "low_oxygen",
  "hypobaria",
  "microgravity",
  "radiation_GCR",
  "radiation_acute",
  "radiation_lowdose",
  "ethylene",
  "hormone_ga",
  "osmotic",
] as const;

export function clusterOf(t: Template, i: number, hours: number): string | null {
  const c = t.cells;
  const region = c.region[i];
  const tissue = c.tissue[i];
  if (region === Region.Endosperm) return null; // no germinating-endosperm cluster in the atlas
  if (region === Region.Cap) return "4"; // columella / root cap (+QC)
  if (region === Region.Cotyledon) return tissue === Tissue.CotEpidermis ? "6" : "3";
  const sid = c.slice[i];
  const s = sid >= 0 ? t.slices[sid] : null;
  const radicle = region === Region.Radicle;
  switch (tissue) {
    case Tissue.Epidermis:
      return radicle ? "10" : "6";
    case Tissue.Cortex:
      if (radicle) return s && s.qcIndex <= 3 ? "14" : "2";
      return hours < 18 ? "5" : hours < 36 ? "7" : "1";
    case Tissue.Endodermis:
      return radicle && s && s.qcIndex <= 3 ? "14" : "2";
    case Tissue.Stele: {
      if (radicle && s && s.qcIndex <= 3) return "14";
      // diarch provasculature: two protoxylem poles, two protophloem poles, the rest generic
      const a = c.around[i];
      const n = c.nAround[i];
      if (n >= 4) {
        if (a === 0 || a === Math.floor(n / 2)) return "9";
        if (a === Math.floor(n / 4) || a === Math.floor((3 * n) / 4)) return "15";
      }
      return "12";
    }
    default:
      return null;
  }
}

export function nesFor(cls: string, cluster: string | null): number | null {
  if (cluster === null) return null;
  const v = DECODER.nes[cls]?.[cluster];
  return v === undefined ? null : v;
}
