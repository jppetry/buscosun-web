/**
 * Atmosphäre · Föhn-Panel (6a) — Berg-&-Weg-Linse.
 *
 * Zeigt den Föhn-Index (kein / tendenziell / aktiv) aus dem geladenen Profil
 * (Höhenwind aus dem Höhen-Cube) plus die Druckdifferenz über die Alpen (ICON-D2
 * PMSL Lugano–Zürich, Bozen–Innsbruck; Modellwert, Richtwert) — oder die Lücke.
 * Belegt den Globe-Slot der Berg-&-Weg-Linse. Der 3D-Isentropen-Querschnitt (6b)
 * folgt als eigener Schritt.
 */

import { useEffect, useState } from 'react';
import { useAtmosphere } from './atmosphereStore';
import { foehnIndex, type FoehnLevel, type FoehnPressure } from './foehn';
import { loadFoehnPressure } from './atmoFoehn';
import FoehnCrossSection from './FoehnCrossSection';
import TalwindPanel from './TalwindPanel';

const DOT: Record<FoehnLevel, string> = { active: 'is-bad', tendency: 'is-watch', none: 'is-none' };
const LABEL: Record<FoehnLevel, string> = { active: 'Föhn aktiv', tendency: 'Föhn-Tendenz', none: 'Kein Föhn' };

export default function FoehnPanel() {
  const { profile, location, marker, hour } = useAtmosphere();
  const lon = marker?.lon ?? location?.lon ?? null;
  const [press, setPress] = useState<{ pressure: FoehnPressure | null; reason: string | null } | null>(null);

  useEffect(() => {
    if (lon == null) return;
    const ac = new AbortController();
    const validMs = Math.floor(Date.now() / 3_600_000) * 3_600_000 + hour * 3_600_000;
    loadFoehnPressure(validMs, lon, ac.signal).then(setPress, () => { /* abort */ });
    return () => ac.abort();
  }, [lon, hour]);

  if (!profile) {
    return (
      <section className="atm-foehn" aria-label="Föhn">
        <div className="rt-card atm-ph">
          {location ? 'Föhn-Index wird berechnet …' : 'Such oben einen Ort für den Föhn-Index.'}
        </div>
      </section>
    );
  }

  const f = foehnIndex(profile, press?.pressure ?? null, press ? press.reason : 'wird geladen');
  return (
    <section className="atm-foehn" aria-label="Föhn">
      <div className="rt-card atm-foehn-card">
        <p className="atm-foehn-head">
          <span className={`atm-verdict-dot ${DOT[f.level]}`} aria-hidden="true" />
          {LABEL[f.level]}
        </p>
        <p className="atm-foehn-text">{f.text}</p>
        {f.drivers.length > 0 && <p className="atm-foehn-drivers">{f.drivers.join(' · ')}</p>}
        <p className="atm-foehn-note">{f.pressureText}</p>
      </div>
      <TalwindPanel />
      <FoehnCrossSection />
    </section>
  );
}
