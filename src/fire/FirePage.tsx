/**
 * FirePage — Waldbrand DACH, Command-Deck (D-27).
 *
 * Aufbau wie die übrigen Decks: Topbar · Rail · Dock · Center · Readout.
 * Anders als die Orts-Decks (Regenradar, Konfidenz) braucht Waldbrand **keinen
 * Ortsschritt** — die Ansicht ist von Haus aus ein DACH-Flächenblick. Deshalb
 * kein Idle-Kopf mit Suche, sondern direkt die Karte.
 *
 * Seit Phase WBU1 trägt die Ansicht die **Wetterkarten-Optik**
 * (`audit/waldbrand-ui.md`): Layer-Toggles links als Switch-Zeilen mit Icon
 * (Muster `layerRowDeck`), Steckbriefe rechts als Readout-Karten (Muster
 * `LayerInfoPanel`/`mdk-ro-lcard`, als Kopie in `FireLayerCard.tsx`), der
 * Tagesregler unten mittig als Glass-Zeit-Deck (Muster `mdk-timedeck`).
 * Reine Darstellungsphase: Datenpfad, Zeitmodell und Playback (WB1–WB5)
 * sind unverändert; diese Datei orchestriert weiterhin nur.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FeatureRail, type RailFeature } from '../nav/featureRail';
import FireMap, { type FireBasemap } from './FireMap';
import {
  FIRE_DECK_GROUPS, FIRE_LAYER_ORDER, FIRE_MVP_LAYERS, FIRE_PRESETS,
  FIRE_WEATHER_MAP_LAYERS, FIRE_FOOTPRINT_LAYERS, FIRE_ANOMALY_LAYERS,
  activeFirePresetId, fireSource, type FireLayerId,
} from './fireModel';
import {
  defaultFireTimeState, reconcileFireTime, sharedMaxDay,
  dayLabel, windowChoices, windowLabel, laggingLayers, FIRE_LAYER_TIME, dayToIsoDate,
  // WF3: eine Achse, zwei Einheiten.
  timeUnit, sharedMaxHour, hourlyAvailable, hourlyForced, hasTimeSlider, dayOfHour, hourLabel,
  dailyOnlyLayers, type FireTimeState,
} from './fireTime';
import {
  decodeFireState, encodeFireState, FIRE_HASH_PREFIX, DEFAULT_BURNT_BUCKETS, DEFAULT_SOIL_MODE,
} from './fireState';
import { fetchHotspots } from './sources/gwisHotspots';
import {
  fetchFirmsHotspots, toRun, detectionKey, type HotspotRun, type FirmsRow,
} from './sources/firmsHotspots';
import { type FireEvent } from './fireEvents';
import { classifyHotspots, computeZonesAndClusters, computeFireClusters } from './fireEventsClient';
import type { FireZone } from './fireZones';
import {
  // BP5: die Stärke-Beschriftungen sind mit der Liste ins Panel gezogen
  // (`FireFootprintPanel`); hier bleibt, was die Seite selbst braucht.
  withCountries, CLUSTER_PAGE,
  type FireCluster, type CountryRings,
} from './fireClusters';
import { loadCountryRings } from '../countryMask';
import type { Country } from '../types';
import { reconcileZones } from './footprint/reconcile';
import {
  historyIds, filterFeaturesById, latestUpdateMs, historyNote, historyDayLabel, historyWindow,
  HISTORY_DAYS, HISTORY_LATENCY_NOTE,
} from './footprint/history';
import {
  buildFireRegistry, carryIds, sortRecords, filterRecords, footprintsToGeoJSON, DEFAULT_FILTER,
  type FireRecord, type RecordFilter,
} from './footprint/fireRegistry';
import { FireFootprintPanel, type EffisScope } from './FireFootprintPanel';
import { applyFireView, fireViewFromState, type FireRouteView } from './fireRouteView';
import { loadPlaces, nearestPlace, type PlaceIndex } from './footprint/places';
import { featuresOf } from './activity/features';
import { areaEstEnabled, estimateArea, loadAreaModel } from './activity/estimate';
import type { AreaEstimate } from './activity/estimate';
import type { AreaModel } from './activity/calibration';
// AF2: Beobachtungsgelegenheit (regionale Aktivität) und Windabgleich — beides aus Daten, die schon da sind.
import { buildObservationIndex, observationFor } from './activity/observation';
import { fetchEmsActivations, type EmsActivation } from './sources/emsActivations';
import { fetchWarnContextsFor, type AtWarnContext } from './sources/geosphereWarnContext';
import { loadClcMask, landcoverAt, toAssessmentLandcover, type ClcMask } from './clcMask';
// TA3/TA4: statische Standortliste persistenter Wärmequellen + Reiter „Thermalanomalien".
import { loadThermalSites, siteAt, thermalSitesEnabled, type ThermalSitesIndex } from './anomaly/thermalSites';
import { FireAnomalyPanel } from './FireAnomalyPanel';
import { FireHistoryPanel } from './FireHistoryPanel';
import { historyEnabled, loadHistoryIndex, historyToGeoJSON, type HistoryLoad } from './history/historyLoad';
import type { HistoryIndexEntry, HistoryWindowKind } from './history/historyArtifacts';
import { anomaliesToGeoJSON } from './anomaly/anomalyLayer';
import { hiddenSiteCount } from './footprint/fireRegistry';
import { fetchIconD2Relhum, type IconD2Relhum } from '../sources/iconD2Relhum';
import {
  fetchIconD2Smi, SOIL_MODE_LABEL, SOIL_MODE_FULL_LABEL,
  type IconD2Smi, type SoilDrynessMode,
} from '../sources/iconD2Smi';
import {
  fetchBurntAreas, fetchBurntWeek, burntPeriodLabel, burntThresholdNote, fetchBucketOf,
  type BurntBucket, type BurntFetchBucket, type BurntRun,
} from './sources/euContext';
import { DANGER_VIEWS, DANGER_VIEW_ORDER, DEFAULT_DANGER_VIEW, companionView, type DangerView } from './dangerViews';
import { countMapped, mappedAreaFor, type BurntPolygon } from './fireCorroboration';
import { defaultPlayback, stepPlayback, prefetchTarget, daysPerSecondForTier, hoursPerSecondForTier } from './firePlayback';
import { frameAtValidTime } from '../sources/frameAtValidTime';
import { BottomSheet, type BottomSheetSnap } from '../mobile/BottomSheet';
import { useMediaQuery } from '../mobile/useIsMobile';
import type { PerfTier } from '../wind/perfGovernor';
import { dataAgeText, type DataRef } from '../dataAge';
import { fireSourceFor, fireIncidentSourcesFor, hasOfficialFireConfirmation } from '../officialSources';
import {
  FireIcon, IcoFirePlay, IcoFirePause, IcoBarMap, IcoBarLayers, IcoBarFire, IcoBarTime,
} from './fireIcons';
import {
  FireLayerCard, FIRE_LAYER_INFO, HOTSPOTS_DEGRADED_INFO, dangerInfoFor, soilDrynessInfoFor,
} from './FireLayerCard';
import { BR_LAYER, BR_GROUP_COLOR, dangerCardMeta, DANGER_VIEW_CODE, FWI_STEPS } from './brandradarMeta';
import { recordTitle, type PanelSort } from './FireFootprintPanel';
import { ageText } from '../dataAge';
import './fireDeck.css';

/** Mobil: die vier Bereiche der Bottom-Bar (Vorlage B4–B6). */
type MobileTab = 'map' | 'layers' | 'fires' | 'time';
/** BH3: stabile leere Referenzen für die Karte im Historie-Modus (setData vergleicht Referenzen, V-220). */
const EMPTY_ZONES: FireZone[] = [];
const EMPTY_CLUSTER_LIST: FireCluster[] = [];

/** Ladezustand je Layer — „Fehler" schaltet den Layer AB und verlinkt die
 *  amtliche Quelle, statt eine leere Fläche zu zeigen (Gate-Punkt WB-T2-6). */
type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; ref: DataRef | null; note?: string }
  | { kind: 'error'; message: string };


/**
 * Welche Ausbau-Layer sind tatsächlich gebaut?
 *
 * Die zwei EDO-Layer (`fireDrought`, `fireVegetation`) standen hier als
 * „sichtbar und deaktiviert" (ungültiges EDO-CORS, `audit/waldbrand-ausbau.md`
 * §1) und sind am 2026-08-22 auf Jans Auftrag zurückgezogen — seitdem ist die
 * Ausbaustufe 2 vollständig gebaut und diese Menge deckungsgleich mit
 * `FIRE_EXTENDED_LAYERS`.
 */
const BUILT_EXTENDED = new Set<FireLayerId>(['fireFuel', 'fireBurnt', 'fireContext']);

/** Ist der Layer überhaupt schaltbar? MVP und die Wetterkarten-Layer (WW1)
 *  immer, Ausbaustufe 2 nur, wo die Quelle wirklich erreichbar ist. */
const isBuilt = (id: FireLayerId) =>
  FIRE_MVP_LAYERS.includes(id) || FIRE_WEATHER_MAP_LAYERS.includes(id) || FIRE_FOOTPRINT_LAYERS.includes(id)
  || FIRE_ANOMALY_LAYERS.includes(id) || BUILT_EXTENDED.has(id);

interface Props {
  onBack: () => void;
  onOpenFeature?: (id: RailFeature) => void;
  // --- Router (RT1), additiv: Sub-Route `/waldbrand/<view>` als Preset; der
  // vollständige Zustand bleibt im Fragment `#wb=` (Codec unangetastet). ---
  initialView?: FireRouteView | null;
  /** Sub-Route von außen (nur Zurück/Vorwärts). */
  routeView?: FireRouteView | null;
  /** Zustand ⇒ passender Pfad (erster Lauf = replace, danach push). */
  onViewChange?: (view: FireRouteView, initial: boolean) => void;
}

