// Minimal SVG line chart. Colours are hex strings resolved in JS: SVG presentation
// attributes ignore CSS var() in WebKit (ABAI lesson L018).
import { useMemo } from "react";

export interface Series {
  label: string;
  color: string;
  x: number[];
  y: number[];
  dashed?: boolean;
}

export interface Band {
  x0: number;
  x1: number;
  label: string;
  color: string;
}

interface Props {
  title: string;
  yLabel: string;
  xLabel?: string;
  series: Series[];
  xMax: number;
  xMin?: number;
  now?: number;
  bands?: Band[];
  yMin?: number;
  yMax?: number;
  height?: number;
  fg: string;
  muted: string;
  line: string;
}

function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) out.push(+v.toPrecision(6));
  return out;
}

function fmt(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1000) return v.toFixed(0);
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  if (a >= 0.01) return v.toFixed(2);
  return v.toExponential(0);
}

export function Chart(p: Props) {
  const W = 320;
  const H = p.height ?? 150;
  const m = { l: 40, r: 8, t: 8, b: 26 };
  const xMin = p.xMin ?? 0;
  const { lo, hi } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of p.series)
      for (const v of s.y) {
        if (!Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    if (p.yMin !== undefined) lo = p.yMin;
    if (p.yMax !== undefined) hi = p.yMax;
    if (!Number.isFinite(lo)) (lo = 0), (hi = 1);
    if (hi - lo < 1e-12) hi = lo + (Math.abs(lo) || 1) * 0.1;
    return { lo, hi };
  }, [p.series, p.yMin, p.yMax]);
  const X = (x: number) => m.l + ((x - xMin) / (p.xMax - xMin || 1)) * (W - m.l - m.r);
  const Y = (y: number) => H - m.b - ((y - lo) / (hi - lo)) * (H - m.t - m.b);
  const yt = niceTicks(lo, hi);
  const xt = niceTicks(xMin, p.xMax, 6);
  return (
    <figure className="chart">
      <figcaption>{p.title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.title}>
        {p.bands?.map((b, k) => (
          <g key={k}>
            <rect x={X(b.x0)} y={m.t} width={Math.max(1, X(b.x1) - X(b.x0))} height={H - m.t - m.b} fill={b.color} opacity={0.18} />
            <text x={X(b.x0) + 2} y={m.t + 9} fontSize={8} fill={p.muted}>
              {b.label}
            </text>
          </g>
        ))}
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke={p.line} strokeWidth={0.5} />
            <text x={m.l - 4} y={Y(v) + 3} fontSize={8} textAnchor="end" fill={p.muted}>
              {fmt(v)}
            </text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={`x${v}`} x={X(v)} y={H - m.b + 11} fontSize={8} textAnchor="middle" fill={p.muted}>
            {fmt(v)}
          </text>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 3} fontSize={8} textAnchor="middle" fill={p.muted}>
          {p.xLabel ?? "hours after imbibition"}
        </text>
        <text x={9} y={(m.t + H - m.b) / 2} fontSize={8} textAnchor="middle" fill={p.muted} transform={`rotate(-90 9 ${(m.t + H - m.b) / 2})`}>
          {p.yLabel}
        </text>
        {p.series.map((s, k) => {
          let d = "";
          for (let i = 0; i < s.x.length; i++) {
            if (!Number.isFinite(s.y[i])) continue;
            d += `${d ? "L" : "M"}${X(s.x[i]).toFixed(1)},${Y(Math.max(lo, Math.min(hi, s.y[i]))).toFixed(1)}`;
          }
          return <path key={k} d={d} fill="none" stroke={s.color} strokeWidth={1.4} strokeDasharray={s.dashed ? "4 3" : undefined} />;
        })}
        {p.now !== undefined && <line x1={X(p.now)} x2={X(p.now)} y1={m.t} y2={H - m.b} stroke={p.fg} strokeWidth={0.6} opacity={0.6} />}
      </svg>
      <div className="legend">
        {p.series.map((s, k) => (
          <span key={k}>
            <i style={{ background: s.color, opacity: s.dashed ? 0.6 : 1 }} />
            {s.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
