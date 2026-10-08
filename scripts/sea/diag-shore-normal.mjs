#!/usr/bin/env node
/**
 * V-SW-9 diagnosis — shore normals of the 56 spots: catalogue rule (mask vector mean, 2.5 km) and the coastline rule
 * of the same CWAM mask (`maskCoastNormal`, band 0.5 km), each against an independent reference: the coastline of the
 * BKG DLM250 water areas (AX_Meer 44007, AX_Hafenbecken 44005, AX_Fliessgewaesser 44001, AX_StehendesGewaesser 44006;
 * dl-de/by-2.0, © GeoBasis-DE / BKG) in the same 0.5-km band. The reference is only read for this audit, it does not
 * enter the catalogue (E-SW-31). Hand-set normals (`normalFrom: 'set'`) are listed as a second reference.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/diag-shore-normal.mjs
 *     --dlm=<dir with dlm-44007.json, dlm-44005.json, dlm-44001.json, dlm-44006.json> [--band=0.5] [--json=<out>]
 *     [--spots=<catalogue, default the fixture>]
 *
 * DLM files: WFS https://sgx.geodatenzentrum.de/wfs_dlm250, TYPENAMES=dlm250:objart_<n>_f, OUTPUTFORMAT=application/json,
 * SRSNAME=EPSG:4326, BBOX=6.2,53.2,14.6,55.2,EPSG:4326 (lon/lat order — lat/lon returns 0 features), COUNT=20000.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGrib2 } from '../../src/sources/gribDecode.ts';
import { decompressBz2 } from '../lib/bz2.mjs';
import { SEA_MODELS } from '../../src/sea/seaContract.ts';
import { maskVectorNormal, maskCoastNormal, normalFromSegments, angleDiff } from './shoreNormal.mjs';
import { loadDlm, dlmSegments as dlmSeg } from './dlmCoast.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const BAND = Number(args.band ?? 0.5);

const g = SEA_MODELS.cwam.grid;
const swh = decodeGrib2(new Uint8Array(await decompressBz2(readFileSync(join(ROOT, 'scripts/lib/fixtures/sea/cwam-2026100700/CWAM_SWH_2026100700_010.grib2.bz2'))))).values;
const water = (i, j) => i >= 0 && j >= 0 && i < g.ni && j < g.nj && !Number.isNaN(swh[j * g.ni + i]);

const polys = loadDlm(args.dlm);
const dlmSegments = (lat, lon, radiusKm) => dlmSeg(polys, lat, lon, radiusKm);

const cat = JSON.parse(readFileSync(resolve(ROOT, String(args.spots ?? 'scripts/lib/fixtures/sea/static/spots.json')), 'utf8')).spots;
const rows = [];
for (const s of cat) {
  const old = maskVectorNormal(water, g, s.lat, s.lon);
  const neu = maskCoastNormal(water, g, s.lat, s.lon, { bandKm: BAND });
  const ref = normalFromSegments(dlmSegments(s.lat, s.lon).segs, BAND);
  rows.push({
    id: s.id, name: s.name, region: s.region, from: s.normalFrom, shown: s.normal, set: s.normalFrom === 'set' ? s.normal : null,
    old, neu: neu?.normal ?? null, neuCoastKm: neu?.coastKm ?? null, neuSpread: neu?.spread ?? null,
    ref: ref?.normal ?? null, refCoastKm: ref?.coastKm ?? null, refSpread: ref?.spread ?? null,
    dOldRef: ref ? angleDiff(old, ref.normal) : null, dNewRef: ref && neu ? angleDiff(neu.normal, ref.normal) : null,
    dOldNew: neu ? angleDiff(old, neu.normal) : null,
  });
}
const pad = (x, n) => String(x ?? '–').padStart(n);
console.log('id                       alt  neu  DLM  Hand | alt−DLM neu−DLM alt−neu | Küste maske/DLM km');
for (const r of rows) console.log(`${r.id.padEnd(24)} ${pad(r.old, 4)} ${pad(r.neu, 4)} ${pad(r.ref, 4)} ${pad(r.set, 4)} | ${pad(r.dOldRef, 7)} ${pad(r.dNewRef, 7)} ${pad(r.dOldNew, 7)} | ${pad(r.neuCoastKm, 5)} / ${pad(r.refCoastKm, 5)}`);
const stat = (k) => { const v = rows.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b); return { n: v.length, p50: v[v.length >> 1], p90: v[Math.floor(v.length * 0.9)], max: v[v.length - 1], over20: v.filter((x) => x > 20).length, over45: v.filter((x) => x > 45).length }; };
const summary = { band: BAND, oldVsRef: stat('dOldRef'), newVsRef: stat('dNewRef'), oldVsNew: stat('dOldNew'),
  hand: rows.filter((r) => r.set != null).map((r) => ({ id: r.id, set: r.set, old: r.old, neu: r.neu, ref: r.ref, dOld: angleDiff(r.old, r.set), dNew: r.neu == null ? null : angleDiff(r.neu, r.set), dRef: r.ref == null ? null : angleDiff(r.ref, r.set) })) };
console.log(JSON.stringify(summary, null, 1));
// Variant grid: mask coastline band × smoothing against the SAME reference (DLM, band BAND); hand-set spots separately.
const refs = Object.fromEntries(cat.map((s) => { const d = dlmSegments(s.lat, s.lon).segs; return [s.id, { r05: normalFromSegments(d, BAND)?.normal ?? null, r10: normalFromSegments(d, 1.0)?.normal ?? null, r20: normalFromSegments(d, 2.0)?.normal ?? null }]; }));
const st2 = (v) => { v = v.filter((x) => x != null).sort((a, b) => a - b); return `p50 ${v[v.length >> 1]} p90 ${v[Math.floor(v.length * 0.9)]} >20° ${v.filter((x) => x > 20).length} >45° ${v.filter((x) => x > 45).length}`; };
const variants = [];
const hands = cat.filter((s) => s.normalFrom === 'set');
const oldOf = (s) => maskVectorNormal(water, g, s.lat, s.lon);
variants.push({ rule: 'alt (Vektormittel 2,5 km)', vsRef: st2(cat.map((s) => angleDiff(oldOf(s), refs[s.id].r05))), hand: hands.map((s) => angleDiff(oldOf(s), s.normal)).join('/') });
for (const smooth of [0, 1, 2]) for (const band of [0.5, 1.0, 1.5, 2.0]) {
  const nv = (s) => maskCoastNormal(water, g, s.lat, s.lon, { bandKm: band, smooth })?.normal ?? null;
  const ns = cat.map(nv);
  variants.push({
    rule: `Küste Maske, Band ${band} km, Glättung ${smooth}`, smooth, band,
    vsRef: st2(cat.map((s, k) => (ns[k] == null ? null : angleDiff(ns[k], refs[s.id].r05)))),
    vsOld: st2(cat.map((s, k) => (ns[k] == null ? null : angleDiff(ns[k], oldOf(s))))),
    hand: hands.map((s) => { const n = nv(s); return n == null ? '–' : angleDiff(n, s.normal); }).join('/'),
  });
}
variants.push({ rule: 'Referenz DLM Band 1,0 km gegen DLM 0,5 km', vsRef: st2(cat.map((s) => (refs[s.id].r10 == null ? null : angleDiff(refs[s.id].r10, refs[s.id].r05)))), hand: hands.map((s) => angleDiff(refs[s.id].r10, s.normal)).join('/') });
variants.push({ rule: 'Referenz DLM Band 2,0 km gegen DLM 0,5 km', vsRef: st2(cat.map((s) => (refs[s.id].r20 == null ? null : angleDiff(refs[s.id].r20, refs[s.id].r05)))), hand: hands.map((s) => angleDiff(refs[s.id].r20, s.normal)).join('/') });
console.log(`\nVarianten gegen DLM-Küste im ${BAND}-km-Band (56 Spots); Hand = |Δ| zu ${hands.map((s) => s.id).join('/')}`);
for (const v of variants) console.log(`${v.rule.padEnd(44)} ${v.vsRef.padEnd(34)} ${v.vsOld ? `gegen alt ${v.vsOld}`.padEnd(44) : ''.padEnd(44)} Hand ${v.hand}`);
if (typeof args.json === 'string') writeFileSync(args.json, JSON.stringify({ summary, variants, rows }, null, 1) + '\n');
