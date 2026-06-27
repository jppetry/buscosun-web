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

// Default OG/Twitter image when a page type forgets to pass one. MUST be a
// raster (PNG/JPG/WebP) — social + Discover never render SVG, so we fall back to
// the branded home hero, NOT the og.svg placeholder. verify-seo.mjs additionally
// hard-fails on any SVG og:image, so this can never regress silently.
const DEFAULT_OG_IMAGE = '/og/home.png';

function headBlock({ title, description, canonicalPath, locale, ogImage, jsonLd, noindex, ogTitle }) {
  const url = SITE.url + canonicalPath;
  const ogt = ogTitle || title;
  return `    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />${noindex ? '\n    <meta name="robots" content="noindex, follow" />' : ''}
    <link rel="canonical" href="${url}" />
    ${hreflangLinks(canonicalPath)}
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <meta name="theme-color" content="#2C2A26" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE.name}" />
    <meta property="og:title" content="${escapeHtml(ogt)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:locale" content="${(locale || 'de-DE').replace('-', '_')}" />
    <meta property="og:image" content="${SITE.url}${ogImage || DEFAULT_OG_IMAGE}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(ogt)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${SITE.url}${ogImage || DEFAULT_OG_IMAGE}" />
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
    ogImage: '/og/wetter-default.png',
    jsonLd: [placeJsonLd(place), datasetJsonLd(place), breadcrumbJsonLd(place), faqJsonLd(faqs), webAppJsonLd()],
  });

  const factItems = facts.map((f) => `<li>${escapeHtml(f)}</li>`).join('\n        ');
  const faqItems = faqs.map((f) => `<details><summary>${escapeHtml(f.q)}</summary><p>${escapeHtml(f.a)}</p></details>`).join('\n      ');
  const neighborLinks = neighbors.map((n) => `<a href="/wetter/${n.slug}/">${escapeHtml(n.name)} <span>(${n.distKm} km)</span></a>`).join('\n        ');
  const featureLinks = ['Karte', 'Tourenplanung', 'Event-Tag', 'Nowcast', 'Vorhersage', 'Arbeitsfenster']
    .map((f) => `<a href="/">${f}</a>`).join('\n        ');
  const knowledgeLinks = relevantExplainersFor(place, EXPLAINERS, 3)
    .map((e) => `<a href="/wissen/${e.slug}/">${escapeHtml(e.title)}</a>`).join('\n        ');

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
        <h2>Wetterwissen für ${escapeHtml(place.name)}</h2>
        <div class="links">
        ${knowledgeLinks}
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

// --- Explainer (/wissen/) ---------------------------------------------------

import { PLACES } from './places.mjs';
import { EXPLAINERS } from './explainers.mjs';

const PLACE_BY_SLUG = Object.fromEntries(PLACES.map((p) => [p.slug, p]));

/** Article-JSON-LD für einen Explainer (mit author, datePublished, dateModified). */
/** OG/Hero-Bild je Explainer (volle = eigenes PNG, Scaffold = Kategorie-Default). */
export function explainerOgImage(ex) {
  return ex.status === 'full' ? `/og/${ex.slug}.png` : '/og/wissen-default.png';
}

export function articleJsonLd(ex) {
  const url = `${SITE.url}/wissen/${ex.slug}/`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: ex.h1,
    image: [SITE.url + explainerOgImage(ex)],
    description: ex.answer,
    inLanguage: 'de-DE',
    mainEntityOfPage: url,
    url,
    datePublished: ex.datePublished,
    dateModified: ex.dateModified,
    author: { '@type': 'Organization', name: SITE.name, url: SITE.url + '/' },
    publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url + '/', logo: { '@type': 'ImageObject', url: SITE.url + '/icon.svg' } },
    isAccessibleForFree: true,
  };
}

function explainerBreadcrumbJsonLd(ex) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Start', item: SITE.url + '/' },
      { '@type': 'ListItem', position: 2, name: 'Wetterwissen', item: SITE.url + '/wissen/' },
      { '@type': 'ListItem', position: 3, name: ex.title, item: `${SITE.url}/wissen/${ex.slug}/` },
    ],
  };
}

function metaForExplainer(ex) {
  const title = `${ex.title} — einfach erklärt | ${SITE.name}`;
  // Description aus der Direktantwort (auf ~155 Zeichen gekürzt).
  let d = ex.answer.replace(/\s+/g, ' ').trim();
  if (d.length > 155) d = d.slice(0, 152).replace(/\s+\S*$/, '') + '…';
  return { title, description: d };
}

/** Vollständige/Scaffold-Explainer-Seite (semantisch, crawlbar, GEO-zitierbar). */
export function renderExplainerPage(ex, allBySlug) {
  const meta = metaForExplainer(ex);
  const canonicalPath = `/wissen/${ex.slug}/`;
  const noindex = ex.status !== 'full';
  const head = headBlock({
    title: meta.title, description: meta.description, canonicalPath, locale: 'de-DE', noindex,
    ogImage: explainerOgImage(ex),
    jsonLd: [articleJsonLd(ex), faqJsonLd(ex.faqs || []), explainerBreadcrumbJsonLd(ex)],
  });

  const sections = (ex.sections || [])
    .map((s) => `      <section id="${s.id}">\n        <h2>${escapeHtml(s.h2)}</h2>\n        ${s.html}\n      </section>`)
    .join('\n');
  const faqItems = (ex.faqs || [])
    .map((f) => `<details><summary>${escapeHtml(f.q)}</summary><p>${escapeHtml(f.a)}</p></details>`).join('\n      ');
  const relExplainers = (ex.relatedExplainers || [])
    .map((slug) => allBySlug[slug]).filter(Boolean)
    .map((r) => `<a href="/wissen/${r.slug}/">${escapeHtml(r.title)}</a>`).join('\n        ');
  const relPlaces = (ex.relatedPlaces || [])
    .map((slug) => PLACE_BY_SLUG[slug]).filter(Boolean)
    .map((p) => `<a href="/wetter/${p.slug}/">Wetter ${escapeHtml(p.name)}</a>`).join('\n        ');
  const sources = (ex.sources || [])
    .map((s) => `<li><a href="${s.url}" rel="nofollow noopener" target="_blank">${escapeHtml(s.name)}</a></li>`).join('\n        ');
  const stubNote = noindex
    ? '<p class="sub">Dieser Beitrag wird laufend ausgebaut. Die Kurzantwort oben fasst das Wichtigste bereits zusammen.</p>'
    : '';

  return `<!doctype html>
<html lang="de">
  <head>
${head}
    <style>${PAGE_CSS}
.answer{font-size:1.1rem;background:#fff;border:1px solid var(--border);border-left:4px solid var(--terra);border-radius:10px;padding:1rem 1.1rem;margin:0 0 1.5rem}</style>
  </head>
  <body>
    <div class="wrap">
      <nav class="bc" aria-label="Brotkrumen"><a href="/">Start</a> › <a href="/wissen/">Wetterwissen</a> › ${escapeHtml(ex.title)}</nav>
      <h1>${escapeHtml(ex.h1)}</h1>
      <p class="answer">${escapeHtml(ex.answer)}</p>
      ${stubNote}
${sections}
      <section>
        <h2>Häufige Fragen</h2>
        ${faqItems}
      </section>
${relExplainers ? `      <section>\n        <h2>Verwandte Themen</h2>\n        <div class="links">\n        ${relExplainers}\n        </div>\n      </section>` : ''}
${relPlaces ? `      <section>\n        <h2>Passende Orte</h2>\n        <div class="links">\n        ${relPlaces}\n        </div>\n      </section>` : ''}
${sources ? `      <section>\n        <h2>Quellen</h2>\n        <ul>\n        ${sources}\n        </ul>\n      </section>` : ''}
      <footer>
        ${escapeHtml(SITE.name)} — ${escapeHtml(SITE.tagline)}. Datenbasis: Deutscher Wetterdienst (DWD, CC BY 4.0) · GeoSphere Austria · MeteoSwiss.
        buscosun erklärt Wetterphänomene und gibt keine amtlichen Warnungen heraus.
      </footer>
    </div>
  </body>
</html>
`;
}

/** /wissen/-Hub: Index aller Explainer (volle zuerst, Scaffolds dezent). */
export function renderWissenHub(explainers) {
  const card = (e) => `<a href="/wissen/${e.slug}/" class="card${e.status === 'full' ? '' : ' stub'}">
        <strong>${escapeHtml(e.title)}</strong>
        <span>${escapeHtml(metaForExplainer(e).description)}</span>
      </a>`;
  const full = explainers.filter((e) => e.status === 'full').map(card).join('\n      ');
  const stubs = explainers.filter((e) => e.status !== 'full').map(card).join('\n      ');
  const head = headBlock({
    title: `Wetterwissen — Phänomene einfach erklärt | ${SITE.name}`,
    description: 'Föhn, Temperaturinversion, Nebelobergrenze, Thermik, Schneefallgrenze und mehr — meteorologische Phänomene der DACH-Region verständlich und faktenbasiert erklärt.',
    canonicalPath: '/wissen/', locale: 'de-DE', ogImage: '/og/wissen.png',
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: 'Wetterwissen', url: SITE.url + '/wissen/',
      description: 'Meteorologie-Explainer der DACH-Region.',
    }],
  });
  return `<!doctype html>
<html lang="de">
  <head>
${head}
    <style>${PAGE_CSS}
.cards{display:grid;gap:.8rem}@media(min-width:560px){.cards{grid-template-columns:1fr 1fr}}
.card{display:flex;flex-direction:column;gap:.3rem;background:#fff;border:1px solid var(--border);border-radius:10px;padding:.9rem 1rem;text-decoration:none;color:var(--ink)}
.card strong{color:var(--terra)}.card span{font-size:.85rem;color:var(--stone)}.card.stub{opacity:.7}</style>
  </head>
  <body>
    <div class="wrap">
      <nav class="bc" aria-label="Brotkrumen"><a href="/">Start</a> › Wetterwissen</nav>
      <h1>Wetterwissen</h1>
      <p class="lead">Meteorologische Phänomene der DACH-Region — Föhn, Inversion, Nebelobergrenze, Thermik, Schneefallgrenze und mehr — verständlich, faktenbasiert und mit Quellen erklärt. buscosun erklärt nur und gibt keine amtlichen Warnungen heraus.</p>
      <h2>Ausführliche Beiträge</h2>
      <div class="cards">
      ${full}
      </div>
      <h2>Weitere Themen (im Aufbau)</h2>
      <div class="cards">
      ${stubs}
      </div>
    </div>
  </body>
</html>
`;
}

/** Für Ortsseiten: bis zu n Explainer, die zum Ort passen (alpin → Föhn etc.). */
export function relevantExplainersFor(place, explainers, n = 3) {
  const alpine = place.ele >= 800 && (place.country !== 'DE' || place.region === 'Bayern');
  const order = alpine
    ? ['foehn', 'schneefallgrenze', 'temperaturinversion', 'nebel-hochnebel-nebelobergrenze']
    : ['temperaturinversion', 'nebel-hochnebel-nebelobergrenze', 'modellvergleich-unsicherheit', 'gewitter-unwetter'];
  const bySlug = Object.fromEntries(explainers.map((e) => [e.slug, e]));
  return order.map((s) => bySlug[s]).filter(Boolean).slice(0, n);
}

// --- Tool-Landingpages (/funktionen/) ---------------------------------------

import { EXPLAINERS_BY_SLUG } from './explainers.mjs';

/** OG/Hero-Bild je Tool (volle = eigenes PNG, Scaffold = Kategorie-Default). */
export function toolOgImage(tool) {
  return tool.status === 'full' ? `/og/${tool.slug}.png` : '/og/funktionen-default.png';
}

export function softwareApplicationJsonLd(tool) {
  const url = `${SITE.url}/funktionen/${tool.slug}/`;
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `${SITE.name} — ${tool.title}`,
    url,
    image: SITE.url + toolOgImage(tool),
    applicationCategory: 'Weather',
    operatingSystem: 'Web',
    inLanguage: ['de-DE', 'de-AT', 'de-CH'],
    description: tool.answer,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url + '/' },
    isAccessibleForFree: true,
  };
}

function toolBreadcrumbJsonLd(tool) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Start', item: SITE.url + '/' },
      { '@type': 'ListItem', position: 2, name: 'Funktionen', item: SITE.url + '/funktionen/' },
      { '@type': 'ListItem', position: 3, name: tool.title, item: `${SITE.url}/funktionen/${tool.slug}/` },
    ],
  };
}

function metaForTool(tool) {
  const title = `${tool.title} — buscosun-Funktion`;
  let d = tool.answer.replace(/\s+/g, ' ').trim();
  if (d.length > 155) d = d.slice(0, 152).replace(/\s+\S*$/, '') + '…';
  return { title, description: d };
}

/** Tool-Landingpage (Wertversprechen + Datenbasis im rohen HTML, Live-Canvas
 *  ist nur Enhancement; CTA öffnet das Tool in der App). */
export function renderToolPage(tool) {
  const meta = metaForTool(tool);
  const canonicalPath = `/funktionen/${tool.slug}/`;
  const noindex = tool.status !== 'full';
  const ogImage = toolOgImage(tool);
  const head = headBlock({
    title: meta.title, description: meta.description, canonicalPath, locale: 'de-DE', noindex,
    ogImage,
    jsonLd: [softwareApplicationJsonLd(tool), faqJsonLd(tool.faqs || []), toolBreadcrumbJsonLd(tool)],
  });
  const bullets = (tool.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join('\n        ');
  const sections = (tool.sections || [])
    .map((s) => `      <section id="${s.id}">\n        <h2>${escapeHtml(s.h2)}</h2>\n        ${s.html}\n      </section>`).join('\n');
  const faqItems = (tool.faqs || [])
    .map((f) => `<details><summary>${escapeHtml(f.q)}</summary><p>${escapeHtml(f.a)}</p></details>`).join('\n      ');
  const relExplainers = (tool.relatedExplainers || [])
    .map((slug) => EXPLAINERS_BY_SLUG[slug]).filter(Boolean)
    .map((r) => `<a href="/wissen/${r.slug}/">${escapeHtml(r.title)}</a>`).join('\n        ');
  const stubNote = noindex
    ? '<p class="sub">Diese Funktionsseite wird ausgebaut; die Kurzbeschreibung oben fasst das Wichtigste zusammen.</p>' : '';

  return `<!doctype html>
<html lang="de">
  <head>
${head}
    <style>${PAGE_CSS}
.hero{width:100%;height:auto;border:1px solid var(--border);border-radius:12px;margin:0 0 1.2rem;background:#fff}
.answer{font-size:1.1rem;margin:0 0 1.2rem}</style>
  </head>
  <body>
    <div class="wrap">
      <nav class="bc" aria-label="Brotkrumen"><a href="/">Start</a> › <a href="/funktionen/">Funktionen</a> › ${escapeHtml(tool.title)}</nav>
      <h1>${escapeHtml(tool.h1)}</h1>
      <img class="hero" src="${ogImage}" width="1200" height="630" alt="${escapeHtml(tool.title)} — buscosun" />
      <p class="answer">${escapeHtml(tool.answer)}</p>
      <a class="cta" href="${tool.deepLink}">${escapeHtml(tool.title)} in buscosun öffnen →</a>
      ${stubNote}
${bullets ? `      <section>\n        <h2>Auf einen Blick</h2>\n        <ul class="facts">\n        ${bullets}\n        </ul>\n      </section>` : ''}
${sections}
      <section>
        <h2>Häufige Fragen</h2>
        ${faqItems}
      </section>
${relExplainers ? `      <section>\n        <h2>Passendes Wetterwissen</h2>\n        <div class="links">\n        ${relExplainers}\n        </div>\n      </section>` : ''}
      <footer>
        ${escapeHtml(SITE.name)} — ${escapeHtml(SITE.tagline)}. Datenbasis: Deutscher Wetterdienst (DWD, CC BY 4.0) · GeoSphere Austria · MeteoSwiss. Kostenlos, ohne Tracker.
      </footer>
    </div>
  </body>
</html>
`;
}

/** /funktionen/-Hub. */
export function renderFunktionenHub(tools) {
  const card = (t) => `<a href="/funktionen/${t.slug}/" class="card${t.status === 'full' ? '' : ' stub'}">
        <strong>${escapeHtml(t.title)}</strong>
        <span>${escapeHtml(metaForTool(t).description)}</span>
      </a>`;
  const full = tools.filter((t) => t.status === 'full').map(card).join('\n      ');
  const stubs = tools.filter((t) => t.status !== 'full').map(card).join('\n      ');
  const head = headBlock({
    title: `Funktionen — was buscosun kann | ${SITE.name}`,
    description: 'Alle buscosun-Funktionen im Überblick: interaktive Wetterkarte, 3D-Atmosphäre, Tourenplanung, bester Event-Tag, Nowcast, Modellvergleich, Globus, Historie und Arbeitsfenster — kostenlos und ohne Tracker.',
    canonicalPath: '/funktionen/', locale: 'de-DE', ogImage: '/og/funktionen.png',
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: 'buscosun-Funktionen', url: SITE.url + '/funktionen/',
    }],
  });
  return `<!doctype html>
<html lang="de">
  <head>
${head}
    <style>${PAGE_CSS}
.cards{display:grid;gap:.8rem}@media(min-width:560px){.cards{grid-template-columns:1fr 1fr}}
.card{display:flex;flex-direction:column;gap:.3rem;background:#fff;border:1px solid var(--border);border-radius:10px;padding:.9rem 1rem;text-decoration:none;color:var(--ink)}
.card strong{color:var(--terra)}.card span{font-size:.85rem;color:var(--stone)}.card.stub{opacity:.7}</style>
  </head>
  <body>
    <div class="wrap">
      <nav class="bc" aria-label="Brotkrumen"><a href="/">Start</a> › Funktionen</nav>
      <h1>buscosun-Funktionen</h1>
      <p class="lead">Alle Werkzeuge von buscosun auf einen Blick — interaktive Wetterkarte, 3D-Atmosphäre, Tourenplanung, bester Event-Tag, Nowcast, Modellvergleich, Globus, Wetterhistorie und Arbeitsfenster. Alles höhenkorrigiert, aus amtlichen Quellen, kostenlos und ohne Tracker.</p>
      <h2>Ausführlich vorgestellt</h2>
      <div class="cards">
      ${full}
      </div>
      <h2>Weitere Funktionen</h2>
      <div class="cards">
      ${stubs}
      </div>
    </div>
  </body>
</html>
`;
}

// --- Event-/Wetterlage-Artikel (/wetterlage/) -------------------------------

/** Deutsches Datum (TT.MM.JJJJ) für sichtbare Zeitstempel. */
function deDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function newsArticleJsonLd(ev) {
  const url = `${SITE.url}/wetterlage/${ev.slug}/`;
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: ev.title,
    description: ev.dek,
    image: [SITE.url + ev.hero.url],
    inLanguage: 'de-DE',
    mainEntityOfPage: url,
    url,
    datePublished: ev.datePublished,
    dateModified: ev.dateModified,
    articleSection: ev.section,
    author: { '@type': 'Organization', name: SITE.name, url: SITE.url + '/' },
    publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url + '/', logo: { '@type': 'ImageObject', url: SITE.url + '/icon.svg' } },
    isAccessibleForFree: true,
  };
}

function eventBreadcrumbJsonLd(ev) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Start', item: SITE.url + '/' },
      { '@type': 'ListItem', position: 2, name: 'Wetterlage', item: SITE.url + '/wetterlage/' },
      { '@type': 'ListItem', position: 3, name: ev.title, item: `${SITE.url}/wetterlage/${ev.slug}/` },
    ],
  };
}

function metaForEvent(ev) {
  let d = ev.dek.replace(/\s+/g, ' ').trim();
  if (d.length > 155) d = d.slice(0, 152).replace(/\s+\S*$/, '') + '…';
  return { title: `${ev.title} | ${SITE.name}`, ogTitle: ev.ogTitle || ev.title, description: d };
}

/** Event-/Wetterlage-Artikel (Discover/News-tauglich, Text komplett im rohen HTML). */
export function renderEventPage(ev) {
  const meta = metaForEvent(ev);
  const canonicalPath = `/wetterlage/${ev.slug}/`;
  const noindex = ev.status !== 'full';
  // OG-Titel separat optimiert → headBlock baut OG aus `title`; daher hier
  // headBlock mit ogTitle-überschreibendem Twist: wir nutzen den optimierten
  // OG-Titel als headBlock-title-Quelle für OG, behalten aber den <title>.
  const head = headBlock({
    title: meta.title, description: meta.description, canonicalPath, locale: 'de-DE', noindex,
    ogTitle: meta.ogTitle, ogImage: ev.hero.url,
    jsonLd: [newsArticleJsonLd(ev), eventBreadcrumbJsonLd(ev)],
  });
  const sections = (ev.sections || [])
    .map((s) => `      <section id="${s.id}">\n        <h2>${escapeHtml(s.h2)}</h2>\n        ${s.html}\n      </section>`).join('\n');
  const relPlaces = (ev.relatedPlaces || [])
    .map((slug) => PLACE_BY_SLUG[slug]).filter(Boolean)
    .map((p) => `<a href="/wetter/${p.slug}/">Wetter ${escapeHtml(p.name)}</a>`).join('\n        ');
  const relExplainers = (ev.relatedExplainers || [])
    .map((slug) => EXPLAINERS_BY_SLUG[slug]).filter(Boolean)
    .map((r) => `<a href="/wissen/${r.slug}/">${escapeHtml(r.title)}</a>`).join('\n        ');

  return `<!doctype html>
<html lang="de">
  <head>
${head}
    <style>${PAGE_CSS}
.hero{width:100%;height:auto;border:1px solid var(--border);border-radius:12px;margin:.4rem 0 1rem;background:#fff}
.byline{font-size:.85rem;color:var(--stone);margin:0 0 1rem}.dek{font-size:1.15rem;margin:0 0 1.2rem}</style>
  </head>
  <body>
    <div class="wrap">
      <nav class="bc" aria-label="Brotkrumen"><a href="/">Start</a> › <a href="/wetterlage/">Wetterlage</a> › ${escapeHtml(ev.section)}</nav>
      <article>
        <h1>${escapeHtml(ev.h1)}</h1>
        <p class="byline">${escapeHtml(SITE.name)} · Veröffentlicht am <time datetime="${ev.datePublished}">${deDate(ev.datePublished)}</time>${ev.dateModified !== ev.datePublished ? ` · Aktualisiert am <time datetime="${ev.dateModified}">${deDate(ev.dateModified)}</time>` : ''}</p>
        <img class="hero" src="${ev.hero.url}" width="${ev.hero.w}" height="${ev.hero.h}" alt="${escapeHtml(ev.hero.alt)}" />
        <p class="dek">${escapeHtml(ev.dek)}</p>
${sections}
${relPlaces ? `        <section>\n          <h2>Betroffene Orte</h2>\n          <div class="links">\n        ${relPlaces}\n          </div>\n        </section>` : ''}
${relExplainers ? `        <section>\n          <h2>Hintergrund</h2>\n          <div class="links">\n        ${relExplainers}\n          </div>\n        </section>` : ''}
      </article>
      <footer>
        ${escapeHtml(SITE.name)} — ${escapeHtml(SITE.tagline)}. Datenbasis: Deutscher Wetterdienst (DWD, CC BY 4.0) · GeoSphere Austria · MeteoSwiss.
        Einordnung einer Wetterlage, keine amtliche Warnung. Verbindliche Warnungen geben die staatlichen Wetterdienste heraus.
      </footer>
    </div>
  </body>
</html>
`;
}

/** /wetterlage/-Hub (Liste der Event-Artikel, neueste zuerst). */
export function renderWetterlageHub(events) {
  const sorted = [...events].sort((a, b) => (a.datePublished < b.datePublished ? 1 : -1));
  const items = sorted.map((e) => `<a href="/wetterlage/${e.slug}/" class="card">
        <strong>${escapeHtml(e.title)}</strong>
        <span>${deDate(e.datePublished)} · ${escapeHtml(metaForEvent(e).description)}</span>
      </a>`).join('\n      ');
  const head = headBlock({
    title: `Wetterlagen — aktuelle Einordnungen | ${SITE.name}`,
    description: 'Einordnung markanter Wetterlagen in der DACH-Region: Hintergründe, betroffene Orte und meteorologische Erklärungen — faktenbasiert, ohne amtliche Warnungen zu implizieren.',
    canonicalPath: '/wetterlage/', locale: 'de-DE', ogImage: '/og/wetterlage.png',
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Wetterlagen', url: SITE.url + '/wetterlage/' }],
  });
  return `<!doctype html>
<html lang="de">
  <head>
${head}
    <style>${PAGE_CSS}
.cards{display:grid;gap:.8rem}.card{display:flex;flex-direction:column;gap:.3rem;background:#fff;border:1px solid var(--border);border-radius:10px;padding:.9rem 1rem;text-decoration:none;color:var(--ink)}
.card strong{color:var(--terra)}.card span{font-size:.85rem;color:var(--stone)}</style>
  </head>
  <body>
    <div class="wrap">
      <nav class="bc" aria-label="Brotkrumen"><a href="/">Start</a> › Wetterlage</nav>
      <h1>Wetterlagen</h1>
      <p class="lead">Einordnung markanter Wetterlagen in der DACH-Region — Hintergründe, betroffene Orte und die Meteorologie dahinter. buscosun erklärt die Lage und gibt keine amtlichen Warnungen heraus.</p>
      <div class="cards">
      ${items}
      </div>
    </div>
  </body>
</html>
`;
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
    <meta property="og:image" content="${SITE.url}/og/home.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="buscosun — ${escapeHtml(SITE.tagline)}" />
    <meta name="twitter:description" content="${escapeHtml(SITE.description)}" />
    <meta name="twitter:image" content="${SITE.url}/og/home.png" />
    ${jsonLdScript(webAppJsonLd())}
    ${jsonLdScript(organizationJsonLd())}`;
}
