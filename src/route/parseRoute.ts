/**
 * Streckendatei → {@link ParsedFile} (eine Datei kann mehrere Tracks enthalten).
 *
 * XML-Formate (GPX/TCX/KML) werden namensraum-agnostisch über DOMParser gelesen
 * und gegen ihr Wurzelelement geprüft (Schema-Plausibilität). KMZ wird vorher
 * im Browser entpackt (ZIP + DecompressionStream), FIT übernimmt der separate
 * Binär-Decoder. Segmente innerhalb eines Tracks werden zusammengefügt; mehrere
 * eigenständige Tracks bleiben getrennt (Auswahl trifft die RoutePage).
 */

import type { ParsedFile, RoutePoint, RouteTrack, RouteWaypoint } from './routeModel';
import type { RouteFormatId } from './routeFormats';
import { parseFit } from './parseFit';

export async function parseRouteFile(file: File, format: RouteFormatId): Promise<ParsedFile> {
  let parsed: ParsedFile;
  switch (format) {
    case 'gpx': parsed = parseGpx(await file.text()); break;
    case 'tcx': parsed = parseTcx(await file.text()); break;
    case 'kml': parsed = parseKml(await file.text()); break;
    case 'kmz': parsed = parseKml(await unzipKml(await file.arrayBuffer())); break;
    case 'fit': parsed = parseFit(await file.arrayBuffer()); break;
  }
  parsed.tracks = parsed.tracks.filter((t) => t.points.length > 0);
  if (parsed.tracks.length === 0) {
    throw new Error('Die Datei enthält keine verwertbare Strecke.');
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// XML-Helfer (namensraum-agnostisch über die lokalen Elementnamen)
// ---------------------------------------------------------------------------
function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Die Datei ist kein gültiges XML.');
  return doc;
}
function assertRoot(doc: Document, expected: string): void {
  const root = doc.documentElement?.localName?.toLowerCase();
  if (root !== expected.toLowerCase()) {
    throw new Error(`Unerwartetes Wurzelelement <${doc.documentElement?.localName ?? '?'}> — erwartet <${expected}>.`);
  }
}
function els(root: Document | Element, local: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', local));
}
function firstText(root: Document | Element, local: string): string | null {
  const e = els(root, local)[0];
  const t = e?.textContent?.trim();
  return t ? t : null;
}
function parseTime(s: string | null): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}
function ptFromLatLon(lat: number, lon: number, ele?: string | null, time?: string | null): RoutePoint | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const pt: RoutePoint = { lat, lon };
  const e = parseFloat(ele ?? '');
  if (Number.isFinite(e)) pt.ele = e;
  const t = parseTime(time ?? null);
  if (t != null) pt.time = t;
  return pt;
}

// ---------------------------------------------------------------------------
// GPX — je <trk> ein Track (Segmente zusammengefügt); sonst Route/Wegpunkte
// ---------------------------------------------------------------------------
function parseGpx(text: string): ParsedFile {
  const doc = parseXml(text);
  assertRoot(doc, 'gpx');
  const tracks: RouteTrack[] = [];

  for (const trk of els(doc, 'trk')) {
    const points: RoutePoint[] = [];
    for (const n of els(trk, 'trkpt')) {
      const pt = ptFromLatLon(
        parseFloat(n.getAttribute('lat') ?? ''), parseFloat(n.getAttribute('lon') ?? ''),
        firstText(n, 'ele'), firstText(n, 'time'),
      );
      if (pt) points.push(pt);
    }
    if (points.length) tracks.push({ name: firstText(trk, 'name') ?? undefined, points });
  }

  // Fallback: <rte> (Routenpunkte) bzw. lose <wpt>.
  if (!tracks.length) {
    let nodes = els(doc, 'rtept');
    if (!nodes.length) nodes = els(doc, 'wpt');
    const points: RoutePoint[] = [];
    for (const n of nodes) {
      const pt = ptFromLatLon(
        parseFloat(n.getAttribute('lat') ?? ''), parseFloat(n.getAttribute('lon') ?? ''),
        firstText(n, 'ele'), firstText(n, 'time'),
      );
      if (pt) points.push(pt);
    }
    if (points.length) tracks.push({ points });
  }

  // Wegpunkte (<wpt>) als Pausen-Vorschläge — auch wenn sie als Track-Fallback
  // genutzt wurden, sind sie als benannte Punkte interessant.
  const waypoints: RouteWaypoint[] = [];
  for (const w of els(doc, 'wpt')) {
    const lat = parseFloat(w.getAttribute('lat') ?? '');
    const lon = parseFloat(w.getAttribute('lon') ?? '');
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      waypoints.push({ lat, lon, name: firstText(w, 'name') ?? undefined });
    }
  }

  const meta = els(doc, 'metadata')[0];
  return {
    name: (meta && firstText(meta, 'name')) ?? undefined,
    tracks,
    waypoints: waypoints.length ? waypoints : undefined,
  };
}

