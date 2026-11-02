/**
 * Autobahnwetter-SEO (Phase SA, audit/seo-autobahnwetter.md): erzeugt `src/road/roadSeoFacts.ts`, die Zahlen hinter den
 * 20 Autobahn-Seiten `/autobahnwetter/<slug>` — aus denselben statischen Dateien, die die Seite selbst lädt.
 *
 * Warum erzeugt: Die Seiten sollen sich nicht nur im Namen unterscheiden (Googles „scaled content"). Jede Zahl hier ist eine
 * Zählung oder ein Wert aus dem Daten-Repo, mit Herkunft im Kopf der erzeugten Datei — nichts ist geschätzt oder von Hand
 * gesetzt. Neu laufen lassen, wenn sich Korridore, Abschnitte oder die Stationsliste im Daten-Repo ändern.
 *
 * Eingänge (buscosun-data):
 *   road/v1/static/corridors.json   Achsen und Teilstrecken (BKG DLM250), km je Teilstrecke
 *   road/v1/static/segments.json    Abschnitte Anschluss zu Anschluss (OSM), Brücken-, Wald-, Niederungs- und Freilage-Merkmale
 *   road/v1/static/stations.json    DWD-Stationsliste der Glättemeldeanlagen (Straße, Bundesland, Höhe)
 *   road/fc/v1/static/points.json   Lage der Messstellen (wie auf der Karte)
 *   road/fc/v1/static/geo.json      Geländehöhe je Punkt (Terrarium) — Gegenprobe der Höhe aus der Stationsliste
 *
 * Aufruf:
 *   node scripts/seo/build-road-seo-facts.mjs --data C:\dev\buscosun-data     (lokaler Klon des Daten-Repos)
 *   node scripts/seo/build-road-seo-facts.mjs                                  (lädt die fünf Dateien von raw.githubusercontent.com)
 *   node scripts/seo/build-road-seo-facts.mjs --check …                        (schreibt nicht, meldet nur Abweichung)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'road', 'roadSeoFacts.ts');
const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/';

const argv = process.argv.slice(2);
const dataDir = (() => { const i = argv.indexOf('--data'); return i >= 0 ? argv[i + 1] : null; })();
const CHECK = argv.includes('--check');

/** Die Liste der Seiten selbst (`src/road/roadSeo.ts`); fehlt hier eine Autobahn, meldet `verify-routing` ihre Seite ohne Text. */
const { ROAD_SEO_MOTORWAYS } = await import('../../src/road/roadSeo.ts');

async function load(rel) {
  if (dataDir) {
    const p = join(dataDir, ...rel.split('/'));
    if (!existsSync(p)) throw new Error(`${p} fehlt`);
    return JSON.parse(readFileSync(p, 'utf8'));
  }
  const res = await fetch(RAW + rel);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res.json();
}

const [corridorsDoc, segmentsDoc, stationsDoc, pointsDoc, geoDoc] = await Promise.all([
  load('road/v1/static/corridors.json'), load('road/v1/static/segments.json'), load('road/v1/static/stations.json'),
  load('road/fc/v1/static/points.json'), load('road/fc/v1/static/geo.json'),
]);

/**
 * Bundesländer, aus denen der DWD derzeit keine Reihen ausliefert (V-AW-20: Ordner LW und SD für Baden-Württemberg kommen
 * leer an). Die Anlagen stehen in der Stationsliste, die Seite zeigt dort nur die Prognose.
 */
const NO_SERIES_STATES = new Set(['BW']);
/** Höhe aus der Stationsliste zählt nur, wenn das Höhenmodell am Messpunkt höchstens so weit abweicht (m). */
const HEIGHT_TOLERANCE_M = 60;

/**
 * Die Stationsliste schreibt Umlaute aus („Fuessen", „Bruecke"). Eine pauschale Rückwandlung wäre falsch (Soest, Coesfeld,
 * Kues), deshalb nur diese geprüften Namen; alles andere bleibt, wie der DWD es schreibt.
 */
