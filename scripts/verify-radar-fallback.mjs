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
const reset = () => { rules = []; log = []; t0 = performance.now(); mod?._resetRadarRaw?.(); };
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

  // ── Phase ND (audit/niederschlag-laden-dach.md) ──
  // ND-1: die Frist rechnet ab dem START der vorgestarteten Antwort — eine, die beim Lesen schon 3 s alt ist, bekommt raw sofort
  reset(); rules = [[Fr, { status: 200, body: 'raw', delayMs: 50 }]];
  r = await outcome(mod.fetchImgRes(F, undefined, undefined, new Promise(() => {}), Date.now() - 3000));
  add('A14 (ND-1) vorgestartete Antwort ist beim Lesen schon 3 s alt und hängt ⇒ Ausweichweg sofort (nicht erst nach 2,5 s)',
    r.ok && (await r.v.text()) === 'raw' && r.ms < 600 && reqs(RAW)[0]?.at < 300, `${r.ms} ms, raw@${reqs(RAW)[0]?.at} ms`);
  reset(); rules = [[Fr, { status: 200, body: 'raw', delayMs: 50 }]];
  r = await outcome(mod.fetchImgRes(F, undefined, undefined, new Promise(() => {}), Date.now() - 1000));
  add('A14b vorgestartete Antwort 1 s alt ⇒ Ausweichweg nach den restlichen 1,5 s', r.ok && reqs(RAW)[0]?.at >= 1300 && reqs(RAW)[0]?.at < 2200, `raw@${reqs(RAW)[0]?.at} ms`);

  // ND-2: raw hatte, was das CDN nicht lieferte ⇒ die übrigen Dateien DESSELBEN Slot-Verzeichnisses lesen raw zuerst, das CDN
  // wird ihr Ausweichweg; ein anderes Verzeichnis beginnt wie immer am CDN
  const F2 = `${CDN}/img/v1/rv/2610011630/f010.png`, F2r = `${RAW}/img/v1/rv/2610011630/f010.png`;
  const G = `${CDN}/img/v1/rv/2610011635/f005.png`, Gr = `${RAW}/img/v1/rv/2610011635/f005.png`;
  reset(); rules = [[F, { status: 403, delayMs: 100 }], [Fr, { status: 200, body: 'raw' }], [F2, { status: 200, body: 'cdn', delayMs: 50 }], [F2r, { status: 200, body: 'raw2' }], [G, { status: 200, body: 'cdn-g', delayMs: 50 }], [Gr, { status: 200, body: 'raw-g' }]];
  add('A15 vor dem ersten Fehler liest das Verzeichnis das CDN zuerst', mod.radarRawFirst(F) === false);
  r = await outcome(mod.fetchImgRes(F));
  const r2 = await outcome(mod.fetchImgRes(F2));
  const rg = await outcome(mod.fetchImgRes(G));
  const t2 = r2.ok ? await r2.v.text() : '—', tg = rg.ok ? await rg.v.text() : '—';
  add('A15 (ND-2) nach 403 ⇒ raw für diese Datei, die nächste Datei des Slots raw ZUERST (kein CDN-Abruf), anderes Verzeichnis CDN zuerst',
    r.ok && (await r.v.text()) === 'raw' && mod.radarRawFirst(F2) === true && t2 === 'raw2' && reqs(F2).length === 0
    && mod.radarRawFirst(G) === false && tg === 'cdn-g' && reqs(Gr).length === 0,
    `f010 via ${t2}, CDN-Abrufe f010=${reqs(F2).length}, G via ${tg}, raw-Abrufe G=${reqs(Gr).length}`);
  // raw zuerst, aber raw hängt ⇒ das CDN ist der Hedge; raw 404 ⇒ CDN sofort; 404 beidseitig bleibt „nicht da"; 5 Hedges zählen nicht
  reset(); mod.radarMarkRawFirst(`${CDN}/img/v1/rv/2610011630`);
  rules = [[F2r, { hang: true }], [F2, { status: 200, body: 'cdn', delayMs: 50 }]];
  r = await outcome(mod.fetchImgRes(F2));
  add('A16 raw zuerst, raw hängt ⇒ CDN als Hedge nach 2,5 s, raw-Abruf abgebrochen', r.ok && (await r.v.text()) === 'cdn' && reqs(F2)[0]?.at >= 2400 && r.ms < 3500 && reqs(F2r)[0]?.aborted, `${r.ms} ms, cdn@${reqs(F2)[0]?.at}`);
  reset(); mod.radarMarkRawFirst(`${CDN}/img/v1/rv/2610011630`);
  rules = [[F2r, { status: 404 }], [F2, { status: 200, body: 'cdn', delayMs: 50 }]];
  r = await outcome(mod.fetchImgRes(F2));
  add('A16b raw zuerst, raw 404 ⇒ sofort das CDN, CDN-Bytes', r.ok && (await r.v.text()) === 'cdn' && r.ms < 600, `${r.ms} ms`);
  reset(); mod.radarMarkRawFirst(`${CDN}/img/v1/rv/2610011630`);
  rules = [[F2r, { status: 404 }], [F2, { status: 404 }]];
  r = await outcome(mod.fetchImgRes(F2));
  add('A16c raw zuerst, 404 auf beiden Wegen ⇒ RadarImg404 (nicht da)', !r.ok && r.e instanceof mod.RadarImg404);
  add('A16d raw-zuerst im Verzeichnis läuft nach RADAR_RAW_FIRST_TTL_MS ab', mod.radarRawFirst(F2) === true && mod.radarRawFirst(F2, Date.now() + mod.RADAR_RAW_FIRST_TTL_MS + 1) === false);
  reset(); mod.radarMarkRawFirst(`${CDN}/img/v1/rv/2610011630`);
  const h0 = mod.radarRawHedgeCount();
  rules = [[F2r, { status: 200, body: 'raw2', delayMs: 20 }]];
  r = await outcome(mod.fetchImgRes(F2));
  add('A16e raw zuerst ⇒ der Pool-Zähler (Hedges zu raw, M8) bleibt unverändert, kein CDN-Abruf', r.ok && mod.radarRawHedgeCount() === h0 && reqs(F2).length === 0, `Hedges ${mod.radarRawHedgeCount() - h0}, CDN ${reqs(F2).length}`);
  const realLS3 = globalThis.localStorage; globalThis.localStorage = { getItem: (k) => (k === 'radarraw' ? '0' : null) };
  reset(); mod.radarMarkRawFirst(`${CDN}/img/v1/rv/2610011630`);
  rules = [[F2, { status: 200, body: 'cdn', delayMs: 20 }], [F2r, { status: 200, body: 'raw2' }]];
  r = await outcome(mod.fetchImgRes(F2));
  if (realLS3 === undefined) delete globalThis.localStorage; else globalThis.localStorage = realLS3;
  add('A16f Schalter radarraw=0 ⇒ raw-zuerst wirkungslos, CDN wie bisher', r.ok && (await r.v.text()) === 'cdn' && reqs(RAW).length === 0);

  // ND-3: Pool je Leitung — ohne Browser (Node) die enge Vorgabe, Konstanten 6 / 12
  add('A17 (ND-3) radarImgPoolSize: 6 ohne Browser, Konstanten 6 und 12', mod.radarImgPoolSize() === 6 && mod.RADAR_IMG_CONCURRENCY === 6 && mod.RADAR_IMG_CONCURRENCY_WIDE === 12, `${mod.radarImgPoolSize()}`);
  {
    const realNav = globalThis.navigator, realWin = globalThis.window;
    const withEnv = (conn, narrow) => {
      Object.defineProperty(globalThis, 'navigator', { value: { connection: conn }, configurable: true });
      Object.defineProperty(globalThis, 'window', { value: { matchMedia: () => ({ matches: narrow }) }, configurable: true });
      const n = mod.radarImgPoolSize();
      Object.defineProperty(globalThis, 'navigator', { value: realNav, configurable: true });
      if (realWin === undefined) delete globalThis.window; else Object.defineProperty(globalThis, 'window', { value: realWin, configurable: true });
      return n;
    };
    add('A17b breiter Viewport + 4g ⇒ 12; schmal ⇒ 6; saveData ⇒ 6; 3g ⇒ 6; ohne connection-API breit ⇒ 12',
      withEnv({ effectiveType: '4g' }, false) === 12 && withEnv({ effectiveType: '4g' }, true) === 6 && withEnv({ saveData: true, effectiveType: '4g' }, false) === 6
      && withEnv({ effectiveType: '3g' }, false) === 6 && withEnv(undefined, false) === 12);
  }
}

