import { useEffect, useMemo, useRef, useState } from "react";
import { ENV_KEYS, type EnvKey, type EnvField } from "./model/environment";
import { Region, TISSUE_NAMES, REGION_NAMES } from "./model/geometry";
import { clusterOf, DECODER, nesFor, OVERLAY_CLASSES } from "./model/identity";
import { LEDGER, LEDGER_BY_ID, REFERENCES, type Tier } from "./model/params";
import { ATMOSPHERES, PRESETS, PRESET_BY_ID, RADIATION } from "./model/presets";
import { PROFILE_TIMES, type SeedTwin, type Sample } from "./model/simulate";
import { Chart, type Series } from "./ui/Chart";
import { decodeState, defaultConfig, Driver, encodeState, T_MAX, type RunConfig } from "./ui/driver";
import type { PopulationResult } from "./model/population";
import { DIV_HEX, SEQ_HEX } from "./view/colors";
import { CLUSTER_HEX, MODES, paint, type ColorMode } from "./view/paint";
import { createSeedViewer, type SeedView, type SeedViewer } from "./view/viewer";

const REPO = "https://github.com/dr-richard-barker/deepspace-seed-twin";
const DECODER_SITE = "https://dr-richard-barker.github.io/deepspace-seed-stress-decoder/";

type Tab = "environment" | "cell" | "charts" | "sources" | "about";

const ENV_UI: { key: EnvKey; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: "gravity_g", label: "Gravity", min: 0, max: 2, step: 0.01, unit: "g" },
  { key: "p_total_kpa", label: "Total pressure", min: 20, max: 110, step: 0.1, unit: "kPa" },
  { key: "o2_frac", label: "O₂ fraction", min: 0.01, max: 0.9, step: 0.005, unit: "" },
  { key: "co2_ppm", label: "CO₂", min: 0, max: 6000, step: 10, unit: "ppm" },
  { key: "temp_c", label: "Temperature", min: 10, max: 32, step: 0.5, unit: "°C" },
  { key: "light_umol", label: "Light", min: 0, max: 600, step: 5, unit: "µmol m⁻² s⁻¹" },
  { key: "light_h_per_cycle", label: "Light per cycle", min: 0, max: 24, step: 0.5, unit: "h" },
  { key: "cycle_h", label: "Cycle length", min: 1, max: 24, step: 0.5, unit: "h" },
  { key: "headspace_ml", label: "Headspace", min: 1, max: 1000, step: 1, unit: "mL" },
  { key: "seeds", label: "Seeds sharing it", min: 1, max: 500, step: 1, unit: "" },
  { key: "vent_ach", label: "Ventilation", min: 0, max: 400, step: 0.05, unit: "air changes/h" },
  { key: "eth_scrub_per_h", label: "Ethylene scrubbing", min: 0, max: 20, step: 0.05, unit: "1/h" },
  { key: "eth_inlet_ppm", label: "Ethylene in exchange air", min: 0, max: 20, step: 0.05, unit: "ppm" },
  { key: "substrate_psi_mpa", label: "Substrate water potential", min: -2, max: 0, step: 0.01, unit: "MPa" },
  { key: "dose_mgy_d", label: "Radiation dose rate", min: 0, max: 5, step: 0.01, unit: "mGy/d" },
  { key: "spe_dose_mgy", label: "Solar particle event dose", min: 0, max: 500, step: 1, unit: "mGy" },
  { key: "spe_start_h", label: "SPE start", min: 0, max: 120, step: 1, unit: "h" },
];

const HYPOTHESES = ["ros_to_aba", "ros_to_acc", "ros_to_division_arrest", "rad_decoder_weight"];

const OBSERVED = {
  // Bassel et al. 2014 (single-embryo timeline) and Dekkers et al. 2013 (population, 22 °C)
  bassel: { onset: [16, 22], rupture: [28, 32] },
  dekkers: { testa: [20, 31], endosperm: [31, 45] },
};

function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return { fg: g("--seed-fg", "#e6ece4"), muted: g("--seed-muted", "#8d9b88"), line: g("--seed-line", "#27322b") };
}

function TierChip({ tier }: { tier: Tier | "override" }) {
  return <span className={`tier tier-${tier}`}>{tier}</span>;
}

function initialState() {
  const s = decodeState(location.hash);
  return {
    primary: s?.primary ?? defaultConfig("ground_petri"),
    compare: s?.compare ?? null,
    mode: (s?.mode as ColorMode) ?? "tissue",
    decoderClass: s?.decoderClass ?? "low_oxygen",
    t: s?.t ?? 0,
  };
}

