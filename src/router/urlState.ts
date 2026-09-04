/**
 * Wetterkarte · URL-Zustand (Phase RT1, pur).
 *
 * Pfad = Hauptlayer (`/wetterkarte/<slug>`), Query = alles Übrige. Reine
 * (De-)Serialisierung ohne DOM — headless prüfbar (`scripts/verify-routing.mjs`)
 * und vom Build-Generator importierbar. Regeln (Jans Vorgabe 2026-08-22):
 *
 *  - kurze Keys in FESTER Reihenfolge (`QUERY_ORDER`), damit URLs byte-stabil sind;
 *  - Koordinaten 4, Zoom 2 Nachkommastellen;
 *  - Defaults werden NICHT geschrieben (Muster `fireState.ts` „Standard-still");
 *  - bekannte Keys mit ungültigem Wert werden ignoriert (der Aufrufer entfernt
 *    sie per `replaceState`), unbekannte Keys (`startnow`, `ta`, `afEst`, `utm_*`)
 *    werden unverändert durchgereicht — sie gehören anderen Modulen.
 *
 * Slug-Tabelle als `Record<LayerKey, string>`: tsc erzwingt alle 19 Layer —
 * die Lücke von `mapState.ts` (12 von 19, V-191) kann hier nicht entstehen.
 */

import type { Country, Location } from '../types';
import { ALL_LAYER_KEYS, type LayerKey } from '../map/layerTypes';

// --- Layer ↔ Slug ------------------------------------------------------------

/** Slug-Regeln: Kleinbuchstaben, ae/oe/ue statt Umlaut, Bindestrich als Trenner. */
export const LAYER_SLUGS: Record<LayerKey, string> = {
  wind: 'wind',
  gust: 'boeen',
  nowcast: 'niederschlag',
  temp: 'temperatur',
  clouds: 'bewoelkung',
  sat: 'satellit',
  lightning: 'blitze',
  lightningfc: 'blitzprognose',
  stations: 'stationen',
  confidence: 'sicherheit',
  snowline: 'schneegrenze',
  flownowcast: 'flow-nowcast',
  poprob: 'regen-chance',
  thunder: 'gewitter',
  snow: 'schnee',
  rotation: 'rotation',
  cells: 'zellbahnen',
  hail: 'hagel',
  warnings: 'warnungen',
};

/** Seitentitel je Layer-Sub-Route (Meta + Sitemap). */
export const LAYER_SLUG_TITLE: Record<LayerKey, string> = {
  wind: 'Windkarte',
  gust: 'Böenkarte',
  nowcast: 'Niederschlagskarte',
  temp: 'Temperaturkarte',
  clouds: 'Bewölkungskarte',
  sat: 'Satellitenbild',
  lightning: 'Blitzkarte',
  lightningfc: 'Blitzprognose',
  stations: 'Wetterstationen',
  confidence: 'Vorhersage-Sicherheit',
  snowline: 'Schneefallgrenze',
  flownowcast: 'Flow-Nowcast',
  poprob: 'Regenwahrscheinlichkeit',
  thunder: 'Gewitterpotenzial',
  snow: 'Schneekarte',
  rotation: 'Rotationspotenzial',
  cells: 'Zellbahnen',
  hail: 'Hagelkarte',
  warnings: 'Amtliche Warnungen',
};

/** Meta-Description je Layer-Sub-Route (≤ 160 Zeichen, paarweise verschieden — SEO/GEO 2026 E1).
 *  Absichtlich hier statt in `src/seo/*`: der Client setzt sie beim Routenwechsel (RouteMeta),
 *  also müssen sie im Start-Bundle liegen — kurz, damit die Budget-Ratsche hält. */
