/**
 * replay-worker.mjs — one worker thread of the Prüfstand runner (plan PS-2-4). Gets tasks { reg, issue, root } and writes
 * one conserve per task. A worker keeps the engine of ONE root loaded (module graphs are per thread); the runner sends a
 * worker only tasks of the same model. Slots are parsed once per issue and reused for the next model of the same issue.
 */
import { parentPort } from 'node:worker_threads';
import { sha256 } from './lib/common.mjs';
import { loadProtocol } from './lib/protokoll.mjs';
import { caseHash, leadsOfIssue, writeConserve } from './lib/konserven.mjs';
import { loadEngine, loadTables, predictArchive, predictHindcast, readHindcastSlot } from './lib/replay.mjs';
import { referenceArchive, referenceHindcast } from './lib/referenzen.mjs';
import { modelHash, withTablePaths } from './lib/register.mjs';
import { openW1 } from './lib/wahrheit.mjs';
import { readArchiveSlot } from '../fusionfit/lib/archiveAdapter.mjs';
import { checkBlock } from '../../src/pruefstand/adapter.ts';

const proto = loadProtocol();
const engines = new Map(), tablesOf = new Map();
let w1 = null, slotKey = null, slot = null;

parentPort.on('message', async (task) => {
  try {
    const { reg, issue, root } = task;
    const key = `${issue.source}|${issue.path}`;
    if (slotKey !== key) { slot = issue.source === 'archiv' ? readArchiveSlot(issue.path) : readHindcastSlot(issue.path); slotKey = key; }
    const leads = leadsOfIssue(proto, issue).all;
    const t0 = Date.now();
    let block;
    if (reg.kind === 'referenz') {
      if ((reg.name === 'klima' || (reg.name === 'persistenz' && issue.source === 'hindcast')) && !w1) w1 = openW1(proto);
      block = issue.source === 'archiv' ? referenceArchive(reg.name, proto, slot, issue, leads, w1) : referenceHindcast(reg.name, proto, slot, issue, leads, w1);
      if (!block) { parentPort.postMessage({ ok: true, skipped: true, id: reg.id, day: issue.day }); return; }
    } else {
      if (!engines.has(root)) engines.set(root, await loadEngine(root));
      if (!tablesOf.has(reg.id)) tablesOf.set(reg.id, loadTables(withTablePaths(reg)));
      block = issue.source === 'archiv' ? predictArchive(engines.get(root), tablesOf.get(reg.id), reg, proto, slot, leads) : predictHindcast(engines.get(root), tablesOf.get(reg.id), reg, proto, slot, leads);
    }
    // the contract test: a block in the wrong unit or with non-monotone quantiles is not stored
    const chk = checkBlock({ nStations: proto.scored.length, leads, nq: block.nq, data: block.data }, proto.quantiles.length);
    if (chk.defects.length) { parentPort.postMessage({ ok: false, id: reg.id, day: issue.day, error: `Adapter-Vertrag verletzt: ${chk.defects.join(' | ')}` }); return; }
    if (task.dryRun) { parentPort.postMessage({ ok: true, id: reg.id, day: issue.day, dataSha256: sha256(Buffer.from(block.data.buffer, block.data.byteOffset, block.data.byteLength)) }); return; }
    const mHash = modelHash(reg);
    const sha = writeConserve(proto, reg, mHash, { ...issue, sha256: task.slotSha }, block, { ...block.info, filled: chk.filled, seconds: Math.round((Date.now() - t0) / 100) / 10, root: reg.kind === 'referenz' ? null : root });
    parentPort.postMessage({ ok: true, id: reg.id, day: issue.day, sha256: sha, seconds: (Date.now() - t0) / 1000, info: block.info, caseHash: caseHash(proto, { ...issue, sha256: task.slotSha }) });
  } catch (e) {
    parentPort.postMessage({ ok: false, id: task.reg?.id, day: task.issue?.day, error: String(e?.stack ?? e).slice(0, 1500) });
  }
});
