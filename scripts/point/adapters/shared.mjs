/**
 * shared.mjs — was alle Quell-Adapter des Punkt-Cubes gemeinsam haben
 * (Phase PD3ff., `audit/punktdaten-versorgung.md`).
 *
 * ── Warum es eine Adapter-Schicht gibt ─────────────────────────────────────
 * `QUELLENMATRIX.md` §1 nennt 19 Quellen. Als 19 Skripte wäre das unpflegbar —
 * und es wäre auch falsch beschrieben: die Quellen unterscheiden sich nicht in 19
 * Arten, sondern in **sechs Zugriffsfamilien**:
 *
 *   1. DWD, reguläres lat-lon-GRIB     ICON-D2, ICON-EU
 *   2. DWD, ikosaedrisches GRIB        ICON global, AICON, die EPS-Familien
 *   3. ECMWF, `.index` + Byte-Bereiche IFS HRES/ENS, AIFS Single/ENS
 *   4. Stationsquelle                  MOSMIX-L (KMZ je Station)
 *   5. Fremd-API                       GeoSphere C-LAEF, MeteoSchweiz ICON-CH (STAC)
 *   6. bereits gespiegelt              RADVOR RV, INCA, CombiPrecip (`radar/`)
 *
 * Eine Quelle ist deshalb ein Tabelleneintrag mit sechs Funktionen, nicht ein
 * eigenes Programm. Was sie eint, steht hier.
 *
 * ── Die Regel, die alle Adapter einhalten müssen ───────────────────────────
 * Ein Feld, das die Quelle nicht führt, ist `null` — **nie** ein Nullwert. Der
 * Unterschied zwischen „diese Quelle kennt keine Schneefallgrenze" und „die
 * Schneefallgrenze liegt bei 0 m" ist der Unterschied zwischen einer ehrlichen und
 * einer falschen Vorhersage.
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { decodeGrib2 } from '../../../src/sources/gribDecode.ts';
import { decompressBz2 } from '../../lib/bz2.mjs';
import { makeHostPacers } from './pacer.mjs';

const CACHE = process.env.POINT_CACHE || '.cache/point';

// ---------------------------------------------------------------------------
// Welche Quelle gerade zieht (PD-C2)
// ---------------------------------------------------------------------------
//
// Bis PD-C2 zählte `net` nur GESAMT. Am kalten PD-B10-Lauf ließ sich deshalb ein
// Zuwachs von 1,8 GiB nicht auf den MiB genau einer Quelle zuordnen (§45, V-PD-36) —
// und jede Volumenentscheidung der Etappen PD-C6…C9 hängt an genau dieser Zahl.
// Der Kontext läuft über `AsyncLocalStorage`, damit keine der 14 Aufrufstellen ihre
// Signatur ändern muss: `adapterFor()` wickelt jede Adapter-Methode in `withSource()`.
const sourceCtx = new AsyncLocalStorage();
export const withSource = (id, fn) => sourceCtx.run(id, fn);
export const currentSource = () => sourceCtx.getStore() ?? null;

const freshNet = () => ({ files: 0, bytes: 0, cached: 0, absent: 0, ms: 0, throttled: 0, probes: 0, reDecompressed: 0, coalesced: 0, bySource: {} });
let net = freshNet();
/** Momentaufnahme — `bySource` ist eine Kopie, damit Differenzen je Stufe gebildet werden können. */
export function netStats() {
  return { ...net, bySource: Object.fromEntries(Object.entries(net.bySource).map(([k, v]) => [k, { ...v }])) };
}
export function resetNetStats() { net = freshNet(); }
function perSource() {
  const id = currentSource() ?? '_';
  return (net.bySource[id] ??= { files: 0, bytes: 0, ms: 0, cached: 0, absent: 0, throttled: 0, probes: 0, coalesced: 0 });
}
/** `after − before` je Quelle — was EINE Stufe gezogen hat. */
export function netDiff(before, after) {
  const out = {};
  for (const [id, a] of Object.entries(after.bySource)) {
    const b = before.bySource[id] ?? {};
    const d = Object.fromEntries(Object.keys(a).map((k) => [k, a[k] - (b[k] ?? 0)]));
    if (Object.values(d).some((v) => v !== 0)) out[id] = d;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fehlerinjektion (PD-C2) — der Verifier BEWEIST, dass ein Quellfehler eine Stimme
// kostet und nicht den Lauf, statt es per Regex am Quelltext zu vermuten (§45: „der
// Verifier hat den Fehler bestätigt statt gefunden"). `POINT_FAULT_INJECT=<id>[:<n>]`
// lässt ab dem n-ten Abruf dieser Quelle jeden weiteren werfen. Nur für Prüfläufe.
// ---------------------------------------------------------------------------
const FAULT = (() => {
  const s = process.env.POINT_FAULT_INJECT;
  if (!s) return null;
  const [id, n] = s.split(':');
  return { id, after: Number(n ?? 0), seen: 0 };
})();
function maybeInjectFault(url) {
  if (!FAULT || currentSource() !== FAULT.id) return;
  if (++FAULT.seen > FAULT.after) throw new Error(`POINT_FAULT_INJECT: ${FAULT.id} wirft absichtlich (${url})`);
}

// ---------------------------------------------------------------------------
// Drosselung ist kein Fehlversuch (PD-C2)
// ---------------------------------------------------------------------------
//
// Lauf 7 des Crons (2026-09-11 09:54 UTC) starb an einem ECMWF-429: fünf Versuche,
// jeder 429 zählte als einer, danach warf `fetchBytes` — mitten in Stufe 3, ohne
// einen Chunk. Ein 429 ist eine ANTWORT („später"), kein Netzabbruch. Er zählt jetzt
// gegen eine Wartezeit, nicht gegen die Versuche.
const THROTTLE_MAX_WAIT_MS = 10 * 60_000;

// ---------------------------------------------------------------------------
// Taktung je Host
// ---------------------------------------------------------------------------
//
// ECMWF beantwortete den ersten Lauf am 2026-09-09 mit **HTTP 429**: die
// Horizontsuche stellte je Stufe 36 HEAD-Anfragen, unmittelbar hintereinander,
// dazu die Bereichsabrufe. Das ist die BW-13-Lehre in Reinform — „eine Messsonde,
// die ihre eigene Quelle drosselt, misst nichts". Drei Kuren, alle hier:
//
//   1. ein Mindestabstand je Host (unten),
//   2. 429 gilt als WIEDERHOLBAR, mit `Retry-After` statt festem Warten,
//   3. die Horizontsuche halbiert statt zu zählen (`probeHorizon`).

const HOST_MIN_MS = {
  // 300 ms reichten nicht: Lauf 7 des Crons wurde damit gedrosselt (429 bei AIFS
  // Single, 2026-09-11). 600 ms kosten je Stufe ~1 min mehr Takt, sparen aber die
  // Wartezeiten nach 429 — `net.throttled` im Manifest sagt, ob es genügt (PD-C2).
  'data.ecmwf.int': 600,
  'opendata.dwd.de': 60,
  // GeoSphere nennt in QUELLENMATRIX §5 ein Limit von 240/h und 5/s. 250 ms halten das
  // Sekundenlimit mit Rand; die Stundengrenze ist bei ~24 Anfragen je Lauf weit weg.
  'dataset.api.hub.geosphere.at': 250,
};
/**
 * Gleichzeitigkeitsdeckel je Host (PD-F2a). Der Takt begrenzt die RATE, der Deckel die Zahl
 * offener Anfragen — mit acht Bahnen je Quelle (F2b) hielte ECMWF sonst acht Verbindungen.
 */
const HOST_MAX_INFLIGHT = { 'data.ecmwf.int': 2 };
// PD-F2a: das alte `pace()` las `lastAt` VOR dem await und schrieb es danach — unter
// Nebenläufigkeit feuerten alle Wartenden gleichzeitig (Selbsttest in pacer.mjs zeigt 0 ms
// Abstand). Jetzt eine FIFO je Host mit Zeitstempel bei der VERGABE; die Taktwerte bleiben.
const pacers = makeHostPacers(HOST_MIN_MS, HOST_MAX_INFLIGHT);
/** `fn` im Takt und unter dem Deckel des Hosts von `url` ausführen; ohne Eintrag direkt. */
const paced = (url, fn) => pacers.run(url, fn);
export const pacerStats = () => pacers.stats();

/**
 * In-flight-Memo (PD-F2a): fragen zwei Aufrufer denselben Schlüssel gleichzeitig an, bevor
 * die Datei im Plattencache liegt, teilt der zweite den Promise des ersten — statt die Datei
 * zweimal zu laden (`existsSync` VOR dem await sah sie noch nicht). Auch `null` (404) wird geteilt.
 */
const inflight = new Map();
function memoInflight(key, ps, start) {
  if (inflight.has(key)) { net.coalesced++; ps.coalesced++; return inflight.get(key); }
  const pr = start();
  inflight.set(key, pr);
  pr.then(() => inflight.delete(key), () => inflight.delete(key));
  return pr;
}

/** Wartezeit nach einem 429 — `Retry-After` hat Vorrang vor der eigenen Schätzung. */
function retryAfterMs(res, attempt) {
  const h = res.headers?.get?.('retry-after');
  const s = h ? Number(h) : NaN;
  if (Number.isFinite(s) && s > 0) return Math.min(60_000, s * 1000);
  return Math.min(30_000, 1000 * 2 ** attempt);
}

/**
 * Cache-Version. Erhöhen, wenn sich die ERZEUGUNG des zwischengespeicherten Inhalts
 * ändert — sonst überlebt ein falsch entpacktes Feld jede Korrektur. `2` verwirft alle
 * Einträge, die mit dem reinen-JS-bz2-Weg entstanden sind (s. `fetchGribField`).
 */
const CACHE_VERSION = 2;

// ── Plattencache je Stufe leeren (PD-C2, V-PD-36) ────────────────────────────
// Der kalte PD-B10-Lauf ließ 9,1 GiB Cache liegen — gegen 14 GB Platte auf dem Runner,
// auf denen auch Checkout und Daten-Repo liegen. Innerhalb eines Laufs wird fast nichts
// zweimal gelesen; die Ausnahmen sind Koordinaten- und Konstantendateien (clat/clon,
// HHL, HSURF, MeteoSchweiz-Konstanten), die über Stufen hinweg gebraucht werden.
//
// Gelöscht wird NUR, was dieser Prozess angefasst hat (`touched`) und was nicht wie
// eine Konstante heißt — und nur mit `POINT_CACHE_CLEAR=tier` (setzt die Cron-Vorlage).
// Lokal bleibt der Cache stehen: Messungen „am selben Cache" (§37, §38) brauchen ihn.
const CACHE_KEEP_RE = /clat|clon|hhl|hsurf|time-invariant|invariant|constants|mch:[^#]*const/i;
const touched = new Map();   // Pfad → keep?
function noteTouched(key, p) { if (!touched.has(p)) touched.set(p, CACHE_KEEP_RE.test(key)); }
/** Alle in diesem Prozess berührten Cache-Dateien löschen, bis auf Konstanten. Gibt Bytes/Dateien zurück. */
export function clearCache({ force = false } = {}) {
  if (!force && process.env.POINT_CACHE_CLEAR !== 'tier') return { files: 0, bytes: 0, kept: touched.size, skipped: true };
  let files = 0, bytes = 0, kept = 0;
  for (const [p, keep] of touched) {
    if (keep) { kept++; continue; }
    try {
      if (existsSync(p)) { bytes += statSync(p).size; rmSync(p); files++; }
    } catch { /* eine nicht löschbare Cache-Datei ist kein Fehler */ }
    touched.delete(p);
  }
  return { files, bytes, kept, skipped: false };
}

function cachePath(key) {
  const h = createHash('sha1').update(`v${CACHE_VERSION}|${key}`).digest('hex');
  const p = join(CACHE, h.slice(0, 2), `${h}.bin`);
  noteTouched(key, p);
  return p;
}

/** Einen Eintrag verwerfen — nach einem Befund, nicht auf Verdacht. */
function dropCache(key) {
  const p = cachePath(key);
  try { if (existsSync(p)) rmSync(p); } catch { /* ein nicht loeschbarer Cache ist kein Fehler */ }
}

/**
 * Holt Bytes mit Cache und Wiederholung. `null` = die Quelle hat die Datei nicht
 * (HTTP 404) — das ist eine Antwort, keine Störung, und wird NICHT wiederholt.
 *
 * Jede andere Störung wird dreimal versucht und danach **laut** geworfen. Die
 * Unterscheidung ist nicht kosmetisch: beim ersten Producer-Lauf am 2026-09-09
 * verschwand ein Dekodierfehler in einer Wiederholschleife und wurde als „Feld
 * fehlt beim DWD" gebucht — 147 Abrufe, 160 MiB, und alle 48 Felder gemeldet als
 * nicht vorhanden. Ein abgebrochener Abruf ist kein Befund über seine Quelle
 * (BW-13), aber ein Dekodierfehler ist einer.
 */
export async function fetchBytes(url, opts = {}) {
  const { range = null, decompress = false, cacheKey = null } = opts;
  // `cacheKey` überschreibt die URL als Cache-Schlüssel. Nötig für vorsignierte
  // Hrefs (MeteoSchweiz/CSCS): dort wechseln `Signature` und `Expires` bei JEDER
  // STAC-Enumeration, also träfe ein URL-Schlüssel nie — der Cache wäre da und
  // liefe leer. Der Objektname ist dagegen laufinvariant.
  const key = `${cacheKey ?? url}#${range ?? ''}${decompress ? '#bz2' : ''}`;
  const p = cachePath(key);
  const ps = perSource();
  maybeInjectFault(url);   // VOR dem Cache — ein Prüflauf soll auch am warmen Cache werfen
  if (existsSync(p)) { net.cached++; ps.cached++; return new Uint8Array(readFileSync(p)); }
  return memoInflight(key, ps, () => fetchBytesNet(url, opts, p, ps));
}

/** Der Netzweg von `fetchBytes` — genau einmal je Schlüssel gleichzeitig (memoInflight). */
async function fetchBytesNet(url, { range = null, decompress = false, forceBinary = false }, p, ps) {
  let lastError = null;
  let throttleWait = 0;
  // Fünf Fehlversuche — aber ein 429/503 ist KEIN Fehlversuch (s. o.): er zählt gegen
  // `THROTTLE_MAX_WAIT_MS`, nicht gegen `i`. Erst wenn die Quelle uns zehn Minuten lang
  // vertröstet hat, ist das ein Befund, der geworfen werden darf.
  for (let i = 0; i < 5;) {
    const t0 = Date.now();
    try {
      const res = await paced(url, () => fetch(url, range ? { headers: { range: `bytes=${range}` } } : undefined));
      if (res.status === 404) { net.absent++; ps.absent++; return null; }
      if (res.status === 429 || res.status === 503) {
        net.throttled++; ps.throttled++;
        const wait = retryAfterMs(res, Math.min(4, Math.floor(throttleWait / 15_000)));
        throttleWait += wait;
        lastError = new Error(`HTTP ${res.status} (gedrosselt, ${Math.round(throttleWait / 1000)} s gewartet)`);
        if (throttleWait > THROTTLE_MAX_WAIT_MS) break;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
      const raw = new Uint8Array(await res.arrayBuffer());
      const dt = Date.now() - t0;
      net.files++; net.bytes += raw.length; net.ms += dt;
      ps.files++; ps.bytes += raw.length; ps.ms += dt;
      // `binary: true` — libbzip2 prüft die Block-CRC, das JS-Paket nicht (s. fetchGribField).
      const out = decompress ? await decompressBz2(raw, { binary: true }) : raw;
      void forceBinary;   // der Weg ist ohnehin schon der binäre; das Flag dokumentiert die Absicht
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, out);
      return out;
    } catch (e) {
      lastError = e;
      i++;
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? 'unbekannt'}`);
}

/**
 * bz2-GRIB → dekodiertes Feld. `null`, wenn die Datei nicht existiert.
 *
 * ── Warum hier geprüft und notfalls neu entpackt wird ──────────────────────
 * Gemessen am 2026-09-09 an **ICON global CLON**, Läufe 06z und 12z: das reine-JS-
 * `bz2`-Paket liefert einen Datenstrom mit der **richtigen Länge** (2,50 MiB, genau
 * so viel, wie der GRIB-Kopf ansagt) und **falschem Inhalt**. Für den 00z-Lauf
 * derselben Datei stimmt es. Es ist also datenabhängig, nicht größenabhängig — und
 * ein Längenvergleich fängt es NICHT.
 *
 * Hier hat zufällig der AEC-Decoder angeschlagen („Bitstrom-Überlauf"). Bei einfacher
 * Packung (DRT 0), die viele Felder benutzen, wäre daraus ein still falsches Feld
 * geworden: plausible Zahlen, falsche Wirklichkeit. `verify-icon-global.mjs` trägt
 * diese Warnung seit jeher; sie nach EINER bestandenen Stichprobe abzuhaken war der
 * Fehler.
 *
 * Kur in drei Stufen:
 *   1. Entpackt wird bevorzugt mit dem **`bzip2`-Binary** (libbzip2, prüft die
 *      Block-CRC) — nicht mit dem JS-Paket.
 *   2. Jedes Feld wird **dekodiert**, bevor es als gut gilt.
 *   3. Scheitert die Dekodierung, wird der Cache-Eintrag verworfen und EINMAL mit dem
 *      Binary neu geholt. Scheitert es dann wieder, ist es ein Befund über die Quelle
 *      und wird laut geworfen.
 */
/**
 * JSON im Takt des Hosts holen (PD-F2a) — für Kataloglisten (STAC), die bisher mit nacktem
 * `fetch` liefen: ohne Takt, ohne Zähler, ohne Memo. `null` bei 404; wirft bei anderen Fehlern
 * nach denselben Wiederholungsregeln wie `fetchBytes` (Drosselung zählt gegen Wartezeit).
 * Nicht auf der Platte gecacht: Listen ändern sich mit jeder Enumeration.
 */
export async function fetchJson(url) {
  const ps = perSource();
  maybeInjectFault(url);
  return memoInflight(`JSON#${url}`, ps, async () => {
    let lastError = null, throttleWait = 0;
    for (let i = 0; i < 5;) {
      const t0 = Date.now();
      try {
        const res = await paced(url, () => fetch(url));
        if (res.status === 404) { net.absent++; ps.absent++; return null; }
        if (res.status === 429 || res.status === 503) {
          net.throttled++; ps.throttled++;
          const wait = retryAfterMs(res, Math.min(4, Math.floor(throttleWait / 15_000)));
          throttleWait += wait;
          lastError = new Error(`HTTP ${res.status} (gedrosselt, ${Math.round(throttleWait / 1000)} s gewartet)`);
          if (throttleWait > THROTTLE_MAX_WAIT_MS) break;
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const dt = Date.now() - t0;
        net.files++; net.bytes += text.length; net.ms += dt; ps.files++; ps.bytes += text.length; ps.ms += dt;
        return JSON.parse(text);
      } catch (e) {
        lastError = e; i++;
        await new Promise((r) => setTimeout(r, 400 * i));
      }
    }
    throw new Error(`${url}: ${lastError?.message ?? 'unbekannt'}`);
  });
}

// ---------------------------------------------------------------------------
// PD-F2d: Dekodieren + Abtasten im Worker-Pool
// ---------------------------------------------------------------------------
//
// `fetchGribField` liefert das VOLLE Feld (bis 11,8 MB) und der Adapter tastet danach ab —
// beides im Hauptthread. `fetchSampledField` holt die Bytes hier (Cache, Takt, Zähler,
// Fehlerinjektion bleiben an EINER Stelle) und gibt Dekodieren + Abtasten an den Pool; zurück
// kommt das Stufengitter (194 KB). Der Kopf des Feldes (Parameter-Identität, Template,
// Member-Nummer) kommt mit, weil Adapter daraus Einheit und Filter ableiten.
// Rückfall: `POINT_WORKERS=0` ⇒ dieselben Funktionen inline (decodePool.mjs).
let poolMod = null;
async function pool() {
  if (!poolMod) poolMod = await import('./decodePool.mjs');
  return poolMod.getPool();
}
export async function poolStats() { return poolMod ? poolMod.poolInfo() : { mode: 'not-started' }; }

/**
 * Bytes → dekodiertes, auf die Stufe abgetastetes Gitter, im Pool.
 * @param {Uint8Array} raw  GRIB-Bytes (werden an den Worker ÜBERGEBEN — danach nicht mehr anfassen;
 *   deshalb hier eine Kopie, wenn der Puffer aus dem Plattencache oder einem Range-Slice stammt).
 * @param {object} tier  Stufe (`TIERS[i]`); es wandert nur die Geometrie.
 * @param {object} o  { grid: 'regular'|'unstructured', idxKey, fillGaps, unit }
 * @returns {Promise<{ header, grid: Float32Array } | null>}
 */
export async function sampleBytes(raw, tier, { grid = 'regular', idxKey = null, fillGaps = true, unit = null } = {}) {
  if (!raw) return null;
  const p = await pool();
  // Kopie statt Übergabe des Originals: der In-flight-Memo kann denselben Puffer an zwei Aufrufer
  // reichen, und ein einmal übertragener ArrayBuffer ist für den zweiten leer (detached).
  const copy = raw.slice().buffer;
  const r = await p.run({ op: 'decodeSample', raw: copy, tier: poolMod.tierGeometry(tier), grid, idxKey, fillGaps, unit }, [copy]);
  return { header: r.header, grid: r.grid };
}

/**
 * Alle Nachrichten einer Datei → je Nachricht { header, grid }, im Pool (dwdEps `membersAt`).
 * `keep` ist ein deklaratives Prädikat (intervalEndMinute, paramIds, perturbationNumbers) — eine
 * Funktion lässt sich nicht an einen Worker senden. Ohne `keep` kommen alle Nachrichten zurück.
 */
export async function sampleBytesMany(raw, tier, { grid = 'regular', idxKey = null, fillGaps = true, unit = null, keep = null } = {}) {
  if (!raw) return null;
  const p = await pool();
  const copy = raw.slice().buffer;
  const r = await p.run({ op: 'decodeSampleMany', raw: copy, tier: poolMod.tierGeometry(tier), grid, idxKey, fillGaps, unit, keep }, [copy]);
  // `total` = Zahl ALLER Nachrichten der Datei (auch der per `keep` verworfenen), wenn bekannt.
  return { items: r.items, total: r.total ?? r.items.length };
}

/** Wie `fetchGribField` + Abtastung, aber Dekodieren und Abtasten laufen im Pool. */
export async function fetchSampledField(url, tier, { bz2 = true, range = null, cacheKey = null, grid = 'regular', idxKey = null, fillGaps = true, unit = null } = {}) {
  const raw = await fetchBytes(url, { range, decompress: bz2, cacheKey });
  if (!raw) return null;
  try {
    return await sampleBytes(raw, tier, { grid, idxKey, fillGaps, unit });
  } catch (first) {
    // Dieselbe Kur wie in `fetchGribField` (§25): das reine-JS-bz2 liefert bei manchen Läufen die
    // richtige Länge und falsche Bytes — einmal mit dem Binary neu entpacken, dann erst aufgeben.
    if (!bz2) throw first;
    net.reDecompressed++;
    dropCache(`${cacheKey ?? url}#${range ?? ''}#bz2`);
    const again = await fetchBytes(url, { range, decompress: bz2, forceBinary: true, cacheKey });
    if (!again) return null;
    try {
      return await sampleBytes(again, tier, { grid, idxKey, fillGaps, unit });
    } catch (second) {
      throw new Error(`${url}: auch nach erneutem Entpacken mit dem bzip2-Binary nicht dekodierbar — ${second.message}`);
    }
  }
}

/** Pool schließen (Ende des Laufs) — die Worker sind im Leerlauf `unref`, das ist nur Ordnung. */
export async function poolClose() { if (poolMod) await poolMod.closePool(); }

/** Nachbarindex je (Quelle, Stufe) an den Pool geben — einmal, bevor unstrukturierte Felder abgetastet werden. */
export async function poolSetIndex(key, idx) {
  const p = await pool();
  await p.setIndex(key, idx);
}

export async function fetchGribField(url, { bz2 = true, range = null, cacheKey = null } = {}) {
  const raw = await fetchBytes(url, { range, decompress: bz2, cacheKey });
  if (!raw) return null;
  try {
    return decodeGrib2(raw);
  } catch (first) {
    if (!bz2) throw first;
    net.reDecompressed++;
    dropCache(`${cacheKey ?? url}#${range ?? ''}#bz2`);
    const again = await fetchBytes(url, { range, decompress: bz2, forceBinary: true, cacheKey });
    if (!again) return null;
    try {
      return decodeGrib2(again);
    } catch (second) {
      throw new Error(`${url}: auch nach erneutem Entpacken mit dem bzip2-Binary nicht dekodierbar — ${second.message}`);
    }
  }
}

/**
 * HEAD über dieselbe Taktung wie ein Abruf. Ein 429 heißt hier NICHT „gibt es nicht" —
 * das wäre die stille Variante des Fehlers, den 429 überhaupt erst auslöst.
 */
export async function headOk(url) {
  const ps = perSource();
  maybeInjectFault(url);
  // PD-F2a: derselbe HEAD von zwei Bahnen gleichzeitig (IFS und AIFS proben denselben Lauf) ⇒ einer.
  return memoInflight(`HEAD#${url}`, ps, () => headOkNet(url, ps));
}
async function headOkNet(url, ps) {
  let throttleWait = 0;
  for (let i = 0; i < 4;) {
    try {
      net.probes++; ps.probes++;
      const r = await paced(url, () => fetch(url, { method: 'HEAD' }));
      if (r.status === 429 || r.status === 503) {
        // Ein gedrosselter HEAD, der als `false` zurückkäme, hieße „Lauf gibt es nicht" —
        // die stille Variante des Fehlers (PD-C2). Deshalb zählt auch hier die Wartezeit.
        net.throttled++; ps.throttled++;
        const wait = retryAfterMs(r, Math.min(4, Math.floor(throttleWait / 15_000)));
        throttleWait += wait;
        if (throttleWait > THROTTLE_MAX_WAIT_MS) throw new Error(`${url}: HEAD ${r.status} (gedrosselt, ${Math.round(throttleWait / 1000)} s gewartet)`);
        await new Promise((x) => setTimeout(x, wait));
        continue;
      }
      return r.ok;
    } catch (e) {
      if (/gedrosselt|POINT_FAULT_INJECT/.test(e.message)) throw e;
      i++;
      await new Promise((x) => setTimeout(x, 300 * i));
    }
  }
  return false;
}

/**
 * Bis zu welcher Stunde einer Stufe eine Quelle liefert — per **Halbierung** statt
 * per Zählung. Aus 36 Sonden werden ~6.
 *
 * Voraussetzung ist Zusammenhang: eine Quelle, die Stunde h liefert, liefert auch
 * jede frühere Stunde derselben Stufe. Das gilt für alle hier angebundenen Quellen
 * (DWD und ECMWF publizieren Schritte aufsteigend und lückenlos bis zum Horizont) —
 * es ist eine ANNAHME und steht deshalb hier und nicht nur im Kopf des Aufrufers.
 */
export async function probeHorizon(leadHours, has) {
  if (leadHours.length === 0) return [];
  if (!(await has(leadHours[0]))) return [];
  const last = leadHours.length - 1;
  if (last === 0 || await has(leadHours[last])) return [...leadHours];
  let lo = 0, hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (await has(leadHours[mid])) lo = mid; else hi = mid;
  }
  return leadHours.slice(0, lo + 1);
}

export const pad2 = (n) => String(n).padStart(2, '0');
export const pad3 = (n) => String(n).padStart(3, '0');

/** `YYYYMMDDHH` des Laufs, der `backSlots` Slots à `slotH` Stunden zurückliegt. */
export function runIdBack(nowMs, slotH, backSlots) {
  const d = new Date(nowMs - backSlots * slotH * 3600_000);
  const hh = Math.floor(d.getUTCHours() / slotH) * slotH;
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(hh)}`;
}
export const runIso = (run) =>
  `${run.slice(0, 4)}-${run.slice(4, 6)}-${run.slice(6, 8)}T${run.slice(8, 10)}:00:00Z`;

// ---------------------------------------------------------------------------
// Abtastung, Nachbarindex, Einheiten — seit PD-F2a in sample.mjs (worker-tauglich, reine
// Funktionen). Hier nur re-exportiert, damit keine Aufrufstelle umzieht.
// ---------------------------------------------------------------------------
export {
  sampleRegularToTier, fillNearest, buildUnstructuredIndexBrute, buildUnstructuredIndex,
  sampleUnstructuredToTier, convert, KELVIN_TO_C, PA_TO_HPA, FRACTION_TO_PCT, M_TO_MM,
} from './sample.mjs';


// ---------------------------------------------------------------------------
// Mehrere Byte-Bereiche in EINER Anfrage (PD-B10, §45)
// ---------------------------------------------------------------------------
//
// IFS-ENS legt 50 Member als 50 getrennte Bereiche ab. Einzeln geholt wären das
// 50 Anfragen je (Größe, Schritt), bei 300 ms Mindestabstand und ECMWF-Drosselung.
// `data.ecmwf.int` beantwortet einen Range-Kopf mit vielen Bereichen mit
// `206 multipart/byteranges` — gemessen 50 Bereiche, 31,55 MiB, 3,6 s.
//
// ⚠ Zwei Dinge, die ein Server darf und ein Leser deshalb können muss (RFC 7233):
// Teile in anderer Reihenfolge liefern, und nahe beieinanderliegende Bereiche zu
// EINEM Teil zusammenlegen. Zugeordnet wird deshalb über `Content-Range`, nie über
// die Position des Teils.
//
// ⚠ Und eine Sache, die er NICHT darf, ohne dass es teuer wird: den Range-Kopf
// ignorieren und mit 200 die ganze Datei schicken. Eine `enfo-ef`-Datei ist
// Hunderte MiB groß. Bei 200 wird deshalb abgebrochen, BEVOR der Körper gelesen
// wird — laut, nicht still.

/** Die Teile einer `multipart/byteranges`-Antwort — über Bytes, nicht über Text. */
export function parseMultipartByteranges(body, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || '');
  if (!m) throw new Error('multipart/byteranges ohne boundary');
  const buf = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  const delim = Buffer.from(`--${m[1] ?? m[2]}`, 'latin1');
  const parts = [];
  let pos = buf.indexOf(delim, 0);
  while (pos >= 0) {
    const p = pos + delim.length;
    if (buf[p] === 0x2d && buf[p + 1] === 0x2d) break;           // Schluss-Boundary
    const hdrEnd = buf.indexOf('\r\n\r\n', p, 'latin1');
    if (hdrEnd < 0) throw new Error('multipart/byteranges: Teil ohne Kopfende');
    const head = buf.toString('latin1', p, hdrEnd);
    const cr = /content-range:\s*bytes\s+(\d+)-(\d+)\//i.exec(head);
    if (!cr) throw new Error('multipart/byteranges: Teil ohne Content-Range');
    const start = Number(cr[1]), end = Number(cr[2]);
    const dataStart = hdrEnd + 4, len = end - start + 1;
    if (dataStart + len > buf.length) throw new Error('multipart/byteranges: Teil laenger als die Antwort (abgeschnitten?)');
    parts.push({ start, end, data: body.subarray(dataStart, dataStart + len) });
    // Hinter den Daten weitersuchen — die Boundary kann zufällig IN den Daten stehen.
    pos = buf.indexOf(delim, dataStart + len);
  }
  if (parts.length === 0) throw new Error('multipart/byteranges ohne Teile');
  return parts;
}

/** Ein angefragter Bereich aus den gelieferten Teilen — `null`, wenn keiner ihn enthält. */
export function sliceRange(parts, offset, length) {
  for (const p of parts) {
    if (offset >= p.start && offset + length - 1 <= p.end) {
      return p.data.subarray(offset - p.start, offset - p.start + length);
    }
  }
  return null;
}

/**
 * Viele Bereiche derselben Datei, je Gruppe EINE Anfrage. Jeder Bereich wird unter
 * demselben Schlüssel gecacht wie bei `fetchBytes(url, { range })` — beide Wege
 * teilen sich den Cache.
 *
 * @param ranges `[{ offset, length }]`
 * @returns die Bytes in der Reihenfolge von `ranges`, oder `null`, wenn die Datei fehlt.
 */
export async function fetchRanges(url, ranges, { cacheKey = null, maxPerRequest = 64 } = {}) {
  const keyOf = (r) => `${cacheKey ?? url}#${r.offset}-${r.offset + r.length - 1}`;
  const out = new Array(ranges.length).fill(null);
  const todo = [];
  for (let i = 0; i < ranges.length; i++) {
    const p = cachePath(keyOf(ranges[i]));
    if (existsSync(p)) { net.cached++; out[i] = new Uint8Array(readFileSync(p)); } else todo.push(i);
  }
  const ps = perSource();
  maybeInjectFault(url);
  for (let g = 0; g < todo.length; g += maxPerRequest) {
    const group = todo.slice(g, g + maxPerRequest);
    const header = 'bytes=' + group.map((i) => `${ranges[i].offset}-${ranges[i].offset + ranges[i].length - 1}`).join(',');
    let lastError = null, done = false, throttleWait = 0;
    for (let a = 0; a < 5 && !done;) {
      const t0 = Date.now();
      const ac = new AbortController();
      let res;
      try {
        res = await paced(url, () => fetch(url, { headers: { range: header }, signal: ac.signal }));
      } catch (e) {
        lastError = e;
        a++;
        await new Promise((r) => setTimeout(r, 400 * a));
        continue;
      }
      if (res.status === 404) { ac.abort(); net.absent++; ps.absent++; return null; }
      if (res.status === 429 || res.status === 503) {
        ac.abort();
        // Wie in fetchBytes: Drosselung zählt gegen die Wartezeit, nicht gegen die Versuche.
        net.throttled++; ps.throttled++;
        const wait = retryAfterMs(res, Math.min(4, Math.floor(throttleWait / 15_000)));
        throttleWait += wait;
        lastError = new Error(`HTTP ${res.status} (gedrosselt, ${Math.round(throttleWait / 1000)} s gewartet)`);
        if (throttleWait > THROTTLE_MAX_WAIT_MS) break;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (res.status !== 206) {
        ac.abort();
        throw new Error(`${url}: HTTP ${res.status} statt 206 — der Server ignoriert die Bereiche; `
          + 'der Körper wäre die GANZE Datei und wird nicht gelesen');
      }
      const ct = res.headers.get('content-type') || '';
      const body = new Uint8Array(await res.arrayBuffer());
      { const dt = Date.now() - t0; net.files++; net.bytes += body.length; net.ms += dt; ps.files++; ps.bytes += body.length; ps.ms += dt; }
      let parts;
      if (/multipart\/byteranges/i.test(ct)) {
        parts = parseMultipartByteranges(body, ct);
      } else {
        // EIN Bereich (oder vom Server zu einem zusammengelegt): der Kopf der Antwort sagt, welcher.
        const cr = /bytes\s+(\d+)-(\d+)\//i.exec(res.headers.get('content-range') || '');
        if (!cr) throw new Error(`${url}: 206 ohne Content-Range`);
        parts = [{ start: Number(cr[1]), end: Number(cr[2]), data: body }];
      }
      for (const i of group) {
        const r = ranges[i];
        const data = sliceRange(parts, r.offset, r.length);
        if (!data) throw new Error(`${url}: Bereich ${r.offset}+${r.length} fehlt in der Antwort`);
        const p = cachePath(keyOf(r));
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, data);
        out[i] = data;
      }
      done = true;
    }
    if (!done) throw new Error(`${url}: ${lastError?.message ?? 'unbekannt'}`);
  }
  return out;
}
