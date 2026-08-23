import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayerKey } from './map/layerTypes';
// V-19/V-20: Datenalter statt Abrufzeit + Sichtbarkeit des Warm-Manifests.
import { dataAgeText, isStale, oldestRef, ageText, type DataRef } from './dataAge';
import { getManifestHealth, subscribeManifestHealth, type ManifestHealth } from './sources/manifestHealth';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Location, Country } from './types';
import { WindLayer } from './wind/WindLayer';
import { GLOBE_PARTICLE_RAMP as PARTICLE_RAMP } from './wind/particlePreset';
import type { DwdForecastResult } from './wind/brightSkySource';
import type { ScalarGridResult } from './wind/openMeteoSource';
import { ScalarLayer, temperatureRamp } from './scalar/ScalarLayer';
import { RainLayer, precipRainRamp } from './scalar/RainLayer';
import { CloudLayer } from './scalar/CloudLayer';
import { loadFusedForecast, type ModelChoice } from './fusion/loadFusedForecast';
import {
  initialModelSourceState, isFusionCapable, resolveModel, activeModelId,
  setGlobalSource, setLayerOverride, clearLayerOverride,
  setActiveCountry, setCountryModel, clearCountryModel, toggleRadar, setRadar,
  resolvePointSource, setPointSource,
  type ModelSource, type ModelSourceState,
} from './fusion/modelSource';
import { modelEntry, isWhitelisted, RADAR_SOURCE, type ModelId } from './fusion/modelCatalog';
import { lerpFrameImage } from './fusion/frameInterp';
import { COUNTRY_PROFILES, DACH_VIEW } from './countryProfiles';
import { loadDachMask } from './countryMask';
import { PointForecastPanel, type PointForecastView } from './pointForecast/PointForecastPanel';
import { DACH_CITIES, TemperatureSampler, minZoomForRank, saveTempLabelCache, loadTempLabelCache, tempLabelColor, type TemperatureSamplerOptions, type City } from './temperatureLabels';
import { LayerIcon } from './components/LayerIcon';
import { LayerInfoPanel } from './components/LayerInfoPanel';
import { useMediaQuery } from './mobile/useIsMobile';
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
import { fetchIconD2Precip, resolveLatestRun, type IconD2Precip } from './sources/iconD2Precip';
// Wolken: DWD ICON-D2 Bewölkungsgrad (CLCT) als Gitter, 0–27 h, gleiche
// GRIB2-Pipeline wie der Niederschlag.
import { fetchIconD2CloudStack, type IconD2CloudStack } from './sources/iconD2Clouds';
import { fetchIconD2Wind, windFrameAtValidTimeAsync, loadWindNowCache, saveWindNowCache, type IconD2Wind } from './wind/iconD2WindSource';
import { frameAtValidTime, bracketAtValidTime } from './sources/frameAtValidTime';
import { sampleTempAt, sampleGustAt, sampleWindAt, sampleCloudsAt, sampleDemAt } from './qa/layerSampler';
import { runLayerQA, runSnowlineQA, type SampleApi } from './qa/layerQA';
import { fetchIconEuPressureWind, WIND_PRESSURE_LEVELS, type WindPressureLevel } from './wind/iconEuPressureWind';
import { fetchIconD2Temp, fetchTempRunSpread, type IconD2Temp, type IconD2TempSpread } from './sources/iconD2TempSource';
import { fetchIconD2Gust, type IconD2Gust } from './sources/iconD2GustSource';
// Gewitterpotenzial (Feature F1): fusioniert cape_ml×cin_ml×lpi zu einem 0–100-
// Index — flächige Vorwarnung 0–12 h vor dem ersten Radarecho. Lazy beim Aktivieren.
import { fetchIconD2Thunder, type IconD2Thunder } from './sources/iconD2Thunder';
// Blitz-Vorhersage (Feature F2): ICON-D2 lpi_max als flächiges Blitz-RISIKO
// (Prognose 0–12 h) — NICHT die gemessenen Blitze der letzten Stunde. Lazy.
import { fetchIconD2Lpi, type IconD2Lpi } from './sources/iconD2Lpi';
import { fetchIconD2Snow, type IconD2Snow, type SnowMode } from './sources/iconD2Snow';
import { snowRamp } from './radar/precipPhase';
// Rotationspotenzial (Feature F5, Experten-Layer): fusioniert uh_max×uh_max_low×sdi_2
// zu einem geglätteten 0–100-VERDACHTS-Score für rotierende Aufwinde/Superzellen
// (0–12 h). Modell-Verdacht, kein Warnprodukt (§0). Lazy beim Aktivieren.
import { fetchIconD2Rotation, type IconD2Rotation } from './sources/iconD2Rotation';
// Zellbahnen (Phase Z1, E3): DWD KONRAD3D — amtlich erkannte Konvektionszellen
// mit amtlicher Zugspur und amtlicher Unsicherheitsellipse. Lazy beim Aktivieren,
// Polling nur bei aktivem Layer UND sichtbarem Tab (~0,6 MB je 5 min).
import { fetchKonrad3d, KONRAD3D_ATTRIBUTION, KONRAD3D_HAIL_ATTRIBUTION } from './sources/dwdKonrad3d';
import {
  buildCellFeatures, cellFeatureCounts, cellLocationRelevance, cellRelevanceText,
  CELL_TIME_MARK_LEADS, type CellFeatureProperties,
} from './radar/cellPolygons';
import type { Konrad3dRun } from './radar/konrad3d';
// Hagel (Phase HA1): CH = MeteoSchweiz MESHS/POH (amtliche Korngröße bzw.
// Wahrscheinlichkeit), DE = KONRAD3D-Zellen mit Hagelsignal. AT hat keine offene
// Quelle — das sagt der Layer ausdrücklich (audit/hagel.md §7).
import {
  fetchSwissHail, isSwissHailSeason, METEOSWISS_HAIL_ATTRIBUTION, type HailProduct,
} from './sources/meteoSwissHail';
import {
  buildHailCellFeatures, hailRasterToRGBA, hailLegendEnds, stopsFor, meshsLabel, pohLabel,
  type HailCellProperties,
} from './radar/hailField';
// Amtliche Wetterwarnungen (Phase W1): DWD CAP 1.2, Landkreis-Vollstand. Der
// EINZIGE Layer, der ein amtliches Warnprodukt IST — alle anderen verweisen
// darauf. Texte werden zitiert, nie umformuliert (audit/wetterwarnungen.md §0).
import { fetchDwdWarnings, DWD_WARNINGS_ATTRIBUTION, type WarnRun } from './sources/dwdCapAlerts';
// Schweizer Hälfte desselben Layers (Phase W2): MeteoSchweiz über MeteoAlarm.
// Eigene Quelle, eigener Ausfall, eigene Farbherkunft — bewusst NICHT mit dem
// DWD-Pfad verschmolzen (audit/warnungen-at-ch.md §8).
import { fetchChWarnings, CH_WARNINGS_ATTRIBUTION, type ChWarnRun } from './sources/meteoAlarmCh';
import {
  buildWarnFeaturesMulti, warnSummaryMulti, WARN_SOURCE_DE, WARN_SOURCE_CH,
  type WarnFeatureProperties, type WarnSummaryTier, type WarnSourceMeta,
} from './warnings/warnField';
import { warningsSourceFor } from './officialSources';
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
import { precipCompositeReady, precipRadarHorizonHours, type PrecipAvailability } from './nowcast/precipSource';
import {
  fetchDachStations,
  fetchDwdStationLive,
  type StationFeatureProps as StationFeatureProperties,
  type StationsFeatureCollection,
} from './sources/dachStations';
import { FeatureRail, type RailFeature } from './nav/featureRail';
import './MapView.css';
// Command-Deck der Kartenseite (references/*-karte.png): Topbar · Ink-Rail ·
// Layer-Dock · dunkle Bühne · rechtes Panel · Modellseite · Mobile-Bottom-Bar.
import ModelLibraryOverlay from './map/ModelLibraryOverlay';
import SevenDayForecast from './map/SevenDayForecast';
import { nativeComposition } from './map/ModelSwitcher';
import {
  IcoLayers, IcoGlobe, IcoTrend, IcoSearch, IcoGauge,
  IcoRows, IcoArrowRight, IcoPlay, IcoPause, IcoPlus, IcoMinus,
} from './map/deckIcons';
import { geocodeDACH } from './geocode';
import './map/mapDeck.css';

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
/**
 * Steckbrief einer KONRAD3D-Zelle (Klick auf den Schwerpunkt).
 *
 * Wortwahl ist hier **gate-blockierend** (D-19): „Zelle", „Hinweis auf Hagel in
 * der Zelle", „geschätzte Spitzenböe". NIE „Tornado", „Warnung", „Gefahr",
 * „Unwetter", „trifft". Amtliche Warnungen kommen aus dem Warn-Layer, nicht von
 * hier — der Hinweis darauf steht fest im Fuß des Steckbriefs.
 */
function renderCellPopup(p: CellFeatureProperties): string {
  const row = (label: string, value: string | null | undefined) =>
    value == null ? '' : `<div class="sp-row"><span class="sp-l">${label}</span><span class="sp-v">${value}</span></div>`;
  const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v);
  // Z2-6: EINE Zuggeschwindigkeit — die aus der gezeichneten Spur abgeleitete,
  // auf 5er gerundete Zahl (`displaySpeedKmh`, als Property mitgeliefert).
  // `cell_speed` bleibt geparst und im Verifier, beschriftet aber nicht mehr:
  // sonst widersprächen sich Zahl und gezeichnete Geometrie (Diagnose §2.5).
  const zug = n(p.trackSpeedKmh) != null
    ? `~${p.trackSpeedKmh} km/h${p.compass ? ` nach ${p.compass}` : ''}`
    : null;
  const top = n(p.echoTopM) != null
    ? `${(Math.round((p.echoTopM as number) / 100) / 10).toFixed(1).replace('.', ',')} km`
    : null;
  const dbz = n(p.dbzMax) != null ? `${Math.round(p.dbzMax as number)} dBZ` : null;
  const area = n(p.areaKm2) != null ? `${Math.round(p.areaKm2 as number)} km²` : null;
  const blitz = n(p.lightningRate) != null && (p.lightningRate as number) > 0
    ? `${Math.round(p.lightningRate as number)} / 5 min` : null;
  // Begleiterscheinungen: bewusst als HINWEIS formuliert, nicht als Zusage.
  const hints: string[] = [];
  if (n(p.hailFlag) != null && (p.hailFlag as number) > 0) {
    hints.push((p.hailFlag as number) >= 2 ? 'Hinweis auf größeren Hagel in der Zelle' : 'Hinweis auf Hagel in der Zelle');
  }
  if (n(p.gustFlag) != null && (p.gustFlag as number) > 0) {
    hints.push(n(p.gustKmh) != null
      ? `Hinweis auf Böen — geschätzte Spitze ~${Math.round(p.gustKmh as number)} km/h`
      : 'Hinweis auf Böen in der Zelle');
  }
  if (n(p.heavyRainFlag) != null && (p.heavyRainFlag as number) > 0 && n(p.heavyRainMm) != null) {
    hints.push(`Hinweis auf Starkregen — ~${Math.round(p.heavyRainMm as number)} mm${
      n(p.heavyRainMinutes) != null ? ` in ~${Math.round(p.heavyRainMinutes as number)} min` : ''}`);
  }
  if (n(p.mesocyclones) != null && (p.mesocyclones as number) > 0) {
    hints.push('rotierende Struktur in der Zelle erkannt');
  }
  const hintBlock = hints.length
    ? `<div class="sp-row" style="display:block;line-height:1.35;">${hints.map((h) => `⚑ ${escapeHtml(h)}`).join('<br>')}</div>`
    : '';
  const stamp = n(p.refMs) != null
    ? `Messzeit ${new Date(p.refMs as number).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
    : '';
  return `
    <div class="sp">
      <div class="sp-name">${escapeHtml(p.headline ?? `Zelle ${p.id}`)}</div>
      <div class="sp-meta">DWD KONRAD3D · Umriss gemessen, Spur prognostiziert (bis +${p.leadMinutes ?? 60} Min)</div>
      ${row('Zuggeschwindigkeit', zug)}
      ${row('Radarintensität', dbz)}
      ${row('Obergrenze (Echotop)', top)}
      ${row('Fläche', area)}
      ${row('Blitzrate', blitz)}
      ${hintBlock}
      <div class="sp-stamp">${stamp}${stamp ? ' · ' : ''}kein amtliches Warnprodukt — maßgeblich sind die DWD-Warnungen</div>
    </div>`;
}
// ---------------------------------------------------------------------------
// Zellbahnen · Phase Z2 — Sprites für Pfeilkopf und Zeitmarken.
//
// Programmatisch aus einem Canvas, kein externes Asset und KEINE Glyphenquelle
// (Muster `RouteMap.tsx:363`, Vorgabe `docs/zuglinien-radar-spec.md` §10.5).
// Beide tragen bewusst die OPTIK DER PROGNOSE (Z2-E1): der Pfeil ist eine
// hohle Kontur statt eines Vollkörpers, die Zeitmarke hat einen gestrichelten
// Rand. Nichts Prognostiziertes darf solider wirken als die gestrichelte Spur,
// an der es hängt.
// ---------------------------------------------------------------------------
const CELLS_SPRITE_INK = '#2C2A26';   // --ink-900
const CELLS_SPRITE_CREAM = '#FAF6EA'; // --cream-50

/** Hohler Chevron, Spitze nach Norden — `icon-rotate` dreht ihn auf die Peilung. */
function makeCellArrowImage(): ImageData | null {
  if (typeof document === 'undefined') return null;
  const S = 44;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.translate(S / 2, S / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const chevron = () => {
    ctx.beginPath();
    ctx.moveTo(-10, 6);
    ctx.lineTo(0, -9);
    ctx.lineTo(10, 6);
  };
  // Dunkle Fassung zuerst, damit die helle Kontur auf der hellen Trichterfläche
  // wie auf der dunklen Kartenbühne gleichermaßen liest.
  chevron(); ctx.lineWidth = 6; ctx.strokeStyle = CELLS_SPRITE_INK; ctx.stroke();
  chevron(); ctx.lineWidth = 3; ctx.strokeStyle = CELLS_SPRITE_CREAM; ctx.stroke();
  return ctx.getImageData(0, 0, S, S);
}

/** Zeitmarke „15"/„30"/„60" als Pille mit gestricheltem Rand (= prognostiziert). */
function makeCellMarkImage(label: string): ImageData | null {
  if (typeof document === 'undefined') return null;
  const W = 52, H = 34;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const r = 12, pad = 3;
  const pill = () => {
    ctx.beginPath();
    ctx.roundRect(pad, pad, W - 2 * pad, H - 2 * pad, r);
  };
  pill();
  ctx.fillStyle = 'rgba(44,42,38,0.86)';
  ctx.fill();
  pill();
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = CELLS_SPRITE_CREAM;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '700 17px "League Spartan", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = CELLS_SPRITE_CREAM;
  ctx.fillText(label, W / 2, H / 2 + 1);
  return ctx.getImageData(0, 0, W, H);
}

/**
 * Steckbrief einer Hagelzelle (DE, KONRAD3D). Wortwahl nach D-19: „Radar erkennt
 * Hagel", „Hinweis auf Großhagel" — nie „es hagelt", nie Warnsprache.
 */
function renderHailPopup(p: HailCellProperties): string {
  const row = (label: string, value: string | null) =>
    value == null ? '' : `<div class="sp-row"><span class="sp-l">${label}</span><span class="sp-v">${value}</span></div>`;
  const km2 = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) && v > 0 ? `${Math.round(v)} km²` : null;
  const top = p.echoTopHail != null && Number.isFinite(p.echoTopHail)
    ? `${(Math.round(p.echoTopHail / 100) / 10).toFixed(1).replace('.', ',')} km` : null;
  const dbz = p.dbzMax != null && Number.isFinite(p.dbzMax) ? `${Math.round(p.dbzMax)} dBZ` : null;
  const stamp = p.refMs != null && Number.isFinite(p.refMs)
    ? `Messzeit ${new Date(p.refMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : '';
  return `
    <div class="sp">
      <div class="sp-name">${escapeHtml(p.headline ?? `Zelle ${p.id}`)}</div>
      <div class="sp-meta">DWD KONRAD3D · Radarerkennung, keine Bodenmeldung</div>
      ${row('Hagelfläche', km2(p.areaHail))}
      ${row('davon Großhagel', km2(p.areaLargeHail))}
      ${row('Hagel-Obergrenze', top)}
      ${row('Radarintensität', dbz)}
      <div class="sp-stamp">${stamp}${stamp ? ' · ' : ''}kein amtliches Warnprodukt — maßgeblich sind die DWD-Warnungen</div>
    </div>`;
}
/**
 * Steckbrief der amtlichen Warnungen an einem Kartenpunkt (Phase W1).
 *
 * Anders als alle übrigen Popups formuliert dieser **nichts** selbst: Überschrift,
 * Beschreibung und Handlungshinweis stehen wortwörtlich so da, wie der DWD sie
 * ausgegeben hat (`audit/wetterwarnungen.md` §0/§7.1). Ergänzt werden nur
 * Metadaten, die die Meldung selbst mitbringt — Gültigkeit, Höhenband, Gebiet,
 * ausgebende Stelle, Lizenz.
 *
 * `props` enthält ALLE Warnungen am Klickpunkt (höchste Stufe zuerst); eine
 * verdeckte Warnung wäre ein Ehrlichkeitsdefekt (§5.5).
 */
function renderWarnPopup(props: WarnFeatureProperties[]): string {
  const block = (p: WarnFeatureProperties) => {
    const row = (label: string, value: string) =>
      !value ? '' : `<div class="sp-row"><span class="sp-l">${label}</span><span class="sp-v">${escapeHtml(value)}</span></div>`;
    const para = (text: string) =>
      !text ? '' : `<div class="sp-row" style="display:block;line-height:1.4;">${escapeHtml(text).replace(/\n+/g, '<br>')}</div>`;
    return `
      <div class="sp-warn-item">
        <div class="sp-name" style="display:flex;align-items:center;gap:6px;">
          <i style="flex:0 0 auto;width:10px;height:10px;border-radius:2px;background:${escapeHtml(p.color)};border:1px solid rgba(0,0,0,.35);"></i>
          ${escapeHtml(p.headline)}
        </div>
        <div class="sp-meta">${escapeHtml(p.areaDesc)} · ${escapeHtml(p.severityLabel)} · ${escapeHtml(p.senderName)}</div>
        ${row('Gültig', p.validity)}
        ${p.heightNote ? row('Höhe', p.heightNote) : ''}
        ${row('Details', p.details)}
        ${para(p.description)}
        ${para(p.instruction)}
        ${p.languageNote ? `<div class="sp-row" style="display:block;opacity:.8;">${escapeHtml(p.languageNote)}</div>` : ''}
      </div>`;
  };
  const stand = props[0]?.sentMs != null
    ? `Ausgegeben ${new Date(props[0].sentMs as number).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr · `
    : '';
  const license = props.find((p) => p.license)?.license ?? '';
  // Wer gewarnt hat, steht an der Meldung — nicht als feste Zeile. Am selben
  // Klickpunkt können (an der Grenze) Meldungen zweier Dienste liegen.
  const issuers = [...new Set(props.map((p) => p.issuer))];
  const who = issuers.length === 1
    ? `amtliche Warnung — ${escapeHtml(issuers[0])}, Text unverändert übernommen`
    : `amtliche Warnungen — ${escapeHtml(issuers.join(' und '))}, Texte unverändert übernommen`;
  // Die Schweizer Flächenfarbe ist aus der amtlichen Stufe ABGELEITET (der Feed
  // führt kein AREA_COLOR). Das gehört an die Fläche, nicht in eine Fußnote.
  const derived = props.some((p) => p.colorOrigin === 'derived')
    ? ' · Farbe aus der amtlichen Gefahrenstufe abgeleitet'
    : '';
  return `
    <div class="sp sp-warn">
      ${props.map(block).join('<div class="sp-warn-sep"></div>')}
      <div class="sp-stamp">${stand}${who}${derived}${
        license ? ` · ${escapeHtml(license)}` : ''}</div>
    </div>`;
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;');
}

const FORECAST_REFRESH_MS = 60 * 60 * 1000; // refresh forecast hourly
const FORECAST_HOURS = 24;

/**
 * TESTMODUS „Nur-Jetzt-Start" (Jans Vorgabe, 2026-07-23): Beim Start der
 * Kartenseite laden AUSSCHLIESSLICH die Jetzt-Frames von Wind + Temperatur —
 * kein Fusion-/MOSMIX-Forecast, keine Zukunftsstunden (→ kein Zeit-Deck),
 * kein Punktforecast-/7-Tage-Abruf. Layer, die der Nutzer danach aktiviert,
 * laden weiterhin normal. Eingebetteter Modus (Event-Tagesablauf) ist
 * ausgenommen. Abschaltbar per `?startnow=0` (Flag-Konvention wie `fusion2d`).
 *
 * Vorhersagefenster (2026-07-23, Jans Folge-Vorgabe): Der Slider ist wieder
 * eingeblendet und deckt „jetzt" … `NOWONLY_AHEAD_H` Stunden ab. Die
 * Forecast-Frames werden NICHT eager geladen, sondern erst wenn der Nutzer den
 * Slider bewegt — und dann nur für die aktuell aktiven Grid-Layer.
 */
const NOWONLY_AHEAD_H = 2;
const START_NOW_ONLY = (() => {
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('startnow');
      if (q === '0' || q === 'off') return false;
    }
  } catch { /* SSR → Default */ }
  return true;
})();
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
// Zellbahnen (Phase Z1, E3) — DWD KONRAD3D als native GeoJSON-Vektoren:
// amtlicher Unsicherheits-Trichter (fill), beobachteter Zellumriss (fill+line),
// Prognosespur (gestrichelte line) und Schwerpunkt (circle, Klickziel).
//
// Bewusst OHNE `text-field`: die Glyphen des Basemap-Stils kommen von einem
// Fremd-CDN (`tiles.openfreemap.org/fonts/…`), auf das wir uns nicht verlassen.
// (Die Z1-Notiz „garantiert keine Glyphen" war zu absolut — der Stil LÄDT
// welche; die Regel bleibt, ihre Begründung ist korrigiert.) Phase Z2
// ergänzt `symbol`-Layer mit `icon-image` — die brauchen KEINE Glyphenquelle,
// weil die Sprites per `map.addImage()` aus einem Canvas registriert werden
// (Muster `RouteMap.tsx:363`, so vorgesehen in `docs/zuglinien-radar-spec.md`
// §10.5). Jans Entscheidung S-Z2-1 vom 2026-08-07; der glyphenfreie Rückfallweg
// bleibt in `audit/zellbahnen-karte.md` §3 dokumentiert.
const CELLS_SOURCE_ID = 'storm-cells';
const CELLS_CONE_LAYER_ID = 'storm-cells-cone';
const CELLS_CONE_STEP_LAYER_ID = 'storm-cells-cone-step';
const CELLS_HULL_LAYER_ID = 'storm-cells-hull';
const CELLS_HULL_LINE_ID = 'storm-cells-hull-line';
const CELLS_PATH_LAYER_ID = 'storm-cells-path';
const CELLS_MARK_LAYER_ID = 'storm-cells-mark';
const CELLS_ARROW_LAYER_ID = 'storm-cells-arrow';
const CELLS_DOT_LAYER_ID = 'storm-cells-dot';
/** Alle Zell-Layer in Zeichenreihenfolge (unten → oben). */
const CELLS_LAYER_IDS = [
  CELLS_CONE_LAYER_ID, CELLS_CONE_STEP_LAYER_ID, CELLS_HULL_LAYER_ID, CELLS_HULL_LINE_ID,
  CELLS_PATH_LAYER_ID, CELLS_MARK_LAYER_ID, CELLS_ARROW_LAYER_ID, CELLS_DOT_LAYER_ID,
] as const;
/** Sprite-IDs der Z2-Symbole (per `map.addImage` aus einem Canvas). */
const CELLS_ARROW_IMAGE_ID = 'storm-cells-arrow-sprite';
const cellsMarkImageId = (leadMin: number) => `storm-cells-mark-${leadMin}`;
/** Ausdünnung (Z2-5) — ausschließlich native Mittel, kein JS im Repaint.
 *  Ausgedünnt wird NUR Zusatzgeometrie; Umriss, Umrisslinie und Punkt sind
 *  ausgenommen (Funktionserhalt). Was entfällt, wird geloggt, nicht verschwiegen. */
const CELLS_CONE_STEP_MINZOOM = 6;
const CELLS_MARK_MINZOOM = 8;
const CELLS_ARROW_MINZOOM = 5;
/** Trichterstufen erst ab dieser Severity — unterhalb bleibt die Z1-Hülle stehen.
 *  Schwelle an der gemessenen Verteilung gesetzt (Fixture: 0,77 / 0,19 / 0,17). */
const CELLS_CONE_STEP_MIN_SEV = 0.5;
/** Prognosehorizont der Zellbahnen (min) — jenseits davon ist der Layer AUS,
 *  statt eine Zelle zu zeigen, die für die eingestellte Stunde nichts aussagt
 *  (D-14-Muster: lieber nichts als eine unbelegte Verlängerung). */
const CELLS_HORIZON_MIN = 60;
/** Abrufabstand (ms) — KONRAD3D erscheint alle 5 min, ~0,6 MB je Datei. */
const CELLS_POLL_MS = 5 * 60_000;
/** Farbe nach severity_decimal (0…3): Sand → Amber → Terracotta → Bordeaux. */
const CELLS_SEVERITY_COLOR: ExpressionSpecification = [
  'interpolate', ['linear'], ['coalesce', ['get', 'sev'], 0],
  0, '#c9a227',
  1, '#e08a2e',
  2, '#c9522e',
  3, '#8f2140',
];
// Hagel (Phase HA1, `audit/hagel.md`) — zwei belegte Quellen, bewusst getrennt
// gehalten und nie ineinander interpoliert (D-04):
//   CH: MeteoSchweiz MESHS (mm) / POH (0…1) als MapLibre-`image`-Source. Die
//       Source nimmt vier Eckkoordinaten und warpt selbst — das `somerc`-Gitter
//       ist ein Trapez in lon/lat, eine achsparallele Box läge zweistellige km
//       daneben. Zugleich bleibt so die Shader-/WebGL-STOPP-Zone unberührt.
//   DE: KONRAD3D-Zellen mit `hail_flag > 0` als GeoJSON-Fläche.
const HAIL_CH_SOURCE_ID = 'hail-ch';
const HAIL_CH_LAYER_ID = 'hail-ch-raster';
const HAIL_DE_SOURCE_ID = 'hail-de-cells';
const HAIL_DE_FILL_ID = 'hail-de-fill';
const HAIL_DE_LINE_ID = 'hail-de-line';
const HAIL_DE_DOT_ID = 'hail-de-dot';
/** Alle Hagel-Layer in Zeichenreihenfolge (unten → oben). */
const HAIL_LAYER_IDS = [HAIL_CH_LAYER_ID, HAIL_DE_FILL_ID, HAIL_DE_LINE_ID, HAIL_DE_DOT_ID] as const;
/** Abrufabstand (ms) — beide Quellen publizieren im 5-Minuten-Takt. */
const HAIL_POLL_MS = 5 * 60_000;
/** Umschalter der CH-Produkte (analog SAT_PRODUCT / SNOW_MODES). */
const HAIL_PRODUCTS: HailProduct[] = ['meshs', 'poh'];
const HAIL_PRODUCT_LABELS: Record<HailProduct, string> = {
  meshs: 'Korngröße',
  poh: 'Chance',
};
const HAIL_PRODUCT_FULL_LABELS: Record<HailProduct, string> = {
  meshs: 'MESHS — maximal erwartete Hagelkorngröße (cm), MeteoSchweiz, nur CH',
  poh: 'POH — Hagelwahrscheinlichkeit (%), MeteoSchweiz, nur CH',
};
/** DE-Zellfarbe: Stufe 1 = Hagel (Eisblau), Stufe 2 / Großhagel = Violett. */
const HAIL_CELL_COLOR: ExpressionSpecification = [
  'case', ['>=', ['coalesce', ['get', 'flag'], 1], 2], '#8c2d78', '#3f8fb5',
];
// Amtliche Wetterwarnungen (Phase W1, `audit/wetterwarnungen.md`) — DWD CAP 1.2,
// Landkreis-Vollstand. Zwei native GeoJSON-Layer: Fläche + Umriss. Die Farbe
// kommt AUS DER MELDUNG (`AREA_COLOR`), nicht aus einer eigenen Palette; deshalb
// steht hier keine Farbrampe, sondern nur `['get','color']`.
const WARN_SOURCE_ID = 'dwd-warnings';
const WARN_FILL_ID = 'dwd-warnings-fill';
const WARN_LINE_ID = 'dwd-warnings-line';
/** Zeichenreihenfolge (unten → oben). */
const WARN_LAYER_IDS = [WARN_FILL_ID, WARN_LINE_ID] as const;
/** Abrufabstand (ms). Der Vollstand wird alle ~5 min neu geschrieben; ~110 KB. */
const WARN_POLL_MS = 5 * 60_000;
// Flow-Nowcast — eigener RainLayer für die advehierten Radar-Frames.
const FLOW_NOWCAST_LAYER_ID = 'flow-nowcast-layer';
/** RADOLAN ~1100×1200 → ~140×150 für Flussschätzung + Advektion. */
const FLOW_FACTOR = 8;
/** Zeitabstand der beiden Eingabe-Frames (RADOLAN-RV-Schritt), Minuten. */
const FLOW_INTERVAL_MIN = 5;
// Regenwahrscheinlichkeit (PoP) — kalibriertes Ensemble-Produkt als ScalarLayer.
const POP_LAYER_ID = 'pop-layer';
// Gewitterpotenzial (Feature F1) — fusionierter CAPE×CIN×LPI-Index als ScalarLayer.
const THUNDER_LAYER_ID = 'thunder-potential';
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
/** Gewitterpotenzial-Farbrampe (Feature F1; t = Score/100 = 0..100). Fünfstufig
 *  nach `thunderLevelOf`: unterhalb ~Score 8 transparent (keine Lage nicht
 *  einfärben — via `visRange`), dann Gelb (gering) → Amber (erhöht) → Orange
 *  (deutlich) → Rot (hoch) → Magenta (extrem). Stützpunkte = Stufenschwellen
 *  8/30/55/78/100 auf der 0..1-Achse. */
