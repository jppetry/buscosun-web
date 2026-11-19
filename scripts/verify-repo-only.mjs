/**
 * verify:repo-only — Phase RN-3 und RN-4 (audit/radar-nur-datenrepo.md §9, §10; E-RN-6, E-RN-7, Jan 18.11.2026):
 * die ICON-D2-Layer mit Bildern im Daten-Repo (Wind, Temperatur, Böen, Gewitter, Rotation, Blitzprognose, Schnee) und die
 * Zellbahnen (KONRAD3D) kommen nur noch aus dem Daten-Repo. Ein Fehlschlag wird wiederholt und landet nie beim DWD.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-repo-only.mjs
 *
 * Gestellt werden `fetch`, ein Browser-Fenster (der Repo-Weg ist nur mit `window` an) und Bild-Dekoder/Canvas (die es in Node
 * nicht gibt — geprüft wird der Transport; die Byte-Gleichheit der Bilder prüft `verify:repack`). Das Fixture der ICON-D2-Teile
 * ist der ECHTE Index des Daten-Repos, einmal über raw geholt — ohne Netz schlägt D0 laut fehl. Jede „0 Abrufe beim DWD"
 * hat eine Gegenprobe mit dem alten Weg (`?d2dwd=1`, `?konraddwd=1`), die DWD-Abrufe unter demselben Muster zeigt.
 *
 *   D0  Fixture, Schalter
 *   D1  je Layer: Normalfall (Index + Bilder vom CDN), jsDelivr tot (alles über raw)
 *   D2  ein Bild scheitert auf beiden Hosts und kommt in der zweiten Runde; die echte Pause wird gemessen
 *   D3  je Layer: beide Hosts tot ⇒ drei Versuche, `IconD2NotInRepo`, 0 DWD — Gegenprobe `?d2dwd=1`
 *   D4  Temperatur: Orographie tot ⇒ wiederholt, benannter Fehler statt `hsurf` als GRIB — Gegenprobe
 *   D5  Wind: Lauf deckt „jetzt" nicht mehr ⇒ benannter Fehler ohne Wiederholung, kein „Notweg"
 *   D6  `resolveLatestRun`: mit Familie nie zum DWD, ohne Familie (Wolken …) wie bisher
 *   K0–K9  KONRAD3D
 */
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

const RS = await import('../src/sources/repackSource.ts');
const R = await import('../src/sources/iconD2Repo.ts');
const P = await import('../src/sources/iconD2Precip.ts');
const GUST = await import('../src/sources/iconD2GustSource.ts');
const THUNDER = await import('../src/sources/iconD2Thunder.ts');
const ROT = await import('../src/sources/iconD2Rotation.ts');
const LPI = await import('../src/sources/iconD2Lpi.ts');
const SNOW = await import('../src/sources/iconD2Snow.ts');
const TEMP = await import('../src/sources/iconD2TempSource.ts');
const WIND = await import('../src/wind/iconD2WindSource.ts');
const K = await import('../src/sources/dwdKonrad3d.ts');
const RUNS = await import('../src/sources/radolanRuns.ts');
const IMG = await import('../src/sources/radarImg.ts');

const CDN_HOST = 'https://cdn.jsdelivr.net/';
const RAW_HOST = 'https://raw.githubusercontent.com/';
const DWD = /^\/_dwd_(opendata|grib|wind)\//;
const realFetch = globalThis.fetch;
const realNow = Date.now;
const realSetTimeout = globalThis.setTimeout;

// ── Fixture: der echte Index ─────────────────────────────────────────────────
let index = null;
try {
  const res = await realFetch(`${RS.DATA_RAW_BASE}/main/index.json`, { signal: AbortSignal.timeout(20_000) });
  if (res.ok) index = await res.json();
} catch { /* D0 meldet es */ }
const FAMS = ['wind', 'temp', 'gust', 'thunder', 'rotation', 'lightningfc', 'snowDepth', 'snowFresh'];
const runOf = Object.fromEntries(FAMS.map((f) => [f, index ? RS.newestRunFromIndex(index, f) : null]));
add('D0 Fixture: echter Index des Daten-Repos gelesen, er führt für jede der acht Familien einen Lauf',
  !!index && FAMS.every((f) => !!runOf[f]), index ? FAMS.map((f) => `${f}:${runOf[f]?.steps.length ?? '—'}`).join(' ') : 'kein Index (Netz?)');

