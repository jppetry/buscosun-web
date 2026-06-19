/**
 * Step-based intro overlay — full-screen, immersive, one feature per step.
 *
 * Navigation: Zurück / Weiter buttons, ArrowLeft/ArrowRight, ESC to close,
 * clickable segmented progress dots. Last step shows the primary CTA.
 *
 * A11y: role="dialog" aria-modal, focus trap with focus restore, ESC, full
 * keyboard nav, decorative SVGs are aria-hidden. Motion: transform/opacity only
 * (60fps), disabled under prefers-reduced-motion (content stays fully usable).
 */

import { useEffect, useRef } from 'react';
import { INTRO_STEPS } from './introSteps';
import type { IntroTour } from './useIntroTour';
import './intro.css';

function IconChevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'left' ? <polyline points="10,3 5,8 10,13" /> : <polyline points="6,3 11,8 6,13" />}
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3,8.5 6.5,12 13,4" />
    </svg>
  );
}
function IconHowTo() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" /><polyline points="6.6,5.4 10,8 6.6,10.6" />
    </svg>
  );
}

export default function IntroOverlay({ tour }: { tour: IntroTour }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Track previous step so the transition knows its direction.
  const prevStepRef = useRef(tour.step);
  const dir: 'fwd' | 'back' = tour.step >= prevStepRef.current ? 'fwd' : 'back';
  useEffect(() => { prevStepRef.current = tour.step; }, [tour.step]);

  // Open lifecycle: lock scroll, focus into the dialog, restore focus on close.
  useEffect(() => {
    if (!tour.open) return;
    const restore = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const first = dialogRef.current?.querySelector<HTMLElement>('.intro-next, .intro-cta, button');
    first?.focus();
    return () => {
      document.body.style.overflow = '';
      restore?.focus?.();
    };
  }, [tour.open]);

  if (!tour.open) return null;
  const s = INTRO_STEPS[tour.step];
  const last = tour.step === tour.total - 1;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); tour.close(); return; }
    if (e.key === 'ArrowRight' && !last) { tour.next(); return; }
    if (e.key === 'ArrowLeft' && tour.step > 0) { tour.prev(); return; }
    if (e.key === 'Tab') {
      const els = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!els || els.length === 0) return;
      const list = Array.from(els);
      const firstEl = list[0], lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    }
  }

  return (
    <div className="intro-overlay" onClick={(e) => { if (e.target === e.currentTarget) tour.close(); }}>
      <div
        ref={dialogRef}
        className="intro-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        style={{ ['--intro-accent']: `var(${s.accent})` } as React.CSSProperties}
        onKeyDown={onKeyDown}
      >
        <button type="button" className="intro-close" onClick={tour.close} aria-label="Tour schließen"><IconClose /></button>

        <div className="intro-stage" data-dir={dir} key={tour.step}>
          <div className="intro-art">
            <s.Illustration accent={s.accent} />
            {s.Detail && (
              <div className="intro-art-detail"><s.Detail accent={s.accent} /></div>
            )}
          </div>
          <div className="intro-copy">
            <span className="intro-eyebrow">{s.eyebrow}</span>
            <h2 id="intro-title" className="intro-title">{s.title}</h2>
            <p className="intro-body">{s.body}</p>
            {s.capabilities && (
              <ul className="intro-caps">
                {s.capabilities.map((c) => (
                  <li key={c}><span className="intro-caps-mark" aria-hidden="true"><IconCheck /></span>{c}</li>
                ))}
              </ul>
            )}
            {s.howTo && (
              <p className="intro-howto">
                <span className="intro-howto-ic" aria-hidden="true"><IconHowTo /></span>
                <span><strong>So geht’s:</strong> {s.howTo}</span>
              </p>
            )}
          </div>
        </div>

        <div className="intro-footer">
          <button type="button" className="intro-nav-btn" onClick={tour.prev} disabled={tour.step === 0}>
            <IconChevron dir="left" /> Zurück
          </button>

          <div className="intro-dots" role="tablist" aria-label="Fortschritt">
            {INTRO_STEPS.map((st, i) => (
              <button
                key={st.id}
                type="button"
                role="tab"
                aria-selected={i === tour.step}
                aria-label={`Schritt ${i + 1} von ${tour.total}: ${st.title}`}
                className={`intro-dot${i === tour.step ? ' is-active' : ''}`}
                onClick={() => tour.goTo(i)}
              />
            ))}
          </div>

          {last ? (
            <button type="button" className="intro-cta" onClick={tour.close}>
              Los geht’s <IconChevron dir="right" />
            </button>
          ) : (
            <button type="button" className="intro-nav-btn intro-next" onClick={tour.next}>
              Weiter <IconChevron dir="right" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
