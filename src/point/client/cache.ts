/**
 * cache.ts — ein Byte-Cache VOR dem Store (Phase FI, AP1).
 *
 * ── Warum ein eigener Cache und nicht der HTTP-Cache des Browsers ──────────
 * Der HTTP-Cache folgt den Kopfzeilen des CDN, und die sind für dieses Repo an zwei
 * Stellen falsch herum: `@main/point/index.json` trägt `max-age=604800` (sieben Tage
 * für einen Zeiger, der sich achtmal täglich ändert, R9), und die Chunks — die sich NIE
 * ändern, weil ihr Pfad den Lauf trägt — bekommen dieselbe Woche wie alles andere.
 * Dazu kommt, dass ein Browser-Cache von `Vary: Accept-Encoding` und Speicherdruck
 * abhängt und im Lab nicht beobachtbar ist. Ein eigener Cache mit **eigener Regel je
 * Pfad** macht die Wiederholabfrage deterministisch: Chunks, Stationsbündel und
 * Radar-Frames sind unveränderlich, gepinnte Manifeste ebenso, der Index nie.
 *
 * ── Die Regel (`defaultCachePolicy`) ───────────────────────────────────────
 *   unveränderlich (für immer, bis der Sweep sie nach 48 h räumt):
 *     point/<lauf>/t?/NN_NN.bin · point/stations/<lauf>/{NN_NN.bin,stations.json} ·
 *     radar/img/v1/<quelle>/<stamp>/{meta.json,f*.png} · ALLES unter `@<40-hex>`
 *   befristet (24 h):  point/stations/catalog.json · point/sources.json · point/calib.json
 *   befristet (12 h):  point/static/* unter @main — in place veränderlich (PD-E), aber die
 *                      gepinnte Fassung wäre für JEDEN Nutzer nach JEDEM Publish ein Edge-MISS
 *                      (gemessen 0,9–2,1 s je 1,5-KB-Datei, V-FI-6); 12 h = die CDN-eigene
 *                      `s-maxage`, länger ist der Client damit nie hinter dem Edge
 *   nie:               point/index.json · point/<lauf>/run.json unter @main (V-FI-1)
 *
 * Ein 404 wird NICHT gemerkt: ein Nowcast-Slot, den es um 20:41 noch nicht gibt, gibt
 * es um 20:43. Fehler des Backends (privates Fenster, Quota) fallen auf das Netz zurück
 * und werden gezählt — sie sind nie ein Grund, nichts zu liefern.
 *
 * ── Backends ───────────────────────────────────────────────────────────────
 * `idbBackend()` (Browser, IndexedDB) und `memoryBackend()` (Selbsttest, Node). Der
 * Sweep räumt Einträge, die älter als `maxAgeMs` sind — einmal je Backend-Instanz, im
 * Hintergrund, nie auf dem kritischen Pfad.
 */

import type { FetchOpts, PointStore } from './store';

const H = 3_600_000;

export interface CacheEntry {
  bytes: Uint8Array;
  storedAt: number;
}

export interface CacheBackend {
  readonly kind: string;
  get(key: string): Promise<CacheEntry | null>;
  put(key: string, entry: CacheEntry): Promise<void>;
  /** Entfernt Einträge, die vor `beforeMs` gespeichert wurden; gibt die Zahl zurück. */
  sweep(beforeMs: number): Promise<number>;
}

/** Gültigkeitsdauer je Pfad in ms: `Infinity` = unveränderlich, `null` = nie cachen. */
export type CachePolicy = (path: string, base: string) => number | null;

const PINNED_BASE = /@[0-9a-f]{40}$/;

