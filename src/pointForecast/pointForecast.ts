/**
 * Point-forecast orchestrator — direct (lat, lng) query without going through
 * the gridded fusion. See ./types.ts for the high-level data shapes and
 * ./leadTimeWeights.ts for the source-family weighting schedule.
 *
 * Flow per call:
 *   1. Parallel: nearest live stations (DWD/TAWES/SMN) + BrightSky MOSMIX
 *      (DACH, medium range to ~10 d) + GeoSphere AROME (AT/CH, ≤60 h) +
 *      GeoSphere INCA (AT, ≤4 h) + optional RADOLAN radar nowcast + DEM lookup.
 *   2. Lapse-rate regression from the station set (falls back to 0.0065 K/m).
 *   3. For each forecast hour: per-variable weighted blend of all samples,
 *      with the live-obs sample reused at h=0..5 (decaying weight) so it
 *      "anchors" the nowcast.
 *   4. Confidence per variable from the inverse weighted-stdev of samples.
 *
 * Open-Meteo was deliberately removed in favour of the native DWD / GeoSphere
 * / MeteoSwiss endpoints: MOSMIX is ICON-EU bias-corrected on DWD stations,
 * AROME and INCA are the same models Open-Meteo re-publishes — going direct
 * eliminates the rate limit, the non-commercial licence, and the third-party
 * dependency at no measurable quality cost for DACH coverage.
 */

import type { Country } from '../types';
import { loadElevationLookup } from '../fusion/elevation';
import { estimateLapseRate, type PointSample } from '../fusion/spatialInterp';
import { COUNTRY_PROFILES } from '../countryProfiles';
import {
  familyWeight,
  spatialWeight,
  type Variable,
} from './leadTimeWeights';
import {
  brightSkyHistoryToSamples,
  brightSkyToHourSamples,
  fetchAromePoint,
  fetchBrightSkyPointForecast,
  fetchIncaPoint,
  fetchNearestStationObs,
  fetchStationHistory,
  haversine,
  seriesToHourSamples,
  stationsToHistorySamples,
  stationsToHour0Samples,
} from './sampleSources';
import {
  ANCHOR_HISTORY_H, ANCHOR_MAX, ANCHOR_TAU_H, anchorDecay, anchorTerm, innovation,
  type AnchorMode, type AnchorPair, type Innovation,
} from './anchor';
import type { ForecastHourPoint } from '../sources/openMeteoForecast';
import type {
  PointForecast,
  PointForecastHour,
  PointHourSamples,
  PointSourceSample,
} from './types';
import { apparentTemperatureC } from './apparentTemperature';
import { fetchDwdUvPoint, uvToHourSamples } from '../sources/dwdUvForecast';
import { terrainContext, terrainTempDeltaC, type TerrainContext } from './terrainPhysics';
import { createRadarNowcastSampler, type RadarNowcastSampler } from './radarNowcast';
import { fetchGfsPointTail } from './gfsPoint';
import type { ModelSource } from '../fusion/modelSource';

/**
 * Dominante native Modellquelle je Land für den Punkt-`'native'`-Modus
 * (Einzelmodell-Isolation). Bewusst die lizenz-tragende Primärquelle des
 * jeweiligen Landes — kein Blend, kein Obs-Anker, kein Radar/GFS-Consensus:
 *  - DE → MOSMIX (DWD, ICON-EU-biaskorrigiert auf DWD-Stationen)
 *  - AT → AROME 2,5 km (GeoSphere-Primärmodell; INCA-Nowcast bewusst ausgelassen)
 *  - CH → AROME (GeoSphere-bbox deckt CH; MeteoSwiss-Punkt hier nicht abgerufen)
 * `dwd_uv` bleibt überall enthalten: der UV-Index ist orthogonal (kein NWP
 * liefert ihn), konkurriert also mit keiner Modellvariable und würde sonst grundlos
 * ausgeblendet. Der native Pfad ist der garantierte Fallback: liefert die Quelle
 * NICHTS, bleibt der volle Blend erhalten (Panel nie leer).
 */
const NATIVE_POINT_SOURCES: Record<Country, ReadonlySet<string>> = {
  DE: new Set(['mosmix', 'dwd_uv']),
  AT: new Set(['arome_at', 'dwd_uv']),
  CH: new Set(['arome_at', 'dwd_uv']),
};

const STD_LAPSE_PER_M = 0.0065;
/** spatialWeight-Schwelle, ab der eine Station als quasi ko-lokalisierter
 *  In-situ-Anker gilt (nah + höhengleich). 0.5 ≈ wenige km + ≤ ~150 m Δh. */
const ANCHOR_WSP_MIN = 0.5;
/** Toleranz (°C) der Representativeness-QC: Quellen, die mehr als ~diese Spanne
 *  vom In-situ-Anker abweichen, werden gaußförmig heruntergewichtet. */
const ANCHOR_TOL_C = 3.5;

/** Ab dieser angefragten Stundenzahl (>10 Tage) wird der GFS-Langfrist-Schwanz
 *  geladen — MOSMIX deckt darunter alles ab. */
const GFS_TRIGGER_H = 240;
/** GFS beginnt mit Overlap bei ~9 Tagen (glatter Handoff von MOSMIX) … */
const GFS_TAIL_FROM_H = 216;
/** … und reicht bis maximal ~15,5 Tage (innerhalb des 16-Tage-GFS-Horizonts). */
const GFS_TAIL_MAX_H = 372;

/**
 * Vorhersage-Skill-Zerfall über die Lead-Time, je Variable. Realer Skill fällt
 * exponentiell (nicht linear) und unterschiedlich schnell: Temperatur hält lange,
 * Niederschlag/Bewölkung verlieren rasch an Treffsicherheit. `tau` = e-Faltungszeit
 * in Stunden, `floor` = nie-unterschrittene Restsicherheit. Faktor = max(floor, e^(−h/τ)).
 */
const SKILL_DECAY: Record<Variable, { tau: number; floor: number }> = {
  temperature: { tau: 160, floor: 0.45 },
  wind:        { tau: 80,  floor: 0.4 },
  gust:        { tau: 60,  floor: 0.35 },
  humidity:    { tau: 120, floor: 0.4 },
  precipitation: { tau: 36, floor: 0.25 },
  clouds:      { tau: 60,  floor: 0.3 },
  snowLine:    { tau: 120, floor: 0.4 },
  uvIndex:     { tau: 200, floor: 0.5 },
};

/**
 * Stationsanker: Default ist die Innovations-Persistenz (`anchor.ts`, V-PV-19).
 * Kill-Switch zurück zum alten Wert-Anker per URL `?anchor=value` — der benannte
 * Rückfallweg (D-11), damit ein Vergleich im Produkt jederzeit möglich bleibt.
 */
const ANCHOR_MODE_DEFAULT: AnchorMode = (() => {
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('anchor') === 'value') return 'value';
  } catch { /* kein DOM (Node/Worker) */ }
  return 'offset';
})();

