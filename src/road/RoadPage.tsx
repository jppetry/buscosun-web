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
 * AF-5: a section without a measuring station (`isGapCorridor`, built by phase AF-2 so that every motorway is covered)
 * shows the forecast only — head „keine Messstelle an diesem Abschnitt · Prognose ‹name of the run file›", the band's
 * forecast row in the bar's place, the first forecast point as the default, its line on the map in the forecast colour.
 * `roadDeck.css` is imported only here (lazy chunk), tokens `--aw-*` live in `designTokens.css`.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import { FeatureRail, type RailFeature } from '../nav/featureRail';
import ShareButton from '../share/ShareButton';
import { useAppNav } from '../router/useAppNav';
import { useMediaQuery } from '../mobile/useIsMobile';
import type { CapAlert } from '../warnings/capAlerts';
import { ROAD_DEAD_MS, roadFreshness, type RoadH24File, type RoadPoint } from './roadContract';
import { ROAD_CLASS_LABEL } from './roadClasses';
import { loadRoadCorridors, loadRoadFc, loadRoadFcStation, loadRoadH24, loadRoadSlot, type RoadCorridor, type RoadFcLoad, type RoadFcStationLoad, type RoadSlotLoad } from './roadClient';
import type { RoadFcPoint } from './roadFc';
import {
  ROAD_FC_AIR_COLOR, ROAD_FC_AIR_LABEL, ROAD_FC_LINE_COLOR, defaultRoadFcAxis, firstRoadFcAxis, isRoadFcAxisId, roadFcAirClass, roadFcAxisName, roadFcAxisPoints, roadFcBand, roadFcLine,
  roadFcEngineName, roadFcHasSurface, roadFcRunView, roadFcValue,
} from './roadFcView';
import RoadMap, { type RoadFcDot, type RoadMapLayers, type RoadRainState } from './RoadMap';
import RoadDock, { type RoadCountry } from './RoadDock';
import RoadBand from './RoadBand';
import RoadReadout from './RoadReadout';
import { useRoadVs } from './vs/useRoadVs';
import { roadVsClassOf, roadVsMaySimulate, roadVsOriginText, roadVsText, roadVsValue } from './vs/roadVsView';
import { ROAD_FORECAST_ENABLED, ROAD_HZ_TIMES, ROAD_TIMES, type RoadHzMode, type RoadTab, type RoadTime, type RoadUrlState } from './roadState';
import type { RoadSegLine } from './RoadMap';
import type { RoadSegment } from './roadSegments';
import { stretchLine } from './roadSegments';
import { roadHzFreshness, type RoadHazardGroup, type RoadHzFile, type RoadLevel } from './roadHazards';
import { loadRoadHz, loadRoadHzHistory, loadRoadSegments } from './roadHzClient';
import { AW_SEV } from './roadNivoTheme';
import { hzGroupRows, rowOrder, segMapState, segmentMainStation, segmentOfStation, type HzRow } from './roadHzView';
import RoadMapCard, { RoadCorridorCard, RoadStationCard, type RoadCardStation } from './RoadMapCard';
import { RoadDossierHead, RoadDossierTabs, RoadPickBar, RoadRouteCard, type RoadDossierChapter, type SegState } from './RoadDossier';
// AW-8: rail and detail (with the nivo heatmap) are their own lazy chunk — a visitor without the switch loads none of it.
const RoadHazardPanel = lazy(() => import('./RoadHazardPanel'));
const RoadHazardDetail = lazy(() => import('./RoadHazardDetail'));
type RoadHzPanelState = React.ComponentProps<typeof import('./RoadHazardPanel').default>['state'];
import {
  ROAD_CLASS_COLOR, ROAD_GAP_SHORT, ROAD_GAP_TITLE, bandSegments, corridorEnds, corridorHeading, corridorRouteText, f1, hm, isCritical, isGapCorridor, isHatched, isRoadWarning, kmIn, roadGapHead, roadNoValueSince, roadNumber,
  searchCorridors, slotSummary, activeRoadWarnings, defaultRoadStation, ROAD_WARN_REFRESH_MS, DEFAULT_SPEED_KMH,
} from './roadView';
import './roadDeck.css';

export interface RoadPageProps {
  initial: RoadUrlState;
  invalid: string[];
  onUrlState: (s: RoadUrlState) => void;
  onCorridor: (s: RoadUrlState, initial: boolean) => void;
  /** Set on a back/forward navigation: the page takes corridor, station, direction and tab from the URL again. */
  popState?: (RoadUrlState & { key: string }) | null;
  /** AW-8: the hazard rail is on (`ROAD_HZ_LIVE` / `?roadhz=1`); off ⇒ the page of AW-5/AW-6.1b, unchanged. */
  hz?: boolean;
  /** Phase FB: show the road surface forecast of the run (`ROAD_SURFACE_LIVE` / `?rsfc=1`); off ⇒ „Luft" as before. */
  surface?: boolean;
  /** AW-6.2.9: the virtual road sensor (`ROAD_VS_LIVE` / `?roadvs=1`); off ⇒ the page of before, nothing is fetched. */
  vs?: boolean;
}

const DEFAULT_CORRIDOR = 'a8';
const REFRESH_MS = 60_000;
/** The pointer of the route forecast changes once an hour (plus the publish gate) — re-read every 10 min. */
const FC_REFRESH_MS = 10 * 60_000;
// V-AW-14: the radar layer is off by default (one more download and a GL layer only when asked for).
const DEFAULT_LAYERS: RoadMapLayers = { zust: true, temp: true, fog: true, warn: true, bl: false, fc: true, rain: false };
const EMPTY_FC_BY_ID: ReadonlyMap<string, RoadFcPoint> = new Map();

