/**
 * TA1 — Anlagenverzeichnis für den Geodaten-Join (netzfrei, liest lokale Downloads).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fire/ta/facilities.mjs
 *        [--eprtr .cache/facilities/eprtr] [--mastr <anlagenatlas>/pipeline] [--bfe .cache/facilities/bfe-epa_2056.csv.zip]
 *        [--out .cache/facilities/facilities.jsonl]
 *
 * Quellen (alle ohne Login, kommerziell erlaubt, Attribution Pflicht):
 *   • EEA Industrial Reporting v16 (E-PRTR/IED), CC-BY 4.0 — „User friendly .csv files.zip" aus
 *     `sdi.eea.europa.eu/webdav/datastore/public/eea_t_ied-eprtr_p_2007-2024_v16_r00` (Datashare);
 *     genutzt: F1_4 (Luftfreisetzungen je Anlage: Name, Stadt, Koordinaten, E-PRTR-Aktivität),
 *     F6_1 (IED-Installationen: IED-Aktivität, Status, Inbetriebnahme), F7_1 (Abfallverbrennung),
 *     F5_2 (Großfeuerungsanlagen: Leistung). **Kein Betreiberfeld in den CSV** — der Anlagenname
 *     trägt meist die Firma („OMV Downstream GmbH", „RWE Power AG-Fabrik Fortuna Nord").
 *   • MaStR (Bundesnetzagentur), DL-DE/BY-2.0 — Anlagenatlas-SQLite (open-mastr, Export 2026-07-07):
 *     `combustion_extended` ≥ 1 MW, `biomass_extended` ≥ 500 kW, nur „In Betrieb"/„Vorübergehend
 *     stillgelegt". `market_actors` ist im Export leer ⇒ Betreiber nur, wenn er im Kraftwerksnamen steht.
 *   • BFE Elektrizitätsproduktionsanlagen (CH), opendata.swiss OPEN BY — LV95 → WGS84 über
 *     `src/fire/sources/swissProjection.ts` (dieselbe Formel wie der Client).
 *
 * Ausgabe: eine Zeile je Anlage `{source, id, name, operator, kind, detail, lat, lon, status, weight}`
 * innerhalb der DACH-Box 5,5–17,5 / 45,5–55,5. `weight` (1 · 0,7 · 0,3) ordnet beim Join
 * thermische Prozesse vor Nicht-Wärmequellen (Kläranlagen, Tierhaltung werden gar nicht geführt).
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { lv95ToWgs84 } from '../../../src/fire/sources/swissProjection.ts';

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const EPRTR_DIR = argVal('--eprtr', '.cache/facilities/eprtr');
const MASTR_DIR = argVal('--mastr', 'C:/Users/User/Desktop/anlagenatlas/pipeline');
const BFE_ZIP = argVal('--bfe', '.cache/facilities/bfe-epa_2056.csv.zip');
const OUT = argVal('--out', '.cache/facilities/facilities.jsonl');
const BOX = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 };
const inBox = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lon >= BOX.west && lon < BOX.east && lat > BOX.south && lat <= BOX.north;

// ---------------------------------------------------------------------------
// CSV (RFC 4180, zeilenweise, Anführungszeichen mit eingebetteten Kommas/Umbrüchen)
// ---------------------------------------------------------------------------
function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return { fields: out, open: q };
}
async function* csvRows(path) {
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  let header = null; let pending = '';
  for await (const raw of rl) {
    const line = pending ? pending + '\n' + raw : raw;
    const { fields, open } = parseCsvLine(line);
    if (open) { pending = line; continue; }
    pending = '';
    if (!header) { header = fields.map((h) => h.replace(/^\uFEFF/, '').trim()); continue; }
    const row = {}; header.forEach((h, i) => { row[h] = fields[i] ?? ''; });
    yield row;
  }
}

// ---------------------------------------------------------------------------
// E-PRTR-Aktivität → Anlagentyp
// ---------------------------------------------------------------------------
/** E-PRTR Annex I (Regulation 166/2006) Hauptaktivität. */
function kindFromEprtr(code) {
  const c = String(code ?? '').trim();
  const m = c.match(/^(\d)\(([a-z])\)/); if (!m) return null;
  const [, sec, sub] = m;
  if (sec === '1') return sub === 'c' ? 'refinery' : (sub === 'b' || sub === 'd') ? 'steel' : 'power';
  if (sec === '2') return sub === 'a' || sub === 'e' ? 'metals' : sub === 'f' ? 'other' : 'steel';
  if (sec === '3') return sub === 'a' || sub === 'b' ? 'mining' : sub === 'c' ? 'cement' : (sub === 'e' || sub === 'f') ? 'glass' : 'other';
  if (sec === '4') return 'chemical';
  if (sec === '5') return (sub === 'a' || sub === 'b') ? 'waste' : (sub === 'c' || sub === 'd' || sub === 'e') ? 'other' : null; // 5(f)/(g) Abwasser: keine Wärmequelle
  if (sec === '6') return 'pulp';
  if (sec === '7') return null; // Tierhaltung/Aquakultur
  if (sec === '8') return 'other';
  if (sec === '9') return 'other';
  return null;
}
/** IED Annex I (2010/75/EU) Hauptaktivität, feiner (z. B. 3.1(a) Zement, 3.3 Glas, 5.2 Abfallverbrennung). */
function kindFromIed(code) {
  const c = String(code ?? '').trim();
  const m = c.match(/^(\d)\.(\d+)/); if (!m) return null;
  const [, sec, sub] = m;
  if (sec === '1') return sub === '2' ? 'refinery' : (sub === '3' || sub === '4') ? 'steel' : 'power';
  if (sec === '2') return (sub === '1' || sub === '5') ? 'metals' : sub === '6' ? null : 'steel'; // 2.6 Oberflächenbehandlung: keine Wärmequelle
  if (sec === '3') return sub === '1' ? 'cement' : (sub === '3' || sub === '4') ? 'glass' : sub === '5' ? 'ceramics' : 'other';
  if (sec === '4') return 'chemical';
  if (sec === '5') return (sub === '1' || sub === '2') ? 'waste' : 'other'; // 5.3–5.6 Behandlung/Deponie: Brände möglich, keine Dauerwärme
  if (sec === '6') return (sub === '1' || sub === '2') ? 'pulp' : (sub === '3' || sub === '8') ? 'other' : null; // 6.4–6.7/6.9–6.11 Lebensmittel, Tierhaltung, Lösemittel, Abwasser: keine Wärmequelle
  return null;
}
const WEIGHT = { steel: 1, refinery: 1, cement: 1, glass: 1, waste: 1, power: 1, chemical: 1, pulp: 1, metals: 1, biomass: 1, ceramics: 0.9, mining: 0.7, other: 0.3 };

