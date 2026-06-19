/**
 * 3D-Globus · Client für den GFS-Worker. Verwaltet einen Singleton-Worker und
 * gibt pro Anfrage ein Promise zurück. Der Aufrufer (GlobeMap) ignoriert
 * veraltete Resultate selbst (Request-Token), darum kein Abort im Worker nötig.
 */

import type { GfsRun, GlobeSel, GlobeRaw } from './gfs';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./gfsWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const { kind, id } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (kind === 'error') p.reject(new Error(e.data.message));
      else if (kind === 'run') p.resolve(e.data.run);
      else p.resolve(e.data.raw);
    };
    worker.onerror = () => {
      for (const [, p] of pending) p.reject(new Error('GFS-Worker-Fehler'));
      pending.clear();
    };
  }
  return worker;
}

export function resolveRun(): Promise<GfsRun> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ kind: 'resolve', id });
  });
}

export function loadGlobe(run: GfsRun, fhour: number, sel: GlobeSel): Promise<GlobeRaw> {
  const id = ++seq;
  return new Promise<GlobeRaw>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ kind: 'load', id, run, fhour, sel });
  });
}

/** Vorab-Laden (fire-and-forget): füllt den Worker-Cache mit den Feldern eines
 *  Vorlaufs, damit ein späterer `loadGlobe` darauf sofort rendert. */
export function prefetch(run: GfsRun, fhour: number, sel: GlobeSel): void {
  getWorker().postMessage({ kind: 'prefetch', id: ++seq, run, fhour, sel });
}
