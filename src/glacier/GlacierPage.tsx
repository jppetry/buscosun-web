/**
 * GL-1 — Glacier page, Command-Deck (D-27), design `reference/gletscher-desktop-lage.dc.html` (+ mobile). Rail 62 · topbar 60 ·
 * dock 250 · map + chart · readout 400; mobile: header, map, metric chips, one scrolling column.
 *
 * Stage 1 shows everything that needs no model: inventories with their reference year, length and mass series of the measuring
 * networks, official numbers verbatim with date and source. Melt and snow-cover metrics are visible but LOCKED (no placeholder
 * numbers). Data: `buscosun-glacier` via `glacierClient.ts` (raw-first pointer, CDN + raw hedge, contract checks).
 * `glacierDeck.css` is imported only here (lazy chunk).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import { FeatureRail, type RailFeature } from '../nav/featureRail';
import ShareButton from '../share/ShareButton';
import { useAppNav } from '../router/useAppNav';
import { useMediaQuery } from '../mobile/useIsMobile';
import {
  glacierBasesFrom, loadCatalog, loadIndex, loadOfficial, loadOutline, loadPoints, loadSatLatest, loadStatus, loadSummary,
  type GlacierPointsDoc, type GlacierSatIndex, type GlacierSatLatest, type GlacierSummary, type LoadedCatalog,
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
import GlacierLageChart, { type ChartKind } from './GlacierLageChart';
import { CountryCards, ReportList, Rhythm, SelectedGlacier, type CountryFacts } from './GlacierReadout';
import { OriginChip, LockNote } from './GlacierParts';
import './glacierDeck.css';

export interface GlacierPageProps {
  initial: GlacierUrlState;
  invalid: string[];
  onUrlState: (s: GlacierUrlState) => void;
  onGlacier: (s: GlacierUrlState, initial: boolean) => void;
  popState?: (GlacierUrlState & { key: string }) | null;
}

/** The sheet (five tabs) is package GL-4; until then a selected glacier is shown on the situation page and the button says so. */
export const GLACIER_BRIEF_READY = false;
const REFRESH_MS = 30 * 60_000;

