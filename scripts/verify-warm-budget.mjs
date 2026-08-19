/**
 * verify-warm-budget.mjs — hält die Warm-Liste und das Layer-Dock synchron (V-80).
 *
 *   npm run verify:warm-budget
 *
 * Das Problem, das V-80 gefunden hat, war ein DRIFT-Problem: Der Wolken-Toggle
 * wurde am 2026-07-23 auskommentiert, der Warm-Cron zog seine vier Params aber
 * weiter (52 Dateien ≈ 25 MB je Lauf für einen unsichtbaren Layer) — und
 * umgekehrt kamen vier Feature-Layer dazu (Gewitter, Blitz-Prognose, Schnee,
 * Rotation), ohne dass ihre Params je gewärmt wurden; sie luden dadurch IMMER
 * kalt. Beides fiel monatelang niemandem auf.
 *
 * Dieser Verifier liest BEIDE Seiten aus dem echten Code (keine gepflegte
 * Zweitliste, die selbst driften könnte):
 *   • aktive Layer  ← DECK_GROUPS in src/MapView.tsx (auskommentierte Zeilen
 *                     zählen ausdrücklich NICHT als aktiv)
 *   • gewärmte Params ← BASE_PARAMS/FEATURE_PARAMS in scripts/warm-grib.mjs
 *   • Step-Caps     ← MAX_STEP im jeweiligen Quellmodul
 *
 * Netzfrei, keine Dependencies.
 */
import { readFileSync } from 'node:fs';

const mapView = readFileSync('src/MapView.tsx', 'utf8');
const warm = readFileSync('scripts/warm-grib.mjs', 'utf8');

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// ── DECK_GROUPS auslesen: nur NICHT auskommentierte { key: '…' } ─────────────
const deckBlock = (mapView.match(/const DECK_GROUPS[\s\S]*?\n\];/) ?? [''])[0];
if (!deckBlock) { console.error('DECK_GROUPS nicht gefunden — MapView.tsx umgebaut?'); process.exit(2); }
const activeLayers = new Set();
const commentedLayers = new Set();
for (const line of deckBlock.split('\n')) {
  const m = line.match(/\{\s*key:\s*'([a-z]+)'/);
  if (!m) continue;
  (line.trim().startsWith('//') ? commentedLayers : activeLayers).add(m[1]);
}
add('DECK_GROUPS lesbar', activeLayers.size > 0, `${activeLayers.size} aktiv, ${commentedLayers.size} auskommentiert`);

// ── Warm-Liste auslesen ──────────────────────────────────────────────────────
const paramsOf = (blockName) => {
  const b = (warm.match(new RegExp(`${blockName} = \\[([\\s\\S]*?)\\];`)) ?? ['', ''])[1];
  return new Map([...b.matchAll(/name:\s*'([a-z0-9_]+)',\s*maxStep:\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
};
const warmed = new Map([...paramsOf('BASE_PARAMS'), ...paramsOf('FEATURE_PARAMS')]);
add('Warm-Liste lesbar', warmed.size > 0, `${warmed.size} Params`);

/**
 * Layer → ICON-D2-Params + Cap aus dem Quellmodul. Die Caps sind hier NICHT
 * frei gewählt: sie stehen als MAX_STEP im jeweiligen `src/sources/*.ts` und
 * werden unten gegen die Datei geprüft, damit auch diese Tabelle nicht driftet.
 */
const LAYER_PARAMS = [
  { layer: 'temp', params: ['t_2m'], cap: 24, src: null },
  { layer: 'gust', params: ['vmax_10m'], cap: 24, src: null },
  { layer: 'thunder', params: ['cape_ml', 'cin_ml', 'lpi'], cap: 12, src: 'src/sources/iconD2Thunder.ts' },
  { layer: 'lightningfc', params: ['lpi_max'], cap: 12, src: 'src/sources/iconD2Lpi.ts' },
  { layer: 'snow', params: ['h_snow', 'snow_gsp'], cap: 24, src: 'src/sources/iconD2Snow.ts' },
  { layer: 'rotation', params: ['uh_max', 'uh_max_low', 'sdi_2'], cap: 12, src: 'src/sources/iconD2Rotation.ts' },
];

for (const { layer, params, cap, src } of LAYER_PARAMS) {
  if (!activeLayers.has(layer)) {
    add(`Layer '${layer}' ist im Dock aktiv`, false, 'nicht (mehr) in DECK_GROUPS — Tabelle anpassen');
    continue;
  }
  for (const p of params) {
    add(`aktiver Layer '${layer}' → '${p}' wird gewärmt`, warmed.has(p),
      warmed.has(p) ? `Cap ${warmed.get(p)}` : 'FEHLT ⇒ lädt immer kalt (Directory-Scan)');
    if (warmed.has(p)) {
      add(`  '${p}' Cap == Layer-Bedarf`, warmed.get(p) === cap, `warm ${warmed.get(p)} vs. Layer ${cap}`);
    }
  }
  // Cap gegen das Quellmodul prüfen — sonst driftet diese Tabelle selbst.
  if (src) {
    const mod = readFileSync(src, 'utf8');
    const m = mod.match(/const MAX_STEP = (\d+);/);
    add(`  Cap ${cap} stimmt mit MAX_STEP in ${src.split('/').pop()}`, m != null && Number(m[1]) === cap,
      m ? `MAX_STEP=${m[1]}` : 'MAX_STEP nicht gefunden');
  }
}

// ── Kein Warmen für ausgeblendete Layer ──────────────────────────────────────
const CLOUD_PARAMS = ['clcl', 'clcm', 'clch', 'clct'];
if (commentedLayers.has('clouds')) {
  const stillWarmed = CLOUD_PARAMS.filter((p) => warmed.has(p));
  add("ausgeblendeter Layer 'clouds' wird NICHT gewärmt", stillWarmed.length === 0,
    stillWarmed.length ? `noch in der Warm-Liste: ${stillWarmed.join(', ')}` : '4 Params entfernt (V-80)');
} else {
  add("Layer 'clouds' ist wieder aktiv ⇒ Params gehören zurück in die Warm-Liste",
    CLOUD_PARAMS.every((p) => warmed.has(p)), 'Toggle in MapView.tsx wurde einkommentiert');
}

// Der EPS-Baum wärmt `clct` weiterhin — das ist KEIN Widerspruch: die
// Fusions-Engine braucht Bewölkung unabhängig vom Karten-Toggle.
add('EPS-Baum wärmt clct weiterhin (Fusion, unabhängig vom Karten-Toggle)',
  /EPS_PARAMS = \[[^\]]*'clct'/.test(warm));

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
