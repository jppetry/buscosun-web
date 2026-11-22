/**
 * Phase GO — pure view rules of "Gemessen in der Nähe" (`GlacierStationCard.tsx`): which stations and values the glacier brief shows
 * next to the model values, or why a value is "Keine Daten". DOM-free, so the verifier reads the same rules as the page.
 *
 * Rules:
 *  - a glacier without a station in the mapping shows NOTHING (`null`) — no empty card, no nearest-anything fallback;
 *  - a value is shown only when the hour document carries it AND it is younger than `STN_MAX_AGE_MS` against the reader's clock;
 *    otherwise the row says "Keine Daten" with the reason (too old, dropped by a check, no value this hour, hour not loadable);
 *  - the text states what the instrument reads. No comparison with the model value, no word about conditions.
 *
 * Phase GI: the view reads the section `ext` of both documents when it is there (IMIS stations, the change of the snow depth) and
 * says where a distance counts from — the glacier's outline, or (mapping from before phase GI) one point of it.
 */
import { fmt0, fmt1, fmtSigned } from './glacierView';
import { compassOf } from './glacierWeatherView';
import {
  GLACIER_STN_SOURCES, STN_HSD_KEYS, STN_MAX_AGE_MS, STN_QUANTITIES, STN_REJECT_TEXT, stnHourEntries, stnHsdName, stnMapSection,
  type GlacierStnSource, type StnEntry, type StnHourDoc, type StnMapDoc, type StnMapFrom, type StnNet, type StnQuantity, type StnVar,
} from './glacierStationContract';

const MIN = 60_000;

export interface StnViewValue {
  q: StnQuantity; label: string;
  /** The reading in words, or `null` = "Keine Daten" with `why`. */
  text: string | null;
  why?: string;
  /** Stamp of the value (ms UTC) when shown. */
  ms?: number;
}
export interface StnViewStation {
  id: string; name: string; elev: number; operator: string; net: StnNet;
  /** Position of the station as the mapping names it (phase DK-H: the dossier map draws it). */
  lat: number; lon: number;
  /** Link of the operator's name, when the source asks for one (SLF). */
  operatorUrl?: string;
  /** Distance in km — to the glacier's outline (0 = on its edge) or, in a mapping from before phase GI, to its catalogue point. */
  km: number;
  /** Station elevation − median elevation of the glacier (m). */
  dz: number;
  /** Newest stamp among the shown values, `null` when none is shown. */
  ms: number | null;
  values: StnViewValue[];
}
export interface StnView { stations: StnViewStation[]; sources: GlacierStnSource[]; hour: string | null; /** Where the distances count from. */ from: StnMapFrom }

/** Variable (or sum) behind a quantity, in the order the page prefers. */
const VAR_OF: Readonly<Record<Exclude<StnQuantity, 'precip' | 'dsnow'>, StnVar>> = { t: 't', wind: 'ff', gust: 'fx', snow: 'snow', rad: 'gr' };
/** Names under which the producer lists a dropped value of a quantity in `rejected`. */
const REJECT_NAMES = (q: StnQuantity): readonly string[] => (q === 'precip' ? ['rr24h', 'rr6h', 'rr1h'] : q === 'dsnow' ? STN_HSD_KEYS.map(stnHsdName) : [VAR_OF[q]]);
const HSD_SPAN = { h24: '24 Stunden', h48: '48 Stunden', h72: '72 Stunden' } as const;
const kmh = (ms: number) => Math.round(ms * 3.6);
/** Sensors scatter a little below zero at bare ground and at night; the page shows such a reading as 0 (said in the card's fine print). */
const floor0 = (v: number) => Math.max(0, Math.round(v));

/** Elevation difference in words: "27 m über der mittleren Höhe". */
export const dzText = (dz: number): string => (dz === 0 ? 'auf der mittleren Höhe des Gletschers' : `${fmt0(Math.abs(dz))} m ${dz > 0 ? 'über' : 'unter'} der mittleren Höhe des Gletschers`);
/**
 * Distance in words. Measured to the outline: "1,9 km vom Rand des Gletschers", or "am Rand des Gletschers" below 0.1 km (a station
 * on a rock island or right at the edge). A mapping from before phase GI measured from one point of the glacier: "3,7 km entfernt".
 */
