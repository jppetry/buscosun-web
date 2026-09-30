/**
 * Baut das View-Model des Dashboards aus buscosun Fusion (neueste Stufe) und den Alternativquellen — rein, ohne
 * Netz, headless prüfbar (`verify:dashboard`). Jede Zahl stammt aus einem Eingang; jede Zusammenfassung folgt einer
 * benannten Regel (`rules.ts`); fehlt eine Quelle, steht „nicht verfügbar" mit Grund (`Shown.na`).
 */
import type { Dist } from '../../pointForecast/fusion/dist';
import type { StepV2, VarIdV2 } from '../../pointForecast/fusion/output';
import { DASH_RANGE_DAYS, DASH_RANGE_HOURS } from '../dashUrl';
import { compass16, compass8, dateTime, dayLabel, hhmm, localParts, num, runLabel, withUnit } from '../format';
import { ORIGIN, type ParamId } from '../origin';
import {
  bandMarks, confidenceClass, confidenceWord, dayText, DRY_MMH, spreadText, gammaWord, GUST_WARN_MS, isothermColor, isotherms,
  leadSentence, PHASES, popLevel, snowlineShown, symbolFor, tempAt, thunderWord, WET_DAY_MM, type LeadDay,
} from './rules';
import type {
  CloudsVM, ConfVM, DashboardVM, DashInputs, DayVM, HourlyVM, IconD2VM, NowcastVM, NowVM, PhaseVM, PollenVM, Shown,
  TerrainVM, TopVM, UvVM, WarningVM, WindVM, ZoneVM, FusionIn,
} from './types';

const H = 3_600_000;
const NBSP = ' ';

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

export const sh = (o: ParamId, t: string | null, na?: string): Shown => (na ? { t: null, o, na } : { t, o });
/** Noch kein Wert — oder, wenn buscosun Fusion gescheitert ist, „nicht verfügbar" statt eines ewigen „…". */
let FUSION_FAILED = false;
const loading = (o: ParamId): Shown => (FUSION_FAILED && (ORIGIN[o].kind === 'fusion' || ORIGIN[o].kind === 'fusion-derived' || o === 'P16' || o === 'P70')
  ? { t: null, o, na: 'buscosun Fusion nicht erreichbar' } : { t: null, o });
const na = (o: ParamId, why: string): Shown => ({ t: null, o, na: why });
/** Wert oder — wenn er fehlt — „nicht verfügbar" mit dem Grund. */
const orNa = (o: ParamId, t: string | null, why: string): Shown => (t == null ? na(o, why) : { t, o });

function v(step: StepV2 | undefined, id: VarIdV2, q: 'p10' | 'p50' | 'p90' | 'mean' = 'p50'): number | null {
  const x = step?.vars[id]?.[q];
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}
/**
 * P(Niederschlag > 0) je Stunde aus der Verteilung der Fusion (Hürde: 1 − pDry); ohne Verteilung `null`. Die
 * Verteilungsrechnung (`exceedance`) wird übergeben — im Browser aus dem Cube-Modul, das ohnehin geladen ist, damit der
 * Fusionskern nicht in einen zweiten Chunk wandert.
 */
export function pWetOf(v2: FusionIn['v2'], exceedance: (d: Dist, x: number) => number): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const s of v2.axis.steps) {
    const d = s.vars.precip?.dist;
    const p = d ? exceedance(d, 0) : NaN;
    out[s.validAtMs] = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : null;
  }
  return out;
}
let PWET: Record<number, number | null> = {};
function pWet(step: StepV2 | undefined): number | null {
  return step ? PWET[step.validAtMs] ?? null : null;
}
const confOf = (step: StepV2 | undefined): number | null => {
  const c = step?.vars.t2m?.confidence?.score;
  return typeof c === 'number' && Number.isFinite(c) ? c : null;
};
const mean = (xs: Array<number | null>): number | null => {
  const f = xs.filter((x): x is number => x != null);
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
};
const maxOf = (xs: Array<number | null>): number | null => {
  const f = xs.filter((x): x is number => x != null);
  return f.length ? Math.max(...f) : null;
};
const minOf = (xs: Array<number | null>): number | null => {
  const f = xs.filter((x): x is number => x != null);
  return f.length ? Math.min(...f) : null;
};
const pct = (x: number | null) => (x == null ? null : `${Math.round(x * 100)}${NBSP}%`);
const deg = (x: number | null) => (x == null ? null : `${Math.round(x)}°`);

function nextDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
/** Mittag (12:00 Ortszeit ≈ 10:00/11:00 UTC) eines Tages-Schlüssels — nur für Beschriftungen. */
function noonMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 11, 0, 0);
}

const NA_FUSION = 'buscosun Fusion hat für diese Stunde keinen Wert';
const NA_PAST = 'vergangen — die Fusion rechnet ab der laufenden Stunde';

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

export function buildDashboardVM(inp: DashInputs): DashboardVM {
  const f = inp.fusion;
  const steps = f ? [...f.v2.axis.steps].sort((a, b) => a.validAtMs - b.validAtMs) : [];
  const status: DashboardVM['status'] = !inp.place ? 'noplace' : f ? 'ok' : inp.fusionState === 'error' ? 'error' : 'loading';
  PWET = f?.pWet ?? {};
  FUSION_FAILED = !f && inp.fusionState === 'error';
  const ctx: Ctx = { inp, f, steps, s0: steps[0], hOrt: f?.v2.point.hTrue ?? null };
  return {
    nowMs: inp.nowMs,
    place: inp.place,
    range: inp.range,
    status,
    error: inp.fusionError,
    top: buildTop(ctx),
    now: buildNow(ctx),
    warning: buildWarning(inp),
    conf: buildConf(ctx),
    zone: buildZone(ctx),
    nowcast: buildNowcast(inp),
    clouds: buildClouds(ctx),
    wind: buildWind(ctx),
    terrain: buildTerrain(ctx),
    uv: buildUv(inp),
    pollen: buildPollen(inp),
    icond2: buildIconD2(inp),
    footer: FOOTER,
    notes: f?.notes ?? [],
  };
}

interface Ctx { inp: DashInputs; f: FusionIn | null; steps: StepV2[]; s0: StepV2 | undefined; hOrt: number | null }

/** Quellenzeile (Fuß): die Quellen, die das Dashboard wirklich liest (audit/dashboard.md §4.6, E-DB-13). */
export const FOOTER = '● DWD (ICON-D2, ICON-EU, ICON, AICON, MOSMIX, CAP, UV, Pollen, BrightSky, RADOLAN, KONRAD3D) · GeoSphere (C-LAEF, INCA, TAWES, Warnungen) · MeteoSchweiz (ICON-CH1/CH2, RZC, SMN, POH/MESHS) · ECMWF (IFS, AIFS) · MeteoAlarm · Meteostat (Klimatologie) · keine Tracker';

// ---------------------------------------------------------------------------
// Kopf
// ---------------------------------------------------------------------------

