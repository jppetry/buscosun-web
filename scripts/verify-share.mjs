/**
 * Headless-Verifikation „Auswahl teilen" (Phase SH1, Gate GSH1).
 *
 *   npm run verify:share
 *
 * Importiert die ECHTEN Module (`src/share/*`, `src/router/urlState.ts`,
 * `src/router/routes.ts`) — kein Nachbau. Netzfrei, dependency-frei.
 *
 * Geprüft wird, was Jan zugesagt bekommen hat:
 *   (1) Rundlauf — Zustand → URL → Zustand ergibt denselben Zustand;
 *   (2) Standard-Stille — der Standardzustand erzeugt einen blanken Pfad;
 *   (3) Lesbarkeit — Prozentanteil, Vokabular, keine Kürzel ohne Bedeutung;
 *   (4) Länge — Zielgröße 500, harte Grenze 1500, und ein Wort statt stiller Kürzung;
 *   (5) Kanäle — genau EINMAL kodiert (Rundlauf über den Standard-Parser);
 *   (6) Diagnose-Schalter und Tracking-Parameter verlassen den Link;
 *   (7) der kanonische Cache-Schlüssel ist stabil gegen Rauschen.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

import { verifyPlaceSlug, toSlug, deSlugName, isSlugShape } from '../src/share/placeSlug.ts';
import { verifyShareSchema, SHARE_URL_SOFT_MAX, SHARE_URL_HARD_MAX } from '../src/share/shareSchema.ts';
import { verifyShareText, formatWhen, formatDay } from '../src/share/shareText.ts';
import { verifyShareTargets, shareTargets, shareTarget } from '../src/share/shareTargets.ts';
import { verifyShareOpen, shareSnapshot, previewUrl, PREVIEW_FULL_MAX } from '../src/share/shareOpen.ts';
// SH3: Waldbrand + Atmosphaere ziehen vom Fragment in die Query.
import { verifyAtmosphereUrl, parseAtmosphereQuery } from '../src/atmosphere/atmosphereUrl.ts';
import { verifyFireUrl, parseFireQuery } from '../src/fire/fireUrl.ts';
import { verifyGlobeUrl, parseGlobeQuery } from '../src/globe/globeUrl.ts';
import { verifyHistoryUrl } from '../src/history/historyUrl.ts';
import { verifyEventUrl } from '../src/event/eventUrl.ts';
import { verifyForecastUrl } from '../src/confidence/forecastUrl.ts';
import { verifyTourUrl } from '../src/route/tourUrl.ts';
import { placeBySlug, slugForPlace, resolveRoutePlace, PLACE_TABLE_SIZE } from '../src/share/placeTable.ts';
import {
  buildShareUrl, parseShareUrl, describeShareUrl, canonicalShareKey, ogCardForShare,
  SHARE_ROUTES, SHARE_FEATURE_LABEL,
} from '../src/share/shareAdapters.ts';
import { verifyUrlState, parseMapSearch, LAYER_SLUGS } from '../src/router/urlState.ts';
import { routeForPath, SITE_URL, ROUTES, ROUTE_BY_ID } from '../src/router/routes.ts';
// SH6: Vorschaubild je Seite + Meta je Zustand.
import { verifyOgCard, ogCardSlug, ogCardPath, hasOgCard, OG_WIDTH, OG_HEIGHT } from '../src/share/ogCard.ts';
import { buildEdgeShare, OUT as EDGE_BUNDLE } from './build-edge-share.mjs';
import { routeHeadExtras, subRouteHeadExtras } from './seo/content.mjs';

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

const NOW = Date.UTC(2026, 8, 12, 12, 0);
const T15 = Date.UTC(2026, 8, 12, 15, 0);

// --- (1) Eingebettete Selbstverifikationen ----------------------------------
for (const c of verifyPlaceSlug().checks) add(`[placeSlug] ${c.name}`, c.ok, c.detail);
for (const c of verifyShareSchema().checks) add(`[schema] ${c.name}`, c.ok, c.detail);
for (const c of verifyShareText().checks) add(`[text] ${c.name}`, c.ok, c.detail);
for (const c of verifyShareTargets().checks) add(`[targets] ${c.name}`, c.ok, c.detail);
for (const c of verifyShareOpen().checks) add(`[open] ${c.name}`, c.ok, c.detail);
for (const c of verifyAtmosphereUrl().checks) add(`[atmUrl] ${c.name}`, c.ok, c.detail);
for (const c of verifyFireUrl().checks) add(`[fireUrl] ${c.name}`, c.ok, c.detail);
for (const c of verifyGlobeUrl().checks) add(`[globeUrl] ${c.name}`, c.ok, c.detail);
for (const c of verifyHistoryUrl().checks) add(`[histUrl] ${c.name}`, c.ok, c.detail);
for (const c of verifyEventUrl().checks) add(`[eventUrl] ${c.name}`, c.ok, c.detail);
for (const c of verifyForecastUrl().checks) add(`[fcUrl] ${c.name}`, c.ok, c.detail);
for (const c of verifyTourUrl().checks) add(`[tourUrl] ${c.name}`, c.ok, c.detail);
for (const c of verifyUrlState().checks) add(`[urlState] ${c.name}`, c.ok, c.detail);

// --- (2) Die Beispiele aus dem Plan (audit/teilen-share.md §3) ---------------
const MUC = placeBySlug('muenchen');
const FELDBERG = placeBySlug('feldberg-schwarzwald');
const WIEN = placeBySlug('wien');
add('[tabelle] München, Feldberg (Schwarzwald) und Wien stehen in der Ortstabelle',
  !!MUC && !!FELDBERG && !!WIEN, `${PLACE_TABLE_SIZE} Orte`);

/** Ein Zustand, wie ihn die Seite hätte. */
const state = (over = {}) => ({
  routeId: 'wetterkarte', place: null, layers: ['wind'], primary: 'wind',
  cam: null, validAtMs: null, extra: [], ...over,
});

const CASES = [
  ['Wetterkarte, Tabellenort, Zusatzlayer und Zeit',
    state({ place: MUC, layers: ['wind', 'gust'], primary: 'wind', validAtMs: T15, cam: { lat: 48.1374, lon: 11.5755, zoom: 9.5 } })],
  ['Wetterkarte, freier Ort',
    state({ place: { name: 'Zastler Loch', lat: 47.8901, lon: 8.0102, country: 'DE' }, primary: 'gust', layers: ['gust'], validAtMs: T15 })],
  ['Wetterkarte, DACH-Überblick ohne Ort',
    state({ primary: 'temp', layers: ['temp'], cam: { lat: 50.2, lon: 10.5, zoom: 6 }, validAtMs: Date.UTC(2026, 8, 13, 6, 0) })],
  ['Warnungen mit Ort', state({ routeId: 'warnungen', primary: 'warnings', layers: ['warnings'], place: MUC })],
  ['Regenradar mit Ort und Kamera',
    state({ routeId: 'regenradar', primary: null, layers: [], place: MUC, cam: { lat: 48.1374, lon: 11.5755, zoom: 8 } })],
  ['Regenradar, Ort in Österreich', state({ routeId: 'regenradar', primary: null, layers: [], place: WIEN })],
];

const built = new Map();
for (const [name, s] of CASES) {
  const u = buildShareUrl(s, SITE_URL, NOW);
  built.set(name, { s, u });
}

