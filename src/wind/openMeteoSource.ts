export interface OpenMeteoBounds {
  lngMin: number;
  lngMax: number;
  latMin: number;
  latMax: number;
}

export interface OpenMeteoWindOptions {
  bounds?: OpenMeteoBounds;
  cols?: number;
  rows?: number;
  model?: 'icon_eu' | 'icon_d2' | 'icon_seamless' | 'icon_global' | 'ecmwf_ifs025' | 'gfs025';
  signal?: AbortSignal;
}

export interface WindGridResult {
  /**
   * Pixel source. HTMLCanvasElement when produced by the in-house FusionEngine
   * (the default path — direct canvas avoids a costly `toDataURL → Image()`
   * round-trip). HTMLImageElement remains accepted for the legacy
   * `fetchDwdForecast` PNG-tile path. Both types are accepted by
   * `WebGLRenderingContext.texImage2D`.
   */
  image: HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  /** Equirectangular UV bounds (x0,y0,x1,y1) of the wind data region within the global [0,1]² space. */
  uvBounds: [number, number, number, number];
  /** Wall-clock time the data was fetched at. */
  fetchedAt: number;
  /** Model name returned. */
  model: string;
}

const DEFAULT_BOUNDS: OpenMeteoBounds = {
  lngMin: -15,
  lngMax: 30,
  latMin: 32,
  latMax: 65,
};

function lngToEquiX(lng: number): number {
  return (lng + 180) / 360;
}
function latToEquiY(lat: number): number {
  return (90 - lat) / 180;
}

export interface ScalarGridResult {
  image: HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
  vMin: number;
  vMax: number;
  uvBounds: [number, number, number, number];
  fetchedAt: number;
  model: string;
  variable: string;
}

export type OpenMeteoScalarVariable = 'temperature_2m' | 'cloud_cover';

export interface CloudGridResult {
  image: HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
  uvBounds: [number, number, number, number];
  fetchedAt: number;
  model: string;
  /** Always 0..100, the percent encoded into each channel. */
  vMin: number;
  vMax: number;
}

export interface OpenMeteoBulkResult {
  wind?: WindGridResult;
  temperature?: ScalarGridResult;
  /** Multi-channel cloud layer: R=low, G=mid, B=high, each 0..100 %. */
  clouds?: CloudGridResult;
  /** Precipitation rate as a scalar grid (mm/h). Populated by FusionEngine. */
  precipitation?: ScalarGridResult;
}

export interface OpenMeteoBulkOptions {
  bounds?: OpenMeteoBounds;
  cols?: number;
  rows?: number;
  model?: OpenMeteoWindOptions['model'];
  signal?: AbortSignal;
  /** Which layers to compute. Defaults to all three. */
  layers?: Array<'wind' | 'temperature' | 'clouds'>;
  /** Range overrides for the scalar layers. */
  temperatureRange?: { min: number; max: number };
}

/**
 * Single bulk Open-Meteo request that returns wind, temperature and clouds in
 * one round trip. The API allows multiple `current` variables per request, so
 * we save 3x the API budget compared to fetching each layer separately.
 */
