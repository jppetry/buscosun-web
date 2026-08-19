/**
 * KONRAD3D-Zellen → GeoJSON für den 2D-Layer „Zellbahnen" (E3).
 *
 * Alles rein und headless prüfbar (D-12) — keine Karte, kein DOM, keine Uhr.
 * Vier Feature-Sorten in EINER FeatureCollection, unterschieden über die
 * Property `kind`; die Karte filtert daraus ihre fünf nativen Layer:
 *
 *   kind='cone' — der **amtliche** Unsicherheits-Trichter: konvexe Hülle über
 *                 die Unsicherheitsellipsen ALLER Prognosestützstellen.
 *                 **Keine eigene Aufweitungsformel** — genau das ist der
 *                 Qualitätsunterschied zur Eigenberechnung (`cellTracking.ts`).
 *   kind='hull' — beobachteter Zellumriss zur Referenzzeit (durchgezogen).
 *   kind='path' — Prognosespur Schwerpunkt → +5 … +60 min (gestrichelt).
 *   kind='dot'  — Schwerpunkt als Klickziel; trägt den Steckbrief als Properties.
 *
 * Phase Z2 („Zellbahnen lesbar machen", `audit/zellbahnen-karte.md`) ergänzt drei
 * weitere Sorten — rein zeichnerisch, aus denselben amtlichen Zahlen, ohne ein
 * zusätzliches Byte:
 *
 *   kind='cone-step' — je Stützstelle EINE Ellipse mit `leadMin` als Property.
 *                      Der Trichter sagt damit „nach hinten unsicherer" statt
 *                      nur „unsicher" (am Fixture wächst die Hauptachse von
 *                      2,322 km auf 16,884 km — Faktor 7,3).
 *   kind='mark'      — Zeitmarken +15/+30/+60 min auf der Spur.
 *   kind='arrow'     — Pfeilkopf am Spurende, Rotation aus `trackBearing`.
 *
 * `coneRing()` und `etaMinutesToPoint()` bleiben unverändert, exportiert und
 * verifiziert: sie sind der benannte Rückfall (Funktionserhalt).
 *
 * Konvention `uncertainty_ellipse`: `major_axis`/`minor_axis` werden als
 * **volle** Achsenlängen in km gelesen (Halbachse = /2), `angle` als
 * Kompasspeilung der Hauptachse (0° = Nord). Das Produkt dokumentiert die
 * Konvention nicht; die Annahme steht in `audit/zellbahnen.md` §5 und ist der
 * konservativere der beiden möglichen Lesarten für die Trichterbreite.
 */

import type { Konrad3dCell, Konrad3dRun } from './konrad3d';
import { bearingDeg, compass8, distKm } from './gridGeo';

const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LON = 111.32;

/** Km-Offset → Grad-Offset auf der Breite `lat`. */
function kmToDeg(lat: number, eastKm: number, northKm: number): [number, number] {
  const cos = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  return [eastKm / (KM_PER_DEG_LON * cos), northKm / KM_PER_DEG_LAT];
}

/**
 * Punkte einer Unsicherheitsellipse in [lon,lat].
 * `angleDeg` = Peilung der Hauptachse (° meteo, 0 = N, im Uhrzeigersinn).
 */
export function ellipsePoints(
  lon: number,
  lat: number,
  majorKm: number,
  minorKm: number,
  angleDeg: number,
  steps = 24,
): Array<[number, number]> {
  const a = Math.max(majorKm, minorKm) / 2;
  const b = Math.min(majorKm, minorKm) / 2;
  const rot = (angleDeg * Math.PI) / 180;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    // Lokal: x entlang der Hauptachse, y quer dazu …
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    // … dann in Nord/Ost drehen (Peilung: 0° = Nord, +90° = Ost).
    const northKm = x * Math.cos(rot) - y * Math.sin(rot);
    const eastKm = x * Math.sin(rot) + y * Math.cos(rot);
    const [dLon, dLat] = kmToDeg(lat, eastKm, northKm);
    out.push([lon + dLon, lat + dLat]);
  }
  return out;
}

