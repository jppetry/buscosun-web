/**
 * AW-8 — View model of the hazard rail and the detail view (pure, verified without a browser by `verify:road-ui`):
 * rows per group in the fixed order of the specification, the window (now / bis +6 h / one hour), filter chips, the
 * matrix cells, the labels of the icons and forms, the detail models (cross-section, timetable, bullets, wind).
 */
import type { RoadH24File, RoadPoint } from './roadContract';
import { roadStampToMs } from './roadContract';
import type { RoadCorridor } from './roadClient';
import type { RoadSegment } from './roadSegments';
import {
  ROAD_HAZARD_BY_ID, ROAD_HAZARD_GROUPS, ROAD_HAZARD_RANK, ROAD_HZ_HOURS, ROAD_HZ_T, roadHzSummary, COND, condWet,
  type HzEntry, type RoadEvidence, type RoadHazardGroup, type RoadHazardId, type RoadHzFile, type RoadLevel,
} from './roadHazards';
import type { RoadHzMode, RoadTime } from './roadState';
import { hm } from './roadView';

export const HZ_SHORT: Readonly<Record<RoadHazardId, string>> = Object.freeze({
  reif: 'Reifglätte', nass: 'Überfrierende Nässe', glatteis: 'Gefrierender Regen', schnee: 'Schneeglätte', aqua: 'Aquaplaning',
  nebel: 'Nebel', gischt: 'Gischt', sonne: 'Tiefe Sonne', quer: 'Seitenwind, Böen', baum: 'Bäume, Teile', staub: 'Staub, Sand',
  gewitter: 'Gewitter', hagel: 'Hagel', blowup: 'Blow-up Beton', frost1: 'Erster Frost', sturz: 'Temperatursturz',
});
/** Group icons (24 × 24 stroke paths of the boards). */
export const HZ_GROUP_ICON: Readonly<Record<RoadHazardGroup, string>> = Object.freeze({
  glaette: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5',
  aqua: 'M12 3.5c-2.8 3.4-4.5 5.8-4.5 8a4.5 4.5 0 0 0 9 0c0-2.2-1.7-4.6-4.5-8zM3 20.5c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0',
  sicht: 'M3 7h13M6 11h15M3 15h12M8 19h10',
  wind: 'M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7',
  gewitter: 'M13 2L5 13h6l-1 9 8-11h-6z',
  hitze: 'M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0zM12 9.5v7',
  wechsel: 'M6 4v13M2.5 13.5L6 17l3.5-3.5M13 5h8M13 10h6M13 15h4M13 20h2',
});
export const HZ_FEATURE_ICON = Object.freeze({
  bridge: 'M3 17h18M5 17v-4a7 7 0 0 1 14 0v4M9 17v-3M15 17v-3', grade: 'M3 19L21 7M14 7h7v7',
  forest: 'M8 3l-4.5 9h3L3 18h10l-3.5-6h3zM15.5 21v-3M8 21v-3M17 5l-3.5 7h2.5l-3 6h8l-3-6h2.5z', exposed: 'M12 2.5l3 7h-6zM12 9.5V21.5M7 17h10',
  lowland: 'M2 16c3-2 5-2 8 0s5 2 8 0 3-1 4-1M2 20c3-2 5-2 8 0s5 2 8 0', concrete: 'M3 6h18v12H3zM3 12h18M9 6v6M15 12v6',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v6M12 7.5v.5',
});
export const EV_LABEL: Readonly<Record<RoadEvidence | 'u', string>> = Object.freeze({ m: 'gemessen', d: 'abgeleitet', p: 'Prognose', u: 'keine gültige Messung' });
/** Row subtitle of an unknown-only entry: the gap is named, not the first hazard the gap happens to fall on (reif by rank). */
export const HZ_UNKNOWN_SUB = 'Fahrbahnmessung fehlt';
const EV_RANK: Record<string, number> = { m: 3, d: 2, p: 1, '-': 0 };

