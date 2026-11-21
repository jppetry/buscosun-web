/**
 * Phase SP — the planner „Vor Ort“ (`audit/seewetter-planer.md`). Since AM-W (`audit/seewetter-ausfahrt.md` §13) what
 * one SETS is two pages of the assistant — `OrtSpotStep` (the spot, the boat) and `OrtTimeStep` (the window) —, what
 * follows from it is the default export on the result page (right on the desktop, last in the phone's sheet); the hour
 * band lies at the foot of the map.
 *
 * The findings keep their own picture: one rail from "Start" to "Rückkehr" — the two ends are the cards of their hour,
 * what happens between them hangs on the rail at its hour. Below it what holds for the whole window, the notes on what
 * the map does NOT say, and the footer. Every number is an hourly value of the spot; nothing is computed here
 * (`seaPlanner.ts` does).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { PLAN_FOOTER, SEA_PLAN_RADIUS_KM, type PlanEvent } from './seaPlanner';
import { StartSketch, TripStepper } from './SeaTripSwitch';
import { WIZ_BAND_NOTE } from './seaSteps';
import { WizHowTo, type WizHowItem } from './SeaWizard';

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
/** Official message for the spot's area, verbatim — read before everything else (Seewetter check 3). */
export interface PlanOfficialProps { texts: Array<{ head: string; text: string }>; why: string }
export function PlanOfficial(p: PlanOfficialProps) {
  return (
    <div className="sw-pl-official" role="note">
      <strong>Amtliche Meldung für dein Gebiet. Bitte zuerst lesen.</strong>
      {p.texts.map((t) => <p key={t.head} className="sw-official"><span className="sw-official-meta">{t.head}</span>{t.text}</p>)}
      <p className="sw-official-why">{p.why}</p>
    </div>
  );
}

// --- Input: what one sets, a page of the assistant each (AM-W, §13) ---------------------------------------------------

