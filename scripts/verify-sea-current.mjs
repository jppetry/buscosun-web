#!/usr/bin/env node
/**
 * verify:sea-current — phase ST, surface current at the spot and "Wind gegen Strom" on /seewetter
 * (audit/seewetter-stroemung.md). No network, no browser.
 *
 * Fixtures `scripts/lib/fixtures/sea/current/` (recorded 18.11.2026 with `scripts/sea/spike/current-record-fixtures.mjs`):
 *   run/Current_{db,wb}_2026111800_00.grb2   BYTE-EXACT cuts of two real BSH day files (the four messages of 00:45 and
 *                                             01:00 UTC each; offset, length and sha256 of the source in the manifest)
 *   reference-eccodes.json                    the same messages decoded by ecCodes — an independent decoder
 *   series.json, doc.json                     15-min u/v of the whole real run at six cells; the product of the real run
 *   filebox-*.xml, ftp-*.txt                  the real listings of both ways to the files
 *
 *   A  fixtures are what was recorded (sha256, length; negative control)
 *   B  reader: messages, sections, JPEG 2000 against ecCodes value for value; refusals; negative controls
 *   C  contract: u/v → "sets towards", zero rule, value locks, slack water, opposition rule incl. the wrap over north
 *   D  producer: listings, run choice, the real cut through the whole producer, a synthetic run (dry cell, spot without
 *      a cell, missing run, late run, unreadable run, fallback to FTP, kill switch, retention), archive
 *   E  page without a browser: what is shown for an hour — and "keine Daten" instead of an old or invented value
 *   F  source text: source note, model note, no "sicher", workflow step, no switch, classes untouched by the hint
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import * as C from '../src/sea/seaCurrent.ts';
import { SEA_MODELS, SEA_CURRENT_VARS, SEA_CURRENT_ORIGIN, SEA_CURRENT_LIMITS, currentSeriesProblems, seaCurrentPath, seaCurrentFieldPath, mergeSpotCatalogs } from '../src/sea/seaContract.ts';
import { loadCurrent } from '../src/sea/seaClient.ts';
import { bshMessages, bshHead, bshField, BshGribError } from './sea/bshGrib.mjs';
import { decodeJ2k, j2kHeader, Jp2kError } from './sea/jp2k.mjs';
import { parseFilebox, parseFtp, pickRun, readRun, buildCurrent, pruneCurrent, dirSource, ftpSource, fileboxSource } from './sea/sea-current.mjs';
import { archiveSea } from './sea/sea-archive.mjs';
import { readStatus } from './sea/sea-derive.mjs';
import { decodePng } from './lib/png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIX = join(HERE, 'lib', 'fixtures', 'sea');
const FX = join(FIX, 'current');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
const bytes = (f) => readFileSync(join(FX, f));
const J = (f) => JSON.parse(bytes(f).toString('utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const H = 3_600_000, M15 = 15 * 60_000;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const throwsA = (fn, cls, re = /./) => { try { fn(); return false; } catch (e) { return e instanceof cls && re.test(e.message); } };
const rejects = async (fn, re = /./) => { try { await fn(); return false; } catch (e) { return re.test(String(e?.message ?? e)); } };

const MAN = J('manifest.json'), REF = J('reference-eccodes.json'), SERIES = J('series.json'), DOC = J('doc.json'), REQ = J('reference-request.json');
const RUN = '2026111800', RUN_MS = Date.parse('2026-11-18T00:00:00Z');
const CAT = mergeSpotCatalogs(JSON.parse(readFileSync(join(FIX, 'static', 'spots.json'), 'utf8')).spots, JSON.parse(readFileSync(join(FIX, 'dk', 'spots-dk.json'), 'utf8')).spots);
const CUT = { db: new Uint8Array(bytes('run/Current_db_2026111800_00.grb2')), wb: new Uint8Array(bytes('run/Current_wb_2026111800_00.grb2')) };

// --- A  fixtures -------------------------------------------------------------------------------------------------
{
  const names = Object.keys(MAN.files);
  const bad = names.filter((n) => !existsSync(join(FX, n)) || sha(bytes(n)) !== MAN.files[n].sha256 || bytes(n).length !== MAN.files[n].bytes);
  add('A1 jede Fixture ist byte-gleich mit ihrer Aufzeichnung (sha256, Länge)', names.length >= 10 && bad.length === 0, bad.join(', '));
  const onDisk = [...readdirSync(FX).filter((n) => n !== 'manifest.json' && n !== 'run'), ...readdirSync(join(FX, 'run')).map((n) => `run/${n}`)];
  add('A2 keine Fixture ohne Eintrag im Manifest', onDisk.every((n) => MAN.files[n]), onDisk.filter((n) => !MAN.files[n]).join(', '));
  const cuts = Object.entries(MAN.cuts);
  add('A3 die GRIB-Ausschnitte sind Schnitte aus echten BSH-Dateien: Quelle mit sha256, Versatz und Länge, vier Nachrichten',
    cuts.length === 2 && cuts.every(([n, c]) => /^[0-9a-f]{64}$/.test(c.fromSha256) && c.length === MAN.files[n].bytes && c.offset > 0 && c.messages === 4 && c.fromBytes > 10_000_000));
  const t = Buffer.from(CUT.db); t[1000] ^= 1;
  add('A4 Gegenprobe: ein gekipptes Bit fällt auf', sha(t) !== MAN.files['run/Current_db_2026111800_00.grb2'].sha256);
}

// --- B  reader ---------------------------------------------------------------------------------------------------
const fields = {};
{
  for (const pkg of ['db', 'wb']) fields[pkg] = bshMessages(CUT[pkg]).map((m) => bshField(CUT[pkg], m.offset, m.length));
  const all = [...fields.db, ...fields.wb];
  add('B1 je Ausschnitt vier Nachrichten, jede mit Endekennung', fields.db.length === 4 && fields.wb.length === 4);
  add('B2 Größe: Ozeanographie 10/1, u = 2 und v = 3, Fläche 160 in 1 m', all.every((f) => f.discipline === 10 && f.cat === 1 && f.surface === 160 && f.surfaceValue === 1) && fields.db.map((f) => f.num).join() === '2,3,2,3');
  add('B3 Gültigkeitszeit aus der Referenzzeit: 00:45 und 01:00 UTC des 18.11.', ['db', 'wb'].every((p) => fields[p].map((f) => new Date(f.t).toISOString().slice(0, 16)).join() === '2026-11-18T00:45,2026-11-18T00:45,2026-11-18T01:00,2026-11-18T01:00'));
  add('B4 Gitter = Vertrag (CWAM-Raster, S → N): db 240 × 387, wb 412 × 387', C.bshGridProblems('db', fields.db[0].grid).length === 0 && C.bshGridProblems('wb', fields.wb[0].grid).length === 0 && fields.db[0].grid.scanMode === 64);
  add('B5 Gegenprobe: ein fremdes Gitter wird benannt (anderes Paket, verschobene Ecke, N → S)',
    C.bshGridProblems('db', fields.wb[0].grid).length > 0 && C.bshGridProblems('db', { ...fields.db[0].grid, lo1: 6.2 }).length > 0 && C.bshGridProblems('db', { ...fields.db[0].grid, scanMode: 0 }).length > 0);
  add('B6 Packung: Template 5.40 (JPEG 2000), 12 bit, als verlustfrei gekennzeichnet', all.every((f) => f.pack.drt === 40 && f.pack.bits === 12 && f.pack.lossy === 0));
  const h0 = bshHead(CUT.db, 0, bshMessages(CUT.db)[0].length);
  const j = j2kHeader(CUT.db.subarray(h0.data[0], h0.data[1]));
  add('B7 Codestream wie gemessen: JasPer, 1 × 59 637, 5 Stufen, Codeblöcke 64, LRCP, eine Schicht', /JasPer/.test(j.comment) && j.width === 1 && j.height === 59637 && j.levels === 5 && j.cbw === 64 && j.progression === 0 && j.layers === 1);
  // against ecCodes, value for value at the cells of every spot, and the field statistics
  let cmp = 0, worst = 0, statBad = [];
  for (const pkg of ['db', 'wb']) {
    const ref = REF.files[`Current_${pkg}_${RUN}_00.grb2`];
    fields[pkg].forEach((f, m) => {
      const r = ref[m];
      let n = 0, min = Infinity, max = -Infinity, sum = 0;
      for (const v of f.values) if (!Number.isNaN(v)) { n++; if (v < min) min = v; if (v > max) max = v; sum += v; }
      if (n !== r.valid || f.values.length !== r.points || !near(min, r.min, 1e-6) || !near(max, r.max, 1e-6) || !near(sum, r.sum, 1e-2) || r.number !== f.num || r.time !== (new Date(f.t).getUTCHours() * 100 + new Date(f.t).getUTCMinutes())) statBad.push(`${pkg}#${m}`);
      for (const [k, v] of Object.entries(r.at)) { cmp++; const d = v == null ? (Number.isNaN(f.values[k]) ? 0 : 1) : Math.abs(f.values[k] - v); if (d > worst) worst = d; }
    });
  }
  add('B8 gegen ecCodes: Punktzahl, Wasserpunkte, Minimum, Maximum, Summe, Zeit und Größe jeder Nachricht gleich', statBad.length === 0 && /ecCodes/.test(REF.decoder), statBad.join(', '));
  add('B9 gegen ecCodes: der Wert an der Zelle jedes Spots, 256 Werte, größte Abweichung unter 1e-6 m/s', cmp === 4 * (REQ.db.length + REQ.wb.length) && cmp >= 250 && worst < 1e-6, `${cmp} Werte, max ${worst}`);
  // negative controls
  const data = h0.data, stream = CUT.db.slice(data[0], data[1]);
  const base = decodeJ2k(stream).samples;
  const broken = stream.slice(); broken[stream.length - 400] ^= 0x10;
  let differs = false;
  try { const s = decodeJ2k(broken).samples; differs = s.some((x, i) => x !== base[i]); } catch (e) { differs = e instanceof Jp2kError; }
  add('B10 Gegenprobe: ein gekipptes Bit im Codestream ändert Werte oder wird abgelehnt — nie dieselben Werte', differs);
  const lossy97 = stream.slice(); const cod = lossy97.findIndex((b, i) => b === 0xff && lossy97[i + 1] === 0x52); lossy97[cod + 13] = 0;
  add('B11 abgelehnt mit Grund: 9/7-Wavelet, abgeschnittener Strom, fremder Marker', throwsA(() => decodeJ2k(lossy97), Jp2kError, /9\/7/) && throwsA(() => decodeJ2k(stream.slice(0, 3000)), Jp2kError) && throwsA(() => decodeJ2k(Uint8Array.from([0xff, 0x4f, 0xff, 0x53, 0, 4, 0, 0])), Jp2kError, /COC/));
  const twoD = stream.slice(); const siz = twoD.findIndex((b, i) => b === 0xff && twoD[i + 1] === 0x51); twoD[siz + 9] = 2; twoD[siz + 25] = 2;
  add('B11b abgelehnt mit Grund: ein zweidimensionales Bild (der Leser ist nur an den eindimensionalen Strömen des BSH geprüft)', throwsA(() => decodeJ2k(twoD), Jp2kError, /zweidimensional/));
  add('B12 eine abgeschnittene Datei ist keine Datei: Nachricht unvollständig', throwsA(() => bshMessages(CUT.db.subarray(0, CUT.db.length - 10)), BshGribError, /unvollständig/) && throwsA(() => bshMessages(CUT.db.subarray(5)), BshGribError));
  const g1 = CUT.db.slice(); g1[7] = 1;
  add('B13 GRIB1 wird nie gelesen', throwsA(() => bshMessages(g1), BshGribError, /Edition 1/));
  add('B14 der gemeinsame Dekoder bleibt unberührt und der Producer benutzt ihn für diese Dateien nicht', !/5\.40|drt === 40|DRT 40|jp2k/.test(src('src/sources/gribDecode.ts').replace(/nur simple packing[^\n]*/g, '')) && !/from '[^']*gribDecode/.test(src('scripts/sea/sea-current.mjs') + src('scripts/sea/bshGrib.mjs') + src('scripts/sea/jp2k.mjs')));
}

