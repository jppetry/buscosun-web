/**
 * verify-repack-publish.mjs — the ICON-D2 publisher against a `main` that moves (V-BW-58).
 *
 * `buscosun-data` is written by many workflows at once (radar, obs, road, sea, point, …: a push every
 * ≈ 43 s in the median, measured 10.10.2026). The publisher replaces the history of `main`, so it is the one
 * place where a push of somebody else can get lost or where the publish itself can be refused.
 *
 * Everything runs against a LOCAL bare remote — no network, no CDN, no production. The competing pusher is
 * injected deterministically through git hooks (`core.hooksPath` via `GIT_CONFIG_*`):
 *   post-checkout  fires right after the publisher's clone  ⇒ "a push between clone and push"
 *   pre-push       fires after git has read the remote refs ⇒ "a push while the publisher uploads"
 *   pre-receive    (in the remote) measures what a push really uploads (quarantine size)
 *
 * The publisher BEFORE the fix is kept as a reference (pinned git blob): it reproduces the failure and is
 * the oracle for "the stored data are byte for byte the same".
 *
 * Fixture = real producer output: the runs of a `buscosun-data` clone (`REPACK_PUB_FIXTURE`, default
 * `../buscosun-data`) or of `data/repack`. Without it the verifier says so and checks nothing.
 *
 *   node scripts/verify-repack-publish.mjs
 */

import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, rmSync, cpSync, writeFileSync, readFileSync, existsSync, readdirSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import * as RM from './lib/repackManifest.mjs';

/** `scripts/publish-repack.mjs` before V-BW-58 (single `git push --force` of a fresh root). */
const REF_BLOB = 'e72baaa9f33e7a90ad35b61710fd76b2f8ec9f53';
const PUBLISHER = resolve('scripts/publish-repack.mjs');

const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
const skipped = [];

