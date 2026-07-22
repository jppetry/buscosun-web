/**
 * Feature „Wetterhistorie / Klima-Rückblick" — „Command-Deck" (hell).
 *
 * Sand/Ink · League Spartan · Steel (Rückblick) / Terracotta (Veränderung).
 * Verbindliche Vorlage: references/historie.dc.html + desktop-1..3 / tablet-1..2 /
 * mobile-1..3.png. Ersetzt das frühere rt-nav/rt-container-Chrome vollständig; die
 * inneren Diagramm-Komponenten (charts/*) und die Rückblick-Ansicht (ExploreView)
 * bleiben erhalten und werden nur neu eingebettet.
 *
 * Funktionserhalt: Modus-Wahl (Rückblick ↔ Veränderung), alle Steuerungen
 * (Variable/Auflösung/Zeitraum/Referenz), alle 12 Diagrammtypen, Kenntage/Rekorde,
 * Zeitraum-Slider, Datentabelle, Provenienz, Permalink/Embed, Hell/Dunkel.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { geocodeDACH, flagForCountry } from '../geocode';
import { defaultHistorySource } from './historySource';
import type { DailyRecord } from './historyModel';
import {
  VARIABLES, variableMeta, KENNTAGE, kenntagDef, NORMAL_PERIODS, yearSpan,
  aggregate, yearly, anomalies, linearTrend, normalValue, countKenntageByYear, records,
  dayClimatology, daySeries, calendarYear, monthlyDistribution, tempBandShares, windRose,
  monthName, type NormalPeriod,
} from './historyModel';
import {
  DEFAULT_SETTINGS, resolveYearRange,
  encodeState, decodeState, isFavorite, toggleFavorite, pushRecent,
  type HistorySettings, type HistoryLocation, type ChartType,
} from './historyState';
import { summarizeTrend, summarizeKenntage, summarizeSeries } from './historySummary';
import { divergingLegend, anomalySpan } from './historyColors';
import { yearInsight } from './historyExplore';
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
import { useIsMobile } from '../mobile/useIsMobile';
import type { HistoryMode, ExploreGranularity } from './historyState';
import '../intro/intro.css';
import '../route/tourTheme.css';
import './history.css';
import './historyDeck.css';

interface Props { onBack: () => void }

const HIST_INTRO_CAPS = [
  'Klimastreifen: jedes Jahr ein Streifen — wärmer oder kälter',
  'Abweichungen, Kenntage & Langzeit-Trend über die Jahrzehnte',
  'Einzelnen Tag, Monat oder ganzes Jahr nachschlagen',
  'Echte Archivdaten (ERA5) — viele Jahrzehnte zurück',
];

const CHART_LABELS: { id: ChartType; label: string }[] = [
  { id: 'stripes', label: 'Streifen' },
  { id: 'anomaly', label: 'Anomalie' },
  { id: 'dayband', label: 'Tagesband' },
  { id: 'calendar', label: 'Kalender' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'bands', label: 'Bänder' },
  { id: 'box', label: 'Box' },
  { id: 'windrose', label: 'Windrose' },
  { id: 'kenntage', label: 'Kenntage' },
  { id: 'records', label: 'Rekorde' },
  { id: 'dateLookup', label: 'Datum' },
  { id: 'line', label: 'Verlauf' },
];

// ============================ Icons ============================

function IconCheck() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3,8.5 6.5,12 13,4" /></svg>;
}
function IconArrow({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="2" y1="8" x2="12" y2="8" /><polyline points="8,4 12,8 8,12" /></svg>;
}
function IconChevronLeft() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5 L8 12 L15 19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
/* Rail-Icons (aus historie.dc.html) */
function RailMap() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M12 3 L21 8 L12 13 L3 8 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M3 13 L12 18 L21 13" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>; }
function RailClock() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M12 8 V12 L15 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M3.5 12 A8.5 8.5 0 1 0 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M3 3 V6.5 H6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function RailForecast() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M4 18 L9 11 L13 14 L20 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

// ============================ Haupt-Container ============================

