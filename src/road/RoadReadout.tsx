/**
 * AW-5 — Readout of Autobahnwetter: tabs Station · Strecke · Quellen (design). Official warnings are quoted verbatim
 * from the DWD CAP feed (warn-layer rule), never summarised.
 *
 * AW-6.1b: the +1/+3/+6 h tiles, the 6-h area of the chart and the arrival rows carry the WEATHER forecast of buscosun
 * Fusion 8 (`road/fc/v1`: air temperature, dew point, precipitation, wind) — always named "Luft"/"Prognose". Road
 * surface temperature and road class stay measured-only (AW-6.2 behind Gate D). A forecast point of the corridor axis
 * can be selected like a station and gets its own card.
 */
import { useState } from 'react';
import type { CapAlert } from '../warnings/capAlerts';
import { ROAD_CLASS_CODE, dwdCheckText, type RoadField, type RoadH24File, type RoadPoint, type RoadRuleId } from './roadContract';
import type { RoadCorridor, RoadFcStationLoad } from './roadClient';
import { ROAD_CLASS_LABEL, type RoadClass } from './roadClasses';
import type { RoadTab, RoadTime } from './roadState';
import { ROAD_FC_SOURCE_TEXT, type RoadFcFile, type RoadFcPoint } from './roadFc';
import {
  roadFcAnchorSummary, roadFcAnchorText, ROAD_FC_AIR_COLOR, ROAD_FC_AIR_LABEL, ROAD_FC_PRECIP_NAME_PP, roadFcUiNote, roadFcEngineName, roadFcAirClass, roadFcAxisName, roadFcGapPoints, roadFcLine,
  roadFcCompact, roadFcPrecipKind, roadFcPrecipText, roadFcSeries, roadFcTiles, roadFcTrip, roadFcTripText, roadFcValue, roadFcWindText, type RoadFcValue,
  roadFcHasSurface, roadFcSurfaceSeries, roadSurfaceOriginText, roadSurfaceSigmaText, roadSurfaceText, roadSurfaceUiNote,
} from './roadFcView';
import { ROAD_SURFACE_HINT_LABEL, ROAD_SURFACE_HORIZON_H, ROAD_SURFACE_WORD } from './roadSurface';
import {
  ROAD_VS_AXIS_CHART_H, ROAD_VS_NAME, ROAD_VS_SHORT, ROAD_VS_WORD, roadLastValueMs, roadVsBadgeText, roadVsClassOf, roadVsCondText, roadVsInfoLines, roadVsMaySimulate, roadVsOriginText,
  roadVsRunLabel, roadVsSeries, roadVsSigmaText, roadVsSourceRow, roadVsText, roadVsValue, type RoadVsValue,
} from './vs/roadVsView';
import { ROAD_VS_OFF, type RoadVsView } from './vs/useRoadVs';
import { VS_GRIP_LABEL } from './vs/roadVsState';
import './vs/roadVs.css';
import {
  ROAD_CLASS_COLOR, ROAD_CLASS_INK, ROAD_CLASS_TINT, ROAD_GAP_TEXT, ROAD_GAP_TITLE, ageMinText, classBadge, conditionText, corridorRouteText, dec, driverHint,
  etaRows, f1, hm, isCritical, isGapCorridor, isHatched, kmIn, roadNoValueSince, shieldText, visText, DEFAULT_SPEED_KMH, DWD_WARNINGS_URL,
} from './roadView';

const DIR_TEXT: Record<string, string> = { N: 'Fahrtrichtung Nord', S: 'Fahrtrichtung Süd', O: 'Fahrtrichtung Ost', W: 'Fahrtrichtung West', X: 'beide Richtungen' };
const RULE_TEXT: Partial<Record<RoadRuleId, string>> = {
  placeholder: 'Platzhalter', stuck: 'hängender Sensor', limit: 'außerhalb der Grenzen', dwdSuspect: 'DWD: zweifelhaft',
  dewAboveAir: 'über der Lufttemperatur', gustBelowWind: 'unter dem Mittelwind', stateNoTemp: 'ohne Fahrbahntemperatur', iceWarm: 'Eis-Code bei Plusgraden',
  roadAir: 'Fühler defekt, Abgleich mit Nachbaranlagen', fillValue: 'Gerätefüllwert', dewSpread: 'Feuchtefühler defekt', gustNoWind: 'Böe ohne Wind',
  precipFill: 'Füllwert, kein Niederschlag gemeldet',
};
/** M2: observe-mode rules that keep a value but mark it („auffällig“). */
const OBSERVE_TEXT: Partial<Record<RoadRuleId, string>> = {
  neighbours: 'weicht stark von den Nachbaranlagen ab', jump: 'springt gegenüber der Messung davor', cube: 'weicht mehr als 8 K vom Modell ab',
  roadAir: 'liegt mehr als 30 K über der eigenen Luft',
};
const FIELD_TEXT: Partial<Record<RoadField, string>> = {
  rs: 'Fahrbahn', ta: 'Luft', td: 'Taupunkt', rh: 'Feuchte', vis: 'Sicht', wf: 'Wasserfilm', cond: 'Zustand', ws: 'Wind', wg: 'Böe', wd: 'Windrichtung',
  pt: 'Niederschlagsart', pr: 'Niederschlagsrate', pa: 'Niederschlagsmenge',
};
/**
 * „Plausibilität buscosun: …“ — bestanden only when nothing was rejected and nothing is conspicuous; otherwise which values
 * were rejected (hard rules, `x`; values without temperature follow their sensor and are not listed) and which kept value
 * is conspicuous and why (observe rules, `o`, M2).
 */
export function plausibilityText(p: Pick<RoadPoint, 'o' | 'x'>): string {
  const rejected = (Object.entries(p.x ?? {}) as Array<[RoadField, RoadRuleId]>).filter(([, r]) => r !== 'stateNoTemp').map(([f]) => FIELD_TEXT[f] ?? f);
  const hits = Object.entries(p.o ?? {}) as Array<[RoadField, RoadRuleId]>;
  const parts: string[] = [];
  if (rejected.length) parts.push(`verworfen: ${rejected.join(', ')}`);
  if (hits.length) parts.push(`auffällig: ${hits.map(([f, r]) => `${FIELD_TEXT[f] ?? f} ${OBSERVE_TEXT[r] ?? ''}`.trim()).join('; ')} (Wert gezeigt, nicht verworfen)`);
  return parts.length ? `Plausibilität buscosun: ${parts.join(' · ')}` : 'Plausibilität buscosun: bestanden';
}

function precipText(p: RoadPoint): string {
  // M3: a fill value without type and intensity is no precipitation — say so instead of a bare „verworfen“.
  if (p.x?.pr === 'precipFill' && !p.x?.pt && !p.pt) return 'kein (Rate war Gerätefüllwert)';
  if (p.x?.pt || p.x?.pr) return 'verworfen';
  if (p.pt == null && p.pr == null) return '—';
  const bit = (n: number) => p.pt != null && Math.floor(p.pt / 2 ** (30 - n)) % 2 === 1;
  const kinds = [bit(7) && 'Schnee', bit(5) && 'Regen', bit(4) && 'Sprühregen', bit(3) && 'gefrierend', bit(1) && 'unbestimmt'].filter(Boolean) as string[];
  if (!kinds.length && (p.pr ?? 0) === 0) return 'kein';
  return `${kinds.join(', ') || 'Niederschlag'}${p.pr ? ` · ${dec(p.pr)} mm/h` : ''}`;
}

/** Ring class code (`ROAD_CLASS_CODE`, one character per slot) → class; `-` (no point in that slot) ⇒ none. */
const CODE_CLASS: Readonly<Record<string, RoadClass>> = Object.freeze(Object.fromEntries(Object.entries(ROAD_CLASS_CODE).map(([c, k]) => [k, c as RoadClass])));
const SLOT_H = 0.25;

/**
 * V-AW-2: the measured class per 15-min slot of the ring (`k`, since `691113c`) — one cell per slot under the chart, ending
 * at its measurement; unknown state and no valid measurement hatched (never like "dry", D-04), no point = empty.
 */
export function ringClassCells(ring: RoadH24File | null, id: string, slotMs: number, fromH = -24): Array<{ dh: number; cls: RoadClass | null }> {
  const st = ring?.stations[id];
  if (!ring || typeof st?.k !== 'string') return [];
  const out: Array<{ dh: number; cls: RoadClass | null }> = [];
  ring.slots.forEach((s, i) => {
    const t = Date.UTC(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10));
    const dh = (t - slotMs) / 3_600_000;
    if (dh < fromH || dh > 0) return;
    out.push({ dh, cls: CODE_CLASS[st.k![i]] ?? null });
  });
  return out;
}

