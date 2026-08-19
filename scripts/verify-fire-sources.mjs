/**
 * Headless-Verifikation „Waldbrand: Datenquellen" (Phase WB2, Gate GWB2).
 *
 *   npm run verify:fire-sources
 *
 * Prüft die ECHTEN Quellmodule (kein Nachbau — V-94-Lehre):
 *   • `src/fire/sources/gwisFwi.ts`       — WMS-URL, TIME, BBOX-Platzhalter
 *   • `src/fire/sources/gwisHotspots.ts`  — Fensterlayer statt EFFIS-Archiv, acq_at in UTC
 *   • `src/fire/sources/bafuFire.ts`      — Fair Use, Simple Requests, valid_from als Referenz
 *   • `src/fire/sources/dwdFireIndex.ts`  — Stationsliste, letzte Zeile, Deckel 60
 *
 * und ergänzt QUELL-SONDEN gegen die Fehler, die diese Phase teuer machen würden:
 *   (a) nirgends der eingefrorene EFFIS-Hotspot-Endpunkt (V-198),
 *   (b) keine Umrechnung zwischen nationalen Skalen,
 *   (c) amtliche Landesstufen laufen NICHT über den durable gecachten /_dwd_grib,
 *   (d) kein `frp` als Darstellungsgröße (V-199),
 *   (e) für `geo.admin.ch` werden keine Request-Header gesetzt (Preflight ⇒ 403).
 *
 * Netzfrei (fetch wird injiziert), dependency-frei.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { verifyGwisFwi, gwisTileUrl, gwisRasterSource } from '../src/fire/sources/gwisFwi.ts';
import { verifyHotspots, hotspotUrl, hotspotTypename } from '../src/fire/sources/gwisHotspots.ts';
import { verifyWfsAxis } from '../src/fire/sources/wfsAxis.ts';
import { verifyBafu, BAFU_DANGER_URL, BAFU_BANS_URL } from '../src/fire/sources/bafuFire.ts';
import { verifySwissProjection } from '../src/fire/sources/swissProjection.ts';
import { verifyEuContext } from '../src/fire/sources/euContext.ts';
import {
  verifyDwdFireIndex, stationsListUrl, stationCsvUrl, STATION_FETCH_CAP,
} from '../src/fire/sources/dwdFireIndex.ts';
import { dayToIsoDate } from '../src/fire/fireTime.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src', 'fire');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// --- (1) Eingebettete Selbstverifikationen ----------------------------------
for (const c of verifyGwisFwi().checks) add(`[gwisFwi] ${c.name}`, c.ok, c.detail);
for (const c of verifyHotspots().checks) add(`[hotspots] ${c.name}`, c.ok, c.detail);
for (const c of verifyWfsAxis().checks) add(`[wfsAxis] ${c.name}`, c.ok, c.detail);
for (const c of (await verifyBafu()).checks) add(`[bafu] ${c.name}`, c.ok, c.detail);
for (const c of verifySwissProjection().checks) add(`[lv95] ${c.name}`, c.ok, c.detail);
for (const c of verifyEuContext().checks) add(`[euContext] ${c.name}`, c.ok, c.detail);
for (const c of (await verifyDwdFireIndex()).checks) add(`[dwdFire] ${c.name}`, c.ok, c.detail);

// --- (2) Unabhängige Kontrollen ---------------------------------------------

// Die Zeitachse kommt aus EINER Quelle — sonst driften WMS und Regler auseinander.
const iso = dayToIsoDate(3, Date.UTC(2026, 7, 14, 23, 30));
add('WMS-TIME wird aus fireTime.dayToIsoDate gespeist (eine Datumsrechnung, L6)',
  gwisTileUrl({ isoDate: iso }).includes(`TIME=${iso}`) && iso === '2026-08-17', iso);

// Die vier Quellen dürfen sich nicht überschneiden.
const hosts = [
  new URL(gwisRasterSource({ isoDate: '2026-08-14' }).tiles[0]).host,
  new URL(hotspotUrl(24)).host,
  new URL(BAFU_DANGER_URL).host,
];
add('drei verschiedene Fremd-Hosts, DWD über den eigenen Rewrite',
  new Set(hosts).size === 2 && stationsListUrl('woodland').startsWith('/_dwd_opendata/'),
  hosts.join(', '));

// --- (3) Quell-Sonden --------------------------------------------------------
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push([p.slice(ROOT.length + 1).replace(/\\/g, '/'), readFileSync(p, 'utf8')]);
  }
};
walk(SRC);
add('Sonde findet die fire-Module', files.length >= 7, `${files.length} Dateien`);

/**
 * Der PRODUKTIVE Code einer Datei: ohne Kommentare **und** ohne die eingebetteten
 * `verify*`-Funktionen.
 *
 * Warum das nötig ist: Die erste Fassung dieser Sonden schlug an zwei Stellen an,
 * und beide Male war der Code richtig und die Sonde falsch — einmal traf sie den
 * Prüf-String `!url.includes('/effis?')` aus der Selbstverifikation, einmal den
 * Doku-Kommentar „…und NICHT über `/_dwd_grib`". Eine Sonde, die korrekten Code
 * anklagt, ist schlimmer als keine: sie erzieht dazu, ihr Urteil zu ignorieren
 * (die Lehre aus V-91).
 */
