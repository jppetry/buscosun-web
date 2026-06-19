/**
 * Monat auf einen Blick: je Tag eine Temperatur-Spanne (Tmin–Tmax, nach Mittel
 * eingefärbt) plus Niederschlag als Balken auf der Sekundärachse.
 */

import type { MonthDayPoint } from '../historyExplore';
import { absTempColor } from '../historyColors';
import { CHART, niceTicks, fmtNum } from './common';

interface Props { days: MonthDayPoint[]; onPickDay?: (day: number) => void }

export default function MonthDaysChart({ days, onPickDay }: Props) {
  const temps = days.flatMap((d) => [d.tMin, d.tMax]).filter((v): v is number => v != null);
  if (temps.length < 4) return <div className="hi-chart-empty">Für diesen Monat liegen zu wenige Tage vor.</div>;
  const { W, PADL, PADR } = CHART;
  const H = 280, padT = 14, tempH = 170, gap = 16, precH = 56;
  const lo = Math.min(...temps) - 1, hi = Math.max(...temps) + 1;
  const n = days.length;
  const slot = (W - PADL - PADR) / n;
  const x = (i: number) => PADL + slot * (i + 0.5);
  const yT = (v: number) => padT + tempH * (1 - (v - lo) / Math.max(0.01, hi - lo));
  const maxP = Math.max(1, ...days.map((d) => d.precip ?? 0));
  const precTop = padT + tempH + gap;
  const yP = (p: number) => precTop + precH * (1 - p / maxP);
  const bw = Math.min(14, slot * 0.6);
  const ticks = niceTicks(lo, hi, 5);

  return (
    <div className="hi-chart-wrap">
      <svg className="hi-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Temperaturspanne und Niederschlag je Tag des Monats.">
        {ticks.map((t) => (
          <g key={t}><line x1={PADL} y1={yT(t)} x2={W - PADR} y2={yT(t)} stroke="#EEE6D2" />
            <text x={PADL - 6} y={yT(t) + 3} className="hi-axislabel" textAnchor="end">{fmtNum(t, 0)}°</text></g>
        ))}
        {days.map((d, i) => (d.tMin != null && d.tMax != null) && (
          <rect key={`t${d.day}`} x={x(i) - bw / 2} y={yT(d.tMax)} width={bw} height={Math.max(2, yT(d.tMin) - yT(d.tMax))} rx={bw / 2}
            fill={absTempColor(d.tMean ?? (d.tMax + d.tMin) / 2)} onClick={onPickDay ? () => onPickDay(d.day) : undefined} style={onPickDay ? { cursor: 'pointer' } : undefined}>
            <title>{d.day}.: {fmtNum(d.tMin)}–{fmtNum(d.tMax)} °C{d.precip ? `, ${fmtNum(d.precip, 1)} mm` : ''}</title>
          </rect>
        ))}
        {/* Niederschlag */}
        <line x1={PADL} y1={precTop + precH} x2={W - PADR} y2={precTop + precH} stroke="#D9CDB0" />
        {days.map((d, i) => (d.precip != null && d.precip > 0) && (
          <rect key={`p${d.day}`} x={x(i) - bw / 2} y={yP(d.precip)} width={bw} height={precTop + precH - yP(d.precip)} fill="#3A6FA8" opacity={0.7}><title>{d.day}.: {fmtNum(d.precip, 1)} mm</title></rect>
        ))}
        <text x={PADL - 6} y={precTop + 8} className="hi-axislabel" textAnchor="end">{fmtNum(maxP, 0)}mm</text>
        {days.filter((_, i) => i % Math.ceil(n / 10) === 0).map((d, i) => <text key={i} x={x(days.indexOf(d))} y={H - 6} className="hi-axislabel" textAnchor="middle">{d.day}.</text>)}
      </svg>
      <div className="hi-chart-foot"><span className="hi-ref-tag">Balken = Tagesspanne Tmin–Tmax (Farbe = Mittel) · blau = Niederschlag</span></div>
    </div>
  );
}
