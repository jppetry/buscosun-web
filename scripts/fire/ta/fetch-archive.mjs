/**
 * TA1 — FIRMS-SP-Archiv für die Persistenzmaske vervollständigen.
 *
 * Die AF4-Pipeline (`pairs-from-archive.mjs`) hat nur März–Oktober geholt (Brandsaison).
 * Dauerquellen (Stahl, Raffinerien, MVA) laufen ganzjährig — für eine Jahresmaske müssen
 * die Wintermonate nachgeholt werden. Dieses Skript füllt den **selben** Cache
 * (`.cache/firms-archive/<SRC>-<YYYY-MM-DD>.csv`, 5-Tage-Chunks) mit den fehlenden
 * Chunks; vorhandene Dateien werden nie neu geladen. `pairs-from-archive.mjs` bleibt
 * unberührt (es liest aus demselben Cache und filtert weiterhin `type ≠ 0`).
 *
 *   node scripts/fire/ta/fetch-archive.mjs [--years 2020-2026] [--months 1-12]
 *        [--sources VIIRS_SNPP_SP,VIIRS_NOAA20_SP] [--cache .cache/firms-archive]
 *
 * Schlüssel: `FIRMS_MAP_KEY` (Env) oder `.cache/firms-archive/mapkey.txt` — nie im Repo,
 * in jeder Ausgabe als `<KEY>` maskiert. Prod-Proxy `/_firms` unangetastet.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const range = (s) => { const [a, b] = s.split('-').map(Number); return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i); };
const YEARS = range(argVal('--years', '2020-2026'));
const MONTHS = range(argVal('--months', '1-12'));
const SOURCES = argVal('--sources', 'VIIRS_SNPP_SP,VIIRS_NOAA20_SP').split(',');
const CACHE = argVal('--cache', '.cache/firms-archive');
const KEY_FILE = argVal('--key-file', join(CACHE, 'mapkey.txt'));
const KEY = process.env.FIRMS_MAP_KEY || (existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8').trim() : '');

const D = 86_400_000;
const DACH = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 };
const FIRMS_ORIGIN = 'https://firms.modaps.eosdis.nasa.gov';
const CHUNK_DAYS = 5;
const PAUSE_MS = 400;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stats = { requests: 0, cached: 0, retries: 0, skippedAvailability: 0, empty: 0 };

async function fetchText(url, cacheFile) {
  if (cacheFile && existsSync(cacheFile)) { stats.cached++; return readFileSync(cacheFile, 'utf8'); }
  const shown = url.replace(KEY, '<KEY>');
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      stats.requests++;
      const res = await fetch(url, { headers: { 'user-agent': 'buscosun-ta1-archive/1 (+https://buscosun.com)' } });
      if (res.status === 401 || res.status === 403) throw new Error(`HTTP ${res.status} — Schlüssel abgelehnt (${shown})`);
      // 400 kommt transient (gemessen 2024-11-01: erst 400, Wiederholung 200) — wie 429/5xx wiederholen.
      if (res.status === 400 || res.status === 429 || res.status >= 500) { stats.retries++; await sleep(2000 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${shown}`);
      const text = await res.text();
      if (cacheFile) { mkdirSync(dirname(cacheFile), { recursive: true }); writeFileSync(cacheFile, text); }
      await sleep(PAUSE_MS);
      return text;
    } catch (e) {
      if (attempt === 3 || /Schlüssel abgelehnt/.test(String(e))) throw e;
      stats.retries++; await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error(`aufgegeben: ${shown}`);
}

async function loadAvailability() {
  const text = await fetchText(`${FIRMS_ORIGIN}/api/data_availability/csv/${KEY}/ALL`, join(CACHE, 'availability.csv'));
  const out = {};
  for (const line of text.split(/\r?\n/).slice(1)) { const [id, min, max] = line.split(','); if (id) out[id.trim()] = { min: min?.trim(), max: max?.trim() }; }
  return out;
}

async function main() {
  if (!KEY) { console.error(`FIRMS_MAP_KEY fehlt (Env-Var oder ${KEY_FILE}).`); process.exit(2); }
  if (!/^[0-9a-z]{32}$/.test(KEY)) { console.error('FIRMS_MAP_KEY hat nicht die erwartete Form (32 Zeichen [0-9a-z]).'); process.exit(2); }
  mkdirSync(CACHE, { recursive: true });
  const availability = await loadAvailability();
  const bbox = `${DACH.west},${DACH.south},${DACH.east},${DACH.north}`;
  const planned = [];
  for (const year of YEARS) {
    const start = Date.UTC(year, MONTHS[0] - 1, 1);
    const endExcl = MONTHS[MONTHS.length - 1] === 12 ? Date.UTC(year + 1, 0, 1) : Date.UTC(year, MONTHS[MONTHS.length - 1], 1);
    for (const src of SOURCES) {
      const av = availability[src];
      const avMin = av?.min ? Date.parse(`${av.min}T00:00:00Z`) : -Infinity;
      const avMax = av?.max ? Date.parse(`${av.max}T00:00:00Z`) + D : Infinity;
      // Chunk-Raster identisch zu pairs-from-archive.mjs (Start am 1. des ersten Monats, 5-Tage-Schritte).
      for (let t = start; t < endExcl; t += CHUNK_DAYS * D) {
        if (t + CHUNK_DAYS * D <= avMin || t >= avMax) { stats.skippedAvailability++; continue; }
        planned.push({ src, day: isoDay(t) });
      }
    }
  }
  const missing = planned.filter((p) => !existsSync(join(CACHE, `${p.src}-${p.day}.csv`)));
  console.log(`Verfügbarkeit: ${SOURCES.map((s) => `${s} ${availability[s]?.min}…${availability[s]?.max}`).join(' · ')}`);
  console.log(`geplant ${planned.length} Chunks, davon fehlen ${missing.length} (≈ ${Math.round(missing.length * (PAUSE_MS + 600) / 60000)} min)`);
  let done = 0;
  for (const p of missing) {
    const url = `${FIRMS_ORIGIN}/api/area/csv/${KEY}/${p.src}/${bbox}/${CHUNK_DAYS}/${p.day}`;
    const text = await fetchText(url, join(CACHE, `${p.src}-${p.day}.csv`));
    if (!/^\s*latitude/i.test(text)) { stats.empty++; console.warn(`  ${p.src} ${p.day}: keine CSV (${text.slice(0, 80).replace(/\s+/g, ' ')})`); }
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${missing.length} … (Retries ${stats.retries})`);
  }
  console.log(`fertig: Abfragen ${stats.requests}, Cache ${stats.cached}, Retries ${stats.retries}, ohne CSV ${stats.empty}, außerhalb Verfügbarkeit ${stats.skippedAvailability}`);
}

main().catch((e) => { console.error(String(e?.message ?? e).replace(KEY, '<KEY>')); process.exit(1); });
