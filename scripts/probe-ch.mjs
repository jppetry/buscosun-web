/**
 * Diagnose-Sonde für MeteoSchweiz ICON-CH1-EPS (Phase 4.2, nächste Quelle).
 * Node (kein CORS): STAC-Collection abfragen → t_2m-Item → GRIB2 laden → Grid-
 * Metadaten (GDT/DRT/npoints/Nachrichten) dumpen; Member/Steps enumerieren.
 * Klärt: reused der icosahedral-Decoder? Wie viele Files je Ensemble?
 *
 *   node scripts/probe-ch.mjs
 */
const COLL = 'ch.meteoschweiz.ogd-forecasting-icon-ch1';
const STAC = `https://data.geo.admin.ch/api/stac/v1/collections/${COLL}`;

function inspectGrib(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 0, msgs = 0, first = {};
  while (off < buf.length - 4) {
    if (!(buf[off] === 0x47 && buf[off + 1] === 0x52 && buf[off + 2] === 0x49 && buf[off + 3] === 0x42)) { off++; continue; }
    const tl = Number(dv.getBigUint64(off + 8)); let so = off + 16; const end = off + tl;
    while (so < end - 4) {
      if (buf[so] === 0x37 && buf[so + 1] === 0x37 && buf[so + 2] === 0x37 && buf[so + 3] === 0x37) break;
      const sl = dv.getUint32(so), sn = buf[so + 4];
      if (msgs === 0) {
        if (sn === 3) { first.gdt = dv.getUint16(so + 12); first.npoints = dv.getUint32(so + 6); }
        if (sn === 5) { first.drt = dv.getUint16(so + 9); first.nbits = buf[so + 19]; }
      }
      if (sl < 5) break; so += sl;
    }
    msgs++; off = end;
  }
  return { messages: msgs, ...first };
}

const items = await (await fetch(`${STAC}/items?limit=200`)).json();
const feats = items.features || [];
console.log(`items on page: ${feats.length}`);

const members = new Set(), steps = new Set(), reftimes = new Set(), params = new Set();
for (const f of feats) {
  const m = f.id.match(/^(\d{8})-(\d{4})-(\d+)-([a-z0-9_]+)-([a-z0-9]+)-/);
  if (m) { reftimes.add(m[1] + m[2]); steps.add(+m[3]); params.add(m[4]); members.add(m[5]); }
}
console.log(`reftimes: ${[...reftimes].slice(0, 3).join(', ')}`);
console.log(`params(sample): ${[...params].slice(0, 20).join(', ')}`);
console.log(`members(sample): ${[...members].slice(0, 30).join(', ')}  (count ${members.size})`);
console.log(`steps(sample): ${[...steps].sort((a, b) => a - b).slice(0, 15).join(', ')}`);

async function inspectItem(f, label) {
  if (!f) { console.log(`\n${label}: (none on page)`); return; }
  const asset = Object.values(f.assets)[0];
  try {
    const buf = new Uint8Array(await (await fetch(asset.href)).arrayBuffer());
    console.log(`\n${label}: ${f.id}\n  host ${new URL(asset.href).host} · ${buf.length} B · ${JSON.stringify(inspectGrib(buf))}`);
  } catch (e) { console.log(`\n${label} fetch FAIL: ${e.message}`); }
}
// ctrl vs perturbed message counts (is 'perturbed' a bundled multi-member file?)
await inspectItem(feats.find((f) => /-t_2m-ctrl-/.test(f.id)), 't_2m CTRL');
await inspectItem(feats.find((f) => /-t_2m-perturbed-/.test(f.id)), 't_2m PERTURBED');
// grid coordinates: clat/clon present as params? or a separate horizontal-constants collection?
console.log(`\nclat/clon in params: ${params.has('clat')}/${params.has('clon')}`);
console.log(`all params: ${[...params].sort().join(', ')}`);
// how many total items in the collection (enumeration cost)?
const meta = await (await fetch(`${STAC}/items?limit=1`)).json();
console.log(`\ncollection links: ${(meta.links || []).map((l) => l.rel).join(', ')}`);