export default function FirePage({ onBack, onOpenFeature, initialView, routeView, onViewChange }: Props) {
  const initial = typeof window !== 'undefined' ? decodeFireState(window.location.hash) : null;
  // RT1: das Preset der Sub-Route greift NUR ohne Hash — der Hash ist der ganze Zustand und gewinnt.
  const routePreset = !initial && initialView ? applyFireView(initialView, new Set<FireLayerId>(['fireDanger', 'fireHotspots'])) : null;

  const [active, setActive] = useState<Set<FireLayerId>>(
    () => new Set(initial?.layers.length ? initial.layers : routePreset ? routePreset.layers : ['fireDanger', 'fireHotspots']),
  );
  const [time, setTime] = useState<FireTimeState>(() => {
    const base = defaultFireTimeState();
    if (!initial) return base;
    // WF3: `h` im Hash ⇒ Stundenachse (auch bei 0); ohne `h` die Tagesachse wie bisher.
    const hourly = typeof initial.hour === 'number';
    return {
      ...base, day: initial.day, windowH: initial.windowH,
      hour: hourly ? (initial.hour as number) : 0, unit: hourly ? 'hours' : 'days',
    };
  });
  const [basemap, setBasemap] = useState<FireBasemap>('streets');
  const [openInfo, setOpenInfo] = useState<FireLayerId | null>(null);
  // E3: Sub-Ansicht des EU-Index; E2: eingeblendete Zeitkörbe der Brandflächen.
  const [dangerView, setDangerView] = useState<DangerView>(initial?.dangerView ?? DEFAULT_DANGER_VIEW);
  const [burntBuckets, setBurntBuckets] = useState<Set<BurntBucket>>(
    () => new Set(initial?.burntBuckets ?? DEFAULT_BURNT_BUCKETS),
  );
  /** BF4: Tagesschritt der 7-Tage-Historie. `null` = alle sieben Tage. */
  const [burntDay, setBurntDay] = useState<number | null>(initial?.burntDay ?? null);
  /** WT1: Tiefe der Bodentrockenheit — Muster wie der Modus des Schnee-Layers. */
  const [soilMode, setSoilMode] = useState<SoilDrynessMode>(initial?.soilMode ?? DEFAULT_SOIL_MODE);
  // Hover/Fokus auf einer Dock-Zeile blendet den Steckbrief rechts als
  // „Vorschau"-Karte ein (Wetterkarten-Muster, Phase KD-R) — nur Desktop.
  const [layerHover, setLayerHover] = useState<FireLayerId | null>(null);

  // --- Daten ---------------------------------------------------------------
  const [hotspots, setHotspots] = useState<GeoJSON.FeatureCollection | null>(null);
  const [hotspotFootprints, setHotspotFootprints] = useState<GeoJSON.FeatureCollection | null>(null);
  const [hotspotProvider, setHotspotProvider] = useState<'firms' | 'gwis'>('firms');
  const [relhum, setRelhum] = useState<IconD2Relhum | null>(null);
  /** WT1 — Bodentrockenheit (ICON-D2 smi) der gewählten Tiefe. */
  const [smi, setSmi] = useState<IconD2Smi | null>(null);
  const [burntSeason, setBurntSeason] = useState<BurntRun | null>(null);
  const [burntArchive, setBurntArchive] = useState<BurntRun | null>(null);
  /** Flächen der letzten 7 Tage — Bestätigung der Detektionen (E1/E2). */
  const [burntWeek, setBurntWeek] = useState<BurntPolygon[]>([]);
  /** Die FIRMS-Zeilen des aktuellen Laufs — für die Zählung „in kartierter Fläche". */
  const [hotspotRows, setHotspotRows] = useState<readonly FirmsRow[]>([]);
  /** BA3: das Detektionsraster des angezeigten Fensters (Worker, nach dem Paint). */
  const [fireZones, setFireZones] = useState<readonly FireZone[]>([]);
  /** BC1: die Brand-Cluster desselben Fensters — aus demselben Worker-Aufruf. */
  const [clusters, setClusters] = useState<readonly FireCluster[]>([]);
  /** BC1: Landesumrisse für die Spalte „Land" (lazy, nach dem ersten Paint). */
  const [countryRings, setCountryRings] = useState<CountryRings | null>(null);
  /** BC1: markierter Cluster + der Auslöser, der die Karte hinfahren lässt. */
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  /** BC1: welche Seite das Readout zeigt — „Layer" ist der Bestand. */
  const [readoutTab, setReadoutTab] = useState<'layers' | 'fires' | 'anomalies'>(
    // BP5: `fp=1` aus einem alten Permalink hiess „Liste zeigen" — die Liste ist
    // jetzt der Reiter „Braende". Die Bedeutung bleibt, nur ihr Ort hat sich geaendert.
    // TA4: `ta=1` öffnet den dritten Reiter „Thermalanomalien"; er gewinnt gegen `fp`.
    initial?.anomalyPanel ? 'anomalies' : initial?.footprintPanel ? 'fires' : routePreset ? routePreset.readoutTab : 'layers',
  );
  /** Mobil: der Bereich der Bottom-Bar — Karte · Layer · Brände · Zeit. Die Thermalanomalien sind dort ein Segment in „Brände". */
  const [mobileTab, setMobileTab] = useState<MobileTab>(initial?.footprintPanel || initial?.anomalyPanel || routePreset?.readoutTab === 'fires' ? 'fires' : 'map');
  /** TA4: markierter Standort (auch ohne Eintrag im Fenster) — die Karte hebt ihn hervor. */
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  /**
   * BH3 — Historie-Fenster (Monat/Saison) statt des Live-Fensters. `null` = Live (24 h / 7 d,
   * unverändert). Im Historie-Modus bekommt die Karte KEINE Live-Daten (Hotspots, Raster, Hüllen,
   * Flächen, Pfeile — alles leer), sondern die Ereignispunkte der statischen Datei; die
   * Standort-Rauten bleiben, sie sind zeitlos. Kill-Switch `?bh=0` ⇒ die Fenster gibt es nicht.
   */
  const [history, setHistory] = useState<HistoryWindowKind | null>(() => (historyEnabled() && initial?.historyWindow) || null);
  const [historyLoad, setHistoryLoad] = useState<HistoryLoad>({ kind: 'idle' });
  const [selectedHistory, setSelectedHistory] = useState<string | null>(null);
  useEffect(() => {
    if (!history) { setHistoryLoad({ kind: 'idle' }); setSelectedHistory(null); return; }
    let alive = true;
    setHistoryLoad({ kind: 'loading' });
    void loadHistoryIndex(history).then((res) => { if (alive) setHistoryLoad(res); });
    return () => { alive = false; };
  }, [history]);
  const historyFc = useMemo(
    () => (history && historyLoad.kind === 'ok' ? historyToGeoJSON(historyLoad.entries) : null),
    [history, historyLoad],
  );
  const historyEntriesById = useMemo(
    () => (historyLoad.kind === 'ok' ? new Map(historyLoad.entries.map((e) => [e.id, e])) : null),
    [historyLoad],
  );
  const selectHistory = useCallback((id: string) => {
    const e = historyEntriesById?.get(id);
    if (!e) return;
    setSelectedHistory(id);
    setSelectedFootprint(null); setSelectedSite(null);
    // Ein Punkt hat keine Fläche — ein kleiner Kasten um ihn, damit der Zoom nicht ins Leere fährt.
    const d = 0.08;
    setFocusBbox([e.lon - d, e.lat - d, e.lon + d, e.lat + d]);
    setFocusNonce((n) => n + 1);
    setReadoutTab('fires'); setMobileTab('fires');
  }, [historyEntriesById]);
  // --- BP2: das Brandflächen-Panel (Registry) ------------------------------
  /** Panel links offen? (Permalink-Feld `fp`; unabhängig vom Layer-Schalter.) */
  const [fpSort, setFpSort] = useState<PanelSort>('area');
  const [fpFilter, setFpFilter] = useState<RecordFilter>(DEFAULT_FILTER);
  /** Umfang der EFFIS-Einträge: Historie (7 d) oder die ganze Saison (nur wenn geladen). */
  const [fpEffisScope, setFpEffisScope] = useState<EffisScope>('week');
  const [hoverFootprint, setHoverFootprint] = useState<string | null>(null);
  const [selectedFootprint, setSelectedFootprint] = useState<string | null>(null);
  /** Ziel des nächsten Fokus-Zooms — die Registry gibt ihre Bbox mit (eine Kamera-Logik in FireMap). */
  const [focusBbox, setFocusBbox] = useState<[number, number, number, number] | null>(null);
  const [shownFootprints, setShownFootprints] = useState(CLUSTER_PAGE);
  /** BP3: das statische Ortsverzeichnis — einmal, lazy, sobald das Panel sichtbar ist. */
  const [places, setPlaces] = useState<PlaceIndex | null>(null);
  // AF4: Kalibriermodell (statisch, per Commit-back) — nur wenn nicht abgeschaltet (`?afEst=0`).
  const [areaModel, setAreaModel] = useState<AreaModel | null>(null);
  /**
   * BC1: wie viele Zeilen im DOM stehen.
   *
   * Am Prod-Build gemessen: 1 111 Zeilen (7-Tage-Fenster) kosten vom Klick bis
   * zur Zeile im DOM **253 ms** — über der 200-ms-Grenze, und das auf dem
   * Desktop. Die Kosten stecken im Erzeugen von ~9 000 Knoten, nicht im
   * Zeichnen: `content-visibility: auto` machte es mit 303–366 ms sogar
   * schlechter. Deshalb ein **ausgesprochener** Deckel statt einer stillen
   * Kürzung: die Kopfzeile nennt die volle Zahl, die Liste sagt, wie viele davon
   * sie zeigt, und ein Knopf holt die nächsten.
   */
  /** GWBA1: Ereignisse des Laufs (A4-Bewertung im Steckbrief), EMS-Aktivierungen
   *  (A2, still geladen, nie blockierend) und GeoSphere-Kontext je AT-Ereignis (A3). */
  const [fireEvents, setFireEvents] = useState<readonly FireEvent[]>([]);
  const [emsActs, setEmsActs] = useState<readonly EmsActivation[]>([]);
  const [atContexts, setAtContexts] = useState<ReadonlyMap<string, AtWarnContext>>(new Map());
  /** A4: statische CORINE-Maske (25 KB PNG, einmal lazy im Leerlauf) — Plausibilität, nie Ausschluss. */
  const [clcMask, setClcMask] = useState<ClcMask | null>(null);
  /** TA3: die Standortliste persistenter Wärmequellen (≈ 40 KB gzip, einmal lazy im Leerlauf). */
  const [thermalSites, setThermalSites] = useState<ThermalSitesIndex | null>(null);
  const [load, setLoad] = useState<Partial<Record<FireLayerId, LoadState>>>({});
  const setLayerLoad = useCallback((id: FireLayerId, s: LoadState) => {
    setLoad((prev) => ({ ...prev, [id]: s }));
  }, []);

  const activeList = useMemo(() => [...active], [active]);
  const maxDay = sharedMaxDay(activeList);
  /**
   * WF3 — EINE Achse, zwei Einheiten: erzwungen (Stundenlayer) > gewählt > Tage.
   * `pos`/`sliderMax` sind der Reglerstand und -horizont in der geltenden Einheit;
   * `dayForLayers` ist der Tagesschritt, den die Tages-Layer (EU-Index, Boden)
   * zeigen — auf der Stundenachse der Kalendertag von „jetzt + h". Die amtliche
   * Stufe gehört seit 2026-08-19 NICHT mehr dazu: sie ist `instant` und zeigt
   * immer heute.
   */
  const unit = timeUnit(time, activeList);
  const hourly = unit === 'hours';
  const maxHour = sharedMaxHour(activeList);
  const sliderMax = hourly ? maxHour : maxDay;
  const pos = hourly ? time.hour : time.day;
  const showSlider = hasTimeSlider(activeList, unit);
  /** Der Einheiten-Umschalter: nur, wenn Stundenframes da sind und nichts die Einheit erzwingt. */
  const unitChoice = hourlyAvailable(activeList) && !hourlyForced(activeList);
  const windows = windowChoices(activeList);
  const lagging = laggingLayers(activeList, pos, unit);
  const dailyOnly = hourly ? dailyOnlyLayers(activeList, time.hour) : [];
  const presetId = activeFirePresetId(activeList);
  const nowMs = Date.now();
  const dayForLayers = hourly ? dayOfHour(time.hour, nowMs) : time.day;

  // Der Zustand wird nach JEDER Layer-Änderung nachgezogen — sonst steht der
  // Regler auf einem Tag, den ein neu zugeschalteter Layer nicht liefert.
  useEffect(() => {
    setTime((t) => reconcileFireTime(t, activeList));
  }, [activeList]);

  // --- Laden: strikt LAZY, erst beim Aktivieren des jeweiligen Layers -------
  // Das ist keine Optimierung, sondern eine Auflage: `geo.admin.ch` verlangt
  // Fair Use (ein Abruf je Sitzung).
  //
  // 2026-08-19: Der Ladeweg der amtlichen Stufe (BAFU-Gefahrenstufen + die 484
  // DWD-Stationsdateien) ist mit dem Layer entfallen, und mit dem Rückzug der
  // Feuerverbote (gleicher Tag) auch der BAFU-Abruf der Präventionsmassnahmen.
  // Die Quellmodule `sources/dwdFireIndex.ts` und `sources/bafuFire.ts` bleiben
  // im Repo — sie sind verifiziert und wiederverwendbar —, werden aber von der
  // App nicht mehr aufgerufen und landen damit auch nicht mehr im Bundle.

  /**
   * Hotspots: **NASA FIRMS zuerst, GWIS als Rückfallebene** (Phase F1).
   *
   * FIRMS führt den vollen Attributsatz (`frp`, `confidence`, `scan`/`track`,
   * `daynight`, Satellit) und ist damit die einzige der beiden Quellen, aus der
   * sich Intensität und Verlässlichkeit einer Detektion darstellen lassen. Der
   * Zugriff läuft über die Edge Function `/_firms/*`, die den MAP_KEY
   * serverseitig einsetzt (`docs/DATA_SOURCES.md` §W.2.1).
   *
   * Fällt dieser Pfad aus — Proxy nicht konfiguriert (503), Transaktionslimit,
   * NASA nicht erreichbar —, wird auf den keylosen GWIS-Fensterlayer
   * zurückgefallen. Das ist **exakt das bisherige Verhalten**: Punkte ohne
   * Intensität. Der Layer sagt das dann auch (`degradedReason`), statt eine
   * ärmere Anzeige wie die volle aussehen zu lassen.
   */
  useEffect(() => {
    // BP2: die Registry braucht dieselben Detektionen — der Abruf läuft, sobald
    // EINER der beiden Layer an ist; der Ladezustand steht an beiden Zeilen.
    if (!active.has('fireHotspots') && !active.has('fireFootprints')) return;
    const ac = new AbortController();
    const setDetLoad = (st: LoadState) => { setLayerLoad('fireHotspots', st); setLayerLoad('fireFootprints', st); };
    setDetLoad({ kind: 'loading' });
    void (async () => {
      let run: HotspotRun;
      // E1/E2 — die Bestätigung durch die EFFIS-Kartierung: die Brandflächen der
      // letzten sieben Tage (~100 KB in DACH), parallel zu FIRMS. Das ist der
      // EINE zusätzliche Abruf dieser Phase (V-225). Er ist Beiwerk: Scheitert
      // er, fehlen nur Bestätigungszeile und Gegenprobe — der Layer selbst
      // meldet keinen Fehler, denn seine Daten sind vollständig.
      const weekP: Promise<BurntPolygon[]> = fetchBurntWeek(ac.signal)
        .then((polys) => { if (!ac.signal.aborted) setBurntWeek(polys); return polys; })
        .catch(() => { if (!ac.signal.aborted) setBurntWeek([]); return []; });
      // A2 (GWBA1): Copernicus-EMS-Aktivierungen als Abzeichen — interne API,
      // liefert bei jedem Fehler `[]`, blockiert nichts, zeigt keinen Ladezustand.
      void fetchEmsActivations(ac.signal).then((acts) => { if (!ac.signal.aborted) setEmsActs(acts); });
      let builtEvents: FireEvent[] = [];
      let at = Date.now();
      try {
        // V-222 (Jan, 2026-08-15): ERST laden und rendern — ohne Einordnung.
        // Bis die Klassifikation vorliegt, behauptet kein Punkt etwas (kein
        // Grau). Die Einordnung folgt danach im Worker (s. u.).
        at = Date.now();
        run = await fetchFirmsHotspots(time.windowH, ac.signal, at);
      } catch (primary) {
        if (ac.signal.aborted) return;
        try {
          const g = await fetchHotspots(time.windowH, ac.signal);
          run = {
            points: g.features,
            footprints: { type: 'FeatureCollection', features: [] },
            count: g.count,
            latestAcqMs: g.latestAcqMs,
            oldestAcqMs: g.oldestAcqMs,
            windowH: g.windowH,
            truncated: g.truncated,
            skipped: 0,
            provider: 'gwis',
            degradedReason: (primary as Error).message,
            // GWIS liefert keine Zeilen im FIRMS-Format — ohne sie keine
            // Ereignisbildung. Das ist ehrlich: im Notbetrieb gibt es die
            // Einordnung nicht, und der Steckbrief behauptet sie auch nicht.
            rows: [],
            staticCount: 0,
            // Im Notbetrieb gibt es keine FIRMS-Einzelabrufe mehr, über die man
            // etwas aussagen könnte — der Grund steht in `degradedReason`.
            failedFetches: 0,
            plannedFetches: 0,
          };
        } catch (fallback) {
          if (ac.signal.aborted) return;
          setHotspots(null);
          setHotspotFootprints(null);
          setDetLoad({ kind: 'error', message: (fallback as Error).message });
          return;
        }
      }
      if (ac.signal.aborted) return;
      setHotspots(run.points);
      setHotspotFootprints(run.footprints);
      setHotspotProvider(run.provider);
      setHotspotRows(run.rows);
      setFireEvents(builtEvents);
      // BA3: das Detektionsraster gehört zum ANGEZEIGTEN Fenster, nicht zu den
      // 7 Tagen der Einordnung — sonst zeigte die 24-h-Ansicht die Fläche einer
      // Woche. Geleert wird beim FENSTERWECHSEL (eigener Effekt weiter unten),
      // nicht hier: dieser Effekt läuft auch, wenn ein ganz anderer Layer
      // geschaltet wird, und das Raster soll dabei nicht flackern.
      // Der GWIS-Notbetrieb liefert keine `rows` und damit kein Raster — GWIS
      // führt weder `scan` noch `track` (V-199).
      // BC1: die Brand-Cluster hängen an derselben Eingabe und teilen deshalb
      // Aufruf und Lebenszyklus mit dem Raster (eine Worker-Nachricht, nicht zwei).
      if (run.rows.length === 0) { setFireZones([]); setClusters([]); }
      if (run.rows.length > 0) {
        const zoneRows = run.rows;
        const idleZones = (cb: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(cb) : setTimeout(cb, 200));
        idleZones(() => {
          void computeZonesAndClusters(zoneRows, undefined, ac.signal)
            .then((r) => {
              if (ac.signal.aborted) return;
              setFireZones(r.zones);
              setClusters(r.clusters);
            })
            .catch(() => { /* Beiwerk: ohne Raster bleiben Punkte und Footprints */ });
        });
      }
      // V-222: Klassifikation NACH dem ersten Paint, im Leerlauf, im Worker.
      // Im 24-h-Fenster werden dafür die 7 Tage nachgeladen — ausschließlich
      // zur Einordnung (≥ 5 verschiedene Tage), nie zur Anzeige. 42 Transaktionen
      // je Cachefenster hinter dem Edge-Cache, geteilt, nutzerzahl-unabhängig.
      if (run.provider === 'firms' && run.rows.length > 0) {
        const displayed = run;
        const idle = (cb: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(cb) : setTimeout(cb, 250));
        idle(() => {
          void (async () => {
            try {
              const classRows = time.windowH >= 168
                ? displayed.rows
                : (await fetchFirmsHotspots(168, ac.signal, at)).rows;
              if (ac.signal.aborted) return;
              const cls = await classifyHotspots(classRows, at, ac.signal);
              if (ac.signal.aborted) return;
              const keys = new Set(cls.staticKeys);
              // E2: Die EFFIS-Kartierung schlägt die Ortsfest-Vermutung (Varallo):
              // sie hebt das Grau auf, macht aber NIE etwas grau.
              if (keys.size > 0) {
                const polys = await weekP;
                if (polys.length > 0) {
                  for (const r of classRows) {
                    const k = detectionKey(r);
                    if (keys.has(k) && mappedAreaFor(r, polys)) keys.delete(k);
                  }
                }
              }
              if (ac.signal.aborted) return;
              // Anwenden auf die ANGEZEIGTEN Zeilen (24 h oder 7 d) — jetzt erst grau.
              const refined = toRun(displayed.rows, displayed.windowH, at, displayed.skipped, keys,
                displayed.failedFetches, displayed.plannedFetches);
              setHotspots(refined.points);
              setHotspotFootprints(refined.footprints);
              setFireEvents(cls.events);
              // BC1: dieselbe Schlüsselmenge, die die Punkte grau macht, macht
              // die Zeile grau. Ein zweiter Cluster-Lauf ist nötig, weil erst
              // hier feststeht, was ortsfest ist — vorher behauptet die Liste
              // nichts (V-222). Beiwerk: scheitert er, bleibt die Liste ohne
              // Vorbehalt stehen, statt zu verschwinden.
              void computeFireClusters(displayed.rows, keys, undefined, ac.signal)
                .then((cl) => { if (!ac.signal.aborted) setClusters(cl); })
                .catch(() => { /* die Liste ohne Vorbehalt ist besser als keine */ });
              // A3: GeoSphere-Kontext für AT-Ereignisse — gedeckelt, still, nie Bestätigung.
              void fetchWarnContextsFor(cls.events, ac.signal)
                .then((m) => { if (!ac.signal.aborted) setAtContexts(m); })
                .catch(() => { /* still */ });
              const counted = `${displayed.count} Detektionen${displayed.truncated ? ' (Anzeige begrenzt)' : ''}`
                + (refined.staticCount > 0 ? `, davon ${refined.staticCount} ortsfest (grau)` : '')
                + (time.windowH < 168 ? ' · Einordnung aus 7 Tagen Vorgeschichte' : '')
                + (cls.where === 'main' ? ' · Einordnung im Hauptthread (kein Worker)' : '')
                // Der Teilausfall-Hinweis muss auch NACH der Einordnung stehen:
                // diese Zeile ersetzt die erste, und ohne ihn verschwände die
                // Lücke wieder aus der Anzeige (im Smoke genau so passiert).
                + (displayed.failedFetches > 0
                  ? ` · ${displayed.failedFetches} von ${displayed.plannedFetches} Abrufen ohne Antwort — die Anzeige kann Lücken haben`
                  : '');
              setDetLoad({
                kind: 'ok',
                ref: displayed.latestAcqMs != null ? { atMs: displayed.latestAcqMs, kind: 'measured' } : null,
                note: counted,
              });
            } catch {
              // Klassifikation ist Beiwerk: scheitert sie, bleibt der neutrale
              // Zustand — kein Punkt behauptet etwas, der Layer meldet keinen Fehler.
              if (!ac.signal.aborted) {
                setDetLoad((() => ({
                  kind: 'ok' as const,
                  ref: displayed.latestAcqMs != null ? { atMs: displayed.latestAcqMs, kind: 'measured' as const } : null,
                  note: `${displayed.count} Detektionen · Einordnung nicht verfügbar`,
                }))());
              }
            }
          })();
        });
      }
      // A4: die Landbedeckungsmaske nach dem ersten Paint im Leerlauf laden —
      // eine statische Datei, danach null Requests je Nachschlagen.
      if (!clcMask) {
        const idle = (cb: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(cb) : setTimeout(cb, 300));
        idle(() => { void loadClcMask().then((m) => { if (m && !ac.signal.aborted) setClcMask(m); }); });
      }
      // TA3: die Standortliste persistenter Wärmequellen — ebenso statisch, ebenso im
      // Leerlauf; ohne sie (Fehler, `?ta=0`) bleibt `anomaly` überall null.
      if (!thermalSites) {
        const idle = (cb: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(cb) : setTimeout(cb, 350));
        idle(() => { void loadThermalSites().then((s) => { if (s && !ac.signal.aborted) setThermalSites(s); }); });
      }
      // BC1: die drei Landesumrisse für die Spalte „Land" der Cluster-Liste.
      // Ebenfalls im Leerlauf, und die Karte hat sie für ihre DACH-Maske
      // ohnehin schon geholt — der Cache in `countryMask.ts` teilt den Abruf.
      // Ohne sie behauptet die Liste kein Land (sie zeigt „—"), statt zu raten.
      if (!countryRings) {
        const idle = (cb: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(cb) : setTimeout(cb, 400));
        idle(() => {
          void Promise.all((['DE', 'AT', 'CH'] as Country[]).map(
            async (c) => [c, await loadCountryRings(c)] as const,
          ))
            .then((pairs) => { if (!ac.signal.aborted) setCountryRings(new Map(pairs)); })
            .catch(() => { /* ohne Umrisse bleibt die Spalte „—" — kein Fehlerfall */ });
        });
      }
      setAtContexts(new Map());
      const counted = run.count === 0
        ? 'keine Detektion im Fenster'
        : `${run.count} Detektionen${run.truncated ? ' (Anzeige begrenzt)' : ''}`
          + (run.provider === 'firms' ? ' · Einordnung läuft …' : '');
      // Ein Teilausfall wird GESAGT: die Anzeige stimmt für die Abrufe, die
      // geantwortet haben, und kann dort Lücken haben, wo einer fehlt. Ohne
      // diesen Satz sähe eine unvollständige Liste wie eine vollständige aus.
      const partial = run.failedFetches > 0
        ? ` · ${run.failedFetches} von ${run.plannedFetches} Abrufen ohne Antwort — die Anzeige kann Lücken haben`
        : '';
      setDetLoad({
        kind: 'ok',
        ref: run.latestAcqMs != null ? { atMs: run.latestAcqMs, kind: 'measured' } : null,
        note: run.provider === 'gwis'
          ? `${counted} · Notbetrieb: NASA FIRMS nicht erreichbar, Anzeige ohne Intensität`
          : counted + partial,
      });
    })();
    return () => ac.abort();
  }, [active, time.windowH, setLayerLoad]);

  /**
   * BA3 — beim Wechsel des Rückblickfensters wird das Raster geleert, BEVOR das
   * neue gerechnet ist. Sonst zeigte die 24-h-Ansicht für einen Moment die
   * Fläche einer ganzen Woche und behauptete damit etwas Falsches. Das Leeren
   * hängt bewusst NUR am Fenster: ein Layer-Umschalter irgendwo sonst darf das
   * Raster nicht flackern lassen.
   */
  // BC1: dieselbe Regel für die Cluster-Liste — sie gilt für das ANGEZEIGTE
  // Fenster. Eine Liste aus sieben Tagen über einer 24-h-Karte wäre genau die
  // stille Falschaussage, gegen die das Leeren hier steht. Die Markierung fällt
  // mit weg: ihre Kennung gehört zum alten Fenster.
  useEffect(() => { setFireZones([]); setClusters([]); setSelectedCluster(null); }, [time.windowH]);

  /**
   * BC1 — die Liste, wie sie angezeigt wird: Cluster plus Landeszuordnung.
   * Ohne geladene Umrisse bleibt `country` `null` und die Zeile zeigt „—";
   * geraten wird nichts (die Detektionen reichen über DACH hinaus, V-221).
   */
  const clusterList = useMemo(
    () => withCountries(clusters, countryRings),
    [clusters, countryRings],
  );

  /**
   * BP5: Refs auf die Liste, weil der Karten-Rückruf weiter oben registriert
   * wird als die Registry gebaut ist. Derselbe Grund wie bei `stateRef` in
   * `FireMap` — der Handler soll nicht auf dem ersten Bestand einfrieren.
   */
  const recordsRef = useRef<readonly FireRecord[]>([]);
  const panelRecordsRef = useRef<readonly FireRecord[]>([]);

  /**
   * Auswahl von der KARTE: nur markieren. Die Karte bewegt sich nicht — man hat
   * gerade auf das geklickt, was man sieht. Damit die Markierung sichtbar wird,
   * schaltet das Readout auf die Liste; sonst wäre der Klick folgenlos.
   */
  const selectFromMap = useCallback((id: string | null) => {
    setSelectedCluster(id);
    if (!id) return;
    setReadoutTab('fires');
    // BP5: die Hülle gehört zu einer Detektionsgruppe, die Liste führt Brände.
    // Der Klick markiert deshalb den Brand, der diese Gruppe enthält — sonst
    // wäre er seit der Verschmelzung folgenlos. Frühere Kennungen zählen mit
    // (Verschmelzung mehrerer Gruppen zu einem Brand, `previousIds`).
    const rec = recordsRef.current.find(
      (r) => r.sources.cluster?.id === id || r.previousIds.includes(`fire:${id.split('@')[0]}`),
    );
    if (!rec) return;
    setSelectedFootprint(rec.id);
    const rank = panelRecordsRef.current.findIndex((r) => r.id === rec.id);
    if (rank >= 0) setShownFootprints((n) => Math.max(n, Math.ceil((rank + 1) / CLUSTER_PAGE) * CLUSTER_PAGE));
  }, []);

  /** Wie viele Detektionen liegen in einer kartierten Fläche der letzten Woche? */
  const mappedCount = useMemo(
    () => (hotspotRows.length && burntWeek.length ? countMapped(hotspotRows, burntWeek) : 0),
    [hotspotRows, burntWeek],
  );

  // Feuerwetter-Treiber (ICON-D2 relhum_2m). Lazy und progressiv: `onProgress`
  // liefert jeden fertigen Schritt, damit der nahe Horizont sofort steht statt
  // erst nach dem letzten Frame. Der Lauf wird per Verzeichnis-Scan aufgelöst
  // (kein Warm-Cron) — der erste Abruf dauert daher spürbar länger.
  useEffect(() => {
    if (!active.has('fireWeather')) return;
    const ac = new AbortController();
    setLayerLoad('fireWeather', { kind: 'loading' });
    void fetchIconD2Relhum(ac.signal, (partial) => {
      if (!ac.signal.aborted) setRelhum(partial);
    })
      .then((r) => {
        if (ac.signal.aborted) return;
        setRelhum(r);
        setLayerLoad('fireWeather', {
          kind: 'ok',
          ref: { atMs: r.runAt.getTime(), kind: 'run' },
          note: `${r.frames.length} Stundenschritte`,
        });
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setRelhum(null);
        setLayerLoad('fireWeather', { kind: 'error', message: (e as Error).message });
      });
    return () => ac.abort();
  }, [active, setLayerLoad]);

  /**
   * WT1 — Bodentrockenheit (ICON-D2 `smi`). Lazy wie alle Layer hier, und
   * zusätzlich **modus-lazy**: ein Tiefenwechsel lädt neu, weil jede Ebene eine
   * eigene Datei ist (Muster Schnee-Layer, `MapView.tsx` installSnow).
   *
   * `smi` wird nicht vom Warm-Cron gewärmt, der Lauf kommt also über den
   * Directory-Scan — der erste Abruf dauert dadurch spürbar länger. Das ist der
   * Preis dafür, das Warm-Budget nicht anzufassen (Jans Entscheidung 2026-08-14,
   * dieselbe Lage wie bei `relhum_2m`).
   */
  useEffect(() => {
    if (!active.has('fireSoilDryness')) return;
    const ac = new AbortController();
    setLayerLoad('fireSoilDryness', { kind: 'loading' });
    // Beim Tiefenwechsel den alten Stand SOFORT verwerfen: sonst zeigte die
    // Karte weiter den Oberboden, während die Zeile schon „Wurzelzone" sagt.
    setSmi((cur) => (cur && cur.mode !== soilMode ? null : cur));
    void fetchIconD2Smi(soilMode, ac.signal, (partial) => {
      if (!ac.signal.aborted) setSmi(partial);
    })
      .then((s) => {
        if (ac.signal.aborted) return;
        setSmi(s);
        // Der Anteil unter dem Welkepunkt ist die ehrliche Kurzfassung der Lage:
        // eine Zahl aus DIESEM Lauf, nicht aus einer Klimatologie.
        const pct = Math.round(s.shareBelowWilting * 100);
        setLayerLoad('fireSoilDryness', {
          kind: 'ok',
          ref: { atMs: s.runAt.getTime(), kind: 'run' },
          note: `${s.frames.length} Stundenschritte · ${SOIL_MODE_LABEL[s.mode]} `
            + `· ${pct} % der Bodenfläche am oder unter dem Welkepunkt`,
        });
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setSmi(null);
        setLayerLoad('fireSoilDryness', { kind: 'error', message: (e as Error).message });
      });
    return () => ac.abort();
  }, [active, soilMode, setLayerLoad]);

  /**
   * Zielzeit der ICON-D2-Frames (RH-Treiber, Boden) — EINE Regel für beide:
   * auf der Stundenachse „jetzt + h"; auf der Tagesachse der **Mittag (12 UTC)**
   * des gewählten Tages — 12 UTC ist die Bezugszeit der FWI-Familie, also
   * fachlich der richtige Anker und nicht bloß eine bequeme Mitte. „Jetzt" wird
   * im Memo gelesen und nur bei Regler- oder Einheitenwechsel neu bestimmt —
   * wie vor WF3, als die Mittagsrechnung im Memo stand.
   */
  const frameTargetMs = useMemo(() => (hourly
    ? Date.now() + time.hour * 3_600_000
    : Date.UTC(
      new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 12,
    ) + time.day * 86_400_000), [hourly, time.hour, time.day]);

  /**
   * Der Bodenfeuchte-Frame zur Zielzeit (nächster `validAt`, `frameAtValidTime`).
   * Zeigt der geladene Stand eine andere Tiefe als die gewählte, wird NICHTS
   * gezeigt: lieber eine leere Fläche als eine, die die falsche Tiefe behauptet.
   */
  const soil = useMemo(() => {
    if (!smi?.frames.length || smi.mode !== soilMode) return null;
    const best = frameAtValidTime(smi.frames, frameTargetMs);
    return { image: best.image, width: best.width, height: best.height, uvBounds: smi.uvBounds };
  }, [smi, soilMode, frameTargetMs]);

  /**
   * Der RH-Frame zur Zielzeit. Der Treiber läuft in **Stunden**schritten
   * (0…+24 h ab Lauf): auf der Tagesachse sieht man davon den Mittagsschritt,
   * auf der Stundenachse (WF3) jeden einzelnen.
   */
  const weather = useMemo(() => {
    if (!relhum?.frames.length) return null;
    const best = frameAtValidTime(relhum.frames, frameTargetMs);
    return {
      image: best.image, width: best.width, height: best.height, uvBounds: relhum.uvBounds,
    };
  }, [relhum, frameTargetMs]);


  /**
   * E2 — kartierte Brandflächen in zwei Zeitkörben. Jeder eingeblendete Korb
   * wird eigenständig geladen (Saison ~1,4 MB, Archiv ~4,8 MB — nur auf Wunsch).
   * Zeitspanne, Stand und Kartierschwelle kommen AUS DEN DATEN (die Lehre aus
   * V-198 — und aus V-224, wo unser eigener Deckel „2016–2018" vortäuschte).
   */
  useEffect(() => {
    if (!active.has('fireBurnt')) return;
    const ac = new AbortController();
    const wanted = [...burntBuckets];
    if (wanted.length === 0) {
      setLayerLoad('fireBurnt', { kind: 'ok', ref: null, note: 'kein Zeitkorb eingeblendet' });
      return;
    }
    setLayerLoad('fireBurnt', { kind: 'loading' });
    void (async () => {
      // BF4: `week` ist ein FILTER auf den Saison-Korb, kein eigener Abruf —
      // `week ⊂ season` ist am Bestand belegt (audit/brandflaechen-echtzeit.md §6).
      // Deshalb wird hier über die Abruf-Körbe iteriert, nicht über die Anzeige-Körbe.
      const toFetch = [...new Set(wanted.map(fetchBucketOf))];
      const runs: Partial<Record<BurntFetchBucket, BurntRun>> = {};
      const errors: string[] = [];
      await Promise.all(toFetch.map(async (b) => {
        try {
          runs[b] = await fetchBurntAreas(b, ac.signal);
        } catch (e) {
          errors.push((e as Error).message);
        }
      }));
      if (ac.signal.aborted) return;
      if (runs.season) setBurntSeason(runs.season);
      if (runs.archive) setBurntArchive(runs.archive);
      const loaded = toFetch.filter((b) => runs[b]);
      if (loaded.length === 0) {
        setLayerLoad('fireBurnt', { kind: 'error', message: errors[0] ?? 'unbekannter Fehler' });
        return;
      }
      const now = Date.now();
      const parts = loaded.map((b) => {
        const r = runs[b]!;
        return `${r.count} Flächen · ${burntPeriodLabel(r, now)}${r.truncated ? ' · Anzeige begrenzt, die JÜNGSTEN fehlen' : ''}`;
      });
      const thresholds = loaded.map((b) => burntThresholdNote(runs[b]!));
      const failed = toFetch.filter((b) => !runs[b]).map((b) => (b === 'season' ? 'Saison' : 'Archiv'));
      setLayerLoad('fireBurnt', {
        kind: 'ok',
        // Der Stand ist die jüngste Bearbeitung durch EFFIS — im Saison-Korb eine
        // echte Referenzzeit. Das Archiv allein hat keinen „Stand", nur eine Spanne.
        ref: runs.season?.lastUpdateMs != null ? { atMs: runs.season.lastUpdateMs, kind: 'measured' } : null,
        note: `${parts.join(' · ')} · ${thresholds[0]}`
          + (failed.length ? ` · ⚠ ${failed.join('/')} nicht geladen` : ''),
      });
    })();
    return () => ac.abort();
  }, [active, burntBuckets, setLayerLoad]);

  /**
   * BF4 — die Aufteilung des Saison-Korbs in „letzte 7 Tage" und „ältere".
   *
   * Die beiden Körbe **teilen** die Saison, sie überlappen sich nicht: ist
   * `week` eingeblendet, verschwinden die frischen Flächen aus dem Saison-Korb.
   * Sonst läge jede frische Fläche zweimal übereinander — derselbe Fehler, den
   * BF3 eine Ebene höher beseitigt.
   *
   * Der Tagesschritt filtert **nur** den Wochenkorb; der Saison-Rest bleibt das
   * Komplement des GANZEN Fensters, sonst tauchten die übrigen sechs Tage dort
   * wieder auf.
   */
  const burntSplit = useMemo(() => {
    const fc = burntSeason?.features ?? null;
    if (!burntSeason || !burntBuckets.has('week')) {
      return { weekFc: null, seasonFc: fc, weekCount: 0, weekUpdate: null as number | null };
    }
    const now = Date.now();
    const windowIds = historyIds(burntSeason.polygons, now, null);
    const shownIds = burntDay == null ? windowIds : historyIds(burntSeason.polygons, now, burntDay);
    return {
      weekFc: filterFeaturesById(fc, shownIds, true),
      seasonFc: filterFeaturesById(fc, windowIds, false),
      weekCount: shownIds.size,
      weekUpdate: latestUpdateMs(burntSeason.polygons, shownIds),
    };
  }, [burntSeason, burntBuckets, burntDay]);

  /** Polygon-Modell beider Körbe, per `id` — fürs Flächen-Popup der Karte. */
  const burntLookup = useMemo(() => {
    const m = new Map<string, BurntPolygon>();
    for (const r of [burntArchive, burntSeason]) if (r) for (const p of r.polygons) m.set(p.id, p);
    return m;
  }, [burntSeason, burntArchive]);

  /**
   * BF3 — **Ersetzung statt Addition.** Wo eine kartierte Fläche denselben Brand
   * zeigt, verschwindet das Detektionsraster; zwei Umrisse liest man als zwei
   * Feuer.
   *
   * Übergeben werden nur die Flächen, die **wirklich gezeichnet werden** — ist
   * der Brandflächen-Layer aus oder sein Korb abgewählt, ersetzt nichts etwas,
   * und das Raster bleibt die einzige Form. Nichts verschwindet ohne Ersatz.
   *
   * Der Filter wirkt an EINER Stelle und deckt damit alles ab: Karte, Klick auf
   * die Fläche und die Rasterzeile im Detektions-Steckbrief lesen alle aus
   * derselben Liste.
   */
  const drawnBurntPolys = useMemo<BurntPolygon[]>(() => {
    if (!active.has('fireBurnt')) return [];
    const out: BurntPolygon[] = [];
    if (burntSeason && (burntBuckets.has('season') || burntBuckets.has('week'))) out.push(...burntSeason.polygons);
    if (burntArchive && burntBuckets.has('archive')) out.push(...burntArchive.polygons);
    return out;
  }, [active, burntBuckets, burntSeason, burntArchive]);

  const reconciled = useMemo(
    () => reconcileZones(fireZones, drawnBurntPolys),
    [fireZones, drawnBurntPolys],
  );

  // --- BP2: die Brand-Registry -----------------------------------------------
  /**
   * Kartierte Flächen, gegen die die Registry abgleicht: die Wochenflächen der
   * Bestätigung (immer da, sobald Detektionen laufen, V-225) plus der
   * Saison-Korb, falls geladen — UNABHÄNGIG davon, ob der Kartierungs-Layer
   * gerade an ist. Das Panel soll „kartiert" sagen können, auch wenn die
   * Landbedeckungsflächen ausgeblendet sind.
   */
  const registryPolys = useMemo<BurntPolygon[]>(() => {
    const m = new Map<string, BurntPolygon>();
    for (const p of burntWeek) m.set(p.id, p);
    if (burntSeason) for (const p of burntSeason.polygons) m.set(p.id, p);
    return [...m.values()];
  }, [burntWeek, burntSeason]);
  const registryReconciled = useMemo(
    () => reconcileZones(fireZones, registryPolys),
    [fireZones, registryPolys],
  );
  // BP3: Ortsverzeichnis laden, sobald die Liste irgendwo sichtbar wird (Overlay
  // oder Sheet-Segment). Fehlschlag ⇒ Orte bleiben „—" mit Grund; kein Fehlerlayer.
  const wantPlaces = readoutTab === 'fires' || mobileTab === 'fires';
  useEffect(() => {
    if (!wantPlaces || places) return;
    const ac = new AbortController();
    void loadPlaces().then((idx) => { if (!ac.signal.aborted) setPlaces(idx); }).catch(() => { /* still: „—" */ });
    return () => ac.abort();
  }, [wantPlaces, places]);
  /**
   * Das Kalibriermodell (2,5 KB) hing bis VB3 allein am Panel-Reiter. Seit der
   * Karten-Steckbrief dieselbe Schätzung trägt, muss es auch dann geladen sein,
   * wenn nur die Karte offen ist — sonst zeigte ein Klick ins Raster weniger als
   * die Liste daneben. Das Ortsverzeichnis (324 KB) bleibt bewusst am Reiter.
   */
  const wantAreaModel = wantPlaces || active.has('fireHotspots');
  useEffect(() => {
    if (!wantAreaModel || areaModel || !areaEstEnabled()) return;
    let alive = true;
    void loadAreaModel().then((m) => { if (alive && m) setAreaModel(m); });
    return () => { alive = false; };
  }, [wantAreaModel, areaModel]);
  const prevRecordsRef = useRef<FireRecord[]>([]);
  // AF2: Index über die angezeigten Zeilen — einmal je Zeilensatz, für „kein Signal"-Einträge.
  const observationIndex = useMemo(() => (hotspotRows.length > 0 ? buildObservationIndex(hotspotRows) : null), [hotspotRows]);
  const records = useMemo<FireRecord[]>(() => {
    const now = Date.now();
    const win = fpEffisScope === 'season' && burntSeason
      ? { fromMs: 0, toMs: now + 86_400_000 }
      : historyWindow(now);
    const built = buildFireRegistry({
      clusters: clusterList, zones: fireZones, reconciled: registryReconciled, polys: registryPolys,
      effisWindow: win, emsActs, nowMs: now,
      landcoverAt: clcMask ? (lat, lon) => toAssessmentLandcover(landcoverAt(clcMask, lat, lon)) : undefined,
      // TA3: Standort-Einordnung — nur mit geladener Liste (Kill-Switch `?ta=0`).
      siteAt: thermalSites ? (lat, lon) => siteAt(thermalSites, lat, lon) : undefined,
      placeAt: places ? (lat, lon) => {
        const h = nearestPlace(places, lat, lon);
        return h ? { name: h.name, district: h.district, distanceKm: h.distanceKm } : null;
      } : undefined,
      observationAt: observationIndex ? (lat, lon, lastMs) => observationFor(observationIndex, lat, lon, lastMs) : undefined,
      // AF4: Flächenschätzung aus Merkmalsatz + Modell — nur mit geladenem Modell (Kill-Switch `?afEst=0`).
      estimateFor: areaModel ? (rec) => estimateArea(featuresOf(rec, now), areaModel) : undefined,
    });
    // Kennungen über den vorigen Lauf weiterreichen (Anker-Wanderung, Merge, Split).
    const carried = carryIds(built, prevRecordsRef.current);
    prevRecordsRef.current = carried;
    return carried;
  }, [clusterList, fireZones, registryReconciled, registryPolys, emsActs, fpEffisScope, burntSeason, clcMask, thermalSites, places, observationIndex, areaModel]);
  const recordsById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);
  /** TA4: Einträge des Fensters auf einem bekannten Standort — Zähler des Reiters. */
  const liveSiteCount = useMemo(() => records.filter((r) => r.anomaly).length, [records]);
  /** TA5: die Rauten — nur gebaut, wenn der Layer an ist (sonst `null`, die Quelle bleibt leer). */
  const anomalyFc = useMemo(
    () => (active.has('fireAnomalies') ? anomaliesToGeoJSON(thermalSites, records) : null),
    [active, thermalSites, records],
  );

  /**
   * VB3: Schätzung je Zone (`zone.id` → Schätzung) für den Karten-Steckbrief.
   * Ein Eintrag kann mehrere Zonen tragen — alle erben seine Schätzung. Einträge
   * MIT Kartierung bleiben außen vor: dort misst EFFIS, und der Steckbrief zeigt
   * die Kartierung (`audit/brandflaeche-vorlaeufig.md` §5).
   */
  const zoneEstimates = useMemo(() => {
    const m = new Map<string, AreaEstimate>();
    for (const r of records) {
      const e = r.activity?.areaEst;
      if (!e || r.sources.effis) continue;
      for (const z of r.sources.zones) m.set(z.id, e);
    }
    return m;
  }, [records]);
  const panelRecords = useMemo(() => {
    const filtered = filterRecords(records, fpFilter);
    // „Detektionen" (Vorlage) sortiert lokal nach der Zahl im Fenster — Einträge
    // ohne Detektion hinten; die Registry-Sorten bleiben unverändert.
    if (fpSort === 'hotspots') {
      return [...filtered].sort((a, b) => (b.hotspots ?? -1) - (a.hotspots ?? -1) || a.id.localeCompare(b.id));
    }
    return sortRecords(filtered, fpSort);
  }, [records, fpFilter, fpSort]);
  recordsRef.current = records;
  panelRecordsRef.current = panelRecords;
  useEffect(() => { setShownFootprints(CLUSTER_PAGE); }, [records]);
  // Fällt die Auswahl aus dem Bestand (Fensterwechsel), fällt sie ganz — kein Geist.
  useEffect(() => {
    if (selectedFootprint && !recordsById.has(selectedFootprint)) { setSelectedFootprint(null); setFocusBbox(null); }
  }, [recordsById, selectedFootprint]);
  /**
   * Die Flächen für die Karte — EINE Form je Brand. `dup` markiert, was ein
   * anderer aktiver Layer bereits zeichnet (dann nur Statuskontur):
   * EFFIS-Flächen je Kennung aus `drawnBurntPolys`, Raster/Hüllen bei aktivem
   * Hotspot-Layer. Memoisiert (V-220).
   */
  const drawnEffisIds = useMemo(() => new Set(drawnBurntPolys.map((p) => p.id)), [drawnBurntPolys]);
  const footprintFc = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!active.has('fireFootprints') || records.length === 0) return null;
    return footprintsToGeoJSON(records, {
      effis: drawnEffisIds, raster: active.has('fireHotspots'), hull: active.has('fireHotspots'),
    });
  }, [active, records, drawnEffisIds]);
  /**
   * Vertretung statt Dopplung: Zonen, die die Registry mit einer EFFIS-Fläche
   * vertritt, verschwinden aus dem Raster der Karte, sobald der Brandflächen-
   * Layer an ist — sonst lägen Raster (Hotspot-Layer, Abgleich nur gegen die
   * GEZEICHNETEN Flächen) und Registry-Fläche (Abgleich gegen alle geladenen)
   * für denselben Brand übereinander. Ist der Registry-Layer aus, bleibt alles
   * wie bisher.
   */
  const mapZones = useMemo<readonly FireZone[]>(() => {
    if (!active.has('fireFootprints')) return reconciled.estimated;
    const represented = new Set<string>();
    for (const r of records) if (r.geometry.kind === 'effis') for (const z of r.sources.zones) represented.add(z.id);
    if (represented.size === 0) return reconciled.estimated;
    return reconciled.estimated.filter((z) => !represented.has(z.id));
  }, [active, reconciled, records]);

  /** Auswahl aus der Panel-Liste: markieren, Cluster-Auswahl nullen, hinfahren. */
  const focusFootprint = useCallback((id: string) => {
    const r = recordsById.get(id);
    setSelectedFootprint(id);
    // BP5: seit die Listen EINE sind, markiert eine Brand-Auswahl auch die Hülle
    // seiner Detektionsgruppe — die Hervorhebung der früheren Cluster-Liste
    // bleibt damit erhalten, statt mit ihr zu verschwinden. Ohne Cluster (reine
    // Kartierung) wird ausdrücklich nichts markiert.
    setSelectedCluster(r?.sources.cluster?.id ?? null);
    setFocusBbox(r ? r.bbox : null);
    setFocusNonce((n) => n + 1);
  }, [recordsById]);
  /** Auswahl von der KARTE: markieren, Liste zeigen — Karte bewegt sich nicht. */
  const selectFootprintFromMap = useCallback((id: string | null) => {
    setSelectedFootprint(id);
    if (!id) { setSelectedSite(null); return; }
    const rec = recordsById.get(id);
    setSelectedCluster(rec?.sources.cluster?.id ?? null);
    // TA4: ein Eintrag, der zum Anlagenmuster passt, steht im Reiter „Thermalanomalien" —
    // der Klick führt dorthin; Abweichungen bleiben Brände.
    if (rec?.anomaly?.kind === 'site') { setSelectedSite(rec.anomaly.siteId); setReadoutTab('anomalies'); return; }
    setSelectedSite(null);
    setReadoutTab('fires');
    const rank = panelRecords.findIndex((r) => r.id === id);
    if (rank >= 0) setShownFootprints((n) => Math.max(n, Math.ceil((rank + 1) / CLUSTER_PAGE) * CLUSTER_PAGE));
  }, [panelRecords, recordsById]);
  const clearFootprint = useCallback(() => { setSelectedFootprint(null); setSelectedSite(null); setFocusBbox(null); }, []);
  /** TA5: Klick auf eine Standort-Raute — Reiter öffnen, Karte bleibt stehen. */
  const selectSiteFromMap = useCallback((siteId: string, recordId: string | null) => {
    setSelectedSite(siteId);
    if (recordId) { selectFootprintFromMap(recordId); setReadoutTab('anomalies'); return; }
    setSelectedFootprint(null); setSelectedCluster(null);
    setReadoutTab('anomalies');
  }, [selectFootprintFromMap]);
  /** TA4: Auswahl aus der Standortliste — mit Eintrag im Fenster wie ein Brand, sonst nur der Standort. */
  const focusSite = useCallback((siteId: string, recordId: string | null) => {
    setSelectedSite(siteId);
    if (recordId) { focusFootprint(recordId); return; }
    setSelectedFootprint(null); setSelectedCluster(null);
    const s = thermalSites?.sites.find((x) => x.id === siteId);
    if (s) { setFocusBbox(s.bbox); setFocusNonce((n) => n + 1); }
  }, [focusFootprint, thermalSites]);


  // Breakpoint 767 px — die Projekt-Konvention, kein Ad-hoc-Wert (CLAUDE.md).
  const isMobile = useMediaQuery('(max-width: 767px)');
  // Startwert `half` (Vorlage B4): Karte oben, Zeit-Deck und Legende im Sheet sichtbar.
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('half');
  // Eine Kartenauswahl macht die Brandliste sichtbar — sonst wäre der Klick
  // folgenlos: Desktop der Reiter „Brände", mobil der gleichnamige Bereich.
  useEffect(() => {
    if (!selectedFootprint) return;
    // TA4: Einträge mit Anlagenmuster gehören zum Reiter „Thermalanomalien".
    setReadoutTab(recordsRef.current.find((r) => r.id === selectedFootprint)?.anomaly?.kind === 'site' ? 'anomalies' : 'fires');
    if (isMobile) setMobileTab('fires');
  }, [selectedFootprint, isMobile]);

  // --- Playback (WB3) --------------------------------------------------------
  // rAF wie `NowcastRadarMap.tsx:269-279`, aber mit ganzzahliger Tagesausgabe:
  // ein Tageswechsel kostet ~20 Kacheln beim Fremdserver, Zwischentage gibt es
  // beim EU-Index gar nicht (`firePlayback.ts`, dort headless verifiziert).
  const [tier, setTier] = useState<PerfTier>('high');
  const [play, setPlay] = useState(() => defaultPlayback());
  const posRef = useRef(pos);
  // WF3: in der geltenden Einheit abspielen — Tage/s oder Stunden/s (Frames im Speicher).
  const unitsPerSecond = hourly ? hoursPerSecondForTier(tier) : play.daysPerSecond;
  const setPos = useCallback((v: number) => {
    setTime((cur) => {
      if (hourly) return cur.hour === v ? cur : { ...cur, hour: v };
      return cur.day === v ? cur : { ...cur, day: v };
    });
  }, [hourly]);

  // Geräteklasse steuert die Geschwindigkeit — dieselbe Klassifikation wie beim
  // FrameGovernor der Windpartikel, nur an einem anderen Stellrad (D-09).
  useEffect(() => {
    setPlay((p) => ({ ...p, daysPerSecond: daysPerSecondForTier(tier) }));
  }, [tier]);

  useEffect(() => {
    if (!play.playing || sliderMax <= 0) return;
    let raf = 0;
    let prev = performance.now();
    posRef.current = pos;
    const tick = (t: number) => {
      const dt = (t - prev) / 1000; prev = t;
      const r = stepPlayback(posRef.current, dt, unitsPerSecond, sliderMax);
      posRef.current = r.pos;
      setPos(r.day);
      if (r.ended) { setPlay((p) => ({ ...p, playing: false })); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `pos` bewusst NICHT in den Abhängigkeiten: sonst startet die Schleife
    // bei jedem Schrittwechsel neu, den sie selbst ausgelöst hat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play.playing, unitsPerSecond, sliderMax, setPos]);

  // Am Horizont oder ohne Regler kann nicht abgespielt werden.
  useEffect(() => {
    if (sliderMax <= 0 && play.playing) setPlay((p) => ({ ...p, playing: false }));
  }, [sliderMax, play.playing]);

  /**
   * Entprellter Tag für die WMS-Quelle.
   *
   * Beschriftung und Stationsfarben folgen dem Regler **sofort** (kostet nichts),
   * die Kachel-Quelle erst nach ~140 ms Ruhe. Ohne das wären sieben
   * Quellenwechsel — also ~140 Requests — beim Ziehen über eine Woche.
   * Während des Abspielens greift die Entprellung nicht: dort ist jeder Tag ein
   * gewollter Halt, kein Zwischenstand.
   */
  const [committedDay, setCommittedDay] = useState(dayForLayers);
  useEffect(() => {
    if (play.playing) { setCommittedDay(dayForLayers); return; }
    const id = window.setTimeout(() => setCommittedDay(dayForLayers), 140);
    return () => window.clearTimeout(id);
  }, [dayForLayers, play.playing]);

  const committedIso = useMemo(() => dayToIsoDate(committedDay, Date.now()), [committedDay]);
  const prefetchIso = useMemo(() => {
    const next = prefetchTarget(committedDay, maxDay);
    return next == null ? null : dayToIsoDate(next, Date.now());
  }, [committedDay, maxDay]);

  // Mobil scrollt die Rail waagerecht; Waldbrand ist der vorletzte Eintrag und
  // läge sonst außerhalb des sichtbaren Bereichs — der Nutzer sähe nicht, wo er
  // steht. Nur hier gelöst, nicht in `FeatureRail`: die Rail rendern sechs
  // weitere Decks, und deren Verhalten wird von dieser Phase nicht angefasst.
  useEffect(() => {
    const btn = document.querySelector<HTMLElement>('.br-rail .is-active');
    btn?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, []);

  /**
   * BC1 — die markierte Zeile in den sichtbaren Bereich holen.
   *
   * Ohne das wäre ein Klick auf eine Hülle weit unten in der Liste folgenlos
   * sichtbar: das Readout scrollt nicht von selbst, und der Nutzer sähe eine
   * unveränderte Liste. `block: 'nearest'` scrollt nur, wenn es nötig ist —
   * eine bereits sichtbare Zeile springt nicht.
   */
  useEffect(() => {
    if (!selectedFootprint || readoutTab !== 'fires') return;
    const el = document.querySelector<HTMLElement>(`.fire-fprow[data-fire="${CSS.escape(selectedFootprint)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedFootprint, readoutTab]);

  // Permalink mitführen (replaceState, damit der Zurück-Knopf nicht zumüllt).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = encodeFireState({
      location: null, layers: activeList, day: time.day, windowH: time.windowH,
      dangerView, burntBuckets: [...burntBuckets], soilMode, burntDay, footprintPanel: readoutTab === 'fires',
      anomalyPanel: readoutTab === 'anomalies',
      // WF3: `h` nur auf der Stundenachse — Links der Tagesachse bleiben byte-gleich.
      hour: hourly ? time.hour : null,
      // BH3: nur im Historie-Modus.
      historyWindow: history,
    });
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, [activeList, time.day, time.windowH, dangerView, burntBuckets, soilMode, burntDay, readoutTab, hourly, time.hour, history]);

  // Router (RT1): Zustand ⇒ Sub-Route (läuft NACH dem Hash-Schreiber, damit der
  // Wrapper den frischen Hash mitnimmt). Erster Lauf = replace (URL nachziehen).
  const viewReportedRef = useRef(false);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  useEffect(() => {
    onViewChangeRef.current?.(fireViewFromState(active, readoutTab), !viewReportedRef.current);
    viewReportedRef.current = true;
  }, [active, readoutTab]);
  // Zurück/Vorwärts: Preset der Sub-Route aus der URL übernehmen.
  useEffect(() => {
    if (!routeView) return;
    const r = applyFireView(routeView, active);
    setActive(new Set(r.layers));
    setReadoutTab(r.readoutTab);
    if (r.readoutTab === 'fires') setMobileTab('fires');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeView]);

  const toggle = useCallback((id: FireLayerId) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const applyPreset = useCallback((layers: readonly FireLayerId[]) => {
    setActive(new Set(layers));
  }, []);

  // ---- Deck-Bausteine (Brandradar Command-Deck, Vorlage references/brandradar.dc.html) ----
  //
  // Drei Viewports, EIN Bau: Desktop ≥ 1440 (B1/B2), Tablet 768–1439 (B3) und
  // Mobil < 768 (B4–B6). Die Datenpfade oben kennen die Größe nicht; hier wird
  // nur angeordnet. `isTablet` steuert die wenigen Textvarianten der Vorlage
  // (kürzere Labels, „Std." statt „Stunden"), alles Übrige ist CSS.
  const isTablet = useMediaQuery('(max-width: 1439px)');

  /**
   * Kurz-Stempel für die Sub-Zeile einer Dock-Zeile: „lädt…" / „⚠ Fehler" /
   * Datenalter. Der AUSFÜHRLICHE Fehlertext mit amtlichem Link bleibt zusätzlich
   * unter der Zeile stehen (D-04/WB-T2-6 — der Stempel ersetzt ihn nicht).
   */
  const rowStamp = (id: FireLayerId): string => {
    const st = load[id];
    if (!active.has(id) || !st || st.kind === 'idle') return '';
    if (st.kind === 'loading') return 'lädt…';
    if (st.kind === 'error') return '⚠ Fehler';
    return dataAgeText(st.ref, nowMs, nowMs);
  };

  /** Der Steckbrief eines Layers — im Notbetrieb der Hotspots die degradierte Fassung. */
  const infoFor = (id: FireLayerId) =>
    (id === 'fireHotspots' && hotspotProvider === 'gwis' ? HOTSPOTS_DEGRADED_INFO
      : id === 'fireDanger' ? dangerInfoFor(dangerView)
      : id === 'fireSoilDryness' ? soilDrynessInfoFor(soilMode)
      : FIRE_LAYER_INFO[id]);
  /** Die Vorlagen-Felder des Steckbriefs (EINHEIT/BEZUG/GRENZE/RÜCKFALL) je Layer. */
  const metaFor = (id: FireLayerId) => (id === 'fireDanger' ? dangerCardMeta(dangerView) : BR_LAYER[id]);
  /** STAND: Datenalter aus dem Ladezustand — der EU-Index nennt seinen Tag und Bezug. */
  const standFor = (id: FireLayerId): string | undefined => {
    if (id === 'fireDanger') return `Tageswert · ${dayLabel(dayForLayers, nowMs)} · Bezug 12 UTC`;
    const st = load[id];
    if (!st || st.kind === 'idle') return undefined;
    if (st.kind === 'loading') return 'lädt …';
    if (st.kind === 'error') return 'Ausfall — keine Daten';
    return dataAgeText(st.ref, nowMs, nowMs);
  };

  /** Topbar: der FIRMS-Status — live, lädt, Notbetrieb oder Ausfall. Nie „live" ohne Daten. */
  const detSt = load.fireHotspots;
  const detOn = active.has('fireHotspots') || active.has('fireFootprints');
  const firms = !detOn ? { label: 'FIRMS · aus', tone: 'off' }
    : detSt?.kind === 'loading' ? { label: 'FIRMS · lädt', tone: 'off' }
    : detSt?.kind === 'error' ? { label: 'FIRMS · Ausfall', tone: 'err' }
    : hotspotProvider === 'gwis' ? { label: 'GWIS · Notbetrieb', tone: 'warn' }
    : detSt?.kind === 'ok' ? { label: 'FIRMS LIVE', tone: 'live' }
    : { label: 'FIRMS', tone: 'off' };

  /** Kennzahlen der Detektionen: im Fenster, ortsfest (grau), in kartierter Fläche. */
  const detCount = hotspots?.features.length ?? 0;
  const staticCount = useMemo(
    () => (hotspots ? hotspots.features.filter((f) => f.properties?.stat === 1).length : 0),
    [hotspots],
  );
  const latestAge = detSt?.kind === 'ok' && detSt.ref ? ageText(Math.max(0, nowMs - detSt.ref.atMs)) : null;

  // --- Dock ------------------------------------------------------------------

  // WT1: die zwei Tiefen der Bodentrockenheit — EIN Umschalter (genau eine Tiefe).
  const soilSeg = (
    <div className="br-seg" role="group" aria-label="Tiefe der Bodentrockenheit">
      {(['topsoil', 'rootzone'] as SoilDrynessMode[]).map((m) => (
        <button
          key={m} type="button"
          className={soilMode === m ? 'is-active' : ''}
          aria-pressed={soilMode === m}
          title={SOIL_MODE_FULL_LABEL[m]}
          onClick={() => setSoilMode(m)}
        >
          {SOIL_MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );

  // E2/BF4: die drei Zeitkörbe der Brandflächen — je für sich schaltbar. Sie
  // ÜBERLAPPEN SICH NICHT: „7 Tage" nimmt der Saison ihre frischen Flächen ab.
  const BURNT_SEG: readonly { id: BurntBucket; label: string; title: string }[] = [
    { id: 'week', label: '7 Tage', title: 'Die frischesten Kartierungen — gefiltert aus der Saison, kein zusätzlicher Abruf' },
    { id: 'season', label: 'Saison', title: 'Laufende Saison, live' },
    { id: 'archive', label: 'Archiv', title: 'Frühere Saisons — rund 5 MB, nur auf Wunsch' },
  ];
  const burntSeg = (
    <>
      <div className="br-seg" role="group" aria-label="Zeitkörbe der Brandflächen">
        {BURNT_SEG.map((b) => (
          <button
            key={b.id} type="button"
            className={burntBuckets.has(b.id) ? 'is-active' : ''}
            aria-pressed={burntBuckets.has(b.id)}
            title={b.title}
            onClick={() => setBurntBuckets((prev) => {
              const next = new Set(prev);
              if (next.has(b.id)) next.delete(b.id); else next.add(b.id);
              return next;
            })}
          >
            {b.label}
          </button>
        ))}
      </div>
      {/* BF4: die eigene Zeitachse der Historie — über das BRANDDATUM. */}
      {burntBuckets.has('week') && (
        <div className="br-burnt-history">
          <label className="br-burnt-history-row">
            <span className="br-burnt-history-label">{historyDayLabel(Date.now(), burntDay)}</span>
            <input
              type="range" min={-HISTORY_DAYS} max={0} step={1}
              value={burntDay ?? -HISTORY_DAYS}
              aria-label="Branddatum innerhalb der letzten sieben Tage"
              onChange={(e) => {
                const v = Number(e.target.value);
                setBurntDay(v <= -HISTORY_DAYS ? null : v);
              }}
            />
          </label>
          <p className="br-layer-note">{historyNote(burntSplit.weekCount, Date.now(), burntDay, burntSplit.weekUpdate)}</p>
          <p className="br-layer-note is-muted">{HISTORY_LATENCY_NOTE}</p>
        </div>
      )}
    </>
  );

  /** Eine Dock-Zeile der Vorlage: Icon · Label/Sub · Switch; blockiert = Schloss, gestrichelt. */
  const layerRow = (id: FireLayerId, inSheet: boolean) => {
    const meta = BR_LAYER[id];
    const info = infoFor(id);
    const gebaut = isBuilt(id);
    const on = active.has(id);
    const stamp = rowStamp(id);
    const st = load[id];
    const stands = on && FIRE_LAYER_TIME[id] ? lagging.includes(id) : false;
    const label = !inSheet && isTablet && meta.shortLabel ? meta.shortLabel : meta.label;
    const sub = [meta.sub, stamp].filter(Boolean).join(' · ');
    // Tablet (B3): Zeilen ohne Sub-Zeile — nur blockierte nennen ihren Grund.
    const showSub = !!sub && (inSheet || !isTablet || !gebaut);
    const hasSeg = (id === 'fireSoilDryness' || id === 'fireBurnt') && on;
    return (
      <div key={id} className={`br-layerwrap${hasSeg ? ' has-seg' : ''}`} data-br={meta.color}>
        <button
          type="button"
          className={`br-layer${on ? ' is-on' : ' is-off'}${gebaut ? '' : ' is-blocked'}`}
          role="switch"
          aria-checked={on}
          aria-disabled={!gebaut}
          title={gebaut ? info.label : 'Quelle derzeit nicht abrufbar'}
          onClick={() => gebaut && toggle(id)}
          onMouseEnter={inSheet ? undefined : () => setLayerHover(id)}
          onMouseLeave={inSheet ? undefined : () => setLayerHover(null)}
          onFocus={inSheet ? undefined : () => setLayerHover(id)}
          onBlur={inSheet ? undefined : () => setLayerHover(null)}
        >
          <span className="br-layer-ic"><FireIcon layer={id} size={inSheet ? 19 : isTablet ? 14 : 15} /></span>
          <span className="br-layer-tx">
            <span className="br-layer-label">{label}</span>
            {showSub && <span className="br-layer-sub">{sub}</span>}
          </span>
          {gebaut && <span className="br-switch" aria-hidden="true"><span className="br-switch-knob" /></span>}
        </button>
        {/* Mobil: Steckbrief je Zeile auf Tipp (Hover gibt es dort nicht). */}
        {inSheet && (
          <button
            type="button" className="br-layer-info"
            aria-label={`Steckbrief ${meta.label}`}
            aria-expanded={openInfo === id}
            onClick={() => setOpenInfo((cur) => (cur === id ? null : id))}
          >
            i
          </button>
        )}
        {inSheet && openInfo === id && (
          <FireLayerCard layer={id} info={info} meta={metaFor(id)} stand={standFor(id)} compact />
        )}
        {id === 'fireSoilDryness' && on && soilSeg}
        {id === 'fireBurnt' && on && burntSeg}
        {on && stands && (
          <p className="br-layer-lag">
            {hourly ? 'gilt für jetzt — folgt dem Stundenregler nicht' : 'gilt für heute — folgt dem Tagesregler nicht'}
          </p>
        )}
        {/* WF3: Tages-Layer auf der Stundenachse — ein Tageswert für den Kalendertag von jetzt + h. */}
        {on && hourly && time.hour > 0 && dailyOnly.includes(id) && (
          <p className="br-layer-lag">
            Tageswert · gilt für {dayLabel(dayForLayers, nowMs)} — keine Stundenauflösung
          </p>
        )}
        {on && st?.kind === 'ok' && st.note && <p className="br-layer-note">{st.note}</p>}
        {/* E1/E2: die Bestätigung durch die EFFIS-Kartierung — nur, wenn es sie gibt. */}
        {on && id === 'fireHotspots' && st?.kind === 'ok' && mappedCount > 0 && (
          <p className="br-layer-note is-mapped">
            {mappedCount === 1 ? 'Eine Detektion liegt' : `${mappedCount} Detektionen liegen`} in einer von
            EFFIS kartierten Brandfläche der letzten 7 Tage (bestätigt) — Details im Klick-Steckbrief.
          </p>
        )}
        {/* GWBA1 A3: Ereignisbestätigung je Land — Deep-Links, kein Scraping. */}
        {on && id === 'fireHotspots' && st?.kind === 'ok' && (
          <p className="br-layer-note is-links">
            Einsatz-/Ereignisbestätigung selbst nachsehen:{' '}
            {(['DE', 'AT', 'CH'] as const).map((c, i) => (
              <span key={c}>
                {i > 0 ? ' · ' : ''}<b>{c}</b>{' '}
                {fireIncidentSourcesFor(c).map((src, j) => (
                  <span key={src.url}>
                    {j > 0 ? ' / ' : ''}
                    <a href={src.url} target="_blank" rel="noopener" title={src.caveat ?? src.operator}>{src.name}</a>
                  </span>
                ))}
                {c === 'AT' && ' (keine landesweite amtliche Quelle)'}
                {c === 'DE' && !hasOfficialFireConfirmation('DE') && ' (Auswertung folgt nach Freigabe)'}
              </span>
            ))}
          </p>
        )}
        {on && st?.kind === 'error' && <LayerStatus id={id} state={st} nowMs={nowMs} />}
      </div>
    );
  };

  /** Presets — Desktop in der Topbar, Tablet ebenfalls, mobil oben im Layer-Tab. */
  const presetSeg = (big: boolean) => (
    <div className={big ? 'br-presets-big' : 'br-presets'} role="group" aria-label="Preset">
      {FIRE_PRESETS.map((p) => (
        <button
          key={p.id} type="button"
          className={presetId === p.id ? 'is-active' : ''}
          aria-pressed={presetId === p.id}
          onClick={() => applyPreset(p.layers)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  /** Die fünf Layer-Gruppen — Dock (Desktop/Tablet) und Layer-Tab (mobil) teilen den Bau. */
  const dockGroups = (inSheet: boolean) => FIRE_DECK_GROUPS.map((g) => (
    <div key={g.title} className="br-group" data-br={BR_GROUP_COLOR[g.title] ?? 'stone'}>
      <div className="br-group-head">{g.title}</div>
      <div className="br-layers">
        {g.layers.map((l) => layerRow(l.id, inSheet))}
      </div>
    </div>
  ));

  // --- Karte: Overlays -----------------------------------------------------------

  /** Welcher Layer die Quellen-Pille trägt: der Index zuerst, sonst die oberste Fläche. */
  const primary: FireLayerId | null = active.has('fireDanger') ? 'fireDanger'
    : (['fireWeather', 'fireSoilDryness', 'fireFootprints', 'fireHotspots', 'fireBurnt', 'fireFuel', 'fireContext'] as FireLayerId[])
      .find((l) => active.has(l)) ?? null;
  const pillTitle = primary === 'fireDanger'
    ? (isTablet && !isMobile ? `${DANGER_VIEW_CODE[dangerView]} · GWIS ~8 km` : DANGER_VIEWS[dangerView].title)
    : primary ? BR_LAYER[primary].title : '';
  const pillSrc = primary === 'fireDanger' ? 'Copernicus EMS · GWIS (ECMWF) · ~8 km · Bezug 12 UTC'
    : primary ? BR_LAYER[primary].reference : '';
  const sourcePill = primary && (
    <div className="br-pill" data-br={BR_LAYER[primary].color} role="status">
      <span className="br-dot" aria-hidden="true" />
      <span className="br-pill-title">{pillTitle}</span>
      {isMobile
        ? <span className="br-pill-src">{primary === 'fireDanger' ? '~8 km' : ''}</span>
        : (!isTablet && <span className="br-pill-src">{pillSrc}</span>)}
    </div>
  );

  // E3: die fünf Sub-Ansichten des EU-Index — Chips auf der Karte (Vorlage).
  const viewChips = active.has('fireDanger') && (
    <div className="br-views br-chips" role="group" aria-label="Ansicht des EU-Index">
      {DANGER_VIEW_ORDER.map((v) => (
        <button
          key={v} type="button"
          className={dangerView === v ? 'is-active' : ''}
          aria-pressed={dangerView === v}
          title={DANGER_VIEWS[v].title}
          onClick={() => setDangerView(v)}
        >
          {(isTablet || isMobile) && v === 'ffmc' ? 'Zündung' : DANGER_VIEWS[v].label}
        </button>
      ))}
    </div>
  );

  /** Ehrlichkeits-Notizen der Treiber/Ausbreitung — Glass-Kästen unter den Chips. */
  const mapNotes = (
    <>
      {active.has('fireWeather') && weather && (
        <div className="br-mapnote" role="status">
          Feuerwetter-Treiber: eingefärbt ist die <strong>Trockenheit der Luft</strong>
          {' '}(je dunkler, desto trockener). Ein Treiber, kein Index — die kumulativen
          FWI-Codes sind nicht enthalten.
        </div>
      )}
    </>
  );

  const basemapSeg = (
    <div className="br-basemap" role="group" aria-label="Basiskarte">
      {(['streets', 'terrain', 'satellite'] as FireBasemap[]).map((b) => (
        <button
          key={b} type="button"
          className={basemap === b ? 'is-active' : ''}
          aria-pressed={basemap === b}
          onClick={() => setBasemap(b)}
        >
          {b === 'streets' ? 'Straßen' : b === 'terrain' ? 'Gelände' : 'Satellit'}
        </button>
      ))}
    </div>
  );
  const basemapLabel = basemap === 'streets' ? 'Straßen' : basemap === 'terrain' ? 'Gelände' : 'Satellit';

  /**
   * WF4 — die Punktkurve (Vorlage: Kästchen rechts auf der Karte): Koordinate,
   * Linie mit Stützpunkten, Stundenachse, der Pflichtsatz „Punkt (Fusion) ≠
   * Fläche (ICON-D2)". Leerzustände nennen IMMER ihren Grund.
   */

  // --- Zeit-Deck: EINE Achse, ZWEI Einheiten --------------------------------------

  /** Einheiten-Umschalter (Tage | Stunden): immer sichtbar; was nicht wählbar ist, sagt warum. */
  const unitSeg = (
    <div className="br-seg is-ink br-td-unit" role="group" aria-label="Einheit des Zeitreglers">
      {(['days', 'hours'] as const).map((u) => {
        const enabled = unitChoice || unit === u;
        const why = u === 'hours'
          ? (hourlyForced(activeList) ? 'Ein aktiver Layer erzwingt die Stundenachse' : 'Kein aktiver Layer hat Stundenframes')
          : 'Ein aktiver Layer erzwingt die Stundenachse';
        return (
          <button
            key={u} type="button"
            className={unit === u ? 'is-active' : ''}
            aria-pressed={unit === u}
            disabled={!enabled}
            title={enabled ? undefined : why}
            onClick={() => {
              if (unit === u || !enabled) return;
              setPlay((p) => (p.playing ? { ...p, playing: false } : p));
              setTime((t) => ({ ...t, unit: u }));
            }}
          >
            {u === 'days' ? 'Tage' : (isTablet || isMobile) ? 'Std.' : 'Stunden'}
          </button>
        );
      })}
    </div>
  );

  // Rückblick-Fenster (24 h / 7 d) der Detektionen — im Zeit-Deck (Vorlage).
  // BH3: dazu die Historie-Fenster Monat | Saison (statische Artefakte) — nur mit Kill-Switch an.
  const windowSeg = windows.length > 0 ? (
    <div className={`br-seg is-red br-td-window${history ? ' is-history' : ''}`} role="group" aria-label="Rückblick-Fenster">
      {windows.map((h) => (
        <button
          key={h} type="button"
          className={!history && time.windowH === h ? 'is-active' : ''}
          aria-pressed={!history && time.windowH === h}
          onClick={() => { setHistory(null); setTime((t) => ({ ...t, windowH: h })); }}
        >
          {windowLabel(h).replace('Stunden', 'h').replace('Tage', 'd')}
        </button>
      ))}
      {historyEnabled() && ([['month', 'Monat'], ['season', 'Saison']] as const).map(([k, l]) => (
        <button
          key={k} type="button"
          className={`is-history${history === k ? ' is-active' : ''}`}
          aria-pressed={history === k}
          title={k === 'month' ? 'Laufender Kalendermonat aus dem Archiv (Stand in der Liste)' : 'Laufende Saison 1.3.–31.10. aus dem Archiv (Stand in der Liste)'}
          onClick={() => { setHistory(k); setReadoutTab('fires'); }}
        >
          {l}
        </button>
      ))}
    </div>
  ) : null;

  /** Uhrzeit zu „jetzt + h" — lokal, damit sie zur Uhr des Nutzers passt. */
  const hourClock = (h: number) => new Date(nowMs + h * 3_600_000)
    .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const standText = hourly ? `${hourLabel(time.hour)} · ${hourClock(time.hour)}` : dayLabel(time.day, nowMs);
  const tickEvery = isMobile ? 3 : isTablet ? 2 : 1;
  const ticks: number[] = [];
  for (let i = 0; i <= sliderMax; i += 1) if (i === 0 || i === sliderMax || i % tickEvery === 0) ticks.push(i);

  const playBtn = (
    <button
      type="button"
      className="br-play"
      aria-label={play.playing ? 'Abspielen pausieren' : (hourly ? 'Stunden abspielen' : 'Tage abspielen')}
      aria-pressed={play.playing}
      disabled={!showSlider}
      onClick={() => setPlay((p) => ({ ...p, playing: !p.playing }))}
    >
      {play.playing ? <IcoFirePause /> : <IcoFirePlay />}
    </button>
  );

  const track = showSlider ? (
    <div className="br-track">
      <div className="br-ticks" aria-hidden="false">
        {ticks.map((i) => (
          <button
            key={i} type="button"
            className={`br-tick${i === pos ? ' is-active' : ''}`}
            onClick={() => { setPlay((p) => (p.playing ? { ...p, playing: false } : p)); setPos(i); }}
            title={i === 0 ? (hourly ? 'Auf jetzt zurücksetzen' : 'Auf heute zurücksetzen') : undefined}
          >
            {i === 0 ? (hourly ? 'JETZT' : 'HEUTE') : `+${i} ${hourly ? 'h' : 'd'}`}
          </button>
        ))}
      </div>
      <input
        type="range" min={0} max={sliderMax} step={1} value={pos}
        aria-label={hourly ? 'Stundenschritt' : 'Tagesschritt'}
        aria-valuetext={standText}
        onChange={(e) => {
          // Von Hand ziehen beendet das Abspielen — sonst kämpfen zwei Quellen um den Regler.
          setPlay((p) => (p.playing ? { ...p, playing: false } : p));
          setPos(Number(e.target.value));
        }}
        style={{ '--tl-fill': `${(pos / Math.max(sliderMax, 1)) * 100}%` } as React.CSSProperties}
      />
    </div>
  ) : (
    <p className="br-time-none">
      {unitChoice
        ? 'Die aktiven Layer zeigen auf der Tagesachse genau einen Zeitpunkt — Stundenachse wählbar.'
        : 'Die aktiven Layer zeigen genau einen Zeitpunkt — kein Regler.'}
    </p>
  );

  /** Die Legende des Zeit-Decks: alle 6 Klassen der gewählten Sub-Ansicht + Detektion/ortsfest. */
  const viewMeta = DANGER_VIEWS[dangerView];
  const legendRow = (compact: boolean) => (
    <div className="br-legend">
      <span className="br-eyebrow">{compact ? DANGER_VIEW_CODE[dangerView] : `Legende · ${DANGER_VIEW_CODE[dangerView]}`}</span>
      {active.has('fireDanger') && (compact ? (
        <span className="br-legend-compact">
          {FWI_STEPS.map((c, i) => <i key={c} style={{ background: c }} title={`${viewMeta.classes[i].name} ${viewMeta.classes[i].range}`} />)}
          <span>{viewMeta.classes[0].name} → {viewMeta.classes[5].name}</span>
        </span>
      ) : (
        <span className="br-legend-classes">
          {viewMeta.classes.map((c, i) => (
            <span key={c.name} className="br-legend-cls" title={`${c.name} ${c.range} · ${viewMeta.unit}`}>
              <i style={{ background: FWI_STEPS[i] }} />
              <span>{i === 0 || i === 5 ? `${c.name} ${c.range}` : c.name}</span>
            </span>
          ))}
        </span>
      ))}
      {!active.has('fireDanger') && <span className="br-legend-none">EU-Gefahrenindex aus — keine Klassenlegende</span>}
      {(active.has('fireHotspots') || active.has('fireFootprints')) && (
        <>
          <span className="br-legend-dot"><i style={{ background: 'var(--br-det)' }} />Detektion</span>
          <span className="br-legend-dot"><i style={{ background: 'var(--br-grey-dot)' }} />ortsfest{compact ? '' : ' (grau)'}</span>
        </>
      )}

      {/* Der Stand steht auf der Tagesachse schon im roten Tick (HEUTE / +n d);
          hier nur die Uhrzeit der Stundenachse und das Pending-„lädt …". */}
      {(hourly || committedDay !== dayForLayers) && (
        <span className="br-legend-stand">
          {standText}
          {committedDay !== dayForLayers && <span className="br-td-pending"> · lädt …</span>}
        </span>
      )}
      <span className="br-legend-derived">{compact ? 'Farben abgeleitet' : 'Farben abgeleitet — nicht amtlich'}</span>
    </div>
  );

  /** Zeit-Deck der Karte (Desktop/Tablet). Im Brände-Modus (B2) die kompakte Zeile. */
  const firesMode = !isMobile && (readoutTab === 'fires' || readoutTab === 'anomalies');
  const timeDeck = (
    <div className={`br-timedeck${firesMode ? ' is-compact' : ''}${hourly ? ' is-hourly' : ''}`}>
      <div className="br-td-row">
        {playBtn}
        {!firesMode && unitSeg}
        {track}
        {firesMode
          ? (windowSeg ?? <span className="br-td-window-text">Rückblick {windowLabel(time.windowH)}</span>)
          : windowSeg}
      </div>
      {!firesMode && legendRow(isTablet)}
    </div>
  );

  /** Mobil (B4): Zeit-Deck als Karte im Sheet — Play, Einheit, Regler; darunter RÜCKBLICK. */
  const timeCardMobile = (
    <div className="br-mcard br-mtime">
      <div className="br-td-row">
        {playBtn}
        {unitSeg}
        {track}
      </div>
      <div className="br-mtime-foot">
        <span className="br-eyebrow">Rückblick</span>
        {windowSeg ?? <span className="br-muted">Detektionen aus — kein Rückblickfenster</span>}
        {(hourly || committedDay !== dayForLayers) && (
          <span className="br-legend-stand">
            {standText}
            {committedDay !== dayForLayers && <span className="br-td-pending"> · lädt …</span>}
          </span>
        )}
      </div>
    </div>
  );

  /** Mobil (B4): Legende als Karte — Farbbalken, Endpunkte, Punkte. */
  const legendCardMobile = (
    <div className="br-mcard">
      <div className="br-mcard-head">
        <span className="br-eyebrow">Legende · {DANGER_VIEW_CODE[dangerView]}</span>
        <span className="br-legend-derived">Farben abgeleitet</span>
      </div>
      {active.has('fireDanger') ? (
        <>
          <div className="br-mbar">{FWI_STEPS.map((c) => <span key={c} style={{ background: c }} />)}</div>
          <div className="br-mbar-labels">
            <span>{viewMeta.classes[0].name} {viewMeta.classes[0].range}</span>
            <span>{viewMeta.classes[2].name}</span>
            <span>{viewMeta.classes[5].name} {viewMeta.classes[5].range}</span>
          </div>
        </>
      ) : <p className="br-legend-none">EU-Gefahrenindex aus — keine Klassenlegende</p>}
      <div className="br-mlegend-dots">
        <span className="br-legend-dot"><i style={{ background: 'var(--br-det)' }} />Detektion</span>
        <span className="br-legend-dot"><i style={{ background: 'var(--br-grey-dot)' }} />ortsfest</span>
        <span className="br-legend-dot"><i className="is-line" />Ausbreitung</span>
      </div>
      <p className="br-note">Farben abgeleitet — nicht amtlich.</p>
    </div>
  );

  // --- Readout ----------------------------------------------------------------

  const readoutLayers = FIRE_LAYER_ORDER.filter((id) => active.has(id) || layerHover === id);

  /** Kennzahl-Kacheln der Detektionen (Steckbrief + Mobile-Sheet). */
  const detTiles = (withFires: boolean) => (
    <div className="br-tiles">
      <div className="br-tile"><span className="br-tile-lbl">{withFires ? 'Detektionen' : 'Im Fenster'}</span><span className="br-tile-val">{detOn ? detCount : '—'}</span></div>
      <div className="br-tile"><span className="br-tile-lbl">Ortsfest</span><span className="br-tile-val is-grey">{detOn ? staticCount : '—'}</span></div>
      {withFires
        ? <div className="br-tile"><span className="br-tile-lbl">Brände</span><span className="br-tile-val is-red">{detOn ? records.length : '—'}</span></div>
        : <div className="br-tile"><span className="br-tile-lbl">Kartiert</span><span className="br-tile-val is-sage">{detOn ? mappedCount : '—'}</span></div>}
    </div>
  );
  const detLead = (
    <p className="br-card-lead">
      NASA FIRMS · VIIRS{time.windowH < 168 ? ' · Einordnung aus 7 Tagen Vorgeschichte' : ''}
      {latestAge ? ` · jüngste Aufnahme ${latestAge}` : ''}. Ortsfeste Quellen (Industrie, Fackeln)
      sind grau — die EFFIS-Kartierung hebt das Grau auf.
      {detSt?.kind === 'ok' && detSt.note ? ` ${detSt.note}.` : ''}
    </p>
  );

  const layerCard = (id: FireLayerId, compact: boolean) => (
    <FireLayerCard
      key={id} layer={id} preview={!active.has(id)} info={infoFor(id)} meta={metaFor(id)}
      stand={standFor(id)} compact={compact}
      tiles={id === 'fireHotspots' ? detTiles(false) : undefined}
      lead={id === 'fireHotspots' ? detLead : undefined}
      link={id === 'fireDanger' && companionView(dangerView) ? (
        <button type="button" className="br-link" onClick={() => setDangerView(companionView(dangerView)!)}>
          → {dangerView === 'fwi' ? 'Einordnung (Perzentil) öffnen' : 'Index (FWI) öffnen'}
        </button>
      ) : undefined}
    />
  );

  /** Nationale Skalen — quellenrein, NIE umgerechnet; AT-Lücke ausgewiesen. */
  const scalesCard = (compact: boolean) => (
    <div className="br-card br-scales">
      <div className="br-card-eyebrow">Nationale Skalen{compact ? '' : ' · nie umgerechnet'}</div>
      {!compact && (
        <div className="br-scales-cols">
          {(['DE', 'CH'] as const).map((k) => {
            const s = fireSource(k);
            return (
              <div key={k} className="br-scale">
                <div className="br-scale-head">{k} · {k === 'DE' ? 'DWD' : 'BAFU'}</div>
                <div className="br-scale-cov">{s.scale.length} Stufen · {s.coverage.split(' · ')[1] ?? s.coverage}</div>
                <ol>
                  {s.scale.map((st) => (
                    <li key={st.level}><i style={{ background: st.color }} aria-hidden="true" />{st.level} {st.label}</li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      )}
      <p className="br-scales-note">
        {compact ? (
          <>DE · DWD (5 Stufen) und CH · BAFU (5 Stufen) werden <strong>nie umgerechnet</strong> — „geringe Gefahr" ist DE Stufe 2, CH Stufe 1. <strong>AT hat keine offene amtliche Stufe.</strong></>
        ) : (
          <>„Geringe Gefahr" ist in DE Stufe 2 und in CH Stufe 1 — die Skalen werden nicht ineinander umgerechnet. <strong>AT hat keine offene amtliche Stufe</strong>; die Lücke wird ausgewiesen, nicht mit dem EU-Modellwert kaschiert.</>
        )}
      </p>
      <p className="br-scales-note">
        Amtliche Stufen zeigt diese Karte nicht — der EU-Wert ist ein Modellwert. Maßgeblich:{' '}
        {(['DE', 'CH', 'AT'] as const).map((c, i) => {
          const src = fireSourceFor(c);
          return (
            <span key={c}>
              {i > 0 ? ' · ' : ''}
              <a href={src.url} target="_blank" rel="noopener">{src.name}</a> ({c})
            </span>
          );
        })}. Im Winterhalbjahr ist die Waldbrandgefahr strukturell niedrig; einzelne Landesstellen
        schreiben ihre Stufen dann nicht täglich fort.
      </p>
    </div>
  );

  const sourcesLine = (compact: boolean) => (
    <p className="br-sources">● {compact ? 'GWIS · FIRMS · ICON-D2 · EFFIS · BAFU' : 'Copernicus EMS GWIS · NASA FIRMS · DWD ICON-D2 · EFFIS · BAFU · keine Tracker'}</p>
  );

  /** GeoSphere-Kontext je Brand: das nächste AT-Ereignis (≤ 10 km) — Kontext, nie Bestätigung. */
  const atContextFor = useCallback((r: FireRecord): AtWarnContext | null => {
    if (atContexts.size === 0) return null;
    let best: { d: number; ctx: AtWarnContext } | null = null;
    for (const ev of fireEvents) {
      const ctx = atContexts.get(ev.id);
      if (!ctx) continue;
      const d = Math.hypot((ev.lat - r.lat) * 111, (ev.lon - r.lon) * 111 * Math.cos((r.lat * Math.PI) / 180));
      if (d <= 10 && (!best || d < best.d)) best = { d, ctx };
    }
    return best?.ctx ?? null;
  }, [atContexts, fireEvents]);

  /** TA4: der Reiter „Thermalanomalien" — dieselbe Registry, verbunden über `anomaly.siteId`. */
  const anomalyPanel = (inSheet: boolean) => (
    <FireAnomalyPanel
      inSheet={inSheet}
      compact={isTablet}
      sites={thermalSites}
      records={records}
      nowMs={nowMs}
      windowH={time.windowH}
      selectedSiteId={selectedSite}
      onSelectSite={focusSite}
      onClearSelect={clearFootprint}
      onHover={setHoverFootprint}
      hiddenFromFires={hiddenSiteCount(records, { ...fpFilter, sites: 'hide' })}
      sitesShownInFires={fpFilter.sites === 'show'}
      onToggleSitesInFires={() => setFpFilter((f) => ({ ...f, sites: f.sites === 'hide' ? 'show' : 'hide' }))}
      onClose={() => setReadoutTab('layers')}
      disabled={!thermalSitesEnabled()}
    />
  );
  /** BH3: der Brände-Reiter im Historie-Modus — Liste aus der statischen Datei, mit Stand. */
  const historyPanel = (inSheet: boolean) => (
    <FireHistoryPanel
      inSheet={inSheet}
      compact={isTablet}
      kind={history ?? 'month'}
      load={historyLoad}
      selectedId={selectedHistory}
      onSelect={(e: HistoryIndexEntry) => selectHistory(e.id)}
      onClearSelect={() => { setSelectedHistory(null); setFocusBbox(null); }}
      onClose={() => setReadoutTab('layers')}
      onLeave={() => setHistory(null)}
    />
  );
  /** TA4 (mobil): Segment Brände | Thermalanomalien in der Seite „Brände". */
  const firesSeg = (
    <div className="br-seg is-ink br-fires-seg" role="group" aria-label="Brände oder Thermalanomalien">
      {([['fires', history ? (historyLoad.kind === 'ok' ? `Brände · ${historyLoad.file.counts.total.toLocaleString('de-DE')}` : 'Brände') : panelRecords.length > 0 ? `Brände · ${panelRecords.length}` : 'Brände'], ['anomalies', liveSiteCount > 0 ? `Thermalanomalien · ${liveSiteCount}` : 'Thermalanomalien']] as const).map(([id, label]) => (
        <button key={id} type="button" className={readoutTab === id ? 'is-active' : ''} aria-pressed={readoutTab === id} onClick={() => setReadoutTab(id)}>{label}</button>
      ))}
    </div>
  );

  const footprintPanel = (inSheet: boolean) => (
    <FireFootprintPanel
      inSheet={inSheet}
      compact={isTablet}
      records={panelRecords}
      total={records.length}
      detail={selectedFootprint ? recordsById.get(selectedFootprint) ?? null : null}
      nowMs={nowMs}
      windowH={time.windowH}
      sort={fpSort} onSort={setFpSort}
      filter={fpFilter} onFilter={setFpFilter}
      effisScope={fpEffisScope} onEffisScope={setFpEffisScope}
      shown={shownFootprints} onShowMore={() => setShownFootprints((n) => n + CLUSTER_PAGE)}
      hoverId={hoverFootprint} onHover={setHoverFootprint}
      selectedId={selectedFootprint} onSelect={focusFootprint} onClearSelect={clearFootprint}
      onEnableLayer={() => setActive((prev) => new Set([...prev, 'fireFootprints']))}
      onClose={() => setReadoutTab('layers')}

      placesLoaded={!!places}
      atContextFor={atContextFor}
      state={{
        footprintsOn: active.has('fireFootprints'),
        hotspotsOn: active.has('fireHotspots'),
        load: load.fireHotspots?.kind ?? 'idle',
        loadMessage: load.fireHotspots?.kind === 'error' ? load.fireHotspots.message : undefined,
        provider: hotspotProvider,
        detections: hotspotRows.length,
        clustersReady: hotspotRows.length === 0 || clusters.length > 0,
        detectionAgeMs: load.fireHotspots?.kind === 'ok' && load.fireHotspots.ref ? nowMs - load.fireHotspots.ref.atMs : null,
        effisUpdateMs: burntSeason?.lastUpdateMs ?? latestUpdateMs(burntWeek),
        seasonLoaded: !!burntSeason,
        effisFailed: load.fireBurnt?.kind === 'error',
      }}
    />
  );

  const readoutTabs = (
    <div className="br-tabs" role="group" aria-label="Inhalt des Readouts">
      {([
        ['layers', 'Layer'],
        // BH3: im Historie-Modus zählt der Reiter die Ereignisse der Datei, nicht die Live-Registry.
        ['fires', history ? (historyLoad.kind === 'ok' ? `Brände · ${historyLoad.file.counts.total.toLocaleString('de-DE')}` : 'Brände') : panelRecords.length > 0 ? `Brände · ${panelRecords.length}` : 'Brände'],
        // TA4: Zähler = Einträge des Fensters auf bekannten Standorten (nicht die 200+ Standorte der Liste).
        ['anomalies', liveSiteCount > 0 ? `Thermalanomalien · ${liveSiteCount}` : 'Thermalanomalien'],
      ] as const).map(([id, label]) => (
        <button
          key={id} type="button"
          className={readoutTab === id ? 'is-active' : ''}
          aria-pressed={readoutTab === id}
          onClick={() => setReadoutTab(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const readoutLayersContent = (compact: boolean) => (
    <>
      {lagging.length > 0 && (
        <p className="br-box is-lag">
          {lagging.length === 1 ? 'Ein Layer folgt' : `${lagging.length} Layer folgen`} dem
          Regler nicht und {lagging.length === 1 ? 'zeigt' : 'zeigen'} weiter den {hourly ? 'jetzigen' : 'heutigen'} Stand.
        </p>
      )}
      {readoutLayers.map((id) => layerCard(id, compact))}
      {scalesCard(compact)}
      {sourcesLine(compact)}
    </>
  );

  // --- Mobil: Bottom-Bar + Seiten --------------------------------------------------
  const openTab = (t: MobileTab) => {
    setMobileTab(t);
    // TA4: mobil ist „Thermalanomalien" ein Segment der Seite „Brände" — ein offenes Segment bleibt.
    if (t === 'fires' && readoutTab !== 'anomalies') setReadoutTab('fires');
    if (t === 'layers' || t === 'map') setReadoutTab('layers');
    if (t === 'time' || t === 'map') setSheetSnap('half');
  };
  const bottomBar = (
    <nav className="br-bar safe-pad-bottom" aria-label="Brandradar-Bereiche">
      {([
        ['map', 'Karte', <IcoBarMap key="i" />],
        ['layers', 'Layer', <IcoBarLayers key="i" />],
        ['fires', 'Brände', <IcoBarFire key="i" />],
        ['time', 'Zeit', <IcoBarTime key="i" />],
      ] as const).map(([id, label, icon]) => (
        <button
          key={id} type="button"
          className={`br-bar-btn${mobileTab === id ? ' is-active' : ''}`}
          aria-current={mobileTab === id ? 'page' : undefined}
          onClick={() => openTab(id)}
        >
          {icon}<span>{label}</span>
        </button>
      ))}
    </nav>
  );

  const sheetContent = mobileTab === 'time' ? (
    <>
      {timeCardMobile}
      {legendCardMobile}
      {lagging.length > 0 && (
        <p className="br-box is-lag">
          {lagging.length === 1 ? 'Ein Layer folgt' : `${lagging.length} Layer folgen`} dem Regler nicht.
        </p>
      )}
      {dailyOnly.length > 0 && hourly && time.hour > 0 && (
        <p className="br-note">Tages-Layer zeigen auf der Stundenachse den Tageswert für {dayLabel(dayForLayers, nowMs)}.</p>
      )}
    </>
  ) : (
    <>
      {timeCardMobile}
      {legendCardMobile}
      {detTiles(true)}

      {readoutLayers.map((id) => layerCard(id, true))}
      {scalesCard(true)}
      {sourcesLine(true)}
    </>
  );

  return (
    <div className={`fire-root${isMobile ? ' is-mobile' : ''}${firesMode ? ' is-fires' : ''}`} data-tab={mobileTab}>
      {!isMobile && (
        <FeatureRail
          active={'fire' as RailFeature}
          onOpenFeature={onOpenFeature}
          onHome={onBack}
          navClass="br-rail"
          btnClass="br-rail-btn"
          activeClass="is-active"
          spacerClass="br-rail-spacer"
        />
      )}

      <div className="fire-deck">
        {!isMobile && (
          <header className="br-topbar">
            <a className="br-brand" href="#" onClick={(e) => { e.preventDefault(); onBack(); }} aria-label="Zur Startseite">
              <img src="/buscosun-mark.svg" width={isTablet ? 24 : 26} height={isTablet ? 24 : 26} alt="" />
              <span className="br-brand-name">buscosun</span>
            </a>
            {!isTablet && <span className="br-topdiv" aria-hidden="true" />}
            {firesMode ? (
              <>
                <button type="button" className="br-link br-topback" onClick={() => setReadoutTab('layers')}>← Layer-Steckbriefe</button>
                <span className="br-topbar-sub">· Brandradar · {readoutTab === 'anomalies' ? 'Thermalanomalien' : 'Brände'}</span>
              </>
            ) : (
              <>
                {!isTablet && <span className="br-topbar-sub">Brandradar · DACH-Flächenblick</span>}
                {presetSeg(false)}
              </>
            )}
            <div className="br-topbar-right">
              {!isTablet && !firesMode && <span className="br-topbar-map">Karte: <strong>{basemapLabel}</strong></span>}
              {!firesMode && (
                <span className={`br-live is-${firms.tone}`} role="status">
                  <span className="br-live-dot" aria-hidden="true"><span /><span /></span>
                  {firms.label}
                </span>
              )}
            </div>
          </header>
        )}

        <div className="fire-body">
          {!isMobile && !firesMode && (
            <aside className="br-dock" aria-label="Layer">
              <div className="br-dock-head">
                <span className="br-eyebrow">Layer</span>
                {!isTablet && <span className="br-count">{active.size} aktiv</span>}
              </div>
              {dockGroups(false)}
            </aside>
          )}

          <main className="fire-center">
            <FireMap
              active={active} basemap={basemap} day={committedDay} isoDate={committedIso}
              hotspots={history ? null : hotspots}
              hotspotFootprints={history ? null : hotspotFootprints} hotspotProvider={hotspotProvider}
              fireZones={history ? EMPTY_ZONES : mapZones} zoneEstimates={zoneEstimates}
              clusters={history ? EMPTY_CLUSTER_LIST : clusterList} selectedClusterId={selectedCluster}
              focusNonce={focusNonce} onSelectCluster={selectFromMap}
              footprintFc={history ? null : footprintFc} hoverFootprintId={hoverFootprint} selectedFootprintId={selectedFootprint}
              anomalyFc={anomalyFc} selectedSiteId={selectedSite} onSelectSite={selectSiteFromMap}
              historyFc={historyFc} selectedHistoryId={selectedHistory} onSelectHistory={selectHistory}
              focusBbox={focusBbox} onSelectFootprint={selectFootprintFromMap}
              dangerView={dangerView}
              burntSeason={burntSplit.seasonFc} burntArchive={burntArchive?.features ?? null}
              burntWeekFc={burntSplit.weekFc}
              burntBuckets={burntBuckets} burntLookup={burntLookup} burntWeek={burntWeek}
              fireEvents={fireEvents} emsActs={emsActs} atContexts={atContexts} clcMask={clcMask}
              weather={weather} soil={soil}

              prefetchIsoDate={prefetchIso} onTier={setTier}
            />

            {/* Oben links: Quellen-Pille, Sub-Ansichten, Ehrlichkeits-Notizen. Im
                Brände-Modus (B2) stattdessen die Markierung. */}
            <div className="br-map-tl">
              {isMobile && (
                <div className="br-m-maprow">
                  <button type="button" className="br-m-brand" aria-label="Zur Startseite" onClick={onBack}>
                    <img src="/buscosun-mark.svg" width={22} height={22} alt="" />
                  </button>
                  {sourcePill}
                </div>
              )}
              {!isMobile && (firesMode ? (
                selectedFootprint && recordsById.get(selectedFootprint) && (
                  <div className="br-pill is-mark" role="status">
                    <span className="br-dot" aria-hidden="true" />
                    <span className="br-pill-title">Markiert: {recordTitle(recordsById.get(selectedFootprint)!)}</span>
                  </div>
                )
              ) : sourcePill)}
              {!firesMode && viewChips}
              {!firesMode && mapNotes}
            </div>

            {/* Oben rechts: Basemap (Desktop) — der Zoom von MapLibre sitzt per CSS darunter. */}
            {!isMobile && !firesMode && <div className="br-map-tr">{basemapSeg}</div>}


            {!isMobile && timeDeck}
          </main>

          {!isMobile && (
            <aside className="br-readout" aria-label="Steckbriefe und Brände">
              {readoutTabs}
              {readoutTab === 'fires' ? (history ? historyPanel(false) : footprintPanel(false)) : readoutTab === 'anomalies' ? anomalyPanel(false) : readoutLayersContent(isTablet)}
            </aside>
          )}

          {isMobile && (
            <>
              {mobileTab === 'layers' && (
                <section className="br-m-page" aria-label="Layer & Presets">
                  <header className="br-m-head">
                    <div>
                      <div className="br-eyebrow">Brandradar · Layer</div>
                      <h1 className="br-m-title">Layer &amp; Presets</h1>
                    </div>
                    <span className="br-count is-bordered">{active.size} aktiv</span>
                  </header>
                  <div className="br-m-scroll">
                    {presetSeg(true)}
                    {dockGroups(true)}
                    <p className="br-note">Blockierte Layer bleiben sichtbar: die Größe existiert, nur die Quelle ist nicht erreichbar.</p>
                    <div className="br-m-basemap">
                      <span className="br-eyebrow">Basiskarte</span>
                      {basemapSeg}
                    </div>
                  </div>
                </section>
              )}
              {mobileTab === 'fires' && (
                <section className="br-m-page" aria-label="Brände">
                  <header className="br-m-head">
                    <div>
                      <div className="br-eyebrow">{readoutTab === 'anomalies' ? 'Archiv 2020–2026 · ' : history ? 'Historie · ' : 'Registry · '}{history ? (history === 'month' ? 'Monat' : 'Saison') : `${time.windowH >= 168 ? '7-Tage' : '24-h'}-Fenster`}</div>
                      <h1 className="br-m-title">{readoutTab === 'anomalies' ? `Thermalanomalien${liveSiteCount > 0 ? ` · ${liveSiteCount}` : ''}` : history ? `Brände${historyLoad.kind === 'ok' ? ` · ${historyLoad.file.counts.total.toLocaleString('de-DE')}` : ''}` : `Brände${panelRecords.length > 0 ? ` · ${panelRecords.length}` : ''}`}</h1>
                    </div>
                    {readoutTab !== 'anomalies' && !history && <span className="br-muted">{Math.min(shownFootprints, panelRecords.length)} gezeigt</span>}
                  </header>
                  <div className="br-m-scroll">
                    {firesSeg}
                    {readoutTab === 'anomalies' ? anomalyPanel(true) : history ? historyPanel(true) : footprintPanel(true)}
                  </div>
                </section>
              )}
              {(mobileTab === 'map' || mobileTab === 'time') && (
                <BottomSheet
                  snap={sheetSnap}
                  onSnapChange={setSheetSnap}
                >
                  <div className="br-sheet">{sheetContent}</div>
                </BottomSheet>
              )}
              {bottomBar}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Ausführlicher Fehlerfall je Layer (WB2/WB-T2-6) — bleibt als eigener Block
 * unter der Dock-Zeile stehen; der Kurz-Stempel „⚠ Fehler" in der Zeile
 * ersetzt ihn nicht. Der Verweis muss zum LAYER passen, nicht pauschal zum
 * DWD: Die erste Fassung schickte bei ausgefallenen Satelliten-Hotspots zum
 * Waldbrandgefahrenindex — eine ganz andere Aussage, und damit ein
 * Fehlverweis in dem Moment, in dem der Nutzer ihn am ehesten befolgt.
 */
function LayerStatus(
  { id, state, nowMs }: { id: FireLayerId; state: LoadState | undefined; nowMs: number },
) {
  if (!state || state.kind === 'idle') return null;
  if (state.kind === 'loading') return <p className="fire-layer-status">lädt …</p>;

  if (state.kind === 'error') {
    const src = id === 'fireWeather' ? fireSourceFor('DE') : null;

    return (
      <p className="fire-layer-status is-error">
        Keine Daten — der Layer zeigt nichts an (nicht: keine Gefahr).{' '}
        {src
          ? <>
              <a href={src.url} target="_blank" rel="noopener">{src.name}</a> beim {src.operator}.
            </>
          : id === 'fireHotspots'
            ? <>
                Für aktive Brände gibt es in DE, AT und CH <strong>keine offene behördliche
                Echtzeitquelle</strong> — nur die Satellitendetektion, die hier gerade ausfällt.
              </>
            : <>Die europäische Quelle (Copernicus {id === 'fireBurnt' ? 'EFFIS' : 'GWIS'}) antwortet gerade nicht.</>}
      </p>
    );
  }
  return (
    <p className="fire-layer-status">
      {dataAgeText(state.ref, nowMs, nowMs)}
      {state.note ? ` · ${state.note}` : ''}
    </p>
  );
}

export { FIRE_HASH_PREFIX };
