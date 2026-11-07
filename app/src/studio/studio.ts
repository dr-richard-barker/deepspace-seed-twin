// The Studio: plays a storyboard (stories/*.json) on a fixed 1920×1080 stage, one seed-twin
// run per panel, with burned-in HTML overlays. Frames are rendered on demand, so the same page
// serves two uses:
//   studio.html?story=gravity            live playback in the browser (play / scrub)
//   studio.html?story=gravity&render=1   driven frame by frame by scripts/render_videos.mjs
//
// Determinism: the model steps with a fixed dt and no wall clock; each frame seeks every panel
// to the frame's simulated time and renders. Before a scene is shown, a prepass runs it once
// to fix the colour range (shared by all panels and frames), the chart range, and a smoothed
// camera that frames every panel at the SAME scale, so a shorter root really looks shorter.
import { makeSim, encodeState, type RunConfig } from "../ui/driver";
import { createSeedViewer, type SeedViewer } from "../view/viewer";
import { paint, MODES, CLUSTER_HEX, type ColorMode } from "../view/paint";
import { seedViewOf, shellExtents } from "../view/seedView";
import { SEQ_HEX, DIV_HEX, TISSUE_HEX } from "../view/colors";
import { TISSUE_NAMES } from "../model/geometry";
import { LEDGER, p } from "../model/params";
import { PRESET_BY_ID } from "../model/presets";
import type { SeedTwin, Sample } from "../model/simulate";
import fieldsData from "../../../data/environments/_fields.json";
import * as S from "./story";

declare const __COMMIT__: string;

const STORIES: Record<string, S.Story> = {};
for (const mod of Object.values(import.meta.glob("../../../stories/*.json", { eager: true, import: "default" }))) {
  const st = mod as S.Story;
  STORIES[st.id] = st;
}

export const W = 1920;
export const H = 1080;
const HEADER_H = 88;
const BOTTOM_H = 262;
const PANELS_H = H - HEADER_H - BOTTOM_H;
const GAP = 10;
const BG = 0x0b100e;
/** Okabe–Ito colours for panels A–D (chart lines and letter chips). */
export const PANEL_HEX = ["#56b4e9", "#e69f00", "#cc79a7", "#f0e442"];
const SITE = "https://dr-richard-barker.github.io/deepspace-seed-twin/";

// ------------------------------------------------------------------ readouts
type Readout = { label: string; fmt: (sim: SeedTwin, s: Sample) => string };
const mm = (um: number) => `${(um / 1000).toFixed(2)} mm`;
function readoutDefs(): Record<S.ReadoutId, Readout> {
  return {
    testa: { label: "Testa rupture", fmt: (sim) => (sim.milestones.testaRupture === null ? "not yet" : `${sim.milestones.testaRupture.toFixed(1)} h`) },
    endosperm: { label: "Endosperm rupture", fmt: (sim) => (sim.milestones.endospermRupture === null ? "not yet" : `${sim.milestones.endospermRupture.toFixed(1)} h`) },
    root: { label: "Root", fmt: (_, s) => mm(s.root_len_um) },
    hypocotyl: { label: "Hypocotyl", fmt: (_, s) => mm(s.hyp_len_um) },
    root_turn: { label: "Root turned toward gravity", fmt: (_, s) => `${Math.max(0, s.root_angle_deg - 180).toFixed(0)}°` },
    hook: { label: "Apical hook", fmt: (_, s) => `${s.hook_deg.toFixed(0)}°` },
    o2_surface: { label: "O₂ at the seed surface", fmt: (_, s) => `${s.o2_surface_kpa.toFixed(1)} kPa` },
    o2_core: { label: "Lowest O₂ inside", fmt: (_, s) => `${s.o2_core_min_kpa.toFixed(2)} kPa` },
    hypoxic: {
      label: "Hypoxic cells",
      fmt: (sim, s) => `${(s.hypoxic_frac * 100).toFixed(0)} % (< ${(p(sim.params, "hypoxia_threshold_pa") / 1000).toFixed(0)} kPa)`,
    },
    eth_hs: { label: "Headspace ethylene", fmt: (_, s) => `${s.eth_hs_ppb < 10 ? s.eth_hs_ppb.toFixed(2) : s.eth_hs_ppb.toFixed(0)} ppb` },
    sherwood: { label: "Sherwood number", fmt: (_, s) => s.sherwood.toFixed(2) },
    dose: { label: "Accumulated dose", fmt: (_, s) => `${s.dose_mgy.toFixed(1)} mGy` },
    water: { label: "Water content", fmt: (_, s) => `${s.water_gg.toFixed(2)} g/g` },
  };
}
const READOUTS = readoutDefs();

