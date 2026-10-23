/**
 * Warming Stripes (E6.1/6.2): je Jahr ein Streifen, eingefärbt nach Abweichung
 * vom Mittel. Optionale Achsen-/Wertbeschriftung (US-6.2).
 *
 * HB: `stretch` lässt die Streifen (ohne Beschriftung) die Höhe der Bühne füllen;
 * `onHover` meldet Jahr, Wert und Abweichung für die Ablese-Pille der Bühne.
 */

import { useState } from 'react';
import type { Bucket } from '../historyModel';
import { divergingColor, anomalySpan } from '../historyColors';
import { fmtNum } from './common';

export interface StripeHover { year: number; label: string; value: number; anomaly: number; mean: number; color: string }

interface Props {
  buckets: Bucket[]; unit: string; showLabels: boolean; onPick?: (year: number) => void;
  stretch?: boolean; onHover?: (h: StripeHover | null) => void;
}

export default function Stripes({ buckets, unit, showLabels, onPick, stretch, onHover }: Props) {
  const [hot, setHot] = useState<number | null>(null);
  const data = buckets.filter((b) => b.value != null);
  if (data.length < 2) return <div className="hi-chart-empty">Zu wenige Jahre für Streifen.</div>;
  const mean = data.reduce((s, b) => s + (b.value as number), 0) / data.length;
  const anoms = data.map((b) => (b.value as number) - mean);
  const span = anomalySpan(anoms);
  const fill = !!stretch && !showLabels;

  const W = 920, H = showLabels ? 210 : 150, padB = showLabels ? 34 : 8, padL = showLabels ? 30 : 4;
  const n = data.length;
  const pl = fill ? 0 : padL, pr = fill ? 0 : 4, pt = fill ? 0 : 4, pb = fill ? 0 : padB;
  const bw = (W - pl - pr) / n;

  const yMin = Math.min(...data.map((b) => b.value as number)), yMax = Math.max(...data.map((b) => b.value as number));
  const yTicks = showLabels ? [yMin, mean, yMax] : [];

  const enter = (i: number) => {
    setHot(i);
    if (!onHover) return;
    const b = data[i]; const v = b.value as number;
    onHover({ year: b.year, label: b.label, value: v, anomaly: v - mean, mean, color: divergingColor(v - mean, span) });
  };
  const leave = () => { setHot(null); onHover?.(null); };

  return (
    <div className={`hi-stripes-wrap${fill ? ' hi-stripes-wrap--fill' : ''}`}>
      <svg className="hi-stripes" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={fill ? 'none' : undefined} role="img"
        aria-label={`Warming Stripes: ${n} Jahre, Mittel ${fmtNum(mean)} ${unit}.`} onMouseLeave={onHover ? leave : undefined}>
        {data.map((b, i) => (
          <rect key={b.key} x={pl + i * bw} y={pt} width={Math.ceil(bw) + 0.5} height={H - pb - pt}
            fill={divergingColor((b.value as number) - mean, span)}
            onClick={onPick ? () => onPick(b.year) : undefined} onMouseEnter={onHover ? () => enter(i) : undefined}
            style={onPick ? { cursor: 'pointer' } : undefined}>
            <title>{b.label}: {fmtNum(b.value as number)} {unit} ({(b.value as number) - mean >= 0 ? '+' : ''}{fmtNum((b.value as number) - mean)})</title>
          </rect>
        ))}
        {onHover && hot != null && (
          <rect x={pl + hot * bw} y={pt} width={bw} height={H - pb - pt} fill="none" stroke="#FAF6EA" strokeWidth="2"
            vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}
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
