/**
 * Minutenverlauf — the chart (SVG, no library). Radar minutes as a line with a soft area, buscosun Fusion hours as
 * bars (hourly means), a dashed seam between the two sources with both named, "jetzt" marker, midnight lines with the
 * date, a P(wet) strip per Fusion hour below the axis (full variant), crosshair + tooltip on hover.
 * Phase RUC (on, `?ruc=0` = fallback): between the seam and +27 h the 5-min form of ICON-D2-RUC as a step line with area (hour bars it
 * covers are not drawn); hours without a form (`flat`) are hatched; a second seam names the hourly part beyond.
 * Single series ⇒ no legend; identity is in the title and the seam labels. Text wears text tokens, never the series colour.
 */
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { intensityBand, intensityLabel } from './nowcastModel';
import { fmtClock, fmtMmH } from './nowcastView';
import { niceMaxMmH, timeTicks, valueAt, type MinuteSeries } from './minuteSeries';

const H = 3_600_000;
const MIN = 60_000;

export interface MinuteChartProps {
  series: MinuteSeries;
  /** Visible range from now (hours). */
  rangeH: number;
  variant: 'mini' | 'full';
  height?: number;
}

const PAD = {
  mini: { t: 14, r: 8, b: 18, l: 8 },
  full: { t: 30, r: 18, b: 52, l: 40 },
};

