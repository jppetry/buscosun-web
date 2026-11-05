import { readFileSync } from 'node:fs';
const [file, ...idx] = process.argv.slice(2);
const runs = JSON.parse(readFileSync(file, 'utf8'));
for (const i of idx.map(Number)) {
  const r = runs[i]; if (!r) continue;
  const port = /:(\d{4})\//.exec(r.url)?.[1];
  console.log(`\n#${i} ${port === '5220' ? 'BASE' : 'NEW '} ${decodeURIComponent(r.url.replace(/^.*ort=/, '').replace(/&.*$/, ''))} slotAge=${r.slotAgeS}`);
  const radar = r.net.filter((n) => /radar\/|geosphere|geo\.admin|composite_rv/i.test(n.url));
  const prod = (u) => (/img\/v1\/(rv|inca-5m|inca|rzc-nc|rzc|rv-past)\//.exec(u)?.[1] ?? (/composite_rv/.test(u) ? 'tar' : /geosphere/.test(u) ? 'geosphere' : /geo\.admin/.test(u) ? 'geoadmin' : 'other'));
  const g = new Map();
  for (const n of radar) {
    const k = `${prod(n.url)} ${n.url.startsWith('RAW') ? 'raw' : n.url.startsWith('CDN') ? 'cdn' : 'other'}`;
    const e = g.get(k) ?? { n: 0, ok: 0, e4: 0, ab: 0, t0: Infinity, t1: 0, sum: 0, max: 0 };
    e.n++; if (n.st === 200) e.ok++; if (n.st >= 400) e.e4++; if (n.failed) e.ab++;
    e.t0 = Math.min(e.t0, n.t0); e.t1 = Math.max(e.t1, n.t1 ?? n.t0); const d = (n.t1 ?? n.t0) - n.t0; e.sum += d; e.max = Math.max(e.max, d);
    g.set(k, e);
  }
  for (const [k, e] of [...g.entries()].sort((a, b) => a[1].t0 - b[1].t0)) console.log(`  ${k.padEnd(16)} n=${String(e.n).padStart(3)} ok=${String(e.ok).padStart(3)} 4xx=${String(e.e4).padStart(2)} abort=${String(e.ab).padStart(2)}  ${String(e.t0).padStart(6)}→${String(e.t1).padStart(6)} ms  mean ${Math.round(e.sum / e.n)} max ${e.max}`);
  for (const l of r.logs.filter((l) => /\[buscosun\]/.test(l.text))) console.log(`  log ${String(l.t).padStart(6)} ${l.text.replace('[buscosun] ', '').slice(0, 110)}`);
}
