/**
 * Intro-tour state: open/step + first-visit detection via localStorage.
 *
 * Contract:
 *   · The tour NEVER opens automatically.
 *   · `pulse` is true only on the genuine first visit (and only that session) so
 *     the trigger may highlight itself once; the "seen" flag is persisted
 *     immediately so returning visitors are never nagged.
 *   · The trigger itself stays available forever (without pulse) → replayable.
 */

import { useState, useCallback } from 'react';
import { INTRO_STEPS } from './introSteps';

const SEEN_KEY = 'buscosun.intro.seen.v1';

export interface IntroTour {
  open: boolean;
  step: number;
  total: number;
  /** Highlight the trigger once on the very first visit. */
  pulse: boolean;
  start: () => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  goTo: (i: number) => void;
}

export function useIntroTour(): IntroTour {
  const total = INTRO_STEPS.length;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Read-then-persist in the initializer: true only on the first ever visit.
  const [pulse] = useState<boolean>(() => {
    try {
      const first = localStorage.getItem(SEEN_KEY) !== '1';
      if (first) localStorage.setItem(SEEN_KEY, '1');
      return first;
    } catch {
      return false;
    }
  });

  const start = useCallback(() => { setStep(0); setOpen(true); }, []);
  const close = useCallback(() => setOpen(false), []);
  const next = useCallback(() => setStep((s) => Math.min(total - 1, s + 1)), [total]);
  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);
  const goTo = useCallback((i: number) => setStep(() => Math.max(0, Math.min(total - 1, i))), [total]);

  return { open, step, total, pulse, start, close, next, prev, goTo };
}
