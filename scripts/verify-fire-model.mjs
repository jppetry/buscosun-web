/**
 * Headless-Verifikation „Waldbrand: Layer-Modell & Permalink" (Phase WB1, Gate GWB1).
 *
 *   npm run verify:fire-model
 *
 * Prüft die ECHTEN App-Module (kein Nachbau — V-94-Lehre):
 *   • `src/fire/fireModel.ts`  — Layer-Union, Z-Bänder, Presets, Skalentrennung, Kaskade
 *   • `src/fire/fireState.ts`  — `#wb=`-Round-Trip, Bit-Stabilität, Robustheit
 *
 * und ergänzt QUELL-SONDEN, die die drei Zusicherungen dieser Phase gegen ein
 * späteres Aufweichen sichern:
 *   (a) keine Umrechnungsfunktion zwischen den nationalen Skalen,
 *   (b) `src/fire/` importiert nichts aus `MapView.tsx`,
 *   (c) die `#wb=`-Bitmaske wird abgeleitet, nicht handgeschrieben (V-191).
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyFireModel, FIRE_LAYER_ORDER, FIRE_MVP_LAYERS, FIRE_Z_BAND,
  FIRE_SOURCE_DE, FIRE_SOURCE_CH, FIRE_SOURCE_EU,
  hasOfficialFireIndex, nationalSourceFor, sortByZBand,
} from '../src/fire/fireModel.ts';
import { verifyFireState, encodeFireState, decodeFireState } from '../src/fire/fireState.ts';
// WF4: die Farbrampe des Forecast-Layers — die EFFIS-Klassengrenzen der Fläche
// müssen dieselben sein wie die der Legende daneben.
import { verifyIsiRamp, ISI_CLASS_BOUNDS, isiRamp } from '../src/fire/fwi/isiRamp.ts';
import { ISI_VMAX } from '../src/sources/iconD2FireWeather.ts';
import { DANGER_VIEWS } from '../src/fire/dangerViews.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIRE_DIR = join(ROOT, 'src', 'fire');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// --- (1) Die in den Modulen eingebetteten Selbstverifikationen --------------
for (const c of verifyFireModel().checks) add(`[fireModel] ${c.name}`, c.ok, c.detail);
for (const c of verifyFireState().checks) add(`[fireState] ${c.name}`, c.ok, c.detail);
for (const c of verifyIsiRamp().checks) add(`[isiRamp] ${c.name}`, c.ok, c.detail);

// --- (2) Unabhängige Kontrollen gegen die exportierten Helfer ---------------

// Die Kernaussage der Phase, noch einmal von außen: DE-2 und CH-1 tragen
// dieselbe Beschriftung und dürfen trotzdem nie ineinander übersetzt werden.
add('DE-Stufe 2 = CH-Stufe 1 im Wortlaut — der Grund für getrennte Tabellen',
  FIRE_SOURCE_DE.scale[1].label === FIRE_SOURCE_CH.scale[0].label,
  `"${FIRE_SOURCE_DE.scale[1].label}"`);
add('… und bei gleicher Stufennummer verschiedene Bedeutung',
  FIRE_SOURCE_DE.scale[0].label !== FIRE_SOURCE_CH.scale[0].label);
add('EU-Skala hat eine Klasse mehr als beide nationalen',
  FIRE_SOURCE_EU.scale.length === 6 && FIRE_SOURCE_DE.scale.length === 5);

// Länder-Asymmetrie (D-04): AT bekommt nichts vorgetäuscht.
add('AT hat keine amtliche Stufe und keinen Ersatz',
  hasOfficialFireIndex('AT') === false && nationalSourceFor('AT') === null);

// Z-Ordnung: Punkte über Flächen, sonst sind die Detektionen unsichtbar.
// (Bis 2026-08-19 lagen hier die amtliche Stufe und die Verbotsflächen
// dazwischen — beide Layer zurückgezogen.)
add('Z-Ordnung: Hotspots über dem Treiber über EU-Fläche',
  FIRE_Z_BAND.fireHotspots > FIRE_Z_BAND.fireWeather
  && FIRE_Z_BAND.fireWeather > FIRE_Z_BAND.fireDanger);
add('sortByZBand ist stabil und vollständig',
  sortByZBand(FIRE_LAYER_ORDER).length === FIRE_LAYER_ORDER.length);

// Permalink: der Round-Trip über ALLE Layer, unabhängig nachgerechnet.
const rt = decodeFireState(encodeFireState({
  location: { name: 'Wien', lat: 48.2082, lon: 16.3738, country: 'AT' },
  layers: [...FIRE_LAYER_ORDER], day: 4, windowH: 168,
}));
add('Round-Trip: alle Layer + Ort + Tag + Fenster',
  rt && rt.layers.length === FIRE_LAYER_ORDER.length && rt.day === 4
  && rt.windowH === 168 && rt.location?.country === 'AT',
  `${rt?.layers.length} Layer`);

// WF4: die Grenzen der FLÄCHE sind exakt die der LEGENDE. Die Legende führt sie
// als Text („3,2–5,0"), die Rampe als Zahl — hier werden beide gegeneinander
// gelesen. Wer eine der beiden Seiten ändert, ohne die andere, fällt hier auf.
{
  const fromLegend = DANGER_VIEWS.isi.classes
    .map((c) => c.range.match(/(\d+(?:,\d+)?)/))          // erste Zahl je Klasse
    .slice(1)                                              // „< 3,2" der ersten Klasse ist die erste Grenze
    .map((m) => (m ? Number(m[1].replace(',', '.')) : NaN));
  add('WF4: die ISI-Rampe trägt exakt die Klassengrenzen der EFFIS-Legende',
    fromLegend.length === ISI_CLASS_BOUNDS.length
      && fromLegend.every((v, i) => Math.abs(v - ISI_CLASS_BOUNDS[i]) < 1e-9),
    `Legende ${fromLegend.join('/')} · Rampe ${ISI_CLASS_BOUNDS.join('/')}`);
  add('WF4: die Stops liegen bei ISI/ISI_VMAX — dieselbe Normierung wie der R-Kanal',
    ISI_CLASS_BOUNDS.every((b) => isiRamp[b / ISI_VMAX] !== undefined), `ISI_VMAX=${ISI_VMAX}`);
}

// --- (3) Quell-Sonden -------------------------------------------------------
// SF1 (2026-08-19): die Sonde las `src/fire/` mit `readdirSync` OHNE Rekursion —
// die Unterordner (`activity/`, `footprint/`, `fwi/`, `sources/`, `spread/`)
// waren seit ihrer Anlage ungeprüft, insbesondere gegen den MapView-Import.
// Jetzt rekursiv; die Dateinamen tragen ihren Pfad, damit ein Treffer auffindbar ist.
const walk = (dir, prefix = '') => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...walk(join(dir, e.name), `${prefix}${e.name}/`));
    else if (/\.tsx?$/.test(e.name)) out.push(`${prefix}${e.name}`);
  }
  return out;
};
const files = walk(FIRE_DIR);
const sources = Object.fromEntries(files.map((f) => [f, readFileSync(join(FIRE_DIR, f), 'utf8')]));
add('Sonde findet die fire-Module rekursiv (auch die Unterordner)',
  files.length >= 3 && files.some((f) => f.includes('/')), `${files.length} Dateien`);

// (a) Es darf keine Funktion geben, die eine nationale Stufe in eine andere
//     übersetzt. Das ist die Regel, die am leichtesten aus Bequemlichkeit
//     bricht („ein kleiner Mapper reicht doch") und am teuersten ist.
const converters = [];
for (const [f, src] of Object.entries(sources)) {
  if (/function\s+\w*(?:deToCh|chToDe|toCommonLevel|normali[sz]eLevel|harmoni[sz]e)\w*/i.test(src)) {
    converters.push(f);
  }
  // Auch die stille Variante: eine Tabelle, die DE- auf CH-Stufen abbildet.
  if (/FIRE_SOURCE_DE[\s\S]{0,120}=>[\s\S]{0,60}FIRE_SOURCE_CH/.test(src)) converters.push(`${f} (Tabelle)`);
}
add('keine Umrechnung zwischen nationalen Skalen im Code',
  converters.length === 0, converters.length ? converters.join(', ') : 'keine gefunden');

