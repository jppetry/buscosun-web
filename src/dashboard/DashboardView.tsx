/**
 * Wetter-Dashboard (Phase DB, audit/dashboard.md) — die zweite Ansicht der Wetterkarte (`?ansicht=dashboard`).
 *
 * Lazy-Chunk: nichts hiervon liegt im Start- oder im Karten-Chunk. Datenfluss (§5.3):
 *   1. buscosun Fusion (neueste Stufe, Cube-Pfad) — der einzige kritische Pfad; progressiv first → core → update.
 *   2. nach der ersten Fusion-Ausgabe: Warnungen, UV, Pollen (klein).
 *   3. erst wenn die Kachel sichtbar wird: Radar-Nowcast/Zellen/Hagel, Gelände-Schnitt, ICON-D2-Kasten.
 * Die Kacheln zeichnen `buildDashboardVM(...)` — rein, geprüft von `verify:dashboard`. Im Entwicklungsmodus liefert
 * `?dbfixture=vorlage` die Werte der Vorlage (Pixel-Diff, §5.7); im Produktions-Bau ist der Zweig entfernt.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import './dashboard.css';
import ViewToggle, { type DashboardView as View } from './ViewToggle';
import { DASH_PARTS, DASH_PART_LABEL, type DashPart, type DashRange } from './dashUrl';
import type { Country, Location } from '../types';
import { buildDashboardVM, shortName } from './model/build';
import type { CellsIn, DashboardVM, DashInputs, HailIn, IconD2In, NowcastIn, PlaceIn, PollenIn, TerrainIn, UvIn, WarningsIn } from './model/types';
import { subscribeDashboardForecast, retryDashboardForecast, coversWindow, type ForecastState } from './data/forecastStore';
import { loadCells, loadHail, loadIconD2, loadNowcast, loadPollen, loadTerrain, loadUv, loadWarnings, warnChannel } from './data/extras';
import { WindRoseTile } from './windRose';
import { NowcastDetail } from './nowcastDetail';
import { DayDetail } from './dayDetail';
import { FeatureRail } from '../nav/featureRail';
import ShareButton from '../share/ShareButton';
import { NowcastTile, NowCard, Val, WarningStrip } from './tiles';
import { ForecastZone } from './ForecastZone';
import { TerrainField } from './TerrainField';
import { pfLogFrom } from '../pointForecast/pfFlags';

interface Props {
  place: Location | null;
  country: Country;
  range: DashRange;
  onRange: (r: DashRange) => void;
  onSelectView: (v: View) => void;
  onSelectLocation: (l: Location) => void;
  onBack: () => void;
  /** Werkzeug-Rail wie auf der Kartenebene: springt auf die Seite des Werkzeugs. */
  onOpenFeature?: (id: string) => void;
  /** E-DB-24: sichtbarer Reiter — Überblick (Reihe 1 + Prognose) oder Details (alles weitere). */
  part?: DashPart;
  onPart?: (p: DashPart) => void;
  /**
   * E-DB-20: called once when the dashboard no longer needs the network for its forecast — whole window there, the
   * fusion failed, or no place is chosen. The route loads the map's JS in the background then.
   */
  onSettled?: () => void;
}

const REFRESH_EXTRAS_MS = 5 * 60_000;

export default function DashboardView(props: Props) {
  const fixtureOn = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dbfixture') === 'vorlage';
  return fixtureOn ? <FixtureDashboard {...props} /> : <LiveDashboard {...props} />;
}

// ---------------------------------------------------------------------------
// Live
// ---------------------------------------------------------------------------

const initWarnings = (country: Country): WarningsIn => ({ state: 'loading', channel: warnChannel(country), items: [], stampMs: null, note: null });
const INIT_UV: UvIn = { state: 'loading', city: null, distanceKm: null, days: [], note: null };
const INIT_POLLEN: PollenIn = { state: 'loading', region: null, species: [], note: null };
const INIT_NOWCAST: NowcastIn = { state: 'loading', sources: [], horizonLabel: '…', frames: [], slotMs: null, note: null };
const INIT_CELLS: CellsIn = { state: 'loading', text: null };
const INIT_HAIL: HailIn = { state: 'loading', text: null };
const initTerrain = (halfKm: 10 | 20 | 50): TerrainIn => ({ state: 'loading', halfKm, axisDeg: 225, profile: [], stations: [], outside: [], note: null });
const INIT_ICOND2: IconD2In = { state: 'loading', thunderMax: null, rotationMax: null, snowFresh24: null, gustMax: null, run: null, note: null };