const NAME_FIX = {
  'Rottachtal Bruecke': 'Brücke im Rottachtal', 'Irschenberg Bruecke': 'Brücke am Irschenberg', Fuessen: 'Füssen', Wuestenbrand: 'Wüstenbrand', Frankenhoehe: 'Frankenhöhe',
  Ravensmuehle: 'Ravensmühle', 'Tiefenbachtalbruecke': 'Tiefenbachtalbrücke', 'Talbruecke St. Kilian': 'Talbrücke St. Kilian',
  'Bielefelder Berg Tms': 'Bielefelder Berg', 'TB Trockau': 'Talbrücke Trockau', 'Sichter TB': 'Talbrücke Sichter',
  'Steinegge-Exter TB': 'Talbrücke Steinegge-Exter', 'Apfelbaumgrund TB': 'Talbrücke Apfelbaumgrund', 'Fulmecke TB': 'Talbrücke Fulmecke',
  'AD Hochfranken': 'Autobahndreieck Hochfranken',
};
/** Namen, deren Schreibweise oder Bedeutung sich nicht prüfen ließ — sie erscheinen in keinem Satz. */
const NAME_SKIP = new Set(['Heli Ost', 'Moelenbarg', 'Graenscheid']);
/** Kennungen statt Namen (etwa „V539") taugen nicht für einen Satz. */
const looksLikeCode = (n) => /^[A-Z]{0,2}\d{2,}$/.test(n.trim());

const STATE_NAME = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland',
  SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
};

const stationEntries = Array.isArray(stationsDoc.stations) ? stationsDoc.stations : Object.entries(stationsDoc.stations);
const stationPoints = new Map(pointsDoc.points.filter((p) => p.kind === 'station').map((p) => [p.id, p]));
const demAt = new Map();
for (const [key, v] of geoDoc.entries) if (key.startsWith('terrain/')) demAt.set(`${v.lat.toFixed(4)},${v.lon.toFixed(4)}`, v.elevationM);
const round = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
const segName = (s) => s.name.replace(/;/g, ' / ');
/** Abschnitte, deren Anfang und Ende gleich heißen („Hof – Hof"), sagen im Satz nichts. */
const namedSeg = (s) => s.from && s.to && s.from !== s.to;

/**
 * Nachbar-Autobahnen für die Querverweise: zwei der 20 Autobahnen „treffen sich", wenn ihre Achsen sich auf höchstens
 * MEET_KM nähern (Kreuz, Dreieck, gemeinsame Strecke). Gerechnet auf einem Raster, nicht von Hand gepflegt.
 */
