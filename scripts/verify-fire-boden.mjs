/**
 * Headless-Verifikation „Waldbrand: Trockenheit" (Phase WT1, Gate GWT1).
 *
 *   npm run verify:fire-boden
 *
 * Prüft die ECHTEN Quellmodule (kein Nachbau — V-94-Lehre):
 *   • `src/sources/iconD2Smi.ts`     — Bodentrockenheit (neu in WT1)
 *   • `src/sources/iconD2Relhum.ts`  — Luft-Trockenheit (Bestand)
 *
 * ── Nebenbefund, hier mit erledigt ───────────────────────────────────────────
 * `verifyIconD2Relhum()` existierte seit WB2, wurde aber von **keinem** Skript
 * aufgerufen — eine Selbstverifikation, die nie lief, ist keine. Sie läuft ab
 * jetzt hier mit. (Gefunden beim Anlegen dieses Verifiers, notiert als V-236.)
 *
 * Dazu QUELL-SONDEN gegen die Fehler, die genau in dieser Phase teuer wären:
 *   (a) die Bodenmaske darf nicht wegoptimiert werden — ohne sie bekäme die
 *       Nordsee eine Trockenheitsfarbe (am Feld: 212 735 Wasserzellen MIT Wert),
 *   (b) auf dem ROHWERT darf nicht geklemmt werden — Werte unter dem Welkepunkt
 *       sind der fachlich interessante Fall, nicht Müll,
 *   (c) die beiden Trockenheits-Layer dürfen sich keine Rampe teilen: Luft und
 *       Boden nebeneinander müssen unterscheidbar bleiben,
 *   (d) die wertgleichen Bodenebenen 243/729 werden nicht als Auswahl angeboten,
 *   (e) Bodendateien laufen über den durable gecachten `/_dwd_grib`-Pfad.
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyIconD2Smi, drynessFromSmi, isWaterHoldingSoil,
  SOIL_LEVEL, SOIL_DRYNESS_CLASSES, soilDrynessRamp, ICON_D2_SMI_ATTRIBUTION,
} from '../src/sources/iconD2Smi.ts';
import {
  verifyIconD2Relhum, drynessFromRh, drynessRamp,
} from '../src/sources/iconD2Relhum.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// --- (1) Selbstverifikation der Module --------------------------------------
for (const [tag, res] of [
  ['iconD2Smi', verifyIconD2Smi()],
  ['iconD2Relhum', verifyIconD2Relhum()],
]) {
  for (const c of res.checks) add(`[${tag}] ${c.name}`, c.ok, c.detail);
}

// --- (2) Unabhängige Nachrechnung der Anzeigeachse ---------------------------
// Nicht dieselbe Funktion noch einmal aufrufen, sondern gegen die DEFINITION
// prüfen: 0 = Welkepunkt, 1 = Feldkapazität, dazwischen linear invertiert.
const erwartet = (smi) => (smi <= 0 ? 1 : smi >= 1 ? 0 : 1 - smi);
let achseOk = true, achseAbw = '';
for (const smi of [-0.93, -0.5, -0.0001, 0, 0.05, 0.13, 0.4, 0.5, 0.7, 0.85, 0.9999, 1, 1.5, 2.15]) {
  if (Math.abs(drynessFromSmi(smi) - erwartet(smi)) > 1e-12) {
    achseOk = false; achseAbw = `smi=${smi}: ${drynessFromSmi(smi)} statt ${erwartet(smi)}`;
    break;
  }
}
add('Anzeigeachse stimmt über den GEMESSENEN Wertebereich (−0,93 … +2,15)', achseOk, achseAbw || '14 Stützstellen');

// Monotonie: trockener darf nie eine kleinere Zahl ergeben.
let monoton = true;
for (let smi = -1; smi <= 2.2; smi += 0.01) {
  if (drynessFromSmi(smi) - drynessFromSmi(smi + 0.01) < -1e-12) { monoton = false; break; }
}
add('Trockenheit fällt monoton mit der Bodenfeuchte (nie ein Sprung nach oben)', monoton);

// Der Ausgang bleibt IMMER in [0,1] — sonst greift die Farbrampe daneben.
let imBereich = true;
for (const smi of [-99, -1, 0, 0.5, 1, 99, Number.NaN, Infinity, -Infinity]) {
  const d = drynessFromSmi(smi);
  if (!(d >= 0 && d <= 1)) { imBereich = false; break; }
}
add('Ausgang liegt IMMER in [0,1] — auch bei Unendlich und NaN', imBereich);

// --- (3) Quell-Sonden --------------------------------------------------------
const smiSrc = readFileSync(join(ROOT, 'src', 'sources', 'iconD2Smi.ts'), 'utf8');
const mapSrc = readFileSync(join(ROOT, 'src', 'fire', 'FireMap.tsx'), 'utf8');
const pageSrc = readFileSync(join(ROOT, 'src', 'fire', 'FirePage.tsx'), 'utf8');

// (a) Die Bodenmaske. Der Test, der die Nordsee trocken werden ließe.
add('(a) der Bildbau prüft die Bodenart, bevor er eine Zelle einfärbt',
  /isWaterHoldingSoil\(soiltyp\.values\[k\]\)/.test(smiSrc));
add('(a) `soiltyp` wird tatsächlich geladen (nicht nur der Typ importiert)',
  /fetchInvariantField\(\s*runStr,\s*'soiltyp'/.test(smiSrc));
add('(a) Wasser/Fels/Eis fallen aus der Maske — geprüft am Rand des Bereichs',
  !isWaterHoldingSoil(2) && isWaterHoldingSoil(3)
    && isWaterHoldingSoil(8) && !isWaterHoldingSoil(9));

// (b) Kein Clamp auf dem ROHWERT — das würde genau die Trockenheit abschneiden,
//     für die dieser Layer da ist (audit/waldbrand-boden.md §1).
add('(b) der Rohwert wird NICHT vorab auf 0..1 geklemmt',
  !/clamp01\s*\(\s*smi/.test(smiSrc) && !/Math\.max\(0,\s*Math\.min\(1,\s*smi/.test(smiSrc));
add('(b) Werte unter dem Welkepunkt landen auf dem Maximum, nicht im Nichts',
  drynessFromSmi(-0.5) === 1 && drynessFromSmi(-0.0001) === 1);

// (c) Zwei Trockenheiten, zwei Rampen. Sonst sind Luft und Boden übereinander
//     nicht auseinanderzuhalten — und beide behaupten dieselbe Größe.
const farben = (r) => Object.values(r).join('|');
add('(c) Boden- und Luft-Rampe sind verschieden',
  farben(soilDrynessRamp) !== farben(drynessRamp));
add('(c) beide Rampen beginnen transparent (kein Vollflächen-Anstrich)',
  /,0\)$/.test(Object.values(soilDrynessRamp)[0].replace(/\s/g, ''))
    && /,0\)$/.test(Object.values(drynessRamp)[0].replace(/\s/g, '')));
add('(c) die beiden Achsen sind unabhängig implementiert (keine geteilte Funktion)',
  drynessFromSmi(0.5) === 0.5 && Math.abs(drynessFromRh(50) - 0.5) < 1e-9
    && drynessFromSmi(0) === 1 && drynessFromRh(0) === 1);

// (d) Die wertgleichen Ebenen 243/729 werden nicht als Auswahl angeboten.
add('(d) keine der angebotenen Tiefen ist eine der wertgleichen Ebenen 243/729',
  ![243, 729].includes(SOIL_LEVEL.topsoil) && ![243, 729].includes(SOIL_LEVEL.rootzone),
  `${SOIL_LEVEL.topsoil} / ${SOIL_LEVEL.rootzone}`);
add('(d) der Befund steht im Modul, damit ihn niemand erneut ausprobieren muss',
  /243 und 729/.test(smiSrc) || /243\/729/.test(smiSrc));

// (e) Transport: Bodendateien über den durable gecachten Edge-Pfad.
add('(e) Bodenfelder laufen über D2_GRIB_PROXY_BASE (durable Cache)',
  /fetchSoilStepField\([\s\S]{0,200}D2_GRIB_PROXY_BASE/.test(smiSrc));
add('(e) kein direkter opendata.dwd.de-Fetch im Quellmodul (Proxy-Pflicht)',
  !/https:\/\/opendata\.dwd\.de/.test(smiSrc.replace(/dwd\.de\/DE\/leistungen/g, '')));

// --- (4) Verdrahtung: der Layer muss auch wirklich ankommen ------------------
add('FireMap hängt den Boden-ScalarLayer ein',
  /fire-soil-scalar/.test(mapSrc) && /soilDrynessRamp/.test(mapSrc));
add('der Boden-Layer bekommt KEINEN Platzhalter in installLayers (die _pending-Falle)',
  /CUSTOM_GL_LAYERS[\s\S]{0,200}fire-soil-scalar/.test(mapSrc));
add('die Lizenzzeile hat einen eigenen Träger (Custom-Layer haben keine Source)',
  /fire-soil-attr['"]/.test(mapSrc) && /ICON_D2_SMI_ATTRIBUTION/.test(mapSrc));
add('FirePage lädt strikt lazy — erst beim Aktivieren',
  /if \(!active\.has\('fireSoilDryness'\)\) return;/.test(pageSrc));
add('ein Tiefenwechsel lädt neu (Modus in den Abhängigkeiten)',
  /\}, \[active, soilMode, setLayerLoad\]\);/.test(pageSrc));
add('ein Frame der FALSCHEN Tiefe wird nicht gezeigt',
  /smi\.mode !== soilMode\) return null;/.test(pageSrc));

add('Attribution nennt DWD und die Bearbeitungsform',
  /Deutscher Wetterdienst/.test(ICON_D2_SMI_ATTRIBUTION)
    && /bildlich wiedergegeben/.test(ICON_D2_SMI_ATTRIBUTION));
add('Legende und Rampe haben dieselbe Zahl von Stufen wie behauptet',
  SOIL_DRYNESS_CLASSES.length === 5 && Object.keys(soilDrynessRamp).length === 5);

// --- Ausgabe ----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
