/**
 * SAT2a — WGS84-UTM-Rechnung für die Sentinel-2-COGs (`audit/brandradar-satellitenbilder.md` §9).
 * Haus-Stil der Geo-Module (`radolanGeo.ts`/`geosphereIncaGeo.ts`): pur, DOM-frei, die Projektion
 * und ihre Konvention stehen im Docblock, und Zeichnen wie Punktrechnung nehmen DIESELBEN Formeln.
 *
 * Projektion: Transverse Mercator (UTM), WGS84-Ellipsoid, `k0 = 0.9996`, Mittelmeridian aus der
 * Zone. Die Zone kommt IMMER aus `proj:epsg` (326xx Nord / 327xx Süd) der STAC-Antwort — nie aus
 * der Länge geraten: S2-Granulate überlappen Zonen (am Messpunkt 50.7 N / 6.35 O lagen 31UGS
 * UND 32ULB, EPSG 32631 und 32632, beide gültig).
 *
 * Eck-Konvention des `proj:transform` [scale, 0, X0, 0, −scale, Y0]: (X0, Y0) ist die ÄUSSERE
 * Nordwest-Ecke des Rasters, Pixel (0,0) deckt [X0, X0+scale] × [Y0−scale, Y0] — `pixelOf`
 * liefert deshalb Bruchpixel ab der Außenkante (Pixelmitte = +0,5).
 *
 * Genauigkeit der Reihenentwicklung (Snyder, Karney-gekürzt): < 1 mm innerhalb der Zone —
 * gegenüber 10-m-Pixeln bedeutungslos; der Verifier prüft Mittelmeridian-Exaktheit, Maßstab k0
 * am Äquator, den Rundlauf fwd∘inv und den gemessenen Granulat-Anker.
 */

const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const E2 = F * (2 - F);
const E4 = E2 * E2;
const E6 = E4 * E2;
const EP2 = E2 / (1 - E2);
const FALSE_E = 500_000;
const D2R = Math.PI / 180;

/** Mittelmeridian der Zone in Grad. */
const lon0Of = (zone: number): number => (zone - 1) * 6 - 180 + 3;

export interface UtmZone { zone: number; south: boolean }

/** EPSG 326xx (Nord) / 327xx (Süd) → Zone; alles andere ist `null` (benannter Fehler beim Aufrufer). */
export function utmZoneOf(epsg: number): UtmZone | null {
  if (epsg >= 32601 && epsg <= 32660) return { zone: epsg - 32600, south: false };
  if (epsg >= 32701 && epsg <= 32760) return { zone: epsg - 32700, south: true };
  return null;
}

/** Meridianbogen vom Äquator (Snyder 3-21). */
function meridianArc(latRad: number): number {
  return A * (
    (1 - E2 / 4 - (3 * E4) / 64 - (5 * E6) / 256) * latRad
    - ((3 * E2) / 8 + (3 * E4) / 32 + (45 * E6) / 1024) * Math.sin(2 * latRad)
    + ((15 * E4) / 256 + (45 * E6) / 1024) * Math.sin(4 * latRad)
    - ((35 * E6) / 3072) * Math.sin(6 * latRad)
  );
}

export function utmFwd(lat: number, lon: number, epsg: number): { e: number; n: number } | null {
  const z = utmZoneOf(epsg);
  if (!z) return null;
  const phi = lat * D2R;
  const sinP = Math.sin(phi);
  const cosP = Math.cos(phi);
  const tanP = Math.tan(phi);
  const nu = A / Math.sqrt(1 - E2 * sinP * sinP);
  const T = tanP * tanP;
  const C = EP2 * cosP * cosP;
  const Am = cosP * (lon - lon0Of(z.zone)) * D2R;
  const A2 = Am * Am;
  const e = FALSE_E + K0 * nu * (Am + ((1 - T + C) * A2 * Am) / 6
    + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * A2 * A2 * Am) / 120);
  let n = K0 * (meridianArc(phi) + nu * tanP * (A2 / 2
    + ((5 - T + 9 * C + 4 * C * C) * A2 * A2) / 24
    + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * A2 * A2 * A2) / 720));
  if (z.south) n += 10_000_000;
  return { e, n };
}

/** Umkehrung — im Betrieb ungenutzt, sie belegt im Verifier den Rundlauf. */
export function utmInv(e: number, n: number, epsg: number): { lat: number; lon: number } | null {
  const z = utmZoneOf(epsg);
  if (!z) return null;
  const x = e - FALSE_E;
  const y = z.south ? n - 10_000_000 : n;
  const M = y / K0;
  const mu = M / (A * (1 - E2 / 4 - (3 * E4) / 64 - (5 * E6) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 = mu
    + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
    + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sinP = Math.sin(phi1);
  const cosP = Math.cos(phi1);
  const tanP = Math.tan(phi1);
  const C1 = EP2 * cosP * cosP;
  const T1 = tanP * tanP;
  const nu1 = A / Math.sqrt(1 - E2 * sinP * sinP);
  const rho1 = (A * (1 - E2)) / Math.pow(1 - E2 * sinP * sinP, 1.5);
  const D = x / (nu1 * K0);
  const D2 = D * D;
  const lat = (phi1 - ((nu1 * tanP) / rho1) * (D2 / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D2 * D2) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D2 * D2 * D2) / 720)) / D2R;
  const lon = lon0Of(z.zone) + (D - ((1 + 2 * T1 + C1) * D2 * D) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D2 * D2 * D) / 120) / cosP / D2R;
  return { lat, lon };
}

