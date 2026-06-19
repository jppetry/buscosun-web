/**
 * Headless-Verifikation der puren History-Logik (Model + Indizes + State).
 * Bündelt alle Checks, damit ein einzelner esbuild→node-Lauf genügt.
 */

import {
  type DailyRecord,
  aggregate, yearly, countKenntageByYear, rankYearsByKenntag, kenntagDef,
  normalValue, anomalies, linearTrend, records, dateAcrossYears, monthlyDistribution,
  tempBandShares, windRose, calendarYear, NORMAL_PERIODS, doyOf, yearSpan, percentile,
} from './historyModel';
import {
  heatingDegreeDaysByYear, growingDegreeDaysByYear, gddCumulative,
  heatWaves, drySpells, frostFreeByYear, frostSummary,
} from './historyIndices';
import {
  DEFAULT_SETTINGS, encodeState, decodeState, resolveYearRange, parseQuestion, QUESTION_TILES, type HistorySettings,
} from './historyState';
import { dayInsight, dayCondition, monthInsight, yearInsight, monthNormal } from './historyExplore';

export interface Check { case: string; ok: boolean; detail: string }
const mk = () => { const checks: Check[] = []; return { checks, add: (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d }) }; }

/** Synthetischer Tagesdatensatz: lineare Erwärmung + Jahresgang, deterministisch. */
export function synthDays(startYear: number, endYear: number): DailyRecord[] {
  const out: DailyRecord[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const warming = (y - startYear) * 0.03; // +0,3 °C/Jahrzehnt
    for (let m = 1; m <= 12; m++) {
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      for (let day = 1; day <= dim; day++) {
        const doy = doyOf(y, m, day);
        const seasonal = 12 * Math.sin(((doy - 80) / 366) * Math.PI * 2); // Frühlings-Phase
        const tMean = 10 + warming + seasonal;
        out.push({
          dateISO: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          year: y, month: m, day, doy,
          tMaxC: tMean + 5, tMinC: tMean - 5, tMeanC: tMean,
          precipMm: (doy % 5 === 0 ? 4 : 0), sunshineH: Math.max(0, 6 + seasonal * 0.3),
          windMaxKmh: 15 + ((doy * 37) % 20), windDirDeg: (doy * 13) % 360, humidityPct: 70,
          snowCm: tMean < 0 ? 2 : 0,
        });
      }
    }
  }
  return out;
}