/** Hour indices of a window. */
export function windowOf(mode: RoadHzMode): [number, number] {
  if (mode === 'now') return [0, 0];
  if (mode === 'p6') return [0, ROAD_HZ_HOURS - 1];
  return [mode, mode];
}
export function windowLabel(mode: RoadHzMode, hours: readonly number[]): string {
  if (mode === 'now') return `jetzt · ${hm(hours[0])}`;
  if (mode === 'p6') return `jetzt bis +6 h · ${hm(hours[0])}–${hm(hours[ROAD_HZ_HOURS - 1])}`;
  return `um ${hm(hours[mode])} (+${mode} h)`;
}

export interface HzBest { id: RoadHazardId; lv: RoadLevel | null; ev: RoadEvidence | null; hour: number }
/** The deciding hazard of an entry in the window: highest level, then measured before derived before forecast, then rank. */
export function bestInWindow(e: HzEntry, win: [number, number], group: RoadHazardGroup | null = null): HzBest | null {
  let best: HzBest | null = null;
  let unknown: HzBest | null = null;
  for (const [hid, lv] of Object.entries(e.lv)) {
    const def = ROAD_HAZARD_BY_ID[hid as RoadHazardId];
    if (!def || (group && def.group !== group)) continue;
    for (let i = win[0]; i <= win[1]; i++) {
      const l = lv[i];
      const ev = (e.ev[hid as RoadHazardId]?.[i] ?? '-') as RoadEvidence | '-';
      if (l === null) { if (!unknown) unknown = { id: def.id, lv: null, ev: null, hour: i }; continue; }
      if (l >= 1 && (!best || l > best.lv! || (l === best.lv && (EV_RANK[ev] > EV_RANK[best.ev ?? '-'] || (EV_RANK[ev] === EV_RANK[best.ev ?? '-'] && ROAD_HAZARD_RANK[def.id] < ROAD_HAZARD_RANK[best.id]))))) best = { id: def.id, lv: l, ev: ev === '-' ? null : ev, hour: i };
    }
  }
  return best ?? unknown;
}

export interface HzRow {
  segId: string;
  seg: RoadSegment;
  best: HzBest;
  /** Other hazards with a level in the window, by rank. */
  also: RoadHazardId[];
  strip: Array<RoadLevel | null>;
  /** "jetzt · bis 10:15" / "ab 08:15 · bis 10:15". */
  when: string;
  sub: string;
  dir: 0 | 1 | null;
  group: RoadHazardGroup;
  sortKey: number;
}
export interface HzGroupRows { group: RoadHazardGroup; label: string; icon: string; rows: HzRow[]; unknown: number }

const dirText = (seg: RoadSegment, dir: 0 | 1 | null): string => (dir == null ? 'beide Richtungen' : dir === 0 ? `Richtung ${seg.to}` : `Richtung ${seg.from}`);

export function whenText(lv: Array<RoadLevel | null>, hours: readonly number[]): string {
  let from = -1, to = -1;
  lv.forEach((l, i) => { if ((l ?? 0) >= 1) { if (from < 0) from = i; to = i; } });
  if (from < 0) return lv.some((l) => l === null) ? 'Eingang fehlt' : '';
  const start = from === 0 ? 'jetzt' : `ab ${hm(hours[from])}`;
  return to === ROAD_HZ_HOURS - 1 ? `${start} · über +6 h hinaus` : to === from ? (from === 0 ? 'nur jetzt' : `um ${hm(hours[from])}`) : `${start} · bis ${hm(hours[to])}`;
}

