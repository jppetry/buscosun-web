/**
 * Headless-Verifikation „fireHotspots auf NASA FIRMS" (Phase F1, Gate GWBF1).
 *
 *   npm run verify:fire-firms
 *
 * Prüft das ECHTE Quellmodul `src/fire/sources/firmsHotspots.ts` (kein Nachbau
 * — V-94-Lehre) über seine eingebettete Selbstverifikation und ergänzt
 * unabhängige Sonden gegen die Fehler, die genau diese Phase teuer machen:
 *
 *   (a) der MAP_KEY darf in KEINER Quelldatei stehen — auch nicht als Beispiel,
 *   (b) der Client spricht nur `/_firms/*`, nie `firms.modaps.eosdis.nasa.gov`,
 *   (c) aus `frp` wird NIE eine Fläche in Hektar abgeleitet (Leistung ≠ Fläche),
 *   (d) die Edge Function verrät bei keinem Fehlerpfad den Schlüssel,
 *   (e) die Schutzregeln des Proxys greifen (Whitelist, DACH-Hülle, Tagesspanne).
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyFirms, firmsUrl, windowPlan, parseFirmsCsv, acqToUtcMs, FIXTURE_CSV,
  MAX_DAY_RANGE, MAX_FEATURES, FIRMS_SOURCES,
} from '../src/fire/sources/firmsHotspots.ts';
import { parseFirmsPath, resolveFirmsUrl } from '../netlify/edge-functions/firms.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// --- (1) Eingebettete Selbstverifikation -------------------------------------
for (const c of verifyFirms().checks) add(`[firms] ${c.name}`, c.ok, c.detail);

// --- (2) Quellsonden ----------------------------------------------------------
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|mjs)$/.test(e.name)) {
      files.push([p.slice(ROOT.length + 1).replace(/\\/g, '/'), readFileSync(p, 'utf8')]);
    }
  }
};
walk(join(ROOT, 'src'));
walk(join(ROOT, 'netlify'));
walk(join(ROOT, 'scripts'));

// (a) DER Sicherheitsanker dieser Phase. NASAs Schlüssel sind 32 Zeichen aus
//     [0-9a-z] — gesucht wird eine solche Zeichenkette in der Nähe von „firms"
//     oder „map_key". Eine reine 32-Hex-Suche würde Hashes und Chunk-Namen
//     treffen und damit korrekten Code anklagen (die Lehre aus V-91).
const keyLike = files.filter(([, s]) => {
  const m = s.match(/[^0-9a-z]([0-9a-z]{32})[^0-9a-z]/g) ?? [];
  if (m.length === 0) return false;
  return /firms|map_?key/i.test(s);
}).map(([f]) => f);
add('kein 32-stelliger Schlüssel-Kandidat in einer FIRMS-nahen Quelldatei',
  keyLike.length === 0, keyLike.join(', ') || 'keiner');

add('MAP_KEY steht nirgends im Repo als Zuweisung',
  !files.some(([, s]) => /FIRMS_MAP_KEY\s*=\s*['"`][0-9a-z]{10,}/i.test(s)));

// (b) Der Client darf den Upstream nicht direkt ANSPRECHEN — sonst wäre der
//     Schlüssel entweder im Bundle oder die Anfrage schlägt fehl.
//
//     Der Host darf dabei sehr wohl vorkommen: die Attribution verlinkt ihn,
//     und das ist Lizenzpflicht. Gesucht ist deshalb nicht der Host, sondern
//     der Host **außerhalb eines `href`** — dieselbe Sorgfalt wie bei V-91,
//     sonst klagt die Sonde die korrekte Quellenangabe an.
const withoutLinks = (s) => stripComments(s).replace(/href="[^"]*"/g, 'href=""');
const direct = files.filter(([f, s]) =>
  f.startsWith('src/') && /firms\.modaps\.eosdis\.nasa\.gov/.test(withoutLinks(s)))
  .map(([f]) => f);
add('kein src/-Modul spricht firms.modaps.eosdis.nasa.gov direkt an',
  direct.length === 0, direct.join(', ') || 'keins');
add('die gebaute URL zeigt auf /_firms/', firmsUrl(FIRMS_SOURCES[0], { days: 1, date: null }).startsWith('/_firms/'));

// (c) Leistung ist keine Fläche. Gesucht wird eine Rechnung, die `frp` mit
//     Hektar/Fläche verknüpft.
const haFromFrp = files.filter(([f, s]) => {
  if (!f.startsWith('src/fire/')) return false;
  const code = stripComments(s);
  return /\bfrp\b[^\n]{0,60}(hektar|\bha\b|areaHa|flaeche|fläche)/i.test(code)
    || /(hektar|areaHa|\bha\b)[^\n]{0,60}\bfrp\b/i.test(code);
}).map(([f]) => f);
add('aus frp wird nirgends eine Fläche in Hektar abgeleitet (Leistung ≠ Fläche)',
  haFromFrp.length === 0, haFromFrp.join(', ') || 'keine');

// (d) Die Edge Function darf im Fehlerfall nichts vom Upstream durchreichen.
const edge = readFileSync(join(ROOT, 'netlify', 'edge-functions', 'firms.ts'), 'utf8');
add('Edge Function gibt kein String(err) an den Client (URL trägt den Schlüssel)',
  !/String\(\s*err/.test(stripComments(edge)));
add('Edge Function liest den Schlüssel aus der Umgebung, nicht aus einer Konstante',
  /FIRMS_MAP_KEY/.test(edge) && !/['"`][0-9a-z]{32}['"`]/.test(edge));
add('Edge Function cacht Fehlantworten nicht durable',
  /no-store/.test(edge) && /durable/.test(edge));

// (e) Die Schutzregeln des Proxys — am echten Modul, nicht am Text.
const U = (p) => `https://buscosun.com${p}`;
const KEY = 'a'.repeat(32);
add('[proxy] world-BBox wird abgelehnt',
  parseFirmsPath(U('/_firms/VIIRS_SNPP_NRT/-180,-90,180,90/1')) === null);
add('[proxy] Europa-BBox wird abgelehnt',
  parseFirmsPath(U('/_firms/VIIRS_SNPP_NRT/-25,34,45,72/1')) === null);
add('[proxy] MODIS ist nicht freigegeben',
  parseFirmsPath(U('/_firms/MODIS_NRT/5.5,45.5,17.5,55.5/1')) === null);
add('[proxy] vertauschte lat,lon-BBox (GWIS-Form) fällt durch',
  parseFirmsPath(U('/_firms/VIIRS_SNPP_NRT/45.5,5.5,55.5,17.5/1')) === null);
add('[proxy] days über der API-Grenze fällt durch',
  parseFirmsPath(U(`/_firms/VIIRS_SNPP_NRT/5.5,45.5,17.5,55.5/${MAX_DAY_RANGE + 1}`)) === null);
add('[proxy] Traversal fällt durch',
  parseFirmsPath(U('/_firms/VIIRS_SNPP_NRT/5.5,45.5,17.5,55.5/1/../../etc')) === null);
add('[proxy] Schlüssel falscher Form ⇒ keine URL',
  resolveFirmsUrl(U('/_firms/VIIRS_SNPP_NRT/5.5,45.5,17.5,55.5/1'), 'kurz') === null);

// Der Vertrag zwischen Client und Proxy: JEDE vom Client gebaute URL muss die
// Prüfung des Proxys bestehen. Ohne diesen Check könnten beide Seiten
// auseinanderlaufen und der Layer stünde in Produktion auf 400.
const now = Date.UTC(2026, 7, 14, 12, 0);
const built = [];
for (const src of FIRMS_SOURCES) {
  for (const wh of [24, 168]) {
    for (const chunk of windowPlan(wh, now)) built.push(firmsUrl(src, chunk));
  }
}
const rejected = built.filter((u) => parseFirmsPath(U(u)) === null);
add('JEDE vom Client gebaute URL besteht die Prüfung des Proxys',
  rejected.length === 0, rejected.join(' | ') || `${built.length} URLs geprüft`);

// Und die Gegenrichtung: der Client baut nie mehr Tage, als die API erlaubt.
add('Client fordert nie mehr als die API-Grenze an',
  windowPlan(168, now).every((c) => c.days <= MAX_DAY_RANGE));

// --- (3) Unabhängige Kontrollen ------------------------------------------------

// Die Zeitlesart noch einmal gegen eine ECHTE Antwortzeile, unabhängig von der
// Selbstverifikation: 4.707 Detektionen der F0-Sonde waren mit padStart(4,'0')
// ausnahmslos gültig, und Nacht/Tag traf die Überflugfenster.
const parsed = parseFirmsCsv(FIXTURE_CSV, 'VIIRS_SNPP_NRT');
add('Fixture stammt aus einer echten Antwort (14 Spalten, instrument dabei)',
  parsed.header.length === 14 && parsed.header[8] === 'instrument', parsed.header[8]);
add('Nachtdetektion 33 landet um 00:33 UTC, nicht um 03:30',
  new Date(parsed.rows[0].acqMs).toISOString() === '2026-08-14T00:33:00.000Z',
  new Date(parsed.rows[0].acqMs).toISOString());
add('Tagdetektion 1230 landet um 12:30 UTC',
  new Date(parsed.rows[3].acqMs).toISOString() === '2026-08-14T12:30:00.000Z');
add('acqToUtcMs kennt keine lokale Zeitzone',
  acqToUtcMs('2026-01-15', '1200') === Date.UTC(2026, 0, 15, 12, 0)
  && acqToUtcMs('2026-07-15', '1200') === Date.UTC(2026, 6, 15, 12, 0));

// Der Deckel steht als benannte Konstante da und liegt über dem Normalfall
// (5 Tage × 3 Satelliten = 4.707 gemessen, 7 Tage ≈ 6.600).
add('Feature-Deckel ist benannt und liegt über dem gemessenen Normalfall',
  MAX_FEATURES > 7000, String(MAX_FEATURES));

// GWIS bleibt als Rückfallebene erhalten — die Datei darf nicht verschwinden.
add('gwisHotspots.ts existiert weiter (keyloser Fallback)',
  files.some(([f]) => f.endsWith('src/fire/sources/gwisHotspots.ts')));

// Attribution: Pflicht, sonst fehlt sie in der Kartenzeile.
const mod = files.find(([f]) => f.endsWith('src/fire/sources/firmsHotspots.ts'))?.[1] ?? '';
add('firmsHotspots.ts führt eine Attribution', /_ATTRIBUTION\s*=/.test(stripComments(mod)));
add('Attribution nennt NASA FIRMS / LANCE', /NASA FIRMS/.test(mod) && /LANCE/.test(mod));

// Absicherung der Annahme von stripComments: schnitte es zu viel weg, würden
// die Sonden (b) und (c) stillschweigend grün — sie prüften dann fast nichts.
add('stripComments schneidet nicht zu viel weg (Produktivteil enthält noch fetch)',
  /\bfetch\s*\(/.test(stripComments(mod)) && /_ATTRIBUTION/.test(stripComments(mod)));

/**
 * Der PRODUKTIVE Teil einer Datei: ohne Kommentare **und** ohne die eingebettete
 * `verify*`-Funktion — dasselbe Vorgehen wie in `verify-fire-sources.mjs`.
 *
 * Ohne den zweiten Schnitt klagt die Sonde (b) das eigene Modul an: dessen
 * Selbstverifikation prüft mit `!u.includes('firms.modaps')`, dass die URL
 * eben NICHT direkt auf NASA zeigt — der Prüfstring selbst enthält den Host.
 * Genau die Falle, die V-91 beschreibt: eine Sonde, die korrekten Code
 * anklagt, erzieht dazu, ihr Urteil zu ignorieren.
 *
 * Annahme (unten abgesichert): die Selbstverifikation steht am Dateiende.
 */
