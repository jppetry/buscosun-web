#!/usr/bin/env node
/**
 * RD1+RD3 — Radar-Spiegel: RADOLAN-RV-Tars und KONRAD3D-XML vom DWD nach `buscosun-data`
 * (`radar/rv/`, `radar/konrad3d/` auf `main`), ausgeliefert über jsDelivr — und seit RD3
 * zusätzlich die FERTIG AUFBEREITETEN Dateien unter `radar/img/v1/` (RV/INCA/rzc als
 * Graustufen-PNGs mit den `precipToU8`-Bytes des Clients, KONRAD als JSON).
 * Diagnose, Messlauf und Entscheidungen: buscosun-web/audit/radar-datenrepo.md §10–§11, §14.
 *
 * Betrieb (Workflow `radar.yml` im Daten-Repo, gepflegt in buscosun-web/scripts/radar-mirror/):
 *   · EIN Job läuft RUN_MINUTES (≈ 5 h 45) und spiegelt Slot für Slot; der Watchdog-Cron
 *     startet bei Stillstand neu, beim Beenden löst der Job den Nachfolger selbst aus.
 *   · Der Job beendet sich direkt NACH einem Push, damit der Nachfolger ≈ 4,5 min Zeit hat.
 *
 * Erkennen: DWD-Produkte per HEAD auf den ERWARTETEN Pfad des nächsten Slots alle POLL_SEC
 * (RV ≈ 3,3 min, KONRAD3D ≈ 4,75 min nach dem Slot, §1.2); INCA über den leichten
 * GeoSphere-`/metadata`-Endpunkt (`last_forecast_reftime`, Rate-Limit 240/h ⇒ alle 45 s);
 * rzc über das MeteoSwiss-STAC-Tagesitem mit ETag (Dateiname NICHT berechenbar, §14.1).
 *
 * Derive (RD3): nach jedem Download spawnt der Spiegel `radar-derive.mjs` aus dem
 * buscosun-web-Klon (APP_DIR) als KINDPROZESS — die DECODER DES CLIENTS erzeugen die
 * Bytes (byte-identisch per Konstruktion, `verify:radar-repack`). Ein Derive-Fehler
 * nimmt nur die Bild-Ablage des Slots, nie den Roh-Push; ohne APP_DIR oder mit
 * DERIVE=0 läuft der Spiegel wie vor RD3 (roh only).
 *
 * Zwei Schreiber auf `main` (§3.3 R3): `publish-repack.mjs` ersetzt alle 3 h die GANZE
 * Historie per Force-Push (aus einem frischen Klon — unbekannte Dateien wie `radar/` und
 * dieses Skript trägt er unverändert weiter). Deshalb setzt JEDER Push hier neu auf:
 *   fetch → `main` auf `origin/main` → `radar/` KOMPLETT aus dem lokalen Bestand (MIRROR)
 *   neu einkopieren → commit → push; abgelehnt ⇒ wiederholen. Der Bestand heilt Lücken,
 *   weil immer ALLE behaltenen Dateien einkopiert werden.
 *
 * Retention KEEP je Produkt (12 Slots: RV/KONRAD/rzc = 1 h, INCA = 3 h; der Rückblick des
 * Regenradars braucht 9). jsDelivr: 20 MB je Datei, 150 MB je Paket — Budgetrechnung §14.1.
 * (D-NP0-1, 03.10.: die Paketgrenze trifft nur Verzeichnis-/Paketabrufe, jede Einzeldatei wird ausgeliefert.)
 *
 * NP-0a (buscosun-web/audit/np0-datenprodukte.md §8, E-NP0-1/-2/-7/-8) — Rückblick 2 h und Blitze:
 *   · Bild-Retention JE QUELLE (`IMG_KEEP`, gleiche Tabelle wie `RADAR_IMG_KEEP` in src/sources/radarImg.ts):
 *     rv/inca bleiben bei KEEP (Zählregel, byte-gleich); `rv-past`, `rzc`, `konrad3d` und die Blitze halten 2 h
 *     über eine ALTERSREGEL (Slot bleibt, solange er ≤ (keep − 1) · 5 min älter ist als der jüngste derselben
 *     Quelle, mindestens 2). Vorher kürzte jede Naht JEDE Quelle auf KEEP (Bare-Repo-Test, diag-a §5).
 *   · `img/rv-past/<stempel>/f000.png` = Kopie der eben abgeleiteten `img/rv/<stempel>/f000.png` (Derive unverändert).
 *   · Blitze: Haken `scripts/lightning/lightning-mirror.mjs` im Web-Klon (Muster road), Kindprozess asynchron,
 *     Dateien fahren beim nächsten Produkt-Push mit; nach 5 min ohne Produkt-Push eigener Push.
 *   · `.tmp-`-Reste abgebrochener Derives werden nicht mehr kopiert und nach 10 min gelöscht (V-NP0-4).
 *   Rückweg: `PAST_KEEP=12` (≤ KEEP ⇒ kein rv-past, alle Quellen KEEP wie vor NP-0a) und `LIGHTNING=0`.
 *
 * Lizenz: DWD/GeoSphere/MeteoSwiss OpenData, CC BY 4.0 (Attribution im Client unverändert).
 *
 * Lokal gegen ein Bare-Repo:  REMOTE=/pfad/zu/bare.git APP_DIR=/pfad/zu/buscosun-web \
 *   RUN_MINUTES=6 node radar-mirror.mjs   (im Arbeitsverzeichnis eines Klons des Remotes)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, copyFileSync, cpSync, statSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RUN_MINUTES = Number(process.env.RUN_MINUTES ?? 345);
const POLL_SEC = Math.max(2, Number(process.env.POLL_SEC ?? 10));
const KEEP = Number(process.env.KEEP ?? 12);
const BRANCH = process.env.BRANCH ?? 'main';
const REMOTE = process.env.REMOTE ?? 'origin';
const ROOT = process.cwd();                       // der Klon (Arbeitsverzeichnis des Jobs)
const MIRROR = process.env.MIRROR ?? join(ROOT, '..', 'radar-mirror-store');   // lokaler Bestand, außerhalb des Klons
const UA = 'buscosun-radar-mirror (buscosun-web/audit/radar-datenrepo.md)';
const PUSH_RETRIES = 4;
const IMG_VERSION = 'v1';

// RD3: buscosun-web-Klon mit den Client-Decodern; ohne ihn läuft der Spiegel roh only.
const APP_DIR = process.env.APP_DIR ?? '';
const DERIVE_SCRIPT = APP_DIR ? join(APP_DIR, 'scripts', 'radar-mirror', 'radar-derive.mjs') : '';
const DERIVE = process.env.DERIVE !== '0' && !!APP_DIR && existsSync(DERIVE_SCRIPT);

// AW-3 (buscosun-web/audit/autobahnwetter.md, E-AW-1): Autobahnwetter (`road/v1/`) als weiteres Produkt. Die Logik
// liegt im buscosun-web-Klon (`scripts/road/road-mirror.mjs`, Derive als Kindprozess wie RD3); hier nur drei Haken:
// seed() beim Start, poll() je Schleife, copyInto() in publish(). Ohne APP_DIR, ohne Modul oder mit ROAD=0 läuft der
// Spiegel wie vorher; ein Fehler im Straßenwetter nimmt nie den Radar-Push.
const ROAD_HOOK = APP_DIR ? join(APP_DIR, 'scripts', 'road', 'road-mirror.mjs') : '';
let road = null;

// NP-0a (E-NP0-1/-2): Rückblick 2 h + Blitze. `PAST_KEEP` ≤ KEEP stellt den Stand vor NP-0a her.
const PAST_KEEP = Number(process.env.PAST_KEEP || 24);   // leer = Voreinstellung
const PAST_ON = PAST_KEEP > KEEP;
// Phase R250 (buscosun-web/audit/radar-250m.md §5 R250-3): nach jedem RV-Derive die 250-m-Kacheln der ANALYSE aus den
// 17 DWD-Standortbildern (`px250`, ≈ 6,5 MB je Slot vom DWD, Kacheln ≈ 2 MB) in den Rückblick-Slot `img/rv-past/<stamp>/`
// (`h<ty><tx>.png` + `hd250.json`, Retention wie rv-past). Nur mit Rückblick und nur, wenn der Web-Klon den Vertrag kennt
// (sonst läuft der Spiegel wie vorher). Rückweg: `RADAR_HD250=0`. Ein Fehler nimmt nur die Kacheln des Slots, nie den Push.
const HD250_ON = process.env.RADAR_HD250 !== '0' && PAST_ON && !!APP_DIR && existsSync(join(APP_DIR, 'src', 'sources', 'radarHd250.ts'));
const LIGHTNING_HOOK = APP_DIR ? join(APP_DIR, 'scripts', 'lightning', 'lightning-mirror.mjs') : '';
const LIGHTNING_ON = process.env.LIGHTNING !== '0';
const LIGHTNING_DIRS = ['lightning-de', 'lightning-mtg'];
const LIGHTNING_SELF_PUSH_MS = 5 * 60_000;   // Blitze ohne Produkt-Push spätestens nach 5 min selbst pushen
let lightning = null;
/** Erwarteter RV-Slot (aus `main()`): im Fenster +2:50…+5:30 nach seinem Stempel liefert der DWD (+3:13…3:43) — dann
 *  startet der Blitz-Haken keinen Kindprozess, damit der RV-Derive die CPU allein hat. */
