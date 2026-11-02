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
import { LAYER_SLUGS, LAYER_SLUG_TITLE, LAYER_SLUG_DESCRIPTION } from './urlState';
import { ogCardPath } from '../share/ogCard';
import { roadSeoSubs } from '../road/roadSeo';
import { FIRE_LINK_SEGMENT, FIRE_SLUG_RE } from '../fire/fireLink';
import { ROAD_CORRIDOR_SLUG_RE, ROAD_KM_SLUG_RE } from '../road/roadLink';

/**
 * Freischaltung Autobahnwetter (audit/seo-nischen.md §6): EIN Schalter für `noindex`, Sitemap und die 20 Autobahn-Unterseiten. Erst umlegen,
 * wenn die Fühler-Fixes live sind, `road-archiv` grün läuft und Jan freigibt; dazu kommen die Rewrites aus `audit/seo-nischen/road-release.toml`
 * und `npm run edge:share`. Solange `false`, nimmt Rollup die Unterseiten nicht ins Start-Bundle.
 */
export const ROAD_INDEXABLE = false as boolean;

/** Kanonische Origin — deckungsgleich mit `scripts/seo/content.mjs` (O-03); der Verifier prüft das. */
export const SITE_URL = 'https://buscosun.com';
export const SITE_NAME = 'buscosun';

export type RouteId =
  | 'home' | 'wetterkarte' | 'warnungen' | 'regenradar' | 'vorhersage' | 'tourenplanung' | 'eventplanung'
  | 'wetterarchiv' | 'atmosphaere' | 'globus' | 'waldbrand' | 'autobahnwetter' | 'seewetter' | 'gletscher' | 'feedback' | 'validierung' | 'mobiletest';

export interface RouteMeta {
  /** `<title>` (ohne Marken-Suffix — der wird zentral angehängt). */
  title: string;
  description: string;
  /** H1 + Lead der statischen Route-Shell (crawlbarer Inhalt ohne JS). */
  h1: string;
  lead: string;
  noindex?: boolean;
  /** Letzte inhaltliche Änderung (Sitemap-lastmod); Default `CONTENT_UPDATED`. */
  updated?: string;
}

export interface SubRoute {
  slug: string;
  title: string;
  description: string;
  /** Sicht, die ohne Nutzereingabe leer ist (3D braucht eine hochgeladene Strecke) ⇒ nicht in die Sitemap. */
  noindex?: boolean;
  /** Letzte inhaltliche Änderung (Sitemap-lastmod). Die ausführlichen Texte (H1, Lead, Absätze,
   *  Fakten) stehen NICHT hier, sondern in `src/seo/subRouteTexts.ts` — außerhalb des Start-Bundles. */
  updated?: string;
}

/** Datum der letzten Textänderung an dieser Tabelle — Sitemap-`lastmod` für alle App-Routen ohne eigenes `updated`. */
export const CONTENT_UPDATED = '2026-09-05';

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
  subParam?: 'layer' | 'lens' | 'view' | 'road' | 'spot' | 'glacier';
  /**
   * SH1 („Teilen"): Diese Route darf als LETZTES Pfadsegment einen Ort-Slug
   * tragen — `/wetterkarte/wind/muenchen`, `/regenradar/muenchen`.
   *
   * Der Slug ist **nie kanonisch** (`canonicalPath()` schneidet ihn ab) und
   * **nie in der Sitemap**: sonst entstünde ein unendlicher indexierbarer Raum
   * (jeder Ort × jeder Layer). Ortswetter bleibt Sache der statischen Seiten
   * `/wetter/<slug>/`. Netlify braucht dafür ein `<pfad>/*`-Rewrite auf die
   * Shell der Route — `verify:routing` erzwingt das.
   */
  place?: boolean;
  meta: RouteMeta;
}

const LAYER_SUBS: readonly SubRoute[] = ALL_LAYER_KEYS.map((k) => ({
  slug: LAYER_SLUGS[k],
  title: `${LAYER_SLUG_TITLE[k]} DACH`,
  description: LAYER_SLUG_DESCRIPTION[k],
}));

export const ATMOSPHERE_LENS_SLUGS = {
  section: 'querschnitt',
} as const;
export type AtmosphereLensSlug = (typeof ATMOSPHERE_LENS_SLUGS)[keyof typeof ATMOSPHERE_LENS_SLUGS];

/**
 * Retired Atmosphäre views (Föhn, Thermik, Go/No-Go; Jan 01.11.2026): the deck shows the section only. The slugs are no
 * routes any more and leave the sitemap, but old links and share links must not break: 301 in `netlify.toml`, client
 * side `aliasTarget`, both keep the place segment.
 */
export const ATMOSPHERE_RETIRED_SLUGS = ['fliegen', 'berg-und-weg', 'arbeitsfenster'] as const;
const RETIRED_ATMOSPHERE_RE = new RegExp(`^/atmosphaere/(?:${ATMOSPHERE_RETIRED_SLUGS.join('|')})(/[^/]+)?$`);

export const FIRE_VIEW_SLUGS = ['gefahrenindex', 'aktive-braende', 'trockenheit', 'historie', 'thermalanomalien'] as const;

/**
 * SEO/GEO 2026 (E7): Anlass-Sub-Routen der Event-Planung. Der Slug ist deutsch, der Wert die id
 * des Anlasses in "src/event/eventModel.ts" (EVENT_ACTIVITIES). Die Sub-Route waehlt den Anlass
 * im Wizard vor — der uebrige Zustand bleibt wie bisher im Fragment "#ev=".
 */