// ---------------------------------------------------------------------------
// 1. E-PRTR
// ---------------------------------------------------------------------------
async function loadEprtr() {
  const fac = new Map(); // FacilityInspireId → Anlage
  const stat = { f14: 0, f61: 0, f71: 0, f52: 0, facilities: 0 };
  for await (const r of csvRows(join(EPRTR_DIR, 'F1_4_Air_Releases_Facilities.csv'))) {
    stat.f14++;
    const lat = Number(r.Latitude), lon = Number(r.Longitude); if (!inBox(lat, lon)) continue;
    const id = r.FacilityInspireId; if (!id) continue;
    const year = Number(r.reportingYear);
    const cur = fac.get(id);
    if (cur && cur.year >= year) continue;
    fac.set(id, { source: 'eprtr', id, name: r.facilityName, city: r.city, country: r.countryName, lat, lon, year, eprtr: r.EPRTRAnnexIMainActivity, kind: kindFromEprtr(r.EPRTRAnnexIMainActivity), ied: null, iedName: null, status: null, capacityMw: null });
  }
  for await (const r of csvRows(join(EPRTR_DIR, 'F6_1_IED_Installations.csv'))) {
    stat.f61++;
    const lat = Number(r.Latitude), lon = Number(r.Longitude); if (!inBox(lat, lon)) continue;
    const pid = r.parent_facilityInspireId || r.InstallationInspireId;
    const year = Number(r.reportingYear);
    let cur = fac.get(pid);
    if (!cur) { cur = { source: 'eprtr', id: pid, name: r.installationName, city: r.City_of_Facility, country: r.CountryName, lat, lon, year: 0, eprtr: r.EPRTRAnnexIMainActivity, kind: kindFromEprtr(r.EPRTRAnnexIMainActivity), ied: null, iedName: null, status: null, capacityMw: null }; fac.set(pid, cur); }
    (cur.installations ??= new Set()).add(r.InstallationInspireId);
    // Die Anlagenart eines Werks ist die „schwerste" seiner Installationen (Stahlwerk vor Kraftwerk vor
    // Kläranlage) — nicht die zuletzt gemeldete; sonst wird voestalpine zum „Kraftwerk".
    const k = kindFromIed(r.IEDAnnexIMainActivity);
    if (k) { (cur.kinds ??= new Map()).set(k, (cur.kinds.get(k) ?? 0) + 1); cur.kindDetail ??= new Map(); if (!cur.kindDetail.has(k)) cur.kindDetail.set(k, { ied: r.IEDAnnexIMainActivity, name: r.IEDMainActivityName }); }
    if (year >= (cur.iedYear ?? 0)) {
      cur.iedYear = year; cur.status = r.installationStatus || cur.status;
      if (!cur.name) cur.name = r.installationName;
    }
  }
  const PRIORITY = ['steel', 'refinery', 'cement', 'glass', 'metals', 'waste', 'chemical', 'pulp', 'power', 'ceramics', 'mining', 'biomass', 'other'];
  for (const f of fac.values()) {
    if (!f.kinds) continue;
    const best = PRIORITY.find((k) => f.kinds.has(k));
    if (best && (best !== 'other' || !f.kind)) { f.kind = best; f.ied = f.kindDetail.get(best).ied; f.iedName = f.kindDetail.get(best).name; }
  }
  for await (const r of csvRows(join(EPRTR_DIR, 'F7_1_IED_WI_coWI.csv'))) {
    stat.f71++;
    const lat = Number(r.Latitude), lon = Number(r.Longitude); if (!inBox(lat, lon)) continue;
    const pid = r.Parent_FacilityInspireId; const cur = pid && fac.get(pid);
    // Mitverbrennung macht ein Stahl-/Zement-/Kraftwerk nicht zur Abfallanlage — nur Unbestimmtes wird „waste".
    if (cur) { if (!cur.kind || cur.kind === 'other') cur.kind = 'waste'; cur.wi = true; }
    else fac.set(r.InstallationPartInspireId, { source: 'eprtr', id: r.InstallationPartInspireId, name: r.installationPartName, city: r.City_Of_Facility, country: r.countryName, lat, lon, year: Number(r.reportingYear), eprtr: r.EPRTRAnnexIMainActivity, kind: 'waste', ied: r.IEDAnnexIMainActivity, iedName: 'Abfall(mit)verbrennung', status: null, capacityMw: null, wi: true });
  }
  for await (const r of csvRows(join(EPRTR_DIR, 'F5_2_LCP_Energy_Emissions.csv'))) {
    stat.f52++;
    if (r.featureType !== 'LCPCharacteristics' || r.unit !== 'MW') continue;
    const lat = Number(r.Latitude), lon = Number(r.Longitude); if (!inBox(lat, lon)) continue;
    // LCP ist eine Installationsteil-Kennung; Zuordnung über Koordinaten-Nähe (≤ 300 m) zur Anlage.
    let best = null, bd = Infinity;
    for (const f of fac.values()) { const d = Math.hypot((f.lat - lat) * 111_320, (f.lon - lon) * 111_320 * Math.cos(lat * Math.PI / 180)); if (d < bd) { bd = d; best = f; } }
    const mw = Number(r.featureValue);
    if (best && bd <= 300) best.capacityMw = Math.max(best.capacityMw ?? 0, mw);
    else fac.set(r.LCPInspireId, { source: 'eprtr', id: r.LCPInspireId, name: r.installationPartName, city: r.City_Of_Facility, country: r.countryName, lat, lon, year: Number(r.reportingYear), eprtr: '1(a)', kind: 'power', ied: '1.1', iedName: 'Großfeuerungsanlage', status: null, capacityMw: mw });
  }
  const out = [];
  for (const f of fac.values()) {
    if (!f.kind) continue;
    if (f.status && /decommissioned|disused|notRegulated/i.test(f.status)) continue;
    const detail = [f.iedName ? `IED ${f.ied} ${f.iedName}` : `E-PRTR ${f.eprtr}`, f.capacityMw ? `${Math.round(f.capacityMw)} MW` : null, f.wi ? 'Abfall(mit)verbrennung' : null, f.status ? `Status ${f.status}` : null, `gemeldet ${f.iedYear ?? f.year}`].filter(Boolean).join(' · ');
    // Größe = Zahl der IED-Installationen + Leistung/100 MW — beim Join gewinnt das Hauptwerk vor der Nebeneinheit.
    const size = (f.installations?.size ?? 0) + (f.capacityMw ? f.capacityMw / 100 : 0);
    out.push({ source: 'eprtr', id: f.id, name: (f.name || '').trim() || null, operator: null, kind: f.kind, detail, city: f.city || null, country: f.country || null, lat: +f.lat.toFixed(5), lon: +f.lon.toFixed(5), status: f.status, weight: WEIGHT[f.kind], size: +size.toFixed(2) });
  }
  stat.facilities = out.length;
  return { rows: out, stat };
}

