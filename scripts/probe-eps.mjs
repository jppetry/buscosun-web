/**
 * Empirische Sonde für ICON-D2-EPS (Phase 4.1 Diagnose, docs/model-switcher-gate0.md).
 * Node fetcht opendata.dwd.de DIREKT (kein CORS) → entpackt bz2 → dumpt die GRIB2-
 * Section-Metadaten OHNE vollen Decode: Member-/Message-Zahl, GDT (Grid-Template),
 * DRT (Packing), nbits, numberOfDataPoints. Bestätigt, ob unser Decoder erweiterbar
 * ist (GDT 101 icosahedral + DRT 0/1) — bevor Decoder-Code geschrieben wird.
 *
 *   node scripts/probe-eps.mjs
 */
import bz2mod from 'bz2';

const bz2 = bz2mod.decompress ? bz2mod : (bz2mod.default ?? bz2mod);
const BASE = 'https://opendata.dwd.de/weather/nwp/icon-d2-eps/grib';

function pad2(n) { return String(n).padStart(2, '0'); }

async function listFirstFile(hh, param) {
  const res = await fetch(`${BASE}/${hh}/${param}/`);
  if (!res.ok) return null;
  const html = await res.text();
  const m = [...html.matchAll(/href="([^"]+\.grib2\.bz2)"/g)].map((x) => x[1]);
  return m.length ? m : null;
}

// Iterate GRIB2 messages in a decompressed buffer; return per-message metadata.
function inspectMessages(raw) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const msgs = [];
  let off = 0;
  while (off < raw.length - 4) {
    // find 'GRIB'
    if (!(raw[off] === 0x47 && raw[off + 1] === 0x52 && raw[off + 2] === 0x49 && raw[off + 3] === 0x42)) { off++; continue; }
    const edition = raw[off + 7];
    const totalLen = Number(dv.getBigUint64(off + 8));
    const msg = { edition, totalLen, gdt: null, npoints: null, drt: null, nbits: null, pdtNum: null, perturb: null };
    let so = off + 16;
    const endMsg = off + totalLen;
    while (so < endMsg - 4) {
      if (raw[so] === 0x37 && raw[so + 1] === 0x37 && raw[so + 2] === 0x37 && raw[so + 3] === 0x37) break;
      const seclen = dv.getUint32(so);
      if (seclen < 5 || so + seclen > endMsg) break;
      const secnum = raw[so + 4];
      if (secnum === 3) {
        msg.npoints = dv.getUint32(so + 6);
        msg.gdt = dv.getUint16(so + 12);
      } else if (secnum === 4) {
        msg.pdtNum = dv.getUint16(so + 7);
        // PDT 4.1 (ensemble) carries perturbationNumber; offset varies — read a guess
        // (oct 36 for template 4.1 individual ensemble). Best-effort only.
        if (msg.pdtNum === 1 || msg.pdtNum === 11) msg.perturb = raw[so + 35];
      } else if (secnum === 5) {
        msg.drt = dv.getUint16(so + 9);
        msg.nbits = raw[so + 19];
      }
      so += seclen;
    }
    msgs.push(msg);
    off = endMsg;
  }
  return msgs;
}

async function probe(param) {
  // find a run hour with content (try recent typical runs)
  for (const hh of ['00', '03', '06', '09', '12', '15', '18', '21']) {
    const files = await listFirstFile(hh, param);
    if (!files) continue;
    const url = `${BASE}/${hh}/${param}/${files[0]}`;
    const buf = await (await fetch(url)).arrayBuffer();
    const raw = bz2.decompress(new Uint8Array(buf));
    const msgs = inspectMessages(raw);
    const first = msgs[0] ?? {};
    console.log(`\n=== ${param} (run ${hh}) ===`);
    console.log(`file: ${files[0]}`);
    console.log(`filesInDir: ${files.length}`);
    console.log(`decompressedBytes: ${raw.length}`);
    console.log(`messages(members): ${msgs.length}`);
    console.log(`GDT: ${first.gdt}  (0=regular-latlon, 101=unstructured/icosahedral)`);
    console.log(`DRT: ${first.drt}  (0/1=simple packing supported; 3/40/42 = other)`);
    console.log(`nbits: ${first.nbits}  npoints: ${first.npoints}  PDT: ${first.pdtNum}`);
    console.log(`perturbationNumbers(sample): ${msgs.slice(0, 8).map((m) => m.perturb).join(',')}`);
    return;
  }
  console.log(`no content found for ${param}`);
}

await probe('t_2m');
await probe('clat');
await probe('u_10m');
