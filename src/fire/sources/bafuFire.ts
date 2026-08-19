/**
 * `fireIndexNational` (CH) und `fireBans` — die beiden Schweizer BAFU-Produkte
 * von `data.geo.admin.ch`.
 *
 * ── Fair Use ist hier eine Auflage, keine Empfehlung ─────────────────────────
 * `geo.admin.ch` begrenzt die „maximum number of requests per time unit". Bei
 * D-01 (reine Client-App) trifft das den Browser jedes Nutzers. Deshalb:
 * **ein Abruf je Sitzung und Datensatz**, In-Memory-TTL ≥ 1 h, **kein Polling**.
 * Der Server sendet selbst `Cache-Control: max-age=7200` — die Auflage ist also
 * die Vorgabe der Quelle, nicht unsere Erfindung (`audit/waldbrand-transport.md` §5).
 *
 * ── Simple Requests, sonst 403 ───────────────────────────────────────────────
 * OPTIONS auf das GeoJSON-Asset antwortet mit **403** (WB0 gemessen). Solange
 * der Abruf ein *Simple Request* bleibt — reines `fetch(url)` ohne eigene
 * Header — gibt es keinen Preflight und alles ist gut. Ein `If-None-Match`,
 * `Cache-Control` oder `Authorization` würde den Layer an einem 403 sterben
 * lassen, das mit den Daten nichts zu tun hat. **Keine Header setzen.**
 *
 * ── Die Farbe ist unsere ─────────────────────────────────────────────────────
 * Die Features tragen `region_id, canton, level, name_*, title_*, valid_from` —
 * und **kein** Farbfeld (143 Features, EPSG:2056, WB0 gemessen). Jede Schweizer
 * Farbe kommt daher aus `FIRE_SOURCE_CH.scale` und ist als `colorOrigin:
 * 'derived'` gekennzeichnet. `valid_from` liefert die Referenzzeit für
 * `dataAge` — damit liest der Wochenendfall als **Alter**, nicht als
 * Aktualität (Risiko R4; BAFU publiziert Mo–Fr nach Mittag).
 */

import { dataAgeText, type DataRef } from '../../dataAge';
import { reprojectFeatureCollection } from './swissProjection';

const BASE = 'https://data.geo.admin.ch';

/** Gefahrenstufe je Warnregion. */
export const BAFU_DANGER_URL =
  `${BASE}/ch.bafu.gefahren-waldbrand_warnung/gefahren-waldbrand_warnung/`
  + 'gefahren-waldbrand_warnung_2056.geojson';

/** Kantonale Präventionsmassnahmen (Feuerverbote). Collection-Id in WB0 bestätigt
 *  (Titel „Forest fire prevention measures of the cantons"). */
export const BAFU_BANS_URL =
  `${BASE}/ch.bafu.gefahren-waldbrand_praeventionsmassnahmen_kantone/`
  + 'gefahren-waldbrand_praeventionsmassnahmen_kantone/'
  + 'gefahren-waldbrand_praeventionsmassnahmen_kantone_2056.geojson';

/** Lizenz: geocat „Opendata OPEN: Freie Nutzung." (autoritativ; STAC-„proprietary" ist
 *  Platzhalter — docs/DATA_SOURCES.md §W.6, A0-6 2026-08-15). */
export const BAFU_LICENSE = 'Opendata OPEN: Freie Nutzung.';
export const BAFU_LICENSE_URL = 'https://opendata.swiss/en/terms-of-use/#terms_open';

export const BAFU_ATTRIBUTION =
  '© <a href="https://www.bafu.admin.ch/" target="_blank" rel="noopener">BAFU</a> · '
  + '© Data: swisstopo';

/** Fair Use: eine Stunde ist die Untergrenze, zwei Stunden entsprechen dem
 *  `Cache-Control` des Servers. Wir nehmen die Server-Vorgabe. */
const TTL_MS = 2 * 3_600_000;

export interface BafuRun {
  features: GeoJSON.FeatureCollection;
  count: number;
  /**
   * Referenzzeit aus `valid_from` des jüngsten Features — NICHT der
   * Abrufzeitpunkt. Ist keins vorhanden, bleibt es `null`, und die UI
   * beschriftet dann ausdrücklich die Abrufzeit (`dataAge.ts:79`).
   */
  ref: DataRef | null;
  /** Vorkommende Stufen — für die Legende und den Selbsttest. */
  levels: number[];
}

interface CacheEntry { run: BafuRun; at: number }
const _cache = new Map<string, CacheEntry>();
/** Läuft gerade ein Abruf? Verhindert, dass zwei Layer-Toggles kurz
 *  hintereinander zwei Requests auslösen (Fair Use). */
