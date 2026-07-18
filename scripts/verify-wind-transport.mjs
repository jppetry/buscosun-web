/**
 * verify-wind-transport.mjs — Lokale Korrektheits-Verifikation für Phase T1.1.
 *
 * Prüft OHNE Netlify-CLI die beiden Kern-Zusicherungen des Caching-Proxys, indem
 * der Edge-Function-Handler als reines Web-Standard-Modul in Node 22 aufgerufen
 * wird (der Handler nutzt nur fetch/Request/Response/URL/Headers):
 *
 *   (V-WIND-TRANSPORT L.1) Ausgelieferte Bytes IDENTISCH zum Direkt-Fetch von DWD
 *                          (SHA-256 + Länge einer .grib2.bz2).
 *   (V-WIND-TRANSPORT L.2) Response trägt `Netlify-CDN-Cache-Control` mit
 *                          `durable, immutable`; Cache-Key = URL (Lauf+Step).
 *
 * Aufruf:  node --experimental-strip-types scripts/verify-wind-transport.mjs
 */

import { createHash } from 'node:crypto';
import handler, { resolveDwdUrl } from '../netlify/edge-functions/dwd-wind.ts';

const DWD_BASE = 'https://opendata.dwd.de/weather/nwp/icon-d2/grib';
const pad2 = (n) => String(n).padStart(2, '0');
const sha256 = (buf) => createHash('sha256').update(Buffer.from(buf)).digest('hex');

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${msg}`); if (!cond) failures++; };

/** Neuesten Lauf finden, der u_10m/step 0 hat (Rückwärtssuche). */
async function findSampleFile() {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 0; back < 6; back++) {
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const run = `${cand.getUTCFullYear()}${pad2(cand.getUTCMonth() + 1)}${pad2(cand.getUTCDate())}${pad2(cand.getUTCHours())}`;
    const hh = run.slice(8, 10);
    const res = await fetch(`${DWD_BASE}/${hh}/u_10m/`);
    if (!res.ok) continue;
    const html = await res.text();
    const re = new RegExp(`(icon-d2_germany_regular-lat-lon_single-level_${run}_000_2d_u_10m\\.grib2\\.bz2)`);
    const m = html.match(re);
    if (m) return { run, hh, file: m[1] };
  }
  return null;
}

async function main() {
  console.log('== V-WIND-TRANSPORT (L.1/L.2) — Edge-Function-Korrektheit ==');

  const sample = await findSampleFile();
  if (!sample) { console.error('Kein Sample-Wind-File auf DWD gefunden — Netz/Publikation?'); process.exit(2); }
  const { hh, file } = sample;
  const relPath = `weather/nwp/icon-d2/grib/${hh}/u_10m/${file}`;
  console.log(`Sample: ${relPath}`);

  // Pfad-Whitelist (Anti-Open-Proxy) korrekt aufgelöst?
  const dwdUrl = resolveDwdUrl(`http://localhost/_dwd_wind/${relPath}`);
  ok(dwdUrl === `${DWD_BASE.replace('/weather/nwp/icon-d2/grib','')}/${relPath}`, `resolveDwdUrl → ${dwdUrl}`);
  ok(resolveDwdUrl('http://localhost/_dwd_wind/etc/passwd') === null, 'resolveDwdUrl lehnt Fremdpfad ab');
  ok(resolveDwdUrl('http://localhost/_dwd_wind/weather/nwp/icon-d2/grib/09/u_10m/') === null, 'resolveDwdUrl lehnt Directory-Listing ab (nicht .grib2.bz2)');

  // (L.1) Bytes identisch: direkt vs. durch die Edge Function.
  const direct = new Uint8Array(await (await fetch(`https://opendata.dwd.de/${relPath}`)).arrayBuffer());
  const edgeRes = await handler(new Request(`http://localhost/_dwd_wind/${relPath}`));
  ok(edgeRes.status === 200, `Edge-Response Status 200 (ist ${edgeRes.status})`);
  const viaEdge = new Uint8Array(await edgeRes.arrayBuffer());
  ok(direct.length === viaEdge.length, `Länge identisch (${direct.length} == ${viaEdge.length})`);
  ok(sha256(direct) === sha256(viaEdge), `SHA-256 identisch (${sha256(viaEdge).slice(0, 16)}…)`);

  // (L.2) Cache-Header.
  const cdn = edgeRes.headers.get('netlify-cdn-cache-control') || '';
  ok(/durable/.test(cdn), `Netlify-CDN-Cache-Control enthält 'durable' → "${cdn}"`);
  ok(/immutable/.test(cdn), `Netlify-CDN-Cache-Control enthält 'immutable' → "${cdn}"`);
  ok(/public/.test(cdn), `Netlify-CDN-Cache-Control enthält 'public'`);

  // Fehlerpfad wird NICHT durable gecacht.
  const missing = relPath.replace('_000_', '_999_');
  const missRes = await handler(new Request(`http://localhost/_dwd_wind/${missing}`));
  ok(missRes.status !== 200, `Fehlender Step liefert nicht-200 (ist ${missRes.status})`);
  ok(/no-store/.test(missRes.headers.get('cache-control') || ''), 'Fehler-Response ist no-store (kein Durable-Cache)');

  console.log(failures === 0 ? '\nALLE CHECKS GRÜN' : `\n${failures} CHECK(S) FEHLGESCHLAGEN`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
