/**
 * konserven.mjs — test cases and stored forecasts of the Prüfstand (plan PS-1-3, PS-2-5).
 *
 * A CASE SET is one issue: (source, issue time) with the inputs it points to (archive slot or hindcast slot, by sha256),
 * the stations of the protocol and its lead list. Its hash is the "Fall-Hash". Sources:
 *   archiv    one slot per archive day (the day folder's index names file, slot time and sha256) — development set and track P
 *   hindcast  the 00-UTC slots of the vault by the rule of tresor.json — track R
 * A CONSERVE is the forecast block of one model for one case set, addressed by (model hash, case hash, replay hash of
 * the protocol — the parts of P1 a forecast depends on, `protokoll.mjs`):
 *   <PS_ROOT>/konserven/<protocol>/<modelHash[0..16]>/<source>/<stamp>.f32
 * Written once; a new archive day only adds files (incremental).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { ARCHIVE_ROOT, H, PS_ROOT, hashOf, p, readBlock, readJson, sha256, writeBlock } from './common.mjs';
import { tresorIssues } from './protokoll.mjs';
import { hindcastSlotPath } from './replay.mjs';
import { leadsOf } from '../../../src/pruefstand/protokoll.ts';

export const stampOf = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 13);

/** Archive issues, oldest first: { source, day, issueMs (floor hour), slotAtMs, path, sha256, schema? }. */
export function archiveIssues() {
  const out = [];
  for (const day of readdirSync(ARCHIVE_ROOT).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) {
    const ix = p(ARCHIVE_ROOT, day, 'index.json');
    if (!existsSync(ix)) continue;
    const slot = (readJson(ix).slots ?? []).find((s) => !s.conflict);
    if (!slot) continue;
    const slotAtMs = Date.parse(slot.slotAt);
    out.push({ source: 'archiv', day, issueMs: Math.floor(slotAtMs / H) * H, slotAtMs, path: p(ARCHIVE_ROOT, day, slot.file), sha256: slot.sha256 });
  }
  return out;
}
const hcSha = new Map();
/** Hindcast issues of the vault: { source, day, issueMs, path, sha256 } — only slots that exist. */
export function hindcastIssues(proto) {
  const out = [];
  for (const issueMs of tresorIssues(proto.tresor)) {
    const path = hindcastSlotPath(issueMs);
    if (!existsSync(path)) continue;
    out.push({ source: 'hindcast', day: new Date(issueMs).toISOString().slice(0, 10), issueMs, slotAtMs: issueMs, path, get sha256() { if (!hcSha.has(path)) hcSha.set(path, sha256(readFileSync(path))); return hcSha.get(path); } });
  }
  return out;
}

export function leadsOfIssue(proto, issue) { return leadsOf(proto, new Date(issue.issueMs).getUTCHours()); }
export const caseHash = (proto, issue) => hashOf({ replay: proto.replayHash, source: issue.source, issueMs: issue.issueMs, slot: issue.sha256, stations: proto.net.hash, leads: leadsOfIssue(proto, issue).all });
export const conservePath = (proto, mHash, issue) => p(PS_ROOT, 'konserven', proto.id, mHash.slice(0, 16), issue.source, `${stampOf(issue.issueMs)}.f32`);
export const truthPath = (proto, issue) => p(PS_ROOT, 'faelle', proto.id, issue.source, `${stampOf(issue.issueMs)}.f32`);

export function writeConserve(proto, reg, mHash, issue, block, info) {
  const leads = leadsOfIssue(proto, issue).all;
  return writeBlock(conservePath(proto, mHash, issue), { kind: 'pruefstand/konserve', protocol: proto.id, replayHash: proto.replayHash, model: reg.id, modelHash: mHash, caseHash: caseHash(proto, issue), source: issue.source, day: issue.day, issueMs: issue.issueMs, slotSha256: issue.sha256, shape: [proto.scored.length, leads.length, block.data.length / (proto.scored.length * leads.length)], nq: block.nq, leads, info }, block.data);
}
/** Reads a conserve and checks that it belongs to this protocol, model and case. Returns null when absent. */
export function readConserve(proto, mHash, issue) {
  const f = conservePath(proto, mHash, issue);
  if (!existsSync(f)) return null;
  const b = readBlock(f);
  const h = b.header;
  if (h.replayHash !== proto.replayHash || h.modelHash !== mHash || h.caseHash !== caseHash(proto, issue)) throw new Error(`${f}: Konserve gehört zu einem anderen Protokoll, Modell oder Fall — löschen und neu rechnen`);
  return { ...h, data: b.data, sha256: b.sha256 };
}
export const hasConserve = (proto, mHash, issue) => existsSync(conservePath(proto, mHash, issue));
