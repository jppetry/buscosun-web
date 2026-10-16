/**
 * Minutenverlauf — tile at the top of the readout (Command-Deck: hero value, source chips, small chart) with an
 * "enlarge" icon that opens an overlay over the page: KPI row + the same series over 48 h with a range switch
 * (2 | 6 | 24 | 48 h). Pure presentation of `buildMinuteSeries`.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildMinuteSeries, MV_HORIZON_H, type MinuteSeries } from './minuteSeries';
import MinuteChart from './MinuteChart';
import { fmtClock, fmtMmH, leadLabel, nwpLabel, type Nowcast } from './nowcastView';
import './minuteSeries.css';

const RANGES: Array<{ h: number; label: string }> = [{ h: 2, label: '2 h' }, { h: 6, label: '6 h' }, { h: 24, label: '24 h' }, { h: 48, label: '48 h' }];
const MINI_RANGE_H = 3;

function IconExpand() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function dayWord(nowMs: number, tMs: number): string {
  const a = new Date(nowMs), b = new Date(tMs);
  if (a.toDateString() === b.toDateString()) return '';
  const tomorrow = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1);
  if (tomorrow.toDateString() === b.toDateString()) return 'morgen ';
  return `${b.toLocaleDateString('de-DE', { weekday: 'short' })} `;
}

/** Hero: the one value the tile leads with, plus the line under it. `tile: false` = only in the overlay's KPI row (Fusion hours carry no minute). */
function hero(s: MinuteSeries): { value: string; line: string; tone: 'wet' | 'soon' | 'dry'; tile: boolean } {
  if (!s.firstWet) return { value: 'Trocken', line: `kein Niederschlag in den nächsten ${MV_HORIZON_H} h`, tone: 'dry', tile: true };
  const lead = Math.round((s.firstWet.tMs - s.nowMs) / 60_000);
  if (s.firstWet.source === 'radar') {
    if (lead <= 1) return { value: 'Jetzt', line: 'Regen am Ort · Radar', tone: 'wet', tile: true };
    return { value: `in ${leadLabel(lead)}`, line: `Regen ab ${fmtClock(s.firstWet.tMs)} · Radar, minutengenau`, tone: 'soon', tile: true };
  }
  if (lead <= 1) return { value: 'Diese Stunde', line: `${s.fusionLabel}, stündlich`, tone: 'wet', tile: false };
  return { value: `${dayWord(s.nowMs, s.firstWet.tMs)}ab ${fmtClock(s.firstWet.tMs)}`, line: `${s.fusionLabel}, stündlich`, tone: 'soon', tile: false };
}
/** Tile hero when the first precipitation lies beyond the small chart: the window itself is dry. */
function dryWindowHero(s: MinuteSeries, rangeH: number): { value: string; line: string; tone: 'dry'; tile: true } {
  const to = s.nowMs + rangeH * 3_600_000;
  const radarTo = s.radar ? Math.min(s.radar.toMs, to) : null;
  const line = radarTo != null && radarTo > s.nowMs
    ? `kein Regen bis ${fmtClock(to)} · Radar bis ${fmtClock(radarTo)}, dann ${s.fusionLabel}`
    : `kein Niederschlag bis ${fmtClock(to)} · ${s.fusionLabel}`;
  return { value: 'Trocken', line, tone: 'dry', tile: true };
}

function fmtMm(mm: number): string { return `${mm.toFixed(1).replace('.', ',')} mm`; }

