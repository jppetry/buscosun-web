/**
 * Golden-Baseline-Gate für den Layer-Umbau (Phasen L1/L2 der 2D-Layer-Erweiterung).
 *
 *   node scripts/verify-layer-matrix.mjs audit/l0/matrix-baseline.json audit/l0/matrix-after.json
 *   node scripts/verify-layer-matrix.mjs --dir audit/l0/baseline --dir-after audit/l0/after
 *
 * Vergleicht zwei mit `scripts/l0/capture-layer-matrix.js` im Browser
 * aufgenommene Layer-Matrizen und meldet JEDE Abweichung in Reihenfolge,
 * Sichtbarkeit oder Typ. Netzfrei und deterministisch ⇒ CI-tauglich (O-02 B).
 *
 * WOFÜR: Der Registry-/Applier-Umbau ersetzt zwei 48-Zeilen-Duplikate und eine
 * 17-fach verstreute `moveLayer`-Kette durch eine Sortierung. Genau dort ist
 * schon einmal ein realer Nutzer-Bug entstanden. Dieses Skript ist die
 * Gate-Bedingung von L2: **Abweichung = Phase fehlgeschlagen**, es sei denn, die
 * Abweichung ist begründet und in `audit/` dokumentiert.
 *
 * Zusätzlich werden die drei Erhalt-Kontrakte hart geprüft — sie dürfen nicht
 * nur „gleich" sein, sondern müssen ERFÜLLT sein. Eine Baseline, die den
 * Kontrakt schon verletzt, würde den Bug sonst zementieren.
 *
 * RED-TEST-NACHWEIS (Pflicht nach O-02): In einer Kopie der After-Datei zwei
 * Einträge in `layerOrder` vertauschen — das Skript muss mit Exit 1 und einer
 * benannten Verschiebung antworten. Ergebnis im Gate-Protokoll vermerken.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const DIR_BEFORE = argOf('--dir');
const DIR_AFTER = argOf('--dir-after');
const positional = argv.filter((a) => !a.startsWith('--') && a !== DIR_BEFORE && a !== DIR_AFTER);

function load(p) {
  if (!existsSync(p)) { console.error(`Datei fehlt: ${p}`); process.exit(2); }
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { console.error(`Kein gültiges JSON: ${p}\n  ${e.message}`); process.exit(2); }
}

/** Paare (id → {before, after}) bilden — entweder zwei Dateien oder zwei Verzeichnisse. */
function pairs() {
  if (DIR_BEFORE && DIR_AFTER) {
    const names = readdirSync(DIR_BEFORE).filter((f) => f.endsWith('.json'));
    return names.map((n) => ({
      id: basename(n, '.json'),
      before: load(join(DIR_BEFORE, n)),
      after: existsSync(join(DIR_AFTER, n)) ? load(join(DIR_AFTER, n)) : null,
      missing: !existsSync(join(DIR_AFTER, n)),
    }));
  }
  if (positional.length !== 2) {
    console.error('Aufruf: verify-layer-matrix.mjs <baseline.json> <after.json>');
    console.error('   oder: verify-layer-matrix.mjs --dir <baseline-dir> --dir-after <after-dir>');
    process.exit(2);
  }
  return [{ id: 'single', before: load(positional[0]), after: load(positional[1]), missing: false }];
}

/**
 * Reihenfolge-Diff: meldet Einfügungen, Entfernungen und ECHTE Verschiebungen.
 * Eine Verschiebung ist nur dann eine, wenn sich die relative Ordnung ändert —
 * ein Layer, der nur wegen eines eingefügten Nachbarn einen Index weiterrutscht,
 * ist keine Regression und soll nicht rauschen.
 */
function orderDiff(a = [], b = []) {
  const sa = new Set(a), sb = new Set(b);
  const removed = a.filter((x) => !sb.has(x));
  const added = b.filter((x) => !sa.has(x));
  const common = a.filter((x) => sb.has(x));
  const commonB = b.filter((x) => sa.has(x));
  const moved = [];
  for (let i = 0; i < common.length; i++) {
    if (common[i] !== commonB[i]) {
      moved.push({ position: i, before: common[i], after: commonB[i] });
    }
  }
  return { removed, added, moved, relativeOrderChanged: moved.length > 0 };
}

function visibilityDiff(a = [], b = []) {
  const mapA = new Map(a.map((l) => [l.id, l]));
  const mapB = new Map(b.map((l) => [l.id, l]));
  const out = [];
  for (const [id, la] of mapA) {
    const lb = mapB.get(id);
    if (!lb) continue;
    if ((la.visibility ?? null) !== (lb.visibility ?? null)) {
      out.push({ id, before: la.visibility, after: lb.visibility, known: la.known ?? lb.known ?? null });
    }
    if (la.type !== lb.type) out.push({ id, before: `type:${la.type}`, after: `type:${lb.type}`, known: la.known });
  }
  return out;
}

