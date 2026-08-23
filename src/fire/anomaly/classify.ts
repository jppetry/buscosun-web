/**
 * Thermalanomalien — Signaturvergleich zur Laufzeit (TA3).
 *
 * Ein Brand-Eintrag, dessen Schwerpunkt auf einem bekannten Standort liegt (`siteAt`), ist
 * **nicht automatisch** die Anlage. Vier Prüfungen entscheiden, und jede verletzte Prüfung
 * löst zugunsten „Brand" auf — der False Negative (ein echter Brand neben dem Werk, still
 * einsortiert) ist das kritische Risiko, nicht der graue Hochofen:
 *
 *   footprint  alle Überflug-Boxen liegen in den Standortzellen ± 1 Zelle
 *   growth     kein räumliches Wachstum zwischen erster und zweiter Hälfte der Überflüge
 *              (dieselbe Schwelle wie F2: `STATIC_MOVE_M`, eine Pixelbreite)
 *   intensity  stärkstes Pixel ≤ 1,5 × Archiv-Maximum des Standorts
 *   mapping    keine EFFIS-Kartierung, keine EMS-Aktivierung (Varallo-Regel: Bestätigung gewinnt)
 *
 * Ergebnis `'site'` (alle bestanden) oder `'site-deviating'` (mindestens eine verletzt — der
 * Eintrag bleibt Brand UND zeigt die Abweichung). Kein Treffer ⇒ `null`, alles wie heute.
 * Die Einordnung ist eine eigene Ableitung (`origin: 'derived'`), nie ein Feld der Quelle.
 *
 * Pur, DOM-frei — `npm run verify:fire-anomalies`.
 */

import type { FirePass } from '../activity/overpasses';
import { STATIC_MOVE_M } from '../fireEvents';
import { metersBetween } from '../sources/firmsHotspots';
import { inSiteFootprint, FACILITY_KIND_LABEL, SITE_CLASS_LABEL, type ThermalSite } from './thermalSites';

export type AnomalyKind = 'site' | 'site-deviating';

export interface AnomalyChecks {
  footprint: boolean;
  growth: boolean;
  intensity: boolean;
  mapping: boolean;
}

export interface FireAnomaly {
  kind: AnomalyKind;
  siteId: string;
  site: ThermalSite;
  checks: AnomalyChecks;
  /** Begründungen in Leserichtung — mit Quelle und Abstand im selben Satz. */
  reasons: string[];
  origin: 'derived';
}

export interface AnomalyContext {
  mapped: boolean;
  ems: boolean;
}

const SOURCE_LABEL = { eprtr: 'E-PRTR', mastr: 'MaStR', bfe: 'BFE' } as const;

/** Beschriftung des Standorts — Anlagenname nur mit Quelle und Abstand im selben Satz. */
export function siteLabel(site: ThermalSite): string {
  const f = site.facility;
  if (site.cls === 'A' && f) {
    return `${f.name} (${FACILITY_KIND_LABEL[f.kind]}, ${SOURCE_LABEL[f.source]}, ${f.distanceM} m)`;
  }
  return `${SITE_CLASS_LABEL[site.cls]}${site.place ? ` bei ${site.place}` : ''}`;
}

/** „Signal in 6 von 6 Jahren" — wie viele Archivjahre den Standort trugen. */
export function siteYearsLabel(site: ThermalSite): string {
  const ys = Object.entries(site.stats.years).filter(([, n]) => n >= 5).length;
  const total = Object.keys(site.stats.years).length;
  return `Signal in ${ys} von ${total} Archivjahren`;
}

function bboxExtentM(b: [number, number, number, number]): number {
  const midLat = (b[1] + b[3]) / 2;
  return Math.max(
    metersBetween({ lat: b[1], lon: b[0] }, { lat: b[3], lon: b[0] }),
    metersBetween({ lat: midLat, lon: b[0] }, { lat: midLat, lon: b[2] }),
  );
}

function unionBbox(passes: readonly FirePass[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of passes) { w = Math.min(w, p.bbox[0]); s = Math.min(s, p.bbox[1]); e = Math.max(e, p.bbox[2]); n = Math.max(n, p.bbox[3]); }
  return [w, s, e, n];
}

/**
 * Wachstum aus den Überflügen — dieselbe Idee wie `grew()` in `fireEvents.ts`, aber auf
 * Überflug-Boxen statt Rohzeilen (die Registry hat keine Zeilen mehr). Erste gegen zweite
 * Hälfte (nach Zeit): Ausdehnung oder Schwerpunkt um mehr als eine Pixelbreite ⇒ gewachsen.
 * Mit < 2 Überflügen ist kein Wachstum belegbar ⇒ `false`.
 */
