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
 *   node scripts/sea/gen-spot-seo.mjs [--data=../buscosun-data] [--dk=<spots-dk.json>]
 *
 * Phase DK: die dänischen Spots stehen in `sea/v1/static/spots-dk.json` (eigene Datei); `--dk` nennt sie, solange sie
 * noch nicht im Checkout des Daten-Repos liegt. Ihre Steckbriefe tragen `country: 'DK'`, keinen Küstenabschnitt und
 * `dk` (woher Wind und Wasserstand kommen).
 *
 * Neue oder umbenannte Spots ⇒ zuerst den Katalog im Daten-Repo bauen, dann dieses Skript; `verify:sea-seo` prüft, dass
 * Steckbriefe, Namenstabelle (`seaSpotNames.ts`) und Handliste (`spots-src.json`) dieselben Kennungen tragen.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

const dkFile = typeof args.dk === 'string' ? resolve(ROOT, args.dk) : join(DATA, 'sea/v1/static/spots-dk.json');
const dkCat = existsSync(dkFile) ? J(dkFile) : null;
const ids = new Set(cat.spots.map((s) => s.id));
const spots = [...cat.spots, ...(dkCat?.spots ?? []).filter((s) => s.country === 'DK' && !ids.has(s.id))];
/** Teilmodelle des DMI-Sturmflutmodells in Worten (wie `DMI_WL_COLLECTION_LABEL` in `src/sea/seaDmi.ts`). */
const DKSS = { dkss_lb: 'Kleiner Belt', dkss_idw: 'Innere dänische Gewässer', dkss_ws: 'Wattenmeer', dkss_nsbs: 'Nordsee–Ostsee' };
// Phase BS: die Seespots aus `sea/v1/static/spots-lakes.json` (`--lakes` nennt die Datei, solange sie nicht im Checkout liegt).
const lakeFile = typeof args.lakes === 'string' ? resolve(ROOT, args.lakes) : join(DATA, 'sea/v1/static/spots-lakes.json');
const lakeCat = existsSync(lakeFile) ? J(lakeFile) : null;
const lakeOf = Object.fromEntries((lakeCat?.lakes ?? []).map((l) => [l.id, l]));
const LAND = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', FR: 'Frankreich', IT: 'Italien', HU: 'Ungarn' };
const NET = { dwd10: 'DWD', tawes: 'GeoSphere Austria', smn: 'MeteoSchweiz' };
const lakeSpots = (lakeCat?.spots ?? []).filter((s) => s.lake && lakeOf[s.lake.id]);
const lakeRows = lakeSpots.map((s) => {
  const l = lakeOf[s.lake.id];
  const same = lakeSpots.filter((o) => o.id !== s.id && o.lake.id === s.lake.id).map((o) => [km(s.lat, s.lon, o.lat, o.lon), o]).sort((a, b) => a[0] - b[0]);
  const other = lakeSpots.filter((o) => o.lake.id !== s.lake.id).map((o) => [km(s.lat, s.lon, o.lat, o.lon), o]).sort((a, b) => a[0] - b[0]);
  const near = [...same, ...other].slice(0, NEAR_N).map(([d, o]) => [o.id, r1(d)]);
  // Ortsseiten bis 6 km vom Spot (die Tabelle Ort → nächster Spot kennt nur die Küste).
  const places = PLACES_ALL.map((p) => [km(s.lat, s.lon, p.lat, p.lon), p]).filter(([d]) => d <= 6).sort((a, b) => a[0] - b[0]).slice(0, 3).map(([, p]) => [p.slug, p.name]);
  const fmax = Math.max(...s.lake.fetch), w = s.lake.stations.wind;
  return {
    id: s.id, name: s.name, region: 'binnensee', kinds: s.kinds, lat: s.lat, lon: s.lon, normal: s.normal, normalSet: false,
    seaArea: null, coast: null, wodl: null, station: w ? [w.name === w.name.toUpperCase() ? w.name.charAt(0) + w.name.slice(1).toLowerCase() : w.name, r1(w.km)] : null, cellKm: 0, tidal: false, gauge: null, near, places,
    lake: {
      id: l.id, name: l.name, land: LAND[s.lake.land], lands: l.lands.map((x) => LAND[x] ?? x), elevM: Math.round(l.elevM), depthM: l.depthM, areaKm2: l.areaKm2,
      fetchKm: r1(fmax / 1000), fetchFrom: s.lake.fetch.indexOf(fmax) * 10, cell: s.lake.warncell?.name ?? null, service: l.service[0] ? [l.service[0].name, l.service[0].url] : null,
      stationNet: w ? NET[w.net] ?? w.net : null, wt: s.lake.stations.wt?.name ?? null, model: !!s.lake.model, level: s.lake.stations.level ? [s.lake.stations.level.net, s.lake.stations.level.name] : null, outline: l.outline.source,
    },
  };
});
const rows = spots.map((s) => {
  const g = gauges.gauges.map((x) => [km(s.lat, s.lon, x.lat, x.lon), x]).sort((a, b) => a[0] - b[0])[0];
  const near = spots.filter((o) => o.id !== s.id && o.region === s.region)
    .map((o) => [km(s.lat, s.lon, o.lat, o.lon), o]).sort((a, b) => a[0] - b[0]).slice(0, NEAR_N)
    .map(([d, o]) => [o.id, r1(d)]);
  const places = (placesOfSpot.get(s.id) ?? []).sort((a, b) => a.km - b.km || a.name.localeCompare(b.name, 'de')).slice(0, 6).map((p) => [p.slug, p.name]);
  return {
    id: s.id, name: s.name, region: s.region, ...(s.country === 'DK' ? { country: 'DK' } : {}), kinds: s.kinds, lat: s.lat, lon: s.lon,
    normal: s.normal, normalSet: s.normalFrom === 'set',
    seaArea: s.seaArea?.name ?? null, coast: s.coast?.name ?? null, wodl: s.wodlCoast,
    station: s.station ? [s.station.net === 'dmi' ? s.station.name : stationName(s.station.name), r1(s.station.km)] : null,
    cellKm: r1(s.cell.km), tidal: !!s.tidal,
    gauge: s.country === 'DK' ? (s.dk?.wl?.from === 'bsh' ? [s.dk.wl.name, r1(s.dk.wl.km)] : null) : g && g[0] <= GAUGE_MAX_KM ? [g[1].name, r1(g[0])] : null,
    near, places,
    ...(s.country === 'DK' ? { dk: { wind: s.dk.wind, wl: s.dk.wl ? (s.dk.wl.from === 'dmi' ? ['dmi', DKSS[s.dk.wl.coll] ?? s.dk.wl.coll, r1(s.dk.wl.km)] : ['bsh', s.dk.wl.name, r1(s.dk.wl.km)]) : null } } : {}),
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
  id: string; name: string; region: 'nordsee' | 'ostsee' | 'binnensee'; kinds: readonly string[]; lat: number; lon: number;
  /**
   * Phase BS: ein Seespot (Revier 'binnensee') — der See mit Ländern, Seespiegel (m ü. M.), mittlerer Tiefe (m), Fläche (km²), die
   * längste Strecke über den See vom Spot aus (km) und ihre Richtung (Grad, woher der Wind dann kommt), DWD-Warnzelle oder
   * null, zuständiger Dienst, Netz der Windstation, WSV-Pegel mit Wassertemperatur oder null, ob das Seenmodell den See rechnet,
   * Pegel [Netz, Name] oder null, Quelle des Umrisses. Kein Seegebiet, kein Küstenabschnitt, keine CWAM-Zelle (cellKm 0).
   */
  lake?: {
    id: string; name: string; land: string; lands: readonly string[]; elevM: number; depthM: number; areaKm2: number; fetchKm: number; fetchFrom: number;
    cell: string | null; service: readonly [name: string, url: string] | null; stationNet: string | null; wt: string | null; model: boolean; level: readonly [net: string, name: string] | null; outline: string;
  };
  /** Phase DK: fehlt = Deutschland. Ein dänischer Spot hat keinen Küstenabschnitt (coast, wodl null), seine Station ist eine des DMI. */
  country?: 'DK';
  /** Phase DK: Wind aus buscosun Fusion (im Punkt-Cube) oder DMI HARMONIE; Wasserstand vom BSH-Pegel oder vom DMI-Modell DKSS [Art, Name, km]. */
  dk?: { wind: 'fusion' | 'dmi'; wl: readonly [from: 'bsh' | 'dmi', name: string, km: number] | null };
  normal: number; normalSet: boolean; seaArea: string | null; coast: string | null; wodl: 'Nordseekueste' | 'Ostseekueste' | null;
  station: readonly [name: string, km: number] | null; cellKm: number; tidal: boolean;
  gauge: readonly [name: string, km: number] | null;
  near: ReadonlyArray<readonly [id: string, km: number]>;
  places: ReadonlyArray<readonly [slug: string, name: string]>;
}
/** Bau-Datum des Katalogs, aus dem die Steckbriefe stammen. */
export const SEA_SPOT_FACTS_BUILT = ${JSON.stringify(cat.built.slice(0, 10))};
export const SEA_SPOT_FACTS: readonly SeaSpotFact[] = [
`;
const body = [...rows, ...lakeRows].map((r) => `  ${JSON.stringify(r)},`).join('\n');
writeFileSync(join(ROOT, 'src/sea/seaSpotFacts.ts'), `${head}${body}\n];\n`, 'utf8');
console.log(`[sea-seo] ${rows.length} + ${lakeRows.length} (Seen) Steckbriefe → src/sea/seaSpotFacts.ts (Katalog ${cat.built.slice(0, 10)}); Pegel ≤ ${GAUGE_MAX_KM} km: ${rows.filter((r) => r.gauge).length}; mit Ortsseiten: ${rows.filter((r) => r.places.length).length}`);
if (unknownStations.size) console.warn(`[sea-seo] Stationsnamen ohne Lesenamen (bitte in STATION_NAME ergänzen): ${[...unknownStations].join(', ')}`);
