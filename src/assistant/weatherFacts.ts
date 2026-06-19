/**
 * Grounding-Daten je Ort: zieht die verifizierten Werte aus den BESTEHENDEN
 * buscosun-Pipelines (keine neuen Quellen) und baut daraus die Phänomen-Blöcke.
 *
 *  • Föhn               ← getPointForecast (Surface jetzt) → detectFoehn
 *  • Inversion          ← threed-Vertikalschnitt (estimateInversion)
 *  • Wolkenuntergrenze  ← threed-Vertikalschnitt (LCL der Mittelspalte)
 *  • Höhenwindprofil    ← threed-Vertikalschnitt (AGL-Zellen der Mittelspalte)
 *  • Lee-Wellen         ← threed-Vertikalschnitt (Kammwind, Relief, Scherung, Stabilität)
 *  • Modell-Spread      ← confidence/multiModel + agreement
 *
 * Der Vertikalschnitt braucht eine Linie. Die legen wir AUTOMATISCH entlang des
 * steilsten lokalen Geländegradienten (DEM-Probe in mehreren Azimuten) — so quert
 * sie Tal↔Kamm, was Inversion und Lee-Wellen erst greifbar macht. Liegt der Ort
 * im Flachland, bleibt das Relief klein und die entsprechenden Chips deaktiviert.
 */

import type { Location } from '../types';
import { shortLocationName } from '../geocode';
import { getPointForecast } from '../pointForecast/pointForecast';
import { detectFoehn, foehnGeoFactor } from '../pointForecast/foehnDetector';
import { fetchMultiModelForecast } from '../confidence/multiModel';
import { agreement } from '../confidence/agreementModel';
import { loadElevationLookup } from '../fusion/elevation';
import { prepareCrossSection, sectionAtTime } from '../threed/buildCrossSection';
import { columnShear, type CrossSection, type ColumnProfile } from '../threed/crossSection';
import type { GeoPoint } from '../threed/sectionGeometry';
import {
  buildFoehnFacts, buildInversionFacts, buildCloudBaseFacts,
  buildWindProfileFacts, buildModelSpreadFacts, buildLeeWaveFacts,
  type GroundingBlock, type Phenomenon,
} from './grounding';

export interface LocationFacts {
  location: Location;
  /** Nur Phänomene, deren Datenbasis am Ort tatsächlich trägt. */
  blocks: Partial<Record<Phenomenon, GroundingBlock>>;
  /** Jüngster Modelllauf-/Abrufzeitpunkt (ms) für die Aktualitätsanzeige. */
  runAtMs: number;
}

// --- Geometrie-Helfer --------------------------------------------------------

const EARTH_R = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function forwardPoint(lat: number, lon: number, bearingDeg: number, distM: number): GeoPoint {
  const br = toRad(bearingDeg), φ1 = toRad(lat), λ1 = toRad(lon), δ = distM / EARTH_R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(br));
  const λ2 = λ1 + Math.atan2(Math.sin(br) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lon: ((toDeg(λ2) + 540) % 360) - 180 };
}

/**
 * Legt eine ~12-km-Schnittlinie durch den Ort entlang des steilsten Azimuts
 * (max. Höhendifferenz der beiden Endpunkte). `bearing` = Laufrichtung der Linie
 * (≈ quer zum Kamm) — für die Lee-Wellen-Querkomponente.
 */
async function steepestSectionLine(loc: Location, signal?: AbortSignal): Promise<{ points: GeoPoint[]; bearing: number }> {
  const half = 6_000;
  const pad = 0.13; // ° (~14 km) — deckt beide Endpunkte ab
  const elev = await loadElevationLookup(
    { lngMin: loc.lon - pad, lngMax: loc.lon + pad, latMin: loc.lat - pad, latMax: loc.lat + pad },
    11, signal,
  );
  let bestBearing = 90, bestDiff = -1;
  for (let b = 0; b < 180; b += 30) {
    const p1 = forwardPoint(loc.lat, loc.lon, b, half);
    const p2 = forwardPoint(loc.lat, loc.lon, b + 180, half);
    const e1 = elev.sample(p1.lon, p1.lat), e2 = elev.sample(p2.lon, p2.lat);
    if (!Number.isFinite(e1) || !Number.isFinite(e2)) continue;
    const diff = Math.abs(e1 - e2);
    if (diff > bestDiff) { bestDiff = diff; bestBearing = b; }
  }
  const a = forwardPoint(loc.lat, loc.lon, bestBearing + 180, half);
  const c = forwardPoint(loc.lat, loc.lon, bestBearing, half);
  return { points: [a, c], bearing: bestBearing };
}

/** Spalte am Ort (Mitte der Linie). */
function centerColumn(section: CrossSection): ColumnProfile {
  const cols = section.columns;
  const mid = cols[cols.length - 1].distanceM / 2;
  return cols.reduce((best, c) => (Math.abs(c.distanceM - mid) < Math.abs(best.distanceM - mid) ? c : best), cols[0]);
}