export const LAYER_SLUG_DESCRIPTION: Record<LayerKey, string> = {
  wind: 'Wind in 10 m Höhe als animierte Partikel über einer Heatmap — DWD ICON-D2, 2,2 km, bis 12 h voraus; Höhenwind 850/700/500 hPa aus ICON-EU.',
  gust: 'Spitzenböen bis 24 h voraus als Fläche über DACH — DWD ICON-D2 vmax_10m, 2,2 km; für Kran, Gerüst, Drohne, Segeln und Zeltaufbau.',
  nowcast: 'Gemessenes Landesradar als DACH-Komposit: RADOLAN-RV (DE, bis 2 h), INCA (AT, bis 3 h), MeteoSchweiz — bewusst ohne Modellverlängerung.',
  temp: '2-m-Temperatur aus DWD ICON-D2, je Pixel auf das echte Gelände höhenkorrigiert — stündlich bis 24 h voraus für DE, AT und CH.',
  clouds: 'Bewölkung in drei Stockwerken (tief, mittel, hoch) aus DWD ICON-D2 — für Foto-Licht, Astro-Nächte und die Frage, ob die Sonne durchkommt.',
  sat: 'Meteosat-Satellitenbild über der Wetterkarte: Europa in Echtfarbe/Infrarot (1 km) oder Welt-Infrarot (3 km), alle 3 Stunden via DWD OpenData.',
  lightning: 'Gemessene Blitzeinschläge der letzten 60 Minuten aus dem DWD-Blitzortungsnetz — die Messung zum Gewitter, etwa alle 10 Minuten erneuert.',
  lightningfc: 'Blitzpotenzial bis 12 h voraus: der Lightning Potential Index (lpi_max) aus DWD ICON-D2 als Fläche über DACH — Prognose, nicht Messung.',
  stations: 'Rund 1 000 amtliche Messstationen in DE, AT und CH mit Live-Werten: DWD, GeoSphere TAWES und MeteoSchweiz SMN — per Klick abrufbar.',
  confidence: 'Wo die Wettervorhersage unsicher ist, als Schraffur: Ensemble-Spread beim Regen (DE) oder Klimatologie mal Laufvergleich bei der Temperatur.',
  snowline: 'Die Linie zwischen Regen und Schnee über DE, AT und CH — aus dem höhenkorrigierten ICON-D2-Feld mit gelernter Orts-Korrektur, stündlich bis 24 h.',
  flownowcast: 'Das RADOLAN-Radarbild eine Stunde weitergeschoben: Optical-Flow-Extrapolation ohne Training — nur Deutschland, nur beobachtete Bewegung.',
  poprob: 'Regenwahrscheinlichkeit in Prozent für die nächste Stunde aus einem 15-Member-Flow-Ensemble auf RADOLAN — kalibriert, nur Deutschland.',
  thunder: 'Gewitterpotenzial 0–100 aus CAPE, CIN und Blitzbereitschaft (LPI) — DWD ICON-D2, 2,2 km, bis 12 h voraus für DE, AT und CH.',
  snow: 'Schneedecke und Neuschnee in Zentimetern als Fläche über DACH — DWD ICON-D2 h_snow und snow_gsp, umschaltbar; Modell, keine Messung.',
  rotation: 'Experten-Layer: Modell-Verdachtsflächen für rotierende Gewitter aus ICON-D2 Updraft-Helicity und Supercell-Index — konservativ, kein Warnprodukt.',
  cells: 'Gewitterzellen mit amtlicher Zugbahn, Zeitmarken und Unsicherheitstrichter aus DWD KONRAD3D — alle 5 Minuten, bis 60 Minuten voraus.',
  hail: 'Hagelerkennung aus zwei Radarprodukten: MeteoSchweiz MESHS/POH als Fläche (Apr–Sep) und DWD-KONRAD-Hagelzellen — Ostösterreich ohne Quelle.',
  warnings: 'Amtliche Wetterwarnungen von DWD und MeteoSchweiz wortwörtlich auf der Karte — landkreisgenau, alle 5 Minuten; Österreich folgt.',
};

