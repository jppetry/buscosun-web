/**
 * AW-3 — Autobahnwetter as a product of the radar mirror (E-AW-1): the mirror (`radar-mirror.mjs` in the data repo)
 * loads this module from its buscosun-web clone (APP_DIR) and calls three hooks — `seed()` at start, `poll()` in
 * every loop iteration, `copyInto()` inside its healing `publish()`. Plain JS on purpose: the mirror runs without
 * the TS loader; everything that needs the contract (`src/road/roadContract.ts`) runs in child processes
 * (`road-derive.mjs`, `road-catalog.mjs`), exactly like `radar-derive.mjs`.
 *
 * Per 15-min slot (plan AW-2/AW-3, `audit/autobahnwetter.md`):
 *   1. detect   HEAD on the EXPECTED bulletin path of every series every 30 s from slot start
 *   2. load     GET only what arrived (≈ 23 files, 1–37 KB)
 *   3. derive   child process: decode, normalise, rules, classes, atomic write
 *   4. lock     the derive's slot gate decides; red ⇒ obs/h24 of the slot are NOT stored, the last good slot stays
 *   5. publish  the mirror's publish() copies the WHOLE road store next to the radar store (heals force-pushes)
 * Deadline slot + 12 min: missing series are published as `missing`. Past slots (start, after a seam, after a
 * force-push ate the state) are caught up from the DWD 48-h window, one slot per loop iteration, so the radar
 * mirror never stalls: every DWD request has a timeout (`fetchTimeoutMs`), at most `concurrency` run at once, and a
 * poll stops starting requests after `pollBudgetMs` — whatever is left is asked again in the next loop iteration
 * (review finding #1: sequential requests without a timeout could hold the radar loop for minutes).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, cpSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const UA = 'buscosun-road-mirror (buscosun-web/audit/autobahnwetter.md)';
const DAY_MS = 86_400_000;
/** Slots in `status.json` `recent` (6 h). The archive (road-archive.mjs, every 3 h) must run well inside this. */
export const ROAD_RECENT_SLOTS = 24;

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

