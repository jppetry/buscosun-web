/**
 * 3D-Wetter · Vorhang-Geometrie (3D-Gelände-Modus, pur).
 *
 * Aus den Schnitt-Spalten (Distanz + Geländehöhe) wird ein senkrechter
 * „Vorhang" gebaut, der auf der Geländekarte entlang der Schnittlinie steht:
 * pro Spalte zwei Stützpunkte (unten am Gelände, oben an der Schnitt-Decke
 * `topM`). Die Reihenfolge unten→oben→unten→oben ergibt einen Triangle-Strip.
 *
 * Reine Geometrie in echten Einheiten (Grad / Meter) — keine MapLibre- oder
 * WebGL-Abhängigkeit, headless testbar (Muster wie `sectionGeometry`). Die
 * Projektion in Mercator-/Clip-Koordinaten passiert erst in `CurtainLayer`.
 *
 * Textur-Konvention deckt sich mit `sectionImage` (Zeile 0 = `topM`):
 * `v = 1 − levelM/topM` (oben `v=0`, am Gelände `v=1−terrainM/topM`).
 */

export interface CurtainColumn {
  lon: number;
  lat: number;
  /** Distanz vom Startpunkt entlang der Linie (m). */
  distanceM: number;
  /** Geländehöhe (m ü. NN). */
  terrainM: number;
}

export interface CurtainVertex {
  lon: number;
  lat: number;
  /** Höhe (m ü. NN) — unten = Gelände, oben = topM. */
  altM: number;
  /** Textur-Koordinaten: u entlang der Distanz, v über die Höhe. */
  u: number;
  v: number;
}

/**
 * Baut die Vorhang-Stützpunkte (2 je Spalte, unten dann oben) für einen
 * Triangle-Strip. `topM` ist die Schnitt-Decke (m ü. NN).
 */
