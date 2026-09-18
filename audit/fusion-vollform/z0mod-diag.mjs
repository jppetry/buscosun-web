/**
 * AP17 — Diagnose vor dem Producer-Diff (RV12, V-FI-58/72/73): Trägt das GRIB-z0 der ICON-Modelle einen
 * Orographie-Anteil (SSO), und wie stabil ist es von Lauf zu Lauf? Netzlesend (nur GET), nichts wird geschrieben
 * außer der Konsolenausgabe:
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-vollform/z0mod-diag.mjs
 *
 * Teil A — z0 gegen die Modellhöhe (HSURF-Klassen) an den nativen Gitterpunkten im DACH-Ausschnitt, je Modell; für
 *   ICON-CH1 zusätzlich gegen SSO_STDH (Streuung der Untergitter-Orographie, aus den Konstanten). Ohne SSO-Anteil ist
 *   z0 im Hochgebirge (Fels, Eis, alpine Wiese) KLEIN; mit SSO-Anteil wächst es mit der Streuung.
 * Teil B — z0 auf den Stufengittern (ln-Blockmittel der Quellpunkte je Zelle, dieselbe Regel wie der geplante
 *   Producer), Lauf 00z gegen 12z: Anteil Zellen mit |Δln z0| > 0,01 / 0,1, getrennt z0 > 1 cm („Land") und darunter.
 * Teil C — an den 42 Orten aus §0: GRIB-z0 der nächsten Zelle gegen die WorldCover-Zellbox (AP16) und die Box um den
 *   Punkt (v1), geschichtet nach dem Relief (Streuung der Höhe im 4-km-Kreis, Terrarium).
 */
import { readFileSync } from 'node:fs';
import { fetchGribField, fetchJson, fetchBytes } from '../../scripts/point/adapters/shared.mjs';
import { sampleRegularToTier, fillNearest } from '../../scripts/point/adapters/sample.mjs';
import { decodeGrib2All } from '../../src/sources/gribDecode.ts';
import { TIER_BY_ID, cellOf, cellCenter } from '../../src/point/cubeFormat.ts';
import { loadWorldCoverTiles, classAtOf, z0FromClassField } from '../../src/point/client/z0Point.ts';
import { landCoverFromClassField, windowFromTiles, landCoverCell } from '../../src/point/client/landCover.ts';
import { loadTerrainAtPoint } from '../../src/point/client/terrain.ts';
import { memoryBackend } from '../../src/point/client/cache.ts';
import { decodePng, toRgba } from '../../scripts/lib/png.mjs';

const DWD = 'https://opendata.dwd.de/weather/nwp';
const DAY = process.env.Z0_DAY || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const RUNS = [`${DAY}00`, `${DAY}12`];
const pad3 = (n) => String(n).padStart(3, '0');
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };
const fz = (x) => (x == null || !Number.isFinite(x) ? '—' : x >= 0.1 ? x.toFixed(2) : x.toPrecision(2));
const inDach = (la, lo) => la >= 45.5 && la <= 55.5 && lo >= 5.5 && lo <= 17.5;

// ── Felder holen ────────────────────────────────────────────────────────────
const url = {
  d2: (run, p, inv = false) => inv
    ? `${DWD}/icon-d2/grib/${run.slice(8)}/${p}/icon-d2_germany_regular-lat-lon_time-invariant_${run}_000_0_${p}.grib2.bz2`
    : `${DWD}/icon-d2/grib/${run.slice(8)}/${p}/icon-d2_germany_regular-lat-lon_single-level_${run}_000_2d_${p}.grib2.bz2`,
  eu: (run, p, inv = false) => inv
    ? `${DWD}/icon-eu/grib/${run.slice(8)}/${p.toLowerCase()}/icon-eu_europe_regular-lat-lon_time-invariant_${run}_${p}.grib2.bz2`
    : `${DWD}/icon-eu/grib/${run.slice(8)}/${p.toLowerCase()}/icon-eu_europe_regular-lat-lon_single-level_${run}_000_${p}.grib2.bz2`,
  gl: (run, p, inv = false) => inv
    ? `${DWD}/icon/grib/${run.slice(8)}/${p.toLowerCase()}/icon_global_icosahedral_time-invariant_${run}_${p}.grib2.bz2`
    : `${DWD}/icon/grib/${run.slice(8)}/${p.toLowerCase()}/icon_global_icosahedral_single-level_${run}_000_${p}.grib2.bz2`,
};
const T0 = performance.now();
const get = async (u) => { const f = await fetchGribField(u); if (!f) throw new Error(`fehlt: ${u}`); return f; };
const [d2z0a, d2z0b, d2h, euz0a, euz0b, euh, glz0a, glz0b, glh, clat, clon] = await Promise.all([
  get(url.d2(RUNS[0], 'z0')), get(url.d2(RUNS[1], 'z0')), get(url.d2(RUNS[0], 'hsurf', true)),
  get(url.eu(RUNS[0], 'Z0')), get(url.eu(RUNS[1], 'Z0')), get(url.eu(RUNS[0], 'HSURF', true)),
  get(url.gl(RUNS[0], 'Z0')), get(url.gl(RUNS[1], 'Z0')), get(url.gl(RUNS[0], 'HSURF', true)),
  get(url.gl(RUNS[0], 'CLAT', true)), get(url.gl(RUNS[0], 'CLON', true)),
]);
console.log(`DWD-Felder (Läufe ${RUNS.join(', ')}, Schritt 000) geholt in ${((performance.now() - T0) / 1000).toFixed(0)} s`);

