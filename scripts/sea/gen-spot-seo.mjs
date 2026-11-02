/**
 * Seewetter · Steckbriefe der Spot-Seiten (Phase SS, audit/seewetter-seo.md) — schreibt `src/sea/seaSpotFacts.ts`.
 *
 * Die Spot-Seiten `/seewetter/<spot>` brauchen im ROH-HTML Inhalt, der je Spot wirklich verschieden ist (Google: „scaled
 * content abuse" = Seiten, die sich nur im Ortsnamen unterscheiden). Hier stehen deshalb nur gerechnete oder gemessene
 * Eigenschaften des Spots, keine Prognosewerte: Seegebiet und Küstenabschnitt des DWD, Ufernormale (wohin die offene See
 * zeigt), Abstand der Modellzelle, nächste DWD-Station, nächster BSH-Pegel, Nachbarspots und die Ortsseiten, deren
 * nächster Spot dieser ist. Live-Werte zeigt erst die App.
 *
 * Quelle ist der veröffentlichte Katalog des Daten-Repos (`sea/v1/static/spots.json`, `gauges.json`) — dieselbe Datei,
 * die die Seite lädt —, dazu `scripts/seo/data/place-modules.json` (Ort → nächster Spot). Läuft NICHT im Build.
 *
 *   node scripts/sea/gen-spot-seo.mjs [--data=../buscosun-data]
 *
 * Neue oder umbenannte Spots ⇒ zuerst den Katalog im Daten-Repo bauen, dann dieses Skript; `verify:sea-seo` prüft, dass
 * Steckbriefe, Namenstabelle (`seaSpotNames.ts`) und Handliste (`spots-src.json`) dieselben Kennungen tragen.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES_ALL } from '../seo/places.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const DATA = resolve(ROOT, args.data || '../buscosun-data');
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));

const cat = J(join(DATA, 'sea/v1/static/spots.json'));
const gauges = J(join(DATA, 'sea/v1/static/gauges.json'));
const modules = J(join(ROOT, 'scripts/seo/data/place-modules.json'));

/** Nächster BSH-Pegel nur bis zu dieser Entfernung (wie `MODULES.gaugeKm` der Ortsseiten); weiter weg wäre der Satz irreführend. */
const GAUGE_MAX_KM = 20;
/** Nachbarspots je Seite (gleiche Küste). */
const NEAR_N = 4;

