/**
 * Phase NS (`audit/niederschlagssummen.md` §9.5): „Gefallen" aus Stationsmessungen — `buscosun-data/obs/v1` (Phase OB:
 * DWD 10 min, GeoSphere TAWES, SwissMetNet + Niederschlagsstationen, 26-h-Reihen im 10-min-Takt).
 *
 * Regeln:
 *   · Nur gemessene 10-min-Werte. Fehlt ein Wert im Fenster, ist die Summe UNVOLLSTÄNDIG — die Karte zeigt sie nicht, das
 *     Readout nennt sie als Teilsumme („nur 34 von 36 Werten", E-NS-5); nie wird ein fehlender Wert zu 0.
 *   · Das Fenster endet am jüngsten gemessenen Niederschlagswert der Station („Stand 14:50"), nicht an „jetzt" — die
 *     Netze liefern mit 10–40 min Verzug (Phase OB §1.2).
 *   · Die Station ist nicht der Ort: Name und Abstand stehen immer dabei; weiter als `OBS_SUM_MAX_KM` ⇒ keine Messung.
 *   · Die Reihen reichen 26 h ⇒ 48 h aus Stationen geht nicht (Lücke, benannt).
 *
 * Rein (kein DOM, kein Netz): `verify:precip-sums` prüft es an der echten Datenform (Fixture aus `obs/v1`).
 */

const MIN = 60_000, H = 3_600_000;

/** Weiter weg zählt eine Station nicht als Messung „am Ort" (set; Niederschlag ist kleinräumig — 10 km ≈ zwei Radarzellen-Abstände eines Schauers). */
export const OBS_SUM_MAX_KM = 10;
/** Der jüngste Niederschlagswert darf höchstens so alt sein (set; die langsamsten Netze liefern ≈ 40 min nach dem Stempel). */
export const OBS_SUM_MAX_AGE_MS = 90 * MIN;
/** Länge der 10-min-Reihen im Produkt (`SOURCES.*.windowH` in `scripts/obs/obs-mirror.mjs`). */
export const OBS_SERIES_H = 26;
export const OBS_STEP_MIN = 10;

export interface ObsSeriesDoc {
  schema: 1; kind: 'obs/series'; source: string; t0: string; n: number; step: string;
  stations: Record<string, Record<string, Array<number | null>>>;
}
export interface ObsCatalogStation { id: string; name: string; lat: number; lon: number; elev?: number; country: string; networks?: string[]; vars?: string[] }
export interface ObsLatestStation { t?: string; src?: string; rr1h?: { mm: number; n: number; of: number; complete: boolean }; rr24h?: { mm: number; n: number; of: number; complete: boolean } }

export interface ObsWindowSum {
  stationId: string;
  /** Ende des Fensters = Stempel des jüngsten gemessenen Werts (Ende des 10-min-Intervalls). */
  endMs: number;
  windowH: number;
  /** Summe der vorhandenen Werte (mm). Bei `complete: false` eine Teilsumme. */
  mm: number;
  n: number;
  of: number;
  complete: boolean;
  /** 10-min-Werte des Fensters (null = fehlt), ältester zuerst — für den Balkenstreifen. */
  values: Array<number | null>;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Index des jüngsten nicht-leeren Werts. */
function lastIndex(rr: ReadonlyArray<number | null>): number {
  for (let i = rr.length - 1; i >= 0; i--) if (rr[i] != null && Number.isFinite(rr[i] as number)) return i;
  return -1;
}

/**
 * Summe der letzten `windowH` Stunden aus einer 10-min-Reihe. `null`, wenn die Reihe nichts trägt, der jüngste Wert zu alt
 * ist oder das Fenster länger ist, als die Reihe zurückreicht.
 */
export function obsWindowSumFromSeries(doc: Pick<ObsSeriesDoc, 't0' | 'n'>, stationId: string, rr: ReadonlyArray<number | null> | undefined, windowH: number, nowMs: number): ObsWindowSum | null {
  if (!rr || !rr.length) return null;
  const t0 = Date.parse(doc.t0);
  if (!Number.isFinite(t0)) return null;
  const li = lastIndex(rr);
  if (li < 0) return null;
  const endMs = t0 + li * OBS_STEP_MIN * MIN;
  if (nowMs - endMs > OBS_SUM_MAX_AGE_MS) return null;
  const of = Math.round((windowH * 60) / OBS_STEP_MIN);
  const first = li - of + 1;
  if (first < 0) return null;
  const values = rr.slice(first, li + 1).map((v) => (v == null || !Number.isFinite(v) ? null : v));
  let mm = 0, n = 0;
  for (const v of values) if (v != null) { mm += v; n++; }
  return { stationId, endMs, windowH, mm: Math.round(mm * 100) / 100, n, of, complete: n === of, values };
}

export interface NearStation { station: ObsCatalogStation; distKm: number; src: string }

/**
 * Die nächste Station mit Niederschlagsmessung, deren jüngster Stempel frisch ist (`latest.json`), im Umkreis von
 * `maxKm` — gleich welches Netz (auch reine Niederschlagsstationen). Tagesstationen ohne 10-min-Stempel zählen nicht.
 */
export function nearestRainStation(
  catalog: readonly ObsCatalogStation[], latest: Readonly<Record<string, ObsLatestStation>>,
  lat: number, lon: number, nowMs: number, maxKm = OBS_SUM_MAX_KM,
): NearStation | null {
  let best: NearStation | null = null;
  for (const s of catalog) {
    if (!s.vars?.includes('rr')) continue;
    const l = latest[s.id];
    if (!l?.t || !l.src) continue;
    const t = Date.parse(l.t);
    if (!(nowMs - t <= OBS_SUM_MAX_AGE_MS)) continue;
    if (Math.abs(s.lat - lat) > 0.2 || Math.abs(s.lon - lon) > 0.3) continue;
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d > maxKm) continue;
    if (!best || d < best.distKm) best = { station: s, distKm: d, src: l.src };
  }
  return best;
}

