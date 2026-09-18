/**
 * AP16 — Landbedeckung an echten Orten mit dem PRODUKT-Lader (`src/point/client/landCover.ts`), netzlesend:
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-vollform/landcover-places.mjs
 *
 * Stichprobe wie §0 (`audit/fusion-vollform.md`): die zehn Orte des Latenz-Harnischs + jeder 13. Archivpunkt
 * (`scripts/punktarchiv/points.json`) = 42 Orte. Quelle: der SHA-gepinnte WorldCover-Spiegel über jsDelivr (nur GET).
 * Je Ort: d_water (Treffer/zensiert, Körpergröße), Abdeckung, κ der Blockzellen je Stufe (Spreizung max/min bei λ 1 und
 * 0,5), z0 des Modells (Box um den Punkt, v1) gegen die Zellbox der nächsten Zelle, Rechenzeiten der Teile (Node) und
 * die Gleichheit „Lader = Teile einzeln" (derselbe Weg zweimal).
 */
import { readFileSync } from 'node:fs';
import { loadWorldCoverTiles, classAtOf, z0FromClassField } from '../../src/point/client/z0Point.ts';
import { loadLandCoverAtPoint, landCoverFromClassField, windowFromTiles, dWaterFromWindow, kappaAt, landCoverCell, kappaOf } from '../../src/point/client/landCover.ts';
import { memoryBackend } from '../../src/point/client/cache.ts';
import { TIER_BY_ID, cellOf, cellCenter, blockOffsets } from '../../src/point/cubeFormat.ts';

const places = [
  ['hamburg', 53.5511, 9.9937], ['berlin', 52.52, 13.405], ['muenchen', 48.1372, 11.5755], ['wien', 48.2082, 16.3738], ['graz', 47.0707, 15.4395],
  ['innsbruck', 47.2692, 11.4041], ['zuerich', 47.3769, 8.5417], ['genf', 46.2044, 6.1432], ['zermatt', 46.0207, 7.7491], ['zugspitze', 47.421, 10.9863],
];
const archive = JSON.parse(readFileSync(new URL('../../scripts/punktarchiv/points.json', import.meta.url), 'utf8')).points;
archive.forEach((p, i) => { if (i % 13 === 0) places.push([`${p.id} ${p.name.trim().slice(0, 14)}`, p.lat, p.lon]); });

const cache = memoryBackend();   // Kachelbytes je URL/Bereich: Nachbarorte teilen Kacheln wie im Browser
const now = () => performance.now();
const rows = [];
let bytes = 0, tilesN = 0;
for (const [name, lat, lon] of places) {
  const tl = await loadWorldCoverTiles(lat, lon, { cache, timeoutMs: 20_000 });
  bytes += tl.bytes; tilesN += tl.tilesFetched;
  if (!tl.usable.length) { rows.push({ name, err: 'keine Kachel' }); continue; }
  const classAt = classAtOf(tl.usable);
  const T0 = now();
  const z = z0FromClassField(classAt, lat, lon);
  const T1 = now();
  const win = windowFromTiles(tl.usable, lat, lon);
  const T2 = now();
  const dw = dWaterFromWindow(win);
  const T3 = now();
  const lc = landCoverFromClassField(classAt, lat, lon, win);
  const T4 = now();
  const viaLoader = await loadLandCoverAtPoint(lat, lon, { cache, timeoutMs: 20_000 });
  const { landCover: _a, ...zLc } = lc;
  const sameV1 = JSON.stringify(zLc) === JSON.stringify(z);
  const sameLoader = JSON.stringify(viaLoader?.landCover) === JSON.stringify(lc.landCover);
  const perTier = {};
  for (const t of ['t1', 't2']) {
    const tier = TIER_BY_ID[t], c = cellOf(tier, lat, lon), m = cellCenter(tier, c.iy, c.ix);
    const block = blockOffsets(lat - m.lat, lon - m.lon);
    const ks = block.map((b) => kappaAt(lc.landCover, t, c.iy + b.dy, c.ix + b.dx));
    const ks05 = block.map((b) => { const cc = landCoverCell(lc.landCover, t, c.iy + b.dy, c.ix + b.dx); return cc && cc.cov >= 0.8 && lc.landCover.point.cov >= 0.8 ? kappaOf(lc.landCover.point.p, cc.q, 0.5) : null; });
    const ok = ks.every((k) => k != null);
    const cellZ0 = landCoverCell(lc.landCover, t, c.iy, c.ix)?.z0 ?? null;
    const blockZ0 = block.map((b) => landCoverCell(lc.landCover, t, c.iy + b.dy, c.ix + b.dx)?.z0).filter((x) => x != null);
    perTier[t] = {
      n: block.length, ok, kMin: ok ? Math.min(...ks) : null, kMax: ok ? Math.max(...ks) : null,
      spread: ok ? Math.max(...ks) / Math.min(...ks) : null, spread05: ok ? Math.max(...ks05) / Math.min(...ks05) : null,
      minCov: Math.min(...block.map((b) => landCoverCell(lc.landCover, t, c.iy + b.dy, c.ix + b.dx)?.cov ?? 0)),
      z0Point: z.z0Mod[t], z0Cell: cellZ0, z0BlockEq: blockZ0.length ? Math.exp(blockZ0.reduce((a, x) => a + Math.log(x), 0) / blockZ0.length) : null,
    };
  }
  rows.push({ name, lat, lon, dw, pCov: lc.landCover.point.cov, perTier, ms: { z0: T1 - T0, window: T2 - T1, ring: T3 - T2, landCover: T4 - T3, loader: viaLoader?.computeMs ?? null }, sameV1, sameLoader, files: tl.usable.length });
}

