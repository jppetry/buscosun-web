/**
 * AP16 (V-FI-85) — tpiSigma: die regionale Streuung des TPI, gegen die PAP 5 sein Muldengate „TPI < −1σ" prüft
 * (`terrainTerms.ts`: TPI = tpi2000 ?? tpi500). Braucht kein Archiv, nur das Gelände — gemessen mit dem PRODUKT-Lader
 * (`src/point/client/terrain.ts`, Terrarium z11 + z8), Ergebnis NUR über den Fit-Kern (`fitCalib({ tpi })`) als Datei
 * neben diesem Skript, nie ins Produkt:
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-vollform/tpi-sigma.mjs [--n=110]
 *
 * Stichprobe: gleichverteilte Zufallspunkte (Math.imul-LCG, Saat 20260918) im DACH-Rechteck; die Region ist das Land der
 * nächsten Archivstation (`scripts/punktarchiv/points.json`), wenn sie ≤ 25 km entfernt ist und in DE/AT/CH liegt
 * (Näherung für das Staatsgebiet, benannt) — sonst verworfen; Punkte ohne Höhe oder ≤ 0 m (Meer) ebenso. Je Region `--n`
 * Punkte (Voreinstellung 110; `CALIB_N_MIN.tpiSigma` = 100). Dazu, zum Vergleich, die Archivstationen selbst: welcher
 * Anteil von ihnen läge mit dem gemessenen σ im Muldengate (nur berichtet).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadTerrainAtPoint } from '../../src/point/client/terrain.ts';
import { memoryBackend } from '../../src/point/client/cache.ts';
import { fitCalib } from '../../src/point/calibFit.ts';
import { decodePng, toRgba } from '../../scripts/lib/png.mjs';

const N = Number(process.argv.find((a) => a.startsWith('--n='))?.slice(4) ?? 110);
const stations = JSON.parse(readFileSync(new URL('../../scripts/punktarchiv/points.json', import.meta.url), 'utf8')).points;
const kmBetween = (a, b, c, d) => {
  const r = Math.PI / 180, x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r;
  return 6371 * Math.hypot(x, y);
};
const regionOf = (lat, lon) => {
  let best = null, bd = Infinity;
  for (const s of stations) { const d = kmBetween(lat, lon, s.lat, s.lon); if (d < bd) { bd = d; best = s; } }
  return bd <= 25 && ['DE', 'AT', 'CH'].includes(best.country) ? best.country : null;
};

const cache = memoryBackend();
const opts = { decodeRgba: (bytes) => { const img = decodePng(Buffer.from(bytes)); return { data: toRgba(img), width: img.width, height: img.height }; }, cache, timeoutMs: 20_000 };
let seed = 20260918 | 0;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) | 0; return (seed >>> 0) / 4294967296; };

const want = { DE: N, AT: N, CH: N };
const got = { DE: [], AT: [], CH: [] };
const cand = [];
for (let tries = 0; tries < 200_000 && Object.keys(want).some((r) => cand.filter((c) => c.region === r).length < want[r] * 1.25); tries++) {
  const lat = 45.8 + rnd() * (55.1 - 45.8), lon = 5.9 + rnd() * (17.2 - 5.9);
  const region = regionOf(lat, lon);
  if (region && cand.filter((c) => c.region === region).length < want[region] * 1.25) cand.push({ lat, lon, region });
}
const T0 = performance.now();
let failed = 0, sea = 0;
const queue = [...cand];
async function worker() {
  while (queue.length) {
    const c = queue.shift();
    if (got[c.region].length >= want[c.region]) continue;
    try {
      const t = await loadTerrainAtPoint(c.lat, c.lon, opts);
      const tpi = t.tpi2000M ?? t.tpi500M;
      if (t.elevationM == null || !(t.elevationM > 0)) { sea++; continue; }
      if (tpi == null) { failed++; continue; }
      if (got[c.region].length < want[c.region]) got[c.region].push({ ...c, tpiM: tpi, tpi500M: t.tpi500M, elevM: t.elevationM });
    } catch { failed++; }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
const sample = [...got.DE, ...got.AT, ...got.CH];
const sd = (xs) => { const m = xs.reduce((a, x) => a + x, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
console.log(`Gelände: ${sample.length} Punkte (DE ${got.DE.length} · AT ${got.AT.length} · CH ${got.CH.length}), verworfen Meer ${sea}, ohne TPI/Fehler ${failed}; ${((performance.now() - T0) / 1000).toFixed(0)} s`);
for (const r of ['DE', 'AT', 'CH']) {
  const xs = got[r].map((x) => x.tpiM);
  console.log(`  ${r}: σ(TPI2000) ${sd(xs).toFixed(1)} m · p10/p50/p90 ${q(xs, 0.1).toFixed(0)}/${q(xs, 0.5).toFixed(0)}/${q(xs, 0.9).toFixed(0)} m · σ(TPI500) ${sd(got[r].map((x) => x.tpi500M)).toFixed(1)} m · Höhe p50 ${q(got[r].map((x) => x.elevM), 0.5).toFixed(0)} m`);
}
console.log(`  alle: σ(TPI2000) ${sd(sample.map((x) => x.tpiM)).toFixed(1)} m`);

// Über den Fit-Kern (nie direkt ins Produkt): Schema-2-Eintrag mit n, Schätzer, Regionen.
const asOfMs = Date.UTC(2026, 8, 18, 12);
const fit = fitCalib([], { asOfMs, tpi: sample.map((x) => ({ region: x.region, tpiM: x.tpiM })) });
const rep = fit.report.find((x) => x.path === 'tpiSigma');
console.log(`Fit-Kern: tpiSigma ${rep.status}, n ${rep.n}, Wert ${JSON.stringify(rep.value ?? null)}`);
writeFileSync(new URL('./tpi-sigma.fit.json', import.meta.url), JSON.stringify({ note: 'AP16 V-FI-85 — nur Diagnose, nicht im Produkt; Stichprobe s. tpi-sigma.mjs', entry: fit.entries.tpiSigma ?? null, report: rep }, null, 2) + '\n');

// Zum Vergleich: die Archivstationen im Muldengate mit dem gemessenen σ (default) — nur berichtet.
const sigma = rep.value?.default;
if (sigma) {
  const pick = stations.filter((s, i) => i % 3 === 0 && ['DE', 'AT', 'CH'].includes(s.country));
  const res = [];
  const q2 = [...pick];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (q2.length) {
      const s = q2.shift();
      try { const t = await loadTerrainAtPoint(s.lat, s.lon, opts); const tpi = t.tpi2000M ?? t.tpi500M; if (tpi != null) res.push({ country: s.country, tpi, regional: rep.value[s.country] ?? sigma }); } catch { /* gezählt */ }
    }
  }));
  const inGate = (xs, key) => xs.filter((x) => x.tpi < -x[key]).length;
  const withDefault = res.map((x) => ({ ...x, def: sigma }));
  console.log(`Archivstationen (jede 3., DE/AT/CH): ${res.length}; im Muldengate TPI < −σ: mit σ default ${inGate(withDefault, 'def')} (${(100 * inGate(withDefault, 'def') / res.length).toFixed(1)} %), mit σ je Land ${inGate(res, 'regional')} (${(100 * inGate(res, 'regional') / res.length).toFixed(1)} %); σ der Stationen selbst ${sd(res.map((x) => x.tpi)).toFixed(1)} m`);
}
