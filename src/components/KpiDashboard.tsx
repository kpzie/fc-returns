"use client";

import { useMemo, useRef, useState } from "react";
import type { Kpi } from "@/lib/returns/kpis";
import { formatKpi, formatPeriod } from "@/lib/format";

export interface TrendPoint {
  asAt: string;
  version: number;
  kpis: Kpi[];
}

const W = 720;
const H = 240;
const PAD = { top: 16, right: 20, bottom: 32, left: 92 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const d = Math.abs(min) || 1;
    min -= d / 2;
    max += d / 2;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.5; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

function TrendChart({ kpi, points }: { kpi: Kpi; points: { asAt: string; value: number }[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { xs, ys, ticks, y } = useMemo(() => {
    const vals = points.map((p) => p.value);
    const ticks = niceTicks(Math.min(...vals), Math.max(...vals));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
    const span = W - PAD.left - PAD.right;
    const xs = points.map((_, i) => PAD.left + (points.length === 1 ? span / 2 : (i / (points.length - 1)) * span));
    return { xs, ys: points.map((p) => y(p.value)), ticks, y };
  }, [points]);

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = svg.current!.getBoundingClientRect();
    const sx = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    xs.forEach((x, i) => {
      if (Math.abs(x - sx) < Math.abs(xs[best] - sx)) best = i;
    });
    setHover(best);
  }

  const tickLabel = (v: number) => formatKpi({ unit: kpi.unit, value: v });

  return (
    <div className="chart-wrap">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${kpi.label} by period`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-secondary)">
              {tickLabel(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text
            key={p.asAt}
            x={xs[i]}
            y={H - 10}
            textAnchor={points.length > 1 && i === points.length - 1 ? "end" : points.length > 1 && i === 0 ? "start" : "middle"}
            fontSize={11} fill="var(--text-secondary)">
            {formatPeriod(p.asAt)}
          </text>
        ))}
        {hover !== null && <line x1={xs[hover]} x2={xs[hover]} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--text-muted)" strokeDasharray="3 3" />}
        <polyline points={xs.map((x, i) => `${x},${ys[i]}`).join(" ")} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r={hover === i ? 5 : 4} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
        ))}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={W - PAD.left - PAD.right}
          height={H - PAD.top - PAD.bottom}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${(xs[hover] / W) * 100}%`, top: 0, transform: "translateX(-50%)" }}>
          <strong>{formatPeriod(points[hover].asAt)}</strong> · {formatKpi({ unit: kpi.unit, value: points[hover].value })}
        </div>
      )}
    </div>
  );
}

export default function KpiDashboard({ kpis, trend, currentAsAt }: { kpis: Kpi[]; trend: TrendPoint[]; currentAsAt: string }) {
  const [selected, setSelected] = useState(kpis[0]?.id);
  const groups = [...new Set(kpis.map((k) => k.group))];
  const prior = trend.filter((t) => t.asAt < currentAsAt).at(-1);
  const kpi = kpis.find((k) => k.id === selected)!;
  const series = trend
    .map((t) => ({ asAt: t.asAt, value: t.kpis.find((k) => k.id === selected)?.value ?? null }))
    .filter((p): p is { asAt: string; value: number } => p.value !== null);

  return (
    <section className="card">
      <div className="row spread">
        <h2 style={{ margin: 0 }}>Key indicators</h2>
        <span className="muted small">Amounts as reported in the return. Select a tile to see its trend.</span>
      </div>

      {groups.map((g) => (
        <div key={g}>
          <div className="group-title">{g}</div>
          <div className="tiles">
            {kpis
              .filter((k) => k.group === g)
              .map((k) => {
                const before = prior?.kpis.find((p) => p.id === k.id)?.value ?? null;
                // Amounts: % change. Ratios: change in percentage points (a % of a % misleads).
                const delta =
                  k.value === null || before === null
                    ? null
                    : k.unit === "ratio"
                      ? { text: `${Math.abs((k.value - before) * 100).toFixed(1)} pts`, up: k.value >= before }
                      : before === 0
                        ? null
                        : { text: `${Math.abs(((k.value - before) / Math.abs(before)) * 100).toFixed(1)}%`, up: k.value >= before };
                return (
                  <button key={k.id} className="tile" aria-pressed={k.id === selected} onClick={() => setSelected(k.id)}>
                    <div className="label">{k.label}</div>
                    <div className="value">{formatKpi(k)}</div>
                    {delta !== null && (
                      <div className="muted small">
                        {delta.text.startsWith("0.0") ? "No change" : `${delta.up ? "▲" : "▼"} ${delta.text}`} vs {formatPeriod(prior!.asAt)}
                      </div>
                    )}
                    <div className="source">{k.source}</div>
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      <div className="group-title">Trend · {kpi.label}</div>
      {series.length < 2 ? (
        <p className="muted small">The trend appears once two or more periods have been uploaded for this finance company.</p>
      ) : (
        <>
          <TrendChart kpi={kpi} points={series} />
          <details>
            <summary>Show as table</summary>
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="num">{kpi.label}</th>
                </tr>
              </thead>
              <tbody>
                {series.map((p) => (
                  <tr key={p.asAt}>
                    <td>{formatPeriod(p.asAt)}</td>
                    <td className="num">{formatKpi({ unit: kpi.unit, value: p.value })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
