/**
 * SAT2b — SWIR-Falschfarbe und dNBR („verbrannt wirkende Fläche") aus den Sentinel-2-Band-COGs
 * (`audit/brandradar-satellitenbilder.md` §10). Pur und DOM-frei; die Kachel-Kompositoren nehmen
 * dekodierte `Uint16Array`-Kacheln (aus `cogTiff.decodeTileU16`) und liefern RGBA-Bytes.
 *
 * Reflektanz-Skala (§10.1 (2), am STAC gemessen): BOA = DN · scale + offset, mit `scale`/`offset`
 * aus `raster:bands` JE SZENE — seit Processing Baseline 04.00 (2022) ist offset −0,1, ältere
 * Archiv-Szenen tragen 0; eine Konstante wäre für die Historie falsch. Der Offset drückt dunkles
 * Wald-SWIR unter 0 und machte den NBR-Quotienten > 1 (gemessen 1,556) — deshalb wird die
 * Reflektanz auf ≥ 0 GEKLEMMT. Am gemessenen Narbenpixel ergibt das dNBR 0,600 (Goldwert im
 * Verify). DN 0 ist nodata (Szenenrand) und wird nie gerechnet, sondern transparent.
 *
 * Die dNBR-Klassenkanten sind die USGS-KONVENTION (0,10 / 0,27 / 0,44 / 0,66) und am Ereignis
 * NICHT geeicht — jede Beschriftung führt deshalb das Wort „unkalibriert".
 */

export interface BandScale { scale: number; offset: number }

/** Reflektanz mit Klemmung auf ≥ 0; `null` = nodata (DN 0, Szenenrand). */
export function boaOf(dn: number, s: BandScale): number | null {
  if (dn === 0) return null;
  return Math.max(0, dn * s.scale + s.offset);
}

/** Normalized Burn Ratio (B8A − B12)/(B8A + B12); `null` bei nodata oder leerer Summe. */
export function nbrOf(nirDn: number, swirDn: number, s: BandScale): number | null {
  const n = boaOf(nirDn, s);
  const sw = boaOf(swirDn, s);
  if (n == null || sw == null) return null;
  const sum = n + sw;
  if (sum <= 0) return null;
  return (n - sw) / sum;
}

// --- dNBR-Rampe (EINE Quelle für Canvas UND Legende) ------------------------------------------

export interface DnbrClass {
  /** Untere Kante (einschließlich). */
  min: number;
  label: string;
  /** RGBA für Canvas-Pixel und Legenden-Chip (Inline-Style aus derselben Quelle). */
  rgba: [number, number, number, number];
}

/** USGS-Konventionsschwellen — unkalibriert, die Beschriftung sagt es. */
export const DNBR_CLASSES: readonly DnbrClass[] = [
  { min: 0.1, label: '0,10–0,27', rgba: [255, 195, 80, 110] },
  { min: 0.27, label: '0,27–0,44', rgba: [255, 122, 40, 155] },
  { min: 0.44, label: '0,44–0,66', rgba: [222, 45, 32, 185] },
  { min: 0.66, label: '> 0,66', rgba: [140, 20, 92, 205] },
];

/** Klassenfarbe zum dNBR-Wert; unter der ersten Kante (oder `null`) transparent. */
export function dnbrRgba(d: number | null): [number, number, number, number] {
  if (d == null || d < DNBR_CLASSES[0].min) return [0, 0, 0, 0];
  let cls = DNBR_CLASSES[0];
  for (const c of DNBR_CLASSES) if (d >= c.min) cls = c;
  return cls.rgba;
}

/**
 * V-SAT-18 (§12.10): dieselben Klassen als typisierte Spalten — **abgeleitet** aus
 * `DNBR_CLASSES`, nie danebengeschrieben. Die Kachelschleife sucht ihre Klasse damit, ohne je
 * ein Objekt anzufassen oder ein Tupel zu destrukturieren (letzteres lief über das
 * Iterator-Protokoll, je Pixel — gemessen 1,0–1,5× der Laufzeit).
 */
const CLS_MIN = Float64Array.from(DNBR_CLASSES, (c) => c.min);
const CLS_R = Uint8Array.from(DNBR_CLASSES, (c) => c.rgba[0]);
const CLS_G = Uint8Array.from(DNBR_CLASSES, (c) => c.rgba[1]);
const CLS_B = Uint8Array.from(DNBR_CLASSES, (c) => c.rgba[2]);
const CLS_A = Uint8Array.from(DNBR_CLASSES, (c) => c.rgba[3]);

