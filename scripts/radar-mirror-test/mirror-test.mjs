#!/usr/bin/env node
/**
 * RD-T1 — Messlauf „Radar-Spiegel ins Daten-Repo" (audit/radar-datenrepo.md §10).
 *
 * Spiegelt RADOLAN-RV-Tars und KONRAD3D-XML vom DWD in einen Zweig des Daten-Repos
 * und STEMPELT jede Stufe der Kette je Slot:
 *
 *   slot            5-Minuten-Slot (UTC), aus dem Dateinamen
 *   dwdAt           `Last-Modified` des DWD (= Ablage beim DWD)
 *   seenAt          erster HEAD mit 200 (Abtastzeit POLL_SEC)
 *   downloadedAt    Datei liegt lokal (Bytes, Dauer)
 *   pushedAt        `git push` zurück
 *   cdnAt           erster HEAD 200 auf cdn.jsdelivr.net (Abtastzeit CDN_POLL_SEC)
 *   earlyProbe      bei jedem zweiten Slot wird der CDN-Pfad EINMAL VOR dem Push
 *                   angefragt (simuliert einen zu frühen Client) — misst, ob und wie
 *                   lange jsDelivr das 404 festhält (§3.2 R2)
 *
 * Bewusst OHNE Abhängigkeiten und ohne Import aus buscosun-web: es ist ein Messgerät,
 * kein Producer. Es dekodiert nichts, es spiegelt Bytes. Kein Manifest, kein Purge.
 *
 * Läuft im Daten-Repo auf dem Zweig `radar-test` (workflow_dispatch), NIE auf `main`
 * — dort force-pusht `publish-repack.mjs` den ganzen Baum (audit §3.3 R3).
 *
 * Lokal, ohne Git und ohne CDN:  DRY=1 TEST_MINUTES=7 node mirror-test.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MINUTES = Number(process.env.TEST_MINUTES ?? 120);
const POLL_SEC = Math.max(2, Number(process.env.POLL_SEC ?? 10));
const CDN_POLL_SEC = Math.max(2, Number(process.env.CDN_POLL_SEC ?? 5));
const CDN_MAX_SEC = Number(process.env.CDN_MAX_SEC ?? 600);
const DRY = process.env.DRY === '1';
const BRANCH = process.env.BRANCH ?? 'radar-test';
const REPO = process.env.REPO ?? 'jppetry/buscosun-data';
const KEEP = Number(process.env.KEEP ?? 12);
const ROOT = process.env.OUT ?? process.cwd();
const DIR = join(ROOT, 'radar');
const LOG = join(DIR, 'log.jsonl');
const UA = 'buscosun-radar-mirror-test (audit/radar-datenrepo.md)';

const PRODUCTS = {
  rv: {
    dir: 'rv',
    stamp: (d) => two(d.getUTCFullYear() % 100) + two(d.getUTCMonth() + 1) + two(d.getUTCDate()) + two(d.getUTCHours()) + two(d.getUTCMinutes()),
    file: (s) => `DE1200_RV${s}.tar.bz2`,
    url: (f) => `https://opendata.dwd.de/weather/radar/composite/rv/${f}`,
  },
  konrad3d: {
    dir: 'konrad3d',
    stamp: (d) => `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}T${two(d.getUTCHours())}${two(d.getUTCMinutes())}00`,
    file: (s) => `KONRAD3D_${s}.xml`,
    url: (f) => `https://opendata.dwd.de/weather/radar/konrad3d/${f}`,
  },
};

function two(n) { return String(n).padStart(2, '0'); }
const nowIso = () => new Date().toISOString();
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const slotOf = (ms) => new Date(Math.floor(ms / 300_000) * 300_000);
const cdnUrl = (p, f) => `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/radar/${p.dir}/${f}`;

function log(msg) { console.log(`[${nowIso().slice(11, 19)}] ${msg}`); }

async function head(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': UA }, cache: 'no-store' });
    return { status: r.status, lastModified: r.headers.get('last-modified'), length: Number(r.headers.get('content-length') ?? 0), cacheStatus: r.headers.get('x-cache') ?? r.headers.get('cf-cache-status') ?? '' };
  } catch (e) { return { status: 0, error: String(e.message ?? e) }; }
}

async function download(url) {
  const t0 = Date.now();
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`GET ${url}: ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  return { buf, ms: Date.now() - t0, lastModified: r.headers.get('last-modified') };
}

function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }

function prune(p) {
  const d = join(DIR, p.dir);
  if (!existsSync(d)) return;
  const files = readdirSync(d).filter((f) => !f.startsWith('.')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) rmSync(join(d, f));
}

/** Commit + Push; liefert die Zeit, zu der der Push ZURÜCK ist. */
function publish(msg) {
  if (DRY) return { pushedAt: nowIso(), pushMs: 0, dry: true };
  const t0 = Date.now();
  git(['add', '-A', 'radar']);
  git(['commit', '-q', '-m', msg]);
  git(['push', '-q', 'origin', `HEAD:${BRANCH}`]);
  return { pushedAt: nowIso(), pushMs: Date.now() - t0 };
}