// ---------------------------------------------------------------------------
// 2. MaStR (Anlagenatlas-SQLite)
// ---------------------------------------------------------------------------
const MASTR_ENERGY = { 2407: 'Steinkohle', 2408: 'Braunkohle', 2409: 'Mineralölprodukte', 2410: 'Erdgas', 2411: 'andere Gase', 2412: 'nicht biogener Abfall', 2413: 'Wärme', 2414: 'Feste biogene Stoffe und Abfälle' };
const MASTR_FUEL = { 2457: 'Steinkohlen', 2463: 'Rohbraunkohlen', 2464: 'Staub- und Trockenkohle', 2466: 'Dieselkraftstoff', 2467: 'Heizöl, leicht', 2468: 'Heizöl, schwer', 2472: 'Andere Mineralölprodukte', 2473: 'Erdgas', 2475: 'Hochofengas, Konvertergas', 2477: 'Andere Gase', 2478: 'Sonstige hergestellte Gase', 2479: 'Industrieabfall', 2480: 'Abfall (Hausmüll, Siedlungsabfall)', 2481: 'Dampf (Prozesswärme)' };
const MASTR_STATUS = { 31: 'In Planung', 35: 'In Betrieb', 37: 'Vorübergehend stillgelegt', 38: 'Endgültig stillgelegt' };
function loadMastr() {
  const out = []; const stat = { combustion: 0, biomass: 0 };
  const combPath = join(MASTR_DIR, 'raw_combustion/data/sqlite/open-mastr.db');
  const bioPath = join(MASTR_DIR, 'raw/data/sqlite/open-mastr.db');
  if (existsSync(combPath)) {
    const db = new DatabaseSync(combPath, { readOnly: true });
    const q = db.prepare(`select EinheitMastrNummer id, NameKraftwerk, NameStromerzeugungseinheit, Energietraeger, Hauptbrennstoff, Bruttoleistung, Ort, Breitengrad, Laengengrad, EinheitBetriebsstatus
      from combustion_extended where Bruttoleistung >= 1000 and Breitengrad is not null and EinheitBetriebsstatus in ('35','37')`);
    for (const r of q.all()) {
      const lat = Number(r.Breitengrad), lon = Number(r.Laengengrad); if (!inBox(lat, lon)) continue;
      const e = Number(r.Energietraeger), f = Number(String(r.Hauptbrennstoff ?? '').replace(/\.0$/, ''));
      let kind = 'power';
      if (e === 2412 || f === 2479 || f === 2480) kind = 'waste';
      else if (f === 2475) kind = 'steel';
      const detail = [MASTR_ENERGY[e] ?? `Energieträger ${e}`, MASTR_FUEL[f] ?? null, `${(r.Bruttoleistung / 1000).toFixed(1)} MW`, MASTR_STATUS[r.EinheitBetriebsstatus] ?? null].filter(Boolean).join(' · ');
      const name = (r.NameKraftwerk || r.NameStromerzeugungseinheit || '').trim() || null;
      // Notstromdiesel und Netzersatzanlagen (Mineralöl, < 5 MW) sind keine Dauerquellen — nur als Hinweis (halbes Gewicht).
      const weight = (e === 2409 && r.Bruttoleistung < 5000) ? 0.4 : WEIGHT[kind];
      out.push({ source: 'mastr', id: r.id, name, operator: null, kind, detail, city: r.Ort || null, country: 'Germany', lat: +lat.toFixed(5), lon: +lon.toFixed(5), status: MASTR_STATUS[r.EinheitBetriebsstatus] ?? null, weight, kw: r.Bruttoleistung, size: +(r.Bruttoleistung / 100_000).toFixed(2) });
      stat.combustion++;
    }
    db.close();
  }
  if (existsSync(bioPath)) {
    const db = new DatabaseSync(bioPath, { readOnly: true });
    const q = db.prepare(`select EinheitMastrNummer id, NameStromerzeugungseinheit, Hauptbrennstoff, Technologie, Bruttoleistung, Ort, Breitengrad, Laengengrad, EinheitBetriebsstatus
      from biomass_extended where Bruttoleistung >= 500 and Breitengrad is not null and EinheitBetriebsstatus in ('In Betrieb','Vorübergehend stillgelegt')`);
    for (const r of q.all()) {
      const lat = Number(r.Breitengrad), lon = Number(r.Laengengrad); if (!inBox(lat, lon)) continue;
      const detail = [r.Hauptbrennstoff || null, r.Technologie || null, `${(r.Bruttoleistung / 1000).toFixed(1)} MW`, r.EinheitBetriebsstatus].filter(Boolean).join(' · ');
      out.push({ source: 'mastr', id: r.id, name: (r.NameStromerzeugungseinheit || '').trim() || null, operator: null, kind: 'biomass', detail, city: r.Ort || null, country: 'Germany', lat: +lat.toFixed(5), lon: +lon.toFixed(5), status: r.EinheitBetriebsstatus, weight: WEIGHT.biomass, kw: r.Bruttoleistung, size: +(r.Bruttoleistung / 100_000).toFixed(2) });
      stat.biomass++;
    }
    db.close();
  }
  return { rows: out, stat };
}

