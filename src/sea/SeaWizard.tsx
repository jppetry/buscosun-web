/**
 * Phase AM-W — the frame of the planner's assistant (`audit/seewetter-ausfahrt.md` §13): the progress row, the page's
 * heading, „Zurück“ / „Weiter“ with the reason why it does not go on yet, and on every page the sentence what the
 * planner is not. Around it the pages every kind of trip shares: „Grundangaben“, „Deine Grenzen“ and the summary
 * „Deine Angaben“ of the result page. Nothing is computed here — `seaSteps.ts` knows the steps, the page the values.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { SEA_PROFILE_BY_ID, type SeaLimits, type SeaProfileId } from './seaProfiles';
import { TRIP_MODE_LABEL, TRIP_MOTOR_NOTE, type TripMode } from './seaTrip';
import { SeaLimitsEditor } from './SeaDock';
import SeaTripSwitch, { TripProfiles } from './SeaTripSwitch';
import {
  WIZ_BACK, WIZ_DISCLAIMER, WIZ_LIMITS_COUNT_NOTE, WIZ_NEXT, WIZ_STEPS, WIZ_STRAND_PROFILE_NOTE, WIZ_TO_RESULT, wizLabel, wizLead, wizTitle,
  type WizStep, type WizSummaryRow,
} from './seaSteps';

export interface SeaWizardProps {
  mode: TripMode; step: WizStep;
  /** Index of the furthest page one may open (`wizReach`). */
  reach: number;
  /** Why „Weiter“ does not go on from this page; `null` = it does. */
  block: string | null;
  onGo: (s: WizStep) => void; onClose: () => void;
  /** The page itself. */
  children: ReactNode;
}

export default function SeaWizard({ mode, step, reach, block, onGo, onClose, children }: SeaWizardProps) {
  const steps = WIZ_STEPS[mode], idx = Math.max(0, steps.indexOf(step)), n = steps.length;
  const prev = steps[idx - 1] ?? null, next = steps[idx + 1] ?? null;
  // A new page starts at its top; the heading takes the focus when it was inside the assistant (never on the first paint).
  const body = useRef<HTMLDivElement | null>(null), head = useRef<HTMLHeadingElement | null>(null), first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    body.current?.scrollTo?.({ top: 0 });
    if (body.current?.parentElement?.contains(document.activeElement)) head.current?.focus({ preventScroll: true });
  }, [step, mode]);
  return (
    <section className={`sw-wz is-${step}`} aria-label="Ausfahrt planen">
      <header className="sw-wz-head">
        <div className="sw-wz-top">
          <span className="sw-wz-eyebrow">Ausfahrt planen · {TRIP_MODE_LABEL[mode]}</span>
          <button type="button" className="sw-pl-close" onClick={onClose} aria-label="Planer schließen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <ol className="sw-wz-steps" aria-label="Fortschritt">
          {steps.map((s, i) => (
            <li key={s} className={`sw-wz-stepli${i < idx ? ' is-done' : ''}${i === idx ? ' is-now' : ''}`} aria-current={i === idx ? 'step' : undefined}>
              <button type="button" disabled={i === idx || i > reach} onClick={() => onGo(s)} aria-label={`Schritt ${i + 1} von ${n}: ${wizLabel(mode, s)}${i < idx ? ', erledigt' : ''}`}>
                <i aria-hidden="true">{i < idx ? '✓' : i + 1}</i><span>{wizLabel(mode, s)}</span>
              </button>
            </li>
          ))}
        </ol>
      </header>
      <div className="sw-wz-body" ref={body}>
        <p className="sw-wz-count">Schritt {idx + 1} von {n}</p>
        <h2 ref={head} tabIndex={-1}>{wizTitle(mode, step)}</h2>
        <p className="sw-wz-lead">{wizLead(mode, step)}</p>
        {children}
      </div>
      <footer className="sw-wz-foot">
        {block && next && <p className="sw-wz-block" role="status">{block}</p>}
        {(prev || next) && (
          <div className="sw-wz-nav">
            {prev && (
              <button type="button" className="sw-wz-back" onClick={() => onGo(prev)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
                {WIZ_BACK}
              </button>
            )}
            {next && (
              <button type="button" className="sw-wz-next" disabled={!!block} onClick={() => onGo(next)}>
                {next === 'ergebnis' ? WIZ_TO_RESULT : <>{WIZ_NEXT}<span className="sw-wz-nextto">{wizLabel(mode, next)}</span></>}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            )}
          </div>
        )}
        <p className="sw-wz-safe">{WIZ_DISCLAIMER}</p>
      </footer>
    </section>
  );
}

