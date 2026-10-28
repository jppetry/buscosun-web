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
 *   Ein Manifest, dessen Warm-Cron bewusst abgeschaltet ist (`retired` in MANIFESTS), wird nicht auf Frische geprüft:
 *   H2/H3 sind dann grün und tragen den Grund samt dem tatsächlichen Alter im Text (V-AW-61, 14.10.2026).
 *
 * Was der Client wirklich liest, seit der Warm-Cron aus ist (BW-12, Gate GBW12 04.09.): `index.json` im Daten-Repo
 * (`resolveRunFromRepackIndex`). Dazu (Abruf über raw.githubusercontent; `INDEX_HEALTH=0` schaltet ab, `REPACK_INDEX_URL`
 * überschreibt die Adresse):
 *   I1  lesbar, Schema 1, Läufe vorhanden
 *   I2  `publishedAt` ≤ MAX_UPDATE_AGE_H (Default 6 h) — der Publisher lebt
 *   I3  je Hauptfamilie (wind, temp, gust, precip) der jüngste Lauf mit Schritten ≤ MAX_RUN_AGE_H (Default 9 h)
 * Der Punkt-Cube `point/index.json` (V-AW-69, 23.10.2026 — vier Tage stehender Punkt-Cron blieb unbemerkt; `POINT_HEALTH=0`
 * schaltet ab, `POINT_INDEX_URL` überschreibt):
 *   P1  lesbar, Stufen t1/t2/t3 vorhanden
 *   P2  `publishedAt` < 6 h — irgendeine Stufe veröffentlicht alle 3 h
 *   P3  je Stufe der jüngste Lauf jünger als Takt + Bereitstellung + Rand (t1 7 h, t2 13 h, t3 22 h)
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
// V-AW-61 (14.10.2026): `warm-grib.yml` hat seit dem Gate GBW12 (04.09.) keinen `schedule` mehr, `latest-grib.json` steht
// auf dem letzten Stand (Lauf 2026090406). Der Client verwirft ein Manifest über 24 h vorab (`gribManifest.ts`) und liest
// Lauf und Schritte aus dem Index — dessen Frische prüfen I1–I3. `retired: null` (oder `GRIB_MANIFEST_RETIRED=0`)
// schaltet H2/H3 wieder scharf, falls der Cron je zurückkommt.
const GRIB_RETIRED = 'warm-grib-Cron seit GBW12 (04.09.2026) aus, der Client liest den Index des Daten-Repos';
const MANIFESTS = [
  { name: 'latest-grib.json', proxy: '/_dwd_grib', retired: process.env.GRIB_MANIFEST_RETIRED === '0' ? null : GRIB_RETIRED },
];

/**
 * Reine Prüflogik — von `verify-health.mjs` netzfrei getestet.
 * `origin` ist die Origin, gegen die geprüft wurde (null ⇒ H4 entfällt, weil
 * eine lokale Datei nichts über die ausgelieferte Domain aussagt).
 */
