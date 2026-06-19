/**
 * Tagesverlauf (Stunden): Temperaturkurve + Niederschlag/Wind auf Sekundärachse.
 */

import type { HourlyPoint } from '../historySource';
import { fmtNum } from './common';

interface Props { points: HourlyPoint[] }

export default function HourlyDayChart({ points }: Props) {
  const temps = points.map((p) => p.tempC).filter((v): v is number => v != null);
  if (temps.length < 4) return <div className="hi-chart-empty">Zu wenige Stundenwerte.</div>;
  const W = 880, H = 220, padL = 40, padR = 36, padT = 12, tempH = 130, gap = 12, precH = 40;
  const lo = Math.min(...temps) - 1, hi = Math.max(...temps) + 1;
  const x = (h: number) => padL + ((W - padL - padR) * h) / 23;
  const yT = (v: number) => padT + tempH * (1 - (v - lo) / Math.max(0.01, hi - lo));
  const maxP = Math.max(0.5, ...points.map((p) => p.precipMm ?? 0));
  const precTop = padT + tempH + gap;
  const yP = (p: number) => precTop + precH * (1 - p / maxP);
  const tp = points.filter((p) => p.tempC != null);
  const d = `M ${tp.map((p) => `${x(p.hour).toFixed(1)} ${yT(p.tempC as number).toFixed(1)}`).join(' L ')}`;
  const area = `${d} L ${x(tp[tp.length - 1].hour).toFixed(1)} ${padT + tempH} L ${x(tp[0].hour).toFixed(1)} ${padT + tempH} Z`;

  return (
    <div className="hi-chart-wrap">
      <svg className="hi-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Stündlicher Temperatur- und Niederschlagsverlauf.">
        {[lo, (lo + hi) / 2, hi].map((t, i) => <g key={i}><line x1={padL} y1={yT(t)} x2={W - padR} y2={yT(t)} stroke="#EEE6D2" /><text x={padL - 5} y={yT(t) + 3} className="hi-axislabel" textAnchor="end">{fmtNum(t, 0)}°</text></g>)}
        <path d={area} fill="#C0492F" opacity={0.08} />
        <path d={d} fill="none" stroke="#C0492F" strokeWidth={2.2} strokeLinejoin="round" />
        <line x1={padL} y1={precTop + precH} x2={W - padR} y2={precTop + precH} stroke="#D9CDB0" />
        {points.map((p) => (p.precipMm != null && p.precipMm > 0) && (
          <rect key={p.hour} x={x(p.hour) - 6} y={yP(p.precipMm)} width={12} height={precTop + precH - yP(p.precipMm)} fill="#3A6FA8" opacity={0.7}><title>{String(p.hour).padStart(2, '0')}:00 · {fmtNum(p.precipMm, 1)} mm</title></rect>
        ))}
        {maxP > 0.5 && <text x={W - padR + 4} y={precTop + 8} className="hi-axislabel" textAnchor="start">{fmtNum(maxP, 0)}mm</text>}
        {[0, 6, 12, 18, 23].map((h) => <text key={h} x={x(h)} y={H - 6} className="hi-axislabel" textAnchor="middle">{String(h).padStart(2, '0')}:00</text>)}
      </svg>
      <div className="hi-chart-foot"><span><i className="hi-sw" style={{ background: '#C0492F' }} /> Temperatur</span><span><i className="hi-sw" style={{ background: '#3A6FA8' }} /> Niederschlag</span></div>
    </div>
  );
}
