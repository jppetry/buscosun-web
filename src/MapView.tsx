import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { encodeMapState } from './mapState';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Location, Country } from './types';
import { WindLayer } from './wind/WindLayer';
import type { DwdForecastResult } from './wind/brightSkySource';
import type { ScalarGridResult } from './wind/openMeteoSource';
import { ScalarLayer, temperatureRamp } from './scalar/ScalarLayer';
import { RainLayer, precipRainRamp } from './scalar/RainLayer';
import { CloudLayer } from './scalar/CloudLayer';
import { loadFusedForecast, prefetchSecondarySources, type ModelChoice } from './fusion/loadFusedForecast';
import {
  initialModelSourceState, isFusionCapable, resolveModel, activeModelId,
  setGlobalSource, setLayerOverride, clearLayerOverride,
  setActiveCountry, setCountryModel, toggleRadar,
  resolvePointSource, setPointSource,
  type ModelSource, type ModelSourceState,
} from './fusion/modelSource';
import ModelSwitcher from './map/ModelSwitcher';
import { modelEntry, type ModelId } from './fusion/modelCatalog';
import { lerpFrameImage } from './fusion/frameInterp';
import { COUNTRY_PROFILES, DACH_VIEW } from './countryProfiles';
import { loadDachMask } from './countryMask';
import { PointForecastPanel } from './pointForecast/PointForecastPanel';
import { DACH_CITIES, TemperatureSampler, minZoomForRank, saveTempLabelCache, loadTempLabelCache, tempLabelColor, type TemperatureSamplerOptions, type City } from './temperatureLabels';
import { LayerIcon } from './components/LayerIcon';
import { LayerInfoPanel } from './components/LayerInfoPanel';
import {
  SATELLITE_PRODUCTS,
  satelliteSourceMeta,
  type SatelliteProduct,
} from './sources/dwdSatellite';
import { lightningTileTemplate, LIGHTNING_ATTRIBUTION, LIGHTNING_LAYER_LOCAL } from './sources/dwdLightning';
import { fetchWmsLatestTime } from './sources/wmsTime';
// RADOLAN-RV 0–2 h Niederschlags-Nowcast (DWD OpenData, binär dekodiert zu
// mm/h) — speist den dedizierten "Nowcast"-Button über den Forecast-Slider.
import { fetchRvNowcast, de1200WarpMesh, DE1200_WARP_N, type RvNowcast } from './sources/radolan';
// ICON-D2 2,2-km-Niederschlags-Forecast (GRIB2 → mm/h) — Hauptlayer ab +2 h,
// hinter dem RADOLAN-RV-Nowcast, beide unter dem "Niederschlag"-Button.
import { fetchIconD2Precip, type IconD2Precip } from './sources/iconD2Precip';
// Wolken: DWD ICON-D2 Bewölkungsgrad (CLCT) als Gitter, 0–27 h, gleiche
// GRIB2-Pipeline wie der Niederschlag.
import { fetchIconD2CloudStack, type IconD2CloudStack } from './sources/iconD2Clouds';
import { fetchIconD2Wind, windFrameAtValidTime, loadWindNowCache, saveWindNowCache, type IconD2Wind } from './wind/iconD2WindSource';
import { frameAtValidTime } from './sources/frameAtValidTime';
import { sampleTempAt, sampleGustAt, sampleWindAt, sampleCloudsAt, sampleDemAt } from './qa/layerSampler';
import { runLayerQA, runSnowlineQA, type SampleApi } from './qa/layerQA';
import { fetchIconEuPressureWind, WIND_PRESSURE_LEVELS, type WindPressureLevel } from './wind/iconEuPressureWind';
import { fetchIconD2Temp, fetchTempRunSpread, type IconD2Temp, type IconD2TempSpread } from './sources/iconD2TempSource';
import { fetchIconD2Gust, type IconD2Gust } from './sources/iconD2GustSource';
// Vertrauens-Schleier (ML #1 Klima-MOS): Kreuzschraffur, deren Dichte mit der
// Vorhersage-Unsicherheit wächst (leadWeight × klimatologische Plausibilität).
import { ConfidenceLayer } from './scalar/ConfidenceLayer';
import { buildConfidenceImage, buildPrecipConfidenceImage, buildEnsembleConfidenceImage } from './scalar/confidenceImage';
import { ClimaField } from './ml/climaField';
// Schneefallgrenze (ML #2): Iso-Kontur der Regen/Schnee-Grenze als GeoJSON-Linie.
import { buildSnowLine } from './scalar/snowLine';
// Flow-Nowcast („Weg A"): trainingsfreie Lagrange-Extrapolation — Horn-Schunck-
// Bewegungsfeld aus zwei RADOLAN-Frames, dann den jüngsten Frame advehieren.
// (Intensitätserhaltend; ersetzt den ungeeigneten Demo-CNN-Karten-Layer.)
import { coarsenFrameU8 } from './ml/nowcasterInference';
import { estimateFlowHS, advect, type Flow } from './ml/opticalFlowNowcast';
// Echter Ensemble-Spread für den Vertrauens-Schleier (PoP-Modus): stochastischer
// Lagrange-Nowcast → Member-Übereinstimmung = ehrliche Unsicherheit.
import { advectEnsembleProb } from './ml/flowEnsemble';
import type { QuadCorners } from './scalar/RainLayer';
// MeteoSwiss-Radar rzc (RR) — CH-„jetzt"-Frame; die 0–6h-Vorhersage über CH
// kommt aus ICON-D2 (INCA-Forecast ist nicht offen verfügbar, ICON-CH1 liegt
// auf einem unstrukturierten Gitter — beides nicht raster-nutzbar).
import { fetchRzcLatest, type RadarFrame } from './sources/meteoSwissRadar';
// GeoSphere INCA-Nowcast als Grid — AT-„jetzt..+3h"; danach ICON-D2.
import { fetchIncaGrid, type IncaGrid } from './sources/geosphereIncaGrid';
import { PrecipCompositor } from './scalar/precipComposite';
import {
  fetchDachStations,
  fetchDwdStationLive,
  type StationFeatureProps as StationFeatureProperties,
  type StationsFeatureCollection,
} from './sources/dachStations';
import './MapView.css';

function renderStationPopup(p: StationFeatureProperties, loading = false, errorMsg?: string): string {
  const srcLabel =
    p.source === 'dwd_obs' ? 'DWD' :
    p.source === 'tawes'   ? 'GeoSphere TAWES' :
    p.source === 'smn'     ? 'MeteoSwiss SMN' : p.source;
  const stationId = p.dwdStationId ?? p.sourceId ?? '';
  const stationIdPart = stationId ? ` · Station ${stationId}` : '';
  const dirArrow = (d: number) => `<span style="display:inline-block;transform:rotate(${d + 180}deg);">▲</span>`;
  const row = (label: string, value: string | null | undefined) =>
    value == null ? '' : `<div class="sp-row"><span class="sp-l">${label}</span><span class="sp-v">${value}</span></div>`;
  const t = p.temperature != null ? `${Number(p.temperature).toFixed(1)} °C` : null;
  const wind = p.windSpeed != null
    ? `${Number(p.windSpeed).toFixed(1)} m/s ${p.windDirection != null ? dirArrow(Number(p.windDirection)) : ''}`
    : null;
  const precip = p.precipitation != null ? `${Number(p.precipitation).toFixed(2)} mm/h` : null;
  const cloud = p.cloudCover != null ? `${Math.round(Number(p.cloudCover))} %` : null;
  const body = loading
    ? `<div class="sp-loading">lade Live-Werte…</div>`
    : errorMsg
      ? `<div class="sp-err">⚠ ${escapeHtml(errorMsg)}</div>`
      : (t || wind || precip || cloud
          ? `${row('Temperatur', t)}${row('Wind', wind)}${row('Niederschlag', precip)}${row('Bewölkung', cloud)}`
          : `<div class="sp-loading">keine aktuellen Werte verfügbar</div>`);
  const stamp = loading || errorMsg ? '' : `<div class="sp-stamp">Aktualisiert · live abgerufen</div>`;
  return `
    <div class="sp">
      <div class="sp-name">${escapeHtml(p.name || srcLabel)}</div>
      <div class="sp-meta">${escapeHtml(srcLabel)}${stationIdPart} · ${p.elevation} m ü. NN</div>
      ${body}
      ${stamp}
    </div>`;
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;');
}

const FORECAST_REFRESH_MS = 60 * 60 * 1000; // refresh forecast hourly
const FORECAST_HOURS = 24;
const WORLD_SOURCE_ID = 'world-fill';
const DIM_LAYER_ID = 'basemap-dim';
const COUNTRY_MASK_SOURCE_ID = 'country-mask';
const COUNTRY_MASK_LAYER_ID = 'country-mask-fill';
const SAT_SOURCE_ID = 'satellite';
const SAT_LAYER_ID = 'satellite-layer';
const LIGHTNING_SOURCE_ID = 'lightning';
const LIGHTNING_LAYER_ID = 'lightning-layer';
const STATIONS_SOURCE_ID = 'dach-stations';
const STATIONS_LAYER_ID = 'dach-stations-layer';
// Durchgehender Niederschlags-Layer (WebGL RainLayer): 0–2 h RADOLAN-RV,
// ab +2 h ICON-D2. Frame-Wechsel per Textur-Tausch (kein PNG).
const NOWCAST_LAYER_ID = 'precip-rain-layer';
// Vertrauens-Schleier-Layer (ML #1) — liegt über den Datenschichten, unter den
// Beschriftungen; Schraffurdichte ∝ Vorhersage-Unsicherheit.
const CONFIDENCE_LAYER_ID = 'confidence-hatch';
// Schneefallgrenze (ML #2) — native GeoJSON-Linie (Casing + Hauptlinie).
const SNOWLINE_SOURCE_ID = 'snowline';
const SNOWLINE_CASING_ID = 'snowline-casing';
const SNOWLINE_LAYER_ID = 'snowline-line';
// Flow-Nowcast — eigener RainLayer für die advehierten Radar-Frames.
const FLOW_NOWCAST_LAYER_ID = 'flow-nowcast-layer';
/** RADOLAN ~1100×1200 → ~140×150 für Flussschätzung + Advektion. */
const FLOW_FACTOR = 8;
/** Zeitabstand der beiden Eingabe-Frames (RADOLAN-RV-Schritt), Minuten. */
const FLOW_INTERVAL_MIN = 5;
// Regenwahrscheinlichkeit (PoP) — kalibriertes Ensemble-Produkt als ScalarLayer.
const POP_LAYER_ID = 'pop-layer';
/** Wahrscheinlichkeits-Farbrampe (t = PoP 0..1): hellblau → blau → violett.
 *  Alpha im Verlauf eingebacken (RainLayer hat kein visRange): < ~4 % transparent,
 *  Einblendung bis ~25 %, darüber voll (× layer-opacity). Ersetzt die frühere
 *  ScalarLayer-visRange {0.05, 0.25}. */
const popRamp: Record<number, string> = {
  0.0:  'rgba(190,214,255,0)',
  0.04: 'rgba(185,210,255,0)',
  0.12: 'rgba(150,190,252,0.55)',
  0.25: 'rgba(122,170,250,1)',
  0.5:  'rgba(74,120,228,1)',
  0.75: 'rgba(112,70,198,1)',
  1.0:  'rgba(86,28,138,1)',
};
/** Windböen-Farbrampe (0..1 ≙ 0..40 m/s): ruhig grünlich → Amber → Terrakotta →
 *  Magenta/Violett für Sturm/Orkan. Schwellen grob an Beaufort orientiert
 *  (~17 m/s Sturmböe Bft 8, ~25 m/s Bft 10, ~33 m/s Bft 12). */
const gustRamp: Record<number, string> = {
  0.0:    'rgb(214,226,224)', // 0 m/s, ruhig
  0.125:  'rgb(150,200,162)', // 5 m/s
  0.25:   'rgb(120,190,120)', // 10 m/s
  0.35:   'rgb(214,204,120)', // 14 m/s
  0.425:  'rgb(224,168,92)',  // 17 m/s — Sturmböe (Bft 8)
  0.525:  'rgb(214,110,70)',  // 21 m/s — Bft 9
  0.625:  'rgb(190,58,58)',   // 25 m/s — schwere Sturmböe (Bft 10)
  0.75:   'rgb(150,50,110)',  // 30 m/s — Bft 11
  0.875:  'rgb(110,50,130)',  // 35 m/s — orkanartig
  1.0:    'rgb(70,40,110)',   // 40 m/s — Orkan (Bft 12)
};
/** DE/AT-RV-Nowcast-Horizont in Slider-Stunden (RV reicht bis +120 min). */
const NOWCAST_MAX_HOURS = 2;
/** AT GeoSphere-INCA-Nowcast-Horizont (Leadtimes 0.25 … 3.0 h). */
const INCA_MAX_HOURS = 3;

export type LayerKey = 'wind' | 'gust' | 'nowcast' | 'temp' | 'clouds' | 'sat' | 'lightning' | 'stations' | 'confidence' | 'snowline' | 'flownowcast' | 'poprob';

interface Props {
  location: Location;
  onBack?: () => void;
  /** Eingebetteter Modus (z. B. in der Event-Ergebnisseite): füllt den
   *  Container statt Vollbild, blendet die Vollbild-Chrome (Zurück, Modell-Rail,
   *  Punktforecast-Panel, Wind-/Sat-Schalter) aus, zentriert auf den Ort. */
  embedded?: boolean;
  /** Initial aktive Layer (Default: nur Wind). */
  initialActive?: LayerKey[];
  /** Initiale Slider-Stunde ab jetzt (Default 0 = jetzt). */
  initialHour?: number;
  /** Eingebettet: Slider auf das Eventfenster eines Tages begrenzen
   *  ([Start-, End-Offset in Stunden ab jetzt]) + Play-Button für den Tagesablauf. */
  embedHourRange?: [number, number];
  /** Eingebettet: aktiver Layer wird von außen gesteuert (Tab-Umschalter statt
   *  interner Icon-Sidebar). */
  embeddedLayer?: LayerKey;
  /** Übersichts-Modus (Kachel „2D-Karte" ohne gewählten Ort): kein Orts-Marker,
   *  kein Punktforecast-Panel — nur die DACH-Karte mit den Wetter-Layern. */
  overview?: boolean;
}

const LAYER_OPTIONS: { key: LayerKey; label: string; title: string }[] = [
  { key: 'wind', label: 'Wind', title: 'Wind (DWD ICON-D2 u/v 10m · 2,2 km)' },
  { key: 'gust', label: 'Böen', title: 'Windböen — Spitzen (DWD ICON-D2 vmax_10m · 2,2 km, 0–24 h). Sicherheitsrelevant für Drohne, Kran, Höhenarbeit (vgl. Go/No-Go).' },
  { key: 'nowcast', label: 'Niederschlag', title: 'Niederschlag-Vorhersage über den Slider — DE: 0–2 h RADOLAN-RV; AT: 0–3 h GeoSphere INCA; CH: MeteoSchweiz-Radar; danach jeweils ICON-D2' },
  { key: 'temp', label: 'Temperatur', title: '2-m-Temperatur (DWD ICON-D2 t_2m · 2,2 km, höhenkorrigiert)' },
  { key: 'clouds', label: 'Wolken', title: 'Bewölkung – tief/mittel/hoch geschichtet (DWD ICON-D2, 2,2 km, 0–12 h) — über den Slider' },
  { key: 'sat', label: 'Satellit', title: 'Meteosat (DWD OpenData, alle 3 h)' },
  { key: 'lightning', label: 'Blitze', title: 'Blitzortung letzte 60 Min (DWD Sferics)' },
  { key: 'stations', label: 'Stationen', title: 'Wetterstationen DWD/TAWES/SMN — klicken für Live-Werte' },
  { key: 'confidence', label: 'Sicherheit', title: 'Vertrauens-Schleier (KI · Klima-MOS): Kreuzschraffur, je dichter desto unsicherer die Vorhersage — aus Vorlaufzeit × klimatologischer Plausibilität gegen 30 J. DWD-Stationsklimatologie' },
  { key: 'snowline', label: 'Schneegrenze', title: 'Schneefallgrenze (KI · ML #2): Linie — oberhalb fällt Niederschlag als Schnee. Physik-Anker ~+1 °C + gelernte Orts-Korrektur (DWD-Stationen), dem Gelände folgend (höhenkorrigiert)' },
  { key: 'flownowcast', label: 'Flow-Nowcast', title: 'Flow-Nowcast: Optical-Flow-Extrapolation des Radars (Horn-Schunck-Bewegungsfeld + Lagrange-Advektion). Bewegt den Regen intensitätserhaltend in die nahe Zukunft (~0–60 min). Nur DE (RADOLAN-RV), trainingsfrei.' },
  { key: 'poprob', label: 'Regen-Chance', title: 'Regenwahrscheinlichkeit (%): kalibriertes Flow-Ensemble — 15 Member advehieren das Radar mit gestörten Bewegungsfeldern; je Zelle der Anteil, der Regen bringt. „Wie wahrscheinlich" statt „wie viel". Nur DE, ~0–60 min.' },
];

// Aktives Per-Land-Modell (ModelId) → Grid-Isolation (ModelChoice) für loadFusedForecast.
// Nur engine-gerasterte Modelle; alles andere fällt auf 'fusion' (nur Temp-Fallback,
// nicht gerendert solange fusionFor=false) bzw. den nativen Pfad zurück.
const MODEL_ID_TO_CHOICE: Partial<Record<ModelId, ModelChoice>> = {
  fusion: 'fusion', 'arome-at': 'arome', inca: 'inca', 'icon-d2-eps': 'icon-d2-eps',
  'icon-ch1-eps': 'icon-ch1-eps', 'icon-ch2-eps': 'icon-ch2-eps', 'arome-fr': 'arome-fr',
  'icon-eu': 'icon-eu',
};

const SAT_PRODUCT_LABELS: Record<SatelliteProduct, string> = {
  eu_rgb: 'EU',
  world_ir: 'Welt',
};
const SAT_PRODUCT_FULL_LABELS: Record<SatelliteProduct, string> = {
  eu_rgb: 'Europa RGB / IR',
  world_ir: 'Welt IR',
};

// Temperature spans -20°C..+40°C in the color ramp
const TEMP_RANGE = { min: -20, max: 40 };

// Precipitation ramp — color values keyed on normalised intensity (0..1
// against precipitationRange.max = 10 mm/h). Empirically most ICON-EU /
// MOSMIX forecasts deliver 0-2 mm/h in DACH (anything > 5 mm/h is a real
// downpour), so we COMPRESS the colorful part of the ramp into 0..0.3
// normalised (= 0..3 mm/h). Heavier rain past 3 mm/h still escalates but
// the most "real-world" precip already shows up in green / yellow rather
// than getting stuck in pale blue.
const precipRamp: Record<number, string> = {
  0.0:   'rgba(180, 220, 250, 0.0)',  // 0 mm/h — transparent
  0.01:  'rgb(180, 220, 250)',        // 0.1 mm/h drizzle — pale blue
  0.05:  'rgb(95, 175, 235)',         // 0.5 mm/h light rain — medium blue
  0.1:   'rgb(45, 130, 215)',         // 1 mm/h moderate rain — deep blue
  0.2:   'rgb(60, 195, 130)',         // 2 mm/h — green
  0.3:   'rgb(245, 200, 50)',         // 3 mm/h — amber
  0.5:   'rgb(235, 110, 55)',         // 5 mm/h heavy — orange
  0.75:  'rgb(200, 50, 50)',          // 7.5 mm/h very heavy — red
  1.0:   'rgb(170, 50, 130)',         // 10 mm/h extreme — purple
};

