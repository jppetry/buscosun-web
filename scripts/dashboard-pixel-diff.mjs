/**
 * dashboard-pixel-diff.mjs — Pixel-Diff des Wetter-Dashboards gegen die Vorlagen (Phase DB, audit/dashboard.md §5.7).
 *
 * Werkzeug (E-DB-15, Jans Entscheidung 29.09.): KEIN Playwright als neue Abhängigkeit — derselbe CDP-Weg wie
 * `verify-pv-latency.mjs` (`scripts/lib/cdpBrowser.mjs`, lokaler `chrome-headless-shell` aus dem ms-playwright-Ordner)
 * und der strenge PNG-Dekoder `scripts/lib/png.mjs`.
 *
 * Ablauf je Größe (Desktop 1440 · Tablet 1024 · Mobile 402, Vorlagen bei DPR 2):
 *   1. Dashboard im Entwicklungsmodus mit `?dbfixture=vorlage` öffnen (Zahlen der Vorlage durch dieselben Kacheln),
 *      Viewport = Breite der Vorlage, deviceScaleFactor 2, ganze Seitenhöhe.
 *   2. Aufnahme gegen die Vorlage legen. Zwei Ausrichtungen:
 *        A „Viewport"   — gleiche Pixelkoordinaten, Viewport exakt so breit wie die Vorlage (Auftrag).
 *        B „Innenfläche" — die Vorlage ist eine Karte auf einer Leinwand (1-px-Rahmen, runde Ecken); ihre Innenfläche
 *          ist 2 px schmaler. B rendert mit Breite − 2 und legt die Aufnahme auf die Innenfläche. Mobil zusätzlich ohne
 *          die iOS-Statusleiste (44 px, Geräteschale, nicht App).
 *   3. |ΔRGB| > 12 in einem Kanal ⇒ abweichend (Schwelle wie audit/waldbrand-ui/map-pixel-parity.json). Ausgabe:
 *      Differenzbild, Anteil je Modul (Bänder aus den Kachel-Rechtecken der App), JSON-Bericht.
 *
 *   node scripts/dashboard-pixel-diff.mjs --base=http://127.0.0.1:5211 --out=<Ordner> [--only=desktop,tablet,mobile] [--live]
 * `--live` nimmt statt der Fixture die echten Daten (nur Aufnahmen, kein Diff — Wetter ist nicht pixelgleich).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';
import { decodePng, encodePng, toRgba } from './lib/png.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5211';
const OUT = args.out ?? join(process.cwd(), 'audit', 'dashboard', 'pixel');
const LIVE = !!args.live;
const ONLY = (args.only ?? 'desktop,tablet,mobile').split(',');
const PATH = args.path ?? '/wetterkarte/wind/garmisch-partenkirchen';
const THRESH = 12;

const SIZES = [
  { name: 'desktop', width: 1440, ref: 'reference/desktop.png', mobile: false, statusBar: 0 },
  { name: 'tablet', width: 1024, ref: 'reference/tablet.png', mobile: false, statusBar: 0 },
  { name: 'mobile', width: 402, ref: 'reference/mobile.png', mobile: true, statusBar: 44 },
];

mkdirSync(OUT, { recursive: true });
const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden (OG_CHROME setzen)'); process.exit(2); }
const browser = await openBrowser(chrome, { timeoutMs: 90_000 });

async function shoot(size, width) {
  const url = `${BASE}${PATH}?ansicht=dashboard${LIVE ? '' : '&dbfixture=vorlage'}`;
  const ctx = await browser.newContext({ width, height: 900, mobile: size.mobile });
  await ctx.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 2, mobile: size.mobile });
  await ctx.send('Page.navigate', { url });
  const deadline = Date.now() + (LIVE ? 45_000 : 20_000);
  let ready = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400));
    ready = await ctx.evaluate(`(() => {
      const d = document.querySelector('.dbd-root .dbd-day');
      const chart = document.querySelector('.dbd-hourly-chart svg');
      const busy = document.querySelectorAll('.dbd-root [aria-busy="true"]').length;
      return !!d && !!chart && (${LIVE ? 'busy === 0' : 'true'});
    })()`).catch(() => false);
    if (ready) break;
  }
  await ctx.evaluate('document.fonts.ready.then(() => true)');
  // Der Chip „Über diese Ansicht" (RouteSeoBlock) ist ein globales Element jeder Route, nicht Teil der Vorlage.
  await ctx.evaluate(`(() => { const e = document.querySelector('.rsb'); if (e) e.style.display = 'none'; return true; })()`);
  await new Promise((r) => setTimeout(r, 600));
  const h = await ctx.evaluate('Math.ceil(document.documentElement.scrollHeight)');
  await ctx.send('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: 2, mobile: size.mobile });
  await new Promise((r) => setTimeout(r, 700));
  const boxes = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('.dbd-top, .dbd-row1 > section, .dbd-zone, .dbd-day, .dbd-hourly, .dbd-row3 > section, .dbd-terrain, .dbd-row5 > section, .dbd-footer')]
    .map((e) => { const r = e.getBoundingClientRect(); return { name: (e.getAttribute('aria-label') || e.className.split(' ')[0]), x: r.x, y: r.y + window.scrollY, w: r.width, h: r.height }; }))`);
  const shot = await ctx.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const png = Buffer.from(shot.data, 'base64');
  await ctx.close();
  return { png, boxes: JSON.parse(boxes), cssHeight: h, ready };
}

function diff(ref, got, ox, oy, skipTopCss) {
  // Vergleicht got[x, y] mit ref[x + ox, y + oy] (Gerätepixel), soweit beide Bilder reichen; transparente Vorlagenpixel
  // (Leinwand-Ecken) zählen nicht.
  const w = Math.min(got.width, ref.width - ox);
  const h = Math.min(got.height, ref.height - oy);
  const out = new Uint8Array(w * h * 4);
  let n = 0, bad = 0;
  const rowsBad = new Uint32Array(h);
  const rowsN = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gi = (y * got.width + x) * 4;
      const ri = ((y + oy) * ref.width + (x + ox)) * 4;
      const o = (y * w + x) * 4;
      if (ref.data[ri + 3] < 250) { out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = 255; continue; }
      n++; rowsN[y]++;
      const d = Math.max(Math.abs(ref.data[ri] - got.data[gi]), Math.abs(ref.data[ri + 1] - got.data[gi + 1]), Math.abs(ref.data[ri + 2] - got.data[gi + 2]));
      if (d > THRESH) { bad++; rowsBad[y]++; out[o] = 220; out[o + 1] = 30; out[o + 2] = 30; out[o + 3] = 255; }
      else { const g = Math.round((got.data[gi] + got.data[gi + 1] + got.data[gi + 2]) / 3); out[o] = out[o + 1] = out[o + 2] = 170 + Math.round(g / 3); out[o + 3] = 255; }
    }
  }
  return { w, h, n, bad, pct: n ? (100 * bad) / n : 0, img: out, rowsBad, rowsN, heightRef: ref.height - oy, heightGot: got.height, skipTopCss };
}

/**
 * Modulweise ausgerichtet: je Kachel-Rechteck (App) den senkrechten Versatz dy ∈ [−200, 200] css px suchen, bei dem die
 * Vorlage am besten passt, und dort messen. Trennt „Kachel liegt tiefer, weil darüber ein Text umbricht" von
 * „Kachel sieht anders aus". ox/oy wie in `diff` (Gerätepixel), Suche auf jedem dritten Pixel.
 */
