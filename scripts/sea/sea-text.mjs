#!/usr/bin/env node
/**
 * SW-3 — Seewetter text line: the DWD maritime bulletins of stage 1 (FQDL50, FQDL51, WODL45, FXDL40) into
 * `sea/v1/text/<product>/<issue>.json` — verbatim (`raw`), display text, structure — with the rules of
 * `src/sea/seaText.ts`. Runs in the 15-min workflow `sea.yml` (E-SW-4: own workflow, not the radar mirror).
 *
 * Nothing is lost: the DWD keeps every issue for ≈ 48 h, each pass takes every issue of the window that is not yet in
 * the store (listing of `forecast/german/` + HEAD on the expected names the listing might not show yet). Bulletins that
 * fail a rule go to `quarantine/text-<file>.json` with the rule and the verbatim text — once, not every pass.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/sea-text.mjs --store=<sea/v1> [--now=<iso>]
 * Last stdout line = JSON summary (`added` > 0 ⇒ the workflow commits).
 */
import { readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  SEA_TEXT_PRODUCTS, SEA_TEXT_STAGE1, SEA_TEXT_DWD_BASE, parseSeaBulletin, seaTextProductOfFile, seaExpectedIssues, seaIssueMs, seaIssueStamp,
} from '../../src/sea/seaText.ts';
import { seaTextPath, seaQuarantinePath, SEA_RETENTION } from '../../src/sea/seaContract.ts';
import { readStatus, writeStatus, writeAtomic } from './sea-derive.mjs';

const SELF = fileURLToPath(import.meta.url);
const UA = 'buscosun-sea (buscosun-web/audit/seewetter.md)';

async function listing(fetchImpl) {
  const r = await fetchImpl(`${SEA_TEXT_DWD_BASE}/`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`Liste HTTP ${r.status}`);
  return [...(await r.text()).matchAll(/href="([A-Z0-9]{6}_EDZW_\d{6})"/g)].map((m) => m[1]);
}

/** Issue stamp of a DWD file name, resolved against now. */
function issueOfFile(name, nowMs) {
  const pf = seaTextProductOfFile(name);
  if (!pf) return null;
  const d = new Date(nowMs + 86_400_000);
  for (let back = 0; back < 3; back++) {
    const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, +pf.ddhhmm.slice(0, 2), +pf.ddhhmm.slice(2, 4), +pf.ddhhmm.slice(4, 6));
    if (new Date(ms).getUTCDate() === +pf.ddhhmm.slice(0, 2) && ms <= d.getTime()) return { ...pf, issue: seaIssueStamp(ms), ms };
  }
  return null;
}

export function pruneTexts(storeDir, nowMs) {
  const removed = [];
  for (const p of SEA_TEXT_STAGE1) {
    const dir = join(storeDir, 'text', p);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => /^\d{10}\.json$/.test(f)).sort();
    const old = files.filter((f) => nowMs - seaIssueMs(f.slice(0, 10)) > SEA_RETENTION.textMaxAgeMs);
    for (const f of old.slice(0, Math.max(0, files.length - SEA_RETENTION.textMinKeep))) { rmSync(join(dir, f), { force: true }); removed.push(`${p}/${f}`); }
  }
  return removed;
}

export async function pollTexts({ storeDir, nowMs = Date.now(), fetchImpl = fetch, log = () => {}, killed = process.env.SEA_KILL === '1' }) {
  const st = readStatus(storeDir);
  st.killSwitch = killed;
  if (killed) { writeStatus(storeDir, st, nowMs); return { added: 0, killed: true }; }
  let names = [];
  try { names = await listing(fetchImpl); } catch (e) { log(`Liste: ${e.message} — nur erwartete Namen`); }
  // Expected names the listing might not show yet (HEAD only for the newest few per product).
  const want = new Set(names);
  for (const p of SEA_TEXT_STAGE1) for (const issue of seaExpectedIssues(p, nowMs + 3_600_000, 3)) want.add(`${SEA_TEXT_PRODUCTS[p].file}_EDZW_${issue.slice(4)}`);
  const todo = [...want].map((n) => ({ name: n, ...issueOfFile(n, nowMs) })).filter((x) => x.product && SEA_TEXT_STAGE1.includes(x.product)
    && nowMs - x.ms < SEA_RETENTION.textMaxAgeMs && x.ms - nowMs < 3_600_000
    && !existsSync(join(storeDir, seaTextPath(x.product, x.issue))) && !existsSync(join(storeDir, seaQuarantinePath(`text-${x.name}`))))
    .sort((a, b) => a.ms - b.ms);
  let added = 0, rejected = 0, absent = 0;
  for (const x of todo) {
    let r;
    try { r = await fetchImpl(`${SEA_TEXT_DWD_BASE}/${x.name}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) }); } catch (e) { log(`${x.name}: ${e.message}`); continue; }
    if (r.status === 404) { absent++; continue; }
    if (!r.ok) { log(`${x.name}: HTTP ${r.status}`); continue; }
    const bytes = new Uint8Array(await r.arrayBuffer());
    const lm = r.headers.get('last-modified');
    const v = parseSeaBulletin(bytes, x.name, lm ? Date.parse(lm) : nowMs);
    const fetchedAt = new Date(nowMs).toISOString();
    if (!v.ok) {
      writeAtomic(join(storeDir, seaQuarantinePath(`text-${x.name}`)), JSON.stringify({ schema: 1, product: 'sea-quarantine', file: x.name, at: fetchedAt, dwdAt: lm, reasons: v.reasons, rawLatin1: Buffer.from(bytes).toString('latin1') }, null, 1) + '\n');
      rejected++;
      log(`${x.name}: VERWORFEN (${v.reasons.map((y) => y.rule).join(', ')})`);
      continue;
    }
    const doc = { ...v.doc, sha256: createHash('sha256').update(bytes).digest('hex'), dwdAt: lm ? new Date(lm).toISOString() : null, fetchedAt };
    writeAtomic(join(storeDir, seaTextPath(doc.product, doc.issue)), JSON.stringify(doc) + '\n');
    const prev = st.text[doc.product];
    if (!prev || prev.issue < doc.issue) st.text[doc.product] = { issue: doc.issue, issuedAt: doc.issuedAt, dwdAt: doc.dwdAt, fetchedAt, delayMin: doc.dwdAt ? Math.round((nowMs - Date.parse(doc.dwdAt)) / 60_000) : null };
    added++;
  }
  const removed = pruneTexts(storeDir, nowMs);
  st.textPass = { at: new Date(nowMs).toISOString(), listed: names.length, todo: todo.length, added, rejected, absent };
  writeStatus(storeDir, st, nowMs);
  return { added, rejected, absent, removed: removed.length };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const res = await pollTexts({ storeDir: resolve(String(args.store ?? 'sea/v1')), nowMs: typeof args.now === 'string' ? Date.parse(args.now) : Date.now(), log: (m) => console.log(`[sea-text] ${m}`) });
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) await main();