/**
 * Liegt `target` in der Unsicherheitsellipse? **Exakt invers zu
 * `ellipsePoints()`** — dieselbe Halbachsen- und Drehkonvention, damit
 * Treffertest und gezeichnete Ellipse nie auseinanderlaufen können. Genau das
 * ist der wahrscheinlichste stille Fehler dieser Phase, deshalb prüft der
 * Verifier beide Funktionen gegeneinander.
 */
export function pointInEllipse(
  target: [number, number],
  lon: number,
  lat: number,
  majorKm: number,
  minorKm: number,
  angleDeg: number,
): boolean {
  const a = Math.max(majorKm, minorKm) / 2;
  const b = Math.min(majorKm, minorKm) / 2;
  if (!(a > 0) || !(b > 0)) return false;
  const cos = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  const eastKm = (target[0] - lon) * KM_PER_DEG_LON * cos;
  const northKm = (target[1] - lat) * KM_PER_DEG_LAT;
  // Rückdrehung der Peilung: ellipsePoints() bildet (x,y) → (north,east) über
  // north = x·cos − y·sin, east = x·sin + y·cos ab; das ist eine Drehmatrix,
  // ihre Inverse ist die Transponierte.
  const rot = (angleDeg * Math.PI) / 180;
  const x = northKm * Math.cos(rot) + eastKm * Math.sin(rot);
  const y = -northKm * Math.sin(rot) + eastKm * Math.cos(rot);
  return (x / a) ** 2 + (y / b) ** 2 <= 1;
}

