/**
 * Minutenverlauf — card in the readout (small chart, 3 h) with an "enlarge" icon that opens an overlay over the page:
 * the same series over 48 h with a range switch (2 | 6 | 24 | 48 h). Pure presentation of `buildMinuteSeries`.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildMinuteSeries, MV_HORIZON_H, type MinuteSeries } from './minuteSeries';
import MinuteChart from './MinuteChart';
import { fmtClock, nwpLabel, type Nowcast } from './nowcastView';
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

function summaryLine(s: MinuteSeries): string {
  if (!s.firstWet) return `Kein Niederschlag in den nächsten ${MV_HORIZON_H} h erwartet.`;
  const d = new Date(s.firstWet.tMs);
  const today = new Date(s.nowMs).toDateString() === d.toDateString();
  const day = today ? '' : ` (${d.toLocaleDateString('de-DE', { weekday: 'short' })})`;
  if (s.firstWet.tMs <= s.nowMs + 60_000) return s.firstWet.source === 'radar' ? 'Es regnet jetzt · Radar.' : 'Niederschlag in dieser Stunde · buscosun Fusion.';
  return s.firstWet.source === 'radar'
    ? `Regen ab ${fmtClock(s.firstWet.tMs)} · Radar, minutengenau.`
    : `Niederschlag ab der Stunde ${fmtClock(s.firstWet.tMs)}${day} · ${s.fusionLabel}, stündlich.`;
}

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
  const sourceLine = `${series.radar ? `${series.radar.product} (Bild alle ${series.radar.frameStepMin} min, bis ${fmtClock(series.radar.toMs)})` : 'kein Radar-Nowcast am Ort'} · ${series.fusionLabel} stündlich bis +${MV_HORIZON_H} h`;

  return (
    <>
      <section className={`mv-card mv-card--${variant}`} aria-label="Minutenverlauf" data-origin={series.radar ? 'radar+fusion' : 'fusion'}>
        <div className="mv-head">
          <div>
            <span className="mv-eyebrow">Minutenverlauf · {MINI_RANGE_H} h</span>
            <p className="mv-summary">{summaryLine(series)}</p>
          </div>
          <button type="button" className="mv-expand" onClick={() => setOpen(true)} aria-label={`Minutenverlauf über ${MV_HORIZON_H} Stunden groß öffnen`} title={`Groß öffnen · ${MV_HORIZON_H} h`}>
            <IconExpand />
          </button>
        </div>
        <MinuteChart series={series} rangeH={MINI_RANGE_H} variant="mini" />
        <p className="mv-foot">{sourceLine}</p>
      </section>

      {open && createPortal(
        <div className="mv-modal" role="dialog" aria-modal="true" aria-label={`Minutenverlauf · ${place}`} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="mv-modal-panel">
            <div className="mv-modal-head">
              <div>
                <span className="mv-eyebrow">Regenradar · {place}</span>
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
            <p className="mv-modal-summary">{summaryLine(series)}</p>
            <div className="mv-modal-chart">
              <MinuteChart series={series} rangeH={rangeH} variant="full" />
            </div>
            <div className="mv-modal-foot">
              <span>● {sourceLine}</span>
              <span>Minuten gibt es nur bis zum letzten Radarbild; danach zeigt jeder Balken das Stundenmittel von {series.fusionLabel}.</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
