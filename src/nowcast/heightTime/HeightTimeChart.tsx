/**
 * Phase HZS (`audit/hoehen-zeit-schnitt.md`): the height-time section at the chosen point — flat SVG, no WebGL.
 *
 * x = time (48 h | 14 days), y = 0 … 4 000 m. Layers bottom-up: terrain within 10 km as horizontal layers
 * (valley/ridge, E-HZS-2), gaps of the snowfall line hatched, snowfall band p10–p90 + most likely line (buscosun
 * Fusion), freezing level dashed (derived from the cube's pressure levels, E-HZS-4), place height, slider time.
 * On top a strip of precipitation columns per native step coloured by phase. The sentence "Schnee bis zu dir ab …"
 * sits at the crossing with the place height (E-HZS-6). Hover/tap/arrow keys show the values of the hour.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';import { phaseColor } from '../nowcastModel';
import type { HeightTimeData } from './useHeightTime';
import {
  buildHeightTime, infoAt, snowRuns, srText, dayClock, dayShortDate, clockHM, fmtM, fmtMmH, phaseWord,
  HZS_RANGES, type HzsRangeH, type HeightTimeModel, type FreezePoint,
} from './heightTimeModel';
import './heightTime.css';

const H = 3_600_000;
const RANGE_KEY = 'buscosun.regenradar.hzs.range.v1';
function loadRange(): HzsRangeH {
  try { const v = Number(localStorage.getItem(RANGE_KEY)); if (v === 48 || v === 336) return v; } catch { /* ohne Speicher */ }
  return 48;
}

const C = {
  band: 'rgba(58,111,168,0.16)',
  line: '#3A6FA8',
  freeze: '#8A8478',
  ink: '#2C2A26',
  valley: '#CFC8B8',
  ridge: '#E4DECF',
  ridgeEdge: '#B7AE9B',
  grid: '#E0D6BE',
  muted: '#8B7355',
  unknownPhase: '#B8AE98',
  slider: '#C97B47',
};

interface Props {
  data: HeightTimeData;
  place: string;
  /** Time of the radar slider (moves the vertical line); `null` = now. */
  sliderMs: number | null;
  variant: 'desktop' | 'mobile';
}

export default function HeightTimeChart({ data, place, sliderMs, variant }: Props) {
  const [range, setRange] = useState<HzsRangeH>(loadRange);
  useEffect(() => { try { localStorage.setItem(RANGE_KEY, String(range)); } catch { /* ohne Speicher */ } }, [range]);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => { const w = Math.round(es[0].contentRect.width); if (w > 0) setWidth(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The window starts at the current full hour; rebuilt on the hour.
  const [hourMs, setHourMs] = useState(() => Math.floor(Date.now() / H) * H);
  useEffect(() => {
    const t = setInterval(() => { const h = Math.floor(Date.now() / H) * H; setHourMs((p) => (p === h ? p : h)); }, 60_000);
    return () => clearInterval(t);
  }, []);
  const model = useMemo(() => (data.v2 ? buildHeightTime({ v2: data.v2, cells: data.cells, terrain: data.terrain, nowMs: hourMs, rangeH: range, exceed: data.exceed }) : null), [data.v2, data.cells, data.terrain, data.exceed, hourMs, range]);
  const srId = useId();

  return (
    <section className={`hzs hzs--${variant}`} aria-label="Höhen-Zeit-Schnitt">
      <div className="hzs-head">
        <div className="hzs-title">
          <span className="hzs-eyebrow">Höhen-Zeit-Schnitt · {place}</span>
          <span className="hzs-sub">Wann kommt der Schnee bis zu deiner Höhe?</span>
        </div>
        <div className="hzs-seg" role="tablist" aria-label="Zeitraum">
          {HZS_RANGES.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={range === r} className={range === r ? 'is-active' : ''} onClick={() => setRange(r)}>
              {r === 48 ? '48 h' : '14 Tage'}
            </button>
          ))}
        </div>
      </div>
      {model && (isQuiet(model) || variant === 'mobile') && (
        <p className="hzs-caption">{model.sentence.text} <span className="hzs-sentence-src">{data.fusionName}</span></p>
      )}
      <div className="hzs-plot" ref={wrapRef}>
        {data.status === 'loading' && !model && <div className="hzs-state"><span className="ev-spinner" /> buscosun Fusion rechnet die Höhen …</div>}
        {data.status === 'gap' && <div className="hzs-state hzs-state--gap">Lücke: {data.reason ?? 'buscosun Fusion nicht verfügbar'}</div>}
        {model && <Plot model={model} width={width} variant={variant} sliderMs={sliderMs} fusionName={data.fusionName} srId={srId} terrainStatus={data.terrainStatus} />}
      </div>
      {model && <Legend />}
      {model && (
        <p className="hzs-foot">
          Schneefallgrenze, Spanne, Niederschlag, Phase: {data.fusionName} am Ort{data.pending ? ' · weitere Stufen folgen …' : ''} · Nullgradgrenze aus T 925/850/700 hPa des Cubes abgeleitet ·
          Gelände {model.terrain ? `Terrarium z${model.terrain.zoom}, ${model.terrain.radiusKm} km` : data.terrainStatus === 'loading' ? 'lädt …' : 'nicht verfügbar'}
        </p>
      )}
      {model && <p className="hzs-sr" id={srId}>{srText(model, place, data.fusionName)}</p>}
    </section>
  );
}

