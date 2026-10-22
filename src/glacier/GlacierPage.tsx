/**
 * GL-1 — Glacier page, Command-Deck (D-27), design `reference/gletscher-desktop-lage.dc.html` (+ mobile). Rail 62 · topbar 60 ·
 * dock 250 · map + chart · readout 400; mobile: header, map, metric chips, one scrolling column.
 *
 * Stage 1 shows everything that needs no model: inventories with their reference year, length and mass series of the measuring
 * networks, official numbers verbatim with date and source. Melt and snow-cover metrics are visible but LOCKED (no placeholder
 * numbers). Data: `buscosun-data` `glacier/v1` via `glacierClient.ts` (raw-first pointer, CDN + raw hedge, contract checks).
 * `glacierDeck.css` is imported only here (lazy chunk).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import { FeatureRail, type RailFeature } from '../nav/featureRail';
import ShareButton from '../share/ShareButton';
import { useAppNav } from '../router/useAppNav';
import { useMediaQuery } from '../mobile/useIsMobile';
import {
  glacierBasesFrom, loadCatalog, loadFeed, loadIndex, loadMelt, loadOfficial, loadOutline, loadPoints, loadSatLatest, loadStatus, loadSummary,
  type GlacierIndex, type GlacierPointsDoc, type GlacierSatIndex, type GlacierSatLatest, type GlacierSummary, type LoadedCatalog,
} from './glacierClient';
import { GLACIER_COUNTRIES, GLACIER_SAT_MAX_AGE_DAYS, type GlacierCountry, type GlacierOfficialItem } from './glacierContract';
import {
  GLACIER_RAMPS, defsFor, displayName, fmt0, fmtKm2, fmtRefYear, inLand, matchesQuery, metricValue, officialStandLabel, rankGlaciers, satAgeDays, seasonStatus,
} from './glacierView';
import {
  glacierIdOfSegment, glacierSegmentOf, GLACIER_METRICS, type GlacierLand, type GlacierMetric, type GlacierUrlState,
} from './glacierState';
import GlacierMap, { type GlacierMapFeature, type RegionBoxes } from './GlacierMap';
import GlacierDock from './GlacierDock';
import GlacierList from './GlacierList';
const GlacierBrief = lazy(() => import('./GlacierBrief'));
import GlacierLageChart, { type ChartKind } from './GlacierLageChart';
import { CountryCards, ReportList, Rhythm, type CountryFacts } from './GlacierReadout';
import { FeedList, FollowList, StatusList } from './GlacierFeedView';
import { readFavs, writeFavs, toggleFav, readLast, writeLast, newSinceLastVisit } from './glacierFollow';
import type { GlacierFeedEvent } from './glacierFeedContract';
import { glacierMeltFresh } from './glacierContract';
import { OriginChip, LockNote } from './GlacierParts';
import './glacierDeck.css';

export interface GlacierPageProps {
  initial: GlacierUrlState;
  invalid: string[];
  onUrlState: (s: GlacierUrlState) => void;
  onGlacier: (s: GlacierUrlState, initial: boolean) => void;
  popState?: (GlacierUrlState & { key: string }) | null;
}

/** The sheet (five tabs, GL-4): `/gletscher/<slug>`; the situation page's button opens it. */
export const GLACIER_BRIEF_READY = true;
const REFRESH_MS = 30 * 60_000;

type Loaded = {
  build: string; cat: LoadedCatalog; points: GlacierPointsDoc; summary: GlacierSummary | null; official: GlacierOfficialItem[]; builtAt: string; satIndex: GlacierSatIndex | null; melt: GlacierIndex['melt'] | null; feed: GlacierIndex['feed'] | null;
};

