#!/usr/bin/env node
/**
 * Phase DK — DMI forecasts for the Danish spots of Seewetter (`audit/seewetter-daenemark.md`):
 *
 *   water level  storm surge model DKSS, parameter `sea-mean-deviation`, at the point the catalogue names
 *                (`dk.wl.from === 'dmi'` — spots without a BSH gauge with a curve nearby)
 *   wind         HARMONIE DINI at the spot's water cell, only where the point cube does not reach (`dk.wind === 'dmi'`)
 *
 * → ONE file `sea/v1/dmi/<YYYYMMDDHHmm>.json` (`seaDmi.ts`) and the pointer `status.dmi`. Host `opendataapi.dmi.dk`,
 * EDR `/position` only (never `/grib`), no API key. Requests run one after another with a pause; 429 ("Server is busy"),
 * 5xx and network errors are retried `tries` times. A spot whose answer is missing, empty or outside the value lock
 * goes to `failed` with DMI's own reason — the page then says "keine Daten" there; nothing old is carried over.
 * Nothing is written when the result equals the last file, and nothing at all when not one spot answered.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/sea-dmi.mjs --store=<sea/v1 working copy>
 *     [--force]   ask DMI even if the last file is younger than SEA_DMI_REFRESH_MS   [--now=<iso>]
 * Kill switch: SEA_KILL=1 (nothing asked, nothing written). Last stdout line = JSON summary.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seaCellCentre } from '../../src/sea/seaContract.ts';
import {
  DMI_HOST, DMI_LICENCE, DMI_CREDIT, DMI_TERMS_URL, DMI_WL_PARAM, DMI_WL_REFERENCE, DMI_WIND_COLLECTION, DMI_WIND_PARAMS,
  SEA_DMI_PRODUCT, SEA_DMI_DIR, SEA_DMI_RE, SEA_DMI_KEPT, SEA_DMI_REFRESH_MS,
  dmiPositionUrl, dmiWlEntry, dmiWindEntry, seaDmiPath, seaDmiStamp, seaDmiProblems, dmiPointerOf, DmiAnswerError,
} from '../../src/sea/seaDmi.ts';
import { readCatalog, readStatus, writeStatus, writeAtomic } from './sea-derive.mjs';
import { readFileSync } from 'node:fs';

const SELF = fileURLToPath(import.meta.url);
const UA = 'buscosun-sea (buscosun.com Seewetter, hourly point queries)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One EDR answer as JSON. Retries 429, 5xx and network errors; a body that is DMI's own error document is returned as
 * it is (the parser names it). `pauseMs` before every request keeps the producer far below what made DMI answer 429 in
 * the step-0 measurement (≈ 40 requests in a minute).
 */
export async function fetchDmi(url, { fetchImpl = fetch, tries = 3, pauseMs = 1500, backoffMs = (a) => 8000 * a, log = () => {} } = {}) {
  let last = null;
  for (let a = 1; a <= tries; a++) {
    if (pauseMs) await sleep(pauseMs);
    try {
      const r = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      if (r.status !== 429 && r.status < 500) return { status: r.status, json };
      last = { status: r.status, json };
      log(`DMI ${r.status} (Versuch ${a}/${tries})`);
    } catch (e) {
      last = { status: 0, json: null, error: String(e?.message ?? e).split('\n')[0] };
      log(`DMI nicht erreichbar: ${last.error} (Versuch ${a}/${tries})`);
    }
    if (a < tries) await sleep(backoffMs(a));
  }
  return last;
}

/** Why a spot has no entry: the transport failure first (it explains the missing body), then DMI's own words, then the parser's. */
const reason = (res, e) => (res?.error ? `nicht erreichbar: ${res.error}`
  : res && res.json == null && res.status ? `DMI HTTP ${res.status} ohne lesbaren Körper`
    : e instanceof DmiAnswerError ? e.message : String(e?.message ?? e).split('\n')[0]);

/** Asks DMI for every Danish spot that needs it. Pure with respect to the store. */
export async function collectDmi({ spots, nowMs, fetchImpl = fetch, log = () => {}, pauseMs, tries, backoffMs }) {
  const opts = { fetchImpl, log, ...(pauseMs != null ? { pauseMs } : {}), ...(tries != null ? { tries } : {}), ...(backoffMs ? { backoffMs } : {}) };
  const wl = {}, wind = {}, failed = [];
  for (const sp of spots) {
    if (sp.country !== 'DK' || !sp.dk) continue;
    if (sp.dk.wl?.from === 'dmi') {
      let res = null;
      try {
        res = await fetchDmi(dmiPositionUrl(sp.dk.wl.coll, sp.dk.wl.lat, sp.dk.wl.lon, [DMI_WL_PARAM]), opts);
        wl[sp.id] = dmiWlEntry(res?.json, sp.dk.wl.coll, sp);
      } catch (e) { failed.push({ id: sp.id, what: 'wl', error: reason(res, e) }); }
    }
    if (sp.dk.wind === 'dmi') {
      const p = seaCellCentre('cwam', sp.cell.i, sp.cell.j);
      let res = null;
      try {
        res = await fetchDmi(dmiPositionUrl(DMI_WIND_COLLECTION, +p.lat.toFixed(5), +p.lon.toFixed(5), DMI_WIND_PARAMS), opts);
        wind[sp.id] = dmiWindEntry(res?.json, sp);
      } catch (e) { failed.push({ id: sp.id, what: 'wind', error: reason(res, e) }); }
    }
  }
  const stamp = seaDmiStamp(nowMs);
  const doc = {
    schema: 1, product: SEA_DMI_PRODUCT, stamp, builtAt: new Date(nowMs).toISOString(),
    source: `${DMI_HOST}/v1/forecastedr`, licence: DMI_LICENCE, credit: DMI_CREDIT, terms: DMI_TERMS_URL,
    wl: { param: DMI_WL_PARAM, unit: 'cm', reference: DMI_WL_REFERENCE, spots: wl },
    wind: { collection: DMI_WIND_COLLECTION, unit: '0.1 m/s', spots: wind },
    failed,
  };
  // Value lock per entry: an entry outside the rules is taken out and named (the rest of the file stays).
  for (const kind of ['wl', 'wind']) for (const id of Object.keys(doc[kind].spots)) {
    const one = { ...doc, wl: { ...doc.wl, spots: kind === 'wl' ? { [id]: doc.wl.spots[id] } : {} }, wind: { ...doc.wind, spots: kind === 'wind' ? { [id]: doc.wind.spots[id] } : {} } };
    const pr = seaDmiProblems(one);
    if (pr.length) { delete doc[kind].spots[id]; failed.push({ id, what: kind, error: `Werteprüfung: ${pr[0]}` }); }
  }
  return doc;
}

