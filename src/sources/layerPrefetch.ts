/**
 * LZ1/M3 (audit/layer-ladezeit.md §7): die Jetzt-Schritte der Layer, die ein
 * Nutzer nach dem Hero-Layer am ehesten anklickt, im Leerlauf vorab in den
 * HTTP-Cache holen. Die Bilder tragen `immutable` — der Klick danach findet
 * sie im Browser-Cache, und das erste Bild braucht nur noch Dekodieren und
 * Render (gemessen 15–60 ms statt 0,3–2,9 s). Nebenwirkung, die erwünscht ist:
 * jeder Abruf wärmt den CDN-Edge der Region für andere Nutzer.
 *
 * Kosten: ≈ 0,45 MB je Sitzung von jsDelivr (0 von Netlify). Nicht bei
 * `saveData`, nicht auf 2g/3g (`navigator.connection`, wo es sie gibt; Safari
 * kennt sie nicht ⇒ dort wird geladen), nicht ohne Index-Weg, nicht mit `?lz=0`.
 * Läuft mit `priority: 'low'` und erst, wenn der Aufrufer ihn anstößt (nach dem
 * ersten Bild des Hero-Layers, im Leerlauf) — LE2 hat gemessen, dass die
 * Priorität keine Bandbreite verteilt; die Reihenfolge muss der Aufrufer wahren.
 */
import { stepsForNowWindow } from './frameAtValidTime';
import { lzEnabled } from './loadTuning';
import {
  repackUsable, resolveRunFromRepackIndex, resolveRepackSection, stepUrl, stepUrlPinned,
  type RepackFamily, type RepackSection,
} from './repackSource';

/** Die Familien in Klick-Wahrscheinlichkeit (Dock-Reihenfolge, Nutzerpfad Wind → Böen → Gewitter). */
export const PREFETCH_FAMILIES: readonly RepackFamily[] = ['gust', 'thunder', 'rotation', 'snowDepth', 'lightningfc'];

interface ConnectionLike { saveData?: boolean; effectiveType?: string }

/** Rein: darf unter dieser Verbindung vorgeladen werden? */
export function prefetchAllowed(conn: ConnectionLike | undefined | null): boolean {
  if (!conn) return true;                       // Safari/Firefox: keine Auskunft ⇒ laden
  if (conn.saveData) return false;
  const et = conn.effectiveType;
  return !(et === 'slow-2g' || et === '2g' || et === '3g');
}

/** Rein: die Dateien einer Familie für das Jetzt-Fenster. */
export function prefetchFilesFor(section: RepackSection, family: RepackFamily, steps: number[], runAt: Date, nowMs: number = Date.now()): string[] {
  const fam = section[family] as { steps?: { step: number; file: string }[] } | undefined;
  if (!fam?.steps) return [];
  // `stepsForNowWindow` liest die Uhr selbst (`Date.now()`); ein verschobener
  // `runAt` stellt dieselbe Vorlaufstunde her, die `nowMs` meint — im Betrieb
  // (nowMs = jetzt) ist das der echte `runAt`, im Verifier eine gestellte Zeit.
  const wanted = stepsForNowWindow(steps, new Date(runAt.getTime() + (Date.now() - nowMs)), 0);
  return wanted
    .map((s) => fam.steps!.find((e) => e.step === s)?.file)
    .filter((f): f is string => typeof f === 'string');
}

let started = false;

/**
 * Einmal je Dokument. `skip` nennt Familien, die schon geladen sind (der
 * Aufrufer kennt seine Refs). Fehler sind still — ein Prefetch ist nur ein
 * Angebot an den Cache, nie eine Bedingung.
 */
export async function prefetchNowLayers(skip: ReadonlySet<RepackFamily> = new Set(), signal?: AbortSignal): Promise<number> {
  if (started) return 0;
  started = true;
  if (!lzEnabled() || !repackUsable() || typeof fetch !== 'function') return 0;
  const conn = (navigator as Navigator & { connection?: ConnectionLike }).connection;
  if (!prefetchAllowed(conn)) return 0;
  let n = 0;
  for (const family of PREFETCH_FAMILIES) {
    if (signal?.aborted) break;
    if (skip.has(family)) continue;
    try {
      const run = await resolveRunFromRepackIndex(family, signal);
      if (!run) continue;
      const wanted = stepsForNowWindow(run.steps, run.runAt, 0);
      const section = await resolveRepackSection(run.runStr, family, null, wanted);
      if (!section) continue;
      for (const file of prefetchFilesFor(section, family, run.steps, run.runAt)) {
        if (signal?.aborted) break;
        let res = await fetch(stepUrl(section, file), { priority: 'low', cache: 'default', signal });
        if (res.status === 404) res = await fetch(stepUrlPinned(section, file), { priority: 'low', cache: 'default', signal });
        if (!res.ok) continue;
        await res.arrayBuffer();   // erst der gelesene Körper macht den Cache-Eintrag vollständig
        n++;
      }
    } catch {
      // still — s. Kopfkommentar
    }
  }
  return n;
}

/** Nur für Verifier. */
export function resetPrefetchState(): void { started = false; }
