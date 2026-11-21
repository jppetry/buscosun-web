/**
 * Phase AM — the leg of the trip planner as the page uses it (`audit/seewetter-ausfahrt.md`): loads what `seaTrip.ts`
 * reads (buscosun Fusion at the sample points, the wave and current field of every hour the leg and its two comparison
 * departures touch, the water level at the destination) and hands back the computed view. Nothing is computed here that
 * `seaTrip.ts` does not compute; a value that is not loaded is "keine Daten".
 */
import { useEffect, useMemo, useState } from 'react';
import type { SeaSpot } from './seaContract';
import type { SeaAreas } from './seaClient';
import type { SeaCurrentDoc } from './seaCurrent';
import type { SeaDmiDoc } from './seaDmi';
import type { SeaLimits, SeaUnit } from './seaProfiles';
import type { SeaSightData } from './seaSight';
import type { SeaTextDoc } from './seaText';
import { wlAt, wlDistKm, wlNearestWithCurve, type WlForecast, type WlGauge } from './waterLevel';
import { loadGaugeForecast } from './waterLevelClient';
import { hm } from './seaView';
import {
  SEA_STRAND_WL_MAX, SEA_TRIP_COMPARE_H, SEA_TRIP_WL_KM, tripAreas, tripCompare, tripFindings, tripOfficial, tripPieces, tripRoute, tripRows, tripSamples, tripTimeline,
  type TripAreaHit, type TripCompare, type TripFindings, type TripOfficial, type TripPoint, type TripRoute, type TripRow, type TripSample, type TripStatus, type TripTimeline,
} from './seaTrip';
import { loadTripHour, loadTripWind, sampleKey, tripDataOf, type TripHourFields, type TripWindLoad } from './seaTripData';

const H = 3_600_000;

export interface EtappeState { points: TripPoint[]; speedKn: number; departMs: number }
export interface UseSeaTripIn {
  etappe: EtappeState | null;
  limits: SeaLimits; unit: SeaUnit;
  spots: readonly SeaSpot[]; areas: SeaAreas | null;
  run: { run: string; runMs: number } | null;
  curDoc: SeaCurrentDoc | null; sight: SeaSightData | null | undefined;
  nowMs: number; nowHour: number; nHours: number;
  wodl: SeaTextDoc | null; wodlStale: boolean;
  /** The hour the page shows. */
  validMs: number;
  gauges: readonly WlGauge[]; dmiDoc: SeaDmiDoc | null;
}
export interface EtappeView {
  route: TripRoute; names: { start: string; end: string; way: (string | null)[] };
  timeline: TripTimeline | null; rows: TripRow[];
  pieces: { status: TripStatus; coords: [number, number][] }[];
  findings: TripFindings | null; compare: TripCompare[];
  samples: { n: number; stepKm: number; widened: boolean };
  /** Sample points with an answer of buscosun Fusion, and those without one (outside the cube, switched off, failed). */
  wind: { done: number; total: number; none: number; why: TripWindLoad['why'] };
  areas: TripAreaHit[]; official: TripOfficial[];
  /** The row the page's hour belongs to. */
  sel: number;
  /** Water level at the arrival, in words — only for a destination on a catalogue spot with a level source. */
  level: string | null;
  /** The arrival lies behind the last hour with values. */
  beyond: boolean;
}

const nameOf = (p: TripPoint | undefined, spots: readonly SeaSpot[]): string | null => (p?.spot ? spots.find((s) => s.id === p.spot)?.name ?? null : null);

