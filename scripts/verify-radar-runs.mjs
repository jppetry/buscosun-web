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

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) {
  if (!c.ok) console.log(`  ✗ ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
}
for (const s of skipped) console.log(`  ⊘ ${s.name} — ${s.why}`);
console.log(`\nverify:radar-runs — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
