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

import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { decodeGrib2 } from '../../../src/sources/gribDecode.ts';
import { decompressBz2 } from '../../lib/bz2.mjs';

const CACHE = process.env.POINT_CACHE || '.cache/point';

let net = { files: 0, bytes: 0, cached: 0, absent: 0, ms: 0, throttled: 0, probes: 0, reDecompressed: 0 };
export function netStats() { return { ...net }; }
export function resetNetStats() { net = { files: 0, bytes: 0, cached: 0, absent: 0, ms: 0, throttled: 0, probes: 0, reDecompressed: 0 }; }

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
  'data.ecmwf.int': 300,
  'opendata.dwd.de': 60,
  // GeoSphere nennt in QUELLENMATRIX §5 ein Limit von 240/h und 5/s. 250 ms halten das
  // Sekundenlimit mit Rand; die Stundengrenze ist bei ~24 Anfragen je Lauf weit weg.
  'dataset.api.hub.geosphere.at': 250,
};
const lastAt = new Map();
async function pace(url) {
  let host;
  try { host = new URL(url).host; } catch { return; }
  const min = HOST_MIN_MS[host] ?? 0;
  if (!min) return;
  const wait = min - (Date.now() - (lastAt.get(host) ?? 0));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAt.set(host, Date.now());
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

function cachePath(key) {
  const h = createHash('sha1').update(`v${CACHE_VERSION}|${key}`).digest('hex');
  return join(CACHE, h.slice(0, 2), `${h}.bin`);
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
export async function fetchBytes(url, { range = null, decompress = false, forceBinary = false, cacheKey = null } = {}) {
  // `cacheKey` überschreibt die URL als Cache-Schlüssel. Nötig für vorsignierte
  // Hrefs (MeteoSchweiz/CSCS): dort wechseln `Signature` und `Expires` bei JEDER
  // STAC-Enumeration, also träfe ein URL-Schlüssel nie — der Cache wäre da und
  // liefe leer. Der Objektname ist dagegen laufinvariant.
  const key = `${cacheKey ?? url}#${range ?? ''}${decompress ? '#bz2' : ''}`;
  const p = cachePath(key);
  if (existsSync(p)) { net.cached++; return new Uint8Array(readFileSync(p)); }
  let lastError = null;
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    try {
      await pace(url);
      const res = await fetch(url, range ? { headers: { range: `bytes=${range}` } } : undefined);
      if (res.status === 404) { net.absent++; return null; }
      if (res.status === 429 || res.status === 503) {
        net.throttled++;
        await new Promise((r) => setTimeout(r, retryAfterMs(res, i)));
        lastError = new Error(`HTTP ${res.status} (gedrosselt)`);
        continue;
      }
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
      const raw = new Uint8Array(await res.arrayBuffer());
      net.files++; net.bytes += raw.length; net.ms += Date.now() - t0;
      // `binary: true` — libbzip2 prüft die Block-CRC, das JS-Paket nicht (s. fetchGribField).
      const out = decompress ? await decompressBz2(raw, { binary: true }) : raw;
      void forceBinary;   // der Weg ist ohnehin schon der binäre; das Flag dokumentiert die Absicht
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, out);
      return out;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
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
  for (let i = 0; i < 4; i++) {
    try {
      await pace(url);
      net.probes++;
      const r = await fetch(url, { method: 'HEAD' });
      if (r.status === 429 || r.status === 503) {
        net.throttled++;
        await new Promise((x) => setTimeout(x, retryAfterMs(r, i)));
        continue;
      }
      return r.ok;
    } catch {
      await new Promise((x) => setTimeout(x, 300 * (i + 1)));
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
// Abtastung auf das Stufengitter
// ---------------------------------------------------------------------------

/**
 * Reguläres GRIB-Feld → Stufengitter, als **Blockmittel** über die Quellzellen, die
 * in die Zielzelle fallen.
 *
 * Nächster Nachbar wäre hier falsch: ICON-D2 ist 0,02° und Stufe 1 ist 0,05°, also
 * fallen 2–3 Quellzellen je Achse in eine Zielzelle. Wer nur eine davon nimmt,
 * besetzt die Zelle nach dem Zufall einer einzigen Gitterlinie — im Gebirge ist das
 * der Unterschied zwischen Talboden und Hang.
 *
 * Umgekehrt (ICON-EU 0,0625° auf Stufe 2 mit 0,10°, IFS 0,25° auf Stufe 3 mit 0,25°)
 * fällt oft nur EINE Quellzelle in eine Zielzelle — dann ist das Blockmittel genau
 * der nächste Nachbar, und Zielzellen ohne Treffer bleiben `NaN`. Deshalb füllt
 * `fillGaps` sie anschließend aus dem nächsten belegten Nachbarn; ohne das hätte
 * Stufe 3 ein Schachbrett aus Löchern.
 */
export function sampleRegularToTier(field, tier, { fillGaps = true } = {}) {
  const { ni, nj, lat1, lon1, di, dj, scanMode, values } = field;
  const sum = new Float64Array(tier.ny * tier.nx);
  const cnt = new Int32Array(tier.ny * tier.nx);
  const jNorth = (scanMode & 0x40) !== 0;   // GRIB2 Tabelle 3.4, Bit 2
  for (let j = 0; j < nj; j++) {
    const lat = jNorth ? lat1 + j * dj : lat1 - j * dj;
    const iy = Math.round((lat - tier.lat0) / tier.deg);
    if (iy < 0 || iy >= tier.ny) continue;
    for (let i = 0; i < ni; i++) {
      const v = values[j * ni + i];
      if (!Number.isFinite(v)) continue;
      let lon = lon1 + i * di;
      if (lon > 180) lon -= 360;            // ECMWF: Ursprung 0°, gewrappt
      const ix = Math.round((lon - tier.lon0) / tier.deg);
      if (ix < 0 || ix >= tier.nx) continue;
      sum[iy * tier.nx + ix] += v;
      cnt[iy * tier.nx + ix]++;
    }
  }
  const out = new Float32Array(tier.ny * tier.nx).fill(NaN);
  for (let k = 0; k < out.length; k++) if (cnt[k] > 0) out[k] = sum[k] / cnt[k];
  return fillGaps ? fillNearest(out, tier) : out;
}

/**
 * Löcher aus dem nächsten belegten Nachbarn füllen (wachsende Ringe, max. 3 Zellen).
 * Bewusst gedeckelt: ein Loch, das 4 Zellen von jedem Wert entfernt liegt, ist kein
 * Abtastartefakt mehr, sondern ein Rand der Quelldomäne — und der gehört `MISSING`.
 */
export function fillNearest(grid, tier, maxRings = 3) {
  const out = Float32Array.from(grid);
  const holes = [];
  for (let k = 0; k < out.length; k++) if (!Number.isFinite(out[k])) holes.push(k);
  if (holes.length === 0 || holes.length === out.length) return out;
  for (const k of holes) {
    const y0 = Math.floor(k / tier.nx), x0 = k % tier.nx;
    let best = NaN, bestD = Infinity;
    for (let r = 1; r <= maxRings && !Number.isFinite(best); r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue;
        const y = y0 + dy, x = x0 + dx;
        if (y < 0 || y >= tier.ny || x < 0 || x >= tier.nx) continue;
        const v = grid[y * tier.nx + x];
        if (!Number.isFinite(v)) continue;
        const d = dy * dy + dx * dx;
        if (d < bestD) { bestD = d; best = v; }
      }
    }
    out[k] = best;
  }
  return out;
}

/**
 * Nächster-Nachbar-Index von einem UNSTRUKTURIERTEN (ikosaedrischen) Gitter auf das
 * Stufengitter. Gebaut über einen Vorfilter auf die Domäne: ICON global hat 2 949 120
 * Zellen, ein voller Scan je Zielzelle wäre 2009 × 2,9 M Vergleiche.
 *
 * Der Filter ist großzügig (1° Rand): eine Zelle am Domänenrand soll ihren Nachbarn
 * auch dann finden, wenn er knapp außerhalb liegt.
 */
export function buildUnstructuredIndexBrute(cellLat, cellLon, tier) {
  const latMin = tier.lat0 - 1, latMax = tier.lat0 + tier.ny * tier.deg + 1;
  const lonMin = tier.lon0 - 1, lonMax = tier.lon0 + tier.nx * tier.deg + 1;
  const cand = [];
  for (let c = 0; c < cellLat.length; c++) {
    const la = cellLat[c];
    let lo = cellLon[c];
    if (lo > 180) lo -= 360;
    if (la >= latMin && la <= latMax && lo >= lonMin && lo <= lonMax) cand.push(c);
  }
  if (cand.length === 0) return null;
  const idx = new Int32Array(tier.ny * tier.nx).fill(-1);
  for (let iy = 0; iy < tier.ny; iy++) {
    const lat = tier.lat0 + iy * tier.deg;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    for (let ix = 0; ix < tier.nx; ix++) {
      const lon = tier.lon0 + ix * tier.deg;
      let best = -1, bestD = Infinity;
      for (const c of cand) {
        let dlon = cellLon[c] - lon;
        if (dlon > 180) dlon -= 360;
        if (dlon < -180) dlon += 360;
        const dx = dlon * cosLat, dy = cellLat[c] - lat;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = c; }
      }
      idx[iy * tier.nx + ix] = best;
    }
  }
  return idx;
}

/**
 * Dasselbe Ergebnis, aber über ein Eimergitter statt über alle Kandidaten (PD-B4b).
 *
 * ── Warum das nötig wurde ─────────────────────────────────────────────────
 * Die einfache Fassung oben ist `O(Zielzellen × Kandidaten)`. Für ICON global geht das
 * gut, weil die Umgebungsbox nur ~6 000 der 2,95 Mio. Zellen enthält. Für eine Quelle,
 * die den Ausschnitt DICHT füllt, kippt es — selbst gemessen auf Stufe 1 (48 441
 * Zielzellen):
 *
 *   ICON global    ~6 000 Kandidaten →     1 170 ms
 *   ICON-D2-EPS   542 040 Kandidaten →    60 272 ms
 *   ICON-CH1     1 150 000 Kandidaten →  299 522 ms   ( = 5,0 min, JE STUFE )
 *
 * Bei drei unstrukturierten Quellen über drei Stufen wären das Viertelstunden allein für
 * die Nachbarsuche — bei 80 min Gesamtbudget (§34.6) nicht tragbar.
 *
 * ── Warum das Ergebnis IDENTISCH ist, nicht nur ähnlich ───────────────────
 * Die Ringsuche bricht erst ab, wenn bewiesen ist, dass draußen nichts Näheres liegen
 * kann: nach Ring `r` ist jeder ungeprüfte Kandidat in mindestens einer Achse `r · bs`
 * Grad entfernt, in der Metrik also mindestens `r · bs · cosLat` (der Längengrad geht mit
 * `cosLat ≤ 1` ein). Ist `bestD` kleiner, kann kein weiterer Ring gewinnen.
 *
 * Der zweite Teil ist das **Gleichstands-Verhalten**: die einfache Fassung läuft über
 * `cand` aufsteigend und nimmt nur ECHT kleinere Abstände, behält bei Gleichstand also
 * den kleinsten Index. Die Ringsuche läuft in anderer Reihenfolge — deshalb entscheidet
 * sie Gleichstände ausdrücklich über `c < best`. Ohne diese Zeile wären beide Fassungen
 * „gleich gut" und trotzdem verschieden, und der Gleichheitsbeweis fiele zufällig aus.
 */
export function buildUnstructuredIndex(cellLat, cellLon, tier) {
  const latMin = tier.lat0 - 1, latMax = tier.lat0 + tier.ny * tier.deg + 1;
  const lonMin = tier.lon0 - 1, lonMax = tier.lon0 + tier.nx * tier.deg + 1;

  // Kandidaten wie bisher filtern — zusätzlich die normalisierte Länge merken, damit die
  // Eimerzuordnung und die Abstandsrechnung dieselbe Zahl benutzen.
  const cand = [];
  const cLat = [], cLon = [];
  for (let c = 0; c < cellLat.length; c++) {
    const la = cellLat[c];
    let lo = cellLon[c];
    if (lo > 180) lo -= 360;
    if (la >= latMin && la <= latMax && lo >= lonMin && lo <= lonMax) { cand.push(c); cLat.push(la); cLon.push(lo); }
  }
  const n = cand.length;
  if (n === 0) return null;

  // Eimerkante so, dass im Mittel ~2 Kandidaten je Eimer liegen. Aus der GEMESSENEN
  // Dichte, nicht gesetzt — eine feste Kante wäre für ICON global zu fein und für
  // ICON-CH1 zu grob.
  const spanLat = Math.max(1e-6, latMax - latMin), spanLon = Math.max(1e-6, lonMax - lonMin);
  let bs = Math.sqrt((2 * spanLat * spanLon) / n);
  if (!Number.isFinite(bs) || bs <= 0) bs = tier.deg;
  bs = Math.min(Math.max(bs, 1e-4), Math.max(spanLat, spanLon));
  const nby = Math.max(1, Math.ceil(spanLat / bs));
  const nbx = Math.max(1, Math.ceil(spanLon / bs));

  // Verkettete Liste je Eimer — zwei Int32Arrays statt eines Arrays von Arrays: bei
  // über einer Million Kandidaten ist das der Unterschied zwischen „läuft" und
  // „belegt hunderte MB in Objekt-Kopfdaten".
  const head = new Int32Array(nby * nbx).fill(-1);
  const next = new Int32Array(n).fill(-1);
  // Der BELEGTE Bereich — gebraucht für den Sprung unten.
  let minBy = nby, maxBy = -1, minBx = nbx, maxBx = -1;
  for (let i = 0; i < n; i++) {
    const by = Math.min(nby - 1, Math.max(0, Math.floor((cLat[i] - latMin) / bs)));
    const bx = Math.min(nbx - 1, Math.max(0, Math.floor((cLon[i] - lonMin) / bs)));
    if (by < minBy) minBy = by; if (by > maxBy) maxBy = by;
    if (bx < minBx) minBx = bx; if (bx > maxBx) maxBx = bx;
    const b = by * nbx + bx;
    next[i] = head[b];
    head[b] = i;
  }

  // ── Wie weit darf ein Nachbar überhaupt entfernt sein? ────────────────────
  //
  // ⚠ Die alte Fassung kannte KEINE Grenze: sie nahm den global nächsten Kandidaten, auch
  // wenn er 700 km entfernt lag. Für eine Quelle, die den Ausschnitt ganz füllt, fällt das
  // nicht auf; für eine, die nur einen Teil deckt (C-LAEF bis 51,5 °N, ICON-CH bis 50,5),
  // hiesse es: EIN Randwert wird über halb Deutschland verteilt — und sähe aus wie eine
  // Vorhersage.
  //
  // Der reguläre Weg macht das seit jeher richtig: `fillNearest` extrapoliert höchstens
  // drei Zellen und lässt den Rest MISSING („ein Loch, das 4 Zellen von jedem Wert entfernt
  // liegt … gehört MISSING"). Der unstrukturierte Weg zieht hier nach — dieselbe Regel,
  // erweitert um die eigene Maschenweite der Quelle, damit ein grobes Gitter nicht an
  // seiner eigenen Auflösung scheitert.
  const spacing = Math.sqrt((spanLat * spanLon) / n);
  const maxDist = Math.max(3 * tier.deg, 2 * spacing);
  const maxD2 = maxDist * maxDist;
  const rMax = Math.ceil(maxDist / bs) + 1;

  const idx = new Int32Array(tier.ny * tier.nx).fill(-1);
  const maxRing = Math.min(Math.max(nby, nbx), rMax);
  for (let iy = 0; iy < tier.ny; iy++) {
    const lat = tier.lat0 + iy * tier.deg;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const by0 = Math.min(nby - 1, Math.max(0, Math.floor((lat - latMin) / bs)));
    for (let ix = 0; ix < tier.nx; ix++) {
      const lon = tier.lon0 + ix * tier.deg;
      const bx0 = Math.min(nbx - 1, Math.max(0, Math.floor((lon - lonMin) / bs)));
      let best = -1, bestD = Infinity;

      // ⚠ Ohne diesen Sprung wird die Ringsuche zur Falle — und zwar genau bei den
      // Quellen, für die die Etappe gebaut ist. Eine Quelle, die nur einen TEIL des
      // Ausschnitts deckt (C-LAEF endet bei 51,5 °N, ICON-CH bei 50,5), lässt jede
      // Zielzelle darüber Ring für Ring durch leeres Gebiet wachsen: bei 5,5° Abstand
      // sind das ~315 Ringe à 8·r Eimer, mal 20 000 Zellen. Selbst gemessen: der erste
      // Entwurf lief damit über fünf Minuten und wurde abgebrochen — LANGSAMER als das
      // Verfahren, das er ersetzen sollte.
      //
      // Alle Kandidaten liegen im belegten Bereich, also ist kein Kandidat näher als der
      // Weg dorthin. Die Suche darf bei genau diesem Ring beginnen; die Abbruchschranke
      // unten bleibt gültig, weil sie nur „alles Ungeprüfte ist mindestens r·bs entfernt"
      // behauptet — und die übersprungenen Ringe sind beweisbar leer.
      const r0 = Math.max(0, by0 - maxBy, minBy - by0, bx0 - maxBx, minBx - bx0);
      // Liegt schon der belegte Bereich weiter weg als die Kappe, gibt es nichts zu holen.
      // Das ist zugleich der schnelle Weg für die Zellen, die eine Teil-Quelle nicht deckt.
      if (r0 > rMax) { idx[iy * tier.nx + ix] = -1; continue; }

      for (let r = r0; r <= maxRing; r++) {
        const y0 = by0 - r, y1 = by0 + r, x0 = bx0 - r, x1 = bx0 + r;
        // Auf den belegten Bereich beschneiden: leere Zeilen gar nicht erst betreten.
        const yA = Math.max(y0, minBy), yB = Math.min(y1, maxBy);
        const xA = Math.max(x0, minBx), xB = Math.min(x1, maxBx);
        for (let by = yA; by <= yB; by++) {
          // Nur der RAND des Quadrats: die Innenfläche wurde in früheren Ringen geprüft.
          const onLatEdge = (by === y0 || by === y1);
          for (let bx = xA; bx <= xB; bx++) {
            if (!onLatEdge && bx !== x0 && bx !== x1) continue;
            for (let i = head[by * nbx + bx]; i >= 0; i = next[i]) {
              let dlon = cLon[i] - lon;
              if (dlon > 180) dlon -= 360;
              if (dlon < -180) dlon += 360;
              const dx = dlon * cosLat, dy = cLat[i] - lat;
              const d = dx * dx + dy * dy;
              const c = cand[i];
              // Gleichstand: kleinster Quell-Index gewinnt — s. den Kopfkommentar.
              if (d < bestD || (d === bestD && c < best)) { bestD = d; best = c; }
            }
          }
        }
        if (best >= 0) {
          const bound = r * bs * cosLat;
          if (bestD <= bound * bound) break;
        }
      }
      // Zu weit ist kein Nachbar. MISSING ist hier die ehrlichere Antwort als ein Wert,
      // der von jenseits des Quellenrandes stammt.
      idx[iy * tier.nx + ix] = (best >= 0 && bestD <= maxD2) ? best : -1;
    }
  }
  return idx;
}

/** Werte eines unstrukturierten Felds über den Nachbarindex auf das Stufengitter. */
export function sampleUnstructuredToTier(values, idx, tier) {
  const out = new Float32Array(tier.ny * tier.nx).fill(NaN);
  for (let k = 0; k < out.length; k++) {
    const c = idx[k];
    if (c < 0) continue;
    const v = values[c];
    if (Number.isFinite(v)) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Einheiten
// ---------------------------------------------------------------------------

/** In-place-Umrechnung. `factor`/`offset` je Adapter deklariert, nie geraten. */
export function convert(grid, spec) {
  const { factor = 1, offset = 0 } = spec ?? {};
  if (factor === 1 && offset === 0) return grid;
  for (let k = 0; k < grid.length; k++) if (Number.isFinite(grid[k])) grid[k] = grid[k] * factor + offset;
  return grid;
}

export const KELVIN_TO_C = { factor: 1, offset: -273.15 };
export const PA_TO_HPA = { factor: 0.01, offset: 0 };
export const FRACTION_TO_PCT = { factor: 100, offset: 0 };
export const M_TO_MM = { factor: 1000, offset: 0 };

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
  for (let g = 0; g < todo.length; g += maxPerRequest) {
    const group = todo.slice(g, g + maxPerRequest);
    const header = 'bytes=' + group.map((i) => `${ranges[i].offset}-${ranges[i].offset + ranges[i].length - 1}`).join(',');
    let lastError = null, done = false;
    for (let a = 0; a < 5 && !done; a++) {
      const t0 = Date.now();
      const ac = new AbortController();
      let res;
      try {
        await pace(url);
        res = await fetch(url, { headers: { range: header }, signal: ac.signal });
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 400 * (a + 1)));
        continue;
      }
      if (res.status === 404) { ac.abort(); net.absent++; return null; }
      if (res.status === 429 || res.status === 503) {
        ac.abort();
        net.throttled++;
        await new Promise((r) => setTimeout(r, retryAfterMs(res, a)));
        lastError = new Error(`HTTP ${res.status} (gedrosselt)`);
        continue;
      }
      if (res.status !== 206) {
        ac.abort();
        throw new Error(`${url}: HTTP ${res.status} statt 206 — der Server ignoriert die Bereiche; `
          + 'der Körper wäre die GANZE Datei und wird nicht gelesen');
      }
      const ct = res.headers.get('content-type') || '';
      const body = new Uint8Array(await res.arrayBuffer());
      net.files++; net.bytes += body.length; net.ms += Date.now() - t0;
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