// --- (3) Lesbarkeit ----------------------------------------------------------
for (const [name, { u }] of built) {
  const pct = (u.url.match(/%/g) ?? []).length;
  add(`[lesbar] ${name}: höchstens 2 Prozentzeichen (nur echte Sonderzeichen)`, pct <= 2, `${pct} in ${u.url}`);
  add(`[lesbar] ${name}: keine unnötig kodierten : , ( )`, !/%3A|%2C|%28|%29/i.test(u.url), u.url);
  add(`[lesbar] ${name}: kein + als Leerzeichen`, !u.url.includes('+'), u.url);
  const q = u.path.includes('?') ? u.path.slice(u.path.indexOf('?') + 1) : '';
  const keys = q ? q.split('&').map((kv) => kv.split('=')[0]) : [];
  add(`[lesbar] ${name}: jeder Schlüssel steht im Vokabular`,
    keys.every((k) => ['lat', 'lon', 'z', 't', 'l', 'modell', 'mode', 'radar', 'ort', 'olat', 'olon', 'land', 'v'].includes(k)), keys.join(','));
}
add('[lesbar] Tabellenort braucht KEINE ort/olat/olon-Gruppe',
  !built.get('Wetterkarte, Tabellenort, Zusatzlayer und Zeit').u.url.includes('olat='),
  built.get('Wetterkarte, Tabellenort, Zusatzlayer und Zeit').u.url);
add('[lesbar] freier Ort trägt Slug im Pfad UND Koordinate in der Query',
  (() => { const x = built.get('Wetterkarte, freier Ort').u; return x.path.startsWith('/wetterkarte/boeen/zastler-loch') && x.url.includes('olat=47.8901'); })(),
  built.get('Wetterkarte, freier Ort').u.path);
add('[lesbar] Zeit steht absolut und roh in der URL',
  built.get('Wetterkarte, Tabellenort, Zusatzlayer und Zeit').u.url.includes('t=2026-09-12T15:00Z'));

// --- (4) Länge ---------------------------------------------------------------
for (const [name, { u }] of built) {
  add(`[laenge] ${name}: unter der Zielgröße ${SHARE_URL_SOFT_MAX}`, u.url.length <= SHARE_URL_SOFT_MAX, `${u.url.length}`);
  add(`[laenge] ${name}: Urteil ok`, u.verdict === 'ok', u.verdict);
}
{
  // Der gemessene Worst Case der Wetterkarte: freier Ort + alle 18 Zusatzlayer.
  const all = ['wind', 'gust', 'nowcast', 'temp', 'clouds', 'sat', 'lightning', 'lightningfc', 'stations',
    'confidence', 'snowline', 'flownowcast', 'poprob', 'thunder', 'snow', 'rotation', 'cells', 'hail', 'warnings'];
  const worst = buildShareUrl(state({
    place: { name: 'Feldberg (Schwarzwald)', lat: 47.8744, lon: 8.0043, country: 'DE' },
    layers: all, primary: 'wind', validAtMs: T15, cam: { lat: 47.8744, lon: 8.0043, zoom: 9.5 },
    model: 'icon-eu', point: 'native', radar: false,
  }), SITE_URL, NOW);
  add('[laenge] Worst Case Wetterkarte bleibt unter der harten Grenze', worst.url.length <= SHARE_URL_HARD_MAX, `${worst.url.length}`);
  add('[laenge] Worst Case Wetterkarte bleibt sogar unter der Zielgröße', worst.url.length <= SHARE_URL_SOFT_MAX, `${worst.url.length}`);
  add('[laenge] Worst Case wird als „ok" gemeldet, nicht gekürzt', worst.verdict === 'ok' && worst.url.includes('hagel'), worst.verdict);
}
{
  // Und die Gegenprobe: eine wirklich zu lange URL wird GEMELDET, nicht abgeschnitten.
  const many = Array.from({ length: 60 }, (_, i) => [`x${i}`, 'y'.repeat(30)]);
  const long = buildShareUrl(state({ extra: many }), SITE_URL, NOW);
  add('[laenge] zu lange URL ⇒ Urteil „too-long", Inhalt bleibt vollständig',
    long.verdict === 'too-long' && long.url.length > SHARE_URL_HARD_MAX && long.url.includes('x59'), `${long.url.length}`);
}

// --- (5) Rundlauf ------------------------------------------------------------
const sameCoord = (a, b) => a == null && b == null || (a != null && b != null && Math.abs(a - b) < 1e-4);
for (const [name, { s, u }] of built) {
  const q = u.path.includes('?') ? u.path.slice(u.path.indexOf('?')) : '';
  const back = parseShareUrl(u.path.split('?')[0], q, NOW);
  add(`[rundlauf] ${name}: Route erkannt`, back?.routeId === s.routeId, back?.routeId);
  add(`[rundlauf] ${name}: Ort identisch`,
    (!s.place && !back?.place) || (!!back?.place && back.place.name === s.place.name
      && sameCoord(back.place.lat, s.place.lat) && sameCoord(back.place.lon, s.place.lon)
      && back.place.country === s.place.country),
    `${back?.place?.name ?? '—'} ${back?.place?.lat ?? ''}`);
  add(`[rundlauf] ${name}: Layer identisch`, (back?.layers ?? []).join(',') === s.layers.join(','), (back?.layers ?? []).join(','));
  add(`[rundlauf] ${name}: Zeit identisch (10-min-Raster)`,
    (s.validAtMs == null && back?.validAtMs == null) || Math.abs((back?.validAtMs ?? 0) - s.validAtMs) <= 600_000,
    `${back?.validAtMs ?? '—'}`);
  add(`[rundlauf] ${name}: Kamera identisch`,
    (!s.cam && !back?.cam) || (!!back?.cam && sameCoord(back.cam.lat, s.cam.lat) && sameCoord(back.cam.lon, s.cam.lon) && Math.abs(back.cam.zoom - s.cam.zoom) < 0.06));
  // Und der harte Teil: aus dem zurückgelesenen Zustand entsteht DIESELBE URL.
  add(`[rundlauf] ${name}: URL ist ein Fixpunkt`, buildShareUrl(back, SITE_URL, NOW).url === u.url,
    `${buildShareUrl(back, SITE_URL, NOW).url} vs ${u.url}`);
}

// --- (6) Standard-Stille -----------------------------------------------------
add('[still] Wetterkarte im Standard ⇒ blanker Pfad',
  buildShareUrl(state(), SITE_URL, NOW).path === '/wetterkarte/wind', buildShareUrl(state(), SITE_URL, NOW).path);
add('[still] Regenradar im Standard ⇒ blanker Pfad',
  buildShareUrl(state({ routeId: 'regenradar', primary: null, layers: [] }), SITE_URL, NOW).path === '/regenradar');
add('[still] Warnungen im Standard ⇒ blanker Pfad',
  buildShareUrl(state({ routeId: 'warnungen', primary: 'warnings', layers: ['warnings'] }), SITE_URL, NOW).path === '/warnungen');
add('[still] „jetzt" schreibt kein t', !buildShareUrl(state({ validAtMs: NOW }), SITE_URL, NOW).url.includes('t='));
add('[still] v=1 wird nicht geschrieben', !buildShareUrl(state(), SITE_URL, NOW).url.includes('v='));

// --- (7) Diagnose-Schalter und Tracking verlassen den Link -------------------
{
  const dirty = buildShareUrl(state({ extra: [['lz', '0'], ['radarcdn', '0'], ['utm_source', 'wa'], ['fbclid', 'x'], ['ansicht', 'inversion']] }), SITE_URL, NOW);
  add('[sauber] Kill-Switches sind raus', !/[?&](lz|radarcdn)=/.test(dirty.url), dirty.url);
  add('[sauber] Tracking-Parameter sind raus', !/utm_|fbclid/.test(dirty.url), dirty.url);
  add('[sauber] fachliche Fremdschlüssel bleiben erhalten', dirty.url.includes('ansicht=inversion'), dirty.url);
  // Auch beim LESEN: ein manipulierter Link soll die App nicht drosseln.
  const back = parseShareUrl('/wetterkarte/wind', '?lz=0&utm_source=x&ansicht=inversion', NOW);
  add('[sauber] auch beim Lesen werden Kill-Switches nicht weitergetragen',
    back.extra.map(([k]) => k).join(',') === 'ansicht', back.extra.map(([k]) => k).join(','));
}

