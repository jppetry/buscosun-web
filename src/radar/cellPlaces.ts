/**
 * Betroffene Orte und Ankunftsfenster je KONRAD3D-Zelle (Phase ZO, `audit/zell-orte.md`).
 *
 * Rein und headless prüfbar (D-12) — keine Karte, kein DOM; die Uhr kommt als `nowMs` herein. Grundlage sind
 * ausschließlich die amtlichen Zahlen des DWD: Schwerpunkt und Umriss zur Messzeit, die Prognosespur +5 … +60 min und
 * die Unsicherheitsellipse je Stützstelle (gelesen wie in `cellPolygons.ts`: volle Achsen, Peilung der Hauptachse),
 * dazu der Zellradius r = √(Fläche/π).
 *
 * Einteilung eines Orts (E-ZO-1, Jan 09.10.2026) — geometrisch, nie als Prozent (die Ellipse dokumentiert keine
 * Wahrscheinlichkeit):
 *   now  — der Ort liegt im gemessenen Umriss: die Zelle ist gerade über ihm.
 *   core — „zieht über": der Ort liegt höchstens r neben der amtlichen Bahn. Folgt die Zelle ihr, zieht sie über ihn.
 *   edge — „streift": sonst, aber höchstens r von der Ellipse einer Minute entfernt (Ellipse ⊕ Zellkörper) — weicht die
 *          Zelle innerhalb der amtlichen Unsicherheit ab, kann sie ihn erreichen.
 * Zeitfenster: erste bis letzte Minute im Trichter (Ellipse ⊕ Zellkörper), auf 5 min gerundet (Takt des Produkts).
 * Zwischen zwei Stützstellen werden Schwerpunkt und Achsen linear auf 1 min interpoliert (bis 4 km Abstand je Schritt bei
 * r ≈ 2 km — ohne das fielen Orte zwischen zwei Stützstellen durch); zwischen Messzeit und +5 min wächst die Ellipse von
 * 0 auf die erste amtliche. Die Rundung auf 5 min ist gröber als die Interpolation, das Fenster behauptet also nichts,
 * was die Quelle nicht trägt.
 *
 * Wortwahl (D-19) ist gate-blockierend: „Zelle", „erreicht dich voraussichtlich", „kann dich streifen", „zieht vorbei".
 * Nie „trifft", „Warnung", „Gefahr", „Unwetter", „Tornado" — `verify:cell-places` sperrt diese Wörter.
 */

import type { Konrad3dCell, Konrad3dRun } from './konrad3d';
import { passByToPoint, CELL_PASS_BY_MAX_KM } from './cellPolygons';
import { compass8 } from './gridGeo';
import { DWD_RADAR_SITES, DWD_RADAR_RANGE_KM } from '../point/sourceMatrix';
import type { Country } from '../types';

const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LON = 111.32;
const MIN = 60_000;

/** E-ZO-2: höchstens so viele Zeilen je Zelle; der Rest wird benannt („+ n weitere Orte am Rand"). */
export const CELL_PLACES_MAX_ROWS = 12;
/** Auflösung der Fenster (min) — der Takt der amtlichen Stützstellen. */
export const CELL_PLACES_STEP_MIN = 5;
/** Ein gewählter Ort, der so nah an einem Listenort mit gleichem Namen liegt, ist dieser Ort (km). */
export const CELL_PLACES_SAME_KM = 3;

export interface CellPlace {
  name: string;
  lat: number;
  lon: number;
  cc: Country;
  /** Einwohner (GeoNames); `null` beim gewählten Ort, der nicht im Verzeichnis steht. */
  pop: number | null;
}

export type CellPassKind = 'now' | 'core' | 'edge';

export interface CellPass {
  place: CellPlace;
  kind: CellPassKind;
  /** Fenster als Vorlauf zur Messzeit der Zelle (min, auf 5 gerundet) … */
  fromLead: number;
  toLead: number;
  /** … und als Uhrzeit (ms). */
  fromMs: number;
  toMs: number;
  /** Der gewählte Ort der Seite. */
  chosen: boolean;
}

