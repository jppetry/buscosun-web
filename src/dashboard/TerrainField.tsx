/**
 * Terrain-Feld (Phase DB): Geländeschnitt durch den Ort in Windrichtung, Temperatur nach Höhe aus EINEM Gradienten
 * (γ aus dem Modellprofil des Cube, E-DB-11), Isothermen, Schneefallgrenze, Stationen des Katalogs im Schnitt,
 * Tabelle je Höhenstufe, Ablesung. Koordinatensystem der Vorlage: viewBox 900×340, Höhenachse x = 58, Raster
 * y 10 … 282. Wind je Höhenniveau ist nicht verfügbar (kein Höhenwind im Punkt-Cube) — es werden KEINE Pfeile gezeichnet.
 *
 * Jan 17.10.: dazu die Inversionsschicht und die Spanne der Schneefallgrenze im Schnitt, der Kasten „Gelände am Punkt"
 * (P97: Lage, Neigung und Exposition, Himmelssicht, Kaltluftmulde, Oberfläche, Gewässernähe) und „Schichtung"
 * (P16/P98: Temperatur und Feuchte je Druckfläche).
 */
import { lazy, Suspense, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Val } from './tiles';
import { originTitle } from './origin';
import { DRY_MMH, tempAt } from './model/rules';
import type { SiteVM, TerrainVM } from './model/types';

const X0 = 58, X1 = 744, Y_TOP = 10, Y_BOT = 282;
/** Höhe der Druckflächen nach Standardatmosphäre (ca.) — der Punkt-Cube führt Temperatur und Feuchte je Fläche, keine Höhe. */
const ISA_H: Record<number, number> = { 925: 762, 850: 1457, 700: 3012 };
const num1 = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 3D-Bühne: eigener Lazy-Chunk (MapLibre), erst geladen, wenn das Feld sichtbar wird. */
const TerrainStage3D = lazy(() => import('./TerrainStage3D'));

/** Wird einmal `true`, sobald das Element im Bild ist (im verborgenen Reiter „Details" bleibt es `false`). */
function useShownOnce<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

