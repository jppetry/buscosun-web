/**
 * Feature „Wetterhistorie / Klima-Rückblick" — Hauptseite.
 *
 * Onboarding/Leerzustand mit Fragen-Einstieg (E2/E15), Ortssuche + Favoriten
 * (E1), Steuerung Variable/Auflösung/Zeitraum/Referenz (E3/E4/E5), Diagramm-
 * Galerie (E6) mit Klartext (E6.8) und Herkunftshinweisen (E13). Daten: ERA5 via
 * Open-Meteo Archive (Reanalyse, gekennzeichnet).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { geocodeDACH, flagForCountry } from '../geocode';
import { defaultHistorySource } from './historySource';
import type { DailyRecord } from './historyModel';
import {
  VARIABLES, variableMeta, KENNTAGE, kenntagDef, NORMAL_PERIODS, yearSpan,
  aggregate, yearly, anomalies, linearTrend, normalValue, countKenntageByYear, records,
  dayClimatology, daySeries, calendarYear, monthlyDistribution, tempBandShares, windRose,
} from './historyModel';
import {
  DEFAULT_SETTINGS, resolveYearRange,
  encodeState, decodeState, isFavorite, toggleFavorite, pushRecent,
  type HistorySettings, type HistoryLocation, type ChartType,
} from './historyState';
import { summarizeTrend, summarizeKenntage, summarizeSeries } from './historySummary';
import { divergingLegend, anomalySpan } from './historyColors';
import Stripes from './charts/Stripes';
import AnomalyBars from './charts/AnomalyBars';
import KenntageBars from './charts/KenntageBars';
import DayBand from './charts/DayBand';
import LineChart from './charts/LineChart';
import TimeRangeSlider from './charts/TimeRangeSlider';
import CalendarHeatmap from './charts/CalendarHeatmap';
import YearOverlay from './charts/YearOverlay';
import TempBands from './charts/TempBands';
import BoxPlot from './charts/BoxPlot';
import Windrose from './charts/Windrose';
import { RecordsPanel, DateLookup, DayDetail } from './HistoryExtras';
import HistoryPro from './HistoryPro';
import ExploreView from './ExploreView';
import type { HistoryMode, ExploreGranularity } from './historyState';
import '../intro/intro.css';
import './history.css';

interface Props { onBack: () => void }

/** Möglichkeiten-Stichpunkte des Idle-Kopfs (Aufbau wie das Regenradar). */
const HIST_INTRO_CAPS = [
  'Klimastreifen: jedes Jahr ein Streifen — wärmer oder kälter',
  'Abweichungen, Kenntage & Langzeit-Trend über die Jahrzehnte',
  'Einzelnen Tag, Monat oder ganzes Jahr nachschlagen',
  'Echte Archivdaten (ERA5) — viele Jahrzehnte zurück',
];

/* Kleine Line-Icons (currentColor) für Stichpunkte + „So geht's" — wie im Regenradar. */
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

const CHART_LABELS: { id: ChartType; label: string }[] = [
  { id: 'stripes', label: 'Streifen' },
  { id: 'anomaly', label: 'Anomalie' },
  { id: 'dayband', label: 'Tagesband' },
  { id: 'calendar', label: 'Kalender' },
  { id: 'overlay', label: 'Jahres-Overlay' },
  { id: 'bands', label: 'Temp.-Bänder' },
  { id: 'box', label: 'Box-Plot' },
  { id: 'windrose', label: 'Windrose' },
  { id: 'kenntage', label: 'Kenntage' },
  { id: 'records', label: 'Rekorde' },
  { id: 'dateLookup', label: 'Wetter an Datum' },
  { id: 'line', label: 'Verlauf' },
];

