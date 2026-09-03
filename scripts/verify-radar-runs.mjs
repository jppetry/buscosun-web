/**
 * Headless-Verifikation der BW-5-Maßnahmen am Regenradar — prüft am ECHTEN
 * App-Code, dass (a) die gerechneten RADOLAN-RV-Zeitstempel dasselbe liefern wie
 * das 154-KB-Verzeichnis-Listing, das sie ersetzen, und (b) die Entdopplung
 * gleichzeitiger Ladevorgänge die dokumentierte Abbruch-Falle nicht wieder
 * aufmacht.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-radar-runs.mjs
 *
 * Hintergrund (`audit/bandbreite.md` §24): das RV-Verzeichnis ist ein lückenloses
 * 5-Minuten-Raster und kostet trotzdem 154 KiB HTML je Abruf, ohne jeden
 * Cache-Header — dreimal je DE-Kaltsitzung. Die Zeitstempel sind rechenbar; der
 * Veröffentlichungsverzug wurde über zwölf Läufe zu 3,28–3,43 min gemessen.
 *
 * Die Live-Zeilen (Abschnitt B) fragen `opendata.dwd.de` direkt. Ohne Netz
 * werden sie als ⊘ übersprungen statt als Fehler gezählt — die reine Rechen-
 * und Entdopplungslogik (A, C) ist netzfrei und immer scharf.
 */
import { guessRvRuns } from '../src/sources/radolan.ts';
import { shareInFlight, _inFlightCount } from '../src/sources/shareInFlight.ts';
// RD2 (audit/radar-datenrepo.md §13): CDN-Weg über das Daten-Repo
import {
  rvStamp, rvStampToMs, rvTarUrl, rvTarCdnUrl, rvTarUrlFor, rvCdnEligible,
  RV_CDN_GATE_MS, RADAR_CDN_WINDOW_MS, RADAR_CDN_BASE, RADAR_CDN_FAIL_LATCH,
  radarCdnEnabled, radarCdnUsable, noteRadarCdnFailure, _resetRadarCdn, radarCdnDeadline,
} from '../src/sources/radolanRuns.ts';
import {
  guessKonradStamps, konradCdnUrl, KONRAD_CDN_GATE_MS, KONRAD_PUBLISH_LAG_MIN,
} from '../src/sources/dwdKonrad3d.ts';

const checks = [];
const skipped = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });
const skip = (name, why) => skipped.push({ name, why });

const RV_DIR = 'https://opendata.dwd.de/weather/radar/composite/rv/';
const MIN = 60_000;

/** `YYMMDDHHMM` (UTC) → ms. */
function stampToMs(s) {
  return Date.UTC(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10));
}

// ---------------------------------------------------------------------------
// A. Die Rechenregel — netzfrei, deterministisch
// ---------------------------------------------------------------------------

// Referenzzeit: 2026-08-24 11:38:00 UTC. Der Lauf 11:35 war zu diesem Zeitpunkt
// veröffentlicht (Last-Modified 11:38:20 gemessen — 20 s später, also gerade
// NICHT; der Rat trifft hier bewusst zu früh und wird durch den 404 korrigiert).
const T = Date.UTC(2026, 7, 24, 11, 38, 0);

const g = guessRvRuns(3, T);
add('drei Kandidaten, absteigend, 5 Minuten Abstand',
  g.length === 3 && stampToMs(g[0]) - stampToMs(g[1]) === 5 * MIN && stampToMs(g[1]) - stampToMs(g[2]) === 5 * MIN,
  g.join(' '));
add('Format ist YYMMDDHHMM (10 Ziffern)', g.every((s) => /^\d{10}$/.test(s)), g[0]);
add('jeder Kandidat liegt auf einem 5-Minuten-Slot',
  g.every((s) => stampToMs(s) % (5 * MIN) === 0));
add('der jüngste Kandidat ist nicht in der Zukunft',
  stampToMs(g[0]) <= T, `${g[0]} vs ${new Date(T).toISOString()}`);

// Der Verzug ist die eine Zahl, an der die Regel hängt: der Rat darf höchstens
// so weit zurückliegen, dass er den gemessenen Median (3,33 min) nicht verpasst.
const lagMin = (T - stampToMs(g[0])) / MIN;
add('Rat liegt zwischen dem gemessenen Min-Verzug (3,28) und einem Slot (5 min)',
  lagMin >= 3.0 && lagMin < 5 + 3.28, `${lagMin.toFixed(2)} min`);