// --- C  contract -------------------------------------------------------------------------------------------------
{
  const to = (u, v) => C.currentFlow(u, v)?.to;
  add('C1 u/v → „setzt nach“: Ost 90°, Nord 0°, West 270°, Süd 180°, Nordost 45°', near(to(1, 0), 90) && near(to(0, 1), 0) && near(to(-1, 0), 270) && near(to(0, -1), 180) && near(to(0.5, 0.5), 45));
  add('C2 Geschwindigkeit = Betrag; 3–4–5', near(C.currentFlow(0.3, 0.4).ms, 0.5) && near(C.currentKn(50), 0.5 * 1.943844));
  add('C3 Zelle ohne Strom: unter 1 mm/s kein Wert (auch nicht 0,0), ebenso ein Fehlwert', C.currentFlow(0.0004, -0.0003) === null && C.currentFlow(NaN, 0.2) === null && C.currentFlow(0.001, 0) !== null);
  add('C4 gespeichert in cm/s und ganzen Grad, 359,6° → 0°', JSON.stringify(C.encodeCurrent({ ms: 0.526, to: 359.6 })) === '{"cur":53,"curTo":0}' && JSON.stringify(C.encodeCurrent(null)) === '{"cur":null,"curTo":null}');
  add('C5 Vertrag: Spalten cur und curTo mit Herkunft bsh, Grenzen 0–500 cm/s und 0–359°', SEA_CURRENT_VARS.join() === 'cur,curTo' && SEA_CURRENT_ORIGIN.cur === 'bsh' && SEA_CURRENT_ORIGIN.curTo === 'bsh' && SEA_CURRENT_LIMITS.cur.join() === '0,500' && SEA_CURRENT_LIMITS.curTo.join() === '0,359');
  const ok = { cur: [10, null, 0], curTo: [200, null, 5] };
  add('C6 Werteprüfung der Reihe: gut ist gut', currentSeriesProblems(ok, 3).length === 0);
  add('C7 Gegenproben der Reihe: 501 cm/s, 360°, Kommazahl, falsche Länge, Geschwindigkeit ohne Richtung',
    [{ ...ok, cur: [501, null, 0] }, { ...ok, curTo: [360, null, 5] }, { ...ok, cur: [1.5, null, 0] }, { cur: [1], curTo: [1] }, { cur: [10, 5, 0], curTo: [200, null, 5] }].every((s) => currentSeriesProblems(s, 3).length > 0));
  // slack water on the real series
  const S = (id) => { const s = SERIES.spots[id]; return { t: s.u.map((_, i) => s.t0 + i * M15), u: s.u, v: s.v }; };
  const elbe = S('elbe-wittenbergen'), sl = C.slackTimes(elbe.t, elbe.u, elbe.v).map((t) => new Date(t).toISOString().slice(8, 16));
  add('C8 Stauwasser an der echten Reihe (Elbe bei Wittenbergen, 18.11.): 02:15, 10:15, 15:45, 22:00 UTC — von Hand an der Reihe abgelesen', sl.slice(0, 4).join() === '18T02:15,18T10:15,18T15:45,18T22:00', sl.slice(0, 6).join());
  const gaps = C.slackTimes(elbe.t, elbe.u, elbe.v).slice(1).map((t, i, a) => (t - (i ? a[i - 1] : C.slackTimes(elbe.t, elbe.u, elbe.v)[0])) / H);
  add('C9 … über den ganzen Lauf elf Stauwasser im Abstand von 5 bis 8,5 Stunden (halbtägige Gezeit)', gaps.length === 10 && gaps.every((g) => g >= 5 && g <= 8.5), gaps.map((g) => g.toFixed(1)).join(' '));
  add('C10 die Stelle mit 0,0 cm/s zwischen zwei Strömen (15:45) ist Stauwasser, kein Trockenfallen', (() => { const i = elbe.t.indexOf(Date.parse('2026-11-18T15:45:00Z')); return C.currentFlow(elbe.u[i], elbe.v[i]) === null && C.currentFlowAt(elbe.u, elbe.v, i) !== null; })());
  const every = Object.keys(SERIES.spots).every((id) => { const s = S(id); return C.slackTimes(s.t, s.u, s.v).every((t) => { const k = s.t.indexOf(t), a = Math.max(0, k - 8), b = Math.min(s.t.length - 1, k + 8); const sp = (i) => Math.hypot(s.u[i], s.v[i]); let min = true; for (let i = a; i <= b; i++) if (sp(i) < sp(k)) min = false; return min && s.u[a] * s.u[b] + s.v[a] * s.v[b] < 0; }); });
  add('C11 jedes gemeldete Stauwasser ist das Minimum seiner ± 2 Stunden und der Strom zeigt davor und danach in entgegengesetzte Halbebenen (alle sechs Reihen)', every);
  // synthetic
  const n = 200, tt = Array.from({ length: n }, (_, i) => i * M15), w = (2 * Math.PI) / (12.4 * H);
  const rect = { u: tt.map((t) => 0.6 * Math.sin(w * t)), v: tt.map((t) => 0.2 * Math.sin(w * t)) };
  const rs = C.slackTimes(tt, rect.u, rect.v);
  add('C12 künstlich, geradliniger Gezeitenstrom mit 12,4 h: Stauwasser alle 6,2 h (auf 15 min)', rs.length >= 7 && rs.slice(1).every((t, i) => Math.abs((t - rs[i]) / H - 6.2) <= 0.26), rs.map((t) => (t / H).toFixed(2)).join(' '));
  const rot = { u: tt.map((t) => 0.5 * Math.cos(w * t)), v: tt.map((t) => 0.5 * Math.sin(w * t)) };
  add('C13 ein drehender Strom, der nie schwächer wird, hat kein Stauwasser', C.slackTimes(tt, rot.u, rot.v).length === 0);
  const dryU = rect.u.map((x, i) => (Math.abs(Math.sin(w * tt[i])) < 0.5 ? 0.0002 : x)), dryV = rect.v.map((x, i) => (Math.abs(Math.sin(w * tt[i])) < 0.5 ? 0.0001 : x));
  add('C14 eine Zelle, die um das Kentern herum trockenfällt, hat kein Stauwasser', C.slackTimes(tt, dryU, dryV).length === 0);
  const weak = { u: rect.u.map((x) => x / 20), v: rect.v.map((x) => x / 20) };
  add('C15 ein Strom unter 0,05 m/s kentert für diese Seite nicht (Rauschen)', C.slackTimes(tt, weak.u, weak.v).length === 0);
  // opposition rule
  const wac = (windFromDeg, windKn, curToDeg, curKn) => C.windAgainstCurrent({ windFromDeg, windKn, curToDeg, curKn });
  add('C16 Wind gegen Strom über Nord hinweg: Wind aus 350°, Strom setzt nach 10° ⇒ 160°, Hinweis', wac(350, 15, 10, 1).against && near(wac(350, 15, 10, 1).angle, 160) && wac(10, 15, 350, 1).against && near(C.windCurrentAngle(10, 350), 160));
  add('C17 … und Wind MIT Strom über Nord hinweg: Wind aus 170° (weht nach 350°), Strom setzt nach 10° ⇒ 20°, kein Hinweis', !wac(170, 15, 10, 1).against && near(wac(170, 15, 10, 1).angle, 20) && wac(170, 15, 10, 1).why === 'angle');
  add('C18 Schwelle 120°: genau 120° ist kein Hinweis, 121° ist einer; 180° genau gegeneinander', !wac(0, 15, 60, 1).against && wac(0, 15, 59, 1).against && near(wac(90, 15, 90, 1).angle, 180) && near(C.windCurrentAngle(90, 270), 0));
  add('C19 beide Schwellen (gesetzt, benannt): Wind unter 10 kn, Strom unter 0,5 kn ⇒ kein Hinweis', wac(350, 9.9, 10, 1).why === 'weak-wind' && wac(350, 15, 10, 0.49).why === 'weak-current' && wac(350, 10, 10, 0.5).against && C.WAC_MIN_ANGLE_DEG === 120 && /10 kn/.test(C.WAC_RULE_NOTE) && /0,5 kn/.test(C.WAC_RULE_NOTE) && /120°/.test(C.WAC_RULE_NOTE));
  add('C20 ohne Wind oder ohne Strom kein Hinweis', wac(null, 15, 10, 1).why === 'no-wind' && wac(350, 15, null, null).why === 'no-current' && !wac(350, 15, null, 1).against);
  add('C21 der Hinweis ist ein Satz mit beiden Lesarten (Wind „aus“, Strom „setzt nach“) und sagt, dass er nichts ändert', /kommt aus NNW/.test(C.wacSentence('NNW', 15, 'N', 1, 160)) && /setzt nach N/.test(C.wacSentence('NNW', 15, 'N', 1, 160)) && /bleiben, wie sie sind/.test(C.WAC_NEUTRAL_NOTE) && /CWAM rechnet die Strömung bereits ein/.test(C.WAC_NEUTRAL_NOTE));
  // field pixels
  const px = new Uint8Array(8);
  C.encodeCurrentPixel(px, 0, { ms: 0.57, to: 271 }); C.encodeCurrentPixel(px, 4, null);
  const d = C.decodeCurrentPixel(px, 0);
  add('C22 Kartenfeld: Pixel hin und zurück (cm/s, Richtung auf ± 0,71°), kein Wert bleibt kein Wert, Kappung bei 254', d.cms === 57 && Math.abs(d.to - 271) <= 0.71 && C.decodeCurrentPixel(px, 4) === null && (() => { const p = new Uint8Array(4); C.encodeCurrentPixel(p, 0, { ms: 3.1, to: 0 }); return p[0] === 254; })());
  add('C23 Kartenfeld: 90 × 55 Zellen, jede siebte CWAM-Zelle, innerhalb des Gitters', C.SEA_CURRENT_FIELD.nx === 90 && C.SEA_CURRENT_FIELD.ny === 55 && (() => { const c = C.currentFieldCell(89, 54); return c.i === 626 && c.j === 381 && c.i < SEA_MODELS.cwam.grid.ni && c.j < SEA_MODELS.cwam.grid.nj; })());
  add('C24 Uhr: erwarteter Lauf ab Lauf + 4 h; 30 h alt = nicht mehr zeigen', C.currentExpectedRun(Date.parse('2026-11-18T03:59:00Z')) === '2026111712' && C.currentExpectedRun(Date.parse('2026-11-18T04:00:00Z')) === '2026111800' && C.currentExpectedRun(Date.parse('2026-11-18T16:00:00Z')) === '2026111812'
    && !C.seaCurrentDead(RUN, RUN_MS + 30 * H) && C.seaCurrentDead(RUN, RUN_MS + 30 * H + 1));
  add('C25 Paketindex: CWAM-Zelle ↔ Dateireihenfolge (Süden zuerst), außerhalb des Pakets −1', C.bshIndexOfCwam('db', 0, 386) === 0 && C.bshIndexOfCwam('db', 239, 0) === 386 * 240 + 239 && C.bshIndexOfCwam('db', 240, 5) === -1 && C.bshIndexOfCwam('wb', 218, 386) === 0 && C.bshIndexOfCwam('wb', 217, 5) === -1);
}

