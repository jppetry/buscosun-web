/**
 * health-manifests.mjs — Betriebs-Wächter für die Warm-Manifeste (V-79).
 *
 *   npm run health                     # gegen $SITE_URL (oder --url)
 *   npm run health -- --url https://buscosun.com
 *   npm run health -- --file public/latest-grib.json
 *
 * ── Warum es das gibt ────────────────────────────────────────────────────────
 * Die Warm-Crons **melden Erfolg, auch wenn sie nichts ausgerichtet haben**: bei
 * unvollständiger Wärmung wird das Manifest bewusst nicht umgelegt und der Job
 * endet mit Exit 0 (`warm-grib.mjs`). Ein dauerhaft
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
 * Dazu das Straßenwetter (Phase AW, audit/autobahnwetter.md §4.4) — `road/v1/status.json` im Daten-Repo, das der
 * Radar-Spiegel bei jedem Push schreibt (Abruf über raw.githubusercontent, nicht über das CDN: fester Pfad,
 * veränderliche Datei; `ROAD_HEALTH=0` schaltet die Prüfung ab):
 *   R1  lesbar, `product: road-status`
 *   R2  die Ableitung lebt: jüngster abgeleiteter Slot (`recent[0].derivedAt`) ≤ 45 min — NICHT `updatedAt`, das jeder
 *       Radar-Push erneuert (eine dauernd scheiternde Straßen-Ableitung bliebe sonst grün)
 *   R3  letzter freigegebener Slot ≤ 45 min (= ROAD_STALE_MS; danach zeigt die Seite „veraltet", Plan AW-3)
 *   R4  Stationskatalog vorhanden (`stale` = alte Datei bleibt, grün)
 *   R5  was jsDelivr ausliefert: der jüngste freigegebene Slot, der ≥ 10 min alt ist (früher abgefragt, könnte eine
 *       404 am Edge hängen bleiben), über `@main` wie von der Seite gelesen — Produkt, Slot, Punkte
 *   Ein bewusst gesetzter Kill-Schalter ist kein Ausfall: grün, aber benannt.
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

// BW-13 (§32): `latest-wind.json` ist entfallen — der Windlayer löst Lauf und
// Bilder aus dem Index des Daten-Repos auf. Zu überwachen bleibt das Grib-Manifest.
const MANIFESTS = [
  { name: 'latest-grib.json', proxy: '/_dwd_grib' },
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

/**
 * Straßenwetter: Grenzen in Minuten. Plain JS (der Wächter läuft ohne TS-Lader) — `verify:road-contract` prüft, dass
 * sie gleich ROAD_STALE_MS / ROAD_DEAD_MS aus `src/road/roadContract.ts` sind.
 */
export const ROAD_HEALTH = Object.freeze({
  statusUrl: 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/road/v1/status.json',
  cdnBase: 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/road/v1',
  staleMin: 45,
  /** R5 asks the CDN only for slots released at least this long ago (sticky edge 404, jsDelivr `@main` lag ≈ 3 min). */
  cdnMinAgeMin: 10,
  /** …and only slots still kept in obs/ (3 h, ROAD_RETENTION) with a margin. */
  cdnMaxSlotAgeMin: 120,
});

/** `YYMMDDHHMM` (UTC) → ms; NaN when malformed. */
function roadStampMs(s) {
  if (typeof s !== 'string' || !/^\d{10}$/.test(s)) return NaN;
  return Date.UTC(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10));
}

