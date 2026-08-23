/**
 * Feature „Wetterhistorie" — Profi-Layer (E9/E10/E12).
 *
 * Zwei Orte vergleichen mit identischen Skalen (E9), abgeleitete Indizes mit
 * Segment-Presets (E12) und Export/Teilen/Einbetten/Bericht (E10).
 */

import { useEffect, useMemo, useState } from 'react';
import { geocodeDACH } from '../geocode';
import { defaultHistorySource } from './historySource';
import {
  yearly, linearTrend, variableMeta, type DailyRecord, type VariableKey,
} from './historyModel';
import {
  frostFreeByYear, frostSummary, growingDegreeDaysByYear, gddCumulative,
  heatingDegreeDaysByYear, heatWaves, drySpells, GDD_BASE_C, HDD_BASE_C,
} from './historyIndices';
import type { Bucket } from './historyModel';
import type { HistoryLocation, HistorySettings } from './historyState';
import { bucketsToCSV, downloadBlob, svgToPng, firstSvgIn, embedSnippet } from './historyExport';
import { CHART, plotW, plotH, niceTicks, fmtNum } from './charts/common';

interface Props {
  loc: HistoryLocation;
  days: DailyRecord[];
  settings: HistorySettings;
  buckets: Bucket[];
  range: { start: number; end: number };
  chartsRef: React.RefObject<HTMLDivElement | null>;
}

const PRESETS: { id: string; label: string; indices: IndexKey[] }[] = [
  { id: 'garten', label: 'Gärtner', indices: ['frostfree', 'gdd', 'lastfrost'] },
  { id: 'energie', label: 'Energie', indices: ['hdd', 'frostfree'] },
  { id: 'event', label: 'Event', indices: ['dry', 'frostfree'] },
  { id: 'landwirt', label: 'Landwirtschaft', indices: ['gdd', 'frostfree', 'dry'] },
];
type IndexKey = 'frostfree' | 'gdd' | 'lastfrost' | 'hdd' | 'dry';

export default function HistoryPro({ loc, days, settings, buckets, range, chartsRef }: Props) {
  const [preset, setPreset] = useState('garten');
  const meta = variableMeta(settings.variable);
  const indices = PRESETS.find((p) => p.id === preset)!.indices;

  return (
    <section className="hi-pro">
      <div className="hi-pro-head"><span className="rt-eyebrow hi-eyebrow">Profi-Layer · Vergleich · Indizes · Bericht</span></div>

      <CompareBlock loc={loc} baseDays={days} variable={settings.variable} range={range} />

      <div className="hi-pro-block">
        <div className="hi-pro-block-head">
          <span className="hi-pro-title">Abgeleitete Indizes</span>
          <div className="hi-segs">{PRESETS.map((p) => <button key={p.id} type="button" className={`hi-seg${preset === p.id ? ' is-on' : ''}`} onClick={() => setPreset(p.id)}>{p.label}</button>)}</div>
        </div>
        <IndicesPanel days={days} indices={indices} focusYear={range.end} />
      </div>

      <ExportBar loc={loc} buckets={buckets} meta={meta} chartsRef={chartsRef} />
    </section>
  );
}

// --- Vergleich zweier Orte (E9) ---------------------------------------------