// --- (8) Robustheit gegen kaputte Links --------------------------------------
{
  const cases = [
    ['unbekannter Ort-Slug', '/wetterkarte/wind/gibtsnicht', ''],
    ['unbekannter Parameter', '/wetterkarte/wind', '?bla=1&z=abc'],
    ['Zeit unlesbar', '/wetterkarte/wind', '?t=gestern'],
    ['Koordinate unmöglich', '/wetterkarte/wind', '?olat=999&olon=0&ort=X'],
    ['leere Query', '/regenradar', ''],
    ['doppelte Schlüssel', '/wetterkarte/wind', '?z=8&z=9'],
  ];
  for (const [name, path, search] of cases) {
    let ok = true, detail = '';
    try {
      const st = parseShareUrl(path, search, NOW);
      ok = st !== null && Array.isArray(st.layers);
      detail = st ? `${st.routeId}/${st.place?.name ?? '—'}` : 'null';
    } catch (e) { ok = false; detail = String(e); }
    add(`[robust] ${name}: kein Wurf, brauchbarer Zustand`, ok, detail);
  }
  add('[robust] unbekannter Ort-Slug wird gemeldet, statt still zu verschwinden',
    parseShareUrl('/wetterkarte/wind/gibtsnicht', '', NOW).placeUnresolved === true);
  add('[robust] alter Link mit vergangener Zeit wird gemeldet (V-SH-2)',
    parseShareUrl('/wetterkarte/wind', '?t=2026-09-12T09:00Z', NOW).timePast === true);
  add('[robust] nicht teilbare Route ⇒ null (kein halber Zustand)', parseShareUrl('/tourenplanung', '', NOW) === null);
}

// --- (9) Pfade sind echte Routen ---------------------------------------------
for (const [name, { u }] of built) {
  const m = routeForPath(u.path.split('?')[0]);
  add(`[route] ${name}: der erzeugte Pfad ist eine bekannte Route`, !!m, u.path);
}
add('[route] alle acht teilbaren Seiten sind abgedeckt (SH1 + SH3 + SH4 + SH5)', SHARE_ROUTES.join(',') === 'wetterkarte,warnungen,regenradar,waldbrand,atmosphaere,eventplanung,wetterarchiv,globus,vorhersage', SHARE_ROUTES.join(','));

// --- (10) Worte --------------------------------------------------------------
{
  const u = built.get('Wetterkarte, Tabellenort, Zusatzlayer und Zeit').u;
  add('[worte] Titel nennt Ansicht, Ort, Layer und Zeit',
    u.copy.title.startsWith('Wetterkarte München — Wind, ') && /\d{2}:\d{2}$/.test(u.copy.title), u.copy.title);
  add('[worte] Beschreibung ist die Layer-Beschreibung (≤ 160 Zeichen, SEO-tauglich)',
    u.copy.description.length <= 160 && u.copy.description.includes('ICON-D2'), `${u.copy.description.length}`);
  add('[worte] Nachricht = Titel + Link', u.message === `${u.copy.title}\n${u.url}`);
  add('[worte] derselbe Text entsteht aus dem blanken Link (EIN Parser, auch für die OG-Meta)',
    describeShareUrl(u.path.split('?')[0], u.path.includes('?') ? u.path.slice(u.path.indexOf('?')) : '', NOW).title === u.copy.title);
}

// --- (11) Kanäle mit einer echten geteilten URL ------------------------------
{
  const u = built.get('Wetterkarte, freier Ort').u;
  const input = { url: u.url, title: u.copy.title, description: u.copy.description, message: u.message };
  const wa = shareTarget('whatsapp', input, false);
  add('[kanal] WhatsApp: Rundlauf über den Standard-Parser ist zeichengleich',
    new URL(wa.href).searchParams.get('text') === u.message);
  add('[kanal] die geteilte URL steckt unverfälscht im Ziel-Link',
    new URL(wa.href).searchParams.get('text').includes(u.url));
  add('[kanal] alle vier Ziele stehen bereit', shareTargets(input, false).length === 4);
  add('[kanal] mobil bekommt WhatsApp das App-Schema',
    shareTargets(input, true).find((t) => t.channel === 'whatsapp').href.startsWith('whatsapp://'));
}

// --- (12) Kanonischer Cache-Schlüssel (SH6) ----------------------------------
{
  const a = parseShareUrl('/wetterkarte/wind/muenchen', '?l=boeen&z=9.5&t=2026-09-12T15:00Z', NOW);
  const b = parseShareUrl('/wetterkarte/wind/muenchen', '?t=2026-09-12T15:40Z&z=9.54&l=boeen&bla=1', NOW);
  add('[cachekey] Zoom-Rauschen, Schlüsselreihenfolge und Fremdparameter erzeugen KEINEN zweiten Schlüssel',
    canonicalShareKey(a) === canonicalShareKey(b), `${canonicalShareKey(a)} vs ${canonicalShareKey(b)}`);
  const c = parseShareUrl('/wetterkarte/temperatur/muenchen', '', NOW);
  add('[cachekey] ein anderer Layer ergibt einen anderen Schlüssel', canonicalShareKey(a) !== canonicalShareKey(c));
  const d = parseShareUrl('/wetterkarte/wind/muenchen', '?l=boeen&t=2026-09-12T17:00Z', NOW);
  add('[cachekey] eine andere Stunde ergibt einen anderen Schlüssel', canonicalShareKey(a) !== canonicalShareKey(d));
  add('[cachekey] Schlüssel enthält keine Sonderzeichen, die einen Dateinamen sprengen',
    /^[A-Za-z0-9|:,.\-+]+$/.test(canonicalShareKey(a)), canonicalShareKey(a));
}

// --- (13) Ort-Slug: Regel und Tabelle ----------------------------------------
add('[ort] Slug der Tabelle ist verlustfrei rückauflösbar',
  placeBySlug('muenchen').name === 'München' && placeBySlug('feldberg-schwarzwald').name === 'Feldberg (Schwarzwald)');
add('[ort] Slugregel und Tabelle passen zusammen', toSlug('München') === 'muenchen' && isSlugShape('feldberg-schwarzwald'));
add('[ort] Notname aus dem Slug, wenn nichts anderes da ist', deSlugName('bad-reichenhall') === 'Bad Reichenhall');
add('[ort] ein Punkt weit neben dem Ortszentrum bleibt ein eigener Punkt',
  slugForPlace({ name: 'München', lat: 48.30, lon: 11.5755, country: 'DE' }).inTable === false);
add('[ort] ein Ort im falschen Land ist kein Tabellentreffer',
  slugForPlace({ name: 'München', lat: 48.137, lon: 11.575, country: 'AT' }).inTable === false);

// --- (14) Ort: Pfad + Query → EIN Ort ----------------------------------------
add('[ort] Tabellenslug allein genügt',
  (() => { const r = resolveRoutePlace('muenchen', null); return r.inTable && r.place?.name === 'München' && !r.unresolved; })());