/** `?zo=0` = Stand vor ZO (Regel 2); voreingestellt an (E-ZO-6). */
export function cellPlacesEnabledFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('zo') !== '0'; } catch { return true; }
}

/** Zeilen der Ortsliste `cellPlacesDach.json` (`[lat, lon, name, cc, pop]`) → Orte. Kaputte Zeilen fallen weg. */
export function parseCellPlaces(json: unknown): CellPlace[] {
  const rows = (json as { places?: unknown } | null)?.places;
  if (!Array.isArray(rows)) return [];
  const out: CellPlace[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 5) continue;
    const [lat, lon, name, cc, pop] = r as [unknown, unknown, unknown, unknown, unknown];
    if (typeof lat !== 'number' || typeof lon !== 'number' || typeof name !== 'string' || typeof pop !== 'number') continue;
    if (cc !== 'DE' && cc !== 'AT' && cc !== 'CH') continue;
    out.push({ lat, lon, name, cc, pop });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometrie
// ---------------------------------------------------------------------------

/** Lokale km-Ebene um einen Bezugspunkt (dieselbe Näherung wie `cellPolygons.ts`). */
interface Frame { lon0: number; lat0: number; cos: number }
function frameAt(lon: number, lat: number): Frame {
  return { lon0: lon, lat0: lat, cos: Math.max(0.1, Math.cos((lat * Math.PI) / 180)) };
}
function toKm(f: Frame, lon: number, lat: number): [number, number] {
  return [(lon - f.lon0) * KM_PER_DEG_LON * f.cos, (lat - f.lat0) * KM_PER_DEG_LAT];
}

/** Eine Minute der amtlichen Bahn: Schwerpunkt (km) und Halbachsen (km) der Ellipse; `a = null` = keine Ellipse. */
interface Minute { lead: number; x: number; y: number; a: number | null; b: number | null; ang: number }

/** Effektiver Zellradius aus der gemessenen Fläche (Rückfall 3 km wie `cellPolygons.ts`). */
export function cellRadiusKm(cell: Konrad3dCell): number {
  return cell.areaKm2 != null && cell.areaKm2 > 0 ? Math.sqrt(cell.areaKm2 / Math.PI) : 3;
}

function hasEllipse(f: { majorKm: number | null; minorKm: number | null }): boolean {
  return f.majorKm != null && f.minorKm != null && f.majorKm > 0 && f.minorKm > 0;
}

/** Amtliche Bahn auf 1 min, linear zwischen den Stützstellen (s. Kopf). */
function minutesOf(cell: Konrad3dCell, fr: Frame): Minute[] {
  type Node = { lead: number; x: number; y: number; a: number | null; b: number | null; ang: number };
  const nodes: Node[] = [{ lead: 0, x: 0, y: 0, a: 0, b: 0, ang: 0 }];
  for (const f of cell.forecast) {
    const [x, y] = toKm(fr, f.lon, f.lat);
    const ok = hasEllipse(f);
    nodes.push({
      lead: f.leadMin, x, y,
      a: ok ? Math.max(f.majorKm as number, f.minorKm as number) / 2 : null,
      b: ok ? Math.min(f.majorKm as number, f.minorKm as number) / 2 : null,
      ang: f.ellipseAngleDeg ?? 0,
    });
  }
  const out: Minute[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const p = nodes[i - 1], q = nodes[i];
    if (!(q.lead > p.lead)) continue;
    const last = i === nodes.length - 1;
    for (let m = p.lead; m < q.lead || (last && m === q.lead); m++) {
      const t = (m - p.lead) / (q.lead - p.lead);
      const ell = p.a != null && q.a != null && p.b != null && q.b != null;
      out.push({
        lead: m,
        x: p.x + (q.x - p.x) * t,
        y: p.y + (q.y - p.y) * t,
        a: ell ? (p.a as number) + ((q.a as number) - (p.a as number)) * t : null,
        b: ell ? (p.b as number) + ((q.b as number) - (p.b as number)) * t : null,
        // Die Peilung der Hauptachse springt nicht sinnvoll interpolierbar (0°/180°); die gemessenen Ellipsen sind
        // fast kreisrund — es gilt die der nächsten amtlichen Stützstelle.
        ang: t < 0.5 && i > 1 ? p.ang : q.ang,
      });
    }
  }
  return out;
}

/** Liegt (px, py) höchstens r von der Ellipse (Halbachsen a, b, Peilung ang) um (cx, cy) entfernt? */
export function nearEllipse(px: number, py: number, cx: number, cy: number, a: number, b: number, angDeg: number, r: number): boolean {
  const dx = px - cx, dy = py - cy;
  if (!(a > 0) || !(b > 0)) return Math.hypot(dx, dy) <= r;
  // Dieselbe Drehung wie `pointInEllipse` (cellPolygons.ts): x entlang der Hauptachse, y quer.
  const rot = (angDeg * Math.PI) / 180;
  const xe = dy * Math.cos(rot) + dx * Math.sin(rot);
  const ye = -dy * Math.sin(rot) + dx * Math.cos(rot);
  // Hinreichend: die um r vergrößerte Ellipse liegt ganz im Bereich „Abstand ≤ r" (jeder ihrer Punkte ist genau r von
  // einem Ellipsenpunkt entfernt).
  if ((xe / (a + r)) ** 2 + (ye / (b + r)) ** 2 <= 1) return true;
  if (Math.hypot(xe, ye) > a + r) return false;
  // Sonst der Abstand zum Rand, abgetastet (64 Punkte: Fehler < 0,13 % von a, bei a = 24 km ≈ 30 m).
  let best = Infinity;
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    best = Math.min(best, Math.hypot(xe - a * Math.cos(t), ye - b * Math.sin(t)));
  }
  return best <= r;
}

