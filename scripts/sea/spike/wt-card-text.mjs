#!/usr/bin/env node
/**
 * Phase WT — prints the card „Wassertemperatur“ as plain text for a few states (no browser: bundled with esbuild,
 * rendered with react-dom/server from the verifier's fixtures). For reading the WORDING; says nothing about the look.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/wt-card-text.mjs
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as W from '../../../src/sea/seaWaterTemp.ts';
import * as V from '../../../src/sea/waterTemp.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const WT = join(ROOT, 'scripts/lib/fixtures/sea/wt');
const J = (f) => JSON.parse(readFileSync(join(WT, f), 'utf8'));
const MAN = J('manifest.json'), CAT = J('watertemp.json');
const spots = [...JSON.parse(readFileSync(join(ROOT, 'scripts/lib/fixtures/sea/static/spots.json'), 'utf8')).spots, ...JSON.parse(readFileSync(join(ROOT, 'scripts/lib/fixtures/sea/dk/spots-dk.json'), 'utf8')).spots];
const tmp = mkdtempSync(join(tmpdir(), 'wt-card-'));
try {
  const out = join(tmp, 'card.mjs');
  await build({
    stdin: { resolveDir: ROOT, loader: 'ts', contents: "export { default as Panel } from './src/sea/SeaWaterTempPanel.tsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';" },
    bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: out, logLevel: 'silent', jsx: 'automatic',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const { Panel, createElement: h, renderToStaticMarkup } = await import(pathToFileURL(out).href);
  const text = (view) => renderToStaticMarkup(h(Panel, { view })).replace(/<\/(p|div|li|strong|span|section)>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  const now = MAN.obsNowMs;
  const entryOf = (id) => { const m = CAT.spots[id].model, run = MAN.runs[m.coll]; return W.wtEntry(J(`wt-${id}.json`), m.coll, spots.find((s) => s.id === id), run.t0); };
  const doc = { schema: 1, product: W.SEA_WT_PRODUCT, stamp: '202611181900', builtAt: MAN.recordedAt, licence: 'CC BY 4.0', param: W.WT_PARAM, unit: '0.1 °C', runs: {}, spots: Object.fromEntries(MAN.spots.map((id) => [id, entryOf(id)])), failed: [] };
  const base = { obsHourly: [], record: null, season: null, threshold: null, onThreshold: () => {}, tMs: now + 20 * 3_600_000, nowMs: now };
  const model = (id) => V.wtModelViewOf({ load: { doc, state: 'ok', why: null }, catalog: CAT, spotId: id, tMs: base.tMs, nowMs: now });
  const dmiPts = W.dmiTwObsOf(J('obs-dmi-31623.json')).points;
  const season = W.wtSeasonOf(J('wtemp-season.json'), 'dmi:31623');
  console.log('──── Gedser: Messung, Modell, Schwelle „über 8“, Jahresgang ────');
  console.log(text({ ...base, model: model('gedser'), obs: V.wtObsViewOf({ load: { points: dmiPts, state: 'ok' }, catalog: CAT, spotId: 'gedser', nowMs: now }), obsHourly: W.wtHourly(dmiPts), season, threshold: { side: 'over', c: 8 } }));
  console.log('\n──── Helgoland: WSV-Station (hier ohne gelesene Reihe ⇒ „keine Messung“), Modell ────');
  console.log(text({ ...base, model: model('helgoland'), obs: V.wtObsViewOf({ load: { points: [], state: 'ok' }, catalog: CAT, spotId: 'helgoland', nowMs: now }) }));
  console.log('\n──── Hvide Sande: keine Station, Modellpunkt im Ring ────');
  console.log(text({ ...base, model: model('hvide-sande'), obs: V.wtObsViewOf({ load: null, catalog: CAT, spotId: 'hvide-sande', nowMs: now }) }));
} finally { rmSync(tmp, { recursive: true, force: true }); }
