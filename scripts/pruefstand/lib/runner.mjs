/**
 * runner.mjs — fills the conserves a run needs (plan PS-2-4/PS-2-5): for every (model, issue) without a stored block a
 * task goes to a pool of worker threads. Tasks are ordered by issue, so a worker parses a slot once and computes several
 * models on it; an engine root is loaded once per worker. Incremental: what is stored is never recomputed.
 */
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { PS_DIR, p } from './common.mjs';
import { hasConserve } from './konserven.mjs';
import { engineRoot, modelHash } from './register.mjs';

export async function ensureConserves(proto, models, issues, { workers = Math.max(1, Math.min(Number(process.env.PRUEFSTAND_WORKERS) || 3, os.cpus().length - 1)), say = () => {} } = {}) {
  const tasks = [];
  const roots = new Map();
  for (const issue of issues) for (const reg of models) {
    if (reg.kind === 'referenz' && reg.name === 'mosmix' && issue.source === 'hindcast') continue;
    if (hasConserve(proto, modelHash(reg), issue)) continue;
    if (reg.kind !== 'referenz' && !roots.has(reg.id)) roots.set(reg.id, engineRoot(reg));
    tasks.push({ reg, issue: { source: issue.source, day: issue.day, issueMs: issue.issueMs, slotAtMs: issue.slotAtMs, path: issue.path }, slotSha: issue.sha256, root: roots.get(reg.id)?.root ?? null });
  }
  if (!tasks.length) return { computed: 0, failed: [], seconds: 0 };
  for (const [id, r] of roots) say(`  Motor ${id}: ${r.how}`);
  const t0 = Date.now();
  const n = Math.min(workers, tasks.length);
  say(`  ${tasks.length} Konserven zu rechnen, ${n} Worker`);
  const failed = [];
  let next = 0, done = 0;
  // issues are handed out in blocks, so the models of one issue stay on one worker (one slot parse)
  const byIssue = new Map();
  for (const t of tasks) { const k = `${t.issue.source}|${t.issue.day}`; if (!byIssue.has(k)) byIssue.set(k, []); byIssue.get(k).push(t); }
  const groups = [...byIssue.values()];
  await Promise.all(Array.from({ length: n }, () => new Promise((resolve, reject) => {
    const w = new Worker(p(PS_DIR, 'replay-worker.mjs'), { execArgv: ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--import', 'file:///' + p(PS_DIR, '../lib/register-ts.mjs')], resourceLimits: { maxOldGenerationSizeMb: 5000 } });
    let queue = [];
    const pump = () => {
      if (!queue.length) { if (next >= groups.length) { w.terminate().then(resolve); return; } queue = [...groups[next++]]; }
      w.postMessage(queue.shift());
    };
    w.on('message', (m) => {
      done += 1;
      if (!m.ok) { failed.push(m); say(`  FEHLER ${m.id} ${m.day}: ${m.error}`); }
      else if (!m.skipped && (done % 10 === 0 || done === tasks.length)) say(`  ${done}/${tasks.length} (${m.id} ${m.day}: ${m.seconds.toFixed(0)} s), ${Math.round((Date.now() - t0) / 1000)} s`);
      pump();
    });
    w.on('error', reject);
    pump();
  })));
  return { computed: tasks.length - failed.length, failed, seconds: Math.round((Date.now() - t0) / 1000) };
}