export function createRoadMirror({
  appDir, mirrorDir, log = console.log, now = () => Date.now(), fetchImpl = fetch,
  killed = process.env.ROAD_KILL === '1', catalogFile = process.env.ROAD_CATALOG_FILE || '',
  maxCatchUpSlots = Number(process.env.ROAD_CATCHUP_SLOTS ?? 96), publishEvery = 8,
  fetchTimeoutMs = 8_000, pollBudgetMs = 10_000, concurrency = 6, maxAttempts = 3,
} = {}) {
  const deriveScript = appDir ? join(appDir, 'scripts', 'road', 'road-derive.mjs') : '';
  const catalogScript = appDir ? join(appDir, 'scripts', 'road', 'road-catalog.mjs') : '';
  const registerTs = appDir ? pathToFileURL(join(appDir, 'scripts', 'lib', 'register-ts.mjs')).href : '';
  const enabled = process.env.ROAD !== '0' && !!appDir && existsSync(deriveScript);
  const store = join(mirrorDir, 'road');            // = road/v1 of the repo
  const work = join(mirrorDir, 'road-work');
  const node = (script, args, timeout = 120_000) => execFileSync(process.execPath, [
    '--experimental-strip-types', '--import', registerTs, script, ...args,
  ], { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });

  let plan = null;                 // contract constants, from `road-derive.mjs --plan`
  let pending = null;              // { slotMs, have: Map<group, file>, tried: Map<group, attempts>, polledAt }
  let catalog = { etag: null, state: 'missing', checkedAt: 0 };
  let caughtUp = 0;
  let seeded = false;
  let rootRef = null;              // the mirror's clone of buscosun-data (V-AW-1: road/fc/v1 is read from it)
  const status = {
    schema: 1, product: 'road-status', job: process.env.GITHUB_RUN_ID ?? 'local', startedAt: new Date(now()).toISOString(),
    updatedAt: null, killSwitch: killed, lastSlot: null, lastPublishedSlot: null, blocked: null,
    catalog: null, groups: {}, balance: null, recent: [],
  };

  function loadPlan() {
    if (plan) return plan;
    plan = JSON.parse(node(deriveScript, ['--plan']).trim().split('\n').pop());
    return plan;
  }

  const slotOf = (ms) => Math.floor(ms / plan.slotMs) * plan.slotMs;
  const stampFiles = (dir, re = /^\d{10}\.json$/) => (existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)).sort() : []);

  function prune() {
    const t = now();
    const keepByAge = (dir, maxAgeMs, minKeep) => {
      const files = stampFiles(dir);
      const old = files.filter((f) => t - stampMs(f.slice(0, 10)) > maxAgeMs);
      const n = Math.max(0, Math.min(old.length, files.length - minKeep));
      for (const f of old.slice(0, n)) rmSync(join(dir, f), { force: true });
    };
    const r = plan.retention;
    keepByAge(join(store, 'obs'), r.obsMaxAgeMs, r.obsMinKeep);
    keepByAge(join(store, 'fc'), r.obsMaxAgeMs, r.obsMinKeep);
    keepByAge(join(store, 'quarantine'), r.quarantineMaxAgeMs, r.quarantineMinKeep);
    const h24 = join(store, 'h24');
    if (existsSync(h24)) for (const g of readdirSync(h24)) keepByAge(join(h24, g), r.h24MaxAgeMs, r.h24MinKeep);
  }

  function stampMs(s) {
    return Date.UTC(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10));
  }
  function stampOf(ms) {
    const d = new Date(ms), two = (n) => String(n).padStart(2, '0');
    return `${two(d.getUTCFullYear() % 100)}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
  }
  function bulletinUrl(g, slotMs) {
    const s = stampOf(slotMs);
    return `${plan.dwdBase}/${g.folder}/swis2-ISXD70_DW${g.cc}_${s.slice(4)}-${s}-${g.kz}---bin`;
  }

  /** At start: what the repo has becomes the store (successor job after the seam); then the slot pointer. */
  function seed(rootDir) {
    if (!enabled) return;
    try { loadPlan(); } catch (e) { log(`road: --plan fehlgeschlagen (${String(e.stderr ?? e.message).split('\n')[0]}) — Straßenwetter AUS`); return; }
    const inRepo = join(rootDir, plan.repoDir);
    rootRef = rootDir;
    mkdirSync(store, { recursive: true });
    if (existsSync(inRepo)) cpSync(inRepo, store, { recursive: true, force: false });
    prune();
    const st = readJson(join(store, plan.statePath));
    const lastMs = st?.slot ? stampMs(st.slot) : NaN;
    const current = slotOf(now());
    // At most `maxCatchUpSlots` past slots are caught up (96 = 24 h: the stuck rule needs 6 h of history).
    const earliest = current - maxCatchUpSlots * plan.slotMs;
    // The slot after the last derived one — never that slot again (a seam re-derived it: double-counted stuck runs,
    // rewrote an `obs` file that is immutable at the CDN). poll() waits while it lies in the future.
    const start = Number.isFinite(lastMs) && lastMs >= earliest ? lastMs + plan.slotMs : earliest;
    pending = newPending(start);
    // The predecessor's status carries over until this job derives its first slot: every radar push writes status.json,
    // and a null `lastPublishedSlot` / missing catalogue there would turn the watcher red at every seam (finding #2).
    const prev = readJson(join(store, plan.statusPath));
    if (prev?.product === 'road-status') {
      for (const k of ['lastSlot', 'lastPublishedSlot', 'blocked', 'groups', 'balance', 'catalog']) if (prev[k] !== undefined) status[k] = prev[k];
      if (prev.recent) status.recent = prev.recent.slice(0, ROAD_RECENT_SLOTS);
    }
    if (prev?.catalog) catalog = { etag: prev.catalog.etag ?? null, state: prev.catalog.state ?? 'ok', checkedAt: Date.parse(prev.catalog.checkedAt ?? '') || 0 };
    seeded = true;
    log(`road: Start · Slot ${stampOf(pending.slotMs)} (${Math.round((current - pending.slotMs) / plan.slotMs)} Slots aufzuholen) · Bestand obs ${stampFiles(join(store, 'obs')).length} · Katalog ${existsSync(join(store, plan.stationsPath)) ? 'da' : 'fehlt'}${killed ? ' · KILL-SWITCH' : ''}`);
  }

  const newPending = (slotMs) => ({ slotMs, have: new Map(), tried: new Map(), polledAt: 0 });

  async function head(url) {
    try {
      const r = await fetchImpl(url, { method: 'HEAD', headers: { 'user-agent': UA }, cache: 'no-store', signal: AbortSignal.timeout(fetchTimeoutMs) });
      return { status: r.status, lastModified: r.headers.get('last-modified') };
    } catch (e) { return { status: 0, error: String(e?.message ?? e) }; }
  }
  async function get(url) {
    const r = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(fetchTimeoutMs) });
    if (!r.ok) throw new Error(`GET ${url}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }

  /** HEAD (+ GET when there) for one series of the pending slot; records a definite answer in `tried`. */
  async function fetchGroup(g, t) {
    const url = bulletinUrl(g, pending.slotMs);
    const h = await head(url);
    const attempts = (pending.tried.get(g.id) ?? 0) + 1;
    if (h.status === 0) { pending.tried.set(g.id, attempts >= maxAttempts ? maxAttempts : -attempts); return; }   // timeout/network: retry
    pending.tried.set(g.id, maxAttempts);
    if (h.status !== 200) return;
    try {
      const buf = await get(url);
      const lm = h.lastModified ? Date.parse(h.lastModified) : NaN;
      pending.have.set(g.id, { buf, lastModified: Number.isFinite(lm) ? new Date(lm).toISOString() : null, ageMin: Number.isFinite(lm) ? Math.max(0, Math.round((t - lm) / 60_000)) : null });
    } catch (e) { pending.tried.set(g.id, attempts >= maxAttempts ? maxAttempts : -attempts); log(`road ${g.id}: ${e.message} — nächster Versuch`); }
  }

  /** Daily ETag check of the station catalogue (plan); a failure keeps the old file and reports `stale`. */
  function checkCatalog() {
    const file = join(store, plan.stationsPath);
    const due = !existsSync(file) || now() - catalog.checkedAt > DAY_MS;
    if (!due) return false;
    catalog.checkedAt = now();
    try {
      const args = [file, ...(existsSync(file) && catalog.etag ? [`--etag=${catalog.etag}`] : []), ...(catalogFile ? [`--file=${catalogFile}`] : [])];
      const out = JSON.parse(node(catalogScript, args).trim().split('\n').pop());
      catalog = { etag: out.etag ?? catalog.etag, state: 'ok', checkedAt: now() };
      log(`road: Katalog ${out.changed ? `neu gebaut (${out.count} Stationen)` : 'unverändert (ETag)'}`);
      return !!out.changed;
    } catch (e) {
      catalog.state = existsSync(file) ? 'stale' : 'missing';
      log(`road: Katalog-Bau fehlgeschlagen (${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? '?'}) — ${catalog.state}`);
      return false;
    }
  }

  /** Derive the pending slot from what arrived, fold the result into the store. Returns the summary. */
  function deriveSlot(slotMs, have, final) {
    const stamp = stampOf(slotMs);
    const inDir = join(work, 'in', stamp);
    const outDir = join(work, 'out', stamp);
    mkdirSync(inDir, { recursive: true });
    // V-AW-1: the route forecast in the clone is the reference of the observe-only rule `cube` (read by the derive).
    const fcDir = rootRef ? join(rootRef, 'road', 'fc', 'v1') : null;
    const groups = { _catalog: catalog.state, _killed: killed, ...(fcDir && existsSync(fcDir) ? { _fcDir: fcDir } : {}) };
    for (const g of plan.groups) {
      const f = have.get(g.id);
      if (f) { writeFileSync(join(inDir, `${g.id}.bin`), f.buf); groups[g.id] = { state: 'ok', ageMin: f.ageMin }; }
      else if (!g.sporadic) groups[g.id] = { state: final ? 'missing' : 'stale', ageMin: null };
    }
    writeFileSync(join(inDir, 'groups.json'), JSON.stringify(groups));
    const t0 = now();
    let summary;
    try {
      summary = JSON.parse(node(deriveScript, [inDir, store, outDir, stamp]).trim().split('\n').pop());
    } catch (e) {
      log(`road ${stamp}: derive FEHLGESCHLAGEN (${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? '?'}) — Slot nicht veröffentlicht`);
      rmSync(inDir, { recursive: true, force: true });
      return { ok: false, stamp, publish: false, reasons: [{ rule: 'slotSchema', detail: 'derive failed' }] };
    }
    // The derive wrote obs/h24 only when the gate was green; quarantine and state always (diagnosis, run counters).
    cpSync(outDir, store, { recursive: true, filter: (src) => !src.endsWith('summary.json') });
    rmSync(join(work, 'in', stamp), { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
    status.lastSlot = stamp;
    if (summary.publish) { status.lastPublishedSlot = stamp; status.blocked = null; }
    else status.blocked = { slot: stamp, reasons: summary.reasons };
    status.groups = summary.groups;
    status.balance = summary.balance;
    status.catalog = { etag: catalog.etag, state: catalog.state, checkedAt: new Date(catalog.checkedAt || now()).toISOString() };
    const dwdLast = [...have.values()].map((f) => f.lastModified).filter(Boolean).sort().pop() ?? null;
    status.recent = [{
      slot: stamp, publish: summary.publish, points: summary.points, values: summary.balance.values,
      rejected: summary.balance.rejected, share: Number(summary.balance.share.toFixed(4)), groups: Object.values(summary.groups).filter((g) => g.state === 'ok').length,
      dwdLastAt: dwdLast, derivedAt: new Date(now()).toISOString(), deriveMs: now() - t0,
      // The archive (road-archive.mjs) keeps this log beyond 6 h — a blocked slot carries its reasons for Gate B.
      ...(summary.publish ? {} : { reasons: summary.reasons }),
    }, ...status.recent].slice(0, ROAD_RECENT_SLOTS);
    prune();
    return summary;
  }

  /**
   * One step per mirror loop iteration. Returns a commit message when something should be pushed now, else null.
   * Live slot: HEAD every 30 s until all regular series arrived or the deadline passed. Past slot (catch-up):
   * GET straight away (the DWD keeps 48 h), missing series count as missing.
   */
  async function poll() {
    if (!enabled || !seeded || !pending) return null;
    const changedCatalog = checkCatalog();
    const t = now();
    const current = slotOf(t);
    if (pending.slotMs > current) return changedCatalog ? 'road: Katalog' : null;
    const live = t - pending.slotMs < plan.deadlineMs;
    if (live && t - pending.polledAt < plan.pollMs) return changedCatalog ? 'road: Katalog' : null;
    pending.polledAt = t;
    // Live: ask again every series not yet there. Past slot: every series until it gave a definite answer (or ran
    // out of attempts). A small pool, a wall-clock budget — the radar loop gets its turn back in ≤ budget + timeout.
    const todo = plan.groups.filter((g) => !pending.have.has(g.id) && (live || (pending.tried.get(g.id) ?? 0) < maxAttempts));
    const t0 = Date.now();
    let next = 0;
    const worker = async () => {
      while (next < todo.length && Date.now() - t0 < pollBudgetMs) await fetchGroup(todo[next++], t);
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
    const regular = plan.groups.filter((g) => !g.sporadic);
    const complete = regular.every((g) => pending.have.has(g.id));
    if (live && !complete) return changedCatalog ? 'road: Katalog' : null;
    // A past slot is derived only once every series answered (else the budget ran out: continue next iteration).
    if (!live && !complete && plan.groups.some((g) => !pending.have.has(g.id) && (pending.tried.get(g.id) ?? 0) < maxAttempts)) return changedCatalog ? 'road: Katalog' : null;
    const s = deriveSlot(pending.slotMs, pending.have, !live || t - pending.slotMs >= plan.deadlineMs);
    const stamp = stampOf(pending.slotMs);
    const behind = Math.round((current - pending.slotMs) / plan.slotMs);
    const got = pending.have.size;
    pending = newPending(pending.slotMs + plan.slotMs);
    if (behind > 1) caughtUp++;
    log(`road ${stamp} · ${got}/${regular.length} Reihen${s.ok === false ? ' · derive-Fehler' : ` · ${s.points} Punkte · verworfen ${(100 * (s.balance?.share ?? 0)).toFixed(1)} % · ${s.publish ? 'frei' : `GESPERRT (${s.reasons.map((r) => r.rule).join(', ')})`}`}${behind > 1 ? ` · Rückstand ${behind}` : ''}`);
    // During catch-up push only every few slots; live slots always.
    if (behind > 1 && caughtUp % publishEvery !== 0) return null;
    return `road: ${stamp}${s.publish === false ? ' (gesperrt)' : ''}`;
  }

  /** Called by the mirror's publish(): `road/v1` in the clone = exactly the store (heals force-pushes). */
  function copyInto(rootDir) {
    if (!enabled || !seeded || !plan) return false;
    status.updatedAt = new Date(now()).toISOString();
    writeFileSync(join(store, plan.statusPath), JSON.stringify(status, null, 1) + '\n');
    const dst = join(rootDir, plan.repoDir);
    // Corridors are built offline (`build-corridors.mjs`) and pushed by hand: the repo's copy wins over the store.
    const corridors = join(dst, 'static', 'corridors.json');
    if (existsSync(corridors)) { mkdirSync(join(store, 'static'), { recursive: true }); cpSync(corridors, join(store, 'static', 'corridors.json')); }
    rmSync(dst, { recursive: true, force: true });
    mkdirSync(dst, { recursive: true });
    cpSync(store, dst, { recursive: true });
    return true;
  }

  function storeBytes() {
    let n = 0;
    const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else n += s.size; } };
    if (existsSync(store)) walk(store);
    return n;
  }

  return { get enabled() { return enabled && seeded; }, seed, poll, copyInto, status, storeBytes, get pendingSlot() { return pending ? stampOf(pending.slotMs) : null; },
    get pendingInfo() { return pending ? { slot: stampOf(pending.slotMs), have: [...pending.have.keys()], tried: Object.fromEntries(pending.tried) } : null; } };
}
