#!/usr/bin/env node
/**
 * Phase GLS (audit/gletscher-seo.md): Datenstand der statischen Gletscherseiten.
 *
 * Läuft NICHT im Build. Liest den veröffentlichten Gletscher-Build (Katalog, Reihen, Projektion, Hypsometrie, amtliche Zahlen,
 * Quellen) und schreibt `scripts/seo/data/glacier-pages.json` — dieselbe Rolle wie `place-modules.json` für die Ortsseiten:
 * der Build rechnet offline und deterministisch, die Sitemap bekommt ein ehrliches lastmod je Gletscher.
 *
 *   node scripts/seo/refresh-glacier-pages.mjs                         # holt den Build über raw.githubusercontent (Zeiger index.json)
 *   node scripts/seo/refresh-glacier-pages.mjs --glacier=../buscosun-data/glacier   # lokaler Klon (Ordner mit v1/static/<build>/)
 *   node scripts/seo/refresh-glacier-pages.mjs --build=20261012-1      # festen Build statt des Zeigers
 *
 * Was hier entschieden wird (und nur hier):
 *  · welche Gletscher eine eigene, indexierbare Seite bekommen (`tier`, Regel `glacierTier`),
 *  · die Kennzahlen je Gletscher nach denselben Regeln wie der Steckbrief (`src/glacier/glacierSheetModel.ts`:
 *    längste Längenreihe kumuliert mit Lücken, letzte Massenbilanz, Flächenänderung erstes → letztes Inventar, Projektion als Spanne),
 *  · `updated` je Gletscher: bleibt stehen, solange sich der Datensatz der Seite nicht ändert (Hash), sonst das heutige Datum.
 * Der Text der Seiten entsteht erst im Build (`glacierPages.mjs`).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'data', 'glacier-pages.json');
const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

// --- Quelle: lokaler Klon oder raw.githubusercontent ------------------------------------------------------------------
async function source() {
  if (args.glacier) {
    const dir = resolve(process.cwd(), args.glacier);
    const builds = readdirSync(join(dir, 'v1', 'static')).filter((b) => /^\d{8}-\d+$/.test(b)).sort();
    const build = args.build || builds[builds.length - 1];
    const base = join(dir, 'v1', 'static', build);
    if (!existsSync(base)) throw new Error(`Build ${build} fehlt unter ${base}`);
    return { build, read: async (f) => (existsSync(join(base, f)) ? JSON.parse(readFileSync(join(base, f), 'utf8')) : null) };
  }
  const build = args.build || (await (await fetch(`${RAW}/main/glacier/v1/index.json`)).json()).static.build;
  return {
    build,
    read: async (f) => {
      const res = await fetch(`${RAW}/glacier/glacier/v1/static/${build}/${f}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
      return res.json();
    },
  };
}

// --- Regeln -------------------------------------------------------------------------------------------------------------
/**
 * Eigene, indexierbare Seite (Stufe A/B, audit/gletscher-seo.md §3): nur benannte Gletscher, und nur mit eigenständigem Datenwert.
 *  A — Leitgletscher, Längen- oder Massenreihe, oder einer der deutschen Gletscher (Messreihe bzw. amtliche Zahl je Gletscher)
 *  B — Größenklasse A (≥ 1 km²): Inventarfläche mit Bezugsjahr, frühere Inventare, Höhenstufen, Projektion, Schneegrenze aus Sentinel-2
 * Alle übrigen bleiben Teil der Lage (`/gletscher`, Canonical dorthin) und stehen in den Tabellen des Atlas.
 */
function glacierTier(g, kinds) {
  if (!g.name) return null;
  if (g.lead || kinds.has('length') || kinds.has('mass') || g.country === 'DE') return 'A';
  if (g.klass === 'A') return 'B';
  return null;
}
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const seg = (id) => id.slice(3).replace('_', '-');