export function TerrainField({ vm, onHalfKm, rootRef, nowMs }: { vm: TerrainVM; onHalfKm: (km: 20 | 50) => void; rootRef?: RefObject<HTMLElement | null>; nowMs: number }) {
  const uid = useId().replace(/[^a-z0-9]/gi, '');
  // Ansicht wie im Regenradar „Karte | 3D": zuerst die 3D-Bühne, daneben der bisherige Geländeschnitt.
  const [view, setView] = useState<'3d' | 'schnitt'>('3d');
  const [stageRef, stageSeen] = useShownOnce<HTMLDivElement>();
  const ok = vm.state === 'ok' && vm.profile.length > 1;
  const R = vm.halfKm;
  const x = (s: number) => X0 + ((s + R) / (2 * R)) * (X1 - X0);
  const { top, bottom, step } = vm.axis;
  const y = (h: number) => Y_TOP + ((top - h) / Math.max(1, top - bottom)) * (Y_BOT - Y_TOP);
  const yc = (h: number) => Math.max(Y_TOP, Math.min(Y_BOT, y(h)));
  const ticks: number[] = [];
  for (let h = top; h >= bottom; h -= step) ticks.push(h);
  const terrainD = ok ? `M${X0} 340 ${vm.profile.map((p) => `L${x(p.s).toFixed(1)} ${Math.min(340, y(p.h)).toFixed(1)}`).join(' ')} L${X1} 340 Z` : '';
  // Isothermen-Beschriftung dort, wo das Gelände über die Breite der Beschriftung unter der Linie liegt (Vorlage:
  // links bei x = 64, sonst rechts; die Beschriftung wird nach dem Gelände gezeichnet).
  const sOfX = (xx: number) => ((xx - X0) / (X1 - X0)) * 2 * R - R;
  const clearBetween = (xa: number, xb: number, h: number) => vm.profile.every((p) => p.s < sOfX(xa) || p.s > sOfX(xb) || p.h < h - 30);
  const isoLabelX = (h: number, label: string) => {
    const w = label.length * 5.4;
    if (clearBetween(64, 64 + w, h)) return { x: 64, anchor: 'start' as const };
    if (clearBetween(X1 - 8 - w, X1 - 8, h)) return { x: X1 - 8, anchor: 'end' as const };
    for (let xx = 80; xx + w < X1 - 8; xx += 20) if (clearBetween(xx, xx + w, h)) return { x: xx, anchor: 'start' as const };
    return null;
  };
  const snowY = vm.snowline != null ? y(vm.snowline) : null;
  const ortX = x(0), ortY = vm.hOrt != null ? y(vm.hOrt) : null;
  const boxBelow = ortY != null && ortY + 29 + 34 <= 338;
  const inv = vm.inversion && vm.inversion.top > bottom && vm.inversion.base < top ? vm.inversion : null;
  const band = vm.snowBand && vm.snowBand.hi > bottom && vm.snowBand.lo < top ? vm.snowBand : null;
  // Gelände an der Stelle x (Zeichenfläche) und Fadenkreuz mit Ablesung
  const [hoverX, setHoverX] = useState<number | null>(null);
  const terrainAtX = (xx: number) => {
    const s = sOfX(xx);
    return vm.profile.reduce((b, p) => (Math.abs(p.s - s) < Math.abs(b.s - s) ? p : b), vm.profile[0]);
  };
  const hoverP = ok && hoverX != null ? terrainAtX(hoverX) : null;
  const hoverT = hoverP && vm.thermal ? tempAt(vm.thermal.tOrt, vm.thermal.hOrt, vm.thermal.gamma, hoverP.h) : null;
  // Himmel: Wolkenschichten (tief < 2 000 m, mittel 2 000–6 000 m), Niederschlag mit Phase an der Schneefallgrenze
  const sky = vm.sky;
  const cloudBands = [
    { id: 'tief', label: 'tiefe Wolken', pct: sky.low, from: Math.max(bottom, 0), to: Math.min(top, 2000) },
    { id: 'mittel', label: 'mittlere Wolken', pct: sky.mid, from: Math.max(bottom, 2000), to: Math.min(top, 6000) },
  ].filter((b) => b.pct != null && b.pct >= 5 && b.to > b.from);
  const precipOn = ok && sky.precipMmh != null && sky.precipMmh >= DRY_MMH;
  const snowAll = (sky.pSnow ?? 0) >= 0.5;
  const nStreaks = precipOn ? 14 + Math.min(18, Math.round((sky.precipMmh as number) * 8)) : 0;
  const streaks = precipOn
    ? Array.from({ length: nStreaks }, (_, i) => {
      const xx = X0 + 14 + ((X1 - X0 - 28) * (i + ((i * 7) % 5) / 5)) / nStreaks;
      const ground = Math.min(Y_BOT, y(terrainAtX(xx).h));
      const topY = Math.min(ground - 6, yc(Math.min(top, 2200)));
      return { xx, ground, topY };
    }).filter((q) => q.ground - q.topY > 8)
    : [];
  const levelMarks = vm.levels
    .map((l) => ({ ...l, h: ISA_H[l.hPa] }))
    .filter((l) => l.h != null && l.h > bottom && l.h < top && l.tVal != null);
  // Randtafeln: Position an der echten Höhe, gegenseitig auseinandergeschoben (je 31 Einheiten), Leitlinie zur echten Höhe
  const rawTags = [
    ...cloudBands.map((b) => ({ key: `c${b.id}`, kind: 'cloud' as const, y0: (yc(b.from) + yc(b.to)) / 2, title: b.label, value: `${Math.round(b.pct as number)} % Bedeckung` })),
    ...levelMarks.map((l) => ({ key: `l${l.hPa}`, kind: 'level' as const, y0: y(l.h), title: `${l.hPa} hPa ≈ ${num1(l.h)} m`, value: `${num1(l.tVal as number, 1)}°${l.rhVal != null ? ` · ${Math.round(l.rhVal)} %` : ''}` })),
  ].sort((a, b) => a.y0 - b.y0);
  const tags = rawTags.map((tg) => ({ ...tg, y: tg.y0 }));
  for (let i = 0; i < tags.length; i++) tags[i].y = Math.max(Y_TOP + 16, i ? Math.max(tags[i].y0, tags[i - 1].y + 31) : tags[i].y0);
  for (let i = tags.length - 1; i >= 0; i--) { const lim = i === tags.length - 1 ? Y_BOT - 14 : tags[i + 1].y - 31; if (tags[i].y > lim) tags[i].y = lim; }  const peak = ok ? vm.profile.reduce((b, p) => (p.h > b.h ? p : b), vm.profile[0]) : null;
  return (
    <section ref={rootRef} className="dbd-terrain dbd-dark" aria-label="Terrain um den Ort">
      <div className="dbd-terrain-head">
        <span className="dbd-eyebrow">TERRAIN UM DEN ORT · TEMPERATUR NACH HÖHE · WIND JE NIVEAU</span>
        <div className="dbd-seg-dark" role="group" aria-label="Ansicht">
          {([['3d', '3D'], ['schnitt', 'Schnitt']] as const).map(([k, l]) => (
            <button key={k} type="button" className={view === k ? 'is-active' : undefined} aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
        <div className="dbd-seg-dark" role="group" aria-label="Schnittlänge">
          {([20, 50] as const).map((km) => (
            <button key={km} type="button" className={vm.halfKm === km ? 'is-active' : undefined} aria-pressed={vm.halfKm === km} onClick={() => { if (vm.halfKm !== km) onHalfKm(km); }}>± {km} km</button>
          ))}
        </div>
        <Val v={vm.header} className="dbd-terrain-info" />
        <span className={`dbd-terrain-chip${vm.chipTone === 'warn' ? ' is-warn' : ''}`}><i /><Val v={vm.chip} long /></span>
      </div>
      <div className="dbd-terrain-grid">
        {view === '3d' && (
          <div ref={stageRef} className="dbd-stage" data-origin="P68">
            {stageSeen ? (
              <Suspense fallback={<div className="dbd-stage-wait"><span className="ev-spinner" /> 3D-Bühne lädt …</div>}>
                <TerrainStage3D vm={vm} nowMs={nowMs} />
              </Suspense>
            ) : <div className="dbd-stage-wait">3D-Bühne</div>}
          </div>
        )}
        <div className="dbd-section" hidden={view !== 'schnitt'}>
          <div className="dbd-section-scroll">
            <svg className="dbd-section-svg" viewBox="0 0 900 340" preserveAspectRatio="none" role="img" aria-label={`Geländeschnitt ${vm.fromLabel} → ${vm.toLabel}`} data-origin="P68"
              onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const xx = ((e.clientX - r.left) / r.width) * 900; setHoverX(xx >= X0 && xx <= X1 ? xx : null); }}
              onPointerLeave={() => setHoverX(null)}>
              <defs>
                <linearGradient id={`trTemp${uid}`} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#C97B47" stopOpacity=".30" />
                  <stop offset="26%" stopColor="#D4A373" stopOpacity=".26" />
                  <stop offset="42%" stopColor="#C99A4E" stopOpacity=".24" />
                  <stop offset="58%" stopColor="#7A9466" stopOpacity=".22" />
                  <stop offset="78%" stopColor="#5B9BD5" stopOpacity=".22" />
                  <stop offset="100%" stopColor="#3A6FA8" stopOpacity=".26" />
                </linearGradient>
                <linearGradient id={`trRock${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4A463E" /><stop offset="100%" stopColor="#312E29" />
                </linearGradient>
                <linearGradient id={`trCloud${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F5F1E8" stopOpacity=".10" />
                  <stop offset="55%" stopColor="#F5F1E8" stopOpacity=".42" />
                  <stop offset="100%" stopColor="#F5F1E8" stopOpacity=".14" />
                </linearGradient>
                <pattern id={`trInv${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="#FAF6EA" strokeWidth="1" strokeOpacity=".35" />
                </pattern>
                {snowY != null && <clipPath id={`trCap${uid}`}><path d={`M${X0} ${snowY} H${X1} V${Y_TOP} H${X0} Z`} /></clipPath>}
              </defs>
              <rect x={X0} y={Y_TOP} width={X1 - X0} height={Y_BOT - Y_TOP} fill={`url(#trTemp${uid})`} data-origin="P69" />
              <g stroke="#3A3833" strokeWidth="1">
                {ticks.map((h) => <line key={h} x1={X0} y1={y(h)} x2={X1} y2={y(h)} />)}
              </g>
              <g fill="#8B8474" fontSize="10.5" textAnchor="end">
                {ticks.map((h, i) => <text key={h} x="52" y={y(h) + 4}>{i === 0 ? `${h} m` : h}</text>)}
              </g>
              {/* Himmel am Ort (buscosun Fusion, Stunde 0): Wolkenschichten und Niederschlag — liegen hinter dem Gelände */}
              <g data-origin="P61">
                {cloudBands.map((b) => (
                  <g key={b.id}>
                    <rect x={X0} y={yc(b.to)} width={X1 - X0} height={Math.max(2, yc(b.from) - yc(b.to))} fill={`url(#trCloud${uid})`} fillOpacity={Math.min(0.9, ((b.pct as number) / 100) * 0.95 + 0.08)} />
                  </g>
                ))}
              </g>
              {streaks.length > 0 && (
                <g data-origin="P39">
                  {streaks.map((q, i) => {
                    const snowStart = snowAll ? q.topY : snowY != null ? Math.max(q.topY, Math.min(q.ground, snowY)) : q.ground;
                    const flakes = [] as number[];
                    for (let yy = q.topY + 3; yy < snowStart; yy += 7) flakes.push(yy);
                    return (
                      <g key={i}>
                        {snowStart < q.ground && <line x1={q.xx + 3} y1={snowStart} x2={q.xx - 3} y2={q.ground} stroke="#7FB2E5" strokeWidth="1.4" strokeLinecap="round" strokeOpacity=".8" />}
                        {flakes.map((fy) => <circle key={fy} cx={q.xx + (((fy * 13) % 7) - 3)} cy={fy} r="1.6" fill="#FAF6EA" fillOpacity=".95" />)}
                      </g>
                    );
                  })}
                </g>
              )}
              {/* Jan 17.10.: Spanne der Schneefallgrenze p10–p90 (P72) und Inversionsschicht (P70) als Bänder */}
              {band && <rect x={X0} y={yc(band.hi)} width={X1 - X0} height={Math.max(1, yc(band.lo) - yc(band.hi))} fill="#B5C4D4" fillOpacity=".12" data-origin="P72" />}
              {inv && (
                <g data-origin="P70">
                  <rect x={X0} y={yc(inv.top)} width={X1 - X0} height={Math.max(2, yc(inv.base) - yc(inv.top))} fill={`url(#trInv${uid})`} />
                  <line x1={X0} x2={X1} y1={yc(inv.top)} y2={yc(inv.top)} stroke="#FAF6EA" strokeWidth="1" strokeOpacity=".5" strokeDasharray="3 3" />
                  <line x1={X0} x2={X1} y1={yc(inv.base)} y2={yc(inv.base)} stroke="#FAF6EA" strokeWidth="1" strokeOpacity=".5" strokeDasharray="3 3" />
                  <text x="64" y={yc(inv.top) - 4} fontSize="9.5" fill="#F5F1E8" fillOpacity=".85">{inv.label}</text>
                </g>
              )}
              {vm.isotherms.map((it) => (
                <path key={it.t} d={`M${X0} ${y(it.h).toFixed(1)} L${X1} ${y(it.h).toFixed(1)}`} fill="none" stroke={it.color} strokeWidth="1.2" strokeDasharray="5 4" opacity=".75" data-origin="P71" />
              ))}
              {snowY != null && (
                <>
                  <line x1={X0} y1={snowY} x2={X1} y2={snowY} stroke="#B5C4D4" strokeWidth="1.6" data-origin="P72" />
                  <text x={X1 - 8} y={snowY - 4} fontSize="10" fill="#B5C4D4" textAnchor="end">{vm.snowlineLabel}{band ? ` · Spanne ${Math.round(band.lo / 10) * 10}–${Math.round(band.hi / 10) * 10} m` : ''}</text>
                </>
              )}
              {ok && <path d={terrainD} fill={`url(#trRock${uid})`} stroke="#5A554B" strokeWidth="1.4" />}
              {ok && snowY != null && <g clipPath={`url(#trCap${uid})`}><path d={terrainD} fill="#B5C4D4" fillOpacity=".9" stroke="#D6DEE6" strokeWidth="1.4" /></g>}
              {/* höchster Punkt des Schnitts */}
              {peak && vm.hOrt != null && peak.h > vm.hOrt + 150 && peak.h <= top && (
                <g>
                  <path d={`M${x(peak.s) - 5} ${y(peak.h) - 4} L${x(peak.s)} ${y(peak.h) - 12} L${x(peak.s) + 5} ${y(peak.h) - 4} Z`} fill="#F5F1E8" />
                  <text x={x(peak.s)} y={y(peak.h) - 16} fontSize="9.5" fill="#F5F1E8" textAnchor="middle" fontWeight="600">{num1(peak.h)} m</text>
                </g>
              )}
              {/* Randtafeln rechts: Wolkenschichten am Ort und Druckflächen (Höhe nach Standardatmosphäre, ca.) mit Temperatur und Feuchte */}
              {tags.map((tg) => (
                <g key={tg.key} data-origin={tg.kind === 'cloud' ? 'P61' : 'P98'}>
                  <path d={`M${X1} ${tg.y0} L${X1 + 6} ${tg.y0} L${X1 + 10} ${tg.y}`} fill="none" stroke="#F5F1E8" strokeOpacity=".4" strokeDasharray="1 3" />
                  <rect x={X1 + 10} y={tg.y - 14} width="142" height="28" rx="8" fill="#2C2A26" fillOpacity=".85" stroke="#4A463E" />
                  <rect x={X1 + 10} y={tg.y - 14} width="4" height="28" rx="2" fill={tg.kind === 'cloud' ? '#E6E2D6' : '#C99A4E'} />
                  <text x={X1 + 20} y={tg.y - 3} fontSize="9" fill="#B7AE9C">{tg.title}</text>
                  <text x={X1 + 20} y={tg.y + 10} fontSize="11" fill="#F5F1E8" fontWeight="700">{tg.value}</text>
                </g>
              ))}              {/* Wind am Ort (10 m): Pfeil in Richtung des Schnitts (der Schnitt läuft in Windrichtung) */}
              {vm.wind.ms != null && (
                <g data-origin="P64" transform={`translate(${X0 + 12} ${Y_BOT - 34})`}>
                  <rect width="156" height="24" rx="12" fill="#2C2A26" fillOpacity=".78" stroke="#4A463E" />
                  <path d="M10 12 H30 M24 6.5 L30 12 L24 17.5" fill="none" stroke="#F5F1E8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <text x="38" y="16" fontSize="10" fill="#F5F1E8" fontWeight="600">Wind {num1(vm.wind.ms, 1)} m/s{vm.wind.gustMs != null ? ` · Böen ${num1(vm.wind.gustMs, 0)}` : ''}</text>
                </g>
              )}
              {/* Fadenkreuz mit Ablesung: Geländehöhe und (mit Gradient) Temperatur an der Oberfläche */}
              {hoverP && hoverX != null && (
                <g pointerEvents="none">
                  <line x1={hoverX} x2={hoverX} y1={Y_TOP} y2={Y_BOT} stroke="#FAF6EA" strokeOpacity=".6" strokeDasharray="3 3" />
                  <circle cx={x(hoverP.s)} cy={Math.min(Y_BOT, y(hoverP.h))} r="4.5" fill="#FAF6EA" stroke="#2C2A26" strokeWidth="1.6" />
                  {(() => {
                    const bx = Math.min(X1 - 170, Math.max(X0 + 4, hoverX + 10));
                    return (
                      <g>
                        <rect x={bx} y={Y_TOP + 36} width="164" height="42" rx="7" fill="#2C2A26" stroke="#FAF6EA" strokeOpacity=".5" />
                        <text x={bx + 9} y={Y_TOP + 51} fontSize="9.5" fill="#B7AE9C">{num1(Math.abs(hoverP.s), 1)} km {hoverP.s < 0 ? vm.fromLabel : hoverP.s > 0 ? vm.toLabel : 'am Ort'}</text>
                        <text x={bx + 9} y={Y_TOP + 65} fontSize="11.5" fill="#F5F1E8" fontWeight="700">{num1(hoverP.h)} m{hoverT != null ? ` · ${num1(hoverT, 1)} °C` : ''}</text>
                      </g>
                    );
                  })()}
                </g>
              )}
              <g fontSize="9.5">
                {vm.isotherms.map((it) => {
                  const pos = isoLabelX(it.h, it.label);
                  return pos ? <text key={it.t} x={pos.x} y={y(it.h) - 4} fill="#8B8474" textAnchor={pos.anchor}>{it.label}</text> : null;
                })}
              </g>
              <g data-origin="P74">
                {vm.stations.map((st) => {
                  const above = vm.snowline != null && st.h > vm.snowline;
                  const c = above ? '#B5C4D4' : '#B7AE9C';
                  const sx = x(st.s), sy = y(st.h);
                  const right = sx < X1 - 190;
                  return (
                    <g key={`${st.name}${st.s}`}>
                      <circle cx={sx} cy={sy} r="4.5" fill={c} />
                      <text x={right ? sx + 10 : sx - 10} y={sy < 24 ? sy + 10 : sy - 4} fontSize="9.5" fill={c} textAnchor={right ? 'start' : 'end'}>{st.label}</text>
                    </g>
                  );
                })}
              </g>
              {ortY != null && (
                <g data-origin="P75">
                  <line x1={ortX} y1={ortY} x2={ortX} y2={boxBelow ? ortY + 29 : ortY - 29} stroke="#FAF6EA" strokeWidth="1.4" strokeDasharray="3 3" />
                  <circle cx={ortX} cy={ortY} r="6.5" fill="#FAF6EA" stroke="#2C2A26" strokeWidth="2" />
                  <rect x={ortX - 70} y={boxBelow ? ortY + 29 : ortY - 63} width="140" height="34" rx="6" fill="#2C2A26" stroke="#FAF6EA" strokeWidth="1.2" />
                  <text x={ortX} y={boxBelow ? ortY + 42 : ortY - 50} fontSize="10.5" fill="#F5F1E8" textAnchor="middle" fontWeight="600">{vm.ort.title}</text>
                  <text x={ortX} y={boxBelow ? ortY + 56 : ortY - 36} fontSize="10" fill="#FAF6EA" textAnchor="middle">{vm.ort.sub}</text>
                </g>
              )}
              <g fill="#8B8474" fontSize="10" textAnchor="middle">
                <text x="86" y="334">{vm.fromLabel} {R} km</text>
                <text x={X1 - 12} y="334">{vm.toLabel} {R} km</text>
              </g>
              {!ok && (
                <text x="479" y="170" fontSize="12" fill="#8B8474" textAnchor="middle">
                  {vm.state === 'loading' ? 'Gelände lädt …' : `Gelände nicht verfügbar${vm.note ? ` — ${vm.note}` : ''}`}
                </text>
              )}
            </svg>
          </div>
          <div className="dbd-swipe">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 8 L4 12 L8 16 M16 8 L20 12 L16 16 M4 12 H20" stroke="#8B8474" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Schnitt seitlich wischen · {vm.fromLabel} ← Ort → {vm.toLabel}
          </div>
          <div className="dbd-section-legend">
            <span><i style={{ width: 16, height: 8, borderRadius: 2, background: 'linear-gradient(0deg,#C97B47,#7A9466,#3A6FA8)' }} /> Temperatur nach Höhe (warm unten → kalt oben)</span>
            <span data-origin="P73" title="nicht verfügbar — kein Höhenwind im Punkt-Cube (E-DB-11)"><i style={{ width: 14, height: 2, background: '#7A9466' }} /> Windvektor je Niveau — <span className="dbd-na">nicht verfügbar</span></span>
            <span><i style={{ width: 14, height: 2, background: '#B5C4D4' }} /> Schneefallgrenze{band ? ' + Spanne p10–p90' : ''}</span>
            <span data-origin="P61"><i style={{ width: 16, height: 8, borderRadius: 4, background: 'linear-gradient(#F5F1E8aa,#F5F1E866)' }} /> Wolken am Ort: tief {sky.low != null ? `${Math.round(sky.low)} %` : 'n. v.'} · mittel {sky.mid != null ? `${Math.round(sky.mid)} %` : 'n. v.'} · hoch {sky.high != null ? `${Math.round(sky.high)} %` : 'n. v.'}</span>
            {precipOn && <span data-origin="P39"><i style={{ width: 2, height: 10, background: '#7FB2E5', transform: 'rotate(15deg)' }} /> Niederschlag {num1(sky.precipMmh as number, sky.precipMmh as number < 1 ? 2 : 1)} mm/h · {snowAll ? 'Schnee' : snowY != null ? 'Schnee über, Regen unter der Schneefallgrenze' : 'Regen'}</span>}
            {levelMarks.length > 0 && <span data-origin="P98" className="is-muted">Druckflächen: Höhe nach Standardatmosphäre (ca.)</span>}
            {inv && <span><i style={{ width: 14, height: 8, borderRadius: 2, background: 'repeating-linear-gradient(45deg,#FAF6EA 0 1px,transparent 1px 4px)', border: '1px dashed #8B8474' }} /> Inversionsschicht</span>}
            <span className="is-muted">{vm.legendIso}</span>
          </div>
        </div>
      </div>
      {/* Jan 17.10.: Gelände am Punkt (P97) und Schichtung je Druckfläche (P16/P98) */}
      <div className="dbd-terrain-row">
        <SiteBox site={vm.site} />
        <LevelsBox vm={vm} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Gelände am Punkt (P97)
// ---------------------------------------------------------------------------

/** Kompass mit Expositionspfeil und Neigungskeil (meteorologisch: 0° = Nord oben). */
function AspectDial({ slopeDeg, aspectDeg }: { slopeDeg: number | null; aspectDeg: number | null }) {
  const r = 26, c = 32;
  const a = aspectDeg == null ? null : ((aspectDeg - 90) * Math.PI) / 180;
  const tip = a == null ? null : [c + (r - 4) * Math.cos(a), c + (r - 4) * Math.sin(a)];
  const flat = slopeDeg == null || slopeDeg < 1;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" className="dbd-site-dial">
      <circle cx={c} cy={c} r={r} fill="#2C2A26" stroke="#3A3833" />
      <circle cx={c} cy={c} r={r / 2} fill="none" stroke="#3A3833" />
      <g fill="#8B8474" fontSize="7.5" textAnchor="middle" fontFamily="League Spartan">
        <text x={c} y={9}>N</text><text x={c + r + 4} y={c + 2.5}>O</text><text x={c} y={c + r + 7}>S</text><text x={c - r - 4} y={c + 2.5}>W</text>
      </g>
      {tip && !flat ? (
        <g>
          <line x1={c} y1={c} x2={tip[0]} y2={tip[1]} stroke="#FAF6EA" strokeWidth="2" strokeLinecap="round" />
          <circle cx={tip[0]} cy={tip[1]} r="3" fill="#FAF6EA" />
        </g>
      ) : <circle cx={c} cy={c} r="3" fill="#FAF6EA" />}
    </svg>
  );
}

/** Himmelssicht als Bogen (Sky-View-Factor). */
function SkyArc({ svf }: { svf: number | null }) {
  const r = 22, c = 30;
  const f = svf == null ? 0 : Math.max(0, Math.min(1, svf));
  const end = Math.PI - Math.PI * f;
  const arc = (from: number, to: number) => {
    const p = (t: number) => `${(c + r * Math.cos(t)).toFixed(1)} ${(c - r * Math.sin(t)).toFixed(1)}`;
    return `M${p(from)} A${r} ${r} 0 ${from - to > Math.PI ? 1 : 0} 1 ${p(to)}`;
  };
  return (
    <svg width="60" height="34" viewBox="0 0 60 34" aria-hidden="true" className="dbd-site-arc">
      <path d={arc(Math.PI, 0)} fill="none" stroke="#3A3833" strokeWidth="6" strokeLinecap="round" />
      {svf != null && <path d={arc(Math.PI, end)} fill="none" stroke="#FAF6EA" strokeWidth="6" strokeLinecap="round" />}
      <text x={c} y={31} fontSize="9" fill="#F5F1E8" textAnchor="middle" fontFamily="League Spartan" fontWeight="600">{svf != null ? `${Math.round(f * 100)} %` : '—'}</text>
    </svg>
  );
}

function SiteBox({ site }: { site: SiteVM }) {
  const row = (l: string, v: SiteVM['position']) => (
    <div className="dbd-site-row"><span className="dbd-site-l">{l}</span><span className="dbd-site-v"><Val v={v} long /></span></div>
  );
  return (
    <div className="dbd-dbox dbd-site" data-origin="P97" title={originTitle('P97')}>
      <span className="dbd-dbox-l">GELÄNDE AM PUNKT · TERRARIUM · WORLDCOVER</span>
      {site.state === 'loading' ? <div className="dbd-empty dbd-loading" aria-busy="true">lädt …</div>
        : site.state === 'error' ? <div className="dbd-empty">nicht verfügbar — buscosun Fusion nicht erreichbar</div> : (
          <div className="dbd-site-grid">
            <div className="dbd-site-vis">
              <AspectDial slopeDeg={site.slopeDeg} aspectDeg={site.aspectDeg} />
              <span className="dbd-site-cap">Exposition · Neigung</span>
              <SkyArc svf={site.svf} />
              <span className="dbd-site-cap">Himmelssicht</span>
            </div>
            <div className="dbd-site-rows">
              {row('Lage', site.position)}
              {row('Neigung', site.slope)}
              {row('Horizont', site.sky)}
              {row('Kaltluft', site.sink)}
              {row('Oberfläche', site.surface)}
              {row('Wasser', site.water)}
            </div>
          </div>
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schichtung je Druckfläche (P16 Temperatur, P98 Feuchte)
// ---------------------------------------------------------------------------

function LevelsBox({ vm }: { vm: TerrainVM }) {
  const ts = vm.levels.map((l) => l.tVal).filter((x): x is number => x != null);
  const tMin = ts.length ? Math.min(...ts) : 0, tMax = ts.length ? Math.max(...ts) : 1;
  const pos = (t: number) => (tMax === tMin ? 50 : ((t - tMin) / (tMax - tMin)) * 100);
  const warmerAbove = vm.levels.length === 3 && vm.levels[0].tVal != null && vm.levels[2].tVal != null && (vm.levels[0].tVal as number) > (vm.levels[2].tVal as number);
  return (
    <div className="dbd-dbox dbd-strata">
      <span className="dbd-dbox-l">SCHICHTUNG · 700 / 850 / 925 HPA · PUNKT-CUBE</span>
      {vm.levels.length === 0 ? <div className="dbd-empty dbd-loading" aria-busy="true">lädt …</div> : (
        <div className="dbd-strata-rows">
          {vm.levels.map((l) => (
            <div key={l.hPa} className="dbd-strata-row">
              <span className="dbd-strata-h">{l.hPa} hPa</span>
              <span className="dbd-strata-track" aria-hidden="true">
                {l.tVal != null && <i className="dbd-strata-dot" style={{ left: `${pos(l.tVal)}%` }} />}
                {l.rhVal != null && <i className="dbd-strata-rh" style={{ width: `${Math.max(0, Math.min(100, l.rhVal))}%` }} />}
              </span>
              <span className="dbd-strata-t"><Val v={l.t} /></span>
              <span className="dbd-strata-rhv"><Val v={l.rh} /></span>
            </div>
          ))}
          <div className="dbd-strata-foot">
            <span><i className="dbd-strata-dot is-leg" /> Temperatur (kalt links → warm rechts)</span>
            <span><i className="dbd-strata-rh is-leg" /> rel. Feuchte</span>
            {warmerAbove && <span className="dbd-strata-warn">700 hPa wärmer als 925 hPa — Inversion in der Höhe</span>}
          </div>
        </div>
      )}
    </div>
  );
}
