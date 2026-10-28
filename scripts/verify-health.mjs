/**
 * verify-health.mjs — netzfreie Verifikation des Betriebs-Wächters (V-79).
 * Importiert die ECHTE Prüflogik aus `health-manifests.mjs` (kein Copy).
 *
 *   npm run verify:health
 *
 * Der Wächter ist selbst ein Prüfmittel — er muss also nachweislich rot werden
 * können, sonst wiederholt er den Fehler, den er aufdecken soll (V-91).
 */
import { checkManifest, checkRoadStatus, checkRoadCdn, roadCdnSlot, ROAD_HEALTH, checkSeaStatus, SEA_HEALTH, checkRepackIndex, INDEX_HEALTH, checkPointIndex, POINT_HEALTH } from './health-manifests.mjs';

const NOW = Date.parse('2026-08-03T12:00:00.000Z');
const OPTS = { origin: 'https://buscosun.com', nowMs: NOW, maxRunAgeH: 9, maxUpdateAgeH: 6, proxyPath: '/_dwd_grib' };

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });
const idOf = (res, id) => res.find((r) => r.id === id);

const healthy = {
  run: '2026080306',
  runAt: '2026-08-03T06:00:00.000Z',        // 6 h alt
  updatedAt: '2026-08-03T08:00:00.000Z',    // vor 4 h umgelegt
  warmedThroughProxy: 'https://buscosun.com/_dwd_grib',
  params: { t_2m: [0, 1, 2, 3], tot_prec: [0, 1, 2] },
};

// ── Gesunder Fall: alles grün ────────────────────────────────────────────────
{
  const r = checkManifest('latest-grib.json', healthy, OPTS);
  add('gesundes Manifest → alle Prüfungen grün', r.every((x) => x.pass), r.filter((x) => !x.pass).map((x) => x.id).join(',') || 'keine');
}

// ── H1 ───────────────────────────────────────────────────────────────────────
add('H1 rot bei nicht lesbarem Manifest', idOf(checkManifest('m', null, OPTS), 'H1 valides JSON')?.pass === false);

// ── H2 Lauf-Alter ────────────────────────────────────────────────────────────
{
  const stale = { ...healthy, runAt: '2026-08-03T02:00:00.000Z' };   // 10 h
  add('H2 rot bei 10 h altem Lauf (Grenze 9 h)', idOf(checkManifest('m', stale, OPTS), 'H2 Lauf-Alter')?.pass === false);
  const edge = { ...healthy, runAt: '2026-08-03T03:30:00.000Z' };    // 8,5 h
  add('H2 grün bei 8,5 h', idOf(checkManifest('m', edge, OPTS), 'H2 Lauf-Alter')?.pass === true);
  add('H2 rot ohne runAt', idOf(checkManifest('m', { ...healthy, runAt: undefined }, OPTS), 'H2 Lauf-Alter')?.pass === false);
}

// ── H3 Advance-Alter — der eigentliche V-79-Fall ─────────────────────────────
{
  // Das ist der Zustand, den die grünen Cron-Runs verbergen: frisch genug
  // aussehender Lauf, aber das Manifest wurde seit Stunden nicht umgelegt.
  const stuck = { ...healthy, updatedAt: '2026-08-03T05:00:00.000Z' };   // vor 7 h
  add('H3 rot bei 7 h ohne Advance (DER V-79-FALL)', idOf(checkManifest('m', stuck, OPTS), 'H3 Advance-Alter')?.pass === false);
  add('H3 rot ohne updatedAt', idOf(checkManifest('m', { ...healthy, updatedAt: undefined }, OPTS), 'H3 Advance-Alter')?.pass === false);
}