// --- SWIR-Falschfarbe (B12 / B8A / B04) --------------------------------------------------------

/**
 * Linearer Stretch mit Faktor 2,5 (die übliche Darstellung des SWIR-Komposits, z. B. im
 * Copernicus Browser): Reflektanz 0,4 wird Vollausschlag. Verbranntes leuchtet rot/orange
 * (SWIR hoch, NIR niedrig), vitale Vegetation grün.
 */
export const SWIR_GAIN = 2.5;

export function swirChannel(dn: number, s: BandScale): number | null {
  const r = boaOf(dn, s);
  if (r == null) return null;
  return Math.round(Math.min(1, r * SWIR_GAIN) * 255);
}

// --- SCL-Szenenklassifikation (SAT2c, §11) -----------------------------------------------------

/**
 * Sen2Cor-Klassen des SCL-Bands (kein `classification:classes` im STAC — Konvention):
 * 0 nodata · 1 saturiert · 2 dunkel · 3 Wolkenschatten · 4 Vegetation · 5 unbewachsen ·
 * 6 Wasser · 7 unklassifiziert · 8 Wolke mittel · 9 Wolke hoch · 10 dünner Zirrus · 11 Schnee.
 *
 * Die Regeln sind am Ereignis GEMESSEN (§11.1), nicht aus dem Handbuch abgeschrieben:
 * - Vorher-Szene: vor dem Brand existiert keine Narbe — jede Wolken-/Schatten-/Störklasse macht
 *   den Vergleich am Pixel bedeutungslos ⇒ harte Maske ist beweisbar sicher.
 * - Nachher-Szene: NIE binär löschen — am Ereignis lag die GESAMTE sichtbare Narbe unter
 *   Klasse 10/8 (Sen2Cor klassifiziert großflächig Zirrus, der Goldwert 0,600 wurde trotzdem
 *   gemessen). Nur die Nie-Narbe-Klassen (saturiert/Wasser/Schnee) fallen hart; Wolke/Schatten
 *   (3/8/9) setzen auf halbe Deckkraft („dort kann das Signal Wolke statt Brand sein");
 *   dünner Zirrus (10) bleibt unangetastet, ebenso „dunkel" (2 — Verwechslung mit frischer Narbe).
 * - Landbedeckungs-Dämpfung per SCL ist WIDERLEGT: die frische Brandfläche selbst wird am klaren
 *   Brandtag Klasse 5 „unbewachsen" — wie ein Stoppelfeld (§11.1 (4)).
 */
export function sclPreMasked(cls: number): boolean {
  return cls === 1 || cls === 3 || cls === 6 || cls === 8 || cls === 9 || cls === 10 || cls === 11;
}

/** Nachher-Szene, harte Maske: nur Klassen, die nie eine Narbe sein können. */
export function sclPostMasked(cls: number): boolean {
  return cls === 1 || cls === 6 || cls === 11;
}

/** Nachher-Szene, „unsicher" (halbe Deckkraft): Wolke/Schatten — Narben-Verwechslung möglich. */
export function sclPostUnsure(cls: number): boolean {
  return cls === 3 || cls === 8 || cls === 9;
}

// --- WorldCover-Landbedeckung (SAT2d, §12) -----------------------------------------------------

/**
 * ESA-WorldCover-2021-Klassen: 10 Baum · 20 Strauch · 30 Gras · 40 Acker · 50 bebaut ·
 * 60 vegetationsarm · 70 Schnee/Eis · 80 Wasser · 90 Feuchtgebiet · 95 Mangrove · 100 Moos.
 *
 * Gedämpft (halbe Deckkraft, NIE gelöscht) wird nur, wo ein Vegetationsbrand-Signal
 * unwahrscheinlicher ist als Ernte/Nutzung: Acker/bebaut/vegetationsarm/Schnee/Wasser —
 * an der Börde gemessen tragen 13,4 % der Acker-Pixel ein falsches Signal ≥ 0,27 (§12.1 (4)).
 * Baum, Strauch, GRAS und Feuchtgebiet bleiben voll: die Hürtgenwald-Narbe liegt teils auf
 * Klasse 30 (Heide), und Getreidefeldbrände existieren — deshalb halbieren statt maskieren.
 * `0` (unbekannt/Ausfall) dämpft nie — Fehlertoleranz geht vor.
 */