// --- The guide every input page opens with: what to do, in order; done = tick, now = accent, later = quiet ------------------

export interface WizHowItem { head: string; text: ReactNode; state: 'done' | 'now' | 'next' }
export function WizHowTo({ items, label, children }: { items: readonly WizHowItem[]; label: string; children?: ReactNode }) {
  return (
    <div className="sw-wz-guidebox">
      <ol className="sw-wz-guide" aria-label={label}>
        {items.map((it, i) => (
          <li key={it.head} className={`is-${it.state}`} aria-current={it.state === 'now' ? 'step' : undefined}>
            <i aria-hidden="true">{it.state === 'done' ? '✓' : i + 1}</i>
            <span><strong>{it.head}</strong> {it.text}</span>
          </li>
        ))}
      </ol>
      {children}
    </div>
  );
}
/** One short hint where a page needs no steps (e.g. „Grenzen“: the values are already there). */
export function WizTip({ children }: { children: ReactNode }) {
  return <p className="sw-wz-tip">{children}</p>;
}

// --- Page 1: Grundangaben (who goes out) --------------------------------------------------------------------------------------------

export interface WerStepProps {
  profile: SeaProfileId; onProfile: (p: SeaProfileId) => void;
  mode: TripMode;
  /** "Wind 15–28 kn · Böen bis 33 kn …" — the limits the chosen profile brings along. */
  limitsText: string;
}
export function WerStep(p: WerStepProps) {
  return (
    <TripProfiles profile={p.profile} onProfile={p.onProfile}
      note={p.mode === 'strand'
        ? <p className="sw-am-fine">{WIZ_STRAND_PROFILE_NOTE}</p>
        : <p className="sw-am-fine">{SEA_PROFILE_BY_ID[p.profile].label}: {p.limitsText}. Änderbar im Schritt „Grenzen“.</p>} />
  );
}

// --- Page 2: Art der Ausfahrt — three cards, each with a sketch and what one sets and gets --------------------------------

export function ArtStep({ mode, onMode }: { mode: TripMode; onMode: (m: TripMode) => void }) {
  return (
    <>
      <SeaTripSwitch mode={mode} onMode={onMode} />
      {mode === 'strand' && <p className="sw-am-fine">{WIZ_STRAND_PROFILE_NOTE}</p>}
    </>
  );
}

// --- Page „Deine Grenzen“ (Vor Ort, Etappe) ----------------------------------------------------------------------------

export interface LimitsStepProps { mode: TripMode; profile: SeaProfileId; limits: SeaLimits; onLimits: (l: SeaLimits | null) => void }
export function LimitsStep(p: LimitsStepProps) {
  return (
    <section className="sw-wz-sec">
      <WizTip>Die Startwerte für {SEA_PROFILE_BY_ID[p.profile].label} sind schon eingetragen. Ändere nur, was für dich anders ist, dann „{WIZ_TO_RESULT}“.</WizTip>
      <h3>Grenzen für {SEA_PROFILE_BY_ID[p.profile].label}</h3>
      <SeaLimitsEditor profile={p.profile} limits={p.limits} onLimits={p.onLimits} />
      {p.mode === 'etappe' && <p className="sw-am-fine">{WIZ_LIMITS_COUNT_NOTE}</p>}
      {p.mode === 'etappe' && p.profile === 'motor' && <p className="sw-am-fine">{TRIP_MOTOR_NOTE}</p>}
    </section>
  );
}

// --- Result page: what was set, each line with the way back to its page ------------------------------------------------

export interface WizSummaryProps {
  rows: readonly WizSummaryRow[]; onGo: (s: WizStep) => void;
  /** Phone: folded to one line, so the findings start in the sheet at rest (V-AM-32). */
  fold?: boolean;
  /** Under the rows: what one does with the finished plan. */
  children?: ReactNode;
}
export function WizSummary({ rows, onGo, fold, children }: WizSummaryProps) {
  const list = (
    <dl className="sw-wz-sum">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
          <button type="button" className="sw-link" onClick={() => onGo(r.step)} aria-label={`${r.label} ändern`}>ändern</button>
        </div>
      ))}
    </dl>
  );
  if (fold) {
    return (
      <details className="sw-wz-sumfold">
        <summary><span>Deine Angaben</span><span className="sw-wz-sumgist">{rows.map((r) => r.value).join(' · ')}</span></summary>
        {list}
        {children}
      </details>
    );
  }
  return (
    <section className="sw-wz-sec">
      <h3>Deine Angaben</h3>
      {list}
      {children}
    </section>
  );
}
