/**
 * dashboard-latency.mjs — Latenz des Dashboards und des Karten-Einstiegs (Phase DB, audit/dashboard.md §5.3/§9).
 *
 *   node scripts/dashboard-latency.mjs --cur=http://127.0.0.1:5222 [--head=http://127.0.0.1:5221] [--n=5] [--profiles=desktop,mobile4g]
 *
 * Produktions-Builds über `vite preview`. Je Lauf ein frischer Browser-Kontext (kalter Browser-Cache, leere IndexedDB) —
 * dieselbe Definition „kalt" wie AP12 (§9.14). Innerhalb EINES Browser-Laufs, Varianten abwechselnd (Leistungsanker:
 * nur innerhalb eines Laufs vergleichen). Ein erster Aufruf je Profil wärmt die Verbindung (`prime`) und zählt nicht.
 *
 *   Karte   ms bis zum ersten WebGL-Draw auf `/wetterkarte/wind/<ort>` — head (vor Phase DB) gegen cur.
 *   Dashboard  ms bis zur ersten Fusion-Ausgabe im Dashboard (`performance.mark('dbd:fusion:first'|…)`) für den
 *              Deep-Link `?ansicht=dashboard`, dazu `core` (ganzes Fenster) und die erste Darstellung der Tageskarten.
 */
import { openBrowser, findHeadlessChrome, NET_PROFILES } from './lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const CUR = args.cur ?? 'http://127.0.0.1:5222';
const HEAD = args.head ?? null;
const N = Number(args.n ?? 5);
const PATH = args.path ?? '/wetterkarte/wind/garmisch-partenkirchen';
const PROFILES = (args.profiles ?? 'desktop,mobile4g').split(',');
const ONLY = args.only ?? 'map,dash';
const CUR_FIRST = !!args['cur-first'];
const PROF = {
  desktop: { width: 1440, height: 900, mobile: false, net: null, cpu: 1 },
  mobile4g: { width: 402, height: 874, mobile: true, net: NET_PROFILES.fast4g, cpu: 4 },
};
const FIRST_DRAW = `(() => { window.__firstDraw = null; for (const P of [window.WebGLRenderingContext && WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) { if (!P) continue; for (const k of ['drawArrays', 'drawElements']) { const f = P[k]; P[k] = function (...a) { if (window.__firstDraw == null) window.__firstDraw = performance.now(); return f.apply(this, a); }; } } })();`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : null; };

const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 120_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function run(base, path, prof, kind) {
  const ctx = await browser.newContext({ width: prof.width, height: prof.height, mobile: prof.mobile, net: prof.net, cpu: prof.cpu });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: FIRST_DRAW });
  await ctx.send('Page.navigate', { url: base + path });
  const t0 = Date.now();
  let out = null;
  while (Date.now() - t0 < 60_000) {
    await sleep(100);
    const r = await ctx.evaluate(kind === 'map'
      ? `window.__firstDraw`
      : `(() => { const m = (n) => performance.getEntriesByName(n)[0]?.startTime ?? null; const first = m('dbd:fusion:first') ?? m('dbd:fusion:core') ?? m('dbd:fusion:final'); return first == null ? null : { first, core: m('dbd:fusion:core') ?? m('dbd:fusion:final'), update: m('dbd:fusion:update'), start: m('dbd:fusion:start'), route: performance.getEntriesByType('resource').find((r) => /WetterkarteRoute-/.test(r.name))?.responseEnd ?? null, view: performance.getEntriesByType('resource').find((r) => /DashboardView-.*\.js/.test(r.name))?.responseEnd ?? null }; })()`).catch(() => null);
    if (r != null) { out = r; if (kind === 'map' || out.core != null) break; }
  }
  if (kind === 'dash' && out && out.core == null) { await sleep(3000); out = await ctx.evaluate(`(() => { const m = (n) => performance.getEntriesByName(n)[0]?.startTime ?? null; return { first: m('dbd:fusion:first') ?? m('dbd:fusion:core'), core: m('dbd:fusion:core') ?? m('dbd:fusion:final'), update: m('dbd:fusion:update') }; })()`).catch(() => out); }
  const bytes = ctx.requests().reduce((s, r) => s + (r.bytes ?? 0), 0);
  await ctx.close();
  return { v: out, kb: Math.round(bytes / 1024) };
}

const res = {};
for (const pn of PROFILES) {
  const prof = PROF[pn];
  await run(CUR, PATH, prof, 'map'); // prime
  if (HEAD) await run(HEAD, PATH, prof, 'map');
  const map = { head: [], cur: [] };
  const dash = [];
  for (let i = 0; i < N; i++) {
    if (ONLY.includes('map')) {
      // Reihenfolge wählbar (`--cur-first`), damit ein Reihenfolge-Effekt sichtbar wird.
      const order = CUR_FIRST ? ['cur', 'head'] : ['head', 'cur'];
      for (const v of order) {
        if (v === 'head' && HEAD) map.head.push((await run(HEAD, PATH, prof, 'map')).v);
        if (v === 'cur') map.cur.push((await run(CUR, PATH, prof, 'map')).v);
      }
    }
    if (ONLY.includes('dash')) {
      const d = await run(CUR, `${PATH}?ansicht=dashboard`, prof, 'dash');
      dash.push({ ...(d.v ?? {}), kb: d.kb });
    }
  }
  const r = (xs) => xs.filter((x) => x != null).map((x) => Math.round(x));
  res[pn] = {
    mapHead: HEAD ? { p50: q(r(map.head), 0.5), p95: q(r(map.head), 0.95), all: r(map.head) } : null,
    mapCur: { p50: q(r(map.cur), 0.5), p95: q(r(map.cur), 0.95), all: r(map.cur) },
    dashFirst: { p50: q(r(dash.map((d) => d.first)), 0.5), p95: q(r(dash.map((d) => d.first)), 0.95), all: r(dash.map((d) => d.first)) },
    dashCore: { p50: q(r(dash.map((d) => d.core)), 0.5), all: r(dash.map((d) => d.core)) },
    dashKb: dash.map((d) => d.kb),
    dashBreakdown: dash.map((d) => ({ route: d.route != null ? Math.round(d.route) : null, view: d.view != null ? Math.round(d.view) : null, start: d.start != null ? Math.round(d.start) : null, first: d.first != null ? Math.round(d.first) : null })),
  };
  console.log(pn, JSON.stringify(res[pn]));
}
await browser.close();
console.log(JSON.stringify(res, null, 1));
