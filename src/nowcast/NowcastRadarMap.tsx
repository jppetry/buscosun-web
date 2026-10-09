/**
 * Regenradar — High-End-Radar-Block (in die „Regenradar"-Seite integriert).
 *
 * Früher eine simple RainLayer-Karte mit Scrubber; jetzt das volle Radar nach
 * `docs/high-end-radar-feature-catalogue.md`, eingebettet in die bestehende
 * nc-/rt-Designsprache:
 *   - GPU-Niederschlagsraster (RadarMap) mit gebänderten + farbsicheren Paletten,
 *     Basemap-Umschaltung, Deckkraft, Frame-Morphing
 *   - Zeitachse mit ehrlichem Messung↔Vorhersage-Bruch (RadarTimeline)
 *   - Layer-Presets (Standard/Gewitter/Winter/Wandern) + Einzel-Layer
 *   - Zellbahnen: DWD KONRAD3D — DIESELBEN Layer wie die Wetterkarte (RL1,
 *     `audit/regenradar-layer-angleich.md`); Niederschlag als DACH-Komposit,
 *     Schnee als ICON-D2 Schneedecke/Neuschnee — ebenfalls 1:1 die Wetterkarte
 *   - Blitze (DWD-WMS), Akkumulation, Coverage/Qualität
 *   - Punkt-Streifen „Regen in X min" am angetippten Punkt + Datenqualität
 *
 * Datenquellen: ausschließlich bestehende Plattform (RADOLAN-RV/INCA/rzc →
 * ICON-D2-Punktforecast; Warnungen/Blitze aus den DWD-Quellen).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ProfileRadarPick } from '../MapView';
import type maplibregl from 'maplibre-gl';
import type { Location } from '../types';
import { reverseGeocode } from '../geocode';
import { buildNowcast } from './nowcastEngine';
import type { Nowcast } from './nowcastModel';

import RadarMap from '../radar/RadarMap';
import RadarTimeline from '../radar/RadarTimeline';
import PointStrip, { stripSamples, frameIntensities } from '../radar/PointStrip';
import { getRadarStack, seedDePastArchive, DE_PAST_SEED_FRAMES, type RadarStack } from '../radar/radarFrames';
import { pointPoPSeries } from '../radar/pointPoP';
import { computeRainWindow, rainWindowEnabledFrom } from './rainWindow';
import { radarTimesAt } from './rainWindowRadar';
import { convectiveIndex, type ConvectiveIndex } from '../radar/convectiveIndex';
import { fetchPeakCapeAtPoint } from '../sources/iconD2Cape';
import { fetchDwdAlerts } from '../sources/dwdAlerts';
import { fetchKonrad3d } from '../sources/dwdKonrad3d';
import type { Konrad3dRun } from '../radar/konrad3d';
import { buildCellFeatures, cellLocationRelevance, cellRelevanceText } from '../radar/cellPolygons';
import { CELLS_POLL_MS, CELLS_DOT_LAYER_ID } from '../radar/cellLayers';
// Phase ZO (audit/zell-orte.md): betroffene Orte je Zelle — Satz der Leiste und Haltestellen der gewählten Zelle.
import { cellPlacesEnabledFrom, cellPlaceVerdict, cellPlaceSentence, type CellPass } from '../radar/cellPlaces';
import { CellPlaceStops } from './cellPlaceStops';
import { fetchIconD2Snow, type IconD2Snow, type SnowMode } from '../sources/iconD2Snow';
import type { CompositeSources } from '../scalar/precipComposite';
import { fetchRvNowcast } from '../sources/radolan';
import { fetchIncaGrid } from '../sources/geosphereIncaGrid';
import { fetchRzcLatest } from '../sources/meteoSwissRadar';
import { accumulate, ACCUM_WINDOWS } from '../radar/accumulation';
import { buildEdgeFalloffMask, coverageNote, sourceAgeBadge } from '../radar/coverageMask';
import {
  RADAR_BANDS, PALETTES, PALETTE_ORDER,
  type PaletteId, type RadarLayerId,
} from '../radar/radarModel';
import { saveLastView, loadLastView, type Basemap } from '../radar/radarState';
import { buildTerrain, snowLineGeoJSON, quadBBox, type RadarTerrain } from '../radar/precipPhase';
import { loadElevationLookup } from '../fusion/elevation';
// Phase RR (audit/regenradar-datenangleich.md §4 RR-d): die Karte ist die der Wetterkarte (`MapView`, eigener
// Lazy-Chunk über denselben Loader wie die Kartenrouten) mit dem Niederschlags-Profil; die alte Radarkarte bleibt
// hinter `?rr=legacy` (und als Rückfall, falls der Chunk nicht lädt).
import { loadMapView, loadedMapView } from '../router/mapViewLoader';
import { radarMapLegacyFrom, radarProfileLayers } from '../map/mapProfile';
import { sampleRadarPoint } from '../pointForecast/radarSample';
import { RADAR_VMAX } from '../radar/radarModel';
import type { RvPastFrame } from '../scalar/precipComposite';
import type { RadarFrame as RzcFrame } from '../sources/meteoSwissRadar';
import { nwpLabel } from './nowcastView';
// Phase NS (audit/niederschlagssummen.md §9): Summen-Ansicht der Karte — eigene MapLibre-Ebenen, kein Shader.
import { useSumMap } from '../precipSums/useSumMap';
import { SumLegend } from '../precipSums/PrecipSumsUi';
import type { SumSelection } from '../precipSums/sumModel';
// Phase RC (audit/regenchance.md): Ansicht „Chance" — eigene MapLibre-Ebenen (fill-pattern, line, symbol), kein Shader.
import { useChanceMap } from '../precipChance/useChanceMap';
import { ChanceLegend } from '../precipChance/PrecipChanceUi';
import type { ChanceThreshold } from '../precipChance/chanceModel';
// Phase SK (`?sk=1`, audit/schneefallgrenze-flaeche.md): snowfall line of buscosun Fusion as a surface on the terrain.
import { useSnowCap } from '../snowCap/useSnowCap';
import { SK_PALETTE_2D, SK_PALETTE_3D } from '../snowCap/snowCapModel';
import { SnowCapLegend, snowTapHtml } from '../snowCap/SnowCapUi';

type MapViewComponent = typeof import('../MapView').default;
import {
  LayerIcon, IconSliders, IconChevron, IconStormCloud, IconBolt,
  IconRadarSignal, IconPalette, IconMap, IconContrast, IconClock,
} from '../radar/radarIcons';
import '../radar/radar.css';
import '../ml/ml.css';

interface Props {
  location: Location;
  /** Punktforecast der Seite für den Heimat-Punkt (Phase/Schneefallgrenze/Höhe). */
  nowcast: Nowcast | null;
  /** Erhöht sich beim ↻-Reload der Seite → erzwingt einen stillen Soft-Refresh
   *  des Radar-Stacks (neuer DWD-Lauf, ohne die Karte zu leeren). */
  reloadKey?: number;
  /** Command-Deck: aktive Radar-Layer von außen steuern (Dock-Toggles). Wenn
   *  gesetzt, ist die Layer-Auswahl controlled — sonst bleibt sie intern. */
  layers?: RadarLayerId[];
  onLayersChange?: (layers: RadarLayerId[]) => void;
  /** Interne „Ebenen"-Leiste ausblenden — im Deck stellt das linke Dock die
   *  Layer-Toggles, die Leiste über der Karte wäre doppelt. */
  hideLayerbar?: boolean;
  /** Command-Deck: Zeitachse (Scrubber) + Punkt-Streifen + Datenqualität in ein
   *  eingeklapptes Akkordeon falten, damit die Karte die Bühne dominiert. Der
   *  Play-Button lebt dann im schwebenden Deck (via playing/onPlayingChange). */
  compact?: boolean;
  /** Radar-Animation von außen steuern (Deck-Play-Button). Controlled, wenn gesetzt. */
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** MapLibre-Instanz nach außen reichen (Mobile-Zoom-Buttons im Deck). Additiv. */
  onMapReady?: (m: maplibregl.Map | null) => void;
  /** Router (RT1): Startkamera aus der Query + Kamera-Meldung nach `moveend`. Additiv. */
  initialView?: { lat: number; lon: number; zoom: number } | null;
  onViewChange?: (v: { lat: number; lon: number; zoom: number }) => void;
  /** RL1: Schnee-Modus des ICON-D2-Layers (Deck-Umschalter). Default Schneedecke. */
  snowMode?: SnowMode;
  /** Phase NS: Darstellung Intensität | Summe (Dock). Fehlt = Stand vor Phase NS (`?sum=0`). */
  sum?: SumSelection;
  /** Phase RB (an, `?rb=0` aus): der Radar-Stack nach oben (Deck rechnet das Fenster am Ort); `null` = Radar nicht erreichbar. */
  onRadarStack?: (stack: RadarStack | null) => void;
  /**
   * Phase RC (`?rc=1`): Ansicht „Chance" mit Schwelle; `pickMs` = in der 48-h-Leiste gewählte Zeit (sonst folgt die Karte
   * dem Slider). Fehlt = Stand vor Phase RC.
   */
  chance?: { threshold: ChanceThreshold; pickMs: number | null };
  /** Phase RC: Zeit des sichtbaren Frames nach oben (Marke in der Leiste am Ort). */
  onTimeChange?: (ms: number) => void;
  /** Phase RC: der Nutzer hat die Zeit selbst bewegt (Slider, Schritt, Abspielen, „jetzt") — die Wahl aus der Leiste endet. */
  onUserTime?: () => void;
  /** Phase ZO (an, `?zo=0` aus): der KONRAD3D-Lauf nach oben (Readout rechnet die Orte); `null` = Zell-Layer aus. */
  onCellsRun?: (run: Konrad3dRun | null) => void;
  /** Phase ZO: Haltestellen der gewählten Zelle auf der Karte. Fehlt = keine Marker. */
  cellStops?: { rows: readonly CellPass[]; nowMs: number } | null;
  /** Phase ZO: Klick auf einen Zell-Schwerpunkt wählt die Zelle im Readout (der Steckbrief-Popup bleibt). */
  onCellPick?: (id: number) => void;
  /** Phase HZS (`?hzs=1`, audit/hoehen-zeit-schnitt.md): der gewählte Punkt nach oben (Höhen-Zeit-Schnitt am gewählten Ort). Fehlt = Stand vorher. */
  onPointChange?: (p: { lat: number; lon: number; name: string; country: 'DE' | 'AT' | 'CH' }) => void;
  /** Phase ZT (on, `?z3d=0` off; audit/zelltuerme-3d.md): 3D stage next to the map (`split`) or instead of it (`3d`; the map stays
   *  mounted and suspended — time, data and camera live there). Missing = exactly as before. */
  stageAside?: ReactNode;
  stage3d?: 'split' | '3d';
  /** Phase ZT: HD frames of the shown time from `MapView` (radar picture on the relief). */
  onProfileRadarPick?: (pick: ProfileRadarPick) => void;
  /** Phase SK (`?sk=1`): snow cap instead of the ICON-D2 line; `pickMs` = hour chosen in the place bar (else the slider);
   *  `stageMap` = ZT's 3D map (second instance); `mapHidden` = the 2D map rests behind the "3D"-only view (no cap build).
   *  Missing = exactly as before. */
  snowCap?: { pickMs: number | null; stageMap: maplibregl.Map | null; mapHidden?: boolean };
}

