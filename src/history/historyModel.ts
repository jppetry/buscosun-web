/**
 * Feature „Wetterhistorie / Klima-Rückblick" — Datenmodell & Statistik (pur).
 *
 * Reine, headless-testbare Funktionen über Tagesbeobachtungen: Aggregation
 * (täglich→monatlich/saisonal/jährlich, E3), Kenntage (E4), Normal/Anomalie/
 * Trend (E5), Rekorde (E8), Monatsverteilung/Box (E6.7), Temperaturbänder
 * (E6.6), Windrose (E4.4), Kalendermatrix (E6.4). KEINE I/O hier.
 *
 * Datenherkunft (in der Quelle, nicht hier): ERA5-Reanalyse via Open-Meteo
 * Archive — modelliert, nicht reine Stationsmessung (US-13.3).
 */

// --- Grunddaten --------------------------------------------------------------

/** Eine Tagesbeobachtung (alle Werte können fehlen → null = Lücke, US-13.4). */
export interface DailyRecord {
  dateISO: string; // YYYY-MM-DD
  year: number;
  month: number; // 1..12
  day: number;   // 1..31
  doy: number;   // day of year 1..366
  tMaxC: number | null;
  tMinC: number | null;
  tMeanC: number | null;
  precipMm: number | null;
  sunshineH: number | null;
  windMaxKmh: number | null;
  windDirDeg: number | null;
  humidityPct: number | null;
  snowCm: number | null;
  /**
   * Welche Felder NICHT gemessen, sondern vom Anbieter mit Modellwerten gefüllt sind
   * (Meteostat `*_source` = `metno_forecast` o. ä.). Fehlt ⇒ alles gemessen bzw. unbekannt
   * (ERA5-Quelle setzt es nicht — dort ist ohnehin alles Reanalyse). Additiv, optional.
   */
  modelFilled?: ('tMeanC' | 'tMinC' | 'tMaxC' | 'humidityPct' | 'precipMm' | 'windMaxKmh')[];
}

export type VariableKey = 'tmean' | 'tmax' | 'tmin' | 'precip' | 'sunshine' | 'wind' | 'humidity';

export interface VariableMeta {
  key: VariableKey;
  label: string;
  short: string;
  unit: string;
  /** Aggregation über einen Zeitraum: Mittel oder Summe. */
  agg: 'mean' | 'sum';
  field: keyof DailyRecord;
  /** Sequenzielle (Niederschlag/Sonne) vs. divergierende (Temperatur) Skala. */
  diverging: boolean;
}

export const VARIABLES: VariableMeta[] = [
  { key: 'tmean', label: 'Temperatur Ø', short: 'Ø', unit: '°C', agg: 'mean', field: 'tMeanC', diverging: true },
  { key: 'tmax', label: 'Temperatur max', short: 'Tmax', unit: '°C', agg: 'mean', field: 'tMaxC', diverging: true },
  { key: 'tmin', label: 'Temperatur min', short: 'Tmin', unit: '°C', agg: 'mean', field: 'tMinC', diverging: true },
  { key: 'precip', label: 'Niederschlag', short: 'Regen', unit: 'mm', agg: 'sum', field: 'precipMm', diverging: false },
  { key: 'sunshine', label: 'Sonnenstunden', short: 'Sonne', unit: 'h', agg: 'sum', field: 'sunshineH', diverging: false },
  { key: 'wind', label: 'Wind (max)', short: 'Wind', unit: 'km/h', agg: 'mean', field: 'windMaxKmh', diverging: false },
  { key: 'humidity', label: 'Luftfeuchte', short: 'Feuchte', unit: '%', agg: 'mean', field: 'humidityPct', diverging: false },
];

export const variableMeta = (k: VariableKey): VariableMeta => VARIABLES.find((v) => v.key === k)!;

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export const mean = (a: number[]): number | null => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
export const sum = (a: number[]): number => a.reduce((s, v) => s + v, 0);

/** Wert einer Variable aus einem Tag (null = Lücke). */
export function valueOf(d: DailyRecord, k: VariableKey): number | null {
  const v = d[variableMeta(k).field];
  return isNum(v) ? v : null;
}

// --- Aggregation (E3) --------------------------------------------------------

export type Resolution = 'daily' | 'monthly' | 'seasonal' | 'yearly';