function CompareBlock({ loc, baseDays, variable, range }: { loc: HistoryLocation; baseDays: DailyRecord[]; variable: VariableKey; range: { start: number; end: number } }) {
  const [other, setOther] = useState<HistoryLocation | null>(null);
  const [otherDays, setOtherDays] = useState<DailyRecord[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!other) { setOtherDays(null); return; }
    const ac = new AbortController(); setOtherDays(null);
    defaultHistorySource.fetchDailyRange(other.lat, other.lon, defaultHistorySource.minYear, new Date().getFullYear(), ac.signal)
      .then((d) => { if (!ac.signal.aborted) setOtherDays(d); }).catch(() => { });
    return () => ac.abort();
  }, [other]);

  async function search() {
    if (q.trim().length < 2) return;
    setBusy(true);
    try { const r = await geocodeDACH(q.trim()); if (r[0]) setOther({ name: r[0].name, lat: r[0].lat, lon: r[0].lon, country: r[0].country }); }
    finally { setBusy(false); }
  }

  const meta = variableMeta(variable);
  const inRange = (d: DailyRecord[]) => d.filter((x) => x.year >= range.start && x.year <= range.end);
  const aYr = useMemo(() => yearly(inRange(baseDays), variable).filter((b) => b.value != null), [baseDays, variable, range]);
  const bYr = useMemo(() => (otherDays ? yearly(inRange(otherDays), variable).filter((b) => b.value != null) : []), [otherDays, variable, range]);

  return (
    <div className="hi-pro-block">
      <div className="hi-pro-block-head">
        <span className="hi-pro-title">Zwei Orte vergleichen · identische Skalen</span>
        <div className="ev-search hi-compare-search">
          <input className="ev-search-input" placeholder="Zweiten Ort suchen …" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} aria-label="Zweiten Ort suchen" />
          <button type="button" className="ev-search-go" onClick={() => void search()} disabled={busy || q.trim().length < 2}>{busy ? '…' : 'Vergleichen'}</button>
        </div>
      </div>
      {!other && <p className="hi-hint">Suche einen zweiten Ort, um beide unter identischen Einstellungen (Variable, Zeitraum) zu vergleichen.</p>}
      {other && !otherDays && <p className="hi-chart-empty">{other.name} wird geladen …</p>}
      {other && otherDays && bYr.length > 1 && (
        <CompareChart a={{ name: loc.name, yr: aYr, color: '#3A6FA8' }} b={{ name: other.name, yr: bYr, color: '#C0492F' }} meta={meta} />
      )}
    </div>
  );
}

function CompareChart({ a, b, meta }: { a: { name: string; yr: Bucket[]; color: string }; b: { name: string; yr: Bucket[]; color: string }; meta: { label: string; unit: string } }) {
  const { W, H, PADL, PADT, PADR } = CHART;
  const pw = plotW(), ph = plotH();
  const all = [...a.yr, ...b.yr];
  const t0 = Math.min(...all.map((x) => x.t)), t1 = Math.max(...all.map((x) => x.t));
  let lo = Math.min(...all.map((x) => x.value as number)), hi = Math.max(...all.map((x) => x.value as number));
  const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const x = (t: number) => PADL + (pw * (t - t0)) / Math.max(1e-6, t1 - t0);
  const y = (v: number) => PADT + ph * (1 - (v - lo) / Math.max(0.01, hi - lo));
  const line = (yr: Bucket[]) => `M ${yr.map((p) => `${x(p.t).toFixed(1)} ${y(p.value as number).toFixed(1)}`).join(' L ')}`;
  const ticks = niceTicks(lo, hi, 5);
  const meanA = a.yr.reduce((s, p) => s + (p.value as number), 0) / a.yr.length;
  const meanB = b.yr.reduce((s, p) => s + (p.value as number), 0) / b.yr.length;
  const trA = linearTrend(a.yr), trB = linearTrend(b.yr);
  const diff = meanA - meanB;
  const summary = `${a.name} im Mittel ${fmtNum(Math.abs(diff))} ${meta.unit} ${diff >= 0 ? 'höher' : 'niedriger'} als ${b.name}.${trA && trB ? ` Beide mit Trend (${a.name} ${trA.slopePerDecade >= 0 ? '+' : ''}${fmtNum(trA.slopePerDecade, 2)}, ${b.name} ${trB.slopePerDecade >= 0 ? '+' : ''}${fmtNum(trB.slopePerDecade, 2)} ${meta.unit}/Jahrzehnt).` : ''}`;

  return (
    <>
      <div className="hi-chart-wrap">
        <svg className="hi-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Vergleich ${a.name} vs ${b.name}.`}>
          {ticks.map((t) => <g key={t}><line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} stroke="#EEE6D2" /><text x={PADL - 6} y={y(t) + 3} className="hi-axislabel" textAnchor="end">{fmtNum(t, 0)}{meta.unit === '°C' ? '°' : ''}</text></g>)}
          <path d={line(a.yr)} fill="none" stroke={a.color} strokeWidth={2} strokeLinejoin="round" />
          <path d={line(b.yr)} fill="none" stroke={b.color} strokeWidth={2} strokeLinejoin="round" />
          {a.yr.filter((_, i) => i % Math.ceil(a.yr.length / 8) === 0).map((p) => <text key={p.key} x={x(p.t)} y={H - 10} className="hi-axislabel" textAnchor="middle">{p.year}</text>)}
        </svg>
        <div className="hi-chart-foot"><span><i className="hi-sw" style={{ background: a.color }} /> {a.name}</span><span><i className="hi-sw" style={{ background: b.color }} /> {b.name}</span></div>
      </div>
      <p className="hi-summary">{summary}</p>
    </>
  );
}