const _inflight = new Map<string, Promise<BafuRun>>();

/**
 * `valid_from` kommt als ISO-artiger String. Fehlt oder ist er unlesbar, wird
 * **keine** Referenzzeit behauptet — lieber „abgerufen 14:41" als ein erfundenes
 * Alter (D-04).
 */
export function parseValidFrom(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Die amtliche Stufe eines Features — `level`, sonst `null`. Nie geraten. */
export function levelOf(f: GeoJSON.Feature): number | null {
  const v = (f.properties as Record<string, unknown> | null)?.level;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

async function load(url: string): Promise<BafuRun> {
  // WICHTIG: kein zweites Argument mit Headern — sonst Preflight ⇒ 403.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`BAFU: HTTP ${res.status}`);
  const fc = (await res.json()) as GeoJSON.FeatureCollection;
  const feats = Array.isArray(fc?.features) ? fc.features : [];

  let newest: number | null = null;
  const levels = new Set<number>();
  for (const f of feats) {
    const ms = parseValidFrom((f.properties as Record<string, unknown> | null)?.valid_from);
    if (ms != null && (newest == null || ms > newest)) newest = ms;
    const lv = levelOf(f);
    if (lv != null) levels.add(lv);
  }

  return {
    // LV95 → WGS84: das Portal liefert AUSSCHLIESSLICH EPSG:2056, und MapLibre
    // erwartet WGS84. Ohne diesen Schritt landen die Polygone bei Koordinaten
    // wie [2607356, 1185118] und sind unsichtbar — genau so ist es beim ersten
    // Verdrahten aufgefallen: Daten geladen, Karte leer.
    features: reprojectFeatureCollection({ type: 'FeatureCollection', features: feats }),
    count: feats.length,
    // `measured`, nicht `run`: das ist ein Publikationszeitpunkt, kein Modelllauf.
    ref: newest != null ? { atMs: newest, kind: 'measured' } : null,
    levels: [...levels].sort((a, b) => a - b),
  };
}

/**
 * Ein Abruf je Sitzung und Datensatz — mehrfaches Aufrufen ist folgenlos.
 *
 * ⚠️ **Bewusst ohne `AbortSignal`.** Ein geteilter Promise-Cache darf nicht am
 * Abbruch-Signal eines einzelnen Aufrufers hängen: Bricht der erste Aufrufer ab,
 * erbt jeder spätere dessen `AbortError` — obwohl sein eigenes Signal intakt ist.
 * Genau das ist beim ersten Verdrahten passiert und sah aus wie ein
 * Netzwerkfehler: React 19 ruft Effekte unter `StrictMode` doppelt auf
 * (mounten → aufräumen → mounten), das Aufräumen brach den ersten Abruf ab, und
 * der zweite Lauf bekam den vergifteten Promise aus dem Cache.
 *
 * Der Abruf ist klein, idempotent und wird ohnehin zwischengespeichert —
 * ihn abzubrechen spart nichts. Wer nach dem `await` nicht mehr zuständig ist,
 * prüft sein **eigenes** Signal und verwirft das Ergebnis.
 */
export function fetchBafu(url: string): Promise<BafuRun> {
  const hit = _cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.run);
  const running = _inflight.get(url);
  if (running) return running;

  const p = load(url)
    .then((run) => { _cache.set(url, { run, at: Date.now() }); return run; })
    .finally(() => { _inflight.delete(url); });
  _inflight.set(url, p);
  return p;
}

export const fetchBafuDanger = () => fetchBafu(BAFU_DANGER_URL);
export const fetchBafuBans = () => fetchBafu(BAFU_BANS_URL);

/** Nur für Tests und Sitzungswechsel. */
export function resetBafuCache(): void { _cache.clear(); _inflight.clear(); }

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei — `fetch` wird injiziert)
// ---------------------------------------------------------------------------

export interface BafuCheck { name: string; ok: boolean; detail?: string }

