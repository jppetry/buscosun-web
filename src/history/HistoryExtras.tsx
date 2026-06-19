/**
 * Feature „Wetterhistorie" — Rekorde (E8), „Wetter an meinem Tag" (E8.3),
 * Tagesdetail mit Stunden-Drill-down (E7.2/7.4) und Brotkrumen (E7.3).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  records, rankYearsByKenntag, kenntagDef, dateAcrossYears, dayClimatology,
  monthName, type DailyRecord,
} from './historyModel';
import { defaultHistorySource, type HourlyPoint } from './historySource';
import { fmtNum } from './charts/common';

// --- Rekorde-Panel (E8.1/8.2) ------------------------------------------------

export function RecordsPanel({ days }: { days: DailyRecord[] }) {
  const rec = useMemo(() => records(days), [days]);
  const topHot = useMemo(() => rankYearsByKenntag(days, kenntagDef('hot'), 30, 5), [days]);
  const topHotFallback = useMemo(() => (topHot.every((y) => y.count === 0) ? rankYearsByKenntag(days, kenntagDef('summer'), 25, 5) : topHot), [topHot, days]);
  const usedSummer = topHot.every((y) => y.count === 0);

  const card = (label: string, value: string, sub: string) => (
    <div className="hi-rec-card"><span className="hi-rec-label">{label}</span><span className="hi-rec-val">{value}</span><span className="hi-rec-sub">{sub}</span></div>
  );
  return (
    <section className="hi-records">
      <span className="rt-eyebrow hi-eyebrow">Rekorde · gesamter Zeitraum</span>
      <div className="hi-rec-grid">
        {rec.warmestDay && card('Wärmster Tag', `${fmtNum(rec.warmestDay.value)} °C`, fmtDateLong(rec.warmestDay.dateISO))}
        {rec.coldestDay && card('Kältester Tag', `${fmtNum(rec.coldestDay.value)} °C`, fmtDateLong(rec.coldestDay.dateISO))}
        {rec.wettestDay && card('Nassester Tag', `${fmtNum(rec.wettestDay.value, 0)} mm`, fmtDateLong(rec.wettestDay.dateISO))}
        {rec.sunniestMonth && card('Sonnigster Monat', `${fmtNum(rec.sunniestMonth.value, 0)} h`, rec.sunniestMonth.key)}
      </div>
      <div className="hi-toplist">
        <span className="hi-toplist-title">Top 5 {usedSummer ? 'sommerlichste' : 'heißeste'} Jahre</span>
        {topHotFallback.map((y, i) => (
          <div key={y.year} className="hi-toprow">
            <span className="hi-toprank">{i + 1}</span><span className="hi-topyear">{y.year}</span>
            <span className="hi-topbar"><i style={{ width: `${(y.count / Math.max(1, topHotFallback[0].count)) * 100}%` }} /></span>
            <span className="hi-topval">{y.count} Tage</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- „Wetter an meinem Tag" (E8.3 / E2.3) -----------------------------------

export function DateLookup({ days, month, day, onChange }: { days: DailyRecord[]; month: number; day: number; onChange: (m: number, d: number) => void }) {
  const rows = useMemo(() => dateAcrossYears(days, month, day, 1), [days, month, day]);
  const valid = rows.filter((r) => r.tMaxC != null);
  const dryShare = useMemo(() => { const withP = rows.filter((r) => r.precipMm != null); return withP.length ? withP.filter((r) => (r.precipMm as number) < 1).length / withP.length : null; }, [rows]);
  const tMaxVals = valid.map((r) => r.tMaxC as number);
  const lo = tMaxVals.length ? Math.min(...tMaxVals) : 0, hi = tMaxVals.length ? Math.max(...tMaxVals) : 30;
  const mean = tMaxVals.length ? tMaxVals.reduce((s, v) => s + v, 0) / tMaxVals.length : 0;

  return (
    <section className="hi-datelookup">
      <div className="hi-dl-head">
        <span className="rt-eyebrow hi-eyebrow">Wetter an meinem Tag · {day}. {monthName(month)} über alle Jahre</span>
        <span className="hi-dl-pick">
          <input type="number" min={1} max={31} value={day} className="hi-thr-in" onChange={(e) => onChange(month, Math.min(31, Math.max(1, Number(e.target.value))))} />.
          <select value={month} className="hi-dl-month" onChange={(e) => onChange(Number(e.target.value), day)}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
          </select>
        </span>
      </div>
      {dryShare != null && <p className="hi-summary">An {Math.round(dryShare * 100)} % der Jahre war es an diesem Tag trocken (&lt; 1 mm). Mittlere Höchsttemperatur {fmtNum(mean)} °C.</p>}
      <div className="hi-dl-bars">
        {valid.map((r) => (
          <div key={r.year} className="hi-dl-bar" title={`${r.year}: ${fmtNum(r.tMaxC as number)} °C, ${r.precipMm != null ? fmtNum(r.precipMm, 1) + ' mm' : '–'}`}>
            <i style={{ height: `${((((r.tMaxC as number) - lo) / Math.max(1, hi - lo)) * 70) + 10}%`, background: (r.precipMm ?? 0) >= 1 ? '#3A6FA8' : '#C99A4E' }} />
            {r.year % 5 === 0 && <span className="hi-dl-yr">{`'${String(r.year).slice(2)}`}</span>}
          </div>
        ))}
      </div>
      <div className="hi-chart-foot"><span><i className="hi-sw" style={{ background: '#C99A4E' }} /> trocken</span><span><i className="hi-sw" style={{ background: '#3A6FA8' }} /> Regen ≥ 1 mm</span><span className="hi-ref-tag">Balkenhöhe = Tmax</span></div>
    </section>
  );
}

// --- Tagesdetail + Stunden-Drill-down (E7.2/7.4) ----------------------------

export function DayDetail({ days, lat, lon, dateISO, onClose, breadcrumb }: {
  days: DailyRecord[]; lat: number; lon: number; dateISO: string; onClose: () => void; breadcrumb: { label: string; onClick?: () => void }[];
}) {
  const rec = days.find((d) => d.dateISO === dateISO);
  const clim = useMemo(() => dayClimatology(days, 'tmax'), [days]);
  const [hourly, setHourly] = useState<HourlyPoint[] | null>(null);
  const [hState, setHState] = useState<'idle' | 'load' | 'ok' | 'none'>('idle');

  useEffect(() => {
    if (!rec) return;
    const ac = new AbortController(); setHState('load'); setHourly(null);
    defaultHistorySource.fetchHourlyDay(lat, lon, dateISO, ac.signal)
      .then((h) => { if (ac.signal.aborted) return; setHourly(h); setHState(h.length ? 'ok' : 'none'); })
      .catch((e) => { if (e?.name !== 'AbortError') setHState('none'); });
    return () => ac.abort();
  }, [lat, lon, dateISO, rec]);

  if (!rec) return null;
  const dayClim = clim.find((c) => c.doy === rec.doy);
  const tMaxDev = rec.tMaxC != null && dayClim ? rec.tMaxC - dayClim.p50 : null;
  const isRecord = rec.tMaxC != null && dayClim ? rec.tMaxC >= dayClim.max - 0.05 : false;

  const metric = (label: string, value: string, sub: string) => (
    <div className="hi-day-metric"><span className="hi-day-mlabel">{label}</span><span className="hi-day-mval">{value}</span><span className="hi-day-msub">{sub}</span></div>
  );

  return (
    <section className="hi-daydetail rt-card">
      <nav className="hi-crumbs" aria-label="Pfad">
        {breadcrumb.map((b, i) => (
          <span key={i}>{b.onClick ? <button type="button" className="hi-crumb" onClick={b.onClick}>{b.label}</button> : <span className="hi-crumb is-cur">{b.label}</span>}{i < breadcrumb.length - 1 && <span className="hi-crumb-sep">›</span>}</span>
        ))}
        <button type="button" className="hi-btn-sm hi-crumb-close" onClick={onClose} aria-label="Schließen">✕</button>
      </nav>
      <div className="hi-day-head">
        <h3>{fmtDateLong(dateISO, true)}</h3>
        {isRecord && <span className="hi-day-badge">Rekord-Hitzetag</span>}
      </div>
      <div className="hi-day-metrics">
        {metric('Tmax', rec.tMaxC != null ? `${fmtNum(rec.tMaxC)} °C` : '–', tMaxDev != null ? `${tMaxDev >= 0 ? '+' : ''}${fmtNum(tMaxDev, 0)}° ggü. Normal` : '')}
        {metric('Tmin', rec.tMinC != null ? `${fmtNum(rec.tMinC)} °C` : '–', rec.tMinC != null && rec.tMinC > 20 ? 'Tropennacht' : '')}
        {metric('Niederschlag', rec.precipMm != null ? `${fmtNum(rec.precipMm, 1)} mm` : '–', (rec.precipMm ?? 0) < 1 ? 'trocken' : '')}
        {metric('Sonne', rec.sunshineH != null ? `${fmtNum(rec.sunshineH, 1)} h` : '–', '')}
        {metric('Wind', rec.windMaxKmh != null ? `${fmtNum(rec.windMaxKmh, 0)} km/h` : '–', '')}
        {metric('Luftfeuchte', rec.humidityPct != null ? `${fmtNum(rec.humidityPct, 0)} %` : '–', '')}
      </div>

      {dayClim && rec.tMaxC != null && (
        <div className="hi-day-place">
          <span className="hi-day-place-label">Einordnung · Tmax gegen Normal &amp; Rekord</span>
          <PlacementBar value={rec.tMaxC} min={dayClim.min} p10={dayClim.p10} p90={dayClim.p90} max={dayClim.max} />
        </div>
      )}

      <div className="hi-day-hourly">
        <span className="hi-day-place-label">Tagesverlauf (Stunden) · falls verfügbar</span>
        {hState === 'load' && <p className="hi-chart-empty">Stundenwerte werden geladen …</p>}
        {hState === 'none' && <p className="hi-chart-empty">Für diesen Tag liegen keine Stundenwerte vor.</p>}
        {hState === 'ok' && hourly && <HourlyCurve points={hourly} />}
      </div>
    </section>
  );
}

function PlacementBar({ value, min, p10, p90, max }: { value: number; min: number; p10: number; p90: number; max: number }) {
  const lo = Math.min(min, value), hi = Math.max(max, value);
  const pct = (v: number) => ((v - lo) / Math.max(0.01, hi - lo)) * 100;
  return (
    <div className="hi-placement">
      <div className="hi-placement-track">
        <div className="hi-placement-record" style={{ left: `${pct(min)}%`, width: `${pct(max) - pct(min)}%` }} />
        <div className="hi-placement-normal" style={{ left: `${pct(p10)}%`, width: `${pct(p90) - pct(p10)}%` }} />
        <div className="hi-placement-marker" style={{ left: `${pct(value)}%` }} title={`${fmtNum(value)} °C`} />
      </div>
      <div className="hi-placement-labels"><span>{fmtNum(min, 0)}°</span><span className="hi-placement-cur">{fmtNum(value)}° · dieser Tag</span><span>{fmtNum(max, 0)}°</span></div>
    </div>
  );
}

function HourlyCurve({ points }: { points: HourlyPoint[] }) {
  const temps = points.map((p) => p.tempC).filter((v): v is number => v != null);
  if (temps.length < 4) return <p className="hi-chart-empty">Zu wenige Stundenwerte.</p>;
  const W = 880, H = 150, padL = 36, padB = 22, padT = 8;
  const lo = Math.min(...temps) - 1, hi = Math.max(...temps) + 1;
  const x = (h: number) => padL + ((W - padL - 8) * h) / 23;
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - lo) / Math.max(0.01, hi - lo));
  const pts = points.filter((p) => p.tempC != null);
  const d = `M ${pts.map((p) => `${x(p.hour).toFixed(1)} ${y(p.tempC as number).toFixed(1)}`).join(' L ')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hi-chart" role="img" aria-label="Stündlicher Temperaturverlauf.">
      {[lo, (lo + hi) / 2, hi].map((t, i) => <g key={i}><line x1={padL} y1={y(t)} x2={W - 8} y2={y(t)} stroke="#EEE6D2" /><text x={padL - 5} y={y(t) + 3} className="hi-axislabel" textAnchor="end">{fmtNum(t, 0)}°</text></g>)}
      <path d={d} fill="none" stroke="#C0492F" strokeWidth={2} strokeLinejoin="round" />
      {[0, 6, 12, 18, 23].map((h) => <text key={h} x={x(h)} y={H - 6} className="hi-axislabel" textAnchor="middle">{String(h).padStart(2, '0')}:00</text>)}
    </svg>
  );
}

// --- Hilfen ------------------------------------------------------------------

function fmtDateLong(iso: string, withWeekday = false): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('de-DE', { weekday: withWeekday ? 'long' : undefined, day: '2-digit', month: 'long', year: 'numeric' });
}