function buildTop(c: Ctx): TopVM {
  const { inp, f } = c;
  const name = inp.place?.name ?? null;
  const notes = f?.notes ?? [];
  const stageMissing = notes.some((n) => /stage:fs — keine gelernten Tabellen|ohne Lernstufe/.test(n));
  const status: TopVM['status'] = !inp.place ? { text: 'KEIN ORT', tone: 'wait' }
    : f ? (stageMissing ? { text: 'FUSION · OHNE LERNSTUFE', tone: 'warn' } : { text: 'FUSION LIVE', tone: 'ok' })
      : inp.fusionState === 'error' ? { text: 'FUSION FEHLER', tone: 'err' } : { text: 'FUSION LÄDT', tone: 'wait' };
  return {
    place: sh('P01', name),
    elev: f ? orNa('P02', withUnit(c.hOrt, 0, 'm'), 'Höhe am Ort unbekannt') : loading('P02'),
    run: f ? orNa('P03', runLabel(f.v2.provenance.runs.t1?.run ?? null), 'kein t1-Lauf') : loading('P03'),
    anchorTime: na('P04', 'Die Stationsdaten tragen keine Messzeit (V-DB-2)'),
    status,
  };
}

// ---------------------------------------------------------------------------
// Jetzt
// ---------------------------------------------------------------------------

function buildNow(c: Ctx): NowVM {
  const s0 = c.s0;
  const f = c.f;
  if (!f || !s0) {
    const l = (o: ParamId) => loading(o);
    return { temp: l('P06'), unit: '°C', icon: null, td: l('P08'), rh: l('P09'), windGust: l('P10'), ps: l('P12'), psLabel: 'DRUCK AM ORT',
      chips: [l('P13'), l('P14'), l('P15'), l('P16')], source: l('P17') };
  }
  // Nacht = Sonne unter dem Horizont an Stunde 0 (NOAA-Sonnenstand, beim Empfang berechnet — `FusionIn.night0`).
  const night = f.night0 ?? false;
  const icon = symbolFor({ clct: v(s0, 'clct'), popMax: pWet(s0), mmhMax: v(s0, 'precip', 'mean'), night });
  const w = v(s0, 'wind'), g = v(s0, 'gust');
  const wg = w == null && g == null ? null : `${num(w, 1) ?? '—'} / ${num(g, 1) ?? '—'}`;
  const dir = v(s0, 'windDir');
  const ps = v(s0, 'ps');
  // Druckflächen aus dem Cube (E-DB-8): nur Flächen über Grund (p < ps am Ort), sonst „—".
  const row = nearestCell(f, s0.validAtMs);
  const lvl = (p: 925 | 850 | 700, t: number | null) => (t == null || (ps != null && p > ps) ? '—' : num(t, 0));
  const levels = row ? `925 / 850 / 700${NBSP}hPa · ${lvl(925, row.v.t925)} / ${lvl(850, row.v.t850)} / ${lvl(700, row.v.t700)}${NBSP}°C` : null;
  const anchor = s0.members.find((m) => m.product === 'anchor')?.anchor;
  const src = anchor && anchor.sources.length
    ? `${sourceNames(anchor.sources)} · ${anchor.sources.length} ${anchor.sources.length === 1 ? 'Station' : 'Stationen'}`
    : null;
  return {
    temp: orNa('P06', num(v(s0, 't2m'), 1), NA_FUSION),
    unit: '°C',
    icon,
    td: orNa('P08', withUnit(v(s0, 'td2m'), 1, '°C'), NA_FUSION),
    rh: orNa('P09', withUnit(v(s0, 'rh'), 0, '%'), NA_FUSION),
    windGust: orNa('P10', wg, NA_FUSION),
    ps: orNa('P12', withUnit(ps, 0, 'hPa'), NA_FUSION),
    psLabel: 'DRUCK AM ORT',
    chips: [
      orNa('P13', dir == null ? null : `Wind ${compass16(dir)} · ${Math.round(dir)}°`, 'Richtung unbestimmt (Konzentrationsschranke der Fusion)'),
      orNa('P14', v(s0, 'clct') == null ? null : `Bewölkung ${num(v(s0, 'clct'), 0)}${NBSP}%`, NA_FUSION),
      orNa('P15', v(s0, 'snowline') == null ? null : `Schneegrenze ${withUnit(v(s0, 'snowline'), 0, 'm')}`, 'keine Schneegrenze in dieser Stufe'),
      orNa('P16', levels, 'keine Druckflächen im Cube-Schritt'),
    ],
    source: orNa('P17', src, 'ohne Messanker'),
  };
}

/** Anker-Quellen „brightsky:…", „tawes:…", „smn:…" ⇒ Netzname(n). */
function sourceNames(sources: string[]): string {
  const nets = new Set<string>();
  for (const s of sources) {
    const k = s.split(/[:/]/)[0].toLowerCase();
    nets.add(k.includes('bright') || k.includes('dwd') ? 'BrightSky' : k.includes('tawes') ? 'TAWES' : k.includes('smn') ? 'SMN' : s.split(/[:/]/)[0]);
  }
  return [...nets].join(' + ');
}

function nearestCell(f: FusionIn, t: number) {
  let best = null as FusionIn['cells'][number] | null;
  let bd = Infinity;
  for (const r of f.cells) {
    const d = Math.abs(r.validAtMs - t);
    if (d < bd) { bd = d; best = r; }
  }
  return best && bd <= 3 * H ? best : null;
}

// ---------------------------------------------------------------------------
// Warnung (wörtlich)
// ---------------------------------------------------------------------------

function buildWarning(inp: DashInputs): WarningVM {
  const w = inp.warnings;
  if (!inp.place || w.state === 'loading') return { state: 'loading', channel: w.channel, quote: null, footer: 'lädt …' };
  if (w.state === 'na') return { state: 'na', channel: w.channel, quote: null, footer: w.note ?? 'für dieses Land nicht verfügbar' };
  if (w.state === 'error') return { state: 'error', channel: w.channel, quote: null, footer: w.note ?? 'Warnungen nicht abrufbar — kein Ersatztext' };
  const items = [...w.items].sort((a, b) => b.severityRank - a.severityRank || (a.onsetMs ?? 0) - (b.onsetMs ?? 0));
  const stamp = w.stampMs != null ? `Stand ${hhmm(w.stampMs)}` : null;
  if (!items.length) {
    return { state: 'none', channel: w.channel, quote: null, footer: [stamp, w.channel, w.note].filter(Boolean).join(' · ') };
  }
  const top = items[0];
  // Wörtlich: Überschrift und Beschreibung unverändert, nur mit Gedankenstrich verbunden (keine Kürzung, keine Umformung).
  const quote = [top.headline, top.description].filter((x): x is string => !!x && !!x.trim()).join(' — ');
  const parts = [
    top.expiresMs != null ? `gültig bis ${dateTime(top.expiresMs)}` : 'gültig bis auf Widerruf',
    'wörtlich zitiert',
    top.sender ?? w.channel,
    items.length > 1 ? `1 von ${items.length}` : null,
    w.note,
  ];
  return { state: 'active', channel: w.channel, quote: quote || null, footer: parts.filter(Boolean).join(' · ') };
}

