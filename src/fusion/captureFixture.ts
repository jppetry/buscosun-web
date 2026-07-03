/**
 * Record a real fetch session into the Phase 2 fixture schema, in the BROWSER,
 * reusing the app's production source adapters. Dev-only. Shares its grid→fixture
 * conversion with the Node capture (`scripts/capture-fixture.mjs`) via
 * `fixtureBuild.ts`, so a browser and a Node session for one valid time are
 * structurally identical by construction (see `scripts/equivalence-check.mjs`).
 *
 * Usage: `npm run dev`, then in the console:
 *     await window.__captureFusionFixture()                 // training capture (no Open-Meteo)
 *     await window.__captureFusionFixture({ useOpenMeteo:true })  // + ICON-D2 baseline (verification only)
 */

import { fetchBrightSkyCurrentGrid } from '../sources/brightSkyCurrent';
import { fetchBrightSkyGrid } from '../sources/brightSkyForecast';
import { fetchGeoSphereAromeGrid } from '../sources/geosphereArome';
import { fetchTawesCurrentGrid } from '../sources/geosphereTawes';
import { fetchSmnCurrentGrid } from '../sources/meteoSwissSmn';
import { fetchForecastGrid } from '../sources/openMeteoForecast';
import { loadElevationLookup } from './elevation';
import { DACH_VIEW } from '../countryProfiles';
import { assembleCapture, CAPTURE_PARAMS, type RawGrids } from './fixtureBuild';
import type { Fixture } from './fixture';

export interface CaptureOptions { hours?: number; useOpenMeteo?: boolean }

const safe = <T,>(pr: Promise<T>): Promise<T | null> => pr.then((x) => x).catch(() => null);

/** Fetch all sources and assemble a Fixture from the h=0 (analysis) slice. */
export async function captureFixture(opts: CaptureOptions = {}): Promise<Fixture> {
  const bounds = DACH_VIEW.bounds;
  const hours = opts.hours ?? CAPTURE_PARAMS.hours;
  const dem = await loadElevationLookup(bounds, 5).catch(() => null);

  const [obs, mosmix, arome, tawes, smn, icond2] = await Promise.all([
    safe(fetchBrightSkyCurrentGrid({ ...CAPTURE_PARAMS.obs })),
    safe(fetchBrightSkyGrid({ bounds, ...CAPTURE_PARAMS.mosmix, hours })),
    safe(fetchGeoSphereAromeGrid({ ...CAPTURE_PARAMS.arome, hours })),
    safe(fetchTawesCurrentGrid()),
    safe(fetchSmnCurrentGrid({ ...CAPTURE_PARAMS.smn })),
    opts.useOpenMeteo
      ? safe(fetchForecastGrid({ bounds, ...CAPTURE_PARAMS.icond2, hours, model: 'icon_d2' }))
      : Promise.resolve(null),
  ]);

  const grids: RawGrids = { obs, mosmix, arome, tawes, smn, icond2 };
  return assembleCapture(grids, dem, {
    bounds, openMeteoIcond2: opts.useOpenMeteo === true, capturedAt: new Date().toISOString(),
  });
}

function downloadJson(obj: unknown, name: string): void {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Dev-only console hook. `import.meta.env?.DEV` is undefined under Node.
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as { __captureFusionFixture?: (o?: CaptureOptions) => Promise<Fixture> })
    .__captureFusionFixture = async (o?: CaptureOptions) => {
      const fx = await captureFixture(o);
      const ts = fx.meta.validTime.replace(/[:.]/g, '-');
      downloadJson(fx, `session-${ts}.json`);
      // eslint-disable-next-line no-console
      console.log(`[fusionV2] captured ${fx.stations.length} stations, ${fx.background.length} bg, ${fx.icond2.length} icon-d2 → session-${ts}.json`);
      return fx;
    };
}