export const defaultCachePolicy: CachePolicy = (path, base) => {
  const p = path.replace(/^\/+/, '');
  if (p === 'point/index.json' || p === 'index.json') return null;
  if (PINNED_BASE.test(base)) return Infinity;
  if (/^point\/\d{10}\/t[123]\/\d\d_\d\d\.bin$/.test(p)) return Infinity;
  if (/^point\/stations\/\d{10}\/(\d\d_\d\d\.bin|stations\.json)$/.test(p)) return Infinity;
  if (/^radar\/img\/v1\/[a-z]+\/[0-9T]+\/(meta\.json|f\d+\.png)$/.test(p)) return Infinity;
  if (/^point\/\d{10}\/run\.json$/.test(p)) return null;
  if (/^point\/static\//.test(p)) return 12 * H;
  if (p === 'point/stations/catalog.json' || p === 'point/sources.json' || p === 'point/calib.json') return 24 * H;
  return null;
};

export interface CacheStats {
  hits: number;
  misses: number;
  stored: number;
  /** Backend-Fehler (gezählt, nie geworfen). */
  errors: number;
  /** Abrufe, die die Regel gar nicht erst am Cache vorbeigeführt hat. */
  bypass: number;
  /** Bytes, die der Cache statt des Netzes geliefert hat. */
  bytesServed: number;
}

export function newCacheStats(): CacheStats {
  return { hits: 0, misses: 0, stored: 0, errors: 0, bypass: 0, bytesServed: 0 };
}

export interface CachedStoreOptions {
  policy?: CachePolicy;
  nowMs?: () => number;
  stats?: CacheStats;
  /** Sweep-Schwelle; Voreinstellung 48 h (kein Lauf ist länger als 24 h im Repo). */
  maxAgeMs?: number;
}

/**
 * Der Store MIT Cache. `withBase` bleibt erhalten — ein gepinnter Store cacht unter
 * seiner Basis, und die ist Teil des Schlüssels (dieselbe Datei unter `@main` und
 * `@<sha>` sind zwei Einträge; nur der zweite ist unveränderlich).
 */
export function cachedStore(inner: PointStore, backend: CacheBackend, opts: CachedStoreOptions = {}): PointStore {
  const policy = opts.policy ?? defaultCachePolicy;
  const now = opts.nowMs ?? (() => Date.now());
  const stats = opts.stats ?? newCacheStats();
  const maxAgeMs = opts.maxAgeMs ?? 48 * H;
  const sweptOnce = new WeakSet<CacheBackend>();
  if (!sweptOnce.has(backend)) {
    sweptOnce.add(backend);
    backend.sweep(now() - maxAgeMs).catch(() => { stats.errors += 1; });
  }

  const bytes = async (path: string, fo?: FetchOpts): Promise<Uint8Array | null> => {
    const ttl = policy(path, inner.base);
    if (ttl == null) { stats.bypass += 1; return inner.bytes(path, fo); }
    const key = `${inner.base}/${path.replace(/^\/+/, '')}`;
    try {
      const hit = await backend.get(key);
      if (hit && (ttl === Infinity || now() - hit.storedAt < ttl)) {
        stats.hits += 1;
        stats.bytesServed += hit.bytes.length;
        return hit.bytes;
      }
    } catch { stats.errors += 1; }
    stats.misses += 1;
    const b = await inner.bytes(path, fo);
    if (b) {
      backend.put(key, { bytes: b, storedAt: now() })
        .then(() => { stats.stored += 1; }, () => { stats.errors += 1; });
    }
    return b;
  };

  const self: PointStore = {
    get base() { return inner.base; },
    get stats() { return inner.stats; },
    bytes,
    async json<T>(path: string, fo?: FetchOpts) {
      const b = await bytes(path, fo);
      if (!b) return null;
      return JSON.parse(new TextDecoder().decode(b)) as T;
    },
    withBase(base: string) {
      if (!inner.withBase) return self;
      return cachedStore(inner.withBase(base), backend, { policy, nowMs: now, stats, maxAgeMs });
    },
  };
  return self;
}

/** Ein Backend im Speicher — für Selbsttests und als Rückfall ohne IndexedDB. */
export function memoryBackend(): CacheBackend & { size(): number } {
  const m = new Map<string, CacheEntry>();
  return {
    kind: 'memory',
    async get(key) { return m.get(key) ?? null; },
    async put(key, e) { m.set(key, e); },
    async sweep(beforeMs) {
      let n = 0;
      for (const [k, e] of m) if (e.storedAt < beforeMs) { m.delete(k); n++; }
      return n;
    },
    size: () => m.size,
  };
}

/**
 * IndexedDB-Backend. Gibt `null` zurück, wo es kein IndexedDB gibt (Node, Worker ohne
 * IDB) — der Aufrufer nimmt dann den Store ohne Cache. Jede Operation ist gegen
 * Ausnahmen abgeschirmt (privates Fenster, blockierter Speicher, Quota).
 */
export function idbBackend(dbName = 'buscosun-point', storeName = 'files'): CacheBackend | null {
  const idb: IDBFactory | undefined = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!idb) return null;
  let dbP: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (dbP) return dbP;
    dbP = new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) {
          const os = db.createObjectStore(storeName, { keyPath: 'key' });
          os.createIndex('storedAt', 'storedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB: open fehlgeschlagen'));
      req.onblocked = () => reject(new Error('IndexedDB: blockiert'));
    });
    dbP.catch(() => { dbP = null; });
    return dbP;
  };
  const tx = async <T>(mode: IDBTransactionMode, fn: (os: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const req = fn(t.objectStore(storeName));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB: Anfrage fehlgeschlagen'));
    });
  };
  return {
    kind: 'indexeddb',
    async get(key) {
      const row = await tx<{ key: string; storedAt: number; bytes: ArrayBuffer } | undefined>('readonly', (os) => os.get(key) as IDBRequest<{ key: string; storedAt: number; bytes: ArrayBuffer } | undefined>);
      return row ? { bytes: new Uint8Array(row.bytes), storedAt: row.storedAt } : null;
    },
    async put(key, e) {
      // Kopie in einen exakt großen Puffer: ein Uint8Array-View auf einen größeren Puffer
      // würde den ganzen Puffer speichern.
      const buf = e.bytes.byteOffset === 0 && e.bytes.byteLength === e.bytes.buffer.byteLength
        ? e.bytes.buffer : e.bytes.slice().buffer;
      await tx('readwrite', (os) => os.put({ key, storedAt: e.storedAt, bytes: buf }));
    },
    async sweep(beforeMs) {
      const db = await open();
      return new Promise<number>((resolve, reject) => {
        let n = 0;
        const t = db.transaction(storeName, 'readwrite');
        const req = t.objectStore(storeName).index('storedAt').openCursor(IDBKeyRange.upperBound(beforeMs, true));
        req.onsuccess = () => {
          const c = req.result;
          if (!c) { resolve(n); return; }
          c.delete(); n++; c.continue();
        };
        req.onerror = () => reject(req.error ?? new Error('IndexedDB: Sweep fehlgeschlagen'));
      });
    },
  };
}