const records = [];   // fertige Zeilen (werden mit dem nächsten Commit in log.jsonl geschrieben)
function record(row) {
  records.push(row);
  mkdirSync(DIR, { recursive: true });
  appendFileSync(LOG, JSON.stringify(row) + '\n');
}

/** Wartet, bis der CDN-Pfad 200 liefert (bis CDN_MAX_SEC). Läuft nebenläufig zur Hauptschleife. */
async function watchCdn(p, file, row) {
  if (DRY) { row.cdnAt = null; row.cdnNote = 'dry'; return; }
  const url = cdnUrl(p, file);
  const t0 = Date.now();
  let tries = 0;
  while (Date.now() - t0 < CDN_MAX_SEC * 1000) {
    const h = await head(url);
    tries++;
    if (h.status === 200) { row.cdnAt = nowIso(); row.cdnTries = tries; row.cdnHeaders = h.cacheStatus; return; }
    await sleep(CDN_POLL_SEC);
  }
  row.cdnAt = null; row.cdnNote = `nicht sichtbar nach ${CDN_MAX_SEC} s (${tries} Versuche)`;
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  for (const p of Object.values(PRODUCTS)) mkdirSync(join(DIR, p.dir), { recursive: true });
  const deadline = Date.now() + MINUTES * 60_000;
  log(`Start · ${MINUTES} min · DWD-Abtastung ${POLL_SEC} s · CDN-Abtastung ${CDN_POLL_SEC} s · Zweig ${BRANCH}${DRY ? ' · DRY (kein Git, kein CDN)' : ''}`);

  // Je Produkt der nächste erwartete Slot. Start = der laufende Slot: sein Tar
  // erscheint ~3,3 min nach Slot-Beginn (KONRAD ~4,75). Ist er beim Start schon
  // da, wird die Zeile als `late` markiert (seenAt sagt dann nichts über die Kette).
  const pending = {};
  for (const [k, p] of Object.entries(PRODUCTS)) pending[k] = { slot: slotOf(Date.now()), polls: 0, firstPollAt: nowIso() };
  let slotIndex = 0;
  const watchers = [];

  while (Date.now() < deadline) {
    for (const [k, p] of Object.entries(PRODUCTS)) {
      const st = pending[k];
      const file = p.file(p.stamp(st.slot));
      const h = await head(p.url(file));
      st.polls++;
      if (h.status !== 200) continue;

      const seenAt = nowIso();
      const dwdAt = h.lastModified ? new Date(h.lastModified).toISOString() : null;
      const row = { product: k, slot: st.slot.toISOString(), file, dwdAt, seenAt, polls: st.polls, firstPollAt: st.firstPollAt };
      // `late`: die Datei lag schon, bevor wir zu schauen begannen (Start mitten im Slot).
      // Ein Tick = zwei HEADs (~1,5 s je) + POLL_SEC ⇒ Toleranz 2 × POLL_SEC + 5 s.
      row.late = dwdAt ? (Date.parse(seenAt) - Date.parse(dwdAt)) / 1000 > 2 * POLL_SEC + 5 : null;

      // Jeder zweite Slot: ein zu früher Client fragt das CDN, BEVOR wir pushen.
      const early = slotIndex % 2 === 1;
      if (early && !DRY) { const e = await head(cdnUrl(p, file)); row.earlyProbe = { at: nowIso(), status: e.status }; }
      else row.earlyProbe = null;

      const dl = await download(p.url(file));
      writeFileSync(join(DIR, p.dir, file), dl.buf);
      row.bytes = dl.buf.length; row.downloadMs = dl.ms; row.downloadedAt = nowIso();
      prune(p);
      Object.assign(row, publish(`radar-test: ${file}`));
      const dwdToPush = dwdAt ? (Date.parse(row.pushedAt) - Date.parse(dwdAt)) / 1000 : null;
      log(`${k} ${file} · DWD ${dwdAt?.slice(11, 19)} · gesehen ${seenAt.slice(11, 19)} (${st.polls} Abfragen) · ${(row.bytes / 1024).toFixed(0)} KB in ${dl.ms} ms · Push ${row.pushedAt.slice(11, 19)} (${row.pushMs} ms) · DWD→Push ${dwdToPush?.toFixed(0)} s${early ? ' · früh angefragt' : ''}`);
      record(row);
      watchers.push(watchCdn(p, file, row).then(() => {
        const total = row.cdnAt && dwdAt ? (Date.parse(row.cdnAt) - Date.parse(dwdAt)) / 1000 : null;
        log(`${k} ${file} · CDN ${row.cdnAt ? row.cdnAt.slice(11, 19) + ` (${row.cdnTries} Versuche)` : row.cdnNote} · DWD→CDN ${total?.toFixed(0) ?? '—'} s`);
      }));
      // nächster Slot dieses Produkts
      pending[k] = { slot: new Date(st.slot.getTime() + 300_000), polls: 0, firstPollAt: nowIso() };
      if (k === 'rv') slotIndex++;
    }
    await sleep(POLL_SEC);
  }

  log('Laufzeit erreicht — warte auf offene CDN-Messungen …');
  await Promise.all(watchers);
  // Log neu schreiben (jetzt mit cdnAt) und als letzten Commit ablegen.
  writeFileSync(LOG, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  if (!DRY) publish('radar-test: log');
  summary();
}

function summary() {
  const rows = records.filter((r) => r.dwdAt);
  const s = (a, b) => (Date.parse(a) - Date.parse(b)) / 1000;
  const lines = ['| Produkt | Slot | DWD-Ablage nach Slot | DWD→gesehen | Download | DWD→Push | DWD→CDN | früh angefragt | CDN-Versuche |', '|---|---|---:|---:|---:|---:|---:|---|---:|'];
  for (const r of rows) {
    lines.push(`| ${r.product} | ${r.slot.slice(11, 16)} | ${s(r.dwdAt, r.slot).toFixed(0)} s | ${r.late ? 'spät' : s(r.seenAt, r.dwdAt).toFixed(0) + ' s'} | ${r.downloadMs} ms | ${s(r.pushedAt, r.dwdAt).toFixed(0)} s | ${r.cdnAt ? s(r.cdnAt, r.dwdAt).toFixed(0) + ' s' : (r.cdnNote ?? '—')} | ${r.earlyProbe ? `ja (${r.earlyProbe.status})` : 'nein'} | ${r.cdnTries ?? '—'} |`);
  }
  const ok = rows.filter((r) => !r.late && r.cdnAt);
  const med = (arr) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
  const tot = ok.map((r) => s(r.cdnAt, r.dwdAt));
  const early = ok.filter((r) => r.earlyProbe).map((r) => s(r.cdnAt, r.pushedAt));
  const clean = ok.filter((r) => !r.earlyProbe).map((r) => s(r.cdnAt, r.pushedAt));
  lines.push('', `**${ok.length} saubere Messungen** · DWD→CDN Median **${med(tot)?.toFixed(0) ?? '—'} s** (min ${tot.length ? Math.min(...tot).toFixed(0) : '—'}, max ${tot.length ? Math.max(...tot).toFixed(0) : '—'})`,
    `Push→CDN ohne frühe Anfrage: Median ${med(clean)?.toFixed(0) ?? '—'} s · mit früher Anfrage (404 vor dem Push): Median ${med(early)?.toFixed(0) ?? '—'} s`);
  const text = lines.join('\n');
  console.log('\n' + text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## radar-test\n\n${text}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