export function verifyHistoryModel(): { checks: Check[]; passed: number; failed: number } {
  const { checks, add } = mk();
  const days = synthDays(1990, 2020);

  // Aggregation
  const yr = yearly(days, 'tmean');
  add('jährlich = 31 Buckets', yr.length === 31, `${yr.length}`);
  add('Jahresmittel ~steigend', (yr[yr.length - 1].value as number) > (yr[0].value as number));
  const mon = aggregate(days, 'tmean', 'monthly');
  add('monatlich = 372 Buckets', mon.length === 31 * 12, `${mon.length}`);
  const sea = aggregate(days, 'tmean', 'seasonal');
  add('saisonal vorhanden', sea.length > 0 && sea.some((b) => b.label.startsWith('Sommer')));
  const precipYr = yearly(days, 'precip');
  add('Niederschlag = Summe > 0', (precipYr[0].value as number) > 0);

  // Kenntage
  const summerDef = kenntagDef('summer');
  const summer = countKenntageByYear(days, summerDef);
  add('Sommertage je Jahr > 0', summer[0].count > 0, `${summer[0].count}`);
  const frost = countKenntageByYear(days, kenntagDef('frost'));
  add('Frosttage je Jahr > 0', frost[0].count > 0, `${frost[0].count}`);
  // angepasste Schwelle (E4.5): höhere Schwelle → weniger Tage
  const fewer = countKenntageByYear(days, summerDef, 28)[0].count;
  add('höhere Schwelle = weniger Tage', fewer <= summer[0].count, `${fewer} ≤ ${summer[0].count}`);
  const top = rankYearsByKenntag(days, kenntagDef('hot'), 28, 3);
  add('Ranking Top-3 absteigend', top.length <= 3 && (top.length < 2 || top[0].count >= top[1].count));

  // Normal / Anomalie / Trend
  const normalOut = normalValue(yr, { id: 'x', label: 'x', start: 1900, end: 1950 }); // klar außerhalb → null
  add('Normal außerhalb = null', normalOut === null, `${normalOut}`);
  const normal91 = normalValue(yr, NORMAL_PERIODS[2]); // 1991-2020
  add('Normal 1991–2020 vorhanden', normal91 != null);
  const anos = anomalies(yr, normal91);
  add('Anomalien zentriert ~0', Math.abs((anos.reduce((s, a) => s + a.anomaly, 0) / anos.length)) < 0.5, `${anos.length}`);
  const trend = linearTrend(yr);
  add('Trend ~+0,3 °C/Dekade', !!trend && Math.abs(trend.slopePerDecade - 0.3) < 0.05, `${trend?.slopePerDecade.toFixed(3)}`);
  add('Trend r² hoch', !!trend && trend.r2 > 0.9, `${trend?.r2.toFixed(2)}`);

  // Rekorde
  const rec = records(days);
  add('wärmster Tag plausibel', !!rec.warmestDay && rec.warmestDay.value > 20, `${rec.warmestDay?.value.toFixed(1)}`);
  add('kältester < wärmster', !!rec.coldestDay && !!rec.warmestDay && rec.coldestDay.value < rec.warmestDay.value);
  add('sonnigster Monat vorhanden', !!rec.sunniestMonth);

  // Wetter an Datum
  const dxy = dateAcrossYears(days, 7, 14, 1);
  add('Datum über Jahre = 31', dxy.length === 31, `${dxy.length}`);
  add('14. Juli warm', (dxy[0].tMaxC as number) > 15);

  // Verteilung / Box
  const box = monthlyDistribution(days, 'tmean');
  add('Box 12 Monate', box.length === 12, `${box.length}`);
  add('Box q1≤median≤q3', box.every((b) => b.q1 <= b.median && b.median <= b.q3));
  add('Juli wärmer als Januar', box[6].median > box[0].median);

  // Temperaturbänder
  const bands = tempBandShares(days);
  add('Bänder Summe ~1', bands.every((b) => Math.abs(b.shares.reduce((s, v) => s + v, 0) - 1) < 1e-6));

  // Windrose
  const rose = windRose(days);
  add('Windrose 8 Sektoren', rose.length === 8);
  add('Windrose Summe ~1', Math.abs(rose.reduce((s, r) => s + r.share, 0) - 1) < 1e-6);

  // Kalender
  const cal = calendarYear(days, 2020, 'tmean');
  add('Kalender 2020 = 366 Tage', cal.length === 366, `${cal.length}`);

  // Hilfen
  add('percentile Median', percentile([1, 2, 3, 4, 5], 0.5) === 3);
  const span = yearSpan(days);
  add('yearSpan 1990–2020', !!span && span.min === 1990 && span.max === 2020, `${span?.min}-${span?.max}`);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

export function verifyHistoryIndices(): { checks: Check[]; passed: number; failed: number } {
  const { checks, add } = mk();
  const days = synthDays(1990, 2020);

  // HDD/GDD
  const hdd = heatingDegreeDaysByYear(days);
  add('HDD je Jahr > 0', hdd[0].value > 0, `${hdd[0].value}`);
  const gdd = growingDegreeDaysByYear(days);
  add('GDD je Jahr > 0', gdd[0].value > 0, `${gdd[0].value}`);
  add('GDD steigt mit Erwärmung', gdd[gdd.length - 1].value >= gdd[0].value);
  const cum = gddCumulative(days, 2010);
  add('GDD kumuliert monoton', cum.every((p, i) => i === 0 || p.cum >= cum[i - 1].cum));
  add('GDD kumuliert endet = Jahres-GDD', Math.abs(cum[cum.length - 1].cum - (gdd.find((g) => g.year === 2010)!.value)) <= 1);

  // Hitzewellen (Schwelle niedrig setzen, damit Synth-Daten sie zeigen)
  const hw = heatWaves(days, 24, 3);
  add('Hitzewellen erkannt', hw.length > 0, `${hw.length}`);
  add('Hitzewelle ≥ 3 Tage', hw.every((s) => s.length >= 3));

  // Trockenperioden
  const dry = drySpells(days, 1, 4);
  add('Trockenperioden erkannt', dry.length > 0, `${dry.length}`);

  // Frostfreie Periode
  const ff = frostFreeByYear(days);
  add('frostfrei je Jahr', ff.length === 31, `${ff.length}`);
  add('frostfreie Länge plausibel', ff.every((r) => r.lengthDays == null || (r.lengthDays > 100 && r.lengthDays < 320)));
  const fs = frostSummary(ff);
  add('mittlere frostfreie Länge', fs.meanLengthDays != null && fs.meanLengthDays > 150, `${fs.meanLengthDays}`);
  add('mittlerer letzter Frost (Frühjahr)', !!fs.meanLastFrost && fs.meanLastFrost.month >= 2 && fs.meanLastFrost.month <= 5, `${fs.meanLastFrost?.month}/${fs.meanLastFrost?.day}`);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

export function verifyHistoryState(): { checks: Check[]; passed: number; failed: number } {
  const { checks, add } = mk();

  // Permalink-Roundtrip
  const loc = { name: 'Dillenburg', lat: 50.7364, lon: 8.2871, admin: 'Hessen' };
  const s: HistorySettings = { ...DEFAULT_SETTINGS, variable: 'precip', resolution: 'monthly', period: 'custom', customStart: 2001, customEnd: 2020, chart: 'box', kenntag: 'frost', kenntagThreshold: -2, months: [6, 7, 8], showLabels: true, showTrend: false, lookupMonth: 5, lookupDay: 3, focusYear: 2018 };
  const enc = encodeState(loc, s);
  const dec = decodeState(`#h=${enc}`);
  add('decode liefert Ort', !!dec?.loc && dec.loc.name === 'Dillenburg' && Math.abs(dec.loc.lat - 50.7364) < 0.001);
  add('Roundtrip Variable', dec?.settings.variable === 'precip');
  add('Roundtrip custom Bereich', dec?.settings.customStart === 2001 && dec?.settings.customEnd === 2020);
  add('Roundtrip Diagramm', dec?.settings.chart === 'box');
  add('Roundtrip Schwelle', dec?.settings.kenntagThreshold === -2, `${dec?.settings.kenntagThreshold}`);
  add('Roundtrip Monate', JSON.stringify(dec?.settings.months) === JSON.stringify([6, 7, 8]));
  add('Roundtrip Labels/Trend', dec?.settings.showLabels === true && dec?.settings.showTrend === false);
  add('decode leer = null', decodeState('#h=') === null);

  // Jahresbereich
  const av = { min: 1940, max: 2024 };
  add('Preset 10y', JSON.stringify(resolveYearRange({ ...DEFAULT_SETTINGS, period: '10y' }, av)) === JSON.stringify({ start: 2015, end: 2024 }));
  add('Preset all', JSON.stringify(resolveYearRange({ ...DEFAULT_SETTINGS, period: 'all' }, av)) === JSON.stringify({ start: 1940, end: 2024 }));
  add('Preset last-year', JSON.stringify(resolveYearRange({ ...DEFAULT_SETTINGS, period: 'last-year' }, av)) === JSON.stringify({ start: 2024, end: 2024 }));
  add('custom geklemmt', JSON.stringify(resolveYearRange({ ...DEFAULT_SETTINGS, period: 'custom', customStart: 1900, customEnd: 2100 }, av)) === JSON.stringify({ start: 1940, end: 2024 }));

  // Fragen-Kacheln
  add('6 Fragen-Kacheln', QUESTION_TILES.length === 6);
  add('jede Kachel hat apply', QUESTION_TILES.every((q) => Object.keys(q.apply).length > 0));

  // Freitext
  const q1 = parseQuestion('war der Mai 2024 zu nass?');
  add('Freitext: nass→Niederschlag', q1.apply.variable === 'precip', `${q1.understood}`);
  add('Freitext: zu nass→Anomalie', q1.apply.chart === 'anomaly');
  add('Freitext: Mai→Monat', JSON.stringify(q1.apply.months) === JSON.stringify([5]));
  const q2 = parseQuestion('wie viele hitzetage pro jahr inzwischen?');
  add('Freitext: Hitzetage', q2.apply.chart === 'kenntage' && q2.apply.kenntag === 'hot');
  add('Freitext: inzwischen→Trend', q2.apply.showTrend === true);
  const q3 = parseQuestion('wetter am 14. juli');
  add('Freitext: Datum 14.7', q3.apply.chart === 'dateLookup' && q3.apply.lookupMonth === 7 && q3.apply.lookupDay === 14);
  const q4 = parseQuestion('hallo blubb xyz');
  add('Freitext: unklar→Rückfrage', !!q4.clarify && q4.clarify.options.length > 0);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

export function verifyHistoryExplore(): { checks: Check[]; passed: number; failed: number } {
  const { checks, add } = mk();
  const days = synthDays(1990, 2020);
  const ref = NORMAL_PERIODS[2]; // 1991-2020

  // Tag
  const di = dayInsight(days, '2018-07-14');
  add('dayInsight liefert Tag', !!di && di.record.dateISO === '2018-07-14');
  add('dayInsight Abweichung+Perzentil', !!di && di.tMaxDevC != null && di.percentileRank != null);
  add('dayInsight Lage-Label', !!di && di.label.length > 0, di?.label);
  add('dayInsight unbekannter Tag = null', dayInsight(days, '1850-01-01') === null);
  add('dayCondition Regen', dayCondition({ ...days[0], precipMm: 5, snowCm: 0 }) === 'rain');
  add('dayCondition Sonne', dayCondition({ ...days[0], precipMm: 0, snowCm: 0, sunshineH: 10 }) === 'sun');

  // Monat
  const mi = monthInsight(days, 2010, 7, ref);
  add('monthInsight Tage', mi.days.length >= 28 && mi.days.length <= 31, `${mi.days.length}`);
  add('monthInsight Mittel/Extreme', mi.tMeanC != null && !!mi.tMaxHigh && !!mi.tMinLow);
  add('monthInsight Sommertage Juli > 0', mi.summerDays > 0, `${mi.summerDays}`);
  add('monthInsight Niederschlagssumme ≥ 0', mi.precipSum >= 0);
  add('monthInsight Normal vorhanden', !!mi.normal && mi.normal.tMeanC != null);
  const miJan = monthInsight(days, 2010, 1);
  add('monthInsight Januar kälter als Juli', (miJan.tMeanC as number) < (mi.tMeanC as number));

  // monthNormal
  const mn = monthNormal(days, 7, ref);
  add('monthNormal Juli ≈ Monatsmittel', mn.tMeanC != null && Math.abs((mn.tMeanC as number) - (mi.tMeanC as number)) < 3);

  // Jahr
  const yi = yearInsight(days, 2015, ref);
  add('yearInsight 12 Monate', yi.months.length === 12);
  add('yearInsight Extreme + Kenntage', !!yi.tMaxHigh && !!yi.tMinLow && yi.summerDays > 0 && yi.frostDays > 0);
  add('yearInsight Niederschlag/Sonne', yi.precipSum >= 0 && yi.sunSum >= 0);
  add('yearInsight Anomalie gesetzt', yi.anomalyC != null && yi.normalLabel === ref.label, `${yi.anomalyC}`);
  const warmestMonth = yi.months.reduce((a, b) => ((b.tMeanC ?? -99) > (a.tMeanC ?? -99) ? b : a)).month;
  add('yearInsight wärmster Monat im Sommer', warmestMonth >= 5 && warmestMonth <= 8, `Monat ${warmestMonth}`);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

// Headless-Runner: nur wenn direkt ausgeführt (durch das Verify-Skript importiert).
export function runAll() {
  const groups: [string, () => { checks: Check[]; passed: number; failed: number }][] = [
    ['model', verifyHistoryModel],
    ['indices', verifyHistoryIndices],
    ['state', verifyHistoryState],
    ['explore', verifyHistoryExplore],
  ];
  let tot = 0, fail = 0;
  for (const [name, fn] of groups) {
    const r = fn(); tot += r.passed + r.failed; fail += r.failed;
    for (const c of r.checks.filter((c) => !c.ok)) console.log(`  FAIL ${name}/${c.case} [${c.detail}]`);
    console.log(`${name}: ${r.passed}/${r.passed + r.failed}`);
  }
  console.log(`HISTORY GESAMT: ${tot - fail}/${tot}`);
  return fail;
}
