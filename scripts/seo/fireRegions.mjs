/**
 * Waldbrand nach Region (Phase WBS, `audit/seo-waldbrand.md`): Brandereignisse der Saison je Land und je Bundesland/Kanton.
 *
 * Reines Node-ESM, liest beim Build nur Dateien aus dem Repo (kein Netz):
 *   - `public/fire/bh/index-season-v1.json`  Saison-Index des Brandarchivs (BH2), Europa-Box, Ereignisse positional
 *   - `public/fire/bh/season-series-v1.json` Saisonsummen 2020 … heute je Land (dieselbe Zählregel wie die App-Kurve)
 *   - `scripts/seo/data/dach-admin1.json`    51 Regionen DE/AT/CH aus Natural Earth (gemeinfrei), `build-dach-admin1.mjs`
 *
 * Zählregel wie die Saisonkurve der App (`src/fire/history/historySeries.ts`): ein Ereignis zählt, wenn es in DE/AT/CH liegt und
 * nicht auf einem Anlagenstandort (`anomalyKind !== 'site'`). Eine EFFIS-Kartierung zählt je `effisId` einmal, mit der größten
 * Fläche, die ein Ereignis dieser Kennung trägt. Jede Zahl auf den Seiten kommt aus dieser Datei — keine zweite Rechnung im Renderer.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX_FILE = join(ROOT, 'public', 'fire', 'bh', 'index-season-v1.json');
const SERIES_FILE = join(ROOT, 'public', 'fire', 'bh', 'season-series-v1.json');
const ADMIN1_FILE = join(ROOT, 'scripts', 'seo', 'data', 'dach-admin1.json');

/** Quelldateien der Seiten — für `lastmod` aus Git (`gitDate.mjs`). */
export const FIRE_REGION_SOURCES = [
  'public/fire/bh/index-season-v1.json', 'public/fire/bh/season-series-v1.json', 'scripts/seo/data/dach-admin1.json',
  'scripts/seo/fireRegions.mjs', 'scripts/seo/fireRegionPages.mjs',
];

/** Pfad-Wurzel der Seiten (D1: nicht unter `/waldbrand/`, das gehört dem App-Router). */
export const FIRE_BASE = '/waldbrandgefahr/';
/** D2: eigene Regionsseite ab so vielen Brandereignissen — oder mit mindestens einer EFFIS-Kartierung. */
export const MIN_REGION_EVENTS = 5;
/** Ein Ereignis außerhalb aller Umrisse seines Landes wird der nächsten Region bis zu dieser Entfernung zugeordnet. */
const SNAP_KM = 15;

export const FIRE_COUNTRIES = {
  DE: { code: 'DE', slug: 'deutschland', name: 'Deutschland', flag: '🇩🇪', regionWord: 'Bundesland', regionsWord: 'Bundesländer', regionsDat: 'Bundesländern', locale: 'de-DE' },
  AT: { code: 'AT', slug: 'oesterreich', name: 'Österreich', flag: '🇦🇹', regionWord: 'Bundesland', regionsWord: 'Bundesländer', regionsDat: 'Bundesländern', locale: 'de-AT' },
  CH: { code: 'CH', slug: 'schweiz', name: 'Schweiz', flag: '🇨🇭', regionWord: 'Kanton', regionsWord: 'Kantone', regionsDat: 'Kantonen', locale: 'de-CH' },
};
export const fireCountryPath = (code) => `${FIRE_BASE}${FIRE_COUNTRIES[code].slug}/`;

// ------------------------------------------------------------------ amtliche Stellen (D6: nur Belegtes)

const DWD_WBI = { label: 'Waldbrandgefahrenindex des DWD', href: 'https://www.dwd.de/DE/leistungen/waldbrandgef/waldbrandgef.html' };
const NINA = { label: 'Warnmeldungen NINA/MoWaS (BBK)', href: 'https://warnung.bund.de/meldungen' };
const WBG_CH = { label: 'waldbrandgefahr.ch (BAFU und Kantone)', href: 'https://www.waldbrandgefahr.ch/' };

