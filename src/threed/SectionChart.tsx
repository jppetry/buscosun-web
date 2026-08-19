/**
 * 3D-Wetter · Vertikalschnitt-Renderer (US-A2/A3/A4/F4/N5).
 *
 * SVG-Schnitt: Windzellen (barrierearme, benannte Bänder — US-N5), echtes
 * Geländeprofil (US-A2), Mittelwind- und Böen-Pfeile (US-A3/A4), Achsen in
 * m ü. NN und km, Punkt-Pick (US-F4). Inversion/Wolkenbasis/Shear werden über
 * Props eingeblendet (Folge-Tasks).
 */

import { useMemo, useRef } from 'react';
import {
  shearCellFlags,
  type CrossSection, type SectionCell, type ColumnProfile,
} from './crossSection';
import { buildWindImage, buildCloudImage } from './sectionImage';
import type { LayerState } from './ThreeDPage';

export const BAND_COLORS = ['#B6C8D6', '#7A9466', '#D4A373', '#C97B47', '#D7263D'];
export const BAND_LABELS = ['< 15', '15–30', '30–45', '45–60', '> 60'];

// Querformat (Desktop) vs Hochformat (schmale Screens) — letzteres gibt dem
// Vertikalschnitt mehr Höhe statt ihn zu stauchen.
const LANDSCAPE = { W: 960, H: 540 };
// Deck-Variante: flacher, damit der Schnitt im Command-Deck die volle Breite
// nutzt und trotzdem ohne Scrollen auf eine Bildschirmhöhe passt.
const LANDSCAPE_WIDE = { W: 1200, H: 430 };
const PORTRAIT = { W: 560, H: 600 };
const PAD_L = 54, PAD_R = 16, PAD_T = 16, PAD_B = 42;

export interface PickedPoint {
  distanceM: number;
  levelM: number;
  agl: number;
  windKmh: number;
  gustKmh: number;
  tempC: number;
  windDirDeg: number;
}

interface Props {
  section: CrossSection;
  layers: LayerState;
  picked: PickedPoint | null;
  onPick: (p: PickedPoint | null) => void;
  /** Optionaler Overlay-Renderer (Inversion etc.) in Plot-Koordinaten. */
  overlay?: (geo: SectionGeo) => React.ReactNode;
  /** Hochformat (schmale Screens) → höheres Seitenverhältnis. */
  portrait?: boolean;
  /** Flaches Deck-Format (volle Breite, geringere Höhe). */
  wide?: boolean;
}

export interface SectionGeo {
  x: (distanceM: number) => number;
  y: (m: number) => number;
  maxDistanceM: number;
  topM: number;
  plot: { left: number; top: number; width: number; height: number };
}