/** wie `longestLength` + `cumulativeLength` (glacierSheetModel.ts) */
function lengthSummary(series) {
  const l = series.filter((s) => s.kind === 'length' && s.rows.length > 0);
  if (!l.length) return null;
  const s = l.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
  const rows = [...s.rows].sort((a, b) => a[0] - b[0]);
  let cum = 0, gaps = 0, prevEnd = rows[0][0];
  for (const r of rows) { if (r[0] > prevEnd) gaps += r[0] - prevEnd; cum += r[2]; prevEnd = r[1]; }
  return {
    from: rows[0][0], to: rows[rows.length - 1][1], total: r1(cum), gaps, n: rows.length,
    recent: rows.slice(-10).map((r) => [r[0], r[1], r1(r[2])]),
    source: s.source, doi: s.doi ?? null, origin: s.origin,
  };
}
/** wie `massRows` + `latestMass` */
function massSummary(series) {
  const s = series.find((x) => x.kind === 'mass');
  if (!s || !s.rows.length) return null;
  const rows = s.rows.filter((r) => typeof r[3] === 'number');
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const ten = rows.filter((r) => r[0] > last[0] - 10);
  return {
    from: rows[0][0], to: last[0], n: rows.length,
    last: { year: last[0], ba: last[3], ela: last[4] ?? null, aar: last[5] ?? null },
    mean10: ten.length >= 5 ? Math.round(ten.reduce((a, r) => a + r[3], 0) / ten.length) : null, n10: ten.length,
    recent: rows.slice(-10).map((r) => [r[0], r[3], r[4] ?? null, r[5] ?? null]),
    method: s.method, source: s.source, doi: s.doi ?? null,
  };
}
/** wie `areaChange`, dazu alle Inventarjahre */
function areaSummary(series) {
  const s = series.find((x) => x.kind === 'area');
  if (!s || s.rows.length < 2) return null;
  const rows = [...s.rows].sort((a, b) => a[0] - b[0]);
  const a = rows[0], b = rows[rows.length - 1];
  if (!(a[1] > 0)) return null;
  return { rows: rows.map((r) => [r[0], r3(r[1])]), pct: r1(((b[1] - a[1]) / a[1]) * 100), source: s.source };
}
/** wie `projectionView`: Spanne des ersten Jahres unter 10 % über alle Szenarien; dazu Median und Spanne 2050/2100 für SSP1-2.6 und SSP5-8.5. */
function projSummary(meta, e) {
  if (!meta || !e) return null;
  const i2050 = meta.years.indexOf(2050), i2100 = meta.years.indexOf(2100);
  const at = (key, i) => (e.f[key] && i >= 0 ? [Math.round(e.f[key][0][i] * 100), Math.round(e.f[key][1][i] * 100), Math.round(e.f[key][2][i] * 100)] : null);
  const scen = Object.keys(e.f);
  const firsts = scen.map((k) => e.u10?.[k]?.[0]).filter((v) => v != null);
  const lasts = scen.map((k) => e.u10?.[k]?.[2] ?? null);
  return {
    model: meta.model, base: 'Volumen 2020 = 100 %',
    v2020km3: e.v2020km3 ?? null,
    range: firsts.length ? { from: Math.min(...firsts), to: lasts.some((v) => v == null) ? null : Math.max(...lasts) } : null,
    ssp126: { y2050: at('ssp126', i2050), y2100: at('ssp126', i2100) },
    ssp585: { y2050: at('ssp585', i2050), y2100: at('ssp585', i2100) },
  };
}