function sampleAtOrBefore(sim: SeedTwin, t: number): Sample {
  const xs = sim.samples;
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid].t <= t + 1e-9) lo = mid;
    else hi = mid - 1;
  }
  return xs[lo];
}

// ------------------------------------------------------------------ geometry of the stage
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
function panelRects(layout: S.Layout, n: number): Rect[] {
  const [rows, cols] = S.LAYOUTS[layout];
  const w = Math.floor((W - GAP * (cols + 1)) / cols);
  const h = Math.floor((PANELS_H - GAP * (rows + 1)) / rows);
  const out: Rect[] = [];
  for (let k = 0; k < n; k++) {
    const r = Math.floor(k / cols);
    const c = k % cols;
    out.push({ x: GAP + c * (w + GAP), y: HEADER_H + GAP + r * (h + GAP), w, h });
  }
  return out;
}

// ------------------------------------------------------------------ prepass
interface Prepared {
  ranges: Map<ColorMode, { min: number; max: number }>;
  chart: { min: number; max: number } | null;
  cx: Float64Array;
  cy: Float64Array;
  span: Float64Array;
  title: string;
  labels: string[];
  captions: string[];
  lines: string[];
  refs: S.NumberRef[];
}

function modeOf(scene: S.SceneSpec, k: number): ColorMode {
  return scene.panels![k].colorMode ?? scene.colorMode ?? "tissue";
}

function chartValue(c: S.ChartSpec, s: Sample): number {
  return (s[c.field] as number) * (c.scale ?? 1) + (c.offset ?? 0);
}

function stepTo(sim: SeedTwin, t: number) {
  while (sim.t < t - 1e-6) sim.step();
}

