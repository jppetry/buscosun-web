/**
 * verify:sounding-guard — Phase SG (audit/atmo-sounding-guard.md): das Vertikal-Sounding (Atmosphäre-Emagramm,
 * 3D-Sounding-Panel) bricht nicht, wenn der DWD am 30.11.2026 den alten ICON-EU-Baum abschaltet.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sounding-guard.mjs
 *
 * Gestellt wird nur `fetch` (und die Uhr über `nowMs`); gerechnet wird mit dem echten App-Code
 * (`sources/sounding.ts`, `sources/iconEuSounding.ts`, `sources/gfsSounding.ts`). Wo eine Quelle ein Profil LIEFERN
 * soll, steht statt der ~40 bz2-GRIB-Dateien eine Fixture in der echten `SoundingProfile`-Form (Seam `opts.sources`).
 *
 *   1  alter Baum 404 ⇒ GFS, `source: 'gfs'`, Rückfall-Notiz; 8 HEAD-Proben, kein GET
 *   2  Abbruch während der ICON-EU-Probe ⇒ `AbortError`, GFS nie gerufen, kein Memo
 *   3  Gegenprobe: ICON-EU da ⇒ ICON-EU, GFS nie gerufen, keine Notiz
 *   3b Lauf da, Dateien am Schritt fehlen ⇒ GFS (kein Memo: nächster Aufruf probt wieder)
 *   4  ab dem Stichtag ⇒ null Anfragen an den alten Baum; Stichtag = Terminregister `SCHEDULED_CHANGES`
 *   5  beide weg ⇒ EIN Fehler, der beide nennt
 *   6  `validAt` trifft die gewünschte Zielzeit (Scrubber-Stunde = jetzt + h) für beide Quellen
 *   7  Memo: zweiter Aufruf binnen 30 min macht nach „kein Lauf" keine ICON-EU-Anfrage
 *   8  Schalter `?snd=gfs` / `?snd=icon-eu`
 */

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

const OLD_TREE = '/_dwd_opendata/weather/nwp/icon-eu/grib/';
const GFS_BUCKET = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com';
const H = 3_600_000;

// ── gestelltes fetch ─────────────────────────────────────────────────────────
let rules = [];
let log = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const url = String(input);
  const rec = { url, method: init.method ?? 'GET', aborted: false };
  log.push(rec);
  const rule = rules.find(([m]) => (typeof m === 'string' ? url.startsWith(m) : m.test(url)));
  const b = rule ? (typeof rule[1] === 'function' ? rule[1](url, init) : rule[1]) : { status: 404 };
  return new Promise((resolve, reject) => {
    const sig = init.signal;
    const onAbort = () => { rec.aborted = true; reject(sig.reason ?? new DOMException('Aborted', 'AbortError')); };
    if (sig) { if (sig.aborted) return onAbort(); sig.addEventListener('abort', onAbort, { once: true }); }
    if (b.hang) return;
    if (b.netError) return setTimeout(() => reject(new TypeError('Failed to fetch')), b.delayMs ?? 0);
    setTimeout(() => resolve(new Response(b.body ?? null, { status: b.status ?? 200 })), b.delayMs ?? 0);
  });
};
const reset = () => { rules = []; log = []; };
const reqs = (pat) => log.filter((r) => (typeof pat === 'string' ? r.url.startsWith(pat) : pat.test(r.url)));

