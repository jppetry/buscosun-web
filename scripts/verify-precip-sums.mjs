/**
 * verify-precip-sums.mjs — Phase NS (audit/niederschlagssummen.md §9/§10): Niederschlagssummen im Regenradar.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-precip-sums.mjs
 *        [--fields=<dir>]   Ausgabe von build-point-fields (`<dir>/field/v1/<lauf>/<stufe>`) für Block F; fehlt ⇒ F ⊘
 *        [--raw=<dir>]      echte Dateien rw<HHMM>.h5, cpc<HHMM>.h5, inca-range.nc für H10; fehlt ⇒ H10 ⊘
 *        [--live]           obs/v1, point/field/v1 und precipsum/v1 im Daten-Repo (nur lesend)
 *
 * A Modell: Fenster, Schalter `?sum=0`, Palette (ruhig, getrennt von der Intensität), Zahlen (0 gemessen ≠ Lücke).
 * B Erwartungssumme am Ort (`fusionWindowSum`): Hand-Fälle, Teilstücke, Zwischenstunden zählen nie (mit Gegenprobe),
 *   Stufen ohne Überlapp, Station nur in unbelegter Zeit, Lücke ≠ 0, Spanne nur innerhalb EINES Schritts.
 * C Gefallen (`obsWindowSum`) an echter Datenform (`fixtures/precip-sums-obs.json`, Auszug obs/v1): 1 h und 24 h gegen
 *   die Summen des Spiegels (`rr1h`/`rr24h`, unabhängig gerechnet), fehlend ≠ 0, Stationswahl, 48 h ⇒ Lücke.
 * D Radar-Nowcast-Summe: Rechteckregel, Teilstück, Sättigung ⇒ „mindestens", Lücke in den Frames.
 * E Kartenfeld kumuliert: Kodierung im Rundlauf, Interpolation, erstes Intervall, fehlt ⇒ null; Zusammensetzung auf dem
 *   Gitter (Radar → Feld, t1 → t2, CH ohne Radar, Lücke statt Teilsumme); Bild in Mercator-Zeilen.
 * F (mit --fields) Producer an echten Läufen: C monoton, Differenz je Vorlauf = Mittel der Hürde aus dem UNABHÄNGIGEN
 *   Weg über Chance/Median/q90 (wo σ rückrechenbar) innerhalb der Log-Stufe; Negativkontrolle mit verschobenem Vorlauf.
 * G Verdrahtung: Deck, Karte, `?sum=0`-Weg.
 * H Gefallen als Fläche (Stufe B2/B3, `precipsum/v1`): Fenstersumme je Land, Kodierung + Zustände, Client-Leser, DACH-Maske,
 *   Lauf an synthetischen Feldern, Wartestufe, INCA-Blöcke, Zeit-/Namensregeln, Speicher; mit --raw=<dir> die Leser an
 *   echten RW-/CombiPrecip-/INCA-Dateien.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, toRgba } from './lib/png.mjs';
import { rrSum } from './obs/obs-mirror.mjs';
import {
  SUM_WINDOWS_H, SUM_STOPS, sumColor, sumsEnabledFrom, fmtMeasuredMm, fmtExpectedMm, isSumWindow,
} from '../src/precipSums/sumModel.ts';
import { fusionWindowSum, barsOf, sumStepsFromV2, SUM_TIER_STEP_H } from '../src/precipSums/fusionWindowSum.ts';
import { obsWindowSumFromSeries, nearestRainStation, stationSumPoints, obsGapReason, OBS_SUM_MAX_KM } from '../src/precipSums/obsWindowSum.ts';
import { radarWindowSum } from '../src/precipSums/radarWindowSum.ts';
import { cumAt, cumWindow, cumPixelOf, leadsFor } from '../src/precipSums/fieldCum.ts';
import { composeFutureSum, renderSumRgba, sumGeometry, sumImageHeight, FLAG_FIELD, FLAG_RADAR, FLAG_SATURATED } from '../src/precipSums/sumGrid.ts';
import { encodePrecipCumPixel, decodePrecipCumPixel, decodePrecipPixel, fieldGrid, parseFieldManifest, PRECIP_CUM_UNIT_MM } from '../src/point/fieldFormat.ts';
import { TIER_BY_ID } from '../src/point/cubeFormat.ts';
import { G } from '../src/scalar/precipIndexMap.ts';
import { PALETTES } from '../src/radar/radarModel.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const H = 3_600_000, MIN = 60_000;
let pass = 0, fail = 0, skip = 0;
function add(name, ok, detail = '') { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); }
function skipped(name, why) { skip++; console.log(`⊘     ${name} — ${why}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ─── A Modell ─────────────────────────────────────────────────────────────────────────────────
console.log('\n== A Modell ==');
add('A1 Fenster 1 · 3 · 6 · 12 · 24 · 48 h', JSON.stringify(SUM_WINDOWS_H) === '[1,3,6,12,24,48]' && isSumWindow(6) && !isSumWindow(2));
add('A2 `?sum=0` schaltet ab, alles andere an (exakt wie `?pf=live`)',
  sumsEnabledFrom('') && sumsEnabledFrom('?sum=1') && sumsEnabledFrom('?x=0') && !sumsEnabledFrom('?sum=0') && !sumsEnabledFrom('?a=1&sum=0'));
{
  // ruhig: hell → blau → violett — Helligkeit fällt monoton, Rot nie über Blau (kein Gelb/Rot der Intensität)
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  let mono = true, cool = true;
  for (let i = 1; i < SUM_STOPS.length; i++) if (lum(SUM_STOPS[i].rgb) > lum(SUM_STOPS[i - 1].rgb) + 1e-9) mono = false;
  for (const s of SUM_STOPS) if (s.rgb[0] > s.rgb[2] || s.rgb[1] > s.rgb[2] + 20) cool = false;
  const intensity = Object.values(PALETTES.classic.bandColors).map((c) => String(c).toLowerCase());
  const overlap = SUM_STOPS.filter((s) => intensity.includes(`#${s.rgb.map((x) => x.toString(16).padStart(2, '0')).join('')}`));
  add('A3 Palette: Helligkeit fällt monoton, nur kühle Töne (B ≥ R), keine Farbe der Intensitäts-Palette', mono && cool && overlap.length === 0);
  add('A4 unter 0,1 mm durchsichtig, darüber Farbe; zwischen Stufen interpoliert',
    sumColor(0.05) === null && sumColor(0) === null && Array.isArray(sumColor(0.1)) && JSON.stringify(sumColor(1000)) === JSON.stringify([...SUM_STOPS.at(-1).rgb]));
}
add('A5 Zahlen: gemessen 0 = „0 mm" (ein Wert), < 0,1 benannt; Erwartung gerundet („etwa"), nie „0 mm"',
  fmtMeasuredMm(0) === '0 mm' && fmtMeasuredMm(0.04) === '< 0,1 mm' && fmtMeasuredMm(4.24) === '4,2 mm' && fmtMeasuredMm(12.6) === '13 mm'
  && fmtExpectedMm(0) === 'kaum (< 0,1 mm)' && fmtExpectedMm(3.2) === 'etwa 3 mm' && fmtExpectedMm(2.3) === 'etwa 2,5 mm' && fmtExpectedMm(0.44) === 'etwa 0,4 mm' && fmtExpectedMm(17.4) === 'etwa 17 mm',
  [fmtExpectedMm(3.2), fmtExpectedMm(2.3), fmtExpectedMm(0.44)].join(' | '));

// ─── B Erwartungssumme am Ort ─────────────────────────────────────────────────────────────────
console.log('\n== B Erwartungssumme am Ort (buscosun Fusion) ==');
const T0 = Date.UTC(2026, 9, 8, 12);
const hourly = (n, mean, from = T0, extra = {}) => Array.from({ length: n }, (_, i) => ({ validAtMs: from + (i + 1) * H, tier: 't1', interpolated: false, mean: typeof mean === 'function' ? mean(i) : mean, radar: false, ...extra }));
{
  const r = fusionWindowSum(hourly(10, 1), T0, 6);
  add('B1 6 × 1 mm/h ab voller Stunde ⇒ 6 mm, vollständig, eine Herkunft', near(r.mm, 6) && r.complete && r.kinds.join() === 'cube' && r.missing.length === 0, `${r.mm}`);
  const r2 = fusionWindowSum(hourly(10, (i) => i + 1), T0 + 30 * MIN, 3);
  // (12:30, 15:30]: ½·1 + 2 + 3 + ½·4 = 7,5
  add('B2 Teilstücke an beiden Rändern anteilig (12:30–15:30 bei 1,2,3,4 mm/h ⇒ 7,5 mm)', near(r2.mm, 7.5) && r2.complete, `${r2.mm}`);
}
{
  const steps = [...hourly(6, 1), ...Array.from({ length: 6 }, (_, i) => ({ validAtMs: T0 + i * H + 30 * MIN, tier: 't1', interpolated: true, mean: 100, radar: false }))];
  const r = fusionWindowSum(steps, T0, 6);
  // Gegenprobe: dieselben Zwischenstunden als „nativ" (und zuerst in der Liste) — dann belegen sie Zeit und ändern die Summe.
  const neg = fusionWindowSum([...steps.slice(6).map((s) => ({ ...s, interpolated: false })), ...steps.slice(0, 6)], T0, 6);
  add('B3 interpolierte Zwischenstunden zählen nie (Gegenprobe: als nativ behandelt ändern sie die Summe)', near(r.mm, 6) && !near(neg.mm, 6), `${r.mm} gegen ${neg.mm.toFixed(1)}`);
}
{
  // t2: Schritt 15:00 = Mittel über (12, 15] mit 2 mm/h; Fenster (13, 14] ⇒ 2 mm
  const t2 = [{ validAtMs: T0 + 3 * H, tier: 't2', interpolated: false, mean: 2, radar: false }, { validAtMs: T0 + 6 * H, tier: 't2', interpolated: false, mean: 0.5, radar: false }];
  const r = fusionWindowSum(t2, T0 + H, 1);
  const r6 = fusionWindowSum(t2, T0, 6);
  add('B4 3-h-Stufe: Rate gilt über (t − 3 h, t] (13–14 Uhr ⇒ 2 mm; 12–18 Uhr ⇒ 6 + 1,5 = 7,5 mm)', near(r.mm, 2) && near(r6.mm, 7.5) && SUM_TIER_STEP_H.t2 === 3, `${r.mm} · ${r6.mm}`);
  const withSt = [...t2, ...[1, 2, 4, 5].map((k) => ({ validAtMs: T0 + k * H, tier: 'station', interpolated: false, mean: 50, radar: false }))];
  const rs = fusionWindowSum(withSt, T0, 6);
  add('B5 Stationsstunden INNERHALB eines Cube-Intervalls zählen nicht doppelt', near(rs.mm, 7.5) && rs.kinds.join() === 'cube', `${rs.mm}`);
  const fill = fusionWindowSum([{ validAtMs: T0 + 3 * H, tier: 't2', interpolated: false, mean: 2, radar: false }, ...[4, 5, 6].map((k) => ({ validAtMs: T0 + k * H, tier: 'station', interpolated: false, mean: 1, radar: false }))], T0, 6);
  add('B6 Station füllt nur unbelegte Zeit (12–15 Cube, 15–18 Station ⇒ 6 + 3 = 9 mm, Naht benannt)', near(fill.mm, 9) && fill.complete && fill.seams.length === 1 && fill.seams[0].to === 'station', `${fill.mm} · ${JSON.stringify(fill.seams.map((x) => x.to))}`);
}
{
  const steps = hourly(6, 1).filter((s) => s.validAtMs !== T0 + 3 * H);
  const r = fusionWindowSum(steps, T0, 6);
  add('B7 fehlende Stunde ⇒ unvollständig, die Lücke benannt (nie als 0 mm durchgereicht)', !r.complete && r.missing.length === 1 && r.missing[0].fromMs === T0 + 2 * H && near(r.coveredH, 5) && near(r.mm, 5), `${r.coveredH} h belegt`);
  const nanStep = fusionWindowSum(hourly(6, (i) => (i === 2 ? null : 1)), T0, 6);
  add('B8 Schritt ohne Verteilung (mean null) ⇒ Lücke, nicht 0', !nanStep.complete && nanStep.missing.length === 1);
}
{
  const steps = hourly(6, 1, T0, { q10: 0.2, q90: 3 });
  const r = fusionWindowSum(steps, T0, 6);
  const bars1 = barsOf(r.pieces, T0, T0 + 6 * H, 1);
  const bars2 = barsOf(r.pieces, T0, T0 + 6 * H, 2);
  const barsQ = barsOf(r.pieces, T0, T0 + 6 * H, 0.25);
  add('B9 Spanne nur in EINEM Schritt: 1-h-Balken p10…p90 × 1 h, Viertelstunde × ¼; 2-h-Balken (zwei Schritte) ohne Spanne',
    bars1.every((b) => b.range && near(b.range[0], 0.2) && near(b.range[1], 3)) && bars2.every((b) => b.range === null && near(b.mm, 2))
    && barsQ.every((b) => b.range && near(b.range[1], 0.75)), `2-h-Balken: ${JSON.stringify(bars2[0])}`);
  // Negativkontrolle: wer die p90 der Stunden addiert, bekäme 18 mm „oben" für 6 h — die Summe trägt keine solche Zahl
  add('B10 die Summe trägt keine addierten Quantile (kein Feld mit Σ p90)', !Object.keys(r).some((k) => /q90|p90|range/i.test(k)));
}
{
  const v2 = { axis: { steps: [
    { validAtMs: T0 + H, tier: 't1', interpolated: false, members: [{ product: 'nowcast', tag: 'nc' }, { product: 'cube-t1', tag: 'c1' }], flags: [], vars: { precip: { mean: 1.2, p10: 0, p90: 3, members: [{ tag: 'nc', weight: 0.6, value: 2 }, { tag: 'c1', weight: 0.4, value: 0.5 }] } } },
    { validAtMs: T0 + 2 * H, tier: 't1', interpolated: false, members: [{ product: 'nowcast', tag: 'nc' }], flags: [], vars: { precip: { mean: 0.4, p10: 0, p90: 1, members: [{ tag: 'nc', weight: 0, value: 0 }] } } },
    { validAtMs: T0 + 2 * H + 30 * MIN, tier: 't1', interpolated: true, members: [], flags: ['interpolated'], vars: { precip: { mean: 9, members: [] } } },
    { validAtMs: T0 + 3 * H, tier: 'anchor', interpolated: false, members: [], flags: [], vars: { precip: null } },
  ] } };
  const st = sumStepsFromV2(v2);
  add('B11 V2 → Schritte: Radar nur mit Gewicht > 0, Interpolation markiert, fremde Stufen weg, p10/p90 durchgereicht',
    st.length === 3 && st[0].radar && !st[1].radar && st[2].interpolated && st[0].q90 === 3, JSON.stringify(st.map((s) => [s.tier, s.radar, s.interpolated])));
}

// ─── C Gefallen (Stationen, echte Datenform) ──────────────────────────────────────────────────
console.log('\n== C Gefallen (obs/v1, echte Datenform) ==');
const fx = JSON.parse(readFileSync(join(ROOT, 'scripts/lib/fixtures/precip-sums-obs.json'), 'utf8'));
{
  // Referenz: `rrSum` des Spiegels (scripts/obs/obs-mirror.mjs, eigener Weg über Stempel-Maps) auf DENSELBEN Reihen,
  // Ende = jüngster Niederschlagswert. (`latest.rr1h` eignet sich nicht — es endet am jüngsten Stempel irgendeiner Größe, V-NS-8.)
  let cmp1 = 0, ok1 = 0, cmp24 = 0, ok24 = 0, worst = '';
  for (const [src, doc] of Object.entries(fx.series)) {
    const t0 = Date.parse(doc.t0);
    for (const [id, cols] of Object.entries(doc.stations)) {
      const st = new Map();
      cols.rr.forEach((v, i) => { if (v != null) st.set(t0 + i * 10 * MIN, { rr: v }); });
      if (!st.size) continue;
      const end = Math.max(...st.keys());
      for (const w of [1, 3, 6, 12, 24]) {
        const ref = rrSum(st, end, w);
        const r = obsWindowSumFromSeries(doc, id, cols.rr, w, end + 5 * MIN);
        if (!r) continue;
        const good = r.complete === ref.complete && r.n === ref.n && r.of === ref.of && Math.abs(r.mm - ref.mm) < 0.051;
        if (w !== 24) { cmp1++; if (good) ok1++; } else { cmp24++; if (good) ok24++; }
        if (!good) worst ||= `${src} ${id} ${w} h: wir ${r.mm}/${r.n}/${r.of} Spiegel ${ref.mm}/${ref.n}/${ref.of}`;
      }
    }
  }
  add('C1 1 · 3 · 6 · 12 · 24 h aus den Reihen = `rrSum` des Spiegels auf denselben Werten, samt Vollständigkeit',
    cmp1 >= 20 && ok1 === cmp1 && cmp24 >= 8 && ok24 === cmp24, `1–12 h ${ok1}/${cmp1}, 24 h ${ok24}/${cmp24}${worst ? ` · ${worst}` : ''}`);
  // V-NS-8 als Befund festhalten: am echten `latest` weicht `rr1h` dort ab, wo der Niederschlag später kommt als andere Größen.
  let lag = 0;
  for (const [, doc] of Object.entries(fx.series)) for (const [id, cols] of Object.entries(doc.stations)) {
    const l = fx.latest[id]; if (!l?.rr1h) continue;
    const t0 = Date.parse(doc.t0); let li = -1; cols.rr.forEach((v, i) => { if (v != null) li = i; });
    if (li >= 0 && Date.parse(l.t) > t0 + li * 10 * MIN && !l.rr1h.complete) lag++;
  }
  add('C1b Befund V-NS-8 in der Fixture sichtbar: Stationen, deren `latest.rr1h` wegen späterem Niederschlag unvollständig ist', lag >= 1, `${lag} Stationen`);
}
{
  const doc = { t0: '2026-10-08T00:00:00.000Z', n: 12 };
  const rr = [0.1, 0.2, null, 0.3, 0.4, 0.5, 0, 0, 0.1, null, 0.2, 0.3];
  const end = Date.parse(doc.t0) + 11 * 10 * MIN;
  const r = obsWindowSumFromSeries(doc, 'x', rr, 1, end + MIN);
  const neg = obsWindowSumFromSeries(doc, 'x', rr.map((v) => v ?? 0), 1, end + MIN);
  add('C2 fehlender 10-min-Wert ⇒ unvollständig (n 5 von 6), nicht als 0 gezählt — Gegenprobe mit 0 statt null ist „vollständig"',
    r && !r.complete && r.n === 5 && r.of === 6 && neg && neg.complete, r ? `${r.n}/${r.of}` : 'null');
  add('C3 Fenster endet am jüngsten Wert; zu alt (> 90 min) ⇒ keine Messung; länger als die Reihe ⇒ keine Messung',
    r?.endMs === end && obsWindowSumFromSeries(doc, 'x', rr, 1, end + 91 * MIN) === null && obsWindowSumFromSeries(doc, 'x', rr, 3, end) === null);
}
{
  const cat = fx.catalog, latest = fx.latest;
  const wet = cat.find((s) => s.vars?.includes('rr'));
  const now = Date.parse(latest[wet.id].t) + 5 * MIN;
  const st = nearestRainStation(cat, latest, wet.lat + 0.01, wet.lon + 0.01, now);
  const far = nearestRainStation(cat, latest, wet.lat + 0.5, wet.lon, now);
  const noRr = cat.find((s) => !s.vars?.includes('rr'));
  const atNoRr = nearestRainStation([noRr], latest, noRr.lat, noRr.lon, now);
  const stale = nearestRainStation(cat, latest, wet.lat, wet.lon, now + 3 * H);
  add('C4 Stationswahl: nächste mit Niederschlag ≤ 10 km und frischem Stempel; ohne rr / zu weit / veraltet ⇒ keine',
    st?.station.id === wet.id && st.distKm < 2 && far === null && atNoRr === null && stale === null && OBS_SUM_MAX_KM === 10, st ? `${st.station.name} ${st.distKm.toFixed(2)} km` : 'keine');
  add('C5 48 h ⇒ Lücke mit Grund (Reihen reichen 26 h)', /26 h/.test(obsGapReason(48, st)) && /10 km/.test(obsGapReason(6, null)));
  // Eine echte Station mit einem fehlenden Wert mitten im 6-h-Fenster (Kopie, Wert auf null gesetzt).
  const [src0, doc0] = Object.entries(fx.series)[0];
  const [id0, col0] = Object.entries(doc0.stations)[0];
  let li0 = -1; col0.rr.forEach((v, i) => { if (v != null) li0 = i; });
  const holed = col0.rr.slice(); holed[li0 - 10] = null;
  const series2 = { ...fx.series, [src0]: { ...doc0, stations: { ...doc0.stations, [id0]: { rr: holed } } } };
  const pts = stationSumPoints(cat, latest, series2, 6, now + 30 * MIN);
  const all = Object.values(fx.series).reduce((n, d) => n + Object.keys(d.stations).length, 0);
  const full = stationSumPoints(cat, latest, fx.series, 6, now + 30 * MIN);
  add('C6 Kartenpunkte nur mit vollständiger Summe (eine Lücke im Fenster ⇒ die Station fehlt), ohne Reihen keine Punkte',
    full.some((p) => p.id === id0) && !pts.some((p) => p.id === id0) && pts.length === full.length - 1 && stationSumPoints(cat, latest, null, 6, now).length === 0,
    `${full.length} von ${all} ⇒ mit Lücke ${pts.length}`);
}

// ─── D Radar-Nowcast ──────────────────────────────────────────────────────────────────────────
console.log('\n== D Radar-Nowcast-Summe ==');
{
  const frame = (k, v) => ({ values: new Uint8Array([v, 255, 0, 51]), width: 2, height: 2, timeMs: T0 + k * 5 * MIN, measured: false });
  const frames = Array.from({ length: 24 }, (_, k) => frame(k + 1, 51));     // 51/255·20 = 4 mm/h
  const r = radarWindowSum(frames, T0, T0 + H, 5, 20);
  add('D1 12 Frames à 4 mm/h über 1 h ⇒ 4 mm; Byte 255 ⇒ Sättigung gezählt; 0 bleibt 0',
    r && near(r.mm[0], 4, 1e-5) && near(r.mm[1], 20, 1e-4) && r.sat[1] === 12 && r.sat[0] === 0 && r.mm[2] === 0 && r.coveredToMs === T0 + H, r ? `${r.mm[0].toFixed(3)} · sat ${r.sat[1]}` : 'null');
  const r2 = radarWindowSum(frames, T0 + 2.5 * MIN, T0 + H, 5, 20);
  add('D2 „jetzt" zwischen zwei Frames: erstes Stück anteilig (½ Frame)', r2 && near(r2.mm[0], 4 * (57.5 / 60), 1e-5), r2 ? r2.mm[0].toFixed(4) : 'null');
  const r3 = radarWindowSum(frames, T0, T0 + 3 * H, 5, 20);
  add('D3 Fenster länger als der Nowcast ⇒ Summe endet am Nowcast (coveredToMs 2 h), der Rest bleibt offen', r3 && r3.coveredToMs === T0 + 2 * H && near(r3.mm[0], 8, 1e-5));
  const gap = frames.filter((_, k) => k !== 5);
  const r4 = radarWindowSum(gap, T0, T0 + H, 5, 20);
  add('D4 fehlender Frame ⇒ Summe endet vor der Lücke (kein stilles Überspringen)', r4 && r4.coveredToMs === T0 + 25 * MIN, r4 ? new Date(r4.coveredToMs).toISOString() : 'null');
  add('D5 erster Frame lässt eine Lücke nach „jetzt" ⇒ keine Summe', radarWindowSum(frames.slice(3), T0, T0 + H, 5, 20) === null);
}

// ─── E Kartenfeld kumuliert + Zusammensetzung ─────────────────────────────────────────────────
console.log('\n== E Kartenfeld (kumulierte Erwartung) und Karte ==');
{
  const px = new Uint8Array(4);
  let rt = true;
  for (const mm of [0, 0.01, 0.5, 12.34, 655.36, 99999.99]) { encodePrecipCumPixel(mm, px, 0); rt &&= near(decodePrecipCumPixel(px[0], px[1], px[2], px[3]), Math.round(mm / PRECIP_CUM_UNIT_MM) * PRECIP_CUM_UNIT_MM, 1e-6); }
  encodePrecipCumPixel(null, px, 0);
  add('E1 Kodierung 24 bit in 0,01 mm im Rundlauf (auch > 655 mm); fehlt ⇒ A 0 ⇒ null, nie 0', rt && px[3] === 0 && decodePrecipCumPixel(px[0], px[1], px[2], px[3]) === null);
}
// Synthetische Stufen auf dem echten Gitter: t1 stündlich ab T0 (Rate 1 mm/h, also C(L) = L + 1), t2 3-stündlich.
function synthTier(tierId, runAtMs, leadsH, rate, brokenPix = null) {
  const tier = TIER_BY_ID[tierId];
  const grid = fieldGrid(tier);
  const images = new Map();
  const leads = [];
  let cum = 0;
  for (const L of leadsH) {
    cum += rate * tier.stepH;
    const img = new Uint8Array(grid.width * grid.height * 4);
    for (let p = 0; p < grid.width * grid.height; p++) encodePrecipCumPixel(p === brokenPix ? null : cum, img, p * 4);
    images.set(L, img);
    leads.push({ leadH: L, validAtMs: runAtMs + L * H, file: `precipcum-${String(L).padStart(3, '0')}.png` });
  }
  return { tier: tierId, run: 'x', runAtMs, builtAtMs: runAtMs, stepH: tier.stepH, grid, leads, images, fusionName: 'buscosun Fusion 9' };
}
{
  const t1 = synthTier('t1', T0, Array.from({ length: 49 }, (_, i) => i), 1);
  const pix = cumPixelOf(t1.grid, 48.14, 11.58);
  add('E2 C(t) linear zwischen Vorläufen, im ersten Intervall ab 0 (Start = t₀ − 1 h)',
    near(cumAt(t1, pix, T0), 1) && near(cumAt(t1, pix, T0 - 0.5 * H), 0.5) && near(cumAt(t1, pix, T0 + 2.25 * H), 3.25) && cumAt(t1, pix, T0 - 2 * H) === null,
    `${cumAt(t1, pix, T0 + 2.25 * H)}`);
  add('E3 Fenster = C(Ende) − C(Anfang); Fenster über das Ende der Stufe ⇒ null', near(cumWindow(t1, pix, T0 + 0.5 * H, T0 + 6.5 * H), 6) && cumWindow(t1, pix, T0 + 40 * H, T0 + 50 * H) === null);
  add('E4 Vorlauf-Auswahl: höchstens zwei Bilder je Zeitpunkt, Lücke im Manifest ⇒ null',
    leadsFor(t1, T0 + 3 * H).length === 1 && leadsFor(t1, T0 + 3.5 * H).length === 2
    && leadsFor({ ...t1, leads: t1.leads.filter((l) => l.leadH !== 4) }, T0 + 3.5 * H + H) === null);
}
{
  const geom = sumGeometry();
  const now = T0 + 3 * H + 10 * MIN, end6 = now + 6 * H, end48 = now + 48 * H;
  const t1 = synthTier('t1', T0, Array.from({ length: 49 }, (_, i) => i), 1);                // 1 mm/h bis T0 + 48 h
  const t2 = synthTier('t2', T0 - 6 * H, Array.from({ length: 24 }, (_, i) => 51 + 3 * i), 2); // 2 mm/h ab T0 + 42 h
  const n = geom.width * geom.height;
  // DE-Radar: 2 h Nowcast mit 3 mm (je Zelle gleich), alle Zellen im Quellgitter (Index 0)
  const radarSum = { width: 1, height: 1, mm: new Float32Array([3]), sat: new Uint8Array([1]), fromMs: now, coveredToMs: now + 2 * H, frames: 24, stepMin: 5 };
  const idx = new Int32Array(n).fill(0);
  const de = { sum: radarSum, idx, label: 'DWD RADOLAN-RV' };
  const iDE = geom.country.findIndex((c) => c === 0), iCH = geom.country.findIndex((c) => c === 2);
  const r6 = composeFutureSum({ geom, nowMs: now, endMs: end6, radar: [de, null, null], cum: [t1, t2] });
  add('E5 DE: 0–2 h Radar (3 mm) + 4 h Feld (4 mm) = 7 mm, Flags Radar+Feld, gesättigt ⇒ „mindestens"',
    near(r6.mm[iDE], 7, 1e-4) && (r6.flags[iDE] & FLAG_RADAR) && (r6.flags[iDE] & FLAG_FIELD) && (r6.flags[iDE] & FLAG_SATURATED), `${r6.mm[iDE]}`);
  add('E6 CH (kein Nowcast): Feld ab „jetzt" = 6 mm, nur Flag Feld', near(r6.mm[iCH], 6, 1e-4) && r6.flags[iCH] === FLAG_FIELD, `${r6.mm[iCH]}`);
  const r1 = composeFutureSum({ geom, nowMs: now, endMs: now + H, radar: [{ ...de, sum: { ...radarSum, mm: new Float32Array([1.5]) } }, null, null], cum: [] });
  add('E7 1 h: Radar trägt das ganze Fenster — ohne Kartenfeld trotzdem ein Wert (DE), CH ohne alles ⇒ Lücke',
    near(r1.mm[iDE], 1.5, 1e-4) && Number.isNaN(r1.mm[iCH]));
  const r48 = composeFutureSum({ geom, nowMs: now, endMs: end48, radar: [de, null, null], cum: [t1, t2] });
  // DE: 3 (Radar bis now+2h) + t1 von now+2h bis T0+48h (= 48 − 5,1667 h) + t2 von T0+48h bis now+48h (3,1667 h · 2)
  const expDE = 3 + (T0 + 48 * H - (now + 2 * H)) / H * 1 + (end48 - (T0 + 48 * H)) / H * 2;
  add('E8 48 h über die Naht t1 → t2 (t1 bis zu seinem Ende, dann t2) — exakt', near(r48.mm[iDE], expDE, 1e-3), `${r48.mm[iDE].toFixed(3)} gegen ${expDE.toFixed(3)}`);
  const r48no2 = composeFutureSum({ geom, nowMs: now, endMs: end48, radar: [de, null, null], cum: [t1] });
  add('E9 ohne t2 reicht das Feld nicht ⇒ Lücke (keine Teilsumme in der Karte)', Number.isNaN(r48no2.mm[iDE]) && r48no2.stats.valid === 0);
  const pixB = cumPixelOf(t1.grid, geom.lat[iCH], geom.lon[iCH]);
  const t1b = synthTier('t1', T0, Array.from({ length: 49 }, (_, i) => i), 1, pixB);
  const rb = composeFutureSum({ geom, nowMs: now, endMs: end6, radar: [null, null, null], cum: [t1b, t2] });
  add('E10 Feldzelle fehlt (A 0) ⇒ Lücke genau dort, Nachbarzellen gerechnet', Number.isNaN(rb.mm[iCH]) && near(rb.mm[iCH + 12], 6, 1e-4) && near(rb.mm[iCH + 12 * G.w], 6, 1e-4));
  const img = renderSumRgba(r6);
  const hgt = sumImageHeight();
  // Mercator-Zeilen: die Zeile für 50° N muss die Gitterzeile von 50° N lesen
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const row50 = Math.floor(((mercY(G.latMax) - mercY(50)) / (mercY(G.latMax) - mercY(G.latMin))) * hgt);
  const linRow = Math.floor(((G.latMax - 50) / (G.latMax - G.latMin)) * hgt);
  add('E11 Bild in Mercator-Zeilen (Höhe aus der Mercator-Spanne, nicht linear in Grad)', img.height === hgt && img.width === G.w && Math.abs(row50 - linRow) > 5, `Höhe ${hgt}, 50° N Zeile ${row50} statt ${linRow}`);
  const rbImg = renderSumRgba(rb);
  let hatch = 0, dry = 0;
  for (let i = 3; i < rbImg.data.length; i += 4) { if (rbImg.data[i - 3] === 120 && rbImg.data[i - 1] === 98) hatch++; if (rbImg.data[i] === 0) dry++; }
  add('E12 Lücke grau schraffiert (Linie + Schleier), Wert in Summen-Farbe', hatch > 0 && rbImg.data.some((v, i) => i % 4 === 3 && v === Math.round(0.82 * 255)), `${hatch} Lückenpixel`);
}

// ─── F Producer an echten Läufen ───────────────────────────────────────────────────────────────
console.log('\n== F Producer (precipcum) an echten Läufen ==');
if (!args.fields) skipped('F1–F4 Producer', '--fields=<Ausgabe von build-point-fields> fehlt');
else {
  const base = join(args.fields, 'field', 'v1');
  const runs = existsSync(base) ? readdirSync(base).filter((d) => /^\d{10}$/.test(d)) : [];
  for (const run of runs) for (const tierId of ['t1', 't2', 't3']) {
    const dir = join(base, run, tierId);
    if (!existsSync(join(dir, 'field.json'))) continue;
    const man = parseFieldManifest(JSON.parse(readFileSync(join(dir, 'field.json'), 'utf8')));
    if (!man) { add(`F0 ${run}/${tierId} Manifest gültig`, false); continue; }
    const cumLeads = man.leads.filter((l) => l.precipcum);
    add(`F1 ${run}/${tierId}: jeder Vorlauf mit Niederschlag hat ein precipcum-Bild, Manifest nennt Kodierung und Einheit`,
      cumLeads.length === man.leads.filter((l) => l.precip).length && man.encoding.cumUnitMm === 0.01 && /C\(Ende\) − C\(Anfang\)/.test(man.encoding.precipcum ?? ''),
      `${cumLeads.length} Bilder`);
    const rgba = (f) => { const p = decodePng(readFileSync(join(dir, f))); return toRgba(p); };
    let prev = null, monoBad = 0, checked = 0, ok = 0, negOk = 0, worst = 0, prevPrecip = null;
    const stepH = man.stepH;
    for (let k = 0; k < cumLeads.length; k++) {
      const c = rgba(cumLeads[k].precipcum);
      const pr = rgba(cumLeads[k].precip);
      const prPrev = prevPrecip;
      for (let p = 0; p < c.length; p += 4 * 7) {
        const v = decodePrecipCumPixel(c[p], c[p + 1], c[p + 2], c[p + 3]);
        if (v == null) continue;
        const v0 = prev ? decodePrecipCumPixel(prev[p], prev[p + 1], prev[p + 2], prev[p + 3]) : 0;
        if (v0 == null) continue;
        if (v < v0 - 1e-9) monoBad++;
        // unabhängiger Weg: Mittel der Hürde aus Chance, Median | nass, q90 (wo σ rückrechenbar)
        const d = decodePrecipPixel(pr[p], pr[p + 1], pr[p + 2], pr[p + 3]);
        if (!d || d.chance < 0.2 || d.medianWet == null || !(d.q90 > 0)) continue;
        const u = (d.chance - 0.1) / d.chance;
        const z = Math.SQRT2 * erfinv(2 * u - 1);
        if (Math.abs(z) < 0.3) continue;
        const s = (Math.log(d.q90) - Math.log(d.medianWet)) / z;
        if (!(s > 0)) continue;
        const mean = d.chance * d.medianWet * Math.exp(s * s / 2);
        const dc = v - v0;
        checked++;
        const rel = Math.abs(dc - mean * stepH) / Math.max(0.02, mean * stepH);
        worst = Math.max(worst, rel);
        if (rel < 0.12) ok++;
        // Negativkontrolle: gegen den VORIGEN Vorlauf gerechnet passt es meist nicht
        if (prPrev) {
          const dp = decodePrecipPixel(prPrev[p], prPrev[p + 1], prPrev[p + 2], prPrev[p + 3]);
          if (dp && dp.medianWet != null && dp.chance >= 0.2 && dp.q90 > 0) {
            const up = (dp.chance - 0.1) / dp.chance, zp = Math.SQRT2 * erfinv(2 * up - 1);
            const sp = Math.abs(zp) >= 0.3 ? (Math.log(dp.q90) - Math.log(dp.medianWet)) / zp : NaN;
            if (sp > 0 && Math.abs(dc - dp.chance * dp.medianWet * Math.exp(sp * sp / 2) * stepH) / Math.max(0.02, mean * stepH) >= 0.12) negOk++;
          }
        }
      }
      prev = c; prevPrecip = pr;
    }
    add(`F2 ${run}/${tierId}: C monoton nicht fallend`, monoBad === 0, `${monoBad} Verletzungen`);
    add(`F3 ${run}/${tierId}: ΔC je Vorlauf = Mittel der Hürde aus dem unabhängigen Weg (Chance/Median/q90) innerhalb 12 % (Log-Stufen), ≥ 98 % der prüfbaren Zellen`,
      checked >= 200 && ok / checked >= 0.98, `${ok}/${checked} (${(100 * ok / Math.max(1, checked)).toFixed(1)} %)`);
    add(`F4 ${run}/${tierId}: Negativkontrolle — gegen den vorigen Vorlauf weicht ein großer Teil ab (die Probe trennt)`, checked < 200 || negOk / checked > 0.2, `${negOk}/${checked}`);
  }
  if (!runs.length) add('F0 Ausgabe gefunden', false, base);
}

function erfinv(x) {
  // Giles 2012, einfache Genauigkeit reicht für die Toleranz von F3
  const w = -Math.log((1 - x) * (1 + x));
  let p;
  if (w < 5) { const t = w - 2.5; p = 2.81022636e-08; for (const c of [3.43273939e-07, -3.5233877e-06, -4.39150654e-06, 0.00021858087, -0.00125372503, -0.00417768164, 0.246640727, 1.50140941]) p = c + p * t; }
  else { const t = Math.sqrt(w) - 3; p = -0.000200214257; for (const c of [0.000100950558, 0.00134934322, -0.00367342844, 0.00573950773, -0.0076224613, 0.00943887047, 1.00167406, 2.83297682]) p = c + p * t; }
  return p * x;
}

// ─── G Verdrahtung ────────────────────────────────────────────────────────────────────────────
console.log('\n== G Verdrahtung ==');
{
  const deck = readFileSync(join(ROOT, 'src/nowcast/NowcastDeck.tsx'), 'utf8');
  const map = readFileSync(join(ROOT, 'src/nowcast/NowcastRadarMap.tsx'), 'utf8');
  add('G1 Deck: Dock „Darstellung" (Desktop) und Reiter Layer (mobil), Karte am Ort im Readout und im Schnellblick',
    (deck.match(/<SumControls /g) ?? []).length === 2 && (deck.match(/<PointSumCard /g) ?? []).length === 2 && /variant="dock"/.test(deck) && /variant="mobile"/.test(deck));
  add('G2 `?sum=0`: Deck reicht weder Auswahl noch Summen weiter, die alte Band-Zeile bleibt für diesen Weg',
    /sumsOn \? sumSel : null/.test(deck) && /sumsOn \? sumSel : undefined/.test(deck) && (deck.match(/Band \$\{comma\(s\.sumMinMm\)\}/g) ?? []).length === 2 && /honestSum \? SUM6_HONEST_SUB/.test(deck));
  add('G3 Karte: in „Summe" ruht nur die Intensitäts-Ebene (precip), Legende und Hover der Summe; ohne `sum` unverändert',
    /sumMode \? layers\.filter\(\(l\) => l !== 'precip'\) : layers/.test(map) && /\{sumMode && sum && <SumLegend/.test(map) && /useSumMap\(mapInst, sum \?\? /.test(map));
  const css = readFileSync(join(ROOT, 'src/precipSums/precipSums.css'), 'utf8');
  const mq = [...css.matchAll(/@media\s*\(([^)]*)\)/g)].map((m) => m[1].trim());
  add('G4 Mobil nur über den Mobil-Breakpoint (max-width: 767px), Touch-Ziele mobil ≥ 44 px', mq.length >= 1 && mq.every((q) => q === 'max-width: 767px') && /min-height: 44px/.test(css), mq.join(' | '));
  const layer = readFileSync(join(ROOT, 'src/precipSums/sumMapLayer.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  add('G5 Karte ohne Shader: nur raster- und circle-Ebenen von MapLibre', /type: 'raster'/.test(layer) && /type: 'circle'/.test(layer) && !/customLayer|type: 'custom'|gl\.|WebGL/i.test(layer));
}

// ─── H Gefallen als Fläche (Stufe B2/B3: precipsum/v1) ───────────────────────────────────────
console.log('\n== H Gefallen als Fläche (amtliche Summen, B2/B3) ==');
{
  const PS = await import('../src/precipSums/pastSumFormat.ts');
  const D = await import('./precipsum/precipsum-derive.mjs');
  const { pastSumGridFromRgba, FLAG_OUTSIDE, FLAG_MEASURED } = await import('../src/precipSums/sumGrid.ts');
  const geom = sumGeometry();
  const n = geom.width * geom.height;
  // H1 Fenstersumme: alle Stunden gültig ⇒ Summe; eine fehlende Datei / NaN / negativ ⇒ Lücke (nie 0, nie Teilsumme)
  {
    const country = new Uint8Array([0, 1, 2, 0, 0, 0]);
    const f = (vals) => Float32Array.from(vals);
    const de = [f([1, 0, 0, 0.5, NaN, 0]), f([2, 0, 0, 0.5, 1, -1]), f([0.25, 0, 0, 0.5, 1, 0])];
    const at = [f([0, 3, 0, 0, 0, 0]), null, f([0, 3, 0, 0, 0, 0])];
    const ch = [f([0, 0, 0.1, 0, 0, 0]), f([0, 0, 0.2, 0, 0, 0]), f([0, 0, 0.3, 0, 0, 0])];
    const s3 = PS.windowSumOnGrid(country, [de, at, ch]);
    const s1 = PS.windowSumOnGrid(country, [de.slice(0, 1), at.slice(0, 1), ch.slice(0, 1)]);
    add('H1 Fenstersumme je Land; fehlende Stunde, NaN oder negativ ⇒ Lücke; das 1-h-Fenster liest nur die Stunde E',
      near(s3[0], 3.25, 1e-6) && Number.isNaN(s3[1]) && near(s3[2], 0.6, 1e-6) && near(s3[3], 1.5, 1e-6) && Number.isNaN(s3[4]) && Number.isNaN(s3[5])
      && near(s1[1], 3, 1e-6) && Number.isNaN(s1[4]) && s1[5] === 0,
      `${Array.from(s3).map((x) => x.toFixed(2)).join(' ')} | ${Array.from(s1).map((x) => x.toFixed(2)).join(' ')}`);
  }
  // H2 Kodierung im Rundlauf + drei Zustände
  {
    const buf = new Uint8Array(16);
    PS.encodePastSumPixel(12.34, buf, 0); PS.encodePastSumPixel(null, buf, 4); PS.encodePastSumOutside(buf, 8); PS.encodePastSumPixel(0, buf, 12);
    const st = [0, 4, 8, 12].map((o) => PS.pastSumCellState(buf[o + 3]));
    add('H2 Rundlauf 0,01 mm; Zustände Wert / Lücke (A 0) / außerhalb (A 128); 0 mm ist ein Wert',
      near(PS.decodePastSumPixel(buf[0], buf[1], buf[2], buf[3]), 12.34, 1e-9) && st.join() === 'value,gap,outside,value'
      && PS.decodePastSumPixel(buf[12], buf[13], buf[14], buf[15]) === 0 && PS.decodePastSumPixel(buf[8], buf[9], buf[10], buf[11]) === null, st.join());
  }
  // H3 Leser des Clients: Lücke bleibt NaN (nicht 0), außerhalb DACH gekennzeichnet; Bild: außerhalb durchsichtig, Lücke schraffiert
  {
    const rgba = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) { if (i % 3 === 0) PS.encodePastSumPixel(i % 7, rgba, i * 4); else if (i % 3 === 1) PS.encodePastSumOutside(rgba, i * 4); }
    const g = pastSumGridFromRgba(geom, rgba, geom.width, geom.height);
    let bad = 0;
    for (let i = 0; i < n; i++) {
      if (i % 3 === 0 && !((g.flags[i] & FLAG_MEASURED) && g.mm[i] === i % 7)) bad++;
      if (i % 3 === 1 && !((g.flags[i] & FLAG_OUTSIDE) && Number.isNaN(g.mm[i]))) bad++;
      if (i % 3 === 2 && !(g.flags[i] === 0 && Number.isNaN(g.mm[i]))) bad++;
    }
    // Zeile 0 des Mercator-Bilds liest Gitterzeile 0, Spalte c liest Zelle c (gleiche Breite) ⇒ Zustand je Spalte prüfbar.
    const img = renderSumRgba(g);
    let outsideDrawn = 0, gapHidden = 0;
    for (let c = 0; c < img.width; c++) {
      const a = img.data[c * 4 + 3];
      if (c % 3 === 1 && a !== 0) outsideDrawn++;
      if (c % 3 === 2 && a === 0) gapHidden++;
    }
    add('H3 Client: Lücke = NaN, außerhalb = Kennung; Bild: außerhalb durchsichtig, Lücke schraffiert',
      bad === 0 && outsideDrawn === 0 && gapHidden === 0 && g.stats.gap === Math.ceil((n - 2) / 3), `falsch ${bad} · außerhalb gezeichnet ${outsideDrawn} · Lücke unsichtbar ${gapHidden} · Lücken ${g.stats.gap}`);
  }
  // H4 DACH-Maske aus den Landesumrissen: Orte innen, Nachbarländer außen
  {
    const mask = D.dachMask(geom);
    const at = (lat, lon) => { const c = Math.floor((lon - G.lonMin) / (G.lonMax - G.lonMin) * G.w), r = Math.floor((G.latMax - lat) / (G.latMax - G.latMin) * G.h); return c >= 0 && r >= 0 && c < G.w && r < G.h ? mask[r * G.w + c] : -1; };
    const inside = [[48.14, 11.58], [52.52, 13.40], [48.21, 16.37], [47.27, 11.39], [46.95, 7.45], [46.0, 8.95], [54.3, 10.1]];
    const outside = [[45.46, 9.19], [46.05, 14.51], [50.08, 14.42], [48.58, 7.75], [49.61, 6.13], [50.63, 5.57], [48.15, 17.11], [45.70, 9.67], [45.91, 13.96], [45.81, 15.98], [45.44, 12.33]];
    const okIn = inside.filter(([a, b]) => at(a, b) === 1).length, okOut = outside.filter(([a, b]) => at(a, b) === 0).length;
    const share = mask.reduce((s, x) => s + x, 0) / n;
    add('H4 DACH-Maske (public/countries): München, Berlin, Wien, Innsbruck, Bern, Lugano, Kiel innen; Mailand, Ljubljana, Prag, Straßburg, Luxemburg, Lüttich, Bratislava, Bergamo, Slowenien, Zagreb, Venedig außen (alle im Gitter G)',
      okIn === inside.length && okOut === outside.length && share > 0.3 && share < 0.7, `innen ${okIn}/${inside.length} · außen ${okOut}/${outside.length} · Anteil ${(share * 100).toFixed(1)} %`);
  }
  // H5 buildRun an synthetischen Stundenfeldern: Land je Zelle aus seiner Quelle, Lücke je Land, außerhalb gekennzeichnet
  {
    const E = Date.UTC(2026, 9, 8, 19);
    const fill = (v) => new Float32Array(n).fill(v);
    const hours = (v, upto = 48) => new Map(Array.from({ length: upto }, (_, k) => [E - k * H, fill(v)]));
    const run = D.buildRun({ endMs: E, fields: { DE: hours(0.1), AT: hours(0.5, 6), CH: hours(1) } });
    const img = run.images[PS.pastSumFileName(6)], img48 = run.images[PS.pastSumFileName(48)];
    const mask = D.dachMask(geom);
    const val = (im, i) => PS.decodePastSumPixel(im[i * 4], im[i * 4 + 1], im[i * 4 + 2], im[i * 4 + 3]);
    let ok6 = 0, ok48 = 0, bad = 0;
    for (let i = 0; i < n; i += 13) {
      if (!mask[i]) { if (img[i * 4 + 3] !== PS.PAST_SUM_ALPHA_OUTSIDE) bad++; continue; }
      const c = geom.country[i];
      const v6 = val(img, i), v48 = val(img48, i);
      if (v6 != null && near(v6, [0.6, 3, 6][c], 0.006)) ok6++; else bad++;
      if (c === 1 ? v48 === null : (v48 != null && near(v48, [4.8, 0, 48][c], 0.006))) ok48++; else bad++;
    }
    add('H5 Lauf: je Land seine Quelle; AT nur 6 h vorhanden ⇒ 48 h Lücke in AT, DE/CH voll; außerhalb A 128',
      bad === 0 && ok6 > 0 && ok48 > 0 && run.manifest.countries.AT.maxWindowH === 6 && run.manifest.countries.DE.maxWindowH === 48
      && /^2026100819-de-at-ch-rw-[0-9a-f]{8}$/.test(run.dir) && run.manifest.windows['48'].de.product === 'RW',
      `ok ${ok6}/${ok48} · falsch ${bad} · ${run.dir}`);
    // H5b DE 24/48 h aus SF (Ende E − 10 min): 24 h = SF(E − 10 min), 48 h = + SF(E − 10 min − 24 h); kürzere Fenster bleiben RW
    const sfEnd = E - 10 * MIN;
    const sf = new Map([[sfEnd, fill(7)], [sfEnd - 24 * H, fill(2)]]);
    const runSf = D.buildRun({ endMs: E, fields: { DE: hours(0.1), AT: hours(0.5), CH: hours(1) }, sf });
    const sfOnly = D.buildRun({ endMs: E, fields: { DE: hours(0.1), AT: hours(0.5), CH: hours(1) }, sf: new Map([[sfEnd, fill(7)]]) });
    let okSf = 0, badSf = 0;
    for (let i = 0; i < n; i += 13) {
      if (!mask[i] || geom.country[i] !== 0) continue;
      const v24 = val(runSf.images[PS.pastSumFileName(24)], i), v48 = val(runSf.images[PS.pastSumFileName(48)], i), v12 = val(runSf.images[PS.pastSumFileName(12)], i);
      if (near(v24, 7, 0.006) && near(v48, 9, 0.006) && near(v12, 1.2, 0.006)) okSf++; else badSf++;
    }
    const w = runSf.manifest.windows;
    add('H5b DE 24/48 h aus SF (24 h = SF, 48 h = SF + SF Vortag, Ende E − 10 min), 1–12 h RW; ein SF fehlt ⇒ RW-Kette, Ordner -rw',
      badSf === 0 && okSf > 0 && w['24'].de.product === 'SF' && w['48'].de.product === 'SF' && w['12'].de.product === 'RW'
      && w['24'].de.end === new Date(sfEnd).toISOString() && /^2026100819-de-at-ch-[0-9a-f]{8}$/.test(runSf.dir)
      && sfOnly.manifest.windows['24'].de.product === 'SF' && sfOnly.manifest.windows['48'].de.product === 'RW' && /-rw-[0-9a-f]{8}$/.test(sfOnly.dir),
      `ok ${okSf} · falsch ${badSf} · ${runSf.dir} / ${sfOnly.dir}`);
  }
  // H6 Wartestufe: spätes Land ⇒ Vorstunde, aber nur bis 75 min nach E und nur, wenn die Vorstunde vollständig ist
  {
    const E = Date.UTC(2026, 9, 8, 20);
    const hasAll = (c, e) => !(c === 'AT' && e === E);
    const a = D.chooseEnd(E, E + 40 * MIN, hasAll), b = D.chooseEnd(E, E + 80 * MIN, hasAll);
    const c = D.chooseEnd(E, E + 40 * MIN, (cc, e) => !(cc === 'AT' && e >= E - H));
    const d = D.chooseEnd(E, E + 40 * MIN, () => true);
    add('H6 Wartestufe: 40 min ⇒ Vorstunde (wartet auf AT), 80 min ⇒ E mit Lücke, Vorstunde unvollständig ⇒ E, alles da ⇒ E',
      a.endMs === E - H && a.waitingFor.join() === 'AT' && b.endMs === E && c.endMs === E && d.endMs === E && d.waitingFor.length === 0);
  }
  // H7 INCA-Abrufe: ≤ 24 h je Block (Grenze 10 Mio. Datenpunkte ≈ 35 h), getrennte Bedarfe ⇒ getrennte Blöcke
  {
    const E = Date.UTC(2026, 9, 8, 19);
    const bl = D.incaBlocks(Array.from({ length: 49 }, (_, k) => E - k * H));
    const sparse = D.incaBlocks([E, E - 30 * H, E - 31 * H]);
    const lens = bl.map(([a, b2]) => (b2 - a) / H + 1);
    add('H7 INCA-Blöcke ≤ 24 h (Grenze 35 h), ganze Abdeckung, getrennte Bedarfe getrennt',
      lens.every((l) => l <= D.INCA_BLOCK_H) && lens.reduce((s, l) => s + l, 0) === 49 && bl.length === 3 && sparse.length === 2 && 281101 * D.INCA_BLOCK_H < 1e7, lens.join('+'));
  }
  // H8 Zeit- und Namensregeln
  {
    const E = Date.UTC(2026, 9, 8, 19);
    let rejects = false;
    try { PS.parsePastSumManifest({ schema: 1, kind: 'precipsum/past', end: 'x' }); } catch { rejects = true; }
    add('H8 RW-Stempel, INCA-Epoche 1961 (2075482800 s ⇔ 08.10. 19 UTC), Ordnername je Länder, Manifest-Prüfung lehnt ab',
      D.rwStamp(E) === '2610081900' && D.INCA_EPOCH_MS + 2075482800 * 1000 === E && PS.pastSumRunDir(E, ['CH', 'DE']) === '2026100819-de-ch'
      && PS.pastSumRunDir(E, []) === '2026100819-none' && PS.pastSumRunDir(E, ['DE'], true) === '2026100819-de-rw' && PS.PAST_SUM_DIR_RE.test('2026100819-de-at-ch-0a1b2c3d') && rejects);
  }
  // H9 Speicher: Ordner unveränderlich, Manifest nie zurück, Beschneiden behält die jüngsten + den Manifest-Ordner
  {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const os = await import('node:os');
    const dir = mkdtempSync(join(os.tmpdir(), 'precipsum-'));
    try {
      const fieldsAt = (E) => ({ DE: new Map(Array.from({ length: 48 }, (_, j) => [E - j * H, new Float32Array(n).fill(0.2)])), AT: new Map(), CH: new Map() });
      const runs = [];
      for (let k = 0; k < 5; k++) { const E = Date.UTC(2026, 9, 8, 15 + k); runs.push(D.writeRun(dir, D.buildRun({ endMs: E, fields: fieldsAt(E) }))); }
      const again = D.writeRun(dir, D.buildRun({ endMs: Date.UTC(2026, 9, 8, 19), fields: fieldsAt(Date.UTC(2026, 9, 8, 19)) }));
      const older = D.writeRun(dir, D.buildRun({ endMs: Date.UTC(2026, 9, 8, 14), fields: fieldsAt(Date.UTC(2026, 9, 8, 14)) }));
      const latest = JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf8'));
      const dirs = readdirSync(dir).filter((d) => /^\d{10}-/.test(d)).sort();
      // V-NS-17 (erster Live-Lauf): gleiches Ende, gleiche Länder, aber eine nachgeholte Stunde ⇒ anderer Inhalt ⇒ anderer
      // Ordner, und der Ordner trägt die neuen Bilder (vorher: Ordner übersprungen, Manifest neu, Bilder alt).
      const E19 = Date.UTC(2026, 9, 8, 19);
      const gapped = fieldsAt(E19); gapped.DE.delete(E19 - 10 * H);
      const d0 = mkdtempSync(join(os.tmpdir(), 'precipsum-'));
      try {
        const r1 = D.buildRun({ endMs: E19, fields: gapped }), r2 = D.buildRun({ endMs: E19, fields: fieldsAt(E19) });
        D.writeRun(d0, r1); const w2 = D.writeRun(d0, r2);
        const m2 = JSON.parse(readFileSync(join(d0, 'latest.json'), 'utf8'));
        const img = toRgba(decodePng(readFileSync(join(d0, m2.dir, PS.pastSumFileName(12)))));
        let gaps = 0; for (let i = 3; i < img.length; i += 4) if (img[i] === 0) gaps++;
        add('H12 Nachgeholte Stunde bei gleichem Ende ⇒ neuer Ordner (Inhalts-Hash), Bild und Manifest stimmen überein (V-NS-17)',
          r1.dir !== r2.dir && r1.dir.split('-').slice(0, -1).join('-') === r2.dir.split('-').slice(0, -1).join('-') && w2.changed && m2.dir === r2.dir
          && gaps === r2.manifest.windows['12'].gap && r1.manifest.windows['12'].gap > gaps, `${r1.dir} → ${r2.dir} · Lücken 12 h ${gaps}`);
      } finally { rmSync(d0, { recursive: true, force: true }); }
      add('H9 Speicher: gleicher Lauf ⇒ unverändert, älteres Ende schreibt weder Ordner noch Manifest, ≤ 3 Läufe + Manifest-Ordner',
        runs.every((r) => r.changed) && !again.changed && older.older === true && latest.end === '2026-10-08T19:00:00.000Z'
        && dirs.length <= PS.PAST_SUM_KEEP_RUNS + 1 && dirs.includes(latest.dir) && !dirs.some((d) => d.startsWith('2026100814')) && existsSync(join(dir, latest.dir, PS.pastSumFileName(48))), dirs.join(' '));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  // H10 Leser an echten Dateien (optional, --raw=<dir> mit rw<HHMM>.h5, cpc<HHMM>.h5, inca-range.nc)
  if (!args.raw) skipped('H10 Leser an echten RW-/CombiPrecip-/INCA-Dateien', '--raw=<dir> fehlt');
  else {
    const rd = (f) => new Uint8Array(readFileSync(join(args.raw, f)));
    const files = readdirSync(args.raw);
    const sfF = files.find((f) => /^sf\d{4}\.h5$/.test(f));
    const sfv = sfF ? D.readSf(rd(sfF)) : null;
    add('H10e SF: 24-h-Intervall, Ende :50, 0,1-mm-Stufen', !!sfv && new Date(sfv.endMs).getUTCMinutes() === 50 && sfv.cols === 1100, sfF ?? 'fehlt');
    const rwF = files.find((f) => /^rw\d{4}\.h5$/.test(f)), cpcF = files.find((f) => /^cpc\d{4}\.h5$/.test(f)), incaF = files.find((f) => f === 'inca-range.nc');
    const rw = rwF ? D.readRw(rd(rwF)) : null, cpc = cpcF ? D.readCpc(rd(cpcF)) : null, inca = incaF ? D.readIncaRange(rd(incaF)) : null;
    const nanShare = (v) => v.reduce((s, x) => s + (Number.isNaN(x) ? 1 : 0), 0) / v.length;
    let steps = true;
    if (rw) for (let i = 0; i < rw.values.length; i += 7) { const x = rw.values[i]; if (!Number.isNaN(x) && Math.abs(Math.round(x * 10) - x * 10) > 1e-3) { steps = false; break; } }
    add('H10a RW: 1100 × 1200, Stundenende = Stempel, 0,1-mm-Stufen, nodata 20–60 % (Ausland)', !!rw && rw.cols === 1100 && rw.endMs % H === 0 && steps
      && nanShare(rw.values) > 0.2 && nanShare(rw.values) < 0.6, rwF ?? 'fehlt');
    add('H10b CombiPrecip: 710 × 640, NaN bleibt NaN, Ecken aus /where', !!cpc && cpc.cols === 710 && cpc.rows === 640 && nanShare(cpc.values) > 0.05 && cpc.corners[0][1] > 49, cpcF ?? 'fehlt');
    add('H10c INCA: volle Stunden in Folge (Epoche 1961), 701 × 401', !!inca && inca.length > 1 && inca.every((h, k) => k === 0 || h.endMs - inca[k - 1].endMs === H)
      && inca[0].cols === 701 && inca[0].rows === 401 && inca.every((h) => h.endMs > Date.UTC(2020, 0, 1) && h.endMs < Date.UTC(2040, 0, 1)), incaF ?? 'fehlt');
    const g = rw ? D.toGrid(rw) : null;
    const m = D.dachMask(geom);
    let deValid = 0, deCells = 0;
    if (g) for (let i = 0; i < n; i++) if (m[i] && geom.country[i] === 0) { deCells++; if (!Number.isNaN(g[i])) deValid++; }
    add('H10d RW auf G: in DE ≥ 95 % der Zellen gültig', !!g && deValid / deCells > 0.95, g ? `${(deValid / deCells * 100).toFixed(1)} %` : '');
  }
  // H11 Oberfläche: Legende nennt Quelle je Land und Stand aus dem Manifest, Rückfall am Ort benannt
  {
    const ui = readFileSync(join(ROOT, 'src/precipSums/PrecipSumsUi.tsx'), 'utf8');
    const eng = readFileSync(join(ROOT, 'src/precipSums/sumMapEngine.ts'), 'utf8');
    add('H11 Legende: Fläche bis E mit Anbieter + Produkt je Land, Lücke je Land, „nur DE · AT · CH"; Karte am Ort: „Radar angeeicht" mit Stand',
      /Fläche bis \{fmtHour\(m\.endMs\)\}/.test(ui) && /c\.provider\} \$\{c\.label/.test(ui) && /Lücke: \{c\.note/.test(ui) && /nur DE · AT · CH/.test(ui)
      && /<b>Radar angeeicht<\/b> · \{past\.area\.provider\}/.test(ui) && !/noch nicht angebunden/.test(ui) && /PAST_SUM_DIR\}\/latest\.json/.test(eng));
  }
}

// ─── Live (optional) ──────────────────────────────────────────────────────────────────────────
if (args.live) {
  console.log('\n== L live (Daten-Repo, nur lesend) ==');
  const raw = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';
  try {
    const idx = await (await fetch(`${raw}/point/field/v1/index.json`)).json();
    const t1 = idx.latestByTier?.t1;
    const man = t1 ? await (await fetch(`${raw}/point/field/v1/${t1.run}/t1/field.json`)).json() : null;
    const n = man ? man.leads.filter((l) => l.precipcum).length : 0;
    add('L1 jüngstes t1-Feld trägt precipcum (erst nach Jans Push des Producers)', n > 0, t1 ? `${t1.run}: ${n} Bilder` : 'kein t1');
  } catch (e) { add('L1 Kartenfeld lesbar', false, String(e)); }
  try {
    const l = await (await fetch(`${raw}/obs/v1/latest.json`)).json();
    add('L2 obs/v1 latest lesbar, rr1h/rr24h vorhanden', l.schema === 1 && Object.values(l.stations).some((s) => s.rr1h), l.builtAt);
  } catch (e) { add('L2 obs/v1 lesbar', false, String(e)); }
  try {
    const { parsePastSumManifest, pastSumFileName } = await import('../src/precipSums/pastSumFormat.ts');
    const m = parsePastSumManifest(await (await fetch(`${raw}/precipsum/v1/latest.json`)).json());
    const age = (Date.now() - Date.parse(m.end)) / H;
    const img = await fetch(`${raw}/precipsum/v1/${m.dir}/${pastSumFileName(6)}`);
    add('L3 precipsum/v1: Manifest gültig, Ende ≤ 3 h alt, alle Länder mit Stunde E, Bild 6 h lesbar (erst nach Jans Workflow-Kopie)',
      age <= 3 && Object.values(m.countries).every((c) => c.hasEnd) && img.ok, `${m.dir} · ${age.toFixed(1)} h · ${Object.entries(m.countries).map(([k, c]) => `${k} ${c.maxWindowH} h`).join(' ')}`);
    // L4 (V-NS-17): die Bilder des Manifest-Ordners tragen genau die Lücken, die das Manifest nennt.
    const bad = [];
    for (const [w, e] of Object.entries(m.windows)) {
      const r = await fetch(`${raw}/precipsum/v1/${m.dir}/${e.file}`);
      const px = toRgba(decodePng(Buffer.from(await r.arrayBuffer())));
      let gaps = 0; for (let i = 3; i < px.length; i += 4) if (px[i] === 0) gaps++;
      if (gaps !== e.gap) bad.push(`${w} h: Bild ${gaps} ≠ Manifest ${e.gap}`);
    }
    add('L4 precipsum/v1: Lücken je Bild = Manifest (V-NS-17)', bad.length === 0, bad.join(' · ') || m.dir);
  } catch (e) { add('L3 precipsum/v1 lesbar (erst nach Jans Workflow-Kopie)', false, String(e)); }
}

console.log(`\n${pass} PASS · ${fail} FAIL${skip ? ` · ${skip} ⊘` : ''}`);
process.exit(fail ? 1 : 0);
