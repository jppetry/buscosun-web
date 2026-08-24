/**
 * FireMap — die Karte der Waldbrand-Ansicht.
 *
 * **Eigene MapLibre-Instanz**, nach dem Präzedenzfall `radar/RadarMap.tsx` +
 * `nowcast/NowcastRadarMap.tsx`: eigener Layer-Id-Typ, eigene Presets, eigenes
 * Zeitmodell. Aus der Wetterkarte kommen nur *Renderprimitive* — hier bislang
 * die DACH-Maske (`countryMask.ts`). **Kein Import aus `MapView.tsx`**; ein
 * Verifier hält das fest (`verify:fire-model`, Sonde (b)).
 *
 * ── Stand Phase WB1: Gerüst ohne Daten ───────────────────────────────────────
 * Die fünf MVP-Layer existieren als **leere Quellen** mit korrekter Z-Ordnung.
 * Sie schalten sichtbar/unsichtbar, zeigen aber noch nichts — Daten kommen in
 * WB2. Das ist Absicht: erst die Mechanik beweisen, dann die Bytes.
 *
 * ── V-164 von Anfang an vermieden ────────────────────────────────────────────
 * In der Wetterkarte friert die Layer-Sichtbarkeit ein, wenn vor dem Stil-Load
 * getoggelt wird (`audit/zellbahnen-karte.md`, betrifft dort alle Layer). Hier
 * wird deshalb **nie** direkt gegen die Map geschrieben: jeder Zugriff läuft
 * über `whenStyleReady()`, das entweder sofort ausführt oder bis `load` wartet
 * — und der Sichtbarkeits-Effekt wird nach dem Stil-Load erneut angewandt.
 */

import { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { loadDachMask } from '../countryMask';
import {
  FIRE_LAYER_ORDER, sortByZBand, type FireLayerId,
} from './fireModel';
import { ScalarLayer } from '../scalar/ScalarLayer';
import { readDeviceCaps, initialTier, type PerfTier } from '../wind/perfGovernor';
import {
} from '../wind/iconD2WindSource';
import { soilDrynessRamp, ICON_D2_SMI_ATTRIBUTION } from '../sources/iconD2Smi';
import { drynessRamp, RELHUM_DRY_FROM, RELHUM_MAX } from '../sources/iconD2Relhum';
// TA5: Standort-Rauten (Symbol-Layer mit gezeichneten Sprites, Muster Ausbreitungspfeil).
import {
  ANOMALY_SOURCE_ID, ANOMALY_LAYER_ID, ANOMALY_SEL_LAYER_ID, ANOMALY_IMAGE_ID, ANOMALY_IMAGE_IDS, ANOMALY_VARIANTS,
  ANOMALY_ATTRIBUTION, makeSiteDiamondImage,
} from './anomaly/anomalyLayer';
import { HISTORY_SOURCE_ID, HISTORY_LAYER_ID, HISTORY_SEL_LAYER_ID } from './history/historyLoad';
import { gwisRasterSource, gwisPrefetchUrls, GWIS_FWI_ATTRIBUTION } from './sources/gwisFwi';
import { GWIS_HOTSPOT_ATTRIBUTION } from './sources/gwisHotspots';
import {
  FIRMS_ATTRIBUTION, FRP_STOPS, FOOTPRINT_MIN_ZOOM, type FirmsProps,
} from './sources/firmsHotspots';
import {
  fuelMapSource, natura2000Source, clc2018Source, EFFIS_BURNT_ATTRIBUTION, type BurntBucket,
} from './sources/euContext';
import { DANGER_VIEWS, type DangerView } from './dangerViews';
import { assess, type Assessment } from './fireAssessment';
import { LINK_RADIUS_M, type FireEvent } from './fireEvents';
import { clustersToGeoJSON, STATIC_GREY, type FireCluster } from './fireClusters';
import { STATUS_COLOR, provisionalAreaText } from './footprint/fireRegistry';
import type { AreaEstimate } from './activity/estimate';
import { emsActivationFor, type EmsActivation } from './sources/emsActivations';
import {
  zonesToGeoJSON, zoneAt, zoneForDetection, zoneAreaLabel, zoneAreaNote,
  MAX_RECTS_PER_ZONE, type FireZone,
} from './fireZones';
import { inAustriaBox } from './sources/geosphereWarnContext';
import { landcoverAt, toAssessmentLandcover, type ClcMask } from './clcMask';
import { fireIncidentSourcesFor, type Country } from '../officialSources';
import type { AtWarnContext } from './sources/geosphereWarnContext';
import {
  LANDCOVER_KEYS, LANDCOVER_COLOR, landcoverBreakdown, mappedAreaFor,
  corroborationLabel, NO_MAPPING_NOTE, type BurntPolygon,
} from './fireCorroboration';

/** Vektor-Basiskarte wie in der Wetterkarte (`MapView.tsx:1222`): der helle
 *  Positron-Stil, nicht der bunte Liberty-Stil. Zusammen mit dem Ink-Schleier
 *  und der sandfarbenen DACH-Maske ergibt das dieselbe Kartenoptik wie dort. */
const STREETS = 'https://tiles.openfreemap.org/styles/positron';

/** DACH-Überblick: der Ausschnitt, in dem die Ansicht startet. */
const DACH_BOUNDS: [number, number, number, number] = [5.5, 45.5, 17.5, 55.5];

export type FireBasemap = 'streets' | 'terrain' | 'satellite';

function rasterStyle(url: string, attribution: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: 'raster', tiles: [url], tileSize: 256, attribution } },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  };
}

function basemapStyle(b: FireBasemap): string | maplibregl.StyleSpecification {
  if (b === 'satellite') {
    return rasterStyle(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      'Esri World Imagery');
  }
  if (b === 'terrain') {
    return rasterStyle(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      'Esri World Topo');
  }
  return STREETS;
}

/** MapLibre-Layer-Ids je Waldbrand-Layer. Ein Fachlayer kann mehrere GL-Layer
 *  brauchen (Fläche + Kontur) — deshalb eine Liste, keine 1:1-Zuordnung. */
const GL_LAYERS: Record<FireLayerId, string[]> = {
  fireDanger: ['fire-danger-raster'],
  // F1: Footprint-Rechteck (Pixelausdehnung) UNTER dem Mittelpunkt — die Fläche
  // ist die räumliche Unsicherheit, der Punkt die Pixelmitte. Reihenfolge zählt:
  // MapLibre zeichnet in Einfügereihenfolge, der Punkt muss oben liegen.
  // BA3: das Detektionsraster liegt ganz unten — es ist die Fläche, auf der die
  // Pixelrechtecke und die Mittelpunkte liegen, nicht umgekehrt.
  // BC1: die Cluster-Hüllen liegen NOCH weiter unten — sie sind die größte und
  // unschärfste der drei Formen; über ihr müssen Raster, Pixelrechteck und Punkt
  // ablesbar bleiben. Sie hängen am selben Schalter (kein neuer Layer-Eintrag).
  fireHotspots: [
    'fire-clusters-fill', 'fire-clusters-line', 'fire-clusters-sel-line',
    'fire-hotspots-zone-fill', 'fire-hotspots-zone-line',
    'fire-hotspots-foot-fill', 'fire-hotspots-foot-line', 'fire-hotspots-foot-night',
    'fire-hotspots-points',
  ],
  // Custom-Layer (ScalarLayer), kein GeoJSON-Layer — deshalb kein Platzhalter
  // in installLayers; er wird in applyState eingehängt, sobald Daten da sind.
  fireWeather: ['fire-weather-scalar'],
  // WB4 gebaut: Raster-Layer (Brennmaterial, Schutzgebiete) und die WFS-Flaechen.
  fireFuel: ['fire-fuel-raster'],
  // E2: zwei Zeitkörbe als ZWEI Quellen mit eigener Darstellung — Saison (live)
  // und Archiv werden nie in einem Layer gemischt. Sichtbarkeit je Korb, s. applyState.
  // BF4: die frischen Flächen ZULETZT — sie liegen oben, weil sie die aktuelle
  // Lage tragen. Überlappen können sie sich nicht (die Körbe teilen die Zeit).
  fireBurnt: [
    'fire-burnt-archive-fill', 'fire-burnt-archive-line',
    'fire-burnt-season-fill', 'fire-burnt-season-line',
    'fire-burnt-week-fill', 'fire-burnt-week-line',
  ],
  fireContext: ['fire-context-raster', 'fire-clc-raster'],
  // WT1: WebGL-Custom-Layer (ScalarLayer) wie `fireWeather` — kein Platzhalter,
  // plus der leere Lizenzträger (s. ATTRIB_CARRIERS).
  fireSoilDryness: ['fire-soil-attrib', 'fire-soil-scalar'],
  // BP2: die Brandflächen der Registry — Fläche, Kontur, Hover-Kontur, Auswahl-
  // Kontur (die beiden letzten als FILTER-Layer, Muster `fire-clusters-sel-line`).
  fireFootprints: [
    'fire-footprints-fill', 'fire-footprints-line', 'fire-footprints-hover-line', 'fire-footprints-sel-line',
  ],
  // TA5: Symbol-Layer (Raute je Standort) + Auswahlring als Filter-Layer.
  fireAnomalies: [ANOMALY_LAYER_ID, ANOMALY_SEL_LAYER_ID],
};

/**
 * Lizenzträger für die WebGL-Custom-Layer.
 *
 * Ein `CustomLayerInterface` hat keine MapLibre-Source, und die
 * Attributionsleiste sammelt ausschließlich `source.attribution` **benutzter**
 * Quellen ein — die DWD-Zeile fiele also lautlos weg. Jeder dieser Layer bekommt
 * deshalb eine dauerhaft LEERE Quelle mit einem Layer darauf, der nichts
 * zeichnet (`circle-radius: 0`) und dessen Sichtbarkeit über dieselbe Schleife
 * läuft wie die des echten Layers: an ⇒ Zeile da, aus ⇒ Zeile weg.
 *
 * `fireWeather` fehlt hier absichtlich: sein ScalarLayer wurde in WB2 ohne
 * Träger gebaut. Das ist eine echte Lücke, aber nicht die dieser Phase — sie
 * ist als eigener Punkt notiert, statt sie hier nebenbei mitzuändern.
 */
const ATTRIB_CARRIERS: readonly { layerId: string; sourceId: string; attribution: string }[] = [
  { layerId: 'fire-soil-attrib', sourceId: 'fire-soil-attr', attribution: ICON_D2_SMI_ATTRIBUTION },
];

/**
 * GL-Layer, die als **WebGL-Custom-Layer** entstehen und deshalb in
 * `installLayers` KEINEN Platzhalter bekommen dürfen.
 *
 * Der Platzhalter trüge dieselbe Id, die Prüfung `if (!m.getLayer(...))` in
 * `applyState` fände ihn — der echte Layer käme nie in die Karte, sein `onAdd`
 * nie zum Zug, und die Daten lägen für immer in `_pending`. Genau so ist es beim
 * ersten Verdrahten des Treibers passiert: Werte korrekt geladen, nichts sichtbar.
 */
const CUSTOM_GL_LAYERS = new Set([
  'fire-weather-scalar', 'fire-soil-scalar',
]);

const BURNT_GL: Record<BurntBucket, string[]> = {
  week: ['fire-burnt-week-fill', 'fire-burnt-week-line'],
  season: ['fire-burnt-season-fill', 'fire-burnt-season-line'],
  archive: ['fire-burnt-archive-fill', 'fire-burnt-archive-line'],
};
const BURNT_BUCKETS: readonly BurntBucket[] = ['week', 'season', 'archive'];