let pendingRvSlotMs = null;
const rvQuiet = () => pendingRvSlotMs != null && Date.now() - pendingRvSlotMs >= 170_000 && Date.now() - pendingRvSlotMs <= 330_000;
/** Slots je Bild-Quelle — dieselbe Tabelle wie `RADAR_IMG_KEEP` (src/sources/radarImg.ts, `verify:np0-radar` vergleicht). */
export const IMG_KEEP = { rv: KEEP, inca: KEEP, 'rv-past': PAST_KEEP, rzc: PAST_ON ? PAST_KEEP : KEEP, konrad3d: PAST_ON ? PAST_KEEP : KEEP, 'lightning-de': 24, 'lightning-mtg': 24 };
/** Quellen mit Altersregel (nur mit PAST_ON; sonst Zählregel wie vor NP-0a). */
export const IMG_AGE_RULE = ['rv-past', 'rzc', 'konrad3d', 'lightning-de', 'lightning-mtg'];
export const IMG_MIN_KEEP = 2;
const TMP_MAX_AGE_MS = 10 * 60_000;

const INCA_CHECK_SEC = Number(process.env.INCA_CHECK_SEC ?? 45); // Rate-Limit 240/h ⇒ ≥ 15 s
const RZC_CHECK_SEC = Number(process.env.RZC_CHECK_SEC ?? 30);
const INCA_META_URL = 'https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km/metadata';
const INCA_GRID_URL = 'https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km?parameters=rr&output_format=netcdf&bbox=45.51,8.11,49.47,17.73';
const RZC_STAC_ITEM = (day) => `https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip/items/${day}-ch`;