const f1 = (x) => (x == null ? '—' : x.toFixed(1));
const f2 = (x) => (x == null ? '—' : x.toFixed(2));
const fz = (x) => (x == null ? '—' : x >= 0.1 ? x.toFixed(2) : x.toPrecision(2));
console.log('Ort                        d_water            Körper  Kreis  κ t1 (min–max, n)     κ t2               z0 t1 Punkt/Zelle/Block  ms Ring/LC/Lader');
for (const r of rows) {
  if (r.err) { console.log(`${r.name.padEnd(26)} ${r.err}`); continue; }
  const d = r.dw.m != null ? `${r.dw.m} m` : `> ${r.dw.aboveM} m (${r.dw.reason})`;
  const kt = (t) => { const x = r.perTier[t]; return x.ok ? `${f2(x.kMin)}–${f2(x.kMax)} (${x.n})` : `κ=1 (cov ${f2(x.minCov)})`; };
  console.log(`${r.name.padEnd(26)} ${d.padEnd(18)} ${String(r.dw.bodyPx ?? '—').padStart(6)}  ${f2(r.pCov)}   ${kt('t1').padEnd(20)} ${kt('t2').padEnd(18)} ${fz(r.perTier.t1.z0Point)}/${fz(r.perTier.t1.z0Cell)}/${fz(r.perTier.t1.z0BlockEq)}`.padEnd(150)
    + `${f1(r.ms.ring)}/${f1(r.ms.landCover)}/${f1(r.ms.loader)}`);
}
const ok = rows.filter((r) => !r.err);
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const found = ok.filter((r) => r.dw.reason === 'found');
console.log(`\nOrte ${rows.length}, gelesen ${ok.length}; Abrufe ${tilesN} Kacheln, ${(bytes / 1e6).toFixed(1)} MB (Kachelbytes geteilt)`);
console.log(`d_water: Treffer ${found.length}/${ok.length} (p50 ${q(found.map((r) => r.dw.m), 0.5)} m, p90 ${q(found.map((r) => r.dw.m), 0.9)} m, max ${Math.max(...found.map((r) => r.dw.m))} m); zensiert none ${ok.filter((r) => r.dw.reason === 'none').length}, coverage ${ok.filter((r) => r.dw.reason === 'coverage').length}`);
for (const t of ['t1', 't2']) {
  const xs = ok.map((r) => r.perTier[t]);
  const dec = xs.filter((x) => x.ok);
  console.log(`κ ${t}: entscheidbar ${dec.length}/${ok.length}; Spreizung max/min ≥ 1,5 bei λ 1: ${dec.filter((x) => x.spread >= 1.5).length}, bei λ 0,5: ${dec.filter((x) => x.spread05 >= 1.5).length}; κ_min p10/p50 ${f2(q(dec.map((x) => x.kMin), 0.1))}/${f2(q(dec.map((x) => x.kMin), 0.5))}; |ln(z0 Zelle / z0 Punktbox)| p50/p90 ${f2(q(xs.filter((x) => x.z0Cell && x.z0Point).map((x) => Math.abs(Math.log(x.z0Cell / x.z0Point))), 0.5))}/${f2(q(xs.filter((x) => x.z0Cell && x.z0Point).map((x) => Math.abs(Math.log(x.z0Cell / x.z0Point))), 0.9))}`);
}
for (const k of ['z0', 'window', 'ring', 'landCover', 'loader']) {
  const xs = ok.map((r) => r.ms[k]).filter((x) => x != null);
  console.log(`Rechenzeit ${k.padEnd(9)} p50 ${f1(q(xs, 0.5))} ms · p90 ${f1(q(xs, 0.9))} · max ${f1(Math.max(...xs))}`);
}
console.log(`Gleichheit: z0 v1 aus der Landbedeckung = z0FromClassField an ${ok.filter((r) => r.sameV1).length}/${ok.length}; Lader = Teile einzeln an ${ok.filter((r) => r.sameLoader).length}/${ok.length}`);
