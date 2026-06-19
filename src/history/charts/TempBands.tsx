/**
 * Temperaturbänder (E6.6): Anteil der Zeit je Temperaturkategorie über das Jahr,
 * als gestapelte Flächen pro Monat.
 */

import { TEMP_BANDS } from '../historyModel';
import { CHART, plotW, plotH } from './common';

const MONTH_LABELS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

interface Props { data: { month: number; label: string; shares: number[] }[] }

export default function TempBands({ data }: Props) {
  if (data.length < 6) return <div className="hi-chart-empty">Zu wenige Monate.</div>;
  const { W, H, PADL, PADT, PADR } = CHART;
  const pw = plotW(), ph = plotH();
  const bw = pw / 12;
  const x = (m: number) => PADL + (m - 1) * bw;
  const y = (frac: number) => PADT + ph * (1 - frac);
  const byMonth = new Map(data.map((d) => [d.month, d.shares]));

  return (
    <div className="hi-chart-wrap">
      <svg className="hi-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Anteil der Zeit je Temperaturband über das Jahr.">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}><line x1={PADL} y1={y(f)} x2={W - PADR} y2={y(f)} stroke="#EEE6D2" />
            <text x={PADL - 6} y={y(f) + 3} className="hi-axislabel" textAnchor="end">{Math.round(f * 100)}%</text></g>
        ))}
        {Array.from({ length: 12 }, (_, mi) => {
          const shares = byMonth.get(mi + 1);
          if (!shares) return null;
          let acc = 0;
          return TEMP_BANDS.map((b, bi) => {
            const h = shares[bi] * ph; const yTop = PADT + ph - acc - h; acc += h;
            return <rect key={`${mi}-${bi}`} x={x(mi + 1) + 1} y={yTop} width={bw - 2} height={Math.max(0, h)} fill={b.color}><title>{MONTH_LABELS[mi]} · {b.label}: {Math.round(shares[bi] * 100)}%</title></rect>;
          });
        })}
        {MONTH_LABELS.map((m, i) => <text key={m} x={x(i + 1) + bw / 2} y={H - 10} className="hi-axislabel" textAnchor="middle">{m[0]}</text>)}
      </svg>
      <div className="hi-chart-foot">
        {TEMP_BANDS.slice().reverse().map((b) => <span key={b.id}><i className="hi-sw" style={{ background: b.color }} /> {b.label}</span>)}
      </div>
    </div>
  );
}
