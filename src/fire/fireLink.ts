/**
 * Brandradar · Link auf EINEN Brand (`/waldbrand/brand/<kennung>`, pur, Typen-Importe only).
 *
 * ── Die Kennung, und die Regel dahinter ─────────────────────────────────────
 * Die Quelle (NASA FIRMS) liefert keine Brand-ID, nur Detektionen (Pixel, Zeit,
 * Satellit). Ein „Brand" ist schon heute die Gruppe benachbarter Detektionen
 * (`fireClusters.ts`, Radius `CLUSTER_RADIUS_M`; Ereignisse trennt eine Lücke von
 * 48 h, `fireEvents.GAP_MS`). Die Registry nennt ihn nach dem ANKER — der ÄLTESTEN
 * Detektion der Gruppe im Datenfenster (`fire:<lat>,<lon>,<acqMs>`, die Archiv-
 * Historie `bh:<…>` nach derselben Regel). Diese Kennung bleibt gleich, solange
 * der Anker im Fenster liegt; ein Überflug mehr ändert sie nicht.
 *
 * Der Link-Slug ist genau dieser Anker in URL-Form:
 *
 *     <lat>_<lon>_<yyyymmddhhmm>        48.12345_11.45678_202610121430   (UTC)
 *
 * — Breite/Länge der Ankerdetektion (5 Nachkommastellen, wie die Registry sie
 * schreibt) und ihre Erfassungsminute in UTC. Beides sind Messwerte, nichts ist
 * erfunden; der Slug lässt sich ohne Tabelle zurücklesen (auch von der Edge
 * Function für die Vorschau). Reine Kartierungen ohne Detektion (`effis:<id>`)
 * tragen `effis-<id>`.
 *
 * ── Auflösung beim Aufruf (nachvollziehbar, in dieser Reihenfolge) ───────────
 *  1. Live (7-Tage-Fenster): Eintrag mit genau dieser Kennung oder einer
 *     früheren Kennung desselben Brands (`previousIds`, Merge/Anker-Wanderung).
 *  2. Historie (Saison): Ereignis mit dieser Kennung bzw. `previousIds` — sonst
 *     das Ereignis, das die Ankerdetektion ENTHÄLT: Zeitpunkt zwischen Beginn
 *     und Ende (± 1 h) und Schwerpunkt höchstens 3 km + √Hüllfläche entfernt.
 *     So überlebt ein Link, wenn der Anker des laufenden Fensters wandert, der
 *     Brand aber in der Archiv-Historie unter seiner echten ersten Detektion steht.
 *  3. Sonst: „nicht mehr in den Daten" — mit Ort und Zeit aus dem Link selbst
 *     (echte Werte), nie ein Ersatzbrand.
 */

import type { FireRecord } from './footprint/fireRegistry';
import type { HistoryIndexEntry } from './history/historyArtifacts';

/** Das Pfadsegment hinter `/waldbrand/`. */
export const FIRE_LINK_SEGMENT = 'brand';

const DET_RE = /^(-?\d{1,3}\.\d{5})_(-?\d{1,3}\.\d{5})_(\d{12,13})$/;
const EFFIS_RE = /^effis-([A-Za-z0-9._-]{1,40})$/;
/** Das ganze Slug-Vokabular — `routes.ts` nutzt es, um Pfade zu erkennen. */
export const FIRE_SLUG_RE = /^(?:-?\d{1,3}\.\d{5}_-?\d{1,3}\.\d{5}_\d{12,13}|effis-[A-Za-z0-9._-]{1,40})$/;

export type FireLinkTarget =
  | { kind: 'detection'; slug: string; lat: number; lon: number; acqMs: number; latStr: string; lonStr: string }
  | { kind: 'effis'; slug: string; effisId: string };

const p2 = (n: number) => String(n).padStart(2, '0');