const val = (p: RoadPoint, f: keyof RoadPoint, fmt: (v: number) => string) => {
  const v = p[f];
  if (p.x && (p.x as Record<string, RoadRuleId>)[f as string]) return `verworfen (${RULE_TEXT[(p.x as Record<string, RoadRuleId>)[f as string]] ?? 'Prüfung'})`;
  return typeof v === 'number' ? `${fmt(v)}${p.o?.[f as RoadField] ? ' · auffällig' : ''}` : '—';
};

interface ChartProps {
  ring: RoadH24File | null;
  id: string;
  slotMs: number;
  /** Forecast air temperature and dew point: `[hours from slotMs, t, td]` (AW-6.1b). */
  fc?: Array<[number, number, number | null]>;
  /** Phase FB: forecast road surface („berechnet"), dashed dark: `[hours from slotMs, rs]`. */
  rsFc?: Array<[number, number]>;
  /** AW-6.2.9: `rsFc` comes from the virtual road sensor (legend word, blue dash) instead of FB-1. */
  rsVs?: boolean;
  /** Hours shown left and right of "jetzt": station −24…+6, forecast point 0…+24. */
  fromH?: number;
  toH?: number;
}

/** Verlauf: road, air, dew point from the ring of the station's series; right of "jetzt" the forecast AIR temperature
 *  and dew point of buscosun Fusion (dashed) — the road line has no forecast (AW-6.2, Gate D). */
function Chart({ ring, id, slotMs, fc = [], rsFc = [], rsVs = false, fromH = -24, toH = 6 }: ChartProps) {
  const cells = fromH < 0 ? ringClassCells(ring, id, slotMs, fromH) : [];
  const W = 368, H = cells.length ? 134 : 124, x0 = 30, x1 = 356, yTop = 10, yBot = 104, yStrip = 108, yLab = H - 4;
  const X = (dh: number) => x0 + ((dh - fromH) / (toH - fromH)) * (x1 - x0);
  const st = ring?.stations[id];
  const pts = (arr: Array<number | null> | undefined) => {
    if (!ring || !arr) return [] as Array<[number, number]>;
    return ring.slots.map((s, i) => {
      const t = Date.UTC(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10));
      return [(t - slotMs) / 3_600_000, arr[i]] as [number, number | null];
    }).filter((q): q is [number, number] => q[1] != null && q[0] >= -24 && q[0] <= 0);
  };
  const rs = pts(st?.rs), ta = pts(st?.ta), td = pts(st?.td);
  const fcT = fc.map(([h, t]) => [h, t] as [number, number]);
  const fcTd = fc.filter((q): q is [number, number, number] => q[2] != null).map(([h, , d]) => [h, d] as [number, number]);
  const all = [...rs, ...ta, ...td, ...fcT, ...fcTd, ...rsFc].map((q) => q[1]);
  const lo = Math.min(-4, ...all.map((v) => Math.floor(v - 1)));
  const hi = Math.max(10, ...all.map((v) => Math.ceil(v + 1)));
  const Y = (v: number) => yBot - ((v - lo) / (hi - lo)) * (yBot - yTop);
  const line = (q: Array<[number, number]>) => q.map(([h, v]) => `${X(h).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const nowX = X(0);
  const kCount = (c: RoadClass) => cells.filter((x) => x.cls === c).length;
  const kText = cells.length ? `; Leiste: Fahrbahnzustand je Messung — ${(['ice', 'frost', 'wet', 'dry'] as const).map((c) => `${kCount(c)} × ${ROAD_CLASS_LABEL[c].label}`).join(', ')}, ${kCount('unknown') + kCount('nodata')} ohne Zustand` : '';
  const hatchId = `aw-hatch-${id}`;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" className="aw-chart"
        aria-label={`${st ? `Verlauf der letzten 24 Stunden: Fahrbahn, Luft und Taupunkt (${ring?.slots.length ?? 0} Messungen)` : fromH < 0 ? 'Kein gemessener Verlauf vorhanden' : 'Prognose'}${fcT.length ? `; Prognose Luft und Taupunkt für ${toH} Stunden (${fcT.length} Stundenwerte)` : ''}${rsFc.length ? `; Fahrbahn ${ROAD_SURFACE_WORD}${rsVs ? ` (${ROAD_VS_SHORT})` : ''} für ${rsFc.length} Stunden` : ''}${kText}`}>
        {cells.length > 0 && (
          <defs>
            <pattern id={hatchId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" fill="#F4F0E4" /><line x1="0" y1="0" x2="0" y2="4" stroke="#B9AE93" strokeWidth="1.6" />
            </pattern>
          </defs>
        )}
        <rect x={nowX} y={yTop} width={x1 - nowX} height={yBot - yTop} className="aw-chart-fc" />
        <line x1={x0} y1={Y(0)} x2={x1} y2={Y(0)} stroke="#B5321F" strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
        <polyline className="aw-chart-fc-td" points={line(fcTd)} fill="none" stroke="#A89A7A" strokeWidth="1.2" strokeDasharray="1 3" />
        <polyline className="aw-chart-fc-t" points={line(fcT)} fill="none" stroke="#3A6FA8" strokeWidth="1.8" strokeDasharray="5 3" />
        <polyline className={`aw-chart-fc-rs${rsVs ? ' aw-chart-fc-vs' : ''}`} points={line(rsFc)} fill="none" stroke="#2C2A26" strokeWidth="2.2" strokeDasharray="5 3" />
        <polyline points={line(td)} fill="none" stroke="#A89A7A" strokeWidth="1.5" strokeDasharray="2 2" />
        <polyline points={line(ta)} fill="none" stroke="#3A6FA8" strokeWidth="1.8" />
        <polyline points={line(rs)} fill="none" stroke="#2C2A26" strokeWidth="2.4" />
        {/* The latest value of each line gets a dot — a ring with one slot (first hour after start) is otherwise invisible. */}
        {ta.length > 0 && <circle cx={X(ta[ta.length - 1][0])} cy={Y(ta[ta.length - 1][1])} r="2.6" fill="#3A6FA8" />}
        {rs.length > 0 && <circle cx={X(rs[rs.length - 1][0])} cy={Y(rs[rs.length - 1][1])} r="3.2" fill="#2C2A26" />}
        {cells.length > 0 && (
          <g className="aw-chart-k" aria-hidden="true">
            <rect x={X(fromH)} y={yStrip} width={nowX - X(fromH)} height="6" fill="#F5F1E8" />
            {cells.map((c) => c.cls && (
              <rect key={c.dh} data-k={c.cls} x={X(Math.max(fromH, c.dh - SLOT_H))} y={yStrip} width={Math.max(0.6, X(c.dh) - X(Math.max(fromH, c.dh - SLOT_H)))} height="6"
                fill={isHatched(c.cls) ? `url(#${hatchId})` : ROAD_CLASS_COLOR[c.cls]} />
            ))}
          </g>
        )}
        <text x="2" y={Y(0) + 3} fontSize="9" fill="#B5321F">0°</text>
        <text x="2" y={yTop + 6} fontSize="9" fill="#A89A7A">{hi > 0 ? '+' : ''}{hi}°</text>
        {fromH < 0 ? (
          <>
            <text x={x0} y={yLab} fontSize="9" fill="#A89A7A">{fromH} h</text>
            <text x={X(fromH / 2)} y={yLab} fontSize="9" fill="#A89A7A" textAnchor="middle">{fromH / 2} h</text>
            <text x={nowX} y={yLab} fontSize="9" fill="#2C2A26" textAnchor="middle">jetzt</text>
          </>
        ) : (
          <>
            <text x={x0} y={yLab} fontSize="9" fill="#2C2A26">jetzt</text>
            <text x={X(toH / 2)} y={yLab} fontSize="9" fill="#A89A7A" textAnchor="middle">+{toH / 2} h</text>
          </>
        )}
        <text x={x1} y={yLab} fontSize="9" fill="#A89A7A" textAnchor="end">+{toH} h</text>
        {fromH < 0 && !fcT.length && <text x={(nowX + x1) / 2 + 4} y="20" fontSize="8.5" fill="#6B7A8F" textAnchor="middle">keine Prognose</text>}
      </svg>
      <div className="aw-chart-legend">
        {fromH < 0 && (
          <>
            <span className={rs.length ? '' : 'is-off'}><i style={{ background: '#2C2A26', height: 2.4 }} />Fahrbahn</span>
            <span className={ta.length ? '' : 'is-off'}><i style={{ background: '#3A6FA8' }} />Luft</span>
            <span className={td.length ? '' : 'is-off'}><i className="is-dash" />Taupunkt</span>
            {cells.length > 0 && <span><i className="is-k" />Leiste: Fahrbahnzustand je 15 min</span>}
          </>
        )}
        {fcT.length > 0 && <span><i className="is-dash" style={{ borderTopColor: '#3A6FA8' }} />{fromH < 0 ? 'Prognose Luft / Taupunkt (gestrichelt)' : 'Prognose Luft 2 m'}</span>}
        {fcT.length > 0 && fromH >= 0 && <span><i className="is-dash" />Prognose Taupunkt</span>}
        {rsFc.length > 0 && <span><i className={`is-dash is-rs${rsVs ? ' is-vs' : ''}`} />Fahrbahn {ROAD_SURFACE_WORD}{rsVs ? ` · ${ROAD_VS_SHORT}` : ''} (gestrichelt)</span>}
        {!st && fromH < 0 && <span className="aw-chart-none">kein Verlauf verfügbar</span>}
      </div>
    </>
  );
}

