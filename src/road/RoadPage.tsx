/**
 * AW-5 — Autobahnwetter page, Command-Deck (D-27), design `reference/autobahnwetter-desktop.dc.html` (+ mobile).
 * Rail 62 · topbar 60 · dock 250 · map · readout 400, band as glass panel over the map foot; mobile: full-screen map,
 * corridor pill + share (44 px), time chips (36 px), bottom sheet in two stages.
 *
 * Data: `road/v1/` of buscosun-data via `roadClient.ts` (time gate, step back, CDN + raw hedge, client checks of the
 * contract). Freshness rules of the contract: > 45 min grey "veraltet", > 3 h or kill switch "derzeit keine Messdaten".
 * AW-6.1b: the time chips +1/+3/+6 h select the hour of the WEATHER forecast of buscosun Fusion (`road/fc/v1`,
 * read per corridor through `loadRoadFc`): forecast row of the band, dots on the map, tiles, chart and arrival rows of
 * the readout. Map markers, band bar and road classes stay the MEASUREMENT of the slot at every chip; the road surface
 * has no forecast before Gate D (AW-6.2).
 * `roadDeck.css` is imported only here (lazy chunk), tokens `--aw-*` live in `designTokens.css`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import { FeatureRail, type RailFeature } from '../nav/featureRail';
import ShareButton from '../share/ShareButton';
import { useAppNav } from '../router/useAppNav';
import { useMediaQuery } from '../mobile/useIsMobile';
import type { CapAlert } from '../warnings/capAlerts';
import { ROAD_DEAD_MS, roadFreshness, type RoadH24File, type RoadPoint } from './roadContract';
import { ROAD_CLASS_LABEL } from './roadClasses';
import { loadRoadCorridors, loadRoadFc, loadRoadH24, loadRoadSlot, type RoadCorridor, type RoadFcLoad, type RoadSlotLoad } from './roadClient';
import type { RoadFcPoint } from './roadFc';
import {
  ROAD_FC_AIR_COLOR, ROAD_FC_AIR_LABEL, defaultRoadFcAxis, isRoadFcAxisId, roadFcAirClass, roadFcAxisName, roadFcAxisPoints, roadFcBand, roadFcLine,
  roadFcEngineName, roadFcRunView, roadFcValue,
} from './roadFcView';
import RoadMap, { type RoadFcDot, type RoadMapLayers } from './RoadMap';
import RoadDock, { type RoadCountry } from './RoadDock';
import RoadBand from './RoadBand';
import RoadReadout from './RoadReadout';
import { ROAD_FORECAST_ENABLED, ROAD_TIMES, type RoadTab, type RoadTime, type RoadUrlState } from './roadState';
import {
  ROAD_CLASS_COLOR, bandSegments, corridorEnds, f1, hm, isCritical, isHatched, isRoadWarning, kmIn, roadNumber,
  searchCorridors, slotSummary, activeRoadWarnings, defaultRoadStation, ROAD_WARN_REFRESH_MS,
} from './roadView';
import './roadDeck.css';

export interface RoadPageProps {
  initial: RoadUrlState;
  invalid: string[];
  onUrlState: (s: RoadUrlState) => void;
  onCorridor: (s: RoadUrlState, initial: boolean) => void;
  /** Set on a back/forward navigation: the page takes corridor, station, direction and tab from the URL again. */
  popState?: (RoadUrlState & { key: string }) | null;
}

const DEFAULT_CORRIDOR = 'a8';
const REFRESH_MS = 60_000;
/** The pointer of the route forecast changes once an hour (plus the publish gate) — re-read every 10 min. */
const FC_REFRESH_MS = 10 * 60_000;
const DEFAULT_LAYERS: RoadMapLayers = { zust: true, temp: true, fog: true, warn: true, bl: false, fc: true };
const EMPTY_FC_BY_ID: ReadonlyMap<string, RoadFcPoint> = new Map();

