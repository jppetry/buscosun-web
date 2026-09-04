/**
 * App-Routen (Phase RT1, pur).
 *
 * EINE Tabelle für Router (`router.tsx`), Meta (`RouteMeta.tsx`), Build-Generator
 * (`scripts/generate-seo.mjs`: Route-Shells + Sitemap) und Verifier
 * (`scripts/verify-routing.mjs`). Kein React, kein DOM — Node importiert die
 * Datei per `--experimental-strip-types`, deshalb nur löschbare Typen (kein
 * `enum`, keine Parameter-Properties).
 *
 * Pfadregeln (Jans Vorgabe 2026-08-22): Kleinbuchstaben, keine Umlaute
 * (ae/oe/ue), Bindestrich, KEIN End-Slash. Kanonisch ist immer der Pfad ohne
 * Query — die Query trägt Kartenzustand (`urlState.ts`), der nie indexiert wird.
 */

import type { FeatureId } from '../App';
import { ALL_LAYER_KEYS } from '../map/layerTypes';
import { LAYER_SLUGS, LAYER_SLUG_TITLE } from './urlState';

/** Kanonische Origin — deckungsgleich mit `scripts/seo/content.mjs` (O-03); der Verifier prüft das. */
export const SITE_URL = 'https://buscosun.com';
export const SITE_NAME = 'buscosun';

export type RouteId =
  | 'home' | 'wetterkarte' | 'warnungen' | 'regenradar' | 'vorhersage' | 'tourenplanung' | 'eventplanung'
  | 'wetterarchiv' | 'atmosphaere' | 'globus' | 'waldbrand' | 'feedback' | 'validierung' | 'mobiletest';

export interface RouteMeta {
  /** `<title>` (ohne Marken-Suffix — der wird zentral angehängt). */
  title: string;
  description: string;
  /** H1 + Lead der statischen Route-Shell (crawlbarer Inhalt ohne JS). */
  h1: string;
  lead: string;
  ogImage?: string;
  noindex?: boolean;
}

export interface SubRoute {
  slug: string;
  title: string;
  description: string;
  /** Sicht, die ohne Nutzereingabe leer ist (3D braucht eine hochgeladene Strecke) ⇒ nicht in die Sitemap. */
  noindex?: boolean;
}

export interface RouteDef {
  id: RouteId;
  /** Kanonischer Pfad, ohne End-Slash. */
  path: string;
  /** 301-Aliase (Server, `netlify.toml`) + clientseitig `<Navigate replace>` in Dev/Preview. */
  aliases: readonly string[];
  /** Welches App-Feature die Route rendert (App.tsx-FeatureId); null = Start/404. */
  featureId: FeatureId | null;
  /** Sub-Routen (`/<path>/<slug>`), null = keine. */
  subs: readonly SubRoute[] | null;
  /** Welcher Pfadparameter die Sub-Route trägt (für `router.tsx`). */
  subParam?: 'layer' | 'lens' | 'view';
  meta: RouteMeta;
}

const LAYER_SUBS: readonly SubRoute[] = ALL_LAYER_KEYS.map((k) => ({
  slug: LAYER_SLUGS[k],
  title: `${LAYER_SLUG_TITLE[k]} DACH`,
  description: `${LAYER_SLUG_TITLE[k]} für Deutschland, Österreich und die Schweiz auf der interaktiven buscosun-Wetterkarte — amtliche Quellen, höhenkorrigiert, ohne Tracker.`,
}));

export const ATMOSPHERE_LENS_SLUGS = {
  fly: 'fliegen',
  mountain: 'berg-und-weg',
  section: 'querschnitt',
} as const;
export type AtmosphereLensSlug = (typeof ATMOSPHERE_LENS_SLUGS)[keyof typeof ATMOSPHERE_LENS_SLUGS];

export const FIRE_VIEW_SLUGS = ['gefahrenindex', 'aktive-braende', 'trockenheit'] as const;