export interface Bucket {
  /** Stabiler Schlüssel (z. B. „2022", „2022-07", „2022-MAM"). */
  key: string;
  label: string;
  /** Repräsentativer Sortier-/Achsenwert (Jahr als Dezimal). */
  t: number;
  year: number;
  value: number | null;
  /** Anzahl Tage mit Wert (für Lücken-Kennzeichnung). */
  n: number;
  /** Tage gesamt im Bucket (erwartet) – Basis für Vollständigkeit. */
  expected: number;
}

const SEASONS: { id: string; label: string; months: number[] }[] = [
  { id: 'DJF', label: 'Winter', months: [12, 1, 2] },
  { id: 'MAM', label: 'Frühling', months: [3, 4, 5] },
  { id: 'JJA', label: 'Sommer', months: [6, 7, 8] },
  { id: 'SON', label: 'Herbst', months: [9, 10, 11] },
];
const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Saison-Jahr: Dezember zählt zum folgenden Winter-Jahr. */
function seasonYear(year: number, month: number): number {
  return month === 12 ? year + 1 : year;
}

function aggregateValues(vals: number[], agg: 'mean' | 'sum'): number | null {
  if (!vals.length) return null;
  return agg === 'mean' ? mean(vals) : sum(vals);
}

/** Mindest-Abdeckung (Anteil der Kalendertage), damit ein Bucket als belastbar gilt. */
export const MIN_COVERAGE = 0.8;
const daysInMonthOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const daysInYearOf = (y: number) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);

/**
 * Aggregiert Tagesdaten zu Buckets der gewünschten Auflösung (E3.3). Buckets,
 * die weniger als `MIN_COVERAGE` der Kalendertage enthalten (z. B. das laufende
 * Jahr oder Datenlücken), liefern `value: null` — so verzerren unvollständige
 * Perioden weder Trend/Streifen/Anomalie noch Normalwerte (US-13.4).
 */
export function aggregate(days: DailyRecord[], k: VariableKey, res: Resolution): Bucket[] {
  const meta = variableMeta(k);
  if (res === 'daily') {
    return days.map((d) => ({
      key: d.dateISO, label: d.dateISO, t: d.year + (d.doy - 1) / 366, year: d.year,
      value: valueOf(d, k), n: valueOf(d, k) == null ? 0 : 1, expected: 1,
    }));
  }
  type Group = { vals: number[]; year: number; t: number; label: string; calExpected: number };
  const groups = new Map<string, Group>();
  for (const d of days) {
    const v = valueOf(d, k);
    let key: string, label: string, year: number, t: number, calExpected: number;
    if (res === 'yearly') {
      year = d.year; key = String(year); label = String(year); t = year; calExpected = daysInYearOf(year);
    } else if (res === 'monthly') {
      year = d.year; key = `${year}-${String(d.month).padStart(2, '0')}`;
      label = `${MONTH_NAMES[d.month - 1]} ${year}`; t = year + (d.month - 1) / 12; calExpected = daysInMonthOf(year, d.month);
    } else {
      const s = SEASONS.find((ss) => ss.months.includes(d.month))!;
      year = seasonYear(d.year, d.month); key = `${year}-${s.id}`;
      label = `${s.label} ${year}`; t = year + SEASONS.indexOf(s) / 4;
      calExpected = s.months.reduce((sum, mo) => sum + daysInMonthOf(mo === 12 ? year - 1 : year, mo), 0);
    }
    let g = groups.get(key);
    if (!g) { g = { vals: [], year, t, label, calExpected }; groups.set(key, g); }
    if (v != null) g.vals.push(v);
  }
  return [...groups.values()]
    .sort((a, b) => a.t - b.t)
    .map((g) => {
      const enough = g.vals.length >= MIN_COVERAGE * g.calExpected;
      return { key: `${g.label}`, label: g.label, t: g.t, year: g.year, value: enough ? aggregateValues(g.vals, meta.agg) : null, n: g.vals.length, expected: g.calExpected };
    });
}

/** Nur Jahres-Aggregate (Bequemlichkeit für Streifen/Trend). */
export const yearly = (days: DailyRecord[], k: VariableKey): Bucket[] => aggregate(days, k, 'yearly');

// --- Kenntage (E4.2) ---------------------------------------------------------

export type KenntagKey = 'hot' | 'summer' | 'tropicalNight' | 'frost' | 'ice';

export interface KenntagDef {
  key: KenntagKey;
  label: string;
  /** Variable, auf die die Schwelle wirkt. */
  basis: 'tMaxC' | 'tMinC';
  /** Vergleich: Tag zählt, wenn Wert >= (ge) oder < (lt) Schwelle. */
  cmp: 'ge' | 'lt';
  threshold: number;
  explain: string;
}