// ── H4 Warm-Proxy ────────────────────────────────────────────────────────────
{
  const wrong = { ...healthy, warmedThroughProxy: 'http://localhost:5178/_dwd_grib' };
  add('H4 rot bei localhost-Proxy (Cron wärmt fremden Cache)', idOf(checkManifest('m', wrong, OPTS), 'H4 Warm-Proxy')?.pass === false);
  const altDomain = { ...healthy, warmedThroughProxy: 'https://buscosun.app/_dwd_grib' };
  add('H4 rot bei Alt-Domain (V-02/V-100)', idOf(checkManifest('m', altDomain, OPTS), 'H4 Warm-Proxy')?.pass === false);
  add('H4 entfällt ohne Origin (Datei-Modus)',
    checkManifest('m', { ...healthy, warmedThroughProxy: 'egal' }, { ...OPTS, origin: null }).every((x) => x.id !== 'H4 Warm-Proxy'));

  // Ab 2026-08-23 (audit/bandbreite.md §16) ist das Cache-Wärmen entfernt:
  // kein `warmedThroughProxy` mehr — die Herkunft steht in `publishedFor`.
  const publishedOnly = { ...healthy, warmedThroughProxy: undefined, publishedFor: 'https://buscosun.com' };
  add('H4 grün im Manifest-Betrieb (publishedFor statt warmedThroughProxy)',
    idOf(checkManifest('m', publishedOnly, OPTS), 'H4 Warm-Proxy')?.pass === true);
  const publishedLocalhost = { ...publishedOnly, publishedFor: 'http://localhost:5196' };
  add('H4 rot bei localhost in publishedFor (lokal geschriebenes Manifest)',
    idOf(checkManifest('m', publishedLocalhost, OPTS), 'H4 Warm-Proxy')?.pass === false);
  const publishedAlt = { ...publishedOnly, publishedFor: 'https://buscosun.app' };
  add('H4 rot bei Alt-Domain in publishedFor (V-02/V-100)',
    idOf(checkManifest('m', publishedAlt, OPTS), 'H4 Warm-Proxy')?.pass === false);
  add('H4 rot, wenn beide Herkunftsfelder fehlen',
    idOf(checkManifest('m', { ...healthy, warmedThroughProxy: undefined }, OPTS), 'H4 Warm-Proxy')?.pass === false);
  // Der Proxy-Pfad darf NICHT als publishedFor durchgehen (sonst hebelt ein
  // Alt-Manifest die Wind/Grib-Unterscheidung aus).
  add('H4 rot, wenn publishedFor den Proxy-Pfad mitträgt',
    idOf(checkManifest('m', { ...publishedOnly, publishedFor: 'https://buscosun.com/_dwd_grib' }, OPTS), 'H4 Warm-Proxy')?.pass === false);
}

// ── H5 Step-Vollständigkeit ──────────────────────────────────────────────────
{
  const gap = { ...healthy, params: { t_2m: [0, 1, 3, 4] } };
  add('H5 rot bei Lücke in der Step-Liste', idOf(checkManifest('m', gap, OPTS), 'H5 Step-Vollständigkeit')?.pass === false);
  const notFromZero = { ...healthy, params: { t_2m: [1, 2, 3] } };
  add('H5 rot wenn nicht bei Step 0 beginnend', idOf(checkManifest('m', notFromZero, OPTS), 'H5 Step-Vollständigkeit')?.pass === false);
  add('H5 rot bei leerer Liste', idOf(checkManifest('m', { ...healthy, params: { t_2m: [] } }, OPTS), 'H5 Step-Vollständigkeit')?.pass === false);
  add('H5 rot ohne params und ohne steps', idOf(checkManifest('m', { ...healthy, params: undefined }, OPTS), 'H5 Step-Vollständigkeit')?.pass === false);
  // Ein flaches steps[] statt params{} verstehen: diese Form trug bis BW-13 das
  // Wind-Manifest. Es gibt sie nicht mehr im Betrieb, die Prüflogik bleibt aber
  // formunabhängig — und genau das hält diese Zeile fest.
  const wind = { run: 'R', runAt: healthy.runAt, updatedAt: healthy.updatedAt, warmedThroughProxy: 'https://buscosun.com/_dwd_wind', steps: [0, 1, 2, 3, 4] };
  add('H5 versteht auch ein flaches steps[] (Form ohne Produzent seit BW-13)',
    idOf(checkManifest('flach.json', wind, { ...OPTS, proxyPath: '/_dwd_wind' }), 'H5 Step-Vollständigkeit')?.pass === true);
}