// --- Indizes (E12) -----------------------------------------------------------

function IndicesPanel({ days, indices, focusYear }: { days: DailyRecord[]; indices: IndexKey[]; focusYear: number }) {
  const ff = useMemo(() => frostFreeByYear(days), [days]);
  const fs = useMemo(() => frostSummary(ff), [ff]);
  const gdd = useMemo(() => growingDegreeDaysByYear(days), [days]);
  const hdd = useMemo(() => heatingDegreeDaysByYear(days), [days]);
  const dry = useMemo(() => drySpells(days, 1, 10), [days]);
  const cum = useMemo(() => gddCumulative(days, focusYear), [days, focusYear]);
  const waves = useMemo(() => heatWaves(days.filter((d) => d.year === focusYear), 28, 3), [days, focusYear]);

  const ffMeanRecent = avgOfLast(ff.map((r) => r.lengthDays).filter((x): x is number => x != null), 10);
  const ffMeanEarly = avgOfFirst(ff.map((r) => r.lengthDays).filter((x): x is number => x != null), 30);
  const gddLast = gdd.find((g) => g.year === focusYear)?.value ?? gdd[gdd.length - 1]?.value ?? 0;
  const hddMean = Math.round(hdd.reduce((s, h) => s + h.value, 0) / Math.max(1, hdd.length));

  const card = (key: IndexKey) => {
    switch (key) {
      case 'frostfree': return <Idx key={key} label="Frostfreie Periode" value={`${fs.meanLengthDays ?? '–'} Tage`} sub={ffMeanRecent != null && ffMeanEarly != null ? `${ffMeanRecent - ffMeanEarly >= 0 ? '+' : ''}${Math.round(ffMeanRecent - ffMeanEarly)} Tage vs. früher` : 'Mittel'} />;
      case 'gdd': return <Idx key={key} label={`Wachstumsgradtage (${focusYear})`} value={gddLast.toLocaleString('de-DE')} sub={`Basis ${GDD_BASE_C} °C · kumuliert`} />;
      case 'lastfrost': return <Idx key={key} label="Letzter Frost (Ø)" value={fs.meanLastFrost ? `${fs.meanLastFrost.day}. ${MONTHS[fs.meanLastFrost.month - 1]}` : '–'} sub={fs.meanLastFrost ? `Schwankung ±${fs.meanLastFrost.spreadDays} Tage` : ''} />;
      case 'hdd': return <Idx key={key} label="Heizgradtage" value={hddMean.toLocaleString('de-DE')} sub={`Basis ${HDD_BASE_C} °C · pro Jahr`} />;
      case 'dry': return <Idx key={key} label="Trockenperioden (≥10 T)" value={`${dry.length}`} sub={dry.length ? `längste ${Math.max(...dry.map((s) => s.length))} Tage` : 'keine'} />;
    }
  };

  return (
    <>
      <div className="hi-idx-grid">{indices.map(card)}</div>
      <div className="hi-idx-chart">
        <span className="hi-day-place-label">Wachstumsgradtage kumuliert ({focusYear}) + erkannte Hitzewellen</span>
        <GddChart cum={cum} waves={waves.map((w) => ({ start: doy(w.startISO), end: doy(w.endISO), len: w.length }))} year={focusYear} />
      </div>
    </>
  );
}