export default function HistoryPage({ onBack }: Props) {
  const [loc, setLoc] = useState<HistoryLocation | null>(null);
  const [settings, setSettings] = useState<HistorySettings>(DEFAULT_SETTINGS);
  const [days, setDays] = useState<DailyRecord[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [favTick, setFavTick] = useState(0);
  const [drillDate, setDrillDate] = useState<string | null>(null);
  const [modePicked, setModePicked] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  const [dark, setDark] = useState<boolean>(() => { try { return localStorage.getItem('buscosun.history.dark.v1') === '1'; } catch { return false; } });
  const chartsRef = useRef<HTMLDivElement | null>(null);
  const acRef = useRef<AbortController | null>(null);
  const isMobile = useIsMobile();

  function toggleDark() { setDark((d) => { const n = !d; try { localStorage.setItem('buscosun.history.dark.v1', n ? '1' : '0'); } catch { /* ignore */ } return n; }); }
  const patch = (p: Partial<HistorySettings>) => setSettings((s) => ({ ...s, ...p }));

  const clearHash = () => {
    if (typeof window === 'undefined') return;
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };
  const handleBack = () => { clearHash(); onBack(); };
  const changeLocation = () => { clearHash(); setModePicked(false); setLoc(null); };
  const backToMode = () => { setModePicked(false); setDrillDate(null); setProOpen(false); };

  useEffect(() => {
    const dec = typeof window !== 'undefined' ? decodeState(window.location.hash) : null;
    if (dec?.loc) { setLoc(dec.loc); setSettings(dec.settings); setModePicked(true); }
  }, []);

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

  const embed = useMemo(() => typeof window !== 'undefined' && /(?:^|[#&])embed=1/.test(window.location.hash), []);

  useEffect(() => {
    if (embed) return;
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

  const tmeanYearly = useMemo(() => (days ? yearly(days, 'tmean') : []), [days]);
  const warmingTrend = useMemo(() => linearTrend(tmeanYearly), [tmeanYearly]);
  // firstT/lastT sind Zeit-Koordinaten (Jahre) — die Erwärmung ist Steigung × Spanne,
  // nicht lastT − firstT (das ergäbe die Anzahl Jahre).
  const warmingDelta = warmingTrend ? warmingTrend.slopePerYear * (warmingTrend.lastT - warmingTrend.firstT) : null;
  const recordSet = useMemo(() => (days ? records(days) : null), [days]);

  // --- Embed-Modus: schlanke, chromelose Ansicht (US-10.4) — unverändert -----
  if (embed) {
    return (
      <div className="rt-page hi-page hi-embed" data-theme={dark ? 'dark' : undefined}>
        <div className="rt-grain" />
        <main className="rt-container">
          {!loc ? <Onboarding onPick={applyLocation} deck={false} /> : (
            <>
              <div className="hi-embed-head"><strong>{loc.name}</strong><span>{meta.label}{available ? ` · ${available.min}–${available.max}` : ''}</span></div>
              {status === 'loading' && <div className="rt-card hi-state"><span className="ev-spinner" /> <p>Stationsdaten werden geladen …</p></div>}
              {status === 'error' && <div className="rt-card hi-state"><p>⚠ {errMsg}</p></div>}
              {status === 'ready' && days && (
                <>
                  {settings.mode === 'explore'
                    ? <ExploreView days={days} lat={loc.lat} lon={loc.lon} settings={settings} patch={patch} available={available} normalPeriod={normalPeriod} />
                    : <EmbedChange settings={settings} workDays={workDays} meta={meta} normal={normal} />}
                  <a className="hi-embed-link" href={typeof window !== 'undefined' ? window.location.href.replace(/[#&]embed=1/, '') : '#'} target="_blank" rel="noopener">Auf buscosun ansehen →</a>
                  <Provenance kind={defaultHistorySource.kind} label={defaultHistorySource.label} compact station={defaultHistorySource.lastStation} />
                </>
              )}
            </>
          )}
        </main>
      </div>
    );
  }

  // --- State-Ableitung für die Deck-Chrome ----------------------------------
  const view: 'onboard' | 'modus' | 'change' | 'explore' =
    !loc ? 'onboard'
      : (status === 'ready' && days && modePicked) ? (settings.mode === 'explore' ? 'explore' : 'change')
        : 'modus';

  const themeAttr = dark ? 'dark' : undefined;

  // ============================ MOBILE ============================
  if (isMobile) {
    return (
      <div className="hd-m-root" data-theme={themeAttr}>
        {view === 'onboard' && (
          <>
            <MobileBrandHead loc={null} onWechseln={undefined} />
            <div className="hd-m-scroll">
              <div className="hd-m-onboard"><Onboarding onPick={applyLocation} deck /></div>
            </div>
          </>
        )}

        {view !== 'onboard' && status === 'loading' && (
          <>
            <MobileBrandHead loc={loc} onWechseln={changeLocation} />
            <div className="hd-m-scroll"><div className="hd-m-panel"><span className="ev-spinner" /> Stationsdaten werden geladen …</div></div>
          </>
        )}
        {view !== 'onboard' && status === 'error' && (
          <>
            <MobileBrandHead loc={loc} onWechseln={changeLocation} />
            <div className="hd-m-scroll"><div className="hd-m-panel">⚠ {errMsg}<br /><button type="button" className="hd-m-chip" style={{ marginTop: 10 }} onClick={() => setLoc(loc ? { ...loc } : null)}>Erneut versuchen</button></div></div>
          </>
        )}

        {view === 'modus' && status === 'ready' && days && (
          <>
            <MobileBrandHead loc={loc} onWechseln={changeLocation} />
            <div className="hd-m-scroll">
              <MobileModeChoice available={available} warmingDelta={warmingDelta} hottest={recordSet?.warmestDay ?? null}
                onPick={(mode, gran) => { patch(gran ? { mode, exploreGran: gran } : { mode }); setModePicked(true); }} />
            </div>
          </>
        )}

        {view === 'change' && days && (
          <>
            <MobileHeader eyebrow={`Veränderung · ${shortLoc(loc!.name)}`} title="Wie hat es sich verändert?" accent="terra" onBack={backToMode} />
            <div className="hd-m-scroll">
              <MobileChange settings={settings} patch={patch} days={days} workDays={workDays} meta={meta} normal={normal} normalPeriod={normalPeriod} range={range} available={available} recordSet={recordSet} />
            </div>
          </>
        )}

        {view === 'explore' && days && (
          <>
            <MobileHeader eyebrow={`Rückblick · ${shortLoc(loc!.name)}`} title="Wie war das Wetter?" accent="steel" onBack={backToMode} />
            <div className="hd-m-scroll hd-m-explore">
              <ExploreView days={days} lat={loc!.lat} lon={loc!.lon} settings={settings} patch={patch} available={available} normalPeriod={normalPeriod} />
              <Provenance kind={defaultHistorySource.kind} label={defaultHistorySource.label} compact station={defaultHistorySource.lastStation} />
            </div>
          </>
        )}
      </div>
    );
  }

  // ============================ DESKTOP / TABLET ============================
  return (
    <div className="hd-root" data-theme={themeAttr}>
      <Topbar view={view} loc={loc} available={available} dark={dark} onToggleDark={toggleDark}
        onBrand={handleBack} onChangeLoc={changeLocation} onModeSwitch={backToMode}
        fav={loc ? isFavorite(loc) : false} onFav={() => { if (loc) { toggleFavorite(loc); setFavTick((n) => n + 1); } }} favTick={favTick}
        proOpen={proOpen} onPro={() => setProOpen((o) => !o)} />

      <div className="hd-body">
        <Rail active={view} onMap={handleBack} />

        {view === 'onboard' && <div className="hd-main"><div className="hd-onboard"><Onboarding onPick={applyLocation} deck /></div></div>}

        {view === 'modus' && status !== 'ready' && (
          <div className="hd-main">
            {status === 'loading' && <div className="hd-panel"><span className="ev-spinner" /> Stationsdaten werden geladen … (bis zu {new Date().getFullYear() - defaultHistorySource.minYear} Jahre)</div>}
            {status === 'error' && <div className="hd-panel">⚠ {errMsg} <button type="button" className="hd-seg" onClick={() => setLoc(loc ? { ...loc } : null)}>Erneut versuchen</button></div>}
          </div>
        )}

        {view === 'modus' && status === 'ready' && days && (
          <div className="hd-main">
            <BriefingStrip loc={loc!} available={available} recordCount={days.length} />
            <ModeTiles available={available} warmingDelta={warmingDelta} hottest={recordSet?.warmestDay ?? null}
              onPick={(mode, gran) => { patch(gran ? { mode, exploreGran: gran } : { mode }); setModePicked(true); }} />
          </div>
        )}

        {view === 'change' && days && (
          <>
            <ChangeDock settings={settings} patch={patch} available={available} />
            <div className="hd-center hd-scroll" ref={chartsRef}>
              <ChangeCenter settings={settings} patch={patch} days={days} workDays={workDays} meta={meta} normal={normal} normalPeriod={normalPeriod} range={range} available={available} onDrillDate={setDrillDate} />
              {proOpen && <HistoryPro loc={loc!} days={days} settings={settings} buckets={exportBuckets} range={range} chartsRef={chartsRef} />}
              {drillDate && (
                <DayDetail days={days} lat={loc!.lat} lon={loc!.lon} dateISO={drillDate} onClose={() => setDrillDate(null)}
                  breadcrumb={[
                    { label: String(drillDate.slice(0, 4)), onClick: () => setDrillDate(null) },
                    { label: new Date(`${drillDate}T12:00`).toLocaleDateString('de-DE', { month: 'long' }), onClick: () => setDrillDate(null) },
                    { label: `${Number(drillDate.slice(8, 10))}. Tag` },
                  ]} />
              )}
            </div>
            <ChangeReadout days={days} />
          </>
        )}

        {view === 'explore' && days && (
          <>
            <div className="hd-explore hd-scroll">
              <ExploreView days={days} lat={loc!.lat} lon={loc!.lon} settings={settings} patch={patch} available={available} normalPeriod={normalPeriod} />
              <Provenance kind={defaultHistorySource.kind} label={defaultHistorySource.label} station={defaultHistorySource.lastStation} />
            </div>
            <ExploreDrill days={days} settings={settings} patch={patch} available={available} normalPeriod={normalPeriod} />
          </>
        )}
      </div>
    </div>
  );
}

// ============================ Rail ============================

function Rail({ active, onMap }: { active: 'onboard' | 'modus' | 'change' | 'explore'; onMap: () => void }) {
  const accent = active === 'explore' ? 'steel' : 'amber';
  return (
    <nav className="hd-rail" aria-label="Bereiche">
      <button type="button" className="hd-rail-btn" onClick={onMap} title="Zur Übersicht" aria-label="Zur Übersicht"><RailMap /></button>
      <span className={`hd-rail-btn hd-rail-btn--active hd-rail-btn--${accent}`} title="Historie" aria-current="page"><RailClock /></span>
      <span className="hd-rail-btn" title="Vorhersage" aria-hidden="true"><RailForecast /></span>
    </nav>
  );
}

// ============================ Topbar ============================

function Topbar({ view, loc, available, dark, onToggleDark, onBrand, onChangeLoc, onModeSwitch, fav, onFav, favTick, proOpen, onPro }: {
  view: 'onboard' | 'modus' | 'change' | 'explore';
  loc: HistoryLocation | null; available: { min: number; max: number } | null;
  dark: boolean; onToggleDark: () => void; onBrand: () => void; onChangeLoc: () => void; onModeSwitch: () => void;
  fav: boolean; onFav: () => void; favTick: number; proOpen: boolean; onPro: () => void;
}) {
  const span = available ? `· ${available.min}–${available.max}` : '';
  return (
    <header className="hd-topbar" key={favTick}>
      <button type="button" className="hd-brandwrap" onClick={onBrand} aria-label="Zur Übersicht">
        <span className="rt-nav-logo-mark hd-brandmark" aria-hidden="true" />
        <span className="hd-brand">buscosun</span>
      </button>
      <span className="hd-topdivider" />
      {loc && (
        <div className="hd-locchip">
          <span className="hd-locchip-flag" aria-hidden="true">{flagForCountry(loc.country ?? 'DE')}</span>
          <span className="hd-locchip-name">{shortLoc(loc.name)}</span>
          {span && <span className="hd-locchip-range">{span}</span>}
          {view === 'modus' && <button type="button" className="hd-locchip-change" onClick={onChangeLoc}>Ort wechseln</button>}
        </div>
      )}
      {view === 'change' && (
        <div className="hd-topbtns">
          <button type="button" className={`hd-topbtn${fav ? ' hd-topbtn--on' : ''}`} onClick={onFav}>{fav ? '★ Favorit' : '☆ Favorit'}</button>
          <button type="button" className={`hd-topbtn${proOpen ? ' hd-topbtn--on' : ''}`} onClick={onPro}>Vergleichen / Profi</button>
        </div>
      )}
      <div className="hd-topright">
        {(view === 'change' || view === 'explore') && (
          <button type="button" className={`hd-modelink hd-modelink--${view === 'explore' ? 'steel' : 'terra'}`} onClick={onModeSwitch}><IconChevronLeft /> Modus wechseln</button>
        )}
        <button type="button" className="hd-theme-btn" onClick={onToggleDark} aria-label={dark ? 'Heller Modus' : 'Dunkler Modus'} title="Hell/Dunkel">{dark ? '☀' : '☾'}</button>
        {view === 'modus' && <span className="hd-live-txt">KLIMA-RÜCKBLICK</span>}
        <span className="hd-avatar">JK</span>
      </div>
    </header>
  );
}

// ============================ Briefing-Strip ============================

function BriefingStrip({ loc, available, recordCount }: { loc: HistoryLocation; available: { min: number; max: number } | null; recordCount: number }) {
  const span = available ? `${available.min}–${available.max}` : '—';
  const recordsTxt = recordCount > 0 ? `${recordCount.toLocaleString('de-DE')} T.` : '—';
  return (
    <div className="hd-brief">
      <div className="hd-brief-main">
        <div className="hd-brief-kicker"><span className="hd-brief-dot" /><span className="hd-brief-kickertxt">KLIMA-LEITSTAND · ARCHIV BEREIT</span></div>
        <div className="hd-brief-title">Was möchtest du sehen?</div>
        <div className="hd-brief-sub">Zwei Sichten auf das Stationsarchiv — wähle einen Modus.</div>
      </div>
      <div className="hd-brief-tele">
        <div className="hd-tele"><div className="hd-tele-lab">STATION</div><div className="hd-tele-val">{shortLoc(loc.name)}</div></div>
        <div className="hd-tele"><div className="hd-tele-lab">ZEITRAUM</div><div className="hd-tele-val">{span}</div></div>
        <div className="hd-tele"><div className="hd-tele-lab">RECORDS</div><div className="hd-tele-val">{recordsTxt}</div></div>
        <div className="hd-tele"><div className="hd-tele-lab">QUELLE</div><div className="hd-tele-val">{defaultHistorySource.kind === 'reanalysis' ? 'DWD · ERA5' : 'DWD'}</div></div>
      </div>
    </div>
  );
}

// ============================ Modus-Kacheln (Desktop) ============================

function fmtRecordDate(iso: string): string {
  return new Date(`${iso}T12:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Kurzer Anzeigename: Geocoder liefert „Ort, Kreis, Land …"; das Deck zeigt nur den Ort. */
function shortLoc(name: string): string { return name.split(',')[0].trim(); }

function TileArtRueckblick() {
  return (
    <>
      <svg viewBox="0 0 260 132" preserveAspectRatio="xMidYMid slice" className="hd-tile-art-grid" aria-hidden="true"><g stroke="#D4E0EC" strokeWidth="1"><path d="M0 44 H260 M0 88 H260 M65 0 V132 M130 0 V132 M195 0 V132" /></g></svg>
      <svg viewBox="0 0 260 132" className="hd-tile-art-svg" fill="none" aria-hidden="true">
        <rect x="40" y="30" width="92" height="76" rx="9" stroke="#3A6FA8" strokeWidth="2" /><line x1="40" y1="50" x2="132" y2="50" stroke="#3A6FA8" strokeWidth="2" /><line x1="61" y1="24" x2="61" y2="37" stroke="#3A6FA8" strokeWidth="2" strokeLinecap="round" /><line x1="111" y1="24" x2="111" y2="37" stroke="#3A6FA8" strokeWidth="2" strokeLinecap="round" />
        <rect x="55" y="60" width="20" height="17" rx="3" fill="#3A6FA8" /><g opacity=".35" stroke="#3A6FA8" strokeWidth="2"><line x1="86" y1="68" x2="118" y2="68" /><line x1="55" y1="90" x2="118" y2="90" /></g>
        <path d="M 152 86 Q 182 54 204 74 T 238 50" stroke="#2C2A26" strokeWidth="2" strokeLinecap="round" /><circle cx="238" cy="50" r="4.5" fill="#2C2A26" />
      </svg>
    </>
  );
}
function TileArtVeraenderung() {
  const fills = ['#3A6FA8', '#5B87B0', '#89AEC9', '#BFD0DC', '#E8E0CC', '#EAD3A8', '#E3B679', '#DD9A57', '#D68A4E', '#CE6E3C', '#C0492F', '#B03B28', '#A83424'];
  const ops = [.55, .6, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  return (
    <svg viewBox="0 0 260 132" className="hd-tile-art-svg" aria-hidden="true">
      <g>{fills.map((f, i) => <rect key={i} x={26 + i * 13} y="30" width="11.5" height="72" rx="1.5" fill={f} opacity={ops[i]} />)}</g>
      <path d="M 30 92 Q 132 84 230 52" stroke="#2C2A26" strokeWidth="2" fill="none" strokeLinecap="round" /><circle cx="230" cy="52" r="4.5" fill="#2C2A26" />
    </svg>
  );
}

function ModeTiles({ available, warmingDelta, hottest, onPick }: {
  available: { min: number; max: number } | null; warmingDelta: number | null;
  hottest: { value: number; dateISO: string } | null; onPick: (m: HistoryMode, gran?: ExploreGranularity) => void;
}) {
  const span = available ? `${available.min}–${available.max}` : null;
  const deltaTxt = warmingDelta != null ? `${warmingDelta > 0 ? '+' : ''}${warmingDelta.toLocaleString('de-DE', { maximumFractionDigits: 1 })} °C` : null;
  return (
    <div className="hd-tiles">
      {/* MODUS 01 · Rückblick (Steel) */}
      <div className="hd-tile hd-tile--steel" role="group" aria-label="Modus Rückblick">
        <span className="hd-tile-corner hd-tile-corner--l" /><span className="hd-tile-corner hd-tile-corner--r" />
        <div className="hd-tile-art"><TileArtRueckblick /></div>
        <div className="hd-tile-body">
          <div className="hd-tile-eyebrow"><span className="hd-tile-ico"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 8 V12 L15 14" stroke="#3A6FA8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M3.5 12 A8.5 8.5 0 1 0 6 6" stroke="#3A6FA8" strokeWidth="1.8" strokeLinecap="round" /><path d="M3 3 V6.5 H6.5" stroke="#3A6FA8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span className="hd-tile-eyebrow-tx">MODUS 01 · RÜCKBLICK</span></div>
          <div className="hd-tile-title">Wie war das Wetter?</div>
          <p className="hd-tile-desc">Schlag einen konkreten Zeitpunkt nach — mit Stundenverlauf, Min/Max und Niederschlag.</p>
          <div className="hd-tile-pick">
            <span className="hd-pick-label">Zeitpunkt wählen</span>
            <button type="button" className="hd-pick-day" onClick={() => onPick('explore', 'day')}>
              <span className="hd-pick-day-ic"><svg width="18" height="18" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="24" height="21" rx="3" /><line x1="2" y1="11" x2="26" y2="11" /><line x1="8" y1="2" x2="8" y2="7" /><line x1="20" y1="2" x2="20" y2="7" /><rect x="7" y="15" width="6" height="6" rx="1" fill="currentColor" stroke="none" /></svg></span>
              <span className="hd-pick-day-tx"><b>Einzelnen Tag</b><em>Stunde für Stunde nachschlagen</em></span>
              <span className="hd-pick-day-arr"><IconArrow /></span>
            </button>
            <div className="hd-pick-row">
              <button type="button" className="hd-pick-btn" onClick={() => onPick('explore', 'month')}>Ganzer Monat</button>
              <button type="button" className="hd-pick-btn" onClick={() => onPick('explore', 'year')}>Ganzes Jahr</button>
            </div>
          </div>
          {hottest && <div className="hd-tile-foothint"><span className="dot" />Heißester Tag seit Messbeginn: <strong>{fmtRecordDate(hottest.dateISO)} · {Math.round(hottest.value)} °C</strong></div>}
        </div>
      </div>

      {/* MODUS 02 · Veränderung (Terracotta, empfohlen) */}
      <button type="button" className="hd-tile hd-tile--terra" onClick={() => onPick('change')}>
        <span className="hd-tile-corner hd-tile-corner--l" /><span className="hd-tile-flag">EMPFOHLEN</span>
        <div className="hd-tile-art"><TileArtVeraenderung /></div>
        <div className="hd-tile-body">
          <div className="hd-tile-eyebrow"><span className="hd-tile-ico"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 18 L10 11 L14 14 L20 5" stroke="#C97B47" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><path d="M15 5 H20 V10" stroke="#C97B47" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span className="hd-tile-eyebrow-tx">MODUS 02 · VERÄNDERUNG</span></div>
          <div className="hd-tile-title">Wie hat sich das Wetter verändert?</div>
          <p className="hd-tile-desc">Klimastreifen, Abweichungen, Kenntage und Trends über die Jahrzehnte.</p>
          <div className="hd-tile-tags"><i>Klimastreifen</i><i>Anomalien</i><i>Kenntage</i><i>Trend</i></div>
          <div className="hd-tile-foot">
            {deltaTxt ? <span className="hd-tile-stat"><b>{deltaTxt}</b><em>Trend Jahresmittel{span ? ` · ${span}` : ''}</em></span> : <span />}
            <span className="hd-tile-open">Öffnen <IconArrow /></span>
          </div>
        </div>
      </button>
    </div>
  );
}

// ============================ Veränderung — Dock ============================

function ChangeDock({ settings, patch, available }: { settings: HistorySettings; patch: (p: Partial<HistorySettings>) => void; available: { min: number; max: number } | null }) {
  return (
    <aside className="hd-dock hd-scroll" aria-label="Steuerung">
      <div className="hd-dock-group">
        <span className="hd-field-lab">Variable</span>
        <div className="hd-segs">{VARIABLES.map((v) => <DockSeg key={v.key} on={settings.variable === v.key} onClick={() => patch({ variable: v.key })}>{v.short}</DockSeg>)}</div>
      </div>
      <div className="hd-dock-group">
        <span className="hd-field-lab">Auflösung</span>
        <div className="hd-segs">{(['daily', 'monthly', 'seasonal', 'yearly'] as const).map((r) => (
          <DockSeg key={r} on={settings.resolution === r} onClick={() => patch({ resolution: r })}>{r === 'daily' ? 'Täglich' : r === 'monthly' ? 'Monatl.' : r === 'seasonal' ? 'Saison' : 'Jährl.'}</DockSeg>
        ))}</div>
      </div>
      <div className="hd-dock-group">
        <span className="hd-field-lab">Zeitraum</span>
        <div className="hd-segs">
          <DockSeg on={settings.period === 'last-year'} onClick={() => patch({ period: 'last-year' })}>Letztes Jahr</DockSeg>
          <DockSeg on={settings.period === '10y'} onClick={() => patch({ period: '10y' })}>10 J</DockSeg>
          <DockSeg on={settings.period === '30y'} onClick={() => patch({ period: '30y' })}>30 J</DockSeg>
          <DockSeg on={settings.period === 'all'} onClick={() => patch({ period: 'all' })}>Gesamt</DockSeg>
        </div>
        {available && <p className="hd-avail-note">verfügbar {available.min}–{available.max}</p>}
      </div>
      <div className="hd-dock-group">
        <span className="hd-field-lab">Referenz</span>
        <div className="hd-segs">{NORMAL_PERIODS.map((p) => <DockSeg key={p.id} on={settings.normalPeriodId === p.id} onClick={() => patch({ normalPeriodId: p.id })}>{p.label}</DockSeg>)}</div>
      </div>
      <div className="hd-diagrambox">
        <span className="hd-field-lab">Diagramm</span>
        <div className="hd-diagram-chips">
          {CHART_LABELS.map((c) => <button key={c.id} type="button" className={`hd-diagram-chip${settings.chart === c.id ? ' hd-diagram-chip--on' : ''}`} aria-pressed={settings.chart === c.id} onClick={() => patch({ chart: c.id })}>{c.label}</button>)}
        </div>
      </div>
    </aside>
  );
}

function DockSeg({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`hd-seg${on ? ' hd-seg--on' : ''}`} role="tab" aria-selected={on} onClick={onClick}>{children}</button>;
}

// ============================ Veränderung — Center ============================

/** Kern-Rendering der Diagramme (ohne Diagramm-Umschalter, der lebt im Dock). */
function ChangeCenter({ settings, patch, days, workDays, meta, normal, normalPeriod, range, available, onDrillDate }: {
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

  const panelCharts: ChartType[] = ['stripes', 'anomaly', 'dayband', 'kenntage', 'line', 'calendar', 'overlay', 'bands', 'box', 'windrose'];
  const inPanel = panelCharts.includes(settings.chart);

  return (
    <section>
      <div className="hd-center-head">
        <span className="hd-center-title">{chartTitle(settings.chart, meta.label)}</span>
        <div className="hd-center-tools">
          {settings.chart === 'stripes' && (
            <label className="hd-toggle"><input type="checkbox" checked={settings.showLabels} onChange={(e) => patch({ showLabels: e.target.checked })} /><span className="hd-toggle-track" />Beschriftung</label>
          )}
          {settings.chart === 'anomaly' && (
            <label className="hd-toggle"><input type="checkbox" checked={settings.showTrend} onChange={(e) => patch({ showTrend: e.target.checked })} /><span className="hd-toggle-track" />Trendlinie</label>
          )}
          {(settings.chart === 'dayband' || settings.chart === 'calendar' || settings.chart === 'overlay') && <YearStepper year={focusYear} range={range} onChange={(y) => patch({ focusYear: y })} />}
          {settings.chart === 'kenntage' && <KenntagPicker settings={settings} patch={patch} />}
          {['stripes', 'anomaly', 'dayband', 'kenntage', 'calendar'].includes(settings.chart) && <HowTo type={settings.chart} />}
          <button type="button" className="hd-howto-link" aria-expanded={showTable} onClick={() => setShowTable((t) => !t)}>{showTable ? 'Tabelle aus' : 'Tabelle'}</button>
        </div>
      </div>

      {showTable && <div className="hd-panel" style={{ marginBottom: 12 }}><DataTable buckets={buckets} meta={meta} /></div>}

      <div className={inPanel ? 'hd-panel' : ''}>
        {settings.chart === 'stripes' && <Stripes buckets={yr} unit={meta.unit} showLabels={settings.showLabels} onPick={(y) => patch({ chart: 'dayband', focusYear: y })} />}
        {settings.chart === 'anomaly' && <AnomalyBars points={anos} unit={meta.unit} trend={trend} normalLabel={normalPeriod.label} onPick={(y) => patch({ chart: 'dayband', focusYear: y })} />}
        {settings.chart === 'dayband' && <DayBand clim={clim} series={fSeries} unit={meta.unit} year={focusYear} />}
        {settings.chart === 'kenntage' && <KenntageBars data={kenn} label={def.label} threshold={threshold} unitHint="°C" focusYear={settings.focusYear} onPick={(y) => patch({ focusYear: y })} />}
        {settings.chart === 'line' && <LineChart buckets={buckets} unit={meta.unit} onPick={(y) => patch({ chart: 'dayband', focusYear: y })} />}
        {settings.chart === 'calendar' && <CalendarHeatmap cells={calCells} meta={meta} year={focusYear} onPick={onDrillDate} />}
        {settings.chart === 'overlay' && <YearOverlay days={days} meta={meta} focusYear={focusYear} years={overlayYears} />}
        {settings.chart === 'bands' && <TempBands data={bands} />}
        {settings.chart === 'box' && <BoxPlot data={box} unit={meta.unit} />}
        {settings.chart === 'windrose' && <Windrose data={rose} />}
      </div>

      {settings.chart === 'records' && <RecordsPanel days={days} />}
      {settings.chart === 'dateLookup' && <DateLookup days={days} month={settings.lookupMonth} day={settings.lookupDay} onChange={(m, d) => patch({ lookupMonth: m, lookupDay: d })} />}

      {settings.chart === 'stripes' && <div className="hd-panel" style={{ marginTop: 12 }}><DivLegend span={span} /></div>}

      {available && ['stripes', 'anomaly', 'kenntage', 'line'].includes(settings.chart) && (
        <div className="hi-rangewrap">
          <span className="hi-range-label">Zeitraum eingrenzen</span>
          <div className="hi-range-readout">{range.start} – {range.end}<span className="hi-range-readout-sub">{range.end - range.start + 1} Jahre</span></div>
          <TimeRangeSlider min={available.min} max={available.max} start={range.start} end={range.end} onChange={(s, e) => patch({ period: 'custom', customStart: s, customEnd: e })} />
        </div>
      )}

      {summary && settings.chart !== 'records' && settings.chart !== 'dateLookup' && <p className="hd-summary" dangerouslySetInnerHTML={{ __html: summary.replace(/(\+?\d+[.,]\d+\s?°C)/, '<strong>$1</strong>') }} />}
      <Provenance kind={defaultHistorySource.kind} label={defaultHistorySource.label} station={defaultHistorySource.lastStation} deck />
    </section>
  );
}

// ============================ Veränderung — Readout ============================

const READOUT_KENN = [
  { key: 'summer', label: 'Sommertage ≥25°' },
  { key: 'hot', label: 'Hitzetage ≥30°' },
  { key: 'frost', label: 'Frost' },
] as const;

function ChangeReadout({ days }: { days: DailyRecord[] }) {
  const [kk, setKk] = useState<'summer' | 'hot' | 'frost'>('summer');
  const def = kenntagDef(kk);
  const series = useMemo(() => countKenntageByYear(days, def), [days, def]);
  const rec = useMemo(() => records(days), [days]);
  const max = series.reduce((m, s) => Math.max(m, s.count), 0) || 1;
  const recRow = series.reduce((best, s) => (s.count > (best?.count ?? -1) ? s : best), null as null | { year: number; count: number });
  const n = series.length;
  const bw = n > 0 ? Math.min(11, 260 / n - 1) : 9;
  const gap = n > 0 ? 268 / n : 14;

  return (
    <aside className="hd-readout hd-scroll" aria-label="Kenntage & Rekorde">
      <span className="hd-field-lab">Kenntage pro Jahr</span>
      <div className="hd-kenncard">
        <div className="hd-kenn-chips">
          {READOUT_KENN.map((k) => <button key={k.key} type="button" className={`hd-kenn-chip${kk === k.key ? ' hd-kenn-chip--on' : ''}`} onClick={() => setKk(k.key)}>{k.label}</button>)}
        </div>
        <svg viewBox="0 0 268 120" className="hd-kenn-svg" fontFamily="League Spartan" aria-hidden="true">
          <line x1="0" y1="104" x2="268" y2="104" stroke="#E0D6BE" />
          {series.map((s, i) => {
            const h = Math.max(2, (s.count / max) * 74);
            const isRec = recRow != null && s.year === recRow.year;
            return <rect key={s.year} x={i * gap + 4} y={104 - h} width={bw} height={h} rx="1.5" fill={isRec ? '#C0492F' : '#D68A4E'} />;
          })}
        </svg>
        {recRow && <div className="hd-kenn-note">Rekordjahr {recRow.year}: <strong>{recRow.count} {def.label}</strong> — deutlich über dem langjährigen Mittel.</div>}
      </div>

      <span className="hd-field-lab hd-readout-sep">Rekorde seit Messbeginn</span>
      <div className="hd-reclist">
        {rec.warmestDay && (
          <div className="hd-reccard hd-reccard--hot">
            <span className="hd-rec-ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="#C0492F" fillOpacity=".3" stroke="#C0492F" strokeWidth="1.5" /><g stroke="#C0492F" strokeWidth="1.5" strokeLinecap="round"><line x1="12" y1="3" x2="12" y2="5.5" /><line x1="12" y1="18.5" x2="12" y2="21" /></g></svg></span>
            <div><div className="hd-rec-lab">HEISSESTER TAG</div><div className="hd-rec-val">{rec.warmestDay.value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C <span>· {fmtRecordDate(rec.warmestDay.dateISO)}</span></div></div>
          </div>
        )}
        {rec.coldestDay && (
          <div className="hd-reccard">
            <span className="hd-rec-ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3 V21 M5 8 L12 3 L19 8 M6 14 L12 10 L18 14" stroke="#3A6FA8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            <div><div className="hd-rec-lab">KÄLTESTER TAG</div><div className="hd-rec-val">{rec.coldestDay.value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C <span>· {fmtRecordDate(rec.coldestDay.dateISO)}</span></div></div>
          </div>
        )}
        {rec.wettestDay && (
          <div className="hd-reccard">
            <span className="hd-rec-ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 15 A5 5 0 0 1 8 5.6 A6 6 0 0 1 18 8 A3.5 3.5 0 0 1 17.5 15 Z" stroke="#3A6FA8" strokeWidth="1.5" strokeLinejoin="round" /><line x1="10" y1="18" x2="9" y2="21" stroke="#3A6FA8" strokeWidth="1.5" strokeLinecap="round" /><line x1="15" y1="18" x2="14" y2="21" stroke="#3A6FA8" strokeWidth="1.5" strokeLinecap="round" /></svg></span>
            <div><div className="hd-rec-lab">NASSESTER TAG</div><div className="hd-rec-val">{Math.round(rec.wettestDay.value)} mm <span>· {fmtRecordDate(rec.wettestDay.dateISO)}</span></div></div>
          </div>
        )}
      </div>
      <div className="hd-readout-foot">Der Klimastreifen ist als Bild/SVG exportierbar (Profi-Panel „Vergleichen / Profi"). Zeitraum unten per Slider eingrenzbar.</div>
    </aside>
  );
}

// ============================ Rückblick — Drill (Desktop) ============================

function ExploreDrill({ days, settings, patch, available, normalPeriod }: {
  days: DailyRecord[]; settings: HistorySettings; patch: (p: Partial<HistorySettings>) => void;
  available: { min: number; max: number } | null; normalPeriod: NormalPeriod;
}) {
  const gran = settings.exploreGran;
  const y = Math.min(available?.max ?? settings.exploreYear, Math.max(available?.min ?? settings.exploreYear, settings.exploreYear));
  const m = settings.exploreMonth;
  const d = settings.exploreDay;
  const dayLabel = new Date(`${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}T12:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  const yi = useMemo(() => yearInsight(days, y, normalPeriod), [days, y, normalPeriod]);

  const items = [
    { id: 'day' as const, badge: 'T', title: 'Tag', sub: `${dayLabel} · Stundenverlauf` },
    { id: 'month' as const, badge: 'M', title: 'Ganzer Monat', sub: `${monthName(m)} ${y} · Tag für Tag` },
    { id: 'year' as const, badge: 'J', title: 'Ganzes Jahr', sub: `${y} · Monate + Kalender` },
  ];

  return (
    <aside className="hd-drill hd-scroll" aria-label="Ebenen">
      <span className="hd-field-lab">Ebenen · Drill</span>
      <div className="hd-drill-list">
        {items.map((it) => {
          const on = gran === it.id;
          return (
            <button key={it.id} type="button" className={`hd-drill-item${on ? ' hd-drill-item--on' : ''}`} aria-current={on} onClick={() => patch({ exploreGran: it.id })}>
              <span className="hd-drill-badge">{it.badge}</span>
              <span className="hd-drill-tx"><b>{it.title}</b><em>{it.sub}</em></span>
              {!on && <span className="hd-drill-arr"><IconArrow size={15} /></span>}
            </button>
          );
        })}
      </div>
      <span className="hd-field-lab hd-readout-sep">Jahr {y} · Kenntage</span>
      <div className="hd-drill-chips">
        {yi.n ? (
          <>
            <span className="hd-drill-chip">{yi.summerDays} Sommertage</span>
            <span className="hd-drill-chip">{yi.hotDays} Hitzetage</span>
            <span className="hd-drill-chip">{yi.tropicalNights} Tropennächte</span>
            <span className="hd-drill-chip">{yi.frostDays} Frosttage</span>
            <span className="hd-drill-chip">{yi.iceDays} Eistage</span>
          </>
        ) : <span className="hd-drill-chip">Keine Jahresdaten</span>}
      </div>
      <div className="hd-drill-foot">Klick auf Monat/Kalender-Zelle drillt zwischen Jahr → Monat → Tag. Kein Konto, keine Tracker.</div>
    </aside>
  );
}

// ============================ MOBILE ============================

function MobileBrandHead({ loc, onWechseln }: { loc: HistoryLocation | null; onWechseln?: () => void }) {
  return (
    <header className="hd-m-modehead">
      <div className="hd-m-brand">
        <span className="rt-nav-logo-mark hd-brandmark" aria-hidden="true" style={{ width: 22, height: 22 }} />
        <div>
          <div className="hd-m-brand-eyebrow">KLIMA-RÜCKBLICK</div>
          <div className="hd-m-brand-loc">{loc ? `${flagForCountry(loc.country ?? 'DE')} ${shortLoc(loc.name)}` : 'Standort wählen'}</div>
        </div>
      </div>
      {loc && onWechseln && <button type="button" className="hd-m-switch" onClick={onWechseln}>Wechseln</button>}
    </header>
  );
}

function MobileHeader({ eyebrow, title, accent, onBack }: { eyebrow: string; title: string; accent: 'steel' | 'terra'; onBack: () => void }) {
  return (
    <header className="hd-m-header">
      <button type="button" className="hd-m-back" onClick={onBack} aria-label="Zurück zur Modus-Wahl"><IconChevronLeft /></button>
      <div className="hd-m-htext">
        <div className={`hd-m-eyebrow hd-m-eyebrow--${accent}`}>{eyebrow}</div>
        <div className="hd-m-title">{title}</div>
      </div>
    </header>
  );
}

function MobileModeChoice({ available, warmingDelta, hottest, onPick }: {
  available: { min: number; max: number } | null; warmingDelta: number | null;
  hottest: { value: number; dateISO: string } | null; onPick: (m: HistoryMode, gran?: ExploreGranularity) => void;
}) {
  const span = available ? `${available.min}–${available.max}` : null;
  const deltaTxt = warmingDelta != null ? `${warmingDelta > 0 ? '+' : ''}${warmingDelta.toLocaleString('de-DE', { maximumFractionDigits: 1 })} °C` : null;
  return (
    <>
      <span className="hd-m-lead-lab">Was möchtest du sehen?</span>
      <p className="hd-m-lead">Zwei Sichten auf die Archivdaten{span ? ` · ${span}` : ''}.</p>
      <div className="hd-m-tiles">
        <div className="hd-m-tile" role="group" aria-label="Rückblick">
          <div className="hd-m-tile-art"><svg viewBox="0 0 260 140" style={{ width: 180, height: 'auto' }} fill="none" aria-hidden="true"><rect x="34" y="36" width="96" height="80" rx="9" stroke="#3A6FA8" strokeWidth="2.5" /><line x1="34" y1="57" x2="130" y2="57" stroke="#3A6FA8" strokeWidth="2.5" /><rect x="50" y="68" width="22" height="19" rx="3" fill="#3A6FA8" /><path d="M 150 94 Q 180 60 202 80 T 238 56" stroke="#2C2A26" strokeWidth="2.5" strokeLinecap="round" /><circle cx="238" cy="56" r="5" fill="#2C2A26" /></svg></div>
          <div className="hd-m-tile-body">
            <span className="hd-m-tile-eyebrow hd-m-tile-eyebrow--steel">SEKTION 1 · RÜCKBLICK</span>
            <div className="hd-m-tile-title">Wie war das Wetter?</div>
            <p className="hd-m-tile-desc">Tag, Monat oder Jahr nachschlagen — mit Stundenverlauf.</p>
            <div className="hd-m-tile-picks">
              <button type="button" className="hd-m-tile-pick hd-m-tile-pick--on" onClick={() => onPick('explore', 'day')}>Tag</button>
              <button type="button" className="hd-m-tile-pick" onClick={() => onPick('explore', 'month')}>Monat</button>
              <button type="button" className="hd-m-tile-pick" onClick={() => onPick('explore', 'year')}>Jahr</button>
            </div>
          </div>
        </div>
        <button type="button" className="hd-m-tile hd-m-tile--terra" onClick={() => onPick('change')}>
          <div className="hd-m-tile-art">
            <svg viewBox="0 0 210 100" style={{ width: 180, height: 'auto' }} aria-hidden="true">{['#3A6FA8', '#7AA0C2', '#BFD0DC', '#E8E0CC', '#EAD3A8', '#E3B679', '#DD9A57', '#D68A4E', '#CE6E3C', '#C0492F', '#B03B28', '#A83424'].map((f, i) => <rect key={i} x={6 + i * 14} y="20" width="12" height="60" rx="1.5" fill={f} />)}<path d="M 8 64 Q 100 58 200 34" stroke="#2C2A26" strokeWidth="2.2" fill="none" strokeLinecap="round" /></svg>
            <span className="hd-m-tile-flag">Empfohlen</span>
          </div>
          <div className="hd-m-tile-body">
            <span className="hd-m-tile-eyebrow hd-m-tile-eyebrow--terra">SEKTION 2 · VERÄNDERUNG</span>
            <div className="hd-m-tile-title">Wie hat sich das Wetter verändert?</div>
            <p className="hd-m-tile-desc">Klimastreifen, Abweichungen, Kenntage &amp; Trends.</p>
            <div className="hd-m-tile-foot">
              {deltaTxt ? <span className="hd-m-tile-stat"><b>{deltaTxt}</b><em>Trend{span ? ` · ${span}` : ''}</em></span> : <span />}
              <span className="hd-m-tile-open">Öffnen →</span>
            </div>
          </div>
        </button>
        {hottest && <p className="hd-m-lead" style={{ fontSize: 11 }}>Heißester Tag: {fmtRecordDate(hottest.dateISO)} · {Math.round(hottest.value)} °C</p>}
      </div>
    </>
  );
}

function MobileChange({ settings, patch, days, workDays, meta, normal, normalPeriod, range, available, recordSet }: {
  settings: HistorySettings; patch: (p: Partial<HistorySettings>) => void; days: DailyRecord[]; workDays: DailyRecord[];
  meta: ReturnType<typeof variableMeta>; normal: number | null; normalPeriod: { label: string }; range: { start: number; end: number };
  available: { min: number; max: number } | null; recordSet: ReturnType<typeof records> | null;
}) {
  const CHIP_VARS = VARIABLES;
  const CHIP_CHARTS: { id: ChartType; label: string }[] = [
    { id: 'stripes', label: 'Streifen' }, { id: 'anomaly', label: 'Anomalie' }, { id: 'kenntage', label: 'Kenntage' },
    { id: 'records', label: 'Rekorde' }, { id: 'dayband', label: 'Tagesband' }, { id: 'line', label: 'Verlauf' },
    { id: 'calendar', label: 'Kalender' }, { id: 'box', label: 'Box' }, { id: 'windrose', label: 'Windrose' },
  ];
  return (
    <>
      <div className="hd-m-chiprow">{CHIP_VARS.map((v) => <button key={v.key} type="button" className={`hd-m-chip${settings.variable === v.key ? ' hd-m-chip--terra' : ''}`} onClick={() => patch({ variable: v.key })}>{v.short}</button>)}</div>
      <div className="hd-m-chiprow">{CHIP_CHARTS.map((c) => <button key={c.id} type="button" className={`hd-m-chip${settings.chart === c.id ? ' hd-m-chip--ink' : ''}`} onClick={() => patch({ chart: c.id })}>{c.label}</button>)}</div>
      <ChangeCenter settings={settings} patch={patch} days={days} workDays={workDays} meta={meta} normal={normal} normalPeriod={normalPeriod} range={range} available={available} onDrillDate={() => { }} />
      {recordSet && <MobileRecords rec={recordSet} />}
    </>
  );
}

function MobileRecords({ rec }: { rec: ReturnType<typeof records> }) {
  return (
    <>
      <span className="hd-m-seclab">Rekorde seit Messbeginn</span>
      <div className="hd-reclist">
        {rec.warmestDay && <div className="hd-reccard hd-reccard--hot"><span className="hd-rec-ico" style={{ fontSize: 15 }}>🔥</span><div><div className="hd-rec-lab">HEISSESTER TAG</div><div className="hd-rec-val">{rec.warmestDay.value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C · {fmtRecordDate(rec.warmestDay.dateISO)}</div></div></div>}
        {rec.coldestDay && <div className="hd-reccard"><span className="hd-rec-ico"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 3 V21 M5 8 L12 3 L19 8" stroke="#3A6FA8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span><div><div className="hd-rec-lab">KÄLTESTER TAG</div><div className="hd-rec-val">{rec.coldestDay.value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C · {fmtRecordDate(rec.coldestDay.dateISO)}</div></div></div>}
        {rec.wettestDay && <div className="hd-reccard"><span className="hd-rec-ico"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M7 15 A5 5 0 0 1 8 5.6 A6 6 0 0 1 18 8 A3.5 3.5 0 0 1 17.5 15 Z" stroke="#3A6FA8" strokeWidth="1.5" strokeLinejoin="round" /></svg></span><div><div className="hd-rec-lab">NASSESTER TAG</div><div className="hd-rec-val">{Math.round(rec.wettestDay.value)} mm · {fmtRecordDate(rec.wettestDay.dateISO)}</div></div></div>}
      </div>
    </>
  );
}

// ============================ Embed-Diagramm (schlank) ============================

function EmbedChange({ settings, workDays, meta, normal }: {
  settings: HistorySettings; workDays: DailyRecord[]; meta: ReturnType<typeof variableMeta>; normal: number | null;
}) {
  const yr = useMemo(() => yearly(workDays, settings.variable), [workDays, settings.variable]);
  const anos = useMemo(() => anomalies(yr, normal), [yr, normal]);
  const span = anomalySpan(anos.map((a) => a.anomaly));
  return (
    <section className="hi-charts">
      <span className="rt-eyebrow hi-eyebrow">{chartTitle('stripes', meta.label)}</span>
      <Stripes buckets={yr} unit={meta.unit} showLabels={settings.showLabels} onPick={() => { }} />
      <DivLegend span={span} />
    </section>
  );
}

// ============================ Onboarding / Ortssuche ============================

function Onboarding({ onPick, deck }: { onPick: (l: HistoryLocation) => void; deck: boolean }) {
  if (!deck) {
    return (
      <section className="rt-section hi-lead" style={{ ['--intro-accent']: 'var(--hi-warm)' } as CSSProperties}>
        <div className="hi-lead-copy">
          <span className="rt-eyebrow hi-eyebrow">Wetterhistorie · Klima-Rückblick</span>
          <h1 className="hi-lead-title">Wie hat sich das Wetter bei dir verändert?</h1>
          <p className="intro-body">Echte Archivdaten für deinen Ort in Deutschland, Österreich oder der Schweiz.</p>
          <div className="hi-lead-search"><LocationSearch onPick={onPick} /></div>
        </div>
      </section>
    );
  }
  return (
    <>
      <span className="hd-onboard-eyebrow">Wetterhistorie · Klima-Rückblick</span>
      <h1 className="hd-onboard-title">Wie hat sich das Wetter bei dir verändert?</h1>
      <p className="hd-onboard-lead">Echte Archivdaten für deinen Ort in Deutschland, Österreich oder der Schweiz — danach wählst du, was du sehen willst.</p>
      <ul className="hd-onboard-caps">
        {HIST_INTRO_CAPS.map((c) => <li key={c}><span className="m"><IconCheck /></span>{c}</li>)}
      </ul>
      <div className="hd-onboard-search">
        <span className="hd-field-lab">Standort</span>
        <LocationSearch onPick={onPick} />
      </div>
    </>
  );
}

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
        <svg className="ev-search-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="8" cy="8" r="6" /><line x1="13" y1="13" x2="17" y2="17" strokeLinecap="round" /></svg>
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

// ============================ Diagramm-Helfer (geteilt) ============================

function DataTable({ buckets, meta }: { buckets: ReturnType<typeof aggregate>; meta: ReturnType<typeof variableMeta> }) {
  const rows = buckets.filter((b) => b.value != null);
  if (!rows.length) return null;
  return (
    <div className="hi-datatable" role="region" aria-label="Datentabelle">
      <table>
        <caption className="hi-sr-caption">{meta.label} in {meta.unit} je Periode</caption>
        <thead><tr><th scope="col">Periode</th><th scope="col">{meta.label} ({meta.unit})</th><th scope="col">Tage</th></tr></thead>
        <tbody>{rows.map((b) => <tr key={b.key}><th scope="row">{b.label}</th><td>{(b.value as number).toLocaleString('de-DE', { maximumFractionDigits: 1 })}</td><td>{b.n}</td></tr>)}</tbody>
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
      {KENNTAGE.map((k) => <button key={k.key} type="button" role="tab" aria-selected={settings.kenntag === k.key} className={`hi-seg${settings.kenntag === k.key ? ' is-on' : ''}`} onClick={() => patch({ kenntag: k.key, kenntagThreshold: null })}>{k.label}</button>)}
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
      <div className="hi-divlegend-scale"><span>−{span.toFixed(1)} °C</span><span>Normal</span><span>+{span.toFixed(1)} °C</span></div>
    </div>
  );
}

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
      <button type="button" className="hd-howto-link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Wie lese ich das?</button>
      {open && <span className="hi-howto-pop" role="tooltip">{HOWTO[type]}</span>}
    </span>
  );
}

function Provenance({ kind, label, compact, station, deck }: { kind: 'measured' | 'reanalysis'; label: string; compact?: boolean; station?: { name: string; distanceKm: number; elevation: number | null } | null; deck?: boolean }) {
  const badge = kind === 'reanalysis' ? 'Reanalyse' : 'Messung';
  if (compact) return <p className={`hi-provenance hi-provenance-compact${deck ? ' hd-prov' : ''}`}><span className={deck ? 'hd-prov-badge' : 'hi-prov-badge'}>{badge}</span>Quelle: {label}{station ? ` · ${station.name}` : ''}</p>;
  const stationTxt = station ? ` Nächste Station: ${station.name} (${station.distanceKm} km${station.elevation != null ? `, ${station.elevation} m` : ''}).` : '';
  return (
    <p className={deck ? 'hd-prov' : 'hi-provenance'}>
      <span className={deck ? 'hd-prov-badge' : 'hi-prov-badge'}>{badge}</span>
      Datenquelle: {label}.{stationTxt} {kind === 'reanalysis'
        ? 'ERA5 ist eine modellierte Reanalyse (mit Beobachtungen assimiliert), keine reine Stationsmessung — in Berglagen können lokale Abweichungen auftreten.'
        : 'Tageswerte aus Stationsmessungen (für DE überwiegend DWD). Die Werte stammen von der nächstgelegenen Station.'} Lücken werden nicht stillschweigend interpoliert.
    </p>
  );
}