function moduleAligned(ref, got, ox, oy, boxes) {
  const out = [];
  const px = (img, x, y) => (y * img.width + x) * 4;
  const mism = (a, b) => Math.max(Math.abs(ref.data[a] - got.data[b]), Math.abs(ref.data[a + 1] - got.data[b + 1]), Math.abs(ref.data[a + 2] - got.data[b + 2])) > THRESH;
  for (const b of boxes) {
    const x0 = Math.max(0, Math.round(b.x * 2)), x1 = Math.min(got.width, Math.round((b.x + b.w) * 2));
    const y0 = Math.max(0, Math.round(b.y * 2)), y1 = Math.min(got.height, Math.round((b.y + b.h) * 2));
    if (x1 <= x0 || y1 <= y0) continue;
    let best = { dy: 0, bad: Infinity, n: 0 };
    for (let dyc = -200; dyc <= 200; dyc++) {
      const dy = dyc * 2;
      let n = 0, bad = 0;
      for (let y = y0; y < y1; y += 3) {
        const ry = y + oy + dy;
        if (ry < 0 || ry >= ref.height) continue;
        for (let x = x0; x < x1; x += 3) {
          const rx = x + ox;
          if (rx >= ref.width) continue;
          const ri = px(ref, rx, ry);
          if (ref.data[ri + 3] < 250) continue;
          n++; if (mism(ri, px(got, x, y))) bad++;
        }
      }
      if (n > (x1 - x0) * (y1 - y0) / 30 && bad / n < best.bad / Math.max(1, best.n)) best = { dy: dyc, bad, n };
    }
    let n = 0, bad = 0;
    for (let y = y0; y < y1; y++) {
      const ry = y + oy + best.dy * 2;
      if (ry < 0 || ry >= ref.height) continue;
      for (let x = x0; x < x1; x++) {
        const rx = x + ox; if (rx >= ref.width) continue;
        const ri = px(ref, rx, ry); if (ref.data[ri + 3] < 250) continue;
        n++; if (mism(ri, px(got, x, y))) bad++;
      }
    }
    out.push({ module: b.name, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), dy: best.dy, pct: n ? +((100 * bad) / n).toFixed(1) : null });
  }
  return out;
}

