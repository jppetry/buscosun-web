/**
 * Node capture of a real fusion session into the Phase 2 fixture schema, hitting
 * the SAME already-integrated endpoints as `window.__captureFusionFixture`
 * (BrightSky = DWD MOSMIX + obs, GeoSphere AROME/TAWES, MeteoSwiss SMN). It
 * imports the real app adapters and the SHARED `assembleCapture` so it cannot
 * drift from the browser path; DEM comes from the Node Terrarium twin. No new
 * sources, no new npm dependency.
 *
 *   node --experimental-strip-types scripts/capture-fixture.mjs [--out fixtures] [--with-openmeteo]
 *
 * `useOpenMeteo:false` is the default (training capture). `--with-openmeteo`
 * adds the Open-Meteo ICON-D2 baseline, tagged provenance 'open-meteo' so the
 * training loader strips it (constraint C1) — verification/cross-source only.
 * BrightSky/GeoSphere/MeteoSwiss are CORS-open and directly Node-fetchable, so
 * no dev proxy is needed for these sources.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fetchBrightSkyCurrentGrid } from '../src/sources/brightSkyCurrent.ts';
import { fetchBrightSkyGrid } from '../src/sources/brightSkyForecast.ts';
import { fetchGeoSphereAromeGrid } from '../src/sources/geosphereArome.ts';
import { fetchTawesCurrentGrid } from '../src/sources/geosphereTawes.ts';
import { fetchSmnCurrentGrid } from '../src/sources/meteoSwissSmn.ts';
import { fetchForecastGrid } from '../src/sources/openMeteoForecast.ts';
import { assembleCapture, CAPTURE_PARAMS } from '../src/fusion/fixtureBuild.ts';
import { DACH_VIEW } from '../src/countryProfiles.ts';
import { loadNodeElevation } from './lib/nodeElevation.mjs';

const args = process.argv.slice(2);
const outDir = (() => { const i = args.indexOf('--out'); return i >= 0 ? args[i + 1] : 'fixtures'; })();
const withOpenMeteo = args.includes('--with-openmeteo');
const bounds = DACH_VIEW.bounds;
const hours = CAPTURE_PARAMS.hours;

const safe = (p) => p.then((x) => x).catch((e) => { console.warn('  source failed:', e.message); return null; });

console.log(`\n[capture-fixture] hitting BrightSky / GeoSphere / MeteoSwiss${withOpenMeteo ? ' + Open-Meteo icon_d2' : ''} …`);
const t0 = Date.now();
const dem = await loadNodeElevation(bounds, 5).catch(() => null);
if (dem) console.log(`  DEM: ${dem.tileCount} Terrarium tiles`);

const [obs, mosmix, arome, tawes, smn, icond2] = await Promise.all([
  safe(fetchBrightSkyCurrentGrid({ ...CAPTURE_PARAMS.obs })),
  safe(fetchBrightSkyGrid({ bounds, ...CAPTURE_PARAMS.mosmix, hours })),
  safe(fetchGeoSphereAromeGrid({ ...CAPTURE_PARAMS.arome, hours })),
  safe(fetchTawesCurrentGrid()),
  safe(fetchSmnCurrentGrid({ ...CAPTURE_PARAMS.smn })),
  withOpenMeteo ? safe(fetchForecastGrid({ bounds, ...CAPTURE_PARAMS.icond2, hours, model: 'icon_d2' })) : Promise.resolve(null),
]);

const fx = assembleCapture(
  { obs, mosmix, arome, tawes, smn, icond2 }, dem,
  { bounds, openMeteoIcond2: withOpenMeteo, capturedAt: new Date().toISOString() },
);

mkdirSync(outDir, { recursive: true });
const ts = fx.meta.validTime.replace(/[:.]/g, '-');
const outPath = join(outDir, `session-${ts}.json`);
writeFileSync(outPath, JSON.stringify(fx));

const byNet = (n) => fx.stations.filter((s) => s.network === n).length;
console.log(`\n[capture-fixture] → ${outPath}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`  validTime=${fx.meta.validTime}`);
console.log(`  stations: dwd=${byNet('dwd')} tawes=${byNet('tawes')} smn=${byNet('smn')}  (total ${fx.stations.length})`);
console.log(`  background: ${fx.background.length} (mosmix+arome)   icon-d2: ${fx.icond2.length}${withOpenMeteo ? ' [open-meteo, stripped from training]' : ''}\n`);

if (!fx.stations.length) { console.error('[capture-fixture] no stations captured — aborting.'); process.exit(1); }