add('[ort] Query-Koordinate gewinnt gegen das Ortszentrum',
  (() => { const r = resolveRoutePlace('muenchen', { name: '', lat: 48.15, lon: 11.6, country: 'DE' }); return r.place?.lat === 48.15 && r.place.name === 'München' && !r.inTable; })());
add('[ort] Name aus dem Slug, wenn weder ort= noch Tabelle',
  (() => { const r = resolveRoutePlace('bad-reichenhall-nord', { name: '', lat: 47.7, lon: 12.9, country: 'DE' }); return r.place?.name === 'Bad Reichenhall Nord'; })());
add('[ort] unauflösbarer Slug ⇒ kein Ort, kein Wurf, aber gemeldet',
  (() => { const r = resolveRoutePlace('gibtsnicht', null); return r.place === null && r.unresolved && r.slug === 'gibtsnicht'; })());
add('[ort] kaputtes Segment wird gar nicht erst als Slug gelesen',
  (() => { const r = resolveRoutePlace('Nicht Ein Slug', null); return r.slug === null && !r.unresolved; })());

// --- (15) SH2: was der Knopf beim Klick liefert ------------------------------
{
  const origin = 'https://buscosun.com';
  // Der Schnappschuss kommt aus der ADRESSZEILE, nicht aus Props — also muss er
  // fuer jeden gebauten Link denselben Link wieder ergeben (Fixpunkt).
  for (const [name, { u }] of built) {
    const snap = shareSnapshot({ origin, pathname: u.path.split('?')[0], search: u.path.includes('?') ? u.path.slice(u.path.indexOf('?')) : '' }, NOW);
    add(`[open] ${name}: Schnappschuss ist ein Fixpunkt`, !!snap && snap.url === u.url, `${snap?.url} vs ${u.url}`);
    add(`[open] ${name}: Vorschau zeigt die URL vollstaendig oder mittig gekuerzt`,
      !!snap && (previewUrl(snap.url) === snap.url || (previewUrl(snap.url).length === PREVIEW_FULL_MAX && previewUrl(snap.url).includes('…'))),
      previewUrl(snap?.url ?? ''));
  }
  // Die Vorschau darf den Anfang NIE abschneiden — die Domain ist der Vertrauensanker.
  const longSnap = shareSnapshot({ origin, pathname: '/wetterkarte/wind/feldberg-schwarzwald', search: '?ort=Feldberg%20(Schwarzwald)&olat=47.8744&olon=8.0043&t=2026-09-12T15:00Z&lat=47.8744&lon=8.0043&z=9.5' }, NOW);
  add('[open] gekuerzte Vorschau beginnt immer mit der Domain',
    previewUrl(longSnap.url).startsWith('https://buscosun.com/'), previewUrl(longSnap.url));
}

// --- (16) SH3: Waldbrand + Atmosphäre teilen ---------------------------------
{
  const O = SITE_URL;

  // Brandradar: Sicht im Pfad, Zustand in der Query — kein Fragment mehr.
  const wb = parseShareUrl('/waldbrand/aktive-braende', '?fenster=7t&reiter=anomalien', NOW);
  add('[SH3] Waldbrand wird als teilbar erkannt', wb?.routeId === 'waldbrand' && wb.viewSlug === 'aktive-braende');
  const wbUrl = buildShareUrl(wb, O, NOW);
  add('[SH3] Waldbrand-Link bleibt Pfad + Query, unverändert lesbar',
    wbUrl.url === O + '/waldbrand/aktive-braende?fenster=7t&reiter=anomalien', wbUrl.url);
  add('[SH3] Waldbrand-Titel nennt Brandradar und die Sicht',
    wbUrl.copy.title === 'Brandradar — Aktive Brände', wbUrl.copy.title);
  add('[SH3] Waldbrand-Beschreibung kommt aus der EINEN Routen-Tabelle',
    wbUrl.copy.description.includes('FIRMS') || wbUrl.copy.description.includes('EFFIS'), wbUrl.copy.description.slice(0, 60));
  add('[SH3] Waldbrand-Link ist ein Fixpunkt',
    buildShareUrl(parseShareUrl('/waldbrand/aktive-braende', '?fenster=7t&reiter=anomalien', NOW), O, NOW).url === wbUrl.url);
  add('[SH3] Waldbrand: Kill-Switches verlassen den Link',
    !buildShareUrl(parseShareUrl('/waldbrand/historie', '?bh=0&zeitraum=monat&utm_source=x', NOW), O, NOW).url.match(/bh=|utm_/));
  add('[SH3] Waldbrand: kein Ortssegment (die Seite hat keine Ortswahl)',
    parseShareUrl('/waldbrand/aktive-braende', '', NOW).place === null);

  // Atmosphäre: Linse im Pfad, Ort als Slug, Zeit absolut.
  const atm = parseShareUrl('/atmosphaere/querschnitt/innsbruck', '?t=2026-09-13T00:00Z&nerd=1&land=at', NOW);
  add('[SH3] Atmosphäre wird als teilbar erkannt', atm?.routeId === 'atmosphaere' && atm.viewSlug === 'querschnitt');
  add('[SH3] Atmosphäre löst den Ort aus dem Pfad auf', atm.place?.name === 'Innsbruck' && atm.place.country === 'AT');
  add('[SH3] Atmosphäre liest die absolute Zeit', atm.validAtMs === Date.UTC(2026, 8, 13, 0, 0));
  const atmUrl = buildShareUrl(atm, O, NOW);
  add('[SH3] Atmosphäre-Link bleibt lesbar',
    atmUrl.url === O + '/atmosphaere/querschnitt/innsbruck?t=2026-09-13T00:00Z&nerd=1&land=at', atmUrl.url);
  add('[SH3] Atmosphäre-Titel nennt Ansicht, Ort, Linse und Zeit',
    atmUrl.copy.title.startsWith('Atmosphäre Innsbruck — Querschnitt, '), atmUrl.copy.title);
  add('[SH3] Atmosphäre-Link ist ein Fixpunkt',
    buildShareUrl(parseShareUrl('/atmosphaere/querschnitt/innsbruck', '?t=2026-09-13T00:00Z&nerd=1&land=at', NOW), O, NOW).url === atmUrl.url);

  // Lesbarkeit und Länge auch hier.
  for (const [name, u] of [['Waldbrand', wbUrl], ['Atmosphäre', atmUrl]]) {
    add(`[SH3] ${name}: höchstens 2 Prozentzeichen`, (u.url.match(/%/g) ?? []).length <= 2, u.url);
    add(`[SH3] ${name}: unter der Zielgröße`, u.url.length <= SHARE_URL_SOFT_MAX, String(u.url.length));
    add(`[SH3] ${name}: der Pfad ist eine bekannte Route`, !!routeForPath(u.path.split('?')[0]), u.path);
  }

  // Ein alter Zeitpunkt wird auch hier gemeldet (V-SH-2).
  add('[SH3] vergangener Zeitpunkt wird gemeldet',
    parseShareUrl('/atmosphaere/berg-und-weg', '?t=2026-09-12T09:00Z', NOW).timePast === true);

  // Cache-Schlüssel unterscheidet die Sichten.
  add('[SH3] Cache-Schlüssel trennt die Sichten',
    canonicalShareKey(parseShareUrl('/waldbrand/trockenheit', '', NOW)) !== canonicalShareKey(parseShareUrl('/waldbrand/historie', '', NOW)));
}

