/**
 * cdnSync.mjs — AP12a (E-F-1, `audit/fusion-implementierung.md` §9.4): nach dem Push eines
 * Punkt-Jobs das CDN auf den gepushten Stand bringen.
 *
 * Warum eine eigene Datei: `publish-point.mjs` veröffentlicht beim Import; der Verifier muss
 * Plan, Purge und Warm-up aber netzfrei an echten Datenformen prüfen können (Muster
 * `staticIndex.mjs`, `prune.mjs`).
 *
 * ── Was ein Job anfasst — aus `git diff --name-status`, nicht aus einer Liste im Kopf ──
 *   A  neu        Chunks eines neuen Laufs, Stationsbündel, neues `run.json`
 *   M  geändert   `run.json` eines Laufs, in den die Stufe GEMERGT wurde (t2 schreibt ins
 *                 t1-Verzeichnis desselben Laufs, §26) oder aus dem die Aufbewahrung eine
 *                 Stufe STRICH; `point/index.json` (jeder Publish); statische Produkte
 *                 (`hmodel` bei jedem ECMWF-Laufwechsel, V-PD-62); der Stationskatalog; ein
 *                 Chunk, dessen Lauf neu gebaut wurde
 *   D  gelöscht   Läufe, die die Aufbewahrung entfernt hat
 *
 * ── Die Regel ─────────────────────────────────────────────────────────────────
 *   purgen   jede Datei mit M (Ausnahme: statische Chunks, s. planCdnSync) — unter `@main` veränderlich, jsDelivr hält sie
 *            12 h (`s-maxage`), der Browser 7 Tage. V-FI-1: ein gemergtes `run.json` stand am
 *            CDN ohne die neue Stufe, der Leser gab `null` ohne Fehler. `index.json` zuletzt,
 *            mit Frischeprüfung (Commit), `run.json` mit Byte-Vergleich gegen die Datei im Repo.
 *   wärmen   jede Datei mit A oder M in der Form, in der der Leser sie holt: Chunks, Bündel,
 *            Katalog, statische Produkte unter `@main` (§9.2, V-FI-6); `run.json` gepinnt an den
 *            Daten-Commit (§9.1). Mit Chromes `Accept-Encoding` (jsDelivr hält je Variante einen
 *            Eintrag). 403 und Fristablauf sind FEHLSCHLÄGE, werden wiederholt und gezählt (V-FI-5).
 *   nichts   gelöschte Dateien: kein aktueller Index nennt sie; ein Purge machte aus einer
 *            alten, noch gültigen Kopie für einen Leser mit altem Index nur eine 404.
 *
 * `@main` wird erst gewärmt, wenn der Index unter `@main` frisch ist — vorher löst jsDelivr
 * `main` womöglich noch auf den alten Commit auf (gemessen bis 2:39 min, BW-9 §28.4), und eine
 * 404 für einen neuen Chunk hinge am Edge fest (§28.9).
 *
 * Schalter: `POINT_CDN_SYNC=0` ⇒ alter Weg (nur `index.json` purgen, ohne Nachprüfung);
 * `POINT_CDN_DRY=1` ⇒ KEIN Purge (auch nicht der 404-Purge des Warm-ups), Lesen und Warm-up
 * laufen; `POINT_CDN_BUDGET_S` ⇒ Wandzeit-Budget des ganzen Schritts (Vorlage je Job);
 * `POINT_CDN_BASE` ⇒ andere CDN-Basis (nur für den lokalen Nachbau).
 *
 * CLI (Trockenlauf gegen einen veröffentlichten Lauf — GET only, nie ein Purge):
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/point/cdnSync.mjs --tier=t1 [--run=<YYYYMMDDHH>] [--no-warm] [--budget-s=240]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { warmCdnFiles, purgeUntilFresh, purgeIndexUntilFresh, purgeUrlOf } from '../lib/repackManifest.mjs';
import { CDN_BASE } from '../../src/point/manifest.ts';
import { POINT_INDEX_PATH, stationManifestPath } from '../../src/point/cubeFormat.ts';

/**
 * Budget je Job (s) — Wandzeit für Purge + Frischeprüfung + Warm-up. Hergeleitet aus der
 * Luft unter `JOB_MAX_MIN_BY_TIER` {20, 15, 10} (verify-point-data.mjs) über die gemessenen
 * Job-Dauern (GitHub-API, Läufe 56–71, 15./16.09.: max. t1 14,2 · t2 10,7 · t3 5,4 min) mit
 * einer Minute Reserve: t1 20 − 14,2 − 1 = 4,8 min ⇒ 240 s; t2 15 − 10,7 − 1 = 3,3 ⇒ 180 s;
 * t3 10 − 5,4 − 1 = 3,6 ⇒ 180 s. Ohne Angabe gilt das kleinste (180 s), das in jedem Job hält.
 */