const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const sh = (cwd, args, opts = {}) =>
  execFileSync('git', args, { cwd, env: cleanEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

// ── Fixture ────────────────────────────────────────────────────────────────
const runsOf = (root) => {
  const dir = join(root, RM.RUNS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => /^\d{10}$/.test(n) && existsSync(join(dir, n, 'repack.json'))).sort().reverse();
};
const FIX = [process.env.REPACK_PUB_FIXTURE, '../buscosun-data', process.env.REPACK_OUT || 'data/repack']
  .filter(Boolean).map((p) => resolve(p)).find((p) => runsOf(p).length >= 4);
if (!FIX) {
  console.log('ÜBERSPRUNGEN — keine Fixture mit ≥ 4 echten Läufen (REPACK_PUB_FIXTURE, ../buscosun-data, data/repack).');
  console.log('\n0/0 Prüfungen bestanden');
  process.exit(0);
}
const HAVE = runsOf(FIX).slice(0, 4);          // newest first
const [NEWEST, ...OLDER] = HAVE;                // the publish brings NEWEST, the remote holds OLDER
const KEEP = 3;                                 // ⇒ the oldest of OLDER has to leave

// Deterministic stand-ins for the products of the other workflows (same bytes in every world).
const fake = (seed, n) => {
  const out = Buffer.alloc(n);
  let h = createHash('sha256').update(seed).digest();
  for (let o = 0; o < n; o += h.length) { h.copy(out, o, 0, Math.min(h.length, n - o)); h = createHash('sha256').update(h).digest(); }
  return out;
};
const OTHER = {
  '.gitattributes': Buffer.from('# PD-A: Punkt-Chunks sind binaer — NIE Zeilenenden anfassen.\n*.bin -text -diff\n*.png -text -diff\n'),
  '.github/workflows/build.yml': Buffer.from('# seeded workflow — differs from the template on purpose\nname: build\n'),
  '.github/workflows/radar.yml': Buffer.from('name: radar\n'),
  'radar/img/v1/rv/20261010T2035/f000.png': fake('radar', 300_000),
  'point/2026101015/t1/c_0_0.bin': Buffer.concat([Buffer.from('HC\r\nV1\n\r'), fake('point', 200_000)]),
  'obs/v1/latest.json': Buffer.from('{"schema":1,"stations":3}\n'),
};

// ── Reference publisher (before the fix) ───────────────────────────────────
const root = mkdtempSync(join(tmpdir(), 'repack-publish-'));
let REF = null;
try {
  const src = execFileSync('git', ['cat-file', 'blob', REF_BLOB], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const lib = pathToFileURL(resolve('scripts/lib/repackManifest.mjs')).href;
  if (!src.includes("from './lib/repackManifest.mjs'")) throw new Error('Import der Referenz nicht gefunden');
  REF = join(root, 'publish-repack.ref.mjs');
  writeFileSync(REF, src.replace("from './lib/repackManifest.mjs'", `from '${lib}'`));
} catch (e) {
  skipped.push(`Referenz-Publisher (Blob ${REF_BLOB.slice(0, 8)}) nicht im Objektspeicher — Vergleiche gegen den Stand davor entfallen (${String(e.message).split('\n')[0]})`);
}

// ── Hooks: the competing pusher ────────────────────────────────────────────
const HOOKS = join(root, 'hooks');
mkdirSync(HOOKS, { recursive: true });
const RIVAL_JS = join(HOOKS, 'rival.mjs');
writeFileSync(RIVAL_JS, `
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
const event = process.argv[2];
const planFile = process.env.RIVAL_PLAN;
if (!planFile || !existsSync(planFile)) process.exit(0);
const plan = JSON.parse(readFileSync(planFile, 'utf8'));
if (event === 'pre-receive') {
  let n = 0;
  const walk = (p) => { for (const e of readdirSync(p, { withFileTypes: true })) { const f = join(p, e.name); if (e.isDirectory()) walk(f); else n += statSync(f).size; } };
  const q = process.env.GIT_QUARANTINE_PATH;
  if (q && existsSync(q)) walk(q);
  appendFileSync(plan.log, n + '\\n');
  process.exit(0);
}
const left = plan[event] ?? 0;
if (left === 0) process.exit(0);
if (left > 0) plan[event] = left - 1;
plan.fired = (plan.fired ?? 0) + 1;
writeFileSync(planFile, JSON.stringify(plan));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const git = (...a) => execFileSync('git', a, { cwd: plan.rival, env, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
// exactly what radar/obs/road/sea do: onto the CURRENT main, own files only, push without force
git('fetch', '--quiet', 'origin', 'main');
git('checkout', '--quiet', '-B', 'main', 'FETCH_HEAD');
const f = join(plan.rival, 'radar', 'img', 'v1', 'rv', 'rival-' + plan.fired, 'f000.bin');
mkdirSync(dirname(f), { recursive: true });
writeFileSync(f, 'rival ' + plan.fired + '\\r\\n');
git('add', '-A');
git('commit', '--quiet', '-m', 'radar: rival ' + plan.fired);
git('push', '--quiet', 'origin', 'HEAD:main');
`);
const nodeBin = process.execPath.replace(/\\/g, '/');
const hookScript = (ev) => `#!/bin/sh\n"${nodeBin}" "${RIVAL_JS.replace(/\\/g, '/')}" ${ev} </dev/null\n`;
for (const ev of ['post-checkout', 'pre-push']) {
  const f = join(HOOKS, ev);
  writeFileSync(f, hookScript(ev));
  chmodSync(f, 0o755);
}

// ── A world: bare remote with a real-looking stock, producer output, a rival clone ──
function makeWorld(name, { empty = false, flip = false } = {}) {
  const dir = join(root, name);
  const bare = join(dir, 'remote.git');
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '--bare', '--quiet', '--initial-branch=main', bare], { env: cleanEnv() });
  // git drops GIT_CONFIG_* for the receiving side of a local push, so this hook lives in the remote itself
  mkdirSync(join(bare, 'hooks'), { recursive: true });
  writeFileSync(join(bare, 'hooks', 'pre-receive'), hookScript('pre-receive'));
  chmodSync(join(bare, 'hooks', 'pre-receive'), 0o755);

  const seedTip = (() => {
    if (empty) return null;
    const seed = join(dir, 'seed');
    mkdirSync(seed, { recursive: true });
    sh(seed, ['init', '--quiet', '--initial-branch=main']);
    sh(seed, ['config', 'user.name', 'seed']); sh(seed, ['config', 'user.email', 'seed@example.invalid']);
    for (const [p, buf] of Object.entries(OTHER)) { mkdirSync(join(seed, p, '..'), { recursive: true }); writeFileSync(join(seed, p), buf); }
    for (const r of OLDER) cpSync(join(FIX, RM.RUNS_DIR, r), join(seed, RM.RUNS_DIR, r), { recursive: true });
    if (existsSync(join(FIX, RM.HSURF_FILE))) cpSync(join(FIX, RM.HSURF_FILE), join(seed, RM.HSURF_FILE));
    writeFileSync(join(seed, 'index.json'), JSON.stringify({ schema: RM.SCHEMA, commit: '0'.repeat(40), runs: [] }) + '\n');
    writeFileSync(join(seed, 'README.md'), 'old readme\n');
    sh(seed, ['add', '-A']); sh(seed, ['commit', '--quiet', '-m', 'data: seed']);
    for (const n of [4, 5]) {   // a history the publish is supposed to replace
      writeFileSync(join(seed, 'obs', 'v1', 'latest.json'), `{"schema":1,"stations":${n}}\n`);
      sh(seed, ['add', '-A']); sh(seed, ['commit', '--quiet', '-m', `obs: ${n}`]);
    }
    sh(seed, ['push', '--quiet', bare, 'HEAD:main']);
    return sh(seed, ['rev-parse', 'HEAD']);
  })();

  const out = join(dir, 'out');
  cpSync(join(FIX, RM.RUNS_DIR, NEWEST), join(out, RM.RUNS_DIR, NEWEST), { recursive: true });
  rmSync(join(out, RM.RUNS_DIR, NEWEST, RM.RUN_POINTER_FILE), { force: true });   // the producer writes no pointer
  if (existsSync(join(FIX, RM.HSURF_FILE))) cpSync(join(FIX, RM.HSURF_FILE), join(out, RM.HSURF_FILE));
  let flipped = null;
  if (flip) {
    flipped = readdirSync(join(out, RM.RUNS_DIR, NEWEST)).filter((n) => n.endsWith('.png')).sort()[0];
    const f = join(out, RM.RUNS_DIR, NEWEST, flipped);
    const b = readFileSync(f); b[b.length - 1] ^= 0x01; writeFileSync(f, b);
  }

  const rival = join(dir, 'rival');
  if (!empty) {
    execFileSync('git', ['clone', '--quiet', bare, rival], { env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    sh(rival, ['config', 'user.name', 'rival']); sh(rival, ['config', 'user.email', 'rival@example.invalid']);
  }
  return { dir, bare, out, rival, seedTip, flipped, planFile: join(dir, 'plan.json'), logFile: join(dir, 'upload.log') };
}

function publish(script, w, { plan = {}, push = true, env = {} } = {}) {
  writeFileSync(w.planFile, JSON.stringify({ ...plan, rival: w.rival, log: w.logFile }));
  const e = {
    ...cleanEnv(),
    // file:// — only then git honours `--depth=1` (a plain path is cloned in full): the publisher has to
    // work from the SHALLOW clone the Action makes, shallow fetch and push included.
    REPACK_OUT: w.out, REPACK_REPO: pathToFileURL(w.bare).href, REPACK_WORK: join(w.dir, 'work'), REPACK_KEEP: String(KEEP),
    REPACK_NO_PURGE: '1', REPACK_NO_WARM: '1', GITHUB_ACTIONS: 'true',
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: HOOKS,
    RIVAL_PLAN: w.planFile, ...env,
  };
  let code = 0, out = '';
  const t0 = Date.now();
  try {
    out = execFileSync(process.execPath, [script, ...(push ? ['--push'] : [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: e });
  } catch (err) { code = err.status ?? 1; out = `${err.stdout ?? ''}${err.stderr ?? ''}`; }
  const fired = JSON.parse(readFileSync(w.planFile, 'utf8')).fired ?? 0;
  const shallowFile = join(w.dir, 'work', '.git', 'shallow');
  const shallow = existsSync(shallowFile) && readFileSync(shallowFile, 'utf8').trim().length > 0;
  const uploads = existsSync(w.logFile) ? readFileSync(w.logFile, 'utf8').trim().split('\n').filter(Boolean).map(Number) : [];
  return { code, out, fired, uploads, shallow, ms: Date.now() - t0 };
}

// ── Reading a remote ───────────────────────────────────────────────────────
const tipOf = (w) => { try { return sh(w.bare, ['rev-parse', 'refs/heads/main']); } catch { return null; } };
const treeOf = (w, rev = 'refs/heads/main') => {
  const m = new Map();
  for (const line of sh(w.bare, ['ls-tree', '-r', rev], { maxBuffer: 64 << 20 }).split('\n')) {
    if (!line) continue;
    const [meta, path] = line.split('\t');
    const [mode, , sha] = meta.split(' ');
    m.set(path, `${mode} ${sha}`);
  }
  return m;
};
const showOf = (w, rev, path) => sh(w.bare, ['show', `${rev}:${path}`], { maxBuffer: 64 << 20 });
const isIndexFile = (p) => p === 'index.json' || new RegExp(`^${RM.RUNS_DIR}/\\d{10}/${RM.RUN_POINTER_FILE}$`).test(p);
/** index/pointer without the two fields that change with every publish */
const normIndex = (w, rev, p) => { const j = JSON.parse(showOf(w, rev, p)); delete j.commit; delete j.publishedAt; return JSON.stringify(j); };
/** differences between two pushed trees; `allow` = paths that may exist only in `b` */
function diffTrees(wa, wb, allow = () => false) {
  const a = treeOf(wa), b = treeOf(wb), diff = [];
  for (const p of new Set([...a.keys(), ...b.keys()])) {
    if (!a.has(p)) { if (!allow(p)) diff.push(`+${p}`); continue; }
    if (!b.has(p)) { diff.push(`-${p}`); continue; }
    if (isIndexFile(p)) { if (normIndex(wa, 'refs/heads/main', p) !== normIndex(wb, 'refs/heads/main', p)) diff.push(`~${p}`); continue; }
    if (a.get(p) !== b.get(p)) diff.push(`~${p}`);
  }
  return diff;
}
const rootsOf = (w) => sh(w.bare, ['rev-list', '--max-parents=0', 'refs/heads/main']).split('\n').filter(Boolean);
const countOf = (w) => Number(sh(w.bare, ['rev-list', '--count', 'refs/heads/main']));
const subjectsOf = (w) => sh(w.bare, ['log', '--format=%s', 'refs/heads/main']).split('\n');
const isRival = (p) => /^radar\/img\/v1\/rv\/rival-\d+\/f000\.bin$/.test(p);
const short = (list, n = 4) => (list.length ? `${list.slice(0, n).join(', ')}${list.length > n ? ` … (${list.length})` : ''}` : 'keine');

try {
  // ═══ A. Calm remote: the stored data are the same as before the fix ═══════
  const n0 = makeWorld('new-calm');
  const rn0 = publish(PUBLISHER, n0);
  add('A1 ruhiges Remote: Publish gelingt — aus einem FLACHEN Klon, wie in der Action', rn0.code === 0 && rn0.shallow,
    `exit ${rn0.code}, Klon ${rn0.shallow ? 'flach' : 'NICHT flach'}${rn0.code ? ` · ${rn0.out.trim().split('\n').pop()}` : ''}`);

  const head = rn0.code === 0 ? tipOf(n0) : null;
  if (head) {
    const roots = rootsOf(n0);
    const index = JSON.parse(showOf(n0, head, 'index.json'));
    add('A2 Historie ersetzt: zwei Commits, der Daten-Commit ist die Wurzel und der, den der Index nennt',
      countOf(n0) === 2 && roots.length === 1 && index.commit === roots[0],
      `${countOf(n0)} Commit(s), Index → ${String(index.commit).slice(0, 8)}, Wurzel ${roots[0]?.slice(0, 8)}`);

    // every file the index names lies under the commit it names — with the bytes of the source
    const at = treeOf(n0, index.commit), bad = [];
    let files = 0;
    for (const r of index.runs) {
      for (const [fam, v] of Object.entries(r)) {
        if (!v || !Array.isArray(v.steps)) continue;
        for (const s of v.steps) {
          files++;
          const p = `${r.path}/${s.file}`;
          const src = join(FIX, RM.RUNS_DIR, r.run, s.file);
          if (!at.has(p)) { bad.push(`${p}: fehlt`); continue; }
          const want = execFileSync('git', ['hash-object', '--no-filters', src], { encoding: 'utf8', env: cleanEnv() }).trim();
          if (at.get(p).split(' ')[1] !== want) bad.push(`${p}: andere Bytes (${fam})`);
          else if (s.bytes != null && Number(sh(n0.bare, ['cat-file', '-s', want])) !== s.bytes) bad.push(`${p}: Größe ≠ Index`);
        }
      }
    }
    add('A3 jede Datei, die der Index nennt, liegt unter SEINEM Commit — Byte für Byte die Producer-Datei',
      files > 100 && bad.length === 0, `${files} Dateien in ${index.runs.length} Läufen, daneben: ${short(bad)}`);

    const ptrBad = index.runs.filter((r) => {
      const ptr = JSON.parse(showOf(n0, head, `${r.path}/${RM.RUN_POINTER_FILE}`));
      return ptr.commit !== index.commit || JSON.stringify(ptr.runs) !== JSON.stringify([r]);
    }).map((r) => r.run);
    add('A4 Zeiger je Lauf nennen denselben Commit und denselben Eintrag wie der Index', ptrBad.length === 0, `daneben: ${short(ptrBad)}`);

    const kept = index.runs.map((r) => r.run);
    const final = treeOf(n0);
    add('A5 Retention: der neue Lauf ist da, der älteste ist aus dem gepushten Baum',
      kept.join() === [NEWEST, ...OLDER].slice(0, KEEP).join() && ![...final.keys()].some((p) => p.startsWith(`${RM.RUNS_DIR}/${OLDER.at(-1)}/`)),
      `Index [${kept.join(', ')}]`);

    const seed = treeOf(n0, n0.seedTip);
    const foreign = Object.keys(OTHER).filter((p) => final.get(p) !== seed.get(p));
    add('A6 Dateien der anderen Workflows (radar, point, obs, .gitattributes, Workflows) unverändert — auch die abweichende build.yml',
      foreign.length === 0, `verändert: ${short(foreign)}`);
    add('A7 README kommt aus der Vorlage', showOf(n0, head, 'README.md') === readFileSync('scripts/repack-repo/README.md', 'utf8').replace(/\r\n/g, '\n')
      || final.get('README.md')?.split(' ')[1] === execFileSync('git', ['hash-object', 'scripts/repack-repo/README.md'], { encoding: 'utf8', env: cleanEnv() }).trim());
  }

  if (REF && head) {
    const o0 = makeWorld('old-calm');
    const ro0 = publish(REF, o0);
    const tn = sh(n0.bare, ['rev-parse', `${rootsOf(n0)[0]}^{tree}`]);
    const to = ro0.code === 0 ? sh(o0.bare, ['rev-parse', `${rootsOf(o0)[0]}^{tree}`]) : null;
    add('A8 Daten-Commit: derselbe Baum wie beim Publisher davor (Git-Baum-Hash, also jedes Byte und jeder Pfad)',
      ro0.code === 0 && tn === to, `neu ${tn.slice(0, 12)} · davor ${to?.slice(0, 12) ?? `exit ${ro0.code}`}`);
    const d = ro0.code === 0 ? diffTrees(o0, n0) : ['Referenz gescheitert'];
    add('A9 fertiger Baum: gleich bis auf `commit`/`publishedAt` in Index und Zeigern', d.length === 0, `Unterschiede: ${short(d)}`);

    // negative control — the comparison has to bite
    const nf = makeWorld('new-flip', { flip: true });
    const rnf = publish(PUBLISHER, nf);
    const df = rnf.code === 0 ? diffTrees(o0, nf) : [];
    add('A10 Gegenprobe: EIN gekipptes Bit in einem Bild macht genau diesen Pfad ungleich',
      df.length === 1 && df[0] === `~${RM.RUNS_DIR}/${NEWEST}/${nf.flipped}`, `Unterschiede: ${short(df)}`);

    const upOld = ro0.uploads.at(-1) ?? 0, upNew = rn0.uploads.at(-1) ?? 0;
    add('A11 der Push überträgt nur das Neue (gemessen im Remote: Quarantäne des Empfangs) — weniger als die Hälfte des Stands davor',
      upOld > 0 && upNew > 0 && upNew < 0.5 * upOld,
      `neu ${(upNew / 1048576).toFixed(1)} MiB · davor ${(upOld / 1048576).toFixed(1)} MiB`);
  }

  // ═══ B. `main` moves while the publisher uploads ═════════════════════════
  if (REF) {
    const ob = makeWorld('old-during');
    const rob = publish(REF, ob, { plan: { 'pre-push': 1 } });
    add('B1 Fehler nachgestellt: der Publisher davor scheitert, sobald ein anderer Workflow während des Pushs ablegt',
      rob.fired === 1 && rob.code !== 0 && !subjectsOf(ob).some((s) => s.startsWith('data: ICON-D2')),
      `exit ${rob.code} · ${rob.out.trim().split('\n').filter((l) => /rejected|lock|FEHLER/.test(l)).pop()?.trim().slice(0, 110) ?? ''}`);
  }
  const nb = makeWorld('new-during');
  const rnb = publish(PUBLISHER, nb, { plan: { 'pre-push': 2 } });
  {
    const ok = rnb.code === 0;
    const t = ok ? treeOf(nb) : new Map();
    const rivals = [...t.keys()].filter(isRival);
    add('B2 zweimal kommt ein anderer Push dazwischen → der Publish setzt neu auf und gelingt beim dritten Versuch',
      ok && rnb.fired === 2 && /Versuch 3\//.test(rnb.out), `exit ${rnb.code}, ${rnb.fired} fremde Pushes${ok ? '' : ` · ${rnb.out.trim().split('\n').pop()?.slice(0, 120)}`}`);
    add('B3 … und beide fremden Commits liegen im abgelegten Baum', rivals.length === 2, `fremde Dateien: ${short(rivals)}`);
    if (head) {
      const d = ok ? diffTrees(n0, nb, isRival) : ['—'];
      add('B4 … der Rest des Baums ist derselbe wie ohne Störung', d.length === 0, `Unterschiede: ${short(d)}`);
    }
    add('B5 … die Historie ist trotzdem ersetzt (zwei Commits)', ok && countOf(nb) === 2, ok ? `${countOf(nb)} Commit(s)` : '');
  }

  // ═══ C. A push lands between the publisher's clone and its push ══════════
  if (REF) {
    const oc = makeWorld('old-between');
    const roc = publish(REF, oc, { plan: { 'post-checkout': 1 } });
    const lost = roc.code === 0 && ![...treeOf(oc).keys()].some(isRival);
    add('C1 Fehler nachgestellt: der Publisher davor verwirft still, was zwischen seinem Klon und seinem Push abgelegt wurde',
      roc.fired === 1 && lost, `exit ${roc.code}, fremde Datei ${lost ? 'VERLOREN' : 'erhalten'}`);
  }
  const nc = makeWorld('new-between');
  const rnc = publish(PUBLISHER, nc, { plan: { 'post-checkout': 1 } });
  {
    const rivals = rnc.code === 0 ? [...treeOf(nc).keys()].filter(isRival) : [];
    add('C2 ein Commit zwischen Klon und Push bleibt erhalten', rnc.fired === 1 && rnc.code === 0 && rivals.length === 1, `exit ${rnc.code}, fremde Dateien: ${short(rivals)}`);
    if (head && rnc.code === 0) {
      const d = diffTrees(n0, nc, isRival);
      add('C3 … der Rest des Baums ist derselbe wie ohne Störung', d.length === 0, `Unterschiede: ${short(d)}`);
    }
  }

  // ═══ D. Contention that never ends ═══════════════════════════════════════
  const nd = makeWorld('new-always');
  const rnd = publish(PUBLISHER, nd, { plan: { 'pre-push': -1 }, env: { REPACK_PUSH_ATTEMPTS: '3' } });
  {
    const subj = subjectsOf(nd);
    add('D1 kommt bei JEDEM Versuch ein Push dazwischen, gibt der Publisher nach der gesetzten Zahl auf (exit ≠ 0)',
      rnd.code !== 0 && rnd.fired === 3, `exit ${rnd.code}, ${rnd.fired} Versuche`);
    add('D2 … und hat im Remote nichts ersetzt: alle fremden Commits und die alte Historie stehen',
      subj.filter((s) => s.startsWith('radar: rival')).length === rnd.fired && subj.includes('data: seed') && !subj.some((s) => s.startsWith('data: ICON-D2') || s.startsWith('index:')),
      `${subj.length} Commits, oberster „${subj[0]}“`);
  }

  // ═══ E. Edges ════════════════════════════════════════════════════════════
  const ne = makeWorld('new-first', { empty: true });
  const rne = publish(PUBLISHER, ne);
  add('E1 erster Publish in ein leeres Remote', rne.code === 0 && countOf(ne) === 2 && treeOf(ne).has(`${RM.RUNS_DIR}/${NEWEST}/repack.json`),
    `exit ${rne.code}`);
  const np = makeWorld('new-dry');
  const before = tipOf(np);
  const rnp = publish(PUBLISHER, np, { push: false });
  add('E2 Probelauf (ohne --push) lässt das Remote unberührt', rnp.code === 0 && tipOf(np) === before && /PROBELAUF/.test(rnp.out), `exit ${rnp.code}`);

  // ═══ F. The REAL tree of the data repo (optional, ≈ 4 GB temp space) ══════
  // REPACK_PUB_REAL     = a clone of buscosun-data (its HEAD becomes the stock of a local test remote)
  // REPACK_PUB_REAL_OUT = a directory with `runs/<run>` the stock does not hold yet (+ hsurf)
  if (REF && process.env.REPACK_PUB_REAL && process.env.REPACK_PUB_REAL_OUT) {
    const REAL = resolve(process.env.REPACK_PUB_REAL), ROUT = resolve(process.env.REPACK_PUB_REAL_OUT);
    const stock = sh(REAL, ['ls-tree', '--name-only', 'HEAD', `${RM.RUNS_DIR}/`]).split('\n').map((p) => p.split('/').pop()).filter((n) => /^\d{10}$/.test(n)).sort();
    const next = runsOf(ROUT).filter((r) => r > stock.at(-1)).sort()[0];
    if (!next) {
      skipped.push(`echter Baum: ${ROUT} führt keinen Lauf, der neuer ist als ${stock.at(-1)}`);
    } else {
      const realWorld = (name, from) => {
        const dir = join(root, name), bare = join(dir, 'remote.git');
        mkdirSync(dir, { recursive: true });
        if (from) cpSync(from, bare, { recursive: true });
        else {
          execFileSync('git', ['clone', '--quiet', '--bare', '--depth=1', pathToFileURL(REAL).href, bare], { env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
          mkdirSync(join(bare, 'hooks'), { recursive: true });
          writeFileSync(join(bare, 'hooks', 'pre-receive'), hookScript('pre-receive'));
          chmodSync(join(bare, 'hooks', 'pre-receive'), 0o755);
        }
        const out = join(dir, 'out');
        cpSync(join(ROUT, RM.RUNS_DIR, next), join(out, RM.RUNS_DIR, next), { recursive: true });
        rmSync(join(out, RM.RUNS_DIR, next, RM.RUN_POINTER_FILE), { force: true });
        if (existsSync(join(ROUT, RM.HSURF_FILE))) cpSync(join(ROUT, RM.HSURF_FILE), join(out, RM.HSURF_FILE));
        return { dir, bare, out, rival: null, seedTip: sh(bare, ['rev-parse', 'refs/heads/main']), planFile: join(dir, 'plan.json'), logFile: join(dir, 'upload.log') };
      };
      // the runner has no autocrlf — keep this machine's setting out of the comparison
      const env = { REPACK_KEEP: '4', GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_1: 'core.autocrlf', GIT_CONFIG_VALUE_1: 'false' };
      const wo = realWorld('real-old');
      const wn = realWorld('real-new', wo.bare);
      const stockTree = treeOf(wo, wo.seedTip);
      const ro = publish(REF, wo, { env });
      const rn = publish(PUBLISHER, wn, { env });
      const okBoth = ro.code === 0 && rn.code === 0;
      add(`F1 echter Baum (${stockTree.size} Dateien, Läufe [${stock.join(', ')}]) + echter Lauf ${next}: beide Publisher legen ab`,
        okBoth, `davor exit ${ro.code} in ${(ro.ms / 1000).toFixed(0)} s · neu exit ${rn.code} in ${(rn.ms / 1000).toFixed(0)} s${rn.code ? ` · ${rn.out.trim().split('\n').pop()?.slice(0, 140)}` : ''}`);
      if (okBoth) {
        const to = sh(wo.bare, ['rev-parse', `${rootsOf(wo)[0]}^{tree}`]), tn = sh(wn.bare, ['rev-parse', `${rootsOf(wn)[0]}^{tree}`]);
        add('F2 echter Baum: Daten-Commit mit demselben Git-Baum-Hash wie beim Publisher davor', to === tn, `neu ${tn.slice(0, 12)} · davor ${to.slice(0, 12)}`);
        const d = diffTrees(wo, wn);
        add('F3 echter Baum: fertiger Baum gleich bis auf `commit`/`publishedAt` in Index und Zeigern', d.length === 0, `Unterschiede: ${short(d)}`);
        const now = treeOf(wn);
        const own = (p) => p.startsWith(`${RM.RUNS_DIR}/`) || p === 'index.json' || p === 'README.md';
        const foreign = [...stockTree.keys()].filter((p) => !own(p));
        const touched = foreign.filter((p) => now.get(p) !== stockTree.get(p));
        const added = [...now.keys()].filter((p) => !own(p) && !stockTree.has(p));
        add('F4 echter Baum: jede Datei der anderen Produkte (radar, obs, point, road, sea, precipsum, Workflows …) unverändert, keine dazu, keine weg',
          foreign.length > 1000 && touched.length === 0 && added.length === 0, `${foreign.length} Dateien geprüft · verändert/fehlend: ${short(touched)} · dazu: ${short(added)}`);
        const bad = readdirSync(join(ROUT, RM.RUNS_DIR, next)).filter((n) => n !== RM.RUN_POINTER_FILE).filter((n) =>
          now.get(`${RM.RUNS_DIR}/${next}/${n}`)?.split(' ')[1] !== execFileSync('git', ['hash-object', '--no-filters', join(ROUT, RM.RUNS_DIR, next, n)], { encoding: 'utf8', env: cleanEnv() }).trim());
        add(`F5 echter Baum: die Dateien des neuen Laufs ${next} liegen Byte für Byte so im Remote, wie der Producer sie geschrieben hat`, bad.length === 0, `daneben: ${short(bad)}`);
        const upO = ro.uploads.at(-1) ?? 0, upN = rn.uploads.at(-1) ?? 0;
        add('F6 echter Baum: der Push überträgt nur den neuen Lauf statt des ganzen Bestands', upO > 0 && upN > 0 && upN < 0.1 * upO,
          `neu ${(upN / 1048576).toFixed(1)} MiB · davor ${(upO / 1048576).toFixed(1)} MiB`);
      }
    }
  }

  const src = readFileSync(PUBLISHER, 'utf8');
  add('E3 Quelltext: kein bedingungsloser Force-Push mehr — nur `--force-with-lease` auf den gelesenen Stand',
    src.includes('--force-with-lease=') && !/['"]--force['"]/.test(src));
} finally {
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
for (const s of skipped) console.log(`· ÜBERSPRUNGEN: ${s}`);
console.log(`\n${checks.length - failed.length}/${checks.length} Prüfungen bestanden (Fixture ${FIX}, Läufe [${HAVE.join(', ')}])`);
process.exit(failed.length ? 1 : 0);
