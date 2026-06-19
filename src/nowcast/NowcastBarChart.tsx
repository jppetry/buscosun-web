/**
 * NC-US-D2 — Einfaches Intensität-über-Zeit-Balkendiagramm als Karten-Alternative.
 *
 * Casual-Lesart ohne Karteninterpretation: ein Balken je 15-Min-Schritt,
 * eingefärbt nach Phase, mit hervorgehobenem Trockenfenster (US-B7), Regenband
 * sowie JETZT- und Skill-Horizont-Markern. Konsistent mit der Timeline für
 * denselben Punkt/dieselbe Zeit (US-E3).
 */

import {
  NOWCAST_HORIZON_MIN, NOWCAST_STEP_MIN, SKILL_HORIZON_MIN, WET_MMH,
  phaseColor, intensityBand, intensityLabel,
  type Nowcast,
} from './nowcastModel';
import { fmtClock, fmtDuration, fmtMmH } from './nowcastView';

const W = 640, H = 220, PADL = 30, PADR = 12, PADT = 14, PADB = 30;
const MMH_CAP = 12;

export default function NowcastBarChart({ nowcast }: { nowcast: Nowcast }) {
  const steps = nowcast.steps;
  const plotW = W - PADL - PADR, plotH = H - PADT - PADB;
  const yMax = Math.sqrt(MMH_CAP);
  const x = (min: number) => PADL + (plotW * min) / NOWCAST_HORIZON_MIN;
  const y = (mmH: number) => PADT + plotH * (1 - Math.sqrt(Math.min(Math.max(0, mmH), MMH_CAP)) / yMax);
  const baseY = y(0);
  const barW = (plotW / NOWCAST_HORIZON_MIN) * NOWCAST_STEP_MIN * 0.82;

  const dry = nowcast.dryWindow && nowcast.dryWindow.durationMin >= 15 ? nowcast.dryWindow : null;
  const ticks: number[] = [];
  for (let m = 0; m <= NOWCAST_HORIZON_MIN; m += 60) ticks.push(m);
  const grid = [1, 2.5, 5, 10];

  return (
    <div className="nc-bar-wrap">
      <svg className="nc-bar-svg" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label="Regenintensität je 15 Minuten über die nächsten 6 Stunden als Balkendiagramm.">
        {/* Y-Gridlines */}
        <line x1={PADL} y1={baseY} x2={W - PADR} y2={baseY} className="nc-tl-axis" />
        {grid.map((v) => (
          <g key={v}>
            <line x1={PADL} y1={y(v)} x2={W - PADR} y2={y(v)} className="nc-tl-grid" />
            <text x={PADL - 5} y={y(v) + 3} className="nc-tl-ylabel" textAnchor="end">{v.toString().replace('.', ',')}</text>
          </g>
        ))}
        <text x={PADL - 5} y={PADT + 7} className="nc-tl-yunit" textAnchor="end">mm/h</text>

        {/* Trockenfenster-Highlight (US-B7) */}
        {dry && (
          <g>
            <rect x={x(dry.fromMin)} y={PADT} width={x(dry.toMin) - x(dry.fromMin)} height={plotH} className="nc-tl-dry" />
            <text x={(x(dry.fromMin) + x(dry.toMin)) / 2} y={PADT + 12} className="nc-tl-dry-label" textAnchor="middle">TROCKEN {fmtDuration(dry.durationMin)}</text>
          </g>
        )}

        {/* Balken je Schritt */}
        {steps.map((s) => {
          const isWet = s.mmH >= WET_MMH;
          const top = isWet ? y(s.mmH) : baseY - 1.5;
          return (
            <rect key={s.index} x={x(s.minutes) - barW / 2} y={top} width={barW} height={Math.max(1.5, baseY - top)}
              rx={1.5} fill={isWet ? phaseColor(s.phase) : '#C4B896'} opacity={isWet ? (s.source === 'nwp' ? 0.7 : 0.92) : 0.4}>
              <title>{fmtClock(s.timestamp.getTime())} · {isWet ? `${fmtMmH(s.mmH)} (${intensityLabel(intensityBand(s.mmH))})` : 'trocken'}</title>
            </rect>
          );
        })}

        {/* Skill-Horizont + JETZT */}
        <line x1={x(SKILL_HORIZON_MIN)} y1={PADT} x2={x(SKILL_HORIZON_MIN)} y2={baseY} className="nc-tl-skill" />
        <line x1={x(0)} y1={PADT} x2={x(0)} y2={baseY} className="nc-tl-now" />
        <text x={x(0)} y={baseY + 20} className="nc-tl-now-label" textAnchor="middle">JETZT</text>
        {ticks.slice(1).map((m) => (
          <text key={m} x={x(m)} y={baseY + 20} className="nc-tl-xlabel" textAnchor="middle">{fmtClock(nowcast.nowMs + m * 60_000)}</text>
        ))}
      </svg>
    </div>
  );
}