export const CDN_BUDGET_S_BY_TIER = Object.freeze({ t1: 240, t2: 180, t3: 180 });
export const CDN_BUDGET_S_DEFAULT = Math.min(...Object.values(CDN_BUDGET_S_BY_TIER));
/** Gemessene Job-Maxima (min), aus denen das Budget folgt — der Verifier rechnet Regel F damit. */
export const JOB_MEASURED_MAX_MIN = Object.freeze({ t1: 14.2, t2: 10.7, t3: 5.4 });
export const CDN_WARM = Object.freeze({ concurrency: 8, timeoutMs: 20_000, retries: 3, backoffMs: 3_000 });

/** `git diff --name-status --no-renames` → `[{ status: 'A'|'M'|'D', path }]`. */
export function parseNameStatus(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^([AMDTCR])\d*\t(.+)$/.exec(line.trim());
    if (!m) continue;
    const status = m[1] === 'T' ? 'M' : m[1];
    if (status === 'R' || status === 'C') continue;   // mit --no-renames nie; sonst lieber auslassen als raten
    out.push({ status, path: m[2].replace(/\\/g, '/') });
  }
  return out;
}

/** Wie der Leser eine Datei holt. */
export function classifyPointPath(path) {
  if (path === POINT_INDEX_PATH) return 'index';
  if (/^point\/\d{10}\/run\.json$/.test(path)) return 'run-manifest';
  if (/^point\/\d{10}\/t\d\/[^/]+\.bin$/.test(path)) return 'chunk';
  if (/^point\/stations\/\d{10}\/[^/]+\.bin$/.test(path)) return 'stations-bundle';
  if (/^point\/stations\/\d{10}\/stations\.json$/.test(path)) return 'stations-manifest';
  if (path === 'point/stations/catalog.json') return 'stations-catalog';
  if (/^point\/static\//.test(path)) return 'static';
  if (/^point\/(sources|calib)\.json$/.test(path)) return 'register';
  if (/^point\/\.build\//.test(path)) return 'stage';
  return 'other';
}

const WARM_ORDER = ['run-manifest', 'stations-manifest', 'stations-catalog', 'register', 'static', 'stations-bundle', 'chunk'];

/**
 * Reiner Plan. `commit` = der Daten-Commit (`index.commit`), unter dem der Leser `run.json` pinnt.
 * @returns {{ purge: {path, url}[], indexUrl: string, warm: string[], deleted: string[], counts: Record<string, number> }}
 */
export function planCdnSync(touched, { commit, base = CDN_BASE } = {}) {
  const main = (p) => `${base}@main/${p}`;
  const purge = [];
  const warmBy = new Map(WARM_ORDER.map((k) => [k, []]));
  const deleted = [];
  const counts = { A: 0, M: 0, D: 0 };
  for (const { status, path } of touched) {
    counts[status] = (counts[status] ?? 0) + 1;
    const cls = classifyPointPath(path);
    if (cls === 'stage' || cls === 'other') continue;
    if (status === 'D') { deleted.push(path); continue; }
    // Statische Chunks, die in place geändert wurden, weder purgen noch wärmen (Wärmen ohne Purge liefert die
    // alte Kopie): gemessen am t1-Job 19:40 UTC (Commit b3e6fec) waren es 124 `hmodel`-Chunks, deren abgeleitete
    // ECMWF-Höhe sich je Lauf um 1–2 m verschiebt (V-PD-62) — 124 Purges je Job, achtmal am Tag, für eine
    // Änderung unter der Auflösung; der Leser nimmt `static` ohnehin mit 12 h (V-FI-6). `static.json` wird
    // gepurgt: eine neue Spaltenliste muss ankommen (der Decoder prüft die Ebenenzahl laut).
    if (cls === 'static' && status === 'M' && !path.endsWith('/static.json')) { counts.staticChunksLeft = (counts.staticChunksLeft ?? 0) + 1; continue; }
    if (status === 'M' && cls !== 'index') purge.push({ path, url: main(path), cls });
    if (cls === 'index') continue;   // Frischeprüfung liest ihn ohnehin
    if (cls === 'run-manifest') {
      if (commit) warmBy.get(cls).push(`${base}@${commit}/${path}`);
      if (status === 'M') warmBy.get(cls).push(main(path));   // der Rückfallweg des Lesers, nach dem Purge frisch
      continue;
    }
    warmBy.get(cls).push(main(path));
  }
  // Frisch muss vor allem sein, was je Stufe gemergt wird: run.json zuerst purgen.
  purge.sort((a, b) => (a.cls === 'run-manifest' ? -1 : 0) - (b.cls === 'run-manifest' ? -1 : 0));
  const warm = WARM_ORDER.flatMap((k) => warmBy.get(k));
  for (const k of WARM_ORDER) counts[`warm.${k}`] = warmBy.get(k).length;
  return { purge, indexUrl: main(POINT_INDEX_PATH), warm, deleted, counts };
}

/** Negativkontrolle für den Verifier: jede geänderte `run.json` MUSS im Purge stehen. */
export function missingManifestPurges(plan, touched) {
  const purged = new Set(plan.purge.map((p) => p.path));
  return touched.filter((t) => t.status === 'M' && classifyPointPath(t.path) === 'run-manifest' && !purged.has(t.path)).map((t) => t.path);
}

/**
 * Vertrag des Publishers, als Quelltext geprüft (Muster verify-repack): liefert die Verstöße.
 * Leer heißt: der Publisher ermittelt die angefassten Dateien aus Git, ruft `syncCdn` NACH dem
 * Landen auf origin/main und hat den alten Weg als Schalter.
 */
export function cdnContractViolations(src) {
  const v = [];
  if (!/from '\.\/cdnSync\.mjs'/.test(src)) v.push('importiert cdnSync.mjs nicht');
  if (!/'--name-status'/.test(src)) v.push('ermittelt die angefassten Dateien nicht über git diff --name-status');
  const iLanded = src.indexOf('landed = true');
  const iSync = src.indexOf('syncCdn(');
  const iManifestPush = src.indexOf("pushWithRetry('Manifest')");
  if (iSync < 0) v.push('ruft syncCdn nicht auf — kein Purge der run.json, kein Warm-up');
  else {
    if (iLanded < 0 || iSync < iLanded) v.push('syncCdn steht nicht hinter der Prüfung „auf origin/main gelandet"');
    if (iManifestPush < 0 || iSync < iManifestPush) v.push('syncCdn steht vor dem Manifest-Push');
  }
  if (!/POINT_CDN_SYNC/.test(src)) v.push('kein Schalter POINT_CDN_SYNC (Rückweg zum alten Purge)');
  return v;
}

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

/**
 * Führt den Plan aus. Nie fatal — ein nicht gewärmter Eintrag kostet Latenz, keine Korrektheit.
 * @param {{ repo?: string, touched: {status, path}[], commit: string|null, base?: string, dryRun?: boolean, budgetS?: number,
 *           fetchImpl?: typeof fetch, sleepImpl?: (ms:number)=>Promise<void>, log?: (s:string)=>void, warm?: boolean,
 *           indexWait?: { firstWaitMs?: number, waitMs?: number, attempts?: number }, warmOpts?: object }} o
 */
export async function syncCdn(o) {
  // Harte Obergrenze: auch wenn ein Abruf trotz Frist nicht zurückkehrt, endet der Schritt
  // spätestens nach Budget + CDN_HARD_CAP_EXTRA_MS (der Publisher beendet sich danach mit process.exit).
  const budgetMs = (o.budgetS ?? CDN_BUDGET_S_DEFAULT) * 1000;
  const extraMs = o.hardCapExtraMs ?? CDN_HARD_CAP_EXTRA_MS;
  let timer = null;
  const cap = new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true, budgetS: budgetMs / 1000 }), budgetMs + extraMs); });
  try {
    const r = await Promise.race([syncCdnInner(o, budgetMs), cap]);
    if (r.timedOut) (o.log ?? (() => {}))(`⚠ CDN: harte Obergrenze (${budgetMs / 1000} s + ${extraMs / 1000} s) erreicht — abgebrochen, nicht fatal`);
    return r;
  } finally {
    clearTimeout(timer);
  }
}
/** Frist je Purge-/Prüfabruf und der Aufschlag der harten Obergrenze. */
export const CDN_FETCH_TIMEOUT_MS = 15_000;
export const CDN_HARD_CAP_EXTRA_MS = 15_000;