// ── Fixture in echter SoundingProfile-Form ───────────────────────────────────
const fixture = (runAt, validAt) => ({
  lat: 47.2692, lon: 11.4041, runAt, validAt, surfaceM: 574, surfacePressureHpa: 945,
  levels: [
    { pressureHpa: 945, heightM: 574, tempC: 12.0, dewC: 6.0, windU: 1.0, windV: 2.0 },
    { pressureHpa: 850, heightM: 1480, tempC: 6.5, dewC: 1.0, windU: 3.0, windV: 5.0 },
    { pressureHpa: 700, heightM: 3010, tempC: -3.0, dewC: -9.0, windU: 6.0, windV: 9.0 },
    { pressureHpa: 500, heightM: 5620, tempC: -18.0, dewC: -30.0, windU: 10.0, windV: 15.0 },
  ],
});
/** Gestellte Quelle: zählt Aufrufe, liefert eine Fixture, die wie die echte Quelle `validAtMs` übernimmt. */
const stub = (runAtMs, fail) => {
  const calls = [];
  const fn = async (lat, lon, surfaceM, hour, signal, validAtMs) => {
    calls.push({ lat, lon, surfaceM, hour, validAtMs });
    if (fail) throw fail();
    return fixture(new Date(runAtMs), new Date(validAtMs ?? runAtMs + hour * H));
  };
  fn.calls = calls;
  return fn;
};

let snd = null, eu = null, matrix = null;
try {
  snd = await import('../src/sources/sounding.ts');
  eu = await import('../src/sources/iconEuSounding.ts');
  matrix = await import('../src/point/sourceMatrix.ts');
} catch (err) {
  add('Module laden', false, err?.message ?? String(err));
}