// --- (17) SH4: Event, Wetterarchiv, Globus teilen ----------------------------
{
  const O = SITE_URL;

  // Eventplanung: Anlass im Pfad, Ort als Slug, Zeitraum lesbar.
  const ev = parseShareUrl('/eventplanung/hochzeit/konstanz', '?von=2026-09-18&bis=2026-09-25', NOW);
  add('[SH4] Event wird als teilbar erkannt', ev?.routeId === 'eventplanung' && ev.viewSlug === 'hochzeit');
  add('[SH4] Event löst den Ort aus dem Pfad auf', ev.place?.name === 'Konstanz');
  const evUrl = buildShareUrl(ev, O, NOW);
  add('[SH4] Event-Link bleibt lesbar',
    evUrl.url === O + '/eventplanung/hochzeit/konstanz?von=2026-09-18&bis=2026-09-25', evUrl.url);
  add('[SH4] Event-Titel nennt Anlass und Ort',
    evUrl.copy.title === 'Event-Planung Konstanz — Hochzeit', evUrl.copy.title);
  add('[SH4] Event-Link ist deutlich kürzer als der alte Hash (340 Zeichen)', evUrl.url.length < 120, String(evUrl.url.length));

  // Wetterarchiv: der Ort steht DIREKT hinter der Route, es gibt keine Sicht.
  const hi = parseShareUrl('/wetterarchiv/stuttgart', '?groesse=tmax&diagramm=kenntage', NOW);
  add('[SH4] Wetterarchiv wird als teilbar erkannt', hi?.routeId === 'wetterarchiv');
  add('[SH4] Wetterarchiv: Segment 1 ist der ORT, keine Sicht',
    hi.place?.name === 'Stuttgart' && hi.viewSlug === null, `${hi.place?.name} / ${hi.viewSlug}`);
  const hiUrl = buildShareUrl(hi, O, NOW);
  add('[SH4] Wetterarchiv-Link bleibt lesbar',
    hiUrl.url === O + '/wetterarchiv/stuttgart?groesse=tmax&diagramm=kenntage', hiUrl.url);
  add('[SH4] Wetterarchiv-Titel nennt den Ort', hiUrl.copy.title === 'Wetterarchiv Stuttgart', hiUrl.copy.title);

  // Globus: kein Ort, aber absolute Zeit und gerade Achsen.
  const gl = parseShareUrl('/globus', '?feld=wind&t=2026-09-13T12:00Z&pin=48.14,11.58', NOW);
  add('[SH4] Globus wird als teilbar erkannt', gl?.routeId === 'globus' && gl.place === null);
  add('[SH4] Globus liest die absolute Zeit', gl.validAtMs === Date.UTC(2026, 8, 13, 12, 0));
  const glUrl = buildShareUrl(gl, O, NOW);
  add('[SH4] Globus-Link bleibt lesbar',
    glUrl.url === O + '/globus?feld=wind&t=2026-09-13T12:00Z&pin=48.14,11.58', glUrl.url);
  add('[SH4] Globus-Titel nennt die Zeit', /^Globus — /.test(glUrl.copy.title), glUrl.copy.title);

  for (const [name, u] of [['Event', evUrl], ['Wetterarchiv', hiUrl], ['Globus', glUrl]]) {
    add(`[SH4] ${name}: höchstens 2 Prozentzeichen`, (u.url.match(/%/g) ?? []).length <= 2, u.url);
    add(`[SH4] ${name}: unter der Zielgröße`, u.url.length <= SHARE_URL_SOFT_MAX, String(u.url.length));
    add(`[SH4] ${name}: der Pfad ist eine bekannte Route`, !!routeForPath(u.path.split('?')[0]), u.path);
    add(`[SH4] ${name}: Link ist ein Fixpunkt`,
      buildShareUrl(parseShareUrl(u.path.split('?')[0], u.path.includes('?') ? u.path.slice(u.path.indexOf('?')) : '', NOW), O, NOW).url === u.url);
  }

  add('[SH4] Kill-Switches verlassen auch diese Links',
    !buildShareUrl(parseShareUrl('/wetterarchiv/stuttgart', '?embed=1&groesse=tmax', NOW), O, NOW).url.includes('embed='));

  // Acht teilbare Seiten, eine bewusst nicht.
  add('[SH4] die Tourenplanung bleibt nicht teilbar (eine GPX passt in keine URL)',
    parseShareUrl('/tourenplanung', '', NOW) === null && parseShareUrl('/tourenplanung/3d', '', NOW) === null);
  add('[SH4] jede teilbare Route hat einen Kurznamen',
    SHARE_ROUTES.every((r) => !!SHARE_FEATURE_LABEL[r]), SHARE_ROUTES.filter((r) => !SHARE_FEATURE_LABEL[r]).join(','));
}

// --- (18) SH5: Vorhersage teilbar, Tourenplanung bewusst nicht ---------------
{
  const O = SITE_URL;

  const fc = parseShareUrl('/vorhersage/stuttgart', '?tag=2026-09-14&groesse=regen', NOW);
  add('[SH5] Vorhersage wird als teilbar erkannt', fc?.routeId === 'vorhersage');
  add('[SH5] Vorhersage: Segment 1 ist der ORT, keine Sicht',
    fc.place?.name === 'Stuttgart' && fc.viewSlug === null, `${fc.place?.name} / ${fc.viewSlug}`);
  const fcUrl = buildShareUrl(fc, O, NOW);
  add('[SH5] Vorhersage-Link bleibt lesbar',
    fcUrl.url === O + '/vorhersage/stuttgart?tag=2026-09-14&groesse=regen', fcUrl.url);
  add('[SH5] Vorhersage-Titel nennt den Ort', fcUrl.copy.title === 'Vorhersage Stuttgart', fcUrl.copy.title);
  add('[SH5] Vorhersage-Link ist ein Fixpunkt',
    buildShareUrl(parseShareUrl('/vorhersage/stuttgart', '?tag=2026-09-14&groesse=regen', NOW), O, NOW).url === fcUrl.url);
  add('[SH5] Vorhersage: höchstens 2 Prozentzeichen und unter der Zielgröße',
    (fcUrl.url.match(/%/g) ?? []).length <= 2 && fcUrl.url.length <= SHARE_URL_SOFT_MAX, fcUrl.url);
  add('[SH5] Vorhersage: der Pfad ist eine bekannte Route', !!routeForPath(fcUrl.path.split('?')[0]));

  // Die Tourenplanung bleibt bewusst draußen (E-4) — beide Sichten.
  add('[SH5] Tourenplanung liefert KEINEN Schnappschuss (die Strecke passt in keine URL)',
    parseShareUrl('/tourenplanung', '?art=gravel', NOW) === null
    && parseShareUrl('/tourenplanung/3d', '?art=gravel&start=2026-09-13T07:30Z', NOW) === null);
  add('[SH5] und steht deshalb auch nicht in SHARE_ROUTES',
    !SHARE_ROUTES.some((r) => String(r) === 'tourenplanung'));
}

