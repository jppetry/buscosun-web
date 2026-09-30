/**
 * Terrain-Feld (Phase DB): Geländeschnitt durch den Ort in Windrichtung, Temperatur nach Höhe aus EINEM Gradienten
 * (γ aus dem Modellprofil des Cube, E-DB-11), Isothermen, Schneefallgrenze, Stationen des Katalogs im Schnitt,
 * Tabelle je Höhenstufe, Ablesung. Koordinatensystem der Vorlage: viewBox 900×340, Höhenachse x = 58, Raster
 * y 10 … 282. Wind je Höhenniveau ist nicht verfügbar (kein Höhenwind im Punkt-Cube) — es werden KEINE Pfeile gezeichnet.
 */
import { useId, type RefObject } from 'react';
import { Rich, Val } from './tiles';
import type { TerrainVM } from './model/types';

const X0 = 58, X1 = 900, Y_TOP = 10, Y_BOT = 282;

export function TerrainField({ vm, onHalfKm, rootRef }: { vm: TerrainVM; onHalfKm: (km: 20 | 50) => void; rootRef?: RefObject<HTMLElement | null> }) {
  const uid = useId().replace(/[^a-z0-9]/gi, '');
  const ok = vm.state === 'ok' && vm.profile.length > 1;
  const R = vm.halfKm;
  const x = (s: number) => X0 + ((s + R) / (2 * R)) * (X1 - X0);
  const { top, bottom, step } = vm.axis;
  const y = (h: number) => Y_TOP + ((top - h) / Math.max(1, top - bottom)) * (Y_BOT - Y_TOP);
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
    if (clearBetween(892 - w, 892, h)) return { x: 892, anchor: 'end' as const };
    for (let xx = 80; xx + w < 892; xx += 20) if (clearBetween(xx, xx + w, h)) return { x: xx, anchor: 'start' as const };
    return null;
  };
  const snowY = vm.snowline != null ? y(vm.snowline) : null;
  const ortX = x(0), ortY = vm.hOrt != null ? y(vm.hOrt) : null;
  const boxBelow = ortY != null && ortY + 29 + 34 <= 338;
  return (
    <section ref={rootRef} className="dbd-terrain dbd-dark" aria-label="Terrain um den Ort">
      <div className="dbd-terrain-head">
        <span className="dbd-eyebrow">TERRAIN UM DEN ORT · TEMPERATUR NACH HÖHE · WIND JE NIVEAU</span>
        <div className="dbd-seg-dark" role="group" aria-label="Schnittlänge">
          {([20, 50] as const).map((km) => (
            <button key={km} type="button" className={vm.halfKm === km ? 'is-active' : undefined} aria-pressed={vm.halfKm === km} onClick={() => { if (vm.halfKm !== km) onHalfKm(km); }}>± {km} km</button>
          ))}
        </div>
        <Val v={vm.header} className="dbd-terrain-info" />
        <span className={`dbd-terrain-chip${vm.chipTone === 'warn' ? ' is-warn' : ''}`}><i /><Val v={vm.chip} long /></span>
      </div>
      <div className="dbd-terrain-grid">
        <div className="dbd-section">
          <div className="dbd-section-scroll">
            <svg className="dbd-section-svg" viewBox="0 0 900 340" preserveAspectRatio="none" role="img" aria-label={`Geländeschnitt ${vm.fromLabel} → ${vm.toLabel}`} data-origin="P68">
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
                {snowY != null && <clipPath id={`trCap${uid}`}><path d={`M${X0} ${snowY} H${X1} V${Y_TOP} H${X0} Z`} /></clipPath>}
              </defs>
              <rect x={X0} y={Y_TOP} width={X1 - X0} height={Y_BOT - Y_TOP} fill={`url(#trTemp${uid})`} data-origin="P69" />
              <g stroke="#3A3833" strokeWidth="1">
                {ticks.map((h) => <line key={h} x1={X0} y1={y(h)} x2={X1} y2={y(h)} />)}
              </g>
              <g fill="#8B8474" fontSize="10.5" textAnchor="end">
                {ticks.map((h, i) => <text key={h} x="52" y={y(h) + 4}>{i === 0 ? `${h} m` : h}</text>)}
              </g>
              {vm.isotherms.map((it) => (
                <path key={it.t} d={`M${X0} ${y(it.h).toFixed(1)} L${X1} ${y(it.h).toFixed(1)}`} fill="none" stroke={it.color} strokeWidth="1.2" strokeDasharray="5 4" opacity=".75" data-origin="P71" />
              ))}
              {snowY != null && (
                <>
                  <line x1={X0} y1={snowY} x2={X1} y2={snowY} stroke="#B5C4D4" strokeWidth="1.6" data-origin="P72" />
                  <text x="892" y={snowY - 4} fontSize="10" fill="#B5C4D4" textAnchor="end">{vm.snowlineLabel}</text>
                </>
              )}
              {ok && <path d={terrainD} fill={`url(#trRock${uid})`} stroke="#5A554B" strokeWidth="1.4" />}
              {ok && snowY != null && <g clipPath={`url(#trCap${uid})`}><path d={terrainD} fill="#B5C4D4" fillOpacity=".9" stroke="#D6DEE6" strokeWidth="1.4" /></g>}
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
                  const right = sx < 700;
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
                  <line x1={ortX} y1={ortY} x2={ortX} y2={boxBelow ? ortY + 29 : ortY - 29} stroke="#E0A567" strokeWidth="1.4" strokeDasharray="3 3" />
                  <circle cx={ortX} cy={ortY} r="6.5" fill="#E0A567" stroke="#2C2A26" strokeWidth="2" />
                  <rect x={ortX - 70} y={boxBelow ? ortY + 29 : ortY - 63} width="140" height="34" rx="6" fill="#2C2A26" stroke="#E0A567" strokeWidth="1.2" />
                  <text x={ortX} y={boxBelow ? ortY + 42 : ortY - 50} fontSize="10.5" fill="#F5F1E8" textAnchor="middle" fontWeight="600">{vm.ort.title}</text>
                  <text x={ortX} y={boxBelow ? ortY + 56 : ortY - 36} fontSize="10" fill="#E0A567" textAnchor="middle">{vm.ort.sub}</text>
                </g>
              )}
              <g fill="#8B8474" fontSize="10" textAnchor="middle">
                <text x="86" y="334">{vm.fromLabel} {R} km</text>
                <text x="880" y="334">{vm.toLabel} {R} km</text>
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
            <span><i style={{ width: 14, height: 2, background: '#B5C4D4' }} /> Schneefallgrenze</span>
            <span className="is-muted">{vm.legendIso}</span>
          </div>
        </div>
        <div className="dbd-terrain-side">
          <div className="dbd-dbox">
            <span className="dbd-dbox-l">JE HÖHENSTUFE</span>
            <div className="dbd-levels">
              {vm.table.length ? vm.table.map((r) => (
                <div key={`${r.h}${r.ort ? 'o' : ''}`} className={`dbd-level${r.ort ? ' is-ort' : ''}`}>
                  <span className="dbd-level-h">{r.label}</span>
                  <span className="dbd-level-t"><Val v={r.t} /></span>
                  <span className="dbd-level-w"><Val v={r.wind} /></span>
                </div>
              )) : <div className="dbd-empty">{vm.state === 'loading' ? 'lädt …' : 'nicht verfügbar'}</div>}
            </div>
          </div>
          <div className="dbd-dbox dbd-readout">
            <span className="dbd-dbox-l">ABLESUNG</span>
            <p data-origin="P78"><Rich parts={vm.readout.main.length ? vm.readout.main : [vm.state === 'loading' ? 'lädt …' : 'nicht verfügbar']} /></p>
            {vm.readout.note.length > 0 && <div className="dbd-readout-note"><Rich parts={vm.readout.note} /></div>}
          </div>
        </div>
      </div>
    </section>
  );
}