// ---------------------------------------------------------------------------
// Konfidenz & Quellen
// ---------------------------------------------------------------------------

const MODEL_NAMES: Record<string, string> = {
  icon_d2: 'ICON-D2', icon_d2_eps: 'ICON-D2-EPS', icon_eu: 'ICON-EU', icon_eu_eps: 'ICON-EU-EPS', icon_global: 'ICON', icon_eps_global: 'ICON-EPS',
  icon_ch1_eps: 'ICON-CH1', icon_ch2_eps: 'ICON-CH2', claef: 'C-LAEF', claef_eps: 'C-LAEF-EPS', aicon: 'AICON', ifs_hres: 'IFS', ifs_ens: 'IFS-ENS',
  aifs_single: 'AIFS', mosmix_l: 'MOSMIX',
};
export const modelName = (id: string) => MODEL_NAMES[id] ?? id;

/** Farben der Gewichtsleiste nach Produkt (Vorlage: Terracotta, Stahl, Salbei, Stein). */
const PRODUCT_COLOR: Record<string, string> = { 'cube-t1': '#C97B47', 'cube-t2': '#C97B47', 'cube-t3': '#C97B47', station: '#3A6FA8', nowcast: '#7A9466', climatology: '#6E675A' };

/** E-DB-23: halbe Breite des 80 %-Bands (p10–p90) der Temperatur. */
const halfBand = (s: StepV2 | undefined): number | null => {
  const lo = v(s, 't2m', 'p10'), hi = v(s, 't2m', 'p90');
  return lo == null || hi == null ? null : (hi - lo) / 2;
};

function buildConf(c: Ctx): ConfVM {
  const s0 = c.s0;
  if (!c.f || !s0) {
    return { pct: null, value: loading('P22'), word: loading('P23'), weights: [], weightsText: loading('P24'), band: loading('P89'), bandRange: loading('P89'), funnel: [], funnelMarks: [] };
  }
  // Trichter (P90) über den ganzen Horizont als Hüllkurve: jetzt, dann je 24 h die größte halbe Bandbreite — einzelne
  // Stunden mit eingeknicktem Band (Stufennähte, V-DB-21) machten die stündliche Kurve zum Strichcode.
  const t0 = s0.validAtMs;
  const hourly = c.steps.map((s) => ({ h: Math.round((s.validAtMs - t0) / H), half: halfBand(s) }))
    .filter((p): p is { h: number; half: number } => p.half != null);
  const funnel: ConfVM['funnel'] = hourly.length ? [hourly[0]] : [];
  const hEnd = hourly.length ? hourly[hourly.length - 1].h : 0;
  for (let from = 0; from < hEnd; from += 24) {
    const block = hourly.filter((p) => p.h > from && p.h <= from + 24);
    if (block.length) funnel.push({ h: Math.min(from + 24, hEnd), half: Math.max(...block.map((p) => p.half)) });
  }
  // Marken (P93) an der ersten Stunde je Schwelle — stündlich, wie im Stundenverlauf.
  const funnelMarks = bandMarks(c.steps.map((s) => ({ t: s.validAtMs, half: halfBand(s) })))
    .map((m) => ({ h: Math.round((m.t - t0) / H), k: m.k, label: `±${m.k}° ab ${dayLabel(m.t)}` }));
  const half0 = halfBand(s0);
  const score = confOf(s0);
  // Anteile an der Antwort: die Member (Modelle, Station, Radar) sind unter sich auf 1 normiert, die Klimatologie trägt
  // 1 − β (output.ts, K-3) ⇒ Member × β, Klimatologie × 1 — zusammen 100 %.
  const weights: ConfVM['weights'] = [];
  const vms = s0.vars.t2m?.members ?? [];
  const wClim = vms.find((m) => s0.members.find((x) => x.tag === m.tag)?.product === 'climatology' || m.tag === 'climatology')?.weight ?? 0;
  const beta = Math.max(0, 1 - (wClim ?? 0));
  for (const m of vms) {
    if (m.weight == null || m.weight <= 0) continue;
    const info = s0.members.find((x) => x.tag === m.tag);
    const product = info?.product ?? (m.tag === 'climatology' ? 'climatology' : 'cube-t1');
    const share = product === 'climatology' ? m.weight : m.weight * beta;
    let label: string;
    if (product.startsWith('cube-')) {
      const models = (info?.models ?? []).map(modelName);
      label = models.length ? (models.length > 1 ? `${models[0]} +${models.length - 1}` : models[0]) : product.toUpperCase();
    } else if (product === 'station') label = 'MOSMIX';
    else if (product === 'nowcast') label = 'Radar';
    else if (product === 'climatology') label = 'Klimatologie';
    else label = m.tag;
    if (Math.round(share * 100) > 0) weights.push({ label, pct: Math.round(share * 100), color: PRODUCT_COLOR[product] ?? '#6E675A' });
  }
  weights.sort((a, b) => b.pct - a.pct);
  return {
    pct: score == null ? null : Math.round(score * 100),
    value: orNa('P22', pct(score), 'keine Konfidenz für diese Stunde'),
    // E-DB-23: „Stunde 0" steht jetzt am 80-%-Satz („jetzt: …"), die ganze Kachel meint jetzt.
    word: orNa('P23', confidenceWord(score), 'keine Konfidenz'),
    weights,
    weightsText: orNa('P24', weights.length ? weights.map((w) => `${w.label} ${w.pct}${NBSP}%`).join(' · ') : null, 'keine Gewichte an Stunde 0'),
    band: orNa('P89', half0 == null ? null : `±${withUnit(half0, 1, '°C')}`, 'keine Temperaturverteilung an Stunde 0'),
    bandRange: orNa('P89', half0 == null ? null : `jetzt: 80${NBSP}% zwischen ${num(v(s0, 't2m', 'p10'), 1)} und ${withUnit(v(s0, 't2m', 'p90'), 1, '°C')}`, 'keine Temperaturverteilung an Stunde 0'),
    funnel,
    funnelMarks,
  };
}

// ---------------------------------------------------------------------------
// Prognose-Zone
// ---------------------------------------------------------------------------

