/**
 * Phase GLS (audit/gletscher-seo.md): statische Gletscherseiten. Build-only, liest NUR `data/glacier-pages.json`
 * (erzeugt von `refresh-glacier-pages.mjs`) — kein Netz im Build.
 *
 *  /gletscher/<segment>                      eigene App-Shell je Gletscher der Stufen A/B: Title, Description, Canonical,
 *                                            JSON-LD (WebPage, Landform, BreadcrumbList) und ein Faktenblock im #root.
 *                                            Datei `dist/_gl/<segment>.html`, Netlify schreibt per `dist/_redirects` um (200).
 *  /gletscher-atlas/                         Übersicht DACH: Zahlen der Inventare, amtliche Angaben im Wortlaut, Ranglisten
 *  /gletscher-atlas/<land>/                  Länderseite (Schweiz, Österreich, Deutschland)
 *  /gletscher-atlas/<land>/<region>/         Gebirgsgruppe bzw. Region: Tabelle aller benannten Gletscher ab 0,1 km²
 *
 * Ehrlichkeitsregeln wie im Steckbrief (`src/glacier/glacierSheetModel.ts`): Herkunft an jeder Zahl, Bezugsjahr an jeder Fläche,
 * eine Projektion ist immer eine Spanne, amtliche Angaben nur wörtlich mit Quelle und Datum, kein Wort über Begehbarkeit.
 * Alle Sätze werden aus den Daten des Gletschers gebaut; fehlt eine Größe, fehlt der Satz (keine Füllsätze).
 *
 * Schalter: `GLACIER_PAGES = false` ⇒ keine Einzelseiten und kein Atlas, `/gletscher/<segment>` teilt wieder die Shell der Route.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, escapeHtml, headBlock, PAGE_CSS, entityScripts, SITE_ID, ORG_ID, DEFAULT_OG_IMAGE } from './content.mjs';
import { PLACES_ALL } from './places.mjs';
import { GLACIER_REGIONS } from '../../src/glacier/glacierContract.ts';
import { ogCardPath } from '../../src/share/ogCard.ts';

/** Ein Schalter für alle statischen Gletscherseiten (Rückfall: `false`, dann wie vor Phase GLS). */
export const GLACIER_PAGES = true;

const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), 'data', 'glacier-pages.json');
export const GLACIER_DATA = existsSync(DATA_FILE) ? JSON.parse(readFileSync(DATA_FILE, 'utf8')) : null;

export const ATLAS_PATH = '/gletscher-atlas/';
const COUNTRY_SLUG = { CH: 'schweiz', AT: 'oesterreich', DE: 'deutschland' };
const COUNTRY_LABEL = { CH: 'Schweiz', AT: 'Österreich', DE: 'Deutschland' };
const COUNTRY_IN = { CH: 'in der Schweiz', AT: 'in Österreich', DE: 'in Deutschland' };
const COUNTRY_ORDER = ['CH', 'AT', 'DE'];
/** Mindestzahl der Tabellenzeilen für eine eigene Regionsseite (sonst stehen die Gletscher nur auf der Länderseite). */
const REGION_MIN_ROWS = 3;

// --- Zahlen und Wörter -----------------------------------------------------------------------------------------------
const nf = (d) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const NF0 = nf(0), NF1 = nf(1), NF2 = nf(2), NF3 = nf(3);
const MINUS = '\u2212';
const sig = (s) => s.replace(/^-/, MINUS);
const n0 = (v) => sig(NF0.format(v));
const n1 = (v) => sig(NF1.format(v));
const n2 = (v) => sig(NF2.format(v));
/** Fläche: unter 1 km² drei, sonst zwei, ab 10 km² eine Nachkommastelle. */
const km2 = (v) => (v < 1 ? NF3.format(v) : v < 10 ? NF2.format(v) : NF1.format(v));
const mWe = (mm) => n2(mm / 1000);
const plusMinus = (v, f = n1) => (v > 0 ? `+${f(v)}` : f(v));
const esc = escapeHtml;
const yy = (y) => String(y).slice(2);
const hydroYear = (y) => `${y - 1}/${yy(y)}`;
const ASPECT = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];
const aspectWord = (deg) => (deg == null ? null : ASPECT[Math.round((((deg % 360) + 360) % 360) / 45) % 8]);
const CLASS_TEXT = { A: 'Klasse A (ab 1 km²): Fläche, Ausaperung, Albedo und Schneegrenze aus Sentinel-2', B: 'Klasse B (0,1 bis 1 km²): Fläche und Albedo aus Sentinel-2, keine Schneegrenze', C: 'Klasse C (unter 0,1 km²): keine Satellitenzahl' };
/** Quelle der Inventarfläche im Dativ („Laut …“). */
const SRC_LONG = { SGI2016: 'dem Schweizer Gletscherinventar SGI2016', AGI5: 'dem österreichischen Gletscherinventar AGI 5', 'BAdW 2025': 'der Messung der Bayerischen Akademie der Wissenschaften von 2025' };

