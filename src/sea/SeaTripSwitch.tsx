/**
 * Phase AM — the switch „Art der Ausfahrt“ in the planner's head (`audit/seewetter-ausfahrt.md`): Vor Ort | Etappe |
 * Strand. The profile sets the mode when the planner opens; this switch changes it at any time.
 */
import { TRIP_MODES, TRIP_MODE_LABEL, TRIP_MODE_WHAT, type TripMode } from './seaTrip';

export default function SeaTripSwitch({ mode, onMode }: { mode: TripMode; onMode: (m: TripMode) => void }) {
  return (
    <div className="sw-am-mode">
      <h3 id="sw-am-mode-h">Art der Ausfahrt</h3>
      <div className="sw-am-modeseg" role="group" aria-labelledby="sw-am-mode-h">
        {TRIP_MODES.map((m) => <button key={m} type="button" aria-pressed={mode === m} className={mode === m ? 'is-active' : ''} onClick={() => { if (m !== mode) onMode(m); }}>{TRIP_MODE_LABEL[m]}</button>)}
      </div>
      <p>{TRIP_MODE_WHAT[mode]}</p>
    </div>
  );
}
