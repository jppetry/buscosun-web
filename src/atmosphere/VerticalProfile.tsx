/**
 * Atmosphäre · Vertikalprofil (SVG, presentational).
 *
 * Höhe in METERN auf linearer Achse (Default-Cap 0–4000 m, „ganze Höhe"-Toggle
 * zur vollen Troposphäre). Temperatur °C, Wind km/h. Rendert die abgeleiteten
 * Merkmale aus profile-derivations: Temperatur-/Taupunktkurve, Parcel-Aufstieg,
 * Grenzschicht-/Thermikbalken, Wolken-/Inversionsbänder, Nullgradgrenze,
 * Höhenwind-Pfeile und die transluzente Terrain-Bodenbox.
 *
 * Reine Darstellung — alle Zahlen kommen aus dem getesteten Derivations-Modul.
 */

import type { DerivedProfile } from './profile-derivations';

interface Props {
  data: DerivedProfile;
  capM: number;
  expanded: boolean;
  onToggleCap: () => void;
  validAt: Date;
  runAt: Date;
}

const W = 360, H = 470;
const TOP = 14, BOTTOM = 32;
const BAR_X = 40, BAR_W = 9;
const PLOT_X0 = 60, PLOT_X1 = 286;
const WIND_X = 324;
const BOTTOM_Y = H - BOTTOM;

/** Thermik-Stärke → Farbe (yellow→sage→steel für 0→>5 m/s), v1.8-Tokens. */
function thermalColor(ms: number): string {
  if (ms < 1) return '#D4A373';  // amber-500 (schwach)
  if (ms < 3) return '#7A9466';  // sage-600 (gut)
  return '#3A6FA8';              // steel-600 (stark)
}

