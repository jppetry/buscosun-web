/**
 * AW-6.2.9 — the PAGE's view of the virtual road sensor (`road/vs/v1`, behind `ROAD_VS_LIVE` / `?roadvs=1`, E-VS-2):
 * pure functions over a product file — the value of a point at an hour, its road class and colour, the words of the
 * display rule (`roadVsDisplay`), the lines of the info tab, the chart series. No fetch, no React. Jan 28.10.: where a
 * sensor has failed, and on every section without a sensor, the page shows the computed road like a measured one, with
 * a small info mark; the click repeats the origin. Measured values always win (`gemessen` = the measurement is shown).
 */
import type { RoadClass } from '../roadClasses';
import type { RoadH24File } from '../roadContract';
import { roadStampToMs } from '../roadContract';
import { dec, f1, hm } from '../roadView';
import {
  ROAD_VS_CONDITION_CODE, ROAD_VS_GRIP_CODE, roadVsDisplay, roadVsProductDecode, roadVsSrcOf,
  type RoadVsProductFile, type RoadVsProductPoint, type RoadVsSrc,
} from './roadVsProduct';
import { VS_CONDITION_LABEL, VS_GRIP_LABEL, VS_SCENARIO_TEXT, type VsCondition, type VsGrip } from './roadVsState';

const H = 3_600_000;
/** The one word every computed road value carries (same word as Phase FB, E-FB-5). */
export const ROAD_VS_WORD = 'berechnet';
export const ROAD_VS_NAME = 'buscosun Fusion — virtueller Fahrbahnsensor';
/** Short origin for tiles and chips. */
export const ROAD_VS_SHORT = 'virtueller Sensor';
/** Hours ahead the page shows from the product (the file carries 0 … 48). */
export const ROAD_VS_HORIZON_H = 48;
/** The axis chart shows this many hours (like the air forecast of the axis card). */
export const ROAD_VS_AXIS_CHART_H = 24;

export interface RoadVsValue {
  step: number;
  validMs: number;
  tf: number;
  sigma: number | null;
  src: RoadVsSrc;
  cond: VsCondition | null;
  grip: VsGrip | null;
  /** Slipperiness potential without salting, 0 … 100 %. */
  glaetteP: number | null;
  filmMm: number | null;
  tfBridge: number | null;
  /** P(V < 1 000 / 300 / 150 / 50 m) in %, null = none. */
  vis: [number | null, number | null, number | null, number | null];
  visSrc: RoadVsSrc | null;
}

const COND_OF_CODE: ReadonlyArray<VsCondition> = Object.entries(ROAD_VS_CONDITION_CODE).sort((a, b) => a[1] - b[1]).map(([k]) => k as VsCondition);
const GRIP_OF_CODE: ReadonlyArray<VsGrip> = Object.entries(ROAD_VS_GRIP_CODE).sort((a, b) => a[1] - b[1]).map(([k]) => k as VsGrip);

/** Step index of an hour in the run (the nearest full hour), null outside 0 … steps − 1. */
export function roadVsStep(file: Pick<RoadVsProductFile, 't0Ms' | 'steps'>, ms: number): number | null {
  const i = Math.round((ms - file.t0Ms) / H);
  return i >= 0 && i < file.steps ? i : null;
}

/** The value of a point at an hour — null when the run has no road temperature there (origin `unbekannt` ⇒ null too). */
export function roadVsValue(p: RoadVsProductPoint, file: Pick<RoadVsProductFile, 't0Ms' | 'steps'>, ms: number): RoadVsValue | null {
  const i = roadVsStep(file, ms);
  if (i == null) return null;
  const tf = roadVsProductDecode('tf', p.v.tf[i]);
  const src = roadVsSrcOf(p.v.tf_src[i]);
  if (tf == null || src == null || src === 'unbekannt') return null;
  const code = p.v.zustand[i], g = p.v.griff[i];
  const pct = (k: 'vis_p1000' | 'vis_p300' | 'vis_p150' | 'vis_p50') => roadVsProductDecode(k, p.v[k][i]);
  return {
    step: i, validMs: file.t0Ms + i * H, tf, sigma: roadVsProductDecode('tf_sigma', p.v.tf_sigma[i]), src,
    cond: code != null ? COND_OF_CODE[code] ?? null : null, grip: g != null ? GRIP_OF_CODE[g] ?? null : null,
    glaetteP: roadVsProductDecode('glaette_p', p.v.glaette_p[i]), filmMm: roadVsProductDecode('wasserfilm_mm', p.v.wasserfilm_mm[i]),
    tfBridge: roadVsProductDecode('tf_bruecke', p.v.tf_bruecke[i]),
    vis: [pct('vis_p1000'), pct('vis_p300'), pct('vis_p150'), pct('vis_p50')], visSrc: roadVsSrcOf(p.v.vis_src[i]),
  };
}

