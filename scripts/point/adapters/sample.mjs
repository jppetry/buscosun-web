/**
 * sample.mjs — reine Abtast- und Nachbarindex-Funktionen (PD-F2a).
 *
 * Aus `shared.mjs` herausgezogen, weil der Dekodier-Worker (PD-F2d) diese Funktionen braucht,
 * aber `shared.mjs` NICHT laden darf: dort liegen AsyncLocalStorage-Kontext, Plattencache und
 * Netzzähler, die im Hauptthread bleiben. Hier steht nichts, was Netz, Dateisystem oder Prozess
 * anfasst — reine Funktionen über typisierte Arrays. `shared.mjs` re-exportiert alles, keine
 * Aufrufstelle ändert sich.
 */

// ---------------------------------------------------------------------------
// Abtastung auf das Stufengitter
// ---------------------------------------------------------------------------

/**
 * Reguläres GRIB-Feld → Stufengitter, als **Blockmittel** über die Quellzellen, die
 * in die Zielzelle fallen.
 *
 * Nächster Nachbar wäre hier falsch: ICON-D2 ist 0,02° und Stufe 1 ist 0,05°, also
 * fallen 2–3 Quellzellen je Achse in eine Zielzelle. Wer nur eine davon nimmt,
 * besetzt die Zelle nach dem Zufall einer einzigen Gitterlinie — im Gebirge ist das
 * der Unterschied zwischen Talboden und Hang.
 *
 * Umgekehrt (ICON-EU 0,0625° auf Stufe 2 mit 0,10°, IFS 0,25° auf Stufe 3 mit 0,25°)
 * fällt oft nur EINE Quellzelle in eine Zielzelle — dann ist das Blockmittel genau
 * der nächste Nachbar, und Zielzellen ohne Treffer bleiben `NaN`. Deshalb füllt
 * `fillGaps` sie anschließend aus dem nächsten belegten Nachbarn; ohne das hätte
 * Stufe 3 ein Schachbrett aus Löchern.
 */
// ── PD-F2c: Abtast-Index je Gittersignatur ───────────────────────────────────
//
// `sampleRegularToTier` lief je Aufruf über das VOLLE Quellgitter (ECMWF 1 M, ICON-D2 906 k,
// C-LAEF 593 k Punkte), obwohl nur der DACH-Ausschnitt trifft — und die Zuordnung Quellzelle →
// Zielzelle hängt allein an der Gittergeometrie und der Stufe, nicht an den Werten. Der Index
// hält genau die Paare, die die alte Schleife treffen würde, IN DERSELBEN REIHENFOLGE (j außen,
// i innen), damit die Blockmittel-Summen in identischer FP-Ordnung laufen ⇒ byte-gleich.
// `POINT_SAMPLE_INDEX=0` fährt die alte Vollschleife (Rückfall und Referenz).
const SAMPLE_INDEX_ENABLED = typeof process !== 'undefined' && process.env?.POINT_SAMPLE_INDEX !== '0';
const SAMPLE_INDEX_MAX = 16;
const sampleIndexCache = new Map();
export const sampleIndexStats = { built: 0, hits: 0 };

/** Schlüssel = alles, was die Zuordnung bestimmt — Geometrie der Quelle und der Stufe, keine Werte. */
export function sampleIndexKey(field, tier) {
  return `${field.ni}|${field.nj}|${field.lat1}|${field.lon1}|${field.di}|${field.dj}|${field.scanMode}`
    + `|${tier.id}|${tier.ny}|${tier.nx}|${tier.lat0}|${tier.lon0}|${tier.deg}`;
}

/**
 * Alle Paare (Quellindex, Zielindex) in der Reihenfolge der alten Schleife. Dieselben Zeilen wie
 * dort — mit derselben Rundung, demselben Wrap; nur der Wert-Test fehlt (der gehört zur Abtastung).
 */
export function buildSampleIndex(field, tier) {
  const { ni, nj, lat1, lon1, di, dj, scanMode } = field;
  const jNorth = (scanMode & 0x40) !== 0;   // GRIB2 Tabelle 3.4, Bit 2
  const src = [], dst = [];
  for (let j = 0; j < nj; j++) {
    const lat = jNorth ? lat1 + j * dj : lat1 - j * dj;
    const iy = Math.round((lat - tier.lat0) / tier.deg);
    if (iy < 0 || iy >= tier.ny) continue;
    for (let i = 0; i < ni; i++) {
      let lon = lon1 + i * di;
      if (lon > 180) lon -= 360;            // ECMWF: Ursprung 0°, gewrappt
      const ix = Math.round((lon - tier.lon0) / tier.deg);
      if (ix < 0 || ix >= tier.nx) continue;
      src.push(j * ni + i);
      dst.push(iy * tier.nx + ix);
    }
  }
  sampleIndexStats.built++;
  return { src: Int32Array.from(src), dst: Int32Array.from(dst), n: src.length };
}