interface Props {
  tab: RoadTab;
  onTab: (t: RoadTab) => void;
  point: RoadPoint | null;
  corridor: RoadCorridor | null;
  byId: ReadonlyMap<string, RoadPoint>;
  dir: 0 | 1;
  slotMs: number | null;
  nowMs: number;
  stale: boolean;
  ring: RoadH24File | null;
  warnings: CapAlert[] | null;
  warnState: 'off' | 'loading' | 'ok' | 'error';
  /** When the warnings were fetched (shown as the age of the feed). */
  warnAt?: number | null;
  departOffsetMin: number;
  onDepart: (deltaMin: number) => void;
  onPick: (id: string) => void;
  noData: string | null;
  /** Route forecast of the corridor (null = none usable), its points by id and the run label (`Lauf 11:05`). */
  fcFile: RoadFcFile | null;
  fcById: ReadonlyMap<string, RoadFcPoint>;
  fcLabel: string;
  /** Selected forecast point of the axis (instead of a station). */
  axis: RoadFcPoint | null;
  /** Time chip: hours ahead of now. */
  time: RoadTime;
  onTime: (t: RoadTime) => void;
  /** V-AW-26: forecast of the selected station when it is not in the corridor file (loading, found, or why not). */
  fcStation?: RoadFcStationLoad | 'loading' | null;
  /** Phase FB: show the road surface forecast of the run (`ROAD_SURFACE_LIVE` / `?rsfc=1`); off ⇒ the page says „Luft" as before. */
  surface?: boolean;
  /** AW-6.2.9: the virtual road sensor's run of the corridor (`ROAD_VS_LIVE` / `?roadvs=1`); off or absent ⇒ the page of before. */
  vs?: RoadVsView;
  /** 24-h rings of the groups with a failed sensor (by group) — a failed sensor is simulated only while ONE measurement is missing. */
  vsRings?: ReadonlyMap<string, RoadH24File>;
}

/** Phase FB: the run carries the surface AND the flag is on. */
const showSurface = (p: Pick<Props, 'surface' | 'fcFile'>) => !!p.surface && roadFcHasSurface(p.fcFile);
/** AW-6.2.9: the computed road value of a point at an hour — null when the switch is off, the run is missing or stale, or the point is not in it. */
const vsAt = (p: Pick<Props, 'vs'>, id: string | null | undefined, ms: number): RoadVsValue | null => {
  const v = p.vs ?? ROAD_VS_OFF;
  const pt = id ? v.byId.get(id) : undefined;
  return v.file && pt ? roadVsValue(pt, v.file, ms) : null;
};
const vsOn = (p: Pick<Props, 'vs'>) => !!p.vs?.file;

/** The small info mark next to a computed value; the click opens the origin (Jan 28.10.: „beim Klick steht die Information nochmal"). */
function VsInfo({ lines, label = 'Herkunft des berechneten Fahrbahnwerts' }: { lines: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="aw-vs-i" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((o) => !o)}><i aria-hidden="true">i</i></button>
      {open && <div className="aw-vs-info" role="note"><strong>{ROAD_VS_NAME}</strong>{lines.map((l, i) => <p key={i}>{l}</p>)}</div>}
    </>
  );
}
/** Info lines of a point's value, or none when the point is not in the run. */
function vsInfoOf(p: Pick<Props, 'vs' | 'ring'>, id: string, v: RoadVsValue, group?: string | null): string[] {
  const view = p.vs ?? ROAD_VS_OFF;
  const pt = view.byId.get(id);
  if (!view.file || !pt) return [];
  return roadVsInfoLines({ point: pt, value: v, file: view.file, sensorOffSinceMs: pt.kind === 'station' ? roadLastValueMs(p.ring, id, group) : null });
}
/** The sentence of the five places that used to say „folgt erst nach dem Backtest". */
const surfaceNote = (p: Pick<Props, 'surface' | 'fcFile'>) => (showSurface(p) ? `Die Fahrbahn ist bis +${ROAD_SURFACE_HORIZON_H} h ${ROAD_SURFACE_WORD} (buscosun Fusion — Fahrbahn), keine Messung.` : 'Eine Prognose der Fahrbahn folgt erst nach dem Backtest.');
/** AW-6.2.9: the same sentence when the virtual sensor fills the rows (gestrichelt umrandete Chips = berechnet). */
const vsNote = (p: Pick<Props, 'vs'>) => `Rot umrandete Chips sind ${ROAD_VS_WORD}: ${ROAD_VS_NAME} (${p.vs?.file ? roadVsRunLabel(p.vs.file) : ''}, Schattenbetrieb) an Sensoren, deren letzte Messung fehlt (ab der zweiten fehlenden Messung „keine Messung"), und an Prognosepunkten, keine Messung.`;

/** Why a station has no forecast point (V-AW-26) — one sentence, no road-surface words. */
function noFcText(p: Props): string {
  const s = p.fcStation;
  if (s === 'loading') return 'Die Prognose dieser Messstelle lädt …';
  if (s && s.reason === 'no-where') return 'Dieser Lauf führt keine Zuordnung für Messstellen abseits der geöffneten Strecke (Lauf vor dem 06.10.2026).';
  if (s && s.reason === 'no-file') return 'Die Prognose-Datei dieser Messstelle ist derzeit nicht lesbar.';
  return 'Für diese Messstelle rechnet der Lauf keine Prognose (sie fehlt im Stationskatalog des DWD oder im Lauf).';
}

/** Values of the weather forecast for one hour (grid cells); Phase FB puts the computed surface first when shown;
 *  AW-6.2.9: with a value of the virtual sensor its road, condition, grip, film and fog lead instead. */
function fcCells(v: RoadFcValue, surface = false, sigma = '', vs: RoadVsValue | null = null): Array<[string, string]> {
  return [
    ...(vs ? [
      [`Fahrbahn · ${ROAD_VS_WORD}`, `${f1(vs.tf)} °C${vs.sigma != null ? ` · ± ${dec(vs.sigma)} K` : ''}`] as [string, string],
      [`Zustand · ${ROAD_VS_WORD}`, roadVsCondText(vs)] as [string, string],
      ['Griff · ohne Streuung', vs.grip ? VS_GRIP_LABEL[vs.grip] : '—'] as [string, string],
      ['Wasserfilm · ber.', vs.filmMm != null ? `${dec(vs.filmMm, 2)} mm` : '—'] as [string, string],
      ['Sicht < 1 000 m', vs.vis[0] != null ? `${Math.round(vs.vis[0])} %` : '—'] as [string, string],
    ] : surface && v.rs != null ? [
      [`Fahrbahn · ${ROAD_SURFACE_WORD}`, `${f1(v.rs)} °C${sigma ? ` · ${sigma}` : ''}`] as [string, string],
      [`Hinweis · ${ROAD_SURFACE_WORD}`, v.rk ? ROAD_SURFACE_HINT_LABEL[v.rk].short : '—'] as [string, string],
    ] : []),
    ['Luft 2 m', `${f1(v.t)} °C${v.ts != null ? ` ± ${dec(v.ts)}` : ''}`],
    ['Taupunkt', v.td != null ? `${f1(v.td)} °C` : '—'],
    ['Niederschlag', roadFcPrecipText(v)],
    ['Wind / Böen', roadFcWindText(v)],
    ['Bewölkung', v.n != null ? `${Math.round(v.n)} %` : '—'],
    ['Schnee-Anteil', v.sn != null && (v.pp ?? 0) >= ROAD_FC_PRECIP_NAME_PP ? `${Math.round(v.sn)} %` : '—'],
  ];
}

/**
 * The +1/+3/+6 h tiles: forecast AIR temperature and precipitation; a click selects the hour (time chip). Phase FB
 * (behind the flag): the computed road surface leads the tile, its hint („berechnet", dashed marker), the air below.
 */