function stripComments(s) {
  const c = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const i = c.search(/export (?:async )?function verify\w*\s*\(/);
  return i < 0 ? c : c.slice(0, i);
}

// --- (f) Teilausfall: ein fehlgeschlagener Abruf darf nicht den ganzen Lauf kippen
// Gemessener Anlass (2026-08-19): `Promise.all` über Satellit × Zeitabschnitt warf
// bei EINEM 5xx den kompletten FIRMS-Lauf weg; die Seite fiel auf die keylose
// GWIS-Ebene zurück und meldete „NASA FIRMS nicht erreichbar", obwohl acht von
// neun Abrufen Daten hatten. Auf localhost (kein Edge-Cache davor) traf das am häufigsten.
const firmsSrc = readFileSync(join(ROOT, 'src', 'fire', 'sources', 'firmsHotspots.ts'), 'utf8');
add('Abrufe laufen über allSettled — ein Ausfall verwirft nicht den ganzen Lauf',
  /const settled = await Promise\.allSettled\(jobs\)/.test(firmsSrc)
    && !/await Promise\.all\(jobs\)/.test(firmsSrc));
add('… und wenn KEIN Abruf durchkam, wird geworfen (GWIS-Rückfall bleibt erhalten)',
  /if \(parts\.length === 0\)[\s\S]{0,200}throw new Error/.test(firmsSrc));
add('der Lauf zählt, was gefehlt hat (failedFetches/plannedFetches im HotspotRun)',
  /failedFetches: number;/.test(firmsSrc) && /plannedFetches: number;/.test(firmsSrc)
    && /toRun\(deduped, windowH, nowMs, skipped, keys, failures\.length, jobs\.length\)/.test(firmsSrc));
const pageSrc = readFileSync(join(ROOT, 'src', 'fire', 'FirePage.tsx'), 'utf8');
add('die Statuszeile SAGT den Teilausfall (eine Teilmenge ohne Hinweis wäre eine Falschaussage)',
  /run\.failedFetches > 0/.test(pageSrc) && /Abrufen ohne Antwort/.test(pageSrc));
// Der Dev-Pfad muss beim Start sagen, ob der Schlüssel da ist — sonst sieht ein
// fehlender Schlüssel auf localhost aus wie ein Ausfall der NASA.
const viteCfg = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
add('Dev-Proxy meldet beim Start, ob FIRMS_MAP_KEY geladen wurde',
  /\[firms\] MAP_KEY aus \.env\.local geladen/.test(viteCfg)
    && /KEIN FIRMS_MAP_KEY gefunden/.test(viteCfg));
add('… und gibt den Schlüsselwert dabei NICHT aus (nur Länge)',
  !/console\.log\([^)]*\$\{key\}/.test(viteCfg) && /key\.length/.test(viteCfg));

// --- Ausgabe --------------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
