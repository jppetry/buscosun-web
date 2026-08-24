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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { convectiveIndex, type ConvectiveIndex } from '../radar/convectiveIndex';
import { fetchPeakCapeAtPoint } from '../sources/iconD2Cape';
import { fetchDwdAlerts } from '../sources/dwdAlerts';
import { fetchKonrad3d } from '../sources/dwdKonrad3d';
import type { Konrad3dRun } from '../radar/konrad3d';
import { buildCellFeatures, cellLocationRelevance, cellRelevanceText } from '../radar/cellPolygons';
import { CELLS_POLL_MS } from '../radar/cellLayers';
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

export default function NowcastRadarMap({ location, nowcast, reloadKey = 0, layers: controlledLayers, onLayersChange, hideLayerbar = false, compact = false, playing: controlledPlaying, onPlayingChange, onMapReady, initialView, onViewChange, snowMode = 'depth' }: Props) {
  const last = useMemo(() => loadLastView(), []);
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
  const applyPlaying = useCallback((next: boolean) => {
    if (next) requestPastSeedRef.current?.();
    if (onPlayingChange) onPlayingChange(next); else setPlayingUnc(next);
  }, [onPlayingChange]);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);

  const [point, setPoint] = useState<PointInfo>({ lat: location.lat, lon: location.lon, name: location.name, country: location.country });
  const [pointNowcast, setPointNowcast] = useState<Nowcast | null>(nowcast);
  // Gewittergefahr-Zutaten (DE): CAPE-Spitze + DWD-Gewitterwarnstufe am Punkt.
  const [capePeak, setCapePeak] = useState<number | null>(null);
  const [warnLevel, setWarnLevel] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layerSet = useMemo(() => new Set(layers), [layers]);
  // RL1: Nachbarquellen des DACH-Komposits, KONRAD3D-Lauf, ICON-D2-Schnee.
  const [neighbors, setNeighbors] = useState<CompositeSources | null>(null);
  const [cellsRun, setCellsRun] = useState<Konrad3dRun | null>(null);
  const [snowData, setSnowData] = useState<IconD2Snow | null>(null);

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
      .catch((err) => { if (!ac.signal.aborted && isLocChange) setLoadErr(err instanceof Error ? err.message : 'Radar nicht erreichbar'); });
    return () => ac.abort();
  }, [location.lat, location.lon, location.country, reloadKey, autoTick]);

  // Punktforecast für angetippte Punkte (≠ Heimat) nachladen.
  useEffect(() => {
    if (point.lat === location.lat && point.lon === location.lon) return;
    const ac = new AbortController();
    buildNowcast({ lat: point.lat, lon: point.lon, country: point.country, signal: ac.signal })
      .then((nc) => { if (!ac.signal.aborted) setPointNowcast(nc); }).catch(() => {});
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
    const ac = new AbortController();
    const c = location.country;
    const jobs: Array<Promise<Partial<CompositeSources>>> = [];
    if (c !== 'DE') jobs.push(fetchRvNowcast(ac.signal).then((rv) => ({ rv })));
    if (c !== 'AT') jobs.push(fetchIncaGrid(ac.signal).then((inca) => ({ inca })));
    if (c !== 'CH') jobs.push(fetchRzcLatest(ac.signal).then((rzc) => ({ rzc })));
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
  }, [location.country, reloadKey, autoTick]);

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
    if (!snowOn) { setSnowData(null); return; }
    const ac = new AbortController();
    setSnowData(null);
    fetchIconD2Snow(snowMode, ac.signal, (partial) => { if (!ac.signal.aborted) setSnowData(partial); })
      .then((sd) => { if (!ac.signal.aborted) setSnowData(sd); })
      .catch(() => { if (!ac.signal.aborted) console.warn('[buscosun] ICON-D2 Schnee nicht erreichbar'); });
    return () => ac.abort();
  }, [snowOn, snowMode]);

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
  const cellFeatures = useMemo(() => (cellsRun ? buildCellFeatures(cellsRun, { affectsCellId: cellRel?.cellId ?? null }) : null), [cellsRun, cellRel]);
  const relCell = useMemo(() => (cellsRun && cellRel ? cellsRun.cells.find((c) => c.id === cellRel.cellId) ?? null : null), [cellsRun, cellRel]);

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
  const frameMmH = useMemo(() => (stack ? frameIntensities(stack, point.lat, point.lon) : []), [stack, point.lat, point.lon]);

  // Phasen/Schneefallgrenze: Gelände-DEM lazy laden (nur wenn aktiv).
  const needTerrain = layerSet.has('rain') || layerSet.has('graupel') || layerSet.has('hail') || layerSet.has('snowline');
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

  const toggleLayer = (id: RadarLayerId) => applyLayers(layers.includes(id) ? layers.filter((l) => l !== id) : [...layers, id]);
  const step = (d: number) => { if (d < 0) requestPastSeedRef.current?.(); applyPlaying(false); setFramePos((p) => Math.max(0, Math.min((stack?.frames.length ?? 1) - 1, Math.round(p) + d))); };
  const jumpNow = () => { applyPlaying(false); if (stack) setFramePos(stack.nowIndex); };

  return (
    <div className="rt-card nc-radar">
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
        {stack ? (
          <RadarMap
            stack={stack} framePos={framePos} palette={palette} opacity={opacity} basemap={basemap}
            layers={layerSet} accumValues={accumValues} coverageValues={coverageValues}
            composite={neighbors} cellFeatures={cellFeatures} snow={snowData}
            elevFull={terrain?.elevFull ?? null} snowLineM={snowLineM} snowLineFeatures={snowLineFeatures}
            point={{ lat: point.lat, lon: point.lon }} comparePoint={null}
            onPick={onPick} onHover={(mmH) => setHover(mmH)} onMapRef={(m) => { mapRef.current = m; onMapReady?.(m); }}
            initialView={initialView} onViewChange={onViewChange}
          />
        ) : (
          <div className="nc-radar-loading">{loadErr ? `⚠ ${loadErr}` : <><span className="ev-spinner" /> Radar wird geladen … (RADOLAN-Komposit)</>}</div>
        )}

        {/* Quelle/Alter */}
        {stack && <div className="nc-radar-source"><IconRadarSignal size={13} /> {sourceAgeBadge(neighbors ? `${stack.sourceLabel} + Komposit DACH` : stack.sourceLabel, stack.runAtMs)}</div>}

        {/* Standortbezug der Zellbahnen (Wortlaut S-Z2-3b, wie die Wetterkarte) */}
        {cellsOn && cellRel && (
          <div className="nc-radar-eta">
            {(relCell?.lightningRate ?? 0) > 0 ? <IconBolt size={15} /> : <IconStormCloud size={15} />}
            <span>{cellRelevanceText(cellRel)} <em>DWD KONRAD3D</em></span>
          </div>
        )}
        {cellsOn && cellsRun && cellsRun.cells.length === 0 && (
          <div className="nc-radar-eta nc-radar-eta--quiet"><IconStormCloud size={15} /><span>KONRAD3D: aktuell keine konvektiven Zellen erkannt (DE).</span></div>
        )}

        {/* Hover-Readout */}
        {hover != null && (
          <div className="nc-radar-hover">{hover >= 0.06 ? `${hover.toFixed(1).replace('.', ',')} mm/h` : 'trocken'}</div>
        )}

        {/* Legende */}
        <div className="nc-radar-legend">
          {RADAR_BANDS.filter((b) => b.band !== 'dry').map((b) => (
            <span key={b.band} className="nc-radar-leg-item"><i style={{ background: PALETTES[palette].bandColors[b.band] }} /> {b.label}</span>
          ))}
          {layerSet.has('snow') && (
            <span className="nc-radar-leg-item"><i style={{ background: 'linear-gradient(90deg,#d6e8fa,#78a6e6,#4660be)' }} /> {snowMode === 'fresh' ? 'Neuschnee 0–50 cm' : 'Schneedecke 0–150 cm'} · ICON-D2</span>
          )}
          {layerSet.has('graupel') && (
            <span className="nc-radar-leg-item"><i style={{ background: 'linear-gradient(90deg,#dcaaee,#ba6ed2,#9630a0)' }} /> Graupel</span>
          )}
          {layerSet.has('hail') && (
            <span className="nc-radar-leg-item"><i style={{ background: 'linear-gradient(90deg,#ff78aa,#f03c6e,#c81450)' }} /> Hagel</span>
          )}
        </div>

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

      {/* Zeitachse (Scrubber) · Punkt-Streifen · Datenqualität.
          Deck (compact): alles in ein eingeklapptes Akkordeon gefaltet — der
          Play-Button lebt im schwebenden Deck. Standalone: direkt sichtbar.
          Funktion bleibt in beiden Fällen vollständig erhalten. */}
      {(() => {
        const scrubber = stack ? (
          <RadarTimeline
            stack={stack} framePos={framePos} playing={playing} speed={speed} loop={loop} intensities={frameMmH}
            onScrub={(p) => { if (p <= 0) requestPastSeedRef.current?.(); applyPlaying(false); setFramePos(p); }}
            onTogglePlay={() => applyPlaying(!playing)} onStep={step} onJumpNow={jumpNow}
            onSpeed={setSpeed} onToggleLoop={() => setLoop((l) => !l)}
          />
        ) : null;
        const pointStrip = stack ? (
          <PointStrip
            name={point.name} country={point.country} samples={pointSamples}
            nowMs={Date.now()} skillMin={stack.skillMin || 120} palette={palette}
            nowcast={pointNowcast} expertDbz={expertDbz} pop={pointPop} convective={convective}
          />
        ) : null;
        const qualityList = (
          <ul>
            {stack && <li><strong>Quelle:</strong> {stack.attribution}</li>}
            {stack && <li><strong>Skill-Horizont:</strong> minutengenau bis ~{Math.round((stack.skillMin || 0) / 60 * 10) / 10} h, danach Modell (ICON-D2).</li>}
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