add('D0 Schalter `d2dwd`: Voreinstellung aus, Query schlägt Speicher; `precipdwd` rechnet mit derselben Regel',
  R.D2_DWD_DEFAULT === false && R.dwdFlagFrom('d2dwd', '', null) === false && R.dwdFlagFrom('d2dwd', '?d2dwd=1', null) === true
  && R.dwdFlagFrom('d2dwd', '', '1') === true && R.dwdFlagFrom('d2dwd', '?d2dwd=0', '1') === false && R.dwdFlagFrom('d2dwd', '?precipdwd=1', null) === false
  && P.precipDwdFlagFrom('?precipdwd=1', null) === true && P.precipDwdFlagFrom('?d2dwd=1', null) === false);
add('D0 ohne `window` (Node, Verifier) gilt der alte Weg — die übrigen Prüfer rechnen wie bisher', R.d2DwdDirect() === true && P.precipDwdDirect() === true);
add('D0 EINE Fehlerklasse für alle Leser (die Karte fragt mit `instanceof`)', P.IconD2NotInRepo === R.IconD2NotInRepo);

// ── gestellte Welt ───────────────────────────────────────────────────────────
let calls = [];
let rule = () => ({ status: 404 });
const hang = (init) => new Promise((_, reject) => {
  const s = init?.signal;
  if (!s) return;
  if (s.aborted) return reject(s.reason);
  s.addEventListener('abort', () => reject(s.reason), { once: true });
});
const stubFetch = (input, init) => {
  const url = String(input);
  calls.push(url);
  const b = rule(url, calls.filter((u) => u === url).length);
  if (b.hang) return hang(init);
  if (b.json !== undefined) return Promise.resolve(new Response(JSON.stringify(b.json), { status: 200 }));
  if (b.text !== undefined) return Promise.resolve(new Response(b.text, { status: 200 }));
  if (b.bytes) return Promise.resolve(new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 }));
  return Promise.resolve(new Response(null, { status: b.status ?? 404 }));
};
/** Bild-Dekoder und Canvas in den Maßen des Abschnitts (Transport-Prüfung; Werte sind hier nicht Gegenstand). */
const stubDom = (w, h) => {
  globalThis.createImageBitmap = async () => ({ width: w, height: h, close() {} });
  globalThis.ImageData = class { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage() {}, putImageData() {}, getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }) }),
    }),
  };
};
const KEYS = ['window', 'document', 'createImageBitmap', 'ImageData', 'location'];
const withWorld = async (search, fn, { fast = false } = {}) => {
  const had = Object.fromEntries(KEYS.map((k) => [k, [k in globalThis, globalThis[k]]]));
  globalThis.window = { location: { search }, localStorage: null };
  globalThis.location = { search };
  globalThis.fetch = stubFetch;
  // `fast`: die Pausen der Wiederholung (3 s, 8 s) und Fristen laufen 200-fach schneller — für die Fälle, in denen nur die
  // Folge der Abrufe zählt. Die echte Pause misst D2.
  if (fast) globalThis.setTimeout = (cb, ms, ...a) => realSetTimeout(cb, ms >= 1000 ? ms / 200 : ms, ...a);
  calls = []; RS.resetRepackState(); RS.resetRepackIndexCache(); RS.resetRepackHsurfCache(); K._resetKonrad3d(); RUNS._resetRadarCdn(); IMG._resetRadarRaw();
  try { return await fn(); } finally {
    for (const k of KEYS) { if (had[k][0]) globalThis[k] = had[k][1]; else delete globalThis[k]; }
    globalThis.fetch = realFetch; Date.now = realNow; globalThis.setTimeout = realSetTimeout;
    RS.resetRepackState(); RS.resetRepackIndexCache(); K._resetKonrad3d(); RUNS._resetRadarCdn(); IMG._resetRadarRaw();
  }
};
const isIndex = (u) => u === RS.REPACK_INDEX_CDN_URL;
const isRawIndex = (u) => u === `${RS.DATA_RAW_BASE}/main/index.json`;
const isPng = (u) => /\.png$/.test(u);
const dwdCalls = () => calls.filter((u) => DWD.test(u));
const elapsed = async (p) => { const s = performance.now(); try { return { v: await p, ms: Math.round(performance.now() - s) }; } catch (e) { return { e, ms: Math.round(performance.now() - s) }; } };
const info = [];
const realInfo = console.info;
const quiet = async (fn) => { console.info = (...a) => info.push(a.join(' ')); try { return await fn(); } finally { console.info = realInfo; } };