export interface PointForecastOptions {
  lat: number;
  lng: number;
  country: Country;
  hours?: number;
  signal?: AbortSignal;
  /**
   * Den RADOLAN-RV-Radar-Nowcast (DE) bzw. rzc-Snapshot (CH) in den
   * Niederschlags-Blend der ersten ~2 h einspeisen — nahtloser Übergang vom
   * gemessenen Radar zum NWP-Niederschlag. Standard aus, weil der Radar-Stack
   * vergleichsweise teuer lädt; der Sampler wird modulweit gecacht, sodass die
   * Aktivierung nach dem ersten Laden pro Land praktisch gratis ist. Punkt-
   * Detailansichten (Panel/Event/Go-No-Go) schalten ihn ein; Massen-Aufrufer
   * (Route/3D) lassen ihn aus. AT nutzt bereits INCA als nowcast-Familie.
   */
  includeRadarNowcast?: boolean;
  /**
   * Modellquelle der Punkt-Engine (Fusion→Layer-Integration, zweite Engine).
   *  - `'fusion'` (Default) → bestehender Multi-Quellen-Blend, unverändert für
   *    ALLE bestehenden Aufrufer (Event/Route/3D/Nowcast/Notifications).
   *  - `'native'` → Einzelmodell-Isolation auf die dominante native Quelle des
   *    Landes (`NATIVE_POINT_SOURCES`). Additiv und opt-in; garantierter Fallback
   *    auf den Blend, wenn die native Quelle nichts liefert.
   */
  sourceMode?: ModelSource;
  /**
   * Kalibrierte Verteilungen je Stunde mitrechnen (buscosun Fusion,
   * `fusion/fuse.ts`). **Default aus** (D-11: neue Rechenpfade kommen
   * default-off mit benanntem Rückfallweg — hier ist der Rückfallweg das
   * unveränderte Ergebnis ohne `hours[].fusion`).
   *
   * Kostet einmalig das Klima-Grid (72 KB, permanent gecacht) und ~50
   * DEM-Abtastungen aus der bereits geladenen Kachel; kein zusätzlicher
   * Wetterdaten-Abruf.
   */
  distribution?: boolean;
  /**
   * Wie die Stationsmessung in die ersten Stunden eingeht (`anchor.ts`):
   *  - `'offset'` (Default) → Innovations-Persistenz: Modell + (Messung − Modell
   *    zu t₀, altersgewichtet über die letzten Stunden) · Abklingen. Das Modell
   *    trägt den Tagesgang, die Station den Ortsversatz.
   *  - `'value'` → der alte Anker: der Messwert selbst mit Gewicht 5,0 und
   *    Halbwertszeit 2,5 h an h = 0…5. Gemessen 2,3× schlechter als rohes MOSMIX
   *    bei 1–6 h (V-A₁); bleibt als Kill-Switch (`?anchor=value`).
   * Die Fusion (`distribution: true`) ist davon unberührt — sie führt ihren
   * eigenen Anker als Anomaliepersistenz (K-1).
   */
  anchorMode?: AnchorMode;
}

// Modulweiter Cache des positions-unabhängigen Radar-Samplers (ein Stack je Land
// deckt alle Punkte ab). Ohne per-Call-Signal, damit ein einzelner Abbruch nicht
// den geteilten Fetch killt; Fehler werden zu null verschluckt.
interface RadarSamplerCacheEntry { ts: number; promise: Promise<RadarNowcastSampler | null> }
const RADAR_SAMPLER_CACHE = new Map<Country, RadarSamplerCacheEntry>();
const RADAR_SAMPLER_TTL_MS = 300_000;   // 5 min — Radar-Lauf aktualisiert ~alle 5 min
function getCachedRadarSampler(country: Country): Promise<RadarNowcastSampler | null> {
  const cached = RADAR_SAMPLER_CACHE.get(country);
  if (cached && (Date.now() - cached.ts) < RADAR_SAMPLER_TTL_MS) return cached.promise;
  const promise = createRadarNowcastSampler(country).catch(() => null);
  RADAR_SAMPLER_CACHE.set(country, { ts: Date.now(), promise });
  return promise;
}

// Kurzlebiger Memo-Cache. Der Wind-Sampler (Tour-Timing) und die Per-Sample-
// Anreicherung fragen pro Cluster denselben Repräsentanten-Punkt ab — der Cache
// dedupliziert diese Doppel-Abfrage (vereinheitlichte Wind-Pfade ohne doppelten
// Netzverkehr). Key = Land + ~110-m-gerundete Position; ein Treffer setzt
// voraus, dass der Cache mindestens so viele Stunden hält wie verlangt.
interface PfCacheEntry { hours: number; forecast: PointForecast; ts: number }
const PF_CACHE = new Map<string, PfCacheEntry>();
const PF_CACHE_TTL_MS = 180_000;     // 3 min
const PF_CACHE_MAX = 64;
function pfCacheKey(lat: number, lng: number, country: Country, radar: boolean, native: boolean, dist: boolean, anchorValue = false): string {
  // Das Radar-Flag MUSS in den Key: sonst könnte ein Nicht-Radar-Aufrufer
  // (Route/3D) den Cache füllen und ein Radar-Aufrufer (Event/Panel) bekäme das
  // radarlose Ergebnis (fehlender Nowcast-Niederschlag). Ebenso der Native-Modus:
  // sonst kollidierten Blend- und Einzelmodell-Ergebnis am selben Punkt.
  // Ebenso das Verteilungs-Flag: sonst bekäme ein Aufrufer, der Verteilungen
  // braucht, den Treffer eines Aufrufers ohne sie — und sähe `fusion` als
  // `undefined`, ohne dass etwas fehlgeschlagen wäre.
  return `${country}:${lat.toFixed(3)}:${lng.toFixed(3)}${radar ? ':r' : ''}${native ? ':n' : ''}${dist ? ':d' : ''}${anchorValue ? ':av' : ''}`;
}

/**
 * Compute the point forecast for the given query.
 */