// (b) Die Waldbrand-Ansicht muss von MapView.tsx unabhängig bleiben — sonst
//     hängt der neue Chunk an der 5.724-Zeilen-Datei (architecture.md §14.1).
const mapViewImporters = Object.entries(sources)
  .filter(([, src]) => /from\s+['"](?:\.\.\/)+MapView['"]/.test(src))
  .map(([f]) => f);
add('kein Modul in src/fire (inkl. Unterordner) importiert aus MapView.tsx',
  mapViewImporters.length === 0, mapViewImporters.join(', ') || 'keiner');

// (c) Die Bitmaske wird abgeleitet, nicht danebengeschrieben. Genau das ist der
//     Unterschied zu mapState.ts:24, wo eine handgepflegte Liste 7 Layer verlor.
const stateSrc = sources['fireState.ts'] ?? '';
add('fireState.ts leitet die Bit-Reihenfolge aus FIRE_BIT_ORDER ab',
  /FIRE_BIT_ORDER\.indexOf/.test(stateSrc) && /FIRE_BIT_ORDER\.filter/.test(stateSrc));
add('fireState.ts pflegt KEINE eigene Layer-Liste',
  !/const\s+\w*(?:LAYER_ORDER|ORDER)\s*(?::[^=]+)?=\s*\[/.test(stateSrc));

// (d) Gegenprobe am Bestand: der Befund, der die Regel überhaupt begründet.
//     Bricht der irgendwann weg (weil jemand mapState repariert), soll das
//     auffallen — dann kann dieser Check entfallen.
const mapState = readFileSync(join(ROOT, 'src', 'mapState.ts'), 'utf8');
const orderLine = mapState.match(/const LAYER_ORDER: LayerKey\[\] = \[([^\]]+)\]/);
const orderCount = orderLine ? orderLine[1].split(',').length : -1;
add('Bestandsbefund V-191 unverändert: mapState.ts führt 12 von 19 Layern',
  orderCount === 12, `${orderCount} Einträge`);

// --- Ausgabe ----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
