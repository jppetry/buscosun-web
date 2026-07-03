/**
 * Fixture schema for the offline verification harness (Phase 2). A fixture is a
 * single recorded fetch session — model background samples, the native ICON-D2
 * field, and the observation network with its truth values — replayed with NO
 * live-API dependence (Phase 2 gate). `scripts/capture-fixture.mjs` writes real
 * sessions in this shape; `generateSyntheticFixture` produces a deterministic
 * one to prove the pipeline end-to-end.
 *
 * Coordinates are equirect x∈[0,1] (=(lng+180)/360), y∈[0,1] (=(90−lat)/180),
 * matching the fusion engine's projection.
 */

export type OiVariable = 't2m' | 'windU' | 'windV' | 'windSpeed' | 'precip' | 'cloud';
export const OI_VARIABLES: OiVariable[] = ['t2m', 'windU', 'windV', 'windSpeed', 'precip', 'cloud'];

export interface FixtureBounds { lngMin: number; lngMax: number; latMin: number; latMax: number }

export interface FixtureStation {
  id: string;
  x: number; y: number;
  elev: number;
  network: 'dwd' | 'tawes' | 'smn';
  /** Observed values at `meta.validTime` — the τ=0 truth LOSO scores against. */
  truth: Partial<Record<OiVariable, number>>;
}

/**
 * Data provenance for the training/verification licence split (constraint C1).
 * `'open-meteo'` samples are non-commercial free-tier and MUST be stripped from
 * any shipped parameter artifact — the archive loader enforces this. Undefined
 * is treated as `'ccby'` (redistributable: DWD/GeoSphere/MeteoSwiss/synthetic).
 */
export type Provenance = 'ccby' | 'open-meteo';

export interface FixtureSample {
  x: number; y: number; elev: number;
  /** e.g. 'mosmix' | 'arome' | 'inca' | 'icon_d2'. */
  source: string;
  vals: Partial<Record<OiVariable, number>>;
  /** Licence provenance (default 'ccby'). See `Provenance`. */
  provenance?: Provenance;
}

export interface Fixture {
  meta: {
    capturedAt: string;
    validTime: string;
    bounds: FixtureBounds;
    note?: string;
    synthetic?: boolean;
    /** Optional forecast lead in hours if this session is not the analysis. */
    leadHours?: number;
  };
  /** Observation network — truth to score against. */
  stations: FixtureStation[];
  /** Model samples forming the background x_b (MOSMIX / AROME / INCA …). */
  background: FixtureSample[];
  /** Native ICON-D2 field samples — the Decision-A per-variable baseline. */
  icond2: FixtureSample[];
}

const eqx = (lng: number) => (lng + 180) / 360;
const eqy = (lat: number) => (90 - lat) / 180;

/** Small deterministic LCG so fixtures are byte-reproducible (no Math.random). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const STD_LAPSE = 0.0065;

/**
 * The synthetic "true" atmosphere. A smooth synoptic field PLUS a localised
 * mesoscale warm anomaly and a rain patch that the coarse models do NOT resolve
 * — exactly the sub-grid structure OI is supposed to recover from stations. An
 * elevation/inversion structure makes terrain classing meaningful.
 */
function trueField(lng: number, lat: number, elev: number, inversion: boolean): Record<OiVariable, number> {
  const sx = (lng - 11) / 6, sy = (lat - 50.5) / 5;
  const synoptic = 12 + 5 * Math.sin(sx * 3) + 4 * Math.cos(sy * 2);
  const lapse = inversion ? -0.004 : STD_LAPSE;    // valley inversion pocket
  // Mesoscale warm anomaly centred over the eastern Alps — models miss it.
  const dax = lng - 13.5, day = lat - 47.3;
  const anomaly = 3.5 * Math.exp(-(dax * dax + day * day) / (2 * 0.6 * 0.6));
  const t2m = synoptic - lapse * elev + anomaly;
  const spd = 4 + 3 * Math.abs(Math.sin(sx * 2)) + 2 * Math.abs(Math.cos(sy * 1.5));
  const dir = 0.6 * Math.sin(sy * 2) + 2.6;        // radians
  const windU = spd * Math.cos(dir);
  const windV = spd * Math.sin(dir);
  const drx = lng - 9.5, dry = lat - 48.2;
  const precip = Math.max(0, 4 * Math.exp(-(drx * drx + dry * dry) / (2 * 0.5 * 0.5)) - 0.2);
  const cloud = Math.max(0, Math.min(100, 40 + 45 * Math.sin(sx * 1.7 + sy)));
  return { t2m, windU, windV, windSpeed: spd, precip, cloud };
}

/** Is (lng,lat) inside the synthetic inversion pocket (an alpine valley zone)? */
function inInversion(lng: number, lat: number): boolean {
  return lng > 12.5 && lng < 14.5 && lat > 46.8 && lat < 47.6;
}

/** Terrarium-free synthetic elevation with alpine relief in the south. */
function synthElev(lng: number, lat: number): number {
  const alpine = Math.max(0, (48.5 - lat)) * 700 * Math.abs(Math.sin(lng * 1.3));
  const hills = 250 + 200 * Math.sin(lng * 2.1) * Math.cos(lat * 1.9);
  return Math.max(0, hills + alpine);
}

