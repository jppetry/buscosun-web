/**
 * Modellvergleich-Chart: mehrere Modell-Stundenlinien überlagert, je Quelle
 * eingefärbt, plus Konsens-Median und Spannweite. Unterstützt vier Metriken:
 * Temperatur / Niederschlag / Wind / Wolkendichte.
 */

import { CONSENSUS_COLOR, type HourPoint, type ModelMeta } from './multiModel';

export type ChartMetric = 'temp' | 'precip' | 'wind' | 'cloud';

const W = 900, H = 320, PADL = 50, PADR = 16, PADT = 16, PADB = 30;
const PLOTW = W - PADL - PADR, PLOTH = H - PADT - PADB;

interface Props {
  hours: HourPoint[];
  models: ModelMeta[];
  enabledIdx: boolean[];
  showConsensus: boolean;
  outlierIdx: number[];
  metric: ChartMetric;
}

function getVals(h: HourPoint, metric: ChartMetric): number[] {
  if (metric === 'temp') return h.tempByModel;
  if (metric === 'precip') return h.precipByModel;
  if (metric === 'wind') return h.windByModel;
  return h.cloudByModel;
}

function unitSuffix(metric: ChartMetric): string {
  if (metric === 'temp') return '°';
  if (metric === 'precip') return 'mm';
  if (metric === 'wind') return 'km/h';
  return '%';
}

function yRange(allVals: number[], metric: ChartMetric): [number, number] {
  const finite = allVals.filter(Number.isFinite);
  if (!finite.length) {
    if (metric === 'cloud') return [0, 100];
    return [0, metric === 'wind' ? 30 : 20];
  }
  const lo = Math.min(...finite), hi = Math.max(...finite);
  if (metric === 'cloud') return [0, 100];
  if (metric === 'precip') { const pad = Math.max(0.2, hi * 0.15); return [0, hi + pad]; }
  const pad = Math.max(1, (hi - lo) * 0.12);
  return [lo - pad, hi + pad];
}

function yTicks(min: number, max: number, metric: ChartMetric): number[] {
  const step = metric === 'temp' ? 5 : metric === 'precip' ? (max > 5 ? 2 : 0.5) : metric === 'wind' ? 10 : 20;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(parseFloat(t.toFixed(2)));
  return ticks;
}

export default function ModelCompareChart({ hours, models, enabledIdx, showConsensus, outlierIdx, metric }: Props) {
  if (hours.length < 2) return <div className="fc-chart-empty">Für diesen Tag liegen zu wenige Stunden vor.</div>;

  const visible = models.map((m, i) => ({ m, i })).filter(({ i }) => enabledIdx[i]);
  const allVals = hours.flatMap((h) => visible.map(({ i }) => getVals(h, metric)[i]));
  const [yMin, yMax] = yRange(allVals, metric);
  const unit = unitSuffix(metric);

  const t0 = hours[0].tMs, t1 = hours[hours.length - 1].tMs;
  const x = (ms: number) => PADL + (PLOTW * (ms - t0)) / Math.max(1, t1 - t0);
  const y = (v: number) => PADT + PLOTH * (1 - (v - yMin) / Math.max(1e-6, yMax - yMin));

  const lineFor = (mi: number) => {
    const pts = hours.map((h) => ({ ms: h.tMs, v: getVals(h, metric)[mi] })).filter((p) => Number.isFinite(p.v));
    if (pts.length < 2) return null;
    return pts.map((p, k) => `${k === 0 ? 'M' : 'L'} ${x(p.ms).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  };

  const consensus: { ms: number; med: number; lo: number; hi: number }[] = [];
  for (const h of hours) {
    const vals = visible.map(({ i }) => getVals(h, metric)[i]).filter(Number.isFinite).sort((a, b) => a - b);
    if (!vals.length) continue;
    const med = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
    consensus.push({ ms: h.tMs, med, lo: vals[0], hi: vals[vals.length - 1] });
  }
  const spreadBand = consensus.length >= 2
    ? `M ${consensus.map((c) => `${x(c.ms).toFixed(1)} ${y(c.hi).toFixed(1)}`).join(' L ')} L ${[...consensus].reverse().map((c) => `${x(c.ms).toFixed(1)} ${y(c.lo).toFixed(1)}`).join(' L ')} Z`
    : '';
  const consensusLine = consensus.length >= 2 ? `M ${consensus.map((c) => `${x(c.ms).toFixed(1)} ${y(c.med).toFixed(1)}`).join(' L ')}` : '';

  const ticks = yTicks(yMin, yMax, metric);
  const hourTicks = hours.filter((h) => new Date(h.tMs).getHours() % 6 === 0);
  const anyVisible = visible.length > 0;

  if (!anyVisible) return <div className="fc-chart-empty">Alle Quellen ausgeblendet — mindestens eine einblenden.</div>;

  return (
    <div className="fc-chart-wrap">
      <svg className="fc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mehrere Wettermodelle überlagert mit Konsenslinie.">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} stroke="#E0D6BE" strokeDasharray="2 4" />
            <text x={PADL - 5} y={y(t) + 4} className="fc-axislabel" textAnchor="end">{t}{unit}</text>
          </g>
        ))}

        {showConsensus && spreadBand && <path d={spreadBand} fill="#3A6FA8" opacity={0.1} />}

        {visible.map(({ m, i }) => {
          const d = lineFor(i);
          if (!d) return null;
          const isOut = outlierIdx.includes(i);
          return <path key={m.id} d={d} fill="none" stroke={m.color} strokeWidth={isOut ? 2.4 : 1.7}
            opacity={isOut ? 0.95 : 0.65} strokeDasharray={isOut ? '7 4' : undefined} strokeLinejoin="round" />;
        })}

        {showConsensus && consensusLine && <path d={consensusLine} fill="none" stroke={CONSENSUS_COLOR} strokeWidth={3} strokeLinejoin="round" />}

        {hourTicks.map((h) => (
          <text key={h.tMs} x={x(h.tMs)} y={H - 10} className="fc-axislabel" textAnchor="middle">
            {new Date(h.tMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </text>
        ))}
      </svg>

      <div className="fc-chart-legend">
        {showConsensus && <span><i className="fc-lg-consensus" /> Konsens</span>}
        {showConsensus && <span><i className="fc-lg-b50" /> Spannweite</span>}
        {visible.map(({ m, i }) => (
          <span key={m.id}><i style={{ background: m.color }} /> {m.label}{outlierIdx.includes(i) ? ' · ⚠ Ausreißer' : ''}</span>
        ))}
      </div>
    </div>
  );
}
