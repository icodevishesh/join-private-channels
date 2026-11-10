'use client';

import { useState } from 'react';

/*
 * Small dependency-free SVG charts for the dashboard. Colors are validated
 * categorical slots (blue, orange) for both themes; text uses ink colors only.
 */
import { SERIES } from '@/lib/chartColors';
const GRID = 'var(--color-zinc-200)';
const INK_MUTED = 'var(--color-zinc-500)';

const fmtDay = (key) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });

function niceMax(max) {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: it.color }} aria-hidden="true" />
          {it.label}
          {it.total !== undefined && <span className="font-medium text-zinc-900 tabular-nums">{it.total.toLocaleString('en-US')}</span>}
        </span>
      ))}
    </div>
  );
}

/** Shared frame: y gridlines, x date ticks, and a hover tooltip for one day. */
function useFrame(labels, maxValue) {
  const W = 640;
  const H = 220;
  const pad = { top: 12, right: 12, bottom: 26, left: 32 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = niceMax(maxValue);
  const y = (v) => pad.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const every = Math.max(1, Math.ceil(labels.length / 7));
  return { W, H, pad, innerW, innerH, max, y, ticks, every };
}

function Axes({ f, labels, x }) {
  return (
    <>
      {f.ticks.map((t) => (
        <g key={t}>
          <line x1={f.pad.left} x2={f.W - f.pad.right} y1={f.y(t)} y2={f.y(t)} stroke={GRID} strokeWidth="1" />
          <text x={f.pad.left - 6} y={f.y(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={INK_MUTED}>
            {Number.isInteger(t) ? t : t.toFixed(1)}
          </text>
        </g>
      ))}
      {labels.map((d, i) =>
        i % f.every === 0 || i === labels.length - 1 ? (
          <text key={d} x={x(i)} y={f.H - 8} textAnchor="middle" fontSize="11" fill={INK_MUTED}>
            {fmtDay(d)}
          </text>
        ) : null,
      )}
    </>
  );
}

function Tooltip({ day, rows, left }) {
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 min-w-36 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{ left: `${left}%` }}
    >
      <p className="mb-1 font-medium text-zinc-900">{fmtDay(day)}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 text-zinc-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-sm" style={{ background: r.color }} />
            {r.label}
          </span>
          <span className="font-medium text-zinc-900 tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Lines over time with a crosshair + tooltip. series: [{ label, values, color }] */
export function LineChart({ labels, series, ariaLabel }) {
  const [hover, setHover] = useState(null);
  const f = useFrame(labels, Math.max(1, ...series.flatMap((s) => s.values)));
  const step = labels.length > 1 ? f.innerW / (labels.length - 1) : 0;
  const x = (i) => f.pad.left + i * step;

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * f.W;
    setHover(Math.min(labels.length - 1, Math.max(0, Math.round((px - f.pad.left) / (step || 1)))));
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${f.W} ${f.H}`} className="h-auto w-full" role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <Axes f={f} labels={labels} x={x} />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={f.pad.top} y2={f.pad.top + f.innerH} stroke="var(--color-zinc-400)" strokeDasharray="3 3" />}
        {series.map((s) => (
          <g key={s.label}>
            <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${f.y(v)}`).join(' ')} />
            {hover !== null && <circle cx={x(hover)} cy={f.y(s.values[hover])} r="4.5" fill={s.color} stroke="var(--chart-surface)" strokeWidth="2" />}
          </g>
        ))}
        <rect x={f.pad.left} y={f.pad.top} width={f.innerW} height={f.innerH} fill="transparent" />
      </svg>
      {hover !== null && (
        <Tooltip
          day={labels[hover]}
          left={(x(hover) / f.W) * 100}
          rows={series.map((s) => ({ label: s.label, color: s.color, value: s.values[hover] }))}
        />
      )}
    </div>
  );
}

/** Grouped bars per day (one bar per series) with a per-day tooltip. */
export function BarChart({ labels, series, ariaLabel }) {
  const [hover, setHover] = useState(null);
  const f = useFrame(labels, Math.max(1, ...series.flatMap((s) => s.values)));
  const slot = f.innerW / labels.length;
  const x = (i) => f.pad.left + slot * (i + 0.5);
  const gap = 2;
  const barW = Math.max(2, Math.min(14, (slot * 0.7 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);
  const r = Math.min(4, barW / 2);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${f.W} ${f.H}`} className="h-auto w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        <Axes f={f} labels={labels} x={x} />
        {labels.map((d, i) => (
          <g key={d} onMouseEnter={() => setHover(i)}>
            {/* Hit target: the whole day column. */}
            <rect x={f.pad.left + slot * i} y={f.pad.top} width={slot} height={f.innerH} fill={hover === i ? 'var(--color-zinc-100)' : 'transparent'} />
            {series.map((s, si) => {
              const v = s.values[i];
              if (!v) return null;
              const bx = x(i) - groupW / 2 + si * (barW + gap);
              const by = f.y(v);
              const h = f.pad.top + f.innerH - by;
              const rr = Math.min(r, h);
              // Rounded top, square bottom on the baseline.
              return (
                <path
                  key={s.label}
                  fill={s.color}
                  d={`M${bx},${by + h} V${by + rr} Q${bx},${by} ${bx + rr},${by} H${bx + barW - rr} Q${bx + barW},${by} ${bx + barW},${by + rr} V${by + h} Z`}
                />
              );
            })}
          </g>
        ))}
      </svg>
      {hover !== null && (
        <Tooltip
          day={labels[hover]}
          left={(x(hover) / f.W) * 100}
          rows={series.map((s) => ({ label: s.label, color: s.color, value: s.values[hover] }))}
        />
      )}
    </div>
  );
}

/** Horizontal bars for a single measure (funnel, breakdown). Values are labelled directly. */
export function HBars({ items, color = SERIES[0], showShare = false }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const first = items[0]?.value || 0;
  return (
    <ul className="space-y-3">
      {items.map((it, idx) => (
        <li key={it.label} title={`${it.label}: ${it.value}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="text-zinc-700">{it.label}</span>
            <span className="font-medium text-zinc-900 tabular-nums">
              {it.value.toLocaleString('en-US')}
              {showShare && idx > 0 && first > 0 && <span className="ml-1.5 text-xs font-normal text-zinc-500">{Math.round((it.value / first) * 100)}%</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100">
            <div className="h-2 rounded-full transition-all" style={{ width: `${(it.value / max) * 100}%`, background: color, minWidth: it.value ? 6 : 0 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