function useInView<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '300px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

function useNow(periodMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), periodMs); return () => window.clearInterval(t); }, [periodMs]);
  return now;
}

function LiveDashboard(props: Props) {
  const { place: loc, range } = props;
  const place: PlaceIn | null = useMemo(() => (loc ? { name: loc.name, lat: loc.lat, lon: loc.lon, country: loc.country } : null), [loc?.name, loc?.lat, loc?.lon, loc?.country]);
  const nowMs = useNow();
  const [fc, setFc] = useState<ForecastState | null>(null);
  const [warnings, setWarnings] = useState<WarningsIn>(() => initWarnings(props.country));
  const [uv, setUv] = useState<UvIn>(INIT_UV);
  const [pollen, setPollen] = useState<PollenIn>(INIT_POLLEN);
  const [nowcast, setNowcast] = useState<NowcastIn>(INIT_NOWCAST);
  const [cells, setCells] = useState<CellsIn>(INIT_CELLS);
  const [hail, setHail] = useState<HailIn>(INIT_HAIL);
  const [halfKm, setHalfKm] = useState<10 | 20 | 50>(10);
  const [terrain, setTerrain] = useState<TerrainIn>(() => initTerrain(10));
  const [iconD2, setIconD2] = useState<IconD2In>(INIT_ICOND2);
  const [axisDeg, setAxisDeg] = useState<number | null>(null);
  const [nowcastRef, nowcastSeen] = useInView<HTMLElement>();
  const [terrainRef, terrainSeen] = useInView<HTMLElement>();
  const [icond2Ref, icond2Seen] = useInView<HTMLElement>();
  const placeKey = place ? `${place.country}:${place.lat}:${place.lon}` : '';

  // Ortswechsel: alles zurück auf „lädt".
  useEffect(() => {
    setFc(null); setWarnings(initWarnings(place?.country ?? props.country)); setUv(INIT_UV); setPollen(INIT_POLLEN);
    setNowcast(INIT_NOWCAST); setCells(INIT_CELLS); setHail(INIT_HAIL); setTerrain(initTerrain(halfKm)); setIconD2(INIT_ICOND2); setAxisDeg(null);
    if (!place) return;
    return subscribeDashboardForecast(place, setFc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey]);

  const fusionReady = !!fc && fc.status !== 'loading';
  const s0 = fc?.fusion?.v2.axis.steps[0];
  // Schnittachse: einmal je Ort aus der Windrichtung der ersten Ausgabe (bei unbestimmter Richtung W → O).
  useEffect(() => {
    if (axisDeg != null || !fc?.fusion) return;
    const d = s0?.vars.windDir?.p50;
    setAxisDeg(typeof d === 'number' && Number.isFinite(d) ? Math.round(d) : 270);
  }, [fc?.fusion, axisDeg, s0]);

  // Staffel 2: Warnungen, UV, Pollen — nach der ersten Fusion-Ausgabe (nie vor dem t1-Chunk).
  useEffect(() => {
    if (!place || !fusionReady) return;
    const ac = new AbortController();
    const run = () => {
      loadWarnings(place, Date.now(), ac.signal).then(setWarnings).catch(() => {});
      loadUv(place, ac.signal).then(setUv).catch(() => {});
      loadPollen(place, ac.signal).then(setPollen).catch(() => {});
    };
    run();
    const t = window.setInterval(() => loadWarnings(place, Date.now(), ac.signal).then(setWarnings).catch(() => {}), REFRESH_EXTRAS_MS);
    return () => { ac.abort(); window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey, fusionReady]);

  // Staffel 3: nur bei Sichtbarkeit.
  useEffect(() => {
    if (!place || !fusionReady || !nowcastSeen) return;
    const ac = new AbortController();
    const run = () => {
      loadNowcast(place, Date.now(), ac.signal).then(setNowcast).catch(() => {});
      loadCells(place, ac.signal).then(setCells).catch(() => {});
      loadHail(place, Date.now(), ac.signal).then(setHail).catch(() => {});
    };
    run();
    const t = window.setInterval(run, REFRESH_EXTRAS_MS);
    return () => { ac.abort(); window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey, fusionReady, nowcastSeen]);

  useEffect(() => {
    if (!place || axisDeg == null || !terrainSeen) return;
    const ac = new AbortController();
    setTerrain(initTerrain(halfKm));
    loadTerrain(place, axisDeg, halfKm, ac.signal).then(setTerrain).catch(() => {});
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey, axisDeg, halfKm, terrainSeen]);

  useEffect(() => {
    if (!place || !fusionReady || !icond2Seen) return;
    const ac = new AbortController();
    loadIconD2(place, Date.now(), ac.signal).then(setIconD2).catch(() => {});
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey, fusionReady, icond2Seen]);

  const inputs: DashInputs = {
    nowMs, place, range,
    fusionState: fc?.status ?? 'loading', fusionError: fc?.error ?? null, fusion: fc?.fusion ?? null,
    warnings, uv, pollen, nowcast, cells, hail, terrain: { ...terrain, halfKm }, iconD2,
  };
  const vm = useMemo(() => buildDashboardVM(inputs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nowMs, place, range, fc, warnings, uv, pollen, nowcast, cells, hail, terrain, halfKm, iconD2]);

  const settledRef = useRef(false);
  const whole = !!fc?.fusion && coversWindow(fc.fusion);
  const { onSettled } = props;
  useEffect(() => {
    if (settledRef.current || !onSettled) return;
    if (!place || fc?.status === 'error' || whole) { settledRef.current = true; onSettled(); }
  }, [place, fc?.status, whole, onSettled]);

  // Messpunkte für die Latenzmessung (Performance-Timeline, kein Netz).
  const marked = useRef<string>('');
  useEffect(() => {
    const k = fc?.fusion?.emission ?? (fc?.fusion ? 'final' : '');
    if (k && !marked.current.includes(k)) { marked.current += `${k};`; performance.mark(`dbd:fusion:${k}`); }
  }, [fc?.fusion]);

  const retry = useCallback(() => { if (place) retryDashboardForecast(place); }, [place]);
  return (
    <DashboardPage
      {...props} vm={vm} onHalfKm={setHalfKm} onRetry={retry}
      refs={{ nowcast: nowcastRef, terrain: terrainRef, icond2: icond2Ref }}
      log={pfLogFrom(typeof window !== 'undefined' ? window.location.search : '') ? fc : null}
    />
  );
}

// ---------------------------------------------------------------------------
// Vorlagen-Fixture (nur Entwicklungsmodus)
// ---------------------------------------------------------------------------

function FixtureDashboard(props: Props) {
  const [vm, setVm] = useState<DashboardVM | null>(null);
  useEffect(() => { void import('./fixture').then((m) => setVm(m.templateVM())); }, []);
  if (!vm) return <div className="dbd-root" />;
  return <DashboardPage {...props} vm={vm} onHalfKm={() => {}} onRetry={() => {}} refs={null} log={null} />;
}

// ---------------------------------------------------------------------------
// Seite
// ---------------------------------------------------------------------------

type Refs = { nowcast: RefObject<HTMLElement | null>; terrain: RefObject<HTMLElement | null>; icond2: RefObject<HTMLElement | null> } | null;

function useTablet(): boolean {
  const q = '(min-width: 768px) and (max-width: 1279px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

function DashboardPage({ vm, range, onRange, onSelectView, onSelectLocation, onBack, onOpenFeature, onHalfKm, onRetry, refs, log, part = 'ueberblick', onPart }: Props & {
  vm: DashboardVM; onHalfKm: (km: 10 | 20 | 50) => void; onRetry: () => void; refs: Refs; log: ForecastState | null;
}) {
  const tablet = useTablet();
  // Uhr der Topbar im Format der Kartenebene (Zeit, Wochentag · Tag Monat)
  const clock = new Date(useNow(15_000));
  const clockTime = clock.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const clockDate = `${clock.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')} · ${clock.getDate()} ${clock.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')}`.toUpperCase();
  const [ncOpen, setNcOpen] = useState(false);
  const ncOpener = useRef<HTMLButtonElement>(null);
  const [dayIdx, setDayIdx] = useState<number | null>(null);
  const dayOpener = useRef<HTMLElement | null>(null);
  // Mobil sitzt der Chip „Über diese Ansicht" im Dashboard unten (dashboard.css) — Klasse am body, solange es offen ist.
  useEffect(() => { document.body.classList.add('dbd-active'); return () => document.body.classList.remove('dbd-active'); }, []);
  const placeName = vm.top.place.t ? (tablet ? shortName(vm.top.place.t) : vm.top.place.t) : null;
  const status = (
    <span className={`dbd-status is-${vm.top.status.tone === 'ok' ? 'ok' : vm.top.status.tone}`} data-origin="P05"><i /><span>{vm.top.status.text}</span></span>
  );
  const run = <>Lauf <Val v={vm.top.run} /> · Anker-Zeit <Val v={vm.top.anchorTime} /></>;
  // E-DB-24: beim Reiterwechsel an den Anfang (nicht beim ersten Zeichnen — ein geteilter Link behält seine Lage).
  const firstPart = useRef(true);
  useEffect(() => {
    if (firstPart.current) { firstPart.current = false; return; }
    window.scrollTo({ top: 0 });
  }, [part]);
  const showTabs = vm.status !== 'noplace' && !!onPart;
  return (
    <div className="dbd-root">
      <div className="dbd-shell">
      <FeatureRail
        active="map2d"
        onOpenFeature={(id) => onOpenFeature?.(id)}
        onHome={onBack}
        navClass="mdk-rail"
        btnClass="mdk-rail-btn"
        activeClass="is-active"
        homeBtnClass="mdk-rail-btn mdk-rail-bottom"
      />
      <div className="dbd-shell-main">
      {/* Desktop/Tablet: Topbar und Werkzeug-Rail wie auf der Kartenebene (mdk-*, Werte aus map/mapDeck.css, s. dashboard.css) */}
      <header className="mdk-topbar dbd-deckbar">
        <button type="button" className="mdk-brand" onClick={onBack} aria-label="Zur Startseite">
          <img className="mdk-brand-mark" src="/buscosun-mark.svg" width={26} height={26} alt="" />
          <span className="mdk-brand-name">buscosun</span>
        </button>
        <ViewToggle active="dashboard" onSelect={onSelectView} />
        <span className="mdk-topdiv" aria-hidden="true" />
        <DeckBarSearch placeholder={placeName ? `${placeName}${vm.top.elev.t ? ` · ${vm.top.elev.t}` : ''}` : 'Ort suchen …'} onSelect={onSelectLocation} />
        <div className="mdk-topright">
          <span className="dbd-run">{run}</span>
          {status}
          <div className="mdk-clock" aria-hidden="true">
            <div className="mdk-clock-time">{clockTime}</div>
            <div className="mdk-clock-date">{clockDate}</div>
          </div>
          <ShareButton className="mdk-share" />
        </div>
      </header>
      <header className="dbd-top">
        <div className="dbd-top-mobile-row">
          <button type="button" className="dbd-brand" onClick={onBack} aria-label="Zur Startseite"><img src="/buscosun-mark.svg" width={22} height={22} alt="" /><span>buscosun</span></button>
          {status}
        </div>
        <button type="button" className="dbd-brand" onClick={onBack} aria-label="Zur Startseite"><img src="/buscosun-mark.svg" width={24} height={24} alt="" /><span>buscosun</span></button>
        <ViewToggle active="dashboard" onSelect={onSelectView} />
        <DashSearch label={placeName ? `${placeName}${vm.top.elev.t ? ` · ${vm.top.elev.t}` : ''}` : 'Ort suchen …'} onSelect={onSelectLocation} />
        <ViewToggle active="dashboard" onSelect={onSelectView} variant="mobile" />
        <div className="dbd-top-right"><span className="dbd-run">{run}</span>{status}</div>
        <div className="dbd-run-mobile">{run}</div>
      </header>
      {showTabs && <DashTabs part={part} onPart={onPart!} />}

      <main className="dbd-content">
        {vm.status === 'noplace' ? (
          <section className="dbd-card dbd-sand-card dbd-state" aria-label="Kein Ort">
            <span className="dbd-eyebrow">KEIN ORT GEWÄHLT</span>
            <p>Wähle oben in der Suche einen Ort — das Dashboard zeigt dann buscosun Fusion für diesen Punkt: jetzt, 14 Tage, Nowcast und Gelände.</p>
          </section>
        ) : (
          <>
            <div className="dbd-panel" role={showTabs ? 'tabpanel' : undefined} id="dbd-panel-ueberblick" aria-labelledby={showTabs ? 'dbd-tab-ueberblick' : undefined} hidden={showTabs && part !== 'ueberblick'}>
            <div className="dbd-row1">
              {vm.status === 'error' ? (
                <section className="dbd-card dbd-sand-card dbd-now" aria-label="Fehler">
                  <span className="dbd-eyebrow">JETZT · BUSCOSUN FUSION NICHT ERREICHBAR</span>
                  <p className="dbd-empty">Der Punkt-Cube konnte nicht gelesen werden{vm.error ? ` (${vm.error})` : ''}. Es gibt bewusst keinen Rückfall auf andere Rechenwege.</p>
                  <button type="button" className="dbd-retry" onClick={onRetry}>Erneut versuchen</button>
                  <WarningStrip vm={vm.warning} />
                </section>
              ) : <NowCard vm={vm.now} warning={vm.warning} />}
              {/* Jan 20.10.: der Radar-Nowcast steht in der Mitte der ersten Reihe (vorher eigene Reihe darunter). */}
              <NowcastTile vm={vm.nowcast} rootRef={refs?.nowcast} onDetail={() => setNcOpen(true)} detailRef={ncOpener} />
              <WindRoseTile vm={vm.windRose} />
            </div>
            <ForecastZone vm={vm.zone} range={range} onRange={onRange} onDay={(i, el) => { dayOpener.current = el; setDayIdx(i); }} />
            {showTabs && (
              <button type="button" className="dbd-more" onClick={() => onPart!('details')}>
                <span className="dbd-more-title">Mehr zur Lage am Ort</span>
                <span className="dbd-more-list">Gelände</span>
              </button>
            )}
            </div>
            <div className="dbd-panel" role={showTabs ? 'tabpanel' : undefined} id="dbd-panel-details" aria-labelledby={showTabs ? 'dbd-tab-details' : undefined} hidden={showTabs && part !== 'details'}>
            <TerrainField vm={vm.terrain} onHalfKm={onHalfKm} rootRef={refs?.terrain} nowMs={vm.nowMs} />
            </div>
          </>
        )}
        <div className="dbd-footer">{vm.footer} · n. v. = nicht verfügbar (Grund im Tooltip)</div>
        {log && <div className="dbd-pflog">{JSON.stringify({ emissions: log.emissions, error: log.error, notes: vm.notes.slice(0, 12) }, null, 1)}</div>}
      </main>
      </div>
      </div>
      {dayIdx != null && vm.zone.days[dayIdx] && (
        <DayDetail days={vm.zone.days} index={dayIdx} onIndex={setDayIdx} onClose={() => { setDayIdx(null); dayOpener.current?.focus(); }} />
      )}
      {ncOpen && <NowcastDetail vm={vm.nowcastDetail} onClose={() => { setNcOpen(false); ncOpener.current?.focus(); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// E-DB-24: Reiter „Überblick | Details" — zweite Ebene unter dem Kopf (leiser als „Dashboard | Karte")
// ---------------------------------------------------------------------------

function DashTabs({ part, onPart }: { part: DashPart; onPart: (p: DashPart) => void }) {
  const btns = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + DASH_PARTS.length) % DASH_PARTS.length;
    onPart(DASH_PARTS[j]);
    btns.current[j]?.focus();
  };
  return (
    <div className="dbd-tabs">
      <div className="dbd-tablist" role="tablist" aria-label="Teile des Dashboards">
        {DASH_PARTS.map((p, i) => (
          <button key={p} ref={(el) => { btns.current[i] = el; }} type="button" role="tab" id={`dbd-tab-${p}`} aria-controls={`dbd-panel-${p}`}
            aria-selected={p === part} tabIndex={p === part ? 0 : -1} className={`dbd-tab${p === part ? ' is-active' : ''}`}
            onClick={() => { if (p !== part) onPart(p); }} onKeyDown={(e) => onKey(e, i)}>
            {DASH_PART_LABEL[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ortssuche (Nominatim über `geocodeDACH`, derselbe Weg wie die Kartensuche)
// ---------------------------------------------------------------------------

/** Ortssuche der Topbar im Aufbau der Kartenebene (`DeckSearch` in MapView): Enter sucht, ⌘K fokussiert, Treffer als Liste. */
function DeckBarSearch({ placeholder, onSelect }: { placeholder: string; onSelect: (l: Location) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Location[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const acRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const kd = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    document.addEventListener('keydown', kd);
    return () => document.removeEventListener('keydown', kd);
  }, []);
  const reset = () => { setHits([]); setErr(null); };
  const run = async () => {
    const query = q.trim();
    if (!query) return;
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setBusy(true);
    reset();
    try {
      const { geocodeDACH } = await import('../geocode');
      const found = await geocodeDACH(query, ac.signal);
      if (ac.signal.aborted) return;
      if (found.length === 0) setErr('Keine Ergebnisse in DE · AT · CH.');
      else if (found.length === 1) { onSelect(found[0]); setQ(''); }
      else setHits(found);
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      setErr(e instanceof Error ? e.message : 'Suche fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mdk-search">
      <div className="mdk-search-box">
        <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" /><line x1="12.5" y1="12.5" x2="16" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <input
          ref={inputRef}
          className="mdk-search-input"
          type="text"
          value={q}
          placeholder={placeholder}
          aria-label="Ort suchen"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void run(); }
            if (e.key === 'Escape') { setQ(''); reset(); }
          }}
          disabled={busy}
        />
        <span className="mdk-kbd" aria-hidden="true">⌘K</span>
      </div>
      {(hits.length > 0 || err) && (
        <div className="mdk-search-drop" role="listbox" aria-label="Suchergebnisse">
          {err && <div className="mdk-search-err">⚠ {err}</div>}
          {hits.map((h) => (
            <button key={`${h.lat},${h.lon}`} type="button" className="mdk-search-hit" role="option" aria-selected="false" onClick={() => { onSelect(h); setQ(''); reset(); }}>
              <span className="mdk-search-hit-cc">{h.country}</span>
              {h.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DashSearch({ label, onSelect }: { label: string; onSelect: (l: Location) => void }) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [hits, setHits] = useState<Location[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const acRef = useRef<AbortController | null>(null);
  const search = async () => {
    const query = q.trim();
    if (!query) return;
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setMsg('sucht …');
    try {
      const { geocodeDACH } = await import('../geocode');
      const r = await geocodeDACH(query, ac.signal);
      if (r.length === 1) { onSelect(r[0]); setQ(''); setHits(null); setMsg(null); (document.activeElement as HTMLElement | null)?.blur(); return; }
      setHits(r); setMsg(r.length ? null : 'Kein Ort in DE/AT/CH gefunden.');
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') setMsg('Suche gerade nicht möglich.');
    }
  };
  return (
    <div className="dbd-search">
      <label className="dbd-search-box">
        <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="#8B7355" strokeWidth="1.6" /><line x1="12.5" y1="12.5" x2="16" y2="16" stroke="#8B7355" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <input
          className="dbd-search-input"
          value={focus ? q : ''}
          placeholder={focus ? 'Ort suchen …' : label}
          aria-label={`Ort suchen (aktuell: ${label})`}
          size={Math.max(8, label.length)}
          onFocus={() => setFocus(true)}
          onBlur={() => window.setTimeout(() => { setFocus(false); setHits(null); setMsg(null); }, 150)}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void search(); if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
        />
      </label>
      {focus && (hits?.length || msg) ? (
        <div className="dbd-search-drop" role="listbox">
          {msg && <div className="dbd-search-msg">{msg}</div>}
          {hits?.map((h) => (
            <button key={`${h.lat},${h.lon}`} type="button" role="option" aria-selected="false" className="dbd-search-hit"
              onMouseDown={(e) => e.preventDefault()} onClick={() => { onSelect(h); setQ(''); setHits(null); (document.activeElement as HTMLElement | null)?.blur(); }}>
              {h.name} · {h.country}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
