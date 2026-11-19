/**
 * verify:precip-repo — Phase RN-2 (audit/radar-nur-datenrepo.md §8, E-RN-5, Jan 18.11.2026): der ICON-D2-Niederschlag kommt
 * nur noch aus dem Daten-Repo; ein Fehlschlag wird wiederholt (zweiter Host raw.githubusercontent, dann der ganze Ladevorgang
 * noch zweimal) und landet nie beim DWD.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-precip-repo.mjs
 *
 * Gestellt werden `fetch`, ein Browser-Fenster (der Repo-Weg ist nur mit `window` an) und der Bild-Dekoder (den es in Node
 * nicht gibt — geprüft wird der Transport, nicht das Dekodieren; die Byte-Gleichheit der Bilder prüft `verify:repack`).
 * Das Fixture ist der ECHTE Index des Daten-Repos, einmal über raw geholt — ohne Netz schlägt P0 laut fehl.
 *
 *   P0  Fixture, Schalter, Adress-Abbildung jsDelivr → raw
 *   P1  JSON (Index): 503 / hängend / 404 / beide tot / Schalter `repackraw=0`; `retryRepackNow` vergisst Fehlschläge
 *   P2  Bild: 503 am CDN ⇒ raw; beide tot ⇒ Sperre mit Ablauf nach REPACK_BROKEN_MS
 *   P3  `fetchIconD2Precip`: Normalfall, CDN tot, beide tot (3 Versuche, benannter Fehler), Gegenprobe `precipdwd=1`
 */
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

const RS = await import('../src/sources/repackSource.ts');
const P = await import('../src/sources/iconD2Precip.ts');

const CDN_HOST = 'https://cdn.jsdelivr.net/';
const RAW_HOST = 'https://raw.githubusercontent.com/';
const DWD = /^\/_dwd_(opendata|grib|wind)\//;
const realFetch = globalThis.fetch;
const realNow = Date.now;

// ── Fixture: der echte Index ─────────────────────────────────────────────────
let index = null;
try {
  const res = await realFetch(`${RS.DATA_RAW_BASE}/main/index.json`, { signal: AbortSignal.timeout(20_000) });
  if (res.ok) index = await res.json();
} catch { /* P0 meldet es */ }
const run = index ? RS.newestRunFromIndex(index, 'precip') : null;
add('P0 Fixture: echter Index des Daten-Repos gelesen, er führt einen Niederschlags-Lauf', !!index && !!run, run ? `Lauf ${run.runStr}, ${run.steps.length} Schritte` : 'kein Index / kein Lauf (Netz?)');

add('P0 Adress-Abbildung: Branch und Commit ⇒ raw mit derselben Ref und demselben Pfad; fremde Adresse ⇒ null',
  RS.repackRawUrl(RS.REPACK_INDEX_CDN_URL) === `${RS.DATA_RAW_BASE}/main/index.json`
  && RS.repackRawUrl(`${RS.REPACK_CDN_BASE}@0123abc/runs/2026111818/precip-001.png`) === `${RS.DATA_RAW_BASE}/0123abc/runs/2026111818/precip-001.png`
  && RS.repackRawUrl('https://example.org/x.json') === null && RS.repackRawUrl(undefined) === null && RS.repackRawUrl(`${RS.REPACK_CDN_BASE}@main`) === null,
  String(RS.repackRawUrl(RS.REPACK_INDEX_CDN_URL)));
add('P0 Schalter: Voreinstellungen (raw an, DWD-Weg aus), Query schlägt Speicher',
  RS.repackRawFlagFrom('', null) === true && RS.repackRawFlagFrom('?repackraw=0', '1') === false && RS.repackRawFlagFrom('', '0') === false
  && P.PRECIP_DWD_DEFAULT === false && P.precipDwdFlagFrom('', null) === false && P.precipDwdFlagFrom('?precipdwd=1', null) === true
  && P.precipDwdFlagFrom('', '1') === true && P.precipDwdFlagFrom('?precipdwd=0', '1') === false);
