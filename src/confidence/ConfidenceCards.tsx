/**
 * 7-Tage-Karten mit Confidence-Ring (US-1.1/1.2).
 *
 * Jede Karte zeigt Wochentag, Wetter-Icon, Hoch/Tief und einen Vertrauens-Ring
 * mit Prozentwert. Die Stufe ist durch Farbe **und** Icon-Glyph **und** Textlabel
 * codiert (nie Farbe allein), sequenzielle Skala (kein Rot-Grün).
 */

import { levelStyle, type DayStab, type DayVM, type WeatherIcon } from './forecastView';
import type { DeltaInfo } from './stabilityModel';

export default function ConfidenceCards({ days, selected, onSelect, stab }: { days: DayVM[]; selected: number; onSelect: (i: number) => void; stab: Map<string, DayStab> | null }) {
  return (
    <div className="fc-cards" role="list">
      {days.map((vm, i) => (
        <DayCard key={vm.day.dateISO} vm={vm} selected={i === selected} onClick={() => onSelect(i)} stab={stab?.get(vm.day.dateISO) ?? null} />
      ))}
    </div>
  );
}

function DayCard({ vm, selected, onClick, stab }: { vm: DayVM; selected: boolean; onClick: () => void; stab: DayStab | null }) {
  const s = levelStyle(vm.confidence.level);
  const shortLabel = vm.confidence.level === 'high' ? 'Hohe Sicherheit' : vm.confidence.level === 'mid' ? 'Mittlere Sicherheit' : 'Niedrige Sicherheit';
  return (
    <button type="button" role="listitem" className={`fc-card${selected ? ' is-selected' : ''}`} onClick={onClick}
      aria-label={`${vm.day.weekdayShort}, ${Math.round(vm.day.tMaxConsensus)} Grad, ${shortLabel} ${vm.confidence.pct} Prozent`}>
      <div className="fc-card-head">
        <span className="fc-card-day">{vm.day.weekdayShort}</span>
        {vm.day.isToday && <span className="fc-card-today">Heute</span>}
      </div>
      <WeatherGlyph icon={vm.icon} />
      <div className="fc-card-temps">
        <span className="fc-card-tmax">{Math.round(vm.day.tMaxConsensus)}°</span>
        <span className="fc-card-tmin">{Math.round(vm.day.tMinConsensus)}°</span>
      </div>
      <div className="fc-card-conf">
        <ConfidenceRing score={vm.confidence.score} color={s.color} glyph={s.glyph} />
        <span className="fc-card-pct" style={{ color: s.color }}>{vm.confidence.pct} %</span>
      </div>
      <span className="fc-card-level" style={{ color: s.color }}>{s.glyph} {shortLabel.replace(' Sicherheit', '')}</span>

      {stab && stab.stability.level !== 'unknown' && (
        <div className="fc-card-stab">
          {stab.spark && <Sparkline points={stab.spark} />}
          <div className="fc-card-stab-text">
            <DeltaBadge delta={stab.delta} />
            <span className={`fc-stab-chip is-${stab.stability.level}`} title="Wie stark sich die Prognose über die letzten Läufe ändert — nicht, ob sie richtig liegt.">
              {stab.stability.level === 'stable' ? '● ' : '~ '}{stab.stability.label}
            </span>
          </div>
        </div>
      )}
    </button>
  );
}

function DeltaBadge({ delta }: { delta: DeltaInfo }) {
  if (delta.deltaC == null) return null;
  if (delta.isSmall) return <span className="fc-delta is-flat">≈ stabil seit gestern</span>;
  const v = Math.abs(Math.round(delta.deltaC));
  return (
    <span className={`fc-delta is-${delta.direction}`} title="Änderung gegenüber gestern">
      {delta.direction === 'up' ? `▲ +${v}°` : `▼ −${v}°`} seit gestern
    </span>
  );
}

/** Mini-Trend der Prognoseänderung über die letzten Läufe (US-3.4). */
function Sparkline({ points }: { points: number[] }) {
  const W = 40, H = 16, pad = 2;
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - v * (H - 2 * pad);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="fc-spark" aria-hidden="true">
      <path d={d} fill="none" stroke="#8B7355" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="1.8" fill="#8B7355" />
    </svg>
  );
}

/** Ring-Gauge: voller Hintergrundkreis + Bogen proportional zum Score. */
function ConfidenceRing({ score, color, glyph }: { score: number; color: string; glyph: string }) {
  const r = 13, c = 2 * Math.PI * r;
  const dash = Math.max(0.02, score) * c;
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" className="fc-ring" aria-hidden="true">
      <circle cx="17" cy="17" r={r} fill="none" stroke={color} strokeWidth="4" opacity="0.2" />
      <circle cx="17" cy="17" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`} transform="rotate(-90 17 17)" />
      <text x="17" y="21" textAnchor="middle" fontSize="12" fontWeight="700" fill={color}>{glyph}</text>
    </svg>
  );
}

export function WeatherGlyph({ icon, size = 34 }: { icon: WeatherIcon; size?: number }) {
  if (icon === 'sun') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" className="fc-wx" aria-hidden="true">
        <circle cx="20" cy="20" r="8" fill="#D4A373" />
        <g stroke="#D4A373" strokeWidth="2" strokeLinecap="round">
          <line x1="20" y1="4" x2="20" y2="9" /><line x1="20" y1="31" x2="20" y2="36" />
          <line x1="4" y1="20" x2="9" y2="20" /><line x1="31" y1="20" x2="36" y2="20" />
          <line x1="9" y1="9" x2="12" y2="12" /><line x1="28" y1="28" x2="31" y2="31" />
          <line x1="31" y1="9" x2="28" y2="12" /><line x1="12" y1="28" x2="9" y2="31" />
        </g>
      </svg>
    );
  }
  if (icon === 'cloud') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" className="fc-wx" aria-hidden="true">
        <circle cx="15" cy="15" r="9" fill="#D4A373" />
        <path d="M 8 28 Q 8 18 18 18 Q 24 10 32 18 Q 40 18 40 26 Q 40 30 34 30 L 12 30 Q 8 30 8 28 Z" fill="#C9CFD6" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="fc-wx" aria-hidden="true">
      <path d="M 6 22 Q 6 12 16 12 Q 22 4 30 12 Q 38 12 38 20 Q 38 24 32 24 L 10 24 Q 6 24 6 22 Z" fill="#9AB8CF" />
      <g stroke="#3A6FA8" strokeWidth="2" strokeLinecap="round">
        <line x1="14" y1="28" x2="12" y2="34" /><line x1="22" y1="28" x2="20" y2="34" /><line x1="30" y1="28" x2="28" y2="34" />
      </g>
    </svg>
  );
}