function distKm(a, b) {
  const R = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * R / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin((b.lon - a.lon) * R / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// --- Namen ---------------------------------------------------------------------------------------------------------------
/**
 * Gebräuchlicher Name und weitere Schreibweisen. Der Inventarname bleibt immer sichtbar. Nur sichere Fälle:
 * die österreichische Getrenntschreibung („Vernagt Ferner") wird zur üblichen Zusammenschreibung, „mit Toteis" fällt weg,
 * und eine kurze Liste bekannter Namen (Pasterze, rätoromanische und französische Namen mit gebräuchlicher deutscher Form).
 */
const KNOWN = {
  'gl_at_pasterzen-kees': { primary: 'Pasterze', alt: ['Pasterzenkees'] },
  'gl_ch_grosser-aletschgletscher': { alt: ['Großer Aletschgletscher', 'Aletschgletscher'] },
  'gl_ch_rhonegletscher': { alt: ['Rhônegletscher'] },
  'gl_ch_vadret-da-morteratsch': { alt: ['Morteratschgletscher'], paren: true },
  'gl_ch_vadret-da-roseg': { alt: ['Roseggletscher'], paren: true },
  'gl_ch_vadret-da-palue': { alt: ['Palügletscher'], paren: true },
  'gl_ch_vadret-da-tschierva': { alt: ['Tschiervagletscher'], paren: true },
  'gl_ch_vadrec-del-forno': { alt: ['Fornogletscher'], paren: true },
  'gl_ch_glacier-de-la-plaine-morte': { alt: ['Plaine-Morte-Gletscher'], paren: true },
};
export function glacierNames(g) {
  const k = KNOWN[g.id] ?? {};
  let primary = k.primary ?? g.name;
  const alt = new Set(k.alt ?? []);
  if (!k.primary && g.country === 'AT') {
    const m = g.name.match(/^(\S+) (Ferner|Kees)( mit Toteis)?$/);
    if (m) primary = `${m[1]}${m[2].toLowerCase()}`;
    else if (/ mit Toteis$/.test(g.name)) primary = g.name.replace(/ mit Toteis$/, '');
  }
  if (/^Gross(e[rsn]?)?\b/.test(g.name)) alt.add(g.name.replace(/^Gross/, 'Groß'));
  alt.delete(primary);
  const inventory = g.name !== primary ? g.name : null;
  const h1 = k.paren && k.alt?.length ? `${primary} (${k.alt[0]})` : primary;
  return { primary, h1, inventory, alt: [...alt].filter((a) => a !== g.name) };
}
/** Lage-Zusatz für die vier deutschen Gletscher (gebräuchliche Ortsangabe). */
const DE_PLACE = {
  'gl_de_hoellentalferner': 'an der Zugspitze', 'gl_de_noerdlicher-schneeferner': 'an der Zugspitze',
  'gl_de_blaueis': 'am Hochkalter in den Berchtesgadener Alpen', 'gl_de_watzmanngletscher': 'am Watzmann in den Berchtesgadener Alpen',
};

/** Kurzform der Lage für Titel. */
const DE_SHORT = { 'gl_de_hoellentalferner': 'Zugspitze', 'gl_de_noerdlicher-schneeferner': 'Zugspitze', 'gl_de_blaueis': 'Hochkalter', 'gl_de_watzmanngletscher': 'Watzmann' };

// --- Auswahl --------------------------------------------------------------------------------------------------------------
const ALL = GLACIER_DATA?.glaciers ?? [];
export const PAGE_GLACIERS = GLACIER_PAGES ? ALL.filter((g) => g.tier) : [];
const BY_ID = new Map(ALL.map((g) => [g.id, g]));
const OFFICIAL = new Map((GLACIER_DATA?.official ?? []).map((o) => [o.id, o]));
export const glacierPath = (g) => `/gletscher/${g.seg}`;
const regionLabel = (r) => GLACIER_REGIONS[r]?.label ?? r;
const regionSlug = (r) => r.replace(/^(ch|at)-/, '');
const regionRows = (r) => ALL.filter((g) => g.region === r);
/** Regionen mit eigener Seite (≥ REGION_MIN_ROWS benannte Gletscher ab 0,1 km²; Deutschland steht ganz auf der Länderseite). */
export const ATLAS_REGIONS = GLACIER_PAGES
  ? [...new Set(ALL.map((g) => g.region))].filter((r) => r !== 'de' && regionRows(r).length >= REGION_MIN_ROWS).sort()
  : [];
export const regionPath = (r) => `${ATLAS_PATH}${COUNTRY_SLUG[GLACIER_REGIONS[r].country]}/${regionSlug(r)}/`;
export const countryPath = (c) => `${ATLAS_PATH}${COUNTRY_SLUG[c]}/`;
const hasRegionPage = (r) => ATLAS_REGIONS.includes(r);
const linkOf = (g, label = glacierNames(g).primary) => (g.tier ? `<a href="${glacierPath(g)}">${esc(label)}</a>` : esc(label));

// --- Textbausteine je Gletscher ----------------------------------------------------------------------------------------------
function lengthSentence(L) {
  if (!L) return null;
  const last = L.recent[L.recent.length - 1];
  const dir = L.total < 0 ? 'zurückgezogen' : 'vorgeschoben';
  const span = last[1] - last[0] > 1 ? `im Intervall ${last[0]}–${last[1]}` : `im Messjahr ${last[0]}/${yy(last[1])}`;
  return `Seit ${L.from} hat sich die Zunge laut Messreihe um insgesamt ${n0(Math.abs(L.total))} m ${dir}${L.gaps ? ` (die Reihe hat Lücken von zusammen ${L.gaps === 1 ? 'einem Jahr' : `${L.gaps} Jahren`})` : ''}; zuletzt ${span}: ${plusMinus(last[2])} m.`;
}
function massSentence(M) {
  if (!M) return null;
  const l = M.last;
  const verb = l.ba < 0 ? 'verlor' : 'gewann';
  return `Im Haushaltsjahr ${hydroYear(l.year)} ${verb} der Gletscher im Mittel über die ganze Fläche ${n2(Math.abs(l.ba) / 1000)} m Wasseräquivalent (Jahresmassenbilanz ${mWe(l.ba)} m w. e.)${l.ela ? `, die Gleichgewichtslinie lag bei ${n0(l.ela)} m` : ''}.`;
}
function areaSentence(A) {
  if (!A) return null;
  const a = A.rows[0], b = A.rows[A.rows.length - 1];
  const verb = A.pct < 0 ? 'schrumpfte' : 'wuchs';
  return `Nach den Inventaren ${verb} die Fläche zwischen ${a[0]} und ${b[0]} von ${km2(a[1])} auf ${km2(b[1])} km² (${plusMinus(A.pct, n0)} %).`;
}
function projSentence(P) {
  if (!P) return null;
  if (!P.range) return 'Nach dem Gletschermodell GloGEM fällt das Eisvolumen in keinem Klimaszenario vor 2100 unter 10 % des Standes von 2020.';
  if (P.range.to == null) return `Nach dem Gletschermodell GloGEM fällt das Eisvolumen je nach Klimaszenario und Klimamodell frühestens ${P.range.from} unter 10 % des Standes von 2020, in einem Teil der Rechnungen erst nach 2100.`;
  return `Nach dem Gletschermodell GloGEM fällt das Eisvolumen zwischen ${P.range.from} und ${P.range.to} unter 10 % des Standes von 2020, je nach Klimaszenario und Klimamodell.`;
}
/** Kurzantwort unter der H1 und welche Kennzahl-Sätze sie trägt (die Abschnitte wiederholen sie dann nicht). */
function leadParts(g) {
  const nm = glacierNames(g);
  const where = `${COUNTRY_IN[g.country]}${DE_PLACE[g.id] ? ` ${DE_PLACE[g.id]}` : ''}`;
  const ha = g.area.km2 < 0.1 ? ` (${n1(g.area.km2 * 100)} Hektar)` : '';
  const s = [`${nm.primary}${nm.inventory ? ` (Inventarname „${nm.inventory}“)` : ''} ist ein Gletscher ${where}, Region ${regionLabel(g.region)}.`];
  s.push(`Laut ${SRC_LONG[g.area.source] ?? g.area.source} misst der Gletscher ${km2(g.area.km2)} km²${ha} (Bezugsjahr ${g.area.refYear}) und reicht von ${n0(g.z[0])} bis ${n0(g.z[2])} m Höhe.`);
  const used = new Set();
  const L = lengthSentence(g.length), M = massSentence(g.mass), A = areaSentence(g.areaSeries), P = projSentence(g.proj);
  if (L) { s.push(L); used.add('length'); }
  if (M) { s.push(M); used.add('mass'); }
  if (A && !(L && M)) { s.push(A); used.add('area'); }
  if (P && s.length < 5) { s.push(P); used.add('proj'); }
  return { text: s.join(' '), used };
}
const leadText = (g) => leadParts(g).text;

export function glacierTitle(g) {
  const nm = glacierNames(g);
  const who = g.dupName ? `${nm.primary} (${regionLabel(g.region)})` : nm.primary;
  const a1850 = g.areaSeries && g.areaSeries.rows[0][0] <= 1900 ? g.areaSeries.rows[0][0] : null;
  const variants = [
    g.country === 'DE' && g.areaSeries ? `${who} (${DE_SHORT[g.id] ?? 'Bayern'}): Gletscherfläche seit ${g.areaSeries.rows[0][0]} und Daten` : null,
    g.length && g.mass ? `${who}: Gletscherrückgang seit ${g.length.from}, Massenbilanz` : null,
    g.length && g.mass ? `${who}: Rückgang seit ${g.length.from}, Massenbilanz, Daten` : null,
    g.length ? `${who}: Gletscherrückgang seit ${g.length.from}, Messreihe` : null,
    g.length ? `${who}: Rückgang seit ${g.length.from} und Gletscherdaten` : null,
    g.mass ? `${who}: Massenbilanz, Fläche und Gletscherdaten` : null,
    a1850 ? `${who}: Fläche seit ${a1850}, Höhe und Gletscherdaten` : null,
    `${who}: Fläche, Höhe und Gletscherdaten`,
    `${who}: Gletscherdaten`,
  ].filter(Boolean);
  // Bis 66 Zeichen (+ „ | buscosun“): Google kürzt die Anzeige, nicht die Wertung — Name und Kernbegriff stehen vorn.
  return variants.find((t) => t.length <= 66) ?? variants[variants.length - 1];
}
export function glacierDescription(g) {
  const nm = glacierNames(g);
  const head = `${nm.primary} (${regionLabel(g.region)}, ${COUNTRY_LABEL[g.country]}): ${km2(g.area.km2)} km² (${g.area.refYear})`;
  const bits = [];
  if (g.length) bits.push(`Zunge seit ${g.length.from} ${n0(g.length.total)} m`);
  if (g.mass) bits.push(`Massenbilanz ${hydroYear(g.mass.last.year)} ${mWe(g.mass.last.ba)} m w. e.`);
  if (!g.length && g.areaSeries) bits.push(`Fläche seit ${g.areaSeries.rows[0][0]} ${plusMinus(g.areaSeries.pct, n0)} %`);
  const tail = ' Messreihen mit Quelle, Schmelzindex, Sentinel-2.';
  for (let k = bits.length; k >= 0; k--) {
    const d = `${`${head}${k ? `, ${bits.slice(0, k).join(', ')}` : ''}`.replace(/\.$/, '')}.${tail}`;
    if (d.length <= 160) return d;
  }
  return `${head}.`.slice(0, 160);
}

// --- HTML der Einzelseite -------------------------------------------------------------------------------------------------
const table = (head, rows, cls = '') => `<table${cls ? ` class="${cls}"` : ''}><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const quoteBlock = (o) => `<blockquote><p>„${esc(o.quote)}“</p><p class="note">${esc(o.source)}${o.source.includes(deDate(o.date)) ? '' : `, ${esc(deDate(o.date))}`} — <a href="${esc(o.url)}" rel="noopener">Quelle</a>${o.period ? ` · Zeitraum ${esc(o.period)}` : ''}</p></blockquote>`;
function deDate(iso) { return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`; }
const crumbs = (g) => [
  ['Start', '/'], ['Gletscher', '/gletscher'], ['Gletscher-Atlas', ATLAS_PATH], [COUNTRY_LABEL[g.country], countryPath(g.country)],
  ...(hasRegionPage(g.region) ? [[regionLabel(g.region), regionPath(g.region)]] : []),
  [glacierNames(g).primary, null],
];

function nearbyGlaciers(g, n = 5) {
  return PAGE_GLACIERS.filter((x) => x.id !== g.id).map((x) => ({ x, d: distKm(g, x) })).sort((a, b) => a.d - b.d).slice(0, n);
}
function nearbyPlaces(g, n = 3, maxKm = 40) {
  return PLACES_ALL.map((p) => ({ p, d: distKm(g, p) })).filter((x) => x.d <= maxKm).sort((a, b) => a.d - b.d).slice(0, n);
}
const officialFor = (g) => [
  ...(g.official ?? []).map((id) => OFFICIAL.get(id)).filter(Boolean),
  ...(g.country === 'DE' ? [...OFFICIAL.values()].filter((o) => o.scope === 'DE' && !o.glacierId) : []),
];

export function glacierFallbackHtml(g) {
  const nm = glacierNames(g);
  const path = glacierPath(g);
  const { text: lead, used } = leadParts(g);
  /** Kennzahl-Satz im Abschnitt nur, wenn er nicht schon in der Kurzantwort steht. */
  const once = (key, sentence) => (used.has(key) ? '' : `${esc(sentence)} `);
  const sec = [];
  const facts = [
    ['Land, Region', `${COUNTRY_LABEL[g.country]}, ${esc(regionLabel(g.region))}${DE_PLACE[g.id] ? ` (${esc(DE_PLACE[g.id])})` : ''}`],
    ['Fläche', `${km2(g.area.km2)} km² · Bezugsjahr ${esc(g.area.refYear)} · ${esc(g.area.source)}`],
    ['Höhe', `${n0(g.z[0])} bis ${n0(g.z[2])} m, Median ${n0(g.z[1])} m · ${esc(g.zSource)}`],
    ...(aspectWord(g.asp) ? [['Exposition', `nach ${aspectWord(g.asp)} (Mittel des Inventars)`]] : []),
    ['Größenklasse', esc(CLASS_TEXT[g.klass])],
    ['Lage', `${NF3.format(g.lat)}° N, ${NF3.format(g.lon)}° O`],
    ...(nm.inventory || nm.alt.length ? [['Namen', esc([nm.inventory ? `Inventar: ${nm.inventory}` : null, nm.alt.length ? `auch ${nm.alt.join(', ')}` : null].filter(Boolean).join(' · '))]] : []),
    ...(Object.keys(g.inv ?? {}).length ? [['Kennungen', esc(Object.entries(g.inv).map(([k, v]) => `${{ glims: 'GLIMS', agi5: 'AGI 5', gi4: 'GI4', wgms: 'WGMS', rgi6: 'RGI 6.2' }[k] ?? k} ${v}`).join(' · '))]] : []),
  ];
  sec.push(`<h2>Steckbrief</h2>\n      <dl>\n        ${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('\n        ')}\n      </dl>`);
  if (g.length) {
    const L = g.length;
    sec.push(`<h2>Längenänderung der Zunge</h2>
      <p>${once('length', lengthSentence(L))}Gemessen wird die Lage des Gletscherendes von Jahr zu Jahr (${L.n} Messintervalle von ${L.from} bis ${L.to}). Herkunft: gemessen. Die letzten Intervalle:</p>
      ${table(['Messintervall', 'Änderung'], L.recent.slice().reverse().map((r) => [`${r[0]}–${r[1]}`, `${plusMinus(r[2])} m`]))}
      <p class="note">Quelle: ${esc(L.source)}${L.doi ? `, doi:<a href="https://doi.org/${esc(L.doi)}" rel="noopener">${esc(L.doi)}</a>` : ''}.</p>`);
  }
  if (g.mass) {
    const M = g.mass;
    sec.push(`<h2>Massenbilanz</h2>
      <p>${once('mass', massSentence(M))}Die Reihe umfasst ${M.n} Haushaltsjahre zwischen ${M.from} und ${M.to}${M.mean10 != null ? `; im Mittel der ${M.n10} gemessenen Jahre seit ${M.last.year - 9} lag sie bei ${mWe(M.mean10)} m Wasseräquivalent` : ''}. Eine negative Bilanz heißt: Der Gletscher hat im Jahr mehr Eis verloren, als im Winter an Schnee dazukam. Herkunft: gemessen (${M.method === 'geodetic' ? 'geodätisch' : 'glaziologisch'}).</p>
      ${table(['Haushaltsjahr', 'Jahresbilanz', 'Gleichgewichtslinie', 'AAR'], M.recent.slice().reverse().map((r) => [hydroYear(r[0]), `${mWe(r[1])} m w. e.`, r[2] != null ? `${n0(r[2])} m` : '–', r[3] != null ? n2(r[3]) : '–']))}
      <p class="note">Die letzten zehn gemessenen Jahre; Jahre ohne Messung fehlen. AAR = Anteil der Fläche, auf dem am Ende des Sommers Schnee vom Winter liegt. Quelle: ${esc(M.source)}${M.doi ? `, doi:<a href="https://doi.org/${esc(M.doi)}" rel="noopener">${esc(M.doi)}</a>` : ''}.</p>`);
  }
  if (g.areaSeries) {
    const A = g.areaSeries;
    sec.push(`<h2>Fläche im Vergleich der Inventare</h2>
      <p>${once('area', areaSentence(A))}Inventare verschiedener Jahre sind mit verschiedenen Verfahren kartiert; kleine Unterschiede liegen im Rahmen der Kartiergenauigkeit. Herkunft: Inventar.</p>
      ${table(['Bezugsjahr', 'Fläche'], A.rows.map((r) => [String(r[0]), `${km2(r[1])} km²`]))}
      <p class="note">Quelle: ${esc(A.source)}.</p>`);
  }
  if (g.proj) {
    const P = g.proj;
    const cell = (t) => (t ? `${n0(t[1])} % (${n0(t[0])}–${n0(t[2])} %)` : '–');
    sec.push(`<h2>Projektion bis 2100: Wie lange bleibt das Eis?</h2>
      <p>${once('proj', projSentence(P))}Das ist eine Modellrechnung, keine Messung, und immer eine Spanne, nie ein einzelnes Jahr: Median und Spanne über 12 Klimamodelle, Volumen 2020 = 100 %${P.v2020km3 ? ` (Volumen 2020 laut Modell ${n2(P.v2020km3)} km³)` : ''}.</p>
      ${table(['Szenario', '2050', '2100'], [['SSP1-2.6 (starker Klimaschutz)', cell(P.ssp126.y2050), cell(P.ssp126.y2100)], ['SSP5-8.5 (hohe Emissionen)', cell(P.ssp585.y2050), cell(P.ssp585.y2100)]])}
      <p class="note">Quelle: ${esc(P.model)}; Zekollari, H. et al. (2024), GloGEM CMIP6 global glacier projections, doi:<a href="https://doi.org/10.5281/zenodo.17632573" rel="noopener">10.5281/zenodo.17632573</a>, CC BY 4.0.</p>`);
  }
  const off = officialFor(g);
  if (off.length) sec.push(`<h2>Amtliche Angaben</h2>\n      <p>Wörtlich, mit Datum und Quelle; buscosun gibt keine eigenen amtlichen Zahlen heraus.</p>\n      ${off.map(quoteBlock).join('\n      ')}`);
  sec.push(`<h2>Im interaktiven Steckbrief</h2>
      <p>Der Steckbrief unter dieser Adresse zeigt zusätzlich, was sich laufend ändert: den Schmelzindex der nächsten 14 Tage aus Wettermodellen (alle drei Stunden neu, ohne Einheit, weil seine Eichung auf Millimeter die vorab festgelegte Abnahme nicht bestanden hat), ${g.klass === 'A' ? 'die Schneegrenze der letzten klaren Sentinel-2-Szene als Szenenwert (keine Gleichgewichtslinie)' : 'Albedo und Ausaperung der letzten klaren Sentinel-2-Szene'}, frühere Umrisse im Vergleich und eine 3D-Ansicht. Er sagt nichts über Spalten, Steinschlag oder Begehbarkeit und gibt keine Tour frei.</p>
      <p><a href="/methodik/gletscher-daten/">Wie die Zahlen entstehen</a> · <a href="/funktionen/gletscher/">So liest du den Steckbrief</a> · <a href="/lizenzen/">Quellen und Lizenzen</a></p>`);
  const ng = nearbyGlaciers(g), np = nearbyPlaces(g);
  sec.push(`<h2>In der Nähe</h2>
      <ul>${ng.map(({ x, d }) => `<li>${linkOf(x)} — ${n0(d)} km, ${km2(x.area.km2)} km² (${esc(x.area.refYear)})</li>`).join('')}</ul>
      ${np.length ? `<p>Wetter in der Nähe: ${np.map(({ p, d }) => `<a href="/wetter/${p.slug}/">${esc(p.name)}</a> (${n0(d)} km)`).join(' · ')}</p>` : ''}
      <p>Alle Gletscher der Region: ${hasRegionPage(g.region) ? `<a href="${regionPath(g.region)}">${esc(regionLabel(g.region))}</a>` : `<a href="${countryPath(g.country)}">${COUNTRY_LABEL[g.country]}</a>`} · <a href="${ATLAS_PATH}">Gletscher-Atlas DACH</a> · <a href="/gletscher">Gletscher-Karte</a></p>`);
  const nav = crumbs(g).map(([n, p]) => (p ? `<a href="${p}">${esc(n)}</a>` : esc(n))).join(' › ');
  return `<div id="seo-fallback" data-static-page="${path}">
      <nav aria-label="Brotkrumen">${nav}</nav>
      <h1>${esc(nm.h1)}</h1>
      <p>${esc(lead)}</p>
      <p class="note">Daten: Gletscher-Build ${esc(GLACIER_DATA.build)}, Seite geprüft am ${deDate(g.updated)}. Kein amtliches Produkt; Herkunft steht an jeder Zahl (gemessen, Inventar, Modell, amtlich).</p>
      ${sec.join('\n      ')}
    </div>`;
}

function glacierJsonLd(g) {
  const nm = glacierNames(g);
  const url = SITE.url + glacierPath(g);
  const ident = Object.entries(g.inv ?? {}).map(([k, v]) => ({ '@type': 'PropertyValue', propertyID: { glims: 'GLIMS', agi5: 'AGI5', gi4: 'GI4', wgms: 'WGMS', rgi6: 'RGI6.2' }[k] ?? k, value: String(v) }));
  const props = [
    { '@type': 'PropertyValue', name: 'Fläche', value: g.area.km2, unitCode: 'KMK', unitText: 'km²', description: `Inventar ${g.area.source}, Bezugsjahr ${g.area.refYear}` },
    { '@type': 'PropertyValue', name: 'Höhe tiefster Punkt', value: g.z[0], unitCode: 'MTR', description: g.zSource },
    { '@type': 'PropertyValue', name: 'Höhe höchster Punkt', value: g.z[2], unitCode: 'MTR', description: g.zSource },
  ];
  if (g.length) props.push({ '@type': 'PropertyValue', name: 'Kumulierte Längenänderung der Zunge', value: g.length.total, unitCode: 'MTR', description: `${g.length.from}–${g.length.to}, gemessen; ${g.length.source}` });
  if (g.mass) props.push({ '@type': 'PropertyValue', name: `Jahresmassenbilanz ${hydroYear(g.mass.last.year)}`, value: g.mass.last.ba, unitText: 'mm w.e.', description: `gemessen; ${g.mass.source}` });
  return [
    {
      '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${url}#webpage`, url, name: glacierTitle(g), description: glacierDescription(g),
      inLanguage: 'de', isPartOf: { '@id': SITE_ID }, publisher: { '@id': ORG_ID }, about: { '@id': `${url}#gletscher` },
      breadcrumb: { '@id': `${url}#breadcrumb` }, dateModified: g.updated,
    },
    {
      '@context': 'https://schema.org', '@type': 'Landform', '@id': `${url}#gletscher`, name: nm.primary,
      ...(nm.inventory || nm.alt.length ? { alternateName: [...(nm.inventory ? [nm.inventory] : []), ...nm.alt] } : {}),
      additionalType: 'http://www.wikidata.org/entity/Q35666',
      description: leadText(g).split('. ').slice(0, 2).join('. ').replace(/\.?$/, '.'),
      url,
      geo: { '@type': 'GeoCoordinates', latitude: g.lat, longitude: g.lon, elevation: g.z[1] },
      containedInPlace: { '@type': 'Place', name: `${regionLabel(g.region)}, ${COUNTRY_LABEL[g.country]}` },
      ...(ident.length ? { identifier: ident } : {}),
      additionalProperty: props,
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
      itemListElement: crumbs(g).map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, ...(p ? { item: SITE.url + p } : { item: url }) })),
    },
  ];
}
/** `data-static`: diese Blöcke gehören der Seite (`src/seo/staticPage.ts` nimmt sie beim Verlassen in der App heraus). */
const ldScript = (o) => `<script type="application/ld+json" data-static>${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

/** Head-Ergänzungen der Einzelseite (vor `</head>` der Vite-Shell). `data-static` markiert Tags, die der Client nicht überschreibt. */
export function glacierHeadExtras(g) {
  const url = SITE.url + glacierPath(g);
  const title = `${glacierTitle(g)} | ${SITE.name}`;
  const desc = glacierDescription(g);
  const og = ogCardPath('gletscher') || DEFAULT_OG_IMAGE;
  return `<link rel="canonical" href="${url}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="alternate" type="application/rss+xml" title="buscosun — Wetterwissen &amp; Wetterlagen" href="/feed.xml" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE.name}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:locale" content="de_DE" />
    <meta property="og:image" content="${SITE.url}${og}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${SITE.url}${og}" />
    ${glacierJsonLd(g).map(ldScript).join('\n    ')}
    ${entityScripts()}`;
}

/** Komplette Shell einer Einzelseite aus der rohen Vite-Shell. `withPreloads` und `gate` kommen aus generate-seo (dieselben wie für /gletscher). */
export function renderGlacierShell(rawShell, g, { withPreloads = (h) => h, gate = '' } = {}) {
  let sh = rawShell
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(glacierTitle(g))} | ${SITE.name}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(glacierDescription(g))}" />`);
  sh = sh.replace('</head>', `    ${glacierHeadExtras(g)}\n  </head>`);
  sh = withPreloads(sh);
  return sh.replace('<div id="root"></div>', `<div id="root">${glacierFallbackHtml(g)}</div>${gate}`);
}