function FcTiles({ p, fcPoint, id }: { p: Props; fcPoint: RoadFcPoint | null; id?: string | null }) {
  const surface = showSurface(p);
  return (
    <>
      {roadFcTiles(fcPoint, p.fcFile, p.nowMs).map(({ leadH, value: v }) => {
        // AW-6.2.9: the virtual sensor leads the tile when its run has the hour (also without a weather forecast point).
        const vs = vsAt(p, id, p.nowMs + leadH * 3_600_000);
        const rs = !vs && surface && v && v.rs != null ? v : null;
        const hint = rs?.rk ?? null;
        const on = !!(v || vs);
        return (
          <button key={leadH} type="button" className={`aw-prog-tile${p.time === leadH && on ? ' is-on' : ''}${on ? '' : ' is-off'}${rs || vs ? ' has-rs' : ''}`} disabled={!on} aria-pressed={p.time === leadH}
            title={vs ? `${roadVsText(vs)} für ${hm(vs.validMs)} · ${roadVsOriginText(vs)}${vs.sigma != null ? ` · ${roadVsSigmaText(vs)}` : ''}${v ? ` · Luft ${f1(v.t)} °C` : ''} · ${ROAD_VS_NAME}`
              : rs ? `Fahrbahn ${ROAD_SURFACE_WORD} für ${hm(rs.validMs)} · ${roadSurfaceSigmaText(p.fcFile, leadH)} · Luft ${f1(rs.t)} °C · ${p.fcLabel}` : v ? `Prognose Luft für ${hm(v.validMs)} · ${p.fcLabel}` : 'Für diesen Punkt liegt keine Prognose vor.'} onClick={() => p.onTime(leadH as RoadTime)}>
            <span>+{leadH} h · {vs || rs ? `Fahrbahn · ${ROAD_VS_WORD}` : 'Luft'}</span><strong>{vs ? `${f1(vs.tf)}°` : rs ? `${f1(rs.rs as number)}°` : v ? `${f1(v.t)}°` : '—'}</strong>
            <em>{vs ? <><i className="is-vs" style={{ background: ROAD_CLASS_COLOR[roadVsClassOf(vs)] }} />{roadVsCondText(vs)}</>
              : rs ? <><i className="is-rs" style={{ borderColor: hint === 'frost' ? ROAD_CLASS_COLOR.frost : hint === 'wet' ? ROAD_CLASS_COLOR.wet : '#8B7355' }} />{hint && hint !== 'none' ? ROAD_SURFACE_HINT_LABEL[hint].short : `Luft ${f1(rs.t)}°`}</>
              : v ? <><i style={{ background: ROAD_FC_AIR_COLOR[roadFcAirClass(v.t)] }} />{(v.pp ?? 0) >= ROAD_FC_PRECIP_NAME_PP ? `${roadFcPrecipKind(v.sn)} ${Math.round(v.pp as number)} %` : `Nd. ${v.pp != null ? Math.round(v.pp) : '—'} %`}</> : 'keine Prognose'}</em>
          </button>
        );
      })}
    </>
  );
}

/** Forecast values of the chosen hour + the product's one-sentence limits. */
function FcDetail({ p, fcPoint, always, id }: { p: Props; fcPoint: RoadFcPoint | null; always?: boolean; id?: string | null }) {
  const v = fcPoint && p.fcFile ? roadFcValue(fcPoint, p.fcFile, p.nowMs + p.time * 3_600_000) : null;
  // AW-6.2.9: the virtual sensor's value of the hour; shown with the weather cells, or alone when the weather forecast is missing.
  const vs = vsAt(p, id, p.nowMs + p.time * 3_600_000);
  const vsNote = vs && p.vs?.file ? <p className="aw-fc-note aw-fc-note-rs">Fahrbahn 0 … 48 h aus dem {ROAD_VS_SHORT} ({roadVsRunLabel(p.vs.file)}, Schattenbetrieb) · diese Stunde {roadVsOriginText(vs)}{vs.sigma != null ? ` · ${roadVsSigmaText(vs)}` : ''}.</p> : null;
  if (!p.fcFile) return <><p className="aw-fc-note">Die Wetterprognose von {roadFcEngineName(null)} ist derzeit nicht verfügbar ({p.fcLabel}).</p>{vsNote}</>;
  if (!fcPoint) return <><p className="aw-fc-note">{noFcText(p)}</p>{vsNote}</>;
  return (
    <>
      {v && (always || p.time > 0 || vs) && (
        <>
          <div className="aw-eyebrow aw-fc-grid-title">Prognose {p.time === 0 ? 'jetzt' : `+${p.time} h`} · gültig {hm(v.validMs)}</div>
          <div className="aw-grid aw-fc-grid">
            {fcCells(v, showSurface(p), roadSurfaceSigmaText(p.fcFile, p.time), vs).map(([k, x]) => <div key={k} className="aw-cell"><span>{k}</span><strong>{x}</strong></div>)}
          </div>
        </>
      )}
      <p className="aw-fc-note">{roadFcUiNote(p.fcFile)} {p.fcLabel} · {roadFcAnchorText(fcPoint, p.fcFile)}{v?.interpolated ? ' · Stunde zwischen zwei Modellschritten interpoliert' : ''}.</p>
      {vsNote}
      {!vs && showSurface(p) && <p className="aw-fc-note aw-fc-note-rs">{roadSurfaceUiNote(p.fcFile)}{v && v.rs != null ? ` Diese Stunde ${roadSurfaceOriginText(v)}.` : ''}</p>}
    </>
  );
}

/** Card of a forecast point of the corridor axis (no station there). */
function AxisTab(p: Props & { axis: RoadFcPoint }) {
  const a = p.axis;
  const c = p.corridor;
  const file = p.fcFile;
  const v = file ? roadFcValue(a, file, p.nowMs + p.time * 3_600_000) : null;
  const now = file ? roadFcValue(a, file, p.nowMs) : null;
  const cls = v ? roadFcAirClass(v.t) : null;
  // AW-6.2.9: the virtual sensor at this axis point — the road leads the card like at a station, the air keeps its block.
  const vsV = vsAt(p, a.id, p.nowMs + p.time * 3_600_000);
  const vsNow = vsAt(p, a.id, p.nowMs);
  const vsPt = p.vs?.byId.get(a.id) ?? null;
  const vsCls = vsV ? roadVsClassOf(vsV) : null;
  return (
    <>
      <div className="aw-card aw-station aw-axis">
        <div className="aw-eyebrow is-accent">Prognosepunkt · {roadFcEngineName(file)}{vsOn(p) ? ` · ${ROAD_VS_SHORT}` : ''}</div>
        <h2 className="aw-station-name">{c ? roadFcAxisName(c, a, p.dir) : a.id}</h2>
        <div className="aw-station-sub">{[a.h != null ? `${Math.round(a.h)} m ü. NN` : null, a.bridge ? 'Brücke' : null, c && isGapCorridor(c) ? ROAD_GAP_TEXT : 'keine Messstelle an diesem Punkt'].filter(Boolean).join(' · ')}</div>
        <div className="aw-chip is-fc"><i />{p.fcLabel}{v ? ` · gültig ${hm(v.validMs)}` : ''}</div>
        {vsV && vsCls && (
          <div className="aw-hero is-vs">
            <div>
              <div className="aw-eyebrow is-vs">Fahrbahn · {ROAD_VS_WORD} · {p.time === 0 ? 'jetzt' : `+${p.time} h`}</div>
              <div className="aw-hero-val">{f1(vsV.tf)} °C<VsInfo lines={vsInfoOf(p, a.id, vsV)} /></div>
              <div className="aw-hero-sub is-vs">{roadVsOriginText(vsV)}{vsV.sigma != null ? ` · ${roadVsSigmaText(vsV)}` : ''}{vsPt?.kaltstart ? ' · Kaltstart' : ''}</div>
            </div>
            <div className="aw-badge is-vs" style={{ background: ROAD_CLASS_COLOR[vsCls], color: ROAD_CLASS_INK[vsCls] }}>{roadVsBadgeText(vsV)}</div>
          </div>
        )}
        <div className="aw-hero">
          <div>
            <div className="aw-eyebrow">Luft 2 m · {p.time === 0 ? 'jetzt' : `+${p.time} h`}</div>
            <div className="aw-hero-val">{v ? `${f1(v.t)} °C` : '—'}</div>
            <div className="aw-hero-sub">{v ? (v.ts != null ? `Prognose, Streuung ± ${dec(v.ts)} K` : 'Prognose') : 'für diese Stunde liegt keine Prognose vor'}</div>
            {!vsV && showSurface(p) && v && v.rs != null && <div className="aw-hero-sub aw-hero-rs">{roadSurfaceText(v)} · {roadSurfaceSigmaText(file, p.time)}</div>}
          </div>
          {cls && <div className="aw-badge" style={{ background: ROAD_FC_AIR_COLOR[cls], color: cls === 'frost' ? '#fff' : '#0B0E12' }}>{ROAD_FC_AIR_LABEL[cls]}</div>}
        </div>
        <FcDetail p={p} fcPoint={a} always id={a.id} />
      </div>
      <div className="aw-card">
        <div className="aw-card-head"><span className="aw-eyebrow">Prognose 24 h{vsOn(p) && vsPt ? ' · Luft + Fahrbahn' : ''}</span><span className="aw-unit">°C</span></div>
        <Chart ring={null} id={a.id} slotMs={p.nowMs} fc={file ? roadFcSeries(a, file, p.nowMs, 0, 24) : []} fromH={0} toH={24}
          rsFc={vsPt && p.vs?.file ? roadVsSeries(vsPt, p.vs.file, p.nowMs, 0, ROAD_VS_AXIS_CHART_H) : []} rsVs />
        <div className="aw-prog">
          <button type="button" className={`aw-prog-tile${p.time === 0 ? ' is-on' : ''}${vsNow ? ' has-rs' : ''}`} aria-pressed={p.time === 0} onClick={() => p.onTime(0)}
            title={vsNow ? `${roadVsText(vsNow)} · ${roadVsOriginText(vsNow)} · ${ROAD_VS_NAME}` : undefined}>
            <span>Jetzt · {vsNow ? `Fahrbahn · ${ROAD_VS_WORD}` : 'Luft'}</span><strong>{vsNow ? `${f1(vsNow.tf)}°` : now ? `${f1(now.t)}°` : '—'}</strong>
            <em>{vsNow ? <><i className="is-vs" style={{ background: ROAD_CLASS_COLOR[roadVsClassOf(vsNow)] }} />{roadVsCondText(vsNow)}</> : now ? <><i style={{ background: ROAD_FC_AIR_COLOR[roadFcAirClass(now.t)] }} />Prognose</> : 'keine Prognose'}</em>
          </button>
          <FcTiles p={p} fcPoint={a} id={a.id} />
        </div>
      </div>
      <div className="aw-sources">
        Datenbasis: {roadFcEngineName(file)} auf dem Punkt-Cube, {roadFcAnchorText(a, file)}{vsOn(p) && vsPt ? ` · Fahrbahn: ${ROAD_VS_NAME} (Schattenbetrieb)` : ''} · Lage des Punkts auf der Fahrbahn: © OpenStreetMap-Mitwirkende (ODbL)
      </div>
    </>
  );
}