export function grewFromPasses(passes: readonly FirePass[]): boolean {
  if (passes.length < 2) return false;
  const sorted = [...passes].sort((a, b) => a.atMs - b.atMs);
  const mid = sorted[0].atMs + (sorted[sorted.length - 1].atMs - sorted[0].atMs) / 2;
  let first = sorted.filter((p) => p.atMs <= mid);
  let second = sorted.filter((p) => p.atMs > mid);
  if (second.length === 0) { second = [sorted[sorted.length - 1]]; first = sorted.slice(0, -1); }
  if (first.length === 0) return false;
  const b1 = unionBbox(first), b2 = unionBbox(second);
  const extentGrew = bboxExtentM(b2) - bboxExtentM(b1) > STATIC_MOVE_M;
  const c1 = { lat: (b1[1] + b1[3]) / 2, lon: (b1[0] + b1[2]) / 2 };
  const c2 = { lat: (b2[1] + b2[3]) / 2, lon: (b2[0] + b2[2]) / 2 };
  const moved = metersBetween(c1, c2) > STATIC_MOVE_M;
  return extentGrew || moved;
}

function passesInFootprint(site: ThermalSite, passes: readonly FirePass[], fallback: [number, number, number, number]): boolean {
  const boxes = passes.length ? passes.map((p) => p.bbox) : [fallback];
  for (const [w, s, e, n] of boxes) {
    if (!Number.isFinite(w) || !Number.isFinite(n)) continue;
    if (!inSiteFootprint(site, s, w) || !inSiteFootprint(site, s, e) || !inSiteFootprint(site, n, w) || !inSiteFootprint(site, n, e)) return false;
  }
  return true;
}

/**
 * Einordnung eines Clusters gegen einen Standort. `bbox` ist der Rückfall, wenn keine
 * Überflüge vorliegen; `maxPixelFrp` das stärkste Pixel im Fenster (MW).
 */