export default function SectionChart({ section, layers, picked, onPick, overlay, portrait, wide }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { W, H } = portrait ? PORTRAIT : wide ? LANDSCAPE_WIDE : LANDSCAPE;
  const PLOT_W = W - PAD_L - PAD_R;
  const PLOT_H = H - PAD_T - PAD_B;
  const maxDistanceM = section.columns[section.columns.length - 1].distanceM || 1;
  const topM = section.topM;
  const x = (d: number) => PAD_L + (PLOT_W * d) / maxDistanceM;
  const y = (m: number) => PAD_T + PLOT_H * (1 - Math.min(m, topM) / topM);
  const geo: SectionGeo = { x, y, maxDistanceM, topM, plot: { left: PAD_L, top: PAD_T, width: PLOT_W, height: PLOT_H } };

  const cols = section.columns;
  const step = section.heightLevels.length > 1 ? section.heightLevels[1] - section.heightLevels[0] : 150;
  const colW = PLOT_W / Math.max(1, cols.length - 1);
  const cellH = (PLOT_H * step) / topM;

  // Windzellen (jede 2. Spalte → leichtere DOM-Last, weiterhin flüssig).
  const cellCols = cols.filter((_, i) => i % 2 === 0);

  // Pfeil-Gitter (spärlich): alle paar Spalten/Level.
  const arrowCols = cols.filter((_, i) => i % 8 === 4);
  const arrowLevels = section.heightLevels.filter((_, i) => i % 3 === 1);

  // Y-Achsen-Ticks (500-m-Raster).
  const yTicks: number[] = [];
  for (let m = 0; m <= topM; m += 500) yTicks.push(m);
  // X-Achsen-Ticks (~6 Stück).
  const xTickKm = niceKmStep(maxDistanceM / 1000);
  const xTicks: number[] = [];
  for (let km = 0; km * 1000 <= maxDistanceM + 1; km += xTickKm) xTicks.push(km);

  const terrainPath = `M ${x(0).toFixed(1)} ${y(0).toFixed(1)} `
    + cols.map((c) => `L ${x(c.distanceM).toFixed(1)} ${y(c.terrainM).toFixed(1)}`).join(' ')
    + ` L ${x(maxDistanceM).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const terrainLine = `M ` + cols.map((c) => `${x(c.distanceM).toFixed(1)} ${y(c.terrainM).toFixed(1)}`).join(' L ');

  const cloudPath = layers.cloudBase ? cloudBaseLine(cols, x, y) : null;

  // Glatte Wind-Heatmap: kleines Canvas-Bild (Spalten × Höhenlevel), das die SVG
  // bilinear hochskaliert → kontinuierlicher Verlauf statt klotziger Bänder.
  const useGust = layers.gust && !layers.mean;
  const windUrl = useMemo(() => buildWindImage(section, useGust), [section, useGust]);
  const cloudUrl = useMemo(() => (layers.cloudLayers ? buildCloudImage(section) : null), [section, layers.cloudLayers]);

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    if (px < PAD_L || px > W - PAD_R || py < PAD_T || py > PAD_T + PLOT_H) { onPick(null); return; }
    const dist = ((px - PAD_L) / PLOT_W) * maxDistanceM;
    const levelM = (1 - (py - PAD_T) / PLOT_H) * topM;
    const col = nearestCol(cols, dist);
    const cell = nearestCell(col, levelM);
    if (!cell) { onPick(null); return; }
    onPick({ distanceM: col.distanceM, levelM: cell.levelM, agl: cell.agl, windKmh: cell.windKmh, gustKmh: cell.gustKmh, tempC: cell.tempC, windDirDeg: cell.windDirDeg });
  }

  return (
    <svg ref={svgRef} className="td-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label="Vertikaler Wetterschnitt: Windgeschwindigkeit über Höhe und Distanz, mit Geländeprofil."
      onClick={handleClick}>
      <defs>
        <pattern id="td-shear-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="#C97B47" strokeWidth="1.4" opacity="0.55" />
        </pattern>
        <linearGradient id="td-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E7ECF1" />
          <stop offset="1" stopColor="#F2EFE6" />
        </linearGradient>
        <linearGradient id="td-terrain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9C8E72" />
          <stop offset="0.55" stopColor="#7E7158" />
          <stop offset="1" stopColor="#5C5240" />
        </linearGradient>
      </defs>
      {/* Himmel (Verlauf) */}
      <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="url(#td-sky)" />

      {/* Wind-Heatmap (glatt, bilinear hochskaliert) */}
      {windUrl && (
        <image href={windUrl} x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H}
          preserveAspectRatio="none" opacity={0.82} />
      )}

      {/* Wolkenstockwerke tief/mittel/hoch (US-C2) — weiche weiße Schichten */}
      {layers.cloudLayers && cloudUrl && (
        <image href={cloudUrl} x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} preserveAspectRatio="none" />
      )}

      {/* Wind-Shear-Zonen (US-A6) */}
      {layers.shear && cellCols.flatMap((col) => {
        const flags = shearCellFlags(col.cells);
        return col.cells.map((cell, ci) => flags[ci] ? (
          <rect key={`sh-${col.index}-${cell.levelM}`}
            x={x(col.distanceM) - colW} y={y(cell.levelM + step)}
            width={colW * 2} height={cellH + 0.6}
            fill="url(#td-shear-hatch)" />
        ) : null);
      })}

      {/* Verankerte Streamlines am Gelände (US-A8) */}
      {layers.streamlines && <Streamlines section={section} x={x} y={y} topM={topM} />}

      {/* Inversions-/sonstiges Overlay */}
      {overlay?.(geo)}

      {/* Wolkenbasis */}
      {cloudPath && (
        <>
          <path d={cloudPath} fill="none" stroke="#FAF6EA" strokeWidth={2.5} opacity={0.9} />
          <path d={cloudPath} fill="none" stroke="#8B9AAB" strokeWidth={1} strokeDasharray="5 4" />
        </>
      )}

      {/* Mittelwind-Pfeile */}
      {layers.mean && arrowCols.flatMap((col) =>
        arrowLevels.filter((lv) => lv >= col.terrainM).map((lv) => {
          const cell = nearestCell(col, lv);
          if (!cell) return null;
          return <Arrow key={`m-${col.index}-${lv}`} cx={x(col.distanceM)} cy={y(lv)} dirFromDeg={cell.windDirDeg} kmh={cell.windKmh} color="#2C2A26" />;
        }),
      )}
      {/* Böen-Pfeile (gestrichelt) */}
      {layers.gust && arrowCols.flatMap((col) =>
        arrowLevels.filter((lv) => lv >= col.terrainM).map((lv) => {
          const cell = nearestCell(col, lv);
          if (!cell) return null;
          return <Arrow key={`g-${col.index}-${lv}`} cx={x(col.distanceM)} cy={y(lv)} dirFromDeg={cell.windDirDeg} kmh={cell.gustKmh} color="#D7263D" dashed />;
        }),
      )}

      {/* Gelände (Höhenverlauf + Rim-Light + Kontur) */}
      <path d={terrainPath} fill="url(#td-terrain)" />
      <path d={terrainLine} fill="none" stroke="#EFE8D6" strokeWidth={2.4} opacity={0.5} />
      <path d={terrainLine} fill="none" stroke="#463E30" strokeWidth={1.3} />

      {/* Achsen */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + PLOT_H} stroke="#8B7355" />
      <line x1={PAD_L} y1={PAD_T + PLOT_H} x2={W - PAD_R} y2={PAD_T + PLOT_H} stroke="#8B7355" />
      {yTicks.map((m) => (
        <g key={m}>
          <line x1={PAD_L - 4} y1={y(m)} x2={PAD_L} y2={y(m)} stroke="#8B7355" />
          <text x={PAD_L - 7} y={y(m) + 3} className="td-axislabel" textAnchor="end">{m}</text>
        </g>
      ))}
      <text className="td-axistitle" transform={`rotate(-90 ${16} ${PAD_T + PLOT_H / 2})`} x={16} y={PAD_T + PLOT_H / 2} textAnchor="middle">Höhe m ü. NN</text>
      {xTicks.map((km) => (
        <g key={km}>
          <line x1={x(km * 1000)} y1={PAD_T + PLOT_H} x2={x(km * 1000)} y2={PAD_T + PLOT_H + 4} stroke="#8B7355" />
          <text x={x(km * 1000)} y={PAD_T + PLOT_H + 16} className="td-axislabel" textAnchor="middle">{km} km</text>
        </g>
      ))}

      {/* Gepickter Punkt */}
      {picked && (
        <g>
          <circle cx={x(picked.distanceM)} cy={y(picked.levelM)} r={6} fill="none" stroke="#C97B47" strokeWidth={2} />
          <circle cx={x(picked.distanceM)} cy={y(picked.levelM)} r={2.5} fill="#C97B47" />
        </g>
      )}
    </svg>
  );
}

function Arrow({ cx, cy, dirFromDeg, kmh, color, dashed }: { cx: number; cy: number; dirFromDeg: number; kmh: number; color: string; dashed?: boolean }) {
  // Wind weht NACH dirFromDeg+180. Bildschirm: x+ = Ost, y- = Nord.
  const toRad = (d: number) => (d * Math.PI) / 180;
  const theta = toRad(dirFromDeg + 180);
  const len = Math.max(11, Math.min(28, 7 + kmh * 0.34)); // Länge ∝ Geschwindigkeit
  const dx = Math.sin(theta), dy = -Math.cos(theta);
  // Auf (cx,cy) zentriert.
  const x1 = cx - dx * len * 0.5, y1 = cy - dy * len * 0.5;
  const x2 = cx + dx * len * 0.5, y2 = cy + dy * len * 0.5;
  const hl = 6.5;
  const ah = toRad(dirFromDeg + 180 + 147), ah2 = toRad(dirFromDeg + 180 - 147);
  const shaft = `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  const head = `M ${x2.toFixed(1)} ${y2.toFixed(1)} L ${(x2 + Math.sin(ah) * hl).toFixed(1)} ${(y2 - Math.cos(ah) * hl).toFixed(1)} `
    + `M ${x2.toFixed(1)} ${y2.toFixed(1)} L ${(x2 + Math.sin(ah2) * hl).toFixed(1)} ${(y2 - Math.cos(ah2) * hl).toFixed(1)}`;
  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* helles Casing für Kontrast über Heatmap & Gelände */}
      <path d={shaft} stroke="#FAF6EA" strokeWidth={3.6} opacity={0.55} />
      <path d={head} stroke="#FAF6EA" strokeWidth={3.6} opacity={0.55} />
      {/* Kern */}
      <path d={shaft} stroke={color} strokeWidth={1.9} opacity={0.95} strokeDasharray={dashed ? '4 3' : undefined} />
      <path d={head} stroke={color} strokeWidth={1.9} opacity={0.95} />
    </g>
  );
}