export const KENNTAGE: KenntagDef[] = [
  { key: 'hot', label: 'Hitzetage', basis: 'tMaxC', cmp: 'ge', threshold: 30, explain: 'Tmax ≥ 30 °C' },
  { key: 'summer', label: 'Sommertage', basis: 'tMaxC', cmp: 'ge', threshold: 25, explain: 'Tax ≥ 25 °C' },
  { key: 'tropicalNight', label: 'Tropennächte', basis: 'tMinC', cmp: 'ge', threshold: 20, explain: 'Min > 20 °C' },
  { key: 'frost', label: 'Frosttage', basis: 'tMinC', cmp: 'lt', threshold: 0, explain: 'Min < 0 °C' },
  { key: 'ice', label: 'Eistage', basis: 'tMaxC', cmp: 'lt', threshold: 0, explain: 'Max < 0 °C' },
];

export const kenntagDef = (k: KenntagKey): KenntagDef => KENNTAGE.find((d) => d.key === k)!;

/** Zählt einen Kenntag je Jahr (E4.3), mit optional angepasster Schwelle (E4.5). */
export function countKenntageByYear(days: DailyRecord[], def: KenntagDef, threshold = def.threshold): { year: number; count: number; n: number }[] {
  const byYear = new Map<number, { count: number; n: number }>();
  for (const d of days) {
    const v = d[def.basis];
    const slot = byYear.get(d.year) ?? { count: 0, n: 0 };
    if (isNum(v)) { slot.n++; if (def.cmp === 'ge' ? v >= threshold : v < threshold) slot.count++; }
    byYear.set(d.year, slot);
  }
  return [...byYear.entries()].map(([year, s]) => ({ year, count: s.count, n: s.n })).sort((a, b) => a.year - b.year);
}

/** Top-N Jahre nach Kenntag-Zahl (E4.3 / E8.2). */
export function rankYearsByKenntag(days: DailyRecord[], def: KenntagDef, threshold = def.threshold, topN = 5) {
  return countKenntageByYear(days, def, threshold).filter((y) => y.n > 0).sort((a, b) => b.count - a.count).slice(0, topN);
}

// --- Normal / Anomalie / Trend (E5) -----------------------------------------

export interface NormalPeriod { id: string; label: string; start: number; end: number }
export const NORMAL_PERIODS: NormalPeriod[] = [
  { id: '1961-1990', label: '1961–1990', start: 1961, end: 1990 },
  { id: '1971-2000', label: '1971–2000', start: 1971, end: 2000 },
  { id: '1991-2020', label: '1991–2020', start: 1991, end: 2020 },
];

/** Normalwert (Mittel der Jahres-Aggregate) über die Referenzperiode (E5.1). */
export function normalValue(yearlyBuckets: Bucket[], period: NormalPeriod): number | null {
  const vals = yearlyBuckets.filter((b) => b.year >= period.start && b.year <= period.end && b.value != null).map((b) => b.value as number);
  return mean(vals);
}

export interface AnomalyPoint { year: number; t: number; value: number; anomaly: number; label: string }

/** Anomalie je Bucket gegen den Normalwert (E5.2). null-Normal → leere Liste. */
export function anomalies(buckets: Bucket[], normal: number | null): AnomalyPoint[] {
  if (normal == null) return [];
  return buckets.filter((b) => b.value != null).map((b) => ({ year: b.year, t: b.t, value: b.value as number, anomaly: (b.value as number) - normal, label: b.label }));
}

export interface TrendResult { slopePerYear: number; slopePerDecade: number; intercept: number; r2: number; firstT: number; lastT: number; n: number }

/** Lineare Regression value~t (E5.3). null bei < 3 Punkten. */
export function linearTrend(buckets: Bucket[]): TrendResult | null {
  const pts = buckets.filter((b) => b.value != null).map((b) => ({ x: b.t, y: b.value as number }));
  if (pts.length < 3) return null;
  const n = pts.length;
  const sx = sum(pts.map((p) => p.x)), sy = sum(pts.map((p) => p.y));
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slopePerYear: slope, slopePerDecade: slope * 10, intercept, r2, firstT: pts[0].x, lastT: pts[pts.length - 1].x, n };
}

// --- Rekorde (E8) ------------------------------------------------------------

