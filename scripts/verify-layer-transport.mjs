/**
 * verify-layer-transport.mjs — Lokale Korrektheits-Verifikation für Phase T2
 * (V-TRANSPORT-2, Punkte 1+2). Generalisierung von verify-wind-transport.mjs.
 *
 * Prüft OHNE Netlify-CLI die Kern-Zusicherungen des generischen Caching-Proxys
 * (`netlify/edge-functions/dwd-grib.ts`), indem der Edge-Function-Handler als
 * reines Web-Standard-Modul in Node aufgerufen wird:
 *
 *   (1) Ausgelieferte Bytes IDENTISCH zum Direkt-Fetch von DWD (SHA-256 +
 *       Länge) — je T2-Param (t_2m, vmax_10m, tot_prec, clcl/clcm/clch/clct)
 *       + hsurf (Invariante, braucht der Temp-Layer).
 *   (2) Response trägt `Netlify-CDN-Cache-Control: … durable … immutable`;
 *       fehlender Step → nicht-200 + `no-store` (nie durable gecacht);
 *       Pfad-Whitelist lehnt Fremdpfade/Listings/Traversal ab.
 *   (3) Phase T2b-1 (V-TRANSPORT-2b): Whitelist akzeptiert ZUSÄTZLICH den
 *       ICON-D2-EPS-Baum (icosahedral, Fusion-Engine); EPS-Byte-Identität je
 *       EPS-Param (t_2m, u_10m, v_10m, clct, tot_prec — die Menge aus
 *       fetchIconD2EpsGrid) + clat/clon-Invarianten; EPS-Listings weiter 400.
 *
 * Aufruf:  node scripts/verify-layer-transport.mjs
 * (Auf Node < 23.6 startet sich das Skript selbst mit
 *  --experimental-strip-types neu, um den .ts-Handler importieren zu können.)
 */

import { spawnSync } from 'node:child_process';

// Node 22: TypeScript-Import braucht das Strip-Types-Flag → transparent re-exec.
if (!process.features.typescript) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', ...process.argv.slice(1)],
    { stdio: 'inherit' },
  );
  process.exit(r.status ?? 1);
}

const { createHash } = await import('node:crypto');
const { default: handler, resolveDwdUrl } = await import('../netlify/edge-functions/dwd-grib.ts');

const DWD_ORIGIN = 'https://opendata.dwd.de';
const DWD_BASE = `${DWD_ORIGIN}/weather/nwp/icon-d2/grib`;
const EPS_BASE = `${DWD_ORIGIN}/weather/nwp/icon-d2-eps/grib`;
const PARAMS = ['t_2m', 'vmax_10m', 'tot_prec', 'clcl', 'clcm', 'clch', 'clct'];
/** EPS-Menge aus fetchIconD2EpsGrid (src/sources/iconD2EpsSource.ts). */
const EPS_PARAMS = ['t_2m', 'u_10m', 'v_10m', 'clct', 'tot_prec'];
const pad2 = (n) => String(n).padStart(2, '0');
const sha256 = (buf) => createHash('sha256').update(Buffer.from(buf)).digest('hex');

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${msg}`); if (!cond) failures++; };

/** Neuesten Lauf finden, dessen t_2m/Step-0 publiziert ist (Rückwärtssuche). */
async function findRun() {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 0; back < 6; back++) {
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const run = `${cand.getUTCFullYear()}${pad2(cand.getUTCMonth() + 1)}${pad2(cand.getUTCDate())}${pad2(cand.getUTCHours())}`;
    const hh = run.slice(8, 10);
    const res = await fetch(`${DWD_BASE}/${hh}/t_2m/`);
    if (!res.ok) continue;
    const html = await res.text();
    if (html.includes(`icon-d2_germany_regular-lat-lon_single-level_${run}_000_2d_t_2m.grib2.bz2`)) return run;
  }
  return null;
}

/** Neuesten EPS-Lauf finden (icosahedral, eigener Lauf — Rückwärtssuche). */
async function findEpsRun() {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 0; back < 6; back++) {
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const run = `${cand.getUTCFullYear()}${pad2(cand.getUTCMonth() + 1)}${pad2(cand.getUTCDate())}${pad2(cand.getUTCHours())}`;
    const hh = run.slice(8, 10);
    const res = await fetch(`${EPS_BASE}/${hh}/t_2m/`);
    if (!res.ok) continue;
    const html = await res.text();
    if (html.includes(`icon-d2-eps_germany_icosahedral_single-level_${run}_000_2d_t_2m.grib2.bz2`)) return run;
  }
  return null;
}

/** Byte-Identität + Durable-Header für einen DWD-Relativpfad prüfen. */
async function checkFile(relPath, label) {
  const directRes = await fetch(`${DWD_ORIGIN}/${relPath}`);
  if (!directRes.ok) { ok(false, `${label}: Direkt-Fetch ${directRes.status} (${relPath})`); return; }
  const direct = new Uint8Array(await directRes.arrayBuffer());
  const edgeRes = await handler(new Request(`http://localhost/_dwd_grib/${relPath}`));
  ok(edgeRes.status === 200, `${label}: Edge-Response 200 (ist ${edgeRes.status})`);
  const viaEdge = new Uint8Array(await edgeRes.arrayBuffer());
  ok(direct.length === viaEdge.length, `${label}: Länge identisch (${direct.length} == ${viaEdge.length})`);
  ok(sha256(direct) === sha256(viaEdge), `${label}: SHA-256 identisch (${sha256(viaEdge).slice(0, 16)}…)`);
  const cdn = edgeRes.headers.get('netlify-cdn-cache-control') || '';
  ok(/public/.test(cdn) && /durable/.test(cdn) && /immutable/.test(cdn),
    `${label}: Netlify-CDN-Cache-Control durable+immutable → "${cdn}"`);
}

