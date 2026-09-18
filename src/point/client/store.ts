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
 *
 * ── AP1 (Phase FI): Zeit und Frist je Abruf ────────────────────────────────
 * `stats.ms` summiert die Dauer der Abrufe (nicht die Wandzeit — parallele Abrufe
 * überlappen), `stats.slow` zählt Abrufe über der WEICHEN Frist (`slowMs`, 4 s): ein
 * Leser sieht daran, dass die Leitung und nicht der Code die Zeit gekostet hat. Die
 * HARTE Frist (`timeoutMs`) bricht ab. Beide Werte stehen im Plan §4 (AP1: „4 s weich /
 * 8 s hart"); die Voreinstellung der harten Frist bleibt bei 20 s, weil der Archiv-Sammler
 * auf einem GitHub-Runner denselben Store fährt — der Browser-Leser setzt 8 s.
 */

/** Zählwerk je Store — für die Kostenzeile der CLI und als Gate im Verifier. */
export interface StoreStats {
  /** Erfolgreich geholte Dateien. */
  files: number;
  /** Summe der gelieferten Bytes. */
  bytes: number;
  /** Abrufe, die mit 404 endeten (Sonden zählen hier mit). */
  misses: number;
  /** Summe der Abrufdauern in ms (parallele Abrufe überlappen — keine Wandzeit). */
  ms: number;
  /** Abrufe über der weichen Frist (`slowMs`). */
  slow: number;
  /** Wiederholte Abrufe (5xx/Netzfehler beim ersten Versuch, V-FI-5). */
  retries: number;
  /** Abrufe, die über den Ausweichweg (`fallbackStore`, z. B. raw.githubusercontent) geholt wurden. */
  fallbacks: number;
}

/** Je-Abruf-Optionen. Additiv: jeder bestehende Aufrufer läuft ohne sie weiter. */
export interface FetchOpts {
  /**
   * Cache-Modus des Browsers. `point/index.json` liegt am `@main`-Pfad mit
   * `max-age=604800` — ohne `no-cache` zeigt ein Browser bis zu sieben Tage auf Läufe,
   * die die Aufbewahrung längst entfernt hat (Plan §7.1 R9). Mit `no-cache` revalidiert
   * er per ETag (ein 304 kostet einen RTT, keine Bytes).
   */
  cache?: RequestCache;
  /**
   * Priorität für den Scheduler des Browsers (`fetch(..., { priority })`, Chrome ≥ 101).
   * Auf einer Leitung, die die Bytes begrenzt (4G: 1,8 MB ≈ 1,6 s), entscheidet die
   * Reihenfolge über die erste Darstellung: die Stufe am Fensteranfang, das Gelände und
   * die Station gehen `high`, die übrigen Stufen, statische Produkte und Radar-Frames
   * `low`. Node ignoriert das Feld.
   */
  priority?: 'high' | 'low' | 'auto';
  /** Abbruch von außen — der Verlierer eines Hedge-Rennens (`fallbackStore`). */
  signal?: AbortSignal;
  /**
   * AP12 (V-FI-40): wird einmal gerufen, sobald die Kopfzeilen der Antwort da sind (Status bekannt,
   * der Körper läuft noch). Der Hedge (`fallbackStore`) unterscheidet damit einen langsamen Origin
   * (keine Antwort) von einer langsamen Leitung (Antwort da, Bytes laufen).
   */
  onHeaders?: () => void;
}

export interface PointStore {
  /** Basis-URL ohne abschließenden Schrägstrich. */
  readonly base: string;
  /** Bytes einer Repo-relativen Datei; `null` bei 404. */
  bytes(path: string, opts?: FetchOpts): Promise<Uint8Array | null>;
  /** Dieselbe Datei als JSON; `null` bei 404. */
  json<T = unknown>(path: string, opts?: FetchOpts): Promise<T | null>;
  readonly stats: StoreStats;
  /**
   * Derselbe Store unter einer anderen Basis — dieselbe Frist, dasselbe `fetch`, DIESELBE
   * Zählung. Gebraucht, um veränderliche Manifeste an den Index-Commit zu pinnen
   * (`@<commit>` statt `@main`, V-FI-1), während die Chunks weiter unter `@main` liegen.
   * Optional: ein Speicher-Store kennt keine Commits und gibt sich selbst zurück.
   */
  withBase?(base: string): PointStore;
  /**
   * AP12 (c): ein Byte-Bereich [start, end) einer Datei — `null` bei 404. `whole: true` heißt: es kam die
   * GANZE Datei (ein Cache hatte sie, oder der Server hat den Range ignoriert und 200 geschickt) — der
   * Aufrufer nimmt sie dann statt der Bereiche. Optional: wer es nicht kann, bekommt den ganzen Abruf.
   */
  range?(path: string, start: number, end: number, opts?: FetchOpts): Promise<RangeResult | null>;
  /** AP12 (c): eine aus Bereichen zusammengesetzte, geprüfte GANZE Datei in den Cache legen (sonst nichts). */
  seed?(path: string, bytes: Uint8Array): void;
  /** AP12 (e): die zuletzt gesehene Fassung einer Datei mit SWR-Kopie (heute nur der Index), wenn jünger als `maxAgeMs`. */
  peek?(path: string, maxAgeMs: number): Promise<{ bytes: Uint8Array; ageMs: number } | null>;
}

export interface RangeResult {
  bytes: Uint8Array;
  /** Die ganze Datei statt des Bereichs (Cache-Treffer oder 200 auf einen Range). */
  whole: boolean;
}

/** Das Daten-Repo über jsDelivr — der Weg, den auch die Kartenlinie fährt. */
export const POINT_CDN_BASE = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main';
/** Rohweg ohne CDN-Cache. Für Gegenproben unmittelbar nach einem Push (PD-A, §51). */
export const POINT_RAW_BASE = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';

export function newStoreStats(): StoreStats {
  return { files: 0, bytes: 0, misses: 0, ms: 0, slow: 0, retries: 0, fallbacks: 0 };
}

export interface HttpStoreOptions {
  base?: string;
  fetchImpl?: typeof fetch;
  /**
   * Harte Frist bis zur ersten Antwort (Kopfzeilen). Ohne Frist hängt ein Leser beliebig lange (V-PV-20).
   *
   * AP12 (V-FI-40): bis 18.09. galt sie für den GANZEN Abruf. Auf Fast 3G (1,6 Mbit) braucht ein
   * 524-KB-Chunk neben ≈ 1,3 MB anderer Abrufe mehr als 8 s — er wurde in 10 von 10 Läufen
   * abgebrochen, obwohl die Bytes liefen, und das Produkt antwortete ohne 0–48 h. Seitdem: diese
   * Frist bis zur Antwort, danach `stallMs` ohne ein einziges neues Byte, und `bodyMaxMs` für alles.
   */
  timeoutMs?: number;
  /** Frist OHNE neue Bytes, während der Körper läuft (Voreinstellung = `timeoutMs`). */
  stallMs?: number;
  /** Obergrenze für den ganzen Abruf, auch bei tröpfelnder Leitung (Voreinstellung 120 s). */
  bodyMaxMs?: number;
  /** Weiche Frist: darüber zählt der Abruf als `slow`. Voreinstellung 4 s (Plan §4, AP1). */
  slowMs?: number;
  /**
   * Wiederholungen bei 5xx und Netzfehlern (nicht bei 404, nicht bei 403, nicht bei
   * Fristablauf). Voreinstellung 1.
   *
   * ⚠ V-FI-5, am 16.09. im Lab gemessen: jsDelivr antwortet auf `@main`-Dateien, die es
   * Sekunden später mit 200 ausliefert, gelegentlich mit **403 nach 1,4–5,7 s** (`x-cache
   * MISS`; auch auf Pfade, die es NICHT gibt, statt 404) — der Origin-Abruf ist dort
   * gescheitert. Dieselbe Klasse wie V-PD-46 am frischen Commit, nur ohne Commit. Ein 403
   * wird deshalb NICHT wiederholt: er kommt nach Sekunden, und 300 ms später ist der
   * Zustand derselbe (im Lab blieb er über vier Läufe). Der Aufrufer entscheidet — die
   * Slot-Suche behandelt ihn wie „nicht da", der Bündel-Leser als Fehler eines Produkts.
   */
  retries?: number;
  retryDelayMs?: number;
}

export function httpStore(opts: HttpStoreOptions = {}, sharedStats?: StoreStats): PointStore {
  const base = (opts.base ?? POINT_CDN_BASE).replace(/\/+$/, '');
  const f = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const slowMs = opts.slowMs ?? 4_000;
  const retries = opts.retries ?? 1;
  const retryDelayMs = opts.retryDelayMs ?? 300;
  const stallMs = opts.stallMs ?? timeoutMs;
  const bodyMaxMs = opts.bodyMaxMs ?? 120_000;
  const stats: StoreStats = sharedStats ?? newStoreStats();
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const once = async (url: string, path: string, fo: FetchOpts, span?: [number, number]): Promise<RangeResult | null> => {
    const ac = new AbortController();
    // Der Grund eines EIGENEN Abbruchs (Frist). Der Browser meldet einen Abbruch mitten im Körper nur
    // als „The user aborted a request." (16.09./18.09. im Lab) — geworfen wird deshalb dieser Grund.
    let why: Error | null = null;
    const abortWith = (e: Error) => { if (!ac.signal.aborted) { why = e; ac.abort(e); } };
    let t = setTimeout(() => abortWith(new Error(`Frist ${timeoutMs} ms: ${path}`)), timeoutMs);
    let tMax: ReturnType<typeof setTimeout> | null = null;
    if (fo.signal) {
      if (fo.signal.aborted) ac.abort(fo.signal.reason ?? new Error(`abgebrochen: ${path}`));
      else fo.signal.addEventListener('abort', () => ac.abort(fo.signal?.reason ?? new Error(`abgebrochen: ${path}`)), { once: true });
    }
    try {
      // Schon abgebrochen (Hedge-Verlierer, Aufrufer weg): kein Abruf, keine Zählung als Datei.
      if (ac.signal.aborted) throw (ac.signal.reason instanceof Error ? ac.signal.reason : Object.assign(new Error(`abgebrochen: ${path}`), { name: 'AbortError' }));
      const init: RequestInit & { priority?: string } = { signal: ac.signal };
      if (fo.cache) init.cache = fo.cache;
      if (fo.priority) init.priority = fo.priority;
      // Ein einzelner Bereich `bytes=a-b` ist CORS-freigegeben (kein Preflight); der Browser schickt dazu
      // `Accept-Encoding: identity` (Fetch-Spezifikation) — am Edge eine EIGENE Variante (§9.14.1).
      if (span) init.headers = { range: `bytes=${span[0]}-${span[1] - 1}` };
      // Chrome reiht gleichzeitige Abrufe DERSELBEN URL hinter der Sperre des HTTP-Cache-Eintrags ein — zehn
      // Bereiche eines Chunks bekamen ihr erstes Byte im Abstand je einer RTT (Lab 18.09.: 247 … 1 941 ms statt
      // alle bei ≈ 250 ms). Ohne HTTP-Cache keine Sperre; gespeichert wird ohnehin die geprüfte ganze Datei (IndexedDB).
      if (span && !fo.cache) init.cache = 'no-store';
      const r = await f(url, init);
      fo.onHeaders?.();
      if (r.status === 404) { stats.misses += 1; return null; }
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      // V-FI-40: ab hier zählt nicht mehr die Frist bis zur Antwort, sondern Stillstand — eine langsame
      // Leitung, auf der Bytes laufen, ist kein toter Abruf.
      const arm = () => { clearTimeout(t); t = setTimeout(() => abortWith(new Error(`Frist ${stallMs} ms ohne Daten: ${path}`)), stallMs); };
      tMax = setTimeout(() => abortWith(new Error(`Frist ${bodyMaxMs} ms Gesamtdauer: ${path}`)), bodyMaxMs);
      const b = await readBody(r, arm);
      stats.files += 1;
      stats.bytes += b.length;
      if (span && r.status === 206 && b.length !== span[1] - span[0]) throw new Error(`${path}: Bereich ${span[0]}–${span[1]} lieferte ${b.length} B`);
      return { bytes: b, whole: !(span && r.status === 206) };
    } catch (e) {
      throw why ?? e;
    } finally {
      clearTimeout(t);
      if (tMax) clearTimeout(tMax);
    }
  };

  const bytes = async (path: string, fo: FetchOpts = {}): Promise<Uint8Array | null> => (await fetchWithRetry(path, fo))?.bytes ?? null;
  const range = (path: string, start: number, end: number, fo: FetchOpts = {}): Promise<RangeResult | null> => fetchWithRetry(path, fo, [start, end]);

  const fetchWithRetry = async (path: string, fo: FetchOpts, span?: [number, number]): Promise<RangeResult | null> => {
    const url = `${base}/${path.replace(/^\/+/, '')}`;
    const t0 = now();
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          return await once(url, path, fo, span);
        } catch (e) {
          const msg = String((e as Error)?.message ?? e);
          const aborted = (e as Error)?.name === 'AbortError' || /Frist \d+ ms|abgebrochen:|hedge:/.test(msg) || !!fo.signal?.aborted;
          const forbidden = /: HTTP 403$/.test(msg);
          if (attempt >= retries || aborted || forbidden) throw e;
          stats.retries += 1;
          await new Promise((r) => setTimeout(r, retryDelayMs));
        }
      }
    } finally {
      const dt = now() - t0;
      stats.ms += dt;
      if (dt > slowMs) stats.slow += 1;
    }
  };

  return {
    base,
    bytes,
    range,
    async json<T>(path: string, fo?: FetchOpts) {
      const b = await bytes(path, fo);
      if (!b) return null;
      return JSON.parse(new TextDecoder().decode(b)) as T;
    },
    stats,
    withBase: (other: string) => httpStore({ ...opts, base: other }, stats),
  };
}

