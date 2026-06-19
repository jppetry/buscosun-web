/**
 * Tagesband (E6.3): Tageswerte eines Jahres über Normalbereich (p10–p90) und
 * Rekordbereich (min–max) je Kalendertag. Zeigt, wie außergewöhnlich ein Tag war.
 */

import type { DayClim } from '../historyModel';
import { CHART, plotW, plotH, niceTicks, fmtNum } from './common';

const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

interface Props { clim: DayClim[]; series: { doy: number; value: number }[]; unit: string; year: number }

export default function DayBand({ clim, series, unit, year }: Props) {
  if (clim.length < 30) return <div className="hi-chart-empty">Zu wenige Tage für das Tagesband.</div>;
  const { W, H, PADL, PADT, PADR } = CHART;
  const pw = plotW(), ph = plotH();
  let lo = Infinity, hi = -Infinity;
  for (const c of clim) { lo = Math.min(lo, c.min); hi = Math.max(hi, c.max); }
  const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
  const x = (doy: number) => PADL + (pw * (doy - 1)) / 365;
  const y = (v: number) => PADT + ph * (1 - (v - lo) / Math.max(0.01, hi - lo));

  const area = (sel: (c: DayClim) => number, sel2: (c: DayClim) => number) =>
    `M ${clim.map((c) => `${x(c.doy).toFixed(1)} ${y(sel(c)).toFixed(1)}`).join(' L ')} L ${[...clim].reverse().map((c) => `${x(c.doy).toFixed(1)} ${y(sel2(c)).toFixed(1)}`).join(' L ')} Z`;
  const line = series.length >= 2 ? `M ${series.map((p) => `${x(p.doy).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' L ')}` : '';
  const ticks = niceTicks(lo, hi, 5);

  return (
    <div className="hi-chart-wrap">
      <svg className="hi-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tagesband ${year}: Verlauf gegen Normal- und Rekordbereich.`}>
        {ticks.map((t) => (
          <g key={t}><line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} stroke="#EEE6D2" />
            <text x={PADL - 6} y={y(t) + 3} className="hi-axislabel" textAnchor="end">{fmtNum(t, 0)}{unit === '°C' ? '°' : ''}</text></g>
        ))}
        <path d={area((c) => c.max, (c) => c.min)} fill="#C9B98E" opacity={0.3} />
        <path d={area((c) => c.p90, (c) => c.p10)} fill="#7A9466" opacity={0.35} />
        {line && <path d={line} fill="none" stroke="#C0492F" strokeWidth={1.6} strokeLinejoin="round" />}
        {MONTH_STARTS.map((doy, i) => <text key={i} x={x(doy)} y={H - 10} className="hi-axislabel" textAnchor="start">{MONTH_LABELS[i]}</text>)}
      </svg>
      <div className="hi-chart-foot">
        <span><i className="hi-sw" style={{ background: '#C9B98E' }} /> Rekordbereich</span>
        <span><i className="hi-sw" style={{ background: '#7A9466' }} /> Normalbereich (p10–p90)</span>
        <span><i className="hi-sw" style={{ background: '#C0492F' }} /> {year}</span>
      </div>
    </div>
  );
}
