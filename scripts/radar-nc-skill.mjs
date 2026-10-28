// ---------------------------------------------------------------------------
// Phase NC-B — radar-nc-skill: scores the CH extrapolation `rzc-nc/<stamp>/` against the rzc ANALYSES that arrived later
// (the truth), with persistence (the analysis of the stamp, unchanged) as the bar. Per lead and threshold: CSI, bias,
// hits / misses / false alarms over the Swiss box of the rzc grid (unknown pixels skipped). Products that carry
// `meta.blend` (the mix with buscosun Fusion) are scored in their own row, so the two methods can be compared on the
// same days before the switch is turned (`RADAR_NC_BLEND=1`, Rule 2).
//
// Call: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/radar-nc-skill.mjs [--dir <dataRepo>] [--leads 15,30,60,120] [--json <out>]
//   --dir   a local checkout of buscosun-data (else raw.githubusercontent + the GitHub contents API for the slot list)
// Read-only; one evening with a stationary front is not a verdict — collect several rain days.
// ---------------------------------------------------------------------------
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng } from './lib/png.mjs';
import { parseRzcNcImgMeta, RZC_NC_SOURCE } from '../src/sources/radarNowcastImg.ts';
import { parseRzcImgMeta, radarImgStamp, radarImgStampToMs, radarImgFrameFile, radarImgDualFile } from '../src/sources/radarImg.ts';
import { precipFromU8Log, PRECIP_VMAX } from '../src/scalar/RainLayer.ts';

const argv = process.argv.slice(2);
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const DIR = argOf('--dir');
const LEADS = (argOf('--leads') ?? '15,30,45,60,90,120').split(',').map(Number);
const THRESHOLDS = [0.1, 1];
const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/radar/img/v1';
const API = 'https://api.github.com/repos/jppetry/buscosun-data/contents/radar/img/v1';
const W = 710, H = 640;
// Swiss box in CH1903 km (E 485–834, N 75–296) → columns / rows of the rzc grid (row 0 = north, x 255.5 …, y 479.5 …)
const BOX = { c0: 485 - 255, c1: 834 - 255, r0: 479 - 296, r1: 479 - 75 };

async function list(source) {
  if (DIR) { const d = join(DIR, 'radar', 'img', 'v1', source); return existsSync(d) ? readdirSync(d).filter((s) => /^\d{8}T\d{4}$/.test(s)).sort() : []; }
  const r = await fetch(`${API}/${source}`, { headers: { 'user-agent': 'buscosun-web radar-nc-skill' } });
  if (!r.ok) throw new Error(`${r.status} ${source} (GitHub API)`);
  return (await r.json()).map((x) => x.name).filter((s) => /^\d{8}T\d{4}$/.test(s)).sort();
}
async function bytes(rel) {
  if (DIR) { const p = join(DIR, 'radar', 'img', 'v1', rel); return existsSync(p) ? new Uint8Array(readFileSync(p)) : null; }
  const r = await fetch(`${RAW}/${rel}`); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}
const json = async (rel) => { const b = await bytes(rel); return b ? JSON.parse(new TextDecoder().decode(b)) : null; };

/** mm/h plane of a slot frame: the log plane of the dual PNG when present, else the v1 byte. */
async function mmh(dir, v1File, dualFile) {
  const g = dualFile ? await bytes(`${dir}/${dualFile}`) : null;
  const out = new Float32Array(W * H);
  if (g) {
    const p = decodePng(g); if (p.width !== W || p.height !== H || p.channels !== 2) throw new Error(`${dir}/${dualFile}: ${p.width}×${p.height}×${p.channels}`);
    for (let i = 0; i < W * H; i++) out[i] = precipFromU8Log(p.data[2 * i + 1]);
    return out;
  }
  const f = await bytes(`${dir}/${v1File}`); if (!f) return null;
  const p = decodePng(f); if (p.width !== W || p.height !== H || p.channels !== 1) throw new Error(`${dir}/${v1File}: ${p.width}×${p.height}×${p.channels}`);
  for (let i = 0; i < W * H; i++) out[i] = p.data[i] ? (p.data[i] / 255) * PRECIP_VMAX : 0;
  return out;
}
const inBox = (i) => { const r = (i / W) | 0, c = i % W; return r >= BOX.r0 && r <= BOX.r1 && c >= BOX.c0 && c <= BOX.c1; };
function score(truth, fc, thr, skip) {
  let h = 0, m = 0, f = 0;
  for (let i = 0; i < W * H; i++) {
    if (!inBox(i) || (skip && skip[i] === 255)) continue;
    const a = truth[i] >= thr, b = fc[i] >= thr;
    if (a && b) h++; else if (a) m++; else if (b) f++;
  }
  return { h, m, f, csi: h + m + f ? h / (h + m + f) : NaN, bias: h + m ? (h + f) / (h + m) : NaN };
}

