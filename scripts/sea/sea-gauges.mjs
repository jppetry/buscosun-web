#!/usr/bin/env node
/**
 * WL-2 — Gauge catalogue of the water level line (`audit/wasserstand-bsh.md` §6): reads the official BSH
 * OGC API and writes the compact mirror `sea/v1/static/gauges.json` (E-WL-2, Jan 12.10.2026).
 *
 * Why a mirror at all, when the API is open? Because `properties=` is rejected with 400 (V-WL-4): the only
 * way to learn the 136 positions from the API is the full answer, 500 KB gz / 5,66 MB JSON, every single
 * one carrying its whole forecast curve. The catalogue is ≈ 6 KB gz and changes almost never, so the browser
 * reads the positions from here and the CURVES live from the API — the data still comes from nowhere else
 * than the official service (E-WL-3).
 *
 * Writes only when the content changed (the publisher commits `sea/` only if git sees a diff, so an
 * unchanged pass leaves no commit either way — this just keeps the mtime and the log honest).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/sea-gauges.mjs --store=<sea/v1> [--now=<iso>] [--out=<file>]
 * Last stdout line = JSON summary (`changed: true` ⇒ the file was rewritten).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WL_ATTRIBUTION, WL_CATALOG_PATH, WL_CATALOG_PRODUCT, WL_COLLECTION, WL_LICENCE, WL_PAGE_LIMIT, WL_SERVICE,
  wlCatalogProblems, wlGaugeOf, wlItemsUrl, wlStr, wlText,
} from '../../src/sea/waterLevel.ts';
import { writeAtomic, readStatus, writeStatus } from './sea-derive.mjs';

const SELF = fileURLToPath(import.meta.url);
const UA = 'buscosun-sea (buscosun-web/audit/wasserstand-bsh.md)';
/** A catalogue with fewer gauges than this is not a catalogue — the service carried 136 on 12.10.2026. */
export const WL_MIN_GAUGES = 100;

/** All features of the collection; follows `rel: next` although one page held all 136 (measured). */
export async function fetchAllItems(fetchImpl = fetch, log = () => {}) {
  const features = [];
  let url = wlItemsUrl(WL_PAGE_LIMIT);
  let matched = null, served = null, pages = 0;
  while (url && pages < 20) {
    const r = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/geo+json' }, signal: AbortSignal.timeout(90_000) });
    if (!r.ok) throw new Error(`BSH HTTP ${r.status} (${url})`);
    const j = await r.json();
    if (j?.type !== 'FeatureCollection' || !Array.isArray(j.features)) throw new Error('BSH: keine FeatureCollection');
    features.push(...j.features);
    matched ??= Number.isFinite(j.numberMatched) ? j.numberMatched : null;
    served ??= wlStr(j.timeStamp);
    pages++;
    log(`Seite ${pages}: ${j.features.length} Pegel (von ${matched ?? '?'})`);
    const next = (j.links ?? []).find((l) => l?.rel === 'next')?.href;
    url = next && features.length < (matched ?? Infinity) ? String(next).replace(/&?f=\w+/, '') + '&f=json' : null;
  }
  return { features, matched, served };
}

export function buildCatalog(features, nowMs, copyright) {
  const gauges = [];
  const dropped = [];
  for (const f of features) {
    const g = wlGaugeOf(f);
    if (g) gauges.push(g);
    else dropped.push(wlStr(f?.id) ?? '(ohne Kennung)');
  }
  gauges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    doc: {
      schema: 1,
      product: WL_CATALOG_PRODUCT,
      about: 'Pegelkatalog der Wasserstandsvorhersage (WL-2, audit/wasserstand-bsh.md). Lage und Bezugshöhen der '
        + 'amtlichen BSH-Pegel, gebaut aus der offiziellen OGC API (Feld "source"). Die Vorhersagekurven stehen NICHT '
        + 'hier: der Browser liest sie je gewähltem Pegel live aus derselben API (E-WL-2).',
      builtAt: new Date(nowMs).toISOString(),
      source: `${WL_SERVICE}/collections/${WL_COLLECTION}/items`,
      licence: WL_LICENCE,
      attribution: WL_ATTRIBUTION,
      copyright,
      gauges,
    },
    dropped,
  };
}

export async function buildGauges({ storeDir, outFile, nowMs, fetchImpl = fetch, log = () => {} }) {
  const { features, matched, served } = await fetchAllItems(fetchImpl, log);
  log(`${features.length} Pegel gelesen, Dienst-Stempel ${served ?? '–'}`);

  // The licence sits in every feature (audit §2) — taken from the data, not written by hand.
  const licences = new Set(features.map((f) => wlStr(f?.properties?.licence)).filter(Boolean));
  if (licences.size !== 1 || !licences.has(WL_LICENCE)) {
    throw new Error(`Lizenz in den Daten ist nicht ausschließlich "${WL_LICENCE}": ${[...licences].join(' | ') || '(keine)'}`);
  }
  const copyright = wlText(features.find((f) => wlText(f?.properties?.copyright))?.properties?.copyright) ?? null;

  const { doc, dropped } = buildCatalog(features, nowMs, copyright);
  if (doc.gauges.length < WL_MIN_GAUGES) throw new Error(`nur ${doc.gauges.length} Pegel (< ${WL_MIN_GAUGES}) — Dienst unvollständig, nichts geschrieben`);
  const problems = wlCatalogProblems(doc.gauges);
  if (problems.length) throw new Error(`Katalogregeln verletzt: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (+${problems.length - 5})` : ''}`);

  const file = outFile ?? join(storeDir, WL_CATALOG_PATH);
  const next = JSON.stringify(doc) + '\n';
  // Compare without `builtAt`, otherwise every pass looks changed.
  const same = existsSync(file) && (() => {
    try {
      const a = JSON.parse(readFileSync(file, 'utf8'));
      return JSON.stringify({ ...a, builtAt: null }) === JSON.stringify({ ...doc, builtAt: null });
    } catch { return false; }
  })();
  if (!same) writeAtomic(file, next);

  const byRegion = { north_sea: 0, baltic_sea: 0 };
  for (const g of doc.gauges) byRegion[g.region]++;
  const res = {
    gauges: doc.gauges.length, matched, dropped: dropped.length,
    withCurve: doc.gauges.filter((g) => g.has.curve).length,
    withEvents: doc.gauges.filter((g) => g.has.events).length,
    nordsee: byRegion.north_sea, ostsee: byRegion.baltic_sea,
    bytes: Buffer.byteLength(next), changed: !same, file,
  };

  if (storeDir && !outFile) {
    const st = readStatus(storeDir);
    st.gauges = { at: new Date(nowMs).toISOString(), count: res.gauges, changed: res.changed, source: WL_SERVICE };
    writeStatus(storeDir, st, nowMs);
  }
  return res;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const res = await buildGauges({
    storeDir: args.store ? resolve(String(args.store)) : null,
    outFile: args.out ? resolve(String(args.out)) : null,
    nowMs: typeof args.now === 'string' ? Date.parse(args.now) : Date.now(),
    log: (m) => console.log(`[sea-gauges] ${m}`),
  });
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) await main();
