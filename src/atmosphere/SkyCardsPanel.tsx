/**
 * Atmosphäre · Himmel-Linse — Cards (P5).
 *
 * Zeigt die probabilistischen Himmels-Signale (Sonnenuntergang, Nebelmeer,
 * Optik) aus dem geladenen ICON-EU-Profil. Jede Card degradiert einzeln, wenn
 * ihr Signal fehlt. Die Saharastaub-Card entfällt bewusst (keine Pipeline).
 * Belegt im Layout den Globe-Slot der Himmel-Linse.
 */

import { useAtmosphere } from './atmosphereStore';
import { skyCards, DUST_NOTE, type SkyLevel } from './skyCards';

const DOT: Record<SkyLevel, string> = { good: 'is-good', fair: 'is-watch', poor: 'is-bad', none: 'is-none' };

export default function SkyCards() {
  const { profile, location } = useAtmosphere();

  if (!profile) {
    return (
      <section className="atm-sky" aria-label="Himmel">
        <div className="rt-card atm-ph">
          {location ? 'Himmels-Signale werden berechnet …' : 'Such oben einen Ort für die Himmels-Signale.'}
        </div>
      </section>
    );
  }

  const cards = skyCards(profile);
  return (
    <section className="atm-sky" aria-label="Himmel">
      {cards.map((c) => (
        <div key={c.key} className="rt-card atm-sky-card">
          <p className="atm-sky-head">
            <span className={`atm-verdict-dot ${DOT[c.level]}`} aria-hidden="true" />
            {c.title}
          </p>
          <p className="atm-sky-text">{c.text}</p>
        </div>
      ))}
      <p className="atm-sky-note">{DUST_NOTE} · Wahrscheinlichkeiten aus ICON-EU (~7 km), Richtwerte.</p>
    </section>
  );
}