export const ROUTES: readonly RouteDef[] = [
  {
    id: 'home', path: '/', aliases: [], featureId: null, subs: null,
    meta: {
      title: 'Wetter DE · AT · CH',
      description: 'DACH-Wetter: Karte, Regenradar, Tourenplanung, Event-Tag, Vorhersage, Historie — höhenkorrigiert, ohne Tracker.',
      h1: 'Wetter für Deutschland, Österreich & die Schweiz',
      lead: 'buscosun ist eine kostenlose, tracker-freie Wetter-Web-App für Deutschland, Österreich und die Schweiz: interaktive Wetterkarte, Regenradar, Tourenplanung, Event-Planung, Vorhersage mit Konfidenz, Klimahistorie, Atmosphäre und Brandradar — aus amtlichen Quellen (DWD, GeoSphere Austria, MeteoSwiss), über ein Geländemodell höhenkorrigiert, ohne Konto und ohne Werbung.',
    },
  },
  {
    id: 'wetterkarte', path: '/wetterkarte', aliases: ['/karte', '/map'], featureId: 'map2d', subs: LAYER_SUBS, subParam: 'layer',
    meta: {
      title: 'Interaktive Wetterkarte DACH',
      description: 'Wind, Niederschlag, Temperatur, Wolken, Böen, Gewitter und amtliche Warnungen für Deutschland, Österreich und die Schweiz auf einer Karte — aus DWD, GeoSphere und MeteoSchweiz.',
      h1: 'Interaktive Wetterkarte für Deutschland, Österreich und die Schweiz',
      lead: 'Die Wetterkarte von buscosun legt Wind, Niederschlagsradar, höhenkorrigierte Temperatur, Bewölkung, Böen, Gewitterpotenzial, Blitze, Stationen und amtliche Warnungen als frei kombinierbare Layer über eine flüssige Vektorkarte — mit Zeit-Schieber (beim Start auf die nächsten zwei Stunden begrenzt, beim ersten Ziehen bis 48 Stunden) und Modellwahl je Land, aus amtlichen Quellen, ohne Konto und ohne Tracker.',
      ogImage: '/og/wetterkarte.png',
    },
  },
  {
    id: 'warnungen', path: '/warnungen', aliases: ['/unwetterwarnungen', '/warnung'], featureId: 'map2d', subs: null,
    meta: {
      title: 'Amtliche Unwetterwarnungen DE · CH',
      description: 'Amtliche Wetterwarnungen von DWD und MeteoSchweiz wortwörtlich auf der Karte — landkreisgenau, alle 5 Minuten, mit Zeit-Schieber. Österreich folgt.',
      h1: 'Amtliche Unwetterwarnungen für Deutschland und die Schweiz',
      lead: 'buscosun zeigt die amtlichen Wetterwarnungen des Deutschen Wetterdienstes und von MeteoSchweiz als Flächen auf der Karte — Überschrift, Beschreibung und Handlungshinweis wortwörtlich aus der amtlichen Meldung, alle fünf Minuten aktualisiert, mit dem Zeit-Schieber für die kommenden Stunden. Für Österreich warnt GeoSphere Austria; dieser Layer fehlt noch und wird als Lücke ausgewiesen.',
    },
  },
  {
    id: 'regenradar', path: '/regenradar', aliases: ['/niederschlagsradar', '/radar', '/regen'], featureId: 'nowcast', subs: null,
    meta: {
      title: 'Regenradar & Nowcast DACH',
      description: 'Gemessenes Niederschlagsradar für Deutschland, Österreich und die Schweiz mit Nowcast bis 2 Stunden — RADOLAN, INCA und MeteoSchweiz, minutengenau.',
      h1: 'Regenradar für Deutschland, Österreich und die Schweiz',
      lead: 'Das Regenradar von buscosun zeigt den gemessenen Niederschlag der drei Landesradare — RADOLAN-RV in Deutschland, INCA in Österreich, das MeteoSchweiz-Radar in der Schweiz — als Animation mit Rückblick und amtlichem Nowcast bis zu zwei Stunden voraus, inklusive Regen, Schnee, Hagel und Sturmzellen.',
    },
  },
  {
    id: 'vorhersage', path: '/vorhersage', aliases: ['/wettervorhersage', '/forecast'], featureId: 'forecast', subs: null,
    meta: {
      title: 'Wettervorhersage mit Konfidenz & Modellvergleich',
      description: 'Vorhersage für jeden Ort in DACH mit ausgewiesener Sicherheit — mehrere Modelle im Vergleich, ehrlich statt scheingenau.',
      h1: 'Wettervorhersage mit Konfidenz und Modellvergleich',
      lead: 'Die Vorhersage von buscosun stellt mehrere Wettermodelle nebeneinander und weist aus, wie sicher eine Aussage ist — aus der Streuung der Modelle und der Vorlaufzeit. Statt einer scheingenauen Zahl siehst du, wo sich die Modelle einig sind und wo nicht.',
    },
  },
  {
    id: 'tourenplanung', path: '/tourenplanung', aliases: ['/touren', '/tour'], featureId: 'route', subParam: 'view',
    subs: [
      {
        slug: '3d',
        title: '3D-Ansicht — Wetter entlang der Route',
        description: 'Die Strecke als Geländeschnitt: Windwand, Regen, Wolkenbasis und Warnzonen über dem Höhenprofil, gekoppelt an Kilometer und Ankunftszeit.',
        // Ohne hochgeladene Strecke zeigt die Sicht nichts — kein sinnvolles Suchergebnis.
        noindex: true,
      },
    ],
    meta: {
      title: 'Tourenplanung — Wetter entlang der Route',
      description: 'GPX hochladen und das Wetter Kilometer für Kilometer entlang deiner Rad-, Wander- oder E-Bike-Tour sehen — mit Zeitplan und Höhenprofil.',
      h1: 'Wetter entlang deiner Route',
      lead: 'Die Tourenplanung von buscosun liest eine GPX-Datei ein und berechnet für jeden Streckenabschnitt, welches Wetter dich zur voraussichtlichen Ankunftszeit erwartet — Temperatur, Wind, Regen und Böen, höhenkorrigiert über das Geländemodell, für Wandern, Rennrad, Gravel und E-Bike.',
    },
  },
  {
    id: 'eventplanung', path: '/eventplanung', aliases: ['/events', '/event'], featureId: 'event', subs: null,
    meta: {
      title: 'Event-Planung — der beste Tag',
      description: 'Welcher Tag passt am besten? buscosun bewertet Wetterfenster für Hochzeit, Grillabend, Drohnenflug oder Outdoor-Event und schlägt einen Plan B vor.',
      h1: 'Welcher Tag passt am besten zu deinem Event?',
      lead: 'Die Event-Planung von buscosun vergleicht die kommenden Tage für deinen Anlass — Gartenfest, Hochzeit, Fotoshooting, Drohnenflug oder Sport im Freien — anhand der Kriterien, die für genau diesen Anlass zählen, und nennt ehrlich, wie sicher die Einschätzung ist, inklusive Plan B.',
    },
  },
  {
    id: 'wetterarchiv', path: '/wetterarchiv', aliases: ['/historie', '/rueckblick'], featureId: 'history', subs: null,
    meta: {
      title: 'Wetterarchiv & Klima seit 1940',
      description: 'Wie hat sich das Wetter an deinem Ort verändert? Rückblick und Klimatrends seit 1940 aus Reanalyse- und Stationsdaten.',
      h1: 'Wetterarchiv: Wie hat sich das Wetter bei dir verändert?',
      lead: 'Das Wetterarchiv von buscosun zeigt für jeden Ort in der DACH-Region, wie Temperatur, Niederschlag und Extremtage sich seit 1940 entwickelt haben — als Rückblick auf einzelne Jahre und Monate und als langfristige Veränderung gegenüber der Referenzperiode.',
    },
  },
  {
    id: 'atmosphaere', path: '/atmosphaere', aliases: ['/atmosph%C3%A4re', '/atmosphere'], featureId: 'atmosphere', subParam: 'lens',
    subs: [
      { slug: ATMOSPHERE_LENS_SLUGS.fly, title: 'Thermik & Fliegen', description: 'Thermik, Höhenwind und Wolkenbasis über deinem Startplatz — die Atmosphäre aus Sicht von Gleitschirm- und Segelfliegern.' },
      { slug: ATMOSPHERE_LENS_SLUGS.mountain, title: 'Föhn, Berg & Weg', description: 'Föhn, Inversion und Wind in der Höhe für Bergtouren — was über dem Tal passiert, bevor es unten ankommt.' },
      { slug: ATMOSPHERE_LENS_SLUGS.section, title: 'Vertikalschnitt der Atmosphäre', description: 'Höhenwind, Inversion und Go/No-Go entlang einer frei gezogenen Schnittlinie — die Atmosphäre im Querschnitt.' },
    ],
    meta: {
      title: 'Die Atmosphäre über dir — Vertikalschnitt & 3D-Wetter',
      description: 'Höhenwind, Inversionen, Föhn und Thermik als Vertikalschnitt über jedem Ort in DACH — für Fliegen, Berg und Drohne.',
      h1: 'Die Atmosphäre über dir',
      lead: 'Die Atmosphäre-Ansicht von buscosun zeigt, was sich über deinem Standort in der Höhe abspielt: Höhenwind in mehreren Druckflächen, Inversionen, Föhnlagen und Thermik als Vertikalschnitt und im 3D-Gelände — mit Go/No-Go-Einschätzung für Drohne, Höhenarbeit und Flugsport.',
      ogImage: '/og/atmosphaere.png',
    },
  },
  {
    id: 'globus', path: '/globus', aliases: ['/3d-globus', '/3d'], featureId: 'globe', subs: null,
    meta: {
      title: '3D-Globus — das Wetter der ganzen Erde',
      description: 'Live-Wind, Temperatur und Druck weltweit auf einem drehbaren 3D-Globus aus GFS-Daten — bis 5 Tage voraus.',
      h1: 'Das Wetter der ganzen Erde',
      lead: 'Der 3D-Globus von buscosun zeigt das globale Windfeld als animierte Partikel auf einer drehbaren Erdkugel, dazu Temperatur und Luftdruck aus dem amerikanischen GFS-Modell — für jede Stunde bis fünf Tage voraus, direkt im Browser ohne Plugin.',
    },
  },
  {
    id: 'waldbrand', path: '/waldbrand', aliases: ['/waldbraende', '/feuer'], featureId: 'fire', subParam: 'view',
    subs: [
      { slug: 'gefahrenindex', title: 'Waldbrandgefahr DACH — Gefahrenindex', description: 'Der europäische Waldbrand-Gefahrenindex als Fläche über Deutschland, Österreich und die Schweiz, daneben die amtlichen Landesstufen.' },
      { slug: 'aktive-braende', title: 'Aktive Waldbrände DACH', description: 'Aktive Brände aus Satellitendetektionen (NASA FIRMS) mit kartierten Brandflächen (EFFIS), Stärke (FRP) und der beobachteten Verschiebung zwischen den Überflügen — unbestätigt ist der Normalfall.' },
      { slug: 'trockenheit', title: 'Bodentrockenheit & Feuerwetter DACH', description: 'Bodenfeuchte aus ICON-D2 in zwei Tiefen und das stündliche Feuerwetter als Treiber der Waldbrandgefahr.' },
    ],
    meta: {
      title: 'Waldbrandgefahr DACH — Brandradar',
      description: 'Waldbrandgefahr, aktive Brände aus Satellitendaten und Trockenheit für Deutschland, Österreich und die Schweiz — EU-Index als Fläche, die nationalen Skalen von DWD und BAFU zur Einordnung.',
      h1: 'Waldbrandgefahr in Deutschland, Österreich und der Schweiz',
      lead: 'Das Brandradar von buscosun zeigt den europäischen Gefahrenindex als durchgehende Fläche über die DACH-Region und zur Einordnung die nationalen Skalen von DWD und BAFU, jede mit ihrer eigenen Stufenlogik (Österreich hat keine offene amtliche Stufe). Dazu aktive Brände aus Satellitendetektionen, von EFFIS kartierte Brandflächen, die zwischen den Überflügen beobachtete Verschiebung eines Brands sowie Bodentrockenheit und Feuerwetter als Treiber — ohne amtliches Warnprodukt zu sein.',
    },
  },
  {
    id: 'feedback', path: '/feedback', aliases: [], featureId: 'feedback', subs: null,
    meta: {
      title: 'Feedback — Ideen & Vorschläge',
      description: 'Ideen, Wünsche und Fehlerberichte an buscosun — ohne Konto, ohne Tracker.',
      h1: 'Ideen & Vorschläge für buscosun',
      lead: 'buscosun wächst mit dem, was Nutzerinnen und Nutzer im DACH-Raum wirklich brauchen. Hier kannst du Ideen, Wünsche und Fehlerberichte hinterlassen — ohne Konto, ohne Tracker, ohne Formularzwang.',
    },
  },
  {
    id: 'validierung', path: '/validierung', aliases: [], featureId: 'validation', subs: null,
    meta: {
      title: 'Validierung — wie gut ist der KI-Nowcast?',
      description: 'Messwerte statt Versprechen: wie gut der buscosun-Nowcast gegen das gemessene Radar abschneidet.',
      h1: 'Wie gut ist der KI-Nowcast wirklich?',
      lead: 'Diese Seite legt offen, wie gut der Nowcast von buscosun im Vergleich zum gemessenen Radar abschneidet — mit den Kennzahlen, die auch die Wetterdienste verwenden, und ohne die Fälle zu verschweigen, in denen er danebenliegt.',
      noindex: true,
    },
  },
  {
    id: 'mobiletest', path: '/mobiletest', aliases: [], featureId: 'mobiletest', subs: null,
    meta: {
      title: 'Mobile-Primitives — Testroute',
      description: 'Interne Testroute für die mobilen UI-Bausteine.',
      h1: 'Mobile-Primitives — Testroute',
      lead: 'Interne Testroute für die mobilen UI-Bausteine von buscosun. Diese Seite ist nicht für Suchmaschinen bestimmt und zeigt keine Wetterdaten, sondern die Bedienelemente in ihren Zuständen.',
      noindex: true,
    },
  },
];