// --- Lauf ---------------------------------------------------------------------------------------------------------------
const src = await source();
const catalog = await src.read('catalog.json');
if (!catalog?.glaciers?.length) throw new Error('Katalog leer');
const official = (await src.read('official.json'))?.items ?? [];
const sources = (await src.read('sources.json'))?.sources ?? [];
const regions = [...new Set(catalog.glaciers.map((g) => g.region))].sort();
const series = {}, proj = {}, hypso = {}, projMeta = {};
for (const r of regions) {
  const s = await src.read(`series/${r}.json`); if (s) Object.assign(series, s.glaciers);
  const p = await src.read(`proj/${r}.json`); if (p) { projMeta[r] = { years: p.years, model: p.model }; for (const [k, v] of Object.entries(p.glaciers)) proj[k] = { ...v, region: r }; }
  const h = await src.read(`hypso/${r}.json`); if (h) Object.assign(hypso, h.glaciers);
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const prevById = new Map((prev?.glaciers ?? []).map((g) => [g.id, g]));
const today = args.date || new Date().toISOString().slice(0, 10);

const glaciers = [];
for (const g of catalog.glaciers) {
  if (!g.name) continue;                                        // namenlose Gletscher: nur in den Summen
  const ser = series[g.id] ?? [];
  const kinds = new Set(ser.map((s) => s.kind));
  const tier = glacierTier(g, kinds);
  if (!tier && g.klass === 'C') continue;                       // Tabellen des Atlas: ab 0,1 km² (Klasse A/B)
  const rec = {
    id: g.id, seg: seg(g.id), name: g.name, country: g.country, region: g.region, klass: g.klass,
    area: { km2: r3(g.area.km2), refYear: g.area.refYear, source: g.area.source },
    z: g.z, zSource: g.zSource, asp: g.asp, lat: Math.round(g.lat * 1000) / 1000, lon: Math.round(g.lon * 1000) / 1000,
    lead: !!g.lead, status: g.status ?? null, tier,
    kinds: [...kinds].filter((k) => k !== 'area').sort(),
  };
  if (tier) {
    rec.inv = Object.fromEntries(Object.entries(g.inv ?? {}).filter(([k]) => ['glims', 'agi5', 'gi4', 'wgms', 'rgi6'].includes(k)));
    rec.length = lengthSummary(ser);
    rec.mass = massSummary(ser);
    rec.areaSeries = areaSummary(ser);
    rec.proj = projSummary(projMeta[proj[g.id]?.region], proj[g.id]);
    const h = hypso[g.id];
    rec.hypso = h ? { bandM: 50, z0: h.z0, zr: h.zr, bands: h.a.length } : null;
    rec.official = official.filter((o) => o.glacierId === g.id).map((o) => o.id);
  } else {
    // Tabellenzeile: Klasse B ohne eigene Seite
    rec.length = null; rec.mass = null;
  }
  const hash = createHash('sha256').update(JSON.stringify(rec)).digest('hex').slice(0, 16);
  const old = prevById.get(g.id);
  rec.hash = hash;
  rec.updated = old && old.hash === hash && old.updated ? old.updated : today;
  glaciers.push(rec);
}

// Doppelte Namen (z. B. zwei „Horn Kees") brauchen die Region im Titel.
const nameCount = new Map();
for (const g of glaciers) if (g.tier) nameCount.set(g.name, (nameCount.get(g.name) ?? 0) + 1);
for (const g of glaciers) if (g.tier && nameCount.get(g.name) > 1) g.dupName = true;

// Summen je Land und Region über den GANZEN Katalog (auch namenlos, auch Klasse C) — die Zahl, die das Inventar nennt.
const sums = {};
for (const g of catalog.glaciers) {
  for (const key of [g.country, g.region]) {
    const s = (sums[key] ??= { n: 0, km2: 0, named: 0, classA: 0, refYears: new Set(), sources: new Set() });
    s.n++; s.km2 += g.area.km2; if (g.name) s.named++; if (g.klass === 'A') s.classA++;
    s.refYears.add(String(g.area.refYear)); s.sources.add(g.area.source);
  }
}
for (const s of Object.values(sums)) {
  const ys = [...s.refYears].map((y) => String(y)).sort();
  s.km2 = r3(s.km2); s.refYears = ys.length > 1 ? `${ys[0].slice(0, 4)}–${ys[ys.length - 1].slice(-4)}` : ys[0]; s.sources = [...s.sources].sort();
}

const out = {
  schema: 1, kind: 'seo/glacier-pages', build: src.build, catalogBuiltAt: catalog.builtAt, refreshed: today,
  note: 'Erzeugt von scripts/seo/refresh-glacier-pages.mjs — nicht von Hand ändern.',
  counts: { catalog: catalog.glaciers.length, pages: glaciers.filter((g) => g.tier).length, tierA: glaciers.filter((g) => g.tier === 'A').length, tierB: glaciers.filter((g) => g.tier === 'B').length, rows: glaciers.length },
  sums,
  official,
  sources: sources.map((s) => ({ id: s.id, label: s.label, licence: s.licence, url: s.url, refYear: s.refYear })),
  glaciers,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out) + '\n', 'utf8');
const changed = glaciers.filter((g) => g.updated === today && prevById.get(g.id)?.hash !== g.hash).length;
console.log(`[glacier-pages] Build ${src.build}: ${out.counts.pages} Seiten (A ${out.counts.tierA}, B ${out.counts.tierB}), ${glaciers.length} Tabellenzeilen, ${changed} neu oder geändert → scripts/seo/data/glacier-pages.json`);
