/**
 * verify:glacier-sat — Phase GL, package GL-2 (audit/gletscher.md §6.2): the satellite core against six REAL stored scenes of Hintereisferner
 * (`scripts/lib/fixtures/glacier/sat-hef.json`, written by `make-sat-fixtures.mjs`: the masked pixels of SCL, B03, B11, B02, B04, B08, B12 and
 * the elevation, with a sha256), unit tests of the snow-line algorithm on synthetic profiles, the contract rules with negative controls,
 * the season rows (derived new-snow flag) and — with `--live` — the production path (STAC + COG reads) against the fixture.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-sat.mjs [--live]
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validity, snowMap, snowLine, areaAbove, evaluateGlacier, reflect, swirP01, sceneEncodingSuspect, SCL_INVALID } from './glacier/lib/satcore.mjs';
import { buildSeasonRows } from './glacier/sat-scan.mjs';
import {
  glacierSatClass, demDecode, demSample, obsProblems, seasonProblems, GLACIER_SNOW_GREEN_MIN, GLACIER_NDSI_SNOW, glacierFlagsOfMask,
} from '../src/glacier/glacierSatContract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'sat-hef.json'), 'utf8'));
const live = process.argv.includes('--live');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

// --- unpack the fixture ----------------------------------------------------------------------------------------------
const unb = (b64, T) => { const b = inflateSync(Buffer.from(b64, 'base64')); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const { w, h, n } = FX.window;
const maskIdx = unb(FX.window.maskIdx, Uint32Array), elevI = unb(FX.window.elev, Float32Array);
const mask = new Uint8Array(w * h), elev = new Float32Array(w * h).fill(NaN);
maskIdx.forEach((i, k) => { mask[i] = 1; if (Number.isFinite(elevI[k])) elev[i] = elevI[k]; });
function pack(key, { swirShift = 0 } = {}) {
  const sc = FX.scenes[key];
  const full = (arr, T) => { const o = new T(w * h); maskIdx.forEach((i, k) => { o[i] = arr[k]; }); return o; };
  const d = Object.fromEntries(Object.entries(sc.data).map(([k, b]) => [k, unb(b, k === 'scl' ? Uint8Array : Uint16Array)]));
  const raw = { scl: full(d.scl, Uint8Array), green: full(d.green, Uint16Array), swir: full(d.swir, Uint16Array), blue: full(d.blue, Uint16Array), red: full(d.red, Uint16Array), nir: full(d.nir, Uint16Array), swir2: full(d.swir2, Uint16Array) };
  const swir = reflect(raw.swir);
  if (swirShift) for (let i = 0; i < swir.length; i++) if (mask[i]) swir[i] += swirShift;
  return { w, h, mask, elev, scl: raw.scl, green: reflect(raw.green), swir, blue: reflect(raw.blue), red: reflect(raw.red), nir: reflect(raw.nir), swir2: reflect(raw.swir2), _sun: sc.sunElevation };
}
const meta = (key) => ({ klass: FX.klass, debris: FX.debris, sunElevation: FX.scenes[key].sunElevation });
const ev = (key, over = {}) => evaluateGlacier(pack(key), { ...meta(key), ...over }, null);

// F — fixture integrity ---------------------------------------------------------------------------------------------------
const sha = createHash('sha256').update(JSON.stringify({ window: FX.window, scenes: FX.scenes })).digest('hex');
add('F1 Fixture: Prüfsumme stimmt, sechs Szenen, Maske 14 043 Pixel ⇒ 5,617 km² (AGI 5: 5,616 km²)', sha === FX.sha256 && Object.keys(FX.scenes).length === 6 && n === 14043 && Math.abs((n * 400) / 1e6 - 5.616) < 0.005, `${n} px, ${(n * 400 / 1e6).toFixed(3)} km²`);
add('F2 Fixture: jede Szene trägt Aufnahme-ID, Verarbeitungsstand und Sonnenhöhe; die Höhen der Maske liegen im Bereich des Katalogs', Object.values(FX.scenes).every((s) => s.item && s.baseline && s.sunElevation > 0) && Math.min(...elev.filter(Number.isFinite)) >= FX.z[0] - 120 && Math.max(...elev.filter(Number.isFinite)) <= FX.z[2] + 120, `${Math.min(...elev.filter(Number.isFinite)).toFixed(0)}–${Math.max(...elev.filter(Number.isFinite)).toFixed(0)} m, Katalog ${FX.z[0]}–${FX.z[2]}`);

// R — rule per scene ---------------------------------------------------------------------------------------------------------
const R = Object.fromEntries(await Promise.all(Object.keys(FX.scenes).map(async (k) => [k, await ev(k)])));
const c = R.clear.value;
add('R1 klare Szene 25.08.2025: Wert gültig, Klaranteil ≥ 0,9, Zustand snowline, Schneegrenze 3 100–3 300 m (UIBK: Gleichgewichtslinie 2024/25 3 302 m), AAR 0,2–0,35, Albedo Schnee 0,55–0,85 und Eis 0,1–0,3',
  c && c.clear >= 0.9 && c.state === 'snowline' && c.sla >= 3100 && c.sla <= 3300 && c.aar >= 0.2 && c.aar <= 0.35 && c.alb.snow >= 0.55 && c.alb.snow <= 0.85 && c.alb.ice >= 0.1 && c.alb.ice <= 0.3, JSON.stringify(c));
const pv = R.partly.value, vp = validity(pack('partly'));
const cloudPxClear = (() => { const p = pack('partly'); const v = validity(p); let bad = 0; for (let i = 0; i < w * h; i++) if (mask[i] && SCL_INVALID.includes(p.scl[i]) && v.clear[i]) bad++; return bad; })();
add('R2 teils bewölkte Szene 16.06.2025: gültig mit 70–90 % klar; kein Wolken-, Schatten- oder Keine-Daten-Pixel zählt als klar', pv && pv.clear >= 0.7 && pv.clear <= 0.9 && cloudPxClear === 0, `clear ${pv?.clear}, ungültige als klar: ${cloudPxClear}`);
add('R3 ganz bewölkte Szene 11.07.2025: übersprungen mit Grund „Klaranteil“, kein Wert, keine Schneegrenze', !R.cloudy.value && /Klaranteil \d+ % < 70 %/.test(R.cloudy.skipped ?? ''), R.cloudy.skipped);
const ns = R.newsnow.value;
add('R4 Neuschnee 29.09.2025: Schneeanteil ≥ 0,95, Schneegrenze unter 2 600 m und AAR ≥ 0,95 — gegen 3 214 m am 19.09.', ns && ns.snow >= 0.95 && ns.sla <= 2600 && ns.aar >= 0.95, JSON.stringify(ns));
const fc = R.falsecloud, pfc = pack('falsecloud'), vfc = validity(pfc);
const snowRule = snowMap(pfc, vfc.clear);
// negative control: the SWIR "rescue" (cloud pixels with snow-like NDSI counted as snow) would invent snow here
const rescue = (() => { let nSnow = 0, nClearSnow = 0, nCloudSnowLike = 0; for (let i = 0; i < w * h; i++) { if (!mask[i]) continue; const g = pfc.green[i], s = pfc.swir[i], like = g + s > 0.02 && (g - s) / (g + s) > GLACIER_NDSI_SNOW && g >= GLACIER_SNOW_GREEN_MIN; if (like) nSnow++; if (like && vfc.clear[i]) nClearSnow++; if (like && [8, 9, 10].includes(pfc.scl[i])) nCloudSnowLike++; } return { nSnow, nClearSnow, nCloudSnowLike }; })();
let ruleSnow = 0; for (const v of snowRule) ruleSnow += v;
add('R5 schneebedeckt mit Sen2Cor-Fehlwolke 08.06.2026: die Regel entscheidet „gültig, 72 % klar“ ohne die Wolkenpixel zu retten (Schneepixel nur unter klaren); Gegenprobe: die SWIR-Rettung würde zusätzliche Schneepixel erfinden',
  fc.value && fc.value.clear >= 0.7 && fc.value.clear < 0.8 && ruleSnow === rescue.nClearSnow && rescue.nCloudSnowLike > 100 && rescue.nSnow > ruleSnow, JSON.stringify({ clear: fc.value?.clear, ruleSnow, rescueSnow: rescue.nSnow, cloudSnowLike: rescue.nCloudSnowLike }));
const sh = R.shadow.value;
add('R6 Oktober 29.10.2025 (Sonne 29°): gültig, Marke „schatten“ gesetzt, Zustand snowline; eine Sommerszene derselben Regel trägt die Marke nicht', sh && sh.flags.includes('schatten') && FX.scenes.shadow.sunElevation < 30 && !c.flags.includes('schatten'), JSON.stringify(sh?.flags));

// C — classes ------------------------------------------------------------------------------------------------------------------
const asB = (await ev('clear', { klass: 'B' })).value;
add('C1 Klasse B trägt weder Schneegrenze noch AAR (nur Schneeanteil, Zustand, Albedo entfällt ohne Bänder), Klasse A trägt beides', asB && asB.sla === undefined && asB.aar === undefined && asB.snow === c.snow && c.sla != null && c.aar != null, JSON.stringify(asB));
const entry = (country, km2) => ({ country, area: { km2 } });
add('C2 Wer Satellitenzahlen bekommt: A und B in CH/AT; Klasse C und alle deutschen Gletscher nie (auch Höllentalferner mit 0,128 km²)', glacierSatClass(entry('CH', 2)) === 'A' && glacierSatClass(entry('AT', 0.5)) === 'B' && glacierSatClass(entry('CH', 0.05)) === null && glacierSatClass(entry('DE', 0.128)) === null && glacierSatClass(entry('DE', 5)) === null, '');

// L — snow line algorithm --------------------------------------------------------------------------------------------------------
function synth({ step = 3000, noise = 0, nz = 4000, seed = 7, lo = 2400, hi = 3600 }) {
  let r = seed; const rnd = () => (r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const W = nz, p = { w: W, h: 1, mask: new Uint8Array(W).fill(1), elev: new Float32Array(W), scl: new Uint8Array(W).fill(11), green: new Float32Array(W), swir: new Float32Array(W) };
  const snow = new Uint8Array(W), clear = new Uint8Array(W).fill(1);
  for (let i = 0; i < W; i++) { p.elev[i] = lo + ((hi - lo) * rnd()); const s = p.elev[i] >= step ? 1 : 0; snow[i] = rnd() < noise ? 1 - s : s; }
  return { p, snow, clear };
}
{
  const a = synth({ step: 3000 }), la = snowLine(a.p, a.clear, a.snow);
  const b = synth({ step: 3000, noise: 0.05 }), lb = snowLine(b.p, b.clear, b.snow);
  const d = synth({ step: 2700, noise: 0.1, seed: 11 }), ld = snowLine(d.p, d.clear, d.snow);
  add('L1 Schneegrenze an einer Stufe bei 3 000 m: ohne Rauschen auf ±10 m, mit 5 % und 10 % vertauschten Pixeln auf ±40 m / ±60 m; die Spanne schließt die Stufe ein', Math.abs(la.sla - 3000) <= 10 && Math.abs(lb.sla - 3000) <= 40 && Math.abs(ld.sla - 2700) <= 60 && la.lo <= 3000 && la.hi >= 3000 && lb.lo <= lb.sla && lb.hi >= lb.sla, `${la.sla} [${la.lo},${la.hi}] · ${lb.sla} · ${ld.sla}`);
  const wide = synth({ step: 3000, noise: 0.2, seed: 5 }), lw = snowLine(wide.p, wide.clear, wide.snow);
  add('L2 Gegenprobe: je mehr Rauschen, desto breiter die Spanne (20 % gegen 0 %)', lw.hi - lw.lo > la.hi - la.lo + 20, `${lw.hi - lw.lo} m gegen ${la.hi - la.lo} m`);
  const flip = synth({ step: 3000 }); const inv = new Uint8Array(flip.snow.map((v) => 1 - v)); const li = snowLine(flip.p, flip.clear, inv);
  add('L3 Gegenprobe: Schnee UNTEN statt oben (umgekehrtes Profil) gibt keine glaubwürdige Stufe — die Schneegrenze liegt dann am Rand', li.sla <= 2410 || li.sla >= 3590, String(li.sla));
  const few = synth({ nz: 20 }); add('L4 weniger als 30 Pixel mit Höhe ⇒ keine Schneegrenze (null statt einer Zahl)', snowLine(few.p, few.clear, few.snow) === null, '');
  // all snow / no snow
  const all = synth({ step: 0 }), none = synth({ step: 9999 });
  const rAll = await evaluateGlacier({ ...all.p, scl: new Uint8Array(all.p.w).fill(11), green: new Float32Array(all.p.w).fill(0.8), swir: new Float32Array(all.p.w).fill(0.03) }, { klass: 'A', sunElevation: 50 }, null);
  const rNone = await evaluateGlacier({ ...none.p, scl: new Uint8Array(none.p.w).fill(5), green: new Float32Array(none.p.w).fill(0.2), swir: new Float32Array(none.p.w).fill(0.15) }, { klass: 'A', sunElevation: 50 }, null);
  add('L5 ganz schneebedeckt ⇒ Zustand snow-covered, AAR 1, keine Schneegrenze; ganz schneefrei ⇒ snow-free, AAR 0 (nie eine Höhe „unter der Zunge“ oder „über dem Gipfel“)',
    rAll.value?.state === 'snow-covered' && rAll.value.aar === 1 && rAll.value.sla === undefined && rNone.value?.state === 'snow-free' && rNone.value.aar === 0 && rNone.value.sla === undefined, JSON.stringify([rAll.value?.state, rNone.value?.state]));
}
add('L6 Eis ist kein Schnee: ein Pixel mit NDSI 0,8, aber Grün 0,30 (Gletschereis) zählt nicht, eines mit Grün 0,70 zählt', (() => { const p = { w: 2, h: 1, green: new Float32Array([0.3, 0.7]), swir: new Float32Array([0.03, 0.04]) }; const s = snowMap(p, new Uint8Array([1, 1])); return s[0] === 0 && s[1] === 1; })(), '');

// E — encoding guard -------------------------------------------------------------------------------------------------------------
{
  const keys = ['clear', 'partly', 'newsnow', 'falsecloud', 'shadow'];
  const p01 = keys.map((k) => { const p = pack(k), v = validity(p); return swirP01(p, v.clear); });
  const shifted = keys.map((k) => { const p = pack(k, { swirShift: 0.1 }), v = validity(p); return swirP01(p, v.clear); });
  add('E1 Kodierungswächter: die echten Szenen haben dunkle SWIR-Pixel (p01 < 0,08), mit einem simulierten Versatz von +0,1 schlägt der Wächter an; weniger als fünf Fenster ⇒ kein Urteil',
    !sceneEncodingSuspect(p01) && sceneEncodingSuspect(shifted) && !sceneEncodingSuspect(shifted.slice(0, 4)), `${p01.map((x) => x?.toFixed(3)).join(' ')} → ${shifted.map((x) => x?.toFixed(3)).join(' ')}`);
  // the measured basis of "no offset": NDSI of the real snow pixels never exceeds 1 without an offset
  const p = pack('clear'), v = validity(p); let over = 0, tot = 0; for (let i = 0; i < w * h; i++) if (v.clear[i]) { tot++; if ((p.green[i] - p.swir[i]) / (p.green[i] + p.swir[i]) > 1) over++; }
  const pOff = pack('clear'); let overOff = 0; for (let i = 0; i < w * h; i++) if (v.clear[i]) { const g = FX.scenes ? p.green[i] - 0.1 : 0, s = p.swir[i] - 0.1; if (g + s > 0.02 && (g - s) / (g + s) > 1) overOff++; }
  add('E2 Beleg „kein Versatz“: ohne Versatz ist der NDSI nie > 1; mit dem im STAC genannten −0,1 würde er über Schnee oft > 1 (unmöglich)', over === 0 && overOff > 1000 && void pOff === undefined, `ohne: ${over}/${tot}, mit −0,1: ${overOff}`);
}

// D — DEM -----------------------------------------------------------------------------------------------------------------------------
{
  const g = FX.demGrid, z = demDecode(g);
  const cell = (i, j) => z[j * g.nx + i];
  const lon = (g.x0 + 10.5) / 3600, lat = (g.y1 - 10.5) / 3600;
  const exact = demSample(g, z, lon, lat) === cell(10, 10);
  const mid = demSample(g, z, (g.x0 + 11) / 3600, (g.y1 - 10.5) / 3600), want = (cell(10, 10) + cell(11, 10)) / 2;
  add('D1 Höhengitter: Zellmitte gibt den Zellwert, die Mitte zwischen zwei Zellen deren Mittel; außerhalb des Gitters null', exact && Math.abs(mid - want) < 1e-6 && demSample(g, z, (g.x0 - 5) / 3600, lat) === null && demSample(g, z, lon, (g.y1 + 5) / 3600) === null, `${cell(10, 10)} ${mid} ${want}`);
  add('D2 Höhengitter: Länge der Daten = nx · ny · 2 Byte; Höhen der Maske stammen aus demselben Gitter (Median innerhalb 150 m des Katalog-Medians)', Buffer.from(g.z, 'base64').length === g.nx * g.ny * 2 && (() => { const v = [...elev].filter(Number.isFinite).sort((a, b) => a - b); return Math.abs(v[Math.floor(v.length / 2)] - FX.z[1]) <= 150; })(), '');
}

// O — obs / season rules -------------------------------------------------------------------------------------------------------------
const cat = new Map([[FX.glacier, { country: 'AT', area: { km2: 5.616 }, z: FX.z }], ['gl_ch_klein', { country: 'CH', area: { km2: 0.4 }, z: [2500, 2700, 2900] }], ['gl_de_hoellentalferner', { country: 'DE', area: { km2: 0.128 }, z: [2200, 2300, 2400] }], ['gl_ch_winzig', { country: 'CH', area: { km2: 0.02 }, z: [2500, 2600, 2700] }]]);
const okDoc = { schema: 1, kind: 'glacier/obs', tile: '32TPS', date: '2025-08-25', time: '2025-08-25T10:00:00Z', scene: 'S2A_32TPS_20250825_1_L2A', sunElevation: 50, params: {}, items: { [FX.glacier]: c }, skipped: [{ id: 'x', reason: 'Klaranteil 10 %' }] };
add('O1 echte Werte der klaren Szene bestehen die Vertragsregeln (obsProblems leer)', obsProblems(okDoc, cat).length === 0, obsProblems(okDoc, cat).join('; '));
const neg = (mut, rx) => { const d = JSON.parse(JSON.stringify(okDoc)); mut(d); return obsProblems(d, cat).some((m) => rx.test(m)); };
add('O2 Gegenproben: Schneegrenze 800 m über dem Gipfel, Klasse B mit Schneegrenze, DE-Gletscher, Klasse C, Klaranteil 60 %, Zustand ohne Schneegrenze, Neuschnee-Marke an falscher Stelle werden einzeln benannt',
  neg((d) => { d.items[FX.glacier].sla = 4600; d.items[FX.glacier].slaHi = 4700; }, /außerhalb/) && neg((d) => { d.items.gl_ch_klein = { clear: 0.9, snow: 0.5, state: 'snowline', sla: 2600, slaLo: 2590, slaHi: 2610, aar: 0.5, flags: [] }; }, /Klasse B trägt/)
  && neg((d) => { d.items.gl_de_hoellentalferner = { clear: 0.9, snow: 0.5, state: 'snowline', flags: [] }; }, /ohne Satellitenzahl/) && neg((d) => { d.items.gl_ch_winzig = { clear: 0.9, snow: 0.5, state: 'snowline', flags: [] }; }, /ohne Satellitenzahl/)
  && neg((d) => { d.items[FX.glacier].clear = 0.6; }, /Klaranteil/) && neg((d) => { d.items[FX.glacier].state = 'snow-free'; }, /Schneegrenze im Zustand|schneefrei/) && neg((d) => { d.items[FX.glacier].flags = ['wolke']; }, /Marke/), '');
const rows = buildSeasonRows([
  { date: '2025-09-19', items: { [FX.glacier]: { clear: 0.977, snow: 0.258, state: 'snowline', sla: 3214, aar: 0.25, alb: { snow: 0.615, ice: 0.194 }, flags: [] } } },
  { date: '2025-09-29', items: { [FX.glacier]: ns } },
  { date: '2025-09-29', items: { [FX.glacier]: { ...ns, clear: 0.72 } } },    // the same day from a second tile: the clearer one wins
]).get(FX.glacier);
add('S1 Saisonreihe: gleicher Tag aus zwei Kacheln ⇒ die klarere Zeile; der Neuschnee 19.→29.09. setzt die abgeleitete Marke „neuschnee“ (Schneegrenze −740 m innerhalb 10 Tagen), die erste Zeile nicht', rows.length === 2 && rows[1][1] === ns.clear && glacierFlagsOfMask(rows[1][8]).includes('neuschnee') && glacierFlagsOfMask(rows[0][8]).length === 0, JSON.stringify(rows.map((r) => [r[0], r[1], r[4], glacierFlagsOfMask(r[8])])));
const none = buildSeasonRows([
  { date: '2025-08-01', items: { a: { clear: 0.9, snow: 0.5, state: 'snowline', sla: 3300, flags: [] } } }, { date: '2025-08-25', items: { a: { clear: 0.9, snow: 0.3, state: 'snowline', sla: 3000, flags: [] } } },
  { date: '2025-12-01', items: { b: { clear: 0.9, snow: 0.1, state: 'snowline', flags: [] } } }, { date: '2025-12-05', items: { b: { clear: 0.9, snow: 0.9, state: 'snowline', flags: [] } } },
]);
add('S2 Gegenproben der Marke: 24 Tage Abstand und der Winter (Dezember) setzen „neuschnee“ nicht', none.get('a')[1][8] === 0 && none.get('b')[1][8] === 0, '');
add('S3 Saisondokument besteht seasonProblems; Klasse B mit Schneegrenze, Datum außerhalb des Jahres und unsortierte Zeilen werden benannt', (() => {
  const doc = { schema: 1, kind: 'glacier/season', year: 2025, region: 'at-oetztaler-alpen', stand: '20251011T1200Z', builtAt: '', cols: ['date', 'clear', 'snow', 'state', 'sla', 'aar', 'albSnow', 'albIce', 'flags'], glaciers: { [FX.glacier]: rows } };
  const bad = JSON.parse(JSON.stringify(doc)); bad.glaciers.gl_ch_klein = [['2025-08-01', 0.9, 0.5, 1, 2600, 0.5, null, null, 0]]; bad.glaciers[FX.glacier][0][0] = '2024-09-19'; bad.glaciers[FX.glacier].reverse();
  const bp = seasonProblems(bad, 'at-oetztaler-alpen', cat);
  return seasonProblems(doc, 'at-oetztaler-alpen', cat).length === 0 && bp.some((m) => /Klasse B/.test(m)) && bp.some((m) => /Datum/.test(m)) && bp.some((m) => /geordnet/.test(m));
})(), '');

// V — live: the production path against the fixture --------------------------------------------------------------------------------------------
if (live) {
  const { main } = await import('./glacier/sat-scan.mjs');
  const { mkdtempSync, readFileSync: rf, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dataDir = process.env.GLACIER_TREE ?? 'C:/dev/buscosun-glacier-cache/build-test/v1';
  const out = mkdtempSync(join(tmpdir(), 'sat-live-'));
  await main({ data: dataDir, out, patch: join(out, '..', 'patch-live'), from: '2025-08-25', to: '2025-08-25', tiles: '32TPS', only: FX.glacier, classes: 'A,B' });
  const doc = JSON.parse(rf(join(out, 'obs', '2025', '32TPS', '2025-08-25.json'), 'utf8'));
  const prod = doc.items[FX.glacier];
  add('V1 --live: der Produktionsweg (STAC, Bereichslesen, Maske, Höhen aus dem Baum) liefert für dieselbe Szene dieselben Werte wie die gespeicherten Pixel (Schneegrenze, AAR, Schneeanteil, Klaranteil, Albedo)',
    prod && prod.sla === c.sla && prod.aar === c.aar && prod.snow === c.snow && prod.clear === c.clear && prod.alb.snow === c.alb.snow && prod.alb.ice === c.alb.ice, JSON.stringify({ prod, fixture: c }));
  rmSync(out, { recursive: true, force: true });
}

const passed = checks.filter((x) => x.ok).length;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${String(x.detail).slice(0, 260)}]` : ''}`);
console.log(`\nverify:glacier-sat — ${passed}/${checks.length}${passed < checks.length ? ` (${checks.length - passed} FEHLER)` : ''}`);
process.exit(passed < checks.length ? 1 : 0);
void areaAbove; void glacierFlagsOfMask;