// --- (19) SH6: Vorschaubild je Seite, Vorschau-Meta je Zustand ---------------
{
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const c of verifyOgCard().checks) add(`[ogCard] ${c.name}`, c.ok, c.detail);

  // (a) Zu jeder App-Seite gehört genau eine Karte — und zu jeder Karte eine Seite.
  const expected = new Set();
  for (const r of ROUTES) {
    if (!hasOgCard(r.id)) continue;
    expected.add(ogCardSlug(r.id));
    for (const s of r.subs ?? []) {
      if (r.id === 'wetterkarte' && s.slug === 'warnungen') continue; // Cross-Alias auf /warnungen
      expected.add(ogCardSlug(r.id, s.slug));
    }
  }
  const cardDir = join(ROOT, 'public', 'og', 'app');
  const onDisk = new Set(readdirSync(cardDir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)));
  const missing = [...expected].filter((s) => !onDisk.has(s));
  const orphan = [...onDisk].filter((s) => !expected.has(s));
  add('[SH6] jede App-Route und jede Sub-Route hat ihre Karte', missing.length === 0, missing.join(', '));
  add('[SH6] keine Karte ohne Seite (Slug-Umbenennung fällt auf)', orphan.length === 0, orphan.join(', '));
  add('[SH6] die Zahl der Karten stimmt mit der Routen-Tabelle überein',
    expected.size === onDisk.size, `Tabelle ${expected.size} · Platte ${onDisk.size}`);

  // (b) Jede Karte ist wirklich ein PNG in 1200×630 (IHDR statt Dateiname glauben).
  const badSize = [];
  for (const slug of onDisk) {
    const buf = readFileSync(join(cardDir, `${slug}.png`));
    const png = buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    if (!png || w !== OG_WIDTH || h !== OG_HEIGHT) badSize.push(`${slug} ${w}×${h}`);
  }
  add(`[SH6] alle ${onDisk.size} Karten sind PNG ${OG_WIDTH}×${OG_HEIGHT}`, badSize.length === 0, badSize.join(', '));

  // (c) Für JEDEN teilbaren Zustand zeigt `ogCardForShare` auf eine Datei, die es gibt.
  const probes = [];
  for (const r of ROUTES) {
    if (!SHARE_ROUTES.includes(r.id)) continue;
    probes.push([r.path, '']);
    for (const s of r.subs ?? []) probes.push([`${r.path}/${s.slug}`, '']);
  }
  for (const key of Object.keys(LAYER_SLUGS)) probes.push(['/wetterkarte', `?l=${LAYER_SLUGS[key]}`]);
  const cardMiss = [];
  for (const [p, q] of probes) {
    const st = parseShareUrl(p, q, NOW);
    if (!st) { cardMiss.push(`${p}${q} ⇒ kein Zustand`); continue; }
    const card = ogCardForShare(st);
    if (!card || !onDisk.has(card.replace('/og/app/', '').replace('.png', ''))) cardMiss.push(`${p}${q} ⇒ ${card}`);
  }
  add(`[SH6] alle ${probes.length} Zustände treffen eine vorhandene Karte`, cardMiss.length === 0, cardMiss.slice(0, 3).join(' · '));
  add('[SH6] die Wetterkarte nimmt die Karte ihres Hauptlayers',
    ogCardForShare(parseShareUrl('/wetterkarte/wind/muenchen', '', NOW)) === '/og/app/wetterkarte-wind.png');
  // Die Alt-Form ohne Pfadsegment benennt KEINEN Hauptlayer (`l=` trägt nur die
  // zusätzlichen) — dann ist die Karte der Route die richtige Aussage.
  add('[SH6] Alt-Form `?l=…` ohne Pfadsegment ⇒ Karte der Route',
    ogCardForShare(parseShareUrl('/wetterkarte', `?l=${LAYER_SLUGS.warnings}`, NOW)) === '/og/app/wetterkarte.png'
    && ogCardForShare(parseShareUrl('/wetterkarte', '?l=wind,stationen', NOW)) === '/og/app/wetterkarte.png');
  add('[SH6] der Pfad `/wetterkarte/warnungen` nimmt die Warn-Karte (Cross-Alias, keine eigene)',
    ogCardForShare(parseShareUrl('/wetterkarte/warnungen', '', NOW)) === '/og/app/warnungen.png');
  add('[SH6] die Start-Route hat keine App-Karte (sie behält /og/home.png)', ogCardPath('home') === null);

  // (d) Der Ort-Fehler, den SH6 gefunden hat: `Number(null)` ist 0, nicht NaN.
  const stPlace = parseShareUrl('/vorhersage/stuttgart', '', NOW);
  add('[SH6] Ortssegment ohne olat/olon ⇒ echte Koordinaten aus der Tabelle, kein 0°/0°',
    Math.abs(stPlace.place.lat - 48.776) < 0.01 && Math.abs(stPlace.place.lon - 9.183) < 0.01,
    JSON.stringify(stPlace.place));
  add('[SH6] … und der Cache-Schlüssel nennt den Ort, nicht den Atlantik',
    canonicalShareKey(stPlace) === 'vorhersage|o:stuttgart', canonicalShareKey(stPlace));

  // (d2) Die geteilte Zeit ist absolut — auf die Minute, nicht auf das
  //      10-Minuten-Raster der Slider-Stunde (gefunden an der echten
  //      Crawler-Antwort: aus 15:00Z wurde „15:59").
  {
    const t = Date.UTC(2027, 0, 8, 15, 0);
    // Ein „jetzt", das NICHT auf dem 10-Minuten-Raster liegt — genau der Fall,
    // in dem der Umweg über die Stunde die Minute verlor.
    const oddNow = Date.UTC(2027, 0, 8, 10, 59, 37, 123);
    const st = parseShareUrl('/wetterkarte/wind/muenchen', '?t=2027-01-08T15:00Z', oddNow);
    add('[SH6] `t=` wird auf die Minute genau gelesen (kein Raster-Versatz)',
      st.validAtMs === t, `${new Date(st.validAtMs).toISOString()} statt ${new Date(t).toISOString()}`);
    add('[SH6] … und der Text nennt die deutsche Uhrzeit, nicht UTC',
      describeShareUrl('/wetterkarte/wind/muenchen', '?t=2027-01-08T15:00Z', oddNow, 'Europe/Berlin')
        .title.includes('16:00'),
      describeShareUrl('/wetterkarte/wind/muenchen', '?t=2027-01-08T15:00Z', oddNow, 'Europe/Berlin').title);
    add('[SH6] Sommerzeit wird mitgerechnet (Juli: UTC+2)',
      describeShareUrl('/wetterkarte/wind/muenchen', '?t=2027-07-08T13:00Z', Date.UTC(2027, 6, 8, 9, 0), 'Europe/Berlin')
        .title.includes('15:00'),
      describeShareUrl('/wetterkarte/wind/muenchen', '?t=2027-07-08T13:00Z', Date.UTC(2027, 6, 8, 9, 0), 'Europe/Berlin').title);
  }

  // (e) Das Edge-Bündel ist DERSELBE Parser — und aktuell.
  const built = await buildEdgeShare();
  add('[SH6] das Edge-Bündel ist gebaut', existsSync(EDGE_BUNDLE));
  add('[SH6] das Edge-Bündel passt Byte für Byte zur Quelle (`npm run edge:share`)',
    existsSync(EDGE_BUNDLE) && readFileSync(EDGE_BUNDLE, 'utf8') === built);

  // (f) Die Edge Function selbst — gegen eine ECHTE Shell aus dem Generator.
  const shellHead = routeHeadExtras(ROUTE_BY_ID.wetterkarte);
  const shell = `<!doctype html>\n<html lang="de">\n  <head>\n    <title>x</title>\n    ${shellHead}\n  </head>\n  <body></body>\n</html>`;
  add('[SH6] die Shell trägt genau ein og:title und ein og:image (Form, die die Function erwartet)',
    (shellHead.match(/property="og:title"/g) ?? []).length === 1
    && (shellHead.match(/property="og:image"/g) ?? []).length === 1);
  add('[SH6] die Route-Shell zeigt schon ohne Function auf ihre eigene Karte',
    shellHead.includes(`${SITE_URL}/og/app/wetterkarte.png`));
  add('[SH6] die Sub-Routen-Shell zeigt auf die Karte ihrer Sicht',
    subRouteHeadExtras(ROUTE_BY_ID.waldbrand, ROUTE_BY_ID.waldbrand.subs[0])
      .includes(`${SITE_URL}/og/app/waldbrand-${ROUTE_BY_ID.waldbrand.subs[0].slug}.png`));

  const ogMeta = (await import('../netlify/edge-functions/og-meta.ts')).default;
  const nextWith = (html) => ({
    next: async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
  });
  const shareUrl = 'https://buscosun.com/wetterkarte/wind/muenchen?t=2027-01-08T15:00Z';
  const asCrawler = new Request(shareUrl, { headers: { 'user-agent': 'WhatsApp/2.24.1 A' } });
  const asHuman = new Request(shareUrl, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1' } });

  const human = await ogMeta(asHuman, nextWith(shell));
  add('[SH6] ein Browser bekommt `undefined` ⇒ Netlify liefert die Shell unverändert', human === undefined);

  const res = await ogMeta(asCrawler, nextWith(shell));
  const out = res ? await res.text() : '';
  add('[SH6] ein Crawler bekommt 200 und HTML', !!res && res.status === 200);
  add('[SH6] og:title nennt Seite, Ort und Thema',
    /property="og:title" content="Wetterkarte München — Wind[^"]*\| buscosun"/.test(out),
    (out.match(/property="og:title" content="([^"]*)"/) ?? [])[1]);
  add('[SH6] og:image ist die Karte des Layers, nicht die der Route',
    out.includes(`property="og:image" content="${SITE_URL}/og/app/wetterkarte-wind.png"`));
  add('[SH6] og:url trägt den vollständigen Zustand (mit Query)',
    out.includes(`property="og:url" content="${shareUrl.replace('https://buscosun.com', SITE_URL)}"`));
  add('[SH6] twitter:card bleibt summary_large_image', out.includes('name="twitter:card" content="summary_large_image"'));
  add('[SH6] og:image:width/height stehen dabei (WhatsApp lädt sonst manchmal nichts)',
    out.includes('property="og:image:width" content="1200"') && out.includes('property="og:image:height" content="630"'));
  add('[SH6] kein Tag doppelt', (out.match(/property="og:title"/g) ?? []).length === 1
    && (out.match(/property="og:image"/g) ?? []).length === 1);
  add('[SH6] der Rest der Shell bleibt unangetastet (canonical, JSON-LD, Feed)',
    out.includes('rel="canonical"') && out.includes('application/ld+json') && out.includes('/feed.xml'));
  add('[SH6] die Antwort nennt den kanonischen Schlüssel als Beleg',
    (res?.headers.get('x-buscosun-og') ?? '').startsWith('wetterkarte|l:wind|o:muenchen|t:'),
    res?.headers.get('x-buscosun-og'));
  add('[SH6] sie variiert ausdrücklich nach User-Agent und wird nicht durable gecacht',
    res?.headers.get('vary') === 'User-Agent' && !res?.headers.get('netlify-cdn-cache-control'));

  // (g) Robustheit: kaputte Query, fremde Route, Nicht-HTML.
  const broken = await ogMeta(new Request('https://buscosun.com/wetterkarte/wind?t=morgen&z=viel', { headers: { 'user-agent': 'Twitterbot/1.0' } }), nextWith(shell));
  add('[SH6] eine kaputte Query kostet keine Antwort', !!broken && (await broken.text()).includes('og:title'));
  const foreign = await ogMeta(new Request('https://buscosun.com/wissen/foehn/', { headers: { 'user-agent': 'Slackbot 1.0' } }), nextWith(shell));
  add('[SH6] eine nicht teilbare Seite bleibt unverändert', (await foreign.text()) === shell);
  const notHtml = await ogMeta(asCrawler, {
    next: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  add('[SH6] Nicht-HTML wird nicht angefasst', (await notHtml.text()) === '{}');

  // (h) Die Sichten der Durchreiche-Seiten kommen im Titel an.
  const fire = await ogMeta(new Request('https://buscosun.com/waldbrand/historie?fenster=7t', { headers: { 'user-agent': 'facebookexternalhit/1.1' } }), nextWith(shell));
  const fireOut = await fire.text();
  add('[SH6] Brandradar: Sicht im Titel, eigene Karte',
    /content="Brandradar — Historie \| buscosun"/.test(fireOut)
    && fireOut.includes('/og/app/waldbrand-historie.png'),
    (fireOut.match(/property="og:title" content="([^"]*)"/) ?? [])[1]);
}

// --- (20) V-SH-2: der Hinweis auf der Empfängerseite -------------------------
{
  // Die vier Parser, die eine geteilte Zeit lesen können. Jeder muss nicht nur
  // MELDEN, dass sie vorbei ist, sondern auch sagen, WELCHE es war — sonst kann
  // der Hinweis den Zeitpunkt nicht nennen und bleibt eine Behauptung.
  const t0 = Date.UTC(2026, 8, 12, 12, 0);
  const past = Date.UTC(2026, 8, 12, 9, 0);
  const future = Date.UTC(2026, 8, 12, 15, 0);

  const cases = [
    ['Wetterkarte', (t) => parseMapSearch(`?t=${new Date(t).toISOString().slice(0, 16)}Z`, t0),
      (r) => [!!r.timePast, r.timePast ? (r.wantedAtMs ?? null) : null]],
    ['Atmosphäre', (t) => parseAtmosphereQuery(`?t=${new Date(t).toISOString().slice(0, 16)}Z`, t0),
      (r) => [r.timePast, r.timePast ? r.wantedAtMs : null]],
    ['Waldbrand', (t) => parseFireQuery('gefahrenindex', `?t=${new Date(t).toISOString().slice(0, 16)}Z`, t0),
      (r) => [r.timePast, r.timePast ? r.wantedAtMs : null]],
  ];
  for (const [name, parse, read] of cases) {
    const [flagPast, msPast] = read(parse(past));
    const [flagFut, msFut] = read(parse(future));
    add(`[V-SH-2] ${name}: vergangene Zeit wird gemeldet UND benannt`,
      flagPast === true && msPast === past, `${flagPast} / ${msPast}`);
    add(`[V-SH-2] ${name}: künftige Zeit meldet nichts und benennt nichts`,
      flagFut === false && (msFut === null || msFut === undefined), `${flagFut} / ${msFut}`);
  }
  // Der Globus hat eine Stunde Kulanz (der Lauf liegt zurück) — dieselbe Regel,
  // andere Schwelle; deshalb ein eigener Fall statt einer Ausnahme oben.
  {
    const g = parseGlobeQuery('?t=2026-09-12T09:00Z', t0);
    add('[V-SH-2] Globus: vergangene Zeit wird gemeldet UND benannt',
      g.timePast === true && g.wantedAtMs === past, `${g.timePast} / ${g.wantedAtMs}`);
    const fresh = parseGlobeQuery('?t=2026-09-12T11:30Z', t0);
    add('[V-SH-2] Globus: innerhalb der Stunde Kulanz ist nichts vorbei',
      fresh.timePast === false && fresh.wantedAtMs === Date.UTC(2026, 8, 12, 11, 30));
    add('[V-SH-13] jeder Parser nennt den verlangten Zeitpunkt auch, wenn er KUENFTIG ist',
      [parseMapSearch('?t=2026-09-12T15:00Z', t0), parseAtmosphereQuery('?t=2026-09-12T15:00Z', t0),
        parseFireQuery('gefahrenindex', '?t=2026-09-12T15:00Z', t0), parseGlobeQuery('?t=2026-09-12T15:00Z', t0)]
        .every((r) => !r.timePast && r.wantedAtMs === future));
  }
  add('[V-SH-2] Flag und Zeitpunkt können nicht auseinanderlaufen (Äquivalenz über alle vier)',
    [parseMapSearch('?t=2026-09-12T09:00Z', t0), parseAtmosphereQuery('?t=2026-09-12T09:00Z', t0),
      parseFireQuery('gefahrenindex', '?t=2026-09-12T09:00Z', t0), parseGlobeQuery('?t=2026-09-12T09:00Z', t0)]
      .every((r) => !!r.timePast && r.wantedAtMs != null));

  // Die Waldbrand-Tagesachse: ein DATUM ohne Uhrzeit ⇒ der Hinweis nennt den Tag.
  const day = parseFireQuery('gefahrenindex', '?t=2026-09-10', t0);
  add('[V-SH-2] Waldbrand: ein vergangener TAG wird als Tag benannt',
    day.timePast && day.wantedAtMs === Date.UTC(2026, 8, 10) && day.hourly === false);
  add('[V-SH-2] Waldbrand: heute ist nicht vorbei (der ganze Tag zählt)',
    parseFireQuery('gefahrenindex', '?t=2026-09-12', t0).timePast === false);

  // Die Wortwahl des Hinweises kommt aus DENSELBEN Formatierern wie das Sheet.
  add('[V-SH-2] formatWhen nennt Wochentag, Datum und Uhrzeit',
    /^\w{2,3}\.? \d{2}\.\d{2}\. \d{2}:\d{2}$/.test(formatWhen(past, 'de', 'Europe/Berlin') ?? ''),
    formatWhen(past, 'de', 'Europe/Berlin'));
  add('[V-SH-2] formatDay nennt Wochentag und Datum — und KEINE erfundene Uhrzeit',
    /^\w{2,3}\.? \d{2}\.\d{2}\.$/.test(formatDay(Date.UTC(2026, 8, 10), 'de', 'Europe/Berlin') ?? ''),
    formatDay(Date.UTC(2026, 8, 10), 'de', 'Europe/Berlin'));
  add('[V-SH-2] beide liefern null statt Unsinn, wenn es nichts zu nennen gibt',
    formatWhen(null) === null && formatDay(null) === null && formatDay(Number.NaN) === null);

  // Der Hinweis steht in den LAZY Seiten-Chunks, nicht im Start-Chunk.
  const dist = join(join(dirname(fileURLToPath(import.meta.url)), '..'), 'dist', 'assets');
  if (existsSync(dist)) {
    const eager = readdirSync(dist).filter((f) => /^index-.*\.js$/.test(f));
    const inEager = eager.some((f) => readFileSync(join(dist, f), 'utf8').includes('Geteilter Zeitpunkt'));
    add('[V-SH-2] der Hinweis liegt NICHT im Start-Chunk (Textsonde am Bundle)', !inEager);
  }
}

// --- (21) V-SH-13: ein Link mit Stunde ist kein Erstbild ---------------------
//
// Der Befund war NICHT „der Horizont ist zu kurz", sondern: der Erstbild-Modus
// `START_NOW_ONLY` baut eine Zeitbasis von drei Stunden, und jeder geteilte
// Zeitpunkt jenseits davon wurde still auf +2 h geklemmt — dauerhaft, obwohl
// die Daten da waren (`?startnow=0` brachte denselben Link korrekt an).
// Geprüft wird deshalb am Quelltext, dass (1) die verlangte Stunde das Fenster
// aufspannt, (2) das Erstbild ohne `t=` unberührt bleibt, (3) eine ECHTE
// Kürzung gemeldet statt still vollzogen wird.
{
  const ROOT2 = join(dirname(fileURLToPath(import.meta.url)), '..');
  const map = readFileSync(join(ROOT2, 'src', 'MapView.tsx'), 'utf8');
  const wrap = readFileSync(join(ROOT2, 'src', 'router', 'pages', 'WetterkarteRoute.tsx'), 'utf8');
  const notice = readFileSync(join(ROOT2, 'src', 'share', 'StaleLinkNotice.tsx'), 'utf8');

  add('[V-SH-13] das Vorhersagefenster startet auf der verlangten Stunde',
    /const forecastAheadHRef = useRef\(Math\.max\(0, Math\.ceil\(initialHour \?\? 0\)\)\)/.test(map));
  add('[V-SH-13] die Zeitbasis wird lang, wenn der Link über das Jetzt-Fenster hinaus verlangt',
    /const sharedAhead = Math\.max\(0, initialHour \?\? 0\) > NOWONLY_AHEAD_H;/.test(map)
    && /START_NOW_ONLY && !embedded && !sharedAhead\) \? NOWONLY_AHEAD_H \+ 1 : FORECAST_HOURS/.test(map));
  add('[V-SH-13] … und bleibt ohne `t=` genau die alte (Erstbild unberührt, LZ1)',
    map.includes('NOWONLY_AHEAD_H + 1 : FORECAST_HOURS')
    && !/const sliderHours = FORECAST_HOURS/.test(map));
  add('[V-SH-13] eine echte Kürzung wird gemerkt und gemeldet',
    /clampedRef\.current = true; setForecastHour\(sliderMax\)/.test(map)
    && /onHourChange\?\.\(forecastHour, clamped \? 'clamped' : undefined\)/.test(map));
  add('[V-SH-13] die Meldung ist Teil des Vertrags, nicht ein Zufall',
    /onHourChange\?: \(hour: number, reason\?: 'clamped'\) => void;/.test(map));
  add('[V-SH-13] das Flag wird nach dem Melden zurückgesetzt (kein Nachhall)',
    /const clamped = clampedRef\.current;\s*\n\s*clampedRef\.current = false;/.test(map));

  add('[V-SH-13] der Wrapper zählt NUR die erste Meldung nach dem Ankommen',
    /const first = !arrivalDoneRef\.current;/.test(wrap) && /arrivalDoneRef\.current = true;/.test(wrap));
  add('[V-SH-13] … und nur, wenn der Link überhaupt eine Stunde verlangt hat',
    /wantedHourRef\.current > h \+ 0\.15/.test(wrap));
  add('[V-SH-13] der Hinweis bekommt den VERLANGTEN Zeitpunkt, nicht die Schieber-Stunde',
    /setHorizonAt\(wanted\)/.test(wrap) && wrap.includes('st.current!.wantedAtMs'));
  add('[V-SH-13] beide Gründe hängen an derselben Anzeige (kein zweiter Hinweis-Baustein)',
    (wrap.match(/<StaleLinkNotice/g) ?? []).length === 2 && wrap.includes('reason="horizon"'));

  add('[V-SH-13] der Horizont-Hinweis nennt KEINE Ersatzzeit (die Schieber-Stunde ist nicht die Gültigkeitszeit)',
    notice.includes('Angezeigt wird das Ende des Zeitfensters') && !notice.includes('insteadAt'));
  add('[V-SH-13] und er unterscheidet die zwei Gründe',
    /reason\?: 'past' \| 'horizon'/.test(notice) && /reason === 'horizon'/.test(notice));
  add('[V-SH-13] der Hinweis nimmt einen NACHGELIEFERTEN Zeitpunkt an (die Kürzung kommt nach dem ersten Render)',
    /if \(captured\.current != null \|\| at == null\) return;/.test(notice));
}

// --- Ausgabe -----------------------------------------------------------------
const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  if (!c.ok) console.log(`  ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
}
console.log(`\n  ${checks.length - failed.length}/${checks.length} passed, ${failed.length} failed`);
if (failed.length) process.exitCode = 1;

// `join`/`dirname`/`fileURLToPath` bleiben importiert, damit der Harnisch später
// (SH6) ohne Umbau auf Dateien im Repo zugreifen kann.
void join; void dirname; void fileURLToPath;