const content = (d) => JSON.stringify({ wl: d?.wl?.spots ?? null, wind: d?.wind?.spots ?? null, failed: d?.failed ?? null });

export function pruneDmi(storeDir, keep = SEA_DMI_KEPT) {
  const dir = join(storeDir, SEA_DMI_DIR);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => SEA_DMI_RE.test(f)).sort();
  const removed = files.slice(0, Math.max(0, files.length - keep));
  for (const f of removed) rmSync(join(dir, f), { force: true });
  return removed;
}

export async function buildDmi({ storeDir, nowMs = Date.now(), force = false, fetchImpl = fetch, log = () => {}, killed = process.env.SEA_KILL === '1', pauseMs, tries, backoffMs }) {
  if (killed) return { built: false, reason: 'Kill-Schalter SEA_KILL=1' };
  const cat = readCatalog(storeDir);
  const spots = (cat?.spots ?? []).filter((s) => s.country === 'DK' && (s.dk?.wl?.from === 'dmi' || s.dk?.wind === 'dmi'));
  if (!spots.length) return { built: false, reason: 'kein dänischer Spot im Katalog, der DMI braucht' };
  const st = readStatus(storeDir);
  const ptr = dmiPointerOf(st);
  if (!force && ptr && nowMs - Date.parse(ptr.builtAt) < SEA_DMI_REFRESH_MS) return { built: false, reason: `letzte Datei ${ptr.stamp} jünger als ${SEA_DMI_REFRESH_MS / 60_000} min` };
  const doc = await collectDmi({ spots, nowMs, fetchImpl, log, pauseMs, tries, backoffMs });
  const got = Object.keys(doc.wl.spots).length + Object.keys(doc.wind.spots).length;
  // Not one answer: the store stays as it is (the last file ages and is no longer shown after SEA_DMI_STALE_MS).
  if (!got) throw new Error(`DMI lieferte für keinen Spot: ${doc.failed.map((f) => `${f.id} ${f.what}: ${f.error}`).slice(0, 3).join(' | ')}`);
  const problems = seaDmiProblems(doc);
  if (problems.length) throw new Error(`sea-dmi verletzt die Werteprüfung: ${problems.slice(0, 3).join('; ')}`);
  let prev = null;
  if (ptr) { try { prev = JSON.parse(readFileSync(join(storeDir, ptr.path), 'utf8')); } catch { prev = null; } }
  if (prev && content(prev) === content(doc)) return { built: false, reason: `unverändert gegenüber ${ptr.stamp}`, wl: Object.keys(doc.wl.spots).length, wind: Object.keys(doc.wind.spots).length, failed: doc.failed.length };
  const path = seaDmiPath(doc.stamp);
  const text = JSON.stringify(doc) + '\n';
  writeAtomic(join(storeDir, path), text);
  st.dmi = { stamp: doc.stamp, path, builtAt: doc.builtAt, wl: Object.keys(doc.wl.spots).length, wind: Object.keys(doc.wind.spots).length, failed: doc.failed.length, bytes: Buffer.byteLength(text) };
  const removed = pruneDmi(storeDir);
  writeStatus(storeDir, st, nowMs);
  log(`DMI ${doc.stamp}: Wasserstand an ${st.dmi.wl}, Wind an ${st.dmi.wind} Spots, ${doc.failed.length} ohne Antwort, ${st.dmi.bytes} B`);
  return { built: true, stamp: doc.stamp, path, wl: st.dmi.wl, wind: st.dmi.wind, failed: doc.failed, bytes: st.dmi.bytes, removed };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const log = (m) => console.log(`[sea-dmi] ${m}`);
  const res = await buildDmi({ storeDir: resolve(String(args.store ?? 'sea/v1')), nowMs: typeof args.now === 'string' ? Date.parse(args.now) : Date.now(), force: !!args.force, log });
  if (!res.built) log(`nichts geschrieben: ${res.reason}`);
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) await main();
