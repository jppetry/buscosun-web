/**
 * Server-Log-Parser für AI-/Such-Crawler und AI-Referrals (Measurement 4.1).
 *
 * buscosun ist tracker-frei → keine JS-Analytics. Sichtbarkeit wird stattdessen
 * aus den Server-Zugriffslogs gemessen. Dieses Skript belegt, dass AI-Crawler
 * echte Inhalte mit HTTP 200 abrufen, und erkennt AI-Referrals (chatgpt.com,
 * perplexity.ai, gemini …) über den Referer.
 *
 *   node scripts/seo/parse-crawler-logs.mjs <access.log> [access2.log ...]
 *
 * Erwartet Combined/Common-Log-Format:
 *   IP - - [date] "GET /pfad HTTP/1.1" 200 1234 "referer" "user-agent"
 * Gibt eine Zusammenfassung je Bot (Treffer, %200, Beispielpfade) und je
 * AI-Referral-Quelle aus. Reines Node-ESM, keine Dependency.
 */

import { readFileSync, existsSync } from 'node:fs';

const CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'Claude-SearchBot',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Googlebot', 'Bingbot',
  'Applebot', 'Applebot-Extended', 'CCBot', 'Amazonbot', 'meta-externalagent', 'Bytespider',
];

const AI_REFERRERS = [
  'chatgpt.com', 'chat.openai.com', 'openai.com',
  'perplexity.ai', 'gemini.google.com', 'bard.google.com',
  'claude.ai', 'copilot.microsoft.com', 'bing.com/chat', 'you.com',
];

// IP … "METHOD /path HTTP/x" status bytes "referer" "user-agent"
const LINE = /"(?:GET|POST|HEAD|PUT|DELETE)\s+(\S+)\s+HTTP\/[\d.]+"\s+(\d{3})\s+\S+\s+"([^"]*)"\s+"([^"]*)"/;

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/seo/parse-crawler-logs.mjs <access.log> [more.log ...]');
  process.exit(2);
}

const botStats = new Map();  // bot -> { hits, ok, paths:Set }
const refStats = new Map();  // source -> { hits, paths:Set }
let totalLines = 0, matched = 0;

function bump(map, key) {
  if (!map.has(key)) map.set(key, { hits: 0, ok: 0, paths: new Set() });
  return map.get(key);
}

for (const file of files) {
  if (!existsSync(file)) { console.error(`[warn] Datei fehlt: ${file}`); continue; }
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    totalLines++;
    const m = LINE.exec(line);
    if (!m) continue;
    const [, path, status, referer, ua] = m;
    matched++;

    const bot = CRAWLERS.find((c) => ua.toLowerCase().includes(c.toLowerCase()));
    if (bot) {
      const s = bump(botStats, bot);
      s.hits++;
      if (status === '200') s.ok++;
      if (s.paths.size < 5) s.paths.add(path);
    }
    const ref = AI_REFERRERS.find((r) => referer.toLowerCase().includes(r));
    if (ref) {
      const s = bump(refStats, ref);
      s.hits++;
      if (s.paths.size < 5) s.paths.add(path);
    }
  }
}

console.log(`\n[parse-crawler-logs] ${matched}/${totalLines} Zeilen geparst aus ${files.length} Datei(en).`);

console.log('\n=== AI-/Such-Crawler ===');
if (botStats.size === 0) {
  console.log('  (keine bekannten Crawler gefunden)');
} else {
  for (const [bot, s] of [...botStats].sort((a, b) => b[1].hits - a[1].hits)) {
    const pct = Math.round((s.ok / s.hits) * 100);
    const flag = pct === 100 ? '✓' : pct >= 90 ? '·' : '⚠';
    console.log(`  ${flag} ${bot.padEnd(20)} ${String(s.hits).padStart(6)} Treffer, ${pct}% HTTP 200`);
    console.log(`      z. B. ${[...s.paths].join(', ')}`);
  }
}

console.log('\n=== AI-Referrals (Referer) ===');
if (refStats.size === 0) {
  console.log('  (keine AI-Referrals gefunden)');
} else {
  for (const [src, s] of [...refStats].sort((a, b) => b[1].hits - a[1].hits)) {
    console.log(`  ${src.padEnd(24)} ${String(s.hits).padStart(6)} Besuche`);
    console.log(`      z. B. ${[...s.paths].join(', ')}`);
  }
}

// Exit 1, falls ein Crawler überwiegend Nicht-200 bekommt (Hinweis auf Blockade).
let problem = false;
for (const [, s] of botStats) if (s.hits >= 5 && s.ok / s.hits < 0.9) problem = true;
console.log('');
process.exit(problem ? 1 : 0);