interface Props {
  active: Set<FireLayerId>;
  basemap: FireBasemap;
  /** Gewählter Tagesschritt — steuert die WMS-`TIME`-Dimension und die DE-Stufe. */
  day: number;
  /** Tag als `YYYY-MM-DD` (UTC) aus `fireTime.dayToIsoDate()` — eine Datumsquelle. */
  isoDate: string;
  /** Satelliten-Hotspots im gewählten Fenster — die Pixelmitten. */
  hotspots: GeoJSON.FeatureCollection | null;
  /** Footprint-Rechtecke derselben Detektionen (aus `scan`×`track`). */
  hotspotFootprints: GeoJSON.FeatureCollection | null;
  /** BA3: die verschmolzenen Pixel je Brand — Fläche und Umriss des Rasters. */
  fireZones?: readonly FireZone[];
  /** BC1: die Brand-Cluster des angezeigten Fensters — Hülle, Stärke, Bbox. */
  clusters?: readonly FireCluster[];
  /** BC1: der in der Liste markierte Cluster — seine Hülle wird hervorgehoben. */
  selectedClusterId?: string | null;
  /**
   * BC1: Zähler, der einen Zoom auf den markierten Cluster auslöst.
   *
   * Warum ein Zähler und nicht die Kennung: derselbe Eintrag darf zweimal
   * hintereinander anspringen (Nutzer verschiebt die Karte und klickt erneut),
   * und ein Klick auf die Karte darf die Karte NICHT bewegen — der Zähler
   * trennt „markieren" sauber von „hinfahren".
   */
  focusNonce?: number;
  /** BC1: Klick auf eine Hülle (oder daneben) — meldet die Auswahl an die Liste. */
  onSelectCluster?: (id: string | null) => void;
  /**
   * BP2 — die Brandflächen der Registry als GeoJSON (`footprintsToGeoJSON`),
   * **memoisiert** vom Aufrufer (V-220). Eine Form je Brand, Statusfarbe aus
   * dem Feature; `dup: 1` = ein anderer aktiver Layer zeichnet dieselbe
   * Geometrie bereits, dann nur die Statuskontur.
   */
  footprintFc?: GeoJSON.FeatureCollection | null;
  /** BP2: die in der Liste gehoverte / markierte Brand-Kennung — Filter auf eigenen Konturlayern. */
  hoverFootprintId?: string | null;
  selectedFootprintId?: string | null;
  /**
   * BP2: Ziel des nächsten Fokus-Zooms — hat Vorrang vor der Cluster-Bbox. Der
   * Auslöser bleibt `focusNonce` (eine Kamera-Logik, s. Fokus-Effekt).
   */
  focusBbox?: [number, number, number, number] | null;
  /** BP2: Klick auf eine Brandfläche — meldet die Kennung an die Liste (kein Popup, keine Bewegung). */
  onSelectFootprint?: (id: string | null) => void;
  /** Welche Quelle die Hotspots geliefert hat — steuert die Attribution. */
  hotspotProvider: 'firms' | 'gwis';
  /** E3: welche Sub-Ansicht des EU-Index das Raster zeigt. */
  dangerView: DangerView;
  /** E2: kartierte Brandflächen je Zeitkorb (Saison live / Archiv). */
  burntSeason: GeoJSON.FeatureCollection | null;
  burntArchive: GeoJSON.FeatureCollection | null;
  /** BF4: die Flächen der letzten sieben Tage — gefiltert aus dem Saison-Korb. */
  burntWeekFc?: GeoJSON.FeatureCollection | null;
  /** Welche Körbe eingeblendet sind (nur wirksam, wenn `fireBurnt` aktiv). */
  burntBuckets: ReadonlySet<BurntBucket>;
  /** Polygon-Modell zu den Flächen beider Körbe — fürs Popup, per `id`. */
  burntLookup: ReadonlyMap<string, BurntPolygon>;
  /** Flächen der letzten 7 Tage — Bestätigung im Detektions-Steckbrief (E1/E2). */
  burntWeek: readonly BurntPolygon[];
  /**
   * VB3: Flächenschätzung je Zone (`zone.id` → Schätzung), damit der
   * Karten-Steckbrief dieselbe Aussage trägt wie das Panel. Leer, solange das
   * Kalibriermodell nicht geladen ist — dann bleibt der Rasterkopf stehen.
   */
  zoneEstimates?: ReadonlyMap<string, AreaEstimate>;
  /** GWBA1 A4: Ereignisse (für Überflüge/Ortsfestigkeit je Detektion), EMS-Abzeichen (A2), AT-Kontext (A3). */
  fireEvents?: readonly FireEvent[];
  emsActs?: readonly EmsActivation[];
  atContexts?: ReadonlyMap<string, AtWarnContext>;
  clcMask?: ClcMask | null;
  /** Feuerwetter-Treiber: das Trockenheits-Bild des passenden ICON-D2-Schritts. */
  weather: { image: HTMLCanvasElement; width: number; height: number;
    uvBounds: [number, number, number, number] } | null;
  /**
   * WT1 — Bodentrockenheit: das `dryness`-Bild des passenden ICON-D2-Schritts,
   * bereits für die gewählte Tiefe. Wie beim Treiber reicht der fertige Frame —
   * die Tiefen- und Zeitwahl trifft `FirePage`, die Karte zeichnet nur.
   */
  soil: { image: HTMLCanvasElement; width: number; height: number;
    uvBounds: [number, number, number, number] } | null;
  /** TA5: die Standorte persistenter Wärmequellen (eine Raute je Standort) + Auswahl + Klick. */
  anomalyFc?: GeoJSON.FeatureCollection | null;
  selectedSiteId?: string | null;
  onSelectSite?: (siteId: string, recordId: string | null) => void;
  /**
   * BH3: die Ereignisse der Brand-Historie (Monat/Saison) als Punkte — `historyToGeoJSON`,
   * memoisiert vom Aufrufer (V-220). `null` = Live-Modus, der Layer ist dann unsichtbar.
   * Kein `FireLayerId` und kein Bit: ein Anzeigemodus des Fensters, kein Layer im Dock.
   */
  historyFc?: GeoJSON.FeatureCollection | null;
  selectedHistoryId?: string | null;
  onSelectHistory?: (id: string) => void;
  /** Tag, der als Nächstes gebraucht wird — wird im Leerlauf vorgeladen. */
  prefetchIsoDate?: string | null;
  /** Meldet die Geräteklasse, sobald der GL-Kontext steht (fuer die Abspielrate). */
  onTier?: (tier: PerfTier) => void;
  onMapRef?: (map: maplibregl.Map | null) => void;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const EMPTY_EVENTS: readonly FireEvent[] = [];
const EMPTY_EMS: readonly EmsActivation[] = [];
const EMPTY_CTX: ReadonlyMap<string, AtWarnContext> = new Map();
/** VB3: stabile Leer-Referenz — sonst wechselt die Prop bei jedem Render (V-220). */
const EMPTY_ZONE_EST: ReadonlyMap<string, AreaEstimate> = new Map();
const EMPTY_ZONES: readonly FireZone[] = [];
const EMPTY_CLUSTERS: readonly FireCluster[] = [];

/**
 * Das Ereignis zu einer Detektion — Lage innerhalb Ausdehnung + Verknüpfungs-
 * radius, Zeit innerhalb [firstMs, lastMs]. Dieselbe Regel wie
 * `staticDetectionKeys` in fireEvents.ts; bei mehreren das nächste.
 */
export function eventForDetection(lat: number, lon: number, acqMs: number, events: readonly FireEvent[]): FireEvent | null {
  let best: FireEvent | null = null; let bestD = Infinity;
  for (const e of events) {
    if (acqMs < e.firstMs || acqMs > e.lastMs) continue;
    const k = Math.cos(((lat + e.lat) / 2) * Math.PI / 180) * 111_320;
    const d = Math.hypot((lon - e.lon) * k, (lat - e.lat) * 111_320);
    if (d > e.extentKm * 500 + LINK_RADIUS_M) continue;
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

/** Zuletzt gesetzte Daten je GeoJSON-Quellinstanz — s. Kommentar in `applyState`. */
const LAST_SET_DATA = new WeakMap<object, GeoJSON.FeatureCollection>();

/** Füllfarbe der Brandflächen nach dominanter Landbedeckung — aus EINER Tabelle
 *  (`LANDCOVER_COLOR`), die auch die Legende speist. */
/** BP2: Statusfarbe aus `STATUS_COLOR` — eine Quelle für Karte, Liste, Legende. */
function footprintStatusColorExpression(): maplibregl.ExpressionSpecification {
  const stops: string[] = [];
  for (const [k, c] of Object.entries(STATUS_COLOR)) stops.push(k, c);
  return ['match', ['get', 'status'], ...stops, STATUS_COLOR['no-signal']] as unknown as maplibregl.ExpressionSpecification;
}

function landcoverColorExpression() {
  const stops: string[] = [];
  for (const k of LANDCOVER_KEYS) stops.push(k, LANDCOVER_COLOR[k]);
  return ['match', ['get', 'lc'], ...stops, LANDCOVER_COLOR.OTHERLC] as unknown as maplibregl.ExpressionSpecification;
}

export default function FireMap({
  active, basemap, day, isoDate, hotspots, hotspotFootprints,
  fireZones = EMPTY_ZONES,
  clusters = EMPTY_CLUSTERS, selectedClusterId = null, focusNonce = 0, onSelectCluster,
  footprintFc = null, hoverFootprintId = null, selectedFootprintId = null, focusBbox = null, onSelectFootprint,
  hotspotProvider, dangerView, burntSeason, burntArchive, burntWeekFc = null,
  burntBuckets, burntLookup, burntWeek, zoneEstimates = EMPTY_ZONE_EST,
  fireEvents = EMPTY_EVENTS, emsActs = EMPTY_EMS, atContexts = EMPTY_CTX, clcMask = null,
  weather, soil, prefetchIsoDate, onTier, onMapRef,
  anomalyFc = null, selectedSiteId = null, onSelectSite,
  historyFc = null, selectedHistoryId = null, onSelectHistory,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  /**
   * Der jeweils AKTUELLE Anzeigezustand als Ref.
   *
   * ── Warum nicht einfach Effekte mit Abhängigkeiten ──────────────────────────
   * Die erste Fassung reihte jede Änderung über ein `whenStyleReady` in eine
   * Warteschlange ein und leerte sie beim `styledata`-Ereignis. Das ging schief,
   * und zwar lautlos: `styledata` feuert mehrfach und schon **bevor** die
   * eigenen Layer angelegt sind. Die eingereihte Arbeit lief dann gegen eine
   * Karte ohne Layer, tat nichts — und wurde nie wiederholt. Ergebnis: alle
   * Layer blieben auf `visibility: none`, die Raster-Quelle fehlte ganz, und
   * es gab keinerlei Fehlermeldung.
   *
   * Die robuste Form ist **idempotentes Nachziehen**: Der gewünschte Zustand
   * steht in Refs, und `applyState()` stellt ihn her — egal wie oft und
   * wann es aufgerufen wird. Aufgerufen wird es nach jedem Stil-Ereignis und
   * bei jeder Zustandsänderung. Das deckt zugleich V-164 ab (Toggle vor dem
   * Stil-Load) und den Basiskarten-Wechsel, bei dem MapLibre alle eigenen
   * Layer verwirft.
   */
  /** BA3: GeoJSON des Rasters — nur neu, wenn sich die Zonen ändern (setData
   *  vergleicht Referenzen; ein Neubau je Render wäre eine Endlosschleife, V-220). */
  const zoneFc = useMemo(
    () => (fireZones.length > 0 ? zonesToGeoJSON(fireZones) : null),
    [fireZones],
  );
  /** BC1: die Hüllen — dieselbe Referenzregel wie beim Raster (V-220). */
  const clusterFc = useMemo(
    () => (clusters.length > 0 ? clustersToGeoJSON(clusters) : null),
    [clusters],
  );
  const stateRef = useRef({
    active, isoDate, hotspots, hotspotFootprints, fireZones, zoneFc,
    clusters, clusterFc, selectedClusterId, footprintFc, hoverFootprintId, selectedFootprintId,
    hotspotProvider, dangerView, burntSeason, burntArchive, burntWeekFc, burntBuckets, burntLookup, burntWeek, zoneEstimates, weather,
    soil, fireEvents, emsActs, atContexts, clcMask,
    anomalyFc, selectedSiteId, historyFc, selectedHistoryId,
  });
  stateRef.current = {
    active, isoDate, hotspots, hotspotFootprints, fireZones, zoneFc,
    clusters, clusterFc, selectedClusterId, footprintFc, hoverFootprintId, selectedFootprintId,
    hotspotProvider, dangerView, burntSeason, burntArchive, burntWeekFc, burntBuckets, burntLookup, burntWeek, zoneEstimates, weather,
    soil, fireEvents, emsActs, atContexts, clcMask,
    anomalyFc, selectedSiteId, historyFc, selectedHistoryId,
  };
  /** Der Auswahl-Rückruf, so wie er JETZT ist — der Klick-Handler wird einmal
   *  registriert und dürfte sonst für immer den ersten Rückruf halten. */
  const onSelectClusterRef = useRef(onSelectCluster);
  onSelectClusterRef.current = onSelectCluster;
  /** BP2: dasselbe für die Brandflächen — der Handler ist einmal registriert. */
  const onSelectFootprintRef = useRef(onSelectFootprint);
  onSelectFootprintRef.current = onSelectFootprint;
  /** TA5: dasselbe für die Standort-Rauten. */
  const onSelectSiteRef = useRef(onSelectSite);
  onSelectSiteRef.current = onSelectSite;
  /** BH3: dasselbe für die Historie-Punkte. */
  const onSelectHistoryRef = useRef(onSelectHistory);
  onSelectHistoryRef.current = onSelectHistory;
  /** Der ScalarLayer des Treibers — eine Instanz, die über Stilwechsel hinweg
   *  neu eingehängt wird. MapLibre verwirft Custom-Layer beim setStyle. */
  const weatherLayerRef = useRef<ScalarLayer | null>(null);
  /** WT1 — der ScalarLayer der Bodentrockenheit. Eine Instanz über Stilwechsel
   *  hinweg, genau wie der Treiber (MapLibre verwirft Custom-Layer beim setStyle). */
  const soilLayerRef = useRef<ScalarLayer | null>(null);
  /** Für welchen Tag UND welche Sub-Ansicht hängt die Raster-Quelle gerade? */
  const rasterDayRef = useRef<string | null>(null);
  /** Der offene Detektions-Steckbrief — höchstens einer gleichzeitig. */
  const popupRef = useRef<maplibregl.Popup | null>(null);

  /** Stellt den gewünschten Zustand her. Idempotent, jederzeit aufrufbar. */
  function applyState(m: maplibregl.Map) {
    if (!m.getStyle() || !m.isStyleLoaded()) return;
    const s = stateRef.current;

    installLayers(m, basemapRef.current);

    // EU-Raster: Die Kachel-URL trägt den Tag UND den Layer der Sub-Ansicht (E3),
    // also muss die Quelle bei einem Wechsel ersetzt werden — eine `raster`-
    // Source lässt sich nicht ändern.
    const dangerLayer = DANGER_VIEWS[s.dangerView].layer;
    const rasterKey = `${s.isoDate}|${dangerLayer}`;
    if (rasterDayRef.current !== rasterKey || !m.getSource('fire-danger')) {
      if (m.getLayer('fire-danger-raster')) m.removeLayer('fire-danger-raster');
      if (m.getSource('fire-danger')) m.removeSource('fire-danger');
      m.addSource('fire-danger', gwisRasterSource({ isoDate: s.isoDate, layer: dangerLayer }));
      m.addLayer({
        id: 'fire-danger-raster',
        type: 'raster',
        source: 'fire-danger',
        paint: { 'raster-opacity': 0.62 },
      }, firstLayerAbove(m, 'fireDanger'));
      rasterDayRef.current = rasterKey;
    }

    // Daten. Ohne Daten ausdrücklich die LEERE Sammlung — ein Layer, der beim
    // Tageswechsel den Vortagesstand weiterzeigt, wäre die stille Falschaussage.
    const data: Array<[string, GeoJSON.FeatureCollection | null]> = [
      ['fire-hotspots', s.hotspots],
      ['fire-hotspots-foot', s.hotspotFootprints], ['fire-hotspots-zone', s.zoneFc],
      ['fire-clusters', s.clusterFc],
      ['fire-burnt-season', s.burntSeason], ['fire-burnt-archive', s.burntArchive],
      ['fire-burnt-week', s.burntWeekFc],
      ['fire-footprints', s.footprintFc],
      [ANOMALY_SOURCE_ID, s.anomalyFc],
      [HISTORY_SOURCE_ID, s.historyFc],
    ];
    for (const [id, fc] of data) {
      const src = m.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (!src) continue;
      // Nur setzen, wenn sich die Referenz geändert hat (oder die Quelle nach
      // einem Stilwechsel neu ist). `applyState` läuft auch auf `idle` — und
      // `setData` löst selbst wieder `idle` aus. Ohne diese Sperre entsteht
      // eine Endlosschleife setData → idle → setData, die bei den 977
      // Archiv-Polygonen (E2, 4,8 MB) 200–400 ms je Sekunde kostet — im
      // Prod-Build gemessen (`tests.md` §V-WALDBRAND-EFFIS). Bei den kleinen
      // Quellen fiel sie nur nicht auf.
      // Schlüssel ist die QUELLINSTANZ: nach einem Stilwechsel legt
      // `installLayers` neue Instanzen an, die hier keinen Eintrag haben —
      // dann wird zwingend gesetzt. Kein zweiter Zustand, der stimmen muss.
      const want = fc ?? EMPTY_FC;
      if (LAST_SET_DATA.get(src) === want) continue;
      src.setData(want);
      LAST_SET_DATA.set(src, want);
    }

    // Die Hotspot-Attribution hängt an der Quelle, die tatsächlich geantwortet
    // hat. Im Rückfall auf GWIS darf NASA dort nicht stehen — und umgekehrt.
    // Gesetzt VOR `setData` wäre zu früh: die Attributionsleiste zieht erst beim
    // `sourcedata`-Ereignis nach, das `setData` gerade ausgelöst hat.
    const hotspotAttr = s.hotspotProvider === 'gwis' ? GWIS_HOTSPOT_ATTRIBUTION : FIRMS_ATTRIBUTION;
    for (const id of ['fire-hotspots', 'fire-hotspots-foot', 'fire-hotspots-zone', 'fire-clusters']) {
      const src = m.getSource(id) as { attribution?: string } | undefined;
      if (src && src.attribution !== hotspotAttr) src.attribution = hotspotAttr;
    }
    // BP2: die Registry zeichnet FIRMS-abgeleitete Raster UND EFFIS-Flächen —
    // beide Lizenzzeilen, die Hotspot-Zeile in der jeweils zutreffenden Fassung.
    {
      const fpAttr = `${hotspotAttr} · ${EFFIS_BURNT_ATTRIBUTION}`;
      const src = m.getSource('fire-footprints') as { attribution?: string } | undefined;
      if (src && src.attribution !== fpAttr) src.attribution = fpAttr;
    }

    // BC1: die Hervorhebung des markierten Clusters. Als FILTER auf einem
    // eigenen Layer und nicht als Paint-Ausdruck: der Filter übersteht einen
    // Stilwechsel, weil `applyState` ihn ohnehin bei jedem Durchlauf setzt —
    // ein umgeschriebener Paint-Ausdruck müsste an zwei Stellen stimmen.
    if (m.getLayer('fire-clusters-sel-line')) {
      m.setFilter('fire-clusters-sel-line', ['==', ['get', 'id'], s.selectedClusterId ?? '']);
    }
    // BP2: Hover- und Auswahl-Kontur der Brandflächen — dieselbe Filter-Regel.
    // Der Hover läuft zusätzlich über einen eigenen Mini-Effekt (unten), damit
    // nicht jede Mausbewegung den ganzen applyState-Durchlauf zieht; hier wird
    // er idempotent nachgezogen, damit er den Basiskarten-Wechsel übersteht.
    if (m.getLayer('fire-footprints-hover-line')) {
      m.setFilter('fire-footprints-hover-line', ['==', ['get', 'id'], s.hoverFootprintId ?? '']);
    }
    if (m.getLayer('fire-footprints-sel-line')) {
      m.setFilter('fire-footprints-sel-line', ['==', ['get', 'id'], s.selectedFootprintId ?? '']);
    }
    // TA5: Auswahlring der Standort-Raute — dieselbe Filter-Regel.
    if (m.getLayer(ANOMALY_SEL_LAYER_ID)) {
      m.setFilter(ANOMALY_SEL_LAYER_ID, ['==', ['get', 'id'], s.selectedSiteId ?? '']);
    }
    // BH3: Historie-Punkte sichtbar genau dann, wenn ein Historie-Fenster gewählt ist.
    for (const id of [HISTORY_LAYER_ID, HISTORY_SEL_LAYER_ID]) {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', s.historyFc ? 'visible' : 'none');
    }
    if (m.getLayer(HISTORY_SEL_LAYER_ID)) {
      m.setFilter(HISTORY_SEL_LAYER_ID, ['==', ['get', 'id'], s.selectedHistoryId ?? '']);
    }

    // Feuerwetter-Treiber als ScalarLayer (WebGL-Custom-Layer, kein GeoJSON).
    // MapLibre verwirft Custom-Layer beim Stilwechsel, deshalb hier idempotent
    // einhängen statt einmalig beim Mounten.
    if (s.weather) {
      if (!weatherLayerRef.current) {
        weatherLayerRef.current = new ScalarLayer({
          id: 'fire-weather-scalar',
          colorRamp: drynessRamp,
          // Unter RELHUM_DRY_FROM (60 % Feuchte ⇒ dryness 0,4) ausblenden: eine
          // Vollflächen-Einfärbung über ganz DACH wäre keine Aussage. Der Fade
          // endet bei 0,5 (50 % Feuchte), ab da voll deckend.
          visRange: { start: (RELHUM_MAX - RELHUM_DRY_FROM) / RELHUM_MAX, end: 0.5 },
          opacity: 0.72,
          zoomAttenuation: { from: 11, perStep: 0.08, floor: 0.7 },
        });
      }
      if (!m.getLayer('fire-weather-scalar')) {
        m.addLayer(
          weatherLayerRef.current as unknown as maplibregl.LayerSpecification,
          firstLayerAbove(m, 'fireWeather'),
        );
      }
      // DEV: Instanz für die Verifikation greifbar machen. MapLibre gibt
      // Custom-Layer über `getLayer()` nicht heraus, und ohne Blick auf die
      // Werte lässt sich „korrekt, aber feuchte Luft" nicht von „kaputt"
      // unterscheiden — beides sieht auf der Karte gleich aus.
      if (import.meta.env.DEV) {
        (window as unknown as { __fireWeatherLayer?: ScalarLayer }).__fireWeatherLayer =
          weatherLayerRef.current;
      }
      weatherLayerRef.current.setData(s.weather.image, {
        width: s.weather.width, height: s.weather.height,
        // Der Kanal trägt bereits `dryness` 0..1 (Achsenumkehr im Loader).
        vMin: 0, vMax: 1,
        uvBounds: s.weather.uvBounds,
      });
    }

    /**
     * WT1 — Bodentrockenheit (`ScalarLayer`), Muster wie der Luft-Treiber
     * darüber: idempotent einhängen, weil `setStyle` Custom-Layer verwirft.
     *
     * `visRange` bleibt bewusst bei 0: Anders als beim Luft-Treiber gibt es hier
     * keinen Bereich, den man wegblenden dürfte. Die Rampe selbst beginnt bei
     * `dryness` 0 durchsichtig und wird erst mit sinkender Bodenfeuchte deckend
     * (`soilDrynessRamp`) — die Ausblendung sitzt also in der Farbe, wo sie an
     * eine physikalische Grenze (Feldkapazität) gebunden ist, statt in einer
     * zweiten, frei gewählten Schwelle daneben.
     */
    if (s.soil) {
      if (!soilLayerRef.current) {
        soilLayerRef.current = new ScalarLayer({
          id: 'fire-soil-scalar',
          colorRamp: soilDrynessRamp,
          visRange: { start: 0, end: 0 },
          opacity: 0.75,
          zoomAttenuation: { from: 11, perStep: 0.08, floor: 0.7 },
        });
      }
      if (!m.getLayer('fire-soil-scalar')) {
        m.addLayer(
          soilLayerRef.current as unknown as maplibregl.LayerSpecification,
          firstLayerAbove(m, 'fireSoilDryness'),
        );
      }
      if (import.meta.env.DEV) {
        (window as unknown as { __fireSoilLayer?: ScalarLayer }).__fireSoilLayer = soilLayerRef.current;
      }
      soilLayerRef.current.setData(s.soil.image, {
        width: s.soil.width, height: s.soil.height,
        // Der Kanal trägt bereits `dryness` 0..1 (Achsenumkehr + Klemmung im Loader).
        vMin: 0, vMax: 1,
        uvBounds: s.soil.uvBounds,
      });
    }

    // Die DACH-Maske gehört ÜBER alle Fachlayer, nicht darunter.
    // Sonst färbt der Treiber-Layer die ICON-D2-Domäne bis nach Polen und
    // Tschechien ein, und die Ansicht behauptet Aussagen über Länder, für die
    // sie keine amtliche Entsprechung zeigt. `moveLayer` ohne Ziel = nach oben;
    // idempotent, also bei jedem Durchlauf unschädlich.
    if (m.getLayer('fire-dach-mask-fill')) m.moveLayer('fire-dach-mask-fill');

    // Sichtbarkeit ZULETZT: erst jetzt existieren alle Layer sicher.
    for (const id of FIRE_LAYER_ORDER) {
      const visible = s.active.has(id) ? 'visible' : 'none';
      for (const gl of GL_LAYERS[id]) {
        if (m.getLayer(gl)) m.setLayoutProperty(gl, 'visibility', visible);
      }
    }
    // E2: innerhalb des Brandflächen-Layers je Korb — ein abgewählter Korb ist
    // unsichtbar, auch wenn der Layer an ist.
    for (const bucket of BURNT_BUCKETS) {
      const visible = s.active.has('fireBurnt') && s.burntBuckets.has(bucket) ? 'visible' : 'none';
      for (const gl of BURNT_GL[bucket]) if (m.getLayer(gl)) m.setLayoutProperty(gl, 'visibility', visible);
    }
  }

  // --- Instanz aufbauen (einmal) --------------------------------------------
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: hostRef.current,
      style: basemapStyle(basemapRef.current),
      bounds: DACH_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true },
      // Der Waldbrand-Blick ist ein Flächenblick — Neigung und Drehung würden
      // die Vergleichbarkeit der Länder nur stören.
      pitchWithRotate: false,
      dragRotate: false,
    });
    // Brandradar Command-Deck: Zoom oben rechts unter dem Basemap-Umschalter
    // (Vorlage references/brandradar.dc.html) — die Attribution bleibt unten.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    if (import.meta.env.DEV) {
      (window as unknown as { __fireMap?: maplibregl.Map }).__fireMap = map;
    }
    // Beide Ereignisse: LOAD einmal beim Start, STYLEDATA nach jedem
    // Basiskarten-Wechsel — MapLibre verwirft dabei alle eigenen Layer. IDLE
    // fängt den Rest ab. applyState ist idempotent, mehrfaches Auslösen ist folgenlos.
    map.on('load', () => {
      applyState(map);
      // Geräteklasse EINMAL bestimmen und melden. Sie steuert die
      // Abspielgeschwindigkeit — dieselbe Klassifikation wie beim
      // `FrameGovernor` der Windpartikel, nur an einem anderen Stellrad.
      // Kein zweiter Regelkreis, damit D-09 gewahrt bleibt.
      try {
        const gl = map.painter?.context?.gl as WebGLRenderingContext | undefined;
        onTier?.(initialTier(readDeviceCaps(gl ?? null)));
      } catch {
        onTier?.(initialTier(readDeviceCaps(null)));
      }
    });
    map.on('styledata', () => applyState(map));
    map.on('idle', () => applyState(map));

