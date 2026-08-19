/**
 * Netlify Edge Function — Schlüssel-Proxy für die **NASA-FIRMS-Area-API**
 * (Phase F0/GWBF1, Primärquelle des Layers `fireHotspots`).
 *
 * ⚠️ **VORSCHLAG — Stand F0, noch nicht freigegeben und noch nicht verdrahtet.**
 * Edge Functions sind laut `CLAUDE.md` STOPP-&-FRAGEN-Zone. Diese Datei ist
 * additiv, wird von keinem Client-Pfad aufgerufen und ist bis zum nächsten
 * Deploy wirkungslos; der Deploy ist Jans Gate. Freigabe-Entscheidung offen.
 *
 * WOZU. Anders als alle bisherigen Proxys dieses Repos (`/_dwd_wind`,
 * `/_dwd_grib`, die `netlify.toml`-Rewrites) löst dieser nicht nur CORS,
 * sondern trägt ein **Geheimnis**: die Area API verlangt einen MAP_KEY.
 * buscosun ist client-only (D-01) — eine Konstante im Frontend stünde im
 * Netzwerk-Tab, und das Limit (5.000 Transaktionen / 10 min) hängt am
 * Schlüssel des Betreibers. Der Schlüssel kommt deshalb ausschließlich aus
 * der Umgebungsvariablen `FIRMS_MAP_KEY` und wird hier serverseitig in die
 * Upstream-URL gesetzt (`docs/DATA_SOURCES.md` §W.2.1, Auflage 1).
 *
 * ZWEI ABWEICHUNGEN VOM MUSTER `dwd-grib.ts` — beide erzwungen durch den
 * Schlüssel, beide nicht kosmetisch:
 *
 *  (1) **Kein Pfad-Durchreichen, sondern Neubau aus geprüften Teilen.**
 *      `dwd-grib.ts` hängt den eingehenden Pfad an den Origin. Hier wird jede
 *      Komponente einzeln geprüft (Quelle aus Whitelist, BBox numerisch UND
 *      innerhalb der DACH-Hülle, Tagesspanne 1–5, Datum streng `YYYY-MM-DD`)
 *      und die Ziel-URL neu zusammengesetzt. Der Query-String wird verworfen.
 *      Damit ist Pfad-Traversal strukturell unmöglich, und der Proxy taugt
 *      nicht als Welt-Scraper auf Jans Transaktionsbudget.
 *
 *  (2) **Fehlertexte nennen NIE den Upstream.** `dwd-grib.ts` antwortet bei
 *      Netzfehlern mit `String(err)` — dieser String kann bei fetch-Fehlern
 *      die angefragte URL enthalten, und die URL trägt hier den Schlüssel im
 *      Pfad. Jede Fehlerantwort ist deshalb ein fester, kurzer Text.
 *
 * CACHE. Der Inhalt ist NICHT immutabel (NRT wächst mit jedem Überflug),
 * also kein `immutable` und kein 6-h-Fenster wie bei den GRIB-Dateien:
 * Durable-Edge 30 min, Browser 5 min. Die NRT-Latenz liegt bei ~3 h, ein
 * 30-min-Fenster verliert also nichts. Wirkung: die Zahl der Upstream-
 * Anfragen hängt am Zeitfenster, nicht an der Nutzerzahl (Auflage 2).
 * Fehlantworten werden **nie** durable gecacht — sonst würde ein transienter
 * „Invalid MAP_KEY" oder ein Limit-Treffer 30 Minuten festgetackert.
 *
 * Portabilität: nur Web-Standard-Globals plus ein Umgebungs-Lookup, der unter
 * Deno (Netlify) UND Node läuft — damit ist `resolveFirmsUrl` im Verifier
 * `verify:fire-firms` netzfrei prüfbar (Muster: verify-layer-transport.mjs).
 */

const FIRMS_ORIGIN = 'https://firms.modaps.eosdis.nasa.gov';

/**
 * Erlaubte Produkte. Bewusst eng: die drei VIIRS-375-m-NRT-Ströme, die der
 * Layer zusammenführt. MODIS (1 km), die `_SP`-Nachbearbeitungen und
 * LANDSAT_NRT (nur US/Kanada) sind nicht freigegeben — jede zusätzliche
 * Quelle kostet Transaktionen und wäre über einen offenen Proxy fremdnutzbar.
 */