// ---------------------------------------------------------------------------
// 3. BFE (CH) — CSV aus dem Zip (Python zum Entpacken, Node hat keinen Zip-Leser)
// ---------------------------------------------------------------------------
async function loadBfe() {
  const out = []; const stat = { plants: 0 };
  if (!existsSync(BFE_ZIP)) return { rows: out, stat };
  const dir = join(dirname(BFE_ZIP), 'bfe');
  if (!existsSync(join(dir, 'ElectricityProductionPlant.csv'))) {
    mkdirSync(dir, { recursive: true });
    execFileSync('python', ['-c', `import zipfile;zipfile.ZipFile(${JSON.stringify(BFE_ZIP)}).extractall(${JSON.stringify(dir)})`]);
  }
  // Probe der Projektion: Bern (2 600 000 / 1 200 000) ⇒ 7,44 / 46,95.
  const [blon, blat] = lv95ToWgs84(2_600_000, 1_200_000);
  if (Math.abs(blon - 7.4386) > 0.01 || Math.abs(blat - 46.9511) > 0.01) throw new Error(`LV95-Probe Bern fehlgeschlagen: ${blon},${blat}`);
  const KIND = { plantcat_12: ['waste', 'Kehrichtverbrennung'], plantcat_11: ['biomass', 'Biomassenutzung'], plantcat_13: ['biomass', 'Abwasserreinigung (Klärgas)'] };
  const SUB = { subcat_7: ['power', 'Erdöl'], subcat_8: ['power', 'Erdgas'], subcat_9: ['power', 'Kohle'], subcat_6: ['power', 'Kernenergie'], subcat_10: ['waste', 'Abfälle'], subcat_4: ['biomass', 'Biomasse'] };
  for await (const r of csvRows(join(dir, 'ElectricityProductionPlant.csv'))) {
    const kw = Number(r.TotalPower); if (!(kw >= 500)) continue;
    const k = KIND[r.PlantCategory] ?? SUB[r.SubCategory]; if (!k) continue;
    const [lon, lat] = lv95ToWgs84(Number(r._x), Number(r._y)); if (!inBox(lat, lon)) continue;
    const name = [r.Municipality, k[1]].filter(Boolean).join(' — ');
    out.push({ source: 'bfe', id: `bfe:${r.xtf_id}`, name, operator: null, kind: k[0], detail: `${k[1]} · ${(kw / 1000).toFixed(1)} MW · seit ${r.BeginningOfOperation || '?'}`, city: r.Municipality || null, country: 'Switzerland', lat: +lat.toFixed(5), lon: +lon.toFixed(5), status: 'in Betrieb (Herkunftsnachweis)', weight: WEIGHT[k[0]], kw, size: +(kw / 100_000).toFixed(2) });
    stat.plants++;
  }
  return { rows: out, stat };
}

async function main() {
  const e = await loadEprtr();
  const m = loadMastr();
  const b = await loadBfe();
  const rows = [...e.rows, ...m.rows, ...b.rows];
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const byKind = {}; for (const r of rows) byKind[`${r.source}:${r.kind}`] = (byKind[`${r.source}:${r.kind}`] ?? 0) + 1;
  const report = { built: new Date().toISOString().slice(0, 10), eprtr: e.stat, mastr: m.stat, bfe: b.stat, total: rows.length, byKind };
  writeFileSync(OUT.replace(/\.jsonl$/, '') + '.report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 1));
}
main().catch((err) => { console.error(err); process.exit(1); });
