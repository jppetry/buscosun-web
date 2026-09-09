/**
 * terrainPoint.ts — die Geländegrößen aus `ABLAUFPLAENE.md` PAP 1 E1 / PAP 5,
 * gerechnet **am Punkt** statt ausgeliefert als Raster.
 *
 * ── Warum das kein Datenprodukt ist (Jans Entscheidung 2026-09-09) ─────────
 * Ein erster Entwurf legte einen Terrain-Stack als 1 920 Kacheln (~300 MiB) ins
 * Daten-Repo. Das war überbaut, aus zwei Gründen:
 *
 *   1. **Die Daten sind längst da.** Die App lädt seit jeher Terrarium-Höhenkacheln
 *      (`elevation-tiles-prod`, in acht Modulen, darunter `pointForecast.ts` selbst),
 *      und die Landbedeckung liegt SHA-gepinnt im Spiegel `jppetry/buscosun-worldcover`
 *      (SAT2d). Ein zweiter Höhen- und Landbedeckungsdatensatz wäre eine zweite Wahrheit.
 *   2. **PAP 1 liest AM PUNKT, nicht als Fläche.** Für eine Zelle eines 300×300-Rasters
 *      ist eine Horizontsuche über 20 km teuer; für EINEN Punkt sind es acht Richtungen
 *      à ~40 Abtastungen — 320 Höhenabfragen aus Kacheln, die ohnehin im Cache liegen.
 *
 * `jppetry/buscosun-data` bleibt damit, was es ist: **ein Speicher für Wetterdaten.**
 *
 * ── Was hier steht ─────────────────────────────────────────────────────────
 * Die Rechenvorschriften und die Konstanten, die sie brauchen — rein, ohne Netz, ohne
 * Kachelformat. Der Aufrufer reicht eine Höhenfunktion herein; woher sie kommt
 * (Terrarium, ein Cache, ein Testgelände), ist ihr gleich.
 *
 * Was hier NICHT steht: `imperv` (GHS-BUILT-S) und die Verdrängungshöhe `d0`
 * (GHS-BUILT-H). Beide sind in keiner Quelle greifbar, die die App schon hat — sie
 * bleiben offen (E-13) und ihre Terme in PAP 5 damit ebenfalls.
 */

/** Erdradius für die Umrechnung Meter ⇄ Grad. */
const EARTH_R = 6_371_000;
export const M_PER_DEG_LAT = 110_574;
export function mPerDegLon(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

/**
 * Die zwei TPI-Skalen. Das Feldglossar verlangt „TPI, zwei Skalen" und nennt keine
 * Zahlen — diese beiden sind eine ENTSCHEIDUNG: 500 m fragt „liegt der Punkt tiefer als
 * sein Talboden", 2 km fragt „liegt er tiefer als sein Becken". Kalibrierbar (§20).
 */
export const TPI_RADII_M = Object.freeze({ small: 500, large: 2000 });

/** Richtungen der Horizontsuche: acht Oktanten, beginnend bei Nord, im Uhrzeigersinn. */
export const SX_OCTANTS = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const);
/** Suchweite der Horizontsuche. Darüber hinaus ändert ein Gipfel den Winkel nicht messbar. */
export const SX_RADIUS_M = 20_000;
/** Kappungsgrenze für die Distanz zum nächsten Wasser. */
export const DWATER_MAX_M = 20_000;

/**
 * ESA WorldCover v200 → aerodynamische Rauhigkeitslänge (Davenport/Wieringa).
 *
 * **Literatur, keine Messung.** Die Klassencodes sind die des Produkts, die z₀-Werte
 * die üblichen Davenport-Klassen. Wo dieser Wert in eine Vorhersage eingeht, gehört
 * seine Herkunft mit ausgewiesen — `point/calib.json` führt ihn als `literature`.
 */
