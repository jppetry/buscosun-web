#!/usr/bin/env node
/**
 * stationsdichte.mjs — zählt die Punkte des Punktarchivs (Schema 5) und misst, wie nah die nächste Messstation an
 * einem beliebigen Ort und an einem Katalogpunkt ohne eigene Station liegt: nur Katalogpunkte gegen Katalog + Eingabe-Punkte.
 *
 * Herkunft: Cowork-Sitzung 07.10.2026. Liest nur die Punktlisten des Sammlers (kein Slot nötig):
 *   scripts/punktarchiv/points.json        — 405 Katalogpunkte
 *   scripts/punktarchiv/points-extra.json  — 1 664 Eingabe-Punkte (TAWES, SMN, CDC, reine Niederschlagsstationen)
 *
 * Aufruf (im Repo): node audit/fusion10-vorbereitung/stationsdichte.mjs [--katalog=<points.json>] [--extra=<points-extra.json>]
 *
 * Näherung „bewohntes DACH“: Gitter 0,05° über 45,8–55,1 °N / 5,8–17,2 °O; ein Gitterpunkt zählt, wenn irgendeine Station
 * (auch reine Niederschlagsstation) höchstens 12 km entfernt ist und diese Station in DE, AT oder CH steht. Keine Landmaske.
 */
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, true]; }));
const cat = JSON.parse(readFileSync(args.katalog ?? 'scripts/punktarchiv/points.json', 'utf8')).points;
const extra = JSON.parse(readFileSync(args.extra ?? 'scripts/punktarchiv/points-extra.json', 'utf8')).points;
const all = [...cat, ...extra];
const DACH = new Set(['DE', 'AT', 'CH']);

const isCat = (p) => p.role !== 'input';
const hasT = (p) => isCat(p) || (!p.precipOnly && (p.net !== 'cdc' || (p.vars ?? []).includes('tu')));
const hasRR = (p) => isCat(p) || ['tawes', 'smn', 'smnp'].includes(p.net) || (p.vars ?? []).includes('rr');

// ── Zählung ────────────────────────────────────────────────────────────────────────────────────────────────────────
const group = (p) => (isCat(p) ? 'Katalog' : p.precipOnly ? `Niederschlag (${p.net})` : `Eingabe ${p.net}`);
const counts = {};
for (const p of all) { const g = group(p), c = DACH.has(p.country) ? p.country : 'andere'; counts[g] ??= { DE: 0, AT: 0, CH: 0, andere: 0, summe: 0 }; counts[g][c]++; counts[g].summe++; }
console.log('Punkte nach Gruppe und Land'); console.table(counts);
console.log(`mit Temperatur: Katalog ${cat.filter(hasT).length}, alle ${all.filter(hasT).length} · mit Niederschlag: Katalog ${cat.length}, alle ${all.filter(hasRR).length}`);
const band = (e) => (e < 500 ? '<500' : e < 1000 ? '500-1000' : e < 1500 ? '1000-1500' : e < 2000 ? '1500-2000' : '>=2000');
for (const [label, list] of [['Katalog', cat], ['mit Temperatur (Katalog + Eingabe)', all.filter(hasT)]]) {
  const t = {};
  for (const p of list) if (DACH.has(p.country)) { t[p.country] ??= { '<500': 0, '500-1000': 0, '1000-1500': 0, '1500-2000': 0, '>=2000': 0 }; t[p.country][band(p.elev)]++; }
  console.log(`Höhenstufen ${label}`); console.table(t);
}

// ── Abstände ───────────────────────────────────────────────────────────────────────────────────────────────────────
const R = 6371.0088, rad = Math.PI / 180;
const km = (a, b) => { const dla = (b.lat - a.lat) * rad, dlo = (b.lon - a.lon) * rad; const h = Math.sin(dla / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const nearest = (q, ref, skipSelf) => { let best = null, d = Infinity; for (const r of ref) { if (skipSelf && (r.id === q.id || km(q, r) < 0.3)) continue; const x = km(q, r); if (x < d) { d = x; best = r; } } return { d, r: best }; };
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const f1 = (x) => x.toFixed(1);

const tests = cat.filter((p) => DACH.has(p.country));
console.log('\nKatalogpunkt ohne eigene Station: nächste andere Temperaturstation');
for (const [name, ref] of [['nur Katalog', cat], ['Katalog + Eingabe', all.filter(hasT)]]) {
  for (const c of ['DE', 'AT', 'CH', 'alle']) {
    const sub = tests.filter((p) => c === 'alle' || p.country === c).map((p) => { const n = nearest(p, ref, true); return { d: n.d, dh: Math.abs(p.elev - n.r.elev) }; });
    const near = sub.filter((x) => x.d <= 10 && x.dh <= 100).length / sub.length;
    console.log(`${name.padEnd(18)} ${c.padEnd(4)} n=${String(sub.length).padStart(3)}  Abstand p50 ${f1(pct(sub.map((x) => x.d), 0.5))} km p90 ${f1(pct(sub.map((x) => x.d), 0.9))} km · |Δh| p50 ${pct(sub.map((x) => x.dh), 0.5)} m p90 ${pct(sub.map((x) => x.dh), 0.9)} m · ≤10 km und ≤100 m: ${(near * 100).toFixed(0)} %`);
  }
}

const grid = [];
for (let la = 45.8; la < 55.1; la += 0.05) for (let lo = 5.8; lo < 17.2; lo += 0.05) {
  const g = { lat: la, lon: lo }; const n = nearest(g, all, false);
  if (n.d <= 12 && DACH.has(n.r.country)) grid.push({ ...g, country: n.r.country });
}
console.log(`\nGitterpunkte (Näherung bewohntes DACH): ${grid.length}`);
for (const [what, flt] of [['Temperatur', hasT], ['Niederschlag', hasRR]]) {
  for (const [name, ref] of [['nur Katalog', cat], ['Katalog + Eingabe', all.filter(flt)]]) {
    for (const c of ['DE', 'AT', 'CH', 'alle']) {
      const ds = grid.filter((g) => c === 'alle' || g.country === c).map((g) => nearest(g, ref, false).d);
      console.log(`${what.padEnd(12)} ${name.padEnd(18)} ${c.padEnd(4)} p50 ${f1(pct(ds, 0.5))} km  p90 ${f1(pct(ds, 0.9))} km  ≤10 km: ${(ds.filter((d) => d <= 10).length / ds.length * 100).toFixed(0)} %`);
    }
  }
}
