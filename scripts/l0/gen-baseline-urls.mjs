/**
 * L0-B — erzeugt die Permalink-Liste für die Golden-Baseline-Screenshots und
 * prüft dabei die Permalink-Fähigkeit jedes Layers (V-134).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/l0/gen-baseline-urls.mjs
 *   … --base http://localhost:5173 --json audit/l0/baseline-urls.json
 *
 * ZWEI AUFGABEN IN EINEM LAUF:
 *
 * 1. **Baseline-URLs.** Je Layer eine reproduzierbare Adresse, damit die
 *    Screenshots vor und nach dem Registry-Umbau exakt dieselbe Ansicht zeigen.
 *    Ohne feste URLs ist ein Pixel-Diff wertlos, weil schon eine minimal andere
 *    Kartenposition alles rot färbt.
 *
 * 2. **Permalink-Audit (V-134).** `LAYER_ORDER` in `src/mapState.ts` ist
 *    modulprivat — statt sie zu importieren, wird die öffentliche API
 *    round-getrippt: `encodeMapState([key])` → `decodeMapState` → überlebt der
 *    Key? Damit deckt das Skript ohne jede Code-Änderung auf, welche Layer aus
 *    einem geteilten Link stillschweigend verschwinden. Erwartet (Stand
 *    2026-08-05): `thunder`, `lightningfc`, `snow`, `rotation` fallen durch.
 *
 * Rein und netzfrei — importiert nur `src/mapState.ts` (dessen einzige Importe
 * Typen sind). Läuft damit auch in CI.
 */

import { encodeMapState, decodeMapState } from '../../src/mapState.ts';

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const BASE = argOf('--base', 'http://localhost:5173');
const JSON_OUT = argOf('--json', null);

/**
 * Die 16 LayerKeys aus `MapView.tsx:300`. Bewusst hier dupliziert statt
 * importiert: `MapView.tsx` zieht maplibre-gl und die halbe App nach, das ist in
 * einem Node-Skript weder nötig noch wünschenswert. Der Abgleich passiert unten
 * gegen die Round-Trip-Prüfung — läuft der Typ auseinander, fällt es dort auf.
 *
 * NACH DER REGISTRY (V-135) ist diese Liste ersatzlos zu löschen und durch
 * `import { LAYERS } from '../../src/map/layerRegistry.ts'` zu ersetzen.
 */
const LAYER_KEYS = [
  'wind', 'gust', 'nowcast', 'temp', 'clouds', 'sat',
  'lightning', 'lightningfc', 'stations', 'confidence',
  'snowline', 'flownowcast', 'poprob', 'thunder', 'snow', 'rotation',
];

/** Fester Referenzort + feste Stunde — sonst ist ein Pixel-Diff nicht aussagekräftig. */
const REF_LOCATION = { lat: 47.8, lon: 11.5, name: 'Baseline DACH', country: 'DE' };
const REF_HOUR = 0;

/** Zusätzliche Kombinationen: genau die Stellen, an denen die Z-Ordnung wehtut. */
const COMBOS = [
  { id: 'combo-precip-stack', layers: ['nowcast', 'confidence', 'stations'],
    why: 'Schleier über Daten, Stationen über der Länder-Maske — der Kontrakt aus MapView.tsx:1140-1148' },
  { id: 'combo-wind-over-labels', layers: ['wind', 'temp'],
    why: 'Wind liegt bewusst ÜBER Grenzen und Labels (addLayer ohne beforeId)' },
  { id: 'combo-mask-clip', layers: ['nowcast', 'temp', 'sat'],
    why: 'Länder-Maske clippt Scalar/Rain, Satellit liegt darunter — Depth-Kontrakt' },
  { id: 'combo-vector-over-raster', layers: ['nowcast', 'snowline'],
    why: 'Linie über Fläche' },
  { id: 'combo-all-encodable', layers: null, why: 'alle permalink-fähigen Layer gleichzeitig — Worst Case für Draw-Calls' },
];