export default function MinuteSeriesCard({ nowcast, place, variant }: { nowcast: Nowcast; place: string; variant: 'desktop' | 'mobile' }) {
  const [open, setOpen] = useState(false);
  const [rangeH, setRangeH] = useState(48);
  const series = useMemo(() => buildMinuteSeries({
    nowMs: Date.now(),
    radarFrames: nowcast.radarFrames ?? [],
    radarSource: nowcast.radarSource,
    fusionHours: nowcast.fusionHours ?? [],
    fusionPWet: nowcast.fusionPWet ?? null,
    fusionLabel: nwpLabel(nowcast),
  }), [nowcast]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  if (!series.radar && !series.hours.length) return null;
  const h0 = hero(series);
  const h = h0.tile || !series.firstWet || series.firstWet.tMs <= series.nowMs + MINI_RANGE_H * 3_600_000 ? h0 : dryWindowHero(series, MINI_RANGE_H);
  const sourceLine = `${series.radar ? `${series.radar.product} (Bild alle ${series.radar.frameStepMin} min, Minute interpoliert, bis ${fmtClock(series.radar.toMs)})` : 'kein Radar-Nowcast am Ort'} · ${series.fusionLabel} als Stundenmittel bis +${MV_HORIZON_H} h`;
  const kpis = [
    { k: 'Nächster Regen', v: h0.value, s: h0.line },
    { k: 'Spitze · 48 h', v: series.peak ? fmtMmH(series.peak.mmH) : '—', s: series.peak ? `${dayWord(series.nowMs, series.peak.tMs)}${fmtClock(series.peak.tMs)} · ${series.peak.source === 'radar' ? 'Radar' : series.fusionLabel}` : 'kein Niederschlag' },
    { k: 'Summe · 48 h', v: fmtMm(series.sumMm), s: 'Radar-Minuten + Stundenmittel' },
  ];

  return (
    <>
      <section className={`mv-card mv-card--${variant} mv-tone-${h.tone}`} aria-label="Minutenverlauf" data-origin={series.radar ? 'radar+fusion' : 'fusion'}>
        <div className="mv-head">
          <span className="mv-eyebrow"><span className="mv-live" aria-hidden="true"><span /><span /></span>Minutenverlauf</span>
          <button type="button" className="mv-expand" onClick={() => setOpen(true)} aria-label={`Minutenverlauf über ${MV_HORIZON_H} Stunden groß öffnen`} title={`Groß öffnen · ${MV_HORIZON_H} h`}>
            <IconExpand />
          </button>
        </div>
        {h.tile && (
          <div className="mv-hero">
            <span className="mv-hero-value">{h.value}</span>
            {h.line && <span className="mv-hero-line">{h.line}</span>}
          </div>
        )}
        <MinuteChart series={series} rangeH={MINI_RANGE_H} variant="mini" height={150} />
      </section>

      {open && createPortal(
        <div className="mv-modal" role="dialog" aria-modal="true" aria-label={`Minutenverlauf · ${place}`} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="mv-modal-panel">
            <div className="mv-modal-head">
              <div>
                <span className="mv-eyebrow"><span className="mv-live" aria-hidden="true"><span /><span /></span>Regenradar · {place}</span>
                <h2 className="mv-modal-title">Minutenverlauf · {MV_HORIZON_H} h</h2>
              </div>
              <div className="mv-modal-tools">
                <div className="mv-seg" role="tablist" aria-label="Zeitraum">
                  {RANGES.map((r) => (
                    <button key={r.h} type="button" role="tab" aria-selected={rangeH === r.h} className={rangeH === r.h ? 'is-active' : ''} onClick={() => setRangeH(r.h)}>{r.label}</button>
                  ))}
                </div>
                <button type="button" className="mv-close" onClick={() => setOpen(false)} aria-label="Schließen"><IconClose /></button>
              </div>
            </div>
            <div className="mv-kpis">
              {kpis.map((x) => (
                <div key={x.k} className="mv-kpi">
                  <span className="mv-kpi-k">{x.k}</span>
                  <span className="mv-kpi-v">{x.v}</span>
                  {x.s && <span className="mv-kpi-s">{x.s}</span>}
                </div>
              ))}
            </div>
            <div className="mv-modal-chart">
              <MinuteChart series={series} rangeH={rangeH} variant="full" />
            </div>
            <div className="mv-modal-foot">
              <span>● {sourceLine}</span>
              <span>Minuten gibt es nur bis zum letzten Radarbild; danach zeigt jeder Balken das Stundenmittel von {series.fusionLabel}, der Streifen darunter die Regenchance der Stunde.</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
