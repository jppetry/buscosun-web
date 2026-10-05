#!/usr/bin/env node
/**
 * road-station-positions.mjs — V-AW-30: where the bulletin and the catalogue disagree about a station's position.
 *
 * Every SWIS station has two positions: the DWD station list (`road/v1/static/stations.json`, what the map and the
 * forecast points use) and the one the bulletin itself reports (`lat`/`lon` of the obs rows). This script reads every
 * obs file of a checkout of buscosun-data, takes each station's bulletin position(s) and lists the stations whose two
 * positions lie more than `--min` km apart, farthest first. It decides nothing — the list is the input for a decision
 * per station.
 *
 *   node scripts/road/road-station-positions.mjs --data=<checkout of buscosun-data> [--min=1] [--md=<file>] [--csv=<file>]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
if (typeof flags.data !== 'string') { console.error('--data=<Klon von buscosun-data> fehlt'); process.exit(2); }
const minKm = flags.min ? Number(flags.min) : 1;

const kmBetween = (aLat, aLon, bLat, bLon) => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
/** Decimals a number was reported with (54.89 → 2) — a bulletin with two decimals cannot be closer than ≈ 0.7 km. */
const decimals = (x) => { const s = String(x); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };

const dir = join(flags.data, 'road', 'v1');
const catalog = JSON.parse(readFileSync(join(dir, 'static', 'stations.json'), 'utf8')).stations;
const fcFile = join(flags.data, 'road', 'fc', 'v1', 'static', 'points.json');
const corridorOf = new Map(existsSync(fcFile) ? JSON.parse(readFileSync(fcFile, 'utf8')).points.filter((p) => p.kind === 'station').map((p) => [p.id, p.corridor]) : []);

const files = readdirSync(join(dir, 'obs')).filter((f) => /^\d{10}\.json$/.test(f)).sort();
const seen = new Map(); // id → { name, positions: Map("lat,lon" → count) }
for (const f of files) {
  const doc = JSON.parse(readFileSync(join(dir, 'obs', f), 'utf8'));
  for (const r of doc.points ?? []) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
    if (!seen.has(r.id)) seen.set(r.id, { name: r.n ?? r.id, positions: new Map() });
    const k = `${r.lat},${r.lon}`, s = seen.get(r.id);
    s.positions.set(k, (s.positions.get(k) ?? 0) + 1);
  }
}

const rows = [];
let noCatalog = 0, moving = 0;
for (const [id, s] of seen) {
  const c = catalog[id];
  if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) { noCatalog++; continue; }
  if (s.positions.size > 1) moving++;
  // The position reported most often; a station that reports several is flagged.
  const [k] = [...s.positions].sort((a, b) => b[1] - a[1])[0];
  const [lat, lon] = k.split(',').map(Number);
  const km = kmBetween(c.lat, c.lon, lat, lon);
  // Worst case of pure rounding of the bulletin to its reported decimals (half a step in both axes).
  const step = 10 ** -Math.min(decimals(lat), decimals(lon));
  const roundKm = Math.hypot(step / 2 * 111.2, step / 2 * 111.2 * Math.cos(c.lat * Math.PI / 180));
  rows.push({ id, name: c.n ?? s.name, bulletinName: s.name, bl: c.bl ?? '', road: c.roadRaw ?? c.road ?? '', kmRoad: c.km, cLat: c.lat, cLon: c.lon, h: c.h, lat, lon, km, roundKm, positions: s.positions.size, neu: !!c.neu, oob: !!c.oob, corridor: corridorOf.get(id) ?? null });
}
rows.sort((a, b) => b.km - a.km);
const off = rows.filter((r) => r.km > minKm);
const bins = [[100, Infinity], [20, 100], [5, 20], [2, 5], [1, 2]].map(([lo, hi]) => ({ lo, hi, n: rows.filter((r) => r.km > lo && r.km <= hi).length }));
const explained = off.filter((r) => r.km <= r.roundKm * 1.05).length;

const fmt = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const osm = (lat, lon) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`;
const summary = [
  `Messdateien: ${files.length} (${files[0]?.replace('.json', '')} … ${files.at(-1)?.replace('.json', '')}), Stationen mit Meldeposition: ${seen.size}, davon im Katalog mit Lage: ${rows.length}, ohne Katalogeintrag: ${noCatalog}`,
  `Abstand > ${minKm} km: ${off.length} — ${bins.map((b) => `${b.lo}–${Number.isFinite(b.hi) ? b.hi : '…'} km: ${b.n}`).join(' · ')}`,
  `davon durch die Rundung der Meldung allein erklärbar (Abstand ≤ größter Rundungsfehler ihrer Nachkommastellen): ${explained}`,
  `Stationen mit mehr als einer Meldeposition in den Dateien: ${moving}`,
];
for (const l of summary) console.log(l);

if (typeof flags.md === 'string') {
  const lines = [
    '# Stationslage: Meldung gegen Katalog (V-AW-30)',
    '',
    `Erzeugt von \`scripts/road/road-station-positions.mjs\` am ${new Date().toISOString().slice(0, 16)}Z. Die Liste entscheidet nichts.`,
    '',
    ...summary.map((l) => `- ${l}`),
    '',
    '**Spalten:** Katalog = DWD-Stationsliste (`road/v1/static/stations.json`, davon liest die Karte und der Prognosepunkt);',
    'Meldung = Position im laufenden Bulletin; Rundung = größter Abstand, den die Nachkommastellen der Meldung allein',
    'erklären; Korridor = Autobahn-Korridor der Station in der Streckenprognose (— = keiner). Die Links öffnen die Lage in',
    'OpenStreetMap — neben welcher Straße sie liegt, entscheidet (Spalte Straße).',
    '',
    '| # | Kennung | Name (Katalog) | Name (Meldung) | Land | Straße · km | Katalog | Meldung | Abstand km | Rundung km | Höhe m | Korridor | Hinweis |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...off.map((r, i) => `| ${i + 1} | ${r.id} | ${r.name} | ${r.bulletinName} | ${r.bl} | ${r.road}${Number.isFinite(r.kmRoad) ? ` · ${r.kmRoad}` : ''} | [${r.cLat}, ${r.cLon}](${osm(r.cLat, r.cLon)}) | [${r.lat}, ${r.lon}](${osm(r.lat, r.lon)}) | ${fmt(r.km, 1)} | ${fmt(r.roundKm, 2)} | ${fmt(r.h, 0)} | ${r.corridor ?? '—'} | ${[r.km <= r.roundKm * 1.05 ? 'Rundung' : '', r.positions > 1 ? `${r.positions} Meldepositionen` : '', r.neu ? 'Katalog: neu' : '', r.oob ? 'Katalog: außer Betrieb' : ''].filter(Boolean).join(', ')} |`),
    '',
  ];
  writeFileSync(flags.md, lines.join('\n'));
  console.log(`→ ${flags.md}`);
}
if (typeof flags.csv === 'string') {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  writeFileSync(flags.csv, ['id;name_katalog;name_meldung;land;strasse;km;lat_katalog;lon_katalog;lat_meldung;lon_meldung;abstand_km;rundung_km;hoehe_m;korridor',
    ...off.map((r) => [r.id, q(r.name), q(r.bulletinName), r.bl, r.road, r.kmRoad ?? '', r.cLat, r.cLon, r.lat, r.lon, r.km.toFixed(2), r.roundKm.toFixed(2), r.h ?? '', r.corridor ?? ''].join(';'))].join('\n') + '\n');
  console.log(`→ ${flags.csv}`);
}
