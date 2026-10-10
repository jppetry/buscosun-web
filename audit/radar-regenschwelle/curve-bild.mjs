// Phase RG — the precision/POD curve as an image: SVG from score.json (primary W1, hold-out, blue area), PNG via the
// headless shooter (`scripts/lib/headlessShot.mjs`). Usage: node audit/radar-regenschwelle/curve-bild.mjs [score.json] [out.svg]
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { findHeadlessChrome, openShooter } from '../../scripts/lib/headlessShot.mjs';

const [scorePath = 'audit/radar-regenschwelle/ergebnis/score.json', outSvg = 'audit/radar-regenschwelle/kurve-w1.svg'] = process.argv.slice(2);
const r = JSON.parse(readFileSync(scorePath, 'utf8'));
const W = 1100, H = 560, L = 70, R = 70, T = 50, B = 70;
const xs = (s) => L + ((W - L - R) * Math.log10(s / 0.012)) / Math.log10(0.504 / 0.012);
const ys = (p) => T + (H - T - B) * (1 - p);
const rows = r.primary.rows.filter((x) => x.s !== 'echo'), hold = r.holdoutW1.rows.filter((x) => x.s !== 'echo');
const echo = r.primary.rows.find((x) => x.s === 'echo');
const path = (arr, f) => arr.map((x, i) => `${i ? 'L' : 'M'}${xs(x.s).toFixed(1)},${ys(f(x)).toFixed(1)}`).join(' ');
const band = (arr, lo, hi) => `${arr.map((x, i) => `${i ? 'L' : 'M'}${xs(x.s).toFixed(1)},${ys(lo(x)).toFixed(1)}`).join(' ')} ${[...arr].reverse().map((x) => `L${xs(x.s).toFixed(1)},${ys(hi(x)).toFixed(1)}`).join(' ')} Z`;
const ticks = [0.012, 0.024, 0.036, 0.06, 0.1, 0.12, 0.2, 0.3, 0.5];
const area = (s) => r.area[s.toFixed(3)] ?? null;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="League Spartan, Arial, sans-serif" font-size="13">
<rect width="${W}" height="${H}" fill="#F5F2EA"/>
<text x="${L}" y="28" font-size="17" fill="#1B1B1B">Phase RG — Trefferquote und Erfassung je Schwelle (DE, RV-Analysen 08.–10.10.2026, Wahrheit W1 = Indikator-Stationen)</text>
${[0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1].map((p) => `<line x1="${L}" x2="${W - R}" y1="${ys(p)}" y2="${ys(p)}" stroke="${p === 0.9 ? '#B22' : '#D8D3C6'}" stroke-width="${p === 0.9 ? 1.5 : 1}" stroke-dasharray="${p === 0.9 ? '6 4' : ''}"/><text x="${L - 8}" y="${ys(p) + 4}" text-anchor="end" fill="#444">${Math.round(p * 100)} %</text>`).join('')}
${ticks.map((s) => `<line x1="${xs(s)}" x2="${xs(s)}" y1="${T}" y2="${H - B}" stroke="#E6E1D4"/><text x="${xs(s)}" y="${H - B + 18}" text-anchor="middle" fill="#444">${s.toFixed(s < 0.1 ? 3 : 2).replace('.', ',')}</text>`).join('')}
<text x="${(L + W - R) / 2}" y="${H - 22}" text-anchor="middle" fill="#1B1B1B">Schwelle s (mm/h, native Stufen, logarithmisch)</text>
<path d="${band(rows, (x) => x.precLo, (x) => x.precHi)}" fill="#2F6FD6" fill-opacity="0.18"/>
<path d="${band(rows, (x) => x.podLo, (x) => x.podHi)}" fill="#D98A1E" fill-opacity="0.18"/>
<path d="${path(rows, (x) => x.prec)}" fill="none" stroke="#2F6FD6" stroke-width="2.5"/>
<path d="${path(hold, (x) => x.prec)}" fill="none" stroke="#2F6FD6" stroke-width="1.5" stroke-dasharray="3 3"/>
<path d="${path(rows, (x) => x.pod)}" fill="none" stroke="#D98A1E" stroke-width="2.5"/>
<path d="${path(rows, (x) => area(x.s) * 2)}" fill="none" stroke="#6B6B6B" stroke-width="1.5" stroke-dasharray="8 4"/>
<line x1="${xs(0.012)}" x2="${xs(0.504)}" y1="${ys(echo.prec)}" y2="${ys(echo.prec)}" stroke="#2F6FD6" stroke-width="1" stroke-dasharray="2 6"/>
<text x="${W - R + 6}" y="${ys(echo.prec) + 4}" fill="#2F6FD6">heute ${(100 * echo.prec).toFixed(1).replace('.', ',')} %</text>
<rect x="${W - 330}" y="${T + 8}" width="300" height="88" fill="#FFFFFF" fill-opacity="0.85" stroke="#D8D3C6"/>
<line x1="${W - 320}" x2="${W - 290}" y1="${T + 26}" y2="${T + 26}" stroke="#2F6FD6" stroke-width="2.5"/><text x="${W - 282}" y="${T + 30}" fill="#1B1B1B">Trefferquote P(nass | blau), Band 90 %; gestrichelt Hold-out</text>
<line x1="${W - 320}" x2="${W - 290}" y1="${T + 48}" y2="${T + 48}" stroke="#D98A1E" stroke-width="2.5"/><text x="${W - 282}" y="${T + 52}" fill="#1B1B1B">Erfassung P(blau | nass), Band 90 %</text>
<line x1="${W - 320}" x2="${W - 290}" y1="${T + 70}" y2="${T + 70}" stroke="#6B6B6B" stroke-width="1.5" stroke-dasharray="8 4"/><text x="${W - 282}" y="${T + 74}" fill="#1B1B1B">blaue Fläche (× 2; 50 % der Achse = 25 % der Radarfläche)</text>
<line x1="${W - 320}" x2="${W - 290}" y1="${T + 86}" y2="${T + 86}" stroke="#B22" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${W - 282}" y="${T + 90}" fill="#1B1B1B">Ziel Z = 90 % (Empfehlung)</text>
<text x="${L}" y="${H - 6}" fill="#6B6B6B" font-size="11">n ${r.primary.n} Stations-Intervalle (Auswahl), ${r.stationsInd} Stationen mit Indikator, ${r.slots} Analysen; Regel R-RG-1 eingefroren ${r.frozen.split('\n')[0].slice(0, 12)}…</text>
</svg>`;
writeFileSync(outSvg, svg);
const chrome = findHeadlessChrome();
if (chrome) {
  const shooter = await openShooter(chrome);
  try { await shooter.shot(pathToFileURL(resolve(outSvg)).href, outSvg.replace(/\.svg$/, '.png'), { width: W, height: H }); console.log(`→ ${outSvg}, ${outSvg.replace(/\.svg$/, '.png')}`); }
  finally { await shooter.close?.(); }
} else console.log(`→ ${outSvg} (kein headless Chrome gefunden, kein PNG)`);
