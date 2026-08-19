/**
 * verify-health.mjs — netzfreie Verifikation des Betriebs-Wächters (V-79).
 * Importiert die ECHTE Prüflogik aus `health-manifests.mjs` (kein Copy).
 *
 *   npm run verify:health
 *
 * Der Wächter ist selbst ein Prüfmittel — er muss also nachweislich rot werden
 * können, sonst wiederholt er den Fehler, den er aufdecken soll (V-91).
 */
import { checkManifest } from './health-manifests.mjs';

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
}

// ── H5 Step-Vollständigkeit ──────────────────────────────────────────────────
{
  const gap = { ...healthy, params: { t_2m: [0, 1, 3, 4] } };
  add('H5 rot bei Lücke in der Step-Liste', idOf(checkManifest('m', gap, OPTS), 'H5 Step-Vollständigkeit')?.pass === false);
  const notFromZero = { ...healthy, params: { t_2m: [1, 2, 3] } };
  add('H5 rot wenn nicht bei Step 0 beginnend', idOf(checkManifest('m', notFromZero, OPTS), 'H5 Step-Vollständigkeit')?.pass === false);
  add('H5 rot bei leerer Liste', idOf(checkManifest('m', { ...healthy, params: { t_2m: [] } }, OPTS), 'H5 Step-Vollständigkeit')?.pass === false);
  add('H5 rot ohne params und ohne steps', idOf(checkManifest('m', { ...healthy, params: undefined }, OPTS), 'H5 Step-Vollständigkeit')?.pass === false);
  // Wind-Manifest trägt ein flaches steps[] statt params{}.
  const wind = { run: 'R', runAt: healthy.runAt, updatedAt: healthy.updatedAt, warmedThroughProxy: 'https://buscosun.com/_dwd_wind', steps: [0, 1, 2, 3, 4] };
  add('H5 versteht das flache steps[] des Wind-Manifests',
    idOf(checkManifest('latest-wind.json', wind, { ...OPTS, proxyPath: '/_dwd_wind' }), 'H5 Step-Vollständigkeit')?.pass === true);
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
