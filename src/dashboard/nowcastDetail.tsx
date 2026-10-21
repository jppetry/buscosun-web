/**
 * Nowcast-Detailansicht (P54/P55) — Fenster über dem Dashboard in heller Optik. Zeigt den Regen von jetzt bis +3/6/12/24/48 h:
 * Radar (Messung + Vorausberechnung) bis zu seinem Horizont, danach buscosun Fusion. Zeichnet nur `NowcastDetailVM`.
 * Rahmen, Schließen-Symbol und Overlay teilen sich die Klassen `dbd-rose-*` mit der Windrose-Detailansicht.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Val } from './tiles';
import { Tip, useWidth } from './fusionTiles';
import { dayLabel, hhmm, num } from './format';
import { DRY_MMH, RAIN_CLASSES, rainClass } from './model/rules';
import { NOWCAST_DETAIL_RANGES, type NowcastDetailVM } from './model/types';

const H = 3_600_000;
const NB = ' ';
/** Abstand der x-Marken je Zeitraum in Minuten */
const TICK_MIN: Record<number, number> = { 1: 10, 2: 15, 3: 30, 6: 60, 12: 120, 24: 180, 48: 360 };
const STEEL = '#3A6FA8', SNOW = '#9B8CE0', FUSION = '#8A9AA8';
/** Farbe je Intensitätsklasse (`RAIN_CLASSES`): trocken · Nieseln · leicht · mäßig · stark */
const CLASS_COL = ['#E8E2D0', '#BCD3E8', '#6FA3D0', '#3A6FA8', '#7B4FD0'];
const SRC_LABEL = { radar: 'Radar', fusion: 'buscosun Fusion', mixed: 'Radar + Fusion' } as const;
/** Dauer als „35 min" / „2 h 10 min" */
const dur = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

/** Ein Zeitabschnitt mit konstanter Rate. `native` = so liefert es die Quelle; sonst auf das 5-Minuten-Raster verteilt (gehalten). */
interface Bar { from: number; to: number; mmh: number; src: 'radar' | 'fusion'; native: boolean; hourT: number | null; p90: number | null; pWet: number | null; pSnow: number | null }
const FIVE = 5 * 60_000;

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