// ICON-CH1: Z0 (ctrl, Vorlauf 0, Lauf 12z) über den STAC-Katalog, Koordinaten + HSURF + SSO_STDH aus den Konstanten.
const STAC = 'https://data.geo.admin.ch/api/stac/v1';
const COLL = 'ch.meteoschweiz.ogd-forecasting-icon-ch1';
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
async function stacZ0(refMs) {
  let next = `${STAC}/collections/${COLL}/items?limit=100&datetime=${encodeURIComponent(`${iso(refMs)}/${iso(refMs + 60_000)}`)}`;
  for (let p = 0; p < 30 && next; p++) {
    const j = await fetchJson(next);
    for (const f of j?.features ?? []) {
      const pr = f.properties;
      if (pr['forecast:variable'] === 'Z0' && pr['forecast:perturbed'] !== true && Date.parse(pr['forecast:reference_datetime']) === refMs) {
        return { href: Object.values(f.assets)[0].href, object: Object.keys(f.assets)[0] };
      }
    }
    next = (j?.links ?? []).find((l) => l.rel === 'next')?.href;
  }
  return null;
}
const chRef = Date.UTC(+DAY.slice(0, 4), +DAY.slice(4, 6) - 1, +DAY.slice(6, 8), 12);
const chItem = await stacZ0(chRef);
let ch = null;
if (chItem) {
  const coll = await fetchJson(`${STAC}/collections/${COLL}`);
  const constRaw = await fetchBytes(coll.assets['horizontal_constants_icon-ch1-eps.grib2'].href, { cacheKey: 'mch:horizontal_constants_icon-ch1-eps.grib2' });
  const want = [[0, 191, 1], [0, 191, 2], [0, 3, 6], [0, 3, 20]];
  const fs = decodeGrib2All(constRaw, { keep: (h) => want.some(([d, c, n]) => h.discipline === d && h.parameterCategory === c && h.parameterNumber === n) });
  const pick = ([d, c, n]) => fs.find((f) => f.discipline === d && f.parameterCategory === c && f.parameterNumber === n)?.values ?? null;
  const z0 = await fetchGribField(chItem.href, { bz2: false, cacheKey: `mch:${chItem.object}` });
  ch = { lat: pick([0, 191, 1]), lon: pick([0, 191, 2]), hsurf: pick([0, 3, 6]), sso: pick([0, 3, 20]), z0: z0?.values ?? null };
  console.log(`ICON-CH1 Z0 (ctrl, ${iso(chRef)}, Vorlauf 0) + Konstanten: ${ch.z0?.length ?? 0} Zellen, SSO_STDH ${ch.sso ? 'da' : 'FEHLT'}`);
} else console.log('ICON-CH1: kein Z0-Item im Katalog gefunden');