/** Abstand Punkt → Strecke (km) in der lokalen Ebene. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** Punkt im (gemessenen) Umriss? Gerade-Ungerade-Regel auf [lon, lat]. */
function inRing(lon: number, lat: number, ring: ReadonlyArray<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Vorbereitete Zelle — einmal je Zelle, dann für beliebig viele Orte. */
export interface PreparedCell {
  cell: Konrad3dCell;
  frame: Frame;
  r: number;
  minutes: Minute[];
  /** Amtliche Bahn (Schwerpunkt + Stützstellen) in km. */
  track: Array<[number, number]>;
  /** Weiter als das vom jetzigen Schwerpunkt kann kein betroffener Ort liegen (km). */
  reachKm: number;
  /** Mindestens eine Minute trägt eine amtliche Ellipse — sonst gibt es keine Fenster (D-04). */
  hasEllipse: boolean;
}

export function prepareCell(cell: Konrad3dCell): PreparedCell {
  const frame = frameAt(cell.lon, cell.lat);
  const r = cellRadiusKm(cell);
  const minutes = minutesOf(cell, frame);
  const track: Array<[number, number]> = [[0, 0], ...cell.forecast.map((f) => toKm(frame, f.lon, f.lat))];
  let reachKm = r;
  let any = false;
  for (const m of minutes) {
    if (m.a != null && m.a > 0) any = true;
    reachKm = Math.max(reachKm, Math.hypot(m.x, m.y) + (m.a ?? 0) + r);
  }
  return { cell, frame, r, minutes, track, reachKm, hasEllipse: any && cell.forecast.some(hasEllipse) };
}

/** Wie liegt EIN Ort zur Zelle? `null` = nicht im Trichter (oder keine amtliche Ellipse). */
export function cellPassAt(pc: PreparedCell, lat: number, lon: number): { kind: CellPassKind; fromLead: number; toLead: number } | null {
  if (!pc.hasEllipse || pc.minutes.length === 0) return null;
  const [px, py] = toKm(pc.frame, lon, lat);
  if (Math.hypot(px, py) > pc.reachKm) return null;
  let first = -1, last = -1;
  for (const m of pc.minutes) {
    if (m.a == null || m.b == null) continue;
    if (nearEllipse(px, py, m.x, m.y, m.a, m.b, m.ang, pc.r)) {
      if (first < 0) first = m.lead;
      last = m.lead;
    }
  }
  const hull = pc.cell.hull;
  const now = hull.length >= 3 ? inRing(lon, lat, hull) : Math.hypot(px, py) <= pc.r;
  if (first < 0 && !now) return null;
  let core = false;
  for (let i = 1; i < pc.track.length && !core; i++) {
    core = segDist(px, py, pc.track[i - 1][0], pc.track[i - 1][1], pc.track[i][0], pc.track[i][1]) <= pc.r;
  }
  const kind: CellPassKind = now ? 'now' : core ? 'core' : 'edge';
  const step = CELL_PLACES_STEP_MIN;
  const lastLead = pc.minutes[pc.minutes.length - 1].lead;
  let fromLead = now ? 0 : Math.floor(first / step) * step;
  let toLead = Math.min(lastLead, Math.ceil((last < 0 ? 0 : last) / step) * step);
  if (toLead <= fromLead) {
    if (fromLead + step <= lastLead) toLead = fromLead + step;
    else fromLead = Math.max(0, toLead - step);
  }
  return { kind, fromLead, toLead };
}

const KIND_ORDER: Record<CellPassKind, number> = { now: 0, core: 1, edge: 2 };

function sameName(a: string, b: string): boolean {
  const n = (s: string) => s.toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim();
  return n(a) === n(b) || n(a).startsWith(n(b) + ' ') || n(b).startsWith(n(a) + ' ');
}

function kmBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const c = Math.max(0.1, Math.cos((((aLat + bLat) / 2) * Math.PI) / 180));
  return Math.hypot((aLon - bLon) * KM_PER_DEG_LON * c, (aLat - bLat) * KM_PER_DEG_LAT);
}