export default function RoadPage({ initial, onUrlState, onCorridor, popState }: RoadPageProps) {
  const nav = useAppNav();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [corridors, setCorridors] = useState<RoadCorridor[] | null>(null);
  const [corrState, setCorrState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [load, setLoad] = useState<RoadSlotLoad | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [corridorId, setCorridorId] = useState<string>(initial.corridor ?? DEFAULT_CORRIDOR);
  const [stId, setStId] = useState<string | null>(initial.st);
  const [dir, setDir] = useState<0 | 1>(initial.dir);
  const [tab, setTab] = useState<RoadTab>(initial.tab);
  const [time, setTime] = useState<RoadTime>(initial.t);
  const [fcLoad, setFcLoad] = useState<{ corridor: string; load: RoadFcLoad } | null>(null);
  const [country, setCountry] = useState<RoadCountry>('alle');
  const [query, setQuery] = useState('');
  const [layers, setLayers] = useState<RoadMapLayers>(DEFAULT_LAYERS);
  const [departMin, setDepartMin] = useState(0);
  const [ring, setRing] = useState<RoadH24File | null>(null);
  const [warn, setWarn] = useState<{ state: 'off' | 'loading' | 'ok' | 'error'; alerts: CapAlert[]; at: number | null }>({ state: 'off', alerts: [], at: null });
  const [pointWarnings, setPointWarnings] = useState<CapAlert[]>([]);
  const [sheet, setSheet] = useState<'peek' | 'open'>('peek');
  const [picker, setPicker] = useState(false);
  const firstCorridor = useRef(true);

  // Back/forward: the URL is the truth again (the corridor effect below then finds the URL equal and navigates nowhere).
  const popKey = popState?.key ?? null;
  useEffect(() => {
    if (!popState) return;
    setCorridorId(popState.corridor ?? DEFAULT_CORRIDOR);
    setStId(popState.st);
    setDir(popState.dir);
    setTab(popState.tab);
    setTime(popState.t);
  }, [popKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- data ------------------------------------------------------------------------------------
  useEffect(() => {
    const ac = new AbortController();
    loadRoadCorridors(ac.signal).then((f) => {
      if (!f) { setCorrState('error'); return; }
      setCorridors(f.corridors.slice().sort((a, b) => roadNumber(a.road) - roadNumber(b.road) || b.stations.length - a.stations.length));
      setCorrState('ok');
    }, () => setCorrState('error'));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    let ac = new AbortController();
    let alive = true;
    const run = () => {
      const t = Date.now();
      setNowMs(t);
      loadRoadSlot(t, ac.signal).then((l) => {
        if (!alive) return;
        // A refresh never replaces a good slot by "nothing" — the shown slot stays and ages by the freshness rules.
        setLoad((prev) => (l.obs || !prev?.obs ? l : prev));
      }, () => {});
    };
    run();
    const id = window.setInterval(() => { ac.abort(); ac = new AbortController(); run(); }, REFRESH_MS);
    return () => { alive = false; ac.abort(); window.clearInterval(id); };
  }, []);

  const obs = load?.obs ?? null;
  const byId = useMemo(() => new Map((obs?.points ?? []).map((p) => [p.id, p] as const)), [obs]);
  const freshness = obs ? roadFreshness(obs.slotMs, nowMs, obs.killed) : 'dead';
  const summary = useMemo(() => slotSummary(obs, nowMs), [obs, nowMs]);
  const noData: string | null = !load ? null
    : obs?.killed ? 'Die Veröffentlichung ist angehalten (Kill-Switch des Datenspeichers).'
      : !obs && load.reason === 'error' ? `Der Datenspeicher ist gerade nicht erreichbar (${load.error ?? 'Netz'}).`
        : !obs ? 'In der letzten Stunde wurde kein geprüfter Slot veröffentlicht.'
          : nowMs - obs.slotMs > ROAD_DEAD_MS ? `Der letzte geprüfte Slot (${hm(obs.slotMs)}) ist älter als 3 Stunden.` : null;
  const shownPoints = useMemo(() => (noData ? [] : (obs?.points ?? [])), [noData, obs]);
  const shownById = noData ? EMPTY_BY_ID : byId;

  const corridor = useMemo(() => corridors?.find((c) => c.id === corridorId) ?? corridors?.find((c) => c.id === DEFAULT_CORRIDOR) ?? corridors?.[0] ?? null, [corridors, corridorId]);
  const inCorridor = useMemo(() => new Set(corridor?.stations.map((s) => s.id) ?? []), [corridor]);
  const mapPoints = useMemo(() => shownPoints.filter((p) => p.kind === 'A' || layers.bl || inCorridor.has(p.id)), [shownPoints, layers.bl, inCorridor]);

  // Route forecast of the corridor (AW-6.1b): pointer + one immutable file; a failed refresh keeps the shown run.
  const fcCorridorId = corridor?.id ?? null;
  useEffect(() => {
    if (!fcCorridorId) return;
    let ac = new AbortController();
    let alive = true;
    const run = () => {
      loadRoadFc('corridor', fcCorridorId, Date.now(), ac.signal).then((l) => {
        if (alive) setFcLoad((prev) => (l.file || prev?.corridor !== fcCorridorId || !prev.load.file ? { corridor: fcCorridorId, load: l } : prev));
      }, () => {});
    };
    run();
    const id = window.setInterval(() => { ac.abort(); ac = new AbortController(); run(); }, FC_REFRESH_MS);
    return () => { alive = false; ac.abort(); window.clearInterval(id); };
  }, [fcCorridorId]);
  const fcOwn = fcLoad && fcLoad.corridor === fcCorridorId ? fcLoad.load : null;
  const fcRun = useMemo(() => roadFcRunView(fcOwn?.file ? fcOwn.run : null, nowMs), [fcOwn, nowMs]);
  const fcFile = fcOwn?.file && fcRun.usable ? fcOwn.file : null;
  const fcById = useMemo(() => (fcFile ? new Map(fcFile.points.map((p) => [p.id, p] as const)) : EMPTY_FC_BY_ID), [fcFile]);
  const fcLabel = fcFile ? fcRun.label
    : !fcOwn ? 'Prognose lädt' : fcOwn.reason === 'no-index' ? 'Zeiger nicht lesbar' : fcOwn.reason === 'no-run' ? 'kein Lauf veröffentlicht' : fcOwn.reason === 'no-file' ? 'kein Lauf für diese Strecke' : 'letzter Lauf älter als 12 Stunden';
  // Without a usable forecast the chip falls back to "Jetzt" (the URL keeps the wish).
  const t: RoadTime = fcFile ? time : 0;
  const fcMs = nowMs + t * 3_600_000;

  // Default station (E-AW-13): most critical class first, then the coldest road, else the corridor's first station.
  const defaultPoint: RoadPoint | null = useMemo(() => {
    if (!corridor) return null;
    return defaultRoadStation(corridor.stations.map((s) => shownById.get(s.id)).filter((x): x is RoadPoint => !!x));
  }, [shownById, corridor]);
  // A forecast point of the axis is selected like a station (`st=a8@70`); a corridor without any measured station
  // (e.g. Baden-Württemberg: the DWD delivers no series there) opens on its coldest forecast point.
  const axis: RoadFcPoint | null = useMemo(() => {
    if (!fcFile) return null;
    if (isRoadFcAxisId(stId)) return fcById.get(stId) ?? null;
    if (stId && shownById.get(stId)) return null;
    return defaultPoint ? null : defaultRoadFcAxis(fcFile, fcMs);
    // The default must not jump with the clock: only file and selection decide.
  }, [fcFile, fcById, stId, shownById, defaultPoint]); // eslint-disable-line react-hooks/exhaustive-deps
  const point: RoadPoint | null = axis ? null : stId && shownById.get(stId) ? shownById.get(stId)! : defaultPoint;

  // 24-h ring of the selected station's series.
  const pointGroup = point?.g ?? null;
  const obsSlot = obs?.slot ?? null;
  useEffect(() => {
    if (!pointGroup || !obsSlot) { setRing(null); return; }
    const ac = new AbortController();
    loadRoadH24(pointGroup, obsSlot, ac.signal).then(setRing, () => setRing(null));
    return () => ac.abort();
  }, [pointGroup, obsSlot]);

  // DWD warnings (lazy module, only with the layer on), quoted verbatim in the readout. Re-fetched every
  // ROAD_WARN_REFRESH_MS and filtered by the clock when drawn — an expired warning never stays on screen, a new one
  // arrives within minutes (docs/API.md §7; review finding #8).
  useEffect(() => {
    if (!layers.warn) { setWarn({ state: 'off', alerts: [], at: null }); return; }
    let ac = new AbortController();
    let alive = true;
    const run = async () => {
      try {
        const { fetchDwdWarnings } = await import('../sources/dwdCapAlerts');
        const r = await fetchDwdWarnings(ac.signal);
        if (alive) setWarn({ state: 'ok', alerts: r.alerts.filter((a) => isRoadWarning(a.group, a.event)), at: Date.now() });
      } catch (e) {
        // A failed refresh drops the old list: an outdated warning is more dangerous than none (docs/API.md §7).
        if (alive && (e as Error)?.name !== 'AbortError') setWarn({ state: 'error', alerts: [], at: null });
      }
    };
    setWarn((w) => (w.state === 'ok' ? w : { ...w, state: 'loading' }));
    void run();
    const id = window.setInterval(() => { ac.abort(); ac = new AbortController(); void run(); }, ROAD_WARN_REFRESH_MS);
    return () => { alive = false; ac.abort(); window.clearInterval(id); };
  }, [layers.warn]);
  const liveAlerts = useMemo(() => (warn.state === 'ok' ? activeRoadWarnings(warn.alerts, nowMs) : []), [warn, nowMs]);
  const warnAreas = useMemo<GeoJSON.FeatureCollection | null>(() => (warn.state !== 'ok' ? null : {
    type: 'FeatureCollection',
    features: liveAlerts.flatMap((a) => a.areas.map((ar) => ({ type: 'Feature' as const, properties: { id: a.id }, geometry: { type: 'Polygon' as const, coordinates: ar.rings } }))),
  }), [warn.state, liveAlerts]);
  useEffect(() => {
    if (warn.state !== 'ok' || !point) { setPointWarnings([]); return; }
    let alive = true;
    import('../countryMask').then(({ pointInRings }) => {
      if (alive) setPointWarnings(liveAlerts.filter((a) => a.areas.some((ar) => pointInRings(ar.rings as unknown as number[][][], point.lon, point.lat))));
    });
    return () => { alive = false; };
  }, [warn.state, liveAlerts, point]);

  // --- URL ------------------------------------------------------------------------------------------
  const urlState: RoadUrlState = { corridor: corridor?.id ?? corridorId, st: stId, t: time, dir, tab };
  const urlKey = JSON.stringify(urlState);
  useEffect(() => { if (!firstCorridor.current) onUrlState(urlState); }, [urlKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!corridor) return;
    onCorridor({ ...urlState, corridor: corridor.id }, firstCorridor.current);
    firstCorridor.current = false;
  }, [corridor?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickCorridor = useCallback((id: string) => { setCorridorId(id); setStId(null); setSheet('peek'); setPicker(false); }, []);
  const pickStation = useCallback((id: string) => {
    setStId(id);
    setTab((t) => (t === 'quellen' ? 'station' : t));
    if (isRoadFcAxisId(id)) return;
    const owner = corridors?.find((c) => c.id === corridorId && c.stations.some((s) => s.id === id))
      ?? corridors?.find((c) => c.stations.some((s) => s.id === id));
    if (owner && owner.id !== corridorId) setCorridorId(owner.id);
  }, [corridors, corridorId]);

  const filtered = useMemo(() => searchCorridors(corridors ?? [], shownById, query), [corridors, shownById, query]);
  const standLabel = obs && !noData ? `Messung ${hm(obs.slotMs)}${freshness === 'stale' ? ' · veraltet' : ''}` : 'keine Messdaten';
  const liveTone = noData || !obs ? 'none' : freshness === 'live' ? 'live' : 'stale';
  // Overlays cover the map: mobile pill + chips on top, the sheet (design 414 px) at the bottom; desktop band 165 px.
  const padding = isMobile ? { top: 130, bottom: 430, left: 24, right: 24 } : { top: 110, bottom: 232, left: 40, right: 60 };
  const ends = corridor ? corridorEnds(corridor, dir) : null;

  // --- pieces -----------------------------------------------------------------------------------------
  const pill = corridor && ends && (
    <div className="aw-pill">
      <span className="aw-pill-shields">{corridor.shields.map((s) => <span key={s} className="aw-shield">{s}</span>)}</span>
      <span className="aw-pill-body">
        <span className="aw-pill-title">{ends.from} → {ends.to}</span>
        <span className="aw-pill-sub">Richtung {ends.to} · {corridor.countries.join(' · ')}{isMobile ? ` · ${corridor.stations.length} Messpunkte` : ''}</span>
      </span>
      <button type="button" className="aw-icon-btn" aria-label="Fahrtrichtung wechseln" onClick={() => setDir((d) => (d ? 0 : 1))}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h14l-4-4M20 16H6l4 4" /></svg>
      </button>
    </div>
  );
  const times = (
    <div role="group" aria-label="Zeitpunkt" className="aw-seg aw-times">
      {ROAD_TIMES.map((h) => {
        const enabled = h === 0 || (ROAD_FORECAST_ENABLED && !!fcFile);
        return (
          <button key={h} type="button" aria-pressed={h === t} className={h === t ? 'is-active' : ''} disabled={!enabled} onClick={() => setTime(h)}
            title={enabled ? (h === 0 ? undefined : `Wetterprognose von ${roadFcEngineName(fcFile)} für ${hm(nowMs + h * 3_600_000)} (${fcLabel}) — Karte und Band zeigen weiter die Messung`) : `Wetterprognose derzeit nicht verfügbar (${fcLabel}).`}>
            {h === 0 ? `Jetzt${obs && !noData ? ` · ${hm(obs.slotMs)}` : ''}` : `+${h} h`}
          </button>
        );
      })}
    </div>
  );
  const legend = (
    <div className="aw-legend" aria-label="Legende">
      <span className="aw-eyebrow">Fahrbahn</span>
      {(['ice', 'frost', 'wet', 'dry'] as const).map((c) => <span key={c}><i style={{ background: ROAD_CLASS_COLOR[c] }} />{ROAD_CLASS_LABEL[c].label}</span>)}
      {/* Hatched = `unknown` (temperature, no condition) AND `nodata` — never "dry" (D-04). */}
      <span><i className="is-hatched" />Zustand unbekannt / keine Messung</span>
      {fcFile && layers.fc && (
        <>
          <span className="aw-eyebrow aw-legend-fc">Prognose Luft · {t === 0 ? 'jetzt' : `+${t} h`}</span>
          {(['frost', 'near', 'above'] as const).map((k) => <span key={k}><i className="is-dot" style={{ background: ROAD_FC_AIR_COLOR[k] }} />{ROAD_FC_AIR_LABEL[k]}</span>)}
        </>
      )}
    </div>
  );
  const emptyMap = noData && <div className="aw-map-note" role="status"><strong>Derzeit keine Messdaten.</strong> {noData}</div>;
  const corrFail = corrState === 'error' && <div className="aw-map-note" role="status"><strong>Korridore nicht ladbar.</strong> Die Messpunkte erscheinen trotzdem auf der Karte.</div>;
  const zoom = (d: number) => { const m = mapRef.current; if (m) { if (d > 0) m.zoomIn(); else m.zoomOut(); } };

  const axisValue = axis && fcFile ? roadFcValue(axis, fcFile, fcMs) : null;
  const fcDots = useMemo<RoadFcDot[]>(() => (!fcFile ? [] : roadFcAxisPoints(fcFile).map((p) => {
    const v = roadFcValue(p, fcFile, fcMs);
    return { id: p.id, lon: p.lon, lat: p.lat, color: v ? ROAD_FC_AIR_COLOR[roadFcAirClass(v.t)] : null };
    // Hour steps only: the dots change when the valid hour changes, not every minute.
  })), [fcFile, Math.round(fcMs / 3_600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const fcCells = useMemo(() => (fcFile && corridor ? roadFcBand(corridor, fcFile, dir, fcMs) : null), [fcFile, corridor, dir, Math.round(fcMs / 3_600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const fcBandLabel = `Prognose Luft ${t === 0 ? 'jetzt' : `+${t} h`} · ${hm(Math.round(fcMs / 3_600_000) * 3_600_000)} · ${fcLabel}`;
  const callout = axis && corridor ? {
    lon: axis.lon, lat: axis.lat, name: roadFcAxisName(corridor, axis, dir),
    line: axisValue ? `Prognose ${roadFcLine(axisValue)}` : 'keine Prognose für diese Stunde',
    color: axisValue ? ROAD_FC_AIR_COLOR[roadFcAirClass(axisValue.t)] : null,
  } : point ? {
    lon: point.lon, lat: point.lat, name: point.n,
    line: point.rs != null ? `Fahrbahn ${f1(point.rs)} °C · ${ROAD_CLASS_LABEL[point.cls].label}` : ROAD_CLASS_LABEL[point.cls].label,
    color: isHatched(point.cls) ? null : ROAD_CLASS_COLOR[point.cls],
  } : null;
  const map = (
    <RoadMap corridors={corridors ?? []} corridor={corridor} points={mapPoints} inCorridor={inCorridor}
      selectedId={axis?.id ?? point?.id ?? null} stale={freshness === 'stale'} layers={layers} warnAreas={warnAreas} padding={padding}
      onSelect={pickStation} onMap={(m) => { mapRef.current = m; }} callout={callout} fcDots={fcDots} />
  );
  const readout = (
    <RoadReadout tab={tab} onTab={setTab} point={point} corridor={corridor} byId={shownById} dir={dir} slotMs={obs?.slotMs ?? null} nowMs={nowMs}
      stale={freshness === 'stale'} ring={ring} warnings={pointWarnings} warnState={warn.state} warnAt={warn.at} departOffsetMin={departMin}
      onDepart={(d) => setDepartMin((m) => Math.max(0, Math.min(345, m + d)))} onPick={pickStation} noData={noData}
      fcFile={fcFile} fcById={fcById} fcLabel={fcLabel} axis={axis} time={t} onTime={setTime} />
  );

  // --- mobile ---------------------------------------------------------------------------------------------
  if (isMobile) {
    const rows = corridor ? corridor.stations.map((s) => ({ s, p: shownById.get(s.id) })).filter((r): r is { s: RoadCorridor['stations'][number]; p: RoadPoint } => !!r.p) : [];
    const critical = rows.filter((r) => isCritical(r.p.cls)).sort((a, b) => (a.p.rs ?? 99) - (b.p.rs ?? 99)).slice(0, 3);
    const coldest = rows.filter((r) => r.p.rs != null).sort((a, b) => (a.p.rs as number) - (b.p.rs as number))[0];
    const nCrit = rows.filter((r) => isCritical(r.p.cls)).length;
    const slot15 = Math.ceil(nowMs / 900_000) * 900_000;
    const list = (critical.length ? critical : rows.slice(0, 3));
    const mPill = corridor && ends && (
      <button type="button" className="aw-pill is-button" aria-haspopup="dialog" aria-expanded={picker} onClick={() => setPicker(true)}>
        <span className="aw-pill-shields">{corridor.shields.map((s) => <span key={s} className="aw-shield">{s}</span>)}</span>
        <span className="aw-pill-body">
          <span className="aw-pill-title">{ends.from} → {ends.to}</span>
          <span className="aw-pill-sub">Richtung {ends.to} · {corridor.stations.length} Messpunkte</span>
        </span>
        <svg className="aw-pill-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
    );
    return (
      <div className="aw-root is-mobile">
        <main className="aw-map is-mobile" aria-label="Karte">
          {map}
          <div className="aw-m-top">{mPill}<ShareButton className="aw-m-share" compact /></div>
          <div className="aw-m-times">{times}</div>
          {emptyMap}
        </main>
        <section className={`aw-sheet is-${sheet}`} aria-label="Strecken-Briefing">
          <button type="button" className="aw-sheet-grip" aria-label={sheet === 'open' ? 'Briefing verkleinern' : 'Briefing aufklappen'} aria-expanded={sheet === 'open'}
            onClick={() => setSheet((s) => (s === 'open' ? 'peek' : 'open'))}><span /></button>
          <div className="aw-sheet-head">
            <span className="aw-eyebrow is-accent">Strecken-Briefing</span>
            <span className={`aw-eyebrow is-${liveTone}`}>{liveTone === 'live' ? `Live · ${hm(obs!.slotMs)}` : liveTone === 'stale' ? `veraltet · ${hm(obs!.slotMs)}` : 'keine Messdaten'}</span>
          </div>
          <h2 className="aw-sheet-title">{noData ? 'Derzeit keine Messdaten' : coldest ? `Kälteste Stelle: ${coldest.p.n} ${f1(coldest.p.rs as number)} °C` : 'Keine gültige Fahrbahnmessung'}</h2>
          <p className="aw-sheet-lead">{noData ?? `${nCrit} von ${rows.length} DWD-Anlagen mit Glätte oder Frostgefahr gemessen${corridor?.borders.length ? '; ab der Grenze keine offene Fahrbahnmessung' : ''}.`}</p>
          {corridor && <MiniBand corridor={corridor} byId={shownById} dir={dir} fc={fcCells} fcLabel={fcBandLabel} />}
          {corridor && !noData && (
            <>
              <div className="aw-sheet-list">
                {list.map(({ s, p }) => (
                  <button key={s.id} type="button" className="aw-sheet-row" onClick={() => { pickStation(s.id); setTab('station'); }}>
                    <i className={isHatched(p.cls) ? 'is-hatched' : ''} style={!isHatched(p.cls) ? { background: ROAD_CLASS_COLOR[p.cls] } : undefined} />
                    <span><strong>{p.n} · km {Math.round(kmIn(corridor, s.km, dir))}</strong><em>{p.rs != null ? `jetzt ${f1(p.rs)} °C, ${ROAD_CLASS_LABEL[p.cls].label}` : ROAD_CLASS_LABEL[p.cls].label} · gemessen {hm(p.t)}</em></span>
                    <span className="aw-sheet-eta"><em>an</em><strong>{hm(slot15 + (kmIn(corridor, s.km, dir) / 100) * 3_600_000)}</strong></span>
                  </button>
                ))}
              </div>
              <div className="aw-sheet-actions">
                <button type="button" className="aw-btn is-primary" onClick={() => { setTab('strecke'); setSheet('open'); }}>Alle {rows.length} Messpunkte</button>
                <button type="button" className="aw-btn is-auto" onClick={() => { setTab('strecke'); setSheet('open'); }}>Abfahrt {hm(slot15 + departMin * 60_000)}</button>
              </div>
              {sheet === 'open' && <div className="aw-sheet-readout">{readout}</div>}
            </>
          )}
        </section>
        {picker && (
          <div className="aw-m-dock" role="dialog" aria-label="Autobahn wählen">
            <div className="aw-m-dock-head">
              <strong>Autobahn wählen</strong>
              <button type="button" onClick={() => setDir((d) => (d ? 0 : 1))} aria-label="Fahrtrichtung wechseln">⇄ Richtung</button>
              <button type="button" onClick={() => setPicker(false)} aria-label="Schließen">✕</button>
            </div>
            <RoadDock corridors={filtered} byId={shownById} selectedId={corridor?.id ?? null} onPick={pickCorridor} query={query} onQuery={setQuery}
              country={country} onCountry={setCountry} layers={layers} onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))} summary={summary} hasData={!noData && !!obs} />
          </div>
        )}
      </div>
    );
  }

  // --- desktop / tablet ------------------------------------------------------------------------------------
  return (
    <div className="aw-root">
      <FeatureRail active={'road' as RailFeature} onOpenFeature={(id) => nav.openFeature(id)} onHome={nav.goHome}
        navClass="aw-rail" btnClass="aw-rail-btn" activeClass="is-active" spacerClass="aw-rail-spacer" />
      <div className="aw-deck">
        <header className="aw-topbar">
          <a className="aw-brand" href="/" onClick={(e) => { e.preventDefault(); nav.goHome(); }} aria-label="Zur Startseite">
            <img src="/buscosun-mark.svg" width={22} height={22} alt="" />
            <span>buscosun</span>
          </a>
          <span className="aw-topdiv" aria-hidden="true" />
          <span className="aw-topbar-sub">Autobahnwetter DACH</span>
          <div className="aw-topbar-right">
            <span className={`aw-live is-${liveTone}`} role="status"><span className="aw-live-dot" aria-hidden="true"><span /><span /></span>{liveTone === 'live' ? 'Live' : liveTone === 'stale' ? 'Veraltet' : 'Keine Daten'}</span>
            <span className="aw-topbar-stand">
              {obs && !noData ? <>Messung <strong>{hm(obs.slotMs)}</strong> · {summary.activeGroups} von {summary.totalGroups} DWD-Reihen</> : 'derzeit keine Messdaten'}
              {fcFile && <> · Prognose {fcRun.label}</>}
            </span>
            <ShareButton className="aw-share" text="Teilen" />
          </div>
        </header>
        <div className="aw-body">
          <RoadDock corridors={filtered} byId={shownById} selectedId={corridor?.id ?? null} onPick={pickCorridor} query={query} onQuery={setQuery}
            country={country} onCountry={setCountry} layers={layers} onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))} summary={summary} hasData={!noData && !!obs} />
          <main className={`aw-map${fcCells ? ' has-fc' : ''}`} aria-label="Karte">
            {map}
            <div className="aw-ov-left">{pill}{times}</div>
            <div className="aw-ov-right">
              {legend}
              <div className="aw-zoom">
                <button type="button" aria-label="Hineinzoomen" onClick={() => zoom(1)}>+</button>
                <button type="button" aria-label="Herauszoomen" onClick={() => zoom(-1)}>−</button>
              </div>
            </div>
            {emptyMap}{corrFail}
            {corridor && <RoadBand corridor={corridor} byId={shownById} dir={dir} selectedId={axis?.id ?? point?.id ?? null} standLabel={standLabel} zust={layers.zust} onPick={pickStation} fc={fcCells} fcLabel={fcBandLabel} />}
          </main>
          {readout}
        </div>
      </div>
    </div>
  );
}

const EMPTY_BY_ID: ReadonlyMap<string, RoadPoint> = new Map();

/** Mobile mini band (design: 10 px, towns underneath). */
function MiniBand({ corridor, byId, dir, fc, fcLabel }: { corridor: RoadCorridor; byId: ReadonlyMap<string, RoadPoint>; dir: 0 | 1; fc: ReturnType<typeof roadFcBand> | null; fcLabel: string }) {
  const segs = bandSegments(corridor, byId, dir);
  const len = corridor.lengthKm;
  const towns = corridor.towns.map(([km, n]) => [kmIn(corridor, km, dir), n] as const).sort((a, b) => a[0] - b[0]);
  const pick = [towns[0], towns[Math.floor(towns.length / 2)], towns[towns.length - 1]].filter((t, i, a) => !!t && a.indexOf(t) === i);
  return (
    <>
      <div className="aw-miniband" aria-hidden="true">
        {segs.map((g, i) => (
          <div key={i} className={`aw-band-seg${g.cls === 'gap' || isHatched(g.cls) ? ' is-gap' : ''}`}
            style={{ left: `${(g.fromKm / len) * 100}%`, width: `${((g.toKm - g.fromKm) / len) * 100}%`, ...(g.cls !== 'gap' && !isHatched(g.cls) ? { background: ROAD_CLASS_COLOR[g.cls] } : {}) }} />
        ))}
        {corridor.borders.map((b) => <div key={b.km} className="aw-miniband-border" style={{ left: `${(kmIn(corridor, b.km, dir) / len) * 100}%` }} />)}
      </div>
      {fc && (
        <div className="aw-miniband is-fc" role="img" aria-label={fcLabel} title={fcLabel}>
          {fc.filter((g) => g.cls !== 'gap').map((g) => (
            <div key={g.id} className="aw-band-seg" style={{ left: `${(g.fromKm / len) * 100}%`, width: `${((g.toKm - g.fromKm) / len) * 100}%`, background: ROAD_FC_AIR_COLOR[g.cls as 'frost' | 'near' | 'above'] }} />
          ))}
        </div>
      )}
      <div className="aw-miniband-towns">{pick.map((t) => <span key={t[1]}>{t[1]}</span>)}</div>
    </>
  );
}