const ALLOWED_SOURCES = new Set([
  'VIIRS_SNPP_NRT',
  'VIIRS_NOAA20_NRT',
  'VIIRS_NOAA21_NRT',
]);

/**
 * Hülle, innerhalb derer eine BBox liegen muss: DACH mit Rand.
 * Reihenfolge **west, south, east, north** — die Area API erwartet lon/lat,
 * der GWIS-WFS in Version 1.1.0 dagegen lat/lon. Das ist der eine Fallstrick,
 * an dem eine vertauschte Box stillschweigend eine leere Antwort liefert
 * statt eines Fehlers; die Prüfung unten schlägt bei Vertauschung an, weil
 * `45.5` als West-Wert außerhalb der Hülle liegt.
 */
const ENVELOPE = { west: 5.0, south: 45.0, east: 18.0, north: 56.0 };

/** Tagesspanne laut Doku 1..5 (in F0 am eigenen Schlüssel gegengeprüft). */
const MIN_DAYS = 1;
const MAX_DAYS = 5;

/** Antwortgröße, oberhalb derer nicht mehr gepuffert, sondern abgelehnt wird.
 *  Eine DACH-Tagesantwort liegt im niedrigen zweistelligen KB-Bereich; der
 *  Deckel schützt die Edge-Function vor einer entarteten Upstream-Antwort. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Durable-Edge-Cache: 30 min. NRT-Latenz ~3 h ⇒ kein Frischeverlust. */
const EDGE_MAX_AGE_S = 30 * 60;
/** Browser-Cache: kurz. Der Client hält zusätzlich einen Speicher-Cache. */
const BROWSER_MAX_AGE_S = 5 * 60;

/** NASAs eigene Frontend-Prüfung: 32 Zeichen, nur `[0-9a-z]`. */
const KEY_SHAPE = /^[0-9a-z]{32}$/;

/** Header, die vom Upstream übernommen werden. Bewusst OHNE `content-length`
 *  (der Body wird gepuffert und neu gesetzt) und ohne alles Origin-Eigene. */
const PASSTHROUGH_RESPONSE_HEADERS = ['last-modified'];

/** Umgebungs-Lookup, der unter Deno (Netlify Edge) und Node funktioniert. */
export function readMapKey(): string | null {
  const g = globalThis as unknown as {
    Deno?: { env?: { get(k: string): string | undefined } };
    process?: { env?: Record<string, string | undefined> };
  };
  const raw = g.Deno?.env?.get?.('FIRMS_MAP_KEY') ?? g.process?.env?.FIRMS_MAP_KEY ?? null;
  const key = raw?.trim();
  return key ? key : null;
}

export interface FirmsRequest {
  source: string;
  bbox: string;
  days: number;
  /** Optionales Startdatum `YYYY-MM-DD`; ohne Angabe die jüngsten Tage. */
  date: string | null;
}

/**
 * Zerlegt `/_firms/<SOURCE>/<west,south,east,north>/<days>[/<YYYY-MM-DD>]`
 * und prüft jede Komponente. Gibt `null` zurück, sobald etwas nicht passt —
 * der Aufrufer antwortet dann mit 400 statt blind zu proxien.
 *
 * Der Query-String wird bewusst **nicht** ausgewertet und nicht weitergereicht.
 */
export function parseFirmsPath(requestUrl: string): FirmsRequest | null {
  const url = new URL(requestUrl);
  // Doppelte Kodierung und Traversal-Versuche fallen schon hier durch: der
  // Pfad wird in exakt 3 oder 4 Segmente zerlegt, alles andere ist ungültig.
  const rest = url.pathname.replace(/^\/_firms\//, '');
  if (rest.includes('..') || rest.includes('%')) return null;
  const parts = rest.split('/').filter((p) => p !== '');
  if (parts.length < 3 || parts.length > 4) return null;

  const [source, bbox, daysRaw, date] = parts;

  if (!ALLOWED_SOURCES.has(source)) return null;

  const nums = bbox.split(',');
  if (nums.length !== 4) return null;
  const [west, south, east, north] = nums.map((n) => Number(n));
  if (![west, south, east, north].every((n) => Number.isFinite(n))) return null;
  // Nicht-degenerierte Box …
  if (!(west < east) || !(south < north)) return null;
  // … und vollständig innerhalb der DACH-Hülle. Diese Zeile ist der Grund,
  // warum der Proxy fremden Verbrauch auf Jans Schlüssel nicht ermöglicht.
  if (west < ENVELOPE.west || east > ENVELOPE.east) return null;
  if (south < ENVELOPE.south || north > ENVELOPE.north) return null;

  if (!/^\d+$/.test(daysRaw)) return null;
  const days = Number(daysRaw);
  if (days < MIN_DAYS || days > MAX_DAYS) return null;

  if (date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    // Kalendarisch gültig (schließt 2026-13-40 aus).
    const t = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== date) return null;
  }

  return { source, bbox: `${west},${south},${east},${north}`, days, date: date ?? null };
}

