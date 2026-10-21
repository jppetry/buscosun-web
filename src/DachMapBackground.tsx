import { useEffect, useState } from 'react';

// ============================================================================
// DACH map as a quiet SVG background behind the whole start page: dot matrix
// inside the dissolved outline DE ∪ AT ∪ CH ∪ LI, country borders, a 1°
// graticule. Outlines come from the same files as the map's sand mask
// (public/countries/*.geojson); nothing renders until they are loaded.
// ============================================================================

const LON0 = 5.6, LON1 = 17.4, LAT0 = 45.6, LAT1 = 55.3;
const K = 100;
const KX = K * Math.cos((50.5 * Math.PI) / 180);
const W = Math.round((LON1 - LON0) * KX);
const H = Math.round((LAT1 - LAT0) * K);

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
    `${i ? 'L' : 'M'}${((lon - LON0) * KX).toFixed(1)} ${((LAT1 - lat) * K).toFixed(1)}`).join('') + 'Z').join('');
}

function graticule(): string {
  let d = '';
  for (let lon = Math.ceil(LON0); lon <= LON1; lon++) d += `M${((lon - LON0) * KX).toFixed(1)} 0V${H}`;
  for (let lat = Math.ceil(LAT0); lat <= LAT1; lat++) d += `M0 ${((LAT1 - lat) * K).toFixed(1)}H${W}`;
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
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id="dmb-dots" width="9" height="9" patternUnits="userSpaceOnUse">
              <circle cx="4.5" cy="4.5" r="1.55" />
            </pattern>
            <radialGradient id="dmb-fade" cx="50%" cy="50%" r="62%">
              <stop offset="55%" stopColor="#fff" stopOpacity="1" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id="dmb-mask"><rect width={W} height={H} fill="url(#dmb-fade)" /></mask>
          </defs>
          <path className="deck-mapbg-grid" d={graticule()} mask="url(#dmb-mask)" />
          <path className="deck-mapbg-land" d={paths.dach} />
          <path className="deck-mapbg-dots" d={paths.dach} fill="url(#dmb-dots)" />
          <path className="deck-mapbg-borders" d={paths.borders} />
          <path className="deck-mapbg-outline" d={paths.dach} />
        </svg>
      )}
    </div>
  );
}