export default function HistoryPage({ onBack }: Props) {
  const [loc, setLoc] = useState<HistoryLocation | null>(null);
  const [settings, setSettings] = useState<HistorySettings>(DEFAULT_SETTINGS);
  const [days, setDays] = useState<DailyRecord[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [favTick, setFavTick] = useState(0);
  const [drillDate, setDrillDate] = useState<string | null>(null);
  // Nach der Ortswahl wählt der Nutzer erst einen Modus (Veränderung/Rückblick);
  // erst danach erscheinen die dafür entscheidenden Funktionen. Beim Teilen-Link
  // ist der Modus bereits enthalten → Auswahl überspringen.
  const [modePicked, setModePicked] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  const [dark, setDark] = useState<boolean>(() => { try { return localStorage.getItem('buscosun.history.dark.v1') === '1'; } catch { return false; } });
  const chartsRef = useRef<HTMLDivElement | null>(null);
  const acRef = useRef<AbortController | null>(null);

  function toggleDark() { setDark((d) => { const n = !d; try { localStorage.setItem('buscosun.history.dark.v1', n ? '1' : '0'); } catch { /* ignore */ } return n; }); }

  const patch = (p: Partial<HistorySettings>) => setSettings((s) => ({ ...s, ...p }));

  /** Permalink-Hash leeren — damit ein erneutes Öffnen nicht stillschweigend
   *  einen alten Ort/Modus restauriert und das Modus-Gate überspringt. */
  const clearHash = () => {
    if (typeof window === 'undefined') return;
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };
  const handleBack = () => { clearHash(); onBack(); };
  const changeLocation = () => { clearHash(); setModePicked(false); setLoc(null); };

  // Permalink beim Start lesen (US-10.3).
  useEffect(() => {
    const dec = typeof window !== 'undefined' ? decodeState(window.location.hash) : null;
    if (dec?.loc) { setLoc(dec.loc); setSettings(dec.settings); setModePicked(true); }
  }, []);

  // Daten holen: gesamte verfügbare Spanne EINMAL je Ort (Auflösung/Zeitraum lokal).
  useEffect(() => {
    if (!loc) { setStatus('idle'); setDays(null); return; }
    acRef.current?.abort();
    const ac = new AbortController(); acRef.current = ac;
    setStatus('loading'); setDays(null); setErrMsg('');
    pushRecent(loc);
    defaultHistorySource.fetchDailyRange(loc.lat, loc.lon, defaultHistorySource.minYear, new Date().getFullYear(), ac.signal)
      .then((d) => { if (ac.signal.aborted) return; setDays(d); setStatus('ready'); })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        setErrMsg(/429/.test(String(e?.message)) ? 'Datenquelle gerade ausgelastet — bitte in einer Minute erneut versuchen.' : 'Archivdaten für diesen Ort nicht verfügbar.');
        setStatus('error');
      });
    return () => ac.abort();
  }, [loc]);

  // Permalink aktuell halten.
  // Embed-Modus (US-10.4): #h=…&embed=1 → schlanke, eingebettete Ansicht.
  const embed = useMemo(() => typeof window !== 'undefined' && /(?:^|[#&])embed=1/.test(window.location.hash), []);

  useEffect(() => {
    if (embed) return; // im Embed den Hash (inkl. embed=1) nicht überschreiben
    // Erst persistieren, wenn ein Modus gewählt wurde — sonst würde ein Reload
    // den Ort restaurieren und das Modus-Gate überspringen.
    if (loc && modePicked && typeof window !== 'undefined') {
      const enc = encodeState(loc, settings);
      window.history.replaceState(null, '', `#h=${enc}`);
    }
  }, [loc, settings, embed, modePicked]);

  const available = useMemo(() => (days ? yearSpan(days) : null), [days]);
  const range = useMemo(() => resolveYearRange(settings, available), [settings, available]);
  const workDays = useMemo(() => {
    if (!days) return [];
    return days.filter((d) => d.year >= range.start && d.year <= range.end && (!settings.months.length || settings.months.includes(d.month)));
  }, [days, range, settings.months]);

  const meta = variableMeta(settings.variable);
  const exportBuckets = useMemo(() => aggregate(workDays, settings.variable, settings.resolution), [workDays, settings.variable, settings.resolution]);
  const normalPeriod = NORMAL_PERIODS.find((p) => p.id === settings.normalPeriodId) ?? NORMAL_PERIODS[0];
  const normal = useMemo(() => (days ? normalValue(yearly(days, settings.variable), normalPeriod) : null), [days, settings.variable, normalPeriod]);

  function applyLocation(l: HistoryLocation) { setLoc(l); setModePicked(false); }

  // Echte Kennzahlen für die Modus-Kacheln (keine Platzhalter): Langzeit-Trend
  // des Jahresmittels + heißester je gemessener Tag.
  const tmeanYearly = useMemo(() => (days ? yearly(days, 'tmean') : []), [days]);
  const warmingTrend = useMemo(() => linearTrend(tmeanYearly), [tmeanYearly]);
  const warmingDelta = warmingTrend ? warmingTrend.lastT - warmingTrend.firstT : null;
  const recordSet = useMemo(() => (days ? records(days) : null), [days]);

  return (
    <div className={`rt-page hi-page${embed ? ' hi-embed' : ''}`} data-theme={dark ? 'dark' : undefined}>
      <div className="rt-grain" />
      {!embed && <nav className="rt-nav">
        <a className="rt-nav-logo" href="#" onClick={(e) => { e.preventDefault(); handleBack(); }}>
          <span className="rt-nav-logo-mark" /><span className="rt-nav-logo-name">buscosun</span>
        </a>
        <div className="rt-nav-right">
          <button type="button" className="hi-theme-btn" onClick={toggleDark} aria-label={dark ? 'Heller Modus' : 'Dunkler Modus'} title="Hell/Dunkel">{dark ? '☀' : '☾'}</button>
          <span className="rt-nav-live hi-live">{available ? `${available.min}–${available.max}` : 'Klima-Rückblick'}</span>
          <span className="rt-nav-avatar">JK</span>
        </div>
      </nav>}

      <main className="rt-container">
        {!loc ? (
          <Onboarding onPick={applyLocation} />
        ) : (
          <>
            {!embed && <HistoryHeader loc={loc} available={available} onChange={changeLocation}
              fav={isFavorite(loc)} onFav={() => { toggleFavorite(loc); setFavTick((n) => n + 1); }} favTick={favTick}
              proOpen={proOpen} onPro={() => setProOpen((o) => !o)} />}
            {embed && <div className="hi-embed-head"><strong>{loc.name}</strong><span>{meta.label}{available ? ` · ${available.min}–${available.max}` : ''}</span></div>}

            {status === 'loading' && <div className="rt-card hi-state"><span className="ev-spinner" /> <p>Stationsdaten werden geladen … (bis zu {new Date().getFullYear() - defaultHistorySource.minYear} Jahre)</p></div>}
            {status === 'error' && <div className="rt-card hi-state"><p>⚠ {errMsg}</p><button type="button" className="hi-btn" onClick={() => setLoc({ ...loc })}>Erneut versuchen</button></div>}

            {status === 'ready' && days && !embed && !modePicked && (
              <ModeChoice loc={loc} available={available} warmingDelta={warmingDelta} hottest={recordSet?.warmestDay ?? null}
                onPick={(mode, gran) => { patch(gran ? { mode, exploreGran: gran } : { mode }); setModePicked(true); }} />
            )}

            {status === 'ready' && days && (embed || modePicked) && (
              <>
                {settings.mode === 'explore' ? (
                  <div ref={chartsRef}>
                    <ExploreView days={days} lat={loc.lat} lon={loc.lon} settings={settings} patch={patch} available={available} normalPeriod={normalPeriod} />
                  </div>
                ) : (
                  <>
                    {!embed && <Controls settings={settings} patch={patch} available={available} />}
                    <div ref={chartsRef}>
                      <ChartArea settings={settings} patch={patch} days={days} workDays={workDays} meta={meta}
                        normal={normal} normalPeriod={normalPeriod} range={range} available={available} onDrillDate={embed ? () => { } : setDrillDate} />
                    </div>
                    {!embed && drillDate && (
                      <DayDetail days={days} lat={loc.lat} lon={loc.lon} dateISO={drillDate}
                        onClose={() => setDrillDate(null)}
                        breadcrumb={[
                          { label: String(drillDate.slice(0, 4)), onClick: () => setDrillDate(null) },
                          { label: new Date(`${drillDate}T12:00`).toLocaleDateString('de-DE', { month: 'long' }), onClick: () => setDrillDate(null) },
                          { label: `${Number(drillDate.slice(8, 10))}. Tag` },
                        ]} />
                    )}
                  </>
                )}
                {embed && <a className="hi-embed-link" href={typeof window !== 'undefined' ? window.location.href.replace(/[#&]embed=1/, '') : '#'} target="_blank" rel="noopener">Auf buscosun ansehen →</a>}
                {!embed && proOpen && settings.mode === 'change' && <HistoryPro loc={loc} days={days} settings={settings} buckets={exportBuckets} range={range} chartsRef={chartsRef} />}
                <Provenance kind={defaultHistorySource.kind} label={defaultHistorySource.label} compact={embed} station={defaultHistorySource.lastStation} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// --- Modus-Wahl: zwei Kacheln nach der Ortswahl ------------------------------

function fmtRecordDate(iso: string): string {
  return new Date(`${iso}T12:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* Line-Art-Vorschau im Intro-/Feature-Kachel-Stil (viewBox 260×140, currentColor,
   eigene sand-100-Fläche). „Rückblick" = Kalender + Stundenverlauf (steel),
   „Veränderung" = Klimastreifen + Erwärmungs-Trend (terracotta). */
function RueckblickArt() {
  return (
    <svg viewBox="0 0 260 140" fill="none" aria-hidden="true" className="hi-mtile-svg"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--steel-600)' }}>
      <rect x="0" y="0" width="260" height="140" rx="12" fill="var(--sand-100)" stroke="none" />
      {/* Kalenderblatt */}
      <rect x="34" y="36" width="96" height="80" rx="9" />
      <line x1="34" y1="57" x2="130" y2="57" />
      <line x1="56" y1="29" x2="56" y2="43" />
      <line x1="108" y1="29" x2="108" y2="43" />
      {/* markierter Tag + weitere Tage */}
      <rect x="50" y="68" width="22" height="19" rx="3" fill="currentColor" stroke="none" />
      <g opacity="0.4">
        <line x1="84" y1="77" x2="116" y2="77" />
        <line x1="50" y1="100" x2="116" y2="100" />
      </g>
      {/* Stundenverlauf rechts (ink) */}
      <path d="M 150 94 Q 180 60 202 80 T 238 56" stroke="var(--ink-900)" />
      <circle cx="238" cy="56" r="4.5" fill="var(--ink-900)" stroke="none" />
    </svg>
  );
}
function VeraenderungArt() {
  const N = 16;
  return (
    <svg viewBox="0 0 260 140" fill="none" aria-hidden="true" className="hi-mtile-svg"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--terracotta-500)' }}>
      <rect x="0" y="0" width="260" height="140" rx="12" fill="var(--sand-100)" stroke="none" />
      <g stroke="none">
        {Array.from({ length: N }, (_, i) => (
          <rect key={i} x={26 + i * 13} y="34" width="11.5" height="72" rx="1.5"
            fill="currentColor" opacity={0.18 + (i / (N - 1)) * 0.72} />
        ))}
      </g>
      <path d="M 30 98 Q 132 90 230 58" stroke="var(--ink-900)" />
      <circle cx="230" cy="58" r="4.5" fill="var(--ink-900)" stroke="none" />
    </svg>
  );
}

/**
 * Erscheint direkt nach der Ortswahl: zwei visuelle Sektionen — „Wie hat sich
 * das Wetter verändert?" (Trend/Streifen, Modus `change`) und „Wie war das
 * Wetter?" (Tag/Monat/Jahr im Detail, Modus `explore`). Erst die Wahl blendet
 * die für den Modus entscheidenden Funktionen ein.
 */
function ModeChoice({ loc, available, warmingDelta, hottest, onPick }: {
  loc: HistoryLocation;
  available: { min: number; max: number } | null;
  warmingDelta: number | null;
  hottest: { value: number; dateISO: string } | null;
  onPick: (m: HistoryMode, gran?: ExploreGranularity) => void;
}) {
  const span = available ? `${available.min}–${available.max}` : null;
  const deltaTxt = warmingDelta != null
    ? `${warmingDelta > 0 ? '+' : ''}${warmingDelta.toLocaleString('de-DE', { maximumFractionDigits: 1 })} °C`
    : null;

  return (
    <section className="hi-modechoice">
      <span className="rt-eyebrow hi-eyebrow">Was möchtest du sehen?</span>
      <p className="hi-mc-lead">
        Zwei Sichten auf die Archivdaten von <strong>{loc.name}</strong>{span ? ` · ${span}` : ''} — wähle eine.
      </p>
      <div className="hi-mtiles">
        {/* SEKTION 1 · Rückblick (LINKS, Modus explore) — Zeitpunkt-Auswahl prominent */}
        <div className="hi-mtile hi-mtile-explore">
          <div className="hi-mtile-art" aria-hidden="true">
            <RueckblickArt />
          </div>
          <div className="hi-mtile-body">
            <span className="hi-mtile-eyebrow">Sektion 1 · Rückblick</span>
            <span className="hi-mtile-title">Wie war das Wetter?</span>
            <span className="hi-mtile-sub">Schlag einen konkreten Zeitpunkt nach — mit Stundenverlauf, Min/Max und Niederschlag.</span>

            <div className="hi-mtile-pick">
              <span className="hi-mtile-pick-label">Zeitpunkt wählen</span>
              <button type="button" className="hi-pick hi-pick-day" onClick={() => onPick('explore', 'day')}>
                <span className="hi-pick-day-ic" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="24" height="21" rx="3" /><line x1="2" y1="11" x2="26" y2="11" /><line x1="8" y1="2" x2="8" y2="7" /><line x1="20" y1="2" x2="20" y2="7" /><rect x="7" y="15" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span className="hi-pick-day-tx"><b>Einzelnen Tag</b><em>Stunde für Stunde nachschlagen</em></span>
                <svg className="hi-pick-day-arr" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="2" y1="8" x2="12" y2="8" /><polyline points="8,4 12,8 8,12" /></svg>
              </button>
              <div className="hi-pick-row">
                <button type="button" className="hi-pick" onClick={() => onPick('explore', 'month')}>Ganzer Monat</button>
                <button type="button" className="hi-pick" onClick={() => onPick('explore', 'year')}>Ganzes Jahr</button>
              </div>
            </div>

            {hottest && (
              <span className="hi-mtile-foothint">
                z. B. heißester Tag seit Messbeginn: <strong>{fmtRecordDate(hottest.dateISO)}</strong> · {Math.round(hottest.value)} °C
              </span>
            )}
          </div>
        </div>

        {/* SEKTION 2 · Veränderung (RECHTS, Modus change) */}
        <button type="button" className="hi-mtile hi-mtile-change" onClick={() => onPick('change')}>
          <div className="hi-mtile-art">
            <VeraenderungArt />
            <span className="hi-mtile-flag">Empfohlen</span>
          </div>
          <div className="hi-mtile-body">
            <span className="hi-mtile-eyebrow">Sektion 2 · Veränderung</span>
            <span className="hi-mtile-title">Wie hat sich das Wetter verändert?</span>
            <span className="hi-mtile-sub">Klimastreifen, Abweichungen, Kenntage und Trends über die Jahrzehnte.</span>
            <span className="hi-mtile-tags"><i>Klimastreifen</i><i>Anomalien</i><i>Kenntage</i><i>Trend</i></span>
            <span className="hi-mtile-foot">
              {deltaTxt
                ? <span className="hi-mtile-stat"><b>{deltaTxt}</b><em>Trend Jahresmittel{span ? ` · ${span}` : ''}</em></span>
                : <span />}
              <span className="hi-mtile-open">Öffnen
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="2" y1="8" x2="12" y2="8" /><polyline points="8,4 12,8 8,12" /></svg>
              </span>
            </span>
          </div>
        </button>
      </div>
    </section>
  );
}

// --- Onboarding / Leerzustand (E15) -----------------------------------------

function Onboarding({ onPick }: { onPick: (l: HistoryLocation) => void }) {
  return (
    <section className="rt-section hi-lead" style={{ ['--intro-accent']: 'var(--hi-warm)' } as CSSProperties}>
      <div className="hi-lead-copy">
        <span className="rt-eyebrow hi-eyebrow">Wetterhistorie · Klima-Rückblick</span>
        <h1 className="hi-lead-title">Wie hat sich das Wetter bei dir verändert?</h1>
        <p className="intro-body">
          Echte Archivdaten für deinen Ort in Deutschland, Österreich oder der Schweiz — danach wählst du, was du sehen willst.
        </p>
        <ul className="intro-caps">
          {HIST_INTRO_CAPS.map((c) => (
            <li key={c}><span className="intro-caps-mark" aria-hidden="true"><IconCheck /></span>{c}</li>
          ))}
        </ul>
        <div className="hi-lead-search">
          <span className="rt-eyebrow hi-eyebrow">Standort</span>
          <LocationSearch onPick={onPick} />
        </div>
        <p className="intro-howto">
          <span className="intro-howto-ic" aria-hidden="true"><IconHowTo /></span>
          <span><strong>So geht’s:</strong> Ort eingeben — danach „Veränderung" (Trends) oder „Rückblick" (Tag/Monat/Jahr) wählen.</span>
        </p>
      </div>
    </section>
  );
}

// --- Ortssuche (E1.1) --------------------------------------------------------

function LocationSearch({ onPick }: { onPick: (l: HistoryLocation) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HistoryLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function search() {
    const q = query.trim(); if (q.length < 2) return;
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    setLoading(true); setError(null); setResults([]);
    try {
      const found = await geocodeDACH(q, ac.signal);
      if (ac.signal.aborted) return;
      const mapped: HistoryLocation[] = found.map((f) => ({ name: f.name, lat: f.lat, lon: f.lon, country: f.country }));
      if (!mapped.length) setError('Keine Ergebnisse in DE / AT / CH.');
      else if (mapped.length === 1) onPick(mapped[0]);
      else setResults(mapped);
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Fehler');
    } finally { setLoading(false); }
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) { if (e.key === 'Enter') { e.preventDefault(); void search(); } }

  return (
    <div className="ev-search-wrap">
      <div className="ev-search">
        <svg className="ev-search-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="8" cy="8" r="6" /><line x1="13" y1="13" x2="17" y2="17" strokeLinecap="round" />
        </svg>
        <input type="text" className="ev-search-input" placeholder="Ort oder PLZ suchen – z. B. Dillenburg oder 35683" value={query}
          onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} disabled={loading} aria-label="Ort suchen" />
        <button type="button" className="ev-search-go" onClick={() => void search()} disabled={loading || query.trim().length < 2}>{loading ? 'Suche …' : 'Suchen'}</button>
      </div>
      {(results.length > 0 || error) && (
        <div className="ev-search-dropdown" role="listbox">
          {error && <div className="ev-search-error">⚠ {error}</div>}
          {results.map((r, i) => (
            <button key={`${r.lat},${r.lon}-${i}`} type="button" className="ev-search-result" onClick={() => onPick(r)}>
              <span className="ev-loc-flag" aria-hidden="true">{flagForCountry(r.country ?? 'DE')}</span>
              <span className="ev-search-result-name">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Header ------------------------------------------------------------------

function HistoryHeader({ loc, available, onChange, fav, onFav, favTick, proOpen, onPro }: { loc: HistoryLocation; available: { min: number; max: number } | null; onChange: () => void; fav: boolean; onFav: () => void; favTick: number; proOpen: boolean; onPro: () => void }) {
  return (
    <header className="rt-intro hi-intro hi-intro-loc" key={favTick}>
      <span className="rt-eyebrow hi-eyebrow">Wetterhistorie · {loc.name} · Punkt</span>
      <div className="hi-head-row">
        <h1>{loc.name}{available && <span className="hi-head-span"> · {available.min}–{available.max}</span>}</h1>
        <div className="hi-head-actions">
          <button type="button" className={`hi-btn hi-fav${fav ? ' is-on' : ''}`} onClick={onFav}>{fav ? '★ Favorit' : '☆ Favorit'}</button>
          <button type="button" className={`hi-btn${proOpen ? ' is-on' : ''}`} onClick={onPro}>Vergleichen / Profi</button>
          <button type="button" className="hi-btn" onClick={onChange}>Ort wechseln</button>
        </div>
      </div>
    </header>
  );
}

// --- Steuerung (E3/E4/E5) ----------------------------------------------------

function Controls({ settings, patch, available }: { settings: HistorySettings; patch: (p: Partial<HistorySettings>) => void; available: { min: number; max: number } | null }) {
  return (
    <div className="hi-controls rt-card">
      <Group label="Variable">
        {VARIABLES.map((v) => <Seg key={v.key} on={settings.variable === v.key} onClick={() => patch({ variable: v.key })}>{v.short}</Seg>)}
      </Group>
      <Group label="Auflösung">
        {(['daily', 'monthly', 'seasonal', 'yearly'] as const).map((r) => (
          <Seg key={r} on={settings.resolution === r} onClick={() => patch({ resolution: r })}>
            {r === 'daily' ? 'Täglich' : r === 'monthly' ? 'Monatl.' : r === 'seasonal' ? 'Saison' : 'Jährl.'}
          </Seg>
        ))}
      </Group>
      <Group label="Zeitraum">
        <Seg on={settings.period === 'last-year'} onClick={() => patch({ period: 'last-year' })}>Letztes Jahr</Seg>
        <Seg on={settings.period === '10y'} onClick={() => patch({ period: '10y' })}>10 Jahre</Seg>
        <Seg on={settings.period === '30y'} onClick={() => patch({ period: '30y' })}>30 Jahre</Seg>
        <Seg on={settings.period === 'all'} onClick={() => patch({ period: 'all' })}>Gesamt</Seg>
        {available && <span className="hi-avail">verfügbar {available.min}–{available.max}</span>}
      </Group>
      <Group label="Referenz">
        {NORMAL_PERIODS.map((p) => <Seg key={p.id} on={settings.normalPeriodId === p.id} onClick={() => patch({ normalPeriodId: p.id })}>{p.label}</Seg>)}
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return <div className="hi-cgroup"><span className="hi-clabel">{label}</span><div className="hi-segs">{children}</div></div>;
}
function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" role="tab" aria-selected={on} className={`hi-seg${on ? ' is-on' : ''}`} onClick={onClick}>{children}</button>;
}

// --- Diagramm-Bereich --------------------------------------------------------

function ChartArea({ settings, patch, days, workDays, meta, normal, normalPeriod, range, available, onDrillDate }: {
  settings: HistorySettings; patch: (p: Partial<HistorySettings>) => void; days: DailyRecord[]; workDays: DailyRecord[];
  meta: ReturnType<typeof variableMeta>; normal: number | null; normalPeriod: { label: string }; range: { start: number; end: number };
  available: { min: number; max: number } | null; onDrillDate: (iso: string) => void;
}) {
  const yr = useMemo(() => yearly(workDays, settings.variable), [workDays, settings.variable]);
  const buckets = useMemo(() => aggregate(workDays, settings.variable, settings.resolution), [workDays, settings.variable, settings.resolution]);
  const anos = useMemo(() => anomalies(yr, normal), [yr, normal]);
  const trend = useMemo(() => (settings.showTrend ? linearTrend(yr) : null), [yr, settings.showTrend]);
  const focusYear = settings.focusYear ?? range.end;
  const clim = useMemo(() => (settings.chart === 'dayband' ? dayClimatology(days, settings.variable) : []), [days, settings.variable, settings.chart]);
  const fSeries = useMemo(() => (settings.chart === 'dayband' ? daySeries(days, focusYear, settings.variable) : []), [days, focusYear, settings.variable, settings.chart]);
  const def = kenntagDef(settings.kenntag);
  const threshold = settings.kenntagThreshold ?? def.threshold;
  const kenn = useMemo(() => (settings.chart === 'kenntage' ? countKenntageByYear(workDays, def, threshold) : []), [workDays, def, threshold, settings.chart]);
  const calCells = useMemo(() => (settings.chart === 'calendar' ? calendarYear(days, focusYear, settings.variable) : []), [days, focusYear, settings.variable, settings.chart]);
  const overlayYears = useMemo(() => { const a: number[] = []; for (let y = Math.max(range.start, range.end - 14); y <= range.end; y++) a.push(y); return a; }, [range]);
  const box = useMemo(() => (settings.chart === 'box' ? monthlyDistribution(workDays, settings.variable) : []), [workDays, settings.variable, settings.chart]);
  const bands = useMemo(() => (settings.chart === 'bands' ? tempBandShares(workDays) : []), [workDays, settings.chart]);
  const rose = useMemo(() => (settings.chart === 'windrose' ? windRose(workDays, settings.months.length ? settings.months : undefined) : []), [workDays, settings.months, settings.chart]);

  const span = anomalySpan(anos.map((a) => a.anomaly));
  const [showTable, setShowTable] = useState(false);

  let summary = '';
  if (settings.chart === 'anomaly') summary = summarizeTrend(yr, normal, trend, meta, normalPeriod.label);
  else if (settings.chart === 'kenntage') summary = summarizeKenntage(kenn, def.label);
  else summary = summarizeSeries(yr, meta);

  return (
    <section className="hi-charts">
      <div className="hi-chart-head">
        <span className="rt-eyebrow hi-eyebrow">{chartTitle(settings.chart, meta.label)}</span>
        <div className="hi-chart-switch" role="tablist" aria-label="Diagrammtyp">
          {CHART_LABELS.map((c) => <Seg key={c.id} on={settings.chart === c.id} onClick={() => patch({ chart: c.id })}>{c.label}</Seg>)}
        </div>
      </div>
      <div className="hi-table-toggle">
        <button type="button" className="hi-howto-btn" aria-expanded={showTable} onClick={() => setShowTable((t) => !t)}>{showTable ? 'Tabelle ausblenden' : 'Als Tabelle (barrierefrei)'}</button>
      </div>
      {showTable && <DataTable buckets={buckets} meta={meta} />}

      {settings.chart === 'stripes' && <>
        <div className="hi-chart-tools">
          <label className="hi-check"><input type="checkbox" checked={settings.showLabels} onChange={(e) => patch({ showLabels: e.target.checked })} /> Beschriftung anzeigen</label>
          <HowTo type="stripes" />
        </div>
        <Stripes buckets={yr} unit={meta.unit} showLabels={settings.showLabels} onPick={(y) => patch({ chart: 'dayband', focusYear: y })} />
        <DivLegend span={span} />
      </>}

      {settings.chart === 'anomaly' && <>
        <div className="hi-chart-tools">
          <label className="hi-check"><input type="checkbox" checked={settings.showTrend} onChange={(e) => patch({ showTrend: e.target.checked })} /> Trendlinie</label>
          <HowTo type="anomaly" />
        </div>
        <AnomalyBars points={anos} unit={meta.unit} trend={trend} normalLabel={normalPeriod.label} onPick={(y) => patch({ chart: 'dayband', focusYear: y })} />
      </>}

      {settings.chart === 'dayband' && <>
        <div className="hi-chart-tools"><YearStepper year={focusYear} range={range} onChange={(y) => patch({ focusYear: y })} /><HowTo type="dayband" /></div>
        <DayBand clim={clim} series={fSeries} unit={meta.unit} year={focusYear} />
      </>}

      {settings.chart === 'kenntage' && <>
        <div className="hi-chart-tools"><KenntagPicker settings={settings} patch={patch} /><HowTo type="kenntage" /></div>
        <KenntageBars data={kenn} label={def.label} threshold={threshold} unitHint="°C" focusYear={settings.focusYear} onPick={(y) => patch({ focusYear: y })} />
      </>}

      {settings.chart === 'line' && <LineChart buckets={buckets} unit={meta.unit} onPick={(y) => patch({ chart: 'dayband', focusYear: y })} />}

      {settings.chart === 'calendar' && <>
        <div className="hi-chart-tools"><YearStepper year={focusYear} range={range} onChange={(y) => patch({ focusYear: y })} /><HowTo type="calendar" /></div>
        <CalendarHeatmap cells={calCells} meta={meta} year={focusYear} onPick={onDrillDate} />
      </>}

      {settings.chart === 'overlay' && <>
        <div className="hi-chart-tools"><YearStepper year={focusYear} range={range} onChange={(y) => patch({ focusYear: y })} /></div>
        <YearOverlay days={days} meta={meta} focusYear={focusYear} years={overlayYears} />
      </>}

      {settings.chart === 'bands' && <TempBands data={bands} />}
      {settings.chart === 'box' && <BoxPlot data={box} unit={meta.unit} />}
      {settings.chart === 'windrose' && <Windrose data={rose} />}
      {settings.chart === 'records' && <RecordsPanel days={days} />}
      {settings.chart === 'dateLookup' && <DateLookup days={days} month={settings.lookupMonth} day={settings.lookupDay} onChange={(m, d) => patch({ lookupMonth: m, lookupDay: d })} />}

      {available && ['stripes', 'anomaly', 'kenntage', 'line'].includes(settings.chart) && (
        <div className="hi-rangewrap">
          <span className="hi-range-label">Zeitraum eingrenzen</span>
          <div className="hi-range-readout">{range.start} – {range.end}<span className="hi-range-readout-sub">{range.end - range.start + 1} Jahre</span></div>
          <TimeRangeSlider min={available.min} max={available.max} start={range.start} end={range.end}
            onChange={(s, e) => patch({ period: 'custom', customStart: s, customEnd: e })} />
        </div>
      )}

      {summary && settings.chart !== 'records' && settings.chart !== 'dateLookup' && <p className="hi-summary">{summary}</p>}
    </section>
  );
}

/** Barrierefreie Datentabelle als Text-Alternative zum Diagramm (E14.2). */
function DataTable({ buckets, meta }: { buckets: ReturnType<typeof aggregate>; meta: ReturnType<typeof variableMeta> }) {
  const rows = buckets.filter((b) => b.value != null);
  if (!rows.length) return null;
  return (
    <div className="hi-datatable" role="region" aria-label="Datentabelle">
      <table>
        <caption className="hi-sr-caption">{meta.label} in {meta.unit} je Periode</caption>
        <thead><tr><th scope="col">Periode</th><th scope="col">{meta.label} ({meta.unit})</th><th scope="col">Tage</th></tr></thead>
        <tbody>
          {rows.map((b) => <tr key={b.key}><th scope="row">{b.label}</th><td>{(b.value as number).toLocaleString('de-DE', { maximumFractionDigits: 1 })}</td><td>{b.n}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function chartTitle(c: ChartType, varLabel: string): string {
  const map: Record<string, string> = { stripes: `Klimastreifen · ${varLabel}`, anomaly: `Abweichung vom Normal · ${varLabel}`, dayband: `Tagesband · ${varLabel}`, kenntage: 'Kenntage pro Jahr', line: `Verlauf · ${varLabel}` };
  return map[c] ?? varLabel;
}

function KenntagPicker({ settings, patch }: { settings: HistorySettings; patch: (p: Partial<HistorySettings>) => void }) {
  const def = kenntagDef(settings.kenntag);
  const threshold = settings.kenntagThreshold ?? def.threshold;
  return (
    <div className="hi-kenn">
      {KENNTAGE.map((k) => <Seg key={k.key} on={settings.kenntag === k.key} onClick={() => patch({ kenntag: k.key, kenntagThreshold: null })}>{k.label}</Seg>)}
      <label className="hi-thr">Schwelle:
        <input type="number" value={threshold} className="hi-thr-in" onChange={(e) => patch({ kenntagThreshold: Number(e.target.value) })} />°C
        {settings.kenntagThreshold != null && <button type="button" className="hi-thr-reset" onClick={() => patch({ kenntagThreshold: null })}>↺</button>}
      </label>
    </div>
  );
}

function YearStepper({ year, range, onChange }: { year: number; range: { start: number; end: number }; onChange: (y: number) => void }) {
  return (
    <div className="hi-ystep">
      <button type="button" className="hi-btn-sm" disabled={year <= range.start} onClick={() => onChange(year - 1)}>‹</button>
      <span className="hi-ystep-y">{year}</span>
      <button type="button" className="hi-btn-sm" disabled={year >= range.end} onClick={() => onChange(year + 1)}>›</button>
    </div>
  );
}

function DivLegend({ span }: { span: number }) {
  const stops = divergingLegend(span, 9);
  const gradient = `linear-gradient(90deg, ${stops.map((s) => s.color).join(', ')})`;
  return (
    <div className="hi-divlegend">
      <span className="hi-divlegend-title">Wärmer → Kälter · Abweichung vom Mittel</span>
      <div className="hi-divlegend-bar" style={{ background: gradient }} />
      <div className="hi-divlegend-scale">
        <span>−{span.toFixed(1)} °C</span><span>Normal</span><span>+{span.toFixed(1)} °C</span>
      </div>
    </div>
  );
}

// --- „Wie lese ich das?" (US-13.1) + Provenienz (E13) ------------------------

const HOWTO: Record<string, string> = {
  stripes: 'Jeder Streifen = ein Jahr. Blau = kälter, Rot = wärmer als das Mittel des Zeitraums. Beschriftung einblenden zeigt Jahre und Werteskala.',
  anomaly: 'Balken über der Nulllinie = wärmer/nasser als der Normalwert der Referenzperiode, darunter kälter/trockener. Die gestrichelte Linie ist der statistische Langzeittrend (kein Vorhersagewert).',
  dayband: 'Die rote Linie ist der Tagesverlauf des gewählten Jahres. Das grüne Band ist der typische Bereich (p10–p90), das beige Band der Rekordbereich aller Jahre.',
  kenntage: 'Balken = Anzahl der Tage pro Jahr, die die Schwelle erfüllen. Das Rekordjahr ist hervorgehoben. Die Schwelle ist anpassbar.',
  calendar: 'Jede Zelle = ein Tag des Jahres (Spalten = Monate, Zeilen = Tag im Monat). Farbe nach Wert. Klick auf eine Zelle öffnet das Tagesdetail.',
};

function HowTo({ type }: { type: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="hi-howto">
      <button type="button" className="hi-howto-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Wie lese ich das?</button>
      {open && <span className="hi-howto-pop" role="tooltip">{HOWTO[type]}</span>}
    </span>
  );
}

function Provenance({ kind, label, compact, station }: { kind: 'measured' | 'reanalysis'; label: string; compact?: boolean; station?: { name: string; distanceKm: number; elevation: number | null } | null }) {
  const badge = kind === 'reanalysis' ? 'Reanalyse' : 'Messung';
  if (compact) return <p className="hi-provenance hi-provenance-compact"><span className="hi-prov-badge">{badge}</span>Quelle: {label}{station ? ` · ${station.name}` : ''}</p>;
  const stationTxt = station ? ` Nächste Station: ${station.name} (${station.distanceKm} km${station.elevation != null ? `, ${station.elevation} m` : ''}).` : '';
  return (
    <p className="hi-provenance">
      <span className="hi-prov-badge">{badge}</span>
      Datenquelle: {label}.{stationTxt} {kind === 'reanalysis'
        ? 'ERA5 ist eine modellierte Reanalyse (mit Beobachtungen assimiliert), keine reine Stationsmessung — in Berglagen können lokale Abweichungen auftreten.'
        : 'Tageswerte aus Stationsmessungen (für DE überwiegend DWD). Die Werte stammen von der nächstgelegenen Station — bei größerer Entfernung oder in Berglagen kann der Ortswert leicht abweichen.'} Lücken werden nicht stillschweigend interpoliert.
    </p>
  );
}