export function anomalyOf(
  input: { passes: readonly FirePass[]; bbox: [number, number, number, number]; maxPixelFrp: number | null },
  site: ThermalSite,
  ctx: AnomalyContext,
): FireAnomaly {
  const checks: AnomalyChecks = {
    footprint: passesInFootprint(site, input.passes, input.bbox),
    growth: !grewFromPasses(input.passes),
    intensity: input.maxPixelFrp == null || site.stats.frp.max == null || input.maxPixelFrp <= site.stats.frp.max * 1.5,
    mapping: !ctx.mapped && !ctx.ems,
  };
  const reasons: string[] = [];
  reasons.push(`Bekannter Standort einer Dauerquelle: ${siteLabel(site)} — ${siteYearsLabel(site)} (FIRMS-Archiv 2020–2026, eigene Ableitung)`);
  if (!checks.mapping) reasons.push(ctx.mapped ? 'EFFIS-Kartierung vorhanden — die Standort-Einordnung ist damit aufgehoben.' : 'Copernicus-EMS-Aktivierung vorhanden — die Standort-Einordnung ist damit aufgehoben.');
  if (!checks.footprint) reasons.push('Detektionen außerhalb des bekannten Standortrasters (± 1 km) — weicht vom Anlagenmuster ab.');
  if (!checks.growth) reasons.push(`Räumliches Wachstum über ${STATIC_MOVE_M / 1000} km zwischen den Überflügen — weicht vom Anlagenmuster ab.`);
  if (!checks.intensity) reasons.push(`Stärkstes Pixel ${input.maxPixelFrp?.toFixed(0)} MW über dem 1,5-fachen Archiv-Maximum des Standorts (${site.stats.frp.max?.toFixed(0)} MW) — weicht vom Anlagenmuster ab.`);
  const kind: AnomalyKind = checks.footprint && checks.growth && checks.intensity && checks.mapping ? 'site' : 'site-deviating';
  if (kind === 'site-deviating') reasons.push('Als Brand behandelt — Abweichung sichtbar, nicht einsortiert.');
  return { kind, siteId: site.id, site, checks, reasons, origin: 'derived' };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface ClassifyCheck { name: string; ok: boolean; detail?: string }

export function fixturePass(lat: number, lon: number, atMs: number, maxFrp = 20, sizeDeg = 0.004, satellite = 'N20'): FirePass {
  return {
    key: `${satellite}@${atMs}`, satellite, fromMs: atMs, toMs: atMs, atMs, day: false, pixels: 4, frpPixels: 4,
    sumFrp: maxFrp * 2, maxFrp, lat, lon, meanScanKm: 0.4, pixelAreaHa: 60,
    bbox: [lon - sizeDeg, lat - sizeDeg, lon + sizeDeg, lat + sizeDeg],
  };
}

export function verifyClassify(site: ThermalSite): { checks: ClassifyCheck[]; passed: number; total: number } {
  const checks: ClassifyCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const H = 3_600_000;
  const t0 = Date.UTC(2026, 7, 20, 1, 0);
  const at = { lat: site.lat, lon: site.lon };
  const steady = [fixturePass(at.lat, at.lon, t0), fixturePass(at.lat, at.lon, t0 + 12 * H), fixturePass(at.lat, at.lon, t0 + 24 * H)];
  const ctx = { mapped: false, ems: false };
  const bbox: [number, number, number, number] = [at.lon - 0.004, at.lat - 0.004, at.lon + 0.004, at.lat + 0.004];

  const a1 = anomalyOf({ passes: steady, bbox, maxPixelFrp: 20 }, site, ctx);
  add('ortsfest im Standortraster, stabil ⇒ site', a1.kind === 'site' && Object.values(a1.checks).every(Boolean));
  add('Begründung nennt Anlage MIT Quelle und Abstand im selben Satz', /E-PRTR|MaStR|BFE|Dauerquelle|Tagessignal/.test(a1.reasons[0]) && /\d+ m\)|bei |Tagessignal|Dauerquelle/.test(a1.reasons[0]));

  const a2 = anomalyOf({ passes: steady, bbox, maxPixelFrp: 20 }, site, { mapped: true, ems: false });
  add('EFFIS-Kartierung ⇒ site-deviating (Varallo-Regel)', a2.kind === 'site-deviating' && !a2.checks.mapping && a2.reasons.some((r) => /aufgehoben/.test(r)));

  const growing = [fixturePass(at.lat, at.lon, t0, 20, 0.004), fixturePass(at.lat + 0.01, at.lon + 0.015, t0 + 12 * H, 20, 0.02), fixturePass(at.lat + 0.02, at.lon + 0.03, t0 + 24 * H, 20, 0.03)];
  const a3 = anomalyOf({ passes: growing, bbox, maxPixelFrp: 20 }, site, ctx);
  add('wachsender Brand am Standort ⇒ site-deviating (Wachstum UND Raster)', a3.kind === 'site-deviating' && !a3.checks.growth && !a3.checks.footprint);

  const beside = [fixturePass(at.lat + 0.03, at.lon + 0.03, t0), fixturePass(at.lat + 0.03, at.lon + 0.03, t0 + 12 * H)];
  const a4 = anomalyOf({ passes: beside, bbox: [at.lon + 0.026, at.lat + 0.026, at.lon + 0.034, at.lat + 0.034], maxPixelFrp: 20 }, site, ctx);
  add('stabiler Brand 3 km neben dem Standort ⇒ site-deviating (Raster)', a4.kind === 'site-deviating' && !a4.checks.footprint && a4.checks.growth);

  const a5 = anomalyOf({ passes: steady, bbox, maxPixelFrp: (site.stats.frp.max ?? 100) * 2 }, site, ctx);
  add('Pixel-FRP über 1,5 × Archiv-Maximum ⇒ site-deviating', a5.kind === 'site-deviating' && !a5.checks.intensity);

  const a6 = anomalyOf({ passes: [], bbox, maxPixelFrp: null }, site, ctx);
  add('ohne Überflüge: Rückfall auf die Cluster-Box, kein Wachstum behauptet', a6.kind === 'site' && a6.checks.growth);

  add('Ein Überflug belegt kein Wachstum', grewFromPasses([steady[0]]) === false);
  add('Jede Abweichung trägt den Satz „Als Brand behandelt"', [a2, a3, a4, a5].every((a) => a.reasons.at(-1)?.startsWith('Als Brand behandelt')));
  add('Einordnung ist als Ableitung gekennzeichnet', a1.origin === 'derived');
  add('Wortwahl: nie „bestätigt", nie „Fehlalarm"', ![a1, a2, a3, a4, a5].flatMap((a) => a.reasons).some((r) => /(?<!un)bestätigt|Fehlalarm/.test(r)));
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