export interface DayRecord { value: number; dateISO: string }
export interface RecordSet {
  warmestDay: DayRecord | null; // höchstes tMax
  coldestDay: DayRecord | null; // niedrigstes tMin
  wettestDay: DayRecord | null; // höchster Niederschlag
  sunniestMonth: { value: number; key: string } | null; // meiste Sonnenstunden
}

export function records(days: DailyRecord[]): RecordSet {
  let warm: DayRecord | null = null, cold: DayRecord | null = null, wet: DayRecord | null = null;
  for (const d of days) {
    if (isNum(d.tMaxC) && (!warm || d.tMaxC > warm.value)) warm = { value: d.tMaxC, dateISO: d.dateISO };
    if (isNum(d.tMinC) && (!cold || d.tMinC < cold.value)) cold = { value: d.tMinC, dateISO: d.dateISO };
    if (isNum(d.precipMm) && (!wet || d.precipMm > wet.value)) wet = { value: d.precipMm, dateISO: d.dateISO };
  }
  const sun = aggregate(days, 'sunshine', 'monthly').filter((b) => b.value != null);
  let sunniest: { value: number; key: string } | null = null;
  for (const b of sun) if (!sunniest || (b.value as number) > sunniest.value) sunniest = { value: b.value as number, key: b.label };
  return { warmestDay: warm, coldestDay: cold, wettestDay: wet, sunniestMonth: sunniest };
}

// --- „Wetter an meinem Tag" (E8.3) ------------------------------------------

export interface DateAcrossYears { year: number; tMaxC: number | null; tMinC: number | null; precipMm: number | null }

/** Werte eines Kalendertags (±halfWidth Tage gemittelt je Jahr) über die Jahre (E8.3/E2.3). */
export function dateAcrossYears(days: DailyRecord[], month: number, day: number, halfWidth = 0): DateAcrossYears[] {
  const target = doyOf(2001, month, day); // Referenzjahr für DOY-Fenster
  const byYear = new Map<number, DailyRecord[]>();
  for (const d of days) {
    let dist = Math.abs(d.doy - target);
    dist = Math.min(dist, 366 - dist); // Jahresumbruch
    if (dist <= halfWidth) (byYear.get(d.year) ?? byYear.set(d.year, []).get(d.year)!).push(d);
  }
  return [...byYear.entries()].map(([year, ds]) => ({
    year,
    tMaxC: mean(ds.map((d) => d.tMaxC).filter(isNum)),
    tMinC: mean(ds.map((d) => d.tMinC).filter(isNum)),
    precipMm: mean(ds.map((d) => d.precipMm).filter(isNum)),
  })).sort((a, b) => a.year - b.year);
}

// --- Verteilung je Monat / Box-Plot (E6.7) ----------------------------------

export interface BoxStats { month: number; label: string; min: number; q1: number; median: number; q3: number; max: number; n: number }

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/** Box-Statistik je Kalendermonat über alle Jahre (E6.7). */
export function monthlyDistribution(days: DailyRecord[], k: VariableKey): BoxStats[] {
  const out: BoxStats[] = [];
  for (let m = 1; m <= 12; m++) {
    const vals = days.filter((d) => d.month === m).map((d) => valueOf(d, k)).filter(isNum);
    if (!vals.length) continue;
    out.push({
      month: m, label: MONTH_NAMES[m - 1],
      min: Math.min(...vals), q1: percentile(vals, 0.25)!, median: percentile(vals, 0.5)!,
      q3: percentile(vals, 0.75)!, max: Math.max(...vals), n: vals.length,
    });
  }
  return out;
}

// --- Temperaturbänder (E6.6) -------------------------------------------------

export interface TempBand { id: string; label: string; min: number; max: number; color: string }
export const TEMP_BANDS: TempBand[] = [
  { id: 'cold', label: 'kalt <0°', min: -Infinity, max: 0, color: '#5B8FB0' },
  { id: 'cool', label: 'kühl 0–5°', min: 0, max: 5, color: '#9DC3D4' },
  { id: 'mild', label: 'mild 5–15°', min: 5, max: 15, color: '#CFE0C3' },
  { id: 'warm', label: 'warm 15–25°', min: 15, max: 25, color: '#E8C97A' },
  { id: 'hot', label: 'heiß ≥25°', min: 25, max: Infinity, color: '#D98E5A' },
];

