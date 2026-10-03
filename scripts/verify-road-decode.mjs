/**
 * verify:road-decode — Phase AW (audit/autobahnwetter.md): the handwritten SWIS-BUFR decoder (`src/road/swisBufr.ts`)
 * against eccodes on ONE frozen slot of all DWD series (03.10.2026 08:00 UTC, 24 bulletins, all three layouts).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-decode.mjs
 *
 * Reference: `scripts/lib/fixtures/road/swis-2610030800.eccodes.json.gz` — eccodes 2.47 (Python), per subset the
 * expanded (descriptor, value) sequence. Comparison: same descriptor in the same position, numbers equal as scaled
 * integers (descriptor scale + 4 decimals), strings equal ASCII-masked (eccodes' Python strings lose the Latin-1
 * bytes). Plus negative controls, so a green run cannot be vacuous, and the format guards (unknown layout,
 * compression, truncation must THROW — a DWD format change has to block the slot, not slip through).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeBufrFile, decodeSwisFile, swisLayoutOf, swisRecord, SWIS_TABLE_B, BufrFormatError,
} from '../src/road/swisBufr.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'lib', 'fixtures', 'road');
const SLOT = join(FIX, 'swis-2610030800');
const ref = JSON.parse(gunzipSync(readFileSync(join(FIX, 'swis-2610030800.eccodes.json.gz'))).toString('utf8'));

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

const scaled = (code, v) => {
  if (typeof v === 'number') return Math.round(v * 10 ** ((SWIS_TABLE_B[code]?.scale ?? 0) + 4));
  if (typeof v === 'string') return v.replace(/[^\x20-\x7e]/g, '?');
  return v;
};

function compare(file, msgs) {
  const rm = ref.files[file];
  let values = 0, bad = 0;
  const first = [];
  if (!rm || rm.length !== msgs.length) return { values, bad: 1, first: [`${file}: Nachrichten ${msgs.length} ≠ ${rm?.length}`] };
  msgs.forEach((m, i) => {
    if (m.subsets.length !== rm[i].subsets.length) { bad++; first.push(`${file}: Subsets ${m.subsets.length} ≠ ${rm[i].subsets.length}`); return; }
    m.subsets.forEach((seq, j) => {
      const rs = rm[i].subsets[j].seq;
      if (seq.length !== rs.length) { bad++; first.push(`${file}#${j}: Länge ${seq.length} ≠ ${rs.length}`); return; }
      seq.forEach(([d, v], k) => {
        values++;
        const [rd, rv] = rs[k];
        if (rd !== d || scaled(d, v) !== scaled(rd, rv)) { bad++; if (first.length < 5) first.push(`${file}#${j}.${k}: ${d}=${v} ≠ ${rd}=${rv}`); }
      });
    });
  });
  return { values, bad, first };
}

// --- A: every bulletin of the slot equals eccodes ----------------------------------------------
const files = readdirSync(SLOT).filter((f) => f.endsWith('.bin')).sort();
add('A0 Fixture: 24 Bulletins (23 aktive Reihen + SD-BW)', files.length === 24, String(files.length));
let total = 0, totalBad = 0;
const layouts = {};
const decoded = {};
for (const f of files) {
  let msgs;
  try { msgs = decodeBufrFile(new Uint8Array(readFileSync(join(SLOT, f)))); } catch (e) { add(`A1 ${f} dekodiert`, false, e.message); continue; }
  decoded[f] = msgs;
  for (const m of msgs) { const l = swisLayoutOf(m); layouts[l] = (layouts[l] ?? 0) + 1; }
  const r = compare(f, msgs);
  total += r.values; totalBad += r.bad;
  if (r.bad) add(`A1 ${f} = eccodes`, false, r.first.join(' · '));
}
add('A1 alle Bulletins dekodiert und gleich eccodes (Abweichung 0)', totalBad === 0 && Object.keys(decoded).length === files.length, `${total} Werte, ${totalBad} Abweichungen`);
add('A2 alle drei Layouts im Fixture (swis-local 16, swis-local-film01 3, wmo-307102 4 + SD-BW)',
  layouts['swis-local'] === 16 && layouts['swis-local-film01'] === 3 && layouts['wmo-307102'] === 5, JSON.stringify(layouts));
add('A3 Edition 3 (FN-BY) und Edition 4 im Fixture', Object.values(decoded).some((ms) => ms[0].edition === 3) && Object.values(decoded).some((ms) => ms[0].edition === 4));

// --- B: record mapping (units) on known values --------------------------------------------------
const by = decodeSwisFile(new Uint8Array(readFileSync(join(SLOT, 'FN-BY.bin'))));
const rBy = by.records.find((r) => r.id === 'V164');
add('B1 FN-BY: führende Blanks entfernt (" V164" → "V164", rechtsbündiger Name)', rBy && rBy.name === 'Eschenlohe', rBy ? `${rBy.id} ${rBy.name}` : 'fehlt');
const dd = decodeSwisFile(new Uint8Array(readFileSync(join(SLOT, 'DD-DD.bin'))));
add('B2 Latin-1-Umlaute dekodiert (DD: „Brabschütz")', dd.records.some((r) => r.name === 'Brabschütz'), dd.records.map((r) => r.name).filter((n) => /[^\x20-\x7e]/.test(n ?? '')).slice(0, 3).join(', '));
const refDd = ref.files['DD-DD.bin'][0].subsets;
const kAir = refDd.map((s) => s.seq.find(([c]) => c === 12101)?.[1]).find((v) => v != null);
const cAir = dd.records.map((r) => r.airT).find((v) => v != null);
add('B3 Temperatur K → °C exakt (eccodes K − 273,15 auf 0,01)', kAir != null && cAir != null && Math.abs(Number((kAir - 273.15).toFixed(2)) - cAir) < 1e-9, `${kAir} K → ${cAir} °C`);
const kk = decodeSwisFile(new Uint8Array(readFileSync(join(SLOT, 'KK-SH.bin'))));
const films = kk.records.flatMap((r) => r.sensors.map((s) => s.filmMm)).filter((v) => v != null);
add('B4 Layout film01: Wasserfilm mit 2 01 131 / 2 02 129 (0,1-mm-Raster, Werte ≤ 102,3 mm)', films.length > 0 && films.every((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 && v <= 102.3), `${films.length} Werte, max ${Math.max(...films)}`);
add('B5 Beobachtungszeit = Slot (08:00 UTC) in allen aktiven Reihen',
  files.filter((f) => !f.startsWith('SD')).every((f) => decodeSwisFile(new Uint8Array(readFileSync(join(SLOT, f)))).records.every((r) => !Number.isFinite(r.obsMs) || r.obsMs === Date.UTC(2026, 9, 3, 8, 0))));
add('B6 je Subset ein Datensatz', Object.entries(decoded).every(([f, ms]) => decodeSwisFile(new Uint8Array(readFileSync(join(SLOT, f)))).records.length === ms.reduce((a, m) => a + m.nSubsets, 0)));

// --- C: negative controls and format guards -----------------------------------------------------
{
  const buf = new Uint8Array(readFileSync(join(SLOT, 'DD-DD.bin')));
  const bad = buf.slice();
  // Flip one bit deep in section 4 (data): the comparison must notice.
  bad[buf.length - 40] ^= 0x10;
  let r;
  try { r = compare('DD-DD.bin', decodeBufrFile(bad)); } catch { r = { bad: 1 }; }
  add('C1 Negativkontrolle: ein gekipptes Datenbit fällt im Vergleich auf', r.bad > 0, `${r.bad} Abweichung(en)`);
  const mutated = JSON.parse(JSON.stringify(decodeBufrFile(buf)[0]));
  mutated.descriptors = mutated.descriptors.slice(0, -1);
  let threw = false;
  try { swisLayoutOf(mutated); } catch (e) { threw = e instanceof BufrFormatError; }
  add('C2 unbekannte Deskriptorliste ⇒ BufrFormatError (Slot gesperrt statt Müll)', threw);
  const comp = buf.slice();
  // Section 3 flags byte: edition 4, section 1 length at 8..10.
  const l1 = (comp[8] << 16) | (comp[9] << 8) | comp[10];
  comp[8 + l1 + 6] |= 0x40;
  threw = false;
  try { decodeBufrFile(comp); } catch (e) { threw = e instanceof BufrFormatError; }
  add('C3 komprimierte Daten ⇒ BufrFormatError', threw);
  threw = false;
  try { decodeBufrFile(buf.slice(0, buf.length - 200)); } catch (e) { threw = e instanceof BufrFormatError; }
  add('C4 abgeschnittene Datei ⇒ BufrFormatError', threw);
  const rec = swisRecord('swis-local', [[4001, 2026], [4002, 13], [4003, 1], [4004, 0], [4005, 0]]);
  add('C5 unmögliches Datum ⇒ obsMs NaN (Stationsregel „time" verwirft)', Number.isNaN(rec.obsMs));
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:road-decode — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