/** Konvexe Hülle (Monotone Chain) über [lon,lat]-Punkte, gegen den Uhrzeigersinn. */
export function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((u, v) => (u[0] === v[0] ? u[1] - v[1] : u[0] - v[0]));
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Array<[number, number]> = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Ring zu einem gültigen GeoJSON-Polygonring schließen. */
function closeRing(ring: Array<[number, number]>): Array<[number, number]> {
  if (ring.length < 3) return [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

/**
 * Der amtliche Pfadkegel: konvexe Hülle über die Ellipsen aller Prognosepunkte.
 * Stützstellen ohne Ellipse gehen als nackter Punkt ein (statt zu verschwinden).
 * Leer, wenn keine Prognosespur vorliegt — dann zeichnet die Karte keinen Kegel.
 */
export function coneRing(cell: Konrad3dCell): Array<[number, number]> {
  if (cell.forecast.length === 0) return [];
  const pts: Array<[number, number]> = [[cell.lon, cell.lat]];
  for (const f of cell.forecast) {
    if (f.majorKm != null && f.minorKm != null && f.majorKm > 0 && f.minorKm > 0) {
      pts.push(...ellipsePoints(f.lon, f.lat, f.majorKm, f.minorKm, f.ellipseAngleDeg ?? 0));
    } else {
      pts.push([f.lon, f.lat]);
    }
  }
  return closeRing(convexHull(pts));
}

// ---------------------------------------------------------------------------
// Phase Z2 — Lesbarkeit: Stufen-Trichter, Spur-Geschwindigkeit, Peilung,
// Pfeil, Zeitmarken. Alles aus denselben amtlichen Zahlen, kein neues Byte.
// ---------------------------------------------------------------------------

/** Eine Stufe des Unsicherheits-Trichters — die amtliche Ellipse EINER Stützstelle. */
export interface ConeStep {
  ring: Array<[number, number]>;
  leadMin: number;
  majorKm: number;
  minorKm: number;
}

/**
 * Der Trichter als Stufen statt als eine Hülle: je Stützstelle **mit** amtlicher
 * Ellipse ein geschlossenes Polygon. Stützstellen ohne Ellipse liefern **keine**
 * Stufe — dort gibt es nichts Amtliches zu zeichnen und nichts wird geschätzt
 * (anders als in `coneRing()`, wo der nackte Punkt in die Hülle eingeht, damit
 * die Hülle die Spur trotzdem umschließt).
 */
export function conePolygons(cell: Konrad3dCell): ConeStep[] {
  const out: ConeStep[] = [];
  for (const f of cell.forecast) {
    if (f.majorKm == null || f.minorKm == null || !(f.majorKm > 0) || !(f.minorKm > 0)) continue;
    const ring = closeRing(ellipsePoints(f.lon, f.lat, f.majorKm, f.minorKm, f.ellipseAngleDeg ?? 0));
    if (ring.length >= 4) out.push({ ring, leadMin: f.leadMin, majorKm: f.majorKm, minorKm: f.minorKm });
  }
  return out;
}

/** Die GEZEICHNETE Spur: Schwerpunkt + alle Prognosestützstellen. */
function trackPoints(cell: Konrad3dCell): Array<[number, number]> {
  return [[cell.lon, cell.lat], ...cell.forecast.map((f) => [f.lon, f.lat] as [number, number])];
}

/** Länge der gezeichneten Spur in km (Summe der Segmente, nicht die Luftlinie). */
export function trackLengthKm(cell: Konrad3dCell): number {
  const pts = trackPoints(cell);
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += distKm(pts[i - 1], pts[i]);
  return sum;
}

/**
 * Zuggeschwindigkeit **aus der gezeichneten Spur** (km/h).
 *
 * Warum nicht `tracking/cell_speed`: beide Größen weichen voneinander ab (am
 * Fixture 1,5–7 %, `audit/zellbahnen-karte.md` §2.5). Beschriftung und
 * Geometrie müssen aus **einer** Quelle kommen, sonst widerspricht sich die
 * Karte sichtbar. `cell_speed` bleibt geparst und verifiziert — es beschriftet
 * nur nicht mehr (Jans Entscheidung S-Z2-2, 2026-08-07).
 */
export function trackSpeedKmh(cell: Konrad3dCell): number | null {
  if (cell.forecast.length === 0) return null;
  const lastLead = cell.forecast[cell.forecast.length - 1].leadMin;
  if (!(lastLead > 0)) return null;
  return (trackLengthKm(cell) / lastLead) * 60;
}

/**
 * Rundung auf 5er-Schritte — die EINE Stelle, an der die angezeigte
 * Geschwindigkeit gerundet wird. Die Rundung ist die ehrliche Antwort auf die
 * gemessene Unschärfe zwischen Spur und `cell_speed` (D-04).
 */
export function roundSpeed5(kmh: number): number {
  return Math.round(kmh / 5) * 5;
}

/**
 * Die EINE angezeigte Zuggeschwindigkeit (km/h, auf 5er gerundet) — Quelle für
 * Kurzzeile, Steckbrief und Karte gleichermaßen (Z2-6).
 *
 * Zwei Bedingungen, bewusst getrennt:
 *  - **Wert** aus `trackSpeedKmh` (Spurgeometrie) — Jans Entscheidung S-Z2-2.
 *  - **Verfügbarkeit** aus `tracking/cell_speed`: steht dort der Sentinel, sagt
 *    das amtliche Produkt selbst „Zuggeschwindigkeit nicht bestimmt". Dann
 *    nennen wir auch keine — obwohl die Prognosespur rechnerisch eine hergäbe.
 *    Das ist die konservativere Lesart (D-04) und hält den Z1-Sentinel-Test
 *    inhaltlich am Leben, statt ihn durch die neue Quelle zu entwerten.
 */
export function displaySpeedKmh(cell: Konrad3dCell): number | null {
  if (cell.speedKmh == null) return null;
  const kmh = trackSpeedKmh(cell);
  return kmh == null ? null : roundSpeed5(kmh);
}

/** Lead-Raster der Zelle in Minuten (am Produkt gemessen, nicht angenommen). */
function leadStepMin(cell: Konrad3dCell): number {
  if (cell.forecast.length >= 2) {
    const d = cell.forecast[1].leadMin - cell.forecast[0].leadMin;
    if (d > 0) return d;
  }
  return 5;
}

/**
 * Peilung über die Spur statt aus dem ersten Segment.
 *
 * `konrad3d.ts:260` peilt Schwerpunkt → **erste** Stützstelle; das ist die
 * Richtung der ersten fünf Minuten. Für ein Kürzel („NO") reicht das, für einen
 * gezeichneten Pfeil nicht: Zelle 231 des Fixtures dreht über die Stunde von
 * 54,98° auf 48,61°. Ohne `leadMin` wird über die **volle** Spur gepeilt.
 * Ohne Prognosespur gibt es keine Peilung — sie wird nicht geraten (D-04).
 */
export function trackBearing(cell: Konrad3dCell, leadMin?: number): number | null {
  if (cell.forecast.length === 0) return null;
  const f = leadMin == null
    ? cell.forecast[cell.forecast.length - 1]
    : cell.forecast.reduce((best, c) =>
      Math.abs(c.leadMin - leadMin) < Math.abs(best.leadMin - leadMin) ? c : best);
  if (f.lon === cell.lon && f.lat === cell.lat) return null;
  return bearingDeg([cell.lon, cell.lat], [f.lon, f.lat]);
}

/** Pfeilkopf: Position am Spurende + Rotation aus der Peilung über die volle Spur. */
export function arrowAnchor(cell: Konrad3dCell): { lon: number; lat: number; bearing: number } | null {
  const bearing = trackBearing(cell);
  if (bearing == null) return null;
  const last = cell.forecast[cell.forecast.length - 1];
  return { lon: last.lon, lat: last.lat, bearing };
}

/** Vorlaufzeiten der Zeitmarken (min). */
export const CELL_TIME_MARK_LEADS: readonly number[] = [15, 30, 60];

/**
 * Zeitmarken auf der Spur. Es entsteht **nur** eine Marke für Vorlaufzeiten, die
 * die Spur wirklich trägt — eine Zelle mit kürzerer Spur bekommt keine
 * +60-Marke jenseits ihres Endes.
 */
export function timeMarks(
  cell: Konrad3dCell,
  leads: readonly number[] = CELL_TIME_MARK_LEADS,
): Array<{ lon: number; lat: number; leadMin: number }> {
  const out: Array<{ lon: number; lat: number; leadMin: number }> = [];
  for (const lead of leads) {
    const f = cell.forecast.find((p) => p.leadMin === lead);
    if (!f) continue;
    out.push({ lon: f.lon, lat: f.lat, leadMin: lead });
  }
  return out;
}

/** Effektiver Zellradius aus der gemessenen Fläche (Rückfall 3 km wie in Z1). */
function cellRadiusKm(cell: Konrad3dCell): number {
  return cell.areaKm2 != null && cell.areaKm2 > 0 ? Math.sqrt(cell.areaKm2 / Math.PI) : 3;
}

/** ETA als Spanne — nie als Punktwert (D-04, `audit/zellbahnen-karte.md` §5.2). */
export interface EtaWindow {
  earliestMin: number;
  latestMin: number;
  /** Abstand des Standorts zum JETZIGEN Schwerpunkt (km). */
  distanceKm: number;
}

/**
 * ETA-**Spanne** einer Zelle an einem Standort.
 *
 * Treffertest je Stützstelle (Jans Entscheidung S-Z2-3a, 2026-08-07):
 * amtliche Unsicherheitsellipse (major/minor/angle) **∪** Zellkörper
 * (`√(areaKm2/π)`). Die Ellipse nutzt alle drei amtlichen Zahlen statt nur der
 * Nebenachse; der Zellkörper trägt dem Rechnung, dass die Zelle eine Ausdehnung
 * hat und nicht ein Punkt ist.
 *
 * **Ohne amtliche Ellipse gibt es keine Spanne und damit keine ETA** — nicht
 * eine geschätzte. Trifft genau eine Stützstelle, wird um das am Produkt
 * gemessene Lead-Raster verbreitert (5 min); das ist die Auflösung der Quelle,
 * kein erfundener Zuschlag.
 */
export function etaWindowToPoint(cell: Konrad3dCell, target: [number, number]): EtaWindow | null {
  const rKm = cellRadiusKm(cell);
  const hits: number[] = [];
  let sawEllipse = false;
  for (const f of cell.forecast) {
    if (f.majorKm == null || f.minorKm == null || !(f.majorKm > 0) || !(f.minorKm > 0)) continue;
    sawEllipse = true;
    if (
      pointInEllipse(target, f.lon, f.lat, f.majorKm, f.minorKm, f.ellipseAngleDeg ?? 0)
      || distKm([f.lon, f.lat], target) <= rKm
    ) hits.push(f.leadMin);
  }
  if (!sawEllipse || hits.length === 0) return null;
  const earliestMin = Math.min(...hits);
  const maxHit = Math.max(...hits);
  const latestMin = maxHit > earliestMin ? maxHit : earliestMin + leadStepMin(cell);
  return { earliestMin, latestMin, distanceKm: distKm([cell.lon, cell.lat], target) };
}

/** Vorbeizug — eine Aussage, kein Leerzustand (`audit/zellbahnen-karte.md` §5.3). */
export interface PassBy {
  missKm: number;
  atLeadMin: number;
  /** Peilung Standort → nächster Spurpunkt: auf welcher Seite die Zelle vorbeizieht. */
  sideBearingDeg: number;
}

/** Lotabstand Punkt→Strecke in lokalen km + Lage auf der Strecke (t ∈ [0,1]). */
function segmentProjection(
  a: [number, number],
  b: [number, number],
  p: [number, number],
): { km: number; t: number } {
  const cos = Math.max(0.1, Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180));
  const bx = (b[0] - a[0]) * KM_PER_DEG_LON * cos;
  const by = (b[1] - a[1]) * KM_PER_DEG_LAT;
  const px = (p[0] - a[0]) * KM_PER_DEG_LON * cos;
  const py = (p[1] - a[1]) * KM_PER_DEG_LAT;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return { km: Math.hypot(px - bx * t, py - by * t), t };
}

/**
 * Wie weit zieht die Zelle am Standort vorbei — gemessen gegen die **gezeichnete
 * Spur** (Lotabstand auf die Segmente, nicht nur auf die Stützpunkte, sonst
 * läge der Wert bei einer schnellen Zelle systematisch zu hoch).
 */
export function passByToPoint(cell: Konrad3dCell, target: [number, number]): PassBy | null {
  const pts = trackPoints(cell);
  if (pts.length < 2) return null;
  let bestKm = Infinity;
  let bestLead = 0;
  let bestPoint: [number, number] = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const { km, t } = segmentProjection(pts[i - 1], pts[i], target);
    if (km >= bestKm) continue;
    const leadA = i === 1 ? 0 : cell.forecast[i - 2].leadMin;
    const leadB = cell.forecast[i - 1].leadMin;
    bestKm = km;
    bestLead = leadA + (leadB - leadA) * t;
    bestPoint = [
      pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
      pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
    ];
  }
  return {
    missKm: bestKm,
    atLeadMin: Math.round(bestLead / 5) * 5,
    sideBearingDeg: bearingDeg(target, bestPoint),
  };
}