function prepareSim(scene: S.SceneSpec, frames: number, fps: number, aspect: number): Prepared {
  const sims = scene.panels!.map((pp) => makeSim(pp.run));
  const ranges = new Map<ColorMode, { min: number; max: number }>();
  const buf = new Float32Array(Math.max(...sims.map((s) => s.cells.capacity)) * 3);
  const need = { x0: new Float64Array(frames), x1: new Float64Array(frames), y0: new Float64Array(frames), y1: new Float64Array(frames) };
  for (let f = 0; f < frames; f++) {
    const t = S.simTimeAt(scene, f / fps);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    sims.forEach((sim, k) => {
      stepTo(sim, t);
      sim.updateLayout();
      const mode = modeOf(scene, k);
      const r = paint(sim, mode, scene.decoderClass ?? "radiation_GCR", buf);
      const cur = ranges.get(mode);
      ranges.set(mode, cur ? { min: Math.min(cur.min, r.min), max: Math.max(cur.max, r.max) } : { ...r });
      const sv = seedViewOf(sim, buf);
      const b = sim.layout.bbox;
      if (Number.isFinite(b[0])) {
        x0 = Math.min(x0, b[0]);
        x1 = Math.max(x1, b[3]);
        y0 = Math.min(y0, b[1]);
        y1 = Math.max(y1, b[4]);
        if (sv.shell.testaVisible) {
          const e = shellExtents(sv.shell);
          x0 = Math.min(x0, e[0]);
          y0 = Math.min(y0, e[1]);
          x1 = Math.max(x1, e[2]);
          y1 = Math.max(y1, e[3]);
        }
      }
    });
    need.x0[f] = x0;
    need.x1[f] = x1;
    need.y0[f] = y0;
    need.y1[f] = y1;
  }
  // camera: frame the union of everything visible from the start up to one second ahead,
  // eased, never cutting the current extent
  const look = Math.round(fps);
  const cx = new Float64Array(frames);
  const cy = new Float64Array(frames);
  const span = new Float64Array(frames);
  let ux0 = Infinity, ux1 = -Infinity, uy0 = Infinity, uy1 = -Infinity;
  const target = (x0: number, x1: number, y0: number, y1: number) => ({
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    span: Math.max(x1 - x0, (y1 - y0) * aspect, 450) * 1.22,
  });
  for (let f = 0; f < frames; f++) {
    const g = Math.min(frames - 1, f + look);
    for (let q = f === 0 ? 0 : Math.min(frames - 1, f - 1 + look) + 1; q <= g; q++) {
      ux0 = Math.min(ux0, need.x0[q]);
      ux1 = Math.max(ux1, need.x1[q]);
      uy0 = Math.min(uy0, need.y0[q]);
      uy1 = Math.max(uy1, need.y1[q]);
    }
    const tg = target(ux0, ux1, uy0, uy1);
    if (f === 0) {
      cx[f] = tg.cx;
      cy[f] = tg.cy;
      span[f] = tg.span;
    } else {
      const a = 0.1;
      cx[f] = cx[f - 1] + (tg.cx - cx[f - 1]) * a;
      cy[f] = cy[f - 1] + (tg.cy - cy[f - 1]) * a;
      span[f] = span[f - 1] + (tg.span - span[f - 1]) * a;
      const nowSpan = target(need.x0[f], need.x1[f], need.y0[f], need.y1[f]).span;
      if (span[f] < nowSpan) span[f] = nowSpan;
    }
  }
  // templates need the runs to the latest referenced time
  const texts = S.sceneTexts(scene);
  const tNeed = S.neededTime(scene, texts);
  sims.forEach((sim) => stepTo(sim, tNeed));
  let chart: Prepared["chart"] = null;
  if (scene.chart) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const sim of sims) {
      for (const s of sim.samples) {
        if (s.t < scene.t0! - 1e-9 || s.t > scene.t1! + 1e-9) continue;
        const v = chartValue(scene.chart, s);
        if (scene.chart.log && v <= 0) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    if (scene.chart.log) {
      lo = Math.log10(lo);
      hi = Math.log10(hi);
    }
    if (!(hi > lo)) hi = lo + 1;
    // non-negative quantities always get a zero baseline, so small changes are not exaggerated
    const zeroBase = !scene.chart.log && lo >= 0;
    const pad = (hi - lo) * 0.08;
    chart = { min: zeroBase ? 0 : lo - pad, max: hi + pad };
  }
  const refs: S.NumberRef[] = [];
  const ctx = (self?: number): S.ResolveContext => ({ sims, scene, self, fields: fieldsData });
  return {
    ranges,
    chart,
    cx,
    cy,
    span,
    title: S.resolveText(scene.title, ctx(), "title", refs),
    labels: scene.panels!.map((pp, k) => S.resolveText(pp.label, ctx(k), `label ${S.PANEL_LETTERS[k]}`, refs)),
    captions: (scene.captions ?? []).map((c, i) => S.resolveText(c.text, ctx(), `caption ${i + 1}`, refs)),
    lines: (scene.lines ?? []).map((l, i) => S.resolveText(l, ctx(), `line ${i + 1}`, refs)),
    refs,
  };
}

function prepareStatic(scene: S.SceneSpec): Prepared {
  const refs: S.NumberRef[] = [];
  const ctx: S.ResolveContext = { sims: [], scene, fields: fieldsData };
  const empty = new Float64Array(0);
  return {
    ranges: new Map(),
    chart: null,
    cx: empty,
    cy: empty,
    span: empty,
    title: S.resolveText(scene.title, ctx, "title", refs),
    labels: [],
    captions: (scene.captions ?? []).map((c, i) => S.resolveText(c.text, ctx, `caption ${i + 1}`, refs)),
    lines: (scene.lines ?? []).map((l, i) => S.resolveText(l, ctx, `line ${i + 1}`, refs)),
    refs,
  };
}

// ------------------------------------------------------------------ DOM helpers
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}
const SVGNS = "http://www.w3.org/2000/svg";
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}
function gradient(hexes: string[]): string {
  return `linear-gradient(90deg, ${hexes.map((h, i) => `${h} ${((i / (hexes.length - 1)) * 100).toFixed(1)}%`).join(", ")})`;
}
function fmtNum(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toPrecision(2);
}
/** Round tick values inside [lo, hi] (log10 units when `log`). */
function niceTicks(lo: number, hi: number, log: boolean): number[] {
  if (log) {
    const out: number[] = [];
    for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) out.push(Math.pow(10, e));
    return out.length >= 2 ? out : [Math.pow(10, lo), Math.pow(10, hi)];
  }
  const raw = (hi - lo) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toPrecision(10));
  return out;
}