export function wcDamped(cls: number): boolean {
  return cls === 40 || cls === 50 || cls === 60 || cls === 70 || cls === 80;
}

/**
 * SAT3d: Bit 7 in der Klassenkachel — „halbdeckend" (Wolke/Schatten nachher ODER Landbedeckung
 * gedämpft). Die Narbe (`burnScar.ts`) läuft durch solche Pixel NICHT: am Neutrebbin-Fall (02.09.,
 * ~99 % Wolken) verband ein Fill über die Wolkenpixel 14 563 ha zu „einer Narbe" (§13.4 (2)).
 */
export const CLS_UNSURE_FLAG = 0x80;

// --- Kachel-Kompositoren -----------------------------------------------------------------------

/**
 * V-SAT-18 (§12.10): die beiden Schleifen rechnen die Regeln oben **inline** statt sie je Pixel
 * über `boaOf`/`nbrOf`/`swirChannel` aufzurufen. Grund ist nicht der Aufruf, sondern deren
 * Rückgabetyp `number | null`: V8 kann daraus keinen untagged Double machen, jede Zahl wird
 * geboxt, und 262 144 Pixel × vier solcher Rückgaben kosteten gemessen das 4,5–8,1-Fache der
 * eigentlichen Rechnung. Innerhalb der Schleife heißt „kein Wert" deshalb `NaN`, und die
 * Abfrage lautet `!(d >= …)` — `d < …` täte es NICHT, weil jeder NaN-Vergleich falsch ist.
 *
 * Die FACHREGELN stehen unverändert oben und bleiben die lesbare Quelle (Legende,
 * Selbstverifikation, künftige Aufrufer): Klassenkanten `DNBR_CLASSES` (hier als `CLS_*`
 * abgeleitet), Maskenregeln `sclPreMasked`/`sclPostMasked`/`sclPostUnsure`/`wcDamped` werden
 * weiterhin aufgerufen. Der Beleg der Umstellung ist die Byte-Gleichheit gegen die vorherige
 * Schleife über alle vier Aufrufformen — `audit/brandradar-satellitenbilder/dnbr-loop-bisect.mjs`
 * führt sie wortgleich als Orakel mit (BW-1-Muster).
 */

/** SWIR-Falschfarbkachel: R = B12, G = B8A, B = B04; nodata in irgendeinem Band ⇒ transparent. */
export function swirTileRgba(
  s12: Uint16Array, n8a: Uint16Array, r04: Uint16Array, s: BandScale,
): Uint8ClampedArray {
  const n = s12.length;
  const out = new Uint8ClampedArray(n * 4);
  const sc = s.scale, of = s.offset;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = s12[i], b = n8a[i], c = r04[i];
    if (a === 0 || b === 0 || c === 0) continue; // nodata in irgendeinem Band ⇒ alpha bleibt 0
    out[j] = Math.round(Math.min(1, Math.max(0, a * sc + of) * SWIR_GAIN) * 255);
    out[j + 1] = Math.round(Math.min(1, Math.max(0, b * sc + of) * SWIR_GAIN) * 255);
    out[j + 2] = Math.round(Math.min(1, Math.max(0, c * sc + of) * SWIR_GAIN) * 255);
    out[j + 3] = 255;
  }
  return out;
}

/**
 * dNBR-Overlaykachel: NBR(vorher) − NBR(nachher) je Pixel, Klassenfarbe, sonst transparent.
 * Mit SCL-Kacheln (SAT2c, optional — ohne sie byte-gleich zu SAT2b): Vorher-Störklassen und
 * Nachher-Nie-Narbe-Klassen maskieren hart, Nachher-Wolke/Schatten halbiert die Deckkraft.
 *
 * SAT3d: `outCls` (optional, Länge n) nimmt nebenher die **Klasse je Pixel** auf — 0 = kein
 * Signal/maskiert, 1–4 = Index in `DNBR_CLASSES` + 1 — genau die Pixel, die eine Farbe bekommen;
 * halbdeckende Pixel (SCL-unsicher, Landbedeckung gedämpft) tragen zusätzlich `CLS_UNSURE_FLAG`.
 * Dieselbe Schleife, kein zweiter Durchlauf; die RGBA-Ausgabe bleibt byte-gleich (Orakel 12.10).
 */