/** Flache Datei der Einzelseite (unter `_gl/`, robots.txt sperrt den Ordner; die URL ist allein `/gletscher/<segment>`). */
export const glacierShellFile = (g) => `_gl/${g.seg}.html`;
/** Zeilen für `dist/_redirects` (Netlify liest sie VOR netlify.toml, also vor `/gletscher/*`). */
export function glacierRedirectLines() {
  return PAGE_GLACIERS.map((g) => `${glacierPath(g)}  /${glacierShellFile(g)}  200`);
}

// --- Atlas ---------------------------------------------------------------------------------------------------------------
const ATLAS_CSS = `${PAGE_CSS}
.wrap{max-width:900px}blockquote{margin:.8rem 0;padding:.2rem .9rem;border-left:3px solid var(--terra);background:#fff}
blockquote p{margin:.4rem 0}td a{color:var(--terra-ink)}.num{white-space:nowrap}`;
const sum = GLACIER_DATA?.sums ?? {};
/** „Bezugsjahr 2023“ bzw. „Bezugsjahre 2013–2018“. */
const refYearsText = (y) => `${/[–-]/.test(String(y)) ? 'Bezugsjahre' : 'Bezugsjahr'} ${y}`;
const pagesOf = (c) => PAGE_GLACIERS.filter((g) => g.country === c);
const latestDate = (list) => list.reduce((m, g) => (g.updated > m ? g.updated : m), '0000-00-00');
const atlasUpdated = () => latestDate(PAGE_GLACIERS);