export default function GlacierPage({ initial, onUrlState, onGlacier, popState }: GlacierPageProps) {
  const nav = useAppNav();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const bases = useMemo(() => glacierBasesFrom(), []);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [load, setLoad] = useState<{ s: 'loading' } | { s: 'error'; why: string } | { s: 'killed'; why: string } | { s: 'ready'; d: Loaded }>({ s: 'loading' });
  const [land, setLand] = useState<GlacierLand>(initial.land);
  const [metric, setMetric] = useState<GlacierMetric>(initial.m);
  const [query, setQuery] = useState(initial.q);
  const [selSeg, setSelSeg] = useState<string | null>(initial.glacier ?? initial.sel);
  const [chartKind, setChartKind] = useState<ChartKind>('ba');
  const [searchOpen, setSearchOpen] = useState(false);
  const [stage, setStage] = useState<'map' | 'dossier'>(initial.dossier ? 'dossier' : 'map');
  const [sat, setSat] = useState<ReadonlyMap<string, GlacierSatLatest>>(() => new Map());
  const [meltToday, setMeltToday] = useState<ReadonlyMap<string, [number, number, number]> | null>(null);
  const [meltRun, setMeltRun] = useState<{ runAt: string } | null>(null);
  const [feed, setFeed] = useState<GlacierFeedEvent[] | null>(null);
  const [favs, setFavs] = useState<string[]>(() => readFavs());
  const lastVisit = useRef<number | null | undefined>(undefined);
  if (lastVisit.current === undefined) lastVisit.current = readLast();
  useEffect(() => { writeLast(Date.now()); }, []);
  const [sheet, setSheet] = useState<Pick<GlacierUrlState, 'tab' | 't' | 'v' | 'e' | 'o'>>({ tab: initial.tab, t: initial.t, v: initial.v, e: initial.e, o: initial.o });
  const briefSeg = initial.glacier;
  const allow3d = useMemo(() => { try { return new URLSearchParams(window.location.search).get('gl3d') !== '0'; } catch { return true; } }, []);
  // overview map: 3D terrain by default, 2D stays one click away; `?gl3d=0` or a terrain failure keeps it flat
  const [mapView, setMapView] = useState<'2d' | '3d'>(allow3d ? '3d' : '2d');
  const [map3dFailed, setMap3dFailed] = useState(false);

  // --- Data -----------------------------------------------------------------------------------------------------
  useEffect(() => {
    const ac = new AbortController();
    const run = async () => {
      try {
        const [status, index] = await Promise.all([loadStatus(ac.signal, bases), loadIndex(ac.signal, bases)]);
        if (status?.killed) { setLoad({ s: 'killed', why: status.killReason ?? 'Die Gletscher-Daten sind abgeschaltet.' }); return; }
        if (!index) { setLoad({ s: 'error', why: 'Der Datenspeicher antwortet nicht (index.json).' }); return; }
        const build = index.static.build;
        const [cat, points, summary, official] = await Promise.all([
          loadCatalog(build, ac.signal, bases), loadPoints(build, ac.signal, bases), loadSummary(build, ac.signal, bases), loadOfficial(build, ac.signal, bases),
        ]);
        if (!cat || !points) { setLoad({ s: 'error', why: 'Katalog oder Punktliste nicht ladbar.' }); return; }
        setLoad({ s: 'ready', d: { build, cat, points, summary, official: official ?? [], builtAt: index.builtAt, satIndex: index.sat ?? null, melt: index.melt ?? null, feed: index.feed ?? null } });
        // the satellite line is optional: a failure leaves "Ausaperung" locked and every other number untouched
        if (index.sat) loadSatLatest(index.sat, cat.byId, ac.signal, bases).then((m) => { if (!ac.signal.aborted) setSat(m); }, () => { /* stays locked */ });
        // the melt line (GL-3): only a FRESH run (≤ 30 h) colours the map; its index is today's value, never a unit
        if (index.melt && glacierMeltFresh(Date.parse(index.melt.runAt), Date.now())) {
          void loadMelt(index.melt.run, new Set(cat.byId.keys()), ac.signal, bases).then((doc) => {
            if (!doc || ac.signal.aborted) return;
            const day = Math.min(doc.glaciers[0]?.idx.length ? doc.glaciers[0].idx.length - 1 : 0, Math.max(0, Math.floor((Date.now() - Date.parse(doc.runAt)) / 86_400_000)));
            setMeltToday(new Map(doc.glaciers.map((r) => [r.id, r.idx[day]])));
            setMeltRun({ runAt: doc.runAt });
          }, () => { /* the metric stays locked */ });
        }
        // the change feed (GL-5)
        if (index.feed) void loadFeed(index.feed, official ?? [], new Set(cat.byId.keys()), ac.signal, bases).then((ev) => { if (!ac.signal.aborted) setFeed(ev); }, () => { /* no feed list */ });
      } catch (e) { if ((e as Error)?.name !== 'AbortError') setLoad({ s: 'error', why: 'Der Datenspeicher antwortet nicht.' }); }
    };
    void run();
    const t = window.setInterval(() => { setNowMs(Date.now()); void run(); }, REFRESH_MS);
    return () => { ac.abort(); window.clearInterval(t); };
  }, [bases]);

  // browser back/forward between states
  useEffect(() => {
    if (!popState) return;
    setLand(popState.land); setMetric(popState.m); setQuery(popState.q); setSelSeg(popState.glacier ?? popState.sel); setStage(popState.dossier ? 'dossier' : 'map');
    setSheet({ tab: popState.tab, t: popState.t, v: popState.v, e: popState.e, o: popState.o });
  }, [popState]);

  // --- Derived ---------------------------------------------------------------------------------------------------
  const d = load.s === 'ready' ? load.d : null;
  const glaciers = d?.cat.catalog.glaciers ?? [];
  const selId = selSeg ? glacierIdOfSegment(selSeg) : null;
  const sel = selId && d ? d.cat.byId.get(selId) ?? null : null;

  const caps = useMemo(() => ({ sat: sat.size > 0, melt: meltToday != null }), [sat, meltToday]);
  const defs = useMemo(() => defsFor(caps), [caps]);
  const satCtx = useMemo(() => ({ sat, nowMs, defs, melt: meltToday }), [sat, nowMs, defs, meltToday]);
  const values = useMemo(() => {
    const m = new Map<string, ReturnType<typeof metricValue>>();
    if (!d) return m;
    for (const g of glaciers) m.set(g.id, metricValue(metric, d.summary?.latest[g.id], g, satCtx));
    return m;
  }, [d, glaciers, metric, satCtx]);

  const features = useMemo<GlacierMapFeature[]>(() => {
    if (!d) return [];
    const out: GlacierMapFeature[] = [];
    for (const [id, lat, lon, k, km2] of d.points.rows) {
      const g = d.cat.byId.get(id);
      if (!g || !inLand(g, land) || !matchesQuery(g, query)) continue;
      out.push({ id, lon, lat, km2, k, b: values.get(id)?.bucket ?? -1, name: g.name });
    }
    return out;
  }, [d, land, query, values]);

  const regionBoxes = useMemo<RegionBoxes>(() => {
    const r: RegionBoxes = {};
    for (const g of glaciers) {
      const b = r[g.region] ?? [g.lon, g.lat, g.lon, g.lat];
      r[g.region] = [Math.min(b[0], g.lon), Math.min(b[1], g.lat), Math.max(b[2], g.lon), Math.max(b[3], g.lat)];
    }
    for (const k of Object.keys(r)) { const b = r[k]; r[k] = [b[0] - 0.12, b[1] - 0.08, b[2] + 0.12, b[3] + 0.08]; }
    return r;
  }, [glaciers]);

  const rows = useMemo(() => rankGlaciers(glaciers, d?.summary ?? null, metric, land, query, isMobile ? 6 : 8, satCtx), [glaciers, d, metric, land, query, isMobile, satCtx]);
  const allRanked = useMemo(() => (isMobile ? [] : rankGlaciers(glaciers, d?.summary ?? null, metric, land, query, Infinity, satCtx)), [isMobile, glaciers, d, metric, land, query, satCtx]);
  const allRest = useMemo(() => {
    if (isMobile) return [];
    const inRank = new Set(allRanked.map((r) => r.g.id));
    return glaciers.filter((g) => !inRank.has(g.id) && inLand(g, land) && matchesQuery(g, query))
      .sort((a, b) => b.area.km2 - a.area.km2 || (a.id < b.id ? -1 : 1))
      .map((g) => ({ g, value: values.get(g.id) }));
  }, [isMobile, allRanked, glaciers, land, query, values]);
  const facts = useMemo<Record<GlacierCountry, CountryFacts>>(() => {
    const out = {} as Record<GlacierCountry, CountryFacts>;
    for (const c of GLACIER_COUNTRIES) {
      const l = glaciers.filter((g) => g.country === c);
      out[c] = { n: l.length, km2: l.reduce((s, g) => s + g.area.km2, 0), refYear: c === 'CH' ? '2013–2018' : c === 'AT' ? '2021–2023' : '2025', source: c === 'CH' ? 'SGI2016' : c === 'AT' ? 'AGI 5' : 'BAdW' };
    }
    return out;
  }, [glaciers]);

  const def = defs[metric];
  const season = seasonStatus(nowMs);
  const officialStand = d ? officialStandLabel(d.official, nowMs) : null;
  const maxYear = d?.summary ? Math.max(...GLACIER_COUNTRIES.flatMap((c) => d.summary!.countries[c].ba.map((r) => r[0]).concat(d.summary!.countries[c].len.map((r) => r[0])))) : null;

  // --- URL state -------------------------------------------------------------------------------------------------
  const stateNow = useCallback((patch: Partial<GlacierUrlState> = {}): GlacierUrlState => ({
    ...initial, glacier: briefSeg, ...sheet, land, m: metric, q: query, sel: briefSeg ? null : selSeg, dossier: !briefSeg && !isMobile && stage === 'dossier', ...patch,
  }), [initial, briefSeg, sheet, land, metric, query, selSeg, isMobile, stage]);
  useEffect(() => { onUrlState(stateNow()); }, [stateNow, onUrlState]);

  const pick = useCallback((id: string) => setSelSeg(glacierSegmentOf(id)), []);
  const follow = useCallback((id: string) => setFavs((cur) => { const next = toggleFav(cur, id); writeFavs(next); return next; }), []);
  const fresh = useMemo(() => newSinceLastVisit(feed ?? [], favs, lastVisit.current ?? null), [feed, favs]);
  const favValue = useCallback((id: string) => { const g = d?.cat.byId.get(id); if (!g) return null; const v = metricValue(metric, d?.summary?.latest[id], g, satCtx); return v.v == null ? null : { text: v.text ?? '', origin: defs[metric].origin, label: defs[metric].label }; }, [d, metric, satCtx, defs]);
  const lists = d && (
    <>
      <FollowList ids={favs} byId={d.cat.byId} valueText={favValue} onPick={pick} onUnfollow={follow} fresh={fresh} />
      {feed && <FeedList events={feed} onPick={pick} cardWeek={d.feed?.card ?? null} cardUrl={d.feed?.card ? `${bases.cdn}/card/${d.feed.card}.png` : null} />}
      <StatusList items={d.official} />
    </>
  );
  const openBrief = () => { if (GLACIER_BRIEF_READY && selSeg) onGlacier(stateNow({ glacier: selSeg, sel: null, tab: 'heute', t: 'heute', v: '2d', e: ['o', 's'], o: 0 }), false); };
  const closeBrief = () => onGlacier(stateNow({ glacier: null, sel: briefSeg, tab: 'heute', t: 'heute', v: '2d', e: ['o', 's'], o: 0 }), false);
  const bucketOf = useCallback((id: string) => values.get(id)?.bucket ?? -1, [values]);
  const loadOutlineFn = useCallback((region: string, level: 1 | 2 | 3) => (d ? loadOutline(d.build, region, level, undefined, bases) : Promise.resolve(null)), [d, bases]);

  // --- Pieces ----------------------------------------------------------------------------------------------------
  const selVal = sel ? values.get(sel.id) : null;
  const ramp = GLACIER_RAMPS[def.ramp];
  const bounds = def.bounds;
  const rampLabels = [`<${bounds[0]}`, `${bounds[0]}`, `${bounds[1]}`, `${bounds[2]}`, `≥${bounds[3]}`];

  const pill = sel && (
    <div className="gl-pill" role="region" aria-label="Ausgewählter Gletscher">
      <div className="gl-pill-head"><b>{displayName(sel)}</b><span className="gl-chip is-official"><i aria-hidden="true" />Klasse {sel.klass}</span></div>
      <small>{sel.country} · {fmtKm2(sel.area.km2)} · Inventar {fmtRefYear(sel.area.refYear)}</small>
      <div className="gl-pill-val">
        {selVal?.v != null ? <><span className="gl-num" data-origin={def.origin}>{selVal.text}</span><OriginChip origin={def.origin} /><small>{def.label} · {selVal.period}</small></>
          : <small>{def.locked ? <LockNote>{def.label}: gesperrt</LockNote> : selVal?.reason ?? ''}</small>}
      </div>
      <div className="gl-pill-actions">
      <button type="button" className={`gl-star${favs.includes(sel.id) ? ' is-on' : ''}`} aria-pressed={favs.includes(sel.id)} aria-label={favs.includes(sel.id) ? `${displayName(sel)} nicht mehr folgen` : `${displayName(sel)} folgen`} onClick={() => follow(sel.id)}>{favs.includes(sel.id) ? '★' : '☆'}</button>
      {!isMobile && <button type="button" className="gl-btn" onClick={() => setStage('dossier')}>Dossier</button>}
      <button type="button" className="gl-btn is-primary" disabled={!GLACIER_BRIEF_READY} onClick={openBrief}
        title={GLACIER_BRIEF_READY ? undefined : 'Der Steckbrief mit Heute, Saison, Langzeit, Tour und Quellen folgt (GL-4)'}>
        Steckbrief{GLACIER_BRIEF_READY ? ' öffnen' : ' folgt (GL-4)'}
      </button>
      </div>
    </div>
  );
  const legend = (
    <div className="gl-legend" aria-label="Legende">
      <div className="gl-legend-head"><b>{def.legendTitle}</b><OriginChip origin={def.origin} /></div>
      {def.locked ? <LockNote>{def.locked}</LockNote> : (
        <div className="gl-ramp" aria-hidden="true">{ramp.map((c, i) => <div key={c}><i style={{ background: c }} /><span>{rampLabels[i]}</span></div>)}</div>
      )}
      <div className="gl-legend-row"><span className="gl-dash" />{def.noValue}</div>
      <div className="gl-legend-row">Kreisgröße = Fläche laut Inventar</div>
    </div>
  );
  const note = load.s === 'loading' ? <div className="gl-map-note" role="status">Gletscher werden geladen …</div>
    : load.s === 'error' ? <div className="gl-map-note" role="status"><strong>Keine Daten.</strong> {load.why}</div>
    : load.s === 'killed' ? <div className="gl-map-note" role="status"><strong>Keine Daten.</strong> {load.why}</div> : null;

  const map = d && (
    <GlacierMap features={features} ramp={def.ramp} selectedId={selId} onSelect={pick} regionBoxes={regionBoxes} loadOutline={loadOutlineFn} bucketOf={bucketOf}
      padding={isMobile ? { top: 0, bottom: 70, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 300 }} onMap={(m) => { mapRef.current = m; }}
      view={map3dFailed ? '2d' : mapView} onView3dFailed={() => setMap3dFailed(true)} />
  );
  const viewSeg = d && allow3d && !map3dFailed && (
    <div className="gl-seg2 gl-view-seg" role="group" aria-label="Ansicht der Karte">
      <button type="button" aria-pressed={mapView === '2d'} onClick={() => setMapView('2d')}>2D</button>
      <button type="button" aria-pressed={mapView === '3d'} onClick={() => setMapView('3d')}>3D</button>
    </div>
  );
  const zoom = !isMobile && (
    <div className="gl-zoom">
      <button type="button" aria-label="Hineinzoomen" onClick={() => mapRef.current?.zoomIn()}>+</button>
      <button type="button" aria-label="Herauszoomen" onClick={() => mapRef.current?.zoomOut()}>−</button>
    </div>
  );
  const rankHint = metric === 'laenge' ? 'größter Rückzug zuerst' : metric === 'ausaperung' ? 'größte Ausaperung zuerst' : metric === 'schmelze' ? 'stärkste Schmelze zuerst · ab 0,1 km²' : 'größter Verlust zuerst';
  const dock = (
    <GlacierDock query={query} onQuery={setQuery} land={land} onLand={setLand} metric={metric} onMetric={setMetric}
      refYears={`CH ${fmtRefYear('2013-2018')} · AT 2021–23 · DE 2025`} defs={defs} />
  );
  const chart = d?.summary && (
    <section className="gl-chart-sec" aria-label="Messreihen je Land">
      <div className="gl-chart-head">
        <div>
          <h2>{chartKind === 'ba' ? 'Jahresbilanz der Messgletscher' : 'Längenänderung der Messgletscher'}</h2>
          <p>{chartKind === 'ba' ? 'Mittel über die Gletscher mit Massenbilanz je Land, in m Wasseräquivalent' : 'Mittel über die vermessenen Zungen je Land, in m je Messjahr'} · <OriginChip origin="measured" /></p>
        </div>
        <div className="gl-seg2" role="group" aria-label="Größe des Diagramms">
          <button type="button" aria-pressed={chartKind === 'ba'} onClick={() => setChartKind('ba')}>Bilanz</button>
          <button type="button" aria-pressed={chartKind === 'len'} onClick={() => setChartKind('len')}>Länge</button>
        </div>
      </div>
      <div className="gl-legend-lines" aria-hidden="true"><span><i style={{ background: '#1E87A8' }} />CH</span><span><i style={{ background: '#B5602C' }} />AT</span><span><i style={{ background: '#6B5BB8' }} />DE</span></div>
      <GlacierLageChart summary={d.summary} kind={chartKind} />
      <div className="gl-chart-note">Gemessen (WGMS-Datenbank, für die Schweiz die Reihen des Gletschermessnetzes GLAMOS; für Österreich WGMS und ÖAV). Deutschland hat in diesen Netzen keine laufende Reihe. Der Saisonverlauf der Schmelze folgt mit der Schmelzrechnung (GL-3).</div>
    </section>
  );
  const readout = (
    <aside className="gl-readout" aria-label="Gletscher der Auswahl">
      <div className="gl-readout-head"><h2>Gletscher</h2><p>Alle Gletscher der Auswahl, jeder Wert mit Herkunft</p></div>
      <div className="gl-readout-scroll">
        {d && <GlacierList ranked={allRanked} rest={allRest} def={def} hint={rankHint} selectedId={selId} onPick={pick} />}
        {d && <FollowList ids={favs} byId={d.cat.byId} valueText={favValue} onPick={pick} onUnfollow={follow} fresh={fresh} />}
      </div>
    </aside>
  );
  const satNewest = sat.size ? [...sat.values()].reduce((m, s) => (s.date > m ? s.date : m), '') : '';
  const satAge = satNewest ? satAgeDays(satNewest, nowMs) : null;
  const satChip = satNewest && satAge != null
    ? satAge > GLACIER_SAT_MAX_AGE_DAYS
      ? <span className="gl-chip is-satellite is-idle" title="Sentinel-2: die jüngste klare Szene ist älter als 20 Tage — keine Zahl, kein Farbwert"><i aria-hidden="true" />Sentinel-2 · keine klare Szene seit {satAge} Tagen</span>
      : <span className="gl-chip is-satellite" title="Sentinel-2 L2A: jüngste klare Szene, Maske ≥ 70 % klar"><i aria-hidden="true" />Sentinel-2 · jüngste Szene {satNewest.slice(8, 10)}.{satNewest.slice(5, 7)}.</span>
    : <span className="gl-chip is-satellite is-idle" title="Sentinel-2-Szenen: noch keine klare Szene im Datenspeicher"><i aria-hidden="true" />Sentinel-2 · nicht aktiv</span>;
  const stand = (
    <div className="gl-stand" aria-label="Stand je Herkunft">
      {meltRun
        ? <span className="gl-chip is-model" title="Schmelzindex (buscosun Fusion, Temperaturindex-Modell, ohne Einheit): jüngster Lauf"><i aria-hidden="true" />Modell · Lauf {meltRun.runAt.slice(8, 10)}.{meltRun.runAt.slice(5, 7)}. {meltRun.runAt.slice(11, 13)} UTC</span>
        : <span className="gl-chip is-model is-idle" title="Schmelzrechnung (buscosun Fusion): kein frischer Lauf (älter als 30 Stunden oder nicht erreichbar)"><i aria-hidden="true" />Modell · nicht aktiv</span>}
      {satChip}
      <span className="gl-chip is-measured" title={`Jüngste amtliche Meldung je Messnetz; Längen- und Massenreihen aus dem WGMS (Schweiz: Meldungen des Messnetzes GLAMOS) und vom ÖAV reichen bis ${maxYear ?? '–'}`}><i aria-hidden="true" />Messung · {officialStand ?? `Reihen bis ${maxYear ?? '–'}`}</span>
    </div>
  );
  const topbar = (
    <header className="gl-topbar">
      <a className="gl-brand" href="/" onClick={(e) => { e.preventDefault(); nav.goHome(); }} aria-label="Zur Startseite">
        <img src="/buscosun-mark.svg" width={isMobile ? 22 : 24} height={isMobile ? 22 : 24} alt="" /><span>buscosun</span>
      </a>
      <span className="gl-topdiv" aria-hidden="true" />
      <div className="gl-title"><b>Gletscher DACH</b><span>rund {fmt0(glaciers.length || 2199)} Gletscher im Atlas</span></div>
      {!isMobile && (
        <div className="gl-seg2 gl-stage-seg" role="group" aria-label="Bühne der Mitte">
          <button type="button" aria-pressed={stage === 'map'} onClick={() => setStage('map')}>Karte</button>
          <button type="button" aria-pressed={stage === 'dossier'} onClick={() => setStage('dossier')}>Dossier</button>
        </div>
      )}
      <div className="gl-grow" />
      {!isMobile && stand}
      {!isMobile && <span className="gl-season">{season.label}</span>}
      <ShareButton className="gl-share" text={isMobile ? undefined : 'Teilen'} compact={isMobile} />
    </header>
  );
  const rail = (
    <FeatureRail active={'glacier' as RailFeature} onOpenFeature={(id) => nav.openFeature(id)} onHome={nav.goHome}
      navClass="gl-rail gl-rail-desktop" btnClass="gl-rail-btn" activeClass="is-active" spacerClass="gl-rail-spacer" />
  );

  if (briefSeg) {
    const bg = d ? d.cat.byId.get(glacierIdOfSegment(briefSeg)) ?? null : null;
    return (
      <div className={`gl-root${isMobile ? ' is-mobile' : ''}`}>
        {!isMobile && rail}
        {load.s !== 'ready' ? (
          <div className="gl-main"><div className="gl-empty gl-sheet-state" role="status">{load.s === 'loading' ? 'Steckbrief wird geladen …' : <><strong>Keine Daten.</strong> {load.why}</>}</div></div>
        ) : !bg ? (
          <div className="gl-main"><div className="gl-empty gl-sheet-state" role="status"><strong>Diesen Gletscher gibt es im Atlas nicht.</strong> <button type="button" className="gl-btn" onClick={closeBrief}>Zur DACH-Lage</button></div></div>
        ) : (
          <Suspense fallback={<div className="gl-main"><div className="gl-empty gl-sheet-state" role="status">Steckbrief wird geladen …</div></div>}><GlacierBrief key={bg.id} g={bg} build={d!.build} byId={d!.cat.byId} satIndex={d!.satIndex} meltPointer={d!.melt} official={d!.official} nowMs={nowMs} isMobile={isMobile} bases={bases}
            state={sheet} onState={(patch) => setSheet((s) => ({ ...s, ...patch }))} onBack={closeBrief} allow3d={allow3d} followed={favs.includes(bg.id)} onFollow={() => follow(bg.id)} /></Suspense>
        )}
      </div>
    );
  }
  if (isMobile) {
    return (
      <div className="gl-root is-mobile">
        <div className="gl-main">
          {topbar}
          <div className="gl-body">
            <div className="gl-center">
              <section className="gl-map" aria-label="Karte">
                {map}{note}{viewSeg}
                <div className="gl-m-overlay"><span className="gl-season">{season.label}</span>{satChip}</div>
                <div className="gl-pill-slot">{pill}</div>
              </section>
            </div>
            <div className="gl-m-chips" role="group" aria-label="Karte färben nach">
              {GLACIER_METRICS.map((m) => <button key={m} type="button" aria-pressed={metric === m} disabled={!!defs[m].locked} onClick={() => setMetric(m)}>{defs[m].label}</button>)}
            </div>
            <div className="gl-readout-scroll gl-m-scroll">
              <div className="gl-m-only gl-m-legend">{legend}</div>
              <button type="button" className="gl-btn" onClick={() => setSearchOpen((v) => !v)} aria-expanded={searchOpen}>Gletscher suchen</button>
              {searchOpen && <input className="gl-input" type="search" placeholder="Name, Gebirge, Inventar-Nr. …" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Gletscher suchen" />}
              <div className="gl-m-cards">{d && <CountryCards items={d.official} facts={facts} />}</div>
              <h3 className="gl-h3">Rangliste · {def.label}</h3>
              {rows.length === 0 ? <div className="gl-empty">{def.locked ? 'Gesperrt — keine Zahl ohne Berechnung.' : 'Keine Gletscher mit Wert.'}</div> : (
                <ul className="gl-rank">{rows.map((r, i) => (
                  <li key={r.g.id}><button type="button" onClick={() => pick(r.g.id)}><span className="gl-r-n">{i + 1}</span><span className="gl-r-body"><b>{displayName(r.g)}</b><span>{r.g.country} · {fmtKm2(r.g.area.km2)} · {r.value.period}</span></span><span className="gl-r-v" data-origin={def.origin}>{r.value.text}</span></button></li>
                ))}</ul>
              )}
              {chart}
              {lists}
              {d && <ReportList items={d.official} />}
              <Rhythm />
              <div className="gl-foot-note">Flächen tragen das Bezugsjahr ihres Inventars. Kein amtliches Warnprodukt, keine Tourenfreigabe.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="gl-root">
      {rail}
      <div className="gl-main">
        {topbar}
        <div className="gl-body">
          {dock}
          <div className="gl-center">
            <section className={`gl-map${stage === 'dossier' ? ' is-offstage' : ''}`} aria-label="Karte aller Gletscher" aria-hidden={stage === 'dossier' ? true : undefined}>
              {map}{zoom}{viewSeg}{legend}{pill}{note}
              <div className="gl-attrib">Karte: OpenStreetMap-Mitwirkende · Inventare je nach Land</div>
            </section>
            {stage === 'dossier' && (
              <div className="gl-ds-stage">
                {sel && d ? (
                  <Suspense fallback={<div className="gl-empty" role="status">Dossier wird geladen …</div>}>
                    <GlacierBrief key={sel.id} layout="dossier" g={sel} build={d.build} byId={d.cat.byId} satIndex={d.satIndex} meltPointer={d.melt} official={d.official} nowMs={nowMs} isMobile={false} bases={bases}
                      state={sheet} onState={(patch) => setSheet((s) => ({ ...s, ...patch }))} onBack={() => setStage('map')} allow3d={allow3d} followed={favs.includes(sel.id)} onFollow={() => follow(sel.id)}
                      onOpenSheet={GLACIER_BRIEF_READY ? openBrief : undefined} />
                  </Suspense>
                ) : (
                  <div className="gl-ds-emptycard">
                    <span className="gl-label">Dossier</span>
                    <p><strong>Kein Gletscher markiert.</strong> Ein Klick auf eine Kachel rechts oder auf einen Gletscher der Karte öffnet hier sein Dossier: Heute, Saison, Langzeit, Tour und Quellen, dazu Karte und Steckbrief.</p>
                    <button type="button" className="gl-btn" onClick={() => setStage('map')}>Zur Karte</button>
                  </div>
                )}
              </div>
            )}
          </div>
          {readout}
        </div>
      </div>
    </div>
  );
}
