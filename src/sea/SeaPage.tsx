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
import { seaDryRuleFrom, seaWaterLevelFrom } from './seaFlag';
import { wlDistKm, wlNearest, type WlForecast, type WlGauge } from './waterLevel';
import { WlCatalogMissing, loadGaugeCatalog, loadGaugeForecast } from './waterLevelClient';
import { coastWarnStatus, seaTextFreshness, type SeaTextProduct } from './seaText';
import {
  loadAreas, loadCatalog, loadField, loadKillSwitch, loadLatestRun, loadPoi, loadSpots, loadText, windPointerOf, withWindRefresh,
  type SeaAreas, type SeaCatalog, type SeaPoiObs, type SeaRunLoad, type SeaSpotsDoc,
} from './seaClient';
import {
  SEA_PROFILE_BY_ID, loadLimits, saveLimits, nextAndLongest, fmtWind, unitLabel, SEA_UNITS, MS_TO_KN,
  type SeaLimits, type SeaProfileId, type SeaUnit, type SeaVerdict,
} from './seaProfiles';
import { SeaVerdictCache } from './seaVerdicts';
import { SEA_TIME_CHIPS, type SeaLayer, type SeaRevier, type SeaTab, type SeaUrlState } from './seaState';
import {
  CLASS_COLOR, CLASS_LABEL, CLASS_SHORT, DRY_VALUE, HS_STOPS, LAYER_LABEL, PER_STOPS, H, compass16, cssGradient, dayShort, f1, hh, hm, tzLabel, waveArrows,
} from './seaView';
import { colourFieldAsync } from './seaFieldClient';
import SeaMap, { type SeaMapArea, type SeaMapGauge, type SeaMapSpot } from './SeaMap';
import SeaDock, { type SeaToggles } from './SeaDock';
import SeaBand, { type SeaBandHour } from './SeaBand';
import SeaReadout, { findWarning, type SeaReadoutHour, type SeaTexts, type SeaWaterLevel } from './SeaReadout';
import SeaMapCard from './SeaMapCard';
import './seaDeck.css';

export interface SeaPageProps {
  initial: SeaUrlState;
  invalid: string[];
  onUrlState: (s: SeaUrlState) => void;
  onSpot: (s: SeaUrlState, initial: boolean) => void;
  popState?: (SeaUrlState & { key: string }) | null;
}

const DEFAULT_SPOT = 'st-peter-ording';
const REFRESH_MS = 10 * 60_000;
const TEXTS: SeaTextProduct[] = ['FQDL50', 'FQDL51', 'WODL45', 'FXDL40'];
/** WL: `water` on by default (E-WL-1), `?wl=0` starts without it — the switch stays the named fallback. */
const DEFAULT_TOGGLES: SeaToggles = { wind: true, warn: true, stations: false, water: true };
const KIND_LABEL: Record<string, string> = { strand: 'Badestrand', kite: 'Kite-Spot', hafen: 'Hafen', revier: 'Revier' };
export const kindsLabel = (kinds: readonly string[]) => kinds.map((x) => KIND_LABEL[x] ?? x).join(', ');
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

