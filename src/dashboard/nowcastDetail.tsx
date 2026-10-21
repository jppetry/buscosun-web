/**
 * Nowcast-Detailansicht (P54/P55) — Fenster über dem Dashboard in heller Optik. Zeigt den Regen von jetzt bis +3/6/12/24/48 h:
 * Radar (Messung + Vorausberechnung) bis zu seinem Horizont, danach buscosun Fusion. Zeichnet nur `NowcastDetailVM`.
 * Rahmen, Schließen-Symbol und Overlay teilen sich die Klassen `dbd-rose-*` mit der Windrose-Detailansicht.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Val } from './tiles';
import { Tip, useWidth } from './fusionTiles';
import { dayLabel, hhmm, num } from './format';
import { HEAVY_MMH, DRY_MMH } from './model/rules';
import { NOWCAST_DETAIL_RANGES, type NowcastDetailVM } from './model/types';

const H = 3_600_000;
const NB = ' ';
/** Abstand der x-Marken je Zeitraum in Minuten */
const TICK_MIN: Record<number, number> = { 1: 10, 2: 15, 3: 30, 6: 60, 12: 120, 24: 180, 48: 360 };
const STEEL = '#3A6FA8', HEAVY = '#9B8CE0', SNOW = '#9B8CE0', FUSION = '#8A9AA8';

interface Bar { t: number; w: number; mmh: number; src: 'radar' | 'fusion'; p90: number | null; pWet: number | null; pSnow: number | null }

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
  const bars = useMemo<Bar[]>(() => {
    const out: Bar[] = [];
    for (const r of vm.radar) if (r.t + slotMs > fromMs && r.t <= toMs) out.push({ t: r.t, w: slotMs, mmh: r.mmh, src: 'radar', p90: null, pWet: null, pSnow: null });
    for (const x of vm.hours) if ((vm.radarEndMs == null || x.t >= vm.radarEndMs + slotMs) && x.t <= toMs && x.t >= fromMs - H / 2) out.push({ t: x.t, w: H, mmh: x.mean ?? 0, src: 'fusion', p90: x.p90, pWet: x.pWet, pSnow: x.pSnow });
    return out;
  }, [vm.radar, vm.hours, vm.radarEndMs, slotMs, fromMs, toMs]);

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
  // Mitte des Balkens: Radar-Frames beginnen bei t, Fusion-Stundenwerte sind auf t zentriert (wie die Niederschlags-Kachel)
  const tMid = (b: Bar) => (b.src === 'radar' ? b.t + b.w / 2 : b.t);
  const cxOf = (b: Bar) => X(tMid(b));
  const hov = hoverT == null ? null : bars.reduce<Bar | null>((b, x) => (!b || Math.abs(tMid(x) - hoverT) < Math.abs(tMid(b) - hoverT) ? x : b), null);
  const cur = vm.ranges.find((r) => r.h === range);

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
          <div className="dbf-kpis dbd-nc-kpis">
            <div><span className="dbf-k">Summe bis +{range} h</span><b>{cur ? <Val v={cur.sum} /> : '—'}</b></div>
            <div><span className="dbf-k">Spitze</span><b>{cur ? <Val v={cur.peak} /> : '—'}</b></div>
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
                      const gap = Math.min(2, (b.w / (toMs - fromMs)) * plotW * 0.2);
                      const bw0 = Math.max(1.5, (b.w / (toMs - fromMs)) * plotW - gap);
                      const x00 = X(b.t) - (b.src === 'fusion' ? bw0 / 2 : 0);
                      // links an der Achse beschneiden (Stunde 0 beginnt vor „jetzt − 10 min")
                      const x0 = Math.max(padL, x00), bw = Math.max(1.5, bw0 - (x0 - x00));
                      const heavy = b.mmh >= HEAVY_MMH;
                      const snow = (b.pSnow ?? 0) >= 0.5;
                      const fill = b.src === 'radar' ? (heavy ? HEAVY : STEEL) : snow ? SNOW : FUSION;
                      const cx = x0 + bw / 2;
                      return (
                        <g key={`${b.src}${b.t}`}>
                          {b.mmh >= 0.02 && <rect x={x0} y={Y(b.mmh)} width={bw} height={Math.max(1, yBase - Y(b.mmh))} rx={Math.min(2, bw / 2)} fill={fill} fillOpacity={b.src === 'radar' ? (b.mmh < 0.5 ? 0.6 : 0.9) : 0.85} />}
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
                    <div className="dbf-tip-t">{dayLabel(hov.t)} {hhmm(hov.t)}{hov.src === 'radar' ? `–${hhmm(hov.t + hov.w)}` : ''} Uhr</div>
                    <div className="dbf-tip-v">{num(hov.mmh, 1)}{NB}mm/h{hov.p90 != null ? <span> · bis {num(hov.p90, 1)}{NB}mm/h (p90)</span> : null}</div>
                    <div className="dbf-tip-s">
                      {hov.src === 'radar' ? (hov.t <= vm.nowMs + 5 * 60_000 ? 'Radar · Messung' : 'Radar · Vorausberechnung') : 'buscosun Fusion'}
                      {hov.pWet != null ? ` · Regenchance ${Math.round(hov.pWet * 100)}${NB}%` : ''}{hov.pSnow != null && hov.pSnow >= 0.5 ? ` · Schnee ${Math.round(hov.pSnow * 100)}${NB}%` : ''}
                    </div>
                  </Tip>
                )}
              </div>
            )}

        <div className="dbf-legend dbd-nc-legend">
          <span><i className="dbd-nc-sw" style={{ background: STEEL }} />Radar (Messung + Vorausberechnung)</span>
          <span><i className="dbd-nc-sw" style={{ background: HEAVY }} />Radar, stark (≥ {num(HEAVY_MMH, 1)}{NB}mm/h)</span>
          <span><i className="dbd-nc-sw" style={{ background: FUSION }} />buscosun Fusion (Stundenmittel)</span>
          <span><i className="dbd-nc-sw" style={{ background: SNOW }} />Fusion, überwiegend Schnee</span>
          <span><i className="dbd-nc-sw dbd-nc-sw--line" />Spanne bis p90</span>
        </div>
        <ul className="dbd-rose-notes dbd-nc-notes">
          <li>Das Radar trägt den Regen bis zu seinem Horizont ({vm.horizon}); dahinter übernimmt buscosun Fusion. Die gestrichelte Linie „Radar-Horizont" markiert den Übergang, beide Quellen werden nie vermischt.</li>
          <li>Radar-Balken sind Regenraten je {vm.slotMin} Minuten, Fusion-Balken Stundenmittel. Werte unter {num(DRY_MMH, 1)}{NB}mm/h gelten als trocken.</li>
          <li>Summe und Spitze rechnen das Radar bis zu seinem Horizont und Fusion danach; die Summe ist daher keine einheitliche Prognose, sondern die Reihenfolge der beiden Quellen.</li>
        </ul>
        <div className="dbd-caption"><Val v={vm.caption} long /></div>
      </div>
    </div>
  );
}