const LAYER_META: Record<RadarLayerId, { label: string }> = {
  precip:    { label: 'Niederschlag' },
  rain:      { label: 'Regen' },
  snow:      { label: 'Schnee (ICON-D2)' },
  graupel:   { label: 'Graupel' },
  hail:      { label: 'Hagel' },
  accum:     { label: 'Summe' },
  cells:     { label: 'Zellbahnen (KONRAD3D)' },
  lightning: { label: 'Blitze' },
  warnings:  { label: 'Warnungen' },
  coverage:  { label: 'Radarsicht' },
  snowline:  { label: 'Schneefallgrenze' },
  wind:      { label: 'Wind' },
};
/**
 * V-22 (2026-08-03): `warnings` ist hier ENTFERNT. Der Schalter existierte, aber
 * `radar/RadarMap.tsx` kennt die Ebene überhaupt nicht (null Referenzen) — es
 * wurden nie Warnpolygone gezeichnet. DWD-Warnungen werden zwar geholt, aber nur
 * zu einem Skalar `warnLevel` reduziert. Ein Schalter, der nichts tut, beschädigt
 * das Vertrauen mehr als ein fehlendes Feature — bei Warnungen besonders.
 *
 * Formal ist das ein Funktions-Entzug (Oberste Direktive), deshalb mit Jans
 * ausdrücklicher Freigabe vom 2026-08-03 entfernt. `LAYER_META.warnings` bleibt
 * absichtlich stehen: sobald V-24 (GeoSphere/DWD-CAP mit Geometrien) echte
 * Polygone liefert, genügt es, die Kennung hier wieder einzureihen.
 */
const LAYER_ORDER: RadarLayerId[] = ['precip', 'rain', 'snow', 'graupel', 'hail', 'snowline', 'accum', 'cells', 'lightning', 'coverage'];
/** Phasen, die rein heuristisch sind (kein Mess-Produkt) → Kennzeichnung. */
const HEURISTIC_PHASES = new Set<RadarLayerId>(['graupel', 'hail']);

type PointInfo = { lat: number; lon: number; name: string; country: 'DE' | 'AT' | 'CH' };

