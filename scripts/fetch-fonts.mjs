/**
 * Holt die selbst gehosteten Web-Schriften nach `public/fonts/` (V-102).
 *
 * Warum selbst hosten: Bis 2026-08-01 lud `index.html` die Schriften
 * render-blockierend von `fonts.googleapis.com`, wodurch bei JEDEM Seitenaufruf
 * ungefragt eine Verbindung inkl. IP-Adresse zu einem Drittanbieter aufgebaut
 * wurde — in Deutschland ein bekanntes Streitthema (LG München I, 3 O 17493/20)
 * und ein Widerspruch zur Aussage „ohne Tracker" (D-02).
 *
 * Lizenz: Space Grotesk, IBM Plex Mono und League Spartan stehen unter der
 * SIL Open Font License 1.1 — Selbst-Hosten ist ausdrücklich erlaubt.
 *
 * Bewusst KEIN Subsetting und KEINE Umstellung auf Variable Fonts: wir laden
 * exakt dieselben statischen Schnitte, die Google bisher ausgeliefert hat, in
 * den Subsets `latin` + `latin-ext`. Damit ist das Schriftbild unverändert
 * (Funktionserhalt) und es fehlen keine Glyphen (ä/ö/ü/ß, ·, →, °).
 * Nicht übernommen: cyrillic, cyrillic-ext, vietnamese — für eine
 * DACH-Anwendung ohne Nutzen.
 *
 * Aufruf:  node scripts/fetch-fonts.mjs
 * Ausgabe: public/fonts/*.woff2 + src/fonts.css (generiert, nicht von Hand ändern)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'fonts');
const CSS_OUT = join(ROOT, 'src', 'fonts.css');

// Exakt die Familien/Schnitte, die index.html bis 2026-08-01 angefordert hat.
const GOOGLE_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700' +
  '&family=IBM+Plex+Mono:wght@400;500' +
  '&family=League+Spartan:wght@300;400;500;600;700;800&display=swap';

// Ein moderner UA ist nötig, sonst liefert Google TTF statt WOFF2.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const css = await fetch(GOOGLE_CSS_URL, { headers: { 'User-Agent': UA } }).then((r) => {
  if (!r.ok) throw new Error(`Google-CSS: HTTP ${r.status}`);
  return r.text();
});

// Blöcke sind im Google-CSS durch `/* <subset> */` vor jedem @font-face markiert.
const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
if (!blocks.length) throw new Error('Keine @font-face-Blöcke gefunden — Google-CSS-Format geändert?');

mkdirSync(OUT_DIR, { recursive: true });

const out = [];
let kept = 0;
let bytes = 0;

for (const [, subset, block] of blocks) {
  if (!KEEP_SUBSETS.has(subset)) continue;

  const family = /font-family:\s*'([^']+)'/.exec(block)?.[1];
  const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
  const style = /font-style:\s*(\w+)/.exec(block)?.[1] ?? 'normal';
  const url = /url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
  const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1]?.trim();
  if (!family || !weight || !url || !range) throw new Error(`Block unvollständig:\n${block}`);

  const name = `${slug(family)}-${weight}-${subset}.woff2`;
  const buf = Buffer.from(await fetch(url, { headers: { 'User-Agent': UA } }).then((r) => {
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    return r.arrayBuffer();
  }));
  writeFileSync(join(OUT_DIR, name), buf);
  kept++;
  bytes += buf.length;

  out.push(
    `@font-face {\n` +
      `  font-family: '${family}';\n` +
      `  font-style: ${style};\n` +
      `  font-weight: ${weight};\n` +
      `  font-display: swap;\n` +
      `  src: url('/fonts/${name}') format('woff2');\n` +
      `  unicode-range: ${range};\n` +
      `}`,
  );
}

const header =
  `/* GENERIERT von scripts/fetch-fonts.mjs — nicht von Hand bearbeiten.\n` +
  ` *\n` +
  ` * Selbst gehostete Schriften (SIL OFL 1.1), Subsets latin + latin-ext.\n` +
  ` * Ersetzt die frühere Einbindung über fonts.googleapis.com (V-102):\n` +
  ` * seither baut ein Seitenaufruf keine Verbindung zu einem Drittanbieter auf.\n` +
  ` * Quelle: ${GOOGLE_CSS_URL}\n` +
  ` */\n\n`;

writeFileSync(CSS_OUT, header + out.join('\n\n') + '\n', 'utf8');

console.log(
  `[fonts] ${kept} Schnitte (${KEEP_SUBSETS.size} Subsets), ${(bytes / 1024).toFixed(0)} KB → public/fonts/, src/fonts.css geschrieben.`,
);