function productionCode(src) {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Ab der ersten `verify…`-Funktion bis zum Dateiende abschneiden.
  //
  // Klammernzählen wäre hier die naheliegende, aber falsche Lösung: die
  // Signaturen tragen eine Rückgabetyp-Annotation (`: { checks: …[] }`), deren
  // `{` vor dem Rumpf steht — ein Zähler beginnt dort und läuft aus dem Tritt.
  // Genau daran ist die erste Fassung gescheitert.
  //
  // Annahme, die für alle Module dieses Verzeichnisses gilt und die der Check
  // unten absichert: die Selbstverifikation steht am DATEIENDE.
  const i = s.search(/export (?:async )?function verify\w*\s*\(/);
  return i < 0 ? s : s.slice(0, i);
}

// (a) Der eingefrorene EFFIS-**Hotspot**-Bestand darf nirgends als Quelle
//     auftauchen. Präzisiert in WB4: Der EFFIS-Dienst als solcher ist NICHT
//     verboten — für die Brandflächen (`ms:modis.ba.poly`) ist er die einzige
//     Quelle, und dort ist der Archivcharakter beschriftet. Die erste Fassung
//     prüfte auf `/effis?` und hätte damit `euContext.ts` zu Unrecht angeklagt.
//     Verboten ist die Kombination EFFIS-Dienst **und** Hotspot-Typename.
const effisHotspot = files.filter(([, s]) => {
  const code = productionCode(s);
  return /['"`][^'"`]*\/effis\?[^'"`]*(?:viirs|modis|all|noaa)\.hs/.test(code);
}).map(([f]) => f);
add('kein Modul zieht Hotspots vom eingefrorenen EFFIS-Bestand (V-198)',
  effisHotspot.length === 0, effisHotspot.join(', ') || 'keiner');
// Und die Gegenrichtung: die Hotspots MÜSSEN über GWIS laufen. Geprüft wird am
// erzeugten Ergebnis, nicht am Quelltext — die URL entsteht aus einer Konstante
// plus Template, `/gwis?` steht nirgends am Stück da. Eine Textsuche hätte hier
// korrekten Code angeklagt (dieselbe Falle wie schon dreimal in dieser Phase).
add('die gebaute Hotspot-URL zeigt auf den GWIS-Dienst',
  new URL(hotspotUrl(24)).pathname === '/gwis', new URL(hotspotUrl(24)).pathname);

// (b) Keine Umrechnung zwischen den nationalen Skalen.
const conv = files.filter(([, s]) =>
  /function\s+\w*(deToCh|chToDe|toCommonLevel|normali[sz]eLevel|harmoni[sz]e)\w*/i.test(productionCode(s))).map(([f]) => f);
add('keine Umrechnung zwischen DE- und CH-Stufen', conv.length === 0, conv.join(', ') || 'keine');

// (c) Amtliche Landesstufen NICHT über den durable gecachten Grib-Proxy (L1).
add('WBI/GLFI laufen über /_dwd_opendata, nie über /_dwd_grib',
  stationsListUrl('grassland').startsWith('/_dwd_opendata/')
  && stationCsvUrl('woodland', 1).startsWith('/_dwd_opendata/')
  && !files.some(([f, s]) => /dwdFireIndex/.test(f) && /_dwd_grib/.test(productionCode(s))));

// (d) `frp` — die Sonde ist seit Phase F1 QUELLENBEZOGEN, nicht mehr pauschal.
//
//     Ursprünglich (WB2) galt: kein Code liest `frp`, weil GWIS es live nicht
//     liefert (V-199). Seit F1 ist NASA FIRMS die Primärquelle und liefert es
//     tatsächlich — der Layer stellt es dar (`audit/waldbrand-firms.md` §4.1).
//     Die alte Fassung hätte den korrekten neuen Code angeklagt.
//
//     Verboten bleibt genau das, was die Prämisse trug: dass der **GWIS**-Pfad
//     ein `frp` behauptet, das er nicht hat. Der Rückfall auf GWIS darf keine
//     Intensität zeigen, sonst wäre die degradierte Anzeige nicht von der
//     vollwertigen zu unterscheiden.
const gwisSrc = files.find(([f]) => f.endsWith('gwisHotspots.ts'))?.[1] ?? '';
add('gwisHotspots.ts liest kein `frp` — GWIS liefert es live nicht (V-199)',
  gwisSrc !== '' && !/\bfrp\b/.test(productionCode(gwisSrc)));
// Die Gegenrichtung, damit die Sonde nicht durch Wegfall grün wird: die
// Darstellungsgröße muss am FIRMS-Modul hängen.
add('die frp-Darstellung hängt an firmsHotspots.ts (Prämisse von V-199 gilt nur für GWIS)',
  files.some(([f, s]) => f.endsWith('firmsHotspots.ts') && /\bfrp\b/.test(productionCode(s))));

// (e) geo.admin.ch: reine Simple Requests, sonst Preflight ⇒ 403.
const bafuSrc = files.find(([f]) => f.endsWith('bafuFire.ts'))?.[1] ?? '';
const bafuCode = productionCode(bafuSrc);
add('bafuFire.ts setzt keine Request-Header (Preflight ⇒ 403)',
  !/headers\s*:/.test(bafuCode));

// Absicherung der Annahme von `productionCode`: Wenn eine Quelldatei ihre
// Selbstverifikation NICHT am Ende hat, schneidet der Helfer zu viel weg und
// alle Sonden darüber würden falsch grün. Dann muss er repariert werden.
// Maßstab sind die Module, die WIRKLICH etwas abrufen — `swissProjection.ts`
// ist ein reiner Rechenhelfer ohne eigene Quelle und trägt zu Recht keine
// Attribution. Die erste Fassung dieser Sonde hat ihn deswegen angeklagt.
const cutTooMuch = files.filter(([f, s]) =>
  f.includes('/sources/') && /\bfetch\s*\(/.test(productionCode(s))
  && !/_ATTRIBUTION\s*=/.test(productionCode(s))).map(([f]) => f);
add('productionCode schneidet nicht zu viel weg (Attribution bleibt im Produktivteil)',
  cutTooMuch.length === 0, cutTooMuch.join(', ') || 'keine');
add('bafuFire.ts kennt beide Collections',
  bafuSrc.includes('gefahren-waldbrand_warnung') && bafuSrc.includes('praeventionsmassnahmen'));

// Der Deckel steht als Konstante da, nicht als Zufallszahl im Fluss.
add('Stations-Deckel ist benannt und liegt bei 60', STATION_FETCH_CAP === 60, String(STATION_FETCH_CAP));

// Fensterlayer: der ungefensterte Typename ist zu langsam für den Ladepfad.
add('nur .today/.week als Typename, nie der ungefensterte Layer',
  /\.today$/.test(hotspotTypename(24)) && /\.week$/.test(hotspotTypename(168)));

// Jedes Modul, das eine Fremdquelle ABRUFT, bringt ihre Attribution mit —
// sonst fehlt sie in der Zeile. Reine Rechenhelfer sind ausgenommen.
for (const [f, s] of files.filter(([f]) => f.includes('/sources/'))) {
  if (!/\bfetch\s*\(/.test(productionCode(s))) continue;
  add(`${f.split('/').pop()} führt eine Attribution`, /_ATTRIBUTION\s*=/.test(s));
}

// --- Ausgabe ----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