export default function RoadPage({ initial, onUrlState, onCorridor, popState, hz = false, surface = false, vs = false }: RoadPageProps) {
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
  const [rain, setRain] = useState<RoadRainState | null>(null);
  const [departMin, setDepartMin] = useState(0);
  const [ring, setRing] = useState<RoadH24File | null>(null);
  const [warn, setWarn] = useState<{ state: 'off' | 'loading' | 'ok' | 'error'; alerts: CapAlert[]; at: number | null }>({ state: 'off', alerts: [], at: null });
  const [pointWarnings, setPointWarnings] = useState<CapAlert[]>([]);
  const [sheet, setSheet] = useState<'peek' | 'open'>('peek');
  const [picker, setPicker] = useState(false);
  const firstCorridor = useRef(true);
  // AW-8: rail state — window, group filter, open segment, hovered row; the hazard file and the segments.
  const [hzMode, setHzMode] = useState<RoadHzMode>('now');
  const [hzFilter, setHzFilter] = useState<RoadHazardGroup | null>((initial.hf as RoadHazardGroup | null) ?? null);
  const [segId, setSegId] = useState<string | null>(initial.seg ?? null);
  const [hoverSeg, setHoverSeg] = useState<string | null>(null);
  const [segments, setSegments] = useState<RoadSegment[] | null | 'error'>(null);
  const [hzLoad, setHzLoad] = useState<{ slot: string; file: RoadHzFile | null; reason: string } | null>(null);
  const [hzPrev, setHzPrev] = useState<{ slot: string; files: Array<RoadHzFile | null> } | null>(null);
  const [hzDir, setHzDir] = useState<0 | 1>(0);
  // AWD: the stage of the centre — map (default) or dossier (strip + detail of the open segment). Permalink `ds=1`; behind the hazard switch only.
  const [stage, setStage] = useState<'map' | 'dossier'>(hz && initial.ds ? 'dossier' : 'map');
  const inDossier = hz && stage === 'dossier';
  // The segment a MAP click picked: its preview card (bottom left) is open until closed, a dossier opens or another segment is picked.
  const [mapSeg, setMapSeg] = useState<string | null>(null);
  // The corridor a MAP click on its line picked: its preview card, until closed, a dossier opens or a segment is picked.
  const [mapCorr, setMapCorr] = useState<string | null>(null);
  // The point whose preview card was closed — it stays closed until the next pick.
  const [cardOff, setCardOff] = useState<string | null>(null);
  useEffect(() => { if (inDossier) { setMapSeg(null); setMapCorr(null); } }, [inDossier]);
  // AWD chapters (like the fire dossier): entering the dossier with an open segment lands on „Abschnitt“, otherwise on „Strecke“.
  const [dsChapter, setDsChapter] = useState<RoadDossierChapter>(1);
  useEffect(() => { if (inDossier) setDsChapter(segId ? 2 : 1); }, [inDossier]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back/forward: the URL is the truth again (the corridor effect below then finds the URL equal and navigates nowhere).
  const popKey = popState?.key ?? null;
  useEffect(() => {
    if (!popState) return;
    setCorridorId(popState.corridor ?? DEFAULT_CORRIDOR);
    setStId(popState.st);
    setDir(popState.dir);
    setTab(popState.tab);
    setTime(popState.t);
    if (hz) { setSegId(popState.seg ?? null); setHzFilter((popState.hf as RoadHazardGroup | null) ?? null); setStage(popState.ds ? 'dossier' : 'map'); }
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

  // AW-8: segments once, the hazard file per measured slot, the two earlier slots while a detail is open.
  useEffect(() => {
    if (!hz) return;
    let alive = true;
    loadRoadSegments().then((f) => { if (alive) setSegments(f ? f.segments : 'error'); }, () => { if (alive) setSegments('error'); });
    return () => { alive = false; };
  }, [hz]);
  const hzSlot = hz ? obs?.slot ?? null : null;
  useEffect(() => {
    if (!hzSlot) return;
    const ac = new AbortController();
    loadRoadHz(hzSlot, ac.signal).then((l) => setHzLoad({ slot: hzSlot, file: l.file, reason: l.reason }), () => {});
    return () => ac.abort();
  }, [hzSlot]);
  useEffect(() => {
    // The two earlier slots feed the plan table of the dossier only — a map click must not fetch them.
    if (!hzSlot || !segId || !inDossier) return;
    const ac = new AbortController();
    loadRoadHzHistory(hzSlot, ac.signal).then((files) => setHzPrev({ slot: hzSlot, files }), () => {});
    return () => ac.abort();
  }, [hzSlot, segId, inDossier]);
  const hzFile = hzLoad && hzLoad.slot === hzSlot ? hzLoad.file : null;
  const hzFresh = hzFile ? roadHzFreshness(hzFile.slotMs, nowMs, hzFile.killed) : 'dead';
  const segMap = useMemo(() => new Map((segments && segments !== 'error' ? segments : []).map((s) => [s.id, s] as const)), [segments]);
  const hzState: RoadHzPanelState = !hz ? 'loading' : segments === 'error' ? 'no-segments' : !segments || !hzSlot ? 'loading'
    : !hzLoad || hzLoad.slot !== hzSlot ? 'loading' : !hzLoad.file ? (hzLoad.reason as 'not-there' | 'error' | 'invalid') : hzFresh === 'dead' ? 'dead' : hzFresh === 'stale' ? 'stale' : 'ok';
  const hzShown = hzState === 'ok' || hzState === 'stale' ? hzFile : null;
  const hzGroups = useMemo(() => (hzShown ? hzGroupRows(hzShown, segMap, hzMode, hzFilter) : []), [hzShown, segMap, hzMode, hzFilter]);
  const hzOrder = useMemo(() => rowOrder(hzGroups), [hzGroups]);
  const openSeg = segId ? segMap.get(segId) ?? null : null;
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
  // AW-8.3: the segment lines of the open corridor in the window of the shared time (hour `t`, or the whole window).
  // The geometry (sampled along the corridor) depends on corridor + segments only; selection and hover are layer filters on the map, so a click never rebuilds the lines.
  const segGeo = useMemo(() => {
    if (!hz || !corridor || !segments || segments === 'error') return [];
    return segments.filter((s) => s.corridor === corridor.id).map((s) => ({ id: s.id, line: stretchLine(corridor.line, s.kmFrom, s.kmTo, 0.5) }));
  }, [hz, corridor, segments]);
  const segLines = useMemo<RoadSegLine[]>(() => {
    const win: RoadHzMode = hzMode === 'p6' ? 'p6' : time;
    return segGeo.map((g) => {
      const st = segMapState(hzShown?.seg[g.id], win, hzFilter);
      return { id: g.id, line: g.line, color: st.lv ? AW_SEV[st.lv].bg : null, unknown: st.unknown };
    });
  }, [segGeo, hzShown, hzMode, time, hzFilter]);
  // Dossier: the same states for the route card (only with a valid hazard file — without one nothing is called „no hazard“).
  const segStates = useMemo(() => {
    const win: RoadHzMode = hzMode === 'p6' ? 'p6' : time;
    return new Map<string, SegState>(hzShown ? segGeo.map((g) => [g.id, segMapState(hzShown.seg[g.id], win, hzFilter)] as const) : []);
  }, [segGeo, hzShown, hzMode, time, hzFilter]);
  const segGeoMap = useMemo(() => new Map(segGeo.map((g) => [g.id, g.line] as const)), [segGeo]);
  // All segments of the open corridor in travel order — the dossier lets the user pick every one of them.
  const corrSegs = useMemo(() => {
    if (!hz || !corridor || !segments || segments === 'error') return [];
    const l = segments.filter((x) => x.corridor === corridor.id).sort((a, b) => a.kmFrom - b.kmFrom);
    return dir === 1 ? l.reverse() : l;
  }, [hz, corridor, segments, dir]);
  const corrRows = useMemo(() => {
    const m = new Map<string, HzRow>();
    for (const g of hzGroups) for (const r of g.rows) if (r.seg.corridor === corridor?.id && !m.has(r.segId)) m.set(r.segId, r);
    return m;
  }, [hzGroups, corridor?.id]);
  const inCorridor = useMemo(() => new Set(corridor?.stations.map((s) => s.id) ?? []), [corridor]);
  // AF-5: a section without a measuring station — the page shows its forecast only.
  const gap = corridor ? isGapCorridor(corridor) : false;
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
  // AW-6.2.9: the virtual road sensor's run of the corridor (its own product, `road/vs/v1`), only behind the switch.
  const vsView = useRoadVs(vs, fcCorridorId);
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
    // AF-5: a section without a station opens on its first forecast point (a fixed place, not a value).
    return defaultPoint ? null : gap ? firstRoadFcAxis(fcFile) : defaultRoadFcAxis(fcFile, fcMs);
    // The default must not jump with the clock: only file and selection decide.
  }, [fcFile, fcById, stId, shownById, defaultPoint, gap]); // eslint-disable-line react-hooks/exhaustive-deps
  const point: RoadPoint | null = axis ? null : stId && shownById.get(stId) ? shownById.get(stId)! : defaultPoint;

  // V-AW-26: a selected station outside the open corridor's file (federal/state road, or another corridor) gets its
  // forecast from the run's station map — loaded only for that station, cached per run.
  const fcRunEntry = fcFile && fcOwn?.run ? fcOwn.run : null;
  const needStation = point && fcRunEntry && !fcById.has(point.id) ? point.id : null;
  const [fcStation, setFcStation] = useState<{ key: string; load: RoadFcStationLoad | null } | null>(null);
  const fcStationKey = needStation && fcRunEntry ? `${fcRunEntry.run}/${needStation}` : null;
  useEffect(() => {
    if (!fcStationKey || !fcRunEntry || !needStation) return;
    const ac = new AbortController();
    setFcStation({ key: fcStationKey, load: null });
    loadRoadFcStation(fcRunEntry, needStation, ac.signal).then((l) => setFcStation({ key: fcStationKey, load: l }), () => {});
    return () => ac.abort();
  }, [fcStationKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fcStationNow = fcStation && fcStation.key === fcStationKey ? fcStation : null;

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
  const urlState: RoadUrlState = { corridor: corridor?.id ?? corridorId, st: stId, t: time, dir, tab, ...(hz ? { seg: segId, hf: hzFilter, ds: inDossier } : {}) };
  const urlKey = JSON.stringify(urlState);
  useEffect(() => { if (!firstCorridor.current) onUrlState(urlState); }, [urlKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!corridor) return;
    onCorridor({ ...urlState, corridor: corridor.id }, firstCorridor.current);
    firstCorridor.current = false;
  }, [corridor?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickCorridor = useCallback((id: string) => { setCorridorId(id); setStId(null); setSheet('peek'); setPicker(false); if (hz) setSegId(null); }, [hz]);
  const pickStation = useCallback((id: string) => {
    setStId(id); setCardOff(null);
    setTab((t) => (t === 'quellen' ? (hz ? 'gefahren' : 'station') : t));
    // AW-8: a click on a measuring point opens the detail of its segment (E-AW-37).
    if (hz && !isRoadFcAxisId(id) && segments && segments !== 'error') { const s = segmentOfStation(segments, id, corridorId); if (s) { setSegId(s.id); setTab('gefahren'); } }
    if (isRoadFcAxisId(id)) return;
    const owner = corridors?.find((c) => c.id === corridorId && c.stations.some((s) => s.id === id))
      ?? corridors?.find((c) => c.stations.some((s) => s.id === id));
    if (owner && owner.id !== corridorId) setCorridorId(owner.id);
  }, [corridors, corridorId, hz, segments]);
  // AW-8: open a segment — corridor, main station (coldest valid road) and the detail.
  const pickSegment = useCallback((id: string) => {
    const s = segMap.get(id);
    if (!s) return;
    setSegId(id); setTab('gefahren'); setSheet('open');
    if (s.corridor !== corridorId) setCorridorId(s.corridor);
    const main = segmentMainStation(s, shownById);
    setStId(main); setCardOff(null);
  }, [segMap, corridorId, shownById]);
  // AWD: a click on a list row is the explicit wish for the details ⇒ open the segment AND switch to the dossier.
  // A click on the map only marks (segment line, callout, row in the list with „Dossier öffnen“).
  const openDossier = useCallback((id: string) => { pickSegment(id); setStage('dossier'); }, [pickSegment]);
  // A click on the map picks the segment, but leaves the choice to the card: „Detailansicht öffnen“ switches to the dossier.
  const pickSegmentFromMap = useCallback((id: string) => { pickSegment(id); setSheet('peek'); setMapSeg(id); setMapCorr(null); }, [pickSegment]);
  const pickCorridorFromMap = useCallback((id: string) => { pickCorridor(id); setMapSeg(null); setMapCorr(id); }, [pickCorridor]);
  const pickStationFromMap = useCallback((id: string) => {
    pickStation(id);
    if (hz && !isRoadFcAxisId(id) && segments && segments !== 'error') { const s = segmentOfStation(segments, id, corridorId); if (s) { setMapSeg(s.id); setMapCorr(null); } }
  }, [pickStation, hz, segments, corridorId]);
  const hzBack = useCallback(() => { setSegId(null); setDsChapter(1); }, []);
  const hzStep = useCallback((d: 1 | -1) => {
    if (!segId || !hzOrder.length) return;
    const i = hzOrder.indexOf(segId);
    pickSegment(hzOrder[(i + d + hzOrder.length) % hzOrder.length]);
  }, [segId, hzOrder, pickSegment]);

  const filtered = useMemo(() => searchCorridors(corridors ?? [], shownById, query), [corridors, shownById, query]);
  const standLabel = gap ? roadGapHead(fcFile ? roadFcEngineName(fcFile) : null, fcLabel)
    : obs && !noData ? `Messung ${hm(obs.slotMs)}${freshness === 'stale' ? ' · veraltet' : ''}` : 'keine Messdaten';
  const liveTone = noData || !obs ? 'none' : freshness === 'live' ? 'live' : 'stale';
  // M5 (D-9): before the first answer the page is loading, not without data.
  const loadingObs = !load;
  const dockLoading = { corridors: corrState === 'loading', obs: loadingObs };
  // Overlays cover the map: mobile pill + chips on top, the sheet (design 414 px) at the bottom; desktop band 165 px.
  const padding = isMobile ? { top: 130, bottom: 430, left: 24, right: 24 } : { top: 110, bottom: hz ? 80 : 232, left: 40, right: 60 };
  const ends = corridor ? corridorEnds(corridor, dir) : null;

  // --- pieces -----------------------------------------------------------------------------------------
  const pill = corridor && ends && (
    <div className="aw-pill">
      <span className="aw-pill-shields">{corridor.shields.map((s) => <span key={s} className="aw-shield">{s}</span>)}</span>
      <span className="aw-pill-body">
        <span className="aw-pill-title">{corridorRouteText(corridor, dir)}</span>
        <span className="aw-pill-sub">{corridorHeading(corridor, dir)} · {corridor.countries.join(' · ')}{gap ? ` · ${ROAD_GAP_SHORT}` : isMobile ? ` · ${corridor.stations.length} Messpunkte` : ''}</span>
      </span>
      <button type="button" className="aw-icon-btn" aria-label="Fahrtrichtung wechseln" onClick={() => setDir((d) => (d ? 0 : 1))}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h14l-4-4M20 16H6l4 4" /></svg>
      </button>
    </div>
  );
  // AW-8: hourly chips 0 … 6 behind the switch — the one time state of map, band, matrix and detail.
  const setTimeShared = (h: RoadTime) => { setTime(h); if (hz) setHzMode(h === 0 ? 'now' : h); };
  const times = (
    <div role="group" aria-label="Zeitpunkt" className={`aw-seg aw-times${hz ? ' is-hourly' : ''}`}>
      {(hz ? ROAD_HZ_TIMES : ROAD_TIMES).map((h) => {
        const enabled = h === 0 || (ROAD_FORECAST_ENABLED && !!fcFile);
        return (
          <button key={h} type="button" aria-pressed={h === t} className={h === t ? 'is-active' : ''} disabled={!enabled} onClick={() => setTimeShared(h)}
            title={enabled ? (h === 0 ? undefined : `Wetterprognose von ${roadFcEngineName(fcFile)} für ${hm(nowMs + h * 3_600_000)} (${fcLabel})${gap ? '' : ' — Karte und Band zeigen weiter die Messung'}`) : `Wetterprognose derzeit nicht verfügbar (${fcLabel}).`}>
            {h === 0 ? `Jetzt${!gap && obs && !noData ? ` · ${hm(obs.slotMs)}` : ''}` : `+${h} h`}
          </button>
        );
      })}
    </div>
  );
  const legend = (
    // Frosted bar at the foot of the map, right-aligned (Jan 27.10., like the Seewetter and Gletscher legends): one column per layer.
    <div className="aw-legend aw-legend-bar" aria-label="Legende">
      <div className="aw-legend-sec">
        <span className="aw-eyebrow">Fahrbahn</span>
        <div className="aw-legend-grid">
          {(['ice', 'frost', 'wet', 'dry'] as const).map((c) => <span key={c}><i style={{ background: ROAD_CLASS_COLOR[c] }} />{ROAD_CLASS_LABEL[c].label}</span>)}
          {/* Hatched = `unknown` (temperature, no condition) AND `nodata` — never "dry" (D-04). */}
          <span><i className="is-hatched" />Zustand unbekannt / keine Messung</span>
          {vsView.file && <span><i className="is-vs-sim" />Rot umrandet = berechnet</span>}
          {gap && <span><i className="is-fc-line" style={{ background: ROAD_FC_LINE_COLOR }} />Abschnitt ohne Messstelle · {ROAD_GAP_SHORT}</span>}
        </div>
      </div>
      {layers.rain && (
        <div className="aw-legend-sec">
          <span className="aw-eyebrow">Niederschlag jetzt</span>
          <span className="aw-legend-rain" role="status"><i />{rain?.validAtMs != null && rain.state !== 'error' ? `Radar ${hm(rain.validAtMs)} · DWD RADOLAN` : rain?.state === 'none' || rain?.state === 'error' ? 'Radar derzeit nicht lesbar' : 'Radar lädt'}</span>
        </div>
      )}
      {fcFile && layers.fc && (
        <div className="aw-legend-sec">
          <span className="aw-eyebrow">Prognose Luft · {t === 0 ? 'jetzt' : `+${t} h`}</span>
          {(['frost', 'near', 'above'] as const).map((k) => <span key={k}><i className="is-dot" style={{ background: ROAD_FC_AIR_COLOR[k] }} />{ROAD_FC_AIR_LABEL[k]}</span>)}
        </div>
      )}
      {hz && hzShown && (
        <div className="aw-legend-sec">
          <span className="aw-eyebrow">Gefahren · {hzMode === 'p6' ? 'bis +6 h' : t === 0 ? 'jetzt' : `+${t} h`}</span>
          {([1, 2, 3] as const).map((l) => <span key={l}><i className="is-bar" style={{ background: AW_SEV[l].bg }} />Stufe {l}</span>)}
          <span><i className="is-bar is-dotted" />unbekannt</span>
        </div>
      )}
    </div>
  );
  const emptyMap = noData && <div className="aw-map-note" role="status"><strong>Derzeit keine Messdaten.</strong> {noData}</div>;
  const corrFail = corrState === 'error' && <div className="aw-map-note" role="status"><strong>Korridore nicht ladbar.</strong> Die Messpunkte erscheinen trotzdem auf der Karte.</div>;
  const zoom = (d: number) => { const m = mapRef.current; if (m) { if (d > 0) m.zoomIn(); else m.zoomOut(); } };

  const axisValue = axis && fcFile ? roadFcValue(axis, fcFile, fcMs) : null;
  const fcDots = useMemo<RoadFcDot[]>(() => (!fcFile ? [] : roadFcAxisPoints(fcFile).map((p) => {
    const v = roadFcValue(p, fcFile, fcMs);
    // Air colour only: a forecast dot never looks like a measured road class (Jan 28.10.: no road classes on the axis dots).
    return { id: p.id, lon: p.lon, lat: p.lat, color: v ? ROAD_FC_AIR_COLOR[roadFcAirClass(v.t)] : null };
    // Hour steps only: the dots change when the valid hour changes, not every minute.
  })), [fcFile, Math.round(fcMs / 3_600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  // AW-6.2.9: stations of the open corridor without a road measurement, with the virtual sensor's value of the shown hour (map marker + label).
  // Jan 28.10.: a failed sensor is simulated only while ONE measurement is missing, so the 24-h ring of every group with a failed sensor is needed.
  const failedGroups = useMemo(() => {
    const g = new Set<string>();
    if (vsView.file) for (const s of mapPoints) if (s.rs == null && s.g) g.add(s.g);
    return [...g].sort().slice(0, 12);
  }, [vsView, mapPoints]);
  const failedKey = `${failedGroups.join('|')}@${obsSlot}`;
  const [vsRings, setVsRings] = useState<ReadonlyMap<string, RoadH24File>>(() => new Map());
  useEffect(() => {
    if (!obsSlot || !failedGroups.length) { setVsRings((m) => (m.size ? new Map() : m)); return; }
    const ac = new AbortController();
    Promise.all(failedGroups.map((g) => loadRoadH24(g, obsSlot, ac.signal).catch(() => null))).then((rings) => {
      if (ac.signal.aborted) return;
      const m = new Map<string, RoadH24File>();
      rings.forEach((r, i) => { if (r) m.set(failedGroups[i], r); });
      setVsRings(m);
    });
    return () => ac.abort();
  }, [failedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const vsMarkers = useMemo(() => {
    const out = new Map<string, { tf: number; cls: ReturnType<typeof roadVsClassOf> }>();
    if (!vsView.file) return out;
    for (const s of mapPoints) {
      if (s.rs != null || !roadVsMaySimulate(s.g ? vsRings.get(s.g) ?? null : null, s.id, s.g)) continue;
      const pt = vsView.byId.get(s.id);
      const v = pt ? roadVsValue(pt, vsView.file, fcMs) : null;
      if (v) out.set(s.id, { tf: v.tf, cls: roadVsClassOf(v) });
    }
    return out;
  }, [vsView, mapPoints, vsRings, Math.round(fcMs / 3_600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const vsAtSel = (id: string | null | undefined) => { const pt = id && vsView.file ? vsView.byId.get(id) : undefined; return pt && vsView.file ? roadVsValue(pt, vsView.file, fcMs) : null; };
  // Phase FB: a station of the open corridor without a road measurement takes the computed road temperature of the nearest
  // forecast point of the axis (≤ 6 km) — on the map as „~+1,2°“, never as a road class (D-04).
  const fcRs = useMemo(() => {
    const out = new Map<string, number>();
    if (!surface || !fcFile || !roadFcHasSurface(fcFile)) return out;
    const axisVals = roadFcAxisPoints(fcFile).map((a) => ({ a, v: roadFcValue(a, fcFile, fcMs) })).filter((x) => x.v?.rs != null);
    for (const s of mapPoints) {
      if (s.rs != null || !inCorridor.has(s.id)) continue;
      let best: number | null = null, bestKm = 6;
      for (const { a, v } of axisVals) {
        const dKm = Math.hypot((a.lon - s.lon) * 111.32 * Math.cos((s.lat * Math.PI) / 180), (a.lat - s.lat) * 110.57);
        if (dKm < bestKm) { bestKm = dKm; best = v!.rs; }
      }
      if (best != null) out.set(s.id, best);
    }
    return out;
    // Hour steps only, like the forecast dots.
  }, [surface, fcFile, mapPoints, inCorridor, Math.round(fcMs / 3_600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const fcCells = useMemo(() => (fcFile && corridor ? roadFcBand(corridor, fcFile, dir, fcMs) : null), [fcFile, corridor, dir, Math.round(fcMs / 3_600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const fcBandLabel = `Prognose Luft ${t === 0 ? 'jetzt' : `+${t} h`} · ${hm(Math.round(fcMs / 3_600_000) * 3_600_000)} · ${fcLabel}`;
  const callout = axis && corridor ? {
    lon: axis.lon, lat: axis.lat, name: roadFcAxisName(corridor, axis, dir),
    line: [vsAtSel(axis.id) ? `${roadVsText(vsAtSel(axis.id)!)} (${roadVsOriginText(vsAtSel(axis.id)!)})` : null, axisValue ? `Prognose ${roadFcLine(axisValue)}` : 'keine Prognose für diese Stunde'].filter(Boolean).join(' · '),
    color: vsAtSel(axis.id) ? ROAD_CLASS_COLOR[roadVsClassOf(vsAtSel(axis.id)!)] : axisValue ? ROAD_FC_AIR_COLOR[roadFcAirClass(axisValue.t)] : null,
  } : point ? {
    lon: point.lon, lat: point.lat, name: point.n,
    line: point.rs != null ? `Fahrbahn ${f1(point.rs)} °C · ${ROAD_CLASS_LABEL[point.cls].label}`
      : vsMarkers.has(point.id) ? `${roadVsText(vsAtSel(point.id)!)} (${roadVsOriginText(vsAtSel(point.id)!)})`
      : [point.cls === 'nodata' && roadNoValueSince(ring, point.id, point.g, obs?.slotMs ?? point.t) || ROAD_CLASS_LABEL[point.cls].label,
        fcRs.has(point.id) ? `Fusion Fahrbahn ${f1(fcRs.get(point.id) as number)} °C (berechnet)` : null].filter(Boolean).join(' · '),
    color: point.rs == null && vsMarkers.has(point.id) ? ROAD_CLASS_COLOR[vsMarkers.get(point.id)!.cls] : isHatched(point.cls) ? null : ROAD_CLASS_COLOR[point.cls],
  } : null;
  const map = (
    <RoadMap corridors={corridors ?? []} corridor={corridor} points={mapPoints} inCorridor={inCorridor}
      selectedId={axis?.id ?? point?.id ?? null} stale={freshness === 'stale'} layers={layers} warnAreas={warnAreas} padding={padding}
      onSelect={pickStationFromMap} onMap={(m) => { mapRef.current = m; }} callout={isMobile ? callout : null} fcDots={fcDots} fcRs={fcRs} vsPoints={vsMarkers} onRain={setRain}
      segLines={hz ? segLines : undefined} selSegId={hz ? segId : null} hoverSegId={hz ? hoverSeg : null} onSelectSegment={hz ? pickSegmentFromMap : undefined} onSelectCorridor={hz ? pickCorridorFromMap : pickCorridor} />
  );
  const readoutProps = {
    tab, onTab: setTab, point, corridor, byId: shownById, dir, slotMs: obs?.slotMs ?? null, nowMs,
    stale: freshness === 'stale', ring, vsRings, warnings: pointWarnings, warnState: warn.state, warnAt: warn.at, departOffsetMin: departMin,
    onDepart: (d: number) => setDepartMin((m) => Math.max(0, Math.min(345, m + d))), onPick: pickStation, noData,
    fcFile, fcById, fcLabel, axis, time: t, onTime: setTimeShared,
    fcStation: fcStationNow ? (fcStationNow.load ?? ('loading' as const)) : null,
    surface, vs: vsView,
  };
  // AW-8 / AWD: the readout's Gefahren tab carries the rail (Lage) in both stages — the detail of the open segment lives in the dossier (E-AWD-1).
  const hzNode = !hz ? undefined : (<Suspense fallback={<div className="aw-hz aw-hz-loading" role="status">Gefahren werden geladen …</div>}>
    <RoadHazardPanel file={hzShown} state={hzState} segments={segMap} mode={hzMode} filter={hzFilter} selectedId={segId} nowMs={nowMs}
      onMode={(m) => { setHzMode(m); if (m === 'now') setTime(0); else if (typeof m === 'number') setTime(m); }} onFilter={setHzFilter} onHour={(h) => setTime(h)}
      onPick={openDossier} onHover={setHoverSeg} onOpenDossier={inDossier ? undefined : openDossier} />
  </Suspense>);
  const readout = <RoadReadout {...readoutProps} hz={hzNode} />;

  // AWD: the dossier of the centre — the strip of the corridor, then the detail of the open segment (or the empty state).
  const hzWhy = hzState === 'loading' ? 'Gefahren werden geladen …'
    : hzState === 'dead' ? 'Die Gefahrenauswertung ist älter als 3 Stunden.'
      : hzState === 'no-segments' ? 'Die Abschnitte sind nicht ladbar.'
        : 'Für diesen Slot liegt keine geprüfte Gefahrenauswertung vor.';
  const noSeg = (
    <div className="aw-dossier-empty" role="status">
      {segId && !hzShown
        ? <><strong>Abschnitt nicht verfügbar.</strong> {hzWhy}</>
        : <><strong>Kein Abschnitt markiert.</strong> Wähle in der Streckenkarte einen Abschnitt — dann erscheinen hier Fahrbahn, Gefahren-Fahrplan und Wetter.</>}
      {dsChapter !== 1 && <button type="button" className="aw-ds-link" onClick={() => setDsChapter(1)}>Zur Streckenkarte →</button>}
    </div>
  );
  const dossierBody = !hz ? null : dsChapter === 1 ? (
    <>
      {corridor && (
        <RoadRouteCard corridor={corridor} dir={dir} segs={corrSegs} geo={segGeoMap} states={segStates} rows={corrRows} byId={shownById} others={corridors ?? []}
          selectedId={segId} onPick={pickSegment} segNote={segments === 'error' ? 'Die Abschnitte sind nicht ladbar.' : !segments ? 'Abschnitte werden geladen …' : hzShown ? null : hzWhy} />
      )}
      {openSeg && <RoadPickBar seg={openSeg} state={segStates.get(openSeg.id)} onOpen={() => setDsChapter(2)} />}
      {corridor && <RoadBand inline corridor={corridor} byId={shownById} dir={dir} selectedId={axis?.id ?? point?.id ?? null} standLabel={standLabel} zust={layers.zust} onPick={pickStation} fc={fcCells} fcLabel={fcBandLabel} fcWhy={fcLabel} />}
      {!openSeg && noSeg}
      {/* Mobile has no readout column in this stage: the hazard list is a second way into a segment. */}
      {isMobile && !openSeg && <div className="aw-dossier-list">{hzNode}</div>}
    </>
  ) : openSeg && hzShown ? (
    <Suspense fallback={<div className="aw-hz aw-hz-loading" role="status">Gefahren werden geladen …</div>}>
      <RoadHazardDetail part={dsChapter === 2 ? 'seg' : 'wx'} surface={surface}
        seg={openSeg} entry={hzShown.seg[openSeg.id] ?? null} file={hzShown} prev={hzPrev && hzPrev.slot === hzSlot ? hzPrev.files : [undefined, undefined]}
        corridor={corridor} byId={shownById} fcFile={fcFile} ring={ring} nowMs={nowMs} dir={hzDir} onDir={setHzDir} backLabel="Alle Abschnitte"
        pos={{ i: Math.max(1, hzOrder.indexOf(openSeg.id) + 1), n: Math.max(1, hzOrder.length) }} onBack={hzBack} onPrev={() => hzStep(-1)} onNext={() => hzStep(1)}
        warnings={pointWarnings} warnState={warn.state} warnAt={warn.at} stale={freshness === 'stale'} />
    </Suspense>
  ) : noSeg;
  const dossier = !inDossier ? null : (
    <>
      {corridor && <RoadDossierHead corridor={corridor} dir={dir} byId={shownById} states={segStates} hzOk={!!hzShown} segCount={corrSegs.length} standLabel={standLabel} />}
      <RoadDossierTabs value={dsChapter} onChange={setDsChapter} segName={openSeg?.name ?? null} />
      {dossierBody}
    </>
  );
  // The preview card of the map-picked segment (same row as the hazard list, so card and list say the same).
  const mapCardSeg = hz && !inDossier && mapSeg && mapSeg === segId ? segMap.get(mapSeg) ?? null : null;
  // ... and the one of a corridor picked on the map: key facts of the road plus the hazard count of its segments.
  const mapCardCorr = hz && !inDossier && !mapCardSeg && corridor && mapCorr === corridor.id ? corridor : null;
  const corrCard = (c: RoadCorridor) => {
    const pts = c.stations.map((st) => shownById.get(st.id)).filter((x): x is RoadPoint => !!x);
    const nCrit = pts.filter((x) => isCritical(x.cls)).length;
    const coldest = pts.filter((x) => x.rs != null).sort((a, b) => (a.rs as number) - (b.rs as number))[0];
    const haz = hzGroups.flatMap((g) => g.rows).filter((r) => r.seg.corridor === c.id && r.best.lv !== null);
    const facts = [
      isGapCorridor(c) ? ROAD_GAP_SHORT : `${pts.length} von ${c.stations.length} Messpunkten mit Daten${nCrit ? `, ${nCrit} mit Glätte oder Frostgefahr` : ''}`,
      ...(coldest ? [`Kälteste Stelle: ${coldest.n} ${f1(coldest.rs as number)} °C`] : []),
    ];
    return (
      <RoadCorridorCard shields={c.shields} title={corridorRouteText(c, dir)} sub={`${corridorHeading(c, dir)} · ${c.countries.join(' · ')} · ${Math.round(c.lengthKm)} km`}
        facts={facts} hazard={hzShown ? { n: haz.length, max: haz.reduce<RoadLevel | null>((m, r) => (r.best.lv !== null && (m === null || r.best.lv > m) ? r.best.lv : m), null) } : null}
        onOpenDossier={() => { setMapCorr(null); setStage('dossier'); }} onClose={() => setMapCorr(null)} />
    );
  };
  // Desktop: the selected point's text lives in the preview card (bottom left), no longer as a callout in the map;
  // mobile keeps the callout (the card there covers the briefing sheet).
  const selId = axis?.id ?? point?.id ?? null;
  const stCard: RoadCardStation | null = callout && !isMobile && !inDossier && selId !== cardOff
    ? { kind: axis ? 'Prognosepunkt' : 'Messstelle', name: callout.name, line: callout.line, color: callout.color } : null;
  const mapCardEl = mapCardSeg ? (
    <RoadMapCard seg={mapCardSeg} row={hzGroups.flatMap((g) => g.rows).find((r) => r.segId === mapCardSeg.id) ?? null} station={stCard}
      onOpenDossier={() => { setMapSeg(null); setStage('dossier'); }} onClose={() => { setMapSeg(null); setCardOff(selId); }} />
  ) : mapCardCorr ? corrCard(mapCardCorr)
    : stCard ? <RoadStationCard station={stCard} shields={corridor?.shields ?? []} onClose={() => setCardOff(selId)} /> : null;
  /** Segment „Karte | Dossier“ (Desktop topbar, mobile top row) — only behind the hazard switch. */
  const stageSeg = !hz ? null : (
    <div className="aw-seg aw-stage-seg" role="group" aria-label="Bühne der Mitte">
      <button type="button" aria-pressed={!inDossier} className={!inDossier ? 'is-active' : ''} onClick={() => setStage('map')}>Karte</button>
      <button type="button" aria-pressed={inDossier} className={inDossier ? 'is-active' : ''} onClick={() => setStage('dossier')}>Dossier</button>
    </div>
  );
  // The map stays mounted behind the dossier (no re-init); coming back it must measure its box again.
  useEffect(() => {
    if (inDossier) return;
    const id = window.requestAnimationFrame(() => mapRef.current?.resize());
    return () => window.cancelAnimationFrame(id);
  }, [inDossier]);;

  // --- mobile ---------------------------------------------------------------------------------------------
  if (isMobile) {
    const rows = corridor ? corridor.stations.map((s) => ({ s, p: shownById.get(s.id) })).filter((r): r is { s: RoadCorridor['stations'][number]; p: RoadPoint } => !!r.p) : [];
    const critical = rows.filter((r) => isCritical(r.p.cls)).sort((a, b) => (a.p.rs ?? 99) - (b.p.rs ?? 99)).slice(0, 3);
    const coldest = rows.filter((r) => r.p.rs != null).sort((a, b) => (a.p.rs as number) - (b.p.rs as number))[0];
    const nCrit = rows.filter((r) => isCritical(r.p.cls)).length;
    const slot15 = Math.ceil(nowMs / 900_000) * 900_000;
    const list = (critical.length ? critical : rows.slice(0, 3));
    // AF-5: on a section without a measuring station the sheet lists forecast points (the three with the coldest air, by km).
    const axisAll = gap && fcFile && corridor ? roadFcAxisPoints(fcFile).map((a) => ({ a, km: kmIn(corridor, a.km as number, dir), v: roadFcValue(a, fcFile, fcMs) })) : [];
    const axisList = axisAll.slice().sort((x, y) => (x.v?.t ?? 99) - (y.v?.t ?? 99)).slice(0, 3).sort((x, y) => x.km - y.km);
    const mPill = corridor && ends && (
      <button type="button" className="aw-pill is-button" aria-haspopup="dialog" aria-expanded={picker} onClick={() => setPicker(true)}>
        <span className="aw-pill-shields">{corridor.shields.map((s) => <span key={s} className="aw-shield">{s}</span>)}</span>
        <span className="aw-pill-body">
          <span className="aw-pill-title">{corridorRouteText(corridor, dir)}</span>
          <span className="aw-pill-sub">{corridorHeading(corridor, dir)} · {gap ? ROAD_GAP_SHORT : `${corridor.stations.length} Messpunkte`}</span>
        </span>
        <svg className="aw-pill-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
    );
    return (
      <div className="aw-root is-mobile">
        <main className="aw-map is-mobile" aria-label={inDossier ? 'Dossier' : 'Karte'}>
          <div className="aw-m-mapwrap" hidden={inDossier}>{map}</div>
          <div className="aw-m-top">{mPill}<ShareButton className="aw-m-share" compact /></div>
          <div className="aw-m-times">{times}</div>
          {stageSeg && <div className="aw-m-stage">{stageSeg}</div>}
          {!inDossier && emptyMap}
          {mapCardEl && <div className="aw-map-card">{mapCardEl}</div>}
          {inDossier && <div className="aw-m-dossier">{dossier}</div>}
        </main>
        <section className={`aw-sheet is-${sheet}`} aria-label="Strecken-Briefing" hidden={inDossier || !!mapCardEl}>
          <button type="button" className="aw-sheet-grip" aria-label={sheet === 'open' ? 'Briefing verkleinern' : 'Briefing aufklappen'} aria-expanded={sheet === 'open'}
            onClick={() => setSheet((s) => (s === 'open' ? 'peek' : 'open'))}><span /></button>
          <div className="aw-sheet-head">
            <span className="aw-eyebrow is-accent">Strecken-Briefing</span>
            <span className={`aw-eyebrow is-${liveTone}`}>{liveTone === 'live' ? `Live · ${hm(obs!.slotMs)}` : liveTone === 'stale' ? `veraltet · ${hm(obs!.slotMs)}` : loadingObs ? 'Messung lädt …' : 'keine Messdaten'}</span>
          </div>
          <h2 className="aw-sheet-title">{gap ? ROAD_GAP_TITLE : loadingObs ? 'Messung lädt …' : noData ? 'Derzeit keine Messdaten' : coldest ? `Kälteste Stelle: ${coldest.p.n} ${f1(coldest.p.rs as number)} °C` : 'Keine gültige Fahrbahnmessung'}</h2>
          <p className="aw-sheet-lead">{gap
            ? (fcFile ? `Wetterprognose von ${roadFcEngineName(fcFile)} an ${axisAll.length} ${axisAll.length === 1 ? 'Punkt' : 'Punkten'} (${fcRun.label}): Luft, Niederschlag, Wind — keine Fahrbahnmessung, keine Prognose der Fahrbahn.` : `Die Fahrbahn wird hier nicht gemessen; die Wetterprognose ist derzeit nicht verfügbar (${fcLabel}).`)
            : loadingObs ? 'Die jüngste Messung der DWD-Glättemeldeanlagen wird geladen.' : noData ?? `${nCrit} von ${rows.length} DWD-Anlagen mit Glätte oder Frostgefahr gemessen${corridor?.borders.length ? '; ab der Grenze keine offene Fahrbahnmessung' : ''}.`}</p>
          {corridor && <MiniBand corridor={corridor} byId={shownById} dir={dir} fc={fcCells} fcLabel={fcBandLabel} gap={gap} />}
          {corridor && gap && fcFile && (
            <>
              <div className="aw-sheet-list">
                {axisList.map(({ a, km, v }) => (
                  <button key={a.id} type="button" className="aw-sheet-row" onClick={() => { pickStation(a.id); setTab('station'); }}>
                    <i className={v ? '' : 'is-hatched'} style={v ? { background: ROAD_FC_AIR_COLOR[roadFcAirClass(v.t)] } : undefined} />
                    <span><strong>{roadFcAxisName(corridor, a, dir)}</strong><em>{v ? `Prognose ${roadFcLine(v)}` : 'keine Prognose für diese Stunde'}</em></span>
                    <span className="aw-sheet-eta" title={`Ankunft bei Abfahrt jetzt am Anfang der Strecke, Ø ${DEFAULT_SPEED_KMH} km/h`}><em>an · Ø {DEFAULT_SPEED_KMH}</em><strong>{hm(slot15 + (km / DEFAULT_SPEED_KMH) * 3_600_000)}</strong></span>
                  </button>
                ))}
              </div>
              <div className="aw-sheet-actions">
                <button type="button" className="aw-btn is-primary" onClick={() => { setTab('strecke'); setSheet('open'); }}>Alle {axisAll.length} Prognosepunkte</button>
                <button type="button" className="aw-btn is-auto" onClick={() => { setTab('strecke'); setSheet('open'); }}>Abfahrt {hm(slot15 + departMin * 60_000)} · Ø {DEFAULT_SPEED_KMH} km/h</button>
              </div>
            </>
          )}
          {corridor && gap && sheet === 'open' && <div className="aw-sheet-readout">{readout}</div>}
          {corridor && !gap && !noData && (
            <>
              <div className="aw-sheet-list">
                {list.map(({ s, p }) => (
                  <button key={s.id} type="button" className="aw-sheet-row" onClick={() => { pickStation(s.id); setTab('station'); }}>
                    <i className={isHatched(p.cls) ? 'is-hatched' : ''} style={!isHatched(p.cls) ? { background: ROAD_CLASS_COLOR[p.cls] } : undefined} />
                    <span><strong>{p.n} · km {Math.round(kmIn(corridor, s.km, dir))}</strong><em>{p.rs != null ? `jetzt ${f1(p.rs)} °C, ${ROAD_CLASS_LABEL[p.cls].label}` : ROAD_CLASS_LABEL[p.cls].label} · gemessen {hm(p.t)}</em></span>
                    <span className="aw-sheet-eta" title={`Ankunft bei Abfahrt jetzt am Anfang der Strecke, Ø ${DEFAULT_SPEED_KMH} km/h`}><em>an · Ø {DEFAULT_SPEED_KMH}</em><strong>{hm(slot15 + (kmIn(corridor, s.km, dir) / DEFAULT_SPEED_KMH) * 3_600_000)}</strong></span>
                  </button>
                ))}
              </div>
              <div className="aw-sheet-actions">
                <button type="button" className="aw-btn is-primary" onClick={() => { setTab('strecke'); setSheet('open'); }}>Alle {rows.length} Messpunkte</button>
                <button type="button" className="aw-btn is-auto" onClick={() => { setTab('strecke'); setSheet('open'); }}>Abfahrt {hm(slot15 + departMin * 60_000)} · Ø {DEFAULT_SPEED_KMH} km/h</button>
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
              country={country} onCountry={setCountry} layers={layers} onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))} summary={summary} hasData={!noData && !!obs} loading={dockLoading} />
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
            {stageSeg}
            <span className={`aw-live is-${liveTone}`} role="status"><span className="aw-live-dot" aria-hidden="true"><span /><span /></span>{liveTone === 'live' ? 'Live' : liveTone === 'stale' ? 'Veraltet' : loadingObs ? 'Lädt' : 'Keine Daten'}</span>
            <span className="aw-topbar-stand">
              {obs && !noData ? <>Messung <strong>{hm(obs.slotMs)}</strong> · {summary.activeGroups} von {summary.totalGroups} DWD-Reihen</> : loadingObs ? 'Messung lädt …' : 'derzeit keine Messdaten'}
              {fcFile && <> · Prognose {fcRun.label}</>}
            </span>
            <ShareButton className="aw-share" text="Teilen" />
          </div>
        </header>
        <div className="aw-body">
          <RoadDock part="layers" corridors={filtered} byId={shownById} selectedId={corridor?.id ?? null} onPick={pickCorridor} query={query} onQuery={setQuery}
            country={country} onCountry={setCountry} layers={layers} onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))} summary={summary} hasData={!noData && !!obs} loading={dockLoading} />
          {inDossier && (
            <main className="aw-dossier-stage" aria-label="Dossier">
              <div className="aw-dossier-head">{pill}{times}</div>
              <div className="aw-dossier-body">{dossier}</div>
            </main>
          )}
          <main className={`aw-map${fcCells ? ' has-fc' : ''}${hz ? ' no-band' : ''}`} aria-label="Karte" hidden={inDossier}>
            {map}
            <div className="aw-ov-left">{pill}{times}</div>
            <div className="aw-ov-right">
              <div className="aw-zoom">
                <button type="button" aria-label="Hineinzoomen" onClick={() => zoom(1)}>+</button>
                <button type="button" aria-label="Herauszoomen" onClick={() => zoom(-1)}>−</button>
              </div>
            </div>
            <div className="aw-ov-legend">{legend}</div>
            {emptyMap}{corrFail}
            {mapCardEl && <div className="aw-map-card">{mapCardEl}</div>}
            {/* AWD: with the hazard switch the strip lives in the dossier only; without it the map keeps its strip (rollback = the page of before). */}
            {corridor && !hz && <RoadBand corridor={corridor} byId={shownById} dir={dir} selectedId={axis?.id ?? point?.id ?? null} standLabel={standLabel} zust={layers.zust} onPick={pickStation} fc={fcCells} fcLabel={fcBandLabel} fcWhy={fcLabel} />}
          </main>
          <RoadReadout {...readoutProps} hz={hzNode} roads={(
            <RoadDock part="roads" corridors={filtered} byId={shownById} selectedId={corridor?.id ?? null} onPick={pickCorridor} query={query} onQuery={setQuery}
              country={country} onCountry={setCountry} layers={layers} onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))} summary={summary} hasData={!noData && !!obs} loading={dockLoading} />
          )} />
        </div>
      </div>
    </div>
  );
}

const EMPTY_BY_ID: ReadonlyMap<string, RoadPoint> = new Map();

/** Mobile mini band (design: 10 px, towns underneath). */
function MiniBand({ corridor, byId, dir, fc, fcLabel, gap = false }: { corridor: RoadCorridor; byId: ReadonlyMap<string, RoadPoint>; dir: 0 | 1; fc: ReturnType<typeof roadFcBand> | null; fcLabel: string; gap?: boolean }) {
  const segs = bandSegments(corridor, byId, dir);
  const len = corridor.lengthKm;
  const towns = corridor.towns.map(([km, n]) => [kmIn(corridor, km, dir), n] as const).sort((a, b) => a[0] - b[0]);
  const pick = [towns[0], towns[Math.floor(towns.length / 2)], towns[towns.length - 1]].filter((t, i, a) => !!t && a.indexOf(t) === i);
  return (
    <>
      {/* AF-5: no measured bar on a section without a measuring station — the forecast row is the band. */}
      {!gap && <div className="aw-miniband" aria-hidden="true">
        {segs.map((g, i) => (
          <div key={i} className={`aw-band-seg${g.cls === 'gap' || isHatched(g.cls) ? ' is-gap' : ''}`}
            style={{ left: `${(g.fromKm / len) * 100}%`, width: `${((g.toKm - g.fromKm) / len) * 100}%`, ...(g.cls !== 'gap' && !isHatched(g.cls) ? { background: ROAD_CLASS_COLOR[g.cls] } : {}) }} />
        ))}
        {corridor.borders.map((b) => <div key={b.km} className="aw-miniband-border" style={{ left: `${(kmIn(corridor, b.km, dir) / len) * 100}%` }} />)}
      </div>}
      {fc && (
        <div className={`aw-miniband is-fc${gap ? ' is-only' : ''}`} role="img" aria-label={fcLabel} title={fcLabel}>
          {fc.filter((g) => g.cls !== 'gap').map((g) => (
            <div key={g.id} className="aw-band-seg" style={{ left: `${(g.fromKm / len) * 100}%`, width: `${((g.toKm - g.fromKm) / len) * 100}%`, background: ROAD_FC_AIR_COLOR[g.cls as 'frost' | 'near' | 'above'] }} />
          ))}
        </div>
      )}
      <div className="aw-miniband-towns">{pick.map((t) => <span key={t[1]}>{t[1]}</span>)}</div>
    </>
  );
}