// ---------------------------------------------------------------------------
// Permalink-Audit
// ---------------------------------------------------------------------------
const audit = LAYER_KEYS.map((key) => {
  const hash = encodeMapState({ location: REF_LOCATION, layers: [key], hour: REF_HOUR });
  const back = decodeMapState(hash);
  const survives = !!back && back.layers.includes(key);
  return { key, survives, hash };
});

const encodable = audit.filter((a) => a.survives).map((a) => a.key);
const lost = audit.filter((a) => !a.survives).map((a) => a.key);

console.log('\nPermalink-Audit (V-134) — überlebt der Layer einen #m=-Roundtrip?');
console.log('='.repeat(72));
for (const a of audit) {
  console.log(`  ${a.survives ? '✓' : '✗ VERLOREN'}  ${a.key}`);
}
console.log('-'.repeat(72));
console.log(`  ${encodable.length}/${LAYER_KEYS.length} permalink-fähig`);
if (lost.length) {
  console.log(`\n  ⚠ NICHT permalink-fähig: ${lost.join(', ')}`);
  console.log('    Ein geteilter Link verliert diese Layer stillschweigend. Das ist V-134.');
  console.log('    Für diese Layer kann die Baseline NICHT per URL reproduziert werden —');
  console.log('    sie müssen im Screenshot-Protokoll von Hand zugeschaltet werden (s. unten).');
} else {
  console.log('\n  Alle Layer permalink-fähig — V-134 ist erledigt. Bitte in improvements.md eintragen.');
}

// ---------------------------------------------------------------------------
// Baseline-URLs
// ---------------------------------------------------------------------------
const urls = [];
const push = (id, layers, note) => {
  const hash = encodeMapState({ location: REF_LOCATION, layers, hour: REF_HOUR });
  urls.push({ id, layers, url: `${BASE}/${hash}`, note: note ?? null });
};

push('baseline-empty', [], 'Referenz ohne Wetterlayer — isoliert Basemap-Drift von Layer-Drift');
for (const a of audit) {
  if (a.survives) push(`layer-${a.key}`, [a.key], null);
}
for (const c of COMBOS) {
  const layers = (c.layers ?? encodable).filter((l) => encodable.includes(l));
  if (layers.length) push(c.id, layers, c.why);
}

console.log('\n\nBaseline-URLs für die Screenshots');
console.log('='.repeat(72));
console.log(`Ort: ${REF_LOCATION.name} (${REF_LOCATION.lat}/${REF_LOCATION.lon}, ${REF_LOCATION.country}) · Stunde ${REF_HOUR}`);
console.log(`Basis: ${BASE}   (mit --base überschreiben)\n`);
for (const u of urls) {
  console.log(`  ${u.id}`);
  console.log(`    ${u.url}`);
  if (u.note) console.log(`    → ${u.note}`);
}

if (lost.length) {
  console.log('\n  Manuell (nicht per URL erreichbar):');
  for (const k of lost) console.log(`    layer-${k}  · im Dock zuschalten, alle anderen aus, Stunde 0`);
}

console.log(`\n${urls.length} URLs + ${lost.length} manuelle Ansichten = ${urls.length + lost.length} Screenshots je Viewport.`);
console.log('Zwei Viewports (Desktop 1440×900, iPhone 12 Pro 390×844 DPR 3) ⇒ '
  + `${(urls.length + lost.length) * 2} Aufnahmen.`);
console.log('\nAblage: audit/screenshots/l0-baseline/{desktop,mobile}/<id>.png');
console.log('Nach dem Umbau dieselbe Liste erneut aufnehmen nach …/l0-after/ und diffen.');

if (JSON_OUT) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify({
    at: new Date().toISOString(), base: BASE, refLocation: REF_LOCATION, refHour: REF_HOUR,
    audit, encodable, lost, urls,
  }, null, 2));
  console.log(`\nJSON geschrieben: ${JSON_OUT}`);
}
console.log('');
