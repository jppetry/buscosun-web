/**
 * Wetter-Sparkline-Streifen entlang der Strecke (x = Distanz). Drei
 * gestapelte Panels:
 *
 *   1. Temperatur — Linie + optional Apparent gestrichelt (wenn ≠ T).
 *   2. Niederschlag — Balken (mm/h), eingefärbt nach Quelle (Radar = sage,
 *      NWP = steel-blau). Y-Skala auto, mindestens 0–4 mm/h.
 *   3. Wind — Mittelwind-Linie + Gust-Ribbon (fill zwischen Wind und Gust).
 *
 * Liefert null, wenn keine Wetter-Samples vorliegen.
 */

import { useMemo, useRef } from 'react';
import type { SampleETA } from './tourTiming';
import { exportSvgAsPng } from '../imageExport';

interface Props {
  samples: SampleETA[];
}

const W = 600;
const PANEL_H = 56;
const GAP = 6;
const PAD_Y = 5;

export default function WeatherProfile({ samples }: Props) {
  const series = useMemo(() => buildSeries(samples), [samples]);
  const svgRef = useRef<SVGSVGElement>(null);
  if (!series) return null;

  const totalKm = series.totalM / 1000;
  return (
    <figure className="wp-figure">
      <div className="wp-head">
        <figcaption>Wetter entlang der Strecke</figcaption>
        <button type="button" className="wp-export" title="Wetterprofil als Bild (PNG) herunterladen"
          onClick={() => svgRef.current && void exportSvgAsPng(svgRef.current, {
            filename: 'buscosun-wetterprofil.png',
            title: 'Wetter entlang der Strecke',
            subtitle: `${fmt1(totalKm)} km · Temperatur · Niederschlag · Wind`,
            source: 'buscosun · Quellen: DWD · GeoSphere · MeteoSwiss (höhenkorrigiert)',
          })}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Als Bild</span>
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${series.height}`}
        preserveAspectRatio="none"
        className="wp-svg"
        aria-hidden="true"
      >
        {/* Panel 1: Temperatur */}
        <g transform={`translate(0,0)`}>
          <rect x="0" y="0" width={W} height={PANEL_H} fill="var(--cream-50, #FAF6EA)" stroke="var(--sand-200, #e0d6be)" />
          {series.tempArea && <path d={series.tempArea} fill="rgba(198, 99, 59, 0.10)" />}
          {series.tempLine && <path d={series.tempLine} fill="none" stroke="var(--terracotta-500, #c6633b)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
          {series.apparentLine && series.apparentDiffers && (
            <path d={series.apparentLine} fill="none" stroke="var(--terracotta-700, #a8431f)" strokeWidth="1.1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.7" />
          )}
          <text x="6" y="11" className="wp-axis-label">°C</text>
          {series.tempRange && (
            <>
              <text x={W - 4} y="11" textAnchor="end" className="wp-axis-label">{Math.round(series.tempRange.max)}</text>
              <text x={W - 4} y={PANEL_H - 3} textAnchor="end" className="wp-axis-label">{Math.round(series.tempRange.min)}</text>
            </>
          )}
        </g>

        {/* Panel 2: Niederschlag */}
        <g transform={`translate(0, ${PANEL_H + GAP})`}>
          <rect x="0" y="0" width={W} height={PANEL_H} fill="var(--cream-50, #FAF6EA)" stroke="var(--sand-200, #e0d6be)" />
          {series.precipBars.map((b, i) => (
            <rect
              key={i}
              x={b.x} y={b.y} width={b.w} height={b.h}
              fill={precipColor(b.type, b.source)}
              opacity={b.source === 'radar' ? 0.9 : 0.75}
            />
          ))}
          <text x="6" y="11" className="wp-axis-label">mm/h</text>
          <text x={W - 4} y="11" textAnchor="end" className="wp-axis-label">{fmt1(series.precipMaxScale)}</text>
        </g>

        {/* Panel 3: Wind */}
        <g transform={`translate(0, ${(PANEL_H + GAP) * 2})`}>
          <rect x="0" y="0" width={W} height={PANEL_H} fill="var(--cream-50, #FAF6EA)" stroke="var(--sand-200, #e0d6be)" />
          {series.windRibbon && <path d={series.windRibbon} fill="rgba(198, 99, 59, 0.18)" />}
          {series.windLine && <path d={series.windLine} fill="none" stroke="#4f627e" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />}
          {series.gustLine && <path d={series.gustLine} fill="none" stroke="var(--terracotta-500, #c6633b)" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" opacity="0.7" />}
          <text x="6" y="11" className="wp-axis-label">m/s</text>
          {series.windRange && (
            <text x={W - 4} y="11" textAnchor="end" className="wp-axis-label">{fmt1(series.windRange.max)}</text>
          )}
        </g>
      </svg>
      <div className="wp-axis-x">
        <span>0 km</span>
        <span>{totalKm.toFixed(1).replace('.', ',')} km</span>
      </div>
      <div className="wp-legend">
        <span><i className="wp-sw wp-sw-temp" /> Temperatur</span>
        <span><i className="wp-sw wp-sw-apparent" /> Gefühlt</span>
        {series.precipTypes.has('rain') && <span><i className="wp-sw wp-sw-rain" /> Regen</span>}
        {series.precipTypes.has('sleet') && <span><i className="wp-sw wp-sw-sleet" /> Schneeregen</span>}
        {series.precipTypes.has('snow') && <span><i className="wp-sw wp-sw-snow" /> Schnee</span>}
        <span><i className="wp-sw wp-sw-radar-mark" /> Radar (sonst NWP)</span>
        <span><i className="wp-sw wp-sw-wind" /> Wind</span>
        <span><i className="wp-sw wp-sw-gust" /> Böen</span>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------

interface BuiltSeries {
  totalM: number;
  height: number;
  tempLine: string | null;
  tempArea: string | null;
  apparentLine: string | null;
  apparentDiffers: boolean;
  tempRange: { min: number; max: number } | null;
  precipBars: Array<{ x: number; y: number; w: number; h: number; source: 'radar' | 'nwp'; type: 'rain' | 'sleet' | 'snow' | 'none' }>;
  precipMaxScale: number;
  /** Welche Niederschlagsarten kommen in dieser Tour vor (für Legenden-Anzeige). */
  precipTypes: Set<'rain' | 'sleet' | 'snow'>;
  windLine: string | null;
  gustLine: string | null;
  windRibbon: string | null;
  windRange: { min: number; max: number } | null;
}

function buildSeries(samples: SampleETA[]): BuiltSeries | null {
  const withW = samples.filter((s) => s.weather != null);
  if (withW.length < 2) return null;
  const totalM = samples[samples.length - 1].dist;
  if (totalM <= 0) return null;

  const x = (distM: number) => (distM / totalM) * W;

  // Temperatur-Range
  const ts: number[] = [];
  const ats: number[] = [];
  for (const s of withW) {
    if (s.weather?.temperatureC != null) ts.push(s.weather.temperatureC);
    if (s.weather?.apparentTempC != null) ats.push(s.weather.apparentTempC);
  }
  let tempRange: { min: number; max: number } | null = null;
  let tempLine: string | null = null;
  let tempArea: string | null = null;
  let apparentLine: string | null = null;
  let apparentDiffers = false;
  if (ts.length > 0) {
    const lo = Math.min(...ts);
    const hi = Math.max(...ts);
    const pad = Math.max(1, (hi - lo) * 0.1);
    tempRange = { min: lo - pad, max: hi + pad };
    const yT = (v: number) => PAD_Y + (1 - (v - tempRange!.min) / (tempRange!.max - tempRange!.min)) * (PANEL_H - 2 * PAD_Y);
    let line = '';
    let first = true;
    for (const s of withW) {
      const v = s.weather!.temperatureC;
      if (v == null) continue;
      line += `${first ? 'M' : 'L'} ${x(s.dist).toFixed(1)} ${yT(v).toFixed(1)} `;
      first = false;
    }
    tempLine = line.trim();
    tempArea = `${tempLine} L ${W} ${PANEL_H} L 0 ${PANEL_H} Z`;
    if (ats.length > 0) {
      let aline = '';
      let af = true;
      let diff = 0;
      for (const s of withW) {
        const v = s.weather!.apparentTempC;
        const t = s.weather!.temperatureC;
        if (v == null) continue;
        aline += `${af ? 'M' : 'L'} ${x(s.dist).toFixed(1)} ${yT(v).toFixed(1)} `;
        af = false;
        if (t != null) diff = Math.max(diff, Math.abs(v - t));
      }
      apparentLine = aline.trim();
      apparentDiffers = diff >= 1.0;            // nur zeigen wenn merklich anders
    }
  }

  // Niederschlag-Balken (Farb-Code nach Typ — Regen/Sleet/Schnee).
  const precipBars: BuiltSeries['precipBars'] = [];
  let precipMax = 0;
  for (const s of withW) {
    const v = s.weather?.precipitationMmH ?? 0;
    if (v > precipMax) precipMax = v;
  }
  const precipMaxScale = Math.max(4, Math.ceil(precipMax * 1.2));
  const yP = (v: number) => PAD_Y + (1 - v / precipMaxScale) * (PANEL_H - 2 * PAD_Y);
  for (let i = 0; i < withW.length; i++) {
    const s = withW[i];
    const v = s.weather?.precipitationMmH ?? 0;
    if (v <= 0) continue;
    const xCenter = x(s.dist);
    const nextDist = i + 1 < withW.length ? withW[i + 1].dist : s.dist;
    const prevDist = i > 0 ? withW[i - 1].dist : s.dist;
    const halfW = (Math.min(nextDist - s.dist, s.dist - prevDist) / totalM) * W * 0.45;
    const w = Math.max(1.5, halfW * 2);
    const y0 = yP(v);
    precipBars.push({
      x: xCenter - w / 2,
      y: y0,
      w,
      h: PANEL_H - PAD_Y - y0,
      source: s.weather!.precipitationSource === 'radar' ? 'radar' : 'nwp',
      type: s.weather!.precipitationType,
    });
  }

  // Welche Niederschlagsarten kommen vor (für die dynamische Legende).
  const precipTypes = new Set<'rain' | 'sleet' | 'snow'>();
  for (const b of precipBars) if (b.type !== 'none') precipTypes.add(b.type);

  // Wind-Panel
  const ws: number[] = [];
  const gs: number[] = [];
  for (const s of withW) {
    if (s.weather?.windSpeedMps != null) ws.push(s.weather.windSpeedMps);
    if (s.weather?.gustMps != null) gs.push(s.weather.gustMps);
  }
  let windRange: { min: number; max: number } | null = null;
  let windLine: string | null = null;
  let gustLine: string | null = null;
  let windRibbon: string | null = null;
  if (ws.length > 0) {
    const hi = Math.max(...ws, ...gs);
    windRange = { min: 0, max: Math.max(2, Math.ceil(hi * 1.1)) };
    const yW = (v: number) => PAD_Y + (1 - v / windRange!.max) * (PANEL_H - 2 * PAD_Y);
    let wl = '';
    let firstW = true;
    for (const s of withW) {
      const v = s.weather?.windSpeedMps;
      if (v == null) continue;
      wl += `${firstW ? 'M' : 'L'} ${x(s.dist).toFixed(1)} ${yW(v).toFixed(1)} `;
      firstW = false;
    }
    windLine = wl.trim();
    if (gs.length > 0) {
      let gl = '';
      let firstG = true;
      for (const s of withW) {
        const v = s.weather?.gustMps;
        if (v == null) continue;
        gl += `${firstG ? 'M' : 'L'} ${x(s.dist).toFixed(1)} ${yW(v).toFixed(1)} `;
        firstG = false;
      }
      gustLine = gl.trim();
      // Ribbon: forward = wind, backward = gust
      const upper = gustLine;
      const lower = ws.slice().reverse();
      let back = '';
      for (let i = withW.length - 1; i >= 0; i--) {
        const v = withW[i].weather?.windSpeedMps;
        if (v == null) continue;
        back += ` L ${x(withW[i].dist).toFixed(1)} ${yW(v).toFixed(1)}`;
      }
      windRibbon = `${upper}${back} Z`;
      void lower;
    }
  }

  return {
    totalM,
    height: PANEL_H * 3 + GAP * 2,
    tempLine, tempArea, apparentLine, apparentDiffers, tempRange,
    precipBars, precipMaxScale, precipTypes,
    windLine, gustLine, windRibbon, windRange,
  };
}

function fmt1(n: number): string { return (Math.round(n * 10) / 10).toString().replace('.', ','); }

/** Farbe pro Niederschlagsart. Radar-Variante etwas kräftiger; sonst gleiche Hue. */
function precipColor(type: 'rain' | 'sleet' | 'snow' | 'none', source: 'radar' | 'nwp'): string {
  // Regen → steel-blue; Schneeregen → violett; Schnee → blass-blau (Eisblau).
  if (type === 'snow') return source === 'radar' ? '#9ab8cf' : '#b6c8d6';
  if (type === 'sleet') return source === 'radar' ? '#8a6dc4' : '#a994d1';
  // 'rain' oder 'none' (sollte bei 'none' nicht gezeichnet werden)
  return source === 'radar' ? '#3a6fa3' : '#4f627e';
}