function Idx({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="hi-idx-card"><span className="hi-rec-label">{label}</span><span className="hi-idx-val">{value}</span><span className="hi-rec-sub">{sub}</span></div>;
}

function GddChart({ cum, waves, year }: { cum: { doy: number; cum: number }[]; waves: { start: number; end: number; len: number }[]; year: number }) {
  if (cum.length < 10) return <p className="hi-chart-empty">Für {year} keine GDD-Daten.</p>;
  const W = 880, H = 200, padL = 44, padB = 24, padT = 10, padR = 12;
  const maxC = cum[cum.length - 1].cum || 1;
  const x = (d: number) => padL + ((W - padL - padR) * (d - 1)) / 365;
  const y = (c: number) => padT + (H - padT - padB) * (1 - c / maxC);
  const path = `M ${cum.map((p) => `${x(p.doy).toFixed(1)} ${y(p.cum).toFixed(1)}`).join(' L ')}`;
  const ticks = niceTicks(0, maxC, 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hi-chart" role="img" aria-label={`GDD kumuliert ${year}.`}>
      {ticks.map((t) => <g key={t}><line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#EEE6D2" /><text x={padL - 5} y={y(t) + 3} className="hi-axislabel" textAnchor="end">{Math.round(t)}</text></g>)}
      {waves.map((w, i) => <rect key={i} x={x(w.start)} y={padT} width={Math.max(2, x(w.end) - x(w.start))} height={H - padT - padB} fill="#C0492F" opacity={0.12}><title>Hitzewelle {w.len} Tage</title></rect>)}
      <path d={path} fill="none" stroke="#7A9466" strokeWidth={2.2} strokeLinejoin="round" />
      {[1, 91, 182, 274, 365].map((d, i) => <text key={i} x={x(d)} y={H - 8} className="hi-axislabel" textAnchor="middle">{['Jan', 'Apr', 'Jul', 'Okt', 'Dez'][i]}</text>)}
      {waves.length > 0 && <text x={W - padR} y={padT + 12} className="hi-axislabel" textAnchor="end" fill="#C0492F">{waves.length} Hitzewelle(n)</text>}
    </svg>
  );
}

// --- Export / Teilen / Bericht (E10) ----------------------------------------

function ExportBar({ loc, buckets, meta, chartsRef }: { loc: HistoryLocation; buckets: Bucket[]; meta: { label: string; unit: string }; chartsRef: React.RefObject<HTMLDivElement | null> }) {
  const [copied, setCopied] = useState('');
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  function exportPng() {
    const svg = firstSvgIn(chartsRef.current);
    if (!svg) return;
    svgToPng(svg, { title: `${meta.label} · ${loc.name}`, subtitle: `${buckets[0]?.year ?? ''}–${buckets[buckets.length - 1]?.year ?? ''}`, source: 'Quelle: ERA5 / Open-Meteo Archive (Reanalyse)', filename: `historie-${loc.name}-${meta.label}.png` });
  }
  function exportCsv() {
    const csv = bucketsToCSV(buckets, meta, loc.name, defaultHistorySource.label);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `historie-${loc.name}-${meta.label}.csv`);
  }
  async function copy(text: string, tag: string) { try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(''), 1500); } catch { /* ignore */ } }

  return (
    <div className="hi-pro-block">
      <div className="hi-pro-block-head"><span className="hi-pro-title">Export · Teilen · Einbetten</span></div>
      <div className="hi-export-grid">
        <button type="button" className="hi-export-btn" onClick={exportPng}><strong>Als Bild</strong><span>PNG mit Titel, Ort, Quelle</span></button>
        <button type="button" className="hi-export-btn" onClick={exportCsv}><strong>Tabelle (CSV)</strong><span>aktuelle Reihe</span></button>
        <button type="button" className="hi-export-btn" onClick={() => copy(shareUrl, 'link')}><strong>{copied === 'link' ? '✓ kopiert' : 'Link zur Ansicht'}</strong><span>stellt genau diese Ansicht her</span></button>
        <button type="button" className="hi-export-btn" onClick={() => copy(embedSnippet(shareUrl), 'embed')}><strong>{copied === 'embed' ? '✓ kopiert' : 'Einbetten'}</strong><span>iframe-Code kopieren</span></button>
        <button type="button" className="hi-export-btn" onClick={() => window.print()}><strong>Bericht (Druck/PDF)</strong><span>Ort, Zeitraum &amp; Quelle inklusive</span></button>
        <button type="button" className="hi-export-btn" onClick={() => copy(`Meine Klimastreifen für ${loc.name}: ${shareUrl}`, 'social')}><strong>{copied === 'social' ? '✓ kopiert' : 'Klimastreifen teilen'}</strong><span>Text + Link für Social</span></button>
      </div>
    </div>
  );
}

// --- Hilfen ------------------------------------------------------------------

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function doy(iso: string): number { const [y, m, d] = iso.split('-').map(Number); return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86_400_000); }
function avgOfLast(a: number[], n: number): number | null { const s = a.slice(-n); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; }
function avgOfFirst(a: number[], n: number): number | null { const s = a.slice(0, n); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; }