export function NowcastDetail({ vm, onClose }: { vm: NowcastDetailVM; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [range, setRange] = useState(3);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverT, setHoverT] = useState<number | null>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromMs = vm.nowMs - 10 * 60_000;
  const toMs = vm.nowMs + range * H;
  const slotMs = vm.slotMin * 60_000;
  // 5-Minuten-Raster: bis +12 h jeder Abschnitt in Fünfminutenzellen (Radar-Frames ≠ 5 min und Fusion-Stunden werden gehalten),
  // darüber wären die Zellen kleiner als ein Pixel — dort gilt das Raster der Quelle.
  const [grid5, setGrid5] = useState(true);
  const gridOn = grid5 && range <= 12;
  const bars = useMemo<Bar[]>(() => {
    const raw: Bar[] = [];
    for (const r of vm.radar) if (r.t + slotMs > fromMs && r.t <= toMs) raw.push({ from: Math.max(r.t, fromMs), to: r.t + slotMs, mmh: r.mmh, src: 'radar', native: true, hourT: null, p90: null, pWet: null, pSnow: null });
    const seam = vm.radarEndMs == null ? -Infinity : vm.radarEndMs + slotMs;
    for (const x of vm.hours) {
      if (x.t < seam || x.t > toMs || x.t < fromMs - H / 2) continue;
      raw.push({ from: Math.max(x.t - H / 2, seam, fromMs), to: x.t + H / 2, mmh: x.mean ?? 0, src: 'fusion', native: true, hourT: x.t, p90: x.p90, pWet: x.pWet, pSnow: x.pSnow });
    }
    if (!gridOn) return raw;
    const out: Bar[] = [];
    for (const b of raw) {
      const native5 = b.src === 'radar' && b.to - b.from === FIVE;
      for (let t0 = Math.floor(b.from / FIVE) * FIVE; t0 < b.to; t0 += FIVE) {
        const a = Math.max(t0, b.from), z = Math.min(t0 + FIVE, b.to, toMs);
        if (z <= a) continue;
        // eine Spanne (p90) je Stunde, an der Zelle der Stundenmitte — sonst überdecken Striche das Raster
        const mid = b.hourT != null && b.hourT >= a && b.hourT < z;
        out.push({ ...b, from: a, to: z, native: native5, p90: mid ? b.p90 : null });
      }
    }
    return out;
  }, [vm.radar, vm.hours, vm.radarEndMs, slotMs, fromMs, toMs, gridOn]);

  const h = 280, padL = 46, padR = 10, padT = 14, padB = 56;
  const plotW = Math.max(10, width - padL - padR), plotH = h - padT - padB, yBase = padT + plotH;
  const X = (t: number) => padL + ((t - fromMs) / (toMs - fromMs)) * plotW;
  const yMax = useMemo(() => {
    const m = Math.max(0.5, ...bars.map((b) => Math.max(b.mmh, b.p90 ?? 0)));
    return [0.5, 1, 2, 3, 5, 8, 12, 20, 30, 50].find((s) => m * 1.05 <= s) ?? Math.ceil(m * 1.1);
  }, [bars]);
  const Y = (v: number) => padT + plotH - (Math.min(v, yMax) / yMax) * plotH;
  const stepMs = (TICK_MIN[range] ?? 60) * 60_000;
  const ticks: number[] = [];
  for (let t = Math.ceil(fromMs / stepMs) * stepMs; t <= toMs; t += stepMs) ticks.push(t);
  const nowX = X(vm.nowMs);
  const seamX = vm.radarEndMs != null && bars.some((b) => b.src === 'fusion') ? X(vm.radarEndMs + slotMs) : null;
  const hasFusion = bars.some((b) => b.src === 'fusion');
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHoverT(fromMs + ((e.clientX - r.left) / r.width) * (toMs - fromMs));
  };
  const tMid = (b: Bar) => (b.from + b.to) / 2;
  const cxOf = (b: Bar) => X(tMid(b));
  const hov = hoverT == null ? null : bars.reduce<Bar | null>((b, x) => (!b || Math.abs(tMid(x) - hoverT) < Math.abs(tMid(b) - hoverT) ? x : b), null);
  const cur = vm.ranges.find((r) => r.h === range);
  /** Menge seit jetzt zum Zeitpunkt t (zwischen den Phasengrenzen linear: je Abschnitt konstante Rate). */
  const cumAt = (t: number): number => {
    const c = vm.cum;
    if (!c.length || t <= c[0].t) return 0;
    for (let i = 1; i < c.length; i++) if (t <= c[i].t) return c[i - 1].mm + ((c[i].mm - c[i - 1].mm) * (t - c[i - 1].t)) / (c[i].t - c[i - 1].t);
    return c[c.length - 1].mm;
  };
  const total = cumAt(toMs);
  const eps = vm.episodes.filter((e) => e.toMs > vm.nowMs && e.fromMs < toMs);
  const wetMs = eps.filter((e) => e.wet).reduce((a, e) => a + Math.min(e.toMs, toMs) - Math.max(e.fromMs, vm.nowMs), 0);
  const cumPts: Array<[number, number]> = vm.cum.length ? [...vm.cum.filter((p) => p.t <= toMs).map((p): [number, number] => [p.t, p.mm]), [toMs, total]] : [];
  const cumTop = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => s >= total * 1.08) ?? Math.ceil(total * 1.1);
  const cH = 118, cT = 10, cB = 22, cPlotH = cH - cT - cB, cBase = cT + cPlotH;
  const CY = (mm: number) => cT + (1 - Math.min(mm, cumTop) / cumTop) * cPlotH;
  const stripH = 30;
  const radarEdgeX = seamX ?? (vm.radarEndMs != null ? X(vm.radarEndMs + slotMs) : null);

  return (
    <div className="dbd-rose-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dbd-rose-dialog dbd-nc-dialog" role="dialog" aria-modal="true" aria-labelledby="dbd-nc-title">
        <div className="dbd-rose-dlg-head">
          <div>
            <span className="dbd-eyebrow" id="dbd-nc-title">NOWCAST · RADAR</span>
            <span className="dbd-rose-range" data-origin="P56">{vm.horizon}</span>
          </div>
          <button ref={closeBtn} type="button" className="dbd-rose-open" onClick={onClose} aria-label="Schließen" title="Schließen (Esc)"><CloseIcon /></button>
        </div>
        <div className="dbd-nc-headline"><Val v={vm.headline} long /></div>

        <div className="dbd-nc-bar">
          <div className="dbd-nc-seg" role="group" aria-label="Zeitraum">
            {NOWCAST_DETAIL_RANGES.map((r) => (
              <button key={r} type="button" className={r === range ? 'is-active' : undefined} aria-pressed={r === range} onClick={() => { setRange(r); setHoverT(null); }}>+{r}{NB}h</button>
            ))}
          </div>
          <div className="dbd-nc-seg" role="group" aria-label="Zeitraster">
            <button type="button" className={grid5 ? 'is-active' : undefined} aria-pressed={grid5} onClick={() => setGrid5(true)} title="Jeder Abschnitt in Fünfminutenzellen; Stundenwerte und gröbere Radarbilder werden auf 5 min verteilt (gehalten), nicht neu berechnet">5-min-Raster</button>
            <button type="button" className={!grid5 ? 'is-active' : undefined} aria-pressed={!grid5} onClick={() => setGrid5(false)} title="Das Raster der Quelle: Radar 5/15 min, Fusion stündlich">Quelle</button>
          </div>
          <div className="dbf-kpis dbd-nc-kpis">
            <div><span className="dbf-k">Summe bis +{range} h</span><b>{cur ? <Val v={cur.sum} /> : '—'}</b></div>
            <div><span className="dbf-k">Spitze</span><b>{cur ? <Val v={cur.peak} /> : '—'}</b></div>
            <div><span className="dbf-k">Regenzeit</span><b>{vm.state !== 'ok' ? '—' : wetMs > 0 ? dur(wetMs) : 'trocken'}</b></div>
          </div>
        </div>

        {vm.state === 'loading' ? <div className="dbd-empty dbd-loading" aria-busy="true">lädt …</div>
          : vm.state === 'none' ? <div className="dbd-empty">nicht verfügbar — weder Radar noch buscosun Fusion liefern Werte für diesen Ort</div>
            : (
              <div ref={ref} className="dbf-chart dbd-nc-chart" onPointerLeave={() => setHoverT(null)}>
                {width > 0 && (
                  <svg width={width} height={h} role="img" aria-label={`Niederschlag von jetzt bis ${range} Stunden voraus, Radar bis zu seinem Horizont, danach buscosun Fusion`}>
                    {[yMax / 2, yMax].map((v) => (
                      <g key={v}><line x1={padL} x2={padL + plotW} y1={Y(v)} y2={Y(v)} className="dbf-grid" /><text x={padL - 6} y={Y(v) + 3.5} className="dbd-nc-t" textAnchor="end">{num(v, v < 1 ? 1 : 0)}</text></g>
                    ))}
                    <text x={padL - 6} y={yBase + 3.5} className="dbd-nc-t" textAnchor="end">0</text>
                    <text transform={`translate(12 ${padT + plotH / 2}) rotate(-90)`} textAnchor="middle" className="dbd-nc-t dbd-nc-t--b">Regen in mm/h</text>
                    {bars.map((b) => {
                      const wFull = ((b.to - b.from) / (toMs - fromMs)) * plotW;
                      const gap = Math.min(2, wFull * 0.2);
                      const x0 = Math.max(padL, X(b.from)), bw = Math.max(1.2, wFull - gap);
                      const snow = (b.pSnow ?? 0) >= 0.5;
                      const fill = b.src === 'radar' ? CLASS_COL[Math.max(1, rainClass(b.mmh))] : snow ? SNOW : FUSION;
                      const cx = x0 + bw / 2;
                      return (
                        <g key={`${b.src}${b.from}`}>
                          {b.mmh >= 0.02 && <rect x={x0} y={Y(b.mmh)} width={bw} height={Math.max(1, yBase - Y(b.mmh))} rx={Math.min(2, bw / 2)} fill={fill} fillOpacity={b.src === 'radar' ? (b.native ? 0.95 : 0.7) : 0.85} />}
                          {b.p90 != null && b.p90 > b.mmh + 0.02 && <line x1={cx} x2={cx} y1={Y(b.p90)} y2={Y(b.mmh)} className="dbf-whisker" />}
                          {b.p90 != null && b.p90 > b.mmh + 0.02 && bw > 4 && <line x1={cx - bw / 3} x2={cx + bw / 3} y1={Y(b.p90)} y2={Y(b.p90)} className="dbf-whisker" />}
                          {b.pWet != null && <rect x={x0} y={yBase + 30} width={bw} height={6} rx={1} fill={STEEL} fillOpacity={0.1 + 0.85 * b.pWet} />}
                        </g>
                      );
                    })}
                    <line x1={padL} x2={padL + plotW} y1={yBase} y2={yBase} className="dbf-base" />
                    {ticks.map((t) => {
                      const x = X(t), mid = hhmm(t) === '00:00';
                      return (
                        <g key={t}>
                          <line x1={x} x2={x} y1={yBase} y2={yBase + 4} className="dbf-tick" />
                          <text x={x} y={yBase + 15} className="dbd-nc-t" textAnchor="middle">{hhmm(t)}</text>
                          {mid && <text x={x} y={yBase + 26} className="dbd-nc-t dbd-nc-t--b" textAnchor="middle">{dayLabel(t + 12 * H)}</text>}
                        </g>
                      );
                    })}
                    {hasFusion && <text x={padL} y={yBase + 45} className="dbf-striplabel">Regenchance je Stunde (buscosun Fusion)</text>}
                    {seamX != null && seamX < padL + plotW && (
                      <g>
                        <line x1={seamX} x2={seamX} y1={padT} y2={yBase} className="dbd-nc-seam" />
                        <text x={seamX + 5} y={padT + 9} className="dbd-nc-t dbd-nc-t--b">Radar-Horizont {hhmm(vm.radarEndMs! + slotMs)}</text>
                      </g>
                    )}
                    <line x1={nowX} x2={nowX} y1={padT} y2={yBase} className="dbd-nc-now" />
                    <text x={nowX + 5} y={padT + 9} className="dbd-nc-t dbd-nc-t--b" style={{ display: seamX != null && Math.abs(seamX - nowX) < 110 ? 'none' : undefined }}>jetzt {hhmm(vm.nowMs)}</text>
                    <text x={padL + plotW / 2} y={h - 2} className="dbd-nc-t dbd-nc-t--b" textAnchor="middle">Uhrzeit</text>
                    {hov && <line x1={cxOf(hov)} x2={cxOf(hov)} y1={padT} y2={yBase} className="dbf-cross" />}
                    <rect x={padL} y={padT} width={plotW} height={plotH + 40} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} style={{ cursor: 'crosshair', touchAction: 'pan-y' }} />
                  </svg>
                )}
                {hov && (
                  <Tip left={Math.max(0, Math.min(width - 210, cxOf(hov) - 105))} top={padT + 18}>
                    <div className="dbf-tip-t">{dayLabel(hov.from)} {hhmm(hov.from)}–{hhmm(hov.to)} Uhr</div>
                    <div className="dbf-tip-v">{num(hov.mmh, hov.mmh < 1 ? 2 : 1)}{NB}mm/h{hov.p90 != null ? <span> · bis {num(hov.p90, 1)}{NB}mm/h (p90)</span> : null}</div>
                    <div className="dbf-tip-s">
                      {RAIN_CLASSES[rainClass(hov.mmh)].label} · {hov.src === 'radar' ? (hov.from <= vm.nowMs + 5 * 60_000 ? 'Radar · Messung' : 'Radar · Vorausberechnung') : 'buscosun Fusion'} · seit jetzt {num(cumAt(hov.to), 1)}{NB}mm<br />
                      {hov.src === 'fusion' ? `Stundenmittel um ${hhmm(hov.hourT ?? hov.from)} Uhr${gridOn ? ', auf 5 min verteilt' : ''}` : hov.native ? 'Radarbild dieser 5 min' : `Radarbild über ${vm.slotMin}${NB}min, auf 5 min verteilt`}
                      {hov.pWet != null ? ` · Regenchance ${Math.round(hov.pWet * 100)}${NB}%` : ''}{hov.pSnow != null && hov.pSnow >= 0.5 ? ` · Schnee ${Math.round(hov.pSnow * 100)}${NB}%` : ''}
                    </div>
                  </Tip>
                )}

                {width > 0 && (
                  <>
                    <div className="dbd-nc-ph">Intensität im Zeitverlauf</div>
                    <svg width={width} height={stripH + 26} role="img" aria-label="Regenintensität je Zeitabschnitt">
                      {bars.map((b) => {
                        const x0 = Math.max(padL, X(b.from)), x1 = Math.min(padL + plotW, X(b.to));
                        if (x1 <= x0) return null;
                        return <rect key={`s${b.src}${b.from}`} x={x0} y={2} width={Math.max(0.8, x1 - x0 - (gridOn ? 0.4 : 0.6))} height={stripH - 4} rx={gridOn ? 1 : 2} fill={CLASS_COL[rainClass(b.mmh)]} fillOpacity={b.native || b.src === 'fusion' ? 1 : 0.7} />;
                      })}
                      <rect x={padL} y={2} width={plotW} height={stripH - 4} rx={3} fill="none" className="dbd-nc-stripframe" />
                      {nowX >= padL && nowX <= padL + plotW && <line x1={nowX} x2={nowX} y1={0} y2={stripH} className="dbd-nc-now" />}
                      {hoverT != null && <line x1={X(hoverT)} x2={X(hoverT)} y1={0} y2={stripH} className="dbf-cross" />}
                      {vm.radarEndMs != null && bars.some((b) => b.src === 'radar') && (
                        <text x={padL + ((radarEdgeX != null ? Math.min(radarEdgeX, padL + plotW) : padL + plotW) - padL) / 2} y={stripH + 14} textAnchor="middle" className="dbf-striplabel">Radar · alle {vm.slotMin} min</text>
                      )}
                      {hasFusion && radarEdgeX != null && radarEdgeX < padL + plotW - 60 && (
                        <text x={(radarEdgeX + padL + plotW) / 2} y={stripH + 14} textAnchor="middle" className="dbf-striplabel">buscosun Fusion · stündlich</text>
                      )}
                      {hasFusion && radarEdgeX == null && <text x={padL + plotW / 2} y={stripH + 14} textAnchor="middle" className="dbf-striplabel">buscosun Fusion · stündlich</text>}
                      <rect x={padL} y={0} width={plotW} height={stripH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} style={{ cursor: 'crosshair', touchAction: 'pan-y' }} />
                    </svg>

                    <div className="dbd-nc-ph">Aufsummierte Regenmenge seit jetzt{hoverT != null ? <b> · {hhmm(hoverT)} Uhr: {num(cumAt(hoverT), 1)}{NB}mm</b> : <b> · bis +{range}{NB}h: {num(total, 1)}{NB}mm</b>}</div>
                    <svg width={width} height={cH} role="img" aria-label={`Aufsummierte Regenmenge, insgesamt ${num(total, 1)} Millimeter bis ${range} Stunden voraus`}>
                      {[0, cumTop / 2, cumTop].map((v) => (
                        <g key={v}><line x1={padL} x2={padL + plotW} y1={CY(v)} y2={CY(v)} className="dbf-grid" /><text x={padL - 6} y={CY(v) + 3.5} className="dbd-nc-t" textAnchor="end">{num(v, v < 1 && v > 0 ? 1 : 0)}</text></g>
                      ))}
                      <text transform={`translate(12 ${cT + cPlotH / 2}) rotate(-90)`} textAnchor="middle" className="dbd-nc-t dbd-nc-t--b">Summe in mm</text>
                      {cumPts.length > 1 && (
                        <>
                          <path d={`M${X(cumPts[0][0]).toFixed(1)} ${cBase}${cumPts.map((p) => `L${X(p[0]).toFixed(1)} ${CY(p[1]).toFixed(1)}`).join('')}L${X(cumPts[cumPts.length - 1][0]).toFixed(1)} ${cBase}Z`} fill={STEEL} fillOpacity=".14" />
                          <path d={`M${cumPts.map((p) => `${X(p[0]).toFixed(1)} ${CY(p[1]).toFixed(1)}`).join('L')}`} fill="none" stroke={STEEL} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
                        </>
                      )}
                      {radarEdgeX != null && radarEdgeX < padL + plotW && hasFusion && <line x1={radarEdgeX} x2={radarEdgeX} y1={cT} y2={cBase} className="dbd-nc-seam" />}
                      {nowX >= padL && nowX <= padL + plotW && <line x1={nowX} x2={nowX} y1={cT} y2={cBase} className="dbd-nc-now" />}
                      <line x1={padL} x2={padL + plotW} y1={cBase} y2={cBase} className="dbf-base" />
                      {ticks.map((t) => <g key={t}><line x1={X(t)} x2={X(t)} y1={cBase} y2={cBase + 4} className="dbf-tick" /><text x={X(t)} y={cBase + 15} className="dbd-nc-t" textAnchor="middle">{hhmm(t)}</text></g>)}
                      {hoverT != null && <><line x1={X(hoverT)} x2={X(hoverT)} y1={cT} y2={cBase} className="dbf-cross" /><circle cx={X(hoverT)} cy={CY(cumAt(hoverT))} r="4.5" fill="#fff" stroke={STEEL} strokeWidth="2.4" /></>}
                      <rect x={padL} y={cT} width={plotW} height={cPlotH + 18} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} style={{ cursor: 'crosshair', touchAction: 'pan-y' }} />
                    </svg>
                  </>
                )}
              </div>
            )}

        {vm.state === 'ok' && (
          <section className="dbd-nc-eps" aria-label="Regen- und Trockenphasen">
            <div className="dbd-nc-ph">Regen- und Trockenphasen bis +{range}{NB}h</div>
            {eps.length === 0 ? <div className="dbd-empty">keine Zeitreihe verfügbar</div> : (
              <ol>
                {eps.slice(0, 14).map((e) => {
                  const a = Math.max(e.fromMs, vm.nowMs), z = Math.min(e.toMs, toMs);
                  return (
                    <li key={e.fromMs} className={e.wet ? 'is-wet' : 'is-dry'}>
                      <span className="dbd-nc-ep-t">{a <= vm.nowMs + 60_000 ? 'jetzt' : hhmm(a)}–{hhmm(z)}{e.toMs > toMs ? '…' : ''}</span>
                      <span className="dbd-nc-ep-bar"><i style={{ left: `${((a - vm.nowMs) / (toMs - vm.nowMs)) * 100}%`, width: `${Math.max(1.5, ((z - a) / (toMs - vm.nowMs)) * 100)}%`, background: CLASS_COL[e.wet ? e.cls : 0] }} /></span>
                      <span className="dbd-nc-ep-l">
                        <b>{e.wet ? `Regen · ${RAIN_CLASSES[e.cls].label}` : 'Trocken'}</b> · {dur(z - a)}
                      </span>
                      <span className="dbd-nc-ep-v">{e.wet ? `${num(e.mm, e.mm < 1 ? 2 : 1)}${NB}mm · max ${num(e.peakMmh, e.peakMmh < 1 ? 2 : 1)}${NB}mm/h ${hhmm(e.peakAtMs)}` : ''}</span>
                      <span className="dbd-nc-ep-s">{SRC_LABEL[e.src]}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            {eps.length > 14 && <div className="dbd-nc-more">+ {eps.length - 14} weitere Phasen im längeren Zeitraum</div>}
          </section>
        )}

        <div className="dbf-legend dbd-nc-legend">
          {RAIN_CLASSES.map((k, i) => (
            <span key={k.label}><i className="dbd-nc-sw" style={{ background: CLASS_COL[i] }} />{k.label}{i ? ` ≥ ${num(k.min, k.min < 1 ? 1 : 0)}${NB}mm/h` : ''}</span>
          ))}
          <span><i className="dbd-nc-sw" style={{ background: FUSION }} />buscosun Fusion (Balken in Grau)</span>
          <span><i className="dbd-nc-sw" style={{ background: SNOW }} />Fusion, überwiegend Schnee</span>
          <span><i className="dbd-nc-sw dbd-nc-sw--line" />Spanne bis p90</span>
        </div>
        <ul className="dbd-rose-notes dbd-nc-notes">
          <li>Das Radar trägt den Regen bis zu seinem Horizont ({vm.horizon}); dahinter übernimmt buscosun Fusion. Die gestrichelte Linie „Radar-Horizont" markiert den Übergang, beide Quellen werden nie vermischt.</li>
          <li>Radar-Balken sind Regenraten je {vm.slotMin} Minuten, Fusion-Balken Stundenmittel; die Farbe der Radar-Balken und der Intensitätsleiste folgt der Klasse (Nieseln, leicht, mäßig, stark). Werte unter {num(DRY_MMH, 1)}{NB}mm/h gelten als trocken.</li>
          <li>Im 5-Minuten-Raster (bis +12 h) steht jeder Abschnitt in Fünfminutenzellen. Radarbilder im 5-Minuten-Takt sind echte Einzelwerte; Fusion-Stundenmittel{vm.slotMin !== 5 ? ` und die ${vm.slotMin}-Minuten-Bilder dieser Quelle` : ''} sind auf ihre Zellen verteilt (gehalten, blasser gezeichnet), nicht auf Minuten neu berechnet. Ab +24 h gilt das Raster der Quelle.</li>
          <li>Die Summenlinie und die Phasenliste nehmen je Abschnitt die Rate des Radars bzw. des Fusion-Stundenmittels als konstant an; Phasen sind zusammenhängende Abschnitte mit bzw. ohne messbaren Regen.</li>
          <li>Summe und Spitze rechnen das Radar bis zu seinem Horizont und Fusion danach; die Summe ist daher keine einheitliche Prognose, sondern die Reihenfolge der beiden Quellen.</li>
        </ul>
        <div className="dbd-caption"><Val v={vm.caption} long /></div>
      </div>
    </div>
  );
}