export default function NowcastRadarMap({ location, nowcast, reloadKey = 0, layers: controlledLayers, onLayersChange, hideLayerbar = false, compact = false, playing: controlledPlaying, onPlayingChange, onMapReady, initialView, onViewChange, snowMode = 'depth', sum, onRadarStack, chance, onTimeChange, onUserTime, onCellsRun, cellStops, onCellPick, onPointChange, snowCap, stageAside, stage3d, onProfileRadarPick }: Props) {
  const last = useMemo(() => loadLastView(), []);
  // Phase RR: welche Karte? Voreinstellung = Wetterkarte (`MapView`, Profil `radar`); `?rr=legacy` = die alte eigene.
  const legacyMap = useMemo(() => radarMapLegacyFrom(typeof window !== 'undefined' ? window.location.search : ''), []);
  const [MapViewC, setMapViewC] = useState<MapViewComponent | null>(() => (legacyMap ? null : loadedMapView()?.default ?? null));
  const [mapViewFailed, setMapViewFailed] = useState<string | null>(null);
  const useProfile = !legacyMap && mapViewFailed == null;
  useEffect(() => {
    console.log(`[buscosun] Regenradar-Karte → ${legacyMap ? 'eigene Radarkarte (?rr=legacy)' : 'Karte der Wetterkarte (MapView, Profil radar)'}`);
  }, [legacyMap]);
  useEffect(() => {
    if (legacyMap || MapViewC) return;
    let alive = true;
    loadMapView().then((m) => { if (alive) setMapViewC(() => m.default); }).catch((err: unknown) => {
      if (!alive) return;
      const why = err instanceof Error ? err.message : String(err);
      console.warn(`[buscosun] Regenradar: Karte der Wetterkarte nicht ladbar (${why}) — Rückfall auf die eigene Radarkarte`);
      setMapViewFailed(why);
    });
    return () => { alive = false; };
  }, [legacyMap, MapViewC]);
  const [layersUnc, setLayersUnc] = useState<RadarLayerId[]>((last?.layers as RadarLayerId[]) ?? ['precip']);
  // Controlled/uncontrolled-Hybrid: steuert das Dock die Layer, gewinnt dessen
  // Auswahl; sonst der interne Zustand. Beide teilen dieselbe Persistenz.
  const layers = controlledLayers ?? layersUnc;
  const applyLayers = useCallback((next: RadarLayerId[]) => {
    if (onLayersChange) onLayersChange(next); else setLayersUnc(next);
  }, [onLayersChange]);
  const [palette, setPalette] = useState<PaletteId>(last?.palette ?? 'classic');
  const [basemap, setBasemap] = useState<Basemap>(last?.basemap ?? 'streets');
  const [opacity, setOpacity] = useState<number>(last?.opacity ?? 0.85);
  const [showLayers, setShowLayers] = useState(false);
  const [expertDbz, setExpertDbz] = useState(false);
  const [accumIdx, setAccumIdx] = useState(1);

  const [stack, setStack] = useState<RadarStack | null>(null);
  const onRadarStackRef = useRef(onRadarStack);
  onRadarStackRef.current = onRadarStack;
  const [terrain, setTerrain] = useState<RadarTerrain | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [framePos, setFramePos] = useState(0);
  // Play-Zustand controlled/uncontrolled-Hybrid: steuert das Deck den Play-Button,
  // gewinnt dessen Zustand; sonst der interne. Die rAF-Animationsschleife lebt
  // hier (braucht `stack`), liest aber `playing` und meldet Stopp via applyPlaying.
  const [playingUnc, setPlayingUnc] = useState(false);
  const playing = controlledPlaying ?? playingUnc;
  // Rückblick-Archiv auf Abruf (BW-5/Q7): der Lade-Effekt hinterlegt hier die
  // Nachlade-Funktion, die Bedienelemente rufen sie beim ersten Griff in die
  // Vergangenheit. Bewusst ein Ref und keine Dependency — der Auslöser darf
  // die Abspielschleife nicht neu aufsetzen.
  const requestPastSeedRef = useRef<(() => void) | null>(null);
  // Phase RC: Meldung „der Nutzer bewegt die Zeit" — als Ref, damit die Callbacks stabil bleiben.
  const onUserTimeRef = useRef(onUserTime);
  onUserTimeRef.current = onUserTime;
  const applyPlaying = useCallback((next: boolean) => {
    if (next) onUserTimeRef.current?.();
    if (next) requestPastSeedRef.current?.();
    if (onPlayingChange) onPlayingChange(next); else setPlayingUnc(next);
  }, [onPlayingChange]);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);

  const [point, setPoint] = useState<PointInfo>({ lat: location.lat, lon: location.lon, name: location.name, country: location.country });
  const [pointNowcast, setPointNowcast] = useState<Nowcast | null>(nowcast);
  // Phase HZS: den gewählten Punkt melden (nur mit Abnehmer).
  const onPointChangeRef = useRef(onPointChange);
  onPointChangeRef.current = onPointChange;
  const hasPointCb = !!onPointChange;
  useEffect(() => { onPointChangeRef.current?.(point); }, [point, hasPointCb]);
  // Gewittergefahr-Zutaten (DE): CAPE-Spitze + DWD-Gewitterwarnstufe am Punkt.
  const [capePeak, setCapePeak] = useState<number | null>(null);
  const [warnLevel, setWarnLevel] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Phase NS: die Karte als Zustand, damit die Summen-Ebene an ihr hängen kann.
  const [mapInst, setMapInst] = useState<maplibregl.Map | null>(null);
  const layerSet = useMemo(() => new Set(layers), [layers]);
  // Phase RC: alte Karte (`?rr=legacy`) in „Chance" ohne gefüllte Radarfläche.
  const layerSetNoPrecip = useMemo(() => new Set(layers.filter((l) => l !== 'precip')), [layers]);
  // RL1: Nachbarquellen des DACH-Komposits, KONRAD3D-Lauf, ICON-D2-Schnee.
  const [neighbors, setNeighbors] = useState<CompositeSources | null>(null);
  const [cellsRun, setCellsRun] = useState<Konrad3dRun | null>(null);
  const [snowData, setSnowData] = useState<IconD2Snow | null>(null);
  // Phase ZO: Lauf nach oben, Zellwahl per Klick, Haltestellen — alles nur mit gesetzten Props.
  const zoOn = useMemo(() => cellPlacesEnabledFrom(typeof window !== 'undefined' ? window.location.search : ''), []);
  const onCellsRunRef = useRef(onCellsRun);
  onCellsRunRef.current = onCellsRun;
  useEffect(() => { onCellsRunRef.current?.(cellsRun); }, [cellsRun]);
  const onCellPickRef = useRef(onCellPick);
  onCellPickRef.current = onCellPick;
  const hasCellPick = onCellPick != null;
  useEffect(() => {
    if (!mapInst || !hasCellPick) return;
    const map = mapInst;
    const onClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const id = Number(e.features?.[0]?.properties?.id);
      if (Number.isFinite(id)) onCellPickRef.current?.(id);
    };
    map.on('click', CELLS_DOT_LAYER_ID, onClick);
    return () => { try { map.off('click', CELLS_DOT_LAYER_ID, onClick); } catch { /* Karte schon abgebaut */ } };
  }, [mapInst, hasCellPick]);
  const stopsRef = useRef<CellPlaceStops | null>(null);
  useEffect(() => {
    const stops = (stopsRef.current ??= new CellPlaceStops());
    stops.set(mapInst, cellStops?.rows ?? [], cellStops?.nowMs ?? Date.now());
  }, [mapInst, cellStops]);
  useEffect(() => () => { stopsRef.current?.clear(); }, []);

  // Punkt zurücksetzen, wenn die Seite den Ort wechselt.
  useEffect(() => {
    setPoint({ lat: location.lat, lon: location.lon, name: location.name, country: location.country });
    setPointNowcast(nowcast);
  }, [location.lat, location.lon, location.country]);
  // Heimat-Punktforecast der Seite übernehmen, sobald er nachlädt.
  useEffect(() => {
    if (point.lat === location.lat && point.lon === location.lon) setPointNowcast(nowcast);
  }, [nowcast]);

  // framePos in einem Ref spiegeln, damit das Hintergrund-Nachladen den sichtbaren
  // Zeitpunkt erhalten kann, ohne als Effekt-Dependency neu zu triggern.
  const framePosRef = useRef(0);
  useEffect(() => { framePosRef.current = framePos; }, [framePos]);
  // Aktuellen Stack spiegeln, damit der Lade-Effekt beim Soft-Refresh den
  // sichtbaren Zeitpunkt lesen kann, ohne `stack` als Dependency zu führen.
  const stackRef = useRef<RadarStack | null>(null);
  useEffect(() => { stackRef.current = stack; }, [stack]);
  // Vorigen Ort merken, um Ortswechsel (Karte leeren) vom Soft-Refresh zu trennen.
  const prevLocRef = useRef('');
  // Welche Location bereits ERFOLGREICH ihr DE-Rückblick-Archiv geladen hat.
  // Bewusst getrennt von prevLocRef: StrictMode mountet den Effekt doppelt; würde
  // der Seed an isLocChange/prevLocRef hängen, überspränge ihn der 2. Mount
  // (prevLocRef bereits gesetzt) und der 1. Seed wird per Abort verworfen → nie
  // Vergangenheit. Wird erst NACH Seed-Erfolg gesetzt.
  const seededLocRef = useRef('');

  // Periodischer Auto-Refresh (alle 5 min, nur bei sichtbarem Tab) — RADOLAN-RV
  // läuft alle 5 min, also hält dieser Tick das Radarbild aktuell, statt seit dem
  // Öffnen einzufrieren (das Bild hing sonst beliebig lange hinterher).
  const [autoTick, setAutoTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') setAutoTick((t) => t + 1);
    }, 5 * 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Phase NS: Summen-Ansicht. In „Summe" zeigt die Karte statt der Intensität die Summe (eigene Ebenen); die übrigen
  // Ebenen (Zellbahnen, Blitze, Schnee …) bleiben, wie sie sind.
  const sumMode = sum?.mode === 'sum';
  // Phase RC: in „Chance" ruht die Intensitäts-Ebene wie in „Summe"; die Karte zeigt die Chance von buscosun Fusion.
  const chanceMode = sum?.mode === 'chance' && !!chance;
  const sumMap = useSumMap(mapInst, sum ?? { mode: 'intensity', dir: 'past', windowH: 6 }, !!sum, reloadKey * 1000 + autoTick);

  // Radar-Stack laden + AKTUELL HALTEN:
  //  · Ortswechsel       → Karte leeren + Spinner, frischer Stack (+ DE-Rückblick).
  //  · ↻ / 5-min-Tick    → STILLER Soft-Refresh: neuer Lauf im Hintergrund, KEIN
  //    Blank; der sichtbare Validitäts-Zeitpunkt bleibt erhalten (wer am „jetzt"
  //    stand, springt auf den neuen jüngsten Frame). So hängt das Bild nie nach.
  useEffect(() => {
    const locKey = `${location.lat},${location.lon},${location.country}`;
    const isLocChange = prevLocRef.current !== locKey;
    prevLocRef.current = locKey;
    const ac = new AbortController();
    requestPastSeedRef.current = null;   // Closure des vorigen Laufs fallen lassen
    if (isLocChange) { setStack(null); setTerrain(null); setLoadErr(null); }

    // Sichtbaren Zeitpunkt + „war am jetzt?" aus dem ALTEN Stack lesen (für Remap).
    const prev = stackRef.current;
    const idxOf = (st: RadarStack) => Math.max(0, Math.min(st.frames.length - 1, Math.round(framePosRef.current)));
    const prevShownMs = (!isLocChange && prev) ? prev.frames[idxOf(prev)]?.timeMs : undefined;
    const wasAtNow = !isLocChange && prev ? Math.round(framePosRef.current) === prev.nowIndex : false;
    const repin = (st: RadarStack) => {
      if (isLocChange || wasAtNow || prevShownMs == null) { setFramePos(st.nowIndex); return; }
      let best = st.nowIndex, bestD = Infinity;
      st.frames.forEach((f, k) => { const d = Math.abs(f.timeMs - prevShownMs); if (d < bestD) { bestD = d; best = k; } });
      setFramePos(best);
    };

    getRadarStack(location.country, ac.signal)
      .then((st) => {
        if (ac.signal.aborted) return;
        setStack(st); setLoadErr(null); repin(st);
        onRadarStackRef.current?.(st);
        // DE-Rückblick-Archiv einmal je Location nachladen (schwer): acht
        // zusätzliche RV-Tars, gemessen 2,28 MiB und 27 s (audit/bandbreite.md
        // §24.3). Seit BW-5 NICHT mehr beim Öffnen, sondern beim ersten Griff in
        // die Vergangenheit — Abspielen, Rückwärts-Schritt, Scrubben an den
        // Anfang. Bewusste Verhaltensänderung (Jans Entscheidung): der Rückblick
        // hat beim ersten Mal eine kurze Ladezeit. Unabhängig davon wächst der
        // Session-Past-Cache mit jedem 5-Minuten-Refresh weiter.
        if (location.country !== 'DE') return;
        // `started` lebt je Effektlauf; StrictMode-Mount 2 überschreibt die
        // Closure und bringt sein eigenes mit. `seededLocRef` wird weiterhin erst
        // NACH Erfolg gesetzt (s. Ref-Kommentar), ein Fehlschlag bleibt wiederholbar.
        let started = false;
        requestPastSeedRef.current = () => {
          if (started || seededLocRef.current === locKey || ac.signal.aborted) return;
          started = true;
          void seedDePastArchive(DE_PAST_SEED_FRAMES, ac.signal).then((added) => {
            if (!added || ac.signal.aborted) { started = false; return; }
            seededLocRef.current = locKey;   // erst NACH Erfolg markieren
            const shownMs = st.frames[idxOf(st)]?.timeMs;
            getRadarStack('DE', ac.signal).then((st2) => {
              if (ac.signal.aborted) return;
              setStack(st2);
              if (shownMs == null) return;
              // sichtbaren Zeitpunkt auf den nächstgelegenen Frame des neuen Stacks remappen
              let best = st2.nowIndex, bestD = Infinity;
              st2.frames.forEach((f, k) => { const d = Math.abs(f.timeMs - shownMs); if (d < bestD) { bestD = d; best = k; } });
              setFramePos(best);
            }).catch(() => { /* Reload best-effort */ });
          });
        };
      })
      // Fehler-Overlay nur beim Ortswechsel zeigen; ein fehlgeschlagener
      // Soft-Refresh behält still das bisherige Bild.
      .catch((err) => {
        if (!ac.signal.aborted && isLocChange) { setLoadErr(err instanceof Error ? err.message : 'Radar nicht erreichbar'); onRadarStackRef.current?.(null); }
      });
    return () => ac.abort();
  }, [location.lat, location.lon, location.country, reloadKey, autoTick]);

  // Punktforecast für angetippte Punkte (≠ Heimat) nachladen.
  useEffect(() => {
    if (point.lat === location.lat && point.lon === location.lon) return;
    const ac = new AbortController();
    // Phase RR: die Nachlieferung von buscosun Fusion ersetzt die erste Antwort (wie im Punkt-Panel).
    buildNowcast({
      lat: point.lat, lon: point.lon, country: point.country, signal: ac.signal,
      onUpdate: (nc) => { if (!ac.signal.aborted) setPointNowcast(nc); },
    }).then((nc) => { if (!ac.signal.aborted) setPointNowcast(nc); }).catch(() => {});
    return () => ac.abort();
  }, [point.lat, point.lon, point.country]);

  // Gewittergefahr-Index: CAPE (ICON-D2) + amtliche Gewitterwarnung am Punkt lazy
  // im Hintergrund laden (NUR DE — beides DACH-weit nicht verfügbar). Blockiert den
  // Radar-Kaltstart nicht; AT/CH fallen sauber auf das Radarsignal zurück.
  useEffect(() => {
    setCapePeak(null); setWarnLevel(0);
    if (point.country !== 'DE') return;
    const ac = new AbortController();
    void fetchPeakCapeAtPoint(point.lat, point.lon, ac.signal)
      .then((c) => { if (!ac.signal.aborted && c != null) setCapePeak(c); }).catch(() => {});
    void fetchDwdAlerts(point.lat, point.lon, ac.signal)
      .then((r) => {
        if (ac.signal.aborted) return;
        const lvl = r.alerts.reduce((m, a) => (/gewitter/i.test(a.event) || /gewitter/i.test(a.headline) ? Math.max(m, a.level) : m), 0);
        setWarnLevel(lvl);
      }).catch(() => {});
    return () => ac.abort();
  }, [point.lat, point.lon, point.country]);

  // RL1 — Nachbarquellen des DACH-Komposits (best-effort, entdoppelt über
  // `shareInFlight` wie in der Wetterkarte). Das eigene Land kommt aus dem Stack;
  // die beiden anderen werden parallel geholt. Schlägt alles fehl, bleibt
  // `neighbors` null und die Karte zeichnet das Landesradar wie bisher.
  useEffect(() => {
    // Phase RR: im Profil lädt `MapView` alle drei Landesradare selbst (wie die Wetterkarte) — hier nur für die alte Karte.
    if (useProfile) { setNeighbors(null); return; }
    const ac = new AbortController();
    const c = location.country;
    const jobs: Array<Promise<Partial<CompositeSources>>> = [];
    // LE2/H7: Nachbarquellen mit `priority: 'low'` — sie teilten sich bisher die
    // Leitung mit dem eigenen Stack (INCA 1,3 MB + rzc 0,2 MB neben dem RV-Tar).
    const low = { priority: 'low' as const };
    if (c !== 'DE') jobs.push(fetchRvNowcast(ac.signal, low).then((rv) => ({ rv })));
    if (c !== 'AT') jobs.push(fetchIncaGrid(ac.signal, low).then((inca) => ({ inca })));
    if (c !== 'CH') jobs.push(fetchRzcLatest(ac.signal, low).then((rzc) => ({ rzc })));
    void Promise.allSettled(jobs).then((rs) => {
      if (ac.signal.aborted) return;
      const merged: CompositeSources = {};
      for (const r of rs) {
        if (r.status === 'fulfilled') Object.assign(merged, r.value);
        else console.warn('[buscosun] Regenradar-Komposit: Nachbarquelle nicht geladen —', r.reason instanceof Error ? r.reason.message : r.reason);
      }
      const got = Object.keys(merged).length;
      console.log(`[buscosun] Regenradar-Komposit: ${got}/${jobs.length} Nachbarquellen geladen (${Object.keys(merged).join(', ') || '—'})`);
      setNeighbors(got ? merged : null);
    });
    return () => ac.abort();
  }, [location.country, reloadKey, autoTick, useProfile]);

  // RL1 — Zellbahnen (DWD KONRAD3D): Abruf nur bei aktivem Layer UND sichtbarem
  // Tab, alle 5 min (~0,6 MB je Datei) — dasselbe Muster wie `MapView.tsx`.
  const cellsOn = layerSet.has('cells');
  useEffect(() => {
    if (!cellsOn) { setCellsRun(null); return; }
    const abort = new AbortController();
    let stopped = false;
    const load = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const run = await fetchKonrad3d(abort.signal);
        if (stopped) return;
        console.log(`[buscosun] Regenradar Zellbahnen → KONRAD3D-Datei: ${run.file} · Messzeit ${new Date(run.refMs).toLocaleString('de-DE')} · ${run.cells.length} Zellen`);
        setCellsRun(run);
      } catch {
        if (stopped || abort.signal.aborted) return;
        console.warn('[buscosun] Zellbahnen (DWD KONRAD3D) konnten nicht geladen werden');
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, CELLS_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true; abort.abort(); window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      setCellsRun(null);
    };
  }, [cellsOn]);

  // RL1 — ICON-D2 Schnee (h_snow bzw. snow_gsp+snow_con), lazy beim Aktivieren und
  // bei Modus-Wechsel, progressiv (Muster `installSnow` in MapView; der Abort des
  // Effekts ersetzt den Seq-Guard). Über den Repack seit BW-6 vom CDN.
  const snowOn = layerSet.has('snow');
  useEffect(() => {
    // Phase RR: im Profil zeichnet `MapView` den Schnee selbst (derselbe Lader) — hier nur für die alte Karte.
    if (!snowOn || useProfile) { setSnowData(null); return; }
    const ac = new AbortController();
    setSnowData(null);
    fetchIconD2Snow(snowMode, ac.signal, (partial) => { if (!ac.signal.aborted) setSnowData(partial); })
      .then((sd) => { if (!ac.signal.aborted) setSnowData(sd); })
      .catch(() => { if (!ac.signal.aborted) console.warn('[buscosun] ICON-D2 Schnee nicht erreichbar'); });
    return () => ac.abort();
  }, [snowOn, snowMode, useProfile]);

  // Persist + Abspiel-Engine.
  useEffect(() => { saveLastView({ layers, palette, basemap, opacity }); }, [layers, palette, basemap, opacity]);
  useEffect(() => {
    if (!playing || !stack) return;
    let raf = 0; let prev = performance.now();
    const maxIdx = stack.frames.length - 1; const fps = 2.5 * speed;
    const tick = (t: number) => {
      const dt = (t - prev) / 1000; prev = t;
      setFramePos((p) => { let n = p + dt * fps; if (n > maxIdx) { if (loop) n = 0; else { n = maxIdx; applyPlaying(false); } } return n; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, loop, stack]);

  // Abgeleitet: Zellbahnen mit Standortbezug (EINE Entscheidung, `cellLocationRelevance`),
  // Akkumulation, Coverage.
  const cellRel = useMemo(() => (cellsRun ? cellLocationRelevance(cellsRun, [point.lon, point.lat]) : null), [cellsRun, point.lon, point.lat]);
  const relCell = useMemo(() => (cellsRun && cellRel ? cellsRun.cells.find((c) => c.id === cellRel.cellId) ?? null : null), [cellsRun, cellRel]);
  // Phase ZO (E-ZO-1): der Satz der Leiste nach der neuen Regel (Ellipse ⊕ Zellkörper, Uhrzeit, Kern/Rand) — `?zo=0` = vorher.
  const zoLeiste = useMemo(() => {
    if (!zoOn || !cellsRun) return null;
    const nowMs = Date.now();
    const v = cellPlaceVerdict(cellsRun, point.lat, point.lon, nowMs);
    const text = cellPlaceSentence(v, nowMs);
    const cell = v.kind === 'pass' || v.kind === 'passby' ? cellsRun.cells.find((c) => c.id === v.cellId) ?? null : null;
    return text ? { text, bolt: (cell?.lightningRate ?? 0) > 0, cellId: cell?.id ?? null } : null;
  }, [zoOn, cellsRun, point.lat, point.lon]);
  // V-ZO-4: hervorgehoben wird die Zelle, die der Satz nennt — Karte und Satz sagen dasselbe. `undefined` = alte Regel S-Z2-3a.
  const zoAffectsCellId: number | null | undefined = zoOn ? (zoLeiste?.cellId ?? null) : undefined;
  const cellFeatures = useMemo(
    () => (cellsRun ? buildCellFeatures(cellsRun, { affectsCellId: zoAffectsCellId !== undefined ? zoAffectsCellId : (cellRel?.cellId ?? null) }) : null),
    [cellsRun, cellRel, zoAffectsCellId],
  );

  // Gewittergefahr-Index am Punkt: fusioniert CAPE (Potenzial), Zellintensität
  // (Realisierung) und amtliche Warnung zu EINER Aussage. cellPeak aus dem
  // Punktforecast (layer-unabhängig); „verstärkend" seit RL1 = die für den Ort
  // relevante KONRAD3D-Zelle hat Severity ≥ 1 (KONRAD3D kennt keinen Trend —
  // die Eigenverfolgung, die ihn lieferte, ist ersetzt; benannt, nicht kaschiert).
  const convective: ConvectiveIndex | null = useMemo(() => {
    if (!pointNowcast) return null;
    return convectiveIndex({
      capeJkg: capePeak,
      cellPeakMmH: pointNowcast.summary.peakMmH ?? null,
      cellIntensifying: relCell != null && cellRel?.kind === 'eta' && (relCell.severityDecimal ?? relCell.severity ?? 0) >= 1,
      warningLevel: warnLevel,
      fallbackRiskPct: pointNowcast.summary.thunderRiskPct ?? 0,
    });
  }, [capePeak, warnLevel, pointNowcast, relCell, cellRel]);

  const accumValues = useMemo(() => {
    if (!stack || !layerSet.has('accum')) return null;
    const fr = stack.frames[stack.nowIndex] ?? stack.frames[0]; const w = ACCUM_WINDOWS[accumIdx];
    return accumulate(stack.frames.filter((f) => f.leadMinutes >= 0).map((f) => ({ values: f.values, leadMinutes: f.leadMinutes })), fr.width, fr.height, w.fromMin, w.toMin, w.vmax).values;
  }, [stack, layerSet, accumIdx]);

  const coverageValues = useMemo(() => {
    if (!stack || !layerSet.has('coverage')) return null;
    const fr = stack.frames[stack.nowIndex] ?? stack.frames[0];
    return buildEdgeFalloffMask(fr.width, fr.height).values;
  }, [stack, layerSet]);

  const pointSamples = useMemo(() => (stack ? stripSamples(stack, point.lat, point.lon) : []), [stack, point.lat, point.lon]);
  // Ensemble-Regenwahrscheinlichkeit am Punkt (nur DE) — hängt an stack+Punkt, nicht am Slider.
  const pointPop = useMemo(() => (stack ? pointPoPSeries(stack, point.lat, point.lon) : []), [stack, point.lat, point.lon]);
  // Phase RB (an, `?rb=0` aus): dieselbe Spanne als Label am Ortsmarker — für den Punkt am Marker (kann vom Ort der Seite abweichen).
  const rbOn = useMemo(() => rainWindowEnabledFrom(typeof window !== 'undefined' ? window.location.search : ''), []);
  const markerLabel = useMemo(() => {
    if (!rbOn || !stack || !pointNowcast) return null;
    const nowMs = Date.now();
    const w = computeRainWindow({ nowMs, radar: radarTimesAt(stack, point.lat, point.lon, nowMs), fusion: pointNowcast.fusionPWet ?? null, fusionWetMmH: pointNowcast.fusionPWetMmH });
    return w.kind === 'none' ? null : w.label;
  }, [rbOn, stack, point.lat, point.lon, pointNowcast]);
  const frameMmH = useMemo(() => (stack ? frameIntensities(stack, point.lat, point.lon) : []), [stack, point.lat, point.lon]);

  // Phasen/Schneefallgrenze: Gelände-DEM lazy laden (nur wenn aktiv). Phase RR: nur für die alte Karte — im Profil
  // zeichnet `MapView` die Schneefallgrenze der Wetterkarte (ICON-D2-Temperatur + Gelände + ML #2, RR-f).
  const needTerrain = !useProfile && (layerSet.has('rain') || layerSet.has('graupel') || layerSet.has('hail') || layerSet.has('snowline'));
  useEffect(() => {
    if (!needTerrain || !stack || terrain) return;
    const fr = stack.frames[stack.nowIndex] ?? stack.frames[0];
    if (!fr) return;
    const ac = new AbortController();
    loadElevationLookup(quadBBox(stack.corners), 7, ac.signal)
      .then((dem) => { if (!ac.signal.aborted) setTerrain(buildTerrain(stack.corners, fr.width, fr.height, dem)); })
      .catch(() => { /* DEM nicht erreichbar → Schnee-Overlay bleibt leer */ });
    return () => ac.abort();
  }, [needTerrain, stack, terrain]);

  const snowLineM = pointNowcast?.summary?.snowLineM ?? null;
  const snowLineFeatures = useMemo(() => (terrain ? snowLineGeoJSON(terrain, snowLineM) : []), [terrain, snowLineM]);

  // Aktionen.
  const onPick = useCallback((lat: number, lon: number) => {
    setPoint({ lat, lon, name: 'wird ermittelt …', country: point.country });
    reverseGeocode(lat, lon).then((loc) => setPoint(loc
      ? { lat, lon, name: loc.name, country: loc.country }
      : { lat, lon, name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, country: point.country }))
      .catch(() => setPoint({ lat, lon, name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, country: point.country }));
  }, [point.country]);

  // Phase RR (Profil): Eingaben der Wetterkarten-Karte aus dem Radar-Stack — Zeit des sichtbaren Frames, Morph zwischen
  // den beiden Nachbar-Frames, gemessene Analysen des Rückblicks. Referenzen stabil halten (`radarPast` leert in
  // `MapView` den Frame-Speicher), Layer über die Profil-Tabelle.
  // Phase NS: in der Summen-Ansicht ruht die Intensitäts-Ebene (der Schalter im Dock bleibt, wie er ist).
  // Phase SK: a boolean, so the deck's new `snowCap` object per render does not rebuild the layer list.
  const skOnMap = !!snowCap;
  const profileLayers = useMemo(() => {
    const base = sumMode || chanceMode ? layers.filter((l) => l !== 'precip') : layers;
    // Phase SK: with `?sk=1` the cap replaces the ICON-D2 line (E-SK-1); without it the list is the one before.
    return radarProfileLayers(skOnMap ? base.filter((l) => l !== 'snowline') : base);
  }, [layers, sumMode, chanceMode, skOnMap]);
  const radarPast = useMemo(() => {
    if (!stack) return null;
    const measured = stack.frames.filter((f) => f.measured);
    if (stack.source === 'radolan_rv') {
      return { rv: measured.map((f): RvPastFrame => ({ validAt: new Date(f.timeMs), values: f.values, width: f.width, height: f.height })), rzc: null };
    }
    if (stack.source === 'meteoswiss_rzc') {
      return { rv: null, rzc: measured.map((f): RzcFrame => ({ validAt: new Date(f.timeMs), values: f.values, width: f.width, height: f.height, corners: stack.corners })) };
    }
    return null;
  }, [stack]);
  const shownIdx = stack ? Math.max(0, Math.min(stack.frames.length - 1, Math.round(framePos))) : 0;
  const profileTimeMs = stack?.frames[shownIdx]?.timeMs;
  // Phase RC: Zeit nach oben melden; die Chance-Karte folgt der Wahl aus der Leiste, sonst dem Slider.
  const onTimeChangeRef = useRef(onTimeChange);
  onTimeChangeRef.current = onTimeChange;
  const hasTimeCb = !!onTimeChange;
  useEffect(() => { if (profileTimeMs != null) onTimeChangeRef.current?.(profileTimeMs); }, [profileTimeMs, hasTimeCb]);
  const chanceMap = useChanceMap(mapInst, chanceMode, chance?.threshold ?? 'any', chanceMode ? (chance?.pickMs ?? profileTimeMs ?? Date.now()) : null, reloadKey * 1000 + autoTick);
  // Phase SK: one hook per map — 2D below the radar layers, 3D (ZT stage) before `zt-cone` (above the radar picture).
  // Only on the profile map (`MapView`) — never on the legacy map (`?rr=legacy`, automatic fallback on a chunk error).
  const skActive = !!snowCap && useProfile && layerSet.has('snowline');
  const skTimeMs = snowCap ? (snowCap.pickMs ?? profileTimeMs ?? Date.now()) : null;
  const skBeforeId2d = useCallback(() => {
    // The radar layers are custom layers — `getStyle().layers` does not list them, `getLayer` finds them. `MapView` adds
    // `precip-rain-layer` first (then HD, flow, PoP), so it is the lowest radar layer and above `basemap-dim`.
    const radar = ['precip-rain-layer', 'precip-rain-hd-de', 'precip-rain-hd-at', 'precip-rain-hd-ch', 'flow-nowcast-layer'].find((id) => !!mapInst?.getLayer(id));
    return radar ?? mapInst?.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
  }, [mapInst]);
  const skStageMap = snowCap?.stageMap ?? null;
  const skBeforeId3d = useCallback(() => (skStageMap?.getLayer('zt-cone') ? 'zt-cone' : undefined), [skStageMap]);
  const skMobile = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches;
  const snowCap2d = useSnowCap(mapInst, skActive && !snowCap?.mapHidden, skTimeMs, { palette: SK_PALETTE_2D, beforeId: skBeforeId2d, prefix: 'sk', mobile: skMobile });
  const snowCap3d = useSnowCap(snowCap?.stageMap ?? null, skActive, skTimeMs, { palette: SK_PALETTE_3D, beforeId: skBeforeId3d, prefix: 'sk3', mobile: skMobile });
  const skHoverRef = useRef<((lat: number, lon: number) => string | null) | null>(null);
  skHoverRef.current = skActive ? snowCap2d.hoverAt : null;
  const [skHover, setSkHover] = useState<string | null>(null);
  // Phase SK: tap a slope on the 3D stage → height, snowline, phase. A tap on a tower stays ZT's (towers first).
  const skPickAt = snowCap3d.pickAt;
  useEffect(() => {
    const m = skStageMap;
    if (!m || !skActive) return;
    let popup: maplibregl.Popup | null = null;
    let alive = true;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const towerIds = (m.getStyle()?.layers ?? []).filter((l) => l.id.startsWith('zt-tower')).map((l) => l.id);
      if (towerIds.length && m.queryRenderedFeatures(e.point, { layers: towerIds }).length) return;
      const html = snowTapHtml(skPickAt(e.lngLat.lat, e.lngLat.lng));
      if (!html) return;
      void import('../snowCap/snowCapEngine').then(({ openSnowTap }) => { if (alive) popup = openSnowTap(m, e.lngLat, html, popup); });
    };
    m.on('click', onClick);
    return () => { alive = false; m.off('click', onClick); popup?.remove(); };
  }, [skStageMap, skActive, skPickAt]);
  const i0 = stack ? Math.max(0, Math.min(stack.frames.length - 1, Math.floor(framePos))) : 0;
  const i1 = stack ? Math.min(stack.frames.length - 1, i0 + 1) : 0;
  const bracketA = stack?.frames[i0]?.timeMs;
  const bracketB = stack?.frames[i1]?.timeMs;
  const bracketFrac = framePos - i0;
  const timeBracket = useMemo(
    () => (bracketA != null && bracketB != null ? { aMs: bracketA, bMs: bracketB, frac: bracketFrac } : null),
    [bracketA, bracketB, bracketFrac],
  );
  const mapLocation = useMemo(
    () => ({ name: point.name, lat: point.lat, lon: point.lon, country: point.country }),
    [point.name, point.lat, point.lon, point.country],
  );
  // Hover-Readout wie die alte Karte: mm/h aus dem Landes-Frame des Stacks unter dem Zeiger.
  const sumHoverRef = useRef<((lat: number, lon: number) => string | null) | null>(null);
  sumHoverRef.current = sumMode ? sumMap.hoverAt : chanceMode ? chanceMap.hoverAt : null;
  const [sumHover, setSumHover] = useState<string | null>(null);
  const onProfileHover = useCallback((p: { lat: number; lon: number } | null) => {
    // Phase SK: snowfall line under the pointer next to the radar value (null without `?sk=1`).
    setSkHover(p && skHoverRef.current ? skHoverRef.current(p.lat, p.lon) : null);
    if (sumHoverRef.current) { setHover(null); setSumHover(p ? sumHoverRef.current(p.lat, p.lon) : null); return; }
    setSumHover(null);
    const st = stackRef.current;
    if (!p || !st) { setHover(null); return; }
    const fr = st.frames[Math.max(0, Math.min(st.frames.length - 1, Math.round(framePosRef.current)))];
    setHover(fr ? sampleRadarPoint(st.source, fr.values, fr.width, fr.height, st.corners, p.lat, p.lon, RADAR_VMAX) : null);
  }, []);
  // Im Profil zeichnet die Karte mit der Rampe der Wetterkarte (`precipRainRamp` = Palette „classic"); die Palettenwahl
  // war seit dem Deck nicht erreichbar und wird nicht übernommen (E-RR-3) — Legende und Streifen folgen der Karte.
  const shownPalette: PaletteId = useProfile ? 'classic' : palette;

  const toggleLayer = (id: RadarLayerId) => applyLayers(layers.includes(id) ? layers.filter((l) => l !== id) : [...layers, id]);
  const step = (d: number) => { onUserTime?.(); if (d < 0) requestPastSeedRef.current?.(); applyPlaying(false); setFramePos((p) => Math.max(0, Math.min((stack?.frames.length ?? 1) - 1, Math.round(p) + d))); };
  const jumpNow = () => { onUserTime?.(); applyPlaying(false); if (stack) setFramePos(stack.nowIndex); };

  return (
    <div className={`rt-card nc-radar${stageAside ? ` zt-has-aside zt-mode-${stage3d ?? 'split'}` : ''}`}>
      {/* Ebenen + Einstellungen */}
      {!hideLayerbar && (
      <div className="nc-radar-layersbar">
        <span className="nc-radar-eyebrow">Ebenen</span>
        <div className="nc-radar-toggles">
          {LAYER_ORDER.map((id) => {
            const on = layers.includes(id); const m = LAYER_META[id]; const heur = HEURISTIC_PHASES.has(id);
            return (
              <button key={id} type="button" className={`nc-rtoggle${on ? ' is-on' : ''}`} onClick={() => toggleLayer(id)} aria-pressed={on}
                title={heur ? `${m.label} — Heuristik (aus Radar-Intensität geschätzt, kein Mess-Produkt)` : undefined}>
                <LayerIcon id={id} size={15} /> {m.label}{heur ? ' *' : ''}
              </button>
            );
          })}
        </div>
        <button type="button" className={`nc-rchip nc-rchip-layers${showLayers ? ' is-active' : ''}`} onClick={() => setShowLayers((s) => !s)} aria-expanded={showLayers}>
          <IconSliders size={15} /> Einstellungen
          <IconChevron size={14} className={`nc-rchip-caret${showLayers ? ' is-open' : ''}`} />
        </button>
      </div>
      )}

      {/* ausklappbare Darstellungs-Einstellungen */}
      {showLayers && (
        <div className="nc-radar-panel">
          <div className="nc-radar-group">
            <span className="nc-radar-eyebrow">Darstellung</span>
            {layers.includes('accum') && (
              <div className="nc-radar-seg-row">
                <span className="nc-radar-seg-label"><IconClock size={15} /> Summen-Fenster</span>
                <div className="nc-radar-seg">{ACCUM_WINDOWS.map((w, i) => <button key={w.id} type="button" className={accumIdx === i ? 'is-active' : ''} onClick={() => setAccumIdx(i)}>{w.label}</button>)}</div>
              </div>
            )}
            <div className="nc-radar-seg-row">
              <span className="nc-radar-seg-label"><IconPalette size={15} /> Palette</span>
              <div className="nc-radar-seg">{PALETTE_ORDER.map((p) => <button key={p} type="button" className={palette === p ? 'is-active' : ''} onClick={() => setPalette(p)} title={PALETTES[p].cvdSafe ? 'farbenfehlsicht-sicher' : undefined}>{PALETTES[p].label}{PALETTES[p].cvdSafe ? ' ◐' : ''}</button>)}</div>
            </div>
            <div className="nc-radar-seg-row">
              <span className="nc-radar-seg-label"><IconMap size={15} /> Basiskarte</span>
              <div className="nc-radar-seg">{(['streets', 'terrain', 'satellite'] as Basemap[]).map((b) => <button key={b} type="button" className={basemap === b ? 'is-active' : ''} onClick={() => setBasemap(b)}>{b === 'streets' ? 'Straße' : b === 'terrain' ? 'Gelände' : 'Satellit'}</button>)}</div>
            </div>
            <div className="nc-radar-seg-row">
              <span className="nc-radar-seg-label"><IconContrast size={15} /> Deckkraft <em className="nc-radar-seg-val">{Math.round(opacity * 100)} %</em></span>
              <input type="range" min={20} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} aria-label="Deckkraft" />
            </div>
            <label className="nc-radar-check"><input type="checkbox" checked={expertDbz} onChange={(e) => setExpertDbz(e.target.checked)} /> dBZ-Reflektivität anzeigen (Expert)</label>
          </div>
        </div>
      )}

      {/* Kartenbühne */}
      <div className="nc-radar-stage">
        {useProfile ? (
          MapViewC ? (
            <MapViewC
              location={mapLocation} profile="radar"
              initialActive={profileLayers} routeLayers={profileLayers}
              timeMs={profileTimeMs} timeBracket={timeBracket} radarPast={radarPast} profileSnowMode={snowMode}
              onPointPick={onPick} onPointHover={onProfileHover}
              onMapReady={(m) => { mapRef.current = m; setMapInst(m); onMapReady?.(m); }}
              initialView={initialView} onViewChange={onViewChange}
              {...(markerLabel ? { profileMarkerLabel: markerLabel } : {})}
              {...(zoAffectsCellId !== undefined ? { profileAffectsCellId: zoAffectsCellId } : {})}
              {...(onProfileRadarPick ? { onProfileRadarPick } : {})}
              {...(stageAside && stage3d === '3d' ? { suspended: true } : {})}
            />
          ) : (
            <div className="nc-radar-loading"><span className="ev-spinner" /> Karte wird geladen …</div>
          )
        ) : stack ? (
          <RadarMap
            stack={stack} framePos={framePos} palette={palette} opacity={opacity} basemap={basemap}
            layers={chanceMode ? layerSetNoPrecip : layerSet} accumValues={accumValues} coverageValues={coverageValues}
            composite={neighbors} cellFeatures={cellFeatures} snow={snowData}
            elevFull={terrain?.elevFull ?? null} snowLineM={snowLineM} snowLineFeatures={snowLineFeatures}
            point={{ lat: point.lat, lon: point.lon }} comparePoint={null}
            onPick={onPick} onHover={(mmH) => setHover(mmH)} onMapRef={(m) => { mapRef.current = m; setMapInst(m); onMapReady?.(m); }}
            initialView={initialView} onViewChange={onViewChange}
          />
        ) : (
          <div className="nc-radar-loading">{loadErr ? `⚠ ${loadErr}` : <><span className="ev-spinner" /> Radar wird geladen … (RADOLAN-Komposit)</>}</div>
        )}

        {/* Quelle/Alter */}
        {stack && <div className="nc-radar-source"><IconRadarSignal size={13} /> {sourceAgeBadge(neighbors || useProfile ? `${stack.sourceLabel} + Komposit DACH` : stack.sourceLabel, stack.runAtMs)}</div>}

        {/* Standortbezug der Zellbahnen (Wortlaut S-Z2-3b, wie die Wetterkarte) — Phase ZO: neuer Satz, `?zo=0` = dieser */}
        {zoOn && cellsOn && zoLeiste && (
          <div className="nc-radar-eta nc-radar-eta--hint">
            {zoLeiste.bolt ? <IconBolt size={15} /> : <IconStormCloud size={15} />}
            <span>{zoLeiste.text} <em>DWD KONRAD3D</em></span>
          </div>
        )}
        {!zoOn && cellsOn && cellRel && (
          <div className="nc-radar-eta">
            {(relCell?.lightningRate ?? 0) > 0 ? <IconBolt size={15} /> : <IconStormCloud size={15} />}
            <span>{cellRelevanceText(cellRel)} <em>DWD KONRAD3D</em></span>
          </div>
        )}
        {cellsOn && cellsRun && cellsRun.cells.length === 0 && (
          <div className={`nc-radar-eta nc-radar-eta--quiet${zoOn ? ' nc-radar-eta--hint' : ''}`}><IconStormCloud size={15} /><span>KONRAD3D: aktuell keine konvektiven Zellen erkannt (DE).</span></div>
        )}

        {/* Hover-Readout */}
        {(sumMode || chanceMode) && sumHover && <div className="nc-radar-hover">{sumHover}</div>}
        {!sumMode && !chanceMode && hover != null && (
          <div className="nc-radar-hover">{hover >= 0.06 ? `${hover.toFixed(1).replace('.', ',')} mm/h` : 'trocken'}{skHover && <> · {skHover}</>}</div>
        )}
        {!sumMode && !chanceMode && hover == null && skHover && <div className="nc-radar-hover">{skHover}</div>}

        {/* Legende — Phase NS: in der Summen-Ansicht die Summen-Legende */}
        {sumMode && sum && <SumLegend info={sumMap.info} sel={sum} />}
        {chanceMode && chance && <ChanceLegend info={chanceMap.info} threshold={chance.threshold} nowMs={Date.now()} />}
        {!sumMode && !chanceMode && <div className="nc-radar-legend">
          {RADAR_BANDS.filter((b) => b.band !== 'dry').map((b) => (
            <span key={b.band} className="nc-radar-leg-item"><i style={{ background: PALETTES[shownPalette].bandColors[b.band] }} /> {b.label}</span>
          ))}
          {layerSet.has('snow') && (
            <span className="nc-radar-leg-item"><i style={{ background: 'linear-gradient(90deg,#d6e8fa,#78a6e6,#4660be)' }} /> {snowMode === 'fresh' ? 'Neuschnee 0–50 cm' : 'Schneedecke 0–150 cm'} · ICON-D2</span>
          )}
          {/* Phase RR: die Phasen-Heuristik gibt es nur auf der alten Karte (E-RR-3) — im Profil keine Legende dafür. */}
          {!useProfile && layerSet.has('graupel') && (
            <span className="nc-radar-leg-item"><i style={{ background: 'linear-gradient(90deg,#dcaaee,#ba6ed2,#9630a0)' }} /> Graupel</span>
          )}
          {!useProfile && layerSet.has('hail') && (
            <span className="nc-radar-leg-item"><i style={{ background: 'linear-gradient(90deg,#ff78aa,#f03c6e,#c81450)' }} /> Hagel</span>
          )}
          {/* Phase SK: the cap of buscosun Fusion instead of the ICON-D2 line (desktop legend). */}
          {useProfile && skActive && <SnowCapLegend info={snowCap2d.info} variant="inline" />}
        </div>}

        {/* Phase RR (RR-f): die Schneefallgrenze der Karte ist die der Wetterkarte — Quelle benannt; der Punktwert
            am gewählten Ort kommt aus der Punktvorhersage des Streifens. */}
        {useProfile && layerSet.has('snowline') && !snowCap && (
          <div className="nc-radar-snownote">
            ❄ Schneefallgrenze: ICON-D2-Temperatur + Gelände (ML #2)
            {snowLineM != null && <> · am Punkt <strong>~{snowLineM} m</strong></>}
          </div>
        )}
        {/* Phase SK: mobile status note (map legends are hidden on mobile) — source, run, validity, gaps. */}
        {useProfile && skActive && <SnowCapLegend info={snowCap2d.info} variant="note" />}

        {/* Niederschlagsart-Hinweis */}
        {needTerrain && (
          <div className="nc-radar-snownote">
            {snowLineM != null
              ? <>❄ Schneefallgrenze <strong>~{snowLineM} m</strong> · Regen/Schnee aus Geländehöhe (DEM) + Schneefallgrenze</>
              : <>❄ Keine Schneefallgrenze in der Vorhersage — alles als Regen klassifiziert</>}
            {(layerSet.has('graupel') || layerSet.has('hail')) && <span className="nc-radar-snownote-heur"> · Graupel/Hagel = Heuristik (geschätzt)</span>}
          </div>
        )}
      </div>

      {/* Phase ZT: 3D stage beside the map (grid of `.zt-has-aside`, `cellTowersShell.css`); the time axis below spans both. */}
      {stageAside && <div className="zt-aside">{stageAside}</div>}

      {/* Zeitachse (Scrubber) · Punkt-Streifen · Datenqualität.
          Deck (compact): alles in ein eingeklapptes Akkordeon gefaltet — der
          Play-Button lebt im schwebenden Deck. Standalone: direkt sichtbar.
          Funktion bleibt in beiden Fällen vollständig erhalten. */}
      {(() => {
        const scrubber = stack ? (
          <RadarTimeline
            stack={stack} framePos={framePos} playing={playing} speed={speed} loop={loop} intensities={frameMmH}
            onScrub={(p) => { onUserTime?.(); if (p <= 0) requestPastSeedRef.current?.(); applyPlaying(false); setFramePos(p); }}
            onTogglePlay={() => applyPlaying(!playing)} onStep={step} onJumpNow={jumpNow}
            onSpeed={setSpeed} onToggleLoop={() => setLoop((l) => !l)}
          />
        ) : null;
        const pointStrip = stack ? (
          <PointStrip
            name={point.name} country={point.country} samples={pointSamples}
            nowMs={Date.now()} skillMin={stack.skillMin || 120} palette={shownPalette}
            nowcast={pointNowcast} expertDbz={expertDbz} pop={pointPop} convective={convective}
          />
        ) : null;
        const qualityList = (
          <ul>
            {stack && <li><strong>Quelle:</strong> {stack.attribution}</li>}
            {stack && <li><strong>Skill-Horizont:</strong> minutengenau bis ~{Math.round((stack.skillMin || 0) / 60 * 10) / 10} h, danach {pointNowcast?.nwpSource === 'cube' ? 'buscosun Fusion (Punkt-Cube)' : `Modell (${pointNowcast ? nwpLabel(pointNowcast) : 'ICON-D2'})`}.</li>}
            <li><strong>Radarsicht:</strong> {coverageNote(point.lat, point.country)}</li>
            <li>Karte antippen für Punktabfrage. Raster sättigt ~20 mm/h (RADOLAN-RV-Kodierung).</li>
          </ul>
        );
        if (compact) {
          return (
            <>
              {/* Zeitachse steht immer offen — sie ist die Hauptbedienung des
                  Radars, nicht ein Detail. Punktabfrage und Methodik bleiben
                  eingeklappt darunter. */}
              {scrubber}
              <details className="nc-radar-morebox">
              <summary><IconRadarSignal size={15} /> Punktabfrage &amp; Datenqualität</summary>
              <div className="nc-radar-morebox-body">
                {pointStrip}
                {/* Methodik als eigene, zugeklappte Kachel: Herkunft, Skill-Horizont,
                    Radarsicht und Raster-Sättigung bleiben vollständig erreichbar
                    (Funktionserhalt), kosten aber nur noch eine Zeile Platz. */}
                <details className="nc-radar-quality nc-radar-quality-inline nc-methodik">
                  <summary><IconRadarSignal size={14} /> Methodik &amp; Datenqualität</summary>
                  {qualityList}
                </details>
              </div>
              </details>
            </>
          );
        }
        return (
          <>
            {scrubber}
            {pointStrip}
            <details className="nc-radar-quality">
              <summary><IconRadarSignal size={15} /> Datenqualität &amp; Radarsicht</summary>
              {qualityList}
            </details>
          </>
        );
      })()}

    </div>
  );
}