async function main() {
  console.log('== V-TRANSPORT-2 (1/2) — Edge-Function-Korrektheit je Param ==');

  const run = await findRun();
  if (!run) { console.error('Kein publizierter ICON-D2-Lauf gefunden — Netz/Publikation?'); process.exit(2); }
  const hh = run.slice(8, 10);
  console.log(`Lauf: ${run}`);

  // Pfad-Whitelist (Anti-Open-Proxy).
  const sample = `weather/nwp/icon-d2/grib/${hh}/t_2m/icon-d2_germany_regular-lat-lon_single-level_${run}_000_2d_t_2m.grib2.bz2`;
  ok(resolveDwdUrl(`http://localhost/_dwd_grib/${sample}`) === `${DWD_ORIGIN}/${sample}`,
    `resolveDwdUrl → ${DWD_ORIGIN}/${sample.slice(0, 40)}…`);
  ok(resolveDwdUrl('http://localhost/_dwd_grib/etc/passwd') === null, 'resolveDwdUrl lehnt Fremdpfad ab');
  ok(resolveDwdUrl(`http://localhost/_dwd_grib/weather/nwp/icon-d2/grib/${hh}/t_2m/`) === null,
    'resolveDwdUrl lehnt Directory-Listing ab (nicht .grib2.bz2)');
  ok(resolveDwdUrl('http://localhost/_dwd_grib/weather/nwp/icon-d2/grib/../../../x.grib2.bz2') === null,
    'resolveDwdUrl lehnt Traversal ab');
  ok(resolveDwdUrl('http://localhost/_dwd_grib/weather/nwp/icon-eu/grib/00/t_2m/x.grib2.bz2') === null,
    'resolveDwdUrl lehnt Nicht-ICON-D2-Pfad ab');

  // Byte-Identität + Durable-Header je Param (Step 0) + hsurf (Invariante).
  for (const param of PARAMS) {
    const rel = `weather/nwp/icon-d2/grib/${hh}/${param}/icon-d2_germany_regular-lat-lon_single-level_${run}_000_2d_${param}.grib2.bz2`;
    await checkFile(rel, param);
  }
  await checkFile(
    `weather/nwp/icon-d2/grib/${hh}/hsurf/icon-d2_germany_regular-lat-lon_time-invariant_${run}_000_0_hsurf.grib2.bz2`,
    'hsurf',
  );

  // — Phase T2b-1: EPS-Baum (icosahedral, Fusion-Engine) — Whitelist + Bytes. —
  console.log('\n== V-TRANSPORT-2b — EPS-Baum (T2b-1) ==');
  const epsRun = await findEpsRun();
  if (!epsRun) {
    ok(false, 'Kein publizierter ICON-D2-EPS-Lauf gefunden — Netz/Publikation?');
  } else {
    console.log(`EPS-Lauf: ${epsRun}`);
    const ehh = epsRun.slice(8, 10);
    const epsSample = `weather/nwp/icon-d2-eps/grib/${ehh}/t_2m/icon-d2-eps_germany_icosahedral_single-level_${epsRun}_000_2d_t_2m.grib2.bz2`;
    ok(resolveDwdUrl(`http://localhost/_dwd_grib/${epsSample}`) === `${DWD_ORIGIN}/${epsSample}`,
      'resolveDwdUrl akzeptiert EPS-Baum (icon-d2-eps/grib/)');
    ok(resolveDwdUrl(`http://localhost/_dwd_grib/weather/nwp/icon-d2-eps/grib/${ehh}/t_2m/`) === null,
      'resolveDwdUrl lehnt EPS-Directory-Listing ab (nicht .grib2.bz2)');
    for (const param of EPS_PARAMS) {
      await checkFile(
        `weather/nwp/icon-d2-eps/grib/${ehh}/${param}/icon-d2-eps_germany_icosahedral_single-level_${epsRun}_000_2d_${param}.grib2.bz2`,
        `eps:${param}`,
      );
    }
    for (const inv of ['clat', 'clon']) {
      await checkFile(
        `weather/nwp/icon-d2-eps/grib/${ehh}/${inv}/icon-d2-eps_germany_icosahedral_time-invariant_${epsRun}_000_0_${inv}.grib2.bz2`,
        `eps:${inv}`,
      );
    }
  }

  // Fehlerpfad wird NICHT durable gecacht.
  const missing = sample.replace('_000_', '_999_');
  const missRes = await handler(new Request(`http://localhost/_dwd_grib/${missing}`));
  ok(missRes.status !== 200, `Fehlender Step liefert nicht-200 (ist ${missRes.status})`);
  ok(/no-store/.test(missRes.headers.get('cache-control') || ''), 'Fehler-Response ist no-store (kein Durable-Cache)');
  ok(!(missRes.headers.get('netlify-cdn-cache-control') || '').includes('durable'), 'Fehler-Response ohne Durable-CDN-Header');

  console.log(failures === 0 ? '\nALLE CHECKS GRÜN' : `\n${failures} CHECK(S) FEHLGESCHLAGEN`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