/** Rows per group in the fixed order, sorted by level, evidence, rank; unknown rows last. */
export function hzGroupRows(file: RoadHzFile, segs: ReadonlyMap<string, RoadSegment>, mode: RoadHzMode, filter: RoadHazardGroup | null): HzGroupRows[] {
  const win = windowOf(mode);
  const out: HzGroupRows[] = [];
  for (const g of ROAD_HAZARD_GROUPS) {
    if (filter && g.id !== filter) continue;
    const rows: HzRow[] = [];
    for (const [id, e] of Object.entries(file.seg)) {
      const seg = segs.get(id);
      if (!seg) continue;
      const best = bestInWindow(e, win, g.id);
      if (!best) continue;
      const also = (Object.keys(e.lv) as RoadHazardId[]).filter((h) => h !== best.id && ROAD_HAZARD_BY_ID[h] && (e.lv[h] ?? []).slice(win[0], win[1] + 1).some((l) => (l ?? 0) >= 1)).sort((a, b) => ROAD_HAZARD_RANK[a] - ROAD_HAZARD_RANK[b]);
      const lv = e.lv[best.id] ?? [];
      const dir = best.id === 'sonne' ? (e.dir?.sonne ?? null) : null;
      rows.push({
        segId: id, seg, best, also, strip: Array.from({ length: ROAD_HZ_HOURS }, (_, i) => lv[i] ?? null),
        when: whenText(lv, file.hours), sub: `${best.lv === null ? HZ_UNKNOWN_SUB : HZ_SHORT[best.id]} · km ${Math.round(seg.kmFrom)}–${Math.round(seg.kmTo)} · ${dirText(seg, dir)}`, dir, group: g.id,
        sortKey: best.lv === null ? -1 : best.lv * 100 + EV_RANK[best.ev ?? '-'] * 10 + (16 - ROAD_HAZARD_RANK[best.id]),
      });
    }
    rows.sort((a, b) => b.sortKey - a.sortKey || a.seg.road.localeCompare(b.seg.road, 'de', { numeric: true }) || a.seg.kmFrom - b.seg.kmFrom);
    out.push({ group: g.id, label: g.label, icon: HZ_GROUP_ICON[g.id], rows, unknown: rows.filter((r) => r.best.lv === null).length });
  }
  return out;
}

/** Segments with a level or an unknown in the window, per group (chip counters) and overall. */
export function hzCounts(file: RoadHzFile, mode: RoadHzMode): { byGroup: Record<RoadHazardGroup, number>; all: number } {
  const win = windowOf(mode);
  const byGroup = Object.fromEntries(ROAD_HAZARD_GROUPS.map((g) => [g.id, 0])) as Record<RoadHazardGroup, number>;
  let all = 0;
  for (const e of Object.values(file.seg)) {
    let any = false;
    for (const g of ROAD_HAZARD_GROUPS) if (bestInWindow(e, win, g.id)) { byGroup[g.id]++; any = true; }
    if (any) all++;
  }
  return { byGroup, all };
}

export interface HzMatrixCell { group: RoadHazardGroup; hour: number; n: number; max: RoadLevel; unknown: number }
export function hzMatrix(file: RoadHzFile): HzMatrixCell[][] {
  const s = roadHzSummary(file);
  return ROAD_HAZARD_GROUPS.map((g) => s.matrix[g.id].map((c, i) => ({ group: g.id, hour: i, n: c.n, max: c.max, unknown: c.unknown })));
}

/** Ordered ids of the rows shown (the detail's "n / N" and prev/next). */
export const rowOrder = (groups: readonly HzGroupRows[]) => { const out: string[] = []; for (const g of groups) for (const r of g.rows) if (!out.includes(r.segId)) out.push(r.segId); return out; };

/** Map colour of a segment in the window with the filter: highest level, or dotted grey when unknown only. */
export function segMapState(e: HzEntry | undefined, mode: RoadHzMode, filter: RoadHazardGroup | null): { lv: RoadLevel; unknown: boolean } {
  if (!e) return { lv: 0, unknown: false };
  const win = windowOf(mode);
  let lv: RoadLevel = 0, unknown = false;
  for (const [hid, arr] of Object.entries(e.lv)) {
    const def = ROAD_HAZARD_BY_ID[hid as RoadHazardId];
    if (!def || (filter && def.group !== filter)) continue;
    for (let i = win[0]; i <= win[1]; i++) { const l = arr[i]; if (l === null) unknown = true; else if (l > lv) lv = l; }
  }
  return { lv, unknown };
}

// --- Detail ----------------------------------------------------------------------------------------