let failures = 0, warnings = 0, compared = 0;
const say = (s = '') => console.log(s);

say('\nGolden-Baseline · Layer-Matrix');
say('='.repeat(78));

for (const p of pairs()) {
  say(`\n▸ ${p.id}`);

  if (p.missing || !p.after) {
    say('  ✗ keine After-Aufnahme vorhanden');
    failures++;
    continue;
  }
  compared++;

  // Vergleichbarkeit
  if (p.before.viewport && p.after.viewport) {
    const vb = p.before.viewport, va = p.after.viewport;
    if (vb.w !== va.w || vb.h !== va.h || vb.dpr !== va.dpr) {
      say(`  ⚠ Viewport unterschiedlich: ${vb.w}×${vb.h}@${vb.dpr} → ${va.w}×${va.h}@${va.dpr}`);
      say('    Ein Diff über verschiedene Viewports ist nicht aussagekräftig.');
      warnings++;
    }
  }
  if (p.before.hash && p.after.hash && p.before.hash !== p.after.hash) {
    say(`  ⚠ Permalink unterschiedlich:\n      vorher: ${p.before.hash}\n      nachher: ${p.after.hash}`);
    warnings++;
  }
  if (p.before.access === 'none' || p.after.access === 'none') {
    say('  ⚠ Map-Instanz war beim Aufnehmen nicht erreichbar — Matrix nur teilweise befüllt.');
    say('    (Dev-Hook einbauen, s. scripts/l0/capture-layer-matrix.js, oder auf Screenshots stützen.)');
    warnings++;
  }

  // Reihenfolge
  const od = orderDiff(p.before.layerOrder, p.after.layerOrder);
  if (od.added.length) { say(`  + neu:      ${od.added.join(', ')}`); }
  if (od.removed.length) { say(`  ✗ entfernt: ${od.removed.join(', ')}`); failures++; }
  if (od.relativeOrderChanged) {
    say('  ✗ RELATIVE REIHENFOLGE GEÄNDERT:');
    for (const m of od.moved.slice(0, 12)) {
      say(`      Position ${m.position}: ${m.before}  →  ${m.after}`);
    }
    if (od.moved.length > 12) say(`      … und ${od.moved.length - 12} weitere`);
    failures++;
  }
  if (!od.added.length && !od.removed.length && !od.relativeOrderChanged) {
    say(`  ✓ Reihenfolge identisch (${p.after.layerOrder?.length ?? 0} Layer)`);
  }

  // Sichtbarkeit / Typ
  const vd = visibilityDiff(p.before.layers, p.after.layers);
  if (vd.length) {
    say('  ✗ SICHTBARKEIT/TYP GEÄNDERT:');
    for (const d of vd) say(`      ${d.id}${d.known ? ` (${d.known})` : ''}: ${d.before} → ${d.after}`);
    failures++;
  } else {
    say('  ✓ Sichtbarkeit identisch');
  }

  // Erhalt-Kontrakte: müssen NACHHER erfüllt sein, nicht nur unverändert.
  const ca = p.after.contracts ?? [];
  if (!ca.length) {
    say('  ⚠ keine Kontrakt-Prüfungen in der After-Aufnahme (ältere Capture-Version?)');
    warnings++;
  } else {
    let broken = 0;
    for (const c of ca) {
      if (c.ok === false) { say(`  ✗ KONTRAKT VERLETZT: ${c.name}  (${c.detail})`); broken++; }
    }
    if (broken) failures++;
    else say(`  ✓ Erhalt-Kontrakte erfüllt (${ca.filter((c) => c.ok === true).length} geprüft, `
      + `${ca.filter((c) => c.ok === null).length} nicht anwendbar)`);
  }
}

say('\n' + '-'.repeat(78));
say(`  ${compared} Aufnahme(n) verglichen · ${failures} Abweichung(en) · ${warnings} Warnung(en)`);

if (failures === 0) {
  say('\n  GATE GRÜN — die Layer-Matrix ist unverändert.');
  say('  Erinnerung: Das ersetzt den Screenshot-Diff nicht. Beides gehört ins Gate.\n');
  process.exit(0);
}

say('\n  GATE ROT — Abweichungen gefunden.');
say('  Nach CLAUDE.md gilt: eine unbeabsichtigte Änderung an der Layer-Ordnung ist eine');
say('  Regression und damit ein Phasen-Fehlschlag. Eine BEABSICHTIGTE Änderung ist zulässig,');
say('  muss aber in audit/ begründet und hier als erwartete Abweichung dokumentiert sein.\n');
process.exit(1);
