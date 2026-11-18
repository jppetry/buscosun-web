/**
 * SW-5/SW-6 — Seewetter page, Command-Deck (D-27), design `reference/seewetter-desktop.dc.html` (+ mobile).
 * Rail 62 · topbar 60 · dock 250 · map · readout 400, the hourly band as glass panel over the map foot; mobile: full-
 * screen map, spot pill + share (44 px), time chips.
 *
 * Data: `sea/v1/` of buscosun-data via `seaClient.ts` (expected run and issues from the clock, step back on 404, CDN +
 * raw hedge, client checks of the contract). Freshness: run > 18 h "veraltet", > 30 h or kill switch "Keine Daten" and
 * no surface (plan SW-1; Seewetter check 4). Waves = model CWAM, wind/gust = buscosun Fusion (the WAM forcing wind is
 * never read), texts = official, verbatim. `seaDeck.css` is imported only here (lazy chunk).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import { FeatureRail, type RailFeature } from '../nav/featureRail';
import ShareButton from '../share/ShareButton';
import { useAppNav } from '../router/useAppNav';
import { useMediaQuery } from '../mobile/useIsMobile';
import { seaFieldStepAt, seaCompStepAt, seaNoSeaAt, type SeaSpot } from './seaContract';
import { seaDryRuleFrom, seaTideWindowFrom, seaWaterLevelFrom } from './seaFlag';
import { WL_ATTRIBUTION, WL_LICENCE, WL_LICENCE_URL, WL_SERVICE_PAGE, wlAt, wlDistKm, wlNearest, wlNearestWithCurve, type WlForecast, type WlGauge } from './waterLevel';
import {
  encodeTideParam, loadTideThreshold, parseTideParam, saveTideThreshold, tideHours, tideRefOf, tideRefs, tideSeries, tideSideText, tideVerdict, tideWindows,
  type TideThreshold,
} from './tideWindow';
import { TideControl, TideWindows, type SeaTideView } from './SeaTideWindow';
import { BASEMAP_SOURCE, CC_BY_URL, MapSourcesTile, type MapSourceGroup } from '../map/MapSourcesTile';
import { WlCatalogMissing, loadGaugeCatalog, loadGaugeForecast } from './waterLevelClient';
import { coastWarnStatus, seaTextFreshness, type SeaTextProduct } from './seaText';
import { DMI_CREDIT, DMI_HOST, DMI_LICENCE, DMI_LICENCE_URL, DMI_NAME, DMI_WIND_LABEL, dmiPointerOf } from './seaDmi';
import {
  loadAreas, loadCatalog, loadCurrent, loadCurrentField, loadDmi, loadField, loadKillSwitch, loadLatestRun, loadStationObs, loadSpots, loadText, windPointerOf, withDmiWind, withWindRefresh,
  SEA_DMI_NONE, SEA_PAGE_TEXTS, takeSeaChain, takeSeaStatic,
  type SeaAreas, type SeaCatalog, type SeaDmiLoad, type SeaPoiObs, type SeaRunLoad, type SeaSpotsDoc,
} from './seaClient';
import {
  SEA_PROFILE_BY_ID, SHORE_LABEL, limitsSummary, loadLimits, saveLimits, nextAndLongest, fmtWind, unitLabel, SEA_UNITS, MS_TO_KN, windows as verdictWindows,
  type SeaLimits, type SeaProfileId, type SeaUnit, type SeaVerdict,
} from './seaProfiles';
import { SeaVerdictCache } from './seaVerdicts';
import { SEA_MAX_T, SEA_TIME_CHIPS, seaInRevier, type SeaLayer, type SeaRevier, type SeaTab, type SeaUrlState } from './seaState';
import {
  CLASS_COLOR, CLASS_LABEL, CLASS_SHORT, DRY_VALUE, HS_STOPS, LAYER_LABEL, PER_STOPS, H, compass16, cssGradient, dayShort, f1, hh, hm, tzLabel, waveArrows,
} from './seaView';
import { colourFieldAsync } from './seaFieldClient';
import SeaMap, { type SeaMapArea, type SeaMapGauge, type SeaMapPlan, type SeaMapSpot } from './SeaMap';
import SeaPlanPanel, { type SeaPlanCard } from './SeaPlanPanel';
import {
  DRIFT_SIDE_LABEL, PLAN_ASK_SPOT, PLAN_COLOUR_NOTE, PLAN_CUT_NOTE, PLAN_DRIFT_NOTE, PLAN_HOURLY_NOTE, PLAN_LINE_NOTE, PLAN_MOVED_NOTE, PLAN_RADIUS_NOTE, PLAN_TIDAL_NOTE, REL_LABEL,
  SEA_PLAN_DEFAULT_H, SEA_PLAN_RADIUS_KM, badgeText, clampToRadius, defaultBoat, defaultWindow, driftOf, encodePlanParam, lineLabel, parsePlanParam, planBearingDeg, planClock, planDistKm,
  planEvents, planFindings, planSummary, planWindow, radiusBounds, relativeWind, sunAround, sunLine, type PlanLink,
} from './seaPlanner';
import SeaDock, { type SeaToggles } from './SeaDock';
import SeaBand, { type SeaBandHour } from './SeaBand';
import SeaGustOdds from './SeaGustOdds';
import { gustOverLimit, mostText, overSentence, q5At } from './windBand';
import SeaReadout, { findWarning, type SeaDmiWater, type SeaReadoutHour, type SeaTexts, type SeaWaterLevel } from './SeaReadout';
import SeaMapCard from './SeaMapCard';
import SeaCurrentPanel, { DriftArrow } from './SeaCurrentPanel';
import SeaWaterTempPanel from './SeaWaterTempPanel';
import { useSeaWaterTemp, wtPointerKey } from './useSeaWaterTemp';
import { WSV_CREDIT, WSV_LICENCE, WSV_LICENCE_URL, WSV_NAME, WSV_PAGE, WT_MODEL_NOTE } from './seaWaterTemp';
import {
  BSH_CURRENT_CHANGED, BSH_CURRENT_CREDIT, BSH_CURRENT_LICENCE, BSH_CURRENT_LICENCE_URL, BSH_CURRENT_NAME, BSH_CURRENT_PAGE, SEA_CURRENT_MODEL_NOTE, SEA_CURRENT_WHY,
  currentArrows, currentFieldHour, currentOnAxis, currentPointerOf, currentViewOf, type SeaCurrentLoad,
} from './seaCurrent';
import MapGestureHint, { type HintSpot } from '../map/MapGestureHint';
import SeaLinkNotice from './SeaLinkNotice';
import AppLoader from '../router/AppLoader';
import { usePageCover } from '../router/usePageCover';
import './seaDeck.css';

export interface SeaPageProps {
  initial: SeaUrlState;
  invalid: string[];
  onUrlState: (s: SeaUrlState) => void;
  onSpot: (s: SeaUrlState, initial: boolean) => void;
  popState?: (SeaUrlState & { key: string }) | null;
  /** The path named a valid spot (`/seewetter/<spot>`): the desktop opens on its dossier, like the other share links. */
  openDossier?: boolean;
}

const DEFAULT_SPOT = 'st-peter-ording';
const REFRESH_MS = 10 * 60_000;
const TEXTS: readonly SeaTextProduct[] = SEA_PAGE_TEXTS;
/** WL: `water` on by default (E-WL-1), `?wl=0` starts without it — the switch stays the named fallback. */
const DEFAULT_TOGGLES: SeaToggles = { wind: true, warn: true, stations: false, water: true, current: false };
const KIND_LABEL: Record<string, string> = { strand: 'Badestrand', kite: 'Kite-Spot', hafen: 'Hafen', revier: 'Revier' };
export const kindsLabel = (kinds: readonly string[]) => kinds.map((x) => KIND_LABEL[x] ?? x).join(', ');
/** Phase TF (E-TF-1): how many gauges are asked for a curve when the catalogue's hint `has.curve` proves wrong live. */
const TIDE_CURVE_TRIES = 3;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

