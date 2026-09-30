/**
 * verify-dashboard-switch.mjs — Ende-zu-Ende-Gate des Umschalters Dashboard ⇄ Karte (Phase DB, audit/dashboard.md §5.7).
 *
 *   npm run verify:dashboard-switch -- --base=http://127.0.0.1:5211     (Dev-Server oder `vite preview`)
 *   node scripts/verify-dashboard-switch.mjs --base=…                   (npm schluckt `--`-Argumente ⇒ direkt aufrufen)
 *
 * Headless-Chromium über CDP (scripts/lib/cdpBrowser.mjs), keine neue Abhängigkeit. Prüft im echten Browser:
 *   A  Karte → Dashboard: URL trägt `ansicht=dashboard`, alle übrigen Schlüssel und der Pfad bleiben; die Karte liegt
 *      unsichtbar und inert dahinter.
 *   B  kein GPU-Render-Loop hinter dem Dashboard: gezählte WebGL-Draw-Aufrufe über 3 s = 0 (Gegenprobe: auf der Karte > 0).
 *   C  Zeitraum wechseln schreibt `zeitraum=` per replaceState (kein neuer Verlaufseintrag).
 *   D  Dashboard → Karte: dasselbe Canvas-Element (Markierung überlebt) ⇒ keine Neu-Initialisierung; der Loop läuft wieder.
 *   E  Browser-Zurück/Vorwärts wechselt die Ansicht.
 *   F  Teilen-Link in frischem Kontext öffnet das Dashboard direkt (14 Tage), ohne die Karte zu montieren; erster Wechsel
 *      montiert sie, Zurück kehrt ins Dashboard. E-DB-20: das Karten-JS kommt erst nach der ersten Fusionsausgabe, im
 *      Hintergrund, sobald das ganze Fenster da ist; der Wechsel holt es nicht noch einmal.
 *   J  E-DB-20: Ortswahl auf der Startseite (gespeicherter Ort — derselbe `onSelect` wie die Suche) öffnet das Dashboard;
 *      Karten-JS danach im Hintergrund; der Umschalter zeigt die Karte am selben Ort.
 *   K  E-DB-20: Wechsel zur Karte, bevor ihr JS im Hintergrund da ist ⇒ Ladeanzeige, dann die Karte (Lazy-Weg).
 *   L  E-DB-20: ein Karten-Link holt MapView parallel zum Route-Chunk (Router-Loader), ohne Dashboard/Fusion.
 *   M  E-DB-24: Reiter „Überblick | Details" — Auswahl, URL `teil`, Verlauf, Pfeiltasten, Sprung aus dem Überblick,
 *      Details lädt erst nach dem Öffnen, geteilter Link, mobil 44 px.
 *   G  Kanonisierung: Standardwerte/ungültige Werte verschwinden aus der URL.
 *   H  /warnungen hat keinen Umschalter; mobil sitzt er in der Schwebeleiste mit 44-px-Trefferfläche.
 *   I  keine ungefangene Ausnahme während der Abläufe.
 */
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5211';
const PLACE = '/wetterkarte/wind/garmisch-partenkirchen';
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// WebGL-Draw-Zähler, vor jedem Skript der Seite installiert (keine App-Hilfe nötig).
const DRAW_COUNTER = `(() => {
  window.__dbDraws = 0;
  for (const P of [window.WebGLRenderingContext && WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) {
    if (!P) continue;
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const f = P[k]; if (typeof f !== 'function') continue;
      P[k] = function (...a) { window.__dbDraws++; return f.apply(this, a); };
    }
  }
})();`;

const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden'); process.exit(2); }
// Mit GPU-Rasterisierung per SwiftShader, damit MapLibre einen WebGL-Kontext bekommt.
const browser = await openBrowser(chrome, { timeoutMs: 90_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function page({ width = 1440, height = 900, mobile = false } = {}) {
  const ctx = await browser.newContext({ width, height, mobile });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: DRAW_COUNTER });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: RT_BUFFER });
  const errors = [];
  const off = browser.on((msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? msg.params.exceptionDetails?.text);
  });
  const go = async (path) => {
    const loaded = browser.waitFor((m) => m.sessionId === ctx.sessionId && m.method === 'Page.loadEventFired', 60_000);
    await ctx.send('Page.navigate', { url: BASE + path });
    await loaded;
  };
  const until = async (expr, ms = 30_000) => {
    const t = Date.now();
    while (Date.now() - t < ms) { if (await ctx.evaluate(expr).catch(() => false)) return true; await sleep(250); }
    return false;
  };
  const ev = (expr) => ctx.evaluate(expr);
  return { ctx, go, until, ev, errors, close: async () => { off(); await ctx.close(); } };
}