function presetLabel(run: RunConfig): string {
  return PRESET_BY_ID.get(run.presetId)?.label ?? run.presetId;
}

// ------------------------------------------------------------------ the studio
interface Live {
  timing: S.SceneTiming;
  prep: Prepared;
  sims: SeedTwin[];
  viewers: SeedViewer[];
  bufs: Float32Array[];
  panelEls: { root: HTMLElement; readouts: HTMLElement; chips: HTMLElement }[];
  lastFrame: number;
}

export class Studio {
  story!: S.Story;
  tl!: ReturnType<typeof S.timeline>;
  readonly stage: HTMLElement;
  private header: { story: HTMLElement; scene: HTMLElement; clock: HTMLElement };
  private panelsEl: HTMLElement;
  private chartEl: HTMLElement;
  private legendEl: HTMLElement;
  private captionEl: HTMLElement;
  private caveatEl: HTMLElement;
  private cardEl: HTMLElement;
  private live: Live | null = null;
  private prepared = new Map<number, Prepared>();

  constructor(host: HTMLElement) {
    this.stage = el("div", "stage", host);
    const header = el("header", "s-header", this.stage);
    const left = el("div", "s-brand", header);
    el("div", "s-site", left, "Deep Space Seed Twin");
    this.header = { story: el("div", "s-story", left), scene: el("div", "s-scene", header), clock: el("div", "s-clock", header) };
    this.panelsEl = el("section", "s-panels", this.stage);
    const bottom = el("section", "s-bottom", this.stage);
    this.chartEl = el("div", "s-chart", bottom);
    const right = el("div", "s-right", bottom);
    this.legendEl = el("div", "s-legend", right);
    this.caveatEl = el("div", "s-caveat", right);
    this.cardEl = el("div", "s-card", this.stage);
    this.captionEl = el("div", "s-caption", this.stage);
  }

  stories(): string[] {
    return Object.keys(STORIES).sort();
  }

  load(id: string) {
    const st = STORIES[id];
    if (!st) throw new Error(`no story "${id}" (have: ${this.stories().join(", ")})`);
    this.teardown();
    this.prepared.clear();
    this.story = st;
    this.tl = S.timeline(st);
    this.header.story.textContent = st.title;
    return { id, frames: this.tl.frames, fps: this.tl.fps, durationS: this.tl.durationS, scenes: this.tl.scenes.length };
  }

  private teardown() {
    if (!this.live) return;
    this.live.viewers.forEach((v) => v.dispose());
    this.panelsEl.replaceChildren();
    this.live = null;
  }

  private prep(timing: S.SceneTiming): Prepared {
    let pr = this.prepared.get(timing.index);
    if (!pr) {
      const s = timing.scene;
      if (s.kind === "sim") {
        const r = panelRects(s.layout!, s.panels!.length)[0];
        pr = prepareSim(s, timing.frames, this.tl.fps, r.w / r.h);
      } else pr = prepareStatic(s);
      this.prepared.set(timing.index, pr);
    }
    return pr;
  }

  /** Every number shown on screen, with the template that produced it. */
  numbers(): S.NumberRef[] {
    return this.tl.scenes.flatMap((tm) => this.prep(tm).refs);
  }

  /** WebVTT of the burned-in captions (for the <track> on the Stories page). */
  vtt(): string {
    const ts = (s: number) => {
      const ms = Math.round(s * 1000);
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
    };
    const cues: string[] = [];
    for (const tm of this.tl.scenes) {
      const pr = this.prep(tm);
      const s = tm.scene;
      if (s.id !== "_end") cues.push(`${ts(tm.startS)} --> ${ts(tm.startS + Math.min(3, tm.durationS))}\n${pr.title}`);
      (s.captions ?? []).forEach((c, i) => {
        const a = tm.startS + S.captionStart(s, c);
        const b = Math.min(tm.startS + tm.durationS, a + c.dur_s);
        cues.push(`${ts(a)} --> ${ts(b)}\n${pr.captions[i]}`);
      });
    }
    return "WEBVTT\n\n" + cues.join("\n\n") + "\n";
  }

