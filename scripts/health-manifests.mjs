/**
 * health-manifests.mjs — Betriebs-Wächter für die Warm-Manifeste (V-79).
 *
 *   npm run health                     # gegen $SITE_URL (oder --url)
 *   npm run health -- --url https://buscosun.com
 *   npm run health -- --file public/latest-grib.json public/latest-wind.json
 *
 * ── Warum es das gibt ────────────────────────────────────────────────────────
 * Die Warm-Crons **melden Erfolg, auch wenn sie nichts ausgerichtet haben**: bei
 * unvollständiger Wärmung wird das Manifest bewusst nicht umgelegt und der Job
 * endet mit Exit 0 (`warm-grib.mjs:340,351`, `warm-wind.mjs`). Ein dauerhaft
 * blockierter Advance erzeugt lauter GRÜNE Runs. Genau diese Lücke hat am
 * 2026-07-22 eine Merge-Regression zwei Tage lang verborgen und in der
 * Strategie-Session drei unabhängige Analysen zu einer Fehldiagnose verleitet
 * (`improvements.md` V-03-Faktenkorrektur).
 *
 * Dieser Wächter prüft deshalb NICHT die Crons, sondern das **ausgelieferte
 * Ergebnis** — von außen, über HTTPS, wie ein Besucher. Er ist bewusst ein
 * eigener, unabhängiger Workflow und fasst die Warm-Skripte nicht an
 * (Cron-Semantik ist STOPP-Zone; Jans Entscheidung 2026-08-03).
 *
 * Geprüft wird je Manifest:
 *   H1  erreichbar und valides JSON
 *   H2  runAt-Alter < MAX_RUN_AGE_H (Default 9 h — ICON-D2 läuft alle 3 h)
 *   H3  updatedAt-Alter < MAX_UPDATE_AGE_H (Default 6 h) — der Advance selbst
 *   H4  Herkunft: `publishedFor` (bzw. das Alt-Feld `warmedThroughProxy`) zeigt
 *       auf die geprüfte Origin — nicht auf localhost oder eine Alt-Domain,
 *       sonst stammt das ausgelieferte Manifest aus einem fremden Lauf
 *   H5  Step-Vollständigkeit: je Param lückenlos ab 0 bis zum jeweiligen Maximum
 *
 * Exit 0 = alles grün · 1 = mindestens eine Prüfung rot (GitHub schickt dann
 * seine Standard-Fehlermail) · 2 = Wächter selbst nicht lauffähig.
 */
import { readFileSync } from 'node:fs';

const MAX_RUN_AGE_H = Number(process.env.MAX_RUN_AGE_H ?? 9);
const MAX_UPDATE_AGE_H = Number(process.env.MAX_UPDATE_AGE_H ?? 6);

const argv = process.argv.slice(2);
const flagValue = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const fileMode = argv.includes('--file');
const files = fileMode ? argv.slice(argv.indexOf('--file') + 1).filter((a) => !a.startsWith('--')) : [];
const baseUrl = (flagValue('--url') ?? process.env.SITE_URL ?? '').replace(/\/+$/, '');
const nowMs = Date.parse(process.env.HEALTH_NOW ?? new Date().toISOString());

const MANIFESTS = [
  { name: 'latest-grib.json', proxy: '/_dwd_grib' },
  { name: 'latest-wind.json', proxy: '/_dwd_wind' },
];

/**
 * Reine Prüflogik — von `verify-health.mjs` netzfrei getestet.
 * `origin` ist die Origin, gegen die geprüft wurde (null ⇒ H4 entfällt, weil
 * eine lokale Datei nichts über die ausgelieferte Domain aussagt).
 */