const report = { at: new Date().toISOString(), base: BASE, path: PATH, mode: LIVE ? 'live' : 'fixture', threshold: THRESH, sizes: [] };
for (const size of SIZES.filter((s) => ONLY.includes(s.name))) {
  const entry = { name: size.name, width: size.width };
  // A — Viewport = Vorlagenbreite, gleiche Koordinaten (Mobil: Statusleiste der Vorlage übersprungen).
  const a = await shoot(size, size.width);
  writeFileSync(join(OUT, `${size.name}-A.png`), a.png);
  entry.A = { cssHeight: a.cssHeight, ready: a.ready };
  if (!LIVE) {
    const ref = (() => { const d = decodePng(readFileSync(size.ref)); return { width: d.width, height: d.height, data: toRgba(d) }; })();
    const gotA = (() => { const d = decodePng(a.png); return { width: d.width, height: d.height, data: toRgba(d) }; })();
    const dA = diff(ref, gotA, 0, size.statusBar * 2, size.statusBar);
    writeFileSync(join(OUT, `${size.name}-A-diff.png`), encodePng(dA.w, dA.h, dA.img, 4));
    entry.A = { ...entry.A, refPx: [ref.width, ref.height], gotPx: [gotA.width, gotA.height], compared: dA.n, deviating: dA.bad, pct: +dA.pct.toFixed(2) };
    // Bänder je Modul (App-Rechtecke) — wie viel jedes Modul abweicht.
    entry.A.modules = a.boxes.map((b) => {
      let nn = 0, bb = 0;
      for (let y = Math.max(0, Math.round(b.y * 2)); y < Math.min(dA.h, Math.round((b.y + b.h) * 2)); y++) { nn += dA.rowsN[y]; bb += dA.rowsBad[y]; }
      return { module: b.name, y: Math.round(b.y), h: Math.round(b.h), pct: nn ? +((100 * bb) / nn).toFixed(1) : null };
    });
    // B — Innenfläche der Vorlage (1-px-Rahmen), Viewport = Breite − 2.
    const b = await shoot(size, size.width - 2);
    writeFileSync(join(OUT, `${size.name}-B.png`), b.png);
    const gotB = (() => { const d = decodePng(b.png); return { width: d.width, height: d.height, data: toRgba(d) }; })();
    const dB = diff(ref, gotB, 2, 2 + size.statusBar * 2, size.statusBar);
    writeFileSync(join(OUT, `${size.name}-B-diff.png`), encodePng(dB.w, dB.h, dB.img, 4));
    entry.B = { cssHeight: b.cssHeight, refInnerPx: [ref.width - 4, ref.height - 4 - size.statusBar * 2], gotPx: [gotB.width, gotB.height], compared: dB.n, deviating: dB.bad, pct: +dB.pct.toFixed(2) };
    entry.B.modules = moduleAligned(ref, gotB, 2, 2 + size.statusBar * 2, b.boxes);
  }
  report.sizes.push(entry);
  console.log(`[pixel] ${size.name}: ${LIVE ? 'Aufnahme' : `A ${entry.A.pct} % · B ${entry.B.pct} % abweichend`} (Höhe ${entry.A.cssHeight} css px)`);
}
writeFileSync(join(OUT, `report${LIVE ? '-live' : ''}.json`), JSON.stringify(report, null, 1));
await browser.close();
console.log(`[pixel] Bericht: ${join(OUT, `report${LIVE ? '-live' : ''}.json`)}`);