/** Anteil der Tage je Temperaturband pro Monat (E6.6). */
export function tempBandShares(days: DailyRecord[]): { month: number; label: string; shares: number[] }[] {
  const out: { month: number; label: string; shares: number[] }[] = [];
  for (let m = 1; m <= 12; m++) {
    const vals = days.filter((d) => d.month === m).map((d) => d.tMeanC).filter(isNum);
    if (!vals.length) continue;
    const counts = TEMP_BANDS.map((b) => vals.filter((v) => v >= b.min && v < b.max).length);
    const total = vals.length;
    out.push({ month: m, label: MONTH_NAMES[m - 1], shares: counts.map((c) => c / total) });
  }
  return out;
}

// --- Windrose (E4.4) ---------------------------------------------------------

export const WIND_DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

/** Häufigkeit je Windrichtungs-Sektor (8), optional nach Monaten gefiltert (E4.4). */
export function windRose(days: DailyRecord[], months?: number[]): { dir: string; share: number; meanKmh: number | null }[] {
  const sel = days.filter((d) => isNum(d.windDirDeg) && (!months || months.includes(d.month)));
  const sectors = WIND_DIRS.map(() => ({ count: 0, speeds: [] as number[] }));
  for (const d of sel) {
    const idx = Math.round(((d.windDirDeg as number) % 360) / 45) % 8;
    sectors[idx].count++;
    if (isNum(d.windMaxKmh)) sectors[idx].speeds.push(d.windMaxKmh);
  }
  const total = sel.length || 1;
  return WIND_DIRS.map((dir, i) => ({ dir, share: sectors[i].count / total, meanKmh: mean(sectors[i].speeds) }));
}

// --- Tages-Klimatologie / Tagesband (E6.3) ----------------------------------

export interface DayClim { doy: number; min: number; p10: number; p50: number; p90: number; max: number }

/** Je Tag des Jahres: Normalbereich (p10–p90) + Rekordbereich (min–max) über alle Jahre. */
export function dayClimatology(days: DailyRecord[], k: VariableKey): DayClim[] {
  const byDoy = new Map<number, number[]>();
  for (const d of days) {
    const v = valueOf(d, k);
    if (v == null) continue;
    (byDoy.get(d.doy) ?? byDoy.set(d.doy, []).get(d.doy)!).push(v);
  }
  const out: DayClim[] = [];
  for (let doy = 1; doy <= 366; doy++) {
    const vals = byDoy.get(doy);
    if (!vals || !vals.length) continue;
    out.push({ doy, min: Math.min(...vals), p10: percentile(vals, 0.1)!, p50: percentile(vals, 0.5)!, p90: percentile(vals, 0.9)!, max: Math.max(...vals) });
  }
  return out.sort((a, b) => a.doy - b.doy);
}

/** Tageswerte eines Jahres als (doy,value)-Reihe (für Overlay/Tagesband). */
export function daySeries(days: DailyRecord[], year: number, k: VariableKey): { doy: number; value: number }[] {
  return days.filter((d) => d.year === year).map((d) => ({ doy: d.doy, value: valueOf(d, k) }))
    .filter((p): p is { doy: number; value: number } => p.value != null).sort((a, b) => a.doy - b.doy);
}

// --- Kalendermatrix (E6.4) ---------------------------------------------------

export interface CalCell { dateISO: string; month: number; day: number; doy: number; value: number | null }

/** Tageswerte eines Jahres als flache Zellliste (Heatmap, E6.4). */
export function calendarYear(days: DailyRecord[], year: number, k: VariableKey): CalCell[] {
  return days.filter((d) => d.year === year).map((d) => ({ dateISO: d.dateISO, month: d.month, day: d.day, doy: d.doy, value: valueOf(d, k) }));
}

// --- Hilfen ------------------------------------------------------------------

export function doyOf(year: number, month: number, day: number): number {
  const start = Date.UTC(year, 0, 0);
  const cur = Date.UTC(year, month - 1, day);
  return Math.floor((cur - start) / 86_400_000);
}

export const monthName = (m: number): string => MONTH_NAMES[m - 1];

/** Gesamtspanne der Jahre mit Daten (für „verfügbar 1881–2024", US-3.4). */
export function yearSpan(days: DailyRecord[]): { min: number; max: number } | null {
  const ys = days.filter((d) => valueOf(d, 'tmean') != null || valueOf(d, 'precip') != null).map((d) => d.year);
  return ys.length ? { min: Math.min(...ys), max: Math.max(...ys) } : null;
}