export interface OrtSpotStepProps {
  /** The spot the trip starts from; `null` while none is chosen. */
  spotName: string | null;
  /** "1,2 km" — the boat in front of the spot; `null` without a plan. */
  boat: string | null;
  /** Desktop: the list of spots (search, Revier, spots) stands on this page. */
  picker?: ReactNode;
  /** Phone: the list is the page „Spot“ of the bottom bar — this opens it. */
  onOpenPicker?: (() => void) | null;
  /** „Eigener Punkt“ (`seaOwnPoint.ts`): set a start point on the map instead of a spot. Absent = not offered. */
  own?: OrtOwnProps;
}
export interface OrtOwnProps {
  /** The next click on the map sets the point. */
  armed: boolean; onArm: (on: boolean) => void;
  /** A point is set; `loading` while its values are read. */
  set: boolean; loading: boolean;
  /** Why the last point could not be used. */
  err: string | null;
  onClear: () => void;
  /** Where its numbers come from, one sentence each. */
  notes: readonly string[];
}
/** „Eigener Punkt“: a place on the coast or an island that is not in the list. */
function OrtOwn({ o }: { o: OrtOwnProps }) {
  return (
    <details className="sw-wz-sec sw-wz-own" open={o.set || o.armed || !!o.err || undefined}>
      <summary>{o.set ? 'Eigener Punkt' : 'Startort nicht in der Liste? Eigenen Punkt setzen'}</summary>
      {o.set ? (
        <>
          {o.loading ? <p className="sw-am-fine" role="status">Werte für deinen Punkt werden gerechnet …</p>
            : <ul className="sw-wz-ownnotes">{o.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          <div className="sw-wz-ownrow">
            <button type="button" className={`sw-wz-pick${o.armed ? ' is-first' : ''}`} aria-pressed={o.armed} onClick={() => o.onArm(!o.armed)}>{o.armed ? 'Abbrechen' : 'Punkt neu setzen'}</button>
            <button type="button" className="sw-link" onClick={o.onClear}>Punkt entfernen</button>
          </div>
        </>
      ) : (
        <>
          <p className="sw-am-fine">Setze deinen Startort selbst an die Küste oder auf eine Insel. Gerechnet wird an genau diesem Punkt.</p>
          <button type="button" className={`sw-wz-pick${o.armed ? ' is-first' : ''}`} aria-pressed={o.armed} onClick={() => o.onArm(!o.armed)}>
            {o.armed ? 'Jetzt auf die Karte klicken … (Abbrechen)' : 'Eigenen Punkt auf der Karte setzen'}
          </button>
        </>
      )}
      {o.err && <p className="sw-wz-block" role="status">{o.err}</p>}
    </details>
  );
}
/**
 * The page's guide. With a spot chosen a card names only that spot (Jan 19.11.: the boat line, „Weiter“ and the radius
 * fold were too much text — the boat on the map stays draggable, the radius note stays in the result's notes). How one
 * chooses stands below it as two pictures (`StartSketch`: tap a spot, drag the boat), with or without a spot.
 */
function OrtGuide({ spotName }: { spotName: string | null }) {
  const items: WizHowItem[] = [{ head: 'Startort', text: <b>{spotName}</b>, state: 'done' }];
  return (
    <>
      {spotName && <WizHowTo items={items} label="Dein Startort" />}
      <StartSketch picked={!!spotName} radiusKm={SEA_PLAN_RADIUS_KM} />
    </>
  );
}
/** With a spot chosen only that spot stands on the page; the list comes back on „Anderen Spot wählen“ (and folds again on a new pick). */
function OrtOtherSpot({ spotName, picker }: { spotName: string; picker: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [spotName]);
  return open ? (
    <section className="sw-wz-sec">
      <h3>Anderen Spot wählen</h3>
      <p className="sw-am-fine sw-wz-listnote">{ORT_LIST_NOTE}</p>
      {picker}
      <button type="button" className="sw-link" onClick={() => setOpen(false)}>Liste schließen</button>
    </section>
  ) : (
    <section className="sw-wz-sec">
      <button type="button" className="sw-wz-pick" onClick={() => setOpen(true)}>Anderen Spot wählen</button>
    </section>
  );
}
/** What the list says after each spot. */
const ORT_LIST_NOTE = '„Fenster Sa 08:00“ zeigt, ab wann der Spot das nächste Mal zu deinem Profil passt; „kein Fenster im Lauf“: in der ganzen Vorhersage nicht.';

/** Page „Startort“: the spot, and the boat in front of it. */
export function OrtSpotStep(p: OrtSpotStepProps) {
  return (
    <>
      <OrtGuide spotName={p.spotName} />
      {/* Without a spot there is nothing to show yet: the page begins with the way to choose one. */}
      {p.spotName ? p.onOpenPicker && (
        <section className="sw-wz-sec">
          <button type="button" className="sw-wz-pick" onClick={p.onOpenPicker}>Spot wechseln</button>
        </section>
      ) : p.onOpenPicker && (
        <section className="sw-wz-sec">
          <button type="button" className="sw-wz-pick is-first" onClick={p.onOpenPicker}>Spot wählen</button>
          <p className="sw-am-fine">Oder tippe den Spot auf der Karte an.</p>
        </section>
      )}
      {p.own && <OrtOwn o={p.own} />}
      {p.picker && (p.spotName ? <OrtOtherSpot spotName={p.spotName} picker={p.picker} /> : (
        <section className="sw-wz-sec">
          <h3>Spot wählen</h3>
          <p className="sw-am-fine sw-wz-listnote">{ORT_LIST_NOTE}</p>
          {p.picker}
        </section>
      ))}
    </>
  );
}

export interface OrtTimeStepProps {
  /** The two ends of the window (their time and whether they can move); `null` without a window. */
  start: Pick<SeaPlanCard, 'when' | 'canEarlier' | 'canLater'> | null; ret: Pick<SeaPlanCard, 'when' | 'canEarlier' | 'canLater'> | null;
  onShift: (which: 'start' | 'end', by: -1 | 1) => void;
  /** "3 Stunden". */
  hours: string | null;
  /** The window of the link was moved or cut. */
  moved: string | null;
}
/** Page „Zeitfenster“: start and return, each stepped by the hour; the hour band with its two handles lies at the foot of the map. */
export function OrtTimeStep(p: OrtTimeStepProps) {
  const win = p.start && p.ret;
  return (
    <>
    {win && (
      <WizHowTo label="So legst du das Fenster fest" items={[
        { head: 'Start und Rückkehr', text: 'Mit den Pfeilen neben der Uhrzeit, je eine Stunde früher oder später.', state: 'now' },
      ]} />
    )}
    <section className="sw-wz-sec">
      <h3>Fenster</h3>
      {win ? (
        <>
          <dl className="sw-am-box">
            <div><dt>Start</dt><dd className="sw-pl-when"><time>{p.start!.when}</time><TripStepper label="Start" onShift={(by) => p.onShift('start', by)} canEarlier={p.start!.canEarlier} canLater={p.start!.canLater} /></dd></div>
            <div><dt>Rückkehr</dt><dd className="sw-pl-when"><time>{p.ret!.when}</time><TripStepper label="Rückkehr" onShift={(by) => p.onShift('end', by)} canEarlier={p.ret!.canEarlier} canLater={p.ret!.canLater} /></dd></div>
            <div><dt>Länge</dt><dd>{p.hours ?? '–'}</dd></div>
          </dl>
          {p.moved && <p className="sw-pl-moved" role="status">{p.moved}</p>}
          <p className="sw-am-fine">{WIZ_BAND_NOTE}</p>
        </>
      ) : <p className="sw-am-fine">Gerade steht kein Fenster auf den Stunden der Vorhersage.</p>}
    </section>
    </>
  );
}

// --- Findings: what follows from it -------------------------------------------------------------------------------------

export interface SeaPlanPanelProps {
  spotName: string;
  /** "Do 13:00 bis Do 16:00"; `null` without a window. */
  when: string | null;
  /** "Kite". */
  profileLabel: string;
  /** Why there is nothing to plan with (no run, kill switch); the panel then shows only this. */
  noData: string | null;
  /** Shown ABOVE the findings; on the phone the page places it above the whole sheet instead and passes `null`. */
  official: PlanOfficialProps | null;
  start: SeaPlanCard | null; ret: SeaPlanCard | null;
  events: readonly PlanEvent[];
  summary: readonly string[];
  notes: readonly string[];
  /** The window of the link was moved or cut. */
  moved: string | null;
  /** What the map shows at the chosen hour: return line and the side the wind comes from. */
  now: string;
  /** Absent inside the assistant: its own head closes the planner. */
  onClose?: () => void;
}

/** A line „Etikett: Wert“ reads as a quiet label and a strong value (same words, same order); without a colon it is all value. */
function lineParts(text: string): ReactNode {
  const i = text.indexOf(': ');
  return i < 0 ? <b>{text}</b> : <><span>{text.slice(0, i + 1)}</span> <b>{text.slice(i + 2)}</b></>;
}
/**
 * One end of the window. Presentation only: the wind value stands large with gusts and direction beside it, the line of
 * the profile („Kite: außerhalb …“) comes first with the colour of its class, the other lines follow as label and value.
 */
function End({ name, card, profileLabel }: { name: 'Start' | 'Rückkehr'; card: SeaPlanCard; profileLabel: string }) {
  const verdict = card.lines.find((l) => l.startsWith(`${profileLabel}: `)) ?? null;
  const lines = card.lines.filter((l) => l !== verdict);
  const cut = /^\d/.test(card.wind) ? card.wind.indexOf(', ') : -1;
  return (
    <li className={`sw-pl-end${name === 'Start' ? ' is-start' : ' is-return'}`}>
      <span className={`sw-pl-knot${card.color ? '' : ' is-hatched'}`} style={card.color ? { background: card.color } : undefined} aria-hidden="true" />
      <div className="sw-pl-endhead">
        <h3>{name}</h3>
        <time>{card.when}</time>
      </div>
      <p className="sw-pl-endwind">{cut < 0 ? card.wind : <><b>{card.wind.slice(0, cut)}</b><span>{card.wind.slice(cut)}</span></>}</p>
      {verdict && (
        <p className="sw-pl-verdict">
          <i className={card.color ? '' : 'is-hatched'} style={card.color ? { background: card.color } : undefined} aria-hidden="true" />
          <span>{lineParts(verdict)}</span>
        </p>
      )}
      {lines.length > 0 && <ul className="sw-pl-endlines">{lines.map((l) => <li key={l}>{lineParts(l)}</li>)}</ul>}
    </li>
  );
}

export default function SeaPlanPanel(p: SeaPlanPanelProps) {
  return (
    <section className="sw-pl" aria-label="Ausfahrt vor Ort: Befunde">
      <header className="sw-pl-head">
        <div className="sw-pl-headtx">
          <h2>{p.spotName}</h2>
          <p>{p.when ? `${p.when} · ${p.profileLabel}` : p.profileLabel}</p>
        </div>
        {p.onClose && (
          <button type="button" className="sw-pl-close" onClick={p.onClose} aria-label="Planer schließen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </header>

      {p.official && <PlanOfficial {...p.official} />}

      {p.noData || !p.start || !p.ret ? (
        <div className="sw-empty"><strong>Kein Fenster planbar.</strong> {p.noData ?? 'Für diesen Spot liegt gerade keine Stundenreihe vor.'}</div>
      ) : (
        <>
          {p.moved && <p className="sw-pl-moved" role="status">{p.moved}</p>}
          <p className="sw-pl-now">{p.now}</p>
          <ol className="sw-pl-rail">
            <End name="Start" card={p.start} profileLabel={p.profileLabel} />
            {p.events.map((e) => (
              <li key={`${e.kind}-${e.t}`} className={`sw-pl-ev${e.warn ? ' is-warn' : ''}${e.kind === 'sunset' ? ' is-sun' : ''}`}>
                <time>{e.at}</time>
                <span>{e.text}</span>
              </li>
            ))}
            <End name="Rückkehr" card={p.ret} profileLabel={p.profileLabel} />
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