export const WORLDCOVER_Z0: Readonly<Record<number, number>> = Object.freeze({
  10: 0.75,   // Tree cover
  20: 0.10,   // Shrubland
  30: 0.03,   // Grassland
  40: 0.10,   // Cropland
  50: 1.00,   // Built-up
  60: 0.005,  // Bare / sparse vegetation
  70: 0.001,  // Snow and ice
  80: 0.0002, // Permanent water bodies
  90: 0.05,   // Herbaceous wetland
  95: 0.30,   // Mangroves
  100: 0.03,  // Moss and lichen
});
export const WORLDCOVER_WATER = 80;

/** Rauhigkeitslänge zu einer WorldCover-Klasse. `null` = unbekannte Klasse, NICHT 0. */
export function z0For(lcClass: number | null | undefined): number | null {
  if (lcClass == null) return null;
  return WORLDCOVER_Z0[lcClass] ?? null;
}

/** Eine Höhenquelle: Meter über NN an (lat, lon), oder `null` wenn unbekannt. */
export type ElevationAt = (lat: number, lon: number) => number | null;

/**
 * Topographic Position Index: die Höhe des Punkts gegen das Mittel seiner Umgebung.
 * Negativ = Mulde, positiv = Kuppe.
 *
 * Das Mittel läuft über einen Ring von `samples` Richtungen und `rings` Radien bis
 * `radiusM` — nicht über ein volles Raster. Für EINEN Punkt ist das der Unterschied
 * zwischen ~50 Abfragen und ~1 500.
 */
export function tpiAt(
  lat: number, lon: number, radiusM: number, elev: ElevationAt,
  { samples = 12, rings = 3 }: { samples?: number; rings?: number } = {},
): number | null {
  const z0 = elev(lat, lon);
  if (z0 == null || !Number.isFinite(z0)) return null;
  const dLat = M_PER_DEG_LAT;
  const dLon = mPerDegLon(lat);
  let sum = 0, n = 0;
  for (let r = 1; r <= rings; r++) {
    const dist = (radiusM * r) / rings;
    for (let k = 0; k < samples; k++) {
      const a = (2 * Math.PI * k) / samples;
      const z = elev(lat + (dist * Math.cos(a)) / dLat, lon + (dist * Math.sin(a)) / dLon);
      if (z != null && Number.isFinite(z)) { sum += z; n++; }
    }
  }
  return n === 0 ? null : z0 - sum / n;
}

/**
 * Horizontwinkel je Oktant in Grad (0 = freier Horizont, größer = verstellter).
 *
 * Der Strahl wird mit WACHSENDER Schrittweite abgetastet: nahe Hindernisse brauchen
 * feine Schritte, ein Gipfel in 18 km Entfernung nicht — sein Winkel ändert sich über
 * 100 m Strahlweg nicht messbar. Gleichmäßige Schritte wären bei 20 km / 90 m = 222
 * Abtastungen je Richtung; so sind es ~46.
 */
export function horizonAngles(
  lat: number, lon: number, elev: ElevationAt,
  { radiusM = SX_RADIUS_M, first = 100, growth = 1.12 }: { radiusM?: number; first?: number; growth?: number } = {},
): number[] | null {
  const z0 = elev(lat, lon);
  if (z0 == null || !Number.isFinite(z0)) return null;
  const dLat = M_PER_DEG_LAT;
  const dLon = mPerDegLon(lat);
  const out: number[] = [];
  for (let k = 0; k < SX_OCTANTS.length; k++) {
    const a = (k * Math.PI) / 4;                 // 0 = Nord, im Uhrzeigersinn
    const ey = Math.cos(a), ex = Math.sin(a);
    let maxTan = 0;
    for (let d = first; d <= radiusM; d *= growth) {
      const z = elev(lat + (ey * d) / dLat, lon + (ex * d) / dLon);
      if (z == null || !Number.isFinite(z)) break;   // Strahl verlässt die Datenlage
      const t = (z - z0) / d;
      if (t > maxTan) maxTan = t;
    }
    out.push((Math.atan(maxTan) * 180) / Math.PI);
  }
  return out;
}

