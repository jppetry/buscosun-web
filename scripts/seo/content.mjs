/**
 * Pure Content-/Meta-/JSON-LD-Builder für die Geo-Seiten + Home (build-only).
 *
 * Erzeugt deterministisch semantisches HTML aus dem Ortsmodell. Keine
 * Live-Wetterzahlen (wären sofort veraltet) — stabile, aus echten Attributen
 * abgeleitete Faktentexte + Verweis auf die Live-App. Ehrlich, GEO-zitierbar.
 */

import { nearestPlaces } from './places.mjs';

export const SITE = {
  name: 'buscosun',
  url: 'https://buscosun.app', // kanonische Origin (anpassen bei abweichender Domain)
  tagline: 'Wetter für Deutschland, Österreich & die Schweiz',
  description: 'DACH-Wetter aus amtlichen Quellen (DWD · GeoSphere · MeteoSwiss), höhenkorrigiert und ohne Tracker: interaktive Karte, Tourenplanung, bester Event-Tag, 6-Stunden-Nowcast, Modellvergleich, Lawinen-Deeplinks und mehr.',
};

const FLAG = { DE: '🇩🇪', AT: '🇦🇹', CH: '🇨🇭' };
const COUNTRY_NAME = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz' };
const LOCALE = { DE: 'de-DE', AT: 'de-AT', CH: 'de-CH' };

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const r5 = (n) => Math.round(n * 1e5) / 1e5;

/** Repliziert encodeMapState (#m=) aus src/mapState.ts → CTA öffnet die App am Ort.
 *  Layer-Bitmaske: ['wind','nowcast','temp','clouds','sat','lightning','stations'];
 *  Default 'temp' = Bit 4. */
export function mapPermalink(place) {
  const payload = { l: [r5(place.lat), r5(place.lon), place.name, place.country], b: 4, h: 0 };
  return '/#m=' + encodeURIComponent(JSON.stringify(payload));
}

/** Höhenband (Richtwert) aus der Höhe. */
function elevationBand(ele) {
  if (ele >= 1500) return 'Hochgebirgslage';
  if (ele >= 800) return 'Berglage';
  if (ele >= 400) return 'Hügel-/Mittelgebirgslage';
  return 'Tieflage';
}

const COASTAL_REGIONS = new Set(['Schleswig-Holstein', 'Mecklenburg-Vorpommern', 'Bremen', 'Hamburg']);
function isAlpine(place) {
  return place.ele >= 800 && (place.country !== 'DE' || place.region === 'Bayern');
}

/** Datenquellen je Land (ehrlich, deckungsgleich mit der App). */
function sourcesFor(country) {
  if (country === 'DE') return 'DWD (ICON-D2/MOSMIX, RADOLAN-RV, Sferics, UV, Pollen, amtliche Warnungen)';
  if (country === 'AT') return 'GeoSphere Austria (AROME, INCA, TAWES) + ICON-D2 im Grenzbereich';
  return 'MeteoSwiss (AROME, SMN, rzc-Radar) + ICON-D2 im Grenzbereich';
}

/** Aus echten Attributen abgeleitete Faktensätze (kein Live-Wert). */
export function placeFacts(place) {
  const facts = [];
  facts.push(`${place.name} liegt in ${place.region} (${COUNTRY_NAME[place.country]}) auf rund ${place.ele} m Höhe — eine ${elevationBand(place.ele)}.`);
  facts.push(`Die Wettervorhersage für ${place.name} stützt sich auf ${sourcesFor(place.country)} und wird mit einem digitalen Geländemodell höhenkorrigiert.`);
  if (isAlpine(place)) {
    facts.push(`Aufgrund der Höhenlage sind Schneefallgrenze, Höhenwind und – im Alpenraum – Föhn für ${place.name} relevant; buscosun erkennt Föhnlagen heuristisch.`);
  }
  if (COASTAL_REGIONS.has(place.region)) {
    facts.push(`In der küstennahen Lage von ${place.name} bestimmen Wind, Böen und Seewettereinfluss das Tagesgeschehen.`);
  }
  if (place.country === 'DE') {
    facts.push(`Für ${place.name} stehen UV-Index, Pollenflug und amtliche DWD-Unwetterwarnungen zur Verfügung.`);
  } else {
    facts.push(`UV wird für ${place.name} per Klarhimmel-Modell geschätzt; Pollen sind optional über Open-Meteo/CAMS zuschaltbar (kein amtlicher AT/CH-Feed).`);
  }
  facts.push(`Der Modellvergleich zeigt für ${place.name} den Unsicherheits-Spread mehrerer Wettermodelle (ICON-D2, MOSMIX, ICON-EU) ehrlich an, statt eine Scheingenauigkeit vorzutäuschen.`);
  facts.push(`Für Vorhaben im Freien ermittelt die Event-Planung den besten der nächsten sieben Tage in ${place.name} — inklusive Plan-B-Tag, Foto-Licht und Astro-Nacht.`);
  return facts;
}