export default function SeaPage({ initial, onUrlState, onSpot, popState }: SeaPageProps) {
  const nav = useAppNav();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [catalog, setCatalog] = useState<SeaCatalog | null | 'loading'>('loading');
  const [areas, setAreas] = useState<SeaAreas | null>(null);
  const [killed, setKilled] = useState(false);
  const [runLoad, setRunLoad] = useState<SeaRunLoad | null>(null);
  const [spotsDoc, setSpotsDoc] = useState<SeaSpotsDoc | null>(null);
  const [windPtr, setWindPtr] = useState<string | null>(null);
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
  const [mobTab, setMobTab] = useState<'map' | 'spot' | 'layers'>('map');
  /** Desktop centre stage: the map (default) or the spot dossier — like the Brandradar (BD2), the map stays mounted. */
  const [stage, setStage] = useState<'map' | 'dossier'>('map');
  /** The spot a MAP click picked: its preview card (bottom left) stays until closed, the detail opens or another spot is picked. */
  const [mapCard, setMapCard] = useState<string | null>(null);
  useEffect(() => { if (stage === 'dossier') setMapCard(null); }, [stage]);
  const firstSpot = useRef(true);

  const popKey = popState?.key ?? null;
  useEffect(() => {
    if (!popState) return;
    setSpotId(popState.spot ?? DEFAULT_SPOT); setProfile(popState.p); setT(popState.t); setLayer(popState.l); setUnit(popState.u); setTab(popState.tab); setRevier(popState.rv);
  }, [popKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLimitsState(loadLimits(profile)); }, [profile]);
  const setLimits = useCallback((l: SeaLimits | null) => { saveLimits(profile, l); setLimitsState(l ?? SEA_PROFILE_BY_ID[profile].limits); }, [profile]);

  // --- data -----------------------------------------------------------------------------------------
  useEffect(() => {
    const ac = new AbortController();
    loadCatalog(ac.signal).then(setCatalog, () => setCatalog(null));
    loadAreas(ac.signal).then(setAreas, () => {});
    return () => ac.abort();
  }, []);
  useEffect(() => {
    let ac = new AbortController();
    let alive = true;
    const run = async () => {
      const now = Date.now();
      setNowMs(now);
      const k = await loadKillSwitch(ac.signal);
      if (!alive) return;
      setKilled(k.killed);
      // V-SW-2: the newest wind refresh — kept as its path (a string), so an unchanged pointer reloads nothing.
      const wp = windPointerOf(k.status);
      setWindPtr((prev) => (k.status == null ? prev : wp ? `${wp.run}|${wp.t1}|${wp.path}` : null));
      const r = await loadLatestRun(now, k.killed, ac.signal).catch(() => null);
      if (!alive || !r) return;
      // A refresh never replaces a good run by "nothing" — the shown run stays and ages by the freshness rules.
      setRunLoad((prev) => (r.run || !prev?.run || k.killed ? r : prev));
      const texts = await Promise.all(TEXTS.map((p) => loadText(p, now, k.killed, ac.signal).catch(() => null)));
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

  const spotHours = useMemo(() => (spot && usable ? Array.from({ length: nHours }, (_, kk) => hourOf(spot.id, kk)!) : []), [spot, usable, nHours, hourOf]);
  const spotVerdicts = useMemo(() => (spot && usable ? verdicts.row(spot) : []), [spot, usable, verdicts]);
  const wins = useMemo(() => nextAndLongest(spot && usable ? verdicts.windows(spot) : [], nowMs), [spot, usable, verdicts, nowMs]);
  const hour = spotHours[k] ?? null;
  const verdict = spot ? (spotVerdicts[k] ?? verdictAt(spot, k)) : null;

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

  // POI measurement of the spot's station.
  const stationId = spot?.station?.id ?? null;
  useEffect(() => {
    if (!stationId) { setPoi(null); return; }
    const ac = new AbortController();
    setPoi('loading');
    loadPoi(stationId, ac.signal).then(setPoi, () => {});
    return () => ac.abort();
  }, [stationId]);

  // --- URL ------------------------------------------------------------------------------------------------
  const urlState: SeaUrlState = { spot: spot?.id ?? spotId, p: profile, t, l: layer, u: unit, tab, rv: revier };
  const urlKey = JSON.stringify(urlState);
  useEffect(() => { if (!firstSpot.current) onUrlState(urlState); }, [urlKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!spot) return;
    onSpot({ ...urlState, spot: spot.id }, firstSpot.current);
    firstSpot.current = false;
  }, [spot?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickSpot = useCallback((id: string) => {
    setSpotId(id); setMobTab('map');
    // Mobile shows the new spot's briefing; the desktop dossier keeps its chapter (Allgemein = `quellen`).
    if (isMobile) setTab((tb) => (tb === 'quellen' ? 'spot' : tb));
    const s = spots.find((x) => x.id === id);
    if (s) mapRef.current?.easeTo({ center: [s.lon, s.lat], zoom: Math.max(mapRef.current.getZoom(), 7.5), duration: 600 });
  }, [spots, isMobile]);
  const pickSpotFromMap = useCallback((id: string) => { pickSpot(id); setMapCard(id); }, [pickSpot]);

  // --- lists ----------------------------------------------------------------------------------------------
  const dockSpots = useMemo(() => spots
    .filter((s) => revier === 'alle' || s.region === revier)
    .filter((s) => !query.trim() || norm(`${s.name} ${s.coast?.name ?? ''} ${s.seaArea?.name ?? ''}`).includes(norm(query.trim())))
    .map((s) => {
      const v = verdictAt(s, k);
      let win = '';
      if (usable) {
        const nw = nextAndLongest(verdicts.windows(s), nowMs).next;
        win = nw ? ` · Fenster ${dayShort(nw.from)} ${hh(nw.from)}:00` : ' · kein Fenster im Lauf';
      }
      return { id: s.id, name: s.name, sub: `${kindsLabel(s.kinds)}${win}`, cls: v.cls, reason: v.reasons[0] ?? '' };
    }),
  [spots, revier, query, verdictAt, verdicts, k, usable, nowMs]);
  const mapSpots: SeaMapSpot[] = useMemo(() => spots.filter((s) => revier === 'alle' || s.region === revier).map((s) => {
    const h = usable ? hourOf(s.id, k) : null;
    return { id: s.id, name: s.name, lon: s.lon, lat: s.lat, cls: verdictAt(s, k).cls, windTo: h?.windDir == null ? null : (h.windDir + 180) % 360, windKn: h?.windMs == null ? null : h.windMs * MS_TO_KN };
  }), [spots, revier, usable, hourOf, k, verdictAt]);
  // --- WL-4: gauge of this spot, its live forecast, and what the card is allowed to claim ----------------
  const nearestGauge = useMemo(() => (water && spot && wlCat.gauges.length ? wlNearest(wlCat.gauges, spot.lat, spot.lon) : null), [water, spot, wlCat.gauges]);
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

  const waterLevel: SeaWaterLevel | null = useMemo(() => {
    if (!water) return null;
    if (wlCat.state === 'missing' || wlCat.state === 'error') return { state: wlCat.state, gauge: null, km: null, doc: null, why: wlCat.why };
    if (wlCat.state === 'loading' || wlDoc === 'loading') return { state: 'loading', gauge, km: gaugeKm, doc: null, why: null };
    if (!gauge) return { state: 'missing', gauge: null, km: null, doc: null, why: 'Im Pegelkatalog des BSH steht kein Pegel.' };
    if (wlDoc === 'error' || !wlDoc) return { state: 'error', gauge, km: gaugeKm, doc: null, why: `Die Wasserstandsvorhersage für ${gauge.name} ist gerade nicht lesbar. Das heißt nicht, dass der Wasserstand unauffällig ist.` };
    return { state: 'ok', gauge, km: gaugeKm, doc: wlDoc, why: null };
  }, [water, wlCat, wlDoc, gauge, gaugeKm]);

  const mapGauges: SeaMapGauge[] | null = useMemo(() => (water && wlCat.gauges.length
    ? wlCat.gauges
      .filter((g) => revier === 'alle' || (revier === 'nordsee' ? g.region === 'north_sea' : g.region === 'baltic_sea'))
      .map((g) => ({ id: g.id, name: g.name, lon: g.lon, lat: g.lat }))
    : null), [water, wlCat.gauges, revier]);

  const stations = useMemo(() => (toggles.stations ? [...new Map(spots.filter((s) => s.station).map((s) => [s.station!.id, { id: s.station!.id, name: s.station!.name, lon: s.station!.lon, lat: s.station!.lat }])).values()] : null), [spots, toggles.stations]);

  const bandHours: SeaBandHour[] = spotHours.map((h, i) => ({ t: h.t, windMs: h.windMs, gustMs: h.gustMs, windDir: h.windDir, hs: h.hs, dir: h.dir, tm: h.tm, dry: h.dry, cls: spotVerdicts[i].cls, reason: spotVerdicts[i].reasons.join(' · '), daylight: spotVerdicts[i].daylight }));
  const chartHours = spotHours.map((h, i) => ({ t: h.t, windMs: h.windMs, gustMs: h.gustMs, hs: h.hs, ws: h.ws, sw: h.sw, dry: h.dry, daylight: spotVerdicts[i].daylight }));
  const dryHours = spotHours.reduce((a, h) => a + (h.dry ? 1 : 0), 0);
  const waveShort = (h: SeaReadoutHour) => (h.dry ? DRY_VALUE : `Welle ${f1(h.hs, ' m')}`);
  const lim = limits.gustMax ?? limits.windMax;
  const profLabel = SEA_PROFILE_BY_ID[profile].label;
  const windEngine = spotsDoc?.wind?.engine ?? 'buscosun Fusion';
  const runTxt = run ? `CWAM ${run.run.slice(8, 10)} UTC` : '–';
  const liveTone = !runLoad ? 'loading' : noData ? 'none' : freshness === 'stale' ? 'stale' : 'live';
  const callout = spot && !noData ? { lon: spot.lon, lat: spot.lat, name: spot.name, line: hour ? `${fmtWind(hour.windMs, unit)} ${unitLabel(unit)} · ${waveShort(hour)} · ${CLASS_SHORT[verdict?.cls ?? 'keine']}` : CLASS_SHORT[verdict?.cls ?? 'keine'], color: verdict && verdict.cls !== 'keine' ? CLASS_COLOR[verdict.cls] : null } : null;
  // Desktop: the hourly band lives in the dossier now, so the map foot is free (was 250 px for the band).
  const padding = isMobile ? { top: 130, bottom: 440, left: 24, right: 24 } : { top: 110, bottom: 40, left: 40, right: 230 };
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
  const pillBadge = spot ? (spot.region === 'nordsee' ? 'NORDSEE' : 'OSTSEE') : '';
  const pill = spot && (
    <div className="sw-pill">
      <span className="sw-badge">{pillBadge}</span>
      <span className="sw-pill-body"><span className="sw-pill-title">{spot.name}</span><span className="sw-pill-sub">{spot.seaArea?.name ?? spot.coast?.name ?? ''} · {kindsLabel(spot.kinds)}</span></span>
    </div>
  );
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
  const map = (
    <SeaMap field={coloured} arrows={arrows} spots={noData ? mapSpots.map((s) => ({ ...s, cls: 'keine' as const, windTo: null })) : mapSpots} selectedId={spot?.id ?? null}
      stations={stations} gauges={mapGauges} selectedGaugeId={gaugeId} onGauge={setGaugePick} areas={mapAreas} showWind={toggles.wind && !noData} padding={padding} onSelect={pickSpotFromMap} onMap={(m) => { mapRef.current = m; }} callout={callout} />
  );
  const band = spot && usable && bandHours.length > 0 && (
    <SeaBand hours={bandHours} unit={unit} selected={k} onPick={setT} compact={isMobile}
      title={`${spot.name} · ${profLabel}`} sub={`${dayShort(bandHours[0].t)} ${hh(bandHours[0].t)} bis ${dayShort(bandHours[bandHours.length - 1].t)} ${hh(bandHours[bandHours.length - 1].t)} Uhr · ${tzLabel(validMs)}`}
      footnote={`Welle: Modell ${runTxt} · Wind/Böen: ${windEngine}`} />
  );
  const dockOf = (show: 'all' | 'layers' | 'picker') => (
    <SeaDock show={show} query={query} onQuery={setQuery} revier={revier} onRevier={setRevier} profile={profile} onProfile={setProfile} limits={limits} onLimits={setLimits}
      spots={dockSpots} selectedId={spot?.id ?? null} onPick={pickSpot} total={spots.length} layer={layer} onLayer={setLayer}
      toggles={toggles} onToggle={(kk) => setToggles((x) => ({ ...x, [kk]: !x[kk] }))} loading={catalog === 'loading'} />
  );
  const readout = (
    <SeaReadout tab={tab} onTab={setTab} spot={spot} hour={hour} verdict={verdict} profileLabel={profLabel} windows={wins} chartHours={chartHours}
      limitKn={lim} limitLabel={limits.gustMax != null ? `Böen ${limits.gustMax} kn` : limits.windMax != null ? `Wind ${limits.windMax} kn` : ''} unit={unit}
      run={run} spotsDoc={spotsDoc} freshness={freshness} texts={seaTexts} poi={poi} nowMs={nowMs} noData={noData} warning={warning}
      dry={{ hours: dryHours, of: spotHours.length, classed: dryRule }} waterLevel={waterLevel}
      layout={isMobile ? 'aside' : 'dossier'} band={isMobile ? undefined : band} chips={isMobile ? undefined : (usable && chips)} onMap={isMobile ? undefined : () => setStage('map')} />
  );
  const inDossier = stage === 'dossier';
  // The compact preview of the map-picked spot — the same numbers as the briefing and the callout.
  const cardEl = mapCard && spot && spot.id === mapCard && !inDossier ? (
    <SeaMapCard badge={pillBadge} name={spot.name} sub={`${spot.seaArea?.name ?? spot.coast?.name ?? ''} · ${kindsLabel(spot.kinds)} · Profil ${profLabel}`}
      verdict={noData ? 'keine Daten' : CLASS_LABEL[verdict?.cls ?? 'keine']} color={!noData && verdict && verdict.cls !== 'keine' ? CLASS_COLOR[verdict.cls] : null}
      stats={!hour || noData ? [] : [
        { l: 'Wind', v: `${fmtWind(hour.windMs, unit)} ${unitLabel(unit)}`, s: `aus ${compass16(hour.windDir)}` },
        { l: 'Böen', v: `${fmtWind(hour.gustMs, unit)} ${unitLabel(unit)}` },
        { l: 'Welle', v: hour.dry ? DRY_VALUE : f1(hour.hs, ' m'), s: !hour.dry && hour.tm != null ? `${f1(hour.tm)} s` : undefined },
      ]}
      reason={!noData && verdict && verdict.cls !== 'passt' ? verdict.reasons[0] ?? null : null}
      window={noData || !usable || !wins.next ? null : `Nächstes Fenster ${dayShort(wins.next.from)} ${hh(wins.next.from)}–${hh(wins.next.to)} Uhr`}
      official={null}
      onOpenDossier={() => { setMapCard(null); if (!isMobile) setStage('dossier'); }}
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
    return (
      <div className="sw-root is-mobile">
        <main className="sw-map is-mobile" aria-label="Karte">
          {map}
          <div className="sw-m-top">
            <button type="button" className="sw-m-brand" aria-label="Zur Startseite" onClick={nav.goHome}><img src="/buscosun-mark.svg" width={22} height={22} alt="" /></button>
            <button type="button" className="sw-pill is-button" aria-haspopup="dialog" aria-expanded={mobTab === 'spot'} onClick={() => setMobTab('spot')}>
              <span className="sw-badge">{pillBadge}</span>
              <span className="sw-pill-body"><span className="sw-pill-title">{spot?.name ?? 'Spot wählen'}</span><span className="sw-pill-sub">{spot?.seaArea?.name ?? spot?.coast?.name ?? ''} · Profil {profLabel}</span></span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <ShareButton className="sw-m-share" compact />
          </div>
          <div className="sw-m-times">{chips}</div>
          <div className="sw-m-legend"><div className="sw-legend-ramp" style={{ background: cssGradient(layer === 'per' ? PER_STOPS : HS_STOPS) }} /><div className="sw-legend-ticks"><span>0</span><span>{layer === 'per' ? '6' : '3'}</span><span>{layer === 'per' ? '12 s' : '6 m'}</span></div></div>
          {emptyMap}{catFail}
          {cardEl && <div className="sw-map-card">{cardEl}</div>}
        </main>
        {mobTab !== 'map' && (
          <div className="sw-m-dock" role="dialog" aria-label={mobTab === 'spot' ? 'Spot und Profil wählen' : 'Ebenen'}>
            <div className="sw-m-dock-head"><strong>{mobTab === 'spot' ? 'Spot und Profil' : 'Ebenen'}</strong></div>
            {dockOf(mobTab === 'spot' ? 'picker' : 'layers')}
          </div>
        )}
        <nav className="sw-bar" aria-label="Seewetter-Bereiche">
          {([
            ['map', 'Karte', <path key="p" d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 7 9 4zM9 4v13M15 7v12.5" />],
            ['spot', 'Spot', <g key="p"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></g>],
            ['layers', 'Ebenen', <path key="p" d="m12 3 9 4.5-9 4.5-9-4.5L12 3zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5" />],
          ] as const).map(([id, label, icon]) => (
            <button key={id} type="button" className={`sw-bar-btn${mobTab === id ? ' is-active' : ''}`} aria-current={mobTab === id ? 'page' : undefined} onClick={() => setMobTab(id)}>
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
      <FeatureRail active={'sea' as RailFeature} onOpenFeature={(id) => nav.openFeature(id)} onHome={nav.goHome}
        navClass="sw-rail" btnClass="sw-rail-btn" activeClass="is-active" spacerClass="sw-rail-spacer" />
      <div className="sw-deck">
        <header className="sw-topbar">
          <a className="sw-brand" href="/" onClick={(e) => { e.preventDefault(); nav.goHome(); }} aria-label="Zur Startseite">
            <img src="/buscosun-mark.svg" width={22} height={22} alt="" /><span>buscosun</span>
          </a>
          <span className="sw-topdiv" aria-hidden="true" />
          <span className="sw-topbar-sub">Seewetter Nord- und Ostsee{inDossier && spot ? ` · ${spot.name}` : ''}</span>
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
        <div className="sw-body">
          {dockOf('layers')}
          <main className={`sw-map${inDossier ? ' is-offstage' : ''}`} aria-label="Karte" aria-hidden={inDossier ? true : undefined}>
            {map}
            <div className="sw-ov-left">
              {pill}{usable && chips}
              {spot && <button type="button" className="sw-ds-open" onClick={() => setStage('dossier')}>Spot-Dossier öffnen <span aria-hidden="true">→</span></button>}
            </div>
            <div className="sw-ov-right">{legend}</div>
            {emptyMap}{catFail}
            {cardEl && <div className="sw-map-card">{cardEl}</div>}
          </main>
          {inDossier && (
            <main className="sw-ds-main" aria-label="Spot-Dossier">
              <div className="sw-ds-scroll">{readout}</div>
            </main>
          )}
          <aside className="sw-readout is-picker" aria-label="Spots und Profil">{dockOf('picker')}</aside>
        </div>
      </div>
    </div>
  );
}