/**
 * Road class of a computed value, in the colours of the measured classes (the marker LOOKS like a sensor, Jan 28.10.):
 * every frozen condition ⇒ `ice`, wet/damp ⇒ `wet`, dry at or below 0 °C ⇒ `frost`, dry above ⇒ `dry`; no condition ⇒ `unknown`.
 */
export function roadVsClassOf(v: Pick<RoadVsValue, 'cond' | 'tf'>): RoadClass {
  switch (v.cond) {
    case 'glatteis': case 'schneeglaette': case 'schneematsch': case 'eis': case 'reifglaette': return 'ice';
    case 'nass': case 'feucht': return 'wet';
    case 'trocken': return v.tf <= 0 ? 'frost' : 'dry';
    default: return 'unknown';
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** `Trocken` / `Reifglätte` / `Zustand unbekannt`. */
export const roadVsCondText = (v: Pick<RoadVsValue, 'cond'>): string => (v.cond ? cap(VS_CONDITION_LABEL[v.cond]) : 'Zustand unbekannt');
/** Badge of the computed value: `Trocken · berechnet`. */
export const roadVsBadgeText = (v: Pick<RoadVsValue, 'cond'>): string => `${roadVsCondText(v)} · ${ROAD_VS_WORD}`;
/** `Fahrbahn +1,2 °C · berechnet · Reifglätte` */
export const roadVsText = (v: Pick<RoadVsValue, 'tf' | 'cond'>): string => `Fahrbahn ${f1(v.tf)} °C · ${ROAD_VS_WORD}${v.cond ? ` · ${VS_CONDITION_LABEL[v.cond]}` : ''}`;
/** `typisch ± 1,3 K`, empty without σ. */
export const roadVsSigmaText = (v: Pick<RoadVsValue, 'sigma'>): string => (v.sigma == null ? '' : `typisch ± ${dec(v.sigma)} K`);

/** When the station last had a valid road value (ms) — from the 24-h ring of its group; null = unknown / not in the ring. */
export function roadLastValueMs(ring: RoadH24File | null, id: string, group: string | null | undefined): number | null {
  if (!ring || (group && ring.group !== group) || !ring.slots.length) return null;
  const st = ring.stations[id];
  if (!st) return null;
  for (let i = ring.slots.length - 1; i >= 0; i--) if (st.rs[i] != null) return roadStampToMs(ring.slots[i]);
  return null;
}

/** One line of origin for the hero sub-line: `berechnet · gekoppelt · Sensor aus seit 06:15 UTC`. */
export function roadVsOriginText(v: Pick<RoadVsValue, 'src'>, sensorOffSinceMs: number | null = null): string {
  const d = roadVsDisplay(v.src, { sensorOffSinceMs });
  return d.detail ? `${d.word} · ${d.detail}` : d.word;
}

export interface RoadVsInfoInput {
  point: Pick<RoadVsProductPoint, 'kind' | 'bridge' | 'kaltstart' | 'couple' | 'corr' | 'szenario'>;
  value: RoadVsValue;
  file: Pick<RoadVsProductFile, 't0Ms' | 'run' | 'engine'>;
  /** Station: when the sensor last reported a valid road value (null = unknown). */
  sensorOffSinceMs?: number | null;
}

/**
 * The info tab (click on the small mark next to a computed value): what the value is, where it comes from, how wide its
 * error is, what the condition means — every sentence a fact the page can prove from the file. Pure strings.
 */
export function roadVsInfoLines(i: RoadVsInfoInput): string[] {
  const { point, value: v, file } = i;
  const out: string[] = [];
  out.push(`Dieser Fahrbahnwert ist nicht gemessen. ${ROAD_VS_NAME} rechnet ihn aus der Energiebilanz der Fahrbahn (Modell nach RoadSurf) mit ICON-D2 und der Streckenprognose, ${point.kind === 'station' ? 'an dieser Messstelle' : 'an diesem Punkt der Achse'}${point.bridge ? ' (Brückensäule)' : ''}.`);
  if (v.src === 'gekoppelt') {
    const off = i.sensorOffSinceMs != null ? ` Der Sensor meldet seit ${hm(i.sensorOffSinceMs)} keinen gültigen Fahrbahnwert.` : '';
    const c = point.couple;
    out.push(`An die letzte gültige Messung dieser Anlage gekoppelt${c ? ` (Messung ${dec(c.ageH)} h alt, ${c.mode === 'sw' ? 'Sonnen' : 'Wärme'}strahlung × ${dec(c.c, 2)}${c.converged ? '' : ', nicht konvergiert'})` : ''}; die Kopplung klingt über 4 h ab.${off}`);
  } else if (v.src === 'modelliert') {
    const corr = point.corr;
    out.push(corr ? `Ohne aktuelle Messung: Modell mit Standortkorrektur ${f1(corr.k)} K aus ${corr.from === 'station' ? 'der eigenen Messreihe' : `${corr.n} Nachbaranlagen`}.` : 'Ohne aktuelle Messung und noch ohne Standortkorrektur (die Residuen-Tabelle braucht 7 Tage Schattenbetrieb).');
  } else if (v.src === 'gemessen') {
    out.push('Zu dieser Stunde liegt eine gültige Messung vor; der Modellwert dient nur dem Kreuzvergleich.');
  }
  const sig = roadVsSigmaText(v);
  if (sig) out.push(`Streuung: ${sig}${v.src === 'modelliert' ? ', in klaren, windschwachen Nächten, an Brücken und in Kältesenken mehr' : ''}.`);
  if (point.kaltstart) out.push('Kaltstart: die Fahrbahnsäule ist noch nicht eingeschwungen, der Untergrund kann um einige Kelvin abweichen.');
  out.push(`${VS_SCENARIO_TEXT}: ${v.cond ? `Zustand ${VS_CONDITION_LABEL[v.cond]}` : 'Zustand unbekannt'}${v.grip ? `, Griff ${VS_GRIP_LABEL[v.grip]}` : ''}${v.glaetteP != null ? `, Glättepotenzial ${Math.round(v.glaetteP)} %` : ''}${v.filmMm != null ? `, Wasserfilm ${dec(v.filmMm, 2)} mm` : ''}. Streuung durch den Winterdienst ist nicht berücksichtigt.`);
  if (v.tfBridge != null) out.push(`Brückensäule (Beton, Unterseite an der Luft): ${f1(v.tfBridge)} °C.`);
  if (v.vis[0] != null) out.push(`Sicht: P(< 1 000 m) ${Math.round(v.vis[0])} %${v.vis[1] != null ? `, P(< 300 m) ${Math.round(v.vis[1])} %` : ''}${v.visSrc ? ` · ${v.visSrc}` : ''}.`);
  out.push(`Lauf ${hm(file.t0Ms)} (ICON-D2 ${file.engine.forcing.run}${file.engine.fusionRun ? `, buscosun Fusion ${file.engine.fusionRun}` : ''}) · Schattenbetrieb ohne Gütenachweis (Gate G offen) · sichtbar nur mit ?roadvs=1.`);
  return out;
}

/** Hourly computed road temperature between two times (chart, dashed): `[hours from refMs, tf]`. */
export function roadVsSeries(p: RoadVsProductPoint, file: Pick<RoadVsProductFile, 't0Ms' | 'steps'>, refMs: number, fromH: number, toH: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < file.steps; i++) {
    const dh = (file.t0Ms + i * H - refMs) / H;
    if (dh < fromH || dh > toH) continue;
    const tf = roadVsProductDecode('tf', p.v.tf[i]);
    const src = roadVsSrcOf(p.v.tf_src[i]);
    if (tf != null && src != null && src !== 'unbekannt') out.push([dh, tf]);
  }
  return out;
}

/** `VS-Lauf 09:00` — the run as the page names it. */
export const roadVsRunLabel = (file: Pick<RoadVsProductFile, 't0Ms'>): string => `VS-Lauf ${hm(file.t0Ms)}`;

/** Row of the sources tab: active while a usable run is shown, else what is planned. */
export function roadVsSourceRow(on: boolean): { cc: string; what: string; status: 'aktiv' | 'geplant' } {
  return on
    ? { cc: 'DE', status: 'aktiv', what: `Fahrbahntemperatur, -zustand, Wasserfilm und Sicht 0 … ${ROAD_VS_HORIZON_H} h an jedem Punkt der Strecke, ${ROAD_VS_WORD} (Energiebilanz nach RoadSurf auf ICON-D2 und buscosun Fusion, an Glättemeldeanlagen gekoppelt) · Schattenbetrieb, Gate G offen, nur mit ?roadvs=1` }
    : { cc: 'DE', status: 'geplant', what: 'Fahrbahntemperatur und -zustand 0 … 48 h an jedem Punkt — Schattenbetrieb bis Gate G' };
}