type Loaded = {
  build: string; cat: LoadedCatalog; points: GlacierPointsDoc; summary: GlacierSummary | null; official: GlacierOfficialItem[]; builtAt: string; satIndex: GlacierSatIndex | null;
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
  const [sat, setSat] = useState<ReadonlyMap<string, GlacierSatLatest>>(() => new Map());

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
        setLoad({ s: 'ready', d: { build, cat, points, summary, official: official ?? [], builtAt: index.builtAt, satIndex: index.sat ?? null } });
        // the satellite line is optional: a failure leaves "Ausaperung" locked and every other number untouched
        if (index.sat) loadSatLatest(index.sat, cat.byId, ac.signal, bases).then((m) => { if (!ac.signal.aborted) setSat(m); }, () => { /* stays locked */ });
      } catch (e) { if ((e as Error)?.name !== 'AbortError') setLoad({ s: 'error', why: 'Der Datenspeicher antwortet nicht.' }); }
    };
    void run();
    const t = window.setInterval(() => { setNowMs(Date.now()); void run(); }, REFRESH_MS);
    return () => { ac.abort(); window.clearInterval(t); };
  }, [bases]);

  // browser back/forward between states
  useEffect(() => {
    if (!popState) return;
    setLand(popState.land); setMetric(popState.m); setQuery(popState.q); setSelSeg(popState.glacier ?? popState.sel);
  }, [popState]);

  // --- Derived ---------------------------------------------------------------------------------------------------
  const d = load.s === 'ready' ? load.d : null;
  const glaciers = d?.cat.catalog.glaciers ?? [];
  const selId = selSeg ? glacierIdOfSegment(selSeg) : null;
  const sel = selId && d ? d.cat.byId.get(selId) ?? null : null;

  const caps = useMemo(() => ({ sat: sat.size > 0, melt: false }), [sat]);
  const defs = useMemo(() => defsFor(caps), [caps]);
  const satCtx = useMemo(() => ({ sat, nowMs, defs }), [sat, nowMs, defs]);
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
    ...initial, glacier: null, tab: 'heute', land, m: metric, q: query, sel: selSeg, ...patch,
  }), [initial, land, metric, query, selSeg]);
  useEffect(() => { onUrlState(stateNow()); }, [stateNow, onUrlState]);

  const pick = useCallback((id: string) => setSelSeg(glacierSegmentOf(id)), []);
  const openBrief = () => { if (GLACIER_BRIEF_READY && selSeg) onGlacier(stateNow({ glacier: selSeg, sel: null }), false); };
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
      <button type="button" className="gl-btn is-primary" disabled={!GLACIER_BRIEF_READY} onClick={openBrief}
        title={GLACIER_BRIEF_READY ? undefined : 'Der Steckbrief mit Heute, Saison, Langzeit, Tour und Quellen folgt (GL-4)'}>
        Steckbrief{GLACIER_BRIEF_READY ? ' öffnen' : ' folgt (GL-4)'}
      </button>
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
      padding={isMobile ? { top: 0, bottom: 70, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 300 }} onMap={(m) => { mapRef.current = m; }} />
  );
  const zoom = !isMobile && (
    <div className="gl-zoom">
      <button type="button" aria-label="Hineinzoomen" onClick={() => mapRef.current?.zoomIn()}>+</button>
      <button type="button" aria-label="Herauszoomen" onClick={() => mapRef.current?.zoomOut()}>−</button>
    </div>
  );
  const dock = (
    <GlacierDock query={query} onQuery={setQuery} land={land} onLand={setLand} metric={metric} onMetric={setMetric} rows={rows} selectedId={selId} onPick={pick}
      refYears={`CH ${fmtRefYear('2013-2018')} · AT 2021–23 · DE 2025`} defs={defs}
      hint={def.locked ? 'gesperrt' : metric === 'laenge' ? 'größter Rückzug zuerst' : metric === 'ausaperung' ? 'größte Ausaperung zuerst' : 'größter Verlust zuerst'} />
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
      <div className="gl-chart-note">Gemessen (GLAMOS für CH, WGMS/ÖAV für AT). Deutschland hat in diesen Netzen keine laufende Reihe. Der Saisonverlauf der Schmelze folgt mit der Schmelzrechnung (GL-3).</div>
    </section>
  );
  const readout = (
    <aside className="gl-readout" aria-label="DACH-Lage und amtliche Berichte">
      <div className="gl-readout-head"><h2>DACH-Lage</h2><p>Amtliche Zahlen, jeweils mit Stand und Quelle</p></div>
      <div className="gl-readout-scroll">
        {sel && <SelectedGlacier g={sel} latest={d?.summary?.latest[sel.id]} sat={sat.get(sel.id)} nowMs={nowMs} defs={defs} />}
        {d && <CountryCards items={d.official} facts={facts} />}
        {d && <ReportList items={d.official} />}
        <Rhythm />
        <div className="gl-foot-note">Flächen tragen das Bezugsjahr ihres Inventars und sind zwischen den Ländern nicht gleichzeitig. Amtliche Sätze stehen wörtlich mit Quelle und Datum; Schmelze und Schneegrenze folgen, sobald ihre Eichung besteht. Kein amtliches Warnprodukt, keine Tourenfreigabe.</div>
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
      <span className="gl-chip is-model is-idle" title="Schmelzrechnung (buscosun Fusion): folgt mit GL-3"><i aria-hidden="true" />Modell · nicht aktiv</span>
      {satChip}
      <span className="gl-chip is-measured" title={`Jüngste amtliche Meldung je Messnetz; Längen- und Massenreihen von GLAMOS, ÖAV und WGMS reichen bis ${maxYear ?? '–'}`}><i aria-hidden="true" />Messung · {officialStand ?? `Reihen bis ${maxYear ?? '–'}`}</span>
    </div>
  );
  const topbar = (
    <header className="gl-topbar">
      <div className="gl-title"><b>Gletscher</b><span>DACH · rund {fmt0(glaciers.length || 2203)} Gletscher im Atlas</span></div>
      {!isMobile && stand}
      <div className="gl-grow" />
      {!isMobile && <span className="gl-season">{season.label}</span>}
      <ShareButton className="gl-btn" text={isMobile ? undefined : 'Teilen'} compact={isMobile} />
    </header>
  );
  const rail = (
    <FeatureRail active={'glacier' as RailFeature} onOpenFeature={(id) => nav.openFeature(id)} onHome={nav.goHome}
      navClass="gl-rail gl-rail-desktop" btnClass="gl-rail-btn" activeClass="is-active" spacerClass="gl-rail-spacer" />
  );

  if (isMobile) {
    return (
      <div className="gl-root is-mobile">
        <div className="gl-main">
          {topbar}
          <div className="gl-body">
            <div className="gl-center">
              <section className="gl-map" aria-label="Karte">
                {map}{note}
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
              {sel && <SelectedGlacier g={sel} latest={d?.summary?.latest[sel.id]} sat={sat.get(sel.id)} nowMs={nowMs} defs={defs} />}
              {chart}
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
            <section className="gl-map" aria-label="Karte aller Gletscher">
              {map}{zoom}{legend}{pill}{note}
              <div className="gl-attrib">Karte: OpenStreetMap-Mitwirkende · Inventare je nach Land</div>
            </section>
            {chart}
          </div>
          {readout}
        </div>
      </div>
    </div>
  );
}
