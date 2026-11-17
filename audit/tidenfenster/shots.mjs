/**
 * Phase TF — gate pictures of the tide window (`audit/tidenfenster.md` §4): desktop 1440 × 900 and phone 390 × 844 for
 * St. Peter-Ording, Cuxhaven-Duhnen and Kiel-Schilksee, against a running production build with LIVE data (data repo
 * and the BSH service), `?tf=1` and a threshold in the link.
 *
 *   npm run build && npx vite preview --host 127.0.0.1 --port 5212 --strictPort
 *   node audit/tidenfenster/shots.mjs [--base http://127.0.0.1:5212]
 *
 * Plain viewport captures over `cdpBrowser.mjs`: `headlessShot.mjs` captures beyond the viewport, and that re-lays the
 * page out — the dossier then falls back to its first chapter and the phone sheet closes (found 18.11., V-TF-4).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findHeadlessChrome, openBrowser } from '../../scripts/lib/cdpBrowser.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'bilder');
const i = process.argv.indexOf('--base');
const BASE = i > 0 ? process.argv[i + 1] : 'http://127.0.0.1:5212';
mkdirSync(OUT, { recursive: true });

const CASES = [
  ['st-peter-ording', 'min.50.nhn.eider-sperrwerk_aussenpegel'],
  ['cuxhaven-duhnen', 'min.550.pnp.cuxhaven_steubenhoeft'],
  ['kiel-schilksee', 'max.45.nhn.kiel-holtenau'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COVER_GONE = `[...document.querySelectorAll('div[role=status]')].every((e) => getComputedStyle(e).position !== 'fixed' || getComputedStyle(e).visibility === 'hidden')`;
const STATE = `({ cards: document.querySelectorAll('.sw-card.is-wide').length, curveCard: !!document.querySelector('.sw-tf-curvecard'),
  wins: document.querySelector('.sw-tf-wins')?.dataset.count ?? null, bands: document.querySelectorAll('.sw-tf-bands > g').length,
  bandLabels: document.querySelectorAll('.sw-tf-bands text').length, line: !!document.querySelector('.sw-tf-line'), dev: !!document.querySelector('.sw-tf-dev'),
  bandRow: document.querySelectorAll('.sw-band-tide td').length, sheet: !!document.querySelector('.sw-tf-sheet'), bar: document.querySelectorAll('.sw-bar-btn').length,
  chapter: document.querySelector('.sw-ds-tab.is-active')?.dataset.ch ?? null, url: location.pathname + location.search })`;
/** Scrolls the dossier's own scroller (never the page) so that `sel` sits `pad` px below its top. */
const scrollDossier = (sel, pad = 12) => `(() => { const el = document.querySelector('${sel}'), sc = el?.closest('.sw-ds-scroll'); if (!el || !sc) return false;
  sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - ${pad}; return true; })()`;

const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 60_000 });
const report = [];
async function page(url, { mobile = false } = {}) {
  const ctx = await browser.newContext({ url, width: mobile ? 390 : 1440, height: mobile ? 844 : 900, mobile });
  const until = async (test, ms = 30_000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await ctx.evaluate(`(() => { try { return !!(${test}); } catch { return false; } })()`)) return true; await sleep(250); }
    return false;
  };
  const snap = async (name) => {
    await sleep(900);
    const { data } = await ctx.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
    return ctx.evaluate(STATE);
  };
  return { ctx, until, snap };
}

try {
  for (const [spot, tw] of CASES) {
    const url = `${BASE}/seewetter/${spot}?tf=1&tw=${tw}`;
    const row = { spot, tw };

    // Desktop — chapter Wasserstand: control, windows, chart; then the top of the water level section (both gauges at SPO).
    let p = await page(url);
    await p.until(`${COVER_GONE} && document.querySelector('.sw-tf-wins') && document.querySelector('.sw-tf-line')`);
    await p.ctx.evaluate(scrollDossier('.sw-tf'));
    row.desktop = await p.snap(`${spot}-desktop.png`);
    await p.ctx.evaluate(scrollDossier('#sw-sec-wasser'));
    row.desktopTop = await p.snap(`${spot}-desktop-pegel.png`);
    // Desktop — chapter Wetter: the hourly band with the row "Pegel".
    await p.ctx.evaluate(`document.querySelector('[data-ch="wetter"]')?.click()`);
    await p.until(`document.querySelector('.sw-band-tide')`);
    await p.ctx.evaluate(scrollDossier('.sw-band', 60));
    row.band = await p.snap(`${spot}-desktop-band.png`);
    await p.ctx.close();

    // Phone — the dossier (the card states the threshold, the control is in the bottom bar) …
    p = await page(url, { mobile: true });
    await p.until(`${COVER_GONE} && document.querySelector('.sw-mapcard-cta')`);
    await p.ctx.evaluate(`document.querySelector('.sw-mapcard-cta')?.click()`);
    await p.until(`document.querySelector('.sw-tf-wins') && document.querySelector('.sw-tf-line')`);
    await p.ctx.evaluate(scrollDossier('.sw-tf', 90));
    row.mobil = await p.snap(`${spot}-mobil.png`);
    // … and the control behind "Schwelle".
    await p.ctx.evaluate(`[...document.querySelectorAll('.sw-bar-btn')].find((b) => b.textContent.trim() === 'Schwelle')?.click()`);
    await p.until(`document.querySelector('.sw-tf-sheet .sw-tf-ctl')`);
    row.leiste = await p.snap(`${spot}-mobil-leiste.png`);
    await p.ctx.close();
    report.push(row);
  }
  // Negative control: without the switch nothing of TF renders.
  const p = await page(`${BASE}/seewetter/cuxhaven-duhnen`);
  await p.until(`${COVER_GONE} && document.querySelector('.sw-wl-fill')`);
  report.push({ spot: 'cuxhaven-duhnen', aus: await p.snap('cuxhaven-duhnen-desktop-aus.png') });
  await p.ctx.close();
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
for (const r of report) console.log(r.spot, JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !['spot', 'tw'].includes(k)).map(([k, v]) => [k, `${v.chapter ?? '-'} cards${v.cards}${v.curveCard ? '+kurve' : ''} wins${v.wins} bands${v.bands}/${v.bandLabels} line${+v.line} dev${+v.dev} row${v.bandRow} sheet${+v.sheet} bar${v.bar}`]))));