export interface CellPlaceList {
  cellId: number;
  /** Nach Fensterbeginn sortiert, höchstens `CELL_PLACES_MAX_ROWS`. */
  rows: CellPass[];
  /** Weggelassene Orte (benannt, nicht verschwiegen). */
  hiddenCore: number;
  hiddenEdge: number;
  /** Die Zelle trägt keine amtliche Ellipse ⇒ keine Fenster, keine Liste. */
  noEllipse: boolean;
}

/**
 * Die Liste „Zieht über" einer Zelle (E-ZO-2): Orte des Verzeichnisses plus der gewählte Ort. Orte, deren Fenster schon
 * vorbei ist (`toMs < nowMs`), fallen weg. Bei mehr als `maxRows`: der gewählte Ort immer, dann alle Orte unter der
 * Zelle und im Kern nach Größe, dann der Rand nach Größe; der Rest wird gezählt.
 */
export function cellPlaceList(
  cell: Konrad3dCell | PreparedCell,
  places: readonly CellPlace[],
  opts: { nowMs: number; chosen?: CellPlace | null; maxRows?: number },
): CellPlaceList {
  const pc = 'minutes' in cell ? cell : prepareCell(cell);
  const c = pc.cell;
  const maxRows = opts.maxRows ?? CELL_PLACES_MAX_ROWS;
  const base = { cellId: c.id, hiddenCore: 0, hiddenEdge: 0 };
  if (!pc.hasEllipse) return { ...base, rows: [], noEllipse: true };
  const all: CellPass[] = [];
  const mk = (place: CellPlace, chosen: boolean): CellPass | null => {
    const p = cellPassAt(pc, place.lat, place.lon);
    if (!p) return null;
    const fromMs = c.refMs + p.fromLead * MIN, toMs = c.refMs + p.toLead * MIN;
    if (toMs < opts.nowMs) return null;
    return { place, kind: p.kind, fromLead: p.fromLead, toLead: p.toLead, fromMs, toMs, chosen };
  };
  for (const pl of places) {
    const pass = mk(pl, false);
    if (pass) all.push(pass);
  }
  const ch = opts.chosen ?? null;
  if (ch) {
    const same = all.find((p) => sameName(p.place.name, ch.name) && kmBetween(p.place.lat, p.place.lon, ch.lat, ch.lon) <= CELL_PLACES_SAME_KM);
    if (same) same.chosen = true;
    else {
      const pass = mk({ ...ch, pop: ch.pop ?? null }, true);
      if (pass) all.push(pass);
    }
  }
  const byPop = (a: CellPass, b: CellPass) => (b.place.pop ?? 0) - (a.place.pop ?? 0);
  const keep: CellPass[] = [];
  const chosenRows = all.filter((p) => p.chosen);
  keep.push(...chosenRows);
  const coreRows = all.filter((p) => !p.chosen && p.kind !== 'edge').sort(byPop);
  const edgeRows = all.filter((p) => !p.chosen && p.kind === 'edge').sort(byPop);
  let hiddenCore = 0, hiddenEdge = 0;
  for (const p of coreRows) { if (keep.length < maxRows) keep.push(p); else hiddenCore++; }
  for (const p of edgeRows) { if (keep.length < maxRows) keep.push(p); else hiddenEdge++; }
  keep.sort((a, b) => a.fromMs - b.fromMs || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || byPop(a, b));
  return { cellId: c.id, rows: keep, hiddenCore, hiddenEdge, noEllipse: false };
}