const loc = `location.pathname + location.search`;
const draws = async (p, ms) => { await p.ev('window.__dbDraws = 0, true'); await sleep(ms); return p.ev('window.__dbDraws'); };
// E-DB-20: Ladereihenfolge aus der Resource-Timing-API der Seite (dieselbe Zeitbasis wie die Messpunkte `dbd:fusion:*`).
// Der Puffer wird vor jedem Skript der Seite vergrößert — sonst fielen späte Einträge (das Karten-JS) nach 250 heraus.
const RT_BUFFER = `performance.setResourceTimingBufferSize(5000);`;
const res = (name) => `(() => { const e = performance.getEntriesByType('resource').filter((r) => /\\/assets\\/${name}-[\\w-]+\\.js$/.test(r.name)); return e.length ? { n: e.length, start: Math.round(e[0].startTime), end: Math.round(e[0].responseEnd) } : null; })()`;
const mark = (n) => `(performance.getEntriesByName('${n}')[0]?.startTime ?? null)`;
// Ein gespeicherter Ort auf der Startseite: derselbe `onSelect` wie die Suche, ohne Geocoding über das Netz.
const FAV_SEED = `try { localStorage.setItem('buscosun.favorites.v1', JSON.stringify([{ name: 'Garmisch-Partenkirchen', lat: 47.4917, lon: 11.0955, country: 'DE' }])); } catch (e) {}`;