/** Index aus dem LRU holen oder bauen. */
export function sampleIndexFor(field, tier) {
  const key = sampleIndexKey(field, tier);
  const hit = sampleIndexCache.get(key);
  if (hit) { sampleIndexCache.delete(key); sampleIndexCache.set(key, hit); sampleIndexStats.hits++; return hit; }
  const idx = buildSampleIndex(field, tier);
  sampleIndexCache.set(key, idx);
  while (sampleIndexCache.size > SAMPLE_INDEX_MAX) sampleIndexCache.delete(sampleIndexCache.keys().next().value);
  return idx;
}

/** Abtastung über den Index — identische Summenreihenfolge wie die Vollschleife. */
export function sampleWithIndex(values, idx, tier, fillGaps = true) {
  const sum = new Float64Array(tier.ny * tier.nx);
  const cnt = new Int32Array(tier.ny * tier.nx);
  const { src, dst, n } = idx;
  for (let q = 0; q < n; q++) {
    const v = values[src[q]];
    if (!Number.isFinite(v)) continue;
    sum[dst[q]] += v;
    cnt[dst[q]]++;
  }
  const out = new Float32Array(tier.ny * tier.nx).fill(NaN);
  for (let k = 0; k < out.length; k++) if (cnt[k] > 0) out[k] = sum[k] / cnt[k];
  return fillGaps ? fillNearest(out, tier) : out;
}

/** Die alte Vollschleife — Referenz für den Byte-Beweis und Rückfall (`POINT_SAMPLE_INDEX=0`). */
export function sampleRegularToTierFull(field, tier, { fillGaps = true } = {}) {
  const { ni, nj, lat1, lon1, di, dj, scanMode, values } = field;
  const sum = new Float64Array(tier.ny * tier.nx);
  const cnt = new Int32Array(tier.ny * tier.nx);
  const jNorth = (scanMode & 0x40) !== 0;   // GRIB2 Tabelle 3.4, Bit 2
  for (let j = 0; j < nj; j++) {
    const lat = jNorth ? lat1 + j * dj : lat1 - j * dj;
    const iy = Math.round((lat - tier.lat0) / tier.deg);
    if (iy < 0 || iy >= tier.ny) continue;
    for (let i = 0; i < ni; i++) {
      const v = values[j * ni + i];
      if (!Number.isFinite(v)) continue;
      let lon = lon1 + i * di;
      if (lon > 180) lon -= 360;            // ECMWF: Ursprung 0°, gewrappt
      const ix = Math.round((lon - tier.lon0) / tier.deg);
      if (ix < 0 || ix >= tier.nx) continue;
      sum[iy * tier.nx + ix] += v;
      cnt[iy * tier.nx + ix]++;
    }
  }
  const out = new Float32Array(tier.ny * tier.nx).fill(NaN);
  for (let k = 0; k < out.length; k++) if (cnt[k] > 0) out[k] = sum[k] / cnt[k];
  return fillGaps ? fillNearest(out, tier) : out;
}

/**
 * Reguläres GRIB-Feld → Stufengitter (Blockmittel). Seit PD-F2c über den gecachten Index;
 * Ergebnis byte-gleich zur Vollschleife (Verifier: Zufallsfelder mit NaN, vier Geometrien).
 */
export function sampleRegularToTier(field, tier, { fillGaps = true } = {}) {
  if (!SAMPLE_INDEX_ENABLED) return sampleRegularToTierFull(field, tier, { fillGaps });
  return sampleWithIndex(field.values, sampleIndexFor(field, tier), tier, fillGaps);
}

/**
 * Löcher aus dem nächsten belegten Nachbarn füllen (wachsende Ringe, max. 3 Zellen).
 * Bewusst gedeckelt: ein Loch, das 4 Zellen von jedem Wert entfernt liegt, ist kein
 * Abtastartefakt mehr, sondern ein Rand der Quelldomäne — und der gehört `MISSING`.
 */
