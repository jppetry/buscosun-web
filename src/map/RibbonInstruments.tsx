/**
 * Instrument-Ribbon-Teile (Desktop-Redesign D1, Zone B — Signatur-Element):
 *
 *  - `RibbonSparkline`  — Trend des aktiven Skalars am gewählten Punkt über den
 *    Vorhersagezeitraum, mit Min/Max-Markern und einem Punkt an der aktuellen
 *    Slider-Stunde. Speist sich aus den Punkt-Dossier-Daten (Zone C), KEIN
 *    eigener Fetch. Ruhezustand ohne Punkt/Daten.
 *  - `RibbonLegend`     — dauerhaft sichtbare Farbskala des aktiven Layers mit
 *    Live-Cursor-Bubble am Punktwert (die zentrale Neuerung: „welche Farbe =
 *    welcher Wert" steckt nicht mehr nur im Hover).
 *
 * Reine Präsentation. Aktualisiert nur bei Daten-/Stunden-Änderung (kein
 * per-Frame-Repaint, Spec §8). Alle Farben stammen aus `legendModel`
 * (= den echten Render-Rampen).
 */

import { useMemo } from 'react';
import type { LayerKey } from '../MapView';
import type { PointForecast, PointForecastHour } from '../pointForecast/types';
import type { LegendSpec } from './legendModel';

/** Wert des aktiven Skalars in der Stunde (in der Legenden-Einheit). */
function valueForLayer(h: PointForecastHour, layer: LayerKey): number | null {
  switch (layer) {
    case 'temp': return h.temperature;
    case 'gust': return h.gustSpeed;
    case 'wind': return h.windSpeed;
    case 'nowcast': return h.precipitation;
    case 'clouds': return h.cloudCoverTotal;
    default: return null; // poprob/note-Layer: keine Punkt-Zeitreihe
  }
}

const SPARK_W = 640;
const SPARK_H = 40;

export function RibbonSparkline({
  data, legendLayer, forecastHour, sliderMax,
}: {
  data: PointForecast | null;
  legendLayer: LayerKey | null;
  forecastHour: number;
  sliderMax: number;
}) {
  const model = useMemo(() => {
    if (!data || !legendLayer) return null;
    const span = Math.max(1, Math.min(sliderMax, data.hours.length - 1));
    const pts: { i: number; v: number }[] = [];
    for (let i = 0; i <= span; i++) {
      const v = data.hours[i] ? valueForLayer(data.hours[i], legendLayer) : null;
      if (v != null && Number.isFinite(v)) pts.push({ i, v });
    }
    if (pts.length < 2) return null;
    let min = Infinity, max = -Infinity, minI = 0, maxI = 0;
    for (const p of pts) { if (p.v < min) { min = p.v; minI = p.i; } if (p.v > max) { max = p.v; maxI = p.i; } }
    const pad = (max - min) * 0.15 || 1;
    const lo = min - pad, hi = max + pad;
    const x = (i: number) => (i / span) * SPARK_W;
    const y = (v: number) => SPARK_H - ((v - lo) / (hi - lo)) * SPARK_H;
    const line = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const area = `${line} L${x(pts[pts.length - 1].i).toFixed(1)},${SPARK_H} L${x(pts[0].i).toFixed(1)},${SPARK_H} Z`;
    const cur = Math.max(0, Math.min(span, forecastHour));
    const curV = pts.reduce((a, b) => (Math.abs(b.i - cur) < Math.abs(a.i - cur) ? b : a));
    return { line, area, x, y, min, max, minI, maxI, curX: x(cur), curY: y(curV.v) };
  }, [data, legendLayer, forecastHour, sliderMax]);

  if (!model) {
    return <div className="wx-rb-spark is-empty" aria-hidden="true">Punkt auf der Karte wählen für den Trend</div>;
  }
  return (
    <div className="wx-rb-spark">
      <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" role="img" aria-label="Trend am gewählten Punkt">
        <defs>
          <linearGradient id="wx-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--terracotta-500)" stopOpacity="0.26" />
            <stop offset="1" stopColor="var(--terracotta-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={model.area} fill="url(#wx-spark-fill)" />
        <path d={model.line} fill="none" stroke="var(--terracotta-500)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx={model.x(model.maxI)} cy={model.y(model.max)} r="2.6" fill="var(--terracotta-500)" />
        <circle cx={model.x(model.minI)} cy={model.y(model.min)} r="2.6" fill="var(--steel-600)" />
        <circle cx={model.curX} cy={model.curY} r="3.4" fill="var(--terracotta-500)" stroke="var(--cream-50)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export function RibbonLegend({
  legend, pointData, forecastHour,
}: {
  legend: LegendSpec | null;
  pointData: PointForecast | null;
  forecastHour: number;
}) {
  if (!legend) {
    return (
      <div className="wx-rb-legend is-empty">
        <span className="wx-rb-lg-name">Keine Skala</span>
        <span className="wx-rb-lg-note">Einen Layer wählen, um Farbe → Wert zu sehen.</span>
      </div>
    );
  }

  if (legend.kind === 'note') {
    return (
      <div className="wx-rb-legend is-note">
        <span className="wx-rb-lg-name">{legend.name}</span>
        <span className="wx-rb-lg-note">{legend.note}</span>
      </div>
    );
  }

  // Kontinuierlich: Gradient + Ticks + Live-Cursor am Punktwert.
  const cur = pointData?.hours?.[Math.max(0, Math.min((pointData.hours.length - 1), Math.round(forecastHour)))];
  const rawVal = cur && legend ? valueForLayer(cur, legend.layer) : null;
  const pos = rawVal != null && legend.valueToPos ? legend.valueToPos(rawVal) : null;
  const bubble = rawVal != null && legend.format ? legend.format(rawVal) : null;

  return (
    <div className="wx-rb-legend">
      <span className="wx-rb-lg-name">{legend.name}{legend.unit ? ` ${legend.unit}` : ''}</span>
      <div className="wx-rb-scale-wrap">
        <div className="wx-rb-scale" style={{ background: legend.gradientCss }}>
          {pos != null && (
            <div className="wx-rb-cur" style={{ left: `${(pos * 100).toFixed(1)}%` }}>
              {bubble != null && <span className="wx-rb-bub">{bubble}</span>}
            </div>
          )}
        </div>
        <div className="wx-rb-ends">
          {legend.ticks?.map((t) => (
            <span key={`${t.label}-${t.at}`} style={{ left: `${(t.at * 100).toFixed(1)}%` }}>{t.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