function buildZone(c: Ctx): ZoneVM {
  const { inp, f, steps } = c;
  const rangeH = DASH_RANGE_HOURS[inp.range];
  const nDays = DASH_RANGE_DAYS[inp.range];
  const todayKey = localParts(inp.nowMs).dayKey;
  const keys: string[] = [todayKey];
  while (keys.length < nDays) keys.push(nextDayKey(keys[keys.length - 1]));
  const endKey = keys[keys.length - 1];
  const periodText = nDays === 1 ? dayLabel(noonMs(todayKey)) : `${dayLabel(noonMs(todayKey))} → ${dayLabel(noonMs(endKey))}`;
  if (!f || !steps.length) {
    return {
      head: { period: sh('P25', periodText), models: loading('P26'), ensemble: loading('P27'), conf: loading('P28'), confCls: 'good' },
      lead: loading('P91'),
      days: keys.map((k, i) => emptyDay(k, i)),
      hourly: null,
      hourlyHead: loading('P53'),
    };
  }
  const startMs = steps[0].validAtMs;
  const endMs = startMs + rangeH * H;
  const inRange = steps.filter((s) => s.validAtMs <= endMs);
  // Modelle der Stufen, die den Zeitraum tragen, + MOSMIX, wenn die Station beiträgt.
  const runs = f.v2.provenance.runs;
  const tiersUsed = new Set(inRange.map((s) => s.tier));
  const models: string[] = [];
  for (const t of ['t1', 't2', 't3'] as const) {
    const first = runs[t]?.models?.[0];
    if (tiersUsed.has(t) && first) models.push(modelName(first));
  }
  const withStation = inRange.some((s) => s.members.some((m) => m.product === 'station'));
  const modelsText = models.length ? `${models.join(' · ')}${withStation ? ' + MOSMIX' : ''}` : (withStation ? 'MOSMIX' : null);
  // Herkunft der Bandbreite (sigmaKind der Temperatur) an der ersten Stunde und bis wann sie ohne Wechsel gilt.
  const kind0 = steps[0].vars.t2m?.sigmaKind ?? null;
  const change = steps.find((s) => (s.vars.t2m?.sigmaKind ?? null) !== kind0);
  const changeH = change ? Math.round((change.validAtMs - startMs) / H) : null;
  const ens = spreadText(kind0, changeH != null && changeH <= rangeH ? changeH : null, rangeH);
  const confMean = mean(inRange.map(confOf));
  const built: BuiltDay[] = [];
  let prevTmax: number | null = null;
  for (let i = 0; i < keys.length; i++) {
    const d = buildDay(c, keys[i], i, prevTmax);
    built.push(d);
    prevTmax = d.tmax;
  }
  const days: DayVM[] = built.map((d) => d.vm);
  // Leitsatz (P91): immer heute, morgen, übermorgen — dieselben Tagesdaten wie die Karten, auch wenn „Heute" gewählt ist.
  const leadDays: LeadDay[] = [];
  let leadKey = todayKey;
  let leadPrev: number | null = null;
  for (let i = 0; i < 3; i++) {
    const d: BuiltDay = built[i] ?? buildDay(c, leadKey, i, leadPrev);
    leadDays.push({ name: i === 0 ? 'Heute' : i === 1 ? 'Morgen' : weekdayLong(noonMs(leadKey)), text: d.vm.text.t, tmax: d.vm.tmax.t, rain: d.rainSum, rainText: d.vm.rain.t });
    leadPrev = d.tmax;
    leadKey = nextDayKey(leadKey);
  }
  return {
    head: {
      period: sh('P25', periodText),
      models: orNa('P26', modelsText, 'keine Modellangabe'),
      ensemble: sh('P27', ens),
      conf: orNa('P28', confMean == null ? null : `Konfidenz ${Math.round(confMean * 100)}${NBSP}% im Mittel`, 'keine Konfidenz im Zeitraum'),
      confCls: confidenceClass(confMean),
    },
    lead: orNa('P91', leadSentence(leadDays), NA_FUSION),
    days,
    hourly: buildHourly(c, startMs, endMs, rangeH, ens),
    hourlyHead: sh('P53', `${rangeH}${NBSP}h · ${ens}`),
  };
}

const TITLE_PREFIX = ['Heute', 'Morgen', 'Übermorgen'];
const WEEKDAY_LONG: Record<string, string> = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' };
const weekdayLong = (ms: number) => { const wd = localParts(ms).wd; return WEEKDAY_LONG[wd] ?? wd; };

function emptyDay(key: string, index: number): DayVM {
  const l = (o: ParamId) => loading(o);
  return {
    key, title: `${TITLE_PREFIX[index] ? `${TITLE_PREFIX[index]} · ` : ''}${dayLabel(noonMs(key))}`, highlight: index === 0, text: l('P30'), icon: null, tmax: l('P32'), tmin: l('P32'),
    phases: PHASES.map((p) => ({ id: p.id, icon: null, temp: l('P34'), pop: l('P35'), popLevel: 'faint' as const, wind: l('P36'), highlight: false })),
    rain: l('P39'), rainWet: false, rainSub: l('P40'),
    mid: { label: 'BÖEN MAX', value: l('P41'), sub: l('P41'), subWarn: false },
    sun: na('P43', 'keine Sonnenschein-Quelle auf der Plattform (E-DB-10)'), sunSub: l('P44'),
    conf: { pct: null, text: l('P46'), cls: 'good' },
  };
}

interface BuiltDay { vm: DayVM; tmax: number | null; rainSum: number | null }