// EX-3 (buscosun-web/audit/fusion-expertenbericht-2026-09-29.md §3.3): der DWD schaltet das RADOLAN-
// Binärformat am 2026-10-20 08 UTC ab. Gespiegelt wird deshalb die HDF5-Lieferung desselben Laufs
// (`composite_rv_<JJJJMMTT>_<HHMM>.tar`, nacktes Tar, gemessen 0,75–2,4 MB statt 0,1–0,5 MB). Der
// Slot-Stempel `JJMMTTHHMM` bleibt der Schlüssel der Bild-Ablage. `RV_FORMAT=radolan` stellt bis zum
// Stichtag auf das Altformat zurück.
const RV_FORMAT = process.env.RV_FORMAT === 'radolan' ? 'radolan' : 'hdf5';

const PRODUCTS = {
  rv: {
    dir: 'rv',
    stamp: (d) => two(d.getUTCFullYear() % 100) + two(d.getUTCMonth() + 1) + two(d.getUTCDate()) + two(d.getUTCHours()) + two(d.getUTCMinutes()),
    file: (s) => (RV_FORMAT === 'hdf5' ? `composite_rv_20${s.slice(0, 6)}_${s.slice(6, 10)}.tar` : `DE1200_RV${s}.tar.bz2`),
    url: (f) => `https://opendata.dwd.de/weather/radar/composite/rv/${f}`,
    derive: 'rv',
    imgStamp: (d, s) => s, // Bild-Slot = Tar-Stempel
  },
  konrad3d: {
    dir: 'konrad3d',
    stamp: (d) => `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}T${two(d.getUTCHours())}${two(d.getUTCMinutes())}00`,
    file: (s) => `KONRAD3D_${s}.xml`,
    url: (f) => `https://opendata.dwd.de/weather/radar/konrad3d/${f}`,
    derive: 'konrad3d',
    imgStamp: (d, s) => s, // Bild-Slot = XML-Stempel
  },
};

function two(n) { return String(n).padStart(2, '0'); }
const nowIso = () => new Date().toISOString();
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const slotOf = (ms) => new Date(Math.floor(ms / 300_000) * 300_000);
const imgStampOf = (d) => `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}T${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
function log(msg) { console.log(`[${nowIso().slice(11, 19)}] ${msg}`); }

async function head(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': UA }, cache: 'no-store' });
    return { status: r.status, lastModified: r.headers.get('last-modified') };
  } catch (e) { return { status: 0, error: String(e.message ?? e) }; }
}

async function download(url, extraHeaders = {}) {
  const t0 = Date.now();
  const r = await fetch(url, { headers: { 'user-agent': UA, ...extraHeaders } });
  if (!r.ok) throw new Error(`GET ${url}: ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length < 100) throw new Error(`GET ${url}: nur ${buf.length} Bytes`);
  return { buf, ms: Date.now() - t0 };
}

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

// ── lokaler Bestand (MIRROR): die Wahrheit dieses Jobs, unabhängig vom Repo-Stand ──
function storeDir(p) { return join(MIRROR, p.dir); }
// Nach dem SLOT sortiert, nicht nach dem Namen: beim Wechsel der Lieferform liegen beide Namensmuster
// nebeneinander, und die Retention muss die ältesten Slots treffen, gleich wie sie heißen.
function slotKey(f) {
  const h = /composite_rv_20(\d{6})_(\d{4})\.tar$/.exec(f);
  if (h) return h[1] + h[2];
  const r = /DE1200_RV(\d{10})\.tar\.bz2$/.exec(f);
  return r ? r[1] : f;
}
function storeFiles(p) {
  if (!existsSync(storeDir(p))) return [];
  return readdirSync(storeDir(p)).filter((f) => !f.startsWith('.'))
    .sort((a, b) => (slotKey(a) < slotKey(b) ? -1 : slotKey(a) > slotKey(b) ? 1 : a < b ? -1 : a > b ? 1 : 0));
}
function storePut(p, file, buf) {
  mkdirSync(storeDir(p), { recursive: true });
  writeFileSync(join(storeDir(p), file), buf);
  // Ein Slot, eine Datei: die andere Lieferform desselben Slots weicht (sonst hielte die Retention
  // während des Wechsels 6 Slots doppelt statt 12 einfach).
  for (const f of storeFiles(p)) if (f !== file && slotKey(f) === slotKey(file)) rmSync(join(storeDir(p), f));
  const files = storeFiles(p);
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) rmSync(join(storeDir(p), f));
}

