import { useEffect, useState, type CSSProperties } from 'react';

// ============================================================================
// DACH map as the one background of the start page, zoomed in so that only a
// part of it shows: about 1.5 viewport widths wide, centred on CENTER_LON and
// cut at TOP_LAT, it scrolls with the page — Hamburg at the very top beside the
// logo, Munich, Switzerland and Austria further down, neighbouring cities at
// the edges. Dot matrix inside the dissolved
// outline DE ∪ AT ∪ CH ∪ LI, country borders, crosshairs on the 1° graticule.
// Outlines come from the same files as the map's sand mask
// (public/countries/*.geojson); nothing renders until they are loaded.
// ============================================================================

const LON0 = 4.0, LON1 = 19.4, LAT0 = 45.0, LAT1 = 54.9;
const K = 100;
const KX = K * Math.cos((50 * Math.PI) / 180);
const W = Math.round((LON1 - LON0) * KX);
const H = Math.round((LAT1 - LAT0) * K);

/** Viewport centre (desktop, mobile) and the latitude at the top edge of the page. */
const CENTER_LON = 11.4, CENTER_LON_MOBILE = 10.4, TOP_LAT = 53.75;

const px = (lon: number) => (lon - LON0) * KX;
const py = (lat: number) => (LAT1 - lat) * K;

/** Tier 1 = DACH capital, 2 = large city, 3 = further city; `x` = outside DACH. */
type City = [name: string, lon: number, lat: number, tier: 1 | 2 | 3, abroad?: 'x'];
const CITIES: City[] = [
  ['Berlin', 13.405, 52.52, 1], ['Wien', 16.373, 48.208, 1], ['Bern', 7.447, 46.948, 1], ['Vaduz', 9.521, 47.141, 1],
  ['Hamburg', 9.993, 53.551, 2], ['München', 11.582, 48.135, 2], ['Köln', 6.96, 50.938, 2], ['Frankfurt', 8.682, 50.11, 2],
  ['Stuttgart', 9.183, 48.776, 2], ['Leipzig', 12.374, 51.34, 2], ['Dresden', 13.737, 51.05, 2], ['Hannover', 9.732, 52.375, 2],
  ['Bremen', 8.801, 53.079, 2], ['Nürnberg', 11.077, 49.452, 2], ['Zürich', 8.541, 47.377, 2], ['Genf', 6.143, 46.204, 2],
  ['Graz', 15.439, 47.07, 2], ['Linz', 14.286, 48.306, 2], ['Salzburg', 13.055, 47.809, 2], ['Innsbruck', 11.404, 47.269, 2],
  ['Düsseldorf', 6.773, 51.227, 3], ['Dortmund', 7.465, 51.514, 3], ['Bonn', 7.098, 50.737, 3], ['Aachen', 6.084, 50.776, 3],
  ['Münster', 7.626, 51.961, 3], ['Osnabrück', 8.047, 52.279, 3], ['Bielefeld', 8.532, 52.03, 3], ['Kassel', 9.479, 51.312, 3],
  ['Göttingen', 9.935, 51.541, 3], ['Braunschweig', 10.526, 52.269, 3], ['Magdeburg', 11.628, 52.12, 3], ['Erfurt', 11.03, 50.978, 3],
  ['Chemnitz', 12.921, 50.833, 3], ['Görlitz', 14.987, 51.153, 3], ['Cottbus', 14.334, 51.756, 3], ['Kiel', 10.122, 54.323, 3],
  ['Flensburg', 9.437, 54.794, 3], ['Lübeck', 10.687, 53.866, 3], ['Schwerin', 11.401, 53.629, 3], ['Rostock', 12.099, 54.092, 3],
  ['Stralsund', 13.081, 54.315, 3], ['Koblenz', 7.589, 50.356, 3], ['Trier', 6.641, 49.75, 3], ['Saarbrücken', 6.997, 49.24, 3],
  ['Mannheim', 8.466, 49.488, 3], ['Karlsruhe', 8.404, 49.007, 3], ['Würzburg', 9.953, 49.79, 3], ['Regensburg', 12.102, 49.013, 3],
  ['Augsburg', 10.898, 48.371, 3], ['Ulm', 9.993, 48.401, 3], ['Freiburg', 7.842, 47.999, 3], ['Konstanz', 9.175, 47.66, 3],
  ['Passau', 13.431, 48.574, 3], ['Basel', 7.588, 47.56, 3], ['Luzern', 8.31, 47.05, 3], ['Lausanne', 6.632, 46.52, 3],
  ['Sion', 7.36, 46.23, 3], ['Chur', 9.532, 46.85, 3], ['Lugano', 8.952, 46.004, 3], ['Bregenz', 9.747, 47.505, 3],
  ['Klagenfurt', 14.305, 46.624, 3],
  ['Amsterdam', 4.904, 52.367, 2, 'x'], ['Brüssel', 4.352, 50.847, 2, 'x'], ['Luxemburg', 6.13, 49.611, 2, 'x'],
  ['Prag', 14.438, 50.075, 2, 'x'], ['Bratislava', 17.107, 48.149, 2, 'x'], ['Ljubljana', 14.506, 46.056, 2, 'x'],
  ['Zagreb', 15.982, 45.815, 2, 'x'], ['Budapest', 19.04, 47.498, 2, 'x'], ['Mailand', 9.19, 45.464, 2, 'x'],
  ['Rotterdam', 4.479, 51.924, 3, 'x'], ['Groningen', 6.567, 53.219, 3, 'x'], ['Lüttich', 5.567, 50.633, 3, 'x'],
  ['Metz', 6.176, 49.119, 3, 'x'], ['Nancy', 6.184, 48.692, 3, 'x'], ['Straßburg', 7.752, 48.573, 3, 'x'],
  ['Besançon', 6.024, 47.238, 3, 'x'], ['Lyon', 4.836, 45.764, 3, 'x'], ['Grenoble', 5.724, 45.188, 3, 'x'],
  ['Turin', 7.686, 45.07, 3, 'x'], ['Bozen', 11.354, 46.498, 3, 'x'], ['Trient', 11.121, 46.067, 3, 'x'],
  ['Verona', 10.992, 45.438, 3, 'x'], ['Venedig', 12.316, 45.44, 3, 'x'], ['Triest', 13.776, 45.65, 3, 'x'],
  ['Brünn', 16.607, 49.195, 3, 'x'], ['Pilsen', 13.378, 49.738, 3, 'x'], ['Breslau', 17.039, 51.108, 3, 'x'],
  ['Posen', 16.925, 52.406, 3, 'x'], ['Stettin', 14.553, 53.428, 3, 'x'], ['Danzig', 18.646, 54.352, 3, 'x'],
];