// ── Teil A: z0 gegen die Modellhöhe bzw. SSO_STDH, native Punkte im DACH-Ausschnitt ───────
function regularPoints(field, hField) {
  const { ni, nj, lat1, lon1, di, dj, scanMode } = field;
  const jNorth = (scanMode & 0x40) !== 0;
  const out = [];
  for (let j = 0; j < nj; j++) {
    const la = jNorth ? lat1 + j * dj : lat1 - j * dj;
    for (let i = 0; i < ni; i++) {
      let lo = lon1 + i * di; if (lo > 180) lo -= 360;
      if (!inDach(la, lo)) continue;
      const z = field.values[j * ni + i], h = hField.values[j * ni + i];
      if (Number.isFinite(z) && z > 0 && Number.isFinite(h)) out.push({ z, h });
    }
  }
  return out;
}
function unstructuredPoints(z0v, lat, lon, h, extra = null) {
  const out = [];
  for (let c = 0; c < z0v.length; c++) {
    let lo = lon[c]; if (lo > 180) lo -= 360;
    if (!inDach(lat[c], lo)) continue;
    const z = z0v[c];
    if (Number.isFinite(z) && z > 0 && Number.isFinite(h[c])) out.push({ z, h: h[c], s: extra ? extra[c] : null });
  }
  return out;
}
const HBINS = [[-100, 300], [300, 700], [700, 1200], [1200, 1800], [1800, 2500], [2500, 5000]];
const binTable = (name, pts, key, bins) => {
  console.log(`\n${name}: ${pts.length} Punkte (z0 > 0) im DACH-Ausschnitt`);
  console.log('  Klasse            n       z0 p10 / p50 / p90          Anteil z0 > 0,5 m   > 1 m');
  for (const [a, b] of bins) {
    const zs = pts.filter((p) => p[key] >= a && p[key] < b).map((p) => p.z);
    if (!zs.length) continue;
    console.log(`  ${`${a}–${b} m`.padEnd(14)} ${String(zs.length).padStart(7)}    ${fz(q(zs, 0.1)).padStart(7)} / ${fz(q(zs, 0.5)).padStart(6)} / ${fz(q(zs, 0.9)).padStart(6)}      ${(100 * zs.filter((z) => z > 0.5).length / zs.length).toFixed(1).padStart(5)} %   ${(100 * zs.filter((z) => z > 1).length / zs.length).toFixed(1).padStart(5)} %`);
  }
};
binTable('ICON-D2 z0 gegen HSURF', regularPoints(d2z0a, d2h), 'h', HBINS);
binTable('ICON-EU Z0 gegen HSURF', regularPoints(euz0a, euh), 'h', HBINS);
binTable('ICON global Z0 gegen HSURF', unstructuredPoints(glz0a.values, clat.values, clon.values, glh.values), 'h', HBINS);
if (ch?.z0 && ch.sso) {
  const pts = unstructuredPoints(ch.z0, ch.lat, ch.lon, ch.hsurf, ch.sso);
  binTable('ICON-CH1 Z0 gegen HSURF', pts, 'h', HBINS);
  binTable('ICON-CH1 Z0 gegen SSO_STDH', pts, 's', [[0, 10], [10, 25], [25, 50], [50, 100], [100, 200], [200, 400], [400, 2000]]);
  // Spearman-Rang zwischen ln z0 und SSO_STDH, getrennt unter/über 1 500 m Modellhöhe.
  const rank = (xs) => { const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; };
  const spear = (a, b) => { const ra = rank(a), rb = rank(b), n = a.length, m = (n - 1) / 2; let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (ra[i] - m) * (rb[i] - m); sa += (ra[i] - m) ** 2; sb += (rb[i] - m) ** 2; } return s / Math.sqrt(sa * sb); };
  for (const [lab, f] of [['HSURF < 1 500 m', (p) => p.h < 1500], ['HSURF ≥ 1 500 m', (p) => p.h >= 1500]]) {
    const sub = pts.filter(f).filter((_, i) => i % 7 === 0);
    console.log(`  Spearman(ln z0, SSO_STDH) ${lab}: ${spear(sub.map((p) => Math.log(p.z)), sub.map((p) => p.s)).toFixed(3)} (n ${sub.length}, jeder 7. Punkt)`);
  }
}