/** AW-8 (E-AW-37): behind the hazard switch the column starts with Gefahren · Strecke · Quellen; the station readout lives on inside the detail. */
export default function RoadReadout(p: Props & { hz?: React.ReactNode; roads?: React.ReactNode }) {
  // Desktop: the motorway list (search, countries, list) lives here as the first tab; the left dock keeps the layers.
  const base: readonly RoadTab[] = p.hz !== undefined ? ['gefahren', 'strecke', 'quellen'] : ['station', 'strecke', 'quellen'];
  const tabs: readonly RoadTab[] = p.roads !== undefined ? ['autobahnen', ...base] : base;
  const want: RoadTab = p.hz !== undefined && p.tab === 'station' ? 'gefahren' : p.tab;
  const cur: RoadTab = tabs.includes(want) ? want : base[0];
  return (
    <aside className="aw-readout" aria-label="Details">
      <div role="tablist" aria-label="Ansicht" className="aw-seg aw-tabs">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={cur === t} className={cur === t ? 'is-active' : ''} onClick={() => p.onTab(t)}>
            {t === 'station' ? 'Station' : t === 'strecke' ? 'Strecke' : t === 'quellen' ? 'Quellen' : t === 'autobahnen' ? 'Autobahnen' : 'Gefahren'}
          </button>
        ))}
      </div>
      {cur === 'autobahnen' && p.roads}
      {cur === 'gefahren' && p.hz}
      {cur === 'station' && <StationTab {...p} />}
      {cur === 'strecke' && <StreckeTab {...p} />}
      {cur === 'quellen' && <QuellenTab file={p.fcFile} hz={p.hz !== undefined} surface={p.surface} vs={vsOn(p)} />}
    </aside>
  );
}

/** The station card of AW-5, for the detail view's „Messpunkte und Anker“ (AW-8). */
export function RoadStationCard(p: Props) { return <StationTab {...p} />; }

/** AF-5: a section without a measuring station and without a usable forecast — what is missing, and why. */
function GapEmpty({ p }: { p: Props }) {
  return (
    <div className="aw-empty">
      <strong>{ROAD_GAP_TITLE}.</strong> Fahrbahntemperatur und -zustand werden hier nicht gemessen{vsOn(p) ? `; der ${ROAD_VS_SHORT} berechnet sie an jedem Prognosepunkt (Schattenbetrieb).` : '.'}{' '}
      {p.fcFile ? 'Einen Prognosepunkt im Streckenband oder auf der Karte wählen.' : `Die Wetterprognose von ${roadFcEngineName(null)} ist für diesen Abschnitt derzeit nicht verfügbar (${p.fcLabel}).`}
    </div>
  );
}