export type SurfaceKind = 'reif' | 'eis' | 'schnee' | 'nass' | 'feucht' | 'trocken' | 'unbekannt' | 'nichtgemessen';
export interface CrossSection {
  kind: SurfaceKind;
  label: string;
  roadText: string;
  air: string; dew: string; rh: string; src: string;
  filmMm: number;
  /** The station that carries the section (coldest valid road), or null. */
  station: RoadPoint | null;
}
export function crossSectionOf(seg: RoadSegment, byId: ReadonlyMap<string, RoadPoint>, slotMs: number | null, fusion: string | null, airFc: { t: number | null; td: number | null } | null): CrossSection {
  const sts = [...seg.stations, ...seg.near].map((id) => byId.get(id)).filter((p): p is RoadPoint => !!p);
  const valid = sts.filter((p) => p.rs != null).sort((a, b) => (a.rs as number) - (b.rs as number));
  const st = valid[0] ?? sts.find((p) => p.ta != null) ?? null;
  const f1 = (v: number) => (Math.abs(v) < 0.05 ? '±0,0' : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1).replace('.', ','));
  const rejected = sts.some((p) => p.rs == null && p.x && 'rs' in p.x);
  let kind: SurfaceKind = 'nichtgemessen';
  if (st && st.rs != null) {
    const c = st.cond;
    kind = c === COND.frost ? 'reif' : c === COND.ice || c === COND.slippery ? 'eis' : c === COND.snow ? 'schnee' : c === COND.wet || (st.wf != null && st.wf >= 0.2) ? 'nass' : condWet(c) || (st.wf != null && st.wf > 0) ? 'feucht' : c === COND.dry ? 'trocken' : 'unbekannt';
  } else if (rejected) kind = 'unbekannt';
  const film = st?.wf ?? 0;
  const label: Record<SurfaceKind, string> = {
    reif: 'Reif (Sensor)', eis: 'Eis (Sensor)', schnee: 'Schnee (Sensor)', nass: `Wasserfilm ${film.toFixed(2).replace('.', ',')} mm`, feucht: `feucht · Film ${film.toFixed(2).replace('.', ',')} mm`,
    trocken: 'trocken (Sensor)', unbekannt: 'Zustand unbekannt', nichtgemessen: 'Zustand nicht gemessen',
  };
  const air = st?.ta != null ? `Luft ${f1(st.ta)} °C` : airFc?.t != null ? `Luft ${f1(airFc.t)} °C (Prognose)` : 'Luft —';
  const dew = st?.td != null ? `Taupunkt ${f1(st.td)} °C` : airFc?.td != null ? `Taupunkt ${f1(airFc.td)} °C (Prognose)` : 'Taupunkt —';
  return {
    kind, label: label[kind], roadText: st && st.rs != null ? `Fahrbahn ${f1(st.rs)} °C` : rejected ? 'Fahrbahn: Sensor verworfen' : 'Fahrbahn: keine Messung',
    air, dew, rh: st?.rh != null ? `${Math.round(st.rh)} % rel. Feuchte` : '— % rel. Feuchte', filmMm: film,
    src: st ? `GMA ${st.n} · ${slotMs != null ? hm(slotMs) : hm(st.t)}` : fusion ? `Prognose · ${fusion}` : 'keine Messung', station: st,
  };
}

/** Timetable rows (−2 … +6 h): the hazards of the entry; past hours from the earlier slots (`null` = not kept). */
export interface PlanCell { lv: RoadLevel | null | undefined; ev: RoadEvidence | null }
export function planRows(e: HzEntry, prev: ReadonlyArray<HzEntry | null | undefined>): Array<{ id: RoadHazardId; cells: PlanCell[] }> {
  const ids = (Object.keys(e.lv) as RoadHazardId[]).filter((id) => ROAD_HAZARD_BY_ID[id]).sort((a, b) => ROAD_HAZARD_RANK[a] - ROAD_HAZARD_RANK[b]);
  return ids.map((id) => {
    const cells: PlanCell[] = [];
    for (const k of [1, 0]) { const p = prev[k]; const l = p?.lv[id]?.[0]; cells.push({ lv: p === undefined || p === null ? undefined : l === undefined ? 0 : l, ev: (p?.ev[id]?.[0] ?? null) as RoadEvidence | null }); }
    for (let i = 0; i < ROAD_HZ_HOURS; i++) cells.push({ lv: e.lv[id]?.[i] ?? null, ev: ((e.ev[id]?.[i] ?? '-') === '-' ? null : e.ev[id]![i]) as RoadEvidence | null });
    return { id, cells };
  });
}