/** ms → `yyyymmddhhmm` (UTC); nicht minutengenau ⇒ rohe Millisekunden (13 Ziffern). */
function encodeTime(ms: number): string {
  if (ms % 60_000 !== 0) return String(ms);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`;
}

function decodeTime(s: string): number | null {
  if (s.length === 13) { const n = Number(s); return Number.isFinite(n) ? n : null; }
  const y = Number(s.slice(0, 4)), mo = Number(s.slice(4, 6)), d = Number(s.slice(6, 8));
  const h = Number(s.slice(8, 10)), mi = Number(s.slice(10, 12));
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(ms);
  return back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? ms : null;
}

/**
 * Registry-/Historien-Kennung → Link-Slug. `null` für Kennungen, die kein Brand
 * sind (`site:…` Dauerquellen) oder die sich nicht lesen lassen.
 */
export function fireLinkSlug(id: string | null | undefined): string | null {
  if (!id) return null;
  const rest = id.startsWith('bh:') ? id.slice(3) : id;
  if (rest.startsWith('effis:')) {
    const e = rest.slice(6);
    return /^[A-Za-z0-9._-]{1,40}$/.test(e) ? `effis-${e}` : null;
  }
  if (!rest.startsWith('fire:') && id === rest) return null;
  const key = rest.startsWith('fire:') ? rest.slice(5) : rest;
  const m = /^(-?\d{1,3}\.\d{5}),(-?\d{1,3}\.\d{5}),(\d{9,})$/.exec(key);
  if (!m) return null;
  const ms = Number(m[3]);
  if (!Number.isFinite(ms)) return null;
  return `${m[1]}_${m[2]}_${encodeTime(ms)}`;
}

/** Slug → Ziel; `null` bei jedem Slug, der kein Brand benennt (ungültiger Link). */
export function parseFireLink(slug: string | null | undefined): FireLinkTarget | null {
  if (!slug) return null;
  const e = EFFIS_RE.exec(slug);
  if (e) return { kind: 'effis', slug, effisId: e[1] };
  const m = DET_RE.exec(slug);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  const acqMs = decodeTime(m[3]);
  if (acqMs == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { kind: 'detection', slug, lat, lon, acqMs, latStr: m[1], lonStr: m[2] };
}

/** Pfad zu einem Brand (ohne Query). */
export const fireLinkPath = (slug: string): string => `/waldbrand/${FIRE_LINK_SEGMENT}/${slug}`;

/** Die Registry-Kennung, die der Anker eines Slugs hätte (`fire:…` / `effis:…`). */
export function liveIdOf(t: FireLinkTarget): string {
  return t.kind === 'effis' ? `effis:${t.effisId}` : `fire:${t.latStr},${t.lonStr},${t.acqMs}`;
}

// ---------------------------------------------------------------------------
// Auflösung
// ---------------------------------------------------------------------------

/** Live-Eintrag zum Ziel (Regel 1). Gibt `null` zurück, wenn keiner passt — nie einen Nachbarn. */
export function findLiveRecord<R extends Pick<FireRecord, 'id' | 'previousIds' | 'sources'>>(
  records: readonly R[], t: FireLinkTarget,
): R | null {
  const id = liveIdOf(t);
  const hit = records.find((r) => r.id === id || r.previousIds.includes(id));
  if (hit) return hit;
  if (t.kind === 'effis') return records.find((r) => String(r.sources.effis?.id ?? '') === t.effisId) ?? null;
  return null;
}

const HOUR_MS = 3_600_000;
const rad = (d: number) => (d * Math.PI) / 180;
function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const x = rad(bLon - aLon) * Math.cos(rad((aLat + bLat) / 2));
  const y = rad(bLat - aLat);
  return Math.hypot(x, y) * 6371;
}

/** Historien-Ereignis zum Ziel (Regel 2) — exakt, sonst das Ereignis, das die Ankerdetektion enthält. */
export function findHistoryEntry(
  entries: readonly Pick<HistoryIndexEntry, 'id' | 'lat' | 'lon' | 'firstMs' | 'lastMs' | 'hullKm2' | 'effisId'>[],
  t: FireLinkTarget,
  previousIdsOf?: (id: string) => readonly string[],
): string | null {
  const wanted = `bh:${liveIdOf(t)}`;
  const exact = entries.find((e) => e.id === wanted || previousIdsOf?.(e.id).includes(wanted));
  if (exact) return exact.id;
  if (t.kind === 'effis') return entries.find((e) => e.effisId === t.effisId)?.id ?? null;
  let best: { id: string; d: number } | null = null;
  for (const e of entries) {
    if (t.acqMs < e.firstMs - HOUR_MS || t.acqMs > e.lastMs + HOUR_MS) continue;
    const d = km(e.lat, e.lon, t.lat, t.lon);
    if (d > 3 + Math.sqrt(Math.max(0, e.hullKm2))) continue;
    if (!best || d < best.d) best = { id: e.id, d };
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------
// Worte (Teilen-Vorschau, Hinweis „nicht mehr in den Daten")
// ---------------------------------------------------------------------------

/** `12.10.2026, 14:30 Uhr UTC` — UTC, weil die Erfassungszeit der Quelle UTC ist. */
export function fireTimeText(ms: number): string {
  const d = new Date(ms);
  return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} Uhr UTC`;
}

