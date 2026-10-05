/**
 * verify:radar-fallback — Phase NL (audit/niederschlag-ladezeit.md): der Niederschlag lädt nicht mehr
 * „manchmal sehr lange", wenn jsDelivr einen frischen Radar-Slot kalt nicht liefert.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-radar-fallback.mjs
 *
 * Gestellt wird nur `fetch` (und die Uhr); gerechnet wird mit dem echten App-Code. Die Szenarien B1–B4 sind
 * die gemessenen Läufe vom 01.10.: #0 (vorgestartete meta.json hängt), #9/#10 (ein Bild 403), #8 (vorgestarteter
 * roher Tar hängt ohne Frist), dazu die Gegenprobe 404 (Datei gibt es nicht ⇒ kein Ausweichweg).
 *
 *   A  `fetchImgRes`: Hedge nach 2,5 s ohne Kopfzeilen, 403/5xx/Netz ⇒ raw.githubusercontent, 404 am CDN ⇒ einmal raw
 *      (V-AW-25: am Edge festgehaltener 404), „nicht da" erst bei 404 auf beiden Wegen,
 *      Schalter `radarraw`, fremde Basen ohne Ausweichweg, Abbruch des Aufrufers
 *   B  `fetchRvNowcast` Ende zu Ende über den Router-Frühstart (`warmRvTar`)
 */
import { encodePng } from './lib/png.mjs';

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

const CDN = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/radar';
const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/radar';

// ── gestelltes fetch ─────────────────────────────────────────────────────────
// Regeln: [prefix-or-regex, behaviour] — behaviour { status, body, delayMs, hang }
let rules = [];
let log = [];
let t0 = performance.now();
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const url = String(input);
  const rec = { url, at: Math.round(performance.now() - t0), aborted: false, signal: !!init.signal };
  log.push(rec);
  const rule = rules.find(([m]) => (typeof m === 'string' ? url.startsWith(m) : m.test(url)));
  const b = rule ? rule[1] : { status: 404 };
  return new Promise((resolve, reject) => {
    const sig = init.signal;
    const onAbort = () => { rec.aborted = true; reject(sig.reason ?? new DOMException('Aborted', 'AbortError')); };
    if (sig) { if (sig.aborted) return onAbort(); sig.addEventListener('abort', onAbort, { once: true }); }
    if (b.hang) return;                                   // keine Kopfzeilen, nie
    if (b.netError) return setTimeout(() => reject(new TypeError('Failed to fetch')), b.delayMs ?? 0);
    setTimeout(() => {
      const body = typeof b.body === 'function' ? b.body(url) : b.body;
      resolve(new Response(body ?? null, { status: b.status ?? 200 }));
    }, b.delayMs ?? 0);
  });
};
const reset = () => { rules = []; log = []; t0 = performance.now(); };
const reqs = (pat) => log.filter((r) => (typeof pat === 'string' ? r.url.startsWith(pat) : pat.test(r.url)));

// ── Fixtures in echter Datenform: Graustufen-PNG 1100 × 1200 und Bild-Meta wie der Spiegel ──
const W = 1100, H = 1200;
const gray = new Uint8Array(W * H);
for (let k = 0; k < gray.length; k++) gray[k] = (k % 1100) > 500 && (k % 1100) < 520 ? 120 : 0;   // ein „Regenband"
const PNG = new Uint8Array(encodePng(W, H, gray, 1));

let mod = null, runs = null, nowcast = null;
try {
  mod = await import('../src/sources/radarImg.ts');
  runs = await import('../src/sources/radolanRuns.ts');
  nowcast = await import('../src/sources/radolan.ts');
} catch (e) { add('Module laden', false, String(e?.message ?? e).slice(0, 200)); }

const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`Zeitüberschreitung ${ms} ms`)), ms))]);
const outcome = async (p, ms = 15_000) => {
  const s = performance.now();
  try { const v = await timeout(p, ms); return { ok: true, v, ms: Math.round(performance.now() - s) }; }
  catch (e) { return { ok: false, e, ms: Math.round(performance.now() - s) }; }
};

