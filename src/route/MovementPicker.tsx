/**
 * Auswahl der Bewegungsart als 4×2-Kachel-Grid (Mockup 02): Icon + Name +
 * Kurztext + Tempo-Label, mit Selected-State (terracotta-Rahmen + Häkchen).
 */

import { MOVEMENT_TYPES, type MovementId, type MovementType } from './movementTypes';
import { IconCheck } from './routeIcons';

interface Props {
  selected?: MovementId | null;
  onSelect: (id: MovementId) => void;
}

function speedLabel(m: MovementType): string {
  const flat = m.defaults.flatSpeedKmh.toString().replace('.', ',');
  if (m.category === 'foot') return `${flat} km/h flach · ${m.defaults.ascentRateMh} Hm/h`;
  return `${flat} km/h flach`;
}

export default function MovementPicker({ selected, onSelect }: Props) {
  return (
    <div className="rt-mvgrid" role="radiogroup" aria-label="Bewegungsart">
      {MOVEMENT_TYPES.map((m) => {
        const active = selected === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`rt-mvcard${active ? ' is-active' : ''}`}
            onClick={() => onSelect(m.id)}
          >
            <span className="rt-mvcard-ico">{m.icon}</span>
            <span className="rt-mvcard-name">{m.label}</span>
            <span className="rt-mvcard-blurb">{m.blurb}</span>
            <span className="rt-mvcard-speed">{speedLabel(m)}</span>
            {active
              ? <span className="rt-mvcard-check" aria-hidden="true"><IconCheck size={12} /></span>
              : m.id === 'ebike' ? <span className="rt-mvcard-ebadge" aria-hidden="true">Akku</span> : null}
          </button>
        );
      })}
    </div>
  );
}