// ── R: Straßenwetter road/v1/status.json (Phase AW, audit/autobahnwetter.md §4.4) ─────────────
{
  const RNOW = Date.parse('2026-10-03T13:20:00.000Z');
  const ropts = { nowMs: RNOW };
  const rec = (slot, derivedAt, publish = true) => ({ slot, publish, derivedAt, points: 1500, share: 0.012, groups: 23 });
  const ok = {
    schema: 1, product: 'road-status', job: '1', updatedAt: '2026-10-03T13:18:30.000Z', killSwitch: false,
    lastSlot: '2610031300', lastPublishedSlot: '2610031300', blocked: null,
    catalog: { etag: 'x', state: 'ok', checkedAt: '2026-10-03T12:50:00.000Z' }, groups: {}, balance: null,
    recent: [rec('2610031300', '2026-10-03T13:04:10.000Z'), rec('2610031245', '2026-10-03T12:49:30.000Z')],
  };
  const rid = (s, id) => checkRoadStatus(s, ropts).find((r) => r.id === id);
  add('R gesunder Status → alle Prüfungen grün', checkRoadStatus(ok, ropts).every((x) => x.pass),
    checkRoadStatus(ok, ropts).filter((x) => !x.pass).map((x) => x.id).join(',') || 'keine');
  add('R1 rot bei nicht lesbarem Status', rid(null, 'R1 Status lesbar')?.pass === false);
  add('R1 rot bei fremdem Produkt', rid({ ...ok, product: 'radar' }, 'R1 Status lesbar')?.pass === false);
  // R2: liveness of the ROAD derive, not of the mirror — every radar push refreshes updatedAt (review finding #3).
  add('R2 rot, wenn die Ableitung seit 50 min ruht, obwohl updatedAt frisch ist (Radar-Push)',
    rid({ ...ok, recent: [rec('2610031215', '2026-10-03T12:30:00.000Z')] }, 'R2 Ableitung')?.pass === false);
  add('R2 grün bei 40 min (Naht zwischen zwei Spiegel-Jobs)', rid({ ...ok, recent: [rec('2610031230', '2026-10-03T12:40:00.000Z')] }, 'R2 Ableitung')?.pass === true);
  add('R2 rot ohne abgeleiteten Slot', rid({ ...ok, recent: [] }, 'R2 Ableitung')?.pass === false);
  // R3: last released slot ≤ 45 min = ROAD_STALE_MS — beyond it the page says "veraltet" (plan: slot age < 45 min).
  add('R3 rot bei 60 min altem freigegebenen Slot (Seite zeigt „veraltet")', rid({ ...ok, lastPublishedSlot: '2610031220' }, 'R3 freigegebener Slot')?.pass === false);
  add('R3 rot, wenn der letzte freigegebene Slot 3,5 h alt ist', rid({ ...ok, lastPublishedSlot: '2610030945' }, 'R3 freigegebener Slot')?.pass === false);
  add('R3 grün bei gesperrtem Einzelslot (letzter freier 30 min alt)',
    rid({ ...ok, lastSlot: '2610031315', lastPublishedSlot: '2610031245', blocked: { slot: '2610031315', reasons: [{ rule: 'slotGroups' }] } }, 'R3 freigegebener Slot')?.pass === true);
  add('R3 rot ohne freigegebenen Slot', rid({ ...ok, lastPublishedSlot: null }, 'R3 freigegebener Slot')?.pass === false);
  add('R4 rot bei fehlendem Stationskatalog', rid({ ...ok, catalog: { state: 'missing' } }, 'R4 Katalog')?.pass === false);
  add('R4 grün bei veraltetem Katalog (alte Datei bleibt)', rid({ ...ok, catalog: { state: 'stale' } }, 'R4 Katalog')?.pass === true);
  // R8 (AW-6.2.1): per-series freshness — 20 ok of 24 is the lock's number; 19 is red and names the dead series.
  const grp = (nOk, nBad) => Object.fromEntries([...Array.from({ length: nOk }, (_, i) => [`G${i}-OK`, { state: 'ok', ageMin: 1, stations: 10 }]), ...Array.from({ length: nBad }, (_, i) => [`G${i}-XX`, { state: i % 2 ? 'missing' : 'stale', ageMin: i % 2 ? null : 95, stations: 0 }])]);
  add('R8 grün bei 20 von 24 Reihen ok, nennt die vier anderen', (() => { const r = rid({ ...ok, groups: grp(20, 4) }, 'R8 GMA-Reihen'); return r?.pass === true && /G0-XX stale \(95 min\)/.test(r.detail) && /G1-XX missing/.test(r.detail); })());
  add('R8 rot bei 19 von 24 Reihen ok', rid({ ...ok, groups: grp(19, 5) }, 'R8 GMA-Reihen')?.pass === false);
  add('R8 fehlt ohne groups im Status (alte Form)', rid(ok, 'R8 GMA-Reihen') === undefined);
  add('R8 grün bei Kill-Schalter trotz toter Reihen', rid({ ...ok, killSwitch: true, lastPublishedSlot: '2610030800', groups: grp(0, 24) }, 'R8 GMA-Reihen')?.pass === true);
  // A deliberate kill switch is not an outage — it must not mail every hour, but it is named.
  const killed = checkRoadStatus({ ...ok, killSwitch: true, lastPublishedSlot: '2610030800' }, ropts);
  add('Kill-Schalter: grün und benannt', killed.every((x) => x.pass) && killed.some((x) => /Kill/.test(x.detail ?? '')), killed.map((x) => `${x.id}:${x.pass}`).join(','));
  // R5: what jsDelivr really serves (plan) — the newest released slot that is ≥ 10 min old (an earlier request could
  // pin a 404 at the edge), checked as the page would read it.
  add('R5 wählt den jüngsten freigegebenen Slot, der ≥ 10 min alt ist', roadCdnSlot(ok, RNOW) === '2610031300' && roadCdnSlot({ ...ok, recent: [rec('2610031315', '2026-10-03T13:18:00.000Z'), ...ok.recent] }, RNOW) === '2610031300');
  // Catch-up after a start: slots of the morning were derived minutes ago but already left obs/ (3 h) — never ask for them.
  add('R5 übergeht nachgeholte Slots, die schon aus der Aufbewahrung fielen (> 2 h alt)',
    roadCdnSlot({ ...ok, recent: [rec('2610031315', '2026-10-03T13:18:00.000Z'), rec('2610030845', '2026-10-03T13:05:00.000Z')] }, RNOW) === null);
  const obs = { schema: 1, product: 'road-obs', slot: '2610031300', points: [{ id: 'X' }] };
  add('R5 grün, wenn das CDN die Slot-Datei mit Punkten ausliefert', checkRoadCdn(obs, '2610031300').pass === true);
  add('R5 rot bei fremdem Slot, leerer oder fehlender Datei', checkRoadCdn({ ...obs, slot: '2610031245' }, '2610031300').pass === false
    && checkRoadCdn({ ...obs, points: [] }, '2610031300').pass === false && checkRoadCdn(null, '2610031300').pass === false);
  add('Grenzen = Vertrag (45 min)', ROAD_HEALTH.staleMin === 45);
}