async function syncCdnInner(o, budgetMs) {
  const t0 = Date.now();
  const log = o.log ?? (() => {});
  const fetchImpl = o.fetchImpl ?? fetch;
  const sleepImpl = o.sleepImpl ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const left = () => budgetMs - (Date.now() - t0);
  const plan = planCdnSync(o.touched, { commit: o.commit, base: o.base ?? CDN_BASE });
  const report = { dryRun: !!o.dryRun, budgetS: budgetMs / 1000, counts: plan.counts, deleted: plan.deleted.length, purge: { total: plan.purge.length, sent: 0, failed: 0 }, manifests: [], index: null, warm: null, ms: 0 };
  log(`CDN: ${plan.counts.A} neu · ${plan.counts.M} geändert · ${plan.counts.D} gelöscht ⇒ ${plan.purge.length} Purge(s), ${plan.warm.length} Datei(en) zu wärmen, Budget ${report.budgetS} s${o.dryRun ? ' — TROCKENLAUF: kein Purge' : ''}`);

  // 1. Geänderte Dateien purgen (run.json zuerst). Ohne Warten — die Frische prüft Schritt 3.
  for (const p of plan.purge) {
    if (o.dryRun) { log(`  (trocken) Purge ${p.path}`); continue; }
    if (left() < CDN_FETCH_TIMEOUT_MS) { report.purge.failed++; continue; }
    try { const r = await fetchImpl(purgeUrlOf(p.url), { cache: 'no-store', signal: AbortSignal.timeout(CDN_FETCH_TIMEOUT_MS) }); report.purge.sent++; if (!r.ok) report.purge.failed++; } catch { report.purge.failed++; }
  }

  // 2. index.json purgen und nachprüfen, dass `@main` den neuen Commit trägt.
  const iw = o.indexWait ?? {};
  report.index = o.commit
    ? await purgeIndexUntilFresh({ commit: o.commit, url: plan.indexUrl, attempts: iw.attempts ?? 3, waitMs: iw.waitMs ?? 20_000, firstWaitMs: iw.firstWaitMs ?? 8_000, fetchImpl, sleepImpl, log: (m) => log(`  Index: ${m}`), dryRun: o.dryRun, timeoutMs: CDN_FETCH_TIMEOUT_MS })
    : { fresh: false, attempts: 0, note: 'kein Commit bekannt' };

  // 3. Jede geänderte run.json: liefert @main jetzt die Bytes aus dem Repo? Sonst noch einmal purgen.
  const repoSha = o.repoSha ?? (async (path) => (o.repo && existsSync(join(o.repo, path)) ? sha256(readFileSync(join(o.repo, path))) : null));
  for (const p of plan.purge.filter((x) => x.cls === 'run-manifest')) {
    if (left() < 2 * CDN_FETCH_TIMEOUT_MS) { report.manifests.push({ path: p.path, fresh: false, attempts: 0, skipped: 'Budget' }); continue; }
    const local = await repoSha(p.path).catch(() => null);
    const attempts = left() > 30_000 + 4 * CDN_FETCH_TIMEOUT_MS ? 2 : 1;
    const r = await purgeUntilFresh({
      url: p.url, attempts, waitMs: 10_000, firstWaitMs: 0, fetchImpl, sleepImpl, dryRun: o.dryRun, timeoutMs: CDN_FETCH_TIMEOUT_MS,
      check: async (res) => {
        if (!res.ok) return { fresh: false, seen: `HTTP ${res.status}` };
        const got = sha256(Buffer.from(await res.arrayBuffer()));
        return { fresh: local != null && got === local, seen: `@main ${got.slice(0, 8)} · Repo ${local ? local.slice(0, 8) : '—'}` };
      },
      log: (m) => log(`  ${p.path}: ${m}`),
    });
    report.manifests.push({ path: p.path, fresh: r.fresh, attempts: r.attempts });
  }

  // 4. Warm-up — `@main` nur bei frischem Index (sonst hinge eine 404 am Edge), gepinnt immer.
  if (o.warm !== false && plan.warm.length) {
    const urls = report.index?.fresh ? plan.warm : plan.warm.filter((u) => !u.includes('@main/'));
    if (urls.length < plan.warm.length) log(`  Warm-up ohne @main (${plan.warm.length - urls.length} Datei(en)) — der Index ist unter @main nicht frisch`);
    const w = { ...CDN_WARM, ...(o.warmOpts ?? {}) };
    report.warm = await warmCdnFiles(urls, { ...w, fetchImpl, sleepImpl, deadlineMs: Math.max(0, left()), purgeOn404: !o.dryRun, log });
    report.warm.planned = plan.warm.length;
    const s = report.warm;
    log(`CDN-Warm-up: ${s.ok}/${s.total} ok (${s.hit} HIT, ${s.miss} MISS) · 403 ${s.forbidden} · Frist ${s.timeout} · 404 ${s.notFound} · übrige Fehler ${s.failed - s.forbidden - s.timeout} · wiederholt ${s.retried} (davon geheilt ${s.recovered}) · ausgelassen ${s.skipped} · ${(s.bytes / 1048576).toFixed(1)} MiB in ${(s.ms / 1000).toFixed(1)} s`);
  }
  report.ms = Date.now() - t0;
  log(`CDN: fertig nach ${(report.ms / 1000).toFixed(1)} s (Budget ${report.budgetS} s) · Index ${report.index?.fresh ? 'frisch' : 'NICHT frisch'} · run.json ${report.manifests.filter((m) => m.fresh).length}/${report.manifests.length} frisch`);
  return report;
}