// ---------------------------------------------------------------------------
// Der gewählte Ort
// ---------------------------------------------------------------------------

/** Erkennt der deutsche Radarverbund dort Zellen? Standortregel 150 km um 17 DWD-Standorte (`sourceMatrix.ts`; an
 *  97 KONRAD3D-Läufen nachgemessen: Zellen bis 163 km, `audit/zell-orte.md` §3). */
export function inKonradReach(lat: number, lon: number): boolean {
  const R = 6371, rad = Math.PI / 180;
  for (const [sLat, sLon] of DWD_RADAR_SITES) {
    const dLat = (lat - sLat) * rad, dLon = (lon - sLon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(sLat * rad) * Math.sin(dLon / 2) ** 2;
    if (2 * R * Math.asin(Math.sqrt(h)) <= DWD_RADAR_RANGE_KM) return true;
  }
  return false;
}

export type CellPlaceVerdict =
  | { kind: 'pass'; cellId: number; pass: Omit<CellPass, 'place' | 'chosen'> }
  | { kind: 'passby'; cellId: number; missKm: number; atMs: number; sideBearingDeg: number }
  | { kind: 'none' }
  | { kind: 'empty' }
  | { kind: 'no-coverage' };

/**
 * Die eine Aussage zum gewählten Ort über alle Zellen: die Zelle, die ihn am frühesten erreicht (gleich früh: unter der
 * Zelle vor Kern vor Rand — dieselbe Regel „früheste zuerst" wie `cellLocationRelevance`); sonst der nächste Vorbeizug
 * bis `CELL_PASS_BY_MAX_KM`; sonst „keine", „leerer Lauf" oder „keine Zellerkennung hier".
 */
export function cellPlaceVerdict(run: Konrad3dRun, lat: number, lon: number, nowMs: number, prepared?: ReadonlyMap<number, PreparedCell>): CellPlaceVerdict {
  let best: CellPlaceVerdict | null = null;
  let bestKey = Infinity;
  for (const cell of run.cells) {
    const pc = prepared?.get(cell.id) ?? prepareCell(cell);
    const p = cellPassAt(pc, lat, lon);
    if (!p) continue;
    const fromMs = cell.refMs + p.fromLead * MIN, toMs = cell.refMs + p.toLead * MIN;
    if (toMs < nowMs) continue;
    const key = fromMs * 10 + KIND_ORDER[p.kind];
    if (key < bestKey) { bestKey = key; best = { kind: 'pass', cellId: cell.id, pass: { ...p, fromMs, toMs } }; }
  }
  if (best) return best;
  if (run.cells.length === 0) return inKonradReach(lat, lon) ? { kind: 'empty' } : { kind: 'no-coverage' };
  let near: CellPlaceVerdict | null = null;
  let nearKm = Infinity;
  for (const cell of run.cells) {
    const pb = passByToPoint(cell, [lon, lat]);
    if (pb == null || pb.missKm >= nearKm) continue;
    // Liegt der nächste Punkt der Bahn vor „jetzt" (die Zelle zieht schon weg), heißt es „am nächsten jetzt" — wie
    // `cellRelevanceText`; verschweigen hieße, eine Zelle 3 km nebenan als „keine" auszugeben.
    const atMs = cell.refMs + pb.atLeadMin * MIN;
    nearKm = pb.missKm;
    near = { kind: 'passby', cellId: cell.id, missKm: pb.missKm, atMs, sideBearingDeg: pb.sideBearingDeg };
  }
  if (near && nearKm <= CELL_PASS_BY_MAX_KM) return near;
  return inKonradReach(lat, lon) ? { kind: 'none' } : { kind: 'no-coverage' };
}

/** HH:MM in Ortszeit (wie die übrigen Uhrzeiten des Regenradars). */
export function clockHm(ms: number): string {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** Fenster „14:20–14:35"; hat es schon begonnen, „jetzt–14:35". */
export function windowText(fromMs: number, toMs: number, nowMs: number): string {
  return `${fromMs <= nowMs ? 'jetzt' : clockHm(fromMs)}–${clockHm(toMs)}`;
}

const SIDE_WORD: Record<string, string> = {
  N: 'nördlich', NO: 'nordöstlich', O: 'östlich', SO: 'südöstlich',
  S: 'südlich', SW: 'südwestlich', W: 'westlich', NW: 'nordwestlich',
};

/** Der Satz für den gewählten Ort (E-ZO-3). `null` nur für „leerer Lauf" — dort spricht die bestehende Leiste. */
export function cellPlaceSentence(v: CellPlaceVerdict, nowMs: number): string | null {
  switch (v.kind) {
    case 'pass': {
      const w = windowText(v.pass.fromMs, v.pass.toMs, nowMs);
      if (v.pass.kind === 'now') return `Zelle ${v.cellId} ist gerade über dir, laut amtlicher Bahn bis etwa ${clockHm(v.pass.toMs)}.`;
      if (v.pass.kind === 'core') return `Zelle ${v.cellId} erreicht dich voraussichtlich ${w}.`;
      return `Zelle ${v.cellId} kann dich ${w} streifen.`;
    }
    case 'passby': {
      const side = SIDE_WORD[compass8(v.sideBearingDeg)] ?? '';
      // Unter 10 km auf 1 km, darüber auf 5 km — wie `cellRelevanceText`.
      const km = v.missKm < 10 ? Math.round(v.missKm) : Math.round(v.missKm / 5) * 5;
      const when = v.atMs <= nowMs ? 'am nächsten jetzt' : `am nächsten gegen ${clockHm(v.atMs)}`;
      return `Zelle ${v.cellId} zieht etwa ${km} km ${side} vorbei (${when}).`;
    }
    case 'none': return 'Keine Zelle zieht in den nächsten 60 Minuten über dich oder nah vorbei.';
    case 'no-coverage': return 'Hier gibt es keine Zelldaten: der DWD erkennt Zellen nur in Reichweite der deutschen Radare (etwa 150 km).';
    case 'empty': return null;
  }
}

/** Reihenfolge der Zellwahl: die Zelle des Orts zuerst, dann nach Schweregrad, dann nach ID. */
export function cellChoiceOrder(run: Konrad3dRun, verdict: CellPlaceVerdict | null): number[] {
  const own = verdict && (verdict.kind === 'pass' || verdict.kind === 'passby') ? verdict.cellId : null;
  const sev = (c: Konrad3dCell) => c.severityDecimal ?? c.severity ?? 0;
  return run.cells
    .filter((c) => c.forecast.length > 0)
    .sort((a, b) => (a.id === own ? -1 : b.id === own ? 1 : sev(b) - sev(a) || a.id - b.id))
    .map((c) => c.id);
}

/** Lage des Fensters auf der 60-min-Achse ab Messzeit (0…1) — für das schmale Band der Liste. */
export function windowBand(p: Pick<CellPass, 'fromLead' | 'toLead'>, axisMin = 60): { x0: number; x1: number } {
  const c = (v: number) => Math.max(0, Math.min(1, v / axisMin));
  return { x0: c(p.fromLead), x1: c(p.toLead) };
}