export function checkManifest(name, m, { origin, nowMs, maxRunAgeH, maxUpdateAgeH, proxyPath }) {
  const out = [];
  const ok = (id, pass, detail) => out.push({ id, name: `${name} · ${id}`, pass, detail });

  if (m == null || typeof m !== 'object') {
    ok('H1 valides JSON', false, 'nicht lesbar oder kein Objekt');
    return out;
  }
  ok('H1 valides JSON', true);

  const runAt = Date.parse(m.runAt ?? '');
  const runAgeH = Number.isFinite(runAt) ? (nowMs - runAt) / 3.6e6 : NaN;
  ok('H2 Lauf-Alter', Number.isFinite(runAgeH) && runAgeH < maxRunAgeH,
    Number.isFinite(runAgeH) ? `Lauf ${m.run} ist ${runAgeH.toFixed(1)} h alt (Grenze ${maxRunAgeH} h)` : 'runAt fehlt/ungültig');

  const upAt = Date.parse(m.updatedAt ?? '');
  const upAgeH = Number.isFinite(upAt) ? (nowMs - upAt) / 3.6e6 : NaN;
  ok('H3 Advance-Alter', Number.isFinite(upAgeH) && upAgeH < maxUpdateAgeH,
    Number.isFinite(upAgeH) ? `zuletzt umgelegt vor ${upAgeH.toFixed(1)} h (Grenze ${maxUpdateAgeH} h)` : 'updatedAt fehlt/ungültig');

  if (origin) {
    // Zwei Schreibweisen, gleicher Zweck: das Manifest muss FÜR die geprüfte
    // Domain publiziert sein. Ein mit SITE_URL=localhost geschriebenes Manifest
    // darf nie in Prod landen (V-02/V-100).
    //   • `publishedFor` (ab 2026-08-23): nur die Origin.
    //   • `warmedThroughProxy`: Alt-Feld aus der Warm-Cron-Zeit (Origin + Proxy-
    //     Pfad). Wird nicht mehr geschrieben; die Toleranz hält den Wächter grün,
    //     solange in Prod noch ein Manifest von vor dem Rückzug liegt, und kann
    //     entfallen, sobald ein neues Manifest deployt ist.
    const want = `${origin}${proxyPath}`;
    const seen = m.publishedFor ?? m.warmedThroughProxy;
    ok('H4 Warm-Proxy', m.publishedFor === origin || m.warmedThroughProxy === want,
      `${seen ?? '(fehlt)'} — erwartet ${origin} (publishedFor) bzw. ${want} (warmedThroughProxy)`);
  }

  // H5: Step-Vollständigkeit. Der Client übernimmt die Liste als autoritativ,
  // eine Lücke ist deshalb eine fehlende Stunde im Zeitslider (V-81).
  const stepLists = m.params && typeof m.params === 'object'
    ? Object.entries(m.params).filter(([, v]) => Array.isArray(v))
    : Array.isArray(m.steps) ? [['steps', m.steps]] : [];
  if (!stepLists.length) {
    ok('H5 Step-Vollständigkeit', false, 'weder params{} noch steps[]');
  } else {
    const broken = [];
    for (const [param, steps] of stepLists) {
      const sorted = [...steps].sort((a, b) => a - b);
      if (!sorted.length) { broken.push(`${param}: leer`); continue; }
      if (sorted[0] !== 0) { broken.push(`${param}: beginnt bei ${sorted[0]}, nicht 0`); continue; }
      const gaps = [];
      for (let i = 0; i <= sorted[sorted.length - 1]; i++) if (!sorted.includes(i)) gaps.push(i);
      if (gaps.length) broken.push(`${param}: Lücken [${gaps.join(',')}]`);
    }
    ok('H5 Step-Vollständigkeit', broken.length === 0,
      broken.length ? broken.join(' · ') : `${stepLists.length} Param-Liste(n) lückenlos ab 0`);
  }
  return out;
}

async function loadRemote(url) {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  if (!fileMode && !baseUrl) {
    console.error('[health] Weder --file noch --url/$SITE_URL gesetzt.');
    console.error('  npm run health -- --url https://buscosun.com');
    return 2;
  }

  const results = [];
  if (fileMode) {
    if (!files.length) { console.error('[health] --file ohne Pfade.'); return 2; }
    for (const f of files) {
      let m = null;
      try { m = JSON.parse(readFileSync(f, 'utf8')); } catch { /* H1 schlägt an */ }
      const meta = MANIFESTS.find((x) => f.endsWith(x.name)) ?? { name: f, proxy: '' };
      results.push(...checkManifest(meta.name, m, { origin: null, nowMs, maxRunAgeH: MAX_RUN_AGE_H, maxUpdateAgeH: MAX_UPDATE_AGE_H, proxyPath: meta.proxy }));
    }
  } else {
    console.log(`[health] prüfe ${baseUrl}`);
    for (const meta of MANIFESTS) {
      let m = null;
      try { m = await loadRemote(`${baseUrl}/${meta.name}`); }
      catch (e) { results.push({ id: 'H1', name: `${meta.name} · H1 erreichbar`, pass: false, detail: String(e?.message ?? e) }); continue; }
      results.push(...checkManifest(meta.name, m, { origin: baseUrl, nowMs, maxRunAgeH: MAX_RUN_AGE_H, maxUpdateAgeH: MAX_UPDATE_AGE_H, proxyPath: meta.proxy }));
    }
  }

  const failed = results.filter((r) => !r.pass);
  const lines = results.map((r) => `${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  for (const l of lines) console.log(l);

  // GitHub-Job-Summary, damit der Zustand ohne Log-Öffnen sichtbar ist.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Warm-Manifeste — ${failed.length ? `❌ ${failed.length} Problem(e)` : '✅ alles grün'}\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`);
  }

  if (failed.length) {
    for (const f of failed) console.log(`::error::${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
    console.log(`\n${failed.length} von ${results.length} Prüfungen ROT.`);
    return 1;
  }
  console.log(`\nAlle ${results.length} Prüfungen grün.`);
  return 0;
}

const isMain = process.argv[1] && process.argv[1].endsWith('health-manifests.mjs');
if (isMain) main().then((c) => process.exit(c)).catch((e) => { console.error('[health] FATAL', e); process.exit(2); });