// Die Regel muss der Uhr 1:1 folgen: nie rückwärts, nie stehenbleiben, und über
// 30 Minuten Wanduhr genau 30 Minuten Slot-Fortschritt (6 Sprünge à 5 min).
{
  let ok = true, prev = null;
  const first = guessRvRuns(1, T)[0];
  let last = first;
  for (let k = 0; k <= 60; k++) {
    const s = guessRvRuns(1, T + k * 30_000)[0];   // 30 min in 30-s-Schritten
    if (prev && stampToMs(s) < stampToMs(prev)) ok = false;   // nie rückwärts
    prev = s; last = s;
  }
  const advancedMin = (stampToMs(last) - stampToMs(first)) / MIN;
  add('folgt der Uhr 1:1 — nie rückwärts, 30 min Wanduhr = 30 min Slot-Fortschritt',
    ok && advancedMin === 30, `${advancedMin} min`);
}

// Determinismus: dieselbe Zeit ⇒ dieselbe Antwort (der Verifier darf nicht raten).
add('deterministisch bei fester Bezugszeit',
  guessRvRuns(4, T).join() === guessRvRuns(4, T).join());

// Die Sequenz-Variante braucht LÜCKENLOSE Kandidaten (Rückblick-Archiv).
{
  const seq = guessRvRuns(10, T);
  let ok = true;
  for (let i = 1; i < seq.length; i++) if (stampToMs(seq[i - 1]) - stampToMs(seq[i]) !== 5 * MIN) ok = false;
  add('10 Kandidaten sind ein lückenloses 5-Minuten-Raster', ok, `${seq[9]} … ${seq[0]}`);
}

// ---------------------------------------------------------------------------
// B. Gegen die Wirklichkeit — der Rat gegen das echte Verzeichnis
// ---------------------------------------------------------------------------

let listing = null;
try {
  const res = await fetch(RV_DIR, { signal: AbortSignal.timeout(20_000) });
  if (res.ok) {
    const html = await res.text();
    const set = new Set();
    const re = /DE1200_RV(\d{10})\.tar\.bz2/g;
    let m;
    while ((m = re.exec(html)) !== null) set.add(m[1]);
    listing = { runs: [...set].sort().reverse(), bytes: Buffer.byteLength(html) };
  }
} catch { /* kein Netz → B wird übersprungen */ }

if (!listing || listing.runs.length < 20) {
  skip('B: Rat gegen das echte RV-Verzeichnis', 'opendata.dwd.de nicht erreichbar');
} else {
  const now = Date.now();
  const guessed = guessRvRuns(3, now);
  const newest = listing.runs[0];

  // DIE Kernbehauptung: der gerechnete Rat trifft den jüngsten wirklich
  // vorhandenen Lauf — oder liegt genau einen Slot davor bzw. dahinter (die
  // ~2,6-%-Fenster um den Veröffentlichungszeitpunkt, s. §24.3).
  const dSlots = (stampToMs(guessed[0]) - stampToMs(newest)) / (5 * MIN);
  add('Rat trifft den jüngsten vorhandenen Lauf (±1 Slot)',
    Math.abs(dSlots) <= 1, `Rat ${guessed[0]} · vorhanden ${newest} · ${dSlots} Slots`);

  // Und: mindestens einer der drei Kandidaten existiert wirklich — sonst wäre
  // der Fallback bei jedem Aufruf fällig und die Ersparnis eine Illusion.
  const have = new Set(listing.runs);
  add('mindestens einer der drei Kandidaten existiert',
    guessed.some((s) => have.has(s)), guessed.filter((s) => have.has(s)).join(' ') || 'KEINER');

  // Das Raster, auf dem die ganze Regel steht.
  let gaps = 0;
  for (let i = 1; i < listing.runs.length; i++) {
    if (stampToMs(listing.runs[i - 1]) - stampToMs(listing.runs[i]) !== 5 * MIN) gaps++;
  }
  add('das Verzeichnis ist ein lückenloses 5-Minuten-Raster',
    gaps === 0, `${listing.runs.length} Läufe, ${gaps} Lücken`);

  // Was die Maßnahme wert ist — die Zahl, die im Audit steht.
  add('das ersetzte Listing ist > 100 KB groß (sonst lohnt die Regel nicht)',
    listing.bytes > 100_000, `${listing.bytes} B`);

  // Die Kandidatenliste des Rückblick-Archivs muss im Verzeichnis liegen.
  const seq = guessRvRuns(10, now).slice(1);   // ohne den womöglich zu jungen ersten
  add('9 Rückblick-Kandidaten sind alle vorhanden',
    seq.every((s) => have.has(s)), `${seq.filter((s) => !have.has(s)).length} fehlen`);
}