  /** Main-app URL that reproduces one panel of one scene. */
  reproduceUrl(sceneId?: string, panel?: number): string {
    const sc = this.story.scenes.find((s) => s.id === (sceneId ?? this.story.reproduce?.scene)) ?? this.story.scenes.find((s) => s.kind === "sim");
    if (!sc || !sc.panels) return SITE;
    const pk = Math.min(panel ?? this.story.reproduce?.panel ?? 0, sc.panels.length - 1);
    const hash = encodeState({ primary: sc.panels[pk].run, compare: null, mode: modeOf(sc, pk), decoderClass: sc.decoderClass ?? "low_oxygen", t: sc.t1! });
    return `${SITE}#${hash}`;
  }

  renderFrame(frame: number): void {
    const { timing, localS } = S.locate(this.tl, frame);
    const scene = timing.scene;
    const pr = this.prep(timing);
    this.header.scene.textContent = scene.id === "_end" ? "" : pr.title;
    const fi = frame - timing.startFrame;
    // captions and caveats
    const caps = (scene.captions ?? []).map((c, i) => ({ c, i })).filter(({ c }) => {
      const a = S.captionStart(scene, c);
      return localS >= a && localS < a + c.dur_s;
    });
    this.captionEl.textContent = caps.map(({ i }) => pr.captions[i]).join("  ");
    this.captionEl.style.display = caps.length ? "block" : "none";
    this.caveatEl.replaceChildren();
    if (scene.caveats?.length) {
      el("b", "", this.caveatEl, "Assumption");
      for (const cv of scene.caveats) el("div", "", this.caveatEl, cv);
    }
    this.caveatEl.style.display = scene.caveats?.length ? "block" : "none";

    this.stage.classList.toggle("is-card", scene.kind !== "sim");
    if (scene.kind !== "sim") {
      this.teardown();
      this.header.clock.textContent = "";
      this.chartEl.replaceChildren();
      this.legendEl.replaceChildren();
      this.drawCard(scene, pr);
      return;
    }
    this.cardEl.style.display = "none";
    if (!this.live || this.live.timing.index !== timing.index || fi < this.live.lastFrame) this.enterScene(timing, pr);
    const live = this.live!;
    live.lastFrame = fi;
    const t = S.simTimeAt(scene, localS);
    const span = pr.span[fi];
    live.sims.forEach((sim, k) => {
      stepTo(sim, t);
      sim.updateLayout();
      const mode = modeOf(scene, k);
      paint(sim, mode, scene.decoderClass ?? "radiation_GCR", live.bufs[k], pr.ranges.get(mode));
      const v = live.viewers[k];
      v.update([seedViewOf(sim, live.bufs[k])]);
      v.setGravityArrow(sim.env.gravity_g);
      v.setFraming(pr.cx[fi], pr.cy[fi], span);
      v.render();
      const s = sampleAtOrBefore(sim, t);
      const pe = live.panelEls[k];
      pe.readouts.replaceChildren();
      const ids = scene.panels![k].readouts ?? [];
      for (const id of ids) {
        const row = el("div", "s-ro", pe.readouts);
        el("span", "", row, READOUTS[id].label);
        el("b", "", row, READOUTS[id].fmt(sim, s));
      }
      pe.chips.replaceChildren();
      const ms = sim.milestones;
      const chip = (name: string, at: number | null) => {
        if (at !== null && at <= t + 1e-9) el("span", "s-chip", pe.chips, `${name} ${at.toFixed(1)} h`);
      };
      chip("testa", ms.testaRupture);
      chip("endosperm", ms.endospermRupture);
      chip("cotyledons out", ms.cotEmerged);
      chip("open", ms.cotOpen);
    });
    const day = Math.floor(t / 24) + 1;
    this.header.clock.textContent = `${t.toFixed(1)} h after imbibition · day ${day}`;
    this.drawChart(scene, pr, live.sims, t);
    this.drawLegend(scene, pr, span / live.panelEls[0].root.clientWidth);
  }