/**
 * Verankerte Streamlines (US-A8): geländefolgende Strömungslinien, die über
 * Grate gehoben werden (Orografie) — kein ortsloser Partikeleffekt. Richtung
 * aus der Wind-Komponente entlang der Schnittlinie.
 */
function Streamlines({ section, x, y, topM }: { section: CrossSection; x: (d: number) => number; y: (m: number) => number; topM: number }) {
  const cols = section.columns;
  if (cols.length < 2) return null;
  // Flussrichtung: Ost-Komponente des Windes × Ost-Richtung der Schnittlinie.
  let meanU = 0, n = 0;
  for (const c of cols) for (const cell of c.cells) { meanU += -cell.windKmh * Math.sin((cell.windDirDeg * Math.PI) / 180); n++; }
  meanU = n ? meanU / n : 0;
  const eastSign = Math.sign(cols[cols.length - 1].lon - cols[0].lon) || 1;
  const flowSign = (meanU * eastSign) >= 0 ? 1 : -1; // +1 = nach rechts (steigende Distanz)

  const minH = section.terrainMinM + 250;
  const casings: React.ReactNode[] = [];
  const cores: React.ReactNode[] = [];
  const COUNT = 6;
  for (let li = 0; li < COUNT; li++) {
    const h0 = minH + (li / (COUNT - 1)) * (topM - minH - 100);
    const clearance = 120 + (1 - li / (COUNT - 1)) * 120; // tiefe Linien huggen das Gelände mehr
    const path = cols.map((c) => {
      const yNN = Math.max(h0, c.terrainM + clearance);
      return `${x(c.distanceM).toFixed(1)} ${y(Math.min(yNN, topM)).toFixed(1)}`;
    });
    const d = `M ${path.join(' L ')}`;
    casings.push(<path key={`slc-${li}`} d={d} fill="none" stroke="#FAF6EA" strokeWidth={3.4} opacity={0.4} strokeLinecap="round" />);
    cores.push(<path key={`sl-${li}`} d={d} fill="none" stroke="#3F5468" strokeWidth={1.7} opacity={0.7} strokeLinecap="round" />);
    // Chevrons entlang der Linie.
    for (let k = 1; k <= 4; k++) {
      const ci = Math.round((k / 5) * (cols.length - 1));
      const c = cols[ci];
      const yNN = Math.min(Math.max(h0, c.terrainM + clearance), topM);
      const px = x(c.distanceM), py = y(yNN);
      const dx = 6 * flowSign;
      const cd = `M ${px - dx} ${py - 4} L ${px} ${py} L ${px - dx} ${py + 4}`;
      casings.push(<path key={`slcc-${li}-${k}`} d={cd} fill="none" stroke="#FAF6EA" strokeWidth={3.4} opacity={0.4} strokeLinecap="round" strokeLinejoin="round" />);
      cores.push(<path key={`slc2-${li}-${k}`} d={cd} fill="none" stroke="#3F5468" strokeWidth={1.7} opacity={0.9} strokeLinecap="round" strokeLinejoin="round" />);
    }
  }
  // Casings zuerst (darunter), dann Kerne.
  return <g>{casings}{cores}</g>;
}

// --- Helfer ------------------------------------------------------------------

function nearestCol(cols: ColumnProfile[], distanceM: number): ColumnProfile {
  let best = cols[0], bd = Infinity;
  for (const c of cols) { const d = Math.abs(c.distanceM - distanceM); if (d < bd) { bd = d; best = c; } }
  return best;
}

function nearestCell(col: ColumnProfile, levelM: number): SectionCell | null {
  if (!col.cells.length) return null;
  let best = col.cells[0], bd = Infinity;
  for (const c of col.cells) { const d = Math.abs(c.levelM - levelM); if (d < bd) { bd = d; best = c; } }
  return best;
}

function cloudBaseLine(cols: ColumnProfile[], x: (d: number) => number, y: (m: number) => number): string | null {
  const pts = cols.filter((c) => c.cloudBaseM != null);
  if (pts.length < 2) return null;
  return 'M ' + pts.map((c) => `${x(c.distanceM).toFixed(1)} ${y(c.cloudBaseM!).toFixed(1)}`).join(' L ');
}

function niceKmStep(totalKm: number): number {
  const raw = totalKm / 6;
  const steps = [1, 2, 5, 10, 20, 50, 100];
  return steps.find((s) => s >= raw) ?? 100;
}
