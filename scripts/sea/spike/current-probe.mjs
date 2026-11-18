#!/usr/bin/env node
/**
 * Phase ST, step 0 — measurement only, no product code (`audit/seewetter-stroemung.md` §1).
 * Walks the GRIB2 messages of BSH surface-current files (`Current_<pkg>_<run>_<day>.grb2`) section by section and
 * prints what the audit table needs: messages, edition, centre, reference time, grid template and grid, product
 * template, parameter, level, time axis, packing template, bitmap, value ranges — and whether the client decoder
 * `src/sources/gribDecode.ts` reads the file as it is.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/current-probe.mjs <file.grb2> [...]
 *     [--json=<out.json>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { decodeGrib2, decodeGrib2All } from '../../../src/sources/gribDecode.ts';

const sgn32 = (dv, o) => { const v = dv.getUint32(o); return v & 0x80000000 ? -(v & 0x7fffffff) : v; };
const sgn16 = (dv, o) => { const v = dv.getUint16(o); return v & 0x8000 ? -(v & 0x7fff) : v; };
const sgn8 = (b) => (b & 0x80 ? -(b & 0x7f) : b);

/** All messages of a file: offset, length and the sections of every field (sections 2–7 may repeat inside one message). */
export function walk(raw) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out = [];
  let p = 0;
  while (p + 16 <= raw.length) {
    if (!(raw[p] === 0x47 && raw[p + 1] === 0x52 && raw[p + 2] === 0x49 && raw[p + 3] === 0x42)) { p++; continue; }
    const edition = raw[p + 7], discipline = raw[p + 6];
    const total = Number(dv.getBigUint64(p + 8));
    const msg = { offset: p, length: total, edition, discipline, fields: [], complete: p + total <= raw.length };
    let o = p + 16, cur = {};
    while (o + 5 <= p + total - 4) {
      const len = dv.getUint32(o), num = raw[o + 4];
      if (len < 5) break;
      if (num === 1) {
        msg.centre = dv.getUint16(o + 5); msg.subCentre = dv.getUint16(o + 7); msg.tablesVersion = raw[o + 9]; msg.localTables = raw[o + 10];
        msg.refSignificance = raw[o + 11];
        msg.ref = new Date(Date.UTC(dv.getUint16(o + 12), raw[o + 14] - 1, raw[o + 15], raw[o + 16], raw[o + 17], raw[o + 18])).toISOString();
        msg.productionStatus = raw[o + 19]; msg.dataType = raw[o + 20];
      } else if (num === 2) cur.local = len;
      else if (num === 3) {
        const gdt = dv.getUint16(o + 12);
        cur.grid = { gdt, points: dv.getUint32(o + 6), sectionLen: len };
        if (gdt === 0) {
          const basic = dv.getUint32(o + 38), sub = dv.getUint32(o + 42);
          const unit = basic === 0 || basic === 0xffffffff ? 1e-6 : basic / (sub === 0xffffffff ? 1 : sub);
          Object.assign(cur.grid, {
            shapeOfEarth: raw[o + 14], ni: dv.getUint32(o + 30), nj: dv.getUint32(o + 34),
            la1: sgn32(dv, o + 46) * unit, lo1: sgn32(dv, o + 50) * unit, resFlags: raw[o + 54],
            la2: sgn32(dv, o + 55) * unit, lo2: sgn32(dv, o + 59) * unit, di: dv.getUint32(o + 63) * unit, dj: dv.getUint32(o + 67) * unit, scanMode: raw[o + 71],
          });
        }
      } else if (num === 4) {
        const pdt = dv.getUint16(o + 7);
        cur.product = {
          pdt, cat: raw[o + 9], num: raw[o + 10], genProcess: raw[o + 11], timeUnit: raw[o + 17], forecastTime: dv.getUint32(o + 18),
          surface1: raw[o + 22], scale1: sgn8(raw[o + 23]), value1: dv.getUint32(o + 24), surface2: raw[o + 28], scale2: sgn8(raw[o + 29]), value2: dv.getUint32(o + 30), sectionLen: len,
        };
      } else if (num === 5) {
        const drt = dv.getUint16(o + 9);
        cur.pack = { drt, dataPoints: dv.getUint32(o + 5), sectionLen: len };
        if (drt === 0 || drt === 2 || drt === 3 || drt === 40 || drt === 41 || drt === 42) Object.assign(cur.pack, { R: dv.getFloat32(o + 11), E: sgn16(dv, o + 15), D: sgn16(dv, o + 17), bits: raw[o + 19], valueType: raw[o + 20] });
      } else if (num === 6) cur.bitmap = { indicator: raw[o + 5], sectionLen: len };
      else if (num === 7) {
        cur.dataLen = len - 5;
        msg.fields.push(cur);
        cur = { grid: cur.grid, local: cur.local };   // sections 2/3 carry over to a repeated field
      }
      o += len;
    }
    msg.end = String.fromCharCode(...raw.subarray(p + total - 4, p + total));
    out.push(msg);
    p += total;
  }
  return out;
}

const round = (x, d = 6) => (typeof x === 'number' ? +x.toFixed(d) : x);
const uniq = (a) => [...new Set(a.map((x) => JSON.stringify(x)))].map((s) => JSON.parse(s));

