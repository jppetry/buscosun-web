/**
 * Reine (DOM-/GL-freie) Mathematik der Wind-Advektion — der einzige Ort, an dem
 * aus einer physikalischen Windgeschwindigkeit (m/s aus dem GRIB) ein
 * Bildschirm-/Equirect-Schritt wird.
 *
 * Ausgelagert aus `WindLayer`, damit derselbe Code
 *   • im Layer läuft (Uniform-Berechnung pro Frame) UND
 *   • headless verifiziert werden kann (`npm run verify:wind-advection`).
 *
 * ── Der Vertrag ────────────────────────────────────────────────────────────
 *
 * Die dargestellte Bildschirmgeschwindigkeit ist STRENG LINEAR in der
 * GRIB-Windgeschwindigkeit:
 *
 *     px/s = A(z) · |V|          |V| in m/s, px in CSS-Pixeln
 *
 * `A(z)` ist der EINZIGE Umrechnungsfaktor. Es gibt keine Kennlinie, kein
 * Mindesttempo, keinen Gerätefaktor. Verhältnisse bleiben erhalten: doppelter
 * Wind = doppelt so schnelle Partikel, auf jeder Zoomstufe.
 *
 * Der Zoom verändert ausschließlich `A(z)`, nie den Windwert. Mit
 * `screenTempoZoomExp = 0` (Standard) ist `A` sogar über alle Zoomstufen
 * konstant — ein 10-m/s-Wind läuft in der Übersicht mit denselben px/s wie in
 * der Detailansicht. Der ZEITRAFFER-Faktor sinkt dabei beim Reinzoomen; die
 * Bahn, der ein Partikel folgt, bleibt exakt die des echten Luftpakets.
 *
 * ── Warum ein Faktor 2 auf der Nord-Süd-Komponente ────────────────────────
 *
 * Die Partikelposition wird equirektangular geführt: X = (lng+180)/360,
 * Y = (90−lat)/180. X spannt 360°, Y nur 180°. Für Bodengeschwindigkeit
 * (u = Ost, v = Nord) gilt deshalb
 *
 *     dX/dt = u / (2·π·R·cos φ)        dY/dt = −v / (π·R)
 *
 * — der Y-Koeffizient ist DOPPELT so groß. Der geerbte webgl-wind-Shader
 * benutzte für beide Achsen denselben Skalar und stellte Nord-Süd-Bewegung
 * dadurch nur halb so schnell dar (Richtungsfehler bis 19,47°,
 * s. `audit/wind-partikel-grib-treue.md` §2). `advectionStepScale` liefert die
 * X-Skala; der Shader multipliziert die Y-Komponente mit `NS_ASPECT` (= 2).
 * Mercator ist konform und kann diese Anisotropie NICHT aufheben —
 * d(merc_y)/dY = 1/(2·cos φ) reproduziert sie exakt.
 */

/** Erdumfang am Äquator (WGS84), m — identisch zur Web-Mercator-Definition. */
export const EARTH_CIRCUMFERENCE_M = 40075016.686;
/** Äquatorradius (WGS84), m. `2·π·R = EARTH_CIRCUMFERENCE_M`. */
export const EARTH_RADIUS_M = EARTH_CIRCUMFERENCE_M / (2 * Math.PI);
/** Kachelgröße von MapLibre in CSS-px → Weltbreite = TILE_SIZE · 2^zoom. */
export const TILE_SIZE_CSS = 512;
/** Faktor auf der Nord-Süd-Komponente (equirect Y spannt 180°, X spannt 360°). */
export const NS_ASPECT = 2;
/**
 * Referenzbreite der Tempo-Kalibrierung (Mitte DACH). Auf einer Mercator-Karte
 * legt derselbe Bodenwind bei höherer Breite mehr Bildschirm-Pixel zurück — das
 * ist korrekt und gewollt (die Karte ist dort ebenso gedehnt). `speedPxPerMs`
 * gilt daher exakt bei dieser Breite; über DACH (45–55°N) schwankt der
 * effektive Wert um ±11 % mit cos φ.
 */
export const LAT_REF_DEG = 51;

export interface ScreenTempoOptions {
  /** CSS-px/s je 1 m/s Wind, bei `LAT_REF_DEG`. Der Tempo-Regler. */
  speedPxPerMs: number;
  /** Dimensionsloser Gesamt-Multiplikator (1 = unverändert). */
  speedFactor: number;
  /** Zoom, bei dem `speedPxPerMs` exakt gilt (nur relevant, wenn exp ≠ 0). */
  speedRefZoom: number;
  /**
   * Zoom-Gesetz-Exponent:
   *   0    → Bildschirmtempo KONSTANT über alle Zoomstufen (Standard, windy-artig)
   *   0.75 → Alt-Verhalten von buscosun (`speedZoomDamping = 0,25`)
   *   1    → rein geografisch: konstanter Zeitraffer, Tempo ∝ 2^zoom
   */
  screenTempoZoomExp: number;
}