    // --- Detektions-Steckbrief (F1) ------------------------------------------
    // Ein Klick auf eine Thermalanomalie öffnet ihre gemessenen Werte. Der
    // Handler hängt an der Karte, nicht am Layer: `map.on('click', layerId, …)`
    // wirft, wenn der Layer beim Registrieren noch nicht existiert — und die
    // Hotspot-Layer entstehen erst in `installLayers`, nach einem Stilwechsel
    // sogar erneut. `queryRenderedFeatures` ist dagegen jederzeit gültig.
    const BURNT_FILLS = ['fire-burnt-week-fill', 'fire-burnt-season-fill', 'fire-burnt-archive-fill'];
    const present = (ids: string[]) => ids.filter((id) => !!map.getLayer(id));
    map.on('click', (ev) => {
      const s = stateRef.current;
      /**
       * BC1 — die Auswahl läuft VOR der Popup-Kette und greift nicht in sie ein:
       * Sie öffnet nichts, schließt nichts und hat kein `return`. Ein Klick auf
       * eine Hülle markiert die Zeile in der Liste; ein Klick daneben hebt die
       * Markierung auf. Alles darunter (Detektions-Steckbrief, Flächen-Popup,
       * Raster-Popup) verhält sich exakt wie vorher.
       */
      /**
       * BP2 — Auswahl einer Brandfläche der Registry: an DERSELBEN Stelle wie die
       * Cluster-Auswahl, vor der Popup-Kette, ohne `return`, ohne Popup. Trifft
       * der Klick eine Brandfläche, wird sie gemeldet; den gegenseitigen
       * Ausschluss zur Cluster-Auswahl regelt die Seite in ihren Settern.
       */
      // BH3: ein Historie-Punkt — nur im Historie-Modus sichtbar und damit klickbar.
      if (onSelectHistoryRef.current && s.historyFc && map.getLayer(HISTORY_LAYER_ID)) {
        const hs = map.queryRenderedFeatures(ev.point, { layers: [HISTORY_LAYER_ID] });
        const id = hs.length > 0 ? String(hs[0].properties?.id ?? '') : '';
        if (id) { onSelectHistoryRef.current(id); return; }
      }
      // TA5: eine Standort-Raute vor den Flächen — sie ist die spezifischere Aussage. Mit
      // Eintrag im Fenster springt die Auswahl auf ihn, sonst nur auf den Standort.
      if (onSelectSiteRef.current && map.getLayer(ANOMALY_LAYER_ID)) {
        const sites = map.queryRenderedFeatures(ev.point, { layers: [ANOMALY_LAYER_ID] });
        const siteId = sites.length > 0 ? String(sites[0].properties?.id ?? '') : null;
        if (siteId) {
          const recordId = String(sites[0].properties?.recordId ?? '');
          onSelectSiteRef.current(siteId, recordId || null);
          return;
        }
      }
      if (onSelectFootprintRef.current && map.getLayer('fire-footprints-fill')) {
        const fps = map.queryRenderedFeatures(ev.point, { layers: ['fire-footprints-fill'] });
        // Bei überlappenden Flächen die KLEINSTE — sie ist die spezifischere;
        // ohne Flächenangabe zählt die Reihenfolge der Zeichnung.
        const pick = fps.reduce<maplibregl.MapGeoJSONFeature | null>((a, b) => {
          if (!a) return b;
          const aa = Number(a.properties?.areaHa ?? Infinity); const bb = Number(b.properties?.areaHa ?? Infinity);
          return bb < aa ? b : a;
        }, null);
        const id = pick ? String(pick.properties?.id ?? '') : null;
        if (id && id !== s.selectedFootprintId) onSelectFootprintRef.current(id);
        else if (!id && s.selectedFootprintId) {
          // Klick daneben hebt die Markierung auf — außer, er trifft eine Hülle
          // (dann übernimmt der Cluster-Block; die Seite nullt die Brandfläche).
          const hulls = map.getLayer('fire-clusters-fill') ? map.queryRenderedFeatures(ev.point, { layers: ['fire-clusters-fill'] }) : [];
          if (hulls.length === 0) onSelectFootprintRef.current(null);
        }
      }
      if (onSelectClusterRef.current) {
        const hullLayer = map.getLayer('fire-clusters-fill') ? ['fire-clusters-fill'] : [];
        const hulls = hullLayer.length > 0 ? map.queryRenderedFeatures(ev.point, { layers: hullLayer }) : [];
        // Bei überlappenden Hüllen die STÄRKSTE — sie ist die, die in der Liste
        // oben steht und die der Nutzer meint, wenn er in ein Nest klickt.
        const pick = hulls.reduce<maplibregl.MapGeoJSONFeature | null>(
          (a, b) => (a && Number(a.properties?.sumFrp ?? 0) >= Number(b.properties?.sumFrp ?? 0) ? a : b), null);
        const id = pick ? String(pick.properties?.id ?? '') : null;
        if (id !== s.selectedClusterId) onSelectClusterRef.current(id || null);
      }
      if (map.getLayer('fire-hotspots-points')) {
        const hits = map.queryRenderedFeatures(ev.point, { layers: ['fire-hotspots-points'] });
        if (hits.length > 0) {
          // In einem dichten Nest (Industriestandorte häufen dutzende Detektionen auf
          // wenige hundert Meter) liegen mehrere Punkte übereinander. Ohne Hinweis
          // klickt man den großen dunklen Kreis an und bekommt die Werte eines
          // kleinen darunter — ein stiller Etikettenschwindel. Gezeigt wird deshalb
          // die JÜNGSTE Detektion, und die Zahl der übrigen steht im Steckbrief.
          const chosen = hits.reduce((a, b) =>
            (Number(b.properties?.acqMs ?? 0) > Number(a.properties?.acqMs ?? 0) ? b : a));
          const p = chosen.properties as unknown as FirmsProps;
          // E1/E2: die Bestätigung durch die EFFIS-Kartierung — räumlich UND
          // zeitlich passend, sonst nichts. Die Pixelmitte kommt aus der Geometrie,
          // nicht aus dem Klickpunkt.
          const geom = chosen.geometry as GeoJSON.Point;
          const mapped = typeof p.acqMs === 'number' && Array.isArray(geom?.coordinates)
            ? mappedAreaFor({ lon: geom.coordinates[0], lat: geom.coordinates[1], acqMs: p.acqMs }, s.burntWeek)
            : null;
          // GWBA1 A4: die drei Beschriftungen — Bestätigung (Kartierung/EMS/amtlich),
          // Plausibilität (Überflüge, AT-Kontext), sonst unbestätigt. Ereignis
          // per Lage+Zeit, EMS im Umkreis, GeoSphere je Ereignis.
          const evt = Array.isArray(geom?.coordinates) && typeof p.acqMs === 'number'
            ? eventForDetection(geom.coordinates[1], geom.coordinates[0], p.acqMs, s.fireEvents)
            : null;
          const assessment = Array.isArray(geom?.coordinates) ? assess({
            mapped,
            official: null, // A1 (MoWaS) erst nach Freigabe
            ems: emsActivationFor(
              evt ? { lat: evt.lat, lon: evt.lon, firstMs: evt.firstMs } : { lat: geom.coordinates[1], lon: geom.coordinates[0] },
              s.emsActs),
            overpasses: evt?.overpasses ?? null,
            suspectedStatic: p.stat === 1,
            atContext: evt ? (s.atContexts.get(evt.id) ?? null) : null,
            landcover: toAssessmentLandcover(landcoverAt(s.clcMask, geom.coordinates[1], geom.coordinates[0])),
          }) : null;
          // BA3: das Raster, zu dem diese Detektion gehört — Fläche und Maßstab
          // stehen damit im selben Steckbrief wie die Detektion.
          const zone = Array.isArray(geom?.coordinates) && typeof p.acqMs === 'number'
            ? zoneForDetection(geom.coordinates[0], geom.coordinates[1], p.acqMs, s.fireZones)
            : null;
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
            .setLngLat(ev.lngLat)
            .setHTML(hotspotPopupHtml(p, hits.length, mapped, assessment,
              Array.isArray(geom?.coordinates) ? countryGuess(geom.coordinates[1], geom.coordinates[0]) : null,
              zone, zone ? s.zoneEstimates.get(zone.id) ?? null : null))
            .addTo(map);
          return;
        }
      }
      // E2: Klick auf eine kartierte Brandfläche — der Steckbrief der Fläche
      // mit der vollen Landbedeckungs-Aufschlüsselung aus dem Feature.
      // Die amtliche Kartierung hat Vorrang vor dem abgeleiteten Raster: wo
      // beide liegen, ist die kartierte Fläche die Antwort.
      const fills = present(BURNT_FILLS);
      const bHits = fills.length > 0 ? map.queryRenderedFeatures(ev.point, { layers: fills }) : [];
      const poly = bHits.length > 0 ? s.burntLookup.get(String(bHits[0].properties?.id)) : undefined;
      if (poly) {
        const lid = bHits[0].layer.id;
        const bucket: BurntBucket = lid.includes('archive') ? 'archive' : lid.includes('week') ? 'week' : 'season';
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '300px' })
          .setLngLat(ev.lngLat)
          .setHTML(burntPopupHtml(poly, bucket, bHits.length))
          .addTo(map);
        return;
      }
      // BA3: Klick in das Detektionsraster, aber nicht auf einen Punkt.
      // `zoneAt` am Modell statt `queryRenderedFeatures`: das Modell trägt
      // Pixelzahl, Zeitraum und mittlere Pixelgröße, das gezeichnete Feature nur
      // Kennung und Fläche.
      if (!s.active.has('fireHotspots') || s.fireZones.length === 0) return;
      const zone = zoneAt(ev.lngLat.lng, ev.lngLat.lat, s.fireZones);
      if (!zone) return;
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '300px' })
        .setLngLat(ev.lngLat)
        .setHTML(zonePopupHtml(
          zone,
          mappedAreaFor({ lon: zone.lon, lat: zone.lat, acqMs: zone.lastMs }, s.burntWeek),
          s.zoneEstimates.get(zone.id) ?? null,
        ))
        .addTo(map);
    });
    map.on('mousemove', (ev) => {
      const layers = present(['fire-hotspots-points', 'fire-hotspots-zone-fill', 'fire-clusters-fill', 'fire-footprints-fill', ANOMALY_LAYER_ID, ...BURNT_FILLS]);
      if (layers.length === 0) return;
      const over = map.queryRenderedFeatures(ev.point, { layers }).length > 0;
      map.getCanvas().style.cursor = over ? 'pointer' : '';
    });
    mapRef.current = map;
    onMapRef?.(map);
    // Nur im DEV-Build: Zugriff auf die Instanz für die Verifikation über
    // Chrome DevTools MCP (Muster window.__verifyRadarModel, radarModel.ts).
    if (import.meta.env.DEV) (window as unknown as { __fireMap?: maplibregl.Map }).__fireMap = map;
    return () => {
      onMapRef?.(null);
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      rasterDayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Basiskarte wechseln ---------------------------------------------------
  // Beim ERSTEN Lauf nichts tun: die Karte wurde bereits mit dieser Basiskarte
  // gebaut. Ein setStyle an dieser Stelle hat in der ersten Fassung den
  // frisch geladenen Stil noch einmal zurückgesetzt und damit die Reihenfolge
  // von Layer-Anlage und Sichtbarkeit durcheinandergebracht.
  const basemapRef = useRef(basemap);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || basemapRef.current === basemap) return;
    basemapRef.current = basemap;
    rasterDayRef.current = null; // Quellen sind nach dem Stilwechsel weg
    m.setStyle(basemapStyle(basemap));
  }, [basemap]);

  // --- BC1: auf den Cluster zoomen, den die Liste anspringt -------------------
  // Ausgelöst wird ausschließlich über `focusNonce` (s. Props): eine Auswahl per
  // KARTENKLICK darf die Karte nicht wegziehen — man klickt dort auf das, was
  // man ohnehin sieht.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || focusNonce <= 0) return;
    // BP2: EINE Kamera-Logik — die Registry gibt ihre Bbox mit (`focusBbox`),
    // sonst gilt wie bisher die Bbox des markierten Clusters.
    const target = focusBbox ?? clusters.find((x) => x.id === selectedClusterId)?.bbox ?? null;
    if (!target) return;
    // Ein Cluster aus einer Detektion hat eine Nullfläche als Bbox. Ohne Puffer
    // führte `fitBounds` auf den maximalen Zoom — auf 375-m-Pixel gerechnet wäre
    // das eine Genauigkeit, die die Quelle nicht hat. ~2 km Rand plus Deckel.
    const pad = 0.02;
    const [w, s, e, n] = target;
    m.fitBounds([[w - pad, s - pad], [e + pad, n + pad]], {
      padding: 60, maxZoom: 11, duration: 600,
    });
    // `focusNonce` ist der Auslöser; `clusters`/`selectedClusterId` werden dabei
    // nur gelesen. Stünden sie in den Abhängigkeiten, spränge die Karte bei jeder
    // Neuberechnung der Liste erneut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  // --- Prefetch des Folgetags (WB3) ------------------------------------------
  // Läuft im Leerlauf und lädt die Kacheln des NÄCHSTEN Tages in den
  // HTTP-Cache des Browsers. Ein zweiter, unsichtbarer Layer täte es nicht:
  // MapLibre fragt für `visibility: none` nachweislich null Kacheln an
  // (in WB2 gemessen) — deshalb `new Image()` auf die echten Kachel-URLs.
  const prefetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !prefetchIsoDate) return;
    // Schlüssel = Tag + Sub-Ansicht: der Wechsel der Ansicht braucht andere Kacheln.
    const prefetchKey = `${prefetchIsoDate}|${dangerView}`;
    if (prefetchedRef.current.has(prefetchKey)) return;

    const ric: (cb: () => void) => number =
      typeof window.requestIdleCallback === 'function'
        ? (cb) => window.requestIdleCallback(cb, { timeout: 2500 })
        : (cb) => window.setTimeout(cb, 800);
    const cancel: (id: number) => void =
      typeof window.cancelIdleCallback === 'function'
        ? (id) => window.cancelIdleCallback(id)
        : (id) => window.clearTimeout(id);

    const bilder: HTMLImageElement[] = [];
    const id = ric(() => {
      const b = m.getBounds();
      const urls = gwisPrefetchUrls(
        prefetchIsoDate,
        { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
        m.getZoom(),
        40,
        DANGER_VIEWS[dangerView].layer,
      );
      prefetchedRef.current.add(prefetchKey);
      for (const u of urls) {
        const img = new Image();
        // Der Prefetch darf nie ein Problem MELDEN: schlägt er fehl, lädt der
        // Tag beim Umschalten eben normal. Fehler hier wären reines Rauschen.
        img.onerror = () => { /* egal */ };
        img.src = u;
        bilder.push(img);
      }
    });
    return () => {
      cancel(id);
      // Laufende Vorlade-Anfragen abbrechen, wenn der Nutzer weiterzieht —
      // sonst konkurrieren sie mit dem Tag, den er gerade sehen will.
      for (const img of bilder) img.src = '';
    };
  }, [prefetchIsoDate, dangerView]);

  // --- Zustandsänderungen nachziehen ----------------------------------------
  // Ein Effekt für alles: applyState stellt den Sollzustand her, statt
  // einzelne Übergänge zu verwalten.
  useEffect(() => {
    const m = mapRef.current;
    if (m) applyState(m);
  }, [active, isoDate, hotspots, dangerView,
    burntSeason, burntArchive, burntBuckets, weather, soil, day,
    // BP2: neue Referenzen der Registry sofort, nicht erst beim nächsten `idle`.
    footprintFc, selectedFootprintId,
    // TA5: Standorte und ihre Auswahl.
    anomalyFc, selectedSiteId]);

  /**
   * BP2 — Hover-Kontur der Brandflächen als eigener Mini-Effekt: nur ein
   * `setFilter`, kein Attributions-/Custom-Layer-Durchlauf je Mausbewegung.
   * `applyState` setzt denselben Filter idempotent (Basiskarten-Wechsel).
   */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getStyle() || !m.getLayer('fire-footprints-hover-line')) return;
    m.setFilter('fire-footprints-hover-line', ['==', ['get', 'id'], hoverFootprintId ?? '']);
  }, [hoverFootprintId]);

  return <div className="fire-map" ref={hostRef} aria-label="Waldbrandkarte DACH" />;
}