export async function verifyBafu(): Promise<{ checks: BafuCheck[]; passed: number; total: number }> {
  const checks: BafuCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  add('Gefahrenstufen-URL zeigt auf data.geo.admin.ch',
    BAFU_DANGER_URL.startsWith('https://data.geo.admin.ch/')
      && BAFU_DANGER_URL.endsWith('_2056.geojson'));
  add('Feuerverbots-URL ist eine ANDERE Collection',
    BAFU_BANS_URL !== BAFU_DANGER_URL && BAFU_BANS_URL.includes('praeventionsmassnahmen'));
  add('Attribution nennt BAFU und swisstopo',
    /BAFU/.test(BAFU_ATTRIBUTION) && /swisstopo/.test(BAFU_ATTRIBUTION));

  add('valid_from wird gelesen, Müll ergibt null',
    parseValidFrom('2026-08-14T11:30:00Z') === Date.UTC(2026, 7, 14, 11, 30)
      && parseValidFrom('') === null && parseValidFrom(undefined) === null);
  add('level nur als Zahl, nie geraten',
    levelOf({ type: 'Feature', properties: { level: 4 }, geometry: null } as unknown as GeoJSON.Feature) === 4
      && levelOf({ type: 'Feature', properties: { level: 'hoch' }, geometry: null } as unknown as GeoJSON.Feature) === null
      && levelOf({ type: 'Feature', properties: null, geometry: null } as unknown as GeoJSON.Feature) === null);

  // --- Fair Use am injizierten fetch nachweisen -----------------------------
  const realFetch = globalThis.fetch;
  let calls = 0;
  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { level: 4, valid_from: '2026-08-14T11:00:00Z' }, geometry: null },
      { type: 'Feature', properties: { level: 5, valid_from: '2026-08-14T12:00:00Z' }, geometry: null },
      { type: 'Feature', properties: { level: 4 }, geometry: null },
    ],
  };
  let sawHeaders = false;
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    calls++;
    if (init && 'headers' in init && init.headers) sawHeaders = true;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(fc) } as unknown as Response);
  }) as typeof fetch;

  try {
    resetBafuCache();
    const a = await fetchBafuDanger();
    const b = await fetchBafuDanger();
    // Zwei parallele Aufrufe, wie sie zwei schnelle Toggles auslösen.
    const [c, d] = await Promise.all([fetchBafuBans(), fetchBafuBans()]);

    add('Gefahrenstufe: zweiter Aufruf kommt aus dem Cache — EIN Abruf je Sitzung',
      calls === 2, `${calls} Abrufe für 2 Datensätze × 2 Aufrufe`);
    add('parallele Aufrufe werden zusammengefasst (kein Doppel-Request)', c === d);
    add('Cache liefert dasselbe Objekt zurück', a === b);
    add('KEINE eigenen Header — sonst Preflight ⇒ 403 bei geo.admin.ch', !sawHeaders);
    add('Referenzzeit ist das JÜNGSTE valid_from, nicht die Abrufzeit',
      a.ref?.atMs === Date.UTC(2026, 7, 14, 12, 0) && a.ref.kind === 'measured');
    add('Stufen werden gesammelt und sortiert', a.levels.join(',') === '4,5');
    add('Features ohne valid_from kippen die Referenzzeit nicht', a.count === 3);

    // Ohne jedes valid_from darf KEINE Referenzzeit behauptet werden.
    resetBafuCache();
    globalThis.fetch = (() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { level: 2 }, geometry: null }] }),
    } as unknown as Response)) as typeof fetch;
    const noRef = await fetchBafuDanger();
    add('ohne valid_from wird KEIN Datenalter behauptet (D-04)', noRef.ref === null);

    // --- WB-T2-2: der Wochenendfall als Fixture --------------------------
    // BAFU publiziert Mo–Fr nach Mittag. Am Sonntag ist der Stand also zwei
    // Tage alt, und genau das MUSS dastehen — „aktuell" wäre eine Lüge, und
    // eine Abrufzeit wäre eine andere (Risiko R4). Geprüft wird die Kette
    // valid_from → DataRef → dataAgeText, nicht nur ein Einzelteil.
    const freitag = Date.UTC(2026, 7, 14, 12, 5);   // Fr 14.08. 12:05 UTC
    const sonntag = Date.UTC(2026, 7, 16, 10, 0);   // So 16.08. 10:00 UTC
    resetBafuCache();
    globalThis.fetch = (() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { level: 3, valid_from: new Date(freitag).toISOString() }, geometry: null }],
      }),
    } as unknown as Response)) as typeof fetch;
    const we = await fetchBafuDanger();
    const text = dataAgeText(we.ref, sonntag, sonntag);
    add('Wochenende: der Freitagsstand liest sich als ALTER, nicht als aktuell',
      text.startsWith('Stand ') && /vor 1 T 21 h|vor 1 T 22 h/.test(text), text);
    add('Wochenende: es wird KEINE Abrufzeit ausgegeben', !text.includes('abgerufen'), text);

    // Fehler dürfen nicht in einen stillen Leerstand münden.
    resetBafuCache();
    globalThis.fetch = (() => Promise.resolve({ ok: false, status: 503 } as unknown as Response)) as typeof fetch;
    let threw = false;
    try { await fetchBafuDanger(); } catch { threw = true; }
    add('HTTP-Fehler wirft, statt eine leere Karte auszugeben (L2)', threw);
  } finally {
    globalThis.fetch = realFetch;
    resetBafuCache();
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
