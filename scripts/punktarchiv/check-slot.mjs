// check-slot.mjs — PA5 (audit/punktarchiv-erweiterung.md): one schema-5 slot against its own rules and against an INDEPENDENT read of the
// data repo (main cell and every block cell through the reader, without the collector's memo). Reads only; needs the slot's runs
// to be still in buscosun-data (9–24 h after the slot).
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/punktarchiv/check-slot.mjs <slot.json.gz> [points to sample, default 40]
import { readFileSync } from 'node:fs';

const L = await import('./lib/punktarchiv.mjs');
const { httpStore } = await import('../../src/point/client/store.ts');
const { withRawSameRef } = await import('./lib/rawFallback.mjs');
const { readCubePoint, loadRunManifestFrom } = await import('../../src/point/client/cubePoint.ts');
const F = await import('../../src/point/cubeFormat.ts');
const { GRID_NEAREST_ONLY } = await import('../../src/pointForecast/fusion/grid.ts');
const A = await import('../fusionfit/lib/archiveAdapter.mjs');
const slot = L.parseSlot(readFileSync(process.argv[2]));
const maxPts = Number(process.argv[3] ?? 40);
const out = []; const add = (name, ok, detail) => { out.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const pts = slot.points, base = pts.filter((p) => !p.role), extra = pts.filter((p) => p.role === 'input');
add('Schema 5, Katalogpunkte zuerst, Eingabe-Punkte dahinter', slot.schema === 5 && pts.findIndex((p) => p.role) === base.length || extra.length === 0, `${base.length} + ${extra.length}`);
add('Kennungen eindeutig; Eingabe-Punkte tragen <Netz>:<Kennung>', new Set(pts.map((p) => p.id)).size === pts.length && extra.every((p) => /^(tawes|smn|cdc|smnp):/.test(p.id)));
for (const t of ['t1', 't2', 't3']) {
  const c = slot.cube[t]; const ids = Object.keys(c.byPoint);
  const withMain = ids.filter((i) => c.byPoint[i]); const withBlock = withMain.filter((i) => Array.isArray(c.byPoint[i].block));
  add(`${t}: jede Hauptzelle da, jeder Punkt mit Block-Liste`, withMain.length === pts.length && withBlock.length === pts.length, `${withMain.length}/${pts.length}, Block ${withBlock.length}`);
  // rule: the block is exactly blockOffsets (minus those beyond the grid) unless blockTruncated
  const tier = F.TIER_BY_ID[t]; let ruleBad = 0, cells = 0, excl = 0;
  for (const p of pts) {
    const bp = c.byPoint[p.id]; if (!bp) continue;
    const offs = F.blockOffsets(p.lat - bp.cell.lat, p.lon - bp.cell.lon).filter((o) => o.dy || o.dx);
    const got = bp.block.map((b) => `${b.dy},${b.dx}`).sort().join(' '), want = offs.map((o) => `${o.dy},${o.dx}`).sort().join(' ');
    if (got !== want && !bp.blockTruncated) ruleBad++;
    for (const b of bp.block) { cells++; if (Object.keys(b.planes).some((id) => GRID_NEAREST_ONLY.has(id)) || b.iy !== bp.cell.iy + b.dy || b.ix !== bp.cell.ix + b.dx) excl++; }
  }
  add(`${t}: Blockzellen = blockOffsets des Motors (oder als beschnitten markiert); iy/ix = Hauptzelle + dy/dx; keine nur-nächste-Zelle-Ebene`, ruleBad === 0 && excl === 0, `${cells} Zellen, ${c.blockStats?.pointsTruncated} Punkte beschnitten`);
}
// independent read: every block cell must equal the MAIN-cell series read at that cell's centre through the reader (same run)
{
  const store = withRawSameRef(httpStore({}));
  // the index of the slot time: pin the run of the slot, not today's
  const index = { commit: slot.index.commit, latestByTier: {} };
  let compared = 0, diff = 0, cellsN = 0, skipped = 0, first = null, mainN = 0, mainDiff = 0;
  const sample = [...base.filter((_, i) => i % Math.max(1, Math.floor(base.length / (maxPts / 2))) === 0), ...extra.filter((_, i) => i % Math.max(1, Math.floor(extra.length / (maxPts / 2))) === 0)];
  for (const t of ['t1', 't2', 't3']) {
    const c = slot.cube[t];
    const { manifest } = await loadRunManifestFrom(store, c.manifest, { commit: slot.index.commit });
    if (!manifest) { skipped += sample.length; continue; }
    index.latestByTier[t] = { run: c.run, runAt: c.runAt, sourceRun: c.sourceRun, sourceRunAt: c.sourceRunAt, manifest: c.manifest };
    const sc = slot.scales.cube[t];
    for (const p of sample) {
      { // main cell: the series of the point itself through the reader's default decoder (no memo)
        const ser = await readCubePoint(store, index, t, p.lat, p.lon, { manifest }); const bp = c.byPoint[p.id];
        if (ser && bp) for (const [id, col] of Object.entries(bp.planes)) for (let i = 0; i < col.length; i++) { mainN++; if (L.encodeValue(ser.steps[i].values[id], sc[id]) !== col[i]) { mainDiff++; first ??= `main ${p.id}/${t}/${id}[${i}]`; } }
      }
      for (const b of c.byPoint[p.id]?.block ?? []) {
        const ser = await readCubePoint(store, index, t, b.centre.lat, b.centre.lon, { manifest });
        if (!ser) { skipped++; continue; }
        cellsN++;
        if (ser.cell.iy !== b.iy || ser.cell.ix !== b.ix) { diff++; first ??= `${p.id}/${t}: Zelle ${ser.cell.iy}/${ser.cell.ix} ≠ ${b.iy}/${b.ix}`; continue; }
        for (const [id, col] of Object.entries(b.planes)) for (let i = 0; i < col.length; i++) {
          const q = L.encodeValue(ser.steps[i].values[id], sc[id]); compared++;
          if (q !== col[i]) { diff++; first ??= `${p.id}/${t}/${id}[${i}]: ${col[i]} ≠ ${q}`; }
        }
        for (const id of b.empty) if (ser.steps.some((s) => s.values[id] != null)) { diff++; first ??= `${p.id}/${t}/${id}: als leer geführt, aber belegt`; }
      }
    }
  }
  add('Gegenprobe Hauptzelle: Reihe des Punkts über den Leser ohne Memo, ganzzahlig gleich', mainDiff === 0 && mainN > 0, `${mainN} Werte, ${mainDiff} Abweichungen`);
  add('Gegenprobe über den Leser: jede Blockzelle = Reihe der Hauptzelle am Zellmittelpunkt, ganzzahlig gleich', diff === 0 && compared > 0, `${sample.length} Punkte, ${cellsN} Zellen, ${compared} Werte, ${diff} Abweichungen${skipped ? `, ${skipped} nicht lesbar` : ''}${first ? ` — ${first}` : ''}`);
  // negative control: a shifted cell must NOT match
  const p0 = sample.find((p) => slot.cube.t1.byPoint[p.id]?.block?.length && p.lat < 54 && p.lat > 47);
  if (p0) { const b = slot.cube.t1.byPoint[p0.id].block[0]; const ser = await readCubePoint(store, index, 't1', b.centre.lat + 2 * 0.05, b.centre.lon, { manifest: (await loadRunManifestFrom(store, slot.cube.t1.manifest, { commit: slot.index.commit })).manifest });
    const col = b.planes.t2m; const same = ser && col.every((q, i) => q === L.encodeValue(ser.steps[i].values.t2m, slot.scales.cube.t1.t2m));
    add('Negativkontrolle: zwei Zellen weiter nördlich ist die t2m-Reihe eine andere', ser && !same); }
}
// stations references
for (const key of ['stations', 'stationsS']) {
  const st = slot[key]; if (!st) { add(`${key}: nicht im Slot`, false); continue; }
  let bad = 0, byPoint = 0, byStation = 0, none = 0;
  for (const p of extra) { const r = st.byPoint[p.id]; if (!r || !r.station) { none++; continue; }
    if (r.ref?.byPoint) { byPoint++; const own = st.byPoint[r.ref.byPoint]; const op = pts.find((x) => x.id === r.ref.byPoint); if (!own?.planes || (op.mosmix?.id ?? op.id) !== r.station.id) bad++; }
    else if (r.ref?.byStation) { byStation++; if (r.ref.byStation !== r.station.id || !(r.station.id in st.byStation)) bad++; } else bad++; }
  const baseOk = base.every((p) => st.byPoint[p.id] && !('ref' in st.byPoint[p.id]));
  add(`${key}: jeder Verweis eines Eingabe-Punkts löst auf (Katalogpunkt mit derselben Station oder byStation); Katalogpunkte ohne Verweis`, bad === 0 && baseOk, `Verweis auf Punkt ${byPoint}, auf Station ${byStation} (${Object.keys(st.byStation ?? {}).length} Reihen), ohne Kandidat ${none}`);
}
add('Live-Pfad nur an Katalogpunkten', Object.keys(slot.live.byPoint).length === base.length && extra.every((p) => !(p.id in slot.live.byPoint)), `${Object.keys(slot.live.byPoint).length}`);
{ const t = extra.filter((p) => p.truth.tawes), s = extra.filter((p) => p.truth.smn), c = extra.filter((p) => p.truth.cdc);
  const got = (list, net) => list.filter((p) => slot.truth.byPoint[p.id]?.[net]?.count > 0).length;
  add('Wahrheit der Eingabe-Punkte: TAWES und SMN im Slot, CDC ohne (nachladbar), nie POI', extra.every((p) => slot.truth.byPoint[p.id]?.poi == null) && c.every((p) => !slot.truth.byPoint[p.id]?.tawes && !slot.truth.byPoint[p.id]?.smn), `TAWES ${got(t, 'tawes')}/${t.length} · SMN ${got(s, 'smn')}/${s.length} · CDC ${c.length} ohne`); }
// existing reader unchanged on catalog points
{ const id = base[0]?.id; const ser = id ? A.archiveSeries(A.readArchiveSlot(process.argv[2]), 't1', id) : null; add('Bestehender Leser (archiveAdapter) liest den Slot und die Reihe eines Katalogpunkts', !!ser && ser.steps.length === slot.cube.t1.leadHours.length && ser.neighbours.length === 0); }
{ const p = extra[0]; if (p) { const nb = L.decodeBlockCells(slot, 't1', p.id); add('decodeBlockCells liefert die Nachbarzellen eines Eingabe-Punkts mit Werten je Schritt', nb.length === slot.cube.t1.byPoint[p.id].block.length && nb.every((n) => n.values.length === slot.cube.t1.leadHours.length && n.values[0].t2m != null)); } }
console.log(`${out.filter(Boolean).length}/${out.length}`);
process.exitCode = out.every(Boolean) ? 0 : 1;