// ---------------------------------------------------------------------------
// A–E Desktop, eine Sitzung
// ---------------------------------------------------------------------------
{
  const p = await page();
  await p.go(`${PLACE}?radar=0&z=9&lat=47.4917&lon=11.0955`);
  const mapReady = await p.until(`!!document.querySelector('.maplibregl-canvas') && !!document.querySelector('.mdk-topbar .vt-toggle')`, 45_000);
  add('(A) Karte lädt mit Umschalter „Dashboard | Karte" nach der Marke', mapReady && await p.ev(`(() => { const b = document.querySelector('.mdk-topbar .mdk-brand'); return b && b.nextElementSibling && b.nextElementSibling.classList.contains('vt-toggle'); })()`));
  await sleep(2500);
  const onMap = await draws(p, 2000);
  await p.ev(`document.querySelector('.maplibregl-canvas').dataset.dbMark = 'orig', true`);
  const before = await p.ev(loc);
  const histBefore = await p.ev('history.length');
  await p.ev(`document.querySelector('.mdk-topbar .vt-btn').click(), true`);
  const dashUp = await p.until(`!!document.querySelector('.dbd-root .dbd-top')`, 20_000);
  const after = await p.ev(loc);
  const u0 = new URL(BASE + before), u1 = new URL(BASE + after);
  const kept = [...u0.searchParams].every(([k, v]) => u1.searchParams.get(k) === v);
  add('(A) Umschalten ⇒ Dashboard sichtbar, URL trägt ansicht=dashboard, Pfad und alle übrigen Schlüssel bleiben (Ort, Kamera, radar)',
    dashUp && u1.pathname === u0.pathname && u1.searchParams.get('ansicht') === 'dashboard' && kept, `${before} → ${after}`);
  add('(A) Umschalten legt einen Verlaufseintrag an (push)', (await p.ev('history.length')) === histBefore + 1);
  const hidden = await p.ev(`(() => { const r = document.querySelector('.mdk-root'); return !!r && r.classList.contains('mdk-suspended') && getComputedStyle(r).visibility === 'hidden' && r.hasAttribute('inert'); })()`);
  add('(A) die Karte bleibt montiert, liegt unsichtbar und inert hinter dem Dashboard', hidden && (await p.ev(`document.querySelectorAll('.maplibregl-canvas').length`)) === 1);
  await sleep(800);
  const onDash = await draws(p, 3000);
  add('(B) kein GPU-Render-Loop hinter dem Dashboard: 0 WebGL-Draw-Aufrufe in 3 s (Gegenprobe Karte > 0)', onMap > 0 && onDash === 0, `Karte ${onMap} in 2 s · Dashboard ${onDash} in 3 s`);
  const h1 = await p.ev('history.length');
  await p.ev(`[...document.querySelectorAll('.dbd-seg button')].find((b) => b.textContent === '7 Tage').click(), true`);
  await sleep(900);
  const afterRange = await p.ev(loc);
  add('(C) Zeitraum 7 Tage ⇒ zeitraum=7-tage per replaceState (kein Verlaufseintrag), Ansicht bleibt', /zeitraum=7-tage/.test(afterRange) && /ansicht=dashboard/.test(afterRange) && (await p.ev('history.length')) === h1, afterRange);
  add('(C) 7 Tage ⇒ 7 Tageskarten', (await p.ev(`document.querySelectorAll('.dbd-day').length`)) === 7);
  await p.ev(`[...document.querySelectorAll('.dbd-top > .vt-toggle .vt-btn')].find((b) => b.textContent === 'Karte').click(), true`);
  const back = await p.until(`!document.querySelector('.dbd-root') && !document.querySelector('.mdk-root').classList.contains('mdk-suspended')`, 10_000);
  const afterKarte = await p.ev(loc);
  const same = await p.ev(`document.querySelectorAll('.maplibregl-canvas').length === 1 && document.querySelector('.maplibregl-canvas').dataset.dbMark === 'orig'`);
  add('(D) zurück zur Karte: URL ohne ansicht, Zeitraum und übrige Schlüssel bleiben', back && !/ansicht=/.test(afterKarte) && /zeitraum=7-tage/.test(afterKarte) && /radar=0/.test(afterKarte), afterKarte);
  add('(D) dasselbe Canvas-Element wie vor dem Wechsel ⇒ MapLibre nicht neu initialisiert', same);
  await sleep(600);
  const resumed = await draws(p, 2000);
  add('(D) der Render-Loop läuft nach dem Zurückwechseln wieder', resumed > 0, `${resumed} Draws in 2 s`);
  await p.ev('history.back(), true');
  const bk = await p.until(`!!document.querySelector('.dbd-root') && /ansicht=dashboard/.test(location.search)`, 10_000);
  add('(E) Browser-Zurück ⇒ wieder Dashboard (Karte bleibt dieselbe)', bk && await p.ev(`document.querySelector('.maplibregl-canvas').dataset.dbMark === 'orig'`));
  await p.ev('history.forward(), true');
  const fw = await p.until(`!document.querySelector('.dbd-root') && !/ansicht=/.test(location.search)`, 10_000);
  add('(E) Browser-Vorwärts ⇒ wieder Karte', fw);
  add('(I) keine ungefangene Ausnahme im Ablauf A–E', p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
  await p.close();
}

// ---------------------------------------------------------------------------
// F Teilen-Link, frischer Kontext
// ---------------------------------------------------------------------------
{
  const p = await page();
  await p.go(`${PLACE}?ansicht=dashboard&zeitraum=14-tage`);
  const up = await p.until(`!!document.querySelector('.dbd-root .dbd-day')`, 20_000);
  add('(F) Teilen-Link öffnet direkt das Dashboard mit 14 Tageskarten und aktivem „14 Tage"', up && (await p.ev(`document.querySelectorAll('.dbd-day').length`)) === 14
    && (await p.ev(`document.querySelector('.dbd-seg button.is-active').textContent`)) === '14 Tage');
  add('(F) die Karte wird für den Dashboard-Link nicht montiert (kein MapLibre-Canvas)', (await p.ev(`document.querySelectorAll('.maplibregl-canvas').length`)) === 0);
  const fus = await p.until(`/FUSION LIVE|FUSION · OHNE LERNSTUFE|FUSION FEHLER/.test(document.querySelector('.dbd-top-right .dbd-status')?.textContent ?? '')`, 45_000);
  const status = await p.ev(`document.querySelector('.dbd-top-right .dbd-status')?.textContent`);
  add('(F) buscosun Fusion antwortet im Dashboard (Status in der Kopfzeile)', fus && /FUSION LIVE|OHNE LERNSTUFE/.test(status), status);
  // Ein n.-v.-Element endet auf „n. v." bzw. „nicht verfügbar" — davor steht höchstens seine Beschriftung (z. B. „Blitze 1 h: ").
  const naBad = await p.ev(`[...document.querySelectorAll('[data-na="1"]')].filter((e) => !/(n\\. v\\.|nicht verfügbar)$/.test(e.textContent.trim())).map((e) => e.textContent).slice(0, 5)`);
  const naN = await p.ev(`document.querySelectorAll('[data-na="1"]').length`);
  add('(F) jedes als „nicht verfügbar" markierte Element endet auf „n. v."/„nicht verfügbar" — kein Wert', naBad.length === 0 && naN > 0, naBad.join(' | ') || `${naN} n.-v.-Elemente`);
  const origins = await p.ev(`[...document.querySelectorAll('.dbd-root [data-origin]')].every((e) => /^P\\d\\d$/.test(e.dataset.origin))`);
  add('(F) jeder gezeichnete Wert trägt seine Herkunft (data-origin P01–P88)', origins);
  // E-DB-20: erst das Dashboard, dann das Karten-JS im Hintergrund — montiert wird die Karte erst beim Wechsel.
  const bg = await p.until(`!!${res('MapView')}`, 40_000);
  const t = await p.ev(`({ first: ${mark('dbd:fusion:first')}, core: ${mark('dbd:fusion:core')}, mv: ${res('MapView')}, canvases: document.querySelectorAll('.maplibregl-canvas').length })`);
  const firstOut = t.first ?? t.core;
  add('(F) E-DB-20: das Karten-JS (MapView) wird erst nach der ersten Fusionsausgabe angefordert', bg && firstOut != null && t.mv.start > firstOut, JSON.stringify(t));
  add('(F) E-DB-20: danach lädt es im Hintergrund, sobald das ganze Fenster da ist — die Karte bleibt unmontiert', bg && t.mv.start >= (t.core ?? firstOut) && t.canvases === 0, JSON.stringify(t));
  await p.ev(`[...document.querySelectorAll('.dbd-top > .vt-toggle .vt-btn')].find((b) => b.textContent === 'Karte').click(), true`);
  const mounted = await p.until(`!!document.querySelector('.maplibregl-canvas')`, 30_000);
  add('(F) erster Wechsel zur Karte montiert sie', mounted);
  add('(F) E-DB-20: der Wechsel holt das Karten-JS nicht noch einmal (ein Abruf, aus dem Hintergrund)', (await p.ev(res('MapView')))?.n === 1);
  await p.ev(`document.querySelector('.maplibregl-canvas').dataset.dbMark = 'first', true`);
  await p.ev('history.back(), true');
  const bk = await p.until(`!!document.querySelector('.dbd-root') && /zeitraum=14-tage/.test(location.search)`, 10_000);
  add('(F) Zurück ⇒ Dashboard mit 14 Tagen; die Karte bleibt montiert (dasselbe Canvas)', bk && await p.ev(`document.querySelector('.maplibregl-canvas')?.dataset.dbMark === 'first'`));
  add('(I) keine ungefangene Ausnahme im Ablauf F', p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
  await p.close();
}

// ---------------------------------------------------------------------------
// J Ortswahl auf der Startseite ⇒ Dashboard (E-DB-20) · L Karten-Link holt MapView parallel zum Route-Chunk
// ---------------------------------------------------------------------------
{
  const p = await page();
  await p.ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: FAV_SEED });
  await p.go('/');
  const favUp = await p.until(`!!document.querySelector('.deck-fav-open')`, 20_000);
  const histBefore = await p.ev('history.length');
  // Die Startseite wärmt MapView selbst im Leerlauf vor (SearchPage, „während der Nutzer sucht") — maßgeblich ist, ob
  // NACH der Ortswahl vor der ersten Fusionsausgabe Karten-JS angefragt wird.
  if (favUp) await p.ev(`window.__dbClickAt = performance.now(), document.querySelector('.deck-fav-open').click(), true`);
  const inDash = await p.until(`!!document.querySelector('.dbd-root') && /ansicht=dashboard/.test(location.search)`, 20_000);
  const url = await p.ev(loc);
  add('(J) E-DB-20: Ortswahl auf der Startseite öffnet das Dashboard am Ort (Pfad mit Layer und Ort, ansicht=dashboard, push)',
    favUp && inDash && /^\/wetterkarte\/wind\/[\w-]+\?(?:[^#]*&)?ansicht=dashboard$/.test(url) && (await p.ev('history.length')) === histBefore + 1, url);
  add('(J) E-DB-20: die Karte ist dabei nicht montiert', (await p.ev(`document.querySelectorAll('.maplibregl-canvas').length`)) === 0);
  const bg = await p.until(`!!${res('MapView')} && ${mark('dbd:fusion:core')} != null`, 40_000);
  const t = await p.ev(`({ click: Math.round(window.__dbClickAt), first: ${mark('dbd:fusion:first')}, core: ${mark('dbd:fusion:core')}, mv: ${res('MapView')} })`);
  const out1 = t.first ?? t.core;
  add('(J) E-DB-20: zwischen Ortswahl und erster Fusionsausgabe wird kein Karten-JS angefragt (davor: Leerlauf-Vorwärmen der Startseite)',
    bg && out1 != null && (t.mv.start < t.click || t.mv.start > out1), JSON.stringify(t));
  await p.ev(`[...document.querySelectorAll('.dbd-top > .vt-toggle .vt-btn')].find((b) => b.textContent === 'Karte')?.click(), true`);
  const onMap = inDash && await p.until(`!!document.querySelector('.maplibregl-canvas') && !document.querySelector('.dbd-root') && !/ansicht=/.test(location.search)`, 30_000);
  add('(J) Umschalter ⇒ die Karte am selben Ort (Pfad bleibt, ohne ansicht)', onMap && (await p.ev('location.pathname')) === new URL(BASE + url).pathname);
  add('(I) keine ungefangene Ausnahme im Ablauf J', p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
  await p.close();
}
{
  // K: Wechsel zur Karte, BEVOR das Karten-JS im Hintergrund da ist ⇒ Ladeanzeige (AppLoader), dann die Karte.
  const p = await page();
  await p.go(`${PLACE}?ansicht=dashboard`);
  await p.until(`!!document.querySelector('.dbd-top > .vt-toggle .vt-btn')`, 20_000);
  const before = await p.ev(res('MapView'));
  await p.ev(`[...document.querySelectorAll('.dbd-top > .vt-toggle .vt-btn')].find((b) => b.textContent === 'Karte')?.click(), true`);
  const mounted = await p.until(`!!document.querySelector('.maplibregl-canvas') && !document.querySelector('.dbd-root')`, 45_000);
  add('(K) E-DB-20: Wechsel zur Karte vor dem Hintergrund-Laden (Karten-JS noch nicht angefragt) ⇒ die Karte kommt trotzdem',
    before == null && mounted && (await p.ev(res('MapView')))?.n === 1, JSON.stringify({ before }));
  add('(I) keine ungefangene Ausnahme im Ablauf K', p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
  await p.close();
}
{
  const p = await page();
  await p.go(`${PLACE}?radar=0`);
  const up = await p.until(`!!document.querySelector('.maplibregl-canvas')`, 45_000);
  const r = await p.ev(res('WetterkarteRoute'));
  const mv = await p.ev(res('MapView'));
  add('(L) E-DB-20: ein Karten-Link holt MapView parallel zum Route-Chunk (Anfrage vor dessen Ende), nicht danach',
    up && !!r && !!mv && mv.start <= r.end, JSON.stringify({ route: r, mapView: mv }));
  add('(L) … und lädt dabei weder Dashboard noch Fusion', (await p.ev(res('DashboardView'))) == null && (await p.ev(res('forecastStore'))) == null);
  add('(I) keine ungefangene Ausnahme im Ablauf L', p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
  await p.close();
}

// ---------------------------------------------------------------------------
// M Reiter „Überblick | Details" (E-DB-24)
// ---------------------------------------------------------------------------
{
  const p = await page();
  await p.go(`${PLACE}?ansicht=dashboard`);
  await p.until(`!!performance.getEntriesByName('dbd:fusion:core')[0] || !!performance.getEntriesByName('dbd:fusion:final')[0]`, 45_000);
  await sleep(3000); // Staffel 3 hätte längst geladen, wenn die Kacheln sichtbar wären
  const tabs = await p.ev(`(() => { const t = [...document.querySelectorAll('.dbd-tablist [role="tab"]')]; return t.map((b) => ({ id: b.id, text: b.textContent, sel: b.getAttribute('aria-selected'), tab: b.tabIndex })); })()`);
  const vis = (sel) => `(() => { const e = document.querySelector('${sel}'); return !!e && e.getClientRects().length > 0; })()`;
  add('(M) E-DB-24: Reiter „Überblick | Details" unter dem Kopf, Überblick gewählt (aria-selected, roving tabindex)',
    tabs.length === 2 && tabs[0].text === 'Überblick' && tabs[1].text === 'Details' && tabs[0].sel === 'true' && tabs[1].sel === 'false' && tabs[0].tab === 0 && tabs[1].tab === -1, JSON.stringify(tabs));
  add('(M) Überblick zeigt Reihe 1 und Prognose, Details (Radar, Bewölkung, Wind, Gelände, UV, Pollen, ICON-D2) ist verborgen',
    (await p.ev(vis('#dbd-panel-ueberblick .dbd-row1'))) && (await p.ev(vis('#dbd-panel-ueberblick .dbd-zone'))) && !(await p.ev(vis('#dbd-panel-details .dbd-row3'))) && !(await p.ev(vis('#dbd-panel-details .dbd-terrain'))));
  const ncBusyBefore = await p.ev(`!!document.querySelector('#dbd-panel-details .dbd-nowcast-line .dbd-loading')`);
  add('(M) Details lädt nicht, solange der Überblick offen ist (Radar-Zeile steht 3 s nach der Vorhersage noch auf „lädt")', ncBusyBefore);
  const h0 = await p.ev('history.length');
  await p.ev(`window.scrollTo(0, 400), true`);
  await p.ev(`document.getElementById('dbd-tab-details').click(), true`);
  const onDetails = await p.until(`${vis('#dbd-panel-details .dbd-row3')} && !${vis('#dbd-panel-ueberblick .dbd-row1')}`, 5000);
  const urlD = await p.ev(loc);
  add('(M) Details: URL trägt teil=details (nach ansicht), ein Verlaufseintrag, Seite springt an den Anfang',
    onDetails && /ansicht=dashboard(&zeitraum=[^&]+)?&teil=details$/.test(urlD) && (await p.ev('history.length')) === h0 + 1 && (await p.ev('window.scrollY')) === 0, urlD);
  const loaded = await p.until(`!document.querySelector('#dbd-panel-details .dbd-nowcast-line .dbd-loading')`, 25_000);
  add('(M) nach dem Öffnen lädt Details (Radar-Zeile mit Wert oder „nicht verfügbar")', loaded);
  await p.ev('history.back(), true');
  const backO = await p.until(`${vis('#dbd-panel-ueberblick .dbd-row1')} && !/teil=/.test(location.search)`, 8000);
  add('(M) Zurück ⇒ Überblick, teil verschwindet aus der URL', backO);
  await p.ev(`document.getElementById('dbd-tab-ueberblick').focus(), true`);
  await p.ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await p.ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  const byKey = await p.until(`/teil=details/.test(location.search) && document.activeElement?.id === 'dbd-tab-details'`, 5000);
  add('(M) Pfeiltaste → wechselt den Reiter und setzt den Fokus mit', byKey);
  await p.ev(`document.getElementById('dbd-tab-ueberblick').click(), true`);
  await p.until(vis('#dbd-panel-ueberblick .dbd-more'), 5000);
  await p.ev(`document.querySelector('#dbd-panel-ueberblick .dbd-more').click(), true`);
  add('(M) „Mehr zur Lage am Ort" am Ende des Überblicks öffnet Details', await p.until(`/teil=details/.test(location.search) && ${vis('#dbd-panel-details .dbd-row3')}`, 5000));
  add('(I) keine ungefangene Ausnahme im Ablauf M', p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
  await p.close();
  // Geteilter Link auf Details, mobil: Reiter volle Breite mit 44-px-Trefferfläche.
  const m = await page({ width: 402, height: 874, mobile: true });
  await m.go(`${PLACE}?ansicht=dashboard&zeitraum=7-tage&teil=details`);
  const upM = await m.until(vis('#dbd-panel-details .dbd-row3'), 20_000);
  const tabBox = await m.ev(`(() => { const t = [...document.querySelectorAll('.dbd-tablist [role="tab"]')].map((b) => b.getBoundingClientRect()); return { h: Math.min(...t.map((r) => r.height)), w: t.map((r) => Math.round(r.width)) }; })()`);
  add('(M) geteilter Link mit teil=details öffnet Details direkt; mobil zwei gleich breite Reiter ≥ 44 px',
    upM && (await m.ev(`document.getElementById('dbd-tab-details').getAttribute('aria-selected')`)) === 'true' && tabBox.h >= 44 && Math.abs(tabBox.w[0] - tabBox.w[1]) <= 1, JSON.stringify(tabBox));
  add('(I) keine ungefangene Ausnahme (M mobil)', m.errors.length === 0, m.errors.slice(0, 3).join(' | '));
  await m.close();
}

// ---------------------------------------------------------------------------
// G Kanonisierung · H /warnungen und mobil
// ---------------------------------------------------------------------------
{
  const p = await page();
  await p.go(`${PLACE}?ansicht=karte&zeitraum=3-tage&teil=ueberblick&radar=0`);
  await p.until(`!!document.querySelector('.mdk-topbar')`, 30_000);
  await sleep(500);
  const s = await p.ev('location.search');
  add('(G) Standard- bzw. ungültige Werte (ansicht=karte, zeitraum=3-tage, teil=ueberblick) verschwinden aus der URL, der Rest bleibt', !/ansicht=|zeitraum=|teil=/.test(s) && /radar=0/.test(s), s);
  await p.go('/warnungen');
  await p.until(`!!document.querySelector('.mdk-topbar')`, 30_000);
  add('(H) /warnungen hat keinen Umschalter (Dashboard nur auf der Wetterkarte, E-DB-4)', (await p.ev(`document.querySelectorAll('.vt-toggle').length`)) === 0);
  await p.close();
  const m = await page({ width: 402, height: 874, mobile: true });
  await m.go(`${PLACE}`);
  await m.until(`!!document.querySelector('.mdk-m-topfloat .mdk-m-viewtoggle')`, 30_000);
  const hit = await m.ev(`(() => {
    const b = document.querySelector('.mdk-m-viewtoggle .vt-btn');
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top - 5);
    const bot = document.elementFromPoint(r.left + r.width / 2, r.bottom + 5);
    return { h: r.height, ext: top === b && bot === b, pill: document.querySelector('.mdk-m-modelpill')?.getBoundingClientRect().top ?? null, bar: document.querySelector('.mdk-m-viewtoggle').getBoundingClientRect().bottom };
  })()`);
  add('(H) mobil: Umschalter in der Schwebeleiste, Trefferfläche ≥ 44 px (sichtbar 32 px + je 6 px), Modell-Pille darunter',
    hit.ext && hit.h + 12 >= 44 && (hit.pill == null || hit.pill >= hit.bar), JSON.stringify(hit));
  await m.ev(`document.querySelector('.mdk-m-viewtoggle .vt-btn').click(), true`);
  const mdash = await m.until(`!!document.querySelector('.dbd-root')`, 20_000);
  const mseg = await m.ev(`(() => { const b = document.querySelector('.dbd-top > .vt-mobile .vt-btn'); return b ? getComputedStyle(b.parentElement).display : null; })()`);
  add('(H) mobil ⇒ Dashboard mit Umschalter volle Breite unter der Suche', mdash && mseg === 'flex');
  add('(I) keine ungefangene Ausnahme (G/H)', m.errors.length === 0 && p.errors.length === 0, [...p.errors, ...m.errors].slice(0, 3).join(' | '));
  await m.close();
}

await browser.close();
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'OK   ' : 'FAIL '} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
if (failed) { console.log(`${failed} FEHLGESCHLAGEN.`); process.exit(1); }