/** Kurzes Quellen-Label je Land (für den Lead). */
function shortSource(country) {
  if (country === 'DE') return 'DWD (ICON-D2, MOSMIX, RADOLAN)';
  if (country === 'AT') return 'GeoSphere Austria (AROME, INCA) + ICON-D2';
  return 'MeteoSwiss (AROME, Radar) + ICON-D2';
}

/** Extrahierbarer 40–60-Wort-Direktantwort-Lead (GEO). Nur stabile Fakten. */
export function placeLead(place) {
  const base =
    `Das Wetter für ${place.name} (${place.region}, ${COUNTRY_NAME[place.country]}, rund ${place.ele} m — ${elevationBand(place.ele)}) ` +
    `zeigt buscosun höhenkorrigiert aus amtlichen Quellen: ${shortSource(place.country)}. ` +
    `Temperaturen werden über ein digitales Geländemodell auf die tatsächliche Höhe umgerechnet; Karte, Stundenverlauf, 6-Stunden-Nowcast und Modellvergleich sind kostenlos und ohne Tracker abrufbar.`;
  const alpine = isAlpine(place)
    ? ` Für die Höhenlage von ${place.name} sind zudem Schneefallgrenze, Höhenwind und – im Alpenraum – Föhn relevant.`
    : '';
  return base + alpine;
}

/** Zitierbare FAQ (GEO) — klar beantwortbare Fragen. */
export function placeFaqs(place) {
  const faqs = [];
  faqs.push({
    q: `Woher kommen die Wetterdaten für ${place.name}?`,
    a: `Aus amtlichen Quellen: ${sourcesFor(place.country)}. Die Werte werden für die Höhe von ${place.name} (rund ${place.ele} m) korrigiert.`,
  });
  faqs.push({
    q: `Ist die Vorhersage für ${place.name} höhenkorrigiert?`,
    a: `Ja. buscosun rechnet die Temperatur über ein digitales Geländemodell und eine ortsabhängige Lapse-Rate auf die tatsächliche Höhe von ${place.name} um.`,
  });
  faqs.push({
    q: `Gibt es eine Pollenvorhersage für ${place.name}?`,
    a: place.country === 'DE'
      ? `Ja, für ${place.name} liefert der DWD-Pollenflug-Gefahrenindex Werte für die wichtigsten Arten.`
      : `Für ${place.name} gibt es keinen amtlichen Pollen-Feed; optional lässt sich eine CAMS-Pollenvorhersage (Open-Meteo) zuschalten.`,
  });
  if (isAlpine(place)) {
    faqs.push({
      q: `Zeigt buscosun den Lawinenlagebericht für ${place.name}?`,
      a: `buscosun modelliert keine Lawinengefahr, verlinkt aber für ${place.name} direkt den amtlichen Lawinenlagebericht (${place.country === 'CH' ? 'SLF' : place.country === 'AT' ? 'lawinen.report' : 'Lawinenwarndienst Bayern'}) sowie den europäischen EAWS-Dienst.`,
    });
  }
  faqs.push({
    q: `Kostet buscosun etwas?`,
    a: `Nein. buscosun ist kostenlos nutzbar, setzt keine Tracker ein und funktioniert direkt im Browser.`,
  });
  return faqs;
}