/** Labels that sit left of their dot (right edge, or a neighbour on the right). */
const LEFT = new Set(['Wien', 'Budapest', 'Danzig']);

/** [name, lon, lat, kind] */
const AREAS: [string, number, number, 'country' | 'abroad' | 'sea' | 'range'][] = [
  ['Deutschland', 9.0, 50.75, 'country'], ['Österreich', 14.2, 47.35, 'country'], ['Schweiz', 7.9, 46.62, 'country'],
  ['Niederlande', 5.7, 52.85, 'abroad'], ['Belgien', 4.9, 50.3, 'abroad'], ['Frankreich', 5.2, 48.2, 'abroad'],
  ['Italien', 8.2, 45.85, 'abroad'], ['Tschechien', 15.5, 49.6, 'abroad'], ['Polen', 16.5, 52.9, 'abroad'], ['Ungarn', 18.3, 47.0, 'abroad'],
  ['Nordsee', 7.0, 54.3, 'sea'], ['Ostsee', 13.8, 54.6, 'sea'], ['Alpen', 12.5, 47.0, 'range'],
];

const pct = (v: number) => `${(-v * 100).toFixed(2)}%`;
const SHIFT = {
  '--dmb-x': pct(px(CENTER_LON) / W),
  '--dmb-x-m': pct(px(CENTER_LON_MOBILE) / W),
  '--dmb-y': pct(py(TOP_LAT) / H),
} as CSSProperties;

type Ring = number[][];
type Geo = { geometry?: { type: string; coordinates: unknown } };

function rings(g: Geo): Ring[] {
  const geom = g.geometry;
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates as Ring[];
  if (geom.type === 'MultiPolygon') return (geom.coordinates as Ring[][]).flat();
  return [];
}

function pathOf(g: Geo): string {
  return rings(g).map((r) => r.map(([lon, lat], i) =>
    `${i ? 'L' : 'M'}${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join('') + 'Z').join('');
}

function crosshairs(): string {
  let d = '';
  for (let lon = Math.ceil(LON0); lon <= LON1; lon++) {
    for (let lat = Math.ceil(LAT0); lat <= LAT1; lat++) {
      const x = px(lon), y = py(lat);
      d += `M${(x - 2).toFixed(1)} ${y.toFixed(1)}h4M${x.toFixed(1)} ${(y - 2).toFixed(1)}v4`;
    }
  }
  return d;
}

export default function DachMapBackground() {
  const [paths, setPaths] = useState<{ dach: string; borders: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = (iso: string) => fetch(`/countries/${iso}.geojson`).then((r) => {
      if (!r.ok) throw new Error(`${iso}: ${r.status}`);
      return r.json() as Promise<Geo>;
    });
    Promise.all([load('DACH'), load('AT'), load('CH')])
      .then(([dach, at, ch]) => { if (alive) setPaths({ dach: pathOf(dach), borders: pathOf(at) + pathOf(ch) }); })
      .catch(() => { /* decorative only — without outlines the page keeps its plain sand */ });
    return () => { alive = false; };
  }, []);

  return (
    <div className={`deck-mapbg${paths ? ' is-ready' : ''}`} aria-hidden="true">
      {paths && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet" style={SHIFT}>
          <defs>
            <pattern id="dmb-dots" width="3.6" height="3.6" patternUnits="userSpaceOnUse">
              <circle cx="1.8" cy="1.8" r="0.55" />
            </pattern>
          </defs>
          <path className="deck-mapbg-cross" d={crosshairs()} />
          <path className="deck-mapbg-shadow" d={paths.dach} transform="translate(2 3)" />
          <path className="deck-mapbg-land" d={paths.dach} />
          <path className="deck-mapbg-dots" d={paths.dach} fill="url(#dmb-dots)" />
          <path className="deck-mapbg-borders" d={paths.borders} />
          <path className="deck-mapbg-outline" d={paths.dach} />
          {AREAS.map(([name, lon, lat, kind]) => (
            <text key={name} className={`deck-mapbg-area is-${kind}`} x={px(lon)} y={py(lat)} textAnchor="middle" dominantBaseline="central">{name}</text>
          ))}
          {CITIES.map(([name, lon, lat, tier, abroad]) => {
            const x = px(lon), y = py(lat);
            const r = tier === 1 ? 1.5 : tier === 2 ? 1.15 : 0.85;
            const left = LEFT.has(name);
            return (
              <g key={name} className={`deck-mapbg-city is-t${tier}${abroad ? ' is-abroad' : ''}`}>
                {tier === 1 && <circle className="deck-mapbg-pulse" cx={x} cy={y} r="1.8" />}
                <circle cx={x} cy={y} r={r} />
                <text x={left ? x - r - 1.8 : x + r + 1.8} y={y} dominantBaseline="central" textAnchor={left ? 'end' : 'start'}>{name}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