export function fillNearest(grid, tier, maxRings = 3) {
  const out = Float32Array.from(grid);
  const holes = [];
  for (let k = 0; k < out.length; k++) if (!Number.isFinite(out[k])) holes.push(k);
  if (holes.length === 0 || holes.length === out.length) return out;
  for (const k of holes) {
    const y0 = Math.floor(k / tier.nx), x0 = k % tier.nx;
    let best = NaN, bestD = Infinity;
    for (let r = 1; r <= maxRings && !Number.isFinite(best); r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue;
        const y = y0 + dy, x = x0 + dx;
        if (y < 0 || y >= tier.ny || x < 0 || x >= tier.nx) continue;
        const v = grid[y * tier.nx + x];
        if (!Number.isFinite(v)) continue;
        const d = dy * dy + dx * dx;
        if (d < bestD) { bestD = d; best = v; }
      }
    }
    out[k] = best;
  }
  return out;
}

/**
 * Nächster-Nachbar-Index von einem UNSTRUKTURIERTEN (ikosaedrischen) Gitter auf das
 * Stufengitter. Gebaut über einen Vorfilter auf die Domäne: ICON global hat 2 949 120
 * Zellen, ein voller Scan je Zielzelle wäre 2009 × 2,9 M Vergleiche.
 *
 * Der Filter ist großzügig (1° Rand): eine Zelle am Domänenrand soll ihren Nachbarn
 * auch dann finden, wenn er knapp außerhalb liegt.
 */
export function buildUnstructuredIndexBrute(cellLat, cellLon, tier) {
  const latMin = tier.lat0 - 1, latMax = tier.lat0 + tier.ny * tier.deg + 1;
  const lonMin = tier.lon0 - 1, lonMax = tier.lon0 + tier.nx * tier.deg + 1;
  const cand = [];
  for (let c = 0; c < cellLat.length; c++) {
    const la = cellLat[c];
    let lo = cellLon[c];
    if (lo > 180) lo -= 360;
    if (la >= latMin && la <= latMax && lo >= lonMin && lo <= lonMax) cand.push(c);
  }
  if (cand.length === 0) return null;
  const idx = new Int32Array(tier.ny * tier.nx).fill(-1);
  for (let iy = 0; iy < tier.ny; iy++) {
    const lat = tier.lat0 + iy * tier.deg;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    for (let ix = 0; ix < tier.nx; ix++) {
      const lon = tier.lon0 + ix * tier.deg;
      let best = -1, bestD = Infinity;
      for (const c of cand) {
        let dlon = cellLon[c] - lon;
        if (dlon > 180) dlon -= 360;
        if (dlon < -180) dlon += 360;
        const dx = dlon * cosLat, dy = cellLat[c] - lat;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = c; }
      }
      idx[iy * tier.nx + ix] = best;
    }
  }
  return idx;
}

/**
 * Dasselbe Ergebnis, aber über ein Eimergitter statt über alle Kandidaten (PD-B4b).
 *
 * ── Warum das nötig wurde ─────────────────────────────────────────────────
 * Die einfache Fassung oben ist `O(Zielzellen × Kandidaten)`. Für ICON global geht das
 * gut, weil die Umgebungsbox nur ~6 000 der 2,95 Mio. Zellen enthält. Für eine Quelle,
 * die den Ausschnitt DICHT füllt, kippt es — selbst gemessen auf Stufe 1 (48 441
 * Zielzellen):
 *
 *   ICON global    ~6 000 Kandidaten →     1 170 ms
 *   ICON-D2-EPS   542 040 Kandidaten →    60 272 ms
 *   ICON-CH1     1 150 000 Kandidaten →  299 522 ms   ( = 5,0 min, JE STUFE )
 *
 * Bei drei unstrukturierten Quellen über drei Stufen wären das Viertelstunden allein für
 * die Nachbarsuche — bei 80 min Gesamtbudget (§34.6) nicht tragbar.
 *
 * ── Warum das Ergebnis IDENTISCH ist, nicht nur ähnlich ───────────────────
 * Die Ringsuche bricht erst ab, wenn bewiesen ist, dass draußen nichts Näheres liegen
 * kann: nach Ring `r` ist jeder ungeprüfte Kandidat in mindestens einer Achse `r · bs`
 * Grad entfernt, in der Metrik also mindestens `r · bs · cosLat` (der Längengrad geht mit
 * `cosLat ≤ 1` ein). Ist `bestD` kleiner, kann kein weiterer Ring gewinnen.
 *
 * Der zweite Teil ist das **Gleichstands-Verhalten**: die einfache Fassung läuft über
 * `cand` aufsteigend und nimmt nur ECHT kleinere Abstände, behält bei Gleichstand also
 * den kleinsten Index. Die Ringsuche läuft in anderer Reihenfolge — deshalb entscheidet
 * sie Gleichstände ausdrücklich über `c < best`. Ohne diese Zeile wären beide Fassungen
 * „gleich gut" und trotzdem verschieden, und der Gleichheitsbeweis fiele zufällig aus.
 */