// ── A: fetchImgRes ───────────────────────────────────────────────────────────
if (mod) {
  const F = `${CDN}/img/v1/rv/2610011630/f005.png`, Fr = `${RAW}/img/v1/rv/2610011630/f005.png`;
  const has = typeof mod.fetchImgRes === 'function';
  add('A0 radarImg.ts exportiert fetchImgRes, RADAR_RAW_HEDGE_MS = 2500, radarRawUrl',
    has && mod.RADAR_RAW_HEDGE_MS === 2500 && typeof mod.radarRawUrl === 'function',
    `hedge=${mod.RADAR_RAW_HEDGE_MS}, radarRawUrl=${typeof mod.radarRawUrl}`);
  if (typeof mod.radarRawUrl === 'function') {
    add('A0 radarRawUrl: CDN-@main ⇒ raw.githubusercontent, andere Basis ⇒ null',
      mod.radarRawUrl(F) === Fr && mod.radarRawUrl('https://example.org/x.png') === null, mod.radarRawUrl(F));
  }

  reset(); rules = [[F, { status: 200, body: 'cdn', delayMs: 50 }], [Fr, { status: 200, body: 'raw' }]];
  let r = await outcome(mod.fetchImgRes(F));
  add('A1 CDN antwortet ⇒ CDN-Bytes, kein Ausweichweg', r.ok && (await r.v.text()) === 'cdn' && reqs(RAW).length === 0, `${r.ms} ms, raw=${reqs(RAW).length}`);

  reset(); rules = [[F, { status: 200, body: 'cdn', delayMs: 1500 }], [Fr, { status: 200, body: 'raw' }]];
  r = await outcome(mod.fetchImgRes(F));
  add('A2 CDN langsam, aber vor dem Hedge ⇒ kein Ausweichweg', r.ok && (await r.v.text()) === 'cdn' && reqs(RAW).length === 0, `${r.ms} ms`);

  reset(); rules = [[F, { status: 403, delayMs: 300 }], [Fr, { status: 200, body: 'raw' }]];
  r = await outcome(mod.fetchImgRes(F));
  add('A3 CDN 403 ⇒ raw.githubusercontent', r.ok && (await r.v.text()) === 'raw' && r.ms < 1500, `${r.ms} ms`);

  reset(); rules = [[F, { hang: true }], [Fr, { status: 200, body: 'raw', delayMs: 100 }]];
  r = await outcome(mod.fetchImgRes(F));
  const rawAt = reqs(RAW)[0]?.at ?? -1;
  add('A4 CDN hängt ⇒ Ausweichweg ab 2,5 s, Antwort < 3,5 s, CDN-Abruf abgebrochen',
    r.ok && (await r.v.text()) === 'raw' && rawAt >= 2400 && r.ms < 3500 && reqs(F)[0]?.aborted, `raw@${rawAt} ms, fertig ${r.ms} ms, cdn abgebrochen=${reqs(F)[0]?.aborted}`);

  reset(); rules = [[F, { netError: true, delayMs: 200 }], [Fr, { status: 200, body: 'raw' }]];
  r = await outcome(mod.fetchImgRes(F));
  add('A5 Netzfehler am CDN ⇒ raw.githubusercontent', r.ok && (await r.v.text()) === 'raw', `${r.ms} ms`);

  reset(); rules = [[F, { status: 404, delayMs: 100 }], [Fr, { status: 200, body: 'raw' }]];
  r = await outcome(mod.fetchImgRes(F));
  add('A6 CDN 404, raw hat die Datei (am Edge festgehaltener 404, V-AW-25) ⇒ raw-Bytes nach genau einem raw-Abruf', r.ok && (await r.v.text()) === 'raw' && reqs(RAW).length === 1 && r.ms < 1500, `${r.ms} ms, raw=${reqs(RAW).length}`);
  reset(); rules = [[F, { status: 404, delayMs: 100 }], [Fr, { status: 404 }]];
  r = await outcome(mod.fetchImgRes(F));
  add('A6b CDN 404 + raw 404 ⇒ RadarImg404 (die Datei gibt es nicht), ein raw-Abruf, kein harter Fehler', !r.ok && r.e instanceof mod.RadarImg404 && reqs(RAW).length === 1, `${r.e?.constructor?.name}`);

  reset(); rules = [[F, { status: 403 }], [Fr, { status: 404 }]];
  r = await outcome(mod.fetchImgRes(F));
  add('A7 CDN 403 + raw 404 ⇒ RadarImg404 (nicht da, zählt nicht als harter Fehler)', !r.ok && r.e instanceof mod.RadarImg404, `${r.e?.constructor?.name}`);

  reset(); rules = [[F, { netError: true }], [Fr, { netError: true }]];
  r = await outcome(mod.fetchImgRes(F));
  add('A8 beide Wege Netzfehler ⇒ harter Fehler (kein RadarImg404)', !r.ok && !(r.e instanceof mod.RadarImg404), `${r.e?.name}: ${r.e?.message}`);

  const realLS = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k === 'radarraw' ? '0' : null) };
  reset(); rules = [[F, { status: 403 }], [Fr, { status: 200, body: 'raw' }]];
  r = await outcome(mod.fetchImgRes(F));
  add('A9 Schalter localStorage.radarraw=0 ⇒ kein Ausweichweg, 403 bleibt RadarImg404 wie bisher', !r.ok && r.e instanceof mod.RadarImg404 && reqs(RAW).length === 0);
  reset(); rules = [[F, { status: 404 }], [Fr, { status: 200, body: 'raw' }]];
  r = await outcome(mod.fetchImgRes(F));
  add('A9b Schalter radarraw=0 ⇒ 404 sofort RadarImg404 ohne raw (Rückweg zum Verhalten vor V-AW-25)', !r.ok && r.e instanceof mod.RadarImg404 && reqs(RAW).length === 0 && r.ms < 300, `${r.ms} ms`);
  if (realLS === undefined) delete globalThis.localStorage; else globalThis.localStorage = realLS;
  if (typeof mod.radarRawFlagFrom === 'function') {
    add('A9 Schalter: Query schlägt Speicher (beide Richtungen)',
      mod.radarRawFlagFrom('?radarraw=1', '0') === true && mod.radarRawFlagFrom('?radarraw=0', '1') === false && mod.radarRawFlagFrom('', null) === true);
  } else add('A9 radarRawFlagFrom exportiert', false);

  const other = 'https://example.org/radar/x.png';
  reset(); rules = [[other, { status: 403 }]];
  r = await outcome(mod.fetchImgRes(other));
  add('A10 fremde Basis ⇒ kein Ausweichweg', !r.ok && log.length === 1);

  reset(); rules = [[F, { hang: true }], [Fr, { hang: true }]];
  const ac = new AbortController(); setTimeout(() => ac.abort(new Error('CDN-Frist 3000 ms')), 3000);
  r = await outcome(mod.fetchImgRes(F, ac.signal));
  add('A11 Frist des Aufrufers beendet beide Wege', !r.ok && r.ms < 3500 && log.every((x) => x.aborted), `${r.ms} ms, abgebrochen ${log.filter((x) => x.aborted).length}/${log.length}`);

  // NL-1 am Bild-Weg: eine vorgestartete Antwort (Router-Frühstart) unterliegt derselben Frist/demselben Hedge
  reset(); rules = [[Fr, { status: 200, body: 'raw' }]];
  r = await outcome(mod.fetchImgRes(F, undefined, undefined, new Promise(() => {})));
  add('A12 vorgestartete Antwort hängt ⇒ Ausweichweg nach dem Hedge (statt ewig zu warten)', r.ok && (await r.v.text()) === 'raw' && r.ms < 3500, `${r.ms} ms`);
  reset(); rules = [];
  const ac2 = new AbortController(); setTimeout(() => ac2.abort(new Error('CDN-Frist')), 800);
  const realLS2 = globalThis.localStorage; globalThis.localStorage = { getItem: (k) => (k === 'radarraw' ? '0' : null) };
  r = await outcome(mod.fetchImgRes(F, ac2.signal, undefined, new Promise(() => {})));
  if (realLS2 === undefined) delete globalThis.localStorage; else globalThis.localStorage = realLS2;
  add('A13 vorgestartete Antwort hängt, ohne Ausweichweg ⇒ die Frist des Aufrufers greift (und erst sie)',
    !r.ok && r.ms >= 700 && r.ms < 1300 && log.length === 0, `${r.ms} ms, Abrufe ${log.length}`);
}

