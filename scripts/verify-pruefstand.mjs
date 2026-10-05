/**
 * verify:pruefstand — the guard of the Prüfstand (`audit/pruefstand-plan.md`, gates G-PS1 … G-PS3). Net-free and without
 * the large local data: everything here runs on the repo alone (the register block needs the local table store and is
 * skipped with a note where it is absent). The data gates — truth round trip, replay fidelity, A/A — are separate runs
 * (`wahrheit/rundlauf.mjs`, `treue.mjs`, `run.mjs --modus=abnahme`) whose results stand in the plan §14.
 *
 *   A  protocol P1: loads, hash stable, a manipulated copy is rejected, structural defects are named
 *   B  measures against the reference values of the Python package `scores` (deviation < 1e-9)
 *   C  statistics: Student t, AR(2) inflation, Benjamini–Hochberg, paired test, block bootstrap
 *   D  truth: ZIP reader with CRC, quality control on synthetic series, hourly reduction, step aggregates
 *   E  adapter contract with negative controls (wrong unit, non-monotone quantiles, wrong length)
 *   F  scorer on a synthetic case set: truth scores 0, point value = absolute error, identical cases per pair, gates
 *   G  report and scores byte-identical on a repeat; canonical hash independent of key order
 *   H  register: entries, model hashes, vault rule
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-pruefstand.mjs
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const TMP = mkdtempSync(join(tmpdir(), 'pruefstand-verify-'));
process.env.PRUEFSTAND_ROOT = TMP.replace(/\\/g, '/');
const C = await import('./pruefstand/lib/common.mjs');
const { loadProtocol, protocolDir, sealProtocol, tresorIssues, fitTouchesTresor } = await import('./pruefstand/lib/protokoll.mjs');
const M = await import('../src/pruefstand/metrics.ts');
const S = await import('../src/pruefstand/stats.ts');
const P = await import('../src/pruefstand/protokoll.ts');
const AD = await import('../src/pruefstand/adapter.ts');
const QC = await import('./pruefstand/wahrheit/qc.mjs');
const { unzip, crc32 } = await import('./pruefstand/lib/zip.mjs');
const { truthBlock } = await import('./pruefstand/lib/wahrheit.mjs');
const SC = await import('./pruefstand/lib/score.mjs');
const U = await import('./pruefstand/lib/urteil.mjs');
const { renderReport } = await import('./pruefstand/lib/bericht.mjs');

const checks = [];
const add = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const info = (line) => console.log(`      ${line}`);
const close = (a, b, tol = 1e-9) => Math.abs(a - b) < tol || (a !== a && b !== b);
const maxDev = (xs, ys) => xs.reduce((m, x, i) => Math.max(m, Math.abs(x - ys[i])), 0);
const throws = (fn) => { try { fn(); return null; } catch (e) { return String(e.message); } };

// ── A: protocol ──────────────────────────────────────────────────────────────
const proto = loadProtocol();
{
  add('A1 Protokoll P1 lädt, Siegel stimmt, zweiter Ladevorgang liefert denselben Hash', proto.id === 'P1' && loadProtocol().hash === proto.hash, proto.hash.slice(0, 16));
  const copy = join(TMP, 'p1-kopie');
  cpSync(protocolDir(), copy, { recursive: true });
  add('A2 Gegenprobe: die unveränderte Kopie lädt', loadProtocol(copy).hash === proto.hash);
  const f = join(copy, 'protokoll.json'), doc = JSON.parse(readFileSync(f, 'utf8'));
  doc.gates.G2.delta = 0.01;
  writeFileSync(f, JSON.stringify(doc, null, 1));
  const msg = throws(() => loadProtocol(copy));
  add('A3 ein manipuliertes Protokoll (G2.delta 0 → 0,01) wird abgelehnt', msg && /passt nicht zum Siegel/.test(msg), msg?.slice(0, 90));
  const net = JSON.parse(readFileSync(join(copy, 'pruefnetz.json'), 'utf8'));
  const sB = net.stations.find((s) => s.role === 'B'); sB.role = 'A';
  writeFileSync(join(copy, 'pruefnetz.json'), JSON.stringify(net, null, 1));
  doc.gates.G2.delta = 0; writeFileSync(f, JSON.stringify(doc, null, 1));
  add('A4 eine umgehängte Rolle im Prüfnetz wird abgelehnt', /pruefnetz\.json passt nicht/.test(throws(() => loadProtocol(copy)) ?? ''));
  sealProtocol(copy);
  add('A5 Gegenprobe: neu versiegelt lädt die Kopie — mit ANDEREM Hash (das wäre P2)', loadProtocol(copy).hash !== proto.hash);
  const bad = { ...doc, quantiles: [0.1, 0.5, 0.8] };
  add('A6 Strukturprüfung nennt unsymmetrische Quantilstufen und eine Fensterlücke', P.validateProtocol(bad).some((e) => /symmetrisch/.test(e)) && P.validateProtocol({ ...doc, windows: [{ id: 'a', fromH: 1, toH: 6 }, { id: 'b', fromH: 8, toH: 24 }] }).some((e) => /lückenlos/.test(e)) && P.validateProtocol(doc).length === 0);
  const L23 = P.leadsOf(proto, 23), L0 = P.leadsOf(proto, 0);
  add('A7 Vorlauf-Raster: 48 Stunden, dann Gültigkeitsstunden ≡ 0 mod 3 bis 120 h, ≡ 0 mod 6 bis 336 h; Diagnose-Stunden getrennt',
    L0.raster.length === 48 + 24 + 36 && L23.raster.filter((h) => h <= 48).length === 48 && L23.raster.filter((h) => h > 48 && h <= 120).every((h) => (23 + h) % 24 % 3 === 0) && L23.raster.filter((h) => h > 120).every((h) => (23 + h) % 24 % 6 === 0) && L0.diagnostic.every((h) => h > 48 && h <= 72 && !L0.raster.includes(h)) && L0.all.length === L0.raster.length + L0.diagnostic.length,
    `Ausgabe 00 UTC: ${L0.raster.length} Raster + ${L0.diagnostic.length} Diagnose; 23 UTC: ${L23.raster.length} + ${L23.diagnostic.length}`);
  add('A8 Fenster und Schrittlänge: 6 h → 0-6, 7 h → 6-24, 49 h → 48-120 (3 h), 121 h → 120-240 (6 h), 337 h außerhalb', proto.windows[P.windowOf(proto, 6)].id === '0-6' && proto.windows[P.windowOf(proto, 7)].id === '6-24' && proto.windows[P.windowOf(proto, 49)].id === '48-120' && P.stepHoursOf(proto, 49) === 3 && P.stepHoursOf(proto, 48) === 1 && P.stepHoursOf(proto, 121) === 6 && P.windowOf(proto, 337) === -1);
  const b = proto.stations.filter((s) => s.role === 'B');
  add('A9 Prüfnetz: Rolle B nur an Stationen mit Wahrheit, Anteil nahe 25 %, jede Station mit Anker der Rolle A', b.every((s) => s.w1) && Math.abs(b.length / proto.scored.length - 0.25) < 0.02 && proto.stations.every((s) => !s.anchor || proto.stations.find((x) => x.id === s.anchor.id).role === 'A'), `${b.length} von ${proto.scored.length} mit Wahrheit (${proto.stations.length} im Netz)`);
  const ti = tresorIssues(proto.tresor);
  add('A10 Tresor: Ausgaben alle 7 Tage, Abstand innen eingehalten; Fit-Fenster-Regel', ti.length > 50 && ti.every((t, i) => !i || t - ti[i - 1] === 7 * C.DAY) && C.isoDay(ti[0]) === '2024-04-08' && ti.at(-1) + 14 * C.DAY <= C.dayMs(proto.tresor.to) - 7 * C.DAY && fitTouchesTresor(proto.tresor, '2025-08-20', '2026-01-01') && !fitTouchesTresor(proto.tresor, '2025-09-01', '2026-09-21'), `${ti.length} Ausgaben ${C.isoDay(ti[0])} … ${C.isoDay(ti.at(-1))}`);
}

// ── B: measures against `scores` ─────────────────────────────────────────────
{
  const fx = JSON.parse(readFileSync(new URL('./pruefstand/fixtures/metrics.scores.json', import.meta.url), 'utf8'));
  const taus = fx.taus;
  let dq = 0, dc = 0, dtw = 0;
  fx.quantile.q.forEach((q, i) => { const y = fx.quantile.y[i]; taus.forEach((t, k) => { dq = Math.max(dq, Math.abs(M.quantileScore(t, q[k], y) - fx.quantile.qs[i][k])); }); dc = Math.max(dc, Math.abs(M.crpsQ(taus, q, y) - fx.quantile.crpsQ[i])); dtw = Math.max(dtw, Math.abs(M.twCrpsQ(taus, q, y, fx.tw.thr) - fx.tw.twCrpsQ[i])); });
  add(`B1 Quantil-Score an ${fx.quantile.q.length * taus.length} Werten gegen scores ${fx.scores}`, dq < 1e-9, `größte Abweichung ${dq.toExponential(2)}`);
  add('B2 CRPS_Q = 2 · Mittel der Quantil-Scores', dc < 1e-9, `größte Abweichung ${dc.toExponential(2)}`);
  add('B3 twCRPS_Q (oberer Rand) gegen tw_quantile_score', dtw < 1e-9, `größte Abweichung ${dtw.toExponential(2)}`);
  const pt = fx.point.x.map((x, i) => M.crpsQ(taus, new Array(taus.length).fill(x), fx.point.y[i]));
  add('B4 Punktwert: CRPS_Q = absoluter Fehler; Mittel = MAE von scores', maxDev(pt, fx.point.abs) < 1e-9 && close(pt.reduce((a, b) => a + b, 0) / pt.length, fx.point.mae));
  add('B5 Gegenprobe: unsymmetrische Stufen (0,1/0,5/0,8) geben für einen Punktwert NICHT den absoluten Fehler', Math.abs(M.crpsQ([0.1, 0.5, 0.8], [2, 2, 2], 5) - 3) > 0.1);
  const bd = M.brierDecomposition(fx.brier.p, fx.brier.o, 10);
  // p = k/10 sits on a bin edge: use 20 bins shifted — the decomposition below groups identical forecasts exactly
  const groups = new Map(); fx.brier.p.forEach((p, i) => { const g = groups.get(p) ?? [0, 0]; g[0] += 1; g[1] += fx.brier.o[i]; groups.set(p, g); });
  const n = fx.brier.p.length, base = fx.brier.o.reduce((a, b) => a + b, 0) / n;
  let rel = 0, res = 0; for (const [p, [c, so]] of groups) { rel += c * (p - so / c) ** 2; res += c * (so / c - base) ** 2; }
  add('B6 Brier-Score und Zerlegung (Zuverlässigkeit − Auflösung + Unsicherheit) gegen scores', close(bd.brier, fx.brier.brier) && close(rel / n, fx.brier.reliability) && close(res / n, fx.brier.resolution) && close(bd.uncertainty, fx.brier.uncertainty) && close(rel / n - res / n + bd.uncertainty, fx.brier.brier), `Brier ${bd.brier.toFixed(6)}`);
  const iso = M.isotonicFit(fx.isotonic.p, fx.isotonic.o), iso2 = M.isotonicFit(fx.brier.p, fx.brier.o), corp = M.corpDecomposition(fx.brier.p, fx.brier.o);
  add('B7 isotone Regression (PAV) ohne und mit Bindungen gegen isotonic_fit; CORP: MCB und DSC', maxDev(Array.from(iso), fx.isotonic.fit) < 1e-9 && maxDev(Array.from(iso2), fx.brier.isotonic) < 1e-9 && close(corp.mcb, fx.brier.mcb) && close(corp.dsc, fx.brier.dsc), `MCB ${corp.mcb.toFixed(6)}, DSC ${corp.dsc.toFixed(6)}`);
  const gp = [...groups.keys()], go = gp.map((p) => groups.get(p)[1] / groups.get(p)[0]), gw = gp.map((p) => groups.get(p)[0]);
  const isoW = M.isotonicFit(gp, go, gw);
  add('B8 gewichtete PAV auf Gruppen = PAV auf den Einzelfällen', gp.every((p, i) => close(isoW[i], iso2[fx.brier.p.indexOf(p)])));
  add('B9 SEDI aus der Vierfeldertafel', close(M.sedi(fx.sedi.a, fx.sedi.b, fx.sedi.c, fx.sedi.d), fx.sedi.sedi), `SEDI ${fx.sedi.sedi.toFixed(6)}`);
  add('B10 Winkelfehler (0…180°)', close(fx.angle.fc.reduce((a, f, i) => a + M.angleError(f, fx.angle.ob[i]), 0) / fx.angle.fc.length, fx.angle.mae) && M.angleError(350, 10) === 20);
  add('B11 RPS = Summe der Brier-Scores der kumulierten Klassen', maxDev(fx.rps.cum.map((c, i) => M.rps(c, fx.rps.cat[i])), fx.rps.rps) < 1e-9);
  add('B12 empirisches Quantil (Typ 7) gegen numpy', maxDev(fx.sortedQuantile.taus.map((t) => M.sortedQuantile(fx.sortedQuantile.sample, t)), fx.sortedQuantile.q) < 1e-9);
  const dz = maxDev(fx.normalQuantile.p.map((p) => M.normalQuantile(p)), fx.normalQuantile.z);
  add('B13 Normalquantil (Näherung nach Acklam, nur für Intervalle und Nachweisgrenze)', dz < 5e-9, `größte Abweichung ${dz.toExponential(2)}`);
  // ── C: statistics
  add('C1 Student-t-Verteilung gegen scipy', maxDev(fx.studentT.t.map((t, i) => S.studentTCdf(t, fx.studentT.nu[i])), fx.studentT.cdf) < 1e-9);
  const ar = S.ar2Inflation(fx.ar2.d);
  add('C2 AR(2)-Inflation k aus Yule-Walker', close(ar.r1, fx.ar2.r1) && close(ar.r2, fx.ar2.r2) && close(ar.phi1, fx.ar2.phi1) && close(ar.phi2, fx.ar2.phi2) && close(ar.k, fx.ar2.k), `k ${ar.k.toFixed(4)}`);
  const t = S.pairedTest(fx.ar2.d);
  add('C3 gepaarter Test: Mittel, Streuung, n_eff = n/k², t mit Inflation', close(t.mean, fx.ar2.mean) && close(t.sd, fx.ar2.sd) && close(t.nEff, fx.ar2.d.length / fx.ar2.k ** 2) && close(t.t, fx.ar2.mean / (fx.ar2.k * fx.ar2.sd / Math.sqrt(fx.ar2.d.length))) && close(t.pLess + t.pGreater, 1));
  add('C4 Benjamini-Hochberg gegen scipy', maxDev(S.benjaminiHochberg(fx.bh.p), fx.bh.adjusted) < 1e-9);
  const rnd = S.lcg(7), iid = Array.from({ length: 60 }, () => rnd() - 0.5);
  const a1 = S.ar2Inflation(iid), few = S.ar2Inflation([1, 2, 3]);
  add('C5 k nie unter 1; unter 5 Werten k = 1 mit Vermerk', a1.k >= 1 && few.k === 1 && few.fallback === 'none');
  const days = iid.map((x) => [1 + x * 0.1, 1]);
  const b1 = S.blockBootstrap(days, (s) => 1 - s[0] / s[1], 300, 5), b2 = S.blockBootstrap(days, (s) => 1 - s[0] / s[1], 300, 5), b3 = S.blockBootstrap(days, (s) => 1 - s[0] / s[1], 300, 6);
  add('C6 Block-Bootstrap: gleicher Seed ⇒ gleiche Zahlen, anderer Seed ⇒ andere; Blocklänge ⌊1,5·n^(1/3)⌋+1', b1.lo === b2.lo && b1.hi === b2.hi && (b1.lo !== b3.lo || b1.hi !== b3.hi) && S.blockLength(21) === 5 && S.blockLength(70) === 7);
  const band = S.binomialBand(0.8, 100);
  add('C7 Binomialband um 80 % bei n_eff 100', close(band[0], 0.8 - 1.96 * 0.04) && close(band[1], 0.8 + 1.96 * 0.04));
}

// ── D: truth ─────────────────────────────────────────────────────────────────
{
  const body = Buffer.from('STATIONS_ID;MESS_DATUM;QN;TT_10;eor\n44;202610050000;3;7.5;eor\n', 'latin1');
  const def = deflateRawSync(body);
  const mk = (data, name, crc) => { const nm = Buffer.from(name); const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(body.length, 22); lh.writeUInt16LE(nm.length, 26); const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(body.length, 24); cd.writeUInt16LE(nm.length, 28); const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(1, 8); eo.writeUInt16LE(1, 10); eo.writeUInt32LE(46 + nm.length, 12); eo.writeUInt32LE(30 + nm.length + data.length, 16); return Buffer.concat([lh, nm, data, cd, nm, eo]); };
  const zip = mk(def, 'produkt_test.txt', crc32(body));
  const e = unzip(zip);
  add('D1 ZIP-Leser: Eintrag gelesen, CRC geprüft', e.length === 1 && e[0].name === 'produkt_test.txt' && e[0].data.equals(body));
  add('D2 Gegenprobe: falsche CRC im Verzeichnis ⇒ Abbruch', /crc/.test(throws(() => unzip(mk(def, 'produkt_test.txt', crc32(body) ^ 1))) ?? ''));
  const { emptySeries } = await import('./pruefstand/wahrheit/quellen.mjs');
  const t0 = Date.UTC(2026, 0, 1), ser = emptySeries(t0 - C.H, t0 + 30 * C.H);
  for (let i = 0; i < ser.n; i++) { ser.cols.t[i] = 5 + (i % 7) * 0.1; ser.cols.td[i] = 2; ser.cols.ff[i] = 3; ser.cols.dd[i] = 200; ser.cols.fx[i] = 4 + (i % 6); ser.cols.rr[i] = 0.1; }
  ser.cols.t[10] = 99; ser.cols.td[20] = 9; ser.cols.fx[6 + 6 * 3 - 2] = NaN;
  const rej = [];
  QC.qcFormal(ser, proto.qc, (ms, v, r, x) => rej.push(`${v}:${r}`));
  add('D3 formale Prüfung: Wert außerhalb des Bereichs und Taupunkt über der Temperatur verworfen, je mit Grund', rej.includes('t:range') && rej.includes('td:td>t') && rej.length === 2 && ser.cols.t[10] !== ser.cols.t[10], rej.join(', '));
  const hourly = QC.toHourly(ser, null, t0, 30);
  const at = (k, v) => hourly[k * QC.NV + QC.W1_VARS.indexOf(v)];
  add('D4 Stundenwerte: T, Wind am Stempel H; Böe = Maximum, Niederschlag = Summe der sechs 10-min-Werte in (H − 60 min, H]; fehlt einer, bleibt die Stunde leer', close(at(2, 't'), ser.cols.t[6 + 12], 1e-6) && close(at(2, 'gust'), 9, 1e-6) && close(at(2, 'rr'), 0.6, 1e-6) && at(3, 'gust') !== at(3, 'gust') && at(3, 'rr') === at(3, 'rr') && at(0, 'gust') === at(0, 'gust'));
  const hb = new Float32Array(48 * QC.NV).fill(NaN);
  for (let k = 0; k < 48; k++) { hb[k * QC.NV] = 10 + Math.sin(k); hb[k * QC.NV + 1] = 4; hb[k * QC.NV + 2] = k < 14 ? 3.3 : 2 + (k % 5); }
  hb[20 * QC.NV] = 40;
  const rj2 = [];
  QC.qcTemporal(hb, 48, t0, proto.qc, (ms, v, r) => rj2.push(`${v}:${r}`));
  add('D5 zeitliche Prüfung: Ausreißer (Sprung hin und zurück) und hängender Sensor verworfen; ein Dauerwert 0 beim Wind bleibt', rj2.filter((x) => x === 't:spike').length === 1 && rj2.filter((x) => x === 'td:stuck').length === 48 && rj2.filter((x) => x === 'ws:stuck').length === 14, `${rj2.length} Verwerfungen`);
  const calm = new Float32Array(30 * QC.NV).fill(NaN); for (let k = 0; k < 30; k++) calm[k * QC.NV + 2] = 0;
  const rj3 = []; QC.qcTemporal(calm, 30, t0, proto.qc, (ms, v, r) => rj3.push(r));
  add('D6 Gegenprobe: 30 Stunden Windstille sind kein hängender Sensor', rj3.length === 0);
  const sts = [0, 1, 2, 3, 4].map((i) => ({ lat: 47 + i * 0.05, lon: 8, elevM: 500 + i * 20 }));
  const nb = QC.spatialNeighbours(sts, proto.qc), blocks = sts.map((s, i) => { const b = new Float32Array(QC.NV).fill(NaN); b[0] = i === 2 ? 30 : 10 - 0.0065 * (s.elevM - 500); return b; });
  const rj4 = []; QC.qcSpatialHour(blocks, 0, nb, proto.qc, (s, v, r) => rj4.push(`${s}:${r}`));
  add('D7 räumliche Prüfung: nur der grobe Ausreißer fällt, die höhenbereinigten Nachbarn bleiben', rj4.length === 1 && rj4[0] === '2:spatial' && blocks[1][0] === blocks[1][0]);
  // step aggregates of the truth block
  const fake = { nSt: 1, at: (s, ms, v) => { const h = (ms - t0) / C.H; if (h === 100) return NaN; return v === 4 ? h % 10 : v === 5 ? 0.6 : 20 + h; } };
  const one = { ...proto, scored: [proto.scored[0]] };
  const tb = truthBlock(fake, one, t0, [1, 51, 102, 126]);
  add('D8 Wahrheitsblock: Böe = Maximum, Niederschlag = mittlere Rate über den Schritt (1/3/6 h); ein fehlender Stundenwert leert den Schritt', close(tb[0 * 7 + 3], 1) && close(tb[1 * 7 + 3], 9) && close(tb[1 * 7 + 4], 0.6, 1e-6) && tb[2 * 7 + 3] !== tb[2 * 7 + 3] && tb[2 * 7 + 4] !== tb[2 * 7 + 4] && close(tb[3 * 7 + 3], 6) && close(tb[3 * 7 + 0], 146));
}

// ── E: adapter contract ──────────────────────────────────────────────────────
const nq = proto.quantiles.length, CH = AD.channelsOf(nq);
function mkBlock(nSt, leads, fill) { const d = new Float32Array(nSt * leads.length * CH).fill(NaN); for (let i = 0; i < nSt * leads.length; i++) fill(d, i * CH, i); return { nStations: nSt, leads, nq, data: d }; }
const goodFill = (d, o) => { const base = { t: 10, td: 5, ws: 4, gust: 8, precip: 0, clct: 50 }; P.QUANTITY_VARS.forEach((v, vi) => { for (let k = 0; k < nq; k++) d[o + vi * nq + k] = Math.max(0, base[v] + (k - 9) * (v === 'precip' ? 0.02 : 0.2)); }); d[o + 6 * nq] = 0.2; d[o + 6 * nq + 1] = 180; };
{
  const ok = AD.checkBlock(mkBlock(2, [1, 2, 3], goodFill), nq);
  add('E1 ein gültiger Block besteht den Vertragstest', ok.defects.length === 0 && ok.filled === 2 * 3 * 6);
  const kelvin = AD.checkBlock(mkBlock(2, [1, 2, 3], (d, o, i) => { goodFill(d, o); if (i === 4) for (let k = 0; k < nq; k++) d[o + k] += 273.15; }), nq);
  add('E2 falsche Einheit (Temperatur in Kelvin) ⇒ abgelehnt mit Meldung', kelvin.defects.some((x) => /falsche Einheit/.test(x)) && kelvin.outOfRange === nq, kelvin.defects[0]);
  const mono = AD.checkBlock(mkBlock(2, [1, 2, 3], (d, o, i) => { goodFill(d, o); if (i === 1) d[o + 2 * nq + 5] = -0.0 + d[o + 2 * nq + 3] - 1; }), nq);
  add('E3 nicht monotone Quantile ⇒ abgelehnt mit Meldung', mono.defects.some((x) => /nicht monoton/.test(x)) && mono.nonMonotone >= 1, mono.defects[0]);
  const b = mkBlock(2, [1, 2, 3], goodFill);
  add('E4 falsche Blocklänge und fremder Quantilsatz ⇒ abgelehnt', AD.checkBlock({ ...b, data: b.data.subarray(0, 100) }, nq).defects.length === 1 && AD.checkBlock({ ...b, nq: 7 }, nq).defects.length >= 1);
  add('E5 pWet außerhalb 0…1 und teilweise leerer Quantilsatz ⇒ abgelehnt', AD.checkBlock(mkBlock(1, [1], (d, o) => { goodFill(d, o); d[o + 6 * nq] = 1.4; }), nq).defects.length === 1 && AD.checkBlock(mkBlock(1, [1], (d, o) => { goodFill(d, o); d[o + 3] = NaN; }), nq).defects.some((x) => /teilweise leer/.test(x)));
}

// ── F: scorer on a synthetic set ─────────────────────────────────────────────
let synthetic = null;
{
  const stations = proto.scored, nSt = stations.length;
  const days = Array.from({ length: 8 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
  const issues = days.map((day) => ({ source: 'archiv', day, issueMs: C.dayMs(day) + 23 * C.H, sha256: `fixture-${day}`, path: '' }));
  const rnd = S.lcg(11);
  const w1 = { nSt, manifest: { stationsHash: 'fixture' }, reif: () => true, at: (s, ms, v) => { const h = ms / C.H; const x = Math.sin(h / 7 + s) * 3; return v === 0 ? 8 + x : v === 1 ? 3 + x : v === 2 ? 3 + Math.abs(x) : v === 3 ? (h * 13 + s * 7) % 360 : v === 4 ? 6 + Math.abs(x) : v === 5 ? (Math.floor(h + s) % 5 === 0 ? 0.6 : 0) : stations[s].land === 'DE' ? 50 + 10 * x : NaN; } };
  const truthCache = new Map();
  const TV = P.TRUTH_VARS.length;
  const fromTruth = (shift, spread, drop) => ({ nq, data: null, make(issue, ctx) { const L = ctx.leads.length, d = new Float32Array(nSt * L * CH).fill(NaN); for (let i = 0; i < nSt * L; i++) { if (drop && i % drop === 0) continue; for (let v = 0; v < 6; v++) { const y = ctx.truth[i * TV + v]; if (y !== y) continue; const e = shift * (rnd() - 0.5) * 2; for (let k = 0; k < nq; k++) d[i * CH + v * nq + k] = Math.max(v >= 2 ? 0 : -99, y + e + spread * M.normalQuantile(proto.quantiles[k])); } const pr = ctx.truth[i * TV + 4]; d[i * CH + 6 * nq] = pr !== pr ? NaN : pr >= 0.1 ? 0.8 : 0.1; d[i * CH + 6 * nq + 1] = ctx.truth[i * TV + 6]; } return { nq, data: d }; } });
  const mk = (id, spec) => ({ id, block: (issue, ctx) => { const k = `${id}|${issue.day}`; if (!truthCache.has(k)) truthCache.set(k, spec.make(issue, ctx)); return truthCache.get(k); } });
  const truthProv = { id: 'test-wahrheit', block: (issue, ctx) => { const L = ctx.leads.length, c1 = AD.channelsOf(1), d = new Float32Array(nSt * L * c1).fill(NaN); for (let i = 0; i < nSt * L; i++) { for (let v = 0; v < 6; v++) d[i * c1 + v] = ctx.truth[i * TV + v]; const pr = ctx.truth[i * TV + 4]; d[i * c1 + 6] = pr >= 0.1 ? 1 : 0; d[i * c1 + 7] = ctx.truth[i * TV + 6]; } return { nq: 1, data: d }; } };
  const offProv = { id: 'test-punkt', block: (issue, ctx) => { const b = truthProv.block(issue, ctx), d = new Float32Array(b.data); for (let i = 0; i < d.length; i += 8) d[i] += 1.5; return { nq: 1, data: d }; } };
  const providers = [mk('gut', fromTruth(1, 1.2, 0)), mk('schlecht', fromTruth(4, 1.2, 0)), mk('luecke', fromTruth(1, 1.2, 3)), mk('eng', fromTruth(1, 0.3, 0)), truthProv, offProv];
  const res = SC.scoreRun(proto, w1, issues, providers, [['schlecht', 'gut'], ['gut', 'gut'], ['luecke', 'gut'], ['eng', 'gut']], { special: ['gut'] });
  const cell = (id, v, w, land, role) => U.cellSummary(proto, res.models.get(id), SC.SCORE_VARS.indexOf(v), w, SC.LANDS.indexOf(land), SC.ROLES.indexOf(role));
  let maxT = 0; const tw = res.models.get('test-wahrheit'); for (let c = 0; c < tw.cells.length / SC.F.N; c++) maxT = Math.max(maxT, tw.cells[c * SC.F.N + SC.F.s]);
  add('F1 die Wahrheit als Version hat in jeder Zelle Score 0', maxT === 0 && tw.issues === 8);
  const pc = cell('test-punkt', 't', 0, 'alle', 'B');
  add('F2 ein Punktwert mit Versatz 1,5 K hat CRPS_Q = MAE = 1,5 und Bias +1,5', close(pc.score, 1.5, 1e-5) && close(pc.mae, 1.5, 1e-5) && close(pc.bias, 1.5, 1e-5));
  const g = cell('gut', 't', 1, 'alle', 'B'), e = cell('eng', 't', 1, 'alle', 'B');
  add('F3 Abdeckung q10–q90: breites Band deckt mehr als das zu enge; Anteile unter/über/innen summieren zu 1', g.cover > e.cover + 0.2 && close(g.cover + g.below + g.above, 1, 1e-4) && g.pit.length === 20 && close(g.pit.reduce((a, b) => a + b, 0), 1, 1e-3), `gut ${g.cover}, eng ${e.cover}`);
  const lp = U.pairCell(proto, res.pairs.get('luecke|gut'), 0, 1, 3, 1), gp = U.pairCell(proto, res.pairs.get('gut|gut'), 0, 1, 3, 1);
  add('F4 identische Fälle: fehlt einem Modell jeder dritte Fall, zählt das Paar nur die gemeinsamen', lp.n < gp.n && Math.abs(lp.n / gp.n - 2 / 3) < 0.02 && gp.skill === 0, `${lp.n} gegen ${gp.n} Fälle`);
  const card = U.pairCard(proto, res.pairs.get('schlecht|gut'), 1, { withDaily: true });
  const g2 = U.gateG2(proto, card), g2ok = U.gateG2(proto, U.pairCard(proto, res.pairs.get('gut|gut'), 1));
  add('F5 G2: das verrauschte Modell ist in Kernzellen signifikant schlechter (rot); ein Modell gegen sich selbst ist grün', g2.status === 'rot' && g2.worse.length > 0 && g2ok.status === 'grün' && g2ok.worse.length === 0, `${g2.worse.length} von ${g2.tested} Zellen`);
  const g3 = U.gateG3(proto, res.models.get('eng'), res.models.get('gut')), g3self = U.gateG3(proto, res.models.get('gut'), res.models.get('gut'));
  add('F6 G3: zu enge Bänder sind rot; der Champion gegen sich selbst ist nie rot', g3.status === 'rot' && g3self.rows.every((x) => !x.red));
  const ix = U.indexOfPair(proto, res.pairs.get('schlecht|gut'), 1), ix0 = U.indexOfPair(proto, res.pairs.get('gut|gut'), 1);
  add('F7 Index: schlechter als die Referenz ⇒ negativ und signifikant; gegen sich selbst exakt 0', ix.value < 0 && ix.test.pWorse < 0.05 && ix0.value === 0, `Index ${ix.value}`);
  const wet = U.wetSummary(proto, res.models.get('gut'), 0, 1);
  add('F8 Brier-Zerlegung im Scorer: Zuverlässigkeit − Auflösung + Unsicherheit = Brier der Klassen; MCB ≥ 0', close(wet.reliability - wet.resolution + wet.uncertainty, wet.brierBinned, 1e-5) && wet.mcb >= -1e-9);
  add('F9 Kern und Neben: Böe ist nur bis 48 h Kernzelle, Bewölkung und Windrichtung sind Nebenzellen', SC.isKern(proto, 3, 2) && !SC.isKern(proto, 3, 3) && !SC.isKern(proto, 5, 0) && !SC.isKern(proto, 7, 0) && SC.isKern(proto, 6, 5) && U.kernCells(proto).length === (5 * 6 + 3) * 3);
  const ph = U.newPhysics(); U.physicsOfBlock(proto, providers[0].block(issues[0], { leads: P.leadsOf(proto, 23).all, truth: null }), ph);
  const phBad = U.newPhysics(); const bb = mkBlock(1, [1], (d, o) => { goodFill(d, o); for (let k = 0; k < nq; k++) d[o + nq + k] = 20; }); U.physicsOfBlock(proto, bb, phBad);
  add('F10 Physik: Taupunkt-Median über Temperatur-Median wird gezählt', phBad.tdAboveT === 1 && ph.tdN > 0 && ph.tdAboveT === 0);
  synthetic = { res, issues };
}

// ── G: byte identity ─────────────────────────────────────────────────────────
{
  add('G1 kanonischer Hash hängt nicht von der Schlüsselreihenfolge ab, wohl aber vom Wert', C.hashOf({ a: 1, b: [1, 2, { x: 1, y: 2 }] }) === C.hashOf({ b: [1, 2, { y: 2, x: 1 }], a: 1 }) && C.hashOf({ a: 1 }) !== C.hashOf({ a: 2 }));
  const blk = new Float32Array([1, NaN, 3.5]);
  const f = C.p(TMP, 'x.f32'), s1 = C.writeBlock(f, { kind: 't', shape: [3] }, blk), rd = C.readBlock(f), s2 = C.writeBlock(f, { kind: 't', shape: [3] }, blk);
  add('G2 Blockdatei: Rundweg exakt (auch NaN), zweimal geschrieben gleicher Hash', s1 === s2 && rd.sha256 === s1 && rd.data[0] === 1 && rd.data[1] !== rd.data[1] && rd.data[2] === 3.5);
  const { summarizeSet } = await import('./pruefstand/lib/lauf.mjs').catch((e) => ({ summarizeSet: null, err: e }));
  if (summarizeSet) {
    const mkScores = () => { const set = summarizeSet(proto, synthetic.res, { cand: 'schlecht', champ: 'gut' }); return { schema: 1, title: 'Fixture', mode: 'voll', protocol: { id: proto.id, hash: proto.hash }, truth: { stand: 'W1', hash: 'fixture' }, windows: proto.windows.map((w) => w.id), candidate: { id: 'schlecht', name: 'schlecht', commit: 'abcdef0', modelHash: 'm'.repeat(20), freeze: '2026-01-01' }, champion: { id: 'gut', name: 'gut', commit: 'abcdef0', modelHash: 'n'.repeat(20) }, versions: ['gut', 'schlecht'], references: [], verdict: { label: 'Volltest', sentence: 'Fixture' }, gates: { G1: { status: 'nicht nachweisbar', why: 'Fixture' }, G2: { status: set.G2.status, detail: '' }, G3: { status: set.G3.status, detail: '' }, G4: { status: 'grün', checks: [] } }, warnings: [], selfcheck: null, sets: { entwicklung: { label: 'Fixture', ...set } }, ranking: {}, notes: [] }; };
    const a = mkScores(), b = mkScores();
    const ha = C.sha256(JSON.stringify(a)), hb = C.sha256(JSON.stringify(b)), ra = renderReport(a, proto.net), rb = renderReport(b, proto.net);
    add('G3 scores und Bericht aus denselben Akkumulatoren sind byte-gleich; der Bericht nennt das Urteil in der ersten Zeile', ha === hb && ra === rb && ra.indexOf('class="verdict"') < 2600 && !/NaN|undefined/.test(ra), `${ra.length} Zeichen`);
  } else add('G3 scores und Bericht byte-gleich', false, 'lauf.mjs nicht ladbar');
}

// ── H: register ──────────────────────────────────────────────────────────────
{
  const dir = C.p(C.PS_DIR, 'register');
  const files = readdirSync(dir).filter((f) => /^fusion-.*\.json$/.test(f));
  const regs = files.map((f) => JSON.parse(readFileSync(C.p(dir, f), 'utf8')));
  add('H1 Register: Einträge mit Commit (40 Stellen), Freeze, Optionen, Tabellen-Hashes; genau ein Champion', regs.length >= 5 && regs.every((r) => /^[0-9a-f]{40}$/.test(r.commit) && /^\d{4}-\d{2}-\d{2}$/.test(r.freeze) && r.options?.learned === true && Object.values(r.tables).every((t) => t === null || /^[0-9a-f]{64}$/.test(t.sha256))) && regs.filter((r) => r.status === 'champion').length === 1, regs.map((r) => `${r.id}:${r.status}`).join(' '));
  add('H2 keine Bestandsversion hat am Hindcast Tage im Tresor gesehen; ein Fit-Fenster im Tresor würde als kontaminiert erkannt', regs.every((r) => r.tresor.contaminated === false) && regs.every((r) => Object.values(r.fit).every((w) => w.source !== 'hindcast' || !fitTouchesTresor(proto.tresor, w.from, w.to))) && fitTouchesTresor(proto.tresor, '2024-01-01', '2024-05-01'));
  add('H3 die Modell-Hashes der Versionen sind paarweise verschieden (andere Optionen oder Tabellen ⇒ anderes Modell)', new Set(regs.map((r) => r.modelHash)).size === regs.length);
  const tables = 'C:/dev/buscosun-pruefstand/tabellen';
  if (existsSync(tables) && existsSync('C:/dev/buscosun-hindcast/features/points.v1.json')) {
    const bad = [];
    for (const r of regs) for (const [k, t] of Object.entries(r.tables)) if (t && C.sha256(readFileSync(C.p(tables, t.file))) !== t.sha256) bad.push(`${r.id}/${k}`);
    add('H4 lokaler Tabellenspeicher: jede Datei hat den sha256 des Registers', bad.length === 0, bad.join(', '));
  } else info('H4 übersprungen: der lokale Tabellenspeicher (C:/dev/buscosun-pruefstand/tabellen) liegt hier nicht');
}

rmSync(TMP, { recursive: true, force: true });
const passed = checks.filter((c) => c.ok).length;
console.log(`\nverify:pruefstand — ${passed}/${checks.length} · Protokoll ${proto.id} ${proto.hash.slice(0, 12)}`);
process.exit(passed === checks.length ? 0 : 1);
