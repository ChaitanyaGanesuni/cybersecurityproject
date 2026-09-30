// Small, dependency-free SVG charts. Single series each (the title names it),
// thin rounded bars anchored to the baseline, a dashed goal reference line,
// recessive axes, and a hover/tap tooltip per mark.

import { useState } from 'react';

export interface Datum {
  label: string;
  value: number | null;
  tip: string;
}

const W = 320;

export function BarChart({ data, goal, color, height = 140, goalLabel }: { data: Datum[]; goal?: number; color: string; height?: number; goalLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const pad = { t: 10, b: 18, l: 4, r: 4 };
  const max = Math.max(goal ?? 0, ...data.map((d) => d.value ?? 0), 1) * 1.08;
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const step = iw / Math.max(1, data.length);
  const bw = Math.max(3, Math.min(22, step - 2));
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const labelEvery = Math.ceil(data.length / 8);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={data.map((d) => d.tip).join('; ')}>
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--line)" />
        {data.map((d, i) => {
          const x = pad.l + i * step + (step - bw) / 2;
          const v = d.value ?? 0;
          const h = Math.max(v > 0 ? 3 : 0, pad.t + ih - y(v));
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
              <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${pad.t + ih} V${pad.t + ih - h + r} Q${x},${pad.t + ih - h} ${x + r},${pad.t + ih - h} H${x + bw - r} Q${x + bw},${pad.t + ih - h} ${x + bw},${pad.t + ih - h + r} V${pad.t + ih} Z`}
                  fill={color}
                  opacity={hover == null || hover === i ? 1 : 0.45}
                />
              )}
              {i % labelEvery === 0 && (
                <text className="axis" x={pad.l + i * step + step / 2} y={height - 4} textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        {goal != null && goal > 0 && (
          <>
            <line x1={pad.l} x2={W - pad.r} y1={y(goal)} y2={y(goal)} stroke="var(--text-2)" strokeDasharray="4 4" strokeWidth={1} />
            <text className="axis" x={W - pad.r} y={y(goal) - 4} textAnchor="end">{goalLabel ?? 'goal'}</text>
          </>
        )}
      </svg>
      {hover != null && data[hover] && (
        <div className="tip" style={{ left: `${((pad.l + hover * step + step / 2) / W) * 100}%`, top: `${(y(data[hover].value ?? 0) / height) * 100}%` }}>
          {data[hover].tip}
        </div>
      )}
    </div>
  );
}

export function LineChart({ data, color, height = 140 }: { data: Datum[]; color: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = data.map((d, i) => ({ ...d, i })).filter((d) => d.value != null) as (Datum & { i: number; value: number })[];
  if (pts.length === 0) return <p className="muted small">No entries yet.</p>;
  const pad = { t: 14, b: 18, l: 30, r: 8 };
  const vals = pts.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const span = hi - lo;
  lo -= span * 0.1; hi += span * 0.1;
  const iw = W - pad.l - pad.r, ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const path = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.value)}`).join(' ');
  const labelEvery = Math.ceil(data.length / 6);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={pts.map((p) => p.tip).join('; ')}>
        {[lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={0.6} />
            <text className="axis" x={pad.l - 4} y={y(v) + 3} textAnchor="end">{v.toFixed(1)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => (
          <g key={p.i} onMouseEnter={() => setHover(p.i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(p.i)}>
            <circle cx={x(p.i)} cy={y(p.value)} r={12} fill="transparent" />
            <circle cx={x(p.i)} cy={y(p.value)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
          </g>
        ))}
        {data.map((d, i) => i % labelEvery === 0 && (
          <text key={i} className="axis" x={x(i)} y={height - 4} textAnchor="middle">{d.label}</text>
        ))}
      </svg>
      {hover != null && data[hover]?.value != null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${((y(data[hover].value!) - 6) / height) * 100}%` }}>
          {data[hover].tip}
        </div>
      )}
    </div>
  );
}