if (snd) {
  const { fetchSoundingWithFallback, resetSoundingGuard, soundingTargetMs, ICON_EU_OLD_TREE_END_MS,
    SOUNDING_FALLBACK_NOTE, SOUNDING_RETIRED_NOTE, SOUNDING_FORCED_GFS_NOTE, SOUNDING_SOURCE_LABEL } = snd;
  const NOW = Date.now();                      // echte Uhr: resolveRun bildet seine Kandidaten aus `new Date()`
  const BEFORE = Math.min(NOW, ICON_EU_OLD_TREE_END_MS - 24 * H);
  const gfsRunMs = Math.floor(NOW / (6 * H)) * 6 * H - 6 * H;

  // ── 1  alter Baum 404 ⇒ GFS ────────────────────────────────────────────────
  reset(); resetSoundingGuard();
  {
    const gfs = stub(gfsRunMs);
    const r = await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, undefined, { nowMs: NOW, sources: { gfs } });
    const heads = reqs(OLD_TREE).filter((q) => q.method === 'HEAD');
    const gets = reqs(OLD_TREE).filter((q) => q.method === 'GET');
    add('1 alter Baum 404 ⇒ source gfs', r.source === 'gfs', r.source);
    add('1 Rückfall-Notiz gesetzt', r.note === SOUNDING_FALLBACK_NOTE, r.note);
    add('1 ICON-EU: 8 HEAD-Proben, kein GET', heads.length === 8 && gets.length === 0, `HEAD ${heads.length}, GET ${gets.length}`);
    add('1 GFS einmal gerufen', gfs.calls.length === 1, String(gfs.calls.length));
    add('1 Profil in SoundingProfile-Form (levels, runAt, validAt)', Array.isArray(r.profile.levels) && r.profile.runAt instanceof Date && r.profile.validAt instanceof Date);

    // ── 7  Memo: direkt danach keine ICON-EU-Anfrage ─────────────────────────
    log = [];
    const r2 = await fetchSoundingWithFallback(47.3, 11.4, 574, 6, undefined, { nowMs: NOW + 5 * 60_000, sources: { gfs } });
    add('7 Memo: 2. Aufruf binnen 30 min ⇒ keine Anfrage an den alten Baum', reqs(OLD_TREE).length === 0 && r2.source === 'gfs', `old-tree ${reqs(OLD_TREE).length}`);
    add('7 Memo: Notiz bleibt sichtbar', r2.note === SOUNDING_FALLBACK_NOTE, r2.note);
    log = [];
    await fetchSoundingWithFallback(47.3, 11.4, 574, 6, undefined, { nowMs: NOW + 31 * 60_000, sources: { gfs } });
    add('7 Memo läuft nach 30 min ab ⇒ ICON-EU wird wieder geprobt', reqs(OLD_TREE).length === 8, `old-tree ${reqs(OLD_TREE).length}`);
  }

  // ── 2  Abbruch während der Probe ⇒ AbortError, kein GFS, kein Memo ─────────
  reset(); resetSoundingGuard();
  {
    rules = [[OLD_TREE, { status: 404, delayMs: 40 }]];
    const gfs = stub(gfsRunMs);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 15);
    let err = null;
    try { await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, ac.signal, { nowMs: NOW, sources: { gfs } }); }
    catch (e) { err = e; }
    add('2 Abbruch ⇒ AbortError weitergeworfen', err?.name === 'AbortError', err?.name ?? 'kein Fehler');
    add('2 Abbruch ⇒ GFS nie gerufen', gfs.calls.length === 0, String(gfs.calls.length));
    add('2 Abbruch ⇒ Probe wurde abgebrochen (≤ 2 HEAD)', reqs(OLD_TREE).length >= 1 && reqs(OLD_TREE).length <= 2, String(reqs(OLD_TREE).length));
    log = []; rules = [];
    await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, undefined, { nowMs: NOW, sources: { gfs } });
    add('2 Abbruch setzt KEIN Memo (nächster Aufruf probt ICON-EU)', reqs(OLD_TREE).length === 8, String(reqs(OLD_TREE).length));
  }

  // ── 3  Gegenprobe: ICON-EU da ⇒ ICON-EU, GFS nie gerufen ───────────────────
  reset(); resetSoundingGuard();
  {
    const euRunMs = Math.floor(NOW / (3 * H)) * 3 * H - 3 * H;
    const iconEu = stub(euRunMs), gfs = stub(gfsRunMs);
    const r = await fetchSoundingWithFallback(47.2692, 11.4041, 574, 12, undefined, { nowMs: NOW, sources: { iconEu, gfs } });
    add('3 Gegenprobe: ICON-EU da ⇒ source icon-eu', r.source === 'icon-eu', r.source);
    add('3 Gegenprobe: GFS nie gerufen', gfs.calls.length === 0 && iconEu.calls.length === 1, `gfs ${gfs.calls.length}, eu ${iconEu.calls.length}`);
    add('3 Gegenprobe: keine Notiz', r.note === undefined, String(r.note));
    add('3 Zielzeit an die Quelle gereicht (= jetzt + 12 h, volle Stunde)', iconEu.calls[0].validAtMs === soundingTargetMs(NOW, 12));
  }

  // ── 3b  Lauf da, Dateien fehlen ⇒ GFS, aber KEIN Memo ─────────────────────
  reset(); resetSoundingGuard();
  {
    rules = [[/icon-eu\/grib\/\d\d\/t\/.*_000_500_T\.grib2\.bz2$/, (url, init) => (init.method === 'HEAD' ? { status: 200 } : { status: 404 })]];
    const gfs = stub(gfsRunMs);
    const r = await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, undefined, { nowMs: NOW, sources: { gfs } });
    const gets = reqs(OLD_TREE).filter((q) => q.method === 'GET');
    add('3b Lauf gefunden, Dateien 404 ⇒ GFS mit Notiz', r.source === 'gfs' && r.note === SOUNDING_FALLBACK_NOTE, `${r.source} / ${r.note}`);
    add('3b GET-Anfragen an den alten Baum gingen raus (Lauf war da)', gets.length > 0, String(gets.length));
    log = [];
    await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, undefined, { nowMs: NOW + 60_000, sources: { gfs } });
    add('3b „zu wenige Niveaus" setzt KEIN Memo (nächster Aufruf fragt ICON-EU wieder)', reqs(OLD_TREE).length > 0, String(reqs(OLD_TREE).length));
  }

  // ── 4  ab dem Stichtag ⇒ null Anfragen an den alten Baum ───────────────────
  reset(); resetSoundingGuard();
  {
    const gfs = stub(gfsRunMs);
    const at = ICON_EU_OLD_TREE_END_MS;
    const r = await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, undefined, { nowMs: at, sources: { gfs } });
    add('4 Stichtag 00:00Z ⇒ GFS direkt, null Anfragen an den alten Baum', r.source === 'gfs' && reqs(OLD_TREE).length === 0, `${r.source}, old-tree ${reqs(OLD_TREE).length}`);
    add('4 Notiz nennt die Abschaltung', r.note === SOUNDING_RETIRED_NOTE, r.note);
    log = [];
    const r3 = await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, undefined, { nowMs: at + 40 * 24 * H, sources: { gfs } });
    add('4 40 Tage danach ebenso', r3.source === 'gfs' && reqs(OLD_TREE).length === 0);
    // Gegenprobe des Datums-Tors, isoliert vom Lauf-Finder (der rechnet mit der echten Uhr): gestellte ICON-EU-Quelle.
    const iconEu = stub(at - 4 * H);
    const before = await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, undefined, { nowMs: at - 1, sources: { iconEu, gfs } });
    const atCut = await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, undefined, { nowMs: at, sources: { iconEu, gfs } });
    add('4 eine ms davor wird ICON-EU noch gefragt, ab 00:00Z nicht mehr (Gegenprobe des Stichtags)',
      before.source === 'icon-eu' && iconEu.calls.length === 1 && atCut.source === 'gfs' && iconEu.calls.length === 1,
      `davor ${before.source}, danach ${atCut.source}, eu-Aufrufe ${iconEu.calls.length}`);
    const entry = matrix?.SCHEDULED_CHANGES?.find((c) => c.affects?.includes('icon_eu') && /URL-Schema/.test(c.what));
    const onMs = entry ? Date.parse(`${entry.on}T00:00:00Z`) : NaN;
    add('4 Stichtag = Terminregister SCHEDULED_CHANGES (icon_eu, URL-Schema)', onMs === ICON_EU_OLD_TREE_END_MS, `${entry?.on} vs ${new Date(ICON_EU_OLD_TREE_END_MS).toISOString()}`);
    add('4 Stichtag ist 2026-11-30T00:00Z', ICON_EU_OLD_TREE_END_MS === Date.UTC(2026, 10, 30));
  }

  // ── 5  beide weg ⇒ EIN Fehler, der beide nennt ─────────────────────────────
  reset(); resetSoundingGuard();
  {
    const gfs = stub(gfsRunMs, () => new Error('GFS: kein publizierter Lauf erreichbar'));
    let err = null;
    try { await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, undefined, { nowMs: BEFORE, sources: { gfs } }); } catch (e) { err = e; }
    add('5 beide weg ⇒ Fehler', err instanceof Error, String(err));
    add('5 Fehler nennt ICON-EU und GFS', /ICON-EU/.test(err?.message ?? '') && /GFS/.test(err?.message ?? ''), err?.message);
    add('5 Fehler ist kein AbortError', err?.name !== 'AbortError');
    // nach dem Stichtag: ebenfalls beide genannt (ICON-EU als abgeschaltet)
    err = null;
    try { await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, undefined, { nowMs: ICON_EU_OLD_TREE_END_MS + H, sources: { gfs } }); } catch (e) { err = e; }
    add('5 nach dem Stichtag: Fehler nennt beide (ICON-EU abgeschaltet, GFS-Grund)', /ICON-EU/.test(err?.message ?? '') && /abgeschaltet/.test(err?.message ?? '') && /GFS/.test(err?.message ?? ''), err?.message);
  }

  // ── 6  validAt trifft die Zielzeit ─────────────────────────────────────────
  // ICON-EU (echtes Modul): HEAD 200 für jeden Lauf, GET 404 — die GET-URLs tragen Lauf und Schritt.
  reset(); resetSoundingGuard();
  {
    rules = [[/icon-eu\/grib\/.*\.grib2\.bz2$/, (url, init) => (init.method === 'HEAD' ? { status: 200 } : { status: 404 })]];
    const parse = (u) => {
      const m = /_(\d{10})_(\d{3})_/.exec(u);
      if (!m) return null;
      const run = m[1];
      const runMs = Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10));
      return { runMs, step: +m[2], hour: +run.slice(8, 10) };
    };
    for (const hour of [0, 24, 48]) {
      const target = soundingTargetMs(NOW, hour);
      log = [];
      try { await eu.fetchSoundingAtPoint(47.2692, 11.4041, 574, hour, undefined, target); } catch { /* zu wenige Niveaus — erwartet */ }
      const gets = reqs(OLD_TREE).filter((q) => q.method === 'GET').map((q) => parse(q.url)).filter(Boolean);
      const steps = new Set(gets.map((g) => g.step));
      const g0 = gets[0];
      const validMs = g0 ? g0.runMs + g0.step * H : NaN;
      const hourly = g0 ? (g0.hour % 6 === 0 ? 78 : 30) : 0;
      const tol = g0 && g0.step > hourly ? 1.5 * H : 0;   // oberhalb des stündlichen Rasters auf 3 h gerundet
      add(`6 ICON-EU +${hour} h: ein Schritt je Abruf, validAt = Zielzeit (±Raster)`,
        gets.length > 0 && steps.size === 1 && Math.abs(validMs - target) <= tol,
        g0 ? `run ${new Date(g0.runMs).toISOString()} step ${g0.step} → ${new Date(validMs).toISOString()} vs ${new Date(target).toISOString()}` : 'keine GET-URL');
      add(`6 ICON-EU +${hour} h: Lauf erreicht die Zielzeit (kein Zwischenlauf jenseits +48)`,
        !!g0 && (g0.hour % 6 === 0 || (target - g0.runMs) / H <= 48 + 1.5), g0 ? `Laufstunde ${g0.hour}Z, Vorlauf ${((target - g0.runMs) / H).toFixed(1)} h` : '');
    }
    // alte Signatur ohne Zielzeit: Schritt = Lead ab Laufbeginn (unverändertes Verhalten)
    log = [];
    try { await eu.fetchSoundingAtPoint(47.2692, 11.4041, 574, 6); } catch { /* erwartet */ }
    const g = reqs(OLD_TREE).filter((q) => q.method === 'GET').map((q) => parse(q.url)).filter(Boolean)[0];
    add('6 ICON-EU alte Signatur (ohne Zielzeit): Schritt = leadHours', !!g && g.step === 6, g ? String(g.step) : 'keine GET-URL');
  }
  // GFS (echtes Modul): Bucket-Listing + idx gestellt — die erste Feld-URL trägt f### .
  reset();
  {
    const gfsSrc = await import('../src/sources/gfsSounding.ts');
    const day = new Date(gfsRunMs);
    const yyyymmdd = `${day.getUTCFullYear()}${String(day.getUTCMonth() + 1).padStart(2, '0')}${String(day.getUTCDate()).padStart(2, '0')}`;
    const hh = String(day.getUTCHours()).padStart(2, '0');
    rules = [
      [/\?list-type=2/, { status: 200, body: `<ListBucketResult><CommonPrefixes><Prefix>gfs.${yyyymmdd}/</Prefix></CommonPrefixes></ListBucketResult>` }],
      [new RegExp(`gfs\\.${yyyymmdd}/${hh}/atmos/gfs\\.t${hh}z\\.pgrb2\\.1p00\\.f000\\.idx$`), { status: 206, body: '1:0:d=2026101912:PRES:surface:anl:' }],
    ];
    for (const hour of [0, 24, 48]) {
      const target = soundingTargetMs(NOW, hour);
      log = [];
      try { await gfsSrc.fetchSoundingAtPoint(47.2692, 11.4041, 574, hour, undefined, target); } catch { /* Felder 404 — erwartet */ }
      const fh = [...new Set(reqs(GFS_BUCKET).map((q) => /\.f(\d{3})(?:\.idx)?$/.exec(q.url)?.[1]).filter(Boolean).map(Number))].filter((f) => f !== 0 || hour === 0);
      // pgrb2.1p00 liegt 3-stündlich (Bucket 19.10.2026): Vorlauf auf 3 h gerundet, |validAt − Ziel| ≤ 1,5 h.
      const lead = (target - gfsRunMs) / H;
      const want = Math.round(lead / 3) * 3;
      add(`6 GFS +${hour} h: Vorlauf f${String(want).padStart(3, '0')} = Zielzeit − Laufbeginn auf dem 3-h-Raster (±1,5 h)`,
        fh.includes(want) && fh.every((f) => f % 3 === 0) && Math.abs(want - lead) <= 1.5,
        `angefragt f${fh.join(',f')}, Lauf ${new Date(gfsRunMs).toISOString()}, Vorlauf ${lead.toFixed(1)} h`);
    }
  }

  // ── 8  Schalter ────────────────────────────────────────────────────────────
  reset(); resetSoundingGuard();
  {
    const iconEu = stub(NOW - 3 * H), gfs = stub(gfsRunMs);
    const r = await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, undefined, { nowMs: BEFORE, search: '?snd=gfs', sources: { iconEu, gfs } });
    add('8 ?snd=gfs ⇒ GFS, ICON-EU nie gerufen, Notiz nennt den Schalter', r.source === 'gfs' && iconEu.calls.length === 0 && r.note === SOUNDING_FORCED_GFS_NOTE, `${r.source}, eu ${iconEu.calls.length}, ${r.note}`);
    let err = null;
    try { await fetchSoundingWithFallback(47.2692, 11.4041, 574, 0, undefined, { nowMs: BEFORE, search: '?snd=icon-eu', sources: { gfs } }); } catch (e) { err = e; }
    add('8 ?snd=icon-eu bei 404 ⇒ kein Rückfall, ICON-EU-Fehler, GFS nie gerufen', err instanceof eu.SoundingUnavailableError && gfs.calls.length === 1, `${err?.name}, gfs ${gfs.calls.length}`);
    add('8 ohne Schalter: Regelpfad (soundingSourceOverride)', snd.soundingSourceOverride('?x=1') === null && snd.soundingSourceOverride('?snd=gfs') === 'gfs' && snd.soundingSourceOverride('?snd=icon-eu') === 'icon-eu' && snd.soundingSourceOverride('?snd=foo') === null);
  }

  // ── Beschriftung: je Quelle eine, kein ICON-EU-Text auf GFS ────────────────
  add('Beschriftung: GFS nennt GFS, nie ICON-EU', /GFS/.test(SOUNDING_SOURCE_LABEL.gfs.short) && !/ICON/.test(SOUNDING_SOURCE_LABEL.gfs.short + SOUNDING_SOURCE_LABEL.gfs.caveat + SOUNDING_SOURCE_LABEL.gfs.attribution));
  add('Beschriftung: ICON-EU nennt ICON-EU', /ICON-EU/.test(SOUNDING_SOURCE_LABEL['icon-eu'].short) && /ICON-EU/.test(SOUNDING_SOURCE_LABEL['icon-eu'].attribution));
  add('Beschriftung: GFS-Richtwert „~25 km, Standard-Druckflächen"', /~25 km, Standard-Druckflächen/.test(SOUNDING_SOURCE_LABEL.gfs.caveat));
  add('Zielzeit: volle Stunde nächst jetzt + h', soundingTargetMs(Date.UTC(2026, 9, 19, 18, 54), 0) === Date.UTC(2026, 9, 19, 19) && soundingTargetMs(Date.UTC(2026, 9, 19, 18, 20), 24) === Date.UTC(2026, 9, 20, 18));
}

globalThis.fetch = realFetch;

// ── Ausgabe ──────────────────────────────────────────────────────────────────
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\nverify:sounding-guard: ${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