// ---------------------------------------------------------------------------
// C. Entdopplung — und die Abbruch-Falle, die sie NICHT aufmachen darf
// ---------------------------------------------------------------------------

{
  let calls = 0;
  const slow = () => { calls++; return new Promise((r) => setTimeout(() => r('X'), 40)); };
  const [a, b, c] = await Promise.all([
    shareInFlight('t1', slow), shareInFlight('t1', slow), shareInFlight('t1', slow),
  ]);
  add('drei gleichzeitige Aufrufer lösen EINEN Lauf aus', calls === 1, `${calls} Läufe`);
  add('alle drei bekommen dasselbe Ergebnis', a === 'X' && b === 'X' && c === 'X');
}

{
  let calls = 0;
  const slow = () => { calls++; return Promise.resolve(calls); };
  await shareInFlight('t2', slow);
  await shareInFlight('t2', slow);
  add('nach dem Abschluss wird NICHT gecacht (Entdopplung, kein Cache)', calls === 2, `${calls} Läufe`);
}

{
  // Die Falle aus GBP1 (3) und BH4: der erste Aufrufer bricht ab, der zweite
  // darf davon NICHTS merken.
  let calls = 0, resolved = null;
  const slow = () => { calls++; return new Promise((r) => setTimeout(() => r('gut'), 60)); };
  const ac = new AbortController();
  const first = shareInFlight('t3', slow, ac.signal).then(() => 'erster-kam-durch', (e) => e.name);
  const second = shareInFlight('t3', slow).then((v) => { resolved = v; return v; });
  ac.abort();
  const firstOut = await first;
  const secondOut = await second;
  add('der abbrechende Aufrufer bekommt AbortError', firstOut === 'AbortError', String(firstOut));
  add('der zweite Aufrufer wird vom Abbruch des ersten NICHT vergiftet',
    secondOut === 'gut' && resolved === 'gut', String(secondOut));
  add('trotz Abbruch nur EIN Lauf', calls === 1, `${calls} Läufe`);
}

{
  // Ein bereits abgebrochenes Signal darf keinen Lauf starten, der niemandem gehört.
  let calls = 0;
  const ac = new AbortController();
  ac.abort();
  const out = await shareInFlight('t4', () => { calls++; return Promise.resolve('x'); }, ac.signal)
    .then(() => 'durch', (e) => e.name);
  add('vorab abgebrochenes Signal lehnt sofort ab', out === 'AbortError', String(out));
}

{
  // Ein Fehler darf den Schlüssel nicht blockieren.
  let calls = 0;
  const boom = () => { calls++; return Promise.reject(new Error('kaputt')); };
  await shareInFlight('t5', boom).catch(() => {});
  await shareInFlight('t5', boom).catch(() => {});
  add('nach einem Fehler ist der Schlüssel wieder frei', calls === 2, `${calls} Läufe`);
}

await new Promise((r) => setTimeout(r, 120));
add('am Ende ist keine Entdopplung mehr offen', _inFlightCount() === 0, `${_inFlightCount()} offen`);

// ---------------------------------------------------------------------------
// D. RD2 — der CDN-Weg (Daten-Repo/jsDelivr) mit Zeit-Gate, netzfrei
// ---------------------------------------------------------------------------

