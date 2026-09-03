/**
 * Höhen-Anreicherung für Strecken ohne (brauchbare) Höhendaten.
 *
 * Quelle: Mapzen/AWS Terrarium-DEM-Tiles (offen, bereits im Projekt genutzt,
 * siehe fusion/elevation.ts). Für DACH liefert das ~30 m Auflösung. EU-DEM10
 * bzw. Copernicus DEM ließen sich später hinter derselben Schnittstelle
 * einhängen. Es werden nur die tatsächlich von der Strecke berührten Tiles
 * geladen — nicht die gesamte Bounding-Box.
 *
 * Terrarium: elevation_m = R·256 + G + B/256 − 32768
 *
 * Seit R3D-4 hat das Modul zwei weitere Aufgaben (`audit/route-3d.md` §19):
 *  • **Gegenprobe** — eine Datei kann Höhen mitbringen, die dieses Gelände nicht
 *    beschreiben. Die Kette übernahm sie bisher widerspruchslos; sie steckt aber
 *    nicht nur im Bild, sondern über `correctForElevation` auch in Temperatur,
 *    Wind und damit in der Go/No-Go-Entscheidung.
 *  • **Relief** — Profile NEBEN der Strecke, damit die Rückwand der 3D-Ansicht
 *    gemessenes Gelände zeigt statt der Extrusion des eigenen Profils.
 * Beide teilen sich die Kachel-Ladung; die Kacheln sind dieselben.
 */

const TERRARIUM_TPL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const MAX_TILES = 64; // Obergrenze; Zoom wird notfalls reduziert

export interface LatLon { lat: number; lon: number; }

/** Track-Punkt mit Streckenposition — Eingang des Relief-Abtasters. */
export interface ReliefTrackPoint extends LatLon { dist: number }

/** Ein gemessenes Profil seitlich der Strecke. */
export interface ReliefSample {
  offsetM: number;
  nodes: Array<{ distM: number; terrainM: number }>;
}

/**
 * Kill-Switch der Höhen-Gegenprobe (Muster `?tour=0`): `?dem=0` schlägt sie für
 * den Aufruf aus, `localStorage.dem = '0'` dauerhaft. Sie kostet je Tour einmal
 * die Kacheln der Strecke — ohne Browser bleibt sie aus.
 */
export function demCheckEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search).get('dem');
    if (q === '0') return false;
    if (q === '1') return true;
    return window.localStorage?.getItem('dem') !== '0';
  } catch {
    return true;
  }
}

function lng2tileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * (1 << z);
}
function lat2tileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * (1 << z);
}
function decodePixel(data: Uint8ClampedArray, idx: number): number {
  return data[idx] * 256 + data[idx + 1] + data[idx + 2] / 256 - 32768;
}

async function loadTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Uint8ClampedArray | null> {
  const url = TERRARIUM_TPL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  try {
    const res = await fetch(url, { signal, mode: 'cors' });
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    return ctx.getImageData(0, 0, 256, 256).data;
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    return null;
  }
}

/** Wählt den höchsten Zoom (≤13), bei dem ≤ `maxTiles` Tiles die Punkte abdecken. */
function chooseZoom(points: LatLon[], maxTiles = MAX_TILES): { zoom: number; tiles: Set<string> } {
  for (let zoom = 13; zoom >= 8; zoom--) {
    const tiles = new Set<string>();
    for (const p of points) {
      tiles.add(`${Math.floor(lng2tileX(p.lon, zoom))}/${Math.floor(lat2tileY(p.lat, zoom))}`);
      if (tiles.size > maxTiles) break;
    }
    if (tiles.size <= maxTiles) return { zoom, tiles };
  }
  // Fallback: gröbster Zoom.
  const zoom = 8;
  const tiles = new Set<string>();
  for (const p of points) tiles.add(`${Math.floor(lng2tileX(p.lon, zoom))}/${Math.floor(lat2tileY(p.lat, zoom))}`);
  return { zoom, tiles };
}

/**
 * Lädt die Kacheln EINMAL für alle übergebenen Punkte und gibt einen Abtaster
 * zurück. `null`, wenn keine einzige Kachel kam (offline) — der Aufrufer
 * degradiert dann sauber; einzelne fehlende Kacheln ergeben NaN.
 */
async function makeSampler(
  points: LatLon[],
  signal?: AbortSignal,
  maxTiles = MAX_TILES,
): Promise<((lon: number, lat: number) => number) | null> {
  const { zoom, tiles } = chooseZoom(points, maxTiles);

  const tileData = new Map<string, Uint8ClampedArray | null>();
  await Promise.all(
    [...tiles].map(async (key) => {
      const [x, y] = key.split('/').map(Number);
      tileData.set(key, await loadTile(zoom, x, y, signal));
    }),
  );
  if ([...tileData.values()].every((d) => d == null)) return null;

  return (lon: number, lat: number): number => {
    const fx = lng2tileX(lon, zoom);
    const fy = lat2tileY(lat, zoom);
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const data = tileData.get(`${tx}/${ty}`);
    if (!data) return NaN;
    // Bilineare Interpolation innerhalb des Tiles.
    const px = (fx - tx) * 256;
    const py = (fy - ty) * 256;
    const i0 = Math.max(0, Math.min(255, Math.floor(px)));
    const j0 = Math.max(0, Math.min(255, Math.floor(py)));
    const i1 = Math.min(255, i0 + 1);
    const j1 = Math.min(255, j0 + 1);
    const fxr = px - i0;
    const fyr = py - j0;
    const e00 = decodePixel(data, (j0 * 256 + i0) * 4);
    const e10 = decodePixel(data, (j0 * 256 + i1) * 4);
    const e01 = decodePixel(data, (j1 * 256 + i0) * 4);
    const e11 = decodePixel(data, (j1 * 256 + i1) * 4);
    const e0 = e00 * (1 - fxr) + e10 * fxr;
    const e1 = e01 * (1 - fxr) + e11 * fxr;
    return e0 * (1 - fyr) + e1 * fyr;
  };
}