export async function fetchOpenMeteoLayers(options: OpenMeteoBulkOptions = {}): Promise<OpenMeteoBulkResult> {
  const bounds = options.bounds ?? DEFAULT_BOUNDS;
  const cols = options.cols ?? 20;
  const rows = options.rows ?? 16;
  const model = options.model ?? 'icon_eu';
  const layers = options.layers ?? ['wind', 'temperature', 'clouds'];
  const total = cols * rows;

  const needWind = layers.includes('wind');
  const needTemp = layers.includes('temperature');
  const needClouds = layers.includes('clouds');

  const currentVars: string[] = [];
  if (needWind) currentVars.push('wind_speed_10m', 'wind_direction_10m');
  if (needTemp) currentVars.push('temperature_2m');
  if (needClouds) currentVars.push('cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high');

  const lats: string[] = new Array(total);
  const lngs: string[] = new Array(total);
  for (let j = 0; j < rows; j++) {
    const lat = bounds.latMin + (j / (rows - 1)) * (bounds.latMax - bounds.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = bounds.lngMin + (i / (cols - 1)) * (bounds.lngMax - bounds.lngMin);
      const k = j * cols + i;
      lats[k] = lat.toFixed(3);
      lngs[k] = lng.toFixed(3);
    }
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lats.join(','));
  url.searchParams.set('longitude', lngs.join(','));
  url.searchParams.set('current', currentVars.join(','));
  url.searchParams.set('models', model);
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('cell_selection', 'nearest');

  const res = await fetch(url.toString(), { signal: options.signal });
  if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`);
  type Loc = { latitude: number; longitude: number; current?: Record<string, number> };
  const raw = (await res.json()) as Loc | Loc[];
  const locations: Loc[] = Array.isArray(raw) ? raw : [raw];
  if (locations.length !== total) {
    throw new Error(`Open-Meteo returned ${locations.length} points, expected ${total}`);
  }

  const fetchedAt = Date.now();
  const uvBounds: [number, number, number, number] = [
    lngToEquiX(bounds.lngMin),
    latToEquiY(bounds.latMax),
    lngToEquiX(bounds.lngMax),
    latToEquiY(bounds.latMin),
  ];

  const result: OpenMeteoBulkResult = {};

  if (needWind) {
    const us = new Float32Array(total);
    const vs = new Float32Array(total);
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (let k = 0; k < total; k++) {
      const speed = locations[k].current?.wind_speed_10m ?? 0;
      const dir = locations[k].current?.wind_direction_10m ?? 0;
      const r = (dir * Math.PI) / 180;
      const u = -speed * Math.sin(r);
      const v = -speed * Math.cos(r);
      us[k] = u; vs[k] = v;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    if (uMax - uMin < 0.5) { const c = (uMax + uMin) / 2; uMin = c - 0.5; uMax = c + 0.5; }
    if (vMax - vMin < 0.5) { const c = (vMax + vMin) / 2; vMin = c - 0.5; vMax = c + 0.5; }
    const img = await encodeTwoChannelPng(cols, rows, us, vs, uMin, uMax, vMin, vMax);
    result.wind = {
      image: img, width: cols, height: rows,
      uMin, uMax, vMin, vMax,
      uvBounds, fetchedAt, model,
    };
  }

  if (needTemp) {
    result.temperature = await buildScalar(
      'temperature_2m', cols, rows, total, locations, uvBounds, fetchedAt, model,
      options.temperatureRange,
    );
  }
  if (needClouds) {
    const low = new Float32Array(total);
    const mid = new Float32Array(total);
    const high = new Float32Array(total);
    for (let k = 0; k < total; k++) {
      low[k]  = Number(locations[k].current?.cloud_cover_low  ?? 0);
      mid[k]  = Number(locations[k].current?.cloud_cover_mid  ?? 0);
      high[k] = Number(locations[k].current?.cloud_cover_high ?? 0);
    }
    const img = await encodeThreeChannelPng(cols, rows, low, mid, high);
    result.clouds = {
      image: img, width: cols, height: rows, uvBounds, fetchedAt, model,
      vMin: 0, vMax: 100,
    };
  }

  return result;
}

async function buildScalar(
  variable: string,
  cols: number, rows: number, total: number,
  locations: Array<{ current?: Record<string, number> }>,
  uvBounds: [number, number, number, number],
  fetchedAt: number,
  model: string,
  range: { min: number; max: number } | undefined,
): Promise<ScalarGridResult> {
  const values = new Float32Array(total);
  let vMin = Infinity, vMax = -Infinity;
  for (let k = 0; k < total; k++) {
    const v = Number(locations[k].current?.[variable] ?? NaN);
    values[k] = Number.isFinite(v) ? v : 0;
    if (Number.isFinite(v)) {
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
  }
  if (!Number.isFinite(vMin)) { vMin = 0; vMax = 1; }
  if (vMax - vMin < 0.001) vMax = vMin + 0.001;
  if (range) { vMin = range.min; vMax = range.max; }
  const img = await encodeOneChannelPng(cols, rows, values, vMin, vMax);
  return {
    image: img, width: cols, height: rows,
    vMin, vMax, uvBounds, fetchedAt, model, variable,
  };
}

async function encodeTwoChannelPng(
  cols: number, rows: number,
  us: Float32Array, vs: Float32Array,
  uMin: number, uMax: number, vMin: number, vMax: number,
): Promise<HTMLImageElement> {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(cols, rows);
  for (let k = 0; k < us.length; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    const y = rows - 1 - j;
    const idx = (y * cols + i) * 4;
    imageData.data[idx + 0] = Math.round(((us[k] - uMin) / (uMax - uMin)) * 255);
    imageData.data[idx + 1] = Math.round(((vs[k] - vMin) / (vMax - vMin)) * 255);
    imageData.data[idx + 2] = 0;
    imageData.data[idx + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return loadDataUrl(canvas.toDataURL('image/png'));
}

async function encodeThreeChannelPng(
  cols: number, rows: number,
  low: Float32Array, mid: Float32Array, high: Float32Array,
): Promise<HTMLImageElement> {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(cols, rows);
  for (let k = 0; k < low.length; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    const y = rows - 1 - j;
    const idx = (y * cols + i) * 4;
    imageData.data[idx + 0] = Math.max(0, Math.min(255, Math.round((low[k]  / 100) * 255)));
    imageData.data[idx + 1] = Math.max(0, Math.min(255, Math.round((mid[k]  / 100) * 255)));
    imageData.data[idx + 2] = Math.max(0, Math.min(255, Math.round((high[k] / 100) * 255)));
    imageData.data[idx + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return loadDataUrl(canvas.toDataURL('image/png'));
}

async function encodeOneChannelPng(
  cols: number, rows: number, values: Float32Array,
  vMin: number, vMax: number,
): Promise<HTMLImageElement> {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(cols, rows);
  for (let k = 0; k < values.length; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    const y = rows - 1 - j;
    const idx = (y * cols + i) * 4;
    const t = (values[k] - vMin) / (vMax - vMin);
    imageData.data[idx + 0] = Math.max(0, Math.min(255, Math.round(t * 255)));
    imageData.data[idx + 1] = 0;
    imageData.data[idx + 2] = 0;
    imageData.data[idx + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return loadDataUrl(canvas.toDataURL('image/png'));
}

async function loadDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('PNG decode failed'));
    img.src = dataUrl;
  });
  return img;
}

export interface OpenMeteoScalarOptions {
  bounds?: OpenMeteoBounds;
  cols?: number;
  rows?: number;
  model?: OpenMeteoWindOptions['model'];
  signal?: AbortSignal;
  /** Override the normalised range. If omitted the actual data min/max is used. */
  range?: { min: number; max: number };
}

/**
 * Fetch a 2D grid of a single Open-Meteo "current" scalar value over the bounds
 * and encode it as an 8-bit PNG (R channel = normalised value). Use for the
 * temperature and cloud-cover heatmap layers.
 */
export async function fetchOpenMeteoScalar(
  variable: OpenMeteoScalarVariable,
  options: OpenMeteoScalarOptions = {},
): Promise<ScalarGridResult> {
  const bounds = options.bounds ?? DEFAULT_BOUNDS;
  const cols = options.cols ?? 24;
  const rows = options.rows ?? 18;
  const model = options.model ?? 'icon_eu';
  const total = cols * rows;

  const lats: string[] = new Array(total);
  const lngs: string[] = new Array(total);
  for (let j = 0; j < rows; j++) {
    const lat = bounds.latMin + (j / (rows - 1)) * (bounds.latMax - bounds.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = bounds.lngMin + (i / (cols - 1)) * (bounds.lngMax - bounds.lngMin);
      const k = j * cols + i;
      lats[k] = lat.toFixed(3);
      lngs[k] = lng.toFixed(3);
    }
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lats.join(','));
  url.searchParams.set('longitude', lngs.join(','));
  url.searchParams.set('current', variable);
  url.searchParams.set('models', model);
  url.searchParams.set('cell_selection', 'nearest');

  const res = await fetch(url.toString(), { signal: options.signal });
  if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`);
  type Loc = { latitude: number; longitude: number; current?: Record<string, number> };
  const raw = (await res.json()) as Loc | Loc[];
  const locations: Loc[] = Array.isArray(raw) ? raw : [raw];
  if (locations.length !== total) {
    throw new Error(`Open-Meteo returned ${locations.length} points, expected ${total}`);
  }

  const values = new Float32Array(total);
  let vMin = Infinity, vMax = -Infinity;
  for (let k = 0; k < total; k++) {
    const v = Number(locations[k].current?.[variable] ?? NaN);
    values[k] = Number.isFinite(v) ? v : 0;
    if (Number.isFinite(v)) {
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
  }
  if (!Number.isFinite(vMin)) { vMin = 0; vMax = 1; }
  if (vMax - vMin < 0.001) { vMax = vMin + 0.001; }
  // optional explicit range
  if (options.range) {
    vMin = options.range.min;
    vMax = options.range.max;
  }

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(cols, rows);
  for (let k = 0; k < total; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    const imageY = rows - 1 - j;
    const idx = (imageY * cols + i) * 4;
    const t = (values[k] - vMin) / (vMax - vMin);
    imageData.data[idx + 0] = Math.max(0, Math.min(255, Math.round(t * 255)));
    imageData.data[idx + 1] = 0;
    imageData.data[idx + 2] = 0;
    imageData.data[idx + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('scalar PNG decode failed'));
    img.src = dataUrl;
  });

  const uvBounds: [number, number, number, number] = [
    lngToEquiX(bounds.lngMin),
    latToEquiY(bounds.latMax),
    lngToEquiX(bounds.lngMax),
    latToEquiY(bounds.latMin),
  ];

  return {
    image: img,
    width: cols,
    height: rows,
    vMin, vMax,
    uvBounds,
    fetchedAt: Date.now(),
    model,
    variable,
  };
}

