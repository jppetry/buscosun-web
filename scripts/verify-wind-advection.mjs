/**
 * Verifier: Wind-Partikel-Advektion — Treue zu den GRIB-Werten.
 *
 *   node --experimental-strip-types scripts/verify-wind-advection.mjs
 *   npm run verify:wind-advection
 *
 * Prüft die reine Mathematik aus `src/wind/advection.ts` GEGEN EINE UNABHÄNGIGE
 * REFERENZ — nicht gegen sich selbst:
 *
 *   MODELL    = exakt die Shader-Formel (updateFrag), hier 1:1 nachgebildet:
 *               offset = (u/cos φ, −NS_ASPECT·v) · u_step_scale,
 *               danach die Mercator-Projektion aus drawVert.
 *   REFERENZ  = Advektion eines Luftpakets nach Kugelgeometrie
 *               (Δλ = u·t/(R cos φ), Δφ = v·t/R), anschließend dieselbe
 *               Projektion. Zeitraffer T aus dem dokumentierten Vertrag.
 *
 * Nur wenn beide Wege denselben Bildschirmvektor liefern, entspricht die
 * gezeigte Partikelbewegung tatsächlich dem GRIB-Wind.
 *
 * Diagnose + Herleitung: audit/wind-partikel-grib-treue.md
 */

import { readFileSync } from 'node:fs';
import {
  advectionStepScale,
  screenTempoGain,
  screenSpeedPxPerSec,
  zoomInThinFraction,
  ZOOM_IN_THIN_FLOOR,
  deadBandStep,
  positionQuantum,
  EARTH_RADIUS_M,
  EARTH_CIRCUMFERENCE_M,
  TILE_SIZE_CSS,
  NS_ASPECT,
  LAT_REF_DEG,
} from '../src/wind/advection.ts';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) { pass++; return; }
  fail++;
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}
function near(name, got, want, tol, unit = '') {
  const d = Math.abs(got - want);
  check(name, d <= tol, `erhalten ${fmt(got)}${unit}, erwartet ${fmt(want)}${unit} (Δ ${fmt(d)}, Toleranz ${fmt(tol)})`);
}
const fmt = (x) => (Number.isFinite(x) ? (Math.abs(x) >= 1e-4 ? x.toFixed(6) : x.toExponential(3)) : String(x));

// ── Projektion, identisch zu drawVert/updateFrag ──────────────────────────
const DEG = Math.PI / 180;
const equiX = (lng) => (lng + 180) / 360;
const equiY = (lat) => (90 - lat) / 180;
const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => 0.5 - Math.log(Math.tan(Math.PI * 0.25 + (lat * DEG) * 0.5)) / (2 * Math.PI);

/** Ein Advektionsschritt EXAKT nach updateFrag → Bildschirmversatz in CSS-px. */
function modelScreenStep(u, v, lat, lng, zoom, opts, dtScale60 = 1) {
  const s = advectionStepScale(zoom, dtScale60, opts);
  const y0 = equiY(lat);
  const distortion = Math.max(0.05, Math.cos((y0 * 180 - 90) * DEG));
  const dX = (u / distortion) * s;
  const dY = -NS_ASPECT * v * s;
  const lng1 = (equiX(lng) + dX) * 360 - 180;
  const lat1 = 90 - (y0 + dY) * 180;
  const world = TILE_SIZE_CSS * Math.pow(2, zoom);
  return {
    x: (mercX(lng1) - mercX(lng)) * world,
    y: (mercY(lat1) - mercY(lat)) * world,
    lat1, lng1,
  };
}

/** Unabhängige Referenz: echtes Luftpaket, Kugelgeometrie, danach projiziert. */
function referenceScreenStep(u, v, lat, lng, zoom, opts, dtScale60 = 1) {
  const world = TILE_SIZE_CSS * Math.pow(2, zoom);
  // Zeitraffer aus dem Vertrag: px/s = gain·|V| bei LAT_REF_DEG.
  const T = screenTempoGain(zoom, opts) * Math.cos(LAT_REF_DEG * DEG)
    * EARTH_CIRCUMFERENCE_M / world;
  const seconds = (dtScale60 / 60) * T;                   // gerafte Zeit
  const dLat = ((v * seconds) / EARTH_RADIUS_M) / DEG;
  const dLng = ((u * seconds) / (EARTH_RADIUS_M * Math.cos(lat * DEG))) / DEG;
  return {
    x: (mercX(lng + dLng) - mercX(lng)) * world,
    y: (mercY(lat + dLat) - mercY(lat)) * world,
  };
}

