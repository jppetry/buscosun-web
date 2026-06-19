/**
 * Warming Stripes (E6.1/6.2): je Jahr ein Streifen, eingefärbt nach Abweichung
 * vom Mittel. Optionale Achsen-/Wertbeschriftung (US-6.2).
 */

import type { Bucket } from '../historyModel';
import { divergingColor, anomalySpan } from '../historyColors';
import { fmtNum } from './common';

interface Props { buckets: Bucket[]; unit: string; showLabels: boolean; onPick?: (year: number) => void }

export default function Stripes({ buckets, unit, showLabels, onPick }: Props) {
  const data = buckets.filter((b) => b.value != null);
  if (data.length < 2) return <div className="hi-chart-empty">Zu wenige Jahre für Streifen.</div>;
  const mean = data.reduce((s, b) => s + (b.value as number), 0) / data.length;
  const anoms = data.map((b) => (b.value as number) - mean);
  const span = anomalySpan(anoms);

  const W = 920, H = showLabels ? 210 : 150, padB = showLabels ? 34 : 8, padL = showLabels ? 30 : 4;
  const n = data.length;
  const bw = (W - padL - 4) / n;

  const yMin = Math.min(...data.map((b) => b.value as number)), yMax = Math.max(...data.map((b) => b.value as number));
  const yTicks = showLabels ? [yMin, mean, yMax] : [];

  return (
    <div className="hi-stripes-wrap">
      <svg className="hi-stripes" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Warming Stripes: ${n} Jahre, Mittel ${fmtNum(mean)} ${unit}.`}>
        {data.map((b, i) => (
          <rect key={b.key} x={padL + i * bw} y={4} width={Math.ceil(bw) + 0.5} height={H - padB - 4}
            fill={divergingColor((b.value as number) - mean, span)}
            onClick={onPick ? () => onPick(b.year) : undefined} style={onPick ? { cursor: 'pointer' } : undefined}>
            <title>{b.label}: {fmtNum(b.value as number)} {unit} ({(b.value as number) - mean >= 0 ? '+' : ''}{fmtNum((b.value as number) - mean)})</title>
          </rect>
        ))}
        {showLabels && (
          <>
            {data.filter((_, i) => i % Math.ceil(n / 8) === 0).map((b) => {
              const idx = data.indexOf(b);
              return <text key={b.key} x={padL + idx * bw + bw / 2} y={H - padB + 16} className="hi-axislabel" textAnchor="middle">{b.year}</text>;
            })}
            {yTicks.map((t, i) => (
              <text key={i} x={padL - 4} y={4 + (H - padB - 4) * (1 - (t - yMin) / Math.max(0.01, yMax - yMin)) + 3} className="hi-axislabel" textAnchor="end">{fmtNum(t, 0)}</text>
            ))}
          </>
        )}
      </svg>
    </div>
  );
}
