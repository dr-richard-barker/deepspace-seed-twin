// Storyboards for the Stories videos: types, schema checks, the frame timeline and the
// caption templates. Pure TypeScript (no DOM) so the Studio page, the recorder and the
// validation gates all resolve a story identically.
//
// Every number that appears on screen in a caption, title or panel label is a TEMPLATE
// resolved from the model (or from data/environments/_fields.json), never typed by hand:
//   {A.endosperm_rupture_h|1}        milestone of panel A, 1 decimal
//   {B.root_angle_deg@48-180|0}      sample field at t = 48 h, minus 180, 0 decimals
//   {C.eth_hs_ppb:max|1}             max of a sample field over the scene (≤ t1)
//   {D.root_len_um:end/1000|2}       value at the scene end, ÷ 1000
//   {env.gravity_g|3}                (panel labels) this panel's environment
//   {A.env.po2_kpa|1}                derived env value: O₂ partial pressure
//   {fields.moon_30km.median_nT|2}   sourced observation from _fields.json
import type { ColorMode } from "../view/paint";
import type { RunConfig } from "../ui/driver";
import type { Sample, SeedTwin } from "../model/simulate";

export type Layout = "1x1" | "1x2" | "2x2" | "1x3" | "1x4";
export const LAYOUTS: Record<Layout, [number, number]> = { "1x1": [1, 1], "1x2": [1, 2], "2x2": [2, 2], "1x3": [1, 3], "1x4": [1, 4] };
export const PANEL_LETTERS = ["A", "B", "C", "D"] as const;

export type ReadoutId =
  | "testa"
  | "endosperm"
  | "root"
  | "hypocotyl"
  | "root_turn"
  | "hook"
  | "o2_surface"
  | "o2_core"
  | "hypoxic"
  | "eth_hs"
  | "sherwood"
  | "dose"
  | "water";

export interface PanelSpec {
  label: string;
  run: RunConfig;
  colorMode?: ColorMode;
  readouts?: ReadoutId[];
}

export interface CaptionSpec {
  /** start at this simulated time (h); or */
  at_h?: number;
  /** start this many seconds into the scene */
  at_s?: number;
  dur_s: number;
  text: string;
}

export interface ChartSpec {
  field: keyof Sample;
  label: string;
  unit: string;
  /** multiply values before plotting (e.g. 0.001 for µm → mm) */
  scale?: number;
  offset?: number;
  log?: boolean;
}

export interface SceneSpec {
  id: string;
  kind: "sim" | "card" | "fields";
  title: string;
  layout?: Layout;
  panels?: PanelSpec[];
  t0?: number;
  t1?: number;
  /** simulated hours per video second */
  speed?: number;
  holdStart?: number;
  holdEnd?: number;
  colorMode?: ColorMode;
  decoderClass?: string;
  chart?: ChartSpec;
  camera?: { elev?: number; azim?: number; cut?: boolean };
  duration_s?: number;
  lines?: string[];
  captions?: CaptionSpec[];
  caveats?: string[];
}

export interface Story {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  fps?: number;
  /** which scene/panel the "Open in the twin" link reproduces */
  reproduce?: { scene: string; panel: number };
  /** video time (s) of the poster frame; default: the middle of the video */
  poster_s?: number;
  scenes: SceneSpec[];
}

export const END_CARD_S = 6;

// ------------------------------------------------------------------ timeline
export interface SceneTiming {
  scene: SceneSpec;
  index: number;
  startFrame: number;
  frames: number;
  startS: number;
  durationS: number;
}

export function sceneDuration(s: SceneSpec): number {
  if (s.kind === "sim") return (s.holdStart ?? 1) + (s.t1! - s.t0!) / s.speed! + (s.holdEnd ?? 2);
  return s.duration_s ?? 5;
}

export function endCard(story: Story): SceneSpec {
  return { id: "_end", kind: "card", title: story.title, duration_s: END_CARD_S, lines: [] };
}

export function timeline(story: Story): { fps: number; scenes: SceneTiming[]; frames: number; durationS: number } {
  const fps = story.fps ?? 30;
  const scenes: SceneTiming[] = [];
  let f = 0;
  let s = 0;
  [...story.scenes, endCard(story)].forEach((scene, index) => {
    const durationS = sceneDuration(scene);
    const frames = Math.round(durationS * fps);
    scenes.push({ scene, index, startFrame: f, frames, startS: s, durationS: frames / fps });
    f += frames;
    s += frames / fps;
  });
  return { fps, scenes, frames: f, durationS: f / fps };
}

export function locate(tl: ReturnType<typeof timeline>, frame: number): { timing: SceneTiming; localS: number } {
  const fi = Math.max(0, Math.min(tl.frames - 1, frame));
  for (const timing of tl.scenes) {
    if (fi < timing.startFrame + timing.frames) return { timing, localS: (fi - timing.startFrame) / tl.fps };
  }
  const last = tl.scenes[tl.scenes.length - 1];
  return { timing: last, localS: (last.frames - 1) / tl.fps };
}

