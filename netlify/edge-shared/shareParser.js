// ERZEUGT — NICHT VON HAND AENDERN.
// Quelle: src/share/edgeShare.ts (und der Baum darunter).
// Neu bauen: npm run edge:share · Pruefen: npm run verify:share
// Warum ein Buendel: Deno verlangt Datei-Endungen an jedem Import, der
// App-Baum hat keine. Es ist DERSELBE Parser, nur zusammengezogen.

// src/map/layerTypes.ts
var ALL_LAYER_KEYS = [
  "wind",
  "gust",
  "nowcast",
  "temp",
  "clouds",
  "sat",
  "lightning",
  "lightningfc",
  "stations",
  "confidence",
  "snowline",
  "flownowcast",
  "poprob",
  "thunder",
  "snow",
  "rotation",
  "cells",
  "hail",
  "warnings"
];

// src/share/shareSchema.ts
var SHARE_URL_HARD_MAX = 1500;
var SHARE_BLOCKED_KEYS = /* @__PURE__ */ new Set([
  "lz",
  "radarcdn",
  "radarimg",
  "repackrun",
  "bh",
  "ta",
  "afEst",
  "tour",
  "anchor",
  "startnow",
  "fast",
  "embed",
  "debug",
  "qa"
]);
var TRACKING_RE = /^(utm_|fbclid$|gclid$|msclkid$|mc_eid$|igshid$|ref$|referrer$)/i;
function isShareableKey(key) {
  return !SHARE_BLOCKED_KEYS.has(key) && !TRACKING_RE.test(key);
}
function shareableExtras(extra) {
  return extra.filter(([k]) => isShareableKey(k));
}
var roundTo = (n, digits) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
function parseValidTime(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2})(?::(\d{2}))?)?Z?$/.exec(s.trim());
  if (!m) return null;
  const h = m[4] ? +m[4] : 0, min = m[5] ? +m[5] : 0;
  if (h > 23 || min > 59) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], h, min);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10) === `${m[1]}-${m[2]}-${m[3]}` ? ms : null;
}