add('P0 ohne `window` (Node, Verifier) gilt der alte Weg — die übrigen Prüfer rechnen wie bisher', P.precipDwdDirect() === true);

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
  const b = rule(url);
  if (b.hang) return hang(init);
  if (b.json !== undefined) return Promise.resolve(new Response(JSON.stringify(b.json), { status: 200 }));
  if (b.bytes) return Promise.resolve(new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 }));
  return Promise.resolve(new Response(null, { status: b.status ?? 404 }));
};
const withWorld = async (search, fn) => {
  const had = { window: 'window' in globalThis, w: globalThis.window, cib: globalThis.createImageBitmap, doc: globalThis.document };
  globalThis.window = { location: { search }, localStorage: null };
  globalThis.fetch = stubFetch;
  calls = []; RS.resetRepackState(); RS.resetRepackIndexCache();
  try { return await fn(); } finally {
    if (had.window) globalThis.window = had.w; else delete globalThis.window;
    if (had.cib === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = had.cib;
    if (had.doc === undefined) delete globalThis.document; else globalThis.document = had.doc;
    globalThis.fetch = realFetch; Date.now = realNow;
    RS.resetRepackState(); RS.resetRepackIndexCache();
  }
};
/** Bild-Dekoder-Attrappe in den Maßen des Abschnitts (Transport-Prüfung; Werte sind hier nicht Gegenstand). */
const stubDecoder = (w, h) => {
  globalThis.createImageBitmap = async () => ({ width: w, height: h, close() {} });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }) }) }) };
};
const isIndex = (u) => u === RS.REPACK_INDEX_CDN_URL;
const isRawIndex = (u) => u === `${RS.DATA_RAW_BASE}/main/index.json`;
const elapsed = async (p) => { const s = performance.now(); try { return { v: await p, ms: Math.round(performance.now() - s) }; } catch (e) { return { e, ms: Math.round(performance.now() - s) }; } };