export function dnbrTileRgba(
  preN: Uint16Array, preS: Uint16Array, postN: Uint16Array, postS: Uint16Array,
  sPre: BandScale, sPost: BandScale,
  preScl?: Uint8Array | null, postScl?: Uint8Array | null, wcCls?: Uint8Array | null,
  outCls?: Uint8Array | null,
): Uint8ClampedArray {
  const n = preN.length;
  const out = new Uint8ClampedArray(n * 4);
  const scA = sPre.scale, ofA = sPre.offset, scB = sPost.scale, ofB = sPost.offset;
  const nc = CLS_MIN.length, min0 = CLS_MIN[0];
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (preScl && sclPreMasked(preScl[i])) continue;
    if (postScl && sclPostMasked(postScl[i])) continue;
    // NBR beider Szenen inline (= `nbrOf`, aber ohne die `number | null`-Union): DN 0 ist
    // nodata, die Reflektanz wird auf ≥ 0 geklemmt, und eine Summe 0 hat kein Verhältnis.
    let a = NaN;
    const an = preN[i], as = preS[i];
    if (an !== 0 && as !== 0) {
      const p = Math.max(0, an * scA + ofA), q = Math.max(0, as * scA + ofA);
      const sum = p + q;
      if (sum > 0) a = (p - q) / sum;
    }
    let b = NaN;
    const bn = postN[i], bs = postS[i];
    if (bn !== 0 && bs !== 0) {
      const p = Math.max(0, bn * scB + ofB), q = Math.max(0, bs * scB + ofB);
      const sum = p + q;
      if (sum > 0) b = (p - q) / sum;
    }
    const d = a - b;
    // Fängt nodata (NaN) UND „unter der ersten Kante" in einem Vergleich — s. Kopfkommentar.
    if (!(d >= min0)) continue;
    let k = nc - 1;
    while (CLS_MIN[k] > d) k--; // `d >= min0` ist bewiesen ⇒ k bleibt ≥ 0
    const al = CLS_A[k];
    if (al === 0) continue; // trüge eine Klasse je alpha 0, bliebe das Pixel unberührt wie bisher
    out[j] = CLS_R[k]; out[j + 1] = CLS_G[k]; out[j + 2] = CLS_B[k];
    // SCL-Unsicherheit und Landbedeckungs-Dämpfung halbieren EINMAL, nie zweimal (§12.2 E1).
    const unsure = (postScl != null && sclPostUnsure(postScl[i])) || (wcCls != null && wcDamped(wcCls[i]));
    out[j + 3] = unsure ? al >> 1 : al;
    if (outCls) outCls[i] = unsure ? (k + 1) | CLS_UNSURE_FLAG : k + 1; // SAT3d: Klasse + Halbdeckungs-Flag
  }
  return out;
}

// --- Selbstverifikation ------------------------------------------------------------------------

export interface BurnCheck { name: string; ok: boolean; detail?: string }