function StationTab(p: Props) {
  if (p.axis) return <AxisTab {...p} axis={p.axis} />;
  if (p.corridor && isGapCorridor(p.corridor) && !p.point) return <GapEmpty p={p} />;
  if (p.noData) return <div className="aw-empty"><strong>Derzeit keine Messdaten.</strong> {p.noData}</div>;
  const s = p.point;
  if (!s) return <div className="aw-empty">Eine Messstelle auf der Karte oder im Streckenband wählen.</div>;
  const cs = p.corridor?.stations.find((x) => x.id === s.id);
  const km = cs && p.corridor ? kmIn(p.corridor, cs.km, p.dir) : null;
  const hatched = isHatched(s.cls);
  const tint = ROAD_CLASS_TINT[s.cls];
  const sub = [s.road ? shieldText(s.road) : null, km != null ? `Korridor-km ${dec(km, 0)}` : s.km != null ? `km ${dec(s.km)}` : null, s.dir ? DIR_TEXT[s.dir] : null, s.h != null ? `${Math.round(s.h)} m ü. NN` : null].filter(Boolean).join(' · ');
  const age = p.slotMs != null ? p.nowMs - s.t : 0;
  const values: Array<[string, string]> = [
    // M5 (D-6): the SWIS air sensors hang at 4–5 m (0 07 032), not 2 m — the forecast keeps „2 m“.
    ['Luft', val(s, 'ta', (v) => `${f1(v)} °C`)],
    ['Taupunkt', val(s, 'td', (v) => `${f1(v)} °C`)],
    ['Rel. Feuchte', val(s, 'rh', (v) => `${Math.round(v)} %`)],
    ['Sichtweite', val(s, 'vis', visText)],
    ['Wind / Böen', s.ws == null && s.wg == null ? '—' : `${s.ws != null ? Math.round(s.ws * 3.6) : '—'} / ${s.x?.wg ? 'verworfen' : s.wg != null ? Math.round(s.wg * 3.6) : '—'} km/h`],
    ['Niederschlag', precipText(s)],
    ['Wasserfilm', val(s, 'wf', (v) => `${dec(v)} mm`)],
    ['Zustand', s.x?.cond ? `verworfen (${RULE_TEXT[s.x.cond] ?? 'Prüfung'})` : conditionText(s.cond) ?? 'nicht gemeldet'],
  ];
  const warns = (p.warnings ?? []);
  const fcPoint = p.fcFile ? p.fcById.get(s.id) ?? (p.fcStation && p.fcStation !== 'loading' ? p.fcStation.point : null) : null;
  const vsPt = vsOn(p) ? p.vs?.byId.get(s.id) ?? null : null;
  const refMs = p.slotMs ?? s.t;
  // The DWD stamps a row without values with the slot time too — „gemessen 00:00" would be wrong for a station with no road value.
  const noSince = s.cls === 'nodata' ? roadNoValueSince(p.ring, s.id, s.g, refMs) : null;
  // AW-6.2.9: a failed road sensor shows the virtual sensor's value in the measured value's place (Jan 28.10.) — a valid measurement always wins.
  const vsNow = s.rs == null && roadVsMaySimulate(p.ring, s.id, s.g) ? vsAt(p, s.id, p.nowMs) : null;
  const vsCls = vsNow ? roadVsClassOf(vsNow) : null;
  return (
    <>
      <div className="aw-card aw-station">
        {/* "keine gültige Messung" only when nothing valid arrived — a measured station without condition is `unknown` (hatched too, but measured). */}
        <div className={`aw-eyebrow${vsNow ? ' is-vs' : s.cls === 'nodata' ? ' is-muted' : ' is-accent'}`}>{vsNow ? `Glättemeldeanlage · Fahrbahnsensor ausgefallen · ${ROAD_VS_SHORT}` : s.cls === 'nodata' ? 'Glättemeldeanlage · keine gültige Messung' : 'Glättemeldeanlage · DWD'}</div>
        <h2 className="aw-station-name">{s.n}</h2>
        <div className="aw-station-sub">{sub}</div>
        {noSince
          ? <div className="aw-chip is-stale"><i />{noSince}</div>
          : <div className={`aw-chip${p.stale ? ' is-stale' : ''}`}><i />{p.stale ? `veraltet · gemessen ${hm(s.t)}` : `gemessen ${hm(s.t)} · ${ageMinText(age)}`}</div>}
        <div className={`aw-hero${vsNow ? ' is-vs' : ''}`}>
          <div>
            <div className={`aw-eyebrow${vsNow ? ' is-vs' : ''}`}>Fahrbahn{vsNow ? ` · ${ROAD_VS_WORD}` : ''}</div>
            <div className="aw-hero-val">{vsNow ? <>{f1(vsNow.tf)} °C<VsInfo lines={vsInfoOf(p, s.id, vsNow, s.g)} /></> : s.rs != null ? `${f1(s.rs)} °C` : '—'}</div>
            <div className={`aw-hero-sub${vsNow ? ' is-vs' : ''}`}>{vsNow ? `${roadVsOriginText(vsNow, roadLastValueMs(p.ring, s.id, s.g))}${vsNow.sigma != null ? ` · ${roadVsSigmaText(vsNow)}` : ''}${s.x?.rs ? ` · Messung verworfen (${RULE_TEXT[s.x.rs] ?? 'Prüfung'})` : ''}`
              : s.rs != null ? `${s.ns > 1 ? `kältester von ${s.ns} Sensoren · ${f1(s.rs)} … ${f1(s.rsHi ?? s.rs)} °C` : '1 Sensor'}${s.o?.rs ? ` · auffällig: ${OBSERVE_TEXT[s.o.rs] ?? 'Prüfung'}` : ''}` : s.x?.rs ? `Fahrbahnwert verworfen (${RULE_TEXT[s.x.rs] ?? 'Prüfung'})` : 'keine Fahrbahntemperatur gemeldet'}</div>
          </div>
          {vsNow && vsCls
            ? <div className="aw-badge is-vs" style={{ background: ROAD_CLASS_COLOR[vsCls], color: ROAD_CLASS_INK[vsCls] }}>{roadVsBadgeText(vsNow)}</div>
            : <div className={`aw-badge${hatched ? ' is-hatched' : ''}`} style={!hatched ? { background: ROAD_CLASS_COLOR[s.cls], color: ROAD_CLASS_INK[s.cls] } : undefined}>{classBadge(s)}</div>}
        </div>
        <div className="aw-eyebrow aw-grid-title">Messwerte {hm(s.t)}</div>
        <div className="aw-grid">
          {values.map(([k, v]) => <div key={k} className="aw-cell"><span>{k}</span><strong>{v}</strong></div>)}
        </div>
        <div className="aw-hint" style={{ background: tint.bg, borderColor: tint.border, color: tint.ink }}>
          <strong>Hinweis für Fahrer</strong>{driverHint(s)}
          {s.f?.includes('spread') && <span className="aw-hint-flag"> Die Fahrbahnsensoren dieser Anlage sind sich uneinig ({f1(s.rs ?? 0)} … {f1(s.rsHi ?? 0)} °C); gezeigt ist der kälteste.</span>}
        </div>
      </div>

      <div className="aw-card">
        <div className="aw-card-head"><span className="aw-eyebrow">Verlauf 24 h{fcPoint || vsPt ? ` · Prognose Luft${vsPt || showSurface(p) ? ' + Fahrbahn' : ''} 6 h` : ''}</span><span className="aw-unit">°C</span></div>
        <Chart ring={p.ring} id={s.id} slotMs={refMs} fc={fcPoint && p.fcFile ? roadFcSeries(fcPoint, p.fcFile, refMs, 0, 6) : []}
          rsFc={vsPt && p.vs?.file ? roadVsSeries(vsPt, p.vs.file, refMs, 0, 6) : showSurface(p) && fcPoint && p.fcFile ? roadFcSurfaceSeries(fcPoint, p.fcFile, refMs, 0, ROAD_SURFACE_HORIZON_H) : []} rsVs={!!vsPt} />
        <div className="aw-prog">
          <button type="button" className={`aw-prog-tile${p.time === 0 ? ' is-on' : ''}${vsNow ? ' has-rs' : ''}`} aria-pressed={p.time === 0} onClick={() => p.onTime(0)}
            title={vsNow ? `${roadVsText(vsNow)} · ${roadVsOriginText(vsNow)} · ${ROAD_VS_NAME}` : undefined}>
            <span>Jetzt{vsNow ? ` · ${ROAD_VS_WORD}` : ''}</span><strong>{vsNow ? `${f1(vsNow.tf)}°` : s.rs != null ? `${f1(s.rs)}°` : '—'}</strong>
            <em>{vsNow && vsCls ? <><i className="is-vs" style={{ background: ROAD_CLASS_COLOR[vsCls] }} />{roadVsCondText(vsNow)}</> : <><i className={hatched ? 'is-hatched' : ''} style={!hatched ? { background: ROAD_CLASS_COLOR[s.cls] } : undefined} />{ROAD_CLASS_LABEL[s.cls].short}</>}</em>
          </button>
          <FcTiles p={p} fcPoint={fcPoint} id={s.id} />
        </div>
        <FcDetail p={p} fcPoint={fcPoint} id={s.id} />
      </div>

      {p.warnState === 'ok' && warns.map((w) => (
        <div key={w.id} className="aw-card aw-warn">
          <div className="aw-eyebrow is-warn">Amtliche Warnung · DWD{w.areas[0]?.desc ? ` · ${w.areas[0].desc}` : ''}</div>
          <p className="aw-warn-text">„{w.headline}“</p>
          {w.description && <p className="aw-warn-text">„{w.description}“</p>}
          <div className="aw-warn-meta">gültig {w.onsetMs ? `ab ${hm(w.onsetMs)}` : ''}{w.expiresMs ? ` bis ${hm(w.expiresMs)}` : ' bis auf Widerruf'} · Quelle: Deutscher Wetterdienst{p.warnAt ? ` · abgerufen ${hm(p.warnAt)}` : ''}</div>
        </div>
      ))}
      {p.warnState === 'error' && (
        <p className="aw-note">Amtliche Warnungen derzeit nicht abrufbar — kein Ersatztext. Die gültigen Warnungen stehen beim{' '}
          <a href={DWD_WARNINGS_URL} target="_blank" rel="noopener noreferrer">Deutschen Wetterdienst</a>.</p>
      )}

      <div className="aw-sources">
        {/* M5 (D-7): the DWD check from the raw flag; slots written before `qf` know only „0“ (ok) and the rest. */}
        {s.qf !== undefined ? dwdCheckText(s.qf) : s.q === 'ok' ? dwdCheckText(0) : dwdCheckText(null)} · {plausibilityText(s)}
        {s.f?.includes('noCatalog') ? ' · Position aus der Meldung (nicht im DWD-Stationskatalog)' : ''}
        {s.f?.includes('posCatalog') ? ' · Position aus dem DWD-Stationskatalog — die Meldung nennt eine Stelle abseits dieser Straße' : ''}
        {s.f?.includes('posUnverified') ? ' · Position nicht bestätigt: weder Meldung noch Katalog liegen an dieser Straße' : ''}<br />
        Datenbasis: Deutscher Wetterdienst, Glättemeldeanlagen der Länder (SWIS) · GeoNutzV · verändert: geprüft, umkodiert
      </div>
    </>
  );
}

