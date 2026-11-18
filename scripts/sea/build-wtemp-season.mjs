#!/usr/bin/env node
/**
 * Phase WT — builds the season curves `sea/v1/static/wtemp-season.json` (`seaWaterTemp.ts`) for the stations of the
 * water temperature catalogue at which ONE source delivers at least `WT_SEASON_MIN_YEARS` full years. Measured in step 0:
 * only DMI oceanObs `tw` reaches back that far (PEGELONLINE holds 31 days). Run once by hand; the result is static.
 *
 * Per station and candidate year twelve requests (one month each, 10-minute raw values), thinned to whole hours
 * (`wtHourly`), reduced to `[min, mean, max, hours]` per UTC day (`wtDayStat`) — the same rules as our own record. A year
 * counts when `WT_YEAR_MIN_DAYS` days are full; the curve is `wtSeasonFromDays` over the full years. Nothing is
 * smoothed or filled. The daily values are kept per station as evidence (`--days`), and a second run reads them instead
 * of asking DMI again.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/build-wtemp-season.mjs
 *     --stations=dmi:31623,dmi:23289  --from=2014 --to=2025
 *     [--cat=scripts/lib/fixtures/sea/wt/watertemp.json] [--days=audit/seewetter-wassertemperatur/season]
 *     [--out=scripts/lib/fixtures/sea/wt/wtemp-season.json]
 * Last stdout line = JSON summary.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DMI_HOST } from '../../src/sea/seaDmi.ts';
import {
  SEA_WT_SEASON_PRODUCT, WT_SEASON_MIN_YEARS, WT_YEAR_MIN_DAYS, WT_DAY_MIN_HOURS, dmiTwObsOf, wtHourly, wtDayStat, wtFullYears, wtSeasonFromDays,
} from '../../src/sea/seaWaterTemp.ts';

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'buscosun-sea (buscosun.com Seewetter, one-off build of a season curve)';

/** One month of `tw` at one station → hourly points. `null` = no answer after all tries. */
async function month(id, y, m, log) {
  const from = `${y}-${String(m).padStart(2, '0')}-01T00:00:00Z`;
  const to = m === 12 ? `${y + 1}-01-01T00:00:00Z` : `${y}-${String(m + 1).padStart(2, '0')}-01T00:00:00Z`;
  const url = `${DMI_HOST}/v2/oceanObs/collections/observation/items?stationId=${id}&parameterId=tw&datetime=${from}/${to}&limit=6000`;
  for (let a = 1; a <= 4; a++) {
    await sleep(600);
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(120_000) });
      if (r.status === 429 || r.status >= 500) { log(`${id} ${y}-${m}: HTTP ${r.status}, Versuch ${a}`); await sleep(8000 * a); continue; }
      const s = r.ok ? dmiTwObsOf(await r.json()) : null;
      return s ? wtHourly(s.points) : null;
    } catch (e) { log(`${id} ${y}-${m}: ${String(e.message).split('\n')[0]}, Versuch ${a}`); await sleep(8000 * a); }
  }
  return null;
}

/** The daily values of one station over the years `from … to` (asked month by month). */
export async function stationDays(id, from, to, log = () => {}) {
  const days = {};
  let asked = 0, missing = 0;
  for (let y = from; y <= to; y++) {
    const byDay = new Map();
    for (let m = 1; m <= 12; m++) {
      const pts = await month(id, y, m, log);
      asked++;
      if (!pts) { missing++; continue; }
      for (const p of pts) { const d = new Date(p.t).toISOString().slice(0, 10); if (+d.slice(0, 4) !== y) continue; (byDay.get(d) ?? byDay.set(d, []).get(d)).push(p.c); }
    }
    for (const [d, v] of [...byDay.entries()].sort()) { const s = wtDayStat(v); if (s) days[d] = s; }
    log(`${id} ${y}: ${[...byDay.values()].filter((v) => v.length >= WT_DAY_MIN_HOURS).length} volle Tage`);
  }
  return { days, asked, missing };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const log = (m) => console.log(`[wtemp-season] ${m}`);
  const cat = JSON.parse(readFileSync(resolve(ROOT, String(args.cat ?? 'scripts/lib/fixtures/sea/wt/watertemp.json')), 'utf8'));
  const keys = String(args.stations ?? '').split(',').filter(Boolean);
  const from = Number(args.from ?? 2014), to = Number(args.to ?? new Date().getUTCFullYear() - 1);
  const daysDir = resolve(ROOT, String(args.days ?? 'audit/seewetter-wassertemperatur/season'));
  mkdirSync(daysDir, { recursive: true });
  const stations = {}, summary = {};
  for (const key of keys) {
    const st = cat.stations.find((s) => s.key === key);
    if (!st || st.net !== 'dmi') { log(`${key}: keine DMI-Station des Katalogs — übersprungen`); continue; }
    const file = join(daysDir, `${key.replace(':', '-')}.json`);
    let rec = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    if (!rec || rec.from !== from || rec.to !== to) {
      const r = await stationDays(st.id, from, to, log);
      rec = { station: key, name: st.name, source: `${DMI_HOST}/v2/oceanObs (tw), CC BY 4.0`, from, to, askedAt: new Date().toISOString(), requests: r.asked, monthsWithoutAnswer: r.missing, unit: '°C', about: 'Je UTC-Tag [Minimum, Mittel, Maximum, Zahl der Stundenwerte] aus den 10-min-Rohwerten, auf volle Stunden ausgedünnt (wtHourly, wtDayStat).', days: r.days };
      writeFileSync(file, JSON.stringify(rec) + '\n');
    }
    const fullDays = Object.entries(rec.days).filter(([, s]) => s[3] >= WT_DAY_MIN_HOURS).map(([day]) => ({ day }));
    const season = wtSeasonFromDays(rec.days);
    summary[key] = { fullYears: wtFullYears(fullDays), fullDays: fullDays.length, season: !!season };
    if (season) stations[key] = { name: st.name, years: season.years, days: season.days };
    log(`${key} ${st.name}: volle Jahre ${summary[key].fullYears.join(' ') || '–'} ⇒ ${season ? 'Jahresgang' : `kein Jahresgang (unter ${WT_SEASON_MIN_YEARS})`}`);
  }
  const doc = {
    schema: 1, product: SEA_WT_SEASON_PRODUCT, built: new Date().toISOString(), unit: '°C', minYears: WT_SEASON_MIN_YEARS, yearMinDays: WT_YEAR_MIN_DAYS,
    about: 'Jahresgang der gemessenen Wassertemperatur an Stationen, an denen EINE Quelle mindestens fünf volle Jahre liefert: je Kalendertag [niedrigstes, mittleres, höchstes Tagesmittel der vollen Jahre] in °C. Nicht geglättet, nicht aufgefüllt; null = weniger als drei Jahre mit diesem Tag.',
    source: 'DMI oceanObs (tw), CC BY 4.0, eigene Auswertung', stations,
  };
  const out = resolve(ROOT, String(args.out ?? 'scripts/lib/fixtures/sea/wt/wtemp-season.json'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc) + '\n');
  console.log(JSON.stringify({ out, stations: Object.keys(stations), summary, bytes: Buffer.byteLength(JSON.stringify(doc)) + 1 }));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) await main();