function stats(values) {
  let n = 0, nan = 0, min = Infinity, max = -Infinity, zero = 0;
  for (const v of values) { if (Number.isNaN(v)) { nan++; continue; } n++; if (v < min) min = v; if (v > max) max = v; if (v === 0) zero++; }
  return { valid: n, masked: nan, min: n ? round(min, 4) : null, max: n ? round(max, 4) : null, zeros: zero };
}

export function probe(file) {
  const raw = new Uint8Array(readFileSync(file));
  const msgs = walk(raw);
  const fields = msgs.flatMap((m) => m.fields.map((f) => ({ ...f, ref: m.ref, discipline: m.discipline, msgLen: m.length })));
  const times = fields.map((f) => ({ id: `${f.discipline}/${f.product?.cat}/${f.product?.num}`, t: f.product?.forecastTime, unit: f.product?.timeUnit }));
  const perParam = {};
  for (const t of times) (perParam[t.id] ??= []).push(t.t);
  const res = {
    file: basename(file), bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex'),
    messages: msgs.length, fieldsPerMessage: uniq(msgs.map((m) => m.fields.length)), allComplete: msgs.every((m) => m.complete && m.end === '7777'),
    editions: uniq(msgs.map((m) => m.edition)), centre: uniq(msgs.map((m) => [m.centre, m.subCentre])), tables: uniq(msgs.map((m) => [m.tablesVersion, m.localTables])),
    refTimes: uniq(msgs.map((m) => m.ref)), refSignificance: uniq(msgs.map((m) => m.refSignificance)), status: uniq(msgs.map((m) => [m.productionStatus, m.dataType])),
    grids: uniq(fields.map((f) => Object.fromEntries(Object.entries(f.grid ?? {}).map(([k, v]) => [k, round(v)])))),
    products: uniq(fields.map((f) => ({ discipline: f.discipline, pdt: f.product?.pdt, cat: f.product?.cat, num: f.product?.num, genProcess: f.product?.genProcess, timeUnit: f.product?.timeUnit, surface1: f.product?.surface1, scale1: f.product?.scale1, value1: f.product?.value1, surface2: f.product?.surface2, scale2: f.product?.scale2, value2: f.product?.value2 }))),
    packing: uniq(fields.map((f) => ({ drt: f.pack?.drt, bits: f.pack?.bits, E: f.pack?.E, D: f.pack?.D, valueType: f.pack?.valueType }))).slice(0, 12),
    packingKinds: uniq(fields.map((f) => f.pack?.drt)), bitmap: uniq(fields.map((f) => f.bitmap?.indicator)),
    localSection: uniq(fields.map((f) => f.local ?? null)),
    timeAxis: Object.fromEntries(Object.entries(perParam).map(([id, t]) => [id, { n: t.length, first: t[0], second: t[1], last: t[t.length - 1], steps: uniq(t.slice(1).map((x, i) => x - t[i])) }])),
    msgBytes: { min: Math.min(...msgs.map((m) => m.length)), max: Math.max(...msgs.map((m) => m.length)) },
  };
  // Does the client decoder read it as it is? First and a middle message, plus the whole file once.
  res.decoder = {};
  try {
    const m0 = msgs[0], f0 = decodeGrib2(raw.subarray(m0.offset, m0.offset + m0.length));
    res.decoder.first = { ok: true, ni: f0.ni, nj: f0.nj, la1: round(f0.la1), lo1: round(f0.lo1), di: round(f0.di), dj: round(f0.dj), scanMode: f0.scanMode, category: f0.category, number: f0.number, forecastTime: f0.forecastTime, ...stats(f0.values) };
  } catch (e) { res.decoder.first = { ok: false, error: String(e?.message ?? e) }; }
  try {
    const t0 = Date.now();
    const all = decodeGrib2All(raw);
    res.decoder.all = { ok: true, fields: all.length, ms: Date.now() - t0 };
    const speed = {};
    for (const f of all) {
      const k = `${f.category}/${f.number}`;
      const s = stats(f.values);
      const a = (speed[k] ??= { n: 0, min: Infinity, max: -Infinity, masked: new Set(), zerosMin: Infinity, zerosMax: 0 });
      a.n++; a.min = Math.min(a.min, s.min ?? Infinity); a.max = Math.max(a.max, s.max ?? -Infinity); a.masked.add(s.masked); a.zerosMin = Math.min(a.zerosMin, s.zeros); a.zerosMax = Math.max(a.zerosMax, s.zeros);
    }
    res.decoder.values = Object.fromEntries(Object.entries(speed).map(([k, a]) => [k, { fields: a.n, min: a.min, max: a.max, maskedCounts: [...a.masked].slice(0, 6), zeros: [a.zerosMin, a.zerosMax] }]));
  } catch (e) { res.decoder.all = { ok: false, error: String(e?.message ?? e) }; }
  return res;
}

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const jsonOut = args.find((a) => a.startsWith('--json='))?.slice(7);
const all = files.map((f) => probe(f));
for (const r of all) console.log(JSON.stringify(r, null, 1));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 1) + '\n');