// --- D  producer -------------------------------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'sea-current-'));
const mkStore = (name) => { const d = join(tmp, name); mkdirSync(join(d, 'static'), { recursive: true }); cpSync(join(FIX, 'static', 'spots.json'), join(d, 'static', 'spots.json')); cpSync(join(FIX, 'dk', 'spots-dk.json'), join(d, 'static', 'spots-dk.json')); return d; };
try {
  // listings
  const box = { db: parseFilebox(bytes('filebox-nordsee.xml').toString('utf8')).filter((f) => /_db_/.test(f.name)), wb: parseFilebox(bytes('filebox-ostsee.xml').toString('utf8')).filter((f) => /_wb_/.test(f.name)) };
  const LIST_NOW = Date.parse('2026-11-18T07:00:00Z');
  const ftp = { db: parseFtp(bytes('ftp-nordsee.txt').toString('utf8'), LIST_NOW).filter((f) => /_db_/.test(f.name)), wb: parseFtp(bytes('ftp-ostsee.txt').toString('utf8'), LIST_NOW).filter((f) => /_wb_/.test(f.name)) };
  add('D1 echtes Filebox-Listing: je Paket drei Tagesdateien des Laufs 2026111800, nie .bz2, nie GRIB1', box.db.length === 3 && box.wb.length === 3 && [...box.db, ...box.wb].every((f) => /^Current_(db|wb)_2026111800_0[012]\.grb2$/.test(f.name)));
  add('D2 echtes FTP-Listing: dieselben Dateien mit denselben Größen; FTP steht 05:29 UTC, die Filebox 05:51 UTC', ftp.db.length === 3 && ftp.wb.length === 3 && ftp.db.every((f, i) => f.name === box.db[i].name && f.size === box.db[i].size) && new Date(ftp.db[0].mtimeMs).toISOString().slice(11, 16) === '05:29' && new Date(box.db[0].mtimeMs).toISOString().slice(11, 16) === '05:51');
  add('D3 Größe der ersten Datei wie gemessen: 12 004 493 B', box.db[0].size === 12004493 && MAN.cuts['run/Current_db_2026111800_00.grb2'].fromBytes === 12004493);
  const pick = pickRun(box, LIST_NOW);
  add('D4 Laufwahl: 2026111800 mit den Tagen 00, 01, 02', pick.run === RUN && pick.days.join() === '00,01,02' && pick.files.wb.length === 3);
  add('D5 ein Lauf, dessen jüngste Datei sich vor weniger als 5 min geändert hat, wird noch nicht gelesen', pickRun(box, Date.parse('2026-11-18T05:54:00Z')).run === null && /Ruhe/.test(pickRun(box, Date.parse('2026-11-18T05:54:00Z')).reason));
  add('D6 fehlt ein Paket oder eine Tagesdatei, ist der Lauf nicht vollständig', pickRun({ db: box.db, wb: [] }, LIST_NOW).run === null && pickRun({ db: box.db, wb: box.wb.slice(0, 2) }, LIST_NOW).run === null && pickRun({ db: [box.db[0], box.db[2]], wb: [box.wb[0], box.wb[2]] }, LIST_NOW).run === null && pickRun({ db: [], wb: [] }, LIST_NOW).run === null);
  const older = (l) => l.map((f) => ({ ...f, name: f.name.replace('2026111800', '2026111712') }));
  add('D7 liegen zwei Läufe im Verzeichnis und der neue ist unvollständig, zählt der ältere vollständige', pickRun({ db: [...older(box.db), ...box.db], wb: [...older(box.wb), box.wb[0]] }, LIST_NOW).run === '2026111712');

  // the real cut through the whole producer
  const cutSource = (over = {}) => ({ name: 'filebox', base: 'fixture', calls: { list: 0, get: 0 },
    async list(pkg) { this.calls.list++; if (over.listFails) throw new Error('HTTP 503'); return (over.listing ?? { db: [{ name: 'Current_db_2026111800_00.grb2', size: CUT.db.length, mtimeMs: LIST_NOW - H }], wb: [{ name: 'Current_wb_2026111800_00.grb2', size: CUT.wb.length, mtimeMs: LIST_NOW - H }] })[pkg]; },
    async get(pkg) { this.calls.get++; return over.bytes?.[pkg] ?? CUT[pkg]; } });
  const st1 = mkStore('cut'), s1 = cutSource();
  const r1 = await buildCurrent({ storeDir: st1, nowMs: LIST_NOW, sources: [s1] });
  const d1 = existsSync(join(st1, seaCurrentPath(RUN))) ? JSON.parse(readFileSync(join(st1, seaCurrentPath(RUN)), 'utf8')) : null;
  add('D8 echter Ausschnitt durch den ganzen Producer: Datei, Zeiger, Achse ab 01:00 UTC mit einer Stunde', r1.built && d1?.run === RUN && d1.t0 === RUN_MS + H && d1.hours === 1 && readStatus(st1).current?.path === seaCurrentPath(RUN) && C.currentPointerOf(readStatus(st1))?.run === RUN, JSON.stringify(r1).slice(0, 200));
  add('D9 … alle 64 Spots tragen eine Zelle, die Werteprüfung ist sauber, Quellenvermerk und Lizenz stehen in der Datei', d1 && Object.keys(d1.spots).length === 64 && d1.failed.length === 0 && C.seaCurrentProblems(d1).length === 0 && d1.credit === 'Strömung: Bundesamt für Seeschifffahrt und Hydrographie (BSH)' && d1.licence === 'CC BY 4.0' && d1.files.length === 2 && d1.files[0].sha256 === sha(CUT.db));
  // value at the spot = ecCodes at that cell, turned into speed and direction by the contract
  let same = 0, wrong = [];
  for (const [id, s] of Object.entries(d1?.spots ?? {})) {
    const ref = REF.files[`Current_${s.pkg}_${RUN}_00.grb2`], k = String(C.bshIndexOfCwam(s.pkg, s.cell[0], s.cell[1]));
    const u = ref[2].at[k], v = ref[3].at[k];
    if (u === undefined) continue;                 // the two-step cut chose another cell than the whole run
    same++;
    const e = C.encodeCurrent(C.currentFlow(u, v));
    if (e.cur !== s.cur[0] || e.curTo !== s.curTo[0]) wrong.push(id);
  }
  add('D10 Wert am Spot = ecCodes an derselben Zelle (u, v von 01:00 UTC → cm/s und „setzt nach“), mindestens 55 Spots', same >= 55 && wrong.length === 0, `${same} verglichen, falsch: ${wrong.join(', ')}`);
  const sameDoc = Object.entries(d1?.spots ?? {}).filter(([id, s]) => DOC.spots[id].cell.join() === s.cell.join());
  add('D11 … und gleich der ersten Stunde des ganzen echten Laufs an denselben Zellen', sameDoc.length >= 55 && sameDoc.every(([id, s]) => s.cur[0] === DOC.spots[id].cur[0] && s.curTo[0] === DOC.spots[id].curTo[0]));
  const png0 = existsSync(join(st1, seaCurrentFieldPath(RUN, 0))) ? decodePng(readFileSync(join(st1, seaCurrentFieldPath(RUN, 0)))) : null;
  const arrows = png0 ? C.currentArrows(png0.data) : null;
  add('D12 Kartenfeld: ein PNG 90 × 55 je Stunde, Pfeile nur über Wasser mit Strom ab 5 cm/s, Richtung 0–359', png0?.width === 90 && png0.height === 55 && arrows.features.length > 300 && arrows.features.length < 2500 && arrows.features.every((f) => f.properties.rot >= 0 && f.properties.rot < 360 && f.properties.kn >= 0.1 && [0, 1].includes(f.properties.lod)));
  // a pixel of the field against ecCodes-checked values: the thinned cell (x, y) is CWAM cell (3 + 7x, 3 + 7y), sampled
  const samp = (() => { let ok = 0, n = 0; for (let y = 0; y < 55; y += 3) for (let x = 0; x < 90; x += 3) { const c = C.currentFieldCell(x, y); for (const pkg of ['db', 'wb']) { const k = C.bshIndexOfCwam(pkg, c.i, c.j); if (k < 0 || Number.isNaN(fields[pkg][2].values[k])) continue; const f = C.currentFlow(fields[pkg][2].values[k], fields[pkg][3].values[k]); const p = C.decodeCurrentPixel(png0.data, (y * 90 + x) * 4); n++; if ((f == null) === (p == null) && (!f || (p.cms === Math.min(254, Math.round(f.ms * 100)) && Math.abs(((p.to - f.to + 540) % 360) - 180) <= 0.71))) ok++; break; } } return { ok, n }; })();
  add('D13 Kartenfeld: der Pixel ist die Zelle selbst (abgetastet, nicht gemittelt) — Stichprobe gegen das dekodierte Feld', png0 && samp.n > 80 && samp.ok === samp.n, `${samp.ok}/${samp.n}`);
  const r1b = await buildCurrent({ storeDir: st1, nowMs: LIST_NOW + 15 * 60_000, sources: [s1] });
  add('D14 zweiter Durchgang: nicht fällig, und das BSH wird gar nicht erst gefragt', !r1b.built && /neueste/.test(r1b.reason) && s1.calls.list === 2 && s1.calls.get === 2);

  // late and missing run
  const st2 = mkStore('missing'), sNone = cutSource({ listing: { db: [], wb: [] } });
  const r2 = await buildCurrent({ storeDir: st2, nowMs: LIST_NOW, sources: [sNone] });
  add('D15 fehlender Lauf: nichts gebaut, kein Fehler, Speicher ohne Strömung — die Seite hat dann „keine Daten“', !r2.built && /kein vollständiger Lauf/.test(r2.reason) && !existsSync(join(st2, 'current')) && C.currentPointerOf(readStatus(st2)) === null);
  const r2b = await buildCurrent({ storeDir: st1, nowMs: RUN_MS + 16 * H + 5 * 60_000, sources: [cutSource()] });
  add('D16 verspäteter Lauf: nach der Uhr läge 2026111812 da, beim BSH liegt noch 2026111800 ⇒ nichts Neues, nichts geschrieben', !r2b.built && /veröffentlicht ist 2026111800/.test(r2b.reason));
  const st3 = mkStore('old');
  const r3 = await buildCurrent({ storeDir: st3, nowMs: RUN_MS + 31 * H, sources: [cutSource()] });
  add('D17 ein Lauf, der schon älter als 30 h ist, wird nicht mehr veröffentlicht', !r3.built && /älter als 30/.test(r3.reason) && !existsSync(join(st3, 'current')));

  // unreadable run, tries, size
  const st4 = mkStore('broken');
  const bad = CUT.db.slice(); bad[bad.length - 2] = 0x38;
  const sBad = cutSource({ bytes: { db: bad } });
  const e1 = await rejects(() => buildCurrent({ storeDir: st4, nowMs: LIST_NOW, sources: [sBad] }), /Versuch 1\/3.*7777/);
  await rejects(() => buildCurrent({ storeDir: st4, nowMs: LIST_NOW + 900_000, sources: [sBad] }));
  await rejects(() => buildCurrent({ storeDir: st4, nowMs: LIST_NOW + 1_800_000, sources: [sBad] }));
  const gets = sBad.calls.get;
  const r4 = await buildCurrent({ storeDir: st4, nowMs: LIST_NOW + 2_700_000, sources: [sBad] });
  add('D18 unlesbarer Lauf: der Schritt endet rot mit Grund, nichts wird geschrieben, drei Versuche — dann wartet der Producer ohne Abruf', e1 && readStatus(st4).currentTry?.n === 3 && !r4.built && /aufgegeben/.test(r4.reason) && sBad.calls.get === gets && !existsSync(join(st4, seaCurrentPath(RUN))) && C.currentPointerOf(readStatus(st4)) === null);
  const st5 = mkStore('size');
  add('D19 eine Datei mit anderer Länge als im Verzeichnis wird nicht gelesen', await rejects(() => buildCurrent({ storeDir: st5, nowMs: LIST_NOW, sources: [cutSource({ bytes: { wb: CUT.wb.subarray(0, 1000) } })] }), /1000 B geladen/));
  // fallback to FTP, total failure, kill switch
  const st6 = mkStore('fallback'), sDown = cutSource({ listFails: true }), sFtp = { ...cutSource(), name: 'ftp' };
  const r6 = await buildCurrent({ storeDir: st6, nowMs: LIST_NOW, sources: [sDown, sFtp] });
  add('D20 antwortet die Filebox nicht, liest der Producer über FTP — und nennt den Weg in der Datei', r6.built && r6.via === 'ftp' && JSON.parse(readFileSync(join(st6, seaCurrentPath(RUN)), 'utf8')).via === 'ftp');
  const st7 = mkStore('down');
  add('D21 antwortet keiner der beiden Wege, endet der Schritt rot und der Speicher bleibt, wie er ist', await rejects(() => buildCurrent({ storeDir: st7, nowMs: LIST_NOW, sources: [cutSource({ listFails: true }), cutSource({ listFails: true })] }), /nicht lesbar/) && !existsSync(join(st7, 'current')));
  const sKill = cutSource();
  const r8 = await buildCurrent({ storeDir: mkStore('kill'), nowMs: LIST_NOW, sources: [sKill], killed: true });
  add('D22 Kill-Schalter: nichts gefragt, nichts geschrieben', !r8.built && sKill.calls.list === 0);
  add('D23 der FTP-Rückfall ruft curl mit dem FTP-Pfad des Pakets; die Filebox wird per PROPFIND gelistet', await (async () => {
    const seen = [];
    const f = ftpSource({ exec: async (a) => { seen.push(a.join(' ')); return bytes('ftp-nordsee.txt').toString('utf8'); }, nowMs: () => LIST_NOW });
    const l = await f.list('db');
    let method = null, url = null;
    const b = fileboxSource({ fetchImpl: async (u, o) => { method = o.method; url = u; return { status: 207, ok: true, text: async () => bytes('filebox-ostsee.xml').toString('utf8') }; } });
    const lb = await b.list('wb');
    return l.length === 3 && /ftp:\/\/ftp\.bsh\.de\/Stroemungsvorhersagen\/grib2\/Nordsee\/$/.test(seen[0]) && method === 'PROPFIND' && /filebox\.bsh\.de.*\/grib2\/Ostsee\/$/.test(url) && lb.length === 3;
  })());

  // synthetic run: controlled values on the contract's grids (template 5.0, bitmap)
  const g = SEA_MODELS.cwam.grid;
  const be = (n, v) => { const b = Buffer.alloc(n); if (n === 4) b.writeUInt32BE(v >>> 0); else if (n === 2) b.writeUInt16BE(v); else b[0] = v; return b; };
  const synth = (pkg, tMs, num, valueOf) => {
    const p = C.BSH_CURRENT_PACKAGES[pkg], ni = p.ni, nj = g.nj, cells = ni * nj, R = -4, E = -13;
    const bm = Buffer.alloc(Math.ceil(cells / 8)), vals = [];
    for (let r = 0; r < nj; r++) for (let c = 0; c < ni; c++) { const v = valueOf(c + p.col0, nj - 1 - r); if (v == null) continue; const k = r * ni + c; bm[k >> 3] |= 0x80 >> (k & 7); vals.push(Math.round((v - R) / 2 ** E)); }
    const data = Buffer.alloc(vals.length * 2); vals.forEach((x, i) => data.writeUInt16BE(x, i * 2));
    const d = new Date(tMs);
    const s1 = Buffer.concat([be(4, 21), be(1, 1), be(2, 0), be(2, 0), be(1, 4), be(1, 0), be(1, 1), be(2, d.getUTCFullYear()), be(1, d.getUTCMonth() + 1), be(1, d.getUTCDate()), be(1, d.getUTCHours()), be(1, d.getUTCMinutes()), be(1, 0), be(1, 0), be(1, 2)]);
    const s3 = Buffer.alloc(72); s3.writeUInt32BE(72, 0); s3[4] = 3; s3.writeUInt32BE(cells, 6); s3.writeUInt32BE(ni, 30); s3.writeUInt32BE(nj, 34);
    const deg = (x) => Math.round(x * 1e6);
    s3.writeUInt32BE(deg(g.lat2), 46); s3.writeUInt32BE(deg(g.lon1 + p.col0 * g.di), 50); s3[54] = 48; s3.writeUInt32BE(deg(g.lat1), 55); s3.writeUInt32BE(deg(g.lon1 + (p.col0 + ni - 1) * g.di), 59); s3.writeUInt32BE(deg(g.di), 63); s3.writeUInt32BE(deg(g.dj), 67); s3[71] = 64;
    const s4 = Buffer.alloc(34); s4.writeUInt32BE(34, 0); s4[4] = 4; s4[9] = 1; s4[10] = num; s4[22] = 160; s4.writeUInt32BE(1, 24); s4[28] = 255;
    const s5 = Buffer.alloc(21); s5.writeUInt32BE(21, 0); s5[4] = 5; s5.writeUInt32BE(vals.length, 5); s5.writeFloatBE(R, 11); s5.writeUInt16BE(0x8000 | -E, 15); s5[19] = 16;
    const s6 = Buffer.concat([be(4, 6 + bm.length), be(1, 6), be(1, 0), bm]), s7 = Buffer.concat([be(4, 5 + data.length), be(1, 7), data]);
    const body = Buffer.concat([s1, s3, s4, s5, s6, s7, Buffer.from('7777')]);
    const s0 = Buffer.alloc(16); s0.write('GRIB'); s0[6] = 10; s0[7] = 2; s0.writeBigUInt64BE(BigInt(16 + body.length), 8);
    return Buffer.concat([s0, body]);
  };
  const byId = Object.fromEntries(CAT.map((s) => [s.id, s]));
  const cellOf = (sp) => ({ i: Math.round((sp.lon - g.lon1) / g.di), j: Math.round((g.lat1 - sp.lat) / g.dj) });
  const kmTo = (sp, i, j) => C.currentDistKm(sp.lat, sp.lon, g.lat1 - j * g.dj, g.lon1 + i * g.di);
  const NDN = byId.norderney, HEL = byId.helgoland, HUS = byId.husum, SYL = byId['sylt-hoernum'];
  const nd = cellOf(NDN), hu = cellOf(HUS);
  const T0 = RUN_MS + M15, STEPS = 12;           // 00:15 … 03:00
  // u = 0.4, v = 0.3 everywhere (0.5 m/s towards 53.13°); Norderney's nearest cell never flows; no cell within 3 km of
  // Helgoland flows; Husum's nearest cell is without current 01:45–02:30; land = a block in the far north-west.
  const uv = (step) => (i, j) => {
    if (i < 6 && j < 6) return null;
    if (i === nd.i && j === nd.j) return [0, 0];
    if (kmTo(HEL, i, j) <= 3.6) return [0, 0];
    if (i === hu.i && j === hu.j && step >= 6 && step <= 9) return [0, 0];
    return [0.4, 0.3];
  };
  const dayFile = (pkg) => new Uint8Array(Buffer.concat(Array.from({ length: STEPS }, (_, s) => [synth(pkg, T0 + s * M15, 2, (i, j) => uv(s)(i, j)?.[0] ?? null), synth(pkg, T0 + s * M15, 3, (i, j) => uv(s)(i, j)?.[1] ?? null)]).flat()));
  const SYN = { db: dayFile('db'), wb: dayFile('wb') };
  const rr = readRun({ buffers: { db: [SYN.db], wb: [SYN.wb] }, spots: CAT });
  add('D24 künstlicher Lauf (einfache Packung 5.0, Bitmap): Achse 01:00–03:00 UTC, drei Stunden', rr.t0 === RUN_MS + H && rr.hours === 3 && rr.steps === 12 && rr.pngs.length === 3);
  const sy = rr.spots['sylt-hoernum'];
  add('D25 … Wert am Spot: 0,5 m/s ⇒ 50 cm/s, setzt nach 53° (u 0,4 / v 0,3), an der nächsten Zelle, Abstand benannt', sy && sy.cur.join() === '50,50,50' && sy.curTo.join() === '53,53,53' && sy.dry === 0 && near(sy.km, kmTo(SYL, sy.cell[0], sy.cell[1]), 0.006) && sy.km <= 1 && sy.slack.length === 0);
  const no = rr.spots.norderney;
  add('D26 trockene Zelle, immer: die allernächste Zelle führt nie Strom ⇒ die nächste MIT Strom wird genommen, ihr Abstand steht da', no && (no.cell[0] !== nd.i || no.cell[1] !== nd.j) && no.cur.join() === '50,50,50' && no.km > kmTo(NDN, nd.i, nd.j) && no.km <= 3);
  add('D27 keine Zelle mit Strom im Umkreis von 3 km: der Spot bekommt keinen Wert, sondern einen benannten Grund', !rr.spots.helgoland && /keine Zelle mit Strömung im Umkreis von 3 km/.test(rr.failed.find((f) => f.id === 'helgoland')?.error ?? ''));
  const hs = rr.spots.husum;
  add('D28 trockene Zelle, zeitweise: an der Stunde ohne Strom (02:00 UTC) steht kein Wert — weder 0 noch der Wert davor', hs && hs.cell[0] === hu.i && hs.cell[1] === hu.j && hs.cur.join() === '50,,50' && hs.curTo.join() === '53,,53' && near(hs.dry, 4 / 12, 0.001), JSON.stringify(hs));
  const land = rr.pngs.length ? decodePng(Buffer.from(rr.pngs[0])) : null;
  add('D29 Kartenfeld des künstlichen Laufs: 50 cm/s und 53° überall auf Wasser, Land und trockene Zellen ohne Pixel', land && (() => { let ok = true, some = 0; for (let k = 0; k < 90 * 55; k++) { const p = C.decodeCurrentPixel(land.data, k * 4); if (p) { some++; if (p.cms !== 50 || Math.abs(p.to - 53.13) > 0.71) ok = false; } } return ok && some > 4000; })());
  add('D30 Lücke in der Zeitachse, fehlende Komponente, verschiedene Achsen der Pakete: der Lauf wird abgelehnt',
    throwsA(() => readRun({ buffers: { db: [SYN.db.subarray(0, SYN.db.length / 12 * 4), SYN.db.subarray(SYN.db.length / 12 * 6)].map((b) => new Uint8Array(b)), wb: [SYN.wb] }, spots: CAT, field: false }), BshGribError, /lückenlos/)
    && throwsA(() => readRun({ buffers: { db: [new Uint8Array(SYN.db.subarray(0, SYN.db.length / 24))], wb: [SYN.wb] }, spots: CAT, field: false }), BshGribError, /nur einer der beiden Komponenten/)
    && throwsA(() => readRun({ buffers: { db: [SYN.db], wb: [new Uint8Array(SYN.wb.subarray(0, SYN.wb.length / 2))] }, spots: CAT, field: false }), BshGribError, /verschiedene Zeitachsen/));
  // retention
  const st9 = mkStore('keep');
  for (const run of ['2026111700', '2026111712', RUN]) { mkdirSync(join(st9, 'current', run, 'f'), { recursive: true }); writeFileSync(join(st9, 'current', `${run}.json`), '{}'); writeFileSync(join(st9, 'current', run, 'f', '000.png'), 'x'); }
  mkdirSync(join(st9, 'current', '2026111612', 'f'), { recursive: true });
  const removed = pruneCurrent(st9);
  add('D31 Aufbewahrung: zwei Läufe bleiben (Datei und Feld), ältere und halb geschriebene gehen', readdirSync(join(st9, 'current')).sort().join() === '2026111712,2026111712.json,2026111800,2026111800.json' && removed.length === 3);
  // archive
  const arch = join(tmp, 'archive'), stA = mkStore('arch');
  mkdirSync(join(stA, 'current'), { recursive: true }); writeFileSync(join(stA, seaCurrentPath(RUN)), JSON.stringify(DOC));
  const a1 = await archiveSea({ storeDir: stA, archiveDir: arch, nowMs: LIST_NOW, poi: false });
  const a2 = await archiveSea({ storeDir: stA, archiveDir: arch, nowMs: LIST_NOW + H, poi: false });
  const az = join(arch, '2026-11-18', `current-${RUN}.json.gz`);
  add('D32 Archiv: die Strömung des Laufs wird einmal abgelegt (ganz, gz), der Index nennt sie, der zweite Durchgang legt nichts doppelt ab', a1.currentAdded === 1 && a2.currentAdded === 0 && existsSync(az) && JSON.parse(gunzipSync(readFileSync(az)).toString('utf8')).spots['sylt-hoernum'].cur.length === 72 && JSON.parse(readFileSync(join(arch, 'index.json'), 'utf8')).days['2026-11-18'].current.join() === RUN);
} finally { rmSync(tmp, { recursive: true, force: true }); }