/** Bullet rows (Messgrößen gegen Schwellen): value, forecast marker, the level cuts — the axis runs "ungünstig = rechts". */
export interface BulletRow { id: string; label: string; lo: number; hi: number; cuts: readonly number[]; value: number | null; fc: number | null; valueText: string; fcText: string }
export function bulletRows(xs: CrossSection, seg: RoadSegment, fcHours: ReadonlyArray<{ fx: number | null; dd: number | null; vis: number | null } | null>): BulletRow[] {
  const st = xs.station;
  const cross = (gustKmh: number, dir: number | null) => (dir == null || !seg.bearings.length ? gustKmh : Math.max(...seg.bearings.map((b) => gustKmh * Math.abs(Math.sin(((dir - b) * Math.PI) / 180)))));
  const gustNow = st?.wg != null ? Math.round(st.wg * 3.6) : null;
  const crossNow = gustNow != null ? Math.round(cross(gustNow, st?.wd ?? null)) : null;
  let crossFc: number | null = null, visFc: number | null = null;
  for (const h of fcHours) {
    if (!h) continue;
    if (h.fx != null) { const c = Math.round(cross(h.fx * 3.6, h.dd)); if (crossFc == null || c > crossFc) crossFc = c; }
    if (h.vis != null && (visFc == null || h.vis < visFc)) visFc = h.vis;
  }
  const visTxt = (v: number) => (v < 1000 ? `${Math.round(v)} m` : `${(v / 1000).toFixed(1).replace('.', ',')} km`);
  const f1 = (v: number) => (Math.abs(v) < 0.05 ? '±0,0' : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1).replace('.', ','));
  return [
    { id: 'rs', label: 'Fahrbahntemperatur', lo: 6, hi: -6, cuts: [ROAD_HZ_T.nass.l1Tf, ROAD_HZ_T.reif.l1Tf, ROAD_HZ_T.reif.l2Tf], value: st?.rs ?? null, fc: null, valueText: st?.rs != null ? `${f1(st.rs)} °C` : '—', fcText: 'keine Fahrbahnprognose (Gate D)' },
    { id: 'wf', label: 'Wasserfilm', lo: 0, hi: 3, cuts: ROAD_HZ_T.aqua.filmMm, value: st?.wf ?? null, fc: null, valueText: st?.wf != null ? `${st.wf.toFixed(2).replace('.', ',')} mm` : '—', fcText: 'keine Prognose' },
    { id: 'vis', label: 'Sichtweite', lo: 600, hi: 0, cuts: ROAD_HZ_T.nebel.visM, value: st?.vis != null ? Math.min(600, st.vis) : null, fc: visFc != null ? Math.min(600, visFc) : null, valueText: st?.vis != null ? visTxt(st.vis) : '—', fcText: visFc != null ? `Prognose min. ${visTxt(visFc)} (MOSMIX)` : 'keine Sichtprognose' },
    { id: 'quer', label: 'Böe quer zur Fahrbahn', lo: 0, hi: 100, cuts: ROAD_HZ_T.quer.crossKmh, value: crossNow, fc: crossFc, valueText: crossNow != null ? `${crossNow} km/h` : '—', fcText: crossFc != null ? `Prognose max. ${crossFc} km/h` : 'keine Prognose' },
  ];
}

