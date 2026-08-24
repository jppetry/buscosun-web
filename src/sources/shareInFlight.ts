/**
 * Entdopplung gleichzeitiger Ladevorgänge (BW-5).
 *
 * Zwei Komponenten der Regenradar-Seite montieren gleichzeitig und laden
 * dieselbe Quelle unabhängig voneinander:
 *
 *   NowcastPage      → buildNowcast   → createRadarNowcastSampler(country)
 *   NowcastRadarMap  → getRadarStack(country)
 *
 * Kein Cache greift dazwischen, weil beide Abrufe starten, **bevor** einer von
 * beiden abgelegt hat. Gemessen (`audit/bandbreite.md` §24.3): DE 494 KB
 * (Verzeichnis-Listing + RV-Tar), AT 722 KB (INCA-Raster) doppelt über die
 * Leitung, dazu in allen drei Ländern das doppelte Entpacken und Dekodieren.
 *
 * **Der laufende Abruf hängt bewusst an KEINEM Aufrufer-Signal.** Bricht der
 * erste Aufrufer ab (Reacts doppelte Dev-Effekte, Ortswechsel, Unmount), wäre
 * der zweite sonst mit vergiftet — dieselbe Falle wie der Brandflächen-
 * Ladecache (Gate GBP1, Lehre 3) und der Meteostat-Stations-Cache (BH4). Jeder
 * Aufrufer bekommt stattdessen sein eigenes Abbruch-Versprechen auf denselben
 * Lauf.
 *
 * Der Preis dieser Entscheidung, ausgesprochen: ein Abbruch bricht den Download
 * nicht mehr ab, er läuft zu Ende und landet im Cache. Das kostet im
 * Ausnahmefall (Verlassen der Seite mitten im Laden) einmal die Restbytes und
 * spart im Regelfall jede Sitzung den kompletten zweiten Abruf.
 */

const inFlight = new Map<string, Promise<unknown>>();

function abortError(): Error {
  const e = new Error('Abgebrochen');
  e.name = 'AbortError';
  return e;
}

/**
 * Führt `run` je Schlüssel höchstens einmal gleichzeitig aus. Weitere Aufrufer
 * mit demselben Schlüssel bekommen dasselbe Ergebnis, ohne einen zweiten Abruf
 * auszulösen. Der Eintrag wird nach dem Abschluss (auch nach einem Fehler)
 * sofort entfernt — dies ist eine Entdopplung, kein Cache.
 */
export function shareInFlight<T>(
  key: string,
  run: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let shared = inFlight.get(key) as Promise<T> | undefined;
  if (!shared) {
    shared = run();
    const p = shared;
    inFlight.set(key, p);
    void p.then(
      () => { if (inFlight.get(key) === p) inFlight.delete(key); },
      () => { if (inFlight.get(key) === p) inFlight.delete(key); },
    );
  }
  if (!signal) return shared;

  const p = shared;
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Nur für Verifier: laufende Entdopplungen zählen. */
export function _inFlightCount(): number { return inFlight.size; }
