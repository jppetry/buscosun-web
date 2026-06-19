/**
 * Feature „Wetterhistorie" — Zeitpunkt erkunden.
 *
 * Statt Trend: das TATSÄCHLICHE Wetter eines konkreten Tages / Monats / Jahres,
 * modern visualisiert (Hero + Kennzahl-Karten + Diagramme). Drill zwischen den
 * Ebenen (Jahr → Monat → Tag).
 */

import { useEffect, useMemo, useState } from 'react';
import { calendarYear, variableMeta, monthName, type DailyRecord, type NormalPeriod } from './historyModel';
import { dayInsight, monthInsight, yearInsight, type DayCondition } from './historyExplore';
import { defaultHistorySource, type HourlyPoint } from './historySource';
import type { HistorySettings } from './historyState';
import { absTempColor } from './historyColors';
import { fmtNum } from './charts/common';
import MonthDaysChart from './charts/MonthDaysChart';
import YearMonthsChart from './charts/YearMonthsChart';
import HourlyDayChart from './charts/HourlyDayChart';
import CalendarHeatmap from './charts/CalendarHeatmap';

interface Props {
  days: DailyRecord[];
  lat: number; lon: number;
  settings: HistorySettings;
  patch: (p: Partial<HistorySettings>) => void;
  available: { min: number; max: number } | null;
  normalPeriod: NormalPeriod;
}

const GRANS: { id: 'day' | 'month' | 'year'; label: string }[] = [
  { id: 'day', label: 'Tag' }, { id: 'month', label: 'Monat' }, { id: 'year', label: 'Jahr' },
];
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export default function HistoryExplore({ days, lat, lon, settings, patch, available, normalPeriod }: Props) {
  const gran = settings.exploreGran;
  const y = Math.min(available?.max ?? settings.exploreYear, Math.max(available?.min ?? settings.exploreYear, settings.exploreYear));
  const m = settings.exploreMonth;
  const d = Math.min(settings.exploreDay, daysInMonth(y, m));

  return (
    <section className="hi-explore">
      <div className="hi-explore-bar">
        <div className="hi-segs hi-gran" role="tablist" aria-label="Ebene">
          {GRANS.map((g) => <button key={g.id} type="button" role="tab" aria-selected={gran === g.id} className={`hi-seg${gran === g.id ? ' is-on' : ''}`} onClick={() => patch({ exploreGran: g.id })}>{g.label}</button>)}
        </div>
        <DateNav gran={gran} y={y} m={m} d={d} available={available} patch={patch} />
      </div>

      {gran === 'day' && <DayView days={days} lat={lat} lon={lon} dateISO={iso(y, m, d)} />}
      {gran === 'month' && <MonthView days={days} y={y} m={m} normalPeriod={normalPeriod} onPickDay={(day) => patch({ exploreGran: 'day', exploreDay: day })} />}
      {gran === 'year' && <YearView days={days} y={y} normalPeriod={normalPeriod}
        onPickMonth={(month) => patch({ exploreGran: 'month', exploreMonth: month })}
        onPickDay={(dateISO) => { const [yy, mm, dd] = dateISO.split('-').map(Number); patch({ exploreGran: 'day', exploreYear: yy, exploreMonth: mm, exploreDay: dd }); }} />}
    </section>
  );
}

function iso(y: number, m: number, d: number) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }

// --- Datum-Navigation --------------------------------------------------------