const angleBetween = (a, b) => {
  const cross = a.x * b.y - a.y * b.x;
  const dot = a.x * b.x + a.y * b.y;
  return Math.abs(Math.atan2(cross, dot)) / DEG;
};
const len = (a) => Math.hypot(a.x, a.y);

// Die Produktiv-Einstellung der 2D-Karte (s. src/MapView.tsx).
const PROD = { speedPxPerMs: 6, speedFactor: 1, speedRefZoom: 5.5, screenTempoZoomExp: 0 };

const ZOOMS = [2, 4, 5.5, 7, 9, 11];
const LATS = [45, 48, 51, 55];
const BEARINGS = Array.from({ length: 16 }, (_, i) => (i * 360) / 16);

console.log('── T1  Richtungstreue + Isotropie (Modell gegen Kugelgeometrie) ──');
{
  let maxAng = 0, maxRel = 0;
  for (const z of ZOOMS) {
    for (const lat of LATS) {
      for (const bearing of BEARINGS) {
        // Meteorologische Konvention interessiert hier nicht — reiner Vektor.
        const speed = 12;
        const u = speed * Math.sin(bearing * DEG);
        const v = speed * Math.cos(bearing * DEG);
        const m = modelScreenStep(u, v, lat, 10, z, PROD);
        const r = referenceScreenStep(u, v, lat, 10, z, PROD);
        maxAng = Math.max(maxAng, angleBetween(m, r));
        maxRel = Math.max(maxRel, Math.abs(len(m) - len(r)) / len(r));
      }
    }
  }
  check('T1.1 Richtungsfehler über 16 Peilungen × 4 Breiten × 6 Zooms < 0,01°',
    maxAng < 0.01, `max ${fmt(maxAng)}°`);
  check('T1.2 Betragsfehler < 0,2 %', maxRel < 0.002, `max ${fmt(maxRel * 100)} %`);

  // Der eigentliche Regressionswächter: reiner Nord- gegen reinen Ostwind.
  for (const lat of LATS) {
    const e = len(modelScreenStep(10, 0, lat, 10, 5.5, PROD));
    const nrd = len(modelScreenStep(0, 10, lat, 10, 5.5, PROD));
    near(`T1.3 Nord/Ost-Verhältnis bei ${lat}°N`, nrd / e, 1, 0.002);
  }
}

console.log('── T2  Linearität: px/s ist strikt proportional zu |V| ──');
{
  const z = 5.5, lat = 51;
  const base = len(modelScreenStep(1, 0, lat, 10, z, PROD)) * 60;
  for (const speed of [0.2, 0.5, 1, 2, 5, 10, 17.5, 25, 35]) {
    const got = len(modelScreenStep(speed, 0, lat, 10, z, PROD)) * 60;
    near(`T2 ${speed} m/s ⇒ ${fmt(speed * base)} px/s`, got / speed, base, base * 1e-6);
  }
  // Verhältnistreue explizit: 20 m/s muss GENAU 10× so schnell sein wie 2 m/s.
  const r = len(modelScreenStep(20, 0, lat, 10, z, PROD)) / len(modelScreenStep(2, 0, lat, 10, z, PROD));
  near('T2.x Verhältnis 20 m/s : 2 m/s', r, 10, 1e-9);
}