function buildDay(c: Ctx, key: string, index: number, prevTmax: number | null): BuiltDay {
  const { inp, steps } = c;
  const hoursOf = (k: string, from: number, to: number) => steps.filter((s) => {
    const p = localParts(s.validAtMs);
    return p.dayKey === k && p.h >= from && p.h < to;
  });
  const day = hoursOf(key, 0, 24);
  const title = `${TITLE_PREFIX[index] ? `${TITLE_PREFIX[index]} · ` : ''}${dayLabel(noonMs(key))}`;
  if (!day.length) {
    const vm = emptyDay(key, index);
    const why = 'jenseits des Fusionshorizonts';
    return {
      vm: { ...vm, title, text: na('P30', why), tmax: na('P32', why), tmin: na('P32', why),
        phases: vm.phases.map((p) => ({ ...p, temp: na('P34', why), pop: na('P35', why), wind: na('P36', why) })),
        rain: na('P39', why), rainSub: na('P40', why), mid: { label: 'BÖEN MAX', value: na('P41', why), sub: na('P41', why), subWarn: false },
        sunSub: na('P44', why), conf: { pct: null, text: na('P46', why), cls: 'fair' } },
      tmax: null,
      rainSum: null,
    };
  }
  const t50 = day.map((s) => v(s, 't2m'));
  const tmax = maxOf(t50), tmin = minOf(t50);
  const pops = day.map(pWet);
  const popMax = maxOf(pops);
  const rainSum = day.reduce((a, s) => a + (v(s, 'precip', 'mean') ?? 0), 0);
  const rainKnown = day.some((s) => v(s, 'precip', 'mean') != null);
  const mmhMax = maxOf(day.map((s) => v(s, 'precip', 'mean')));
  const daytime = hoursOf(key, 6, 18);
  const clctDay = mean(daytime.map((s) => v(s, 'clct')));
  const wetHours = day.filter((s) => (pWet(s) ?? 0) >= 0.5);
  const snowShare = wetHours.length ? wetHours.filter((s) => (v(s, 'pSnow') ?? 0) >= 0.5).length / wetHours.length : null;
  const sl = day.map((s) => v(s, 'snowline'));
  const slMin = minOf(sl);
  const slFirst = sl.find((x) => x != null) ?? null;
  const warnDay = warningOnDay(inp, key);
  const gusts = day.map((s) => v(s, 'gust'));
  const gustMax = maxOf(gusts);
  const gustAt = gustMax == null ? undefined : day[gusts.indexOf(gustMax)];
  const gustDir = gustAt ? v(gustAt, 'windDir') : null;
  const confMean = mean(day.map(confOf));
  const phases: PhaseVM[] = PHASES.map((p) => {
    const k = p.nextDay ? nextDayKey(key) : key;
    const hs = hoursOf(k, p.from, p.to);
    const past = !hs.length && index === 0 && !p.nextDay && localParts(inp.nowMs).h >= p.to;
    const why = past ? NA_PAST : 'jenseits des Fusionshorizonts';
    if (!hs.length) {
      return { id: p.id, icon: null, temp: na('P34', why), pop: na('P35', why), popLevel: 'faint' as const, wind: na('P36', why), highlight: false };
    }
    const pm = maxOf(hs.map(pWet));
    const gm = maxOf(hs.map((s) => v(s, 'gust')));
    const warn = gm != null && gm >= GUST_WARN_MS;
    const wm = mean(hs.map((s) => v(s, 'wind')));
    return {
      id: p.id,
      icon: symbolFor({ clct: mean(hs.map((s) => v(s, 'clct'))), popMax: pm, mmhMax: maxOf(hs.map((s) => v(s, 'precip', 'mean'))), night: p.id === 'NACHT' }),
      temp: orNa('P34', deg(mean(hs.map((s) => v(s, 't2m')))), NA_FUSION),
      pop: orNa('P35', pct(pm), 'keine Niederschlagsverteilung (interpolierte Stunden)'),
      popLevel: popLevel(pm),
      wind: warn ? sh('P37', `Böen ${Math.round(gm!)}`) : orNa('P36', withUnit(wm, 0, 'm/s'), NA_FUSION),
      highlight: warn,
    };
  });
  const showSnow = snowlineShown({ rainSum: rainKnown ? rainSum : null, snowlineMin: slMin, hOrt: c.hOrt, warn: !!warnDay });
  const slDrop = slFirst != null && slMin != null ? slFirst - slMin : null;
  const mid: DayVM['mid'] = showSnow
    ? {
      label: 'SCHNEEGRENZE',
      value: orNa('P45', withUnit(slMin, 0, 'm'), 'keine Schneegrenze'),
      sub: sh('P45', slDrop != null && slDrop >= 100 ? `sinkt um ${withUnit(Math.round(slDrop / 50) * 50, 0, 'm')}` : 'etwa gleichbleibend'),
      subWarn: false,
    }
    : {
      label: 'BÖEN MAX',
      value: orNa('P41', withUnit(gustMax, 0, 'm/s'), NA_FUSION),
      sub: warnDay ? sh('P42', 'Warnung aktiv') : orNa('P41', gustDir == null ? null : compass16(gustDir), 'Richtung unbestimmt'),
      subWarn: !!warnDay,
    };
  const uvVal = index < 3 && inp.uv.state === 'ok' ? inp.uv.days[index] ?? null : null;
  const uvSub = inp.uv.state === 'loading' ? loading('P44')
    : uvVal != null ? sh('P44', `UV ${Math.round(uvVal)}`)
      : na('P44', inp.uv.state === 'ok' ? 'DWD-UV reicht 3 Tage' : (inp.uv.note ?? 'UV nur für DE (DWD)'));
  const text = dayText({
    clctDay: clctDay ?? mean(day.map((s) => v(s, 'clct'))), clctMorning: mean(hoursOf(key, 6, 12).map((s) => v(s, 'clct'))), clctAfternoon: mean(hoursOf(key, 12, 18).map((s) => v(s, 'clct'))),
    rainSum: rainKnown ? rainSum : null, popMax, snowShare,
    tmaxDelta: prevTmax != null && tmax != null ? tmax - prevTmax : null, snowlineDrop: slDrop,
  });
  const vm: DayVM = {
    key, title, highlight: index === 0,
    text: orNa('P30', text, NA_FUSION),
    icon: symbolFor({ clct: clctDay ?? mean(day.map((s) => v(s, 'clct'))), popMax, mmhMax, night: false }),
    tmax: orNa('P32', deg(tmax), NA_FUSION),
    tmin: orNa('P32', deg(tmin), NA_FUSION),
    phases,
    rain: orNa('P39', rainKnown ? withUnit(rainSum, 1, 'mm') : null, NA_FUSION),
    rainWet: rainSum >= WET_DAY_MM,
    rainSub: orNa('P40', popMax == null ? null : `max ${pct(popMax)}`, 'keine Niederschlagsverteilung'),
    mid,
    sun: na('P43', 'keine Sonnenschein-Quelle auf der Plattform (E-DB-10)'),
    sunSub: uvSub,
    conf: { pct: confMean == null ? null : Math.round(confMean * 100), text: orNa('P46', pct(confMean), 'keine Konfidenz'), cls: confidenceClass(confMean) },
  };
  return { vm, tmax, rainSum: rainKnown ? rainSum : null };
}

function warningOnDay(inp: DashInputs, key: string): boolean {
  if (inp.warnings.state !== 'ok') return false;
  const [y, m, d] = key.split('-').map(Number);
  // Kalendertag Europe/Berlin grob als [00:00, 24:00) Ortszeit: UTC−1 … −2 h je nach Sommerzeit — Toleranz 2 h genügt für „am Tag".
  const from = Date.UTC(y, m - 1, d, 0, 0) - 2 * H;
  const to = Date.UTC(y, m - 1, d + 1, 0, 0) - 1 * H;
  return inp.warnings.items.some((w) => (w.onsetMs ?? -Infinity) < to && (w.expiresMs ?? Infinity) > from);
}

function buildHourly(c: Ctx, startMs: number, endMs: number, rangeH: number, ens: string): HourlyVM {
  const pts = c.steps.filter((s) => s.validAtMs <= endMs).map((s) => ({
    t: s.validAtMs, t50: v(s, 't2m'), t10: v(s, 't2m', 'p10'), t90: v(s, 't2m', 'p90'), td: v(s, 'td2m'), pr: v(s, 'precip', 'mean'),
  }));
  const { dayLines, ticks, ticksMobile } = hourAxis(startMs, endMs, rangeH);
  // E-DB-23: Nächte (P92) im Zeitraum, Marken (P93) wo die halbe Bandbreite zuerst 2/3/4 °C erreicht.
  const nights = (c.f?.nights ?? [])
    .filter(([a, b]) => b > startMs && a < endMs)
    .map(([a, b]) => ({ from: Math.max(a, startMs), to: Math.min(b, endMs) }));
  const marks = bandMarks(pts.map((p) => ({ t: p.t, half: p.t10 != null && p.t90 != null ? (p.t90 - p.t10) / 2 : null })))
    .map((m) => { const lp = localParts(m.t); return { t: m.t, k: m.k, label: `±${m.k}° ab ${String(lp.h).padStart(2, '0')} Uhr` }; });
  return {
    startMs, endMs, hours: rangeH, points: pts, dayLines, ticks, ticksMobile,
    head: sh('P53', `${rangeH}${NBSP}h · ${ens}`),
    nights, marks,
  };
}