export async function getPointForecast(opts: PointForecastOptions): Promise<PointForecast> {
  const { lat, lng, country, signal } = opts;
  const profile = COUNTRY_PROFILES[country];
  const hours = opts.hours ?? profile.forecastHours;
  const anchorMode: AnchorMode = opts.anchorMode ?? ANCHOR_MODE_DEFAULT;
  // Wie viele vergangene Stunden für den Anker geholt werden (Schritt zwei).
  const histH = anchorMode === 'offset' ? ANCHOR_HISTORY_H : 0;

  const cacheKey = pfCacheKey(lat, lng, country, !!opts.includeRadarNowcast, opts.sourceMode === 'native', !!opts.distribution, anchorMode === 'value');
  const cached = PF_CACHE.get(cacheKey);
  if (cached && cached.hours >= hours && (Date.now() - cached.ts) < PF_CACHE_TTL_MS) {
    return cached.forecast;
  }

  // --- 1) Parallel data fetches -------------------------------------------
  // DEM lookup → not just the point elevation, but also the local terrain
  // context (sink depth for cold-air pooling, slope/aspect for insolation).
  // Der DEM-Sampler wird MITGEFÜHRT, nicht verworfen: buscosun Fusion braucht
  // dieselben Kacheln für ihre Geländeskalen. Ihn ein zweites Mal zu laden
  // hieße bis zu vier zusätzliche S3-Abrufe und ebenso viele Kachel-Dekodierungen
  // auf dem Hauptthread — für Daten, die schon im Speicher liegen. Die ±0,2°-Box
  // deckt bei 47° N mindestens 15 km Halbweite ab und damit alle Ringradien der
  // Fusion (max. 12 km).
  const terrain$ = (async (): Promise<{ ctx: TerrainContext; sample: ((lng: number, lat: number) => number) | null }> => {
    try {
      const lookup = await loadElevationLookup(
        { lngMin: lng - 0.2, lngMax: lng + 0.2, latMin: lat - 0.2, latMax: lat + 0.2 },
        9, signal,                          // z9 ≈ ~150 m / pixel — alpine-accurate
      );
      const sample = (x: number, y: number) => lookup.sample(x, y);
      // Ein leerer Kachelsatz wirft NICHT — `loadTile` verschluckt jeden Fehler.
      // Ohne diese Probe liefe die Fusion mit einer perfekt flachen Welt weiter
      // und wäre dabei SCHMALER als mit echtem Gelände: falsch und überkonfident
      // zugleich. Deshalb: kein endlicher Wert am Abfragepunkt ⇒ kein Sampler.
      const probe = sample(lng, lat);
      return { ctx: terrainContext(sample, lng, lat), sample: Number.isFinite(probe) ? sample : null };
    } catch { return { ctx: { elevationM: 0, sinkDepthM: 0, slopeRad: 0, aspectRad: 0 }, sample: null }; }
  })();

  // Country-specific source set:
  //   DE → BrightSky MOSMIX (ICON-EU bias-corrected on DWD stations)
  //   AT → GeoSphere AROME 2.5 km + INCA 1 km nowcast + MOSMIX (medium range)
  //   CH → GeoSphere AROME (its bbox extends into CH) + MOSMIX (medium range)
  // Failures are silent — each await falls back to an empty array/null.
  //
  // MOSMIX is fetched for ALL profiles with `useMosmix` (DE/AT/CH), not just DE:
  // DWD MOSMIX has stations across AT/CH too, and BrightSky proxies them by
  // nearest-station. This removes the former hard cut at +60 h for AT/CH (where
  // AROME ends) — MOSMIX continues the timeline to ~10 days, so the point
  // forecast is now continuous over the full horizon in every country. Inside
  // 0–60 h it simply adds an independent consensus member next to AROME.
  const bs$ = profile.useMosmix
    ? fetchBrightSkyPointForecast(lat, lng, hours, signal, histH).catch(() => null)
    : Promise.resolve(null);

  // DWD UV-Index (Tagespeak je Ort, per Sonnenstand auf die Stunde verteilt).
  // DE-only; außerhalb der DWD-Orte liefert die Quelle eine leere Reihe.
  const uv$ = country === 'DE'
    ? fetchDwdUvPoint(lat, lng, hours, signal).catch(() => [])
    : Promise.resolve([] as Awaited<ReturnType<typeof fetchDwdUvPoint>>);

  const inca$ = country === 'AT'
    ? fetchIncaPoint(lat, lng, Math.min(hours, 4), signal, histH).catch(() => [])
    : Promise.resolve([] as Awaited<ReturnType<typeof fetchIncaPoint>>);
  const arome$ = country === 'AT' || country === 'CH'
    ? fetchAromePoint(lat, lng, hours, signal, histH).catch(() => [])
    : Promise.resolve([] as Awaited<ReturnType<typeof fetchAromePoint>>);

  const stations$ = fetchNearestStationObs(lat, lng, country, 6, signal)
    .catch(() => []);
  // Stationshistorie für den Anker (AT: TAWES-Historie, CH: SMN-Tagesdateien),
  // an die Stationsliste gekettet statt danach — kein zusätzlicher Round-Trip
  // auf dem kritischen Pfad. DE kommt über BrightSky im selben Abruf.
  const stationHist$: Promise<Map<string, Map<number, ForecastHourPoint>>> =
    histH > 0 && (country === 'AT' || country === 'CH')
      ? stations$.then((s) => fetchStationHistory(s, country, histH, signal)).catch(() => new Map())
      : Promise.resolve(new Map());

  // Radar-Nowcast (DE: RADOLAN-RV, CH: rzc) — nur auf Anforderung. AT deckt den
  // Nowcast bereits über INCA (nowcast-Familie) ab, daher hier ausgenommen.
  const radar$ = (opts.includeRadarNowcast && (country === 'DE' || country === 'CH'))
    ? getCachedRadarSampler(country)
    : Promise.resolve(null);

  // Langfrist-Schwanz (~9 → 14 Tage) via GFS (Public Domain), NUR wenn ein
  // Consumer wirklich so weit anfragt (>10 Tage). MOSMIX deckt ~10 Tage; GFS
  // beginnt mit Overlap bei ~9 Tagen für einen glatten Handoff und reicht bis
  // 16 Tage. Tag 11–14 ist bewusst Tendenz (Confidence-Decay wertet ab).
  const t0Ms = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const gfs$ = hours > GFS_TRIGGER_H
    ? fetchGfsPointTail(lat, lng, GFS_TAIL_FROM_H, Math.min(hours, GFS_TAIL_MAX_H), t0Ms, signal)
        .catch(() => [] as PointHourSamples[])
    : Promise.resolve([] as PointHourSamples[]);

  const [terrainRes, bsPoint, incaPoint, aromePoint, stations, uvPoint, gfsHours] = await Promise.all([
    terrain$, bs$, inca$, arome$, stations$, uv$, gfs$,
  ]);
  // Die Stationshistorie ist ein Bonus für den Anker, kein Pflichtteil: sie
  // bekommt nach den Pflichtabrufen noch eine kurze Frist (GeoSphere antwortet
  // zeitweise mit vielen Sekunden), danach rechnet der Anker mit dem Paar zu t₀.
  const stationHist = await Promise.race([
    stationHist$,
    new Promise<Map<string, Map<number, ForecastHourPoint>>>((r) => setTimeout(() => r(new Map()), 1500)),
  ]);
  const terrain = terrainRes.ctx;
  const demSample = terrainRes.sample;
  const elevation = terrain.elevationM;

  // Existiert eine quasi ko-lokalisierte Station, misst sie die Mikrolage
  // (Kaltluftsee, Hanglage) bereits — dann die Terrain-Korrektur stark dämpfen,
  // um nicht doppelt zu korrigieren. Sonst (sparse/fern) voll anwenden.
  let bestAnchorWsp = 0;
  for (const s of stations) {
    if (s.point.temperature == null) continue;
    const wsp = spatialWeight(s.distanceMeters ?? 0, Math.abs((s.elevation ?? elevation) - elevation));
    if (wsp > bestAnchorWsp) bestAnchorWsp = wsp;
  }
  const terrainAttenuation = bestAnchorWsp >= ANCHOR_WSP_MIN ? 0.35 : 1;

  // --- 2) Lapse rate regression (from station set) ------------------------
  const lapseSamples: PointSample[] = stations
    .filter((s) => s.point.temperature != null && Number.isFinite(s.elevation))
    .map((s) => ({
      x: 0, y: 0,
      v: s.point.temperature as number,
      elev: s.elevation,
      w: 1,
    }));
  const lapseRatePerM = estimateLapseRate(lapseSamples, STD_LAPSE_PER_M);

  // --- 3) Build per-hour sample lists -------------------------------------
  // AROME/INCA tragen bei `histH > 0` auch vergangene Schritte (Zeit < t₀) —
  // die gehören in die Anker-Historie, nicht in die Zeitachse.
  const isPast = (e: { time: Date }) => e.time.getTime() < t0Ms;
  const aromePast = aromePoint.filter(isPast), aromeFuture = aromePoint.filter((e) => !isPast(e));
  const incaPast = incaPoint.filter(isPast), incaFuture = incaPoint.filter((e) => !isPast(e));
  const mosmixHours = brightSkyToHourSamples(bsPoint, lat, lng);
  const incaHours = seriesToHourSamples(incaFuture, 'inca', 'nowcast');
  const aromeHours = seriesToHourSamples(aromeFuture, 'arome_at', 'highres');
  const uvHours = uvToHourSamples(uvPoint);

  // Build the unified per-hour samples. We anchor on the longest available
  // timeline (arome > mosmix) and align by integer forecast hour. INCA only
  // contributes its short ≤ 3 h window.
  // gfsHours ist index-ausgerichtet (Index = Vorhersagestunde h), sparse unterhalb
  // des Langfrist-Schwanzes — verlängert die Zeitachse über MOSMIX hinaus bis ~14 Tage.
  const timelines = [aromeHours, mosmixHours, uvHours, gfsHours];
  const len = Math.max(...timelines.map((t) => t.length));
  const unified: PointHourSamples[] = [];
  for (let h = 0; h < len; h++) {
    const ts = aromeHours[h]?.timestamp ?? mosmixHours[h]?.timestamp ?? uvHours[h]?.timestamp ?? gfsHours[h]?.timestamp;
    if (!ts) continue;
    const samples: PointSourceSample[] = [
      ...(aromeHours[h]?.samples ?? []),
      ...(mosmixHours[h]?.samples ?? []),
      ...(incaHours[h]?.samples ?? []),
      ...(uvHours[h]?.samples ?? []),
      ...(gfsHours[h]?.samples ?? []),
    ];
    unified.push({ timestamp: ts, samples });
  }
  // Stations contribute at h=0..5 — appended at every hour in that window
  // so the obs family-weight decay (half-life 2.5 h after the bump) can
  // smoothly hand off to NWP instead of disappearing in a single step.
  // Previously we cut them off at h=3, which produced a visible 5 °C jump
  // at alpine points where the NWP grid cell topography differs from the
  // valley-floor query elevation.
  const stationSamples = stationsToHour0Samples(stations).samples;
  for (let h = 0; h < Math.min(6, unified.length); h++) {
    unified[h].samples.push(...stationSamples);
  }
  // Im Versatz-Modus liest der Blend die Stationen nur bei h = 0 (s. Schritt 4);
  // die Einträge an h = 1…5 bleiben für buscosun Fusion (Anomaliepersistenz, K-1).

  // --- 3a) Anker-Historie (Schritt zwei): Paare (Messung, Modell) der letzten
  //     Stunden. DE über BrightSky (Messungen + laufender MOSMIX-Lauf), AT über
  //     TAWES-Historie + AROME/INCA-Schritte, CH aus den SMN-Tagesdateien + AROME.
  const history: PointHourSamples[] = [];
  if (histH > 0) {
    // BrightSky-Messhistorie nur in DE: dort ist die nächste Beobachtungsstation
    // eine der Ankerstationen. In AT/CH wäre es eine ferne DWD-Station.
    const bsHist = brightSkyHistoryToSamples(bsPoint, lat, lng, country === 'DE');
    const aromeHist = seriesToHourSamples(aromePast, 'arome_at', 'highres');
    const incaHist = seriesToHourSamples(incaPast, 'inca', 'nowcast');
    const at = (arr: PointHourSamples[], ms: number) => arr.find((x) => x.timestamp.getTime() === ms)?.samples ?? [];
    for (let k = 1; k <= histH; k++) {
      const ms = t0Ms - k * 3_600_000;
      const samples: PointSourceSample[] = [
        ...(bsHist.get(ms) ?? []),
        ...at(aromeHist, ms),
        ...at(incaHist, ms),
        ...stationsToHistorySamples(stations, stationHist, ms),
      ];
      if (samples.length) history.push({ timestamp: new Date(ms), samples });
    }
  }

  // Radar-Nowcast-Niederschlag (mm/h) als nowcast-Familie einspeisen — nur die
  // Stunden im Radar-Horizont (h0–2) bekommen ein Sample; der nowcast-Precip-
  // Gewichtsfaktor (1,6 in leadTimeWeights) lässt das gemessene Radar dort den
  // NWP-Niederschlag dominieren und über den sticky-Fade glatt an die Vorhersage
  // übergeben — der bislang fehlende nahtlose Nowcast→NWP-Übergang für DE/CH.
  const radarSampler = await radar$;
  let radarContributed = false;
  if (radarSampler) {
    for (let h = 0; h < unified.length; h++) {
      const mmH = radarSampler.sample(lat, lng, unified[h].timestamp.getTime());
      if (mmH == null || !Number.isFinite(mmH)) continue;
      unified[h].samples.push({
        source: radarSampler.meta.source, family: 'nowcast',
        temperature: null, u: null, v: null, gust: null, relativeHumidity: null,
        snowLine: null, cloudLow: null, cloudMid: null, cloudHigh: null,
        precipitation: mmH, uvIndex: null, distanceMeters: 0, sourceElevation: null,
      });
      radarContributed = true;
    }
  }

  // --- 3b) Native-Einzelmodell-Isolation (Punkt-Panel „Native"-Modus) ------
  // Fusion-Default (oben) = voller Blend, unverändert. Im Native-Modus wird pro
  // Stunde auf die dominante native Modellquelle des Landes reduziert — rohe
  // Einzelmodell-Referenz statt Blend, konsistent mit dem Raster-Native (kein
  // Obs-Anker/Radar/Consensus). Die nachgelagerte Höhen-/Mikroklima-Korrektur
  // (elevation/terrain) bleibt erhalten — sie macht auch das Einzelmodell am
  // Abfragepunkt erst brauchbar (Kernwert der App), analog zum Raster-ICON-D2.
  // Garantierter Fallback: liefert die native Quelle NICHTS, bleibt der Blend.
  let isolatedNative = false;
  if (opts.sourceMode === 'native') {
    const nativeSet = NATIVE_POINT_SOURCES[country];
    if (unified.some((h) => h.samples.some((s) => nativeSet.has(s.source)))) {
      for (const h of unified) h.samples = h.samples.filter((s) => nativeSet.has(s.source));
      // Zeitachse auf den Horizont des nativen Modells kürzen (AROME ~60 h),
      // statt jenseits davon leere Stunden mit null-Werten zu zeigen.
      let lastNative = -1;
      for (let h = 0; h < unified.length; h++) if (unified[h].samples.length) lastNative = h;
      unified.length = lastNative + 1;
      isolatedNative = true;
    }
  }

  // --- 3c) Stationsanker als Innovation (V-PV-19) --------------------------
  // Aus den Paaren (Messung, Modell) zu t₀ und in der Historie. Im Native-Modus
  // gibt es keinen Anker (kein Obs-Sample), im Wert-Modus den alten Weg.
  const anchor = anchorMode === 'offset' && !isolatedNative && unified.length
    ? anchorOffsetsFor(
      [{ ageH: 0, samples: unified[0].samples },
        ...history.map((hh) => ({ ageH: (t0Ms - hh.timestamp.getTime()) / 3_600_000, samples: hh.samples }))],
      elevation, lapseRatePerM,
    )
    : null;
  // Ab h = 1 sieht der Blend die Stationen im Versatz-Modus nicht mehr als Wert.
  const blendSamples = (h: number, samples: PointSourceSample[]) =>
    (anchorMode === 'offset' && h > 0 ? samples.filter((x) => x.family !== 'obs') : samples);

  // --- 4) Blend per-hour -------------------------------------------------
  const outHours: PointForecastHour[] = unified.map((hour, hIdx) => {
    // Blend each variable ONCE (value + confidence come from the same result).
    const s = blendSamples(hIdx, hour.samples);
    const temp = blendVariable(s, 'temperature', hIdx, elevation, lapseRatePerM);
    const cLow = blendVariable(s, 'clouds', hIdx, elevation, lapseRatePerM, 'cloudLow');
    const cMid = blendVariable(s, 'clouds', hIdx, elevation, lapseRatePerM, 'cloudMid');
    const cHigh = blendVariable(s, 'clouds', hIdx, elevation, lapseRatePerM, 'cloudHigh');
    const precip = blendVariable(s, 'precipitation', hIdx, elevation, lapseRatePerM);
    const uv = blendVariable(s, 'uvIndex', hIdx, elevation, lapseRatePerM);
    return {
      timestamp: hour.timestamp,
      temperature: temp.value,
      windSpeed: null,
      windDirection: null,
      gustSpeed: null,                    // filled below
      relativeHumidity: null,             // filled below
      apparentTemperature: null,          // derived in step (4b) after wind/humidity
      snowLineM: null,                    // filled below (AROME-only)
      cloudCoverLow: cLow.value,
      cloudCoverMid: cMid.value,
      cloudCoverHigh: cHigh.value,
      cloudCoverTotal: null,
      precipitation: precip.value,
      uvIndex: uv.value,
      confidence: {
        temperature: temp.confidence,
        wind: 0,
        gust: 0,
        humidity: 0,
        precipitation: precip.confidence,
        clouds: cLow.confidence,
        snowLine: 0,
        uvIndex: uv.confidence,
      },
      contributingSources: dominantSources(s, hIdx),
    };
  });
  // Wind needs u/v blended then converted to speed/dir.
  for (let h = 0; h < outHours.length; h++) {
    const samples = blendSamples(h, unified[h].samples);
    const uRes = blendVariable(samples, 'wind', h, elevation, lapseRatePerM, 'u');
    const vRes = blendVariable(samples, 'wind', h, elevation, lapseRatePerM, 'v');
    // Gust and humidity are blended as scalars. Both gracefully skip null
    // samples (handled in blendVariable), so sources without the variable
    // simply don't contribute. Gust is post-floored at windSpeed (gust can
    // never sensibly be smaller than the mean); if no source carried gust,
    // approximate with a 1.4 × multiplier on windSpeed (open-terrain default).
    const gustRes = blendVariable(samples, 'gust', h, elevation, lapseRatePerM);
    const humRes = blendVariable(samples, 'humidity', h, elevation, lapseRatePerM);
    const snowRes = blendVariable(samples, 'snowLine', h, elevation, lapseRatePerM);

    // Stationsanker als Innovations-Persistenz: Modell + Versatz · Abklingen
    // (`anchor.ts`). Bei h = 0 und ohne Anker unverändert der Blend.
    const a = anchoredValues(h, anchor, {
      temperature: outHours[h].temperature, u: uRes.value, v: vRes.value, gust: gustRes.value, humidity: humRes.value,
    });
    outHours[h].temperature = a.temperature;
    if (a.u != null && a.v != null) {
      outHours[h].windSpeed = Math.sqrt(a.u * a.u + a.v * a.v);
      // meteorological direction = where wind comes FROM
      const dirMath = (Math.atan2(-a.u, -a.v) * 180) / Math.PI;
      outHours[h].windDirection = (dirMath + 360) % 360;
    }
    outHours[h].confidence.wind = (uRes.confidence + vRes.confidence) / 2;
    const ws = outHours[h].windSpeed;
    if (a.gust != null) {
      outHours[h].gustSpeed = ws != null ? Math.max(a.gust, ws) : a.gust;
    } else if (ws != null) {
      outHours[h].gustSpeed = ws * 1.4;     // fallback factor for open terrain
    }
    outHours[h].confidence.gust = gustRes.value != null ? gustRes.confidence : 0.3;
    outHours[h].relativeHumidity = a.humidity;
    outHours[h].confidence.humidity = humRes.confidence;
    outHours[h].snowLineM = snowRes.value;
    outHours[h].confidence.snowLine = snowRes.confidence;
    // Herkunfts-Badges: die Station trägt über den Versatz, solange er ≥ 5 % wiegt.
    if (anchor && h > 0 && anchor.fraction * anchorDecay(h, ANCHOR_TAU_H.temperature) >= 0.05) {
      for (const src of anchor.sources) if (!outHours[h].contributingSources.includes(src)) outHours[h].contributingSources.push(src);
    }

    // Total cover: the point sources (MOSMIX/AROME) only report ONE total
    // cover, which we split 55/30/15 into L/M/H. They are NOT independent
    // cloud layers, so the total is their SUM (the split fractions sum to 1.0),
    // not the random-overlap product 1-(1-cL)(1-cM)(1-cH) — that formula assumes
    // independence and systematically under-reported overcast (100 % → 73 %).
    const cl = outHours[h].cloudCoverLow ?? 0;
    const cm = outHours[h].cloudCoverMid ?? 0;
    const ch = outHours[h].cloudCoverHigh ?? 0;
    outHours[h].cloudCoverTotal = Math.min(100, cl + cm + ch);

    // DACH-Mikroklima-Korrektur (nach dem Blend): nächtlicher Kaltluftsee in
    // Senken + tagsüber Hang-Einstrahlung. Beschränkt und durch einen ko-
    // lokalisierten Stations-Anker gedämpft (s. terrainAttenuation), damit die
    // Korrektur nicht doppelt zur bereits gemessenen Mikrolage hinzukommt.
    if (outHours[h].temperature != null && (terrain.sinkDepthM > 0 || terrain.slopeRad >= 0.03)) {
      const tDelta = terrainTempDeltaC({
        ctx: terrain, lat, lng, etaMs: outHours[h].timestamp.getTime(),
        windMs: outHours[h].windSpeed, cloudPct: outHours[h].cloudCoverTotal,
        anchorAttenuation: terrainAttenuation,
      });
      if (tDelta !== 0) outHours[h].temperature = (outHours[h].temperature as number) + tDelta;
    }

    // Gefühlte Temperatur — Wind-Chill (T ≤ 10 °C) bzw. Heat-Index (T ≥ 27 °C);
    // im Komfortbereich identisch mit T. Braucht T immer, Wind nur im Kalt-,
    // Feuchte nur im Heißbereich.
    outHours[h].apparentTemperature = apparentTemperatureC(
      outHours[h].temperature, outHours[h].windSpeed, outHours[h].relativeHumidity,
    );
  }

  // --- 5) Available sources tag set ---------------------------------------
  const sourcesAvailable = Array.from(new Set([
    ...stations.map((s) => s.source),
    bsPoint ? 'mosmix' : null,
    incaPoint.length ? 'inca' : null,
    aromePoint.length ? 'arome_at' : null,
    uvPoint.some((u) => u.uvIndex != null) ? 'dwd_uv' : null,
    radarContributed && radarSampler ? radarSampler.meta.source : null,
    gfsHours.some((g) => g && g.samples.length) ? 'gfs' : null,
  ].filter((s): s is string => !!s)))
    // Im isolierten Native-Modus nur die tatsächlich genutzten nativen Quellen
    // ausweisen — sonst zeigten die Herkunfts-Badges Quellen, die nicht in den
    // Blend eingegangen sind.
    .filter((s) => !isolatedNative || NATIVE_POINT_SOURCES[country].has(s));

  // --- 4c) Kalibrierte Verteilungen (opt-in, additiv) ----------------------
  // Rechnet buscosun Fusion (`fusion/fuse.ts`) je Stunde und hängt sie an.
  // Ohne `distribution: true` passiert hier nichts — alle bestehenden Aufrufer
  // bekommen Feld für Feld dasselbe Ergebnis wie zuvor (D-11, Funktionserhalt).
  if (opts.distribution) {
    try {
      const { computeDistributions } = await import('./fusion/attach');
      const dists = await computeDistributions({
        lat, lng,
        elevationM: elevation,
        lapseRatePerM,
        terrain,
        demSample,
        unified,
        blended: outHours,
        signal,
      });
      for (let h = 0; h < outHours.length; h++) outHours[h].fusion = dists[h] ?? null;
    } catch {
      // Ein Fehlschlag nimmt die Verteilungen, nie die Vorhersage.
      for (const h of outHours) h.fusion = null;
    }
  }

  const result: PointForecast = {
    query: { lat, lng, elevation, country },
    hours: outHours,
    fetchedAt: Date.now(),
    lapseRatePerM,
    nearestStations: stations.map((s) => ({
      source: s.source,
      distanceMeters: s.distanceMeters,
      elevation: s.elevation,
    })),
    sourcesAvailable,
  };
  // Ein abgebrochener oder quellenloser Lauf darf NICHT in den Cache: jeder
  // Fetch fängt seine Fehler selbst ab, ein `abort()` beim Unmount erzeugt also
  // ein leeres, fehlerfreies Ergebnis — und würde drei Minuten lang an alle
  // weiteren Abfragen desselben Punktes ausgeliefert.
  const degraded = signal?.aborted === true || outHours.length === 0 || sourcesAvailable.length === 0;
  if (!degraded) {
    PF_CACHE.set(cacheKey, { hours, forecast: result, ts: Date.now() });
  }
  if (PF_CACHE.size > PF_CACHE_MAX) {
    const oldest = PF_CACHE.keys().next().value;
    if (oldest !== undefined) PF_CACHE.delete(oldest);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Stationsanker als Innovations-Persistenz (V-PV-19) — geteilt mit dem
// Nachrechen-Harness `scripts/verify-pv-score.mjs`, damit dort dieselbe Rechnung läuft.
// ---------------------------------------------------------------------------

export interface AnchorOffsets {
  temperature: Innovation | null;
  humidity: Innovation | null;
  u: Innovation | null;
  v: Innovation | null;
  gust: Innovation | null;
  /** Größte Repräsentativität unter den Stationen (für Badges/Diagnose). */
  fraction: number;
  sources: string[];
}

/**
 * Versatz je Größe aus Stunden, die Messungen UND Modellwerte tragen: je Stunde
 * die räumlich gewichtete Messung (wie im Blend) gegen den Modell-Blend derselben
 * Stunde; `ageH` = Alter der Stunde gegenüber t₀ (0 = jetzt). `null`, wenn keine
 * Stunde ein Paar liefert.
 */
export function anchorOffsetsFor(
  hours: Array<{ ageH: number; samples: PointSourceSample[] }>,
  queryElevation: number,
  lapseRatePerM: number,
): AnchorOffsets | null {
  type Key = 'temperature' | 'humidity' | 'u' | 'v' | 'gust';
  const spec: Array<[Key, Variable, 'u' | 'v' | undefined]> = [
    ['temperature', 'temperature', undefined], ['humidity', 'humidity', undefined],
    ['u', 'wind', 'u'], ['v', 'wind', 'v'], ['gust', 'gust', undefined],
  ];
  const pairs: Record<Key, AnchorPair[]> = { temperature: [], humidity: [], u: [], v: [], gust: [] };
  const sources = new Set<string>();
  let fraction = 0;
  const rawOf = (s: PointSourceSample, key: Key): number | null =>
    key === 'u' ? s.u : key === 'v' ? s.v : key === 'temperature' ? s.temperature : key === 'humidity' ? s.relativeHumidity : s.gust;
  for (const hr of hours) {
    const obs = hr.samples.filter((s) => s.family === 'obs');
    const model = hr.samples.filter((s) => s.family !== 'obs');
    if (!obs.length || !model.length) continue;
    for (const [key, variable, pick] of spec) {
      const o = blendVariable(obs, variable, 0, queryElevation, lapseRatePerM, pick);
      const m = blendVariable(model, variable, 0, queryElevation, lapseRatePerM, pick);
      if (o.value == null || m.value == null) continue;
      let wsp = 0;
      for (const s of obs) {
        const raw = rawOf(s, key);
        if (raw == null || !Number.isFinite(raw)) continue;
        wsp = Math.max(wsp, spatialWeight(s.distanceMeters ?? 0, Math.abs((s.sourceElevation ?? queryElevation) - queryElevation)));
        sources.add(s.source);
      }
      if (!(wsp > 0)) continue;
      pairs[key].push({ ageH: hr.ageH, obs: o.value, model: m.value, wsp });
      fraction = Math.max(fraction, wsp);
    }
  }
  const out: AnchorOffsets = {
    temperature: innovation(pairs.temperature, ANCHOR_MAX.temperature),
    humidity: innovation(pairs.humidity, ANCHOR_MAX.humidity),
    u: innovation(pairs.u, ANCHOR_MAX.wind),
    v: innovation(pairs.v, ANCHOR_MAX.wind),
    gust: innovation(pairs.gust, ANCHOR_MAX.gust),
    fraction: Math.min(1, fraction),
    sources: [...sources],
  };
  return out.temperature || out.humidity || out.u || out.v || out.gust ? out : null;
}

/** Modellwerte der Stunde `h` plus abklingender Versatz; bei h = 0 oder ohne Anker unverändert. */
export function anchoredValues(
  h: number,
  a: AnchorOffsets | null,
  raw: { temperature: number | null; u: number | null; v: number | null; gust: number | null; humidity: number | null },
): { temperature: number | null; u: number | null; v: number | null; gust: number | null; humidity: number | null } {
  if (!a || h <= 0) return raw;
  const add = (v: number | null, inn: Innovation | null, tau: number) => (v == null || !inn ? v : v + anchorTerm(inn, h, tau));
  const hum = add(raw.humidity, a.humidity, ANCHOR_TAU_H.humidity);
  const gust = add(raw.gust, a.gust, ANCHOR_TAU_H.gust);
  return {
    temperature: add(raw.temperature, a.temperature, ANCHOR_TAU_H.temperature),
    u: add(raw.u, a.u, ANCHOR_TAU_H.wind),
    v: add(raw.v, a.v, ANCHOR_TAU_H.wind),
    gust: gust == null ? null : Math.max(0, gust),
    humidity: hum == null ? null : Math.max(0, Math.min(100, hum)),
  };
}

interface BlendResult {
  value: number | null;
  confidence: number;
}

/**
 * Weighted blend of a single variable for one hour.
 *
 * `pick` chooses which channel of the sample drives the value; for cloud
 * cover it's one of 'cloudLow' | 'cloudMid' | 'cloudHigh', for wind u/v it's
 * 'u' | 'v', for everything else it's the variable name itself.
 */
export function blendVariable(
  samples: PointSourceSample[],
  variable: Variable,
  hour: number,
  queryElevation: number,
  lapseRatePerM: number,
  pick?: 'cloudLow' | 'cloudMid' | 'cloudHigh' | 'u' | 'v',
): BlendResult {
  // For 'gust' and 'humidity' the value comes directly off the sample fields.
  // No `pick` parameter — handled in the value-extraction branch below.
  let wsum = 0;
  let vsum = 0;
  const vs: Array<{ v: number; w: number }> = [];
  // Track which independent source families contribute a non-trivial weight.
  // A consensus across e.g. obs + highres + mosmix is a stronger signal than
  // three samples from the same MOSMIX grid agreeing with each other.
  const contributingFamilies = new Set<string>();

  // Representativeness-QC-Anker (nur Temperatur): existiert eine quasi ko-
  // lokalisierte Station (nah + höhengleich), ist ihr Messwert die beste
  // Wahrheit für DIESEN Punkt. Coarse-grid-NWP (AROME 2,5 km, ICON-D2) liest an
  // scharfen Gipfeln/in tiefen Tälern systematisch falsch, weil seine Gitter-
  // Topografie die reale Höhe nicht auflöst — und wird mangels Gitter-Höhe NICHT
  // lapse-korrigiert. Wir gewichten daher Quellen, die dem In-situ-Anker stark
  // widersprechen, gaußförmig herunter. Modell-agnostisch und selbst-justierend:
  // passt eine Quelle (z. B. INCA) zum Anker, bleibt sie voll erhalten; nur die
  // tatsächlich abweichende (AROME am Gipfel) wird unterdrückt. Greift nur, wenn
  // ein hinreichend ko-lokalisierter Anker existiert — sonst unverändert.
  let anchorVal: number | null = null;
  if (variable === 'temperature') {
    let bestWsp = 0;
    for (const s of samples) {
      if (s.family !== 'obs') continue;
      if (familyWeight(s.family, hour, variable) <= 0) continue;
      const raw = s.temperature;
      if (raw == null || !Number.isFinite(raw)) continue;
      const wsp = spatialWeight(s.distanceMeters ?? 0, Math.abs((s.sourceElevation ?? queryElevation) - queryElevation));
      if (wsp > bestWsp) {
        bestWsp = wsp;
        anchorVal = s.sourceElevation != null ? raw + (s.sourceElevation - queryElevation) * lapseRatePerM : raw;
      }
    }
    if (bestWsp < ANCHOR_WSP_MIN) anchorVal = null;
  }

  for (const s of samples) {
    const w0 = familyWeight(s.family, hour, variable);
    if (w0 <= 0) continue;
    // Station samples additionally get a distance + elevation similarity
    // weight; gridded model samples sit at the query point so this is a no-op
    // (distance ~ 0, elev = grid topography vs DEM).
    const wsp = s.family === 'obs'
      ? spatialWeight(s.distanceMeters ?? 0, Math.abs((s.sourceElevation ?? queryElevation) - queryElevation))
      : 1;
    let w = w0 * wsp;
    if (w <= 0) continue;
    let raw: number | null = null;
    if (pick === 'cloudLow') raw = s.cloudLow;
    else if (pick === 'cloudMid') raw = s.cloudMid;
    else if (pick === 'cloudHigh') raw = s.cloudHigh;
    else if (pick === 'u') raw = s.u;
    else if (pick === 'v') raw = s.v;
    else if (variable === 'temperature') raw = s.temperature;
    else if (variable === 'precipitation') raw = s.precipitation;
    else if (variable === 'gust') raw = s.gust;
    else if (variable === 'humidity') raw = s.relativeHumidity;
    else if (variable === 'snowLine') raw = s.snowLine;
    else if (variable === 'uvIndex') raw = s.uvIndex;
    else raw = null;
    if (raw == null || !Number.isFinite(raw)) continue;

    // Temperature gets elevation-corrected: the sample is at the source's
    // elevation; we want the value at the query point's elevation.
    let v = raw;
    if (variable === 'temperature' && s.sourceElevation != null) {
      const dh = s.sourceElevation - queryElevation;
      v = raw + dh * lapseRatePerM;
    }
    // Wind gets a topographic speed-up correction. Valley-floor stations
    // routinely read 1–2 m/s while an exposed 542 m ridge nearby sits at
    // 4–5 m/s; without this scaling the obs-anchored h=0 reads as 1.15 m/s
    // for the ridge query (cf. Schmalkalden vs. all NWP models showing
    // 3–4 m/s). Empirical compromise: 0.15 %/m elevation gain, capped at
    // ±80 % so a very tall mountain query near a deep-valley station
    // produces a plausible (not absurd) inflation.
    if (variable === 'wind' && s.sourceElevation != null && (pick === 'u' || pick === 'v')) {
      const dh = queryElevation - s.sourceElevation;
      const speedup = Math.max(0.7, Math.min(1.8, 1 + 0.0015 * dh));
      v = raw * speedup;
    }

    // Representativeness-QC: Abweichung vom In-situ-Anker gaußförmig abstrafen.
    // Der Anker selbst (dev≈0) bleibt unangetastet; nur stark abweichende
    // Quellen (coarse-grid-NWP am Gipfel) verlieren Gewicht.
    if (anchorVal != null) {
      const dev = (v - anchorVal) / ANCHOR_TOL_C;
      w *= Math.exp(-dev * dev);
      if (w <= 0) continue;
    }

    wsum += w;
    vsum += w * v;
    vs.push({ v, w });
    contributingFamilies.add(s.family);
  }

  if (wsum <= 0 || !vs.length) return { value: null, confidence: 0 };
  const mean = vsum / wsum;

  // Weighted variance → confidence
  let varW = 0;
  for (const s of vs) varW += s.w * (s.v - mean) * (s.v - mean);
  const stdW = Math.sqrt(varW / wsum);
  // Variable-specific tolerance: temperature ±1.5 °C is "high confidence",
  // wind ±2 m/s, precip ±0.5 mm/h, cloud ±15 %. Above tolerance → low conf.
  const tol = (
    variable === 'temperature' ? 1.5 :
    variable === 'wind' ? 2.0 :
    variable === 'gust' ? 4.0 :       // gust is intrinsically more volatile
    variable === 'humidity' ? 8 :     // %, ±8 is "tight" agreement
    variable === 'snowLine' ? 100 :   // m — Modelle untereinander ±100 m typisch
    variable === 'precipitation' ? 0.5 :
    variable === 'uvIndex' ? 1.0 :    // UV-Index-Einheiten — ±1 ist „eng"
    15
  );
  const stdConf = Math.max(0, Math.min(1, 1 - stdW / (tol * 3)));
  // A SINGLE source carries NO agreement signal — its spread is 0, which
  // naïvely yields a falsely perfect 1.0 (e.g. DE beyond h≈5 is MOSMIX-only,
  // AT/CH are AROME-only → previously every hour showed 100 % "confidence").
  // With <2 samples we can't verify the value, so we cap the agreement term at
  // a "plausible but unverified" 0.6 instead of trusting the zero spread.
  const agreement = vs.length >= 2 ? stdConf : Math.min(stdConf, 0.6);
  // Forecast skill decays with lead time, exponentially and variable-specific:
  // temperature holds far longer than precipitation/clouds. (Previously a single
  // linear ramp for all variables, which over-credited +5-day precip.)
  const decay = SKILL_DECAY[variable] ?? { tau: 100, floor: 0.4 };
  const leadFactor = Math.max(decay.floor, Math.exp(-hour / decay.tau));
  // Independent-source consensus bonus: +0.05 per extra family beyond the
  // first, but only when they actually agree (agreement > 0.6) AND there are
  // genuinely ≥2 independent families — never lifts a single source.
  const familyBonus = agreement > 0.6 && contributingFamilies.size >= 2
    ? (contributingFamilies.size - 1) * 0.05
    : 0;
  const confidence = Math.max(0, Math.min(1, agreement * leadFactor + familyBonus));
  return { value: mean, confidence };
}

/**
 * Sources that contributed > 5 % of the temperature weight for this hour.
 * Used purely for badge/transparency display. Sources whose temperature
 * value is null are not counted — otherwise an obs source with high family
 * weight but no T reading (e.g. wind-only station) would be falsely shown
 * as the dominant temperature contributor.
 */
function dominantSources(samples: PointSourceSample[], hour: number): string[] {
  let total = 0;
  const tally = new Map<string, number>();
  for (const s of samples) {
    if (s.temperature == null || !Number.isFinite(s.temperature)) continue;
    const w = familyWeight(s.family, hour, 'temperature');
    if (w <= 0) continue;
    total += w;
    tally.set(s.source, (tally.get(s.source) ?? 0) + w);
  }
  if (total <= 0) return [];
  return Array.from(tally.entries())
    .filter(([, w]) => w / total > 0.05)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
}

// Re-export helper for tests / debugging.
export { haversine };

// ---------------------------------------------------------------------------
// Verifikation der Representativeness-QC (In-situ-Anker) — synthetische Quellen.
// ---------------------------------------------------------------------------
export interface AnchorCheck { name: string; expected: string; got: number | null; ok: boolean }
export interface AnchorVerifyResult { checks: AnchorCheck[]; passed: number; failed: number }

function mkPS(
  family: PointSourceSample['family'], temperature: number,
  sourceElevation: number | null, distanceMeters: number,
): PointSourceSample {
  return {
    source: family, family, temperature, sourceElevation,
    u: null, v: null, gust: null, relativeHumidity: null, snowLine: null,
    cloudLow: null, cloudMid: null, cloudHigh: null, precipitation: null,
    uvIndex: null, distanceMeters,
  };
}

export function verifyAnchorQC(): AnchorVerifyResult {
  const checks: AnchorCheck[] = [];
  const qElev = 2200, lapse = 0.0088;
  const blend = (samples: PointSourceSample[]) =>
    blendVariable(samples, 'temperature', 0, qElev, lapse).value;
  const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

  // Anker (ko-lokalisierte Gipfelstation 13,8 °C) + warmes Coarse-NWP (20,5 °C).
  // Ohne QC läge der Blend bei ~15,1; mit QC nahe der Station.
  const warmNwp = blend([mkPS('obs', 13.8, 2200, 100), mkPS('highres', 20.5, null, 0)]);
  checks.push({ name: 'Anker zieht warmes NWP herunter (→ ~13,8)', expected: '13.5–14.3', got: r1(warmNwp),
    ok: warmNwp != null && warmNwp >= 13.5 && warmNwp <= 14.3 });

  // Quelle, die zum Anker PASST (INCA 14,4), bleibt erhalten → leicht über Anker.
  const withInca = blend([mkPS('obs', 13.8, 2200, 100), mkPS('nowcast', 14.4, null, 0), mkPS('highres', 20.5, null, 0)]);
  checks.push({ name: 'Passende Quelle (INCA) bleibt erhalten (→ ~14,0)', expected: '13.8–14.4', got: r1(withInca),
    ok: withInca != null && withInca >= 13.8 && withInca <= 14.4 });

  // KEIN ko-lokalisierter Anker (Station 30 km weg, 1600 m tiefer) → QC inaktiv,
  // warmes NWP bleibt dominant (Alt-Verhalten erhalten).
  const noAnchor = blend([mkPS('obs', 28, 600, 30000), mkPS('highres', 20.5, null, 0)]);
  checks.push({ name: 'Ohne ko-lokalisierten Anker → QC inaktiv (NWP-dominiert >19)', expected: '>19', got: r1(noAnchor),
    ok: noAnchor != null && noAnchor > 19 });

  // Innovations-Persistenz (V-PV-19): Station 8 °C, Modell 12 °C bei t₀ ⇒ Versatz −4 K;
  // bei h = 1 trägt er mit e^(−1/4), bei h = 0 bleibt der Blend unangetastet.
  const off = anchorOffsetsFor([{ ageH: 0, samples: [mkPS('obs', 8, 2200, 100), mkPS('highres', 12, null, 0)] }], qElev, lapse);
  const t1 = anchoredValues(1, off, { temperature: 14, u: null, v: null, gust: null, humidity: null }).temperature;
  const t0 = anchoredValues(0, off, { temperature: 14, u: null, v: null, gust: null, humidity: null }).temperature;
  checks.push({ name: 'Anker-Versatz: Station − Modell = −4 K, bei h = 1 mit e^(−¼) (→ 10,9)', expected: '10.8–11.0', got: r1(t1),
    ok: off?.temperature?.offset === -4 && t1 != null && t1 > 10.8 && t1 < 11.0 });
  checks.push({ name: 'Anker-Versatz: bei h = 0 unverändert', expected: '14', got: r1(t0), ok: t0 === 14 });
  // Negativkontrolle: ohne Modellwert im selben Stundenkorb gibt es kein Paar und keinen Versatz.
  const none = anchorOffsetsFor([{ ageH: 0, samples: [mkPS('obs', 8, 2200, 100)] }], qElev, lapse);
  checks.push({ name: 'Negativkontrolle: Messung ohne Modell ⇒ kein Versatz', expected: 'null', got: none ? 1 : null, ok: none === null });

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyAnchorQC: typeof verifyAnchorQC }).__verifyAnchorQC = verifyAnchorQC;
}
