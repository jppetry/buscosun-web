/**
 * store.ts — der Transportweg zum Daten-Repo, EINMAL.
 *
 * Jeder Leser dieser Phase (Cube, Stationen, Nowcast) holt seine Bytes hier und nirgends
 * sonst. Das hat zwei Gründe, beide aus früheren Fehlern dieser Linie:
 *
 * 1. **Der Verifier muss netzfrei laufen können.** `fetchImpl` ist injizierbar; der
 *    netzfreie Selbsttest schiebt eine Tabelle unter und prüft den Rundweg
 *    Producer → Leser, ohne ein Byte aus dem Netz.
 * 2. **Ein 404 ist ein Befund, kein Fehler.** `bytes()` gibt `null` zurück, wenn die
 *    Datei nicht da ist, und wirft nur bei echten Transportfehlern. Der Unterschied ist
 *    nicht kosmetisch: ein abgebrochener Abruf als „Quelle hat nichts" zu melden war in
 *    der Bandbreiten-Linie ein Fehlalarm, der Stunden gekostet hat (V-BW-*, `AbortError`
 *    ≠ `absent`).
 *
 * ⚠ **Warum der Standardweg `@main` ist und nicht der gepinnte Commit:** ein auf einen
 * SHA gepinnter jsDelivr-Pfad kann **404** liefern, während `@main` byte-gleich
 * ausliefert — genau das ist am 2026-09-09 passiert, als ein Rebase den Datencommit
 * umgeschrieben hat, den das Manifest schon nannte (PD-A, §29). Wer trotzdem pinnen
 * will, übergibt `base` mit `@<sha>`; `httpStore` fällt dann NICHT automatisch zurück,
 * denn ein stiller Rückfall verwischt genau den Befund, den man pinnen wollte.
 */

/** Zählwerk je Store — für die Kostenzeile der CLI und als Gate im Verifier. */
export interface StoreStats {
  /** Erfolgreich geholte Dateien. */
  files: number;
  /** Summe der gelieferten Bytes. */
  bytes: number;
  /** Abrufe, die mit 404 endeten (Sonden zählen hier mit). */
  misses: number;
}

export interface PointStore {
  /** Basis-URL ohne abschließenden Schrägstrich. */
  readonly base: string;
  /** Bytes einer Repo-relativen Datei; `null` bei 404. */
  bytes(path: string): Promise<Uint8Array | null>;
  /** Dieselbe Datei als JSON; `null` bei 404. */
  json<T = unknown>(path: string): Promise<T | null>;
  readonly stats: StoreStats;
  /**
   * Derselbe Store unter einer anderen Basis — dieselbe Frist, dasselbe `fetch`, DIESELBE
   * Zählung. Gebraucht, um veränderliche Manifeste an den Index-Commit zu pinnen
   * (`@<commit>` statt `@main`, V-FI-1), während die Chunks weiter unter `@main` liegen.
   * Optional: ein Speicher-Store kennt keine Commits und gibt sich selbst zurück.
   */
  withBase?(base: string): PointStore;
}

/** Das Daten-Repo über jsDelivr — der Weg, den auch die Kartenlinie fährt. */
export const POINT_CDN_BASE = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main';
/** Rohweg ohne CDN-Cache. Für Gegenproben unmittelbar nach einem Push (PD-A, §51). */
export const POINT_RAW_BASE = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';

export interface HttpStoreOptions {
  base?: string;
  fetchImpl?: typeof fetch;
  /** Frist je Abruf. Ohne Frist hängt ein Leser beliebig lange (V-PV-20). */
  timeoutMs?: number;
}

export function httpStore(opts: HttpStoreOptions = {}, sharedStats?: StoreStats): PointStore {
  const base = (opts.base ?? POINT_CDN_BASE).replace(/\/+$/, '');
  const f = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const stats: StoreStats = sharedStats ?? { files: 0, bytes: 0, misses: 0 };

  const bytes = async (path: string): Promise<Uint8Array | null> => {
    const url = `${base}/${path.replace(/^\/+/, '')}`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(new Error(`Frist ${timeoutMs} ms: ${path}`)), timeoutMs);
    try {
      const r = await f(url, { signal: ac.signal });
      if (r.status === 404) { stats.misses += 1; return null; }
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      const b = new Uint8Array(await r.arrayBuffer());
      stats.files += 1;
      stats.bytes += b.length;
      return b;
    } finally {
      clearTimeout(t);
    }
  };

  return {
    base,
    bytes,
    async json<T>(path: string) {
      const b = await bytes(path);
      if (!b) return null;
      return JSON.parse(new TextDecoder().decode(b)) as T;
    },
    stats,
    withBase: (other: string) => httpStore({ ...opts, base: other }, stats),
  };
}

/**
 * Ein Store über eine Tabelle im Speicher — der netzfreie Weg für Selbsttests.
 *
 * Nimmt genau das, was der Producer geschrieben hat (Bytes je Pfad), und liefert es
 * unter demselben Vertrag aus. Damit prüft der Selbsttest den Leser, nicht das Netz.
 */
export function memoryStore(files: Map<string, Uint8Array>, base = 'memory://'): PointStore {
  const stats: StoreStats = { files: 0, bytes: 0, misses: 0 };
  const bytes = async (path: string): Promise<Uint8Array | null> => {
    const b = files.get(path.replace(/^\/+/, ''));
    if (!b) { stats.misses += 1; return null; }
    stats.files += 1;
    stats.bytes += b.length;
    return b;
  };
  const self: PointStore = {
    base,
    bytes,
    async json<T>(path: string) {
      const b = await bytes(path);
      if (!b) return null;
      return JSON.parse(new TextDecoder().decode(b)) as T;
    },
    stats,
    // Eine Tabelle im Speicher hat keine Commits: dieselben Bytes unter jeder Basis.
    withBase: () => self,
  };
  return self;
}