{
  // Rundlauf Zeitstempel ↔ ms: die Gate-Rechnung steht auf dieser Umkehrung.
  const slot = Date.UTC(2026, 7, 29, 13, 55, 0);
  add('[rd2] rvStamp ↔ rvStampToMs ist ein Rundlauf', rvStampToMs(rvStamp(new Date(slot))) === slot);

  const ts = rvStamp(new Date(slot));
  add('[rd2] CDN-URL hat die Spiegel-Form', rvTarCdnUrl(ts) === `${RADAR_CDN_BASE}/rv/DE1200_RV${ts}.tar.bz2`);
  add('[rd2] Netlify-URL bleibt unverändert (benannter Fallback)', rvTarUrl(ts).startsWith('/_dwd_opendata/weather/radar/composite/rv/'));

  // Das Gate: VOR Slot + 4:00 kein CDN (jsDelivr hielte unser 404 fest, §10.3:
  // 62–118 s), ab dem Gate bis zum Retention-Fenster ja, danach wieder Netlify.
  _resetRadarCdn();
  add('[rd2] 1 s vor dem Gate: kein CDN', !rvCdnEligible(ts, slot + RV_CDN_GATE_MS - 1000));
  add('[rd2] ab dem Gate: CDN', rvCdnEligible(ts, slot + RV_CDN_GATE_MS));
  add('[rd2] am Ende des Retention-Fensters: noch CDN', rvCdnEligible(ts, slot + RADAR_CDN_WINDOW_MS));
  add('[rd2] hinter dem Retention-Fenster: Netlify (liegt nicht mehr auf main)', !rvCdnEligible(ts, slot + RADAR_CDN_WINDOW_MS + 60_000));
  add('[rd2] Resolver: junger Slot → Netlify-URL (aggressiver Rat wie vor RD2)', rvTarUrlFor(ts, slot + 60_000) === rvTarUrl(ts));
  add('[rd2] Resolver: gegatteter Slot → CDN-URL', rvTarUrlFor(ts, slot + RV_CDN_GATE_MS) === rvTarCdnUrl(ts));

  // Das Gate muss die GEMESSENE Kette decken: DWD-Ablage max 3:26 + Push max 17 s
  // + CDN-Sichtbarkeit max 4 s (§8/§10.3) — sonst vergiftete der erste Client den Slot.
  add('[rd2] RV-Gate deckt die gemessene Kette (206 + 17 + 4 s) mit Reserve',
    RV_CDN_GATE_MS >= (206 + 17 + 4) * 1000, `${RV_CDN_GATE_MS} ms`);
  // Und das Fenster muss unter der Spiegel-Retention liegen (12 Läufe = 60 min).
  add('[rd2] Fenster < Retention des Spiegels', RADAR_CDN_WINDOW_MS < 60 * MIN, `${RADAR_CDN_WINDOW_MS} ms`);
  // Der Rückblick (9 Läufe ≈ 45 min) muss KOMPLETT durchs Fenster passen.
  add('[rd2] Rückblick-Kandidaten (9 × 5 min) liegen im CDN-Fenster', 9 * 5 * MIN <= RADAR_CDN_WINDOW_MS);

  // Kill-Switch: Query schlägt Speicher, in beide Richtungen (D-31-Muster).
  add('[rd2] ?radarcdn=0 schlägt localStorage=1', radarCdnEnabled('?radarcdn=0', '1') === false);
  add('[rd2] ?radarcdn=1 schlägt localStorage=0', radarCdnEnabled('?radarcdn=1', '0') === true);
  add('[rd2] localStorage=0 ohne Query schaltet ab', radarCdnEnabled('', '0') === false);
  add('[rd2] Standard ist AN', radarCdnEnabled('', null) === true);
  {
    // …und die Berechtigung folgt dem Schalter (über die echte globale Leitung).
    globalThis.localStorage = { getItem: (k) => (k === 'radarcdn' ? '0' : null) };
    const off = !rvCdnEligible(ts, slot + RV_CDN_GATE_MS);
    delete globalThis.localStorage;
    add('[rd2] abgeschalteter Kill-Switch sperrt die Berechtigung', off && rvCdnEligible(ts, slot + RV_CDN_GATE_MS));
  }

  // Sitzungs-Latch: harte Fehler (Netz/Timeout) schalten den Weg ab — 404 zählt nicht
  // (das prüft der Code selbst: `noteRadarCdnFailure` steht nur im catch-Zweig).
  _resetRadarCdn();
  for (let i = 0; i < RADAR_CDN_FAIL_LATCH; i++) noteRadarCdnFailure();
  add('[rd2] nach dem Latch keine CDN-Berechtigung mehr', !radarCdnUsable() && !rvCdnEligible(ts, slot + RV_CDN_GATE_MS));
  _resetRadarCdn();
  add('[rd2] Reset stellt die Berechtigung wieder her', radarCdnUsable());

  // Die CDN-Frist: bricht selbst ab, koppelt das Aufrufer-Signal, räumt auf.
  const d1 = radarCdnDeadline(undefined, 30);
  await new Promise((r) => setTimeout(r, 80));
  add('[rd2] Frist bricht den CDN-Versuch ab', d1.signal.aborted);
  const d2 = radarCdnDeadline(undefined, 30); d2.done();
  await new Promise((r) => setTimeout(r, 80));
  add('[rd2] done() räumt die Frist ab', !d2.signal.aborted);
  const ac = new AbortController();
  const d3 = radarCdnDeadline(ac.signal, 60_000); ac.abort();
  add('[rd2] Aufrufer-Abbruch schlägt durch', d3.signal.aborted); d3.done();
}

