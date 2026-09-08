/**
 * Wetterkarte · URL-Zustand (Phase RT1, pur; erweitert in SH1 „Teilen").
 *
 * Pfad = Hauptlayer + optionaler Ort (`/wetterkarte/<layer>[/<ort-slug>]`),
 * Query = alles Übrige. Reine (De-)Serialisierung ohne DOM — headless prüfbar
 * (`scripts/verify-routing.mjs`, `scripts/verify-share.mjs`) und vom
 * Build-Generator importierbar. Regeln (Jans Vorgabe 2026-08-22, ergänzt 2026-09-08):
 *
 *  - kurze Keys in FESTER Reihenfolge (`QUERY_ORDER`), damit URLs byte-stabil sind;
 *  - Koordinaten 4, Zoom **1** Nachkommastelle (SH1: 0,1 Zoomstufe ≈ 7 % Maßstab —
 *    für einen geteilten Link genug, und es spart in jeder URL Zeichen);
 *  - Defaults werden NICHT geschrieben (Muster `fireState.ts` „Standard-still");
 *  - geschrieben wird mit `encodeShareQuery` statt `URLSearchParams.toString()`,
 *    damit `:` und `()` roh bleiben (`t=2026-09-12T15:00Z` statt `…15%3A00Z`);
 *    **gelesen** wird weiterhin mit `URLSearchParams` — es versteht beide Formen,
 *    also bleibt jeder bestehende Link gültig;
 *  - bekannte Keys mit ungültigem Wert werden ignoriert (der Aufrufer entfernt
 *    sie per `replaceState`), unbekannte Keys (`startnow`, `ta`, `afEst`, `utm_*`)
 *    werden unverändert durchgereicht — sie gehören anderen Modulen.
 *
 * **Der Ort-Slug wird hier NICHT aufgelöst.** Die Ortstabelle wiegt 3,5 KB gzip
 * und dieses Modul liegt im eager Start-Chunk (Ratsche `eagerJs` 107,9 über
 * IST 106,3). Der Aufrufer — ein lazy Seiten-Wrapper — reicht Slug und
 * „steht in der Tabelle" herein, genau wie `isModel` bei `parseMapSearch`.
 *
 * Slug-Tabelle als `Record<LayerKey, string>`: tsc erzwingt alle 19 Layer —
 * die Lücke von `mapState.ts` (12 von 19, V-191) kann hier nicht entstehen.
 */

import type { Country, Location } from '../types';
import { ALL_LAYER_KEYS, type LayerKey } from '../map/layerTypes';
import {
  encodeShareQuery, fmtCoord, fmtZoom, formatValidTime, parseValidTime, roundTo, TIME_GRID_MS,
} from '../share/shareSchema';
import { deSlugName, isSlugShape, slugCarriesName } from '../share/placeSlug';

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
  /**
   * SH1: Ort als LESBARES Pfadsegment (`/wetterkarte/wind/muenchen`). Kommt vom
   * Aufrufer (`slugForPlace` aus `src/share/placeTable.ts`) — dieses Modul zieht
   * die Ortstabelle nicht in den Start-Chunk.
   */
  placeSlug?: string | null;
  /**
   * SH1: Der Slug steht in der Ortstabelle und trägt Name, Koordinate und Land
   * selbst ⇒ `ort`, `olat` und `olon` entfallen (−46 Zeichen). `land` wird auch
   * dann geschrieben, wenn es von `DE` abweicht: `prefetch.ts` liegt im
   * index-Chunk, kennt die Tabelle nicht und entscheidet daran den RV-Frühstart.
   */
  placeInTable?: boolean;
}

export const QUERY_ORDER = ['lat', 'lon', 'z', 't', 'l', 'modell', 'mode', 'radar', 'ort', 'olat', 'olon', 'land'] as const;
export type QueryKey = (typeof QUERY_ORDER)[number];
const KNOWN_KEYS: ReadonlySet<string> = new Set(QUERY_ORDER);

const r4 = (n: number) => roundTo(n, 4);
/** SH1: Zoom wird auf EINE Nachkommastelle geschrieben (vorher zwei). */
const rz = (n: number) => roundTo(n, 1);

export const ZOOM_MIN = 2;
export const ZOOM_MAX = 18;