function DateNav({ gran, y, m, d, available, patch }: { gran: 'day' | 'month' | 'year'; y: number; m: number; d: number; available: { min: number; max: number } | null; patch: (p: Partial<HistorySettings>) => void }) {
  const minY = available?.min ?? 1940, maxY = available?.max ?? new Date().getFullYear();
  function step(dir: number) {
    if (gran === 'year') patch({ exploreYear: Math.min(maxY, Math.max(minY, y + dir)) });
    else if (gran === 'month') {
      let nm = m + dir, ny = y;
      if (nm > 12) { nm = 1; ny++; } if (nm < 1) { nm = 12; ny--; }
      if (ny < minY || ny > maxY) return;
      patch({ exploreYear: ny, exploreMonth: nm });
    } else {
      const dt = new Date(Date.UTC(y, m - 1, d + dir));
      if (dt.getUTCFullYear() < minY || dt.getUTCFullYear() > maxY) return;
      patch({ exploreYear: dt.getUTCFullYear(), exploreMonth: dt.getUTCMonth() + 1, exploreDay: dt.getUTCDate() });
    }
  }
  const label = gran === 'year' ? `${y}` : gran === 'month' ? `${monthName(m)} ${y}` : new Date(`${iso(y, m, d)}T12:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="hi-datenav">
      <button type="button" className="hi-btn-sm" onClick={() => step(-1)} aria-label="zurück">‹</button>
      <div className="hi-datenav-fields">
        {gran === 'day' && <input type="number" min={1} max={daysInMonth(y, m)} value={d} className="hi-thr-in" onChange={(e) => patch({ exploreDay: Math.max(1, Math.min(daysInMonth(y, m), Number(e.target.value))) })} aria-label="Tag" />}
        {gran !== 'year' && <select value={m} className="hi-dl-month" onChange={(e) => patch({ exploreMonth: Number(e.target.value) })} aria-label="Monat">{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}</select>}
        <input type="number" min={minY} max={maxY} value={y} className="hi-thr-in hi-year-in" onChange={(e) => patch({ exploreYear: Math.max(minY, Math.min(maxY, Number(e.target.value))) })} aria-label="Jahr" />
      </div>
      <button type="button" className="hi-btn-sm" onClick={() => step(1)} aria-label="vor">›</button>
      <span className="hi-datenav-label">{label}</span>
    </div>
  );
}

// --- Wetter-Icon -------------------------------------------------------------

function ConditionIcon({ c, size = 56 }: { c: DayCondition; size?: number }) {
  if (c === 'sun') return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="8" fill="#E8A33D" /><g stroke="#E8A33D" strokeWidth="2.4" strokeLinecap="round"><line x1="20" y1="3" x2="20" y2="9" /><line x1="20" y1="31" x2="20" y2="37" /><line x1="3" y1="20" x2="9" y2="20" /><line x1="31" y1="20" x2="37" y2="20" /><line x1="8" y1="8" x2="12" y2="12" /><line x1="28" y1="28" x2="32" y2="32" /><line x1="32" y1="8" x2="28" y2="12" /><line x1="12" y1="28" x2="8" y2="32" /></g></svg>;
  if (c === 'rain') return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true"><path d="M 8 22 Q 8 12 18 12 Q 24 6 30 12 Q 38 12 38 20 Q 38 24 32 24 L 12 24 Q 8 24 8 22 Z" fill="#9AB8CF" /><g stroke="#3A6FA8" strokeWidth="2.4" strokeLinecap="round"><line x1="15" y1="28" x2="13" y2="34" /><line x1="22" y1="28" x2="20" y2="34" /><line x1="29" y1="28" x2="27" y2="34" /></g></svg>;
  if (c === 'snow') return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true"><path d="M 8 22 Q 8 12 18 12 Q 24 6 30 12 Q 38 12 38 20 Q 38 24 32 24 L 12 24 Q 8 24 8 22 Z" fill="#CFD9E2" /><g fill="#6B8CA8"><circle cx="15" cy="31" r="1.8" /><circle cx="22" cy="33" r="1.8" /><circle cx="29" cy="31" r="1.8" /></g></svg>;
  return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true"><circle cx="15" cy="15" r="8" fill="#E8C97A" /><path d="M 8 28 Q 8 18 18 18 Q 24 11 32 18 Q 39 18 39 25 Q 39 29 33 29 L 12 29 Q 8 29 8 28 Z" fill="#C9CFD6" /></svg>;
}

// --- Kennzahl-Karte ----------------------------------------------------------

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return <div className="hi-x-metric"><span className="hi-x-mlabel">{label}</span><span className="hi-x-mval" style={accent ? { color: accent } : undefined}>{value}</span>{sub && <span className="hi-x-msub">{sub}</span>}</div>;
}

// --- Tag ---------------------------------------------------------------------

function DayView({ days, lat, lon, dateISO }: { days: DailyRecord[]; lat: number; lon: number; dateISO: string }) {
  const di = useMemo(() => dayInsight(days, dateISO), [days, dateISO]);
  const [hourly, setHourly] = useState<HourlyPoint[] | null>(null);
  const [hState, setHState] = useState<'load' | 'ok' | 'none'>('load');
  useEffect(() => {
    if (!di) return;
    const ac = new AbortController(); setHState('load'); setHourly(null);
    defaultHistorySource.fetchHourlyDay(lat, lon, dateISO, ac.signal)
      .then((h) => { if (ac.signal.aborted) return; setHourly(h); setHState(h.length ? 'ok' : 'none'); })
      .catch((e) => { if (e?.name !== 'AbortError') setHState('none'); });
    return () => ac.abort();
  }, [lat, lon, dateISO, di]);

  if (!di) return <div className="hi-chart-empty">Für den {new Date(`${dateISO}T12:00`).toLocaleDateString('de-DE')} liegen keine Daten vor (verfügbar ab 1940).</div>;
  const r = di.record;
  const heroTemp = r.tMaxC;
  return (
    <>
      <div className="hi-hero" style={{ background: `linear-gradient(135deg, ${absTempColor(r.tMeanC ?? 12)}22, #fff 70%)` }}>
        <ConditionIcon c={di.condition} />
        <div className="hi-hero-text">
          <span className="hi-hero-date">{new Date(`${dateISO}T12:00`).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
          <span className="hi-hero-big">{heroTemp != null ? `${fmtNum(heroTemp)}°` : '–'}</span>
          {di.label && <span className="hi-hero-tag" style={{ color: absTempColor((r.tMeanC ?? 12) + (di.tMaxDevC ?? 0)) }}>{di.isRecordHigh ? '🔥 Allzeit-Rekord · ' : di.isRecordLow ? '❄ Kälte-Rekord · ' : ''}{di.label}{di.tMaxDevC != null ? ` (${di.tMaxDevC >= 0 ? '+' : ''}${fmtNum(di.tMaxDevC, 0)}° ggü. Normal)` : ''}</span>}
        </div>
      </div>
      <div className="hi-x-metrics">
        <Metric label="Höchsttemperatur" value={r.tMaxC != null ? `${fmtNum(r.tMaxC)} °C` : '–'} sub={r.tMinC != null && r.tMinC > 20 ? '' : ''} accent="#C0492F" />
        <Metric label="Tiefsttemperatur" value={r.tMinC != null ? `${fmtNum(r.tMinC)} °C` : '–'} sub={r.tMinC != null && r.tMinC > 20 ? 'Tropennacht' : r.tMinC != null && r.tMinC < 0 ? 'Frost' : ''} accent="#3A6FA8" />
        <Metric label="Niederschlag" value={r.precipMm != null ? `${fmtNum(r.precipMm, 1)} mm` : '–'} sub={(r.precipMm ?? 0) < 1 ? 'trocken' : (r.precipMm ?? 0) >= 20 ? 'sehr nass' : 'nass'} />
        <Metric label="Sonnenstunden" value={r.sunshineH != null ? `${fmtNum(r.sunshineH, 1)} h` : '–'} />
        <Metric label="Wind (max)" value={r.windMaxKmh != null ? `${fmtNum(r.windMaxKmh, 0)} km/h` : '–'} />
        <Metric label="Luftfeuchte" value={r.humidityPct != null ? `${fmtNum(r.humidityPct, 0)} %` : '–'} />
      </div>

      {di.clim && r.tMaxC != null && (
        <div className="hi-x-block">
          <span className="hi-x-blocktitle">Einordnung · Tmax gegen Normal &amp; Rekord</span>
          <Placement value={r.tMaxC} min={di.clim.min} p10={di.clim.p10} p90={di.clim.p90} max={di.clim.max} />
          {di.percentileRank != null && <p className="hi-x-note">Wärmer als an {Math.round(di.percentileRank * 100)} % aller {new Date(`${dateISO}T12:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}-Tage seit Messbeginn.</p>}
        </div>
      )}

      <div className="hi-x-block">
        <span className="hi-x-blocktitle">Tagesverlauf (Stunden)</span>
        {hState === 'load' && <p className="hi-chart-empty">Stundenwerte werden geladen …</p>}
        {hState === 'none' && <p className="hi-chart-empty">Für diesen Tag liegen keine Stundenwerte vor.</p>}
        {hState === 'ok' && hourly && <HourlyDayChart points={hourly} />}
      </div>
    </>
  );
}

function Placement({ value, min, p10, p90, max }: { value: number; min: number; p10: number; p90: number; max: number }) {
  const lo = Math.min(min, value), hi = Math.max(max, value);
  const pct = (v: number) => ((v - lo) / Math.max(0.01, hi - lo)) * 100;
  return (
    <div className="hi-placement">
      <div className="hi-placement-track">
        <div className="hi-placement-record" style={{ left: `${pct(min)}%`, width: `${pct(max) - pct(min)}%` }} />
        <div className="hi-placement-normal" style={{ left: `${pct(p10)}%`, width: `${pct(p90) - pct(p10)}%` }} />
        <div className="hi-placement-marker" style={{ left: `${pct(value)}%` }} />
      </div>
      <div className="hi-placement-labels"><span>{fmtNum(min, 0)}°</span><span className="hi-placement-cur">{fmtNum(value)}° · dieser Tag</span><span>{fmtNum(max, 0)}°</span></div>
    </div>
  );
}

// --- Monat -------------------------------------------------------------------

function MonthView({ days, y, m, normalPeriod, onPickDay }: { days: DailyRecord[]; y: number; m: number; normalPeriod: NormalPeriod; onPickDay: (day: number) => void }) {
  const mi = useMemo(() => monthInsight(days, y, m, normalPeriod), [days, y, m, normalPeriod]);
  if (!mi.n) return <div className="hi-chart-empty">Für {monthName(m)} {y} liegen keine Daten vor (verfügbar ab 1940).</div>;
  const devT = mi.tMeanC != null && mi.normal?.tMeanC != null ? mi.tMeanC - mi.normal.tMeanC : null;
  const devP = mi.normal?.precipSum != null ? mi.precipSum - mi.normal.precipSum : null;
  return (
    <>
      <div className="hi-hero" style={{ background: `linear-gradient(135deg, ${absTempColor(mi.tMeanC ?? 12)}22, #fff 70%)` }}>
        <div className="hi-hero-text hi-hero-wide">
          <span className="hi-hero-date">{mi.label}</span>
          <span className="hi-hero-big">Ø {mi.tMeanC != null ? `${fmtNum(mi.tMeanC)}°` : '–'}</span>
          {devT != null && <span className="hi-hero-tag" style={{ color: devT >= 0 ? '#C0492F' : '#3A6FA8' }}>{devT >= 0 ? '+' : ''}{fmtNum(devT)} ° {devT >= 0 ? 'wärmer' : 'kälter'} als Normal {normalPeriod.label}{devP != null ? ` · ${devP >= 0 ? '+' : ''}${fmtNum(devP, 0)} mm Niederschlag` : ''}</span>}
        </div>
      </div>
      <div className="hi-x-metrics">
        <Metric label="Mittel" value={mi.tMeanC != null ? `${fmtNum(mi.tMeanC)} °C` : '–'} />
        <Metric label="Wärmster Tag" value={mi.tMaxHigh ? `${fmtNum(mi.tMaxHigh.v)} °C` : '–'} sub={mi.tMaxHigh ? `${mi.tMaxHigh.day}. ${monthName(m)}` : ''} accent="#C0492F" />
        <Metric label="Kältester Tag" value={mi.tMinLow ? `${fmtNum(mi.tMinLow.v)} °C` : '–'} sub={mi.tMinLow ? `${mi.tMinLow.day}. ${monthName(m)}` : ''} accent="#3A6FA8" />
        <Metric label="Niederschlag" value={`${fmtNum(mi.precipSum, 0)} mm`} sub={`${mi.rainyDays} Regentage`} />
        <Metric label="Sonne" value={mi.days.some((d) => d.sun != null) ? `${mi.sunSum} h` : '–'} sub={mi.days.some((d) => d.sun != null) ? '' : 'keine Stationsdaten'} />
        <Metric label="Kenntage" value={`${mi.summerDays}× ≥25°`} sub={mi.frostDays ? `${mi.frostDays}× Frost` : ''} />
      </div>
      <div className="hi-x-block">
        <span className="hi-x-blocktitle">Jeder Tag im {monthName(m)} {y}</span>
        <MonthDaysChart days={mi.days} onPickDay={onPickDay} />
      </div>
    </>
  );
}

// --- Jahr --------------------------------------------------------------------

function YearView({ days, y, normalPeriod, onPickMonth, onPickDay }: { days: DailyRecord[]; y: number; normalPeriod: NormalPeriod; onPickMonth: (m: number) => void; onPickDay: (iso: string) => void }) {
  const yi = useMemo(() => yearInsight(days, y, normalPeriod), [days, y, normalPeriod]);
  const cells = useMemo(() => calendarYear(days, y, 'tmax'), [days, y]);
  const tmaxMeta = variableMeta('tmax');
  if (!yi.n) return <div className="hi-chart-empty">Für {y} liegen keine Daten vor (verfügbar ab 1940).</div>;
  return (
    <>
      <div className="hi-hero" style={{ background: `linear-gradient(135deg, ${absTempColor(yi.tMeanC ?? 12)}22, #fff 70%)` }}>
        <div className="hi-hero-text hi-hero-wide">
          <span className="hi-hero-date">Jahr {y}</span>
          <span className="hi-hero-big">Ø {yi.tMeanC != null ? `${fmtNum(yi.tMeanC)}°` : '–'}</span>
          {yi.anomalyC != null && <span className="hi-hero-tag" style={{ color: yi.anomalyC >= 0 ? '#C0492F' : '#3A6FA8' }}>{yi.anomalyC >= 0 ? '+' : ''}{fmtNum(yi.anomalyC)} ° ggü. Normal {yi.normalLabel}</span>}
        </div>
      </div>
      <div className="hi-x-metrics">
        <Metric label="Mittel" value={yi.tMeanC != null ? `${fmtNum(yi.tMeanC)} °C` : '–'} />
        <Metric label="Heißester Tag" value={yi.tMaxHigh ? `${fmtNum(yi.tMaxHigh.v)} °C` : '–'} sub={yi.tMaxHigh ? fmtDay(yi.tMaxHigh.dateISO) : ''} accent="#C0492F" />
        <Metric label="Kältester Tag" value={yi.tMinLow ? `${fmtNum(yi.tMinLow.v)} °C` : '–'} sub={yi.tMinLow ? fmtDay(yi.tMinLow.dateISO) : ''} accent="#3A6FA8" />
        <Metric label="Niederschlag" value={`${fmtNum(yi.precipSum, 0)} mm`} />
        <Metric label="Sonne" value={yi.sunSum > 0 ? `${yi.sunSum} h` : '–'} sub={yi.sunSum > 0 ? '' : 'keine Stationsdaten'} />
        <Metric label="Hitzetage" value={`${yi.hotDays}× ≥30°`} sub={`${yi.summerDays}× ≥25°`} />
      </div>
      <div className="hi-x-chips">
        <span className="hi-x-chip">{yi.summerDays} Sommertage</span>
        <span className="hi-x-chip">{yi.hotDays} Hitzetage</span>
        <span className="hi-x-chip">{yi.tropicalNights} Tropennächte</span>
        <span className="hi-x-chip">{yi.frostDays} Frosttage</span>
        <span className="hi-x-chip">{yi.iceDays} Eistage</span>
      </div>
      <div className="hi-x-block">
        <span className="hi-x-blocktitle">Monat für Monat {y}</span>
        <YearMonthsChart months={yi.months} onPickMonth={onPickMonth} />
      </div>
      <div className="hi-x-block">
        <span className="hi-x-blocktitle">Jeder Tag {y} (Tmax) · klick für Tagesdetail</span>
        <CalendarHeatmap cells={cells} meta={tmaxMeta} year={y} onPick={onPickDay} />
      </div>
    </>
  );
}

function fmtDay(iso: string) { return new Date(`${iso}T12:00`).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }); }
