/**
 * buscosun Load-Monitor — live in der Browser-Konsole ausgeben, WORAN der Browser
 * gerade lädt (in Prozent), plus was aktuell in-flight ist.
 *
 * Nutzung:
 *   1) Cold messen: DevTools → Network → "Disable cache" anhaken.
 *   2) Diesen Block VOR dem Reload in die Konsole einfügen und Enter drücken,
 *      dann die Seite neu laden (F5).  ODER: als Snippet unter
 *      DevTools → Sources → Snippets speichern und "Run" vor dem Reload.
 *   3) Der Monitor loggt alle 500 ms eine Prozent-Verteilung und beim `load`-
 *      Event + ~4 s danach (Map-Render-Tail) eine Endverteilung.
 *
 * Kategorien: MapLibre-Lib · App-JS · CSS · Basemap-Tiles · DEM · Daten (BrightSky/
 * GeoSphere/MeteoSwiss/DWD). "JS/Render" = Main-Thread-Zeit aus Long-Tasks.
 */
(() => {
  if (window.__bsLoadMon) { console.warn('[loadmon] läuft bereits'); return; }
  window.__bsLoadMon = true;
  const t0 = performance.now();
  const cat = (u) => {
    if (!u) return 'other';
    if (u.includes('maplibre')) return 'MapLibre (lib)';
    if (u.includes('openfreemap') || u.includes('/tiles/') || u.includes('sprites') || u.includes('/planet') || u.includes('/styles/')) return 'Basemap-Tiles';
    if (u.includes('elevation-tiles')) return 'DEM (Höhe)';
    if (u.includes('brightsky')) return 'Daten: BrightSky';
    if (u.includes('geosphere')) return 'Daten: GeoSphere';
    if (u.includes('geo.admin')) return 'Daten: MeteoSwiss';
    if (u.includes('_dwd_opendata') || u.includes('icon-d2') || u.includes('/rv/') || u.includes('radolan')) return 'Daten: DWD';
    if (/\/assets\/.*\.js/.test(u) || u.endsWith('.js')) return 'App-JS';
    if (u.endsWith('.css')) return 'CSS';
    return 'other';
  };
  const netTime = {}, inflight = {};
  let jsTime = 0;
  const addNet = (u, d) => { const c = cat(u); netTime[c] = (netTime[c] || 0) + d; };
  const openReq = (u) => { const c = cat(u); inflight[c] = (inflight[c] || 0) + 1; };
  const closeReq = (u) => { const c = cat(u); if (inflight[c]) inflight[c]--; };

  // fetch + XHR hooken → "gerade in-flight" pro Kategorie
  const of = window.fetch;
  window.fetch = function (...a) { const u = (a[0] && a[0].url) || String(a[0]); openReq(u); return of.apply(this, a).finally(() => closeReq(u)); };
  const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return oo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () { openReq(this.__u); this.addEventListener('loadend', () => closeReq(this.__u)); return os.apply(this, arguments); };

  // Ressourcen-Download-Dauer + Long-Tasks (Main-Thread blockiert)
  new PerformanceObserver((l) => { for (const e of l.getEntries()) addNet(e.name, e.duration); }).observe({ type: 'resource', buffered: true });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) jsTime += e.duration; }).observe({ type: 'longtask', buffered: true }); } catch { /* Safari */ }

  const pct = (v, tot) => (tot ? Math.round((v / tot) * 100) : 0);
  const snapshot = () => {
    const parts = { ...netTime, 'JS/Render (Main-Thread)': jsTime };
    const tot = Object.values(parts).reduce((a, b) => a + b, 0);
    return { parts, tot, ranked: Object.entries(parts).sort((a, b) => b[1] - a[1]) };
  };
  const tick = () => {
    const el = ((performance.now() - t0) / 1000).toFixed(1);
    const { tot, ranked } = snapshot();
    const line = ranked.filter(([, v]) => v > 0).map(([k, v]) => `${pct(v, tot)}% ${k}`).join(' | ');
    const inf = Object.entries(inflight).filter(([, n]) => n > 0).map(([k, n]) => `${n}× ${k}`).join(', ') || 'nichts';
    console.log(`%c⏳ ${el}s  [${line}]  in-flight: ${inf}`, 'color:#C97B47');
  };
  const iv = setInterval(tick, 500);

  let done = false;
  const finish = (label) => {
    if (done) return; done = true;
    // 4 s nach load weiterlaufen → Map-Render-/Datencompute-Tail einfangen
    setTimeout(() => {
      clearInterval(iv); tick();
      const { tot, ranked } = snapshot();
      console.log(`%c✅ ${label} + 4s Tail nach ${((performance.now() - t0) / 1000).toFixed(1)}s — Endverteilung:`, 'color:#2E7D32;font-weight:bold');
      for (const [k, v] of ranked) if (v > 0) console.log(`   ${String(pct(v, tot)).padStart(3)}%  ${k}  (${Math.round(v)}ms)`);
      window.__bsLoadMon = false;
    }, 4000);
  };
  if (document.readyState === 'complete') finish('bereits geladen');
  else window.addEventListener('load', () => finish('window.load'));
  console.log('%c[loadmon] aktiv — jetzt neu laden für einen sauberen Durchlauf', 'color:#C97B47');
})();
