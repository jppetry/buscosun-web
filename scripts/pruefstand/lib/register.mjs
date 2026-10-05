/**
 * register.mjs — the model register of the Prüfstand (plan PS-2-1): one JSON per version under
 * `scripts/pruefstand/register/<id>.json` with commit, table hashes, options, freeze date, fit windows and status.
 *
 * Tables live outside the repo under `<PS_ROOT>/tabellen/<sha256[0..12]>-<name>` (copied there with their hash, V-PS-7);
 * the register names file and sha256, the loader checks both. The ENGINE of a version runs from a git worktree of its
 * commit under `<PS_ROOT>/worktrees/<id>` — or straight from the repo when `src/` of the commit equals `src/` of HEAD and
 * the working tree under `src/` is clean. Worktrees share ONE `node_modules` in `<PS_ROOT>/worktrees/` (runtime
 * dependencies of today's lockfile; Node resolves bare imports upwards) — no junctions, nothing to delete through.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { PS_DIR, PS_ROOT, REPO, ensureDir, hashOf, p, readJson, sha256, writeJson } from './common.mjs';
import { fitTouchesTresor } from './protokoll.mjs';
import { ADAPTER_VERSION } from '../../../src/pruefstand/adapter.ts';
import { features } from './replay.mjs';

export const REGISTER_DIR = p(PS_DIR, 'register');
export const TABLES_DIR = p(PS_ROOT, 'tabellen');
export const WORKTREES_DIR = p(PS_ROOT, 'worktrees');
export const REFERENCES = Object.freeze(['klima', 'persistenz', 'roh', 'roh-lapse', 'mosmix']);
const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();

export const normalizeId = (x) => { const s = String(x).trim().toLowerCase(); return s.startsWith('fusion-') || s.startsWith('ref-') || s.startsWith('test-') ? s : `fusion-${s}`; };
export const registerPath = (id) => p(REGISTER_DIR, `${id}.json`);
export function loadRegister(id) {
  const f = registerPath(id);
  if (!existsSync(f)) throw new Error(`Register: kein Eintrag für ${id} (${f}) — zuerst run.mjs --registriere=${id}`);
  const reg = readJson(f);
  if (reg.id !== id) throw new Error(`Register ${f}: id ${reg.id} passt nicht zum Dateinamen`);
  return reg;
}
export const listRegister = () => readdirSync(REGISTER_DIR).filter((f) => /^fusion-.*\.json$/.test(f)).map((f) => readJson(p(REGISTER_DIR, f))).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const champion = () => listRegister().find((r) => r.status === 'champion') ?? null;

/** Copies a table into the table store under its hash and returns the register reference. */
export function storeTable(srcPath, name) {
  const buf = readFileSync(srcPath);
  const h = sha256(buf);
  const file = `${h.slice(0, 12)}-${name}`;
  ensureDir(TABLES_DIR);
  if (!existsSync(p(TABLES_DIR, file))) copyFileSync(srcPath, p(TABLES_DIR, file));
  return { file, sha256: h, from: srcPath.replace(/\\/g, '/') };
}
/** Register entry with absolute table paths (what `loadTables` reads). */
export function withTablePaths(reg) {
  const tables = {};
  for (const [k, t] of Object.entries(reg.tables ?? {})) tables[k] = t ? { ...t, path: p(TABLES_DIR, t.file) } : null;
  return { ...reg, tables };
}

/** The identity of a model's forecasts: same hash ⇒ same numbers on the same case. */
export function modelHash(reg) {
  if (reg.kind === 'referenz') return hashOf({ kind: 'referenz', id: reg.id, version: reg.version ?? 1 });
  return hashOf({ commit: reg.commit, adapter: reg.adapter, options: reg.options, clima: reg.clima, ...(reg.climaHeldOut ? { climaHeldOut: reg.climaHeldOut } : {}), tables: Object.fromEntries(Object.entries(reg.tables ?? {}).map(([k, t]) => [k, t?.sha256 ?? null])), features: features().sha256 });
}
export const referenceEntry = (name) => ({ id: `ref-${name}`, kind: 'referenz', name, version: 1, status: 'referenz' });

/** The root the engine of a version is imported from; creates the worktree when needed. */
export function engineRoot(reg) {
  const full = git('rev-parse', reg.commit);
  if (full !== reg.commit) throw new Error(`${reg.id}: Commit ${reg.commit} löst auf ${full} auf`);
  const sameSrc = git('rev-parse', `${reg.commit}:src`) === git('rev-parse', 'HEAD:src');
  const clean = git('status', '--porcelain', '--', 'src', 'public/climaGrid.json').split('\n').filter((l) => l && !/src\/pruefstand\//.test(l)).length === 0;
  if (sameSrc && clean && git('rev-parse', `${reg.commit}:public/climaGrid.json`) === git('rev-parse', 'HEAD:public/climaGrid.json')) return { root: REPO, how: 'repo (src des Commits = src von HEAD, Arbeitsbaum sauber)' };
  const dir = p(WORKTREES_DIR, reg.id);
  if (!existsSync(p(dir, 'src/pointForecast/cubeSource.ts'))) {
    ensureDir(WORKTREES_DIR);
    git('worktree', 'add', '--detach', dir, reg.commit);
  }
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  if (head !== reg.commit) throw new Error(`${reg.id}: Worktree ${dir} steht auf ${head.slice(0, 7)}, das Register nennt ${reg.commit.slice(0, 7)}`);
  if (execFileSync('git', ['status', '--porcelain', '--', 'src'], { cwd: dir, encoding: 'utf8' }).trim()) throw new Error(`${reg.id}: Worktree ${dir} ist unter src/ verändert`);
  if (!existsSync(p(WORKTREES_DIR, 'node_modules/bz2'))) throw new Error(`${WORKTREES_DIR}/node_modules fehlt — einmalig: package.json und package-lock.json dorthin kopieren und "npm ci --omit=dev --ignore-scripts" ausführen`);
  return { root: dir, how: `worktree ${dir}` };
}

/** Builds and writes a register entry. `tables`: { learned, stack?, clima? } as source paths. */
export function writeRegister(proto, { id, name, order, commit, options, clima, climaHeldOut = null, tables, freeze, freezeNote, fit, status, notes = [] }) {
  const full = git('rev-parse', commit);
  const t = {};
  for (const [k, src] of Object.entries(tables)) t[k] = src ? storeTable(src, `${k}.json`) : null;
  const contaminated = Object.values(fit ?? {}).some((w) => w && w.source === 'hindcast' && fitTouchesTresor(proto.tresor, w.from, w.to));
  const reg = {
    schema: 1, kind: 'fusion', id, name, order, status, commit: full, commitDate: git('log', '-1', '--format=%cI', full), adapter: ADAPTER_VERSION,
    options, clima, ...(climaHeldOut ? { climaHeldOut } : {}), tables: t, freeze, freezeNote, fit,
    tresor: { contaminated, checkedAgainst: proto.tresor.from + ' … ' + proto.tresor.to, note: contaminated ? 'ein Fit-Fenster am Hindcast reicht in den Tresor — Spur R zählt nicht' : 'kein Fit am Hindcast hat Tage im Tresor gesehen' },
    notes,
  };
  reg.modelHash = modelHash(reg);
  writeJson(registerPath(id), reg);
  return reg;
}