async function buildSection(loc: Location, signal?: AbortSignal): Promise<{ section: CrossSection; bearing: number; runAtMs: number }> {
  const { points, bearing } = await steepestSectionLine(loc, signal);
  const prepared = await prepareCrossSection(points, signal);
  const tMs = Math.max(prepared.startMs, Math.min(Date.now(), prepared.endMs));
  return { section: sectionAtTime(prepared, tMs), bearing, runAtMs: prepared.runAtMs };
}

function leeBlock(label: string, section: CrossSection, bearing: number): GroundingBlock | null {
  const reliefM = section.terrainMaxM - section.terrainMinM;
  if (reliefM < 150) return null; // ohne nennenswertes Relief keine Lee-Wellen-Frage
  const summitDist = section.summit.distanceM;
  const crest = section.columns.reduce(
    (b, c) => (Math.abs(c.distanceM - summitDist) < Math.abs(b.distanceM - summitDist) ? c : b),
    section.columns[0],
  );
  const crestWindKmh = crest.surface.windKmh;
  const crestWindDirDeg = crest.surface.windDirDeg;
  // Querkomponente zur Linie (≈ senkrecht zum Kamm): Wind-Zielrichtung vs. Bearing.
  const windTo = (crestWindDirDeg + 180) % 360;
  const crossRidgeKmh = Math.abs(crestWindKmh * Math.cos(toRad(windTo - bearing)));
  let maxShear = 0;
  for (const col of section.columns) {
    for (const s of columnShear(col.cells)) if (s > maxShear) maxShear = s;
  }
  const stableLayer = section.inversion.stable || section.inversion.present;
  return buildLeeWaveFacts(label, { crestWindKmh, crestWindDirDeg, crossRidgeKmh, reliefM, maxShearKmhPer300m: maxShear, stableLayer }, 'aktuell');
}

/**
 * Lädt alle groundbaren Phänomen-Blöcke für einen Ort. Jede Teil-Pipeline ist
 * best-effort (Promise.allSettled) — fällt eine aus, fehlen nur deren Chips.
 */
export async function loadLocationFacts(loc: Location, signal?: AbortSignal): Promise<LocationFacts> {
  const label = shortLocationName(loc.name);
  const blocks: Partial<Record<Phenomenon, GroundingBlock>> = {};
  let runAtMs = Date.now();

  const [pf, sec, mm] = await Promise.allSettled([
    getPointForecast({ lat: loc.lat, lng: loc.lon, country: loc.country, hours: 24, signal }),
    buildSection(loc, signal),
    fetchMultiModelForecast(loc.lat, loc.lon, signal),
  ]);

  // Föhn (Surface jetzt) — nur im/nahe dem Alpenraum (geoFactor > 0).
  if (pf.status === 'fulfilled') {
    runAtMs = Math.max(runAtMs, pf.value.fetchedAt);
    const now = pf.value.hours[0];
    if (now && foehnGeoFactor(loc.lat) > 0) {
      const assessment = detectFoehn({
        temperatureC: now.temperature, windSpeedMps: now.windSpeed,
        windDirectionDeg: now.windDirection, gustMps: now.gustSpeed,
        relativeHumidityPct: now.relativeHumidity, lat: loc.lat,
      });
      const b = buildFoehnFacts(label, assessment, {
        windDirectionDeg: now.windDirection, windSpeedMps: now.windSpeed,
        gustMps: now.gustSpeed, relativeHumidityPct: now.relativeHumidity, temperatureC: now.temperature,
      }, 'aktuell');
      if (b) blocks.foehn = b;
    }
  }

  // Inversion / Wolkenuntergrenze / Höhenwindprofil / Lee-Wellen (Vertikalschnitt).
  if (sec.status === 'fulfilled') {
    const { section, bearing, runAtMs: secRun } = sec.value;
    runAtMs = Math.max(runAtMs, secRun);
    const inv = buildInversionFacts(label, section.inversion, 'aktuell');
    if (inv) blocks.inversion = inv;
    const center = centerColumn(section);
    const cb = buildCloudBaseFacts(label, center, 'aktuell');
    if (cb) blocks.cloudbase = cb;
    const wp = buildWindProfileFacts(label, center.cells, 'aktuell');
    if (wp) blocks.windprofile = wp;
    const lee = leeBlock(label, section, bearing);
    if (lee) blocks.leewaves = lee;
  }

  // Modell-Unsicherheit (heute).
  if (mm.status === 'fulfilled') {
    const today = mm.value.days[0];
    if (today) {
      const labels = mm.value.models.map((m) => m.label);
      const ag = agreement(today.tMaxByModel, today.precipByModel, labels);
      const b = buildModelSpreadFacts(label, ag, labels, today.tMaxByModel, 'heute');
      if (b) blocks.modelspread = b;
    }
  }

  return { location: loc, blocks, runAtMs };
}