export default function VerticalProfile({ data, capM, expanded, onToggleCap, validAt, runAt }: Props) {
  const yOf = (z: number) => BOTTOM_Y - (Math.max(0, Math.min(capM, z)) / capM) * (BOTTOM_Y - TOP);

  // Sichtbare Niveaus (innerhalb Cap, plus erstes darüber für stetige Kurven).
  const vis = data.levels.filter((l) => l.heightM <= capM + 1);
  const curveLevels = data.levels.filter((_, i) => i === 0 || data.levels[i - 1].heightM <= capM);

  // Temperatur-Spanne aus sichtbaren T/Td/Parcel.
  const temps: number[] = [];
  for (const l of vis) { temps.push(l.tempC, l.dewC); }
  for (const p of data.parcel) { if (p.heightM <= capM) temps.push(p.tempC); }
  let tMin = Math.min(...temps), tMax = Math.max(...temps);
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMin === tMax) { tMin = -20; tMax = 30; }
  tMin = Math.floor((tMin - 2) / 5) * 5; tMax = Math.ceil((tMax + 2) / 5) * 5;
  const xOf = (t: number) => PLOT_X0 + ((t - tMin) / (tMax - tMin)) * (PLOT_X1 - PLOT_X0);

  const line = (pts: Array<{ x: number; y: number }>) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const tPath = line(curveLevels.map((l) => ({ x: xOf(l.tempC), y: yOf(l.heightM) })));
  const tdPath = line(curveLevels.map((l) => ({ x: xOf(l.dewC), y: yOf(l.heightM) })));
  const parcelPath = line(data.parcel.filter((p) => p.heightM <= capM + 1).map((p) => ({ x: xOf(p.tempC), y: yOf(p.heightM) })));

  const hStep = capM <= 4000 ? 1000 : capM <= 8000 ? 2000 : 3000;
  const hTicks: number[] = [];
  for (let z = 0; z <= capM; z += hStep) hTicks.push(z);
  const tTicks: number[] = [];
  for (let t = tMin; t <= tMax; t += 10) tTicks.push(t);

  return (
    <div className="atm-prof">
      <div className="atm-prof-head">
        <span className="rt-eyebrow">Vertikalprofil</span>
        <button type="button" className="atm-prof-cap" onClick={onToggleCap} aria-pressed={expanded}>
          {expanded ? 'Auf 0–4000 m' : 'Ganze Höhe'}
        </button>
      </div>

      <svg className="atm-prof-svg" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Vertikalprofil bis ${Math.round(capM)} m: Temperatur, Taupunkt, Wind und Grenzschicht`}>
        {/* Rahmen */}
        <rect x={PLOT_X0} y={TOP} width={PLOT_X1 - PLOT_X0} height={BOTTOM_Y - TOP} fill="#fff" stroke="var(--sand-200, #E0D6BE)" />

        {/* Höhen-Gitter + Achsenbeschriftung (links) */}
        {hTicks.map((z) => (
          <g key={`h${z}`}>
            <line x1={PLOT_X0} y1={yOf(z)} x2={PLOT_X1} y2={yOf(z)} stroke="var(--sand-200, #E0D6BE)" strokeDasharray="2 4" />
            <text x={BAR_X - 6} y={yOf(z) + 3} className="atm-prof-ax" textAnchor="end">{z === 0 ? '0' : `${z / 1000}k`}</text>
          </g>
        ))}

        {/* Temperatur-Achse (unten) */}
        {tTicks.map((t) => (
          <text key={`t${t}`} x={xOf(t)} y={BOTTOM_Y + 14} className="atm-prof-ax" textAnchor="middle">{t}°</text>
        ))}

        {/* Inversionsbänder (amber) */}
        {data.inversions.filter((iv) => iv.baseM <= capM).map((iv, i) => (
          <rect key={`inv${i}`} x={PLOT_X0} y={yOf(iv.topM)} width={PLOT_X1 - PLOT_X0} height={Math.max(1, yOf(iv.baseM) - yOf(iv.topM))}
            fill="var(--amber-500, #D4A373)" opacity={0.22}>
            <title>Inversion {iv.baseM}–{iv.topM} m (+{iv.deltaC} °C)</title>
          </rect>
        ))}

        {/* Wolkenschichten (grau) */}
        {data.cloudLayers.filter((c) => c.baseM <= capM).map((c, i) => (
          <rect key={`cl${i}`} x={PLOT_X0} y={yOf(c.topM)} width={PLOT_X1 - PLOT_X0} height={Math.max(2, yOf(c.baseM) - yOf(c.topM))}
            fill="var(--slate-500, #6B7A8F)" opacity={0.2} stroke="var(--slate-500, #6B7A8F)" strokeOpacity={0.3} strokeWidth={0.5}>
            <title>Wolkenschicht {c.baseM}–{c.topM} m</title>
          </rect>
        ))}

        {/* Terrain-Bodenbox (kein Wind im Fels) */}
        {data.surfaceM > 0 && (
          <g>
            <rect x={BAR_X} y={yOf(data.surfaceM)} width={WIND_X + 18 - BAR_X} height={BOTTOM_Y - yOf(data.surfaceM)}
              fill="var(--sand-300, #D9CEB0)" opacity={0.7} />
            <text x={PLOT_X0 + 4} y={yOf(data.surfaceM) - 3} className="atm-prof-tag">Gelände {Math.round(data.surfaceM)} m</text>
          </g>
        )}

        {/* Grenzschicht-/Thermikbalken (links), Oberkante = max. Thermikhöhe */}
        {data.boundaryLayerTopM > data.surfaceM && (
          <g>
            <rect x={BAR_X} y={yOf(data.boundaryLayerTopM)} width={BAR_W} height={yOf(data.surfaceM) - yOf(data.boundaryLayerTopM)}
              fill={thermalColor(data.thermalStrengthMs)} opacity={0.9} rx={2}>
              <title>Thermik bis {data.boundaryLayerTopM} m · ~{data.thermalStrengthMs} m/s (Schätzung)</title>
            </rect>
            <text x={BAR_X + BAR_W + 3} y={yOf(data.boundaryLayerTopM) + 9} className="atm-prof-tag">
              Thermik {data.boundaryLayerTopM} m
            </text>
          </g>
        )}

        {/* Nullgradgrenze (steel, beschriftet) */}
        {data.freezingLevelM != null && data.freezingLevelM <= capM && (
          <g>
            <line x1={PLOT_X0} y1={yOf(data.freezingLevelM)} x2={PLOT_X1} y2={yOf(data.freezingLevelM)}
              stroke="var(--steel-600, #3A6FA8)" strokeDasharray="5 3" strokeWidth={1.3} />
            <text x={PLOT_X1 - 3} y={yOf(data.freezingLevelM) - 3} className="atm-prof-tag" textAnchor="end" style={{ fill: 'var(--steel-600, #3A6FA8)' }}>0 °C</text>
          </g>
        )}

        {/* Parcel-Aufstieg (gestrichelt) */}
        {parcelPath && <path d={parcelPath} fill="none" stroke="var(--ink-900, #2C2A26)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.7} />}
        {/* Taupunkt (steel) + Temperatur (terracotta) */}
        <path d={tdPath} fill="none" stroke="var(--steel-600, #3A6FA8)" strokeWidth={2} strokeLinejoin="round" />
        <path d={tPath} fill="none" stroke="var(--terracotta-500, #C97B47)" strokeWidth={2.2} strokeLinejoin="round" />

        {/* Höhenwind-Pfeile (rechte Spalte) */}
        {vis.map((l, i) => {
          const len = Math.min(22, 6 + l.windKmh * 0.35);
          const flow = ((l.windDirDeg + 180) % 360) * Math.PI / 180; // Richtung, wohin der Wind weht
          const cx = WIND_X, cy = yOf(l.heightM);
          const dx = Math.sin(flow) * len, dy = -Math.cos(flow) * len;
          return (
            <g key={`w${i}`}>
              <line x1={cx - dx / 2} y1={cy - dy / 2} x2={cx + dx / 2} y2={cy + dy / 2}
                stroke="var(--stone-600, #5C5447)" strokeWidth={1.4} markerEnd="url(#atm-arrow)" />
              {i % 2 === 0 && <text x={WIND_X + 22} y={cy + 3} className="atm-prof-ax" textAnchor="start">{Math.round(l.windKmh)}</text>}
            </g>
          );
        })}
        <text x={WIND_X} y={TOP - 2} className="atm-prof-ax" textAnchor="middle">Wind km/h</text>

        <defs>
          <marker id="atm-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--stone-600, #5C5447)" />
          </marker>
        </defs>
      </svg>

      <div className="atm-prof-legend">
        <span><i style={{ background: 'var(--terracotta-500, #C97B47)' }} />Temperatur</span>
        <span><i style={{ background: 'var(--steel-600, #3A6FA8)' }} />Taupunkt</span>
        <span><i className="dash" />Parcel</span>
        <span><i style={{ background: 'var(--amber-500, #D4A373)' }} />Inversion</span>
      </div>
      <p className="atm-prof-source">
        ICON-EU (~7 km, Druckflächen) · Lauf {fmtUTC(runAt)} · gültig {fmtUTC(validAt)} ·
        <strong> Richtwert</strong>; Thermik-Stärke geschätzt, dünne Strukturen ggf. unteraufgelöst.
      </p>
    </div>
  );
}

function fmtUTC(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}. ${String(d.getUTCHours()).padStart(2, '0')}Z`;
}