interface LocationCurrent {
  wind_speed_10m?: number;
  wind_direction_10m?: number;
}
interface LocationResponse {
  latitude: number;
  longitude: number;
  current?: LocationCurrent;
}

export async function fetchOpenMeteoWind(options: OpenMeteoWindOptions = {}): Promise<WindGridResult> {
  const bounds = options.bounds ?? DEFAULT_BOUNDS;
  const cols = options.cols ?? 20;
  const rows = options.rows ?? 16;
  const model = options.model ?? 'icon_eu';
  const total = cols * rows;

  const lats: string[] = new Array(total);
  const lngs: string[] = new Array(total);
  // grid layout: index k = j * cols + i; j=0 is south, j=rows-1 is north
  for (let j = 0; j < rows; j++) {
    const lat = bounds.latMin + (j / (rows - 1)) * (bounds.latMax - bounds.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = bounds.lngMin + (i / (cols - 1)) * (bounds.lngMax - bounds.lngMin);
      const k = j * cols + i;
      lats[k] = lat.toFixed(3);
      lngs[k] = lng.toFixed(3);
    }
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lats.join(','));
  url.searchParams.set('longitude', lngs.join(','));
  url.searchParams.set('current', 'wind_speed_10m,wind_direction_10m');
  url.searchParams.set('models', model);
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('cell_selection', 'nearest');

  const res = await fetch(url.toString(), { signal: options.signal });
  if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`);
  const raw = (await res.json()) as LocationResponse | LocationResponse[];
  const locations: LocationResponse[] = Array.isArray(raw) ? raw : [raw];
  if (locations.length !== total) {
    throw new Error(`Open-Meteo returned ${locations.length} points, expected ${total}`);
  }

  const us = new Float32Array(total);
  const vs = new Float32Array(total);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let k = 0; k < total; k++) {
    const loc = locations[k];
    const speed = loc.current?.wind_speed_10m ?? 0;
    const dir = loc.current?.wind_direction_10m ?? 0;
    const r = (dir * Math.PI) / 180;
    // meteorological direction = where wind comes FROM; flow vector points opposite
    const u = -speed * Math.sin(r);
    const v = -speed * Math.cos(r);
    us[k] = u;
    vs[k] = v;
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  // ensure non-zero range to avoid divide-by-zero in shader
  if (uMax - uMin < 0.5) {
    const c = (uMax + uMin) / 2;
    uMin = c - 0.5; uMax = c + 0.5;
  }
  if (vMax - vMin < 0.5) {
    const c = (vMax + vMin) / 2;
    vMin = c - 0.5; vMax = c + 0.5;
  }

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(cols, rows);
  for (let k = 0; k < total; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    // wind data convention from mapbox webgl-wind: image y=0 is north
    // our grid j=0 is south, so flip vertically when writing
    const imageY = rows - 1 - j;
    const idx = (imageY * cols + i) * 4;
    imageData.data[idx + 0] = Math.round(((us[k] - uMin) / (uMax - uMin)) * 255);
    imageData.data[idx + 1] = Math.round(((vs[k] - vMin) / (vMax - vMin)) * 255);
    imageData.data[idx + 2] = 0;
    imageData.data[idx + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Wind PNG decode failed'));
    img.src = dataUrl;
  });

  // UV bounds in global equirectangular [0,1]² space.
  // Note: latMax is at the top → smaller equiY; latMin → larger equiY.
  const uvBounds: [number, number, number, number] = [
    lngToEquiX(bounds.lngMin),
    latToEquiY(bounds.latMax),
    lngToEquiX(bounds.lngMax),
    latToEquiY(bounds.latMin),
  ];

  return {
    image: img,
    width: cols,
    height: rows,
    uMin, uMax, vMin, vMax,
    uvBounds,
    fetchedAt: Date.now(),
    model,
  };
}