/**
 * Deterministic synthetic fixture. Models carry a warm bias, are smoothed, and
 * omit the mesoscale anomaly + rain patch; stations see the truth + tiny noise.
 * Result: OI (which assimilates stations) should beat both the IDW ablation and
 * the raw model/ICON-D2 baselines at held-out stations.
 */
export function generateSyntheticFixture(seed = 42): Fixture {
  const rnd = lcg(seed);
  const bounds: FixtureBounds = { lngMin: 5.5, lngMax: 17.5, latMin: 45.5, latMax: 55.5 };
  const noise = (amp: number) => (rnd() - 0.5) * 2 * amp;

  // Background model grid (MOSMIX-like 16×13) — biased + anomaly-blind.
  const background: FixtureSample[] = [];
  const pushModel = (cols: number, rows: number, source: string, bias: number) => {
    for (let j = 0; j < rows; j++) {
      const lat = bounds.latMin + (j / (rows - 1)) * (bounds.latMax - bounds.latMin);
      for (let i = 0; i < cols; i++) {
        const lng = bounds.lngMin + (i / (cols - 1)) * (bounds.lngMax - bounds.lngMin);
        const elev = synthElev(lng, lat);
        // Model = synoptic truth WITHOUT the mesoscale anomaly, + warm bias, using
        // STANDARD lapse (so it also misses the inversion pocket).
        const base = trueField(lng, lat, elev, false);
        const dax = lng - 13.5, day = lat - 47.3;
        const anomaly = 3.5 * Math.exp(-(dax * dax + day * day) / (2 * 0.6 * 0.6));
        background.push({
          x: eqx(lng), y: eqy(lat), elev, source,
          vals: {
            t2m: base.t2m - anomaly + bias + noise(0.3),
            windU: base.windU + noise(0.5),
            windV: base.windV + noise(0.5),
            windSpeed: base.windSpeed + noise(0.4),
            precip: Math.max(0, base.precip * 0.4 + noise(0.1)),   // models under-resolve the cell
            cloud: base.cloud + noise(4),
          },
        });
      }
    }
  };
  pushModel(16, 13, 'mosmix', 0.8);
  pushModel(12, 7, 'arome', 0.4);

  // Native ICON-D2 field (separate realisation, its own bias) — the baseline.
  const icond2: FixtureSample[] = [];
  {
    const cols = 20, rows = 16;
    for (let j = 0; j < rows; j++) {
      const lat = bounds.latMin + (j / (rows - 1)) * (bounds.latMax - bounds.latMin);
      for (let i = 0; i < cols; i++) {
        const lng = bounds.lngMin + (i / (cols - 1)) * (bounds.lngMax - bounds.lngMin);
        const elev = synthElev(lng, lat);
        const base = trueField(lng, lat, elev, false);
        const dax = lng - 13.5, day = lat - 47.3;
        const anomaly = 3.5 * Math.exp(-(dax * dax + day * day) / (2 * 0.6 * 0.6));
        icond2.push({
          x: eqx(lng), y: eqy(lat), elev, source: 'icon_d2',
          vals: {
            t2m: base.t2m - anomaly + 0.6 + noise(0.3),
            windU: base.windU + noise(0.5), windV: base.windV + noise(0.5),
            windSpeed: base.windSpeed + noise(0.4),
            precip: Math.max(0, base.precip * 0.5 + noise(0.1)),
            cloud: base.cloud + noise(4),
          },
        });
      }
    }
  }

  // Observation network — truth + tiny obs noise, scattered across DACH.
  const stations: FixtureStation[] = [];
  const NET: Array<FixtureStation['network']> = ['dwd', 'tawes', 'smn'];
  const nStations = 140;
  for (let s = 0; s < nStations; s++) {
    const lng = bounds.lngMin + rnd() * (bounds.lngMax - bounds.lngMin);
    const lat = bounds.latMin + rnd() * (bounds.latMax - bounds.latMin);
    const elev = synthElev(lng, lat);
    const inv = inInversion(lng, lat);
    const t = trueField(lng, lat, elev, inv);
    // Pick network by longitude band (roughly DE north, AT east, CH west/south).
    const network: FixtureStation['network'] = lat > 48.6 ? 'dwd' : lng < 8.5 ? 'smn' : NET[1];
    stations.push({
      id: `S${s.toString().padStart(3, '0')}`,
      x: eqx(lng), y: eqy(lat), elev, network,
      truth: {
        t2m: t.t2m + noise(0.2),
        windU: t.windU + noise(0.3), windV: t.windV + noise(0.3),
        windSpeed: t.windSpeed + noise(0.25),
        precip: Math.max(0, t.precip + noise(0.05)),
        cloud: Math.max(0, Math.min(100, t.cloud + noise(3))),
      },
    });
  }

  return {
    meta: {
      capturedAt: '2026-07-01T12:00:00Z',
      validTime: '2026-07-01T12:00:00Z',
      bounds,
      synthetic: true,
      note: 'Deterministic synthetic session (seed ' + seed + '). Models omit a mesoscale ' +
        'anomaly + rain patch and use standard lapse; stations see truth. Proves the LOSO/' +
        'Desroziers pipeline offline — NOT a substitute for a captured real session.',
    },
    stations, background, icond2,
  };
}
