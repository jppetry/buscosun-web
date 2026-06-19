/**
 * Start-Zeitpunkt: DateTime-Picker (lokale Browser-Zeitzone), Quick-Optionen
 * und Hinweise zu Vorhersage-Horizont (>10 Tage) bzw. Vergangenheit.
 */

import { useMemo } from 'react';
import {
  detectTimeZone, horizonState, quickStartOptions, toLocalInput, fromLocalInput,
} from './startTime';
import { IconWarning } from './routeIcons';

interface Props {
  value: number;
  onChange: (ms: number) => void;
}

export default function StartTimeConfig({ value, onChange }: Props) {
  const tz = useMemo(detectTimeZone, []);
  const quick = useMemo(() => quickStartOptions(), []);
  const horizon = horizonState(value);

  return (
    <div className="tp-block">
      <div className="tp-block-head">
        <span className="tp-block-title">Start</span>
        <span className="tp-tz">{tz}</span>
      </div>

      <div className="tp-quick">
        {quick.map((q) => (
          <button key={q.key} type="button" className="tp-chip" onClick={() => onChange(q.ms)}>{q.label}</button>
        ))}
      </div>

      <input
        type="datetime-local"
        className="tp-datetime"
        value={toLocalInput(value)}
        onChange={(e) => onChange(fromLocalInput(e.target.value))}
      />

      {horizon === 'far_future' && (
        <p className="tp-note tp-note-warn"><IconWarning size={14} /> Mehr als 10 Tage in der Zukunft — die Vorhersage-Konfidenz ist deutlich reduziert.</p>
      )}
      {horizon === 'past' && (
        <p className="tp-note">
          Vergangenheit gewählt — es werden historische Datenquellen genutzt („Wie war's?").
        </p>
      )}
    </div>
  );
}
