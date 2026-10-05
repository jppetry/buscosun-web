/**
 * common.mjs — paths, hashes and the binary blocks of the Prüfstand (`audit/pruefstand-plan.md`).
 *
 * Code lives in the repo, the large data outside of it (E-PS-7): `PS_ROOT` = C:\dev\buscosun-pruefstand (override with
 * the environment variable PRUEFSTAND_ROOT — the verifier uses a temp folder). The archive, the hindcast and the data
 * repo are read-only inputs.
 *
 * Block file (`writeBlock` / `readBlock`): one JSON header line (UTF-8, ends with \n) followed by raw little-endian
 * Float32 — `shape` in the header, NaN = missing. The sha256 of the whole file is its address in manifests.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url)).split('\\').join('/').replace(/[/]$/, '');
/** Repo root and `scripts/pruefstand` as plain paths with forward slashes (no trailing slash). */
export const REPO = here('../../../');
export const PS_DIR = here('../');
export const PS_ROOT = (process.env.PRUEFSTAND_ROOT || 'C:/dev/buscosun-pruefstand').replace(/\\/g, '/');
export const ARCHIVE_ROOT = (process.env.PUNKTARCHIV_ROOT || 'C:/dev/buscosun-archiv').replace(/\\/g, '/');
export const HINDCAST_ROOT = (process.env.HINDCAST_ROOT || 'C:/dev/buscosun-hindcast').replace(/\\/g, '/');
export const DATA_REPO = (process.env.BUSCOSUN_DATA || 'C:/dev/buscosun-data').replace(/\\/g, '/');

export const H = 3_600_000, TEN = 600_000, DAY = 86_400_000;
export const sha256 = (b) => createHash('sha256').update(b).digest('hex');
export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayMs = (day) => Date.parse(`${day}T00:00:00Z`);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `--key=value` and `--flag` → { key: value | true }; `--key value` is NOT supported on purpose (one spelling). */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] ?? true; else out._.push(a);
  }
  return out;
}

/** Canonical JSON: object keys sorted at every level — the form every protocol/register hash is taken from. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
export const hashOf = (v) => sha256(canonicalJson(v));

export function ensureDir(p) { mkdirSync(p, { recursive: true }); return p; }
export function atomicWrite(path, data) {
  ensureDir(dirname(path));
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const writeJson = (p, v) => atomicWrite(p, `${JSON.stringify(v, null, 1)}\n`);

export function writeBlock(path, header, f32) {
  const head = Buffer.from(`${JSON.stringify({ ...header, n: f32.length })}\n`, 'utf8');
  const body = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
  const buf = Buffer.concat([head, body]);
  atomicWrite(path, buf);
  return sha256(buf);
}
export function readBlock(path) {
  const buf = readFileSync(path);
  const nl = buf.indexOf(10);
  if (nl < 0) throw new Error(`${path}: kein Blockkopf`);
  const header = JSON.parse(buf.subarray(0, nl).toString('utf8'));
  const bytes = buf.subarray(nl + 1);
  if (bytes.length !== header.n * 4) throw new Error(`${path}: ${bytes.length} Bytes, erwartet ${header.n * 4}`);
  const data = new Float32Array(header.n);
  Buffer.from(data.buffer).set(bytes);
  return { header, data, sha256: sha256(buf) };
}
export const blockExists = (p) => existsSync(p);

export function distKm(a, b) {
  const R = 6371.0088, r = Math.PI / 180;
  const dla = (b.lat - a.lat) * r, dlo = (b.lon - a.lon) * r;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Runs `fn` over `items` with at most `limit` in flight; keeps the order of the results. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/** Cached GET into `dir/name` (a `.404` marker remembers an absent file). Returns a Buffer or null. */
export async function cachedGet(url, path, { pauseMs = 150, headers, retries = 3, refresh = false } = {}) {
  if (!refresh && existsSync(path)) return readFileSync(path);
  if (!refresh && existsSync(`${path}.404`)) return null;
  let last = null;
  for (let a = 0; a <= retries; a++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
      await sleep(pauseMs);
      if (r.status === 404) { atomicWrite(`${path}.404`, ''); return null; }
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const b = Buffer.from(await r.arrayBuffer());
      atomicWrite(path, b);
      return b;
    } catch (e) { last = e; await sleep(2000 * (a + 1)); }
  }
  throw last;
}
export const p = (...parts) => join(...parts).replace(/\\/g, '/');