  private enterScene(timing: S.SceneTiming, pr: Prepared) {
    this.teardown();
    const scene = timing.scene;
    const rects = panelRects(scene.layout!, scene.panels!.length);
    const sims = scene.panels!.map((pp) => makeSim(pp.run));
    const viewers: SeedViewer[] = [];
    const panelEls: Live["panelEls"] = [];
    const bufs: Float32Array[] = [];
    scene.panels!.forEach((pp, k) => {
      const r = rects[k];
      const root = el("div", r.w < 800 ? "s-panel narrow" : "s-panel", this.panelsEl);
      Object.assign(root.style, { left: `${r.x}px`, top: `${r.y - HEADER_H}px`, width: `${r.w}px`, height: `${r.h}px` });
      const host = el("div", "s-canvas", root);
      const v = createSeedViewer(host, sims[k].cells.capacity, () => undefined, { autoRender: false, size: [r.w, r.h], background: BG, interactive: false });
      v.setCut(scene.camera?.cut ?? true);
      v.setOrbit(scene.camera?.elev ?? 8, scene.camera?.azim ?? 0);
      viewers.push(v);
      bufs.push(new Float32Array(sims[k].cells.capacity * 3));
      const lab = el("div", "s-plabel", root);
      const letter = el("span", "s-letter", lab, S.PANEL_LETTERS[k]);
      letter.style.background = PANEL_HEX[k];
      el("span", "", lab, pr.labels[k]);
      el("div", "s-pmeta", root, presetLabel(pp.run));
      if (S.isHypothesis(pp.run)) {
        root.classList.add("hyp");
        el("div", "s-hyp", root, "HYPOTHESIS — not a result: a coupling with no verified source is switched on");
      }
      const readouts = el("div", "s-readouts", root);
      const chips = el("div", "s-chips", root);
      panelEls.push({ root, readouts, chips });
    });
    this.live = { timing, prep: pr, sims, viewers, bufs, panelEls, lastFrame: -1 };
  }

  private drawCard(scene: S.SceneSpec, pr: Prepared) {
    const c = this.cardEl;
    c.style.display = "flex";
    c.replaceChildren();
    if (scene.id === "_end") {
      el("h1", "", c, "Simulation, not flight data");
      const tiers = new Map<string, number>();
      for (const e of LEDGER) tiers.set(e.tier, (tiers.get(e.tier) ?? 0) + 1);
      const order = ["measured", "standard", "derived", "fitted", "assumed"];
      el("p", "", c, `Every number on screen is computed by the model or read from a cited source.`);
      el("p", "", c, `Parameters: ${LEDGER.length} in total — ${order.map((t) => `${tiers.get(t) ?? 0} ${t}`).join(" · ")}. Assumed values are marked in the tool.`);
      el("p", "s-muted", c, `Model: deepspace-seed-twin @ ${__COMMIT__}`);
      el("p", "s-link", c, `Reproduce it live: ${SITE.replace("https://", "")}studio.html?story=${this.story.id}`);
      return;
    }
    if (scene.kind === "fields") {
      el("h1", "", c, pr.title);
      c.appendChild(fieldsChart());
      for (const l of pr.lines) el("p", "", c, l);
      return;
    }
    el("h1", "", c, pr.title);
    for (const l of pr.lines) el("p", "", c, l);
  }

