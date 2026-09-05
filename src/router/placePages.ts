/**
 * Statische Ortsseiten (`/wetter/<slug>/`) aus der App heraus verlinken (SEO/GEO 2026, E2).
 *
 * `placeSlugs.json` wird aus `scripts/seo/places.mjs` erzeugt (npm run seo:places) —
 * [slug, name, lat, lon] je Ort, ~5 KB. Ein Ort gilt als getroffen, wenn er
 * innerhalb von 3 km liegt (Ortsseiten-Koordinaten sind gerundete Ortszentren).
 */
import ROWS from './placeSlugs.json';

type Row = [slug: string, name: string, lat: number, lon: number];

export function placePageFor(lat: number, lon: number, maxKm = 3): { href: string; name: string; slug: string } | null {
  let best: Row | null = null;
  let bestD = Infinity;
  const kx = Math.cos((lat * Math.PI) / 180) * 111.32;
  for (const r of ROWS as Row[]) {
    const dx = (r[3] - lon) * kx;
    const dy = (r[2] - lat) * 110.57;
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best && bestD <= maxKm ? { href: `/wetter/${best[0]}/`, name: best[1], slug: best[0] } : null;
}
