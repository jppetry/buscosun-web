/**
 * EFFIS-Saison für die Europa-Box — Liste ohne Umrisse, Umrisse auf Abruf.
 *
 * Live wäre der Saison-Korb für Europa rund 125 MB GeoJSON (2026-10-29: 15 244 Flächen),
 * und der EFFIS-Server komprimiert nicht. Deshalb zwei Teile:
 *
 *  • **Liste** — `public/fire/effis-season-europe-v1.json` aus
 *    `scripts/fire/build-effis-season-europe.mjs`: jede Fläche der Saison mit allen
 *    Attributen und ihrer Bbox (1,6 MB, gzip ≈ 475 KB). Daraus entstehen Einträge der
 *    Registry wie in DACH; ihr `BurntPolygon` hat `polys: []` (kein Umriss, nichts
 *    erfunden) und die echte Bbox.
 *  • **Umrisse** — dieselben Flächen live über `featureid` am selben WFS, nur für die
 *    Flächen, die gerade gebraucht werden (Dossier, nahe Zoomstufe). Einmal geholt,
 *    bleiben sie für die Sitzung im Speicher.
 *
 * DACH bleibt unverändert live (`fetchBurntAreas('season')`); die Seite führt beide über
 * die `id` zusammen, der Live-Umriss gewinnt. Die Liste hat einen Stand (`builtMs`,
 * `lastUpdateMs`) — Flächen danach kommen über den Wochenkorb (`fetchBurntWeek('europe')`),
 * der jeden Abruf live geht.
 */

import { assertDachAxis } from './wfsAxis';
import { EUROPE_BOX } from '../fireRegion';
import {
  LANDCOVER_KEYS, dominantLandcover, parseBurntFeature, type BurntPolygon, type LandcoverKey,
} from '../fireCorroboration';

export const EFFIS_SEASON_EUROPE_URL = '/fire/effis-season-europe-v1.json';
const WFS_SEASON = 'https://maps.effis.emergency.copernicus.eu/effis?service=WFS&request=GetFeature&version=1.1.0'
  + '&outputformat=geojson&typename=ms:modis.ba.poly.season';
/** Kennungen je Abruf — hält die URL unter ~3 KB. */
const OUTLINE_BATCH = 80;

interface SeasonFile {
  version: number;
  built: string;
  lastUpdate: string | null;
  landcoverKeys: string[];
  fields: string[];
  provinces: string[];
  rows: (string | number | null)[][];
}

export interface EuropeSeason {
  /** Alle Flächen der Liste — `polys` leer, Bbox echt. */
  polygons: BurntPolygon[];
  builtMs: number | null;
  /** Jüngste Bearbeitung durch EFFIS in der Liste — der Stand. */
  lastUpdateMs: number | null;
}

/** Hat die Fläche (noch) keinen Umriss — also nur Bbox und Attribute aus der Liste? */
export const isOutlineless = (p: BurntPolygon): boolean => p.polys.length === 0;

/** Datei → Flächen. Unbekannte Version oder Felder ⇒ `null` (dann gibt es außerhalb DACH keine Saison). */
export function decodeEuropeSeason(f: SeasonFile): EuropeSeason | null {
  if (!f || f.version !== 1 || !Array.isArray(f.rows) || !Array.isArray(f.fields)) return null;
  const col = (name: string) => f.fields.indexOf(name);
  const c = {
    id: col('id'), w: col('w'), s: col('s'), e: col('e'), n: col('n'),
    fire: col('firedateMin'), upd: col('lastupdateMin'), ha: col('areaHa'), cc: col('country'),
    prov: col('provinceIdx'), com: col('commune'), na2k: col('percNa2k'),
  };
  if (Object.values(c).some((i) => i < 0)) return null;
  const lcCols = LANDCOVER_KEYS.map((k) => [k, col(k)] as const);
  const numOr = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const polygons: BurntPolygon[] = [];
  for (const r of f.rows) {
    const landcover = {} as Record<LandcoverKey, number>;
    for (const [k, i] of lcCols) landcover[k] = i >= 0 ? numOr(r[i]) ?? 0 : 0;
    const fire = numOr(r[c.fire]); const upd = numOr(r[c.upd]);
    const prov = numOr(r[c.prov]);
    polygons.push({
      id: String(r[c.id]),
      firedateMs: fire == null ? null : fire * 60_000,
      finaldateMs: null,
      lastUpdateMs: upd == null ? null : upd * 60_000,
      areaHa: numOr(r[c.ha]),
      country: typeof r[c.cc] === 'string' && r[c.cc] ? String(r[c.cc]) : null,
      province: prov != null && prov >= 0 ? f.provinces[prov] ?? null : null,
      commune: typeof r[c.com] === 'string' && r[c.com] ? String(r[c.com]) : null,
      landcover,
      percNa2k: numOr(r[c.na2k]),
      polys: [],
      bbox: [Number(r[c.w]), Number(r[c.s]), Number(r[c.e]), Number(r[c.n])],
    });
  }
  const builtMs = Date.parse(f.built);
  const lastMs = f.lastUpdate ? Date.parse(f.lastUpdate) : NaN;
  return { polygons, builtMs: Number.isFinite(builtMs) ? builtMs : null, lastUpdateMs: Number.isFinite(lastMs) ? lastMs : null };
}