export function buildUnstructuredIndex(cellLat, cellLon, tier) {
  const latMin = tier.lat0 - 1, latMax = tier.lat0 + tier.ny * tier.deg + 1;
  const lonMin = tier.lon0 - 1, lonMax = tier.lon0 + tier.nx * tier.deg + 1;

  // Kandidaten wie bisher filtern — zusätzlich die normalisierte Länge merken, damit die
  // Eimerzuordnung und die Abstandsrechnung dieselbe Zahl benutzen.
  const cand = [];
  const cLat = [], cLon = [];
  for (let c = 0; c < cellLat.length; c++) {
    const la = cellLat[c];
    let lo = cellLon[c];
    if (lo > 180) lo -= 360;
    if (la >= latMin && la <= latMax && lo >= lonMin && lo <= lonMax) { cand.push(c); cLat.push(la); cLon.push(lo); }
  }
  const n = cand.length;
  if (n === 0) return null;

  // Eimerkante so, dass im Mittel ~2 Kandidaten je Eimer liegen. Aus der GEMESSENEN
  // Dichte, nicht gesetzt — eine feste Kante wäre für ICON global zu fein und für
  // ICON-CH1 zu grob.
  const spanLat = Math.max(1e-6, latMax - latMin), spanLon = Math.max(1e-6, lonMax - lonMin);
  let bs = Math.sqrt((2 * spanLat * spanLon) / n);
  if (!Number.isFinite(bs) || bs <= 0) bs = tier.deg;
  bs = Math.min(Math.max(bs, 1e-4), Math.max(spanLat, spanLon));
  const nby = Math.max(1, Math.ceil(spanLat / bs));
  const nbx = Math.max(1, Math.ceil(spanLon / bs));

  // Verkettete Liste je Eimer — zwei Int32Arrays statt eines Arrays von Arrays: bei
  // über einer Million Kandidaten ist das der Unterschied zwischen „läuft" und
  // „belegt hunderte MB in Objekt-Kopfdaten".
  const head = new Int32Array(nby * nbx).fill(-1);
  const next = new Int32Array(n).fill(-1);
  // Der BELEGTE Bereich — gebraucht für den Sprung unten.
  let minBy = nby, maxBy = -1, minBx = nbx, maxBx = -1;
  for (let i = 0; i < n; i++) {
    const by = Math.min(nby - 1, Math.max(0, Math.floor((cLat[i] - latMin) / bs)));
    const bx = Math.min(nbx - 1, Math.max(0, Math.floor((cLon[i] - lonMin) / bs)));
    if (by < minBy) minBy = by; if (by > maxBy) maxBy = by;
    if (bx < minBx) minBx = bx; if (bx > maxBx) maxBx = bx;
    const b = by * nbx + bx;
    next[i] = head[b];
    head[b] = i;
  }

  // ── Wie weit darf ein Nachbar überhaupt entfernt sein? ────────────────────
  //
  // ⚠ Die alte Fassung kannte KEINE Grenze: sie nahm den global nächsten Kandidaten, auch
  // wenn er 700 km entfernt lag. Für eine Quelle, die den Ausschnitt ganz füllt, fällt das
  // nicht auf; für eine, die nur einen Teil deckt (C-LAEF bis 51,5 °N, ICON-CH bis 50,5),
  // hiesse es: EIN Randwert wird über halb Deutschland verteilt — und sähe aus wie eine
  // Vorhersage.
  //
  // Der reguläre Weg macht das seit jeher richtig: `fillNearest` extrapoliert höchstens
  // drei Zellen und lässt den Rest MISSING („ein Loch, das 4 Zellen von jedem Wert entfernt
  // liegt … gehört MISSING"). Der unstrukturierte Weg zieht hier nach — dieselbe Regel,
  // erweitert um die eigene Maschenweite der Quelle, damit ein grobes Gitter nicht an
  // seiner eigenen Auflösung scheitert.
  const spacing = Math.sqrt((spanLat * spanLon) / n);
  const maxDist = Math.max(3 * tier.deg, 2 * spacing);
  const maxD2 = maxDist * maxDist;
  const rMax = Math.ceil(maxDist / bs) + 1;

  const idx = new Int32Array(tier.ny * tier.nx).fill(-1);
  const maxRing = Math.min(Math.max(nby, nbx), rMax);
  for (let iy = 0; iy < tier.ny; iy++) {
    const lat = tier.lat0 + iy * tier.deg;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const by0 = Math.min(nby - 1, Math.max(0, Math.floor((lat - latMin) / bs)));
    for (let ix = 0; ix < tier.nx; ix++) {
      const lon = tier.lon0 + ix * tier.deg;
      const bx0 = Math.min(nbx - 1, Math.max(0, Math.floor((lon - lonMin) / bs)));
      let best = -1, bestD = Infinity;

      // ⚠ Ohne diesen Sprung wird die Ringsuche zur Falle — und zwar genau bei den
      // Quellen, für die die Etappe gebaut ist. Eine Quelle, die nur einen TEIL des
      // Ausschnitts deckt (C-LAEF endet bei 51,5 °N, ICON-CH bei 50,5), lässt jede
      // Zielzelle darüber Ring für Ring durch leeres Gebiet wachsen: bei 5,5° Abstand
      // sind das ~315 Ringe à 8·r Eimer, mal 20 000 Zellen. Selbst gemessen: der erste
      // Entwurf lief damit über fünf Minuten und wurde abgebrochen — LANGSAMER als das
      // Verfahren, das er ersetzen sollte.
      //
      // Alle Kandidaten liegen im belegten Bereich, also ist kein Kandidat näher als der
      // Weg dorthin. Die Suche darf bei genau diesem Ring beginnen; die Abbruchschranke
      // unten bleibt gültig, weil sie nur „alles Ungeprüfte ist mindestens r·bs entfernt"
      // behauptet — und die übersprungenen Ringe sind beweisbar leer.
      const r0 = Math.max(0, by0 - maxBy, minBy - by0, bx0 - maxBx, minBx - bx0);
      // Liegt schon der belegte Bereich weiter weg als die Kappe, gibt es nichts zu holen.
      // Das ist zugleich der schnelle Weg für die Zellen, die eine Teil-Quelle nicht deckt.
      if (r0 > rMax) { idx[iy * tier.nx + ix] = -1; continue; }

      for (let r = r0; r <= maxRing; r++) {
        const y0 = by0 - r, y1 = by0 + r, x0 = bx0 - r, x1 = bx0 + r;
        // Auf den belegten Bereich beschneiden: leere Zeilen gar nicht erst betreten.
        const yA = Math.max(y0, minBy), yB = Math.min(y1, maxBy);
        const xA = Math.max(x0, minBx), xB = Math.min(x1, maxBx);
        for (let by = yA; by <= yB; by++) {
          // Nur der RAND des Quadrats: die Innenfläche wurde in früheren Ringen geprüft.
          const onLatEdge = (by === y0 || by === y1);
          for (let bx = xA; bx <= xB; bx++) {
            if (!onLatEdge && bx !== x0 && bx !== x1) continue;
            for (let i = head[by * nbx + bx]; i >= 0; i = next[i]) {
              let dlon = cLon[i] - lon;
              if (dlon > 180) dlon -= 360;
              if (dlon < -180) dlon += 360;
              const dx = dlon * cosLat, dy = cLat[i] - lat;
              const d = dx * dx + dy * dy;
              const c = cand[i];
              // Gleichstand: kleinster Quell-Index gewinnt — s. den Kopfkommentar.
              if (d < bestD || (d === bestD && c < best)) { bestD = d; best = c; }
            }
          }
        }
        if (best >= 0) {
          const bound = r * bs * cosLat;
          if (bestD <= bound * bound) break;
        }
      }
      // Zu weit ist kein Nachbar. MISSING ist hier die ehrlichere Antwort als ein Wert,
      // der von jenseits des Quellenrandes stammt.
      idx[iy * tier.nx + ix] = (best >= 0 && bestD <= maxD2) ? best : -1;
    }
  }
  return idx;
}

/** Werte eines unstrukturierten Felds über den Nachbarindex auf das Stufengitter. */
export function sampleUnstructuredToTier(values, idx, tier) {
  const out = new Float32Array(tier.ny * tier.nx).fill(NaN);
  for (let k = 0; k < out.length; k++) {
    const c = idx[k];
    if (c < 0) continue;
    const v = values[c];
    if (Number.isFinite(v)) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Einheiten
// ---------------------------------------------------------------------------

/** In-place-Umrechnung. `factor`/`offset` je Adapter deklariert, nie geraten. */
export function convert(grid, spec) {
  const { factor = 1, offset = 0 } = spec ?? {};
  if (factor === 1 && offset === 0) return grid;
  for (let k = 0; k < grid.length; k++) if (Number.isFinite(grid[k])) grid[k] = grid[k] * factor + offset;
  return grid;
}

export const KELVIN_TO_C = { factor: 1, offset: -273.15 };
export const PA_TO_HPA = { factor: 0.01, offset: 0 };
export const FRACTION_TO_PCT = { factor: 100, offset: 0 };
export const M_TO_MM = { factor: 1000, offset: 0 };
