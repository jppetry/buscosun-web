/**
 * protokoll.mjs — reads protocol P1 (three files) and checks its seal. `siegel.json` holds the sha256 of the canonical
 * form of each file; a file that no longer matches is REJECTED (a changed protocol is P2, plan §3). `sealProtocol` writes
 * the seal — once, when a protocol is frozen.
 */
import { existsSync } from 'node:fs';
import { PS_DIR, DAY, dayMs, hashOf, p, readJson, writeJson } from './common.mjs';
import { validateProtocol } from '../../../src/pruefstand/protokoll.ts';

const FILES = ['protokoll.json', 'pruefnetz.json', 'tresor.json'];
export const protocolDir = (id = 'p1') => p(PS_DIR, 'protokoll', id.toLowerCase());

export function sealProtocol(dir = protocolDir()) {
  const files = Object.fromEntries(FILES.map((f) => [f, hashOf(readJson(p(dir, f)))]));
  const seal = { schema: 1, kind: 'pruefstand/siegel', files, hash: hashOf(files) };
  writeJson(p(dir, 'siegel.json'), seal);
  return seal;
}

/** Loads and verifies the protocol. Throws with the reason when the seal is missing or broken or the content invalid. */
export function loadProtocol(dir = protocolDir()) {
  const sealPath = p(dir, 'siegel.json');
  if (!existsSync(sealPath)) throw new Error(`Protokoll ${dir}: kein Siegel (siegel.json fehlt)`);
  const seal = readJson(sealPath);
  const docs = {};
  for (const f of FILES) {
    docs[f] = readJson(p(dir, f));
    const h = hashOf(docs[f]);
    if (h !== seal.files?.[f]) throw new Error(`Protokoll ${dir}: ${f} passt nicht zum Siegel (${h.slice(0, 12)} gegen ${String(seal.files?.[f]).slice(0, 12)}) — eine Änderung am Protokoll ist P2, nie stillschweigend`);
  }
  if (hashOf(seal.files) !== seal.hash) throw new Error(`Protokoll ${dir}: Siegel in sich nicht stimmig`);
  const defects = validateProtocol(docs['protokoll.json']);
  if (defects.length) throw new Error(`Protokoll ${dir}: ${defects.join('; ')}`);
  const proto = docs['protokoll.json'], net = docs['pruefnetz.json'], tresor = docs['tresor.json'];
  // what a stored forecast depends on: stations, quantiles, leads, the wet threshold, the reference definitions and the vault
  // rule — NOT the judging rules (statistics, gates), so a reading of a gate does not invalidate the conserves
  const replayHash = hashOf({ quantiles: proto.quantiles, leads: proto.leads, issue: proto.issue, wet: proto.variables.wet.thresholdMmH, references: proto.references, net: seal.files['pruefnetz.json'], tresor: seal.files['tresor.json'] });
  return Object.freeze({ ...proto, hash: seal.hash, replayHash, net, tresor, stations: net.stations, scored: net.stations.filter((s) => s.w1) });
}

/** The issue times (ms) of track R by the rule of tresor.json. */
export function tresorIssues(tresor) {
  const first = dayMs(tresor.from) + tresor.gapDays * DAY + tresor.issues.hourUtc * 3_600_000;
  const last = dayMs(tresor.to) - tresor.gapDays * DAY - 14 * DAY;
  const out = [];
  for (let t = first; t <= last; t += tresor.issues.everyDays * DAY) out.push(t);
  return out;
}
/** Does a fit window [from, to] (YYYY-MM-DD) reach into the vault? */
export function fitTouchesTresor(tresor, from, to) {
  return !(to < tresor.from || from > tresor.to);
}
