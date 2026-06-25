/**
 * Atmosphäre · Verdict (Tiefe 1) + LLM-„Warum?".
 *
 * Zeigt pro Linse einen Status-Punkt (sage/amber/terracotta) + Schlagzeile aus
 * der getesteten, reinen Verdict-Logik. Die „Warum?"-Erweiterung erklärt das
 * Verdict über den BESTEHENDEN Assistant-LLM-Pfad (useWeatherDescriber → engine/
 * grounding/prompt). Ohne WebGPU/Modell fällt es graceful auf eine getemplatete
 * deutsche Erklärung zurück. Das LLM formuliert nur — alle Zahlen sind berechnet.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtmosphere } from './atmosphereStore';
import { useWeatherDescriber } from '../assistant/useWeatherDescriber';
import { computeVerdict, buildVerdictFacts, templateExplanation, type VerdictTone } from './verdict';

const DOT_CLASS: Record<VerdictTone, string> = { good: 'is-good', watch: 'is-watch', bad: 'is-bad' };
const pad2 = (n: number) => String(n).padStart(2, '0');

export default function AtmosphereVerdict() {
  const { lens, location, profile, hour, modelRunAt } = useAtmosphere();
  const describer = useWeatherDescriber();
  const [why, setWhy] = useState(false);
  const [useTemplate, setUseTemplate] = useState(false);
  const describedSig = useRef<string | null>(null);

  const verdict = useMemo(() => (profile ? computeVerdict(lens, profile) : null), [lens, profile]);
  const validLabel = useMemo(() => {
    if (!modelRunAt) return undefined;
    const d = new Date(modelRunAt.getTime() + hour * 3_600_000);
    const wd = d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
    return `${wd} ${pad2(d.getHours())}:00`;
  }, [modelRunAt, hour]);

  const sig = `${lens}|${hour}|${location?.lat},${location?.lon}`;
  const block = useMemo(
    () => (profile && verdict && location ? buildVerdictFacts(lens, location.name.split(',')[0], profile, verdict, validLabel) : null),
    [lens, profile, verdict, location, validLabel],
  );

  // Neuer Kontext (Linse/Stunde/Ort) → Erklärung zurücksetzen.
  useEffect(() => { setWhy(false); setUseTemplate(false); describedSig.current = null; describer.cancel(); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sobald das Modell bereit ist und „Warum?" gewünscht wurde: einmal pro Kontext beschreiben.
  useEffect(() => {
    if (!why || useTemplate || !block) return;
    if (describer.state === 'ready' && describedSig.current !== sig) {
      describedSig.current = sig;
      describer.describe(block);
    }
  }, [why, useTemplate, block, describer.state, sig]); // eslint-disable-line react-hooks/exhaustive-deps

  function onWhy() {
    if (!block) return;
    if (describer.state === 'unsupported') { setUseTemplate(true); return; }
    setWhy(true);
    if (describer.state === 'idle' || describer.state === 'error') describer.activate();
    else if (describer.state === 'ready' && describedSig.current !== sig) { describedSig.current = sig; describer.describe(block); }
  }

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

          {!why && !useTemplate && (
            <button type="button" className="atm-why" onClick={onWhy}>Warum?</button>
          )}

          {useTemplate && profile && (
            <p className="atm-why-text">{templateExplanation(lens, verdict)}</p>
          )}

          {why && !useTemplate && (
            <div className="atm-why-box">
              {describer.state === 'downloading' && (
                <p className="atm-why-status">
                  KI-Meteorologe wird geladen … {describer.progress ? `${Math.round(describer.progress.progress * 100)} %` : ''}
                  <button type="button" className="atm-why-link" onClick={() => setUseTemplate(true)}>ohne KI erklären</button>
                </p>
              )}
              {describer.state === 'error' && (
                <p className="atm-why-status">
                  KI nicht verfügbar.
                  <button type="button" className="atm-why-link" onClick={() => setUseTemplate(true)}>ohne KI erklären</button>
                </p>
              )}
              {(describer.state === 'ready') && describer.generation?.phenomenon === 'atmosphere' && (
                <p className="atm-why-text">
                  {describer.generation.text || 'einen Moment …'}
                  {describer.generation.status === 'error' && (
                    <> <button type="button" className="atm-why-link" onClick={() => setUseTemplate(true)}>ohne KI erklären</button></>
                  )}
                </p>
              )}
              {describer.state === 'ready' && !describer.generation && <p className="atm-why-status">einen Moment …</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