/** Äquirektangular-UV-Bounds (x0,y0,x1,y1) → QuadCorners [NW,NE,SE,SW] in [lng,lat].
 *  Adapter für den Fusion→CloudLayer-Transport (Fusion liefert uvBounds, der
 *  CloudLayer erwartet 4 Geo-Ecken). x=(lng+180)/360, y=(90−lat)/180 invertiert. */
function uvBoundsToCorners(uv: [number, number, number, number]): QuadCorners {
  const west = uv[0] * 360 - 180, north = 90 - uv[1] * 180;
  const east = uv[2] * 360 - 180, south = 90 - uv[3] * 180;
  return [[west, north], [east, north], [east, south], [west, south]];
}

export default function MapView({ location, onBack, embedded = false, initialActive, initialHour, embedHourRange, embeddedLayer, overview = false }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  const [active, setActive] = useState<Set<LayerKey>>(() => new Set<LayerKey>(initialActive ?? ['wind']));
  // Hover-Info-Panel rechts neben der Layer-Rail (ohne Verzögerung).
  const [layerHover, setLayerHover] = useState<{ key: LayerKey; top: number; left: number } | null>(null);
  const showLayerInfo = (btn: HTMLElement, key: LayerKey) => {
    const r = btn.getBoundingClientRect();
    setLayerHover({ key, left: r.right + 12, top: Math.min(Math.max(8, r.top - 4), window.innerHeight - 275) });
  };
  const [statuses, setStatuses] = useState<Record<LayerKey, { ok?: { model: string; fetchedAt: number; captured?: boolean }; err?: string }>>({
    wind: {}, gust: {}, nowcast: {}, temp: {}, clouds: {}, sat: {}, lightning: {}, stations: {}, confidence: {}, snowline: {}, flownowcast: {}, poprob: {},
  });
  const [satProduct, setSatProduct] = useState<SatelliteProduct>('eu_rgb');
  // Wind-Partikel-Steuerung (UI „Aus / Normal / Intensiv" + Dichte-Regler).
  // `on`=Animation an (Heatmap bleibt auch bei „Aus"), `intensive` verbreitert
  // Partikel + verlängert Schweif, `density` skaliert die viewport-Partikelzahl.
  const [windCfg, setWindCfg] = useState<{ on: boolean; intensive: boolean; density: number }>(
    { on: true, intensive: false, density: 1 },
  );
  // Wind-Höhe: 'surface' = natives ICON-D2 10-m-Gitter (2,2 km), sonst ICON-EU-
  // Druckfläche (850/700/500 hPa, ~7 km). windLevelRef spiegelt den State für
  // die (ref-getriebenen) Slider-/Refresh-Effekte ohne Stale-Closure.
  const [windLevel, setWindLevel] = useState<'surface' | WindPressureLevel>('surface');
  const windLevelRef = useRef<'surface' | WindPressureLevel>('surface');
  // Geladene ICON-EU-Höhenwinde, je Druckfläche gecacht (Frames + uvBounds).
  const euWindRef = useRef<Record<number, IconD2Wind>>({});
  // forecast cache + currently displayed hour (0 = "now", positive = hours into the future)
  const [forecast, setForecast] = useState<DwdForecastResult | null>(null);
  const [forecastHour, setForecastHour] = useState(initialHour ?? 0);
  // Gültigkeitszeit des aktuell angezeigten nativen Frames (Temp/Wind/Böen/Wolken)
  // → speist das Uhr-Label (Single Source of Truth, P0-3). null = kein
  // zeitvariabler Nativ-Layer aktiv → Label fällt auf die Fusions-Logik zurück.
  const [dataValidAtMs, setDataValidAtMs] = useState<number | null>(null);
  const reportValidAt = useCallback((ms: number) => {
    setDataValidAtMs((prev) => (prev === ms ? prev : ms));
  }, []);
  // Kein zeitvariabler Nativ-Layer aktiv → Label-Quelle leeren (Fallback auf Fusion).
  useEffect(() => {
    if (!(active.has('temp') || active.has('gust') || active.has('wind') || active.has('clouds'))) {
      setDataValidAtMs(null);
    }
  }, [active]);
  // Eingebettet: Play/Pause für den Tagesablauf (animiert den Slider über das Fenster).
  const [playing, setPlaying] = useState(false);
  // Fusion⇄Native/Per-Land-Modellquelle je Kartenlayer (docs/model-switcher-gate0.md).
  // Globaler Default (Start `native`), Per-Land-Wahl (`perCountry`) + Per-Layer-Override.
  const [modelSource, setModelSource] = useState<ModelSourceState>(() => initialModelSourceState());
  const modelSourceRef = useRef(modelSource);
  modelSourceRef.current = modelSource;
  // „Engine-Raster aktiv für Layer X?" = das resolvte Modell ist engine-gerastert
  // (Fusion/AROME/INCA) → das Grid speist den Layer statt des nativen Pfads. ICON-D2/
  // Native/Punktquellen → false (nativer ICON-D2-Pfad rendert). Frisch aus der Ref
  // (für []-dep-Effekt-Closures). Die Wahl ist explizit (Switcher) + mit Qualitäts-Badge.
  const fusionFor = (layer: string) => {
    const id = resolveModel(layer, modelSourceRef.current);
    return id !== 'native' && modelEntry(id)?.engineGridded === true;
  };
  // Aktives Per-Land-Modell → ModelChoice fürs Grid-Loading. Ändert sich die Wahl,
  // reagieren die bestehenden [modelChoice]-Effects (Ref-Update + Grid-Reload).
  const modelChoice: ModelChoice = MODEL_ID_TO_CHOICE[activeModelId(modelSource)] ?? 'fusion';
  // Per-Land-Modell-Switcher (Phase 3): Land-Wahl · Modellwahl je Land · Radar-Toggle.
  // Die Modellwahl koppelt Raster + Punkt über den Resolver (resolvePointSource).
  const onSelectCountry = (c: Country) => setModelSource((s) => setActiveCountry(s, c));
  const onSelectModel = (c: Country, id: ModelId) => setModelSource((s) => setCountryModel(s, c, id));
  const onToggleRadar = () => setModelSource((s) => toggleRadar(s));
  // Dev-Verifikations-Hook (Repo-Konvention wie __fusionV2 / __bsQA): Switch aus der
  // Konsole flippen (ergänzt die UI). Nur im Dev-Build.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    // layer==='point' steuert die zweite Engine (Punkt-Panel); sonst Raster-Layer
    // bzw. (ohne layer) der globale Raster-Default.
    w.__setFusion2d = (src: ModelSource, layer?: string) =>
      setModelSource((s) =>
        layer === 'point' ? setPointSource(s, src)
        : layer ? setLayerOverride(s, layer, src)
        : setGlobalSource(s, src));
    w.__clearFusion2d = (layer: string) => setModelSource((s) => clearLayerOverride(s, layer));
    w.__getFusion2d = () => modelSourceRef.current;
    // Fallback-Indikator simulieren (Phase-5-Verifikation): Fusion-Ladefehler an/aus.
    w.__setFusion2dError = (on: boolean) => setFusionError(!!on);
  }, []);
  // Aktives Land des Switchers folgt der gesuchten Location (Reset bei neuer Suche;
  // manuelle Tab-Wahl im Switcher hält bis zur nächsten Suche).
  useEffect(() => { setModelSource((s) => setActiveCountry(s, location.country)); }, [location.country]);
  const forecastRef = useRef<DwdForecastResult | null>(null);
  // Auto-Fallback (Phase 5): Fusion nur rendern, wenn die gridded-Fusion-Daten für
  // DIESEN Layer tatsächlich vorliegen; sonst rendert weiter der native Pfad
  // (garantierter Fallback, nie leer). Liest aus der Ref → kein stale Closure.
  const fusionReadyFor = (layer: string): boolean => {
    const l0 = forecastRef.current?.hours[0]?.layers as
      (Record<string, unknown> & { precipitation?: unknown }) | undefined;
    if (!l0) return false;
    if (layer === 'wind') return !!l0.wind;
    if (layer === 'temp') return !!l0.temperature;
    if (layer === 'clouds') return !!l0.clouds;
    if (layer === 'nowcast') return !!l0.precipitation;
    return false;
  };
  // „Fusion aktiv fürs Rendern" = vom Nutzer gewählt UND Daten bereit. Nur DANN
  // treten die nativen Effekte zurück — fehlt/scheitert die Fusion, bleibt nativ.
  const fusionActiveFor = (layer: string) => fusionFor(layer) && fusionReadyFor(layer);
  // Fusion-Ladefehler (Phase A) → nicht-blockierender Indikator am Switch. Während
  // des normalen Ladens (noch kein Fehler, noch keine Daten) rendert still nativ.
  const [fusionError, setFusionError] = useState(false);
  const layerRefs = useRef<{ wind?: WindLayer; temp?: ScalarLayer; gust?: ScalarLayer; clouds?: CloudLayer; precip?: ScalarLayer; rain?: RainLayer; confidence?: ConfidenceLayer; ki?: RainLayer; pop?: RainLayer }>({});
  // Flow-Nowcast: geschätztes Bewegungsfeld + Basis-Frame (gröber) je RADOLAN-Lauf.
  const flowRef = useRef<{ key: string; base: Float32Array; flow: Flow; corners: QuadCorners; intervalMin: number } | null>(null);
  const popReadyRef = useRef(false);
  // Geteilter LRU-Cache der Ensemble-PoP: confidence-PoP UND poprob (und gleiche
  // Slider-Stunde über Re-Renders) teilen sich dieselbe Berechnung (15 Advektionen
  // je Lauf×Lead statt pro Effekt/Tick neu). Key = Fluss-Lauf | Lead.
  const ensembleCacheRef = useRef<Map<string, Float32Array>>(new Map());
  // Gebündelte DACH-Stationsklimatologie (ML #1) für den Vertrauens-Schleier —
  // lazy beim ersten Aktivieren geladen.
  const climaFieldRef = useRef<ClimaField | null>(null);
  const climaFieldLoadingRef = useRef(false);
  const snowlineReadyRef = useRef(false);
  // Zeitversetztes ICON-D2-Ensemble (Lauf-zu-Lauf-Spread) für den Temperatur-Schleier.
  const tempSpreadRef = useRef<IconD2TempSpread | null>(null);
  const tempSpreadLoadingRef = useRef(false);
  // RADOLAN-RV Nowcast: vorgerenderte 0..120-min-Frames. `nowcastTick` triggert
  // den Slider-Render-Effekt neu, sobald ein frischer Lauf geladen ist.
  const nowcastRef = useRef<RvNowcast | null>(null);
  // ICON-D2-Stundenraten (Forecast). Geteilt von DE/AT (>2h) und CH (>0h).
  const iconD2Ref = useRef<IconD2Precip | null>(null);
  // CH-„jetzt": MeteoSwiss-Radar rzc (ein Frame).
  const meteoRadarRef = useRef<RadarFrame | null>(null);
  // AT 0–3h: GeoSphere INCA-Nowcast-Grid (12 Frames, 15-min).
  const incaGridRef = useRef<IncaGrid | null>(null);
  // DACH-Komposit: mischt pro Karten-Zelle das richtige Landesradar (DE RADOLAN /
  // AT INCA / CH rzc) bzw. ICON-D2 — unabhängig vom gesuchten Ort.
  const compositorRef = useRef<PrecipCompositor | null>(null);
  // Wolken: ICON-D2 CLCT-Frames (0–48 h, stündlich).
  const iconD2CloudsRef = useRef<IconD2CloudStack | null>(null);
  // Wind: natives ICON-D2 u/v-10m-Gitter (0–12 h) statt Open-Meteo-Punktgrid.
  const iconD2WindRef = useRef<IconD2Wind | null>(null);
  const installWindRef = useRef<(() => Promise<void>) | null>(null);
  // Guard gegen einen DOPPELTEN nebenläufigen Wind-Load am Kaltstart: mehrere
  // Effects können installWind feuern, bevor iconD2WindRef gesetzt ist (die Ref
  // wird erst nach dem ersten Frame gesetzt) → sonst wird jedes GRIB-Feld 2× geholt.
  const windLoadingRef = useRef(false);
  // Temperatur: natives ICON-D2 t_2m-Gitter (0–24 h) + hsurf-DEM-Korrektur,
  // statt der Fusion (Open-Meteo/IDW).
  const iconD2TempRef = useRef<IconD2Temp | null>(null);
  // Windböen: natives ICON-D2 vmax_10m-Gitter (0–24 h), lazy beim Aktivieren.
  const iconD2GustRef = useRef<IconD2Gust | null>(null);
  const installGustRef = useRef<(() => Promise<void>) | null>(null);
  const installTempRef = useRef<(() => Promise<void>) | null>(null);
  // Die gridded Fusion (~1700 brightsky-Requests!) lädt NICHT mehr eager am Mount,
  // sondern nur lazy, wenn der Temperatur-Layer aktiviert wird (sie speist heute
  // nur noch dessen Fallback + die Stadt-Temp-Labels — alle Karten-Layer sind nativ).
  const fusionRequestedRef = useRef(false);
  // Stationen-Layer lazy: zieht ~150 Schweizer SMN-CSVs + AT-TAWES — erst bei
  // Aktivierung laden statt eager am Mount (Stationen ist kein Default-Layer).
  const installStationsRef = useRef<(() => void | Promise<void>) | null>(null);
  const stationsLoadedRef = useRef(false);
  const [nowcastTick, setNowcastTick] = useState(0);
  // Aktuelles Land frisch für Mount-Effekt-Closures (deren deps sind []).
  const countryRef = useRef(location.country);
  countryRef.current = location.country;
  // Lazy-Loader: RV-Tar + ICON-D2-GRIB2 werden erst beim ersten Aktivieren des
  // Niederschlag-Buttons gezogen, nicht schon beim Mount.
  const installNowcastRef = useRef<(() => Promise<void>) | null>(null);
  // Lazy-Loader für den Wolken-Layer (ICON-D2 CLCT).
  const installCloudsRef = useRef<(() => Promise<void>) | null>(null);
  // Satellit + Blitze lazy: sind keine Default-Layer, wurden aber bisher eager am
  // Mount installiert (2× fetchWmsLatestTime + Raster-Source-Add konkurrieren mit
  // dem Wind-Hero-Layer um den Kaltstart). Erst bei Aktivierung laden.
  const installSatelliteRef = useRef<(() => void) | null>(null);
  const satLoadedRef = useRef(false);
  const installLightningRef = useRef<(() => void) | null>(null);
  const lightningLoadedRef = useRef(false);
  // Aktuelles Satelliten-Produkt frisch für Mount-Closures (deps []).
  const satProductRef = useRef(satProduct);
  satProductRef.current = satProduct;
  const tempLabelMarkersRef = useRef<Map<string, Marker>>(new Map());
  // Ref-backed loader so we can fire a fresh forecast from anywhere (e.g.
  // when the model-choice selector changes) without re-mounting the map.
  const reloadForecastRef = useRef<(() => Promise<void>) | null>(null);
  // Latest model choice picked up by `loadOpenMeteo` — keeps the closure
  // current without a re-mount when the selector changes.
  const modelChoiceRef = useRef<ModelChoice>('fusion');
  useEffect(() => { modelChoiceRef.current = modelChoice; }, [modelChoice]);

  function updateStatus(key: LayerKey, patch: { ok?: { model: string; fetchedAt: number; captured?: boolean }; err?: string }) {
    setStatuses(prev => ({ ...prev, [key]: patch }));
  }

  function toggle(key: LayerKey) {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Ist für die aktuelle Slider-Stunde ein Niederschlags-Frame verfügbar?
  // 0–2 h: RADOLAN-RV geladen. >2 h: ICON-D2 geladen UND innerhalb des Horizonts.
  // (Liest Refs zur Render-Zeit; der Visibility-Effekt hängt an `nowcastTick`,
  // läuft also neu, sobald Frames eintreffen.)
  function precipFrameReady(hour: number): boolean {
    // DACH-Komposit: sichtbar, sobald eine für diese Stunde beitragende Quelle da
    // ist — ein Landesradar im jeweiligen Horizont ODER ICON-D2 (deckt alles ab).
    if (hour <= NOWCAST_MAX_HOURS + 1e-6 && nowcastRef.current) return true; // DE RADOLAN
    if (hour <= INCA_MAX_HOURS + 1e-6 && incaGridRef.current) return true;   // AT INCA
    if (hour < 0.5 && meteoRadarRef.current) return true;                    // CH rzc
    const d2 = iconD2Ref.current;
    if (!d2 || d2.frames.length === 0) return false;
    const horizonH = (d2.frames[d2.frames.length - 1].validAt.getTime() - Date.now()) / 3600_000;
    return hour <= horizonH + 0.5;
  }

  /** Slider-Obergrenze: ICON-D2-Horizont (Niederschlag ODER Wolken, je nachdem
   *  welche Daten geladen sind) in Stunden ab jetzt. */
  function iconD2HorizonHours(): number {
    let last = 0;
    for (const ref of [iconD2Ref.current, iconD2CloudsRef.current]) {
      if (ref && ref.frames.length) {
        last = Math.max(last, ref.frames[ref.frames.length - 1].validAt.getTime());
      }
    }
    return last ? Math.floor((last - Date.now()) / 3600_000) : 0;
  }

  useEffect(() => {
    if (!containerRef.current) return;

    // Open at the DACH overview so DE/AT/CH are all visible regardless of
    // which country was searched in. The marker still pins the searched
    // location so the user can see it in context; they can drag/zoom in
    // manually. (The country profile still drives the *point forecast*
    // source mix — only the camera + mask use DACH_VIEW.)
    // Geräte-Pixelratio auf Touch-Geräten (Handy/Tablet) cappen: ohne Cap rendert
    // MapLibre bei DPR 3 das ~9-fache an Fragmenten — Basemap-Vektorkacheln UND
    // alle WebGL-Wetterlayer (Heatmap, Maske, Dim, Skalar, Wind-Partikel) laufen
    // pro Geräte-Pixel. Auf Mobile dominiert das die Ladezeit/Ruckler. Cap 1.5 ≈
    // viertelt die GPU-Fragmentlast bei kaum sichtbarem Schärfeverlust. Desktop
    // (Maus/feiner Zeiger) behält die volle native Auflösung.
    const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const dpr = window.devicePixelRatio || 1;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: embedded ? [location.lon, location.lat] : DACH_VIEW.defaultCenter,
      zoom: embedded ? 7.4 : DACH_VIEW.defaultZoom,
      pixelRatio: coarsePointer ? Math.min(dpr, 1.5) : dpr,
      // Load tuning. The OpenFreeMap basemap is effectively static, so don't
      // spend requests re-fetching expired tiles in the background. fadeDuration
      // 0 makes basemap tiles/labels paint immediately instead of cross-fading
      // over 300 ms — faster first viewport fill and fewer compositor repaints
      // during the load burst (the weather custom layers carry the visual
      // interest, not a basemap label fade).
      refreshExpiredTiles: false,
      fadeDuration: 0,
    });

    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // Dim overlay — a semi-transparent dark fill that sits over the basemap
    // but underneath the boundary/label/weather layers. Toggled visible when
    // any weather layer is active, so the heatmaps "pop" on a dark canvas.
    const addDimOverlay = () => {
      if (!map.getSource(WORLD_SOURCE_ID)) {
        map.addSource(WORLD_SOURCE_ID, {
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
      if (!map.getLayer(DIM_LAYER_ID)) {
        const beforeId = map.getLayer('boundary_3') ? 'boundary_3' : undefined;
        map.addLayer(
          {
            id: DIM_LAYER_ID,
            type: 'fill',
            source: WORLD_SOURCE_ID,
            // ink-900 (#2C2A26) dark wash. Sits over the basemap but below
            // boundary/label layers, so it darkens the DACH interior (outside
            // DACH is covered by the opaque country mask) without dimming the
            // city labels. Always on — wind particles and the precip radar
            // "pop" on a dark canvas instead of washing out against the light
            // basemap, regardless of which weather layer is active.
            paint: { 'fill-color': '#2C2A26', 'fill-opacity': 0.7 },
            layout: { visibility: 'visible' },
          },
          beforeId,
        );
      }
    };
    // Country mask: an inverted polygon (world − country) cuts the active
    // country out of a 100%-opaque dark fill that sits ABOVE every OSM
    // layer. Weather custom layers added later float on top of the mask, so
    // their rectangular textures still show across the whole bbox — only
    // the country interior reveals the underlying basemap.
    const addCountryMask = (data: GeoJSON.Feature | GeoJSON.FeatureCollection) => {
      if (!map.getSource(COUNTRY_MASK_SOURCE_ID)) {
        map.addSource(COUNTRY_MASK_SOURCE_ID, { type: 'geojson', data });
      } else {
        (map.getSource(COUNTRY_MASK_SOURCE_ID) as unknown as { setData: (d: GeoJSON.Feature | GeoJSON.FeatureCollection) => void }).setData(data);
      }
      if (!map.getLayer(COUNTRY_MASK_LAYER_ID)) {
        map.addLayer({
          id: COUNTRY_MASK_LAYER_ID,
          type: 'fill',
          source: COUNTRY_MASK_SOURCE_ID,
          // sand-200 (#E0D6BE) — same warm sand tone as the homepage hero
          // background gradient. The map composition now flows visually
          // from the Startseite into the Kartenansicht. City labels are
          // dark pills with white text, which sit MORE readable on this
          // light sand than on the previous dark masks.
          paint: { 'fill-color': '#E0D6BE', 'fill-opacity': 1.0 },
          layout: { visibility: 'visible' },
        });
      }
    };
    const initOverlays = async () => {
      addDimOverlay();
      // DACH mask: DE + AT + CH cut out of a world-sized polygon so the
      // dim layer covers everything OUTSIDE the three countries. Country
      // mask is no longer per-search-country — see DACH_VIEW notes.
      const mask = await loadDachMask().catch(() => null);
      const data: GeoJSON.Feature | GeoJSON.FeatureCollection = mask ?? { type: 'FeatureCollection', features: [] };
      addCountryMask(data);
      // Country mask just landed at the top of the style stack — re-hoist
      // the weather overlays above it. Same logic as applyVisibility's tail;
      // doing it here makes sure the layers come up correct on the very first
      // paint even before the user toggles anything.
      if (map.getLayer('precip-forecast')) map.moveLayer('precip-forecast');
      if (map.getLayer(STATIONS_LAYER_ID)) map.moveLayer(STATIONS_LAYER_ID);
    };
    if (map.isStyleLoaded()) void initOverlays();
    else map.once('load', () => { void initOverlays(); });

    if (!overview) {
      markerRef.current = new maplibregl.Marker({ color: '#4a7dff' })
        .setLngLat([location.lon, location.lat])
        .addTo(map);
    }

    // Layer instances. Order in the style stack (top → bottom):
    //   wind (particles)  →  clouds  →  precip (forecast)  →  temp  →  rain-raster  →  basemap
    // Wind-Partikel-Tempo (rein visueller Zeitraffer, echtzeit wäre unsichtbar):
    //  • speedFactor  = Basistempo bei der Übersicht. 0.02 ≈ ~2400× (1 Anim-Sek
    //    ≈ 40 min Wind), windy.com-nah. Höher = flotter.
    //  • speedZoomDamping = 0 → KEINE zoom-abhängige Anpassung: reine geografische
    //    Advektion. Die Partikel bewegen sich konsistent zur Karte (gleicher Bezug
    //    zu den Geo-Features auf jeder Zoomstufe) — kein Bremsen beim Reinzoomen.
    //    (k=1 hielte das Bildschirmtempo konstant, was relativ zur größer werdenden
    //    Karte wie Verlangsamung wirkt; >1 wäre windy-artiges aktives Bremsen.)
    // Zusätzlich delta-time-normiert im Shader → refresh-rate-unabhängig.
    // speedGamma < 1 hebt schwache Winde an, damit sie sichtbar driften statt
    // einzufrieren (Anker speedRef=5 m/s unverändert). speedFactor bleibt das
    // Basistempo bei ~5 m/s; γ staucht den Dynamikumfang (schwach schneller,
    // stark leicht langsamer) → kein „Stillstand" bei Schwachwind.
    // speedMin = Mindest-Anzeigetempo (m/s): JEDER vorhandene Wind driftet immer
    // sichtbar (nie Stillstand), auch der leichteste — kombiniert mit langer
    // Partikel-Lebensdauer für Wind-Zellen (kurze Lebensdauer nur bei echter Flaute).
    const wind = new WindLayer({
      windPngUrl: '', windJsonUrl: '',
      speedFactor: 0.02, speedRefZoom: 5.5, speedZoomDamping: 0,
      speedGamma: 0.5, speedRef: 5, speedMin: 2,
      // Touch/coarse-pointer (mobile/tablet): skip the particle passes during
      // active pan/zoom so the basemap + heatmap stay smooth; particles resume
      // on moveend. Desktop (fine pointer) keeps full fidelity.
      reduceMotionOnMove: coarsePointer,
      // The CPU wind-field refine (bilinear ×upsample + 3×3 smooth, then a
      // HALF_FLOAT upload) runs on every genuine frame change — toggle re-apply
      // that slips past the dedup guard, slider scrub, time interpolation. At
      // upsample 2 it was measured at ~2.5 s on a 4×-throttled phone and blocked
      // the main thread. On coarse-pointer devices the map renders at half native
      // resolution (pixelRatio cap) and the GPU already samples the field with
      // LINEAR bilinear, so the extra CPU upsample is largely invisible there —
      // drop it to 1 (skips the 4× pixel grid AND the smooth) to cut the decode
      // ~4–8×. Desktop keeps upsample 2 for the crisp continuous field.
      upsample: coarsePointer ? 1 : 2,
    });
    const tempLayer = new ScalarLayer({
      id: 'temperature',
      colorRamp: temperatureRamp,
      visRange: { start: 0, end: 0 },
      // fully opaque heatmap with country borders + labels rendered on top
      opacity: 0.95,
      zoomAttenuation: { from: 11, perStep: 0.08, floor: 0.7 },
      // Per-pixel DEM lapse refinement — the value PNG's green channel
      // carries the IDW cell's mean elevation, and the DEM image (passed
      // via setDem after the forecast loads) provides the per-pixel terrain.
      // Result: a single 6-km cell containing both a 500-m valley and a
      // 2500-m peak renders the valley markedly warmer than the peak.
      demRefine: { lapseRatePerM: 0.0065, demMax: 4500 },
    });
    // Böen-Layer (DWD ICON-D2 vmax_10m) — Raster wie Temperatur, eigene Palette.
    // Keine DEM-Höhenkorrektur (10-m-Diagnostik). visRange blendet windstille
    // Flächen aus, sonst Windy-artige Vollflächen-Darstellung über den Slider.
    const gustLayer = new ScalarLayer({
      id: 'gust',
      colorRamp: gustRamp,
      visRange: { start: 0.02, end: 0.09 },
      opacity: 0.82,
      zoomAttenuation: { from: 11, perStep: 0.08, floor: 0.7 },
    });
    // Wolken-Layer (DWD ICON-D2 Multi-Layer tief/mittel/hoch, 0–12 h) — WebGL-
    // Quad-Layer mit höhen-bewusstem Composite-Shader, gespeist über den Slider
    // (Frame-Wechsel = Textur-Upload). Liegt unter Beschriftungen/Maske.
    const cloudLayer = new CloudLayer({ id: 'clouds', opacity: 0.95 });
    // Precipitation forecast layer — only visible when the slider is in the future
    // (RainViewer's live radar already covers hour 0 with better resolution).
    const precipLayer = new ScalarLayer({
      id: 'precip-forecast',
      colorRamp: precipRamp,
      // visRange filters normalized values (0..1; 1 ≙ vMax=10 mm/h). Cells
      // below `start` are fully transparent, above `end` fully opaque,
      // in-between fade via smoothstep. ICON-EU/MOSMIX precipitation is
      // typically very modest (drizzle ~ 0.05-0.3 mm/h, light rain
      // ~ 0.3-1.0 mm/h, only heavy bands push past 1-2 mm/h) so a tight
      // range close to zero is needed to make ANY of it visible — earlier
      // {0.02..0.2} (= 0.2 mm/h..2 mm/h) hid almost everything the model
      // actually forecasts. New range fades in light drizzle at 0.05 mm/h
      // and reaches full saturation at 0.5 mm/h.
      visRange: { start: 0.005, end: 0.05 },
      opacity: 0.85,
      zoomAttenuation: { from: 10, perStep: 0.08, floor: 0.5 },
    });
    // Durchgehender Niederschlags-Layer (RADOLAN-RV + ICON-D2). WebGL-Quad-
    // Layer: Frame-Wechsel = Textur-Upload (kein PNG-Decode) → flüssiger Slider.
    const rainLayer = new RainLayer({ id: NOWCAST_LAYER_ID, colorRamp: precipRainRamp, opacity: 0.85 });
    // Flow-Nowcast: eigener RainLayer für die advehierten Radar-Frames.
    const kiLayer = new RainLayer({ id: FLOW_NOWCAST_LAYER_ID, colorRamp: precipRainRamp, opacity: 0.85 });
    // Regenwahrscheinlichkeit (Ensemble-PoP): RainLayer wie der Niederschlag —
    // projektionskorrektes Warp-Mesh (DE1200, polar-stereografisch). Früher ein
    // ScalarLayer mit äquirektangulärem 2-Eck-Rechteck → bis ~160 km Versatz.
    const popLayer = new RainLayer({ id: POP_LAYER_ID, colorRamp: popRamp, opacity: 0.78 });
    // Vertrauens-Schleier (Kreuzschraffur) — über den Datenschichten.
    const confidenceLayer = new ConfidenceLayer({ id: CONFIDENCE_LAYER_ID, opacity: 0.8 });
    layerRefs.current = { wind, temp: tempLayer, gust: gustLayer, clouds: cloudLayer, precip: precipLayer, rain: rainLayer, confidence: confidenceLayer, ki: kiLayer, pop: popLayer };

    // Insert temp + clouds *under* the boundary/label layers of the OSM basemap so
    // country outlines, state borders and city labels stay readable on top of the
    // saturated heatmap (Windy-style). 'boundary_3' is the lowest boundary layer
    // in the OpenFreeMap Liberty style.
    const TOPMOST_INSERT_BEFORE = 'boundary_3';
    const addLayers = () => {
      const beforeId = map.getLayer(TOPMOST_INSERT_BEFORE) ? TOPMOST_INSERT_BEFORE : undefined;
      if (!map.getLayer(tempLayer.id)) map.addLayer(tempLayer, beforeId);
      if (!map.getLayer(gustLayer.id)) map.addLayer(gustLayer, beforeId);
      if (!map.getLayer(precipLayer.id)) map.addLayer(precipLayer, beforeId);
      if (!map.getLayer(rainLayer.id)) map.addLayer(rainLayer, beforeId);
      if (!map.getLayer(kiLayer.id)) map.addLayer(kiLayer, beforeId);
      if (!map.getLayer(popLayer.id)) map.addLayer(popLayer, beforeId);
      if (!map.getLayer(cloudLayer.id)) map.addLayer(cloudLayer, beforeId);
      if (!map.getLayer(wind.id)) map.addLayer(wind);
      // Schleier ZULETZT mit beforeId → liegt über den Datenschichten, aber unter
      // Grenzen/Beschriftungen (die lesbar bleiben sollen).
      if (!map.getLayer(confidenceLayer.id)) map.addLayer(confidenceLayer, beforeId);
      // Schneefallgrenze (ML #2) — native GeoJSON-Linie: weißes Casing + blaue
      // Hauptlinie für Lesbarkeit über jedem Untergrund. Daten kommen aus dem
      // Build-Effekt; initial leer/unsichtbar.
      if (!map.getSource(SNOWLINE_SOURCE_ID)) {
        map.addSource(SNOWLINE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      if (!map.getLayer(SNOWLINE_CASING_ID)) {
        map.addLayer({
          id: SNOWLINE_CASING_ID, type: 'line', source: SNOWLINE_SOURCE_ID,
          layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 4.5, 'line-opacity': 0.85 },
        });
      }
      if (!map.getLayer(SNOWLINE_LAYER_ID)) {
        map.addLayer({
          id: SNOWLINE_LAYER_ID, type: 'line', source: SNOWLINE_SOURCE_ID,
          layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#1f4fd0', 'line-width': 2 },
        });
      }
      // Move the fusion precipitation scalar ABOVE the country mask.
      // Without this, precipitation cells located outside DACH (e.g. an
      // approaching front sitting over N-Italy or the Czech Republic) get
      // covered by the sand-200 country mask and the layer appears empty —
      // misleading the user, especially when the only forecasted precip
      // sits in the neighbouring countries. Weather is continental, the
      // mask just dims the basemap; the data layer must render globally.
      if (map.getLayer('country-mask-fill') && map.getLayer(precipLayer.id)) {
        map.moveLayer(precipLayer.id);
      }
      applyVisibility();
    };
    const applyVisibility = () => {
      const set: Record<string, boolean> = {
        wind: active.has('wind'),
        clouds: active.has('clouds'),
        temperature: active.has('temp'),
        gust: active.has('gust'),
        // Niederschlag-Layer nur sichtbar, wenn für die Slider-Stunde ein Frame
        // verfügbar ist (länderabhängig: RV/INCA/rzc bzw. ICON-D2 im Horizont).
        [NOWCAST_LAYER_ID]: active.has('nowcast') && precipFrameReady(forecastHour) && !fusionActiveFor('nowcast') && modelSourceRef.current.radar,
        // Fusion-Niederschlag (Forecast-Grid) statt Radar-Komposit, wenn der Resolver
        // Fusion für 'nowcast' wählt. Ohne Daten rendert der ScalarLayer nichts (transparent).
        'precip-forecast': active.has('nowcast') && fusionActiveFor('nowcast') && modelSourceRef.current.radar,
        [SAT_LAYER_ID]: active.has('sat'),
        [LIGHTNING_LAYER_ID]: active.has('lightning'),
        [STATIONS_LAYER_ID]: active.has('stations'),
        [CONFIDENCE_LAYER_ID]: active.has('confidence'),
        [SNOWLINE_CASING_ID]: active.has('snowline'),
        [SNOWLINE_LAYER_ID]: active.has('snowline'),
        [FLOW_NOWCAST_LAYER_ID]: active.has('flownowcast') && modelSourceRef.current.radar,
        [POP_LAYER_ID]: active.has('poprob') && modelSourceRef.current.radar,
        [DIM_LAYER_ID]: true, // dark wash always on — keeps the canvas dark even with no weather layer
      };
      for (const id of Object.keys(set)) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', set[id] ? 'visible' : 'none');
        }
      }
      // Precipitation fusion scalar needs to render ABOVE the country mask
      // so precip systems outside DACH (e.g. fronts over N-Italy moving
      // north) stay visible. The mask cuts out DACH for the basemap; the
      // data layer is continental.
      if (map.getLayer('precip-forecast')) map.moveLayer('precip-forecast');
      // Niederschlags-RainLayer über die Maske heben, damit das Radar/Modell
      // sauber über der freigestellten Karte liegt.
      if (map.getLayer(NOWCAST_LAYER_ID)) map.moveLayer(NOWCAST_LAYER_ID);
      if (map.getLayer(FLOW_NOWCAST_LAYER_ID)) map.moveLayer(FLOW_NOWCAST_LAYER_ID);
      if (map.getLayer(POP_LAYER_ID)) map.moveLayer(POP_LAYER_ID);
      // Vertrauens-Schleier ÜBER den Datenschichten (auch über dem Niederschlag,
      // der gerade nach oben gehoben wurde) — sonst verdeckt das Radar die
      // Schraffur. Die Stationen bleiben darüber (nächster moveLayer).
      if (map.getLayer(CONFIDENCE_LAYER_ID)) map.moveLayer(CONFIDENCE_LAYER_ID);
      // Schneefallgrenze als Linie ganz oben (dünn → verdeckt nichts), über den
      // Rastern und dem Schleier.
      if (map.getLayer(SNOWLINE_CASING_ID)) map.moveLayer(SNOWLINE_CASING_ID);
      if (map.getLayer(SNOWLINE_LAYER_ID)) map.moveLayer(SNOWLINE_LAYER_ID);
      // Stations live ON TOP of everything (including the country mask and
      // any precipitation overlay). Re-hoisting last keeps the markers
      // reachable regardless of init order.
      if (map.getLayer(STATIONS_LAYER_ID)) map.moveLayer(STATIONS_LAYER_ID);
    };
    if (map.isStyleLoaded()) addLayers();
    else map.once('load', addLayers);

    mapRef.current = map;
    if (import.meta.env.DEV) {
      (window as unknown as { __map: MapLibreMap }).__map = map;
    }

    const abort = new AbortController();

    // Two-phase progressive forecast load:
    //   Phase A — fast first paint: 6 hours @ 80 × 64 grid (~ 4× less IDW
    //     work, ~ 4× less hours) → user sees real data in ~ 1 s after
    //     source-fetches return.
    //   Phase B — full quality: 24 hours @ 160 × 128 grid (production
    //     fidelity), runs in background. Sources are already warm in cache
    //     from Phase A, so this is pure compute + encode (~ 2-4 s).
    //
    // Both phases use the same source-cache and produce comparable temp/
    // wind/cloud/precip frames — the second just supersedes the first
    // smoothly via `setForecast`. The user never sees a blank map.
    const loadOpenMeteo = async () => {
      const applyForecast = (r: DwdForecastResult, tempLayerRef: ScalarLayer) => {
        forecastRef.current = r;
        setFusionError(false);          // Fusion da → etwaigen Fallback-Indikator löschen
        setForecast(r);
        const h0 = r.hours[0]?.layers;
        // Wind kommt ausschließlich nativ aus ICON-D2 (installWind) — die Fusion
        // speist den Wind-Layer nicht mehr, daher hier kein Wind-Status/-Setup.
        // Temp-Status + Fusion-DEM nur als Fallback, solange das native ICON-D2-
        // Temp noch nicht geladen ist (sonst überschriebe das DACH-DEM der Fusion
        // das ICON-Bounds-DEM → uv-Versatz im Lapse-Shader).
        if (h0?.temperature && !iconD2TempRef.current) updateStatus('temp', { ok: { model: r.model, fetchedAt: r.fetchedAt } });
        if (r.demImage && !iconD2TempRef.current) tempLayerRef.setDem(r.demImage);
      };

      try {
        // Fire off the secondary alpine sources (AROME / INCA / TAWES / SMN)
        // in the background BEFORE we await Phase A — by the time Phase B
        // fires those fetches are already populating sourceCache, so Phase
        // B's wall-clock drops from "max of all 6 cold fetches" to just
        // "FusionEngine.run() compute". Saves ~ 1-2 s on Phase B cold load.
        prefetchSecondarySources(FORECAST_HOURS);

        // Phase A — fast preview: skips secondary alpine sources (AROME,
        // INCA, TAWES, SMN) AND disables Gaussian smoothing for non-temp
        // variables AND skips the temporal-median pass. Total saving on
        // top of the smaller grid/hour count: another ~ 300-500 ms.
        const fast = await loadFusedForecast({
          signal: abort.signal,
          temperatureRange: TEMP_RANGE,
          hours: 6,
          denseCols: 80,
          denseRows: 64,
          quickMode: true,
          country: location.country,
          modelChoice: modelChoiceRef.current,
        });
        if (abort.signal.aborted) return;
        applyForecast(fast, tempLayer);

        // Phase B — full quality (background, scheduled after first paint)
        // We use queueMicrotask + a small timeout so React has a chance
        // to commit the Phase-A state before we monopolise the main
        // thread with the heavier compute.
        setTimeout(() => {
          if (abort.signal.aborted) return;
          loadFusedForecast({
            signal: abort.signal,
            temperatureRange: TEMP_RANGE,
            hours: FORECAST_HOURS,
            // Auflösung reduziert (war Default 160×128) UND quickMode an: das
            // gridded Fusion-Feld wird NICHT mehr gerendert (Layer-Raster nativ
            // aus ICON-D2, Stadt-Labels aus dem nativen Temp-Gitter, der
            // Fusion-Niederschlag-Layer ist dauerhaft unsichtbar). Es bleibt nur
            // ein seltener Temp-Fallback + die Slider-Stunden. quickMode spart das
            // Nicht-Temp-Gaussian-Smoothing + die temporale Median-Phase, die
            // kleinere Auflösung den Spatial-Kernel — zusammen ~⅓ der bisherigen
            // 12,7 s Phase-B-Main-Thread-Last (= weniger Jank beim Layer-Laden).
            denseCols: 100,
            denseRows: 80,
            quickMode: true,
            country: location.country,
            modelChoice: modelChoiceRef.current,
          }).then((full) => {
            if (abort.signal.aborted) return;
            applyForecast(full, tempLayer);
          }).catch((err) => {
            if ((err as { name?: string })?.name === 'AbortError') return;
            // Phase A already painted; full-quality failure is silent.
          });
        }, 80);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : String(err);
        // Fusion-Load gescheitert → nicht-blockierender Fallback-Indikator; die
        // fusion-gewählten Layer rendern via fusionActiveFor weiter nativ (nicht leer).
        setFusionError(true);
        // Wind hängt nicht mehr an der Fusion → nur Temp (Fusion-Fallback) melden.
        updateStatus('temp', { err: msg });
      }
    };

    // Satellite raster layer — sits BELOW everything else (right above the
    // dim overlay) so heatmaps and wind particles render on top.
    const installSatelliteLayer = (product: SatelliteProduct) => {
      const meta = satelliteSourceMeta(product);
      const apply = () => {
        if (map.getLayer(SAT_LAYER_ID)) map.removeLayer(SAT_LAYER_ID);
        if (map.getSource(SAT_SOURCE_ID)) map.removeSource(SAT_SOURCE_ID);
        map.addSource(SAT_SOURCE_ID, {
          type: 'raster',
          tiles: [meta.template],
          tileSize: 512,
          minzoom: 0,
          maxzoom: 8,
          attribution: meta.attribution,
        });
        // Order: just above the country mask, below the radar / heatmaps /
        // wind layers so the satellite image acts as a "backdrop" the
        // weather data renders on top of.
        const beforeId = map.getLayer(tempLayer.id) ? tempLayer.id : undefined;
        map.addLayer(
          {
            id: SAT_LAYER_ID,
            type: 'raster',
            source: SAT_SOURCE_ID,
            paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0 },
            layout: { visibility: active.has('sat') ? 'visible' : 'none' },
          },
          beforeId,
        );
        updateStatus('sat', { ok: { model: meta.title, fetchedAt: Date.now() } });
        // P2-2: echtes Capture-Datum aus WMS-TIME nachladen → „Stand HH:MM".
        void fetchWmsLatestTime(meta.layerLocalName).then((t) => {
          if (t) updateStatus('sat', { ok: { model: meta.title, fetchedAt: t.getTime(), captured: true } });
        });
      };
      if (map.isStyleLoaded()) apply();
      else map.once('load', apply);
    };

    // DACH weather-station network — circle markers with click-popup. Sits
    // on top of every raster/heatmap layer so the user can always reach them.
    const installStationsLayer = async () => {
      const apply = async () => {
        if (map.getLayer(STATIONS_LAYER_ID)) map.removeLayer(STATIONS_LAYER_ID);
        if (map.getSource(STATIONS_SOURCE_ID)) map.removeSource(STATIONS_SOURCE_ID);
        map.addSource(STATIONS_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          attribution:
            'Stationen: DWD · GeoSphere Austria · MeteoSwiss',
        });
        map.addLayer({
          id: STATIONS_LAYER_ID,
          type: 'circle',
          source: STATIONS_SOURCE_ID,
          paint: {
            // Coloured by source: DWD blue, TAWES red-orange, SMN green
            'circle-color': [
              'match', ['get', 'source'],
              'dwd_obs', '#1f6fd8',
              'tawes',   '#e94e1b',
              'smn',     '#2e9c4d',
              '#888',
            ],
            // Bigger, more visible markers so they pop out of the dimmed
            // background. White outline gives a 'pin'-feel against any
            // heatmap underneath.
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              4, 3.5,
              6, 5.0,
              8, 7.0,
              11, 9.0,
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.6,
            'circle-opacity': 1.0,
          },
          layout: { visibility: active.has('stations') ? 'visible' : 'none' },
        });
        // Stations must render on top of the country-mask polygon (which
        // sits last in the style stack and would otherwise hide them) —
        // moveLayer with no beforeId lifts the circle layer to the very top.
        map.moveLayer(STATIONS_LAYER_ID);

        // Fetch data and push into the source.
        try {
          const data = await fetchDachStations(abort.signal);
          const src = map.getSource(STATIONS_SOURCE_ID);
          if (src) (src as unknown as { setData: (d: StationsFeatureCollection) => void }).setData(data);
          updateStatus('stations', {
            ok: { model: `${data.features.length} Stationen · DWD + TAWES + SMN`, fetchedAt: data.fetchedAt },
          });
        } catch {
          updateStatus('stations', { err: 'Stationen konnten nicht geladen werden' });
        }
      };
      if (map.isStyleLoaded()) { await apply(); }
      else map.once('load', () => { void apply(); });
    };

    // Click handler — opens a small popup with the clicked station's live
    // readings. For DWD stations the metadata is already in the feature, but
    // the actual values are NOT — those get lazy-fetched here via
    // /current_weather?source_id=X (one quick request per click).
    let stationPopup: maplibregl.Popup | null = null;
    const stationClickHandler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as StationFeatureProperties;
      if (stationPopup) stationPopup.remove();
      stationPopup = new maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: '260px' })
        .setLngLat(e.lngLat)
        .setHTML(renderStationPopup(p, p.temperature == null && p.source === 'dwd_obs'))
        .addTo(map);
      // For DWD stations: fetch the live observation in the background and
      // re-render the popup body when it lands. /current_weather is keyed
      // by the DWD-internal station id (not the BrightSky source id, which
      // only resolves the synop variant of a station).
      if (p.source === 'dwd_obs' && p.dwdStationId) {
        void fetchDwdStationLive(String(p.dwdStationId)).then((live) => {
          if (!stationPopup) return;
          stationPopup.setHTML(renderStationPopup({ ...p, ...live }, false));
        }).catch(() => {
          if (!stationPopup) return;
          stationPopup.setHTML(renderStationPopup(p, false, 'Live-Werte konnten nicht geladen werden'));
        });
      }
    };
    map.on('click', STATIONS_LAYER_ID, stationClickHandler);
    map.on('mouseenter', STATIONS_LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', STATIONS_LAYER_ID, () => { map.getCanvas().style.cursor = ''; });

    // ------------------------------------------------------------------
    // Niederschlag-Button → durchgehender Forecast über den WebGL-RainLayer.
    //
    //   DE/AT: 0–2 h RADOLAN-RV (DWD, tar.bz2) → ab +2 h ICON-D2.
    //   CH:    „jetzt" MeteoSwiss-Radar rzc (RR) → ab >0 h ICON-D2 (INCA-
    //          Forecast ist nicht offen verfügbar, ICON-CH1 unstrukturiert).
    //   Decode → kompakte Uint8-Werte-Grids; der Slider-Effekt tauscht den
    //   Frame per Textur-Upload (kein PNG). RainLayer liegt schon im Stack;
    //   hier nur Daten laden + über die Maske heben.
    // ------------------------------------------------------------------
    const hoistRain = () => {
      if (map.getLayer(NOWCAST_LAYER_ID)) map.moveLayer(NOWCAST_LAYER_ID);
      if (map.getLayer(FLOW_NOWCAST_LAYER_ID)) map.moveLayer(FLOW_NOWCAST_LAYER_ID);
      if (map.getLayer(POP_LAYER_ID)) map.moveLayer(POP_LAYER_ID);
      if (map.getLayer(STATIONS_LAYER_ID)) map.moveLayer(STATIONS_LAYER_ID);
    };
    // CH-„jetzt": MeteoSwiss-Radar rzc.
    const loadRzc = async () => {
      try {
        meteoRadarRef.current = await fetchRzcLatest(abort.signal);
        hoistRain();
        setNowcastTick((t) => t + 1);
        setCompositeStatus();
      } catch {
        if (!nowcastRef.current && !incaGridRef.current) updateStatus('nowcast', { err: 'MeteoSchweiz-Radar nicht erreichbar' });
      }
    };
    // DE-Nowcast: DWD RADOLAN-RV (0–2 h).
    const loadRv = async () => {
      try {
        nowcastRef.current = await fetchRvNowcast(abort.signal);
        hoistRain();
        setNowcastTick((t) => t + 1);
        setCompositeStatus();
      } catch {
        if (!incaGridRef.current && !meteoRadarRef.current) updateStatus('nowcast', { err: 'RADOLAN-RV nicht erreichbar' });
      }
    };
    // AT-Nowcast: GeoSphere INCA-Grid (0–3 h, 15-min, 1 km).
    const loadInca = async () => {
      try {
        incaGridRef.current = await fetchIncaGrid(abort.signal);
        hoistRain();
        setNowcastTick((t) => t + 1);
        setCompositeStatus();
      } catch {
        if (!nowcastRef.current && !meteoRadarRef.current) updateStatus('nowcast', { err: 'GeoSphere INCA nicht erreichbar' });
      }
    };
    // ALLE drei Landesradare laden (nicht nur das des gesuchten Orts) — das
    // DACH-Komposit zeigt jedes über seinem Land, egal wo der Ort liegt.
    const loadNowSource = async () => {
      if (!compositorRef.current) compositorRef.current = new PrecipCompositor();
      await Promise.allSettled([
        nowcastRef.current ? null : loadRv(),
        incaGridRef.current ? null : loadInca(),
        meteoRadarRef.current ? null : loadRzc(),
      ].filter(Boolean) as Promise<void>[]);
      setCompositeStatus();
    };
    // Refresh-Intervall: alle bereits geladenen Quellen erneuern.
    const refreshNowSource = () => {
      if (nowcastRef.current) void loadRv();
      if (incaGridRef.current) void loadInca();
      if (meteoRadarRef.current) void loadRzc();
    };
    // Gemeinsamer Status: welche Landesradare aktuell beitragen + ICON-D2.
    const setCompositeStatus = () => {
      const parts: string[] = [];
      if (nowcastRef.current) parts.push('DE RADOLAN');
      if (incaGridRef.current) parts.push('AT INCA');
      if (meteoRadarRef.current) parts.push('CH rzc');
      const model = parts.length
        ? `DACH-Komposit · ${parts.join(' · ')}${iconD2Ref.current ? ' · + ICON-D2' : ''}`
        : (iconD2Ref.current ? 'ICON-D2 2,2 km' : '');
      if (model) updateStatus('nowcast', { ok: { model, fetchedAt: Date.now() } });
    };
    // ICON-D2 (Forecast) im Hintergrund nachladen — GRIB2 dekodieren ist
    // langsamer (~mehrere Sekunden), läuft progressiv: jeder fertige Frame
    // bumpt den Tick, sodass der Slider den nahen Horizont sofort nutzen kann.
    const installIconD2 = async () => {
      try {
        const d2 = await fetchIconD2Precip(abort.signal, (partial) => {
          iconD2Ref.current = partial;
          setNowcastTick((t) => t + 1);
        });
        iconD2Ref.current = d2;
        setNowcastTick((t) => t + 1);
        setCompositeStatus();
      } catch {
        // nicht fatal — die „jetzt"-Quelle deckt 0 h weiter ab.
      }
    };

    // Wolken-Layer: ICON-D2 Multi-Layer (tief/mittel/hoch) progressiv laden. Deckt
    // DE/AT/CH geografisch ab → kein Länderbranch nötig. Frames in eigenen Ref.
    const installClouds = async () => {
      // Status schon beim ersten Frame (aktuelle Lage sichtbar) auf „ok" setzen,
      // statt bis zum vollständigen Stack-Load „wird geladen…" zu zeigen.
      let statusShown = false;
      const markReady = () => {
        if (statusShown) return;
        statusShown = true;
        updateStatus('clouds', { ok: { model: 'DWD ICON-D2 Wolken tief/mittel/hoch · 2,2 km', fetchedAt: Date.now() } });
      };
      try {
        let firstCloud = true;
        const c = await fetchIconD2CloudStack(abort.signal, (partial) => {
          iconD2CloudsRef.current = partial;
          if (firstCloud) { firstCloud = false; setNowcastTick((t) => t + 1); } // Tick-Coalescing (s. Wind)
          if (partial.frames.length > 0) markReady();
        });
        iconD2CloudsRef.current = c;
        setNowcastTick((t) => t + 1);
        markReady();
      } catch {
        if (!statusShown) updateStatus('clouds', { err: 'ICON-D2 Wolken nicht erreichbar' });
      }
    };

    // Wind-Layer: natives ICON-D2 u/v-10m-Gitter (2,2 km) progressiv laden und
    // den Layer damit füttern (ersetzt das coarse Open-Meteo-Punktgrid der
    // Fusion). Deckt DE/AT/CH geografisch ab → kein Länderbranch nötig.
    const installWind = async () => {
      // Nebenläufigen Doppel-Load verhindern (s. windLoadingRef). Refresh (30 min)
      // läuft weiter, weil dann nicht „loading". Synchron VOR jedem await gesetzt →
      // greift auch, wenn zwei Effects im selben Tick feuern.
      if (windLoadingRef.current) return;
      windLoadingRef.current = true;
      try {
      // Sofort-Erstpaint aus dem localStorage-Cache (letzter „jetzt"-Frame, ggf.
      // paar h alt) — die Partikel erscheinen so unmittelbar beim Seitenaufruf,
      // statt ~2 s auf den Netz-Fetch zu warten. Wird vom frischen Gitter ersetzt.
      if (!iconD2WindRef.current) {
        const cached = await loadWindNowCache();
        const windL = layerRefs.current.wind;
        // Nur malen, wenn Surface auch wirklich die aktive Höhe ist — sonst würde
        // der verzögerte Sofort-Paint eine ICON-EU-Druckflächen-Ansicht übermalen.
        if (cached && windL && !iconD2WindRef.current && !abort.signal.aborted && windLevelRef.current === 'surface') {
          windL.setWindData(cached.image, {
            width: cached.width, height: cached.height,
            uMin: cached.uMin, uMax: cached.uMax, vMin: cached.vMin, vMax: cached.vMax,
            uvBounds: cached.uvBounds,
          });
        }
      }
      try {
        // Re-Render-Coalescing (Map-TBT): onProgress feuert pro Frame (~13×).
        // Jeder setNowcastTick rendert die große MapView + ~5 nowcastTick-Effekte
        // neu → bei 13–24 Frames pro Quelle ein Re-Render-Sturm (DER Haupttreiber
        // der Mount-Blockade, NICHT der Decode — gemessen ~20 ms/Feld). Wir ticken
        // nur beim ERSTEN Frame (sofort sichtbar) und am ENDE (alle Frames für den
        // Slider da); Zwischen-Frames aktualisieren still nur die Ref.
        let firstWind = true;
        const wd = await fetchIconD2Wind(
          abort.signal,
          (partial) => {
            iconD2WindRef.current = partial;
            if (firstWind) { firstWind = false; setNowcastTick((t) => t + 1); }
          },
          // Ein einzelner Tick, wenn der ferne Horizont im Hintergrund fertig ist —
          // sonst bliebe eine Slider-Parkposition jenseits des nahen Horizonts auf
          // dem geclampten Frame stehen, bis der Nutzer erneut interagiert.
          () => { if (!abort.signal.aborted) setNowcastTick((t) => t + 1); },
        );
        iconD2WindRef.current = wd;
        setNowcastTick((t) => t + 1);
        if (wd.frames[0]) saveWindNowCache(wd.frames[0], wd.uvBounds); // für den nächsten Sofort-Start
        updateStatus('wind', { ok: { model: 'DWD ICON-D2 u/v 10m · 2,2 km', fetchedAt: Date.now() } });
      } catch {
        // nicht fatal — beim nächsten Aufruf greift der Cache erneut.
      }
      } finally {
        // Nach dem NAHEN Horizont zurücksetzen (der ferne lädt im Hintergrund
        // weiter); ein späterer Refresh/Reaktivieren darf dann neu laden.
        windLoadingRef.current = false;
      }
    };
    installWindRef.current = installWind;

    // Temperatur-Layer: natives ICON-D2 t_2m-Gitter (2,2 km) + hsurf-DEM-Korrektur
    // progressiv laden (ersetzt die Fusion-Temperatur). Das DEM-Bild gilt für die
    // ICON-Bounds → einmalig per setDem aktivieren; danach speist der Slider-Effekt
    // die stündlichen Frames. Deckt DE/AT/CH geografisch ab → kein Länderbranch.
    const installTemp = async () => {
      try {
        // Tick-Coalescing wie bei Wind (Re-Render-Sturm vermeiden). Temp lädt am
        // Mount IMMER (Stadt-Labels), also auch auf der Default-Karte relevant.
        let firstTemp = true;
        const td = await fetchIconD2Temp(abort.signal, (partial) => {
          iconD2TempRef.current = partial;
          if (firstTemp) { firstTemp = false; layerRefs.current.temp?.setDem(partial.demImage); setNowcastTick((t) => t + 1); }
        });
        iconD2TempRef.current = td;
        layerRefs.current.temp?.setDem(td.demImage);
        setNowcastTick((t) => t + 1);
        updateStatus('temp', { ok: { model: 'DWD ICON-D2 t_2m · 2,2 km', fetchedAt: Date.now() } });
      } catch {
        // nicht fatal — die Fusion-Temperatur deckt weiter ab.
      }
    };
    installTempRef.current = installTemp;

    // Windböen-Layer: natives ICON-D2 vmax_10m-Gitter (0–24 h) progressiv laden.
    // Eigene Schicht, kein DEM-Refinement; speist sich über den Slider-Effekt.
    const installGust = async () => {
      try {
        let firstGust = true;
        const gd = await fetchIconD2Gust(abort.signal, (partial) => {
          iconD2GustRef.current = partial;
          if (firstGust) { firstGust = false; setNowcastTick((t) => t + 1); } // Tick-Coalescing (s. Wind)
        });
        iconD2GustRef.current = gd;
        setNowcastTick((t) => t + 1);
        updateStatus('gust', { ok: { model: 'DWD ICON-D2 vmax_10m · 2,2 km', fetchedAt: Date.now() } });
      } catch {
        updateStatus('gust', { err: 'ICON-D2 Böen nicht erreichbar' });
      }
    };
    installGustRef.current = installGust;

    // DWD lightning network — accumulated flashes last hour, refreshes ~10 min.
    const installLightningLayer = () => {
      const apply = () => {
        if (map.getLayer(LIGHTNING_LAYER_ID)) map.removeLayer(LIGHTNING_LAYER_ID);
        if (map.getSource(LIGHTNING_SOURCE_ID)) map.removeSource(LIGHTNING_SOURCE_ID);
        map.addSource(LIGHTNING_SOURCE_ID, {
          type: 'raster',
          tiles: [lightningTileTemplate()],
          tileSize: 512,
          minzoom: 0,
          maxzoom: 10,
          attribution: LIGHTNING_ATTRIBUTION,
        });
        // Lightning sits above the satellite backdrop and the radar, but
        // below the heatmaps + wind particles. The flashes are sparse so
        // the underlying weather products stay readable.
        const beforeId =
          map.getLayer(tempLayer.id) ? tempLayer.id :
          map.getLayer(cloudLayer.id) ? cloudLayer.id : undefined;
        map.addLayer(
          {
            id: LIGHTNING_LAYER_ID,
            type: 'raster',
            source: LIGHTNING_SOURCE_ID,
            paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 0 },
            layout: { visibility: active.has('lightning') ? 'visible' : 'none' },
          },
          beforeId,
        );
        updateStatus('lightning', { ok: { model: 'DWD Sferics 60 min', fetchedAt: Date.now() } });
        // P2-2: echtes Capture-Datum aus WMS-TIME nachladen → „Stand HH:MM".
        void fetchWmsLatestTime(LIGHTNING_LAYER_LOCAL).then((t) => {
          if (t) updateStatus('lightning', { ok: { model: 'DWD Sferics 60 min', fetchedAt: t.getTime(), captured: true } });
        });
      };
      if (map.isStyleLoaded()) apply();
      else map.once('load', apply);
    };

    reloadForecastRef.current = loadOpenMeteo;
    // Leichtgewichtige Slider-Zeitbasis SOFORT (nur Zeitstempel, keine Quellen) —
    // statt die teure gridded Fusion eager zu laden. Die echte Fusion lädt lazy
    // erst bei Temp-Aktivierung (siehe Temp-Effect). Native Layer (Wind/Wolken/
    // Niederschlag/Temp) speisen sich ohnehin selbst.
    setForecast({
      hours: Array.from({ length: FORECAST_HOURS }, (_, h) => ({
        timestamp: new Date(Date.now() + h * 3_600_000),
        layers: {} as DwdForecastResult['hours'][number]['layers'],
      })),
      fetchedAt: Date.now(),
      uvBounds: [0, 0, 1, 1],
      model: '',
    });
    // Satellit + Blitze lazy (eigene Effects) statt eager — nimmt 2× WMS-TIME-
    // Fetch + 2 Raster-Sources aus dem Mount-Burst, der sonst mit dem Wind-Hero
    // um Main-Thread + die 6-pro-Host-Verbindungen konkurriert.
    installSatelliteRef.current = () => installSatelliteLayer(satProductRef.current);
    installLightningRef.current = installLightningLayer;
    // Stationen lazy (eigener Effect) statt eager — spart ~150 SMN/TAWES-Requests.
    installStationsRef.current = installStationsLayer;
    // Niederschlag lazy: erst beim Aktivieren laden. Land-passende „jetzt"-
    // Quelle zuerst (schnell), ICON-D2-Forecast danach im Hintergrund.
    installNowcastRef.current = async () => {
      await loadNowSource();
      if (!iconD2Ref.current) void installIconD2();
    };
    installCloudsRef.current = installClouds;
    // Fusion nur auffrischen, wenn sie überhaupt (lazy) angefordert wurde.
    const t1 = window.setInterval(() => {
      if (fusionRequestedRef.current) void loadOpenMeteo();
    }, FORECAST_REFRESH_MS);
    // RV/rzc publizieren alle 5 min — die land-passende „jetzt"-Quelle frisch
    // nachladen (nur falls bereits aktiviert/geladen).
    const t9 = window.setInterval(refreshNowSource, 5 * 60 * 1000);
    // ICON-D2 läuft alle 3 h — alle 30 min auf einen neueren Lauf prüfen.
    const t10 = window.setInterval(() => {
      if (iconD2Ref.current) void installIconD2();
    }, 30 * 60 * 1000);
    // Wolken (ICON-D2) ebenfalls alle 30 min auffrischen, falls geladen.
    const t11 = window.setInterval(() => {
      if (iconD2CloudsRef.current) void installClouds();
    }, 30 * 60 * 1000);
    // Wind (ICON-D2) ebenfalls alle 30 min auffrischen, falls aktiv/geladen.
    const t12 = window.setInterval(() => {
      if (active.has('wind') && iconD2WindRef.current) void installWind();
    }, 30 * 60 * 1000);
    // Temperatur (ICON-D2) ebenfalls alle 30 min auffrischen, falls aktiv/geladen.
    const t13 = window.setInterval(() => {
      if (active.has('temp') && iconD2TempRef.current) void installTemp();
    }, 30 * 60 * 1000);
    // Böen (ICON-D2) ebenfalls alle 30 min auffrischen, falls aktiv/geladen.
    const t14 = window.setInterval(() => {
      if (active.has('gust') && iconD2GustRef.current) void installGust();
    }, 30 * 60 * 1000);
    // Satellite refresh every 30 min — the data only updates every 3 h but
    // the WMS endpoint reissues the freshest tile each time, so a refresh
    // covers the case where the user keeps the tab open across a 3 h slot.
    const t3 = window.setInterval(() => {
      if (satLoadedRef.current) installSatelliteLayer(satProductRef.current);
    }, 30 * 60 * 1000);
    // Lightning network refreshes every ~10 min on DWD's side.
    const t4 = window.setInterval(() => {
      if (lightningLoadedRef.current) installLightningLayer();
    }, 10 * 60 * 1000);
    // Stations refresh every 10 min (DWD obs cadence is 10 min; TAWES same).
    const t7 = window.setInterval(() => {
      if (stationsLoadedRef.current) void installStationsLayer();
    }, 10 * 60 * 1000);

    return () => {
      abort.abort();
      window.clearInterval(t1);
      window.clearInterval(t3);
      window.clearInterval(t4);
      window.clearInterval(t9);
      window.clearInterval(t10);
      window.clearInterval(t11);
      window.clearInterval(t12);
      window.clearInterval(t13);
      window.clearInterval(t14);
      window.clearInterval(t7);
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Only move the marker; leave the camera where the user has it. The
    // country-default overview already framed the area on first load, and
    // when the user navigates from one location to another we don't want
    // their zoom level reset on every search.
    if (markerRef.current) markerRef.current.setLngLat([location.lon, location.lat]);
  }, [location.lat, location.lon]);

  // Re-fetch the forecast whenever the user picks a different model in the
  // selector — the load function is held in a ref so the heavy map-setup
  // useEffect (with empty deps) doesn't remount.
  useEffect(() => {
    // Fusion nur neu laden, wenn sie überhaupt (lazy) angefordert wurde — sonst
    // löste dieser Effect sie schon am Mount (Initial-modelChoice) eager aus.
    if (!fusionRequestedRef.current) return;
    void reloadForecastRef.current?.();
  }, [modelChoice]);

  // Niederschlag lazy laden: beim Aktivieren (und bei Länderwechsel) die land-
  // passende Quelle ziehen. loadNowSource/installIconD2 laden nur, was fehlt.
  useEffect(() => {
    // Flow-Nowcast (DE) braucht die RADOLAN-RV-Frames als Eingabe → bei aktivem
    // Layer ebenfalls die land-passende Nowcast-Quelle ziehen.
    if (active.has('nowcast') || active.has('flownowcast') || active.has('poprob')) void installNowcastRef.current?.();
  }, [active, location.country]);

  // Wolken lazy laden: beim ersten Aktivieren die ICON-D2-CLCT-Frames ziehen.
  useEffect(() => {
    if (active.has('clouds') && !iconD2CloudsRef.current) void installCloudsRef.current?.();
  }, [active]);

  // Wind lazy nachladen: falls beim (Re-)Aktivieren noch kein natives Gitter da ist.
  useEffect(() => {
    if (active.has('wind') && !iconD2WindRef.current) void installWindRef.current?.();
  }, [active]);

  // Böen lazy laden: beim ersten Aktivieren das native ICON-D2-vmax_10m-Gitter ziehen.
  useEffect(() => {
    if (active.has('gust') && !iconD2GustRef.current) void installGustRef.current?.();
  }, [active]);

  // Stationen lazy laden: erst beim Aktivieren die DACH-Stationen (DWD/TAWES/SMN)
  // ziehen — vorher nicht (kein Default-Layer, ~150 SMN-CSVs).
  useEffect(() => {
    if (active.has('stations')) {
      stationsLoadedRef.current = true;
      void installStationsRef.current?.();
    }
  }, [active]);

  // Satellit lazy laden: erst beim Aktivieren die WMS-Raster-Source + das echte
  // Capture-Datum ziehen — nicht mehr eager am Mount (Kaltstart-Entlastung).
  useEffect(() => {
    if (active.has('sat')) {
      satLoadedRef.current = true;
      installSatelliteRef.current?.();
    }
  }, [active]);

  // Blitze lazy laden: erst beim Aktivieren.
  useEffect(() => {
    if (active.has('lightning')) {
      lightningLoadedRef.current = true;
      installLightningRef.current?.();
    }
  }, [active]);

  // Temperatur lazy laden: beim ersten Aktivieren das native ICON-D2-t_2m-Gitter
  // (+ hsurf-DEM) ziehen. Hier wird auch die gridded Fusion einmalig nachgeladen
  // (Temp-Fallback + Stadt-Temp-Labels) — sie läuft nicht mehr eager am Mount.
  useEffect(() => {
    // Stadt-Temperatur-Labels sind dauerhaft sichtbar (windy-Stil) → das native
    // ICON-D2-t_2m-Gitter (Werte + hsurf-Höhe) IMMER laden. Es ist aber SEKUNDÄR
    // ggü. dem sichtbaren Wetterlayer: am Mount konkurriert es sonst mit dem
    // Default-Layer (Wind) um den 4-Worker-bz2-Pool + Main-Thread und verzögert
    // dessen ersten Frame (gemessen: Temp-Fetches starten vor Wind). Daher das
    // Gitter — wenn Temp NICHT der aktive Layer ist — erst im Leerlauf nach dem
    // Hero-Layer laden (Labels ~1 s später, Hero dafür spürbar schneller).
    if (!iconD2TempRef.current) {
      if (active.has('temp')) {
        void installTempRef.current?.();
      } else {
        const ric: (cb: () => void) => void =
          typeof window.requestIdleCallback === 'function'
            ? (cb) => { window.requestIdleCallback(cb, { timeout: 2500 }); }
            : (cb) => { window.setTimeout(cb, 900); };
        ric(() => { if (!iconD2TempRef.current) void installTempRef.current?.(); });
      }
    }
    if (active.has('temp') && !fusionRequestedRef.current) {
      fusionRequestedRef.current = true;
      void reloadForecastRef.current?.();
    }
  }, [active]);

  // Fusion-Load auslösen, sobald IRGENDEIN fusion-fähiger, aktiver Layer per
  // Resolver auf Fusion aufgelöst wird (nicht mehr nur Temp). Native bleibt lazy —
  // die gridded Fusion lädt nur, wenn der Switch sie für einen sichtbaren Layer
  // anfordert. Idempotent via fusionRequestedRef (der 10-min-Refresh übernimmt danach).
  useEffect(() => {
    if (fusionRequestedRef.current) return;
    const anyFusion = [...active].some((l) => isFusionCapable(l) && fusionFor(l));
    if (anyFusion) {
      fusionRequestedRef.current = true;
      void reloadForecastRef.current?.();
    }
  }, [active, modelSource]);

  // Vertrauens-Schleier (ML #1): gebündelte DACH-Stationsklimatologie lazy laden,
  // sobald „Sicherheit" zum ersten Mal aktiv ist. setNowcastTick stößt danach den
  // Build-Effekt an.
  useEffect(() => {
    if ((!active.has('confidence') && !active.has('snowline')) || climaFieldRef.current || climaFieldLoadingRef.current) return;
    // KEIN cancelled-Guard auf dem Erfolgspfad: unter React-StrictMode läuft der
    // Effekt doppelt mit Cleanup dazwischen — würde das Cleanup das Anwenden des
    // Resultats abbrechen, bliebe climaFieldRef null und der Schleier „lädt ewig".
    // Ref/Status nach (Re-)Mount zu setzen ist idempotent/harmlos.
    climaFieldLoadingRef.current = true;
    ClimaField.load()
      .then((cf) => {
        climaFieldRef.current = cf;
        updateStatus('confidence', { ok: { model: `KI · Klima-MOS · ${cf.size} DWD-Stationen`, fetchedAt: Date.now() } });
        setNowcastTick((t) => t + 1);
      })
      .catch(() => { climaFieldLoadingRef.current = false; updateStatus('confidence', { err: 'Klimatologie nicht ladbar' }); });
  }, [active]);

  // Temperatur-Schleier: zeitversetztes ICON-D2-Ensemble (Lauf-zu-Lauf-Spread)
  // lazy laden, wenn „Sicherheit" im Temperatur-Modus aktiv ist (nicht im PoP-
  // Modus, der das Flow-Ensemble nutzt). Mehrkosten = ein Extra-Lauf an wenigen
  // Stützstellen → bewusst opt-in. Schleier zeigt bis dahin nur die Klima-Anomalie.
  useEffect(() => {
    if (!active.has('confidence') || active.has('nowcast') || tempSpreadRef.current || tempSpreadLoadingRef.current) return;
    tempSpreadLoadingRef.current = true;
    fetchTempRunSpread()
      .then((sp) => {
        if (sp) {
          tempSpreadRef.current = sp;
          updateStatus('confidence', { ok: { model: `KI · Klima-MOS + ICON-D2-Lauf-Ensemble (${sp.frames.length} Stützst.)`, fetchedAt: Date.now() } });
          setNowcastTick((t) => t + 1);
        } else {
          tempSpreadLoadingRef.current = false; // kein Vorlauf → später erneut versuchbar
        }
      })
      .catch(() => { tempSpreadLoadingRef.current = false; });
  }, [active]);

  // Geteilte, gecachte Ensemble-PoP (siehe ensembleCacheRef). Liefert für (Fluss-
  // Lauf, Lead k) dasselbe prob-Feld an confidence-PoP UND poprob — eine Berechnung
  // statt zwei, und Re-Renders mit gleichem Lead treffen den Cache (LRU, 6 Einträge).
  const ensembleProbFor = useCallback((fl: { key: string; base: Float32Array; flow: Flow; intervalMin: number }, k: number): Float32Array => {
    const cache = ensembleCacheRef.current;
    const ckey = `${fl.key}|${k.toFixed(3)}`;
    const hit = cache.get(ckey);
    if (hit) { cache.delete(ckey); cache.set(ckey, hit); return hit; } // LRU-Touch
    const { prob } = advectEnsembleProb(fl.base, fl.flow, k);
    cache.set(ckey, prob);
    while (cache.size > 6) { const oldest = cache.keys().next().value; if (oldest === undefined) break; cache.delete(oldest); }
    return prob;
  }, []);

  // Vertrauens-Schleier neu rechnen, wenn sich Slider-Stunde, Daten oder der
  // aktive Layer ändern. Signalquelle hängt vom aktiven Layer ab:
  //  • „Niederschlag" aktiv → Regenwahrscheinlichkeit:
  //      1. Wahl: ECHTER Flow-Ensemble-Spread (Member-Übereinstimmung, DE)
  //      Fallback: ICON-D2-PoP-Entropie-Heuristik
  //  • sonst → Temperatur-Plausibilität gegen die Orts-Klimatologie
  useEffect(() => {
    const layer = layerRefs.current.confidence;
    if (!layer || !active.has('confidence')) return;
    const cf = climaFieldRef.current;
    if (!cf) return;
    const leadDays = forecastHour / 24;

    if (active.has('nowcast')) {
      // 1. Wahl: echter Verlagerungs-Ensemble-Spread aus dem Flussfeld (RADOLAN, DE).
      const fl = flowRef.current;
      if (fl) {
        const k = (forecastHour * 60) / fl.intervalMin;
        const prob = ensembleProbFor(fl, k);
        const res = buildEnsembleConfidenceImage(prob, fl.flow.w, fl.flow.h, fl.corners, leadDays);
        if (res) { layer.setData(res.image, res.meta); return; }
      }
      // Fallback (z. B. AT/CH oder Fluss noch nicht da): ICON-D2-PoP-Heuristik.
      const d2 = iconD2Ref.current;
      if (d2 && d2.frames.length > 0) {
        const target = Date.now() + forecastHour * 3600_000;
        let best = d2.frames[0];
        for (const f of d2.frames) {
          if (Math.abs(f.validAt.getTime() - target) < Math.abs(best.validAt.getTime() - target)) best = f;
        }
        const res = buildPrecipConfidenceImage(best, d2.corners, leadDays, cf);
        if (res) { layer.setData(res.image, res.meta); return; }
      }
    }

    // Temperatur-Schleier (Default): Klima-Anomalie × Lauf-zu-Lauf-Übereinstimmung
    // (zeitversetztes ICON-D2-Ensemble), falls vorhanden.
    const td = iconD2TempRef.current;
    if (!td || td.frames.length === 0) return;
    const targetMs = Date.now() + forecastHour * 3600_000;
    const frame = frameAtValidTime(td.frames, targetMs);
    const sp = tempSpreadRef.current;
    const spreadInput = sp ? { ...frameAtValidTime(sp.frames, targetMs), spreadMax: sp.spreadMax } : undefined;
    const res = buildConfidenceImage(frame, td.uvBounds, leadDays, cf, spreadInput);
    if (res) layer.setData(res.image, res.meta);
  }, [forecastHour, nowcastTick, active]);

  // Schneefallgrenze (ML #2): Iso-Kontur neu rechnen, wenn sich Slider-Stunde,
  // Temp-Daten oder der aktive Layer ändern. terrainTemp(Frame) − T50 → GeoJSON.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active.has('snowline')) return;
    const td = iconD2TempRef.current;
    const cf = climaFieldRef.current;
    if (!td || td.frames.length === 0 || !cf) return;
    const frame = frameAtValidTime(td.frames, Date.now() + forecastHour * 3600_000);
    const fc = buildSnowLine(frame, td.demImage, td.uvBounds, cf);
    (map.getSource(SNOWLINE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(fc);
    if (!snowlineReadyRef.current) {
      snowlineReadyRef.current = true;
      updateStatus('snowline', { ok: { model: 'KI · ML #2 · 156 DWD-Stationen + Physik-Anker', fetchedAt: Date.now() } });
    }
  }, [forecastHour, nowcastTick, active]);

  // Flow-Nowcast / Ensemble-Schleier: Bewegungsfeld EINMAL je RADOLAN-Lauf schätzen
  // (Horn-Schunck auf den gröberen Frames 0 & 5; synchron, daher nach UI-Yield).
  // Nur DE (RADOLAN-RV). Auch der Vertrauens-Schleier im PoP-Modus braucht den Fluss.
  useEffect(() => {
    if (!active.has('flownowcast') && !active.has('poprob') && !(active.has('confidence') && active.has('nowcast'))) return;
    const nc = nowcastRef.current;
    if (!nc || nc.frames.length === 0) return;
    const f0 = nc.frames.find((f) => f.leadMinutes === 0);
    const f5 = nc.frames.find((f) => f.leadMinutes === 5);
    if (!f0 || !f5) { updateStatus('flownowcast', { err: 'zu wenige RADOLAN-Frames (nur DE)' }); return; }
    const key = `${nc.runAt.getTime()}`;
    if (flowRef.current?.key === key) return; // schon geschätzt
    let cancelled = false;
    void (async () => {
      await new Promise<void>((r) => setTimeout(r)); // UI atmen lassen
      if (cancelled || (!active.has('flownowcast') && !active.has('poprob') && !(active.has('confidence') && active.has('nowcast')))) return;
      const a = coarsenFrameU8(f0.values, f0.width, f0.height, FLOW_FACTOR);
      const b = coarsenFrameU8(f5.values, f5.width, f5.height, FLOW_FACTOR);
      const flow = estimateFlowHS(a.data, b.data, a.W, a.H, { alpha: 0.5, iters: 100 });
      flowRef.current = { key, base: a.data, flow, corners: nc.corners, intervalMin: FLOW_INTERVAL_MIN };
      updateStatus('flownowcast', { ok: { model: 'Optical-Flow · Lagrange-Extrapolation (RADOLAN-RV)', fetchedAt: Date.now() } });
      setNowcastTick((t) => t + 1);
    })();
    return () => { cancelled = true; };
  }, [active, nowcastTick, location.country]);

  // Flow-Nowcast: bei jeder Slider-Bewegung den jüngsten Frame um leadMin advehieren
  // (intensitätserhaltend, stufenlos). leadMin=0 → Basis = aktuelles Radar.
  useEffect(() => {
    const ki = layerRefs.current.ki;
    const fl = flowRef.current;
    if (!ki || !active.has('flownowcast') || !fl) return;
    const k = (forecastHour * 60) / fl.intervalMin;
    const adv = advect(fl.base, fl.flow, k);
    const u8 = new Uint8Array(adv.length);
    for (let i = 0; i < adv.length; i++) { const vv = adv[i]; u8[i] = vv <= 0 ? 0 : vv >= 1 ? 255 : Math.round(vv * 255); }
    ki.setFrame({ values: u8, width: fl.flow.w, height: fl.flow.h, corners: fl.corners, warpLnglat: de1200WarpMesh(), warpN: DE1200_WARP_N });
  }, [forecastHour, nowcastTick, active]);

  // Regenwahrscheinlichkeit (Ensemble-PoP): bei jeder Slider-Bewegung das Flow-
  // Ensemble bei leadMin auswerten → kalibrierte Wahrscheinlichkeit als Raster.
  useEffect(() => {
    const pop = layerRefs.current.pop;
    const fl = flowRef.current;
    if (!pop || !active.has('poprob') || !fl) return;
    const k = (forecastHour * 60) / fl.intervalMin;
    const prob = ensembleProbFor(fl, k);
    // PoP (0..1) → Uint8 → RainLayer wie der Niederschlag (projektionskorrekt verortet).
    const u8 = new Uint8Array(prob.length);
    for (let i = 0; i < prob.length; i++) { const p = prob[i]; u8[i] = p <= 0 ? 0 : p >= 1 ? 255 : Math.round(p * 255); }
    pop.setFrame({ values: u8, width: fl.flow.w, height: fl.flow.h, corners: fl.corners, warpLnglat: de1200WarpMesh(), warpN: DE1200_WARP_N });
    if (!popReadyRef.current) {
      popReadyRef.current = true;
      updateStatus('poprob', { ok: { model: 'Flow-Ensemble · 15 Member (RADOLAN-RV)', fetchedAt: Date.now() } });
    }
  }, [forecastHour, nowcastTick, active]);

  // DACH mask is country-agnostic — it stays the same across searches, so no
  // per-location refresh is needed. (Previously a country switch redrew the
  // mask; with DACH_VIEW that's a no-op.)

  // Push the layer data for the currently selected forecast hour into the
  // custom layers whenever the forecast cache or the slider position changes.
  //
  // Sub-hour positions (slider step = 0.2) are produced by pixel-wise
  // interpolation between the two adjacent hour-frames. Wind interpolates too,
  // but in VELOCITY space (its u/v normalisation differs per frame) — see
  // windFrameInterpolated in the dedicated wind effect.
  useEffect(() => {
    if (!forecast) return;
    const maxIdx = forecast.hours.length - 1;
    const clamped = Math.max(0, Math.min(maxIdx, forecastHour));
    const hLow = Math.floor(clamped);
    const hHigh = Math.min(maxIdx, hLow + 1);
    const frac = clamped - hLow;
    const A = forecast.hours[hLow];
    const B = forecast.hours[hHigh];
    if (!A) return;

    const lA = A.layers as typeof A.layers & { precipitation?: ScalarGridResult };
    const lB = (B?.layers ?? A.layers) as typeof A.layers & { precipitation?: ScalarGridResult };
    const { wind, temp, precip } = layerRefs.current;

    // WIND (Fusion-Quelle): nur wenn der Resolver Fusion wählt UND Surface aktiv ist
    // (die Fusion hat keine Druckflächen — dort speist weiter nativ ICON-EU). Wind
    // wird NICHT gelerpt (uMin/uMax variieren je Stunde) → nächstliegende Stunde.
    // Der native Wind-Slider-Effekt macht bei Fusion+Surface einen Early-Return.
    const lWind = (frac > 0.5 && lB.wind) ? lB.wind : lA.wind;
    if (wind && lWind && fusionFor('wind') && windLevelRef.current === 'surface') {
      wind.setWindData(lWind.image, {
        width: lWind.width, height: lWind.height,
        uMin: lWind.uMin, uMax: lWind.uMax, vMin: lWind.vMin, vMax: lWind.vMax,
        uvBounds: lWind.uvBounds,
      });
      reportValidAt(A.timestamp.getTime());
    }

    // TEMPERATUR: aus der Fusion, wenn der Resolver sie wählt ODER als Fast-First-
    // Paint, solange das native ICON-D2-t_2m-Gitter noch nicht geladen ist (danach
    // übernimmt der native Temp-Effekt — der bei fusionFor('temp') zurücktritt).
    if (temp && lA.temperature && (fusionFor('temp') || !iconD2TempRef.current)) {
      const image = frac > 0.001 && lB.temperature
        ? lerpFrameImage(lA.temperature.image, lB.temperature.image, frac, 'temp')
        : lA.temperature.image;
      temp.setData(image, {
        width: lA.temperature.width, height: lA.temperature.height,
        vMin: lA.temperature.vMin, vMax: lA.temperature.vMax,
        uvBounds: lA.temperature.uvBounds,
      });
    }
    // WOLKEN (Fusion-Quelle): der CloudLayer erwartet rohe RGBA-Bytes + 4 Geo-Ecken,
    // die Fusion liefert Canvas + uvBounds → Transport-Adapter (getImageData +
    // uvBounds→QuadCorners; Kanal-Encoding R/G/B=low/mid/high ist byte-identisch).
    // Wolken werden nicht sub-Stunden-gelerpt → nächstliegende Stunde.
    const clouds = layerRefs.current.clouds;
    const lCloud = (frac > 0.5 && lB.clouds) ? lB.clouds : lA.clouds;
    if (clouds && lCloud && fusionFor('clouds')) {
      const cv = document.createElement('canvas');
      cv.width = lCloud.width; cv.height = lCloud.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(lCloud.image, 0, 0);
      const px = ctx.getImageData(0, 0, lCloud.width, lCloud.height).data;
      const values = new Uint8Array(px.buffer, px.byteOffset, px.byteLength);
      clouds.setFrame({ values, width: lCloud.width, height: lCloud.height, corners: uvBoundsToCorners(lCloud.uvBounds) });
    }

    // NIEDERSCHLAG (Fusion-Forecast): speist den `precip-forecast`-ScalarLayer
    // (byte-identischer Sink, spec §9); Sichtbarkeit (precip-forecast↔rain) regelt
    // applyVisibility. Nur füttern, wenn der Resolver Fusion für 'nowcast' wählt.
    if (precip && lA.precipitation && fusionFor('nowcast')) {
      const image = frac > 0.001 && lB.precipitation
        ? lerpFrameImage(lA.precipitation.image, lB.precipitation.image, frac, 'precip')
        : lA.precipitation.image;
      precip.setData(image, {
        width: lA.precipitation.width, height: lA.precipitation.height,
        vMin: lA.precipitation.vMin, vMax: lA.precipitation.vMax,
        uvBounds: lA.precipitation.uvBounds,
      });
    }
  }, [forecast, forecastHour, modelSource, windLevel]);

  // Durchgehender Niederschlags-Layer: bei jeder Slider-Bewegung den passenden
  // Frame in den RainLayer schieben. Land-passende „jetzt"-Quelle, dann ICON-D2.
  //   DE: 0–2 h RADOLAN-RV       → ab +2 h ICON-D2.
  //   AT: 0–3 h GeoSphere INCA   → ab +3 h ICON-D2 (INCA gilt auch in Stunde 2–3).
  //   CH: „jetzt" rzc-Radar      → ab ~+0,5 h ICON-D2.
  // Frame-Wechsel = Textur-Upload (kein PNG) → flüssiges Scrubbing; je Quelle
  // eigene Geo-Ecken (verschiedene Gitter).
  useEffect(() => {
    const rain = layerRefs.current.rain;
    if (!rain || !active.has('nowcast')) return;
    // Bei aktiver Fusion-Niederschlag (gewählt UND Daten bereit) speist der
    // `precip-forecast`-ScalarLayer (zentraler Fusion-Effekt) statt des Radar-
    // Komposits; hier nativ zurücktreten. Fehlt/scheitert die Fusion → nativ.
    if (fusionActiveFor('nowcast')) return;
    if (!compositorRef.current) compositorRef.current = new PrecipCompositor();
    // DACH-Komposit: pro Zelle das richtige Landesradar (DE RADOLAN / AT INCA /
    // CH rzc) im jeweiligen Nowcast-Horizont, sonst/danach ICON-D2 — unabhängig
    // vom gesuchten Ort. Reguläres lat/lon-Gitter → kein Warp-Mesh nötig.
    const frame = compositorRef.current.build(forecastHour, {
      rv: nowcastRef.current, inca: incaGridRef.current, rzc: meteoRadarRef.current, d2: iconD2Ref.current,
    }, Date.now());
    rain.setFrame({ values: frame.values, width: frame.width, height: frame.height, corners: frame.corners });
  }, [forecastHour, nowcastTick, active, modelSource, forecast]);

  // Wolken-Layer (ICON-D2 CLCT): bei jeder Slider-Bewegung den Frame mit der
  // nächstgelegenen Gültigkeitszeit setzen. Deckt den ganzen ICON-D2-Horizont ab.
  useEffect(() => {
    const cloudL = layerRefs.current.clouds;
    if (!cloudL || !active.has('clouds')) return;
    // Bei aktiver Fusion-Wolken (gewählt UND Daten bereit) speist der zentrale
    // Fusion-Effekt (Adapter); hier zurücktreten. Fehlt/scheitert die Fusion → nativ.
    if (fusionActiveFor('clouds')) return;
    const cl = iconD2CloudsRef.current;
    if (!cl || cl.frames.length === 0) return;
    const target = Date.now() + forecastHour * 3600_000;
    let best = cl.frames[0];
    for (const f of cl.frames) {
      if (Math.abs(f.validAt.getTime() - target) < Math.abs(best.validAt.getTime() - target)) best = f;
    }
    cloudL.setFrame({ values: best.values, width: best.width, height: best.height, corners: cl.corners });
    reportValidAt(best.validAt.getTime());
  }, [forecastHour, nowcastTick, active, modelSource, forecast, reportValidAt]);

  // Wind-Layer (natives ICON-D2 u/v-10m): bei jeder Slider-Bewegung den Frame
  // setzen — bei Sub-Stunden-Positionen im GESCHWINDIGKEITSRAUM zwischen den
  // beiden Stunden-Frames interpoliert (smooth Scrubbing wie Windy, konsistent
  // mit Niederschlag/Temperatur). Sobald geladen, ersetzt das die Fusion-Quelle.
  useEffect(() => {
    const wind = layerRefs.current.wind;
    if (!wind || !active.has('wind')) return;
    // Aktive Quelle je nach Höhe: Surface = ICON-D2, sonst ICON-EU-Druckfläche.
    const lvl = windLevelRef.current;
    // Bei aktiver Fusion-Wind + Surface (gewählt UND Daten bereit) speist die gridded
    // Fusion (zentraler Fusion-Effekt); hier nativ zurücktreten. Fehlt/scheitert die
    // Fusion → nativ (ICON-D2) rendert weiter.
    if (lvl === 'surface' && fusionActiveFor('wind')) return;
    const wd = lvl === 'surface' ? iconD2WindRef.current : euWindRef.current[lvl];
    if (!wd || wd.frames.length === 0) return;
    const f = windFrameAtValidTime(wd, Date.now() + forecastHour * 3600_000);
    wind.setWindData(f.image, {
      width: f.width, height: f.height,
      uMin: f.uMin, uMax: f.uMax, vMin: f.vMin, vMax: f.vMax,
      uvBounds: wd.uvBounds,
    });
    reportValidAt(f.validAt.getTime());
  }, [forecastHour, nowcastTick, active, windLevel, modelSource, forecast, reportValidAt]);

  // Wind-Höhe (Druckfläche) laden + anwenden. Surface kommt aus installWind
  // (ICON-D2); Druckflächen aus ICON-EU, je Level gecacht. Frame-Setzen läuft
  // über den Slider-Effekt oben (nowcastTick triggert ihn neu).
  useEffect(() => {
    windLevelRef.current = windLevel;
    const wind = layerRefs.current.wind;
    if (!wind || !active.has('wind')) return;
    let cancelled = false;
    void (async () => {
      if (windLevel === 'surface') {
        if (!iconD2WindRef.current) await installWindRef.current?.();
        if (!cancelled) {
          updateStatus('wind', { ok: { model: 'DWD ICON-D2 u/v 10m · 2,2 km', fetchedAt: Date.now() } });
          setNowcastTick((t) => t + 1);
        }
        return;
      }
      // Druckfläche: ICON-EU (gecacht je Level).
      if (!euWindRef.current[windLevel]) {
        updateStatus('wind', {});
        try {
          const wd = await fetchIconEuPressureWind(windLevel, undefined, (partial) => {
            if (cancelled || windLevelRef.current !== windLevel) return;
            euWindRef.current[windLevel] = partial;
            setNowcastTick((t) => t + 1);
          });
          if (cancelled) return;
          euWindRef.current[windLevel] = wd;
        } catch {
          if (!cancelled) updateStatus('wind', { err: `ICON-EU ${windLevel} hPa nicht erreichbar` });
          return;
        }
      }
      if (cancelled || windLevelRef.current !== windLevel) return;
      updateStatus('wind', { ok: { model: `DWD ICON-EU ${windLevel} hPa · 7 km`, fetchedAt: Date.now() } });
      setNowcastTick((t) => t + 1);
    })();
    return () => { cancelled = true; };
  }, [windLevel, active]);

  // Wind-Partikel-Steuerung → Layer. `density` skaliert die (viewport-basierte)
  // Partikelzahl; „Intensiv" verbreitert die Punkte und verlängert den Schweif
  // (fadeOpacity) für den volleren windy-„intensive"-Look. Greift auf der einen
  // dauerhaften WindLayer-Instanz (Toggle ändert nur Sichtbarkeit, re-creïert nicht).
  useEffect(() => {
    const wind = layerRefs.current.wind;
    if (!wind) return;
    wind.setShowParticles(windCfg.on);
    wind.setDensityMultiplier(windCfg.density * (windCfg.intensive ? 2.1 : 1));
    wind.setPointSize(windCfg.intensive ? 1.75 : 1.5);
    wind.setFadeOpacity(windCfg.intensive ? 0.972 : 0.955);
  }, [windCfg, active]);

  // Temperatur-Layer (natives ICON-D2 t_2m): bei jeder Slider-Bewegung den Frame
  // mit der nächstgelegenen Vorlaufstunde setzen. Das DEM-Bild (hsurf-Refinement)
  // ist über setDem bereits aktiv. Sobald geladen, ersetzt das die Fusion-Temp.
  useEffect(() => {
    const temp = layerRefs.current.temp;
    if (!temp || !active.has('temp')) return;
    // Bei aktiver Fusion-Temp (gewählt UND Daten bereit) speist die gridded Fusion
    // (zentraler Fusion-Effekt); nativ zurücktreten. Fehlt/scheitert die Fusion → nativ.
    if (fusionActiveFor('temp')) return;
    const td = iconD2TempRef.current;
    if (!td || td.frames.length === 0) return;
    const f = frameAtValidTime(td.frames, Date.now() + forecastHour * 3600_000);
    temp.setData(f.image, {
      width: f.width, height: f.height,
      vMin: td.vMin, vMax: td.vMax, uvBounds: td.uvBounds,
    });
    reportValidAt(f.validAt.getTime());
  }, [forecastHour, nowcastTick, active, modelSource, forecast, reportValidAt]);

  // Böen-Layer (natives ICON-D2 vmax_10m): bei jeder Slider-Bewegung den Frame
  // mit der nächstgelegenen Vorlaufstunde setzen.
  useEffect(() => {
    const gust = layerRefs.current.gust;
    if (!gust || !active.has('gust')) return;
    const gd = iconD2GustRef.current;
    if (!gd || gd.frames.length === 0) return;
    // P0-2: vmax_10m ist ein Perioden-Maximum → am Analyse-Schritt t+0 strukturell
    // 0. minStepHours=1 überspringt diesen Null-Schritt, damit „jetzt" ein echtes
    // Böen-Intervall zeigt statt flächiger Windstille.
    const f = frameAtValidTime(gd.frames, Date.now() + forecastHour * 3600_000, 1);
    gust.setData(f.image, {
      width: f.width, height: f.height,
      vMin: gd.vMin, vMax: gd.vMax, uvBounds: gd.uvBounds,
    });
    reportValidAt(f.validAt.getTime());
  }, [forecastHour, nowcastTick, active, reportValidAt]);

  // DEV-Hooks (QA P1-1/P1-3): numerischer Punkt-Sampler je Layer +
  // automatisierter QA-Check gegen Open-Meteo. Nur im Dev-Build. Hängt an
  // forecastHour, damit die Closure die aktuell angezeigte Stunde nutzt.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const targetMs = () => Date.now() + forecastHour * 3600_000;
    const api: SampleApi = {
      hour: () => forecastHour,
      temp: (lon, lat) => sampleTempAt(iconD2TempRef.current, targetMs(), lon, lat),
      gust: (lon, lat) => sampleGustAt(iconD2GustRef.current, targetMs(), lon, lat),
      wind: (lon, lat) => sampleWindAt(iconD2WindRef.current, targetMs(), lon, lat),
      clouds: (lon, lat) => sampleCloudsAt(iconD2CloudsRef.current, targetMs(), lon, lat),
    };
    const w = window as unknown as Record<string, unknown>;
    w.__bsSample = api;
    w.__bsQA = () => runLayerQA(api);
    // P2-3: Schneegrenzen-Geometrie vs. OM-Frostgrenze (greift bei winterlicher Lage).
    w.__bsSnowlineQA = () => {
      const src = mapRef.current?.getSource(SNOWLINE_SOURCE_ID) as { _data?: GeoJSON.FeatureCollection } | undefined;
      const data = (src?._data as GeoJSON.FeatureCollection | undefined) ?? null;
      return runSnowlineQA(data, (lon, lat) => sampleDemAt(iconD2TempRef.current, lon, lat));
    };
    return () => { delete w.__bsSample; delete w.__bsQA; delete w.__bsSnowlineQA; };
  }, [forecastHour]);

  // City temperature labels — windy-style: a small location dot + the bare,
  // temperature-coloured value (no city name, no pill). PERMANENTLY visible
  // (independent of the temperature layer toggle), updates with the forecast
  // slider, and uses the SAME DEM-aware lapse math as the heatmap shader so
  // the value matches the underlying pixel. ALWAYS tied to a real town/city
  // from the curated `DACH_CITIES` list (no free-floating grid numbers).
  // Density scales gently with zoom via `minZoomForRank`: rank 1 (top metros +
  // iconic peaks) always shown, rank 2-3 added at intermediate zooms, rank 4
  // (small towns + alpine villages) only at city-view zoom — so zooming in
  // reveals smaller places gradually, and each new label fades in (CSS).
  useEffect(() => {
    const map = mapRef.current;
    const markers = tempLabelMarkersRef.current;
    const removeAll = () => {
      markers.forEach((m) => m.remove());
      markers.clear();
    };
    if (!map) {
      removeAll();
      return;
    }

    // Sampler-Quelle: BEVORZUGT das native ICON-D2-t_2m-Gitter (scharf, DEM-
    // korrigiert, pixelidentisch zum Raster) — dieselben Lapse-/demMax-Werte wie
    // der Temp-Shader (0,0065 · 4500). So brauchen die Labels die teure gridded
    // Fusion NICHT; die Fusion bleibt nur Fallback, bis das native Gitter da ist.
    let samplerOpts: TemperatureSamplerOptions | null = null;
    const td = iconD2TempRef.current;
    if (td && td.frames.length > 0) {
      const f = frameAtValidTime(td.frames, Date.now() + forecastHour * 3600_000);
      samplerOpts = {
        tempImage: f.image, tempUvBounds: td.uvBounds, vMin: td.vMin, vMax: td.vMax,
        demImage: td.demImage, demUvBounds: td.uvBounds, demMax: 4500, lapseRatePerM: 0.0065,
      };
    } else if (forecast) {
      const maxIdx = forecast.hours.length - 1;
      const lA = forecast.hours[Math.max(0, Math.min(maxIdx, forecastHour)) | 0]?.layers;
      if (lA?.temperature) samplerOpts = {
        tempImage: lA.temperature.image, tempUvBounds: lA.temperature.uvBounds,
        vMin: lA.temperature.vMin, vMax: lA.temperature.vMax,
        demImage: forecast.demImage ?? null, demUvBounds: lA.temperature.uvBounds,
        demMax: forecast.demMax ?? 4500, lapseRatePerM: forecast.lapseRatePerM ?? 0.0065,
      };
    }
    // Marker anlegen/wiederverwenden (Schlüssel = Stadtname). Neue Marker starten
    // unsichtbar (opacity 0) und blenden per CSS-Transition sanft ein, statt beim
    // Zoom abrupt aufzuploppen.
    const ensureMarker = (key: string, lng: number, lat: number): Marker => {
      let m = markers.get(key);
      // Verwaiste Marker (Element nicht mehr im DOM — z. B. nach Karten-Neuaufbau
      // unter StrictMode) verwerfen und neu anlegen, sonst blieben sie unsichtbar.
      if (m && !m.getElement().isConnected) { m.remove(); markers.delete(key); m = undefined; }
      if (!m) {
        const el = document.createElement('div');
        el.className = 'temp-label';
        el.style.opacity = '0';
        // Windy-Stil: kleiner Standort-Punkt + reine, eingefärbte Zahl.
        el.innerHTML = `<span class="temp-label-dot"></span><span class="temp-label-val"></span>`;
        m = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(map);
        // Auf den nächsten Frame warten, dann opacity freigeben → Transition greift.
        requestAnimationFrame(() => { el.style.opacity = ''; });
        markers.set(key, m);
      }
      return m;
    };
    const writeMarker = (m: Marker, t: number, rankClass: string) => {
      const root = m.getElement();
      const cls = `temp-label ${rankClass}`;
      if (root.className !== cls) root.className = cls;
      const val = root.querySelector('.temp-label-val') as HTMLElement | null;
      // Nur schreiben/umfärben, wenn sich der Wert wirklich ändert — spart beim
      // Scrubben Layout/Paint, wenn Nachbarstunden denselben gerundeten Wert geben.
      const display = `${Math.round(t)}°`;
      if (val && val.textContent !== display) val.textContent = display;
      // Farbe auf der Wurzel → Punkt (currentColor) und Zahl erben sie.
      const col = tempLabelColor(t);
      if (root.dataset.col !== col) { root.style.color = col; root.dataset.col = col; }
    };

    // Painter: `getTemp(city)` → °C für jede sichtbare Stadt/Dorf. Quelle ist der
    // Live-Sampler (frisches Gitter) oder der Sofort-Cache (Kaltstart). Es werden
    // AUSSCHLIESSLICH Orte aus `DACH_CITIES` beschriftet — keine frei im Gitter
    // platzierten Zahlen, jede Temperatur klebt an einem echten Ort.
    const paint = (getTemp: (c: City) => number | null) => {
      const zoom = map.getZoom();
      const keep = new Set<string>();

      for (const city of DACH_CITIES) {
        if (zoom < minZoomForRank(city.rank)) continue;
        const t = getTemp(city);
        if (t == null || !Number.isFinite(t)) continue;
        writeMarker(ensureMarker(city.name, city.lng, city.lat), t, `temp-label-rank-${city.rank}`);
        keep.add(city.name);
      }

      // Nicht mehr benötigte Marker entfernen (außerhalb des Ausschnitts oder
      // durch Zoom verschwundene Ränge).
      for (const [key, m] of markers) {
        if (!keep.has(key)) { m.remove(); markers.delete(key); }
      }
    };

    // Render erst, wenn die Karte ihre Transform hat (sonst liefert getZoom()
    // NaN → nichts „sichtbar"). Sofort versuchen UND auf 'load' wiederholen, plus
    // bei jedem Zoom neu. Genau dieses 'load'-Gate macht den Cache-Sofortstart
    // wirksam: die Labels stehen, sobald der Basemap-Style da ist (~1 s) — lange
    // vor dem GRIB-Temperaturgitter.
    const renderWhenReady = (render: () => void): (() => void) => {
      render();
      if (!map.isStyleLoaded()) map.once('load', render);
      // 'moveend' deckt Zoom UND Pan ab — beim Reinzoomen tauchen rangniedrigere
      // Orte auf, beim Pannen folgt die Auswahl dem sichtbaren Ausschnitt.
      map.on('moveend', render);
      return () => { map.off('load', render); map.off('moveend', render); };
    };

    const atHour0 = Math.round(forecastHour) === 0;

    if (samplerOpts) {
      // Frische Daten da → einmal alle Städte sampeln. Nur wenn das Gitter
      // tatsächlich Abdeckung liefert (genug endliche Werte), live rendern und —
      // beim „jetzt"-Frame — den Sofort-Cache aktualisieren. Bei degradierten/
      // leeren Daten (z. B. Lauf abgelaufen) NICHT speichern (Cache nicht
      // überschreiben) und stattdessen unten auf den Cache zurückfallen.
      const sampler = new TemperatureSampler(samplerOpts);
      const full: Record<string, number> = {};
      for (const c of DACH_CITIES) { const t = sampler.sample(c.lng, c.lat); if (t != null && Number.isFinite(t)) full[c.name] = t; }
      if (Object.keys(full).length >= 8) {
        if (atHour0) saveTempLabelCache(full);
        return renderWhenReady(() => paint((c) => sampler.sample(c.lng, c.lat)));
      }
      // sonst: durchfallen auf den Cache-Sofort-Render
    }

    // Kaltstart ODER degradierte Live-Daten: Labels SOFORT aus dem Cache der
    // letzten Sitzung zeigen (≤ 6 h alt). Sobald das frische Gitter geladen ist,
    // bumpt nowcastTick und dieser Effekt rendert mit den echten Werten neu.
    const cached = atHour0 ? loadTempLabelCache() : null;
    if (cached) {
      // Kaltstart: benannte Städte aus dem Cache. Sobald das frische Gitter lädt,
      // bumpt nowcastTick und der Effekt rendert mit den echten Werten neu.
      return renderWhenReady(() => paint((c) => cached[c.name] ?? null));
    }
    removeAll();
  }, [forecast, forecastHour, active, nowcastTick]);

  // Switch satellite tile template whenever the user picks a different
  // product. `setTiles` is the cheap path that keeps the existing source +
  // layer in place and just re-requests the new WMS URL.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource(SAT_SOURCE_ID);
      if (!src || (src as { type: string }).type !== 'raster') return;
      const meta = satelliteSourceMeta(satProduct);
      (src as unknown as { setTiles: (urls: string[]) => void }).setTiles([meta.template]);
      updateStatus('sat', { ok: { model: meta.title, fetchedAt: Date.now() } });
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [satProduct]);

  // apply visibility whenever the active set changes.
  // Re-apply layer visibility on every active-set or slider change. The
  // precipitation layer is now a single FusionEngine scalar — no per-hour
  // WMS swap, no Pan-EU vs DWD-RV layering, just one consistent grid.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const set: Record<string, boolean> = {
        wind: active.has('wind'),
        clouds: active.has('clouds'),
        temperature: active.has('temp'),
        gust: active.has('gust'),
        // Niederschlag-Layer nur sichtbar, wenn für die Slider-Stunde ein Frame
        // verfügbar ist (länderabhängig: RV/INCA/rzc bzw. ICON-D2 im Horizont).
        [NOWCAST_LAYER_ID]: active.has('nowcast') && precipFrameReady(forecastHour) && !fusionActiveFor('nowcast') && modelSourceRef.current.radar,
        // Fusion-Niederschlag (Forecast-Grid) statt Radar-Komposit, wenn der Resolver
        // Fusion für 'nowcast' wählt. Ohne Daten rendert der ScalarLayer nichts (transparent).
        'precip-forecast': active.has('nowcast') && fusionActiveFor('nowcast') && modelSourceRef.current.radar,
        [SAT_LAYER_ID]: active.has('sat'),
        [LIGHTNING_LAYER_ID]: active.has('lightning'),
        [STATIONS_LAYER_ID]: active.has('stations'),
        [CONFIDENCE_LAYER_ID]: active.has('confidence'),
        [SNOWLINE_CASING_ID]: active.has('snowline'),
        [SNOWLINE_LAYER_ID]: active.has('snowline'),
        [FLOW_NOWCAST_LAYER_ID]: active.has('flownowcast') && modelSourceRef.current.radar,
        [POP_LAYER_ID]: active.has('poprob') && modelSourceRef.current.radar,
        [DIM_LAYER_ID]: true, // dark wash always on — keeps the canvas dark even with no weather layer
      };
      for (const id of Object.keys(set)) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', set[id] ? 'visible' : 'none');
        }
      }
      // Precipitation fusion scalar needs to render ABOVE the country mask
      // so precip systems outside DACH (e.g. fronts over N-Italy moving
      // north) stay visible. The mask cuts out DACH for the basemap; the
      // data layer is continental.
      if (map.getLayer('precip-forecast')) map.moveLayer('precip-forecast');
      // Niederschlags-RainLayer über die Maske heben, damit das Radar/Modell
      // sauber über der freigestellten Karte liegt.
      if (map.getLayer(NOWCAST_LAYER_ID)) map.moveLayer(NOWCAST_LAYER_ID);
      if (map.getLayer(FLOW_NOWCAST_LAYER_ID)) map.moveLayer(FLOW_NOWCAST_LAYER_ID);
      if (map.getLayer(POP_LAYER_ID)) map.moveLayer(POP_LAYER_ID);
      // Vertrauens-Schleier ÜBER den Datenschichten (auch über dem Niederschlag,
      // der gerade nach oben gehoben wurde) — sonst verdeckt das Radar die
      // Schraffur. Die Stationen bleiben darüber (nächster moveLayer).
      if (map.getLayer(CONFIDENCE_LAYER_ID)) map.moveLayer(CONFIDENCE_LAYER_ID);
      // Schneefallgrenze als Linie ganz oben (dünn → verdeckt nichts), über den
      // Rastern und dem Schleier.
      if (map.getLayer(SNOWLINE_CASING_ID)) map.moveLayer(SNOWLINE_CASING_ID);
      if (map.getLayer(SNOWLINE_LAYER_ID)) map.moveLayer(SNOWLINE_LAYER_ID);
      // Stations live ON TOP of everything (including the country mask and
      // any precipitation overlay). Re-hoisting last keeps the markers
      // reachable regardless of init order.
      if (map.getLayer(STATIONS_LAYER_ID)) map.moveLayer(STATIONS_LAYER_ID);
    };
    // Use styledata retry rather than `map.once('load')` — the load event
    // can fail to fire when too many sibling fetches saturate the browser's
    // request queue, leaving layer visibility frozen.
    const safeApply = () => { try { apply(); } catch { map.once('styledata', safeApply); } };
    safeApply();
  }, [active, forecastHour, nowcastTick, location.country, modelSource, forecast]);

  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  // label for the slider's current forecast hour (supports sub-hour positions)
  const forecastLabel = useMemo(() => {
    const fmt = (d: Date) =>
      d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', weekday: 'short' });
    // P0-3: Uhr-Label = Gültigkeitszeit des angezeigten nativen Frames (Single
    // Source of Truth). Verspäteter Lauf → „Stand HH:MM" statt irreführendem „jetzt".
    if (dataValidAtMs != null) {
      const d = new Date(dataValidAtMs);
      const lagH = (Date.now() - dataValidAtMs) / 3600_000; // >0 = Daten in der Vergangenheit
      if (forecastHour === 0) return lagH > 0.75 ? `Stand · ${fmt(d)}` : `jetzt · ${fmt(d)}`;
      const hh = forecastHour % 1 === 0 ? `${forecastHour}` : forecastHour.toFixed(1);
      return `+${hh} h · ${fmt(d)}`;
    }
    if (!forecast) return null;
    const maxIdx = forecast.hours.length - 1;
    if (forecastHour <= maxIdx) {
      const clamped = Math.max(0, forecastHour);
      const hLow = Math.floor(clamped);
      const hHigh = Math.min(maxIdx, hLow + 1);
      const frac = clamped - hLow;
      const tsLow = forecast.hours[hLow]?.timestamp;
      const tsHigh = forecast.hours[hHigh]?.timestamp;
      if (!tsLow) return null;
      const interpolated = tsHigh && frac > 0
        ? new Date(tsLow.getTime() * (1 - frac) + tsHigh.getTime() * frac)
        : tsLow;
      if (clamped === 0) return `jetzt · ${fmt(interpolated)}`;
      const hh = clamped % 1 === 0 ? `${clamped}` : clamped.toFixed(1);
      return `+${hh} h · ${fmt(interpolated)}`;
    }
    // Jenseits des 24-h-Fusionshorizonts (nur ICON-D2-Niederschlag): Zeit aus
    // "jetzt + Stunde" ableiten, da keine Fusions-Frames mehr vorliegen.
    const t = new Date(Date.now() + forecastHour * 3600_000);
    const hh = forecastHour % 1 === 0 ? `${forecastHour}` : forecastHour.toFixed(1);
    return `+${hh} h · ${fmt(t)}`;
  }, [forecast, forecastHour, dataValidAtMs]);

  // Slider-Obergrenze: standardmäßig der 24-h-Fusionshorizont; bei aktivem
  // Niederschlag-Layer bis zum ICON-D2-Horizont (+45/48 h), sobald geladen.
  const sliderMax = useMemo(() => {
    const base = forecast ? Math.max(0, forecast.hours.length - 1) : 0;
    const usesIconD2 = active.has('nowcast') || active.has('clouds');
    return usesIconD2 ? Math.max(base, iconD2HorizonHours()) : base;
    // iconD2HorizonHours liest die Refs → nowcastTick triggert Neuberechnung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecast, active, nowcastTick]);

  // Wenn der Horizont schrumpft (Niederschlag deaktiviert), Slider zurückholen.
  useEffect(() => {
    if (forecastHour > sliderMax) setForecastHour(sliderMax);
  }, [sliderMax, forecastHour]);

  // Slider-Grenzen: eingebettet auf das Eventfenster des gewählten Tages begrenzt
  // (Tagesablauf), sonst 0 … Horizont. Auf den verfügbaren Horizont geklemmt.
  const dayLo = embedded && embedHourRange ? Math.max(0, Math.min(sliderMax, embedHourRange[0])) : 0;
  const dayHi = embedded && embedHourRange ? Math.max(dayLo + 0.2, Math.min(sliderMax, embedHourRange[1])) : sliderMax;

  // Eingebettet: Tagesablauf animieren (Play) — Slider Schritt für Schritt durchs
  // Fenster, am Ende zurück an den Anfang.
  useEffect(() => {
    if (!embedded || !playing) return;
    const id = window.setInterval(() => {
      setForecastHour(h => {
        const next = Math.round((h + 1) * 10) / 10;
        return next > dayHi ? dayLo : next;
      });
    }, 900);
    return () => window.clearInterval(id);
  }, [embedded, playing, dayLo, dayHi]);

  // Eingebettet: aktiver Layer kommt von außen (Tab-Umschalter in der
  // Ergebnisseite) → internen active-State darauf spiegeln.
  useEffect(() => {
    if (!embedded || !embeddedLayer) return;
    setActive(new Set<LayerKey>([embeddedLayer]));
  }, [embedded, embeddedLayer]);

  // Eingebettet: die Container-Größe steht beim Lazy-Mount evtl. noch nicht / ändert
  // sich durch das Karten-Layout → MapLibre zuverlässig nachmessen lassen, sonst
  // bleibt die Karte leer oder falsch dimensioniert.
  useEffect(() => {
    if (!embedded) return;
    const el = containerRef.current;
    if (!el) return;
    const doResize = () => mapRef.current?.resize();
    const raf = requestAnimationFrame(doResize);
    const t = setTimeout(doResize, 300);
    const ro = new ResizeObserver(doResize);
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); ro.disconnect(); };
  }, [embedded]);

  // Permalink: aktuellen Kartenzustand (Ort · Layer · Stunde) in den Hash
  // schreiben — nur in der Vollansicht; eingebettet gehört der Hash dem
  // umgebenden Feature (z. B. der Event-Ergebnisseite).
  useEffect(() => {
    if (embedded) return;
    const hash = encodeMapState({ location, layers: [...active], hour: forecastHour });
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, [embedded, location, active, forecastHour]);


  // Mobile (<768px): die linke Rail + Wind-/Legenden-/Badge-Overlays werden in
  // ein gebündeltes „Layer & Daten"-Bottom-Sheet umgeschichtet (Informationserhalt
  // + Touch-Targets ≥44px + Hover→Tap). Desktop/Tablet bleiben unberührt.
  const [mobileLayers, setMobileLayers] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState<LayerKey | null>(null);

  return (
    <div className={`map-view${embedded ? ' map-view-embedded' : ''}`}>
      <div className="map-topbar">
        {!embedded && (
          <button className="back-btn" onClick={onBack} type="button" aria-label="Zurück zur Suche">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="8,2 3,7 8,12" />
              <line x1="3" y1="7" x2="12" y2="7" />
            </svg>
            <span>Zurück</span>
          </button>
        )}
        <div className="location-label" title={location.name}>
          <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden="true">
            <path
              d="M 7 1.5 C 4 1.5, 2 3.5, 2 6 C 2 9.5, 7 14.5, 7 14.5 C 7 14.5, 12 9.5, 12 6 C 12 3.5, 10 1.5, 7 1.5 Z"
              stroke="var(--terracotta-500)" strokeWidth="1.4" strokeLinejoin="round"
            />
            <circle cx="7" cy="6" r="1.7" fill="var(--terracotta-500)" />
          </svg>
          <span className="location-label-text">{location.name}</span>
        </div>
      </div>

      {!embedded && (
        <div className="left-rails">
        {/* Per-Land-Modell-Switcher (Phase 3, docs/model-switcher-gate0.md). Ersetzt
            die alte binäre .model-switch-Rail (bleibt unten flag-gated & unsichtbar
            bis zur Bereinigung). */}
        <ModelSwitcher
          state={modelSource}
          variant="rail"
          onSelectCountry={onSelectCountry}
          onSelectModel={onSelectModel}
          onToggleRadar={onToggleRadar}
          fusionError={fusionError}
        />
        <div className="layer-switch">
          {LAYER_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              className={active.has(opt.key) ? 'active' : ''}
              onClick={() => toggle(opt.key)}
              onMouseEnter={(e) => showLayerInfo(e.currentTarget, opt.key)}
              onMouseLeave={() => setLayerHover(null)}
              onFocus={(e) => showLayerInfo(e.currentTarget, opt.key)}
              onBlur={() => setLayerHover(null)}
              title={opt.title}
            >
              <LayerIcon layer={opt.key} />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
        {active.has('sat') && (
          <div className="sat-product-switch">
            {SATELLITE_PRODUCTS.map(p => (
              <button
                key={p}
                type="button"
                className={satProduct === p ? 'active' : ''}
                onClick={() => setSatProduct(p)}
                title={SAT_PRODUCT_FULL_LABELS[p]}
              >
                {SAT_PRODUCT_LABELS[p]}
              </button>
            ))}
          </div>
        )}
        </div>
      )}
      {!embedded && layerHover && (
        <LayerInfoPanel layer={layerHover.key} style={{ top: layerHover.top, left: layerHover.left }} />
      )}
      {!embedded && (active.has('confidence') || active.has('snowline') || active.has('flownowcast') || active.has('poprob')) && (
        <div className="map-legends">
          {active.has('confidence') && (
            <div className="confidence-legend" role="note" aria-label="Vertrauens-Schleier">
              <div className="cl-title">{active.has('nowcast') ? 'Sicherheit · Regen' : 'Sicherheit · Temperatur'}</div>
              <div className="cl-scale" aria-hidden="true">
                <span className="cl-swatch cl-sure" />
                <span className="cl-swatch cl-mid" />
                <span className="cl-swatch cl-unsure" />
              </div>
              <div className="cl-ends"><span>sicher</span><span>unsicher</span></div>
              <div className="cl-note">
                {active.has('nowcast')
                  ? 'Dichtere Schraffur = unsicherere Regenvorhersage. Echter Ensemble-Spread (DE): 15 Member advehieren das Radar mit gestörten Bewegungsfeldern — wo sie uneins sind (Niederschlagskanten, ferne Lead-Zeiten), ist es unsicher.'
                  : 'Dichtere Schraffur = unsicherere Vorhersage. Abweichung von der DWD-Stationsklimatologie (30 J.) × Lauf-zu-Lauf-Übereinstimmung zweier ICON-D2-Läufe (echtes zeitversetztes Ensemble).'}
              </div>
            </div>
          )}
          {active.has('snowline') && (
            <div className="confidence-legend" role="note" aria-label="Schneefallgrenze">
              <div className="cl-title">Schneefallgrenze</div>
              <div className="sl-swatch" aria-hidden="true" />
              <div className="cl-note">Linie = Übergang Regen↔Schnee; oberhalb fällt Niederschlag als Schnee. KI · ML #2: Physik-Anker + gelernte Orts-Korrektur (DWD-Stationen), dem Gelände folgend. Bei milder Luft existiert keine Linie (alles Regen).</div>
            </div>
          )}
          {active.has('flownowcast') && (
            <div className="confidence-legend" role="note" aria-label="Flow-Nowcast">
              <div className="cl-title">🌀 Flow-Nowcast</div>
              <div className="cl-note">Optical-Flow-Extrapolation: aus zwei RADOLAN-Frames wird das Bewegungsfeld geschätzt (Horn-Schunck) und das aktuelle Radar damit vorwärts advehiert. Regen wandert intensitätserhaltend (~0–60 min). Nur DE, trainingsfrei.</div>
            </div>
          )}
          {active.has('poprob') && (
            <div className="confidence-legend" role="note" aria-label="Regenwahrscheinlichkeit">
              <div className="cl-title">Regen-Chance (%)</div>
              <div className="pop-scale" aria-hidden="true" />
              <div className="cl-ends"><span>unwahrsch.</span><span>sicher</span></div>
              <div className="cl-note">Kalibrierte Regenwahrscheinlichkeit aus dem Flow-Ensemble (15 Member, gestörte Bewegungsfelder). „Wie wahrscheinlich" statt „wie viel". Nur DE, ~0–60 min.</div>
            </div>
          )}
        </div>
      )}

      {!embedded && active.has('wind') && (
        <div className="wind-particle-switch" role="group" aria-label="Wind-Partikel">
          <div className="wpc-modes">
            <button
              type="button"
              className={!windCfg.on ? 'active' : ''}
              onClick={() => setWindCfg(c => ({ ...c, on: false }))}
              title="Nur Wind-Heatmap, keine Partikel-Animation"
            >
              Aus
            </button>
            <button
              type="button"
              className={windCfg.on && !windCfg.intensive ? 'active' : ''}
              onClick={() => setWindCfg(c => ({ ...c, on: true, intensive: false }))}
              title="Normale Partikeldichte"
            >
              Normal
            </button>
            <button
              type="button"
              className={windCfg.on && windCfg.intensive ? 'active' : ''}
              onClick={() => setWindCfg(c => ({ ...c, on: true, intensive: true }))}
              title="Dichtere, längere Partikel (windy.com-intensiv)"
            >
              Intensiv
            </button>
          </div>
          {windCfg.on && (
            <label className="wpc-density" title="Partikel-Dichte">
              <span aria-hidden="true">Dichte</span>
              <input
                type="range"
                min={0.3}
                max={2.5}
                step={0.1}
                value={windCfg.density}
                onChange={e => setWindCfg(c => ({ ...c, density: Number(e.target.value) }))}
                aria-label="Partikel-Dichte"
              />
            </label>
          )}
          <div className="wpc-levels" role="group" aria-label="Wind-Höhe">
            <span aria-hidden="true">Höhe</span>
            <button
              type="button"
              className={windLevel === 'surface' ? 'active' : ''}
              onClick={() => setWindLevel('surface')}
              title="Bodennah · 10 m (ICON-D2, 2,2 km)"
            >
              10&nbsp;m
            </button>
            {WIND_PRESSURE_LEVELS.map(lvl => (
              <button
                key={lvl}
                type="button"
                className={windLevel === lvl ? 'active' : ''}
                onClick={() => setWindLevel(lvl)}
                title={`${lvl} hPa Höhenwind (ICON-EU, ~7 km)`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="data-badge">
        <span title={COUNTRY_PROFILES[location.country].stackLabel}>
          {({ DE: '🇩🇪', AT: '🇦🇹', CH: '🇨🇭' } as const)[location.country]}{' '}
          {COUNTRY_PROFILES[location.country].name} · {COUNTRY_PROFILES[location.country].stackLabel}
        </span>
        {LAYER_OPTIONS.filter(o => active.has(o.key)).map(o => {
          const s = statuses[o.key];
          return (
            <span key={o.key} className={s.err ? 'err' : ''} title={s.err ?? undefined}>
              {s.err
                ? `${o.label}: ${s.err}`
                : s.ok
                  ? `${o.label} · ${s.ok.model.toUpperCase()} · ${s.ok.captured ? 'Stand ' : ''}${fmtTime(s.ok.fetchedAt)}`
                  : `${o.label} wird geladen…`}
            </span>
          );
        })}
      </div>

      {forecast && (
        <div className="forecast-slider">
          <div className="forecast-slider-row">
            {embedded ? (
              <button
                type="button"
                className="forecast-now"
                onClick={() => setPlaying(p => !p)}
                title={playing ? 'Tagesablauf pausieren' : 'Tagesablauf abspielen'}
                aria-pressed={playing}
              >
                {playing ? '⏸' : '▶'}
              </button>
            ) : (
              <button
                type="button"
                className="forecast-now"
                disabled={forecastHour === 0}
                onClick={() => setForecastHour(0)}
                title="Auf 'jetzt' zurücksetzen"
              >
                jetzt
              </button>
            )}
            <input
              type="range"
              min={dayLo}
              max={dayHi}
              step={0.2}
              value={Math.max(dayLo, Math.min(dayHi, forecastHour))}
              onChange={e => { setPlaying(false); setForecastHour(Number(e.target.value)); }}
              aria-label={embedded ? 'Uhrzeit am Tag' : 'Forecast-Stunde'}
            />
            <span className="forecast-label">{forecastLabel}</span>
          </div>
        </div>
      )}

      {!embedded && !overview && (
        <PointForecastPanel
          lat={location.lat}
          lng={location.lon}
          country={location.country}
          locationLabel={location.name}
          sourceMode={resolvePointSource(modelSource)}
        />
      )}

      {/* ===== Mobile-Dock + „Layer & Daten"-Sheet (<768px; per CSS) ============
          Bündelt die linke Rail, Wind-/Sat-Feinsteuerung, Legenden und die
          Datenherkunft (Quelle/„Stand") in EIN Bottom-Sheet — Touch-tauglich,
          Hover-Infos als Tap-Disclosure. Auf Desktop/Tablet ist das Dock/Sheet
          per CSS ausgeblendet. */}
      {!embedded && (
        <>
          <button
            type="button"
            className="map-layer-fab"
            onClick={() => setMobileLayers(true)}
            aria-label="Layer und Daten öffnen"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12,3 22,8.5 12,14 2,8.5" /><polyline points="2,13 12,18.5 22,13" /><polyline points="2,17.5 12,23 22,17.5" />
            </svg>
            <span>Layer</span>
          </button>

          {mobileLayers && (
            <>
              <div className="map-sheet-scrim" onClick={() => setMobileLayers(false)} />
              <aside className="map-sheet" role="dialog" aria-modal="true" aria-label="Layer und Daten">
                <div className="map-sheet-grab" aria-hidden="true" />
                <header className="map-sheet-head">
                  <span className="eyebrow">Layer &amp; Daten</span>
                  <button type="button" className="map-sheet-close" onClick={() => setMobileLayers(false)} aria-label="Schließen">
                    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </button>
                </header>

                <div className="map-sheet-model is-static">
                  <span className="map-sheet-model-label">Land</span>
                  <strong className="map-sheet-model-val">
                    {({ DE: '🇩🇪', AT: '🇦🇹', CH: '🇨🇭' } as const)[location.country]}{' '}
                    {COUNTRY_PROFILES[location.country].name}
                  </strong>
                </div>

                <ModelSwitcher
                  state={modelSource}
                  variant="sheet"
                  onSelectCountry={onSelectCountry}
                  onSelectModel={onSelectModel}
                  onToggleRadar={onToggleRadar}
                  fusionError={fusionError}
                />

                <div className="map-sheet-list">
                  {LAYER_OPTIONS.map(opt => {
                    const on = active.has(opt.key);
                    const st = statuses[opt.key];
                    const exp = sheetExpanded === opt.key;
                    const stamp = st?.err ? '⚠ Fehler' : st?.ok ? `${st.ok.captured ? 'Stand ' : ''}${fmtTime(st.ok.fetchedAt)}` : on ? 'lädt…' : '';
                    return (
                      <div key={opt.key} className={`map-sheet-row${on ? ' is-on' : ''}`}>
                        <div className="map-sheet-rowmain">
                          <button
                            type="button"
                            className={`map-sheet-toggle${on ? ' is-on' : ''}`}
                            role="switch"
                            aria-checked={on}
                            onClick={() => toggle(opt.key)}
                            aria-label={`${opt.label} ${on ? 'ausschalten' : 'einschalten'}`}
                          >
                            <LayerIcon layer={opt.key} />
                          </button>
                          <button
                            type="button"
                            className="map-sheet-rowtx"
                            aria-expanded={exp}
                            onClick={() => setSheetExpanded(exp ? null : opt.key)}
                          >
                            <span className="map-sheet-name">{opt.label}</span>
                            {on && stamp && <span className="map-sheet-stamp">{stamp}</span>}
                          </button>
                          <button
                            type="button"
                            className={`map-sheet-chev${exp ? ' is-open' : ''}`}
                            onClick={() => setSheetExpanded(exp ? null : opt.key)}
                            aria-label={exp ? 'Details schließen' : 'Details & Legende'}
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="4,6 8,10 12,6" /></svg>
                          </button>
                        </div>
                        {exp && (
                          <div className="map-sheet-info">
                            <LayerInfoPanel layer={opt.key} />
                            {opt.key === 'wind' && on && (
                              <div className="map-sheet-sub wind-particle-switch" role="group" aria-label="Wind-Partikel">
                                <div className="wpc-modes">
                                  <button type="button" className={!windCfg.on ? 'active' : ''} onClick={() => setWindCfg(c => ({ ...c, on: false }))}>Aus</button>
                                  <button type="button" className={windCfg.on && !windCfg.intensive ? 'active' : ''} onClick={() => setWindCfg(c => ({ ...c, on: true, intensive: false }))}>Normal</button>
                                  <button type="button" className={windCfg.on && windCfg.intensive ? 'active' : ''} onClick={() => setWindCfg(c => ({ ...c, on: true, intensive: true }))}>Intensiv</button>
                                </div>
                                {windCfg.on && (
                                  <label className="wpc-density"><span aria-hidden="true">Dichte</span>
                                    <input type="range" min={0.3} max={2.5} step={0.1} value={windCfg.density} onChange={e => setWindCfg(c => ({ ...c, density: Number(e.target.value) }))} aria-label="Partikel-Dichte" />
                                  </label>
                                )}
                                <div className="wpc-levels" role="group" aria-label="Wind-Höhe">
                                  <span aria-hidden="true">Höhe</span>
                                  <button type="button" className={windLevel === 'surface' ? 'active' : ''} onClick={() => setWindLevel('surface')}>10&nbsp;m</button>
                                  {WIND_PRESSURE_LEVELS.map(lvl => (
                                    <button key={lvl} type="button" className={windLevel === lvl ? 'active' : ''} onClick={() => setWindLevel(lvl)}>{lvl}</button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {opt.key === 'sat' && on && (
                              <div className="map-sheet-sub sat-product-switch" role="group" aria-label="Satellitenprodukt">
                                {SATELLITE_PRODUCTS.map(p => (
                                  <button key={p} type="button" className={satProduct === p ? 'active' : ''} onClick={() => setSatProduct(p)} title={SAT_PRODUCT_FULL_LABELS[p]}>{SAT_PRODUCT_LABELS[p]}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="map-sheet-sources">
                  {({ DE: '🇩🇪', AT: '🇦🇹', CH: '🇨🇭' } as const)[location.country]}{' '}
                  {COUNTRY_PROFILES[location.country].name} · {COUNTRY_PROFILES[location.country].stackLabel}
                </div>
              </aside>
            </>
          )}
        </>
      )}

      <div ref={containerRef} className="map-container" />
    </div>
  );
}