/**
 * Bis hierher wird ein Vorbeizug noch ausgesprochen (km). Dieselbe Schwelle, die
 * `docs/zuglinien-radar-spec.md` §10.6 für den Flow-Layer festlegt — von Jan am
 * 2026-08-07 für die Zellbahnen bestätigt (S-Z2-3a).
 */
export const CELL_PASS_BY_MAX_KM = 25;

/** Standortbezug: entweder eine ETA-Spanne oder ein Vorbeizug — oder gar nichts. */
export type CellRelevance =
  | { kind: 'eta'; cellId: number; earliestMin: number; latestMin: number; distanceKm: number }
  | { kind: 'passby'; cellId: number; missKm: number; atLeadMin: number; sideBearingDeg: number };

/**
 * **Die eine Entscheidung**, welche Zelle für den gewählten Ort relevant ist —
 * bewusst hier und nicht in der Karte (D-12): Reihenfolge, Schwelle und
 * Grenzfälle sind headless prüfbar.
 *
 * Regel: die Zelle, die den Ort am **frühesten** erreicht. Trifft keine, die mit
 * dem **kleinsten** Vorbeizug-Abstand, solange er ≤ `CELL_PASS_BY_MAX_KM` ist.
 * Sonst `null` — dann sagt die Karte dazu nichts, statt etwas zu behaupten.
 */
