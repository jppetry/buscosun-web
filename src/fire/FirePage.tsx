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
  FIRE_WEATHER_MAP_LAYERS, FIRE_FOOTPRINT_LAYERS, FIRE_SPREAD_LAYERS,
  activeFirePresetId, fireSource, type FireLayerId,
} from './fireModel';
import {
  defaultFireTimeState, reconcileFireTime, sharedMaxDay,
  dayLabel, windowChoices, windowLabel, laggingLayers, FIRE_LAYER_TIME, dayToIsoDate,
  // WF3: eine Achse, zwei Einheiten.
  timeUnit, sharedMaxHour, hourlyAvailable, hourlyForced, hasTimeSlider, dayOfHour, hourLabel,
  dailyOnlyLayers, HOUR_AXIS_MAX, type FireTimeState,
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
  type FireRecord, type RecordSort, type RecordFilter,
} from './footprint/fireRegistry';
import { FireFootprintPanel, type EffisScope } from './FireFootprintPanel';
import { loadPlaces, nearestPlace, type PlaceIndex } from './footprint/places';
import { featuresOf } from './activity/features';
import { areaEstEnabled, estimateArea, loadAreaModel } from './activity/estimate';
import type { AreaEstimate } from './activity/estimate';
import type { AreaModel } from './activity/calibration';
// AF2: Beobachtungsgelegenheit (regionale Aktivität) und Windabgleich — beides aus Daten, die schon da sind.
import { buildObservationIndex, observationFor } from './activity/observation';
import { sampleWindAt } from '../wind/windPointSample';
import { fetchEmsActivations, type EmsActivation } from './sources/emsActivations';
import { fetchWarnContextsFor, type AtWarnContext } from './sources/geosphereWarnContext';
import { loadClcMask, landcoverAt, toAssessmentLandcover, type ClcMask } from './clcMask';
import { fetchIconD2Relhum, type IconD2Relhum } from '../sources/iconD2Relhum';
// WF4: der stündliche ISI aus ICON-D2 (WF2-Producer) — Fläche des Forecast-Layers.
import {
  fetchIconD2FireWeather, FIRE_WEATHER_AHEAD_H, type IconD2FireWeather,
} from '../sources/iconD2FireWeather';
// WF4: die Punktkurve rechnet mit DENSELBEN Gleichungen wie die Fläche (ein Kern,
// zwei Datengrundlagen — §13 d). `pointForecast` selbst wird dynamisch geladen.
import { ffmcEquilibrium, hffmcChain, isi as isiOf } from './fwi/fwi';
import { isiClassIndex, ISI_CLASS_COLORS } from './fwi/isiRamp';
import { fetchIconD2Wind, type IconD2Wind } from '../wind/iconD2WindSource';
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
import { computeSpreadRun, type SpreadRun } from './spread/spreadRun';
import { spreadToGeoJSON } from './spread/spreadLayer';
import { FAN_CAVEAT, SPREAD_CAVEAT_SHORT, capNote } from './spread/spreadText';
import { BottomSheet, type BottomSheetSnap } from '../mobile/BottomSheet';
import { useMediaQuery } from '../mobile/useIsMobile';
import type { PerfTier } from '../wind/perfGovernor';
import { dataAgeText, type DataRef } from '../dataAge';
import { fireSourceFor, fireIncidentSourcesFor, hasOfficialFireConfirmation } from '../officialSources';
import { FireIcon, IcoFirePlay, IcoFirePause } from './fireIcons';
import {
  FireLayerCard, FIRE_LAYER_INFO, HOTSPOTS_DEGRADED_INFO, dangerInfoFor, soilDrynessInfoFor,
} from './FireLayerCard';
import './fireDeck.css';

/** Ladezustand je Layer — „Fehler" schaltet den Layer AB und verlinkt die
 *  amtliche Quelle, statt eine leere Fläche zu zeigen (Gate-Punkt WB-T2-6). */
type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; ref: DataRef | null; note?: string }
  | { kind: 'error'; message: string };

/**
 * WF4 — die Punktkurve am angeklickten Ort.
 *
 * Vier Zustände statt „Daten oder nichts": `gap` trägt einen GRUND (fehlender
 * Wind, keine Stunden im Horizont), weil eine leere Kurve sonst wie „keine
 * Ausbreitung" gelesen würde — die eine Aussage, die dieser Layer nie treffen darf.
 */
type PointCurvePoint = {
  atMs: number; hour: number; isi: number; ffmc: number; t: number; rh: number; w: number;
};
type PointCurve =
  | { kind: 'loading'; lat: number; lng: number }
  | { kind: 'error'; lat: number; lng: number; message: string }
  | { kind: 'gap'; lat: number; lng: number; country: Country; reason: string; sources: string[] }
  | {
      kind: 'ok'; lat: number; lng: number; country: Country;
      points: PointCurvePoint[]; elevation: number; sources: string[]; skipped: number;
    };

/**
 * Welche Ausbau-Layer sind tatsächlich gebaut?
 *
 * `fireDrought` und `fireVegetation` fehlen bewusst: Der EDO-Dienst sendet
 * `access-control-allow-origin` **doppelt**, was ungültiges CORS ist — MapLibre
 * scheitert daran mit `AJAXError: Failed to fetch (0)` und lädt null Kacheln.
 * In Node war davon nichts zu sehen, dort kam HTTP 200.
 *
 * Sie bleiben in der Liste **sichtbar und deaktiviert**, statt zu verschwinden:
 * Der Steckbrief nennt den Grund, und damit sieht man, dass es die Größe gibt
 * und woran es hängt (`audit/waldbrand-ausbau.md` §1). Sie wegzulassen wäre
 * bequemer und würde eine Lücke in eine Nicht-Existenz verwandeln.
 */
const BUILT_EXTENDED = new Set<FireLayerId>(['fireFuel', 'fireBurnt', 'fireContext']);

/** Ist der Layer überhaupt schaltbar? MVP und die Wetterkarten-Layer (WW1)
 *  immer, Ausbaustufe 2 nur, wo die Quelle wirklich erreichbar ist. */
const isBuilt = (id: FireLayerId) =>
  FIRE_MVP_LAYERS.includes(id) || FIRE_WEATHER_MAP_LAYERS.includes(id) || FIRE_FOOTPRINT_LAYERS.includes(id)
  || FIRE_SPREAD_LAYERS.includes(id) || BUILT_EXTENDED.has(id);

interface Props { onBack: () => void; onOpenFeature?: (id: RailFeature) => void }

