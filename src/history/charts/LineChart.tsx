/**
 * Generischer Linien-/Wertverlauf (E4.1) für eine aggregierte Reihe.
 */

import type { Bucket } from '../historyModel';
import { CHART, plotW, plotH, niceTicks, fmtNum } from './common';

interface Props { buckets: Bucket[]; unit: string; color?: string; onPick?: (year: number) => void }

export default function LineChart({ buckets, unit, color = '#3A6FA8', onPick }: Props) {
  const data = buckets.filter((b) => b.value != null);
  if (data.length < 2) return <div className="hi-chart-empty">Zu wenige Werte.</div>;
  const { W, H, PADL, PADT, PADR } = CHART;
  const pw = plotW(), ph = plotH();
  const t0 = data[0].t, t1 = data[data.length - 1].t;
  let lo = Math.min(...data.map((b) => b.value as number)), hi = Math.max(...data.map((b) => b.value as number));
  const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const x = (t: number) => PADL + (pw * (t - t0)) / Math.max(1e-6, t1 - t0);
  const y = (v: number) => PADT + ph * (1 - (v - lo) / Math.max(0.01, hi - lo));
  const d = `M ${data.map((b) => `${x(b.t).toFixed(1)} ${y(b.value as number).toFixed(1)}`).join(' L ')}`;
  const ticks = niceTicks(lo, hi, 5);

  return (
    <div className="hi-chart-wrap">
      <svg className="hi-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Verlauf, ${data.length} Werte in ${unit}.`}>
        {ticks.map((t) => (
          <g key={t}><line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} stroke="#EEE6D2" />
            <text x={PADL - 6} y={y(t) + 3} className="hi-axislabel" textAnchor="end">{fmtNum(t, 0)}{unit === '°C' ? '°' : ''}</text></g>
        ))}
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {data.length <= 40 && data.map((b) => (
          <circle key={b.key} cx={x(b.t)} cy={y(b.value as number)} r={2.2} fill={color}
            onClick={onPick ? () => onPick(b.year) : undefined} style={onPick ? { cursor: 'pointer' } : undefined}><title>{b.label}: {fmtNum(b.value as number)} {unit}</title></circle>
        ))}
        {data.filter((_, i) => i % Math.ceil(data.length / 8) === 0).map((b) => (
          <text key={b.key} x={x(b.t)} y={H - 10} className="hi-axislabel" textAnchor="middle">{b.year}</text>
        ))}
      </svg>
    </div>
  );
}
