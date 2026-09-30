/**
 * clima-grid-check.mjs — AX-9: taugt das Klimagitter (`point/static/clima-grid/v1`, Normale 1991–2020) als Tagesmittel
 * des Temperatur-Priors besser als das Stationsfeld (`public/climaGrid.json`, 178 Stationen)? Gemessen an den
 * Wahrheitspunkten des Hindcasts (`C:\dev\buscosun-hindcast\truth\<tag>.json.gz`, stündlich, 405 Punkte).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/clima-grid-check.mjs \
 *        --point=<point/-Verzeichnis mit static/clima-grid> [--truth=C:/dev/buscosun-hindcast/truth] [--from=2023-06] [--to=2026-08] [--out=…md]
 *
 * Je Punkt und Kalendermonat (≥ 80 % der Stunden): Monatsmittel der Wahrheit T gegen
 *   S  Stationsfeld: Mittel über die Tage des Monats von `ClimaField.sample(lat, lon, doy, elev).tempMean`
 *   G  Gitter: `t_mean_<MM>` der Stufe-1-Zelle + Γ·(elev_src − elev) mit Γ = 0,0065 K/m (die Regel des Clients)
 *   G0 Gitter OHNE Höhenkorrektur (zeigt, was die Korrektur trägt)
 * Bias und MAE je Land und Höhenklasse; dazu MAE nach Abzug des landesweiten Bias je Quelle (die Jahre 2023–2026 liegen
 * über der Normalperiode — dieser gemeinsame Anteil ist kein Unterschied zwischen den Kandidaten). Paarweise: an wie
 * vielen Punkten ist G näher als S (Vorzeichentest, zweiseitig).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, inflateRawSync } from 'node:zlib';
import { ClimaField } from '../../src/ml/climaField.ts';
import { readStaticProductPoint } from '../../src/point/client/staticPoint.ts';
import { CLIMA_GRID_PRODUCT, CLIMA_GRID_VERSION } from '../../src/point/cubeFormat.ts';
import { climaGridMonthlyAt, CLIMA_GRID_LAPSE_PER_M } from '../../src/pointForecast/cubeSource.ts';

const args = {};
for (const s of process.argv.slice(2)) { const m = /^--([^=]+)(?:=(.*))?$/.exec(s); if (m) args[m[1]] = m[2] ?? '1'; }
const POINT = args.point || 'data/point';
const TRUTH = args.truth || 'C:/dev/buscosun-hindcast/truth';
const FROM = args.from || '2023-06', TO = args.to || '2026-08';
const OUT = args.out || null;

const inflate = async (u8) => new Uint8Array(inflateRawSync(Buffer.from(u8)));
const store = {
  base: 'file://' + POINT, stats: { requests: 0, bytes: 0 },
  async bytes(path) { const p = join(POINT, path.replace(/^point\//, '')); if (!existsSync(p)) return null; return new Uint8Array(readFileSync(p)); },
  async json(path) { const b = await this.bytes(path); return b ? JSON.parse(new TextDecoder().decode(b)) : null; },
  withBase() { return this; },
};
const field = new ClimaField(JSON.parse(readFileSync('public/climaGrid.json', 'utf8')));
const stations = JSON.parse(readFileSync(join(TRUTH, 'stations.json'), 'utf8')).points;

// ── Wahrheit: Monatsmittel T je Punkt ────────────────────────────────────────
const days = readdirSync(TRUTH).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).map((f) => f.slice(0, 10)).filter((d) => d.slice(0, 7) >= FROM && d.slice(0, 7) <= TO).sort();
const acc = new Map();   // `${id}|${ym}` → { sum, n }
let daysRead = 0;
for (const day of days) {
  const doc = JSON.parse(gunzipSync(readFileSync(join(TRUTH, `${day}.json.gz`))));
  const sentinel = doc.sentinel ?? -32768, scale = doc.scales?.truth?.t?.scale ?? 0.01;
  const ym = day.slice(0, 7);
  for (const [id, nets] of Object.entries(doc.byPoint)) {
    for (const net of Object.values(nets)) {
      const t = net?.t; if (!Array.isArray(t)) continue;
      const key = `${id}|${ym}`;
      const e = acc.get(key) ?? { sum: 0, n: 0 };
      for (const q of t) { if (q == null || q === sentinel) continue; e.sum += q * scale; e.n++; }
      acc.set(key, e);
      break;   // ein Netz je Punkt (das erste trägt)
    }
  }
  daysRead++;
}
console.log(`Wahrheit: ${daysRead} Tage ${days[0]}…${days.at(-1)}, ${acc.size} Punkt-Monate`);

// ── Kandidaten je Punkt ──────────────────────────────────────────────────────
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DOY0 = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const rows = [];
let noGrid = 0, noElev = 0;
for (const [id, st] of Object.entries(stations)) {
  if (st.elev == null) { noElev++; continue; }
  const cg = await readStaticProductPoint(store, CLIMA_GRID_PRODUCT, CLIMA_GRID_VERSION, 't1', st.lat, st.lon, { decodeChunk: (b, o) => import('../../src/point/cubeFormat.ts').then((m) => m.decodeCubeChunk(b, { ...o, decompress: inflate })) });
  const col = cg?.byColumn ?? null;
  if (!col || col.elev_src == null || col.t_mean_01 == null) { noGrid++; continue; }
  for (let m = 0; m < 12; m++) {
    let sS = 0, sG = 0, n = 0;
    for (let d = 1; d <= DAYS[m]; d++) {
      const doy = DOY0[m] + d;
      const s = field.sample(st.lat, st.lon, doy, st.elev).tempMean;
      const g = climaGridMonthlyAt(col, 't_mean', doy);
      if (!Number.isFinite(s) || g == null) { n = 0; break; }
      sS += s; sG += g; n++;
    }
    if (!n) continue;
    const gRaw = sG / n, S = sS / n;
    const G = gRaw - CLIMA_GRID_LAPSE_PER_M * (st.elev - col.elev_src);
    for (const y of [2023, 2024, 2025, 2026]) {
      const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
      const e = acc.get(`${id}|${ym}`);
      if (!e || e.n < 0.8 * DAYS[m] * 24) continue;
      // R: Reliefregel — Gitter nur, wo Höhe oder Relief zählen (h ≥ 500 m oder |Δh| > 200 m), sonst Stationsfeld.
      // S+/G+: Trendversatz 0,45 K/Dekade ab der Periodenmitte (Stationsfeld 1995–2024 ⇒ 2009,5; Normale 1991–2020 ⇒ 2005,5) —
      // beide Referenzperioden liegen hinter der Erwärmung; gemessen, ob das die gemeinsame Kaltverschiebung erklärt.
      const dh = st.elev - col.elev_src;
      const R = (st.elev >= 500 || Math.abs(dh) > 200) ? G : S;
      const yf = y + m / 12;
      rows.push({ id, country: st.country, elev: st.elev, dh, ym, truth: e.sum / e.n, S, G, G0: gRaw, R, Sp: S + 0.045 * (yf - 2009.5), Gp: G + 0.045 * (yf - 2005.5), Rp: R + 0.045 * (yf - (R === G ? 2005.5 : 2009.5)) });
    }
  }
}
console.log(`Punkte ohne Höhe ${noElev}, ohne Gitterzelle ${noGrid}; Zeilen ${rows.length}`);

// ── Auswertung ───────────────────────────────────────────────────────────────
const cls = (e) => (e < 500 ? '<500 m' : e < 1500 ? '500–1500 m' : '≥1500 m');
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const eval1 = (rs, key) => {
  const err = rs.map((r) => r[key] - r.truth);
  const bias = mean(err), mae = mean(err.map(Math.abs)), maeC = mean(err.map((x) => Math.abs(x - bias)));
  return { n: rs.length, bias, mae, maeC };
};
const lines = [];
const out = (s) => { lines.push(s); console.log(s); };
out(`\n| Gruppe | n | S bias / MAE / MAE−bias | G bias / MAE / MAE−bias | G0 MAE | G näher als S | p (Vorzeichen) |`);
out(`|---|---|---|---|---|---|---|`);
const groups = [['alle', () => true], ...['DE', 'AT', 'CH'].map((c) => [c, (r) => r.country === c]), ...['<500 m', '500–1500 m', '≥1500 m'].map((k) => [k, (r) => cls(r.elev) === k]), ['|Δh| > 200 m', (r) => Math.abs(r.dh) > 200]];
const binom = (k, n) => { // zweiseitiger Vorzeichentest, Normalnäherung
  const z = (k - n / 2) / Math.sqrt(n / 4); const p = 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2))); return p;
};
function erf(x) { const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return y; }
for (const [name, f] of groups) {
  const rs = rows.filter(f); if (!rs.length) continue;
  const S = eval1(rs, 'S'), G = eval1(rs, 'G'), G0 = eval1(rs, 'G0'), R = eval1(rs, 'R'), Sp = eval1(rs, 'Sp'), Gp = eval1(rs, 'Gp'), Rp = eval1(rs, 'Rp');
  const wins = rs.filter((r) => Math.abs(r.G - r.truth) < Math.abs(r.S - r.truth)).length;
  out(`| ${name} | ${rs.length} | ${S.bias.toFixed(2)} / ${S.mae.toFixed(2)} / ${S.maeC.toFixed(2)} | ${G.bias.toFixed(2)} / ${G.mae.toFixed(2)} / ${G.maeC.toFixed(2)} | ${G0.mae.toFixed(2)} | ${R.mae.toFixed(2)} | ${Sp.mae.toFixed(2)} / ${Gp.mae.toFixed(2)} / ${Rp.mae.toFixed(2)} | ${(100 * wins / rs.length).toFixed(0)} % | ${binom(wins, rs.length).toExponential(1)} |`);
}
// Verteilung von Δh (Punkt gegen Bezugshöhe der Zelle)
const dhs = rows.map((r) => Math.abs(r.dh)).sort((a, b) => a - b);
out(`\n|Δh| Punkt − elev_src: p50 ${dhs[Math.floor(dhs.length / 2)].toFixed(0)} m · p90 ${dhs[Math.floor(dhs.length * 0.9)].toFixed(0)} m · max ${dhs.at(-1).toFixed(0)} m`);
if (OUT) writeFileSync(OUT, lines.join('\n') + '\n');