{
  // KONRAD3D: gerechnete Zeitstempel statt 78,5-KB-Listing (H12/V-RD-3).
  const T = Date.UTC(2026, 7, 29, 14, 2, 0);
  const g = guessKonradStamps(2, T);
  add('[rd2] KONRAD-Stempel: Format YYYYMMDDTHHMMSS, Sekunden 00',
    g.every((s) => /^\d{8}T\d{4}00$/.test(s)), g.join(' '));
  const toMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13));
  add('[rd2] KONRAD-Stempel: 5-Minuten-Raster, absteigend',
    toMs(g[0]) % (5 * MIN) === 0 && toMs(g[0]) - toMs(g[1]) === 5 * MIN);
  add('[rd2] KONRAD-Gate deckt die gemessene Kette (4:57 + 17 s + 4 s) mit Reserve',
    KONRAD_CDN_GATE_MS >= (297 + 17 + 4) * 1000, `${KONRAD_CDN_GATE_MS} ms`);
  add('[rd2] KONRAD-CDN-URL hat die Spiegel-Form',
    konradCdnUrl(g[0]) === `${RADAR_CDN_BASE}/konrad3d/KONRAD3D_${g[0]}.xml`);
  // Frische-Fenster: bei Slot + 5:00 hat der DWD den Lauf schon, das Gate noch nicht ⇒
  // die beiden Räte unterscheiden sich ⇒ der Listing-Weg übernimmt (wie vor RD2).
  const slot = Date.UTC(2026, 7, 29, 14, 0, 0);
  add('[rd2] im Frische-Fenster (Slot + 5:00) weichen die Räte ab → Listing-Weg',
    guessKonradStamps(1, slot + 5 * MIN, KONRAD_PUBLISH_LAG_MIN * MIN)[0] !== guessKonradStamps(1, slot + 5 * MIN)[0]);
  add('[rd2] nach dem Gate (Slot + 5:40) sind die Räte gleich → CDN-Weg',
    guessKonradStamps(1, slot + 340_000, KONRAD_PUBLISH_LAG_MIN * MIN)[0] === guessKonradStamps(1, slot + 340_000)[0]);
}

// Live-Zeilen: liegt der jüngste GEGATTETE Lauf wirklich auf dem CDN?
// (Fragt nur Slots an, die das Gate passiert haben — kein 404-Vergiften.)
try {
  const now = Date.now();
  const rvTs = guessRvRuns(3, now).find((s) => rvCdnEligible(s, now));
  const r1 = await fetch(rvTarCdnUrl(rvTs), { method: 'HEAD', signal: AbortSignal.timeout(20_000) });
  add('[rd2/live] jüngster gegatteter RV-Lauf liegt auf dem CDN', r1.ok, `${rvTs} → HTTP ${r1.status}`);
  const koStamp = guessKonradStamps(1, now)[0];
  const r2 = await fetch(konradCdnUrl(koStamp), { method: 'HEAD', signal: AbortSignal.timeout(20_000) });
  add('[rd2/live] jüngster gegatteter KONRAD-Lauf liegt auf dem CDN', r2.ok, `${koStamp} → HTTP ${r2.status}`);
} catch {
  skip('[rd2/live] CDN-Erreichbarkeit', 'cdn.jsdelivr.net nicht erreichbar');
}

// ---------------------------------------------------------------------------

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) {
  if (!c.ok) console.log(`  ✗ ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
}
for (const s of skipped) console.log(`  ⊘ ${s.name} — ${s.why}`);
console.log(`\nverify:radar-runs — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