const isQuiet = (m: HeightTimeModel) => m.sentence.kind === 'stays-above' || m.sentence.kind === 'no-data' || m.sentence.kind === 'no-height';

function Legend() {
  return (
    <ul className="hzs-legend" aria-hidden="true">
      <li><span className="hzs-sw hzs-sw--band" />Schneefallgrenze (Spanne + wahrscheinlichste)</li>
      <li><span className="hzs-sw hzs-sw--freeze" />Nullgradgrenze</li>
      <li><span className="hzs-sw hzs-sw--place" />Ortshöhe</li>
      <li><span className="hzs-sw hzs-sw--terrain" />Gelände 10 km</li>
      <li><span className="hzs-sw" style={{ background: phaseColor('rain') }} />Regen</li>
      <li><span className="hzs-sw" style={{ background: phaseColor('sleet') }} />Schneeregen</li>
      <li><span className="hzs-sw" style={{ background: phaseColor('snow') }} />Schnee</li>
      <li><span className="hzs-sw hzs-sw--gap" />Lücke</li>
    </ul>
  );
}

function Plot({ model: m, width, variant, sliderMs, fusionName, srId, terrainStatus }: {
  model: HeightTimeModel; width: number; variant: 'desktop' | 'mobile'; sliderMs: number | null; fusionName: string; srId: string;
  terrainStatus: HeightTimeData['terrainStatus'];
}) {
  const hatchId = `hzs-hatch-${useId().replace(/:/g, '')}`;
  const mobile = variant === 'mobile';
  const PAD_L = mobile ? 34 : 42, PAD_R = mobile ? 62 : 66, COL_H = mobile ? 34 : 40, GAP = 8, PH = mobile ? 230 : 210, AX = 22, TOP = 6;
  const W = Math.max(120, width - PAD_L - PAD_R);
  const plotTop = TOP + COL_H + GAP, plotBot = plotTop + PH;
  const svgH = plotBot + AX;
  const x = (t: number) => PAD_L + ((t - m.fromMs) / (m.toMs - m.fromMs)) * W;
  const y = (h: number) => plotBot - (Math.max(0, Math.min(m.yMaxM, h)) / m.yMaxM) * PH;
  const colScale = niceMax(m.maxMmH);
  const yc = (mmh: number) => TOP + COL_H - (Math.min(colScale, mmh) / colScale) * COL_H;
  const stepH = m.rangeH === 48 ? 1 : 6;

  const [hover, setHover] = useState<number | null>(null);
  const tOf = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * (PAD_L + W + PAD_R);
    const t = m.fromMs + ((px - PAD_L) / W) * (m.toMs - m.fromMs);
    return Math.max(m.fromMs, Math.min(m.toMs - 1, t));
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => setHover(tOf(e.clientX, e.currentTarget));
  const onLeave = (e: RPointerEvent<SVGSVGElement>) => { if (e.pointerType === 'mouse') setHover(null); };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'Escape') { setHover(null); return; }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const base = hover ?? Math.max(m.fromMs, Math.min(m.toMs - 1, sliderMs ?? Date.now()));
    const next = base + (e.key === 'ArrowRight' ? 1 : -1) * stepH * H;
    setHover(Math.max(m.fromMs, Math.min(m.toMs - 1, Math.floor(next / H) * H + 1)));
  };

  // Ticks: every 6 h (48 h) or every day (14 days); day boundaries in local time.
  const ticks = useMemo(() => {
    const out: Array<{ t: number; label: string | null; day: boolean }> = [];
    const dayPx = (24 * H / (m.toMs - m.fromMs)) * W;
    const stride = m.rangeH === 48 ? 1 : dayPx >= 46 ? 1 : dayPx >= 23 ? 2 : 3;
    let dayN = 0;
    for (let t = m.fromMs; t <= m.toMs; t += H) {
      const hh = Number(clockHM(t).slice(0, 2));
      if (hh === 0) { out.push({ t, label: dayN % stride === 0 ? dayShortDate(t) : null, day: true }); dayN++; }
      else if (m.rangeH === 48 && (mobile ? hh === 12 : hh % 6 === 0)) out.push({ t, label: clockHM(t), day: false });
    }
    return out;
  }, [m.fromMs, m.toMs, m.rangeH, W, mobile]);

  const lineMs = sliderMs ?? Date.now();
  const showSlider = lineMs >= m.fromMs && lineMs <= m.toMs;
  const info = hover != null ? infoAt(m, hover) : null;
  const s = m.sentence;
  const crossMs = s.kind === 'reaches' || s.kind === 'already' || s.kind === 'possible' ? s.atMs : null;
  const bandSpan = s.kind === 'reaches' && s.band === 'full' && s.earlyMs != null && s.lateMs != null ? [s.earlyMs, s.lateMs] as const : null;
  const yLevels = Array.from({ length: m.yMaxM / 1000 + 1 }, (_, i) => i * 1000);

  // Sentence box: at the crossing (HTML overlay, wraps), otherwise top left of the plot.
  const svgW = PAD_L + W + PAD_R;
  // Desktop: the box sits at the top of the plot beside the crossing, a dotted leader drops to the marker — the
  // crossing itself stays visible.
  const boxW = Math.min(260, W - 8);
  const anchorX = crossMs != null ? x(crossMs) : PAD_L + 6;
  const boxLeft = Math.max(PAD_L + 4, Math.min(PAD_L + W - boxW - 4, anchorX > PAD_L + W / 2 ? anchorX - boxW - 10 : anchorX + 10));
  const placeY = m.hTrue != null ? y(m.hTrue) : plotTop + 20;
  const boxTop = plotTop + 4;

  return (
    <div className="hzs-plotwrap" style={{ height: svgH }}>
      <svg className="hzs-svg" width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}
        tabIndex={0} role="group" aria-label="Höhen-Zeit-Schnitt, Pfeiltasten wählen die Stunde" aria-describedby={srId}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={onLeave} onKeyDown={onKey} onBlur={() => setHover(null)}>
        <defs>
          <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#B9AE95" strokeWidth="1.2" strokeOpacity="0.55" />
          </pattern>
        </defs>

        {/* Column strip */}
        <rect x={PAD_L} y={TOP} width={W} height={COL_H} fill="var(--sand-50, #F5F1E8)" />
        {m.columns.map((c, i) => {
          if (c.mmh == null) return <rect key={i} x={x(c.fromMs)} y={TOP} width={Math.max(0.5, x(c.toMs) - x(c.fromMs))} height={COL_H} fill={`url(#${hatchId})`} />;
          if (c.mmh < 0.02) return null;
          const x0 = x(c.fromMs), x1 = x(c.toMs), w = x1 - x0;
          const bw = Math.max(1, w * 0.62);
          return <rect key={i} x={x0 + (w - bw) / 2} y={yc(c.mmh)} width={bw} height={TOP + COL_H - yc(c.mmh)} rx={Math.min(1.5, bw / 3)} fill={c.phase ? phaseColor(c.phase) : C.unknownPhase} />;
        })}
        <text x={PAD_L - 6} y={TOP + 9} className="hzs-axis" textAnchor="end">{fmtNum(colScale)}</text>
        <text x={PAD_L - 6} y={TOP + 21} className="hzs-axis" textAnchor="end">mm/h</text>

        {/* Height plot */}
        <rect x={PAD_L} y={plotTop} width={W} height={PH} fill="var(--cream-50, #FAF6EA)" />
        {yLevels.map((h) => (
          <g key={h}>
            <line x1={PAD_L} x2={PAD_L + W} y1={y(h)} y2={y(h)} stroke={C.grid} strokeWidth={h === 0 ? 1 : 0.8} />
            <text x={PAD_L - 6} y={y(h) + 3.5} className="hzs-axis" textAnchor="end">{h === 0 ? '0' : fmtM(h)}</text>
          </g>
        ))}
        {/* Terrain within 10 km: valley block + valley…ridge layer */}
        {m.terrain && (
          <g aria-hidden="true">
            <rect x={PAD_L} y={y(m.terrain.minM)} width={W} height={plotBot - y(m.terrain.minM)} fill={C.valley} />
            <rect x={PAD_L} y={y(m.terrain.maxM)} width={W} height={Math.max(0, y(m.terrain.minM) - y(m.terrain.maxM))} fill={C.ridge} />
            <line x1={PAD_L} x2={PAD_L + W} y1={y(m.terrain.maxM)} y2={y(m.terrain.maxM)} stroke={C.ridgeEdge} strokeWidth={1} />
            <line x1={PAD_L} x2={PAD_L + W} y1={y(m.terrain.p50M)} y2={y(m.terrain.p50M)} stroke={C.ridgeEdge} strokeWidth={0.8} strokeDasharray="1 3" />
            {y(m.terrain.minM) - y(m.terrain.maxM) > 26 ? (
              <>
                <text x={PAD_L + W - 6} y={y(m.terrain.maxM) + 12} className="hzs-terr" textAnchor="end">Grat {fmtM(m.terrain.maxM)} m</text>
                <text x={PAD_L + W - 6} y={y(m.terrain.minM) - 5} className="hzs-terr" textAnchor="end">Tal {fmtM(m.terrain.minM)} m</text>
              </>
            ) : (
              <text x={PAD_L + W - 6} y={y(m.terrain.maxM) - 4} className="hzs-terr" textAnchor="end">Tal–Grat {fmtM(m.terrain.minM)}–{fmtM(m.terrain.maxM)} m</text>
            )}
          </g>
        )}
        {!m.terrain && terrainStatus === 'gap' && <text x={PAD_L + 6} y={plotBot - 6} className="hzs-terr">Gelände nicht verfügbar</text>}

        {/* Day boundaries */}
        {ticks.filter((t) => t.day).map((t) => <line key={t.t} x1={x(t.t)} x2={x(t.t)} y1={TOP} y2={plotBot} stroke={C.grid} strokeWidth={1} />)}

        {/* Gaps of the snowfall line */}
        {m.snowGaps.map(([a, b]) => <rect key={a} x={x(a)} y={plotTop} width={x(b) - x(a)} height={PH} fill={`url(#${hatchId})`} />)}
        {(() => {
          const g = [...m.snowGaps].sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
          if (!g || x(g[1]) - x(g[0]) < 90) return null;
          return <text x={(x(g[0]) + x(g[1])) / 2} y={plotTop + 14} className="hzs-gaplabel" textAnchor="middle">keine Schneefallgrenze von buscosun Fusion</text>;
        })()}

        {/* Snowfall band + most likely line */}
        {snowRuns(m.snow, 'band').map((run, i) => {
          if (run.length === 1) { const p = run[0]; return <rect key={i} x={x(p.tMs) - 2} y={y(p.p90 as number)} width={4} height={y(p.p10 as number) - y(p.p90 as number)} fill={C.band} />; }
          const top = run.map((p) => `${x(p.tMs)},${y(p.p90 as number)}`).join(' ');
          const bot = [...run].reverse().map((p) => `${x(p.tMs)},${y(p.p10 as number)}`).join(' ');
          return <polygon key={i} points={`${top} ${bot}`} fill={C.band} />;
        })}
        {snowRuns(m.snow).map((run, i) => run.length === 1
          ? <circle key={i} cx={x(run[0].tMs)} cy={y(run[0].p50 as number)} r={2.4} fill={C.line} />
          : <polyline key={i} points={run.map((p) => `${x(p.tMs)},${y(p.p50 as number)}`).join(' ')} fill="none" stroke={C.line} strokeWidth={1.9} strokeLinejoin="round" />)}

        {/* Freezing level (dashed), "above" as ticks under the label */}
        {freezeRuns(m.freeze).map((run, i) => run.length === 1
          ? <circle key={i} cx={x(run[0].tMs)} cy={y(run[0].m as number)} r={1.8} fill={C.freeze} />
          : <polyline key={i} points={run.map((f) => `${x(f.tMs)},${y(f.m as number)}`).join(' ')} fill="none" stroke={C.freeze} strokeWidth={1.4} strokeDasharray="5 4" />)}
        {aboveRuns(m.freeze).map((run, i) => (
          <polyline key={`a${i}`} points={run.map((f) => `${x(f.tMs)},${y(f.m as number)}`).join(' ')} fill="none" stroke={C.freeze} strokeOpacity={0.55} strokeWidth={1.2} strokeDasharray="1 3" strokeLinecap="round" />
        ))}
        {(() => {
          const a = m.freeze.find((f) => f.state === 'above' && f.m != null);
          return a ? <text x={Math.min(PAD_L + W - 4, x(a.tMs) + 6)} y={y(a.m as number) - 5} className="hzs-freezelabel" textAnchor={x(a.tMs) + 120 > PAD_L + W ? 'end' : 'start'}>↑ 0 °C über ≈ {fmtM(Math.round((a.m as number) / 100) * 100)} m</text> : null;
        })()}

        {/* Place height */}
        {m.hTrue != null && (
          <g>
            {bandSpan && <line x1={x(bandSpan[0])} x2={x(bandSpan[1])} y1={y(m.hTrue)} y2={y(m.hTrue)} stroke={C.line} strokeOpacity={0.35} strokeWidth={6} strokeLinecap="round" />}
            <line x1={PAD_L} x2={PAD_L + W} y1={y(m.hTrue)} y2={y(m.hTrue)} stroke={C.ink} strokeWidth={1} />
            <text x={PAD_L + W + 6} y={y(m.hTrue) + 3.5} className="hzs-place">Ort {fmtM(m.hTrue)} m</text>
            {crossMs != null && !mobile && <line x1={x(crossMs)} x2={x(crossMs)} y1={plotTop + 4} y2={placeY - 4} stroke={C.line} strokeWidth={1} strokeDasharray="1.5 2.5" />}
            {crossMs != null && <circle cx={x(crossMs)} cy={y(m.hTrue)} r={3.6} fill="#FAF6EA" stroke={C.line} strokeWidth={1.8} />}
            {crossMs != null && mobile && (
              <text x={Math.min(PAD_L + W - 4, Math.max(PAD_L + 4, x(crossMs)))} y={y(m.hTrue) - 8} className="hzs-crosstag"
                textAnchor={x(crossMs) > PAD_L + W - 60 ? 'end' : x(crossMs) < PAD_L + 60 ? 'start' : 'middle'}>
                {s.kind === 'already' ? 'jetzt' : `ab ${dayClock(crossMs)}`}
              </text>
            )}
          </g>
        )}

        {/* Time axis */}
        {ticks.map((t) => t.label && (
          <text key={`l${t.t}`} x={m.rangeH === 336 ? x(t.t) + 3 : x(t.t)} y={plotBot + 15} className={`hzs-axis${t.day ? ' hzs-axis--day' : ''}`} textAnchor={m.rangeH === 336 ? 'start' : 'middle'}>
            {t.label}
          </text>
        ))}

        {/* Slider time */}
        {showSlider && (
          <g pointerEvents="none">
            <line x1={x(lineMs)} x2={x(lineMs)} y1={TOP} y2={plotBot} stroke={C.slider} strokeWidth={1.5} />
            <rect x={x(lineMs) - 19} y={plotBot + 3} width={38} height={15} rx={3} fill={C.slider} />
            <text x={x(lineMs)} y={plotBot + 14} className="hzs-slidertag" textAnchor="middle">{clockHM(lineMs)}</text>
          </g>
        )}

        {/* Hover line */}
        {info && <line x1={x(info.tMs)} x2={x(info.tMs)} y1={TOP} y2={plotBot} stroke={C.ink} strokeOpacity={0.35} strokeWidth={1} pointerEvents="none" />}
      </svg>

      {/* Sentence at the crossing (without a crossing it stands as the caption above the plot) */}
      {crossMs != null && !mobile && (
        <div className="hzs-sentence" style={{ left: boxLeft, top: boxTop, width: boxW }}>
          <span className="hzs-sentence-text">{s.text}</span>
          <span className="hzs-sentence-src">{fusionName}</span>
        </div>
      )}

      {info && <Tooltip info={info} m={m} left={x(info.tMs)} plotTop={plotTop} svgW={svgW} />}
    </div>
  );
}