console.log('── T3  Zoom ändert NUR die Darstellung ──');
{
  const lat = 51, speed = 10;
  const ref = len(modelScreenStep(speed, 0, lat, 10, 5.5, PROD)) * 60;
  for (const z of ZOOMS) {
    const got = len(modelScreenStep(speed, 0, lat, 10, z, PROD)) * 60;
    near(`T3.1 z${z}: ${speed} m/s ⇒ px/s konstant`, got, ref, ref * 1e-6, ' px/s');
  }
  near('T3.2 Vertrag: 10 m/s ⇒ 60 px/s bei 51°N', ref, 60, 0.2, ' px/s');
  // Und der Windwert selbst bleibt in JEDEM Fall unberührt — die Richtung darf
  // sich beim Zoomen nicht ändern. Gemessen an der TANGENTE (winziger Schritt):
  // ein voller 60-fps-Schritt ist bei z2 geografisch so lang, dass die Krümmung
  // der Mercator-Meridiane die Sehne um ~0,015° gegen die Tangente dreht — das
  // ist Diskretisierung, nicht Richtungsfehler.
  let maxAng = 0;
  for (const z of ZOOMS) {
    const a = modelScreenStep(7, 5, lat, 10, z, PROD, 1e-3);
    const b = modelScreenStep(7, 5, lat, 10, 5.5, PROD, 1e-3);
    maxAng = Math.max(maxAng, angleBetween(a, b));
  }
  check('T3.3 Richtung zoom-invariant < 0,01°', maxAng < 0.01, `max ${fmt(maxAng)}°`);

  // Alternative Zoomgesetze verhalten sich wie dokumentiert.
  for (const [expv, label] of [[0.75, 'Alt-buscosun'], [1, 'rein geografisch']]) {
    const o = { ...PROD, screenTempoZoomExp: expv };
    const g1 = screenTempoGain(6.5, o) / screenTempoGain(5.5, o);
    near(`T3.4 exp ${expv} (${label}): Tempo je Zoomstufe`, g1, Math.pow(2, expv), 1e-9);
  }
}

console.log('── T4  Breitenabhängigkeit ist die der KARTE (konform), nicht Willkür ──');
{
  const z = 5.5, speed = 10;
  for (const lat of LATS) {
    const got = len(modelScreenStep(speed, 0, lat, 10, z, PROD)) * 60;
    const want = screenSpeedPxPerSec(speed, z, lat, PROD);
    near(`T4 ${lat}°N`, got, want, want * 1e-6, ' px/s');
  }
  // Mercator-Dehnung: 55°N ggü. 45°N = cos45/cos55
  const a = len(modelScreenStep(10, 0, 45, 10, z, PROD));
  const b = len(modelScreenStep(10, 0, 55, 10, z, PROD));
  near('T4.x Verhältnis 55°N : 45°N = cos45/cos55',
    b / a, Math.cos(45 * DEG) / Math.cos(55 * DEG), 1e-6);
}

console.log('── T5  Totzone der Positionskodierung ist überwunden ──');
{
  // Ein RGBA8-Ziel rundet zum nächsten Wert: ein Schritt unter einem HALBEN
  // Quantum lässt das Partikel vollständig stehen. Genau diese Totzone war der
  // Grund für γ-Kennlinie und Mindesttempo — ohne sie wäre eine lineare Anzeige
  // nicht möglich gewesen.
  //
  // Beide Spalten benutzen DIESELBE (neue, lineare) Tempoformel und
  // unterscheiden sich NUR in der Bezugsfläche der Kodierung.
  // Bezugsrechteck = Sichtfeld + 10 % je Seite. Karte 1280 CSS-px breit.
  const cssW = 1280;
  const weakest = 0.5; // m/s — sehr schwach (1,8 km/h), aber echter Wind
  const lat = 51;
  let minRatio = Infinity;
  for (const z of ZOOMS) {
    const world = TILE_SIZE_CSS * Math.pow(2, z);
    const spanNew = Math.min(1, (cssW / world) * 1.2);
    const stepX = Math.abs(modelScreenStep(weakest, 0, lat, 10, z, PROD).x) / world;
    const ratioNew = stepX / deadBandStep(spanNew);
    const ratioOld = stepX / deadBandStep(1);          // welt-relativ (Altstand)
    minRatio = Math.min(minRatio, ratioNew);
    check(`T5 z${z}: ${weakest} m/s bewegt sich (Schritt / Schwelle = ${ratioNew.toFixed(1)}×)`,
      ratioNew > 2, `nur ${ratioNew.toFixed(2)}× — Partikel würde einfrieren`);
    console.log(`      z${String(z).padEnd(4)} bounds-relativ ${ratioNew.toFixed(1).padStart(9)}×   welt-relativ (alt) ${ratioOld.toFixed(2).padStart(6)}×   Quantum ${(positionQuantum(spanNew) * 360 * 111320 * Math.cos(lat * DEG)).toFixed(1)} m`);
  }
  console.log(`      → schwächster noch dargestellter Wind: ${(weakest / minRatio).toFixed(3)} m/s (${(weakest / minRatio * 3.6).toFixed(2)} km/h), zoomunabhängig`);
}