/** DWD-Stationsnamen (Großbuchstaben, abgekürzt) → Lesename. Unbekannte fallen auf Großschreibung je Wort zurück und werden gemeldet. */
const STATION_NAME = {
  'NORDERNEY': 'Norderney', 'LEUCHTTURM A. WESER': 'Leuchtturm Alte Weser', 'BREMERHAVEN': 'Bremerhaven', 'CUXHAVEN': 'Cuxhaven',
  'HELGOLAND': 'Helgoland', 'ELPERSBUETTEL': 'Elpersbüttel', 'ST. PETER ORDING': 'St. Peter-Ording', 'LECK': 'Leck',
  'LIST/SYLT': 'List auf Sylt', 'HAMBURG-FU.': 'Hamburg-Fuhlsbüttel', 'SCHLESWIG': 'Schleswig', 'OLPENITZ': 'Olpenitz',
  'KIEL-H.': 'Kiel-Holtenau', 'DOERNICK': 'Dörnick', 'WESTERMARKELSDORF': 'Westermarkelsdorf (Fehmarn)', 'PELZERHAKEN': 'Pelzerhaken',
  'BOLTENHAGEN': 'Boltenhagen', 'WARNEMUENDE': 'Warnemünde', 'BARTH': 'Barth', 'ARKONA': 'Kap Arkona', 'PUTBUS': 'Putbus',
  'GREIFSWALDER OIE': 'Greifswalder Oie', 'GREIFSWALD': 'Greifswald', 'UECKERMUENDE': 'Ueckermünde',
};
const unknownStations = new Set();
function stationName(raw) {
  if (STATION_NAME[raw]) return STATION_NAME[raw];
  unknownStations.add(raw);
  return raw.toLowerCase().replace(/(^|[\s\-/(])\p{L}/gu, (m) => m.toUpperCase());
}

const km = (aLat, aLon, bLat, bLon) => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const r1 = (v) => Math.round(v * 10) / 10;

const nameOfPlace = new Map(PLACES_ALL.map((p) => [p.slug, p.name]));
const placesOfSpot = new Map();
for (const [slug, rec] of Object.entries(modules.places)) {
  const id = rec.sea?.spot?.id;
  if (!id || !nameOfPlace.has(slug)) continue;
  if (!placesOfSpot.has(id)) placesOfSpot.set(id, []);
  placesOfSpot.get(id).push({ slug, name: nameOfPlace.get(slug), km: rec.sea.spot.km });
}

const spots = cat.spots;
const rows = spots.map((s) => {
  const g = gauges.gauges.map((x) => [km(s.lat, s.lon, x.lat, x.lon), x]).sort((a, b) => a[0] - b[0])[0];
  const near = spots.filter((o) => o.id !== s.id && o.region === s.region)
    .map((o) => [km(s.lat, s.lon, o.lat, o.lon), o]).sort((a, b) => a[0] - b[0]).slice(0, NEAR_N)
    .map(([d, o]) => [o.id, r1(d)]);
  const places = (placesOfSpot.get(s.id) ?? []).sort((a, b) => a.km - b.km || a.name.localeCompare(b.name, 'de')).slice(0, 6).map((p) => [p.slug, p.name]);
  return {
    id: s.id, name: s.name, region: s.region, kinds: s.kinds, lat: s.lat, lon: s.lon,
    normal: s.normal, normalSet: s.normalFrom === 'set',
    seaArea: s.seaArea?.name ?? null, coast: s.coast?.name ?? null, wodl: s.wodlCoast,
    station: s.station ? [stationName(s.station.name), r1(s.station.km)] : null,
    cellKm: r1(s.cell.km), tidal: !!s.tidal,
    gauge: g && g[0] <= GAUGE_MAX_KM ? [g[1].name, r1(g[0])] : null,
    near, places,
  };
});

const head = `/**
 * GENERIERT von \`scripts/sea/gen-spot-seo.mjs\` aus dem Katalog \`sea/v1/static/spots.json\` (gebaut ${cat.built.slice(0, 10)}),
 * \`gauges.json\` und \`scripts/seo/data/place-modules.json\` — nicht von Hand ändern.
 *
 * Steckbrief je Spot für die SEO-Texte der Spot-Seiten (\`seaSeoText.ts\`). Nur Eigenschaften des Ortes, keine Prognose:
 * Seegebiet/Küstenabschnitt in DWD-Schreibweise (ASCII), Ufernormale in Grad (wohin die offene See zeigt), Abstand der
 * CWAM-Zelle, nächste DWD-Station [Name, km], nächster BSH-Pegel bis ${GAUGE_MAX_KM} km [Name, km], Nachbarspots derselben
 * Küste [Kennung, km], Ortsseiten mit diesem Spot als nächstem [Slug, Name]. Liegt nur im Lazy-Chunk der Texte und im Build.
 */
export interface SeaSpotFact {
  id: string; name: string; region: 'nordsee' | 'ostsee'; kinds: readonly string[]; lat: number; lon: number;
  normal: number; normalSet: boolean; seaArea: string | null; coast: string | null; wodl: 'Nordseekueste' | 'Ostseekueste';
  station: readonly [name: string, km: number] | null; cellKm: number; tidal: boolean;
  gauge: readonly [name: string, km: number] | null;
  near: ReadonlyArray<readonly [id: string, km: number]>;
  places: ReadonlyArray<readonly [slug: string, name: string]>;
}
/** Bau-Datum des Katalogs, aus dem die Steckbriefe stammen. */
export const SEA_SPOT_FACTS_BUILT = ${JSON.stringify(cat.built.slice(0, 10))};
export const SEA_SPOT_FACTS: readonly SeaSpotFact[] = [
`;
const body = rows.map((r) => `  ${JSON.stringify(r)},`).join('\n');
writeFileSync(join(ROOT, 'src/sea/seaSpotFacts.ts'), `${head}${body}\n];\n`, 'utf8');
console.log(`[sea-seo] ${rows.length} Steckbriefe → src/sea/seaSpotFacts.ts (Katalog ${cat.built.slice(0, 10)}); Pegel ≤ ${GAUGE_MAX_KM} km: ${rows.filter((r) => r.gauge).length}; mit Ortsseiten: ${rows.filter((r) => r.places.length).length}`);
if (unknownStations.size) console.warn(`[sea-seo] Stationsnamen ohne Lesenamen (bitte in STATION_NAME ergänzen): ${[...unknownStations].join(', ')}`);
