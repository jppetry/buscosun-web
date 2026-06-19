/**
 * Epic ASTRO — Lichtverschmutzung am Ort (ASTRO-US5).
 *
 * OFFLINE-Schätzung der Himmelsaufhellung aus der Nähe zu großen DACH-Städten
 * (kuratierte Liste mit Einwohnerzahlen). KEINE externe Quelle/kein VIIRS-Atlas
 * — bewusst eine grobe, ehrliche Schätzung (≈ Bortle-Skala), um dunkle von
 * aufgehellten Standorten zu unterscheiden. Lichtkuppeln großer Städte reichen
 * dutzende Kilometer; das additive 1/d²-Modell bildet das näherungsweise ab.
 */

interface City {
  name: string;
  lat: number;
  lon: number;
  /** Einwohner in Tausend (steuert die Lichtkuppel-Stärke). */
  pop: number;
}

// Größere Städte in DE/AT/CH (Einwohner ~ in Tausend, gerundet).
const CITIES: City[] = [
  { name: 'Berlin', lat: 52.52, lon: 13.405, pop: 3700 },
  { name: 'Hamburg', lat: 53.55, lon: 9.993, pop: 1900 },
  { name: 'München', lat: 48.137, lon: 11.575, pop: 1500 },
  { name: 'Köln', lat: 50.937, lon: 6.96, pop: 1100 },
  { name: 'Frankfurt am Main', lat: 50.11, lon: 8.682, pop: 760 },
  { name: 'Stuttgart', lat: 48.775, lon: 9.182, pop: 630 },
  { name: 'Düsseldorf', lat: 51.227, lon: 6.773, pop: 620 },
  { name: 'Leipzig', lat: 51.34, lon: 12.375, pop: 600 },
  { name: 'Dortmund', lat: 51.514, lon: 7.466, pop: 590 },
  { name: 'Essen', lat: 51.456, lon: 7.012, pop: 580 },
  { name: 'Bremen', lat: 53.079, lon: 8.802, pop: 570 },
  { name: 'Dresden', lat: 51.05, lon: 13.738, pop: 560 },
  { name: 'Hannover', lat: 52.376, lon: 9.732, pop: 540 },
  { name: 'Nürnberg', lat: 49.452, lon: 11.077, pop: 520 },
  { name: 'Duisburg', lat: 51.435, lon: 6.762, pop: 500 },
  { name: 'Bochum', lat: 51.482, lon: 7.216, pop: 365 },
  { name: 'Wuppertal', lat: 51.256, lon: 7.15, pop: 355 },
  { name: 'Bielefeld', lat: 52.03, lon: 8.533, pop: 335 },
  { name: 'Bonn', lat: 50.737, lon: 7.098, pop: 330 },
  { name: 'Münster', lat: 51.96, lon: 7.626, pop: 320 },
  { name: 'Mannheim', lat: 49.488, lon: 8.466, pop: 310 },
  { name: 'Karlsruhe', lat: 49.007, lon: 8.404, pop: 310 },
  { name: 'Augsburg', lat: 48.371, lon: 10.898, pop: 300 },
  { name: 'Wiesbaden', lat: 50.083, lon: 8.24, pop: 280 },
  { name: 'Mönchengladbach', lat: 51.18, lon: 6.442, pop: 260 },
  { name: 'Wien', lat: 48.208, lon: 16.373, pop: 1900 },
  { name: 'Graz', lat: 47.071, lon: 15.439, pop: 290 },
  { name: 'Linz', lat: 48.306, lon: 14.286, pop: 200 },
  { name: 'Salzburg', lat: 47.81, lon: 13.047, pop: 155 },
  { name: 'Innsbruck', lat: 47.269, lon: 11.404, pop: 130 },
  { name: 'Zürich', lat: 47.377, lon: 8.54, pop: 430 },
  { name: 'Genf', lat: 46.204, lon: 6.143, pop: 200 },
  { name: 'Basel', lat: 47.559, lon: 7.588, pop: 175 },
  { name: 'Bern', lat: 46.948, lon: 7.447, pop: 135 },
  { name: 'Lausanne', lat: 46.519, lon: 6.633, pop: 140 },
];

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLon = (bLon - aLon) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface LightPollution {
  /** Geschätzte Bortle-Klasse 1 (exzellent dunkel) … 9 (innerstädtisch). */
  bortle: number;
  label: string;
  /** Kurzhinweis für die Praxis. */
  note: string;
  nearestCity: string;
  nearestKm: number;
}

function bortleLabel(b: number): { label: string; note: string } {
  if (b <= 2) return { label: 'Exzellent dunkel', note: 'Milchstraße detailreich — ideal für Deep-Sky.' };
  if (b === 3) return { label: 'Ländlich dunkel', note: 'Sehr gute Bedingungen, schwache Aufhellung am Horizont.' };
  if (b === 4) return { label: 'Ländlich / Übergang', note: 'Brauchbar; Lichtkuppeln am Horizont sichtbar.' };
  if (b === 5) return { label: 'Vorstadt', note: 'Milchstraße blass — für Deep-Sky einen dunkleren Ort suchen.' };
  if (b <= 7) return { label: 'Stadtrand, aufgehellt', note: 'Nur helle Objekte/Mond/Planeten sinnvoll.' };
  return { label: 'Innerstädtisch, stark aufgehellt', note: 'Sehr hell — für Deep-Sky herausfahren.' };
}

/**
 * Schätzt die Himmelsaufhellung am Ort aus der gewichteten Nähe zu Großstädten.
 * Additives 1/d^2.5-Modell, auf die Bortle-Skala abgebildet (grobe Heuristik).
 */
export function estimateLightPollution(lat: number, lon: number): LightPollution {
  let light = 0;
  let nearest = CITIES[0];
  let nearestKm = Infinity;
  for (const c of CITIES) {
    const dist = haversineKm(lat, lon, c.lat, c.lon);
    if (dist < nearestKm) { nearestKm = dist; nearest = c; }
    light += c.pop / Math.pow(dist + 4, 2.5);
  }
  // log-Abbildung auf Bortle (kalibriert: Großstadtkern ≈ 8, ~30 km ≈ 3–4, abgelegen ≈ 2).
  const bortle = Math.max(1, Math.min(9, Math.round(4 + 2.2 * Math.log10(light + 0.1))));
  const { label, note } = bortleLabel(bortle);
  return { bortle, label, note, nearestCity: nearest.name, nearestKm: Math.round(nearestKm) };
}