function StreckeTab(p: Props) {
  const c = p.corridor;
  const file = p.fcFile;
  // AF-5: a section without a measuring station — the table carries forecast points only.
  const gap = !!c && isGapCorridor(c);
  if (gap && !file) return <GapEmpty p={p} />;
  if (p.noData && !file) return <div className="aw-empty"><strong>Derzeit keine Messdaten.</strong> {p.noData}</div>;
  if (!c || (p.slotMs == null && !file)) return <div className="aw-empty">Eine Autobahn im Dock wählen.</div>;
  const slot15 = Math.ceil(p.nowMs / 900_000) * 900_000;
  const departMs = slot15 + p.departOffsetMin * 60_000;
  const stationRows = etaRows(c, p.byId, p.dir, departMs, p.slotMs ?? 0);
  // Weather at arrival (AW-6.1b): every row gets the forecast of its arrival hour; stretches without a station within
  // the band reach get forecast points of the axis as rows of their own.
  const rows = [
    ...stationRows.map((r) => ({ ...r, axis: false, fc: file && p.fcById.get(r.id) ? roadFcValue(p.fcById.get(r.id)!, file, r.etaMs) : null })),
    ...(file ? roadFcGapPoints(c, file) : []).map((a) => {
      const km = kmIn(c, a.km as number, p.dir);
      const etaMs = departMs + (km / DEFAULT_SPEED_KMH) * 3_600_000;
      return { id: a.id, km, name: 'Prognosepunkt', etaMs, point: null, measuredAtArrival: false, axis: true, fc: roadFcValue(a, file!, etaMs) };
    }),
  ].sort((a, b) => a.km - b.km);
  const trip = roadFcTrip(rows.map((r) => ({ km: r.km, value: r.fc })));
  const nStations = stationRows.length;
  const measured = rows.filter((r) => r.point?.rs != null);
  const coldest = measured.reduce<typeof rows[number] | null>((a, b) => (!a || (b.point!.rs as number) < (a.point!.rs as number) ? b : a), null);
  const crit = rows.filter((r) => r.point && isCritical(r.point.cls)).length;
  const border = c.borders.find((b) => b.km > 0 && b.km >= c.lengthKm - 0.5) ?? c.borders[0];
  // AW-6.2.9: the virtual sensor's value at the arrival hour of every row without a measured road (failed sensor or axis point).
  // Stations: only while one measurement is missing (ring of their group); axis points have no sensor and keep the computed value.
  const vsRows = rows.map((r) => ({ r, vs: r.point?.rs != null ? null : r.point && !roadVsMaySimulate(r.point.g ? p.vsRings?.get(r.point.g) ?? (p.ring?.group === r.point.g ? p.ring : null) : null, r.id, r.point.g) ? null : vsAt(p, r.id, r.etaMs) })).filter((x): x is { r: typeof rows[number]; vs: RoadVsValue } => !!x.vs);
  const vsColdest = vsRows.reduce<typeof vsRows[number] | null>((a, b) => (!a || b.vs.tf < a.vs.tf ? b : a), null);
  const vsOf = (id: string) => vsRows.find((x) => x.r.id === id)?.vs ?? null;
  return (
    <>
      <div className="aw-card">
        <div className="aw-eyebrow is-accent">Strecken-Briefing</div>
        <h2 className="aw-station-name is-small">{corridorRouteText(c, p.dir)}</h2>
        <div className="aw-station-sub">{c.shields.join(' · ')} · {dec(c.lengthKm, 0)} km · {c.countries.join(' · ')}</div>
        <div className="aw-depart">
          <span>Abfahrt</span>
          <button type="button" aria-label="30 Minuten früher" disabled={p.departOffsetMin <= 0} onClick={() => p.onDepart(-30)}>−</button>
          <strong>{hm(departMs)}</strong>
          <button type="button" aria-label="30 Minuten später" disabled={p.departOffsetMin >= 345} onClick={() => p.onDepart(30)}>+</button>
          <span className="aw-count">Ø {DEFAULT_SPEED_KMH} km/h</span>
        </div>
        <div className="aw-brief">
          {gap ? `${ROAD_GAP_TITLE}: Fahrbahntemperatur und -zustand werden hier nicht gemessen.` : coldest ? `Kälteste Messung: ${coldest.name} ${f1(coldest.point!.rs as number)} °C (${hm(coldest.point!.t)}). ` : 'Keine gültige Fahrbahnmessung auf diesem Abschnitt. '}
          {gap || p.noData ? '' : `${crit} von ${nStations} Messpunkten mit Glätte oder Frostgefahr gemessen.`}
          {border ? ` Ab km ${dec(kmIn(c, border.km, p.dir), 0)} (Grenze ${border.country}) keine offene Fahrbahnmessung.` : ''}
          {(c.unbuilt ?? []).map(([a, b]) => ` km ${dec(Math.min(kmIn(c, a, p.dir), kmIn(c, b, p.dir)), 0)}–${dec(Math.max(kmIn(c, a, p.dir), kmIn(c, b, p.dir)), 0)}: keine Fahrbahn in OpenStreetMap (im Bau oder anders geführt).`).join('')}
          {trip.coldest && <span className="aw-brief-fc"> {roadFcTripText(trip)}</span>}
          {vsColdest && <span className="aw-brief-fc"> Kälteste {ROAD_VS_WORD}e Fahrbahn zur Ankunft ({ROAD_VS_SHORT}): km {dec(vsColdest.r.km, 0)} {f1(vsColdest.vs.tf)} °C, {roadVsCondText(vsColdest.vs)}.</span>}
        </div>
      </div>
      {/* V-AW-29: from 1 440 px the arrival forecast has its own column (`.aw-table-fc`), below it stays a line under the name. */}
      <div className="aw-card aw-table has-fc-col">
        <div className="aw-table-head"><span>km</span><span>{gap ? 'Prognosepunkt' : 'Messpunkt'}</span><span className="aw-table-fc">Luft zur Ankunft</span><span>an</span><span>{gap ? 'Art' : 'Zustand'}</span></div>
        {rows.map((r) => {
          const cls = r.point?.cls ?? 'nodata';
          const hatched = isHatched(cls);
          const vs = vsOf(r.id);
          const vsCls = vs ? roadVsClassOf(vs) : null;
          const vsChip = vs && vsCls ? (
            <span className="aw-table-chip is-vs" style={{ background: ROAD_CLASS_COLOR[vsCls], color: ROAD_CLASS_INK[vsCls] }}
              title={`${roadVsText(vs)} zur Ankunft ${hm(vs.validMs)} · ${roadVsOriginText(vs)} · ${ROAD_VS_NAME} (Schattenbetrieb)`}>{roadVsCondText(vs)} · ber.</span>
          ) : null;
          if (r.axis) return (
            <button key={r.id} type="button" className="aw-table-row is-fc-row" onClick={() => p.onPick(r.id)}>
              <span className="aw-mono">{dec(r.km, 0)}</span>
              <span className="aw-table-name"><strong>{r.name}</strong><em className="is-fc">{r.fc ? roadFcLine(r.fc) : 'keine Prognose für die Ankunftsstunde'}{vs ? <u> · {roadVsText(vs)}</u> : r.fc && showSurface(p) && r.fc.rs != null ? <u> · {roadSurfaceText(r.fc)}</u> : null}</em></span>
              <FcCell surface={showSurface(p) && !vs} v={r.fc} />
              <span>{hm(r.etaMs)}</span>
              {vsChip ?? <span className="aw-table-chip is-fc" title={`${gap ? ROAD_GAP_TITLE : 'Keine Messstelle im 10-km-Umkreis'} — Wetterprognose von ${roadFcEngineName(file)}, keine Fahrbahnprognose`}>Prognose</span>}
            </button>
          );
          return (
            <button key={r.id} type="button" className="aw-table-row" onClick={() => p.onPick(r.id)}>
              <span className="aw-mono">{dec(r.km, 0)}</span>
              <span className="aw-table-name">
                <strong>{r.name}</strong><em className={vs ? 'is-vs' : undefined}>{r.point?.rs != null ? `Fahrbahn ${f1(r.point.rs)} °C · gemessen ${hm(r.point.t)}` : vs ? `${roadVsText(vs)} (${ROAD_VS_SHORT})` : 'keine gültige Fahrbahnmessung'}</em>
                {r.fc && (!r.measuredAtArrival || r.point?.rs == null) && <em className="is-fc">zur Ankunft: {roadFcLine(r.fc)}{!vs && showSurface(p) && r.fc.rs != null ? <u> · {roadSurfaceText(r.fc)}</u> : null}</em>}
              </span>
              <FcCell surface={showSurface(p) && !vs} v={r.fc && (!r.measuredAtArrival || r.point?.rs == null) ? r.fc : null} measured={!!r.fc && r.measuredAtArrival && r.point?.rs != null} />
              <span>{hm(r.etaMs)}</span>
              {vsChip ?? (
                <span className={`aw-table-chip${hatched ? ' is-hatched' : ''}${r.measuredAtArrival ? '' : ' is-later'}`}
                  style={!hatched ? (r.measuredAtArrival ? { background: ROAD_CLASS_COLOR[cls], color: ROAD_CLASS_INK[cls] } : { borderColor: ROAD_CLASS_COLOR[cls] }) : undefined}
                  title={r.measuredAtArrival ? 'Messung gilt bis +30 min' : 'Ankunft später als 30 min nach der Messung — gezeigt ist die Messung, keine Ableitung'}>
                  {ROAD_CLASS_LABEL[cls].short}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {gap ? (
        <p className="aw-note">An diesem Abschnitt steht keine Messstelle: die Tabelle zeigt das Wetter zur Ankunft aus {roadFcEngineName(file)} (Luft, Niederschlag · {p.fcLabel}) an jedem Prognosepunkt. {vsRows.length ? vsNote(p) : surfaceNote(p)}</p>
      ) : <p className="aw-note">Zustand zur Ankunftszeit: bis +30 min die Messung; später zeigt die Tabelle weiter die Messung (umrandet) und dazu das Wetter zur Ankunft aus {roadFcEngineName(file)} (Luft, Niederschlag{file ? ` · ${p.fcLabel}` : ' — derzeit nicht verfügbar'}). {vsRows.length ? vsNote(p) : surfaceNote(p)} Zwischen zwei Messpunkten kann die Fahrbahn anders sein.</p>}
    </>
  );
}

/** V-AW-29: forecast column of the route table (shown from 1 440 px; below, the same text sits under the name). */
function FcCell({ v, measured = false, surface = false }: { v: RoadFcValue | null; measured?: boolean; surface?: boolean }) {
  if (!v) return <span className="aw-table-fc is-none" title={measured ? 'Ankunft bis +30 min nach der Messung — es gilt die Messung' : 'keine Prognose für die Ankunftsstunde'}>{measured ? 'Messung' : '—'}</span>;
  const c = roadFcCompact(v);
  const rs = surface ? roadSurfaceText(v) : null;
  return <span className="aw-table-fc" title={`Prognose für ${hm(v.validMs)}: ${roadFcLine(v)}${rs ? ` · ${rs}` : ''}`}><b>{c.air}</b><i>{c.precip}</i>{rs && <u>{`Fahrbahn ${f1(v.rs as number)}° · ber.`}</u>}</span>;
}

/** The row of the forecast engine: its name comes from the run file (`roadFcEngineName`), see `QuellenTab`. */
const FC_ENGINE_ROW = 'fc-engine';
/** Phase FB: the surface row — „aktiv" only when the run carries the surface and the flag is on, else the planned row. */
const SURFACE_ROW = 'buscosun Fusion — Fahrbahn';
const surfaceSourceRow = (file: RoadFcFile | null, on: boolean): { cc: string; what: string; status: 'aktiv' | 'geplant' } => {
  const s = file?.engine.surface;
  if (on && s && s.mode === 'fb1') return { cc: 'DE', status: 'aktiv', what: `Fahrbahntemperatur und -hinweis +1 … +${ROAD_SURFACE_HORIZON_H} h, ${ROAD_SURFACE_WORD} (Modell FB-1, Tabelle ${s.fitted.from} … ${s.fitted.to}) an jeder Messstelle und jedem Prognosepunkt der Streckenprognose · in Erprobung, Gate D im Dezember` };
  return { cc: 'DACH', status: 'geplant', what: 'Fahrbahntemperatur und -zustand +1/+3/+6 h — erst nach bestandenem Backtest' };
};
const SOURCES: ReadonlyArray<{ cc: string; name: string; what: string; status: 'aktiv' | 'geplant' | 'blockiert' }> = [
  { cc: 'DE', name: 'DWD Straßenwetter (Glättemeldeanlagen)', what: 'Fahrbahntemperatur, -zustand, Wasserfilm, Luft, Sicht · 15 min · GeoNutzV', status: 'aktiv' },
  { cc: 'DE', name: 'DWD Warnungen (CAP)', what: 'Glätte, Glatteis, Nebel, Sturm · wörtlich zitiert', status: 'aktiv' },
  { cc: 'DE', name: 'BKG DLM250', what: 'Autobahnachsen der Korridore · © GeoBasis-DE / BKG, dl-de/by-2.0', status: 'aktiv' },
  { cc: 'DACH', name: 'GeoNames', what: 'Ortsnamen der Korridore (Anfang, Ende, Städte) · geonames.org, CC BY 4.0', status: 'aktiv' },
  { cc: 'DE', name: 'DWD Radar (RADOLAN-RV)', what: 'Ebene „Niederschlag jetzt": jüngste Analyse, alle 5 min, über den Radar-Spiegel · zuschaltbar · CC BY 4.0 (wie die Wetterkarte)', status: 'aktiv' },
  { cc: 'DE', name: FC_ENGINE_ROW, what: 'Wetterprognose 0–48 h (Luft, Taupunkt, Niederschlag, Wind) alle 5 km und an jeder Messstelle, stündlich neu', status: 'aktiv' },
  { cc: 'DE', name: 'OpenStreetMap', what: 'Lage der Prognosepunkte auf der Fahrbahn · © OpenStreetMap-Mitwirkende, ODbL', status: 'aktiv' },
  { cc: 'DACH', name: SURFACE_ROW, what: 'Fahrbahntemperatur und -zustand +1/+3/+6 h — erst nach bestandenem Backtest', status: 'geplant' },
  { cc: 'DE', name: ROAD_VS_NAME, what: 'Fahrbahntemperatur und -zustand 0 … 48 h an jedem Punkt — Schattenbetrieb bis Gate G', status: 'geplant' },
  { cc: 'AT', name: 'GeoSphere TAWES + Warnungen', what: 'Luft, 5-cm- und Bodentemperatur als Anker der Prognosepunkte · CC BY 4.0', status: 'geplant' },
  { cc: 'CH', name: 'MeteoSchweiz SwissMetNet', what: 'Luft, 5-cm- und Bodentemperatur als Anker der Prognosepunkte · CC BY 4.0', status: 'geplant' },
  { cc: 'DE', name: 'Autobahn GmbH API', what: 'Sperrungen, Baustellen, Webcams · keine Lizenz angegeben', status: 'blockiert' },
  { cc: 'AT', name: 'ASFINAG Content Portal', what: 'Verkehrsmeldungen · Registrierung nötig, Zusatzpflichten', status: 'blockiert' },
  { cc: 'CH', name: 'ASTRA Strassenwetter / Traffic Situations', what: 'nicht offen · API-Key, Weitergabeverbot', status: 'blockiert' },
];

/** AW-8: the sources of the hazard rail (shown behind the switch only). */
const HZ_SOURCES: typeof SOURCES = [
  { cc: 'DE', name: 'Gefahren je Abschnitt (buscosun)', what: 'Regeln über Messwerten (GMA), DWD RADOLAN-RV, KONRAD3D, ICON-D2 und der Streckenprognose · Prognose-Stufen in Erprobung, höchstens Stufe 2', status: 'aktiv' },
  { cc: 'DACH', name: 'OpenStreetMap', what: 'Abschnitte (Anschlussstellen), Brücken, Tunnel, Einschnitte, Dämme, Betonbelag · © OpenStreetMap-Mitwirkende, ODbL', status: 'aktiv' },
  { cc: 'DACH', name: 'ESA WorldCover 2021, Terrarium-Höhenmodell', what: 'Wald- und Ackeranteil neben der Fahrbahn, Höhe und Steigung der Achse · CC BY 4.0 / Mapzen', status: 'aktiv' },
];

function QuellenTab({ file, hz = false, surface = false, vs = false }: { file: RoadFcFile | null; hz?: boolean; surface?: boolean; vs?: boolean }) {
  const rows = [...SOURCES, ...(hz ? HZ_SOURCES : [])].map((s) => (s.name === SURFACE_ROW ? { ...s, ...surfaceSourceRow(file, surface) } : s.name === ROAD_VS_NAME ? { ...s, ...roadVsSourceRow(vs) } : s));
  return (
    <>
      <div className="aw-eyebrow aw-sources-title">Quellen dieser Ansicht</div>
      <div className="aw-source-list">
        {rows.map((s) => (
          <div key={s.name} className={`aw-source is-${s.status}`}>
            <span className="aw-source-cc">{s.cc}</span>
            <span className="aw-source-body"><strong>{s.name === FC_ENGINE_ROW ? roadFcEngineName(file) : s.name}</strong><span>{s.name === FC_ENGINE_ROW ? `${s.what} · ${roadFcAnchorSummary(file)}` : s.what}</span></span>
            <span className="aw-source-status">{s.status}</span>
          </div>
        ))}
      </div>
      <p className="aw-note aw-fc-source">{file?.source || ROAD_FC_SOURCE_TEXT}</p>
      <div className="aw-box is-frost">
        <strong>Verkehrslage nur als Link:</strong>{' '}
        <a href="https://www.autobahn.de/" target="_blank" rel="noopener noreferrer">Autobahn GmbH</a> · <a href="https://www.asfinag.at/" target="_blank" rel="noopener noreferrer">ASFINAG</a> · <a href="https://www.astra.admin.ch/" target="_blank" rel="noopener noreferrer">ASTRA</a>. Blockierte Quellen bleiben sichtbar, werden aber nicht umgangen.
      </div>
    </>
  );
}