// ── S: Seewetter sea/v1/status.json (Phase SW, audit/seewetter.md §6) ────────────────────────────────
{
  const SNOW = Date.parse('2026-10-07T13:00:00Z');
  const ok = { schema: 1, product: 'sea-status', killSwitch: false, field: { lastPublishedRun: '2026100700', blocked: null }, text: { WODL45: { issuedAt: '2026-10-07T12:00:00.000Z' }, FQDL50: { issuedAt: '2026-10-07T11:00:00.000Z' } } };
  const pass = (s, now = SNOW) => checkSeaStatus(s, { nowMs: now }).map((r) => r.pass);
  add('S1–S3 grün bei frischem Lauf (13 h) und frischen Texten', pass(ok).every(Boolean), JSON.stringify(pass(ok)));
  add('S1 rot bei fremdem Produkt', pass({ ...ok, product: 'road-status' })[0] === false);
  add('S2 rot bei Lauf älter als 18 h (Grenze der Seite „veraltet“)', pass(ok, Date.parse('2026-10-07T19:30:00Z'))[1] === false);
  add('S3 rot bei Warnstatus älter als 4 h', pass({ ...ok, text: { ...ok.text, WODL45: { issuedAt: '2026-10-07T08:00:00.000Z' } } })[2] === false);
  add('Kill-Schalter: grün, benannt', pass({ ...ok, killSwitch: true, field: {} }).every(Boolean) && /Kill-Schalter/.test(checkSeaStatus({ ...ok, killSwitch: true }, { nowMs: SNOW })[0].detail ?? ''));
  add('Grenzen = Vertrag (18 h, 4 h, 6 h)', SEA_HEALTH.runStaleH === 18 && SEA_HEALTH.wodlStaleH === 4 && SEA_HEALTH.fqStaleH === 6);
}