// src/share/placeSlug.ts
function toSlug(name) {
  return name.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function isSlugShape(s) {
  return !!s && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 80;
}
function deSlugName(slug) {
  return slug.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
var PLACE_SNAP_KM = 0.5;
function distanceKm(aLat, aLon, bLat, bLon) {
  const kx = Math.cos((aLat + bLat) / 2 * (Math.PI / 180)) * 111.32;
  const dx = (bLon - aLon) * kx;
  const dy = (bLat - aLat) * 110.57;
  return Math.hypot(dx, dy);
}

// src/router/urlState.ts
var LAYER_SLUGS = {
  wind: "wind",
  gust: "boeen",
  nowcast: "niederschlag",
  temp: "temperatur",
  clouds: "bewoelkung",
  sat: "satellit",
  lightning: "blitze",
  lightningfc: "blitzprognose",
  stations: "stationen",
  confidence: "sicherheit",
  snowline: "schneegrenze",
  flownowcast: "flow-nowcast",
  poprob: "regen-chance",
  thunder: "gewitter",
  snow: "schnee",
  rotation: "rotation",
  cells: "zellbahnen",
  hail: "hagel",
  warnings: "warnungen"
};
var LAYER_SLUG_TITLE = {
  wind: "Windkarte",
  gust: "Böenkarte",
  nowcast: "Niederschlagskarte",
  temp: "Temperaturkarte",
  clouds: "Bewölkungskarte",
  sat: "Satellitenbild",
  lightning: "Blitzkarte",
  lightningfc: "Blitzprognose",
  stations: "Wetterstationen",
  confidence: "Vorhersage-Sicherheit",
  snowline: "Schneefallgrenze",
  flownowcast: "Flow-Nowcast",
  poprob: "Regenwahrscheinlichkeit",
  thunder: "Gewitterpotenzial",
  snow: "Schneekarte",
  rotation: "Rotationspotenzial",
  cells: "Zellbahnen",
  hail: "Hagelkarte",
  warnings: "Amtliche Warnungen"
};
var LAYER_SLUG_DESCRIPTION = {
  wind: "Wind in 10 m Höhe als animierte Partikel über einer Heatmap — DWD ICON-D2, 2,2 km, bis 12 h voraus; Höhenwind 850/700/500 hPa aus ICON-EU.",
  gust: "Spitzenböen bis 24 h voraus als Fläche über DACH — DWD ICON-D2 vmax_10m, 2,2 km; für Kran, Gerüst, Drohne, Segeln und Zeltaufbau.",
  nowcast: "Gemessenes Landesradar als DACH-Komposit: RADOLAN-RV (DE, bis 2 h), INCA (AT, bis 3 h), MeteoSchweiz — bewusst ohne Modellverlängerung.",
  temp: "2-m-Temperatur aus DWD ICON-D2, je Pixel auf das echte Gelände höhenkorrigiert — stündlich bis 24 h voraus für DE, AT und CH.",
  clouds: "Bewölkung in drei Stockwerken (tief, mittel, hoch) aus DWD ICON-D2 — für Foto-Licht, Astro-Nächte und die Frage, ob die Sonne durchkommt.",
  sat: "Meteosat-Satellitenbild über der Wetterkarte: Europa in Echtfarbe/Infrarot (1 km) oder Welt-Infrarot (3 km), alle 3 Stunden via DWD OpenData.",
  lightning: "Gemessene Blitzeinschläge der letzten 60 Minuten aus dem DWD-Blitzortungsnetz — die Messung zum Gewitter, etwa alle 10 Minuten erneuert.",
  lightningfc: "Blitzpotenzial bis 12 h voraus: der Lightning Potential Index (lpi_max) aus DWD ICON-D2 als Fläche über DACH — Prognose, nicht Messung.",
  stations: "Rund 1 000 amtliche Messstationen in DE, AT und CH mit Live-Werten: DWD, GeoSphere TAWES und MeteoSchweiz SMN — per Klick abrufbar.",
  confidence: "Wo die Wettervorhersage unsicher ist, als Schraffur: Ensemble-Spread beim Regen (DE) oder Klimatologie mal Laufvergleich bei der Temperatur.",
  snowline: "Die Linie zwischen Regen und Schnee über DE, AT und CH — aus dem höhenkorrigierten ICON-D2-Feld mit gelernter Orts-Korrektur, stündlich bis 24 h.",
  flownowcast: "Das RADOLAN-Radarbild eine Stunde weitergeschoben: Optical-Flow-Extrapolation ohne Training — nur Deutschland, nur beobachtete Bewegung.",
  poprob: "Regenwahrscheinlichkeit in Prozent für die nächste Stunde aus einem 15-Member-Flow-Ensemble auf RADOLAN — kalibriert, nur Deutschland.",
  thunder: "Gewitterpotenzial 0–100 aus CAPE, CIN und Blitzbereitschaft (LPI) — DWD ICON-D2, 2,2 km, bis 12 h voraus für DE, AT und CH.",
  snow: "Schneedecke und Neuschnee in Zentimetern als Fläche über DACH — DWD ICON-D2 h_snow und snow_gsp, umschaltbar; Modell, keine Messung.",
  rotation: "Experten-Layer: Modell-Verdachtsflächen für rotierende Gewitter aus ICON-D2 Updraft-Helicity und Supercell-Index — konservativ, kein Warnprodukt.",
  cells: "Gewitterzellen mit amtlicher Zugbahn, Zeitmarken und Unsicherheitstrichter aus DWD KONRAD3D — alle 5 Minuten, bis 60 Minuten voraus.",
  hail: "Hagelerkennung aus zwei Radarprodukten: MeteoSchweiz MESHS/POH als Fläche (Apr–Sep) und DWD-KONRAD-Hagelzellen — Ostösterreich ohne Quelle.",
  warnings: "Amtliche Wetterwarnungen von DWD und MeteoSchweiz wortwörtlich auf der Karte — landkreisgenau, alle 5 Minuten; Österreich folgt."
};
var SLUG_TO_LAYER = Object.fromEntries(
  Object.entries(LAYER_SLUGS).map(([k, s]) => [s, k])
);
function layerFromSlug(slug) {
  if (!slug) return null;
  return SLUG_TO_LAYER[slug] ?? null;
}
var NO_LAYERS = "-";
function layersFromRoute(primarySlug, l) {
  const invalid = [];
  const primary = primarySlug ? layerFromSlug(primarySlug) : null;
  if (primarySlug && !primary) invalid.push(primarySlug);
  const set = /* @__PURE__ */ new Set();
  if (primary) set.add(primary);
  let noLayers = false;
  if (l === NO_LAYERS) {
    noLayers = true;
  } else if (l) {
    for (const s of l.split(",")) {
      if (!s) continue;
      const k = layerFromSlug(s);
      if (k) set.add(k);
      else invalid.push(s);
    }
  }
  const all = ALL_LAYER_KEYS.filter((k) => set.has(k));
  return { primary, all, invalid, noLayers };
}
var QUERY_ORDER = ["lat", "lon", "z", "t", "l", "modell", "mode", "radar", "ort", "olat", "olon", "land"];
var KNOWN_KEYS = new Set(QUERY_ORDER);
var r4 = (n) => roundTo(n, 4);
var rz = (n) => roundTo(n, 1);
var ZOOM_MIN = 2;
var ZOOM_MAX = 18;
function finite(s) {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function hourFromValidTimeDetailed(t, nowMs) {
  const ms = parseValidTime(t) ?? Date.parse(t);
  if (!Number.isFinite(ms)) return { hour: null, past: false, atMs: null };
  const h = Math.round((ms - nowMs) / 36e5 * 10) / 10;
  return h < 0 ? { hour: 0, past: true, atMs: ms } : { hour: h, past: false, atMs: ms };
}
var COUNTRIES = ["DE", "AT", "CH"];
function countryFrom(s) {
  if (!s) return null;
  const up = s.toUpperCase();
  return COUNTRIES.includes(up) ? up : null;
}
function parseMapSearch(search, nowMs, isModel = () => true) {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const invalid = [];
  const extra = [];
  for (const [k, v] of p.entries()) if (!KNOWN_KEYS.has(k)) extra.push([k, v]);
  let cam = null;
  const lat = finite(p.get("lat")), lon = finite(p.get("lon")), z = finite(p.get("z"));
  const hasCam = p.has("lat") || p.has("lon") || p.has("z");
  if (hasCam) {
    if (lat != null && lon != null && z != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && z >= ZOOM_MIN && z <= ZOOM_MAX) {
      cam = { lat: r4(lat), lon: r4(lon), zoom: rz(z) };
    } else {
      for (const k of ["lat", "lon", "z"]) if (p.has(k)) invalid.push(k);
    }
  }
  let hour;
  let timePast;
  let wantedAtMs;
  if (p.has("t")) {
    const { hour: h, past, atMs } = hourFromValidTimeDetailed(p.get("t") ?? "", nowMs);
    if (h == null) invalid.push("t");
    else {
      hour = h;
      wantedAtMs = atMs ?? void 0;
      if (past) timePast = true;
    }
  }
  const l = p.get("l");
  let model = null;
  if (p.has("modell")) {
    const m = p.get("modell") ?? "";
    if (m && m !== "native" && isModel(m)) model = m;
    else invalid.push("modell");
  }
  let point;
  if (p.has("mode")) {
    const m = p.get("mode");
    if (m === "fusion" || m === "native") point = m;
    else invalid.push("mode");
  }
  let radar;
  if (p.has("radar")) {
    const r = p.get("radar");
    if (r === "0") radar = false;
    else if (r === "1") radar = true;
    else invalid.push("radar");
  }
  let place = null;
  const country = countryFrom(p.get("land"));
  if (p.has("land") && !country) invalid.push("land");
  if (p.has("ort") || p.has("olat") || p.has("olon")) {
    const name = (p.get("ort") ?? "").trim();
    const olat = finite(p.get("olat")), olon = finite(p.get("olon"));
    if (olat != null && olon != null && Math.abs(olat) <= 90 && Math.abs(olon) <= 180) {
      place = { name, lat: r4(olat), lon: r4(olon), country: country ?? "DE" };
    } else {
      for (const k of ["ort", "olat", "olon"]) if (p.has(k)) invalid.push(k);
    }
  }
  return { cam, hour, timePast, wantedAtMs, l, model, point, radar, place, country, invalid, extra };
}

// src/share/ogCard.ts
var OG_APP_DIR = "/og/app";
var OG_WIDTH = 1200;
var OG_HEIGHT = 630;
var OG_CARD_ROUTES = [
  "wetterkarte",
  "warnungen",
  "regenradar",
  "vorhersage",
  "tourenplanung",
  "eventplanung",
  "wetterarchiv",
  "atmosphaere",
  "globus",
  "waldbrand",
  "feedback",
  "validierung"
];
function hasOgCard(routeId) {
  return !!routeId && OG_CARD_ROUTES.includes(routeId);
}
function ogCardSlug(routeId, viewSlug) {
  return viewSlug ? `${routeId}-${viewSlug}` : routeId;
}
function ogCardPath(routeId, viewSlug) {
  if (!hasOgCard(routeId)) return null;
  return `${OG_APP_DIR}/${ogCardSlug(routeId, viewSlug)}.png`;
}

// src/router/routes.ts
var SITE_URL = "https://buscosun.com";
var SITE_NAME = "buscosun";
var CONTENT_UPDATED = "2026-09-05";
var LAYER_SUBS = ALL_LAYER_KEYS.map((k) => ({
  slug: LAYER_SLUGS[k],
  title: `${LAYER_SLUG_TITLE[k]} DACH`,
  description: LAYER_SLUG_DESCRIPTION[k]
}));
var ATMOSPHERE_LENS_SLUGS = {
  fly: "fliegen",
  mountain: "berg-und-weg",
  section: "querschnitt"
};
var ATMOSPHERE_WORK_WINDOW_SLUG = "arbeitsfenster";
var ROUTES = [
  {
    id: "home",
    path: "/",
    aliases: [],
    featureId: null,
    subs: null,
    meta: {
      title: "Wetter DE · AT · CH",
      description: "DACH-Wetter: Karte, Regenradar, Tourenplanung, Event-Tag, Vorhersage, Historie — höhenkorrigiert, ohne Tracker.",
      h1: "Wetter für Deutschland, Österreich & die Schweiz",
      lead: "buscosun ist eine kostenlose, tracker-freie Wetter-Web-App für Deutschland, Österreich und die Schweiz: interaktive Wetterkarte, Regenradar, Tourenplanung, Event-Planung, Vorhersage mit Konfidenz, Klimahistorie, Atmosphäre und Brandradar — aus amtlichen Quellen (DWD, GeoSphere Austria, MeteoSwiss), über ein Geländemodell höhenkorrigiert, ohne Konto und ohne Werbung."
    }
  },
  {
    id: "wetterkarte",
    path: "/wetterkarte",
    aliases: ["/karte", "/map"],
    featureId: "map2d",
    subs: LAYER_SUBS,
    subParam: "layer",
    place: true,
    meta: {
      title: "Interaktive Wetterkarte DACH",
      description: "Wind, Niederschlag, Temperatur, Wolken, Böen, Gewitter und amtliche Warnungen für Deutschland, Österreich und die Schweiz auf einer Karte — aus DWD, GeoSphere und MeteoSchweiz.",
      h1: "Interaktive Wetterkarte für Deutschland, Österreich und die Schweiz",
      lead: "Die Wetterkarte von buscosun legt Wind, Niederschlagsradar, höhenkorrigierte Temperatur, Bewölkung, Böen, Gewitterpotenzial, Blitze, Stationen und amtliche Warnungen als frei kombinierbare Layer über eine flüssige Vektorkarte — mit Zeit-Schieber (beim Start auf die nächsten zwei Stunden begrenzt, beim ersten Ziehen bis 48 Stunden) und Modellwahl je Land, aus amtlichen Quellen, ohne Konto und ohne Tracker."
    }
  },
  {
    id: "warnungen",
    path: "/warnungen",
    aliases: ["/unwetterwarnungen", "/warnung"],
    featureId: "map2d",
    subs: null,
    place: true,
    meta: {
      title: "Amtliche Unwetterwarnungen DE · CH",
      description: "Amtliche Wetterwarnungen von DWD und MeteoSchweiz wortwörtlich auf der Karte — landkreisgenau, alle 5 Minuten, mit Zeit-Schieber. Österreich folgt.",
      h1: "Amtliche Unwetterwarnungen für Deutschland und die Schweiz",
      lead: "buscosun zeigt die amtlichen Wetterwarnungen des Deutschen Wetterdienstes und von MeteoSchweiz als Flächen auf der Karte — Überschrift, Beschreibung und Handlungshinweis wortwörtlich aus der amtlichen Meldung, alle fünf Minuten aktualisiert, mit dem Zeit-Schieber für die kommenden Stunden. Für Österreich warnt GeoSphere Austria; dieser Layer fehlt noch und wird als Lücke ausgewiesen."
    }
  },
  {
    id: "regenradar",
    path: "/regenradar",
    aliases: ["/niederschlagsradar", "/radar", "/regen"],
    featureId: "nowcast",
    subs: null,
    place: true,
    meta: {
      title: "Regenradar & Nowcast DACH",
      description: "Gemessenes Niederschlagsradar für Deutschland, Österreich und die Schweiz mit Nowcast bis 2 Stunden — RADOLAN, INCA und MeteoSchweiz, minutengenau.",
      h1: "Regenradar für Deutschland, Österreich und die Schweiz",
      lead: "Das Regenradar von buscosun zeigt den gemessenen Niederschlag der drei Landesradare — RADOLAN-RV in Deutschland, INCA in Österreich, das MeteoSchweiz-Radar in der Schweiz — als Animation mit Rückblick und amtlichem Nowcast bis zu zwei Stunden voraus, inklusive Regen, Schnee, Hagel und Sturmzellen."
    }
  },
  {
    id: "vorhersage",
    path: "/vorhersage",
    aliases: ["/wettervorhersage", "/forecast"],
    featureId: "forecast",
    subs: null,
    place: true,
    meta: {
      title: "Wettervorhersage mit Konfidenz & Modellvergleich",
      description: "Vorhersage für jeden Ort in DACH mit ausgewiesener Sicherheit — mehrere Modelle im Vergleich, ehrlich statt scheingenau.",
      h1: "Wettervorhersage mit Konfidenz und Modellvergleich",
      lead: "Die Vorhersage von buscosun stellt mehrere Wettermodelle nebeneinander und weist aus, wie sicher eine Aussage ist — aus der Streuung der Modelle und der Vorlaufzeit. Statt einer scheingenauen Zahl siehst du, wo sich die Modelle einig sind und wo nicht."
    }
  },
  {
    id: "tourenplanung",
    path: "/tourenplanung",
    aliases: ["/touren", "/tour"],
    featureId: "route",
    subParam: "view",
    subs: [
      {
        slug: "3d",
        title: "3D-Ansicht — Wetter entlang der Route",
        description: "Die Strecke als Geländeschnitt: Windwand, Regen, Wolkenbasis und Warnzonen über dem Höhenprofil, gekoppelt an Kilometer und Ankunftszeit.",
        // Ohne hochgeladene Strecke zeigt die Sicht nichts — kein sinnvolles Suchergebnis.
        noindex: true
      }
    ],
    meta: {
      title: "Tourenplanung — Wetter entlang der Route",
      description: "GPX hochladen und das Wetter Kilometer für Kilometer entlang deiner Rad-, Wander- oder E-Bike-Tour sehen — mit Zeitplan und Höhenprofil.",
      h1: "Wetter entlang deiner Route",
      lead: "Die Tourenplanung von buscosun liest eine GPX-Datei ein und berechnet für jeden Streckenabschnitt, welches Wetter dich zur voraussichtlichen Ankunftszeit erwartet — Temperatur, Wind, Regen und Böen, höhenkorrigiert über das Geländemodell, für Wandern, Rennrad, Gravel und E-Bike."
    }
  },
  {
    id: "eventplanung",
    path: "/eventplanung",
    aliases: ["/events", "/event"],
    featureId: "event",
    subParam: "view",
    place: true,
    // SEO/GEO 2026 (E7): je Anlass ein kanonischer Pfad — der Wizard oeffnet mit vorgewaehltem Anlass.
    subs: [
      { slug: "grillen", title: "Grillwetter — der beste Tag zum Grillen", description: "Welcher Tag der kommenden Woche ist warm, trocken und windstill genug für Grillabend, Gartenfest oder Hoffest?", updated: CONTENT_UPDATED },
      { slug: "hochzeit", title: "Hochzeitswetter mit Plan B", description: "Trauung, Empfang und Abendfeier einzeln bewertet, dazu die Schwelle, ab der ein Plan B nötig wird — für die Hochzeit im Freien.", updated: CONTENT_UPDATED },
      { slug: "wandern", title: "Wanderwetter — der beste Tag für die Tour", description: "Trocken, mild, gute Sicht: welcher der nächsten Tage sich für die Wanderung eignet, mit ehrlicher Sicherheit je Tag.", updated: CONTENT_UPDATED },
      { slug: "drohne", title: "Drohnenwetter — Böen, Sicht und Regen", description: "Der beste Tag für den Drohnenflug: Böen zählen am schwersten, dazu Sicht und Niederschlag — plus Go/No-Go auf Flughöhe.", updated: CONTENT_UPDATED },
      { slug: "fotografie", title: "Fotowetter — Licht, Wolken und Stimmung", description: "Wolkenlicht statt blankem Himmel: welcher Tag weiches Licht verspricht, dazu goldene und blaue Stunde für jedes Datum.", updated: CONTENT_UPDATED },
      { slug: "sterne", title: "Sternenwetter — klare Nächte finden", description: "Wolken, Mond, astronomische Dunkelheit und Tau-Risiko für die Kernnacht — welche Nacht der Woche sich zum Beobachten eignet.", updated: CONTENT_UPDATED },
      { slug: "radtour", title: "Radwetter — der beste Tag für die Ausfahrt", description: "Wind wiegt schwer, Regen noch schwerer: welcher Tag sich für Rennrad, Gravel oder die E-Bike-Tour anbietet.", updated: CONTENT_UPDATED },
      { slug: "picknick", title: "Picknickwetter — mild, trocken, sonnig", description: "Der beste Tag für Picknick, Kindergeburtstag im Freien oder das Treffen im Park — mild, trocken und wenig bewölkt.", updated: CONTENT_UPDATED },
      { slug: "laufen", title: "Laufwetter — kühl und trocken", description: "Wann es kühl und trocken genug für den langen Lauf, den Firmenlauf oder das Training im Freien wird.", updated: CONTENT_UPDATED },
      { slug: "baden", title: "Badewetter — heiß und sonnig", description: "Welcher Tag heiß und sonnig genug für Freibad, Badesee oder Strandtag wird — die Temperatur zählt hier am schwersten.", updated: CONTENT_UPDATED }
    ],
    meta: {
      title: "Event-Planung — der beste Tag",
      description: "Welcher Tag passt am besten? buscosun bewertet Wetterfenster für Hochzeit, Grillabend, Drohnenflug oder Outdoor-Event und schlägt einen Plan B vor.",
      h1: "Welcher Tag passt am besten zu deinem Event?",
      lead: "Die Event-Planung von buscosun vergleicht die kommenden Tage für deinen Anlass — Gartenfest, Hochzeit, Fotoshooting, Drohnenflug oder Sport im Freien — anhand der Kriterien, die für genau diesen Anlass zählen, und nennt ehrlich, wie sicher die Einschätzung ist, inklusive Plan B."
    }
  },
  {
    id: "wetterarchiv",
    path: "/wetterarchiv",
    aliases: ["/historie", "/rueckblick"],
    featureId: "history",
    subs: null,
    place: true,
    meta: {
      title: "Wetterarchiv & Klima seit 1940",
      description: "Wie hat sich das Wetter an deinem Ort verändert? Rückblick und Klimatrends seit 1940 aus Reanalyse- und Stationsdaten.",
      h1: "Wetterarchiv: Wie hat sich das Wetter bei dir verändert?",
      lead: "Das Wetterarchiv von buscosun zeigt für jeden Ort in der DACH-Region, wie Temperatur, Niederschlag und Extremtage sich seit 1940 entwickelt haben — als Rückblick auf einzelne Jahre und Monate und als langfristige Veränderung gegenüber der Referenzperiode."
    }
  },
  {
    id: "atmosphaere",
    path: "/atmosphaere",
    aliases: ["/atmosph%C3%A4re", "/atmosphere"],
    featureId: "atmosphere",
    subParam: "lens",
    place: true,
    subs: [
      {
        slug: ATMOSPHERE_LENS_SLUGS.fly,
        title: "Thermik & Fliegen",
        description: "Thermik, Höhenwind und Wolkenbasis über deinem Startplatz — die Atmosphäre aus Sicht von Gleitschirm- und Segelfliegern."
      },
      {
        slug: ATMOSPHERE_LENS_SLUGS.mountain,
        title: "Föhn, Berg & Weg",
        description: "Föhn, Inversion und Wind in der Höhe für Bergtouren — was über dem Tal passiert, bevor es unten ankommt."
      },
      {
        slug: ATMOSPHERE_LENS_SLUGS.section,
        title: "Vertikalschnitt der Atmosphäre",
        description: "Höhenwind, Inversion und Schichtung entlang einer frei gezogenen Schnittlinie — die Atmosphäre im Querschnitt."
      },
      {
        slug: ATMOSPHERE_WORK_WINDOW_SLUG,
        title: "Arbeitsfenster Go/No-Go — Böen auf Arbeitshöhe",
        description: "Arbeitshöhe und Böengrenzwert eingeben und GO/NO-GO über den Tag ablesen — für Drohne, Kran, Gerüst und Höhenarbeit.",
        updated: CONTENT_UPDATED
      }
    ],
    meta: {
      title: "Die Atmosphäre über dir — Vertikalschnitt & 3D-Wetter",
      description: "Höhenwind, Inversionen, Föhn und Thermik als Vertikalschnitt über jedem Ort in DACH — für Fliegen, Berg und Drohne.",
      h1: "Die Atmosphäre über dir",
      lead: "Die Atmosphäre-Ansicht von buscosun zeigt, was sich über deinem Standort in der Höhe abspielt: Höhenwind in mehreren Druckflächen, Inversionen, Föhnlagen und Thermik als Vertikalschnitt und im 3D-Gelände — mit Go/No-Go-Einschätzung für Drohne, Höhenarbeit und Flugsport."
    }
  },
  {
    id: "globus",
    path: "/globus",
    aliases: ["/3d-globus", "/3d"],
    featureId: "globe",
    subs: null,
    meta: {
      title: "3D-Globus — das Wetter der ganzen Erde",
      description: "Live-Wind, Temperatur und Druck weltweit auf einem drehbaren 3D-Globus aus GFS-Daten — bis 5 Tage voraus.",
      h1: "Das Wetter der ganzen Erde",
      lead: "Der 3D-Globus von buscosun zeigt das globale Windfeld als animierte Partikel auf einer drehbaren Erdkugel, dazu Temperatur und Luftdruck aus dem amerikanischen GFS-Modell — für jede Stunde bis fünf Tage voraus, direkt im Browser ohne Plugin."
    }
  },
  {
    id: "waldbrand",
    path: "/waldbrand",
    aliases: ["/waldbraende", "/feuer"],
    featureId: "fire",
    subParam: "view",
    subs: [
      {
        slug: "gefahrenindex",
        title: "Waldbrandgefahr DACH — Gefahrenindex",
        description: "Der europäische Fire Weather Index (GWIS/ECMWF) als Fläche über DE, AT und CH bis 9 Tage voraus, dazu die nationalen Skalen von DWD und BAFU."
      },
      {
        slug: "aktive-braende",
        title: "Aktive Waldbrände DACH",
        description: "Aktive Brände aus NASA-FIRMS-Detektionen mit EFFIS-Brandflächen, Stärke (FRP) und Verschiebung zwischen den Überflügen — unbestätigt ist der Normalfall."
      },
      {
        slug: "trockenheit",
        title: "Bodentrockenheit & Feuerwetter DACH",
        description: "Bodenfeuchte aus ICON-D2 in zwei Tiefen (Oberboden bis 9 cm, Wurzelzone bis 81 cm) und die Trockenheit der Luft als stündlicher Feuerwetter-Treiber."
      },
      {
        slug: "historie",
        title: "Waldbrand-Historie DACH — Monat und Saison",
        description: "Die laufende Saison und die Jahre seit 2020 aus dem eigenen FIRMS-Archiv: Ereignisse je Monat, Saisonverlauf und Einzelfälle mit Wetterlage.",
        updated: CONTENT_UPDATED
      },
      {
        slug: "thermalanomalien",
        title: "Thermalanomalien — Anlagen statt Brände",
        description: "Standorte, an denen Satelliten dauerhaft Wärme sehen: Stahlwerke, Zementwerke, Raffinerien — als eigene Klasse, damit sie nicht als Waldbrand zählen.",
        updated: CONTENT_UPDATED
      }
    ],
    meta: {
      title: "Waldbrandgefahr DACH — Brandradar",
      description: "Waldbrandgefahr, aktive Brände aus Satellitendaten und Trockenheit für Deutschland, Österreich und die Schweiz — EU-Index als Fläche, die nationalen Skalen von DWD und BAFU zur Einordnung.",
      h1: "Waldbrandgefahr in Deutschland, Österreich und der Schweiz",
      lead: "Das Brandradar von buscosun zeigt den europäischen Gefahrenindex als durchgehende Fläche über die DACH-Region und zur Einordnung die nationalen Skalen von DWD und BAFU, jede mit ihrer eigenen Stufenlogik (Österreich hat keine offene amtliche Stufe). Dazu aktive Brände aus Satellitendetektionen, von EFFIS kartierte Brandflächen, die zwischen den Überflügen beobachtete Verschiebung eines Brands sowie Bodentrockenheit und Feuerwetter als Treiber — ohne amtliches Warnprodukt zu sein."
    }
  },
  {
    id: "feedback",
    path: "/feedback",
    aliases: [],
    featureId: "feedback",
    subs: null,
    meta: {
      title: "Feedback — Ideen & Vorschläge",
      description: "Ideen, Wünsche und Fehlerberichte an buscosun — ohne Konto, ohne Tracker.",
      h1: "Ideen & Vorschläge für buscosun",
      lead: "buscosun wächst mit dem, was Nutzerinnen und Nutzer im DACH-Raum wirklich brauchen. Hier kannst du Ideen, Wünsche und Fehlerberichte hinterlassen — ohne Konto, ohne Tracker, ohne Formularzwang."
    }
  },
  {
    id: "validierung",
    path: "/validierung",
    aliases: [],
    featureId: "validation",
    subs: null,
    meta: {
      title: "Validierung — wie gut ist der KI-Nowcast?",
      description: "Messwerte statt Versprechen: wie gut der buscosun-Nowcast gegen das gemessene Radar abschneidet.",
      h1: "Wie gut ist der KI-Nowcast wirklich?",
      lead: "Diese Seite legt offen, wie gut der Nowcast von buscosun im Vergleich zum gemessenen Radar abschneidet — mit den Kennzahlen, die auch die Wetterdienste verwenden, und ohne die Fälle zu verschweigen, in denen er danebenliegt. Beim Aufruf rechnet sie ein echtes Hindcast: aus beobachteten RADOLAN-Analysen wird vorhergesagt und gegen die spätere Beobachtung verifiziert — Brier Skill Score, Kalibrierungsfehler, Trefferquote und Reliability-Diagramm je Vorlaufminute."
      // SEO/GEO 2026 (E3): indexierbar — die Seite ist der Beleg für die Konfidenz-Aussagen (/methodik/konfidenz-und-trefferquote/).
    }
  },
  {
    id: "mobiletest",
    path: "/mobiletest",
    aliases: [],
    featureId: "mobiletest",
    subs: null,
    meta: {
      title: "Mobile-Primitives — Testroute",
      description: "Interne Testroute für die mobilen UI-Bausteine.",
      h1: "Mobile-Primitives — Testroute",
      lead: "Interne Testroute für die mobilen UI-Bausteine von buscosun. Diese Seite ist nicht für Suchmaschinen bestimmt und zeigt keine Wetterdaten, sondern die Bedienelemente in ihren Zuständen.",
      noindex: true
    }
  }
];
var ROUTE_BY_ID = Object.fromEntries(ROUTES.map((r) => [r.id, r]));

// src/map/layerCatalog.ts
var LAYER_CATALOG = {
  wind: {
    label: "Wind",
    title: "Wind (DWD ICON-D2 u/v 10m · 2,2 km)"
  },
  gust: {
    label: "Böen",
    title: "Windböen — Spitzen (DWD ICON-D2 vmax_10m · 2,2 km, 0–24 h). Sicherheitsrelevant für Drohne, Kran, Höhenarbeit (vgl. Go/No-Go)."
  },
  nowcast: {
    label: "Niederschlag",
    title: "Niederschlag · jetzt–2 h — gemessenes Landesradar/Nowcast, per Land bis zum Nowcast-Horizont (DE RADOLAN-RV bis 2 h · AT GeoSphere INCA bis 3 h · CH MeteoSchweiz). Bewusst kurz & ehrlich: nur die gemessene Nahbereichs-Vorhersage, keine Modell-Verlängerung."
  },
  temp: {
    label: "Temperatur",
    title: "2-m-Temperatur (DWD ICON-D2 t_2m · 2,2 km, höhenkorrigiert)"
  },
  clouds: {
    label: "Wolken",
    title: "Bewölkung – tief/mittel/hoch geschichtet (DWD ICON-D2, 2,2 km, 0–12 h) — über den Slider"
  },
  sat: {
    label: "Satellit",
    title: "Meteosat (DWD OpenData, alle 3 h)"
  },
  lightning: {
    label: "Blitze",
    title: "Blitzortung letzte 60 Min (DWD Sferics)"
  },
  lightningfc: {
    label: "Blitzprognose",
    title: 'Blitz-Vorhersage — ICON-D2 Lightning Potential Index (lpi_max, 2,2 km, 0–12 h). Prognostiziertes Blitzrisiko über den Slider — NICHT die gemessenen Blitze der letzten Stunde (das ist der Layer „Blitze"). Prognose ≠ Messung. DACH, near-NWP-Horizont.'
  },
  stations: {
    label: "Stationen",
    title: "Wetterstationen DWD/TAWES/SMN — klicken für Live-Werte"
  },
  confidence: {
    label: "Sicherheit",
    title: "Vertrauens-Schleier (KI · Klima-MOS): Kreuzschraffur, je dichter desto unsicherer die Vorhersage — aus Vorlaufzeit × klimatologischer Plausibilität gegen 30 J. DWD-Stationsklimatologie"
  },
  snowline: {
    label: "Schneegrenze",
    title: "Schneefallgrenze (KI · ML #2): Linie — oberhalb fällt Niederschlag als Schnee. Physik-Anker ~+1 °C + gelernte Orts-Korrektur (DWD-Stationen), dem Gelände folgend (höhenkorrigiert)"
  },
  flownowcast: {
    label: "Flow-Nowcast",
    title: "Flow-Nowcast: Optical-Flow-Extrapolation des Radars (Horn-Schunck-Bewegungsfeld + Lagrange-Advektion). Bewegt den Regen intensitätserhaltend in die nahe Zukunft (~0–60 min). Nur DE (RADOLAN-RV), trainingsfrei."
  },
  poprob: {
    label: "Regen-Chance",
    title: 'Regenwahrscheinlichkeit (%): kalibriertes Flow-Ensemble — 15 Member advehieren das Radar mit gestörten Bewegungsfeldern; je Zelle der Anteil, der Regen bringt. „Wie wahrscheinlich" statt „wie viel". Nur DE, ~0–60 min.'
  },
  thunder: {
    label: "Gewitter",
    title: "Gewitterpotenzial — CAPE (Energie) × CIN (Deckel) × LPI (Blitzbereitschaft), ICON-D2 2,2 km, 0–12 h. Flächige Vorwarnung vor dem ersten Radarecho. DACH, near-NWP-Horizont. Potenzial ≠ Auslösung."
  },
  snow: {
    label: "Schnee",
    title: 'Schneehöhe & Neuschnee — ICON-D2 h_snow (Schneedecke, aktuelle Höhe) + abgeleiteter Neuschnee-Zuwachs (snow_gsp+snow_con → cm), 2,2 km. Die Schnee-MENGE als Fläche (cm), NICHT die Schneegrenzen-Linie (das ist „Schneegrenze"). Modus im Layer umschaltbar. DACH.'
  },
  rotation: {
    label: "Rotation",
    title: "Rotationspotenzial (Experten-Layer) — ICON-D2 Updraft-Helicity (uh_max + uh_max_low) + Supercell-Index (sdi_2), 2,2 km, 0–12 h, geglättet. Modell-VERDACHTSflächen für rotierende Gewitter (Superzellen: Großhagel, organisierte Schwergewitter). KEIN amtliches Warnprodukt, KEIN Warnersatz — maßgeblich sind die DWD-Warnungen. Verdacht ≠ Ereignis, hohe Fehlalarmrate. DACH."
  },
  cells: {
    label: "Zellbahnen",
    title: "Zellbahnen — DWD KONRAD3D: erkannte konvektive Zellen mit AMTLICHER Zugspur und amtlichem Unsicherheits-Trichter (jetzt bis +60 Min, 5-Minuten-Takt). Umriss = gemessen, Spur/Trichter = prognostiziert. Kein amtliches Warnprodukt und kein Warnersatz — maßgeblich sind die DWD-Warnungen. Abdeckung = Reichweite des deutschen Radarverbunds (reicht über die Grenze, dünnt dort aus)."
  },
  hail: {
    label: "Hagel",
    title: "Hagel — zwei amtliche Radarprodukte, bewusst nicht vermischt. FLÄCHE: MeteoSchweiz MESHS (maximal erwartete Korngröße in cm) bzw. POH (Hagelwahrscheinlichkeit in %), 1 km / 5 Min, nur 1. April–30. September — aus dem SCHWEIZER Radarverbund, dessen Reichweite über die Grenze nach Süddeutschland und Vorarlberg geht und dort ausdünnt. ZELLEN: DWD KONRAD3D — Zellen, in denen das Radar Hagel erkennt, mit Hagelfläche und Hinweis auf Großhagel, aus dem DEUTSCHEN Radarverbund (ebenfalls grenzüberschreitend). Österreich hat KEINE eigene offene Hagelquelle — im Osten Österreichs gibt es daher keine Abdeckung; das heißt NICHT, dass es dort nicht hagelt. Radarerkennung, keine Bodenmeldung. Kein amtliches Warnprodukt und kein Warnersatz."
  },
  warnings: {
    label: "Warnungen",
    title: 'Amtliche Wetterwarnungen von DWD (Deutschland, CAP, landkreisgenau) und MeteoSchweiz (Schweiz, Warnregionen, über den MeteoAlarm-Feed) — alle 5 Minuten. Das AMTLICHE Warnprodukt: alle anderen Layer dieser Karte verweisen darauf. Überschrift, Beschreibung und Handlungshinweis werden wortwörtlich übernommen. Die Flächenfarbe ist für Deutschland die amtliche Warnfarbe aus der Meldung; der Schweizer Feed führt keine Farbe mit, dort ist sie aus der amtlichen Gefahrenstufe ABGELEITET. Warnstufen werden quellenrein geführt — die Stufennummern der beiden Dienste bedeuten Verschiedenes. Der Layer folgt dem Zeit-Slider: gezeigt wird, was zur eingestellten Stunde gilt. ÖSTERREICH fehlt weiterhin (geplant) — dort warnt GeoSphere Austria; eine leere Fläche über Österreich heißt NICHT „keine Warnung". Fällt eine der beiden Quellen aus, sagt die Karte ausdrücklich, welches Land fehlt. Kein Ersatz für die amtliche Bekanntmachung: maßgeblich bleiben dwd.de/warnungen und meteoschweiz.admin.ch.'
  }
};

// src/router/placeSlugs.json
var placeSlugs_default = [["berlin", "Berlin", 52.52, 13.405, "DE"], ["hamburg", "Hamburg", 53.551, 9.993, "DE"], ["muenchen", "München", 48.137, 11.575, "DE"], ["koeln", "Köln", 50.938, 6.96, "DE"], ["frankfurt-am-main", "Frankfurt am Main", 50.11, 8.682, "DE"], ["stuttgart", "Stuttgart", 48.776, 9.183, "DE"], ["duesseldorf", "Düsseldorf", 51.228, 6.773, "DE"], ["leipzig", "Leipzig", 51.34, 12.375, "DE"], ["dortmund", "Dortmund", 51.514, 7.466, "DE"], ["essen", "Essen", 51.456, 7.012, "DE"], ["bremen", "Bremen", 53.079, 8.802, "DE"], ["dresden", "Dresden", 51.051, 13.738, "DE"], ["hannover", "Hannover", 52.376, 9.733, "DE"], ["nuernberg", "Nürnberg", 49.452, 11.077, "DE"], ["duisburg", "Duisburg", 51.434, 6.762, "DE"], ["bochum", "Bochum", 51.482, 7.216, "DE"], ["wuppertal", "Wuppertal", 51.256, 7.15, "DE"], ["bielefeld", "Bielefeld", 52.03, 8.532, "DE"], ["bonn", "Bonn", 50.737, 7.098, "DE"], ["muenster", "Münster", 51.961, 7.626, "DE"], ["karlsruhe", "Karlsruhe", 49.007, 8.404, "DE"], ["mannheim", "Mannheim", 49.488, 8.466, "DE"], ["augsburg", "Augsburg", 48.371, 10.898, "DE"], ["wiesbaden", "Wiesbaden", 50.083, 8.24, "DE"], ["mainz", "Mainz", 49.992, 8.247, "DE"], ["kiel", "Kiel", 54.323, 10.122, "DE"], ["luebeck", "Lübeck", 53.866, 10.685, "DE"], ["rostock", "Rostock", 54.092, 12.099, "DE"], ["freiburg-im-breisgau", "Freiburg im Breisgau", 47.999, 7.842, "DE"], ["erfurt", "Erfurt", 50.984, 11.029, "DE"], ["magdeburg", "Magdeburg", 52.121, 11.627, "DE"], ["saarbruecken", "Saarbrücken", 49.24, 6.997, "DE"], ["potsdam", "Potsdam", 52.391, 13.064, "DE"], ["regensburg", "Regensburg", 49.013, 12.102, "DE"], ["ingolstadt", "Ingolstadt", 48.766, 11.425, "DE"], ["wuerzburg", "Würzburg", 49.792, 9.953, "DE"], ["heidelberg", "Heidelberg", 49.398, 8.672, "DE"], ["ulm", "Ulm", 48.401, 9.987, "DE"], ["kassel", "Kassel", 51.312, 9.48, "DE"], ["osnabrueck", "Osnabrück", 52.279, 8.047, "DE"], ["oldenburg", "Oldenburg", 53.144, 8.214, "DE"], ["trier", "Trier", 49.75, 6.638, "DE"], ["konstanz", "Konstanz", 47.66, 9.176, "DE"], ["garmisch-partenkirchen", "Garmisch-Partenkirchen", 47.492, 11.096, "DE"], ["berchtesgaden", "Berchtesgaden", 47.63, 13.004, "DE"], ["oberstdorf", "Oberstdorf", 47.41, 10.279, "DE"], ["mittenwald", "Mittenwald", 47.444, 11.262, "DE"], ["fuessen", "Füssen", 47.571, 10.702, "DE"], ["sylt-westerland", "Sylt (Westerland)", 54.907, 8.305, "DE"], ["norderney", "Norderney", 53.707, 7.155, "DE"], ["cuxhaven", "Cuxhaven", 53.858, 8.693, "DE"], ["garmisch-zugspitze", "Garmisch Zugspitze", 47.421, 10.985, "DE"], ["brocken", "Brocken", 51.799, 10.615, "DE"], ["feldberg-schwarzwald", "Feldberg (Schwarzwald)", 47.874, 8.004, "DE"], ["goerlitz", "Görlitz", 51.156, 14.989, "DE"], ["flensburg", "Flensburg", 54.792, 9.437, "DE"], ["passau", "Passau", 48.567, 13.431, "DE"], ["bamberg", "Bamberg", 49.892, 10.886, "DE"], ["wien", "Wien", 48.208, 16.373, "AT"], ["graz", "Graz", 47.071, 15.439, "AT"], ["linz", "Linz", 48.306, 14.286, "AT"], ["salzburg", "Salzburg", 47.811, 13.055, "AT"], ["innsbruck", "Innsbruck", 47.269, 11.404, "AT"], ["klagenfurt", "Klagenfurt", 46.624, 14.308, "AT"], ["villach", "Villach", 46.611, 13.856, "AT"], ["wels", "Wels", 48.157, 14.024, "AT"], ["sankt-poelten", "Sankt Pölten", 48.204, 15.625, "AT"], ["dornbirn", "Dornbirn", 47.413, 9.744, "AT"], ["bregenz", "Bregenz", 47.503, 9.747, "AT"], ["wiener-neustadt", "Wiener Neustadt", 47.814, 16.242, "AT"], ["steyr", "Steyr", 48.038, 14.42, "AT"], ["feldkirch", "Feldkirch", 47.239, 9.598, "AT"], ["wolfsberg", "Wolfsberg", 46.84, 14.844, "AT"], ["leoben", "Leoben", 47.382, 15.094, "AT"], ["krems-an-der-donau", "Krems an der Donau", 48.41, 15.614, "AT"], ["kufstein", "Kufstein", 47.583, 12.169, "AT"], ["zell-am-see", "Zell am See", 47.323, 12.795, "AT"], ["sankt-anton-am-arlberg", "Sankt Anton am Arlberg", 47.13, 10.264, "AT"], ["ischgl", "Ischgl", 47.011, 10.292, "AT"], ["soelden", "Sölden", 46.967, 11.008, "AT"], ["obergurgl", "Obergurgl", 46.867, 11.026, "AT"], ["kitzbuehel", "Kitzbühel", 47.446, 12.392, "AT"], ["mayrhofen", "Mayrhofen", 47.166, 11.868, "AT"], ["lech-am-arlberg", "Lech am Arlberg", 47.208, 10.143, "AT"], ["bad-gastein", "Bad Gastein", 47.115, 13.134, "AT"], ["schladming", "Schladming", 47.394, 13.687, "AT"], ["saalbach", "Saalbach", 47.39, 12.636, "AT"], ["seefeld-in-tirol", "Seefeld in Tirol", 47.329, 11.188, "AT"], ["hallstatt", "Hallstatt", 47.562, 13.649, "AT"], ["bad-ischl", "Bad Ischl", 47.711, 13.623, "AT"], ["eisenstadt", "Eisenstadt", 47.846, 16.524, "AT"], ["bruck-an-der-mur", "Bruck an der Mur", 47.41, 15.272, "AT"], ["spittal-an-der-drau", "Spittal an der Drau", 46.795, 13.499, "AT"], ["lienz", "Lienz", 46.829, 12.769, "AT"], ["imst", "Imst", 47.239, 10.738, "AT"], ["landeck", "Landeck", 47.139, 10.566, "AT"], ["zell-am-ziller", "Zell am Ziller", 47.232, 11.884, "AT"], ["gmunden", "Gmunden", 47.918, 13.799, "AT"], ["zuerich", "Zürich", 47.377, 8.541, "CH"], ["genf", "Genf", 46.204, 6.143, "CH"], ["basel", "Basel", 47.56, 7.588, "CH"], ["bern", "Bern", 46.948, 7.447, "CH"], ["lausanne", "Lausanne", 46.52, 6.633, "CH"], ["winterthur", "Winterthur", 47.5, 8.724, "CH"], ["luzern", "Luzern", 47.05, 8.305, "CH"], ["sankt-gallen", "Sankt Gallen", 47.424, 9.377, "CH"], ["lugano", "Lugano", 46.004, 8.951, "CH"], ["biel-bienne", "Biel/Bienne", 47.137, 7.247, "CH"], ["thun", "Thun", 46.758, 7.628, "CH"], ["koeniz", "Köniz", 46.924, 7.415, "CH"], ["la-chaux-de-fonds", "La Chaux-de-Fonds", 47.1, 6.826, "CH"], ["freiburg-fribourg", "Freiburg (Fribourg)", 46.806, 7.162, "CH"], ["schaffhausen", "Schaffhausen", 47.697, 8.635, "CH"], ["chur", "Chur", 46.851, 9.532, "CH"], ["neuenburg-neuch-tel", "Neuenburg (Neuchâtel)", 46.992, 6.931, "CH"], ["sitten-sion", "Sitten (Sion)", 46.233, 7.359, "CH"], ["zug", "Zug", 47.166, 8.516, "CH"], ["davos", "Davos", 46.803, 9.836, "CH"], ["sankt-moritz", "Sankt Moritz", 46.498, 9.838, "CH"], ["zermatt", "Zermatt", 46.021, 7.749, "CH"], ["interlaken", "Interlaken", 46.686, 7.863, "CH"], ["grindelwald", "Grindelwald", 46.624, 8.034, "CH"], ["verbier", "Verbier", 46.096, 7.228, "CH"], ["arosa", "Arosa", 46.783, 9.679, "CH"], ["engelberg", "Engelberg", 46.821, 8.405, "CH"], ["locarno", "Locarno", 46.171, 8.799, "CH"], ["bellinzona", "Bellinzona", 46.195, 9.024, "CH"], ["andermatt", "Andermatt", 46.636, 8.594, "CH"], ["saas-fee", "Saas-Fee", 46.108, 7.927, "CH"], ["crans-montana", "Crans-Montana", 46.308, 7.481, "CH"], ["wengen", "Wengen", 46.605, 7.922, "CH"], ["gstaad", "Gstaad", 46.473, 7.286, "CH"], ["montreux", "Montreux", 46.431, 6.911, "CH"], ["brig", "Brig", 46.319, 7.988, "CH"], ["scuol", "Scuol", 46.797, 10.3, "CH"], ["flims", "Flims", 46.837, 9.285, "CH"], ["adelboden", "Adelboden", 46.493, 7.56, "CH"], ["pontresina", "Pontresina", 46.491, 9.899, "CH"], ["aachen", "Aachen", 50.777, 6.083, "DE"], ["braunschweig", "Braunschweig", 52.266, 10.527, "DE"], ["bremerhaven", "Bremerhaven", 53.554, 8.576, "DE"], ["chemnitz", "Chemnitz", 50.836, 12.929, "DE"], ["darmstadt", "Darmstadt", 49.872, 8.65, "DE"], ["dueren", "Düren", 50.804, 6.493, "DE"], ["erlangen", "Erlangen", 49.591, 11.008, "DE"], ["gera", "Gera", 50.88, 12.082, "DE"], ["giessen", "Gießen", 50.587, 8.676, "DE"], ["goettingen", "Göttingen", 51.534, 9.932, "DE"], ["guetersloh", "Gütersloh", 51.907, 8.379, "DE"], ["hagen", "Hagen", 51.361, 7.472, "DE"], ["halle-saale", "Halle (Saale)", 51.482, 11.979, "DE"], ["hamm", "Hamm", 51.68, 7.821, "DE"], ["hanau-am-main", "Hanau am Main", 50.134, 8.914, "DE"], ["heilbronn", "Heilbronn", 49.14, 9.221, "DE"], ["hildesheim", "Hildesheim", 52.151, 9.951, "DE"], ["iserlohn", "Iserlohn", 51.375, 7.703, "DE"], ["jena", "Jena", 50.929, 11.59, "DE"], ["kaiserslautern", "Kaiserslautern", 49.443, 7.772, "DE"], ["koblenz", "Koblenz", 50.354, 7.579, "DE"], ["krefeld", "Krefeld", 51.336, 6.554, "DE"], ["marl", "Marl", 51.657, 7.09, "DE"], ["moenchengladbach", "Mönchengladbach", 51.185, 6.442, "DE"], ["paderborn", "Paderborn", 51.719, 8.754, "DE"], ["pforzheim", "Pforzheim", 48.884, 8.699, "DE"], ["recklinghausen", "Recklinghausen", 51.614, 7.197, "DE"], ["reutlingen", "Reutlingen", 48.491, 9.204, "DE"], ["salzgitter", "Salzgitter", 52.157, 10.415, "DE"], ["schwerin", "Schwerin", 53.629, 11.413, "DE"], ["siegen", "Siegen", 50.875, 8.024, "DE"], ["tuebingen", "Tübingen", 48.523, 9.052, "DE"], ["wolfsburg", "Wolfsburg", 52.425, 10.782, "DE"], ["zwickau", "Zwickau", 50.727, 12.488, "DE"], ["amstetten", "Amstetten", 48.123, 14.872, "AT"], ["bludenz", "Bludenz", 47.155, 9.823, "AT"], ["enns", "Enns", 48.213, 14.476, "AT"], ["gaenserndorf", "Gänserndorf", 48.339, 16.72, "AT"], ["knittelfeld", "Knittelfeld", 47.217, 14.817, "AT"], ["korneuburg", "Korneuburg", 48.35, 16.333, "AT"], ["moedling", "Mödling", 48.086, 16.289, "AT"], ["purkersdorf", "Purkersdorf", 48.208, 16.175, "AT"], ["ried-im-innkreis", "Ried im Innkreis", 48.211, 13.489, "AT"], ["sankt-veit-an-der-glan", "Sankt Veit an der Glan", 46.768, 14.36, "AT"], ["stockerau", "Stockerau", 48.383, 16.217, "AT"], ["strasshof-an-der-nordbahn", "Strasshof an der Nordbahn", 48.317, 16.667, "AT"], ["tulln", "Tulln", 48.328, 16.059, "AT"], ["aarau", "Aarau", 47.393, 8.044, "CH"], ["buelach", "Bülach", 47.522, 8.54, "CH"], ["bulle", "Bulle", 46.618, 7.057, "CH"], ["burgdorf", "Burgdorf", 47.059, 7.628, "CH"], ["monthey", "Monthey", 46.255, 6.954, "CH"], ["nyon", "Nyon", 46.383, 6.24, "CH"], ["olten", "Olten", 47.35, 7.903, "CH"], ["rapperswil", "Rapperswil", 47.226, 8.822, "CH"], ["solothurn", "Solothurn", 47.208, 7.537, "CH"], ["wettingen", "Wettingen", 47.466, 8.327, "CH"], ["wetzikon", "Wetzikon", 47.326, 8.798, "CH"], ["wil", "Wil", 47.462, 9.046, "CH"], ["yverdon-les-bains", "Yverdon-les-Bains", 46.779, 6.641, "CH"]];

// src/share/placeTable.ts
var BY_SLUG = new Map(placeSlugs_default.map((r) => [r[0], r]));
var asCountry = (c) => c === "AT" || c === "CH" ? c : "DE";
function placeBySlug(slug) {
  if (!isSlugShape(slug)) return null;
  const r = BY_SLUG.get(slug);
  return r ? { name: r[1], lat: r[2], lon: r[3], country: asCountry(r[4]) } : null;
}
function slugForPlace(loc) {
  const slug = toSlug(loc.name);
  if (!isSlugShape(slug)) return null;
  const r = BY_SLUG.get(slug);
  const inTable = !!r && asCountry(r[4]) === loc.country && distanceKm(loc.lat, loc.lon, r[2], r[3]) <= PLACE_SNAP_KM;
  return { slug, inTable };
}
var PLACE_TABLE_SIZE = BY_SLUG.size;
function resolveRoutePlace(slug, queryPlace) {
  const s = isSlugShape(slug) ? slug : null;
  const table = s ? placeBySlug(s) : null;
  if (queryPlace) {
    const name = queryPlace.name || table?.name || (s ? deSlugName(s) : "");
    if (!name) return { place: null, slug: s, inTable: false, unresolved: !!s };
    return { place: { ...queryPlace, name }, slug: s, inTable: false, unresolved: false };
  }
  if (table) return { place: table, slug: s, inTable: true, unresolved: false };
  return { place: null, slug: s, inTable: false, unresolved: !!s };
}

// src/share/shareText.ts
var WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function formatWhen(ms, locale = "de", timeZone) {
  if (ms == null || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  try {
    const p = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : locale, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      ...timeZone ? { timeZone } : {}
    }).formatToParts(d);
    const get = (t) => p.find((x) => x.type === t)?.value ?? "";
    return `${get("weekday")} ${get("day")}.${get("month")}. ${get("hour")}:${get("minute")}`;
  } catch {
    return `${WD[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}
function shareCopy(s, locale = "de", timeZone) {
  const head = s.place?.name ? `${s.feature} ${s.place.name}` : s.feature;
  const topic = s.topic ? s.detail ? `${s.topic} (${s.detail})` : s.topic : null;
  const when = formatWhen(s.validAtMs, locale, timeZone);
  const tail = [topic, when].filter(Boolean).join(", ");
  const title = tail ? `${head} — ${tail}` : head;
  const description = s.description?.trim() || [
    topic ? `${topic} für ${s.place?.name ?? "Deutschland, Österreich und die Schweiz"}` : `${s.feature} für ${s.place?.name ?? "DE, AT und CH"}`,
    when ? `Stand ${when}` : "live",
    "aus amtlichen Quellen, ohne Konto und ohne Tracker."
  ].join(" · ");
  return { title, description, message: title };
}

// src/share/shareAdapters.ts
var SHARE_ROUTES = [
  "wetterkarte",
  "warnungen",
  "regenradar",
  "waldbrand",
  "atmosphaere",
  "eventplanung",
  "wetterarchiv",
  "globus",
  "vorhersage"
];
var PASSTHROUGH = /* @__PURE__ */ new Set([
  "waldbrand",
  "atmosphaere",
  "eventplanung",
  "wetterarchiv",
  "globus",
  "vorhersage"
]);
var PLACE_SEGMENT = {
  atmosphaere: 2,
  // hinter der Linse
  eventplanung: 2,
  // hinter dem Anlass
  wetterarchiv: 1,
  // direkt hinter der Route
  vorhersage: 1
  // dito
};
var VIEW_LABEL = {
  // Waldbrand
  gefahrenindex: "Gefahrenindex",
  "aktive-braende": "Aktive Brände",
  trockenheit: "Trockenheit",
  historie: "Historie",
  thermalanomalien: "Thermalanomalien",
  // Atmosphäre
  "berg-und-weg": "Föhn, Berg & Weg",
  fliegen: "Thermik & Fliegen",
  querschnitt: "Querschnitt",
  arbeitsfenster: "Arbeitsfenster",
  // Eventplanung (Anlass)
  grillen: "Grillen",
  hochzeit: "Hochzeit",
  wandern: "Wandern",
  drohne: "Drohnenflug",
  fotografie: "Fotografie",
  sterne: "Sternenhimmel",
  radtour: "Radtour",
  picknick: "Picknick",
  laufen: "Laufen",
  baden: "Baden"
};
var SHARE_FEATURE_LABEL = {
  wetterkarte: "Wetterkarte",
  warnungen: "Amtliche Warnungen",
  regenradar: "Regenradar",
  waldbrand: "Brandradar",
  atmosphaere: "Atmosphäre",
  eventplanung: "Event-Planung",
  wetterarchiv: "Wetterarchiv",
  globus: "Globus",
  vorhersage: "Vorhersage"
};
function parseShareUrl(pathname, search, nowMs = Date.now()) {
  const seg = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const head = seg[0] ?? "";
  const routeId = SHARE_ROUTES.includes(head) ? head : null;
  if (!routeId) return null;
  if (PASSTHROUGH.has(routeId)) {
    const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const pairs = [...q.entries()];
    const placeAt = PLACE_SEGMENT[routeId];
    const viewSlug = placeAt === 1 ? null : seg[1] ?? null;
    const rp2 = resolveRoutePlace(placeAt ? seg[placeAt] : void 0, placeFromPairs(q));
    const t = parseValidTime(q.get("t"));
    return {
      routeId,
      place: rp2.place,
      layers: [],
      primary: null,
      cam: null,
      validAtMs: t != null && t > nowMs ? t : null,
      extra: shareableExtras(pairs),
      timePast: t != null && t <= nowMs ? true : void 0,
      placeUnresolved: rp2.unresolved,
      viewSlug,
      rawPath: "/" + seg.join("/"),
      rawQuery: pairs
    };
  }
  const parsed = parseMapSearch(search, nowMs);
  const tExact = parseValidTime(new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("t"));
  const layerSlug = routeId === "wetterkarte" ? seg[1] : routeId === "warnungen" ? LAYER_SLUGS.warnings : void 0;
  const ortSlug = routeId === "wetterkarte" ? seg[2] : seg[1];
  const rp = resolveRoutePlace(ortSlug, parsed.place);
  const route = routeId === "regenradar" ? { primary: null, all: [] } : layersFromRoute(layerSlug, parsed.l);
  return {
    routeId,
    place: rp.place,
    layers: route.all,
    primary: route.primary,
    cam: parsed.cam,
    validAtMs: tExact != null && tExact > nowMs ? tExact : parsed.hour != null && parsed.hour > 0 ? nowMs + parsed.hour * 36e5 : null,
    model: parsed.model,
    point: parsed.point,
    radar: parsed.radar,
    extra: shareableExtras(parsed.extra),
    timePast: parsed.timePast,
    placeUnresolved: rp.unresolved
  };
}
function describeShareState(s, timeZone) {
  const feature = SHARE_FEATURE_LABEL[s.routeId];
  const topic = s.routeId === "wetterkarte" && s.primary ? LAYER_CATALOG[s.primary].label : s.viewSlug ? VIEW_LABEL[s.viewSlug] ?? null : null;
  const description = s.routeId === "wetterkarte" && s.primary ? LAYER_SLUG_DESCRIPTION[s.primary] : subRouteDescription(s.routeId, s.viewSlug);
  return shareCopy({
    feature,
    topic: topic || null,
    place: s.place,
    validAtMs: s.validAtMs,
    description
  }, "de", timeZone);
}
function subRouteDescription(routeId, viewSlug) {
  const def = ROUTE_BY_ID[routeId];
  if (!def) return null;
  const sub = viewSlug ? def.subs?.find((x) => x.slug === viewSlug) : null;
  return sub?.description ?? def.meta.description ?? null;
}
function placeFromPairs(q) {
  const latRaw = q.get("olat"), lonRaw = q.get("olon");
  if (!latRaw || !lonRaw) return null;
  const lat = Number(latRaw), lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const land = (q.get("land") ?? "").toUpperCase();
  return {
    name: (q.get("ort") ?? "").trim(),
    lat: roundTo(lat, 4),
    lon: roundTo(lon, 4),
    country: land === "AT" || land === "CH" ? land : "DE"
  };
}
function describeShareUrl(pathname, search, nowMs = Date.now(), timeZone) {
  const st = parseShareUrl(pathname, search, nowMs);
  return st ? describeShareState(st, timeZone) : null;
}
function ogCardForShare(s) {
  const view = s.viewSlug ?? (s.primary ? LAYER_SLUGS[s.primary] : null);
  if (s.routeId === "warnungen") return ogCardPath("warnungen");
  if (s.routeId === "wetterkarte" && view === LAYER_SLUGS.warnings) return ogCardPath("warnungen");
  return ogCardPath(s.routeId, view);
}
function canonicalShareKey(s) {
  const parts = [s.routeId];
  if (s.viewSlug) parts.push(`v:${s.viewSlug}`);
  if (s.primary) parts.push(`l:${LAYER_SLUGS[s.primary]}`);
  const rest = s.layers.filter((k) => k !== s.primary).map((k) => LAYER_SLUGS[k]).sort();
  if (rest.length) parts.push(`l+:${rest.join(",")}`);
  if (s.place) {
    const sl = slugForPlace(s.place);
    parts.push(sl?.inTable ? `o:${sl.slug}` : `o:${s.place.lat.toFixed(2)},${s.place.lon.toFixed(2)}`);
  }
  if (s.validAtMs != null) parts.push(`t:${new Date(Math.floor(s.validAtMs / 36e5) * 36e5).toISOString().slice(0, 13)}`);
  return parts.join("|");
}
export {
  OG_HEIGHT,
  OG_WIDTH,
  SHARE_ROUTES,
  SHARE_URL_HARD_MAX,
  SITE_NAME,
  SITE_URL,
  canonicalShareKey,
  describeShareState,
  describeShareUrl,
  ogCardForShare,
  ogCardPath,
  parseShareUrl
};
