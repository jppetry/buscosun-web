/**
 * GL-4 — the glacier sheet (`/gletscher/<slug>`): Steckbrief left, map or 3D in the middle, five tabs on the right (Heute · Saison · Langzeit · Tour · Quellen);
 * mobile: map on top, tabs and content below. Design `reference/gletscher-desktop-steckbrief.dc.html` (+ mobile). State (tab, time point, view, layers,
 * outline year) lives in the URL via the page; everything else is derived here from the documents of `glacierSheetData.ts`.
 * The dossier (`layout="dossier"`) folds the five sections into three levels (pattern Brandradar): Heute · Satellit · Langzeit — the URL `tab`
 * names the level. The map carries a "Karte | Satellit" basemap (Esri imagery, as in the Brandradar) and a 10-m deep link to the Copernicus Browser.
 */
import { useEffect, useMemo, useState } from 'react';
import './glacierSheet.css';
import ShareButton from '../share/ShareButton';
import { GLACIER_COUNTRY_LABEL, GLACIER_REGIONS, type GlacierCatalogEntry, type GlacierOfficialItem } from './glacierContract';
import type { GlacierBases, GlacierIndex } from './glacierClient';
import { GLACIER_TABS, type GlacierTab, type GlacierUrlState, type GlacierLayer, type GlacierView } from './glacierState';
import { loadSheetData, type SheetData } from './glacierSheetData';
import GlacierSheetMap, { type SheetBasemap, type SheetSnow } from './GlacierSheetMap';
import { TabHeute, TabSaison, TabLangzeit, TabTour, TabQuellen } from './GlacierSheetTabs';
import GlacierHeuteBoard from './GlacierHeuteBoard';
import { fmt0, fmt2, fmtKm2, fmtRefYear, displayName, fmtSigned } from './glacierView';
import {
  areaChange, cumulativeLength, longestLength, massRows, latestMass, meltView, seasonSummary, sourceRows, dateDe, dateDeLong, STATE_TEXT, seriesCsv, type SeasonSummary,
} from './glacierSheetModel';
import type { GlacierSatIndex } from './glacierClient';

const TAB_LABEL: Record<GlacierTab, string> = { heute: 'Heute', saison: 'Saison', langzeit: 'Langzeit', tour: 'Tour', quellen: 'Quellen' };
/** The three levels of the dossier and the sections each one holds; the URL `tab` of a section names its level. */
const LEVELS: ReadonlyArray<{ tab: GlacierTab; title: string; sub: string; tabs: readonly GlacierTab[] }> = [
  { tab: 'heute', title: 'Heute', sub: 'Schmelze · Oberfläche · Tour', tabs: ['heute', 'tour'] },
  { tab: 'saison', title: 'Satellit', sub: 'Saison · Schneegrenze · Bilanz', tabs: ['saison'] },
  { tab: 'langzeit', title: 'Langzeit', sub: 'Reihen · Projektion · Quellen', tabs: ['langzeit', 'quellen'] },
];
const levelOf = (t: GlacierTab): number => Math.max(0, LEVELS.findIndex((l) => l.tabs.includes(t)));
/** Sentinel-2 L2A true colour (10 m) of one day in the Copernicus Browser — a deep link, no retrieval of ours (same pattern as the Brandradar). */
function copernicusUrl(lat: number, lon: number, dayIso: string): string {
  const u = new URL('https://browser.dataspace.copernicus.eu/');
  u.searchParams.set('zoom', '14'); u.searchParams.set('lat', lat.toFixed(4)); u.searchParams.set('lng', lon.toFixed(4));
  u.searchParams.set('themeId', 'DEFAULT-THEME'); u.searchParams.set('datasetId', 'S2_L2A_CDAS');
  u.searchParams.set('fromTime', `${dayIso}T00:00:00.000Z`); u.searchParams.set('toTime', `${dayIso}T23:59:59.999Z`); u.searchParams.set('dateMode', 'SINGLE');
  return u.toString();
}