/**
 * Baut die Upstream-URL. Der Schlüssel kommt als Argument, damit die Funktion
 * netzfrei und ohne Umgebung testbar bleibt.
 */
export function resolveFirmsUrl(requestUrl: string, key: string): string | null {
  if (!KEY_SHAPE.test(key)) return null;
  const req = parseFirmsPath(requestUrl);
  if (!req) return null;
  const tail = req.date ? `/${req.date}` : '';
  return `${FIRMS_ORIGIN}/api/area/csv/${key}/${req.source}/${req.bbox}/${req.days}${tail}`;
}

/** Kurze, feste Fehlerantwort — nennt weder Upstream noch Schlüssel. */
function fail(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain;charset=UTF-8', 'cache-control': 'no-store' },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return fail(405, 'Method Not Allowed');
  }

  const key = readMapKey();
  if (!key || !KEY_SHAPE.test(key)) {
    // Konfigurationsfehler, kein Client-Fehler — und ohne jeden Hinweis auf
    // den erwarteten Schlüsselwert. Der Client fällt auf GWIS zurück (F1).
    return fail(503, 'FIRMS proxy not configured');
  }

  const target = resolveFirmsUrl(request.url, key);
  if (!target) return fail(400, 'Bad FIRMS proxy path');

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: request.method, redirect: 'follow' });
  } catch {
    // KEIN String(err): der Fehlertext könnte die URL — und damit den
    // Schlüssel — enthalten. Siehe Kopfkommentar, Abweichung (2).
    return fail(502, 'FIRMS upstream unreachable');
  }

  if (request.method === 'HEAD') {
    const h = new Headers({ 'content-type': 'text/csv;charset=UTF-8' });
    h.set('cache-control', 'no-store');
    return new Response(null, { status: upstream.ok ? 200 : 502, headers: h });
  }

  if (!upstream.ok) {
    // Upstream-Fehlertexte (z. B. „Invalid MAP_KEY.") werden NICHT
    // durchgereicht und NICHT gecacht: sie helfen dem Client nicht und
    // gehören nicht in eine öffentliche Antwort.
    return fail(502, `FIRMS upstream error ${upstream.status}`);
  }

  const len = Number(upstream.headers.get('content-length') ?? '0');
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    return fail(502, 'FIRMS response too large');
  }
  const body = await upstream.text();
  if (body.length > MAX_BODY_BYTES) return fail(502, 'FIRMS response too large');

  // Plausibilitätsprüfung auf den CSV-Kopf. Grund: die API antwortet auf
  // manche Störungen mit Status 200 und einem Klartext-Hinweis im Body.
  // Ein solcher Text darf nicht 30 Minuten durable im Edge-Cache liegen und
  // vom Parser als „keine Brände" gelesen werden — das wäre eine stille
  // Falschaussage genau in der Lage, in der der Layer zählt.
  if (!/^latitude,longitude/.test(body)) {
    return fail(502, 'FIRMS response not CSV');
  }

  const headers = new Headers();
  for (const h of PASSTHROUGH_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('content-type', 'text/csv;charset=UTF-8');
  headers.set('Netlify-CDN-Cache-Control', `public, durable, max-age=${EDGE_MAX_AGE_S}`);
  headers.set('Cache-Control', `public, max-age=${BROWSER_MAX_AGE_S}`);

  return new Response(body, { status: 200, headers });
}

/**
 * Datei-basierte Konfiguration → **kein** `netlify.toml`-Eingriff. Der
 * Schlüssel steht ausschließlich in der Netlify-Umgebungsvariablen
 * `FIRMS_MAP_KEY` (Site settings → Environment variables), nie im Repo.
 */
export const config = {
  path: '/_firms/*',
  cache: 'manual',
};