export function checkManifest(name, m, { origin, nowMs, maxRunAgeH, maxUpdateAgeH, proxyPath, retired = null }) {
  const out = [];
  const ok = (id, pass, detail) => out.push({ id, name: `${name} · ${id}`, pass, detail });

  if (m == null || typeof m !== 'object') {
    ok('H1 valides JSON', false, 'nicht lesbar oder kein Objekt');
    return out;
  }
  ok('H1 valides JSON', true);

  const runAt = Date.parse(m.runAt ?? '');
  const runAgeH = Number.isFinite(runAt) ? (nowMs - runAt) / 3.6e6 : NaN;
  // Stillgelegtes Manifest: nicht bewertet, aber das Alter bleibt im Text (kein stilles Grün).
  const retiredNote = retired ? ` — stillgelegt (${retired}), nicht bewertet` : '';
  ok('H2 Lauf-Alter', !!retired || (Number.isFinite(runAgeH) && runAgeH < maxRunAgeH),
    (Number.isFinite(runAgeH) ? `Lauf ${m.run} ist ${runAgeH.toFixed(1)} h alt (Grenze ${maxRunAgeH} h)` : 'runAt fehlt/ungültig') + retiredNote);

  const upAt = Date.parse(m.updatedAt ?? '');
  const upAgeH = Number.isFinite(upAt) ? (nowMs - upAt) / 3.6e6 : NaN;
  ok('H3 Advance-Alter', !!retired || (Number.isFinite(upAgeH) && upAgeH < maxUpdateAgeH),
    (Number.isFinite(upAgeH) ? `zuletzt umgelegt vor ${upAgeH.toFixed(1)} h (Grenze ${maxUpdateAgeH} h)` : 'updatedAt fehlt/ungültig') + retiredNote);

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
 * Index des Daten-Repos (`index.json`) — die Quelle, aus der der Client Lauf und Schritte liest (`resolveRunFromRepackIndex`).
 * Reine Prüflogik, von `verify-health.mjs` netzfrei getestet. Schritte stehen im Index als Objekte (V-BW-51).
 */
export const INDEX_HEALTH = Object.freeze({
  url: 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/index.json',
  families: Object.freeze(['wind', 'temp', 'gust', 'precip']),
});
export function checkRepackIndex(idx, { nowMs, maxRunAgeH, maxUpdateAgeH }) {
  const out = [];
  const name = 'index.json (Daten-Repo)';
  const ok = (id, pass, detail) => out.push({ id, name: `${name} · ${id}`, pass, detail });
  const runs = idx && typeof idx === 'object' && Array.isArray(idx.runs) ? idx.runs.filter((r) => r && typeof r === 'object' && /^\d{10}$/.test(String(r.run))) : [];
  if (!idx || typeof idx !== 'object' || idx.schema !== 1 || !runs.length) {
    ok('I1 Index lesbar', false, !idx || typeof idx !== 'object' ? 'nicht lesbar oder kein Objekt' : `Schema ${idx.schema ?? '(fehlt)'}, ${runs.length} Läufe`);
    return out;
  }
  ok('I1 Index lesbar', true, `${runs.length} Läufe, jüngster ${runs.map((r) => r.run).sort().at(-1)}`);
  const pubAt = Date.parse(idx.publishedAt ?? '');
  const pubH = Number.isFinite(pubAt) ? (nowMs - pubAt) / 3.6e6 : NaN;
  ok('I2 Publisher', Number.isFinite(pubH) && pubH < maxUpdateAgeH,
    Number.isFinite(pubH) ? `zuletzt veröffentlicht vor ${pubH.toFixed(1)} h (Grenze ${maxUpdateAgeH} h)` : 'publishedAt fehlt/ungültig');
  const parts = [];
  let bad = false;
  for (const fam of INDEX_HEALTH.families) {
    let best = NaN, bestRun = null;
    for (const r of runs) {
      const f = r[fam];
      if (!f || typeof f !== 'object' || !Array.isArray(f.steps) || !f.steps.length) continue;
      const t = Date.parse(r.runAt ?? '');
      if (Number.isFinite(t) && (!Number.isFinite(best) || t > best)) { best = t; bestRun = r.run; }
    }
    const ageH = Number.isFinite(best) ? (nowMs - best) / 3.6e6 : NaN;
    if (!(Number.isFinite(ageH) && ageH < maxRunAgeH)) bad = true;
    parts.push(`${fam} ${bestRun ?? '—'}${Number.isFinite(ageH) ? ` (${ageH.toFixed(1)} h)` : ''}`);
  }
  ok('I3 Läufe je Familie', !bad, `${parts.join(' · ')} — Grenze ${maxRunAgeH} h`);
  return out;
}

/**
 * V-AW-69 (23.10.2026): der Punkt-Cube (`point/index.json`) — das, was buscosun Fusion liest. Vom 19.10. 13:02 UTC an
 * scheiterte jeder `point`-Lauf am Terminregister (V-EX-1), der Cube stand vier Tage, `road-fc` ab 21.10.; der Index
 * des Kartenlayers (I1–I3) blieb grün, weil die Kartenlinie ein anderer Workflow ist. Grenzen je Stufe aus
 * `scripts/repack-repo/workflow-point.yml`: Takt + gemessene Bereitstellung der Quelle + Lauf + Rand —
 * t1 8×/Tag (3 h + 1,67 h ICON-D2), t2 4×/Tag (6 h + 4,5 h ICON-EU/MOSMIX-L), t3 2×/Tag (12 h + 7,6 h IFS).
 * `runAt` im Index ist die Laufzeit der QUELLE, deshalb rechnen die Grenzen die Bereitstellung mit.
 * `POINT_HEALTH=0` schaltet ab, `POINT_INDEX_URL` überschreibt die Adresse.
 */
export const POINT_HEALTH = Object.freeze({
  url: 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/point/index.json',
  /** Longest acceptable age (h) of the newest run per tier — set from the cron table, not measured on an outage. */
  maxRunAgeH: Object.freeze({ t1: 7, t2: 13, t3: 22 }),
  /** Some tier publishes at least every 3 h (t1); a stalled gate leaves `publishedAt` standing. */
  maxPublishAgeH: 6,
});
export function checkPointIndex(idx, { nowMs }) {
  const out = [];
  const name = 'point/index.json (Punkt-Cube)';
  const ok = (id, pass, detail) => out.push({ id, name: `${name} · ${id}`, pass, detail });
  const tiers = idx && typeof idx === 'object' && idx.latestByTier && typeof idx.latestByTier === 'object' ? idx.latestByTier : null;
  if (!tiers || !Number.isInteger(idx.schema) || !Object.keys(POINT_HEALTH.maxRunAgeH).every((t) => tiers[t] && typeof tiers[t] === 'object')) {
    ok('P1 Index lesbar', false, !idx || typeof idx !== 'object' ? 'nicht lesbar oder kein Objekt' : `Schema ${idx.schema ?? '(fehlt)'}, Stufen ${tiers ? Object.keys(tiers).join(', ') || '(keine)' : '(fehlen)'}`);
    return out;
  }
  ok('P1 Index lesbar', true, `Schema ${idx.schema}, Stufen ${Object.keys(tiers).join(', ')}`);
  const pubAt = Date.parse(idx.publishedAt ?? '');
  const pubH = Number.isFinite(pubAt) ? (nowMs - pubAt) / 3.6e6 : NaN;
  ok('P2 Punkt-Cron', Number.isFinite(pubH) && pubH < POINT_HEALTH.maxPublishAgeH,
    Number.isFinite(pubH) ? `zuletzt veröffentlicht vor ${pubH.toFixed(1)} h (Grenze ${POINT_HEALTH.maxPublishAgeH} h)` : 'publishedAt fehlt/ungültig');
  const parts = [];
  let bad = false;
  for (const [tier, limit] of Object.entries(POINT_HEALTH.maxRunAgeH)) {
    const t = Date.parse(tiers[tier]?.runAt ?? '');
    const ageH = Number.isFinite(t) ? (nowMs - t) / 3.6e6 : NaN;
    const pass = Number.isFinite(ageH) && ageH < limit;
    if (!pass) bad = true;
    parts.push(`${tier} ${tiers[tier]?.run ?? '—'}${Number.isFinite(ageH) ? ` (${ageH.toFixed(1)} h, Grenze ${limit} h)` : ' (runAt fehlt)'}${pass ? '' : ' ROT'}`);
  }
  ok('P3 Läufe je Stufe', !bad, parts.join(' · '));
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
  /** R8 (AW-6.2.1, V-VS-4): series in state `ok` needed = ROAD_SLOT_BASELINE − ROAD_SLOT_TOLERANCE of the contract (the slot
   *  lock's own number; `verify:road-vs` keeps them equal). Below it the job is red and names the series that are not ok. */
  groupsOkMin: 20,
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
  // AW-7.3 (audit/autobahnwetter.md §19): the hazard product `hz/` — present once the mirror runs with the step; its slot
  // must be as fresh as the measurements, no input may be missing for long, the locks must not fire (Gate E reads this).
  const hz = s.hz;
  if (hz && typeof hz === 'object') {
    const hzMin = (nowMs - roadStampMs(hz.lastPublishedSlot)) / 60_000;
    const blocked = hz.blocked?.slot ? ` · zuletzt gesperrt ${hz.blocked.slot} (${(hz.blocked.reasons ?? []).slice(0, 2).join('; ')})` : '';
    const b = hz.balance ? ` · ${hz.balance.withLevel} von ${hz.balance.segments} Abschnitten mit Stufe, ${hz.balance.unknown} unbekannt, ${(hz.balance.ms / 1000).toFixed(0)} s` : '';
    // Before Jan installs `static/segments.json` (MANUELLE-SCHRITTE §71.2) the step has nothing to derive: that is the
    // expected state, not a failure — the rule turns red only once a slot was published or the lock has another reason.
    const waitsForSegments = !hz.lastPublishedSlot && (hz.blocked?.reasons ?? []).some((r) => /segments\.json fehlt/.test(String(r)));
    ok('R6 Gefahren-Slot', s.killSwitch || waitsForSegments || (Number.isFinite(hzMin) && hzMin <= ROAD_HEALTH.staleMin),
      Number.isFinite(hzMin) ? `hz-Slot ${hz.lastPublishedSlot} ist ${hzMin.toFixed(0)} min alt (Grenze ${ROAD_HEALTH.staleMin} min)${b}${blocked}`
        : waitsForSegments ? `Gefahren-Schritt wartet auf static/segments.json im Daten-Repo (§71.2)${blocked}` : `kein freigegebener hz-Slot${blocked}`);
    const missing = Array.isArray(hz.missing) ? hz.missing : [];
    ok('R7 Gefahren-Eingänge', missing.length === 0, missing.length ? `fehlen oder zu alt: ${missing.join(', ')}` : 'obs, fc, RV, KONRAD3D, runs vorhanden');
  } else {
    ok('R6 Gefahren-Slot', true, 'kein hz-Block im Status — Gefahren-Schritt (AW-7.3) läuft noch nicht');
  }
  // R8 (AW-6.2.1, V-VS-4): freshness PER SERIES — a dead state series (LH-LH, WW-SO on 27.10.2026; DD-DD for days in
  // October) is invisible in R2/R3 while the other 20 series keep the slot alive. Named always, red only below the lock's number.
  const groups = s.groups && typeof s.groups === 'object' ? Object.entries(s.groups) : [];
  if (groups.length) {
    const notOk = groups.filter(([, g]) => g?.state !== 'ok').map(([id, g]) => `${id} ${g?.state ?? '?'}${Number.isFinite(g?.ageMin) ? ` (${g.ageMin} min)` : ''}`);
    const nOk = groups.length - notOk.length;
    ok('R8 GMA-Reihen', s.killSwitch || nOk >= ROAD_HEALTH.groupsOkMin,
      `${nOk} von ${groups.length} Reihen ok (Grenze ${ROAD_HEALTH.groupsOkMin})${notOk.length ? ` · nicht ok: ${notOk.join(', ')}` : ''}`);
  }
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
      results.push(...checkManifest(meta.name, m, { origin: baseUrl, nowMs, maxRunAgeH: MAX_RUN_AGE_H, maxUpdateAgeH: MAX_UPDATE_AGE_H, proxyPath: meta.proxy, retired: meta.retired }));
    }
    if (process.env.INDEX_HEALTH !== '0') {
      let idx = null;
      try { idx = await loadRemote(process.env.REPACK_INDEX_URL ?? INDEX_HEALTH.url); }
      catch (e) { results.push({ id: 'I1', name: 'index.json (Daten-Repo) · I1 erreichbar', pass: false, detail: String(e?.message ?? e) }); }
      if (idx) results.push(...checkRepackIndex(idx, { nowMs, maxRunAgeH: MAX_RUN_AGE_H, maxUpdateAgeH: MAX_UPDATE_AGE_H }));
    }
    // V-AW-69: the point cube — the product buscosun Fusion and the route forecast read; a stalled `point` cron shows here.
    if (process.env.POINT_HEALTH !== '0') {
      let pidx = null;
      try { pidx = await loadRemote(process.env.POINT_INDEX_URL ?? POINT_HEALTH.url); }
      catch (e) { results.push({ id: 'P1', name: 'point/index.json (Punkt-Cube) · P1 erreichbar', pass: false, detail: String(e?.message ?? e) }); }
      if (pidx) results.push(...checkPointIndex(pidx, { nowMs }));
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