/** Satellitenkürzel der Quelle → lesbarer Name. Unbekanntes bleibt stehen,
 *  statt zu verschwinden — ein neuer Satellit soll auffallen, nicht wegfallen. */
const SATELLITE_NAME: Record<string, string> = {
  N: 'Suomi-NPP', N20: 'NOAA-20', N21: 'NOAA-21',
};

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CONF_LABEL: Record<string, string> = {
  high: 'hoch', nominal: 'normal', low: 'gering',
};

/**
 * Der Steckbrief einer einzelnen Detektion — ausschließlich gemessene Werte.
 *
 * Drei Aussagen sind nicht verhandelbar und stehen deshalb IM Steckbrief, nicht
 * nur in der Layer-Beschreibung:
 *  • Es ist eine **Thermalanomalie**, keine Einsatzmeldung.
 *  • Der Punkt ist die **Pixelmitte**; das Feuer liegt irgendwo im Rechteck.
 *  • `frp` ist eine **Leistung** (MW). Daraus wird **keine** Brandfläche in
 *    Hektar abgeleitet — die Pixelfläche ist eine Obergrenze der Auflösung,
 *    keine Aussage über die Größe des Feuers.
 */
/** Grobe Länderzuordnung einer Detektion für den Deep-Link (kein Grenzverlauf, nur Hülle). */
export function countryGuess(lat: number, lon: number): Country {
  if (inAustriaBox(lat, lon)) return 'AT';
  if (lon >= 5.9 && lon <= 10.5 && lat >= 45.8 && lat <= 47.85) return 'CH';
  return 'DE';
}