export default function SeaPage({ initial, onUrlState, onSpot, popState, openDossier }: SeaPageProps) {
  const nav = useAppNav();
  const isMobile = useMediaQuery('(max-width: 767px), (max-width: 1439px) and (pointer: coarse)');
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapInst, setMapInst] = useState<maplibregl.Map | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [catalog, setCatalog] = useState<SeaCatalog | null | 'loading'>('loading');
  const [areas, setAreas] = useState<SeaAreas | null>(null);
  const [killed, setKilled] = useState(false);
  const [runLoad, setRunLoad] = useState<SeaRunLoad | null>(null);
  // Start cover (buscosun mark + ring) until the map is drawn and the catalogue and the first run are in.
  const pageShown = usePageCover(mapInst, catalog !== 'loading' && runLoad !== null);
  const [rawSpotsDoc, setSpotsDoc] = useState<SeaSpotsDoc | null>(null);
  const [windPtr, setWindPtr] = useState<string | null>(null);
  // Phase DK: pointer to the newest DMI file (`status.dmi`, kept as a string like the wind pointer; '' = none) and what the page read from it.
  const [dmiPtr, setDmiPtr] = useState<string | null>(null);
  const [dmi, setDmi] = useState<SeaDmiLoad | 'loading'>('loading');
  // Phase ST: pointer to the newest current file of the BSH (`status.current`, a string like the others; '' = none) and what the page read.
  const [curPtr, setCurPtr] = useState<string | null>(null);
  const [current, setCurrent] = useState<SeaCurrentLoad | 'loading'>('loading');
  const [currents, setCurrents] = useState<GeoJSON.FeatureCollection | null>(null);
  // Phase WT: pointer to the newest water temperature file of the DMI model (`status.wtemp`, a string like the others; '' = none).
  const [wtPtr, setWtPtr] = useState<string | null>(null);
  const [texts, setTexts] = useState<Partial<Record<SeaTextProduct, import('./seaText').SeaTextDoc | null>>>({});
  const [textsLoading, setTextsLoading] = useState(true);
  const [spotId, setSpotId] = useState<string>(initial.spot ?? DEFAULT_SPOT);
  const [profile, setProfile] = useState<SeaProfileId>(initial.p);
  const [t, setT] = useState<number>(initial.t);
  const [layer, setLayer] = useState<SeaLayer>(initial.l);
  const [unit, setUnit] = useState<SeaUnit>(initial.u);
  const [tab, setTab] = useState<SeaTab>(initial.tab);
  const [revier, setRevier] = useState<SeaRevier>(initial.rv);
  const [query, setQuery] = useState('');
  const [toggles, setToggles] = useState<SeaToggles>(() => ({ ...DEFAULT_TOGGLES, water: seaWaterLevelFrom() }));
  const [limits, setLimitsState] = useState<SeaLimits>(() => loadLimits(initial.p));
  const [field, setField] = useState<{ key: string; rgba: Uint8ClampedArray; width: number } | null>(null);
  const [fieldState, setFieldState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [poi, setPoi] = useState<SeaPoiObs | null | 'loading'>(null);
  // WL-4: gauge catalogue (mirror) and the live forecast of the chosen gauge, both only while the switch is on.
  const [wlCat, setWlCat] = useState<{ gauges: WlGauge[]; why: string | null; state: 'loading' | 'ok' | 'missing' | 'error' }>({ gauges: [], why: null, state: 'loading' });
  const [wlDoc, setWlDoc] = useState<WlForecast | null | 'loading' | 'error'>(null);
  const [gaugePick, setGaugePick] = useState<string | null>(null);
  const [mobTab, setMobTab] = useState<'map' | 'spot' | 'layers' | 'tide' | 'plan'>('map');
  // Phase SP (`audit/seewetter-planer.md`): the trip planner. `plan` = open (window in absolute time, boat position);
  // `linkPl` = what a link carried until the spot is known; `planAsk` = the planner waits for a spot to launch from;
  // `planPick` = "Spot wechseln" (desktop: the picker shows while the plan stays).
  const [plan, setPlan] = useState<PlanLink | null>(null);
  const [linkPl, setLinkPl] = useState<PlanLink | null>(() => parsePlanParam(initial.pl));
  const [planAsk, setPlanAsk] = useState(false);
  const [planPick, setPlanPick] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  // Phase TF (`audit/tidenfenster.md`): off by default, `?tf=1` — read once, like `?wl=0`.
  const tideOn = useMemo(() => seaTideWindowFrom(), []);
  /** The threshold a link carried (`tw=`), until the user sets one of their own. */
  const linkTide = useRef(tideOn ? parseTideParam(initial.tw) : null);
  const [tide, setTide] = useState<TideThreshold | null>(null);
  const [wlCurveDoc, setWlCurveDoc] = useState<WlForecast | null | 'loading' | 'error'>(null);
  /** Gauges whose LIVE answer carried no curve although the catalogue said so (V-WL-11). */
  const [noCurveIds, setNoCurveIds] = useState<readonly string[]>([]);
  /** Centre stage: the map (default) or the spot dossier — like the Brandradar (BD2), the map stays mounted. Mobile: the dossier is a full-screen page over the map. */
  const [stage, setStage] = useState<'map' | 'dossier'>(openDossier && !isMobile && !initial.pl ? 'dossier' : 'map');
  /** The spot a MAP click picked: its preview card (bottom left) stays until closed, the detail opens or another spot is picked. */
  // A link on a spot: mobile opens on the map with the spot's preview card (its detail), the desktop on the dossier.
  const [mapCard, setMapCard] = useState<string | null>(openDossier && isMobile && !initial.pl ? initial.spot : null);
  useEffect(() => { if (stage === 'dossier') setMapCard(null); }, [stage]);
  const firstSpot = useRef(true);
  /**
   * Phase SS (audit/seewetter-seo.md): does the URL name the spot? On `/seewetter` (the overview) the page shows the
   * default spot WITHOUT writing it into the path — every spot is its own indexable page now, and rewriting the overview
   * to `/seewetter/st-peter-ording` would hand its canonical to that spot. The first pick of a spot writes it (a real
   * navigation, back returns to the overview); a link on a spot carries it from the start.
   */
  const [spotInUrl, setSpotInUrl] = useState<boolean>(!!initial.spot);

  const popKey = popState?.key ?? null;
  useEffect(() => {
    if (!popState) return;
    setSpotId(popState.spot ?? DEFAULT_SPOT); setSpotInUrl(!!popState.spot); setProfile(popState.p); setT(popState.t); setLayer(popState.l); setUnit(popState.u); setTab(popState.tab); setRevier(popState.rv);
    // SP: back/forward restores the plan of that address as it was (boat included) — the spot change is not a new pick.
    planSpot.current = popState.spot ?? null;
    setPlan(popState.spot ? parsePlanParam(popState.pl) : null); setLinkPl(null); setPlaying(false);
  }, [popKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLimitsState(loadLimits(profile)); }, [profile]);
  const setLimits = useCallback((l: SeaLimits | null) => { saveLimits(profile, l); setLimitsState(l ?? SEA_PROFILE_BY_ID[profile].limits); }, [profile]);

  // --- data -----------------------------------------------------------------------------------------
  useEffect(() => {
    const ac = new AbortController();
    // Load time (10.11.): the route wrapper started both reads already (`warmSeaStart`); taken once, else read here.
    const early = takeSeaStatic();
    (early?.catalog ?? loadCatalog(ac.signal)).then(setCatalog, () => setCatalog(null));
    (early?.areas ?? loadAreas(ac.signal)).then(setAreas, () => {});
    return () => ac.abort();
  }, []);
  useEffect(() => {
    let ac = new AbortController();
    let alive = true;
    // The first round uses the early start of the route wrapper (its clock, its reads), the 10-min refreshes read themselves.
    let early = takeSeaChain();
    const run = async () => {
      const start = early;
      early = null;
      const now = start?.nowMs ?? Date.now();
      setNowMs(now);
      // Load time (10.11.): run and texts start together with the kill switch instead of after it (raw `status.json` ≤ 4 s,
      // then the run, then the texts — three rounds in a row). A set kill switch still wins: the speculative reads are
      // discarded and the page gets exactly what `killed = true` gives (no run, no texts).
      const runP = start?.run ?? loadLatestRun(now, false, ac.signal).catch(() => null);
      const textsP = start?.texts ?? Promise.all(TEXTS.map((p) => loadText(p, now, false, ac.signal).catch(() => null)));
      const k = await (start?.kill ?? loadKillSwitch(ac.signal));
      if (!alive) return;
      setKilled(k.killed);
      // V-SW-2: the newest wind refresh — kept as its path (a string), so an unchanged pointer reloads nothing.
      const wp = windPointerOf(k.status);
      setWindPtr((prev) => (k.status == null ? prev : wp ? `${wp.run}|${wp.t1}|${wp.path}` : null));
      // DK: unreadable status ⇒ the pointer stays; on the very first read it becomes "none" so the card does not load for ever.
      const dp = dmiPointerOf(k.status);
      setDmiPtr((prev) => (k.status == null ? prev ?? '' : dp ? `${dp.stamp}|${dp.path}|${dp.builtAt}` : ''));
      // ST: the same rule for the current file.
      const cp = currentPointerOf(k.status);
      setCurPtr((prev) => (k.status == null ? prev ?? '' : cp ? `${cp.run}|${cp.path}|${cp.builtAt}|${cp.field ? 1 : 0}` : ''));
      // WT: the same rule for the water temperature file.
      setWtPtr((prev) => (k.status == null ? prev ?? '' : wtPointerKey(k.status)));
      const r = k.killed ? await loadLatestRun(now, true, ac.signal).catch(() => null) : await runP;
      if (!alive || !r) return;
      // A refresh never replaces a good run by "nothing" — the shown run stays and ages by the freshness rules.
      setRunLoad((prev) => (r.run || !prev?.run || k.killed ? r : prev));
      const texts = k.killed ? await Promise.all(TEXTS.map((p) => loadText(p, now, true, ac.signal).catch(() => null))) : await textsP;
      if (!alive) return;
      setTexts((prev) => Object.fromEntries(TEXTS.map((p, i) => [p, texts[i]?.doc ?? (k.killed ? null : prev[p] ?? null)])));
      setTextsLoading(false);
    };
    void run();
    const id = window.setInterval(() => { ac.abort(); ac = new AbortController(); void run(); }, REFRESH_MS);
    return () => { alive = false; ac.abort(); window.clearInterval(id); };
  }, []);
  const run = runLoad?.run ?? null;
  const freshness = killed ? 'dead' : runLoad?.run ? runLoad.freshness : 'dead';
  const runKey = run?.run ?? null;
  useEffect(() => {
    if (!runKey) return;
    const ac = new AbortController();
    const [wRun, wT1, wPath] = windPtr ? windPtr.split('|') : [];
    loadSpots(runKey, ac.signal)
      .then((doc) => (doc && wPath ? withWindRefresh(doc, { run: wRun, t1: wT1, path: wPath }, ac.signal) : doc))
      .then(setSpotsDoc, () => { if (!ac.signal.aborted) setSpotsDoc(null); });
    return () => ac.abort();
  }, [runKey, windPtr]);

  // WL-4: the mirrored gauge positions, module-cached (`catalogCache` in waterLevelClient.ts) so a cache hit
  // costs no request. No one-shot ref here on purpose (V-WL-12): that guard used to mark the catalogue
  // "asked" before the fetch settled and never reset it, so a request aborted mid-flight — React StrictMode's
  // mount→cleanup→remount, or any fast unmount/remount — left `wlCat.state` stuck at `loading` forever with
  // no retry. Reusing the module cache instead keeps "ask once" for a SUCCESSFUL load while still retrying a
  // failed or aborted one on the next run.
  const water = toggles.water;
  useEffect(() => {
    if (!water) return;
    const ac = new AbortController();
    loadGaugeCatalog(ac.signal).then(
      (r) => {
        if (ac.signal.aborted) return;
        setWlCat(r ? { gauges: r.gauges, why: null, state: 'ok' } : { gauges: [], why: 'Der Pegelkatalog ist nicht lesbar (unerwartete Form).', state: 'error' });
      },
      (e) => {
        if (ac.signal.aborted || (e as Error)?.name === 'AbortError') return;
        setWlCat(e instanceof WlCatalogMissing
          ? { gauges: [], why: 'Der Pegelkatalog liegt noch nicht im Daten-Repo — bis dahin zeigt die Karte keine Pegel. Die Quelle selbst ist freigeschaltet.', state: 'missing' }
          : { gauges: [], why: 'Der Pegelkatalog ist gerade nicht erreichbar.', state: 'error' });
      },
    );
    return () => ac.abort();
  }, [water]);
  // A hand-picked gauge belongs to the spot it was picked at.
  useEffect(() => { setGaugePick(null); }, [spotId]);

  const noData: string | null = !runLoad ? null
    : killed ? 'Die Veröffentlichung ist angehalten (Kill-Schalter des Datenspeichers).'
      : !run && runLoad.reason === 'error' ? 'Der Datenspeicher ist gerade nicht erreichbar.'
        : !run ? 'Kein geprüfter Seegangslauf der letzten 24 Stunden veröffentlicht.'
          : freshness === 'dead' ? `Der letzte geprüfte Lauf (${run.run.slice(8, 10)} UTC vom ${run.run.slice(6, 8)}.${run.run.slice(4, 6)}.) ist älter als 30 Stunden.` : null;
  const spots: SeaSpot[] = useMemo(() => (catalog && catalog !== 'loading' ? catalog.spots : []), [catalog]);
  const spot = useMemo(() => spots.find((s) => s.id === spotId) ?? spots.find((s) => s.id === DEFAULT_SPOT) ?? spots[0] ?? null, [spots, spotId]);
  // --- Phase DK: the DMI file (water level; wind outside the point cube) — read only when the catalogue carries a spot that needs it.
  const needsDmi = useMemo(() => spots.some((s) => s.dk?.wind === 'dmi' || s.dk?.wl?.from === 'dmi'), [spots]);
  const hasDk = useMemo(() => spots.some((s) => s.country === 'DK'), [spots]);
  const dmiTick = Math.floor(nowMs / REFRESH_MS);
  useEffect(() => {
    if (!needsDmi || dmiPtr == null) return;     // null = status.json not read yet
    if (killed) { setDmi(SEA_DMI_NONE); return; }
    const [stamp, path, builtAt] = dmiPtr.split('|');
    const ac = new AbortController();
    loadDmi(dmiPtr ? { stamp, path, builtAt } : null, nowMs, ac.signal).then((d) => { if (!ac.signal.aborted) setDmi(d); }, () => {});
    return () => ac.abort();
  }, [needsDmi, dmiPtr, killed, dmiTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const dmiDoc = dmi !== 'loading' ? dmi.doc : null;
  // --- Phase ST: the current file of the BSH — one small read per pointer and refresh tick; missing, too old or unreadable ⇒ "keine Daten".
  useEffect(() => {
    if (curPtr == null) return;     // null = status.json not read yet
    if (killed) { setCurrent({ doc: null, state: 'none', why: SEA_CURRENT_WHY.killed }); return; }
    const [crun, cpath, cbuilt, cfield] = curPtr.split('|');
    const ac = new AbortController();
    loadCurrent(curPtr ? { run: crun, path: cpath, builtAt: cbuilt, field: cfield === '1' } : null, nowMs, ac.signal).then((d) => { if (!ac.signal.aborted) setCurrent(d); }, () => {});
    return () => ac.abort();
  }, [curPtr, killed, dmiTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const curDoc = current !== 'loading' ? current.doc : null;
  // The series the page works with: the run's file, with the DMI wind at the spots outside the point cube (E-DK-5).
  const spotsDoc = useMemo(() => (rawSpotsDoc ? withDmiWind(rawSpotsDoc, spots, dmiDoc) : null), [rawSpotsDoc, spots, dmiDoc]);
  // A link on a spot: the map centres on it once (also behind the dossier, so „Zur Karte" lands at the spot).
  const flewToLink = useRef(false);
  useEffect(() => {
    if (flewToLink.current || !openDossier || !initial.spot || !spot || spot.id !== initial.spot || !mapInst) return;
    flewToLink.current = true;
    mapInst.jumpTo({ center: [spot.lon, spot.lat], zoom: Math.max(mapInst.getZoom(), 7.5) });
  }, [spot, mapInst]); // eslint-disable-line react-hooks/exhaustive-deps
  // A link on a well-formed spot the catalogue does not know (any more): the page falls back to the default spot — and says so, once.
  const [unknownSpot, setUnknownSpot] = useState<string | null>(null);
  const spotChecked = useRef(false);
  useEffect(() => {
    if (spotChecked.current || !initial.spot || spots.length === 0) return;
    spotChecked.current = true;
    if (!spots.some((s) => s.id === initial.spot)) { setUnknownSpot(initial.spot); setStage('map'); }
  }, [spots]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- WL-4: gauge of this spot, its live forecast, and what the card is allowed to claim ----------------
  // Phase DK: a Danish spot without a BSH gauge nearby reads the DMI model instead — no German gauge 40–110 km away is put in its place.
  const dkWl = spot?.dk?.wl ?? null;
  const dmiSpot = dkWl?.from === 'dmi';
  const nearestGauge = useMemo(() => {
    if (!water || !spot || !wlCat.gauges.length || dmiSpot) return null;
    const named = dkWl?.from === 'bsh' ? wlCat.gauges.find((g) => g.id === dkWl.gauge) : null;
    return named ? { gauge: named, km: wlDistKm(spot.lat, spot.lon, named.lat, named.lon) } : wlNearest(wlCat.gauges, spot.lat, spot.lon);
  }, [water, spot, wlCat.gauges, dmiSpot, dkWl]);
  const gauge = useMemo(() => (gaugePick ? wlCat.gauges.find((g) => g.id === gaugePick) ?? null : null) ?? nearestGauge?.gauge ?? null, [gaugePick, wlCat.gauges, nearestGauge]);
  const gaugeKm = useMemo(() => (gauge && spot ? wlDistKm(spot.lat, spot.lon, gauge.lat, gauge.lon) : null), [gauge, spot]);
  const gaugeId = gauge?.id ?? null;
  // The reader's TTL is 10 min, the page refreshes on the same beat — so one tick asks once.
  const wlTick = Math.floor(nowMs / REFRESH_MS);
  useEffect(() => {
    if (!water || !gaugeId) { setWlDoc(null); return; }
    const ac = new AbortController();
    setWlDoc((prev) => (prev && prev !== 'error' && prev !== 'loading' && prev.id === gaugeId ? prev : 'loading'));
    loadGaugeForecast(gaugeId, ac.signal).then(
      (d) => { if (!ac.signal.aborted) setWlDoc(d ?? 'error'); },
      (e) => { if (!ac.signal.aborted && (e as Error)?.name !== 'AbortError') setWlDoc('error'); },
    );
    return () => ac.abort();
  }, [water, gaugeId, wlTick]);

  // --- Phase TF: the gauge that carries the curve (E-WL-10, E-TF-1) ------------------------------------------------
  const tideActive = tideOn && water;
  const gaugeDoc = wlDoc && wlDoc !== 'loading' && wlDoc !== 'error' && wlDoc.id === gaugeId ? wlDoc : null;
  // The live answer decides whether the gauge carries a curve; until it is in, the catalogue's hint.
  const curveAlt = useMemo(() => {
    if (!tideActive || !gauge || !spot) return null;
    const own = gaugeDoc ? gaugeDoc.curve.length > 0 : gauge.has.curve;
    return own ? null : wlNearestWithCurve(wlCat.gauges, spot.lat, spot.lon, new Set([gauge.id, ...noCurveIds]));
  }, [tideActive, gauge, spot, gaugeDoc, wlCat.gauges, noCurveIds]);
  const curveAltId = curveAlt?.gauge.id ?? null;
  useEffect(() => { setNoCurveIds((x) => (x.length ? [] : x)); }, [gaugeId]);
  useEffect(() => {
    if (!curveAltId) { setWlCurveDoc(null); return; }
    const ac = new AbortController();
    setWlCurveDoc((prev) => (prev && prev !== 'error' && prev !== 'loading' && prev.id === curveAltId ? prev : 'loading'));
    loadGaugeForecast(curveAltId, ac.signal).then(
      (d) => {
        if (ac.signal.aborted) return;
        // A live answer without a curve rules this gauge out; the next nearest is asked — `TIDE_CURVE_TRIES` at most.
        if (d && d.curve.length === 0) setNoCurveIds((x) => (x.length < TIDE_CURVE_TRIES - 1 && !x.includes(curveAltId) ? [...x, curveAltId] : x));
        setWlCurveDoc(d ?? 'error');
      },
      (e) => { if (!ac.signal.aborted && (e as Error)?.name !== 'AbortError') setWlCurveDoc('error'); },
    );
    return () => ac.abort();
  }, [curveAltId, wlTick]);
  const curveAltDoc = curveAlt && wlCurveDoc && wlCurveDoc !== 'loading' && wlCurveDoc !== 'error' && wlCurveDoc.id === curveAlt.gauge.id ? wlCurveDoc : null;
  // The gauge whose curve the tide window reads: the other gauge when there is one, else the spot's gauge itself.
  const tideGauge = tideActive ? (curveAlt ? curveAlt.gauge : gauge) : null;
  const tideKm = curveAlt ? curveAlt.km : gaugeKm;
  const tideDoc = curveAlt ? curveAltDoc : gaugeDoc;
  const tideGaugeId = tideGauge?.id ?? null;
  // A link names the gauge its threshold belongs to: when the page would read another one, that gauge is picked, as by hand.
  const linkGaugeDone = useRef(false);
  useEffect(() => {
    const lt = linkTide.current;
    if (linkGaugeDone.current || !lt || !tideGaugeId) return;
    linkGaugeDone.current = true;
    if (tideGaugeId !== lt.gaugeId && wlCat.gauges.some((g) => g.id === lt.gaugeId)) setGaugePick(lt.gaugeId);
  }, [tideGaugeId, wlCat.gauges]);
  // The threshold belongs to ONE gauge (E-TF-2): the link's for its gauge, else what this browser stored for it.
  useEffect(() => {
    if (!tideGaugeId) { setTide(null); return; }
    const lt = linkTide.current;
    setTide(lt && lt.gaugeId === tideGaugeId ? lt.threshold : loadTideThreshold(tideGaugeId));
  }, [tideGaugeId]);
  const setTideThreshold = useCallback((th: TideThreshold | null) => {
    if (!tideGaugeId) return;
    linkTide.current = null;
    saveTideThreshold(tideGaugeId, th);
    setTide(th);
  }, [tideGaugeId]);

  // --- hour axis ------------------------------------------------------------------------------------
  const nowHour = Math.floor(nowMs / H) * H;
  const usable = !noData && !!run && !!spotsDoc;
  const firstIdx = run ? Math.max(0, Math.round((nowHour - run.runMs) / H)) : 0;
  const nHours = usable ? Math.max(0, 79 - firstIdx) : 0;
  const k = Math.min(t, Math.max(0, nHours - 1));
  const validMs = nowHour + k * H;
  const idxOf = (kk: number) => firstIdx + kk;

  const hourOf = useCallback((id: string, kk: number): SeaReadoutHour | null => {
    const s = spotsDoc?.series[id];
    if (!s) return null;
    const i = firstIdx + kk;
    return {
      t: nowHour + kk * H, windMs: s.wind[i], gustMs: s.gust[i], windDir: s.windDir[i], hs: s.hs[i], dir: s.dir[i], tm: s.tm[i],
      ws: s.ws[i], wsDir: s.wsDir[i], wsPer: s.wsPer[i], wsPeak: s.wsPeak[i], sw: s.sw[i], swDir: s.swDir[i], swPer: s.swPer[i], swPeak: s.swPeak[i],
      dry: seaNoSeaAt(s, i),
      // Phase SU: the hour's quantiles, `null` when the spot file carries none (then nothing of the band is drawn).
      windQ: q5At(spotsDoc?.quantiles?.[id]?.wind, i), gustQ: q5At(spotsDoc?.quantiles?.[id]?.gust, i),
    };
  }, [spotsDoc, firstIdx, nowHour]);
  // V-SW-10: verdicts per spot are computed once per (spots document, limits by content, axis); hour, layer, revier,
  // query, unit and tab reuse the rows (`seaVerdicts.ts`, deep-equal to the uncached reference — verify:sea-derive V).
  const limitsKey = JSON.stringify(limits);
  // V-SW-20: hours without water at the model cell are not classified (`?seadry=0` = classes as before).
  const dryRule = useMemo(() => seaDryRuleFrom(), []);
  const verdicts = useMemo(() => new SeaVerdictCache({ series: usable ? spotsDoc!.series : null, limits, firstIdx, nowHour, nHours, dryRule }),
    [usable, spotsDoc, limitsKey, firstIdx, nowHour, nHours, dryRule]); // eslint-disable-line react-hooks/exhaustive-deps
  const verdictAt = useCallback((sp: SeaSpot, kk: number): SeaVerdict => verdicts.at(sp, kk), [verdicts]);

  // A spot the published run does not carry yet (a new catalogue entry until the next wave run) has no hours — said in words, never a crash.
  const noSeries = usable && !!spot && !spotsDoc!.series[spot.id];
  const spotHours = useMemo(() => (spot && usable && !noSeries ? Array.from({ length: nHours }, (_, kk) => hourOf(spot.id, kk)!) : []), [spot, usable, noSeries, nHours, hourOf]);
  // Phase TF: series, windows and hours of the tide window — null without the switch, without a curve or without a threshold.
  const tideModel = useMemo(() => {
    if (!tideDoc || !tideGauge) return null;
    const refs = tideRefs({ region: tideDoc.region, zeroNhnCm: tideDoc.zeroNhnCm ?? tideGauge.zeroNhnCm, chartDatumCm: tideDoc.chartDatumCm ?? tideGauge.chartDatumCm, mhwCm: tideDoc.mhwCm, mlwCm: tideDoc.mlwCm });
    const series = tideSeries(tideDoc.curve);
    const ref = tide ? tideRefOf(refs, tide.ref) : null;
    const on = tide && ref && series.points.length > 1 ? tide : null;
    const horizon = nowHour + SEA_MAX_T * H;
    return {
      name: tideDoc.name, refs, end: series.end,
      windows: on ? tideWindows(series.points, on, ref!.offsetCm, nowMs).filter((w) => w.from < horizon) : null,
      hours: on ? tideHours(series.points, on, ref!.offsetCm, Array.from({ length: nHours }, (_, kk) => nowHour + kk * H)) : null,
      mode: on ? on.mode : null,
    };
  }, [tideDoc, tideGauge, tide, nowMs, nowHour, nHours]);
  // The classes of the chosen spot take the water level in ONLY with a threshold set (E-TF-5).
  const tideFeed = tideModel?.hours && tideModel.mode ? tideModel : null;
  const spotVerdicts = useMemo(() => {
    const base = spot && usable && !noSeries ? verdicts.row(spot) : [];
    return tideFeed ? base.map((v, i) => tideVerdict(v, tideFeed.hours![i], tideFeed.mode!, tideFeed.name)) : base;
  }, [spot, usable, verdicts, tideFeed]);
  const wins = useMemo(() => nextAndLongest(
    spot && usable ? (tideFeed ? verdictWindows(spotVerdicts, spotVerdicts.map((_, kk) => nowHour + kk * H)) : verdicts.windows(spot)) : [], nowMs,
  ), [spot, usable, verdicts, nowMs, tideFeed, spotVerdicts, nowHour]);
  const hour = spotHours[k] ?? null;
  const verdict = spot ? (spotVerdicts[k] ?? verdictAt(spot, k)) : null;
  // Phase ST: the spot's current on the hour axis of the wave run, and what the readout says for the chosen hour.
  const spotCur = useMemo(() => {
    const e = spot && curDoc ? curDoc.spots[spot.id] : null;
    return e && curDoc && run ? currentOnAxis(curDoc, e, run.runMs, 79) : null;
  }, [spot, curDoc, run]);
  const hourWindDir = hour?.windDir ?? null, hourWindKn = hour?.windMs != null ? hour.windMs * MS_TO_KN : null;
  const currentView = useMemo(() => (spot ? currentViewOf({ load: current, spotId: spot.id, tMs: validMs, nowMs, windFromDeg: hourWindDir, windKn: hourWindKn }) : null),
    [spot, current, validMs, nowMs, hourWindDir, hourWindKn]);
  // Map layer „Strömung“: the thinned field of the chosen hour as arrows; outside the run or unreadable ⇒ no arrows.
  // Phase WT: model, measurement, own record and the user's threshold of the water temperature at the spot (no view without the catalogue file).
  const wtemp = useSeaWaterTemp({ spotId: spot?.id ?? null, ptr: wtPtr, killed, nowMs, tick: dmiTick, tMs: validMs, linkWt: initial.wt });
  const curFieldHour = toggles.current && curDoc ? currentFieldHour(curDoc, validMs) : null;
  const curFieldKey = curDoc && curFieldHour != null ? `${curDoc.run}/${curFieldHour}` : null;
  useEffect(() => {
    if (!curFieldKey || !curDoc || curFieldHour == null) { setCurrents(null); return; }
    const ac = new AbortController();
    loadCurrentField(curDoc.run, curFieldHour, ac.signal).then((rgba) => { if (!ac.signal.aborted) setCurrents(rgba ? currentArrows(rgba) : null); }, () => {});
    return () => ac.abort();
  }, [curFieldKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Phase SP: trip planner (`seaPlanner.ts` computes, this block only feeds it) -----------------------------
  const planWin = useMemo(() => (plan && usable ? planWindow(plan.startMs, plan.endMs, nowHour, nHours) : null), [plan, usable, nowHour, nHours]);
  const kRef = useRef(k);
  kRef.current = k;
  const startPlan = useCallback((sp: SeaSpot) => {
    const w = defaultWindow(kRef.current, nHours), b = defaultBoat(sp);
    setPlan({ startMs: nowHour + (w?.start ?? 0) * H, endMs: nowHour + (w?.end ?? SEA_PLAN_DEFAULT_H) * H, lat: b.lat, lon: b.lon });
    setLinkPl(null); setPlanAsk(false); setPlanPick(false); setStage('map'); setMapCard(null); setMobTab('plan'); setPlanSheetOpen(false);
  }, [nHours, nowHour]);
  /** „Ausfahrt planen“ — never disabled: without a chosen spot the planner asks for one first. */
  const openPlanner = useCallback(() => {
    if (plan) { setStage('map'); setMobTab('plan'); setPlanPick(false); return; }
    if (!spotInUrl || !spot) { setPlanAsk(true); setStage('map'); setMapCard(null); setMobTab('spot'); return; }
    startPlan(spot);
  }, [plan, spotInUrl, spot, startPlan]);
  const closePlanner = useCallback(() => { setPlan(null); setLinkPl(null); setPlanAsk(false); setPlanPick(false); setPlaying(false); setMobTab('map'); }, []);
  // A spot picked while the planner asks for one starts the plan there; picked while a plan is open, the boat moves in front of it.
  const planSpot = useRef<string | null>(null);
  useEffect(() => {
    if (!spot) return;
    if (planAsk && spotInUrl) startPlan(spot);
    else if (plan && planSpot.current && planSpot.current !== spot.id) {
      const b = defaultBoat(spot);
      setPlan((p) => p && { ...p, lat: b.lat, lon: b.lon });
      setPlanPick(false); setMapCard(null); setMobTab('plan');
    }
    planSpot.current = spot.id;
  }, [spot?.id, spotInUrl, planAsk]); // eslint-disable-line react-hooks/exhaustive-deps
  // A link with a plan: opened once the spot of the path is known (the boat is held inside that spot's radius).
  useEffect(() => {
    if (!linkPl || !spot || catalog === 'loading') return;
    if (!initial.spot) { setLinkPl(null); setPlanAsk(true); setMobTab('spot'); return; }
    if (spot.id !== initial.spot) { setLinkPl(null); return; }
    const c = clampToRadius(spot, linkPl);
    setPlan({ startMs: linkPl.startMs, endMs: linkPl.endMs, lat: Math.round(c.lat * 1e4) / 1e4, lon: Math.round(c.lon * 1e4) / 1e4 });
    setLinkPl(null); setStage('map'); setMapCard(null); setMobTab('plan');
  }, [linkPl, spot, catalog]); // eslint-disable-line react-hooks/exhaustive-deps
  const planOpen = !!plan;
  // The phone's „Ausfahrt“ page exists only with a plan (closed by the back button ⇒ back to the map).
  useEffect(() => { if (!planOpen) { setMobTab((m) => (m === 'plan' ? 'map' : m)); setPlaying(false); } }, [planOpen]);
  // The map shows the whole radius when the planner opens or its spot changes (the padding of the planner layout is set by then).
  useEffect(() => {
    if (!planOpen || !spot || !mapInst) return;
    const [w, s, e, n] = radiusBounds(spot);
    mapInst.fitBounds([[w, s], [e, n]], { padding: 24, maxZoom: 12, duration: 600 });
  }, [planOpen, spot?.id, mapInst, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Window in hours of the axis → the plan (absolute time); the map's hour follows the end that moved. */
  const setPlanHours = useCallback((a: number, b: number) => {
    if (!planWin || b <= a || a < 0 || b > nHours - 1) return;
    setPlaying(false);
    setPlan((p) => p && { ...p, startMs: nowHour + a * H, endMs: nowHour + b * H });
    if (a !== planWin.start) setT(a); else if (b !== planWin.end) setT(b);
  }, [planWin, nHours, nowHour]);
  // „Abspielen“: the existing hour (`t`) walks through the window once, an hour per step.
  useEffect(() => {
    if (!playing || !planWin) return;
    const id = window.setInterval(() => {
      const cur = kRef.current;
      if (cur >= planWin.end) setPlaying(false); else setT(Math.max(planWin.start, cur + 1));
    }, 900);
    return () => window.clearInterval(id);
  }, [playing, planWin?.start, planWin?.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const togglePlay = useCallback(() => {
    if (!planWin) return;
    if (!playing && (kRef.current < planWin.start || kRef.current >= planWin.end)) setT(planWin.start);
    setPlaying((x) => !x);
  }, [planWin, playing]);
  const planModel = useMemo(() => {
    if (!plan || !spot) return null;
    const boat = clampToRadius(spot, plan);
    const km = planDistKm(boat, spot), course = km < 0.05 ? null : planBearingDeg(boat, spot);
    if (!planWin) return { boat, km, course, win: null };
    const f = planFindings(spotHours, planWin.start, planWin.end, { normal: spot.normal, windMaxKn: limits.windMax, gustMaxKn: limits.gustMax });
    const startT = nowHour + planWin.start * H, endT = nowHour + planWin.end * H;
    const sun = sunAround(endT, spot.lat, spot.lon);
    return {
      boat, km, course, win: planWin, startT, endT,
      events: planEvents(f, unit, sun.sunset, startT, endT),
      summary: [...planSummary(f, unit, { windMaxKn: limits.windMax, gustMaxKn: limits.gustMax }), sunLine(endT, sun)],
    };
  }, [plan, spot, planWin, spotHours, limitsKey, unit, nowHour]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- texts, warnings ------------------------------------------------------------------------------
  const stale = Object.fromEntries(TEXTS.map((p) => [p, !!texts[p] && seaTextFreshness(texts[p]!, nowMs) !== 'live'])) as Record<string, boolean>;
  const seaTexts: SeaTexts = { fq50: texts.FQDL50 ?? null, fq51: texts.FQDL51 ?? null, wodl: texts.WODL45 ?? null, fx40: texts.FXDL40 ?? null, stale, loading: textsLoading };
  const warning = useMemo(() => findWarning(seaTexts.wodl, spot, stale.WODL45), [seaTexts.wodl, spot, stale.WODL45]); // eslint-disable-line react-hooks/exhaustive-deps
  const mapAreas: SeaMapArea[] | null = useMemo(() => {
    if (!areas || !toggles.warn) return null;
    const w = seaTexts.wodl;
    return areas.features.map((f) => {
      const id = f.properties.id;
      let status: SeaMapArea['status'] = 'nostatus';
      if (f.properties.kind === 'coast') status = coastWarnStatus(w, ['501000006', '501000007', '501000008'].includes(id) ? 'Ostseekueste' : 'Nordseekueste', nowMs);
      else if (w?.parts.kind === 'warnings') {
        const map: Record<string, string> = { '401000008': 'GERMAN BIGHT', '401000014': 'WESTERN BALTIC', '401000016': 'SOUTHERN BALTIC' };
        const a = map[id] ? w.parts.seaAreas.find((x) => x.name === map[id]) : null;
        if (a) status = stale.WODL45 ? 'unknown' : a.status;
      }
      return { feature: f, status };
    });
  }, [areas, toggles.warn, seaTexts.wodl, nowMs, stale.WODL45]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- field of the hour ------------------------------------------------------------------------------
  const lead = idxOf(k);
  const fKind: 'f' | 'c' = layer === 'ws' || layer === 'sw' ? 'c' : 'f';
  const fStep = fKind === 'f' ? seaFieldStepAt(lead) : seaCompStepAt(lead);
  const fieldKey = usable && run && fStep != null ? `${run.run}/${fKind}/${fStep}/${layer}` : null;
  useEffect(() => {
    if (!fieldKey || !run || fStep == null) { setField(null); return; }
    const ac = new AbortController();
    setFieldState('loading');
    loadField(run.run, fKind, fStep, ac.signal).then((img) => {
      if (!img) { setFieldState('error'); setField(null); return; }
      setField({ key: fieldKey, rgba: img.rgba, width: img.width });
      setFieldState('idle');
    }, () => {});
    return () => ac.abort();
  }, [fieldKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const half: 0 | 1 = layer === 'sw' ? 1 : 0;
  // V-SW-10: coloured off the main thread; the previous image stays until the new one is ready (no flicker on layer/hour change).
  const [coloured, setColoured] = useState<Uint8ClampedArray | null>(null);
  useEffect(() => {
    if (!field || noData) { setColoured(null); return; }
    const ac = new AbortController();
    colourFieldAsync(field.rgba, field.width, half, layer, ac.signal).then(setColoured, () => {});
    return () => ac.abort();
  }, [field, noData, half, layer]);
  const arrows = useMemo(() => (field && !noData ? waveArrows(field.rgba, field.width, half) : null), [field, noData, half]);

  // Measurement of the spot's station: `obs/v1` first, the DWD POI file as fallback (`loadStationObs`).
  const stationId = spot?.station?.id ?? null;
  const spotKey = spot?.id ?? null;
  useEffect(() => {
    const st = spot?.station ?? null;
    if (!st) { setPoi(null); return; }
    const ac = new AbortController();
    setPoi('loading');
    loadStationObs(st, spot, ac.signal).then(setPoi, () => {});
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the spot object is stable per id
  }, [stationId, spotKey]);

  // --- URL ------------------------------------------------------------------------------------------------
  // TF: the threshold travels with its gauge (`tw`); until the gauge is known the link's own value stays in the address.
  const tw = !tideOn || !tideGaugeId ? initial.tw : tide ? encodeTideParam(tide, tideGaugeId) : null;
  // SP: the open plan travels as `pl`; a link's own value stays in the address until its spot is known.
  const pl = plan ? encodePlanParam(plan) : linkPl ? initial.pl : null;
  const urlState: SeaUrlState = { spot: spotInUrl ? (spot?.id ?? spotId) : null, p: profile, t, l: layer, u: unit, tab, rv: revier, tw, tf: initial.tf, pl, wt: wtemp.wt };
  const urlKey = JSON.stringify(urlState);
  useEffect(() => { if (!firstSpot.current) onUrlState(urlState); }, [urlKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!spot) return;
    if (spotInUrl) onSpot({ ...urlState, spot: spot.id }, firstSpot.current);
    firstSpot.current = false;
  }, [spot?.id, spotInUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickSpot = useCallback((id: string) => {
    setSpotId(id); setSpotInUrl(true); setMobTab('map');
    // Mobile shows the new spot's briefing; the desktop dossier keeps its chapter.
    if (isMobile) setTab((tb) => (tb === 'quellen' ? 'spot' : tb));
    const s = spots.find((x) => x.id === id);
    if (s) mapRef.current?.easeTo({ center: [s.lon, s.lat], zoom: Math.max(mapRef.current.getZoom(), 7.5), duration: 600 });
  }, [spots, isMobile]);
  // SP: with the planner open (or asking for a spot) a picked spot is the launch point — no preview card.
  const planBusy = planOpen || planAsk;
  const pickSpotFromMap = useCallback((id: string) => {
    pickSpot(id);
    if (!planBusy) setMapCard(id);
    else if (planOpen && id === spot?.id) { setPlanPick(false); setMobTab('plan'); }   // „Spot wechseln“ and the same spot again
  }, [pickSpot, planBusy, planOpen, spot?.id]);

  // --- lists ----------------------------------------------------------------------------------------------
  const dockSpots = useMemo(() => spots
    .filter((s) => seaInRevier(s, revier))
    .filter((s) => !query.trim() || norm(`${s.name} ${s.coast?.name ?? ''} ${s.seaArea?.name ?? ''}${s.country === 'DK' ? ' Dänemark Danmark' : ''}`).includes(norm(query.trim())))
    .map((s) => {
      // TF: the chosen spot shows the class WITH its water level threshold, like the band and the dossier.
      const own = !!tideFeed && s.id === spot?.id;
      const v = own ? spotVerdicts[k] ?? verdictAt(s, k) : verdictAt(s, k);
      let win = '';
      if (usable) {
        const nw = own ? wins.next : nextAndLongest(verdicts.windows(s), nowMs).next;
        win = nw ? ` · Fenster ${dayShort(nw.from)} ${hh(nw.from)}:00` : ' · kein Fenster im Lauf';
      }
      return { id: s.id, name: s.name, sub: `${kindsLabel(s.kinds)}${win}`, cls: v.cls, reason: v.reasons[0] ?? '', ...(s.country === 'DK' ? { dk: true } : {}) };
    }),
  [spots, revier, query, verdictAt, verdicts, k, usable, nowMs, tideFeed, spot, spotVerdicts, wins]);
  const mapSpots: SeaMapSpot[] = useMemo(() => spots.filter((s) => seaInRevier(s, revier)).map((s) => {
    const h = usable ? hourOf(s.id, k) : null;
    return { id: s.id, name: s.name, lon: s.lon, lat: s.lat, cls: (tideFeed && s.id === spot?.id ? spotVerdicts[k] ?? verdictAt(s, k) : verdictAt(s, k)).cls, windTo: h?.windDir == null ? null : (h.windDir + 180) % 360, windKn: h?.windMs == null ? null : h.windMs * MS_TO_KN };
  }), [spots, revier, usable, hourOf, k, verdictAt, tideFeed, spot, spotVerdicts]);
  // Map hint: highlight candidates = the spots of the shown region, the picked one first.
  const hintSpots = useCallback((): HintSpot[] => spots.filter((s) => seaInRevier(s, revier))
    .sort((a, b) => Number(b.id === spotId) - Number(a.id === spotId)).slice(0, 40)
    .map((s) => ({ lng: s.lon, lat: s.lat, name: s.name, onPick: () => pickSpotFromMap(s.id) })), [spots, revier, spotId, pickSpotFromMap]);
  const waterLevel: SeaWaterLevel | null = useMemo(() => {
    if (!water) return null;
    // DK: at a spot served by the DMI model there is no BSH card — unless a gauge was picked by hand on the map.
    if (dmiSpot && !gauge) return null;
    if (wlCat.state === 'missing' || wlCat.state === 'error') return { state: wlCat.state, gauge: null, km: null, doc: null, why: wlCat.why };
    if (wlCat.state === 'loading' || wlDoc === 'loading') return { state: 'loading', gauge, km: gaugeKm, doc: null, why: null };
    if (!gauge) return { state: 'missing', gauge: null, km: null, doc: null, why: 'Im Pegelkatalog des BSH steht kein Pegel.' };
    if (wlDoc === 'error' || !wlDoc) return { state: 'error', gauge, km: gaugeKm, doc: null, why: `Die Wasserstandsvorhersage für ${gauge.name} ist gerade nicht lesbar. Das heißt nicht, dass der Wasserstand unauffällig ist.` };
    // TF (E-WL-10): the nearest gauge WITH a curve rides along as its own gauge — named, with its own distance and answer.
    const curve: SeaWaterLevel | null = !curveAlt ? null
      : curveAltDoc ? { state: 'ok', gauge: curveAlt.gauge, km: curveAlt.km, doc: curveAltDoc, why: null }
        : wlCurveDoc === 'error' ? { state: 'error', gauge: curveAlt.gauge, km: curveAlt.km, doc: null, why: `Der Verlauf am Pegel ${curveAlt.gauge.name} ist gerade nicht lesbar. Das heißt nicht, dass der Wasserstand unauffällig ist.` }
          : { state: 'loading', gauge: curveAlt.gauge, km: curveAlt.km, doc: null, why: null };
    return { state: 'ok', gauge, km: gaugeKm, doc: wlDoc, why: null, ...(curve ? { curve } : {}) };
  }, [water, wlCat, wlDoc, gauge, gaugeKm, curveAlt, curveAltDoc, wlCurveDoc, dmiSpot]);
  // Phase DK: the water level of the DMI storm surge model at this spot — the entry of the file, or why there is none.
  const dmiWater: SeaDmiWater | null = useMemo(() => {
    if (!water || !spot || !dmiSpot) return null;
    if (dmi === 'loading') return { state: 'loading', entry: null, builtAt: null, why: null };
    const entry = dmi.doc?.wl.spots[spot.id] ?? null;
    if (entry) return { state: 'ok', entry, builtAt: dmi.doc!.builtAt, why: null };
    const failed = dmi.doc?.failed.find((f) => f.id === spot.id && f.what === 'wl');
    return {
      state: 'none', entry: null, builtAt: dmi.doc?.builtAt ?? null,
      why: dmi.doc ? `Keine Daten: das DMI hat für diesen Punkt beim letzten Abruf nichts geliefert${failed ? ` („${failed.error}“)` : ''}. Das heißt nicht, dass der Wasserstand unauffällig ist.`
        : `Keine Daten. ${dmi.why ?? ''} Das heißt nicht, dass der Wasserstand unauffällig ist.`,
    };
  }, [water, spot, dmiSpot, dmi]);
  const tideView: SeaTideView | null = useMemo(() => (tideActive ? {
    threshold: tide, onThreshold: setTideThreshold, gaugeName: tideModel?.name ?? tideGauge?.name ?? null, km: tideKm,
    refs: tideModel?.refs ?? [{ ref: 'pnp', label: 'Pegelnull', over: 'Pegelnull', offsetCm: 0 }], windows: tideModel?.windows ?? null, end: tideModel?.end ?? null,
  } : null), [tideActive, tide, setTideThreshold, tideModel, tideGauge, tideKm]);

  // Phase DK: the DMI model points are markers like the gauges (id `dmi:<spot>`; a click picks the spot they belong to).
  // Revier „Dänemark“ shows them and the BSH gauges the Danish spots read.
  const mapGauges: SeaMapGauge[] | null = useMemo(() => {
    if (!water) return null;
    const dkBsh = new Set(spots.flatMap((s) => (s.dk?.wl?.from === 'bsh' ? [s.dk.wl.gauge] : [])));
    const bsh = water && wlCat.gauges.length
      ? wlCat.gauges
        .filter((g) => revier === 'alle' || (revier === 'daenemark' ? dkBsh.has(g.id) : revier === 'nordsee' ? g.region === 'north_sea' : g.region === 'baltic_sea'))
        .map((g) => ({ id: g.id, name: g.name, lon: g.lon, lat: g.lat }))
      : [];
    const dk = spots.filter((s) => s.dk?.wl?.from === 'dmi' && seaInRevier(s, revier)).map((s) => {
      const e = dmiDoc?.wl.spots[s.id], w = s.dk!.wl as { lat: number; lon: number };
      return { id: `dmi:${s.id}`, name: `DMI-Modellpunkt ${s.name}`, lon: e?.lon ?? w.lon, lat: e?.lat ?? w.lat };
    });
    return bsh.length + dk.length ? [...bsh, ...dk] : null;
  }, [water, wlCat.gauges, revier, spots, dmiDoc]);
  const pickGauge = useCallback((id: string) => { if (id.startsWith('dmi:')) pickSpotFromMap(id.slice(4)); else setGaugePick(id); }, [pickSpotFromMap]);
  // The chip „Dänemark“ fits the map to the Danish spots (only when the Revier changes to it).
  useEffect(() => {
    if (revier !== 'daenemark' || !mapInst) return;
    const dk = spots.filter((s) => s.country === 'DK');
    if (!dk.length) return;
    const lons = dk.map((s) => s.lon), lats = dk.map((s) => s.lat);
    mapInst.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 56, maxZoom: 9, duration: 600 });
  }, [revier, mapInst, hasDk]); // eslint-disable-line react-hooks/exhaustive-deps

  const stations = useMemo(() => (toggles.stations ? [...new Map(spots.filter((s) => s.station).map((s) => [s.station!.id, { id: s.station!.id, name: s.station!.name, lon: s.station!.lon, lat: s.station!.lat }])).values()] : null), [spots, toggles.stations]);

  // Phase SU: how often gusts lie above the profile's gust limit, per hour (`null` without quantiles or without a gust limit).
  const bandHours: SeaBandHour[] = spotHours.map((h, i) => ({ t: h.t, windMs: h.windMs, gustMs: h.gustMs, windDir: h.windDir, hs: h.hs, dir: h.dir, tm: h.tm, dry: h.dry, cls: spotVerdicts[i].cls, reason: spotVerdicts[i].reasons.join(' · '), daylight: spotVerdicts[i].daylight, over: gustOverLimit(h.gustQ, limits.gustMax), curKn: spotCur?.kn[firstIdx + i] ?? null, curTo: spotCur?.to[firstIdx + i] ?? null }));
  const bandOver = limits.gustMax != null && bandHours.some((h) => h.over) ? { limitKn: limits.gustMax } : null;
  const chartHours = spotHours.map((h, i) => ({
    t: h.t, windMs: h.windMs, gustMs: h.gustMs, hs: h.hs, ws: h.ws, sw: h.sw, dry: h.dry, daylight: spotVerdicts[i].daylight,
    windBand: h.windQ ? [h.windQ.q10, h.windQ.q90] as const : null, gustBand: h.gustQ ? [h.gustQ.q10, h.gustQ.q90] as const : null,
  }));
  const dryHours = spotHours.reduce((a, h) => a + (h.dry ? 1 : 0), 0);
  const lim = limits.gustMax ?? limits.windMax;
  const profLabel = SEA_PROFILE_BY_ID[profile].label;
  const windEngine = spotsDoc?.wind?.engine ?? 'buscosun Fusion';
  // Phase DK: at a spot outside the point cube the wind is DMI's — named as such wherever the spot's wind is named.
  const spotWindName = spot && spotsDoc?.windBy?.[spot.id] ? DMI_WIND_LABEL : windEngine;
  const runTxt = run ? `CWAM ${run.run.slice(8, 10)} UTC` : '–';
  const noSeriesText = noSeries && spot ? `Für ${spot.name} trägt der veröffentlichte Seegangslauf noch keine Stundenreihe. Sie kommt mit dem nächsten Lauf (zweimal täglich, gegen 04 und 16 Uhr UTC plus Rechenzeit).` : null;
  // „Quellen" on the map (shared source line of the map pages, Brandradar concept, Jan 07.11.)
  const sourceGroups: MapSourceGroup[] = [
    { title: 'Basiskarte', items: [BASEMAP_SOURCE] },
    {
      title: 'Kartenebenen',
      items: [
        { name: 'Deutscher Wetterdienst · Wellenmodelle CWAM und EWAM', url: 'https://opendata.dwd.de/', what: 'Seegang: Wellenhöhe und Periode als Fläche und Pfeile', licence: 'GeoNutzV / CC BY 4.0', licenceUrl: CC_BY_URL, changed: 'eigene Farbskala, geprüft', on: !noData },
        { name: windEngine, what: 'Wind und Böen an den Spots, berechnet aus Wettermodellen und Messungen (u. a. DWD)', licence: 'Datenbasis, bearbeitet', on: toggles.wind && !noData },
        { name: 'Deutscher Wetterdienst · Seewetterdienst', url: 'https://opendata.dwd.de/', what: 'Warnstatus der Küstengebiete (Seewetterbericht)', licence: 'GeoNutzV / CC BY 4.0', licenceUrl: CC_BY_URL, on: toggles.warn },
        { name: 'Seegebiete © GeoBasis-DE / BKG 2021, VMAP0', what: 'Umrisse der Warngebiete', changed: 'Daten modifiziert', on: toggles.warn },
        { name: 'Deutscher Wetterdienst · Messstationen', url: 'https://opendata.dwd.de/', what: 'Wind und Böen gemessen', licence: 'GeoNutzV / CC BY 4.0', licenceUrl: CC_BY_URL, on: toggles.stations },
        { name: 'Bundesamt für Seeschifffahrt und Hydrographie (BSH)', url: WL_SERVICE_PAGE, what: 'Wasserstandsvorhersage an den Pegeln', credit: WL_ATTRIBUTION, licence: WL_LICENCE, licenceUrl: WL_LICENCE_URL, on: water },
        { name: `${BSH_CURRENT_NAME} · Strömungsvorhersage`, url: BSH_CURRENT_PAGE, what: `Oberflächenströmung: Wert am Spot, Stauwasser, Pfeile auf der Karte (${SEA_CURRENT_MODEL_NOTE})`, credit: BSH_CURRENT_CREDIT, licence: BSH_CURRENT_LICENCE, licenceUrl: BSH_CURRENT_LICENCE_URL, changed: BSH_CURRENT_CHANGED, on: toggles.current || !!spotCur },
        // Phase WT — listed while the water temperature catalogue is there: the model and the measurement, each with its own source.
        ...(wtemp.on ? [
          { name: `${DMI_NAME} · Sturmflutmodell DKSS`, url: DMI_HOST, what: `Wassertemperatur am Spot aus dem Modell (${WT_MODEL_NOTE})`, credit: DMI_CREDIT, licence: DMI_LICENCE, licenceUrl: DMI_LICENCE_URL, changed: 'eigene Darstellung, auf Stunden und 0,1 °C gerundet', on: true },
          { name: WSV_NAME, url: WSV_PAGE, what: 'Wassertemperatur gemessen an Pegeln der deutschen Nordseeküste, an dänischen Spots an Stationen des DMI', credit: WSV_CREDIT, licence: WSV_LICENCE, licenceUrl: WSV_LICENCE_URL, changed: 'Rohwerte, im Verlauf auf volle Stunden ausgedünnt', on: true },
        ] : []),
        // Phase DK — only listed when the catalogue carries Danish spots.
        ...(hasDk ? [{ name: DMI_NAME, url: DMI_HOST, what: 'Dänische Spots: Wasserstand des Sturmflutmodells DKSS, Wind aus HARMONIE außerhalb des Punkt-Cubes, Messungen der Stationen', credit: DMI_CREDIT, licence: DMI_LICENCE, licenceUrl: DMI_LICENCE_URL, changed: 'eigene Darstellung, auf Stunden und cm gerundet', on: water || toggles.stations || toggles.wind }] : []),
      ],
    },
  ];
  const sourceTile = <MapSourcesTile title="Quellen des Seewetters" groups={sourceGroups} ready={pageShown} />;
  const liveTone = !runLoad ? 'loading' : noData ? 'none' : freshness === 'stale' ? 'stale' : 'live';
  // Desktop: the hourly band lives in the dossier now, so the map foot is free (was 250 px for the band).
  // SP: with the planner open the foot of the map carries the hour band (desktop) or the sheet (phone).
  const padding = isMobile ? { top: 76, bottom: planOpen && mobTab === 'plan' ? 380 : 440, left: 24, right: 24 }
    : planOpen ? { top: 110, bottom: 330, left: 40, right: 40 } : { top: 110, bottom: 40, left: 40, right: 230 };
  const fieldNote = fStep != null && fStep !== lead ? ` · Karte zeigt +${fStep} h (${fKind === 'c' ? 'Komponenten' : 'ab 48 h'} dreistündlich)` : '';

  // --- pieces -----------------------------------------------------------------------------------------------
  const chips = (
    <div role="group" aria-label="Zeitpunkt" className="sw-seg sw-times">
      {SEA_TIME_CHIPS.filter((c) => c < Math.max(1, nHours)).map((c) => (
        <button key={c} type="button" aria-pressed={c === k} className={c === k ? 'is-active' : ''} onClick={() => setT(c)}>
          {c === 0 ? 'Jetzt' : `+${c} h`}{c === k ? ` · ${dayShort(validMs)} ${hh(validMs)}:00` : ''}
        </button>
      ))}
    </div>
  );
  const pillBadge = spot ? `${spot.country === 'DK' ? 'DÄNEMARK · ' : ''}${spot.region === 'nordsee' ? 'NORDSEE' : 'OSTSEE'}` : '';
  const legend = (
    <div className="sw-legend sw-legend-bar" aria-label="Legende">
      <div className="sw-legend-main">
        <div className="sw-eyebrow">{layer === 'per' ? 'Periode Tm s' : `Seegang Hs · ${LAYER_LABEL[layer]}`}</div>
        <div className="sw-legend-ramp" style={{ background: cssGradient(layer === 'per' ? PER_STOPS : HS_STOPS) }} />
        <div className="sw-legend-ticks">{layer === 'per' ? <><span>0</span><span>3</span><span>6</span><span>9</span><span>12 s</span></> : <><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6 m</span></>}</div>
      </div>
      <div className="sw-legend-side">
        <div className="sw-legend-row"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" fill="none" stroke="#2C2A26" strokeWidth="1.6" strokeLinecap="round"><path d="M2 6h13M11 2l4 4-4 4" /></svg>Wellen laufen in Pfeilrichtung</div>
        <div className="sw-legend-row"><i className="is-hatched" />Wasser ohne gültigen Wert</div>
        {toggles.current && <div className="sw-legend-row sw-st-legend"><DriftArrow to={90} size={16} />{currents ? 'Strom setzt in Pfeilrichtung (Modell des BSH)' : current === 'loading' ? 'Strömung lädt' : 'Strömung: keine Daten für diese Stunde'}</div>}
      </div>
      <div className="sw-legend-spot">
        <div className="sw-eyebrow">Spot · {profLabel}</div>
        <div className="sw-legend-classes">{(['passt', 'knapp', 'ausserhalb', 'keine'] as const).map((c) => <span key={c}><i className={c === 'keine' ? 'is-hatched' : ''} style={c !== 'keine' ? { background: CLASS_COLOR[c] } : undefined} />{CLASS_SHORT[c]}</span>)}</div>
      </div>
      <div className="sw-legend-note">{noData ? 'Keine Fläche: kein gültiger Lauf.' : `Modell ${runTxt}, Vorlauf +${lead} h${fieldNote}. Wind an den Spots: ${windEngine}.`}{fieldState === 'error' ? ' Feld nicht ladbar.' : ''}</div>
    </div>
  );
  const emptyMap = noData && <div className="sw-map-note" role="status"><strong>Keine Daten.</strong> {noData} Es wird keine Seegangsfläche gezeigt.</div>;
  const catFail = catalog === null && <div className="sw-map-note" role="status"><strong>Spotkatalog nicht ladbar.</strong> Der Datenspeicher antwortet nicht.</div>;
  // --- Phase SP: what the planner shows (map, band row, findings) --------------------------------------------------
  const planHour = noData ? null : hour;
  const planDrift = spot && planHour ? driftOf(planHour.windDir, spot.normal) : null;
  const planWindDir = planHour?.windDir ?? null;
  const boatLat = planModel?.boat.lat ?? null, boatLon = planModel?.boat.lon ?? null;
  const planBadge = `${planClock(validMs)}: ${badgeText(planHour, unit)}`;
  const mapPlan: SeaMapPlan | null = useMemo(() => (spot && boatLat != null && boatLon != null ? {
    launch: { lon: spot.lon, lat: spot.lat }, boat: { lon: boatLon, lat: boatLat }, radiusKm: SEA_PLAN_RADIUS_KM,
    driftTo: planDrift?.toDeg ?? null, side: planDrift?.side ?? null, badge: planBadge,
    lineLabel: lineLabel({ lat: boatLat, lon: boatLon }, spot, planWindDir),
    labelAt: (lat: number, lon: number) => lineLabel({ lat, lon }, spot, planWindDir),
    onBoat: (lat: number, lon: number) => setPlan((p) => p && { ...p, lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 }),
  } : null), [spot, boatLat, boatLon, planDrift?.toDeg, planDrift?.side, planBadge, planWindDir]);
  const bandPlan = planModel?.win ? { start: planModel.win.start, end: planModel.win.end, onChange: setPlanHours, touch: isMobile } : null;
  const planCard = (kk: number, isReturn: boolean): SeaPlanCard | null => {
    const h = spotHours[kk], v = spotVerdicts[kk], w = planModel?.win;
    if (!spot || !h || !v || !w) return null;
    const lines: string[] = [];
    if (v.shore) lines.push(`Uferwinkel: ${SHORE_LABEL[v.shore]} (${DRIFT_SIDE_LABEL[driftOf(h.windDir, spot.normal)!.side]})`);
    const rel = relativeWind(h.windDir, planModel?.course ?? null);
    if (rel) lines.push(`Wind zum Rückweg in dieser Stunde: ${REL_LABEL[rel]}`);
    if (h.dry) lines.push(`Seegang: ${DRY_VALUE}`); else if (h.hs != null) lines.push(`Welle ${f1(h.hs, ' m')}`);
    lines.push(`${profLabel}: ${CLASS_SHORT[v.cls]}${v.cls !== 'passt' && v.reasons[0] ? ` (${v.reasons[0]})` : ''}`);
    // SU: the share above the gust limit belongs to this ONE hour — never added up over the window (E-SP-9).
    const o = limits.gustMax != null ? gustOverLimit(h.gustQ, limits.gustMax) : null;
    if (o && limits.gustMax != null) lines.push(`Nur diese Stunde: ${overSentence(o, limits.gustMax)}`);
    // Water level at the return — only where a gauge curve exists.
    if (isReturn && tideDoc && tideDoc.curve.length > 0) {
      const pt = wlAt(tideDoc.curve, h.t), cm = pt?.forecast ?? pt?.measured ?? pt?.tide ?? null;
      const at = `Wasserstand am Pegel ${tideDoc.name}${tideKm != null ? ` (${f1(tideKm)} km vom Spot)` : ''}`;
      lines.push(cm == null ? `${at}: Die Kurve reicht nicht bis zur Rückkehr.`
        : `${at}: ${Math.round(cm)} cm über Pegelnull (${pt?.forecast != null ? 'Kurve des BSH' : pt?.measured != null ? 'gemessen' : 'nur Gezeit'})`);
    }
    return {
      when: planClock(h.t), wind: badgeText(h, unit), lines, color: v.cls === 'keine' ? null : CLASS_COLOR[v.cls],
      canEarlier: isReturn ? w.end > w.start + 1 : w.start > 0, canLater: isReturn ? w.end < nHours - 1 : w.start < w.end - 1,
    };
  };
  const playBtn = planModel?.win ? (
    <button type="button" className={`sw-pl-play${playing ? ' is-on' : ''}`} aria-pressed={playing} onClick={togglePlay}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{playing ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}</svg>
      {playing ? 'Anhalten' : 'Fenster abspielen'}
    </button>
  ) : null;
  const planOfficial = warning.status === 'unknown' ? {
    why: warning.why,
    texts: [
      ...(warning.area && warning.area.status === 'unknown' && warning.area.text ? [{ head: `Seegebiet ${warning.area.name} (WODL45, englischer Teil):`, text: warning.area.text }] : []),
      ...(warning.coast && warning.coast.status === 'unknown' && warning.coast.text ? [{ head: `${spot?.wodlCoast === 'Ostseekueste' ? 'Ostseeküste' : 'Nordseeküste'} (WODL45):`, text: warning.coast.text }] : []),
    ],
  } : null;
  const planAskBox = (planAsk || (planPick && planOpen)) && (
    <div className="sw-pl-ask" role="status">
      <strong>Ausfahrt planen</strong>
      <p>{PLAN_ASK_SPOT}</p>
      <button type="button" className="sw-link" onClick={() => { if (planPick) { setPlanPick(false); setMobTab('plan'); } else { setPlanAsk(false); setMobTab('map'); } }}>{planPick ? 'Zurück zum Planer' : 'Abbrechen'}</button>
    </div>
  );
  const map = (
    <SeaMap field={coloured} arrows={arrows} spots={noData ? mapSpots.map((s) => ({ ...s, cls: 'keine' as const, windTo: null })) : mapSpots} selectedId={spot?.id ?? null}
      stations={stations} gauges={mapGauges} selectedGaugeId={gaugeId ?? (dmiSpot && spot ? `dmi:${spot.id}` : null)} onGauge={pickGauge} areas={mapAreas} showWind={toggles.wind && !noData} padding={padding} onSelect={pickSpotFromMap} onMap={(m) => { mapRef.current = m; setMapInst(m); }}
      plan={mapPlan} currents={toggles.current ? currents : null} />
  );
  const band = spot && usable && bandHours.length > 0 && (
    <SeaBand hours={bandHours} unit={unit} selected={k} onPick={setT} compact={isMobile}
      title={`${spot.name} · ${profLabel}`} sub={`${dayShort(bandHours[0].t)} ${hh(bandHours[0].t)} bis ${dayShort(bandHours[bandHours.length - 1].t)} ${hh(bandHours[bandHours.length - 1].t)} Uhr · ${tzLabel(validMs)}`}
      footnote={`Welle: Modell ${runTxt} · Wind/Böen: ${spotWindName}`}
      tide={tideFeed ? { hours: tideFeed.hours!, side: tideSideText(tideFeed.mode!, tideFeed.name) } : null} over={bandOver} plan={bandPlan} current={!!spotCur} />
  );
  const planner = planOpen && spot ? (
    <SeaPlanPanel spotName={spot.name} limitsText={`${profLabel}, ${limitsSummary(limits)}`} profile={profile} onProfile={setProfile}
      noData={noData ?? (usable ? null : 'Die Stundenreihe des Spots lädt oder ist gerade nicht lesbar.')} official={planOfficial}
      start={planModel?.win ? planCard(planModel.win.start, false) : null} ret={planModel?.win ? planCard(planModel.win.end, true) : null}
      onShift={(which, by) => { const w = planModel?.win; if (w) setPlanHours(which === 'start' ? w.start + by : w.start, which === 'end' ? w.end + by : w.end); }}
      events={planModel?.win ? planModel.events : []}
      span={planModel?.win ? `${planModel.win.end - planModel.win.start} ${planModel.win.end - planModel.win.start === 1 ? 'Stunde' : 'Stunden'}, ${planClock(planModel.startT)} bis ${planClock(planModel.endT)}` : ''}
      now={`Karte zeigt ${planClock(validMs)}${k < (planModel?.win?.start ?? 0) || k > (planModel?.win?.end ?? 0) ? ' (außerhalb deines Fensters)' : ''}: ${mapPlan?.lineLabel ?? ''}${planDrift ? `. ${DRIFT_SIDE_LABEL[planDrift.side]} (${SHORE_LABEL[planDrift.shore]})` : ''}.`}
      summary={planModel?.win ? planModel.summary : []}
      notes={[PLAN_LINE_NOTE, PLAN_RADIUS_NOTE, PLAN_DRIFT_NOTE, PLAN_COLOUR_NOTE, PLAN_HOURLY_NOTE, ...(spot.tidal ? [PLAN_TIDAL_NOTE] : [])]}
      moved={planModel?.win?.moved ? PLAN_MOVED_NOTE : planModel?.win?.cut ? PLAN_CUT_NOTE : null}
      play={playBtn} band={isMobile ? band : null}
      onChangeSpot={() => { setPlanPick(true); setMobTab('spot'); }} onClose={closePlanner} />
  ) : null;
  const planBtn = (
    <button type="button" className="sw-pl-open" onClick={openPlanner}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17l2.2 3.5h13.6L21 17H3zM12 3v11M12 4.5l6 7.5h-6" /></svg>
      Ausfahrt planen
    </button>
  );
  const dockOf = (show: 'all' | 'layers' | 'picker') => (
    <SeaDock show={show} query={query} onQuery={setQuery} revier={revier} onRevier={setRevier} profile={profile} onProfile={setProfile} limits={limits} onLimits={setLimits}
      spots={dockSpots} selectedId={spot?.id ?? null} onPick={pickSpotFromMap} total={spots.length} layer={layer} onLayer={setLayer}
      toggles={toggles} onToggle={(kk) => setToggles((x) => ({ ...x, [kk]: !x[kk] }))} loading={catalog === 'loading'} hasDk={hasDk} />
  );
  const readout = (
    <SeaReadout tab={tab} onTab={setTab} spot={spot} hour={hour} verdict={verdict} profileLabel={profLabel} windows={wins} chartHours={chartHours}
      limitKn={lim} limitLabel={limits.gustMax != null ? `Böen ${limits.gustMax} kn` : limits.windMax != null ? `Wind ${limits.windMax} kn` : ''} gustLimitKn={limits.gustMax} unit={unit}
      run={run} spotsDoc={spotsDoc} freshness={freshness} texts={seaTexts} poi={poi} nowMs={nowMs} noData={noData ?? noSeriesText} warning={warning}
      dry={{ hours: dryHours, of: spotHours.length, classed: dryRule }} waterLevel={waterLevel} dmiWater={dmiWater} tide={tideView}
      layout="dossier" band={band} chips={isMobile ? undefined : (usable && chips)} onMap={() => setStage('map')}
      current={spot && currentView ? <SeaCurrentPanel view={currentView} tMs={validMs} windFrom={hourWindDir} windKn={hourWindKn} tidal={!!spot.tidal} /> : undefined}
      waterTemp={spot && wtemp.view ? <SeaWaterTempPanel view={wtemp.view} /> : undefined} />
  );
  const inDossier = stage === 'dossier';
  // The compact preview of the map-picked spot — the same numbers as the briefing and the callout.
  const cardEl = mapCard && spot && spot.id === mapCard && !inDossier && !planOpen ? (
    <SeaMapCard badge={pillBadge} name={spot.name} sub={`${spot.seaArea?.name ?? spot.coast?.name ?? ''} · ${kindsLabel(spot.kinds)} · Profil ${profLabel}`}
      verdict={noData ? 'keine Daten' : CLASS_LABEL[verdict?.cls ?? 'keine']} color={!noData && verdict && verdict.cls !== 'keine' ? CLASS_COLOR[verdict.cls] : null}
      stats={!hour || noData ? [] : [
        { l: 'Wind', v: `${fmtWind(hour.windMs, unit)} ${unitLabel(unit)}`, s: `aus ${compass16(hour.windDir)}` },
        { l: 'Böen', v: `${fmtWind(hour.gustMs, unit)} ${unitLabel(unit)}`, s: mostText(hour.gustQ, unit) ?? undefined },
        { l: 'Welle', v: hour.dry ? DRY_VALUE : f1(hour.hs, ' m'), s: !hour.dry && hour.tm != null ? `${f1(hour.tm)} s` : undefined },
      ]}
      reason={!noData && verdict && verdict.cls !== 'passt' ? verdict.reasons[0] ?? null : null}
      window={noData || !usable || !wins.next ? null : `Nächstes Fenster ${dayShort(wins.next.from)} ${hh(wins.next.from)}–${hh(wins.next.to)} Uhr`}
      official={null}
      onOpenDossier={() => { setMapCard(null); setStage('dossier'); }}
      onClose={() => setMapCard(null)} />
  ) : null;
  const stageSeg = (
    <div className="sw-seg sw-stage-seg" role="group" aria-label="Bühne der Mitte">
      <button type="button" className={!inDossier ? 'is-active' : ''} aria-pressed={!inDossier} onClick={() => setStage('map')}>Karte</button>
      <button type="button" className={inDossier ? 'is-active' : ''} aria-pressed={inDossier} onClick={() => setStage('dossier')}>Dossier</button>
    </div>
  );
  const units = (
    <div role="group" aria-label="Einheit Wind" className="sw-seg sw-units">
      {SEA_UNITS.map((u) => <button key={u} type="button" aria-pressed={unit === u} className={unit === u ? 'is-active' : ''} onClick={() => setUnit(u)}>{unitLabel(u)}</button>)}
    </div>
  );

  // --- mobile ----------------------------------------------------------------------------------------------
  if (isMobile) {
    // The top row (brand · time chips · share) sits over the map, and at the head of the dossier page while that is open.
    const mTop = (
      <div className="sw-m-top">
        <button type="button" className="sw-m-brand" aria-label="Zur Startseite" onClick={nav.goHome}><img src="/buscosun-mark.svg" width={22} height={22} alt="" /></button>
        <div className="sw-m-times">{chips}</div>
        <ShareButton className="sw-m-share" compact />
      </div>
    );
    // Phase SU: dots and sentence of the chosen hour sit on the bottom bar while a spot is being looked at (its card or dossier).
    const barOver = (inDossier || cardEl) && usable && limits.gustMax != null ? gustOverLimit(hour?.gustQ, limits.gustMax) : null;
    return (
      <div className={`sw-root is-mobile${barOver ? ' has-odds' : ''}`}>
        <AppLoader cover done={pageShown} />
        {unknownSpot && <SeaLinkNotice kind="unknown" slug={unknownSpot} onClose={() => setUnknownSpot(null)} />}
        <main className="sw-map is-mobile msl-host" aria-label="Karte">
          {map}
          {/* The sources tile floats above every page layer — it belongs to the map, not to the dossier page over it. */}
          {!inDossier && sourceTile}
          <MapGestureHint map={mapInst} feature="seewetter" subject="sea" accent="#0F6E7A" pickSpots={hintSpots} always enabled={mobTab === 'map' && !inDossier} />
          {!inDossier && mTop}
          {/* The legend sits just above the bottom bar and gives its place to the info card while one is open — and to the
              planner's sheet („Karte“ in the bottom bar shows map and legend again, the boat stays). */}
          {!cardEl && !(planOpen && mobTab === 'plan') && <div className="sw-m-legend">{legend}</div>}
          {emptyMap}{catFail}
          {cardEl && <div className="sw-map-card">{cardEl}</div>}
        </main>
        {/* „Detailansicht öffnen“ on the phone: the spot dossier as a full-screen page over the map (the map stays mounted). */}
        {inDossier && (
          <div className="sw-m-dossier" role="region" aria-label="Spot-Dossier">
            {mTop}
            <div className="sw-ds-scroll">{readout}</div>
          </div>
        )}
        {mobTab !== 'map' && mobTab !== 'tide' && mobTab !== 'plan' && (
          <div className="sw-m-dock" role="dialog" aria-label={mobTab === 'spot' ? 'Spot und Profil wählen' : 'Ebenen'}>
            <div className="sw-m-dock-head"><strong>{mobTab === 'spot' ? 'Spot und Profil' : 'Ebenen'}</strong></div>
            {mobTab === 'spot' && planAskBox}
            {dockOf(mobTab === 'spot' ? 'picker' : 'layers')}
          </div>
        )}
        {/* Phase SP: the planner as a sheet over the foot of the map — the boat stays in reach above it. */}
        {mobTab === 'plan' && planner && !inDossier && (
          <div className={`sw-pl-sheet${planSheetOpen ? ' is-open' : ''}`} role="region" aria-label="Ausfahrt planen">
            <button type="button" className="sw-pl-sheetgrip" aria-expanded={planSheetOpen} onClick={() => setPlanSheetOpen((o) => !o)}>
              <span aria-hidden="true" />{planSheetOpen ? 'Karte zeigen' : 'Alle Befunde zeigen'}
            </button>
            <div className="sw-pl-sheetbody">{planner}</div>
          </div>
        )}
        {mobTab === 'tide' && tideView && (
          <div className="sw-m-dock sw-tf-sheet" role="dialog" aria-label="Schwelle für den Wasserstand">
            <div className="sw-m-dock-head"><strong>Deine Schwelle am Pegel</strong></div>
            <div className="sw-tf-sheet-body">
              {tideDoc ? (
                <>
                  <TideControl view={tideView} atCm={(() => { const pt = wlAt(tideDoc.curve, validMs); return pt?.forecast ?? pt?.measured ?? null; })()} />
                  <TideWindows view={tideView} />
                </>
              ) : <p className="sw-note">{tideGauge ? `Der Verlauf am Pegel ${tideGauge.name} lädt oder ist gerade nicht lesbar — ohne Kurve gibt es kein Fenster.` : 'Für diesen Spot ist noch kein Pegel gewählt.'}</p>}
              <button type="button" className="sw-link sw-tf-open" onClick={() => { setTab('spot'); setStage('dossier'); setMobTab('map'); }}>Verlauf und Stundenband im Dossier öffnen</button>
            </div>
          </div>
        )}
        {barOver && limits.gustMax != null && <SeaGustOdds over={barOver} limitKn={limits.gustMax} where="bar" />}
        <nav className="sw-bar" aria-label="Seewetter-Bereiche">
          {([
            ['map', 'Karte', <path key="p" d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 7 9 4zM9 4v13M15 7v12.5" />],
            ['spot', 'Spot', <g key="p"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></g>],
            ['layers', 'Ebenen', <path key="p" d="m12 3 9 4.5-9 4.5-9-4.5L12 3zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5" />],
            // Phase SP: the trip planner — never disabled; without a chosen spot it asks for one first.
            ['plan', 'Ausfahrt', <path key="p" d="M3 17l2.2 3.5h13.6L21 17H3zM12 3v11M12 4.5l6 7.5h-6" />],
            // Phase TF: the threshold control lives in the bottom bar on the phone (only with the switch on).
            ...(tideView ? [['tide', 'Schwelle', <g key="p"><path d="M3 15c2-2.4 4-2.4 6 0s4 2.4 6 0 4-2.4 6 0" /><path d="M3 8.5h18" strokeDasharray="3 3" /><path d="M12 19.5v-2M12 6V3.5" /></g>] as const] : []),
          ] as const).map(([id, label, icon]) => (
            <button key={id} type="button" className={`sw-bar-btn${mobTab === id && !(id === 'map' && inDossier) ? ' is-active' : ''}`} aria-current={mobTab === id && !(id === 'map' && inDossier) ? 'page' : undefined} onClick={() => { if (id === 'plan') { openPlanner(); return; } setMobTab(id); if (id === 'map') setStage('map'); }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
    );
  }

  // --- desktop / tablet -------------------------------------------------------------------------------------
  return (
    <div className="sw-root">
      <AppLoader cover done={pageShown} />
      {unknownSpot && <SeaLinkNotice kind="unknown" slug={unknownSpot} onClose={() => setUnknownSpot(null)} />}
      <FeatureRail active={'sea' as RailFeature} onOpenFeature={(id) => nav.openFeature(id)} onHome={nav.goHome}
        navClass="sw-rail" btnClass="sw-rail-btn" activeClass="is-active" spacerClass="sw-rail-spacer" />
      <div className="sw-deck">
        <header className="sw-topbar">
          <a className="sw-brand" href="/" onClick={(e) => { e.preventDefault(); nav.goHome(); }} aria-label="Zur Startseite">
            <img src="/buscosun-mark.svg" width={22} height={22} alt="" /><span>buscosun</span>
          </a>
          <span className="sw-topdiv" aria-hidden="true" />
          <span className="sw-topbar-sub">Seewetter Nord- und Ostsee{inDossier && spot ? <span className="sw-topbar-spot"> · {spot.name}</span> : null}</span>
          {stageSeg}
          <div className="sw-topbar-right">
            <span className={`sw-live is-${liveTone}`} role="status"><span className="sw-live-dot" aria-hidden="true"><span /><span /></span>{liveTone === 'live' ? 'Aktuell' : liveTone === 'stale' ? 'Veraltet' : liveTone === 'loading' ? 'Lädt' : 'Keine Daten'}</span>
            <span className="sw-topbar-stand">
              {run && !noData ? <>Lauf <strong>{runTxt}</strong>{run.builtAt ? ` · bereit ${hm(Date.parse(run.builtAt))}` : ''}</> : 'kein gültiger Lauf'}
              {seaTexts.fq50 ? ` · Seewetterbericht ${hm(Date.parse(seaTexts.fq50.issuedAt))}` : ''}{seaTexts.wodl ? ` · Warnstatus ${hm(Date.parse(seaTexts.wodl.issuedAt))}` : ''} {tzLabel(nowMs)}
            </span>
            {units}
            <ShareButton className="sw-share" text="Teilen" />
          </div>
        </header>
        <div className={`sw-body${inDossier ? ' is-dossier' : ''}`}>
          {dockOf('layers')}
          <main className={`sw-map msl-host${inDossier ? ' is-offstage' : ''}${planOpen ? ' is-plan' : ''}`} aria-label="Karte" aria-hidden={inDossier ? true : undefined}>
            {map}
            {sourceTile}
            <MapGestureHint map={mapInst} feature="seewetter" subject="sea" accent="#0F6E7A" pickSpots={hintSpots} always enabled={!inDossier} />
            <div className="sw-ov-left">
              {usable && chips}            </div>
            {planOpen ? (
              // Phase SP: the foot of the map carries the hour band with the row „Fenster“; the legend folds above it.
              <div className="sw-pl-dock">
                <details className="sw-pl-legend"><summary>Legende</summary>{legend}</details>
                {!inDossier && band}
              </div>
            ) : <div className="sw-ov-right">{planBtn}{legend}</div>}
            {emptyMap}{catFail}
            {cardEl && <div className="sw-map-card">{cardEl}</div>}
          </main>
          {inDossier && (
            <main className="sw-ds-main" aria-label="Spot-Dossier">
              <div className="sw-ds-scroll">{readout}</div>
            </main>
          )}
          {planner && !planPick
            ? <aside className="sw-readout is-plan" aria-label="Ausfahrt planen">{planner}</aside>
            : <aside className="sw-readout is-picker" aria-label="Spots und Profil">{planAskBox}{dockOf('picker')}</aside>}
        </div>
      </div>
    </div>
  );
}

