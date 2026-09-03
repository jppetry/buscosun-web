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
 *
 * Lizenz: DWD/GeoSphere/MeteoSwiss OpenData, CC BY 4.0 (Attribution im Client unverändert).
 *
 * Lokal gegen ein Bare-Repo:  REMOTE=/pfad/zu/bare.git APP_DIR=/pfad/zu/buscosun-web \
 *   RUN_MINUTES=6 node radar-mirror.mjs   (im Arbeitsverzeichnis eines Klons des Remotes)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, copyFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
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

const INCA_CHECK_SEC = Number(process.env.INCA_CHECK_SEC ?? 45); // Rate-Limit 240/h ⇒ ≥ 15 s
const RZC_CHECK_SEC = Number(process.env.RZC_CHECK_SEC ?? 30);
const INCA_META_URL = 'https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km/metadata';
const INCA_GRID_URL = 'https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km?parameters=rr&output_format=netcdf&bbox=45.51,8.11,49.47,17.73';
const RZC_STAC_ITEM = (day) => `https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip/items/${day}-ch`;

const PRODUCTS = {
  rv: {
    dir: 'rv',
    stamp: (d) => two(d.getUTCFullYear() % 100) + two(d.getUTCMonth() + 1) + two(d.getUTCDate()) + two(d.getUTCHours()) + two(d.getUTCMinutes()),
    file: (s) => `DE1200_RV${s}.tar.bz2`,
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
function storeFiles(p) { return existsSync(storeDir(p)) ? readdirSync(storeDir(p)).filter((f) => !f.startsWith('.')).sort() : []; }
function storePut(p, file, buf) {
  mkdirSync(storeDir(p), { recursive: true });
  writeFileSync(join(storeDir(p), file), buf);
  const files = storeFiles(p);
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) rmSync(join(storeDir(p), f));
}

// ── Bild-Bestand (RD3): je Quelle Slot-VERZEICHNISSE `img/<quelle>/<stempel>/` ──
function imgSrcDir(source) { return join(MIRROR, 'img', source); }
function imgSlots(source) { return existsSync(imgSrcDir(source)) ? readdirSync(imgSrcDir(source)).filter((f) => !f.startsWith('.') && !f.includes('.tmp-')).sort() : []; }
function imgPrune(source) {
  const slots = imgSlots(source);
  for (const s of slots.slice(0, Math.max(0, slots.length - KEEP))) rmSync(join(imgSrcDir(source), s), { recursive: true, force: true });
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
    return { ms: Date.now() - t0, files: j.files, bytes: j.bytes };
  } catch (e) {
    log(`derive ${source} ${stamp}: FEHLGESCHLAGEN (${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? 'unbekannt'}) — Slot ohne Bild-Ablage`);
    rmSync(outDir, { recursive: true, force: true });
    return null;
  }
}

/** Beim Start: was `main` schon hat, in den Bestand übernehmen (Nachfolger-Job nach der Naht). */
function storeSeed() {
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
    cpSync(img, join(MIRROR, 'img'), { recursive: true, force: false });
    for (const source of readdirSync(join(MIRROR, 'img'))) imgPrune(source);
  }
}

const status = {
  schema: 2, keep: KEEP, pollSec: POLL_SEC, derive: DERIVE,
  job: process.env.GITHUB_RUN_ID ?? 'local', startedAt: nowIso(), recent: [],
};

/** `radar/` im Klon = exakt der lokale Bestand; dann commit + push, neu aufgesetzt auf origin/BRANCH. */
function publish(msg) {
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
      if (existsSync(join(MIRROR, 'img'))) cpSync(join(MIRROR, 'img'), join(radar, 'img', IMG_VERSION), { recursive: true });
      status.updatedAt = nowIso();
      writeFileSync(join(radar, 'status.json'), JSON.stringify(status, null, 2) + '\n');
      git(['add', '-A', 'radar']);
      if (!git(['status', '--porcelain', 'radar'])) { log('nichts zu committen'); return { pushedAt: nowIso(), noop: true }; }
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
  const deadline = Date.now() + RUN_MINUTES * 60_000;
  log(`Start · ${RUN_MINUTES} min · Abtastung ${POLL_SEC} s · Retention ${KEEP} · derive ${DERIVE ? `an (${APP_DIR})` : 'AUS'} · Bestand ${Object.entries(PRODUCTS).map(([k, p]) => `${k}:${storeFiles(p).length}`).join(' ')} img ${['rv', 'inca', 'rzc', 'konrad3d'].map((s) => `${s}:${imgSlots(s).length}`).join(' ')}`);

  // Je Produkt der nächste erwartete Slot: der jüngste, der NICHT im Bestand ist,
  // rückwärts höchstens KEEP Slots (nach der Naht liegen die älteren schon auf main).
  const pending = {};
  for (const [k, p] of Object.entries(PRODUCTS)) {
    const have = new Set(storeFiles(p));
    let slot = slotOf(Date.now());
    for (let i = 0; i < KEEP - 1; i++) {
      const prev = new Date(slot.getTime() - 300_000);
      if (have.has(p.file(p.stamp(prev)))) break;
      slot = prev;
    }
    pending[k] = { slot, polls: 0 };
  }
  let lastPushAt = 0;

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
      const pub = publish(`radar: ${file}`);
      lastPushAt = Date.now();
      const row = { product: k, file, slot: st.slot.toISOString(), dwdAt, seenAt, bytes: dl.buf.length, downloadMs: dl.ms, deriveMs: d?.ms ?? null, imgBytes: d?.bytes ?? null, pushedAt: pub.pushedAt, pushMs: pub.pushMs ?? null, attempt: pub.attempt ?? null };
      noteRow(row);
      const lag = dwdAt ? ((Date.parse(pub.pushedAt) - Date.parse(dwdAt)) / 1000).toFixed(0) : '—';
      log(`${k} ${file} · DWD ${dwdAt?.slice(11, 19) ?? '?'} · gesehen ${seenAt.slice(11, 19)} (${st.polls}) · ${(dl.buf.length / 1024).toFixed(0)} KB in ${dl.ms} ms${d ? ` · derive ${d.ms} ms → ${(d.bytes / 1024).toFixed(0)} KB` : ''} · Push ${pub.pushedAt.slice(11, 19)}${pub.attempt > 1 ? ` (Versuch ${pub.attempt})` : ''} · DWD→Push ${lag} s`);
      pending[k] = { slot: new Date(st.slot.getTime() + 300_000), polls: 0 };
    }
    if (await pollInca()) lastPushAt = Date.now();
    if (await pollRzc()) lastPushAt = Date.now();
    // Ende: nach Ablauf der Laufzeit, aber möglichst direkt nach einem Push (Nachfolger hat dann ≈ 4,5 min).
    if (Date.now() >= deadline && (Date.now() - lastPushAt < 20_000 || Date.now() >= deadline + 5 * 60_000)) break;
    await sleep(POLL_SEC);
  }
  log('Laufzeit erreicht — Übergabe an den Nachfolger');
  await ensureSuccessor();
}

main().catch((e) => { console.error(e); process.exit(1); });