function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export default function MinuteChart({ series, rangeH, variant, height }: MinuteChartProps) {
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

  const h = height ?? (variant === 'mini' ? 96 : 320);
  const pad = PAD[variant];
  const plotW = Math.max(10, width - pad.l - pad.r);
  const plotH = Math.max(10, h - pad.t - pad.b);
  const yBase = pad.t + plotH;
  const { nowMs } = series;
  const rangeMs = rangeH * H;
  const endMs = nowMs + rangeMs;
  const X = (t: number) => pad.l + ((t - nowMs) / rangeMs) * plotW;

  const geom = useMemo(() => {
    let maxInRange = 0;
    const radarPts = series.radar ? series.radar.points.filter((p) => p.tMs <= endMs) : [];
    for (const p of radarPts) maxInRange = Math.max(maxInRange, p.mmH);
    const rucPts = series.ruc ? series.ruc.points.filter((s) => s.fromMs < endMs) : [];
    for (const s of rucPts) maxInRange = Math.max(maxInRange, s.mmH);
    const stripBars = series.hours.filter((b) => b.fromMs < endMs);
    const bars = series.ruc ? stripBars.filter((b) => !b.rucCovered) : stripBars;
    for (const b of bars) maxInRange = Math.max(maxInRange, b.mmH);
    const yMax = niceMaxMmH(maxInRange);
    return { radarPts, rucPts, bars, stripBars, yMax };
  }, [series, endMs]);
  const Y = (v: number) => pad.t + plotH - (Math.min(v, geom.yMax) / geom.yMax) * plotH;

  const radarPath = useMemo(() => {
    const pts = geom.radarPts;
    if (pts.length < 2 || width === 0) return null;
    let line = '';
    for (let i = 0; i < pts.length; i++) line += `${i === 0 ? 'M' : 'L'}${X(pts[i].tMs).toFixed(1)},${Y(pts[i].mmH).toFixed(1)}`;
    const area = `${line}L${X(pts[pts.length - 1].tMs).toFixed(1)},${yBase}L${X(pts[0].tMs).toFixed(1)},${yBase}Z`;
    return { line, area };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geom, width, plotW, plotH, rangeMs]);

  // Phase RUC: step path over the 5-min intervals (horizontal per interval, vertical at the joints) + area; flat hours as hatched blocks.
  const rucPath = useMemo(() => {
    const pts = geom.rucPts;
    if (!pts.length || width === 0) return null;
    let line = `M${X(pts[0].fromMs).toFixed(1)},${Y(pts[0].mmH).toFixed(1)}`;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i > 0) line += `V${Y(p.mmH).toFixed(1)}`;
      line += `H${X(Math.min(p.toMs, endMs)).toFixed(1)}`;
    }
    const xEnd = X(Math.min(pts[pts.length - 1].toMs, endMs)).toFixed(1);
    const area = `${line}L${xEnd},${yBase}L${X(pts[0].fromMs).toFixed(1)},${yBase}Z`;
    const flats: Array<{ x0: number; x1: number; y: number; key: number }> = [];
    for (const p of pts) {
      if (p.kind !== 'flat' || p.mmH <= 0) continue;
      const x0 = X(p.fromMs), x1 = X(Math.min(p.toMs, endMs));
      const last = flats[flats.length - 1];
      if (last && Math.abs(last.x1 - x0) < 0.6 && Math.abs(last.y - Y(p.mmH)) < 0.01) last.x1 = x1;
      else flats.push({ x0, x1, y: Y(p.mmH), key: p.fromMs });
    }
    return { line, area, flats };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geom, width, plotW, plotH, rangeMs]);

  const ticks = useMemo(() => timeTicks(nowMs, rangeH), [nowMs, rangeH]);
  const seamMs = series.radar ? series.radar.toMs : null;
  const seamVisible = seamMs != null && seamMs < endMs;
  const full = variant === 'full';
  const ruc = series.ruc;
  const rucEndVisible = ruc != null && ruc.toMs < endMs && geom.bars.some((b) => b.fromMs >= ruc.toMs);
  // Phase RUC: with the layer the seam names the 5-min form; WITHOUT it the three seam texts are the literals of the stand before RUC (review C1).
  const rucFull = ruc ? `${ruc.label} · Stundensumme ${series.fusionLabel}` : null;
  const rucMini = ruc ? 'RUC 5 min' : null;

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const t = nowMs + Math.round(((x / r.width) * rangeMs) / MIN) * MIN;
    setHoverMs(Math.max(nowMs, Math.min(endMs, t)));
  };
  const hover = hoverMs != null ? valueAt(series, hoverMs) : null;
  const nowVal = valueAt(series, nowMs)?.mmH ?? null;
  const hoverX = hoverMs != null ? X(hoverMs) : 0;
  const tipLeft = hoverMs != null ? Math.max(0, Math.min(width - 230, hoverX - 115)) : 0;

  const yGrid = useMemo(() => {
    // Ticks on round values: a step from the list that gives 3–5 lines up to yMax.
    const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20];
    const step = steps.find((st) => geom.yMax / st <= 5) ?? geom.yMax / 4;
    const out: number[] = [];
    for (let v = step; v <= geom.yMax + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
    return full ? out : out.filter((_, i) => i % 2 === 1 || out.length <= 2);
  }, [geom.yMax, full]);
  const fmtY = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed((v * 10) % 1 === 0 ? 1 : 2).replace('.', ','));
  // Seam labels: both beside the seam when there is room on the left, otherwise one combined label to the right.
  const seamX = seamMs != null ? X(seamMs) : 0;
  const seamRoomLeft = seamX - pad.l >= (full ? 190 : 40);
  const seamRoomRight = pad.l + plotW - seamX >= (full ? 180 : 70);
  const thresholds = full ? [{ v: 1, l: 'leicht' }, { v: 2.5, l: 'mäßig' }, { v: 10, l: 'stark' }].filter((t) => t.v < geom.yMax * 0.98) : [];
  const gradId = `mv-grad-${variant}`;
  const hatchId = `mv-hatch-${variant}`;
  const ariaLabel = ruc
    ? `Niederschlag am Ort, ${rangeH} Stunden: Radar minutengenau, danach die 5-min-Form von ${ruc.label.split(' ·')[0]} mit den Stundensummen von ${series.fusionLabel}, jenseits +27 h ${series.fusionLabel} stündlich`
    : `Niederschlag am Ort, ${rangeH} Stunden: Radar minutengenau, danach buscosun Fusion stündlich`;

  return (
    <div ref={wrapRef} className={`mv-chart mv-chart--${variant}`} onPointerLeave={() => setHoverMs(null)}>
      {width > 0 && (
        <svg width={width} height={h} role="img" aria-label={ariaLabel}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3A6FA8" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#3A6FA8" stopOpacity="0.03" />
            </linearGradient>
            {ruc && (
              <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" className="mv-hatch-line" />
              </pattern>
            )}
          </defs>

          {/* grid */}
          {yGrid.map((v) => (
            <g key={`g${v}`}>
              <line x1={pad.l} x2={pad.l + plotW} y1={Y(v)} y2={Y(v)} className="mv-grid" />
              {full && <text x={pad.l - 6} y={Y(v) + 3.5} className="mv-ylabel" textAnchor="end">{fmtY(v)}</text>}
            </g>
          ))}
          {full && <text x={pad.l - 6} y={pad.t - 10} className="mv-ylabel" textAnchor="end">mm/h</text>}
          {thresholds.map((t) => (
            <g key={t.l}>
              <line x1={pad.l} x2={pad.l + plotW} y1={Y(t.v)} y2={Y(t.v)} className="mv-thr" />
              <text x={pad.l + plotW - 4} y={Y(t.v) - 3} className="mv-thrlabel" textAnchor="end">{t.l}</text>
            </g>
          ))}

          {/* midnight lines + time ticks */}
          {ticks.map((tk) => (
            <g key={tk.tMs}>
              <line x1={X(tk.tMs)} x2={X(tk.tMs)} y1={tk.major && full ? pad.t - 4 : yBase} y2={yBase + 4} className={tk.major ? 'mv-tick mv-tick--day' : 'mv-tick'} />
              <text x={X(tk.tMs)} y={yBase + (full ? 16 : 13)} className="mv-xlabel" textAnchor="middle">{fmtClock(tk.tMs)}</text>
              {tk.major && full && <text x={X(tk.tMs) + 5} y={pad.t - 8} className="mv-daylabel">{fmtDay(tk.tMs)}</text>}
            </g>
          ))}

          {/* buscosun Fusion: hourly means as bars (hours the RUC covers are drawn as steps instead) */}
          {geom.bars.map((b) => {
            const x0 = X(b.fromMs) + 1;
            const x1 = X(Math.min(b.toMs, endMs)) - 1;
            const w = Math.max(1, x1 - x0);
            const y = Y(b.mmH);
            const barH = Math.max(0, yBase - y);
            return (
              <g key={b.fromMs}>
                {barH > 0.5 && <rect x={x0} y={y} width={w} height={barH} rx={Math.min(3, w / 2)} className="mv-bar" />}
                {barH > 0.5 && <line x1={x0} x2={x0 + w} y1={y} y2={y} className="mv-bar-top" />}
              </g>
            );
          })}
          {/* P(wet) strip per Fusion hour — every hour, also those the RUC covers (the sum is Fusion's) */}
          {full && geom.stripBars.map((b) => {
            if (b.pWet == null) return null;
            const x0 = X(b.fromMs) + 1;
            const w = Math.max(1, X(Math.min(b.toMs, endMs)) - 1 - x0);
            return <rect key={`p${b.fromMs}`} x={x0} y={yBase + 24} width={w} height={6} rx={2} className="mv-pwet" style={{ fillOpacity: 0.12 + 0.8 * b.pWet }} />;
          })}
          {full && geom.stripBars.some((b) => b.pWet != null) && (
            <text x={pad.l} y={yBase + 42} className="mv-striplabel">Regenchance je Stunde · buscosun Fusion</text>
          )}

          {/* Phase RUC: 5-min steps as line + area, flat hours hatched */}
          {rucPath && (
            <>
              <path d={rucPath.area} className="mv-ruc-area" />
              {rucPath.flats.map((f) => (
                <rect key={f.key} x={f.x0} y={f.y} width={Math.max(1, f.x1 - f.x0)} height={Math.max(0, yBase - f.y)} fill={`url(#${hatchId})`} className="mv-ruc-flat">
                  <title>Stunde ohne Form (RUC trocken) · Stundenmittel {series.fusionLabel}</title>
                </rect>
              ))}
              <path d={rucPath.line} className="mv-ruc-line" />
            </>
          )}

          {/* radar: minutes as line + area */}
          {radarPath && (
            <>
              <path d={radarPath.area} fill={`url(#${gradId})`} />
              <path d={radarPath.line} className="mv-line" />
            </>
          )}

          {/* baseline */}
          <line x1={pad.l} x2={pad.l + plotW} y1={yBase} y2={yBase} className="mv-base" />

          {/* seam radar → Fusion (or → RUC) */}
          {seamVisible && seamMs != null && (
            <g>
              <line x1={X(seamMs)} x2={X(seamMs)} y1={pad.t - 2} y2={yBase} className="mv-seam" />
              {seamRoomLeft && !seamRoomRight ? (
                <text x={seamX - 5} y={pad.t + (full ? 10 : 7)} className="mv-seamlabel" textAnchor="end">{rucFull ? (full ? `Radar · minutengenau bis ${fmtClock(seamMs)} · danach ${rucFull} ▸` : `Radar · ${rucMini} ▸`) : (full ? `Radar · minutengenau bis ${fmtClock(seamMs)} · danach ${series.fusionLabel} ▸` : `Radar · ${series.fusionLabel} ▸`)}</text>
              ) : seamRoomLeft ? (
                <>
                  <text x={seamX - 5} y={pad.t + (full ? 10 : 7)} className="mv-seamlabel" textAnchor="end">{full ? `Radar · minutengenau bis ${fmtClock(seamMs)}` : 'Radar'}</text>
                  <text x={seamX + 5} y={pad.t + (full ? 10 : 7)} className="mv-seamlabel">{rucFull ? (full ? rucFull : rucMini) : (full ? `${series.fusionLabel} · Stundenmittel` : series.fusionLabel)}</text>
                </>
              ) : (
                <text x={seamX + 5} y={pad.t + (full ? 10 : 7)} className="mv-seamlabel">{rucFull ? (full ? `◂ Radar bis ${fmtClock(seamMs)} · ab hier ${rucFull}` : `◂ Radar · ${rucMini}`) : (full ? `◂ Radar bis ${fmtClock(seamMs)} · ab hier ${series.fusionLabel} als Stundenmittel` : `◂ Radar · ${series.fusionLabel}`)}</text>
              )}
            </g>
          )}
          {!series.radar && (
            <text x={pad.l + 2} y={pad.t + (full ? 10 : 7)} className="mv-seamlabel">{rucFull ? (full ? rucFull : rucMini) : <>{series.fusionLabel} · Stundenmittel{full ? ' (kein Radar-Nowcast am Ort)' : ''}</>}</text>
          )}
          {/* Phase RUC: second seam where the 5-min form ends and the hourly means carry on */}
          {ruc && rucEndVisible && full && (
            <g>
              <line x1={X(ruc.toMs)} x2={X(ruc.toMs)} y1={pad.t - 2} y2={yBase} className="mv-seam" />
              <text x={X(ruc.toMs) + 5} y={pad.t + 10} className="mv-seamlabel">{`◂ 5-min-Form bis ${fmtClock(ruc.toMs)} · ab hier ${series.fusionLabel} als Stundenmittel`}</text>
            </g>
          )}

          {/* now: line + pulsing point at the current value */}
          <line x1={pad.l} x2={pad.l} y1={pad.t - 2} y2={yBase} className="mv-now" />
          <text x={pad.l + 4} y={yBase - 4} className="mv-nowlabel">jetzt</text>
          {nowVal != null && (
            <g className="mv-nowpt">
              <circle cx={pad.l} cy={Y(nowVal)} r={5} className="mv-nowpt-halo" />
              <circle cx={pad.l} cy={Y(nowVal)} r={4} className="mv-nowpt-dot" />
            </g>
          )}

          {/* hover */}
          {hoverMs != null && hover && (
            <g className="mv-hover">
              <line x1={hoverX} x2={hoverX} y1={pad.t} y2={yBase} className="mv-cross" />
              <circle cx={hoverX} cy={Y(hover.mmH)} r={4.5} className="mv-dot" />
            </g>
          )}
          <rect x={pad.l} y={pad.t} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} style={{ cursor: 'crosshair', touchAction: 'pan-y' }} />
        </svg>
      )}
      {hoverMs != null && hover && (
        <div className="mv-tip" style={{ left: tipLeft, top: pad.t + 4 }} role="status">
          <div className="mv-tip-time">{fmtClock(hoverMs)}{full ? ` · ${fmtDay(hoverMs)}` : ''}</div>
          <div className="mv-tip-val">{fmtMmH(hover.mmH)} <span>· {intensityLabel(intensityBand(hover.mmH))}</span></div>
          <div className="mv-tip-src">
            {hover.source === 'radar' && series.radar
              ? `${series.radar.product} · Bild alle ${series.radar.frameStepMin} min, Minute interpoliert`
              : hover.source === 'ruc' && hover.step && ruc
                ? `${ruc.label} ${fmtClock(hover.step.fromMs)}–${fmtClock(hover.step.toMs)} · Stundensumme ${series.fusionLabel}${hover.bar?.pWet != null ? ` · Regenchance ${Math.round(hover.bar.pWet * 100)} %` : ''}${hover.step.kind === 'flat' ? ' · Stunde ohne Form (RUC trocken)' : ''}`
                : hover.bar
                  ? `${series.fusionLabel} · Stundenmittel ${fmtClock(hover.bar.fromMs)}–${fmtClock(hover.bar.toMs)}${hover.bar.pWet != null ? ` · Regenchance ${Math.round(hover.bar.pWet * 100)} %` : ''}`
                  : ''}
          </div>
        </div>
      )}
    </div>
  );
}
