#!/usr/bin/env node
/**
 * Headless Layer-QA-Runner (QA P1-3 / CI-Anbindung).
 *
 * Treibt den laufenden Dev-Server, aktiviert Temp/Wind/Böen/Wolken, ruft den
 * In-App-Selbstcheck `window.__bsQA()` (Sampler aus dem dekodierten Gitter vs
 * unabhängige Open-Meteo-`dwd-icon`-API) und beendet sich mit Exit-Code 1, wenn
 * ein Toleranz-Gate reißt (Valid-Time-/Decode-/Einheits-Regression).
 *
 * Voraussetzungen:
 *   npm i -D playwright && npx playwright install chromium
 *   npm run dev            # __bsQA existiert nur im DEV-Build
 * Aufruf:
 *   node scripts/qa-layers.mjs
 *   BS_URL=http://localhost:5175 node scripts/qa-layers.mjs
 */
const URL = process.env.BS_URL || 'http://localhost:5173';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright nicht installiert. Setup:\n  npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage();
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  // Auf die Startseiten-Kachel „Die ganze DACH-Wetterkarte" klicken (falls Startseite).
  await page.getByRole('button', { name: /DACH-Wetterkarte/i }).click({ timeout: 5000 }).catch(() => {});

  await page.waitForFunction(() => document.querySelectorAll('.layer-switch button').length > 0, { timeout: 30000 });
  await page.evaluate(() => {
    const tn = (b) => b.querySelector('span')?.textContent || '';
    for (const name of ['Temperatur', 'Wind', 'Böen', 'Wolken']) {
      const b = [...document.querySelectorAll('.layer-switch button')].find((x) => tn(x) === name);
      if (b && !b.classList.contains('active')) b.click();
    }
  });

  // Auf die Dev-Hooks + geladene Gitter warten.
  await page.waitForFunction(() => {
    const s = window.__bsSample;
    return typeof s === 'object' && s
      && s.temp(48.137, 11.575) != null
      && s.gust(50.110, 8.682) != null
      && s.wind(53.5, 10.0) != null;
  }, { timeout: 90000 });

  const report = await page.evaluate(() => window.__bsQA());
  console.log(`Valid hour (UTC): ${report.validHourUTC} | getestet: ${report.tested.join(', ')}`);
  console.table(report.rows.map((r) => ({ layer: r.layer, point: r.point, bus: r.bus, ref: r.ref, delta: r.delta, tol: r.tol, pass: r.pass })));
  if (!report.pass) {
    console.error(`QA FAIL — ${report.failed.length} Gate(s) gerissen:`);
    for (const f of report.failed) console.error(`  ${f.layer} @ ${f.point}: bus=${f.bus} ref=${f.ref} Δ=${f.delta} (tol ${f.tol})`);
    process.exitCode = 1;
  } else {
    console.log(`QA PASS — ${report.tested.length} Layer, ${report.rows.length} Vergleiche, alle in Toleranz.`);
  }
} catch (e) {
  console.error('QA-Runner-Fehler:', e?.message || e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
