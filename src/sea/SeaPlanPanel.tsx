/**
 * Phase SP — the planner's findings (`audit/seewetter-planer.md`): readout column on the desktop, sheet on the phone.
 * One rail from "Start" to "Rückkehr": the two ends are the cards of their hour, what happens between them hangs on the
 * rail at its hour. Below it what holds for the whole window, the notes on what the map does NOT say, and the footer.
 * Every number is an hourly value of the spot; this component computes nothing (`seaPlanner.ts` does).
 */
import type { ReactNode } from 'react';
import { SEA_PROFILES, type SeaProfileId } from './seaProfiles';
import { PLAN_FOOTER, type PlanEvent } from './seaPlanner';
import SeaTripSwitch from './SeaTripSwitch';
import type { TripMode } from './seaTrip';

export interface SeaPlanCard {
  /** "Sa 14:00". */
  when: string;
  /** "12 kn, Böen 18 kn, aus SW" — or why there is none. */
  wind: string;
  /** Further lines of this one hour: shore angle, wind against the way back, wave, class, share above the limit, water level. */
  lines: string[];
  /** Colour of the profile class at this hour; null = no data (hatched). */
  color: string | null;
  canEarlier: boolean; canLater: boolean;
}

export interface SeaPlanPanelProps {
  spotName: string;
  /** "Kite: Wind 15–28 kn, Böen bis 33 kn …" */
  limitsText: string;
  profile: SeaProfileId; onProfile: (p: SeaProfileId) => void;
  /** Why there is nothing to plan with (no run, kill switch); the panel then shows only this. */
  noData: string | null;
  /** Official message for the spot's area, verbatim, shown ABOVE everything else (Seewetter check 3). */
  official: { texts: Array<{ head: string; text: string }>; why: string } | null;
  start: SeaPlanCard | null; ret: SeaPlanCard | null;
  onShift: (which: 'start' | 'end', by: -1 | 1) => void;
  events: readonly PlanEvent[];
  /** Hours in the window ("3 Stunden"). */
  span: string;
  summary: readonly string[];
  notes: readonly string[];
  /** The window of the link was moved or cut. */
  moved: string | null;
  play: ReactNode;
  /** What the map shows at the chosen hour: return line and the side the wind comes from. */
  now: string;
  /** Phone: the hour band with the row "Fenster" sits in the sheet (on the desktop it lies over the foot of the map). */
  band?: ReactNode;
  onChangeSpot: () => void;
  onClose: () => void;
  /** Phase AM: this planner is the mode „Vor Ort“ of three — the switch „Art der Ausfahrt“ sits under the head. */
  onMode?: (m: TripMode) => void;
}

const Stepper = ({ label, onShift, canEarlier, canLater }: { label: string; onShift: (by: -1 | 1) => void; canEarlier: boolean; canLater: boolean }) => (
  <span className="sw-pl-step" role="group" aria-label={`${label} verschieben`}>
    <button type="button" disabled={!canEarlier} onClick={() => onShift(-1)} aria-label={`${label} eine Stunde früher`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
    </button>
    <button type="button" disabled={!canLater} onClick={() => onShift(1)} aria-label={`${label} eine Stunde später`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
    </button>
  </span>
);

function End({ name, card, onShift }: { name: 'Start' | 'Rückkehr'; card: SeaPlanCard; onShift: (by: -1 | 1) => void }) {
  return (
    <li className={`sw-pl-end${name === 'Start' ? ' is-start' : ' is-return'}`}>
      <span className={`sw-pl-knot${card.color ? '' : ' is-hatched'}`} style={card.color ? { background: card.color } : undefined} aria-hidden="true" />
      <div className="sw-pl-endhead">
        <h3>{name}</h3>
        <time>{card.when}</time>
        <Stepper label={name} onShift={onShift} canEarlier={card.canEarlier} canLater={card.canLater} />
      </div>
      <p className="sw-pl-endwind">{card.wind}</p>
      {card.lines.length > 0 && <ul className="sw-pl-endlines">{card.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
    </li>
  );
}

export default function SeaPlanPanel(p: SeaPlanPanelProps) {
  return (
    <section className="sw-pl" aria-label="Ausfahrt planen">
      <header className="sw-pl-head">
        <div className="sw-pl-headtx">
          <h2>Ausfahrt planen</h2>
          <p>ab {p.spotName} <button type="button" className="sw-link" onClick={p.onChangeSpot}>Spot wechseln</button></p>
        </div>
        <button type="button" className="sw-pl-close" onClick={p.onClose} aria-label="Planer schließen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      {p.onMode && <SeaTripSwitch mode="ort" onMode={p.onMode} />}

      {p.official && (
        <div className="sw-pl-official" role="note">
          <strong>Amtliche Meldung für dein Gebiet. Bitte zuerst lesen.</strong>
          {p.official.texts.map((t) => <p key={t.head} className="sw-official"><span className="sw-official-meta">{t.head}</span>{t.text}</p>)}
          <p className="sw-official-why">{p.official.why}</p>
        </div>
      )}

      <div className="sw-profiles sw-pl-profiles" role="group" aria-label="Profil">
        {SEA_PROFILES.map((pf) => <button key={pf.id} type="button" aria-pressed={p.profile === pf.id} className={p.profile === pf.id ? 'is-active' : ''} onClick={() => p.onProfile(pf.id)}>{pf.label}</button>)}
      </div>
      <p className="sw-pl-limits">Deine Grenzen: {p.limitsText}</p>

      {p.noData || !p.start || !p.ret ? (
        <div className="sw-empty"><strong>Kein Fenster planbar.</strong> {p.noData ?? 'Für diesen Spot liegt gerade keine Stundenreihe vor.'}</div>
      ) : (
        <>
          <div className="sw-pl-bar">
            <span className="sw-pl-span-tx">Fenster: {p.span}</span>
            {p.play}
          </div>
          {p.moved && <p className="sw-pl-moved" role="status">{p.moved}</p>}
          {p.band}
          <p className="sw-pl-now">{p.now}</p>
          <ol className="sw-pl-rail">
            <End name="Start" card={p.start} onShift={(by) => p.onShift('start', by)} />
            {p.events.map((e) => (
              <li key={`${e.kind}-${e.t}`} className={`sw-pl-ev${e.warn ? ' is-warn' : ''}${e.kind === 'sunset' ? ' is-sun' : ''}`}>
                <time>{e.at}</time>
                <span>{e.text}</span>
              </li>
            ))}
            <End name="Rückkehr" card={p.ret} onShift={(by) => p.onShift('end', by)} />
          </ol>
          {p.summary.length > 0 && (
            <div className="sw-pl-block">
              <h3>Im ganzen Fenster</h3>
              <ul>{p.summary.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
        </>
      )}

      <div className="sw-pl-block is-notes">
        <h3>Was die Karte zeigt und was nicht</h3>
        <ul>{p.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </div>
      <p className="sw-pl-foot">{PLAN_FOOTER}</p>
    </section>
  );
}
