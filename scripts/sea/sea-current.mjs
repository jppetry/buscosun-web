#!/usr/bin/env node
/**
 * Phase ST — surface current at the spots of Seewetter (`audit/seewetter-stroemung.md`): one BSH run (packages `db`
 * Deutsche Bucht and `wb` Westliche Ostsee, GRIB2 uncompressed, 15 min, three days) →
 *
 *   sea/v1/current/<run>.json          per spot: hourly speed (cm/s) and "sets towards" (deg), slack-water times from the
 *                                      15-min steps, the model cell and its distance (`src/sea/seaCurrent.ts`)
 *   sea/v1/current/<run>/f/<hhh>.png   thinned hourly field for the map layer "Strömung" (90 × 55 cells, sampled)
 *   status.json → `current`            pointer to the newest run, like the wind refresh
 *
 * Reads over HTTPS from the BSH filebox (the public share the BSH page links to, WebDAV `PROPFIND` + `GET`); FTP through
 * `curl` is the named fallback. The files are JPEG-2000-packed (template 5.40) — read by `bshGrib.mjs` / `jp2k.mjs`,
 * never by the shared client decoder.
 *
 * Due: only when the clock allows a newer run than the published one (`SEA_CURRENT_GATE_MS`), and then only a run whose
 * files have not changed for `SEA_CURRENT_SETTLE_MS` and that both packages carry with the same day files. A run that
 * cannot be read counts a try (`status.currentTry`), ends the step red and is tried `SEA_CURRENT_MAX_TRIES` times. Nothing
 * is carried over from an older run: what the BSH did not deliver is "keine Daten" on the page.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/sea-current.mjs --store=<sea/v1 working copy>
 *     [--force]          also build when the clock says nothing new can be there, and a run already published
 *     [--files=<dir>]    read the day files from a local directory instead of the BSH (measurement, verifier)
 *     [--now=<iso>]
 * Kill switch: SEA_KILL=1 (nothing asked, nothing written). Last stdout line = JSON summary.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SEA_MODELS, SEA_CURRENT_DIR, SEA_CURRENT_ORIGIN, SEA_CURRENT_RE, seaCurrentPath, seaCurrentFieldPath, seaRunMs } from '../../src/sea/seaContract.ts';
import {
  BSH_CURRENT_CHANGED, BSH_CURRENT_CREDIT, BSH_CURRENT_FILEBOX, BSH_CURRENT_FILE_RE, BSH_CURRENT_FTP, BSH_CURRENT_LICENCE, BSH_CURRENT_PACKAGES, BSH_CURRENT_PKGS,
  BSH_CURRENT_STEP_MS, BSH_CURRENT_ZERO_MS, SEA_CURRENT_FIELD, SEA_CURRENT_KEPT, SEA_CURRENT_MAX_CELL_KM, SEA_CURRENT_MAX_DRY_SHARE, SEA_CURRENT_MAX_TRIES,
  SEA_CURRENT_MODEL_NOTE, SEA_CURRENT_PRODUCT, SEA_CURRENT_SETTLE_MS, bshGridProblems, bshIndexOfCwam, currentDistKm, currentExpectedRun, currentFieldCell,
  currentFlow, currentFlowAt, currentPointerOf, encodeCurrent, encodeCurrentPixel, seaCurrentDead, seaCurrentProblems, slackTimes,
} from '../../src/sea/seaCurrent.ts';
import { bshMessages, bshField, BshGribError } from './bshGrib.mjs';
import { encodePng } from '../lib/png.mjs';
import { readCatalog, readStatus, writeStatus, writeAtomic } from './sea-derive.mjs';

const SELF = fileURLToPath(import.meta.url);
const H = 3_600_000;
const UA = 'buscosun-sea (buscosun.com Seewetter, two runs a day)';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// --- listings -----------------------------------------------------------------------------------------------------

/** WebDAV multistatus of a filebox directory → the uncompressed day files with size and modification time. */
export function parseFilebox(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)) {
    const name = /<d:href>[^<]*\/([^/<]+)<\/d:href>/.exec(m[1])?.[1];
    if (!name || !BSH_CURRENT_FILE_RE.test(name)) continue;
    const size = Number(/<d:getcontentlength>(\d+)<\/d:getcontentlength>/.exec(m[1])?.[1]);
    const mtimeMs = Date.parse(/<d:getlastmodified>([^<]+)<\/d:getlastmodified>/.exec(m[1])?.[1] ?? '');
    if (Number.isFinite(size) && Number.isFinite(mtimeMs)) out.push({ name, size, mtimeMs });
  }
  return out;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** FTP `LIST` lines (UTC, measured against `MDTM`) → the same entries. The year is the latest one not in the future. */
