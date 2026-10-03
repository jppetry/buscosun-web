/**
 * verify-health.mjs — netzfreie Verifikation des Betriebs-Wächters (V-79).
 * Importiert die ECHTE Prüflogik aus `health-manifests.mjs` (kein Copy).
 *
 *   npm run verify:health
 *
 * Der Wächter ist selbst ein Prüfmittel — er muss also nachweislich rot werden
 * können, sonst wiederholt er den Fehler, den er aufdecken soll (V-91).
 */
import { checkManifest, checkRoadStatus, checkRoadCdn, roadCdnSlot, ROAD_HEALTH } from './health-manifests.mjs';

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
  // A deliberate kill switch is not an outage — it must not mail every hour, but it is named.
  const killed = checkRoadStatus({ ...ok, killSwitch: true, lastPublishedSlot: '2610030800' }, ropts);
  add('Kill-Schalter: grün und benannt', killed.every((x) => x.pass) && killed.some((x) => /Kill/.test(x.detail ?? '')), killed.map((x) => `${x.id}:${x.pass}`).join(','));
  // R5: what jsDelivr really serves (plan) — the newest released slot that is ≥ 10 min old (an earlier request could
  // pin a 404 at the edge), checked as the page would read it.
  add('R5 wählt den jüngsten freigegebenen Slot, der ≥ 10 min alt ist', roadCdnSlot(ok, RNOW) === '2610031300' && roadCdnSlot({ ...ok, recent: [rec('2610031315', '2026-10-03T13:18:00.000Z'), ...ok.recent] }, RNOW) === '2610031300');
  const obs = { schema: 1, product: 'road-obs', slot: '2610031300', points: [{ id: 'X' }] };
  add('R5 grün, wenn das CDN die Slot-Datei mit Punkten ausliefert', checkRoadCdn(obs, '2610031300').pass === true);
  add('R5 rot bei fremdem Slot, leerer oder fehlender Datei', checkRoadCdn({ ...obs, slot: '2610031245' }, '2610031300').pass === false
    && checkRoadCdn({ ...obs, points: [] }, '2610031300').pass === false && checkRoadCdn(null, '2610031300').pass === false);
  add('Grenzen = Vertrag (45 min)', ROAD_HEALTH.staleMin === 45);
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
