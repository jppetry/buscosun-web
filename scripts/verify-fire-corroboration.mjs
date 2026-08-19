/**
 * Headless-Verifikation „Bestätigung durch die EFFIS-Kartierung" (Phasen E1/E2,
 * Gate GWBE1).
 *
 *   npm run verify:fire-corroboration
 *
 * Prüft das ECHTE Modul `src/fire/fireCorroboration.ts` und die Brandflächen-
 * Quelle `src/fire/sources/euContext.ts` über ihre eingebetteten
 * Selbstverifikationen und ergänzt Sonden gegen die Fehler, die genau diese
 * Phase teuer machen:
 *
 *   (a) das Wort „bestätigt" fällt in der Waldbrand-Ansicht NUR mit der
 *       EFFIS-Kartierung im selben Atemzug — nie aus Überflügen, nie aus dem
 *       GWIS-Hotspot-Vergleich (der ist in E0 als leer gemessen worden),
 *   (b) das verbotene Zwei-Quellen-Vokabular kommt nirgends vor,
 *   (c) fehlende Kartierung wird nie als Gegenbeleg gerendert („nicht kartiert",
 *       „nicht übernommen" o. ä. existiert als Etikett nicht),
 *   (d) der GWIS-Hotspot-Vergleich ist NICHT verdrahtet (E0-Befund B1),
 *   (e) die Brandflächen-Abfrage trägt keinen Kleindeckel mehr (V-224) und
 *       zieht Zeitspanne/Stand/Schwelle aus den Daten,
 *   (f) die Bestätigungszeile ist zeitlich UND räumlich gebunden.
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyFireCorroboration, mappedAreaFor, parseBurntFeature, squarePolygon,
  corroborationLabel, NO_MAPPING_NOTE, TOLERANCE_M, MATCH_DAYS,
} from '../src/fire/fireCorroboration.ts';
import { verifyEuContext, burntUrl, BURNT_MAX_FEATURES } from '../src/fire/sources/euContext.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

for (const c of verifyFireCorroboration().checks) add(`[corroboration] ${c.name}`, c.ok, c.detail);
for (const c of verifyEuContext().checks) add(`[euContext] ${c.name}`, c.ok, c.detail);

// --- Quelltexte der Waldbrand-Ansicht (Kommentare raus, Selbstverifikation ab) --
const strip = (s) => {
  const t = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const i = t.search(/export function verify\w*\s*\(/);
  return i < 0 ? t : t.slice(0, i);
};
const fireDir = join(ROOT, 'src', 'fire');
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
};
walk(fireDir);
const code = Object.fromEntries(files.map((p) => [p.slice(fireDir.length + 1).replace(/\\/g, '/'), strip(readFileSync(p, 'utf8'))]));

// (a) „bestätigt" nur mit EFFIS-Kartierung. `unbestätigt` ist erlaubt (F2).
const offenders = [];
for (const [name, src] of Object.entries(code)) {
  const re = /(^|[^n])bestätigt/gi;
  let m;
  while ((m = re.exec(src))) {
    const window = src.slice(Math.max(0, m.index - 260), m.index + 40);
    // GWBA1: neben der EFFIS-Kartierung sind Copernicus-EMS-Aktivierung und amtliche
    // Warnung (MoWaS, nach Freigabe) die einzigen Quellen, mit denen das Wort fällt.
    if (!/EFFIS|kartiert|Kartierung|mapped|EMS|Copernicus|amtlich|MoWaS|official|LEVEL_LABEL/i.test(window)) offenders.push(`${name}@${m.index}`);
  }
}
add('„bestätigt" fällt in src/fire NUR mit EFFIS-Kartierung, EMS-Aktivierung oder amtlicher Warnung (GWBA1)',
  offenders.length === 0, offenders.join(', ') || `${Object.keys(code).length} Dateien`);

// (b) Verbotenes Vokabular — nirgends im Produktcode (Kommentare und die
//     Selbstverifikationen, die die Phrasen als Negativmuster führen, sind ab).
const prodAll = Object.values(code).join('\n');
add('kein „von zwei Quellen bestätigt" / „doppelt verifiziert" / „unabhängig bestätigt"',
  !/von zwei Quellen bestätigt|doppelt verifiziert|unabhängig bestätigt/i.test(prodAll));

// (c) Kein Gegenbeleg-Etikett. Die Ausgabe kennt genau zwei Zustände: Treffer
//     oder nichts. Der Hinweistext sagt das ausdrücklich.
add('kein Etikett „nicht kartiert" / „nicht übernommen" / „effisDropped" im Produktcode',
  !Object.values(code).some((s) => /nicht kartiert|nicht übernommen|effisDropped|outOfScope/i.test(s)));
add('der Hinweis „kein Beleg gegen ein Feuer" ist im Steckbrief der Fläche verdrahtet',
  /NO_MAPPING_NOTE/.test(code['FireMap.tsx']));

// (d) Der GWIS-Hotspot-Vergleich ist NICHT gebaut (E0 B1: die Menge ist ungefiltert).
add('fireCorroboration.ts importiert NICHTS aus gwisHotspots und ruft nichts ab',
  !/gwisHotspots/.test(code['fireCorroboration.ts']) && !/\bfetch\s*\(/.test(code['fireCorroboration.ts'])
    && !/https?:\/\//.test(code['fireCorroboration.ts']));
add('FirePage vergleicht FIRMS nicht gegen GWIS-Hotspots (kein Match-Aufruf, keine GWIS-Zweitladung)',
  !/fetchHotspots\([^)]*\)[\s\S]{0,400}mappedAreaFor|gwisMatch|compareWithGwis|effisKept/i.test(code['FirePage.tsx']));

// (e) Kein Kleindeckel, alles aus den Daten.
add('Brandflächen-URLs tragen keinen Kleindeckel (maxfeatures ≥ 5000, V-224)',
  ['season', 'archive', 'week'].every((w) => new RegExp(`maxfeatures=${BURNT_MAX_FEATURES}`).test(burntUrl(w))) && BURNT_MAX_FEATURES >= 5000);
add('kein `maxfeatures=800` mehr im Quellmodul', !/maxfeatures=800/.test(code['sources/euContext.ts']));
add('Zeitspanne, Stand und Kartierschwelle werden aus den Features gelesen',
  /lastUpdateMs/.test(code['sources/euContext.ts']) && /minAreaHa/.test(code['sources/euContext.ts'])
    && /firedateMs/.test(code['sources/euContext.ts']));
add('kein fest eingetragenes „endet 2018" / „≥30 ha" mehr in den Texten',
  !/endet (derzeit )?2018|≥\s?30 ha|ab 30 ha/.test(prodAll));
add('Saison und Archiv haben getrennte Quellen UND getrennte GL-Layer',
  /fire-burnt-season/.test(code['FireMap.tsx']) && /fire-burnt-archive/.test(code['FireMap.tsx'])
    && /'fire-burnt-season', 'fire-burnt-archive'/.test(code['FireMap.tsx']));
add('die Landbedeckung wird aus den Feature-Anteilen gerendert (lc + Aufschlüsselung im Popup)',
  /landcoverColorExpression/.test(code['FireMap.tsx']) && /landcoverBreakdown/.test(code['FireMap.tsx']));

// (f) Bindung: räumlich UND zeitlich — unabhängig von der Selbstverifikation.
const props = { id: 'x', FIREDATE: '2026-08-13 10:41:00', LASTUPDATE: '2026-08-14 14:38:36.282953', AREA_HA: '3',
  CONIFER: '100', BROADLEA: '0', MIXED: '0', SCLEROPH: '0', TRANSIT: '0', OTHERNATLC: '0', AGRIAREAS: '0', ARTIFSURF: '0', OTHERLC: '0', PERCNA2K: '100' };
const p = parseBurntFeature(squarePolygon(10.8, 51.75, 600, props)); // Oberharz-Beispiel aus E0
const t = Date.UTC(2026, 7, 13, 12, 0);
add('Detektion am Brandtag in der Fläche ⇒ Treffer', mappedAreaFor({ lon: 10.8, lat: 51.75, acqMs: t }, [p]) === p);
add(`Detektion ${MATCH_DAYS + 5} Tage später ⇒ kein Treffer (zeitliche Bindung)`,
  mappedAreaFor({ lon: 10.8, lat: 51.75, acqMs: t + (MATCH_DAYS + 5) * 86_400_000 }, [p]) === null);
add(`Detektion ${TOLERANCE_M * 3} m daneben ⇒ kein Treffer (räumliche Bindung)`,
  mappedAreaFor({ lon: 10.8, lat: 51.75 + (300 + TOLERANCE_M * 3) / 111_320, acqMs: t }, [p]) === null);
const label = corroborationLabel(p);
add('Beschriftung: „Brandfläche von EFFIS kartiert (bestätigt)" + Fläche + Datum + Stand',
  /^Brandfläche von EFFIS kartiert \(bestätigt\): 3 ha, 100 % Nadelwald · Branddatum 13\.08\.2026 · Stand 14\.08\.2026$/.test(label), label);
add('kein Wort aus der Fläche wird zu „gemeldet" oder „Einsatz"', !/gemeldet|Einsatz/.test(label + NO_MAPPING_NOTE));

// (h) Die Kartierung hebt das Grau auf — und macht NIE etwas grau. Ein Feuer,
//     das tagelang ortsfest brennt (E0: Varallo, 47 ha), sähe sonst aus wie
//     ein Stahlwerk, obwohl EFFIS die Fläche geprüft hat.
add('FirePage: EFFIS-Kartierung entfernt Detektionen aus der Ortsfest-Menge (keys.delete bei mappedAreaFor)',
  /keys\.has\(k\) && mappedAreaFor\(r, polys\)\) keys\.delete\(k\)/.test(code['FirePage.tsx']));
add('FirePage: die Kartierung fügt der Ortsfest-Menge NIE etwas hinzu',
  !/mappedAreaFor[^\n]*keys\.add|keys\.add\([^\n]*mapped/i.test(code['FirePage.tsx']));

// (g) Der eine zusätzliche Abruf ist der Wochenlayer — und nur der.
add('FirePage lädt für die Bestätigung genau den 7-Tage-Layer (fetchBurntWeek), nichts Größeres',
  (code['FirePage.tsx'].match(/fetchBurntWeek\(/g) ?? []).length === 1
    && !/fetchBurntAreas\('season'[^)]*\)[\s\S]{0,200}mapped/i.test(code['FirePage.tsx']));
add('der Wochenlayer ist ms:modis.ba.poly.week auf /effis', /typename=ms:modis\.ba\.poly\.week/.test(burntUrl('week')) && /\/effis\?/.test(burntUrl('week')));

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