export function verifyBurnIndex(): { checks: BurnCheck[]; passed: number; total: number } {
  const checks: BurnCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const pb4: BandScale = { scale: 1e-4, offset: -0.1 };
  const old: BandScale = { scale: 1e-4, offset: 0 };

  add('boaOf: DN 0 ist nodata (null), nie 0-Reflektanz', boaOf(0, pb4) === null);
  add('boaOf: Offset drückt unter 0 ⇒ Klemmung auf 0 (542 → 0, nicht −0,046)', boaOf(542, pb4) === 0);
  add('boaOf: alte Baseline ohne Offset bleibt ungeklemmt (542 → 0,0542)',
    Math.abs((boaOf(542, old) ?? 0) - 0.0542) < 1e-9);

  // Goldwert §10.1 (2): gemessenes Narbenpixel Hürtgenwald (vorher 25.07., nachher 24.08.).
  const pre = nbrOf(3105, 542, pb4);
  const post = nbrOf(2688, 1723, pb4);
  add('nbrOf: Narbenpixel vorher = 1,0 (SWIR geklemmt)', pre != null && Math.abs(pre - 1) < 1e-9);
  add('nbrOf: Narbenpixel nachher ≈ 0,400', post != null && Math.abs(post - 0.4003) < 5e-4);
  add('Goldwert: dNBR des gemessenen Narbenpixels = 0,600',
    pre != null && post != null && Math.abs(pre - post - 0.5997) < 5e-4);
  add('nbrOf: beide Bänder geklemmt (Summe 0) ⇒ null, keine Division durch 0', nbrOf(500, 500, pb4) === null);
  add('nbrOf: nodata in EINEM Band ⇒ null', nbrOf(0, 1723, pb4) === null && nbrOf(2688, 0, pb4) === null);

  add('dnbrRgba: unter 0,10 und bei null transparent',
    dnbrRgba(0.09)[3] === 0 && dnbrRgba(null)[3] === 0 && dnbrRgba(-0.3)[3] === 0);
  add('dnbrRgba: Kanten liegen in ihrer Klasse (0,10 / 0,27 / 0,44 / 0,66)',
    dnbrRgba(0.1) === DNBR_CLASSES[0].rgba && dnbrRgba(0.27) === DNBR_CLASSES[1].rgba
    && dnbrRgba(0.44) === DNBR_CLASSES[2].rgba && dnbrRgba(0.66) === DNBR_CLASSES[3].rgba
    && dnbrRgba(2) === DNBR_CLASSES[3].rgba);
  add('DNBR_CLASSES: 4 Klassen, aufsteigend, zunehmend deckend', DNBR_CLASSES.length === 4
    && DNBR_CLASSES.every((c, i) => i === 0 || (c.min > DNBR_CLASSES[i - 1].min && c.rgba[3] > DNBR_CLASSES[i - 1].rgba[3])));

  // DN 2600 → BOA 0,16 → 0,4·255 = 102 (kein .5-Grenzfall — der wäre fließkomma-instabil).
  add('swirChannel: Stretch 2,5 (Reflektanz 0,4 = Vollausschlag), nodata null',
    swirChannel(5000, pb4) === 255 && swirChannel(2600, pb4) === 102 && swirChannel(0, pb4) === null);

  {
    // 2×2-Kachel: Pixel 0 Narbe (Gold-DNs), Pixel 1 gesund, Pixel 2 nodata, Pixel 3 unter Kante.
    const preN = Uint16Array.of(3105, 3310, 0, 3000);
    const preS = Uint16Array.of(542, 586, 500, 1200);
    const postN = Uint16Array.of(2688, 3017, 500, 2990);
    const postS = Uint16Array.of(1723, 725, 500, 1210);
    const t = dnbrTileRgba(preN, preS, postN, postS, pb4, pb4);
    add('dnbrTileRgba: Narbenpixel bekommt die 0,44–0,66-Klasse',
      t[3] === DNBR_CLASSES[2].rgba[3] && t[0] === DNBR_CLASSES[2].rgba[0]);
    add('dnbrTileRgba: gesund/nodata/unter Kante bleiben transparent',
      t[7] === 0 && t[11] === 0 && t[15] === 0);
    const sw = swirTileRgba(Uint16Array.of(3500, 0), Uint16Array.of(2000, 2000), Uint16Array.of(1500, 1500), pb4);
    add('swirTileRgba: R=B12/G=B8A/B=B04, nodata transparent',
      sw[0] === Math.round(0.25 * 2.5 * 255) && sw[1] === Math.round(0.1 * 2.5 * 255)
      && sw[2] === Math.round(0.05 * 2.5 * 255) && sw[3] === 255 && sw[7] === 0);

    // SAT2c: SCL-Regeln auf derselben Kachel (Pixel 0 = Narbe, Klasse 0,44–0,66).
    const clear = Uint8Array.of(4, 4, 4, 4);
    add('dnbrTileRgba: ohne SCL byte-gleich zu klaren SCL-Kacheln',
      dnbrTileRgba(preN, preS, postN, postS, pb4, pb4).join(',')
      === dnbrTileRgba(preN, preS, postN, postS, pb4, pb4, clear, clear).join(','));
    add('Vorher-SCL: Wolke/Schatten/Wasser/Schnee maskieren hart (Zirrus eingeschlossen)',
      dnbrTileRgba(preN, preS, postN, postS, pb4, pb4, Uint8Array.of(10, 4, 4, 4), clear)[3] === 0
      && [1, 3, 6, 8, 9, 11].every(sclPreMasked) && !sclPreMasked(4) && !sclPreMasked(5) && !sclPreMasked(2));
    add('Nachher-SCL: nur Nie-Narbe-Klassen hart (saturiert/Wasser/Schnee), NIE die Wolken',
      dnbrTileRgba(preN, preS, postN, postS, pb4, pb4, clear, Uint8Array.of(6, 4, 4, 4))[3] === 0
      && [1, 6, 11].every(sclPostMasked) && ![2, 3, 4, 5, 8, 9, 10].some(sclPostMasked));
    add('Nachher-SCL: Wolke/Schatten (3/8/9) halbiert die Deckkraft, Zirrus (10) bleibt voll',
      dnbrTileRgba(preN, preS, postN, postS, pb4, pb4, clear, Uint8Array.of(8, 4, 4, 4))[3] === DNBR_CLASSES[2].rgba[3] >> 1
      && dnbrTileRgba(preN, preS, postN, postS, pb4, pb4, clear, Uint8Array.of(10, 4, 4, 4))[3] === DNBR_CLASSES[2].rgba[3]
      && [3, 8, 9].every(sclPostUnsure) && !sclPostUnsure(10) && !sclPostUnsure(2));
    // SAT2d: Landbedeckungs-Dämpfung — additiv, nie löschend, genau EINMAL halbiert.
    add('WorldCover: gedämpft sind exakt Acker/bebaut/vegetationsarm/Schnee/Wasser',
      [40, 50, 60, 70, 80].every(wcDamped) && ![0, 10, 20, 30, 90, 95, 100].some(wcDamped));
    add('dnbrTileRgba: ohne wcCls byte-gleich zu voller Wald/Gras-Bedeckung',
      dnbrTileRgba(preN, preS, postN, postS, pb4, pb4).join(',')
      === dnbrTileRgba(preN, preS, postN, postS, pb4, pb4, null, null, Uint8Array.of(10, 30, 10, 30)).join(','));
    add('dnbrTileRgba: Acker halbiert die Deckkraft, Gras bleibt voll — nie transparent',
      dnbrTileRgba(preN, preS, postN, postS, pb4, pb4, null, null, Uint8Array.of(40, 4, 4, 4))[3] === DNBR_CLASSES[2].rgba[3] >> 1
      && dnbrTileRgba(preN, preS, postN, postS, pb4, pb4, null, null, Uint8Array.of(30, 4, 4, 4))[3] === DNBR_CLASSES[2].rgba[3]);
    // SAT3d: die Klassenkachel — Narbenpixel Klasse 3 (0,44–0,66), alles andere 0; RGBA unverändert.
    add('dnbrTileRgba: outCls trägt die Klasse je Pixel (Narbe = 3, gesund/nodata/unter Kante = 0)', (() => {
      const cls = new Uint8Array(4);
      const withCls = dnbrTileRgba(preN, preS, postN, postS, pb4, pb4, null, null, null, cls);
      return cls.join(',') === '3,0,0,0'
        && withCls.join(',') === dnbrTileRgba(preN, preS, postN, postS, pb4, pb4).join(',');
    })());
    add('dnbrTileRgba: outCls trägt bei gedämpften Pixeln Klasse + Flag (Acker ⇒ 3 | 0x80), Wolke nachher ebenso', (() => {
      const a = new Uint8Array(4);
      dnbrTileRgba(preN, preS, postN, postS, pb4, pb4, null, null, Uint8Array.of(40, 4, 4, 4), a);
      const b = new Uint8Array(4);
      dnbrTileRgba(preN, preS, postN, postS, pb4, pb4, clear, Uint8Array.of(8, 4, 4, 4), null, b);
      return a[0] === (3 | CLS_UNSURE_FLAG) && b[0] === (3 | CLS_UNSURE_FLAG) && (a[0] & 0x7f) === 3;
    })());
    add('dnbrTileRgba: SCL-unsicher + Acker halbieren zusammen genau einmal',
      dnbrTileRgba(preN, preS, postN, postS, pb4, pb4, clear, Uint8Array.of(8, 4, 4, 4), Uint8Array.of(40, 4, 4, 4))[3]
      === DNBR_CLASSES[2].rgba[3] >> 1);
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