/**
 * Zeitachse des Stundenverlaufs (set): Tagesgrenzen an Mitternacht (Ortszeit); Marken Desktop alle 6 h an 02/08/14/20 Uhr
 * (Vorlage), ab 7 Tagen 12 h, ab 14 Tagen 24 h; mobil höchstens fünf Marken mit Wochentag (Vorlage: „Mi 14:00 …").
 */
export function hourAxis(startMs: number, endMs: number, rangeH: number): Pick<HourlyVM, 'dayLines' | 'ticks' | 'ticksMobile'> {
  const dayLines: HourlyVM['dayLines'] = [];
  const ticks: HourlyVM['ticks'] = [];
  const ticksMobile: HourlyVM['ticksMobile'] = [];
  const stepD = rangeH <= 72 ? 6 : rangeH <= 168 ? 12 : 24;
  const stepM = rangeH <= 24 ? 6 : rangeH <= 48 ? 12 : rangeH <= 96 ? 24 : rangeH <= 168 ? 48 : 96;
  for (let t = startMs; t <= endMs; t += H) {
    const p = localParts(t);
    // Tagesgrenze mit Beschriftung nur, wenn rechts davon noch Platz ist (≥ 6 h vor dem Ende).
    if (p.h === 0 && p.mi === 0 && t > startMs && t <= endMs - 6 * H) dayLines.push({ t, label: dayLabel(t + 12 * H) });
    if (p.mi !== 0) continue;
    const hoursFrom2 = (p.h - 2 + 24) % 24;
    if (hoursFrom2 % stepD === 0 && (stepD < 24 || p.h === 14)) ticks.push({ t, label: hhmm(t) });
    const dayIdx = Math.floor((t - startMs) / (24 * H));
    const onGrid = stepM < 24 ? hoursFrom2 % stepM === 0 : p.h === 14 && dayIdx % (stepM / 24) === 0;
    if (onGrid) ticksMobile.push({ t, label: `${p.wd} ${hhmm(t)}` });
  }
  return { dayLines, ticks, ticksMobile };
}

// ---------------------------------------------------------------------------
// Nowcast
// ---------------------------------------------------------------------------

function buildNowcast(inp: DashInputs): NowcastVM {
  const n = inp.nowcast;
  const chips = [
    sh('P57', inp.cells.state === 'ok' ? `Zellen: ${inp.cells.text}` : inp.cells.state === 'loading' ? 'Zellen: …' : `Zellen: ${inp.cells.text ?? 'nicht verfügbar'}`),
    na('P58', 'nur als Kartenkachel, keine Punktabfrage'),
    sh('P59', `Hagel: ${inp.hail.text ?? (inp.hail.state === 'loading' ? '…' : '— (nur CH)')}`),
  ];
  const nowMs = inp.nowMs;
  if (n.state !== 'ok' || !n.frames.length) {
    const headline = n.state === 'loading' ? loading('P54') : na('P54', n.note ?? 'kein Radar-Nowcast für diesen Ort');
    return { state: n.state === 'ok' ? 'none' : n.state, headline, horizon: n.horizonLabel, nowMs, fromMs: nowMs, toMs: nowMs + 2 * H, frames: [], chips };
  }
  const frames = [...n.frames].sort((a, b) => a.t - b.t);
  const fromMs = Math.min(frames[0].t, nowMs);
  const toMs = frames[frames.length - 1].t;
  const cur = frames.filter((x) => x.t <= nowMs + 5 * 60_000);
  const nowFrame = cur.length ? cur[cur.length - 1] : frames[0];
  const ahead = frames.filter((x) => x.t > nowFrame.t);
  let headline: string;
  if (nowFrame.mmh >= DRY_MMH) {
    const dry = ahead.find((x) => x.mmh < DRY_MMH);
    headline = dry ? `Niederschlag bis ${hhmm(dry.t)}` : `Niederschlag, anhaltend bis mind. ${hhmm(toMs)}`;
  } else {
    const wet = ahead.find((x) => x.mmh >= DRY_MMH);
    headline = wet ? `Trocken bis ${hhmm(wet.t)}` : `Trocken bis mind. ${hhmm(toMs)}`;
  }
  return { state: 'ok', headline: sh('P54', headline), horizon: n.horizonLabel, nowMs, fromMs, toMs, frames, chips };
}

// ---------------------------------------------------------------------------
// Bewölkung
// ---------------------------------------------------------------------------

function buildClouds(c: Ctx): CloudsVM {
  const steps = c.steps;
  const caption0 = sh('P62', 'hoch · mittel · tief + gesamt mit Quantilen · 336 h');
  if (!c.f || !steps.length) return { state: c.f ? 'none' : 'loading', fromMs: c.inp.nowMs, toMs: c.inp.nowMs + 336 * H, layers: [], total: [], caption: caption0 };
  const fromMs = steps[0].validAtMs;
  const toMs = fromMs + 336 * H;
  const within = steps.filter((s) => s.validAtMs <= toMs);
  const layer = (id: 'clch' | 'clcm' | 'clcl') => {
    const cells: CloudsVM['layers'][number]['cells'] = [];
    const nat = within.filter((s) => !s.interpolated && v(s, id) != null);
    for (let i = 0; i < nat.length; i++) {
      const next = nat[i + 1]?.validAtMs ?? Math.min(toMs, nat[i].validAtMs + H);
      cells.push({ from: nat[i].validAtMs, to: Math.min(next, nat[i].validAtMs + 6 * H), pct: v(nat[i], id)! });
    }
    return cells;
  };
  const layers: CloudsVM['layers'] = [{ id: 'high', cells: layer('clch') }, { id: 'mid', cells: layer('clcm') }, { id: 'low', cells: layer('clcl') }];
  // Die Schichten tragen nur Quellen mit Wolkenschichten (ICON-Familie, MOSMIX); dahinter bleibt der Streifen leer — benannt.
  const lastLayer = Math.max(fromMs, ...layers.flatMap((l) => l.cells.map((x) => x.to)));
  const layerH = Math.round((lastLayer - fromMs) / H);
  const caption = layerH < 330
    ? sh('P62', `hoch · mittel · tief bis ${layerH}${NBSP}h (danach keine Quelle) + gesamt mit Quantilen · 336${NBSP}h`)
    : caption0;
  return {
    state: 'ok', fromMs, toMs,
    layers,
    total: within.map((s) => ({ t: s.validAtMs, p10: v(s, 'clct', 'p10'), p50: v(s, 'clct'), p90: v(s, 'clct', 'p90') })),
    caption,
  };
}

// ---------------------------------------------------------------------------
// Wind
// ---------------------------------------------------------------------------