/**
 * Liefert für jeden Punkt die DEM-Höhe (Meter). Gibt `null` zurück, wenn keine
 * Tiles geladen werden konnten (z. B. offline) — der Aufrufer degradiert dann
 * sauber. Einzelne nicht ladbare Tiles ergeben NaN für die betroffenen Punkte.
 */
export async function sampleElevations(
  points: LatLon[],
  signal?: AbortSignal,
  // Additiv (Event-Terrain, E4): ein Aufrufer mit kleinem Kostenbudget darf den
  // Kachel-Deckel senken — der Zoom folgt dann automatisch. Default = MAX_TILES,
  // Bestandsaufrufer (Route-Gegenprobe, Relief) verhalten sich byte-gleich.
  opts?: { maxTiles?: number },
): Promise<number[] | null> {
  if (points.length === 0) return [];
  const sampleAt = await makeSampler(points, signal, opts?.maxTiles ?? MAX_TILES);
  if (!sampleAt) return null;
  return points.map((p) => sampleAt(p.lon, p.lat));
}

/** Höchste Zahl der Stützpunkte je Seitenprofil — mehr löst das Bild nicht auf. */
const RELIEF_NODES = 400;

/**
 * Gelände NEBEN der Strecke, `offsetsM` Meter seitlich versetzt.
 *
 * Versetzt wird **links der Fahrtrichtung**, also auf die Seite, die die
 * Kopfzeile der 3D-Ansicht ohnehin nennt („Süd → Nord"); positive Werte liegen
 * im Bild weiter hinten. Der Versatz steht senkrecht auf der lokalen
 * Fahrtrichtung — bei einer Kurve wandert er mit, statt eine gerade Schnittlinie
 * zu behaupten, die es nicht gibt.
 *
 * `null`, wenn keine Kachel geladen werden konnte. Profile, in denen das DEM
 * überwiegend fehlt, kommen gar nicht erst zurück — ein halbes Relief wäre eine
 * Aussage über Gelände, das wir nicht gemessen haben.
 */
export async function sampleReliefProfiles(
  points: ReliefTrackPoint[],
  offsetsM: number[],
  signal?: AbortSignal,
): Promise<ReliefSample[] | null> {
  if (points.length < 2 || offsetsM.length === 0) return [];

  // Ausdünnen: 400 Stützpunkte je Profil genügen dem Bild.
  const step = Math.max(1, Math.ceil(points.length / RELIEF_NODES));
  const base: ReliefTrackPoint[] = [];
  for (let i = 0; i < points.length; i += step) base.push(points[i]);
  if (base[base.length - 1] !== points[points.length - 1]) base.push(points[points.length - 1]);

  const shifted = offsetsM.map((off) => base.map((p, i) => {
    const a = base[Math.max(0, i - 1)];
    const b = base[Math.min(base.length - 1, i + 1)];
    const cosLat = Math.cos((p.lat * Math.PI) / 180) || 1e-6;
    const east = (b.lon - a.lon) * cosLat;
    const north = b.lat - a.lat;
    const len = Math.hypot(east, north) || 1;
    // Linke Normale der Fahrtrichtung: (E,N) um +90° gedreht ⇒ (−N, E).
    const dEast = (-north / len) * off;
    const dNorth = (east / len) * off;
    return {
      lat: p.lat + dNorth / 111_320,
      lon: p.lon + dEast / (111_320 * cosLat),
      dist: p.dist,
    };
  }));

  const sampleAt = await makeSampler(shifted.flat(), signal);
  if (!sampleAt) return null;

  const out: ReliefSample[] = [];
  offsetsM.forEach((offsetM, k) => {
    const nodes = shifted[k]
      .map((p) => ({ distM: p.dist, terrainM: sampleAt(p.lon, p.lat) }))
      .filter((n) => Number.isFinite(n.terrainM));
    // Lückenhaftes Profil = kein Profil.
    if (nodes.length >= shifted[k].length * 0.8 && nodes.length >= 2) out.push({ offsetM, nodes });
  });
  return out;
}

/**
 * Vergleicht mitgebrachte Höhen mit dem Geländemodell. `null`, wenn das DEM
 * nicht erreichbar war — „nicht geprüft" ist etwas anderes als „stimmt".
 */
export async function compareToDem(
  points: Array<LatLon & { ele: number }>,
  maxProbes = 120,
  signal?: AbortSignal,
): Promise<{ medianAbsM: number; biasM: number; probes: number } | null> {
  if (points.length === 0) return null;
  const step = Math.max(1, Math.ceil(points.length / maxProbes));
  const probe: Array<LatLon & { ele: number }> = [];
  for (let i = 0; i < points.length; i += step) probe.push(points[i]);

  const dem = await sampleElevations(probe, signal);
  if (!dem) return null;

  const diffs: number[] = [];
  for (let i = 0; i < probe.length; i++) {
    if (!Number.isFinite(dem[i]) || !Number.isFinite(probe[i].ele)) continue;
    diffs.push(probe[i].ele - dem[i]);
  }
  if (diffs.length < probe.length * 0.5 || diffs.length === 0) return null;

  const abs = diffs.map(Math.abs).sort((a, b) => a - b);
  return {
    medianAbsM: abs[abs.length >> 1],
    biasM: diffs.reduce((a, b) => a + b, 0) / diffs.length,
    probes: diffs.length,
  };
}