/** Simulated time shown at `localS` seconds into a sim scene (holds at t0 and t1). */
export function simTimeAt(s: SceneSpec, localS: number): number {
  const t = s.t0! + (localS - (s.holdStart ?? 1)) * s.speed!;
  return Math.max(s.t0!, Math.min(s.t1!, t));
}

export function captionStart(s: SceneSpec, c: CaptionSpec): number {
  if (c.at_s !== undefined) return c.at_s;
  if (s.kind === "sim" && c.at_h !== undefined) return (s.holdStart ?? 1) + (c.at_h - s.t0!) / s.speed!;
  return 0;
}

export function activeCaptions(s: SceneSpec, localS: number): CaptionSpec[] {
  return (s.captions ?? []).filter((c) => {
    const a = captionStart(s, c);
    return localS >= a && localS < a + c.dur_s;
  });
}

// ------------------------------------------------------------------ templates
export interface NumberRef {
  scene: string;
  where: string;
  ref: string;
  value: number | null;
  display: string;
}

export interface ResolveContext {
  sims: SeedTwin[];
  scene: SceneSpec;
  /** panel index that a bare `env.x` / `x` in a label refers to */
  self?: number;
  fields?: unknown;
}

const TEMPLATE = /\{([^{}|]+)(?:\|(\d))?\}/g;

