/**
 * Phase SK — the enlarged view of the snowfall line at the place (SVG, no library): p50 line with the p10–p90 band in m,
 * the place height as a reference line, the hours where the line lies at or below the place tinted ("Schnee bei dir"),
 * a kind strip (the 48-h bar) and the P(wet) strip below the axis, crosshair + tooltip. Nothing is interpolated beyond
 * the native steps of buscosun Fusion: gaps break the line.
 */
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { timeTicks } from '../nowcast/minuteSeries';
import { fmtM } from '../nowcast/heightTime/heightTimeModel';
import type { SnowArrival, SnowCell } from './snowArrival';

const H = 3_600_000;
const PAD = { t: 30, r: 18, b: 64, l: 52 };
const FMT_CLOCK = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const FMT_DAY = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

const KIND_WORD: Record<SnowCell['kind'], string> = { snow: 'Schneefallgrenze bei dir oder tiefer', band: 'Grenze knapp über dir', rain: 'Grenze über dir', gap: 'keine Daten' };

export default function SnowLineChart({ arrival, fromMs, rangeH, height = 320 }: { arrival: SnowArrival; fromMs: number; rangeH: number; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = Math.max(10, width - PAD.l - PAD.r);
  const plotH = Math.max(10, height - PAD.t - PAD.b);
  const yBase = PAD.t + plotH;
  const endMs = fromMs + rangeH * H;
  const X = (t: number) => PAD.l + ((t - fromMs) / (endMs - fromMs)) * plotW;

  const pts = useMemo(() => arrival.points.filter((p) => p.tMs >= fromMs && p.tMs <= endMs), [arrival, fromMs, endMs]);
  const hTrue = arrival.hTrue;
  const dom = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) {
      if (p.p50 != null) { lo = Math.min(lo, p.p10 ?? p.p50); hi = Math.max(hi, p.p90 ?? p.p50); }
    }
    if (hTrue != null) { lo = Math.min(lo, hTrue); hi = Math.max(hi, hTrue); }
    if (!Number.isFinite(lo)) { lo = 0; hi = 2000; }
    lo = Math.floor((lo - 120) / 100) * 100; hi = Math.ceil((hi + 120) / 100) * 100;
    if (hi - lo < 600) { const mid = (hi + lo) / 2; lo = Math.floor((mid - 300) / 100) * 100; hi = lo + 600; }
    lo = Math.max(-100, lo);
    const span = hi - lo;
    const step = span <= 800 ? 100 : span <= 1600 ? 200 : span <= 4000 ? 500 : 1000;
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    return { lo, hi, ticks };
  }, [pts, hTrue]);
  const Y = (m: number) => PAD.t + plotH - ((m - dom.lo) / (dom.hi - dom.lo)) * plotH;

  // Paths per contiguous run of valid steps (a gap breaks the line and the band).
  const runs = useMemo(() => {
    const out: Array<typeof pts> = [];
    let cur: typeof pts = [];
    for (const p of pts) {
      if (p.p50 == null) { if (cur.length) out.push(cur); cur = []; } else cur.push(p);
    }
    if (cur.length) out.push(cur);
    return out;
  }, [pts]);
  const f = (n: number) => n.toFixed(1);
  const linePath = (run: typeof pts) => run.map((p, i) => `${i ? 'L' : 'M'}${f(X(p.tMs))},${f(Y(p.p50 as number))}`).join('');
  const bandPath = (run: typeof pts) => {
    const top = run.map((p, i) => `${i ? 'L' : 'M'}${f(X(p.tMs))},${f(Y(p.p90 ?? (p.p50 as number)))}`).join('');
    const bottom = [...run].reverse().map((p) => `L${f(X(p.tMs))},${f(Y(p.p10 ?? (p.p50 as number)))}`).join('');
    return `${top}${bottom}Z`;
  };
  const snowArea = (run: typeof pts) => hTrue == null ? '' : `${linePath(run)}L${f(X(run[run.length - 1].tMs))},${f(Y(hTrue))}L${f(X(run[0].tMs))},${f(Y(hTrue))}Z`;

  const ticks = useMemo(() => timeTicks(fromMs, rangeH), [fromMs, rangeH]);
  const nowMs = Date.now();
  const cells = arrival.cells.filter((c) => c.fromMs < endMs);
  const wet = arrival.wet.filter((w) => w.fromMs < endMs && w.toMs > fromMs);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = fromMs + ((e.clientX - r.left) / r.width) * (endMs - fromMs);
    setHoverMs(Math.max(fromMs, Math.min(endMs, t)));
  };
  const hover = useMemo(() => {
    if (hoverMs == null) return null;
    let best: (typeof pts)[number] | null = null;
    for (const p of pts) if (!best || Math.abs(p.tMs - hoverMs) < Math.abs(best.tMs - hoverMs)) best = p;
    const cell = cells.find((c) => hoverMs >= c.fromMs && hoverMs < c.toMs) ?? null;
    const w = wet.find((x) => hoverMs >= x.fromMs && hoverMs < x.toMs) ?? null;
    return { p: best, cell, pWet: w?.pWet ?? null };
  }, [hoverMs, pts, cells, wet]);
  const hoverX = hover?.p ? X(hover.p.tMs) : 0;
  const tipLeft = hover?.p ? Math.max(0, Math.min(width - 250, hoverX - 125)) : 0;
  const clipId = 'skc-clip-snow';

  return (
    <div ref={wrapRef} className="skc-chart" onPointerLeave={() => setHoverMs(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Schneefallgrenze am Ort über ${rangeH} Stunden, buscosun Fusion`}>
          <defs>
            {hTrue != null && <clipPath id={clipId}><rect x={PAD.l} y={Y(hTrue)} width={plotW} height={Math.max(0, yBase - Y(hTrue))} /></clipPath>}
          </defs>
          {dom.ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={PAD.l + plotW} y1={Y(v)} y2={Y(v)} className="mv-grid" />
              <text x={PAD.l - 8} y={Y(v) + 3.5} className="mv-ylabel" textAnchor="end">{fmtM(v)}</text>
            </g>
          ))}
          <text x={PAD.l - 8} y={PAD.t - 10} className="mv-ylabel" textAnchor="end">m</text>
          {ticks.map((tk) => (
            <g key={tk.tMs}>
              <line x1={X(tk.tMs)} x2={X(tk.tMs)} y1={tk.major ? PAD.t - 4 : yBase} y2={yBase + 4} className={tk.major ? 'mv-tick mv-tick--day' : 'mv-tick'} />
              <text x={X(tk.tMs)} y={yBase + 16} className="mv-xlabel" textAnchor="middle">{FMT_CLOCK.format(tk.tMs)}</text>
              {tk.major && <text x={X(tk.tMs) + 5} y={PAD.t - 8} className="mv-daylabel">{FMT_DAY.format(tk.tMs)}</text>}
            </g>
          ))}

          {/* snow at the place: the line at or below the place height */}
          {hTrue != null && runs.map((run, i) => <path key={`s${i}`} d={snowArea(run)} className="skc-snowarea" clipPath={`url(#${clipId})`} />)}
          {/* band p10–p90 + line p50 */}
          {runs.map((run, i) => <path key={`b${i}`} d={bandPath(run)} className="skc-band" />)}
          {runs.map((run, i) => <path key={`l${i}`} d={linePath(run)} className="skc-line" />)}
          {pts.filter((p) => p.p50 != null).map((p) => <circle key={p.tMs} cx={X(p.tMs)} cy={Y(p.p50 as number)} r={2.4} className="skc-pt" />)}

          {/* place height */}
          {hTrue != null && (
            <g>
              <line x1={PAD.l} x2={PAD.l + plotW} y1={Y(hTrue)} y2={Y(hTrue)} className="skc-place" />
              <text x={PAD.l + plotW - 4} y={Y(hTrue) - 5} className="skc-placelabel" textAnchor="end">Ortshöhe {fmtM(hTrue)} m</text>
            </g>
          )}
          <line x1={PAD.l} x2={PAD.l + plotW} y1={yBase} y2={yBase} className="mv-base" />

          {/* strips: kind per hour, P(wet) per step */}
          {cells.map((c) => (
            <rect key={`k${c.fromMs}`} x={X(c.fromMs) + 0.5} y={yBase + 24} width={Math.max(1, X(Math.min(c.toMs, endMs)) - X(c.fromMs) - 1)} height={7} rx={1.5} className={`skc-kind skc-kind--${c.kind}`} />
          ))}
          <text x={PAD.l} y={yBase + 42} className="mv-striplabel">Grenze bei dir · knapp darüber · darüber</text>
          {wet.map((w) => w.pWet != null && (
            <rect key={`w${w.fromMs}`} x={X(Math.max(w.fromMs, fromMs)) + 0.5} y={yBase + 46} width={Math.max(1, X(Math.min(w.toMs, endMs)) - X(Math.max(w.fromMs, fromMs)) - 1)} height={6} rx={1.5} className="mv-pwet" style={{ fillOpacity: 0.12 + 0.8 * w.pWet }} />
          ))}
          <text x={PAD.l} y={yBase + 62} className="mv-striplabel">Regenchance je Schritt · buscosun Fusion</text>

          {/* now */}
          {nowMs >= fromMs && nowMs <= endMs && (
            <g>
              <line x1={X(nowMs)} x2={X(nowMs)} y1={PAD.t - 2} y2={yBase} className="mv-now" />
              <text x={X(nowMs) + 4} y={yBase - 4} className="mv-nowlabel">jetzt</text>
            </g>
          )}

          {hover?.p && hover.p.p50 != null && (
            <g>
              <line x1={hoverX} x2={hoverX} y1={PAD.t} y2={yBase} className="mv-cross" />
              <circle cx={hoverX} cy={Y(hover.p.p50)} r={4.5} className="skc-dot" />
            </g>
          )}
          <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} style={{ cursor: 'crosshair', touchAction: 'pan-y' }} />
        </svg>
      )}
      {hover?.p && (
        <div className="mv-tip" style={{ left: tipLeft, top: PAD.t + 4, width: 250 }} role="status">
          <div className="mv-tip-time">{FMT_CLOCK.format(hover.p.tMs)} · {FMT_DAY.format(hover.p.tMs)}</div>
          <div className="mv-tip-val">
            {hover.p.p50 != null ? <>≈ {fmtM(hover.p.p50)} m <span>· {hover.p.p10 != null && hover.p.p90 != null ? `${fmtM(hover.p.p10)}–${fmtM(hover.p.p90)} m` : ''}</span></> : 'keine Daten'}
          </div>
          <div className="mv-tip-src">
            {hover.cell ? KIND_WORD[hover.cell.kind] : ''}{hover.pWet != null ? ` · Regenchance ${Math.round(hover.pWet * 100)} %` : ''} · buscosun Fusion
          </div>
        </div>
      )}
    </div>
  );
}