export function metaFor(place) {
  const title = `Wetter ${place.name} — ${place.region} | ${SITE.name}`;
  const description = `Wetter für ${place.name} (${place.region}, ${COUNTRY_NAME[place.country]}): höhenkorrigierte Vorhersage aus amtlichen Quellen, interaktive Karte, Nowcast und Modellvergleich — ohne Tracker.`;
  return { title, description, locale: LOCALE[place.country] };
}

// --- JSON-LD ----------------------------------------------------------------

export function webAppJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE.name,
    url: SITE.url + '/',
    applicationCategory: 'Weather',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    description: SITE.description,
    inLanguage: ['de-DE', 'de-AT', 'de-CH'],
    featureList: ['2D-Wetterkarte', 'Tourenplanung', 'Event-Tag-Vergleich', '6-Stunden-Nowcast', 'Modellvergleich', '3D-Wetter', 'Arbeitsfenster (Go/No-Go)', 'Wetterhistorie'],
  };
}

export function organizationJsonLd() {
  return { '@context': 'https://schema.org', '@type': 'Organization', name: SITE.name, url: SITE.url + '/', logo: SITE.url + '/icon.svg' };
}

export function placeJsonLd(place) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: place.name,
    address: { '@type': 'PostalAddress', addressRegion: place.region, addressCountry: place.country },
    geo: { '@type': 'GeoCoordinates', latitude: place.lat, longitude: place.lon, elevation: place.ele },
  };
}

/** Dataset-JSON-LD: höhenkorrigierte Vorhersage je Ort, ehrliche Quellen-/
 *  Lizenzangabe (DWD CC BY 4.0). Macht die Datenbasis GEO-/Rich-Result-lesbar. */
export function datasetJsonLd(place) {
  const license = place.country === 'DE'
    ? 'https://www.dwd.de/DE/service/copyright/copyright_node.html'
    : 'https://creativecommons.org/licenses/by/4.0/';
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `Höhenkorrigierte Wettervorhersage ${place.name}`,
    description: `Vorhersage- und Standortdaten für ${place.name} (${place.region}, ${COUNTRY_NAME[place.country]}, rund ${place.ele} m), höhenkorrigiert über ein digitales Geländemodell. Quellen: ${sourcesFor(place.country)}.`,
    url: `${SITE.url}/wetter/${place.slug}/`,
    license,
    isAccessibleForFree: true,
    creator: { '@type': 'Organization', name: SITE.name, url: SITE.url + '/' },
    spatialCoverage: {
      '@type': 'Place',
      name: place.name,
      geo: { '@type': 'GeoCoordinates', latitude: place.lat, longitude: place.lon, elevation: place.ele },
    },
    inLanguage: LOCALE[place.country],
  };
}

export function breadcrumbJsonLd(place) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Start', item: SITE.url + '/' },
      { '@type': 'ListItem', position: 2, name: 'Wetter', item: SITE.url + '/wetter/' },
      { '@type': 'ListItem', position: 3, name: place.name, item: `${SITE.url}/wetter/${place.slug}/` },
    ],
  };
}

export function faqJsonLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

