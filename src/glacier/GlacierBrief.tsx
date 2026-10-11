/**
 * GL-4 — the glacier sheet (`/gletscher/<slug>`): Steckbrief left, map or 3D in the middle, five tabs on the right (Heute · Saison · Langzeit · Tour · Quellen);
 * mobile: map on top, tabs and content below. Design `reference/gletscher-desktop-steckbrief.dc.html` (+ mobile). State (tab, time point, view, layers,
 * outline year) lives in the URL via the page; everything else is derived here from the documents of `glacierSheetData.ts`.
 */
import { useEffect, useMemo, useState } from 'react';
import './glacierSheet.css';
import ShareButton from '../share/ShareButton';
import { GLACIER_COUNTRY_LABEL, GLACIER_REGIONS, type GlacierCatalogEntry, type GlacierOfficialItem } from './glacierContract';
import type { GlacierBases, GlacierIndex } from './glacierClient';
import { GLACIER_TABS, type GlacierTab, type GlacierUrlState, type GlacierLayer, type GlacierView } from './glacierState';
import { loadSheetData, type SheetData } from './glacierSheetData';
import GlacierSheetMap, { type SheetSnow } from './GlacierSheetMap';
import { TabHeute, TabSaison, TabLangzeit, TabTour, TabQuellen } from './GlacierSheetTabs';
import { fmt0, fmt2, fmtKm2, fmtRefYear, displayName, fmtSigned } from './glacierView';
import {
  areaChange, cumulativeLength, longestLength, massRows, latestMass, meltView, seasonSummary, sourceRows, dateDe, dateDeLong, STATE_TEXT, type SeasonSummary,
} from './glacierSheetModel';
import type { GlacierSatIndex } from './glacierClient';

const TAB_LABEL: Record<GlacierTab, string> = { heute: 'Heute', saison: 'Saison', langzeit: 'Langzeit', tour: 'Tour', quellen: 'Quellen' };

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
}