export function useSeaTrip(x: UseSeaTripIn): EtappeView | null {
  const { etappe, spots } = x;
  const route = useMemo(() => (etappe ? tripRoute(etappe.points) : null), [etappe?.points]); // eslint-disable-line react-hooks/exhaustive-deps
  const sampled = useMemo(() => (route ? tripSamples(route) : null), [route]);
  const samples: readonly TripSample[] = sampled?.samples ?? [];
  const timeline = useMemo(() => (route && etappe ? tripTimeline(route, etappe.speedKn, etappe.departMs) : null), [route, etappe?.speedKn, etappe?.departMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const axis = useMemo(() => ({ fromMs: x.nowHour, toMs: x.nowHour + Math.max(0, x.nHours - 1) * H }), [x.nowHour, x.nHours]);

  // Phase BS: a leg that starts or ends at a lake spot is a leg on that lake — buscosun Fusion is asked with the country
  // parameters of that spot (a shore outside DE/AT/CH: the nearest of the three, the catalogue names it). Elsewhere Germany.
  const tripCountry = useMemo(() => {
    const ends = etappe ? [etappe.points[0], etappe.points[etappe.points.length - 1]] : [];
    for (const p of ends) { const sp = p?.spot ? spots.find((s) => s.id === p.spot) : null; if (sp?.lake) return sp.lake.fusion.country; }
    return 'DE' as const;
  }, [etappe?.points, spots]); // eslint-disable-line react-hooks/exhaustive-deps
  // --- wind: buscosun Fusion at every sample point, one after the other ---------------------------------------------
  const [wind, setWind] = useState<ReadonlyMap<string, TripWindLoad>>(new Map());
  const sampleKeys = samples.map(sampleKey).join('|');
  useEffect(() => {
    if (!samples.length) return;
    let alive = true;
    for (const s of samples) {
      void loadTripWind(s, tripCountry).then((r) => { if (alive) setWind((m) => (m.get(sampleKey(s)) === r ? m : new Map(m).set(sampleKey(s), r))); });
    }
    return () => { alive = false; };
  }, [sampleKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- wave and current: the fields of every hour the leg and the two other departures read -------------------------
  const hoursWanted = useMemo(() => {
    if (!route || !etappe) return [] as number[];
    const set = new Set<number>();
    for (const d of [-SEA_TRIP_COMPARE_H, 0, SEA_TRIP_COMPARE_H]) {
      const tl = tripTimeline(route, etappe.speedKn, etappe.departMs + d * H);
      for (const s of tl?.stops ?? []) if (s.hourMs >= axis.fromMs && s.hourMs <= axis.toMs + H) set.add(s.hourMs);
    }
    return [...set].sort((a, b) => a - b);
  }, [route, etappe?.speedKn, etappe?.departMs, axis]); // eslint-disable-line react-hooks/exhaustive-deps
  const fieldsKey = `${x.run?.run ?? '-'}|${x.curDoc?.run ?? '-'}`;
  const [fields, setFields] = useState<{ key: string; hours: ReadonlyMap<number, TripHourFields> }>({ key: fieldsKey, hours: new Map() });
  const hoursKey = hoursWanted.join(',');
  useEffect(() => {
    if (!hoursWanted.length) return;
    const ac = new AbortController();
    setFields((f) => (f.key === fieldsKey ? f : { key: fieldsKey, hours: new Map() }));
    for (const hourMs of hoursWanted) {
      void loadTripHour({ run: x.run?.run ?? null, runMs: x.run?.runMs ?? null, curDoc: x.curDoc, hourMs, signal: ac.signal }).then((r) => {
        if (ac.signal.aborted) return;
        setFields((f) => (f.key !== fieldsKey ? f : { key: f.key, hours: new Map(f.hours).set(hourMs, r) }));
      }, () => {});
    }
    return () => ac.abort();
  }, [hoursKey, fieldsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo(() => tripDataOf({ samples, wind, hours: fields.key === fieldsKey ? fields.hours : new Map(), spots, sight: x.sight, runMs: x.run?.runMs ?? null, nowMs: x.nowMs }),
    [sampleKeys, wind, fields, fieldsKey, spots, x.sight, x.run?.runMs, x.nowMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- water level at the arrival: only a destination on a catalogue spot with a level source ------------------------
  const dest = etappe && etappe.points.length > 1 ? etappe.points[etappe.points.length - 1] : null;
  const destSpot = dest?.spot ? spots.find((s) => s.id === dest.spot) ?? null : null;
  const destGauge = useMemo(() => {
    if (!destSpot || destSpot.dk?.wl?.from === 'dmi' || !x.gauges.length) return null;
    const wl = destSpot.dk?.wl;
    const named = wl?.from === 'bsh' ? x.gauges.find((g) => g.id === wl.gauge) : null;
    if (named) return { gauge: named, km: wlDistKm(destSpot.lat, destSpot.lon, named.lat, named.lon) };
    const near = wlNearestWithCurve(x.gauges, destSpot.lat, destSpot.lon);
    return near && near.km <= SEA_TRIP_WL_KM ? near : null;
  }, [destSpot, x.gauges]);
  const [gaugeDoc, setGaugeDoc] = useState<WlForecast | null>(null);
  const destGaugeId = destGauge?.gauge.id ?? null;
  useEffect(() => {
    setGaugeDoc(null);
    if (!destGaugeId) return;
    const ac = new AbortController();
    loadGaugeForecast(destGaugeId, ac.signal).then((d) => { if (!ac.signal.aborted) setGaugeDoc(d); }, () => {});
    return () => ac.abort();
  }, [destGaugeId]);

  return useMemo(() => {
    if (!etappe || !route) return null;
    const names = { start: nameOf(etappe.points[0], spots) ?? 'Start', end: nameOf(dest ?? undefined, spots) ?? 'Ziel', way: etappe.points.map((p) => nameOf(p, spots)) };
    const rows = timeline ? tripRows(timeline, samples, data, x.limits, names) : [];
    const loads = samples.map((s) => wind.get(sampleKey(s)));
    const none = loads.filter((l) => l && !l.series);
    let sel = rows.findIndex((r) => r.stop.hourMs === x.validMs);
    if (sel < 0 && rows.length) sel = x.validMs < rows[0].stop.hourMs ? 0 : rows.length - 1;
    let level: string | null = null;
    if (timeline && destSpot) {
      const at = `bei Ankunft (${hm(timeline.arriveMs)} Uhr)`;
      if (destSpot.dk?.wl?.from === 'dmi') {
        const e = x.dmiDoc?.wl.spots[destSpot.id], i = e ? Math.round((Math.round(timeline.arriveMs / H) * H - e.t0) / H) : -1;
        const cm = e && i >= 0 ? e.cm[i] ?? null : null;
        if (e) level = cm == null ? `Wasserstand in ${destSpot.name}: das Modell des DMI reicht nicht bis zur Ankunft.` : `Wasserstand in ${destSpot.name} ${at}: ${cm > 0 ? '+' : cm < 0 ? '−' : ''}${Math.abs(cm)} cm gegen das Mittelwasser des Modells (Sturmflutmodell des DMI)`;
      } else if (destGauge && gaugeDoc && gaugeDoc.id === destGauge.gauge.id && gaugeDoc.curve.length > 0) {
        const pt = wlAt(gaugeDoc.curve, timeline.arriveMs), cm = pt?.forecast ?? pt?.measured ?? pt?.tide ?? null;
        const where = `Wasserstand am Pegel ${gaugeDoc.name} (${destGauge.km.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km von ${destSpot.name})`;
        level = cm == null ? `${where}: die Kurve reicht nicht bis zur Ankunft.` : `${where} ${at}: ${Math.round(cm)} cm über Pegelnull (${pt?.forecast != null ? 'Kurve des BSH' : pt?.measured != null ? 'gemessen' : 'nur Gezeit'})`;
      }
    }
    const hits = x.areas ? tripAreas(route, x.areas.features) : [];
    return {
      route, names, timeline, rows,
      pieces: rows.length ? tripPieces(route, rows) : route.legs.length ? [{ status: 'missing' as const, coords: route.points.map((p) => [p.lon, p.lat] as [number, number]) }] : [],
      findings: timeline && rows.length ? tripFindings(rows, timeline, x.limits, x.unit, dest) : null,
      compare: timeline ? tripCompare(route, etappe.speedKn, etappe.departMs, samples, data, x.limits, x.unit, axis) : [],
      samples: { n: samples.length, stepKm: sampled?.stepKm ?? 0, widened: !!sampled?.widened },
      wind: { done: loads.filter(Boolean).length, total: samples.length, none: none.length, why: none[0]?.why ?? null },
      areas: hits, official: tripOfficial(hits, x.wodl, x.wodlStale),
      sel, level, beyond: !!timeline && Math.round(timeline.arriveMs / H) * H > axis.toMs,
    };
  }, [etappe, route, timeline, sampleKeys, data, wind, x.limits, x.unit, x.validMs, x.areas, x.wodl, x.wodlStale, axis, destSpot, destGauge, gaugeDoc, x.dmiDoc, spots]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Strand: the water level per spot, where the gauge catalogue names a gauge WITH a curve within `SEA_TRIP_WL_KM`
 * (E-AM-13). One read per gauge, `SEA_STRAND_WL_MAX` gauges at most; a spot without such a gauge has no entry.
 */
export function useStrandLevels(spots: readonly Pick<SeaSpot, 'id' | 'lat' | 'lon'>[], gauges: readonly WlGauge[], on: boolean, tMs: number): ReadonlyMap<string, string> {
  const pairs = useMemo(() => {
    if (!on || !gauges.length) return [] as { spot: string; gauge: WlGauge; km: number }[];
    const out: { spot: string; gauge: WlGauge; km: number }[] = [];
    for (const s of spots) { const g = wlNearestWithCurve(gauges, s.lat, s.lon); if (g && g.km <= SEA_TRIP_WL_KM) out.push({ spot: s.id, gauge: g.gauge, km: g.km }); }
    return out;
  }, [spots, gauges, on]);
  const ids = useMemo(() => [...new Set(pairs.map((p) => p.gauge.id))].slice(0, SEA_STRAND_WL_MAX), [pairs]);
  const [docs, setDocs] = useState<ReadonlyMap<string, WlForecast>>(new Map());
  const idsKey = ids.join(',');
  useEffect(() => {
    if (!ids.length) return;
    const ac = new AbortController();
    for (const id of ids) void loadGaugeForecast(id, ac.signal).then((d) => { if (d && !ac.signal.aborted) setDocs((m) => new Map(m).set(id, d)); }, () => {});
    return () => ac.abort();
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const out = new Map<string, string>();
    for (const p of pairs) {
      const d = docs.get(p.gauge.id);
      if (!d || !d.curve.length) continue;
      const pt = wlAt(d.curve, tMs), cm = pt?.forecast ?? pt?.measured ?? pt?.tide ?? null;
      if (cm != null) out.set(p.spot, `Pegel ${d.name.split(',')[0]} ${Math.round(cm)} cm über Pegelnull`);
    }
    return out;
  }, [pairs, docs, tMs]);
}
