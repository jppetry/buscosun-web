/**
 * Event-Planung — „Welcher Tag passt am besten?".
 *
 * KERN-US1: Eingabe von Anlass, Ort und Zeitfenster (Datumsbereich ODER konkrete
 * Einzeltermine). Auf „Beste Tage finden" werden die Angaben übernommen und
 * (vorerst) in einer Review-Karte bestätigt — die Wetter-Bewertung/Empfehlung
 * folgt in der nächsten Story und nutzt die bestehende Punktforecast-Pipeline.
 */

import { useState, useRef, useEffect, type KeyboardEvent, type CSSProperties } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import {
  EVENT_ACTIVITIES, customActivity, isQueryComplete, isWindowValid,
  todayISO, horizonEndISO, formatDateLabel, EVENT_HORIZON_DAYS,
  DAYPARTS, defaultPhasesFor, daypartPhase, weddingPhases, newPhaseId,
  PLANB_METRICS, PLANB_VENUES, planBMetricDef, defaultPlanB,
  type EventActivity, type TimeWindow, type EventQuery, type Daypart, type EventPhase, type PresetTuning,
  type PlanBConfig, type PlanBMetric,
} from './eventModel';
import { activityFactorPriorities, defaultTuningFor, candidateDays } from './eventScoring';
import { encodeEventState, decodeEventState, hasEventHash } from './eventState';
import { ActivityIcon, VenueIcon, IconRing, IconSliders, IconReset, IconChevron } from './eventIcons';
import EventResult from './EventResult';
import { NotificationProvider } from '../notifications/useNotifications';
import NotificationCenter from '../notifications/NotificationCenter';
import { useIsMobile } from '../mobile/useIsMobile';
import '../mobile/safeArea.css';
import '../route/tourTheme.css';
import '../intro/intro.css';
import './EventPage.css';

/** Mobile-Wizard (Phase 5, vorgezogen — siehe audit/event.md): nach der Ortswahl war der Rest des
 *  Formulars eine einzige ~3,5-Bildschirmlängen-Seite mit 4 gestapelten Themen. Auf Mobile wird
 *  jeweils nur ein Schritt gerendert; Desktop bleibt unverändert die Einzelseite (siehe `!isMobile`). */
const EVENT_STEPS = ['activity', 'window', 'phases', 'planb'] as const;
type EventStep = (typeof EVENT_STEPS)[number];
const EVENT_STEP_LABELS: Record<EventStep, string> = {
  activity: 'Anlass', window: 'Zeitfenster', phases: 'Phasen', planb: 'Plan B',
};

