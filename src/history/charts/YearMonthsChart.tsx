/**
 * Jahr auf einen Blick: je Monat eine Temperatur-Band (Ø Tmin–Ø Tmax) mit
 * Mittelpunkt + Niederschlagssumme als Balken auf der Sekundärachse.
 */

import type { YearMonthPoint } from '../historyExplore';
import { absTempColor } from '../historyColors';
import { CHART, niceTicks, fmtNum } from './common';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

interface Props { months: YearMonthPoint[]; onPickMonth?: (month: number) => void }

export default function YearMonthsChart({ months, onPickMonth }: Props) {
  const temps = months.flatMap((m) => [m.tMinMeanC, m.tMaxMeanC]).filter((v): v is number => v != null);
  if (temps.length < 4) return <div className="hi-chart-empty">Für dieses Jahr liegen zu wenige Daten vor.</div>;
  const { W, PADL, PADR } = CHART;
  const H = 300, padT = 14, tempH = 180, gap = 16, precH = 64;
  const lo = Math.min(...temps) - 2, hi = Math.max(...temps) + 2;
  const slot = (W - PADL - PADR) / 12;
  const x = (m: number) => PADL + slot * (m - 0.5);
  const yT = (v: number) => padT + tempH * (1 - (v - lo) / Math.max(0.01, hi - lo));
  const maxP = Math.max(1, ...months.map((m) => m.precipSum));
  const precTop = padT + tempH + gap;
  const yP = (p: number) => precTop + precH * (1 - p / maxP);
  const bw = Math.min(34, slot * 0.5);
  const ticks = niceTicks(lo, hi, 5);

  return (
    <div className="hi-chart-wrap">
      <svg className="hi-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Temperatur-Band und Niederschlag je Monat.">
        {ticks.map((t) => (
          <g key={t}><line x1={PADL} y1={yT(t)} x2={W - PADR} y2={yT(t)} stroke="#EEE6D2" />
            <text x={PADL - 6} y={yT(t) + 3} className="hi-axislabel" textAnchor="end">{fmtNum(t, 0)}°</text></g>
        ))}
        {months.map((m) => (m.tMinMeanC != null && m.tMaxMeanC != null) && (
          <g key={`t${m.month}`} onClick={onPickMonth ? () => onPickMonth(m.month) : undefined} style={onPickMonth ? { cursor: 'pointer' } : undefined}>
            <rect x={x(m.month) - bw / 2} y={yT(m.tMaxMeanC)} width={bw} height={Math.max(2, yT(m.tMinMeanC) - yT(m.tMaxMeanC))} rx={5} fill={absTempColor(m.tMeanC ?? 0)} opacity={0.9}>
              <title>{MONTHS[m.month - 1]}: Ø {fmtNum(m.tMeanC ?? 0)} °C ({fmtNum(m.tMinMeanC)}–{fmtNum(m.tMaxMeanC)}), {fmtNum(m.precipSum, 0)} mm</title>
            </rect>
            {m.tMeanC != null && <circle cx={x(m.month)} cy={yT(m.tMeanC)} r={2.6} fill="#2C2A26" />}
          </g>
        ))}
        <line x1={PADL} y1={precTop + precH} x2={W - PADR} y2={precTop + precH} stroke="#D9CDB0" />
        {months.map((m) => m.precipSum > 0 && (
          <rect key={`p${m.month}`} x={x(m.month) - bw / 2} y={yP(m.precipSum)} width={bw} height={precTop + precH - yP(m.precipSum)} fill="#3A6FA8" opacity={0.7}><title>{MONTHS[m.month - 1]}: {fmtNum(m.precipSum, 0)} mm</title></rect>
        ))}
        <text x={PADL - 6} y={precTop + 8} className="hi-axislabel" textAnchor="end">{fmtNum(maxP, 0)}mm</text>
        {months.map((m) => <text key={`l${m.month}`} x={x(m.month)} y={H - 6} className="hi-axislabel" textAnchor="middle">{MONTHS[m.month - 1][0]}</text>)}
      </svg>
      <div className="hi-chart-foot"><span className="hi-ref-tag">Band = Ø Tmin–Tmax je Monat (Punkt = Mittel) · blau = Monatsniederschlag · klick für Monat</span></div>
    </div>
  );
}