// --- E  the page without a browser ---------------------------------------------------------------------------------
{
  add('E1 das Produkt des echten Laufs besteht die Werteprüfung: 64 Spots, 72 Stunden ab 01:00 UTC', C.seaCurrentProblems(DOC).length === 0 && Object.keys(DOC.spots).length === 64 && DOC.hours === 72 && DOC.t0 === RUN_MS + H);
  const t = (f) => { const d = clone(DOC); f(d); return C.seaCurrentProblems(d).length > 0; };
  add('E2 Gegenproben am Produkt: 501 cm/s, 360°, Geschwindigkeit ohne Richtung, Zelle 3,1 km entfernt, fremde Lizenz, Stauwasser abseits des 15-min-Rasters, leere Reihe',
    t((d) => { d.spots.borkum.cur[3] = 501; }) && t((d) => { d.spots.borkum.curTo[3] = 360; }) && t((d) => { d.spots.borkum.curTo[3] = null; }) && t((d) => { d.spots.borkum.km = 3.1; }) && t((d) => { d.licence = 'CC0'; })
    && t((d) => { d.spots['sylt-hoernum'].slack[0] += 7; }) && t((d) => { d.spots.borkum.cur.fill(null); d.spots.borkum.curTo.fill(null); }));
  const ptr = { run: RUN, path: seaCurrentPath(RUN), builtAt: '2026-11-18T06:20:00.000Z', field: true };
  const NOW = Date.parse('2026-11-18T09:20:00Z');
  const load = C.currentLoadOf(ptr, DOC, NOW);
  const view = (spotId, tMs, wind = [null, null], l = load, nowMs = NOW) => C.currentViewOf({ load: l, spotId, tMs, nowMs, windFromDeg: wind[0], windKn: wind[1] });
  const sy = DOC.spots['sylt-hoernum'];
  const v1 = view('sylt-hoernum', Date.parse('2026-11-18T10:00:00Z'));
  add('E3 Stunde im Lauf: Knoten und „setzt nach“ aus der Datei (10:00 UTC = Stunde 9), Abstand der Zelle, Lauf', load.state === 'ok' && near(v1.kn, (sy.cur[9] / 100) * 1.943844) && v1.to === sy.curTo[9] && v1.km === sy.km && v1.run === RUN && v1.gap === null && v1.pkg === 'db');
  add('E4 auch mitten in der Stunde gilt der Wert der vollen Stunde, nichts wird interpoliert', near(view('sylt-hoernum', Date.parse('2026-11-18T10:40:00Z')).kn, v1.kn));
  const slackMs = DOC.t0 + sy.slack.find((m) => DOC.t0 + m * 60_000 >= NOW) * 60_000;
  add('E5 nächstes Stauwasser: das erste ab jetzt bzw. ab der gewählten Stunde, aus den 15-min-Schritten', v1.nextSlack === DOC.t0 + sy.slack.find((m) => DOC.t0 + m * 60_000 >= Date.parse('2026-11-18T10:00:00Z')) * 60_000 && view('sylt-hoernum', NOW - 3 * H).nextSlack === slackMs && (v1.nextSlack / 60_000) % 15 === 0);
  const v2 = view('sylt-hoernum', DOC.t0 + 72 * H);
  add('E6 Stunde hinter dem Ende des Laufs: kein Wert und der Grund (reicht bis …) — nie der letzte Wert', v2.kn === null && v2.to === null && v2.gap === 'beyond' && v2.until === DOC.t0 + 71 * H && view('sylt-hoernum', DOC.t0 - H).gap === 'before');
  const dryK = DOC.spots['cuxhaven-duhnen'].cur.indexOf(null);
  add('E7 Stunde, in der die Zelle im Modell keinen Strom führt (Cuxhaven-Duhnen): „kein Strom“, kein Wert', dryK >= 0 && view('cuxhaven-duhnen', DOC.t0 + dryK * H).gap === 'dry' && view('cuxhaven-duhnen', DOC.t0 + dryK * H).kn === null);
  const ax = C.currentOnAxis(DOC, sy, Date.parse('2026-11-18T00:00:00Z'), 79);
  add('E8 Reihe auf der Stundenachse des Seegangslaufs: Stunde 0 (00:00 UTC) liegt vor dem Lauf und bleibt leer, Stunde 1 ist die erste, ab Stunde 73 ist wieder nichts da', ax.kn.length === 79 && ax.kn[0] === null && near(ax.kn[1], C.currentKn(sy.cur[0])) && ax.to[72] === sy.curTo[71] && ax.kn.slice(73).every((x) => x === null));
  const ax12 = C.currentOnAxis(DOC, sy, Date.parse('2026-11-17T12:00:00Z'), 79);
  add('E9 … und auf der Achse des Laufs davor (17.11. 12 UTC) an derselben Uhrzeit derselbe Wert', near(ax12.kn[13], C.currentKn(sy.cur[0])) && ax12.kn[12] === null);
  // never stale, never invented
  const dead = C.currentLoadOf(ptr, DOC, RUN_MS + 30 * H + 60_000);
  add('E10 verspätete BSH-Daten: ein Lauf älter als 30 h wird nicht mehr gezeigt — „keine Daten“ mit Grund, obwohl seine Stunden noch reichen würden', dead.state === 'dead' && dead.doc === null && view('sylt-hoernum', RUN_MS + 31 * H, [null, null], dead, RUN_MS + 31 * H).state === 'none' && /älter als 30 Stunden/.test(view('sylt-hoernum', RUN_MS + 31 * H, [null, null], dead).why) && view('sylt-hoernum', RUN_MS + 31 * H, [null, null], dead).kn === null);
  add('E11 fehlende BSH-Daten: ohne Zeiger „keine Daten“; eine Datei eines anderen Laufs oder mit verletzter Werteprüfung wird nicht gezeigt', C.currentLoadOf(null, DOC, NOW).state === 'none' && view('sylt-hoernum', NOW, [null, null], C.SEA_CURRENT_NONE).state === 'none'
    && C.currentLoadOf({ ...ptr, run: '2026111712', path: seaCurrentPath('2026111712') }, DOC, NOW).state === 'error' && C.currentLoadOf(ptr, (() => { const d = clone(DOC); d.spots.borkum.cur[0] = 999; return d; })(), NOW).state === 'error');
  add('E12 Spot ohne Reihe im Lauf: „keine Daten“ mit dem Grund aus der Datei', (() => { const d = clone(DOC); delete d.spots.helgoland; d.failed.push({ id: 'helgoland', error: 'keine Zelle mit Strömung im Umkreis von 3 km' }); const v = view('helgoland', NOW, [null, null], C.currentLoadOf(ptr, d, NOW)); return v.state === 'none' && /keine Zelle mit Strömung/.test(v.why) && v.kn === null; })());
  add('E13 Zeiger: nur wohlgeformt und zum Pfad passend; alles andere zählt als „keiner“', C.currentPointerOf({ current: ptr })?.run === RUN && C.currentPointerOf({ current: { ...ptr, path: 'current/x.json' } }) === null && C.currentPointerOf({}) === null && C.currentPointerOf(null) === null && C.currentPointerOf({ current: { ...ptr, builtAt: 'gestern' } }) === null);
  // loadCurrent against a stand-in store
  const real = globalThis.fetch;
  try {
    let asked = 0;
    globalThis.fetch = async () => { asked++; return new Response(JSON.stringify(DOC), { status: 200 }); };
    const ok = await loadCurrent(ptr, NOW);
    const n1 = asked;
    const old = await loadCurrent(ptr, RUN_MS + 40 * H);
    globalThis.fetch = async () => new Response('nope', { status: 404 });
    const gone = await loadCurrent(ptr, NOW);
    add('E14 Leser der Seite: gute Datei ⇒ ok; zu alter Lauf ⇒ gar kein Abruf; 404 ⇒ „nicht erreichbar“ — in keinem Fall ein Wert', ok.state === 'ok' && n1 >= 1 && old.state === 'dead' && asked === n1 && gone.state === 'error' && gone.doc === null && (await loadCurrent(null, NOW)).state === 'none');
  } finally { globalThis.fetch = real; }
  // the hint at an hour
  const hint = view('sylt-hoernum', Date.parse('2026-11-18T10:00:00Z'), [(sy.curTo[9] + 5) % 360, 18]);
  add('E15 Hinweis an der Stunde: Wind aus der Richtung, in die der Strom setzt (18 kn, Strom ' + (v1.kn ?? 0).toFixed(1) + ' kn) ⇒ Wind gegen Strom; derselbe Wind von achtern ⇒ keiner', v1.kn >= 0.5 && hint.wac.against && near(hint.wac.angle, 175) && !view('sylt-hoernum', Date.parse('2026-11-18T10:00:00Z'), [(sy.curTo[9] + 180) % 360, 18]).wac.against);
  add('E16 der Hinweis trägt nichts als sich selbst: die Ansicht hat keine Klasse, keinen Wellenwert', !('cls' in hint) && !('hs' in hint) && Object.keys(hint.wac).sort().join() === 'against,angle,why');
}

