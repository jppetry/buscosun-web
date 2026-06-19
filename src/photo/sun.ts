/**
 * Epic FOTO — Sonnenstand & Lichtfenster (FOTO-US1).
 *
 * Reine Astronomie (kein Wetter, keine Datenquelle): aus Datum + Ort werden die
 * exakten Zeiten der blauen und goldenen Stunde (morgens + abends) sowie Sonnen-
 * auf-/-untergang berechnet. Funktioniert für JEDES Datum — auch Monate voraus,
 * weit jenseits jeder Wettervorhersage.
 *
 * Sonnenhöhe nach dem NOAA-Standardverfahren (geozentrisch, ohne Refraktion;
 * Genauigkeit ~1 Minute — für Lichtplanung mehr als ausreichend). Zeiten werden
 * in lokaler Zeit der Laufzeitumgebung gerechnet (wie der Rest der App).
 */

const RAD = Math.PI / 180;

/** Sonnenhöhe (Elevation) in Grad für einen Zeitpunkt + Ort. */
export function sunAltitudeDeg(date: Date, latDeg: number, lonDeg: number): number {
  // Tage seit J2000.0 (in UT).
  const d = date.getTime() / 86_400_000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) % 360;             // mittlere Anomalie
  const q = (280.459 + 0.98564736 * d) % 360;             // mittlere Länge
  const L = (q + 1.915 * Math.sin(g * RAD) + 0.020 * Math.sin(2 * g * RAD)) % 360; // ekliptikale Länge
  const e = 23.439 - 0.00000036 * d;                      // Schiefe der Ekliptik
  const ra = Math.atan2(Math.cos(e * RAD) * Math.sin(L * RAD), Math.cos(L * RAD)); // Rektaszension (rad)
  const dec = Math.asin(Math.sin(e * RAD) * Math.sin(L * RAD));                    // Deklination (rad)
  const gmst = (280.46061837 + 360.98564736629 * d) % 360; // Greenwich-Sternzeit (deg)
  const lst = (gmst + lonDeg) % 360;                       // lokale Sternzeit (deg)
  let h = lst - ra / RAD;                                   // Stundenwinkel (deg)
  h = (((h % 360) + 540) % 360) - 180;
  const lat = latDeg * RAD;
  const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h * RAD));
  return alt / RAD;
}

export interface LightSpan {
  start: Date;
  end: Date;
}

export interface LightWindows {
  dateISO: string;
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date | null;
  /** Blaue Stunde morgens (Sonne −6°…−4°). */
  blueMorning: LightSpan | null;
  /** Goldene Stunde morgens (Sonne −4°…+6°). */
  goldenMorning: LightSpan | null;
  goldenEvening: LightSpan | null;
  blueEvening: LightSpan | null;
  /** Sonne bleibt ganztags unter −6° (Polarnacht-artig) bzw. über +6° → keine Dämmerung. */
  note: 'normal' | 'no-twilight' | 'midnight-sun';
}

// Höhen-Schwellen der Lichtfenster (Grad).
const BLUE_LO = -6;
const BLUE_HI = -4;
const GOLD_LO = -4;
const GOLD_HI = 6;
const HORIZON = -0.833; // Standard-Refraktion für Auf-/Untergang

/**
 * Berechnet alle Lichtfenster eines Kalendertags am Ort. Sampelt die Sonnenhöhe
 * minütlich und liest die Übergänge ab — robust und ohne Spezialfälle.
 */