console.log('── T6  Alt-Kennlinie ist neutral — und als Fallback intakt ──');
{
  // dispSpeed exakt wie im Shader (updateFrag/dispVelocity).
  const disp = (speed, gamma, ref, min) => {
    let d = speed;
    if (gamma !== 1) d = Math.pow(speed / ref, gamma) * ref;
    return Math.max(min, d);
  };
  for (const s of [0.1, 0.5, 1, 2, 5, 10, 20, 30]) {
    near(`T6.1 neutral (γ=1, min=0) lässt ${s} m/s unverändert`, disp(s, 1, 5, 0), s, 1e-12);
  }
  // Der benannte Fallback muss die frühere Stauchung exakt reproduzieren
  // (Zahlen aus audit/wind-partikel-grib-treue.md §3).
  near('T6.2 Fallback γ=0,6/ref=5/min=2,35 bei 20 m/s', disp(20, 0.6, 5, 2.35), 11.487, 0.001);
  near('T6.3 Fallback bei 1 m/s greift der Boden', disp(1, 0.6, 5, 2.35), 2.35, 1e-9);
}

console.log('── T7  Regressionswächter: die ALTE Formel war nachweislich falsch ──');
{
  // Ohne NS_ASPECT (der Altstand) muss der bekannte Fehler wieder auftreten —
  // stimmt das nicht mehr, misst dieser Verifier nicht mehr, was er soll.
  const lat = 48, z = 5.5, speed = 10;
  const s = advectionStepScale(z, 1, PROD);
  const world = TILE_SIZE_CSS * Math.pow(2, z);
  const y0 = equiY(lat);
  const oldStep = (u, v) => {
    const dist = Math.cos((y0 * 180 - 90) * DEG);
    const lng1 = (equiX(10) + (u / dist) * s) * 360 - 180;
    const lat1 = 90 - (y0 - v * s) * 180;    // ALT: ohne Faktor 2
    return { x: (mercX(lng1) - mercX(10)) * world, y: (mercY(lat1) - mercY(lat)) * world };
  };
  const e = len(oldStep(speed, 0));
  const nrd = len(oldStep(0, speed));
  near('T7.1 Altstand: Nord lief halb so schnell wie Ost', nrd / e, 0.5, 0.002);
  const neOld = oldStep(speed, speed);                    // 45°-Nordost
  const angOld = Math.abs(Math.atan2(-neOld.y, neOld.x)) / DEG;
  near('T7.2 Altstand: 45°-Nordost erschien unter atan(0,5)', angOld, 26.565, 0.05, '°');
  const nNew = modelScreenStep(speed, speed, lat, 10, z, PROD);
  near('T7.3 Neu: 45°-Nordost erscheint unter 45°', Math.abs(Math.atan2(-nNew.y, nNew.x)) / DEG, 45, 0.02, '°');
}