export function cellLocationRelevance(run: Konrad3dRun, target: [number, number]): CellRelevance | null {
  let hit: CellRelevance | null = null;
  for (const cell of run.cells) {
    const w = etaWindowToPoint(cell, target);
    if (w == null) continue;
    if (hit == null || (hit.kind === 'eta' && w.earliestMin < hit.earliestMin)) {
      hit = { kind: 'eta', cellId: cell.id, ...w };
    }
  }
  if (hit != null) return hit;

  let near: CellRelevance | null = null;
  let nearKm = Infinity;
  for (const cell of run.cells) {
    const p = passByToPoint(cell, target);
    if (p == null || p.missKm >= nearKm) continue;
    nearKm = p.missKm;
    near = { kind: 'passby', cellId: cell.id, ...p };
  }
  return nearKm <= CELL_PASS_BY_MAX_KM ? near : null;
}

/** Himmelsrichtungs-Kürzel → Richtungswort für den Vorbeizug-Satz. */
const SIDE_WORD: Record<string, string> = {
  N: 'nördlich', NO: 'nordöstlich', O: 'östlich', SO: 'südöstlich',
  S: 'südlich', SW: 'südwestlich', W: 'westlich', NW: 'nordwestlich',
};

/**
 * Der Satz zum Standortbezug (Jans Wortlaut-Entscheidung S-Z2-3b, 2026-08-07).
 *
 * Wortwahl ist **gate-blockierend** (D-19): „Zelle", „erreicht dich in",
 * „zieht … vorbei". NIE „trifft", „Warnung", „Gefahr", „Unwetter", „Tornado".
 * Der Verifier sperrt genau diese Wörter über dieser Funktion.
 */
