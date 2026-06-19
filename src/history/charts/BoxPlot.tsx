/**
 * Box-Plot je Monat (E6.7): Verteilung (Median, Quartile, Min/Max) über die Jahre.
 */

import type { BoxStats } from '../historyModel';
import { CHART, plotW, plotH, niceTicks, fmtNum } from './common';

interface Props { data: BoxStats[]; unit: string }

export default function BoxPlot({ data, unit }: Props) {
  if (data.length < 3) return <div className="hi-chart-empty">Zu wenige Monate.</div>;
  const { W, H, PADL, PADT, PADR } = CHART;
  const pw = plotW(), ph = plotH();
  const lo = Math.min(...data.map((d) => d.min)), hi = Math.max(...data.map((d) => d.max));
  const pad = (hi - lo) * 0.05 || 1;
  const y = (v: number) => PADT + ph * (1 - (v - (lo - pad)) / Math.max(0.01, (hi + pad) - (lo - pad)));
  const slot = pw / data.length;
  const bw = Math.min(28, slot * 0.6);
  const ticks = niceTicks(lo - pad, hi + pad, 5);

  return (
    <div className="hi-chart-wrap">
      <svg className="hi-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Box-Plot der Monatsverteilung über die Jahre.">
        {ticks.map((t) => (
          <g key={t}><line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} stroke="#EEE6D2" />
            <text x={PADL - 6} y={y(t) + 3} className="hi-axislabel" textAnchor="end">{fmtNum(t, 0)}{unit === '°C' ? '°' : ''}</text></g>
        ))}
        {data.map((d, i) => {
          const cx = PADL + slot * (i + 0.5);
          return (
            <g key={d.month}>
              <line x1={cx} y1={y(d.max)} x2={cx} y2={y(d.min)} stroke="#9AA7B5" strokeWidth={1} />
              <rect x={cx - bw / 2} y={y(d.q3)} width={bw} height={Math.max(1, y(d.q1) - y(d.q3))} fill="#CFE0C3" stroke="#7A9466" strokeWidth={1}>
                <title>{d.label}: Median {fmtNum(d.median)} {unit} (Q1 {fmtNum(d.q1)} – Q3 {fmtNum(d.q3)})</title>
              </rect>
              <line x1={cx - bw / 2} y1={y(d.median)} x2={cx + bw / 2} y2={y(d.median)} stroke="#2C2A26" strokeWidth={1.6} />
              <text x={cx} y={H - 10} className="hi-axislabel" textAnchor="middle">{d.label[0]}</text>
            </g>
          );
        })}
      </svg>
      <div className="hi-chart-foot"><span className="hi-ref-tag">Box = Q1–Q3, Linie = Median, Whisker = Min–Max je Monat über alle Jahre</span></div>
    </div>
  );
}