export const EVENT_ACTIVITY_SLUGS: Readonly<Record<string, string>> = {
  grillen: 'bbq',
  hochzeit: 'wedding',
  wandern: 'hiking',
  drohne: 'drone',
  fotografie: 'photo',
  sterne: 'stargazing',
  radtour: 'cycling',
  picknick: 'picnic',
  laufen: 'running',
  baden: 'swimming',
};

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
    id: 'wetterkarte', path: '/wetterkarte', aliases: ['/karte', '/map'], featureId: 'map2d', subs: LAYER_SUBS, subParam: 'layer', place: true,
    meta: {
      title: 'Interaktive Wetterkarte DACH',
      description: 'Wind, Niederschlag, Temperatur, Wolken, Böen, Gewitter und amtliche Warnungen für Deutschland, Österreich und die Schweiz auf einer Karte — aus DWD, GeoSphere und MeteoSchweiz.',
      h1: 'Interaktive Wetterkarte für Deutschland, Österreich und die Schweiz',
      lead: 'Die Wetterkarte von buscosun legt Wind, Niederschlagsradar, höhenkorrigierte Temperatur, Bewölkung, Böen, Gewitterpotenzial, Blitze, Stationen und amtliche Warnungen als frei kombinierbare Layer über eine flüssige Vektorkarte — mit Zeit-Schieber (beim Start auf die nächsten zwei Stunden begrenzt, beim ersten Ziehen bis 48 Stunden) und Modellwahl je Land, aus amtlichen Quellen, ohne Konto und ohne Tracker.',
    },
  },
  {
    id: 'warnungen', path: '/warnungen', aliases: ['/unwetterwarnungen', '/warnung'], featureId: 'map2d', subs: null, place: true,
    meta: {
      title: 'Amtliche Unwetterwarnungen DE · CH',
      description: 'Amtliche Wetterwarnungen von DWD und MeteoSchweiz wortwörtlich auf der Karte — landkreisgenau, alle 5 Minuten, mit Zeit-Schieber. Österreich folgt.',
      h1: 'Amtliche Unwetterwarnungen für Deutschland und die Schweiz',
      lead: 'buscosun zeigt die amtlichen Wetterwarnungen des Deutschen Wetterdienstes und von MeteoSchweiz als Flächen auf der Karte — Überschrift, Beschreibung und Handlungshinweis wortwörtlich aus der amtlichen Meldung, alle fünf Minuten aktualisiert, mit dem Zeit-Schieber für die kommenden Stunden. Für Österreich warnt GeoSphere Austria; dieser Layer fehlt noch und wird als Lücke ausgewiesen.',
    },
  },
  {
    id: 'regenradar', path: '/regenradar', aliases: ['/niederschlagsradar', '/radar', '/regen'], featureId: 'nowcast', subs: null, place: true,
    meta: {
      title: 'Regenradar & Nowcast DACH',
      description: 'Gemessenes Niederschlagsradar für Deutschland, Österreich und die Schweiz mit Nowcast bis 2 Stunden — RADOLAN, INCA und MeteoSchweiz, minutengenau.',
      h1: 'Regenradar für Deutschland, Österreich und die Schweiz',
      lead: 'Das Regenradar von buscosun zeigt den gemessenen Niederschlag der drei Landesradare — RADOLAN-RV in Deutschland, INCA in Österreich, das MeteoSchweiz-Radar in der Schweiz — als Animation mit Rückblick und amtlichem Nowcast bis zu zwei Stunden voraus, inklusive Regen, Schnee, Hagel und Sturmzellen.',
    },
  },
  {
    id: 'vorhersage', path: '/vorhersage', aliases: ['/wettervorhersage', '/forecast'], featureId: 'forecast', subs: null, place: true,
    meta: {
      title: 'Wettervorhersage mit Konfidenz & Modellvergleich',
      description: 'Vorhersage für jeden Ort in DACH mit ausgewiesener Sicherheit — mehrere Modelle im Vergleich, ehrlich statt scheingenau.',
      h1: 'Wettervorhersage mit Konfidenz und Modellvergleich',
      lead: 'Die Vorhersage von buscosun stellt mehrere Wettermodelle nebeneinander und weist aus, wie sicher eine Aussage ist — aus der Streuung der Modelle und der Vorlaufzeit. Statt einer scheingenauen Zahl siehst du, wo sich die Modelle einig sind und wo nicht. Der Rückblick reiht die Modelle je Ort danach, wie nah sie in den letzten 7, 14 oder 30 Tagen lagen, gemessen am Konsens der Modell-Analysen und nicht an Stationen.',
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
    id: 'eventplanung', path: '/eventplanung', aliases: ['/events', '/event'], featureId: 'event', subParam: 'view', place: true,
    // SEO/GEO 2026 (E7): je Anlass ein kanonischer Pfad — der Wizard oeffnet mit vorgewaehltem Anlass.
    subs: [
      { slug: 'grillen', title: 'Grillwetter — der beste Tag zum Grillen', description: 'Welcher Tag der kommenden Woche ist warm, trocken und windstill genug für Grillabend, Gartenfest oder Hoffest?', updated: CONTENT_UPDATED },
      { slug: 'hochzeit', title: 'Hochzeitswetter mit Plan B', description: 'Trauung, Empfang und Abendfeier einzeln bewertet, dazu die Schwelle, ab der ein Plan B nötig wird — für die Hochzeit im Freien.', updated: CONTENT_UPDATED },
      { slug: 'wandern', title: 'Wanderwetter — der beste Tag für die Tour', description: 'Trocken, mild, gute Sicht: welcher der nächsten Tage sich für die Wanderung eignet, mit ehrlicher Sicherheit je Tag.', updated: CONTENT_UPDATED },
      { slug: 'drohne', title: 'Drohnenwetter — Böen, Regen und Bewölkung', description: 'Der beste Tag für den Drohnenflug: Böen zählen am schwersten, dazu Regen und Bewölkung. Eine Tagesbewertung, keine Freigabe auf Flughöhe.', updated: '2026-11-01' },
      { slug: 'fotografie', title: 'Fotowetter — Licht, Wolken und Stimmung', description: 'Wolkenlicht statt blankem Himmel: welcher Tag weiches Licht verspricht, dazu goldene und blaue Stunde für jedes Datum.', updated: CONTENT_UPDATED },
      { slug: 'sterne', title: 'Sternenwetter — klare Nächte finden', description: 'Wolken, Mond, astronomische Dunkelheit und Tau-Risiko für die Kernnacht — welche Nacht der Woche sich zum Beobachten eignet.', updated: CONTENT_UPDATED },
      { slug: 'radtour', title: 'Radwetter — der beste Tag für die Ausfahrt', description: 'Wind wiegt schwer, Regen noch schwerer: welcher Tag sich für Rennrad, Gravel oder die E-Bike-Tour anbietet.', updated: CONTENT_UPDATED },
      { slug: 'picknick', title: 'Picknickwetter — mild, trocken, sonnig', description: 'Der beste Tag für Picknick, Kindergeburtstag im Freien oder das Treffen im Park — mild, trocken und wenig bewölkt.', updated: CONTENT_UPDATED },
      { slug: 'laufen', title: 'Laufwetter — kühl und trocken', description: 'Wann es kühl und trocken genug für den langen Lauf, den Firmenlauf oder das Training im Freien wird.', updated: CONTENT_UPDATED },
      { slug: 'baden', title: 'Badewetter — heiß und sonnig', description: 'Welcher Tag heiß und sonnig genug für Freibad, Badesee oder Strandtag wird — die Temperatur zählt hier am schwersten.', updated: CONTENT_UPDATED },
    ],
    meta: {
      title: 'Event-Planung — der beste Tag',
      description: 'Welcher Tag passt am besten? buscosun bewertet Wetterfenster für Hochzeit, Grillabend, Drohnenflug oder Outdoor-Event und schlägt einen Plan B vor.',
      h1: 'Welcher Tag passt am besten zu deinem Event?',
      lead: 'Die Event-Planung von buscosun vergleicht die kommenden Tage für deinen Anlass — Gartenfest, Hochzeit, Fotoshooting, Drohnenflug oder Sport im Freien — anhand der Kriterien, die für genau diesen Anlass zählen, und nennt ehrlich, wie sicher die Einschätzung ist, inklusive Plan B.',
    },
  },
  {
    id: 'wetterarchiv', path: '/wetterarchiv', aliases: ['/historie', '/rueckblick'], featureId: 'history', subs: null, place: true,
    meta: {
      title: 'Wetterarchiv & Klima seit 1940',
      description: 'Wie hat sich das Wetter an deinem Ort verändert? Rückblick und Klimatrends seit 1940 aus Reanalyse- und Stationsdaten.',
      h1: 'Wetterarchiv: Wie hat sich das Wetter bei dir verändert?',
      lead: 'Das Wetterarchiv von buscosun zeigt für jeden Ort in der DACH-Region, wie Temperatur, Niederschlag und Extremtage sich seit 1940 entwickelt haben — als Rückblick auf einzelne Jahre und Monate und als langfristige Veränderung gegenüber der Referenzperiode.',
    },
  },
  {
    id: 'atmosphaere', path: '/atmosphaere', aliases: ['/atmosph%C3%A4re', '/atmosphere'], featureId: 'atmosphere', subParam: 'lens', place: true,
    subs: [
      {
        slug: ATMOSPHERE_LENS_SLUGS.section, title: 'Vertikalschnitt der Atmosphäre — Höhenwind im Querschnitt', description: 'Höhenwind, Böen, Windscherung und Wolkenbasis entlang einer frei gezogenen Linie: der Querschnitt der Atmosphäre über dem Gelände in DE, AT und CH.', updated: '2026-11-01',
      },
    ],
    meta: {
      title: 'Die Atmosphäre über dir — Vertikalschnitt & Höhenwind',
      description: 'Höhenwind, Böen und Wolkenbasis als Vertikalschnitt entlang einer frei gezogenen Linie in DE, AT und CH. Kein amtliches Flugwetter.',
      h1: 'Die Atmosphäre über dir',
      lead: 'Die Atmosphäre-Ansicht von buscosun zeigt, was sich über dem Gelände in der Höhe abspielt: Du ziehst auf der Karte eine Linie und siehst entlang dieser Linie den Vertikalschnitt mit Höhenwind, Böen, Windscherung und Wolkenbasis, mit Zeit-Regler und genannter Herkunft. Kein amtliches Flugwetter.',
      updated: '2026-11-01',
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
      {
        slug: 'gefahrenindex', title: 'Waldbrandgefahr DACH — Gefahrenindex', description: 'Der europäische Fire Weather Index (GWIS/ECMWF) als Fläche über DE, AT und CH bis 9 Tage voraus, dazu die nationalen Skalen von DWD und BAFU.',
      },
      {
        slug: 'aktive-braende', title: 'Aktive Waldbrände DACH', description: 'Aktive Brände aus NASA-FIRMS-Detektionen mit EFFIS-Brandflächen, Stärke (FRP) und Verschiebung zwischen den Überflügen — unbestätigt ist der Normalfall.',
      },
      {
        slug: 'trockenheit', title: 'Bodentrockenheit & Feuerwetter DACH', description: 'Bodenfeuchte aus ICON-D2 in zwei Tiefen (Oberboden bis 9 cm, Wurzelzone bis 81 cm) und die Trockenheit der Luft als stündlicher Feuerwetter-Treiber.',
      },
      {
        slug: 'historie', title: 'Waldbrand-Historie DACH — Monat und Saison',
        description: 'Die laufende Saison und die Jahre seit 2020 aus dem eigenen FIRMS-Archiv: Ereignisse je Monat, Saisonverlauf und Einzelfälle mit Wetterlage.',
        updated: CONTENT_UPDATED,
      },
      {
        slug: 'thermalanomalien', title: 'Thermalanomalien — Anlagen statt Brände',
        description: 'Standorte, an denen Satelliten dauerhaft Wärme sehen: Stahlwerke, Zementwerke, Raffinerien — als eigene Klasse, damit sie nicht als Waldbrand zählen.',
        updated: CONTENT_UPDATED,
      },
    ],
    meta: {
      title: 'Waldbrandgefahr DACH — Brandradar',
      description: 'Waldbrandgefahr, aktive Brände aus Satellitendaten und Trockenheit für Deutschland, Österreich und die Schweiz — EU-Index als Fläche, die nationalen Skalen von DWD und BAFU zur Einordnung.',
      h1: 'Waldbrandgefahr in Deutschland, Österreich und der Schweiz',
      lead: 'Das Brandradar von buscosun zeigt den europäischen Gefahrenindex als durchgehende Fläche über die DACH-Region und zur Einordnung die nationalen Skalen von DWD und BAFU, jede mit ihrer eigenen Stufenlogik (Österreich hat keine offene amtliche Stufe). Dazu aktive Brände aus Satellitendetektionen, von EFFIS kartierte Brandflächen, die zwischen den Überflügen beobachtete Verschiebung eines Brands sowie Bodentrockenheit und Feuerwetter als Treiber — ohne amtliches Warnprodukt zu sein.',
    },
  },
  {
    // Phase AW (audit/autobahnwetter.md): Pfadsegment = Korridor (`/autobahnwetter/a8`), entscheidet die Seite. Die
    // 20 Autobahn-Unterseiten (E-AW-4, `src/road/roadSeo.ts`) hängen an `ROAD_INDEXABLE`; bis dahin ist die Route
    // noindex und steht in keiner Sitemap.
    id: 'autobahnwetter', path: '/autobahnwetter', aliases: ['/strassenwetter', '/glaette'], featureId: 'road', subParam: 'road',
    subs: ROAD_INDEXABLE ? roadSeoSubs() : null,
    meta: {
      title: 'Autobahnwetter — Glätte und Fahrbahnzustand',
      description: 'Fahrbahntemperatur und -zustand der Glättemeldeanlagen an deutschen Autobahnen, alle 15 Minuten gemessen — je Strecke als Band.',
      h1: 'Autobahnwetter: Was messen die Anlagen?',
      lead: 'Was die Glättemeldeanlagen an deutschen Autobahnen messen: Fahrbahntemperatur, Fahrbahnzustand, Wasserfilm, Luft und Taupunkt, alle 15 Minuten vom DWD, geprüft und je Autobahn als Streckenband. Kein amtliches Warnprodukt und keine Verkehrsmeldung.',
      noindex: !ROAD_INDEXABLE,
    },
  },
  {
    // Phase SW (audit/seewetter.md): Pfadsegment = Spot (`/seewetter/st-peter-ording`), entscheidet die Seite. Seit
    // 10.10.2026 für alle sichtbar (`SEA_LIVE`, `src/sea/seaFlag.ts`) und indexierbar (Jan 10.10., E-SW-32): `/seewetter`
    // steht in der Sitemap; die Spot-Pfade teilen Shell und Canonical der Route (keine eigenen Unterseiten).
    id: 'seewetter', path: '/seewetter', aliases: ['/kuestenwetter', '/segelwetter', '/wellen'], featureId: 'sea', subParam: 'spot',
    subs: null,
    meta: {
      title: 'Seewetter Nord- und Ostsee — Wind, Welle, Wasserstand',
      description: 'Seegang an der deutschen Küste aus dem DWD-Küstenmodell, Wind und Böen an rund 60 Spots, Wasserstand der BSH-Pegel und der Seewetterbericht im Wortlaut.',
      h1: 'Seewetter für Nord- und Ostsee: Wind, Welle und Wasserstand',
      lead: 'Seegang mit Windsee und Dünung an Nord- und Ostsee (DWD CWAM), Wind und Böen an rund 60 Spots aus buscosun Fusion, Wasserstand an den Pegeln des BSH, Seewetterbericht und Warnstatus des DWD im Wortlaut. Kein amtliches Warnprodukt, keine Sicherheitsbewertung.',
    },
  },
  {
    // Phase GL (audit/gletscher.md): Pfadsegment = Gletscher (`/gletscher/ch-grosser-aletschgletscher`), entscheidet die Seite. Für alle sichtbar seit
    // 13.10.2026 (`GLACIER_LIVE`), indexierbar seit 01.11.2026 (Jan, audit/seo-nischen.md): `/gletscher` in der Sitemap, Gletscher-Pfade teilen Shell und Canonical.
    id: 'gletscher', path: '/gletscher', aliases: ['/gletscherradar', '/gletschermonitor'], featureId: 'glacier', subParam: 'glacier',
    subs: null,
    meta: {
      title: 'Gletscher DACH — Lage, Schmelze und Messreihen',
      description: 'Rund 2 200 Gletscher in Deutschland, Österreich und der Schweiz: amtliche Zahlen, Längen- und Massenreihen, Herkunft an jedem Wert.',
      h1: 'Gletscher: Wie geht es dem Eis?',
      lead: 'Alle rund 2 200 Gletscher in DE, AT und CH an einem Ort: Inventare mit Bezugsjahr, Längen- und Massenreihen der Messnetze, Satellitenszenen, ein Schmelzindex ohne Einheit und amtliche Berichte im Wortlaut. Jeder Wert nennt seine Herkunft (gemessen, Satellit, Modell, amtlich). Kein amtliches Warnprodukt, keine Tourenfreigabe.',
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
      lead: 'Diese Seite legt offen, wie gut der Nowcast von buscosun im Vergleich zum gemessenen Radar abschneidet — mit den Kennzahlen, die auch die Wetterdienste verwenden, und ohne die Fälle zu verschweigen, in denen er danebenliegt. Beim Aufruf rechnet sie ein echtes Hindcast: aus beobachteten RADOLAN-Analysen wird vorhergesagt und gegen die spätere Beobachtung verifiziert — Brier Skill Score, Kalibrierungsfehler, Trefferquote und Reliability-Diagramm je Vorlaufminute.',
      // SEO/GEO 2026 (E3): indexierbar — die Seite ist der Beleg für die Konfidenz-Aussagen (/methodik/konfidenz-und-trefferquote/).
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

/** Top-Routen mit eigenem Text (`routeText` in `src/seo/routeTexts.ts`); nur sie laden den Text-Chunk. `verify:routing` hält beide Listen gleich. */
export const ROUTE_TEXT_IDS: ReadonlySet<string> = new Set(['waldbrand', 'wetterarchiv', 'seewetter', 'gletscher', 'autobahnwetter']);

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
  road: '/autobahnwetter',
  sea: '/seewetter',
  glacier: '/gletscher',
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
  // Retired Atmosphäre views: a real redirect, also client side (no route is hidden by it), with the place segment.
  const retired = p.match(RETIRED_ATMOSPHERE_RE);
  if (retired) return `/atmosphaere/${ATMOSPHERE_LENS_SLUGS.section}${retired[1] ?? ''}`;
  if (cross) for (const [from, to] of CROSS_ALIASES) if (p === from || dec === from) return to;
  for (const r of ROUTES) {
    for (const a of r.aliases) {
      if (p === a || dec === safeDecode(a)) return r.path;
    }
  }
  return null;
}

export interface RouteMatch {
  def: RouteDef;
  sub: SubRoute | null;
  /** Sub-Slug auch wenn unbekannt (Seite entscheidet über 404). */
  subSlug: string | null;
  /** SH1: Ort-Slug als letztes Segment (`/wetterkarte/wind/muenchen`); nie kanonisch. */
  placeSlug: string | null;
}

const PLACE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Pfad → Route (löst Aliase, ignoriert End-Slash/Groß-Schreibung). null = 404.
 * `cross = false` lässt die Cross-Aliase (`/route/3d`) unaufgelöst — so lässt
 * sich prüfen, ob ein Cross-Alias einen echten Pfad verdeckt.
 *
 * SH1: Routen mit `place: true` dürfen ein zusätzliches Ort-Segment tragen —
 * bei einer Route MIT Sub-Routen erst NACH einem gültigen Sub-Slug. Sonst wäre
 * `/wetterkarte/tempratur` (Tippfehler) nicht mehr von einem Ort zu
 * unterscheiden und die 404 ginge still verloren.
 */
export function routeForPath(pathname: string, cross = true): RouteMatch | null {
  const alias = aliasTarget(pathname, cross);
  const p = alias ?? stripSlash(pathname).toLowerCase();
  for (const r of ROUTES) {
    if (p === r.path) return { def: r, sub: null, subSlug: null, placeSlug: null };
    if (!p.startsWith(r.path + '/')) continue;
    const rest = p.slice(r.path.length + 1);
    if (!rest) return null;
    const seg = rest.split('/');
    if (r.subParam) {
      const sub = r.subs?.find((s) => s.slug === seg[0]) ?? null;
      if (seg.length === 1) return { def: r, sub, subSlug: seg[0], placeSlug: null };
      // Autobahnwetter: `/autobahnwetter/<strecke>/km-<beginn>` — EIN Abschnitt (src/road/roadLink.ts). Titel/Canonical der Strecke, noindex wie die Route.
      if (r.id === 'autobahnwetter' && seg.length === 2 && ROAD_CORRIDOR_SLUG_RE.test(seg[0]) && ROAD_KM_SLUG_RE.test(seg[1])) {
        return { def: r, sub: r.subs?.find((s) => s.slug === seg[0]) ?? null, subSlug: seg[0], placeSlug: null };
      }
      // Brandradar: `/waldbrand/brand/<kennung>` — EIN Brand (src/fire/fireLink.ts). Kein Sub-Eintrag ⇒ noindex, Canonical = /waldbrand.
      if (r.id === 'waldbrand' && seg.length === 2 && seg[0] === FIRE_LINK_SEGMENT && FIRE_SLUG_RE.test(seg[1])) {
        return { def: r, sub: null, subSlug: FIRE_LINK_SEGMENT, placeSlug: null };
      }
      // Ort nur hinter einem BEKANNTEN Sub-Slug, und nur ein einziges Segment.
      if (seg.length === 2 && r.place && sub && PLACE_SLUG_RE.test(seg[1])) {
        return { def: r, sub, subSlug: seg[0], placeSlug: seg[1] };
      }
      return null;
    }
    if (r.place && seg.length === 1 && PLACE_SLUG_RE.test(seg[0])) {
      return { def: r, sub: null, subSlug: null, placeSlug: seg[0] };
    }
    return null;
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
    // Unbekannter Sub-Slug ⇒ noindex — außer die Route führt keine Sub-Liste: dann entscheidet die Seite über das Segment
    // (Spot, Korridor) und die URL zeigt per Canonical auf die Route.
    noindex: !!base.noindex || !!m.sub?.noindex || (!!m.subSlug && !m.sub && !!m.def.subs),
    ogImage: ogCardPath(m.def.id, m.sub?.slug ?? null) ?? undefined,
    routeId: m.def.id,
  };
}

/** Alle kanonischen URLs für die Sitemap (Top-Routen + Sub-Routen, ohne noindex). */
export function sitemapPaths(): Array<{ path: string; priority: string; lastmod: string }> {
  const out: Array<{ path: string; priority: string; lastmod: string }> = [];
  for (const r of ROUTES) {
    if (r.meta.noindex || r.id === 'home') continue;
    out.push({ path: r.path, priority: '0.8', lastmod: r.meta.updated ?? CONTENT_UPDATED });
    for (const s of indexableSubRoutes(r)) out.push({ path: s.path, priority: '0.5', lastmod: s.sub.updated ?? r.meta.updated ?? CONTENT_UPDATED });
  }
  return out;
}

export interface IndexableSub { route: RouteDef; sub: SubRoute; /** kanonischer Pfad */ path: string; /** flache Shell-Datei in dist/ (Netlify-200-Ziel) */ shell: string }

/**
 * Sub-Routen, die eine EIGENE Shell bekommen (SEO/GEO 2026, E1): indexierbar,
 * mit eigenem Text, kein Cross-Alias. Der Dateiname ist flach (`<route>--<slug>.html`),
 * damit Netlifys „Pretty URLs" nicht auf den End-Slash umleiten.
 */
export function indexableSubRoutes(route?: RouteDef): IndexableSub[] {
  const out: IndexableSub[] = [];
  for (const r of route ? [route] : ROUTES) {
    if (r.meta.noindex) continue;
    for (const s of r.subs ?? []) {
      if (s.noindex) continue;                                                 // z. B. /tourenplanung/3d
      if (r.id === 'wetterkarte' && s.slug === LAYER_SLUGS.warnings) continue; // kanonisch /warnungen
      out.push({ route: r, sub: s, path: `${r.path}/${s.slug}`, shell: `/${r.id}--${s.slug}.html` });
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
  add('Sub-Route wird erkannt', routeForPath('/wetterkarte/temperatur')?.sub?.slug === 'temperatur' && routeForPath('/atmosphaere/querschnitt')?.sub?.slug === 'querschnitt' && routeForPath('/waldbrand/aktive-braende')?.sub?.slug === 'aktive-braende');
  add('unbekannte Sub-Route bleibt auf der Route, aber noindex', routeForPath('/wetterkarte/xyz')?.sub === null && metaForPath('/wetterkarte/xyz').noindex);
  add('unbekannter Pfad ⇒ null', routeForPath('/nope') === null && routeForPath('/wetterkarte/a/b') === null && routeForPath('/wetterkarte/wind/a/b') === null);
  // --- SH1: Ort-Slug als letztes Segment -----------------------------------
  add('[SH1] /wetterkarte/wind/muenchen ⇒ Layer wind + Ort muenchen',
    (() => { const m = routeForPath('/wetterkarte/wind/muenchen'); return m?.sub?.slug === 'wind' && m.placeSlug === 'muenchen'; })());
  add('[SH1] /regenradar/muenchen und /warnungen/muenchen tragen den Ort',
    routeForPath('/regenradar/muenchen')?.placeSlug === 'muenchen' && routeForPath('/warnungen/muenchen')?.placeSlug === 'muenchen');
  add('[SH1] Ort nur HINTER einem bekannten Layer — ein Tippfehler bleibt 404',
    routeForPath('/wetterkarte/tempratur/muenchen') === null && routeForPath('/wetterkarte/tempratur')?.sub === null);
  add('[SH1] kein Ortssegment auf Routen ohne place-Flag', routeForPath('/globus/x') === null && routeForPath('/feedback/x') === null);
  add('[SH1] Ortssegment muss Slug-Form haben', routeForPath('/regenradar/M%C3%BCnchen') === null && routeForPath('/regenradar/a--b') === null);
  add('[SH1] der Ort ist NIE kanonisch',
    canonicalPath('/wetterkarte/wind/muenchen') === '/wetterkarte/wind' && canonicalPath('/regenradar/muenchen') === '/regenradar' && canonicalPath('/warnungen/muenchen') === '/warnungen');
  add('[SH1] der Ort steht in KEINER Sitemap-Zeile', sitemapPaths().every((x) => x.path.split('/').filter(Boolean).length <= 2));
  add('[SH1] Ortspfade erben Titel und Description ihrer Route/Sub-Route und sind nicht noindex',
    metaForPath('/wetterkarte/wind/muenchen').title === metaForPath('/wetterkarte/wind').title
    && !metaForPath('/wetterkarte/wind/muenchen').noindex && !metaForPath('/regenradar/muenchen').noindex);
  add('[SH1] jede place-Route ist auch eine echte Route und hat keinen subParam-Konflikt',
    ROUTES.filter((r) => r.place).map((r) => r.id).join(',') === 'wetterkarte,warnungen,regenradar,vorhersage,eventplanung,wetterarchiv,atmosphaere');
  // SH3: die Atmosphäre trägt den Ort hinter der Linse.
  add('[SH3] /atmosphaere/querschnitt/innsbruck ⇒ Linse + Ort',
    (() => { const m = routeForPath('/atmosphaere/querschnitt/innsbruck'); return m?.sub?.slug === 'querschnitt' && m.placeSlug === 'innsbruck'; })());
  add('[SH3] Ort nur hinter einer bekannten Linse', routeForPath('/atmosphaere/quer/innsbruck') === null);
  add('[SH3] der Ort der Atmosphäre ist nie kanonisch',
    canonicalPath('/atmosphaere/querschnitt/innsbruck') === '/atmosphaere/querschnitt');
  add('Sitemap enthält Top- und Sub-Routen ohne noindex (inkl. /validierung seit E3) und ohne /wetterkarte/warnungen', (() => { const s = sitemapPaths().map((p) => p.path); return s.includes('/regenradar') && s.includes('/wetterkarte/wind') && s.includes('/validierung') && !s.includes('/mobiletest') && !s.includes('/wetterkarte/warnungen') && s.includes('/warnungen'); })());
  add('Meta der Sub-Route gewinnt', metaForPath('/wetterkarte/wind').title === 'Windkarte DACH' && metaForPath('/wetterkarte').title === 'Interaktive Wetterkarte DACH');
  add('/tourenplanung/3d ist eine erkannte Sub-Route', routeForPath('/tourenplanung/3d')?.sub?.slug === '3d');
  add('/tourenplanung/3d ist noindex und NICHT in der Sitemap (leer ohne Strecke)',
    metaForPath('/tourenplanung/3d').noindex === true && !sitemapPaths().some((x) => x.path === '/tourenplanung/3d'));
  add('/route/3d löst auf /tourenplanung/3d auf und verdeckt keinen echten Pfad',
    aliasTarget('/route/3d') === '/tourenplanung/3d' && routeForPath('/route/3d', false) === null);
  add('Canonical von /route/3d ist die deutsche Sub-Route', canonicalPath('/route/3d') === '/tourenplanung/3d');
  // Retired Atmosphäre views (Jan 01.11.2026): redirect client side, keep the place, never in the sitemap.
  add('[ATM] alte Ansichten lösen auf den Querschnitt auf', ATMOSPHERE_RETIRED_SLUGS.every((s) => aliasTarget(`/atmosphaere/${s}`) === '/atmosphaere/querschnitt' && aliasTarget(`/atmosphaere/${s}`, false) === '/atmosphaere/querschnitt' && normalizePath(`/atmosphaere/${s}`) === '/atmosphaere/querschnitt' && canonicalPath(`/atmosphaere/${s}`) === '/atmosphaere/querschnitt'));
  add('[ATM] der Ort bleibt erhalten, ist aber nicht kanonisch', ATMOSPHERE_RETIRED_SLUGS.every((s) => normalizePath(`/atmosphaere/${s}/innsbruck`) === '/atmosphaere/querschnitt/innsbruck' && routeForPath(`/atmosphaere/${s}/innsbruck`)?.placeSlug === 'innsbruck' && canonicalPath(`/atmosphaere/${s}/innsbruck`) === '/atmosphaere/querschnitt'));
  add('[ATM] End-Slash an alten Pfaden führt ebenfalls zum Querschnitt', normalizePath('/atmosphaere/fliegen/') === '/atmosphaere/querschnitt');
  add('[ATM] alte Ansichten tragen Meta des Querschnitts, nicht noindex', ATMOSPHERE_RETIRED_SLUGS.every((s) => metaForPath(`/atmosphaere/${s}`).title === metaForPath('/atmosphaere/querschnitt').title && !metaForPath(`/atmosphaere/${s}`).noindex));
  add('[ATM] nur noch der Querschnitt ist Sub-Route, keine alte Ansicht in der Sitemap', ROUTE_BY_ID.atmosphaere.subs?.map((s) => s.slug).join() === 'querschnitt' && !sitemapPaths().some((x) => (ATMOSPHERE_RETIRED_SLUGS as readonly string[]).some((s) => x.path.endsWith(`/${s}`))));
  add('[ATM] Gegenprobe: der Querschnitt selbst bleibt stehen, ein ähnlicher Slug ist kein Redirect, ein Tippfehler bleibt 404', normalizePath('/atmosphaere/querschnitt') === null && normalizePath('/atmosphaere/querschnitt/innsbruck') === null && aliasTarget('/atmosphaere/fliegenx') === null && routeForPath('/atmosphaere/fliegenx/innsbruck') === null && aliasTarget('/atmosphaere/fliegen/a/b') === null);
  // SEO/GEO 2026 (E1): jede indexierbare Sub-Route trägt eigenen Text für ihre Shell.
  const subs = indexableSubRoutes();
  add('34 indexierbare Sub-Routen mit eigener Shell (18 Layer + 1 Atmosphäre + 5 Brand-Sichten + 10 Event-Anlässe), nach der Autobahn-Freischaltung 20 mehr', subs.length === (ROAD_INDEXABLE ? 54 : 34), String(subs.length));
  const longDesc = subs.filter((x) => x.sub.description.length > 160).map((x) => `${x.path} (${x.sub.description.length})`);
  add('Sub-Routen-Descriptions sind paarweise verschieden und ≤ 160 Zeichen', new Set(subs.map((x) => x.sub.description)).size === subs.length && longDesc.length === 0, longDesc.join(', '));
  add('Shell-Dateinamen sind eindeutig und flach', new Set(subs.map((x) => x.shell)).size === subs.length && subs.every((x) => /^\/[a-z]+--[a-z0-9-]+\.html$/.test(x.shell)));
  add('Sitemap trägt lastmod je Eintrag (ISO-Datum)', sitemapPaths().every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.lastmod)));
  // Phase AW: Route, Aliase, 20 Autobahn-Unterseiten; bis Gate C noindex und ohne Sitemap.
  add('[AW] /autobahnwetter ist eine Route, /strassenwetter und /glaette sind Aliase', routeForPath('/autobahnwetter')?.def.id === 'autobahnwetter' && aliasTarget('/strassenwetter') === '/autobahnwetter' && aliasTarget('/glaette') === '/autobahnwetter');
  add('[AW] /autobahnwetter/a8 trägt den Korridor als Segment (die Seite entscheidet); noindex bis zur Freigabe', routeForPath('/autobahnwetter/a8')?.subSlug === 'a8' && metaForPath('/autobahnwetter/a8').noindex === !ROAD_INDEXABLE);
  add('[AW] bis zur Freigabe noindex und in keiner Sitemap; danach die Route und 20 Unterseiten', ROAD_INDEXABLE ? sitemapPaths().filter((x) => x.path.startsWith('/autobahnwetter')).length === 21 : !!ROUTE_BY_ID.autobahnwetter.meta.noindex && !sitemapPaths().some((x) => x.path.startsWith('/autobahnwetter')));
  add('[SW] /seewetter ist eine Route, /kuestenwetter, /segelwetter, /wellen sind Aliase', routeForPath('/seewetter')?.def.id === 'seewetter' && aliasTarget('/kuestenwetter') === '/seewetter' && aliasTarget('/segelwetter') === '/seewetter' && aliasTarget('/wellen') === '/seewetter');
  add('[SW] /seewetter/st-peter-ording trägt den Spot als Segment (die Seite entscheidet): indexierbar, Canonical = /seewetter', routeForPath('/seewetter/st-peter-ording')?.subSlug === 'st-peter-ording' && !metaForPath('/seewetter/st-peter-ording').noindex && canonicalPath('/seewetter/st-peter-ording') === '/seewetter');
  add('[SW] seit 10.10. indexierbar (E-SW-32): /seewetter genau einmal in der Sitemap, kein Spot-Pfad', !ROUTE_BY_ID.seewetter.meta.noindex && !metaForPath('/seewetter').noindex && sitemapPaths().filter((x) => x.path.startsWith('/seewetter')).map((x) => x.path).join() === '/seewetter');
  add('[SW] Gegenprobe: ein unbekannter Sub-Slug einer Route MIT Sub-Liste bleibt noindex', metaForPath('/wetterkarte/xyz').noindex && metaForPath('/waldbrand/xyz').noindex);
  // Phase GL: Route, Aliase, Gletscher als Pfadsegment; bis Gate D noindex und ohne Sitemap.
  add('[GL] /gletscher ist eine Route, /gletscherradar und /gletschermonitor sind Aliase', routeForPath('/gletscher')?.def.id === 'gletscher' && aliasTarget('/gletscherradar') === '/gletscher' && aliasTarget('/gletschermonitor') === '/gletscher');
  add('[GL] /gletscher/ch-grosser-aletschgletscher trägt den Gletscher als Segment (die Seite entscheidet): indexierbar, Canonical = /gletscher', routeForPath('/gletscher/ch-grosser-aletschgletscher')?.subSlug === 'ch-grosser-aletschgletscher' && !metaForPath('/gletscher/ch-grosser-aletschgletscher').noindex && canonicalPath('/gletscher/ch-grosser-aletschgletscher') === '/gletscher');
  add('[GL] seit 01.11. indexierbar: /gletscher genau einmal in der Sitemap, kein Gletscher-Pfad', !ROUTE_BY_ID.gletscher.meta.noindex && sitemapPaths().filter((x) => x.path.startsWith('/gletscher')).map((x) => x.path).join() === '/gletscher');
  add('[GL] zwei Segmente (/gletscher/a/b) sind keine Route', routeForPath('/gletscher/ch-a/b') === null);
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