let _list: Promise<EuropeSeason | null> | null = null;

/** Die Liste, einmal je Sitzung. Fehler ⇒ `null`, still (die Seite sagt dann „nicht geladen"). */
export function loadEffisSeasonEurope(): Promise<EuropeSeason | null> {
  if (!_list) {
    _list = fetch(EFFIS_SEASON_EUROPE_URL)
      .then((r) => (r.ok ? (r.json() as Promise<SeasonFile>) : null))
      .then((f) => (f ? decodeEuropeSeason(f) : null))
      .catch(() => null);
  }
  return _list;
}

const _outlines = new Map<string, BurntPolygon>();
const _inflight = new Map<string, Promise<void>>();

/** Schon geholter Umriss (oder `undefined`). */
export const cachedOutline = (id: string): BurntPolygon | undefined => _outlines.get(id);

/**
 * Holt die Umrisse zu den Kennungen (nur die noch fehlenden) und liefert alle, die jetzt
 * im Speicher liegen. Ein Abruf, der scheitert, lässt seine Flächen ohne Umriss — keine
 * Fläche wird dabei erfunden; ein späterer Aufruf versucht es erneut.
 */
export async function fetchEffisOutlines(ids: readonly string[], signal?: AbortSignal): Promise<BurntPolygon[]> {
  const missing = [...new Set(ids)].filter((id) => !_outlines.has(id) && !_inflight.has(id));
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < missing.length; i += OUTLINE_BATCH) {
    const batch = missing.slice(i, i + OUTLINE_BATCH);
    const url = `${WFS_SEASON}&featureid=${batch.map((id) => `modis.ba.poly.season.${encodeURIComponent(id)}`).join(',')}`;
    const job = fetch(url, { signal })
      .then((r) => { if (!r.ok) throw new Error(`EFFIS Umrisse: HTTP ${r.status}`); return r.json() as Promise<GeoJSON.FeatureCollection>; })
      .then((fc) => {
        const feats = Array.isArray(fc?.features) ? fc.features : [];
        // A0-1: auch hier die zurückgegebenen Koordinaten prüfen, nicht die Zahl (wfsAxis.ts).
        assertDachAxis(feats, 'EFFIS Umrisse', EUROPE_BOX);
        for (const f of feats) { const p = parseBurntFeature(f); if (p) _outlines.set(p.id, p); }
      })
      .catch(() => { /* Flächen bleiben ohne Umriss */ })
      .finally(() => { for (const id of batch) _inflight.delete(id); });
    for (const id of batch) _inflight.set(id, job);
    jobs.push(job);
  }
  // Auch auf Abrufe warten, die ein anderer Aufruf für dieselben Kennungen gestartet hat.
  for (const id of ids) { const j = _inflight.get(id); if (j && !jobs.includes(j)) jobs.push(j); }
  await Promise.all(jobs);
  return ids.map((id) => _outlines.get(id)).filter((p): p is BurntPolygon => p != null);
}

const _features = new WeakMap<BurntPolygon, GeoJSON.Feature>();

/** Kartenfeature einer Fläche: Umriss, wenn vorhanden, sonst ihr Mittelpunkt (Bbox-Mitte). Je Flächenobjekt einmal gebaut. */
export function seasonFeature(p: BurntPolygon): GeoJSON.Feature {
  const known = _features.get(p);
  if (known) return known;
  const props = { id: p.id, lc: dominantLandcover(p) ?? 'OTHERLC', ha: p.areaHa ?? 0 };
  let f: GeoJSON.Feature;
  if (!isOutlineless(p)) {
    f = {
      type: 'Feature', properties: props,
      geometry: p.polys.length === 1 ? { type: 'Polygon', coordinates: p.polys[0] } : { type: 'MultiPolygon', coordinates: p.polys },
    };
  } else {
    const [w, s, e, n] = p.bbox;
    f = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [(w + e) / 2, (s + n) / 2] } };
  }
  _features.set(p, f);
  return f;
}

/**
 * EFFIS-Ländercodes → ISO 3166-1 alpha-2, wo EFFIS abweicht (`EL` Griechenland, `UK`
 * Vereinigtes Königreich, `KS` Kosovo, wie GeoNames `XK`). Sonst unverändert, groß.
 */
export function isoCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (!c) return null;
  return c === 'EL' ? 'GR' : c === 'UK' ? 'GB' : c === 'KS' ? 'XK' : c;
}