export function parseFtp(text, nowMs) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^-\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d\d):(\d\d)\s+(\S+)$/.exec(line.trim());
    if (!m || !BSH_CURRENT_FILE_RE.test(m[6])) continue;
    const mon = MONTHS.indexOf(m[2]);
    let y = new Date(nowMs).getUTCFullYear();
    let mtimeMs = Date.UTC(y, mon, +m[3], +m[4], +m[5]);
    if (mtimeMs > nowMs + 24 * H) mtimeMs = Date.UTC(--y, mon, +m[3], +m[4], +m[5]);
    out.push({ name: m[6], size: Number(m[1]), mtimeMs });
  }
  return out;
}

// --- sources ------------------------------------------------------------------------------------------------------

export function fileboxSource({ fetchImpl = fetch, base = BSH_CURRENT_FILEBOX } = {}) {
  return {
    name: 'filebox', base,
    async list(pkg) {
      const r = await fetchImpl(`${base}/${BSH_CURRENT_PACKAGES[pkg].dir}/`, { method: 'PROPFIND', headers: { depth: '1', 'user-agent': UA }, signal: AbortSignal.timeout(90_000) });
      if (r.status !== 207 && !r.ok) throw new Error(`Filebox-Verzeichnis ${BSH_CURRENT_PACKAGES[pkg].dir}: HTTP ${r.status}`);
      return parseFilebox(await r.text()).filter((f) => BSH_CURRENT_FILE_RE.exec(f.name)[1] === pkg);
    },
    async get(pkg, name) {
      const r = await fetchImpl(`${base}/${BSH_CURRENT_PACKAGES[pkg].dir}/${name}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(600_000) });
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
  };
}
const curl = (args, opts = {}) => new Promise((res, rej) => execFile('curl', ['-sS', '--fail', ...args], { maxBuffer: 4 << 20, ...opts }, (e, out, err) => (e ? rej(new Error(`curl: ${String(err || e.message).trim().split('\n')[0]}`)) : res(out))));
export function ftpSource({ exec = curl, base = BSH_CURRENT_FTP, nowMs = () => Date.now() } = {}) {
  return {
    name: 'ftp', base,
    async list(pkg) {
      const text = await exec(['--max-time', '90', `${base}/${BSH_CURRENT_PACKAGES[pkg].dir}/`]);
      return parseFtp(text, nowMs()).filter((f) => BSH_CURRENT_FILE_RE.exec(f.name)[1] === pkg);
    },
    async get(pkg, name) {
      const dir = mkdtempSync(join(tmpdir(), 'sea-current-')), file = join(dir, name);
      try { await exec(['--max-time', '600', '-o', file, `${base}/${BSH_CURRENT_PACKAGES[pkg].dir}/${name}`]); return new Uint8Array(readFileSync(file)); }
      finally { rmSync(dir, { recursive: true, force: true }); }
    },
  };
}
/** Day files in a local directory (measurement and verifier): the modification time is the file's own. */
export function dirSource(dir) {
  return {
    name: 'dir', base: dir,
    async list(pkg) { return readdirSync(dir).filter((f) => BSH_CURRENT_FILE_RE.exec(f)?.[1] === pkg).map((name) => { const s = statSync(join(dir, name)); return { name, size: s.size, mtimeMs: s.mtimeMs }; }); },
    async get(_pkg, name) { return new Uint8Array(readFileSync(join(dir, name))); },
  };
}

// --- which run ----------------------------------------------------------------------------------------------------

/**
 * The newest run both packages carry with the same, gap-free day files, all of them settled. Returns `{ run: null,
 * reason }` when there is none (yet) — that is "not due", not a failure.
 */
export function pickRun(listing, nowMs) {
  const byRun = (files) => { const m = new Map(); for (const f of files) { const [, , run, day] = BSH_CURRENT_FILE_RE.exec(f.name); (m.get(run) ?? m.set(run, []).get(run)).push({ ...f, day }); } return m; };
  const db = byRun(listing.db ?? []), wb = byRun(listing.wb ?? []);
  const runs = [...new Set([...db.keys(), ...wb.keys()])].sort().reverse();
  if (!runs.length) return { run: null, reason: 'keine Tagesdatei im Verzeichnis' };
  let reason = '';
  for (const run of runs) {
    const a = (db.get(run) ?? []).sort((x, y) => (x.day < y.day ? -1 : 1)), b = (wb.get(run) ?? []).sort((x, y) => (x.day < y.day ? -1 : 1));
    const days = a.map((f) => f.day);
    if (!a.length || !b.length || days.join() !== b.map((f) => f.day).join()) { reason ||= `${run}: db ${a.map((f) => f.day).join('/') || '–'}, wb ${b.map((f) => f.day).join('/') || '–'} — Tagesdateien der beiden Pakete verschieden`; continue; }
    if (days.some((d, i) => i > 0 && +d !== +days[i - 1] + 1)) { reason ||= `${run}: Tagesdateien ${days.join('/')} nicht lückenlos`; continue; }
    if ([...a, ...b].some((f) => !(f.size > 0))) { reason ||= `${run}: leere Datei`; continue; }
    const newest = Math.max(...[...a, ...b].map((f) => f.mtimeMs));
    if (nowMs - newest < SEA_CURRENT_SETTLE_MS) { reason ||= `${run}: zuletzt geändert vor ${Math.round((nowMs - newest) / 1000)} s — noch nicht zur Ruhe gekommen`; continue; }
    return { run, days, files: { db: a, wb: b }, settledAt: new Date(newest).toISOString() };
  }
  return { run: null, reason };
}

// --- reading a run ------------------------------------------------------------------------------------------------

/** Candidate cells of a spot in one package: water cells of the mask within `SEA_CURRENT_MAX_CELL_KM`, nearest first. */
function candidates(pkg, water, sp) {
  const g = SEA_MODELS.cwam.grid, p = BSH_CURRENT_PACKAGES[pkg];
  const i0 = Math.round((sp.lon - g.lon1) / g.di), j0 = Math.round((g.lat1 - sp.lat) / g.dj);
  const out = [];
  // 3 km are ≤ 4 cells in either direction (cells ≈ 0.90 × 0.93 km) — one more as margin.
  for (let j = j0 - 5; j <= j0 + 5; j++) for (let i = i0 - 5; i <= i0 + 5; i++) {
    const k = bshIndexOfCwam(pkg, i, j);
    if (k < 0 || !water[k]) continue;
    const km = currentDistKm(sp.lat, sp.lon, g.lat1 - j * g.dj, g.lon1 + i * g.di);
    if (km <= SEA_CURRENT_MAX_CELL_KM) out.push({ pkg, i, j, k, km, col0: p.col0 });
  }
  return out.sort((a, b) => a.km - b.km);
}

/**
 * All day files of one package → the 15-min series at the candidate cells and the thinned hourly pixels.
 * `hourly(tMs)` returns the RGBA buffer of that hour's field (or null when no field is wanted).
 */
function readPackage(pkg, buffers, spots, hourly, log) {
  let grid = null, water = null, points = 0, slots = null, series = null;
  const cand = new Map();          // spot id → candidates
  const steps = [];                // valid times as they complete
  const pending = new Map();       // t → { u?, v? }
  const fx = SEA_CURRENT_FIELD, thin = [];
  for (const raw of buffers) {
    for (const m of bshMessages(raw)) {
      const f = bshField(raw, m.offset, m.length);
      if (f.discipline !== 10 || f.cat !== 1 || (f.num !== 2 && f.num !== 3)) throw new BshGribError(`BSH-GRIB: Größe ${f.discipline}/${f.cat}/${f.num} (erwartet u und v der Strömung, 10/1/2 und 10/1/3)`);
      if (!grid) {
        const pr = bshGridProblems(pkg, f.grid);
        if (pr.length) throw new BshGribError(`BSH-GRIB: fremdes Gitter — ${pr.join('; ')}`);
        grid = f.grid; points = f.pack.n;
        water = new Uint8Array(f.values.length);
        for (let k = 0; k < water.length; k++) water[k] = Number.isNaN(f.values[k]) ? 0 : 1;
        slots = new Map();
        for (const sp of spots) { const c = candidates(pkg, water, sp); cand.set(sp.id, c); for (const x of c) if (!slots.has(x.k)) slots.set(x.k, slots.size); }
        series = { u: [], v: [] };
        for (let y = 0; y < fx.ny; y++) for (let x = 0; x < fx.nx; x++) { const c = currentFieldCell(x, y), k = bshIndexOfCwam(pkg, c.i, c.j); if (k >= 0 && water[k]) thin.push([(y * fx.nx + x) * 4, k]); }
      } else if (f.grid.ni !== grid.ni || f.grid.nj !== grid.nj || f.pack.n !== points) throw new BshGribError('BSH-GRIB: Gitter oder Maske wechselt innerhalb des Laufs');
      const e = pending.get(f.t) ?? {};
      const key = f.num === 2 ? 'u' : 'v';
      if (e[key]) throw new BshGribError(`BSH-GRIB: ${key} für ${new Date(f.t).toISOString()} doppelt`);
      e[key] = f.values;
      if (!e.u || !e.v) { pending.set(f.t, e); continue; }
      pending.delete(f.t);
      const su = new Float32Array(slots.size), sv = new Float32Array(slots.size);
      for (const [k, s] of slots) { su[s] = e.u[k]; sv[s] = e.v[k]; }
      steps.push(f.t); series.u.push(su); series.v.push(sv);
      const img = f.t % H === 0 ? hourly(f.t) : null;
      if (img) for (const [o, k] of thin) if (img[o + 3] === 0) encodeCurrentPixel(img, o, currentFlow(e.u[k], e.v[k]));
    }
  }
  if (pending.size) throw new BshGribError(`BSH-GRIB: ${pending.size} Zeitschritte mit nur einer der beiden Komponenten`);
  const order = steps.map((t, i) => i).sort((a, b) => steps[a] - steps[b]);
  const t = order.map((i) => steps[i]);
  if (t.some((x, i) => i > 0 && x - t[i - 1] !== BSH_CURRENT_STEP_MS)) throw new BshGribError('BSH-GRIB: Zeitachse nicht lückenlos im 15-min-Takt');
  log(`${pkg}: ${t.length} Zeitschritte ${new Date(t[0]).toISOString()} … ${new Date(t[t.length - 1]).toISOString()}, ${points} Wasserpunkte, ${slots.size} Zellen für ${spots.length} Spots`);
  return { pkg, t, u: order.map((i) => series.u[i]), v: order.map((i) => series.v[i]), slots, cand };
}

/**
 * One run from its day files (`buffers.db`, `buffers.wb`, day order) → the spot entries, the axis and the field PNGs.
 * Pure with respect to the store; throws `BshGribError` for a run this reader refuses.
 */
export function readRun({ buffers, spots, field = true, log = () => {} }) {
  const fx = SEA_CURRENT_FIELD, imgs = new Map();
  const hourly = field ? (tMs) => imgs.get(tMs) ?? imgs.set(tMs, new Uint8Array(fx.nx * fx.ny * 4)).get(tMs) : () => null;
  const pk = {};
  for (const pkg of BSH_CURRENT_PKGS) pk[pkg] = readPackage(pkg, buffers[pkg], spots, hourly, log);
  const t = pk.db.t;
  if (t.length !== pk.wb.t.length || t.some((x, i) => x !== pk.wb.t[i])) throw new BshGribError('BSH-GRIB: die Pakete db und wb tragen verschiedene Zeitachsen');
  const hoursIdx = t.map((x, i) => (x % H === 0 ? i : -1)).filter((i) => i >= 0);
  if (!hoursIdx.length) throw new BshGribError('BSH-GRIB: keine volle Stunde in der Zeitachse');
  const t0 = t[hoursIdx[0]];
  const out = {}, failed = [];
  for (const sp of spots) {
    const all = [...pk.db.cand.get(sp.id), ...pk.wb.cand.get(sp.id)].sort((a, b) => a.km - b.km || (a.pkg < b.pkg ? -1 : 1));
    let pick = null, nearestDry = null;
    for (const c of all) {
      const p = pk[c.pkg], s = p.slots.get(c.k);
      let dry = 0;
      const cu = Float64Array.from(t, (_, i) => p.u[i][s]), cv = Float64Array.from(t, (_, i) => p.v[i][s]);
      for (let i = 0; i < t.length; i++) if (!currentFlowAt(cu, cv, i)) dry++;
      const share = dry / t.length;
      nearestDry ??= share;
      if (share <= SEA_CURRENT_MAX_DRY_SHARE) { pick = { ...c, s, dry: share }; break; }
    }
    if (!pick) { failed.push({ id: sp.id, error: all.length ? `keine Zelle mit Strömung im Umkreis von ${SEA_CURRENT_MAX_CELL_KM} km (nächste Wasserzelle in ${Math.round(nearestDry * 100)} % der Schritte ohne)` : `keine Wasserzelle des Modells im Umkreis von ${SEA_CURRENT_MAX_CELL_KM} km` }); continue; }
    const p = pk[pick.pkg];
    const u = Float64Array.from(t, (_, i) => p.u[i][pick.s]), v = Float64Array.from(t, (_, i) => p.v[i][pick.s]);
    const cur = [], curTo = [];
    for (const i of hoursIdx) { const e = encodeCurrent(currentFlowAt(u, v, i)); cur.push(e.cur); curTo.push(e.curTo); }
    out[sp.id] = {
      pkg: pick.pkg, cell: [pick.i, pick.j], km: +pick.km.toFixed(2), dry: +pick.dry.toFixed(3), cur, curTo,
      slack: slackTimes(t, u, v).map((ms) => Math.round((ms - t0) / 60_000)),
    };
  }
  const pngs = field ? hoursIdx.map((i) => { const img = imgs.get(t[i]); return img ? encodePng(fx.nx, fx.ny, img, 4) : null; }) : [];
  if (field && pngs.some((p) => !p)) throw new BshGribError('BSH-GRIB: Stunde ohne Feld');
  return { t0, hours: hoursIdx.length, steps: t.length, first: t[0], last: t[t.length - 1], spots: out, failed, pngs };
}

// --- store --------------------------------------------------------------------------------------------------------

export function pruneCurrent(storeDir, keep = SEA_CURRENT_KEPT) {
  const dir = join(storeDir, SEA_CURRENT_DIR);
  if (!existsSync(dir)) return [];
  const runs = readdirSync(dir).filter((f) => SEA_CURRENT_RE.test(f)).map((f) => f.slice(0, 10)).sort();
  const gone = new Set(runs.slice(0, Math.max(0, runs.length - keep)));
  const removed = [];
  for (const f of readdirSync(dir)) {
    const run = /^(\d{10})(\.json)?$/.exec(f)?.[1];
    // A field directory without its file (a build that died half-way) goes too.
    if (run && (gone.has(run) || !runs.includes(run))) { rmSync(join(dir, f), { recursive: true, force: true }); removed.push(f); }
  }
  return removed;
}

export async function buildCurrent({ storeDir, nowMs = Date.now(), force = false, sources = [fileboxSource(), ftpSource()], field = true, log = () => {}, killed = process.env.SEA_KILL === '1' }) {
  if (killed) return { built: false, reason: 'Kill-Schalter SEA_KILL=1' };
  const cat = readCatalog(storeDir);
  if (!cat?.spots?.length) throw new Error('Spotkatalog fehlt im Speicher');
  const st = readStatus(storeDir);
  const ptr = currentPointerOf(st), expected = currentExpectedRun(nowMs);
  if (!force && ptr && ptr.run >= expected) return { built: false, reason: `Lauf ${ptr.run} ist der neueste, der nach der Uhr beim BSH liegen kann` };
  const tr = st.currentTry;
  if (!force && tr && tr.run >= expected && tr.n >= SEA_CURRENT_MAX_TRIES) return { built: false, reason: `Lauf ${tr.run} nach ${tr.n} Versuchen aufgegeben (${tr.error}) — wartet auf den nächsten Lauf` };
  // Listing: the first source that answers decides.
  let src = null, pick = null, listErr = [];
  for (const s of sources) {
    try { const listing = { db: await s.list('db'), wb: await s.list('wb') }; src = s; pick = pickRun(listing, nowMs); break; }
    catch (e) { listErr.push(`${s.name}: ${String(e?.message ?? e).split('\n')[0]}`); log(`Verzeichnis über ${s.name} nicht lesbar: ${listErr[listErr.length - 1]}`); }
  }
  if (!src) throw new Error(`BSH-Verzeichnis nicht lesbar — ${listErr.join(' | ')}`);
  if (!pick.run) return { built: false, reason: `kein vollständiger Lauf beim BSH (${pick.reason})`, via: src.name };
  if (!force && ptr && pick.run <= ptr.run) return { built: false, reason: `beim BSH liegt ${pick.run}, veröffentlicht ist ${ptr.run}`, via: src.name };
  if (seaCurrentDead(pick.run, nowMs)) return { built: false, reason: `der neueste Lauf beim BSH (${pick.run}) ist älter als 30 Stunden`, via: src.name };
  if (!force && tr && tr.run === pick.run && tr.n >= SEA_CURRENT_MAX_TRIES) return { built: false, reason: `Lauf ${tr.run} nach ${tr.n} Versuchen aufgegeben (${tr.error})`, via: src.name };
  const started = Date.now();
  try {
    const buffers = { db: [], wb: [] }, files = [];
    for (const pkg of BSH_CURRENT_PKGS) for (const f of pick.files[pkg]) {
      const b = await src.get(pkg, f.name);
      if (b.length !== f.size) throw new Error(`${f.name}: ${b.length} B geladen, ${f.size} B im Verzeichnis`);
      buffers[pkg].push(b); files.push({ name: f.name, bytes: b.length, sha256: sha256(b) });
    }
    const dlS = Math.round((Date.now() - started) / 1000);
    const r = readRun({ buffers, spots: cat.spots, field, log });
    if (!Object.keys(r.spots).length) throw new Error(`kein Spot mit Strömung — ${r.failed[0]?.error ?? 'Grund unbekannt'}`);
    const fieldBytes = r.pngs.reduce((a, p) => a + p.length, 0);
    const doc = {
      schema: 1, product: SEA_CURRENT_PRODUCT, run: pick.run, builtAt: new Date(nowMs).toISOString(), t0: r.t0, hours: r.hours, stepMin: 15,
      source: `${src.base} (BSH, Pakete db und wb, GRIB2)`, via: src.name, licence: BSH_CURRENT_LICENCE, credit: BSH_CURRENT_CREDIT, note: SEA_CURRENT_MODEL_NOTE, changed: BSH_CURRENT_CHANGED,
      units: { cur: 'cm/s', curTo: 'deg (sets towards)', slack: 'min after t0' }, origin: SEA_CURRENT_ORIGIN,
      rule: { zeroBelowMs: BSH_CURRENT_ZERO_MS, maxCellKm: SEA_CURRENT_MAX_CELL_KM, maxDryShare: SEA_CURRENT_MAX_DRY_SHARE },
      bsh: { settledAt: pick.settledAt, days: pick.days, steps: r.steps, first: new Date(r.first).toISOString(), last: new Date(r.last).toISOString() },
      files, spots: r.spots, failed: r.failed,
      field: field ? { hours: r.hours, nx: SEA_CURRENT_FIELD.nx, ny: SEA_CURRENT_FIELD.ny, stride: SEA_CURRENT_FIELD.stride, off: SEA_CURRENT_FIELD.off, bytes: fieldBytes } : null,
    };
    const problems = seaCurrentProblems(doc);
    if (problems.length) throw new Error(`sea-current verletzt die Werteprüfung: ${problems.slice(0, 3).join('; ')}`);
    // Field first, the file after it, the pointer last — a reader never follows a pointer into a half-written run.
    rmSync(join(storeDir, SEA_CURRENT_DIR, pick.run), { recursive: true, force: true });
    r.pngs.forEach((png, h) => writeAtomic(join(storeDir, seaCurrentFieldPath(pick.run, h)), png));
    const text = JSON.stringify(doc) + '\n', path = seaCurrentPath(pick.run);
    writeAtomic(join(storeDir, path), text);
    const st2 = readStatus(storeDir);
    st2.current = { run: pick.run, path, builtAt: doc.builtAt, t0: doc.t0, hours: doc.hours, spots: Object.keys(doc.spots).length, failed: doc.failed.length, field: !!doc.field, via: src.name, bytes: Buffer.byteLength(text), fieldBytes, buildS: Math.round((Date.now() - started) / 1000) };
    delete st2.currentTry;
    const removed = pruneCurrent(storeDir);
    writeStatus(storeDir, st2, nowMs);
    log(`Strömung ${pick.run} über ${src.name}: ${st2.current.spots} Spots, ${doc.failed.length} ohne Zelle, ${doc.hours} h ab ${new Date(doc.t0).toISOString()}, Datei ${st2.current.bytes} B, Feld ${fieldBytes} B in ${r.pngs.length} Bildern, Abruf ${dlS} s, gesamt ${st2.current.buildS} s`);
    return { built: true, run: pick.run, via: src.name, path, spots: st2.current.spots, failed: doc.failed, hours: doc.hours, bytes: st2.current.bytes, fieldBytes, downloadMB: +(files.reduce((a, f) => a + f.bytes, 0) / 1e6).toFixed(1), buildS: st2.current.buildS, removed };
  } catch (e) {
    const st2 = readStatus(storeDir);
    const n = st2.currentTry?.run === pick.run ? st2.currentTry.n + 1 : 1;
    st2.currentTry = { run: pick.run, n, error: String(e?.message ?? e).split('\n')[0].slice(0, 300), at: new Date(nowMs).toISOString() };
    writeStatus(storeDir, st2, nowMs);
    throw new Error(`Strömung ${pick.run} nicht gebaut (Versuch ${n}/${SEA_CURRENT_MAX_TRIES}): ${st2.currentTry.error}`);
  }
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const log = (m) => console.log(`[sea-current] ${m}`);
  const res = await buildCurrent({
    storeDir: resolve(String(args.store ?? 'sea/v1')), nowMs: typeof args.now === 'string' ? Date.parse(args.now) : Date.now(), force: !!args.force,
    ...(typeof args.files === 'string' ? { sources: [dirSource(resolve(args.files))] } : {}), log,
  });
  if (!res.built) log(`nichts geschrieben: ${res.reason}`);
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) await main();
