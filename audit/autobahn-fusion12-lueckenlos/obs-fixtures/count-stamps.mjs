// Read-only count (V-AF-9, step 0): per saved version of obs/v1/latest.json, where the variables of the German stations
// stand — at the station stamp `t` (`v`) or in `older` with their own stamp — and how many distinct stamps one station carries.
//   node audit/autobahn-fusion12-lueckenlos/obs-fixtures/count-stamps.mjs [dir with <sha>.latest.json]
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), 'full');
const VARS = ['t', 'rh', 'td', 'ff', 'dd', 'fx', 'rr'];
const files = readdirSync(dir).filter((f) => f.endsWith('.latest.json'));
const rows = [];
for (const f of files) {
  const doc = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const cat = JSON.parse(readFileSync(join(dir, f.replace('.latest.', '.stations.')), 'utf8'));
  const country = new Map(cat.stations.map((s) => [s.id, s.country]));
  const r = { sha: f.slice(0, 7), builtAt: doc.builtAt, by: {} };
  for (const cc of ['DE', 'AT', 'CH']) {
    const c = { n: 0, at: {}, older: {}, lag: {}, stamps: {}, anyT: 0, anyWind: 0, anyRr: 0, olderAny: 0 };
    for (const [id, e] of Object.entries(doc.stations)) {
      if (country.get(id) !== cc && !(cc === 'CH' && country.get(id) === 'LI')) continue;
      if (!e.t) continue;
      c.n++;
      const distinct = new Set();
      let hasOlder = false;
      for (const k of VARS) {
        if (typeof e.v?.[k] === 'number') { c.at[k] = (c.at[k] ?? 0) + 1; distinct.add(e.t); }
        else if (e.older?.[k] && typeof e.older[k].v === 'number') {
          c.older[k] = (c.older[k] ?? 0) + 1; distinct.add(e.older[k].t); hasOlder = true;
          const lag = Math.round((Date.parse(e.t) - Date.parse(e.older[k].t)) / 60000);
          (c.lag[k] ??= {})[lag] = (c.lag[k][lag] ?? 0) + 1;
        }
      }
      if (hasOlder) c.olderAny++;
      c.stamps[distinct.size] = (c.stamps[distinct.size] ?? 0) + 1;
      if (typeof e.v?.t === 'number' || typeof e.older?.t?.v === 'number') c.anyT++;
      if ((typeof e.v?.ff === 'number' || typeof e.older?.ff?.v === 'number')) c.anyWind++;
      if (typeof e.v?.rr === 'number' || typeof e.older?.rr?.v === 'number') c.anyRr++;
    }
    r.by[cc] = c;
  }
  rows.push(r);
}
rows.sort((a, b) => a.builtAt.localeCompare(b.builtAt));
for (const r of rows) {
  console.log(`\n== ${r.sha} builtAt ${r.builtAt}`);
  for (const [cc, c] of Object.entries(r.by)) {
    console.log(`${cc}: ${c.n} mit 10-min-Stempel · T am Stempel ${c.at.t ?? 0} / in older ${c.older.t ?? 0} (T insgesamt ${c.anyT}) · Wind (ff) am Stempel ${c.at.ff ?? 0} / older ${c.older.ff ?? 0} (insgesamt ${c.anyWind}) · rr am Stempel ${c.at.rr ?? 0} / older ${c.older.rr ?? 0} · Stationen mit older ${c.olderAny} · verschiedene Stempel je Station ${JSON.stringify(c.stamps)}`);
    if (Object.keys(c.lag).length) console.log(`   Rückstand (min) je Größe: ${Object.entries(c.lag).map(([k, m]) => `${k} ${JSON.stringify(m)}`).join(' · ')}`);
  }
}
