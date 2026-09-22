/**
 * cells.mjs — AP10a step 2: which cube cells each archive point needs per tier (its 2×2 block, E-F-19), and for
 * every (tier, source, cube cell) which source cells the PRODUCER's rule would read (lib/grids.mjs). Computed
 * ONCE, verified by verify-hindcast.mjs (V2), consumed by the extractors (the cell lists) and build-slots.mjs
 * (the recipes). Also pins the model-orography product `point/static/hmodel/v1` at the index commit of the CDN
 * (hModEff = mean of these columns over the sources that entered — the producer's rule, build-point-cube.mjs).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/hindcast/cells.mjs [--commit=<sha>]
 *
 * Writes <HINDCAST_ROOT>/cells/{t1,t2,t3}.json, cells/extract-<grid>.json, static/hmodel-v1/<commit>/…
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TIERS, TIER_BY_ID, cellOf, cellCenter, blockOffsets, chunkOf, decodeCubeChunk, planeOffset, dequantize, MISSING, staticChunkPath, staticManifestPath, HMODEL_PRODUCT, HMODEL_VERSION } from '../../src/point/cubeFormat.ts';
import { SOURCE_BY_ID, coversPoint } from '../../src/point/sourceMatrix.ts';
import { distanceKm } from '../../src/point/client/cubePoint.ts';
import { GRIDS, blockOf, fillFrom, nearestStoreCell, storeIndexOfProducer, storeCellLatLon, producerLatLon, gridsSelfTest } from './lib/grids.mjs';
import { HINDCAST_ROOT, TIER_SOURCES, codeHash, parseArgs, sha256 } from './lib/common.mjs';

const CDN = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data';
const flags = parseArgs(process.argv.slice(2));
const HSURF_FULL = {};

async function fetchOk(url, kind) {
  for (let a = 0; a < 4; a++) {
    const r = await fetch(url);
    if (r.ok) return kind === 'json' ? r.json() : new Uint8Array(await r.arrayBuffer());
    if (r.status === 404) return null;
    await new Promise((res) => setTimeout(res, 1500 * (a + 1)));   // jsDelivr 403 is transient (V-FI-5)
  }
  throw new Error(`HTTP failed ${url}`);
}

/** The hmodel product pinned to one commit, copied to the archive so every rebuild reads the same bytes. */
async function pinHmodel(commit) {
  const dir = join(HINDCAST_ROOT, 'static', 'hmodel-v1', commit);
  mkdirSync(dir, { recursive: true });
  const manPath = join(dir, 'static.json');
  let manifest;
  if (existsSync(manPath)) manifest = JSON.parse(readFileSync(manPath, 'utf8'));
  else {
    manifest = await fetchOk(`${CDN}@${commit}/${staticManifestPath(HMODEL_PRODUCT, HMODEL_VERSION)}`, 'json');
    if (!manifest) throw new Error(`hmodel manifest missing at ${commit}`);
    writeFileSync(manPath, JSON.stringify(manifest));
  }
  const chunks = new Map();
  const chunkAt = async (tierId, cy, cx) => {
    const key = `${tierId}/${cy}_${cx}`;
    if (chunks.has(key)) return chunks.get(key);
    const rel = staticChunkPath(HMODEL_PRODUCT, HMODEL_VERSION, tierId, cy, cx);
    const local = join(dir, rel.split('/').slice(-2).join('_'));
    let bytes;
    if (existsSync(local)) bytes = new Uint8Array(readFileSync(local));
    else { bytes = await fetchOk(`${CDN}@${commit}/${rel}`, 'bytes'); if (bytes) writeFileSync(local, bytes); }
    const planes = manifest.tiers?.[tierId]?.planes;
    const dec = bytes && planes ? await decodeCubeChunk(bytes, { planes }) : null;
    chunks.set(key, dec ? { dec, planes } : null);
    return chunks.get(key);
  };
  return {
    manifest,
    async at(tierId, iy, ix) {
      const ch = chunkOf(iy, ix);
      const c = await chunkAt(tierId, ch.cy, ch.cx);
      if (!c) return null;
      const off = planeOffset(c.dec, 0, iy - c.dec.y0, ix - c.dec.x0);
      const out = {};
      c.planes.forEach((p, pi) => { const q = c.dec.planes[pi][off]; out[p.id] = q === MISSING ? null : dequantize(q, p); });
      return out;
    },
  };
}