function Tooltip({ info, m, left, plotTop, svgW }: { info: ReturnType<typeof infoAt>; m: HeightTimeModel; left: number; plotTop: number; svgW: number }) {
  const W = 210;
  const l = Math.max(4, Math.min(svgW - W - 4, left + 10));
  const sn = info.snow, c = info.column, f = info.freeze;
  const at = sn?.tMs ?? c?.stepToMs ?? Math.ceil(info.tMs / H) * H;
  const stepH = c ? Math.round((c.stepToMs - c.stepFromMs) / H) : 1;
  return (
    <div className="hzs-tip" style={{ left: l, top: plotTop + 4, width: W }} role="status" aria-live="polite">
      <div className="hzs-tip-head">{dayClock(at)}{stepH > 1 ? ` · Schritt ${stepH} h` : ''}</div>
      <div className="hzs-tip-row"><span>Schneefallgrenze</span><b>{sn?.p50 != null ? `${fmtM(sn.p50)} m` : 'Lücke'}</b></div>
      <div className="hzs-tip-row"><span>Spanne</span><b>{sn?.p10 != null && sn.p90 != null ? `${fmtM(sn.p10)}–${fmtM(sn.p90)} m` : sn?.p50 != null ? 'ohne Spanne' : '—'}</b></div>
      <div className="hzs-tip-row"><span>Niederschlag</span><b>{c?.mmh != null ? fmtMmH(c.mmh) : 'Lücke'}</b></div>
      <div className="hzs-tip-row"><span>Phase</span><b>{c?.mmh != null && c.mmh >= 0.02 ? `${phaseWord(c.phase)}${c.pSnow != null ? ` (Schnee ${Math.round(c.pSnow * 100)} %)` : ''}` : c?.mmh != null ? 'trocken' : '—'}</b></div>
      <div className="hzs-tip-row"><span>Nullgradgrenze</span><b>{freezeWord(f)}</b></div>
      {m.hTrue != null && sn?.p50 != null && <div className="hzs-tip-foot">{sn.p50 <= m.hTrue ? 'Grenze auf oder unter deiner Höhe' : `${fmtM(sn.p50 - m.hTrue)} m über dir`}</div>}
    </div>
  );
}