export interface SheetProps {
  g: GlacierCatalogEntry;
  build: string;
  byId: ReadonlyMap<string, GlacierCatalogEntry>;
  satIndex: GlacierSatIndex | null;
  meltPointer: GlacierIndex['melt'] | null;
  official: readonly GlacierOfficialItem[];
  nowMs: number;
  isMobile: boolean;
  bases: GlacierBases;
  state: Pick<GlacierUrlState, 'tab' | 't' | 'v' | 'e' | 'o'>;
  onState: (patch: Partial<Pick<GlacierUrlState, 'tab' | 't' | 'v' | 'e' | 'o'>>) => void;
  onBack: () => void;
  allow3d: boolean;
  followed: boolean;
  onFollow: () => void;
  /** `dossier`: the same content in the centre of the situation page (all five sections at once, map and Steckbrief at the side). */
  layout?: 'page' | 'dossier';
  /** Dossier only: opens the full sheet `/gletscher/<slug>`. */
  onOpenSheet?: () => void;
}

export default function GlacierBrief({ g, build, byId, satIndex, meltPointer, official, nowMs, isMobile, bases, state, onState, onBack, allow3d, followed, onFollow, layout = 'page', onOpenSheet }: SheetProps) {
  const [data, setData] = useState<SheetData | null>(null);
  const [compare, setCompare] = useState<number | null>(null);
  const [snowShare, setSnowShare] = useState<number | null>(null);
  const [view3dFailed, setView3dFailed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<SheetBasemap>('satellit');

  useEffect(() => {
    const ac = new AbortController();
    setData(null); setCompare(null); setSnowShare(null); setLoadError(null);
    void loadSheetData({ g, build, byId, satIndex, meltPointer: meltPointer ?? null, signal: ac.signal, bases }).then((d) => { if (!ac.signal.aborted) setData(d); }, (e) => { if (!ac.signal.aborted && (e as Error)?.name !== 'AbortError') setLoadError(String((e as Error)?.message ?? e)); });
    return () => ac.abort();
  }, [g, build, byId, satIndex, meltPointer, bases]);

  const view: GlacierView = allow3d && !view3dFailed ? state.v : '2d';
  const year = useMemo(() => {
    if (!data) return null;
    const ys = [...data.seasons.keys()].sort();
    return ys.length ? ys[ys.length - 1] : null;
  }, [data]);
  const klass = g.klass === 'A' ? 'A' : 'B';
  const season: SeasonSummary | null = useMemo(() => (data && year != null && g.klass !== 'C' && g.country !== 'DE' ? seasonSummary(data.seasons.get(year), klass) : null), [data, year, g, klass]);
  const mass = useMemo(() => (data ? latestMass(massRows(data.series)) : null), [data]);
  const lengthSeries = useMemo(() => (data ? longestLength(data.series) : null), [data]);
  const length = useMemo(() => cumulativeLength(lengthSeries), [lengthSeries]);
  const area = useMemo(() => (data ? areaChange(data.series) : null), [data]);
  const mv = useMemo(() => (data ? meltView(data.melt?.doc ?? null, data.melt?.row ?? null, nowMs) : null), [data, nowMs]);
  const meltWhy = useMemo(() => {
    if (!data) return 'Wird geladen …';
    if (!meltPointer) return 'Der Datenspeicher nennt noch keinen Schmelzlauf.';
    if (data.missing.includes('Schmelzlauf')) return 'Der Schmelzlauf ist nicht ladbar.';
    if (!data.melt) return 'Für diesen Gletscher gibt es in diesem Lauf keine Zeile (kein Nachbar mit Antrieb im Umkreis von 60 km).';
    if (mv && !mv.fresh) return `Der letzte Schmelzlauf ist ${mv.ageH} Stunden alt (Grenze 30 Stunden).`;
    return null;
  }, [data, meltPointer, mv]);

  // time point: "heute" or the date of a clear scene of the newest season
  const scenes = season?.scenes ?? [];
  const selScene = state.t !== 'heute' ? scenes.find((s) => s.date === state.t) ?? null : null;
  const sceneForMap = selScene ?? season?.last ?? null;
  const ageOfMap = sceneForMap ? Math.floor((nowMs - Date.parse(`${sceneForMap.date}T12:00:00Z`)) / 86_400_000) : null;
  const snow: SheetSnow | null = sceneForMap && (ageOfMap ?? 99) <= 20 && (sceneForMap.state !== 1 || sceneForMap.sla != null)
    ? { sla: sceneForMap.sla ?? 0, lo: null, hi: null, state: sceneForMap.state, date: sceneForMap.date } : null;
  const epochs = data?.epochs ?? [];
  const earlier = epochs.length ? (state.o ? epochs.find((e) => e.year === state.o) ?? epochs[0] : epochs[0]) : null;
  const showEarlier = state.e.includes('o'), showSnow = state.e.includes('s');
  const toggleLayer = (l: GlacierLayer) => onState({ e: state.e.includes(l) ? state.e.filter((x) => x !== l) : [...state.e, l] });

  const rows = useMemo(() => (data ? sourceRows({ g, hasLength: !!length, hasMass: !!mass, area, melt: mv, season, clima: !!data.clima, proj: !!data.proj, anomaly: false, mass, lengthSeries, nowMs }) : []), [data, g, length, mass, area, mv, season, lengthSeries, nowMs]);

  const neighbourName = mv && mv.forcing !== 'own' ? displayName(byId.get(mv.forcing) ?? g) : null;
  const region = GLACIER_REGIONS[g.region]?.label ?? g.region;
  const startYear = mass && data ? Math.min(...massRows(data.series).map((r) => r.year)) : null;
  const sub = `${region} · ${GLACIER_COUNTRY_LABEL[g.country]}${g.lead ? ' · Leitgletscher' : ''}${startYear ? ` · Massenbilanz seit ${startYear - 1}/${String(startYear).slice(2)}` : ''}`;

  const tabBar = (
    <div className="gl-tabs" role="tablist" aria-label="Reiter des Steckbriefs">
      {GLACIER_TABS.map((t) => (
        <button key={t} type="button" role="tab" id={`gl-tab-${t}`} aria-selected={state.tab === t} aria-controls="gl-tabpanel" tabIndex={state.tab === t ? 0 : -1} onClick={() => onState({ tab: t })}
          onKeyDown={(e) => { const i = GLACIER_TABS.indexOf(t); const to = e.key === 'ArrowRight' ? GLACIER_TABS[(i + 1) % 5] : e.key === 'ArrowLeft' ? GLACIER_TABS[(i + 4) % 5] : null; if (to) { e.preventDefault(); onState({ tab: to }); requestAnimationFrame(() => document.getElementById(`gl-tab-${to}`)?.focus()); } }}>
          {TAB_LABEL[t]}
        </button>
      ))}
    </div>
  );
  const tabBody = (t: GlacierTab, d: SheetData) => (
    t === 'heute' ? <TabHeute g={g} melt={mv} meltWhy={meltWhy} season={season} nowMs={nowMs} neighbourName={neighbourName} />
    : t === 'saison' ? <TabSaison g={g} data={d} year={year} selDate={selScene?.date ?? null} mass={mass} />
    : t === 'langzeit' ? <TabLangzeit g={g} area={area} length={length} proj={d.proj} compareYear={earlier?.year ?? null} compareOn={compare != null} onCompare={(on) => setCompare(on ? 0.5 : null)} official={official} status={g.status ?? null} hasSeries={d.series.length > 0}
        onCsv={() => { const text = seriesCsv(g, d.series, new Date(nowMs).toISOString().slice(0, 10)); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = `${g.id}-reihen.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }} />
    : t === 'tour' ? <TabTour g={g} melt={mv} season={season} nowMs={nowMs} bandZ={g.z} />
    : <TabQuellen rows={rows} sources={d.sources} />
  );
  const notReady = loadError ? <div className="gl-empty" role="status"><strong>Keine Daten.</strong> Der Steckbrief ist nicht ladbar ({loadError}).</div> : !data ? <div className="gl-empty" role="status">Steckbrief wird geladen …</div> : null;
  const panel = notReady ?? (data && (
    <div id="gl-tabpanel" role="tabpanel" aria-labelledby={`gl-tab-${state.tab}`} data-tab={state.tab}>
      {data.missing.length > 0 && <p className="gl-fine gl-missing" role="note">Nicht ladbar: {data.missing.join(', ')}.</p>}
      {tabBody(state.tab, data)}
    </div>
  ));

  const timeSwitch = (
    <div className="gl-timesw" role="group" aria-label="Zeitpunkt">
      <button type="button" aria-pressed={state.t === 'heute' || !selScene} onClick={() => onState({ t: 'heute' })}>heute</button>
      {scenes.slice(-3).reverse().map((s) => <button key={s.date} type="button" aria-pressed={selScene?.date === s.date} onClick={() => onState({ t: s.date })} title={`Satellitenszene ${dateDeLong(s.date)}`}>Szene {dateDe(s.date)}</button>)}
    </div>
  );

  const basemapSeg = (cls: string) => (
    <div className={cls} role="group" aria-label="Grundkarte">
      <button type="button" aria-pressed={basemap === 'karte'} onClick={() => setBasemap('karte')}>Karte</button>
      <button type="button" aria-pressed={basemap === 'satellit'} onClick={() => setBasemap('satellit')} title="Esri World Imagery, wie im Brandradar">Satellit</button>
    </div>
  );
  const viewSeg = (cls: string) => (
    <div className={cls} role="group" aria-label="Ansicht">
      <button type="button" aria-pressed={view === '2d'} onClick={() => onState({ v: '2d' })}>2D</button>
      <button type="button" aria-pressed={view === '3d'} disabled={!allow3d || view3dFailed} title={allow3d && !view3dFailed ? undefined : '3D ist ausgeschaltet oder wird von diesem Gerät nicht getragen'} onClick={() => onState({ v: '3d' })}>3D</button>
    </div>
  );
  const facts = (
    <>
      <h2 className="gl-label">Steckbrief</h2>
      <dl className="gl-facts">
        <dt>Fläche</dt>
        <dd><span className="gl-num" data-origin="official">{fmtKm2(g.area.km2)}</span><small>Bezugsjahr {fmtRefYear(g.area.refYear)} · {g.area.source}</small>{area && <small className={area.pct < 0 ? 'gl-loss' : ''}>{area.from[0]}: {fmtKm2(area.from[1])} · <b>{fmtSigned(area.pct, 0)} %</b></small>}</dd>
        <dt>Höhe</dt>
        <dd><span className="gl-num" data-origin="official">{fmt0(g.z[0])} – {fmt0(g.z[2])} m</span><small>Median {fmt0(g.z[1])} m · {g.zSource}</small></dd>
        {mass && <><dt>Bilanz {mass.year - 1}/{String(mass.year).slice(2)}</dt><dd><span className="gl-num" data-origin="measured">{mass.ba != null ? `${fmt0(mass.ba)} mm w. e.` : '—'}</span><small>gemessen{mass.ela != null ? ` · Gleichgewichtslinie ${fmt0(mass.ela)} m` : ''}{mass.aar != null ? ` · AAR ${fmt2(mass.aar)}` : ''}</small></dd></>}
        <dt>Inventar-Nummern</dt>
        <dd className="gl-ids">{[g.inv.glims && `GLIMS ${g.inv.glims}`, g.inv.sgi && `SGI ${g.inv.sgi}`, g.inv.agi5 != null && `AGI 5 ${g.inv.agi5}`, g.inv.rgi6 && g.inv.rgi6, g.inv.wgms && `WGMS ${g.inv.wgms}`].filter(Boolean).map((x) => <code key={String(x)}>{String(x)}</code>)}</dd>
      </dl>
    </>
  );
  const factsNote = <p className="gl-fine">Flächen tragen das Bezugsjahr ihres Inventars; Länder sind nicht gleichzeitig. Kein amtliches Warnprodukt.</p>;
  const left = (
    <aside className="gl-sheet-left" aria-label="Steckbrief">
      {facts}
      <h2 className="gl-label">Grundkarte</h2>
      {basemapSeg('gl-seg gl-seg-2')}
      <h2 className="gl-label">Ansicht</h2>
      {viewSeg('gl-seg gl-seg-2')}
      <h2 className="gl-label">Ebenen</h2>
      <label className="gl-layer"><input type="checkbox" checked={showEarlier} onChange={() => toggleLayer('o')} disabled={!earlier} /><span><b>Umriss {earlier ? earlier.year : '—'}</b><small>{earlier ? earlier.source || 'früheres Inventar' : 'kein früherer Umriss'}</small></span></label>
      {epochs.length > 1 && <select className="gl-input" aria-label="Jahr des früheren Umrisses" value={earlier?.year ?? ''} onChange={(e) => onState({ o: Number(e.target.value) })}>{epochs.map((e) => <option key={e.year} value={e.year}>{e.year} · {e.source}</option>)}</select>}
      <label className="gl-layer"><input type="checkbox" checked={showSnow} onChange={() => toggleLayer('s')} disabled={!snow || !data?.dem} /><span><b>Schneegrenze</b><small>{snow && data?.dem ? `Sentinel-2, ${dateDe(snow.date)}` : g.klass !== 'A' || g.country === 'DE' ? 'nur Klasse A' : 'keine klare Szene'}</small></span></label>
      {factsNote}
    </aside>
  );

  const stateLine = snow && showSnow
    ? `Szene ${dateDeLong(snow.date)}: ${snow.state === 1 ? `Schneegrenze ${fmt0(snow.sla)} m` : STATE_TEXT[snow.state]}${snowShare != null ? ` · ${Math.round(snowShare * 100)} % der Fläche mit Schnee` : ''}`
    : `Umriss ${g.area.source} ${fmtRefYear(g.area.refYear)}`;
  const mapEl = (
    <section className="gl-map gl-sheet-map" aria-label="Karte des Gletschers">
      <GlacierSheetMap g={g} geometry={data?.geometry ?? null} earlier={earlier} showEarlier={showEarlier} snow={snow} showSnow={showSnow} dem={data?.dem ?? null}
        view={view} basemap={basemap} compare={compare} onCompare={setCompare} onSnowShare={setSnowShare} onView3dFailed={() => setView3dFailed(true)} />
      <div className="gl-legend gl-sheet-legend" aria-label="Legende">
        <div className="gl-legend-head"><b>Legende</b></div>
        <div className="gl-legend-row"><i className="gl-sw" style={{ background: '#fff', border: '1px solid #A9D4E2' }} />Schnee und Firn (Satellit)</div>
        <div className="gl-legend-row"><i className="gl-sw" style={{ background: '#A8D0E0' }} />Eis ohne Schnee (Satellit)</div>
        <div className="gl-legend-row"><i className="gl-sw gl-sw-dash" style={basemap === 'satellit' ? { borderTopColor: '#B9C4CA' } : undefined} />Umriss früher</div>
        <div className="gl-legend-row"><i className="gl-sw" style={{ background: basemap === 'satellit' ? '#5FD3F3' : '#145A70', height: 3 }} />Umriss {fmtRefYear(g.area.refYear)}</div>
      </div>
      <div className="gl-sheet-status">{stateLine}</div>
    </section>
  );

  const head = (
    <header className="gl-topbar gl-sheet-top">
      <button type="button" className="gl-btn" onClick={onBack} aria-label="Zurück zur DACH-Lage"><span aria-hidden="true">←</span> DACH-Lage</button>
      <div className="gl-sheet-title"><h1><b>{displayName(g)}</b><span className="gl-chip is-official"><i aria-hidden="true" />{g.country} · Klasse {g.klass}</span></h1><span>{sub}</span></div>
      <div className="gl-grow" />
      {!isMobile && timeSwitch}
      <button type="button" className={`gl-btn gl-follow${followed ? ' is-on' : ''}`} aria-pressed={followed} onClick={onFollow} aria-label={followed ? `${displayName(g)} nicht mehr folgen` : `${displayName(g)} folgen`}><span aria-hidden="true">{followed ? '★' : '☆'}</span>{isMobile ? null : followed ? ' Gefolgt' : ' Folgen'}</button>
      <ShareButton className="gl-btn" text={isMobile ? undefined : 'Teilen'} compact={isMobile} />
    </header>
  );

  if (layout === 'dossier') {
    const level = levelOf(state.tab);
    const copernicusDay = (sceneForMap?.date ?? new Date(nowMs).toISOString().slice(0, 10));
    const mapTools = (
      <div className="gl-ds-maptools">
        {basemapSeg('gl-seg2')}
        {viewSeg('gl-seg2')}
        <div className="gl-ds-layers" role="group" aria-label="Ebenen der Karte">
          <button type="button" className="gl-ds-lay" aria-pressed={showEarlier} disabled={!earlier} onClick={() => toggleLayer('o')} title={earlier ? earlier.source || 'früheres Inventar' : 'kein früherer Umriss'}>Umriss {earlier ? earlier.year : '—'}</button>
          {epochs.length > 1 && <select className="gl-input" aria-label="Jahr des früheren Umrisses" value={earlier?.year ?? ''} onChange={(e) => onState({ o: Number(e.target.value) })}>{epochs.map((e) => <option key={e.year} value={e.year}>{e.year} · {e.source}</option>)}</select>}
          <button type="button" className="gl-ds-lay" aria-pressed={showSnow} disabled={!snow || !data?.dem} onClick={() => toggleLayer('s')} title={snow && data?.dem ? `Sentinel-2, ${dateDe(snow.date)}` : g.klass !== 'A' || g.country === 'DE' ? 'nur Klasse A' : 'keine klare Szene'}>Schneegrenze</button>
        </div>
      </div>
    );
    const headBlock = (
      <div className="gl-ds-head">
        <div className="gl-ds-headrow">
          <div className="gl-ds-headtx">
            <span className="gl-ds-eyebrow">Dossier · Gletscher</span>
            <h2 className="gl-ds-title">{displayName(g)} <span className="gl-chip is-official"><i aria-hidden="true" />{g.country} · Klasse {g.klass}</span></h2>
            <p className="gl-ds-sub">{sub}</p>
          </div>
          <div className="gl-ds-actions">
            <button type="button" className={`gl-btn gl-follow${followed ? ' is-on' : ''}`} aria-pressed={followed} onClick={onFollow} aria-label={followed ? `${displayName(g)} nicht mehr folgen` : `${displayName(g)} folgen`}><span aria-hidden="true">{followed ? '★' : '☆'}</span>{followed ? ' Gefolgt' : ' Folgen'}</button>
            {onOpenSheet && <button type="button" className="gl-btn" onClick={onOpenSheet}>Steckbrief <span aria-hidden="true">↗</span></button>}
            <button type="button" className="gl-btn" onClick={onBack}>Zur Karte</button>
          </div>
        </div>
        <div className="gl-ds-kf">
          <span className="gl-ds-tile"><span className="gl-ds-tile-l">Fläche</span><span className="gl-num" data-origin="official">{fmtKm2(g.area.km2)}</span><small>Inventar {fmtRefYear(g.area.refYear)} · {g.area.source}</small></span>
          <span className="gl-ds-tile"><span className="gl-ds-tile-l">Höhe</span><span className="gl-num" data-origin="official">{fmt0(g.z[0])}–{fmt0(g.z[2])} m</span><small>Median {fmt0(g.z[1])} m</small></span>
          <span className="gl-ds-tile"><span className="gl-ds-tile-l">Flächenänderung</span>{area
            ? <><span className={`gl-num${area.pct < 0 ? ' gl-loss-n' : ''}`} data-origin="official">{fmtSigned(area.pct, 0)} %</span><small>seit {area.from[0]} ({fmtKm2(area.from[1])})</small></>
            : <><span className="gl-num">—</span><small>{data ? 'nur ein Inventar' : 'wird geladen …'}</small></>}</span>
          <span className="gl-ds-tile"><span className="gl-ds-tile-l">Massenbilanz</span>{mass && mass.ba != null
            ? <><span className={`gl-num${mass.ba < 0 ? ' gl-loss-n' : ''}`} data-origin="measured">{fmt0(mass.ba)} mm w. e.</span><small>gemessen {mass.year - 1}/{String(mass.year).slice(2)}</small></>
            : <><span className="gl-num">—</span><small>{data ? 'keine Messreihe' : 'wird geladen …'}</small></>}</span>
        </div>
        {scenes.length > 0 && <div className="gl-ds-time"><span className="gl-ds-tile-l">Zeitpunkt der Karte</span>{timeSwitch}</div>}
      </div>
    );
    return (
      <section className="gl-ds" aria-label={`Dossier ${displayName(g)}`} data-glacier={g.id}>
        <nav className="gl-ds-steps" aria-label="Ebenen des Dossiers">
          {LEVELS.map((l, i) => (
            <button key={l.tab} type="button" className={`gl-ds-step${level === i ? ' is-on' : ''}`} aria-current={level === i ? 'step' : undefined} onClick={() => onState({ tab: l.tab })}>
              <span className="gl-ds-step-n" aria-hidden="true">{i + 1}</span>
              <span className="gl-ds-step-t"><b>{l.title}</b><small>{l.sub}</small></span>
            </button>
          ))}
        </nav>
        <div className="gl-ds-card gl-ds-mapcard">
          {mapTools}
          {mapEl}
          <a className="gl-ds-maplink" href={copernicusUrl(g.lat, g.lon, copernicusDay)} target="_blank" rel="noopener noreferrer">
            <span>Sentinel-2 in 10 m · {dateDeLong(copernicusDay)}</span><b>Copernicus Browser ↗</b>
          </a>
        </div>
        <div className="gl-ds-grid">
          <div className="gl-ds-main" data-level={level + 1}>
            {notReady ? <>{level === 0 && <section className="gl-hb-card gl-hb-hero" aria-label="Gletscher auf einen Blick">{headBlock}</section>}{notReady}</> : (data && (
              <>
                {data.missing.length > 0 && <p className="gl-fine gl-missing" role="note">Nicht ladbar: {data.missing.join(', ')}.</p>}
                {level === 0 ? <GlacierHeuteBoard g={g} melt={mv} meltWhy={meltWhy} season={season} nowMs={nowMs} neighbourName={neighbourName} head={headBlock} /> : LEVELS[level].tabs.map((t) => (
                  <section key={t} className="gl-ds-card gl-ds-sec" data-tab={t} aria-label={TAB_LABEL[t]}>
                    <span className="gl-ds-eyebrow">{TAB_LABEL[t]}</span>
                    {tabBody(t, data)}
                  </section>
                ))}
              </>
            ))}
          </div>
        </div>
      </section>
    );
  }
  if (isMobile) {
    return (
      <div className="gl-main gl-sheet">
        {head}
        <div className="gl-body gl-sheet-body">
          <div className="gl-center">{mapEl}</div>
          <div className="gl-m-chips" role="group" aria-label="Ansicht und Ebenen">
            <button type="button" aria-pressed={basemap === 'satellit'} onClick={() => setBasemap(basemap === 'satellit' ? 'karte' : 'satellit')}>Satellit</button>
            <button type="button" aria-pressed={view === '3d'} disabled={!allow3d || view3dFailed} onClick={() => onState({ v: view === '3d' ? '2d' : '3d' })}>3D</button>
            <button type="button" aria-pressed={showEarlier} disabled={!earlier} onClick={() => toggleLayer('o')}>Umriss {earlier?.year ?? '—'}</button>
            <button type="button" aria-pressed={showSnow} disabled={!snow || !data?.dem} onClick={() => toggleLayer('s')}>Schneegrenze</button>
          </div>
          <div className="gl-m-time">{timeSwitch}</div>
          {tabBar}
          <div className="gl-sheet-scroll gl-m-scroll">{panel}{left}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="gl-main gl-sheet">
      {head}
      <div className="gl-body gl-sheet-body">
        {left}
        <div className="gl-center">{mapEl}</div>
        <aside className="gl-readout gl-sheet-readout" aria-label="Zahlen zum Gletscher">
          {tabBar}
          <div className="gl-readout-scroll">{panel}</div>
        </aside>
      </div>
    </div>
  );
}