export const SLUG_TO_LAYER: Readonly<Record<string, LayerKey>> = Object.fromEntries(
  (Object.entries(LAYER_SLUGS) as [LayerKey, string][]).map(([k, s]) => [s, k]),
);

export const DEFAULT_MAP_LAYER: LayerKey = 'wind';

export function layerFromSlug(slug: string | undefined | null): LayerKey | null {
  if (!slug) return null;
  return SLUG_TO_LAYER[slug] ?? null;
}

/** Sentinel in `l=`: „kein Layer aktiv" (leeres Set ist ein gültiger Zustand). */
export const NO_LAYERS = '-';

/**
 * Pfad-Slug + `l=` → aktives Set. Reihenfolge-unabhängig: Set = {Pfad} ∪ l.
 * `invalid` nennt die Slugs, die nicht auflösbar waren (Aufrufer entfernt sie).
 */
export function layersFromRoute(
  primarySlug: string | undefined | null,
  l: string | null | undefined,
): { primary: LayerKey | null; all: LayerKey[]; invalid: string[]; noLayers: boolean } {
  const invalid: string[] = [];
  const primary = primarySlug ? layerFromSlug(primarySlug) : null;
  if (primarySlug && !primary) invalid.push(primarySlug);
  const set = new Set<LayerKey>();
  if (primary) set.add(primary);
  let noLayers = false;
  if (l === NO_LAYERS) {
    noLayers = true;
  } else if (l) {
    for (const s of l.split(',')) {
      if (!s) continue;
      const k = layerFromSlug(s);
      if (k) set.add(k); else invalid.push(s);
    }
  }
  // Kanonische Ordnung (Katalogreihenfolge) → deterministische Ausgabe.
  const all = ALL_LAYER_KEYS.filter((k) => set.has(k));
  return { primary, all, invalid, noLayers };
}

/**
 * Aktives Set → Hauptlayer (Pfad) + Rest (`l=`). `preferredPrimary` ist der
 * zuletzt EINgeschaltete Layer (Nutzer-Intention); liegt er nicht mehr im Set,
 * gewinnt der erste aktive Layer in Katalogreihenfolge.
 */
export function routeForLayers(
  all: ReadonlySet<LayerKey> | readonly LayerKey[],
  preferredPrimary: LayerKey | null,
): { primary: LayerKey | null; rest: LayerKey[] } {
  const set = new Set(all);
  const ordered = ALL_LAYER_KEYS.filter((k) => set.has(k));
  const primary = preferredPrimary && set.has(preferredPrimary) ? preferredPrimary : (ordered[0] ?? null);
  return { primary, rest: ordered.filter((k) => k !== primary) };
}

// --- Query ----------------------------------------------------------------------

export interface MapCamera { lat: number; lon: number; zoom: number }

export interface MapUrlState {
  /** Hauptlayer (Pfadsegment). `null` = kein Layer (`l=-`). */
  primary: LayerKey | null;
  /** Alle aktiven Layer inkl. Hauptlayer. */
  layers: readonly LayerKey[];
  cam?: MapCamera | null;
  /** Slider-Stunde ab jetzt (0 = jetzt). Wird als `t` (Gültigkeitszeit) geschrieben. */
  hour?: number;
  /** Modell des aktiven Landes (Katalog-ID); `'native'`/undefined = weglassen. */
  model?: string | null;
  /** Punktquelle Fusion⇄Native; Default `fusion` = weglassen. */
  point?: 'fusion' | 'native';
  /** Landesradar-Schalter; nur `false` wird geschrieben (`radar=0`). */
  radar?: boolean;
  /** Gesuchter Ort (Marker + Punktpanel) — NICHT die Kamera. */
  place?: Location | null;
  /** Aktives Land (ohne Ort): `land=` aus dem Modell-Switcher. */
  country?: Country | null;
}