/** Wind sectors (8): the strongest gust (km/h) whose direction falls in the sector, now and the forecast hours; colour = cross level. */
export interface WindSector { sector: string; deg: number; gust: number; lv: RoadLevel }
export function windSectors(seg: RoadSegment, st: RoadPoint | null, fcHours: ReadonlyArray<{ fx: number | null; dd: number | null } | null>): { sectors: WindSector[]; axisDeg: number; nowDeg: number | null; nowGust: number | null; fcMax: number | null } {
  const names = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  const axisDeg = seg.bearings.length ? seg.bearings[Math.floor(seg.bearings.length / 2)] : 0;
  const cross = (g: number, d: number) => Math.max(...(seg.bearings.length ? seg.bearings : [axisDeg]).map((b) => g * Math.abs(Math.sin(((d - b) * Math.PI) / 180))));
  const gusts: Array<[number, number]> = [];
  if (st?.wg != null && st.wd != null) gusts.push([st.wg * 3.6, st.wd]);
  for (const h of fcHours) if (h?.fx != null && h.dd != null) gusts.push([h.fx * 3.6, h.dd]);
  const sectors = names.map((n, i) => {
    const deg = i * 45;
    let gust = 0;
    for (const [g, d] of gusts) if (Math.abs((((d - deg) % 360) + 540) % 360 - 180) >= 157.5) gust = Math.max(gust, g);
    const c = cross(gust, deg);
    const lv: RoadLevel = c >= ROAD_HZ_T.quer.crossKmh[2] ? 3 : c >= ROAD_HZ_T.quer.crossKmh[1] ? 2 : c >= ROAD_HZ_T.quer.crossKmh[0] ? 1 : 0;
    return { sector: n, deg, gust: Math.round(gust), lv };
  });
  const fcMax = fcHours.reduce<number | null>((m, h) => (h?.fx != null ? Math.max(m ?? 0, h.fx * 3.6) : m), null);
  return { sectors, axisDeg, nowDeg: st?.wd ?? null, nowGust: st?.wg != null ? Math.round(st.wg * 3.6) : null, fcMax: fcMax != null ? Math.round(fcMax) : null };
}

/** Site features for the list (title, detail, icon key). */
export function featureRows(seg: RoadSegment): Array<{ icon: keyof typeof HZ_FEATURE_ICON; t: string; d: string }> {
  const f = seg.f;
  const out: Array<{ icon: keyof typeof HZ_FEATURE_ICON; t: string; d: string }> = [];
  if (f.bridges.length) out.push({ icon: 'bridge', t: `${f.bridges.length === 1 ? 'Brücke' : `${f.bridges.length} Brücken`}${f.bridges[0].name ? ` · ${f.bridges[0].name}` : ''} (km ${f.bridges.map((b) => Math.round(b.km[0])).slice(0, 3).join(', ')})`, d: 'Brücken kühlen schneller aus und sind dem Wind stärker ausgesetzt — dort steht keine Messung (OpenStreetMap, ODbL).' });
  if (f.grade && f.grade.pct >= 4) out.push({ icon: 'grade', t: `Steigung ${f.grade.pct.toFixed(1).replace('.', ',')} % zwischen km ${Math.round(f.grade.km[0])} und ${Math.round(f.grade.km[1])}`, d: 'Steilster 1-km-Abschnitt der Achse (Terrarium-Höhenmodell); Lkw können an Steigungen hängen bleiben.' });
  if ((f.forest ?? 0) >= 0.3) out.push({ icon: 'forest', t: `Wald an ${Math.round((f.forest ?? 0) * 100)} % der Strecke`, d: 'Schattenlage im 50-m-Band (ESA WorldCover 2021) — die Fahrbahn bleibt länger kalt, Bäume stehen nah an der Fahrbahn.' });
  if ((f.cutting ?? 0) >= 0.2) out.push({ icon: 'forest', t: `Einschnitt an ${Math.round((f.cutting ?? 0) * 100)} % der Strecke`, d: 'Schattenlage (OpenStreetMap `cutting`).' });
  if ((f.embankment ?? 0) > 0.05) out.push({ icon: 'exposed', t: `Dammlage an ${Math.round((f.embankment ?? 0) * 100)} % der Strecke`, d: 'Dem Wind ausgesetzt; Schwellen für Seitenwind um 10 km/h niedriger (OpenStreetMap `embankment`).' });
  if (f.exposed) out.push({ icon: 'exposed', t: 'Freie Lage', d: 'Wenig Wald, kein Einschnitt, über der Umgebung — Wind greift ungebremst.' });
  if (f.lowland) out.push({ icon: 'lowland', t: 'Niederung', d: 'Ein Stützpunkt liegt in einer Mulde oder einem Tal (TPI 2 km ≤ −30 m) — Kaltluft und Nebel halten sich länger.' });
  if ((f.concrete ?? 0) >= 0.2) out.push({ icon: 'concrete', t: `Betonbelag an ${Math.round((f.concrete ?? 0) * 100)} % der Strecke`, d: 'Aufwölbung bei Hitze möglich (OpenStreetMap `surface=concrete`).' });
  if (f.h) out.push({ icon: 'info', t: `Höhe ${f.h[1]}–${f.h[2]} m`, d: `Mittel ${f.h[0]} m ü. NN (Terrarium-Höhenmodell).` });
  if (!out.length) out.push({ icon: 'info', t: 'Keine besonderen Ortsmerkmale bekannt', d: 'Keine Brücke, Steigung ≥ 4 %, Wald ≥ 30 %, Niederung oder Betonbelag in den Quellen.' });
  return out;
}