// ── C: Sitzungs-Latch mit Ablauf (ND-5, V-NL-1) ──
if (runs) {
  runs._resetRadarCdn();
  const T = Date.UTC(2026, 10, 3, 20, 0, 0);
  runs.noteRadarCdnFailure(T);
  add('C1 ein harter Fehler ⇒ CDN bleibt nutzbar', runs.radarCdnUsable(T + 1000) === true);
  runs.noteRadarCdnFailure(T + 2000);
  add('C1 zweiter harter Fehler im Fenster ⇒ CDN zu', runs.radarCdnUsable(T + 3000) === false && runs.radarCdnUsable(T + 60_000) === false);
  add('C1 (ND-5) nach RADAR_CDN_LATCH_MS wieder nutzbar (vorher: bis zum Neuladen zu)', runs.radarCdnUsable(T + 2000 + runs.RADAR_CDN_LATCH_MS) === true && runs.RADAR_CDN_LATCH_MS === 5 * 60_000);
  runs._resetRadarCdn();
  runs.noteRadarCdnFailure(T);
  runs.noteRadarCdnFailure(T + runs.RADAR_CDN_LATCH_MS + 1000);
  add('C2 zwei Fehler, mehr als 5 min auseinander ⇒ zählen nicht zusammen, CDN bleibt nutzbar', runs.radarCdnUsable(T + runs.RADAR_CDN_LATCH_MS + 2000) === true);
  runs._resetRadarCdn();
  add('C3 ND-7: rvImgRawFirst — jünger als RV_IMG_CDN_READY_MS (360 s) und Bild-berechtigt ⇒ raw zuerst, älter ⇒ CDN, unter dem Gate ⇒ nein',
    runs.RV_IMG_CDN_READY_MS === 360_000 && (() => {
      const s = Date.UTC(2026, 10, 3, 19, 0, 0), ts = runs.rvStamp(new Date(s));
      return runs.rvImgRawFirst(ts, s + 300_000) === true && runs.rvImgRawFirst(ts, s + 400_000) === false && runs.rvImgRawFirst(ts, s + 200_000) === false;
    })());
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
  // B2 (ND-7) = Läufe #9/#10 und die Sonde vom 03.11.: ein junger Slot (285 s) — das CDN löst `@main` noch nicht auf.
  // Frühstart UND Leser gehen raw zuerst; das CDN wird für keine Datei des Slots gefragt; kein Tar.
  {
    const s = nextSlot(); const ts = stampOf(s); setClock(s + 285_000);
    runs._resetRadarCdn(); runs._resetWarmRv(); reset();
    rules = [...imgRules(ts, CDN, { meta: { status: 404, delayMs: 200 }, frames: [[new RegExp(`^${CDN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/img/v1/rv/${ts}/`), { status: 404, delayMs: 200 }]] }), ...imgRules(ts, RAW)];
    const warmUrl = runs.warmRvTar(Date.now());
    const warmReqs = log.map((x) => x.url);
    const r = await outcome(nowcast.fetchRvNowcast(), 20_000);
    const cdnSlot = reqs(`${CDN}/img/v1/rv/${ts}/`).length, rawSlot = reqs(`${RAW}/img/v1/rv/${ts}/`).length;
    add('B2 (ND-7) junger Slot (285 s) ⇒ Frühstart wärmt auf raw (meta + g000 + f000), Leser nimmt sie entgegen',
      warmUrl === `${RAW}/img/v1/rv/${ts}/meta.json` && warmReqs.length === 3 && warmReqs.every((u) => u.startsWith(RAW)),
      `warm=${warmUrl?.replace(RAW, 'RAW')} (${warmReqs.length} Abrufe)`);
    // 27 raw-Abrufe = meta + 25 Frames + die vorgestartete `g000.png` (dieser Slot trägt keine Dual-Frames ⇒ billiges 404)
    add('B2 (ND-7) junger Slot ⇒ alle 26 Dateien raw zuerst (+ g000-Sonde), KEIN CDN-Abruf für den Slot, kein Tar, Regen < 4 s',
      r.ok && r.v.frames.length === 25 && reqs(/composite_rv_|DE1200_RV/).length === 0 && cdnSlot === 0 && rawSlot === 27 && r.ms < 4000,
      r.ok ? `${r.ms} ms, raw ${rawSlot}, cdn ${cdnSlot}` : `${r.e?.message}`);
    add('B2 raw-zuerst zählt nicht als harter CDN-Fehler', failureCount() === 0);
  }
  // B2b (ND-2) = Lauf #0 vom 03.11.: älterer Slot (400 s, CDN zuerst), ein Bild 403 am CDN ⇒ dieses über raw UND die danach
  // gestarteten Dateien des Slots raw zuerst; Slot bleibt Bild-Weg, kein Tar
  {
    const s = nextSlot(); const ts = stampOf(s); setClock(s + 400_000);
    runs._resetRadarCdn(); runs._resetWarmRv(); reset();
    rules = [...imgRules(ts, CDN, { frames: [[`${CDN}/img/v1/rv/${ts}/f005.png`, { status: 403, delayMs: 20 }], [new RegExp(`^${CDN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/img/v1/rv/${ts}/f\\d{3}\\.png$`), { status: 200, body: () => PNG.slice(), delayMs: 150 }]] }), ...imgRules(ts, RAW)];
    const r = await outcome(nowcast.fetchRvNowcast(), 20_000);
    const rawReqs = reqs(RAW).map((x) => x.url.split('/').pop());
    const cdnLast = reqs(`${CDN}/img/v1/rv/${ts}/f120.png`).length;
    add('B2b (ND-2) ein Bild 403 am CDN ⇒ dieses über raw, die später gestarteten Dateien des Slots raw zuerst (f120 nie am CDN), kein Tar',
      r.ok && r.v.frames.length === 25 && reqs(/composite_rv_|DE1200_RV/).length === 0 && rawReqs.includes('f005.png') && rawReqs.includes('f120.png') && cdnLast === 0,
      r.ok ? `${r.ms} ms, raw: ${rawReqs.length} Dateien (${rawReqs.slice(0, 3).join(',')}…), f120 am CDN ${cdnLast}×` : `${r.e?.message}`);
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
    add('B4 Bild 404 am CDN, raw hat es (V-AW-25) ⇒ dieses über raw (ND-2: die danach gestarteten ebenso), Slot bleibt Bild-Weg, kein Tar',
      r.ok && r.v.frames.length === 25 && rawReqs[0] === 'f060.png' && reqs(runs.rvTarCdnUrl(ts)).length === 0, `raw=${rawReqs.join(',')}, tar=${reqs(runs.rvTarCdnUrl(ts)).length}`);
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

// ── D: ND-4 — GeoSphere-`/metadata` vorgestartet, vom INCA-Leser genau einmal verbraucht ──
{
  let inca = null;
  try { inca = await import('../src/sources/geosphereIncaGrid.ts'); } catch (e) { add('D0 geosphereIncaGrid.ts laden', false, String(e?.message ?? e).slice(0, 200)); }
  if (inca && mod) {
    const META = 'https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km/metadata';
    const ref = Date.UTC(2026, 10, 3, 20, 0, 0), stamp = mod.radarImgStamp(ref);
    const IW = 701, IH = 431;
    const ig = new Uint8Array(IW * IH); for (let k = 0; k < ig.length; k++) ig[k] = (k % IW) > 300 && (k % IW) < 320 ? 90 : 0;
    const IPNG = new Uint8Array(encodePng(IW, IH, ig, 1));
    const iframes = Array.from({ length: 12 }, (_, i) => ({ lead: (i + 1) * 15, file: `f${String((i + 1) * 15).padStart(3, '0')}.png`, bytes: IPNG.length }));
    const corners = [[8.1, 49.47], [17.73, 49.47], [17.73, 45.51], [8.1, 45.51]];
    const imeta = JSON.stringify(mod.makeIncaImgMeta(stamp, ref + 60_000, corners, iframes));
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    reset(); inca._resetIncaLastGood(); inca._resetIncaMetaWarm?.(); runs?._resetRadarCdn();
    rules = [
      [META, { status: 200, body: JSON.stringify({ last_forecast_reftime: new Date(ref).toISOString() }), delayMs: 300 }],
      [`${CDN}/img/v1/inca-5m/${stamp}/meta.json`, { status: 404 }], [`${RAW}/img/v1/inca-5m/${stamp}/meta.json`, { status: 404 }],
      [`${CDN}/img/v1/inca/${stamp}/meta.json`, { status: 200, body: imeta, delayMs: 30 }],
      [new RegExp(`^${esc(CDN)}/img/v1/inca/${stamp}/f\\d{3}\\.png$`), { status: 200, body: () => IPNG.slice(), delayMs: 20 }],
    ];
    add('D1 warmIncaMeta exportiert, zweiter Aufruf im Fenster ist No-op', typeof inca.warmIncaMeta === 'function' && (inca.warmIncaMeta(), inca.warmIncaMeta(), reqs(META).length === 1), `Abrufe ${reqs(META).length}`);
    const r = await outcome(inca.fetchIncaGrid(), 20_000);
    add('D2 (ND-4) der INCA-Leser verbraucht die vorgestartete Antwort: genau EIN /metadata-Abruf, Lauf aus dem Bild-Slot',
      r.ok && r.v.frames.length === 12 && r.v.stamp === stamp && reqs(META).length === 1, r.ok ? `${r.ms} ms, /metadata ${reqs(META).length}×` : `${r.e?.message}`);
    reset(); inca._resetIncaLastGood(); inca._resetIncaMetaWarm?.(); runs?._resetRadarCdn();
    rules = [[META, { hang: true }], [`${CDN}/img/v1/inca/${stamp}/meta.json`, { status: 200, body: imeta }]];
    inca.warmIncaMeta();
    const t = performance.now();
    const r2 = await outcome(inca.fetchIncaGrid().catch(() => 'fehler'), 20_000);
    add('D3 vorgestartetes /metadata hängt ⇒ die Frist des Lesers (8 s) beendet das Warten (kein ewiges Hängen)',
      performance.now() - t >= runs.RADAR_CDN_DEADLINE_MS - 300 && performance.now() - t < runs.RADAR_CDN_DEADLINE_MS + 4000, `${Math.round(performance.now() - t)} ms (${r2.ok ? String(r2.v).slice(0, 20) : r2.e?.message})`);
  }
}
globalThis.fetch = realFetch;

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:radar-fallback — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
