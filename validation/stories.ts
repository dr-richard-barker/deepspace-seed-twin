// Gates for the Stories videos (stories/*.json → app/public/videos). Run in CI after the
// model gates (npm run gates). Exits non-zero on any failure.
//
// Schema       every storyboard is well formed; no digit appears in on-screen text except
//              inside a {template} (numbers must come from the model or a sourced file)
// Freshness    re-run every panel headless, re-resolve every template, and compare with the
//              numbers recorded when the video was rendered (results/videos/<id>_numbers.csv):
//              if the model changed, the videos must be re-rendered
// Honesty      the HYPOTHESIS banner logic flags any run with a hypothesis coupling on
// Files        every story has an MP4, poster and captions within the size budget
// Physics      the air-speed override reaches the Sherwood correlation (Sh = 2 in still air)
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import fieldsData from "../data/environments/_fields.json";
import { makeSim, type RunConfig } from "../app/src/ui/driver";
import { MODES } from "../app/src/view/paint";
import { PRESET_BY_ID } from "../app/src/model/presets";
import type { SeedTwin } from "../app/src/model/simulate";
import * as S from "../app/src/studio/story";

const MAX_MB = 20;
const TOTAL_MB = 100;
let failures = 0;
const results: string[] = [];
function gate(name: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  results.push(`  ${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
  console.log(results[results.length - 1]);
}

const stories: S.Story[] = readdirSync("stories")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`stories/${f}`, "utf8")));

// ---------------------------------------------------------------- schema
{
  const errs = stories.flatMap((st) => S.checkStory(st, new Set(PRESET_BY_ID.keys()), new Set(MODES.map((m) => m.id))));
  gate("storyboards are well formed, numbers only via templates", errs.length === 0, errs.length ? errs.join("; ") : `${stories.length} stories`);
}

// ---------------------------------------------------------------- freshness
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  const head = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""]));
  });
}

for (const st of stories) {
  const file = `results/videos/${st.id}_numbers.csv`;
  if (!existsSync(file)) {
    gate(`${st.id}: video numbers match the current model`, false, `${file} missing: render the video (npm run videos -- ${st.id})`);
    continue;
  }
  const recorded = parseCsv(readFileSync(file, "utf8"));
  const now: S.NumberRef[] = [];
  for (const scene of st.scenes) {
    const sims: SeedTwin[] = scene.kind === "sim" ? scene.panels!.map((p) => makeSim(p.run)) : [];
    const tNeed = S.neededTime(scene, S.sceneTexts(scene));
    for (const sim of sims) sim.runTo(tNeed);
    const ctx = (self?: number): S.ResolveContext => ({ sims, scene, self, fields: fieldsData });
    S.resolveText(scene.title, ctx(), "title", now);
    (scene.panels ?? []).forEach((p, k) => S.resolveText(p.label, ctx(k), `label ${S.PANEL_LETTERS[k]}`, now));
    (scene.captions ?? []).forEach((c, i) => S.resolveText(c.text, ctx(), `caption ${i + 1}`, now));
    (scene.lines ?? []).forEach((l, i) => S.resolveText(l, ctx(), `line ${i + 1}`, now));
  }
  const bad: string[] = [];
  if (recorded.length !== now.length) bad.push(`${recorded.length} recorded vs ${now.length} now`);
  now.forEach((n, i) => {
    const r = recorded[i];
    if (!r || r.scene !== n.scene || r.where !== n.where || r.ref !== n.ref) {
      bad.push(`#${i + 1} ${n.scene}/${n.where}/${n.ref} not recorded`);
      return;
    }
    const a = r.value === "" ? null : Number(r.value);
    const b = n.value;
    const same = a === null || b === null ? a === b : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
    if (!same || r.display !== n.display) bad.push(`${n.scene}/${n.where} ${n.ref}: video ${r.display} vs model ${n.display}`);
  });
  const nulls = now.filter((n) => n.value === null).map((n) => `${n.scene}/${n.ref}`);
  gate(`${st.id}: video numbers match the current model`, bad.length === 0, bad.length ? bad.slice(0, 6).join("; ") : `${now.length} numbers`);
  gate(`${st.id}: every on-screen number resolves`, nulls.length === 0, nulls.length ? `unresolved: ${nulls.join(", ")}` : "none missing");
}

// ---------------------------------------------------------------- honesty
{
  const base: RunConfig = { presetId: "ground_petri", atmosphereId: null, env: {}, params: {} };
  const ok = !S.isHypothesis(base) && S.isHypothesis({ ...base, params: { ros_to_aba: 1 } }) && S.isHypothesis({ ...base, params: { rad_decoder_weight: 0.5 } });
  const flagged = stories.flatMap((st) => st.scenes.flatMap((sc) => (sc.panels ?? []).filter((p) => S.isHypothesis(p.run)).map((p) => `${st.id}/${sc.id}: ${p.label}`)));
  gate("hypothesis banner flags every run with a coupling switched on", ok, `banner on: ${flagged.join("; ") || "none"}`);
}

// ---------------------------------------------------------------- files
{
  let total = 0;
  const bad: string[] = [];
  for (const st of stories) {
    for (const ext of ["mp4", "jpg", "vtt"]) {
      const f = `app/public/videos/${st.id}.${ext}`;
      if (!existsSync(f)) bad.push(`${f} missing`);
      else if (ext === "mp4") {
        const mb = statSync(f).size / 1e6;
        total += mb;
        if (mb > MAX_MB) bad.push(`${f} is ${mb.toFixed(1)} MB (> ${MAX_MB})`);
      }
    }
  }
  const manifest = existsSync("app/public/videos/manifest.json") ? (JSON.parse(readFileSync("app/public/videos/manifest.json", "utf8")) as { id: string }[]) : [];
  for (const st of stories) if (!manifest.some((m) => m.id === st.id)) bad.push(`${st.id} not in videos/manifest.json`);
  if (total > TOTAL_MB) bad.push(`videos total ${total.toFixed(1)} MB (> ${TOTAL_MB})`);
  gate("every story has an MP4, poster and captions within budget", bad.length === 0, bad.length ? bad.join("; ") : `${stories.length} videos, ${total.toFixed(1)} MB`);
}

// ---------------------------------------------------------------- physics
{
  const sh = [0, 0.01, 0.3].map((u) => {
    const s = makeSim({ presetId: "emcs", atmosphereId: null, env: { gravity_g: 0, air_speed_m_s: u }, params: {} });
    s.runTo(1);
    return s.samples[s.samples.length - 1].sherwood;
  });
  gate("air-speed override reaches the Sherwood correlation", Math.abs(sh[0] - 2) < 1e-12 && sh[1] > sh[0] && sh[2] > sh[1], `Sh = ${sh.map((v) => v.toFixed(3)).join(", ")} at 0, 0.01, 0.3 m/s`);
}

writeFileSync(
  "results/tables/story_gates_report.csv",
  "status,gate,detail\n" +
    results
      .map((r) => {
        const m = r.match(/^\s*(PASS|FAIL)\s+([^:]+): (.*)$/)!;
        return `${m[1]},"${m[2].replace(/"/g, "'")}","${m[3].replace(/"/g, "'")}"`;
      })
      .join("\n") +
    "\n",
);
console.log(failures === 0 ? "\nAll story gates passed.\n" : `\n${failures} story gate(s) FAILED.\n`);
if (failures > 0) process.exit(1);