function freezeWord(f: FreezePoint | null): string {
  if (!f) return '—';
  if (f.state === 'ok' && f.m != null) return `${fmtM(Math.round(f.m / 10) * 10)} m`;
  if (f.state === 'ground') return 'am Boden';
  if (f.state === 'above' && f.m != null) return `über ≈ ${fmtM(Math.round(f.m / 100) * 100)} m`;
  return 'Lücke';
}

/** Runs of consecutive native points where the freezing level lies above the highest pressure level (no data there). */
function aboveRuns(fs: readonly FreezePoint[]): FreezePoint[][] {
  const runs: FreezePoint[][] = [];
  let cur: FreezePoint[] = [];
  for (const f of fs) {
    if (f.state === 'above' && f.m != null) cur.push(f);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** Runs of consecutive native freezing-level points with a height (ok or ground). */
function freezeRuns(fs: readonly FreezePoint[]): FreezePoint[][] {
  const runs: FreezePoint[][] = [];
  let cur: FreezePoint[] = [];
  for (const f of fs) {
    if ((f.state === 'ok' || f.state === 'ground') && f.m != null) cur.push(f);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

function niceMax(x: number): number {
  for (const n of [1, 2, 3, 5, 8, 10, 15, 20, 30, 50]) if (x <= n) return n;
  return Math.ceil(x / 10) * 10;
}
const fmtNum = (x: number) => String(x).replace('.', ',');