export function cellRelevanceText(rel: CellRelevance): string {
  if (rel.kind === 'eta') {
    return `Zelle ${rel.cellId} erreicht dich in ${rel.earliestMin}–${rel.latestMin} min.`;
  }
  const side = SIDE_WORD[compass8(rel.sideBearingDeg)] ?? '';
  // Unter 10 km auf 1 km, darüber auf 5 km runden — die Spurgeometrie gibt
  // nicht mehr Genauigkeit her, als die Rundung behauptet.
  const km = rel.missKm < 10 ? Math.round(rel.missKm) : Math.round(rel.missKm / 5) * 5;
  const when = rel.atLeadMin <= 0 ? 'am nächsten jetzt' : `am nächsten in ~${rel.atLeadMin} min`;
  return `Zelle ${rel.cellId} zieht ~${km} km ${side} an dir vorbei (${when}).`;
}

/**
 * ETA einer Zelle an einem Standort: die früheste Prognosestützstelle, deren
 * Trefferradius (halbe Nebenachse der amtlichen Ellipse, mindestens der
 * effektive Zellradius) den Standort einschließt.
 * `null` = die Zelle zieht innerhalb der 60 Minuten nicht über den Punkt.
 */
export function etaMinutesToPoint(
  cell: Konrad3dCell,
  target: [number, number],
): { minutes: number; distanceKm: number; hitRadiusKm: number } | null {
  const cellRadiusKm = cell.areaKm2 != null && cell.areaKm2 > 0 ? Math.sqrt(cell.areaKm2 / Math.PI) : 3;
  for (const f of cell.forecast) {
    const hit = Math.max(cellRadiusKm, (f.minorKm ?? 0) / 2);
    const d = distKm([f.lon, f.lat], target);
    if (d <= hit) return { minutes: f.leadMin, distanceKm: d, hitRadiusKm: hit };
  }
  return null;
}

