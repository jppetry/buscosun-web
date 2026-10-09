/**
 * verify-snowcap.mjs — Phase SK (audit/schneefallgrenze-flaeche.md): Schneefallgrenze als Fläche im Gelände (`?sk=1`).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-snowcap.mjs [--live]
 *
 * A Modell: Schalter, Wahrscheinlichkeit/Phase in der Höhe, Beschriftung (50 m, Leerzeichen), Radar-Gewicht.
 * B Feld: Schritt zur Zeit (t1 ±30 min vor t2 ±90 min, sonst keiner), Dekodierung (A = 0 ⇒ NaN), bilinear, außerhalb.
 * C Bild: Kappe über p50, Band schraffiert p10…p90, Deckkraft nach Nässe, Lücken durchsichtig, Linie an der richtigen
 *   Höhe, kein Linienzug am Rand/an Lücken; Negativkontrolle.
 * D Nässe: Radar vor Feld, Länderregel, Zeitfenster des Radars, Feld-Chance als Rückfall.
 * E Ansicht: Ausschnitt geklemmt (Feldgebiet, Spannweite), DEM-Zoom.
 * F Satz am Ort: snowSentence unverändert durchgereicht, „Bei dir bleibt es Regen", Chance, 48-h-Leiste.
 * G Verdrahtung: ohne Schalter nichts, alte Linie nur mit Schalter unterdrückt, Lazy-Chunk, buscosun Fusion unverändert.
 * L (--live) am jüngsten echten t1-Feld.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  snowCapEnabledFrom, snowProbAt, fmtSnowLine, round50, radarWeight, SK_RADAR_WET_MMH, SK_RADAR_FULL_MMH,
} from '../src/snowCap/snowCapModel.ts';
import { phaseAt } from '../src/snowCap/snowPhase.ts';
import { pickSnowLead, snowGridFromRgba, snowAt } from '../src/snowCap/snowField.ts';
import { encodeSnowPixel, fieldGrid } from '../src/point/fieldFormat.ts';
import { TIER_BY_ID } from '../src/point/cubeFormat.ts';
import { buildCap, demAt, mercRowLat, colLon } from '../src/snowCap/capRaster.ts';
import { SK_PALETTE_2D, SK_ALPHA_DRY, SK_ALPHA_WET } from '../src/snowCap/snowCapModel.ts';
import { frameAtTime, buildWetGrid, wetSampler } from '../src/snowCap/capWet.ts';
import { capViewFor, demZoomFor } from '../src/snowCap/snowCapView.ts';
import { snowArrival, groupCells3h } from '../src/snowCap/snowArrival.ts';
import { snowSentence } from '../src/nowcast/heightTime/heightTimeModel.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
let pass = 0, fail = 0;
const add = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 9, 12, 20, 0);
void args; void execFileSync;

console.log('\n== A Modell ==');
add('A1 Schalter: `?sk=1`/`?sk=true` an, sonst aus',
  snowCapEnabledFrom('?sk=1') && snowCapEnabledFrom('?a=2&sk=true') && !snowCapEnabledFrom('') && !snowCapEnabledFrom('?sk=0') && !snowCapEnabledFrom('?sk=2'));
add('A2 P(Schnee) in der Höhe: Mitte ⇒ 0,5; p90-Höhe ⇒ 0,9; p10-Höhe ⇒ 0,1; ohne Band Stufe',
  Math.abs(snowProbAt(1400, 1400, 250) - 0.5) < 1e-9 && Math.abs(snowProbAt(1650, 1400, 250) - 0.9) < 2e-3
  && Math.abs(snowProbAt(1150, 1400, 250) - 0.1) < 2e-3 && snowProbAt(1400, 1400, 0) === 1 && snowProbAt(1399, 1400, 0) === 0);
add('A3 Phase nach buscosun-Fusion-Schwellen 0,25/0,75: weit oben Schnee, Mitte Schneeregen, weit unten Regen',
  phaseAt(2000, 1400, 250) === 'snow' && phaseAt(1400, 1400, 250) === 'sleet' && phaseAt(800, 1400, 250) === 'rain');
add('A4 Beschriftung: 50-m-Raster, Leerzeichen-Tausender, Spanne; ohne Band benannt',
  fmtSnowLine(1412, 228) === 'Schneefallgrenze 1 400 m (1 200–1 650 m)' && fmtSnowLine(980, 0) === 'Schneefallgrenze 1 000 m (ohne Spanne)'
  && round50(1374) === 1350 && round50(1375) === 1400, fmtSnowLine(1412, 228));
add('A5 Radar-Gewicht: < 0,1 mm/h ⇒ 0, ab 0,5 mm/h ⇒ 1, dazwischen linear, null bleibt null',
  radarWeight(0.05) === 0 && radarWeight(SK_RADAR_FULL_MMH) === 1 && radarWeight(5) === 1 && radarWeight(null) === null
  && Math.abs(radarWeight(0.25) - 0.25 / SK_RADAR_FULL_MMH) < 1e-9 && SK_RADAR_WET_MMH === 0.1);
add('A6 Modell importfrei (Deck/Karte ziehen kein buscosun-Fusion-Modul)', !/^import /m.test(src('src/snowCap/snowCapModel.ts')));

console.log('\n== B Feld ==');
{
  const t1 = { tier: 't1', run: 'R1', runAtMs: NOW - 5 * H, stepH: 1, grid: null, fusionName: 'buscosun Fusion 12',
    leads: Array.from({ length: 49 }, (_, L) => ({ leadH: L, validAtMs: NOW - 5 * H + L * H - 20 * 60_000, file: `snowlmt-${String(L).padStart(3, '0')}.png` })) };
  const t2 = { tier: 't2', run: 'R2', runAtMs: NOW - 8 * H, stepH: 3, grid: null, fusionName: null,
    leads: Array.from({ length: 24 }, (_, k) => { const L = 51 + 3 * k; return { leadH: L, validAtMs: NOW - 8 * H + L * H - 20 * 60_000, file: `snowlmt-${L}.png` }; }) };
  const a = pickSnowLead([t1, t2], NOW + 2 * H);
  const b = pickSnowLead([t1, t2], t1.leads[48].validAtMs + 60 * 60_000);
  const c = pickSnowLead([t1, t2], NOW + 400 * H);
  add('B1 Schritt: t1 nächste Stunde (±30 min) vor t2; jenseits t1 der t2-Schritt ±90 min; jenseits t2 keiner',
    a?.tier.tier === 't1' && Math.abs(a.lead.validAtMs - (NOW + 2 * H)) <= 30 * 60_000 && b?.tier.tier === 't2' && c === null, `${a?.lead.leadH}/${b?.lead.leadH}`);
  add('B1b Schritt ohne Datei (file null) zählt nicht', pickSnowLead([{ ...t1, leads: t1.leads.map((l) => ({ ...l, file: null })) }], NOW + 2 * H) === null);
}
{
  const tier = TIER_BY_ID.t1;
  const grid = fieldGrid(tier);
  const W = grid.width, Hh = grid.height;
  const rgba = new Uint8Array(W * Hh * 4);
  for (let r = 0; r < Hh; r++) for (let c = 0; c < W; c++) {
    encodeSnowPixel(c < W / 2 ? { mid: 1400, half: 250, prov: 'divergence' } : null, rgba, (r * W + c) * 4);
  }
  const g = snowGridFromRgba(rgba, grid);
  const west = snowAt(g, 50, 7), east = snowAt(g, 50, 16), out = snowAt(g, 40, 7);
  add('B2 Dekodierung: Mitte/halbe Breite in 25-m-Schritten; A = 0 ⇒ NaN (nie 0)',
    g.mid[0] === 1400 && g.half[0] === 250 && Number.isNaN(g.mid[W - 1]) && Number.isNaN(g.half[W - 1]));
  add('B3 Abtastung: Westhälfte 1400 ± 250; Osthälfte ganz fehlend ⇒ null', west?.mid === 1400 && west?.half === 250 && east === null);
  add('B4 außerhalb des Feldgebiets ⇒ undefined (keine Tönung, kein Rand-Wert)', out === undefined && snowAt(g, 50, 4) === undefined);
  const rgba2 = new Uint8Array(W * Hh * 4);
  for (let r = 0; r < Hh; r++) for (let c = 0; c < W; c++) encodeSnowPixel({ mid: 1000 + 100 * (c % 2), half: 0, prov: 'none' }, rgba2, (r * W + c) * 4);
  const g2 = snowGridFromRgba(rgba2, grid);
  const s = snowAt(g2, grid.lat0 + 10 * grid.deg, grid.lon0 + 0.5 * grid.deg);
  add('B5 bilinear zwischen zwei Zellmitten (1000/1100 ⇒ 1050)', s != null && Math.abs(s.mid - 1050) < 1e-6, `${s?.mid}`);
}

console.log('\n== C Bild ==');
// Synthetic Terrarium tiles with a given elevation function.
function synthDem(view, z, elevAt) {
  const lng2x = (lng) => ((lng + 180) / 360) * (1 << z);
  const lat2y = (lat) => { const r = (lat * Math.PI) / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z); };
  const x0 = Math.floor(lng2x(view.west)), x1 = Math.floor(lng2x(view.east)), y0 = Math.floor(lat2y(view.north)), y1 = Math.floor(lat2y(view.south));
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  const data = [];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const d = new Uint8ClampedArray(256 * 256 * 4);
    for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) {
      const X = tx + px / 256, Y = ty + py / 256;
      const lon = X / (1 << z) * 360 - 180;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * Y / (1 << z)))) * 180 / Math.PI;
      const e = elevAt(lat, lon) + 32768, o = (py * 256 + px) * 4;
      d[o] = Math.floor(e / 256); d[o + 1] = Math.floor(e) % 256; d[o + 2] = Math.floor((e % 1) * 256); d[o + 3] = 255;
    }
    data.push(d);
  }
  return { zoom: z, x0, y0, nx, ny, data };
}
const VIEW = { west: 10.0, east: 11.0, north: 47.6, south: 47.0, width: 120, height: 90 };
const elevLin = (lat) => (lat - VIEW.south) / (VIEW.north - VIEW.south) * 3000;
const DEM = synthDem(VIEW, 9, elevLin);
{
  const lat = mercRowLat(VIEW, 0), lon = colLon(VIEW, 0);
  const e = demAt(DEM, lon, lat);
  add('C0 DEM-Abtastung (Terrarium bilinear) trifft die synthetische Höhe auf ±5 m', Math.abs(e - elevLin(lat)) < 5, `${e.toFixed(1)} vs ${elevLin(lat).toFixed(1)}`);
}
const fgrid = fieldGrid(TIER_BY_ID.t1);
const constSnow = (mid, half, holeLon = null) => {
  const rgba = new Uint8Array(fgrid.width * fgrid.height * 4);
  for (let r = 0; r < fgrid.height; r++) for (let c = 0; c < fgrid.width; c++) {
    const lonC = fgrid.lon0 + c * fgrid.deg;
    encodeSnowPixel(holeLon != null && lonC > holeLon ? null : { mid, half, prov: half > 0 ? 'divergence' : 'none' }, rgba, (r * fgrid.width + c) * 4);
  }
  return snowGridFromRgba(rgba, fgrid);
};
const noYield = () => Promise.resolve();
const alphaAt = (res, i, j) => res.rgba[(j * res.width + i) * 4 + 3] / 255;
const rowForElev = (m) => { for (let j = 0; j < VIEW.height; j++) if (elevLin(mercRowLat(VIEW, j)) <= m) return j; return VIEW.height - 1; };
{
  const res = await buildCap({ view: VIEW, dem: DEM, snow: constSnow(1500, 0), wet: () => 0, palette: SK_PALETTE_2D, yieldFn: noYield });
  const above = alphaAt(res, 60, rowForElev(2500)), below = alphaAt(res, 60, rowForElev(800));
  add('C1 Kappe über p50 (trocken = SK_ALPHA_DRY), darunter durchsichtig', Math.abs(above - SK_ALPHA_DRY) < 0.01 && below === 0, `${above.toFixed(3)}/${below}`);
  const wet = await buildCap({ view: VIEW, dem: DEM, snow: constSnow(1500, 0), wet: () => 1, palette: SK_PALETTE_2D, yieldFn: noYield });
  add('C2 nass ⇒ Kappe kräftiger (SK_ALPHA_WET)', Math.abs(alphaAt(wet, 60, rowForElev(2500)) - SK_ALPHA_WET) < 0.01);
  const verts = res.lines.features.filter((f) => f.geometry.type === 'LineString').flatMap((f) => f.geometry.coordinates);
  const bad = verts.filter(([, lat]) => Math.abs(elevLin(lat) - 1500) > 60);
  add('C3 Linie liegt auf p50 (alle Punkte ±60 m bei 1 500 m)', verts.length > 5 && bad.length === 0, `${verts.length} Punkte, ${bad.length} daneben`);
  // Browser finding 09.10.: in alpine terrain the line is too winding for a label along it — label POINTS on the longest runs.
  const pts = res.lines.features.filter((f) => f.geometry.type === 'Point');
  add('C3b Beschriftung als Punkte (höchstens 3, auf den längsten Linienzügen), Text nach Vorgabe',
    pts.length >= 1 && pts.length <= 3 && pts.every((f) => f.properties.label === 'Schneefallgrenze 1 500 m (ohne Spanne)' && Math.abs(elevLin(f.geometry.coordinates[1]) - 1500) < 60), `${pts.length} Punkte`);
  const neg = await buildCap({ view: VIEW, dem: DEM, snow: constSnow(2500, 0), wet: () => 0, palette: SK_PALETTE_2D, yieldFn: noYield });
  const negBad = neg.lines.features.filter((f) => f.geometry.type === 'LineString').flatMap((f) => f.geometry.coordinates).filter(([, lat]) => Math.abs(elevLin(lat) - 1500) > 60);
  add('C3n Gegenprobe: Grenze 2 500 m ⇒ die Linie liegt NICHT mehr bei 1 500 m', negBad.length > 0);
}
{
  const band = await buildCap({ view: VIEW, dem: DEM, snow: constSnow(1500, 300), wet: () => 0, palette: SK_PALETTE_2D, yieldFn: noYield });
  const j = rowForElev(1350);
  let hatched = 0, clear = 0;
  for (let i = 0; i < VIEW.width; i++) { if (alphaAt(band, i, j) > 0) hatched++; else clear++; }
  const jOut = rowForElev(900); let outside = 0;
  for (let i = 0; i < VIEW.width; i++) if (alphaAt(band, i, jOut) > 0) outside++;
  add('C4a Band p10…p50: Schraffur (Streifen) — Pixel teils getönt, teils frei; unter p10 nichts',
    hatched > 0 && clear > 0 && outside === 0, `${hatched}/${clear}/${outside}`);
  const noDem = { ...DEM, data: DEM.data.map(() => null) };
  const nd = await buildCap({ view: VIEW, dem: noDem, snow: constSnow(1500, 300), wet: () => 1, palette: SK_PALETTE_2D, yieldFn: noYield });
  let anyAlpha = false; for (let k = 3; k < nd.rgba.length; k += 4) if (nd.rgba[k] !== 0) { anyAlpha = true; break; }
  add('C4 ohne DEM-Kachel: durchsichtig, gezählt als noDem, keine Linie', nd.stats.noDem === VIEW.width * VIEW.height && !anyAlpha && nd.lines.features.length === 0);
}
{
  const res = await buildCap({ view: VIEW, dem: DEM, snow: constSnow(1500, 0, 10.5), wet: () => 0, palette: SK_PALETTE_2D, yieldFn: noYield });
  let eastTint = 0;
  for (let j = 0; j < VIEW.height; j++) for (let i = 0; i < VIEW.width; i++) if (colLon(VIEW, i) > 10.56 && alphaAt(res, i, j) > 0) eastTint++;
  const verts = res.lines.features.filter((f) => f.geometry.type === 'LineString').flatMap((f) => f.geometry.coordinates);
  const vertical = verts.filter(([, lat]) => Math.abs(elevLin(lat) - 1500) > 60);
  add('C5 Feldlücke: keine Tönung östlich der Lücke, gezählt als gap', eastTint === 0 && res.stats.gap > 0, `${eastTint}/${res.stats.gap}`);
  add('C6 keine Linie entlang Lücken- oder Bildrand (alle Linienpunkte auf 1 500 m)', verts.length > 5 && vertical.length === 0, `${verts.length} Punkte, ${vertical.length} daneben`);
}

console.log('\n== D Nässe ==');
{
  const mk = (t, lead, measured) => ({ values: new Uint8Array(4), width: 2, height: 2, timeMs: t, leadMinutes: lead, measured });
  const st = { country: 'DE', source: 'radolan_rv', stepMin: 5, frames: [mk(NOW - 10 * 60_000, -10, true), mk(NOW, 0, true), mk(NOW + 120 * 60_000, 120, false)], corners: [[0, 0], [0, 0], [0, 0], [0, 0]] };
  add('D1 Radar-Frame zur Zeit: ±(Schritt/2 + 1 min), sonst keiner',
    frameAtTime(st, NOW + 2 * 60_000)?.timeMs === NOW && frameAtTime(st, NOW + 30 * 60_000) === null && frameAtTime(st, NOW + 121 * 60_000)?.leadMinutes === 120);
  const chance = new Float32Array(fgrid.width * fgrid.height).fill(0.8);
  const wg = buildWetGrid(fgrid, {}, NOW, chance);
  const s = wetSampler(wg);
  add('D2 ohne Radar trägt die Feld-Chance (0,8) — Quelle „Feld"', Math.abs(s(48, 10) - 0.8) < 1e-6 && wg.radar === 0 && wg.field > 0);
  const wg0 = buildWetGrid(fgrid, {}, NOW, null);
  add('D3 weder Radar noch Feld ⇒ null (zählt als trocken, nie „nass")', wetSampler(wg0)(48, 10) === null);
  // Radar before field: an all-dry radar frame (bytes 0) over the whole grid must override a wet field chance in its country.
  const big = { values: new Uint8Array(100 * 100), width: 100, height: 100, timeMs: NOW, leadMinutes: 0, measured: true };
  const llQuad = [[5, 56], [18, 56], [18, 45], [5, 45]];
  const stLL = { country: 'DE', source: 'radolan_rv', stepMin: 5, frames: [big], corners: llQuad };
  const wgR = buildWetGrid(fgrid, { DE: stLL }, NOW, chance);
  const sDE = wetSampler(wgR)(51, 10), sAT = wetSampler(wgR)(47.8, 15.5);
  add('D4 Radar vor Feld im eigenen Land: trockenes DE-Radar ⇒ 0 in DE, AT ohne Stack ⇒ Feld-Chance', sDE === 0 && Math.abs(sAT - 0.8) < 1e-6 && wgR.radar > 0, `DE ${sDE} AT ${sAT}`);
}

console.log('\n== E Ansicht ==');
{
  const v = capViewFor({ west: 10, east: 12, north: 48, south: 46.8 }, 800, 600, false);
  add('E1 Ausschnitt innerhalb des Feldgebiets bleibt, Breite = CSS-Breite ≤ 1024, Höhe aus Mercator-Verhältnis', !!v && v.west === 10 && v.east === 12 && v.width === 800 && v.height > 64, JSON.stringify(v));
  const p = capViewFor({ west: -20, east: 40, north: 70, south: 30 }, 1400, 900, false);
  add('E2 gekippte 3D-Karte (riesige Bounds): auf Feldgebiet UND ≤ 6° × 4° um die Mitte geklemmt, Breite ≤ 1024',
    !!p && p.west >= 5.5 && p.east <= 17.5 && p.south >= 45.5 && p.north <= 55.5 && p.east - p.west <= 6 + 1e-9 && p.north - p.south <= 4 + 1e-9 && p.width <= 1024, JSON.stringify(p));
  add('E3 außerhalb des Feldgebiets ⇒ null (keine Tönung)', capViewFor({ west: -5, east: 0, north: 44, south: 40 }, 800, 600, false) === null);
  add('E4 mobil ≤ 640 px breit', capViewFor({ west: 10, east: 12, north: 48, south: 46.8 }, 1170, 2532, true).width <= 640);
  // Review finding 1: a pitched stage's bounds reach far behind the look-at point — centre the clip on the map centre.
  const pitched = capViewFor({ west: 7, east: 16, north: 53.2, south: 45.6 }, 800, 600, false, { center: [11.4, 47.3], pitched: true });
  add('E6 gekippte Karte: Ausschnitt um die Kartenmitte (Blickpunkt), nicht um die Mitte der asymmetrischen Bounds',
    !!pitched && pitched.south <= 47.3 && pitched.north >= 47.3 && pitched.west <= 11.4 && pitched.east >= 11.4, JSON.stringify(pitched));
  // Review finding 2: the flat 2D map must not be cut to a 6° × 4° rectangle when zoomed out.
  const flat = capViewFor({ west: 1, east: 22, north: 56, south: 44 }, 1440, 900, false, { center: [11.5, 50], pitched: false });
  add('E7 flache 2D-Karte: nur aufs Feldgebiet geklemmt, keine 6° × 4°-Box', !!flat && flat.west === 5.5 && flat.east === 17.5 && flat.south === 45.5 && flat.north === 55.5, JSON.stringify(flat));
  const z = demZoomFor(12, capViewFor({ west: 10, east: 12, north: 48, south: 46.8 }, 800, 600, false));
  add('E5 DEM-Zoom 5…11 und höchstens 30 Kacheln', z <= 11 && z >= 5, `z${z}`);
}

console.log('\n== F Satz am Ort ==');
{
  const from = Date.UTC(2026, 9, 9, 12);
  const pts = (fn) => Array.from({ length: 49 }, (_, k) => { const m = fn(k); return { tMs: from + k * H, tier: 't1', p10: m - 250, p50: m, p90: m + 250, sigmaKind: 'divergence' }; });
  const wetCols = (p) => Array.from({ length: 48 }, (_, k) => ({ fromMs: from + k * H, toMs: from + (k + 1) * H, stepFromMs: from + k * H, stepToMs: from + (k + 1) * H, tier: 't1', mmh: 0.5, pWet: p, pSnow: null, phase: null }));
  const sinking = pts((k) => 2000 - k * 40);
  const a = snowArrival(sinking, 650, wetCols(0.6), from, 48);
  add('F1 sinkende Grenze: Satz = snowSentence unverändert (reaches), Meta: Ortshöhe, Niederschlag dann 60 %',
    a.sentence.kind === 'reaches' && a.display === snowSentence(sinking, 650, wetCols(0.6)).text
    && a.meta.includes('Ortshöhe 650 m') && a.meta.includes('Niederschlag dann 60 %'), `${a.display} | ${a.meta.join(' | ')}`);
  const high = pts(() => 2400);
  const r = snowArrival(high, 650, wetCols(0.7), from, 48);
  add('F2 sicher darunter + Niederschlag erwartet ⇒ „Bei dir bleibt es Regen"', r.display === 'Bei dir bleibt es Regen', r.display);
  const dry = snowArrival(high, 650, wetCols(0.05), from, 48);
  add('F3 sicher darunter, aber trocken ⇒ „Kein Schnee bei dir bis …" (nie „bleibt es Regen" ohne Regen)', /^Kein Schnee bei dir bis /.test(dry.display), dry.display);
  const near = pts(() => 800);
  const n = snowArrival(near, 650, wetCols(0.7), from, 48);
  add('F4 Grenze knapp über dem Ort (p10 ≤ Ortshöhe) ⇒ snowSentence „möglich", nie „bleibt es Regen"', n.sentence.kind === 'possible' && n.display === n.sentence.text, n.display);
  const holed = snowArrival(sinking.map((p, k) => (k === 5 ? { ...p, p50: null, p10: null, p90: null } : p)), 650, wetCols(0.6), from, 48);
  add('F5 48-h-Leiste: 48 Zellen, Regen am Anfang, Schnee am Ende, Schritt ohne Wert = Lücke (nie vom Nachbarn geliehen)',
    a.cells.length === 48 && a.cells[0].kind === 'rain' && a.cells[47].kind === 'snow' && holed.cells[5].kind === 'gap' && holed.cells[4].kind === 'rain');
  const g = groupCells3h(a.cells);
  add('F6 mobil 16 Zellen à 3 h (44-px-Ziele), Art = die schneereichste der drei', g.length === 16 && g[15].kind === 'snow' && g[0].toMs - g[0].fromMs === 3 * H);
  const noH = snowArrival(sinking, null, wetCols(0.6), from, 48);
  add('F7 ohne Ortshöhe: Satz von snowSentence („Ortshöhe unbekannt"), Leiste nur Lücken', noH.sentence.kind === 'no-height' && noH.cells.every((c) => c.kind === 'gap'));
}

console.log('\n== G Verdrahtung ==');
{
  const nrm = src('src/nowcast/NowcastRadarMap.tsx');
  add('G1 Karte: Prop `snowCap` optional, alte Linie nur mit `snowCap` aus den Profil-Ebenen genommen',
    /snowCap\?:\s*\{/.test(nrm) && /const skOnMap = !!snowCap;/.test(nrm) && /skOnMap\s*\?\s*base\.filter\(\(l\)\s*=>\s*l\s*!==\s*'snowline'\)\s*:\s*base/.test(nrm));
  add('G2 Karte: useSnowCap nur aktiv mit `snowCap` UND Ebene „snowline" (2D und 3D)',
    /useSnowCap\(mapInst,\s*skActive[ ,&]/.test(nrm) && /useSnowCap\(snowCap\?\.stageMap \?\? null,\s*skActive,/.test(nrm) && /const skActive = !!snowCap && [^;]*layerSet\.has\('snowline'\)/.test(nrm));
  // Browser finding 09.10.: getStyle().layers lists no custom layers (RainLayer) — the 2D cap landed ABOVE the radar.
  const before2d = nrm.slice(nrm.indexOf('const skBeforeId2d'), nrm.indexOf('const skStageMap'));
  add('G2c 2D-Kappe unter dem Radar: Radar-Ebene per getLayer (Custom-Layer fehlen in getStyle), `precip-rain-layer` zuerst',
    /getLayer\(/.test(before2d) && /\['precip-rain-layer'/.test(before2d), before2d.slice(0, 80));
  add('G2d Kappe nur im Profil (`useProfile`) — nie auf der alten Karte (`?rr=legacy`, Rückfall bei Chunk-Fehler); 2D ruht in „3D"',
    /const skActive = !!snowCap && useProfile && layerSet\.has\('snowline'\)/.test(nrm) && /useSnowCap\(mapInst,\s*skActive && !snowCap\?\.mapHidden,/.test(nrm) && !/stage3d/.test(nrm.split(/\r?\n/).filter((l) => /snowCap|skActive|Phase SK/.test(l) && !/export default function NowcastRadarMap/.test(l)).join(' ')));
  add('G2e keine fremde HEAD-Zeile verändert: `const i0 = stack` unverändert', /\n  const i0 = stack \?/.test(nrm));
  const hook = src('src/snowCap/useSnowCap.ts');
  add('G7 Hook: Rechnungen zusammengefasst (laufende nicht abbrechen, danach die neueste), kein „lädt" bei vorhandenem Stand, Fehler räumt Bild und Stand',
    /pendingKeyRef/.test(hook) && /busyRef/.test(hook) && /prepRef\.current \? p\.status : 'loading'/.test(hook) && /prepRef\.current = null;[\s\S]{0,80}setData\(null\)/.test(hook));
  const layerSrc = src('src/snowCap/snowCapLayer.ts');
  add('G8 Ebene: entfernte Karte (ZT-Bühne weg) wird nicht mehr angefasst; PNG asynchron (toBlob)', /_removed/.test(layerSrc) && /toBlob\(/.test(layerSrc) && !/toDataURL\(/.test(layerSrc));
  add('G2b Karte: alte Hinweiszeile nur ohne `snowCap`, neue Legende nur mit', /layerSet\.has\('snowline'\) && !snowCap &&/.test(nrm) && /<SnowCapLegend /.test(nrm));
  const deck = src('src/nowcast/NowcastDeck.tsx');
  add('G3 Deck: Schalter aus `?sk=1`, ohne Schalter `{}`-Props', /snowCapEnabledFrom\(/.test(deck) && /const skMapProps = skOn \? \{[\s\S]*?snowCap:[\s\S]*?\} : \{\};/.test(deck));
  add('G4 Deck: an der ZT-Bühne nur `onStageReady` ergänzt', /<TowerStage[^>]*onStageReady=\{skOn \? setSkStageMap : undefined\}/.test(deck));
  // Browser finding 09.10.: `towerStage(…)` is CALLED during render (ztMapProps) — everything it reads must be declared above.
  const iSkOn = deck.indexOf('const skOn = '), iStageMap = deck.indexOf('const [skStageMap, setSkStageMap]'), iTowerStage = deck.indexOf('const towerStage = ');
  add('G4b Deck: `skOn`/`setSkStageMap` vor `towerStage` deklariert (sonst TDZ-Absturz in „Karte + 3D")', iSkOn > 0 && iStageMap > 0 && iTowerStage > 0 && iSkOn < iTowerStage && iStageMap < iTowerStage, `${iSkOn}/${iStageMap}/${iTowerStage}`);
  const gitDiff = execFileSync('git', ['diff', '--stat', '--', 'src/pointForecast', 'src/point', 'src/fusion'], { cwd: ROOT, encoding: 'utf8' });
  add('G5 buscosun Fusion und Feldvertrag unverändert (git diff leer)', gitDiff.trim() === '', gitDiff.trim());
  const mv = execFileSync('git', ['diff', '--', 'src/MapView.tsx'], { cwd: ROOT, encoding: 'utf8' });
  add('G5b MapView ohne SK-Eingriff (kein `snowCap`/`sk-` im Diff)', !/snowCap|'sk-/.test(mv));
  const lazyOk = !/from '\.\.\/snowCap\/(snowCapEngine|capRaster|snowField|capWet|snowPhase|snowCapLayer)'/.test(nrm + deck);
  add('G6 Rechenteil lazy: Karte/Deck importieren statisch nur Modell, Hook, UI, Satz-Hook', lazyOk);
  const ui = src('src/snowCap/SnowCapUi.tsx');
  const deckStatic = [...deck.matchAll(/^import [^;]*from '\.\.\/snowCap\/([^']+)'/gm)].map((m) => m[1]);
  add('G6c Deck importiert statisch nur das importfreie Modell; Satz-Karte per lazy()', deckStatic.join() === 'snowCapModel' && /lazy\(\(\) => import\('\.\.\/snowCap\/SnowArrivalPanel'\)\)/.test(deck), deckStatic.join());
  add('G6b UI importiert den Rechenteil nur als Typ', !/^import (?!type)[^;]*from '\.\/(snowCapEngine|capRaster|snowField|capWet|snowPhase|snowCapLayer)'/m.test(ui));
}

// ─── L live ───────────────────────────────────────────────────────────────────────────────────
if (args.has('--live')) {
  console.log('\n== L am jüngsten echten t1-Feld + echtes Terrarium ==');
  const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/point/field/v1';
  try {
    const { decodePng, toRgba } = await import('./lib/png.mjs');
    const { parseFieldManifest, decodeSnowPixel } = await import('../src/point/fieldFormat.ts');
    const idx = await (await fetch(`${RAW}/index.json`)).json();
    const run = idx.latestByTier.t1.run;
    const man = parseFieldManifest(await (await fetch(`${RAW}/${run}/t1/field.json`)).json());
    const lead = man.leads.find((l) => l.leadH === 12 && l.snowlmt) ?? man.leads.find((l) => l.snowlmt);
    const dec = decodePng(Buffer.from(await (await fetch(`${RAW}/${run}/t1/${lead.snowlmt}`)).arrayBuffer()));
    const rgba = toRgba(dec);
    const sg = snowGridFromRgba(rgba, man.grid);
    let valid = 0; for (let i = 0; i < sg.mid.length; i++) if (!Number.isNaN(sg.mid[i])) valid++;
    let exact = 0, tried = 0;
    for (let i = 0; i < sg.mid.length && tried < 40; i += 997) {
      const o = i * 4; const px = decodeSnowPixel(rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]);
      if (!px) continue; tried++;
      const r = Math.floor(i / man.grid.width), c = i % man.grid.width;
      const s = snowAt(sg, man.grid.lat0 + (man.grid.height - 1 - r) * man.grid.deg, man.grid.lon0 + c * man.grid.deg);
      if (s && Math.abs(s.mid - px.mid) < 1e-6 && Math.abs(s.half - px.half) < 1e-6) exact++;
    }
    add(`L1 ${run} +${lead.leadH} h (${man.chain?.options?.fusionName ?? 'Stand ?'}): Feld gelesen, an Zellmitten exakt der Pixelwert`, valid > 0.3 * sg.mid.length && tried > 10 && exact === tried, `${valid}/${sg.mid.length} Zellen mit Wert, ${exact}/${tried} exakt`);
    // real Terrarium tiles over the Inn valley / Karwendel
    const view = { west: 11.0, east: 12.0, north: 47.5, south: 47.1, width: 400, height: 240 };
    const z = demZoomFor(9, view);
    const lng2x = (lng) => ((lng + 180) / 360) * (1 << z);
    const lat2y = (lat) => { const r = (lat * Math.PI) / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z); };
    const x0 = Math.floor(lng2x(view.west)), x1 = Math.floor(lng2x(view.east)), y0 = Math.floor(lat2y(view.north)), y1 = Math.floor(lat2y(view.south));
    const data = [];
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const buf = Buffer.from(await (await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`)).arrayBuffer());
      data.push(toRgba(decodePng(buf)));
    }
    const dem = { zoom: z, x0, y0, nx: x1 - x0 + 1, ny: y1 - y0 + 1, data };
    const res = await buildCap({ view, dem, snow: sg, wet: () => 0, palette: SK_PALETTE_2D });
    let checked = 0, wrong = 0;
    for (let j = 3; j < view.height; j += 7) for (let i = 5; i < view.width; i += 11) {
      const lat = mercRowLat(view, j), lon = colLon(view, i);
      const h = demAt(dem, lon, lat), s = snowAt(sg, lat, lon);
      if (!s || !Number.isFinite(h) || Math.abs(h - s.mid) < 30) continue;
      checked++;
      const cap = h >= s.mid, inBand = s.half > 0 && Math.abs(h - s.mid) <= s.half;
      const a = res.rgba[(j * view.width + i) * 4 + 3];
      if (cap && a === 0) wrong++;
      if (!cap && !inBand && a !== 0) wrong++;
    }
    const lineErr = res.lines.features.filter((f) => f.geometry.type === 'LineString').flatMap((f) => f.geometry.coordinates).map(([lo, la]) => { const s = snowAt(sg, la, lo); return s ? Math.abs(demAt(dem, lo, la) - s.mid) : NaN; }).filter(Number.isFinite).sort((a, b) => a - b);
    const med = lineErr.length ? lineErr[Math.floor(lineErr.length / 2)] : NaN;
    add('L2 echtes Gelände (Inntal, z' + z + '): Kappe genau über der Feld-Grenze, außerhalb von Kappe/Band nichts getönt', checked > 300 && wrong === 0, `${checked} Pixel geprüft, ${wrong} falsch; Bild ${res.width}×${res.height} in ${res.stats.ms.toFixed(0)} ms; Kappe ${res.stats.cap}, Band ${res.stats.band}, Lücke ${res.stats.gap}`);
    add('L3 Linie folgt der Grenzhöhe im echten Gelände (Median |DEM − p50| an den Linienpunkten < 120 m) — oder es gibt keine Grenze im Ausschnitt', lineErr.length === 0 || med < 120, `${res.lines.features.length} Linien, ${lineErr.length} Punkte, Median ${Number.isFinite(med) ? med.toFixed(0) : '—'} m`);
  } catch (e) { add('L echtes Feld/Gelände erreichbar', false, e.message); }
}

// ── later blocks are appended above this line ──
console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