/**
 * Sky-View-Faktor für eine WAAGERECHTE Bezugsfläche aus den Horizontwinkeln
 * (Dozier/Frew): `SVF = (1/N) Σ cos²(H_i)`.
 *
 * Die Hangkorrektur bleibt bewusst außen vor: Neigung und Exposition rechnet der
 * Aufrufer ohnehin aus derselben Höhenquelle, und so geht die Neigung an GENAU EINER
 * Stelle in die Rechnung ein statt an zweien.
 */
export function skyViewFactor(horizonDeg: readonly number[]): number {
  if (horizonDeg.length === 0) return 1;
  let acc = 0;
  for (const h of horizonDeg) {
    const c = Math.cos((h * Math.PI) / 180);
    acc += c * c;
  }
  return acc / horizonDeg.length;
}

/** Hangneigung (Grad) und Exposition (Grad von Nord im Uhrzeigersinn) am Punkt. */
export function slopeAspect(
  lat: number, lon: number, elev: ElevationAt, stepM = 90,
): { slopeDeg: number; aspectDeg: number } | null {
  const dLat = M_PER_DEG_LAT, dLon = mPerDegLon(lat);
  const dy = stepM / dLat, dx = stepM / dLon;
  const zN = elev(lat + dy, lon), zS = elev(lat - dy, lon);
  const zE = elev(lat, lon + dx), zW = elev(lat, lon - dx);
  if ([zN, zS, zE, zW].some((z) => z == null || !Number.isFinite(z))) return null;
  const dzdx = ((zE as number) - (zW as number)) / (2 * stepM);
  const dzdy = ((zN as number) - (zS as number)) / (2 * stepM);
  return {
    slopeDeg: (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI,
    aspectDeg: ((Math.atan2(dzdx, dzdy) * 180) / Math.PI + 360) % 360,
  };
}

/** Großkreisabstand in Metern. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------
// Selbsttest — an analytischem Gelände, ohne Netz
// ---------------------------------------------------------------------------

export interface TerrainCheck { name: string; ok: boolean; detail?: string }

export function terrainPointSelfTest(): { checks: TerrainCheck[]; passed: number; total: number } {
  const checks: TerrainCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const LAT = 47, LON = 11;

  // (1) Ebene Fläche: TPI = 0, Horizont frei, SVF = 1, Neigung 0.
  const flat: ElevationAt = () => 500;
  add('ebene Fläche: TPI = 0', tpiAt(LAT, LON, 1000, flat) === 0);
  {
    const h = horizonAngles(LAT, LON, flat)!;
    add('ebene Fläche: Horizont überall 0°', h.every((x) => Math.abs(x) < 1e-9), h.map((x) => x.toFixed(1)).join(' '));
    add('ebene Fläche: SVF = 1', Math.abs(skyViewFactor(h) - 1) < 1e-9);
  }
  add('ebene Fläche: Neigung 0°', Math.abs(slopeAspect(LAT, LON, flat)!.slopeDeg) < 1e-9);

  // (2) Gleichmäßiger Nordhang, 10 % Gefälle nach Süden.
  {
    const slope: ElevationAt = (la) => 500 + (la - LAT) * M_PER_DEG_LAT * 0.10;
    const sa = slopeAspect(LAT, LON, slope)!;
    add('10-%-Hang: Neigung = atan(0,1) = 5,71°', Math.abs(sa.slopeDeg - 5.7106) < 0.01, sa.slopeDeg.toFixed(3));
    // Aspekt = Richtung, in die das Gelände ANSTEIGT (hier Nord).
    add('10-%-Hang: Exposition zeigt nach Norden',
      Math.abs(sa.aspectDeg) < 0.01 || Math.abs(sa.aspectDeg - 360) < 0.01, sa.aspectDeg.toFixed(2));
    // Auf einer schiefen Ebene ist das Umgebungsmittel gleich der Punkthöhe ⇒ TPI = 0.
    const tpi = tpiAt(LAT, LON, 1000, slope)!;
    add('10-%-Hang: TPI ≈ 0 (Ebene, keine Mulde)', Math.abs(tpi) < 1e-6, tpi.toExponential(2));
  }

  // (3) Mulde: eine Senke von 100 m Tiefe ⇒ TPI deutlich negativ.
  {
    const bowl: ElevationAt = (la, lo) => {
      const d = haversine(LAT, LON, la, lo);
      return 500 - 100 * Math.exp(-((d / 800) ** 2));
    };
    const tpi = tpiAt(LAT, LON, 1000, bowl)!;
    add('Mulde: TPI negativ', tpi < -30, `${tpi.toFixed(1)} m`);
    const h = horizonAngles(LAT, LON, bowl)!;
    add('Mulde: Horizont verstellt (SVF < 1)', skyViewFactor(h) < 0.999, skyViewFactor(h).toFixed(4));
  }

  // (4) Wand im Süden: NUR der Süd-Oktant sieht sie.
  {
    const wall: ElevationAt = (la, lo) => {
      const south = (LAT - la) * M_PER_DEG_LAT;      // > 0 südlich des Punkts
      const east = Math.abs((lo - LON) * mPerDegLon(LAT));
      return south > 900 && south < 1100 && east < 4000 ? 1500 : 500;
    };
    const h = horizonAngles(LAT, LON, wall)!;
    const bySector = Object.fromEntries(SX_OCTANTS.map((o, i) => [o, h[i]]));
    add('Wand im Süden: Süd-Oktant sieht sie', bySector.s > 30, `${bySector.s.toFixed(1)}°`);
    add('Wand im Süden: Nord-Oktant bleibt frei', bySector.n < 0.01, `${bySector.n.toFixed(2)}°`);
    add('Wand im Süden: SVF sinkt, bleibt aber deutlich über 0',
      skyViewFactor(h) < 0.95 && skyViewFactor(h) > 0.5, skyViewFactor(h).toFixed(3));
  }

  // (5) Der analytische Grenzfall: eine Wand in 1 km Entfernung, 1 km hoch, ist 45°.
  {
    const cliff: ElevationAt = (la, lo) => {
      const north = (la - LAT) * M_PER_DEG_LAT;
      void lo;
      return north > 950 && north < 1200 ? 1500 : 500;
    };
    const h = horizonAngles(LAT, LON, cliff, { first: 50, growth: 1.02 })!;
    add('Wand 1000 m hoch in 1000 m Abstand ⇒ ~45°', Math.abs(h[0] - 45) < 2, `${h[0].toFixed(1)}°`);
  }

  // (6) Datenlücke ist nicht 0.
  {
    const gappy: ElevationAt = (la) => (la > LAT + 0.01 ? null : 500);
    add('fehlende Höhe bricht den Strahl ab, statt 0 zu rechnen',
      horizonAngles(LAT, LON, gappy) !== null);
    add('fehlende Höhe am Punkt selbst ⇒ null', horizonAngles(LAT, LON, () => null) === null);
    add('TPI ohne Punkthöhe ⇒ null', tpiAt(LAT, LON, 1000, () => null) === null);
  }

  // (7) Die Tabellen.
  add('jede WorldCover-Klasse hat eine Rauhigkeitslänge',
    [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100].every((k) => z0For(k) != null));
  add('unbekannte Klasse ⇒ null, nicht 0', z0For(999) === null && z0For(null) === null);
  add('Wasser hat die kleinste Rauhigkeit',
    z0For(WORLDCOVER_WATER) === Math.min(...Object.values(WORLDCOVER_Z0)));
  add('zwei TPI-Skalen, wie das Feldglossar verlangt',
    TPI_RADII_M.small > 0 && TPI_RADII_M.large > TPI_RADII_M.small,
    `${TPI_RADII_M.small} m / ${TPI_RADII_M.large} m`);
  add('acht Oktanten', SX_OCTANTS.length === 8);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