export const ROUTE_BY_ID: Readonly<Record<RouteId, RouteDef>> = Object.fromEntries(ROUTES.map((r) => [r.id, r])) as Record<RouteId, RouteDef>;

/** FeatureId (App.tsx / Rail) → kanonischer Pfad. `dayflow` hat keine Seite (wie bisher) → Start. */
export const FEATURE_PATH: Readonly<Record<FeatureId, string>> = {
  map2d: '/wetterkarte',
  nowcast: '/regenradar',
  route: '/tourenplanung',
  event: '/eventplanung',
  forecast: '/vorhersage',
  history: '/wetterarchiv',
  atmosphere: '/atmosphaere',
  globe: '/globus',
  fire: '/waldbrand',
  feedback: '/feedback',
  validation: '/validierung',
  mobiletest: '/mobiletest',
  dayflow: '/',
};

export function pathForFeature(id: string): string {
  return (FEATURE_PATH as Record<string, string>)[id] ?? '/';
}

/** Pfad-Aliase, die NICHT auf eine Route, sondern auf eine andere Route zeigen (`/wetterkarte/warnungen` → `/warnungen`). */
export const CROSS_ALIASES: ReadonlyArray<[from: string, to: string]> = [
  ['/wetterkarte/warnungen', '/warnungen'],
  ['/route/3d', '/tourenplanung/3d'],
];