if (index && run) {
  // ── P1: JSON ───────────────────────────────────────────────────────────────
  await withWorld('', async () => {
    rule = (u) => (isIndex(u) ? { status: 503 } : isRawIndex(u) ? { json: index } : { status: 404 });
    const r = await RS.resolveRunFromRepackIndex('precip');
    add('P1 Index 503 am CDN ⇒ EIN zweiter Versuch auf raw, der Lauf kommt von dort',
      r?.runStr === run.runStr && calls.length === 2 && isIndex(calls[0]) && isRawIndex(calls[1]) && RS.repackStatus().rawRescues === 1 && RS.repackStatus().broken === false,
      `${calls.length} Abrufe, Lauf ${r?.runStr}`);
  });
  await withWorld('', async () => {
    rule = (u) => (isIndex(u) ? { hang: true } : isRawIndex(u) ? { json: index } : { status: 404 });
    const r = await elapsed(RS.resolveRunFromRepackIndex('precip'));
    add('P1 Index hängt am CDN (Messung 18.11.: 4–24 s) ⇒ nach der Frist (3 s) raw, Lauf nach < 4,5 s',
      r.v?.runStr === run.runStr && r.ms >= RS.FIRST_TIMEOUT_MS - 200 && r.ms < RS.FIRST_TIMEOUT_MS + 1500 && isRawIndex(calls[1]), `${r.ms} ms`);
  });
  await withWorld('', async () => {
    rule = () => ({ status: 404 });
    const r = await RS.resolveRunFromRepackIndex('precip');
    add('P1 Index 404 am CDN ⇒ „nicht da" ist eine Antwort: kein zweiter Host, kein Lauf', r === null && calls.length === 1, `${calls.length} Abrufe`);
  });
  await withWorld('', async () => {
    rule = (u) => (isIndex(u) || isRawIndex(u) ? { status: 503 } : { status: 404 });
    const a = await RS.resolveRunFromRepackIndex('precip');
    const n1 = calls.length;
    const b = await RS.resolveRunFromRepackIndex('precip');
    const n2 = calls.length;
    RS.retryRepackNow();
    rule = (u) => (isIndex(u) ? { json: index } : { status: 404 });
    const c = await RS.resolveRunFromRepackIndex('precip');
    add('P1 beide Hosts 503 ⇒ kein Lauf (2 Abrufe); im 60-s-Fenster kein neuer Abruf; `retryRepackNow` vergisst den Fehlschlag ⇒ neuer Abruf, Lauf da',
      a === null && n1 === 2 && b === null && n2 === 2 && c?.runStr === run.runStr && calls.length === 3, `Abrufe ${n1} → ${n2} → ${calls.length}`);
  });
  await withWorld('?repackraw=0', async () => {
    rule = (u) => (isIndex(u) ? { status: 503 } : isRawIndex(u) ? { json: index } : { status: 404 });
    const r = await RS.resolveRunFromRepackIndex('precip');
    add('P1 Schalter `?repackraw=0` ⇒ kein zweiter Host (Verhalten wie vor RN-2)', r === null && calls.length === 1);
  });

  // ── P2: Bild ───────────────────────────────────────────────────────────────
  const section = RS.parseRepackSection(RS.sectionFromIndex(index, run.runStr, 'precip'), 'precip', run.runStr);
  const step = section?.precip?.steps.find((s) => s.step >= 1);
  add('P2 Fixture: der Index-Abschnitt des Niederschlags besteht die Prüfung des Clients', !!section && !!step, section ? `Gitter ${section.precip.grid.width}×${section.precip.grid.height}` : 'kein Abschnitt');
  if (section && step) {
    const cdnImg = RS.stepUrl(section, step.file), rawImg = RS.repackRawUrl(cdnImg);
    const { width: W, height: H } = section.precip.grid;
    await withWorld('', async () => {
      stubDecoder(W, H);
      rule = (u) => (u === cdnImg ? { status: 503 } : u === rawImg ? { bytes: true } : { status: 404 });
      const img = await RS.loadPrecipStep(section, step.step);
      add('P2 Bild 503 am CDN ⇒ dasselbe Bild über raw, der Weg gilt NICHT als kaputt',
        !!img && img.values.length === W * H && calls.length === 2 && calls[0] === cdnImg && calls[1] === rawImg && RS.repackStatus().broken === false && RS.repackStatus().rawRescues === 1,
        `${calls.length} Abrufe`);
    });
    await withWorld('', async () => {
      stubDecoder(W, H);
      rule = () => ({ status: 503 });
      const t0 = realNow(); Date.now = () => t0;
      const img = await RS.loadPrecipStep(section, step.step);
      const broken = RS.repackStatus().broken, reason = RS.repackStatus().reason;
      const n = calls.length;
      const img2 = await RS.loadPrecipStep(section, step.step);   // gesperrt: kein Abruf
      const stillAt = calls.length;
      Date.now = () => t0 + RS.REPACK_BROKEN_MS - 1000;
      const usableBefore = RS.repackUsable();
      Date.now = () => t0 + RS.REPACK_BROKEN_MS + 1000;
      const usableAfter = RS.repackUsable();
      add('P2 beide Hosts 503 ⇒ Sperre (Grund nennt beide Hosts), gesperrt kein Abruf; nach REPACK_BROKEN_MS (5 min) wieder offen — vorher: bis zum Neuladen',
        img === null && broken && /raw: HTTP 503/.test(reason) && n === 2 && img2 === null && stillAt === 2 && usableBefore === false && usableAfter === true && RS.REPACK_BROKEN_MS === 5 * 60_000,
        `Grund „${reason}"`);
    });

    // ── P3: der Niederschlags-Leser Ende zu Ende ─────────────────────────────
    const isPrecipCdn = (u) => u.startsWith(CDN_HOST) && /\/precip-\d+\.png$/.test(u);
    const isPrecipRaw = (u) => u.startsWith(RAW_HOST) && /\/precip-\d+\.png$/.test(u);
    const opts = { nowOnly: true, aheadHours: 0 };
    await withWorld('', async () => {
      stubDecoder(W, H);
      rule = (u) => (isIndex(u) ? { json: index } : isPrecipCdn(u) ? { bytes: true } : { status: 404 });
      const r = await elapsed(P.fetchIconD2Precip(undefined, undefined, opts));
      add('P3 Normalfall: Lauf aus dem Index, Bilder vom CDN, 0 Abrufe beim DWD, 0 auf raw',
        P.precipDwdDirect() === false && !!r.v && r.v.frames.length >= 1 && r.v.runAt.getTime() === run.runAt.getTime()
        && !calls.some((u) => DWD.test(u)) && !calls.some((u) => u.startsWith(RAW_HOST)),
        r.v ? `${r.v.frames.length} Frame(s), ${calls.length} Abrufe` : String(r.e?.message));
    });
    await withWorld('', async () => {
      stubDecoder(W, H);
      rule = (u) => (u.startsWith(CDN_HOST) ? { status: 503 } : isRawIndex(u) ? { json: index } : isPrecipRaw(u) ? { bytes: true } : { status: 404 });
      const r = await elapsed(P.fetchIconD2Precip(undefined, undefined, opts));
      add('P3 jsDelivr ganz tot (alles 503) ⇒ Index UND Bilder über raw, 0 Abrufe beim DWD, im ersten Versuch',
        !!r.v && r.v.frames.length >= 1 && calls.some(isRawIndex) && calls.some(isPrecipRaw) && !calls.some((u) => DWD.test(u)) && r.ms < 2500,
        r.v ? `${r.v.frames.length} Frame(s), ${r.ms} ms` : String(r.e?.message));
    });
    await withWorld('', async () => {
      stubDecoder(W, H);
      rule = () => ({ status: 503 });
      const r = await elapsed(P.fetchIconD2Precip(undefined, undefined, opts));
      const rounds = calls.filter(isIndex).length;
      const pauseMs = P.PRECIP_REPO_RETRY_MS.reduce((a, b) => a + b, 0);
      add('P3 beide Hosts tot ⇒ DREI Versuche (Pausen 3 s + 8 s), dann der benannte Fehler IconD2NotInRepo — und 0 Abrufe beim DWD (kein Listing, kein GRIB)',
        r.e instanceof P.IconD2NotInRepo && rounds === P.PRECIP_REPO_TRIES && P.PRECIP_REPO_TRIES === 3 && r.ms >= pauseMs - 300 && r.ms < pauseMs + 4000
        && !calls.some((u) => DWD.test(u)) && calls.every((u) => u.startsWith(CDN_HOST) || u.startsWith(RAW_HOST)),
        `${r.e?.constructor?.name}, ${rounds} Index-Runden, ${r.ms} ms, ${calls.length} Abrufe`);
    });
    await withWorld('?precipdwd=1', async () => {
      stubDecoder(W, H);
      rule = () => ({ status: 503 });
      const r = await elapsed(P.fetchIconD2Precip(undefined, undefined, opts));
      const dwd = calls.filter((u) => DWD.test(u));
      add('P3 Gegenprobe: mit `?precipdwd=1` geht derselbe Ausfall wie früher zum DWD (Listing `tot_prec`) — das Muster der „0 Abrufe" trifft also',
        P.precipDwdDirect() === true && dwd.length >= 1 && dwd.some((u) => /\/_dwd_opendata\/weather\/nwp\/icon-d2\/grib\/\d\d\/tot_prec\/$/.test(u)) && !(r.e instanceof P.IconD2NotInRepo),
        `${dwd.length} Abrufe beim DWD, z. B. ${dwd[0] ?? '—'}`);
    });
    for (const [search, word] of [['?repack=0', 'repack=0'], ['?repackidx=0', 'repackidx=0'], ['?repackrun=0', 'repackrun=0']]) {
      await withWorld(search, async () => {
        add(`P3 Diagnose-Schalter \`${word}\` nimmt den Index-Weg weg ⇒ er heißt weiter „alte Kette" (DWD-Weg erlaubt)`, P.precipDwdDirect() === true);
      });
    }
  }
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:precip-repo — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