export default function App() {
  const init = useMemo(initialState, []);
  const [primary, setPrimary] = useState<RunConfig>(init.primary);
  const [compare, setCompare] = useState<RunConfig | null>(init.compare);
  const [mode, setMode] = useState<ColorMode>(init.mode);
  const [decoderClass, setDecoderClass] = useState<string>(init.decoderClass);
  const [tab, setTab] = useState<Tab>("environment");
  const [cut, setCut] = useState(true);
  const [picked, setPicked] = useState<{ seed: number; cell: number } | null>(null);
  const [, setTick] = useState(0);
  const [range, setRange] = useState({ min: 0, max: 0 });
  const [tokens, setTokens] = useState(readTokens);

  const driverRef = useRef<Driver | null>(null);
  if (!driverRef.current) driverRef.current = new Driver(compare ? [primary, compare] : [primary], init.t);
  const driver = driverRef.current;
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SeedViewer | null>(null);
  const colorBufs = useRef<Float32Array[]>([]);
  const modeRef = useRef(mode);
  const clsRef = useRef(decoderClass);
  modeRef.current = mode;
  clsRef.current = decoderClass;

  // rebuild runs when configurations change
  useEffect(() => {
    driver.setConfigs(compare ? [primary, compare] : [primary]);
    driver.seek(driver.target);
  }, [primary, compare, driver]);

  // URL state
  useEffect(() => {
    const id = setTimeout(() => {
      history.replaceState(null, "", "#" + encodeState({ primary, compare, mode, decoderClass, t: +driver.target.toFixed(2) }));
    }, 300);
    return () => clearTimeout(id);
  });

  // theme changes → chart colours
  useEffect(() => {
    const mo = new MutationObserver(() => setTokens(readTokens()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  // viewer + animation loop
  useEffect(() => {
    const cap = driver.sims[0].cells.capacity;
    const viewer = createSeedViewer(host.current!, cap, (seed, cell) => {
      setPicked(cell === null ? null : { seed, cell });
      if (cell !== null) setTab("cell");
    });
    viewerRef.current = viewer;
    let last = performance.now();
    let lastUi = 0;
    let raf = 0;
    let framedOnce = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      driver.frame(dt);
      const views: SeedView[] = [];
      let offset = 0;
      driver.sims.forEach((sim, k) => {
        if (!colorBufs.current[k] || colorBufs.current[k].length < sim.cells.capacity * 3) colorBufs.current[k] = new Float32Array(sim.cells.capacity * 3);
        sim.updateLayout();
        const r = paint(sim, modeRef.current, clsRef.current, colorBufs.current[k]);
        if (k === 0) setRangeThrottled(r);
        const tr = sim.milestones.testaRupture;
        const lin = Math.cbrt(Math.min(sim.pose.swell, 1.25));
        const shed = sim.milestones.cotEmerged !== null;
        const shell = {
          a: sim.template.seed.a * lin,
          b: sim.template.seed.b * lin,
          testaVisible: !shed,
          testaSplit: tr === null ? 0 : Math.min(1, (sim.t - tr) / 4),
          mucilage: sim.template.seed.mucilage * sim.hydration,
        };
        if (k === 1) {
          const b0 = views[0].layout.bbox;
          const b1 = sim.layout.bbox;
          offset = Math.max(b0[3], views[0].shell.a) - Math.min(b1[0], -shell.a) + 250;
        }
        views.push({ layout: sim.layout, colors: colorBufs.current[k], shell, offsetX: k === 0 ? 0 : offset });
      });
      viewer.update(views);
      viewer.setGravityArrow(driver.sims[0].env.gravity_g);
      viewer.frame(views, !framedOnce);
      framedOnce = true;
      if (now - lastUi > 120) {
        lastUi = now;
        setTick((x) => x + 1);
      }
    };
    let pending: { min: number; max: number } | null = null;
    function setRangeThrottled(r: { min: number; max: number }) {
      pending = r;
    }
    const rangeTimer = setInterval(() => pending && setRange(pending), 250);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(rangeTimer);
      viewer.dispose();
    };
  }, [driver]);

  useEffect(() => viewerRef.current?.setCut(cut), [cut]);

  const sims = driver.sims;
  const sim = sims[0];
  const preset = PRESET_BY_ID.get(primary.presetId)!;

  const setEnv = (key: EnvKey, v: number | undefined) => {
    const env = { ...primary.env };
    if (v === undefined) delete env[key];
    else env[key] = v;
    setPrimary({ ...primary, env });
  };
  const setParam = (id: string, v: number | undefined) => {
    const params = { ...primary.params };
    if (v === undefined) delete params[id];
    else params[id] = v;
    setPrimary({ ...primary, params });
  };

  const exportCsv = () => {
    const rows = sims.flatMap((s, k) => s.samples.map((r) => ({ run: k === 0 ? "A" : "B", preset: s.env.presetId, ...r })));
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => (r as Record<string, unknown>)[c]).join(","))].join("\n");
    download(new Blob([csv], { type: "text/csv" }), `seed-twin-${primary.presetId}.csv`);
  };
  const exportJson = () => {
    const body = {
      generated: new Date().toISOString(),
      runs: sims.map((s, k) => ({
        run: k === 0 ? "A" : "B",
        config: k === 0 ? primary : compare,
        environment: Object.fromEntries(ENV_KEYS.map((key) => [key, s.env[key]])),
        milestones: s.milestones,
      })),
      parameters: LEDGER.map((e) => ({ ...e, value: sim.params[e.id], default: e.value })),
    };
    download(new Blob([JSON.stringify(body, null, 1)], { type: "application/json" }), `seed-twin-${primary.presetId}.json`);
  };

  const modeInfo = MODES.find((m) => m.id === mode)!;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Deep Space Seed Twin</h1>
          <p>
            A 3D cellular model of an <i>Arabidopsis</i> seed from imbibition to a 5-day seedling, under spaceflight hardware environments.
            Companion to the <a href={DECODER_SITE}>DeepSpace Seed Stress Decoder</a>.
          </p>
        </div>
        <nav>
          <a href={REPO}>Code &amp; data</a>
          <button onClick={() => setTab("about")}>How it works</button>
        </nav>
      </header>
      <div className="app-body">
        <main className="stage">
          <div className="viewer" ref={host} />
          <div className="overlay top-left">
            <div className="clock">{driver.t.toFixed(1)} h</div>
            <div className="runs">
              {sims.map((s, k) => (
                <div key={k} className="run-tag">
                  <b>{k === 0 ? "A" : "B"}</b> {PRESET_BY_ID.get(s.env.presetId)?.label}
                  <Milestones sim={s} />
                </div>
              ))}
            </div>
            {driver.behind && !driver.playing && <div className="computing">computing…</div>}
          </div>
          <div className="overlay top-right">
            <label>
              Colour
              <select value={mode} onChange={(e) => setMode(e.target.value as ColorMode)}>
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            {mode === "decoder" && (
              <label>
                Stressor
                <select value={decoderClass} onChange={(e) => setDecoderClass(e.target.value)}>
                  {OVERLAY_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="check">
              <input type="checkbox" checked={cut} onChange={(e) => setCut(e.target.checked)} /> cut-away
            </label>
            <Legend mode={mode} unit={modeInfo.unit} kind={modeInfo.kind} range={range} />
          </div>
          <div className="timeline">
            <button className="play" onClick={() => driver.togglePlay()} aria-label={driver.playing ? "Pause" : "Play"}>
              {driver.playing ? "❚❚" : "▶"}
            </button>
            <div className="scrub">
              <input
                type="range"
                min={0}
                max={T_MAX}
                step={0.25}
                value={driver.target}
                onChange={(e) => driver.seek(Number(e.target.value))}
                aria-label="Time after imbibition"
              />
              <div className="ticks">
                {sim &&
                  (Object.entries(sim.milestones) as [string, number | null][])
                    .filter(([, v]) => v !== null)
                    .map(([k, v]) => (
                      <span key={k} style={{ left: `${((v as number) / T_MAX) * 100}%` }} title={`${k} ${(v as number).toFixed(1)} h`} />
                    ))}
              </div>
            </div>
            <label className="speed">
              speed
              <select value={driver.speed} onChange={(e) => (driver.speed = Number(e.target.value))}>
                {[1, 2, 4, 8, 16].map((s) => (
                  <option key={s} value={s}>
                    {s} h/s
                  </option>
                ))}
              </select>
            </label>
          </div>
        </main>
        <aside className="sidebar">
          <div className="tabs" role="tablist">
            {(["environment", "cell", "charts", "sources", "about"] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="panel">
            {tab === "environment" && (
              <EnvironmentPanel
                primary={primary}
                compare={compare}
                sim={sim}
                presetFields={preset.fields}
                setPrimary={setPrimary}
                setCompare={setCompare}
                setEnv={setEnv}
                setParam={setParam}
                exportCsv={exportCsv}
                exportJson={exportJson}
                snapshot={() => {
                  const url = viewerRef.current?.snapshot();
                  if (url) {
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `seed-twin-${primary.presetId}-${driver.t.toFixed(0)}h.png`;
                    a.click();
                  }
                }}
              />
            )}
            {tab === "cell" && <CellPanel sim={sims[picked?.seed ?? 0] ?? sim} cell={picked?.cell ?? null} />}
            {tab === "charts" && <ChartsPanel sims={sims} now={driver.t} tokens={tokens} configs={compare ? [primary, compare] : [primary]} />}
            {tab === "sources" && <SourcesPanel />}
            {tab === "about" && <AboutPanel />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function Milestones({ sim }: { sim: SeedTwin }) {
  const m = sim.milestones;
  const chip = (label: string, v: number | null) =>
    v === null ? null : (
      <span className="chip" key={label}>
        {label} {v.toFixed(1)} h
      </span>
    );
  return (
    <div className="chips">
      {chip("testa rupture", m.testaRupture)}
      {chip("endosperm rupture", m.endospermRupture)}
      {chip("cotyledons out", m.cotEmerged)}
      {chip("cotyledons open", m.cotOpen)}
    </div>
  );
}

function Legend({ mode, unit, kind, range }: { mode: ColorMode; unit: string; kind: string; range: { min: number; max: number } }) {
  if (mode === "tissue")
    return (
      <div className="legend-box">
        {TISSUE_NAMES.map((n, i) => (
          <span key={n}>
            <i style={{ background: ["#7fc97f", "#e6c86e", "#c08552", "#5b8cc9", "#d98cb3", "#4caf50", "#9bd49b", "#e8dcc0"][i] }} />
            {n}
          </span>
        ))}
      </div>
    );
  if (mode === "identity")
    return (
      <div className="legend-box">
        {Object.entries(DECODER.clusters)
          .filter(([, v]) => v.cell_type !== "unassigned")
          .map(([k, v]) => (
            <span key={k}>
              <i style={{ background: CLUSTER_HEX[Number(k)] }} />
              {k}: {v.cell_type}
            </span>
          ))}
      </div>
    );
  const stops = kind === "diverging" ? DIV_HEX : SEQ_HEX;
  return (
    <div className="legend-box">
      <div className="bar" style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }} />
      <div className="bar-labels">
        <span>{range.min.toPrecision(2)}</span>
        <span>{unit}</span>
        <span>{range.max.toPrecision(2)}</span>
      </div>
      {mode === "decoder" && <p className="note">Observed NES from the decoder (Liew et al. 2024 clusters). Grey: no atlas cluster.</p>}
    </div>
  );
}

function EnvironmentPanel(props: {
  primary: RunConfig;
  compare: RunConfig | null;
  sim: SeedTwin;
  presetFields: Record<string, EnvField>;
  setPrimary: (c: RunConfig) => void;
  setCompare: (c: RunConfig | null) => void;
  setEnv: (k: EnvKey, v: number | undefined) => void;
  setParam: (id: string, v: number | undefined) => void;
  exportCsv: () => void;
  exportJson: () => void;
  snapshot: () => void;
}) {
  const { primary, compare, sim } = props;
  const preset = PRESET_BY_ID.get(primary.presetId)!;
  const tr = sim.lastTransport;
  return (
    <div className="env">
      <label className="row">
        <span>Hardware</span>
        <select value={primary.presetId} onChange={(e) => props.setPrimary({ ...primary, presetId: e.target.value, env: {} })}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <p className="desc">{preset.description}</p>
      <label className="row">
        <span>Atmosphere</span>
        <select value={primary.atmosphereId ?? ""} onChange={(e) => props.setPrimary({ ...primary, atmosphereId: e.target.value || null })}>
          <option value="">hardware default</option>
          {ATMOSPHERES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label className="row">
        <span>Radiation</span>
        <select value={primary.radiationId ?? ""} onChange={(e) => props.setPrimary({ ...primary, radiationId: e.target.value || null })}>
          <option value="">hardware default</option>
          {RADIATION.map((r) => (
            <option key={r.id} value={r.id} title={r.note}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <div className="readout">
        pO₂ {((sim.env.o2_frac * sim.env.p_total_kpa) as number).toFixed(1)} kPa · Sh {tr ? tr.sh.toFixed(2) : "2.00"} · water film{" "}
        {tr ? tr.filmUm.toFixed(0) : "–"} µm, wetted {tr ? (tr.wetted * 100).toFixed(0) : "–"} %
      </div>
      <h3>Boundary conditions</h3>
      {ENV_UI.map((u) => {
        const field = props.presetFields[u.key];
        const over = primary.env[u.key];
        const atmOver =
          (primary.atmosphereId && (u.key === "p_total_kpa" || u.key === "o2_frac")) ||
          (primary.radiationId && (u.key === "dose_mgy_d" || u.key === "spe_dose_mgy" || u.key === "spe_start_h"));
        const value = sim.env[u.key];
        return (
          <div className="field" key={u.key}>
            <div className="field-head">
              <span title={field?.note || ""}>{u.label}</span>
              <span className="val">
                {u.key === "o2_frac" ? `${(value * 100).toFixed(1)} %` : `${+value.toPrecision(4)} ${u.unit}`}
              </span>
              {over !== undefined ? (
                <button className="reset" onClick={() => props.setEnv(u.key, undefined)} title="Back to the hardware value">
                  reset
                </button>
              ) : (
                <span title={`${field?.source || "no source"}${field?.note ? " — " + field.note : ""}`}>
                  <TierChip tier={atmOver ? "derived" : (field?.tier ?? "assumed")} />
                </span>
              )}
            </div>
            <input type="range" min={u.min} max={u.max} step={u.step} value={value} onChange={(e) => props.setEnv(u.key, Number(e.target.value))} />
          </div>
        );
      })}
      <h3>Hypothesis couplings</h3>
      <p className="desc">
        No verified source links radiation damage to these responses, so each defaults to 0. Raising one shows what the model would do <em>if</em> the
        link exists — the output is a hypothesis, not a result.
      </p>
      {HYPOTHESES.map((id) => {
        const e = LEDGER_BY_ID.get(id)!;
        return (
          <div className="field" key={id}>
            <div className="field-head">
              <span title={e.note}>{e.description}</span>
              <span className="val">{(primary.params[id] ?? e.value).toFixed(2)}</span>
              {primary.params[id] !== undefined && (
                <button className="reset" onClick={() => props.setParam(id, undefined)}>
                  reset
                </button>
              )}
            </div>
            <input type="range" min={0} max={id === "rad_decoder_weight" ? 2 : 5} step={0.05} value={primary.params[id] ?? e.value} onChange={(ev) => props.setParam(id, Number(ev.target.value))} />
          </div>
        );
      })}
      <h3>Compare</h3>
      <label className="row">
        <span>Run B</span>
        <select
          value={compare?.presetId ?? ""}
          onChange={(e) => props.setCompare(e.target.value ? { ...(compare ?? defaultConfig(e.target.value)), presetId: e.target.value, env: {} } : null)}
        >
          <option value="">— none —</option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {compare && (
        <label className="row">
          <span>B atmosphere</span>
          <select value={compare.atmosphereId ?? ""} onChange={(e) => props.setCompare({ ...compare, atmosphereId: e.target.value || null })}>
            <option value="">hardware default</option>
            {ATMOSPHERES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <h3>Export</h3>
      <div className="buttons">
        <button onClick={props.exportCsv}>Time series (CSV)</button>
        <button onClick={props.exportJson}>Run + parameters (JSON)</button>
        <button onClick={props.snapshot}>Snapshot (PNG)</button>
      </div>
      <p className="desc">The address bar holds the full configuration — copy it to share this exact run.</p>
    </div>
  );
}

function CellPanel({ sim, cell }: { sim: SeedTwin; cell: number | null }) {
  if (cell === null || cell >= sim.cells.n) return <p className="desc">Click a cell in the 3D view to inspect it.</p>;
  const c = sim.cells;
  const sid = c.slice[cell];
  const s = sid >= 0 ? sim.template.slices[sid] : null;
  const cl = clusterOf(sim.template, cell, sim.t);
  const vol = c.len[cell] * c.wid[cell] * c.dep[cell];
  const rows: [string, string][] = [
    ["Tissue", TISSUE_NAMES[c.tissue[cell]]],
    ["Region", REGION_NAMES[c.region[cell]]],
    ["Index from QC", s && s.qcIndex >= 1 ? `${s.qcIndex}${s.embryo ? "" : " (new root cell)"}` : "–"],
    ["Atlas cluster", cl ? `${cl}: ${DECODER.clusters[cl]?.cell_type}` : "none (no germinating endosperm in the atlas)"],
    ["Volume", `${vol.toFixed(0)} µm³ (×${(vol / c.vol0[cell]).toFixed(2)} vs dry template)`],
    ["Length × width × depth", `${c.len[cell].toFixed(1)} × ${c.wid[cell].toFixed(1)} × ${c.dep[cell].toFixed(1)} µm`],
    ["Growth rate", `${sim.growthRate[cell].toFixed(3)} h⁻¹`],
    ["O₂", `${(sim.o2[cell] / 1000).toFixed(2)} kPa`],
    ["Energy supply", sim.energy[cell].toFixed(2)],
    ["ABA / GA / Integrator", `${sim.h.aba[cell].toFixed(3)} / ${sim.h.ga[cell].toFixed(3)} / ${sim.h.integ[cell].toFixed(3)}`],
    ["ACC / ACO flux", `${sim.h.acc[cell].toFixed(3)} / ${sim.h.aco[cell].toFixed(4)}`],
    ["Radiation damage", sim.ros[cell].toExponential(2)],
    ["Outside the seed", sim.exposed[cell] ? "yes" : "no"],
  ];
  return (
    <div>
      <table className="kv">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {cl && (
        <>
          <h3>Observed susceptibility of this cell type (decoder NES)</h3>
          <table className="kv">
            <tbody>
              {OVERLAY_CLASSES.map((k) => {
                const v = nesFor(k, cl);
                return (
                  <tr key={k}>
                    <th>{k.replace(/_/g, " ")}</th>
                    <td>{v === null ? "–" : v.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="desc">
            Hormone values are normalised model units. NES values are observed data from the decoder ({DECODER.source.replace("repo:", "")}).
          </p>
        </>
      )}
      {c.region[cell] === Region.Endosperm && <p className="desc">Endosperm cells do not grow; the micropylar cap weakens until the radicle breaks through.</p>}
    </div>
  );
}

const PALETTE = ["#7fd4a0", "#e0a458", "#6aa9e9", "#d48ad0", "#e66b6b", "#c9c46a"];

function PopulationChart({ configs, tokens }: { configs: RunConfig[]; tokens: { fg: string; muted: string; line: string } }) {
  const [res, setRes] = useState<(PopulationResult | null)[]>([]);
  const [prog, setProg] = useState<number[]>([]);
  const N = 40;
  const key = JSON.stringify(configs);
  useEffect(() => {
    setRes([]);
    setProg([]);
  }, [key]);
  const run = () => {
    setRes(configs.map(() => null));
    setProg(configs.map(() => 0));
    configs.forEach((cfg, k) => {
      const w = new Worker(new URL("./ui/population.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (ev) => {
        if (ev.data.type === "progress") setProg((p) => p.map((v, j) => (j === k ? ev.data.i + 1 : v)));
        else {
          setRes((r) => r.map((v, j) => (j === k ? ev.data.res : v)));
          w.terminate();
        }
      };
      w.postMessage({ cfg, n: N });
    });
  };
  const series: Series[] = res.flatMap((r, k) => {
    if (!r) return [];
    const ok = r.times.filter((x): x is number => x !== null).sort((a, b) => a - b);
    const x = [0, ...ok.flatMap((t) => [t, t]), 96];
    const y = [0, ...ok.flatMap((_, i) => [(i / r.times.length) * 100, ((i + 1) / r.times.length) * 100]), (ok.length / r.times.length) * 100];
    return [{ label: `${k === 0 ? "A" : "B"}: t50 ${r.t50?.toFixed(1) ?? "–"} h, u84–16 ${r.u8416?.toFixed(1) ?? "–"} h`, color: PALETTE[k === 0 ? 0 : 1], dashed: k === 1, x, y }];
  });
  return (
    <div>
      <Chart
        title={`Germination curve (endosperm rupture), ${N} seeds`}
        yLabel="% germinated"
        yMin={0}
        yMax={100}
        xMax={96}
        series={series}
        bands={[{ x0: 31, x1: 45, label: "Dekkers 2013: 31–45 h", color: PALETTE[3] }]}
        {...tokens}
      />
      <button onClick={run} disabled={prog.length > 0 && res.some((r) => r === null)}>
        {prog.length && res.some((r) => r === null) ? `running… ${prog.join(" / ")} of ${N}` : "Run seed population"}
      </button>
      <p className="desc">
        Seeds differ only in base water potential, drawn from the measured hydrotime spread (σψb = 0.222 MPa, Footitt et al. 2019). The spread of
        rupture times is therefore a prediction, not a fit.
      </p>
    </div>
  );
}

function ChartsPanel({ sims, now, tokens, configs }: { sims: SeedTwin[]; now: number; tokens: { fg: string; muted: string; line: string }; configs: RunConfig[] }) {
  const series = (key: keyof Sample, label: string, color: string, scale = 1): Series[] =>
    sims.map((s, k) => ({
      label: sims.length > 1 ? `${label} (${k === 0 ? "A" : "B"})` : label,
      color,
      dashed: k === 1,
      x: s.samples.map((r) => r.t),
      y: s.samples.map((r) => (r[key] as number) * scale),
    }));
  const base = { xMax: T_MAX, now, ...tokens };
  const sim = sims[0];
  const ref3 = sim.profiles.get(3);
  const profSeries: Series[] = [];
  if (ref3) {
    PROFILE_TIMES.filter((t) => t > 3).forEach((t, k) => {
      const prof = sim.profiles.get(t);
      if (!prof) return;
      profSeries.push({
        label: `${t} h`,
        color: SEQ_HEX[Math.min(SEQ_HEX.length - 1, k)],
        x: prof.map((p) => p.index),
        y: prof.map((p, i) => p.volume / (ref3[i]?.volume || p.volume)),
      });
    });
  }
  return (
    <div className="charts">
      <Chart title="Water uptake and turgor" yLabel="g/g · MPa" series={[...series("water_gg", "water (g/g dry)", PALETTE[2]), ...series("turgor_mpa", "turgor (MPa)", PALETTE[0])]} {...base} />
      <Chart
        title="Seed-coat restraint vs endosperm cap strength"
        yLabel="MPa"
        series={[...series("restraint_mpa", "restraint", PALETTE[1]), ...series("cap_strength_mpa", "cap strength", PALETTE[3])]}
        bands={[
          { x0: OBSERVED.bassel.rupture[0], x1: OBSERVED.bassel.rupture[1], label: "Bassel 2014 rupture", color: PALETTE[3] },
        ]}
        {...base}
      />
      <Chart
        title="Oxygen"
        yLabel="kPa"
        yMin={0}
        series={[...series("o2_hs_kpa", "headspace", PALETTE[2]), ...series("o2_surface_kpa", "embryo surface", PALETTE[0]), ...series("o2_tip_kpa", "radicle-tip cortex", PALETTE[4])]}
        {...base}
      />
      <Chart title="Hypoxic embryo cells (pO₂ < 1 kPa)" yLabel="% of cells" yMin={0} yMax={100} series={series("hypoxic_frac", "hypoxic", PALETTE[4], 100)} {...base} />
      <Chart title="Ethylene" yLabel="ppb (mole fraction)" yMin={0} series={[...series("eth_hs_ppb", "headspace", PALETTE[5]), ...series("eth_int_ppb", "inside the seed", PALETTE[1])]} {...base} />
      <Chart
        title="Hormones: radicle tip vs collet (Abley 2021 core)"
        yLabel="model units"
        series={[...series("aba_tip", "ABA tip", PALETTE[4]), ...series("aba_collet", "ABA collet", "#a54646"), ...series("ga_tip", "GA tip", PALETTE[0]), ...series("ga_collet", "GA collet", "#3e8a5f"), ...series("integ_tip", "Integrator tip", PALETTE[3]), ...series("integ_collet", "Integrator collet", "#8a4f88")]}
        {...base}
      />
      <Chart title="Organ lengths" yLabel="µm" yMin={0} series={[...series("root_len_um", "root", PALETTE[1]), ...series("hyp_len_um", "hypocotyl", PALETTE[0])]} {...base} />
      <Chart
        title="Embryo cell expansion by position (cortex, vs 3 h)"
        yLabel="V / V(3 h)"
        xLabel="cortical cell index from the QC"
        xMin={1}
        xMax={sim.template.order.filter((id) => sim.template.slices[id].embryo && sim.template.slices[id].qcIndex >= 1).length}
        series={profSeries}
        bands={[{ x0: 7.5, x1: 8.5, label: "Bassel 2014: peak ≈ cell 8", color: PALETTE[3] }]}
        fg={tokens.fg}
        muted={tokens.muted}
        line={tokens.line}
      />
      <PopulationChart configs={configs} tokens={tokens} />
      <table className="kv observed">
        <thead>
          <tr>
            <th>Milestone</th>
            {sims.map((_, k) => (
              <th key={k}>{k === 0 ? "A" : "B"}</th>
            ))}
            <th>Observed (Col-0)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Testa rupture</th>
            {sims.map((s, k) => (
              <td key={k}>{s.milestones.testaRupture?.toFixed(1) ?? "–"} h</td>
            ))}
            <td>20–31 h (Dekkers 2013, population)</td>
          </tr>
          <tr>
            <th>Endosperm rupture</th>
            {sims.map((s, k) => (
              <td key={k}>{s.milestones.endospermRupture?.toFixed(1) ?? "–"} h</td>
            ))}
            <td>28–32 h (Bassel 2014); 31–45 h (Dekkers 2013)</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SourcesPanel() {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<string>("");
  const rows = LEDGER.filter((e) => (!tier || e.tier === tier) && (!q || `${e.id} ${e.description} ${e.group}`.toLowerCase().includes(q.toLowerCase())));
  const counts = LEDGER.reduce<Record<string, number>>((acc, e) => ((acc[e.tier] = (acc[e.tier] ?? 0) + 1), acc), {});
  return (
    <div>
      <p className="desc">
        Every number in the model comes from <code>data/params/parameter_ledger.csv</code>. Tiers: <TierChip tier="measured" /> read from a cited
        measurement, <TierChip tier="standard" /> textbook constant or published model input, <TierChip tier="derived" /> computed from cited values,{" "}
        <TierChip tier="fitted" /> calibrated to observed timing, <TierChip tier="assumed" /> no source found.
      </p>
      <p className="desc">{Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" · ")}</p>
      <div className="row">
        <input placeholder="search parameters" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">all tiers</option>
          {["measured", "standard", "derived", "fitted", "assumed"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <table className="ledger">
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} title={e.note}>
              <td>
                <code>{e.id}</code>
                <div className="desc">{e.description}</div>
              </td>
              <td>
                {+e.value.toPrecision(4)} <span className="unit">{e.unit}</span>
              </td>
              <td>
                <TierChip tier={e.tier} />
                <div className="desc">{e.source}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>References (verified against Crossref)</h3>
      <ol className="refs">
        {REFERENCES.map((r) => (
          <li key={r.key}>
            {r.authors.split(", ").slice(0, 3).join(", ")}
            {r.authors.split(", ").length > 3 ? " et al." : ""} ({r.year}) {r.title}. <i>{r.journal}</i> {r.volume}
            {r.pages ? `:${r.pages}` : ""}. {r.doi && <a href={`https://doi.org/${r.doi}`}>doi:{r.doi}</a>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function AboutPanel() {
  return (
    <div className="about">
      <h3>What this is</h3>
      <p>
        A mechanistic, time-resolved companion to the <a href={DECODER_SITE}>DeepSpace Seed Stress Decoder</a>. The decoder reports <em>which</em> seed
        cell types carry the transcriptional signature of a spaceflight stressor. The twin asks <em>how</em> an environment reaches those cells — through
        water, gas exchange, hormones and growth — and what the seed and seedling then look like.
      </p>
      <h3>How the model works</h3>
      <ul>
        <li>
          <b>Geometry.</b> A procedural, cellular seed: testa, a single-layer endosperm and a bent-cotyledon embryo whose axis is built as tissue rings
          × cell slices indexed from the quiescent centre, as in Bassel et al. 2014. Cell counts follow 3DCellAtlas (Montenegro-Johnson et al. 2015).
          <b> It is schematic</b>: no open segmented embryo mesh exists.
        </li>
        <li>
          <b>Water.</b> Imbibition to a plateau, turgor set by the substrate water potential relative to the hydrotime base water potential (Footitt
          et al. 2019).
        </li>
        <li>
          <b>Gas.</b> O₂, CO₂ and ethylene through the boundary layer, water film, testa and endosperm. The air-side Sherwood number falls to 2 in still
          air. Gas diffusivity scales with 1/total pressure, so exploration atmospheres change transport and O₂ partial pressure separately.
        </li>
        <li>
          <b>Hormones.</b> Per-cell ABA–GA–Integrator network of Abley et al. 2021 (equations and default parameters as published; the Integrator
          lumps DELLAs, ABI4 and ABI5), with the GA signal and GID1 graded from the radicle tip (Bassel et al. 2014) and cells coupled by a transport
          rate as in Topham et al. 2017. Ethylene, made from ACC by ACC oxidase (which needs O₂), lowers the Integrator (Wang et al. 2018).
        </li>
        <li>
          <b>Growth.</b> Lockhart growth driven by wall stress, which scales with cell size — the mechanism by which Bassel et al. 2014 explained growth
          displaced from the GA maximum. The extension here is the seed coat: testa and endosperm restrain the embryo until the cap weakens.
        </li>
        <li>
          <b>Seedling.</b> After protrusion: root meristem division and elongation, gravitropism scaled by gravity, hypocotyl elongation without division,
          apical hook and the ethylene triple response, cotyledon emergence and opening.
        </li>
      </ul>
      <h3>What to trust</h3>
      <p>
        The Sources tab lists every parameter with its evidence tier. Spaceflight outputs are hypotheses to test against the decoder and flight data, not
        measurements. Radiation-to-hormone links default to zero because no verified source quantifies them.
      </p>
    </div>
  );
}