function finite(s: string | null): number | null {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Gültigkeitszeit → Slider-Stunde ab `nowMs` (0,1-h-Raster). Vergangenheit ⇒ 0.
 *
 * ⚠ Dass ein zu alter Link still auf „jetzt" klemmt, ist der Defekt **V-SH-2**:
 * Absender und Empfänger sehen dann Verschiedenes, ohne dass es jemand sagt.
 * `hourFromValidTimeDetailed` liefert dieselbe Zahl **plus** die Auskunft, ob
 * geklemmt wurde — die UI kann das ab SH2 benennen.
 */
export function hourFromValidTime(t: string, nowMs: number): number | null {
  return hourFromValidTimeDetailed(t, nowMs).hour;
}

export interface SharedTime { hour: number | null; /** Der geteilte Zeitpunkt lag in der Vergangenheit. */ past: boolean }

export function hourFromValidTimeDetailed(t: string, nowMs: number): SharedTime {
  const ms = parseValidTime(t) ?? Date.parse(t);
  if (!Number.isFinite(ms)) return { hour: null, past: false };
  const h = Math.round(((ms - nowMs) / 3_600_000) * 10) / 10;
  return h < 0 ? { hour: 0, past: true } : { hour: h, past: false };
}

/** Slider-Stunde → ISO-Minute UTC (auf 10 min gerundet). `h ≤ 0` ⇒ kein `t` (= jetzt). */
export function validTimeFromHour(h: number, nowMs: number): string | undefined {
  if (!Number.isFinite(h) || h <= 0) return undefined;
  return formatValidTime(Math.round((nowMs + h * 3_600_000) / TIME_GRID_MS) * TIME_GRID_MS);
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
  /** SH1/V-SH-2: `t` lag in der Vergangenheit und wurde auf „jetzt" geklemmt. */
  timePast?: boolean;
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
      cam = { lat: r4(lat), lon: r4(lon), zoom: rz(z) };
    } else {
      for (const k of ['lat', 'lon', 'z']) if (p.has(k)) invalid.push(k);
    }
  }

  let hour: number | undefined;
  let timePast: boolean | undefined;
  if (p.has('t')) {
    const { hour: h, past } = hourFromValidTimeDetailed(p.get('t') ?? '', nowMs);
    if (h == null) invalid.push('t'); else { hour = h; if (past) timePast = true; }
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
    // SH1: der NAME darf fehlen — bei einem Link mit Ort-Slug im Pfad trägt der
    // Pfad ihn (`/wetterkarte/wind/muenchen`), und `ort=` steht nur da, wenn der
    // Slug den Namen nicht verlustfrei trägt. Die Koordinate bleibt Pflicht:
    // ein `?ort=Foo` ohne Punkt ist und bleibt ungültig.
    if (olat != null && olon != null && Math.abs(olat) <= 90 && Math.abs(olon) <= 180) {
      place = { name, lat: r4(olat), lon: r4(olon), country: country ?? 'DE' };
    } else {
      for (const k of ['ort', 'olat', 'olon']) if (p.has(k)) invalid.push(k);
    }
  }

  return { cam, hour, timePast, l, model, point, radar, place, country, invalid, extra };
}

/** Zustand → Query-String (`''` oder `?…`), Keys in `QUERY_ORDER`, Defaults weggelassen. */
export function buildMapSearch(s: MapUrlState, nowMs: number, extra: ReadonlyArray<[string, string]> = []): string {
  const out: Array<[string, string]> = [];
  if (s.cam) {
    out.push(['lat', fmtCoord(s.cam.lat)], ['lon', fmtCoord(s.cam.lon)], ['z', fmtZoom(s.cam.zoom)]);
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
    if (s.placeSlug && s.placeInTable) {
      // Der Slug im Pfad trägt Name, Koordinate und Land. Geschrieben wird nur
      // noch ein vom Default abweichendes Land — `prefetch.ts` (index-Chunk,
      // ohne Ortstabelle) entscheidet daran den RADOLAN-Frühstart.
      if (s.place.country !== 'DE') out.push(['land', s.place.country.toLowerCase()]);
    } else {
      // Freier Ort: Koordinate immer, Name nur, wenn der Slug ihn nicht trägt
      // („bad-reichenhall" trägt ihn, „muenchen" und „feldberg-schwarzwald" nicht).
      if (s.place.name && !(s.placeSlug && slugCarriesName(s.placeSlug, s.place.name))) {
        out.push(['ort', s.place.name]);
      }
      out.push(['olat', fmtCoord(s.place.lat)], ['olon', fmtCoord(s.place.lon)], ['land', s.place.country.toLowerCase()]);
    }
  } else if (s.country && s.country !== 'DE') {
    // Ohne Ort: nur ein vom Default (DE, `initialModelSourceState`) abweichendes Land.
    out.push(['land', s.country.toLowerCase()]);
  }
  // Feste Ordnung: Bekanntes in `QUERY_ORDER`, Fremdes hinten dran.
  const ordered = QUERY_ORDER.flatMap((k) => out.filter(([ok]) => ok === k));
  for (const [k, v] of extra) if (!KNOWN_KEYS.has(k)) ordered.push([k, v]);
  return encodeShareQuery(ordered);
}

