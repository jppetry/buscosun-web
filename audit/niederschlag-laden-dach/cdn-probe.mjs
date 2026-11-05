// Probe: wann ist ein frischer Radar-Slot über jsDelivr (@main) bzw. raw.githubusercontent lesbar?
// Spiegelt das Client-Verhalten: CDN erst ab dem Bild-Gate (270 s RV / 240+30 s rzc-nc / 28 min inca-5m), raw ab 150 s.
//   node cdn-probe.mjs <minutes> <out.json>
const [minArg = '15', out = ''] = process.argv.slice(2);
const CDN = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/radar/img/v1';
const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/radar/img/v1';
const two = (n) => String(n).padStart(2, '0');
const rvStamp = (ms) => { const d = new Date(ms); return two(d.getUTCFullYear() % 100) + two(d.getUTCMonth() + 1) + two(d.getUTCDate()) + two(d.getUTCHours()) + two(d.getUTCMinutes()); };
const imgStamp = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}T${two(d.getUTCHours())}${two(d.getUTCMinutes())}`; };
const floorTo = (ms, step) => Math.floor(ms / step) * step;
const M5 = 300_000, M15 = 900_000;
const PRODUCTS = [
  { p: 'rv', step: M5, stamp: rvStamp, gateCdn: 270_000, gateRaw: 150_000, path: (s) => `rv/${s}/meta.json` },
  { p: 'rzc', step: M5, stamp: imgStamp, gateCdn: 240_000, gateRaw: 60_000, path: (s) => `rzc/${s}/meta.json` },
  { p: 'rzc-nc', step: M5, stamp: imgStamp, gateCdn: 270_000, gateRaw: 60_000, path: (s) => `rzc-nc/${s}/meta.json` },
  { p: 'inca-5m', step: M15, stamp: imgStamp, gateCdn: 28 * 60_000, gateRaw: 5 * 60_000, path: (s) => `inca-5m/${s}/meta.json` },
];
const seen = new Map(); // key → { first200: {cdn, raw}, last: {cdn, raw}, log: [] }
const t0 = Date.now(), endAt = t0 + (+minArg) * 60_000;
const rec = (key) => { if (!seen.has(key)) seen.set(key, { first200: {}, last: {}, log: [] }); return seen.get(key); };
async function probe(url) {
  const t = Date.now();
  try {
    const r = await fetch(url, { cache: 'no-store', headers: { 'Accept-Encoding': 'gzip' } });
    await r.arrayBuffer();
    return { st: r.status, ms: Date.now() - t, xc: r.headers.get('x-cache') ?? r.headers.get('cf-cache-status') ?? '', age: r.headers.get('age') ?? '' };
  } catch (e) { return { st: 'ERR', ms: Date.now() - t, err: String(e?.cause?.code ?? e.message) }; }
}
while (Date.now() < endAt) {
  const now = Date.now();
  const jobs = [];
  for (const P of PRODUCTS) {
    const newest = floorTo(now, P.step);
    for (let i = 0; i < 3; i++) {
      const slotMs = newest - i * P.step, age = now - slotMs, s = P.stamp(slotMs);
      for (const [origin, base, gate] of [['cdn', CDN, P.gateCdn], ['raw', RAW, P.gateRaw]]) {
        if (age < gate) continue;
        const key = `${P.p}/${s}`;
        const r = rec(key);
        if (r.first200[origin] != null) continue;          // schon lesbar: nicht weiter anfragen
        jobs.push(probe(`${base}/${P.path(s)}`).then((res) => {
          const prev = r.last[origin];
          const line = `${new Date().toISOString().slice(11, 19)} age=${Math.round(age / 1000)}s ${key} ${origin} ${res.st} ${res.ms}ms ${res.xc} ${res.err ?? ''}`;
          if (res.st === 200) { r.first200[origin] = Math.round(age / 1000); console.log(line + '  ← erste 200'); }
          else if (prev?.st !== res.st) console.log(line);
          r.last[origin] = res; r.log.push({ t: new Date().toISOString(), age: Math.round(age / 1000), origin, ...res });
        }));
      }
    }
  }
  await Promise.all(jobs);
  await new Promise((r) => setTimeout(r, 5000));
}
console.log('\n== Zusammenfassung (Alter in s nach dem Slot, bei dem die Datei zuerst 200 war; – = nie im Fenster) ==');
for (const [key, r] of [...seen.entries()].sort()) {
  const lastCdn = r.last.cdn?.st, lastRaw = r.last.raw?.st;
  console.log(`${key.padEnd(24)} cdn ${r.first200.cdn ?? `– (zuletzt ${lastCdn})`}   raw ${r.first200.raw ?? `– (zuletzt ${lastRaw})`}`);
}
if (out) { const { writeFileSync } = await import('node:fs'); writeFileSync(out, JSON.stringify([...seen.entries()], null, 1)); }