/** Warum es keine gemessene Summe gibt — als Satz für Readout und Legende. */
export function obsGapReason(windowH: number, station: NearStation | null): string {
  if (windowH > OBS_SERIES_H - 1) return `Stationsreihen reichen ${OBS_SERIES_H} h zurück — für ${windowH} h fehlt eine gemessene Quelle`;
  if (!station) return `keine Station mit Niederschlagsmessung im Umkreis von ${OBS_SUM_MAX_KM} km`;
  return `keine vollständigen Werte von ${station.station.name}`;
}

/** Ein Punkt der Karte: Station mit vollständiger Summe (unvollständige zeigt die Karte nicht, E-NS-5). */
export interface StationSumPoint { id: string; name: string; lat: number; lon: number; mm: number; endMs: number }

/**
 * Stationssummen für die Karte — immer aus den Reihen (`series`, je Netz eine Datei), Fenster bis zum jüngsten
 * NIEDERSCHLAGS-Wert der Station. `rr1h`/`rr24h` aus `latest.json` taugen dafür nicht: der Spiegel lässt sie am jüngsten
 * Stempel IRGENDEINER Größe enden; bei DWD-Stationen kommt der Niederschlag (:10/:40) nach Wind/Temperatur, dann fehlt
 * der letzte Wert und die Summe ist „unvollständig" (gemessen 08.10.: 6 von 16 Vergleichen, V-NS-8).
 */
export function stationSumPoints(
  catalog: readonly ObsCatalogStation[], latest: Readonly<Record<string, ObsLatestStation>>,
  series: Readonly<Record<string, ObsSeriesDoc>> | null, windowH: number, nowMs: number,
): StationSumPoint[] {
  const out: StationSumPoint[] = [];
  for (const s of catalog) {
    if (!s.vars?.includes('rr')) continue;
    const l = latest[s.id];
    if (!l?.t || !l.src) continue;
    const doc = series?.[l.src];
    if (!doc) continue;
    const r = obsWindowSumFromSeries(doc, s.id, doc.stations[s.id]?.rr, windowH, nowMs);
    if (r && r.complete) out.push({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, mm: r.mm, endMs: r.endMs });
  }
  return out;
}

/** Netze der Reihen-Dateien (`obs/v1/series/<src>.json`), die 10-min-Niederschlag tragen. */
export const OBS_RR_SERIES = Object.freeze(['dwd10', 'tawes', 'smn', 'smnp'] as const);

export const OBS_NETWORK_LABEL: Record<string, string> = {
  dwd10: 'DWD', tawes: 'GeoSphere TAWES', smn: 'MeteoSchweiz SwissMetNet', smnp: 'MeteoSchweiz',
};

/** Bins eines 10-min-Fensters zu Balken von `binH` Stunden (null, sobald ein Wert im Bin fehlt). */
export function obsBars(sum: ObsWindowSum, binH: number): Array<{ fromMs: number; toMs: number; mm: number | null }> {
  const per = Math.max(1, Math.round((binH * 60) / OBS_STEP_MIN));
  const startMs = sum.endMs - sum.windowH * H;
  const out: Array<{ fromMs: number; toMs: number; mm: number | null }> = [];
  for (let i = 0; i < sum.values.length; i += per) {
    const chunk = sum.values.slice(i, i + per);
    const miss = chunk.some((v) => v == null);
    out.push({
      fromMs: startMs + i * OBS_STEP_MIN * MIN, toMs: startMs + (i + chunk.length) * OBS_STEP_MIN * MIN,
      mm: miss ? null : chunk.reduce<number>((n, v) => n + (v as number), 0),
    });
  }
  return out;
}
