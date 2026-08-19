/**
 * check-budget.mjs — Performance-Budget als prüfbares Artefakt (V-39).
 *
 *   npm run build && npm run budget          # prüft dist/ gegen budget.json
 *   npm run budget -- --update               # schreibt die IST-Werte als neue Grenze
 *
 * ── Warum ────────────────────────────────────────────────────────────────────
 * „Schnell" ohne Messung ist eine Behauptung — und eine Plattform, die
 * Unsicherheit ausweist (D-04), sollte auch ihre eigene Leistung messen. Bisher
 * fiel eine Bundle-Regression erst auf, wenn jemand zufällig auf die
 * Vite-Warnung schaute; die 500-kB-Warnung von Rollup steht seit Monaten im
 * Build-Log und ist dadurch unsichtbar geworden.
 *
 * ── Was gemessen wird ────────────────────────────────────────────────────────
 * `eagerJs` / `eagerCss`: nur das, was der Browser für den ERSTEN Frame laden
 * muss — der Entry aus `dist/index.html` plus alle `modulepreload`-Chunks und
 * Stylesheets. Lazy-Chunks (Historie, Route, Event, Globus …) zählen bewusst
 * NICHT mit: sie sind der Grund, warum die Startseite trotz 12 Features klein
 * bleibt, und wer sie mitzählte, würde Code-Splitting bestrafen.
 * `largestChunk`: der größte einzelne Chunk überhaupt — fängt den Fall ab, dass
 * ein Vendor-Brocken unbemerkt wächst (heute: maplibre-gl).
 * `totalJs`: Summe aller JS-Chunks — die Deploy-Größe.
 *
 * Gemessen wird IMMER gzip, weil Netlify gzip/brotli ausliefert; die Rohgröße
 * steht nur zur Information daneben.
 *
 * ── Grenze vs. Ziel ──────────────────────────────────────────────────────────
 * `limitKb` ist eine RATSCHE gegen Regression, kein Wunschwert: sie steht knapp
 * über dem heutigen Stand. `targetKb` ist der angestrebte Wert aus dem
 * Rendering-Audit (Eager-JS ≤ 90 KB gzip). Ein überschrittenes Ziel ist KEIN
 * Fehlschlag — es wird als Hinweis gedruckt. Nur `limitKb` färbt rot. So wird
 * das Budget sofort nützlich, statt am ersten Tag rot zu sein und ignoriert zu
 * werden (die Lehre aus V-91: ein Prüfmittel, dem niemand glaubt, ist wertlos).
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const BUDGET_FILE = 'budget.json';
const update = process.argv.includes('--update');

if (!existsSync(DIST)) {
  console.error(`[budget] ${DIST}/ fehlt — erst "npm run build" ausführen.`);
  process.exit(2);
}

const gzipKb = (path) => gzipSync(readFileSync(path)).length / 1024;
const rawKb = (path) => statSync(path).size / 1024;

// ── Eager-Assets aus index.html lesen (nicht raten) ──────────────────────────
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const hrefs = (re) => [...html.matchAll(re)].map((m) => m[1]).filter((h) => h.startsWith('/'));
const eagerJsFiles = [
  ...hrefs(/<script[^>]*\ssrc="([^"]+)"/g),
  ...hrefs(/rel="modulepreload"[^>]*\shref="([^"]+)"/g),
].filter((h) => h.endsWith('.js'));
const eagerCssFiles = hrefs(/rel="stylesheet"[^>]*\shref="([^"]+)"/g).filter((h) => h.endsWith('.css'));

if (!eagerJsFiles.length) {
  console.error('[budget] Kein Entry-Script in dist/index.html gefunden — Build-Format geändert?');
  process.exit(2);
}

const sum = (files, fn) => files.reduce((s, f) => s + fn(join(DIST, f.replace(/^\//, ''))), 0);

// ── Alle Chunks für largestChunk / totalJs ───────────────────────────────────
const assetsDir = join(DIST, 'assets');
const allJs = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((f) => f.endsWith('.js')).map((f) => join(assetsDir, f))
  : [];

const largest = allJs
  .map((p) => ({ name: p.split(/[\\/]/).pop(), kb: gzipKb(p) }))
  .sort((a, b) => b.kb - a.kb)[0] ?? { name: '(keine)', kb: 0 };

const measured = {
  eagerJs: sum(eagerJsFiles, gzipKb),
  eagerCss: sum(eagerCssFiles, gzipKb),
  largestChunk: largest.kb,
  totalJs: allJs.reduce((s, p) => s + gzipKb(p), 0),
};
const raw = {
  eagerJs: sum(eagerJsFiles, rawKb),
  eagerCss: sum(eagerCssFiles, rawKb),
};

const round = (n) => Math.round(n * 10) / 10;

if (update || !existsSync(BUDGET_FILE)) {
  // Ratsche: neue Grenze = IST + 5 % Kopffreiheit, damit Rauschen (Hash-Länge,
  // Minifier-Version) nicht sofort rot färbt.
  const prev = existsSync(BUDGET_FILE) ? JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) : {};
  const budgets = Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, {
    limitKb: round(v * 1.05),
    ...(prev.budgets?.[k]?.targetKb != null ? { targetKb: prev.budgets[k].targetKb } : {}),
  }]));
  writeFileSync(BUDGET_FILE, JSON.stringify({
    note: 'gzip-KB. limitKb = Ratsche gegen Regression (rot). targetKb = Ziel aus dem Rendering-Audit (nur Hinweis). Aktualisieren: npm run budget -- --update',
    updated: prev.updated ?? null,
    budgets,
  }, null, 2) + '\n');
  console.log(`[budget] ${BUDGET_FILE} geschrieben:`);
  for (const [k, v] of Object.entries(measured)) console.log(`  ${k.padEnd(13)} ${round(v)} KB → Grenze ${budgets[k].limitKb} KB`);
  process.exit(0);
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
const rows = [];
let failed = 0;
for (const [key, val] of Object.entries(measured)) {
  const b = budget.budgets?.[key];
  if (!b) { rows.push({ key, val, note: '(keine Grenze definiert)', ok: true }); continue; }
  const ok = val <= b.limitKb;
  if (!ok) failed++;
  const overTarget = b.targetKb != null && val > b.targetKb;
  rows.push({ key, val, limit: b.limitKb, target: b.targetKb, ok, overTarget });
}

console.log(`\nPerformance-Budget (gzip)  ·  ${DIST}/`);
console.log(`  ${'Metrik'.padEnd(14)} ${'IST'.padEnd(10)} ${'Grenze'.padEnd(10)} ${'Ziel'.padEnd(10)} Status`);
console.log(`  ${'-'.repeat(14)} ${'-'.repeat(10)} ${'-'.repeat(10)} ${'-'.repeat(10)} ------`);
for (const r of rows) {
  console.log(
    `  ${r.key.padEnd(14)} ${(round(r.val) + ' KB').padEnd(10)} ` +
    `${(r.limit != null ? r.limit + ' KB' : '—').padEnd(10)} ${(r.target != null ? r.target + ' KB' : '—').padEnd(10)} ` +
    `${r.ok ? '✓' : '✗ ÜBER GRENZE'}${r.ok && r.overTarget ? '  (über Ziel — Hinweis, kein Fehler)' : ''}`
  );
}
console.log(`\n  größter Chunk: ${largest.name} (${round(largest.kb)} KB gzip)`);
console.log(`  eager roh: JS ${round(raw.eagerJs)} KB · CSS ${round(raw.eagerCss)} KB\n`);

if (failed) {
  for (const r of rows.filter((x) => !x.ok)) {
    console.log(`::error::Budget überschritten: ${r.key} ${round(r.val)} KB > ${r.limit} KB (gzip)`);
  }
  console.log(`${failed} Budget(s) überschritten. Entweder die Ursache beheben oder die Grenze bewusst`);
  console.log(`anheben: npm run budget -- --update  (die Anhebung ist dann im Diff sichtbar).\n`);
  process.exit(1);
}
console.log('Alle Budgets eingehalten.\n');
process.exit(0);