// ── B: Ende zu Ende (fetchRvNowcast, Frühstart wie der Router) ───────────────
if (nowcast && runs && mod) {
  const realNow = Date.now;
  let fakeBase = 0, fakeStart = 0;
  const setClock = (ms) => { fakeBase = ms; fakeStart = realNow(); Date.now = () => fakeBase + (realNow() - fakeStart); };
  const stampOf = (ms) => runs.rvStamp(new Date(ms));
  const frames = Array.from({ length: 25 }, (_, i) => ({ lead: i * 5, file: runs.radarImgFrameFile(i * 5), bytes: PNG.length }));
  const metaFor = (ts) => JSON.stringify(mod.makeRvImgMeta(ts, runs.rvStampToMs(ts), frames));
  const imgRules = (ts, base, extra = {}) => [
    [`${base}/img/v1/rv/${ts}/meta.json`, extra.meta ?? { status: 200, body: metaFor(ts) }],
    ...(extra.frames ?? []),
    [new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/img/v1/rv/${ts}/f\\d{3}\\.png$`), { status: 200, body: () => PNG.slice() }],
  ];
  // Basis: ein Slot-Raster weit weg von jeder echten Uhr, je Szenario ein eigener Takt (RUN_CACHE_TTL 60 s)
  let slot = Date.UTC(2026, 9, 1, 12, 0, 0);
  const nextSlot = () => (slot += 30 * 60_000);
  const failureCount = () => { let n = 0; while (runs.radarCdnUsable() && n < 5) { runs.noteRadarCdnFailure(); n++; } runs._resetRadarCdn(); return runs.RADAR_CDN_FAIL_LATCH - n; };

  // B1 = Lauf #0: vorgestartete meta.json hängt am CDN ⇒ Ausweichweg; Regen < 8 s; kein Sitzungs-Latch
  {
    const s = nextSlot(); const ts = stampOf(s); setClock(s + 308_000);
    runs._resetRadarCdn(); runs._resetWarmRv(); reset();
    rules = [[`${CDN}/img/v1/rv/${ts}/meta.json`, { hang: true }], ...imgRules(ts, RAW), ...imgRules(ts, CDN)];
    runs.warmRvTar(Date.now());
    const r = await outcome(nowcast.fetchRvNowcast(), 20_000);
    const tar = reqs(/composite_rv_|DE1200_RV/);
    add('B1 (#0) vorgestartete meta.json hängt ⇒ Regen über den Bild-Weg in < 8 s, kein roher Tar',
      r.ok && r.v.frames.length === 25 && r.ms < 8000 && tar.length === 0, r.ok ? `${r.ms} ms, Tar-Abrufe ${tar.length}` : `${r.e?.message} nach ${r.ms} ms`);
    add('B1 Ausweich-Abrufe zählen nicht als harter CDN-Fehler', failureCount() === 0, `Zähler ${failureCount()}`);
  }
  // B2 = Läufe #9/#10: f000.png 403 (vorgestartet), Rest gut ⇒ nur dieses Bild über raw, kein 9,6-MB-Tar
  {
    const s = nextSlot(); const ts = stampOf(s); setClock(s + 285_000);
    runs._resetRadarCdn(); runs._resetWarmRv(); reset();
    rules = [...imgRules(ts, CDN, { frames: [[`${CDN}/img/v1/rv/${ts}/f000.png`, { status: 403, delayMs: 200 }]] }), ...imgRules(ts, RAW)];
    runs.warmRvTar(Date.now());
    const r = await outcome(nowcast.fetchRvNowcast(), 20_000);
    const rawReqs = reqs(RAW).map((x) => x.url.split('/').pop());
    add('B2 (#9) ein Bild 403 ⇒ nur dieses über raw.githubusercontent, Slot bleibt Bild-Weg, kein Tar',
      r.ok && r.v.frames.length === 25 && reqs(/composite_rv_|DE1200_RV/).length === 0 && rawReqs.length === 1 && rawReqs[0] === 'f000.png',
      r.ok ? `${r.ms} ms, raw: ${rawReqs.join(',')}` : `${r.e?.message}`);
  }
  // B3 = Lauf #8: Slot nicht Bild-berechtigt, vorgestarteter roher Tar am CDN hängt ⇒ nach der CDN-Frist Netlify, CDN nicht erneut
  {
    const s = nextSlot(); const ts = stampOf(s); setClock(s + 254_000);
    runs._resetRadarCdn(); runs._resetWarmRv(); reset();
    const cdnTar = runs.rvTarCdnUrl(ts), netlifyTar = runs.rvTarUrl(ts);
    rules = [[cdnTar, { hang: true }], [netlifyTar, { status: 404, delayMs: 50 }]];
    runs.warmRvTar(Date.now());
    const p = nowcast.fetchRvNowcast();
    const r = await outcome(p, 30_000);
    const nl = reqs(netlifyTar)[0];
    add('B3 (#8) vorgestarteter Tar hängt ⇒ Netlify nach der CDN-Frist (≈ 8 s) statt nie',
      !!nl && nl.at >= runs.RADAR_CDN_DEADLINE_MS - 300 && nl.at <= runs.RADAR_CDN_DEADLINE_MS + 1500,
      nl ? `Netlify @${nl.at} ms` : `kein Netlify-Abruf (${r.ok ? 'ok' : r.e?.message} nach ${r.ms} ms)`);
    add('B3 der hängende CDN-Tar wird nicht ein zweites Mal angefragt', reqs(cdnTar).length === 1, `${reqs(cdnTar).length}×`);
  }
  // B4 (V-AW-25): ein Bild 404 am CDN, raw hat es (am Edge festgehaltener 404) ⇒ nur dieses über raw, kein 9,6-MB-Tar
  {
    const s = nextSlot(); const ts = stampOf(s); setClock(s + 400_000);
    runs._resetRadarCdn(); runs._resetWarmRv(); reset();
    rules = [...imgRules(ts, CDN, { frames: [[`${CDN}/img/v1/rv/${ts}/f060.png`, { status: 404 }]] }), ...imgRules(ts, RAW)];
    const r = await outcome(nowcast.fetchRvNowcast(), 30_000);
    const rawReqs = reqs(RAW).map((x) => x.url.split('/').pop());
    add('B4 Bild 404 am CDN, raw hat es (V-AW-25) ⇒ nur dieses über raw, Slot bleibt Bild-Weg, kein Tar',
      r.ok && r.v.frames.length === 25 && rawReqs.length === 1 && rawReqs[0] === 'f060.png' && reqs(runs.rvTarCdnUrl(ts)).length === 0, `raw=${rawReqs.join(',')}, tar=${reqs(runs.rvTarCdnUrl(ts)).length}`);
  }
  // B5 Gegenprobe: das Bild fehlt WIRKLICH (404 auf beiden Wegen) ⇒ Rückfall auf den rohen Tar wie bisher
  {
    const s = nextSlot(); const ts = stampOf(s); setClock(s + 400_000);
    runs._resetRadarCdn(); runs._resetWarmRv(); reset();
    rules = [...imgRules(ts, CDN, { frames: [[`${CDN}/img/v1/rv/${ts}/f060.png`, { status: 404 }]] }), [`${RAW}/img/v1/rv/${ts}/f060.png`, { status: 404 }], ...imgRules(ts, RAW)];
    const r = await outcome(nowcast.fetchRvNowcast(), 30_000);
    add('B5 Gegenprobe: Bild auf beiden Wegen 404 ⇒ Rückfall auf den rohen Tar wie bisher, kein harter CDN-Fehler',
      reqs(`${RAW}/img/v1/rv/${ts}/f060.png`).length === 1 && reqs(runs.rvTarCdnUrl(ts)).length >= 1 && failureCount() === 0, `tar=${reqs(runs.rvTarCdnUrl(ts)).length} (${r.ok ? 'ok' : 'Fehler erwartet'})`);
  }
  Date.now = realNow;
}
globalThis.fetch = realFetch;

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:radar-fallback — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