interface Props {
  onBack: () => void;
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}.${m}.`;
}

/** Möglichkeiten-Liste des Ort-zuerst-Kopfs (Designsprache wie Regenradar-Intro). */
const EV_INTRO_CAPS = [
  'Bester Tag aus den nächsten Tagen — automatisch bewertet',
  'Anlass-Presets (Hochzeit, Grillen, Drohne …) mit Feinjustierung',
  'Phasen wie Trauung & Empfang einzeln gewichtet',
  'Plan-B-Schwelle, Ausweichtag & -ort — native Behörden-Quellen',
];

/* Kleine Line-Icons (currentColor) — wie im Intro/Regenradar. */
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

export default function EventPage(props: Props) {
  // Benachrichtigungs-Kontext umschließt die ganze Seite (Glocke in der Nav +
  // Toggle im Ergebnis greifen auf denselben Provider zu).
  return (
    <NotificationProvider>
      <EventPageInner {...props} />
    </NotificationProvider>
  );
}

function EventPageInner({ onBack }: Props) {
  const [activity, setActivity] = useState<EventActivity | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [windowSel, setWindowSel] = useState<TimeWindow>({ mode: 'range', from: todayISO(), to: horizonEndISO() });
  const [phases, setPhases] = useState<EventPhase[]>(defaultPhasesFor(''));
  const [tuning, setTuning] = useState<PresetTuning>(defaultTuningFor(''));
  const [planB, setPlanB] = useState<PlanBConfig>(defaultPlanB());
  const [submitted, setSubmitted] = useState<EventQuery | null>(null);
  const restoredRef = useRef(false);
  const isMobile = useIsMobile();
  const [mobileStep, setMobileStep] = useState<EventStep>('activity');
  const stepIdx = EVENT_STEPS.indexOf(mobileStep);

  // Neuer Ort (Erstwahl oder „Ändern") → Wizard wieder beim ersten Schritt starten.
  useEffect(() => { if (location) setMobileStep('activity'); }, [location]);

  // Permalink: mit #ev=-Hash direkt mit der geteilten Anfrage ins Ergebnis starten.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const q = decodeEventState(window.location.hash);
    if (!q) return;
    setActivity(q.activity); setLocation(q.location); setWindowSel(q.window);
    setPhases(q.phases); setTuning(q.tuning); setPlanB(q.planB); setSubmitted(q);
  }, []);

  // Ergebnis sichtbar → Anfrage in den Hash schreiben; beim Bearbeiten wieder leeren.
  useEffect(() => {
    if (!restoredRef.current) return;
    if (submitted) {
      const hash = encodeEventState(submitted);
      if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
    } else if (hasEventHash(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [submitted]);

  // Anlasswechsel schlägt Standard-Fenster + Standard-Tuning des Presets vor.
  const handleActivity = (a: EventActivity | null) => {
    setActivity(a);
    if (a) { setPhases(defaultPhasesFor(a.id)); setTuning(defaultTuningFor(a.id)); }
  };

  const partial: Partial<EventQuery> = { activity: activity ?? undefined, location: location ?? undefined, window: windowSel, phases, tuning, planB };
  const complete = isQueryComplete(partial);

  // Gate zwischen den Mobile-Wizard-Schritten — nutzt dieselbe Validierung wie die Desktop-Warnhinweise.
  const phasesValid = phases.every((p) => p.hours[0] !== p.hours[1]);
  const stepValid: Record<EventStep, boolean> = {
    activity: !!activity,
    window: isWindowValid(windowSel),
    phases: phasesValid,
    planb: true,
  };
  const stepCanProceed = stepValid[mobileStep];
  const showStep = (s: EventStep) => !isMobile || mobileStep === s;

  return (
    <div className="ev-page">
      <header className="ev-topbar">
        <a className="ev-logo" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
          <span className="ev-logo-mark" /><span className="ev-logo-name">buscosun</span>
        </a>
        <div className="ev-topbar-right">
          <span className="ev-live"><span className="live-dot" /> Daten live</span>
          <NotificationCenter />
          <button type="button" className="ev-back" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="13" y1="8" x2="3" y2="8" /><polyline points="7,4 3,8 7,12" />
            </svg>
            Zurück zur Startseite
          </button>
        </div>
      </header>

      <main className="rt-container">
        {submitted ? (
          <>
            <header className="rt-intro">
              <span className="rt-eyebrow">Event-Planung</span>
              <h1>Welcher Tag passt am besten?</h1>
              <p>Sag uns Anlass, Ort und wann du Zeit hast — wir vergleichen die nächsten {EVENT_HORIZON_DAYS} Tage und nennen dir den besten.</p>
            </header>
            <EventResult query={submitted} onEdit={() => setSubmitted(null)} />
          </>
        ) : !location ? (
          /* SCHRITT 1 — Ort zuerst, eigene Seite in der Regenradar-Designsprache.
             Erst wenn ein Ort gewählt ist, erscheint das eigentliche Formular. */
          <section className="rt-section ev-intro" style={{ ['--intro-accent']: 'var(--terracotta-500)' } as CSSProperties}>
            <div className="ev-intro-copy">
              <span className="intro-eyebrow">Event-Planung</span>
              <h1 className="ev-intro-title">Welcher Tag passt am besten?</h1>
              <p className="intro-body">
                Sag uns zuerst, <strong>wo</strong> dein Event stattfindet. Danach wählst du Anlass und
                Zeitfenster — wir vergleichen die nächsten {EVENT_HORIZON_DAYS} Tage und nennen dir den besten.
              </p>
              <ul className="intro-caps">
                {EV_INTRO_CAPS.map((c) => (
                  <li key={c}><span className="intro-caps-mark" aria-hidden="true"><IconCheck /></span>{c}</li>
                ))}
              </ul>
              <div className="ev-intro-search">
                <span className="rt-eyebrow">Ort</span>
                <LocationField value={location} onChange={setLocation} />
              </div>
              <p className="intro-howto">
                <span className="intro-howto-ic" aria-hidden="true"><IconHowTo /></span>
                <span><strong>So geht’s:</strong> Ort eingeben — danach Anlass &amp; Zeitfenster festlegen und die besten Tage finden.</span>
              </p>
            </div>
          </section>
        ) : (
          <>
            <header className="rt-intro">
              <span className="rt-eyebrow">Event-Planung</span>
              <h1>Welcher Tag passt am besten?</h1>
              <p>Anlass und Zeitfenster festlegen — wir vergleichen die nächsten {EVENT_HORIZON_DAYS} Tage für deinen Ort.</p>
            </header>

            {/* Gewählter Ort — kompakt; „Ändern" führt zurück zur Ortswahl. */}
            <section className="rt-section ev-loc-compact">
              <span className="rt-eyebrow">Ort</span>
              <LocationField value={location} onChange={setLocation} />
            </section>

            <div className="ev-tiles ev-tiles-3">
              <SummaryTile
                label="Anlass"
                value={activity?.label ?? null}
                note={activity?.hint ?? 'Nicht gewählt'}
              />
              <SummaryTile
                label="Zeitfenster"
                value={
                  windowSel.mode === 'range'
                    ? `${shortDate(windowSel.from)}–${shortDate(windowSel.to)}`
                    : windowSel.dates.length > 0
                    ? `${windowSel.dates.length} Termin${windowSel.dates.length !== 1 ? 'e' : ''}`
                    : null
                }
                note={windowSel.mode === 'range' ? 'Zeitraum' : windowSel.dates.length > 0 ? formatDateLabel(windowSel.dates[0]) : 'Keine Termine'}
              />
              <SummaryTile
                label="Status"
                value={complete ? 'Bereit' : null}
                note={
                  complete
                    ? 'Alle Angaben vollständig'
                    : !activity
                    ? 'Anlass fehlt'
                    : 'Zeitfenster prüfen'
                }
                accent={complete ? 'sage' : undefined}
              />
            </div>

            {isMobile && (
              <nav className="ev-step-progress" aria-label="Fortschritt">
                {EVENT_STEPS.map((s, i) => (
                  <span key={s} className={`ev-step-dot${i === stepIdx ? ' is-active' : i < stepIdx ? ' is-done' : ''}`} aria-hidden="true" />
                ))}
                <span className="ev-step-label">Schritt {stepIdx + 1} von {EVENT_STEPS.length} · {EVENT_STEP_LABELS[mobileStep]}</span>
              </nav>
            )}

            {showStep('activity') && (
              <section className="rt-section">
                <span className="rt-eyebrow">1 · Anlass</span>
                <ActivityPicker value={activity} onChange={handleActivity} />
                {activity && (activity.id !== 'custom' || activity.label.length > 0) && (
                  <>
                    <PresetFactors activity={activity} tuning={tuning} />
                    <TuningPanel activity={activity} tuning={tuning} onChange={setTuning} />
                  </>
                )}
              </section>
            )}

            {showStep('window') && (
              <section className="rt-section">
                <span className="rt-eyebrow">2 · Zeitfenster</span>
                <TimeWindowField value={windowSel} onChange={setWindowSel} />
              </section>
            )}

            {showStep('phases') && (
              <section className="rt-section">
                <span className="rt-eyebrow">3 · Phasen</span>
                <p className="ev-section-lead">Lege Phasen wie Trauung, Empfang und Abendfeier mit eigenen Zeiten an — jede wird einzeln bewertet, der Tag fasst sie zusammen.</p>
                <PhasesField value={phases} onChange={setPhases} />
              </section>
            )}

            {showStep('planb') && (
              <section className="rt-section">
                <span className="rt-eyebrow">4 · Plan B <span className="ev-optional">optional</span></span>
                <p className="ev-section-lead">Lege eine klare Schwelle fest, ab der dir ein Plan B (z. B. Zelt oder Innenraum) empfohlen wird — plus Ausweichtag und -ort, falls dein Wunschtermin nicht hält.</p>
                <PlanBField value={planB} window={windowSel} onChange={setPlanB} />
              </section>
            )}

            {!isMobile && (
              <div className="ev-cta-row">
                <button
                  type="button"
                  className="ev-cta"
                  disabled={!complete}
                  onClick={() => complete && setSubmitted(partial as EventQuery)}
                >
                  Beste Tage finden
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                    <line x1="1" y1="6" x2="10" y2="6" /><polyline points="6,2 10,6 6,10" />
                  </svg>
                </button>
                {!complete && <span className="ev-cta-hint">Anlass und Zeitfenster wählen</span>}
              </div>
            )}

            {isMobile && (
              <div className="ev-step-nav safe-pad-bottom">
                {stepIdx > 0 && (
                  <button type="button" className="ev-step-back" onClick={() => setMobileStep(EVENT_STEPS[stepIdx - 1])}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="13" y1="8" x2="3" y2="8" /><polyline points="7,4 3,8 7,12" />
                    </svg>
                    Zurück
                  </button>
                )}
                {mobileStep !== 'planb' ? (
                  <button
                    type="button"
                    className="ev-step-next"
                    disabled={!stepCanProceed}
                    onClick={() => stepCanProceed && setMobileStep(EVENT_STEPS[stepIdx + 1])}
                  >
                    Weiter
                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                      <line x1="1" y1="6" x2="10" y2="6" /><polyline points="6,2 10,6 6,10" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ev-cta ev-step-cta"
                    disabled={!complete}
                    onClick={() => complete && setSubmitted(partial as EventQuery)}
                  >
                    Beste Tage finden
                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                      <line x1="1" y1="6" x2="10" y2="6" /><polyline points="6,2 10,6 6,10" />
                    </svg>
                  </button>
                )}
                {mobileStep === 'planb' && !complete && <span className="ev-cta-hint">Anlass und Zeitfenster wählen</span>}
              </div>
            )}

            <div className="rt-trust" style={{ marginTop: '1.6rem' }}>
              <span className="dot">●</span> Native Behörden-Quellen: DWD · GeoSphere · MeteoSwiss · höhenkorrigiert · keine Tracker
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// Summary-Kacheln (wie asst-stat im Meteorologen — leer=cream, gefüllt=weiß)
// ============================================================================
function SummaryTile({ label, value, note, accent }: {
  label: string;
  value: string | null;
  note?: string;
  accent?: 'sage';
}) {
  const filled = value !== null;
  return (
    <div className={`ev-tile${filled ? ' ev-tile-filled' : ''}${accent === 'sage' && filled ? ' ev-tile-sage' : ''}`}>
      <span className="ev-tile-label">{label}</span>
      <strong className="ev-tile-val">{value ?? '–'}</strong>
      {note && <em className="ev-tile-note">{note}</em>}
    </div>
  );
}

// ============================================================================
// 1 · Anlass — Kachel-Grid + freier Anlass
// ============================================================================
function ActivityPicker({ value, onChange }: { value: EventActivity | null; onChange: (a: EventActivity | null) => void }) {
  const isCustom = value?.id === 'custom';
  const [customText, setCustomText] = useState(isCustom ? value!.label : '');
  const customRef = useRef<HTMLInputElement>(null);

  const selectCustom = () => {
    onChange(customActivity(customText));
    setTimeout(() => customRef.current?.focus(), 0);
  };

  return (
    <>
      <div className="ev-activities" role="radiogroup" aria-label="Anlass">
        {EVENT_ACTIVITIES.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={value?.id === a.id}
            className={`ev-activity${value?.id === a.id ? ' is-selected' : ''}`}
            onClick={() => onChange(a)}
          >
            <span className="ev-activity-icon" aria-hidden="true"><ActivityIcon id={a.id} size={24} /></span>
            <span className="ev-activity-label">{a.label}</span>
            <span className="ev-activity-hint">{a.hint}</span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={isCustom}
          className={`ev-activity ev-activity-custom${isCustom ? ' is-selected' : ''}`}
          onClick={selectCustom}
        >
          <span className="ev-activity-icon" aria-hidden="true"><ActivityIcon id="custom" size={24} /></span>
          <span className="ev-activity-label">Eigener Anlass</span>
          <span className="ev-activity-hint">frei beschreiben</span>
        </button>
      </div>
      {isCustom && (
        <input
          ref={customRef}
          type="text"
          className="ev-custom-input"
          placeholder="z. B. Open-Air-Konzert, Drohnenflug …"
          value={customText}
          onChange={(e) => { setCustomText(e.target.value); onChange(customActivity(e.target.value)); }}
          aria-label="Eigener Anlass"
        />
      )}
    </>
  );
}

/** PRE-US1 — zeigt, welche Faktoren das gewählte Preset automatisch bewertet (mit Tuning). */
function PresetFactors({ activity, tuning }: { activity: EventActivity; tuning: PresetTuning }) {
  const factors = activityFactorPriorities(activity.id, tuning);
  const isCustom = activity.id === 'custom';
  return (
    <div className="ev-preset-factors" role="status">
      <span className="ev-preset-factors-label">
        ✓ {isCustom ? 'Standard-Faktoren (eigener Anlass)' : `Für ${activity.label} automatisch bewertet`} — keine Einstellung nötig:
      </span>
      <div className="ev-preset-chips">
        {factors.map((f, i) => (
          <span key={f.key} className={`ev-pf-chip${i === 0 ? ' ev-pf-top' : ''}`}>
            {f.label}{i === 0 && <span className="ev-pf-badge">wichtigste</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// PRE-US2 — Preset feinjustieren (Schwellwerte ändern + zurücksetzen)
// ============================================================================
const TUNE_FACTORS: Array<{ key: 'precip' | 'temp' | 'wind' | 'cloud'; label: string }> = [
  { key: 'precip', label: 'Trockenheit' },
  { key: 'temp', label: 'Temperatur' },
  { key: 'wind', label: 'Windruhe' },
  { key: 'cloud', label: 'Sonne / Sicht' },
];
const weightLevel = (w: number) => (w >= 0.7 ? 'entscheidend' : w >= 0.4 ? 'wichtig' : w >= 0.15 ? 'wenig' : 'egal');
const weightTier = (w: number) => (w >= 0.7 ? 'high' : w >= 0.4 ? 'mid' : w >= 0.15 ? 'low' : 'off');
const clampHrLocal = (v: string) => Math.max(-10, Math.min(45, parseInt(v || '0', 10) || 0));

function TuningPanel({ activity, tuning, onChange }: { activity: EventActivity; tuning: PresetTuning; onChange: (t: PresetTuning) => void }) {
  const def = defaultTuningFor(activity.id);
  const changed = JSON.stringify(tuning) !== JSON.stringify(def);
  const setWeight = (k: 'precip' | 'temp' | 'wind' | 'cloud', v: number) =>
    onChange({ ...tuning, weights: { ...tuning.weights, [k]: v } });
  const setTemp = (idx: 0 | 1, v: number) => {
    const t: [number, number] = [tuning.idealTemp[0], tuning.idealTemp[1]];
    t[idx] = v;
    onChange({ ...tuning, idealTemp: t });
  };

  return (
    <details className="ev-tune" open>
      <summary className="ev-tune-summary">
        <span className="ev-tune-summary-icon" aria-hidden="true"><IconSliders size={16} /></span>
        <span className="ev-tune-summary-text">Feinjustierung — an mein Empfinden anpassen</span>
        {changed && <span className="ev-tune-changed">angepasst</span>}
        <span className="ev-tune-chevron" aria-hidden="true"><IconChevron size={16} /></span>
      </summary>
      <div className="ev-tune-body">
        <div className="ev-tune-row ev-tune-temp">
          <label className="ev-tune-label">Wohlfühl-Temperatur</label>
          <div className="ev-tune-control">
            <input type="number" className="ev-tune-hr" min={-10} max={45} value={tuning.idealTemp[0]}
              aria-label="Wohlfühl-Temperatur von" onChange={(e) => setTemp(0, clampHrLocal(e.target.value))} />
            <span className="ev-tune-dash">–</span>
            <input type="number" className="ev-tune-hr" min={-10} max={45} value={tuning.idealTemp[1]}
              aria-label="Wohlfühl-Temperatur bis" onChange={(e) => setTemp(1, clampHrLocal(e.target.value))} />
            <span className="ev-tune-unit">°C</span>
          </div>
        </div>
        <div className="ev-tune-weights">
          {TUNE_FACTORS.map((f) => {
            const w = tuning.weights[f.key];
            return (
              <div key={f.key} className="ev-tune-row">
                <label className="ev-tune-label" htmlFor={`tune-${f.key}`}>{f.label}</label>
                <div className="ev-tune-control">
                  <input id={`tune-${f.key}`} type="range" className="ev-tune-slider" min={0} max={1} step={0.05}
                    value={w} style={{ '--fill': `${Math.round(w * 100)}%` } as React.CSSProperties}
                    onChange={(e) => setWeight(f.key, parseFloat(e.target.value))} />
                  <span className={`ev-tune-level ev-tune-level-${weightTier(w)}`}>{weightLevel(w)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className="ev-tune-reset" disabled={!changed} onClick={() => onChange(def)}>
          <IconReset size={14} /> Auf Preset zurücksetzen
        </button>
      </div>
    </details>
  );
}

// ============================================================================
// 2 · Ort — Geocoder-Suche → ausgewählter Ort
// ============================================================================
function LocationField({ value, onChange }: { value: Location | null; onChange: (l: Location | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function search() {
    const q = query.trim();
    if (!q) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null); setResults([]);
    try {
      const found = await geocodeDACH(q, ac.signal);
      if (ac.signal.aborted) return;
      if (found.length === 0) setError('Keine Ergebnisse in DE / AT / CH gefunden.');
      else if (found.length === 1) onChange(found[0]);
      else setResults(found);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); void search(); }
    if (e.key === 'Escape') { setResults([]); setError(null); }
  }

  if (value) {
    return (
      <div className="ev-loc-chip ev-card">
        <span className="ev-loc-flag" aria-hidden="true">{flagForCountry(value.country)}</span>
        <span className="ev-loc-name">{value.name}</span>
        <button type="button" className="ev-loc-change" onClick={() => { onChange(null); setResults([]); setQuery(''); }}>
          Ändern
        </button>
      </div>
    );
  }

  return (
    <div className="ev-search-wrap">
      <div className="ev-search">
        <svg className="ev-search-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="8" cy="8" r="6" /><line x1="13" y1="13" x2="17" y2="17" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          className="ev-search-input"
          placeholder="Stadt, Adresse oder PLZ …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          disabled={loading}
          aria-label="Ort suchen"
        />
        <button type="button" className="ev-search-go" onClick={() => void search()} disabled={loading || !query.trim()}>
          {loading ? 'Suche …' : 'Suchen'}
        </button>
      </div>
      {(results.length > 0 || error) && (
        <div className="ev-search-dropdown" role="listbox">
          {error && <div className="ev-search-error">⚠ {error}</div>}
          {results.map((r) => (
            <button key={`${r.lat},${r.lon}`} type="button" className="ev-search-result" onClick={() => onChange(r)}>
              <span className="ev-loc-flag" aria-hidden="true">{flagForCountry(r.country)}</span>
              <span className="ev-search-result-name">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3 · Zeitfenster — Bereich ODER Einzeltermine
// ============================================================================
function TimeWindowField({ value, onChange }: { value: TimeWindow; onChange: (w: TimeWindow) => void }) {
  const min = todayISO();
  const max = horizonEndISO();
  const [pendingDate, setPendingDate] = useState('');

  const setMode = (mode: 'range' | 'dates') => {
    if (mode === value.mode) return;
    onChange(mode === 'range' ? { mode: 'range', from: min, to: max } : { mode: 'dates', dates: [] });
  };

  const addDate = () => {
    if (value.mode !== 'dates' || !pendingDate) return;
    if (pendingDate < min || pendingDate > max) return;
    if (value.dates.includes(pendingDate)) { setPendingDate(''); return; }
    onChange({ mode: 'dates', dates: [...value.dates, pendingDate].sort() });
    setPendingDate('');
  };
  const removeDate = (d: string) => {
    if (value.mode !== 'dates') return;
    onChange({ mode: 'dates', dates: value.dates.filter((x) => x !== d) });
  };

  return (
    <div className="ev-window">
      <div className="ev-seg" role="tablist" aria-label="Art des Zeitfensters">
        <button type="button" role="tab" aria-selected={value.mode === 'range'} className={`ev-seg-btn${value.mode === 'range' ? ' is-active' : ''}`} onClick={() => setMode('range')}>
          Zeitraum
        </button>
        <button type="button" role="tab" aria-selected={value.mode === 'dates'} className={`ev-seg-btn${value.mode === 'dates' ? ' is-active' : ''}`} onClick={() => setMode('dates')}>
          Einzeltermine
        </button>
      </div>

      {value.mode === 'range' ? (
        <div className="ev-range">
          <label className="ev-field">
            <span className="ev-field-label">Von</span>
            <input type="date" className="ev-date" min={min} max={max} value={value.from}
              onChange={(e) => onChange({ mode: 'range', from: e.target.value, to: value.to })} />
          </label>
          <span className="ev-range-dash" aria-hidden="true">–</span>
          <label className="ev-field">
            <span className="ev-field-label">Bis</span>
            <input type="date" className="ev-date" min={value.from || min} max={max} value={value.to}
              onChange={(e) => onChange({ mode: 'range', from: value.from, to: e.target.value })} />
          </label>
          {!isWindowValid(value) && <span className="ev-window-warn">Bitte einen gültigen Zeitraum innerhalb der nächsten {EVENT_HORIZON_DAYS} Tage wählen.</span>}
        </div>
      ) : (
        <div className="ev-dates">
          <div className="ev-dates-add">
            <input type="date" className="ev-date" min={min} max={max} value={pendingDate}
              onChange={(e) => setPendingDate(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDate(); } }} />
            <button type="button" className="ev-add-btn" onClick={addDate} disabled={!pendingDate}>+ Hinzufügen</button>
          </div>
          {value.dates.length > 0 ? (
            <div className="ev-chips">
              {value.dates.map((d) => (
                <span key={d} className="ev-chip">
                  {formatDateLabel(d)}
                  <button type="button" className="ev-chip-x" aria-label={`${formatDateLabel(d)} entfernen`} onClick={() => removeDate(d)}>×</button>
                </span>
              ))}
            </div>
          ) : (
            <p className="ev-dates-empty">Noch keine Termine — füge bis zu {EVENT_HORIZON_DAYS} konkrete Tage hinzu.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4 · Phasen — eine oder mehrere benannte Zeitfenster (WIN-US1 + WIN-US2)
// ============================================================================
const clampHr = (v: string) => Math.max(0, Math.min(24, parseInt(v || '0', 10) || 0));

function PhasesField({ value, onChange }: { value: EventPhase[]; onChange: (p: EventPhase[]) => void }) {
  const setPreset = (id: Daypart) => onChange([daypartPhase(id)]);
  const addPhase = () => onChange([...value, { id: newPhaseId(), label: `Phase ${value.length + 1}`, hours: [14, 18] }]);
  const update = (id: string, patch: Partial<EventPhase>) => onChange(value.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: string) => onChange(value.filter((p) => p.id !== id));

  return (
    <div className="ev-phases-field">
      <div className="ev-phase-presets">
        <span className="ev-phase-presets-label">Vorlage:</span>
        {DAYPARTS.map((d) => (
          <button key={d.id} type="button" className="ev-preset-btn" onClick={() => setPreset(d.id)}>{d.label}</button>
        ))}
        <button type="button" className="ev-preset-btn ev-preset-wedding" onClick={() => onChange(weddingPhases())}><IconRing size={15} /> Hochzeit (3 Phasen)</button>
      </div>

      <div className="ev-phase-rows">
        {value.map((p) => (
          <div key={p.id} className="ev-phase-row">
            <input
              className="ev-phase-name" type="text" value={p.label} placeholder="Phasenname" aria-label="Phasenname"
              onChange={(e) => update(p.id, { label: e.target.value })}
            />
            <div className="ev-phase-times">
              <input className="ev-phase-hr" type="number" min={0} max={24} value={p.hours[0]} aria-label="Von (Stunde)"
                onChange={(e) => update(p.id, { hours: [clampHr(e.target.value), p.hours[1]] })} />
              <span className="ev-phase-dash" aria-hidden="true">–</span>
              <input className="ev-phase-hr" type="number" min={0} max={24} value={p.hours[1]} aria-label="Bis (Stunde)"
                onChange={(e) => update(p.id, { hours: [p.hours[0], clampHr(e.target.value)] })} />
              <span className="ev-phase-uhr">Uhr</span>
            </div>
            {value.length > 1 && (
              <button type="button" className="ev-phase-remove" aria-label={`${p.label} entfernen`} onClick={() => remove(p.id)}>×</button>
            )}
          </div>
        ))}
      </div>

      <button type="button" className="ev-add-btn ev-phase-add" onClick={addPhase}>+ Phase hinzufügen</button>
      {value.some((p) => p.hours[0] === p.hours[1]) && <p className="ev-window-warn">Jede Phase braucht ein Fenster (Von ≠ Bis).</p>}
    </div>
  );
}

// ============================================================================
// 5 · Plan B — Schwelle, Ausweich-Option, Wunschtag (PLANB-US1)
// ============================================================================
function PlanBField({ value, window, onChange }: { value: PlanBConfig; window: TimeWindow; onChange: (p: PlanBConfig) => void }) {
  const days = candidateDays(window);
  const def = planBMetricDef(value.metric);
  const setMetric = (metric: PlanBMetric) => onChange({ ...value, metric, threshold: planBMetricDef(metric).default });

  return (
    <div className="ev-planb-field">
      <label className="ev-planb-enable">
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} />
        <span>Plan-B-Schwelle aktivieren</span>
      </label>

      {value.enabled && (
        <div className="ev-planb-config">
          <div className="ev-planb-row">
            <label className="ev-planb-label" htmlFor="planb-metric">Auslöser</label>
            <select id="planb-metric" className="ev-planb-select" value={value.metric} onChange={(e) => setMetric(e.target.value as PlanBMetric)}>
              {PLANB_METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          <div className="ev-planb-row">
            <label className="ev-planb-label" htmlFor="planb-thr">{def.direction === 'above' ? 'Plan B ab' : 'Plan B unter'}</label>
            <div className="ev-planb-thr">
              <input id="planb-thr" type="range" min={def.min} max={def.max} step={def.step} value={value.threshold}
                onChange={(e) => onChange({ ...value, threshold: parseFloat(e.target.value) })} />
              <span className="ev-planb-thr-val">{value.threshold} {def.unit}</span>
            </div>
          </div>
          <p className="ev-planb-hint">{def.hint}</p>

          <div className="ev-planb-row ev-planb-venues-row">
            <span className="ev-planb-label">Ausweich-Option</span>
            <div className="ev-planb-venues">
              {PLANB_VENUES.map((v) => (
                <button key={v.id} type="button" className={`ev-planb-venue${value.venue === v.id ? ' is-selected' : ''}`}
                  onClick={() => onChange({ ...value, venue: v.id })}>
                  <span className="ev-planb-venue-icon" aria-hidden="true"><VenueIcon id={v.id} size={20} /></span>
                  <span className="ev-planb-venue-label">{v.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ev-planb-row">
            <label className="ev-planb-label" htmlFor="planb-wish">Wunschtag</label>
            <select id="planb-wish" className="ev-planb-select" value={value.wishDate ?? ''} onChange={(e) => onChange({ ...value, wishDate: e.target.value || null })}>
              <option value="">Bester Tag (automatisch)</option>
              {days.map((d) => <option key={d} value={d}>{formatDateLabel(d)}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

