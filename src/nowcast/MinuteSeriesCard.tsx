/**
 * Minutenverlauf — tile at the top of the readout (Command-Deck: hero value, source chips, small chart) with an
 * "enlarge" icon that opens an overlay over the page: KPI row + the same series over 27 h with a range switch
 * (2 | 6 | 27 h, Jan 25.10.2026 — the 24- and 48-hour steps are gone). Pure presentation of `buildMinuteSeries` over `MV_VIEW_H`.
 * Phase RUC (on, `?ruc=0` = fallback): a first rain from the 5-min form of ICON-D2-RUC leads the tile (minute from the form, sum from
 * buscosun Fusion); source line, KPI and footer name the third layer. Without `nowcast.ruc` nothing changes.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildMinuteSeries, minuteBarsEnabledFrom, MV_VIEW_H, type MinuteSeries } from './minuteSeries';
import MinuteChart from './MinuteChart';
import { fmtClock, fmtMmH, leadLabel, nwpLabel, type Nowcast } from './nowcastView';
import { RUC_LABEL, RUC_HORIZON_H } from '../point/rucFormat';
import { RAIN_GATE_P } from './rainGate';
import { rucCurveEnabledFrom } from './rucCurve';
import './minuteSeries.css';

const RANGES: Array<{ h: number; label: string }> = [{ h: 2, label: '2 h' }, { h: 6, label: '6 h' }, { h: MV_VIEW_H, label: `${MV_VIEW_H} h` }];
/** The tile shows the radar horizon (2 h, Jan 23.10.2026); the overlay carries the 27 h (`MV_VIEW_H`). */
const MINI_RANGE_H = 2;

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
function hero(s: MinuteSeries, bars: boolean): { value: string; line: string; tone: 'wet' | 'soon' | 'dry'; tile: boolean } {
  if (!s.firstWet) return { value: 'Trocken', line: `kein Niederschlag in den nächsten ${MV_VIEW_H} h`, tone: 'dry', tile: true };
  const lead = Math.round((s.firstWet.tMs - s.nowMs) / 60_000);
  if (s.firstWet.source === 'radar') {
    if (lead <= 1) return { value: 'Jetzt', line: 'Regen am Ort · Radar', tone: 'wet', tile: true };
    return { value: `in ${leadLabel(lead)}`, line: `Regen ab ${fmtClock(s.firstWet.tMs)} · Radar, ${bars && s.radar ? `Bild alle ${s.radar.frameStepMin} min` : 'minutengenau'}`, tone: 'soon', tile: true };
  }
  if (s.firstWet.source === 'ruc') {
    // Phase RUC: the minute comes from the 5-min form, the amount from the hourly sum of buscosun Fusion — the tile may lead with it.
    const line = `Regen ab ${fmtClock(s.firstWet.tMs)} · 5-min-Form ${RUC_LABEL}, Stundensumme ${s.fusionLabel}`;
    if (lead <= 1) return { value: 'Jetzt', line: `Regen am Ort · 5-min-Form ${RUC_LABEL}`, tone: 'wet', tile: true };
    if (lead <= 6 * 60) return { value: `in ${leadLabel(lead)}`, line, tone: 'soon', tile: true };
    return { value: `${dayWord(s.nowMs, s.firstWet.tMs)}ab ${fmtClock(s.firstWet.tMs)}`, line, tone: 'soon', tile: true };
  }
  if (lead <= 1) return { value: 'Diese Stunde', line: `${s.fusionLabel}, stündlich`, tone: 'wet', tile: false };
  return { value: `${dayWord(s.nowMs, s.firstWet.tMs)}ab ${fmtClock(s.firstWet.tMs)}`, line: `${s.fusionLabel}, stündlich`, tone: 'soon', tile: false };
}
/** Tile hero when the first precipitation lies beyond the small chart: the window itself is dry. */
function dryWindowHero(s: MinuteSeries, rangeH: number): { value: string; line: string; tone: 'dry'; tile: true } {
  const to = s.nowMs + rangeH * 3_600_000;
  const radarTo = s.radar ? Math.min(s.radar.toMs, to) : null;
  const after = s.ruc ? `5-min-Form ${RUC_LABEL}` : s.fusionLabel;
  const line = radarTo != null && radarTo > s.nowMs
    ? `kein Regen bis ${fmtClock(to)} · Radar bis ${fmtClock(radarTo)}, dann ${after}`
    : `kein Niederschlag bis ${fmtClock(to)} · ${after}`;
  return { value: 'Trocken', line, tone: 'dry', tile: true };
}

