#!/usr/bin/env node
/**
 * extract_truth.mjs — AP10a hindcast, TRUTH side: hourly station observations for the 405 archive
 * points (scripts/punktarchiv/points.json) from free archives, one gzip'd JSON per UTC day under
 * <HINDCAST_ROOT>/truth/<YYYY-MM-DD>.json.gz, in the conventions of the live archive collector.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/hindcast/extract_truth.mjs \
 *     --from=2026-08-01 --to=2026-09-19 [--networks=cdc,tawes,smn] [--limit=N] [--igra]
 *     [--rebuild-days] [--rebuild-hourly] [--cdc-wind=synop|hourly] [--tawes-source=auto|klima]
 *   … --verify [--verify-from=2026-09-14] [--from=… --to=… for the coverage table]
 *   … --igra-check=GMM00010393@2026-09-15T12
 *
 * Resumable: raw downloads stay in cache/truth/…, station-month records in cache/truth/hourly/…
 * (a `final` record is never rebuilt), and a `final` day file is skipped. Every request is logged to
 * log/truth-<stamp>.jsonl; the last stdout line is a one-line JSON summary.
 */
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  HINDCAST_ROOT, TRUTH_DIR, VERIFY_DIR, PRODUCER, H, DAY, RUN, TRUTH_SCALES, SENTINEL, TAWES_10MIN, SMN_10MIN,
  openRunLog, isoDay, isoMin, monthKey, dayStartMs, monthStartMs, nextMonthStartMs, monthsBetween, daysBetween,
  atomicWrite, readJson, readJsonGz, writeJsonGz, mapLimit, distKm, namesMatch, httpGet,
  cdcProducts, cdcDescription, cdcStationRows, cdcMonthRecord, CDC_BASE,
  GEO_BASE, KLIMA_10MIN, MAGNUS, geoMetadata, geoFetchMonth, geoSeries, tenMinMonthRecord,
  SMN_BASE, smnMeta, smnStationSeries,
  RECORD_COLS, sliceRecord, readMonthRecord, writeMonthRecord,
} from './lib/truthHist.mjs';
import { IGRA_STATIONS, igraStationList, igraStation, IGRA_DIR } from './lib/igra2.mjs';

const POINTS_FILE = new URL('../punktarchiv/points.json', import.meta.url);
const ARCHIVE_ROOT = process.env.PUNKTARCHIV_ROOT || 'C:/dev/buscosun-archiv';
const STATIONS_P = join(TRUTH_DIR, 'stations.json');
const CDC_MAX_KM = 2;            // the accepted distance without further evidence
const CDC_PROOF_MAX_KM = 10;     // beyond 2 km only with a passed overlap proof
const WINDOW_FROM_DEFAULT = '2023-05-24';

function parseArgs(argv) {
  const f = {};
  for (const a of argv) { if (!a.startsWith('--')) continue; const [k, ...v] = a.slice(2).split('='); f[k] = v.length ? v.join('=') : true; }
  return f;
}
const args = parseArgs(process.argv.slice(2));
const today = isoDay(Date.now());
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const logFile = openRunLog(stamp);
const t0 = Date.now();
const errors = [];            // { net, key, month?, error }
const note = (ev) => { RUN.log(ev); if (!args.quiet) console.log(`[truth] ${ev.msg ?? JSON.stringify(ev)}`); };

const pointsDoc = JSON.parse(readFileSync(POINTS_FILE, 'utf8'));
const POINTS = pointsDoc.points;

// ─── station mapping ─────────────────────────────────────────────────────────
const NEIGHBOUR_REASON = 'Nachbarland ohne freies stuendliches Stationsarchiv in den zugelassenen Quellen (DWD CDC deckt nur Deutschland; POI ist ein 24-h-Rollfenster, kein Archiv) — nicht abgedeckt';
const isDePoi = (p) => p.country === 'DE' && p.truth?.poi === true;
const isNeighbour = (p) => !['DE', 'AT', 'CH', 'LI'].includes(p.country);