function jsonLdScript(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

// --- HTML-Rendering ---------------------------------------------------------

/** hreflang-Alternates: Selbstreferenz + Sprachvarianten + x-default. */
function hreflangLinks(canonicalPath) {
  const url = SITE.url + canonicalPath;
  return ['de-DE', 'de-AT', 'de-CH'].map((l) => `<link rel="alternate" hreflang="${l}" href="${url}" />`).join('\n    ')
    + `\n    <link rel="alternate" hreflang="x-default" href="${url}" />`;
}

function headBlock({ title, description, canonicalPath, locale, ogImage, jsonLd }) {
  const url = SITE.url + canonicalPath;
  return `    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${url}" />
    ${hreflangLinks(canonicalPath)}
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <meta name="theme-color" content="#2C2A26" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE.name}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:locale" content="${(locale || 'de-DE').replace('-', '_')}" />
    <meta property="og:image" content="${SITE.url}${ogImage || '/og.svg'}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${SITE.url}${ogImage || '/og.svg'}" />
    ${jsonLd.map(jsonLdScript).join('\n    ')}`;
}

const PAGE_CSS = `:root{--sand:#FAF6EA;--ink:#2C2A26;--stone:#5C5447;--terra:#C97B47;--border:#E0D6BE}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--sand);color:var(--ink);line-height:1.6}
.wrap{max-width:760px;margin:0 auto;padding:2rem 1.25rem 4rem}
a{color:var(--terra)}nav.bc{font-size:.85rem;color:var(--stone);margin-bottom:1.5rem}nav.bc a{color:var(--stone)}
h1{font-size:2rem;margin:.2rem 0 .3rem}.sub{color:var(--stone);margin:0 0 .6rem}
p.lead{font-size:1.05rem;margin:0 0 1.2rem}
.cta{display:inline-block;background:var(--ink);color:#fff;text-decoration:none;font-weight:600;padding:.7rem 1.2rem;border-radius:999px;margin:.5rem 0 1.5rem}
.cta:hover{background:var(--terra)}
section{margin:1.8rem 0}h2{font-size:1.2rem;border-bottom:1px solid var(--border);padding-bottom:.3rem}
ul.facts{padding-left:1.1rem}details{border:1px solid var(--border);border-radius:10px;padding:.6rem .9rem;margin:.5rem 0;background:#fff}
summary{font-weight:600;cursor:pointer}.links{display:flex;flex-wrap:wrap;gap:.5rem}
.links a{display:inline-block;background:#fff;border:1px solid var(--border);border-radius:999px;padding:.35rem .8rem;text-decoration:none;color:var(--ink);font-size:.9rem}
footer{margin-top:3rem;font-size:.8rem;color:var(--stone);border-top:1px solid var(--border);padding-top:1rem}`;

/** Vollständige statische Geo-Seite (semantisch, crawlbar, GEO-zitierbar). */
export function renderPlacePage(place) {
  const meta = metaFor(place);
  const canonicalPath = `/wetter/${place.slug}/`;
  const facts = placeFacts(place);
  const faqs = placeFaqs(place);
  const neighbors = nearestPlaces(place, 6);
  const head = headBlock({
    title: meta.title, description: meta.description, canonicalPath, locale: meta.locale,
    jsonLd: [placeJsonLd(place), datasetJsonLd(place), breadcrumbJsonLd(place), faqJsonLd(faqs), webAppJsonLd()],
  });

  const factItems = facts.map((f) => `<li>${escapeHtml(f)}</li>`).join('\n        ');
  const faqItems = faqs.map((f) => `<details><summary>${escapeHtml(f.q)}</summary><p>${escapeHtml(f.a)}</p></details>`).join('\n      ');
  const neighborLinks = neighbors.map((n) => `<a href="/wetter/${n.slug}/">${escapeHtml(n.name)} <span>(${n.distKm} km)</span></a>`).join('\n        ');
  const featureLinks = ['Karte', 'Tourenplanung', 'Event-Tag', 'Nowcast', 'Vorhersage', 'Arbeitsfenster']
    .map((f) => `<a href="/">${f}</a>`).join('\n        ');

  return `<!doctype html>
<html lang="de">
  <head>
${head}
    <style>${PAGE_CSS}</style>
  </head>
  <body>
    <div class="wrap">
      <nav class="bc" aria-label="Brotkrumen"><a href="/">Start</a> › <a href="/wetter/">Wetter</a> › ${escapeHtml(place.name)}</nav>
      <h1>Wetter ${escapeHtml(place.name)}</h1>
      <p class="sub">${FLAG[place.country]} ${escapeHtml(place.region)} · ${COUNTRY_NAME[place.country]} · rund ${place.ele} m</p>
      <p class="lead">${escapeHtml(placeLead(place))}</p>
      <a class="cta" href="${mapPermalink(place)}">Wetter für ${escapeHtml(place.name)} auf der interaktiven Karte öffnen →</a>

      <section>
        <h2>Wetter in ${escapeHtml(place.name)} — die Fakten</h2>
        <ul class="facts">
        ${factItems}
        </ul>
        <p>Live-Werte und Stundenverlauf zeigt die <a href="${mapPermalink(place)}">interaktive Karte für ${escapeHtml(place.name)}</a>. buscosun nutzt ausschließlich amtliche Quellen und arbeitet ohne Tracker.</p>
      </section>

      <section>
        <h2>Häufige Fragen zum Wetter in ${escapeHtml(place.name)}</h2>
        ${faqItems}
      </section>

      <section>
        <h2>Wetter in der Umgebung</h2>
        <div class="links">
        ${neighborLinks}
        </div>
      </section>

      <section>
        <h2>buscosun-Funktionen</h2>
        <div class="links">
        ${featureLinks}
        </div>
      </section>

      <footer>
        ${escapeHtml(SITE.name)} — ${escapeHtml(SITE.tagline)}. Datenbasis: Deutscher Wetterdienst (DWD, CC BY 4.0) · GeoSphere Austria · MeteoSwiss. Keine Tracker, keine Werbung.
        Hinweis: Diese Seite nennt stabile Standort-Fakten; aktuelle Messwerte und Vorhersagen liefert die interaktive App. buscosun gibt keine amtlichen Warnungen heraus.
      </footer>
    </div>
  </body>
</html>
`;
}

/** Crawlbarer Inhalts-Block, der in #root der Home-index.html injiziert wird
 *  (React ersetzt ihn beim Mount — inhaltsgleich, kein Cloaking). */
export function renderHomeRootContent(places) {
  const topByCountry = (c) => places.filter((p) => p.country === c).slice(0, 8)
    .map((p) => `<a href="/wetter/${p.slug}/">${escapeHtml(p.name)}</a>`).join(' · ');
  const lead =
    'buscosun ist eine kostenlose, tracker-freie Wetter-Web-App für Deutschland, Österreich und die Schweiz. ' +
    'Alle Vorhersagen stammen aus amtlichen Quellen (DWD, GeoSphere Austria, MeteoSwiss) und werden über ein ' +
    'digitales Geländemodell höhenkorrigiert. Karte, Tourenplanung, bester Event-Tag, 6-Stunden-Nowcast, ' +
    'Modellvergleich und 3D-Atmosphäre laufen direkt im Browser, ohne Konto und ohne Werbung.';
  return `<div id="seo-fallback">
      <h1>buscosun — ${escapeHtml(SITE.tagline)}</h1>
      <p>${escapeHtml(lead)}</p>
      <h2>Funktionen</h2>
      <ul>
        <li>Interaktive 2D-Wetterkarte (Wind, Niederschlag, Temperatur, Wolken, Satellit, Blitze)</li>
        <li>Tourenplanung mit Wetter entlang der Route</li>
        <li>Event-Planung: bester Tag im 7-Tage-Vergleich</li>
        <li>6-Stunden-Nowcast aus Radar &amp; ICON-D2</li>
        <li>Modellvergleich mit ehrlichem Spread</li>
        <li>Arbeitsfenster (Go/No-Go) für Drohne, Kran, Höhenarbeit</li>
      </ul>
      <h2>Wetter in DACH-Orten</h2>
      <p>${topByCountry('DE')}</p>
      <p>${topByCountry('AT')}</p>
      <p>${topByCountry('CH')}</p>
      <p>Datenquellen: DWD · GeoSphere · MeteoSwiss — höhenkorrigiert, ohne Tracker.</p>
    </div>`;
}

/** Head-Ergänzungen für die Home (OG/Twitter/canonical/hreflang/JSON-LD). */
export function homeHeadExtras() {
  const canonicalPath = '/';
  const url = SITE.url + '/';
  return `<link rel="canonical" href="${url}" />
    ${hreflangLinks(canonicalPath)}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE.name}" />
    <meta property="og:title" content="buscosun — ${escapeHtml(SITE.tagline)}" />
    <meta property="og:description" content="${escapeHtml(SITE.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:locale" content="de_DE" />
    <meta property="og:image" content="${SITE.url}/og.svg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="buscosun — ${escapeHtml(SITE.tagline)}" />
    <meta name="twitter:description" content="${escapeHtml(SITE.description)}" />
    <meta name="twitter:image" content="${SITE.url}/og.svg" />
    ${jsonLdScript(webAppJsonLd())}
    ${jsonLdScript(organizationJsonLd())}`;
}
