/**
 * Stacked line/bar charts for the full 24-hour point forecast.
 *
 * One panel per variable (T, Wind, Niederschlag, Wolken). Pure SVG —
 * no dependency on a chart library so the bundle stays slim.
 */

import type { PointForecast, PointForecastHour } from './types';

interface Props {
  data: PointForecast;
}

const W = 320;
const H = 64;
const PAD_L = 24;
const PAD_R = 6;
const PAD_T = 6;
const PAD_B = 14;

export function PointForecastCharts({ data }: Props) {
  const hrs = data.hours;
  if (!hrs.length) return null;

  return (
    <div className="pfc-ch">
      <ChartLine
        title="Temperatur"
        hours={hrs}
        pick={(h) => h.temperature}
        unit="°C"
        strokeColor="var(--terracotta-500)"
        fill="rgba(201, 123, 71, 0.18)"
        decimals={1}
      />
      <ChartLine
        title="Wind"
        hours={hrs}
        pick={(h) => h.windSpeed}
        unit="m/s"
        strokeColor="var(--steel-600)"
        fill="rgba(58, 111, 168, 0.18)"
        decimals={1}
        minimumRange={4}
      />
      <ChartBars
        title="Niederschlag"
        hours={hrs}
        pick={(h) => h.precipitation}
        unit="mm/h"
        color="var(--steel-600)"
        decimals={1}
      />
      <ChartLine
        title="Bewölkung"
        hours={hrs}
        pick={(h) => h.cloudCoverTotal}
        unit="%"
        strokeColor="var(--slate-500)"
        fill="rgba(107, 122, 143, 0.18)"
        decimals={0}
        yMax={100}
        yMin={0}
      />

      <div className="pfc-ch-legend">
        <span className="eyebrow">Lesehilfe</span>
        <div className="pfc-ch-legend-row">
          <span className="pfc-ch-legend-swatch" style={{ background: 'var(--terracotta-500)' }} />
          <span>Temperatur · MOSMIX gewichtet</span>
        </div>
        <div className="pfc-ch-legend-row">
          <span className="pfc-ch-legend-swatch" style={{ background: 'var(--steel-600)' }} />
          <span>Wind &amp; Niederschlag · ICON-D2 + RADOLAN-RV</span>
        </div>
        <div className="pfc-ch-legend-row">
          <span className="pfc-ch-legend-swatch" style={{ background: 'var(--slate-500)' }} />
          <span>Bewölkung · ICON-D2 effektiv</span>
        </div>
      </div>
    </div>
  );
}

interface ChartLineProps {
  title: string;
  hours: PointForecastHour[];
  pick: (h: PointForecastHour) => number | null;
  unit: string;
  strokeColor: string;
  fill: string;
  decimals: number;
  yMin?: number;
  yMax?: number;
  minimumRange?: number;
}

