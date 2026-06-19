/**
 * Kenntage-Balken je Jahr (E4.3) + Hervorhebung des Rekordjahres (E8.2).
 */

import { CHART, plotW, plotH, niceTicks } from './common';

interface Props {
  data: { year: number; count: number; n: number }[];
  label: string;
  threshold: number;
  unitHint: string;
  onPick?: (year: number) => void;
  focusYear?: number | null;
}

export default function KenntageBars({ data, label, threshold, unitHint, onPick, focusYear }: Props) {
  const valid = data.filter((d) => d.n > 0);
  if (valid.length < 2) return <div className="hi-chart-empty">Zu wenige Jahre.</div>;
  const { W, H, PADL, PADT, PADR } = CHART;
  const pw = plotW(), ph = plotH();
  const maxC = Math.max(...valid.map((d) => d.count), 1);
  const recordYear = valid.reduce((a, b) => (b.count > a.count ? b : a), valid[0]);
  const x0 = valid[0].year, x1 = valid[valid.length - 1].year;
  const x = (yr: number) => PADL + (pw * (yr - x0)) / Math.max(1, x1 - x0);
  const y = (c: number) => PADT + ph * (1 - c / (maxC * 1.1));
  const bw = Math.max(1.5, (pw / valid.length) * 0.8);
  const ticks = niceTicks(0, maxC * 1.1, 4);

  return (
    <div className="hi-chart-wrap">
      <svg className="hi-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} pro Jahr, Schwelle ${threshold} ${unitHint}. Rekordjahr ${recordYear.year} mit ${recordYear.count}.`}>
        {ticks.map((t) => (
          <g key={t}><line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} stroke="#E6DCC6" />
            <text x={PADL - 6} y={y(t) + 3} className="hi-axislabel" textAnchor="end">{Math.round(t)}</text></g>
        ))}
        {valid.map((d) => {
          const isRec = d.year === recordYear.year, isFocus = d.year === focusYear;
          return <rect key={d.year} x={x(d.year) - bw / 2} y={y(d.count)} width={bw} height={Math.max(0, PADT + ph - y(d.count))}
            fill={isRec ? '#C0492F' : isFocus ? '#C99A4E' : '#D4A373'} opacity={isRec || isFocus ? 1 : 0.9}
            onClick={onPick ? () => onPick(d.year) : undefined} style={onPick ? { cursor: 'pointer' } : undefined}>
            <title>{d.year}: {d.count} {label}</title>
          </rect>;
        })}
        {valid.filter((_, i) => i % Math.ceil(valid.length / 8) === 0).map((d) => (
          <text key={d.year} x={x(d.year)} y={H - 10} className="hi-axislabel" textAnchor="middle">{d.year}</text>
        ))}
      </svg>
      <div className="hi-chart-foot">
        <span className="hi-record-tag">Rekordjahr {recordYear.year} · {recordYear.count} {label}</span>
        <span className="hi-ref-tag">Schwelle: {threshold} {unitHint}</span>
      </div>
    </div>
  );
}