async function main() {
  const st = gridsSelfTest();
  for (const c of st.checks) console.log(`[cells] ${c.ok ? 'ok ' : 'NO '} ${c.name}${c.ok ? '' : ` — ${c.detail}`}`);
  if (st.passed !== st.total) throw new Error('grids self-test failed');

  const pts = JSON.parse(readFileSync('scripts/punktarchiv/points.json', 'utf8'));
  const index = flags.commit ? { commit: flags.commit } : await fetchOk(`${CDN}@main/point/index.json`, 'json');
  const commit = index.commit;
  console.log(`[cells] ${pts.points.length} Punkte · hmodel @ ${commit.slice(0, 12)}`);
  const hm = await pinHmodel(commit);
  for (const [g, m] of [['icon_ch1_om', 'meteoswiss_icon_ch1'], ['icon_ch2_om', 'meteoswiss_icon_ch2']]) {
    const f = join(HINDCAST_ROOT, 'cells', `hsurf-${m}.f32`);
    if (existsSync(f)) { const b = readFileSync(f); HSURF_FULL[g] = new Float32Array(b.buffer, b.byteOffset, b.length / 4); }
  }
  console.log(`[cells] HSURF-Abgleich ICON-CH: ${Object.keys(HSURF_FULL).join(', ') || 'keine Datei (scripts/hindcast/hsurf_cells.py)'}`);

  const outDir = join(HINDCAST_ROOT, 'cells');
  mkdirSync(outDir, { recursive: true });
  const extract = Object.fromEntries(Object.keys(GRIDS).map((g) => [g, new Map()]));   // grid → key → [row, col]
  const summary = {};

  for (const tier of TIERS) {
    const t = tier.id;
    const points = {};
    const need = new Map();   // "iy_ix" → { iy, ix }
    for (const p of pts.points) {
      const c = cellOf(tier, p.lat, p.lon);
      if (!c) { points[p.id] = null; continue; }
      const centre = cellCenter(tier, c.iy, c.ix);
      const home = chunkOf(c.iy, c.ix);
      const block = [];
      for (const b of blockOffsets(p.lat - centre.lat, p.lon - centre.lon)) {
        const iy = c.iy + b.dy, ix = c.ix + b.dx;
        if (iy < 0 || ix < 0 || iy >= tier.ny || ix >= tier.nx) continue;
        const cc = cellCenter(tier, iy, ix);
        const ch = chunkOf(iy, ix);
        block.push({ iy, ix, dy: b.dy, dx: b.dx, centre: cc, distKm: Math.round(distanceKm(p.lat, p.lon, cc.lat, cc.lon) * 1000) / 1000, chunk: { cy: ch.cy, cx: ch.cx }, sameChunk: ch.cy === home.cy && ch.cx === home.cx });
        need.set(`${iy}_${ix}`, { iy, ix });
      }
      points[p.id] = { lat: p.lat, lon: p.lon, cell: { iy: c.iy, ix: c.ix, lat: centre.lat, lon: centre.lon, offsetKm: Math.round(distanceKm(p.lat, p.lon, centre.lat, centre.lon) * 100) / 100 }, chunk: { cy: home.cy, cx: home.cx }, block };
    }
    const cells = {};
    const stat = { cubeCells: need.size, bySource: {} };
    for (const [key, { iy, ix }] of [...need].sort()) {
      const centre = cellCenter(tier, iy, ix);
      const hmv = await hm.at(t, iy, ix);
      const sources = {};
      for (const s of TIER_SOURCES[t]) {
        const grid = GRIDS[s.grid];
        const st2 = (stat.bySource[s.id] ??= { covered: 0, block: 0, fill: 0, nearest: 0, notCovered: 0, storeCells: 0 });
        const src = SOURCE_BY_ID[s.id];
        const covered = src ? coversPoint(src, centre.lat, centre.lon) : true;
        if (!covered) { sources[s.id] = { covered: false }; st2.notCovered++; continue; }
        let rec;
        if (s.rule === 'block') {
          let via = 'block', from = null, ring = null;
          let blk = blockOf(grid, tier, iy, ix);
          if (!blk.length) {
            const f = fillFrom(grid, tier, iy, ix);
            if (f) { via = 'fill'; from = `${f.iy}_${f.ix}`; ring = f.ring; blk = blockOf(grid, tier, f.iy, f.ix); }
          }
          const store = blk.map(([j, i]) => storeIndexOfProducer(grid, j, i));
          rec = { covered: true, via, ...(from ? { from, ring } : {}), producer: blk, store };
          if (via === 'block') st2.block++; else if (via === 'fill') st2.fill++;
        } else {
          const n = nearestStoreCell(grid, centre.lat, centre.lon);
          if (!n) { sources[s.id] = { covered: false, why: 'outside the external grid' }; st2.notCovered++; continue; }
          const ll = storeCellLatLon(grid, n.row, n.col);
          rec = { covered: true, via: 'nearest', store: [[n.row, n.col]], dKm: Math.round(distanceKm(centre.lat, centre.lon, ll.lat, ll.lon) * 1000) / 1000, ...(n.dRot != null ? { dRotDeg: Math.round(n.dRot * 1e6) / 1e6 } : {}) };
          // V-HC-3: rotated ICON-CH — Open-Meteo's rotated point carries the native triangle nearest to IT
          // (nn_weights.om); the producer takes the triangle nearest to the CUBE CENTRE. Among the rotated points
          // within ±2 rows/cols, the one whose orography equals the producer's hmodel column is that triangle.
          const col = hmv?.[s.id];
          const hs = HSURF_FULL[s.grid];
          if (grid.kind === 'rotated' && hs && col != null) {
            let best = null;
            for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
              const r2 = n.row + dr, c2 = n.col + dc;
              if (r2 < 0 || c2 < 0 || r2 >= grid.ny || c2 >= grid.nx) continue;
              const h = hs[r2 * grid.nx + c2];
              if (!Number.isFinite(h) || h === -999) continue;
              const q = storeCellLatLon(grid, r2, c2);
              const dk = distanceKm(centre.lat, centre.lon, q.lat, q.lon);
              const dh = Math.abs(h - col);
              if (dh > 0.5 || dk > 2.5 * grid.stepDeg / 0.01) continue;
              if (!best || dk < best.dk) best = { r2, c2, dk, dh };
            }
            if (best) {
              rec = { covered: true, via: 'hsurf-match', store: [[best.r2, best.c2]], dKm: Math.round(best.dk * 1000) / 1000, dHsurfM: Math.round(best.dh * 100) / 100, nearest: [n.row, n.col] };
              st2.matched = (st2.matched ?? 0) + 1;
            } else st2.unmatched = (st2.unmatched ?? 0) + 1;
          }
          st2.nearest++;
        }
        for (const [row, col] of rec.store) extract[s.grid].set(`${row}_${col}`, [row, col]);
        st2.storeCells += rec.store.length;
        sources[s.id] = rec;
      }
      cells[key] = { iy, ix, centre, hmodel: hmv, sources };
    }
    const doc = { schema: 1, kind: 'hindcast/cells', tier: t, deg: tier.deg, builtAt: new Date().toISOString(), codeHash: codeHash(),
      hmodel: { commit, version: HMODEL_VERSION, columns: (hm.manifest.tiers?.[t]?.planes ?? []).map((p) => p.id) },
      rule: 'Blockzellen je Punkt = blockOffsets(lat − Zellmitte) um die nächste Zelle (E-F-19); je Quelle die Rezeptur des Producers: block = Blockmittel aller Quellzellen, deren Mitte in die Cube-Zelle rundet (sampleRegularToTier), fill = leerer Block ⇒ nächste gefüllte Cube-Zelle in ≤ 3 Ringen (fillNearest, geometrisch), nearest = nächster Punkt des externen Gitters (ICON-CH gedreht, ICON global 0,125°). Domäne wie coversPoint (sourceMatrix.ts).',
      points, cells, stat };
    writeFileSync(join(outDir, `${t}.json`), JSON.stringify(doc));
    summary[t] = stat;
    console.log(`[cells] ${t}: ${Object.values(points).filter(Boolean).length} Punkte · ${need.size} Cube-Zellen · ${Object.entries(stat.bySource).map(([k, v]) => `${k} ${v.storeCells} Quellzellen (b${v.block}/f${v.fill}/n${v.nearest}${v.matched != null || v.unmatched != null ? `[m${v.matched ?? 0}/u${v.unmatched ?? 0}]` : ''}/–${v.notCovered})`).join(' · ')}`);
  }
  for (const [g, m] of Object.entries(extract)) {
    const list = [...m.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const grid = GRIDS[g];
    const rows = new Set(list.map((x) => x[0]));
    const doc = { schema: 1, kind: 'hindcast/extract-cells', grid: g, gridDef: grid, n: list.length, rows: rows.size, hash: sha256(JSON.stringify(list)).slice(0, 16), cells: list, latlon: list.map(([r, c]) => { const ll = storeCellLatLon(grid, r, c); return [Math.round(ll.lat * 1e6) / 1e6, Math.round(ll.lon * 1e6) / 1e6]; }) };
    writeFileSync(join(outDir, `extract-${g}.json`), JSON.stringify(doc));
    console.log(`[cells] extract ${g}: ${list.length} Zellen in ${rows.size} Zeilen · hash ${doc.hash}`);
  }
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ builtAt: new Date().toISOString(), commit, summary }, null, 1));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