function buildWind(c: Ctx): WindVM {
  const s0 = c.s0;
  if (!c.f || !s0) return { state: 'loading', sectors: [], nowDeg: null, title: loading('P64'), reach: loading('P65'), reachHours: null, reachPct: null };
  const rangeH = DASH_RANGE_HOURS[c.inp.range];
  const inRange = c.steps.filter((s) => s.validAtMs <= s0.validAtMs + rangeH * H);
  const counts = new Array<number>(8).fill(0);
  let n = 0;
  for (const s of inRange) {
    const d = v(s, 'windDir');
    if (d == null) continue;
    counts[Math.round((((d % 360) + 360) % 360) / 45) % 8] += 1;
    n += 1;
  }
  const sectors = counts.map((k, i) => ({ deg: i * 45, share: n ? k / n : 0 }));
  const nowDeg = v(s0, 'windDir');
  // „Belastbar bis": die Fusion gibt die Richtung je Stunde nur über der Konzentrationsschranke frei (fuse.ts) —
  // gezählt wird, bis wann sie ab jetzt ohne Unterbrechung freigegeben ist.
  let reachH: number | null = null;
  for (const s of c.steps) {
    if (s.validAtMs > s0.validAtMs + 336 * H) break;
    if (v(s, 'windDir') == null) break;
    reachH = Math.round((s.validAtMs - s0.validAtMs) / H);
  }
  return {
    state: 'ok',
    sectors,
    nowDeg,
    title: orNa('P64', nowDeg == null ? null : `${compass16(nowDeg)} · ${Math.round(nowDeg)}°`, 'Richtung jetzt unbestimmt (schwacher, drehender Wind)'),
    reach: orNa('P65', reachH == null ? null : `${reachH}${NBSP}h`, 'Richtung schon jetzt nicht freigegeben'),
    reachHours: reachH,
    reachPct: reachH == null ? null : Math.round((reachH / 336) * 100),
  };
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

function niceAxis(minH: number, maxH: number): { bottom: number; top: number; step: number } {
  for (const step of [100, 250, 500, 1000]) {
    const bottom = Math.floor(minH / step) * step;
    const top = Math.ceil(maxH / step) * step;
    if ((top - bottom) / step <= 6) return { bottom, top, step };
  }
  const step = 1000;
  return { bottom: Math.floor(minH / step) * step, top: Math.ceil(maxH / step) * step, step };
}

function buildTerrain(c: Ctx): TerrainVM {
  const tin = c.inp.terrain;
  const s0 = c.s0;
  const header = sh('P80', `Schnitt ${compass8(tin.axisDeg)} → ${compass8(tin.axisDeg + 180)} durch die Fahrtrichtung des Windes · Punkt-Cube t1 (0,05°), γ aus dem Modellprofil`);
  const base: TerrainVM = {
    state: tin.state, halfKm: tin.halfKm, header, chip: loading('P70'), chipTone: 'ok',
    fromLabel: compass8(tin.axisDeg), toLabel: compass8(tin.axisDeg + 180),
    profile: [], axis: { bottom: 500, top: 3000, step: 500 }, hOrt: c.hOrt, isotherms: [], snowline: null, snowlineLabel: null, stations: [],
    ort: { title: c.inp.place?.name ?? '', sub: '' }, table: [], readout: { main: [], note: [] },
    legendIso: 'gestrichelte Linien: Isothermen', note: tin.note,
  };
  if (!c.f || !s0 || tin.state !== 'ok' || !tin.profile.length) {
    return { ...base, state: tin.state === 'ok' ? 'loading' : tin.state, chip: tin.state === 'loading' || !c.f ? loading('P70') : na('P70', tin.note ?? 'Gelände nicht verfügbar') };
  }
  const hOrt = c.hOrt ?? tin.profile.reduce((a, p) => (Math.abs(p.s) < Math.abs(a.s) ? p : a)).h;
  const tOrt = v(s0, 't2m');
  const t1Row = c.f.cells.filter((r) => r.tier === 't1').sort((a, b) => Math.abs(a.validAtMs - s0.validAtMs) - Math.abs(b.validAtMs - s0.validAtMs))[0] ?? null;
  const gamma = t1Row?.v.gammaEff ?? null;
  const zBase = t1Row?.v.zBase ?? null, zInv = t1Row?.v.zInv ?? null, dTInv = t1Row?.v.dTInv ?? null;
  const inversion = zInv != null && zBase != null && zInv > zBase && (dTInv ?? 0) > 0;
  const hs = tin.profile.map((p) => p.h);
  const snow = v(s0, 'snowline');
  const maxTerrain = Math.max(...hs);
  const axis = niceAxis(Math.min(...hs, hOrt), Math.max(maxTerrain + 300, hOrt + 1500, 1500));
  const iso = tOrt != null && gamma != null && !inversion
    ? isotherms(tOrt, hOrt, gamma, axis.top).map((x) => ({ ...x, color: isothermColor(x.t), label: `${num(x.t, 0)}${NBSP}°C · ${withUnit(Math.round(x.h / 10) * 10, 0, 'm')}` }))
    : [];
  const tAt = (h: number) => (tOrt != null && gamma != null && !inversion ? tempAt(tOrt, hOrt, gamma, h) : null);
  const stations = tin.stations.filter((s) => s.h <= axis.top).map((s) => {
    const t = tAt(s.h);
    return { name: s.name, s: s.s, h: s.h, label: `${s.name} ${withUnit(s.h, 0, 'm')}${t != null ? ` · ${num(t, 1)}${NBSP}°C` : ''}` };
  });
  const levels = new Set<number>();
  for (let h = axis.top; h > hOrt + 50; h -= 500) if (h % 500 === 0) levels.add(h);
  for (const s of stations) if (s.h > hOrt + 50) levels.add(s.h);
  const tableRows = [...levels].sort((a, b) => b - a).slice(0, 7).map((h) => ({
    h, label: withUnit(h, 0, 'm')!, ort: false,
    t: orNa('P76', tAt(h) == null ? null : `${num(tAt(h), 1)}°`, inversion ? 'Inversion — ein Gradient trägt nicht' : 'kein Gradient'),
    wind: na('P77', 'kein Höhenwind im Punkt-Cube'),
  }));
  tableRows.push({ h: hOrt, label: withUnit(hOrt, 0, 'm')!, ort: true, t: orNa('P75', tOrt == null ? null : `${num(tOrt, 1)}°`, NA_FUSION), wind: orNa('P75', v(s0, 'wind') == null ? null : `${compass16(v(s0, 'windDir')) ?? ''} ${withUnit(v(s0, 'wind'), 1, 'm/s')}`.trim(), NA_FUSION) });
  const gTxt = gamma == null ? null : `γ ${num(gamma, 1)} K/km`;
  const chip = inversion
    ? sh('P70', `${gTxt ?? 'γ n. v.'} · Inversion ${withUnit(zBase, 0, 'm')}–${withUnit(zInv, 0, 'm')}`)
    : orNa('P70', gTxt == null ? null : `${gTxt} · keine Inversion`, 'kein Modellprofil (nur t1)');
  // Ablesung (set: Satzbau der Vorlage, Zahlen aus den Eingängen; ohne Aussagen über Höhenwind).
  const ref = [...stations].sort((a, b) => b.h - a.h)[0];
  const refH = ref?.h ?? axis.top;
  const refT = tAt(refH);
  const main: TerrainVM['readout']['main'] = [];
  if (tOrt != null && gamma != null && refT != null && !inversion) {
    main.push('Die Temperatur nimmt ', { b: gamma > 0 ? 'durchgehend mit der Höhe ab' : 'mit der Höhe zu' },
      ` — ${num(tOrt, 1)}${NBSP}°C am Ort (${withUnit(hOrt, 0, 'm')}) gegen ${num(refT, 1)}${NBSP}°C ${ref ? `an der Station ${ref.name} (${withUnit(ref.h, 0, 'm')})` : `in ${withUnit(refH, 0, 'm')}`} ergibt `,
      { b: `γ ${num(gamma, 1)} K/km` }, `. Das ist ${gammaWord(gamma)} und zeigt heute `, { b: 'keine Inversion' }, '.');
  } else if (inversion) {
    main.push('Das Modellprofil zeigt eine ', { b: `Inversion zwischen ${withUnit(zBase, 0, 'm')} und ${withUnit(zInv, 0, 'm')}` },
      ` (${num(dTInv, 1)}${NBSP}K wärmer oben) — ein einzelner Gradient beschreibt die Schichtung dann nicht; Isothermen und Höhenwerte entfallen.`);
  } else {
    main.push('Ohne Modellprofil (γ) lässt sich die Temperatur nach Höhe hier nicht ablesen.');
  }
  main.push(' Wind je Höhenniveau ist ', { b: 'nicht verfügbar' }, ' (kein Höhenwind im Punkt-Cube).');
  const note: TerrainVM['readout']['note'] = [
    'Gelände, Stationen und Schneegrenze sitzen auf ihrer ', { b: 'tatsächlichen Höhe' },
    ' der Achse; Zwischenwerte folgen dem einen Gradienten, nichts wird aus zwei Modellen gemischt.',
  ];
  if (tin.outside.length) note.push(` ${tin.outside.join(' und ')} ${tin.outside.length > 1 ? 'liegen' : 'liegt'} außerhalb des ±${tin.halfKm}-km-Schnitts.`);
  return {
    ...base, state: 'ok', chip, chipTone: inversion ? 'warn' : 'ok',
    profile: tin.profile, axis, hOrt, isotherms: iso,
    snowline: snow, snowlineLabel: snow == null ? null : `Schneegrenze ${withUnit(Math.round(snow / 10) * 10, 0, 'm')}`,
    stations,
    ort: {
      title: `${shortName(c.inp.place?.name ?? '')} · ${withUnit(hOrt, 0, 'm')}`,
      sub: `${num(tOrt, 1) ?? '—'}${NBSP}°C · Wind ${num(v(s0, 'wind'), 1) ?? '—'}${NBSP}m/s ${compass16(v(s0, 'windDir')) ?? ''}`.trim(),
    },
    table: tableRows,
    readout: { main, note },
    legendIso: iso.length ? `gestrichelte Linien: Isothermen ${iso.map((x) => num(x.t, 0)).reverse().join(' / ')}${NBSP}°C — Höhe aus γ ${num(gamma, 1)} K/km gerechnet` : 'Isothermen: kein Gradient',
  };
}

/** „Garmisch-Partenkirchen" ⇒ „Garmisch-P." (Vorlage: Ortsmarke im Schnitt). */
export function shortName(name: string): string {
  const base = name.split(',')[0].trim();
  if (base.length <= 14) return base;
  const m = /^([^\s-]+)([\s-])(.)/.exec(base);
  return m ? `${m[1]}${m[2]}${m[3]}.` : `${base.slice(0, 13)}.`;
}

// ---------------------------------------------------------------------------
// Stufe 2
// ---------------------------------------------------------------------------

function buildUv(inp: DashInputs): UvVM {
  const u = inp.uv;
  const labels = ['heute', 'morgen', 'übermorgen'];
  return {
    state: u.state,
    days: labels.map((label, i) => ({ label, value: u.state === 'ok' ? u.days[i] ?? null : null })),
    caption: u.state === 'ok' ? sh('P81', `Tagesmaximum · 38 Vorhersageorte${u.city ? ` · ${u.city}` : ''}`) : u.state === 'loading' ? loading('P81') : na('P81', u.note ?? 'nur DE'),
    na: u.state === 'na' || u.state === 'error' ? (u.note ?? 'UV-Vorhersage des DWD nur für Deutschland') : null,
  };
}

function buildPollen(inp: DashInputs): PollenVM {
  const p = inp.pollen;
  return {
    state: p.state,
    species: p.species,
    caption: p.state === 'ok' ? sh('P82', `heute · morgen · übermorgen je Art · Region ${p.region ?? '—'}`) : p.state === 'loading' ? loading('P82') : na('P82', p.note ?? 'DWD-Pollenflug nur für Deutschland'),
    cams: 'CAMS-Opt-in aus · 6 Arten, 4 Tage, nur AT/CH',
    na: p.state === 'na' || p.state === 'error' ? (p.note ?? 'DWD-Pollenflug nur für Deutschland') : null,
  };
}

function buildIconD2(inp: DashInputs): IconD2VM {
  const d = inp.iconD2;
  const title = 'ICON-D2-LAYER · 12–24 h · DACH';
  const foot = 'Kartenlayer · am Ort abfragbar';
  const fire = { label: 'Feuerwetter', value: na('P88', 'zurückgezogen — kein Feuerwetter-Index mehr auf der Plattform'), tone: 'muted' as const };
  if (d.state !== 'ok') {
    const l = (o: ParamId) => (d.state === 'loading' ? loading(o) : na(o, d.note ?? 'ICON-D2 für diesen Ort nicht verfügbar'));
    return { state: d.state, title, foot, rows: [
      { label: 'Gewitterpotenzial', value: l('P84'), tone: 'muted' }, { label: 'Rotation', value: l('P85'), tone: 'muted' },
      { label: 'Neuschnee 24 h', value: l('P86'), tone: 'muted' }, { label: 'Böen max', value: l('P87'), tone: 'muted' }, fire,
    ] };
  }
  const tw = thunderWord(d.thunderMax);
  return {
    state: 'ok', title, foot,
    rows: [
      { label: 'Gewitterpotenzial', value: orNa('P84', tw, 'kein Wert'), tone: d.thunderMax != null && d.thunderMax >= 50 ? 'warn' : 'good' },
      { label: 'Rotation', value: orNa('P85', d.rotationMax == null ? null : d.rotationMax < 10 ? 'keine' : `${Math.round(d.rotationMax)} / 100`, 'kein Wert'), tone: d.rotationMax != null && d.rotationMax >= 10 ? 'warn' : 'muted' },
      { label: 'Neuschnee 24 h', value: orNa('P86', withUnit(d.snowFresh24, 0, 'cm'), 'kein Wert'), tone: 'strong' },
      { label: 'Böen max', value: orNa('P87', withUnit(d.gustMax, 0, 'm/s'), 'kein Wert'), tone: 'warn' },
      fire,
    ],
  };
}