async function buildStations(products) {
  const old = existsSync(STATIONS_P) ? readJson(STATIONS_P) : null;
  const doc = {
    schema: 1, kind: 'hindcast/truth-stations', createdAt: new Date().toISOString(), producer: PRODUCER,
    pointsFrom: { file: 'scripts/punktarchiv/points.json', builtAt: pointsDoc.builtAt ?? null, total: POINTS.length },
    rules: {
      cdc: `DE-Punkte mit truth.poi: naechste CDC-Station (TU-Stationsliste, aktiv ab ${WINDOW_FROM_DEFAULT}) nach Entfernung; ≤ ${CDC_MAX_KM} km gilt ohne weiteren Beleg (status mapped), ${CDC_MAX_KM}–${CDC_PROOF_MAX_KM} km nur mit bestandenem Ueberlappungsbeweis gegen POI (needsProof → provenByOverlap); ein durchgefallener Beweis ⇒ proofFailed ⇒ truth null. Name und Hoehe stehen als Beleg daneben.`,
      tawes: 'AT-Punkte mit truth.tawes: TAWES-Kennung = Punktkennung des Sammlers (tawes-v1-10min); fuer die Zeit vor dem TAWES-Historienfenster die klima-v2-10min-Station an derselben Stelle (INDIVIDUAL vor COMBINED, Entfernung ≤ 0,5 km, sonst ≤ 2 km mit Namensgleichheit), Beweis gegen TAWES im Ueberlappungsfenster.',
      smn: 'CH/LI-Punkte mit truth.smn: dieselbe SMN-Abkuerzung wie im Sammler (keine Umschluesselung); Entfernung Punkt ↔ Station aus ogd-smn_meta_stations.csv als Beleg.',
      neighbours: NEIGHBOUR_REASON,
    },
    points: {},
  };
  // CDC
  const desc = {};
  for (const prod of products) desc[prod.key] = await cdcDescription(prod);
  const fromKey = WINDOW_FROM_DEFAULT.replace(/-/g, '');
  for (const p of POINTS) {
    const e = { name: p.name, country: p.country, lat: p.lat, lon: p.lon, elev: p.elev };
    if (isDePoi(p)) {
      const cands = desc.TU.filter((s) => s.to >= fromKey).map((s) => ({ ...s, d: distKm(p.lat, p.lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d);
      const s = cands[0];
      const prevProof = old?.points?.[p.id]?.cdc?.id === s?.id ? old.points[p.id].cdc.proof ?? null : null;
      if (!s || s.d > CDC_PROOF_MAX_KM) e.cdc = { id: null, status: 'noStation', reason: `keine CDC-Station ≤ ${CDC_PROOF_MAX_KM} km (naechste ${s ? s.d.toFixed(2) : '—'} km)` };
      else {
        const products2 = Object.fromEntries(products.map((pr) => { const r = desc[pr.key].find((x) => x.id === s.id); return [pr.key, r ? { from: r.from, to: r.to } : null]; }));
        let status = s.d <= CDC_MAX_KM ? 'mapped' : 'needsProof';
        if (prevProof && prevProof.pass === false) status = 'proofFailed';
        else if (prevProof && prevProof.pass === true && status === 'needsProof') status = 'provenByOverlap';
        e.cdc = {
          id: s.id, name: s.name, state: s.state, lat: s.lat, lon: s.lon, h: s.h, distKm: +s.d.toFixed(3), dElevM: s.h - p.elev,
          nameMatch: namesMatch(p.name, s.name), secondKm: cands[1] ? +cands[1].d.toFixed(2) : null, secondId: cands[1]?.id ?? null,
          products: products2, status, proof: prevProof,
        };
        if (status === 'proofFailed') e.cdc.reason = 'Ueberlappungsbeweis gegen POI nicht bestanden';
        if (status === 'needsProof') e.cdc.reason = `Station ${s.d.toFixed(2)} km entfernt (> ${CDC_MAX_KM} km): nur mit Ueberlappungsbeweis`;
      }
    } else if (isNeighbour(p)) e.notCovered = NEIGHBOUR_REASON;
    doc.points[p.id] = e;
  }
  // TAWES + klima
  const tMeta = await geoMetadata('tawes-v1-10min');
  const kMeta = await geoMetadata('klima-v2-10min');
  const tById = new Map(tMeta.stations.map((s) => [String(s.id), s]));
  const winStart = Date.parse(`${WINDOW_FROM_DEFAULT}T00:00:00Z`) - DAY;
  for (const p of POINTS.filter((x) => x.truth?.tawes)) {
    const ts = tById.get(String(p.truth.tawes));
    const ks = kMeta.stations.filter((s) => Number.isFinite(s.lat)).map((s) => ({ ...s, d: distKm(ts?.lat ?? p.lat, ts?.lon ?? p.lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d);
    const near = ks.filter((s) => s.d <= 0.5 && s.is_active !== false);
    const covers = (s) => Date.parse(s.valid_from) <= winStart;
    const pick = near.find((s) => s.type === 'INDIVIDUAL' && covers(s)) ?? near.find((s) => s.type === 'COMBINED' && covers(s)) ?? near[0]
      ?? ks.find((s) => s.d <= 2 && namesMatch(ts?.name ?? p.name, s.name)) ?? null;
    const prev = old?.points?.[p.id]?.tawes;
    doc.points[p.id].tawes = {
      id: String(p.truth.tawes), name: ts?.name ?? null, lat: ts?.lat ?? null, lon: ts?.lon ?? null, h: ts?.altitude ?? null,
      distKm: ts ? +distKm(p.lat, p.lon, ts.lat, ts.lon).toFixed(3) : null, inTawesHistorical: !!ts,
      klima: pick ? { id: String(pick.id), type: pick.type, groupId: pick.group_id ?? null, name: pick.name, lat: pick.lat, lon: pick.lon, h: pick.altitude, distKm: +pick.d.toFixed(3), validFrom: pick.valid_from, nameMatch: namesMatch(ts?.name ?? p.name, pick.name),
        alternatives: near.filter((s) => s !== pick).map((s) => ({ id: String(s.id), type: s.type, name: s.name, distKm: +s.d.toFixed(3), validFrom: s.valid_from })) } : null,
      klimaProof: prev?.klima?.id === (pick ? String(pick.id) : null) ? prev?.klimaProof ?? null : null,
    };
  }
  // SMN
  const smn = await smnMeta();
  const sBy = new Map(smn.map((s) => [s.id, s]));
  for (const p of POINTS.filter((x) => x.truth?.smn)) {
    const s = sBy.get(p.truth.smn);
    doc.points[p.id].smn = { abbr: p.truth.smn, name: s?.name ?? null, lat: s?.lat ?? null, lon: s?.lon ?? null, h: s?.h ?? null, wmo: s?.wmo ?? null, distKm: s ? +distKm(p.lat, p.lon, s.lat, s.lon).toFixed(3) : null, proof: old?.points?.[p.id]?.smn?.proof ?? null };
  }
  doc.summary = summariseStations(doc);
  atomicWrite(STATIONS_P, `${JSON.stringify(doc, null, 1)}\n`);
  return doc;
}
function summariseStations(doc) {
  const v = Object.values(doc.points);
  const cdc = v.filter((e) => e.cdc);
  const by = (arr, f) => arr.reduce((m, e) => { const k = f(e); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  return {
    cdc: { points: cdc.length, byStatus: by(cdc, (e) => e.cdc.status), stations: new Set(cdc.map((e) => e.cdc.id).filter(Boolean)).size },
    tawes: { points: v.filter((e) => e.tawes).length, klimaMapped: v.filter((e) => e.tawes?.klima).length, notInTawesHistorical: v.filter((e) => e.tawes && !e.tawes.inTawesHistorical).map((e) => e.name) },
    smn: { points: v.filter((e) => e.smn).length, withMeta: v.filter((e) => e.smn?.name).length },
    notCovered: v.filter((e) => e.notCovered).length,
  };
}
const cdcIncluded = (e) => e?.cdc?.id && ['mapped', 'provenByOverlap'].includes(e.cdc.status);
const cdcExtract = (e) => e?.cdc?.id && ['mapped', 'provenByOverlap', 'needsProof'].includes(e.cdc.status);

// ─── phase 1: station-month records ──────────────────────────────────────────
function monthsToBuild(net, key, months, rebuild) {
  return months.filter((m) => { if (rebuild) return true; const r = readMonthRecord(net, m, key); return !r || !r.final; });
}

async function phaseCdc(stations, months, products, opts) {
  const ids = [...new Set(Object.values(stations.points).filter(cdcExtract).map((e) => e.cdc.id))].slice(0, opts.limit ?? Infinity);
  let built = 0, skipped = 0;
  const nowMs = Date.now();
  await mapLimit(ids, opts.concurrency ?? 6, async (id, i) => {
    const todo = monthsToBuild('cdc', id, months, opts.rebuildHourly);
    if (!todo.length) { skipped++; return; }
    const needFrom = monthStartMs(todo[0]), needTo = Math.min(nextMonthStartMs(todo[todo.length - 1]) - H, nowMs);
    try {
      const st = await cdcStationRows(id, needFrom, needTo, products);
      for (const m of todo) {
        const rec = cdcMonthRecord(st, m, products);
        const cover = st.coverToMs ?? null;
        Object.assign(rec, { net: 'cdc', key: id, month: m, final: cover != null && cover >= nextMonthStartMs(m) - H, coverToMs: cover, missingProducts: st.missing, files: st.files, wind: opts.cdcWind, builtAt: new Date().toISOString() });
        writeMonthRecord('cdc', m, id, rec);
        built++;
      }
    } catch (e) { errors.push({ net: 'cdc', key: id, months: todo, error: String(e.message).slice(0, 300) }); }
    if ((i + 1) % 20 === 0) note({ ev: 'progress', net: 'cdc', msg: `cdc ${i + 1}/${ids.length} Stationen · ${(RUN.net('cdc').bytes / 1e6).toFixed(1)} MB` });
  });
  note({ ev: 'phase', net: 'cdc', msg: `cdc: ${ids.length} Stationen, ${built} Stationsmonate gebaut, ${skipped} Stationen vollstaendig im Cache` });
}

async function phaseTawes(stations, months, opts) {
  const tMeta = await geoMetadata('tawes-v1-10min');
  const kMeta = await geoMetadata('klima-v2-10min');
  const tStart = Date.parse(tMeta.start_time), tEnd = Date.parse(tMeta.end_time), kEnd = Date.parse(kMeta.end_time);
  const entries = Object.entries(stations.points).filter(([, e]) => e.tawes).slice(0, opts.limit ?? Infinity);
  const outNet = opts.forceKlima ? 'tawes-klima' : 'tawes';
  let built = 0;
  for (const m of months) {
    const useTawes = !opts.forceKlima && monthStartMs(m) - 50 * 60_000 >= tStart;
    const dataset = useTawes ? 'tawes-v1-10min' : 'klima-v2-10min';
    const todo = entries.filter(([, e]) => monthsToBuild(outNet, e.tawes.id, [m], opts.rebuildHourly).length);
    if (!todo.length) continue;
    const idOf = (e) => (useTawes ? e.tawes.id : e.tawes.klima?.id);
    const ids = todo.map(([, e]) => idOf(e)).filter(Boolean);
    const docs = await geoFetchMonth(dataset, m, [...new Set(ids)], useTawes ? tEnd : kEnd);
    for (const [pid, e] of todo) {
      const sid = idOf(e);
      const doc = sid ? docs.get(sid) : null;
      if (!doc || doc.error) { errors.push({ net: 'tawes', key: e.tawes.id, month: m, error: doc?.error ?? (sid ? 'keine Reihe in der Antwort' : 'keine klima-v2-Station zugeordnet') }); continue; }
      const rec = tenMinMonthRecord(geoSeries(doc), m, {
        net: 'tawes', key: e.tawes.id, point: pid, month: m, source: dataset, sourceStation: sid,
        derived: dataset === 'klima-v2-10min' ? { td: 'Magnus(tl, rf)' } : null,
        final: !!doc.final, coverToMs: doc.endMs, fetchedAtMs: doc.fetchedAtMs, builtAt: new Date().toISOString(),
      });
      writeMonthRecord(outNet, m, e.tawes.id, rec);
      built++;
    }
    note({ ev: 'progress', net: 'tawes', msg: `${outNet} ${m}: ${dataset}, ${todo.length} Stationen · ${RUN.net('tawes').requests} Anfragen · ${(RUN.net('tawes').bytes / 1e6).toFixed(1)} MB` });
  }
  note({ ev: 'phase', net: 'tawes', msg: `${outNet}: ${built} Stationsmonate gebaut (TAWES-Historie ab ${tMeta.start_time})` });
  return { tawesStart: tMeta.start_time, tawesEnd: tMeta.end_time, klimaEnd: kMeta.end_time };
}

async function phaseSmn(stations, months, opts) {
  const abbrs = [...new Set(Object.values(stations.points).filter((e) => e.smn).map((e) => e.smn.abbr))].slice(0, opts.limit ?? Infinity);
  let built = 0;
  const nowMs = Date.now();
  await mapLimit(abbrs, opts.concurrency ?? 4, async (abbr, i) => {
    const todo = monthsToBuild('smn', abbr, months, opts.rebuildHourly);
    if (!todo.length) return;
    const needFrom = monthStartMs(todo[0]), needTo = Math.min(nextMonthStartMs(todo[todo.length - 1]) - H, nowMs);
    try {
      const st = await smnStationSeries(abbr, needFrom, needTo);
      for (const m of todo) {
        const rec = tenMinMonthRecord(st.series, m, { net: 'smn', key: abbr, month: m, final: st.coverToMs != null && st.coverToMs >= nextMonthStartMs(m) - H, coverToMs: st.coverToMs, sources: st.sources, builtAt: new Date().toISOString() });
        writeMonthRecord('smn', m, abbr, rec);
        built++;
      }
    } catch (e) { errors.push({ net: 'smn', key: abbr, months: todo, error: String(e.message).slice(0, 300) }); }
    if ((i + 1) % 20 === 0) note({ ev: 'progress', net: 'smn', msg: `smn ${i + 1}/${abbrs.length} Stationen · ${(RUN.net('smn').bytes / 1e6).toFixed(1)} MB` });
  });
  note({ ev: 'phase', net: 'smn', msg: `smn: ${abbrs.length} Stationen, ${built} Stationsmonate gebaut` });
}

// ─── phase 2: day files ──────────────────────────────────────────────────────
function networkHeaders(products, geo) {
  return {
    cdc: {
      what: 'DWD CDC, Stundenwerte der Stationen (observations_germany/climate/hourly) — das freie Archiv-Aequivalent des POI-Blocks des Sammlers fuer die DE-Punkte',
      equivalentOf: 'poi',
      products: products.map((p) => ({ key: p.key, recent: `${CDC_BASE}/${p.dir}/recent/stundenwerte_${p.key}_<Stations_id>_akt.zip`, historical: `${CDC_BASE}/${p.dir}/historical/stundenwerte_${p.key}_<Stations_id>_<von>_<bis>_hist.zip`, columns: p.cols })),
      licence: 'GeoNutzV (Geodatenzugangsgesetz / Nutzungsbestimmungen des DWD)', attribution: 'Datenbasis: Deutscher Wetterdienst',
      conventions: [
        'Zeit: MESS_DATUM (YYYYMMDDHH) in UTC (Metadaten_Parameter: „Stundenwerte in UTC" seit 2001); obsAtMs = Stunden mit mindestens einem Wert.',
        't = TT_TU, rh = RF_TU (air_temperature); td = TD (dew_point, gemessen/SYNOP, kein Magnus); p = P (auf NN reduziert, pressure).',
        'ff/dd = FF/DD aus wind_synop (10-Minuten-Mittel zum SYNOP-Termin, m/s — die POI-Semantik); das Produkt wind (F, D) ist ein STUNDENmittel und fehlt an den Bundeswehr-Stationen.',
        'fx = FX_911 „hoechste Windspitze der letzten Stunde" (extreme_wind); fxh = fx (wie POI: dort ist fx bereits das Stundenmaximum).',
        'rr1 = R1 Stundensumme (precipitation) — vergleichbar mit POI rr1; an Bundeswehr-Stationen gibt es kein R1 (null).',
        'n = V_N (Achtel) × 12,5 %; V_N −1 und 9 (nicht bestimmbar/Himmel nicht erkennbar) ⇒ null. POI rundet 12,5 auf ganze Prozent (13, 38, 63, 88) — CDC nicht.',
        '−999 ⇒ null (SENTINEL). historical (Stand Jahresende) bis zu seinem letzten Tag, recent (≈ 500 Tage, taeglich neu) danach.',
        'Stationszuordnung, Entfernung, Name und Beweis je Punkt: truth/stations.json.',
      ],
    },
    tawes: {
      what: 'GeoSphere Austria, 10-min-Stationsdaten → Stundenwerte wie im Sammler (tenMinColumns)',
      equivalentOf: 'tawes',
      sources: {
        'tawes-v1-10min': { url: `${GEO_BASE}/tawes-v1-10min`, params: TAWES_10MIN, window: geo ? `${geo.tawesStart} … ${geo.tawesEnd} (rollend, ≈ 3 Monate)` : null, note: 'der Endpunkt des Sammlers, dieselben Kennungen; genutzt fuer jeden Monat, dessen Stunden (ab Monatsbeginn − 50 min) im TAWES-Fenster liegen' },
        'klima-v2-10min': { url: `${GEO_BASE}/klima-v2-10min`, params: KLIMA_10MIN, derived: { td: `Magnus (${MAGNUS.source}: e = ${MAGNUS.e0} hPa · exp(${MAGNUS.a}·t/(${MAGNUS.b}+t)))` }, note: 'qualitaetsgepruefte 10-min-Reihe mit eigenen Stationskennungen (Zuordnung in stations.json); KEIN Taupunkt ⇒ td abgeleitet; ff = vektorielles Mittel (= TAWES FF), pred = reduzierter Druck (eigene Reduktion, s. Beweis); genutzt vor dem TAWES-Fenster' },
      },
      licence: 'CC BY 4.0', attribution: 'Datenquelle: GeoSphere Austria (dataset.api.hub.geosphere.at)',
      conventions: [
        'Stempel = Intervallende. t, td, rh, ff, dd, fx (10-min-Spitze), p AM Stundenstempel; rr1 = 10-min-Menge am Stempel × 6; rr1h = Summe der sechs Werte h−50…h (null, wenn einer fehlt); fxh = Maximum der sechs Spitzen h−50…h (null, wenn eine fehlt).',
        'Die Stunde 00:00 nimmt die 10-min-Werte des Vortags 23:10…23:50 (jede Monatsanfrage beginnt 50 min vor Monatsbeginn).',
        'Jeder Datensatz traegt `source` (tawes-v1-10min | klima-v2-10min); `derived.td` bei klima-v2.',
      ],
    },
    smn: {
      what: 'MeteoSwiss OGD SwissMetNet (ch.meteoschweiz.ogd-smn), 10-min-Stationsdateien → Stundenwerte wie im Sammler',
      equivalentOf: 'smn',
      files: [`${SMN_BASE}/<abbr>/ogd-smn_<abbr>_t_historical_<Dekade>.csv (per Byte-Range ab Fensterbeginn)`, `${SMN_BASE}/<abbr>/ogd-smn_<abbr>_t_recent.csv`, `${SMN_BASE}/<abbr>/ogd-smn_<abbr>_t_now.csv`],
      params: SMN_10MIN, licence: 'CC BY 4.0', attribution: 'Source: MeteoSwiss',
      conventions: [
        'Dieselben Spalten und dieselbe Stundenbildung wie der Sammler (parseSmn10min + tenMinColumns); Zeitformat „dd.mm.yyyy HH:MM" UTC in allen drei Dateiarten (gemessen).',
        'Ein Stempel kommt aus der ersten Datei, die ihn traegt: historical, recent, now.',
      ],
    },
  };
}

/** Month records memoised for ONE month at a time (days run in order; the full range would not fit otherwise). */
function loadMonthCache() {
  let memo = new Map(), memoMonth = null;
  return (net, m, key) => {
    if (m !== memoMonth) { memo = new Map(); memoMonth = m; }
    const k = `${net}|${key}`;
    if (!memo.has(k)) memo.set(k, readMonthRecord(net, m, key));
    return memo.get(k);
  };
}

function assembleDays(stations, days, products, geo, opts) {
  mkdirSync(TRUTH_DIR, { recursive: true });
  const get = loadMonthCache();
  const headers = networkHeaders(products, geo);
  let written = 0, skipped = 0, finals = 0;
  const netErr = (net, m) => errors.filter((e) => e.net === net && (e.month === m || e.months?.includes(m)));
  for (const day of days) {
    const out = join(TRUTH_DIR, `${day}.json.gz`);
    if (!opts.rebuildDays && existsSync(out)) {
      try { const d = readJsonGz(out); if (d.stats?.final) { skipped++; continue; } } catch { /* rebuild */ }
    }
    const from = dayStartMs(day), to = from + 23 * H, m = monthKey(from);
    const byPoint = {};
    const warnings = {};
    const warn = (k, s) => (warnings[k] ??= []).push(s);
    const cover = { cdc: -Infinity, tawes: -Infinity, smn: -Infinity };
    const withData = { cdc: 0, tawes: 0, smn: 0 }, assigned = { cdc: 0, tawes: 0, smn: 0 };
    for (const p of POINTS) {
      const e = stations.points[p.id];
      const entry = {};
      if (isDePoi(p)) {
        assigned.cdc++;
        if (!cdcIncluded(e)) { entry.cdc = null; warn('cdcNotMapped', `${p.id} ${e?.cdc?.status ?? 'noStation'}: ${e?.cdc?.reason ?? ''}`.trim()); }
        else {
          const rec = get('cdc', m, e.cdc.id);
          if (rec?.coverToMs != null) cover.cdc = Math.max(cover.cdc, rec.coverToMs);
          const s = rec ? sliceRecord(rec, from, to, RECORD_COLS.cdc) : null;
          entry.cdc = s && s.count ? s : null;
          if (entry.cdc) withData.cdc++; else warn('cdcEmpty', `${p.id}→${e.cdc.id}`);
        }
      } else if (isNeighbour(p)) { entry.cdc = null; warn('notCovered', `${p.id} ${p.country} ${p.name}`); }
      if (e?.tawes) {
        assigned.tawes++;
        const rec = get('tawes', m, e.tawes.id);
        if (rec?.coverToMs != null) cover.tawes = Math.max(cover.tawes, rec.coverToMs);
        const s = rec ? sliceRecord(rec, from, to, RECORD_COLS.tawes) : null;
        entry.tawes = s && s.count ? Object.assign(s, { source: rec.source, ...(rec.derived ? { derived: rec.derived } : {}) }) : null;
        if (entry.tawes) withData.tawes++; else warn('tawesEmpty', `${p.id}${rec ? ` (${rec.source})` : ' (kein Monatsdatensatz)'}`);
      }
      if (e?.smn) {
        assigned.smn++;
        const rec = get('smn', m, e.smn.abbr);
        if (rec?.coverToMs != null) cover.smn = Math.max(cover.smn, rec.coverToMs);
        const s = rec ? sliceRecord(rec, from, to, RECORD_COLS.smn) : null;
        entry.smn = s && s.count ? s : null;
        if (entry.smn) withData.smn++; else warn('smnEmpty', `${p.id} ${e.smn.abbr}`);
      }
      byPoint[p.id] = entry;
    }
    const netFinal = Object.fromEntries(Object.entries(cover).map(([k, v]) => [k, v >= to]));
    const final = Object.values(netFinal).every(Boolean);
    const dayErrors = ['cdc', 'tawes', 'smn'].flatMap((n) => netErr(n, m).map((x) => `${n}/${x.key}: ${x.error}`));
    const doc = {
      schema: 1, kind: 'hindcast/truth', day, createdAt: new Date().toISOString(), producer: PRODUCER,
      sentinel: SENTINEL, scales: { truth: TRUTH_SCALES },
      window: { fromMs: from, toMs: to, note: 'Volle Stunden 00:00…23:00 UTC dieses Tages, jede Stunde hoechstens einmal (die Doppelung der 23-UTC-Stunde im Archiv entfaellt hier durch Bau). 10-min-Netze: Stunde 00:00 aus den Werten des Vortags 23:10…00:00.' },
      networks: headers,
      stationsFile: 'truth/stations.json',
      byPoint,
      stats: {
        errors: dayErrors, warnings: Object.fromEntries(Object.entries(warnings).map(([k, v]) => [k, `${v.length}: ${v.join(' | ')}`])),
        bytes: { note: 'Bytes der Quellabrufe dieses Laufs je Netz (die Rohdaten gelten fuer viele Tage)', run: Object.fromEntries(Object.entries(RUN.nets).map(([k, v]) => [k, v.bytes])) },
        final, finalByNetwork: netFinal, coverToMs: Object.fromEntries(Object.entries(cover).map(([k, v]) => [k, Number.isFinite(v) ? v : null])),
        coverage: Object.fromEntries(Object.keys(assigned).map((k) => [k, { assigned: assigned[k], withData: withData[k] }])),
        stationsSummary: stations.summary,
      },
    };
    writeJsonGz(out, doc);
    written++; if (final) finals++;
  }
  note({ ev: 'phase', net: 'days', msg: `Tage: ${written} geschrieben (${finals} final), ${skipped} final im Bestand uebersprungen` });
  return { written, skipped, finals };
}

// ─── verification against the live archive ───────────────────────────────────
const dec = (q, k) => (q === SENTINEL || q == null ? null : q * TRUTH_SCALES[k].scale + TRUTH_SCALES[k].offset);
function loadArchive() {
  const slots = [];
  for (const d of readdirSync(ARCHIVE_ROOT).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) {
    for (const f of readdirSync(join(ARCHIVE_ROOT, d)).filter((x) => /^\d{4}(-r\d+)?\.json\.gz$/.test(x)).sort()) {
      const s = JSON.parse(gunzipSync(readFileSync(join(ARCHIVE_ROOT, d, f))).toString('utf8'));
      slots.push({ file: `${d}/${f}`, schema: s.schema, slotAtMs: s.slotAtMs ?? Date.parse(s.slotAt), truth: s.truth.byPoint });
    }
  }
  slots.sort((a, b) => a.slotAtMs - b.slotAtMs);
  const map = new Map();
  const dup = {}, conflict = {}, conflictEx = {};
  for (const s of slots) {
    for (const [id, tr] of Object.entries(s.truth)) {
      for (const net of ['poi', 'tawes', 'smn']) {
        const r = tr?.[net];
        if (!r?.obsAtMs) continue;
        r.obsAtMs.forEach((ms, i) => {
          const key = `${id}|${net}|${ms}`;
          const cols = {};
          for (const k of Object.keys(TRUTH_SCALES)) if (Array.isArray(r[k])) cols[k] = r[k][i];
          const prev = map.get(key);
          if (prev) {
            dup[net] = (dup[net] ?? 0) + 1;
            const diff = Object.keys(cols).filter((k) => k in prev.cols && prev.cols[k] !== cols[k]);
            if (diff.length) { conflict[net] = (conflict[net] ?? 0) + 1; (conflictEx[net] ??= []).length < 5 && conflictEx[net].push({ id, stamp: new Date(ms).toISOString(), cols: diff, a: Object.fromEntries(diff.map((k) => [k, prev.cols[k]])), b: Object.fromEntries(diff.map((k) => [k, cols[k]])), slots: [prev.slot, s.file] }); }
          }
          map.set(key, { cols, slot: s.file, schema: s.schema });   // the later slot wins
        });
      }
    }
  }
  return { slots: slots.map((s) => ({ file: s.file, schema: s.schema, slotAt: new Date(s.slotAtMs).toISOString() })), map, dedupe: { duplicates: dup, conflicting: conflict, examples: conflictEx } };
}
function loadHindcastDays(fromDay, toDay) {
  const map = new Map();
  const days = [];
  for (const day of daysBetween(fromDay, toDay)) {
    const p = join(TRUTH_DIR, `${day}.json.gz`);
    if (!existsSync(p)) continue;
    const d = readJsonGz(p);
    days.push({ day, final: d.stats.final });
    for (const [id, e] of Object.entries(d.byPoint)) {
      for (const net of ['cdc', 'tawes', 'smn']) {
        const r = e?.[net];
        if (!r?.obsAtMs) continue;
        r.obsAtMs.forEach((ms, i) => {
          const cols = {};
          for (const k of Object.keys(TRUTH_SCALES)) if (Array.isArray(r[k])) cols[k] = r[k][i];
          map.set(`${id}|${net}|${ms}`, { cols, source: r.source ?? null });
        });
      }
    }
  }
  return { map, days };
}
function newAcc() { return { n: 0, equal: 0, different: 0, maxAbs: 0, sumAbs: 0, within: 0, ex: [], onlyArchive: 0, onlyHindcast: 0, bothNull: 0 }; }
const TOL = { t: 0.1, td: 0.1, rh: 1, ff: 0.5, dd: 10, fx: 0.5, fxh: 0.5, rr1: 0.1, rr1h: 0.1, n: 13, p: 0.2 };
function accumulate(acc, k, qa, qh, ctx) {
  const a = dec(qa, k), h = dec(qh, k);
  if (a == null && h == null) { acc.bothNull++; return; }
  if (a == null) { acc.onlyHindcast++; return; }
  if (h == null) { acc.onlyArchive++; return; }
  acc.n++;
  if (qa === qh) { acc.equal++; acc.within++; return; }
  acc.different++;
  const d = Math.abs(a - h);
  acc.sumAbs += d;
  if (d <= TOL[k] + 1e-9) acc.within++;
  if (d > acc.maxAbs) acc.maxAbs = d;
  acc.ex.push({ d, ...ctx, archive: +a.toFixed(3), hindcast: +h.toFixed(3) });
  if (acc.ex.length > 40) { acc.ex.sort((x, y) => y.d - x.d); acc.ex.length = 10; }
}
function finishAcc(acc, k) {
  acc.ex.sort((x, y) => y.d - x.d);
  return { n: acc.n, equal: acc.equal, different: acc.different, equalShare: acc.n ? +(acc.equal / acc.n).toFixed(4) : null, withinTol: acc.within, tol: TOL[k], withinShare: acc.n ? +(acc.within / acc.n).toFixed(4) : null, maxAbs: +acc.maxAbs.toFixed(3), meanAbsAll: acc.n ? +(acc.sumAbs / acc.n).toFixed(4) : null, onlyArchive: acc.onlyArchive, onlyHindcast: acc.onlyHindcast, bothNull: acc.bothNull, examples: acc.ex.slice(0, 5).map(({ d, ...x }) => ({ ...x, absDiff: +d.toFixed(3) })) };
}
const PAIRS = [{ h: 'cdc', a: 'poi' }, { h: 'tawes', a: 'tawes' }, { h: 'smn', a: 'smn' }];

function compareMaps(arch, hind, shiftMs = 0) {
  const res = {};
  for (const { h, a } of PAIRS) {
    const accs = {}, bySchema = {};
    for (const [key, av] of arch.map) {
      const [id, net, msS] = key.split('|');
      if (net !== a) continue;
      const hv = hind.map.get(`${id}|${h}|${Number(msS) - shiftMs}`);
      if (!hv) continue;
      for (const k of Object.keys(av.cols)) {
        if (!(k in hv.cols)) continue;
        accumulate(accs[k] ??= newAcc(), k, av.cols[k], hv.cols[k], { id, stamp: new Date(Number(msS)).toISOString() });
        if (!shiftMs) accumulate((bySchema[`schema${av.schema}`] ??= {})[k] ??= newAcc(), k, av.cols[k], hv.cols[k], { id, stamp: new Date(Number(msS)).toISOString() });
      }
    }
    res[`${h}↔${a}`] = Object.fromEntries(Object.entries(accs).map(([k, v]) => [k, finishAcc(v, k)]));
    if (!shiftMs) res[`${h}↔${a}`]._bySchema = Object.fromEntries(Object.entries(bySchema).map(([s, cols]) => [s, Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, { n: v.n, equal: v.equal, maxAbs: +v.maxAbs.toFixed(3) }]))]));
  }
  return res;
}

/** Per-point CDC proof from the station-month records (also for `needsProof` candidates that are not in the day files yet). */
function cdcPointProof(stations, arch, fromMs, toMs) {
  const out = {};
  for (const p of POINTS.filter(isDePoi)) {
    const e = stations.points[p.id];
    if (!e?.cdc?.id) continue;
    const accs = { t: newAcc(), td: newAcc(), p: newAcc(), rh: newAcc() };
    for (const m of monthsBetween(fromMs, toMs)) {
      const rec = readMonthRecord('cdc', m, e.cdc.id);
      if (!rec) continue;
      rec.obsAtMs.forEach((ms, i) => {
        if (ms < fromMs || ms > toMs) return;
        const av = arch.map.get(`${p.id}|poi|${ms}`);
        if (!av) return;
        for (const k of Object.keys(accs)) if (k in av.cols) accumulate(accs[k], k, av.cols[k], rec[k][i], { stamp: new Date(ms).toISOString() });
      });
    }
    const t = finishAcc(accs.t, 't'), pp = finishAcc(accs.p, 'p'), td = finishAcc(accs.td, 'td');
    // pass: ≥ 24 compared hours and ≥ 80 % of the temperatures within 0,1 K (a neighbouring station a few km away misses this).
    const pass = t.n >= 24 ? t.withinShare >= 0.8 : null;
    out[p.id] = { cdcId: e.cdc.id, distKm: e.cdc.distKm, status: e.cdc.status, n: t.n, tEqualShare: t.equalShare, tWithin01: t.withinShare, tMaxAbs: t.maxAbs, tdWithin01: td.withinShare, pWithin02: pp.withinShare, pMaxAbs: pp.maxAbs, pass, rule: 'n_t ≥ 24 und Anteil |Δt| ≤ 0,1 K ≥ 0,8' };
  }
  return out;
}

function compareTawesKlima(stations, months) {
  const accs = {}, perStation = {};
  for (const [pid, e] of Object.entries(stations.points)) {
    if (!e.tawes) continue;
    const ps = {};
    for (const m of months) {
      const a = readMonthRecord('tawes', m, e.tawes.id), k = readMonthRecord('tawes-klima', m, e.tawes.id);
      if (!a || !k || a.source !== 'tawes-v1-10min') continue;
      const kIdx = new Map(k.obsAtMs.map((ms, i) => [ms, i]));
      a.obsAtMs.forEach((ms, i) => {
        const j = kIdx.get(ms);
        if (j == null) return;
        for (const col of RECORD_COLS.tawes) {
          accumulate(accs[col] ??= newAcc(), col, a[col][i], k[col][j], { id: pid, stamp: new Date(ms).toISOString() });
          accumulate(ps[col] ??= newAcc(), col, a[col][i], k[col][j], {});
        }
      });
    }
    if (Object.keys(ps).length) perStation[pid] = { tawes: e.tawes.id, klima: e.tawes.klima?.id, n: ps.t?.n ?? 0, tEqual: ps.t ? +(ps.t.equal / Math.max(1, ps.t.n)).toFixed(3) : null, pMeanAbs: ps.p?.n ? +(ps.p.sumAbs / ps.p.n).toFixed(3) : null, pEqual: ps.p ? +(ps.p.equal / Math.max(1, ps.p.n)).toFixed(3) : null, tdMaxAbs: ps.td ? +ps.td.maxAbs.toFixed(2) : null };
  }
  return { columns: Object.fromEntries(Object.entries(accs).map(([k, v]) => [k, finishAcc(v, k)])), perStation };
}

function coverageTable(stations, fromDay, toDay) {
  const tab = {};
  for (const day of daysBetween(fromDay, toDay)) {
    const p = join(TRUTH_DIR, `${day}.json.gz`);
    if (!existsSync(p)) continue;
    const d = readJsonGz(p), m = day.slice(0, 7);
    for (const net of ['cdc', 'tawes', 'smn']) {
      const t = ((tab[net] ??= {})[m] ??= { days: 0, assigned: 0, pointsWithData: new Set(), hoursWithValue: 0, hoursPossible: 0, colHours: {} });
      t.days++;
      for (const [id, e] of Object.entries(d.byPoint)) {
        if (!(net in e)) continue;
        if (!stations.points[id]?.[net]) continue;   // neighbours carry `cdc: null` (not covered) — not part of the network
        if (t.days === 1) t.assigned++;
        t.hoursPossible += 24;
        const r = e[net];
        if (!r) continue;
        let any = 0;
        r.obsAtMs.forEach((_, i) => {
          let has = false;
          for (const k of RECORD_COLS[net]) if (r[k] && r[k][i] !== SENTINEL) { has = true; t.colHours[k] = (t.colHours[k] ?? 0) + 1; }
          if (has) any++;
        });
        if (any) t.pointsWithData.add(id);
        t.hoursWithValue += any;
      }
    }
  }
  for (const net of Object.keys(tab)) for (const m of Object.keys(tab[net])) {
    const t = tab[net][m];
    tab[net][m] = { days: t.days, assignedPoints: t.assigned, pointsWithData: t.pointsWithData.size, hourShare: t.hoursPossible ? +(t.hoursWithValue / t.hoursPossible).toFixed(4) : null, columnHourShare: Object.fromEntries(Object.entries(t.colHours).map(([k, v]) => [k, +(v / t.hoursPossible).toFixed(4)])) };
  }
  return tab;
}

async function verify(stations, products, opts) {
  const vFrom = args['verify-from'] || '2026-09-14', vTo = today;
  const arch = loadArchive();
  const hind = loadHindcastDays(vFrom, vTo);
  const fromMs = dayStartMs(vFrom), toMs = dayStartMs(vTo) + 23 * H;
  for (const k of [...arch.map.keys()]) { const ms = Number(k.split('|')[2]); if (ms < fromMs || ms > toMs) arch.map.delete(k); }
  const main = compareMaps(arch, hind, 0);
  const shifted = compareMaps(arch, hind, H);
  const negative = {};
  for (const [pair, cols] of Object.entries(main)) {
    negative[pair] = Object.fromEntries(Object.entries(cols).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, { equalShare: v.equalShare, equalShareShifted1h: shifted[pair]?.[k]?.equalShare ?? null, nShifted: shifted[pair]?.[k]?.n ?? 0 }]));
  }
  // per-point CDC proof → stations.json
  const proof = cdcPointProof(stations, arch, fromMs, toMs);
  const changed = [];
  for (const [id, pr] of Object.entries(proof)) {
    const e = stations.points[id].cdc;
    e.proof = { ...pr, window: `${vFrom} … ${vTo}`, at: new Date().toISOString() };
    const before = e.status;
    if (pr.pass === false) { e.status = 'proofFailed'; e.reason = `Ueberlappungsbeweis nicht bestanden (n ${pr.n}, |Δt| ≤ 0,1 K: ${pr.tWithin01})`; }
    else if (pr.pass === true && ['needsProof', 'proofFailed'].includes(before)) { e.status = before === 'needsProof' ? 'provenByOverlap' : (e.distKm <= CDC_MAX_KM ? 'mapped' : 'provenByOverlap'); delete e.reason; }
    if (e.status !== before) changed.push(`${id} ${before}→${e.status}`);
  }
  // klima-v2 vs TAWES on the TAWES window (the proof for the klima station mapping and the Magnus td)
  const kMonths = monthsBetween(dayStartMs(args.from || '2026-08-01'), dayStartMs(args.to || today)).filter((m) => monthStartMs(m) >= Date.parse('2026-07-01T00:00:00Z'));
  await phaseTawes(stations, kMonths, { ...opts, forceKlima: true });
  const kvt = compareTawesKlima(stations, kMonths);
  for (const [pid, s] of Object.entries(kvt.perStation)) stations.points[pid].tawes.klimaProof = { ...s, months: kMonths, at: new Date().toISOString() };
  stations.summary = summariseStations(stations);
  atomicWrite(STATIONS_P, `${JSON.stringify(stations, null, 1)}\n`);
  const cov = coverageTable(stations, args.from || '2026-08-01', args.to || today);
  const res = {
    kind: 'hindcast/truth-overlap', createdAt: new Date().toISOString(), producer: PRODUCER,
    window: { from: vFrom, to: vTo, note: 'Stempel im Fenster, Archiv je (Punkt, Netz, Stempel) dedupliziert — der spaetere Slot gewinnt' },
    archive: { root: ARCHIVE_ROOT, slots: arch.slots, dedupe: arch.dedupe },
    hindcast: { days: hind.days },
    comparison: main,
    negativeControl: { note: 'Hindcast-Stempel um +1 h verschoben (Archiv s gegen Hindcast s − 1 h)', byPair: negative },
    cdcPointProof: { rule: 'n_t ≥ 24 und Anteil |Δt| ≤ 0,1 K ≥ 0,8', changedStatus: changed, byPoint: proof },
    klimaVsTawes: { months: kMonths, note: 'klima-v2-10min (zugeordnete Station, td = Magnus) gegen tawes-v1-10min, gleiche Stundenbildung', ...kvt },
    coverage: { window: `${args.from || '2026-08-01'} … ${args.to || today}`, byNetworkMonth: cov },
  };
  mkdirSync(VERIFY_DIR, { recursive: true });
  const out = join(VERIFY_DIR, `truth-overlap-${today}.json`);
  atomicWrite(out, `${JSON.stringify(res, null, 1)}\n`);
  note({ ev: 'verify', msg: `Beweis geschrieben: ${out}; Statuswechsel CDC: ${changed.length ? changed.join(', ') : 'keine'}` });
  return { out, res };
}

// ─── IGRA check against University of Wyoming ─────────────────────────────────
async function igraCheck(spec) {
  const [id, when] = spec.split('@');
  const ms = Date.parse(`${when}:00:00Z`);
  const f = join(IGRA_DIR, `${id}.json.gz`);
  const doc = readJsonGz(f);
  const snd = doc.soundings.find((s) => s.launchMs === ms);
  if (!snd) throw new Error(`IGRA ${id}: kein Aufstieg mit launchMs ${new Date(ms).toISOString()}`);
  const wmo = id.slice(-5);
  // src=FM35 = the alphanumeric TEMP message (what IGRA carries for the DACH stations: 1-m/s winds, 0.1-K dew-point
  // depression); src=BUFR/UNKNOWN returns the high-resolution BUFR profile, a different publication (measured 2026-09-19).
  const src = args['igra-src'] || 'FM35';
  const url = `https://weather.uwyo.edu/wsgi/sounding?datetime=${when.replace('T', '%20')}:00:00&id=${wmo}&src=${src}&type=TEXT:LIST`;
  const { buf } = await httpGet(url, { net: 'igra' });
  const html = buf.toString('latin1');
  const pre = /<PRE>([\s\S]*?)<\/PRE>/i.exec(html)?.[1] ?? '';
  const rows = pre.split('\n').filter((l) => /^\s*\d/.test(l)).map((l) => { const v = l.trim().split(/\s+/).map(Number); return { p: v[0], z: v[1], t: v[2], td: v[3], rh: v[4], drct: v[6], sped: v[7] }; });
  const std = [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100];
  const cmp = [];
  for (const P of std) {
    const a = snd.levels.find((l) => l.p === P && l.flags[0] === '1');
    const b = rows.find((r) => r.p === P);
    if (!a || !b) { cmp.push({ p: P, igra: !!a, uwyo: !!b }); continue; }
    const tdA = a.t != null && a.dpd != null ? +(a.t - a.dpd).toFixed(1) : null;
    cmp.push({ p: P, igra: { z: a.z, t: a.t, td: tdA, rh: a.rh, wdir: a.wdir, wspd: a.wspd }, uwyo: { z: b.z, t: b.t, td: b.td, rh: b.rh, wdir: b.drct, wspd: b.sped },
      equal: { z: a.z === b.z, t: a.t === b.t, td: tdA === b.td, wdir: a.wdir === b.drct, wspd: a.wspd === b.sped } });
  }
  // every IGRA level with a pressure and a temperature against the UWyo row at the same pressure (t and td only:
  // UWyo interpolates height and wind onto significant temperature levels, IGRA leaves them missing there)
  const all = { levels: 0, t: [0, 0], td: [0, 0], diffs: [] };
  for (const a of snd.levels) {
    if (a.p == null || a.t == null) continue;
    const b = rows.find((r) => r.p === a.p);
    if (!b) continue;
    all.levels++;
    const tdA = a.dpd != null ? +(a.t - a.dpd).toFixed(1) : null;
    all.t[0]++; if (a.t === b.t) all.t[1]++; else all.diffs.push({ p: a.p, k: 't', igra: a.t, uwyo: b.t });
    if (tdA != null && Number.isFinite(b.td)) { all.td[0]++; if (tdA === b.td) all.td[1]++; else all.diffs.push({ p: a.p, k: 'td', igra: tdA, uwyo: b.td }); }
  }
  const res = { kind: 'hindcast/igra-check', createdAt: new Date().toISOString(), station: id, launch: new Date(ms).toISOString(), igraFile: f, igraLevels: snd.levels.length, uwyoUrl: url, uwyoSource: src, uwyoLevels: rows.length, standardLevels: cmp,
    allPressureLevels: { compared: all.levels, tEqual: `${all.t[1]}/${all.t[0]}`, tdEqual: `${all.td[1]}/${all.td[0]}`, differences: all.diffs.slice(0, 20) },
    summary: { compared: cmp.filter((c) => c.equal).length, allEqual: cmp.filter((c) => c.equal).every((c) => Object.values(c.equal).every(Boolean)), fieldsEqual: ['z', 't', 'td', 'wdir', 'wspd'].map((k) => [k, cmp.filter((c) => c.equal?.[k]).length]), allLevels: { compared: all.levels, tEqual: all.t[1], tdEqual: all.td[1] } } };
  mkdirSync(VERIFY_DIR, { recursive: true });
  const out = join(VERIFY_DIR, `igra-check-${id}-${when.replace(/[:]/g, '')}.json`);
  atomicWrite(out, `${JSON.stringify(res, null, 1)}\n`);
  return { out, res };
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  const nets = String(args.networks || 'cdc,tawes,smn').split(',').filter(Boolean);
  const from = args.from || '2026-08-01', to = args.to || today;
  const opts = { limit: args.limit ? Number(args.limit) : undefined, rebuildHourly: !!args['rebuild-hourly'], rebuildDays: !!args['rebuild-days'], cdcWind: args['cdc-wind'] || 'synop', concurrency: args.concurrency ? Number(args.concurrency) : undefined };
  const products = cdcProducts(opts.cdcWind);
  RUN.log({ ev: 'start', args, from, to, nets, root: HINDCAST_ROOT });
  const summary = { kind: 'hindcast/truth-run', from, to, networks: nets, log: logFile };
  if (args['igra-check']) {
    const r = await igraCheck(String(args['igra-check']));
    summary.igraCheck = { out: r.out, ...r.res.summary };
  } else {
    const stations = await buildStations(products);
    summary.stations = stations.summary;
    let geo = null;
    if (!args.verify) {
      const fromMs = dayStartMs(from), toMs = Math.min(dayStartMs(to) + 23 * H, Date.now());
      const months = monthsBetween(fromMs, toMs);
      if (nets.includes('cdc')) await phaseCdc(stations, months, products, opts);
      if (nets.includes('tawes')) geo = await phaseTawes(stations, months, opts);
      if (nets.includes('smn')) await phaseSmn(stations, months, opts);
      if (!geo) { const tm = await geoMetadata('tawes-v1-10min'); geo = { tawesStart: tm.start_time, tawesEnd: tm.end_time }; }
      summary.days = assembleDays(stations, daysBetween(from, to), products, geo, opts);
      if (args.igra) {
        const list = await igraStationList();
        const res = [];
        for (const [id, name] of IGRA_STATIONS) {
          try { res.push(await igraStation(id, name, dayStartMs(from), dayStartMs(to) + DAY - 1, list)); note({ ev: 'igra', msg: `IGRA ${id} ${name}: ${res[res.length - 1].soundings} Aufstiege` }); } catch (e) { errors.push({ net: 'igra', key: id, error: String(e.message).slice(0, 300) }); }
        }
        summary.igra = { stations: res.length, soundings: res.reduce((n, r) => n + r.soundings, 0), levels: res.reduce((n, r) => n + r.levels, 0), byStation: Object.fromEntries(res.map((r) => [r.id, r.soundings])) };
      }
    } else {
      const r = await verify(stations, products, opts);
      summary.verify = r.out;
      summary.changedStatus = r.res.cdcPointProof.changedStatus;
    }
  }
  summary.net = Object.fromEntries(Object.entries(RUN.nets).map(([k, v]) => [k, { requests: v.requests, bytes: v.bytes, metaBytes: v.metaBytes, wireBytes: v.wireBytes, records: v.records, seconds: +(v.ms / 1000).toFixed(1), failures: v.failures, retries: v.retries, cacheHits: v.cacheHits }]));
  summary.errors = errors.length;
  summary.errorSample = errors.slice(0, 10);
  summary.seconds = +((Date.now() - t0) / 1000).toFixed(1);
  RUN.log({ ev: 'summary', ...summary, failureList: Object.fromEntries(Object.entries(RUN.nets).map(([k, v]) => [k, v.failureList.slice(0, 50)])), errors });
  console.log(JSON.stringify(summary));
}

main().catch((e) => { RUN.log({ ev: 'fatal', error: String(e.stack ?? e) }); console.error(e); process.exit(1); });
