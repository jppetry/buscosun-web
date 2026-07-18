/**
 * Netlify Edge Function — Caching-Proxy für den ICON-D2-Wind-Layer (Phase T1.1).
 *
 * Fronted NUR die Wind-GRIB-Fetches (`u_10m` / `v_10m` / `hsurf`) der 2D-Karte.
 * Der bestehende `/_dwd_opendata`-Rewrite (netlify.toml) bleibt für Radar
 * (RADOLAN) und alle übrigen DWD-Quellen UNVERÄNDERT bestehen — diese Funktion
 * hängt an einem eigenen, additiven Pfad `/_dwd_wind/*` und berührt den
 * Radar-Pfad nicht.
 *
 * Warum: Der Client zieht die immutablen per-(Lauf,Step)-GRIB-Dateien heute live
 * von `opendata.dwd.de` (origin-gebunden, ~5 s kalt, kein geteilter Cache). Diese
 * Funktion holt dieselben Bytes **server-seitig** und legt sie in Netlifys
 * **Durable Edge Cache** (`Netlify-CDN-Cache-Control: public, durable, immutable`).
 * Der Dateiname trägt Lauf+Step → die URL ist der Cache-Key und der Inhalt ist
 * unveränderlich. Ein Warm-Cron (T1.2) füllt den Cache vor dem ersten Besucher.
 *
 * OUTPUT-GLEICHHEIT: Es werden exakt dieselben Bytes ausgeliefert wie beim
 * Direkt-Fetch (kein Re-Encoding, kein Decode, kein Eingriff in bz2/GRIB). Nur
 * *woher* und *wie schnell* ändert sich.
 *
 * Portabilität: nutzt ausschließlich Web-Standard-Globals (fetch/Request/Response/
 * URL/Headers) — dadurch sowohl als Netlify-Edge-Function (Deno) lauffähig ALS
 * AUCH in Node 22 importierbar für den Byte-/Header-Korrektheitstest
 * (scripts/verify-wind-transport.mjs).
 */

const DWD_ORIGIN = 'https://opendata.dwd.de';
/** Nur dieser Teilbaum darf proxied werden (Anti-Open-Proxy). */
const ALLOWED_PREFIX = 'weather/nwp/icon-d2/grib/';
/** Durable-Cache-Retention. Inhalt ist per URL (Lauf+Step) immutabel → großzügig
 *  wählbar; alte Läufe altern natürlich aus. 6 h deckt die Nutzungsdauer eines
 *  Laufs komfortabel ab. */
const CACHE_MAX_AGE_S = 6 * 60 * 60;

/** Header, die vom DWD-Origin 1:1 übernommen werden (Rest wird verworfen, damit
 *  keine origin-spezifischen Cache-/Set-Cookie-Header durchsickern). */
const PASSTHROUGH_RESPONSE_HEADERS = ['content-type', 'content-length', 'last-modified', 'etag'];

/**
 * Baut aus dem eingehenden `/_dwd_wind/<rest>`-Request die DWD-Ziel-URL.
 * Gibt `null` zurück, wenn der Pfad nicht auf einen erlaubten, immutablen
 * Wind-GRIB-Dateinamen zeigt (dann 400 statt Blind-Proxy).
 */
export function resolveDwdUrl(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  // Alles nach dem /_dwd_wind-Präfix ist der DWD-Pfad.
  const rest = url.pathname.replace(/^\/_dwd_wind\//, '');
  // Nur der ICON-D2-GRIB-Teilbaum, nur unveränderliche .grib2.bz2-Dateien.
  if (!rest.startsWith(ALLOWED_PREFIX)) return null;
  if (!rest.endsWith('.grib2.bz2')) return null;
  // Kein Directory-Traversal.
  if (rest.includes('..')) return null;
  return `${DWD_ORIGIN}/${rest}${url.search}`;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { 'cache-control': 'no-store' } });
  }

  const dwdUrl = resolveDwdUrl(request.url);
  if (!dwdUrl) {
    return new Response('Bad wind proxy path', { status: 400, headers: { 'cache-control': 'no-store' } });
  }

  let upstream: Response;
  try {
    upstream = await fetch(dwdUrl, { method: request.method, redirect: 'follow' });
  } catch (err) {
    // DWD nicht erreichbar → 502, NICHT cachen. Der Client fällt (T1.3) auf das
    // eingefrorene Manifest / den letzten gewärmten Lauf zurück (stale, nie kalt).
    return new Response(`Upstream fetch failed: ${String(err)}`, {
      status: 502,
      headers: { 'cache-control': 'no-store' },
    });
  }

  const headers = new Headers();
  for (const h of PASSTHROUGH_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  if (!upstream.ok) {
    // Fehler (z. B. Step noch nicht publiziert) NICHT durable cachen — sonst
    // würde ein transienter 404 „festgetackert". Kurzlebig / no-store.
    headers.set('cache-control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  // Erfolg: immutabel + durable edge-cachen. `Netlify-CDN-Cache-Control` steuert
  // ausschließlich den Netlify-Edge-Cache (wird nicht an den Browser geleakt);
  // `Cache-Control` erlaubt zusätzlich den Browser-HTTP-Cache (Datei immutabel).
  headers.set('Netlify-CDN-Cache-Control', `public, durable, max-age=${CACHE_MAX_AGE_S}, immutable`);
  headers.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE_S}, immutable`);
  if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream');

  return new Response(upstream.body, { status: 200, headers });
}

/**
 * Netlify-Edge-Function-Konfiguration (Datei-basiert → KEIN netlify.toml-Eingriff,
 * der Radar-Rewrite bleibt unangetastet). Der Pfad ist additiv und wird erst mit
 * dem nächsten Deploy in Produktion aktiv (Deploy ist in diesem Run zurückgestellt).
 */
export const config = {
  path: '/_dwd_wind/*',
  cache: 'manual',
};
