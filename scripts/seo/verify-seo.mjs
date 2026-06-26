/**
 * Roh-HTML-Regressionstest für das SEO/GEO-Paket (HARD GATE 0.2).
 *
 * Läuft NACH `npm run build` gegen dist/. Beweist, dass aller indexierbare
 * Inhalt (H1, Lead, Meta, JSON-LD) im rohen HTML steht — ohne JS-Ausführung.
 * Reines Node-ESM, kein App-Import. Exit-Code != 0 ⇒ Fail-Stop.
 *
 *   node scripts/seo/verify-seo.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');

let failures = 0;
let checks = 0;

function fail(file, msg) {
  failures++;
  console.error(`  ✗ [${file}] ${msg}`);
}
function ok(file, msg) {
  checks++;
  console.log(`  ✓ [${file}] ${msg}`);
}

/** Alle <script type="application/ld+json">…</script>-Blöcke extrahieren + parsen. */
function jsonLdBlocks(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1].trim());
  return out;
}

/** Wortzahl des längsten Absatzes (Direktantwort-Lead, robust gg. Reihenfolge). */
function leadWordCount(html) {
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m, max = 0;
  while ((m = re.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const n = text ? text.split(' ').length : 0;
    if (n > max) max = n;
  }
  return max;
}

function checkCommon(file, html, { type }) {
  if (!/<h1[\s>]/i.test(html)) fail(file, 'kein <h1>');
  else ok(file, 'H1 vorhanden');

  if (!/<title[\s>]/i.test(html)) fail(file, 'kein <title>');
  else ok(file, '<title> vorhanden');

  if (!/<meta[^>]+name=["']description["']/i.test(html)) fail(file, 'keine meta description');
  else ok(file, 'meta description vorhanden');

  if (!/property=["']og:/i.test(html)) fail(file, 'keine og:-Tags');
  else ok(file, 'OG-Tags vorhanden');

  if (!/rel=["']canonical["']/i.test(html)) fail(file, 'kein canonical');
  else ok(file, 'canonical vorhanden');

  const lead = leadWordCount(html);
  if (lead < 25) fail(file, `Direktantwort-Lead zu kurz (max ${lead} Wörter)`);
  else ok(file, `Direktantwort-Lead (${lead} Wörter)`);

  const blocks = jsonLdBlocks(html);
  if (blocks.length === 0) {
    fail(file, 'kein JSON-LD');
  } else {
    let allValid = true;
    const types = [];
    for (const b of blocks) {
      try {
        const obj = JSON.parse(b);
        if (!obj['@context'] || !obj['@type']) { allValid = false; fail(file, 'JSON-LD ohne @context/@type'); }
        types.push(obj['@type']);
      } catch {
        allValid = false;
        fail(file, 'JSON-LD nicht parsebar');
      }
    }
    if (allValid) ok(file, `JSON-LD valide (${types.join(', ')})`);
    if (type && !types.flat().includes(type)) fail(file, `JSON-LD-Typ ${type} fehlt`);
    else if (type) ok(file, `JSON-LD-Typ ${type} vorhanden`);
  }
}

function read(rel) {
  return readFileSync(join(DIST, rel), 'utf8');
}
function firstChildDir(rel) {
  const dir = join(DIST, rel);
  if (!existsSync(dir)) return null;
  const sub = readdirSync(dir, { withFileTypes: true }).find((d) => d.isDirectory());
  return sub ? `${rel}/${sub.name}/index.html` : null;
}

console.log('[verify-seo] Roh-HTML-Prüfung gegen dist/ …');

if (!existsSync(DIST)) {
  console.error('[verify-seo] dist/ fehlt — zuerst `npm run build`.');
  process.exit(1);
}

// 1) Home (Pflicht)
console.log('\nHome:');
checkCommon('index.html', read('index.html'), { type: 'WebApplication' });

// 2) Ort (Pflicht — Stichproben)
console.log('\nOrtsseiten:');
for (const rel of ['wetter/muenchen/index.html', 'wetter/innsbruck/index.html', 'wetter/zermatt/index.html']) {
  if (existsSync(join(DIST, rel))) checkCommon(rel, read(rel), { type: 'FAQPage' });
  else fail(rel, 'erwartete Ortsseite fehlt');
}

// 3) Optional, aber erzwungen sobald vorhanden: Explainer / Tools / Events
for (const [label, prefix, type] of [
  ['Explainer', 'wissen', 'FAQPage'],
  ['Tool-Landingpages', 'funktionen', 'SoftwareApplication'],
  ['Event-Artikel', 'wetterlage', 'NewsArticle'],
]) {
  const sample = firstChildDir(prefix);
  if (sample) {
    console.log(`\n${label}:`);
    checkCommon(sample, read(sample), { type });
  }
}

console.log(`\n[verify-seo] ${checks} Checks ok, ${failures} Fehler.`);
process.exit(failures > 0 ? 1 : 0);