console.log('── T8  HZ1: Ausdünnung beim Reinzoomen (audit/windpartikel-hochzoom.md) ──');
{
  // Die Werte der Wetterkarte stehen als Literale in MapView — hier gelesen,
  // nicht abgeschrieben, damit der Wächter der echten Einstellung folgt.
  const src = readFileSync(new URL('../src/MapView.tsx', import.meta.url), 'utf8');
  const num = (key) => { const m = src.match(new RegExp(`\\b${key}:\\s*([0-9.]+)`)); return m ? Number(m[1]) : NaN; };
  const cfg = {
    thinExp: num('zoomInThinExp'), thinFrom: num('zoomInThinFrom'),
    tempoExp: num('screenTempoZoomExp'), refZoom: num('speedRefZoom'), pxPerMs: num('speedPxPerMs'),
  };
  check('T8.0 MapView setzt zoomInThinExp/zoomInThinFrom/screenTempoZoomExp', Object.values(cfg).every(Number.isFinite), JSON.stringify(cfg));

  // Altverhalten: exp 0 lässt JEDE Zoomstufe exakt unverändert.
  let altOk = true;
  for (let z = 0; z <= 22; z += 0.25) if (zoomInThinFraction(z, 7, 0) !== 1) altOk = false;
  check('T8.1 exp 0 ⇒ Faktor exakt 1 auf z0–z22 (Rule-2-Fallback)', altOk);
  // Unterhalb der Schwelle unverändert, darüber exakt 2^−exp je Stufe.
  let belowOk = true;
  for (let z = 0; z <= cfg.thinFrom; z += 0.25) if (zoomInThinFraction(z, cfg.thinFrom, cfg.thinExp) !== 1) belowOk = false;
  check(`T8.2 bis z${cfg.thinFrom} unverändert`, belowOk);
  near('T8.3 eine Stufe über der Schwelle = 2^−exp', zoomInThinFraction(cfg.thinFrom + 1, cfg.thinFrom, cfg.thinExp), Math.pow(2, -cfg.thinExp), 1e-12);
  near('T8.4 vier Stufen über der Schwelle = 2^−4·exp', zoomInThinFraction(cfg.thinFrom + 4, cfg.thinFrom, cfg.thinExp), Math.pow(2, -4 * cfg.thinExp), 1e-12);
  let mono = true, prev = Infinity;
  for (let z = 0; z <= 22; z += 0.1) { const f = zoomInThinFraction(z, cfg.thinFrom, cfg.thinExp); if (f > prev + 1e-15) mono = false; prev = f; }
  check('T8.5 monoton fallend über den Zoom', mono);
  near('T8.6 Untergrenze greift bei extremem Zoom', zoomInThinFraction(22, cfg.thinFrom, cfg.thinExp), ZOOM_IN_THIN_FLOOR, 1e-12);

  // Kern der Phase: Schweif-„Tinte" ∝ gezeichnete Zahl × Schweiflänge, und die
  // Schweiflänge ∝ A(z) (wanduhr-normierte Spur). Oberhalb der Schwelle darf sie
  // mit der ECHTEN Einstellung nicht mehr wachsen, bis die Untergrenze greift.
  const tempo = { speedPxPerMs: cfg.pxPerMs, speedFactor: 1, speedRefZoom: cfg.refZoom, screenTempoZoomExp: cfg.tempoExp };
  const ink = (z, exp) => zoomInThinFraction(z, cfg.thinFrom, exp) * screenTempoGain(z, tempo);
  const floorZoom = cfg.thinFrom + Math.log2(1 / ZOOM_IN_THIN_FLOOR) / cfg.thinExp;
  let worst = 0;
  for (let z = cfg.thinFrom; z <= floorZoom; z += 0.1) worst = Math.max(worst, ink(z, cfg.thinExp) / ink(cfg.thinFrom, cfg.thinExp));
  check(`T8.7 Schweif-Tinte wächst oberhalb z${cfg.thinFrom} nicht (bis z${floorZoom.toFixed(1)})`, worst <= 1 + 1e-12, `max. Faktor ${worst.toFixed(3)}`);
  // Gegenprobe: OHNE Ausdünnung muss dieselbe Prüfung anschlagen, sonst misst sie nichts.
  const altGrowth = ink(13, 0) / ink(cfg.thinFrom, 0);
  check('T8.8 Gegenprobe: ohne Ausdünnung wächst die Tinte bis z13', altGrowth > 1.5, `Faktor ${altGrowth.toFixed(2)}`);
}

console.log('');
console.log(`Ergebnis: ${pass}/${pass + fail} bestanden`);
if (fail) {
  console.log('');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('✓ Die dargestellte Partikelbewegung entspricht den GRIB-Windwerten.');
