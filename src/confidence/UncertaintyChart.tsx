/**
 * Unsicherheits-Temperaturchart (US-1.5).
 *
 * Median-Verlaufslinie + halbtransparente Bänder (mittlere 50 % = p25–p75,
 * Bandbreite 80 % = p10–p90) aus der Streuung der Modelle pro Stunde — eine
 * „Unsicherheitswolke". Weiche Flächen statt harter Grenzlinien; das Band wird
 * mit zunehmender Streuung breiter und ist ohne Statistikwissen lesbar.
 */

import { percentiles, type Percentiles } from './confidenceModel';
import type { HourPoint } from './multiModel';
import type { GhostRun } from './forecastHistory';

const W = 900, H = 320, PADL = 44, PADR = 16, PADT = 16, PADB = 30;
const PLOTW = W - PADL - PADR, PLOTH = H - PADT - PADB;

interface HourPct { tMs: number; pct: Percentiles }

export default function UncertaintyChart({ hours, ghosts = [], showGhosts = false }: { hours: HourPoint[]; ghosts?: GhostRun[]; showGhosts?: boolean }) {
  const data: HourPct[] = hours
    .map((h) => ({ tMs: h.tMs, pct: percentiles(h.tempByModel) }))
    .filter((d): d is HourPct => d.pct !== null);

  if (data.length < 2) {
    return <div className="fc-chart-empty">Für diesen Tag liegen zu wenige Modellstunden vor.</div>;
  }

  const t0 = data[0].tMs, t1 = data[data.length - 1].tMs;
  let tMin = Infinity, tMax = -Infinity;
  for (const d of data) { tMin = Math.min(tMin, d.pct.p10); tMax = Math.max(tMax, d.pct.p90); }
  const pad = Math.max(1, (tMax - tMin) * 0.12);
  tMin -= pad; tMax += pad;

  const x = (ms: number) => PADL + (PLOTW * (ms - t0)) / Math.max(1, t1 - t0);
  const y = (t: number) => PADT + PLOTH * (1 - (t - tMin) / Math.max(1, tMax - tMin));

  const band = (lo: (p: Percentiles) => number, hi: (p: Percentiles) => number) => {
    const up = data.map((d) => `${x(d.tMs).toFixed(1)} ${y(hi(d.pct)).toFixed(1)}`);
    const dn = [...data].reverse().map((d) => `${x(d.tMs).toFixed(1)} ${y(lo(d.pct)).toFixed(1)}`);
    return `M ${up.join(' L ')} L ${dn.join(' L ')} Z`;
  };
  const median = `M ${data.map((d) => `${x(d.tMs).toFixed(1)} ${y(d.pct.p50).toFixed(1)}`).join(' L ')}`;

  // Y-Ticks (5°-Raster), X-Ticks alle 6 h.
  const yTicks: number[] = [];
  for (let t = Math.ceil(tMin / 5) * 5; t <= tMax; t += 5) yTicks.push(t);
  const hourTicks = data.filter((d) => new Date(d.tMs).getHours() % 6 === 0);

  // Streuung früh vs spät — für den Hinweis „Band wird gegen Abend breiter".
  const widthAt = (d: HourPct) => d.pct.p90 - d.pct.p10;
  const earlyW = widthAt(data[Math.floor(data.length * 0.2)]);
  const lateW = widthAt(data[Math.floor(data.length * 0.85)]);
  const widensEvening = lateW > earlyW * 1.25;

  // Spitzenwert für den Readout.
  const peak = data.reduce((a, b) => (b.pct.p50 > a.pct.p50 ? b : a), data[0]);

  return (
    <div className="fc-chart-wrap">
      <svg className="fc-chart" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label="Temperaturverlauf mit Unsicherheitsband aus mehreren Modellen; größere Fläche bedeutet mehr Unsicherheit.">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} stroke="#E0D6BE" strokeDasharray="2 4" />
            <text x={PADL - 6} y={y(t) + 3} className="fc-axislabel" textAnchor="end">{t}°</text>
          </g>
        ))}
        {/* Bänder: erst 80 % (heller), dann 50 % (kräftiger) */}
        <path d={band((p) => p.p10, (p) => p.p90)} fill="#3A6FA8" opacity={0.12} />
        <path d={band((p) => p.p25, (p) => p.p75)} fill="#3A6FA8" opacity={0.18} />

        {/* Verlaufs-Ghost-Lines: frühere Vorhersagestände (US-3.3) */}
        {showGhosts && ghosts.map((g, i) => {
          const pts = g.points.filter((p) => p.tMs >= t0 && p.tMs <= t1);
          if (pts.length < 2) return null;
          const d = pts.map((p, k) => `${k === 0 ? 'M' : 'L'} ${x(p.tMs).toFixed(1)} ${y(p.temp).toFixed(1)}`).join(' ');
          return <path key={g.label} d={d} fill="none" stroke="#8B7355" strokeWidth={1.4} opacity={Math.max(0.12, 0.36 - i * 0.1)} strokeDasharray="3 3">
            <title>{g.label}</title>
          </path>;
        })}

        <path d={median} fill="none" stroke="#3A6FA8" strokeWidth={2.6} strokeLinejoin="round" />

        {hourTicks.map((d) => (
          <text key={d.tMs} x={x(d.tMs)} y={H - 10} className="fc-axislabel" textAnchor="middle">
            {new Date(d.tMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </text>
        ))}

        {/* Readout am Spitzenwert */}
        <g transform={`translate(${Math.min(W - 230, Math.max(PADL, x(peak.tMs) - 110))}, ${PADT + 6})`}>
          <rect width="220" height="46" rx="10" fill="#FAF6EA" stroke="#E0D6BE" strokeWidth="1.2" />
          <text x="12" y="20" className="fc-readout-strong">{Math.round(peak.pct.p50)}° · Bandbreite {Math.round(peak.pct.p10)}–{Math.round(peak.pct.p90)}°</text>
          <text x="12" y="37" className="fc-readout-sub">größere Fläche = mehr Unsicherheit</text>
        </g>
        {widensEvening && (
          <text x={x(data[data.length - 1].tMs)} y={y(data[data.length - 1].pct.p90) - 8} className="fc-chart-note" textAnchor="end">Band wird gegen Abend breiter</text>
        )}
      </svg>
      <div className="fc-chart-legend">
        <span><i className="fc-lg-line" /> wahrscheinlichster Verlauf</span>
        <span><i className="fc-lg-b50" /> mittlere 50 %</span>
        <span><i className="fc-lg-b80" /> Bandbreite 80 %</span>
        {showGhosts && ghosts.length > 0 && <span><i className="fc-lg-ghost" /> frühere Läufe (gestern, vorgestern …)</span>}
      </div>
    </div>
  );
}