/** Reine Prüflogik für `road/v1/status.json` — von `verify-health.mjs` netzfrei getestet. */
export function checkRoadStatus(s, { nowMs }) {
  const out = [];
  const ok = (id, pass, detail) => out.push({ id, name: `road/v1/status.json · ${id}`, pass, detail });
  if (s == null || typeof s !== 'object' || s.product !== 'road-status') {
    ok('R1 Status lesbar', false, s && typeof s === 'object' ? `product ${s.product ?? '(fehlt)'}` : 'nicht lesbar oder kein Objekt');
    return out;
  }
  ok('R1 Status lesbar', true, s.killSwitch ? 'Kill-Schalter ROAD_KILL=1 aktiv — Slots ohne Punkte, bewusst' : undefined);
  const last = Array.isArray(s.recent) ? s.recent[0] : null;
  const devMin = (nowMs - Date.parse(last?.derivedAt ?? '')) / 60_000;
  ok('R2 Ableitung', Number.isFinite(devMin) && devMin <= ROAD_HEALTH.staleMin,
    Number.isFinite(devMin) ? `zuletzt abgeleitet ${last.slot} vor ${devMin.toFixed(0)} min (Grenze ${ROAD_HEALTH.staleMin} min; Status geschrieben ${s.updatedAt ?? '—'})` : 'kein abgeleiteter Slot in recent');
  if (s.killSwitch) {
    ok('R3 freigegebener Slot', true, 'Kill-Schalter aktiv — nicht bewertet');
  } else {
    const pubMin = (nowMs - roadStampMs(s.lastPublishedSlot)) / 60_000;
    const blocked = s.blocked?.slot ? ` · zuletzt gesperrt ${s.blocked.slot} (${(s.blocked.reasons ?? []).map((r) => r.rule).join(', ')})` : '';
    const g = last?.groups != null ? ` · ${last.groups} Reihen, ${(100 * (last.share ?? 0)).toFixed(1)} % verworfen` : '';
    ok('R3 freigegebener Slot', Number.isFinite(pubMin) && pubMin <= ROAD_HEALTH.staleMin,
      Number.isFinite(pubMin) ? `Slot ${s.lastPublishedSlot} ist ${pubMin.toFixed(0)} min alt (Grenze ${ROAD_HEALTH.staleMin} min)${g}${blocked}` : `kein freigegebener Slot${blocked}`);
  }
  const cat = s.catalog?.state ?? 'missing';
  ok('R4 Katalog', cat !== 'missing', `Stationskatalog ${cat}`);
  return out;
}

/**
 * R5: the slot to ask the CDN for — the newest released one derived at least `cdnMinAgeMin` ago AND still in obs/
 * (slot ≤ `cdnMaxSlotAgeMin` old; obs keeps 3 h — slots caught up after a start were derived minutes ago but may be
 * long gone). null when none.
 */
export function roadCdnSlot(s, nowMs) {
  const r = (s?.recent ?? []).find((x) => x?.publish
    && nowMs - Date.parse(x.derivedAt ?? '') >= ROAD_HEALTH.cdnMinAgeMin * 60_000
    && nowMs - roadStampMs(x.slot) <= ROAD_HEALTH.cdnMaxSlotAgeMin * 60_000);
  return r?.slot ?? null;
}

/** R5: the CDN's copy of `obs/<slot>.json` as the page reads it (product, slot, points; a killed slot has none). */
export function checkRoadCdn(obs, slot) {
  const name = `road/v1/obs/${slot}.json (jsDelivr) · R5 CDN`;
  if (!obs || typeof obs !== 'object' || obs.product !== 'road-obs' || obs.schema !== 1) return { id: 'R5 CDN', name, pass: false, detail: 'nicht lesbar oder fremdes Produkt' };
  if (obs.slot !== slot) return { id: 'R5 CDN', name, pass: false, detail: `liefert Slot ${obs.slot} statt ${slot}` };
  if (!Array.isArray(obs.points) || (!obs.killed && obs.points.length === 0)) return { id: 'R5 CDN', name, pass: false, detail: 'keine Punkte' };
  return { id: 'R5 CDN', name, pass: true, detail: obs.killed ? 'Kill-Schalter: Slot ohne Punkte' : `${obs.points.length} Punkte` };
}

/**
 * Phase SW (audit/seewetter.md §6): `sea/v1/status.json` of the Seewetter line (workflow `sea.yml`). `SEA_HEALTH=0` off.
 *   S1  lesbar, `product: sea-status`; ein gesetzter Kill-Schalter ist kein Ausfall (grün, benannt)
 *   S2  letzter veröffentlichter CWAM-Lauf ≤ 18 h alt (= SEA_STALE_MS; danach zeigt die Seite „veraltet")
 *   S3  Texte: Warnstatus WODL45 ≤ 4 h, Seewetterbericht FQDL50 ≤ 6 h alt (Ausgabezeit; Plan SW-1, Client-Regeln)
 */