// ---------------------------------------------------------------------------
// TCX — je <Activity>/<Course> ein Track; <Trackpoint> mit <Position>
// ---------------------------------------------------------------------------
function parseTcx(text: string): ParsedFile {
  const doc = parseXml(text);
  assertRoot(doc, 'TrainingCenterDatabase');
  const tracks: RouteTrack[] = [];

  const readTrackpoints = (root: Element): RoutePoint[] => {
    const points: RoutePoint[] = [];
    for (const tp of els(root, 'Trackpoint')) {
      const pt = ptFromLatLon(
        parseFloat(firstText(tp, 'LatitudeDegrees') ?? ''),
        parseFloat(firstText(tp, 'LongitudeDegrees') ?? ''),
        firstText(tp, 'AltitudeMeters'), firstText(tp, 'Time'),
      );
      if (pt) points.push(pt);
    }
    return points;
  };

  const containers = [...els(doc, 'Activity'), ...els(doc, 'Course')];
  for (const c of containers) {
    const points = readTrackpoints(c);
    if (points.length) {
      tracks.push({ name: firstText(c, 'Name') ?? firstText(c, 'Id') ?? undefined, points });
    }
  }
  if (!tracks.length) {
    const points = readTrackpoints(doc.documentElement);
    if (points.length) tracks.push({ points });
  }

  return { name: firstText(doc, 'Name') ?? undefined, tracks };
}

// ---------------------------------------------------------------------------
// KML — je gx:Track bzw. je LineString ein Track
// ---------------------------------------------------------------------------
function placemarkName(el: Element): string | undefined {
  let cur: Element | null = el;
  while (cur) {
    if (cur.localName === 'Placemark') {
      return firstText(cur, 'name') ?? undefined;
    }
    cur = cur.parentElement;
  }
  return undefined;
}

function parseKml(text: string): ParsedFile {
  const doc = parseXml(text);
  assertRoot(doc, 'kml');
  const tracks: RouteTrack[] = [];

  // 1) gx:Track: <gx:coord>lon lat ele</gx:coord> + parallele <when>-Zeiten.
  for (const track of els(doc, 'Track')) {
    const coords = els(track, 'coord');
    const whens = els(track, 'when');
    const points: RoutePoint[] = [];
    coords.forEach((c, i) => {
      const [lon, lat, ele] = (c.textContent ?? '').trim().split(/\s+/).map(Number);
      const pt = ptFromLatLon(lat, lon, Number.isFinite(ele) ? String(ele) : null, whens[i]?.textContent?.trim() ?? null);
      if (pt) points.push(pt);
    });
    if (points.length) tracks.push({ name: placemarkName(track), points });
  }

  // 2) LineString-<coordinates>: „lon,lat[,ele] lon,lat[,ele] …".
  for (const ls of els(doc, 'LineString')) {
    const coordText = firstText(ls, 'coordinates');
    if (!coordText) continue;
    const points: RoutePoint[] = [];
    for (const tuple of coordText.split(/\s+/)) {
      const [lon, lat, ele] = tuple.split(',').map(Number);
      const pt = ptFromLatLon(lat, lon, Number.isFinite(ele) ? String(ele) : null, null);
      if (pt) points.push(pt);
    }
    if (points.length) tracks.push({ name: placemarkName(ls), points });
  }

  return { name: firstText(doc, 'name') ?? undefined, tracks };
}

// ---------------------------------------------------------------------------
// KMZ — minimaler ZIP-Reader (Central Directory) + DEFLATE über die Browser-
// DecompressionStream-API. Extrahiert die (Haupt-)KML-Datei als Text.
// ---------------------------------------------------------------------------
async function unzipKml(buffer: ArrayBuffer): Promise<string> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const td = new TextDecoder();

  if (buffer.byteLength < 22) throw new Error('KMZ: Datei zu klein für ein ZIP-Archiv.');

  // End of Central Directory (Signatur 0x06054b50) vom Ende her suchen.
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('KMZ: kein gültiges ZIP-Archiv.');

  const entries = view.getUint16(eocd + 10, true);
  let cd = view.getUint32(eocd + 16, true);

  let best: { method: number; offset: number; size: number } | null = null;
  for (let e = 0; e < entries; e++) {
    if (view.getUint32(cd, true) !== 0x02014b50) break;
    const method = view.getUint16(cd + 10, true);
    const compSize = view.getUint32(cd + 20, true);
    const nameLen = view.getUint16(cd + 28, true);
    const extraLen = view.getUint16(cd + 30, true);
    const commentLen = view.getUint16(cd + 32, true);
    const localOff = view.getUint32(cd + 42, true);
    const name = td.decode(bytes.subarray(cd + 46, cd + 46 + nameLen)).toLowerCase();
    if (name.endsWith('.kml')) {
      const isMain = name.endsWith('doc.kml') || !name.includes('/');
      if (!best || isMain) best = { method, offset: localOff, size: compSize };
      if (isMain) break;
    }
    cd += 46 + nameLen + extraLen + commentLen;
  }
  if (!best) throw new Error('KMZ: keine KML-Datei im Archiv gefunden.');

  // Lokalen Header lesen → Datenoffset bestimmen.
  if (view.getUint32(best.offset, true) !== 0x04034b50) throw new Error('KMZ: defekter Archiv-Eintrag.');
  const lhNameLen = view.getUint16(best.offset + 26, true);
  const lhExtraLen = view.getUint16(best.offset + 28, true);
  const dataStart = best.offset + 30 + lhNameLen + lhExtraLen;
  const data = bytes.subarray(dataStart, dataStart + best.size);

  if (best.method === 0) return td.decode(data); // stored
  if (best.method === 8) return td.decode(await inflateRaw(data)); // deflate
  throw new Error('KMZ: nicht unterstützte Komprimierung.');
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
