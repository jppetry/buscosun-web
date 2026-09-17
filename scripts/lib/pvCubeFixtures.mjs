/**
 * pvCubeFixtures.mjs — ein Punkt-Cube in ECHTER Datenform, netzfrei (Phase FI, AP2 ff.).
 *
 * Baut mit dem Producer-Code (`encodeCubeChunk`, `buildPointIndex`) drei Stufen, ein
 * Stationsprodukt und den Index für EINEN Ort — dieselben Container, Manifeste und Pfade,
 * die `buscosun-data` trägt. Die Werte tragen eine orts- UND zeitabhängige Signatur, damit
 * eine Verschiebung um eine Zelle oder eine Stunde den Vergleich bricht (Lehre BW-1).
 *
 * Die Läufe sind die des 16.09. 21:12 UTC (§9.5.1): t1 18z, t2 12z, t3 00z, Stationen 15z —
 * damit die Überlappungen in Gültigzeit (t1/t2 3 h, t2/t3 6 h) so liegen wie am lebenden Datum.
 */
import {
  CUBE_PLANES, CUBE_SCHEMA, TIERS, TIER_BY_ID, MISSING,
  encodeCubeChunk, chunkPath, chunkExtent, cellOf, chunkOf, quantize, stationBundlePath, stationManifestPath,
  STATION_CATALOG_PATH,
} from '../../src/point/cubeFormat.ts';
import { buildPointIndex } from '../../src/point/manifest.ts';

const H = 3_600_000;
export const enc = (o) => new TextEncoder().encode(JSON.stringify(o));

/** Der Ort: München (§6), h_true 525 m — die gemessenen Modellhöhen vom 16.09. je Stufe. */
export const FIX = Object.freeze({
  lat: 48.1372, lon: 11.5755, hTrue: 525,
  nowMs: Date.parse('2026-09-16T21:12:00Z'),
  runs: { t1: '2026091618', t2: '2026091612', t3: '2026091600' },
  hModEff: { t1: 510, t2: 568, t3: 487 },
  station: { id: '10865', name: 'MUENCHEN STADT', lat: 48.1667, lon: 11.5333, elev: 515, run: '2026091615' },
  commit: 'b3e6fec0d21ca6473b04532eee873d7d27eee850',
});
const runAtOf = (run) => `${run.slice(0, 4)}-${run.slice(4, 6)}-${run.slice(6, 8)}T${run.slice(8, 10)}:00:00Z`;

/**
 * Die Signatur je Stufe, Schritt und Zelle. `it` = Schrittindex, `ry`/`rx` = Zeile/Spalte
 * im Chunk. Alle Größen sind so gewählt, dass die PAP-6-Bedingungen von selbst gelten
 * (Td < T, Böe > |v|, Schichten ≤ clct) — der Verifier prüft sie an der AUSGABE.
 */
export function signature(tierId, it, ry, rx) {
  const base = { t1: 14, t2: 16, t3: 11 }[tierId];
  const t2m = base + it * 0.1 + ry * 0.01 + rx * 0.002;
  const u10 = 2 + it * 0.02 + ry * 0.01, v10 = -1 + rx * 0.01;
  const spd = Math.hypot(u10, v10);
  // Jeder achte t1-Schritt trägt eine BODENINVERSION 520…820 m ü. NN (+3 K): Modellboden 510 m,
  // der Punkt (525 m) liegt 5 m über der Basis — PAP 4 Fall B (AP4).
  const inversion = tierId === 't1' && it % 8 === 5;
  // Jeder achte t1-Schritt (it % 8 = 6) hat nur EINE Quelle: kein σ_div, srcCount 1 — wie im Norden
  // an 14 von 49 Stunden (§9.8.1); PAP 6 nimmt dort den Sockel allein.
  const single = tierId === 't1' && it % 8 === 6;
  // Jeder achte (it % 8 = 7): tiefe Bewölkung 95 % über einer Gesamtbedeckung von 30 + it — die
  // Konsistenz-Op `clct := max(...)` muss greifen.
  const lowCloud = tierId === 't1' && it % 8 === 7;
  // Streuungen wachsen mit dem Vorlauf ab dem Lauf, wie im Cube (σ_div p50 1,7 K, σ_ens p50 2,8 K, §9.8.1).
  const lead = TIER_BY_ID[tierId].leadHours[it];
  const sdT = 0.8 + 0.006 * lead, sdEnsT = 0.4 + 0.012 * lead;
  return {
    t2m, td2m: t2m - 4 - it * 0.01, u10, v10, gust: spd * 1.5 + 1, precip: it % 5 === 0 ? 0.3 + it * 0.01 : 0,
    clct: Math.min(100, 30 + it), clcl: lowCloud ? 95 : 10, clcm: 15, clch: 5, ps: 955 - ry * 0.1, snowlmt: 2000 + it,
    ...(single ? {} : { t2m_sd: sdT, td2m_sd: sdT + 0.1, u10_sd: 0.6, v10_sd: 0.6, gust_sd: 1.2, precip_sd: 0.2, clct_sd: 12, ps_sd: 0.8, snowlmt_sd: 80 }),
    // σ_ens nur auf dem groben Raster (t1 6 h, t2 12 h, t3 24 h) — wie im Cube (§9.5.1 (3)).
    ...(it % { t1: 6, t2: 4, t3: 4 }[tierId] === 0 ? { t2m_sd_ens: sdEnsT, u10_sd_ens: 0.4, v10_sd_ens: 0.4, precip_sd_ens: 0.15, ensCount: 20 } : {}),
    t2m_q10: t2m - 1.5, t2m_q90: t2m + 1.5, precip_q10: 0, precip_q90: 0.8,
    srcCount: single ? 1 : tierId === 't3' && it > 9 ? 2 : 5,
    hModEff: FIX.hModEff[tierId],
    ...(tierId === 't1' ? {
      gammaEff: inversion ? 4 : 6.5, zBase: inversion ? 520 : 0, zInv: inversion ? 820 : 0, dTInv: inversion ? 3 : 0,
      t925: t2m - 3, t850: t2m - 8, t700: t2m - 18, rh925: 60, rh850: 55, rh700: 40,
    } : { t925: t2m - 3, t850: t2m - 8, t700: t2m - 18, rh925: 60, rh850: 55, rh700: 40 }),
  };
}