if (index && FAMS.every((f) => !!runOf[f])) {
  const now0 = { nowOnly: true, aheadHours: 0 };
  /** Die Leser, je mit dem Muster ihrer Bilddatei und dem Param, den der alte Weg beim DWD listet. */
  const LAYERS = [
    { key: 'Böen', fam: 'gust', file: /\/gust-\d+\.png$/, dwd: /vmax_10m/, load: (s) => GUST.fetchIconD2Gust(s, undefined, now0) },
    { key: 'Gewitterpotenzial', fam: 'thunder', file: /\/thunder-\d+\.png$/, dwd: /cape_ml/, load: (s) => THUNDER.fetchIconD2Thunder(s, undefined, now0) },
    { key: 'Rotationspotenzial', fam: 'rotation', file: /\/rotation-\d+\.png$/, dwd: /uh_max/, load: (s) => ROT.fetchIconD2Rotation(s, undefined, now0) },
    { key: 'Blitz-Vorhersage', fam: 'lightningfc', file: /\/lpi-\d+\.png$|\/lightningfc-\d+\.png$/, dwd: /lpi_max/, load: (s) => LPI.fetchIconD2Lpi(s, undefined, now0) },
    { key: 'Schneedecke', fam: 'snowDepth', file: /\/snowdepth-\d+\.png$/, dwd: /h_snow/, load: (s) => SNOW.fetchIconD2Snow('depth', s, undefined, now0) },
    { key: 'Neuschnee', fam: 'snowFresh', file: /\/snowfresh-\d+\.png$/, dwd: /snow_gsp/, load: (s) => SNOW.fetchIconD2Snow('fresh', s, undefined, now0) },
    { key: 'Temperatur', fam: 'temp', file: /\/temp-\d+\.png$|\/hsurf-v1\.png$/, dwd: /t_2m/, load: (s) => TEMP.fetchIconD2Temp(s, undefined, now0) },
    { key: 'Wind', fam: 'wind', file: /\/wind-\d+\.png$/, dwd: /u_10m|v_10m/, load: (s) => WIND.fetchIconD2Wind(s, undefined, undefined, now0) },
  ];
  const grid = index.runs.find((r) => r.run === runOf.gust.runStr).grid;
  const nameOk = LAYERS.every((L) => {
    const sec = RS.parseRepackSection(RS.sectionFromIndex(index, runOf[L.fam].runStr, L.fam), L.fam, runOf[L.fam].runStr);
    return !!sec && sec[L.fam].steps.every((s) => L.file.test(`/${s.file}`));
  });
  add('D0 Fixture: jede Familie besteht die Abschnitts-Prüfung des Clients, die Dateinamen passen zu den Mustern dieses Prüfers', nameOk);

  // ── D1: je Layer Normalfall und „jsDelivr tot" ─────────────────────────────
  for (const L of LAYERS) {
    await withWorld('', async () => {
      stubDom(grid.width, grid.height);
      rule = (u) => (isIndex(u) ? { json: index } : u.startsWith(CDN_HOST) && isPng(u) ? { bytes: true } : { status: 404 });
      const r = await elapsed(quiet(() => L.load()));
      add(`D1 ${L.key}: Lauf aus dem Index, Bilder vom CDN — 0 Abrufe beim DWD, 0 auf raw`,
        R.d2DwdDirect() === false && !!r.v && r.v.frames.length >= 1 && r.v.runAt.getTime() === runOf[L.fam].runAt.getTime()
        && calls.some((u) => L.file.test(u)) && dwdCalls().length === 0 && !calls.some((u) => u.startsWith(RAW_HOST)),
        r.v ? `${r.v.frames.length} Frame(s), ${calls.filter((u) => u.startsWith(CDN_HOST)).length} Abrufe am CDN` : String(r.e?.message));
    });
    await withWorld('', async () => {
      stubDom(grid.width, grid.height);
      rule = (u) => (u.startsWith(CDN_HOST) ? { status: 503 } : isRawIndex(u) ? { json: index } : u.startsWith(RAW_HOST) && isPng(u) ? { bytes: true } : { status: 404 });
      const r = await elapsed(quiet(() => L.load()));
      add(`D1 ${L.key}: jsDelivr ganz tot (503) ⇒ Index und Bilder über raw, 0 Abrufe beim DWD, ohne Wartepause`,
        !!r.v && r.v.frames.length >= 1 && calls.some(isRawIndex) && calls.some((u) => u.startsWith(RAW_HOST) && L.file.test(u)) && dwdCalls().length === 0 && r.ms < 2500,
        r.v ? `${r.v.frames.length} Frame(s), ${r.ms} ms` : String(r.e?.message));
    });
  }

  // ── D2: ein Bild scheitert auf beiden Hosts, kommt in der zweiten Runde ─────
  await withWorld('', async () => {
    stubDom(grid.width, grid.height);
    info.length = 0;
    let victim = null;
    rule = (u, nth) => {
      if (isIndex(u)) return { json: index };
      if (!isPng(u)) return { status: 404 };
      if (!victim && u.startsWith(CDN_HOST) && /\/gust-\d+\.png$/.test(u)) victim = u.slice(u.lastIndexOf('/'));
      if (victim && u.endsWith(victim) && nth === 1) return { status: 503 };   // erster Abruf je Host scheitert
      return { bytes: true };
    };
    const r = await elapsed(quiet(() => GUST.fetchIconD2Gust(undefined, undefined, { nowOnly: true, aheadHours: 2 })));
    const want = r.v ? r.v.frames.length : 0;
    const victimCalls = calls.filter((u) => victim && u.endsWith(victim));
    add('D2 Böen: ein Bild 503 auf jsDelivr UND raw ⇒ nach der Pause (3 s) noch einmal, dann vollständig — vorher: dieser und alle weiteren Schritte als GRIB',
      !!r.v && want >= 3 && victimCalls.length === 3 && victimCalls[0].startsWith(CDN_HOST) && victimCalls[1].startsWith(RAW_HOST) && victimCalls[2].startsWith(CDN_HOST)
      && r.ms >= R.D2_REPO_RETRY_MS[0] - 300 && r.ms < R.D2_REPO_RETRY_MS[0] + 3000 && dwdCalls().length === 0 && info.some((l) => /Böen: 1 Bild\(er\) nicht geladen/.test(l)),
      r.v ? `${want} Frames, ${r.ms} ms, Abrufe des Bilds: ${victimCalls.length}` : String(r.e?.message));
  });

  // ── D3: beide Hosts tot — je Layer, mit Gegenprobe ──────────────────────────
  for (const L of LAYERS) {
    await withWorld('', async () => {
      stubDom(grid.width, grid.height);
      rule = () => ({ status: 503 });
      const r = await elapsed(quiet(() => L.load()));
      const rounds = calls.filter(isIndex).length;
      add(`D3 ${L.key}: beide Hosts tot ⇒ ${R.D2_REPO_TRIES} Versuche, dann IconD2NotInRepo — 0 Abrufe beim DWD (kein Listing, kein GRIB)`,
        r.e instanceof R.IconD2NotInRepo && rounds === R.D2_REPO_TRIES && R.D2_REPO_TRIES === 3 && dwdCalls().length === 0
        && calls.every((u) => u.startsWith(CDN_HOST) || u.startsWith(RAW_HOST)),
        `${r.e?.constructor?.name}: ${rounds} Index-Runden, ${calls.length} Abrufe`);
    }, { fast: true });
    await withWorld('?d2dwd=1', async () => {
      stubDom(grid.width, grid.height);
      rule = () => ({ status: 503 });
      const r = await elapsed(quiet(() => L.load()));
      const dwd = dwdCalls();
      add(`D3 ${L.key} Gegenprobe \`?d2dwd=1\`: derselbe Ausfall geht wie früher zum DWD — das Muster der „0 Abrufe" trifft also`,
        R.d2DwdDirect() === true && dwd.some((u) => L.dwd.test(u)) && !(r.e instanceof R.IconD2NotInRepo),
        `${dwd.length} Abrufe beim DWD, z. B. ${dwd.find((u) => L.dwd.test(u)) ?? '—'}`);
    }, { fast: true });
  }
  {
    const t = R.D2_REPO_RETRY_MS.reduce((a, b) => a + b, 0);
    add('D3 Pausen zwischen den Versuchen: 3 s und 8 s (gesetzt), zusammen 11 s bis zum benannten Fehler', R.D2_REPO_RETRY_MS.join(',') === '3000,8000' && t === 11_000);
  }

  // ── D4: Temperatur — Orographie ─────────────────────────────────────────────
  const isHsurf = (u) => /\/hsurf-v1\.png$/.test(u);
  await withWorld('', async () => {
    stubDom(grid.width, grid.height);
    rule = (u) => (isIndex(u) ? { json: index } : isHsurf(u) ? { status: 503 } : isPng(u) ? { bytes: true } : { status: 404 });
    const r = await elapsed(quiet(() => TEMP.fetchIconD2Temp(undefined, undefined, now0)));
    const tries = calls.filter((u) => isHsurf(u) && u.startsWith(CDN_HOST)).length;
    add('D4 Temperatur: Orographie auf beiden Hosts tot ⇒ dreimal gefragt, dann IconD2NotInRepo — kein `hsurf` als GRIB, kein Bild ohne Höhenkorrektur',
      r.e instanceof R.IconD2NotInRepo && /Orographie/.test(r.e.message) && tries === 3 && dwdCalls().length === 0 && !calls.some((u) => /\/temp-\d+\.png$/.test(u)),
      `${r.e?.message} · ${tries} Versuche`);
  }, { fast: true });
  await withWorld('?d2dwd=1', async () => {
    stubDom(grid.width, grid.height);
    rule = (u) => (isIndex(u) ? { json: index } : isHsurf(u) ? { status: 503 } : isPng(u) ? { bytes: true } : { status: 404 });
    await elapsed(quiet(() => TEMP.fetchIconD2Temp(undefined, undefined, now0)));
    const dwd = dwdCalls();
    add('D4 Gegenprobe `?d2dwd=1`: dieselbe Lage holt `hsurf` als GRIB beim DWD', dwd.some((u) => /hsurf/.test(u)), `${dwd.length} Abrufe, z. B. ${dwd.find((u) => /hsurf/.test(u)) ?? '—'}`);
  }, { fast: true });

  // ── D5: Wind — Lauf deckt „jetzt" nicht mehr ───────────────────────────────
  {
    const src = index.runs.find((r) => r.run === runOf.wind.runStr);
    const oldAt = new Date(Math.floor((realNow() - 14 * 3_600_000) / (3 * 3_600_000)) * 3 * 3_600_000);
    const p2 = (n) => String(n).padStart(2, '0');
    const oldRun = `${oldAt.getUTCFullYear()}${p2(oldAt.getUTCMonth() + 1)}${p2(oldAt.getUTCDate())}${p2(oldAt.getUTCHours())}`;
    const stale = { ...index, runs: [{ ...src, run: oldRun, runAt: oldAt.toISOString(), path: `runs/${oldRun}` }] };
    await withWorld('', async () => {
      stubDom(grid.width, grid.height);
      rule = (u) => (isIndex(u) ? { json: stale } : isPng(u) ? { bytes: true } : { status: 404 });
      const r = await elapsed(quiet(() => WIND.fetchIconD2Wind(undefined, undefined, undefined, now0)));
      add('D5 Wind: der Lauf im Index endet vor „jetzt" (Spiegel steht) ⇒ IconD2NotInRepo sofort, EIN Index-Abruf, kein „Notweg" zum DWD',
        r.e instanceof R.IconD2NotInRepo && /deckt/.test(r.e.message) && calls.filter(isIndex).length === 1 && dwdCalls().length === 0 && r.ms < 1500,
        `${r.e?.message} · ${r.ms} ms`);
    });
    await withWorld('?d2dwd=1', async () => {
      stubDom(grid.width, grid.height);
      rule = (u) => (isIndex(u) ? { json: stale } : isPng(u) ? { bytes: true } : { status: 404 });
      await elapsed(quiet(() => WIND.fetchIconD2Wind(undefined, undefined, undefined, now0)));
      const dwd = dwdCalls();
      add('D5 Gegenprobe `?d2dwd=1`: dieselbe Lage nimmt den „Notweg" (Listing `u_10m`)', dwd.some((u) => /u_10m/.test(u)), `${dwd.length} Abrufe beim DWD`);
    }, { fast: true });
  }

  // ── D6: resolveLatestRun ───────────────────────────────────────────────────
  await withWorld('', async () => {
    rule = () => ({ status: 503 });
    const a = await elapsed(P.resolveLatestRun('vmax_10m', undefined, 'gust'));
    const n = dwdCalls().length;
    const b = await elapsed(P.resolveLatestRun('clcl'));
    add('D6 `resolveLatestRun`: MIT Familie ohne Index ⇒ IconD2NotInRepo und 0 DWD (Dashboard-Kasten, 30-min-Auffrischung); OHNE Familie (Wolken) wie bisher das Listing',
      a.e instanceof R.IconD2NotInRepo && n === 0 && dwdCalls().some((u) => /\/clcl\/$/.test(u)) && !(b.e instanceof R.IconD2NotInRepo),
      `mit Familie ${n} DWD-Abrufe, ohne ${dwdCalls().length}`);
  }, { fast: true });
} else {
  add('D1–D6 übersprungen', false, 'ohne Fixture nicht prüfbar');
}

