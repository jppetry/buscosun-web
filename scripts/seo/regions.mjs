/**
 * Länder und Regionen der Ortsseiten (Phase 3): Gruppierung, Brotkrumen, Kennzahlen.
 *
 * Pfade: /wetter/<land>/ und /wetter/<land>/<region>/ — Orte bleiben flach unter /wetter/<ort>/.
 * Eine Regionsseite gibt es erst ab `MIN_REGION_PLACES` Orten; darunter wäre sie eine reine Linkliste.
 * Kleinere Regionen erscheinen direkt auf der Länderseite, die Brotkrume überspringt sie dann.
 */
import { PLACES_ALL, toSlug } from './places.mjs';
import { climateOf, terrainOf } from './placeContent.mjs';

export const MIN_REGION_PLACES = 3;

export const COUNTRIES = {
  DE: { code: 'DE', slug: 'deutschland', name: 'Deutschland', flag: '🇩🇪', region: 'Bundesland', regions: 'Bundesländer' },
  AT: { code: 'AT', slug: 'oesterreich', name: 'Österreich', flag: '🇦🇹', region: 'Bundesland', regions: 'Bundesländer' },
  CH: { code: 'CH', slug: 'schweiz', name: 'Schweiz', flag: '🇨🇭', region: 'Kanton', regions: 'Kantone' },
};
export const COUNTRY_SLUGS = new Set(Object.values(COUNTRIES).map((c) => c.slug));

export const countryPath = (c) => `/wetter/${COUNTRIES[c].slug}/`;

const byName = (a, b) => a.name.localeCompare(b.name, 'de');

/** Alle Regionen mit Orten, sortiert nach Land und Name. */
export const REGIONS = (() => {
  const m = new Map();
  for (const p of PLACES_ALL) {
    const key = `${p.country}|${p.region}`;
    if (!m.has(key)) m.set(key, { country: p.country, name: p.region, slug: toSlug(p.region), places: [] });
    m.get(key).places.push(p);
  }
  const out = [...m.values()];
  for (const r of out) { r.places.sort(byName); r.hasPage = r.places.length >= MIN_REGION_PLACES; r.path = `/wetter/${COUNTRIES[r.country].slug}/${r.slug}/`; }
  return out.sort((a, b) => (a.country === b.country ? a.name.localeCompare(b.name, 'de') : a.country.localeCompare(b.country)));
})();

export const regionsOf = (country) => REGIONS.filter((r) => r.country === country);
export const regionOfPlace = (place) => REGIONS.find((r) => r.country === place.country && r.name === place.region);

/** Brotkrume Start › Wetter › Land › (Region) › Ort — Region nur, wenn es die Seite gibt. */
export function crumbsFor(place) {
  const reg = regionOfPlace(place);
  const c = COUNTRIES[place.country];
  return [
    { name: 'Start', path: '/' },
    { name: 'Wetter', path: '/wetter/' },
    { name: c.name, path: countryPath(place.country) },
    ...(reg?.hasPage ? [{ name: reg.name, path: reg.path }] : []),
    { name: place.name, path: `/wetter/${place.slug}/` },
  ];
}

// ------------------------------------------------------------------ Kennzahlen

const SUM = (a) => a.reduce((s, v) => s + v, 0);

/** Kennzahlen über eine Menge von Orten (Region oder Land). Niederschlag/Sonne nur über Orte mit Rasterdaten. */
export function statsOf(places) {
  const rows = places.map((p) => {
    const c = climateOf(p);
    const jul = c.rows[6], jan = c.rows[0];
    return { p, c, ele: p.ele, mean: c.meanTemp, tmaxJul: jul.tmax, tminJan: jan.tmin, rr: c.kind === 'raster' ? c.rrYear : null, sun: c.kind === 'raster' ? c.sunYear : null, frost: c.kind === 'raster' ? c.days.frost : null, lage: terrainOf(p)?.lage ?? null, lake: terrainOf(p)?.lake ?? null };
  });
  const pick = (key, dir) => {
    const cand = rows.filter((r) => r[key] != null);
    if (!cand.length) return null;
    return cand.reduce((a, b) => (dir > 0 ? (b[key] > a[key] ? b : a) : (b[key] < a[key] ? b : a)));
  };
  const lage = { tal: 0, hang: 0, hoehe: 0, eben: 0 };
  for (const r of rows) if (r.lage) lage[r.lage]++;
  return {
    n: rows.length, rows,
    highest: pick('ele', 1), lowest: pick('ele', -1),
    warmest: pick('mean', 1), coldest: pick('mean', -1),
    wettest: pick('rr', 1), driest: pick('rr', -1),
    sunniest: pick('sun', 1), dullest: pick('sun', -1),
    mostFrost: pick('frost', 1), leastFrost: pick('frost', -1),
    rasterN: rows.filter((r) => r.rr != null).length,
    lage, lakes: rows.filter((r) => r.lake && r.lake.km <= 1.5),
    meanOfMeans: SUM(rows.map((r) => r.mean)) / rows.length,
  };
}