export default function GlacierBrief({ g, build, byId, satIndex, meltPointer, official, nowMs, isMobile, bases, state, onState, onBack, allow3d }: SheetProps) {
  const [data, setData] = useState<SheetData | null>(null);
  const [compare, setCompare] = useState<number | null>(null);
  const [snowShare, setSnowShare] = useState<number | null>(null);
  const [view3dFailed, setView3dFailed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
  const panel = loadError ? <div className="gl-empty" role="status"><strong>Keine Daten.</strong> Der Steckbrief ist nicht ladbar ({loadError}).</div> : !data ? <div className="gl-empty" role="status">Steckbrief wird geladen …</div> : (
    <div id="gl-tabpanel" role="tabpanel" aria-labelledby={`gl-tab-${state.tab}`} data-tab={state.tab}>
      {data.missing.length > 0 && <p className="gl-fine gl-missing" role="note">Nicht ladbar: {data.missing.join(', ')}.</p>}
      {state.tab === 'heute' && <TabHeute g={g} melt={mv} meltWhy={meltWhy} season={season} nowMs={nowMs} neighbourName={neighbourName} />}
      {state.tab === 'saison' && <TabSaison g={g} data={data} year={year} selDate={selScene?.date ?? null} mass={mass} />}
      {state.tab === 'langzeit' && <TabLangzeit g={g} area={area} length={length} proj={data.proj} compareYear={earlier?.year ?? null} compareOn={compare != null} onCompare={(on) => setCompare(on ? 0.5 : null)} official={official} status={g.status ?? null} />}
      {state.tab === 'tour' && <TabTour g={g} melt={mv} season={season} nowMs={nowMs} bandZ={g.z} />}
      {state.tab === 'quellen' && <TabQuellen rows={rows} sources={data.sources} />}
    </div>
  );

  const timeSwitch = (
    <div className="gl-timesw" role="group" aria-label="Zeitpunkt">
      <button type="button" aria-pressed={state.t === 'heute' || !selScene} onClick={() => onState({ t: 'heute' })}>heute</button>
      {scenes.slice(-3).reverse().map((s) => <button key={s.date} type="button" aria-pressed={selScene?.date === s.date} onClick={() => onState({ t: s.date })} title={`Satellitenszene ${dateDeLong(s.date)}`}>Szene {dateDe(s.date)}</button>)}
    </div>
  );

  const left = (
    <aside className="gl-sheet-left" aria-label="Steckbrief">
      <h2 className="gl-label">Steckbrief</h2>
      <dl className="gl-facts">
        <dt>Fläche</dt>
        <dd><span className="gl-num" data-origin="official">{fmtKm2(g.area.km2)}</span><small>Bezugsjahr {fmtRefYear(g.area.refYear)} · {g.area.source}</small>{area && <small className={area.pct < 0 ? 'gl-loss' : ''}>{area.from[0]}: {fmtKm2(area.from[1])} · <b>{fmtSigned(area.pct, 0)} %</b></small>}</dd>
        <dt>Höhe</dt>
        <dd><span className="gl-num" data-origin="official">{fmt0(g.z[0])} – {fmt0(g.z[2])} m</span><small>Median {fmt0(g.z[1])} m · {g.zSource}</small></dd>
        {mass && <><dt>Bilanz {mass.year - 1}/{String(mass.year).slice(2)}</dt><dd><span className="gl-num" data-origin="measured">{mass.ba != null ? `${fmt0(mass.ba)} mm w. e.` : '—'}</span><small>gemessen{mass.ela != null ? ` · Gleichgewichtslinie ${fmt0(mass.ela)} m` : ''}{mass.aar != null ? ` · AAR ${fmt2(mass.aar)}` : ''}</small></dd></>}
        <dt>Inventar-Nummern</dt>
        <dd className="gl-ids">{[g.inv.sgi && `SGI ${g.inv.sgi}`, g.inv.agi5 != null && `AGI 5 ${g.inv.agi5}`, g.inv.rgi6 && g.inv.rgi6, g.inv.wgms && `WGMS ${g.inv.wgms}`].filter(Boolean).map((x) => <code key={String(x)}>{String(x)}</code>)}</dd>
      </dl>
      <h2 className="gl-label">Ansicht</h2>
      <div className="gl-seg gl-seg-2" role="group" aria-label="Ansicht">
        <button type="button" aria-pressed={view === '2d'} onClick={() => onState({ v: '2d' })}>Karte</button>
        <button type="button" aria-pressed={view === '3d'} disabled={!allow3d || view3dFailed} title={allow3d && !view3dFailed ? undefined : '3D ist ausgeschaltet oder wird von diesem Gerät nicht getragen'} onClick={() => onState({ v: '3d' })}>3D</button>
      </div>
      <h2 className="gl-label">Ebenen</h2>
      <label className="gl-layer"><input type="checkbox" checked={showEarlier} onChange={() => toggleLayer('o')} disabled={!earlier} /><span><b>Umriss {earlier ? earlier.year : '—'}</b><small>{earlier ? earlier.source || 'früheres Inventar' : 'kein früherer Umriss'}</small></span></label>
      {epochs.length > 1 && <select className="gl-input" aria-label="Jahr des früheren Umrisses" value={earlier?.year ?? ''} onChange={(e) => onState({ o: Number(e.target.value) })}>{epochs.map((e) => <option key={e.year} value={e.year}>{e.year} · {e.source}</option>)}</select>}
      <label className="gl-layer"><input type="checkbox" checked={showSnow} onChange={() => toggleLayer('s')} disabled={!snow || !data?.dem} /><span><b>Schneegrenze</b><small>{snow && data?.dem ? `Sentinel-2, ${dateDe(snow.date)}` : g.klass !== 'A' || g.country === 'DE' ? 'nur Klasse A' : 'keine klare Szene'}</small></span></label>
      <p className="gl-fine">Flächen tragen das Bezugsjahr ihres Inventars; Länder sind nicht gleichzeitig. Kein amtliches Warnprodukt.</p>
    </aside>
  );

  const stateLine = snow && showSnow
    ? `Szene ${dateDeLong(snow.date)}: ${snow.state === 1 ? `Schneegrenze ${fmt0(snow.sla)} m` : STATE_TEXT[snow.state]}${snowShare != null ? ` · ${Math.round(snowShare * 100)} % der Fläche mit Schnee` : ''}`
    : `Umriss ${g.area.source} ${fmtRefYear(g.area.refYear)}`;
  const mapEl = (
    <section className="gl-map gl-sheet-map" aria-label="Karte des Gletschers">
      <GlacierSheetMap g={g} geometry={data?.geometry ?? null} earlier={earlier} showEarlier={showEarlier} snow={snow} showSnow={showSnow} dem={data?.dem ?? null}
        view={view} compare={compare} onCompare={setCompare} onSnowShare={setSnowShare} onView3dFailed={() => setView3dFailed(true)} />
      <div className="gl-legend gl-sheet-legend" aria-label="Legende">
        <div className="gl-legend-head"><b>Legende</b></div>
        <div className="gl-legend-row"><i className="gl-sw" style={{ background: '#fff', border: '1px solid #A9D4E2' }} />Schnee und Firn (Satellit)</div>
        <div className="gl-legend-row"><i className="gl-sw" style={{ background: '#A8D0E0' }} />Eis ohne Schnee (Satellit)</div>
        <div className="gl-legend-row"><i className="gl-sw gl-sw-dash" />Umriss früher</div>
        <div className="gl-legend-row"><i className="gl-sw" style={{ background: '#145A70', height: 3 }} />Umriss {fmtRefYear(g.area.refYear)}</div>
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
      <ShareButton className="gl-btn" text={isMobile ? undefined : 'Teilen'} compact={isMobile} />
    </header>
  );

  if (isMobile) {
    return (
      <div className="gl-main gl-sheet">
        {head}
        <div className="gl-body gl-sheet-body">
          <div className="gl-center">{mapEl}</div>
          <div className="gl-m-chips" role="group" aria-label="Ansicht und Ebenen">
            <button type="button" aria-pressed={view === '2d'} onClick={() => onState({ v: '2d' })}>Karte</button>
            <button type="button" aria-pressed={view === '3d'} disabled={!allow3d || view3dFailed} onClick={() => onState({ v: '3d' })}>3D</button>
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
