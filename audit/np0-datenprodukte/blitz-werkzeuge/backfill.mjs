// Backfill-Probe: jeden 5-min-Slot der letzten N min je Quelle nativ per WCS holen (seriell) — Existenz, Dauer, Bytes.
const N = Number(process.argv[2] ?? 125);
const LAT = [45.5, 55.5], LON = [5.5, 17.5];
const URL = {
  bd: (T) => `https://maps.dwd.de/geoserver/dwd/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=dwd__Blitzdichte&format=image/tiff&geotiff:compression=Deflate&subset=time("${T}")&subset=Lat(${LAT[0]},${LAT[1]})&subset=Long(${LON[0]},${LON[1]})`,
  mtg: (T) => `https://view.eumetsat.int/geoserver/mtg_fd/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=mtg_fd__li_afa&format=image/tiff&geotiff:compression=Deflate&subset=time("${T}")&subset=Lat(${LAT[0]},${LAT[1]})&subset=Long(${LON[0]},${LON[1]})`,
};
const now = Date.now();
const top = Math.floor(now / 300_000) * 300_000;
for (const src of ['bd', 'mtg']) {
  const rows = [];
  const tAll = Date.now();
  for (let s = top; s >= top - N * 60_000; s -= 300_000) {
    const T = new Date(s).toISOString();
    const t0 = Date.now();
    try {
      const r = await fetch(URL[src](T), { signal: AbortSignal.timeout(60_000) });
      const b = Buffer.from(await r.arrayBuffer());
      const ok = r.ok && b[0] !== 0x3c;
      rows.push({ T: T.slice(11, 16), ok, st: r.status, ms: Date.now() - t0, B: b.length });
    } catch (e) { rows.push({ T: T.slice(11, 16), ok: false, st: e.name, ms: Date.now() - t0, B: 0 }); }
  }
  const ok = rows.filter((x) => x.ok);
  const ms = ok.map((x) => x.ms).sort((a, b) => a - b);
  console.log(`${src}: ${ok.length}/${rows.length} Slots lesbar, gesamt ${((Date.now() - tAll) / 1000).toFixed(1)} s seriell, ms p50 ${ms[Math.floor(ms.length / 2)]} p90 ${ms[Math.floor(ms.length * 0.9)]} max ${ms.at(-1)}, Bytes ${Math.min(...ok.map((x) => x.B))}–${Math.max(...ok.map((x) => x.B))}`);
  console.log('  ' + rows.map((x) => `${x.T}${x.ok ? '' : '✗' + x.st}:${x.ms}`).join(' '));
}