function stripSlash(p: string): string {
  return p.length > 1 && p.endsWith('/') ? p.replace(/\/+$/, '') || '/' : p;
}

function safeDecode(p: string): string {
  try { return decodeURIComponent(p); } catch { return p; }
}

/**
 * Alias (prozentkodiert oder roh) → kanonischer Pfad; null wenn kein Alias.
 * `cross` = auch die Cross-Aliase (`/wetterkarte/warnungen`) auflösen — das tun
 * Meta/Canonical und Server-301, NICHT die Client-Normalisierung: dort bleibt
 * der Pfad stehen, damit der Layerwechsel die Karte nicht remountet.
 */
export function aliasTarget(pathname: string, cross = true): string | null {
  const p = stripSlash(pathname).toLowerCase();
  const dec = safeDecode(p);
  if (cross) for (const [from, to] of CROSS_ALIASES) if (p === from || dec === from) return to;
  for (const r of ROUTES) {
    for (const a of r.aliases) {
      if (p === a || dec === safeDecode(a)) return r.path;
    }
  }
  return null;
}

export interface RouteMatch { def: RouteDef; sub: SubRoute | null; /** Sub-Slug auch wenn unbekannt (Seite entscheidet über 404). */ subSlug: string | null }

/**
 * Pfad → Route (löst Aliase, ignoriert End-Slash/Groß-Schreibung). null = 404.
 * `cross = false` lässt die Cross-Aliase (`/route/3d`) unaufgelöst — so lässt
 * sich prüfen, ob ein Cross-Alias einen echten Pfad verdeckt.
 */