// ═══ KONRAD3D (RN-4) ═════════════════════════════════════════════════════════
{
  const MIN = 60_000;
  const B = Date.UTC(2026, 10, 18, 21, 0, 0);                 // Slot-Grenze
  const stamp = (ms) => K.konradStamp(new Date(ms));
  const cellsUrl = (ms, host = 'cdn') => (host === 'cdn' ? IMG.konradImgUrl(stamp(ms)) : RUNS.radarRawUrl(IMG.konradImgUrl(stamp(ms))));
  const xmlUrl = (ms, host = 'cdn') => (host === 'cdn' ? K.konradCdnUrl(stamp(ms)) : RUNS.radarRawUrl(K.konradCdnUrl(stamp(ms))));
  const cellsJson = (ms) => ({ schema: 1, run: { refMs: ms, file: `KONRAD3D_${stamp(ms)}.xml`, cells: [] } });
  const xml = (ms) => `<konrad3d><head><metadata><reference_time>${new Date(ms).toISOString()}</reference_time></metadata></head><cells></cells></konrad3d>`;
  const at = (p) => { Date.now = () => B + p * 1000; };
  const isKonrad = (u) => /konrad3d/i.test(u);

  add('K0 Schalter `konraddwd`: Voreinstellung aus, Query schlägt Speicher; `radarcdn=0` heißt weiter DWD-Weg',
    K.KONRAD_DWD_DEFAULT === false && K.konradDwdFlagFrom('', null) === false && K.konradDwdFlagFrom('?konraddwd=1', null) === true
    && K.konradDwdFlagFrom('', '1') === true && K.konradDwdFlagFrom('?konraddwd=0', '1') === false);
  await withWorld('?radarcdn=0', async () => { add('K0 `?radarcdn=0` ⇒ der DWD-Weg ist erlaubt', K.konradDwdDirect() === true); });
  add('K0 Stempel → Slot-Zeit, auch aus dem Dateinamen', K.konradStampMs(stamp(B)) === B && K.konradStampMs(`KONRAD3D_${stamp(B - 5 * MIN)}.xml`) === B - 5 * MIN && Number.isNaN(K.konradStampMs('x')));
  add('K0 Gate deckt die gemessenen Commit-Zeiten des Spiegels (303–326 s, 18.11.), raw-zuerst-Fenster deckt Commit + 90 s jsDelivr-Verzug',
    K.KONRAD_CDN_GATE_MS >= 326_000 && K.KONRAD_CDN_READY_MS >= 326_000 + 90_000, `${K.KONRAD_CDN_GATE_MS} / ${K.KONRAD_CDN_READY_MS} ms`);

  // K1 — Normalfall, alter und junger Slot
  await withWorld('', async () => {
    at(200);                                                   // jüngster Slot über dem Gate: B−5 min, 500 s alt
    rule = (u) => (u === cellsUrl(B - 5 * MIN) ? { json: cellsJson(B - 5 * MIN) } : { status: 404 });
    const run = await K.fetchKonrad3d();
    add('K1 Slot 500 s alt: `cells.json` vom CDN, EIN Abruf, 0 beim DWD', run.refMs === B - 5 * MIN && calls.length === 1 && calls[0] === cellsUrl(B - 5 * MIN) && dwdCalls().length === 0, calls.join(' '));
  });
  await withWorld('', async () => {
    at(100);                                                   // B−5 min, 400 s alt ⇒ jsDelivr kann ihn noch nicht haben
    rule = (u) => (u === cellsUrl(B - 5 * MIN, 'raw') ? { json: cellsJson(B - 5 * MIN) } : { hang: true });
    const r = await elapsed(K.fetchKonrad3d());
    add('K1 Slot 400 s alt (< 450 s): raw ZUERST — das Bild ist da, bevor jsDelivr `@main` aufgelöst hat',
      r.v?.refMs === B - 5 * MIN && calls[0] === cellsUrl(B - 5 * MIN, 'raw') && r.ms < 1500 && dwdCalls().length === 0, `${r.ms} ms, erster Abruf ${calls[0]}`);
  });

  // K2 — „Frische-Fenster": der DWD hat den Slot, das Gate sperrt ihn noch
  await withWorld('', async () => {
    at(290);
    rule = (u) => (u === cellsUrl(B - 5 * MIN) ? { json: cellsJson(B - 5 * MIN) } : { status: 404 });
    const run = await K.fetchKonrad3d();
    const follow = K.konradFollowUpInMs(run, B + 290_000);
    add('K2 Slot + 290 s (DWD hat ihn, Gate sperrt): der Slot davor aus dem Repo, 0 beim DWD, der neue wird NICHT angefragt; Nachladen in 60 s (Gate + 20 s)',
      run.refMs === B - 5 * MIN && dwdCalls().length === 0 && !calls.some((u) => u.includes(stamp(B))) && follow === 60_000, `Nachladen in ${follow} ms`);
  });
  await withWorld('?konraddwd=1', async () => {
    at(290);
    rule = () => ({ status: 404 });
    await elapsed(K.fetchKonrad3d());
    const dwd = dwdCalls();
    add('K2 Gegenprobe `?konraddwd=1`: im selben Fenster geht der Leser wie früher zum DWD (Listing) — das Muster der „0 Abrufe" trifft also',
      dwd.some((u) => u === '/_dwd_opendata/weather/radar/konrad3d/') && K.konradFollowUpInMs({ file: `KONRAD3D_${stamp(B - 5 * MIN)}.xml` }, B + 290_000) === null, `${dwd.length} Abrufe beim DWD`);
  });

  // K3 — Spiegel hinkt
  await withWorld('', async () => {
    at(40);                                                    // jüngster gegatteter Slot: B−5 min (340 s alt) — fehlt noch
    rule = (u) => (u === cellsUrl(B - 10 * MIN) ? { json: cellsJson(B - 10 * MIN) } : { status: 404 });
    const run = await K.fetchKonrad3d();
    const follow = K.konradFollowUpInMs(run, B + 40_000);
    add('K3 jüngster Slot auf beiden Hosts 404 (Spiegel hinkt) ⇒ der Slot davor, 0 beim DWD; Nachladen in 70 s (hinter den 60 s, die raw ein 404 hält)',
      run.refMs === B - 10 * MIN && dwdCalls().length === 0 && calls.filter((u) => u.includes(stamp(B - 5 * MIN))).length === 2 && follow === 70_000, `${calls.length} Abrufe, Nachladen in ${follow} ms`);
  });

  // K4 — jsDelivr 403 (gemessen 18.11.)
  await withWorld('', async () => {
    at(200);
    rule = (u) => (u === cellsUrl(B - 5 * MIN) ? { status: 403 } : u === cellsUrl(B - 5 * MIN, 'raw') ? { json: cellsJson(B - 5 * MIN) } : { status: 404 });
    const r = await elapsed(K.fetchKonrad3d());
    add('K4 jsDelivr antwortet 403 (gemessen 18.11.) ⇒ dieselbe Datei sofort über raw — vorher: Listing + XML beim DWD',
      r.v?.refMs === B - 5 * MIN && calls.length === 2 && dwdCalls().length === 0 && r.ms < 1500, `${r.ms} ms`);
  });
  // K5 — jsDelivr hängt
  await withWorld('', async () => {
    at(200);
    rule = (u) => (u.startsWith(CDN_HOST) ? { hang: true } : u === cellsUrl(B - 5 * MIN, 'raw') ? { json: cellsJson(B - 5 * MIN) } : { status: 404 });
    const r = await elapsed(K.fetchKonrad3d());
    add('K5 jsDelivr hängt ⇒ raw nach 2,5 s (Hedge), Lauf nach < 4 s, 0 beim DWD', r.v?.refMs === B - 5 * MIN && r.ms >= IMG.RADAR_RAW_HEDGE_MS - 200 && r.ms < 4000 && dwdCalls().length === 0, `${r.ms} ms`);
  });

  // K6 — beide Hosts tot
  await withWorld('', async () => {
    at(200);
    rule = () => ({ status: 503 });
    const r = await elapsed(K.fetchKonrad3d());
    const first = calls.filter((u) => u.includes(stamp(B - 5 * MIN)));
    add('K6 beide Hosts 503 ⇒ derselbe Slot noch einmal (raw zuerst), dann der Slot davor, nach drei Fehlversuchen KonradNotInRepo — 0 beim DWD',
      r.e instanceof K.KonradNotInRepo && /3 Fehlversuche/.test(r.e.message) && first.length === 4 && first[2].startsWith(RAW_HOST) && calls.length === 6 && dwdCalls().length === 0
      && calls.every((u) => u.startsWith(CDN_HOST) || u.startsWith(RAW_HOST)), `${calls.length} Abrufe: ${r.e?.message}`);
  });
  await withWorld('?konraddwd=1', async () => {
    at(200);
    rule = () => ({ status: 503 });
    const r = await elapsed(K.fetchKonrad3d());
    add('K6 Gegenprobe `?konraddwd=1`: derselbe Ausfall geht zum DWD (Listing)', dwdCalls().length >= 1 && !(r.e instanceof K.KonradNotInRepo), `${dwdCalls().length} Abrufe beim DWD`);
  });
  // K7 — nichts im Spiegel
  await withWorld('', async () => {
    at(200);
    rule = () => ({ status: 404 });
    const r = await elapsed(K.fetchKonrad3d());
    add('K7 keiner der drei jüngsten Slots im Spiegel (404 überall) ⇒ KonradNotInRepo nach 6 Abrufen, kein XML, 0 beim DWD — und der Radar-Latch bleibt offen (404 ist eine Antwort)',
      r.e instanceof K.KonradNotInRepo && /keiner der 3/.test(r.e.message) && calls.length === 6 && calls.every((u) => /cells\.json$/.test(u)) && dwdCalls().length === 0 && RUNS.radarCdnUsable(), `${calls.length} Abrufe`);
  });

  // K8 — JSON unlesbar, `radarimg=0`
  await withWorld('', async () => {
    at(200);
    rule = (u) => (u === cellsUrl(B - 5 * MIN) ? { json: { schema: 2 } } : u === xmlUrl(B - 5 * MIN) ? { text: xml(B - 5 * MIN) } : { status: 404 });
    const run = await K.fetchKonrad3d();
    add('K8 `cells.json` mit fremdem Schema ⇒ das XML DESSELBEN Stempels, ebenfalls aus dem Repo', run.refMs === B - 5 * MIN && run.file === `KONRAD3D_${stamp(B - 5 * MIN)}.xml` && calls.length === 2 && calls[1] === xmlUrl(B - 5 * MIN) && dwdCalls().length === 0);
  });
  await withWorld('?radarimg=0', async () => {
    at(200);
    rule = (u) => (u === xmlUrl(B - 5 * MIN) ? { text: xml(B - 5 * MIN) } : { status: 404 });
    const run = await K.fetchKonrad3d();
    add('K8 `?radarimg=0` ⇒ nur das XML des Repos, 0 beim DWD', run.refMs === B - 5 * MIN && calls.length === 1 && calls[0] === xmlUrl(B - 5 * MIN) && dwdCalls().length === 0);
  });

  // K9 — Zwischenspeicher und Nachlade-Regel
  await withWorld('', async () => {
    at(290);
    rule = (u) => (u === cellsUrl(B - 5 * MIN) ? { json: cellsJson(B - 5 * MIN) } : u === cellsUrl(B, 'raw') ? { json: cellsJson(B) } : { status: 404 });
    const a = await K.fetchKonrad3d();
    at(295);
    const b = await K.fetchKonrad3d();
    const n = calls.length;
    at(350);                                                   // 60 s später: der neue Slot hat sein Gate passiert
    const c = await K.fetchKonrad3d();
    add('K9 Zwischenspeicher: 5 s später kein Abruf; 60 s später (Gate passiert) ein neuer Abruf — der Speicher fragt auch, WELCHER Slot fällig ist ⇒ der neue Slot',
      a.refMs === B - 5 * MIN && b === a && n === 1 && c.refMs === B && K.konradFollowUpInMs(c, B + 350_000) === null, `Abrufe ${n} → ${calls.length}`);
  });
  await withWorld('', async () => {
    const f = (heldMs, p) => K.konradFollowUpInMs({ file: `KONRAD3D_${stamp(heldMs)}.xml` }, B + p * 1000);
    add('K9 Nachlade-Regel: nichts zu holen ⇒ null; vor dem Gate ⇒ Gate − Alter + 20 s; Spiegel zu spät ⇒ 70 s bis 90 s hinter dem Gate, danach null',
      f(B - 5 * MIN, 100) === null && f(B - 5 * MIN, 290) === 60_000 && f(B - 10 * MIN, 10) === 40_000
      && f(B - 10 * MIN, 40) === 70_000 && f(B - 10 * MIN, 119) === 70_000 && f(B - 10 * MIN, 121) === null,
      [f(B - 5 * MIN, 100), f(B - 5 * MIN, 290), f(B - 10 * MIN, 10), f(B - 10 * MIN, 40), f(B - 10 * MIN, 121)].join(' · '));
    add('K9 kein KONRAD-Abruf dieses Prüfers ging an einen anderen Host als jsDelivr oder raw (außer in den Gegenproben)', isKonrad(cellsUrl(B)) && isKonrad(xmlUrl(B)));
  });
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:repo-only — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