export function buildCurtain(columns: CurtainColumn[], topM: number): CurtainVertex[] {
  const out: CurtainVertex[] = [];
  if (columns.length < 2 || topM <= 0) return out;
  const maxDistanceM = columns[columns.length - 1].distanceM || 1;
  for (const col of columns) {
    const u = clamp01(col.distanceM / maxDistanceM);
    const terrainM = Math.max(0, Math.min(col.terrainM, topM));
    // unten: am Gelände; oben: an der Decke.
    out.push({ lon: col.lon, lat: col.lat, altM: terrainM, u, v: 1 - terrainM / topM });
    out.push({ lon: col.lon, lat: col.lat, altM: topM, u, v: 0 });
  }
  return out;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface LineVertex { lon: number; lat: number; altM: number }

/**
 * Windlinien (Streamlines) als Liniensegment-Paare für GL.LINES — dieselbe
 * geländefolgende Logik wie der 2D-Schnitt: mehrere Höhen-Bänder, die über
 * Grate gehoben werden (Orografie), plus Chevrons in Strömungsrichtung.
 * `flowSign` (+1/−1) gibt an, ob der Wind zu wachsender Distanz weht.
 * Reihenfolge: je 2 aufeinanderfolgende Vertices bilden ein Segment.
 */
export function buildStreamlineSegments(
  columns: CurtainColumn[],
  topM: number,
  terrainMinM: number,
  flowSign: number,
  count = 6,
): LineVertex[] {
  const out: LineVertex[] = [];
  const N = columns.length;
  if (N < 2 || topM <= 0 || count < 2) return out;
  const sign = flowSign >= 0 ? 1 : -1;
  const minH = terrainMinM + 250;
  const span = topM - minH - 100;
  const backStep = Math.max(1, Math.round(N * 0.04));

  for (let li = 0; li < count; li++) {
    const f = li / (count - 1);
    const h0 = minH + f * span;
    const clearance = 120 + (1 - f) * 120; // tiefe Linien folgen dem Gelände enger
    const yAt = (i: number) => Math.min(Math.max(h0, columns[i].terrainM + clearance), topM);

    // Polylinie als Segment-Paare.
    for (let i = 0; i < N - 1; i++) {
      out.push({ lon: columns[i].lon, lat: columns[i].lat, altM: yAt(i) });
      out.push({ lon: columns[i + 1].lon, lat: columns[i + 1].lat, altM: yAt(i + 1) });
    }

    // Chevrons in Strömungsrichtung.
    for (let k = 1; k <= 4; k++) {
      const ci = Math.round((k / 5) * (N - 1));
      const bi = ci - sign * backStep;
      if (bi < 0 || bi > N - 1) continue;
      const tipAlt = yAt(ci);
      const tip = { lon: columns[ci].lon, lat: columns[ci].lat, altM: tipAlt };
      const back = columns[bi];
      const wingUp: LineVertex = { lon: back.lon, lat: back.lat, altM: Math.min(topM, tipAlt + 90) };
      const wingDown: LineVertex = { lon: back.lon, lat: back.lat, altM: Math.max(0, tipAlt - 90) };
      out.push({ ...tip }, wingUp);
      out.push({ ...tip }, wingDown);
    }
  }
  return out;
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface CurtainCheck { case: string; ok: boolean; detail: string }

export function verifyCurtainMesh(): { checks: CurtainCheck[]; passed: number; failed: number } {
  const checks: CurtainCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  const cols: CurtainColumn[] = [
    { lon: 11.0, lat: 47.0, distanceM: 0, terrainM: 600 },
    { lon: 11.05, lat: 47.0, distanceM: 5000, terrainM: 1400 },
    { lon: 11.1, lat: 47.0, distanceM: 10000, terrainM: 800 },
  ];
  const topM = 4000;
  const v = buildCurtain(cols, topM);

  add('2 Vertices je Spalte', v.length === cols.length * 2, String(v.length));
  add('unten am Gelände', v[0].altM === 600 && v[2].altM === 1400, `${v[0].altM}/${v[2].altM}`);
  add('oben an der Decke', v[1].altM === topM && v[3].altM === topM, `${v[1].altM}`);
  add('u am Start = 0', v[0].u === 0, String(v[0].u));
  add('u am Ende = 1', v[v.length - 1].u === 1, String(v[v.length - 1].u));
  add('u monoton', v.every((p, i) => i === 0 || p.u >= v[i - 1].u));
  add('v oben = 0', v[1].v === 0 && v[3].v === 0, String(v[1].v));
  add('v unten = 1−terrain/top', Math.abs(v[0].v - (1 - 600 / topM)) < 1e-9, v[0].v.toFixed(3));
  add('v in [0,1]', v.every((p) => p.v >= 0 && p.v <= 1));

  // Entartet: zu wenige Spalten → leeres Mesh, keine Exception.
  add('1 Spalte → leer', buildCurtain([cols[0]], topM).length === 0);
  // Gelände über Decke wird geklemmt.
  const clamped = buildCurtain([{ lon: 0, lat: 0, distanceM: 0, terrainM: 9999 }, cols[1]], topM);
  add('Gelände > topM geklemmt', clamped[0].altM === topM && clamped[0].v === 0, String(clamped[0].altM));

  // Streamlines: gerade Anzahl Vertices (Segment-Paare), alle Höhen in [0,topM].
  const sl = buildStreamlineSegments(cols, topM, 600, 1, 4);
  add('Streamlines vorhanden', sl.length > 0, String(sl.length));
  add('Streamline-Vertices paarig', sl.length % 2 === 0);
  add('Streamline-Höhen in [0,topM]', sl.every((p) => p.altM >= 0 && p.altM <= topM));
  add('Streamlines folgen Linie (lon im Bereich)', sl.every((p) => p.lon >= 11.0 - 1e-9 && p.lon <= 11.1 + 1e-9));
  add('Streamlines leer bei 1 Spalte', buildStreamlineSegments([cols[0]], topM, 600, 1).length === 0);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyCurtainMesh: typeof verifyCurtainMesh }).__verifyCurtainMesh = verifyCurtainMesh;
}