export function routeForPath(pathname: string, cross = true): RouteMatch | null {
  const alias = aliasTarget(pathname, cross);
  const p = alias ?? stripSlash(pathname).toLowerCase();
  for (const r of ROUTES) {
    if (p === r.path) return { def: r, sub: null, subSlug: null };
    if (r.subParam && p.startsWith(r.path + '/')) {
      const rest = p.slice(r.path.length + 1);
      if (!rest || rest.includes('/')) return null;
      const sub = r.subs?.find((s) => s.slug === rest) ?? null;
      return { def: r, sub, subSlug: rest };
    }
  }
  return null;
}

/**
 * Pfad → die Ersetzung, die der Client per `replace` schreiben soll
 * (End-Slash, Großbuchstaben, Alias); null = schon kanonisch oder unbekannt.
 * Den Slash-Fall kann Netlify nicht (Loop, s. `netlify.toml`), darum hier.
 */
export function normalizePath(pathname: string): string | null {
  const alias = aliasTarget(pathname, false);
  if (alias) return alias;
  const p = stripSlash(pathname).toLowerCase();
  if (p !== pathname && routeForPath(p)) return p;
  return null;
}

/** Canonical-Pfad einer URL (ohne Query, Alias aufgelöst, Sub-Route erhalten). */
export function canonicalPath(pathname: string): string {
  const m = routeForPath(pathname);
  if (!m) return stripSlash(pathname);
  if (m.def.id === 'wetterkarte' && m.subSlug === LAYER_SLUGS.warnings) return '/warnungen';
  return m.sub ? `${m.def.path}/${m.sub.slug}` : m.def.path;
}

