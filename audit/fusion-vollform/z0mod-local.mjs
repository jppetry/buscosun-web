/**
 * AP17 — Probebau von `point/static/z0mod/v1` aus echtem GRIB, LOKAL (nie ins Daten-Repo). Dieselbe Fassung wie der
 * Producer (`collectZ0mod` + `writeStaticZ0mod` aus `scripts/point/staticZ0mod.mjs`); die Beiträger je Stufe kommen aus
 * dem lebenden `run.json` (Quellen mit Mittelwert, Lauf der Quelle), die Domänenmasken aus `domainMask`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-vollform/z0mod-local.mjs <ausgabe>
 *
 * Danach, als Messung der Neubau-Regel an echten Daten: dieselben Quellen aus dem VORIGEN Lauf (−12 h bzw. −24 h) —
 * welcher Anteil der Landzellen ändert sich um mehr als Faktor 1,65, und würde die Regel neu schreiben?
 */
import { join } from 'node:path';
import { adapterFor } from '../../scripts/point/adapters/index.mjs';
import { domainMask } from '../../scripts/point/build-point-cube.mjs';
import { collectZ0mod, writeStaticZ0mod, readZ0modManifest, decideZ0modRewrite, Z0MOD_PLANE_META } from '../../scripts/point/staticZ0mod.mjs';
import { netStats } from '../../scripts/point/adapters/shared.mjs';
import { SOURCE_BY_ID } from '../../src/point/sourceMatrix.ts';
import { TIER_BY_ID, MISSING, quantize } from '../../src/point/cubeFormat.ts';

const OUT = process.argv[2];
if (!OUT) throw new Error('Ausgabeverzeichnis fehlt (Scratchpad, nie das Daten-Repo)');
if (/buscosun-data/.test(OUT)) throw new Error('nie ins Daten-Repo');
const CDN = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data';
const idx = await (await fetch(`${CDN}@main/point/index.json`)).json();
const runIdOf = (iso) => iso.slice(0, 13).replace(/[-T]/g, '');
const back = (run, h) => { const d = new Date(Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10)) - h * 3_600_000); return d.toISOString().slice(0, 13).replace(/[-T]/g, ''); };
const T0 = performance.now();
console.log(`Index ${idx.commit.slice(0, 7)} (${idx.publishedAt})`);
const contribOf = {};
for (const tierId of ['t1', 't2', 't3']) {
  const lt = idx.latestByTier[tierId];
  const man = await (await fetch(`${CDN}@${idx.commit}/${lt.manifest}`)).json();
  const tier = TIER_BY_ID[tierId];
  const contributors = man.sources.filter((s) => s.tier === tierId && (s.members ?? 0) <= 1 && !s.dropped).map((s) => ({
    id: s.id, run: runIdOf(s.runAt), adapter: adapterFor(s.id), mask: domainMask(SOURCE_BY_ID[s.id], tier)?.mask ?? null,
  }));
  contribOf[tierId] = contributors;
  const t1 = performance.now();
  const got = await collectZ0mod(contributors, tier);
  const st = await writeStaticZ0mod(join(OUT, 'point'), tierId, got.columns, { absent: got.absent, missing: got.missing });
  const m = readZ0modManifest(join(OUT, 'point'))?.tiers?.[tierId];
  console.log(`\n${tierId} (Lauf ${lt.run}): Beiträger mit Mittel ${contributors.map((c) => `${c.id}@${c.run}`).join(', ')}`);
  console.log(`  ${st.changed ? 'geschrieben' : 'nicht geschrieben'} — ${st.reason}; ${st.chunks} Chunks, ${(st.bytes / 1024).toFixed(1)} KiB; ${((performance.now() - t1) / 1000).toFixed(1)} s`);
  for (const p of m?.planes ?? []) console.log(`  Spalte ${p.id.padEnd(14)} Deckung ${p.covered}/${tier.ny * tier.nx} · z0 min/max ${p.minM}/${p.maxM} m · ${p.note}`);
  console.log(`  ohne z0: ${Object.keys(got.absent).join(', ') || '—'}${Object.keys(got.missing).length ? ` · ⚠ ohne Lieferung: ${JSON.stringify(got.missing)}` : ''}`);
  const again = await writeStaticZ0mod(join(OUT, 'point'), tierId, got.columns, { absent: got.absent, missing: got.missing });
  console.log(`  zweiter Durchgang, gleiche Läufe: ${again.changed ? 'GESCHRIEBEN (falsch)' : 'nicht geschrieben'} — ${again.reason}`);
}
const n = netStats();
console.log(`\nNetz: ${n.files} Dateien, ${(n.bytes / 1e6).toFixed(1)} MB, ${((performance.now() - T0) / 1000).toFixed(0)} s`);

// ── Neubau-Regel am echten Lauf-Rauschen: dieselben Quellen, voriger Lauf ────────
console.log('\nNeubau-Regel gegen den vorigen Lauf derselben Quelle (−12 h; ICON-CH2/ICON global −12 h, ICON-CH1 −12 h):');
for (const tierId of ['t1', 't2', 't3']) {
  const tier = TIER_BY_ID[tierId];
  const cur = await collectZ0mod(contribOf[tierId], tier);
  const prevC = contribOf[tierId].map((c) => ({ ...c, run: back(c.run, 12) }));
  const prev = await collectZ0mod(prevC, tier);
  const q = (g) => { const o = new Int16Array(g.length).fill(MISSING); for (let k = 0; k < g.length; k++) if (Number.isFinite(g[k])) o[k] = quantize(g[k], Z0MOD_PLANE_META); return o; };
  const ids = cur.columns.map((c) => c.id).filter((id) => prev.columns.some((p) => p.id === id));
  if (!ids.length) { console.log(`  ${tierId}: voriger Lauf nicht lesbar (${JSON.stringify(prev.missing)})`); continue; }
  const prevQuant = new Map(prev.columns.filter((c) => ids.includes(c.id)).map((c) => [c.id, q(c.grid)]));
  const d = decideZ0modRewrite({
    prevTier: { builtAt: new Date().toISOString(), planes: ids.map((id) => ({ id })) }, prevQuant,
    ids, quant: ids.map((id) => q(cur.columns.find((c) => c.id === id).grid)), nowMs: Date.now(),
  });
  // Dazu die Verteilung |Δ ln z0| über Landzellen (beide > 1 cm), je Spalte.
  const dist = ids.map((id) => {
    const a = prevQuant.get(id), b = q(cur.columns.find((c) => c.id === id).grid);
    const xs = [];
    for (let k = 0; k < a.length; k++) if (a[k] !== MISSING && b[k] !== MISSING && a[k] > Math.log(0.01) * 1000 && b[k] > Math.log(0.01) * 1000) xs.push(Math.abs(a[k] - b[k]) / 1000);
    xs.sort((x, y) => x - y);
    const at = (p) => xs[Math.min(xs.length - 1, Math.floor(p * (xs.length - 1)))];
    return `${id} p50 ${at(0.5).toFixed(3)} · p99 ${at(0.99).toFixed(3)} · max ${xs.at(-1).toFixed(3)} (n ${xs.length}, > 0,1: ${(100 * xs.filter((x) => x > 0.1).length / xs.length).toFixed(1)} %, > 0,5: ${(100 * xs.filter((x) => x > 0.5).length / xs.length).toFixed(2)} %)`;
  });
  console.log(`  ${tierId}: ${d.write ? 'würde NEU schreiben' : 'bliebe stehen'} — ${d.reason}\n     |Δ ln z0| Landzellen: ${dist.join('\n                          ')}`);
}
process.exit(0);