// ── V-AW-61: stillgelegtes Manifest + Index des Daten-Repos (audit/autobahnwetter.md §19.10) ─────────────────────
{
  // Das echte Manifest vom 14.10.2026: Lauf 2026090406, zuletzt umgelegt 04.09. 07:22 UTC — Cron seit GBW12 aus.
  const RNOW = Date.parse('2026-10-14T08:47:00.000Z');
  const frozen = { run: '2026090406', runAt: '2026-09-04T06:00:00.000Z', updatedAt: '2026-09-04T07:22:48.031Z', publishedFor: 'https://buscosun.com', params: { t_2m: [0, 1, 2, 3], tot_prec: [0, 1, 2] } };
  const ropts = { origin: 'https://buscosun.com', nowMs: RNOW, maxRunAgeH: 9, maxUpdateAgeH: 6, proxyPath: '/_dwd_grib' };
  const RETIRED = 'warm-grib-Cron seit GBW12 aus';
  const stale = checkManifest('latest-grib.json', frozen, ropts);
  add('V-AW-61 Gegenprobe: dasselbe eingefrorene Manifest OHNE retired ⇒ H2 und H3 rot (der Wächter kann weiter rot werden)',
    idOf(stale, 'H2 Lauf-Alter')?.pass === false && idOf(stale, 'H3 Advance-Alter')?.pass === false);
  const ret = checkManifest('latest-grib.json', frozen, { ...ropts, retired: RETIRED });
  add('V-AW-61 mit retired ⇒ H2/H3 grün, tragen aber „stillgelegt", den Grund UND das tatsächliche Alter (kein stilles Grün)',
    ['H2 Lauf-Alter', 'H3 Advance-Alter'].every((id) => { const r = idOf(ret, id); return r?.pass === true && /stillgelegt/.test(r.detail) && r.detail.includes(RETIRED) && /\d+\.\d h/.test(r.detail); })
    && /ist 962\.\d h alt/.test(idOf(ret, 'H2 Lauf-Alter').detail), idOf(ret, 'H2 Lauf-Alter')?.detail);
  add('V-AW-61 retired lässt H1, H4, H5 scharf: andere Herkunft, Lücke in den Schritten, kein Manifest ⇒ weiter rot',
    idOf(checkManifest('m', { ...frozen, publishedFor: 'http://localhost:5196' }, { ...ropts, retired: RETIRED }), 'H4 Warm-Proxy')?.pass === false
    && idOf(checkManifest('m', { ...frozen, params: { t_2m: [0, 2] } }, { ...ropts, retired: RETIRED }), 'H5 Step-Vollständigkeit')?.pass === false
    && idOf(checkManifest('m', null, { ...ropts, retired: RETIRED }), 'H1 valides JSON')?.pass === false);
  add('V-AW-61 retired lässt ein FRISCHES Manifest unverändert grün', checkManifest('m', { ...frozen, run: '2026101406', runAt: '2026-10-14T06:00:00.000Z', updatedAt: '2026-10-14T07:30:00.000Z' }, { ...ropts, retired: RETIRED }).every((x) => x.pass));

  // index.json in der echten Form (V-BW-51: Schritte sind Objekte, nicht Zahlen; Familien tragen `steps`).
  const fam = (n = 3) => ({ channels: 1, steps: Array.from({ length: n }, (_, i) => ({ step: i, file: `f-${i}.png`, bytes: 1000 + i })) });
  const run = (id, at, over = {}) => ({ run: id, runAt: at, path: `runs/${id}`, targetWidth: 700, wind: fam(), temp: fam(), gust: fam(), precip: fam(), cape: fam(), ...over });
  const idx = {
    schema: 1, commit: 'abc', publishedAt: '2026-10-14T07:07:41.040Z',
    runs: [run('2026101406', '2026-10-14T06:00:00.000Z'), run('2026101403', '2026-10-14T03:00:00.000Z'), run('2026101400', '2026-10-14T00:00:00.000Z'), run('2026101321', '2026-10-13T21:00:00.000Z')],
  };
  const io = { nowMs: RNOW, maxRunAgeH: 9, maxUpdateAgeH: 6 };
  const ir = (x, id) => checkRepackIndex(x, io).find((r) => r.id.startsWith(id));
  const green = checkRepackIndex(idx, io);
  add('I1–I3 grün beim frischen Index (Lauf 06z 2,8 h alt, veröffentlicht vor 1,7 h)', green.length === 3 && green.every((x) => x.pass), green.map((x) => `${x.id}:${x.pass}`).join(','));
  add('I1 rot bei nicht lesbarem Index, fremdem Schema und ohne Läufe', ir(null, 'I1')?.pass === false && ir({ ...idx, schema: 2 }, 'I1')?.pass === false && ir({ ...idx, runs: [] }, 'I1')?.pass === false
    && checkRepackIndex(null, io).length === 1);
  add('I2 rot, wenn der Publisher seit 7 h nichts veröffentlicht hat (Lauf selbst noch jung)', ir({ ...idx, publishedAt: '2026-10-14T01:40:00.000Z' }, 'I2')?.pass === false);
  add('I2 rot ohne publishedAt', ir({ ...idx, publishedAt: undefined }, 'I2')?.pass === false);
  // I3 je Familie: nur ein Lauf mit Niederschlag-Schritten, der alt ist, während der Rest frisch ist.
  const noPrecip = { ...idx, runs: [run('2026101406', '2026-10-14T06:00:00.000Z', { precip: { channels: 1, steps: [] } }), run('2026101403', '2026-10-14T03:00:00.000Z', { precip: undefined }),
    run('2026101400', '2026-10-14T00:00:00.000Z', { precip: undefined }), run('2026101321', '2026-10-13T21:00:00.000Z')] };
  const r3 = ir(noPrecip, 'I3');
  add('I3 rot, wenn EINE Familie (precip) nur noch in einem 11,8 h alten Lauf Schritte hat, und nennt sie', r3?.pass === false && /precip 2026101321 \(11\.8 h\)/.test(r3.detail ?? '') && /wind 2026101406/.test(r3.detail ?? ''), r3?.detail);
  add('I3 Gegenprobe: dieselbe Lage mit Niederschlag im 03z-Lauf ⇒ grün', ir({ ...noPrecip, runs: [noPrecip.runs[0], run('2026101403', '2026-10-14T03:00:00.000Z'), noPrecip.runs[2], noPrecip.runs[3]] }, 'I3')?.pass === true);

  // V-AW-69: point/index.json in der echten Form (Schema 6, latestByTier je Stufe mit runAt = Laufzeit der Quelle).
  const tier = (run, runAt) => ({ run, runAt, path: `point/${run}`, manifest: `point/${run}/run.json`, sourceRun: run, sourceRunAt: runAt, ageH: 0, files: 1, bytes: 1 });
  const pidx = { schema: 6, commit: 'abc', publishedAt: '2026-10-14T07:47:00.000Z', retentionHours: 24,
    latestByTier: { t1: tier('2026101406', '2026-10-14T06:00:00Z'), t2: tier('2026101400', '2026-10-14T00:00:00Z'), t3: tier('2026101312', '2026-10-13T12:00:00Z') } };
  const pr = (x, id) => checkPointIndex(x, { nowMs: RNOW }).find((r) => r.id.startsWith(id));
  const pgreen = checkPointIndex(pidx, { nowMs: RNOW });
  add('P1–P3 grün beim frischen Punkt-Index (t1 2,8 h, t2 8,8 h, t3 20,8 h alt, veröffentlicht vor 1 h)', pgreen.length === 3 && pgreen.every((x) => x.pass), pgreen.map((x) => `${x.id}:${x.pass}`).join(','));
  add('P1 rot bei nicht lesbarem Index, ohne Stufen und ohne t3', pr(null, 'P1')?.pass === false && pr({ ...pidx, latestByTier: undefined }, 'P1')?.pass === false && pr({ ...pidx, latestByTier: { t1: pidx.latestByTier.t1, t2: pidx.latestByTier.t2 } }, 'P1')?.pass === false);
  add(`P2 rot, wenn seit ${POINT_HEALTH.maxPublishAgeH} h nichts veröffentlicht wurde (19.10.: stehender Punkt-Cron) und ohne publishedAt`,
    pr({ ...pidx, publishedAt: '2026-10-14T02:40:00.000Z' }, 'P2')?.pass === false && pr({ ...pidx, publishedAt: undefined }, 'P2')?.pass === false && pr(pidx, 'P2')?.pass === true);
  const stale1 = pr({ ...pidx, latestByTier: { ...pidx.latestByTier, t1: tier('2026101400', '2026-10-14T00:00:00Z') } }, 'P3');
  add(`P3 rot, wenn t1 8,8 h alt ist (Grenze ${POINT_HEALTH.maxRunAgeH.t1} h), und nennt die Stufe ROT; t2 8,8 h bleibt grün (Grenze ${POINT_HEALTH.maxRunAgeH.t2} h)`,
    stale1?.pass === false && /t1 2026101400 \(8\.8 h, Grenze 7 h\) ROT/.test(stale1?.detail ?? '') && /t2 2026101400 \(8\.8 h, Grenze 13 h\)(?! ROT)/.test(stale1?.detail ?? ''), stale1?.detail);
  add('P3 Grenzen stehen über Takt + Bereitstellung aus workflow-point.yml (t1 3 + 1,67 h; t2 6 + 4,5 h; t3 12 + 7,6 h) und unter dem doppelten Takt',
    POINT_HEALTH.maxRunAgeH.t1 > 3 + 1.67 && POINT_HEALTH.maxRunAgeH.t1 <= 6 + 1.67 && POINT_HEALTH.maxRunAgeH.t2 > 6 + 4.5 && POINT_HEALTH.maxRunAgeH.t2 <= 12 + 4.5 && POINT_HEALTH.maxRunAgeH.t3 > 12 + 7.6 && POINT_HEALTH.maxRunAgeH.t3 <= 24 + 7.6);
  add('I3 rot bei einem Index, dessen jüngster Lauf 12 h alt ist (Publisher steht, publishedAt frisch)', ir({ ...idx, runs: [run('2026101321', '2026-10-13T21:00:00.000Z')] }, 'I3')?.pass === false);
  add('I3 eine Familie ohne `steps`-Liste zählt nicht (wind ohne Schritte in jedem Lauf ⇒ rot)', ir({ ...idx, runs: idx.runs.map((r) => ({ ...r, wind: { channels: 3 } })) }, 'I3')?.pass === false);
  add('Index-Familien = die vier, die der Client auflöst', INDEX_HEALTH.families.join() === 'wind,temp,gust,precip' && /raw\.githubusercontent\.com\/jppetry\/buscosun-data\/main\/index\.json$/.test(INDEX_HEALTH.url));
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