// ── Bild-Bestand (RD3): je Quelle Slot-VERZEICHNISSE `img/<quelle>/<stempel>/` ──
function imgSrcDir(source) { return join(MIRROR, 'img', source); }
function imgSlots(source) { return existsSync(imgSrcDir(source)) ? readdirSync(imgSrcDir(source)).filter((f) => !f.startsWith('.') && !f.includes('.tmp-')).sort() : []; }

/** Gültigkeitszeit eines Bild-Stempels: `YYMMDDHHMM` (rv, rv-past), `YYYYMMDDTHHMM` (inca, rzc, Blitze), `…HHMM00` (KONRAD). */
export function imgSlotMs(stamp) {
  let m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (m) return Date.UTC(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/.exec(stamp);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
}

/**
 * Welche Slots einer Quelle fallen weg? `slots` aufsteigend sortiert. Zählregel (rv, inca, alles ohne PAST_ON):
 * die ältesten über `keep`. Altersregel (NP-0a): älter als der jüngste Slot − (keep − 1) · 5 min, aber nie unter
 * `IMG_MIN_KEEP` — nach einem Ausfall bleibt der Rückblick kürzer, statt alte Slots als „vor 2 h" auszugeben.
 */
export function imgSlotsToDrop(source, slots, pastOn = PAST_ON) {
  const keep = IMG_KEEP[source] ?? KEEP;
  if (!(pastOn && IMG_AGE_RULE.includes(source))) return slots.slice(0, Math.max(0, slots.length - keep));
  const ms = slots.map(imgSlotMs);
  const newest = Math.max(...ms.filter(Number.isFinite));
  if (!Number.isFinite(newest)) return slots.slice(0, Math.max(0, slots.length - IMG_MIN_KEEP));
  const cut = newest - (keep - 1) * 300_000;
  const drop = slots.filter((s, i) => !(ms[i] >= cut));
  return drop.slice(0, Math.max(0, Math.min(drop.length, slots.length - IMG_MIN_KEEP)));
}

function imgPrune(source) {
  for (const s of imgSlotsToDrop(source, imgSlots(source))) rmSync(join(imgSrcDir(source), s), { recursive: true, force: true });
  // V-NP0-4: Reste abgebrochener Derives (`<stempel>.tmp-<pid>`) — ein laufender Derive ist jünger als 10 min.
  if (!existsSync(imgSrcDir(source))) return;
  for (const f of readdirSync(imgSrcDir(source))) {
    if (!f.includes('.tmp-')) continue;
    try { if (Date.now() - statSync(join(imgSrcDir(source), f)).mtimeMs > TMP_MAX_AGE_MS) rmSync(join(imgSrcDir(source), f), { recursive: true, force: true }); } catch { /* schon weg */ }
  }
}

/** `cpSync`-Filter der Bild-Ablage: keine `.tmp-`-Reste (V-NP0-4), keine abgeschalteten NP-0a-Quellen (Rückweg). */
function imgCopyFilter(src) {
  const name = basename(src);
  if (name.includes('.tmp-')) return false;
  if (name === 'rv-past' && !PAST_ON) return false;
  if (LIGHTNING_DIRS.includes(name) && !LIGHTNING_ON) return false;
  return true;
}

/** NP-0a: Analyse des RV-Slots in den Rückblick (`img/rv-past/<stempel>/f000.png`), byte-gleich kopiert. */
function rvPastCopy(stamp) {
  if (!PAST_ON) return false;
  const src = join(imgSrcDir('rv'), stamp, 'f000.png');
  const dst = join(imgSrcDir('rv-past'), stamp);
  if (!existsSync(src) || existsSync(join(dst, 'f000.png'))) return false;
  mkdirSync(dst, { recursive: true });
  copyFileSync(src, join(dst, 'f000.png'));
  return true;
}

/**
 * Derive als Kindprozess (RD3): schreibt `img/<quelle>/<stempel>/` in den Bestand.
 * Liefert {ms, files, bytes} oder null (Fehler geloggt — der Roh-Push läuft weiter).
 */
function derive(source, inPath, stamp) {
  if (!DERIVE) return null;
  const outDir = join(imgSrcDir(source), stamp);
  try {
    const t0 = Date.now();
    const stdout = execFileSync(process.execPath, [
      '--experimental-strip-types', '--import', pathToFileURL(join(APP_DIR, 'scripts', 'lib', 'register-ts.mjs')).href,
      DERIVE_SCRIPT, source, inPath, outDir, stamp,
    ], { encoding: 'utf8', timeout: 120_000, env: { ...process.env, REPACK_BZIP2: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const line = stdout.trim().split('\n').pop();
    const j = JSON.parse(line);
    imgPrune(source);
    if (source === 'rv' && rvPastCopy(stamp)) imgPrune('rv-past');
    return { ms: Date.now() - t0, files: j.files, bytes: j.bytes };
  } catch (e) {
    log(`derive ${source} ${stamp}: FEHLGESCHLAGEN (${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? 'unbekannt'}) — Slot ohne Bild-Ablage`);
    rmSync(outDir, { recursive: true, force: true });
    return null;
  }
}

/**
 * Phase R250: 250-m-Kacheln der Analyse in den Rückblick-Slot — Kindprozess wie `derive()`, lädt die Standortbilder
 * selbst (DWD liefert sie ≈ 75 s nach dem Scan, das RV-Tar kommt ≈ 3,3 min danach — sie liegen also schon da).
 * Liefert {ms, files, bytes, tiles, sites, missing} oder null (geloggt; der Slot bleibt ohne Kacheln = 1 km).
 */
function deriveHd250(stamp, tarPath) {
  if (!HD250_ON || !DERIVE) return null;
  const outDir = join(imgSrcDir('rv-past'), stamp);
  if (!existsSync(join(outDir, 'f000.png'))) return null;
  try {
    const t0 = Date.now();
    const stdout = execFileSync(process.execPath, [
      '--experimental-strip-types', '--import', pathToFileURL(join(APP_DIR, 'scripts', 'lib', 'register-ts.mjs')).href,
      DERIVE_SCRIPT, 'hd250', tarPath, outDir, stamp,
    ], { encoding: 'utf8', timeout: 150_000, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const j = JSON.parse(stdout.trim().split('\n').pop());
    return { ms: Date.now() - t0, files: j.files, bytes: j.bytes, tiles: j.tiles, sites: j.sites, missing: j.missing };
  } catch (e) {
    log(`hd250 ${stamp}: FEHLGESCHLAGEN (${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? 'unbekannt'}) — Slot ohne 250-m-Kacheln`);
    // Reste einer halben Ablage: unverzeichnete Kacheln sind harmlos (der Client liest nur gelistete), aber ein halbes
    // `hd250.json` darf nicht stehen bleiben.
    rmSync(join(outDir, 'hd250.json'), { force: true });
    return null;
  }
}

/** Beim Start: was `main` schon hat, in den Bestand übernehmen (Nachfolger-Job nach der Naht). */
export function storeSeed() {
  for (const p of Object.values(PRODUCTS)) {
    const d = join(ROOT, 'radar', p.dir);
    if (!existsSync(d)) continue;
    mkdirSync(storeDir(p), { recursive: true });
    for (const f of readdirSync(d)) if (!f.startsWith('.') && !existsSync(join(storeDir(p), f))) copyFileSync(join(d, f), join(storeDir(p), f));
    const files = storeFiles(p);
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) rmSync(join(storeDir(p), f));
  }
  const img = join(ROOT, 'radar', 'img', IMG_VERSION);
  if (existsSync(img)) {
    cpSync(img, join(MIRROR, 'img'), { recursive: true, force: false, filter: imgCopyFilter });
    // NP-0a: erster Start mit Rückblick — die f000 der vorhandenen RV-Slots sofort in den Rückblick.
    for (const st of imgSlots('rv')) rvPastCopy(st);
    for (const source of readdirSync(join(MIRROR, 'img'))) imgPrune(source);
  }
}

// Schema 3 (NP-0a): + `imgKeep`/`imgAgeRule` (Aufbewahrung je Bild-Quelle), `pastKeep`, `lightning` (Zustand des Hakens).
// `status.json` liest kein Code nach Schema — reine Telemetrie (D-NP0-3).
const status = {
  schema: 3, keep: KEEP, pastKeep: PAST_KEEP, imgKeep: IMG_KEEP, imgAgeRule: PAST_ON ? IMG_AGE_RULE : [],
  pollSec: POLL_SEC, derive: DERIVE, hd250: HD250_ON,
  job: process.env.GITHUB_RUN_ID ?? 'local', startedAt: nowIso(), recent: [], lightning: null,
};

/** `radar/` im Klon = exakt der lokale Bestand; dann commit + push, neu aufgesetzt auf origin/BRANCH. */
export function publish(msg) {
  let lastErr;
  for (let attempt = 1; attempt <= PUSH_RETRIES; attempt++) {
    try {
      git(['fetch', '--quiet', '--depth=1', REMOTE, BRANCH]);
      git(['checkout', '--quiet', '-B', BRANCH, `${REMOTE}/${BRANCH}`]);
      const radar = join(ROOT, 'radar');
      rmSync(radar, { recursive: true, force: true });
      for (const p of Object.values(PRODUCTS)) {
        mkdirSync(join(radar, p.dir), { recursive: true });
        for (const f of storeFiles(p)) copyFileSync(join(storeDir(p), f), join(radar, p.dir, f));
      }
      if (existsSync(join(MIRROR, 'img'))) cpSync(join(MIRROR, 'img'), join(radar, 'img', IMG_VERSION), { recursive: true, filter: imgCopyFilter });
      status.updatedAt = nowIso();
      if (lightning) status.lightning = lightning.status;
      writeFileSync(join(radar, 'status.json'), JSON.stringify(status, null, 2) + '\n');
      let roadOn = false;
      try { roadOn = !!road?.copyInto(ROOT); } catch (e) { log(`road: Einkopieren fehlgeschlagen (${e.message}) — road/ bleibt wie auf main`); }
      const paths = roadOn ? ['radar', 'road'] : ['radar'];
      git(['add', '-A', ...paths]);
      if (!git(['status', '--porcelain', ...paths])) { log('nichts zu committen'); return { pushedAt: nowIso(), noop: true }; }
      git(['commit', '--quiet', '-m', msg]);
      const t0 = Date.now();
      git(['push', '--quiet', REMOTE, `HEAD:${BRANCH}`]);
      return { pushedAt: nowIso(), pushMs: Date.now() - t0, attempt };
    } catch (e) {
      lastErr = e;
      log(`Push-Versuch ${attempt}/${PUSH_RETRIES} abgelehnt (${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? 'unbekannt'}) — neu aufsetzen`);
    }
  }
  throw lastErr;
}

/** Reserve für die Naht: wartet kein Lauf dieser Workflow-Datei, sich selbst auslösen. */
async function ensureSuccessor() {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY, wf = process.env.WORKFLOW_FILE;
  if (!token || !repo || !wf) { log('kein GITHUB_TOKEN/GITHUB_REPOSITORY/WORKFLOW_FILE — kein Selbst-Dispatch (lokal)'); return; }
  const h = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': UA };
  for (const st of ['queued', 'waiting', 'pending', 'requested']) {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf}/runs?status=${st}&per_page=5`, { headers: h });
    const j = r.ok ? await r.json() : { workflow_runs: [] };
    if ((j.workflow_runs ?? []).length) { log(`Nachfolger wartet (${st}: ${j.workflow_runs.length}) — kein Selbst-Dispatch`); return; }
  }
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf}/dispatches`, { method: 'POST', headers: h, body: JSON.stringify({ ref: BRANCH }) });
  log(r.status === 204 ? 'kein Nachfolger in der Warteschlange — Selbst-Dispatch ausgelöst' : `Selbst-Dispatch fehlgeschlagen: HTTP ${r.status}`);
}

function noteRow(row) {
  status.recent = [row, ...status.recent].slice(0, 24);
}

// ── RD3: INCA (GeoSphere) — leichter Metadaten-Poll, dann NetCDF holen und ableiten ──
const inca = { nextCheckAt: 0, lastReftime: '' };
async function pollInca() {
  if (!DERIVE || Date.now() < inca.nextCheckAt) return;
  inca.nextCheckAt = Date.now() + INCA_CHECK_SEC * 1000;
  let reftime;
  try {
    const r = await fetch(INCA_META_URL, { headers: { 'user-agent': UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    reftime = (await r.json()).last_forecast_reftime;
  } catch (e) { log(`inca metadata: ${e.message}`); return; }
  if (!reftime || reftime === inca.lastReftime) return;
  const ms = Date.parse(reftime);
  if (!Number.isFinite(ms)) { log(`inca: unlesbare reftime ${reftime}`); return; }
  const stamp = imgStampOf(new Date(ms));
  if (imgSlots('inca').includes(stamp)) { inca.lastReftime = reftime; return; }
  let dl;
  try { dl = await download(INCA_GRID_URL); } catch (e) { log(`inca grid: ${e.message} — nächster Versuch`); return; }
  const tmpIn = join(MIRROR, 'inca-latest.nc');
  writeFileSync(tmpIn, dl.buf);
  const d = derive('inca', tmpIn, stamp);
  if (!d) return;
  inca.lastReftime = reftime;
  const pub = publish(`radar: inca ${stamp}`);
  noteRow({ product: 'inca', stamp, reftime, bytes: dl.buf.length, downloadMs: dl.ms, deriveMs: d.ms, imgBytes: d.bytes, pushedAt: pub.pushedAt, pushMs: pub.pushMs ?? null });
  const lag = ((Date.parse(pub.pushedAt) - ms) / 60_000).toFixed(1);
  log(`inca ${stamp} · reftime→Push ${lag} min · NetCDF ${(dl.buf.length / 1024).toFixed(0)} KB · derive ${d.ms} ms → ${(d.bytes / 1024).toFixed(0)} KB · Push ${pub.pushedAt.slice(11, 19)}`);
  return true;
}

// ── RD3: rzc (MeteoSwiss) — STAC-Tagesitem mit ETag, Stempel aus dem Asset-Namen ──
const rzc = { nextCheckAt: 0, etags: new Map() };
function rzcStampFromName(name) {
  const m = /^rzc(\d{2})(\d{3})(\d{2})(\d{2})/.exec(name);
  if (!m) return null;
  const ms = Date.UTC(2000 + +m[1], 0, 1) + (+m[2] - 1) * 86_400_000 + (+m[3] * 60 + +m[4]) * 60_000;
  return imgStampOf(new Date(ms));
}
async function pollRzc() {
  if (!DERIVE || Date.now() < rzc.nextCheckAt) return;
  rzc.nextCheckAt = Date.now() + RZC_CHECK_SEC * 1000;
  const now = new Date();
  const day = `${now.getUTCFullYear()}${two(now.getUTCMonth() + 1)}${two(now.getUTCDate())}`;
  const url = RZC_STAC_ITEM(day);
  let item;
  try {
    const headers = { 'user-agent': UA };
    const etag = rzc.etags.get(url);
    if (etag) headers['if-none-match'] = etag;
    const r = await fetch(url, { headers });
    if (r.status === 304) return;
    if (!r.ok) { if (r.status !== 404) log(`rzc stac: HTTP ${r.status}`); return; } // kurz nach 0 UTC existiert das Tagesitem noch nicht
    rzc.etags.set(url, r.headers.get('etag'));
    item = await r.json();
  } catch (e) { log(`rzc stac: ${e.message}`); return; }
  const keys = Object.keys(item.assets ?? {}).filter((k) => k.startsWith('rzc')).sort();
  if (!keys.length) return;
  const name = keys[keys.length - 1];
  const stamp = rzcStampFromName(name);
  if (!stamp || imgSlots('rzc').includes(stamp)) return;
  let dl;
  try { dl = await download(item.assets[name].href); } catch (e) { log(`rzc ${name}: ${e.message} — nächster Versuch`); return; }
  const tmpIn = join(MIRROR, 'rzc-latest.h5');
  writeFileSync(tmpIn, dl.buf);
  const d = derive('rzc', tmpIn, stamp);
  if (!d) return;
  const pub = publish(`radar: rzc ${stamp}`);
  noteRow({ product: 'rzc', stamp, asset: name, bytes: dl.buf.length, downloadMs: dl.ms, deriveMs: d.ms, imgBytes: d.bytes, pushedAt: pub.pushedAt, pushMs: pub.pushMs ?? null });
  log(`rzc ${stamp} (${name}) · HDF5 ${(dl.buf.length / 1024).toFixed(0)} KB · derive ${d.ms} ms → ${(d.bytes / 1024).toFixed(0)} KB · Push ${pub.pushedAt.slice(11, 19)}`);
  return true;
}

async function main() {
  mkdirSync(MIRROR, { recursive: true });
  storeSeed();
  if (ROAD_HOOK && existsSync(ROAD_HOOK) && process.env.ROAD !== '0') {
    try {
      const m = await import(pathToFileURL(ROAD_HOOK).href);
      road = m.createRoadMirror({ appDir: APP_DIR, mirrorDir: MIRROR, log });
      road.seed(ROOT);
    } catch (e) { log(`road: Modul nicht ladbar (${e.message}) — Straßenwetter AUS`); road = null; }
  }
  // NP-0a: Blitz-Haken (E-NP0-2) — ohne APP_DIR, ohne Modul oder mit LIGHTNING=0 läuft der Spiegel wie vorher.
  if (LIGHTNING_ON && LIGHTNING_HOOK && existsSync(LIGHTNING_HOOK)) {
    try {
      const m = await import(pathToFileURL(LIGHTNING_HOOK).href);
      lightning = m.createLightningMirror({ appDir: APP_DIR, mirrorDir: MIRROR, log, quiet: rvQuiet });
      if (!lightning.enabled) lightning = null;
    } catch (e) { log(`lightning: Modul nicht ladbar (${e.message}) — Blitze AUS`); lightning = null; }
  }
  const deadline = Date.now() + RUN_MINUTES * 60_000;
  log(`Start · ${RUN_MINUTES} min · Abtastung ${POLL_SEC} s · Retention ${KEEP} · Rückblick ${PAST_ON ? PAST_KEEP : 'AUS'} · Blitze ${lightning ? 'an' : 'AUS'} · 250 m ${HD250_ON ? 'an' : 'AUS'} · derive ${DERIVE ? `an (${APP_DIR})` : 'AUS'} · Bestand ${Object.entries(PRODUCTS).map(([k, p]) => `${k}:${storeFiles(p).length}`).join(' ')} img ${['rv', 'inca', 'rzc', 'konrad3d', 'rv-past', ...LIGHTNING_DIRS].map((s) => `${s}:${imgSlots(s).length}`).join(' ')}`);

  // Je Produkt der nächste erwartete Slot: der jüngste, der NICHT im Bestand ist,
  // rückwärts höchstens KEEP Slots (nach der Naht liegen die älteren schon auf main).
  const pending = {};
  for (const [k, p] of Object.entries(PRODUCTS)) {
    // Nach dem Slot verglichen: ein Slot, der in der anderen Lieferform schon liegt, wird nicht nachgeholt.
    const have = new Set(storeFiles(p).map(slotKey));
    let slot = slotOf(Date.now());
    for (let i = 0; i < KEEP - 1; i++) {
      const prev = new Date(slot.getTime() - 300_000);
      if (have.has(slotKey(p.file(p.stamp(prev))))) break;
      slot = prev;
    }
    pending[k] = { slot, polls: 0 };
  }
  let lastPushAt = 0;
  let lightningDirtySince = 0;   // NP-0a: neue Blitz-Slots im Bestand, noch in keinem Push
  const loopStartedAt = Date.now();   // V-NP0-22: die 5-min-Frist des eigenen Blitz-Pushs zählt ab dem Jobstart, nicht ab 0

  while (true) {
    for (const [k, p] of Object.entries(PRODUCTS)) {
      const st = pending[k];
      const s = p.stamp(st.slot);
      const file = p.file(s);
      const h = await head(p.url(file));
      st.polls++;
      if (h.status !== 200) {
        // Ein Slot, der > 30 min alt ist und beim DWD FEHLT (404), wird übersprungen (Ausfall
        // beim DWD). Ältere Slots, die es gibt, werden nachgeholt — beim Erststart füllt das
        // die Retention (der DWD hält 48 h); nach der Naht liegt der Bestand schon auf main.
        if (h.status === 404 && Date.now() - st.slot.getTime() > 30 * 60_000) {
          log(`${k} ${file} beim DWD nicht vorhanden — übersprungen`);
          pending[k] = { slot: new Date(st.slot.getTime() + 300_000), polls: 0 };
        }
        continue;
      }
      const seenAt = nowIso();
      const dwdAt = h.lastModified ? new Date(h.lastModified).toISOString() : null;
      let dl;
      try { dl = await download(p.url(file)); } catch (e) { log(`${k} ${file}: ${e.message} — nächster Versuch`); continue; }
      storePut(p, file, dl.buf);
      const d = p.derive ? derive(p.derive, join(storeDir(p), file), p.imgStamp(st.slot, s)) : null;
      // Phase R250: die 250-m-Kacheln der Analyse (nur RV, nur mit Bild-Ablage) — vor dem Push, damit sie mitfahren.
      const hd = k === 'rv' && d ? deriveHd250(p.imgStamp(st.slot, s), join(storeDir(p), file)) : null;
      const pub = publish(`radar: ${file}`);
      lastPushAt = Date.now();
      const row = { product: k, file, slot: st.slot.toISOString(), dwdAt, seenAt, bytes: dl.buf.length, downloadMs: dl.ms, deriveMs: d?.ms ?? null, imgBytes: d?.bytes ?? null, hd250: hd ? { ms: hd.ms, bytes: hd.bytes, tiles: hd.tiles, sites: hd.sites, missing: hd.missing } : null, pushedAt: pub.pushedAt, pushMs: pub.pushMs ?? null, attempt: pub.attempt ?? null };
      noteRow(row);
      const lag = dwdAt ? ((Date.parse(pub.pushedAt) - Date.parse(dwdAt)) / 1000).toFixed(0) : '—';
      log(`${k} ${file} · DWD ${dwdAt?.slice(11, 19) ?? '?'} · gesehen ${seenAt.slice(11, 19)} (${st.polls}) · ${(dl.buf.length / 1024).toFixed(0)} KB in ${dl.ms} ms${d ? ` · derive ${d.ms} ms → ${(d.bytes / 1024).toFixed(0)} KB` : ''}${hd ? ` · hd250 ${hd.ms} ms → ${hd.tiles} Kacheln ${(hd.bytes / 1024).toFixed(0)} KB (${hd.sites}/17 Standorte)` : ''} · Push ${pub.pushedAt.slice(11, 19)}${pub.attempt > 1 ? ` (Versuch ${pub.attempt})` : ''} · DWD→Push ${lag} s`);
      pending[k] = { slot: new Date(st.slot.getTime() + 300_000), polls: 0 };
    }
    if (await pollInca()) lastPushAt = Date.now();
    if (await pollRzc()) lastPushAt = Date.now();
    if (road) {
      try {
        const msg = await road.poll();
        if (msg) { const pub = publish(msg); lastPushAt = Date.now(); log(`${msg} · Push ${pub.pushedAt.slice(11, 19)}${pub.noop ? ' (nichts neu)' : ''}`); }
      } catch (e) { log(`road: ${String(e.message ?? e).split('\n')[0]} — Radar läuft weiter`); }
    }
    // NP-0a: Blitze — poll() blockiert nie (Kindprozess asynchron); neue Slots fahren beim nächsten Push mit.
    if (lightning) {
      pendingRvSlotMs = pending.rv?.slot.getTime() ?? null;
      try {
        if (lightning.poll().changed) {
          for (const d of LIGHTNING_DIRS) imgPrune(d);
          if (!lightningDirtySince) lightningDirtySince = Date.now();
        }
        if (lightningDirtySince && lastPushAt >= lightningDirtySince) lightningDirtySince = 0;
        if (lightningDirtySince && Date.now() - Math.max(lastPushAt, loopStartedAt) >= LIGHTNING_SELF_PUSH_MS) {
          const pub = publish('radar: lightning');
          lastPushAt = Date.now();
          lightningDirtySince = 0;
          log(`lightning · eigener Push ${pub.pushedAt.slice(11, 19)}${pub.noop ? ' (nichts neu)' : ''} (5 min ohne Produkt-Push)`);
        }
      } catch (e) { log(`lightning: ${String(e.message ?? e).split('\n')[0]} — Radar läuft weiter`); }
    }
    // Ende: nach Ablauf der Laufzeit, aber möglichst direkt nach einem Push (Nachfolger hat dann ≈ 4,5 min).
    if (Date.now() >= deadline && (Date.now() - lastPushAt < 20_000 || Date.now() >= deadline + 5 * 60_000)) break;
    await sleep(POLL_SEC);
  }
  log('Laufzeit erreicht — Übergabe an den Nachfolger');
  await ensureSuccessor();
}

// NP-0a: als Modul importierbar (`verify:np0-radar` prüft `IMG_KEEP`/`imgSlotsToDrop`), als Skript startet main().
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
