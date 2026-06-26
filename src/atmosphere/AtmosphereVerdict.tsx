/**
 * Atmosphäre · Verdict (Tiefe 1).
 *
 * Zeigt pro Linse einen Status-Punkt (sage/amber/terracotta) + Schlagzeile +
 * Detailzeile aus der getesteten, reinen Verdict-Logik. Rein deterministisch,
 * kein LLM — alle Zahlen sind berechnet.
 */

import { useMemo } from 'react';
import { useAtmosphere } from './atmosphereStore';
import { computeVerdict, type VerdictTone } from './verdict';

const DOT_CLASS: Record<VerdictTone, string> = { good: 'is-good', watch: 'is-watch', bad: 'is-bad' };

export default function AtmosphereVerdict() {
  const { lens, location, profile } = useAtmosphere();
  const verdict = useMemo(() => (profile ? computeVerdict(lens, profile) : null), [lens, profile]);

  return (
    <section className="rt-card atm-verdict" aria-label="Verdict">
      {!verdict && (
        <p className="atm-verdict-sub" style={{ margin: 0 }}>
          {profile === null && location ? 'Einschätzung wird berechnet …' : 'Such oben einen Ort für die Einschätzung.'}
        </p>
      )}

      {verdict && (
        <>
          <p className="atm-verdict-line">
            <span className={`atm-verdict-dot ${DOT_CLASS[verdict.tone]}`} aria-hidden="true" />
            {verdict.headline}
          </p>
          <p className="atm-verdict-sub">{verdict.detail}</p>
        </>
      )}
    </section>
  );
}