const deg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2).replace('.', ',')}° ${v >= 0 ? pos : neg}`;
export const fireCoordText = (lat: number, lon: number): string => `${deg(lat, 'N', 'S')}, ${deg(lon, 'E', 'W')}`;

/** Titel + Beschreibung zum Link — nur Werte aus dem Slug, nichts Erfundenes, nie „bestätigt". */
export function describeFireLink(t: FireLinkTarget): { title: string; description: string } {
  if (t.kind === 'effis') {
    return {
      title: 'Brandfläche (EFFIS) — Brandradar',
      description: `Von EFFIS kartierte Brandfläche, Kennung ${t.effisId}. Die Seite zeigt Lage, Fläche und Quellen dieses Brandes. `
        + 'Datenseite des Brandradars, keine amtliche Warnung.',
    };
  }
  return {
    title: `Brand bei ${fireCoordText(t.lat, t.lon)} — Brandradar`,
    description: `Erste Satellitendetektion dieses Brandes: ${fireTimeText(t.acqMs)} (NASA FIRMS). `
      + 'Die Seite zeigt Lage, Verlauf und Quellen. Detektionen sind unbestätigt, solange keine Kartierung sie stützt — '
      + 'Datenseite des Brandradars, keine amtliche Warnung.',
  };
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface FireLinkCheck { name: string; ok: boolean; detail?: string }

export function verifyFireLink(): { checks: FireLinkCheck[]; passed: number; failed: number } {
  const checks: FireLinkCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const ms = Date.UTC(2026, 9, 12, 14, 30);
  const id = `fire:48.12345,11.45678,${ms}`;
  const slug = fireLinkSlug(id);
  add('Slug aus der Anker-Kennung', slug === '48.12345_11.45678_202610121430', slug ?? 'null');
  add('Archiv-Kennung bh: ergibt denselben Slug', fireLinkSlug(`bh:48.12345,11.45678,${ms}`) === slug);
  const t = parseFireLink(slug);
  add('Rundlauf Slug → Ziel → Kennung', t?.kind === 'detection' && liveIdOf(t) === id, t ? liveIdOf(t) : 'null');
  add('negative Längen (Westeuropa)', fireLinkSlug(`fire:41.12345,-8.45678,${ms}`) === '41.12345_-8.45678_202610121430'
    && parseFireLink('41.12345_-8.45678_202610121430')?.kind === 'detection');
  add('nicht minutengenaue Zeit bleibt verlustfrei', parseFireLink(fireLinkSlug(`fire:48.12345,11.45678,${ms + 7}`))?.kind === 'detection'
    && (parseFireLink(fireLinkSlug(`fire:48.12345,11.45678,${ms + 7}`)) as { acqMs: number }).acqMs === ms + 7);
  add('EFFIS-Kartierung ohne Detektion', fireLinkSlug('effis:12345') === 'effis-12345' && fireLinkSlug('bh:effis:12345') === 'effis-12345'
    && parseFireLink('effis-12345')?.kind === 'effis');
  add('Dauerquelle (site:) ist kein Brand', fireLinkSlug('site:abc') === null);
  for (const bad of ['', 'x', '48.1_11.4_202610121430', '48.12345_11.45678_20261312143', '99.12345_11.45678_202610121430', '48.12345_11.45678_202613121430', 'effis-', '../etc']) {
    add(`ungültig: „${bad}"`, parseFireLink(bad) === null);
  }
  const recs = [{ id, previousIds: [`fire:1.00000,2.00000,3000000000000`], sources: { effis: null } }] as unknown as FireRecord[];
  add('Live: genaue Kennung', findLiveRecord(recs, t!) === recs[0]);
  const prevSlug = fireLinkSlug('fire:1.00000,2.00000,3000000000000');
  add('Live: frühere Kennung (Merge/Anker-Wanderung) führt zum Brand', !!prevSlug && findLiveRecord(recs, parseFireLink(prevSlug)!) === recs[0], prevSlug ?? 'null');
  add('Live: Nachbar wird NICHT geraten', findLiveRecord(recs, parseFireLink('48.12346_11.45678_202610121430')!) === null);
  const hist = [{ id: 'bh:50.00000,10.00000,1', lat: 48.12, lon: 11.45, firstMs: ms - 5 * HOUR_MS, lastMs: ms + 30 * HOUR_MS, hullKm2: 1, effisId: null }];
  add('Historie: enthaltende Ereignis-Hülle (Anker gewandert)', findHistoryEntry(hist, t!) === 'bh:50.00000,10.00000,1');
  add('Historie: andere Zeit ⇒ kein Treffer', findHistoryEntry(hist, parseFireLink('48.12345_11.45678_202601010000')!) === null);
  add('Historie: anderer Ort ⇒ kein Treffer', findHistoryEntry(hist, parseFireLink('49.50000_11.45678_202610121430')!) === null);
  const d = describeFireLink(t!);
  add('Vorschau nennt Ort und Zeit aus dem Slug, kein „bestätigt", keine Warnung',
    d.title.includes('48,12° N') && d.description.includes('12.10.2026, 14:30') && !/(?<!un)bestätigt/i.test(d.description) && d.description.includes('keine amtliche Warnung'), d.title);
  add('kein Zeilenumbruch in der Vorschau', !d.title.includes('\n') && !d.description.includes('\n'));
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