// ── Teil B: Stufengitter (ln-Blockmittel), Lauf 00z gegen 12z ────────────────
const lnField = (f) => ({ ...f, values: Float32Array.from(f.values, (v) => (Number.isFinite(v) && v > 0 ? Math.log(v) : NaN)) });
function blockMeanUnstructured(values, lat, lon, tier) {
  const sum = new Float64Array(tier.ny * tier.nx), cnt = new Int32Array(tier.ny * tier.nx);
  for (let c = 0; c < values.length; c++) {
    const v = values[c]; if (!(Number.isFinite(v) && v > 0)) continue;
    let lo = lon[c]; if (lo > 180) lo -= 360;
    const iy = Math.round((lat[c] - tier.lat0) / tier.deg), ix = Math.round((lo - tier.lon0) / tier.deg);
    if (iy < 0 || iy >= tier.ny || ix < 0 || ix >= tier.nx) continue;
    sum[iy * tier.nx + ix] += Math.log(v); cnt[iy * tier.nx + ix]++;
  }
  const out = new Float32Array(tier.ny * tier.nx).fill(NaN);
  for (let k = 0; k < out.length; k++) if (cnt[k] > 0) out[k] = sum[k] / cnt[k];
  return fillNearest(out, tier);
}
const onTier = {
  t1: { icon_d2: [sampleRegularToTier(lnField(d2z0a), TIER_BY_ID.t1), sampleRegularToTier(lnField(d2z0b), TIER_BY_ID.t1)], icon_eu: [sampleRegularToTier(lnField(euz0a), TIER_BY_ID.t1), sampleRegularToTier(lnField(euz0b), TIER_BY_ID.t1)] },
  t2: { icon_eu: [sampleRegularToTier(lnField(euz0a), TIER_BY_ID.t2), sampleRegularToTier(lnField(euz0b), TIER_BY_ID.t2)], icon_global: [blockMeanUnstructured(glz0a.values, clat.values, clon.values, TIER_BY_ID.t2), blockMeanUnstructured(glz0b.values, clat.values, clon.values, TIER_BY_ID.t2)] },
  t3: { icon_global: [blockMeanUnstructured(glz0a.values, clat.values, clon.values, TIER_BY_ID.t3), blockMeanUnstructured(glz0b.values, clat.values, clon.values, TIER_BY_ID.t3)] },
};
if (ch?.z0) {
  onTier.t1.icon_ch1_eps = [blockMeanUnstructured(ch.z0, ch.lat, ch.lon, TIER_BY_ID.t1), null];
  onTier.t2.icon_ch1_eps_on_t2 = [blockMeanUnstructured(ch.z0, ch.lat, ch.lon, TIER_BY_ID.t2), null];
}
console.log(`\nTeil B — Stufengitter (ln-Blockmittel), ${RUNS[0]} gegen ${RUNS[1]}, Schritt 000:`);
for (const [t, cols] of Object.entries(onTier)) {
  for (const [id, [a, b]] of Object.entries(cols)) {
    const cov = a.reduce((n, v) => n + (Number.isFinite(v) ? 1 : 0), 0);
    const zs = [...a].filter(Number.isFinite).map(Math.exp);
    let line = `  ${t} ${id.padEnd(20)} Deckung ${cov}/${a.length} · z0 p10/p50/p90/max ${fz(q(zs, 0.1))}/${fz(q(zs, 0.5))}/${fz(q(zs, 0.9))}/${fz(Math.max(...zs))} m`;
    if (b) {
      let land = 0, landHi = 0, landLo = 0, water = 0, waterHi = 0;
      for (let k = 0; k < a.length; k++) {
        if (!Number.isFinite(a[k]) || !Number.isFinite(b[k])) continue;
        const d = Math.abs(a[k] - b[k]);
        if (Math.min(a[k], b[k]) > Math.log(0.01)) { land++; if (d > 0.1) landHi++; if (d > 0.01) landLo++; }
        else { water++; if (d > 0.1) waterHi++; }
      }
      line += ` · 00z→12z: z0 > 1 cm |Δln| > 0,01 an ${(100 * landLo / land).toFixed(2)} %, > 0,1 an ${(100 * landHi / land).toFixed(2)} % (n ${land}); darunter > 0,1 an ${(100 * waterHi / Math.max(1, water)).toFixed(1)} % (n ${water})`;
    }
    console.log(line);
  }
}