export default function FirePage({ onBack, onOpenFeature }: Props) {
  const initial = typeof window !== 'undefined' ? decodeFireState(window.location.hash) : null;

  const [active, setActive] = useState<Set<FireLayerId>>(
    () => new Set(initial?.layers.length ? initial.layers : ['fireDanger', 'fireHotspots']),
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
  /** WW1 — das native ICON-D2-Windgitter, identisch zu dem der Wetterkarte. */
  const [wind, setWind] = useState<IconD2Wind | null>(null);
  /** SF1: der letzte Ausbreitungslauf — Karte und Panel lesen aus demselben Objekt. */
  const [spread, setSpread] = useState<SpreadRun | null>(null);
  /** WT1 — Bodentrockenheit (ICON-D2 smi) der gewählten Tiefe. */
  const [smi, setSmi] = useState<IconD2Smi | null>(null);
  /** WF4 — Feuerwetter stündlich: die ISI-Frames des jüngsten ICON-D2-Laufs. */
  const [fireWx, setFireWx] = useState<IconD2FireWeather | null>(null);
  /**
   * WF4 — die Punktkurve am angeklickten Ort (Punkt-Forecast der Fusion durch
   * dieselbe hFFMC-Kette). `null` = nie geklickt; `kind` sagt, was gerade gilt —
   * ein Leerzustand nennt IMMER seinen Grund, sonst läse sich „keine Kurve" wie
   * „keine Gefahr".
   */
  const [pointCurve, setPointCurve] = useState<PointCurve | null>(null);
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
  const [readoutTab, setReadoutTab] = useState<'layers' | 'fires'>(
    // BP5: `fp=1` aus einem alten Permalink hiess „Liste zeigen" — die Liste ist
    // jetzt der Reiter „Braende". Die Bedeutung bleibt, nur ihr Ort hat sich geaendert.
    initial?.footprintPanel ? 'fires' : 'layers',
  );
  // --- BP2: das Brandflächen-Panel (Registry) ------------------------------
  /** Panel links offen? (Permalink-Feld `fp`; unabhängig vom Layer-Schalter.) */
  const [fpSort, setFpSort] = useState<RecordSort>('area');
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
   * WW1 — Windpartikel (ICON-D2 u/v 10 m). Derselbe Loader, den die Wetterkarte
   * benutzt: kein neuer Transportpfad, keine zusätzliche Quelle, und der
   * Browser-Cache trägt die Bytes zwischen beiden Ansichten.
   *
   * Lazy wie alle anderen Layer hier — die ~26 GRIB-Dateien werden erst geholt,
   * wenn jemand den Wind sehen will. `onProgress` liefert jeden fertigen Schritt,
   * damit die ersten Partikel laufen, bevor der ferne Horizont da ist.
   *
   * `frames.length` als Notiz und nicht „bis +X h": der Horizont hängt am Lauf
   * und am Warm-Cron, eine fest eingetragene Zahl wäre irgendwann eine Behauptung.
   */
  useEffect(() => {
    // SF1: der Ausbreitungslayer rechnet auf DEMSELBEN Windgitter. Kein zweiter
    // Loader, keine zweite Quelle — dieselben Bytes, derselbe Browser-Cache
    // (Regel WW1: importieren statt kopieren). Dass der Layer damit ~26
    // GRIB-Dateien auslöst, auch wenn der Windlayer aus ist, steht im Ladehinweis.
    if (!active.has('fireWind') && !active.has('fireSpread')) return;
    const ac = new AbortController();
    if (active.has('fireWind')) setLayerLoad('fireWind', { kind: 'loading' });
    void fetchIconD2Wind(ac.signal, (partial) => {
      // Das Partial teilt sich das wachsende `frames`-Array mit dem Endergebnis
      // (s. fetchIconD2Wind) — eine neue Objekthülle je Fortschritt sorgt dafür,
      // dass React die Änderung überhaupt sieht.
      if (!ac.signal.aborted) setWind({ ...partial });
    })
      .then((w) => {
        if (ac.signal.aborted) return;
        setWind(w);
        setLayerLoad('fireWind', {
          kind: 'ok',
          ref: { atMs: w.runAt.getTime(), kind: 'run' },
          note: `${w.frames.length} Stundenschritte · gezeigt wird der aktuelle`,
        });
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setWind(null);
        setLayerLoad('fireWind', { kind: 'error', message: (e as Error).message });
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
   * WF4 — Feuerwetter stündlich (ISI). Lazy und progressiv wie der RH-Treiber:
   * `onProgress` liefert jeden fertigen Stundenschritt, damit die nächste Stunde
   * steht, bevor der ferne Horizont da ist — die Kette rechnet ohnehin der Reihe
   * nach. Sechs ICON-D2-Felder je Schritt (`iconD2FireWeather.ts`), Lauf per
   * Verzeichnis-Scan über `relhum_2m` (nicht gewärmt, Q11) ⇒ der erste Abruf
   * dauert spürbar länger.
   *
   * Die Notiz sagt beides: wie viele Schritte da sind UND dass es Stufe 1 ist.
   * „N Stundenschritte" allein ließe den Layer wie einen fertigen Index aussehen.
   */
  useEffect(() => {
    // SF1: die Rasterfläche ist zurückgezogen, die QUELLE bleibt — der ISI (und
    // der ISZ im G-Kanal) ist die Grundlage der Pfeile.
    if (!active.has('fireSpread')) return;
    const ac = new AbortController();
    setLayerLoad('fireSpread', { kind: 'loading' });
    void fetchIconD2FireWeather({
      signal: ac.signal,
      aheadHours: FIRE_WEATHER_AHEAD_H,
      onProgress: (partial) => {
        // Wie beim Wind teilt sich das Partial das wachsende `frames`-Array mit
        // dem Endergebnis — eine neue Objekthülle, damit React die Änderung sieht.
        if (!ac.signal.aborted) setFireWx({ ...partial });
      },
    })
      .then((r) => {
        if (ac.signal.aborted) return;
        setFireWx(r);
        // Die abschließende Notiz setzt der Ausbreitungslauf (er kennt Deckel
        // und Geländezellen) — hier bleibt nur der Lauf-Zeitstempel stehen.
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setFireWx(null);
        setLayerLoad('fireSpread', { kind: 'error', message: (e as Error).message });
      });
    return () => ac.abort();
  }, [active, setLayerLoad]);

  /**
   * WF4 — die Punktkurve: Klick auf die Karte ⇒ Punkt-Forecast der Fusion für
   * genau diese Stelle, durch dieselbe stündliche FFMC-Kette wie die Fläche.
   *
   * Drei Entscheidungen, die hier sichtbar sind:
   *  • **Dynamischer Import.** `pointForecast` zieht die halbe Fusions-Quellen-
   *    schicht nach (Stationen, MOSMIX, AROME, INCA, DEM). Statisch importiert
   *    läge das im FirePage-Chunk und würde den Waldbrand-Kaltstart bezahlen
   *    lassen, ohne dass jemand geklickt hat. Erst der Klick lädt.
   *  • **Fusion ≠ Fläche.** Der Punkt kommt aus der Fusion, die Fläche aus
   *    ICON-D2 (§13 d). Sie werden am selben Ort nicht identisch sein; die Karte
   *    sagt das, statt eine Übereinstimmung zu suggerieren.
   *  • **Kein Wind ⇒ kein ISI.** Der ISI ist Feinstoff-Feuchte MAL Wind. Fehlt
   *    der Wind in den Punktdaten, gibt es keine Kurve und einen Grund dazu —
   *    keine 0, die wie „keine Ausbreitung" aussähe.
   */
  const pointReqRef = useRef(0);
  const requestPointCurve = useCallback((lng: number, lat: number) => {
    const gen = ++pointReqRef.current;
    setPointCurve({ kind: 'loading', lat, lng });
    void (async () => {
      try {
        const [{ getPointForecast }, { pickCountry }] = await Promise.all([
          import('../pointForecast/pointForecast'),
          import('../pointForecast/clustering'),
        ]);
        const country = pickCountry(lat, lng);
        const pf = await getPointForecast({
          lat, lng, country, hours: FIRE_WEATHER_AHEAD_H + 2, includeRadarNowcast: false,
        });
        if (gen !== pointReqRef.current) return;
        const nowH = Date.now();
        // Die Stützstellen des Punkt-Forecasts sind VOLLE Stunden. Gegen
        // `Date.now()` gerundet fielen die laufende und die nächste Stunde auf
        // denselben Schritt („jetzt" zweimal, gemessen um 13:31). Bezug ist
        // deshalb der Beginn der laufenden Stunde: 13:00 ⇒ „jetzt", 14:00 ⇒ „+1".
        const hourAnchor = Math.floor(nowH / 3_600_000) * 3_600_000;
        // Nur die Stunden der Achse: jetzt … jetzt + Horizont. Die Kette braucht
        // sie lückenlos und in Reihenfolge — eine fehlende Stunde bricht sie ab.
        const rows = pf.hours
          .filter((h) => h.timestamp.getTime() >= nowH - 3_600_000)
          .slice(0, FIRE_WEATHER_AHEAD_H + 1)
          .map((h) => ({
            atMs: h.timestamp.getTime(),
            t: h.temperature,
            rh: h.relativeHumidity,
            // FWI rechnet in km/h; der Punkt-Forecast liefert m/s.
            w: h.windSpeed == null ? null : h.windSpeed * 3.6,
            r1h: h.precipitation ?? 0,
          }));
        const usable = rows.filter((r) => r.t != null && r.rh != null && r.w != null);
        if (usable.length < 2) {
          setPointCurve({
            kind: 'gap', lat, lng, country,
            reason: rows.length === 0
              ? 'Der Punkt-Forecast liefert für diese Stelle keine Stunden im Horizont.'
              : 'Dem Punkt-Forecast fehlt hier Wind oder Feuchte — der ISI ist Feinstoff-Feuchte mal Wind und wäre ohne beides keine Zahl, sondern eine Behauptung.',
            sources: pf.sourcesAvailable,
          });
          return;
        }
        const start = ffmcEquilibrium(usable[0].t as number, usable[0].rh as number);
        const chain = hffmcChain(start, usable.map((r) => ({
          t: r.t as number, rh: r.rh as number, w: r.w as number, r1h: r.r1h,
        })));
        const points = usable.map((r, i) => ({
          atMs: r.atMs,
          hour: Math.max(0, Math.round((r.atMs - hourAnchor) / 3_600_000)),
          isi: isiOf(chain[i], r.w as number),
          ffmc: chain[i],
          t: r.t as number, rh: r.rh as number, w: r.w as number,
        })).filter((pt) => Number.isFinite(pt.isi));
        if (points.length === 0) {
          setPointCurve({
            kind: 'gap', lat, lng, country,
            reason: 'Die Kette liefert für diese Stelle keinen gültigen Wert.',
            sources: pf.sourcesAvailable,
          });
          return;
        }
        setPointCurve({
          kind: 'ok', lat, lng, country, points,
          elevation: pf.query.elevation,
          sources: pf.sourcesAvailable,
          skipped: rows.length - usable.length,
        });
      } catch (e) {
        if (gen !== pointReqRef.current) return;
        setPointCurve({ kind: 'error', lat, lng, message: (e as Error).message });
      }
    })();
  }, []);

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
   * WF3 (§15.5) — der Wind folgt der Stundenachse: Zielzeit „jetzt + h" statt
   * `Date.now()`. Die Achse ist 6 h lang, weil das Windgitter +12 h ab Lauf reicht
   * und der Lauf bis ~5,5 h alt ist — reicht der geladene Lauf doch einmal kürzer
   * (alter Warm-Stand, Ladephase), klemmt der Loader auf den letzten Frame und
   * `windClamped` sagt es in der Zeile. Erst nach Ladeende bewertet: während die
   * fernen Schritte noch nachkommen, wäre die Zeile ein Flackern.
   */
  const windTargetMs = hourly ? frameTargetMs : null;
  const windHorizonH = useMemo(() => {
    if (!wind?.frames.length) return null;
    const lastMs = wind.runAt.getTime() + Math.max(...wind.frames.map((f) => f.stepHours)) * 3_600_000;
    return Math.floor((lastMs - Date.now()) / 3_600_000);
  }, [wind]);
  const windClamped = hourly && time.hour > 0 && load.fireWind?.kind === 'ok'
    && windHorizonH != null && windHorizonH < time.hour;

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
  const wantPlaces = readoutTab === 'fires';
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
      placeAt: places ? (lat, lon) => {
        const h = nearestPlace(places, lat, lon);
        return h ? { name: h.name, district: h.district, distanceKm: h.distanceKm } : null;
      } : undefined,
      observationAt: observationIndex ? (lat, lon, lastMs) => observationFor(observationIndex, lat, lon, lastMs) : undefined,
      // Wind nur, wenn der Windlayer geladen ist UND ein Frame nahe am Überflug liegt (±3 h):
      // die Frames sind die Vorhersage des aktuellen Laufs, ein Überflug vor dem Lauf klemmt
      // sonst still auf den ersten Frame.
      windAt: wind ? (lat, lon, atMs) => {
        const w = sampleWindAt(wind, atMs, lon, lat);
        if (!w || Math.abs(w.validAtMs - atMs) > 3 * 3_600_000) return null;
        return Math.round(w.dir);
      } : undefined,
      // AF4: Flächenschätzung aus Merkmalsatz + Modell — nur mit geladenem Modell (Kill-Switch `?afEst=0`).
      estimateFor: areaModel ? (rec) => estimateArea(featuresOf(rec, now), areaModel) : undefined,
    });
    // Kennungen über den vorigen Lauf weiterreichen (Anker-Wanderung, Merge, Split).
    const carried = carryIds(built, prevRecordsRef.current);
    prevRecordsRef.current = carried;
    return carried;
  }, [clusterList, fireZones, registryReconciled, registryPolys, emsActs, fpEffisScope, burntSeason, clcMask, places, observationIndex, wind, areaModel]);
  const recordsById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);

  /**
   * SF1 — der Ausbreitungslauf: je aktivem Brand ein Vektor je Stunde.
   *
   * Drei Dinge, die hier bewusst so stehen:
   *
   *  • **Entprellt (300 ms).** `records` leitet sich bei JEDEM fortschreitenden
   *    Wind-Frame neu ab (die Registry hängt an `wind`) — ohne Entprellung liefe
   *    der Lauf während der Ladephase rund zwei Dutzend Mal.
   *  • **Abbruch + Generationszähler.** Der Lauf ist asynchron (DEM-Kacheln);
   *    ein überholtes Ergebnis darf den neueren Stand nicht überschreiben.
   *  • **Die Notiz nennt den Deckel.** Still zu kürzen wäre eine Falschaussage
   *    über den Bestand (V-246) — `capNote` schreibt Zahl, Grund und den Satz
   *    gegen die Fehllesart „keine Ausbreitung".
   */
  const spreadGenRef = useRef(0);
  useEffect(() => {
    if (!active.has('fireSpread')) { setSpread(null); return; }
    // Kein Lauf ohne Eingangsdaten — und vor allem kein ALTER Lauf: `records`
    // wird bei jedem Wind-Frame neu abgeleitet, die Kennungen wandern dabei
    // (`carryIds`). Ein stehen gelassener Lauf beschriebe dann einen Bestand,
    // den es nicht mehr gibt, und die Detailkarte fände ihren Brand nicht wieder.
    if (!wind || !fireWx) { setSpread(null); return; }
    const gen = ++spreadGenRef.current;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void computeSpreadRun({
        records, wind, fireWx, nowMs: Date.now(),
        maxHour: HOUR_AXIS_MAX, shownHour: hourly ? time.hour : 0,
        signal: ac.signal,
      })
        .then((run) => {
          if (ac.signal.aborted || gen !== spreadGenRef.current) return;
          setSpread(run);
          // Nur im DEV-Build: der Lauf für die Verifikation über MCP/DevTools
          // (Muster window.__fireMap). Ohne ihn ist „warum kein Pfeil" nur
          // über die Oberfläche zu erraten.
          if (import.meta.env.DEV) {
            (window as unknown as { __fireSpreadRun?: SpreadRun }).__fireSpreadRun = run;
          }
          setLayerLoad('fireSpread', {
            kind: 'ok',
            ref: run.fwRunAtMs != null ? { atMs: run.fwRunAtMs, kind: 'run' } : null,
            note: capNote({
              computed: run.computed, considered: run.considered, cap: run.cap, demCells: run.demCells,
              horizonHour: run.horizonHour, maxHour: run.maxHour,
            }),
          });
        })
        .catch((e) => {
          if (ac.signal.aborted || gen !== spreadGenRef.current) return;
          setSpread(null);
          setLayerLoad('fireSpread', { kind: 'error', message: (e as Error).message });
        });
    }, 300);
    return () => { window.clearTimeout(timer); ac.abort(); };
  }, [active, records, wind, fireWx, hourly, time.hour, setLayerLoad]);

  /** SF1: Pfeile und Fächer als GeoJSON — memoisiert, sonst setzt `setData` auf `idle` endlos (V-220). */
  const spreadFc = useMemo(() => (spread ? spreadToGeoJSON(spread) : null), [spread]);
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
  const panelRecords = useMemo(
    () => sortRecords(filterRecords(records, fpFilter), fpSort),
    [records, fpFilter, fpSort],
  );
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
    if (!id) return;
    setSelectedCluster(recordsById.get(id)?.sources.cluster?.id ?? null);
    setReadoutTab('fires');
    const rank = panelRecords.findIndex((r) => r.id === id);
    if (rank >= 0) setShownFootprints((n) => Math.max(n, Math.ceil((rank + 1) / CLUSTER_PAGE) * CLUSTER_PAGE));
  }, [panelRecords, recordsById]);
  const clearFootprint = useCallback(() => { setSelectedFootprint(null); setFocusBbox(null); }, []);


  // Breakpoint 767 px — die Projekt-Konvention, kein Ad-hoc-Wert (CLAUDE.md).
  const isMobile = useMediaQuery('(max-width: 767px)');
  // Startwert `collapsed`: Wer die Ansicht öffnet, will zuerst die Fläche sehen.
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('collapsed');
  // BP2: das dritte Readout-Segment gibt es nur im Sheet — beim Wechsel auf
  // Desktop fällt es auf „Cluster" zurück, sonst wäre das Readout leer.
  // Mobil: eine Kartenauswahl macht das Panel-Segment sichtbar — sonst wäre der Klick folgenlos.
  useEffect(() => { if (selectedFootprint) setReadoutTab('fires'); }, [selectedFootprint]);

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
    const btn = document.querySelector<HTMLElement>('.fire-rail .is-active');
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
      // WF3: `h` nur auf der Stundenachse — Links der Tagesachse bleiben byte-gleich.
      hour: hourly ? time.hour : null,
    });
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, [activeList, time.day, time.windowH, dangerView, burntBuckets, soilMode, burntDay, readoutTab, hourly, time.hour]);

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

  // ---- Deck-Bausteine (WBU1) ----------------------------------------------

  /**
   * Kurz-Stempel für die Sub-Zeile einer Dock-Zeile — das `statusStamp`-Muster
   * der Wetterkarte: „⚠ Fehler" / „lädt…" / Datenalter. Der AUSFÜHRLICHE
   * Fehlertext mit amtlichem Link bleibt zusätzlich unter der Zeile stehen
   * (D-04/WB-T2-6 — der Stempel ersetzt ihn nicht).
   */
  const rowStamp = (id: FireLayerId): string => {
    const st = load[id];
    if (!active.has(id) || !st || st.kind === 'idle') return '';
    if (st.kind === 'loading') return 'lädt…';
    if (st.kind === 'error') return '⚠ Fehler';
    return dataAgeText(st.ref, nowMs, nowMs);
  };

  /** Layer-Zeile in `layerRowDeck`-Optik: Icon + Label + Sub/Stempel + Switch.
   *  `inSheet` (mobil): kein Hover-Preview, dafür ein „i" mit Inline-Steckbrief. */
  /**
   * Der Steckbrief eines Layers — im Notbetrieb der Hotspots die degradierte
   * Fassung. Sonst zeigte die Karte eine FRP-Skala für Daten ohne FRP.
   */
  const infoFor = (id: FireLayerId) =>
    (id === 'fireHotspots' && hotspotProvider === 'gwis' ? HOTSPOTS_DEGRADED_INFO
      : id === 'fireDanger' ? dangerInfoFor(dangerView)
      : id === 'fireSoilDryness' ? soilDrynessInfoFor(soilMode)
      : FIRE_LAYER_INFO[id]);

  const layerRow = (id: FireLayerId, accent: string, inSheet: boolean) => {
    const info = infoFor(id);
    const gebaut = isBuilt(id);
    const on = active.has(id);
    const stamp = rowStamp(id);
    const st = load[id];
    const stands = on && FIRE_LAYER_TIME[id] ? lagging.includes(id) : false;
    return (
      <div key={id} className="fire-layerwrap">
        <button
          type="button"
          className={`fire-layer${on ? ' is-on' : ' is-off'}${gebaut ? '' : ' is-blocked'}`}
          data-accent={accent}
          role="switch"
          aria-checked={on}
          disabled={!gebaut}
          title={gebaut ? info.label : 'Quelle derzeit nicht abrufbar'}
          onClick={() => gebaut && toggle(id)}
          onMouseEnter={inSheet ? undefined : () => setLayerHover(id)}
          onMouseLeave={inSheet ? undefined : () => setLayerHover(null)}
          onFocus={inSheet ? undefined : () => setLayerHover(id)}
          onBlur={inSheet ? undefined : () => setLayerHover(null)}
        >
          <span className="fire-layer-ic"><FireIcon layer={id} size={inSheet ? 16 : 14} /></span>
          <span className="fire-layer-tx">
            <span className="fire-layer-label">{info.label}</span>
            <span className="fire-layer-sub">
              {[gebaut ? info.short : 'Quelle derzeit nicht abrufbar', stamp].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className="fire-switch" aria-hidden="true"><span className="fire-switch-knob" /></span>
        </button>
        {inSheet && (
          <button
            type="button" className="fire-layer-infobtn"
            aria-label={`Steckbrief ${info.label}`}
            aria-expanded={openInfo === id}
            onClick={() => setOpenInfo((cur) => (cur === id ? null : id))}
          >
            i
          </button>
        )}
        {inSheet && openInfo === id && <FireLayerCard layer={id} info={infoFor(id)} />}
        {on && stands && (
          <p className="fire-layer-lag">
            {hourly ? 'gilt für jetzt — folgt dem Stundenregler nicht' : 'gilt für heute — folgt dem Tagesregler nicht'}
          </p>
        )}
        {/* WF3: Tages-Layer auf der Stundenachse — weder „folgt" noch „steht":
            ein Tageswert für den Kalendertag, in den jetzt + h fällt. */}
        {on && hourly && time.hour > 0 && dailyOnly.includes(id) && (
          <p className="fire-layer-lag">
            Tageswert · gilt für {dayLabel(dayForLayers, nowMs)} — keine Stundenauflösung
          </p>
        )}
        {/* WF3 §15.5: der geladene Windlauf reicht nicht bis zur Zielzeit — gesagt,
            nicht geklemmt. Im Normalfall (Lauf ≤ 6 h alt) erscheint das nie. */}
        {on && id === 'fireWind' && windClamped && (
          <p className="fire-layer-lag">
            Modellfeld reicht bis +{Math.max(0, windHorizonH ?? 0)} h — zeigt den letzten verfügbaren Schritt
          </p>
        )}
        {on && st?.kind === 'ok' && st.note && (
          <p className="fire-layer-status">{st.note}</p>
        )}
        {/* E1/E2: die Bestätigung durch die EFFIS-Kartierung — nur, wenn es sie
            gibt. Ohne Treffer steht hier nichts: Fehlen ist kein Gegenbeleg. */}
        {on && id === 'fireHotspots' && st?.kind === 'ok' && mappedCount > 0 && (
          <p className="fire-layer-status fire-layer-mapped">
            {mappedCount === 1 ? 'Eine Detektion liegt' : `${mappedCount} Detektionen liegen`} in einer von
            EFFIS kartierten Brandfläche der letzten 7 Tage (bestätigt) — Details im Klick-Steckbrief.
          </p>
        )}
        {/* GWBA1 A3: Ereignisbestätigung je Land — ehrlich statt Lücke. AT hat keine
            lizenzierbare Live-Einsatzquelle ⇒ nur Deep-Links (kein Scraping, kein
            Proxy); DE folgt mit MoWaS nach Freigabe. Verifikation beim Nutzer. */}
        {on && id === 'fireHotspots' && st?.kind === 'ok' && (
          <p className="fire-layer-status fire-layer-incidents">
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

  // Rückblick-Fenster (24 h / 7 Tage) der Hotspots — als Untersegment IM Dock
  // unter der Layer-Zeile, das Muster der Sat-/Schnee-/Hagel-Unterwahl.
  const windowSeg = windows.length > 0 ? (
    <div className="fire-subseg" data-accent="terracotta" role="group" aria-label="Rückblick-Fenster">
      {windows.map((h) => (
        <button
          key={h} type="button"
          className={time.windowH === h ? 'is-active' : ''}
          onClick={() => setTime((t) => ({ ...t, windowH: h }))}
        >
          {windowLabel(h)}
        </button>
      ))}
    </div>
  ) : null;

  // E3: Sub-Ansichten des EU-Index — Untersegment unter der Layer-Zeile, dasselbe
  // Muster wie das Rückblick-Fenster der Hotspots. Fünf Einträge, kein neuer
  // Top-Level-Layer: das Dock bleibt lesbar.
  const dangerSeg = (
    <div className="fire-subseg fire-subseg-wrap" data-accent="amber" role="group" aria-label="Ansicht des EU-Index">
      {DANGER_VIEW_ORDER.map((v) => (
        <button
          key={v} type="button"
          className={dangerView === v ? 'is-active' : ''}
          title={DANGER_VIEWS[v].title}
          onClick={() => setDangerView(v)}
        >
          {DANGER_VIEWS[v].label}
        </button>
      ))}
    </div>
  );

  // WT1: die zwei Tiefen der Bodentrockenheit — dasselbe Untersegment-Muster.
  // Bewusst ein Umschalter (genau eine Tiefe) und keine zwei Schalter wie bei den
  // Zeitkörben: zwei Tiefen übereinander wären zwei Flächen, die dieselbe Farbe
  // sprechen und Verschiedenes meinen. Der Titel nennt die volle Bedeutung —
  // „Oberboden" allein sagt nicht, dass er in Tagen und nicht in Wochen reagiert.
  const soilSeg = (
    <div className="fire-subseg" data-accent="sage" role="group" aria-label="Tiefe der Bodentrockenheit">
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

  // E2/BF4: die drei Zeitkörbe der Brandflächen — je für sich schaltbar, damit
  // sie nebeneinander, aber nie ununterscheidbar liegen. Sie ÜBERLAPPEN SICH
  // NICHT: „7 Tage" nimmt der Saison ihre frischen Flächen ab, das Archiv sind
  // die Vorjahre.
  const BURNT_SEG: readonly { id: BurntBucket; label: string; title: string }[] = [
    { id: 'week', label: '7 Tage', title: 'Die frischesten Kartierungen — gefiltert aus der Saison, kein zusätzlicher Abruf' },
    { id: 'season', label: 'Saison', title: 'Laufende Saison, live' },
    { id: 'archive', label: 'Archiv', title: 'Frühere Saisons — rund 5 MB, nur auf Wunsch' },
  ];
  const burntSeg = (
    <>
      <div className="fire-subseg" data-accent="terracotta" role="group" aria-label="Zeitkörbe der Brandflächen">
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
      {/* BF4: die eigene Zeitachse der Historie. Sie läuft über das BRANDDATUM
          (`FIREDATE`) — der Nutzer fragt, wann es gebrannt hat, nicht wann
          Copernicus verarbeitet hat. Der Stand der Kartierung steht daneben. */}
      {burntBuckets.has('week') && (
        <div className="fire-burnt-history">
          <label className="fire-burnt-history-row">
            <span className="fire-burnt-history-label">{historyDayLabel(Date.now(), burntDay)}</span>
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
          <p className="fire-burnt-history-note">
            {historyNote(burntSplit.weekCount, Date.now(), burntDay, burntSplit.weekUpdate)}
          </p>
          <p className="fire-burnt-history-note is-caveat">{HISTORY_LATENCY_NOTE}</p>
        </div>
      )}
    </>
  );

  /** Presets + Layer-Gruppen — Dock (Desktop) und Sheet (mobil) teilen den Bau. */
  const dockContent = (inSheet: boolean) => (
    <>
      <div className="fire-dock-presets">
        {FIRE_PRESETS.map((p) => (
          <button
            key={p.id} type="button"
            className={`fire-preset${presetId === p.id ? ' is-active' : ''}`}
            onClick={() => applyPreset(p.layers)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {FIRE_DECK_GROUPS.map((g) => (
        <div key={g.title} className="fire-group" data-accent={g.accent}>
          <div className="fire-group-head">{g.title}</div>
          <div className="fire-layers">
            {g.layers.map((l) => (
              <div key={l.id} className="fire-layerslot">
                {layerRow(l.id, l.accent ?? g.accent, inSheet)}
                {l.id === 'fireDanger' && active.has('fireDanger') && dangerSeg}
                {l.id === 'fireHotspots' && active.has('fireHotspots') && windowSeg}
                {l.id === 'fireFootprints' && active.has('fireFootprints') && !active.has('fireHotspots') && windowSeg}
                {l.id === 'fireFootprints' && (
                  <button
                    type="button"
                    className={`fire-fp-toggle${readoutTab === 'fires' ? ' is-on' : ''}`}
                    aria-pressed={readoutTab === 'fires'}
                    onClick={() => setReadoutTab(readoutTab === 'fires' ? 'layers' : 'fires')}
                  >
                    {readoutTab === 'fires' ? 'Liste schließen' : `Liste öffnen${records.length ? ` · ${records.length}` : ''}`}
                  </button>
                )}
                {l.id === 'fireBurnt' && active.has('fireBurnt') && burntSeg}
                {l.id === 'fireSoilDryness' && active.has('fireSoilDryness') && soilSeg}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );

  // Steckbriefe rechts: aktive Layer in fester Ordnung, gehoverte inaktive als
  // „Vorschau" (Wetterkarten-Muster). Mobil laufen die Steckbriefe über die
  // „i"-Knöpfe der Zeilen — Hover gibt es dort nicht.
  const readoutLayers = FIRE_LAYER_ORDER.filter((id) => active.has(id) || layerHover === id);

  /**
   * BC1/BP5 — die frühere Cluster-Liste stand hier. Sie ist seit BP5 in die
   * Brand-Liste aufgegangen (`footprintPanel`): Stärke, Skala, Ausdehnung,
   * Pflichthinweis, Rangfolge und die Leerzustände sind dort — je Brand statt
   * je Detektionsgruppe. Belege und die einzeln geprüfte Übernahme:
   * audit/brandflaechen-panel.md §11.
   */

  /**
   * BP2 — das Brandflächen-Panel: Desktop als Overlay links über der Karte,
   * mobil als drittes Readout-Segment. Ein Bau, zwei Einbauorte.
   */
  const footprintPanel = (inSheet: boolean) => (
    <FireFootprintPanel
      inSheet={inSheet}
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
      windowSeg={(active.has('fireHotspots') || active.has('fireFootprints')) ? windowSeg : undefined}
      spread={spread}
      placesLoaded={!!places}
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

  /** Readout-Inhalte: Steckbrief-Stapel (nur Desktop), Skalen, AT-Lücke, Saison. */
  /**
   * WF4 — die Punktkurve als Readout-Karte (Optik der Steckbriefe, `fire-ro-lcard`).
   *
   * Sie steht ÜBER den Steckbriefen, weil sie die Antwort auf die letzte Handlung
   * ist. Die Balken tragen die EFFIS-Klassenfarbe des jeweiligen Stundenwerts —
   * dieselbe Reihe wie die Fläche (`ISI_CLASS_COLORS`), damit Karte und Kurve
   * dieselbe Sprache sprechen. Die Höhe der Balken ist auf den größten Wert der
   * Kurve normiert (mindestens die dritte Klassengrenze), sonst wäre ein ruhiger
   * Tag eine flache Linie ohne Kontur — und die Klassenfarbe sagt ohnehin, was gilt.
   */
  const pointCurveCard = pointCurve ? (() => {
    const pos = `${Math.abs(pointCurve.lat).toFixed(3)}° ${pointCurve.lat >= 0 ? 'N' : 'S'} · `
      + `${Math.abs(pointCurve.lng).toFixed(3)}° ${pointCurve.lng >= 0 ? 'O' : 'W'}`;
    const head = (
      <div className="fire-ro-section-head">
        <span className="fire-eyebrow">Punkt · Fusion</span>
        <button
          type="button" className="fire-pc-close"
          aria-label="Punktkurve schließen" onClick={() => setPointCurve(null)}
        >
          ×
        </button>
      </div>
    );
    if (pointCurve.kind === 'loading') {
      return (
        <section className="fire-pc" aria-label="Feuerwetter am Punkt">
          {head}
          <p className="fire-pc-pos">{pos}</p>
          <p className="fire-pc-note">Punkt-Forecast wird geholt …</p>
        </section>
      );
    }
    if (pointCurve.kind === 'error') {
      return (
        <section className="fire-pc" aria-label="Feuerwetter am Punkt">
          {head}
          <p className="fire-pc-pos">{pos}</p>
          <p className="fire-pc-note is-gap">
            Der Punkt-Forecast ist gerade nicht abrufbar — <strong>keine Daten</strong>, nicht
            „keine Gefahr". ({pointCurve.message})
          </p>
        </section>
      );
    }
    if (pointCurve.kind === 'gap') {
      return (
        <section className="fire-pc" aria-label="Feuerwetter am Punkt">
          {head}
          <p className="fire-pc-pos">{pos} · {pointCurve.country}</p>
          <p className="fire-pc-note is-gap">{pointCurve.reason}</p>
          {pointCurve.sources.length > 0 && (
            <p className="fire-pc-src">Antwortende Quellen: {pointCurve.sources.join(', ')}</p>
          )}
        </section>
      );
    }
    const max = Math.max(7.5, ...pointCurve.points.map((pt) => pt.isi));
    const cls = (v: number) => {
      const i = isiClassIndex(v);
      return { color: ISI_CLASS_COLORS[Math.max(0, i)], name: DANGER_VIEWS.isi.classes[Math.max(0, i)]?.name ?? '' };
    };
    const now = pointCurve.points[0];
    return (
      <section className="fire-pc" aria-label="Feuerwetter am Punkt">
        {head}
        <p className="fire-pc-pos">
          {pos} · {pointCurve.country} · {Math.round(pointCurve.elevation)} m
        </p>
        <p className="fire-pc-now">
          <span className="fire-swatch" style={{ background: cls(now.isi).color }} aria-hidden="true" />
          <strong>ISI {now.isi.toFixed(1).replace('.', ',')}</strong>
          {' · '}{cls(now.isi).name}
          {' · '}jetzt
        </p>
        <ol className="fire-pc-bars">
          {pointCurve.points.map((pt) => (
            <li key={pt.atMs}>
              <span
                className="fire-pc-bar"
                style={{
                  height: `${Math.max(4, Math.round((pt.isi / max) * 100))}%`,
                  background: cls(pt.isi).color,
                }}
                title={`+${pt.hour} h · ISI ${pt.isi.toFixed(1)} (${cls(pt.isi).name}) · `
                  + `${pt.t.toFixed(0)} °C · ${pt.rh.toFixed(0)} % rF · ${pt.w.toFixed(0)} km/h`}
              />
              <span className="fire-pc-h">{pt.hour === 0 ? 'jetzt' : `+${pt.hour}`}</span>
            </li>
          ))}
        </ol>
        <p className="fire-pc-note">
          <strong>Punkt (Fusion) ≠ Fläche (ICON-D2).</strong> Die Kurve rechnet mit denselben
          FWI-Gleichungen wie die Fläche, aber auf den Daten des buscosun-Punkt-Forecasts
          (Stationen, MOSMIX, AROME/INCA); die Fläche kommt nativ aus ICON-D2. Am selben Ort
          stimmen beide deshalb nicht exakt überein — das sind zwei Datengrundlagen, kein Fehler.
          Stufe 1: ohne Vortagsgedächtnis, Start bei der Gleichgewichtsfeuchte der ersten Stunde.
          Kein amtliches Produkt.
        </p>
        {pointCurve.skipped > 0 && (
          <p className="fire-pc-note is-gap">
            {pointCurve.skipped === 1 ? 'Eine Stunde wurde' : `${pointCurve.skipped} Stunden wurden`} übersprungen
            — dort fehlten Wind oder Feuchte.
          </p>
        )}
        <p className="fire-pc-src">Quellen: {pointCurve.sources.join(', ')}</p>
      </section>
    );
  })() : null;

  const readoutContent = (inSheet: boolean) => (
    <>
      {/* BC1: der Umschalter steht ÜBER dem bestehenden Panel und ändert an ihm
          nichts — „Layer" ist Zeile für Zeile der Bestand. */}
      {/* BP5: zwei Reiter auf beiden Groessen. „Braende" ist die verschmolzene
          Liste — je Brand, mit den Leistungsangaben der frueheren Cluster-Seite.
          „Layer" ist Zeile fuer Zeile der Bestand. */}
      <div className="fire-ro-tabs" role="group" aria-label="Inhalt des Readouts">
        {([['layers', 'Layer'], ['fires', 'Brände']] as const).map(([id, label]) => (
          <button
            key={id} type="button"
            className={readoutTab === id ? 'is-active' : ''}
            aria-pressed={readoutTab === id}
            onClick={() => setReadoutTab(id)}
          >
            {label}
            {id === 'fires' && records.length > 0 && (
              <span className="fire-ro-tabcount">{records.length}</span>
            )}
          </button>
        ))}
      </div>
      {readoutTab === 'fires' ? footprintPanel(inSheet) : (
      <>
      {/* WF4: die Antwort auf den letzten Klick steht oben — vor den Steckbriefen. */}
      {pointCurveCard}
      {!inSheet && readoutLayers.length > 0 && (
        <section className="fire-ro-layerinfo" aria-label="Steckbriefe der aktiven Layer">
          <div className="fire-ro-section-head">
            <span className="fire-eyebrow">Aktive Layer</span>
            <span className="fire-dock-count">{active.size} aktiv</span>
          </div>
          <div className="fire-ro-lstack">
            {readoutLayers.map((id) => (
              <FireLayerCard key={id} layer={id} preview={!active.has(id)} info={infoFor(id)} />
            ))}
          </div>
        </section>
      )}

      {lagging.length > 0 && (
        <p className="fire-lag-hint">
          {lagging.length === 1 ? 'Ein Layer folgt' : `${lagging.length} Layer folgen`} dem
          Regler nicht und {lagging.length === 1 ? 'zeigt' : 'zeigen'} weiter den {hourly ? 'jetzigen' : 'heutigen'} Stand.
        </p>
      )}

      <div className="fire-scales">
        <div className="fire-ro-section-head">
          <span className="fire-eyebrow">Skalen</span>
        </div>
        {/* 2026-08-19: Hier standen drei Skalen nebeneinander (DWD, BAFU, EU)
            — solange die amtliche Stufe ein Layer war. Sie ist zurückgezogen;
            eine Behördenskala zu zeigen, zu der die Karte nichts mehr zeichnet,
            wäre eine Aussage über Daten, die es hier nicht gibt. Übrig bleibt
            die Skala des einen Gefahrenlayers. Die Regel, dass nationale Skalen
            NIE ineinander umgerechnet werden, steht unverändert in
            `fireModel.ts` (docs/DATA_SOURCES.md §W.1). */}
        {(['EU'] as const).map((k) => {
          const s = fireSource(k);
          return (
            <div key={k} className="fire-scale">
              <span className="fire-scale-head">{s.issuer}</span>
              <span className="fire-scale-cov">{s.coverage}</span>
              <ol className="fire-scale-steps">
                {s.scale.map((st) => (
                  <li key={st.level}>
                    <span className="fire-swatch" style={{ background: st.color }} aria-hidden="true" />
                    <span className="fire-scale-num">{st.level}</span>
                    <span className="fire-scale-label">{st.label}</span>
                  </li>
                ))}
              </ol>
              <span className="fire-scale-derived">
                Farbwerte sind unsere Wahl, nicht amtlich — die Quellen geben keine vor.
              </span>
            </div>
          );
        })}
      </div>

      {/* Die amtlichen Stufen sind seit 2026-08-19 nicht mehr Teil dieser
          Ansicht. Das wird gesagt und verlinkt, statt es unerwähnt zu lassen:
          der EU-Wert ist ein Modellwert und ersetzt keine Behördenstufe — und
          in Österreich gibt es ohnehin keine offene. */}
      <p className="fire-at-gap">
        <strong>Amtliche Stufen zeigt diese Karte nicht.</strong> Der EU-Wert ist
        ein Modellwert, <em>keine</em> amtliche Stufe. Maßgeblich sind{' '}
        {(['DE', 'CH', 'AT'] as const).map((c, i) => {
          const src = fireSourceFor(c);
          return (
            <span key={c}>
              {i > 0 ? ' · ' : ''}
              <a href={src.url} target="_blank" rel="noopener">{src.name}</a> ({c})
            </span>
          );
        })}. Für Österreich gibt es keinen offenen amtlichen Waldbrandindex;
        zuständig sind die Bezirkshauptmannschaften.
      </p>

      <p className="fire-season">
        Im Winterhalbjahr ist die Waldbrandgefahr strukturell niedrig; einzelne
        Landesstellen schreiben ihre Stufen dann nicht täglich fort.
      </p>
      </>
      )}
    </>
  );

  /**
   * Zeit-Deck in Wetterkarten-Optik (`mdk-timedeck`): Play-Kachel, Ticks-Zeile
   * mit „heute"-Rücksetzer und Tagesmarken, gefüllte Range-Spur, Tageslabel
   * rechts — inkl. des „lädt …"-Pending beim entprellten Tageswechsel.
   * Desktop unten mittig ÜBER der Karte, mobil schwebend über dem Sheet.
   */
  // WF3: der Einheiten-Umschalter (Tage | Stunden) — nur, wenn ein aktiver Layer
  // Stundenframes hat und kein Stundenlayer die Einheit erzwingt. Standard Tage.
  const unitSeg = unitChoice ? (
    <div className="fire-td-unit" role="group" aria-label="Einheit des Zeitreglers">
      {(['days', 'hours'] as const).map((u) => (
        <button
          key={u} type="button"
          className={unit === u ? 'is-active' : ''}
          aria-pressed={unit === u}
          onClick={() => {
            if (unit === u) return;
            setPlay((p) => (p.playing ? { ...p, playing: false } : p));
            setTime((t) => ({ ...t, unit: u }));
          }}
        >
          {u === 'days' ? 'Tage' : 'Stunden'}
        </button>
      ))}
    </div>
  ) : null;

  /** Uhrzeit zu „jetzt + h" — lokal, damit sie zur Uhr des Nutzers passt. */
  const hourClock = (h: number) => new Date(nowMs + h * 3_600_000)
    .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const timeDeck = showSlider ? (
    <div className={`fire-timedeck fire-glass${hourly ? ' is-hourly' : ''}`}>
      <div className="fire-td-row">
        <button
          type="button"
          className="fire-td-play"
          aria-label={play.playing ? 'Abspielen pausieren' : (hourly ? 'Stunden abspielen' : 'Tage abspielen')}
          aria-pressed={play.playing}
          onClick={() => setPlay((p) => ({ ...p, playing: !p.playing }))}
        >
          {play.playing ? <IcoFirePause /> : <IcoFirePlay />}
        </button>
        <div className="fire-td-track">
          <div className="fire-td-ticks">
            <button
              type="button"
              className="fire-td-now"
              disabled={pos === 0}
              onClick={() => {
                setPlay((p) => (p.playing ? { ...p, playing: false } : p));
                setPos(0);
              }}
              title={hourly ? 'Auf jetzt zurücksetzen' : 'Auf heute zurücksetzen'}
            >
              {hourly ? 'jetzt' : 'heute'}
            </button>
            {sliderMax >= 4 && (
              <>
                <span>+{Math.round(sliderMax / 4)} {hourly ? 'h' : 'T'}</span>
                <span>+{Math.round(sliderMax / 2)} {hourly ? 'h' : 'T'}</span>
                <span>+{Math.round((sliderMax * 3) / 4)} {hourly ? 'h' : 'T'}</span>
              </>
            )}
            <span>+{sliderMax} {hourly ? 'h' : 'Tage'}</span>
          </div>
          <input
            type="range" min={0} max={sliderMax} step={1} value={pos}
            aria-label={hourly ? 'Stundenschritt' : 'Tagesschritt'}
            onChange={(e) => {
              // Von Hand ziehen beendet das Abspielen — sonst kämpfen zwei
              // Quellen um denselben Regler und er zuckt.
              setPlay((p) => (p.playing ? { ...p, playing: false } : p));
              setPos(Number(e.target.value));
            }}
            style={{ '--tl-fill': `${(pos / Math.max(sliderMax, 1)) * 100}%` } as React.CSSProperties}
          />
        </div>
        <span className="fire-td-stand">
          {hourly ? `${hourLabel(time.hour)} · ${hourClock(time.hour)}` : dayLabel(time.day, nowMs)}
          {committedDay !== dayForLayers && <span className="fire-td-pending"> · lädt …</span>}
        </span>
        {unitSeg}
      </div>
    </div>
  ) : (
    <div className="fire-timedeck fire-glass">
      <div className="fire-td-row">
        <p className="fire-time-none">
          {unitChoice
            ? 'Die aktiven Layer zeigen auf der Tagesachse genau einen Zeitpunkt — Stundenachse wählbar.'
            : 'Die aktiven Layer zeigen genau einen Zeitpunkt — kein Tagesregler.'}
        </p>
        {/* WF3 §15.5: Wind allein hat keine Tagesachse (WW1), aber eine Stundenachse —
            der Umschalter muss auch hier erreichbar sein, sonst gäbe es sie nicht. */}
        {unitSeg}
      </div>
    </div>
  );

  return (
    <div className="fire-root">
      <FeatureRail
        active={'fire' as RailFeature}
        onOpenFeature={onOpenFeature}
        onHome={onBack}
        navClass="fire-rail"
        btnClass="fire-rail-btn"
        activeClass="is-active"
        spacerClass="fire-rail-spacer"
      />

      <div className="fire-deck">
        <header className="fire-topbar">
          <a
            className="fire-brand" href="#"
            onClick={(e) => { e.preventDefault(); onBack(); }}
          >
            <span className="fire-brand-mark" /><span className="fire-brand-name">buscosun</span>
          </a>
          <span className="fire-topdiv" aria-hidden="true" />
          <div className="fire-topbar-mid">
            <span className="fire-eyebrow">Waldbrand</span>
            <h1 className="fire-title">Wie trocken ist der Wald?</h1>
          </div>
          <div className="fire-basemap" role="group" aria-label="Basiskarte">
            {(['streets', 'terrain', 'satellite'] as FireBasemap[]).map((b) => (
              <button
                key={b} type="button"
                className={basemap === b ? 'is-active' : ''}
                onClick={() => setBasemap(b)}
              >
                {b === 'streets' ? 'Straße' : b === 'terrain' ? 'Gelände' : 'Satellit'}
              </button>
            ))}
          </div>
        </header>

        {/* Desktop und Mobil ordnen dieselben Blöcke VERSCHIEDEN an: Desktop
            dreispaltig (Dock · Karte · Readout) mit dem Zeit-Deck unten mittig
            über der Karte, mobil Karte vollflächig mit Bottom-Sheet und dem
            Zeit-Deck darüber. Die Blöcke entstehen deshalb in Bau-Funktionen
            und werden über den Breakpoint verteilt. */}
        <div className={isMobile ? 'fire-body is-mobile' : 'fire-body'}>
          {!isMobile && (
            <aside className="fire-dock" aria-label="Layer">
              <div className="fire-dock-head">
                <span className="fire-eyebrow">Waldbrand-Layer</span>
                <span className="fire-dock-count">{active.size} aktiv</span>
              </div>
              {dockContent(false)}
            </aside>
          )}

          <main className="fire-center">
            <FireMap
              active={active} basemap={basemap} day={committedDay} isoDate={committedIso}
              windTargetMs={windTargetMs}
              hotspots={hotspots}
              hotspotFootprints={hotspotFootprints} hotspotProvider={hotspotProvider}
              fireZones={mapZones} zoneEstimates={zoneEstimates}
              clusters={clusterList} selectedClusterId={selectedCluster}
              focusNonce={focusNonce} onSelectCluster={selectFromMap}
              footprintFc={footprintFc} hoverFootprintId={hoverFootprint} selectedFootprintId={selectedFootprint}
              focusBbox={focusBbox} onSelectFootprint={selectFootprintFromMap}
              dangerView={dangerView}
              burntSeason={burntSplit.seasonFc} burntArchive={burntArchive?.features ?? null}
              burntWeekFc={burntSplit.weekFc}
              burntBuckets={burntBuckets} burntLookup={burntLookup} burntWeek={burntWeek}
              fireEvents={fireEvents} emsActs={emsActs} atContexts={atContexts} clcMask={clcMask}
              weather={weather} wind={wind} soil={soil} spreadFc={spreadFc}
              onPointForecast={requestPointCurve}
              prefetchIsoDate={prefetchIso} onTier={setTier}
            />
            {/* E3: Der Index steht nie allein — auf der Karte hängt seine
                Einordnung als Begleiter daneben (und umgekehrt), mit dem
                Ein-Klick-Wechsel. Bei den drei Codes: Titel + Einheit. */}
            {active.has('fireDanger') && (
              <div className="fire-scaffold-note fire-danger-note fire-glass" role="status">
                <strong>{DANGER_VIEWS[dangerView].title}</strong>
                {' · '}{DANGER_VIEWS[dangerView].unit}
                {companionView(dangerView) && (
                  <>
                    {' — '}
                    <button
                      type="button" className="fire-danger-note-switch"
                      onClick={() => setDangerView(companionView(dangerView)!)}
                    >
                      {dangerView === 'fwi' ? 'Einordnung (Perzentil) ansehen' : 'Index (FWI) ansehen'}
                    </button>
                  </>
                )}
              </div>
            )}
            {active.has('fireWeather') && weather && (
              <div className="fire-scaffold-note fire-glass" role="status">
                Feuerwetter-Treiber: eingefärbt ist die <strong>Trockenheit der Luft</strong>
                {' '}(je dunkler, desto trockener). Ein Treiber, kein Index — die kumulativen
                FWI-Codes sind nicht enthalten.
              </div>
            )}
            {active.has('fireSpread') && (
              <div className="fire-scaffold-note fire-glass" role="status">
                <strong>Ausbreitungsrichtung (Modell)</strong> — {SPREAD_CAVEAT_SHORT}
                {' '}{FAN_CAVEAT}
                {spread && (
                  <> · {capNote({
                    computed: spread.computed, considered: spread.considered, cap: spread.cap,
                    demCells: spread.demCells, horizonHour: spread.horizonHour, maxHour: spread.maxHour,
                  })}</>
                )}
                {' '}Klick auf die Karte: Punktkurve aus dem buscosun-Punkt-Forecast.
              </div>
            )}
            {!isMobile && timeDeck}
            {/* BP5: das Overlay am linken Kartenrand ist entfallen — die Liste
                steht jetzt rechts im Readout unter „Brände", zusammen mit den
                Leistungsangaben der früheren Cluster-Seite
                (audit/brandflaechen-panel.md §11). Die Karte behält dadurch
                ihre volle Breite. */}
          </main>

          {!isMobile && (
            <aside className="fire-readout" aria-label="Zeit und Quellen">
              {readoutContent(false)}
            </aside>
          )}

          {isMobile && (
            <>
              {/* Der Zeitregler gehört NICHT ins Sheet: Er muss bedienbar sein,
                  während man die Karte sieht. Sonst müsste man das Sheet
                  aufziehen, um den Tag zu wechseln — und sähe dabei die Karte
                  nicht mehr, die man gerade beurteilen will. */}
              <div className="fire-mobile-time">{timeDeck}</div>
              <BottomSheet
                snap={sheetSnap}
                onSnapChange={setSheetSnap}
                header={<span className="fire-sheet-title">Layer und Quellen</span>}
              >
                <div className="fire-sheet-body">
                  <div className="fire-dock">{dockContent(true)}</div>
                  <div className="fire-readout">{readoutContent(true)}</div>
                </div>
              </BottomSheet>
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