const ncStamps = await list(RZC_NC_SOURCE), rzcStamps = new Set(await list('rzc'));
const rows = [];
for (const s of ncStamps) {
  const meta = parseRzcNcImgMeta(await json(`${RZC_NC_SOURCE}/${s}/meta.json`));
  if (!meta) { console.log(`${s}: meta unlesbar — übersprungen`); continue; }
  const aMeta = parseRzcImgMeta(await json(`rzc/${s}/meta.json`));
  const persist = aMeta ? await mmh(`rzc/${s}`, 'frame.png', aMeta.dual?.frames[0]?.file) : null;
  for (const lead of LEADS) {
    const ts = radarImgStamp(radarImgStampToMs(s) + lead * 60_000);
    if (!rzcStamps.has(ts) || !meta.frames.some((f) => f.lead === lead)) continue;
    const tMeta = parseRzcImgMeta(await json(`rzc/${ts}/meta.json`));
    if (!tMeta) continue;
    const truth = await mmh(`rzc/${ts}`, 'frame.png', tMeta.dual?.frames[0]?.file);
    const fc = await mmh(`${RZC_NC_SOURCE}/${s}`, radarImgFrameFile(lead), meta.dual ? radarImgDualFile(lead) : null);
    const ub = await bytes(`${RZC_NC_SOURCE}/${s}/u${String(lead).padStart(3, '0')}.png`);
    const unknown = ub ? decodePng(ub).data : null;
    if (!truth || !fc) continue;
    for (const thr of THRESHOLDS) {
      const e = score(truth, fc, thr, unknown), p = persist ? score(truth, persist, thr, unknown) : null;
      rows.push({ stamp: s, lead, thr, method: meta.blend ? 'blend' : 'translation', csi: e.csi, bias: e.bias, persistCsi: p?.csi ?? NaN, persistBias: p?.bias ?? NaN, wet: e.h + e.m });
    }
  }
}
const r2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
console.log(`radar-nc-skill — ${ncStamps.length} rzc-nc-Slots, ${rows.length / THRESHOLDS.length} Lead-Paare mit Wahrheit (CH-Box, unbekannt übersprungen)\n`);
console.log('Methode      Lead  Schwelle  n   CSI    Bias   Persistenz CSI  Bias   ΔCSI');
for (const method of ['translation', 'blend']) for (const lead of LEADS) for (const thr of THRESHOLDS) {
  const g = rows.filter((r) => r.method === method && r.lead === lead && r.thr === thr && Number.isFinite(r.csi));
  if (!g.length) continue;
  const mean = (k) => g.reduce((a, r) => a + r[k], 0) / g.length;
  console.log(`${method.padEnd(12)} +${String(lead).padStart(3)}  ≥ ${String(thr).padEnd(5)}  ${String(g.length).padStart(2)}  ${r2(mean('csi'))}   ${r2(mean('bias'))}   ${r2(mean('persistCsi'))}            ${r2(mean('persistBias'))}   ${(mean('csi') - mean('persistCsi') >= 0 ? '+' : '') + r2(mean('csi') - mean('persistCsi'))}`);
}
const out = argOf('--json');
if (out) { writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), box: BOX, leads: LEADS, thresholds: THRESHOLDS, rows }, null, 1)); console.log(`\n→ ${out}`); }