/** Der Chunk einer Stufe um den Ort — alle Zellen des 16×16-Blocks, alle Schritte. */
export async function buildTierChunk(tierId, lat = FIX.lat, lon = FIX.lon) {
  const tier = TIER_BY_ID[tierId];
  const cell = cellOf(tier, lat, lon);
  const ch = chunkOf(cell.iy, cell.ix);
  const ext = chunkExtent(tier, ch.cy, ch.cx);
  const nt = tier.leadHours.length;
  const cells = nt * ext.ny * ext.nx;
  const planes = CUBE_PLANES.map((pl) => {
    const a = new Int16Array(cells).fill(MISSING);
    for (let it = 0; it < nt; it++) {
      for (let y = 0; y < ext.ny; y++) {
        for (let x = 0; x < ext.nx; x++) {
          const v = signature(tierId, it, y, x)[pl.id];
          if (v != null) a[(it * ext.ny + y) * ext.nx + x] = quantize(v, pl);
        }
      }
    }
    return a;
  });
  const run = FIX.runs[tierId];
  const runAt = runAtOf(run);
  const bytes = await encodeCubeChunk({
    runHours: Math.floor(Date.parse(runAt) / H), tierIndex: tier.index, nt, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes,
  });
  const path = chunkPath(run, tier, ch.cy, ch.cx);
  const manifest = {
    schema: CUBE_SCHEMA, run, runAt,
    planes: CUBE_PLANES.map((pl) => ({ id: pl.id, unit: pl.unit, scale: pl.scale, offset: pl.offset, group: pl.group })),
    sources: tier.sources.slice(0, 2).map((id) => ({ id, name: id, tier: tierId, runAt, fromH: tier.fromH, toH: tier.toH, steps: nt, members: 0, role: 'assigned', coverage: 'full', offsetH: 0, geometry: null, attribution: null, licence: null, errors: 0, firstError: null, dropped: null })),
    tiers: [{
      id: tierId, deg: tier.deg, lat0: tier.lat0, lon0: tier.lon0, ny: tier.ny, nx: tier.nx,
      chunk: tier.chunk, run, runAt, ageH: 0, leadHours: [...tier.leadHours],
      files: [{ file: path, bytes: bytes.length, cy: ch.cy, cx: ch.cx }],
      quantiles: tierId === 't1' ? { source: 'claef_eps', run, vars: ['t2m', 'precip'], levels: ['q10', 'q90'], steps: nt, missing: 0, cellsWritten: cells, provenance: 'single-source', note: null, caveat: 'fixture' } : null,
      ensemble: { sources: [{ id: 'icon_d2_eps', run, vars: ['t2m'], membersRead: 20 }], byHour: {}, steps: nt, missing: 0, provenance: 'ensemble-members', rule: 'fixture', precip: 'fixture', caveat: 'fixture' },
      profile: tierId === 't1' ? { source: 'icon_d2', run, stepH: 1, levels: null, steps: nt, missing: 0, inversionShare: 0.125, params: null, provenance: 'single-source', why: 'fixture', calibrated: false, calibNote: 'fixture' } : null,
      net: null, dropped: [],
    }],
    fusion: { weights: 'equal', provenance: 'fallback', note: 'fixture', sigma: 'fixture', resolutionCaveat: 'fixture', memberBias: 'fixture', spread: { div: 'fixture', ens: 'fixture', rule: 'fixture', doNotAdd: 'fixture', noEns: 'fixture', sdEnsEmpty: [] }, geometry: 'fixture', validTime: 'fixture', runChoice: 'fixture' },
    skipped: {}, pending: {},
  };
  return { tierId, tier, cell, ch, ext, nt, bytes, path, run, runAt, manifest };
}