const MEET_KM = 1.5;
const cell = 0.02;
const grid = new Map();
const kmBetween = (a, b) => {
  const dx = (a[0] - b[0]) * 111.32 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  const dy = (a[1] - b[1]) * 110.57;
  return Math.hypot(dx, dy);
};
const slugs = ROAD_SEO_MOTORWAYS.map(([s]) => s);
for (const c of corridorsDoc.corridors) {
  const slug = c.road.toLowerCase();
  if (!slugs.includes(slug)) continue;
  for (const pt of c.line) {
    const k = `${Math.floor(pt[0] / cell)},${Math.floor(pt[1] / cell)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([slug, pt]);
  }
}
const meets = Object.fromEntries(slugs.map((s) => [s, new Set()]));
for (const [k, list] of grid) {
  const [gx, gy] = k.split(',').map(Number);
  const near = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) near.push(...(grid.get(`${gx + dx},${gy + dy}`) ?? []));
  for (const [a, pa] of list) for (const [b, pb] of near) if (a !== b && !meets[a].has(b) && kmBetween(pa, pb) <= MEET_KM) { meets[a].add(b); meets[b].add(a); }
}

const facts = {};
for (const [slug, , ] of ROAD_SEO_MOTORWAYS) {
  const road = slug.toUpperCase();
  const corridors = corridorsDoc.corridors.filter((c) => c.road === road);
  if (!corridors.length) throw new Error(`${road}: kein Korridor in corridors.json`);
  const main = corridors.filter((c) => !c.spur).sort((a, b) => b.lengthKm - a.lengthKm);
  const segs = segmentsDoc.segments.filter((s) => s.road === road);
  const stations = stationEntries.filter(([, v]) => v.kind === 'A' && v.road === road);
  const byState = {};
  for (const [, v] of stations) byState[v.bl] = (byState[v.bl] ?? 0) + 1;
  const ranked = stations
    .map(([id, v]) => {
      const pt = stationPoints.get(id);
      const dem = pt ? demAt.get(`${pt.lat.toFixed(4)},${pt.lon.toFixed(4)}`) : undefined;
      const name = NAME_FIX[v.n] ?? v.n;
      return { name, state: v.bl, h: v.h, ok: typeof v.h === 'number' && typeof dem === 'number' && Math.abs(v.h - dem) <= HEIGHT_TOLERANCE_M && !looksLikeCode(v.n) && !NAME_SKIP.has(v.n) };
    })
    .filter((x) => x.ok)
    .sort((a, b) => b.h - a.h)
    .map(({ name, state, h }) => ({ name, state, h: Math.round(h) }));
  const highest = ranked.slice(0, 3);
  // Liegen ALLE höchsten Anlagen in einem Land ohne Reihen, nennt die Seite zusätzlich die höchsten MIT Messreihe.
  const highestWithSeries = highest.length && highest.every((x) => NO_SERIES_STATES.has(x.state)) ? ranked.filter((x) => !NO_SERIES_STATES.has(x.state)).slice(0, 2) : [];
  const segKm = segs.reduce((a, s) => a + s.lengthKm, 0);
  const bridgeKm = segs.reduce((a, s) => a + s.lengthKm * (s.f?.bridge ?? 0), 0);
  const forestKm = segs.reduce((a, s) => a + s.lengthKm * (s.f?.forest ?? 0), 0);
  const pick = (pred) => [...new Set(segs.filter((x) => namedSeg(x) && pred(x)).sort((a, b) => b.lengthKm - a.lengthKm).map(segName))].slice(0, 3);
  facts[slug] = {
    road,
    km: Math.round(main.reduce((a, c) => a + c.lengthKm, 0)),
    parts: main.map((c) => ({ id: c.id, from: c.from, to: c.to, km: Math.round(c.lengthKm), ...(c.gap ? { gap: true } : {}) })),
    segments: segs.length,
    stations: stations.length,
    byState: Object.entries(byState).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    noSeries: stations.filter(([, v]) => NO_SERIES_STATES.has(v.bl)).length,
    highest,
    highestWithSeries,
    bridgeKm: round(bridgeKm),
    forestPct: segKm ? Math.round((100 * forestKm) / segKm) : 0,
    lowland: pick((s) => s.f?.lowland),
    exposed: pick((s) => s.f?.exposed),
    meets: slugs.filter((x) => meets[slug].has(x)),
  };
}

const allMotorwayStations = stationEntries.filter(([, v]) => v.kind === 'A');
const totals = {
  stations: allMotorwayStations.length,
  noSeries: allMotorwayStations.filter(([, v]) => NO_SERIES_STATES.has(v.bl)).length,
  corridors: corridorsDoc.corridors.length,
  segments: segmentsDoc.segments.length,
  km: Math.round(corridorsDoc.corridors.filter((c) => !c.spur).reduce((a, c) => a + c.lengthKm, 0)),
};

const stand = {
  corridors: corridorsDoc.builtAt?.slice(0, 10) ?? null,
  segments: segmentsDoc.builtAt?.slice(0, 10) ?? null,
  stationList: stationsDoc.source?.fetchedAt?.slice(0, 10) ?? null,
};

const header = `/**
 * ERZEUGT von scripts/seo/build-road-seo-facts.mjs — NICHT VON HAND ÄNDERN.
 *
 * Zahlen hinter den Autobahn-Seiten /autobahnwetter/<slug> (audit/seo-autobahnwetter.md). Jede Zahl ist eine Zählung aus dem
 * Daten-Repo buscosun-data:
 *   km, parts      road/v1/static/corridors.json (BKG DLM250, ohne Stichäste), Stand ${stand.corridors}
 *   segments, bridgeKm, forestPct, lowland, exposed
 *                  road/v1/static/segments.json (OSM-Anschlussstellen und -Brücken, ESA WorldCover, Terrarium), Stand ${stand.segments}
 *   stations, byState, noSeries, highest
 *                  road/v1/static/stations.json (DWD-Stationsliste der Glättemeldeanlagen), abgerufen ${stand.stationList};
 *                  „highest" nur, wenn das Höhenmodell am Messpunkt höchstens ${HEIGHT_TOLERANCE_M} m von der Listenhöhe abweicht
 *   meets          Nachbarn: Achsen der 20 Autobahnen nähern sich auf ≤ ${MEET_KM} km (corridors.json)
 *   noSeries       Anlagen in Ländern, aus denen der DWD derzeit keine Reihen liefert (${[...NO_SERIES_STATES].join(', ')}, V-AW-20)
 *
 * Nur die Text-Chunks lesen diese Datei (subRouteTexts.ts, generate-seo.mjs) — nie das Start-Bundle.
 */`;

const body = `${header}

export interface RoadSeoFacts {
  road: string;
  /** Länge der Teilstrecken in Deutschland (km, Achse BKG DLM250, ohne Stichäste). */
  km: number;
  /** Teilstrecken (Korridore der Seite), längste zuerst; \`gap\` = Teilstück ohne Messstelle. */
  parts: ReadonlyArray<{ id: string; from: string; to: string; km: number; gap?: true }>;
  /** Abschnitte Anschlussstelle zu Anschlussstelle (wie in der Gefahren-Leiste). */
  segments: number;
  /** Glättemeldeanlagen dieser Autobahn in der DWD-Stationsliste. */
  stations: number;
  /** Anlagen je Bundesland (Kürzel, Anzahl), meiste zuerst. */
  byState: ReadonlyArray<readonly [state: string, n: number]>;
  /** davon in Ländern ohne ausgelieferte Reihen. */
  noSeries: number;
  /** Höchstgelegene Anlagen (Höhe laut Stationsliste, mit dem Höhenmodell gegengeprüft). */
  highest: ReadonlyArray<{ name: string; state: string; h: number }>;
  /** Nur gefüllt, wenn alle unter \`highest\` ohne Reihen sind: die zwei höchsten MIT Messreihe. */
  highestWithSeries: ReadonlyArray<{ name: string; state: string; h: number }>;
  /** Brückenlänge entlang der Achse (km, OSM). */
  bridgeKm: number;
  /** Waldanteil neben der Fahrbahn (%, ESA WorldCover, 50-m-Band). */
  forestPct: number;
  /** Bis zu drei Abschnitte in Niederungen (Kaltluft, Nebel), längste zuerst. */
  lowland: readonly string[];
  /** Bis zu drei Abschnitte in freier Lage (Seitenwind), längste zuerst. */
  exposed: readonly string[];
  /** Andere der 20 Autobahnen, deren Achse sich auf höchstens ${MEET_KM} km nähert (Kreuz, Dreieck). */
  meets: readonly string[];
}

export const ROAD_SEO_STATE_NAME: Readonly<Record<string, string>> = ${JSON.stringify(STATE_NAME)};

/** Alle Autobahnen zusammen: Anlagen in der Stationsliste (davon ohne Reihen), Teilstrecken, Abschnitte, km. */
export const ROAD_SEO_TOTALS = ${JSON.stringify(totals)} as const;

/** Stand der Eingänge (ISO-Datum). */
export const ROAD_SEO_FACTS_STAND = ${JSON.stringify(stand)} as const;

export const ROAD_SEO_FACTS: Readonly<Record<string, RoadSeoFacts>> = ${JSON.stringify(facts, null, 2)};
`;

const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
if (CHECK) {
  if (current === body) { console.log('road-seo-facts: aktuell'); process.exit(0); }
  console.error('road-seo-facts: VERALTET — ohne --check laufen lassen und einchecken.'); process.exit(1);
}
writeFileSync(OUT, body, 'utf8');
console.log(`road-seo-facts: ${Object.keys(facts).length} Autobahnen → ${OUT}`);
for (const [slug, f] of Object.entries(facts)) {
  console.log(`  ${slug}: ${f.km} km, ${f.stations} Anlagen (${f.byState.map(([s, n]) => `${s} ${n}`).join(', ')}), höchste ${f.highest.map((h) => `${h.name} ${h.h} m`).join(' · ')}`);
}