const thunderRamp: Record<number, string> = {
  0.0:  'rgb(247,236,140)', // Score 0 — (durch visRange ausgeblendet)
  0.08: 'rgb(247,224,88)',  // Score 8  — gering (Gelb)
  0.30: 'rgb(245,182,66)',  // Score 30 — erhöht (Amber)
  0.55: 'rgb(238,124,44)',  // Score 55 — deutlich (Orange)
  0.78: 'rgb(206,52,52)',   // Score 78 — hoch (Rot)
  1.0:  'rgb(150,30,110)',  // Score 100 — extrem (Magenta)
};
// Blitz-Vorhersage (Feature F2) — ICON-D2 lpi_max als Blitz-RISIKO-Raster (0–12 h).
const LIGHTNINGFC_LAYER_ID = 'lightning-forecast';
/** Blitz-Vorhersage-Farbrampe (Feature F2; t = lpi/LPI_VMAX = 0..30 J/kg).
 *  Fünfstufig nach `lpiLevelOf`: transparent unter ~1 J/kg (ruhige Zellen nicht
 *  einfärben — via `visRange`), dann Gelb (gering) → Amber (erhöht) → Rot-Orange
 *  (hoch) → Magenta (sehr hoch) → Elektrik-Violett (extrem). BEWUSST violett-
 *  forciert und damit klar getrennt (a) vom gemessenen „Blitze"-Layer (Sferics-
 *  Bolt, amber) und (b) — bei Überlappung — von der Gewitter-Rampe (endet
 *  magenta 150,30,110), damit Beobachtung vs. Prognose vs. Fusion optisch
 *  unterscheidbar bleiben. Stützpunkte = J/kg-Bänder 1/3/8/15/30 auf der
 *  0..1-Achse (÷30). */
const lpiRamp: Record<number, string> = {
  0.0:   'rgba(255,238,120,0)', // 0 J/kg — (durch visRange ausgeblendet)
  0.033: 'rgb(255,238,120)',    // 1 J/kg  — gering (Gelb)
  0.10:  'rgb(255,176,48)',     // 3 J/kg  — erhöht (Amber)
  0.267: 'rgb(240,86,60)',      // 8 J/kg  — hoch (Rot-Orange)
  0.5:   'rgb(214,40,120)',     // 15 J/kg — sehr hoch (Magenta)
  1.0:   'rgb(150,40,200)',     // 30 J/kg — extrem (Elektrik-Violett)
};
// Schnee (Feature F4) — ICON-D2 Schneemenge als Fläche (cm) in zwei Modi:
// „Schneedecke" (h_snow, instantan, t+0) und „Neuschnee" (snow_gsp+snow_con →
// SWE→cm, akkumuliert, minStepHours=1). Schnee-Palette (snowRamp), klar von der
// Regen-Palette getrennt. NICHT die Schneegrenzen-Linie (das ist `snowline`).
// Standardmäßig inaktiv, lazy geladen; Modus-Wechsel lädt das andere Feld lazy nach.
const SNOW_LAYER_ID = 'snow-amount';
/** Sichtbarkeits-Fade (t = cm/VMAX) je Modus: < ~1 cm transparent, „kein Schnee"
 *  nicht einfärben. Schneedecke VMAX 150 cm → 1 cm ≈ t 0,007; Neuschnee VMAX 50 cm
 *  → 1 cm = t 0,02. Wird beim Daten-Setzen modusabhängig gesetzt. */
const SNOW_VIS_RANGE: Record<SnowMode, { start: number; end: number }> = {
  depth: { start: 0.007, end: 0.02 },
  fresh: { start: 0.02, end: 0.05 },
};
// Rotationspotenzial (Feature F5) — ICON-D2 uh_max×uh_max_low×sdi_2, geglättet zu
// einem 0–100-VERDACHTS-Score für rotierende Aufwinde/Superzellen. EXPERTEN-Layer,
// Modell-Verdacht (kein Warnprodukt, §0). Eigene, NÜCHTERNE Violett/Indigo-Palette,
// bewusst DESATURIERT — klar getrennt von Regen/Radar, von der Gewitter-Rampe
// (endet Magenta 150,30,110) und der neonhaften Blitzprognose-Rampe (Elektrik-
// Violett 150,40,200). Standardmäßig inaktiv, lazy geladen.
const ROTATION_LAYER_ID = 'rotation-potential';
/** Rotationspotenzial-Farbrampe (Feature F5; t = Score/100 = 0..100). Stufen nach
 *  `levelOf`: unter ~Score 20 transparent (großzügige Aktivierungsschwelle, §0.4 —
 *  lieber Under- als Over-Paint), dann gedämpftes Lavendel (gering) → staubiges
 *  Violett (erhöht) → Pflaume (deutlich) → tiefes Indigo (hoch) → fast-schwarzes
 *  Purpur (extrem). Sober, nicht reißerisch. Stützpunkte = Stufenschwellen
 *  20/40/60/80/100 auf der 0..1-Achse. */
const rotationRamp: Record<number, string> = {
  0.0:  'rgba(150,140,175,0)', // Score 0 — (durch visRange ausgeblendet)
  0.20: 'rgba(158,148,180,0.55)', // Score 20 — gering (gedämpftes Lavendel)
  0.40: 'rgb(130,112,168)',   // Score 40 — erhöht (staubiges Violett)
  0.60: 'rgb(104,80,148)',    // Score 60 — deutlich (Pflaume)
  0.80: 'rgb(78,52,116)',     // Score 80 — hoch (tiefes Indigo)
  1.0:  'rgb(52,32,80)',      // Score 100 — extrem (fast-schwarzes Purpur)
};
// Radar-/Nowcast-Horizonte je Land (DE 2 h · AT 3 h · CH 0,5 h) leben jetzt zentral
// in src/nowcast/precipSource.ts (RADAR_HORIZON_H) und src/scalar/precipComposite.ts.

// `LayerKey` wohnt seit Phase WB1 in `src/map/layerTypes.ts` (reine Verschiebung,
// Werte und Reihenfolge unverändert). Der Re-Export hält alle bestehenden
// Importpfade gültig — `App.tsx`, `mapState.ts`, `event/EventResult.tsx`,
// `components/LayerIcon.tsx`, `components/LayerInfoPanel.tsx` importieren
// weiterhin aus `MapView`. Begründung: `audit/waldbrand-geruest.md` §2.
// Der Import daneben ist nötig, weil ein reiner `export … from` den Namen NICHT
// in den lokalen Scope holt — und diese Datei benutzt `LayerKey` selbst.
export type { LayerKey };

/** Features, zu denen die Deck-Rail/Bottom-Bar navigiert (App.tsx → onOpenFeature). */
// Seit die Kartenseite die gemeinsame FeatureRail nutzt, kann sie zu ALLEN
// Werkzeugen navigieren — nicht mehr nur zu Nowcast/Forecast/Event.
export type MapDeckFeature = RailFeature;

/** Router (RT1): Kamera der Karte — Mitte + Zoom (Query `lat`/`lon`/`z`). */
export interface MapCameraView { lat: number; lon: number; zoom: number }
/** Router (RT1): Startwerte des Modell-Switchers aus der Query (`land`, `modell`, `mode`, `radar`). */
export interface MapModelInit { country?: Country | null; model?: string | null; point?: ModelSource; radar?: boolean }

/** Query-Werte über die BESTEHENDEN Reducer anwenden (Whitelist-gated, ungültige Werte verfallen still). */
function applyModelSourceInit(s: ModelSourceState, init?: MapModelInit | null): ModelSourceState {
  if (!init) return s;
  let n = s;
  if (init.country) n = setActiveCountry(n, init.country);
  if (init.model && isWhitelisted(init.model)) n = setCountryModel(n, n.country, init.model);
  else if (init.model === null) n = clearCountryModel(n, n.country);
  if (init.point) n = setPointSource(n, init.point);
  if (typeof init.radar === 'boolean') n = setRadar(n, init.radar);
  return n;
}

interface Props {
  location: Location;
  onBack?: () => void;
  /** Rail-/Bottom-Bar-Navigation zu anderen Werkzeugen (App.tsx-View-Routing). */
  onOpenFeature?: (id: MapDeckFeature) => void;
  /** Ortssuche im Deck-Kopf: gewählten Ort als neue Karten-Location setzen. */
  onSelectLocation?: (l: Location) => void;
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
  // --- Router (Phase RT1) — alle additiv, MapView bleibt router-agnostisch ---------
  /** Extern gesteuertes Layer-Set (URL). Wird nur gespiegelt, wenn es sich vom
   *  internen Set unterscheidet (Muster `embeddedLayer`) — schleifenfrei. */
  routeLayers?: readonly LayerKey[];
  /** Nutzer hat Layer umgeschaltet: neues Set + der eingeschaltete Layer (null = ausgeschaltet). */
  onLayersChange?: (layers: LayerKey[], added: LayerKey | null) => void;
  /** Slider-Stunde von außen (nur Zurück/Vorwärts); undefined = nicht steuern. */
  routeHour?: number;
  onHourChange?: (hour: number) => void;
  /** Startkamera (überstimmt DACH-Fit/Default); danach führt die Karte. */
  initialView?: MapCameraView | null;
  onViewChange?: (view: MapCameraView) => void;
  initialModelSource?: MapModelInit | null;
  /** Modellquelle von außen (nur Zurück/Vorwärts). */
  routeModelSource?: MapModelInit;
  onModelSourceChange?: (state: ModelSourceState) => void;
}

const LAYER_OPTIONS: { key: LayerKey; label: string; title: string }[] = [
  { key: 'wind', label: 'Wind', title: 'Wind (DWD ICON-D2 u/v 10m · 2,2 km)' },
  { key: 'gust', label: 'Böen', title: 'Windböen — Spitzen (DWD ICON-D2 vmax_10m · 2,2 km, 0–24 h). Sicherheitsrelevant für Drohne, Kran, Höhenarbeit (vgl. Go/No-Go).' },
  { key: 'nowcast', label: 'Niederschlag', title: 'Niederschlag · jetzt–2 h — gemessenes Landesradar/Nowcast, per Land bis zum Nowcast-Horizont (DE RADOLAN-RV bis 2 h · AT GeoSphere INCA bis 3 h · CH MeteoSchweiz). Bewusst kurz & ehrlich: nur die gemessene Nahbereichs-Vorhersage, keine Modell-Verlängerung.' },
  { key: 'snow', label: 'Schnee', title: 'Schneehöhe & Neuschnee — ICON-D2 h_snow (Schneedecke, aktuelle Höhe) + abgeleiteter Neuschnee-Zuwachs (snow_gsp+snow_con → cm), 2,2 km. Die Schnee-MENGE als Fläche (cm), NICHT die Schneegrenzen-Linie (das ist „Schneegrenze"). Modus im Layer umschaltbar. DACH.' },
  { key: 'temp', label: 'Temperatur', title: '2-m-Temperatur (DWD ICON-D2 t_2m · 2,2 km, höhenkorrigiert)' },
  { key: 'clouds', label: 'Wolken', title: 'Bewölkung – tief/mittel/hoch geschichtet (DWD ICON-D2, 2,2 km, 0–12 h) — über den Slider' },
  { key: 'sat', label: 'Satellit', title: 'Meteosat (DWD OpenData, alle 3 h)' },
  { key: 'thunder', label: 'Gewitter', title: 'Gewitterpotenzial — CAPE (Energie) × CIN (Deckel) × LPI (Blitzbereitschaft), ICON-D2 2,2 km, 0–12 h. Flächige Vorwarnung vor dem ersten Radarecho. DACH, near-NWP-Horizont. Potenzial ≠ Auslösung.' },
  { key: 'rotation', label: 'Rotation', title: 'Rotationspotenzial (Experten-Layer) — ICON-D2 Updraft-Helicity (uh_max + uh_max_low) + Supercell-Index (sdi_2), 2,2 km, 0–12 h, geglättet. Modell-VERDACHTSflächen für rotierende Gewitter (Superzellen: Großhagel, organisierte Schwergewitter). KEIN amtliches Warnprodukt, KEIN Warnersatz — maßgeblich sind die DWD-Warnungen. Verdacht ≠ Ereignis, hohe Fehlalarmrate. DACH.' },
  { key: 'hail', label: 'Hagel', title: 'Hagel — zwei amtliche Radarprodukte, bewusst nicht vermischt. FLÄCHE: MeteoSchweiz MESHS (maximal erwartete Korngröße in cm) bzw. POH (Hagelwahrscheinlichkeit in %), 1 km / 5 Min, nur 1. April–30. September — aus dem SCHWEIZER Radarverbund, dessen Reichweite über die Grenze nach Süddeutschland und Vorarlberg geht und dort ausdünnt. ZELLEN: DWD KONRAD3D — Zellen, in denen das Radar Hagel erkennt, mit Hagelfläche und Hinweis auf Großhagel, aus dem DEUTSCHEN Radarverbund (ebenfalls grenzüberschreitend). Österreich hat KEINE eigene offene Hagelquelle — im Osten Österreichs gibt es daher keine Abdeckung; das heißt NICHT, dass es dort nicht hagelt. Radarerkennung, keine Bodenmeldung. Kein amtliches Warnprodukt und kein Warnersatz.' },
  { key: 'cells', label: 'Zellbahnen', title: 'Zellbahnen — DWD KONRAD3D: erkannte konvektive Zellen mit AMTLICHER Zugspur und amtlichem Unsicherheits-Trichter (jetzt bis +60 Min, 5-Minuten-Takt). Umriss = gemessen, Spur/Trichter = prognostiziert. Kein amtliches Warnprodukt und kein Warnersatz — maßgeblich sind die DWD-Warnungen. Abdeckung = Reichweite des deutschen Radarverbunds (reicht über die Grenze, dünnt dort aus).' },
  { key: 'warnings', label: 'Warnungen', title: 'Amtliche Wetterwarnungen von DWD (Deutschland, CAP, landkreisgenau) und MeteoSchweiz (Schweiz, Warnregionen, über den MeteoAlarm-Feed) — alle 5 Minuten. Das AMTLICHE Warnprodukt: alle anderen Layer dieser Karte verweisen darauf. Überschrift, Beschreibung und Handlungshinweis werden wortwörtlich übernommen. Die Flächenfarbe ist für Deutschland die amtliche Warnfarbe aus der Meldung; der Schweizer Feed führt keine Farbe mit, dort ist sie aus der amtlichen Gefahrenstufe ABGELEITET. Warnstufen werden quellenrein geführt — die Stufennummern der beiden Dienste bedeuten Verschiedenes. Der Layer folgt dem Zeit-Slider: gezeigt wird, was zur eingestellten Stunde gilt. ÖSTERREICH fehlt weiterhin (geplant) — dort warnt GeoSphere Austria; eine leere Fläche über Österreich heißt NICHT „keine Warnung". Fällt eine der beiden Quellen aus, sagt die Karte ausdrücklich, welches Land fehlt. Kein Ersatz für die amtliche Bekanntmachung: maßgeblich bleiben dwd.de/warnungen und meteoschweiz.admin.ch.' },
  { key: 'lightning', label: 'Blitze', title: 'Blitzortung letzte 60 Min (DWD Sferics)' },
  { key: 'lightningfc', label: 'Blitzprognose', title: 'Blitz-Vorhersage — ICON-D2 Lightning Potential Index (lpi_max, 2,2 km, 0–12 h). Prognostiziertes Blitzrisiko über den Slider — NICHT die gemessenen Blitze der letzten Stunde (das ist der Layer „Blitze"). Prognose ≠ Messung. DACH, near-NWP-Horizont.' },
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
  'arome-at': 'arome', inca: 'inca', 'icon-d2-eps': 'icon-d2-eps',
  'icon-ch1-eps': 'icon-ch1-eps', 'icon-ch2-eps': 'icon-ch2-eps', 'arome-fr': 'arome-fr',
  'icon-eu': 'icon-eu', gfs: 'gfs', ifs: 'ifs', aifs: 'aifs', 'aifs-ens': 'aifs-ens',
  'icon-global': 'icon-global', aicon: 'aicon', arpege: 'arpege',
};

/** JS-Pendant zur Mobile-Media-Query in MapView.css — MUSS deckungsgleich
 *  bleiben, sonst weichen Render-Ort (JSX) und Darstellung (CSS) voneinander
 *  ab (z. B. Landscape 844×390). Steuert nur den Render-Ort des Punkt-
 *  Forecasts (Desktop-Panel vs. „Vorhersage"-Segment im Sheet). */
const MOBILE_MAP_MEDIA_QUERY = '(max-width: 767px), (max-height: 430px) and (orientation: landscape)';

const SAT_PRODUCT_LABELS: Record<SatelliteProduct, string> = {
  eu_rgb: 'EU',
  world_ir: 'Welt',
};
const SAT_PRODUCT_FULL_LABELS: Record<SatelliteProduct, string> = {
  eu_rgb: 'Europa RGB / IR',
  world_ir: 'Welt IR',
};