/**
 * Ort → Bruchpixel im Raster eines Assets (`proj:transform` = [scale, 0, X0, 0, −scale, Y0]).
 * `null`, wenn die EPSG keine UTM-Zone ist — der Aufrufer sagt es, statt falsch zu zeichnen.
 */
export function pixelOf(
  lat: number, lon: number, epsg: number, transform: readonly number[],
): { px: number; py: number } | null {
  const p = utmFwd(lat, lon, epsg);
  if (!p || transform.length < 6) return null;
  const scaleX = transform[0];
  const scaleY = transform[4]; // negativ (Nord oben)
  if (!scaleX || !scaleY) return null;
  return { px: (p.e - transform[2]) / scaleX, py: (p.n - transform[5]) / scaleY };
}

// --- Selbstverifikation -----------------------------------------------------------------------

export interface GeoCheck { name: string; ok: boolean; detail?: string }

export function verifySentinelGeo(): { checks: GeoCheck[]; passed: number; total: number } {
  const checks: GeoCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Exaktheit am Mittelmeridian: dort ist E = 500 000 und N = k0 · Meridianbogen, per Definition.
  const cm = utmFwd(50.7, 3, 32631)!;
  add('Mittelmeridian ⇒ E exakt 500 000', Math.abs(cm.e - 500_000) < 1e-6, `E=${cm.e}`);
  const eq = utmFwd(0, 3, 32631)!;
  add('Äquator + Mittelmeridian ⇒ N exakt 0', Math.abs(eq.n) < 1e-6, `N=${eq.n}`);

  // Maßstab am Äquator auf dem Mittelmeridian ist per Definition k0.
  const d = 0.001;
  const de = utmFwd(0, 3 + d, 32631)!.e - eq.e;
  const expected = K0 * A * d * D2R;
  add('Maßstab k0 am Äquator (±1 mm)', Math.abs(de - expected) < 0.001, `Δ=${(de - expected).toFixed(6)} m`);

  // Unabhängiger Goldwert: CN Tower, das klassische UTM-Beispiel — 17T 630084 E / 4833438 N.
  const cn = utmFwd(43 + 38 / 60 + 33.24 / 3600, -(79 + 23 / 60 + 13.7 / 3600), 32617)!;
  add('Goldwert CN Tower (17T 630084 / 4833438, ±1 m)',
    Math.abs(cn.e - 630084) < 1 && Math.abs(cn.n - 4833438.5) < 1,
    `E=${cn.e.toFixed(1)}, N=${cn.n.toFixed(1)}`);

  // Rundlauf fwd∘inv < 1 cm — in der eigenen und der NACHBAR-Zone (S2-Granulate ragen ~1°
  // über die Zonengrenze; weiter draußen divergiert die Reihe planmäßig und kommt nie vor).
  let worst = 0;
  for (const [lat, lon, epsg] of [
    [47.0, 7.5, 32632], [50.7, 6.35, 32631], [50.7, 6.35, 32632], [54.5, 13.5, 32633], [46.5, 15.9, 32633],
  ] as const) {
    const f = utmFwd(lat, lon, epsg)!;
    const r = utmInv(f.e, f.n, epsg)!;
    const dm = Math.hypot((r.lat - lat) * 111_320, (r.lon - lon) * 111_320 * Math.cos(lat * D2R));
    if (dm > worst) worst = dm;
  }
  const s = utmFwd(-33.9, 18.4, 32734)!;
  const sr = utmInv(s.e, s.n, 32734)!;
  add('Rundlauf fwd∘inv < 1 cm (DACH inkl. Nachbarzone)', worst < 0.01, `max ${worst.toExponential(2)} m`);
  add('Süd-Hemisphäre (327xx): False Northing im Rundlauf', Math.abs(sr.lat + 33.9) < 1e-7 && s.n > 5_000_000);

  // Gemessener Anker (STAC 2026-09-01): derselbe Punkt liegt in BEIDEN überlappenden Granulaten.
  const p31 = pixelOf(50.7, 6.35, 32631, [10, 0, 699960, 0, -10, 5700000])!;
  const p32 = pixelOf(50.7, 6.35, 32632, [10, 0, 300000, 0, -10, 5700000])!;
  add('Anker 31UGS: Punkt fällt in die 10980²-Fläche', p31.px > 0 && p31.px < 10980 && p31.py > 0 && p31.py < 10980,
    `px=${p31.px.toFixed(1)}, py=${p31.py.toFixed(1)}`);
  add('Anker 32ULB: derselbe Punkt auch im Nachbarzonen-Granulat', p32.px > 0 && p32.px < 10980 && p32.py > 0 && p32.py < 10980);

  add('fremde EPSG ⇒ null, nie ein geratenes Pixel', utmZoneOf(4326) === null && pixelOf(50, 6, 4326, [10, 0, 0, 0, -10, 0]) === null);
  add('kaputter transform ⇒ null', pixelOf(50, 6, 32631, [0, 0, 0, 0, 0, 0]) === null);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