/**
 * Vollständige App-URL (Pfad + Query) für die Wetterkarte bzw. `/warnungen`.
 * SH1: der Ort-Slug wird als drittes Pfadsegment angehängt — er ist NIE
 * kanonisch (`canonicalPath()` schneidet ihn ab) und nie in der Sitemap.
 */
export function buildMapUrl(
  s: MapUrlState,
  nowMs: number,
  base: '/wetterkarte' | '/warnungen' = '/wetterkarte',
  extra: ReadonlyArray<[string, string]> = [],
): string {
  const head = base === '/warnungen'
    ? '/warnungen'
    : s.primary ? `/wetterkarte/${LAYER_SLUGS[s.primary]}` : '/wetterkarte';
  // Ohne Layer gibt es kein drittes Segment — `/wetterkarte/muenchen` wäre nicht
  // von einem vertippten Layer-Slug zu unterscheiden (s. `routeForPath`).
  const canCarryPlace = base === '/warnungen' || !!s.primary;
  const path = s.place && s.placeSlug && canCarryPlace && isSlugShape(s.placeSlug)
    ? `${head}/${s.placeSlug}`
    : head;
  return path + buildMapSearch(s, nowMs, extra);
}

/**
 * Deep-Link auf einen Ort (Startseiten-Suche: Wind; Geo-Seiten: Temperatur):
 * Marker + Punktpanel, Kamera = DACH-Fit.
 *
 * `slug`/`inTable` kommen vom Aufrufer (`slugForPlace`, `src/share/placeTable.ts`);
 * ohne sie entsteht die alte reine Query-Form — beide sind gültig.
 * `scripts/seo/content.mjs` (`mapPermalink`) muss dieselbe Zeichenkette
 * erzeugen; `verify:routing` prüft das.
 */
export function mapPathForPlace(
  loc: Location,
  layer: LayerKey = DEFAULT_MAP_LAYER,
  slug?: { slug: string; inTable: boolean } | null,
): string {
  return buildMapUrl({
    primary: layer, layers: [layer], place: loc,
    placeSlug: slug?.slug ?? null, placeInTable: !!slug?.inTable,
  }, 0);
}

// --- Regenradar: Ort + Kamera -----------------------------------------------------

/** Vollständige Regenradar-URL: Ort-Slug im Pfad, Kamera in der Query. */
export function buildRadarUrl(
  place: Location | null,
  slug: { slug: string; inTable: boolean } | null,
  cam: MapCamera | null,
  extra: ReadonlyArray<[string, string]> = [],
): string {
  const path = place && slug && isSlugShape(slug.slug) ? `/regenradar/${slug.slug}` : '/regenradar';
  return path + buildMapSearch({
    primary: 'wind', layers: ['wind'], cam, place,
    placeSlug: slug?.slug ?? null, placeInTable: !!slug?.inTable,
  }, 0, extra);
}

// --- Ort aus Pfad + Query ------------------------------------------------------------

export interface RoutePlace {
  place: Location | null;
  /** Slug des Pfadsegments (auch wenn unauflösbar) — für die kanonische Rückschreibung. */
  slug: string | null;
  /** Der Ort kommt vollständig aus der Tabelle (⇒ `ort`/`olat`/`olon` dürfen fehlen). */
  inTable: boolean;
  /** Ein Slug stand im Pfad, ließ sich aber weder auflösen noch mit `olat`/`olon` retten. */
  unresolved: boolean;
}

/**
 * Ort-Slug (Pfad) + `ort`/`olat`/`olon` (Query) → EIN Ort.
 *
 * `fromTable` wird injiziert (`placeBySlug` aus `src/share/placeTable.ts`),
 * damit die 3,5-KB-Tabelle nicht in den Start-Chunk gerät.
 *
 * Vorrang: **die Koordinate aus der Query gewinnt** — sie ist der Punkt, den der
 * Absender wirklich gewählt hat; der Tabelleneintrag ist nur das Ortszentrum.
 * Der Name kommt aus `ort=`, sonst aus der Tabelle, sonst notdürftig aus dem
 * Slug. Ein Slug ohne jede Auflösung ist **kein Fehler**: die Seite öffnet im
 * DACH-Überblick und sagt es (Vorgabe „robust gegen kaputte Links").
 */