/** Title + Description für eine URL (Sub-Route gewinnt, sonst Route). */
export function metaForPath(pathname: string): { title: string; description: string; noindex: boolean; ogImage: string | undefined; routeId: RouteId | null } {
  const m = routeForPath(pathname);
  if (!m) return { title: 'Seite nicht gefunden (404)', description: 'Diese Seite gibt es nicht. Zur Startseite oder zum Wetter nach Ort.', noindex: true, ogImage: undefined, routeId: null };
  if (m.def.id === 'wetterkarte' && m.subSlug === LAYER_SLUGS.warnings) return metaForPath('/warnungen');
  const base = m.def.meta;
  return {
    title: m.sub ? m.sub.title : base.title,
    description: m.sub ? m.sub.description : base.description,
    noindex: !!base.noindex || !!m.sub?.noindex || (!!m.subSlug && !m.sub),
    ogImage: base.ogImage,
    routeId: m.def.id,
  };
}

/** Alle kanonischen URLs für die Sitemap (Top-Routen + Sub-Routen, ohne noindex). */
export function sitemapPaths(): Array<{ path: string; priority: string }> {
  const out: Array<{ path: string; priority: string }> = [];
  for (const r of ROUTES) {
    if (r.meta.noindex || r.id === 'home') continue;
    out.push({ path: r.path, priority: '0.8' });
    for (const s of r.subs ?? []) {
      if (s.noindex) continue;                                                 // z. B. /tourenplanung/3d
      if (r.id === 'wetterkarte' && s.slug === LAYER_SLUGS.warnings) continue; // kanonisch /warnungen
      out.push({ path: `${r.path}/${s.slug}`, priority: '0.5' });
    }
  }
  return out;
}

// --- Selbstverifikation -----------------------------------------------------------

export interface RouteCheck { name: string; ok: boolean; detail?: string }

