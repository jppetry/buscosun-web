/**
 * Event-Planung — „Welcher Tag passt am besten?" · Command-Deck (hell).
 *
 * Redesign nach verbindlicher Vorlage (audit/screenshots/kartenseite/
 * eventplaner.dc.html + desktop/tablet/mobile-1..4.png): dreistufiger Wizard
 * (Ort & Anlass · Zeitfenster & Phasen · Plan B) VOR der Resultatseite, danach
 * das bester-Tag-Deck (EventResult). Funktionserhalt: Anlass/Profil, Geocode,
 * Zeitfenster (Zeitraum/Einzeltermine), Phasen (Vorlagen/Stundenfenster/Hochzeit),
 * Feinjustierung, Plan-B (Schwelle/Metrik/Ausweich/Venue), Permalink — alles bleibt
 * verdrahtet, nur nach Vorlage angeordnet.
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import {
  EVENT_ACTIVITIES, customActivity, isQueryComplete, isWindowValid,
  todayISO, horizonEndISO, formatDateLabel,
  DAYPARTS, defaultPhasesFor, daypartPhase, weddingPhases, newPhaseId,
  PLANB_METRICS, PLANB_VENUES, planBMetricDef, defaultPlanB,
  type EventActivity, type TimeWindow, type EventQuery, type Daypart, type EventPhase, type PresetTuning,
  type PlanBConfig, type PlanBMetric,
} from './eventModel';
import { activityFactorPriorities, defaultTuningFor, candidateDays } from './eventScoring';
import { encodeEventState, decodeEventState, hasEventHash } from './eventState';
import {
  DeckActivityIcon,
  IconDeckMap, IconDeckRadar, IconDeckEvent, IconDeckTour, IconDeckGear,
  IconDeckSearch, IconDeckPin, IconDeckArrowRight, IconDeckChevLeft, IconDeckPlus,
  IconDeckCalendar, IconRing, IconSliders, IconReset,
} from './eventIcons';
import EventResult from './EventResult';
import { NotificationProvider } from '../notifications/useNotifications';
import { useIsMobile } from '../mobile/useIsMobile';
import '../mobile/safeArea.css';
import './eventDeck.css';

interface Props { onBack: () => void; }

const STEP_META: Array<{ eyebrow: string; title: string; sub: string; optional?: boolean }> = [
  { eyebrow: 'Schritt 1 von 3 · Ort & Anlass', title: 'Welcher Tag passt am besten?', sub: 'Sag uns zuerst, wo dein Event stattfindet und um welchen Anlass es geht — danach Zeitfenster & Plan B.' },
  { eyebrow: 'Schritt 2 von 3 · Zeitfenster & Phasen', title: 'Wann hast du Zeit?', sub: 'Wähle Zeitraum oder konkrete Termine und lege Phasen wie Trauung & Empfang mit eigenen Zeiten an — jede wird einzeln bewertet.' },
  { eyebrow: 'Schritt 3 von 3 · Plan B', title: 'Falls es doch nicht hält', sub: 'Lege eine klare Schwelle fest, ab der dir ein Plan B (z. B. Zelt oder Innenraum) empfohlen wird — plus Ausweichtag und -ort, falls dein Wunschtermin nicht hält.', optional: true },
];

export default function EventPage({ onBack }: Props) {
  return (
    <NotificationProvider>
      <EventPageInner onBack={onBack} />
    </NotificationProvider>
  );
}

function EventPageInner({ onBack }: Props) {
  const isMobile = useIsMobile();
  const [activity, setActivity] = useState<EventActivity | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [windowSel, setWindowSel] = useState<TimeWindow>({ mode: 'range', from: todayISO(), to: horizonEndISO() });
  const [phases, setPhases] = useState<EventPhase[]>(defaultPhasesFor(''));
  const [tuning, setTuning] = useState<PresetTuning>(defaultTuningFor(''));
  // Standard-Metrik „Score" wie in der Vorlage (Schritt 3 zeigt die Score-Schwelle
  // mit kritisch/okay/gut). Bleibt deaktiviert — ehrlicher Ausgangszustand.
  const [planB, setPlanB] = useState<PlanBConfig>(() => ({ ...defaultPlanB(), metric: 'score', threshold: planBMetricDef('score').default }));
  const [submitted, setSubmitted] = useState<EventQuery | null>(null);
  const [step, setStep] = useState(0);
  const restoredRef = useRef(false);

  // Permalink beim Öffnen wiederherstellen (#ev=…) → direkt ins Resultat.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (typeof window === 'undefined') return;
    const q = decodeEventState(window.location.hash);
    if (!q) return;
    setActivity(q.activity); setLocation(q.location); setWindowSel(q.window);
    setPhases(q.phases); setTuning(q.tuning); setPlanB(q.planB); setSubmitted(q);
  }, []);

  // Resultat ⇄ Hash spiegeln (teilbarer Link); beim Bearbeiten Hash räumen.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (submitted) {
      window.history.replaceState(null, '', encodeEventState(submitted));
    } else if (hasEventHash(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [submitted]);

  const handleActivity = (a: EventActivity | null) => {
    setActivity(a);
    if (a) { setPhases(defaultPhasesFor(a.id)); setTuning(defaultTuningFor(a.id)); }
  };

  const partial: Partial<EventQuery> = {
    activity: activity ?? undefined, location: location ?? undefined,
    window: windowSel, phases, tuning, planB,
  };
  const complete = isQueryComplete(partial);
  const phasesValid = phases.every((p) => p.hours[0] !== p.hours[1]);
  const stepValid = [!!activity && !!location, isWindowValid(windowSel) && phasesValid, true];

  const submit = () => { if (complete) setSubmitted(partial as EventQuery); };
  const next = () => { if (step < 2) { if (stepValid[step]) setStep(step + 1); } else submit(); };
  const back = () => { if (step > 0) setStep(step - 1); };

  if (submitted) {
    return <EventResult query={submitted} onEdit={() => setSubmitted(null)} onBack={onBack} />;
  }

  const meta = STEP_META[step];
  const canProceed = stepValid[step];

  // Geteilte Schritt-Inhalte (Felder branchen intern auf isMobile für das Raster).
  const stepBody = (
    <>
      {step === 0 && (
        <div className={isMobile ? undefined : 'evd-grid-2'}>
          <div>
            <span className={isMobile ? 'evd-m-section-lab' : 'evd-field-label'}>Ort</span>
            <LocationField value={location} onChange={setLocation} />
          </div>
          <div>
            <span className={isMobile ? 'evd-m-section-lab' : 'evd-field-label'}>Anlass</span>
            <ActivityGrid value={activity} onChange={handleActivity} isMobile={isMobile} />
          </div>
          {activity && <TuningPanel activity={activity} tuning={tuning} onChange={setTuning} />}
        </div>
      )}
      {step === 1 && (
        <div className={isMobile ? undefined : 'evd-grid-2 evd-grid-2--time'}>
          <div>
            <span className={isMobile ? 'evd-m-section-lab' : 'evd-field-label'}>Zeitraum</span>
            <TimeFields value={windowSel} onChange={setWindowSel} />
          </div>
          <div>
            <span className={isMobile ? 'evd-m-section-lab' : 'evd-field-label'}>Phasen · Vorlage</span>
            <PhaseFields value={phases} onChange={setPhases} />
          </div>
        </div>
      )}
      {step === 2 && (
        <div>
          {isMobile && <p className="evd-sub" style={{ marginTop: 0 }}>{meta.sub}</p>}
          <PlanBFields value={planB} window={windowSel} onChange={setPlanB} />
        </div>
      )}
    </>
  );

  const primaryLabel = step < 2 ? 'Weiter' : 'Beste Tage finden';
  const leftLabel = step === 0 ? 'Überspringen' : 'Zurück';
  const onLeft = step === 0 ? submit : back;
  const leftDisabled = step === 0 && !complete;

  // ------- Mobile -------
  if (isMobile) {
    return (
      <div className="evd-m-root">
        <div className="evd-m-header">
          <button className="evd-m-back" onClick={step > 0 ? back : onBack} aria-label="Zurück"><IconDeckChevLeft /></button>
          <div className="evd-m-htext">
            <div className="evd-m-eyebrow">{meta.eyebrow}{meta.optional ? <span style={{ color: 'var(--stone-400)' }}> · Optional</span> : null}</div>
            <div className="evd-m-title">{meta.title}</div>
          </div>
        </div>
        <div className="evd-m-progress">
          {[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'on' : undefined} />)}
        </div>
        <div className="evd-m-scroll">{stepBody}</div>
        <div className="evd-m-footer">
          <button className="evd-btn-ghost" onClick={onLeft} disabled={leftDisabled}>{leftLabel}</button>
          <button className="evd-btn-primary" onClick={next} disabled={!canProceed}>
            {primaryLabel} <IconDeckArrowRight />
          </button>
        </div>
      </div>
    );
  }

  // ------- Desktop / Tablet -------
  return (
    <div className="evd-root">
      <div className="evd-topbar">
        <div className="evd-brandwrap">
          <img src="/buscosun-mark.svg" width={26} height={26} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <button className="evd-brand" onClick={onBack}>buscosun</button>
        </div>
        <div className="evd-topright">
          <div className="evd-live"><span className="evd-live-dot" /><span className="evd-live-txt">DATEN LIVE</span></div>
        </div>
      </div>
      <div className="evd-body">
        <nav className="evd-rail" aria-label="Werkzeuge">
          <button className="evd-rail-btn" title="Wetterkarte" onClick={onBack}><IconDeckMap /></button>
          <button className="evd-rail-btn" title="Regenradar" onClick={onBack}><IconDeckRadar /></button>
          <button className="evd-rail-btn evd-rail-btn--active" title="Event-Planung" aria-current="page"><IconDeckEvent /></button>
          <button className="evd-rail-btn" title="Tourenplanung" onClick={onBack}><IconDeckTour /></button>
          <span className="evd-rail-spacer" />
          <button className="evd-rail-btn" title="Einstellungen" onClick={onBack}><IconDeckGear /></button>
        </nav>
        <div className="evd-wiz evd-scroll">
          <div className={step === 2 ? 'evd-wiz-inner evd-wiz-inner--narrow' : 'evd-wiz-inner'}>
            <div className="evd-eyebrow">{meta.eyebrow}{meta.optional ? <span className="evd-eyebrow-mut"> · Optional</span> : null}</div>
            <h2 className="evd-h2">{meta.title}</h2>
            <p className="evd-sub">{meta.sub}</p>
            <div className="evd-progress">
              {[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'on' : undefined} />)}
            </div>
            {stepBody}
          </div>
        </div>
      </div>
      <div className="evd-footer">
        <button className="evd-btn-ghost" onClick={onLeft} disabled={leftDisabled}>{leftLabel}</button>
        <button className="evd-btn-primary" onClick={next} disabled={!canProceed}>
          {primaryLabel} <IconDeckArrowRight />
        </button>
      </div>
    </div>
  );
}

/* ============================ Ort ============================ */
function LocationField({ value, onChange }: { value: Location | null; onChange: (l: Location | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError('');
    try {
      const found = await geocodeDACH(q, ac.signal);
      if (ac.signal.aborted) return;
      if (found.length === 0) { setError('Kein Ort gefunden.'); setResults([]); }
      else if (found.length === 1) { onChange(found[0]); setResults([]); setQuery(''); }
      else setResults(found);
    } catch {
      if (!ac.signal.aborted) setError('Suche fehlgeschlagen.');
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void runSearch(); }
    else if (e.key === 'Escape') { setQuery(''); setResults([]); setError(''); }
  };

  if (value) {
    const elev = (value as Location & { elevation?: number }).elevation;
    return (
      <>
        <div className="evd-ort">
          <IconDeckSearch />
          <span className="evd-ort-name">{flagForCountry(value.country)} {value.name}</span>
          <button className="evd-link" onClick={() => { onChange(null); setResults([]); setQuery(''); }}>Ändern</button>
        </div>
        <div className="evd-ort-note"><IconDeckPin />Standort erkannt · höhenkorrigiert{typeof elev === 'number' ? ` (${Math.round(elev)} m)` : ''}</div>
      </>
    );
  }
  return (
    <>
      <div className="evd-ort">
        <IconDeckSearch />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
          placeholder="Ort suchen (DE · AT · CH)…" aria-label="Ort suchen" autoComplete="off"
        />
        <button className="evd-link" onClick={() => void runSearch()}>{loading ? '…' : 'Suchen'}</button>
      </div>
      {error && <div className="evd-ort-err">{error}</div>}
      {results.length > 0 && (
        <div className="evd-ort-results">
          {results.map((r, i) => (
            <button key={`${r.lat}-${r.lon}-${i}`} className="evd-ort-result" onClick={() => { onChange(r); setResults([]); setQuery(''); }}>
              {flagForCountry(r.country)} {r.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ============================ Anlass ============================ */
function ActivityGrid({ value, onChange, isMobile }: { value: EventActivity | null; onChange: (a: EventActivity | null) => void; isMobile: boolean }) {
  const [customText, setCustomText] = useState(value?.id === 'custom' ? value.label : '');
  const gridClass = isMobile ? 'evd-m-anlass-grid' : 'evd-anlass-grid';
  const tileClass = (active: boolean) => isMobile
    ? `evd-m-anlass${active ? ' evd-m-anlass--active' : ''}`
    : `evd-anlass${active ? ' evd-anlass--active' : ''}`;
  const commit = () => { const t = customText.trim(); if (t) onChange(customActivity(t)); };
  return (
    <div className={gridClass}>
      {EVENT_ACTIVITIES.map((a) => {
        const active = value?.id === a.id;
        return (
          <button key={a.id} className={tileClass(active)} onClick={() => onChange(a)} aria-pressed={active}>
            <span className={`evd-anlass-ico${active ? '' : ''}`}><DeckActivityIcon id={a.id} size={isMobile ? 19 : 18} /></span>
            <div>
              <div className="evd-anlass-name">{a.label}</div>
              <div className="evd-anlass-tag">{a.tag}</div>
            </div>
          </button>
        );
      })}
      <div className="evd-anlass-custom">
        <input
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          placeholder="Eigener Anlass …" aria-label="Eigener Anlass"
        />
      </div>
    </div>
  );
}

/* ============================ Feinjustierung (Tuning) ============================ */
const TUNE_FACTORS: Array<{ key: keyof PresetTuning['weights']; label: string }> = [
  { key: 'precip', label: 'Trockenheit' }, { key: 'temp', label: 'Temperatur' },
  { key: 'wind', label: 'wenig Wind' }, { key: 'cloud', label: 'Licht / Wolken' },
];
function TuningPanel({ activity, tuning, onChange }: { activity: EventActivity; tuning: PresetTuning; onChange: (t: PresetTuning) => void }) {
  const def = defaultTuningFor(activity.id);
  const changed = JSON.stringify(def) !== JSON.stringify(tuning);
  const priorities = activityFactorPriorities(activity.id, tuning);
  const setWeight = (k: keyof PresetTuning['weights'], v: number) => onChange({ ...tuning, weights: { ...tuning.weights, [k]: v } });
  const setTemp = (idx: 0 | 1, v: number) => {
    const t: [number, number] = [tuning.idealTemp[0], tuning.idealTemp[1]];
    t[idx] = v; onChange({ ...tuning, idealTemp: t });
  };
  return (
    <details className="evd-tune">
      <summary><IconSliders size={15} />Faktoren feinjustieren{changed ? ' · angepasst' : ''}</summary>
      <div className="evd-tune-body">
        {TUNE_FACTORS.map((f) => (
          <div className="evd-tune-row" key={f.key}>
            <label>{f.label}<span>{Math.round((tuning.weights[f.key] ?? 0) * 100)}%</span></label>
            <input type="range" min={0} max={1} step={0.05} value={tuning.weights[f.key]} onChange={(e) => setWeight(f.key, parseFloat(e.target.value))} />
          </div>
        ))}
        <div className="evd-tune-row">
          <label>Wohlfühl-Temperatur</label>
          <div className="evd-tune-temp">
            <input type="number" value={tuning.idealTemp[0]} onChange={(e) => setTemp(0, parseInt(e.target.value) || 0)} aria-label="Temperatur von" />
            <span className="evd-hourdash">–</span>
            <input type="number" value={tuning.idealTemp[1]} onChange={(e) => setTemp(1, parseInt(e.target.value) || 0)} aria-label="Temperatur bis" />
            <span className="evd-houruhr">°C</span>
          </div>
        </div>
        <div className="evd-tune-row" style={{ alignSelf: 'end' }}>
          <span className="evd-anlass-tag">{priorities.map((p) => p.label).join(' · ')}</span>
        </div>
      </div>
      {changed && <button className="evd-tune-reset" onClick={() => onChange(def)}><IconReset size={13} />Auf Anlass-Vorgabe zurücksetzen</button>}
    </details>
  );
}

/* ============================ Zeitfenster ============================ */
const clampHr = (n: number) => Math.max(0, Math.min(24, Math.round(n)));
function TimeFields({ value, onChange }: { value: TimeWindow; onChange: (w: TimeWindow) => void }) {
  const min = todayISO(); const max = horizonEndISO();
  const setMode = (mode: 'range' | 'dates') => {
    if (mode === value.mode) return;
    onChange(mode === 'range' ? { mode: 'range', from: min, to: max } : { mode: 'dates', dates: [] });
  };
  return (
    <>
      <div className="evd-seg">
        <button className={`evd-seg-btn${value.mode === 'range' ? ' evd-seg-btn--active' : ''}`} onClick={() => setMode('range')}>Zeitraum</button>
        <button className={`evd-seg-btn${value.mode === 'dates' ? ' evd-seg-btn--active' : ''}`} onClick={() => setMode('dates')}>Einzeltermine</button>
      </div>
      {value.mode === 'range' ? (
        <>
          <div className="evd-daterow">
            <label className="evd-datecard">
              <div className="evd-datecard-lab">Von</div>
              <div className="evd-datecard-val">{shortDate(value.from)}</div>
              <input type="date" value={value.from} min={min} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} />
            </label>
            <label className="evd-datecard">
              <div className="evd-datecard-lab">Bis</div>
              <div className="evd-datecard-val">{shortDate(value.to)}</div>
              <input type="date" value={value.to} min={value.from} max={max} onChange={(e) => onChange({ ...value, to: e.target.value })} />
            </label>
          </div>
          <div className="evd-note">Bis zu 7 Tage werden verglichen · DE bis ~7 Tage, AT/CH bis ~2,5 Tage</div>
        </>
      ) : (
        <>
          <div className="evd-datechips">
            {value.dates.map((d) => (
              <span key={d} className="evd-datechip">{shortDate(d)}<button onClick={() => onChange({ mode: 'dates', dates: value.dates.filter((x) => x !== d) })} aria-label="Termin entfernen">×</button></span>
            ))}
            <label className="evd-datechip-add">
              <IconDeckPlus size={13} /> Termin
              <input type="date" min={min} max={max} onChange={(e) => {
                const d = e.target.value;
                if (d && d >= min && d <= max && !value.dates.includes(d)) onChange({ mode: 'dates', dates: [...value.dates, d].sort() });
              }} />
            </label>
          </div>
          <div className="evd-note">Konkrete Termine werden einzeln bewertet.</div>
        </>
      )}
    </>
  );
}

/* ============================ Phasen ============================ */
function PhaseFields({ value, onChange }: { value: EventPhase[]; onChange: (p: EventPhase[]) => void }) {
  const setPreset = (id: Daypart) => onChange([daypartPhase(id)]);
  const addPhase = () => onChange([...value, { id: newPhaseId(), label: `Phase ${value.length + 1}`, hours: [14, 18] }]);
  const update = (id: string, patch: Partial<EventPhase>) => onChange(value.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: string) => onChange(value.filter((p) => p.id !== id));
  const activePreset = value.length === 1 ? DAYPARTS.find((d) => d.hours[0] === value[0].hours[0] && d.hours[1] === value[0].hours[1] && d.label === value[0].label)?.id : undefined;
  const isWedding = value.length === 3;
  return (
    <>
      <div className="evd-chips">
        {DAYPARTS.map((d) => (
          <button key={d.id} className={`evd-chip${activePreset === d.id ? ' evd-chip--active' : ''}`} onClick={() => setPreset(d.id)}>{d.label}</button>
        ))}
        <button className={`evd-chip${isWedding ? ' evd-chip--active' : ' evd-chip--special'}`} onClick={() => onChange(weddingPhases())}>
          <IconRing size={14} />Hochzeit (3 Phasen)
        </button>
      </div>
      {value.map((p) => (
        <div className="evd-phasecard" key={p.id}>
          <div className="evd-phasecard-head">
            <input className="evd-phasecard-title" value={p.label} onChange={(e) => update(p.id, { label: e.target.value })} aria-label="Phasenname" />
            {value.length > 1 && <button className="evd-phasecard-rm" onClick={() => remove(p.id)}>Entfernen</button>}
          </div>
          <div className="evd-phasecard-rule" />
          <div className="evd-hourrow">
            <span className="evd-hourbox"><input type="number" min={0} max={24} value={p.hours[0]} onChange={(e) => update(p.id, { hours: [clampHr(parseInt(e.target.value) || 0), p.hours[1]] })} aria-label="Startstunde" /></span>
            <span className="evd-hourdash">–</span>
            <span className="evd-hourbox"><input type="number" min={0} max={24} value={p.hours[1]} onChange={(e) => update(p.id, { hours: [p.hours[0], clampHr(parseInt(e.target.value) || 0)] })} aria-label="Endstunde" /></span>
            <span className="evd-houruhr">Uhr</span>
          </div>
        </div>
      ))}
      <button className="evd-addphase" onClick={addPhase}><IconDeckPlus size={15} />Phase hinzufügen</button>
    </>
  );
}

/* ============================ Plan B ============================ */
function PlanBFields({ value, window: win, onChange }: { value: PlanBConfig; window: TimeWindow; onChange: (p: PlanBConfig) => void }) {
  const mdef = planBMetricDef(value.metric);
  const days = candidateDays(win);
  const pct = Math.round(((value.threshold - mdef.min) / (mdef.max - mdef.min)) * 100);
  const valueText = value.metric === 'score'
    ? `Score < ${value.threshold}`
    : `${mdef.direction === 'above' ? '>' : '<'} ${value.threshold} ${mdef.unit}`;
  const sliderLabels = value.metric === 'score'
    ? ['kritisch (30)', 'okay (55)', 'gut (80)']
    : [`${mdef.min} ${mdef.unit}`, `${Math.round((mdef.min + mdef.max) / 2)} ${mdef.unit}`, `${mdef.max} ${mdef.unit}`];
  return (
    <>
      <div className={`evd-toggle-row${value.enabled ? '' : ' evd-toggle-row--off'}`} onClick={() => onChange({ ...value, enabled: !value.enabled })} role="switch" aria-checked={value.enabled} tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange({ ...value, enabled: !value.enabled }); } }}>
        <span className="evd-toggle-label">Plan-B-Schwelle aktivieren</span>
        <span className={`evd-switch${value.enabled ? ' evd-switch--on' : ''}`} />
      </div>

      <div className="evd-metric-seg" role="group" aria-label="Schwelle bezieht sich auf">
        {PLANB_METRICS.map((m) => (
          <button key={m.id} className={`evd-metric-chip${value.metric === m.id ? ' evd-metric-chip--active' : ''}`}
            onClick={() => onChange({ ...value, metric: m.id as PlanBMetric, threshold: planBMetricDef(m.id).default })}>
            {m.id === 'score' ? 'Score' : m.id === 'rain' ? 'Regen' : 'Wind'}
          </button>
        ))}
      </div>

      <div className="evd-schwelle">
        <div className="evd-schwelle-head">
          <span className="evd-schwelle-lab">Schwelle</span>
          <span className="evd-schwelle-val">{valueText}</span>
        </div>
        <div className="evd-slider">
          <input type="range" min={mdef.min} max={mdef.max} step={mdef.step} value={value.threshold}
            onChange={(e) => onChange({ ...value, threshold: parseFloat(e.target.value) })}
            aria-label="Schwelle"
            style={{ background: `linear-gradient(to right, var(--terracotta-500) ${pct}%, var(--sand-200) ${pct}%)` }} />
        </div>
        <div className="evd-slider-labels"><span>{sliderLabels[0]}</span><span>{sliderLabels[1]}</span><span>{sliderLabels[2]}</span></div>
      </div>

      <div className="evd-planb-cards">
        <label className="evd-planb-card">
          <div className="evd-planb-card-head"><IconDeckCalendar size={15} /><span className="evd-planb-card-lab">Wunschtermin</span></div>
          <div className="evd-planb-card-val">{value.wishDate ? shortDate(value.wishDate) : 'Bester Tag'}</div>
          <select value={value.wishDate ?? ''} onChange={(e) => onChange({ ...value, wishDate: e.target.value || null })} aria-label="Wunschtermin">
            <option value="">Bester Tag</option>
            {days.map((d) => <option key={d} value={d}>{formatDateLabel(d)}</option>)}
          </select>
        </label>
        <label className="evd-planb-card">
          <div className="evd-planb-card-head"><IconDeckPin size={15} /><span className="evd-planb-card-lab">Ausweichort</span></div>
          <div className="evd-planb-card-val">{PLANB_VENUES.find((v) => v.id === value.venue)?.label ?? '—'}</div>
          <select value={value.venue} onChange={(e) => onChange({ ...value, venue: e.target.value as PlanBConfig['venue'] })} aria-label="Ausweichort">
            {PLANB_VENUES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
      </div>

      <div className="evd-hint"><b>Hinweis:</b> Ausweichtag & -ort nutzen dieselben nativen Behörden-Quellen (DWD · GeoSphere · MeteoSwiss) — kein Konto, keine Tracker.</div>
    </>
  );
}

/* ============================ Helpers ============================ */
function shortDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
}
