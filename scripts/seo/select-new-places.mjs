/**
 * Einmal-Werkzeug: Auswahl neuer Ortsseiten (Phase 2 — nur Liste, es wird nichts gebaut).
 *
 * Quelle: GeoNames `cities1000` (CC BY 4.0, https://www.geonames.org/) — bewohnte Orte mit Einwohnerzahl,
 * Koordinate und Bundesland/Kanton. Quellenvermerk Pflicht: „Ortsliste: GeoNames (CC BY 4.0)“.
 *
 * Regeln
 *  1. Tourismus-Hotspots (kuratierte Liste unten, aufgelöst gegen GeoNames — Koordinaten kommen aus GeoNames,
 *     nicht aus dem Gedächtnis): Küste/Inseln, Skigebiete, Seeorte, Berg-/Gletscherorte. Mindestabstand 3 km
 *     zu jedem bestehenden oder schon gewählten Ort.
 *  2. Städte und Gemeinden nach Einwohnern, absteigend, mit Mindestabstand zu jedem bestehenden oder schon
 *     gewählten Ort (Vorort-Dubletten wie Bern–Köniz vermeiden): DE ab 20 000 / 10 km; AT und CH ab 8 000 / 6 km.
 *  3. Nie wieder ein Ort der bestehenden 198 (Name oder 3 km).
 *  4. Slug = `toSlug(name)`; Kollisionen mit bestehenden oder neuen Slugs werden mit dem Bundesland/Kanton ergänzt.
 *
 * Aufruf: node scripts/seo/select-new-places.mjs --geonames=<Ordner mit cities1000.txt und admin1CodesASCII.txt>
 *           [--data=../buscosun-data] [--glacier=../buscosun-glacier] [--out=scripts/seo/data/new-places-candidates.csv]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES, toSlug } from './places.mjs';
import { distKm } from './lib/geo.mjs';
import { loadModuleCatalogs, relationsFor } from './lib/moduleRelations.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
if (!args.geonames) { console.error('--geonames=<Ordner> fehlt'); process.exit(1); }
const GN = resolve(args.geonames);
const OUT = resolve(args.out || join(HERE, 'data', 'new-places-candidates.csv'));
const cat = loadModuleCatalogs(resolve(HERE, '..', '..', args.data || '../buscosun-data'), resolve(HERE, '..', '..', args.glacier || '../buscosun-glacier'));

// ---- Parameter
const RULES = { DE: { minPop: 28000, minKm: 11 }, AT: { minPop: 10000, minKm: 8 }, CH: { minPop: 10000, minKm: 8 }, tourismKm: 3 };
for (const cc of ['DE', 'AT', 'CH']) if (args[cc.toLowerCase()]) { const [p, k] = String(args[cc.toLowerCase()]).split(':').map(Number); RULES[cc] = { minPop: p, minKm: k }; }

// ---- Bundesland / Kanton auf Deutsch (GeoNames führt englische Namen)
const REGION_DE = { '01': 'Baden-Württemberg', '02': 'Bayern', '03': 'Bremen', '04': 'Hamburg', '05': 'Hessen', '06': 'Niedersachsen', '07': 'Nordrhein-Westfalen', '08': 'Rheinland-Pfalz', '09': 'Saarland', '10': 'Schleswig-Holstein', '11': 'Brandenburg', '12': 'Mecklenburg-Vorpommern', '13': 'Sachsen', '14': 'Sachsen-Anhalt', '15': 'Thüringen', '16': 'Berlin' };
const REGION_AT = { '01': 'Burgenland', '02': 'Kärnten', '03': 'Niederösterreich', '04': 'Oberösterreich', '05': 'Salzburg', '06': 'Steiermark', '07': 'Tirol', '08': 'Vorarlberg', '09': 'Wien' };
const REGION_CH = { AG: 'Aargau', AR: 'Appenzell Ausserrhoden', AI: 'Appenzell Innerrhoden', BL: 'Basel-Landschaft', BS: 'Basel-Stadt', BE: 'Bern', FR: 'Freiburg', GE: 'Genf', GL: 'Glarus', GR: 'Graubünden', JU: 'Jura', LU: 'Luzern', NE: 'Neuenburg', NW: 'Nidwalden', OW: 'Obwalden', SH: 'Schaffhausen', SZ: 'Schwyz', SO: 'Solothurn', SG: 'St. Gallen', TI: 'Tessin', TG: 'Thurgau', UR: 'Uri', VD: 'Waadt', VS: 'Wallis', ZG: 'Zug', ZH: 'Zürich' };
const regionOf = (cc, a1) => ({ DE: REGION_DE, AT: REGION_AT, CH: REGION_CH }[cc]?.[a1] ?? null);

// ---- Tourismus-Hotspots: [Name (GeoNames), Land, Bundesland/Kanton, Kategorie]
const T = (cat, cc, region, names) => names.map((n) => [n, cc, region, cat]);
const TOURISM = [
  ...T('Küste/Insel', 'DE', 'Niedersachsen', ['Borkum', 'Juist', 'Langeoog', 'Spiekeroog', 'Wangerooge', 'Cuxhaven', 'Norden', 'Greetsiel']),
  ...T('Küste/Insel', 'DE', 'Schleswig-Holstein', ['Helgoland', 'Wyk auf Föhr', 'Wittdün', 'Sankt Peter-Ording', 'Husum', 'Büsum', 'Heiligenhafen', 'Timmendorfer Strand', 'Scharbeutz', 'Burg auf Fehmarn', 'Westerland']),
  ...T('Küste/Insel', 'DE', 'Mecklenburg-Vorpommern', ['Binz', 'Sassnitz', 'Heringsdorf', 'Zinnowitz', 'Kühlungsborn', 'Boltenhagen', 'Zingst', 'Ahrenshoop', 'Prerow', 'Göhren', 'Waren']),
  ...T('Berge/Ski', 'DE', 'Bayern', ['Bad Tölz', 'Schliersee', 'Rottach-Egern', 'Bayrischzell', 'Oberammergau', 'Ruhpolding', 'Reit im Winkl', 'Inzell', 'Bad Reichenhall', 'Bayerisch Eisenstein', 'Bodenmais', 'Oberstaufen', 'Bad Hindelang', 'Immenstadt im Allgäu', 'Pfronten', 'Schwangau', 'Krün', 'Kreuth', 'Lenggries', 'Nesselwang']),
  ...T('See', 'DE', 'Bayern', ['Lindau', 'Prien am Chiemsee', 'Starnberg', 'Tutzing', 'Dießen am Ammersee', 'Seeshaupt', 'Herrsching am Ammersee']),
  ...T('See', 'DE', 'Baden-Württemberg', ['Friedrichshafen', 'Meersburg', 'Überlingen', 'Radolfzell am Bodensee', 'Konstanz']),
  ...T('Berge/Ski', 'DE', 'Baden-Württemberg', ['Titisee-Neustadt', 'Todtnau', 'Baiersbronn', 'Freudenstadt', 'Bad Wildbad', 'Triberg im Schwarzwald', 'Schluchsee', 'Hinterzarten', 'Bad Herrenalb']),
  ...T('Berge/Ski', 'DE', 'Nordrhein-Westfalen', ['Winterberg', 'Schmallenberg']),
  ...T('Berge/Ski', 'DE', 'Hessen', ['Willingen']),
  ...T('Berge/Ski', 'DE', 'Niedersachsen', ['Braunlage', 'Goslar', 'Sankt Andreasberg', 'Clausthal-Zellerfeld']),
  ...T('Berge/Ski', 'DE', 'Sachsen', ['Altenberg', 'Oberwiesenthal', 'Bad Schandau']),
  ...T('Berge/Ski', 'DE', 'Sachsen-Anhalt', ['Wernigerode', 'Schierke']),
  ...T('Berge/Ski', 'DE', 'Thüringen', ['Oberhof', 'Neuhaus am Rennweg']),
  ...T('Kultur/Landschaft', 'DE', 'Hessen', ['Rüdesheim am Rhein']),
  ...T('Kultur/Landschaft', 'DE', 'Rheinland-Pfalz', ['Cochem', 'Bacharach', 'Bernkastel-Kues']),
  // Österreich
  ...T('Berge/Ski', 'AT', 'Vorarlberg', ['Lech', 'Schruns', 'Gaschurn', 'Sankt Gallenkirch', 'Damüls', 'Bezau', 'Schoppernau', 'Warth', 'Mellau', 'Klösterle']),
  ...T('Berge/Ski', 'AT', 'Tirol', ['Serfaus', 'Fiss', 'Neustift im Stubaital', 'Tux', 'Gerlos', 'Alpbach', 'Kirchberg in Tirol', 'Westendorf', 'Söll', 'Ellmau', 'Going am Wilden Kaiser', 'Sankt Johann in Tirol', 'Galtür', 'Kappl', 'Nauders', 'Lermoos', 'Ehrwald', 'Reutte', 'Hopfgarten im Brixental', 'Brixen im Thale', 'Niederau', 'Sankt Leonhard im Pitztal', 'Matrei in Osttirol', 'Pettneu am Arlberg', 'Längenfeld', 'Umhausen', 'Fieberbrunn', 'Kühtai', 'Mutters', 'Igls', 'Steinach am Brenner', 'Obsteig']),
  ...T('Berge/Ski', 'AT', 'Salzburg', ['Kaprun', 'Leogang', 'Flachau', 'Obertauern', 'Bad Hofgastein', 'Bad Gastein', 'Krimml', 'Mittersill', 'Neukirchen am Großvenediger', 'Maria Alm am Steinernen Meer', 'Filzmoos', 'Mauterndorf', 'Sankt Michael im Lungau', 'Rauris', 'Zauchensee']),
  ...T('Berge/Ski', 'AT', 'Steiermark', ['Ramsau am Dachstein', 'Mariazell', 'Bad Aussee', 'Altaussee', 'Mürzzuschlag', 'Aflenz Kurort', 'Tauplitz', 'Turracher Höhe']),
  ...T('Berge/Ski', 'AT', 'Kärnten', ['Heiligenblut', 'Bad Kleinkirchheim', 'Kals am Großglockner', 'Mallnitz', 'Flattach', 'Hermagor', 'Bad Bleiberg']),
  ...T('Berge/Ski', 'AT', 'Niederösterreich', ['Semmering', 'Lunz am See', 'Gutenstein', 'Puchberg am Schneeberg', 'Annaberg']),
  ...T('Berge/Ski', 'AT', 'Oberösterreich', ['Hinterstoder', 'Windischgarsten', 'Spital am Pyhrn', 'Gosau', 'Obertraun', 'Bad Goisern']),
  ...T('See', 'AT', 'Salzburg', ['Sankt Gilgen', 'Zell am Moos']),
  ...T('See', 'AT', 'Oberösterreich', ['Mondsee', 'Sankt Wolfgang im Salzkammergut', 'Seewalchen am Attersee', 'Unterach am Attersee', 'Gmunden']),
  ...T('See', 'AT', 'Kärnten', ['Velden am Wörther See', 'Pörtschach am Wörther See', 'Millstatt', 'Klagenfurt']),
  ...T('See', 'AT', 'Burgenland', ['Rust', 'Podersdorf am See', 'Neusiedl am See', 'Illmitz']),
  // Schweiz
  ...T('Berge/Ski', 'CH', 'Bern', ['Lauterbrunnen', 'Mürren', 'Kandersteg', 'Lenk', 'Saanen', 'Meiringen', 'Gstaad']),
  ...T('Berge/Ski', 'CH', 'Wallis', ['Leukerbad', 'Grimentz', 'Champéry', 'Fiesch', 'Bettmeralp', 'Riederalp', 'Grächen', 'Täsch', 'Nendaz', 'Veysonnaz', 'Champex', 'Evolène', 'Zinal', 'Saint-Luc', 'Vals', 'Blatten', 'Ernen', 'Törbel', 'Morgins', 'Les Marécottes', 'Finhaut']),
  ...T('Berge/Ski', 'CH', 'Waadt', ['Les Diablerets', 'Villars-sur-Ollon', 'Leysin', "Château-d'Œx", 'Gryon', 'Les Mosses', 'Rougemont']),
  ...T('Berge/Ski', 'CH', 'Graubünden', ['Klosters', 'Lenzerheide', 'Laax', 'Disentis', 'Savognin', 'Samedan', 'Celerina', 'Sils im Engadin', 'Zuoz', 'Poschiavo', 'Samnaun', 'Zernez', 'Sedrun', 'Bivio', 'Splügen', 'Sankt Antönien', 'Sils Maria', 'Silvaplana', 'Vals', 'Flims', 'Davos Platz', 'Davos Dorf']),
  ...T('Berge/Ski', 'CH', 'Uri', ['Realp', 'Hospental', 'Wassen']),
  ...T('Berge/Ski', 'CH', 'Glarus', ['Elm', 'Braunwald']),
  ...T('Berge/Ski', 'CH', 'St. Gallen', ['Flums', 'Wildhaus', 'Amden', 'Unterwasser']),
  ...T('Berge/Ski', 'CH', 'Schwyz', ['Stoos', 'Einsiedeln']),
  ...T('Berge/Ski', 'CH', 'Luzern', ['Sörenberg', 'Weggis', 'Vitznau']),
  ...T('Berge/Ski', 'CH', 'Obwalden', ['Sarnen', 'Giswil', 'Melchtal']),
  ...T('See', 'CH', 'Tessin', ['Ascona', 'Brissago', 'Morcote', 'Airolo', 'Faido', 'Lugano', 'Mendrisio']),
  ...T('See', 'CH', 'Waadt', ['Vevey', 'Morges', 'Lutry', 'Rolle']),
  ...T('See', 'CH', 'Bern', ['Spiez', 'Brienz']),
  ...T('See', 'CH', 'St. Gallen', ['Rorschach']),
  ...T('See', 'CH', 'Thurgau', ['Romanshorn', 'Kreuzlingen', 'Arbon']),
  ...T('See', 'CH', 'Zürich', ['Meilen', 'Wädenswil', 'Küsnacht']),
  ...T('See', 'CH', 'Schwyz', ['Brunnen', 'Gersau']),
  ...T('See', 'CH', 'Freiburg', ['Murten', 'Gruyères', 'Bulle']),
];

// ---- GeoNames einlesen
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/\bst\.?\s/g, 'sankt ').replace(/[^a-z0-9]+/g, ' ').trim();
const rows = readFileSync(join(GN, 'cities1000.txt'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')).filter((c) => ['DE', 'AT', 'CH'].includes(c[8]))
  .map((c) => ({ id: c[0], name: c[1], ascii: c[2], alt: c[3], lat: +c[4], lon: +c[5], fcode: c[7], cc: c[8], a1: c[10], pop: +c[14], region: regionOf(c[8], c[10]) }))
  .filter((r) => r.fcode !== 'PPLX' && r.region);

// Amtliche Zusätze im GeoNames-Namen („Ostseebad Kühlungsborn“, „Universitäts- und Hansestadt Greifswald“) gehören nicht in den Ortsnamen.
const PREFIX = /^(Ostseebad|Nordseebad|Seebad|Heilbad|Luftkurort|Kurort|Universitäts- und Hansestadt|Hansestadt|Landeshauptstadt|Große Kreisstadt|Kreisstadt|Stadt|Gemeinde|Marktgemeinde|Markt|Stadtgemeinde)\s+/;
const clean = (n) => { let x = n; for (let i = 0; i < 3; i++) x = x.replace(PREFIX, ''); return x; };
for (const r of rows) r.name = clean(r.name);

// Kleine Orte (ohne Einwohnerzahl in cities1000) nur zum Auflösen der Tourismus-Liste: Länder-Dumps, Klasse P.
import { existsSync } from 'node:fs';
const small = [];
for (const cc of ['DE', 'AT', 'CH']) {
  const f = join(GN, cc, `${cc}.txt`);
  if (!existsSync(f)) continue;
  for (const l of readFileSync(f, 'utf8').split('\n')) {
    const c = l.split('\t');
    if (c[6] !== 'P' || c[7] === 'PPLX' || c[7] === 'PPLH') continue;
    const region = regionOf(c[8], c[10]);
    if (region) small.push({ id: c[0], name: clean(c[1]), ascii: c[2], alt: c[3], lat: +c[4], lon: +c[5], fcode: c[7], cc: c[8], a1: c[10], pop: +c[14], region });
  }
}

const existing = PLACES.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, slug: p.slug }));
const taken = [...existing];
const tooClose = (r, km) => taken.some((t) => distKm(r.lat, r.lon, t.lat, t.lon) < km);
const chosen = [];

// 1) Tourismus
const unresolved = [], skippedClose = [];
for (const [name, cc, region, category] of TOURISM) {
  const n = norm(name);
  let cand = rows.filter((r) => r.cc === cc && r.region === region && (norm(r.name) === n || norm(r.ascii) === n));
  if (!cand.length) cand = rows.filter((r) => r.cc === cc && r.region === region && r.alt.split(',').some((a) => norm(a) === n));
  if (!cand.length) cand = small.filter((r) => r.cc === cc && r.region === region && (norm(r.name) === n || norm(r.ascii) === n));
  if (!cand.length) cand = small.filter((r) => r.cc === cc && r.region === region && r.alt.split(',').some((a) => norm(a) === n));
  if (!cand.length) { unresolved.push(`${name} (${cc}, ${region})`); continue; }
  const r = cand.sort((a, b) => b.pop - a.pop)[0];
  if (chosen.some((c) => c.id === r.id) || tooClose(r, RULES.tourismKm)) { skippedClose.push(`${name} (${cc})`); continue; }
  chosen.push({ ...r, type: `Tourismus: ${category}` }); taken.push(r);
}
const nTourism = chosen.length;

// 2) Einwohner
const rejectedBig = [];
for (const cc of ['DE', 'AT', 'CH']) {
  const { minPop, minKm } = RULES[cc];
  for (const r of rows.filter((x) => x.cc === cc && x.pop >= minPop).sort((a, b) => b.pop - a.pop)) {
    if (chosen.some((c) => c.id === r.id)) continue;
    if (tooClose(r, minKm)) { if (r.pop >= 100000 && !existing.some((e) => distKm(r.lat, r.lon, e.lat, e.lon) < 3)) rejectedBig.push(`${r.name} ${Math.round(r.pop / 1000)}k`); continue; }
    chosen.push({ ...r, type: 'Stadt/Gemeinde' }); taken.push(r);
  }
}

// ---- Slugs und Kollisionen
const used = new Map(existing.map((p) => [p.slug, 'bestehend']));
const out = [];
for (const r of chosen) {
  let slug = toSlug(r.name), note = '';
  if (used.has(slug)) { const alt = `${slug}-${toSlug(r.region)}`; note = `Kollision mit ${used.get(slug)} → ${alt}`; slug = alt; }
  if (used.has(slug)) { note += ' (weiter kollidiert!)'; }
  used.set(slug, r.name);
  const rel = relationsFor(r, cat);
  const alpine = false; // Höhe folgt erst aus der Höhenabfrage (siehe unten)
  void alpine;
  out.push({ ...r, slug, note, rel, hasAccent: /[^\x00-\x7f]/.test(r.name) });
}

// ---- Höhen aus den Terrarium-Kacheln (vorhandenes Werkzeug, Zoom 12 wie bei den bestehenden Orten)
import { execFileSync } from 'node:child_process';
const tmp = join(GN, 'ele-input.json');
writeFileSync(tmp, JSON.stringify(out.map((o) => ({ slug: o.slug, name: o.name, lat: o.lat, lon: o.lon }))), 'utf8');
execFileSync(process.execPath, [join(HERE, 'fetch-place-elevation.mjs'), tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
const eleBy = Object.fromEntries(JSON.parse(readFileSync(tmp, 'utf8')).map((p) => [p.slug, p.ele]));

// ---- CSV
const csvEsc = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const nearestOf = (o) => {
  let best = null;
  for (const t of [...existing, ...out]) {
    if (t === o || (t.slug && t.slug === o.slug)) continue;
    const d = distKm(o.lat, o.lon, t.lat, t.lon);
    if (!best || d < best.d) best = { d, name: t.name };
  }
  return `${best.name} (${best.d.toFixed(1).replace('.', ',')} km)`;
};
const header = ['Name', 'Land', 'Region', 'Einwohner', 'Typ', 'Breite', 'Länge', 'Höhe_m', 'Slug', 'Slug-Hinweis', 'Nächster Ort', 'Seewetter', 'Pegel', 'Autobahn', 'Gletscher', 'Lawinenlink', 'GeoNames-ID'];
const lines = out.map((o) => {
  const ele = eleBy[o.slug];
  const alpine = ele >= 800 && (o.cc !== 'DE' || o.region === 'Bayern');
  return [
    o.name, o.cc, o.region, o.pop || '', o.type, o.lat.toFixed(4), o.lon.toFixed(4), ele, o.slug, o.note, nearestOf(o),
    o.rel.sea ? `ja (${o.rel.sea.spot.name}, ${o.rel.sea.spot.km} km)` : '',
    o.rel.sea?.gauge ? `ja (${o.rel.sea.gauge.name}, ${o.rel.sea.gauge.km} km)` : '',
    o.rel.road ? `ja (${o.rel.road.corridor.road}, ${o.rel.road.corridor.km} km; Anlage ${o.rel.road.station.km} km)` : '',
    o.rel.glaciers ? `ja (${o.rel.glaciers.length}, nächster ${o.rel.glaciers[0].name} ${o.rel.glaciers[0].km} km)` : '',
    alpine ? 'ja' : '', o.id,
  ].map(csvEsc).join(';');
});
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, '﻿' + header.join(';') + '\n' + lines.join('\n') + '\n', 'utf8');

// ---- Auswertung
const by = (f) => out.reduce((m, o) => { const k = f(o); m[k] = (m[k] || 0) + 1; return m; }, {});
const accents = out.filter((o) => o.hasAccent).map((o) => `${o.name} → ${o.slug}`);
const collisions = out.filter((o) => o.note);
const slugBad = out.filter((o) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.slug)).map((o) => o.slug);
const dup = out.map((o) => o.slug).filter((s, i, a) => a.indexOf(s) !== i);
console.log(`[select] ${out.length} neue Orte → ${OUT}`);
console.log('  nach Land', JSON.stringify(by((o) => o.cc)), '| Typ', JSON.stringify(by((o) => o.type.split(':')[0])), '| Tourismus-Kategorien', JSON.stringify(by((o) => (o.type.startsWith('Tourismus') ? o.type : 'n/a'))));
console.log(`  Tourismus-Liste: ${TOURISM.length} Namen, ${nTourism} übernommen, ${unresolved.length} nicht in GeoNames auflösbar, ${skippedClose.length} zu nah an bestehenden/gewählten Orten`);
console.log('  nicht aufgelöst:', unresolved.join('; '));
console.log(`  Städte ab 100 000 Einwohnern, die der Mindestabstand ausschließt (${rejectedBig.length}):`, rejectedBig.join('; '));
console.log('  Bestehende Orte, deren Region kein Bundesland/Kanton ist:', PLACES.filter((p) => !Object.values({ DE: REGION_DE, AT: REGION_AT, CH: REGION_CH }[p.country]).includes(p.region)).length, 'von', PLACES.length);
console.log('  zu nah/doppelt:', skippedClose.join('; '));
console.log(`  Slugs: ${out.length - dup.length} eindeutig, Duplikate ${dup.length}, ungültige Form ${slugBad.length}, Kollisionen aufgelöst ${collisions.length}`);
console.log('  Kollisionen:', collisions.map((o) => `${o.name} (${o.region}): ${o.note}`).join('; '));
console.log(`  Akzente/Sonderzeichen (${accents.length}):`, accents.join('; '));
console.log('  Seewetter', out.filter((o) => o.rel.sea).length, '| Pegel', out.filter((o) => o.rel.sea?.gauge).length, '| Autobahn', out.filter((o) => o.rel.road).length, '| Gletscher', out.filter((o) => o.rel.glaciers).length, '| Lawinenlink', lines.filter((l) => l.split(';').slice(-2, -1)[0] === 'ja').length);
