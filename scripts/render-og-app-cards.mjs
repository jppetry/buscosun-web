/**
 * SH6 — erzeugt die Vorschaubilder der App-Seiten (`public/og/app/*.png`).
 *
 * EIN Lauf, keine neue Abhängigkeit: die Karten entstehen aus
 * `public/_og-app-card.html` (Optik E-5: heller Rahmen, dunkles Kartenfeld),
 * gerendert von dem Headless-Chromium, das ohnehin auf dem Rechner liegt.
 * Welche Karte es gibt, entscheidet NICHT dieses Skript, sondern die
 * Routen-Tabelle plus `src/share/ogCard.ts` — dieselbe Quelle, aus der die
 * Shells und die Edge Function den Pfad ableiten.
 *
 * Aufruf:
 *   npm run og:app-cards               (alle fehlenden)
 *   npm run og:app-cards -- --all      (alle neu)
 *   npm run og:app-cards -- --pick wetterkarte-wind,globus
 *
 * (`--only` geht NICHT: npm frisst den Namen als eigene Option und meldet
 *  „invalid config only=…" — der Filter käme nie im Skript an.)
 *
 * Der eigene Mini-Server serviert `public/` — es braucht weder `vite build`
 * noch `vite preview`, damit ein Kartenlauf nicht am Bundle hängt.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findHeadlessChrome, openShooter } from './lib/headlessShot.mjs';

import { ROUTES } from '../src/router/routes.ts';
import { ogCardSlug, ogCardStyle, hasOgCard, OG_WIDTH, OG_HEIGHT } from '../src/share/ogCard.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const OUT = join(PUBLIC, 'og', 'app');

const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
const ONLY = (() => {
  const i = argv.indexOf('--pick');
  return i >= 0 && argv[i + 1] ? new Set(argv[i + 1].split(',').map((s) => s.trim())) : null;
})();

// --- Welche Karten? -----------------------------------------------------------

/** Erste Aussage der Description — bis zum Gedankenstrich, Doppelpunkt oder Semikolon. */
function subline(text) {
  if (!text) return '';
  const cut = text.split(/\s+—\s+|\s+–\s+|:\s+|;\s+/)[0].trim();
  if (cut.length <= 96) return cut;
  // Nie mitten im Wort abschneiden — eine Karte ist kein Fließtext.
  const head = cut.slice(0, 93);
  const sp = head.lastIndexOf(' ');
  return `${(sp > 60 ? head.slice(0, sp) : head).replace(/[,;:]$/, '')} …`;
}

/** Titel für die Karte: der Teil vor dem Gedankenstrich (der Rest steht in der Description). */
function cardTitle(title) {
  return title.split(/\s+—\s+|\s+–\s+/)[0].trim();
}

function collectCards() {
  const cards = [];
  for (const r of ROUTES) {
    if (!hasOgCard(r.id)) continue;
    const style = ogCardStyle(r.id);
    cards.push({
      slug: ogCardSlug(r.id),
      path: r.path,
      eyebrow: style.eyebrow,
      accent: style.accent,
      motif: style.motif,
      title: cardTitle(r.meta.title),
      sub: subline(r.meta.description),
    });
    for (const s of r.subs ?? []) {
      // Der Cross-Alias `/wetterkarte/warnungen` ist keine eigene Seite (er
      // zeigt auf `/warnungen`) und bekommt deshalb auch keine eigene Karte.
      if (r.id === 'wetterkarte' && s.slug === 'warnungen') continue;
      cards.push({
        slug: ogCardSlug(r.id, s.slug),
        path: `${r.path}/${s.slug}`,
        eyebrow: style.eyebrow,
        accent: style.accent,
        motif: style.motif,
        title: cardTitle(s.title),
        sub: subline(s.description),
      });
    }
  }
  return cards;
}

// --- Mini-Server für public/ --------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

function servePublic() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const file = join(PUBLIC, url.replace(/^\/+/, ''));
      if (!file.startsWith(PUBLIC) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// --- Lauf ---------------------------------------------------------------------

const chrome = findHeadlessChrome();
if (!chrome) {
  console.error('Kein chrome-headless-shell gefunden.');
  console.error('Erwartet unter %LOCALAPPDATA%\\ms-playwright\\chromium_headless_shell-*\\chrome-headless-shell-win64\\,');
  console.error('oder Pfad in der Umgebungsvariablen OG_CHROME setzen.');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const cards = collectCards().filter((c) => (ONLY ? ONLY.has(c.slug) : true));
const { server, port } = await servePublic();
console.log(`Karten: ${cards.length} · Chromium: ${chrome} · Server: http://127.0.0.1:${port}`);

const shooter = await openShooter(chrome);
let rendered = 0, skipped = 0, failed = 0;
for (const c of cards) {
  const out = join(OUT, `${c.slug}.png`);
  if (!ALL && !ONLY && existsSync(out)) { skipped++; continue; }
  const q = new URLSearchParams({
    e: c.eyebrow, t: c.title, s: c.sub, c: c.accent, m: c.motif, g: `buscosun.com${c.path}`,
  });
  const url = `http://127.0.0.1:${port}/_og-app-card.html?${q.toString()}`;
  try {
    // Die Karte befragt sich selbst: liegt das dunkle Feld noch vollstaendig in
    // der Flaeche, und ist der Titel nicht aus seiner Spalte gewachsen? Ein
    // langer Titel („Amtliche Unwetterwarnungen DE · CH") hat genau das einmal
    // gesprengt — am PNG gesehen. Seither prueft es der Lauf selbst.
    const probe = await shooter.shot(url, out, {
      width: OG_WIDTH, height: OG_HEIGHT,
      probe: `(() => {
        const f = document.querySelector('.field').getBoundingClientRect();
        const t = document.getElementById('title');
        return { right: Math.round(f.right), left: Math.round(f.left),
                 titleFits: t.scrollWidth <= t.clientWidth + 1, size: t.style.fontSize || '66px' };
      })()`,
    });
    if (probe && (probe.right > OG_WIDTH || probe.left < OG_WIDTH / 2 || !probe.titleFits)) {
      failed++;
      console.error(`LAYOUT ${c.slug}: Feld ${probe.left}..${probe.right}, Titel passt=${probe.titleFits} (${probe.size})`);
      continue;
    }
    rendered++;
    console.log(`  ${rendered}/${cards.length}  ${c.slug}  (Titel ${probe?.size ?? '?'})`);
  } catch (err) {
    failed++;
    console.error(`FEHLER ${c.slug}: ${err.message}`);
  }
}
await shooter.close();
server.close();

console.log(`\nfertig: ${rendered} gerendert, ${skipped} übersprungen (schon da), ${failed} fehlgeschlagen`);
process.exit(failed ? 1 : 0);
