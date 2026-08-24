// BW-6 Browser-Beleg: schreibt das PROD-Manifest (buscosun.com) mit dem `repack`-Abschnitt
// aus dem GEPUSHTEN index.json des Daten-Repos nach public/ — exakt so, wie der Warm-Cron es
// täte (dieselbe `sectionFor`/`GRIB_FAMILIES`). Sicherung der bisherigen Dateien unter
// public/*.bw6-backup.json; Wiederherstellen mit `--restore`.
//   node scripts/l0/probe-bw6-manifest.mjs [--restore]
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { fetchIndex, pickForRun, GRIB_FAMILIES } from '../lib/repackManifest.mjs';

const FILES = ['latest-grib', 'latest-wind'];
if (process.argv.includes('--restore')) {
  for (const f of FILES) {
    const b = `public/${f}.bw6-backup.json`;
    if (existsSync(b)) { writeFileSync(`public/${f}.json`, readFileSync(b)); unlinkSync(b); console.log('restored', f); }
  }
  process.exit(0);
}
const idx = await fetchIndex();
if (!idx.ok) { console.error(idx.note); process.exit(1); }
console.log(idx.note);
for (const f of FILES) {
  const prod = await (await fetch(`https://buscosun.com/${f}.json`, { cache: 'no-store' })).json();
  const fams = f === 'latest-wind' ? 'wind' : GRIB_FAMILIES;
  const section = pickForRun(idx.index, prod.run, fams);
  if (!section) { console.error(`${f}: Index führt Lauf ${prod.run} nicht`); process.exit(1); }
  const local = `public/${f}.json`;
  if (!existsSync(`public/${f}.bw6-backup.json`)) writeFileSync(`public/${f}.bw6-backup.json`, readFileSync(local));
  writeFileSync(local, JSON.stringify({ ...prod, repack: section }, null, 2) + '\n');
  const present = Object.keys(section).filter((k) => section[k]?.steps);
  console.log(`${f}: Lauf ${prod.run}, Commit ${section.commit.slice(0, 7)}, Familien ${present.join(', ')}`);
}