function fmtMm(mm: number): string { return `${mm.toFixed(1).replace('.', ',')} mm`; }

export default function MinuteSeriesCard({ nowcast, place, variant }: { nowcast: Nowcast; place: string; variant: 'desktop' | 'mobile' }) {
  const [open, setOpen] = useState(false);
  const [rangeH, setRangeH] = useState(MV_VIEW_H);
  // E-RUC-15 (on, `?mvbars=0` = line + curve): every layer as bars; the radar's first rain, peak and sum read the image bars
  const bars = minuteBarsEnabledFrom(typeof window !== 'undefined' ? window.location.search : '');
  const series = useMemo(() => buildMinuteSeries({
    nowMs: Date.now(),
    horizonH: MV_VIEW_H,
    bars,
    radarFrames: nowcast.radarFrames ?? [],
    radarSource: nowcast.radarSource,
    fusionHours: nowcast.fusionHours ?? [],
    fusionPWet: nowcast.fusionPWet ?? null,
    fusionLabel: nwpLabel(nowcast),
    ruc: nowcast.ruc ?? null,
    gate: nowcast.rainGate === true,
  }), [nowcast, bars]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  if (!series.radar && !series.hours.length) return null;
  const h0 = hero(series, bars);
  const h = h0.tile || !series.firstWet || series.firstWet.tMs <= series.nowMs + MINI_RANGE_H * 3_600_000 ? h0 : dryWindowHero(series, MINI_RANGE_H);
  const ruc = series.ruc;
  const gate = nowcast.rainGate === true;
  // E-RUC-13 (on, `?mvcurve=0` = steps): the 5-min form as a minute curve — drawing only, the numbers stay on the steps
  const curve = rucCurveEnabledFrom(typeof window !== 'undefined' ? window.location.search : '');
  const rucRunUtc = ruc ? `${ruc.run.slice(8, 10)} UTC` : '';
  const sourceLine = `${series.radar ? `${series.radar.product} (Bild alle ${series.radar.frameStepMin} min${bars ? ', ein Balken je Bild' : ', Minute interpoliert'}, bis ${fmtClock(series.radar.toMs)})` : 'kein Radar-Nowcast am Ort'}`
    + (ruc ? ` · ${ruc.label} (Lauf ${rucRunUtc}, 5-min-Summen${bars ? ', ein Balken je 5 min' : curve ? ', Minute interpoliert' : ''}) bis ${fmtClock(ruc.toMs)}, Stundensumme ${series.fusionLabel}` : '')
    + ` · ${series.fusionLabel} als Stundenmittel bis +${MV_VIEW_H} h`;
  const kpis = [
    { k: 'Nächster Regen', v: h0.value, s: h0.line },
    { k: `Spitze · ${MV_VIEW_H} h`, v: series.peak ? fmtMmH(series.peak.mmH) : '—', s: series.peak ? `${dayWord(series.nowMs, series.peak.tMs)}${fmtClock(series.peak.tMs)} · ${series.peak.source === 'radar' ? 'Radar' : series.peak.source === 'ruc' ? `5-min-Form ${RUC_LABEL}` : series.fusionLabel}` : 'kein Niederschlag' },
    // E-RUC-11: the sum counts the hours drawn as rain; what lies below the gate is named apart, never hidden
    { k: `Summe · ${MV_VIEW_H} h`, v: fmtMm(series.sumMm), s: `${ruc ? 'Radar-Minuten + 5-min-Form + Stundenmittel' : 'Radar-Minuten + Stundenmittel'}${gate && series.sumTraceMm >= 0.05 ? ` · + ${fmtMm(series.sumTraceMm)} möglich (Stunden unter der Kante)` : ''}` },
  ];
  const gateNote = gate ? ` Stunden unter ${Math.round(RAIN_GATE_P * 100)} % Regenchance oder unter 0,1 mm/h sind nicht als Regen gezeichnet; dort steht ein Hinweis „Chance · Menge".` : '';
  const footNote = (bars
    ? (ruc
      ? `Bis zum letzten Radarbild steht jeder Balken für ein Radarbild (alle ${series.radar?.frameStepMin ?? 5} min); danach zeigt jeder 5-min-Balken die Form von ${RUC_LABEL} (Lauf ${rucRunUtc}), deren Stundensumme der Wert von ${series.fusionLabel} ist (rechnet der RUC eine Stunde trocken, liegt die Summe gleichmäßig in ihr); jenseits der 5-min-Form (Lauf + ${RUC_HORIZON_H} h) zeigt jeder Balken das Stundenmittel, der Streifen darunter die Regenchance der Stunde. Nichts ist interpoliert.`
      : `Bis zum letzten Radarbild steht jeder Balken für ein Radarbild (alle ${series.radar?.frameStepMin ?? 5} min); danach zeigt jeder Balken das Stundenmittel von ${series.fusionLabel}, der Streifen darunter die Regenchance der Stunde.`)
    : ruc
      ? `Minuten gibt es bis zum letzten Radarbild; danach zeigt die ${curve ? 'Kurve' : 'Stufenlinie'} die 5-min-Form von ${RUC_LABEL} (Lauf ${rucRunUtc})${curve ? ', zwischen den 5-min-Summen zur Minute interpoliert, ohne dass sich eine 5-min-Summe ändert' : ''}, deren Stundensumme der Wert von ${series.fusionLabel} ist (rechnet der RUC eine Stunde trocken, liegt die Summe gleichmäßig in ihr); jenseits der 5-min-Form (Lauf + ${RUC_HORIZON_H} h) zeigt jeder Balken das Stundenmittel, der Streifen darunter die Regenchance der Stunde.`
      : `Minuten gibt es nur bis zum letzten Radarbild; danach zeigt jeder Balken das Stundenmittel von ${series.fusionLabel}, der Streifen darunter die Regenchance der Stunde.`) + gateNote;

  return (
    <>
      <section className={`mv-card mv-card--${variant} mv-tone-${h.tone}`} aria-label="Minutenverlauf" data-origin={series.radar ? (ruc ? 'radar+ruc+fusion' : 'radar+fusion') : (ruc ? 'ruc+fusion' : 'fusion')}>
        <div className="mv-head">
          <span className="mv-eyebrow"><span className="mv-live" aria-hidden="true"><span /><span /></span>Minutenverlauf</span>
          <button type="button" className="mv-expand" onClick={() => setOpen(true)} aria-label={`Minutenverlauf über ${MV_VIEW_H} Stunden groß öffnen`} title={`Groß öffnen · ${MV_VIEW_H} h`}>
            <IconExpand />
          </button>
        </div>
        <MinuteChart series={series} rangeH={MINI_RANGE_H} variant="mini" height={150} curve={curve} bars={bars} />
      </section>

      {open && createPortal(
        <div className="mv-modal" role="dialog" aria-modal="true" aria-label={`Minutenverlauf · ${place}`} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="mv-modal-panel ms-panel">
            <div className="mv-modal-head">
              <div>
                <span className="mv-eyebrow"><span className="mv-live" aria-hidden="true"><span /><span /></span>Regenradar · {place}</span>
                <h2 className="mv-modal-title">Minutenverlauf · {MV_VIEW_H} h</h2>
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
              <MinuteChart series={series} rangeH={rangeH} variant="full" curve={curve} bars={bars} />
            </div>
            <div className="mv-modal-foot">
              <span>● {sourceLine}</span>
              <span>{footNote}</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