// --- F  source text --------------------------------------------------------------------------------------------------
{
  const panel = src('src/sea/SeaCurrentPanel.tsx'), contract = src('src/sea/seaCurrent.ts'), page = src('src/sea/SeaPage.tsx'), band = src('src/sea/SeaBand.tsx'), map = src('src/sea/SeaMap.tsx'), css = src('src/sea/seaDeck.css');
  const wf = src('scripts/sea/workflow-sea.yml'), prod = src('scripts/sea/sea-current.mjs');
  add('F1 Quellenvermerk je Merkmal: „Strömung: Bundesamt für Seeschifffahrt und Hydrographie (BSH)“ — Readout, Karte, Quellenliste, Datei', C.BSH_CURRENT_CREDIT === 'Strömung: Bundesamt für Seeschifffahrt und Hydrographie (BSH)' && /BSH_CURRENT_CREDIT/.test(panel) && /BSH_CURRENT_CREDIT/.test(page) && /Strömung: BSH/.test(map) && /credit: BSH_CURRENT_CREDIT/.test(prod));
  add('F2 Lizenz mit Link und Vermerk der Änderung (CC BY 4.0 laut LICENSE.txt des BSH)', C.BSH_CURRENT_LICENCE === 'CC BY 4.0' && /creativecommons\.org\/licenses\/by\/4\.0/.test(C.BSH_CURRENT_LICENCE_URL) && /BSH_CURRENT_LICENCE_URL/.test(panel) && /verändert: \{BSH_CURRENT_CHANGED\}/.test(panel));
  add('F3 neben den Werten: „Modell, Mittel der oberen 5 m, keine Navigationsgrundlage“ — im Readout und am Stundenband', C.SEA_CURRENT_MODEL_NOTE === 'Modell, Mittel der oberen 5 m, keine Navigationsgrundlage' && /SEA_CURRENT_MODEL_NOTE/.test(panel) && /SEA_CURRENT_MODEL_NOTE/.test(band));
  add('F4 an Watt-Spots zusätzlich: Priele sind nicht aufgelöst', /Priele sind im Modell nicht aufgelöst/.test(C.SEA_CURRENT_WATT_NOTE) && /tidal \? ` \$\{SEA_CURRENT_WATT_NOTE\}`/.test(panel) && /tidal=\{!!spot\.tidal\}/.test(page));
  const german = [panel, contract, band, page].join('\n');
  add('F5 kein „sicher“ in den Texten der Phase', !/sicher/i.test(panel + contract) && !/Strom[^\n]{0,80}sicher|sicher[^\n]{0,80}Strom/i.test(german));
  add('F6 Gegenprobe zu F5: das Muster findet „sicher“, wenn es dasteht', /sicher/i.test('Hier ist es sicher.'));
  add('F7 Stundenband: eine Zeile „Strom“ mit Pfeil und Knoten, nur wenn der Spot eine Reihe trägt', /\{current && \(\s*<tr className="sw-band-cur">/.test(band) && /Strom kn/.test(band) && /<DriftArrow to=\{dir\}/.test(band) && /current=\{!!spotCur\}/.test(page));
  add('F8 Readout: Geschwindigkeit, „setzt nach“, nächstes Stauwasser, Abstand der Modellzelle', /setzt nach \$\{compass16\(v\.to\)\}/.test(panel) && /Nächstes Stauwasser/.test(panel) && /km vom Spot/.test(panel) && /<strong className="sw-st-val">\{f1\(v\.kn\)\}<span>kn<\/span>/.test(panel));
  add('F9 ohne Wert steht „keine Daten“ oder „kein Strom“ da, kein Strich mit Einheit', /'kein Strom' : 'keine Daten'/.test(panel) && /Keine Daten\./.test(panel));
  add('F10 Karte: Ebene „Strömung“ als Symbol-Layer wie sw-arrows, wählbar und ab Werk aus; kein Partikel-, kein Shader-Layer', /id: 'sw-current', type: 'symbol', source: 'sw-current'/.test(map) && /current: false \}/.test(page) && /\['current', 'Strömung'/.test(src('src/sea/SeaDock.tsx')) && !/type: 'custom'|gl_Position|WindLayer/.test(map + panel));
  add('F11 der Hinweis ändert weder Wellenwerte noch Klassen: Profile, Urteile, Tidenfenster und Planer kennen die Strömung nicht', ['src/sea/seaProfiles.ts', 'src/sea/seaVerdicts.ts', 'src/sea/tideWindow.ts', 'src/sea/seaPlanner.ts', 'src/sea/windBand.ts'].every((f) => !/seaCurrent|curKn|curTo|SeaCurrent/.test(src(f))) && !/(SeaVerdictCache|tideVerdict|nextAndLongest|verdictWindows|planFindings)\([^;]*?(spotCur|currentView|curDoc|curKn|curTo)/.test(page));
  const step = (/- name: Currents \(BSH surface current at the spots\)[\s\S]*?(?=\n      - name: )/.exec(wf)?.[0] ?? '').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  add('F12 Workflow: Schritt „Currents“ ist continue-on-error, überspringt sich ohne Producer, reicht den Exit-Code durch (kein tee) und steht vor dem Veröffentlichen', /continue-on-error: true/.test(step) && /sea-current\.mjs noch nicht auf main/.test(step) && /exit \$RC/.test(step) && !/\| tee/.test(step) && wf.indexOf('- name: Currents') < wf.indexOf('- name: Publish') && wf.indexOf('- name: Currents') > wf.indexOf('- name: DMI') && /steps\.current\.outcome == 'failure'/.test(wf));
  add('F13 kein Schalter für die Phase: weder Flag noch Query-Parameter', !/seaCurrentFrom|SEA_CURRENT_LIVE|[?&](st|strom|current)=/.test(src('src/sea/seaFlag.ts') + page + contract + src('src/sea/seaClient.ts')));
  add('F14 Quelle: nur die Filebox und der FTP-Server des BSH, nur .grb2 — kein DMI, kein GRIB1, kein bz2', /filebox\.bsh\.de/.test(C.BSH_CURRENT_FILEBOX) && /ftp\.bsh\.de/.test(C.BSH_CURRENT_FTP) && /grib2$/.test(C.BSH_CURRENT_FILEBOX) && /grib2$/.test(C.BSH_CURRENT_FTP) && !/dmi\.dk|grib1|decompressBz2|bz2\.mjs/.test(prod + src('scripts/sea/bshGrib.mjs')) && !C.BSH_CURRENT_FILE_RE.test('Current_db_2026111800_00.grb2.bz2') && !C.BSH_CURRENT_FILE_RE.test('Current_db_2026111800_00.grb'));
  add('F15 keine neue Abhängigkeit: der Leser kommt ohne fremdes Paket aus', !/from '(?!node:|\.)/.test(src('scripts/sea/jp2k.mjs') + src('scripts/sea/bshGrib.mjs')) && !/"(eccodes|openjpeg|jpeg2000|grib[^"]*)"\s*:/.test(src('package.json')));
  add('F16 Stile der Phase stehen vor dem Planer-Abschnitt (dessen Media Query bleibt die letzte), mobil nur per Media Query', css.indexOf('Phase ST — Strömung') > 0 && css.indexOf('Phase ST — Strömung') < css.indexOf('Phase SP — „Ausfahrt planen“') && /@media \(max-width: 767px\), \(max-width: 1439px\) and \(pointer: coarse\) \{\s*\.sw-st-main/.test(css));
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail && !c.ok ? `  — ${c.detail}` : ''}`);
console.log(`\n  ${checks.length - failed.length}/${checks.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
