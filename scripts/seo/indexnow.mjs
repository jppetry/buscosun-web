/**
 * IndexNow-Meldung (SEO/GEO 2026, E10) — kostenlos, ohne Konto, ohne Abhängigkeit.
 *
 * Bing, Yandex, Seznam und Naver teilen einen Endpunkt: Wer eine URL-Liste meldet, wird
 * schneller gecrawlt, statt auf den nächsten Besuch zu warten. Google nimmt nicht teil —
 * dort wirkt nur die Search Console (MANUELLE-SCHRITTE Nr. 3).
 *
 * Bestätigt wird der Besitz über eine Schlüsseldatei im Web-Wurzelverzeichnis
 * (`public/<key>.txt`, Inhalt = der Schlüssel). Sie muss VOR der Meldung live sein.
 *
 * Aufruf:
 *   node scripts/seo/indexnow.mjs            # meldet alle URLs aus den erzeugten Sitemaps
 *   node scripts/seo/indexnow.mjs --dry      # zeigt nur, was gemeldet würde
 *
 * Es ist unschädlich, das mehrfach zu tun; sinnvoll ist es nach größeren Inhaltsänderungen.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');
const HOST = 'buscosun.com';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Schlüssel = Name der einzigen 32-stelligen .txt-Datei in public/. */
function findKey() {
  const pub = join(ROOT, 'public');
  const hit = readdirSync(pub).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (!hit) throw new Error('keine IndexNow-Schlüsseldatei in public/ gefunden');
  const key = hit.replace(/\.txt$/, '');
  const content = readFileSync(join(pub, hit), 'utf8').trim();
  if (content !== key) throw new Error(`Schlüsseldatei ${hit} enthält nicht den Schlüssel selbst`);
  return key;
}

function sitemapUrls() {
  const urls = [];
  for (const f of ['sitemap-pages.xml', 'sitemap-orte.xml']) {
    const p = join(DIST, f);
    if (!existsSync(p)) throw new Error(`${f} fehlt — vorher \`npm run build\``);
    for (const m of readFileSync(p, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(m[1]);
  }
  return urls;
}

const dry = process.argv.includes('--dry');
const key = findKey();
const urlList = sitemapUrls();
console.log(`[indexnow] ${urlList.length} URLs, Schlüssel ${key.slice(0, 6)}… (Datei https://${HOST}/${key}.txt)`);

if (dry) {
  console.log(urlList.slice(0, 5).join('\n') + `\n… und ${urlList.length - 5} weitere`);
  process.exit(0);
}

const body = { host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList };
const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(`[indexnow] HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`);
// 200 = angenommen, 202 = angenommen, Schlüssel wird noch geprüft. Alles andere ist ein Fehler.
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
