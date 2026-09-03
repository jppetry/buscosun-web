// ---------------------------------------------------------------------------
// RD3-M0 (5) — jsDelivr-Verhalten für einen Verzeichnis-Push mit 26 Dateien:
// Wie schnell werden meta.json + 25 Frame-PNGs eines NIE zuvor angefragten
// Pfads nach EINEM Push sichtbar, und werden alle zugleich sichtbar?
//
// Vorgehen: gegateter RV-Slot (≥ 10 min alt, DWD direkt) → 25 PNGs + meta.json
// → Push nach `probe/rd3/<stamp>/` im Daten-Repo (NICHT unter radar/ — der
// Spiegel-Job leert radar/ bei jedem Push) → erst DANACH CDN-Polling (eine
// Anfrage vor dem Push würde den 404 62–118 s festhalten, §10.3).
//
// Aufruf: DATA_REPO_DIR=<klon> node --experimental-strip-types \
//           --import ./scripts/lib/register-ts.mjs scripts/radar-mirror-test/cdn-probe.mjs
// Der Klon muss existieren (git clone --depth=1 …/buscosun-data). Aufräumen:
// mit CLEANUP=1 löscht der Lauf nur den Probe-Ordner und pusht.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decompressBz2 } from '../lib/bz2.mjs';
import { encodePng } from '../lib/png.mjs';
import { decodeRvTar } from '../../src/sources/radolanDecode.ts';

const REPO = process.env.DATA_REPO_DIR;
if (!REPO || !existsSync(join(REPO, '.git'))) throw new Error('DATA_REPO_DIR muss auf einen Klon von buscosun-data zeigen');
const CDN = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main';
const log = (...a) => console.log('[cdn]', ...a);
const git = (...args) => execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

function pushWithRetry(msg) {
  for (let i = 1; i <= 4; i++) {
    try {
      git('fetch', '--quiet', '--depth=1', 'origin', 'main');
      git('checkout', '-q', '-B', 'main', 'origin/main');
      return false; // caller re-applies files after reset, then commits
    } catch (e) { if (i === 4) throw e; }
  }
}

function commitPush(msg) {
  git('add', '-A', 'probe');
  try { git('commit', '-q', '-m', msg); } catch { log('nichts zu committen'); return; }
  for (let i = 1; i <= 4; i++) {
    try { git('push', '-q', 'origin', 'HEAD:main'); return; }
    catch (e) {
      log(`push-Versuch ${i} scheiterte, hole neu`);
      git('fetch', '--quiet', '--depth=1', 'origin', 'main');
      git('rebase', '--quiet', 'origin/main');
      if (i === 4) throw e;
    }
  }
}

if (process.env.CLEANUP === '1') {
  git('fetch', '--quiet', '--depth=1', 'origin', 'main');
  git('checkout', '-q', '-B', 'main', 'origin/main');
  rmSync(join(REPO, 'probe'), { recursive: true, force: true });
  commitPush('probe: RD3-M0 CDN-Probe aufgeräumt');
  log('Probe-Ordner entfernt und gepusht.');
  process.exit(0);
}

// 1) Gegateten RV-Slot wählen (≥ 10 min alt) und ableiten.
const slotMs = Math.floor((Date.now() - 10 * 60_000) / 300_000) * 300_000;
const d = new Date(slotMs);
const two = (n) => String(n).padStart(2, '0');
const stamp = `${String(d.getUTCFullYear()).slice(2)}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
const tarUrl = `https://opendata.dwd.de/weather/radar/composite/rv/DE1200_RV${stamp}.tar.bz2`;
log(`Slot ${stamp} (${d.toISOString()}), hole ${tarUrl}`);
const res = await fetch(tarUrl);
if (!res.ok) throw new Error(`DWD ${res.status} — Slot existiert nicht, anderen wählen`);
const tar = new Uint8Array(await res.arrayBuffer());
const run = decodeRvTar(await decompressBz2(tar));

// 2) In den Klon schreiben (nach Reset auf origin/main).
git('fetch', '--quiet', '--depth=1', 'origin', 'main');
git('checkout', '-q', '-B', 'main', 'origin/main');
const dir = join(REPO, 'probe', 'rd3', stamp);
rmSync(join(REPO, 'probe'), { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const frames = [];
for (const f of run.frames) {
  const file = `f${String(f.leadMinutes).padStart(3, '0')}.png`;
  const png = encodePng(f.width, f.height, f.values, 1);
  writeFileSync(join(dir, file), png);
  frames.push({ lead: f.leadMinutes, file, bytes: png.length });
}
writeFileSync(join(dir, 'meta.json'), JSON.stringify({ schema: 0, probe: true, stamp, runAtMs: run.runAtMs, frames }, null, 1));
commitPush(`probe: RD3-M0 CDN-Probe Slot ${stamp} (26 Dateien)`);
const pushedAt = Date.now();
log(`gepusht um ${new Date(pushedAt).toISOString()} — beginne CDN-Polling (ERST jetzt!)`);

// 3) CDN-Polling: 4 Stichproben-Pfade alle 2 s, dann Voll-Sweep über alle 26.
const base = `${CDN}/probe/rd3/${stamp}`;
const probes = ['meta.json', 'f000.png', 'f060.png', 'f120.png'];
const firstOk = {};
const t0 = Date.now();
while (Object.keys(firstOk).length < probes.length && Date.now() - t0 < 5 * 60_000) {
  await Promise.all(probes.map(async (p) => {
    if (firstOk[p]) return;
    try {
      const r = await fetch(`${base}/${p}`, { method: 'HEAD' });
      if (r.ok) { firstOk[p] = Date.now(); log(`${p}: 200 nach ${((Date.now() - pushedAt) / 1000).toFixed(1)} s`); }
    } catch { /* weiter */ }
  }));
  await new Promise((r) => setTimeout(r, 2000));
}
// Voll-Sweep: sind ALLE 26 Pfade da, sobald die Stichproben da sind?
const all = ['meta.json', ...frames.map((f) => f.file)];
const sweep = await Promise.all(all.map(async (p) => {
  try { return (await fetch(`${base}/${p}`, { method: 'HEAD' })).ok; } catch { return false; }
}));
const okCount = sweep.filter(Boolean).length;
log(`Voll-Sweep ${((Date.now() - pushedAt) / 1000).toFixed(1)} s nach Push: ${okCount}/26 Pfade 200`);
if (okCount < all.length) {
  const t1 = Date.now();
  while (Date.now() - t1 < 4 * 60_000) {
    await new Promise((r) => setTimeout(r, 5000));
    const again = await Promise.all(all.map(async (p) => {
      try { return (await fetch(`${base}/${p}`, { method: 'HEAD' })).ok; } catch { return false; }
    }));
    const n = again.filter(Boolean).length;
    log(`Nachzügler-Sweep: ${n}/26 nach ${((Date.now() - pushedAt) / 1000).toFixed(1)} s`);
    if (n === all.length) break;
  }
}
log('fertig — Aufräumen später mit CLEANUP=1.');