export function hotspotPopupHtml(p: FirmsProps, hitCount = 1, mapped: BurntPolygon | null = null, assessment: Assessment | null = null, country: Country | null = null, zone: FireZone | null = null, est: AreaEstimate | null = null): string {
  const t = typeof p.acqMs === 'number' ? new Date(p.acqMs) : null;
  const utc = t ? `${t.toISOString().slice(0, 16).replace('T', ' ')} UTC` : '—';
  const local = t
    ? t.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';
  const frp = typeof p.frp === 'number' ? `${p.frp.toLocaleString('de-DE')} MW` : 'nicht angegeben';
  const conf = typeof p.confidence === 'string' ? (CONF_LABEL[p.confidence] ?? p.confidence) : 'nicht angegeben';
  const ti4 = typeof p.brightTi4 === 'number' ? `${p.brightTi4.toLocaleString('de-DE')} K` : '—';
  const dTi = typeof p.dTi === 'number' ? `${p.dTi.toLocaleString('de-DE')} K` : '—';
  const sat = SATELLITE_NAME[String(p.satellite)] ?? String(p.satellite || '—');
  const px = typeof p.scanKm === 'number' && typeof p.trackKm === 'number'
    ? `${Math.round(p.scanKm * 1000)} × ${Math.round(p.trackKm * 1000)} m`
    : '—';

  const row = (k: string, v: string) =>
    `<div class="fire-pop-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;

  // Nur bei geringer Konfidenz: der häufigste Grund für einen Fehlalarm.
  const glint = p.confidence === 'low'
    ? '<p class="fire-pop-warn">Geringe Konfidenz — kann auch Sonnenreflexion oder eine '
      + 'andere Wärmequelle sein.</p>'
    : '';

  // F2: Warum dieser Punkt grau ist. Die Einordnung ist ausdrücklich UNSERE
  // Ableitung aus dem Detektionsmuster — die Quelle führt kein solches Feld.
  const stat = p.stat === 1
    ? '<p class="fire-pop-stat">Grau gezeichnet: an dieser Stelle wird seit mindestens fünf '
      + 'Tagen ohne räumliche Ausdehnung detektiert — häufig eine dauerhafte Wärmequelle '
      + '(z. B. Industrieanlage). <b>Eigene Einordnung aus dem Muster, kein Nachweis</b> und '
      + 'kein Feld der Quelle.</p>'
    : '';

  // Mehrere Detektionen an derselben Stelle: sagen, statt stillschweigend eine
  // auszuwählen. Die Einordnung solcher Häufungen ist Aufgabe von F2.
  const stack = hitCount > 1
    ? `<p class="fire-pop-stack">${hitCount} Detektionen an dieser Stelle — gezeigt wird die
       jüngste.</p>`
    : '';

  // E1/E2: die EINE Stelle, an der „bestätigt" fällt — mit Quelle, Fläche,
  // Datum. Ohne Treffer steht hier NICHTS Abwertendes: fehlende Kartierung ist
  // kein Beleg gegen ein Feuer (der Satz dazu steht in der Layer-Beschreibung).
  const mappedHtml = mapped
    ? `<p class="fire-pop-mapped">${esc(corroborationLabel(mapped))} — eine unabhängige,
       bildbasierte Kartierung, nicht dieselbe Thermalanomalie noch einmal.
       Ort: ${esc([mapped.commune, mapped.province, mapped.country].filter(Boolean).join(', '))}.</p>`
    : '';

  // BA3: die Größe. Steht bewusst NACH der Kartierungszeile — liegt eine
  // amtlich kartierte Fläche vor, ist sie die Zahl, die zählt, und das Raster
  // daneben zeigt nur, wie grob der Satellit ist. Zahl und Hinweis sind ein
  // Block: die Hektarzahl allein wäre irreführend.
  const zoneHtml = zone
    ? `<p class="fire-pop-zone"><b>${esc(zoneAreaLabel(zone))}</b><br>${esc(zoneAreaNote(zone))}</p>`
    : '';

  // VB3: die vorläufige Brandfläche — dieselbe Aussage wie im Panel, aus derselben
  // Funktion (`provisionalAreaText`). Sie steht VOR dem Raster: die Frage lautet
  // „wie groß ist der Brand", das Raster ist die Auflösung der Messung, nicht die
  // Antwort. Mit Kartierung entfällt sie — dann misst EFFIS, statt zu schätzen.
  const provHtml = est && !mapped && zone
    ? (() => {
      const prov = provisionalAreaText(est, zone.areaHa);
      return `<p class="fire-pop-prov"><b>${esc(prov.head)}: ${esc(prov.value)}</b><br>
        ${esc(prov.note)}<br><span class="fire-pop-prov-src">${esc(prov.source)}</span></p>`;
    })()
    : '';

  // GWBA1 A4: eine Zeile Beschriftung + Gründe mit Quelle. „bestätigt" nur mit
  // Quelle im selben Satz; die Kartierungszeile darunter bleibt (Fläche, Datum).
  const assessHtml = assessment
    ? `<p class="fire-pop-assess fire-pop-assess-${assessment.level}"><b>${esc(assessment.label)}</b>
       — ${assessment.reasons.map((r) => esc(r)).join(' · ')}</p>`
    : '';
  // GWBA1 A1/A3: Verlinken statt auswerten — die amtliche Warn-/Einsatzlage
  // beim Nutzer nachsehen lassen (DE NINA-Meldungen, AT Landesübersichten, CH Alertswiss).
  const linksHtml = country
    ? `<p class="fire-pop-links">Amtliche Warn-/Einsatzlage nachsehen: ${fireIncidentSourcesFor(country)
      .map((src) => `<a href="${esc(src.url)}" target="_blank" rel="noopener" title="${esc(src.caveat ?? src.operator)}">${esc(src.name)}</a>`)
      .join(' · ')}${country === 'AT' ? ' — keine landesweite amtliche Quelle' : ''}</p>`
    : '';

  return `<div class="fire-pop">
    <div class="fire-pop-head">Thermalanomalie</div>
    <p class="fire-pop-lead">Satellitendetektion, <b>keine Einsatzmeldung</b> und kein amtliches
      Warnprodukt.</p>
    ${assessHtml}
    ${linksHtml}
    ${stack}
    ${mappedHtml}
    ${provHtml}
    ${zoneHtml}
    ${row('Feuerstrahlungsleistung', frp)}
    ${row('Konfidenz', conf)}
    ${row('Erfasst', utc)}
    ${row('Ortszeit', local)}
    ${row('Satellit', `${sat} · ${p.day === 1 ? 'Tagüberflug' : 'Nachtüberflug'}`)}
    ${row('Helligkeitstemp. I4', ti4)}
    ${row('I4 − I5', dTi)}
    ${row('Detektierte Pixelfläche', px)}
    ${glint}
    ${stat}
    <p class="fire-pop-note">Der Punkt ist die <b>Pixelmitte</b>, nicht der Brandort — das Feuer
      liegt irgendwo im gezeichneten Rechteck. Die Pixelfläche ist eine Obergrenze der Auflösung
      und <b>keine</b> Brandfläche.</p>
  </div>`;
}

/**
 * BA3 — der Steckbrief des Rasters selbst (Klick in die Fläche, nicht auf einen
 * Punkt). Er sagt zuerst, was die Fläche **nicht** ist, und nennt die Zahl erst
 * danach: die Reihenfolge ist die Aussage.
 */
export function zonePopupHtml(
  z: FireZone,
  mapped: BurntPolygon | null = null,
  est: AreaEstimate | null = null,
): string {
  const span = (a: number, b: number) => {
    const f = (ms: number) => new Date(ms).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    });
    return a === b ? `${f(a)} UTC` : `${f(a)} → ${f(b)} UTC`;
  };
  const row = (k: string, v: string) =>
    `<div class="fire-pop-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  const mappedHtml = mapped
    ? `<p class="fire-pop-mapped">${esc(corroborationLabel(mapped))} — das ist die Fläche, die
       zählt; das Raster darüber zeigt nur, wie grob der Satellit auflöst.</p>`
    : '';
  // VB3: Ohne Kartierung, aber MIT Schätzung führt der Steckbrief die vorläufige
  // Brandfläche — dieselbe Aussage wie im Panel, aus derselben Funktion. Vorher
  // stand die Schätzung nur im Panel: derselbe Brand hatte auf der Karte und in
  // der Liste zwei verschiedene Auskünfte (V-VB-1). Liegt eine Kartierung vor,
  // bleibt es beim Rasterkopf — die Kartierung misst, statt zu schätzen.
  const prov = est && !mapped ? provisionalAreaText(est, z.areaHa) : null;
  const headHtml = prov
    ? `<div class="fire-pop-head">${esc(prov.head)}</div>
       <p class="fire-pop-lead"><b>${esc(prov.value)}</b><br>${esc(prov.note)}</p>
       <p class="fire-pop-note">${esc(prov.source)}</p>`
    : `<div class="fire-pop-head">Detektionsraster</div>
       <p class="fire-pop-lead">Die zusammengefassten Satellitenpixel, in denen es heiß war —
         <b>keine Brandfläche</b> und kein amtliches Warnprodukt.</p>`;
  return `<div class="fire-pop">
    ${headHtml}
    ${mappedHtml}
    ${row('Abgedeckte Fläche', `${z.areaHa.toLocaleString('de-DE')} ha`)}
    ${row('Pixel', `${z.pixels.toLocaleString('de-DE')} · je ~${z.meanPixelHa.toLocaleString('de-DE')} ha`)}
    ${row('Zeitraum', span(z.firstMs, z.lastMs))}
    ${z.capped ? `<p class="fire-pop-warn">Sehr viele Detektionen — gerechnet wurden die
       ${MAX_RECTS_PER_ZONE.toLocaleString('de-DE')} jüngsten Pixel; die Fläche ist damit
       unvollständig.</p>` : ''}
    <p class="fire-pop-note">${esc(zoneAreaNote(z))}</p>
  </div>`;
}