// ── CLI: Trockenlauf gegen einen veröffentlichten Lauf ──────────────────────────
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
  const base = process.env.POINT_CDN_BASE || CDN_BASE;
  const raw = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';
  const index = await (await fetch(`${raw}/${POINT_INDEX_PATH}`, { cache: 'no-store' })).json();
  const tier = args.tier ?? 't1';
  const run = args.run ?? index.latestByTier?.[tier]?.run;
  if (!run) throw new Error(`kein Lauf für ${tier} im Index`);
  const man = await (await fetch(`${raw}/point/${run}/run.json`, { cache: 'no-store' })).json();
  const tm = (man.tiers ?? []).find((t) => t.id === tier);
  if (!tm) throw new Error(`point/${run}/run.json trägt ${tier} nicht`);
  // Nachbau dessen, was der Job dieser Stufe angefasst hätte: seine Chunks neu, run.json geändert,
  // index.json geändert; bei t2 zusätzlich das Stationsprodukt des jüngsten Laufs.
  const touched = [
    ...(tm.files ?? []).map((f) => ({ status: 'A', path: f.file })),
    { status: 'M', path: `point/${run}/run.json` },
    { status: 'M', path: POINT_INDEX_PATH },
  ];
  if (tier === 't2' && index.stations?.runs?.[0]) {
    const st = index.stations.runs[0];
    const sm = await (await fetch(`${raw}/${stationManifestPath(st.run)}`, { cache: 'no-store' })).json();
    touched.push({ status: 'A', path: stationManifestPath(st.run) }, ...(sm.chunks ?? []).map((c) => ({ status: 'A', path: c.file })));
  }
  console.log(`[cdn-sync] Trockenlauf ${tier} · Lauf ${run} · Index ${String(index.commit).slice(0, 7)} · ${touched.length} Dateien · Basis ${base}`);
  const report = await syncCdn({
    touched, commit: index.commit, base, dryRun: true, warm: args['no-warm'] !== '1',
    repoSha: async (path) => { const r = await fetch(`${raw}/${path}`, { cache: 'no-store' }); return r.ok ? sha256(Buffer.from(await r.arrayBuffer())) : null; },
    budgetS: Number(args['budget-s'] ?? CDN_BUDGET_S_BY_TIER[tier] ?? CDN_BUDGET_S_DEFAULT),
    indexWait: { firstWaitMs: 0, attempts: 1 }, log: (m) => console.log(`[cdn-sync] ${m}`),
  });
  if (args.json) console.log(JSON.stringify(report));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