/** Corridor of a segment and the station the detail opens on (coldest valid road, else the first inside). */
export function segmentMainStation(seg: RoadSegment, byId: ReadonlyMap<string, RoadPoint>): string | null {
  const inside = seg.stations.map((id) => byId.get(id)).filter((p): p is RoadPoint => !!p);
  const valid = inside.filter((p) => p.rs != null).sort((a, b) => (a.rs as number) - (b.rs as number));
  return valid[0]?.id ?? inside[0]?.id ?? seg.near.map((id) => byId.get(id)).find((p) => p && p.rs != null)?.id ?? null;
}
/** Segment of a station id (inside first, then in reach). */
export function segmentOfStation(segments: readonly RoadSegment[], stationId: string, corridorId: string | null): RoadSegment | null {
  const inC = corridorId ? segments.filter((s) => s.corridor === corridorId) : segments;
  return inC.find((s) => s.stations.includes(stationId)) ?? inC.find((s) => s.near.includes(stationId)) ?? segments.find((s) => s.stations.includes(stationId)) ?? null;
}
export const corridorOfSegment = (corridors: readonly RoadCorridor[], seg: RoadSegment) => corridors.find((c) => c.id === seg.corridor) ?? null;
export const timeOfHour = (hours: readonly number[], t: RoadTime) => hours[t] ?? hours[0];

// --- Temperatures −12 h … +6 h (the chart module is lazy; its series are built here) ------------------------

export interface TempSeries {
  /** Measured, from the 24-h ring: hour offsets (negative) and °C. */
  road: Array<[number, number]>; air: Array<[number, number]>; dew: Array<[number, number]>;
  /** Forecast air and dew point, hour offsets 0 … 6. */
  airFc: Array<[number, number]>; dewFc: Array<[number, number]>;
  stationName: string | null;
}

/** Series from the ring of the station and the forecast of the segment's point (−12 … +6 h, 0 = the slot). */
export function tempSeriesOf(ring: RoadH24File | null, stationId: string | null, slotMs: number, fc: ReadonlyArray<{ t: number | null; td: number | null } | null>): TempSeries {
  const out: TempSeries = { road: [], air: [], dew: [], airFc: [], dewFc: [], stationName: null };
  const st = stationId && ring ? ring.stations[stationId] : null;
  if (st && ring) ring.slots.forEach((s, i) => {
    const dh = (roadStampToMs(s) - slotMs) / 3_600_000;
    if (dh < -12 || dh > 0) return;
    if (st.rs[i] != null) out.road.push([dh, st.rs[i] as number]);
    if (st.ta[i] != null) out.air.push([dh, st.ta[i] as number]);
    if (st.td[i] != null) out.dew.push([dh, st.td[i] as number]);
  });
  fc.forEach((h, i) => { if (h?.t != null) out.airFc.push([i, h.t]); if (h?.td != null) out.dewFc.push([i, h.td]); });
  return out;
}