export const QUERY_ORDER = ['lat', 'lon', 'z', 't', 'l', 'modell', 'mode', 'radar', 'ort', 'olat', 'olon', 'land'] as const;
export type QueryKey = (typeof QUERY_ORDER)[number];
const KNOWN_KEYS: ReadonlySet<string> = new Set(QUERY_ORDER);

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const r2 = (n: number) => Math.round(n * 1e2) / 1e2;
const fmt = (n: number, d: number) => {
  // Keine Exponentialschreibweise, keine Nachlauf-Nullen („9.1830" → „9.183").
  const s = n.toFixed(d);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

export const ZOOM_MIN = 2;
export const ZOOM_MAX = 18;

function finite(s: string | null): number | null {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Gültigkeitszeit → Slider-Stunde ab `nowMs` (0,1-h-Raster). Vergangenheit ⇒ 0 (= jetzt). */
export function hourFromValidTime(t: string, nowMs: number): number | null {
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  const h = Math.round(((ms - nowMs) / 3_600_000) * 10) / 10;
  return h < 0 ? 0 : h;
}

/** Slider-Stunde → ISO-Minute UTC (auf 10 min gerundet). `h ≤ 0` ⇒ kein `t` (= jetzt). */
export function validTimeFromHour(h: number, nowMs: number): string | undefined {
  if (!Number.isFinite(h) || h <= 0) return undefined;
  const ms = Math.round((nowMs + h * 3_600_000) / 600_000) * 600_000;
  return new Date(ms).toISOString().slice(0, 16) + 'Z';
}

const COUNTRIES: readonly Country[] = ['DE', 'AT', 'CH'];
function countryFrom(s: string | null): Country | null {
  if (!s) return null;
  const up = s.toUpperCase();
  return (COUNTRIES as readonly string[]).includes(up) ? (up as Country) : null;
}

export interface ParsedMapSearch {
  cam: MapCamera | null;
  /** Slider-Stunde aus `t`; undefined = nicht gesetzt. */
  hour?: number;
  /** `l=` roh (Slugs) — die Auflösung gegen den Pfad macht `layersFromRoute`. */
  l: string | null;
  model: string | null;
  point?: 'fusion' | 'native';
  radar?: boolean;
  place: Location | null;
  country: Country | null;
  /** Bekannte Keys mit ungültigem Wert — vom Aufrufer aus der URL zu entfernen. */
  invalid: string[];
  /** Unbekannte Keys — unverändert durchzureichen. */
  extra: Array<[string, string]>;
}

/**
 * Query → Zustand. `isModel` prüft `modell` gegen die Katalog-Whitelist (wird
 * injiziert, damit dieses Modul den Katalog nicht in den Start-Chunk zieht).
 */
export function parseMapSearch(
  search: string,
  nowMs: number,
  isModel: (id: string) => boolean = () => true,
): ParsedMapSearch {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const invalid: string[] = [];
  const extra: Array<[string, string]> = [];
  for (const [k, v] of p.entries()) if (!KNOWN_KEYS.has(k)) extra.push([k, v]);

  let cam: MapCamera | null = null;
  const lat = finite(p.get('lat')), lon = finite(p.get('lon')), z = finite(p.get('z'));
  const hasCam = p.has('lat') || p.has('lon') || p.has('z');
  if (hasCam) {
    if (lat != null && lon != null && z != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && z >= ZOOM_MIN && z <= ZOOM_MAX) {
      cam = { lat: r4(lat), lon: r4(lon), zoom: r2(z) };
    } else {
      for (const k of ['lat', 'lon', 'z']) if (p.has(k)) invalid.push(k);
    }
  }

  let hour: number | undefined;
  if (p.has('t')) {
    const h = hourFromValidTime(p.get('t') ?? '', nowMs);
    if (h == null) invalid.push('t'); else hour = h;
  }

  const l = p.get('l');

  let model: string | null = null;
  if (p.has('modell')) {
    const m = p.get('modell') ?? '';
    if (m && m !== 'native' && isModel(m)) model = m; else invalid.push('modell');
  }

  let point: 'fusion' | 'native' | undefined;
  if (p.has('mode')) {
    const m = p.get('mode');
    if (m === 'fusion' || m === 'native') point = m; else invalid.push('mode');
  }

  let radar: boolean | undefined;
  if (p.has('radar')) {
    const r = p.get('radar');
    if (r === '0') radar = false; else if (r === '1') radar = true; else invalid.push('radar');
  }

  let place: Location | null = null;
  const country = countryFrom(p.get('land'));
  if (p.has('land') && !country) invalid.push('land');
  if (p.has('ort') || p.has('olat') || p.has('olon')) {
    const name = (p.get('ort') ?? '').trim();
    const olat = finite(p.get('olat')), olon = finite(p.get('olon'));
    if (name && olat != null && olon != null && Math.abs(olat) <= 90 && Math.abs(olon) <= 180) {
      place = { name, lat: r4(olat), lon: r4(olon), country: country ?? 'DE' };
    } else {
      for (const k of ['ort', 'olat', 'olon']) if (p.has(k)) invalid.push(k);
    }
  }

  return { cam, hour, l, model, point, radar, place, country, invalid, extra };
}

/** Zustand → Query-String (`''` oder `?…`), Keys in `QUERY_ORDER`, Defaults weggelassen. */
export function buildMapSearch(s: MapUrlState, nowMs: number, extra: ReadonlyArray<[string, string]> = []): string {
  const out: Array<[string, string]> = [];
  if (s.cam) {
    out.push(['lat', fmt(r4(s.cam.lat), 4)], ['lon', fmt(r4(s.cam.lon), 4)], ['z', fmt(r2(s.cam.zoom), 2)]);
  }
  const t = s.hour != null ? validTimeFromHour(s.hour, nowMs) : undefined;
  if (t) out.push(['t', t]);
  const rest = ALL_LAYER_KEYS.filter((k) => s.layers.includes(k) && k !== s.primary);
  if (!s.primary && s.layers.length === 0) out.push(['l', NO_LAYERS]);
  else if (rest.length) out.push(['l', rest.map((k) => LAYER_SLUGS[k]).join(',')]);
  if (s.model && s.model !== 'native') out.push(['modell', s.model]);
  if (s.point === 'native') out.push(['mode', 'native']);
  if (s.radar === false) out.push(['radar', '0']);
  if (s.place) {
    out.push(['ort', s.place.name], ['olat', fmt(r4(s.place.lat), 4)], ['olon', fmt(r4(s.place.lon), 4)], ['land', s.place.country.toLowerCase()]);
  } else if (s.country && s.country !== 'DE') {
    // Ohne Ort: nur ein vom Default (DE, `initialModelSourceState`) abweichendes Land.
    out.push(['land', s.country.toLowerCase()]);
  }
  const p = new URLSearchParams();
  for (const [k, v] of out) p.set(k, v);
  for (const [k, v] of extra) if (!KNOWN_KEYS.has(k)) p.append(k, v);
  const q = p.toString();
  return q ? `?${q}` : '';
}

/** Vollständige App-URL (Pfad + Query) für die Wetterkarte bzw. `/warnungen`. */
export function buildMapUrl(
  s: MapUrlState,
  nowMs: number,
  base: '/wetterkarte' | '/warnungen' = '/wetterkarte',
  extra: ReadonlyArray<[string, string]> = [],
): string {
  const path = base === '/warnungen'
    ? '/warnungen'
    : s.primary ? `/wetterkarte/${LAYER_SLUGS[s.primary]}` : '/wetterkarte';
  return path + buildMapSearch(s, nowMs, extra);
}

/** Deep-Link auf einen Ort (Startseiten-Suche: Wind wie bisher; Geo-Seiten: Temperatur): Marker + Punktpanel, Kamera = DACH-Fit. */
export function mapPathForPlace(loc: Location, layer: LayerKey = DEFAULT_MAP_LAYER): string {
  return buildMapUrl({ primary: layer, layers: [layer], place: loc }, 0);
}

// --- Regenradar: Ort + Kamera -----------------------------------------------------

/** Query des Regenradars: nur Ort-Gruppe + Kamera (keine Layer, keine Stunde). */
export function buildRadarSearch(place: Location | null, cam: MapCamera | null, extra: ReadonlyArray<[string, string]> = []): string {
  return buildMapSearch({ primary: 'wind', layers: ['wind'], cam, place }, 0, extra);
}

// --- Kamera allein -------------------------------------------------------------------

export function parseCameraSearch(search: string): { cam: MapCamera | null; invalid: string[] } {
  const { cam, invalid } = parseMapSearch(search, 0);
  return { cam, invalid: invalid.filter((k) => k === 'lat' || k === 'lon' || k === 'z') };
}

export function withCameraSearch(search: string, cam: MapCamera | null): string {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const keep: Array<[string, string]> = [];
  for (const [k, v] of p.entries()) if (k !== 'lat' && k !== 'lon' && k !== 'z') keep.push([k, v]);
  const out = new URLSearchParams();
  if (cam) { out.set('lat', fmt(r4(cam.lat), 4)); out.set('lon', fmt(r4(cam.lon), 4)); out.set('z', fmt(r2(cam.zoom), 2)); }
  for (const [k, v] of keep) out.append(k, v);
  const q = out.toString();
  return q ? `?${q}` : '';
}

// --- Selbstverifikation -----------------------------------------------------------

export interface UrlStateCheck { name: string; ok: boolean; detail?: string }

export function verifyUrlState(): { checks: UrlStateCheck[]; passed: number; failed: number } {
  const checks: UrlStateCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const now = Date.UTC(2026, 7, 22, 12, 0);

  // Slug-Bijektion über alle 19 Layer.
  const slugs = Object.values(LAYER_SLUGS);
  add('19 Layer, 19 Slugs, keine Dubletten', slugs.length === ALL_LAYER_KEYS.length && new Set(slugs).size === slugs.length, `${slugs.length}/${ALL_LAYER_KEYS.length}`);
  add('Slugs folgen der Regel [a-z0-9-]', slugs.every((s) => /^[a-z0-9-]+$/.test(s)));
  add('Slug → Layer → Slug ist identisch', ALL_LAYER_KEYS.every((k) => layerFromSlug(LAYER_SLUGS[k]) === k));

  // Roundtrip mit fester Ordnung und Rundung.
  const state: MapUrlState = {
    primary: 'temp', layers: ['wind', 'temp', 'stations'],
    cam: { lat: 48.77512345, lon: 9.18349, zoom: 8.004 }, hour: 3,
    model: 'icon-d2', point: 'native', radar: false,
    place: { name: 'Stuttgart', lat: 48.7758, lon: 9.1829, country: 'DE' },
  };
  const url = buildMapUrl(state, now);
  add('URL-Form: Pfad = Hauptlayer, Query in fester Ordnung',
    url === '/wetterkarte/temperatur?lat=48.7751&lon=9.1835&z=8&t=2026-08-22T15%3A00Z&l=wind%2Cstationen&modell=icon-d2&mode=native&radar=0&ort=Stuttgart&olat=48.7758&olon=9.1829&land=de', url);
  const back = parseMapSearch(url.slice(url.indexOf('?')), now);
  const { all } = layersFromRoute('temperatur', back.l);
  add('Roundtrip: Layer-Set identisch', all.join(',') === 'wind,temp,stations', all.join(','));
  add('Roundtrip: Kamera gerundet identisch', !!back.cam && back.cam.lat === 48.7751 && back.cam.lon === 9.1835 && back.cam.zoom === 8);
  add('Roundtrip: Stunde aus t', back.hour === 3, String(back.hour));
  add('Roundtrip: Modell/Mode/Radar/Ort', back.model === 'icon-d2' && back.point === 'native' && back.radar === false && back.place?.name === 'Stuttgart' && back.place.country === 'DE');
  add('Roundtrip: kein Invalid, kein Extra', back.invalid.length === 0 && back.extra.length === 0);

  // Defaults werden nicht geschrieben.
  add('Defaults schreiben nichts', buildMapUrl({ primary: 'wind', layers: ['wind'], hour: 0, point: 'fusion', radar: true, model: 'native' }, now) === '/wetterkarte/wind');
  add('Leeres Set ⇒ l=-', buildMapUrl({ primary: null, layers: [] }, now) === '/wetterkarte?l=-');
  add('l=- wird als „keine Layer" gelesen', layersFromRoute(undefined, NO_LAYERS).noLayers && layersFromRoute(undefined, NO_LAYERS).all.length === 0);

  // Ungültiges wird genannt, Unbekanntes durchgereicht.
  const bad = parseMapSearch('?lat=abc&lon=9&z=99&t=gestern&modell=foo&mode=x&radar=2&ort=&olat=1&olon=2&land=fr&startnow=0&ta=0&afEst=1', now, (id) => id === 'icon-d2');
  add('Ungültige Kamera/t/modell/mode/radar/ort/land werden gemeldet',
    ['lat', 'lon', 'z', 't', 'modell', 'mode', 'radar', 'ort', 'olat', 'olon', 'land'].every((k) => bad.invalid.includes(k)), bad.invalid.join(','));
  add('startnow/ta/afEst bleiben erhalten', bad.extra.map(([k]) => k).join(',') === 'startnow,ta,afEst');
  add('Extra-Keys werden beim Schreiben angehängt', buildMapUrl({ primary: 'wind', layers: ['wind'] }, now, '/wetterkarte', bad.extra) === '/wetterkarte/wind?startnow=0&ta=0&afEst=1');
  add('Unbekannter Slug wird gemeldet, Rest bleibt', (() => { const r = layersFromRoute('xyz', 'wind,foo'); return r.primary === null && r.all.join() === 'wind' && r.invalid.join() === 'xyz,foo'; })());

  // Zeit: Vergangenheit ⇒ 0, Rundung 10 min, Minute-Präzision.
  add('t in der Vergangenheit ⇒ Stunde 0', hourFromValidTime('2026-08-22T09:00Z', now) === 0);
  add('t unparsbar ⇒ null', hourFromValidTime('gestern', now) === null);
  add('t auf 10 min gerundet (2,45 h → 14:30)', validTimeFromHour(2.45, now) === '2026-08-22T14:30Z');
  add('Stunde 0 ⇒ kein t', validTimeFromHour(0, now) === undefined);

  // Hauptlayer-Wahl.
  add('Hauptlayer = zuletzt eingeschalteter, sonst Katalogerster', routeForLayers(['temp', 'wind'], 'temp').primary === 'temp' && routeForLayers(['temp', 'wind'], null).primary === 'wind' && routeForLayers(['temp', 'wind'], 'hail').primary === 'wind');
  add('Ort-Deeplink', mapPathForPlace({ name: 'München', lat: 48.1371, lon: 11.5754, country: 'DE' }, 'temp') === '/wetterkarte/temperatur?ort=M%C3%BCnchen&olat=48.1371&olon=11.5754&land=de' && mapPathForPlace({ name: 'Wien', lat: 48.2, lon: 16.37, country: 'AT' }).startsWith('/wetterkarte/wind?'));
  add('Kamera-Query (Regenradar) ersetzt nur lat/lon/z', withCameraSearch('?lat=1&lon=2&z=3&ta=0', { lat: 48.1, lon: 11.5, zoom: 9 }) === '?lat=48.1&lon=11.5&z=9&ta=0');

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