/**
 * Den Körper einer Antwort lesen und nach jedem Datenpaket `onChunk` rufen (Stillstandsfrist,
 * V-FI-40). Ohne lesbaren Strom (ältere Laufzeiten, Test-Attrappen) der ganze Körper auf einmal.
 * Ergebnis ist immer ein eigener, exakt großer Puffer.
 */
async function readBody(r: Response, onChunk: () => void): Promise<Uint8Array> {
  onChunk();
  const body = r.body as ReadableStream<Uint8Array> | null;
  if (!body || typeof body.getReader !== 'function') return new Uint8Array(await r.arrayBuffer());
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length) { parts.push(value); n += value.length; }
    onChunk();
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/**
 * Ein Store über eine Tabelle im Speicher — der netzfreie Weg für Selbsttests.
 *
 * Nimmt genau das, was der Producer geschrieben hat (Bytes je Pfad), und liefert es
 * unter demselben Vertrag aus. Damit prüft der Selbsttest den Leser, nicht das Netz.
 */
export function memoryStore(files: Map<string, Uint8Array>, base = 'memory://'): PointStore {
  const stats: StoreStats = newStoreStats();
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
    // AP12 (c): ein Bereich ist ein Ausschnitt derselben Bytes — gezählt wie ein Abruf.
    async range(path: string, start: number, end: number) {
      const b = files.get(path.replace(/^\/+/, ''));
      if (!b) { stats.misses += 1; return null; }
      const part = b.slice(start, Math.min(end, b.length));
      stats.files += 1;
      stats.bytes += part.length;
      return { bytes: part, whole: false };
    },
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

/**
 * Ein Store mit AUSWEICHWEG (V-FI-5): scheitert der erste an einem 403, an der Frist, an
 * einem 5xx (nach seiner Wiederholung) oder am Netz, holt der zweite denselben Pfad.
 *
 * Gemessen am 16.09.: jsDelivr gab für den t1-Chunk von Genf (`00_00.bin`, 616 KB) über
 * **15 Minuten in drei Profilen und zwölf Läufen 403** — dieselbe Datei kam von
 * `raw.githubusercontent.com` mit 229 ms TTFB und `Access-Control-Allow-Origin: *`.
 * Ein 404 ist kein Grund für den Ausweichweg (die Datei gibt es nicht); ein 403 nach
 * Sekunden ist einer (das CDN hat sie nur nicht bekommen). Der Ausweichweg hat KEINEN
 * Edge-Cache, deshalb bleibt er die Ausnahme und wird gezählt (`stats.fallbacks`).
 *
 * **Hedge (`hedgeMs`):** der 403 kam in der Matrix erst nach 1,4–8 s — auf einen Fehler
 * zu WARTEN kostet also genau die Zeit, die der Ausweichweg sparen soll. Ist `hedgeMs`
 * gesetzt und hat das CDN bis dahin NICHT GEANTWORTET (keine Kopfzeilen — V-FI-40: auf
 * Fast 3G startete der Hedge sonst für jede Datei, deren Körper länger als 2,5 s lief, und
 * verdoppelte die Bytes auf der vollen Leitung), startet der Ausweichweg zusätzlich, und die
 * schnellere Antwort gewinnt; der Verlierer wird abgebrochen. Ein 404 des CDN gewinnt sofort
 * (die Datei gibt es nicht). 2,5 s ist das p95 der MISS-TTFB aus AP0/AP1 — darüber ist
 * der Origin-Abruf des CDN erfahrungsgemäß nicht mehr „langsam", sondern kaputt.
 */
export function fallbackStore(
  primary: PointStore,
  fallback: PointStore,
  opts: { when?: (e: unknown) => boolean; onFallback?: (path: string, err: unknown) => void; hedgeMs?: number } = {},
): PointStore {
  const when = opts.when ?? ((e: unknown) => /HTTP 403|Frist \d+ ms|HTTP 5\d\d|fetch failed|NetworkError|Failed to fetch/i.test(String((e as Error)?.message ?? e)));
  const hedgeMs = opts.hedgeMs ?? 0;
  const bytes = (path: string, fo: FetchOpts = {}): Promise<Uint8Array | null> => new Promise((resolve, reject) => {
    const acP = new AbortController();
    const acF = new AbortController();
    if (fo.signal) {
      const onAbort = () => { acP.abort(fo.signal?.reason); acF.abort(fo.signal?.reason); };
      if (fo.signal.aborted) onAbort(); else fo.signal.addEventListener('abort', onAbort, { once: true });
    }
    let settled = false;
    let fallbackStarted = false;
    let primaryErr: unknown = null;
    let fallbackErr: unknown = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (fn: () => void) => { if (settled) return; settled = true; if (timer) clearTimeout(timer); fn(); };
    const startFallback = (why: unknown) => {
      if (fallbackStarted || settled) return;
      fallbackStarted = true;
      primary.stats.fallbacks += 1;
      opts.onFallback?.(path, why);
      fallback.bytes(path, { ...fo, signal: acF.signal }).then(
        (b) => finish(() => { acP.abort(new Error(`hedge: Ausweichweg war schneller: ${path}`)); resolve(b); }),
        (e) => { fallbackErr = e; if (primaryErr) finish(() => reject(primaryErr)); },
      );
    };
    if (hedgeMs > 0) timer = setTimeout(() => startFallback(new Error(`hedge ${hedgeMs} ms: ${path}`)), hedgeMs);
    // V-FI-40: der Hedge gilt einem Origin, der nicht ANTWORTET — nicht einer Leitung, auf der die Bytes
    // langsam laufen. Sind die Kopfzeilen da, fällt der Hedge weg; bleibt der Körper stehen, wirft der
    // Store seine Stillstandsfrist, und der Ausweichweg startet über `when` wie bei jedem anderen Fehler.
    const onHeaders = () => { fo.onHeaders?.(); if (!fallbackStarted && timer) { clearTimeout(timer); timer = null; } };
    primary.bytes(path, { ...fo, signal: acP.signal, onHeaders }).then(
      (b) => finish(() => { acF.abort(new Error(`hedge: CDN war schneller: ${path}`)); resolve(b); }),
      (e) => {
        if (settled) return;
        primaryErr = e;
        if (!when(e)) { finish(() => reject(e)); return; }
        if (!fallbackStarted) { if (timer) clearTimeout(timer); startFallback(e); }
        else if (fallbackErr) finish(() => reject(e));
      },
    );
  });
  const self: PointStore = {
    get base() { return primary.base; },
    get stats() { return primary.stats; },
    bytes,
    // AP12 (c): Bereiche ohne Hedge — scheitert der erste Weg (403, Frist, 5xx, Netz), fragt der zweite denselben Bereich.
    ...(primary.range ? {
      async range(path: string, start: number, end: number, fo?: FetchOpts) {
        try {
          return await primary.range!(path, start, end, fo);
        } catch (e) {
          if (!when(e)) throw e;
          primary.stats.fallbacks += 1;
          opts.onFallback?.(path, e);
          if (fallback.range) return fallback.range(path, start, end, fo);
          const b = await fallback.bytes(path, fo);
          return b ? { bytes: b, whole: true } : null;
        }
      },
    } : {}),
    ...(primary.seed ? { seed: (path: string, b: Uint8Array) => primary.seed!(path, b) } : {}),
    ...(primary.peek ? { peek: (path: string, maxAgeMs: number) => primary.peek!(path, maxAgeMs) } : {}),
    async json<T>(path: string, fo?: FetchOpts) {
      const b = await self.bytes(path, fo);
      if (!b) return null;
      return JSON.parse(new TextDecoder().decode(b)) as T;
    },
    withBase(base: string) {
      if (!primary.withBase) return self;
      return fallbackStore(primary.withBase(base), fallback, opts);
    },
  };
  return self;
}

/** Die `raw.githubusercontent`-Basis zu einer jsDelivr-`@main`-Basis — oder `null`, wenn es keine ist. */
export function rawBaseOf(base: string): string | null {
  const m = base.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/([^@/]+)\/([^@/]+)@main$/);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/main` : null;
}

/** Hedge-Frist des Ausweichwegs: p95 der gemessenen MISS-TTFB (AP0 2,6 s; AP1-Matrix 2,3 s). */
export const RAW_FALLBACK_HEDGE_MS = 2_500;

/** Ein jsDelivr-Store mit `raw.githubusercontent` als Ausweichweg (mit Hedge); jede andere Basis bleibt, wie sie ist. */
export function withRawFallback(store: PointStore, opts: { onFallback?: (path: string, err: unknown) => void; hedgeMs?: number } = {}): PointStore {
  const raw = rawBaseOf(store.base);
  if (!raw || !store.withBase) return store;
  return fallbackStore(store, store.withBase(raw), { hedgeMs: RAW_FALLBACK_HEDGE_MS, ...opts });
}

/**
 * Ein Store, der jeden Pfad je Instanz genau EINMAL holt (auch ein 404 wird gemerkt).
 *
 * Für den parallelen Leser (AP1) ist das der Unterschied zwischen „das Stationsbündel
 * wird optimistisch geholt UND später vom Stationsleser noch einmal" und einem Abruf.
 * Gepinnte Basen (`withBase`) teilen das Memo je Basis. Kein Cache über die Instanz
 * hinaus — dafür gibt es `cachedStore` (IndexedDB).
 */
export function memoStore(inner: PointStore, shared: Map<string, PointStore> = new Map()): PointStore {
  const bytes = new Map<string, Promise<Uint8Array | null>>();
  const ranges = new Map<string, Promise<RangeResult | null>>();
  const self: PointStore = {
    get base() { return inner.base; },
    get stats() { return inner.stats; },
    bytes(path, fo) {
      const key = path.replace(/^\/+/, '');
      let p = bytes.get(key);
      if (!p) {
        p = inner.bytes(key, fo);
        bytes.set(key, p);
        // Eine Absage wird NICHT gemerkt: der nächste Aufrufer (etwa die Auswahlregel nach
        // dem Bündel) darf es erneut versuchen — ein gemerkter Fehler wäre ein Fehler ohne Ende.
        p.catch(() => { if (bytes.get(key) === p) bytes.delete(key); });
      }
      return p;
    },
    ...(inner.range ? {
      range(path: string, start: number, end: number, fo?: FetchOpts) {
        const key = `${path.replace(/^\/+/, '')}#${start}-${end}`;
        let p = ranges.get(key);
        if (!p) {
          p = inner.range!(path, start, end, fo);
          ranges.set(key, p);
          p.catch(() => { if (ranges.get(key) === p) ranges.delete(key); });
        }
        return p;
      },
    } : {}),
    ...(inner.seed ? { seed: (path: string, b: Uint8Array) => inner.seed!(path, b) } : {}),
    ...(inner.peek ? { peek: (path: string, maxAgeMs: number) => inner.peek!(path, maxAgeMs) } : {}),
    async json<T>(path: string, fo?: FetchOpts) {
      const b = await self.bytes(path, fo);
      if (!b) return null;
      return JSON.parse(new TextDecoder().decode(b)) as T;
    },
    withBase(base: string) {
      if (!inner.withBase) return self;
      let s = shared.get(base);
      if (!s) { s = memoStore(inner.withBase(base), shared); shared.set(base, s); }
      return s;
    },
  };
  return self;
}
