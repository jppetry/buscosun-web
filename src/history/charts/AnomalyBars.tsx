/**
 * Anomalie-Balken (E5.2) + optionale Trendlinie (E5.3).
 * Nulllinie = Normalwert der Referenzperiode; über/unter Normal farblich getrennt.
 */

import type { AnomalyPoint, TrendResult } from '../historyModel';
import { divergingColor, anomalySpan } from '../historyColors';
import { CHART, plotW, plotH, niceTicks, fmtNum } from './common';

interface Props {
  points: AnomalyPoint[];
  unit: string;
  trend: TrendResult | null;
  normalLabel: string;
  onPick?: (year: number) => void;
}

const WARM = '#C97B47', COLD = '#3A6FA8';

export default function AnomalyBars({ points, unit, trend, normalLabel, onPick }: Props) {
  if (points.length < 2) return <div className="hi-chart-empty">Zu wenige Werte für Anomalien.</div>;
  const { W, H, PADL, PADT } = CHART;
  const pw = plotW(), ph = plotH();
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const maxAbs = Math.max(...points.map((p) => Math.abs(p.anomaly))) || 1;
  const yMax = maxAbs * 1.1;
  const x = (t: number) => PADL + (pw * (t - t0)) / Math.max(1e-6, t1 - t0);
  const y = (v: number) => PADT + ph * (1 - (v + yMax) / (2 * yMax));
  const bw = Math.max(1, (pw / points.length) * 0.8);

  const span = anomalySpan(points.map((p) => p.anomaly));
  const ticks = niceTicks(-yMax, yMax, 5);
  const trendLine = trend
    ? { x1: x(trend.firstT), y1: y(trend.intercept + trend.slopePerYear * trend.firstT), x2: x(trend.lastT), y2: y(trend.intercept + trend.slopePerYear * trend.lastT) }
    : null;

  return (
    <div className="hi-chart-wrap">
      <svg className="hi-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Abweichung vom Normal ${normalLabel}. ${trend ? `Trend ${fmtNum(trend.slopePerDecade, 2)} ${unit} pro Jahrzehnt.` : ''}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PADL} y1={y(t)} x2={W - CHART.PADR} y2={y(t)} stroke={t === 0 ? '#B8A98C' : '#E6DCC6'} strokeWidth={t === 0 ? 1.4 : 1} />
            <text x={PADL - 6} y={y(t) + 3} className="hi-axislabel" textAnchor="end">{t > 0 ? '+' : ''}{fmtNum(t, 0)}{unit === '°C' ? '°' : ''}</text>
          </g>
        ))}
        {points.map((p) => {
          const yy = y(p.anomaly), y0 = y(0);
          return <rect key={p.year} x={x(p.t) - bw / 2} y={Math.min(yy, y0)} width={bw} height={Math.abs(yy - y0)}
            fill={divergingColor(p.anomaly, span)} opacity={0.95}
            onClick={onPick ? () => onPick(p.year) : undefined} style={onPick ? { cursor: 'pointer' } : undefined}>
            <title>{p.label}: {p.anomaly >= 0 ? '+' : ''}{fmtNum(p.anomaly)} {unit}</title>
          </rect>;
        })}
        {trendLine && <line x1={trendLine.x1} y1={trendLine.y1} x2={trendLine.x2} y2={trendLine.y2} stroke="#2C2A26" strokeWidth={2.4} strokeDasharray="2 3" />}
        {points.filter((_, i) => i % Math.ceil(points.length / 8) === 0).map((p) => (
          <text key={p.year} x={x(p.t)} y={H - 10} className="hi-axislabel" textAnchor="middle">{p.year}</text>
        ))}
      </svg>
      <div className="hi-chart-foot">
        <span><i className="hi-sw" style={{ background: WARM }} /> über Normal</span>
        <span><i className="hi-sw" style={{ background: COLD }} /> unter Normal</span>
        {trend && <span className="hi-trend-tag">Trend {trend.slopePerDecade >= 0 ? '+' : ''}{fmtNum(trend.slopePerDecade, 2)} {unit}/Jahrzehnt</span>}
        <span className="hi-ref-tag">Nulllinie = Normal {normalLabel}</span>
      </div>
    </div>
  );
}