export function computeLightWindows(dateISO: string, lat: number, lon: number): LightWindows {
  const base = new Date(`${dateISO}T00:00:00`).getTime();
  const N = 1440; // Minuten
  const alt = new Array<number>(N + 1);
  let maxAlt = -Infinity, maxIdx = 0, minAlt = Infinity;
  for (let m = 0; m <= N; m++) {
    const a = sunAltitudeDeg(new Date(base + m * 60_000), lat, lon);
    alt[m] = a;
    if (a > maxAlt) { maxAlt = a; maxIdx = m; }
    if (a < minAlt) minAlt = a;
  }
  const at = (m: number) => new Date(base + m * 60_000);

  // Morgen = vor Sonnenhöchststand, Abend = danach.
  const inBand = (a: number, lo: number, hi: number) => a >= lo && a < hi;
  const spanIn = (from: number, to: number, lo: number, hi: number): LightSpan | null => {
    let s = -1, e = -1;
    const step = from <= to ? 1 : -1;
    for (let m = from; step > 0 ? m <= to : m >= to; m += step) {
      if (inBand(alt[m], lo, hi)) { if (s < 0) s = m; e = m; }
    }
    if (s < 0) return null;
    const lo2 = Math.min(s, e), hi2 = Math.max(s, e);
    return { start: at(lo2), end: at(hi2) };
  };

  const crossing = (from: number, to: number, level: number, rising: boolean): Date | null => {
    for (let m = from; m < to; m++) {
      const a0 = alt[m], a1 = alt[m + 1];
      if (rising && a0 < level && a1 >= level) return at(m + (level - a0) / (a1 - a0));
      if (!rising && a0 >= level && a1 < level) return at(m + (level - a0) / (a1 - a0));
    }
    return null;
  };

  let note: LightWindows['note'] = 'normal';
  if (maxAlt < BLUE_LO) note = 'no-twilight';      // bleibt unter der blauen Stunde (Polarnacht)
  else if (minAlt > GOLD_HI) note = 'midnight-sun'; // bleibt über der goldenen Stunde

  return {
    dateISO,
    sunrise: crossing(0, maxIdx, HORIZON, true),
    sunset: crossing(maxIdx, N, HORIZON, false),
    solarNoon: maxAlt > -90 ? at(maxIdx) : null,
    blueMorning: spanIn(0, maxIdx, BLUE_LO, BLUE_HI),
    goldenMorning: spanIn(0, maxIdx, GOLD_LO, GOLD_HI),
    goldenEvening: spanIn(maxIdx, N, GOLD_LO, GOLD_HI),
    blueEvening: spanIn(maxIdx, N, BLUE_LO, BLUE_HI),
    note,
  };
}

/** Astronomische Dunkelheit (Sonne < −18°) — eine Nacht (Abend → Folgemorgen). */
export interface DarknessWindow {
  /** Abends: Sonne sinkt unter −18° (Beginn voller Dunkelheit). */
  dusk: Date | null;
  /** Morgens (Folgetag): Sonne steigt über −18° (Ende voller Dunkelheit). */
  dawn: Date | null;
  /** Dauer voller Dunkelheit in Stunden. */
  durationH: number;
  /** 'no-darkness' = Sommernacht ohne astronomische Dunkelheit; 'all-night' = durchgehend dunkel. */
  note: 'normal' | 'no-darkness' | 'all-night';
}

const ASTRO_NIGHT = -18;

/**
 * Berechnet das Fenster vollständiger (astronomischer) Dunkelheit für die Nacht,
 * die am `dateISO` abends beginnt (FOTO/ASTRO-US6). Sampelt vom Mittag des Tages
 * bis zum Mittag des Folgetags.
 */
export function computeAstroDarkness(dateISO: string, lat: number, lon: number): DarknessWindow {
  const base = new Date(`${dateISO}T12:00:00`).getTime();
  const N = 24 * 60;
  const at = (m: number) => new Date(base + m * 60_000);
  let prev = sunAltitudeDeg(at(0), lat, lon);
  let minA = prev, maxA = prev;
  let dusk: Date | null = null, dawn: Date | null = null;
  for (let m = 1; m <= N; m++) {
    const a = sunAltitudeDeg(at(m), lat, lon);
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
    if (!dusk && prev >= ASTRO_NIGHT && a < ASTRO_NIGHT) {
      dusk = at(m - 1 + (ASTRO_NIGHT - prev) / (a - prev));
    } else if (dusk && !dawn && prev < ASTRO_NIGHT && a >= ASTRO_NIGHT) {
      dawn = at(m - 1 + (ASTRO_NIGHT - prev) / (a - prev));
    }
    prev = a;
  }
  let note: DarknessWindow['note'] = 'normal';
  if (minA > ASTRO_NIGHT) note = 'no-darkness';
  else if (maxA < ASTRO_NIGHT) note = 'all-night';
  const durationH = dusk && dawn ? (dawn.getTime() - dusk.getTime()) / 3_600_000 : note === 'all-night' ? 24 : 0;
  return { dusk, dawn, durationH, note };
}

/** Lokale Uhrzeit „HH:MM". */
export function fmtClock(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** Lesbares Zeitfenster, z. B. „05:42–06:18". */
export function fmtSpan(s: LightSpan | null): string {
  if (!s) return '—';
  return `${fmtClock(s.start)}–${fmtClock(s.end)}`;
}
