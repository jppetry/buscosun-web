/**
 * cdn-shadow.mjs — AP10a acceptance V4, second source of truth: cube runs that are still on the CDN (retention
 * {9, 24, 24} h per tier) read with EXACTLY the collector's readers (readCubePoint + the archive's integer coding) and
 * stored as pseudo archive tiers under <HINDCAST_ROOT>/shadow/cdn/<tier>-<run>.json.gz. shadow.mjs then compares them
 * like buscosun-archiv slots — network-free and reproducible.
 *
 * Why: buscosun-archiv holds ONE slot a day (23:10 UTC), so its t3 is always the 12z run, and dynamical.org carries
 * only the 00z IFS ENS — the archive alone cannot show the t3 σ_ens exactly (measured 19.09.). The CDN still holds the
 * t3 00z run of the previous day. Only GETs (jsDelivr), nothing is purged or written remotely.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/hindcast/cdn-shadow.mjs \
 *        [--runs=t3:2026091800,t2:2026091900]   (default: every t2/t3 run of the index, and t1 runs with --t1)
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { installNodeShims } from '../punktarchiv/lib/nodeShims.mjs';
import { httpStore } from '../../src/point/client/store.ts';
import { loadPointIndex, loadRunManifestFrom, readCubePoint } from '../../src/point/client/cubePoint.ts';
import { encodeValue } from '../punktarchiv/lib/punktarchiv.mjs';
import { HINDCAST_ROOT, parseArgs } from './lib/common.mjs';
import { readFileSync } from 'node:fs';

installNodeShims();
const flags = parseArgs(process.argv.slice(2));
const points = JSON.parse(readFileSync('scripts/punktarchiv/points.json', 'utf8')).points;

/** the collector's encodeCubeSeries (collect.mjs, not exported) — same integer coding, same `empty` list */
function encodeCubeSeries(series) {
  const out = {}; const empty = [];
  for (const pl of series.planes) {
    let any = false;
    const col = series.steps.map((st) => { const v = st.values[pl.id]; if (v != null) any = true; return encodeValue(v, pl); });
    if (any) out[pl.id] = col; else empty.push(pl.id);
  }
  return { planes: out, empty };
}

async function main() {
  const store = httpStore({});
  const index = await loadPointIndex(store);
  if (!index) throw new Error('point/index.json nicht erreichbar');
  let wanted = [];
  if (flags.runs) wanted = String(flags.runs).split(',').map((x) => { const [t, run] = x.split(':'); return { t, run }; });
  else for (const r of index.runs) for (const tr of r.tierRuns) if (tr.id !== 't1' || flags.t1) wanted.push({ t: tr.id, run: tr.run });
  const outDir = join(HINDCAST_ROOT, 'shadow', 'cdn');
  mkdirSync(outDir, { recursive: true });
  for (const { t, run } of wanted) {
    const out = join(outDir, `${t}-${run}.json.gz`);
    if (existsSync(out) && !flags.force) { console.log(`[cdn] ${t} ${run}: vorhanden`); continue; }
    const r = index.runs.find((x) => x.tierRuns.some((y) => y.id === t && y.run === run));
    if (!r) { console.log(`[cdn] ${t} ${run}: nicht (mehr) im Index ${index.commit.slice(0, 8)}`); continue; }
    const tr = r.tierRuns.find((y) => y.id === t);
    const manifestPath = `${r.path}/run.json`;
    const { manifest, from } = await loadRunManifestFrom(store, manifestPath, index);
    if (!manifest) { console.log(`[cdn] ${t} ${run}: Manifest nicht lesbar`); continue; }
    const tm = manifest.tiers.find((x) => x.id === t);
    const idx2 = { ...index, latestByTier: { ...index.latestByTier, [t]: { run: tr.run, runAt: tr.runAt, path: r.path, manifest: manifestPath, sourceRun: tr.run, sourceRunAt: tr.runAt, ageH: tr.ageH } } };
    const block = {
      run: tr.run, runAt: tr.runAt, manifest: manifestPath, manifestFrom: from, indexCommit: index.commit, leadHours: tm?.leadHours ?? null,
      planeOrder: manifest.planes.map((p) => p.id),
      provenance: { ensemble: tm?.ensemble ? { byHour: tm.ensemble.byHour, sources: (tm.ensemble.sources ?? []).map((s) => ({ id: s.id, run: s.run, vars: s.vars, members: s.membersRead })) } : null,
        pressure: tm?.pressure ? { levels: tm.pressure.levels, sources: (tm.pressure.sources ?? []).map((s) => s.id) } : null,
        hModEff: tm?.hmodel?.hModEff ? { provenance: tm.hmodel.hModEff.provenance, derivedIncluded: tm.hmodel.hModEff.derivedIncluded } : null },
      sources: (manifest.sources ?? []).filter((s) => s.tier === t).map((s) => ({ id: s.id, runAt: s.runAt, offsetH: s.offsetH, role: s.role })),
      byPoint: {},
    };
    let ok = 0; const t0 = Date.now();
    for (const p of points) {
      const ser = await readCubePoint(store, idx2, t, p.lat, p.lon, { manifest }).catch(() => null);
      if (!ser) { block.byPoint[p.id] = null; continue; }
      const enc = encodeCubeSeries(ser);
      block.byPoint[p.id] = { cell: { iy: ser.cell.iy, ix: ser.cell.ix }, planes: enc.planes, empty: enc.empty };
      ok++;
    }
    const doc = { kind: 'hindcast/cdn-shadow', fetchedAt: new Date().toISOString(), tier: t, cube: { [t]: block } };
    writeFileSync(out, gzipSync(Buffer.from(JSON.stringify(doc), 'utf8')));
    console.log(`[cdn] ${t} ${run}: ${ok}/${points.length} Punkte · Manifest ${from} · ${((Date.now() - t0) / 1000).toFixed(1)} s → ${out}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