/**
 * Was je Land amtlich gilt. Wortlaut deckungsgleich mit `/wissen/waldbrandwarnstufen-de-at-ch/` (explainers-extra.mjs);
 * Notrufe: DE 112, AT Feuerwehr 122, CH Feuerwehr 118 — 112 gilt in allen drei Ländern.
 */
export const FIRE_OFFICIAL = {
  DE: {
    who: 'In Deutschland berechnet der Deutsche Wetterdienst täglich den Waldbrandgefahrenindex in fünf Stufen (1 sehr geringe bis 5 sehr hohe Gefahr) für seine Stationen. Welche Regeln daraus folgen — Rauchverbot, Feuerverbot, Sperrungen —, legen Länder, Forstbehörden und Landkreise fest; die Stufe allein ist kein Verbot.',
    links: [DWD_WBI, NINA],
    emergency: 'Feuer oder Rauch im Wald sofort über den Notruf 112 melden.',
  },
  AT: {
    who: 'Österreich hat keine offene, bundesweit einheitliche amtliche Waldbrandgefahrenstufe. Waldbrandverordnungen erlassen die Bezirkshauptmannschaften und Länder und veröffentlichen sie auf ihren eigenen Seiten. Wetterwarnungen von GeoSphere Austria (Hitze, Gewitter) sind keine Waldbrandstufe.',
    links: [{ label: 'Warnungen von GeoSphere Austria', href: 'https://portale.geosphere.at/portallib/html/warninfo/warninfo_alle.php' }],
    emergency: 'Feuer oder Rauch im Wald sofort der Feuerwehr melden: Notruf 122 (oder 112).',
  },
  CH: {
    who: 'In der Schweiz beurteilen die Kantone die Waldbrandgefahr in fünf Stufen (1 gering bis 5 sehr gross) und ordnen Massnahmen wie Feuerverbote an. Das Bundesamt für Umwelt bündelt Stufen und Massnahmen aller Kantone auf einer Karte.',
    links: [WBG_CH, { label: 'Naturgefahrenportal des Bundes', href: 'https://www.naturgefahren.ch/' }],
    emergency: 'Feuer oder Rauch im Wald sofort der Feuerwehr melden: Notruf 118 (oder 112).',
  },
};

/** Regionsgenaue, belegte Angaben (Quelle je Eintrag im Link). Alle übrigen Regionen tragen die Angaben ihres Landes. */
export const FIRE_OFFICIAL_REGION = {
  'DE-BB': {
    text: 'In Brandenburg wird nach § 22 des Landeswaldgesetzes vom 1. März bis 30. September für jeden Landkreis und jede kreisfreie Stadt eine Waldbrandgefahrenstufe festgelegt; ab Stufe 3 sind die Waldbrandzentralen des Landesbetriebs Forst besetzt.',
    link: { label: 'Verwaltungsvorschrift Waldbrände (Brandenburg)', href: 'https://bravors.brandenburg.de/verwaltungsvorschriften/waldbraende_2024' },
  },
  'DE-MV': {
    text: 'In Mecklenburg-Vorpommern stuft die Landesforstanstalt das Land täglich in fünf Waldbrandgefahrenstufen ein und veröffentlicht sie auf ihrer Seite; die Waldbrandschutzverordnung des Landes knüpft zusätzliche Pflichten an die Stufen 4 und 5.',
    link: { label: 'Landesforst Mecklenburg-Vorpommern', href: 'https://www.wald-mv.de/' },
  },
  'DE-SN': {
    text: 'In Sachsen veröffentlichen Sachsenforst und der Deutsche Wetterdienst die Waldbrandgefahrenstufen für 31 Vorhersageregionen; bei Stufe 4 und 5 können Landkreise und kreisfreie Städte das Betreten des Waldes beschränken.',
    link: { label: 'Staatsbetrieb Sachsenforst', href: 'https://www.sachsenforst.de/' },
  },
  'CH-GR': {
    text: 'In Graubünden ist nach Angabe des Kantons stets die aktuelle Waldbrandgefahrenkarte des Amtes für Wald und Naturgefahren massgebend.',
    link: { label: 'Waldbrandgefahr Graubünden (AWN)', href: 'https://www.gr.ch/DE/institutionen/verwaltung/diem/awn/aktuelles/Waldbrandgefahr/Seiten/aktuell.aspx' },
  },
  'AT-4': {
    text: 'Für Oberösterreich führt der Landes-Feuerwehrverband eine offene Einsatzübersicht; sie zeigt Einsätze, keine Gefahrenstufe.',
    link: { label: 'Einsatzübersicht Oberösterreich', href: 'https://einsaetze.ooelfv.at/einsatz/6stunden' },
  },
  'AT-1': {
    text: 'Für das Burgenland führt die Landessicherheitszentrale eine offene Einsatzübersicht; sie zeigt Einsätze, keine Gefahrenstufe.',
    link: { label: 'Einsatzübersicht Burgenland', href: 'https://einsatz.lsz-b.at/' },
  },
};

