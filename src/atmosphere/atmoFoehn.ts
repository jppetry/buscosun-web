/**
 * Cross-Alpine pressure difference for the foehn index: ICON-D2 PMSL at the station pairs Lugano–Zürich and
 * Bozen–Innsbruck from `atmo/v1/<run>/foehn.json` (model values, nearest cell). `null` + reason when no run with the
 * file covers the hour — the panel then names the gap.
 */
import { FOEHN_PAIRS, foehnPath, runMs, type AtmoFoehnFile } from './atmoContract';
import { fetchTileBytes, loadAtmoIndex } from './atmoSounding';
import type { FoehnPressure } from './foehn';

const fileCache = new Map<string, Promise<AtmoFoehnFile>>();

function loadFoehnFile(run: string, signal?: AbortSignal): Promise<AtmoFoehnFile> {
  let p = fileCache.get(run);
  if (!p) {
    p = fetchTileBytes(foehnPath(run), signal).then((b) => JSON.parse(new TextDecoder().decode(b)) as AtmoFoehnFile);
    p.catch(() => fileCache.delete(run));
    fileCache.set(run, p);
  }
  return p;
}

/** Δp (south − north, hPa) of both pairs at `validMs`; `relevant` = the pair nearer to `lon` (west: CH, east: Brenner). */
export async function loadFoehnPressure(validMs: number, lon: number, signal?: AbortSignal): Promise<{ pressure: FoehnPressure | null; reason: string | null }> {
  try {
    const index = await loadAtmoIndex(signal);
    const hourMs = Math.round(validMs / 3_600_000) * 3_600_000;
    const run = [...index.runs].filter((r) => r.foehn).sort((a, b) => runMs(b.run) - runMs(a.run))
      .find((r) => { const s = (hourMs - runMs(r.run)) / 3_600_000; return s >= 0 && s <= 48; });
    if (!run) return { pressure: null, reason: 'kein Lauf mit Bodendruck deckt diese Stunde' };
    const f = await loadFoehnFile(run.run, signal);
    const s = f.steps.indexOf((hourMs - runMs(run.run)) / 3_600_000);
    if (s < 0) return { pressure: null, reason: 'Stunde fehlt im Lauf' };
    const pairs = FOEHN_PAIRS.map((pr) => {
      const a = f.pmsl[pr.south]?.[s], b = f.pmsl[pr.north]?.[s];
      return { id: pr.id, label: pr.label, dpHpa: a == null || b == null ? null : Math.round((a - b) * 10) / 10 };
    });
    return { pressure: { runAtMs: runMs(run.run), pairs, relevant: lon < 10 ? 'ch' : 'brenner' }, reason: null };
  } catch (e) {
    if (signal?.aborted) throw e;
    return { pressure: null, reason: e instanceof Error ? e.message : String(e) };
  }
}