const fmtDay = (ms: number | null): string =>
  ms == null ? '—' : new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

/**
 * Der Steckbrief einer kartierten Brandfläche (E2) — ausschließlich Werte aus
 * dem Feature: Fläche, Branddatum, Stand, Ort und die Landbedeckungsanteile,
 * die EFFIS je Fläche mitliefert (Summe 100 %). Kein Balken wird geschätzt.
 */
export function burntPopupHtml(p: BurntPolygon, bucket: BurntBucket, hitCount = 1): string {
  const ha = p.areaHa == null ? 'nicht angegeben' : `${p.areaHa.toLocaleString('de-DE')} ha`;
  const rows = landcoverBreakdown(p);
  const bars = rows.length
    ? rows.map((r) => `<div class="fire-pop-lc"><span class="fire-pop-lc-name">${esc(r.label)}</span>
        <span class="fire-pop-lc-bar"><i style="width:${Math.max(2, Math.round(r.pct))}%;background:${LANDCOVER_COLOR[r.key]}"></i></span>
        <b>${Math.round(r.pct)} %</b></div>`).join('')
    : '<p class="fire-pop-note">Die Quelle nennt für diese Fläche keine Landbedeckungsanteile.</p>';
  const na2k = p.percNa2k != null && p.percNa2k > 0.5
    ? `<div class="fire-pop-row"><span>davon in Natura 2000</span><b>${Math.round(p.percNa2k)} %</b></div>`
    : '';
  const stack = hitCount > 1
    ? `<p class="fire-pop-stack">${hitCount} Flächen an dieser Stelle — gezeigt wird die oberste.</p>`
    : '';
  const row = (k: string, v: string) => `<div class="fire-pop-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  // BF4: der Wochenkorb ist derselbe Datensatz wie die Saison, nur zeitlich
  // gefiltert — der Steckbrief sagt das, statt ein drittes Produkt vorzutäuschen.
  const KORB: Record<BurntBucket, { head: string; lead: string }> = {
    week: {
      head: 'Kartierte Brandfläche · letzte 7 Tage',
      lead: 'laufende Saison, zeitlich auf die letzten sieben Tage gefiltert — Stand siehe unten.',
    },
    season: { head: 'Kartierte Brandfläche · Saison', lead: 'laufende Saison, Stand siehe unten.' },
    archive: {
      head: 'Kartierte Brandfläche · Archiv',
      lead: '<b>frühere Saison, keine aktuelle Lage</b>.',
    },
  };
  const k = KORB[bucket] ?? KORB.season;
  return `<div class="fire-pop fire-pop-burnt">
    <div class="fire-pop-head">${k.head}</div>
    <p class="fire-pop-lead">EFFIS-Kartierung nach Satellitenbild (Rapid Damage Assessment) —
      ${k.lead}
      Kein amtliches Warnprodukt.</p>
    ${stack}
    ${row('Fläche', ha)}
    ${row('Branddatum', fmtDay(p.firedateMs))}
    ${p.finaldateMs != null ? row('Ende (laut Archiv)', fmtDay(p.finaldateMs)) : ''}
    ${row('Stand der Kartierung', fmtDay(p.lastUpdateMs))}
    ${row('Ort', [p.commune, p.province, p.country].filter(Boolean).join(', ') || '—')}
    <div class="fire-pop-sub">Landbedeckung der Fläche</div>
    ${bars}
    ${na2k}
    <p class="fire-pop-note">${esc(NO_MAPPING_NOTE)}</p>
  </div>`;
}

/** Die MapLibre-Layer-Id, VOR der ein Layer eingehängt werden muss, damit die
 *  Z-Ordnung aus `FIRE_Z_BAND` gilt. `undefined` = ganz oben. */
function firstLayerAbove(map: maplibregl.Map, id: FireLayerId): string | undefined {
  const order = sortByZBand(FIRE_LAYER_ORDER);
  const idx = order.indexOf(id);
  for (let i = idx + 1; i < order.length; i++) {
    for (const gl of GL_LAYERS[order[i]]) if (map.getLayer(gl)) return gl;
  }
  return undefined;
}

/**
 * Legt Quellen und Layer in der Z-Ordnung aus `FIRE_Z_BAND` an.
 *
 * MapLibre zeichnet in Einfügereihenfolge — deshalb wird strikt aufsteigend
 * eingehängt: EU-Fläche unten, Landesstufen darüber, Punkte oben. Sonst
 * verdeckt die EU-Rasterfläche genau die Stationspunkte, die sie erklären soll.
 */
function installLayers(map: maplibregl.Map, basemap: FireBasemap = 'streets') {
  if (!map.getSource('fire-empty')) {
    map.addSource('fire-empty', { type: 'geojson', data: EMPTY_FC });
  }
  for (const id of ['fire-hotspots',
    'fire-hotspots-foot', 'fire-hotspots-zone', 'fire-clusters',
    'fire-burnt-season', 'fire-burnt-archive', 'fire-burnt-week', 'fire-footprints',
    ]) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY_FC });
  }
  // TA5: die Standortquelle trägt ihre Lizenzzeilen selbst (echte Quelle, kein Lizenzträger).
  if (!map.getSource(ANOMALY_SOURCE_ID)) {
    map.addSource(ANOMALY_SOURCE_ID, { type: 'geojson', data: EMPTY_FC, attribution: ANOMALY_ATTRIBUTION });
  }
  // BH3: die Historie-Quelle — Lizenz wie die Hotspots (FIRMS), die Datei nennt sie selbst.
  if (!map.getSource(HISTORY_SOURCE_ID)) {
    map.addSource(HISTORY_SOURCE_ID, { type: 'geojson', data: EMPTY_FC, attribution: FIRMS_ATTRIBUTION });
  }
  // Lizenzträger der Custom-Layer (Wind, Boden) — s. ATTRIB_CARRIERS.
  for (const c of ATTRIB_CARRIERS) {
    if (!map.getSource(c.sourceId)) {
      map.addSource(c.sourceId, { type: 'geojson', data: EMPTY_FC, attribution: c.attribution });
    }
  }

  // Ink-Schleier über der Basiskarte, ABER unter den Fachlayern und (im
  // Vektorstil) unter den Grenz-/Beschriftungslayern — 1:1 die Wetterkarte
  // (`MapView.tsx:1282`, ink-900 #2C2A26 bei 0,8). Er verdunkelt die Karte,
  // damit Hotspots, Hüllen und die Treiber-Raster auf dunklem Grund stehen
  // statt auf der hellen Basiskarte auszubleichen. Er wird als ERSTES
  // eingehängt, damit jeder später ergänzte Fachlayer über ihm liegt.
  if (!map.getSource('fire-world')) {
    map.addSource('fire-world', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]],
        },
        properties: {},
      },
    });
  }
  if (!map.getLayer('fire-dim-fill')) {
    map.addLayer(
      {
        id: 'fire-dim-fill',
        type: 'fill',
        source: 'fire-world',
        // Vektorkarte: eine Spur heller als die Wetterkarte (0,7 statt 0,8 —
        // Jans Wunsch 2026-08-19), Ortsnamen und Straßen treten damit wieder
        // etwas hervor. Luft-/Geländebild: schwächer, sonst wäre genau das
        // Bild weg, wegen dem man umschaltet.
        paint: { 'fill-color': '#2C2A26', 'fill-opacity': basemap === 'streets' ? 0.7 : 0.3 },
      },
      map.getLayer('boundary_3') ? 'boundary_3' : undefined,
    );
  }

  // Die DACH-Maske: alles außerhalb der drei Länder wird ausgeblendet —
  // DECKEND sandfarben wie in der Wetterkarte (`MapView.tsx:1338`, sand-200
  // #E0D6BE), nicht mehr als halbdurchsichtiger dunkler Schleier. Damit zeigt
  // die Brandkarte nur noch DE/AT/CH auf buscosun-farbenem Grund. Asynchron,
  // deshalb defensiv — die Karte darf inzwischen abgeräumt worden sein.
  void loadDachMask().then((mask) => {
    if (!map.getStyle()) return;
    if (!map.getSource('fire-dach-mask')) {
      map.addSource('fire-dach-mask', { type: 'geojson', data: mask });
      map.addLayer({
        id: 'fire-dach-mask-fill',
        type: 'fill',
        source: 'fire-dach-mask',
        paint: { 'fill-color': '#E0D6BE', 'fill-opacity': 1.0 },
      });
    }
  }).catch(() => { /* Maske ist Beiwerk — ihr Ausfall darf die Karte nicht kippen */ });

  /** Jeder GL-Layer mit seiner echten Quelle und Darstellung. */
  const SPECS: Record<string, maplibregl.LayerSpecification> = {
    /**
     * Hotspots — seit F1 datengetrieben aus der NASA-FIRMS-Area-API.
     *
     * Vier Kanäle, jeder aus einem ECHTEN Feld, keiner doppelt belegt:
     *   Radius + Füllfarbe ← `frp` (Feuerstrahlungsleistung in MW)
     *   Deckkraft + Ringstärke ← `confidence`
     *   Ringfarbe ← Alter der Detektion
     *   Footprint-Umriss gestrichelt ← Nachtüberflug
     *
     * `radius`, `confOpacity` und `stroke` werden in `firmsHotspots.ts`
     * berechnet und als Eigenschaft mitgeliefert — die Skalen stehen damit an
     * EINER Stelle und gelten für Karte und Legende gleichermaßen. Ein zweiter
     * `interpolate`-Ausdruck hier wäre eine zweite Wahrheit.
     */
    'fire-hotspots-points': {
      id: 'fire-hotspots-points', type: 'circle', source: 'fire-hotspots',
      paint: {
        'circle-radius': ['coalesce', ['get', 'radius'], 4],
        // F2: Als ortsfest eingestufte Detektionen werden GRAU gezeichnet —
        // ausgegraut, nicht ausgeblendet. Sie bleiben sichtbar, anklickbar und
        // in voller Größe; nur die Feuerfarbe entfällt. Ein falsch
        // eingeordnetes Feuer verschwindet damit nicht von der Karte.
        'circle-color': [
          'case', ['==', ['coalesce', ['get', 'stat'], 0], 1], '#9A9186',
          [
            'interpolate', ['linear'], ['coalesce', ['get', 'frp'], 0],
            ...FRP_STOPS.flatMap(([mw, col]) => [mw, col]),
          ],
        ],
        'circle-stroke-color': ['coalesce', ['get', 'stroke'], '#FDF6EC'],
        'circle-stroke-width': [
          'match', ['coalesce', ['get', 'confidence'], 'nominal'],
          'high', 2, 'low', 0.6, 1.2,
        ],
        'circle-opacity': ['coalesce', ['get', 'confOpacity'], 0.85],
        'circle-stroke-opacity': ['coalesce', ['get', 'confOpacity'], 0.85],
      },
    },
    /**
     * BA3 — das Detektionsraster: die verschmolzenen Pixel eines Brandes.
     *
     * Die Signatur muss die Unschärfe **optisch** tragen, sonst liest man eine
     * Präzision hinein, die nicht da ist: schwache Füllung und eine
     * **gestrichelte** Kante, nie eine scharfe Polygonlinie wie bei der
     * amtlich kartierten EFFIS-Fläche. Die beiden dürfen sich auf der Karte
     * nicht ähneln — der Unterschied ist die Aussage.
     *
     * Ohne `minzoom`: eine Zone aus einem einzigen Pixel ist herausgezoomt
     * ohnehin subpixelgroß und verschwindet von selbst. Ein Zoom-Schwellwert
     * wäre ein freier Parameter mehr, ohne etwas zu verbessern.
     */
    'fire-hotspots-zone-fill': {
      id: 'fire-hotspots-zone-fill', type: 'fill', source: 'fire-hotspots-zone',
      paint: { 'fill-color': '#C2542B', 'fill-opacity': 0.1 },
    },
    'fire-hotspots-zone-line': {
      id: 'fire-hotspots-zone-line', type: 'line', source: 'fire-hotspots-zone',
      paint: {
        'line-color': '#C2542B', 'line-width': 1.2, 'line-opacity': 0.55,
        'line-dasharray': [3, 2],
      },
    },
    /**
     * BC1 — die **Cluster-Hülle**: das kleinste Vieleck, das die Detektionsorte
     * einer Gruppe umschließt.
     *
     * Sie muss sich von den beiden anderen Flächen der Ansicht auf den ersten
     * Blick unterscheiden, weil sie etwas anderes misst: die scharfe dunkle
     * Kontur gehört der amtlich kartierten EFFIS-Fläche, die feine terrakotta
     * Strichelung dem Detektionsraster. Die Hülle bekommt deshalb eine
     * **weite** Strichelung und eine sehr schwache Füllung — sie liegt als
     * Klammer um alles andere, ohne es zu überdecken.
     *
     * Farbe aus dem Feature (`color`, gesetzt in `clustersToGeoJSON` aus
     * `CLUSTER_FRP_STOPS`): die Stärke-Skala steht damit an EINER Stelle und
     * gilt für Karte und Liste gleichermaßen.
     */
    'fire-clusters-fill': {
      id: 'fire-clusters-fill', type: 'fill', source: 'fire-clusters',
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#C2542B'],
        'fill-opacity': 0.14,
      },
    },
    'fire-clusters-line': {
      id: 'fire-clusters-line', type: 'line', source: 'fire-clusters',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#C2542B'],
        'line-width': 1.4, 'line-opacity': 0.75, 'line-dasharray': [5, 3],
      },
    },
    /**
     * Der markierte Cluster. Eigener Layer mit Filter statt Paint-Ausdruck:
     * ein Filter wird in `applyState` ohnehin bei jedem Durchlauf gesetzt und
     * übersteht damit den Basiskarten-Wechsel ohne zweiten Zustand. Der leere
     * Vorgabefilter zeigt nichts — vor der ersten Auswahl liegt hier nichts.
     */
    'fire-clusters-sel-line': {
      id: 'fire-clusters-sel-line', type: 'line', source: 'fire-clusters',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'line-color': '#2C2A26', 'line-width': 2.6, 'line-opacity': 0.95 },
    },
    // Footprint: die ehrliche räumliche Unsicherheit (scan×track, gemessen
    // 0,32–0,80 km). Erst ab FOOTPRINT_MIN_ZOOM — darunter wäre das Rechteck
    // kleiner als der Punkt darauf und nur teure Geometrie.
    'fire-hotspots-foot-fill': {
      id: 'fire-hotspots-foot-fill', type: 'fill', source: 'fire-hotspots-foot',
      minzoom: FOOTPRINT_MIN_ZOOM,
      paint: { 'fill-color': '#C2542B', 'fill-opacity': 0.14 },
    },
    /**
     * Tag- und Nachtumriss als ZWEI Layer mit Filter.
     *
     * Nicht aus Stilgründen: `line-dasharray` ist in MapLibre **nicht
     * datengetrieben** (data-constant, cross-faded). Ein `['case', …]` darauf
     * würde der Stil-Validator ablehnen und der ganze Layer bliebe weg. Zwei
     * gefilterte Layer sind der unterstützte Weg.
     *
     * Warum die Unterscheidung überhaupt sichtbar ist: VIIRS detektiert nachts
     * empfindlicher als tags. Ob eine Detektion aus einem Nacht- oder einem
     * Tagüberflug stammt, gehört deshalb zur Einordnung — und nicht nur ins Popup.
     */
    'fire-hotspots-foot-line': {
      id: 'fire-hotspots-foot-line', type: 'line', source: 'fire-hotspots-foot',
      minzoom: FOOTPRINT_MIN_ZOOM,
      filter: ['==', ['get', 'day'], 1],
      paint: { 'line-color': '#C2542B', 'line-width': 0.9, 'line-opacity': 0.75 },
    },
    'fire-hotspots-foot-night': {
      id: 'fire-hotspots-foot-night', type: 'line', source: 'fire-hotspots-foot',
      minzoom: FOOTPRINT_MIN_ZOOM,
      filter: ['==', ['get', 'day'], 0],
      paint: {
        'line-color': '#C2542B', 'line-width': 0.9, 'line-opacity': 0.75,
        'line-dasharray': [2, 1.5],
      },
    },
    /**
     * E2 — kartierte Brandflächen in ZWEI Körben.
     *
     * Füllfarbe nach der **dominanten Landbedeckung** (`lc`, aus den neun
     * EFFIS-Anteilen bestimmt) — das sagt, was gebrannt hat. Kein Rot: Rot ist
     * in dieser Ansicht Gefahr und Detektion vorbehalten, und eine rote Narbe
     * sähe aus wie ein Feuer. Saison und Archiv unterscheiden sich in Kontur
     * und Deckkraft, damit acht Jahre alte Flächen nie wie heutige aussehen.
     */
    'fire-burnt-season-fill': {
      id: 'fire-burnt-season-fill', type: 'fill', source: 'fire-burnt-season',
      paint: { 'fill-color': landcoverColorExpression(), 'fill-opacity': 0.55 },
    },
    'fire-burnt-season-line': {
      id: 'fire-burnt-season-line', type: 'line', source: 'fire-burnt-season',
      paint: { 'line-color': '#2A2119', 'line-width': 1.4 },
    },
    /**
     * BF4 — die Flächen der letzten sieben Tage. Dieselbe Landbedeckungsfarbe
     * wie die Saison (es ist dieselbe Quelle), aber **kräftiger und mit
     * Doppelkontur**: frisch heißt hier „vor Tagen kartiert", nicht „anderes
     * Produkt". Die Körbe teilen die Zeit, also liegt hier nie eine Fläche, die
     * auch im Saison-Korb gezeichnet wird.
     */
    'fire-burnt-week-fill': {
      id: 'fire-burnt-week-fill', type: 'fill', source: 'fire-burnt-week',
      paint: { 'fill-color': landcoverColorExpression(), 'fill-opacity': 0.72 },
    },
    'fire-burnt-week-line': {
      id: 'fire-burnt-week-line', type: 'line', source: 'fire-burnt-week',
      paint: { 'line-color': '#1C1610', 'line-width': 2.2 },
    },
    'fire-burnt-archive-fill': {
      id: 'fire-burnt-archive-fill', type: 'fill', source: 'fire-burnt-archive',
      paint: { 'fill-color': landcoverColorExpression(), 'fill-opacity': 0.3 },
    },
    'fire-burnt-archive-line': {
      id: 'fire-burnt-archive-line', type: 'line', source: 'fire-burnt-archive',
      paint: { 'line-color': '#5A4A3C', 'line-width': 0.9, 'line-dasharray': [2, 1.6] },
    },
    /**
     * BP2 — die Brandflächen der Registry: EINE Form je Brand in Statusfarbe.
     * Füllung nach Status (`STATUS_COLOR`), Kontur hart für kartierte Flächen und
     * gestrichelt für das Detektionsraster (die Bildsprache von BF5 bleibt);
     * `dup: 1` (ein anderer aktiver Layer zeichnet dieselbe Geometrie) ⇒ keine
     * Füllung, nur die Statuskontur. Grau bleibt der Ortsfest-Vorbehalt.
     */
    'fire-footprints-fill': {
      id: 'fire-footprints-fill', type: 'fill', source: 'fire-footprints',
      paint: {
        'fill-color': ['case', ['==', ['get', 'static'], 1], STATIC_GREY, footprintStatusColorExpression()],
        'fill-opacity': ['case', ['==', ['get', 'dup'], 1], 0, ['==', ['get', 'kind'], 'effis'], 0.42, 0.22],
      },
    },
    'fire-footprints-line': {
      id: 'fire-footprints-line', type: 'line', source: 'fire-footprints',
      paint: {
        'line-color': ['case', ['==', ['get', 'static'], 1], STATIC_GREY, footprintStatusColorExpression()],
        'line-width': ['case', ['==', ['get', 'kind'], 'effis'], 2, 1.4],
        'line-opacity': 0.9,
        'line-dasharray': ['case', ['==', ['get', 'kind'], 'effis'], ['literal', [1, 0]], ['literal', [2.5, 1.8]]],
      },
    },
    'fire-footprints-hover-line': {
      id: 'fire-footprints-hover-line', type: 'line', source: 'fire-footprints',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'line-color': '#2C2A26', 'line-width': 2.2, 'line-opacity': 0.7 },
    },
    'fire-footprints-sel-line': {
      id: 'fire-footprints-sel-line', type: 'line', source: 'fire-footprints',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'line-color': '#2C2A26', 'line-width': 3, 'line-opacity': 0.98 },
    },
    /**
     * SF1 — der Unsicherheitsfächer: offener Sektor am Brandpunkt, Öffnung =
     * Richtungsunsicherheit, Radius = obere Kante der Reichweiten-Spanne.
     *
     * Sehr schwache Füllung und eine GESTRICHELTE Kontur: eine satte Fläche auf
     * einer Karte liest sich als „das brennt dann", und genau das behauptet der
     * Fächer nicht (`FAN_CAVEAT` steht in Panel und Kartennotiz).
     */
    /**
     * TA5: eine Raute je Standort persistenter Wärmequellen. Symbol-Layer mit
     * gezeichneten Sprites (A/B/C/dev), `icon-size` nur über den Zoom (Regel wie
     * beim Pfeil). Der Auswahlring ist ein Filter-Layer (Muster `-sel-line`).
     */
    [ANOMALY_LAYER_ID]: {
      id: ANOMALY_LAYER_ID, type: 'symbol', source: ANOMALY_SOURCE_ID,
      layout: {
        'icon-image': ['concat', ANOMALY_IMAGE_ID, ['coalesce', ['get', 'variant'], 'B']],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 0.8, 11, 1.1],
      },
      paint: { 'icon-opacity': ['case', ['==', ['get', 'live'], ''], 0.78, 1] },
    },
    [ANOMALY_SEL_LAYER_ID]: {
      id: ANOMALY_SEL_LAYER_ID, type: 'circle', source: ANOMALY_SOURCE_ID,
      filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': 15, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#2C2A26', 'circle-stroke-width': 2.5, 'circle-stroke-opacity': 0.95 },
    },
    // Die Lizenzträger: zeichnen nichts (Quelle dauerhaft leer) und existieren
    // allein, damit die DWD-Zeile der Custom-Layer in der Leiste erscheint.
    ...Object.fromEntries(ATTRIB_CARRIERS.map((c) => [c.layerId, {
      id: c.layerId, type: 'circle', source: c.sourceId,
      paint: { 'circle-radius': 0, 'circle-opacity': 0 },
    }])),
  };

  // WB4-Rasterquellen (Brennmaterial, Schutzgebiete, Landbedeckung). Anders als
  // der EU-Index tragen sie keinen Tag — sie werden einmal angelegt und bleiben.
  for (const [srcId, spec] of [
    ['fire-fuel', fuelMapSource()],
    ['fire-context', natura2000Source()],
    ['fire-clc', clc2018Source()],
  ] as const) {
    if (!map.getSource(srcId)) map.addSource(srcId, spec);
  }

  /**
   * SF1 — die Pfeil-Sprites. Technik kopiert aus `MapView.tsx:253` (Zellbahnen);
   * `src/fire/*` darf `../MapView` nicht importieren, deshalb liegt der Zeichner
   * in `spread/spreadLayer.ts`.
   *
   * Warum das hier steht und nicht einmalig beim Kartenaufbau: `installLayers`
   * läuft aus `applyState`, also auch nach `load`, `styledata` und `idle` — nach
   * einem Basemap-Wechsel (`setStyle`) sind die Sprites weg, `hasImage` meldet
   * das, und sie werden neu registriert. Fehlt ein Sprite trotzdem, wird der
   * Layer NICHT angelegt und die Konsole sagt es — ein unsichtbarer Layer wäre
   * schlimmer als keiner.
   */
  // TA5: die vier Rauten-Sprites — derselbe Vertrag (fehlt eines, kein Layer, Konsole sagt es).
  for (const variant of ANOMALY_VARIANTS) {
    const imageId = `${ANOMALY_IMAGE_ID}${variant}`;
    if (map.hasImage(imageId)) continue;
    const img = makeSiteDiamondImage(variant);
    if (img) map.addImage(imageId, img, { pixelRatio: 2 });
  }
  const siteSpritesReady = ANOMALY_IMAGE_IDS.every((i) => map.hasImage(i));
  if (!siteSpritesReady) {
    console.warn('[buscosun] Thermalanomalien: Rauten-Sprite fehlt — der Layer wird nicht angelegt.');
  }

  for (const id of sortByZBand(FIRE_LAYER_ORDER)) {
    for (const gl of GL_LAYERS[id]) {
      if (gl === ANOMALY_LAYER_ID && !siteSpritesReady) continue;
      // Custom-Layer (Treiber, Wind) bekommen hier bewusst nichts — s. CUSTOM_GL_LAYERS.
      if (CUSTOM_GL_LAYERS.has(gl)) continue;
      if (map.getLayer(gl)) continue;
      const spec = SPECS[gl];
      if (spec) {
        // SF1: das `layout` der Spec MUSS erhalten bleiben. Vor dieser Phase
        // wurde es hier vollständig durch `{ visibility: 'none' }` ersetzt —
        // unauffällig, solange kein Spec ein `layout` hatte, aber ein
        // Symbol-Layer verlöre so `icon-image`/`icon-rotate` und wäre stumm
        // unsichtbar (audit/waldbrand-ausbreitung.md §2.1 B3).
        map.addLayer({
          ...spec,
          layout: { ...((spec as { layout?: Record<string, unknown> }).layout ?? {}), visibility: 'none' },
        } as maplibregl.LayerSpecification);
        continue;
      }
      // WB4-Raster: Layer-Id → Quelle. Deckkraft bewusst niedrig, es sind
      // Kontextflächen unter den Gefahrenangaben, keine Aussagen für sich.
      const raster: Record<string, { src: string; opacity: number }> = {
        'fire-fuel-raster': { src: 'fire-fuel', opacity: 0.55 },
        'fire-context-raster': { src: 'fire-context', opacity: 0.45 },
        'fire-clc-raster': { src: 'fire-clc', opacity: 0.35 },
      };
      if (raster[gl]) {
        map.addLayer({
          id: gl, type: 'raster', source: raster[gl].src,
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': raster[gl].opacity },
        } as maplibregl.LayerSpecification);
        continue;
      }
      // Noch nicht gebaute Layer (fireWeather kommt als ScalarLayer, WB4-Layer
      // gar nicht): Platzhalter an der richtigen Z-Position, damit die Ordnung
      // steht, sobald sie Daten bekommen.
      const kind: 'fill' | 'line' | 'circle' =
        gl.endsWith('-line') ? 'line' : gl.endsWith('-points') ? 'circle' : 'fill';
      map.addLayer({
        id: gl, type: kind, source: 'fire-empty', layout: { visibility: 'none' },
        paint:
          kind === 'line' ? { 'line-color': '#A32B1E', 'line-width': 1.2 }
          : kind === 'circle' ? { 'circle-radius': 4, 'circle-color': '#D4632E' }
          : { 'fill-color': '#E9A33C', 'fill-opacity': 0.45 },
      } as maplibregl.LayerSpecification);
    }
  }

  // BH3: Historie-Punkte — kein `FireLayerId`, deshalb außerhalb der Z-Band-Schleife, ganz oben
  // (ein Anzeigemodus, in dem die Live-Layer ohnehin leer sind). Unsichtbar bis `historyFc` da ist.
  if (!map.getLayer(HISTORY_LAYER_ID)) {
    map.addLayer({
      id: HISTORY_LAYER_ID, type: 'circle', source: HISTORY_SOURCE_ID,
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['*', ['get', 'r'], 0.55], 8, ['get', 'r'], 11, ['*', ['get', 'r'], 1.4]],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['case', ['==', ['get', 'site'], 1], 0.55, 0.85],
        'circle-stroke-color': '#FAF6EA', 'circle-stroke-width': 0.8,
      },
    } as maplibregl.LayerSpecification);
  }
  if (!map.getLayer(HISTORY_SEL_LAYER_ID)) {
    map.addLayer({
      id: HISTORY_SEL_LAYER_ID, type: 'circle', source: HISTORY_SOURCE_ID,
      filter: ['==', ['get', 'id'], ''], layout: { visibility: 'none' },
      paint: { 'circle-radius': 15, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#2C2A26', 'circle-stroke-width': 2.5, 'circle-stroke-opacity': 0.95 },
    } as maplibregl.LayerSpecification);
  }

  // Attributionen aller aktiven Fremdquellen an die Karte hängen — Lizenzpflicht,
  // unabhängig davon, ob der Layer gerade sichtbar ist.
  for (const [srcId, attr] of [
    ['fire-burnt-season', EFFIS_BURNT_ATTRIBUTION],
    ['fire-burnt-archive', EFFIS_BURNT_ATTRIBUTION],
    ['fire-burnt-week', EFFIS_BURNT_ATTRIBUTION],
    // `fire-hotspots`/`fire-hotspots-foot` fehlen hier ABSICHTLICH: ihre
    // Attribution hängt daran, welche Quelle geantwortet hat (FIRMS oder der
    // GWIS-Rückfall) und wird deshalb in `applyState` gesetzt. Ein fester Wert
    // hier würde im Rückfall die falsche Quelle nennen.
  ] as const) {
    const s = map.getSource(srcId) as { attribution?: string } | undefined;
    if (s && !s.attribution) s.attribution = attr;
  }
  void GWIS_FWI_ATTRIBUTION; // trägt die raster-Source selbst (s. gwisRasterSource)
}