/**
 * Kurzzeile für Popup/Readout — konservative Wortwahl (D-19), nie Warnsprache.
 *
 * Seit Z2 stammt die Geschwindigkeit aus `trackSpeedKmh` (gerundet auf 5er) und
 * damit aus **derselben** Geometrie wie die gezeichnete Spur. Fehlt die Spur,
 * bleibt die Angabe weg statt aus `cell_speed` zu stammen — sonst stünde eine
 * Geschwindigkeit ohne die Richtung, auf die sie sich bezieht.
 */
export function cellHeadline(cell: Konrad3dCell): string {
  const parts: string[] = [`Zelle ${cell.id}`];
  if (cell.dbzMax != null) parts.push(`${Math.round(cell.dbzMax)} dBZ`);
  const v = displaySpeedKmh(cell);
  if (v != null) {
    parts.push(cell.compass ? `zieht mit ${v} km/h nach ${cell.compass}` : `zieht mit ${v} km/h`);
  }
  return parts.join(' · ');
}

export interface CellFeatureProperties {
  kind: 'cone' | 'cone-step' | 'hull' | 'path' | 'mark' | 'arrow' | 'dot';
  id: number;
  /** Schweregrad 0…3 (severity_decimal, sonst severity) — steuert die Farbe. */
  sev: number;
  /** Vorlaufzeit dieser Geometrie (min) — `cone-step` und `mark` (Z2). */
  leadMin?: number;
  /** Angezeigte Zuggeschwindigkeit (km/h, bereits auf 5er gerundet, Z2). */
  trackSpeedKmh?: number;
  /** 1 = diese Zelle ist für den gewählten Ort relevant (Z2). NIE `null` — eine
   *  `null`-Property bräche den Z1-Check „keine NaN-Koordinate". */
  affects?: 1;
  headline?: string;
  refMs?: number;
  dbzMax?: number | null;
  speedKmh?: number | null;
  compass?: string | null;
  bearing?: number | null;
  echoTopM?: number | null;
  areaKm2?: number | null;
  hailFlag?: number | null;
  gustFlag?: number | null;
  gustKmh?: number | null;
  heavyRainFlag?: number | null;
  heavyRainMm?: number | null;
  heavyRainMinutes?: number | null;
  lightningRate?: number | null;
  mesocyclones?: number | null;
  detections?: number | null;
  leadMinutes?: number | null;
}

function severityOf(cell: Konrad3dCell): number {
  return cell.severityDecimal ?? cell.severity ?? 0;
}

/** Optionen für `buildCellFeatures` — additiv, damit alle Z1-Aufrufe gültig bleiben. */
export interface BuildCellFeaturesOptions {
  /** Zelle, die für den gewählten Ort relevant ist (aus `cellLocationRelevance`).
   *  Ihre Geometrie bekommt `affects: 1`; die Karte zeichnet sie über eine
   *  `case`-Expression kräftiger — **kein zweiter Layer**. */
  affectsCellId?: number | null;
}

/**
 * Lauf → FeatureCollection für die Kartenquelle.
 *
 * Reihenfolge (unten → oben): Trichter-Hülle, Trichter-Stufen, Umriss, Spur,
 * Zeitmarken, Pfeil, Punkt. Die Quelle bleibt **eine** FeatureCollection,
 * unterschieden über `kind` — das Z1-Muster wird fortgeführt, nicht ersetzt.
 */
