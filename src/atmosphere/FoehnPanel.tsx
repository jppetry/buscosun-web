/**
 * Atmosphäre · Föhn-Panel (6a) — Berg-&-Weg-Linse.
 *
 * Zeigt den Föhn-Index (kein / tendenziell / aktiv) aus dem geladenen ICON-EU-
 * Profil plus die ehrliche Drucklücken-Notiz (kein Cross-Barrier-Stationsdruck).
 * Belegt den Globe-Slot der Berg-&-Weg-Linse. Der 3D-Isentropen-Querschnitt (6b)
 * folgt als eigener Schritt.
 */

import { useAtmosphere } from './atmosphereStore';
import { foehnIndex, PRESSURE_GATE_NOTE, type FoehnLevel } from './foehn';

const DOT: Record<FoehnLevel, string> = { active: 'is-bad', tendency: 'is-watch', none: 'is-none' };
const LABEL: Record<FoehnLevel, string> = { active: 'Föhn aktiv', tendency: 'Föhn-Tendenz', none: 'Kein Föhn' };

export default function FoehnPanel() {
  const { profile, location } = useAtmosphere();

  if (!profile) {
    return (
      <section className="atm-foehn" aria-label="Föhn">
        <div className="rt-card atm-ph">
          {location ? 'Föhn-Index wird berechnet …' : 'Such oben einen Ort für den Föhn-Index.'}
        </div>
      </section>
    );
  }

  const f = foehnIndex(profile);
  return (
    <section className="atm-foehn" aria-label="Föhn">
      <div className="rt-card atm-foehn-card">
        <p className="atm-foehn-head">
          <span className={`atm-verdict-dot ${DOT[f.level]}`} aria-hidden="true" />
          {LABEL[f.level]}
        </p>
        <p className="atm-foehn-text">{f.text}</p>
        {f.drivers.length > 0 && <p className="atm-foehn-drivers">{f.drivers.join(' · ')}</p>}
        <p className="atm-foehn-note">{PRESSURE_GATE_NOTE}</p>
      </div>
      <div className="rt-card atm-ph atm-foehn-soon">
        3D-Isentropen-Querschnitt über den Alpenkamm (Schritt 6b) — folgt.
      </div>
    </section>
  );
}