// Schnee-Modus-Umschalter (Feature F4) — analog SAT_PRODUCT: kurzer Chip-Text +
// voller Titel. „Schneedecke" = aktuelle Höhe (h_snow, t+0), „Neuschnee" = Zuwachs
// (snow_gsp akkumuliert, minStepHours=1).
const SNOW_MODES: SnowMode[] = ['depth', 'fresh'];
const SNOW_MODE_LABELS: Record<SnowMode, string> = {
  depth: 'Decke',
  fresh: 'Neuschnee',
};
const SNOW_MODE_FULL_LABELS: Record<SnowMode, string> = {
  depth: 'Schneedecke — aktuelle Schneehöhe (h_snow)',
  fresh: 'Neuschnee — Zuwachs über das Vorhersagefenster (snow_gsp)',
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

/** Ab dieser Zoomstufe bekommen auch die Orte der Basiskarte (Kleinstädte,
 *  Gemeinden, Dörfer) eine Temperatur — davor genügt die kuratierte Liste. */
const PLACE_LABEL_MIN_ZOOM = 8.2;
/** Obergrenze, damit dichte Regionen (Ruhrgebiet) das Bild nicht zupflastern. */
const PLACE_LABEL_MAX = 70;
/** Ortsklassen der Basiskarte, die beschriftet werden sollen — Rangfolge = Priorität. */
const PLACE_LABEL_CLASSES = ['city', 'town', 'village', 'suburb'];

interface PlaceLabel { key: string; name: string; lat: number; lng: number }

/**
 * Ortspunkte, die der Basemap-Stil im aktuellen Ausschnitt gerade beschriftet.
 * `queryRenderedFeatures` liefert genau das, was sichtbar ist — also greift die
 * Zoom- und Kollisionslogik des Stils, ohne dass wir sie nachbauen müssen.
 * `skip` filtert Orte, die schon aus DACH_CITIES gesetzt wurden (Doppelwerte).
 */
function visiblePlaceLabels(map: maplibregl.Map, skip: Set<string>): PlaceLabel[] {
  let feats: maplibregl.MapGeoJSONFeature[] = [];
  try {
    feats = map.queryRenderedFeatures(undefined, { filter: ['in', ['get', 'class'], ['literal', PLACE_LABEL_CLASSES]] })
      .filter((f) => f.sourceLayer === 'place' && f.geometry?.type === 'Point');
  } catch {
    return []; // Style noch nicht geladen o. Ä. — nächster moveend versucht es erneut.
  }
  const out: PlaceLabel[] = [];
  const seen = new Set<string>();
  // Nach Ortsklasse sortieren, damit bei Erreichen der Obergrenze die größeren
  // Orte gewinnen statt einer zufälligen Kachel-Reihenfolge.
  feats.sort((a, b) =>
    PLACE_LABEL_CLASSES.indexOf(String(a.properties?.class)) - PLACE_LABEL_CLASSES.indexOf(String(b.properties?.class)));
  for (const f of feats) {
    const p = f.properties ?? {};
    const name = String(p['name:de'] ?? p.name ?? '').trim();
    if (!name || skip.has(name)) continue;
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    const key = `place:${name}@${lng.toFixed(3)},${lat.toFixed(3)}`;
    if (seen.has(key) || skip.has(key)) continue;
    seen.add(key);
    out.push({ key, name, lat, lng });
    if (out.length >= PLACE_LABEL_MAX) break;
  }
  return out;
}

export default function MapView({
  location, onBack, onOpenFeature, onSelectLocation, embedded = false, initialActive, initialHour, embedHourRange, embeddedLayer, overview = false,
  routeLayers, onLayersChange, routeHour, onHourChange, initialView, onViewChange, initialModelSource, routeModelSource, onModelSourceChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  // Start-Layer: im Nur-Jetzt-Testmodus AUSSCHLIESSLICH Wind (Jans Vorgabe:
  // beim Start nur der DWD-Windlayer fürs Jetzt, sonst keine Daten). Sonst
  // ebenfalls Wind. Permalinks bleiben unangetastet (initialActive aus der URL).
  const [active, setActive] = useState<Set<LayerKey>>(() =>
    new Set<LayerKey>(initialActive ?? ['wind']));
  // Router (RT1): Rückkanäle als Ref (die []-Effekte lesen sie ohne Stale-Closure),
  // der zuletzt EINgeschaltete Layer (= Hauptlayer im Pfad) und das Spiegel-Flag,
  // das einen von außen (URL/Zurück) gesetzten Layerwechsel nicht wieder nach
  // außen meldet — sonst entstünde auf „Zurück" ein neuer History-Eintrag.
  const routeCbRef = useRef({ onLayersChange, onHourChange, onViewChange, onModelSourceChange });
  routeCbRef.current = { onLayersChange, onHourChange, onViewChange, onModelSourceChange };
  const lastAddedRef = useRef<LayerKey | null>(null);
  const mirrorRef = useRef(false);
  // Hover/Fokus auf einer Dock-Zeile. Seit Phase KD-R (audit/karten-readout.md)
  // öffnet das kein Overlay mehr über der Karte: Ist der Layer inaktiv, blendet
  // die Readout-Spalte seine Beschreibung an ihrer Ordnungsposition als Vorschau
  // ein; ist er aktiv, wird die bereits stehende Karte hervorgehoben.
  const [layerHover, setLayerHover] = useState<LayerKey | null>(null);
  // Status je Layer. `fetchedAt` = Abrufzeitpunkt (Fallback), `ref` = ECHTE
  // Referenzzeit der Daten (Modelllauf bzw. Messzeit, V-19). Fehlt `ref`, weist
  // die Quelle keine aus → die Anzeige beschriftet die Abrufzeit als solche,
  // statt sie als Datenstand auszugeben (D-04).
  const [statuses, setStatuses] = useState<Record<LayerKey, { ok?: { model: string; fetchedAt: number; ref?: DataRef }; err?: string }>>({
    wind: {}, gust: {}, nowcast: {}, temp: {}, clouds: {}, sat: {}, lightning: {}, lightningfc: {}, stations: {}, confidence: {}, snowline: {}, flownowcast: {}, poprob: {}, thunder: {}, snow: {}, rotation: {}, cells: {}, hail: {}, warnings: {},
  });
  const [satProduct, setSatProduct] = useState<SatelliteProduct>('eu_rgb');
  // Schnee-Modus (Feature F4): 'depth' = Schneedecke (h_snow), 'fresh' = Neuschnee (snow_gsp).
  const [snowMode, setSnowMode] = useState<SnowMode>('depth');
  // Zellbahnen (Phase Z1): Zahl der erkannten Zellen + Messzeit des Laufs, für
  // Legende und Leerzustand. `null` = noch nichts geladen; `count === 0` ist ein
  // GÜLTIGES Ergebnis (konvektionsfreier Tag), kein Fehler.
  const [cellsInfo, setCellsInfo] = useState<{ count: number; refMs: number } | null>(null);
  // Zellbahnen (Phase Z2): der geladene Lauf liegt im State, gezeichnet wird in
  // einem eigenen Effekt. So kostet ein Ortswechsel keinen Neuabruf der
  // 0,6-MB-Datei — die Phase bleibt bei null zusätzlichen Bytes.
  const [cellsRun, setCellsRun] = useState<Konrad3dRun | null>(null);
  /** Standortbezug (Z2-4): Satz + betroffene Zelle. `null` = die Karte sagt dazu
   *  nichts — im Übersichts-Modus ersatzlos, sonst weil keine Zelle relevant ist. */
  const [cellsRelevance, setCellsRelevance] = useState<{ cellId: number; text: string } | null>(null);
  // Hagel (Phase HA1): CH-Produktwahl + Zustand beider Quellen für Legende und
  // Leerzustand. `chMax === 0` bzw. `deCells === 0` sind GÜLTIGE Ergebnisse
  // („aktuell kein Hagel erkannt"), kein Fehler.
  const [hailProduct, setHailProduct] = useState<HailProduct>('meshs');
  const [hailInfo, setHailInfo] = useState<{
    chMax: number | null; chValidMs: number | null; deCells: number | null; deRefMs: number | null;
  }>({ chMax: null, chValidMs: null, deCells: null, deRefMs: null });
  // Amtliche Warnungen (Phase W1): der GESAMTE Warnstand liegt im State, gefiltert
  // wird erst beim Zeichnen — so kostet ein Slider-Zug keinen Neuabruf. `alerts:
  // []` ist ein GÜLTIGES Ergebnis („keine amtlichen Warnungen"), kein Fehler.
  const [warnRun, setWarnRun] = useState<WarnRun | null>(null);
  /** Was gerade GEZEICHNET ist (zur eingestellten Slider-Stunde) — Quelle für
   *  Legende und Statuszeile. Wird im Zeichen-Effekt gesetzt, damit Legende und
   *  Karte nie auseinanderlaufen können. */
  const [warnInfo, setWarnInfo] = useState<
    {
      total: number;
      /** Je Quelle eine eigene Skala — die Stufennummern sind nicht vergleichbar. */
      perSource: Array<{ source: WarnSourceMeta; total: number; tiers: WarnSummaryTier[] }>;
      publishedMs: number | null;
      dropped: number;
    } | null
  >(null);
  /** Abruf fehlgeschlagen. Muss von „lädt noch" UNTERSCHEIDBAR sein: ein Ausfall,
   *  der wie Laden aussieht, ist bei Warnungen der gefährlichste Zustand
   *  (`docs/API.md` §7.3 — bei Fehler abschalten und auf die amtliche Quelle
   *  verweisen; veraltete oder scheinbar leere Warnlagen sind schlimmer als keine). */
  const [warnFailed, setWarnFailed] = useState(false);
  // Schweizer Hälfte (Phase W2) — bewusst EIGENER Zustand und EIGENES
  // Fehlerflag. Ein halber Ausfall, der wie ein ganzer Erfolg aussieht, ist
  // genau der §7.3-Defekt, den W1 für DE schon einmal beheben musste: fällt CH
  // aus und DE nicht, muss die Karte sagen, WELCHE Hälfte fehlt.
  const [chWarnRun, setChWarnRun] = useState<ChWarnRun | null>(null);
  const [chWarnFailed, setChWarnFailed] = useState(false);
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
  // Spiegel für Effekte, die die Slider-Stunde LESEN müssen, ohne bei jeder
  // Sliderbewegung neu zu laufen (Hagel-Layer: Sichtbarkeit beim Anlegen der
  // erst zur Laufzeit entstehenden CH-Rasterquelle).
  const forecastHourRef = useRef(forecastHour);
  forecastHourRef.current = forecastHour;
  // Slider-Drag rAF-koaleszieren: ein natives <input type=range> feuert
  // `input` potenziell schneller als ein Repaint (schnelle Maus/Trackpad-
  // Wischgeste) — jedes Event löst sonst sofort die volle Wind/Niederschlag/
  // Wolken-Kette aus. Höchstens 1 State-Update pro Animationsframe.
  const pendingForecastHourRef = useRef<number | null>(null);
  const forecastHourRafRef = useRef<number | null>(null);
  const scheduleForecastHour = useCallback((h: number) => {
    pendingForecastHourRef.current = h;
    if (forecastHourRafRef.current != null) return;
    forecastHourRafRef.current = requestAnimationFrame(() => {
      forecastHourRafRef.current = null;
      if (pendingForecastHourRef.current != null) {
        setForecastHour(pendingForecastHourRef.current);
        pendingForecastHourRef.current = null;
      }
    });
  }, []);
  useEffect(() => () => {
    if (forecastHourRafRef.current != null) cancelAnimationFrame(forecastHourRafRef.current);
  }, []);
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
  const [modelSource, setModelSource] = useState<ModelSourceState>(() => applyModelSourceInit(initialModelSourceState(), initialModelSource));
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
  // null = die gewählte Quelle rendert NATIV (native/icon-d2) und braucht den
  // IDW-Rasterer nicht. Seit dem Rückbau der Raster-Fusion gibt es keinen
  // Blend-Default mehr, auf den man sonst zurückfiele.
  const modelChoice: ModelChoice | null = MODEL_ID_TO_CHOICE[activeModelId(modelSource)] ?? null;
  // Per-Land-Modell-Switcher (Phase 3): Land-Wahl · Modellwahl je Land · Radar-Toggle.
  // Die Modellwahl koppelt Raster + Punkt über den Resolver (resolvePointSource).
  const onSelectCountry = (c: Country) => setModelSource((s) => setActiveCountry(s, c));
  const onSelectModel = (c: Country, id: ModelId) => setModelSource((s) => setCountryModel(s, c, id));
  const onClearCountryModel = (c: Country) => setModelSource((s) => clearCountryModel(s, c));
  const onToggleRadar = () => setModelSource((s) => toggleRadar(s));

  // ---- Command-Deck-Zustand (Kartenseiten-Redesign) ------------------------
  // Modellseite (Vollflächen-Overlay auf Desktop/Tablet; auf Mobile eigener Tab).
  const [modelsOpen, setModelsOpen] = useState(false);
  // Mobile-Bottom-Bar-Tab (Karte · Layer · Forecast · Modelle; Nowcast navigiert).
  const [mobileTab, setMobileTab] = useState<'karte' | 'layer' | 'forecast' | 'modelle'>('karte');
  // Modus des mobilen Layer-Screens: Standard (schlank) ⇄ Detail (Sublabels +
  // Wind-/Satellit-Feinsteuerung + Lade-Stand je Layer).
  const [layerMode, setLayerMode] = useState<'standard' | 'detail'>('standard');
  // Ansicht Karte⇄Diagramm (mobil): steuert den Punktforecast-Tab von außen —
  // „Diagramm" öffnet das Sheet voll mit der Diagramme-Ansicht.
  const [pfcView, setPfcView] = useState<PointForecastView>('overview');
  // Mobiles Land-Menü (DE/AT/CH-Chip neben der Suche).
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  // Topbar-Uhr (Vorlage: 19:03 · MI · 21 MAI) — minütlich aktualisiert.
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClockMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  // Dev-Verifikations-Hook (Repo-Konvention wie __fusionV2 / __bsQA): Switch aus der
  // Konsole flippen (ergänzt die UI). Nur im Dev-Build.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    // layer==='point' steuert die zweite Engine (Punkt-Panel); sonst Raster-Layer
    // bzw. (ohne layer) der globale Raster-Default.
    // Punkt-Domäne nimmt 'fusion'|'native' (der Blend lebt nur dort), die
    // Raster-Achse nimmt Katalog-IDs.
    w.__setFusion2d = (src: ModelSource | ModelId, layer?: string) =>
      setModelSource((s) =>
        layer === 'point' ? setPointSource(s, src as ModelSource)
        : layer ? setLayerOverride(s, layer, src as ModelId)
        : setGlobalSource(s, src as ModelId));
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
  const layerRefs = useRef<{ wind?: WindLayer; temp?: ScalarLayer; gust?: ScalarLayer; clouds?: CloudLayer; precip?: ScalarLayer; rain?: RainLayer; confidence?: ConfidenceLayer; ki?: RainLayer; pop?: RainLayer; thunder?: ScalarLayer; lightningfc?: ScalarLayer; snow?: ScalarLayer; rotation?: ScalarLayer }>({});
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
  // Generation-Zähler für den asynchronen (Worker-Offload) Wind-Effekt: schützt
  // davor, dass ein verspätet zurückkommendes Blend-Ergebnis einen inzwischen
  // weitergezogenen Slider kurz auf eine alte Position zurückspringen lässt.
  const windReqGenRef = useRef(0);
  // Temperatur: natives ICON-D2 t_2m-Gitter (0–24 h) + hsurf-DEM-Korrektur,
  // statt der Fusion (Open-Meteo/IDW).
  const iconD2TempRef = useRef<IconD2Temp | null>(null);
  // Guard gegen einen DOPPELTEN nebenläufigen Temp-Load (spiegelt windLoadingRef):
  // Aktivierungs-Effekt und der eager `requestIdleCallback`-Pfad (Stadt-Labels)
  // können installTemp im selben Tick feuern, bevor iconD2TempRef gesetzt ist →
  // sonst wird jedes t_2m-Feld (+ hsurf) 2× geholt.
  const tempLoadingRef = useRef(false);
  // Windböen: natives ICON-D2 vmax_10m-Gitter (0–24 h), lazy beim Aktivieren.
  const iconD2GustRef = useRef<IconD2Gust | null>(null);
  const installGustRef = useRef<(() => Promise<void>) | null>(null);
  // Gewitterpotenzial (Feature F1): fusioniertes cape_ml×cin_ml×lpi-Gitter (0–12 h),
  // lazy beim Aktivieren — nicht im initialActive-Default, kein Eager-Fetch am Start.
  const iconD2ThunderRef = useRef<IconD2Thunder | null>(null);
  const installThunderRef = useRef<(() => Promise<void>) | null>(null);
  // Blitz-Vorhersage (Feature F2): natives ICON-D2 lpi_max-Gitter (0–12 h),
  // lazy beim Aktivieren — nicht im initialActive-Default, kein Eager-Fetch am Start.
  const iconD2LightningFcRef = useRef<IconD2Lpi | null>(null);
  const installLightningFcRef = useRef<(() => Promise<void>) | null>(null);
  // Schnee (Feature F4): natives ICON-D2 h_snow/snow_gsp-Gitter (0–24 h), lazy beim
  // Aktivieren + bei Modus-Wechsel — nicht im initialActive-Default, kein Eager-Fetch.
  const iconD2SnowRef = useRef<IconD2Snow | null>(null);
  const installSnowRef = useRef<(() => Promise<void>) | null>(null);
  // Rotationspotenzial (Feature F5, Experten): fusioniertes+geglättetes ICON-D2
  // uh_max×uh_max_low×sdi_2-Gitter (1–12 h), lazy beim Aktivieren — nicht im
  // initialActive-Default, kein Eager-Fetch am Kartenstart.
  const iconD2RotationRef = useRef<IconD2Rotation | null>(null);
  const installRotationRef = useRef<(() => Promise<void>) | null>(null);
  // Modus als Ref, damit die install-Closure den aktuellen Modus liest; Seq-Guard
  // gegen Stale-Callbacks bei schnellem Modus-Wechsel (depth↔fresh).
  const snowModeRef = useRef(snowMode);
  snowModeRef.current = snowMode;
  const snowSeqRef = useRef(0);
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
  // Testmodus „Nur-Jetzt": nur der ICON-D2-Niederschlag-Forecast (nicht die
  // Radar-„jetzt"-Quelle) — separat, damit der Slider-Move ihn mit erweitertem
  // Fenster neu laden kann.
  const installIconD2Ref = useRef<(() => Promise<void>) | null>(null);
  // Testmodus „Nur-Jetzt": aktuelles Vorhersagefenster (h), das die Grid-Layer
  // laden. 0 = nur der Jetzt-Bracket; wird beim ERSTEN Slider-Move auf
  // NOWONLY_AHEAD_H gesetzt (Forecast lädt nach Bedarf, nur für aktive Layer).
  const forecastAheadHRef = useRef(0);
  // Wiederverwendeter Ausgabepuffer für die Sub-Stunden-Interpolation des
  // Wolken-Frames (RGBA-Bytes). CloudLayer.setFrame lädt synchron per texImage2D
  // hoch → der Puffer kann pro Slider-Tick überschrieben werden (keine Allokation).
  const cloudLerpBufRef = useRef<Uint8Array | null>(null);
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
  const modelChoiceRef = useRef<ModelChoice | null>(null);
  useEffect(() => { modelChoiceRef.current = modelChoice; }, [modelChoice]);

  function updateStatus(key: LayerKey, patch: { ok?: { model: string; fetchedAt: number; ref?: DataRef }; err?: string }) {
    setStatuses(prev => ({ ...prev, [key]: patch }));
  }

  /** Referenzzeit eines Modelllaufs (ICON-D2/ICON-EU) für `updateStatus`. */
  const runRef = (runAt: Date | undefined | null): DataRef | undefined =>
    runAt ? { atMs: runAt.getTime(), kind: 'run' } : undefined;
  /** Referenzzeit einer Messung (Radar, Satellit, Blitze). */
  const measuredRef = (atMs: number | undefined | null): DataRef | undefined =>
    atMs != null && Number.isFinite(atMs) ? { atMs, kind: 'measured' } : undefined;

  function toggle(key: LayerKey) {
    lastAddedRef.current = active.has(key) ? null : key;
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Momentane Niederschlags-Verfügbarkeit aus den geladenen Refs (DACH-Komposit):
  // welche Landesradare sind da? Speist die EINE Quellen-Entscheidung
  // `resolvePrecipSource`/`precipCompositeReady` (src/nowcast/precipSource.ts).
  // Die Ansicht ist rein gemessenes Radar/Nowcast — KEIN Modellhorizont mehr
  // (Jan 2026-07-24: „Niederschlag · jetzt–2 h", Modellhälfte draußen).
  function precipAvailability(): PrecipAvailability {
    return {
      radarDE: !!nowcastRef.current, // DE RADOLAN-RV
      radarAT: !!incaGridRef.current, // AT GeoSphere INCA
      radarCH: !!meteoRadarRef.current, // CH MeteoSchweiz rzc
    };
  }

  // Ist für die aktuelle Slider-Stunde ein Radar-/Nowcast-Frame verfügbar?
  // Dünner Wrapper um `resolvePrecipSource` (per-Land) → DACH-OR: sichtbar, sobald
  // ein Landesradar die Stunde in seinem Horizont führt (DE 2 / AT 3 / CH 0,5 h).
  // Jenseits davon aus (keine Modellverlängerung). Zentralisiert in precipSource.ts.
  // (Liest Refs zur Render-Zeit; der Visibility-Effekt hängt an `nowcastTick`,
  // läuft also neu, sobald Frames eintreffen.)
  function precipFrameReady(hour: number): boolean {
    return precipCompositeReady(hour, precipAvailability());
  }

  /** Slider-Obergrenze für WOLKEN: ICON-D2-CLCT-Horizont (0–12 h) in Stunden ab
   *  jetzt. Niederschlag trägt separat nur seinen Radar-Horizont bei
   *  (`precipRadarHorizonHours`, ≤3 h) — die Modellverlängerung ist draußen. */
  function cloudsHorizonHours(): number {
    const ref = iconD2CloudsRef.current;
    if (!ref || !ref.frames.length) return 0;
    const last = ref.frames[ref.frames.length - 1].validAt.getTime();
    return Math.floor((last - Date.now()) / 3600_000);
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
      // Positron statt Liberty: gleiche OSM-Vektorkacheln (kein Bandbreiten-
      // Unterschied), aber halb so viele Style-Layer (55 statt 111, keine
      // 3D-Gebäude-Extrusion) → spürbar weniger Paint-Aufwand. Lohnt sich hier
      // besonders, weil die Karte ohnehin unter dem 70%-Dim-Overlay liegt (s.
      // addDimOverlay) — Liberty-Detail (Gebäude, POI-Icons) geht darunter
      // optisch sowieso unter, kostet aber trotzdem Rechenzeit.
      style: 'https://tiles.openfreemap.org/styles/positron',
      // Router (RT1): eine Kamera aus der URL (`lat`/`lon`/`z`) gewinnt gegen Default und DACH-Fit.
      center: initialView ? [initialView.lon, initialView.lat] : embedded ? [location.lon, location.lat] : DACH_VIEW.defaultCenter,
      zoom: initialView ? initialView.zoom : embedded ? 7.4 : DACH_VIEW.defaultZoom,
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

    // Router (RT1): Kamera nach jeder Bewegung melden — der Wrapper schreibt sie
    // debounced (≥ 300 ms) per replaceState in die Query, nie als History-Eintrag.
    // `map.remove()` im Cleanup löst den Listener mit auf.
    map.on('moveend', () => {
      const c = map.getCenter();
      routeCbRef.current.onViewChange?.({ lat: c.lat, lon: c.lng, zoom: map.getZoom() });
    });

    // Startansicht: DACH exakt einpassen statt fester Zoomstufe (Jans Auftrag
    // 2026-08-09). Ein fester Zoom passt nur zu EINEM Seitenverhältnis — auf
    // schmalen/hohen Handy-Feldern schnitt er DE/AT/CH an, auf breiten Desktops
    // blieb viel Rand. fitBounds rechnet Zoom + Center aus der tatsächlichen
    // Feldgröße; das Padding hält die Ränder frei von Deck-Chrome (Dock/Sheet).
    // Der Permalink-/Standort-Fall (embedded, initialHour, gewählter Ort) bleibt
    // unberührt — hier greift nur der Übersichts-Start.
    if (!embedded && overview && !initialView) {
      const fitDach = () => {
        const c = map.getContainer();
        const narrowField = c.clientWidth < 768;
        map.fitBounds(
          [[DACH_VIEW.bounds.lngMin, DACH_VIEW.bounds.latMin], [DACH_VIEW.bounds.lngMax, DACH_VIEW.bounds.latMax]],
          {
            // Handy: unten liegt das Bottom-Sheet, oben die Suchleiste.
            // Unten liegt das Zeit-Deck (Desktop ~110 px) bzw. das Bottom-Sheet
            // (Handy), oben die Modell-/Statuskarte — beides überdeckt sonst die
            // Alpen bzw. Norddeutschland.
            padding: narrowField
              ? { top: 70, bottom: 190, left: 14, right: 14 }
              : { top: 58, bottom: 130, left: 34, right: 34 },
            animate: false,
          },
        );
      };
      fitDach();
      // Nach dem ersten Layout (Deck-Chrome, Sheet-Snap, Safe-Area) kann sich das
      // Feld noch einmal ändern — dann neu einpassen, aber nur solange der Nutzer
      // die Karte nicht selbst bewegt hat.
      let userMoved = false;
      const markMoved = () => { userMoved = true; };
      map.once('dragstart', markMoved);
      map.once('zoomstart', markMoved);
      map.once('boxzoomstart', markMoved);
      const ro = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => { if (!userMoved) fitDach(); })
        : null;
      ro?.observe(map.getContainer());
      window.setTimeout(() => { ro?.disconnect(); }, 4000);
    }

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
            // Command-Deck (Vollansicht): tieferes Ink-Feld wie in der Vorlage
            // (references/desktop-karte.png); eingebettet bleibt der Alt-Wert.
            paint: { 'fill-color': '#2C2A26', 'fill-opacity': embedded ? 0.7 : 0.8 },
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
      // the layers that must stay visible outside DACH above it (Stationen:
      // Klickbarkeit). precip-forecast bleibt bewusst UNTEN (s. addLayers) —
      // sonst hebt genau dieser Aufruf den Niederschlag beim allerersten
      // Paint dauerhaft über die Maske (User-Report: Regen über Belgien/
      // Slowenien auch nach dem applyVisibility-Fix noch sichtbar).
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
    // WIND-PARTIKEL-TEMPO — ein einziger Regler, strikt linear zum GRIB-Wert.
    //
    //   px/s = speedPxPerMs · |V|        |V| = Windgeschwindigkeit in m/s
    //
    // Es gibt bewusst KEINEN zweiten Faktor mehr: keine γ-Kennlinie, kein
    // Mindesttempo, keine Gerätedämpfung. Doppelter Wind = doppelt so schnelle
    // Partikel, und die Richtung ist die echte (Herleitung + die früheren
    // Verzerrungen: `audit/wind-partikel-grib-treue.md`, Mathematik in
    // `src/wind/advection.ts`).
    //
    // 6 px/s je m/s trifft die Referenzoptik aus
    // `audit/windkarte-vorbild-wetteronline.md`: der typische DACH-Wind (5–6 m/s)
    // gleitet mit ~30–36 px/s und zieht bei fadeOpacity 0.972 einen ~25 px langen
    // Schweif. Sturm sieht jetzt auch nach Sturm aus (20 m/s ⇒ 120 px/s) — das ist
    // die gewollte Folge der Proportionalität.
    //
    // screenTempoZoomExp 0 = Bildschirmtempo über ALLE Zoomstufen konstant. Der
    // Zeitraffer sinkt dafür beim Reinzoomen; die Bahn bleibt die echte. (Das
    // frühere `speedZoomDamping: 0.25` entspräche exp 0.75.)
    const wind = new WindLayer({
      windPngUrl: '', windJsonUrl: '',
      // WG-1 (2026-08-22, Jans Auftrag „nach dem Vorbild des Globus"): die
      // Wetterkarte zeichnete ~2 850 dicke Punkte, der Globus ~23 300 feine —
      // dieselbe Klasse, nur andere Parameter (Diagnose:
      // `audit/windpartikel-globus-vorbild.md`). Angeglichen wird NUR die Optik;
      // Tempo/GRIB-Treue (speedPxPerMs 6, speedRefZoom 5,5,
      // screenTempoZoomExp 0,35) bleiben unangetastet — Jans Entscheid
      // 2026-08-09 gilt weiter. EINE Dichte fuer alle Geraete (Jans Entscheid
      // 2026-08-22); wo sie nicht traegt, regelt der FrameGovernor.
      baseDensity: 18000, minParticles: 2500, maxParticles: 48000,
      // Glatte, gekruemmte Bahnen statt Polygonzug. Kostet Advektionsarbeit im
      // Update-Pass, aber KEINEN zusaetzlichen Draw-Pass.
      subSteps: 3,
      // Tempo als Farbe lesbar (nullschool-/Globus-Optik). Die Partikel bekommen
      // eine EIGENE Rampe: die Heatmap-Rampe beginnt bei rgb(20,30,55) und wuerde
      // langsame Faeden verschlucken — die Heatmap selbst bleibt farbgleich.
      particleColor: [0.86, 0.92, 1.0, 0.84], speedTint: 0.62,
      particleColorRamp: PARTICLE_RAMP,
      // Partikel-Stil: 'points' (Bestand). Der WP1-Segment-Stil (windy-artige
      // Striche, src/wind/particlePreset.ts) wurde am 2026-08-08 auf Jans
      // Auftrag wieder DEAKTIVIERT — Optik gefiel nicht; der Code bleibt
      // default-off hinter particleStyle:'segments' verfügbar (Gate GWP1).
      speedPxPerMs: 6, speedRefZoom: 5.5,
      // Jans Befund 2026-08-09: beim Rauszoomen wirkten die Partikel zu schnell.
      // exp 0 hielt das Bildschirmtempo über alle Stufen konstant — geografisch
      // ist das weit draußen ein enormer Zeitraffer. 0,35 dämpft das Tempo unter
      // dem Referenzzoom (z4 ≈ 0,68×) und lässt es beim Reinzoomen leicht
      // anziehen; die Richtung/Proportionalität zu |V| bleibt unangetastet.
      screenTempoZoomExp: 0.35,
      // Touch/coarse-pointer (mobile/tablet): skip the particle passes during
      // active pan/zoom so the basemap + heatmap stay smooth; particles resume
      // on moveend. Desktop (fine pointer) keeps full fidelity.
      // Gegen die Wind-Klumpen weit draußen: die Auffrischrate steigt beim
      // Rauszoomen (s. zoomDropScale in WindLayer) — Basiswerte bleiben.
      zoomDropBoost: 0.42,
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
      // Wind-Animation auf Touch-/Schwachgeräten auf ~30 fps deckeln (statt des
      // ungedeckelten Display-Rate-Dauerloops): halbiert Idle-GPU/Compositor-Last
      // und damit Akku/Thermik. Advektion ist dt-normalisiert → Partikel-Tempo und
      // Trails bleiben identisch. Desktop (fine pointer) ungedeckelt = Referenz.
      maxParticleFps: coarsePointer ? 30 : 0,
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
    // Gewitterpotenzial-Layer (Feature F1, DWD ICON-D2 cape_ml×cin_ml×lpi) —
    // eigenständiger ScalarLayer über nativem 2,2-km-Regulärgitter, eigene
    // Palette. Keine DEM-Korrektur. visRange blendet Zellen unter ~Score 8
    // (t=0.08) transparent aus ("keine Gewitterlage nicht einfärben", §3), damit
    // nur echte Konvektionsfelder erscheinen statt Vollflächen. Standardmäßig
    // inaktiv; Daten laden lazy (installThunder) erst beim Aktivieren.
    const thunderLayer = new ScalarLayer({
      id: THUNDER_LAYER_ID,
      colorRamp: thunderRamp,
      // visRange = Sichtbarkeits-Fade auf t=Score/100. Kalibriert so, dass das
      // „gering"-Band (Score ≥ 8, `thunderLevelOf`) tatsächlich sichtbar wird:
      // fade 5→9 (Score 8 ≈ 84 % deckend), Score < 5 („keine") transparent.
      // Vorher {0.08,0.14} verschluckte 8–14 komplett → an schwachen Tagen wirkte
      // der Layer „aus" (Score-8-Zelle = 0 % deckend). Spec §3: „transparent
      // unterhalb ~Score 8, dann Gelb (gering)".
      visRange: { start: 0.05, end: 0.09 },
      opacity: 0.85,
      zoomAttenuation: { from: 11, perStep: 0.08, floor: 0.7 },
    });
    // Blitz-Vorhersage-Layer (Feature F2, DWD ICON-D2 lpi_max) — eigenständiger
    // ScalarLayer über nativem 2,2-km-Regulärgitter, eigene (violett-forcierte)
    // Palette. Keine DEM-Korrektur. visRange blendet Zellen unter ~1 J/kg
    // (t≈0.033) transparent aus ("ruhige Zellen nicht einfärben", §3), damit nur
    // echte Blitzrisiko-Felder erscheinen. Standardmäßig inaktiv; Daten laden
    // lazy (installLightningFc) erst beim Aktivieren.
    const lightningFcLayer = new ScalarLayer({
      id: LIGHTNINGFC_LAYER_ID,
      colorRamp: lpiRamp,
      // Fade knapp unter dem 1-J/kg-Band (0.6→1.2 J/kg auf der ÷30-Achse), sodass
      // das „gering"-Signal (≥ 1 J/kg) sichtbar wird, aber die 0-J/kg-Ruhefläche
      // transparent bleibt.
      visRange: { start: 0.02, end: 0.045 },
      opacity: 0.85,
      zoomAttenuation: { from: 11, perStep: 0.08, floor: 0.7 },
    });
    // Schnee-Layer (Feature F4, DWD ICON-D2 h_snow / snow_gsp) — eigenständiger
    // ScalarLayer über nativem 2,2-km-Regulärgitter mit der Schnee-Palette
    // (`snowRamp`, Weiß→Blau — klar von der Regen-Palette getrennt). Keine DEM-
    // Korrektur. Der R-Kanal trägt bereits t = cm/VMAX (modusabhängig normiert im
    // Loader); `visRange` (< ~1 cm transparent) wird beim Daten-Setzen je Modus
    // gesetzt. Standardmäßig inaktiv; Daten laden lazy (installSnow) erst beim
    // Aktivieren bzw. Modus-Wechsel.
    const snowLayer = new ScalarLayer({
      id: SNOW_LAYER_ID,
      colorRamp: snowRamp,
      visRange: SNOW_VIS_RANGE.depth,
      opacity: 0.9,
      zoomAttenuation: { from: 10, perStep: 0.08, floor: 0.6 },
    });
    // Rotationspotenzial-Layer (Feature F5, DWD ICON-D2 uh_max×uh_max_low×sdi_2) —
    // eigenständiger ScalarLayer über nativem 2,2-km-Regulärgitter, eigene NÜCHTERNE
    // Violett/Indigo-Palette. Keine DEM-Korrektur. Der R-Kanal trägt bereits den
    // GEGLÄTTETEN Score/100 (Fusion + Nachbarschafts-Glättung im Loader, §0.3).
    // visRange blendet Zellen unter ~Score 20 (t=0.20) transparent aus (großzügige
    // Aktivierungsschwelle, §0.4 — lieber Under- als Over-Paint), damit nur echte
    // Rotations-Verdachtsflächen erscheinen. Standardmäßig inaktiv; Daten laden lazy
    // (installRotation) erst beim Aktivieren.
    const rotationLayer = new ScalarLayer({
      id: ROTATION_LAYER_ID,
      colorRamp: rotationRamp,
      visRange: { start: 0.18, end: 0.24 },
      opacity: 0.8,
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
    layerRefs.current = { wind, temp: tempLayer, gust: gustLayer, clouds: cloudLayer, precip: precipLayer, rain: rainLayer, confidence: confidenceLayer, ki: kiLayer, pop: popLayer, thunder: thunderLayer, lightningfc: lightningFcLayer, snow: snowLayer, rotation: rotationLayer };

    // Insert temp + clouds *under* the boundary/label layers of the OSM basemap so
    // country outlines, state borders and city labels stay readable on top of the
    // saturated heatmap (Windy-style). 'boundary_3' is the lowest boundary layer
    // in the OpenFreeMap Liberty style.
    const TOPMOST_INSERT_BEFORE = 'boundary_3';
    const addLayers = () => {
      const beforeId = map.getLayer(TOPMOST_INSERT_BEFORE) ? TOPMOST_INSERT_BEFORE : undefined;
      if (!map.getLayer(tempLayer.id)) map.addLayer(tempLayer, beforeId);
      if (!map.getLayer(gustLayer.id)) map.addLayer(gustLayer, beforeId);
      // Gewitterpotenzial UNTER der Länder-Maske (wie temp/gust/precip) — der
      // Index soll auf DACH begrenzt bleiben, nicht kontinental durchscheinen.
      if (!map.getLayer(thunderLayer.id)) map.addLayer(thunderLayer, beforeId);
      // Blitz-Vorhersage UNTER der Länder-Maske (wie temp/gust/thunder) — das
      // Risiko soll auf DACH begrenzt bleiben, nicht kontinental durchscheinen.
      if (!map.getLayer(lightningFcLayer.id)) map.addLayer(lightningFcLayer, beforeId);
      // Schnee-Menge UNTER der Länder-Maske (wie temp/gust/precip) — auf DACH begrenzt.
      if (!map.getLayer(snowLayer.id)) map.addLayer(snowLayer, beforeId);
      // Rotationspotenzial UNTER der Länder-Maske (wie temp/gust/thunder) — die
      // Verdachtsflächen sollen auf DACH begrenzt bleiben, nicht kontinental durchscheinen.
      if (!map.getLayer(rotationLayer.id)) map.addLayer(rotationLayer, beforeId);
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
      // Zellbahnen (Phase Z1) — EINE Quelle, fünf gefilterte Layer. Die optische
      // Trennung gemessen ↔ prognostiziert ist gate-blockierend (D-04): Umriss
      // durchgezogen und kräftig, Spur gestrichelt, Trichter nur angedeutet.
      // Daten kommen aus dem Poll-Effekt; initial leer/unsichtbar.
      if (!map.getSource(CELLS_SOURCE_ID)) {
        map.addSource(CELLS_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          attribution: KONRAD3D_ATTRIBUTION,
        });
      }
      if (!map.getLayer(CELLS_CONE_LAYER_ID)) {
        map.addLayer({
          id: CELLS_CONE_LAYER_ID, type: 'fill', source: CELLS_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'cone'],
          layout: { visibility: 'none' },
          // Sehr zurückhaltend: der Trichter ist eine Unsicherheits-, keine
          // Ereignisfläche — er darf das Kartenbild nicht dominieren.
          paint: { 'fill-color': CELLS_SEVERITY_COLOR, 'fill-opacity': 0.1 },
        });
      }
      // Z2: der Verlauf. Der Z1-Layer darüber bleibt UNVERÄNDERT und liefert die
      // Grundtönung — dadurch ist `coneRing()` weiterhin gezeichnet (benannter
      // Rückfall) und die Hülle deckt auch die Zwickel, die die Ellipsen
      // freilassen. Die Stufen legen den Verlauf darauf: vorn dicht, hinten
      // fast durchsichtig — genau die Aussage, die die eine Fläche verschluckt.
      if (!map.getLayer(CELLS_CONE_STEP_LAYER_ID)) {
        map.addLayer({
          id: CELLS_CONE_STEP_LAYER_ID, type: 'fill', source: CELLS_SOURCE_ID,
          minzoom: CELLS_CONE_STEP_MINZOOM,
          filter: ['all',
            ['==', ['get', 'kind'], 'cone-step'],
            ['>=', ['coalesce', ['get', 'sev'], 0], CELLS_CONE_STEP_MIN_SEV],
          ],
          layout: { visibility: 'none' },
          paint: {
            'fill-color': CELLS_SEVERITY_COLOR,
            'fill-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'leadMin'], 60],
              5, 0.2,
              30, 0.1,
              60, 0.04,
            ],
          },
        });
      }
      if (!map.getLayer(CELLS_HULL_LAYER_ID)) {
        map.addLayer({
          id: CELLS_HULL_LAYER_ID, type: 'fill', source: CELLS_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'hull'],
          layout: { visibility: 'none' },
          paint: { 'fill-color': CELLS_SEVERITY_COLOR, 'fill-opacity': 0.22 },
        });
      }
      if (!map.getLayer(CELLS_HULL_LINE_ID)) {
        map.addLayer({
          id: CELLS_HULL_LINE_ID, type: 'line', source: CELLS_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'hull'],
          layout: { visibility: 'none', 'line-join': 'round' },
          // DURCHGEZOGEN = gemessen (Referenzzeit der Datei).
          // Z2: die für den gewählten Ort relevante Zelle bekommt eine kräftigere
          // Linie — über eine `case`-Expression, NICHT über einen zweiten Layer.
          paint: {
            'line-color': CELLS_SEVERITY_COLOR,
            'line-width': ['case', ['==', ['get', 'affects'], 1], 2.8, 1.6],
            'line-opacity': 0.95,
          },
        });
      }
      if (!map.getLayer(CELLS_PATH_LAYER_ID)) {
        map.addLayer({
          id: CELLS_PATH_LAYER_ID, type: 'line', source: CELLS_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'path'],
          layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
          // GESTRICHELT = prognostiziert (+5 … +60 min).
          paint: {
            'line-color': CELLS_SEVERITY_COLOR,
            'line-width': ['case', ['==', ['get', 'affects'], 1], 3.2, 2],
            'line-opacity': 0.9,
            'line-dasharray': [2, 1.6],
          },
        });
      }
      // Z2: Zeitmarken +15/+30/+60 auf der Spur. Ein fehlendes Sprite darf NICHT
      // still einen unsichtbaren Layer erzeugen (Z2-11) — deshalb erst
      // registrieren, dann `hasImage()` prüfen, sonst laut sein.
      for (const lead of CELL_TIME_MARK_LEADS) {
        const imgId = cellsMarkImageId(lead);
        if (!map.hasImage(imgId)) {
          const img = makeCellMarkImage(String(lead));
          if (img) map.addImage(imgId, img, { pixelRatio: 2 });
        }
      }
      const marksReady = CELL_TIME_MARK_LEADS.every((l) => map.hasImage(cellsMarkImageId(l)));
      if (!marksReady) {
        console.warn('[buscosun] Zellbahnen: Zeitmarken-Sprites fehlen — Layer wird nicht angelegt.');
      } else if (!map.getLayer(CELLS_MARK_LAYER_ID)) {
        map.addLayer({
          id: CELLS_MARK_LAYER_ID, type: 'symbol', source: CELLS_SOURCE_ID,
          minzoom: CELLS_MARK_MINZOOM,
          filter: ['==', ['get', 'kind'], 'mark'],
          layout: {
            visibility: 'none',
            'icon-image': ['concat', 'storm-cells-mark-', ['to-string', ['get', 'leadMin']]],
            // Die Pille sitzt ÜBER der Spur, nicht auf ihr: die +60-Marke und der
            // Pfeilkopf hängen beide an der letzten Stützstelle und lagen sonst
            // exakt aufeinander (auf dem Bildschirm gemessen: beide bei px
            // 523/372) — der Pfeil war damit unlesbar.
            'icon-anchor': 'bottom',
            'icon-offset': [0, -5],
            // `allow-overlap: false` wäre hier eine Falle: MapLibre platziert
            // die Basemap-Labels zuerst, unser Layer liegt oben und wird als
            // letzter platziert — am Bildschirm gemessen verschwanden dadurch
            // ALLE drei Marken (0 von 3 gerendert), ohne dass wir es hätten
            // loggen können. Ein stilles Weglassen ist schlimmer als eine
            // Überlagerung, deshalb sind die Marken platzierungsfest.
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            // Bei einer langsamen Zelle liegen +15/+30/+60 nur 4,5/9/18 km
            // auseinander. Überlagern sie sich, liegt die KLEINERE Vorlaufzeit
            // oben — die nähere Aussage ist die belastbarere.
            'symbol-sort-key': ['coalesce', ['get', 'leadMin'], 60],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 11, 0.95],
          },
          paint: { 'icon-opacity': 0.9 },
        });
      }
      // Z2: Pfeilkopf am Spurende — die Zugrichtung ohne Klick.
      if (!map.hasImage(CELLS_ARROW_IMAGE_ID)) {
        const img = makeCellArrowImage();
        if (img) map.addImage(CELLS_ARROW_IMAGE_ID, img, { pixelRatio: 2 });
      }
      if (!map.hasImage(CELLS_ARROW_IMAGE_ID)) {
        console.warn('[buscosun] Zellbahnen: Pfeil-Sprite fehlt — Layer wird nicht angelegt.');
      } else if (!map.getLayer(CELLS_ARROW_LAYER_ID)) {
        map.addLayer({
          id: CELLS_ARROW_LAYER_ID, type: 'symbol', source: CELLS_SOURCE_ID,
          minzoom: CELLS_ARROW_MINZOOM,
          filter: ['==', ['get', 'kind'], 'arrow'],
          layout: {
            visibility: 'none',
            'icon-image': CELLS_ARROW_IMAGE_ID,
            'icon-rotate': ['coalesce', ['get', 'bearing'], 0],
            'icon-rotation-alignment': 'map',
            // Eine Marke je Zelle — sie IST die Aussage und darf nicht wegfallen.
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.55, 11, 1],
          },
          // Dieselbe Deckkraft wie die gestrichelte Spur (Z2-E1).
          paint: { 'icon-opacity': ['case', ['==', ['get', 'affects'], 1], 1, 0.9] },
        });
      }
      if (!map.getLayer(CELLS_DOT_LAYER_ID)) {
        map.addLayer({
          id: CELLS_DOT_LAYER_ID, type: 'circle', source: CELLS_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'dot'],
          layout: { visibility: 'none' },
          paint: {
            'circle-color': CELLS_SEVERITY_COLOR,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 8, 5.5, 11, 7.5],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.4,
          },
        });
      }
      // Hagel DE (Phase HA1) — Zellen mit Hagelsignal aus KONRAD3D. Bewusst OHNE
      // Zugspur/Trichter: das ist der Zellbahnen-Layer. Die CH-Rasterquelle
      // entsteht erst mit dem ersten Frame (sie braucht Ecken + Bild).
      if (!map.getSource(HAIL_DE_SOURCE_ID)) {
        map.addSource(HAIL_DE_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          // Trägt die Pflichtangaben BEIDER Hagelquellen, weil `image`-Sources
          // im Stilschema kein `attribution` kennen (s. CH-Effekt).
          attribution: `${KONRAD3D_HAIL_ATTRIBUTION} · ${METEOSWISS_HAIL_ATTRIBUTION}`,
        });
      }
      if (!map.getLayer(HAIL_DE_FILL_ID)) {
        map.addLayer({
          id: HAIL_DE_FILL_ID, type: 'fill', source: HAIL_DE_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'area'],
          layout: { visibility: 'none' },
          paint: { 'fill-color': HAIL_CELL_COLOR, 'fill-opacity': 0.3 },
        });
      }
      if (!map.getLayer(HAIL_DE_LINE_ID)) {
        map.addLayer({
          id: HAIL_DE_LINE_ID, type: 'line', source: HAIL_DE_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'area'],
          layout: { visibility: 'none', 'line-join': 'round' },
          paint: { 'line-color': HAIL_CELL_COLOR, 'line-width': 1.8 },
        });
      }
      if (!map.getLayer(HAIL_DE_DOT_ID)) {
        map.addLayer({
          id: HAIL_DE_DOT_ID, type: 'circle', source: HAIL_DE_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'dot'],
          layout: { visibility: 'none' },
          paint: {
            'circle-color': HAIL_CELL_COLOR,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 8, 5.5, 11, 7.5],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.4,
          },
        });
      }
      // Amtliche Warnungen (Phase W1 + W2) — Fläche + Umriss. Die Farbe steht
      // am Feature, deshalb `['get','color']` statt einer Rampe: für DE ist es
      // die amtliche `AREA_COLOR` aus der Meldung, für CH die aus der amtlichen
      // Gefahrenstufe abgeleitete Farbe (der Schweizer Feed führt kein
      // `AREA_COLOR`). `fill-sort-key` hebt die höhere Warnstufe nach oben,
      // damit eine Unwetterwarnung nie unter einer gelben Warnung verschwindet.
      if (!map.getSource(WARN_SOURCE_ID)) {
        map.addSource(WARN_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          // Beide Urheber, jeder in seiner eigenen Form. Der Schweizer Feed
          // führt KEINEN `LICENSE`-eventCode — die Attribution darf deshalb
          // nicht an einem leeren Lizenzfeld hängen, sondern steht fest.
          attribution: `${DWD_WARNINGS_ATTRIBUTION} · ${CH_WARNINGS_ATTRIBUTION}`,
        });
      }
      if (!map.getLayer(WARN_FILL_ID)) {
        map.addLayer({
          id: WARN_FILL_ID, type: 'fill', source: WARN_SOURCE_ID,
          layout: { visibility: 'none', 'fill-sort-key': ['coalesce', ['get', 'sev'], 0] },
          // Bewusst durchscheinend: die Warnfläche ist großflächig (Landkreis)
          // und darf Radar/Temperatur darunter nicht unlesbar machen.
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.28 },
        });
      }
      if (!map.getLayer(WARN_LINE_ID)) {
        map.addLayer({
          id: WARN_LINE_ID, type: 'line', source: WARN_SOURCE_ID,
          layout: { visibility: 'none', 'line-join': 'round', 'line-sort-key': ['coalesce', ['get', 'sev'], 0] },
          paint: { 'line-color': ['get', 'color'], 'line-width': 1.6, 'line-opacity': 0.95 },
        });
      }
      // precipLayer bleibt UNTER der Länder-Maske (wie temp/wind/clouds) — die
      // Niederschlagsdaten sollen auf DACH begrenzt bleiben, nicht kontinental
      // durchscheinen (User-Report: Regen sichtbar über Slowenien/Belgien).
      applyVisibility();
    };
    const applyVisibility = () => {
      const set: Record<string, boolean> = {
        wind: active.has('wind'),
        clouds: active.has('clouds'),
        temperature: active.has('temp'),
        gust: active.has('gust'),
        [THUNDER_LAYER_ID]: active.has('thunder'),
        [LIGHTNINGFC_LAYER_ID]: active.has('lightningfc'),
        [SNOW_LAYER_ID]: active.has('snow'),
        [ROTATION_LAYER_ID]: active.has('rotation'),
        // „Niederschlag · jetzt–2 h": rein gemessenes Radar/Nowcast (Jan 2026-07-24).
        // Die Frame-Verfügbarkeit entscheidet zentral `precipCompositeReady`
        // (precipSource.ts, DACH-OR über die DE/AT/CH-Radarhorizonte) — jenseits des
        // Horizonts aus (keine Modellverlängerung). Der RainLayer ist die EINZIGE
        // Precip-Quelle (auch im Fusion-Modus); die Fusion-Modellhälfte ist raus.
        [NOWCAST_LAYER_ID]: active.has('nowcast') && precipFrameReady(forecastHour) && modelSourceRef.current.radar,
        // Fusion-/Modell-Niederschlag (`precip-forecast`) stillgelegt → nie sichtbar.
        'precip-forecast': false,
        [SAT_LAYER_ID]: active.has('sat'),
        [LIGHTNING_LAYER_ID]: active.has('lightning'),
        [STATIONS_LAYER_ID]: active.has('stations'),
        [CONFIDENCE_LAYER_ID]: active.has('confidence'),
        [SNOWLINE_CASING_ID]: active.has('snowline'),
        [SNOWLINE_LAYER_ID]: active.has('snowline'),
        // Zellbahnen: nur im belegten Fenster jetzt … +60 min. Steht der Slider
        // weiter vorn, ist der Layer AUS statt eine Aussage vorzutäuschen, für
        // die es keine Prognosespur gibt (D-04, Muster wie `nowcast` jenseits
        // des Radarhorizonts). Die Legende benennt genau das.
        ...Object.fromEntries(CELLS_LAYER_IDS.map((id) => [
          id, active.has('cells') && forecastHour * 60 <= CELLS_HORIZON_MIN,
        ])),
        // Hagel: beide Quellen sind reine ANALYSEN („jetzt"). Ab der ersten
        // Vorhersagestunde ist der Layer aus, statt einen alten Stand als
        // Aussage über die eingestellte Stunde auszugeben (D-04).
        ...Object.fromEntries(HAIL_LAYER_IDS.map((id) => [id, active.has('hail') && forecastHour === 0])),
        // Warnungen: KEINE Stundenschranke — anders als Radar-Analysen tragen
        // amtliche Warnungen ihre eigene Gültigkeit (`onset`/`expires`) und
        // reichen oft über den Slider hinaus. Gefiltert wird über die Daten
        // (`buildWarnFeatures` zur eingestellten Zeit), nicht über die
        // Sichtbarkeit: gilt zur gewählten Stunde nichts, ist die Quelle leer —
        // und die Legende sagt genau das.
        ...Object.fromEntries(WARN_LAYER_IDS.map((id) => [id, active.has('warnings')])),
        [FLOW_NOWCAST_LAYER_ID]: active.has('flownowcast') && modelSourceRef.current.radar,
        [POP_LAYER_ID]: active.has('poprob') && modelSourceRef.current.radar,
        [DIM_LAYER_ID]: true, // dark wash always on — keeps the canvas dark even with no weather layer
      };
      for (const id of Object.keys(set)) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', set[id] ? 'visible' : 'none');
        }
      }
      // precip-forecast/NOWCAST/FLOW_NOWCAST/POP bleiben UNTER der Länder-Maske
      // (wie temp/wind/clouds, s. addLayers) — Niederschlag soll auf DACH
      // begrenzt bleiben statt kontinental durchzuscheinen (User-Report).
      // Vertrauens-Schleier ÜBER den Datenschichten — sonst verdeckt das Radar
      // die Schraffur. Die Stationen bleiben darüber (nächster moveLayer).
      if (map.getLayer(CONFIDENCE_LAYER_ID)) map.moveLayer(CONFIDENCE_LAYER_ID);
      // Schneefallgrenze als Linie ganz oben (dünn → verdeckt nichts), über den
      // Rastern und dem Schleier.
      if (map.getLayer(SNOWLINE_CASING_ID)) map.moveLayer(SNOWLINE_CASING_ID);
      if (map.getLayer(SNOWLINE_LAYER_ID)) map.moveLayer(SNOWLINE_LAYER_ID);
      // Amtliche Warnungen über die Raster, aber UNTER Zellbahnen/Hagel: die
      // Warnfläche ist großflächig und würde die kleinen Objekte sonst
      // überdecken. Kein Rangurteil — nur Lesbarkeit.
      for (const id of WARN_LAYER_IDS) if (map.getLayer(id)) map.moveLayer(id);
      // Zellbahnen über die Raster heben (sonst verdeckt das Radar den Trichter),
      // in Zeichenreihenfolge — die Stationen bleiben darüber (nächster moveLayer).
      for (const id of CELLS_LAYER_IDS) if (map.getLayer(id)) map.moveLayer(id);
      // Hagel darüber: ein Hagelsignal darf von keiner Datenschicht verdeckt
      // werden. Reihenfolge CH-Raster → DE-Fläche → Umriss → Punkt.
      for (const id of HAIL_LAYER_IDS) if (map.getLayer(id)) map.moveLayer(id);
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

    // Zweistufiges Laden des IDW-Rasterers (Phase A grob/schnell, Phase B voll).
    // Läuft NUR für Modelle ohne nativen GRIB2-Pfad (`MODEL_ID_TO_CHOICE`);
    // native/ICON-D2 rendern direkt und brauchen ihn nicht — dann ist
    // `modelChoiceRef.current` null und die Funktion kehrt sofort zurück.
    const loadOpenMeteo = async () => {
      const choice = modelChoiceRef.current;
      if (!choice) return;
      const applyForecast = (r: DwdForecastResult, tempLayerRef: ScalarLayer) => {
        forecastRef.current = r;
        setFusionError(false);          // Raster da → etwaigen Fallback-Indikator löschen
        setForecast(r);
        const h0 = r.hours[0]?.layers;
        // Wind kommt ausschließlich nativ aus ICON-D2 (installWind) — der
        // Rasterer speist den Wind-Layer nicht, daher hier kein Wind-Status.
        // Temp-Status + DEM nur, solange das native ICON-D2-Temp noch nicht
        // geladen ist (sonst überschriebe das DACH-DEM das ICON-Bounds-DEM →
        // uv-Versatz im Lapse-Shader).
        // keine Referenzzeit: der IDW-Rasterer reicht den Lauf der Quelle nicht
        // durch (die Adapter kennen ihn, `FusedForecast` trägt ihn nicht) → die
        // Anzeige beschriftet die Abrufzeit (V-19); ein `runAt` gehört in `ref:`.
        if (h0?.temperature && !iconD2TempRef.current) updateStatus('temp', { ok: { model: r.model, fetchedAt: r.fetchedAt } });
        if (r.demImage && !iconD2TempRef.current) tempLayerRef.setDem(r.demImage);
      };

      try {
        // Phase A — schnelle Vorschau: kleineres Gitter, weniger Stunden und
        // ohne Gauß-Glättung der Nicht-Temp-Variablen. Phase B legt danach die
        // volle Auflösung nach.
        const fast = await loadFusedForecast({
          signal: abort.signal,
          temperatureRange: TEMP_RANGE,
          hours: 6,
          denseCols: 80,
          denseRows: 64,
          quickMode: true,
          country: location.country,
          modelChoice: choice,
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
            modelChoice: choice,
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
        // keine Referenzzeit: das Capture-Datum kommt erst mit dem WMS-TIME-Fetch
        // eine Zeile weiter unten. Bis dahin nennt die Anzeige ausdrücklich die
        // Abrufzeit (V-19), statt einen Datenstand zu behaupten.
        updateStatus('sat', { ok: { model: meta.title, fetchedAt: Date.now() } });
        // P2-2: echtes Capture-Datum aus WMS-TIME nachladen → „Stand HH:MM".
        void fetchWmsLatestTime(meta.layerLocalName).then((t) => {
          if (t) updateStatus('sat', { ok: { model: meta.title, fetchedAt: Date.now(), ref: measuredRef(t.getTime()) } });
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
          // keine Referenzzeit: jede Station meldet zu ihrer eigenen Zeit; eine
          // gemeinsame Messzeit gibt es nicht (`dachStations.ts` führt keine mit).
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

    // Zellbahnen — Klick auf den Zell-Schwerpunkt öffnet den Steckbrief.
    // Eigener Popup-Slot, damit Stationen und Zellen gleichzeitig nutzbar
    // bleiben (Funktionserhalt: der Stations-Popup wird nicht verdrängt).
    let cellPopup: maplibregl.Popup | null = null;
    const cellClickHandler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      if (cellPopup) cellPopup.remove();
      cellPopup = new maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: '280px' })
        .setLngLat(e.lngLat)
        .setHTML(renderCellPopup(f.properties as unknown as CellFeatureProperties))
        .addTo(map);
    };
    map.on('click', CELLS_DOT_LAYER_ID, cellClickHandler);
    map.on('mouseenter', CELLS_DOT_LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', CELLS_DOT_LAYER_ID, () => { map.getCanvas().style.cursor = ''; });

    // Hagel DE — Klick auf Zellfläche oder Punkt öffnet den Hagel-Steckbrief.
    let hailPopup: maplibregl.Popup | null = null;
    const hailClickHandler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      if (hailPopup) hailPopup.remove();
      hailPopup = new maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: '280px' })
        .setLngLat(e.lngLat)
        .setHTML(renderHailPopup(f.properties as unknown as HailCellProperties))
        .addTo(map);
    };
    for (const id of [HAIL_DE_DOT_ID, HAIL_DE_FILL_ID]) {
      map.on('click', id, hailClickHandler);
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    }

    // Amtliche Warnungen — Klick auf die Fläche öffnet ALLE Warnungen dieses
    // Punktes. `e.features` liefert bereits sämtliche Treffer des Layers unter
    // dem Cursor; sie werden nach Warnstufe absteigend sortiert und vollständig
    // gezeigt. Nur die oberste zu nehmen würde eine gültige amtliche Warnung
    // verschweigen (audit/wetterwarnungen.md §5.5/§7.3).
    let warnPopup: maplibregl.Popup | null = null;
    const warnClickHandler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const feats = e.features ?? [];
      if (!feats.length) return;
      const seen = new Set<string>();
      const props: WarnFeatureProperties[] = [];
      for (const f of feats) {
        const p = f.properties as unknown as WarnFeatureProperties;
        // Ein Gebiet kann als MultiPolygon mehrere Treffer liefern — dieselbe
        // Meldung darf im Steckbrief nur einmal stehen.
        const key = `${p.id}|${p.areaDesc}`;
        if (seen.has(key)) continue;
        seen.add(key);
        props.push(p);
      }
      props.sort((a, b) => (b.sev ?? 0) - (a.sev ?? 0));
      if (warnPopup) warnPopup.remove();
      warnPopup = new maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: '320px' })
        .setLngLat(e.lngLat)
        .setHTML(renderWarnPopup(props))
        .addTo(map);
    };
    map.on('click', WARN_FILL_ID, warnClickHandler);
    map.on('mouseenter', WARN_FILL_ID, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', WARN_FILL_ID, () => { map.getCanvas().style.cursor = ''; });

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
      // NOWCAST/FLOW_NOWCAST/POP bleiben UNTER der Länder-Maske (s. addLayers) —
      // nur die Stationen werden weiterhin über alles gehoben (Klickbarkeit).
      if (map.getLayer(STATIONS_LAYER_ID)) map.moveLayer(STATIONS_LAYER_ID);
    };
    // CH-„jetzt": MeteoSwiss-Radar rzc.
    const loadRzc = async () => {
      try {
        meteoRadarRef.current = await fetchRzcLatest(abort.signal);
        // Index-Map off-main vorwärmen (s. PrecipCompositor.primeCh) — VOR dem
        // Tick, damit build() im Render-Pfad gleich den warmen Cache trifft statt
        // den Newton-Solver synchron nachzuholen.
        if (compositorRef.current) await compositorRef.current.primeCh(meteoRadarRef.current);
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
        if (compositorRef.current) await compositorRef.current.primeDe(nowcastRef.current);
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
        if (compositorRef.current) await compositorRef.current.primeAt(incaGridRef.current);
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
    // Gemeinsamer Status: welche Landesradare aktuell beitragen. Rein gemessenes
    // Radar/Nowcast (Jan 2026-07-24) — KEINE ICON-D2-Modellverlängerung mehr.
    const setCompositeStatus = () => {
      const parts: string[] = [];
      if (nowcastRef.current) parts.push('DE RADOLAN');
      if (incaGridRef.current) parts.push('AT INCA');
      if (meteoRadarRef.current) parts.push('CH rzc');
      const model = parts.length ? `DACH-Komposit · ${parts.join(' · ')}` : '';
      // V-19: Das Komposit ist so alt wie sein ÄLTESTER Teil (konservativ). DE
      // (RADOLAN-RV) und CH (rzc, ODIM-/what) weisen eine Messzeit aus; das
      // AT-INCA-Grid tut es nicht (`geosphereIncaGrid.ts` parst nur `leadtime`)
      // → es geht bewusst NICHT in die Referenz ein, statt sie zu erfinden.
      // Liefert keine Quelle eine Messzeit, bleibt `ref` leer und die Anzeige
      // beschriftet die Abrufzeit als Abrufzeit.
      const ref = oldestRef([
        measuredRef(nowcastRef.current?.runAt.getTime()),
        measuredRef(meteoRadarRef.current?.validAt.getTime()),
      ]);
      if (model) updateStatus('nowcast', { ok: { model, fetchedAt: Date.now(), ref: ref ?? undefined } });
    };
    // ICON-D2 (Forecast) im Hintergrund nachladen — GRIB2 dekodieren ist
    // langsamer (~mehrere Sekunden), läuft progressiv. Re-Render-Coalescing
    // (wie installWind/installClouds): jeder Progress-Frame würde sonst
    // MapView + PrecipCompositor.build() (DACH-weites 600×512-Komposit) neu
    // rendern lassen — bei ~27 Schritten ein Re-Render-Sturm (gemessen als
    // Haupttreiber der verbliebenen Blockade NACH dem GRIB-Worker-Offload,
    // nicht der Decode selbst). Nur der ERSTE Frame tickt (sofort sichtbar);
    // der finale Tick nach dem `await` liefert ohnehin den vollständigen Stand.
    const installIconD2 = async () => {
      try {
        let firstD2 = true;
        const d2 = await fetchIconD2Precip(abort.signal, (partial) => {
          iconD2Ref.current = partial;
          if (firstD2) {
            firstD2 = false;
            // Index-Map off-main vorwärmen (s. PrecipCompositor.primeD2), dann
            // erst ticken — sonst holt build() den Newton-Solver synchron nach.
            void (async () => {
              if (!compositorRef.current) compositorRef.current = new PrecipCompositor();
              await compositorRef.current.primeD2(partial);
              setNowcastTick((t) => t + 1);
            })();
          }
        }, { nowOnly: START_NOW_ONLY && !embedded, aheadHours: forecastAheadHRef.current }); // Testmodus: Jetzt-Fenster (0…+2h nach Slider-Move)
        iconD2Ref.current = d2;
        if (compositorRef.current) await compositorRef.current.primeD2(d2);
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
      const markReady = (runAt: Date) => {
        if (statusShown) return;
        statusShown = true;
        updateStatus('clouds', { ok: { model: 'DWD ICON-D2 Wolken tief/mittel/hoch · 2,2 km', fetchedAt: Date.now(), ref: runRef(runAt) } });
      };
      try {
        let firstCloud = true;
        const c = await fetchIconD2CloudStack(abort.signal, (partial) => {
          iconD2CloudsRef.current = partial;
          if (firstCloud) { firstCloud = false; setNowcastTick((t) => t + 1); } // Tick-Coalescing (s. Wind)
          if (partial.frames.length > 0) markReady(partial.runAt);
        }, { nowOnly: START_NOW_ONLY && !embedded, aheadHours: forecastAheadHRef.current }); // Testmodus: Jetzt-Fenster (0…+2h nach Slider-Move)
        iconD2CloudsRef.current = c;
        setNowcastTick((t) => t + 1);
        markReady(c.runAt);
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
          // Testmodus: nur das Jetzt-Fenster (0 h beim Start; nach dem ersten
          // Slider-Move bis +NOWONLY_AHEAD_H). Eingebettet ausgenommen.
          { nowOnly: START_NOW_ONLY && !embedded, aheadHours: forecastAheadHRef.current },
        );
        iconD2WindRef.current = wd;
        setNowcastTick((t) => t + 1);
        if (wd.frames[0]) saveWindNowCache(wd.frames[0], wd.uvBounds); // für den nächsten Sofort-Start
        updateStatus('wind', { ok: { model: 'DWD ICON-D2 u/v 10m · 2,2 km', fetchedAt: Date.now(), ref: runRef(wd.runAt) } });
      } catch {
        // nicht fatal — beim nächsten Aufruf greift der Cache erneut.
      }
      } finally {
        // Nach dem NAHEN Horizont zurücksetzen (der ferne lädt im Hintergrund
        // weiter); ein späterer Refresh/Reaktivieren darf dann neu laden.
        windLoadingRef.current = false;
        // StrictMode-/Abort-Race (wie installTemp): abgebrochener Lauf holt den
        // frischen Installer nach, statt den Layer hängen zu lassen.
        if (abort.signal.aborted && !iconD2WindRef.current) {
          setTimeout(() => { void installWindRef.current?.(); }, 0);
        }
      }
    };
    installWindRef.current = installWind;

    // Temperatur-Layer: natives ICON-D2 t_2m-Gitter (2,2 km) + hsurf-DEM-Korrektur
    // progressiv laden (ersetzt die Fusion-Temperatur). Das DEM-Bild gilt für die
    // ICON-Bounds → einmalig per setDem aktivieren; danach speist der Slider-Effekt
    // die stündlichen Frames. Deckt DE/AT/CH geografisch ab → kein Länderbranch.
    const installTemp = async () => {
      // Nebenläufigen Doppel-Load verhindern (s. tempLoadingRef). Synchron VOR jedem
      // await gesetzt → greift auch, wenn Aktivierungs-Effekt + requestIdleCallback im
      // selben Tick feuern. Der 30-min-Refresh läuft weiter, weil dann nicht „loading".
      if (tempLoadingRef.current) return;
      tempLoadingRef.current = true;
      try {
        // Tick-Coalescing wie bei Wind (Re-Render-Sturm vermeiden). Temp lädt am
        // Mount IMMER (Stadt-Labels), also auch auf der Default-Karte relevant.
        let firstTemp = true;
        const td = await fetchIconD2Temp(abort.signal, (partial) => {
          iconD2TempRef.current = partial;
          if (firstTemp) { firstTemp = false; layerRefs.current.temp?.setDem(partial.demImage); setNowcastTick((t) => t + 1); }
        }, { nowOnly: START_NOW_ONLY && !embedded, aheadHours: forecastAheadHRef.current }); // Testmodus: Jetzt-Fenster (0…+2h nach Slider-Move)
        iconD2TempRef.current = td;
        layerRefs.current.temp?.setDem(td.demImage);
        setNowcastTick((t) => t + 1);
        updateStatus('temp', { ok: { model: 'DWD ICON-D2 t_2m · 2,2 km', fetchedAt: Date.now(), ref: runRef(td.runAt) } });
      } catch {
        // nicht fatal — die Fusion-Temperatur deckt weiter ab.
      } finally {
        tempLoadingRef.current = false;
        // StrictMode-/Abort-Race: Läuft DIESER (abgebrochene) Installer aus,
        // nachdem sein Guard den parallelen Neustart des Remounts verschluckt
        // hat, den frischen Installer nachholen. `installTempRef` zeigt dann auf
        // den neuen Mount; nach echtem Unmount ist sie genullt (Cleanup) → no-op.
        if (abort.signal.aborted && !iconD2TempRef.current) {
          setTimeout(() => { void installTempRef.current?.(); }, 0);
        }
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
        }, { nowOnly: START_NOW_ONLY && !embedded, aheadHours: forecastAheadHRef.current }); // Testmodus: Jetzt-Fenster (0…+2h nach Slider-Move)
        iconD2GustRef.current = gd;
        setNowcastTick((t) => t + 1);
        updateStatus('gust', { ok: { model: 'DWD ICON-D2 vmax_10m · 2,2 km', fetchedAt: Date.now(), ref: runRef(gd.runAt) } });
      } catch {
        updateStatus('gust', { err: 'ICON-D2 Böen nicht erreichbar' });
      }
    };
    installGustRef.current = installGust;

    // Gewitterpotenzial-Layer (Feature F1): fusioniertes ICON-D2-cape_ml×cin_ml×lpi-
    // Gitter (0–12 h) progressiv laden. Eigenständiger ScalarLayer; speist sich
    // über den Slider-Effekt. Wird NUR hier (lazy) geladen — beim ersten Aktivieren.
    const installThunder = async () => {
      try {
        let firstThunder = true;
        const td = await fetchIconD2Thunder(abort.signal, (partial) => {
          iconD2ThunderRef.current = partial;
          if (firstThunder) { firstThunder = false; setNowcastTick((t) => t + 1); } // Tick-Coalescing (s. Wind/Böen)
        });
        iconD2ThunderRef.current = td;
        setNowcastTick((t) => t + 1);
        updateStatus('thunder', { ok: { model: 'DWD ICON-D2 cape_ml·cin_ml·lpi · 2,2 km', fetchedAt: Date.now(), ref: runRef(td.runAt) } });
      } catch {
        updateStatus('thunder', { err: 'ICON-D2 Gewitterpotenzial nicht erreichbar' });
      }
    };
    installThunderRef.current = installThunder;

    // Blitz-Vorhersage-Layer (Feature F2): natives ICON-D2 lpi_max-Gitter (0–12 h)
    // progressiv laden. Eigenständiger ScalarLayer; speist sich über den Slider-
    // Effekt. Wird NUR hier (lazy) geladen — beim ersten Aktivieren, nie eager.
    const installLightningFc = async () => {
      try {
        let firstLpi = true;
        const ld = await fetchIconD2Lpi(abort.signal, (partial) => {
          iconD2LightningFcRef.current = partial;
          if (firstLpi) { firstLpi = false; setNowcastTick((t) => t + 1); } // Tick-Coalescing (s. Wind/Böen)
        });
        iconD2LightningFcRef.current = ld;
        setNowcastTick((t) => t + 1);
        updateStatus('lightningfc', { ok: { model: 'DWD ICON-D2 lpi_max · 2,2 km', fetchedAt: Date.now(), ref: runRef(ld.runAt) } });
      } catch {
        updateStatus('lightningfc', { err: 'ICON-D2 Blitz-Vorhersage nicht erreichbar' });
      }
    };
    installLightningFcRef.current = installLightningFc;

    // Schnee-Layer (Feature F4): natives ICON-D2 h_snow (Schneedecke) bzw.
    // snow_gsp+snow_con (Neuschnee) progressiv laden — modusabhängig (snowModeRef).
    // Eigenständiger ScalarLayer; speist sich über den Slider-Effekt. Wird NUR hier
    // (lazy) geladen — beim ersten Aktivieren + bei Modus-Wechsel, nie eager. Ein
    // Seq-Guard verwirft Stale-Callbacks eines abgelösten Modus-Laufs.
    const installSnow = async () => {
      const mode = snowModeRef.current;
      const seq = ++snowSeqRef.current;
      try {
        let firstSnow = true;
        const sd = await fetchIconD2Snow(mode, abort.signal, (partial) => {
          if (seq !== snowSeqRef.current) return; // abgelöst (Modus gewechselt)
          iconD2SnowRef.current = partial;
          if (firstSnow) { firstSnow = false; setNowcastTick((t) => t + 1); } // Tick-Coalescing
        });
        if (seq !== snowSeqRef.current) return;
        iconD2SnowRef.current = sd;
        setNowcastTick((t) => t + 1);
        updateStatus('snow', { ok: { model: mode === 'depth' ? 'DWD ICON-D2 h_snow · 2,2 km' : 'DWD ICON-D2 snow_gsp · 2,2 km', fetchedAt: Date.now(), ref: runRef(sd.runAt) } });
      } catch {
        if (seq === snowSeqRef.current) updateStatus('snow', { err: 'ICON-D2 Schnee nicht erreichbar' });
      }
    };
    installSnowRef.current = installSnow;

    // Rotationspotenzial-Layer (Feature F5): fusioniertes+geglättetes ICON-D2
    // uh_max×uh_max_low×sdi_2-Gitter (1–12 h) progressiv laden. Eigenständiger
    // ScalarLayer (nüchterne Violett-Palette); speist sich über den Slider-Effekt.
    // Wird NUR hier (lazy) geladen — beim ersten Aktivieren, nie eager.
    const installRotation = async () => {
      try {
        let firstRot = true;
        const rd = await fetchIconD2Rotation(abort.signal, (partial) => {
          iconD2RotationRef.current = partial;
          if (firstRot) { firstRot = false; setNowcastTick((t) => t + 1); } // Tick-Coalescing (s. Wind/Böen)
        });
        iconD2RotationRef.current = rd;
        setNowcastTick((t) => t + 1);
        updateStatus('rotation', { ok: { model: 'DWD ICON-D2 uh_max·uh_max_low·sdi_2 · 2,2 km', fetchedAt: Date.now(), ref: runRef(rd.runAt) } });
      } catch {
        updateStatus('rotation', { err: 'ICON-D2 Rotationspotenzial nicht erreichbar' });
      }
    };
    installRotationRef.current = installRotation;

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
        // keine Referenzzeit: wie beim Satelliten kommt sie erst mit WMS-TIME (s. u.).
        updateStatus('lightning', { ok: { model: 'DWD Sferics 60 min', fetchedAt: Date.now() } });
        // P2-2: echtes Capture-Datum aus WMS-TIME nachladen → „Stand HH:MM".
        void fetchWmsLatestTime(LIGHTNING_LAYER_LOCAL).then((t) => {
          if (t) updateStatus('lightning', { ok: { model: 'DWD Sferics 60 min', fetchedAt: Date.now(), ref: measuredRef(t.getTime()) } });
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
    // Testmodus „Nur-Jetzt": Zeitbasis wieder da, aber auf +NOWONLY_AHEAD_H
    // gekappt (Slider „jetzt … +2 h"). Die Frames dieses Fensters laden NICHT
    // hier, sondern erst beim ersten Slider-Move (siehe forecastAheadHRef-Effekt) —
    // und dann nur für aktive Grid-Layer. Beim Start (Slider=0) genügt der
    // Jetzt-Bracket, den die Layer ohnehin laden.
    const sliderHours = (START_NOW_ONLY && !embedded) ? NOWONLY_AHEAD_H + 1 : FORECAST_HOURS;
    setForecast({
      hours: Array.from({ length: sliderHours }, (_, h) => ({
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
    // Testmodus: der ICON-D2-Niederschlag-Forecast allein (ohne Radar-Reload) —
    // vom Slider-Move genutzt, um das Fenster mit +2h neu zu laden.
    installIconD2Ref.current = installIconD2;
    // Fusion nur auffrischen, wenn sie überhaupt (lazy) angefordert wurde.
    const t1 = window.setInterval(() => {
      if (fusionRequestedRef.current) void loadOpenMeteo();
    }, FORECAST_REFRESH_MS);
    // RV/rzc publizieren alle 5 min — die land-passende „jetzt"-Quelle frisch
    // nachladen (nur falls bereits aktiviert/geladen).
    const t9 = window.setInterval(refreshNowSource, 5 * 60 * 1000);
    // ICON-D2 läuft alle 3 h — alle 30 min auf einen neueren Lauf prüfen.
    // Refresh-KOORDINATOR (vorher: fünf separate Intervalle t10–t14, die je nebenläufig
    // installXxx() → resolveLatestRun() feuerten). Am 30-min-Tick sind sharedRun/runCache
    // (3-min-TTL) abgelaufen → ohne Koordination starten alle geladenen Layer gleichzeitig
    // ihre eigene 6er-Rückwärtssuche (sharedRun ist beim Start aller noch null). Hier wird
    // der jüngste Lauf EINMAL aufgelöst (sharedRun/runCache warm), dann fächern nur die
    // Per-Param-Fetches der tatsächlich geladenen Layer auf (Ref-Präsenz = „geladen").
    // Die alten active.has(...)-Guards lasen `active` aus der Mount-Closure (deps []) =
    // stale → Temp/Böen wurden faktisch nie per Interval aufgefrischt; die Ref-Gates
    // beheben das und sind konsistent mit t10/t11 (die schon nur auf die Ref gaten).
    const refreshIconD2Layers = async () => {
      const jobs: Array<() => Promise<void>> = [];
      if (iconD2Ref.current) jobs.push(installIconD2);
      if (iconD2CloudsRef.current) jobs.push(installClouds);
      if (iconD2WindRef.current) jobs.push(installWind);
      if (iconD2TempRef.current) jobs.push(installTemp);
      if (iconD2GustRef.current) jobs.push(installGust);
      if (iconD2ThunderRef.current) jobs.push(installThunder);
      if (iconD2LightningFcRef.current) jobs.push(installLightningFc);
      if (iconD2SnowRef.current) jobs.push(installSnow);
      if (iconD2RotationRef.current) jobs.push(installRotation);
      if (jobs.length === 0) return;
      // Lauf einmal vorab auflösen → sharedRun/runCache sind warm, wenn die Installer
      // starten (jeder trifft dann seinen Param mit einer Directory-Probe statt einer
      // nebenläufigen Rückwärtssuche). t_2m ist immer ein gültiger Param.
      try { await resolveLatestRun('t_2m', abort.signal); } catch { /* Installer lösen selbst auf */ }
      for (const job of jobs) void job();
    };
    const tD2 = window.setInterval(() => { void refreshIconD2Layers(); }, 30 * 60 * 1000);
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
      // Installer-Refs nullen: die Abort-Nachhol-Retries (installTemp/-Wind,
      // StrictMode-Race) dürfen nach echtem Unmount nichts mehr anstoßen. Beim
      // StrictMode-Remount weist der neue Effekt-Lauf sie sofort wieder zu.
      installTempRef.current = null;
      installWindRef.current = null;
      window.clearInterval(t1);
      window.clearInterval(t3);
      window.clearInterval(t4);
      window.clearInterval(t9);
      window.clearInterval(tD2);
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

  // Gewitterpotenzial lazy laden (Feature F1, Jans Vorgabe): erst beim ersten
  // Aktivieren die drei ICON-D2-Felder ziehen — nie eager am Kartenstart.
  useEffect(() => {
    if (active.has('thunder') && !iconD2ThunderRef.current) void installThunderRef.current?.();
  }, [active]);

  // Blitz-Vorhersage lazy laden (Feature F2, Jans HARTE Vorgabe): erst beim ersten
  // Aktivieren das ICON-D2-lpi_max-Gitter ziehen — nie eager am Kartenstart.
  useEffect(() => {
    if (active.has('lightningfc') && !iconD2LightningFcRef.current) void installLightningFcRef.current?.();
  }, [active]);

  // Schnee lazy laden (Feature F4, Jans HARTE Vorgabe): erst beim ersten Aktivieren
  // das ICON-D2-Schnee-Gitter ziehen — nie eager am Kartenstart.
  useEffect(() => {
    if (active.has('snow') && !iconD2SnowRef.current) void installSnowRef.current?.();
  }, [active]);

  // Rotationspotenzial lazy laden (Feature F5, Jans HARTE Vorgabe): erst beim ersten
  // Aktivieren die ICON-D2-uh_max/uh_max_low/sdi_2-Felder ziehen — nie eager am Start.
  useEffect(() => {
    if (active.has('rotation') && !iconD2RotationRef.current) void installRotationRef.current?.();
  }, [active]);

  // Schnee-Modus-Wechsel (Feature F4): das jeweils ANDERE Feld LAZY nachladen —
  // nur wenn der Layer aktiv ist. Alten Frame-Stand verwerfen (Seq-Guard in
  // installSnow verhindert Stale-Overwrites) und die modusabhängige visRange am
  // Layer setzen. Feuert nicht am Mount (Layer initial inaktiv).
  useEffect(() => {
    if (!active.has('snow')) return;
    const snow = layerRefs.current.snow;
    if (snow) snow.visRange = SNOW_VIS_RANGE[snowMode];
    iconD2SnowRef.current = null;
    void installSnowRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snowMode]);

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
        // Stadt-Temperatur-Labels sind dauerhaft sichtbar (windy-Stil) → das
        // t_2m-Gitter (im Testmodus nur der Jetzt-Bracket) im Leerlauf NACH dem
        // Hero-Layer laden, damit die Labels echte aktuelle Werte zeigen. Jans
        // Vorgabe: Städte-Temperaturen beim Start anzeigen und dauerhaft halten
        // (auch im Testmodus „Nur-Jetzt" — Wind bleibt trotzdem der erste Frame).
        const ric: (cb: () => void) => void =
          typeof window.requestIdleCallback === 'function'
            ? (cb) => { window.requestIdleCallback(cb, { timeout: 2500 }); }
            : (cb) => { window.setTimeout(cb, 900); };
        ric(() => { if (!iconD2TempRef.current) void installTempRef.current?.(); });
      }
    }
  }, [active]);

  // Rasterer laden, sobald ein aktiver Layer auf ein Modell OHNE nativen
  // GRIB2-Pfad auflöst. Der Temperatur-Layer allein fordert ihn NICHT mehr an —
  // er rendert nativ (der frühere Fusions-Erstpaint-Fallback ist mit dem
  // Blend entfallen, Jans Entscheidung 2026-08-22).
  // Idempotent via fusionRequestedRef (der 10-min-Refresh übernimmt danach).
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
        // keine Referenzzeit: die Stationsklimatologie ist ein statisches
        // Bundle-Asset (30-Jahres-Normalen) — ein „Datenalter" wäre erfunden.
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
          // keine Referenzzeit: der Schleier mischt die statische Klimatologie mit
          // einem Lauf-zu-Lauf-Spread aus MEHREREN ICON-D2-Läufen (`IconD2TempSpread`
          // führt bewusst keinen einzelnen Lauf) — ein Wert wäre eine Auswahl, keine Angabe.
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
      // Referenzzeit = der ICON-D2-Temperaturlauf, aus dem die Iso-Kontur gerechnet
      // wird (die Stationsklimatologie ist ein statisches Bundle-Asset ohne Lauf).
      updateStatus('snowline', { ok: { model: 'KI · ML #2 · 156 DWD-Stationen + Physik-Anker', fetchedAt: Date.now(), ref: runRef(td.runAt) } });
    }
  }, [forecastHour, nowcastTick, active]);

  // Zellbahnen (Phase Z1, E3): KONRAD3D holen — NUR solange der Layer aktiv und
  // der Tab sichtbar ist. Aufrufregel aus `audit/zellbahnen.md` §3: eine Datei
  // ist ~0,6 MB, Dauer-Polling wären ~7,6 MB/h. Inaktiver Layer = null Byte.
  // Abhängigkeit ist bewusst NUR `cellsOn` (nicht `active`), sonst würde jeder
  // fremde Layer-Toggle einen 0,6-MB-Neuabruf auslösen.
  const cellsOn = active.has('cells');
  useEffect(() => {
    if (!cellsOn) return;
    const map = mapRef.current;
    if (!map) return;
    const abort = new AbortController();
    let stopped = false;

    const load = async () => {
      // Hintergrund-Tab: nicht abrufen (rAF/Netz sparen) — der
      // visibilitychange-Hörer holt es nach, sobald die Karte wieder vorn ist.
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const run = await fetchKonrad3d(abort.signal);
        // Welche KONRAD3D-Datei liegt gerade auf der Karte? (Muster radolan.ts:297)
        console.log(
          `[buscosun] Zellbahnen-Layer → KONRAD3D-Datei: ${run.file}` +
          ` · Messzeit ${new Date(run.refMs).toLocaleString('de-DE')} · ${run.cells.length} Zellen`,
        );
        if (stopped) return;
        // Z2: der Abruf setzt nur noch den Lauf; gezeichnet wird im Effekt
        // darunter. Sonst müsste ein Ortswechsel die 0,6-MB-Datei neu holen,
        // nur damit sich der Standortbezug ändert.
        setCellsRun(run);
        setCellsInfo({ count: run.cells.length, refMs: run.refMs });
        // Referenzzeit = Messzeit des Laufs (V-19), NICHT die Abrufzeit.
        updateStatus('cells', {
          ok: {
            model: run.cells.length > 0
              ? `DWD KONRAD3D · ${run.cells.length} Zelle${run.cells.length === 1 ? '' : 'n'}`
              : 'DWD KONRAD3D · aktuell keine konvektiven Zellen erkannt',
            fetchedAt: Date.now(),
            ref: measuredRef(run.refMs),
          },
        });
      } catch {
        if (stopped || abort.signal.aborted) return;
        updateStatus('cells', { err: 'Zellbahnen (DWD KONRAD3D) konnten nicht geladen werden' });
      }
    };

    void load();
    const timer = window.setInterval(() => { void load(); }, CELLS_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      abort.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      // Layer aus ⇒ Quelle leeren: beim nächsten Einschalten darf kein alter
      // Stand aufblitzen, bevor der frische Lauf da ist (D-04).
      (map.getSource(CELLS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)
        ?.setData({ type: 'FeatureCollection', features: [] });
      setCellsInfo(null);
      setCellsRun(null);
    };
  }, [cellsOn]);

  // Zellbahnen zeichnen + Standortbezug (Phase Z2). Getrennt vom Abruf, damit ein
  // Ortswechsel KEINEN Neuabruf auslöst — die Phase kostet null zusätzliche Bytes.
  //
  // Übersichts-Modus (`overview`): kein gewählter Ort ⇒ kein Standortbezug,
  // ersatzlos und ohne Platzhalter (`audit/zellbahnen-karte.md` §4).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (cellsRun == null) { setCellsRelevance(null); return; }

    const draw = (): boolean => {
      const src = map.getSource(CELLS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!src) return false;
      const target: [number, number] | null = overview ? null : [location.lon, location.lat];
      const rel = target ? cellLocationRelevance(cellsRun, target) : null;
      const fc = buildCellFeatures(cellsRun, { affectsCellId: rel?.cellId ?? null });
      src.setData(fc);
      setCellsRelevance(rel ? { cellId: rel.cellId, text: cellRelevanceText(rel) } : null);
      // „no silent caps": was die Ausdünnung wegnimmt, wird benannt statt
      // verschwiegen. Die Zahlen sind gezählt, nicht geschätzt.
      const counts = cellFeatureCounts(fc);
      const thinned = cellsRun.cells.filter(
        (c) => (c.severityDecimal ?? c.severity ?? 0) < CELLS_CONE_STEP_MIN_SEV,
      ).length;
      console.log(
        `[buscosun] Zellbahnen gezeichnet → ${cellsRun.cells.length} Zellen, ${fc.features.length} Features `
        + `(${JSON.stringify(counts)}) · Ausdünnung: Trichterstufen erst ab z${CELLS_CONE_STEP_MINZOOM} `
        + `und ab sev ${CELLS_CONE_STEP_MIN_SEV} (${thinned} Zelle(n) darunter — deren Umriss, Spur und `
        + `Trichterhülle bleiben), Zeitmarken ab z${CELLS_MARK_MINZOOM}, Pfeile ab z${CELLS_ARROW_MINZOOM}`
        + `${rel ? ` · Standortbezug: Zelle ${rel.cellId}` : ' · kein Standortbezug'}`,
      );
      return true;
    };

    if (draw()) return;
    // Die Quelle steht noch nicht (der Stil lädt gerade). Einmal aufgeben und nie
    // wieder hinsehen wäre eine still leere Karte — deshalb über `styledata`
    // nachziehen, bis die Quelle da ist. Muster wie `safeApply` weiter unten.
    let done = false;
    const retry = () => {
      if (done) return;
      if (draw()) { done = true; map.off('styledata', retry); }
    };
    map.on('styledata', retry);
    return () => { done = true; map.off('styledata', retry); };
  }, [cellsRun, location.lon, location.lat, overview]);

  // ---- Hagel (Phase HA1) -----------------------------------------------------
  // Zwei Quellen, zwei Effekte: der DE-Teil hängt nur am Layer-Zustand, der
  // CH-Teil zusätzlich am Produkt (MESHS/POH). Getrennt, damit ein Produktwechsel
  // nicht die 0,6-MB-KONRAD3D-Datei erneut zieht.
  const hailOn = active.has('hail');

  // DE — KONRAD3D-Zellen mit Hagelsignal. Teilt sich den Lauf-Cache mit den
  // Zellbahnen (`dwdKonrad3d.ts`), lädt also nicht doppelt, wenn beide aktiv sind.
  useEffect(() => {
    if (!hailOn) return;
    const map = mapRef.current;
    if (!map) return;
    const abort = new AbortController();
    let stopped = false;

    const load = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const run = await fetchKonrad3d(abort.signal);
        if (stopped) return;
        const fc = buildHailCellFeatures(run);
        (map.getSource(HAIL_DE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(fc);
        const count = fc.features.filter((f) => f.properties?.kind === 'dot').length;
        setHailInfo((s) => ({ ...s, deCells: count, deRefMs: run.refMs }));
      } catch {
        if (stopped || abort.signal.aborted) return;
        setHailInfo((s) => ({ ...s, deCells: null, deRefMs: null }));
      }
    };

    void load();
    const timer = window.setInterval(() => { void load(); }, HAIL_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      abort.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      (map.getSource(HAIL_DE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)
        ?.setData({ type: 'FeatureCollection', features: [] });
      setHailInfo((s) => ({ ...s, deCells: null, deRefMs: null }));
    };
  }, [hailOn]);

  // CH — MeteoSchweiz MESHS/POH als `image`-Source. Die Quelle entsteht erst mit
  // dem ersten Frame, weil sie Bild UND Ecken braucht; danach wird sie über
  // `updateImage` fortgeschrieben.
  useEffect(() => {
    if (!hailOn) return;
    const map = mapRef.current;
    if (!map) return;
    const abort = new AbortController();
    let stopped = false;

    const load = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const r = await fetchSwissHail(hailProduct, abort.signal);
        if (stopped) return;
        const cv = document.createElement('canvas');
        cv.width = r.width;
        cv.height = r.height;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        const img = ctx.createImageData(r.width, r.height);
        img.data.set(hailRasterToRGBA(r.values, r.width, r.height, hailProduct));
        ctx.putImageData(img, 0, 0);
        const url = cv.toDataURL('image/png');
        const coordinates = r.corners.map((c) => [c[0], c[1]]) as [
          [number, number], [number, number], [number, number], [number, number],
        ];

        const existing = map.getSource(HAIL_CH_SOURCE_ID) as maplibregl.ImageSource | undefined;
        if (existing) {
          existing.updateImage({ url, coordinates });
        } else {
          // `image`-Sources tragen im MapLibre-Stilschema kein `attribution`-Feld
          // (anders als `geojson`/`raster`) — die Pflichtangabe hängt daher an der
          // DE-Zellquelle des Layers, s. unten.
          map.addSource(HAIL_CH_SOURCE_ID, { type: 'image', url, coordinates });
          map.addLayer({
            id: HAIL_CH_LAYER_ID, type: 'raster', source: HAIL_CH_SOURCE_ID,
            layout: { visibility: 'none' },
            // `nearest`: die Produkte sind klassifiziert (MESHS in Stufen) —
            // Interpolation würde Zwischenwerte erfinden, die es nicht gibt.
            paint: { 'raster-opacity': 0.9, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 },
          });
          // unter die DE-Zellflächen, aber über die übrigen Datenschichten
          if (map.getLayer(HAIL_DE_FILL_ID)) map.moveLayer(HAIL_CH_LAYER_ID, HAIL_DE_FILL_ID);
        }
        map.setLayoutProperty(
          HAIL_CH_LAYER_ID, 'visibility',
          forecastHourRef.current === 0 ? 'visible' : 'none',
        );

        setHailInfo((s) => ({ ...s, chMax: r.max, chValidMs: r.validAt.getTime() }));
      } catch {
        if (stopped || abort.signal.aborted) return;
        setHailInfo((s) => ({ ...s, chMax: null, chValidMs: null }));
        updateStatus('hail', {
          err: isSwissHailSeason(new Date())
            ? 'Hagelprodukte (MeteoSchweiz) nicht erreichbar'
            : 'außerhalb der Hagelsaison (1. April – 30. September)',
        });
      }
    };

    void load();
    const timer = window.setInterval(() => { void load(); }, HAIL_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      abort.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      if (map.getLayer(HAIL_CH_LAYER_ID)) map.setLayoutProperty(HAIL_CH_LAYER_ID, 'visibility', 'none');
      setHailInfo((s) => ({ ...s, chMax: null, chValidMs: null }));
    };
  }, [hailOn, hailProduct]);

  // Statuszeile des Hagel-Layers: ZWEI Quellen in einer Zeile, jede mit ihrem
  // eigenen Ergebnis — auf Desktop ist das die einzige Stelle, an der „aktuell
  // kein Hagel erkannt" steht (die Legendenkarte ist mobil, s. `legendsBlock`).
  // Referenzzeit = die ÄLTERE der beiden Messzeiten (`oldestRef`, V-19).
  useEffect(() => {
    if (!hailOn) return;
    const { chMax, chValidMs, deCells, deRefMs } = hailInfo;
    if (chMax == null && deCells == null) return; // noch nichts geladen
    const product = hailProduct === 'meshs' ? 'MESHS' : 'POH';
    const ch = chMax == null
      ? `MeteoSchweiz ${product} (CH) nicht erreichbar`
      : chMax <= 0
        ? `MeteoSchweiz ${product} (CH) · kein Hagel erkannt`
        : `MeteoSchweiz ${product} (CH) · max ${hailProduct === 'meshs' ? meshsLabel(chMax) : pohLabel(chMax)}`;
    const de = deCells == null
      ? 'DWD KONRAD3D (DE) nicht erreichbar'
      : deCells === 0
        ? 'DWD KONRAD3D (DE) · keine Hagelzelle'
        : `DWD KONRAD3D (DE) · ${deCells} Hagelzelle${deCells === 1 ? '' : 'n'}`;
    updateStatus('hail', {
      ok: {
        model: `${ch} · ${de}`,
        fetchedAt: Date.now(),
        ref: oldestRef([
          chValidMs != null ? measuredRef(chValidMs) : null,
          deRefMs != null ? measuredRef(deRefMs) : null,
        ]) ?? undefined,
      },
    });
  }, [hailOn, hailProduct, hailInfo]);

  // ---- Amtliche Wetterwarnungen (Phase W1) -----------------------------------
  // Bewusst ZWEI Effekte:
  //   (1) Abruf — hängt nur am Layer-Zustand. Der Vollstand (~110 KB) wird alle
  //       5 min geholt, aber nur bei aktivem Layer UND sichtbarem Tab.
  //   (2) Zeichnen — hängt zusätzlich an der Slider-Stunde. Ein Slider-Zug
  //       filtert also nur neu, er löst KEINEN Neuabruf aus.
  const warnsOn = active.has('warnings');
  useEffect(() => {
    if (!warnsOn) return;
    const map = mapRef.current;
    if (!map) return;
    const abort = new AbortController();
    let stopped = false;

    // Die beiden Quellen werden UNABHÄNGIG geholt und scheitern unabhängig.
    // `Promise.allSettled` statt `all`: ein Ausfall in der Schweiz darf die
    // deutsche Warnlage nicht vom Schirm nehmen — und umgekehrt.
    const load = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      const [de, ch] = await Promise.allSettled([
        fetchDwdWarnings(abort.signal),
        fetchChWarnings(abort.signal),
      ]);
      if (stopped || abort.signal.aborted) return;

      if (de.status === 'fulfilled') {
        setWarnRun(de.value);
        setWarnFailed(false);
      } else {
        // Fehler ⇒ diese Hälfte leeren UND als Fehler kennzeichnen. Eine leere
        // Karte ohne Hinweis läse sich als „keine Warnungen" (docs/API.md §7.3).
        setWarnRun(null);
        setWarnFailed(true);
      }

      if (ch.status === 'fulfilled') {
        setChWarnRun(ch.value);
        setChWarnFailed(false);
      } else {
        setChWarnRun(null);
        setChWarnFailed(true);
      }

      if (de.status === 'rejected' && ch.status === 'rejected') {
        setWarnInfo(null);
        updateStatus('warnings', { err: 'Amtliche Warnungen konnten nicht geladen werden (DWD und MeteoSchweiz)' });
      }
      // Beim halben Ausfall schreibt der Zeichen-Effekt den Status — er kennt
      // die gezeichnete Lage und kann benennen, welches Land fehlt.
    };

    void load();
    const timer = window.setInterval(() => { void load(); }, WARN_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      abort.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      // Layer aus ⇒ Quelle leeren: beim nächsten Einschalten darf keine alte
      // Warnlage aufblitzen, bevor der frische Stand da ist (D-04).
      (map.getSource(WARN_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)
        ?.setData({ type: 'FeatureCollection', features: [] });
      setWarnRun(null);
      setWarnInfo(null);
      setWarnFailed(false);
      setChWarnRun(null);
      setChWarnFailed(false);
    };
  }, [warnsOn]);

  // (2) Zeichnen zur eingestellten Zeit. `nowcastTick` hält die Auswahl auch
  // ohne Slider-Bewegung aktuell — eine Warnung, die abläuft, verschwindet dann
  // von selbst, statt bis zum nächsten Abruf stehen zu bleiben.
  useEffect(() => {
    if (!warnsOn) return;
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(WARN_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    // Nur wenn BEIDE Quellen fehlen, ist die Karte leer. Sonst wird die
    // erreichbare Hälfte gezeichnet und die fehlende benannt.
    if (!warnRun && !chWarnRun) { src.setData({ type: 'FeatureCollection', features: [] }); return; }

    const targetMs = Date.now() + forecastHour * 3600_000;
    const inputs = [
      ...(warnRun ? [{ alerts: warnRun.alerts, source: WARN_SOURCE_DE }] : []),
      ...(chWarnRun ? [{ alerts: chWarnRun.alerts, source: WARN_SOURCE_CH }] : []),
    ];
    src.setData(buildWarnFeaturesMulti(inputs, targetMs));
    const s = warnSummaryMulti(inputs, targetMs);
    setWarnInfo({
      total: s.total,
      perSource: s.perSource,
      // Datenalter = die ÄLTESTE der beteiligten Referenzzeiten. Ein
      // zusammengesetztes Produkt darf nicht mit der frischeren Hälfte werben
      // (V-19, Muster DACH-Komposit).
      publishedMs: [warnRun?.publishedMs, chWarnRun?.publishedMs]
        .filter((v): v is number => v != null)
        .reduce<number | null>((acc, v) => (acc == null || v < acc ? v : acc), null),
      dropped: (warnRun?.dropped ?? 0) + (chWarnRun?.dropped ?? 0),
    });

    // Statuszeile: der Leerfall ist eine AUSSAGE, kein Fehlen (§7.7). Wann er
    // gilt, steht dabei — „keine Warnungen" ohne Zeitbezug ist wertlos.
    const when = forecastHour === 0 ? 'jetzt' : `in ${forecastHour} h`;
    // Welche Länder gerade fehlen. Ein halber Ausfall darf NIE wie eine
    // vollständige Entwarnung aussehen.
    const missing = [
      ...(warnFailed ? ['Deutschland'] : []),
      ...(chWarnFailed ? ['die Schweiz'] : []),
    ];
    const scope = inputs.map((i) => i.source.country).join(' + ');
    const head = s.total === 0
      ? `Amtliche Warnungen · ${when} keine für ${scope}`
      : `Amtliche Warnungen · ${s.total} für ${when} · ${
        s.perSource.filter((p) => p.total > 0)
          .map((p) => `${p.source.country}: ${p.total} (${p.tiers[0].label})`).join(' · ')}`;
    const model = missing.length
      ? `${head} — ⚠ ${missing.join(' und ')} konnte nicht geladen werden, hier fehlen Warnungen`
      : head;
    updateStatus('warnings', {
      ok: {
        model,
        fetchedAt: Date.now(),
        // Referenzzeit = Ausgabezeit der jüngsten Meldung; im Leerfall die
        // Publikationszeit der Datei (V-19), nie die Abrufzeit.
        ref: measuredRef(
          [warnRun?.latestSentMs ?? warnRun?.publishedMs, chWarnRun?.latestSentMs ?? chWarnRun?.publishedMs]
            .filter((v): v is number => v != null)
            .reduce<number | null>((acc, v) => (acc == null || v < acc ? v : acc), null),
        ),
      },
    });
  }, [warnsOn, warnRun, chWarnRun, warnFailed, chWarnFailed, forecastHour, nowcastTick]);

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
      // Referenzzeit = der RADOLAN-Lauf, aus dem das Bewegungsfeld geschätzt wurde.
      updateStatus('flownowcast', { ok: { model: 'Optical-Flow · Lagrange-Extrapolation (RADOLAN-RV)', fetchedAt: Date.now(), ref: measuredRef(nc.runAt.getTime()) } });
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
      // Wie flownowcast: das Ensemble sitzt auf demselben RADOLAN-Lauf.
      updateStatus('poprob', { ok: { model: 'Flow-Ensemble · 15 Member (RADOLAN-RV)', fetchedAt: Date.now(), ref: measuredRef(nowcastRef.current?.runAt.getTime()) } });
    }
  }, [forecastHour, nowcastTick, active]);

  // DACH mask is country-agnostic — it stays the same across searches, so no
  // per-location refresh is needed. (Previously a country switch redrew the
  // mask; with DACH_VIEW that's a no-op.)

  // Push the layer data for the currently selected forecast hour into the
  // custom layers whenever the forecast cache or the slider position changes.
  //
  // Sub-hour positions (slider step = 0.1) are produced by pixel-wise
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
    // „Niederschlag · jetzt–2 h" = rein gemessenes Radar/Nowcast (Jan 2026-07-24):
    // der RainLayer ist IMMER die Quelle (auch im Fusion-Modus) — die Modell-/
    // Fusionshälfte ist draußen, also KEIN Zurücktreten vor `precip-forecast` mehr.
    if (!compositorRef.current) compositorRef.current = new PrecipCompositor();
    // DACH-Komposit: pro Zelle das richtige Landesradar (DE RADOLAN / AT INCA /
    // CH rzc) im jeweiligen Nowcast-Horizont. Bewusst OHNE `d2` → jenseits des
    // Land-Horizonts bleiben Zellen leer (keine ICON-D2-Verlängerung). Reguläres
    // lat/lon-Gitter → kein Warp-Mesh nötig.
    const frame = compositorRef.current.build(forecastHour, {
      rv: nowcastRef.current, inca: incaGridRef.current, rzc: meteoRadarRef.current,
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
    // Sub-Stunden-Positionen zwischen den beiden Frames interpolieren: die RGBA-
    // Bytes (R/G/B = tief/mittel/hoch, 0..255, lineare %-Kodierung) linear mischen
    // → flüssiges Scrubbing statt harter Stundensprünge. Puffer wiederverwendet.
    const { a, b, frac } = bracketAtValidTime(cl.frames, target);
    let values = a.values;
    if (frac > 0.001 && a !== b && a.values.length === b.values.length) {
      let out = cloudLerpBufRef.current;
      if (!out || out.length !== a.values.length) { out = new Uint8Array(a.values.length); cloudLerpBufRef.current = out; }
      const pa = a.values, pb = b.values, g = 1 - frac;
      for (let i = 0; i < out.length; i++) out[i] = pa[i] * g + pb[i] * frac;
      values = out;
    }
    cloudL.setFrame({ values, width: a.width, height: a.height, corners: cl.corners });
    reportValidAt(target);
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
    const targetMs = Date.now() + forecastHour * 3600_000;
    // Blend+Upsample+Pack laufen off-main (Worker, s. windFrameAtValidTimeAsync);
    // ein rascher weiterer Slider-Tick kann diese Anfrage überholen, bevor sie
    // zurück ist — Generation-Guard verhindert, dass ein verspätetes Ergebnis
    // den Wind kurz auf eine alte Slider-Position zurückspringen lässt.
    const myGen = ++windReqGenRef.current;
    windFrameAtValidTimeAsync(wd, targetMs, wind.upsampleFactor, wind.windTextureKind)
      .then((res) => {
        if (windReqGenRef.current !== myGen) return;
        if (res.kind === 'image') {
          wind.setWindData(res.frame.image, {
            width: res.frame.width, height: res.frame.height,
            uMin: res.frame.uMin, uMax: res.frame.uMax, vMin: res.frame.vMin, vMax: res.frame.vMax,
            uvBounds: wd.uvBounds,
          });
          reportValidAt(res.frame.validAt.getTime());
        } else {
          wind.setWindDataPacked(
            res.packed, res.width, res.height,
            { width: res.width, height: res.height, uMin: res.uMin, uMax: res.uMax, vMin: res.vMin, vMax: res.vMax, uvBounds: wd.uvBounds },
            res.key,
          );
          reportValidAt(targetMs);
        }
      })
      .catch(() => {
        // Worker-Fehler o. Ä. (selten, s. windFrameAtValidTimeAsync) — dieser
        // eine Tick bleibt aus, der vorige Frame bleibt sichtbar.
      });
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
          updateStatus('wind', { ok: { model: 'DWD ICON-D2 u/v 10m · 2,2 km', fetchedAt: Date.now(), ref: runRef(iconD2WindRef.current?.runAt) } });
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
      updateStatus('wind', { ok: { model: `DWD ICON-EU ${windLevel} hPa · 7 km`, fetchedAt: Date.now(), ref: runRef(euWindRef.current[windLevel]?.runAt) } });
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
    // WG-1: feine Filamente statt fetter Punkte — die hohe Dichte und die kleine
    // Punktgroesse sind EIN Paar, einzeln kippt die Optik (Globus: 1,7).
    wind.setPointSize(windCfg.intensive ? 2.0 : 1.7);
    // Schweiflänge = Tempo × Lebensdauer der Spur. 0,972 ⇒ ~36 Frames ⇒ bei den
    // ~0,6 px/Frame der Übersicht ein ~22-px-Strich mit weichem Auslauf — die
    // Kometenform der Vorlage (WetterOnline: ~25 px). Vorher 0,955 ⇒ 22 Frames
    // ⇒ 4 px, also ein Punkt. „Intensiv" hängt einen längeren Schweif an.
    // ACHTUNG, historisch: diese Rechnung stimmte bis 2026-08-08 NICHT — das
    // Trail-Komposit blendete Farbe UND Alpha ab und multiplizierte beim
    // Zusammensetzen ein zweites Mal mit dem Alpha, wodurch die Spur mit
    // fadeOpacity² zerfiel (0,972 wirkte wie 0,9448, also ~10 statt ~19 px).
    // Behoben in shaders.ts/screenFrag; Messung: audit/windpartikel-schweif.md.
    // Die Zahlen hier sind seither unverändert und beschreiben wieder die Realität.
    wind.setFadeOpacity(windCfg.intensive ? 0.982 : 0.972);
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
    const targetMs = Date.now() + forecastHour * 3600_000;
    // Sub-Stunden-Positionen im Werteraum zwischen den beiden Stunden-Frames
    // interpolieren (t_2m ist gegen feste vMin/vMax normiert → Pixel-Lerp korrekt),
    // damit der Slider flüssig scrubbt statt zwischen Stunden zu springen.
    const { a, b, frac } = bracketAtValidTime(td.frames, targetMs);
    const image = frac > 0.001 && a !== b ? lerpFrameImage(a.image, b.image, frac, 'temp-native') : a.image;
    temp.setData(image, {
      width: a.width, height: a.height,
      vMin: td.vMin, vMax: td.vMax, uvBounds: td.uvBounds,
    });
    reportValidAt(targetMs);
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
    // Sub-Stunden-Positionen zwischen den beiden Frames interpolieren (feste
    // vMin/vMax → Pixel-Lerp korrekt) → flüssiges Scrubbing statt Stundensprüngen.
    const targetMs = Date.now() + forecastHour * 3600_000;
    const { a, b, frac } = bracketAtValidTime(gd.frames, targetMs, 1);
    const image = frac > 0.001 && a !== b ? lerpFrameImage(a.image, b.image, frac, 'gust-native') : a.image;
    gust.setData(image, {
      width: a.width, height: a.height,
      vMin: gd.vMin, vMax: gd.vMax, uvBounds: gd.uvBounds,
    });
    reportValidAt(targetMs);
  }, [forecastHour, nowcastTick, active, reportValidAt]);

  // Gewitterpotenzial-Layer (Feature F1, fusioniertes ICON-D2 cape×cin×lpi): bei
  // jeder Slider-Bewegung den Frame der nächstgelegenen Gültigkeitszeit setzen.
  useEffect(() => {
    const thunder = layerRefs.current.thunder;
    if (!thunder || !active.has('thunder')) return;
    const td = iconD2ThunderRef.current;
    if (!td || td.frames.length === 0) return;
    // Sub-Stunden-Positionen zwischen den beiden Frames interpolieren (fester
    // Wertebereich 0..100 → Pixel-Lerp korrekt) → flüssiges Scrubbing. Über den
    // 0–12-h-Horizont hinaus liefert bracketAtValidTime den nächstliegenden Frame.
    const targetMs = Date.now() + forecastHour * 3600_000;
    const { a, b, frac } = bracketAtValidTime(td.frames, targetMs);
    const image = frac > 0.001 && a !== b ? lerpFrameImage(a.image, b.image, frac, 'thunder-native') : a.image;
    thunder.setData(image, {
      width: a.width, height: a.height,
      vMin: td.vMin, vMax: td.vMax, uvBounds: td.uvBounds,
    });
    reportValidAt(targetMs);
  }, [forecastHour, nowcastTick, active, reportValidAt]);

  // Blitz-Vorhersage-Layer (Feature F2, ICON-D2 lpi_max): bei jeder Slider-
  // Bewegung den Frame der nächstgelegenen Gültigkeitszeit setzen.
  useEffect(() => {
    const lightningFc = layerRefs.current.lightningfc;
    if (!lightningFc || !active.has('lightningfc')) return;
    const ld = iconD2LightningFcRef.current;
    if (!ld || ld.frames.length === 0) return;
    // minStepHours = 1: `lpi_max` ist als Intervall-Maximum am Analyse-Schritt
    // t+0 strukturell 0 → bei „jetzt" sonst flächig leer (QA-Befund D4, wie Böen).
    // Sub-Stunden-Positionen zwischen den beiden Frames interpolieren (fester
    // Wertebereich 0..30 J/kg → Pixel-Lerp korrekt) → flüssiges Scrubbing.
    const targetMs = Date.now() + forecastHour * 3600_000;
    const { a, b, frac } = bracketAtValidTime(ld.frames, targetMs, 1);
    const image = frac > 0.001 && a !== b ? lerpFrameImage(a.image, b.image, frac, 'lightningfc-native') : a.image;
    lightningFc.setData(image, {
      width: a.width, height: a.height,
      vMin: ld.vMin, vMax: ld.vMax, uvBounds: ld.uvBounds,
    });
    reportValidAt(targetMs);
  }, [forecastHour, nowcastTick, active, reportValidAt]);

  // Rotationspotenzial-Layer (Feature F5, fusioniertes+geglättetes ICON-D2
  // uh_max×uh_max_low×sdi_2): bei jeder Slider-Bewegung den Frame der nächst-
  // gelegenen Gültigkeitszeit setzen. minStepHours=1: uh_max/uh_max_low sind
  // Intervall-Maxima → am Analyse-Schritt degeneriert (audit §8.1), sonst bei
  // „jetzt" ohne Stütze. R = geglätteter Score/100 (fester 0..1-Bereich → Pixel-
  // Lerp korrekt) → flüssiges Scrubbing. Über 0–12 h hinaus nächstliegender Frame.
  useEffect(() => {
    const rotation = layerRefs.current.rotation;
    if (!rotation || !active.has('rotation')) return;
    const rd = iconD2RotationRef.current;
    if (!rd || rd.frames.length === 0) return;
    const targetMs = Date.now() + forecastHour * 3600_000;
    const { a, b, frac } = bracketAtValidTime(rd.frames, targetMs, 1);
    const image = frac > 0.001 && a !== b ? lerpFrameImage(a.image, b.image, frac, 'rotation-native') : a.image;
    rotation.setData(image, {
      width: a.width, height: a.height,
      vMin: rd.vMin, vMax: rd.vMax, uvBounds: rd.uvBounds,
    });
    reportValidAt(targetMs);
  }, [forecastHour, nowcastTick, active, reportValidAt]);

  // Schnee-Layer (Feature F4, ICON-D2 h_snow / snow_gsp): bei jeder Slider-
  // Bewegung den Frame der nächstgelegenen Gültigkeitszeit setzen.
  useEffect(() => {
    const snow = layerRefs.current.snow;
    if (!snow || !active.has('snow')) return;
    const sd = iconD2SnowRef.current;
    if (!sd || sd.frames.length === 0) return;
    // Modusabhängige visRange (< ~1 cm transparent) + minStepHours: Schneedecke
    // (h_snow) ist instantan → t+0 gültig (kein minStepHours); Neuschnee (snow_gsp)
    // ist akkumuliert → am Analyse-Schritt strukturell 0 → minStepHours=1 (wie
    // tot_prec/Böen), sonst bei „jetzt" flächig leer. R = cm/VMAX (fester Bereich)
    // → Pixel-Lerp korrekt → flüssiges Scrubbing. Über den Horizont hinaus der
    // nächstliegende Frame.
    snow.visRange = SNOW_VIS_RANGE[sd.mode];
    const minStep = sd.mode === 'fresh' ? 1 : 0;
    const targetMs = Date.now() + forecastHour * 3600_000;
    const { a, b, frac } = bracketAtValidTime(sd.frames, targetMs, minStep);
    const image = frac > 0.001 && a !== b ? lerpFrameImage(a.image, b.image, frac, 'snow-native') : a.image;
    snow.setData(image, {
      width: a.width, height: a.height,
      vMin: sd.vMin, vMax: sd.vMax, uvBounds: sd.uvBounds,
    });
    reportValidAt(targetMs);
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
    // On-device wind motion probe (dev-only ergonomic handle for phone remote
    // console): `await __windDiag()` reports measured direction sign + CSS px/s
    // straight from the GPU ping-pong so desktop↔mobile is compared as hard
    // numbers. Resolves the live layer so timing (created in addLayers) is moot.
    w.__windDiag = (o?: { count?: number; ms?: number }) =>
      layerRefs.current.wind?.windMotionDiag(o) ?? Promise.resolve({ error: 'wind layer not active — enable the Wind layer first' });
    return () => { delete w.__bsSample; delete w.__bsQA; delete w.__bsSnowlineQA; delete w.__windDiag; };
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

      // Ab Stadtansicht zusätzlich die Orte, die die BASISKARTE gerade selbst
      // beschriftet (Kleinstädte, Gemeinden, Dörfer). Jans Auftrag 2026-08-09:
      // beim Reinzoomen sollen auch Donauwörth, Neuburg & Co. ihre Temperatur
      // zeigen, nicht nur die kuratierte DACH_CITIES-Liste. Quelle sind die
      // ohnehin gerenderten `place`-Label-Features des Basemap-Stils — keine
      // neue Datenquelle, kein zusätzliches Byte, und die Zoomstaffel des Stils
      // sorgt automatisch dafür, dass nie mehr Orte auftauchen als beschriftet
      // sind. Der Wert kommt aus demselben DEM-korrigierten Sampler.
      if (zoom >= PLACE_LABEL_MIN_ZOOM) {
        for (const place of visiblePlaceLabels(map, keep)) {
          const t = getTemp({ name: place.name, lat: place.lat, lng: place.lng, rank: 4 });
          if (t == null || !Number.isFinite(t)) continue;
          writeMarker(ensureMarker(place.key, place.lng, place.lat), t, 'temp-label-rank-4');
          keep.add(place.key);
        }
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
      // keine Referenzzeit: das gewechselte Produkt hat ein eigenes Capture-Datum,
      // das direkt darunter nachgeladen wird.
      updateStatus('sat', { ok: { model: meta.title, fetchedAt: Date.now() } });
      // Das neue Produkt hat ein eigenes Capture-Datum — nachladen wie beim
      // Erst-Einbau (V-19: sonst bliebe der Status dauerhaft ohne Referenzzeit).
      void fetchWmsLatestTime(meta.layerLocalName).then((t) => {
        if (t) updateStatus('sat', { ok: { model: meta.title, fetchedAt: Date.now(), ref: measuredRef(t.getTime()) } });
      });
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
        [THUNDER_LAYER_ID]: active.has('thunder'),
        [LIGHTNINGFC_LAYER_ID]: active.has('lightningfc'),
        [SNOW_LAYER_ID]: active.has('snow'),
        [ROTATION_LAYER_ID]: active.has('rotation'),
        // „Niederschlag · jetzt–2 h": rein gemessenes Radar/Nowcast (Jan 2026-07-24).
        // Die Frame-Verfügbarkeit entscheidet zentral `precipCompositeReady`
        // (precipSource.ts, DACH-OR über die DE/AT/CH-Radarhorizonte) — jenseits des
        // Horizonts aus (keine Modellverlängerung). Der RainLayer ist die EINZIGE
        // Precip-Quelle (auch im Fusion-Modus); die Fusion-Modellhälfte ist raus.
        [NOWCAST_LAYER_ID]: active.has('nowcast') && precipFrameReady(forecastHour) && modelSourceRef.current.radar,
        // Fusion-/Modell-Niederschlag (`precip-forecast`) stillgelegt → nie sichtbar.
        'precip-forecast': false,
        [SAT_LAYER_ID]: active.has('sat'),
        [LIGHTNING_LAYER_ID]: active.has('lightning'),
        [STATIONS_LAYER_ID]: active.has('stations'),
        [CONFIDENCE_LAYER_ID]: active.has('confidence'),
        [SNOWLINE_CASING_ID]: active.has('snowline'),
        [SNOWLINE_LAYER_ID]: active.has('snowline'),
        // Zellbahnen: nur im belegten Fenster jetzt … +60 min. Steht der Slider
        // weiter vorn, ist der Layer AUS statt eine Aussage vorzutäuschen, für
        // die es keine Prognosespur gibt (D-04, Muster wie `nowcast` jenseits
        // des Radarhorizonts). Die Legende benennt genau das.
        ...Object.fromEntries(CELLS_LAYER_IDS.map((id) => [
          id, active.has('cells') && forecastHour * 60 <= CELLS_HORIZON_MIN,
        ])),
        // Hagel: beide Quellen sind reine ANALYSEN („jetzt"). Ab der ersten
        // Vorhersagestunde ist der Layer aus, statt einen alten Stand als
        // Aussage über die eingestellte Stunde auszugeben (D-04).
        ...Object.fromEntries(HAIL_LAYER_IDS.map((id) => [id, active.has('hail') && forecastHour === 0])),
        // Warnungen: KEINE Stundenschranke — anders als Radar-Analysen tragen
        // amtliche Warnungen ihre eigene Gültigkeit (`onset`/`expires`) und
        // reichen oft über den Slider hinaus. Gefiltert wird über die Daten
        // (`buildWarnFeatures` zur eingestellten Zeit), nicht über die
        // Sichtbarkeit: gilt zur gewählten Stunde nichts, ist die Quelle leer —
        // und die Legende sagt genau das.
        ...Object.fromEntries(WARN_LAYER_IDS.map((id) => [id, active.has('warnings')])),
        [FLOW_NOWCAST_LAYER_ID]: active.has('flownowcast') && modelSourceRef.current.radar,
        [POP_LAYER_ID]: active.has('poprob') && modelSourceRef.current.radar,
        [DIM_LAYER_ID]: true, // dark wash always on — keeps the canvas dark even with no weather layer
      };
      for (const id of Object.keys(set)) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', set[id] ? 'visible' : 'none');
        }
      }
      // precip-forecast/NOWCAST/FLOW_NOWCAST/POP bleiben UNTER der Länder-Maske
      // (wie temp/wind/clouds, s. addLayers) — Niederschlag soll auf DACH
      // begrenzt bleiben statt kontinental durchzuscheinen (User-Report).
      // Vertrauens-Schleier ÜBER den Datenschichten — sonst verdeckt das Radar
      // die Schraffur. Die Stationen bleiben darüber (nächster moveLayer).
      if (map.getLayer(CONFIDENCE_LAYER_ID)) map.moveLayer(CONFIDENCE_LAYER_ID);
      // Schneefallgrenze als Linie ganz oben (dünn → verdeckt nichts), über den
      // Rastern und dem Schleier.
      if (map.getLayer(SNOWLINE_CASING_ID)) map.moveLayer(SNOWLINE_CASING_ID);
      if (map.getLayer(SNOWLINE_LAYER_ID)) map.moveLayer(SNOWLINE_LAYER_ID);
      // Amtliche Warnungen über die Raster, aber UNTER Zellbahnen/Hagel: die
      // Warnfläche ist großflächig und würde die kleinen Objekte sonst
      // überdecken. Kein Rangurteil — nur Lesbarkeit.
      for (const id of WARN_LAYER_IDS) if (map.getLayer(id)) map.moveLayer(id);
      // Zellbahnen über die Raster heben (sonst verdeckt das Radar den Trichter),
      // in Zeichenreihenfolge — die Stationen bleiben darüber (nächster moveLayer).
      for (const id of CELLS_LAYER_IDS) if (map.getLayer(id)) map.moveLayer(id);
      // Hagel darüber: ein Hagelsignal darf von keiner Datenschicht verdeckt
      // werden. Reihenfolge CH-Raster → DE-Fläche → Umriss → Punkt.
      for (const id of HAIL_LAYER_IDS) if (map.getLayer(id)) map.moveLayer(id);
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

  // (Der frühere lokale `fmtTime` ist entfallen: seine drei Aufrufer sind auf
  //  `statusStamp`/`dataAgeText` umgestellt, das die Uhrzeit selbst formatiert.)

  // V-20: Zustand der Warm-Manifeste (`latest-grib.json` / `latest-wind.json`).
  // Die Loader melden ihn beim Auflösen; hier wird er nur gelesen. Fällt der
  // Schnellzugriff aus, lädt die Karte weiter — nur langsamer, und genau das
  // soll man sehen statt sich über plötzliche Wartezeiten zu wundern.
  const [manifestHealth, setManifestHealth] = useState<ManifestHealth>(() => getManifestHealth());
  useEffect(() => subscribeManifestHealth(setManifestHealth), []);
  const manifestNote = useMemo(() => {
    if (manifestHealth.state === 'absent') {
      return {
        text: 'Schnellzugriff nicht aktuell — Daten kommen direkt von der Quelle.',
        title: `Kein nutzbares Warm-Manifest (${manifestHealth.sources.join(', ') || '—'}). Die Layer lösen den Lauf per Verzeichnis-Abfrage auf: gleiche Daten, längere Ladezeit.`,
      };
    }
    if (manifestHealth.state === 'stale') {
      const age = manifestHealth.updatedAtMs != null ? ageText(clockMs - manifestHealth.updatedAtMs) : 'seit unbekannter Zeit';
      return {
        text: `Schnellzugriff zuletzt ${age} aufgefrischt.`,
        title: `Das Warm-Manifest (${manifestHealth.sources.join(', ') || '—'}) wird nicht mehr regelmäßig umgelegt. Die Karte zeigt den zuletzt gewärmten Lauf.`,
      };
    }
    return null;   // 'fresh' und 'unknown' erzeugen bewusst keine Zeile
  }, [manifestHealth, clockMs]);

  // V-19: EINE Beschriftung des Datenalters für alle drei Statusflächen
  // (.data-badge, Layer-Zeile im Dock, Statuspille) — damit sie nicht wieder
  // auseinanderlaufen. `clockMs` tickt ohnehin minütlich (s. Uhr im Deck), das
  // Alter aktualisiert sich also von selbst.
  const statusStamp = (ok: { fetchedAt: number; ref?: DataRef }) => ({
    text: dataAgeText(ok.ref, ok.fetchedAt, clockMs),
    stale: isStale(ok.ref, clockMs),
  });

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
    let horizon = forecast ? Math.max(0, forecast.hours.length - 1) : 0;
    // Wolken spannen den vollen ICON-D2-CLCT-Horizont (0–12 h). Niederschlag trägt
    // NUR seinen Radar-/Nowcast-Horizont bei (DE 2 / AT 3 / CH 0,5 h) — die Modell-
    // hälfte ist draußen (Jan 2026-07-24), also verlängert Niederschlag den Slider
    // höchstens bis ~3 h (INCA). Im Testmodus „Nur-Jetzt" bleibt der Slider damit
    // bei aktivem Niederschlag kurz (jetzt–2/3 h) statt bis 12/24 h.
    if (active.has('clouds')) horizon = Math.max(horizon, cloudsHorizonHours());
    if (active.has('nowcast')) horizon = Math.max(horizon, precipRadarHorizonHours(precipAvailability()));
    return horizon;
    // liest die Refs → nowcastTick triggert Neuberechnung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecast, active, nowcastTick]);

  // Wenn der Horizont schrumpft (Niederschlag deaktiviert), Slider zurückholen.
  // Erst wenn der Forecast da ist: vorher ist `sliderMax` 0 und würde eine aus
  // der URL (`t`) wiederhergestellte Stunde noch vor dem ersten Frame auf 0 klemmen (V-R-07).
  useEffect(() => {
    if (forecast && forecastHour > sliderMax) setForecastHour(sliderMax);
  }, [forecast, sliderMax, forecastHour]);

  // Testmodus „Nur-Jetzt": Forecast-Frames (bis +NOWONLY_AHEAD_H) NACH BEDARF —
  // erst wenn der Nutzer den Slider das erste Mal von „jetzt" wegbewegt, das
  // Fenster der AKTUELL AKTIVEN Grid-Layer erweitern und neu laden. Die
  // Jetzt-Bracket-Schritte kommen dabei aus dem Decompress-Cache (kein Netz),
  // nur die +1/+2 h-Schritte sind wirklich neue Fetches. Einmalig (Guard):
  // danach aktivierte Layer lesen forecastAheadHRef in ihrem eigenen
  // Aktivierungs-Effekt und laden das Fenster von sich aus.
  useEffect(() => {
    if (!(START_NOW_ONLY && !embedded)) return;
    if (forecastHour <= 0 || forecastAheadHRef.current >= NOWONLY_AHEAD_H) return;
    forecastAheadHRef.current = NOWONLY_AHEAD_H;
    if (active.has('wind')) void installWindRef.current?.();
    if (active.has('temp')) void installTempRef.current?.();
    if (active.has('gust')) void installGustRef.current?.();
    if (active.has('clouds')) void installCloudsRef.current?.();
    if (active.has('nowcast')) void installIconD2Ref.current?.();
  }, [forecastHour, active]);

  // Slider-Grenzen: eingebettet auf das Eventfenster des gewählten Tages begrenzt
  // (Tagesablauf), sonst 0 … Horizont. Auf den verfügbaren Horizont geklemmt.
  const dayLo = embedded && embedHourRange ? Math.max(0, Math.min(sliderMax, embedHourRange[0])) : 0;
  const dayHi = embedded && embedHourRange ? Math.max(dayLo + 0.2, Math.min(sliderMax, embedHourRange[1])) : sliderMax;

  // Play: Slider Schritt für Schritt durchs Fenster animieren, am Ende zurück an
  // den Anfang. Eingebettet = Eventfenster; Vollansicht = 0…Horizont (Zeit-Deck ▶).
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setForecastHour(h => {
        const next = Math.round((h + 1) * 10) / 10;
        return next > dayHi ? dayLo : next;
      });
    }, 900);
    return () => window.clearInterval(id);
  }, [playing, dayLo, dayHi]);

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

  // Router (RT1): Permalink ist jetzt Pfad + Query (`src/router/urlState.ts`) und
  // wird vom Route-Wrapper geschrieben — MapView MELDET nur. Der frühere
  // `#m=`-Schreiber ist damit ersetzt; `decodeMapState` bleibt für Alt-Links.
  //
  // (1) Layer-Set von außen spiegeln (URL / Zurück), nur bei echter Differenz.
  const routeLayersKey = routeLayers ? [...routeLayers].sort().join(',') : null;
  useEffect(() => {
    if (routeLayersKey == null || !routeLayers) return;
    if ([...active].sort().join(',') === routeLayersKey) return;
    mirrorRef.current = true;
    setActive(new Set<LayerKey>(routeLayers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLayersKey]);
  // (2) Nutzer-Layerwechsel melden (nicht beim Mount, nicht nach einem Spiegel-Lauf).
  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (prevActiveRef.current === active) return;
    prevActiveRef.current = active;
    if (mirrorRef.current) { mirrorRef.current = false; return; }
    if (embedded) return;
    routeCbRef.current.onLayersChange?.([...active], lastAddedRef.current);
  }, [active, embedded]);
  // (3) Stunde: melden + von außen (Zurück) übernehmen.
  const prevHourRef = useRef(forecastHour);
  useEffect(() => {
    if (prevHourRef.current === forecastHour) return;
    prevHourRef.current = forecastHour;
    if (!embedded) routeCbRef.current.onHourChange?.(forecastHour);
  }, [forecastHour, embedded]);
  useEffect(() => {
    if (routeHour == null) return;
    if (Math.abs(routeHour - forecastHourRef.current) > 0.05) setForecastHour(routeHour);
  }, [routeHour]);
  // (4) Modellquelle: melden + von außen (Zurück) übernehmen.
  const prevModelRef = useRef(modelSource);
  useEffect(() => {
    if (prevModelRef.current === modelSource) return;
    prevModelRef.current = modelSource;
    if (!embedded) routeCbRef.current.onModelSourceChange?.(modelSource);
  }, [modelSource, embedded]);
  const routeModelKey = routeModelSource ? JSON.stringify(routeModelSource) : null;
  useEffect(() => {
    if (!routeModelSource) return;
    setModelSource((s) => applyModelSourceInit(s, routeModelSource));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeModelKey]);


  // Mobile (<768px / kurzes Landscape): EIN persistentes Bottom-Sheet mit
  // Segment-Umschalter „Layer · Modell · Vorhersage" und drei Snap-Zuständen
  // collapsed/half/full (Variante C, audit/mockups/wetterkarte-c-spec.md).
  // Führt die zwei getrennten FABs des §8-Follow-ups bewusst wieder zusammen —
  // von Jan freigegeben (plan.md Phase 1-C). Desktop/Tablet bleiben unberührt
  // (Sheet dort per CSS ausgeblendet).
  type SheetSnap = 'collapsed' | 'half' | 'full';
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('half');
  // Render-Ort des Punkt-Forecasts: Desktop-Panel (rechtes Deck-Panel) vs.
  // mobiles Bottom-Sheet. Per JS-Media-Query entschieden, weil die Komponente
  // beim Mount fetcht (Punktforecast + Alerts + Pollen) und deshalb nie doppelt
  // existieren darf.
  const isMobileMap = useMediaQuery(MOBILE_MAP_MEDIA_QUERY);

  // Bühnen-Geometrie ändert sich mit Breakpoint/Tab/Overlay — MapLibre nachmessen,
  // sonst rendert die Karte auf veralteter Containergröße.
  useEffect(() => {
    const raf = requestAnimationFrame(() => mapRef.current?.resize());
    return () => cancelAnimationFrame(raf);
  }, [isMobileMap, mobileTab, modelsOpen]);

  const sheetDragRef = useRef<{ startY: number; startSnap: SheetSnap; moved: boolean } | null>(null);

  const onSheetGrabPointerDown = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const startSnap = sheetSnap;
    sheetDragRef.current = { startY, startSnap, moved: false };
    const snapUp: Record<SheetSnap, SheetSnap> = { collapsed: 'half', half: 'full', full: 'full' };
    const snapDown: Record<SheetSnap, SheetSnap> = { full: 'half', half: 'collapsed', collapsed: 'collapsed' };
    const onMove = (ev: PointerEvent) => {
      const drag = sheetDragRef.current;
      if (!drag) return;
      const delta = drag.startY - ev.clientY;                    // hoch = positiv
      if (Math.abs(delta) > 8) drag.moved = true;
      if (delta > 220) setSheetSnap('full');                     // langer Zug: zwei Stufen
      else if (delta > 40) setSheetSnap(snapUp[drag.startSnap]);
      else if (delta < -220) setSheetSnap('collapsed');
      else if (delta < -40) setSheetSnap(snapDown[drag.startSnap]);
      else setSheetSnap(drag.startSnap);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const drag = sheetDragRef.current;
      sheetDragRef.current = null;
      // Tap (kein Zug) auf den Kopfbereich öffnet aus collapsed nach half.
      if (drag && !drag.moved && drag.startSnap === 'collapsed') setSheetSnap('half');
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  // ==========================================================================
  // Render. Eingebetteter Modus (Event-Ergebnisseite u. ä.) behält die schlanke
  // Alt-Chrome aus MapView.css (Karte + Tagesablauf-Slider + Quellen-Badge);
  // die Vollansicht rendert das Command-Deck (references/*-karte.png).
  // ==========================================================================

  if (embedded) {
    return (
      <div className="map-view map-view-embedded">
        <div className="map-topbar">
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

        <div className="data-badge">
          <span title={COUNTRY_PROFILES[location.country].stackLabel}>
            {({ DE: '🇩🇪', AT: '🇦🇹', CH: '🇨🇭' } as const)[location.country]}{' '}
            {COUNTRY_PROFILES[location.country].name} · {COUNTRY_PROFILES[location.country].stackLabel}
          </span>
          {LAYER_OPTIONS.filter(o => active.has(o.key)).map(o => {
            const s = statuses[o.key];
            const st = s.ok ? statusStamp(s.ok) : null;
            return (
              <span
                key={o.key}
                className={s.err ? 'err' : st?.stale ? 'stale' : ''}
                title={s.err ?? (st?.stale ? `Dieser Datensatz ist ungewöhnlich alt (${ageText(clockMs - (s.ok!.ref?.atMs ?? clockMs))}).` : undefined)}
              >
                {s.err
                  ? `${o.label}: ${s.err}`
                  : s.ok && st
                    ? `${st.stale ? '⚠ ' : ''}${o.label} · ${s.ok.model.toUpperCase()} · ${st.text}`
                    : `${o.label} wird geladen…`}
              </span>
            );
          })}
          {manifestNote && <span className="mdk-manifest-note" title={manifestNote.title}>{manifestNote.text}</span>}
        </div>

        {forecast && (
          <div className="forecast-slider">
            <div className="forecast-slider-row">
              <button
                type="button"
                className="forecast-now"
                onClick={() => setPlaying(p => !p)}
                title={playing ? 'Tagesablauf pausieren' : 'Tagesablauf abspielen'}
                aria-pressed={playing}
              >
                {playing ? '⏸' : '▶'}
              </button>
              <div className="forecast-track">
                <input
                  type="range"
                  min={dayLo}
                  max={dayHi}
                  step={0.1}
                  value={Math.max(dayLo, Math.min(dayHi, forecastHour))}
                  onChange={e => { setPlaying(false); scheduleForecastHour(Number(e.target.value)); }}
                  aria-label="Uhrzeit am Tag"
                />
              </div>
              <span className="forecast-label">{forecastLabel}</span>
            </div>
          </div>
        )}

        <div ref={containerRef} className="map-container" />
      </div>
    );
  }

  // ---- Deck-Bausteine ------------------------------------------------------
  const activeEntry = modelEntry(activeModelId(modelSource));
  const activeModelName = activeEntry?.name ?? 'Native';
  const isNativeActive = activeEntry?.special === 'native';
  // Quellen-Pille/Modell-Karte: Native zeigt die Komposit-Zusammensetzung
  // (Vorlage: „ICON-D2 · MOSMIX · RADOLAN-RV · 2,2 km"), konkrete Modelle
  // Betreiber · Auflösung · Horizont.
  const modelMetaLine = isNativeActive
    ? `ICON-D2 · MOSMIX · ${RADAR_SOURCE[modelSource.country].name} · 2,2 km`
    : [
        activeEntry?.operator,
        activeEntry?.resolutionKm != null ? `${String(activeEntry.resolutionKm).replace('.', ',')} km` : null,
        activeEntry && activeEntry.horizonH > 0 ? `+${activeEntry.horizonH} h` : null,
      ].filter(Boolean).join(' · ');
  const openModels = () => { if (isMobileMap) setMobileTab('modelle'); else setModelsOpen(true); };
  const clock = new Date(clockMs);
  const clockTime = clock.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const clockDate = `${clock.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')} · ${clock.getDate()} ${clock.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')}`.toUpperCase();
  const hourClamped = Math.max(dayLo, Math.min(dayHi, forecastHour));

  /** Layer-Zeile — Dock (klein) und mobiler Layer-Screen (groß, mit Sublabels
   *  im Detail-Modus). Gleiche Toggles, gleiche `toggle()`-Logik wie bisher. */
  const layerRowDeck = (key: LayerKey, accent: string, sub?: string, big = false) => {
    const opt = LAYER_BY_KEY.get(key)!;
    const on = active.has(key);
    const st = statuses[key];
    const stampInfo = st?.ok ? statusStamp(st.ok) : null;
    const stamp = st?.err
      ? '⚠ Fehler'
      : stampInfo ? `${stampInfo.stale ? '⚠ ' : ''}${stampInfo.text}` : on ? 'lädt…' : '';
    const showSub = big && layerMode === 'detail';
    return (
      <button
        key={key}
        type="button"
        className={`${big ? 'mdk-m-layer' : 'mdk-layer'}${on ? ' is-on' : ' is-off'}`}
        data-accent={accent}
        role="switch"
        aria-checked={on}
        onClick={() => toggle(key)}
        onMouseEnter={big ? undefined : () => setLayerHover(key)}
        onMouseLeave={big ? undefined : () => setLayerHover(null)}
        onFocus={big ? undefined : () => setLayerHover(key)}
        onBlur={big ? undefined : () => setLayerHover(null)}
        title={opt.title}
      >
        <span className="mdk-layer-ic"><LayerIcon layer={key} size={big ? 16 : 14} /></span>
        <span className="mdk-layer-tx">
          <span className="mdk-layer-label">{opt.label}</span>
          {showSub && (sub || (on && stamp)) && (
            <span className="mdk-layer-sub">{[sub, on ? stamp : null].filter(Boolean).join(' · ')}</span>
          )}
        </span>
        <span className="mdk-switch" aria-hidden="true"><span className="mdk-switch-knob" /></span>
      </button>
    );
  };

  const satSeg = (
    <div className="mdk-subseg" data-accent="slate" role="group" aria-label="Satellitenprodukt">
      {SATELLITE_PRODUCTS.map(p => (
        <button
          key={p}
          type="button"
          className={satProduct === p ? 'is-active' : ''}
          onClick={() => setSatProduct(p)}
          title={SAT_PRODUCT_FULL_LABELS[p]}
        >
          {SAT_PRODUCT_LABELS[p]}
        </button>
      ))}
    </div>
  );

  // Schnee-Modus-Umschalter (Feature F4) — analog satSeg: Schneedecke ↔ Neuschnee.
  const snowSeg = (
    <div className="mdk-subseg" data-accent="steel" role="group" aria-label="Schnee-Modus">
      {SNOW_MODES.map(m => (
        <button
          key={m}
          type="button"
          className={snowMode === m ? 'is-active' : ''}
          onClick={() => setSnowMode(m)}
          title={SNOW_MODE_FULL_LABELS[m]}
        >
          {SNOW_MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );

  // Hagel-Produktumschalter (Phase HA1) — betrifft NUR die Schweiz; der
  // DE-Anteil (KONRAD3D-Zellen) bleibt in beiden Stellungen sichtbar.
  const hailSeg = (
    <div className="mdk-subseg" data-accent="violet" role="group" aria-label="Hagel-Produkt (Schweiz)">
      {HAIL_PRODUCTS.map(p => (
        <button
          key={p}
          type="button"
          className={hailProduct === p ? 'is-active' : ''}
          onClick={() => setHailProduct(p)}
          title={HAIL_PRODUCT_FULL_LABELS[p]}
        >
          {HAIL_PRODUCT_LABELS[p]}
        </button>
      ))}
    </div>
  );

  const windDeckControls = (
    <>
      <span className="mdk-winddeck-label">Dichte</span>
      <div className="mdk-winddeck-seg" role="group" aria-label="Wind-Partikel">
        <button
          type="button"
          className={!windCfg.on ? 'is-active' : ''}
          onClick={() => setWindCfg(c => ({ ...c, on: false }))}
          title="Nur Wind-Heatmap, keine Partikel-Animation"
        >
          Aus
        </button>
        <button
          type="button"
          className={windCfg.on && !windCfg.intensive ? 'is-active' : ''}
          onClick={() => setWindCfg(c => ({ ...c, on: true, intensive: false }))}
          title="Normale Partikeldichte"
        >
          Normal
        </button>
        <button
          type="button"
          className={windCfg.on && windCfg.intensive ? 'is-active' : ''}
          onClick={() => setWindCfg(c => ({ ...c, on: true, intensive: true }))}
          title="Dichtere, längere Partikel"
        >
          Intensiv
        </button>
      </div>
      {windCfg.on && (
        <label className="mdk-winddeck-density" title="Partikel-Dichte">
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
      <span className="mdk-winddeck-label">Höhe</span>
      <div className="mdk-winddeck-seg is-level" role="group" aria-label="Wind-Höhe">
        <button
          type="button"
          className={windLevel === 'surface' ? 'is-active' : ''}
          onClick={() => setWindLevel('surface')}
          title="Bodennah · 10 m (ICON-D2, 2,2 km)"
        >
          10&nbsp;m
        </button>
        {WIND_PRESSURE_LEVELS.map(lvl => (
          <button
            key={lvl}
            type="button"
            className={windLevel === lvl ? 'is-active' : ''}
            onClick={() => setWindLevel(lvl)}
            title={`${lvl} hPa Höhenwind (ICON-EU, ~7 km)`}
          >
            {lvl}
          </button>
        ))}
      </div>
    </>
  );

  const timeDeck = forecast ? (
    <div className="mdk-timedeck mdk-glass">
      <div className="mdk-td-row">
        <button
          type="button"
          className="mdk-td-play"
          onClick={() => setPlaying(p => !p)}
          aria-pressed={playing}
          title={playing ? 'Zeitraffer pausieren' : 'Zeitraffer abspielen'}
        >
          {playing ? <IcoPause /> : <IcoPlay />}
        </button>
        <div className="mdk-td-track">
          <div className="mdk-td-ticks">
            <button
              type="button"
              className="mdk-td-now"
              disabled={forecastHour === 0}
              onClick={() => { setPlaying(false); setForecastHour(0); }}
              title="Auf jetzt zurücksetzen"
            >
              {(forecastLabel ?? 'jetzt').replace('.,', '')}
            </button>
            {sliderMax >= 4 && (
              <>
                <span>+{Math.round(sliderMax / 4)} h</span>
                <span>+{Math.round(sliderMax / 2)} h</span>
                <span>+{Math.round((sliderMax * 3) / 4)} h</span>
                <span>+{Math.round(sliderMax)} h</span>
              </>
            )}
          </div>
          <input
            type="range"
            min={dayLo}
            max={dayHi}
            step={0.1}
            value={hourClamped}
            onChange={e => { setPlaying(false); scheduleForecastHour(Number(e.target.value)); }}
            aria-label="Forecast-Stunde"
            style={{ '--tl-fill': `${((hourClamped - dayLo) / Math.max(dayHi - dayLo, 1e-6)) * 100}%` } as React.CSSProperties}
          />
        </div>
        {dataValidAtMs != null && (
          <span className="mdk-td-stand">
            Stand · {new Date(dataValidAtMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', weekday: 'short' }).replace('.,', '')}
          </span>
        )}
      </div>
      <div className="mdk-td-legend">
        <span className="mdk-td-legend-label">Legende</span>
        <span className="mdk-td-legend-item">Temp <i className="mdk-ramp mdk-ramp-temp" aria-hidden="true" /> −10…30°</span>
        <span className="mdk-td-legend-item">Regen <i className="mdk-ramp mdk-ramp-precip" aria-hidden="true" /> 0,1…&gt;10</span>
        <span className="mdk-td-legend-item"><span className="mdk-td-legend-wind" aria-hidden="true">⟶</span> Wind</span>
        <span className="mdk-td-legend-item"><i className="mdk-td-legend-stationdot" aria-hidden="true" /> Stationen</span>
        <span className="mdk-td-legend-item"><i className="mdk-td-legend-radar" aria-hidden="true" /> Radar-Grenze</span>
      </div>
    </div>
  ) : null;

  /** Dynamischer Titel-Zusatz je Layer (Schnee-Modus, Sicherheits-Bezug,
   *  Experten-Hinweis) für die Readout-Karte. Die mobile Stage-Legende trägt
   *  ihre Zusätze weiterhin im eigenen Markup — dort bleibt alles unverändert. */
  const layerTitleSuffix = (key: LayerKey): React.ReactNode => {
    if (key === 'snow') return `· ${snowMode === 'depth' ? 'Schneedecke' : 'Neuschnee'}`;
    if (key === 'confidence') return `· ${active.has('nowcast') ? 'Regen' : 'Temperatur'}`;
    if (key === 'rotation') return '· Experten-Layer';
    return null;
  };

  /** Ausführlicher Erklär-/Ehrlichkeitstext je Layer — die EINE Quelle für die
   *  mobile Stage-Legende (`legendsBlock`) und die Readout-Karte auf Desktop
   *  (Phase KD-R). Nur diese acht Layer haben einen; die übrigen tragen die
   *  Beschreibung aus `LAYER_INFO` (LayerInfoPanel). */
  const layerExtNote = (key: LayerKey): React.ReactNode => {
    switch (key) {
      case 'warnings':
        return (
          <>
            Die <b>amtlichen Wetterwarnungen</b> von <b>DWD</b> (Deutschland, CAP, landkreisgenau)
            und <b>MeteoSchweiz</b> (Schweiz, Warnregionen, über MeteoAlarm), 5-Minuten-Takt —
            das <b>amtliche Warnprodukt</b>, auf das alle anderen Layer dieser Karte verweisen.
            Überschrift, Beschreibung und Handlungshinweis werden <b>wortwörtlich übernommen</b>.
            Die Farbe ist in Deutschland die <b>amtliche Warnfarbe</b> aus der Meldung; der
            Schweizer Feed führt keine mit — dort ist sie aus der <b>amtlichen Gefahrenstufe
            abgeleitet</b> und in der Legende als solche gekennzeichnet. Die Stufenskalen bleiben{' '}
            <b>getrennt</b>: DWD-Stufe 1 ist gelb, die Schweizer Stufe 1 grün. Der Zeitregler
            wählt aus, was zur eingestellten Stunde gilt; Warnungen ohne festes Ende sind als solche
            gekennzeichnet. Höhenbeschränkungen stehen bei deutschen Warnungen im Steckbrief
            („gilt nur unterhalb 600 m"); bei Schweizer Warnungen steht die Höhe <b>im amtlichen
            Text selbst</b> — das dortige Datenfeld widerspricht ihm teils und wird deshalb nicht
            ausgewertet. Ehrliche Grenzen: <b>Österreich fehlt</b> — dort warnt{' '}
            {warningsSourceFor('AT').operator}, und eine leere Fläche über Österreich heißt{' '}
            <b>nicht</b> „keine Warnung". <b>Kein Ersatz für die amtliche Bekanntmachung</b> —
            maßgeblich bleiben dwd.de/warnungen und meteoschweiz.admin.ch.
          </>
        );
      case 'snow':
        return (
          <>
            {snowMode === 'depth'
              ? <>Aktuelle <b>Schneehöhe</b> (ICON-D2 <b>h_snow</b>, 2,2 km) als Fläche in cm — Modell-Schneedecke, keine Messung.</>
              : <><b>Neuschnee</b>-Zuwachs (ICON-D2 <b>snow_gsp+snow_con</b> → cm) über das Vorhersagefenster; Summe wächst mit dem Horizont.</>}
            {' '}Die <b>Menge</b> als Fläche — NICHT die Schneegrenzen-Linie („Schneegrenze"). Ehrliche Grenzen:
            am Modellrand ohne Wert (transparent); Schnee-Wasser-Verhältnis ist eine <b>Näherung</b>
            (rho_snow bevorzugt); nur naher NWP-Horizont.
          </>
        );
      case 'lightningfc':
        return (
          <>
            Prognostiziertes Blitzrisiko aus dem ICON-D2 <b>Lightning Potential Index</b> (lpi_max,
            2,2 km), über den Slider 0–12 h in die <b>Zukunft</b>. Ehrliche Grenzen: nur naher
            NWP-Horizont (~0–12 h), am Modellrand ohne Wert (transparent), und <b>Prognose ≠ Messung</b> —
            die gemessenen Einschläge der letzten Stunde zeigt der Layer „Blitze".
          </>
        );
      case 'thunder':
        return (
          <>
            Fusion aus CAPE (Energie) × CIN (Deckel) × LPI (Blitzbereitschaft), ICON-D2 2,2 km.
            Flächige Vorwarnung <b>vor</b> dem ersten Radarecho. Ehrliche Grenzen: nur naher
            NWP-Horizont (~0–12 h), am Modellrand ohne Wert (transparent), und <b>Potenzial ≠ Auslösung</b> —
            hohes CAPE allein ist noch kein Gewitter (deshalb die CIN-Dämpfung + LPI-Realisierung).
          </>
        );
      case 'rotation':
        return (
          <>
            Geglättete Modell-<b>VERDACHTS</b>flächen für rotierende Aufwinde/Superzellen aus
            ICON-D2 <b>uh_max</b> + <b>uh_max_low</b> (Updraft-Helicity) und <b>sdi_2</b> (Supercell-Index),
            0–12 h. <b>Kein amtliches Warnprodukt, kein Warnersatz</b> — maßgeblich sind die
            <b> DWD-Warnungen</b> (Layer „Blitze"/amtliche Unwetterwarnung). <b>Verdacht ≠ Ereignis</b>,
            <b> hohe Fehlalarmrate</b>; die Felder sind rauschig und werden bewusst geglättet. Nur naher
            NWP-Horizont, am Modellrand ohne Wert (transparent). Nischensignal für Storm-Enthusiasten.
          </>
        );
      case 'hail':
        return (
          <>
            Zwei amtliche Radarprodukte, bewusst <b>nicht vermischt</b>.
            <b> Fläche:</b> MeteoSchweiz <b>MESHS</b> (maximal erwartete Korngröße) bzw. <b>POH</b>
            {' '}(Hagelwahrscheinlichkeit), 1 km / 5 Min, <b>nur 1. April–30. September</b> — aus dem
            {' '}<b>Schweizer</b> Radarverbund, dessen Reichweite über die Grenze nach Süddeutschland
            und Vorarlberg geht und dort ausdünnt.
            <b> Zellen:</b> DWD <b>KONRAD3D</b> — Zellen, in denen das Radar Hagel erkennt, mit
            Hagelfläche und Hinweis auf Großhagel, aus dem <b>deutschen</b> Radarverbund
            (ebenfalls grenzüberschreitend). <b>Österreich hat keine eigene offene Hagelquelle</b>
            {' '}(weder GeoSphere noch ALDIS) — im <b>Osten</b> Österreichs gibt es daher keine
            Abdeckung; das heißt <b>nicht</b>, dass es dort nicht hagelt.
            Ehrliche Grenzen: <b>Radarerkennung, keine Bodenmeldung</b>; gilt für <b>jetzt</b>
            {' '}(ab der ersten Vorhersagestunde ist der Layer aus); <b>kein amtliches Warnprodukt,
            kein Warnersatz</b> — maßgeblich sind die Warnungen von DWD und MeteoSchweiz.
            Kein Hagel erkannt = an den allermeisten Tagen der Normalfall.
          </>
        );
      case 'cells':
        return (
          <>
            {/* Z2-4: der Standortbezug steht ZUERST — er ist die Antwort, alles
                darunter ist Erklärung. Im Übersichts-Modus fehlt er ersatzlos. */}
            {cellsRelevance != null && <><b>{cellsRelevance.text}</b>{' '}</>}
            Erkannte konvektive Zellen aus <b>DWD KONRAD3D</b> (5-Minuten-Takt). Der Umriss ist
            <b> gemessen</b>; Spur, <b>Pfeil</b> (Zugrichtung über die volle Stunde),{' '}
            <b>Zeitmarken</b> (+15/+30/+60 Min) und Trichter sind <b>prognostiziert</b> (bis
            +60 Min) — alles stammt <b>vom DWD</b>, der Trichter ist die <b>amtliche</b>{' '}
            Unsicherheitsellipse je Stützstelle, keine eigene Schätzung; nach hinten wird er
            durchsichtiger, weil er dort unsicherer ist. Die angezeigte Zuggeschwindigkeit stammt
            aus <b>derselben Geometrie wie die gezeichnete Spur</b> und ist auf 5 km/h gerundet.
            Ehrliche Grenzen: <b>kein amtliches Warnprodukt, kein Warnersatz</b> — maßgeblich sind
            die DWD-Warnungen; eine <b>Ankunftszeit gibt es nur als Spanne</b> und nur mit
            amtlicher Ellipse, sonst gar keine; beim Herauszoomen entfallen zuerst die Zeitmarken,
            dann der Trichter-Verlauf, <b>Umriss und Spur bleiben immer</b>; die Abdeckung ist die
            Reichweite des <b>deutschen</b> Radarverbunds (reicht über die Grenze und dünnt dort
            aus, für AT/CH gibt es kein gleichwertiges Objektprodukt); jenseits +1 h ist der Layer
            aus, weil die Spur dort endet. Keine Zellen = an ruhigen Tagen der Normalfall.
          </>
        );
      case 'confidence':
        return active.has('nowcast')
          ? 'Dichtere Schraffur = unsicherere Regenvorhersage. Echter Ensemble-Spread (DE): 15 Member advehieren das Radar mit gestörten Bewegungsfeldern — wo sie uneins sind (Niederschlagskanten, ferne Lead-Zeiten), ist es unsicher.'
          : 'Dichtere Schraffur = unsicherere Vorhersage. Abweichung von der DWD-Stationsklimatologie (30 J.) × Lauf-zu-Lauf-Übereinstimmung zweier ICON-D2-Läufe (echtes zeitversetztes Ensemble).';
      case 'snowline':
        return 'Linie = Übergang Regen↔Schnee; oberhalb fällt Niederschlag als Schnee. KI · ML #2: Physik-Anker + gelernte Orts-Korrektur (DWD-Stationen), dem Gelände folgend. Bei milder Luft existiert keine Linie (alles Regen).';
      case 'flownowcast':
        return 'Optical-Flow-Extrapolation: aus zwei RADOLAN-Frames wird das Bewegungsfeld geschätzt (Horn-Schunck) und das aktuelle Radar damit vorwärts advehiert. Regen wandert intensitätserhaltend (~0–60 min). Nur DE, trainingsfrei.';
      case 'poprob':
        return 'Kalibrierte Regenwahrscheinlichkeit aus dem Flow-Ensemble (15 Member, gestörte Bewegungsfelder). „Wie wahrscheinlich" statt „wie viel". Nur DE, ~0–60 min.';
      default:
        return null;
    }
  };

  // Layer-Legenden (Sicherheit · Schneegrenze · Flow-Nowcast · Regen-Chance) —
  // Inhalte unverändert, im Deck als Glas-Karten rechts gestapelt.
  // Seit Phase KD-R nur noch der MOBILE Pfad (Desktop: Readout-Spalte, s. u.).
  const legendsBlock = (active.has('confidence') || active.has('snowline') || active.has('flownowcast') || active.has('poprob') || active.has('thunder') || active.has('lightningfc') || active.has('snow') || active.has('rotation') || active.has('cells') || active.has('hail') || active.has('warnings')) ? (
    <div className="mdk-legends">
      {active.has('warnings') && (
        <div className="confidence-legend" role="note" aria-label="Amtliche Wetterwarnungen">
          <div className="cl-title">
            Amtliche Warnungen
            <span style={{ opacity: 0.7, fontWeight: 400 }}>
              {' '}· {warnFailed
                ? 'nicht erreichbar'
                : warnInfo == null
                  ? 'lade …'
                  : warnInfo.total === 0
                    ? 'keine'
                    : `${warnInfo.total} ${warnInfo.total === 1 ? 'Warnung' : 'Warnungen'}`}
              {!warnFailed && forecastHour > 0 && <> · in {forecastHour} h</>}
            </span>
          </div>
          {/* Die Skala zeigt AUSSCHLIESSLICH die Stufen, die gerade auf der Karte
              liegen. Sie ist JE LAND getrennt: DWD-Stufe 1 ist gelb, die
              Schweizer Stufe 1 grün — eine gemeinsame Skala würde zwei
              unvereinbare Systeme zu einem verschmelzen (audit/warnungen-at-ch.md §4.4). */}
          {warnInfo?.perSource.filter(p => p.tiers.length > 0).map(p => (
            <Fragment key={p.source.key}>
              <div className="cl-ends" style={{ marginTop: 4 }}>
                <span><b>{p.source.country}</b></span>
                <span style={{ opacity: 0.75 }}>
                  {p.source.colorOrigin === 'derived' ? 'Farbe abgeleitet' : 'amtliche Farbe'}
                </span>
              </div>
              {/* `tiers` ist absteigend sortiert (höchste Stufe zuerst, so wird
                  gezeichnet). Die Skala läuft aber wie jede andere Legende der
                  App von schwach nach stark — deshalb hier umgedreht, sonst
                  stünde die kräftigste Farbe über der schwächsten Beschriftung. */}
              <div className="cl-scale" aria-hidden="true">
                {[...p.tiers].reverse().map(t => (
                  <span key={t.label} className="cl-swatch" style={{ background: t.color }} />
                ))}
              </div>
              <div className="cl-ends">
                <span>{p.tiers[p.tiers.length - 1].label}</span>
                <span>{p.tiers[0].label}</span>
              </div>
            </Fragment>
          ))}
          <div className="cl-note">
            {/* Ausfall NIE als Leerstand darstellen (docs/API.md §7.3): eine leere
                Karte ohne diesen Satz läse sich als „keine Warnungen". Seit W2
                gilt das AUCH für den halben Ausfall — eine fehlende Schweiz darf
                nicht wie eine warnfreie Schweiz aussehen. */}
            {warnFailed && chWarnFailed && (
              <><b>Die amtlichen Warnungen sind gerade nicht abrufbar</b> — diese Karte zeigt
              deshalb keine. Das heißt <b>nicht</b>, dass keine gelten: bitte direkt bei{' '}
              <a href={warningsSourceFor('DE').url} target="_blank" rel="noopener">dwd.de</a>{' '}
              bzw. <a href={warningsSourceFor('CH').url} target="_blank" rel="noopener">naturgefahren.ch</a>{' '}
              nachsehen.{' '}</>
            )}
            {warnFailed && !chWarnFailed && (
              <><b>Für Deutschland sind die amtlichen Warnungen gerade nicht abrufbar</b> — die
              deutsche Fläche ist deshalb leer, <b>nicht</b> warnfrei. Bitte direkt bei{' '}
              <a href={warningsSourceFor('DE').url} target="_blank" rel="noopener">dwd.de</a>{' '}
              nachsehen. Die Schweizer Warnungen unten sind aktuell.{' '}</>
            )}
            {chWarnFailed && !warnFailed && (
              <><b>Für die Schweiz sind die amtlichen Warnungen gerade nicht abrufbar</b> — die
              Schweizer Fläche ist deshalb leer, <b>nicht</b> warnfrei. Bitte direkt beim{' '}
              <a href={warningsSourceFor('CH').url} target="_blank" rel="noopener">Naturgefahrenportal</a>{' '}
              nachsehen. Die deutschen Warnungen sind aktuell.{' '}</>
            )}
            {!warnFailed && !chWarnFailed && warnInfo != null && warnInfo.total === 0 && (
              <><b>Für {forecastHour === 0 ? 'jetzt' : `in ${forecastHour} h`} liegen keine amtlichen
              Warnungen für Deutschland und die Schweiz vor.</b>{' '}</>
            )}
            Amtliche Warnungen des <b>Deutschen Wetterdienstes</b> (landkreisgenau) und von{' '}
            <b>MeteoSchweiz</b> (Warnregionen, über MeteoAlarm). Die <b>Texte</b> stammen
            unverändert aus der amtlichen Meldung. Die <b>Farbe</b> ist für Deutschland die
            amtliche Warnfarbe aus der Meldung; für die Schweiz führt der Feed keine Farbe mit —
            sie ist dort aus der <b>amtlichen Gefahrenstufe abgeleitet</b>. Fläche antippen zeigt{' '}
            <b>alle</b> Warnungen dieses Ortes. Der Zeitregler wählt aus, was{' '}
            <b>zu dieser Stunde gilt</b>.
            {' '}<b>Österreich fehlt weiterhin</b> — dort warnt {warningsSourceFor('AT').operator}{' '}
            (<a href={warningsSourceFor('AT').url} target="_blank" rel="noopener">Warnübersicht</a>);
            eine leere Fläche über Österreich heißt <b>nicht</b> „keine Warnung".
            {warnInfo != null && warnInfo.dropped > 0 && (
              <> {warnInfo.dropped} Meldung(en) ohne darstellbare Fläche sind hier nicht abgebildet.</>
            )}
            {chWarnRun != null && chWarnRun.textUnavailable > 0 && (
              <> {chWarnRun.textUnavailable} Schweizer Meldung(en) konnten im Wortlaut nicht geladen
              werden und werden deshalb <b>nicht</b> gezeigt.</>
            )}
            {' '}Maßgeblich ist die amtliche Bekanntmachung auf{' '}
            <a href={warningsSourceFor('DE').url} target="_blank" rel="noopener">dwd.de</a>{' '}
            bzw. bei <a href={warningsSourceFor('CH').url} target="_blank" rel="noopener">MeteoSchweiz</a>.
          </div>
        </div>
      )}
      {active.has('hail') && (
        <div className="confidence-legend" role="note" aria-label="Hagel">
          <div className="cl-title">
            Hagel
            <span style={{ opacity: 0.7, fontWeight: 400 }}>
              {' '}· CH {hailProduct === 'meshs' ? 'Korngröße' : 'Wahrscheinlichkeit'}
            </span>
          </div>
          <div className="cl-scale" aria-hidden="true">
            {stopsFor(hailProduct).map(s => (
              <span
                key={s.v}
                className="cl-swatch"
                style={{ background: `rgba(${s.rgba[0]},${s.rgba[1]},${s.rgba[2]},${(s.rgba[3] / 255).toFixed(2)})` }}
              />
            ))}
          </div>
          <div className="cl-ends">
            <span>{hailLegendEnds(hailProduct)[0]}</span><span>{hailLegendEnds(hailProduct)[1]}</span>
          </div>
          <div className="cl-note">
            <b>Fläche</b> (Schweizer Radarverbund, reicht über die Grenze): MeteoSchweiz{' '}
            {hailProduct === 'meshs' ? 'MESHS' : 'POH'} —{' '}
            {hailInfo.chMax == null
              ? 'lade …'
              : hailInfo.chMax <= 0
                ? 'aktuell kein Hagel erkannt'
                : `Maximum ${hailProduct === 'meshs' ? meshsLabel(hailInfo.chMax) : pohLabel(hailInfo.chMax)}`}
            {!isSwissHailSeason(new Date()) && <> · <b>außerhalb der Hagelsaison</b> (1. April–30. September)</>}.
            {' '}<b>Zellen</b> (deutscher Radarverbund): DWD KONRAD3D —{' '}
            {hailInfo.deCells == null
              ? 'lade …'
              : hailInfo.deCells === 0
                ? 'aktuell keine Hagelzelle erkannt'
                : `${hailInfo.deCells} Zelle${hailInfo.deCells === 1 ? '' : 'n'} mit Hagelsignal`}.
            {' '}<b>Österreich hat keine eigene Quelle</b> — im Osten daher keine Abdeckung; das
            heißt nicht, dass es dort nicht hagelt. Radarerkennung, keine Bodenmeldung.
            Gilt für <b>jetzt</b>; <b>kein Warnprodukt</b>.
          </div>
        </div>
      )}
      {active.has('cells') && (
        <div className="confidence-legend" role="note" aria-label="Zellbahnen">
          <div className="cl-title">
            Zellbahnen
            <span style={{ opacity: 0.7, fontWeight: 400 }}>
              {' '}· {cellsInfo == null
                ? 'lade …'
                : cellsInfo.count === 0
                  ? 'keine Zellen erkannt'
                  : `${cellsInfo.count} Zelle${cellsInfo.count === 1 ? '' : 'n'}`}
            </span>
          </div>
          <div className="cl-scale" aria-hidden="true">
            <span className="cl-swatch" style={{ background: 'rgb(201,162,39)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(224,138,46)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(201,82,46)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(143,33,64)' }} />
          </div>
          <div className="cl-ends"><span>schwach</span><span>kräftig</span></div>
          {/* Z2-4: der Standortbezug. Im Übersichts-Modus gibt es ihn ersatzlos
              nicht — kein Platzhalter, keine leere Zeile. */}
          {cellsRelevance != null && (
            <div className="cl-note" style={{ fontWeight: 600 }}>{cellsRelevance.text}</div>
          )}
          {/* Bewusst KURZ gehalten: auf 390×844 gemessen wächst die Karte sonst auf
              359 px und schiebt ausgerechnet den Warnhinweis unter die Scrollkante.
              Die ausführliche Fassung steht in der Readout-Spalte (Desktop). */}
          <div className="cl-note">
            Umriss durchgezogen = <b>gemessen</b>; Spur, Pfeil, Zeitmarken (+15/+30/+60) und
            Trichter = <b>prognostiziert</b>, alles amtlich vom DWD (Trichter = amtliche
            Unsicherheitsellipse, nach hinten durchsichtiger = unsicherer). Gilt <b>jetzt bis
            +60 Min</b>. Ankunftszeit <b>nur als Spanne</b>. Beim Herauszoomen entfallen Zeitmarken
            und Trichter-Verlauf, <b>Umriss und Spur bleiben</b>. Zelle antippen für Details.
            {' '}<b>Kein Warnprodukt</b>, maßgeblich sind die DWD-Warnungen.
          </div>
        </div>
      )}
      {active.has('snow') && (
        <div className="confidence-legend" role="note" aria-label="Schnee">
          <div className="cl-title">Schnee <span style={{ opacity: 0.7, fontWeight: 400 }}>· {snowMode === 'depth' ? 'Schneedecke' : 'Neuschnee'}</span></div>
          <div className="cl-scale" aria-hidden="true">
            <span className="cl-swatch" style={{ background: 'rgb(224,238,253)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(172,207,244)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(120,166,230)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(92,120,210)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(70,96,190)' }} />
          </div>
          <div className="cl-ends"><span>~1 cm</span><span>{snowMode === 'depth' ? '≥150 cm' : '≥50 cm'}</span></div>
          <div className="cl-note">{layerExtNote('snow')}</div>
        </div>
      )}
      {active.has('lightningfc') && (
        <div className="confidence-legend" role="note" aria-label="Blitz-Vorhersage">
          <div className="cl-title">Blitzprognose</div>
          <div className="cl-scale" aria-hidden="true">
            <span className="cl-swatch" style={{ background: 'rgb(255,238,120)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(255,176,48)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(240,86,60)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(214,40,120)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(150,40,200)' }} />
          </div>
          <div className="cl-ends"><span>gering</span><span>extrem</span></div>
          <div className="cl-note">{layerExtNote('lightningfc')}</div>
        </div>
      )}
      {active.has('thunder') && (
        <div className="confidence-legend" role="note" aria-label="Gewitterpotenzial">
          <div className="cl-title">Gewitterpotenzial</div>
          <div className="cl-scale" aria-hidden="true">
            <span className="cl-swatch" style={{ background: 'rgb(247,224,88)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(245,182,66)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(238,124,44)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(206,52,52)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(150,30,110)' }} />
          </div>
          <div className="cl-ends"><span>gering</span><span>extrem</span></div>
          <div className="cl-note">{layerExtNote('thunder')}</div>
        </div>
      )}
      {active.has('rotation') && (
        <div className="confidence-legend" role="note" aria-label="Rotationspotenzial">
          <div className="cl-title">Rotationspotenzial <span style={{ opacity: 0.7, fontWeight: 400 }}>· Experten-Layer</span></div>
          <div className="cl-scale" aria-hidden="true">
            <span className="cl-swatch" style={{ background: 'rgb(158,148,180)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(130,112,168)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(104,80,148)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(78,52,116)' }} />
            <span className="cl-swatch" style={{ background: 'rgb(52,32,80)' }} />
          </div>
          <div className="cl-ends"><span>gering</span><span>hoch</span></div>
          <div className="cl-note">{layerExtNote('rotation')}</div>
        </div>
      )}
      {active.has('confidence') && (
        <div className="confidence-legend" role="note" aria-label="Vertrauens-Schleier">
          <div className="cl-title">{active.has('nowcast') ? 'Sicherheit · Regen' : 'Sicherheit · Temperatur'}</div>
          <div className="cl-scale" aria-hidden="true">
            <span className="cl-swatch cl-sure" />
            <span className="cl-swatch cl-mid" />
            <span className="cl-swatch cl-unsure" />
          </div>
          <div className="cl-ends"><span>sicher</span><span>unsicher</span></div>
          <div className="cl-note">{layerExtNote('confidence')}</div>
        </div>
      )}
      {active.has('snowline') && (
        <div className="confidence-legend" role="note" aria-label="Schneefallgrenze">
          <div className="cl-title">Schneefallgrenze</div>
          <div className="sl-swatch" aria-hidden="true" />
          <div className="cl-note">{layerExtNote('snowline')}</div>
        </div>
      )}
      {active.has('flownowcast') && (
        <div className="confidence-legend" role="note" aria-label="Flow-Nowcast">
          <div className="cl-title">Flow-Nowcast</div>
          <div className="cl-note">{layerExtNote('flownowcast')}</div>
        </div>
      )}
      {active.has('poprob') && (
        <div className="confidence-legend" role="note" aria-label="Regenwahrscheinlichkeit">
          <div className="cl-title">Regen-Chance (%)</div>
          <div className="pop-scale" aria-hidden="true" />
          <div className="cl-ends"><span>unwahrsch.</span><span>sicher</span></div>
          <div className="cl-note">{layerExtNote('poprob')}</div>
        </div>
      )}
    </div>
  ) : null;

  // ---- Readout-Spalte: Layer-Beschreibungen (Phase KD-R) --------------------
  // Desktop/Tablet: die Erklärung eines Layers steht rechts AUSSERHALB der Karte,
  // solange der Layer aktiv ist — Reihenfolge = Dock-Reihenfolge, nicht gedockte
  // Layer (nur per #m=-Permalink aktivierbar) hängen sich hinten an. Ein per
  // Hover/Fokus angesteuerter INAKTIVER Layer erscheint zusätzlich als Vorschau
  // an seiner Ordnungsposition (ersetzt das frühere Overlay über der Karte).
  const readoutLayers = READOUT_ORDER.filter(k => active.has(k) || layerHover === k);
  const layerReadout = readoutLayers.length > 0 ? (
    <section
      className={`mdk-ro-layerinfo${overview || START_NOW_ONLY ? ' is-solo' : ''}`}
      aria-label="Beschreibung der aktiven Wetterlayer"
    >
      <div className="mdk-ro-section-head">
        <span className="mdk-eyebrow">Aktive Layer</span>
        <span className="mdk-dock-count">{active.size} aktiv</span>
      </div>
      <div className="mdk-ro-lstack">
        {readoutLayers.map(k => {
          const on = active.has(k);
          const ext = layerExtNote(k);
          return (
            <article
              key={k}
              className={`mdk-ro-lcard${on ? (layerHover === k ? ' is-hot' : '') : ' is-preview'}`}
              data-accent={LAYER_ACCENT.get(k) ?? 'steel'}
            >
              {!on && <span className="mdk-ro-lchip">Vorschau</span>}
              <LayerInfoPanel layer={k} suffix={layerTitleSuffix(k)} />
              {ext && (
                <div className="mdk-ro-lext">
                  <span className="mdk-ro-lext-head">Im Detail</span>
                  {ext}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  ) : null;

  const statusChip = (
    <div className="mdk-status-chip mdk-glass" role="status" aria-label="Datenlage">
      <span title={COUNTRY_PROFILES[location.country].stackLabel}>
        {COUNTRY_PROFILES[location.country].name} · {COUNTRY_PROFILES[location.country].stackLabel}
      </span>
      {LAYER_OPTIONS.filter(o => active.has(o.key)).map(o => {
        const s = statuses[o.key];
        const st = s.ok ? statusStamp(s.ok) : null;
        return (
          <span
            key={o.key}
            className={s.err ? 'err' : st?.stale ? 'stale' : ''}
            title={s.err ?? (st?.stale ? `Dieser Datensatz ist ungewöhnlich alt (${ageText(clockMs - (s.ok!.ref?.atMs ?? clockMs))}).` : undefined)}
          >
            {s.err
              ? `${o.label}: ${s.err}`
              : s.ok && st
                ? `${st.stale ? '⚠ ' : ''}${o.label} · ${s.ok.model.toUpperCase()} · ${st.text}`
                : `${o.label} wird geladen…`}
          </span>
        );
      })}
      {/* V-20: Zustand des Warm-Manifests — sichtbar, wenn der Schnellzugriff nicht greift. */}
      {manifestNote && <span className="mdk-manifest-note" title={manifestNote.title}>{manifestNote.text}</span>}
    </div>
  );

  const modelLibrary = (
    <ModelLibraryOverlay
      state={modelSource}
      onClose={() => { setModelsOpen(false); if (isMobileMap) setMobileTab('karte'); }}
      onSelectModel={onSelectModel}
      onClearCountryModel={onClearCountryModel}
      onToggleRadar={onToggleRadar}
    />
  );

  return (
    <div className="mdk-root" style={{ '--mdk-bar-h': '64px' } as React.CSSProperties}>
      {/* ---- Topbar (Desktop/Tablet) ---------------------------------------- */}
      {!isMobileMap && (
        <header className="mdk-topbar">
          <button type="button" className="mdk-brand" onClick={onBack} aria-label="Zur Startseite">
            <img className="mdk-brand-mark" src="/buscosun-mark.svg" width={26} height={26} alt="" />
            <span className="mdk-brand-name">buscosun</span>
          </button>
          <span className="mdk-topdiv" aria-hidden="true" />
          <DeckSearch placeholder={overview ? 'Deutschland · Österreich · Schweiz' : location.name} onSelect={onSelectLocation} />
          <div className="mdk-countries" role="tablist" aria-label="Land (Modellwahl)">
            {(['DE', 'AT', 'CH'] as Country[]).map(c => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={modelSource.country === c}
                className={modelSource.country === c ? 'is-active' : ''}
                onClick={() => onSelectCountry(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="mdk-topright">
            <span className="mdk-live">
              <span className="mdk-live-dot" aria-hidden="true"><span /><span /></span>
              <span className="mdk-live-text">LIVE</span>
            </span>
            <div className="mdk-clock" aria-hidden="true">
              <div className="mdk-clock-time">{clockTime}</div>
              <div className="mdk-clock-date">{clockDate}</div>
            </div>
          </div>
        </header>
      )}

      <div className="mdk-body">
        {/* ---- Ink-Icon-Rail ------------------------------------------------ */}
        {!isMobileMap && (
          /* Vollständige Werkzeug-Rail wie in allen anderen Decks (eine Quelle:
             nav/featureRail). Die Kartenseite hatte bisher nur 4 der 9
             Werkzeuge; der kartenspezifische Modellseiten-Knopf bleibt als
             `extra` erhalten. */
          <FeatureRail
            active="map2d"
            onOpenFeature={(id) => onOpenFeature?.(id)}
            onHome={() => onBack?.()}
            navClass="mdk-rail"
            btnClass="mdk-rail-btn"
            activeClass="is-active"
            homeBtnClass="mdk-rail-btn mdk-rail-bottom"
            extra={(
              <button type="button" className="mdk-rail-btn" onClick={openModels} title="Modellseite — Wettermodelle & Wirkungsbereiche" aria-label="Modellseite — Wettermodelle & Wirkungsbereiche">
                <IcoGlobe />
              </button>
            )}
          />
        )}

        {/* ---- Layer-Dock --------------------------------------------------- */}
        {!isMobileMap && (
          <aside className="mdk-dock" aria-label="Wetterlayer">
            <div className="mdk-dock-head">
              <span className="mdk-eyebrow">Wetterlayer</span>
              <span className="mdk-dock-count">{active.size} aktiv</span>
            </div>
            {DECK_GROUPS.map(g => (
              <div key={g.title} className="mdk-group" data-accent={g.accent}>
                <div className="mdk-group-head">{g.title}</div>
                <div className="mdk-layers">
                  {g.layers.map(l => layerRowDeck(l.key, l.accent ?? g.accent, l.sub, false))}
                  {g.layers.some(l => l.key === 'sat') && active.has('sat') && satSeg}
                  {g.layers.some(l => l.key === 'snow') && active.has('snow') && snowSeg}
                  {g.layers.some(l => l.key === 'hail') && active.has('hail') && hailSeg}
                </div>
              </div>
            ))}
          </aside>
        )}

        {/* ---- Karten-Bühne (dunkles Feld) ---------------------------------- */}
        <main className="mdk-stage">
          <div ref={containerRef} className="map-container" />

          {!isMobileMap && (
            <>
              <button type="button" className="mdk-source-pill mdk-glass" onClick={openModels} title={isNativeActive ? nativeComposition(modelSource.country) : `${activeModelName} — Modellseite öffnen`}>
                <span className="mdk-src-dot" aria-hidden="true" />
                <span className="mdk-src-label">Modell · {activeModelName}</span>
                <span className="mdk-src-meta">{modelMetaLine}</span>
                {fusionError && activeEntry?.engineGridded && (
                  <span className="mdk-src-warn">⚠ Quelle offline — rendert nativ</span>
                )}
                <span className="mdk-src-cta">wählen →</span>
              </button>
              <div className="mdk-zoom mdk-glass">
                <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="Hineinzoomen"><IcoPlus /></button>
                <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="Herauszoomen"><IcoMinus /></button>
              </div>
              {statusChip}
              {active.has('wind') && (
                <div className="mdk-winddeck mdk-glass" role="group" aria-label="Wind-Steuerung">{windDeckControls}</div>
              )}
              {timeDeck}
            </>
          )}

          {/* Erklärkarten liegen nur noch MOBIL über der Karte — auf Desktop/Tablet
              stehen sie in der Readout-Spalte (Phase KD-R). */}
          {isMobileMap && mobileTab === 'karte' && legendsBlock}

          {/* Mobile: schwebender Kopf (Suche + Land) + Modell-Pille */}
          {isMobileMap && (
            <>
              <div className="mdk-m-topfloat">
                <DeckSearch placeholder={overview ? 'Ort suchen …' : location.name} onSelect={onSelectLocation} compact />
                <div style={{ position: 'relative', flex: '0 0 auto' }}>
                  <button
                    type="button"
                    className="mdk-m-country"
                    aria-haspopup="menu"
                    aria-expanded={countryMenuOpen}
                    aria-label="Land für die Modellwahl"
                    onClick={() => setCountryMenuOpen(o => !o)}
                  >
                    {modelSource.country}
                  </button>
                  {countryMenuOpen && (
                    <div className="mdk-m-country-menu" role="menu">
                      {(['DE', 'AT', 'CH'] as Country[]).map(c => (
                        <button
                          key={c}
                          type="button"
                          role="menuitemradio"
                          aria-checked={modelSource.country === c}
                          className={modelSource.country === c ? 'is-active' : ''}
                          onClick={() => { onSelectCountry(c); setCountryMenuOpen(false); }}
                        >
                          {COUNTRY_PROFILES[c].name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {mobileTab === 'karte' && (
                <button type="button" className="mdk-m-modelpill mdk-glass" onClick={() => setMobileTab('modelle')}>
                  <span className="mdk-src-dot" aria-hidden="true" />
                  <span className="mdk-src-label">Modell · {activeModelName}</span>
                  <span className="mdk-src-cta">wählen →</span>
                </button>
              )}
            </>
          )}
        </main>

        {/* ---- Rechtes Panel (Desktop/Tablet): Punktforecast + 7 Tage
             (Modellkarte, Testmodus- und Übersichts-Hinweis auf Jans Wunsch entfernt,
             2026-07-29 — die Modellwahl bleibt über die Quellen-Pille bzw. den
             „Modelle"-Link erreichbar). Die Spalte selbst bleibt immer stehen —
             ohne gewählten Ort bzw. im Testmodus „Nur-Jetzt" nur ohne Inhalt. */}
        {!isMobileMap && (
          <aside className="mdk-readout">
            {/* Layer-Beschreibungen zuerst: sie reagieren unmittelbar auf das
                Schalten im Dock. Der Punktforecast darunter bleibt unverändert
                an seinem Platz (Phase KD-R, audit/karten-readout.md). */}
            {layerReadout}
            {!overview && !START_NOW_ONLY && (
              <>
                <div className="mdk-ro-section-head">
                  <span className="mdk-eyebrow">Punktforecast</span>
                  <span className="mdk-ro-live"><i aria-hidden="true" />LIVE</span>
                </div>
                <PointForecastPanel
                  lat={location.lat}
                  lng={location.lon}
                  country={location.country}
                  locationLabel={location.name}
                  sourceMode={resolvePointSource(modelSource)}
                />

                <div className="mdk-ro-section-head">
                  <span className="mdk-eyebrow">7-Tage-Forecast</span>
                  <button type="button" className="mdk-ro-modelle-link" onClick={openModels}>
                    Modelle <IcoArrowRight size={12} />
                  </button>
                </div>
                <SevenDayForecast lat={location.lat} lon={location.lon} variant="panel" />
                <div className="sdf-legend mdk-ro-sdf-legend">
                  <span className="sdf-legend-label">Legende</span>
                  <span className="sdf-legend-item">kühl <span className="sdf-legend-ramp" aria-hidden="true" /> warm</span>
                  <span className="sdf-legend-item"><b className="sdf-legend-pct">%</b> Regenrisiko</span>
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {/* ---- Mobile: Bottom-Sheet · Screens · Sticky-Bottom-Bar -------------- */}
      {isMobileMap && (
        <>
          {mobileTab === 'karte' && !overview && !START_NOW_ONLY && (
            <>
              <div
                className={`mdk-sheet-scrim${sheetSnap === 'full' ? ' is-full' : ''}`}
                onClick={sheetSnap === 'full' ? () => setSheetSnap('half') : undefined}
              />
              <aside
                className={`mdk-sheet is-${sheetSnap}`}
                role="dialog"
                aria-modal={sheetSnap === 'full'}
                aria-label="Punktforecast"
              >
                <div className="mdk-sheet-grabzone" onPointerDown={onSheetGrabPointerDown}>
                  <div className="mdk-sheet-grab" aria-hidden="true" />
                  <div className="mdk-sheet-head">
                    <span className="mdk-sheet-title">{location.name}</span>
                    <span className="mdk-ro-live"><i aria-hidden="true" />LIVE</span>
                  </div>
                  <div className="mdk-sheet-sub">Punktforecast</div>
                </div>
                <div className="mdk-sheet-body">
                  <PointForecastPanel
                    lat={location.lat}
                    lng={location.lon}
                    country={location.country}
                    locationLabel={location.name}
                    sourceMode={resolvePointSource(modelSource)}
                    view={pfcView}
                    onViewChange={setPfcView}
                  />
                </div>
                {timeDeck}
              </aside>
            </>
          )}
          {mobileTab === 'karte' && (overview || START_NOW_ONLY) && timeDeck && (
            <div className="mdk-m-timesolo">{timeDeck}</div>
          )}

          {mobileTab === 'layer' && (
            <div className="mdk-screen" aria-label="Wetterlayer">
              <div className="mdk-screen-head">
                <div>
                  <span className="mdk-eyebrow">Karte · Layer</span>
                  <h1>Wetterlayer</h1>
                </div>
                <span className="mdk-screen-chip">{active.size} aktiv</span>
              </div>
              <div className="mdk-screen-body">
                <div className="mdk-m-segrow">
                  <div className="mdk-m-seg mdk-m-seg-ansicht" role="tablist" aria-label="Ansicht">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={pfcView !== 'charts'}
                      className={pfcView !== 'charts' ? 'is-active' : ''}
                      onClick={() => { setPfcView('overview'); setMobileTab('karte'); setSheetSnap('half'); }}
                    >
                      Karte
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={pfcView === 'charts'}
                      className={pfcView === 'charts' ? 'is-active' : ''}
                      disabled={overview}
                      onClick={() => { setPfcView('charts'); setMobileTab('karte'); setSheetSnap('full'); }}
                    >
                      Diagramm
                    </button>
                  </div>
                  <div className="mdk-m-seg mdk-m-seg-modus" role="tablist" aria-label="Modus">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={layerMode === 'standard'}
                      className={layerMode === 'standard' ? 'is-active' : ''}
                      onClick={() => setLayerMode('standard')}
                    >
                      Standard
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={layerMode === 'detail'}
                      className={layerMode === 'detail' ? 'is-active' : ''}
                      onClick={() => setLayerMode('detail')}
                    >
                      Detail
                    </button>
                  </div>
                </div>

                {DECK_GROUPS.map(g => (
                  <div key={g.title} data-accent={g.accent}>
                    <div className="mdk-m-group-head">{g.title}</div>
                    <div className="mdk-m-layers">
                      {g.layers.map(l => layerRowDeck(l.key, l.accent ?? g.accent, l.sub, true))}
                      {layerMode === 'detail' && g.layers.some(l => l.key === 'wind') && active.has('wind') && (
                        <div className="mdk-m-sub" data-accent="sage" role="group" aria-label="Wind-Steuerung">{windDeckControls}</div>
                      )}
                      {layerMode === 'detail' && g.layers.some(l => l.key === 'sat') && active.has('sat') && (
                        <div className="mdk-m-sub" data-accent="slate">{satSeg}</div>
                      )}
                      {layerMode === 'detail' && g.layers.some(l => l.key === 'snow') && active.has('snow') && (
                        <div className="mdk-m-sub" data-accent="steel">{snowSeg}</div>
                      )}
                      {layerMode === 'detail' && g.layers.some(l => l.key === 'hail') && active.has('hail') && (
                        <div className="mdk-m-sub" data-accent="violet">{hailSeg}</div>
                      )}
                    </div>
                  </div>
                ))}
                {/* V-20: auf Mobil ist die Statuspille ausgeblendet (mapDeck.css) —
                    der Manifest-Hinweis gehört trotzdem sichtbar. */}
                {manifestNote && (
                  <p className="mdk-manifest-note mdk-manifest-note-m" title={manifestNote.title}>{manifestNote.text}</p>
                )}
              </div>
            </div>
          )}

          {mobileTab === 'forecast' && (
            <div className="mdk-screen" aria-label="7-Tage-Forecast">
              <div className="mdk-screen-head">
                <div>
                  <span className="mdk-eyebrow">{overview ? '7 Tage · DACH' : location.name}</span>
                  <h1>7-Tage-Forecast</h1>
                </div>
                <button type="button" className="mdk-screen-chip mdk-screen-chip-btn" onClick={() => setMobileTab('modelle')}>
                  Modelle →
                </button>
              </div>
              <div className="mdk-screen-body">
                {overview || START_NOW_ONLY ? (
                  <div className="mdk-ro-note">
                    {START_NOW_ONLY
                      ? 'Testmodus „Nur-Jetzt" (?startnow=0 zum Abschalten): Slider jetzt … +2 h, Forecast lädt nach Bedarf (nur aktive Layer) — kein 7-Tage-Forecast.'
                      : 'Kein Ort gewählt. Über die Suche auf der Karte einen Ort wählen — dann erscheint hier der 7-Tage-Forecast.'}
                  </div>
                ) : (
                  <SevenDayForecast lat={location.lat} lon={location.lon} variant="screen" />
                )}
              </div>
            </div>
          )}

          {mobileTab === 'modelle' && modelLibrary}

          <nav className="mdk-bar" aria-label="Kartenseite">
            {([
              { key: 'karte', label: 'Karte', ico: <IcoLayers size={22} /> },
              { key: 'nowcast', label: 'Nowcast', ico: <IcoGauge /> },
              { key: 'layer', label: 'Layer', ico: <IcoRows /> },
              { key: 'forecast', label: 'Forecast', ico: <IcoTrend size={22} /> },
              { key: 'modelle', label: 'Modelle', ico: <IcoGlobe size={22} /> },
            ] as const).map(t => (
              <button
                key={t.key}
                type="button"
                className={`mdk-bar-btn${t.key !== 'nowcast' && mobileTab === t.key ? ' is-active' : ''}`}
                aria-current={t.key !== 'nowcast' && mobileTab === t.key ? 'page' : undefined}
                onClick={() => { if (t.key === 'nowcast') onOpenFeature?.('nowcast'); else setMobileTab(t.key); }}
              >
                {t.ico}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </>
      )}

      {/* Modellseite als Desktop-/Tablet-Overlay */}
      {modelsOpen && !isMobileMap && modelLibrary}

    </div>
  );
}

/** Schnellzugriff Label/Title je LayerKey (Dock + mobiler Layer-Screen). */
const LAYER_BY_KEY = new Map(LAYER_OPTIONS.map(o => [o.key, o]));

/** Gruppierung + Akzentfarben des Layer-Docks (Vorlage references/*-karte.png).
 *  Deckt ALLE zwölf LayerKeys ab — Funktionserhalt vor Vorlagen-Auslassung. */
const DECK_GROUPS: {
  title: string;
  accent: 'steel' | 'sage' | 'terracotta' | 'violet';
  layers: { key: LayerKey; sub?: string; accent?: 'steel' | 'sage' | 'terracotta' | 'violet' | 'amber' | 'slate' }[];
}[] = [
  // Amtliche Warnungen stehen bewusst GANZ OBEN und allein: Es ist der einzige
  // Layer, der ein amtliches Warnprodukt IST — alle übrigen (Gewitter, Hagel,
  // Rotation, Zellbahnen) verweisen in ihren Texten darauf. Die Trennung
  // verhindert, dass er wie ein weiteres Modellprodukt gelesen wird.
  {
    title: 'Amtliche Warnungen', accent: 'terracotta',
    layers: [
      { key: 'warnings', sub: 'DWD · landkreisgenau', accent: 'terracotta' },
    ],
  },
  {
    title: 'Niederschlag', accent: 'steel',
    layers: [
      { key: 'nowcast', sub: 'jetzt–2 h · Radar/Nowcast' },
      // Gewitterpotenzial (Feature F1): fusionierter CAPE×CIN×LPI-Index, flächige
      // Vorwarnung 0–12 h VOR dem ersten Radarecho — thematisch Konvektion.
      { key: 'thunder', sub: 'Potenzial · 0–12 h', accent: 'amber' },
      // Zellbahnen (Phase Z1, E3): amtliche KONRAD3D-Objekte — erkannte Zelle,
      // amtliche Zugspur, amtlicher Unsicherheits-Trichter. Steht bewusst neben
      // „Gewitter" (Modell-Potenzial) — hier ist es gemessen + amtlich verfolgt.
      { key: 'cells', sub: 'DWD-Zugspur · +60 min', accent: 'terracotta' },
      // Hagel (Phase HA1): amtliche Radarprodukte, je Land verschieden —
      // CH MESHS/POH (Korngröße/Wahrscheinlichkeit), DE KONRAD3D-Hagelzellen,
      // AT ohne offene Quelle. Steht neben Gewitter/Zellbahnen (Konvektion).
      { key: 'hail', sub: 'Korngröße · Hagelzellen', accent: 'violet' },
      // Rotationspotenzial (Feature F5, Experten): geglättete Modell-VERDACHTSflächen
      // für rotierende Aufwinde/Superzellen (uh_max×sdi_2) — Nischensignal, kein
      // Warnersatz (§0). Thematisch Konvektion, direkt neben „Gewitter".
      { key: 'rotation', sub: 'Experten · Verdacht', accent: 'violet' },
      // Schnee (Feature F4): Schneemenge als Fläche (Decke h_snow / Neuschnee snow_gsp),
      // Modus im Layer umschaltbar — NICHT die Schneegrenzen-Linie („Schneegrenze").
      { key: 'snow', sub: 'Menge · cm', accent: 'steel' },
      // Jans Vorgabe (2026-07-23): erstmal aus dem Panel ausgeblendet — Funktion/
      // Effekte bleiben erhalten, nur die Toggles sind ausgeblendet. Zum Wieder-
      // Einblenden diese Zeilen einkommentieren.
      // { key: 'flownowcast', sub: 'Optical Flow · 0–60 min' },
      // { key: 'poprob', sub: 'Flow-Ensemble · %' },
      // { key: 'snowline', sub: 'Regen ↔ Schnee' },
    ],
  },
  {
    title: 'Wind & Böen', accent: 'sage',
    layers: [
      { key: 'wind', sub: 'Pfeile · Partikel' },
      { key: 'gust', sub: 'Spitzenböen 24 h' },
    ],
  },
  {
    title: 'Temperatur & Himmel', accent: 'terracotta',
    layers: [
      { key: 'temp', sub: 'höhenkorrigiert' },
      // Jans Vorgabe (2026-07-23): erstmal ausgeblendet (Funktion bleibt).
      // { key: 'clouds', sub: 'tief · mittel · hoch', accent: 'slate' },
      { key: 'sat', sub: 'Meteosat', accent: 'slate' },
    ],
  },
  {
    title: 'Punkte & Vertrauen', accent: 'violet',
    layers: [
      { key: 'lightning', sub: 'letzte 60 min', accent: 'amber' },
      // Blitz-Vorhersage (Feature F2): ICON-D2 lpi_max, Blitz-RISIKO 0–12 h in die
      // Zukunft — direkt neben „Blitze" (Messung), bewusst getrennt beschriftet.
      { key: 'lightningfc', sub: 'Prognose · 0–12 h', accent: 'violet' },
      { key: 'stations', sub: 'Live-Messwerte' },
      // Jans Vorgabe (2026-07-23): erstmal ausgeblendet (Funktion bleibt).
      // { key: 'confidence', sub: 'Vertrauens-Schleier', accent: 'slate' },
    ],
  },
];

/** Akzentfarbe je Layer, wie im Dock — die Readout-Karte erbt sie über
 *  `data-accent`, damit Dock-Zeile und Beschreibung farblich zusammengehören. */
const LAYER_ACCENT = new Map<LayerKey, string>(
  DECK_GROUPS.flatMap(g => g.layers.map(l => [l.key, l.accent ?? g.accent] as [LayerKey, string])),
);

/** Reihenfolge der Beschreibungs-Karten in der Readout-Spalte: erst exakt die
 *  Dock-Reihenfolge, danach die nicht gedockten Layer (nur per `#m=`-Permalink
 *  aktivierbar) in `LAYER_OPTIONS`-Reihenfolge — so bleiben auch sie erklärt. */
const READOUT_ORDER: LayerKey[] = (() => {
  const docked = DECK_GROUPS.flatMap(g => g.layers.map(l => l.key));
  return [...docked, ...LAYER_OPTIONS.map(o => o.key).filter(k => !docked.includes(k))];
})();

/** Ortssuche im Deck-Kopf (Desktop-Topbar + mobiler Float) — geocodeDACH,
 *  Enter sucht, Auswahl setzt die Karten-Location (App.tsx). ⌘K fokussiert. */
function DeckSearch({ placeholder, onSelect, compact = false }: {
  placeholder: string;
  onSelect?: (l: Location) => void;
  compact?: boolean;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Location[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const acRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (compact) return;
    const kd = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', kd);
    return () => document.removeEventListener('keydown', kd);
  }, [compact]);

  const reset = () => { setHits([]); setErr(null); };

  async function run() {
    const query = q.trim();
    if (!query) return;
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setBusy(true);
    reset();
    try {
      const found = await geocodeDACH(query, ac.signal);
      if (ac.signal.aborted) return;
      if (found.length === 0) setErr('Keine Ergebnisse in DE · AT · CH.');
      else if (found.length === 1 && onSelect) { onSelect(found[0]); setQ(''); }
      else setHits(found);
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      setErr(e instanceof Error ? e.message : 'Suche fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mdk-search">
      <div className="mdk-search-box">
        <IcoSearch />
        <input
          ref={inputRef}
          className="mdk-search-input"
          type="text"
          value={q}
          placeholder={placeholder}
          aria-label="Ort suchen"
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); void run(); }
            if (e.key === 'Escape') { setQ(''); reset(); }
          }}
          disabled={busy}
        />
        {compact
          ? <span className="mdk-m-live-dot" aria-hidden="true" />
          : <span className="mdk-kbd" aria-hidden="true">⌘K</span>}
      </div>
      {(hits.length > 0 || err) && (
        <div className="mdk-search-drop" role="listbox" aria-label="Suchergebnisse">
          {err && <div className="mdk-search-err">⚠ {err}</div>}
          {hits.map(h => (
            <button
              key={`${h.lat},${h.lon}`}
              type="button"
              className="mdk-search-hit"
              role="option"
              aria-selected="false"
              onClick={() => { onSelect?.(h); setQ(''); reset(); }}
            >
              <span className="mdk-search-hit-cc">{h.country}</span>
              {h.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
