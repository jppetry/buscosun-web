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
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import './dashboard.css';
import ViewToggle, { type DashboardView as View } from './ViewToggle';
import type { DashRange } from './dashUrl';
import type { Country, Location } from '../types';
import { buildDashboardVM, shortName } from './model/build';
import type { CellsIn, DashboardVM, DashInputs, HailIn, IconD2In, NowcastIn, PlaceIn, PollenIn, TerrainIn, UvIn, WarningsIn } from './model/types';
import { subscribeDashboardForecast, retryDashboardForecast, type ForecastState } from './data/forecastStore';
import { loadCells, loadHail, loadIconD2, loadNowcast, loadPollen, loadTerrain, loadUv, loadWarnings, warnChannel } from './data/extras';
import { ConfidenceCard, CloudsTile, IconD2Tile, NowcastTile, NowCard, PollenTile, UvTile, Val, WarningCard, WindTile } from './tiles';
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
const initTerrain = (halfKm: 20 | 50): TerrainIn => ({ state: 'loading', halfKm, axisDeg: 225, profile: [], stations: [], outside: [], note: null });
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
  const [halfKm, setHalfKm] = useState<20 | 50>(20);
  const [terrain, setTerrain] = useState<TerrainIn>(() => initTerrain(20));
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

function DashboardPage({ vm, range, onRange, onSelectView, onSelectLocation, onBack, onHalfKm, onRetry, refs, log }: Props & {
  vm: DashboardVM; onHalfKm: (km: 20 | 50) => void; onRetry: () => void; refs: Refs; log: ForecastState | null;
}) {
  const tablet = useTablet();
  // Mobil sitzt der Chip „Über diese Ansicht" im Dashboard unten (dashboard.css) — Klasse am body, solange es offen ist.
  useEffect(() => { document.body.classList.add('dbd-active'); return () => document.body.classList.remove('dbd-active'); }, []);
  const placeName = vm.top.place.t ? (tablet ? shortName(vm.top.place.t) : vm.top.place.t) : null;
  const status = (
    <span className={`dbd-status is-${vm.top.status.tone === 'ok' ? 'ok' : vm.top.status.tone}`} data-origin="P05"><i /><span>{vm.top.status.text}</span></span>
  );
  const run = <>Lauf <Val v={vm.top.run} /> · Anker-Zeit <Val v={vm.top.anchorTime} /></>;
  return (
    <div className="dbd-root">
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

      <main className="dbd-content">
        {vm.status === 'noplace' ? (
          <section className="dbd-card dbd-sand-card dbd-state" aria-label="Kein Ort">
            <span className="dbd-eyebrow">KEIN ORT GEWÄHLT</span>
            <p>Wähle oben in der Suche einen Ort — das Dashboard zeigt dann buscosun Fusion für diesen Punkt: jetzt, 14 Tage, Nowcast und Gelände.</p>
          </section>
        ) : (
          <>
            <div className="dbd-row1">
              {vm.status === 'error' ? (
                <section className="dbd-card dbd-sand-card dbd-now" aria-label="Fehler">
                  <span className="dbd-eyebrow">JETZT · BUSCOSUN FUSION NICHT ERREICHBAR</span>
                  <p className="dbd-empty">Der Punkt-Cube konnte nicht gelesen werden{vm.error ? ` (${vm.error})` : ''}. Es gibt bewusst keinen Rückfall auf andere Rechenwege.</p>
                  <button type="button" className="dbd-retry" onClick={onRetry}>Erneut versuchen</button>
                </section>
              ) : <NowCard vm={vm.now} />}
              <WarningCard vm={vm.warning} />
              <ConfidenceCard vm={vm.conf} />
            </div>
            <ForecastZone vm={vm.zone} range={range} onRange={onRange} />
            <div className="dbd-row3">
              <NowcastTile vm={vm.nowcast} rootRef={refs?.nowcast} />
              <CloudsTile vm={vm.clouds} />
              <WindTile vm={vm.wind} />
            </div>
            <TerrainField vm={vm.terrain} onHalfKm={onHalfKm} rootRef={refs?.terrain} />
            <div className="dbd-row5">
              <UvTile vm={vm.uv} />
              <PollenTile vm={vm.pollen} />
              <IconD2Tile vm={vm.icond2} rootRef={refs?.icond2} />
            </div>
          </>
        )}
        <div className="dbd-footer">{vm.footer} · n. v. = nicht verfügbar (Grund im Tooltip)</div>
        {log && <div className="dbd-pflog">{JSON.stringify({ emissions: log.emissions, error: log.error, notes: vm.notes.slice(0, 12) }, null, 1)}</div>}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ortssuche (Nominatim über `geocodeDACH`, derselbe Weg wie die Kartensuche)
// ---------------------------------------------------------------------------

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
