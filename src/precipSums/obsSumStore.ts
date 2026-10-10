/**
 * Phase NS: Leser der Stationsmessungen `buscosun-data/obs/v1` für die Niederschlagssummen (Katalog, `latest.json`,
 * 10-min-Reihen je Netz). Eigener schmaler Leser statt `sources/obsStore.ts` der Phase OF (liegt auf dem Zweig
 * `fusion-12`, nicht auf `main`): gleiche Wege — raw.githubusercontent zuerst (die Dateien werden alle paar Minuten neu
 * geschrieben, am CDN fast immer MISS), jsDelivr als Absicherung nach `OBS_SUM_HEDGE_MS`, harte Frist, kurzes Gedächtnis.
 *
 * Größen (gemessen 08.10.2026, gz): Katalog 88 KB, latest 50 KB, Reihen dwd10 534 KB · tawes 389 KB · smn 243 KB ·
 * smnp 7 KB — die Reihen lädt nur, wer ein Fenster 3/6/12 h oder die Karte am Ort ansieht.
 */

import type { ObsCatalogStation, ObsLatestStation, ObsSeriesDoc } from './obsWindowSum';
import { loadObsCatalog as loadFusionObsCatalog, loadObsLatest as loadFusionObsLatest } from '../sources/obsStore';   // Phase PF (M6)

export const DATA_RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';
export const DATA_CDN = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main';
export const OBS_SUM_DIR = 'obs/v1';
export const OBS_SUM_HEDGE_MS = 2_500;
export const OBS_SUM_DEADLINE_MS = 10_000;
const MEMO_MS: Record<string, number> = { catalog: 6 * 3_600_000, latest: 120_000, series: 300_000, field: 600_000, fieldIndex: 300_000 };

const memo = new Map<string, { at: number; p: Promise<unknown> }>();

function abortErr(): Error { return new DOMException('aborted', 'AbortError'); }

/**
 * Eine Datei des Daten-Repos (Pfad ab der Wurzel): raw zuerst, CDN nach der Absicherungsfrist oder sofort bei Fehler; die
 * erste gültige Antwort gewinnt (jsDelivr antwortet für dieses Repo zeitweise 403 „Package size exceeded", V-FI-5).
 */
export function fetchDataRepo(path: string, as: 'json' | 'bytes', signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const urls = [`${DATA_RAW}/${path}`, `${DATA_CDN}/${path}`];
  const acs = urls.map(() => new AbortController());
  return new Promise((resolve, reject) => {
    let done = false, failed = 0, started = 0;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      acs.forEach((a) => a.abort());
      signal?.removeEventListener('abort', onAbort);
      fn();
    };
    const onAbort = () => finish(() => reject(abortErr()));
    if (signal?.aborted) { reject(abortErr()); return; }
    signal?.addEventListener('abort', onAbort);
    timers.push(setTimeout(() => finish(() => reject(new Error(`obs: Frist ${OBS_SUM_DEADLINE_MS} ms für ${path}`))), OBS_SUM_DEADLINE_MS));
    const start = (i: number) => {
      if (done || i >= urls.length || i < started) return;
      started = i + 1;
      fetchImpl(urls[i], { signal: acs[i].signal })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return as === 'json' ? r.json() : r.arrayBuffer().then((b) => new Uint8Array(b)); })
        .then((j) => finish(() => resolve(j)))
        .catch((e) => {
          if (done) return;
          failed++;
          if (started < urls.length) start(started);
          else if (failed >= urls.length) finish(() => reject(e instanceof Error ? e : new Error(String(e))));
        });
    };
    start(0);
    timers.push(setTimeout(() => start(1), OBS_SUM_HEDGE_MS));
  });
}

export function memoized<T>(key: string, kind: keyof typeof MEMO_MS, load: () => Promise<T>): Promise<T> {
  const m = memo.get(key);
  if (m && Date.now() - m.at < MEMO_MS[kind]) return m.p as Promise<T>;
  const p = load();
  memo.set(key, { at: Date.now(), p });
  p.catch(() => { if (memo.get(key)?.p === p) memo.delete(key); });
  return p;
}

// Die Netz-Abrufe laufen ohne das Signal des Aufrufers (ein Abbruch durch den Ortswechsel soll das Gedächtnis nicht vergiften).
/**
 * Phase PF (M6, audit/performance-2026-10-10.md): catalogue and newest values come from the memoised reader of buscosun Fusion
 * (`sources/obsStore.ts`, same two files, same product) instead of a second download — measured 10.10.2026 on the Regenradar:
 * both readers fetched `stations.json` + `latest.json` (2 × 138 KB gz). The JSON is the same; the Fusion reader normalises
 * `name`/`elev`/`networks`/`vars` of a station, which this reader never uses for a sum. The sums' own files (`series/`) and
 * fields keep `fetchDataRepo`.
 */
export function loadObsCatalog(): Promise<ObsCatalogStation[]> {
  return memoized('catalog', 'catalog', async () => {
    const c = await loadFusionObsCatalog();
    return c.stations.filter((s) => s && typeof s.id === 'string' && Number.isFinite(s.lat) && Number.isFinite(s.lon));
  });
}

export function loadObsLatest(): Promise<{ builtAt: string; stations: Record<string, ObsLatestStation> }> {
  return memoized('latest', 'latest', async () => {
    const l = await loadFusionObsLatest();
    return { builtAt: l.builtAt, stations: l.stations as Record<string, ObsLatestStation> };
  });
}

export function loadObsSeries(src: string): Promise<ObsSeriesDoc> {
  return memoized(`series:${src}`, 'series', async () => {
    const j = await fetchDataRepo(`${OBS_SUM_DIR}/series/${src}.json`, 'json') as ObsSeriesDoc;
    if (j?.schema !== 1 || j.kind !== 'obs/series' || !j.stations || typeof j.t0 !== 'string') throw new Error(`obs: Reihe ${src} unbekannt`);
    return j;
  });
}

/** Mit dem Signal des Aufrufers abbrechbar, ohne den gemeinsamen Abruf abzubrechen. */
export function withSignal<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) { reject(abortErr()); return; }
    const on = () => reject(abortErr());
    signal.addEventListener('abort', on, { once: true });
    p.then((v) => { signal.removeEventListener('abort', on); resolve(v); }, (e) => { signal.removeEventListener('abort', on); reject(e); });
  });
}
