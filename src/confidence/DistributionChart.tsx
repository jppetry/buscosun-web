/**
 * Verteilungs-Chart (US-4.1/4.2): zwei Modi.
 *  • „bands"     — mittlere 50 %/80 %-Bänder + Median (Default).
 *  • „spaghetti" — alle Ensemble-Member als feine Linien + Median.
 */

import { ensembleBands, type HourBand } from './distributionModel';
import type { EnsembleHour } from './ensemble';

const W = 900, H = 320, PADL = 44, PADR = 16, PADT = 16, PADB = 30;
const PLOTW = W - PADL - PADR, PLOTH = H - PADT - PADB;
const ACCENT = '#3A6FA8';

interface Props { hours: EnsembleHour[]; mode: 'bands' | 'spaghetti' }

export default function DistributionChart({ hours, mode }: Props) {
  const usable = hours.filter((h) => h.temps.length > 0);
  if (usable.length < 2) return <div className="fc-chart-empty">Für diesen Tag liegen keine Ensemble-Daten vor.</div>;

  const bands = ensembleBands(usable);

  let tMin = Infinity, tMax = -Infinity;
  for (const h of usable) for (const t of h.temps) { tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
  const pad = Math.max(1, (tMax - tMin) * 0.1); tMin -= pad; tMax += pad;

  const t0 = usable[0].tMs, t1 = usable[usable.length - 1].tMs;
  const x = (ms: number) => PADL + (PLOTW * (ms - t0)) / Math.max(1, t1 - t0);
  const y = (t: number) => PADT + PLOTH * (1 - (t - tMin) / Math.max(1, tMax - tMin));

  const bandPath = (lo: (b: HourBand) => number, hi: (b: HourBand) => number) =>
    `M ${bands.map((b) => `${x(b.tMs).toFixed(1)} ${y(hi(b)).toFixed(1)}`).join(' L ')} L ${[...bands].reverse().map((b) => `${x(b.tMs).toFixed(1)} ${y(lo(b)).toFixed(1)}`).join(' L ')} Z`;
  const medianPath = `M ${bands.map((b) => `${x(b.tMs).toFixed(1)} ${y(b.p50).toFixed(1)}`).join(' L ')}`;

  // Spaghetti: je Member eine Linie (temps sind je Stunde gefiltert — Member-Index
  // ist über die Stunden konsistent, solange keine NaN-Lücken; wir nutzen Min-Länge).
  const memberCount = Math.min(...usable.map((h) => h.temps.length));
  const memberPaths: string[] = [];
  if (mode === 'spaghetti') {
    for (let m = 0; m < memberCount; m++) {
      memberPaths.push(`M ${usable.map((h) => `${x(h.tMs).toFixed(1)} ${y(h.temps[m]).toFixed(1)}`).join(' L ')}`);
    }
  }

  const yTicks: number[] = [];
  for (let t = Math.ceil(tMin / 5) * 5; t <= tMax; t += 5) yTicks.push(t);
  const hourTicks = usable.filter((h) => new Date(h.tMs).getHours() % 6 === 0);

  return (
    <div className="fc-chart-wrap">
      <svg className="fc-chart" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={mode === 'bands' ? 'Bandbreiten der Szenarien mit Medianlinie.' : `Alle ${memberCount} Szenarien als Linien.`}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} stroke="#E0D6BE" strokeDasharray="2 4" />
            <text x={PADL - 6} y={y(t) + 3} className="fc-axislabel" textAnchor="end">{t}°</text>
          </g>
        ))}

        {mode === 'bands' ? (
          <>
            <path d={bandPath((b) => b.p10, (b) => b.p90)} fill={ACCENT} opacity={0.12} />
            <path d={bandPath((b) => b.p25, (b) => b.p75)} fill={ACCENT} opacity={0.2} />
            <path d={medianPath} fill="none" stroke={ACCENT} strokeWidth={2.6} strokeLinejoin="round" />
          </>
        ) : (
          <>
            {memberPaths.map((d, i) => <path key={i} d={d} fill="none" stroke="#6B7A8F" strokeWidth={0.8} opacity={0.28} />)}
            <path d={medianPath} fill="none" stroke="#2C2A26" strokeWidth={2.6} strokeLinejoin="round" />
          </>
        )}

        {hourTicks.map((h) => (
          <text key={h.tMs} x={x(h.tMs)} y={H - 10} className="fc-axislabel" textAnchor="middle">
            {new Date(h.tMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </text>
        ))}
      </svg>

      <div className="fc-chart-legend">
        {mode === 'bands' ? (
          <>
            <span><i className="fc-lg-line" /> Median</span>
            <span><i className="fc-lg-b50" /> mittlere 50 %</span>
            <span><i className="fc-lg-b80" /> mittlere 80 %</span>
          </>
        ) : (
          <>
            <span><i className="fc-lg-consensus" /> Median</span>
            <span><i className="fc-lg-member" /> {memberCount} Szenarien</span>
          </>
        )}
      </div>
    </div>
  );
}