export const SEA_HEALTH = Object.freeze({
  statusUrl: 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/sea/v1/status.json',
  runStaleH: 18, wodlStaleH: 4, fqStaleH: 6,
});
const seaRunMs = (r) => (typeof r === 'string' && /^\d{10}$/.test(r) ? Date.UTC(+r.slice(0, 4), +r.slice(4, 6) - 1, +r.slice(6, 8), +r.slice(8, 10)) : NaN);
/** Reine Prüflogik für `sea/v1/status.json` — von `verify-health.mjs` netzfrei getestet. */
export function checkSeaStatus(s, { nowMs }) {
  const out = [];
  const ok = (id, pass, detail) => out.push({ id, name: `sea/v1/status.json · ${id}`, pass, detail });
  if (s == null || typeof s !== 'object' || s.product !== 'sea-status') {
    ok('S1 Status lesbar', false, s && typeof s === 'object' ? `product ${s.product ?? '(fehlt)'}` : 'nicht lesbar oder kein Objekt');
    return out;
  }
  ok('S1 Status lesbar', true, s.killSwitch ? 'Kill-Schalter SEA_KILL=1 aktiv — keine Daten, bewusst' : undefined);
  if (s.killSwitch) { ok('S2 Lauf', true, 'Kill-Schalter aktiv — nicht bewertet'); ok('S3 Texte', true, 'Kill-Schalter aktiv — nicht bewertet'); return out; }
  const runH = (nowMs - seaRunMs(s.field?.lastPublishedRun)) / 3_600_000;
  const blocked = s.field?.blocked?.run ? ` · zuletzt gesperrt ${s.field.blocked.run} (${(s.field.blocked.reasons ?? []).map((r) => r.rule).join(', ')})` : '';
  ok('S2 Lauf', Number.isFinite(runH) && runH <= SEA_HEALTH.runStaleH, Number.isFinite(runH) ? `CWAM ${s.field.lastPublishedRun} ist ${runH.toFixed(1)} h alt (Grenze ${SEA_HEALTH.runStaleH} h)${blocked}` : `kein veröffentlichter Lauf${blocked}`);
  const age = (p) => (nowMs - Date.parse(s.text?.[p]?.issuedAt ?? '')) / 3_600_000;
  const w = age('WODL45'), f = age('FQDL50');
  ok('S3 Texte', Number.isFinite(w) && w <= SEA_HEALTH.wodlStaleH && Number.isFinite(f) && f <= SEA_HEALTH.fqStaleH,
    `WODL45 ${Number.isFinite(w) ? `${w.toFixed(1)} h` : 'fehlt'} (≤ ${SEA_HEALTH.wodlStaleH} h) · FQDL50 ${Number.isFinite(f) ? `${f.toFixed(1)} h` : 'fehlt'} (≤ ${SEA_HEALTH.fqStaleH} h)`);
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
    if (process.env.ROAD_HEALTH !== '0') {
      let s = null;
      try { s = await loadRemote(process.env.ROAD_STATUS_URL ?? ROAD_HEALTH.statusUrl); }
      catch (e) { results.push({ id: 'R1', name: 'road/v1/status.json · R1 erreichbar', pass: false, detail: String(e?.message ?? e) }); }
      if (s) {
        results.push(...checkRoadStatus(s, { nowMs }));
        const slot = roadCdnSlot(s, nowMs);
        if (slot) {
          let obs = null;
          try { obs = await loadRemote(`${ROAD_HEALTH.cdnBase}/obs/${slot}.json`); } catch (e) { results.push({ id: 'R5 CDN', name: `road/v1/obs/${slot}.json (jsDelivr) · R5 CDN`, pass: false, detail: String(e?.message ?? e) }); }
          if (obs) results.push(checkRoadCdn(obs, slot));
        } else {
          results.push({ id: 'R5 CDN', name: 'road/v1/obs (jsDelivr) · R5 CDN', pass: true, detail: 'nicht geprüft: kein freigegebener Slot, der ≥ 10 min alt ist (Frische prüft R3)' });
        }
      }
    }
  }

  if (!fileMode && process.env.SEA_HEALTH !== '0') {
    let s = null;
    try { s = await loadRemote(process.env.SEA_STATUS_URL ?? SEA_HEALTH.statusUrl); }
    catch (e) { results.push({ id: 'S1', name: 'sea/v1/status.json · S1 erreichbar', pass: false, detail: String(e?.message ?? e) }); }
    if (s) results.push(...checkSeaStatus(s, { nowMs }));
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
