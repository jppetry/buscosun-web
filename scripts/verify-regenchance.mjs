/**
 * verify-regenchance.mjs — Phase RC (audit/regenchance.md): Regenchance im Regenradar (`?rc=1`).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-regenchance.mjs [--live]
 *
 * A Modell: Schalter (nur `?rc=1`), Schwellen, Bayer-Matrix (Permutation, Bänder disjunkt, Dichte = Untergrenze),
 *   Stunde (laufende Stunde, Rückblick ⇒ laufende Stunde, volle Stunde), Wörter (nie „0 %"), Satz.
 * B Feldvertrag `pexc-<LLL>.png`: Kodierer/Dekodierer, A = 0 ⇒ fehlt (nicht 0 %), Manifest mit/ohne `pexc` gültig,
 *   fremder Dateiname abgelehnt.
 * C Rechnung des Producers (`pexcOf`): = `exceedance` derselben Verteilung, Mengen-Schwelle je Intervall (t2: x/3 mm/h),
 *   ≥ 5 ≤ ≥ 1 ≤ Chance; „> 0" = 1 − pDry = R-Kanal des Felds (E-RC-3). Gegenprobe: t2 mit stepH 1 rechnet anders.
 * D Feld lesen: Schritt zur Stunde (t1 vor t2, 3-h-Intervall ganz), Schwelle ohne `pexc` ⇒ Datei null, Gitter A = 0 ⇒ NaN.
 * E Konturen: Ring mit Loch, Ausrichtung (RFC 7946), Rand, Lücken, Sattel; Zellmitten deutlich über/unter der Schwelle
 *   liegen innen/außen (Gegenprobe mit vertauschter Schwelle); Bänder geschachtelt; Lücke nur bei NaN.
 * F Chance am Ort (`chanceBars`): lückenlos, ohne Überlapp, t1 vor t2 vor Station, Interpolation nie, 3-h-Wert ganz,
 *   Lücke = null (nie 0), Radar-Herkunft, nur Klimatologie benannt.
 * G Verdrahtung: ohne Schalter kein Element, Dock wie vorher, Karte ohne Intensität in „Chance", Rechenteil lazy,
 *   buscosun Fusion unverändert.
 * L (--live) am jüngsten echten t1-Feld (raw.githubusercontent): Geometrie gegen die Zellwerte.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  chanceEnabledFrom, isChanceThreshold, CHANCE_THRESHOLDS, CHANCE_BANDS, CHANCE_CONTOURS, BAYER8, bandDotCells, bandDensity,
  chanceHourAt, fmtChancePct, fmtHourSpan, chanceSentence,
} from '../src/precipChance/chanceModel.ts';
import { pickChanceStep, chanceGridFromRgba, chanceAt } from '../src/precipChance/chanceField.ts';
import { isoMultiPolygon, isoLines, signedArea, pointInRing } from '../src/precipChance/contours.ts';
import { chanceStepsFromV2, chanceBars, barAt, chanceKindText } from '../src/precipChance/chanceSeries.ts';
import { chanceGeometry } from '../src/precipChance/chanceGeometry.ts';
import {
  encodePexcPixel, decodePexcPixel, makeFieldManifest, parseFieldManifest, fieldFileName, fieldGrid, PEXC_THRESHOLDS_MM,
} from '../src/point/fieldFormat.ts';
import { TIER_BY_ID } from '../src/point/cubeFormat.ts';
import { exceedance, cdfOf } from '../src/pointForecast/fusion/dist.ts';
import { pexcOf } from './point/build-point-fields.mjs';
import { decodePng, toRgba } from './lib/png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
let pass = 0, fail = 0;
const add = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const H = 3_600_000;
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
// 09.10.2026 14:20 Europe/Berlin (= 12:20 UTC)
const NOW = Date.UTC(2026, 9, 9, 12, 20, 0);

// ─── A Modell ─────────────────────────────────────────────────────────────────────────────────
console.log('\n== A Modell ==');
add('A1 Schalter: nur `?rc=1` schaltet ein (voreingestellt aus, E-RC-6)',
  chanceEnabledFrom('?rc=1') && !chanceEnabledFrom('') && !chanceEnabledFrom('?rc=0') && !chanceEnabledFrom('?rc=true') && chanceEnabledFrom('?sum=1&rc=1'));
add('A2 Schwellen > 0 · ≥ 1 mm · ≥ 5 mm; fremde Werte abgelehnt', CHANCE_THRESHOLDS.join() === 'any,ge1,ge5' && isChanceThreshold('ge5') && !isChanceThreshold('ge2') && !isChanceThreshold(null));
add('A3 Bänder 10/30/50/70/90 %, Konturen 30/50/70/90 % (Auftrag)', CHANCE_BANDS.join() === '0.1,0.3,0.5,0.7,0.9' && CHANCE_CONTOURS.join() === '0.3,0.5,0.7,0.9');
{
  const perm = [...BAYER8].sort((a, b) => a - b).every((v, i) => v === i) && BAYER8.length === 64;
  const all = CHANCE_BANDS.map((_, k) => bandDotCells(k));
  const flat = all.flat();
  const disjoint = new Set(flat).size === flat.length;
  let cum = 0, dens = true;
  all.forEach((c, k) => { cum += c.length; dens &&= cum === Math.round(64 * CHANCE_BANDS[k]) && Math.abs(bandDensity(k) - cum / 64) < 1e-12; });
  add('A4 Bayer 8×8 = Permutation 0…63; Bandmuster disjunkt; Dichte bis Band k = Untergrenze (6/19/32/45/58 von 64)', perm && disjoint && dens, all.map((c) => c.length).join('+'));
}
{
  const h = chanceHourAt(NOW, NOW), past = chanceHourAt(NOW - 40 * 60_000, NOW), fut = chanceHourAt(NOW + 100 * 60_000, NOW), edge = chanceHourAt(Date.UTC(2026, 9, 9, 13, 0), NOW);
  add('A5 Stunde: laufende Stunde 12–13 UTC; Slider 40 min zurück ⇒ laufende Stunde + `past`; +100 min ⇒ 14–15 UTC; 13:00 ⇒ 13–14',
    h.fromMs === Date.UTC(2026, 9, 9, 12) && !h.past && past.fromMs === h.fromMs && past.past && fut.fromMs === Date.UTC(2026, 9, 9, 14) && edge.fromMs === Date.UTC(2026, 9, 9, 13) && !edge.past);
}
add('A6 Prozent: nie „0 %" (< 5 %), nie „100 %" (> 95 %), sonst auf 5 gerundet',
  fmtChancePct(0) === '< 5 %' && fmtChancePct(0.049) === '< 5 %' && fmtChancePct(0.71) === '70 %' && fmtChancePct(0.73) === '75 %' && fmtChancePct(1) === '> 95 %' && fmtChancePct(NaN) === '–');
add('A7 Stundenspanne in Europe/Berlin, Mitternacht als 24', fmtHourSpan(Date.UTC(2026, 9, 9, 12), Date.UTC(2026, 9, 9, 13)) === '14–15 Uhr' && fmtHourSpan(Date.UTC(2026, 9, 9, 21), Date.UTC(2026, 9, 9, 22)) === '23–24 Uhr');
{
  const s1 = chanceSentence('any', 0.7, Date.UTC(2026, 9, 9, 12), Date.UTC(2026, 9, 9, 13), NOW);
  const s2 = chanceSentence('ge1', 0.31, Date.UTC(2026, 9, 10, 9), Date.UTC(2026, 9, 10, 12), NOW);
  add('A8 Satz: „Regen heute 14–15 Uhr: 70 % wahrscheinlich"; 3-h-Wert nennt sein ganzes Intervall, Schwelle im Satz', s1 === 'Regen heute 14–15 Uhr: 70 % wahrscheinlich' && s2 === 'Regen ≥ 1 mm morgen 11–14 Uhr: 30 % wahrscheinlich', `${s1} | ${s2}`);
}

// ─── B Feldvertrag ────────────────────────────────────────────────────────────────────────────
console.log('\n== B Feldvertrag pexc ==');
{
  const px = new Uint8Array(4);
  let rt = true;
  for (const [a, b] of [[0, 0], [0.31, 0.02], [1, 1], [0.5, 0.25]]) {
    encodePexcPixel({ ge1: a, ge5: b }, px, 0);
    const d = decodePexcPixel(px[0], px[1], px[2], px[3]);
    rt &&= !!d && Math.abs(d.ge1 - a) <= 1 / 508 + 1e-12 && Math.abs(d.ge5 - b) <= 1 / 508 + 1e-12 && px[3] === 255;
  }
  encodePexcPixel(null, px, 0);
  const miss = px[3] === 0 && decodePexcPixel(px[0], px[1], px[2], px[3]) === null;
  encodePexcPixel({ ge1: NaN, ge5: 0 }, px, 0);
  add('B1 Kodierung R = P(≥ 1 mm), G = P(≥ 5 mm) auf ½/254 genau; fehlt ⇒ A = 0 ⇒ null (nie 0 %)', rt && miss && px[3] === 0, `Schwellen ${PEXC_THRESHOLDS_MM.join('/')} mm`);
}
{
  const t1 = TIER_BY_ID.t1, runAtMs = Date.UTC(2026, 9, 9, 6);
  const leads = t1.leadHours.slice(0, 3).map((L) => ({ leadH: L, validAtMs: runAtMs + L * H, precip: fieldFileName('precip', L), snowlmt: null, precipcum: null, pexc: fieldFileName('pexc', L) }));
  const base = { run: '2026100906', tier: 't1', runAtMs, builtAtMs: runAtMs, chain: { options: {}, tables: null, codeCommit: null, notes: [] }, stats: { cells: 1, precipMissing: 0, snowMissing: 0, saturated: 0, errors: 0 }, timing: { ms: 1, workers: 1 } };
  const m = JSON.parse(JSON.stringify(makeFieldManifest({ ...base, leads, pexc: true })));
  const old = JSON.parse(JSON.stringify(makeFieldManifest({ ...base, leads: leads.map(({ pexc: _p, ...l }) => l) })));
  const bad = JSON.parse(JSON.stringify(m)); bad.leads[1].pexc = 'pexc-999.png';
  add('B2 Manifest: mit `pexc` gültig (Kodierung + Schwellen genannt), Felder vor RC ohne `pexc` gültig, fremder Dateiname abgelehnt',
    !!parseFieldManifest(m) && m.encoding.pexcMm.join() === '1,5' && /exceedance/.test(m.encoding.pexc) && !!parseFieldManifest(old) && old.encoding.pexc === undefined && parseFieldManifest(bad) === null);
  add('B3 Dateiname pexc-<LLL>.png', fieldFileName('pexc', 7) === 'pexc-007.png');
}

// ─── C Rechnung des Producers ─────────────────────────────────────────────────────────────────
console.log('\n== C Rechnung (pexcOf) ==');
{
  const ds = [
    { kind: 'hurdleLogNormal', pDry: 0.3, mu: Math.log(0.8), sigma: 1.2 },
    { kind: 'hurdleLogNormal', pDry: 0.92, mu: Math.log(0.3), sigma: 1.25 },
    { kind: 'hurdleLogNormal', pDry: 0.05, mu: Math.log(3), sigma: 0.9 },
  ];
  let ok = true, mono = true, any = true;
  for (const d of ds) {
    const r1 = pexcOf(d, 1), r3 = pexcOf(d, 3);
    ok &&= r1.ge1 === exceedance(d, 1) && r1.ge5 === exceedance(d, 5) && r3.ge1 === exceedance(d, 1 / 3) && r3.ge5 === exceedance(d, 5 / 3);
    const chance = 1 - cdfOf(d, 0);
    mono &&= r1.ge5 <= r1.ge1 && r1.ge1 <= chance && r3.ge1 >= r1.ge1;
    any &&= Math.abs(exceedance(d, 0) - (1 - d.pDry)) < 1e-12;
  }
  add('C1 P(≥ x mm) = exceedance(dist, x/stepH) derselben Verteilung (t1: x mm/h, t2: x/3 mm/h)', ok);
  add('C2 Ordnung: P(≥ 5) ≤ P(≥ 1) ≤ Chance; 3-h-Intervall ≥ 1-h-Wert', mono);
  add('C3 „> 0" am Ort = exceedance(dist, 0) = 1 − pDry = R-Kanal des Felds (E-RC-3)', any);
  const d = ds[0];
  add('C4 Gegenprobe: ein t2-Schritt mit stepH 1 gerechnet ergäbe einen anderen Wert', Math.abs(pexcOf(d, 1).ge1 - pexcOf(d, 3).ge1) > 0.05, `${pexcOf(d, 1).ge1.toFixed(3)} vs ${pexcOf(d, 3).ge1.toFixed(3)}`);
  const s = src('scripts/point/build-point-fields.mjs');
  add('C5 Producer schreibt `pexc` aus `fieldValuesFromResult(…, tier.stepH)`, Schalter `POINT_FIELD_PEXC=0`, Manifest `pexc: !!pexcImg`',
    /fieldValuesFromResult\(r, leadsMs, tier\.stepH\)/.test(s) && /POINT_FIELD_PEXC !== '0'/.test(s) && /pexc: !!pexcImg/.test(s) && /fieldFileName\('pexc', L\)/.test(s));
}

// ─── D Feld lesen ─────────────────────────────────────────────────────────────────────────────
console.log('\n== D Feld lesen ==');
{
  const runAt = Date.UTC(2026, 9, 9, 6);
  const t1 = { tier: 't1', run: '2026100906', runAtMs: runAt, stepH: 1, grid: fieldGrid(TIER_BY_ID.t1), fusionName: 'buscosun Fusion 9', leads: [0, 1, 2, 3, 48].map((L) => ({ leadH: L, validAtMs: runAt + L * H, precip: `precip-${L}`, pexc: L === 3 ? null : `pexc-${L}` })) };
  const runAt2 = Date.UTC(2026, 9, 9, 0);
  const t2 = { tier: 't2', run: '2026100900', runAtMs: runAt2, stepH: 3, grid: fieldGrid(TIER_BY_ID.t2), fusionName: null, leads: [54, 57].map((L) => ({ leadH: L, validAtMs: runAt2 + L * H, precip: `precip-${L}`, pexc: null })) };
  const a = pickChanceStep([t1, t2], runAt + 1 * H, runAt + 2 * H, 'any');
  const b = pickChanceStep([t1, t2], runAt + 49 * H, runAt + 50 * H, 'any');
  const c = pickChanceStep([t1, t2], runAt + 2 * H, runAt + 3 * H, 'ge1');
  const d = pickChanceStep([t1, t2], runAt + 60 * H, runAt + 61 * H, 'any');
  add('D1 Stunde 07–08 UTC ⇒ t1 Vorlauf 2 (Intervall endet am Vorlauf)', a?.tier.tier === 't1' && a.lead.leadH === 2 && a.file === 'precip-2' && a.stepToMs - a.stepFromMs === H);
  add('D2 Stunde jenseits t1 ⇒ t2-Schritt, der sie ganz enthält (3-h-Intervall)', b?.tier.tier === 't2' && b.stepToMs - b.stepFromMs === 3 * H && b.stepFromMs <= runAt + 49 * H && b.stepToMs >= runAt + 50 * H);
  add('D3 Schwelle ohne `pexc` im Manifest ⇒ Datei null (benannte Lücke, keine Rückrechnung)', c?.lead.leadH === 3 && c.file === null);
  add('D4 keine Stufe ⇒ null', d === null);
  const rgba = new Uint8Array([127, 0, 0, 255, 0, 0, 0, 0, 254, 0, 0, 255, 50, 25, 0, 255]);
  const gAny = chanceGridFromRgba(rgba, 2, 2, 'any'), g1 = chanceGridFromRgba(rgba, 2, 2, 'ge1'), g5 = chanceGridFromRgba(rgba, 2, 2, 'ge5');
  add('D5 Gitter: R/254 („> 0"), R bzw. G aus pexc; A ≠ 255 ⇒ NaN (nie 0)', Math.abs(gAny[0] - 0.5) < 1e-6 && Number.isNaN(gAny[1]) && gAny[2] === 1 && Math.abs(g1[3] - 50 / 254) < 1e-6 && Math.abs(g5[3] - 25 / 254) < 1e-6 && Number.isNaN(g5[1]));
  const grid = { width: 2, height: 2, deg: 1, lat0: 50, lon0: 10 };
  add('D6 Wert am Ort: Zeile 0 = Norden; außerhalb undefined; fehlt null', Math.abs(chanceAt(grid, gAny, 51, 10) - 0.5) < 1e-6 && chanceAt(grid, gAny, 50, 10) === 1 && chanceAt(grid, gAny, 51, 11) === null && chanceAt(grid, gAny, 53, 10) === undefined);
}

// ─── E Konturen ───────────────────────────────────────────────────────────────────────────────
console.log('\n== E Konturen ==');
const inMulti = (mp, p) => mp.some((poly) => pointInRing(p, poly[0]) && !poly.slice(1).some((h) => pointInRing(p, h)));
{
  const w = 40, h = 30, g = { width: w, height: h, lon0: 5, lat0: 45, deg: 0.1 };
  const v = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const d = Math.hypot(c - 20, r - 15); v[r * w + c] = Math.exp(-((d - 8) ** 2) / 8); }
  const mp = isoMultiPolygon(v, g, 0.5);
  const closed = mp.every((poly) => poly.every((ring) => ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]));
  add('E1 Ring mit Loch: 1 Fläche, 1 Loch; Außenring gegen den Uhrzeigersinn (> 0), Loch im Uhrzeigersinn (< 0), geschlossen',
    mp.length === 1 && mp[0].length === 2 && signedArea(mp[0][0]) > 0 && signedArea(mp[0][1]) < 0 && closed);
  const lonOf = (c) => g.lon0 + c * g.deg, latOf = (r) => g.lat0 + (h - 1 - r) * g.deg;
  let inside = 0, outside = 0, wrong = 0;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const x = v[r * w + c];
    if (x > 0.6) { inside++; if (!inMulti(mp, [lonOf(c), latOf(r)])) wrong++; }
    if (x < 0.4) { outside++; if (inMulti(mp, [lonOf(c), latOf(r)])) wrong++; }
  }
  add('E2 Zellmitten > 0,6 liegen innen, < 0,4 außen (Mitte des Rings = Loch)', wrong === 0 && inside > 50 && outside > 50, `${inside} innen, ${outside} außen, ${wrong} falsch`);
  const neg = isoMultiPolygon(v.map((x) => 1 - x), g, 0.5);
  let negWrong = 0;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const x = v[r * w + c]; if (x > 0.6 && !inMulti(neg, [lonOf(c), latOf(r)])) negWrong++; }
  add('E3 Gegenprobe: das umgekehrte Feld trennt dieselben Zellen falsch herum', negWrong > 50, `${negWrong} Abweichungen`);
  // Rand: Fläche berührt den Gitterrand ⇒ Ring schließt am halben Zellrand
  const edge = new Float32Array(w * h); for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) edge[r * w + c] = c < 5 ? 1 : 0;
  const ep = isoMultiPolygon(edge, g, 0.5);
  const minLon = Math.min(...ep[0][0].map((p) => p[0]));
  add('E4 Rand: Fläche am Gitterrand schließt am Zellrand (Länge 4,95°)', ep.length === 1 && Math.abs(minLon - (g.lon0 - g.deg / 2)) < 1e-9, `min ${minLon}`);
  // Lücke: NaN zählt als „unter"
  const gap = new Float32Array(w * h).fill(1); gap[15 * w + 20] = NaN;
  const gp = isoMultiPolygon(gap, g, 0.5);
  add('E5 Lücke (NaN) liegt außerhalb jeder Fläche (Loch um die Zelle)', gp.length === 1 && gp[0].length === 2 && !inMulti(gp, [lonOf(20), latOf(15)]) && inMulti(gp, [lonOf(5), latOf(5)]));
  // Sattel: Schachbrett schließt jeden Ring
  const ch = new Float32Array(w * h); for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) ch[r * w + c] = (r + c) % 2;
  const lines = isoLines(ch, g, 0.5);
  add('E6 Sattelzellen (Schachbrett): jeder Ring geschlossen', lines.length > 100 && lines.every((r) => r.length >= 4 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1]), `${lines.length} Ringe`);
}
{
  // Geometrie wie die Karte: Bänder geschachtelt, Lücke nur bei NaN, Konturen je Stufe
  const tier = TIER_BY_ID.t3, grid = fieldGrid(tier);
  const n = grid.width * grid.height, vals = new Float32Array(n);
  for (let i = 0; i < n; i++) { const r = Math.floor(i / grid.width), c = i % grid.width; vals[i] = Math.max(0, Math.min(1, 0.5 + 0.45 * Math.sin(c / 6) * Math.cos(r / 5))); }
  const g0 = chanceGeometry(vals, grid);
  const area = (f) => f.geometry.coordinates.reduce((s, poly) => s + signedArea(poly[0]) + poly.slice(1).reduce((t, hh) => t + signedArea(hh), 0), 0);
  const areas = g0.bands.features.map(area);
  const nested = areas.every((a, k) => k === 0 || a <= areas[k - 1] + 1e-9);
  add('E7 Bänder ≥ 10…90 % geschachtelt (Fläche fällt), Konturen 30/50/70/90 % vorhanden, keine Lücke ohne NaN',
    nested && g0.bands.features.length === 5 && g0.lines.features.map((f) => f.properties.lvl).join() === '0.3,0.5,0.7,0.9' && g0.missing.features.length === 0 && g0.missingCells === 0, areas.map((a) => a.toFixed(1)).join(' ≥ '));
  vals[5] = NaN; vals[6] = NaN;
  const g1 = chanceGeometry(vals, grid);
  add('E8 NaN-Zellen ⇒ schraffierte Lückenfläche, gezählt', g1.missing.features.length === 1 && g1.missingCells === 2);
}

// ─── F Chance am Ort ──────────────────────────────────────────────────────────────────────────
console.log('\n== F Chance am Ort ==');
{
  const t0 = Date.UTC(2026, 9, 9, 12);
  const hurdle = (pDry, med = 0.6) => ({ kind: 'hurdleLogNormal', pDry, mu: Math.log(med), sigma: 1.2 });
  const step = (tMs, tier, dist, o = {}) => ({
    validAtMs: tMs, leadH: 0, tier, interpolated: !!o.interp, flags: [],
    members: o.radar ? [{ product: 'nowcast', tag: 'rv' }] : [{ product: 'cube-t1', tag: 't1' }],
    vars: { precip: dist || o.interp ? { dist: o.interp ? null : dist, calib: o.clima ? ['climatologyOnly'] : [], members: o.radar ? [{ tag: 'rv', weight: 0.6 }] : [{ tag: 't1', weight: 1 }] } : null },
  });
  const steps = [
    step(t0 + 1 * H, 't1', hurdle(0.3), { radar: true }),
    step(t0 + 2 * H, 't1', hurdle(0.6)),
    step(t0 + 3 * H, 't1', hurdle(0.9)),
    step(t0 + 4 * H, 't1', hurdle(0.8)),                  // t1 reicht bis t0+4
    step(t0 + 5 * H, 't1', null, { interp: true }),      // Stundenachse, interpoliert ⇒ nie
    step(t0 + 6 * H, 't2', hurdle(0.5)),                  // Intervall t0+3 … t0+6, t0+3…4 schon t1
    step(t0 + 5 * H, 'station', hurdle(0.1)),             // in der t2-Zeit ⇒ nie
    step(t0 + 9 * H, 'station', hurdle(0.8)),             // t0+8…9 frei ⇒ Station
    step(t0 + 10 * H, 't1', hurdle(0.2, 2), { clima: true }),
  ];
  const v2 = { axis: { steps } };
  const cs = chanceStepsFromV2(v2);
  const bars = chanceBars(cs, t0, t0 + 12 * H, exceedance);
  let contiguous = bars[0].fromMs === t0 && bars.at(-1).toMs === t0 + 12 * H;
  for (let i = 1; i < bars.length; i++) contiguous &&= bars[i].fromMs === bars[i - 1].toMs;
  add('F1 lückenlos und ohne Überlapp über das ganze Fenster', contiguous, bars.map((b) => `${(b.fromMs - t0) / H}-${(b.toMs - t0) / H}:${b.tier ?? '–'}`).join(' '));
  const b0 = barAt(bars, t0 + 0.5 * H), b4 = barAt(bars, t0 + 4.5 * H), b5 = barAt(bars, t0 + 5.5 * H), b8 = barAt(bars, t0 + 8.5 * H), b7 = barAt(bars, t0 + 6.5 * H), b9 = barAt(bars, t0 + 9.5 * H);
  add('F2 erste Stunde t1 mit Radar-Herkunft, „> 0" = 1 − pDry', b0.tier === 't1' && b0.kind === 'radar' && Math.abs(b0.p.any - 0.7) < 1e-12);
  add('F3 3-h-Wert gilt für sein ganzes Intervall (t0+3…6), steht nur über dem freien Teil (t0+4…6), Station darin nie',
    b4.tier === 't2' && b5.tier === 't2' && b4.stepFromMs === t0 + 3 * H && b4.stepToMs === t0 + 6 * H && b4.fromMs === t0 + 4 * H && Math.abs(b5.p.any - 0.5) < 1e-12 && chanceKindText(b4) === '3-h-Intervall');
  add('F4 Station füllt nur freie Zeit (t0+8…9), Lücke t0+6…8 ist null (nie 0 %)', b8.tier === 'station' && b8.kind === 'station' && b7.p === null && b7.kind === null);
  add('F5 nur Klimatologie benannt (kind clima)', b9.kind === 'clima' && chanceKindText(b9) === 'nur Klimatologie');
  add('F6 ≥ 1 mm und ≥ 5 mm je Schritt aus derselben Verteilung, t2 mit x/3 mm/h', Math.abs(b5.p.ge1 - exceedance(hurdle(0.5), 1 / 3)) < 1e-12 && Math.abs(b0.p.ge5 - exceedance(hurdle(0.3), 5)) < 1e-12);
  const interpWithDist = [{ ...cs[4], dist: hurdle(0.01) }];
  add('F7 Gegenprobe: ein interpolierter Schritt zählt nie, auch nicht mit Verteilung', chanceBars(interpWithDist, t0 + 4 * H, t0 + 5 * H, exceedance).every((b) => b.p === null));
}

// ─── G Verdrahtung ────────────────────────────────────────────────────────────────────────────
console.log('\n== G Verdrahtung ==');
{
  const deck = src('src/nowcast/NowcastDeck.tsx'), ui = src('src/precipSums/PrecipSumsUi.tsx'), map = src('src/nowcast/NowcastRadarMap.tsx');
  const hook = src('src/precipChance/useChanceMap.ts');
  add('G1 Deck: Chance nur mit `?rc=1` UND Dock „Darstellung" (`sumsOn &&`), sonst `chance = null` und keine Karten-Props',
    /sumsOn && chanceEnabledFrom\(/.test(deck) && /const chance: ChanceCtx \| null = rcOn \?/.test(deck) && /const chanceMapProps = rcOn \?/.test(deck) && /: \{\};/.test(deck));
  add('G2 Dock: dritte Taste und Schwellen nur mit `chance`-Angabe — ohne sie dieselben zwei Tasten wie vor RC',
    /\{chance && <button type="button" role="tab" aria-selected=\{sel\.mode === 'chance'\}/.test(ui) && /\{chance && sel\.mode === 'chance' && chance\.thresholdSeg\}/.test(ui));
  add('G3 Karte: „Chance" nur mit `chance`-Prop; Intensitäts-Ebene ruht wie in „Summe"; eigene Legende statt Intensitäts-Legende',
    /const chanceMode = sum\?\.mode === 'chance' && !!chance;/.test(map) && /sumMode \|\| chanceMode \? layers\.filter\(\(l\) => l !== 'precip'\)/.test(map) && /\{!sumMode && !chanceMode && <div className="nc-radar-legend">/.test(map));
  add('G4 Rechenteil lazy: Engine nur per `import()`, kein statischer Import außerhalb des Chunks',
    /import\('\.\/chanceMapEngine'\)/.test(hook) && !/^import (?!type)[^;]*'\.\/chanceMapEngine'/m.test(hook) && !/from '\.\.\/precipChance\/chanceMapEngine'/.test(deck + map));
  add('G5 Nutzer-Zeit beendet die Wahl aus der Leiste (Slider, Schritt, „jetzt", Abspielen)',
    /onScrub=\{\(p\) => \{ onUserTime\?\.\(\);/.test(map) && /const step = \(d: number\) => \{ onUserTime\?\.\(\);/.test(map) && /const jumpNow = \(\) => \{ onUserTime\?\.\(\);/.test(map) && /if \(next\) onUserTimeRef\.current\?\.\(\);/.test(map));
  let diff = '';
  try { diff = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'src/pointForecast'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { diff = `git: ${e.message}`; }
  add('G6 buscosun Fusion unverändert: kein Diff unter src/pointForecast', diff === '', diff || 'leer');
  const series = src('src/precipChance/chanceSeries.ts');
  add('G7 Chance am Ort liest nur: `exceedance` wird übergeben, kein Import aus dem Motor außer Typen', !/^import \{[^}]*\} from '\.\.\/pointForecast\/fusion\/(dist|fuse)'/m.test(series) && /import type \{ Dist \}/.test(series));
}

// ─── L live ───────────────────────────────────────────────────────────────────────────────────
if (args.has('--live')) {
  console.log('\n== L am jüngsten echten t1-Feld ==');
  const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/point/field/v1';
  try {
    const idx = await (await fetch(`${RAW}/index.json`)).json();
    const run = idx.latestByTier.t1.run;
    const man = parseFieldManifest(await (await fetch(`${RAW}/${run}/t1/field.json`)).json());
    const lead = man.leads.find((l) => l.leadH === 12) ?? man.leads[1];
    const dec = decodePng(Buffer.from(await (await fetch(`${RAW}/${run}/t1/${lead.precip}`)).arrayBuffer()));
    const rgba = toRgba(dec);
    const vals = chanceGridFromRgba(rgba, dec.width, dec.height, 'any');
    const t0 = performance.now();
    const geo = chanceGeometry(vals, man.grid);
    const ms = performance.now() - t0;
    const lonOf = (c) => man.grid.lon0 + c * man.grid.deg, latOf = (r) => man.grid.lat0 + (man.grid.height - 1 - r) * man.grid.deg;
    let checked = 0, wrong = 0;
    for (const f of geo.bands.features) {
      const lvl = f.properties.lvl, mp = f.geometry.coordinates;
      for (let i = 0; i < vals.length; i += 37) {
        const x = vals[i]; if (!(Math.abs(x - lvl) > 0.04)) continue;
        const r = Math.floor(i / man.grid.width), c = i % man.grid.width;
        checked++;
        if (inMulti(mp, [lonOf(c), latOf(r)]) !== (x > lvl)) wrong++;
      }
    }
    add(`L1 ${run} +${lead.leadH} h: Zellmitten (±4 Pp. Abstand zur Stufe) liegen auf der richtigen Seite jeder Bandgrenze`, checked > 1000 && wrong === 0, `${checked} geprüft, ${wrong} falsch; Geometrie ${ms.toFixed(0)} ms; Bänder ${geo.bands.features.length}, Konturen ${geo.lines.features.length}, Lücken ${geo.missingCells}; pexc im Manifest: ${lead.pexc ? 'ja' : 'nein (vor Push)'}`);
  } catch (e) { add('L1 echtes Feld erreichbar', false, e.message); }
}

console.log(`\n${pass}/${pass + fail} bestanden`);
process.exit(fail ? 1 : 0);