function ChartLine({ title, hours, pick, unit, strokeColor, fill, decimals, yMin, yMax, minimumRange = 2 }: ChartLineProps) {
  const values: Array<{ x: number; v: number | null }> = hours.map((h, i) => ({ x: i, v: pick(h) }));
  const finite = values.map((p) => p.v).filter((v): v is number => v != null && Number.isFinite(v));
  if (!finite.length) return null;
  const dataMin = yMin ?? Math.min(...finite);
  let dataMax = yMax ?? Math.max(...finite);
  if (dataMax - dataMin < minimumRange) dataMax = dataMin + minimumRange;
  const range = dataMax - dataMin;

  const x = (i: number) => PAD_L + (i / Math.max(1, hours.length - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - dataMin) / range) * (H - PAD_T - PAD_B);

  // Build path skipping NaN gaps.
  let d = '';
  let area = '';
  let started = false;
  for (const p of values) {
    if (p.v == null || !Number.isFinite(p.v)) {
      started = false;
      continue;
    }
    if (!started) {
      d += `M ${x(p.x).toFixed(1)} ${y(p.v).toFixed(1)}`;
      area += (area ? ' Z M ' : 'M ') + `${x(p.x).toFixed(1)} ${(H - PAD_B).toFixed(1)} L ${x(p.x).toFixed(1)} ${y(p.v).toFixed(1)}`;
      started = true;
    } else {
      d += ` L ${x(p.x).toFixed(1)} ${y(p.v).toFixed(1)}`;
      area += ` L ${x(p.x).toFixed(1)} ${y(p.v).toFixed(1)}`;
    }
  }
  if (area) area += ` L ${x(values[values.length - 1].x).toFixed(1)} ${(H - PAD_B).toFixed(1)} Z`;

  return (
    <div className="pfc-ch-block">
      <div className="pfc-ch-title">
        <span>{title}</span>
        <span className="pfc-ch-now">
          {finite[0] != null ? `${finite[0].toFixed(decimals)} ${unit}` : ''}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="pfc-ch-svg" preserveAspectRatio="none">
        <line
          x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B}
          stroke="#ccc" strokeWidth={0.5}
        />
        {/* y-axis labels (min, max) */}
        <text x={PAD_L - 2} y={PAD_T + 6} textAnchor="end" className="pfc-ch-axis">{formatAxis(dataMax, decimals)}</text>
        <text x={PAD_L - 2} y={H - PAD_B - 1} textAnchor="end" className="pfc-ch-axis">{formatAxis(dataMin, decimals)}</text>
        {/* x-axis ticks every 6 h */}
        {hours.map((h, i) => i % 6 === 0 && (
          <text key={i} x={x(i)} y={H - 2} textAnchor="middle" className="pfc-ch-axis">
            {i === 0 ? 'jetzt' : h.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit' })}
          </text>
        ))}
        <path d={area} fill={fill} stroke="none" />
        <path d={d} stroke={strokeColor} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

interface ChartBarsProps {
  title: string;
  hours: PointForecastHour[];
  pick: (h: PointForecastHour) => number | null;
  unit: string;
  color: string;
  decimals: number;
}

function ChartBars({ title, hours, pick, unit, color, decimals }: ChartBarsProps) {
  const values = hours.map((h) => pick(h) ?? 0);
  const dataMax = Math.max(1, ...values);
  const x = (i: number) => PAD_L + (i / Math.max(1, hours.length - 1)) * (W - PAD_L - PAD_R);
  const barW = Math.max(2, (W - PAD_L - PAD_R) / hours.length - 1);
  const y = (v: number) => PAD_T + (1 - v / dataMax) * (H - PAD_T - PAD_B);

  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div className="pfc-ch-block">
      <div className="pfc-ch-title">
        <span>{title}</span>
        <span className="pfc-ch-now">{total > 0.05 ? `Σ ${total.toFixed(decimals)} ${unit.replace('/h', '')}` : 'kein Niederschlag'}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="pfc-ch-svg" preserveAspectRatio="none">
        <line
          x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B}
          stroke="#ccc" strokeWidth={0.5}
        />
        <text x={PAD_L - 2} y={PAD_T + 6} textAnchor="end" className="pfc-ch-axis">{formatAxis(dataMax, decimals)}</text>
        <text x={PAD_L - 2} y={H - PAD_B - 1} textAnchor="end" className="pfc-ch-axis">0</text>
        {hours.map((h, i) => i % 6 === 0 && (
          <text key={`tx${i}`} x={x(i)} y={H - 2} textAnchor="middle" className="pfc-ch-axis">
            {i === 0 ? 'jetzt' : h.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit' })}
          </text>
        ))}
        {values.map((v, i) => {
          if (v <= 0.01) return null;
          const py = y(v);
          return (
            <rect
              key={i}
              x={x(i) - barW / 2}
              y={py}
              width={barW}
              height={(H - PAD_B) - py}
              fill={color}
              opacity={0.85}
            >
              <title>{`+${i} h: ${v.toFixed(decimals)} ${unit}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

function formatAxis(v: number, decimals: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(Math.min(decimals, 1));
}