function sampleAt(sim: SeedTwin, t: number): Sample | null {
  let best: Sample | null = null;
  let bd = Infinity;
  for (const s of sim.samples) {
    const d = Math.abs(s.t - t);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best && bd <= 0.5 + 1e-9 ? best : null;
}

const MILESTONES: Record<string, keyof SeedTwin["milestones"]> = {
  testa_rupture_h: "testaRupture",
  endosperm_rupture_h: "endospermRupture",
  anchored_h: "anchored",
  cot_emerged_h: "cotEmerged",
  cot_open_h: "cotOpen",
};

function lookupPath(obj: unknown, path: string[]): number | null {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "number" ? cur : null;
}

/** Evaluate one template reference. Throws on a malformed reference (caught by the gates). */
export function evalRef(ref: string, ctx: ResolveContext): number | null {
  let body = ref.trim();
  // arithmetic suffix: /n, *n, -n, +n (applied left to right)
  const ops: [string, number][] = [];
  const opRe = /([/*+-])(\d+(?:\.\d+)?)$/;
  for (let m = body.match(opRe); m; m = body.match(opRe)) {
    ops.unshift([m[1], Number(m[2])]);
    body = body.slice(0, -m[0].length);
  }
  let v: number | null;
  if (body.startsWith("fields.")) {
    v = lookupPath(ctx.fields, body.slice(7).split("."));
    if (v === null) throw new Error(`unknown fields reference "${ref}"`);
  } else {
    let panel = ctx.self;
    const pm = body.match(/^([A-D])\.(.*)$/);
    if (pm) {
      panel = PANEL_LETTERS.indexOf(pm[1] as (typeof PANEL_LETTERS)[number]);
      body = pm[2];
    }
    if (panel === undefined || panel < 0 || panel >= ctx.sims.length) throw new Error(`reference "${ref}" names no panel of this scene`);
    const sim = ctx.sims[panel];
    if (body.startsWith("env.")) {
      const key = body.slice(4);
      if (key === "po2_kpa") v = sim.env.o2_frac * sim.env.p_total_kpa;
      else if (key === "air_speed_m_s") v = sim.env.airSpeed(sim.env.gravity_g);
      else if (key in sim.env && typeof (sim.env as unknown as Record<string, unknown>)[key] === "number") v = (sim.env as unknown as Record<string, number>)[key];
      else throw new Error(`unknown env key in "${ref}"`);
    } else if (body in MILESTONES) {
      v = sim.milestones[MILESTONES[body]];
    } else {
      const m = body.match(/^([a-z0-9_]+)(?:@(\d+(?:\.\d+)?)|:(max|min|end))?$/);
      if (!m) throw new Error(`malformed reference "${ref}"`);
      const field = m[1] as keyof Sample;
      if (!sim.samples.length || !(field in sim.samples[0])) throw new Error(`unknown sample field in "${ref}"`);
      const t1 = ctx.scene.t1 ?? sim.t;
      if (m[2] !== undefined) {
        const s = sampleAt(sim, Number(m[2]));
        v = s ? (s[field] as number) : null;
      } else {
        const within = sim.samples.filter((s) => s.t <= t1 + 1e-9);
        if (!within.length) v = null;
        else if (m[3] === "max") v = Math.max(...within.map((s) => s[field] as number));
        else if (m[3] === "min") v = Math.min(...within.map((s) => s[field] as number));
        else v = within[within.length - 1][field] as number;
      }
    }
  }
  if (v === null || !Number.isFinite(v)) return null;
  for (const [op, n] of ops) v = op === "/" ? v / n : op === "*" ? v * n : op === "-" ? v - n : v + n;
  return v;
}

/** Latest simulated time a template in this scene needs (so runs can stop there). */
export function neededTime(scene: SceneSpec, texts: string[]): number {
  let t = scene.t1 ?? 0;
  for (const text of texts) {
    for (const m of text.matchAll(TEMPLATE)) {
      const at = m[1].match(/@(\d+(?:\.\d+)?)/);
      if (at) t = Math.max(t, Number(at[1]));
    }
  }
  return t;
}

export function resolveText(text: string, ctx: ResolveContext, where: string, refs?: NumberRef[]): string {
  return text.replace(TEMPLATE, (_all, ref: string, digits?: string) => {
    const v = evalRef(ref, ctx);
    const d = digits === undefined ? 1 : Number(digits);
    const display = v === null ? "—" : v.toFixed(d).replace(/^-0(\.0+)?$/, "0$1");
    refs?.push({ scene: ctx.scene.id, where, ref: ref.trim(), value: v, display });
    return display;
  });
}

/** All texts of a scene that may hold templates (for checks and for neededTime). */
export function sceneTexts(scene: SceneSpec): string[] {
  return [scene.title, ...(scene.lines ?? []), ...(scene.captions ?? []).map((c) => c.text), ...(scene.panels ?? []).map((p) => p.label)];
}

// ------------------------------------------------------------------ hypothesis banner
export const HYPOTHESIS_PARAMS = ["ros_to_aba", "ros_to_acc", "ros_to_division_arrest", "rad_decoder_weight"];

/** A panel is a hypothesis if any coupling with no verified source is switched on. */
export function isHypothesis(run: RunConfig): boolean {
  return HYPOTHESIS_PARAMS.some((id) => (run.params[id] ?? 0) > 0);
}

// ------------------------------------------------------------------ schema checks
/** Allowed digit-bearing words outside templates (hardware and molecule names). */
export const DIGIT_ALLOWLIST = ["GBC1", "3D", "cry1cry2", "Chang'e-4"];

export function stripTemplates(text: string): string {
  return text.replace(TEMPLATE, "");
}

export function checkStory(story: Story, knownPresets: Set<string>, knownModes: Set<string>): string[] {
  const errs: string[] = [];
  const e = (m: string) => errs.push(`${story.id}: ${m}`);
  if (!/^[a-z_]+$/.test(story.id)) e("id must be lower_snake_case");
  for (const t of [story.title, story.subtitle, story.description]) {
    if (/\d/.test(t)) e(`story text contains a digit: "${t}"`);
  }
  const ids = new Set<string>();
  for (const s of story.scenes) {
    if (ids.has(s.id)) e(`duplicate scene id ${s.id}`);
    ids.add(s.id);
    for (const text of [...sceneTexts(s), ...(s.caveats ?? [])]) {
      let bare = stripTemplates(text);
      for (const w of DIGIT_ALLOWLIST) bare = bare.split(w).join("");
      if (/\d/.test(bare)) e(`scene ${s.id}: digit outside a template in "${text}"`);
    }
    for (const c of s.captions ?? []) {
      if ((c.at_h === undefined) === (c.at_s === undefined)) e(`scene ${s.id}: caption needs exactly one of at_h / at_s`);
      if (!(c.dur_s > 0)) e(`scene ${s.id}: caption dur_s must be > 0`);
      if (captionStart(s, c) + c.dur_s > sceneDuration(s) + 1e-6) e(`scene ${s.id}: caption "${c.text.slice(0, 30)}…" ends after the scene`);
    }
    const spans = (s.captions ?? []).map((c) => [captionStart(s, c), captionStart(s, c) + c.dur_s]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1] - 1e-6) e(`scene ${s.id}: captions ${i} and ${i + 1} overlap`);
    if (s.kind === "sim") {
      if (!s.layout || !(s.layout in LAYOUTS)) e(`scene ${s.id}: bad layout`);
      const n = s.panels?.length ?? 0;
      if (n < 1) e(`scene ${s.id}: no panels`);
      else if (s.layout && n > LAYOUTS[s.layout][0] * LAYOUTS[s.layout][1]) e(`scene ${s.id}: ${n} panels do not fit ${s.layout}`);
      if (!(s.t0! >= 0 && s.t1! > s.t0! && s.t1! <= 120)) e(`scene ${s.id}: need 0 <= t0 < t1 <= 120`);
      if (!(s.speed! > 0)) e(`scene ${s.id}: speed must be > 0`);
      for (const p of s.panels ?? []) {
        if (!knownPresets.has(p.run.presetId)) e(`scene ${s.id}: unknown preset ${p.run.presetId}`);
        const mode = p.colorMode ?? s.colorMode ?? "tissue";
        if (!knownModes.has(mode)) e(`scene ${s.id}: unknown colour mode ${mode}`);
      }
      for (const c of s.captions ?? []) {
        if (c.at_h !== undefined && (c.at_h < s.t0! || c.at_h > s.t1!)) e(`scene ${s.id}: caption at_h outside t0..t1`);
      }
    }
  }
  return errs;
}