function atlasPage({ path, title, description, h1, lead, crumbsList, body, jsonLd = [], updated }) {
  const url = SITE.url + path;
  const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbsList.map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE.url + (p ?? path) })) };
  const page = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url, description, inLanguage: 'de', dateModified: updated };
  const head = headBlock({ title: `${title} | ${SITE.name}`, description, canonicalPath: path, locale: 'de-DE', ogImage: ogCardPath('gletscher') || DEFAULT_OG_IMAGE, jsonLd: [page, bc, ...jsonLd] });
  const nav = crumbsList.map(([n, p]) => (p ? `<a href="${p}">${esc(n)}</a>` : esc(n))).join(' › ');
  return `<!doctype html>
<html lang="de">
  <head>
${head}
    <style>${ATLAS_CSS}</style>
  </head>
  <body>
    <main class="wrap">
      <nav class="bc" aria-label="Brotkrumen">${nav}</nav>
      <h1>${esc(h1)}</h1>
      <p class="lead">${esc(lead)}</p>
      <p class="note">Daten: Gletscher-Build ${esc(GLACIER_DATA.build)}, Stand der Seite ${deDate(updated)}. Inventare haben je Land andere Bezugsjahre; Flächen verschiedener Jahre werden nicht addiert, ohne das zu sagen.</p>
${body}
      <footer>
        ${esc(SITE.name)} — Gletscher-Monitor DACH. Kein amtliches Produkt, keine Tourenfreigabe. Amtliche Gletscherberichte: <a href="https://www.glamos.ch/" rel="noopener">GLAMOS</a> (CH), <a href="https://www.alpenverein.at/" rel="noopener">Österreichischer Alpenverein</a> (AT), <a href="https://badw.de/" rel="noopener">Bayerische Akademie der Wissenschaften</a> (DE).
        <a href="/gletscher">Gletscher-Karte</a> · <a href="/methodik/gletscher-daten/">Methodik</a> · <a href="/lizenzen/">Quellen &amp; Lizenzen</a> · <a href="/impressum/">Impressum</a>
      </footer>
    </main>
  </body>
</html>
`;
}
const section = (h2, html, id) => `      <section${id ? ` id="${id}"` : ''}>\n        <h2>${esc(h2)}</h2>\n        ${html}\n      </section>`;
const officialItems = (pred) => [...OFFICIAL.values()].filter(pred).sort((a, b) => (a.date < b.date ? 1 : -1));
const glacierRow = (g) => [
  linkOf(g), `<span class="num">${km2(g.area.km2)} km²</span>`, esc(String(g.area.refYear)), `<span class="num">${n0(g.z[0])}–${n0(g.z[2])} m</span>`,
  g.length ? `<span class="num">${n0(g.length.total)} m</span> (${g.length.from}–${g.length.to})` : '–',
  g.mass ? `<span class="num">${mWe(g.mass.last.ba)} m w. e.</span> (${hydroYear(g.mass.last.year)})` : '–',
];
const GLACIER_HEAD = ['Gletscher', 'Fläche', 'Bezugsjahr', 'Höhe', 'Zunge (Summe)', 'Massenbilanz zuletzt'];