export function buildCellFeatures(
  run: Konrad3dRun,
  opts: BuildCellFeaturesOptions = {},
): GeoJSON.FeatureCollection {
  const cones: GeoJSON.Feature[] = [];
  const coneSteps: GeoJSON.Feature[] = [];
  const hulls: GeoJSON.Feature[] = [];
  const paths: GeoJSON.Feature[] = [];
  const marks: GeoJSON.Feature[] = [];
  const arrows: GeoJSON.Feature[] = [];
  const dots: GeoJSON.Feature[] = [];

  for (const cell of run.cells) {
    const sev = severityOf(cell);
    // `affects` wird NUR gesetzt, wenn es zutrifft — eine Property mit dem Wert
    // `null` bräche den Z1-Check auf „keine NaN-Koordinate".
    const aff: { affects?: 1 } = opts.affectsCellId != null && opts.affectsCellId === cell.id
      ? { affects: 1 }
      : {};

    const cone = coneRing(cell);
    if (cone.length >= 4) {
      cones.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [cone] },
        properties: { kind: 'cone', id: cell.id, sev } satisfies CellFeatureProperties,
      });
    }

    // Z2: der Verlauf. Je Stützstelle eine amtliche Ellipse; `leadMin` steuert
    // die nach hinten fallende Deckkraft in der Karte.
    for (const step of conePolygons(cell)) {
      coneSteps.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [step.ring] },
        properties: {
          kind: 'cone-step', id: cell.id, sev, leadMin: step.leadMin,
        } satisfies CellFeatureProperties,
      });
    }

    const hull = closeRing(cell.hull);
    if (hull.length >= 4) {
      hulls.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [hull] },
        properties: { kind: 'hull', id: cell.id, sev, ...aff } satisfies CellFeatureProperties,
      });
    }

    if (cell.forecast.length > 0) {
      paths.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[cell.lon, cell.lat], ...cell.forecast.map((f) => [f.lon, f.lat] as [number, number])],
        },
        properties: {
          kind: 'path',
          id: cell.id,
          sev,
          leadMinutes: cell.forecast[cell.forecast.length - 1].leadMin,
          ...aff,
        } satisfies CellFeatureProperties,
      });
    }

    // Z2: „wann ist sie wo" — nur für Vorlaufzeiten, die die Spur wirklich trägt.
    for (const m of timeMarks(cell)) {
      marks.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
        properties: {
          kind: 'mark', id: cell.id, sev, leadMin: m.leadMin,
        } satisfies CellFeatureProperties,
      });
    }

    // Z2: Zugrichtung ohne Klick. Ohne Prognosespur gibt es keinen Pfeil (D-04).
    const anchor = arrowAnchor(cell);
    if (anchor != null) {
      arrows.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [anchor.lon, anchor.lat] },
        properties: {
          kind: 'arrow', id: cell.id, sev, bearing: anchor.bearing, ...aff,
        } satisfies CellFeatureProperties,
      });
    }

    const shownKmh = displaySpeedKmh(cell);
    dots.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [cell.lon, cell.lat] },
      properties: {
        kind: 'dot',
        id: cell.id,
        sev,
        headline: cellHeadline(cell),
        refMs: cell.refMs,
        dbzMax: cell.dbzMax,
        speedKmh: cell.speedKmh,
        compass: cell.compass,
        bearing: cell.bearing,
        echoTopM: cell.echoTopM,
        areaKm2: cell.areaKm2,
        hailFlag: cell.hailFlag,
        gustFlag: cell.gustFlag,
        gustKmh: cell.gustKmh,
        heavyRainFlag: cell.heavyRainFlag,
        heavyRainMm: cell.heavyRainMm,
        heavyRainMinutes: cell.heavyRainMinutes,
        lightningRate: cell.lightningRate,
        mesocyclones: cell.mesocyclones,
        detections: cell.detections,
        leadMinutes: cell.forecast.length > 0 ? cell.forecast[cell.forecast.length - 1].leadMin : null,
        ...(shownKmh != null ? { trackSpeedKmh: shownKmh } : {}),
        ...aff,
      } satisfies CellFeatureProperties,
    });
  }

  return {
    type: 'FeatureCollection',
    features: [...cones, ...coneSteps, ...hulls, ...paths, ...marks, ...arrows, ...dots],
  };
}

/**
 * Zahl der Features je Sorte — für die Logzeile der Karte („no silent caps":
 * was ausgedünnt wurde, wird benannt statt verschwiegen). Hier und nicht in
 * `MapView.tsx`, damit auch das Zählen headless prüfbar bleibt (D-12).
 */
export function cellFeatureCounts(fc: GeoJSON.FeatureCollection): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of fc.features) {
    const k = String((f.properties as CellFeatureProperties | null)?.kind ?? '?');
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
