/**
 * Phase RN-3 (audit/radar-nur-datenrepo.md §9, E-RN-6, Jan 18.11.2026) — the ICON-D2 layers that have images in the data
 * repo read them from there ONLY: wind, temperature, gusts, thunderstorm potential, rotation, lightning forecast, snow
 * (precipitation since RN-2, `iconD2Precip.ts`).
 *
 * Before, every miss on the repo way ended at the DWD: the run from `/latest-grib.json` or the directory listing
 * (`/_dwd_opendata`), the fields as GRIB (`/_dwd_grib`, `/_dwd_wind` — 1–3 files of 1–2 MB per step). Now the run comes from
 * the repo's index, the frames are its images, and a failure is REPEATED instead of handed to the DWD: every file once more
 * on raw.githubusercontent (`repackSource.ts`, RN-2), the run/section lookup and every missing image up to `D2_REPO_TRIES`
 * times with the pauses of `D2_REPO_RETRY_MS`. After that a named error (`IconD2NotInRepo`); the map asks again a minute
 * later (`MapView`).
 *
 * Named fallback (Rule 2): `?d2dwd=1` / `localStorage.d2dwd = '1'` is the chain as before (precipitation: `?precipdwd=1`).
 * The switches that take the repo's index away (`?repack=0`, `?repackidx=0`, `?repackrun=0`) keep meaning that chain too.
 * What it costs, named: the run is the newest REPACKED one, and with both hosts down the layer has no data until a later
 * attempt succeeds.
 */

import {
  repackEnabled, repackIndexEnabled, repackRunEnabled, repackStatus, retryRepackNow, preconnectDataCdn,
  resolveRunFromRepackIndex, resolveRepackSection,
  type RepackFamily, type RepackIndexRun, type RepackSection,
} from './repackSource';

/** Default of both switches (`d2dwd`, `precipdwd`): the DWD way is off. */
export const D2_DWD_DEFAULT = false;

/** The explicit switch alone: `?<key>=0|1` beats `localStorage.<key>` (D-31); without a vote `D2_DWD_DEFAULT`. */
export function dwdFlagFrom(key: string, search: string, stored: string | null): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(key); } catch { /* kaputte Query = kein Votum */ }
  if (q === '1') return true;
  if (q === '0') return false;
  return stored === '1' ? true : stored === '0' ? false : D2_DWD_DEFAULT;
}

/**
 * May a reader ask the DWD? With its switch, without a browser (Node, verifiers), or when the repo's index way is switched
 * off. `key` = `d2dwd` (the layers of RN-3) or `precipdwd` (RN-2).
 */
export function dwdDirect(key: string): boolean {
  if (typeof window === 'undefined') return true;
  let stored: string | null = null;
  try { stored = window.localStorage?.getItem(key) ?? null; } catch { /* wie repackEnabled */ }
  let flag = D2_DWD_DEFAULT;
  try { flag = dwdFlagFrom(key, window.location.search, stored); } catch { /* Vorgabe */ }
  return flag || !repackEnabled() || !repackIndexEnabled() || !repackRunEnabled();
}
export function d2DwdDirect(): boolean { return dwdDirect('d2dwd'); }

/** Attempts of one lookup or one image on the repo way, and the pauses between them. set. */
export const D2_REPO_TRIES = 3;
export const D2_REPO_RETRY_MS: readonly number[] = [3_000, 8_000];

/** The layer is not readable from the data repo right now (after all attempts). Never thrown with the DWD way on. */
export class IconD2NotInRepo extends Error {}

const abortErr = (signal?: AbortSignal): unknown => signal?.reason ?? new DOMException('Aborted', 'AbortError');

export function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(abortErr(signal)); return; }
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(abortErr(signal)); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface RepoRun { runStr: string; runAt: Date; wanted: number[]; section: RepackSection }