function countLead() {
  const ch = sum.CH, at = sum.AT, de = sum.DE;
  return `In den Gletscherinventaren der drei Länder stehen ${n0(ch.n + at.n + de.n)} Gletscher: ${n0(ch.n)} in der Schweiz mit ${n0(ch.km2)} km² (SGI2016, ${refYearsText(ch.refYears)}), ${n0(at.n)} in Österreich mit ${n0(at.km2)} km² (AGI 5, ${at.refYears}) und ${de.n} in Deutschland mit ${n1(de.km2 * 100)} Hektar (Bayerische Akademie der Wissenschaften, ${de.refYears}). Für ${n0(PAGE_GLACIERS.length)} Gletscher mit Messreihe oder mehr als 1 km² Fläche gibt es einen eigenen Steckbrief mit Zahlen, Quelle und Bezugsjahr.`;
}

/** /gletscher-atlas/ */
export function renderAtlasHub() {
  const all = PAGE_GLACIERS;
  const largest = [...all].sort((a, b) => b.area.km2 - a.area.km2).slice(0, 10);
  const lenRows = all.filter((g) => g.length).map((g) => ({ g, r: g.length.recent[g.length.recent.length - 1] }))
    .filter(({ r }) => r[1] - r[0] === 1 && r[1] >= 2023).sort((a, b) => a.r[2] - b.r[2]).slice(0, 10);
  const maxMassYear = Math.max(...all.filter((g) => g.mass).map((g) => g.mass.last.year));
  const massRows = all.filter((g) => g.mass && g.mass.last.year === maxMassYear).sort((a, b) => a.mass.last.ba - b.mass.last.ba);
  const countries = COUNTRY_ORDER.map((c) => [
    `<a href="${countryPath(c)}">${COUNTRY_LABEL[c]}</a>`, n0(sum[c].n), c === 'DE' ? `${n1(sum[c].km2 * 100)} ha` : `${n0(sum[c].km2)} km²`, esc(sum[c].refYears), esc(sum[c].sources.join(', ')), n0(pagesOf(c).length),
  ]);
  const top = largest[0];
  const body = [
    section('Wie viele Gletscher gibt es in Deutschland, Österreich und der Schweiz?', `${table(['Land', 'Gletscher', 'Fläche', 'Bezugsjahr', 'Inventar', 'Steckbriefe'], countries)}
        <p>Größter Gletscher im Datensatz: ${linkOf(top)} mit ${km2(top.area.km2)} km² (${esc(top.area.source)}, Bezugsjahr ${esc(String(top.area.refYear))}). Wie viele Gletscher es in einem Land gibt, hängt am Inventar: Es zählt Eisflächen ab einer Mindestgröße zu einem Stichjahr, und kleine Gletscher fallen mit jedem neuen Inventar heraus.</p>`, 'zahl'),
    section('Aktuelle amtliche Angaben', `<p>Die Jahresberichte geben die Messnetze heraus: GLAMOS in der Schweiz, der Österreichische Alpenverein und die Bayerische Akademie der Wissenschaften. Die Sätze stehen hier wörtlich, mit Datum und Quelle.</p>
        ${officialItems((o) => o.kind === 'report' && !o.glacierId).map(quoteBlock).join('\n        ')}`, 'amtlich'),
    section('Die größten Gletscher', `${table(['Gletscher', 'Land', 'Fläche', 'Bezugsjahr, Inventar'], largest.map((g) => [linkOf(g), COUNTRY_LABEL[g.country], `${km2(g.area.km2)} km²`, `${esc(String(g.area.refYear))}, ${esc(g.area.source)}`]))}
        <p class="note">Die Inventare der Länder haben verschiedene Bezugsjahre; eine Rangliste über Ländergrenzen ist deshalb nur ungefähr.</p>`, 'groesste'),
    lenRows.length ? section('Stärkster gemessener Rückzug der Zunge im letzten Messjahr', `${table(['Gletscher', 'Messjahr', 'Änderung', 'Quelle'], lenRows.map(({ g, r }) => [linkOf(g), `${r[0]}/${yy(r[1])}`, `<span class="num">${plusMinus(r[2])} m</span>`, esc(g.length.source.split(' — ')[0].split(' (PANGAEA')[0])]))}
        <p class="note">Nur einjährige Messintervalle, die 2023 oder später enden (letzter Stand der Reihen). Ein einzelnes Jahr kann von Abbrüchen oder dem Zerfall der Zunge geprägt sein.</p>`, 'rueckzug') : '',
    massRows.length ? section(`Massenbilanz im Haushaltsjahr ${hydroYear(maxMassYear)}`, `${table(['Gletscher', 'Land', 'Jahresbilanz', 'Gleichgewichtslinie'], massRows.map((g) => [linkOf(g), COUNTRY_LABEL[g.country], `<span class="num">${mWe(g.mass.last.ba)} m w. e.</span>`, g.mass.last.ela ? `${n0(g.mass.last.ela)} m` : '–']))}
        <p class="note">Glaziologisch gemessene Jahresbilanzen aus dem Datensatz des WGMS (Fluctuations of Glaciers, 2026-02-10). Eine Bilanz von ${MINUS}1 m w. e. heißt: Über die ganze Fläche ist eine Wasserschicht von einem Meter verloren gegangen.</p>`, 'bilanz') : '',
    section('Gletscher nach Land und Region', COUNTRY_ORDER.map((c) => `<h3><a href="${countryPath(c)}">${COUNTRY_LABEL[c]}</a></h3><div class="links">${ATLAS_REGIONS.filter((r) => GLACIER_REGIONS[r].country === c).map((r) => `<a href="${regionPath(r)}">${esc(regionLabel(r))}</a>`).join('') || pagesOf(c).map((g) => linkOf(g)).join(' · ')}</div>`).join('\n        '), 'regionen'),
    section('Daten und Grenzen', `<p>Flächen und Höhen stammen aus den Inventaren (Schweiz: SGI2016 über die GLIMS Glacier Database; Österreich: AGI 5 und GI4; Deutschland: Bayerische Akademie der Wissenschaften und RGI 6.2), Längen- und Massenreihen aus dem Datensatz des WGMS und für Österreich vom Gletschermessdienst des Alpenvereins, die Projektionen aus GloGEM (Zekollari et al. 2024). Der Gletscher-Monitor rechnet zusätzlich einen Schmelzindex aus Wettermodellen und liest Sentinel-2-Szenen aus; diese Werte stehen im interaktiven Steckbrief und tragen ihr eigenes Zeichen. <a href="/methodik/gletscher-daten/">Methodik</a> · <a href="/lizenzen/">Lizenzen</a> · <a href="/gletscher">Zur Gletscher-Karte</a></p>`, 'daten'),
  ].filter(Boolean).join('\n');
  const dataset = {
    '@context': 'https://schema.org', '@type': 'Dataset', name: 'Gletscher-Monitor DACH: Gletscherkennzahlen für Schweiz, Österreich und Deutschland',
    description: `Harmonisierte Kennzahlen für ${n0(GLACIER_DATA.counts.catalog)} Gletscher in CH, AT und DE: Inventarflächen mit Bezugsjahr, Höhen, Längen- und Massenbilanzreihen (WGMS, Österreichischer Alpenverein), Projektionen bis 2100 (GloGEM) und amtliche Angaben im Wortlaut. Abgeleitete Daten von buscosun; die Originaldaten unterliegen den Bedingungen ihrer Quellen. Keine amtlichen Daten.`,
    url: SITE.url + ATLAS_PATH, inLanguage: 'de', isAccessibleForFree: true, creator: { '@id': ORG_ID }, publisher: { '@id': ORG_ID },
    license: `${SITE.url}/lizenzen/`, temporalCoverage: '1850/2100', dateModified: atlasUpdated(),
    keywords: ['Gletscher', 'Gletscherschwund', 'Massenbilanz', 'Gletscherinventar', 'Alpen', 'Schweiz', 'Österreich', 'Deutschland'],
    spatialCoverage: { '@type': 'Place', name: 'Alpen in der Schweiz, in Österreich und in Deutschland', geo: { '@type': 'GeoShape', box: '45.8 5.9 47.9 16.2' } },
    variableMeasured: ['Gletscherfläche (km²)', 'Längenänderung der Zunge (m)', 'Jahresmassenbilanz (mm w.e.)', 'Gleichgewichtslinie (m)', 'Projiziertes Eisvolumen (Anteil von 2020)'],
    isBasedOn: (GLACIER_DATA.sources ?? []).map((s) => s.url).filter((u) => /^https:\/\//.test(u)),
    distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@glacier/glacier/v1/static/${GLACIER_DATA.build}/catalog.json` }],
  };
  return atlasPage({
    path: ATLAS_PATH, updated: atlasUpdated(),
    title: 'Gletscher-Atlas DACH: alle Gletscher in Schweiz, Österreich, Deutschland',
    description: `${n0(GLACIER_DATA.counts.catalog)} Gletscher in CH, AT und DE: Zahl je Land, größte Gletscher, Rückzug und Massenbilanz zuletzt, amtliche Angaben im Wortlaut.`,
    h1: 'Gletscher-Atlas: alle Gletscher in der Schweiz, in Österreich und Deutschland',
    lead: countLead(),
    crumbsList: [['Start', '/'], ['Gletscher', '/gletscher'], ['Gletscher-Atlas', null]],
    body, jsonLd: [dataset],
  });
}

const DE_SCHNEEFERNER = {
  quote: 'Aufgrund der geringen Eisdicke kann auch keine Eisbewegung mehr erwartet werden, so dass der Südliche Schneeferner nicht länger als eigenständiger Gletscher betrachtet wird.',
  source: 'Bayerische Akademie der Wissenschaften, Pressemitteilung Nr. 09/2022', date: '2022-09-26', period: 'Herbst 2022',
  url: 'https://badw.de/fileadmin/user_upload/Files/BADW/pressemitteilungen/2022/09_Schneeferner.pdf',
};
const COUNTRY_TEXT = {
  CH: {
    title: 'Gletscher in der Schweiz: Liste, Fläche, Rückgang und Massenbilanz',
    h1: 'Gletscher in der Schweiz: Inventar, Messreihen und Eisverlust',
    lead: () => { const a = [...pagesOf('CH')].sort((x, y) => y.area.km2 - x.area.km2)[0]; return `Das Schweizer Gletscherinventar SGI2016 führt ${n0(sum.CH.n)} Gletscher mit zusammen ${n0(sum.CH.km2)} km² (${refYearsText(sum.CH.refYears)}); ${n0(sum.CH.classA)} davon sind größer als 1 km². Größter Gletscher: ${glacierNames(a).primary} mit ${km2(a.area.km2)} km² (Bezugsjahr ${a.area.refYear}). Die Jahresberichte gibt das Messnetz GLAMOS heraus; buscosun zeigt die Reihen, die GLAMOS an den WGMS meldet, und zitiert die Berichte wörtlich.`; },
  },
  AT: {
    title: 'Gletscher in Österreich: Liste, Fläche, Rückgang und Messreihen',
    h1: 'Gletscher in Österreich: Inventar, Messreihen und Rückgang',
    lead: () => {
      const [a, b] = [...pagesOf('AT')].sort((x, y) => y.area.km2 - x.area.km2);
      return `Das österreichische Gletscherinventar AGI 5 führt ${n0(sum.AT.n)} Gletscher mit zusammen ${n0(sum.AT.km2)} km² (${refYearsText(sum.AT.refYears)}); ${n0(sum.AT.classA)} davon sind größer als 1 km². Die größten laut AGI 5: ${glacierNames(a).primary} mit ${km2(a.area.km2)} km² (Bezugsjahr ${a.area.refYear}) und ${glacierNames(b).primary} mit ${km2(b.area.km2)} km² (Bezugsjahr ${b.area.refYear}); bei so knappen Abständen und verschiedenen Bezugsjahren entscheidet die Kartierung über die Reihenfolge. Den jährlichen Gletscherbericht gibt der Österreichische Alpenverein heraus.`;
    },
  },
  DE: {
    title: 'Gletscher in Deutschland: Wie viele gibt es noch? (Stand 2025)',
    h1: 'Gletscher in Deutschland: Wie viele gibt es noch?',
    lead: () => {
      const v = (k) => OFFICIAL.get('de-badw-2026-area')?.values?.find((x) => x.key === k)?.value;
      return `Deutschland hat noch vier Gletscher: den Höllentalferner und den Nördlichen Schneeferner an der Zugspitze sowie das Blaueis und den Watzmanngletscher in den Berchtesgadener Alpen. Zusammen maßen sie nach der Bayerischen Akademie der Wissenschaften im Herbst 2025 ${n1(v('ha2025') ?? sum.DE.km2 * 100)} Hektar${v('ha2023') ? `, 2023 waren es ${n1(v('ha2023'))} Hektar` : ''}. Der Südliche Schneeferner gilt seit 2022 nicht mehr als Gletscher.`;
    },
  },
};

/** /gletscher-atlas/<land>/ */
export function renderAtlasCountry(c) {
  const t = COUNTRY_TEXT[c];
  const list = pagesOf(c);
  const regions = [...new Set(ALL.filter((g) => g.country === c).map((g) => g.region))].sort((a, b) => regionLabel(a).localeCompare(regionLabel(b), 'de'));
  const parts = [];
  if (c === 'DE') {
    const rows = list.map((g) => {
      const a = Object.fromEntries((g.areaSeries?.rows ?? []).map((r) => [r[0], r[1]]));
      return [linkOf(g), esc(DE_PLACE[g.id] ?? ''), a[2003] != null ? `${n1(a[2003] * 100)} ha` : '–', a[2023] != null ? `${n1(a[2023] * 100)} ha` : '–', a[2025] != null ? `${n1(a[2025] * 100)} ha` : `${km2(g.area.km2)} km²`, `${n0(g.z[0])}–${n0(g.z[2])} m`];
    });
    parts.push(section('Die vier deutschen Gletscher', `${table(['Gletscher', 'Lage', '2003', '2023', '2025', 'Höhe'], rows)}
        <p class="note">Flächen 2003 aus RGI 6.2, 2023 und 2025 aus der Pressemitteilung der Bayerischen Akademie der Wissenschaften und der Hochschule München vom 19.03.2026. Höhen aus RGI 6.2 (2003).</p>`, 'liste'));
    parts.push(section('Der Südliche Schneeferner', `<p>Bis 2022 zählte auch der Südliche Schneeferner an der Zugspitze zu den deutschen Gletschern. Die Bayerische Akademie der Wissenschaften hat ihn aus dem Beobachtungsnetz genommen:</p>
        ${quoteBlock(DE_SCHNEEFERNER)}`, 'schneeferner'));
  } else {
    for (const r of regions) {
      const rows = list.filter((g) => g.region === r).sort((a, b) => b.area.km2 - a.area.km2);
      const s = sum[r];
      if (!s) continue;
      const more = hasRegionPage(r) ? `<p><a href="${regionPath(r)}">Alle ${n0(regionRows(r).length)} benannten Gletscher ab 0,1 km² in ${esc(regionLabel(r))}</a></p>` : '';
      parts.push(section(regionLabel(r), `<p>${n0(s.n)} Gletscher mit zusammen ${km2(s.km2)} km² (${esc(refYearsText(s.refYears))}).</p>
        ${rows.length ? table(GLACIER_HEAD, rows.map(glacierRow)) : ''}
        ${more}`, regionSlug(r)));
    }
  }
  const off = officialItems((o) => o.scope === c && !o.glacierId);
  if (off.length) parts.push(section('Amtliche Angaben', off.map(quoteBlock).join('\n        '), 'amtlich'));
  parts.push(section('Weitere Länder', `<div class="links">${COUNTRY_ORDER.filter((x) => x !== c).map((x) => `<a href="${countryPath(x)}">Gletscher ${x === 'CH' ? 'in der Schweiz' : `in ${COUNTRY_LABEL[x]}`}</a>`).join('')}<a href="${ATLAS_PATH}">Gletscher-Atlas DACH</a><a href="/gletscher">Gletscher-Karte</a></div>`, 'mehr'));
  const desc = c === 'DE'
    ? 'Deutschland hat noch vier Gletscher: Höllentalferner, Nördlicher Schneeferner, Blaueis, Watzmanngletscher. Flächen 2003, 2023 und 2025 mit Quelle.'
    : `${n0(sum[c].n)} Gletscher ${COUNTRY_IN[c]}: Liste je Region mit Fläche, Höhe, Längen- und Massenreihen, amtliche Angaben im Wortlaut.`;
  return atlasPage({
    path: countryPath(c), updated: latestDate(list), title: t.title, description: desc, h1: t.h1, lead: t.lead(),
    crumbsList: [['Start', '/'], ['Gletscher', '/gletscher'], ['Gletscher-Atlas', ATLAS_PATH], [COUNTRY_LABEL[c], null]],
    body: parts.join('\n'),
  });
}

/** /gletscher-atlas/<land>/<region>/ */
export function renderAtlasRegion(r) {
  const c = GLACIER_REGIONS[r].country;
  const rows = regionRows(r).sort((a, b) => b.area.km2 - a.area.km2);
  const s = sum[r];
  const label = regionLabel(r);
  const top = rows.slice(0, 3).map((g) => `${glacierNames(g).primary} (${km2(g.area.km2)} km²)`);
  const withSeries = rows.filter((g) => g.length || g.mass).length;
  const lead = `${c === 'CH' ? `Die Region ${label}` : `Die Gebirgsgruppe ${label}`} umfasst im Inventar ${n0(s.n)} Gletscher mit zusammen ${km2(s.km2)} km² (${refYearsText(s.refYears)}). ${n0(rows.length)} davon tragen einen Namen und sind größer als 0,1 km²; die größten sind ${top.join(', ')}.${withSeries ? ` Für ${withSeries} gibt es Längen- oder Massenreihen.` : ''}`;
  const body = [
    section(`Alle benannten Gletscher ab 0,1 km²`, `${table(GLACIER_HEAD, rows.map(glacierRow))}
        <p class="note">Verlinkt sind Gletscher mit eigenem Steckbrief (Messreihe oder mehr als 1 km²). Kleinere stehen in der Gletscher-Karte. ${c === 'CH' ? 'Die Einteilung der Schweiz in fünf Regionen ist eine geografische Gliederung von buscosun (nach Lage des Gletscherzentrums), keine amtliche.' : 'Gebirgsgruppen nach dem österreichischen Gletscherinventar.'}</p>`, 'liste'),
    section('Mehr', `<div class="links"><a href="${countryPath(c)}">Gletscher ${c === 'CH' ? 'in der Schweiz' : `in ${COUNTRY_LABEL[c]}`}</a>${ATLAS_REGIONS.filter((x) => x !== r && GLACIER_REGIONS[x].country === c).map((x) => `<a href="${regionPath(x)}">${esc(regionLabel(x))}</a>`).join('')}<a href="/gletscher">Gletscher-Karte</a></div>`, 'mehr'),
  ].join('\n');
  return atlasPage({
    path: regionPath(r), updated: latestDate(rows.filter((g) => g.tier).length ? rows.filter((g) => g.tier) : rows),
    title: `Gletscher ${label} (${COUNTRY_LABEL[c]}): Liste mit Fläche und Messreihen`,
    description: `${n0(rows.length)} benannte Gletscher ${c === 'CH' ? 'der Region' : 'der Gebirgsgruppe'} ${label}: Fläche mit Bezugsjahr, Höhe, Längen- und Massenreihen.`.slice(0, 160),
    h1: c === 'CH' ? `Gletscher der Region ${label}` : `Gletscher: ${label}`,
    lead, body,
    crumbsList: [['Start', '/'], ['Gletscher', '/gletscher'], ['Gletscher-Atlas', ATLAS_PATH], [COUNTRY_LABEL[c], countryPath(c)], [label, null]],
  });
}

/** Alle Atlas-Seiten: [Pfad, HTML, lastmod]. */
export function atlasPages() {
  if (!GLACIER_PAGES || !GLACIER_DATA) return [];
  return [
    [ATLAS_PATH, renderAtlasHub(), atlasUpdated()],
    ...COUNTRY_ORDER.map((c) => [countryPath(c), renderAtlasCountry(c), latestDate(pagesOf(c))]),
    ...ATLAS_REGIONS.map((r) => [regionPath(r), renderAtlasRegion(r), latestDate(regionRows(r))]),
  ];
}

/** Abschnitt für die Shell der Route `/gletscher` (und den Text der App): Atlas, Länder, Leitgletscher. */
export function glacierRouteLinksHtml() {
  if (!GLACIER_PAGES || !PAGE_GLACIERS.length) return '';
  const lead = PAGE_GLACIERS.filter((g) => g.lead).sort((a, b) => b.area.km2 - a.area.km2);
  return `<h2>Gletscher-Atlas und Steckbriefe</h2>
      <p><a href="${ATLAS_PATH}">Gletscher-Atlas DACH</a> · ${COUNTRY_ORDER.map((c) => `<a href="${countryPath(c)}">Gletscher ${c === 'CH' ? 'in der Schweiz' : `in ${COUNTRY_LABEL[c]}`}</a>`).join(' · ')}</p>
      <p>Gletscher mit Messreihe: ${lead.map((g) => linkOf(g)).join(' · ')}</p>`;
}

/** Sitemap-Einträge (Einzelseiten + Atlas) mit lastmod aus den Daten. */
export function glacierSitemapUrls() {
  if (!GLACIER_PAGES || !GLACIER_DATA) return [];
  return [
    ...atlasPages().map(([p, , mod]) => ({ loc: SITE.url + p, pri: '0.6', mod })),
    ...PAGE_GLACIERS.map((g) => ({ loc: SITE.url + glacierPath(g), pri: g.tier === 'A' ? '0.6' : '0.5', mod: g.updated })),
  ];
}
