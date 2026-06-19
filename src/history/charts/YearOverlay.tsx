/**
 * Jahres-Overlay / „Spaghetti" (E6.5): mehrere Jahre als Tageslinien, das
 * aktuelle/gewählte Jahr hervorgehoben gegen die Vorjahre.
 */

import { useMemo } from 'react';
import type { DailyRecord, VariableMeta } from '../historyModel';
import { daySeries } from '../historyModel';
import { CHART, plotW, plotH, niceTicks, fmtNum } from './common';

const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

interface Props { days: DailyRecord[]; meta: VariableMeta; focusYear: number; years: number[] }

export default function YearOverlay({ days, meta, focusYear, years }: Props) {
  const seriesByYear = useMemo(() => years.map((y) => ({ year: y, pts: daySeries(days, y, meta.key) })).filter((s) => s.pts.length > 10), [days, years, meta.key]);
  if (seriesByYear.length < 2) return <div className="hi-chart-empty">Zu wenige Jahre für die Überlagerung.</div>;
  const { W, H, PADL, PADT, PADR } = CHART;
  const pw = plotW(), ph = plotH();
  let lo = Infinity, hi = -Infinity;
  for (const s of seriesByYear) for (const p of s.pts) { lo = Math.min(lo, p.value); hi = Math.max(hi, p.value); }
  const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
  const x = (doy: number) => PADL + (pw * (doy - 1)) / 365;
  const y = (v: number) => PADT + ph * (1 - (v - lo) / Math.max(0.01, hi - lo));
  const path = (pts: { doy: number; value: number }[]) => `M ${pts.map((p) => `${x(p.doy).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' L ')}`;
  const ticks = niceTicks(lo, hi, 5);
  const focus = seriesByYear.find((s) => s.year === focusYear);

  return (
    <div className="hi-chart-wrap">
      <svg className="hi-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Jahres-Overlay, ${focusYear} hervorgehoben.`}>
        {ticks.map((t) => (
          <g key={t}><line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} stroke="#EEE6D2" />
            <text x={PADL - 6} y={y(t) + 3} className="hi-axislabel" textAnchor="end">{fmtNum(t, 0)}{meta.unit === '°C' ? '°' : ''}</text></g>
        ))}
        {seriesByYear.filter((s) => s.year !== focusYear).map((s) => <path key={s.year} d={path(s.pts)} fill="none" stroke="#9AA7B5" strokeWidth={0.8} opacity={0.35} />)}
        {focus && <path d={path(focus.pts)} fill="none" stroke="#C0492F" strokeWidth={2.2} strokeLinejoin="round" />}
        {MONTH_STARTS.map((doy, i) => <text key={i} x={x(doy)} y={H - 10} className="hi-axislabel" textAnchor="start">{MONTH_LABELS[i]}</text>)}
      </svg>
      <div className="hi-chart-foot">
        <span><i className="hi-sw" style={{ background: '#C0492F' }} /> {focusYear}</span>
        <span><i className="hi-sw" style={{ background: '#9AA7B5' }} /> Vorjahre ({seriesByYear.length - 1})</span>
      </div>
    </div>
  );
}