/** `A(z)` — CSS-px/s je 1 m/s Wind bei `LAT_REF_DEG` auf dieser Zoomstufe. */
export function screenTempoGain(zoom: number, o: ScreenTempoOptions): number {
  return o.speedPxPerMs * o.speedFactor
    * Math.pow(2, o.screenTempoZoomExp * (zoom - o.speedRefZoom));
}

/**
 * Equirect-X-Schritt je 1 m/s Wind und Zeitschritt — die Zahl, die als
 * `u_step_scale` in den Shader geht.
 *
 * Herleitung (der Shader rechnet `offset = (u/cos φ, −NS_ASPECT·v) · scale`):
 *
 *   Ziel:      Bildschirmtempo = A · |V|  CSS-px/s
 *   Weltbreite W = TILE_SIZE · 2^z  CSS-px
 *   Bodenauflösung bei φ_ref: g = EARTH_CIRCUMFERENCE · cos φ_ref / W  [m/px]
 *   ⇒ Zeitraffer T = A · g            (dimensionslos, „× Echtzeit")
 *   ⇒ dX/dt = T · u / (2·π·R·cos φ) = (A · cos φ_ref / W) · u / cos φ
 *
 *   also  scale = A · cos φ_ref / W · dtSekunden
 *
 * `dtScale60` ist die Schrittlänge in 60-fps-Frames (1 ≙ 1/60 s) — im
 * Update-Pass die dt-Normierung des Layers, im Segment-Draw die Länge des
 * gezeichneten Kopfsegments.
 */
export function advectionStepScale(
  zoom: number,
  dtScale60: number,
  o: ScreenTempoOptions,
): number {
  const worldCss = TILE_SIZE_CSS * Math.pow(2, zoom);
  const gain = screenTempoGain(zoom, o);
  return (gain * Math.cos((LAT_REF_DEG * Math.PI) / 180) / worldCss) * (dtScale60 / 60);
}

/**
 * Bildschirmtempo (CSS-px/s), das ein Wind von `speedMs` bei `latDeg` tatsächlich
 * erhält — die Umkehrung des Vertrags, für Verifier und Dev-Probe.
 *
 * Mercator ist konform: derselbe Bodenwind erzeugt bei höherer Breite mehr
 * px/s (Faktor cos φ_ref / cos φ). Genau diese Skalierung hat auch die Karte.
 */
export function screenSpeedPxPerSec(
  speedMs: number,
  zoom: number,
  latDeg: number,
  o: ScreenTempoOptions,
): number {
  const cosRef = Math.cos((LAT_REF_DEG * Math.PI) / 180);
  const cosLat = Math.cos((latDeg * Math.PI) / 180);
  return screenTempoGain(zoom, o) * speedMs * (cosRef / cosLat);
}

/**
 * Auflösung der Positionskodierung in EQUIRECT-Einheiten.
 *
 * Die Partikelposition steckt in einer RGBA8-Textur: 2 Byte je Achse ⇒ 65 025
 * Stufen. Der Bezugsraum ist NICHT mehr die ganze Welt, sondern das aktuelle
 * Spawn-Rechteck (`u_bounds` = Sichtfeld + 10 % ∩ Datenregion) — dadurch wächst
 * die Auflösung mit dem Zoom mit (s. `audit/wind-partikel-grib-treue.md` §4).
 *
 * Das ist die Voraussetzung dafür, dass die Anzeige linear sein DARF: ein
 * RGBA8-Render-Target rundet zum nächsten Wert, ein Schritt unter einem HALBEN
 * Quantum lässt das Partikel deshalb vollständig stehen (echte Totzone, kein
 * Dithering). Welt-relativ fror bei z9 jeder Wind unter ~2 m/s ein — genau
 * deshalb existierten früher die γ-Kennlinie und das Mindesttempo.
 */
export function positionQuantum(boundsSpan: number): number {
  return boundsSpan / 65025;
}

/** Kleinster Schritt, der die Rundung des RGBA8-Ziels überhaupt überwindet. */
export function deadBandStep(boundsSpan: number): number {
  return 0.5 * positionQuantum(boundsSpan);
}