export function verifyRoutes(): { checks: RouteCheck[]; passed: number; failed: number } {
  const checks: RouteCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const slugRe = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/;
  const raw = ROUTES.flatMap((r) => [r.path, ...r.aliases.map(safeDecode), ...(r.subs ?? []).map((s) => `${r.path}/${s.slug}`)]);
  add('alle Pfade kleingeschrieben, ohne Umlaut im Kanonischen, ohne End-Slash', ROUTES.every((r) => slugRe.test(r.path) && (r.subs ?? []).every((s) => /^[a-z0-9-]+$/.test(s.slug))));
  add('Aliase sind prozentkodiert oder ASCII, ohne End-Slash', ROUTES.every((r) => r.aliases.every((a) => /^\/[a-z0-9%-]+$/i.test(a))));
  add('keine Dubletten über Pfade, Aliase und Sub-Routen', new Set(raw).size === raw.length, `${new Set(raw).size}/${raw.length}`);
  add('jede Route hat title/description/h1/lead', ROUTES.every((r) => r.meta.title && r.meta.description && r.meta.h1 && r.meta.lead.split(' ').length >= 25));
  add('jede FeatureId hat einen Pfad, der auf eine Route zeigt', Object.values(FEATURE_PATH).every((p) => !!routeForPath(p)));
  add('Wetterkarte hat 19 Layer-Sub-Routen', (ROUTE_BY_ID.wetterkarte.subs?.length ?? 0) === ALL_LAYER_KEYS.length);
  add('Alias /karte → /wetterkarte', aliasTarget('/karte') === '/wetterkarte' && routeForPath('/karte')?.def.id === 'wetterkarte');
  add('Umlaut-Alias roh und kodiert', aliasTarget('/atmosphäre') === '/atmosphaere' && aliasTarget('/atmosph%C3%A4re') === '/atmosphaere');
  add('End-Slash/Großschreibung werden normalisiert', normalizePath('/Wetterkarte/') === '/wetterkarte' && normalizePath('/wetterkarte') === null && normalizePath('/') === null);
  add('/wetterkarte/warnungen → /warnungen (kanonisch + Meta), Client normalisiert NICHT (kein Remount)', canonicalPath('/wetterkarte/warnungen') === '/warnungen' && normalizePath('/wetterkarte/warnungen') === null && metaForPath('/wetterkarte/warnungen').routeId === 'warnungen');
  add('Sub-Route wird erkannt', routeForPath('/wetterkarte/temperatur')?.sub?.slug === 'temperatur' && routeForPath('/atmosphaere/fliegen')?.sub?.slug === 'fliegen' && routeForPath('/waldbrand/aktive-braende')?.sub?.slug === 'aktive-braende');
  add('unbekannte Sub-Route bleibt auf der Route, aber noindex', routeForPath('/wetterkarte/xyz')?.sub === null && metaForPath('/wetterkarte/xyz').noindex);
  add('unbekannter Pfad ⇒ null', routeForPath('/nope') === null && routeForPath('/wetterkarte/a/b') === null && routeForPath('/regenradar/x') === null);
  add('Sitemap enthält Top- und Sub-Routen ohne noindex und ohne /wetterkarte/warnungen', (() => { const s = sitemapPaths().map((p) => p.path); return s.includes('/regenradar') && s.includes('/wetterkarte/wind') && !s.includes('/validierung') && !s.includes('/wetterkarte/warnungen') && s.includes('/warnungen'); })());
  add('Meta der Sub-Route gewinnt', metaForPath('/wetterkarte/wind').title === 'Windkarte DACH' && metaForPath('/wetterkarte').title === 'Interaktive Wetterkarte DACH');
  add('/tourenplanung/3d ist eine erkannte Sub-Route', routeForPath('/tourenplanung/3d')?.sub?.slug === '3d');
  add('/tourenplanung/3d ist noindex und NICHT in der Sitemap (leer ohne Strecke)',
    metaForPath('/tourenplanung/3d').noindex === true && !sitemapPaths().some((x) => x.path === '/tourenplanung/3d'));
  add('/route/3d löst auf /tourenplanung/3d auf und verdeckt keinen echten Pfad',
    aliasTarget('/route/3d') === '/tourenplanung/3d' && routeForPath('/route/3d', false) === null);
  add('Canonical von /route/3d ist die deutsche Sub-Route', canonicalPath('/route/3d') === '/tourenplanung/3d');
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