/**
 * The newest run of `family` and its section — from the repo's index alone (no manifest, no DWD listing). `pick` chooses the
 * steps this caller loads. `unusable` may refuse a run (wind: it no longer covers „now") — that is no transport failure, so
 * it is not repeated. Throws `IconD2NotInRepo` after `D2_REPO_TRIES` attempts.
 */
export async function resolveRepoRun(
  family: RepackFamily,
  label: string,
  pick: (steps: number[], runAt: Date) => number[],
  signal?: AbortSignal,
  unusable?: (run: RepackIndexRun) => string | null,
): Promise<RepoRun> {
  preconnectDataCdn();
  let why = 'unbekannt';
  for (let i = 0; i < D2_REPO_TRIES; i++) {
    if (i > 0) await pause(D2_REPO_RETRY_MS[Math.min(i - 1, D2_REPO_RETRY_MS.length - 1)], signal);
    // No GRIB way behind this caller: a closed latch (another layer just failed) is opened instead of waited out, and a
    // failed index answer is forgotten instead of kept for its 60 s.
    if (i > 0 || repackStatus().broken) retryRepackNow();
    const run = await resolveRunFromRepackIndex(family, signal);
    if (signal?.aborted) throw abortErr(signal);
    if (run) {
      const bad = unusable?.(run);
      if (bad) throw new IconD2NotInRepo(`ICON-D2 ${label}: ${bad} (Lauf ${run.runStr})`);
      const wanted = pick(run.steps, run.runAt);
      if (wanted.length === 0) throw new Error(`ICON-D2 ${label}: keine Schritte im Horizont`);
      const section = await resolveRepackSection(run.runStr, family, null, wanted);
      if (signal?.aborted) throw abortErr(signal);
      if (section) return { runStr: run.runStr, runAt: run.runAt, wanted, section };
      why = `kein Abschnitt für Lauf ${run.runStr}`;
    } else {
      why = 'Index des Daten-Repos nicht lesbar oder ohne Lauf';
    }
    if (typeof console !== 'undefined' && i < D2_REPO_TRIES - 1) {
      console.info(`[repack] ${label}: Versuch ${i + 1}/${D2_REPO_TRIES} ohne Ergebnis (${why}) → noch einmal aus dem Daten-Repo.`);
    }
  }
  throw new IconD2NotInRepo(`ICON-D2 ${label}: nach ${D2_REPO_TRIES} Versuchen nicht aus dem Daten-Repo lesbar (${why})`);
}

/**
 * Loads `steps` through `loadOne` (true = the frame is in) with at most `conc` in flight. With `retryLabel` — the repo-only
 * readers — a step that brought nothing is asked again in up to `D2_REPO_TRIES` rounds (pause, latch opened), because there
 * is no GRIB behind it. Without it: one round, as the loaders did before RN-3. Returns the steps that are still missing.
 */
export async function pumpSteps(
  steps: readonly number[],
  loadOne: (step: number) => Promise<boolean>,
  conc: number,
  signal?: AbortSignal,
  retryLabel?: string,
): Promise<number[]> {
  let todo: number[] = [...steps];
  for (let round = 0; ; round++) {
    const list = todo;
    const missing: number[] = [];
    let ptr = 0;
    await Promise.all(Array.from({ length: Math.min(conc, list.length) }, async () => {
      while (ptr < list.length) {
        if (signal?.aborted) return;
        const step = list[ptr++];
        if (!(await loadOne(step))) missing.push(step);
      }
    }));
    if (!retryLabel || missing.length === 0 || signal?.aborted || round >= D2_REPO_TRIES - 1) return missing;
    if (typeof console !== 'undefined') {
      console.info(`[repack] ${retryLabel}: ${missing.length} Bild(er) nicht geladen (${repackStatus().reason || 'unbekannt'}) → noch einmal aus dem Daten-Repo.`);
    }
    try { await pause(D2_REPO_RETRY_MS[Math.min(round, D2_REPO_RETRY_MS.length - 1)], signal); } catch { return missing; }
    retryRepackNow();
    todo = missing.sort((a, b) => a - b);
  }
}