export function placeFromRoute(
  slug: string | null | undefined,
  queryPlace: Location | null,
  fromTable: (slug: string) => Location | null,
): RoutePlace {
  const s = isSlugShape(slug) ? slug : null;
  const table = s ? fromTable(s) : null;
  if (queryPlace) {
    const name = queryPlace.name || table?.name || (s ? deSlugName(s) : '');
    // Ohne jeden Namen bleibt es wie bisher: kein Ort (ein namenloser Marker
    // wäre in Suchfeld und Punktpanel eine leere Behauptung).
    if (!name) return { place: null, slug: s, inTable: false, unresolved: !!s };
    return { place: { ...queryPlace, name }, slug: s, inTable: false, unresolved: false };
  }
  if (table) return { place: table, slug: s, inTable: true, unresolved: false };
  return { place: null, slug: s, inTable: false, unresolved: !!s };
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
  const out: Array<[string, string]> = [];
  if (cam) out.push(['lat', fmtCoord(cam.lat)], ['lon', fmtCoord(cam.lon)], ['z', fmtZoom(cam.zoom)]);
  return encodeShareQuery([...out, ...keep]);
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
  // SH1: `t` und `l` tragen jetzt rohe `:` und `,` — genau das ist der Unterschied
  // zwischen einem lesbaren Link und Prozentsalat (`…T15%3A00Z&l=wind%2Cstationen`).
  add('URL-Form: Pfad = Hauptlayer, Query in fester Ordnung, ohne unnötige Prozentkodierung',
    url === '/wetterkarte/temperatur?lat=48.7751&lon=9.1835&z=8&t=2026-08-22T15:00Z&l=wind,stationen&modell=icon-d2&mode=native&radar=0&ort=Stuttgart&olat=48.7758&olon=9.1829&land=de', url);
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
  const bad = parseMapSearch('?lat=abc&lon=9&z=99&t=gestern&modell=foo&mode=x&radar=2&ort=&olat=abc&olon=2&land=fr&startnow=0&ta=0&afEst=1', now, (id) => id === 'icon-d2');
  add('Ungültige Kamera/t/modell/mode/radar/ort/land werden gemeldet',
    ['lat', 'lon', 'z', 't', 'modell', 'mode', 'radar', 'ort', 'olat', 'olon', 'land'].every((k) => bad.invalid.includes(k)), bad.invalid.join(','));
  // SH1: der NAME darf fehlen, solange die Koordinate steht (Ort-Slug im Pfad);
  // die Koordinate allein zu verlieren bleibt ein Fehler.
  add('ort= leer + gültige Koordinate ⇒ Punkt bleibt, kein Invalid',
    (() => { const r = parseMapSearch('?ort=&olat=48.1&olon=11.5', now); return r.place?.lat === 48.1 && r.place.name === '' && r.invalid.length === 0; })());
  add('ort= ohne Koordinate bleibt ungültig',
    (() => { const r = parseMapSearch('?ort=Foo', now); return r.place === null && r.invalid.includes('ort'); })());
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
  const muc = { name: 'München', lat: 48.1371, lon: 11.5754, country: 'DE' as Country };
  add('Ort-Deeplink ohne Slug bleibt die reine Query-Form (rückwärtskompatibel)',
    mapPathForPlace(muc, 'temp') === '/wetterkarte/temperatur?ort=M%C3%BCnchen&olat=48.1371&olon=11.5754&land=de',
    mapPathForPlace(muc, 'temp'));
  add('Kamera-Query (Regenradar) ersetzt nur lat/lon/z', withCameraSearch('?lat=1&lon=2&z=3&ta=0', { lat: 48.1, lon: 11.5, zoom: 9 }) === '?lat=48.1&lon=11.5&z=9&ta=0');

  // --- SH1: Ort als Pfadsegment ---------------------------------------------
  add('Tabellenort ⇒ nur der Slug im Pfad, keine ort/olat/olon-Gruppe',
    mapPathForPlace(muc, 'temp', { slug: 'muenchen', inTable: true }) === '/wetterkarte/temperatur/muenchen',
    mapPathForPlace(muc, 'temp', { slug: 'muenchen', inTable: true }));
  add('Tabellenort außerhalb DE trägt land= (prefetch kennt die Tabelle nicht)',
    mapPathForPlace({ name: 'Wien', lat: 48.2083, lon: 16.3731, country: 'AT' }, 'temp', { slug: 'wien', inTable: true }) === '/wetterkarte/temperatur/wien?land=at');
  add('Freier Ort: Slug im Pfad UND Koordinate in der Query',
    mapPathForPlace({ name: 'Feldberg (Schwarzwald)', lat: 47.8744, lon: 8.0043, country: 'DE' }, 'wind', { slug: 'feldberg-schwarzwald', inTable: false })
    === '/wetterkarte/wind/feldberg-schwarzwald?ort=Feldberg%20(Schwarzwald)&olat=47.8744&olon=8.0043&land=de',
    mapPathForPlace({ name: 'Feldberg (Schwarzwald)', lat: 47.8744, lon: 8.0043, country: 'DE' }, 'wind', { slug: 'feldberg-schwarzwald', inTable: false }));
  add('ohne Layer kein Ortssegment (sonst nicht von einem Tippfehler zu unterscheiden)',
    buildMapUrl({ primary: null, layers: [], place: muc, placeSlug: 'muenchen', placeInTable: true }, now) === '/wetterkarte?l=-');
  add('/warnungen trägt den Ort ohne Layer-Segment',
    buildMapUrl({ primary: 'warnings', layers: ['warnings'], place: muc, placeSlug: 'muenchen', placeInTable: true }, now, '/warnungen') === '/warnungen/muenchen');
  add('Regenradar-URL: Slug im Pfad, Kamera in der Query',
    buildRadarUrl(muc, { slug: 'muenchen', inTable: true }, { lat: 48.1374, lon: 11.5755, zoom: 8 }) === '/regenradar/muenchen?lat=48.1374&lon=11.5755&z=8',
    buildRadarUrl(muc, { slug: 'muenchen', inTable: true }, { lat: 48.1374, lon: 11.5755, zoom: 8 }));
  add('Regenradar ohne Ort bleibt /regenradar', buildRadarUrl(null, null, null) === '/regenradar');

  // Auflösung Pfad + Query → EIN Ort (Tabelle injiziert).
  const table = (s: string) => (s === 'muenchen' ? muc : null);
  add('placeFromRoute: Tabellenslug allein genügt',
    (() => { const r = placeFromRoute('muenchen', null, table); return r.inTable && r.place?.name === 'München' && !r.unresolved; })());
  add('placeFromRoute: Query-Koordinate gewinnt gegen das Ortszentrum',
    (() => { const r = placeFromRoute('muenchen', { name: '', lat: 48.15, lon: 11.6, country: 'DE' }, table); return r.place?.lat === 48.15 && r.place.name === 'München' && !r.inTable; })());
  add('placeFromRoute: Name aus dem Slug, wenn weder ort= noch Tabelle',
    (() => { const r = placeFromRoute('bad-reichenhall', { name: '', lat: 47.7, lon: 12.9, country: 'DE' }, table); return r.place?.name === 'Bad Reichenhall'; })());
  add('placeFromRoute: unauflösbarer Slug ⇒ kein Ort, kein Wurf, aber gemeldet',
    (() => { const r = placeFromRoute('gibtsnicht', null, table); return r.place === null && r.unresolved && r.slug === 'gibtsnicht'; })());
  add('placeFromRoute: kaputtes Segment wird gar nicht erst als Slug gelesen',
    (() => { const r = placeFromRoute('Nicht Ein Slug', null, table); return r.slug === null && !r.unresolved; })());
  add('Rundlauf Tabellenort: URL → Ort → dieselbe URL',
    (() => {
      const u = mapPathForPlace(muc, 'temp', { slug: 'muenchen', inTable: true });
      const q = u.includes('?') ? u.slice(u.indexOf('?')) : '';
      const r = placeFromRoute('muenchen', parseMapSearch(q, now).place, table);
      return mapPathForPlace(r.place!, 'temp', { slug: r.slug!, inTable: r.inTable }) === u;
    })());

  // V-SH-2: ein alter Link klemmt auf „jetzt" — das muss sichtbar sein.
  add('t in der Vergangenheit wird als solche gemeldet (V-SH-2)',
    (() => { const r = parseMapSearch('?t=2026-08-22T09:00Z', now); return r.hour === 0 && r.timePast === true; })());
  add('t in der Zukunft meldet nichts', parseMapSearch('?t=2026-08-22T15:00Z', now).timePast === undefined);

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