/** Ortsangabe mit Artikel, wo das Deutsche einen verlangt („im Wallis", „in der Steiermark"); sonst „in <Name>". */
const IN_NAME = {
  'CH-VS': 'im Wallis', 'CH-TI': 'im Tessin', 'CH-AG': 'im Aargau', 'CH-TG': 'im Thurgau', 'CH-VD': 'in der Waadt', 'CH-JU': 'im Jura',
  'AT-6': 'in der Steiermark', 'AT-1': 'im Burgenland', 'DE-SL': 'im Saarland',
};

// ------------------------------------------------------------------ Geometrie

function ringContains(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polygonsContain(x, y, polygons) {
  for (const poly of polygons) if (ringContains(x, y, poly[0]) && !poly.slice(1).some((h) => ringContains(x, y, h))) return true;
  return false;
}
/** Abstand eines Punkts zum Umriss in km (gleichabständige Näherung — genügt für die 15-km-Regel). */
function distanceKm(lon, lat, polygons) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57;
  let best = Infinity;
  for (const poly of polygons) for (const ring of poly) {
    for (let i = 1; i < ring.length; i++) {
      const ax = (ring[i - 1][0] - lon) * kx, ay = (ring[i - 1][1] - lat) * ky;
      const bx = (ring[i][0] - lon) * kx, by = (ring[i][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}
function bboxOf(polygons) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const poly of polygons) for (const [x, y] of poly[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
}

// ------------------------------------------------------------------ Daten laden

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const MONTHS = ['März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober'];

/** Bezirksnamen aus GeoNames lesbar machen; fremde Verwaltungseinheiten (nächster Ort jenseits der Grenze) fallen weg. */
const FOREIGN_ADMIN = /Province|Provincia|Municipality|Okres|Powiat|Gmina|Comune|Département|Kraj|Megye|Județ|Obcina|Občina/i;
/** GeoNames führt einzelne Kreise nur unter dem sorbischen Namen. */
const DISTRICT_NAME_FIX = { 'Wokrejs Sprjewja-Nysa': 'Landkreis Spree-Neiße' };
function districtLabel(country, raw) {
  if (!raw || FOREIGN_ADMIN.test(raw)) return null;
  let s = DISTRICT_NAME_FIX[raw] ?? String(raw).replace(/^Politischer Bezirk /, 'Bezirk ');
  if (country === 'CH') s = s.replace(/ District$/, '');
  return s;
}

function load() {
  if (!existsSync(INDEX_FILE) || !existsSync(ADMIN1_FILE)) return null;
  const idx = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
  const admin = JSON.parse(readFileSync(ADMIN1_FILE, 'utf8'));
  const series = existsSync(SERIES_FILE) ? JSON.parse(readFileSync(SERIES_FILE, 'utf8')) : null;
  const F = idx.fields;
  const at = Object.fromEntries(F.map((f, i) => [f, i]));
  const regions = admin.regions.map((r) => ({ ...r, bbox: bboxOf(r.polygons), events: [], sites: 0 }));
  const byCountry = { DE: [], AT: [], CH: [] };
  for (const r of regions) byCountry[r.country].push(r);
  const unassigned = { DE: 0, AT: 0, CH: 0 };
  const countryEvents = { DE: [], AT: [], CH: [] };
  const countrySites = { DE: 0, AT: 0, CH: 0 };

  for (const row of idx.events) {
    const country = row[at.country];
    if (!byCountry[country]) continue;
    const lon = row[at.lon], lat = row[at.lat];
    const site = row[at.anomalyKind] === 'site';
    let hit = byCountry[country].find((r) => lon >= r.bbox[0] && lon <= r.bbox[2] && lat >= r.bbox[1] && lat <= r.bbox[3] && polygonsContain(lon, lat, r.polygons));
    if (!hit) {
      let best = null, bestKm = Infinity;
      for (const r of byCountry[country]) { const d = distanceKm(lon, lat, r.polygons); if (d < bestKm) { bestKm = d; best = r; } }
      if (best && bestKm <= SNAP_KM) hit = best;
    }
    if (site) { countrySites[country]++; if (hit) hit.sites++; continue; }
    const ev = {
      id: row[at.id], lat, lon, firstMs: row[at.firstMs], lastMs: row[at.lastMs], hotspots: row[at.hotspots],
      days: row[at.distinctDays], frpMax: row[at.frpMaxMw], areaHa: row[at.areaHa], areaKind: row[at.areaKind],
      effisId: row[at.effisId], place: row[at.placeName], district: districtLabel(country, row[at.placeDistrict]), nrt: row[at.nrt],
      deviating: row[at.anomalyKind] === 'site-deviating',
    };
    countryEvents[country].push(ev);
    if (hit) hit.events.push(ev); else unassigned[country]++;
  }

  const w = idx.window;
  const evaluated = isoDay(idx.evaluatedAt);
  const year = Number(isoDay(w.fromMs).slice(0, 4));
  const season = {
    label: w.label, year, fromDay: isoDay(w.fromMs), toDay: isoDay(w.toMs - 1), evaluated,
    generatedAt: String(idx.generatedAt).slice(0, 10),
    /** Abgeschlossen, sobald der Auswertetag das Saisonende erreicht hat (31.10. ⇒ Index vom 31.10. deckt die ganze Saison). */
    closed: !w.current || evaluated >= isoDay(w.toMs - 1),
    limits: idx.limits || [],
  };

  for (const r of regions) {
    r.stats = statsOf(r.events, r.country, r.sites);
    r.hasPage = r.stats.events >= MIN_REGION_EVENTS || r.stats.effis.n > 0;
    r.path = `${fireCountryPath(r.country)}${r.slug}/`;
    r.official = FIRE_OFFICIAL_REGION[r.iso] ?? null;
    r.inName = IN_NAME[r.iso] ?? `in ${r.name}`;
  }
  const countries = {};
  for (const code of Object.keys(FIRE_COUNTRIES)) {
    const c = FIRE_COUNTRIES[code];
    const regs = byCountry[code].slice().sort((a, b) => b.stats.events - a.stats.events || a.name.localeCompare(b.name, 'de'));
    countries[code] = {
      ...c, path: fireCountryPath(code), regions: regs, inName: code === 'CH' ? 'in der Schweiz' : `in ${c.name}`,
      stats: statsOf(countryEvents[code], code, countrySites[code]),
      unassigned: unassigned[code],
      series: seriesOf(series, code),
      polygons: regs.flatMap((r) => r.polygons),
      bbox: bboxOf(regs.flatMap((r) => r.polygons)),
    };
  }
  return { season, regions, countries, dachSeries: seriesOf(series, 'DACH') };
}

/** Kennzahlen einer Ereignisliste (Region oder Land). */
function statsOf(events, country, sites) {
  const months = new Array(8).fill(0);
  for (const e of events) {
    const m = new Date(e.firstMs).getUTCMonth() - 2; // März = 0
    if (m >= 0 && m < 8) months[m]++;
  }
  const effisById = new Map();
  for (const e of events) {
    if (!e.effisId || !(e.areaHa > 0)) continue;
    const prev = effisById.get(e.effisId);
    if (!prev) effisById.set(e.effisId, { id: e.effisId, ha: e.areaHa, firstMs: e.firstMs, place: e.place, district: e.district, hotspots: e.hotspots });
    else {
      prev.ha = Math.max(prev.ha, e.areaHa);
      prev.firstMs = Math.min(prev.firstMs, e.firstMs);
      if (e.hotspots > prev.hotspots) { prev.place = e.place; prev.district = e.district; prev.hotspots = e.hotspots; }
    }
  }
  const effis = [...effisById.values()].sort((a, b) => b.ha - a.ha);
  const dist = new Map();
  if (country !== 'CH') for (const e of events) if (e.district) dist.set(e.district, (dist.get(e.district) || 0) + 1);
  const districts = [...dist.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).slice(0, 5);
  // Abweichende Anlagenstandorte zählen wie in der App als Brand, stehen aber nicht in der Liste der größten Ereignisse:
  // ein Werk mit wachsender Signatur ist kein Beispiel für einen Vegetationsbrand.
  const longest = events.filter((e) => e.place && e.hotspots >= 3 && !e.deviating)
    .sort((a, b) => b.hotspots - a.hotspots || b.days - a.days).slice(0, 5);
  const peak = months.reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0);
  return {
    events: events.length, sites, deviating: events.filter((e) => e.deviating).length, singles: events.filter((e) => e.hotspots <= 1).length,
    nrt: events.filter((e) => e.nrt > 0).length,
    months, peakMonth: events.length ? MONTHS[peak] : null,
    effis: { n: effis.length, ha: Math.round(effis.reduce((s, x) => s + x.ha, 0)), top: effis.slice(0, 5).map((x) => ({ ...x, day: isoDay(x.firstMs) })) },
    districts, districtWord: country === 'AT' ? 'Bezirk' : 'Kreis',
    largest: longest.map((e) => ({ place: e.place, district: e.district, day: isoDay(e.firstMs), lastDay: isoDay(e.lastMs), hotspots: e.hotspots, days: e.days, effis: !!e.effisId })),
  };
}

/** Saisonsummen am Saisonende je Jahr (vollständige Saisons) plus die laufende/letzte Saison. */
function seriesOf(series, key) {
  if (!series?.seasons) return [];
  return series.seasons.map((s) => {
    const arr = s.cumulative?.[key];
    if (!arr?.length) return null;
    const i = Math.min(s.lastDay ?? arr.length - 1, arr.length - 1);
    return { year: s.year, complete: !!s.complete, total: arr[i] };
  }).filter(Boolean);
}

/**
 * Daten erst beim ersten Zugriff laden: `content.mjs` importiert dieses Modul für die Ortsseiten-Links, und `content.mjs`
 * laden auch Prüfer, die keine Ortsseite rendern (`verify-routing`, `verify-share`) — die sollen den 16-MB-Index nicht lesen.
 * `null`, wenn Index oder Grenzen fehlen; dann fallen nur die Waldbrand-Regionsseiten und ihre Links weg.
 */
let DATA;
export function fireData() {
  if (DATA === undefined) DATA = load();
  return DATA;
}

/** Link auf die Regionsseite nach Land + Regionsname (Ortsseiten, Wetter-Regionsseiten): `{ path, label }`, `null` ohne eigene Seite. */
export function fireRegionLinkFor(country, regionName) {
  const d = fireData();
  const r = d?.regions.find((x) => x.country === country && x.name === regionName);
  return r?.hasPage ? { path: r.path, label: `Waldbrandgefahr ${r.inName}` } : null;
}
/** Regionsseite des Bundeslands/Kantons eines Ortes (`/wetter/<ort>/`). */
export const fireRegionLinkForPlace = (place) => fireRegionLinkFor(place.country, place.region);
/** Link auf die Länderseite, sofern die Daten da sind (sonst `null`). */
export function fireCountryLink(code) {
  const d = fireData();
  return d ? { path: fireCountryPath(code), label: `Waldbrandgefahr ${d.countries[code].inName}` } : null;
}