  private drawChart(scene: S.SceneSpec, pr: Prepared, sims: SeedTwin[], t: number) {
    this.chartEl.replaceChildren();
    const spec = scene.chart;
    if (!spec || !pr.chart) return;
    const cw = 1180;
    const ch = 236;
    const m = { l: 70, r: 20, t: 34, b: 34 };
    const root = svg("svg", { width: cw, height: ch, viewBox: `0 0 ${cw} ${ch}` }, this.chartEl);
    const x = (h: number) => m.l + ((h - scene.t0!) / (scene.t1! - scene.t0!)) * (cw - m.l - m.r);
    const yv = (v: number) => {
      const u = spec.log ? Math.log10(Math.max(v, 1e-12)) : v;
      return ch - m.b - ((u - pr.chart!.min) / (pr.chart!.max - pr.chart!.min)) * (ch - m.t - m.b);
    };
    svg("text", { x: m.l, y: 20, fill: "#e6ece4", "font-size": 19, "font-weight": 600 }, root).textContent = `${spec.label}${spec.unit ? ` (${spec.unit})` : ""}`;
    // axes
    svg("line", { x1: m.l, y1: ch - m.b, x2: cw - m.r, y2: ch - m.b, stroke: "#3a463e" }, root);
    const span = scene.t1! - scene.t0!;
    const step = span > 72 ? 24 : span > 30 ? 12 : span > 12 ? 4 : 2;
    for (let h = Math.ceil(scene.t0! / step) * step; h <= scene.t1! + 1e-9; h += step) {
      svg("line", { x1: x(h), y1: ch - m.b, x2: x(h), y2: ch - m.b + 5, stroke: "#3a463e" }, root);
      svg("text", { x: x(h), y: ch - 10, fill: "#8d9b88", "font-size": 15, "text-anchor": "middle" }, root).textContent = `${h} h`;
    }
    for (const v of niceTicks(pr.chart.min, pr.chart.max, !!spec.log)) {
      const yy = yv(v);
      svg("line", { x1: m.l, y1: yy, x2: cw - m.r, y2: yy, stroke: "#1d2622" }, root);
      svg("text", { x: m.l - 8, y: yy + 5, fill: "#8d9b88", "font-size": 14, "text-anchor": "end" }, root).textContent = fmtNum(v);
    }
    sims.forEach((sim, k) => {
      const pts: string[] = [];
      for (const s of sim.samples) {
        if (s.t < scene.t0! - 1e-9 || s.t > t + 1e-9) continue;
        const v = chartValue(spec, s);
        if (spec.log && v <= 0) continue;
        pts.push(`${x(s.t).toFixed(1)},${yv(v).toFixed(1)}`);
      }
      if (pts.length > 1) svg("polyline", { points: pts.join(" "), fill: "none", stroke: PANEL_HEX[k], "stroke-width": 3, "stroke-linejoin": "round" }, root);
    });
    svg("line", { x1: x(t), y1: m.t, x2: x(t), y2: ch - m.b, stroke: "#e6ece4", "stroke-dasharray": "4 4", "stroke-width": 1.5 }, root);
  }

  private drawLegend(scene: S.SceneSpec, pr: Prepared, umPerPx: number) {
    const L = this.legendEl;
    L.replaceChildren();
    const modes = [...new Set(scene.panels!.map((_, k) => modeOf(scene, k)))];
    for (const mode of modes) {
      const info = MODES.find((mm) => mm.id === mode)!;
      const box = el("div", "s-leg", L);
      el("div", "s-leg-title", box, info.label + (info.unit && info.kind === "sequential" ? ` (${info.unit})` : ""));
      if (mode === "tissue") {
        const grid = el("div", "s-swatches", box);
        TISSUE_NAMES.forEach((name, i) => {
          const sw = el("span", "s-sw", grid);
          el("i", "", sw).style.background = TISSUE_HEX[i];
          sw.append(name);
        });
      } else if (mode === "identity") {
        el("div", "s-muted", box, "Atlas cell clusters (Liew et al. germination atlas)");
        el("div", "s-bar", box).style.background = gradient(CLUSTER_HEX.slice(1));
      } else if (info.kind === "diverging") {
        el("div", "s-bar", box).style.background = gradient(DIV_HEX);
        const ends = el("div", "s-ends", box);
        el("span", "", ends, "depleted");
        el("span", "", ends, "NES 0");
        el("span", "", ends, "enriched");
      } else {
        el("div", "s-bar", box).style.background = gradient(SEQ_HEX);
        const r = pr.ranges.get(mode)!;
        const ends = el("div", "s-ends", box);
        el("span", "", ends, fmtNum(r.min));
        el("span", "", ends, fmtNum(r.max));
      }
    }
    // scale bar: same µm per pixel in every panel
    const target = umPerPx * 160;
    const nice = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000].find((v) => v >= target * 0.6) ?? 10000;
    const sb = el("div", "s-scale", L);
    const bar = el("div", "s-scalebar", sb);
    bar.style.width = `${(nice / umPerPx).toFixed(1)}px`;
    const same = scene.panels!.length > 1 ? " (same scale in every panel)" : "";
    el("span", "", sb, (nice >= 1000 ? `${nice / 1000} mm` : `${nice} µm`) + same);
  }
}

