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

import { verifyPlaceSlug, toSlug, deSlugName, isSlugShape } from '../src/share/placeSlug.ts';
import { verifyShareSchema, SHARE_URL_SOFT_MAX, SHARE_URL_HARD_MAX } from '../src/share/shareSchema.ts';
import { verifyShareText } from '../src/share/shareText.ts';
import { verifyShareTargets, shareTargets, shareTarget } from '../src/share/shareTargets.ts';
import { placeBySlug, slugForPlace, PLACE_TABLE_SIZE } from '../src/share/placeTable.ts';
import {
  buildShareUrl, parseShareUrl, describeShareUrl, canonicalShareKey, SHARE_ROUTES,
} from '../src/share/shareAdapters.ts';
import { verifyUrlState } from '../src/router/urlState.ts';
import { routeForPath, SITE_URL } from '../src/router/routes.ts';

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

const NOW = Date.UTC(2026, 8, 12, 12, 0);
const T15 = Date.UTC(2026, 8, 12, 15, 0);

// --- (1) Eingebettete Selbstverifikationen ----------------------------------
for (const c of verifyPlaceSlug().checks) add(`[placeSlug] ${c.name}`, c.ok, c.detail);
for (const c of verifyShareSchema().checks) add(`[schema] ${c.name}`, c.ok, c.detail);
for (const c of verifyShareText().checks) add(`[text] ${c.name}`, c.ok, c.detail);
for (const c of verifyShareTargets().checks) add(`[targets] ${c.name}`, c.ok, c.detail);
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
  add('[robust] fremde Route ⇒ null (kein halber Zustand)', parseShareUrl('/globus', '', NOW) === null);
}

// --- (9) Pfade sind echte Routen ---------------------------------------------
for (const [name, { u }] of built) {
  const m = routeForPath(u.path.split('?')[0]);
  add(`[route] ${name}: der erzeugte Pfad ist eine bekannte Route`, !!m, u.path);
}
add('[route] alle drei SH1-Seiten sind abgedeckt', SHARE_ROUTES.join(',') === 'wetterkarte,warnungen,regenradar');

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
