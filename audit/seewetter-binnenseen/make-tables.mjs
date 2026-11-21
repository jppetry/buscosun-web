#!/usr/bin/env node
/**
 * Phase BS — writes `audit/seewetter-binnenseen/tabellen.md` from the measurement files (no number is typed by hand):
 *   spike/lake-probe.json (step 0), the built catalogue (--cat=<dir with spots-lakes.json>), fusion-lake-stations.json.
 *
 *   node audit/seewetter-binnenseen/make-tables.mjs --cat=<dir>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const probe = JSON.parse(readFileSync(join(HERE, 'spike/lake-probe.json'), 'utf8'));
const cat = JSON.parse(readFileSync(join(resolve(String(args.cat)), 'spots-lakes.json'), 'utf8'));
const fus = JSON.parse(readFileSync(join(HERE, 'fusion-lake-stations.json'), 'utf8'));
const de = (x, d = 1) => (x == null ? '–' : Number(x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
const lakeName = Object.fromEntries(cat.lakes.map((l) => [l.id, l.name]));
const L = [];
L.push('# Phase BS — Messtabellen (erzeugt)', '', `> Erzeugt von \`audit/seewetter-binnenseen/make-tables.mjs\` aus \`spike/lake-probe.json\` (gemessen ${probe.at}), dem gebauten Katalog (${cat.built}) und \`fusion-lake-stations.json\`. Keine Zahl ist von Hand getippt.`, '');

L.push('## 1. Seen', '', '| See | Länder | Umriss | Fläche Umriss / Quelle km² | Seespiegel m | mittlere Tiefe m | DWD-Warnzellen | WSV-Pegel (Reihen) | BAFU-Pegel | Alplakes-Becken |', '|---|---|---|---|---|---|---|---|---|---|');
for (const l of cat.lakes) L.push(`| ${l.name} | ${l.lands.join(', ')} | ${l.outline.source} | ${de(l.outline.areaKm2)} / ${de(l.areaKm2)} | ${de(l.elevM)} | ${de(l.depthM, 2).replace(/,?0+$/, '')} | ${l.warncells.map((c) => `${c.name} (${c.id})`).join(', ') || '–'} | ${l.water.wsv ? `${l.water.wsv.name} (${l.water.wsv.series.join(', ')}), ${de(l.water.wsv.kmToLake, 2)} km vom See` : '–'} | ${l.water.bafu.map((b) => b.name).join('; ') || '–'} | ${l.water.alp.join(', ') || '–'} |`);

L.push('', '## 2. Spots — Lage, Cube, Station', '', '`Ufer` = Abstand der Handlage zur Uferlinie des Umrisses. `Ort` = Abstand des Uferpunkts zur Koordinate des Wikipedia-Artikels des Orts. `Cube` = Zelle des t1-Gitters, Höhe, die der Geländeleser am Wasserpunkt findet, minus Seespiegel. `Richtung` = Stunden mit Windrichtung von 80 Stunden mit Wind.', '', '| Spot | See | Ufer m | zeigt ° | Ort km | Cube-Zelle iy/ix | Leserhöhe − Seespiegel m | Richtung h | Windstation (Netz) | km | Δh m | DWD-Zelle |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const s of cat.spots) {
  const p = probe.spots[s.id] ?? {}, c = p.cube ?? {}, w = s.lake.stations.wind;
  L.push(`| ${s.name} (\`${s.id}\`) | ${lakeName[s.lake.id]} | ${p.snapM ?? '–'} | ${s.normal} | ${p.town?.found ? de(p.town.km) : '–'} | ${c.cell ? `${c.cell.iy}/${c.cell.ix}` : '–'} | ${c.dH ?? '–'} | ${c.dir ?? '–'} | ${w ? `${w.name} (${w.net})` : `keine${p.obsOffLevel ? ` — nächste ${p.obsOffLevel.name}, ${de(p.obsOffLevel.km)} km, ${p.obsOffLevel.dElevM} m über/unter dem See` : ''}`} | ${w ? de(w.km) : '–'} | ${w ? w.dElevM : '–'} | ${s.lake.warncell?.name ?? '–'} |`);
}

L.push('', '## 3. Nächste liefernde Station je Netz', '', `Regel der Messung: Station liefert Wind UND Böe, jünger als ${probe.rules.OBS_FRESH_MIN} min; „am See“ heißt höchstens ${probe.rules.OBS_MAX_KM} km entfernt und höchstens ${probe.rules.OBS_MAX_DELEV_M} m über oder unter dem Seespiegel. Stand obs/v1: ${probe.sources.obs.builtAt}, ${probe.sources.obs.delivering} von ${probe.sources.obs.withWind} Windstationen liefern.`, '', '| Spot | DWD km (Δh m) | TAWES km (Δh m) | SwissMetNet km (Δh m) |', '|---|---|---|---|');
for (const s of cat.spots) { const o = probe.spots[s.id]?.obs ?? {}; const f = (x) => (x && x.km <= 150 ? `${x.name} ${de(x.km)} (${x.dElevM})` : '–'); L.push(`| ${s.name} | ${f(o.de)} | ${f(o.at)} | ${f(o.ch)} |`); }

L.push('', '## 4. buscosun Fusion gegen Seestationen', '', `Regel vor dem Lauf festgelegt (Kopf von \`fusion-lake-stations.mjs\`): Konserve \`${fus.rule.model}\`, ${fus.issues} Ausgaben ${fus.first} … ${fus.last}, Rastervorläufe 1–${fus.rule.maxLeadH} h, Wahrheit W1; Stationen des Prüfnetzes höchstens ${fus.rule.lakeKm} km von einem Seespot und höchstens ${fus.rule.dElevM} m über/unter dem Seespiegel (${fus.candidates} Kandidaten), die zehn nächsten.`, '', '| Station | Land | See | km zum Spot | Δh m |', '|---|---|---|---|---|');
for (const s of fus.stations) L.push(`| ${s.name} | ${s.land} | ${s.lakeName} | ${de(s.km)} | ${s.dElevM} |`);
L.push('', '| See | Größe | Vorlauf | Fälle | Messung kn | Bias kn | MAE kn | in q10–q90 | Breite kn |', '|---|---|---|---|---|---|---|---|---|');
for (const r of fus.rows.filter((x) => x.kind !== 'st')) L.push(`| ${r.kind === 'all' ? '**alle zehn**' : lakeName[r.id]} | ${r.var === 'ws' ? 'Wind' : 'Böe'} | ${r.lead} | ${r.n.toLocaleString('de-DE')} | ${de(r.meanObsKn)} | ${r.biasKn > 0 ? '+' : ''}${de(r.biasKn)} | ${de(r.maeKn)} | ${de(r.cov80)} % | ${de(r.widthKn)} |`);
L.push('', 'Nicht genommen (Rang 11 ff.): ' + fus.notTaken.map((s) => `${s.name} (${s.lakeName}, ${de(s.km)} km)`).join(', ') + '.');

L.push('', '## 5. Quellen', '', '```json', JSON.stringify(probe.sources, null, 1), '```');
writeFileSync(join(HERE, 'tabellen.md'), L.join('\n') + '\n');
console.log(`tabellen.md: ${L.length} Zeilen`);