// ------------------------------------------------------------------ fields scene chart
function fieldsChart(): SVGSVGElement {
  const F = fieldsData as typeof fieldsData;
  const w = 1500;
  const h = 470;
  const m = { l: 330, r: 40, t: 30, b: 70 };
  const lo = -1; // log10 nT
  const hi = 6;
  const x = (nT: number) => m.l + ((Math.log10(nT) - lo) / (hi - lo)) * (w - m.l - m.r);
  const root = svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: "s-fields" });
  for (let e = lo; e <= hi; e++) {
    const xx = x(Math.pow(10, e));
    svg("line", { x1: xx, y1: m.t, x2: xx, y2: h - m.b, stroke: "#1d2622" }, root);
    const label = e < 3 ? `${Math.pow(10, e)} nT` : `${Math.pow(10, e - 3)} µT`;
    svg("text", { x: xx, y: h - m.b + 28, fill: "#8d9b88", "font-size": 18, "text-anchor": "middle" }, root).textContent = label;
  }
  svg("text", { x: (m.l + w - m.r) / 2, y: h - 10, fill: "#8d9b88", "font-size": 18, "text-anchor": "middle" }, root).textContent =
    "magnetic field strength (log scale)";
  const rows: { label: string; sub: string; draw: (y: number) => void }[] = [
    {
      label: "Earth's surface",
      sub: "NOAA NCEI",
      draw: (y) => {
        svg("rect", { x: x(F.earth_surface.min_nT), y: y - 14, width: x(F.earth_surface.max_nT) - x(F.earth_surface.min_nT), height: 28, rx: 6, fill: "#56b4e9" }, root);
      },
    },
    {
      label: "Moon, 30 km altitude",
      sub: "Hood et al., NASA PDS",
      draw: (y) => {
        const mo = F.moon_30km;
        svg("rect", { x: x(mo.median_nT), y: y - 6, width: x(mo.max_nT) - x(mo.median_nT), height: 12, rx: 4, fill: "#e69f00", opacity: 0.5 }, root);
        svg("circle", { cx: x(mo.median_nT), cy: y, r: 11, fill: "#e69f00" }, root);
        svg("text", { x: x(mo.median_nT), y: y - 20, fill: "#e6ece4", "font-size": 16, "text-anchor": "middle" }, root).textContent = "median";
        svg("text", { x: x(mo.max_nT), y: y - 20, fill: "#e6ece4", "font-size": 16, "text-anchor": "middle" }, root).textContent = "max";
      },
    },
    {
      label: "Lab fields tested",
      sub: "Dhiman, Wu & Galland",
      draw: (y) => {
        const d = F.dhiman2023;
        svg("rect", { x: m.l, y: y - 6, width: x(d.max_field_tested_uT * 1000) - m.l, height: 12, rx: 4, fill: "#cc79a7", opacity: 0.45 }, root);
        svg("text", { x: m.l + 6, y: y + 30, fill: "#cc79a7", "font-size": 15 }, root).textContent = "near-null …";
        svg("circle", { cx: x(d.germination_field_uT * 1000), cy: y, r: 10, fill: "#cc79a7" }, root);
        svg("text", { x: x(d.germination_field_uT * 1000), y: y - 18, fill: "#e6ece4", "font-size": 16, "text-anchor": "middle" }, root).textContent = "faster germination";
      },
    },
    ...F.gaps.map((g) => ({
      label: g.label,
      sub: "no verified measurement used",
      draw: (y: number) => {
        svg("rect", { x: m.l, y: y - 12, width: w - m.l - m.r, height: 24, rx: 6, fill: "none", stroke: "#3a463e", "stroke-dasharray": "6 6" }, root);
      },
    })),
  ];
  const rowH = (h - m.t - m.b) / rows.length;
  rows.forEach((r, i) => {
    const y = m.t + rowH * (i + 0.5);
    svg("text", { x: m.l - 16, y: y - 2, fill: "#e6ece4", "font-size": 21, "text-anchor": "end", "font-weight": 600 }, root).textContent = r.label;
    svg("text", { x: m.l - 16, y: y + 20, fill: "#8d9b88", "font-size": 15, "text-anchor": "end" }, root).textContent = r.sub;
    r.draw(y);
  });
  return root;
}