export const whereText = (km: number, from: StnMapFrom): string => (from === 'outline' ? (km < 0.05 ? 'am Rand des Gletschers' : `${fmt1(km)} km vom Rand des Gletschers`) : `${fmt1(km)} km entfernt`);
/** Age in words: "vor 12 Minuten", "vor 1 Stunde 20 Minuten". */
export function ageText(ageMs: number): string {
  const m = Math.max(0, Math.round(ageMs / MIN));
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} ${m === 1 ? 'Minute' : 'Minuten'}`;
  const h = Math.floor(m / 60), r = m % 60;
  return `vor ${h} ${h === 1 ? 'Stunde' : 'Stunden'}${r ? ` ${r} ${r === 1 ? 'Minute' : 'Minuten'}` : ''}`;
}

function valueOf(q: StnQuantity, e: StnEntry, nowMs: number): { text: string; ms: number } | { why: string } {
  const stationMs = Date.parse(e.t);
  const tooOld = (ms: number) => nowMs - ms > STN_MAX_AGE_MS;
  if (q === 'precip') {
    if (tooOld(stationMs)) return { why: STN_REJECT_TEXT.stale };
    const s = e.rr24h ? ([e.rr24h, '24 Stunden'] as const) : e.rr6h ? ([e.rr6h, '6 Stunden'] as const) : e.rr1h ? ([e.rr1h, '1 Stunde'] as const) : null;
    return s ? { text: `${fmt1(s[0].mm)} mm in ${s[1]}`, ms: stationMs } : { why: 'kein Wert im jüngsten Abruf' };
  }
  if (q === 'dsnow') {
    // the change of the snow depth as the network delivers it: signed, per span, no word for what it means
    if (tooOld(stationMs)) return { why: STN_REJECT_TEXT.stale };
    const parts = STN_HSD_KEYS.filter((k) => e.hsd?.[k] != null).map((k) => `${fmtSigned(e.hsd![k]!)} cm in ${HSD_SPAN[k]}`);
    return parts.length ? { text: parts.join(' · '), ms: stationMs } : { why: 'kein Wert im jüngsten Abruf' };
  }
  const k = VAR_OF[q];
  const own = e.v?.[k], old = e.older?.[k];
  const v = own ?? old?.v, ms = own != null ? stationMs : old ? Date.parse(old.t) : NaN;
  if (v == null || !Number.isFinite(ms)) return { why: 'kein Wert im jüngsten Abruf' };
  if (tooOld(ms)) return { why: STN_REJECT_TEXT.stale };
  if (q === 't') return { text: `${fmt1(v)} °C`, ms };
  if (q === 'wind') { const dd = e.v?.dd ?? e.older?.dd?.v; return { text: `${kmh(v)} km/h${dd != null && v > 0 ? ` aus ${compassOf(dd)}` : ''}`, ms }; }
  if (q === 'gust') return { text: `${kmh(v)} km/h`, ms };
  if (q === 'snow') return { text: `${fmt0(floor0(v))} cm`, ms };
  return { text: `${fmt0(floor0(v))} W/m²`, ms };
}

/**
 * What the brief shows for glacier `id`: the mapped stations (nearest first, each with its quantities) — or `null` when the mapping
 * names no station for it. `hour === null` = the hour document is not loadable: every value is "Keine Daten" with that reason.
 */
export function stationView(map: StnMapDoc | null, hour: StnHourDoc | null, id: string, nowMs: number): StnView | null {
  // the section `ext` (every network and quantity) when the document has one, else the mapping of phase GO
  const sec = map ? stnMapSection(map) : null;
  const hits = sec?.glaciers[id];
  if (!sec || !hits) return null;
  const entries = hour ? stnHourEntries(hour) : null;
  const by = new Map<string, StnViewStation>();
  for (const q of STN_QUANTITIES) {
    const h = hits[q.key];
    const meta = h ? sec.stations[h[0]] : null;
    if (!h || !meta) continue;
    let st = by.get(h[0]);
    if (!st) {
      const url = GLACIER_STN_SOURCES.find((x) => x.id === meta.net)?.operatorUrl;
      st = { id: h[0], name: meta.name, elev: meta.elev, operator: meta.op, net: meta.net, lat: meta.lat, lon: meta.lon, ...(url ? { operatorUrl: url } : {}), km: h[1], dz: h[2], ms: null, values: [] };
      by.set(h[0], st);
    }
    const e = entries?.[h[0]];
    let val: StnViewValue;
    if (!hour) val = { q: q.key, label: q.label, text: null, why: 'die jüngsten Messwerte sind nicht ladbar' };
    else {
      const r = e ? valueOf(q.key, e, nowMs) : null;
      if (r && 'text' in r) { val = { q: q.key, label: q.label, text: r.text, ms: r.ms }; st.ms = Math.max(st.ms ?? 0, r.ms); }
      else {
        // dropped by a check of the producer? then say which one
        const what = REJECT_NAMES(q.key);
        const rej = hour.rejected.find((x) => x[0] === h[0] && what.includes(x[1]));
        val = { q: q.key, label: q.label, text: null, why: rej ? STN_REJECT_TEXT[rej[2]] : r && 'why' in r ? r.why : 'kein Wert im jüngsten Abruf' };
      }
    }
    st.values.push(val);
  }
  if (!by.size) return null;
  const stations = [...by.values()].sort((a, b) => a.km - b.km || (a.id < b.id ? -1 : 1));
  const nets = new Set(stations.map((s) => s.net));
  return { stations, sources: GLACIER_STN_SOURCES.filter((s) => nets.has(s.id)), hour: hour?.hour ?? null, from: sec.rule.from === 'outline' ? 'outline' : 'catalogue point' };
}

/** Every sentence the card can render for a view — the verifier runs `glacierForbiddenWords` over it. */
export function stationViewTexts(v: StnView, nowMs: number): string[] {
  return v.stations.flatMap((s) => [s.name, `Betreiber: ${s.operator}`, whereText(s.km, v.from), dzText(s.dz), ...(s.ms != null ? [ageText(nowMs - s.ms)] : []), ...s.values.map((x) => `${x.label} ${x.text ?? `Keine Daten: ${x.why}`}`)]);
}