/** Das Stationsprodukt: EINE Station im t1-Chunk des Orts, 247 Schritte stündlich. */
export async function buildStationProduct(lat = FIX.lat, lon = FIX.lon) {
  const st = FIX.station;
  const run = st.run, runAt = runAtOf(run);
  const nt = 247;
  const leadHours = Array.from({ length: nt }, (_, i) => i + 1);
  const planeList = CUBE_PLANES.map((pl) => ({ id: pl.id, unit: pl.unit, scale: pl.scale, offset: pl.offset, group: pl.group }));
  const vals = (it) => ({
    t2m: 12 + it * 0.1, td2m: 7 + it * 0.1, u10: 1.5, v10: -0.5, gust: 4 + it * 0.01, precip: it % 7 === 0 ? 0.2 : 0,
    clct: 40, clcl: 20, clcm: 10, clch: 5, srcCount: 1, hModEff: st.elev,
  });
  const planes = CUBE_PLANES.map((pl) => {
    const a = new Int16Array(nt).fill(MISSING);
    for (let it = 0; it < nt; it++) { const v = vals(it)[pl.id]; if (v != null) a[it] = quantize(v, pl); }
    return a;
  });
  const t1 = TIER_BY_ID.t1;
  const cell = cellOf(t1, lat, lon);
  const ch = chunkOf(cell.iy, cell.ix);
  const bytes = await encodeCubeChunk({ runHours: Math.floor(Date.parse(runAt) / H), tierIndex: t1.index, nt, y0: 0, x0: 0, ny: 1, nx: 1, planes }, undefined, planeList);
  const file = stationBundlePath(run, ch.cy, ch.cx);
  const manifest = {
    schema: CUBE_SCHEMA, product: 'stations', source: 'mosmix_l', run, runAt, ageH: 1.7, tier: 't1', stationCount: 1,
    axis: { leadHours }, chunks: [{ cy: ch.cy, cx: ch.cx, file, bytes: bytes.length, stations: [st.id] }],
    planes: planeList, notMapped: { ps: 'PPPP ist auf Meeresniveau reduziert', snowlmt: 'nicht geführt' }, parameters: ['TTT'], caveats: ['fixture'],
  };
  const catalog = { schema: 1, updatedAt: runAt, source: 'mosmix_l', domain: { latMin: 45.5, latMax: 55.5, lonMin: 5.5, lonMax: 17.5 }, count: 1, stations: [{ id: st.id, name: st.name, lat: st.lat, lon: st.lon, elev: st.elev }] };
  return { run, runAt, nt, leadHours, bytes, file, manifest, catalog, vals };
}

/**
 * Alles zusammen als Dateitabelle für `memoryStore` — plus der Index, wie ihn der Publisher
 * schreibt (`buildPointIndex`), damit `latestByTier`, `axis` und `stations.runs` echt sind.
 */
export async function buildCubeFixture(opts = {}) {
  const tiers = opts.tiers ?? ['t1', 't2', 't3'];
  const lat = opts.lat ?? FIX.lat, lon = opts.lon ?? FIX.lon;
  const chunks = {};
  for (const t of tiers) chunks[t] = await buildTierChunk(t, lat, lon);
  const station = opts.station === false ? null : await buildStationProduct(lat, lon);
  const runs = tiers.map((t) => {
    const c = chunks[t];
    return { run: c.run, runAt: c.runAt, path: `point/${c.run}`, tiers: [t], sources: c.manifest.sources.map((s) => s.id), bytes: c.bytes.length,
      tierRuns: [{ id: t, run: c.run, runAt: c.runAt, ageH: 0, files: 1, bytes: c.bytes.length }] };
  });
  const index = buildPointIndex({
    commit: FIX.commit, publishedAt: new Date(FIX.nowMs - 80 * 60_000).toISOString(), runs,
    stationRuns: station ? [{ run: station.run, runAt: station.runAt, ageH: 1.7, path: `point/stations/${station.run}`, manifest: stationManifestPath(station.run), stationCount: 1, leadHours: station.nt, bytes: station.bytes.length }] : [],
  });
  const files = new Map();
  files.set('point/index.json', enc(index));
  for (const t of tiers) {
    const c = chunks[t];
    files.set(`point/${c.run}/run.json`, enc(c.manifest));
    files.set(c.path, c.bytes);
  }
  if (station) {
    files.set(STATION_CATALOG_PATH, enc(station.catalog));
    files.set(stationManifestPath(station.run), enc(station.manifest));
    files.set(station.file, station.bytes);
  }
  return { files, index, chunks, station, tiers, TIERS };
}