// ── Teil C: 42 Orte — GRIB-z0 der Zelle gegen WorldCover (Zellbox AP16, Punktbox v1), nach Relief ─────
const places = [
  ['hamburg', 53.5511, 9.9937], ['berlin', 52.52, 13.405], ['muenchen', 48.1372, 11.5755], ['wien', 48.2082, 16.3738], ['graz', 47.0707, 15.4395],
  ['innsbruck', 47.2692, 11.4041], ['zuerich', 47.3769, 8.5417], ['genf', 46.2044, 6.1432], ['zermatt', 46.0207, 7.7491], ['zugspitze', 47.421, 10.9863],
];
const archive = JSON.parse(readFileSync(new URL('../../scripts/punktarchiv/points.json', import.meta.url), 'utf8')).points;
archive.forEach((p, i) => { if (i % 13 === 0) places.push([`${p.id} ${p.name.trim().slice(0, 14)}`, p.lat, p.lon]); });
const cache = memoryBackend();
const topts = { decodeRgba: (bytes) => { const img = decodePng(Buffer.from(bytes)); return { data: toRgba(img), width: img.width, height: img.height }; }, cache, timeoutMs: 20_000 };
const rows = [];
for (const [name, lat, lon] of places) {
  const tl = await loadWorldCoverTiles(lat, lon, { cache, timeoutMs: 20_000 });
  if (!tl.usable.length) { rows.push({ name, err: 'keine Kachel' }); continue; }
  const classAt = classAtOf(tl.usable);
  const v1 = z0FromClassField(classAt, lat, lon);
  const lc = landCoverFromClassField(classAt, lat, lon, windowFromTiles(tl.usable, lat, lon)).landCover;
  const per = {};
  for (const t of ['t1', 't2', 't3']) {
    const tier = TIER_BY_ID[t], c = cellOf(tier, lat, lon), m = cellCenter(tier, c.iy, c.ix), k = c.iy * tier.nx + c.ix;
    const terr = await loadTerrainAtPoint(m.lat, m.lon, topts).catch(() => null);
    const grib = {};
    for (const [id, [a]] of Object.entries(onTier[t])) grib[id] = Number.isFinite(a[k]) ? Math.exp(a[k]) : null;
    per[t] = { grib, wcCell: t === 't3' ? null : landCoverCell(lc, t, c.iy, c.ix)?.z0 ?? null, wcPoint: v1.z0Mod[t] ?? null, reliefM: terr?.scales?.spreadM?.[3] ?? null, hCell: terr?.elevationM ?? null };
  }
  rows.push({ name, lat, lon, z0True: v1.z0True, per });
}
const ok = rows.filter((r) => !r.err);
console.log(`\nTeil C — ${ok.length}/${rows.length} Orte; Relief = Höhenstreuung im 4-km-Kreis um die Zellmitte (Terrarium)`);
console.log('Ort                        Relief t1   z0 D2 / EU / CH1 (t1)      WC Zelle / Punktbox (t1)   z0 EU / global (t2)   WC Zelle (t2)   global (t3) / WC Punktbox (t3)');
for (const r of ok) {
  const a = r.per.t1, b = r.per.t2, c = r.per.t3;
  console.log(`${r.name.padEnd(26)} ${String(a.reliefM == null ? '—' : Math.round(a.reliefM)).padStart(6)} m   ${fz(a.grib.icon_d2).padStart(5)} / ${fz(a.grib.icon_eu).padStart(5)} / ${fz(a.grib.icon_ch1_eps).padStart(5)}      ${fz(a.wcCell).padStart(6)} / ${fz(a.wcPoint).padStart(6)}             ${fz(b.grib.icon_eu).padStart(5)} / ${fz(b.grib.icon_global).padStart(5)}        ${fz(b.wcCell).padStart(6)}          ${fz(c.grib.icon_global).padStart(5)} / ${fz(c.wcPoint).padStart(6)}`);
}
const classes = [['flach (< 50 m)', (x) => x < 50], ['hügelig (50–200 m)', (x) => x >= 50 && x < 200], ['Gebirge (≥ 200 m)', (x) => x >= 200]];
const stat = (label, pairs) => {
  const lr = pairs.map(([g, w]) => Math.log(g / w));
  return `${label}: n ${lr.length}, ln(GRIB/WC) p10/p50/p90 ${lr.length ? `${q(lr, 0.1).toFixed(2)} / ${q(lr, 0.5).toFixed(2)} / ${q(lr, 0.9).toFixed(2)}` : '—'} (Faktor p50 ${lr.length ? Math.exp(q(lr, 0.5)).toFixed(2) : '—'})`;
};
for (const [tid, src, wc] of [['t1', 'icon_d2', 'wcCell'], ['t1', 'icon_eu', 'wcCell'], ['t1', 'icon_ch1_eps', 'wcCell'], ['t2', 'icon_eu', 'wcCell'], ['t2', 'icon_global', 'wcCell'], ['t3', 'icon_global', 'wcPoint']]) {
  console.log(`\n${tid} ${src} gegen WorldCover (${wc === 'wcCell' ? 'Zellbox' : 'Punktbox'}):`);
  for (const [lab, f] of classes) {
    const pairs = ok.map((r) => r.per[tid]).filter((x) => x.reliefM != null && f(x.reliefM) && x.grib[src] > 0 && x[wc] > 0).map((x) => [x.grib[src], x[wc]]);
    console.log(`  ${stat(lab.padEnd(20), pairs)}`);
  }
}
console.log(`\nfertig in ${((performance.now() - T0) / 1000).toFixed(0)} s`);
process.exit(0);
