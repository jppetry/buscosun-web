/**
 * Ereignisse — Command-Deck tile in the readout (vertical timeline over 48 h, source per item) with an "enlarge" icon
 * that opens the detail overlay: KPI row (next rain with probability and source, 6-h peak and sum with band, thunder /
 * hail / heavy signals, phase and character), the full timeline grouped by day, phase changes, snow line, the alpine
 * split and the data sources with their age. Pure presentation of `buildEventDetail` and `nowcast.summary`.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { buildEventDetail, ED_HORIZON_H, type EventItem } from './eventDetail';
import { phaseLabelStep, type EventTone, type Nowcast } from './nowcastModel';
import { fmtClock, fmtMmH, freshness, nwpLabel, sourceLabel } from './nowcastView';
import { dayWord, type RainWindow } from './rainWindow';
import { AlpineCard } from './NowcastDetail';
import './minuteSeries.css';
import './eventsTile.css';

const MIN = 60_000;
const TILE_MAX = 6;

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

export function eventToneColor(t: EventTone): string {
  switch (t) {
    case 'good': return 'var(--sage-600, #7A9466)';
    case 'alert': return '#C0392B';
    case 'warn': return 'var(--terracotta-500, #C97B47)';
    case 'muted': return 'var(--stone-400, #A89A7A)';
    default: return 'var(--steel-600, #3A6FA8)';
  }
}

const d1 = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');

/** "14:37" today, "morgen 06:00", "Sa 17:00". */
function whenLabel(tMs: number, nowMs: number): string {
  const dw = dayWord(tMs, nowMs);
  const c = fmtClock(tMs);
  return dw === 'heute' ? c : `${dw.slice(0, dw === 'morgen' ? 6 : 2)} ${c}`;
}
function relLabel(tMs: number, nowMs: number): string {
  const m = Math.round((tMs - nowMs) / MIN);
  if (m <= 0) return 'jetzt';
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 || h >= 6 ? `in ${h} h` : `in ${h} h ${r}`;
}

function EventRow({ e, nowMs, compact }: { e: EventItem; nowMs: number; compact: boolean }) {
  const color = eventToneColor(e.tone);
  return (
    <li className={`ed-row ed-row--${e.tone}`} data-origin={e.source}>
      <span className="ed-dot" style={{ background: color }} aria-hidden="true" />
      <span className="ed-when">
        <b style={{ color }}>{whenLabel(e.tMs, nowMs)}</b>
        {!compact && <em>{relLabel(e.tMs, nowMs)}</em>}
      </span>
      <span className="ed-body">
        <span className="ed-title">{e.title}{e.precision === 'min' && <i className="ed-min" title="minutengenau aus dem Radar">min</i>}</span>
        {e.detail && <span className="ed-detail">{e.detail}</span>}
        {e.sourceLabel && !compact && <span className={`ed-src ed-src--${e.source}`}>{e.sourceLabel}</span>}
      </span>
    </li>
  );
}

function Eyebrow({ text }: { text: string }) {
  return <span className="mv-eyebrow"><span className="mv-live ed-live" aria-hidden="true"><span /><span /></span>{text}</span>;
}

export default function EventsTile({ nowcast, rainWindow, place, variant }: { nowcast: Nowcast; rainWindow: RainWindow | null; place: string; variant: 'desktop' | 'mobile' }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<6 | 48>(48);
  const ed = useMemo(() => buildEventDetail(nowcast), [nowcast]);
  const nowMs = ed.nowMs;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  const s = nowcast.summary;
  const tileItems = ed.items.slice(0, TILE_MAX);
  const more = ed.items.length - tileItems.length;
  const listed = ed.items.filter((e) => range === 48 || e.tMs <= nowMs + 6 * 60 * MIN);

  // group by day word
  const groups: Array<{ day: string; items: EventItem[] }> = [];
  for (const e of listed) {
    const day = dayWord(e.tMs, nowMs);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(e); else groups.push({ day, items: [e] });
  }

  const fresh = freshness(nowcast);
  const nextRain: { v: string; s: string } = rainWindow
    ? { v: rainWindow.kind === 'none' ? '—' : rainWindow.label, s: `${rainWindow.sentence}${rainWindow.prob != null ? ` · ${Math.round(rainWindow.prob * 100)} %` : ''} · ${rainWindow.sourceLabel}` }
    : ed.series.firstWet
      ? { v: whenLabel(ed.series.firstWet.tMs, nowMs), s: ed.series.firstWet.source === 'radar' ? 'Radar, minutengenau' : `${ed.fusionLabel}, stündlich` }
      : { v: 'Trocken', s: `kein Niederschlag in ${ED_HORIZON_H} h` };
  const kpis: Array<{ k: string; v: string; s: string; tone?: EventTone }> = [
    { k: 'Nächster Regen', v: nextRain.v, s: nextRain.s },
    { k: 'Spitze · 6 h', v: s.peakMmH >= 0.1 ? fmtMmH(s.peakMmH) : '—', s: s.heavyRain ? 'Starkregen-Signal (≥ 5 mm/h oder ≥ 15 mm / 6 h)' : 'kein Starkregen-Signal', tone: s.heavyRain ? 'alert' : undefined },
    { k: 'Summe · 6 h', v: `${d1(s.sumMm)} mm`, s: `Band ${d1(s.sumMinMm)}–${d1(s.sumMaxMm)} mm` },
    { k: 'Gewitter · Hagel', v: `${s.thunderRiskPct} %`, s: `${s.thunderLabel}${s.hailRiskPct > 0 ? ` · Hagel ${s.hailRiskPct} %` : ' · kein Hagelsignal'} (Heuristik ohne CAPE)`, tone: s.thunderRiskPct >= 30 ? 'warn' : undefined },
    { k: 'Phase · Charakter', v: s.phaseLabel, s: `${s.character}${s.dominantPhase !== 'dry' && s.dominantPhase !== 'rain' ? ` · ${phaseLabelStep(s.dominantPhase)}` : ''}` },
    { k: 'Schneefallgrenze', v: s.snowLineM != null ? `${Math.round(s.snowLineM).toLocaleString('de-DE')} m` : '—', s: s.snowLineNote },
  ];

  const tile = (
    <section className={`mv-card ed-tile ed-tile--${variant}`} aria-label="Ereignisse" data-origin={nowcast.hasRadar ? 'radar+fusion' : 'fusion'}>
      <div className="mv-head">
        <Eyebrow text={`Ereignisse · ${ED_HORIZON_H} h`} />
        <button type="button" className="mv-expand" onClick={() => setOpen(true)} aria-label="Ereignisse im Detail öffnen" title="Detailansicht"><IconExpand /></button>
      </div>
      {tileItems.length ? (
        <ul className="ed-list ed-list--tile">
          {tileItems.map((e) => <EventRow key={e.id} e={e} nowMs={nowMs} compact />)}
        </ul>
      ) : (
        <div className="ed-empty">{ed.allDry ? `Kein Niederschlag in den nächsten ${ED_HORIZON_H} h.` : 'Keine markanten Ereignisse.'}</div>
      )}
      {more > 0 && <button type="button" className="ed-more" onClick={() => setOpen(true)}>+ {more} weitere im Detail</button>}
    </section>
  );

  const section = (title: string, body: ReactNode) => (
    <div className="ed-section">
      <div className="rr-section-label">{title}</div>
      {body}
    </div>
  );

  return (
    <>
      {tile}
      {open && createPortal(
        <div className="mv-modal" role="dialog" aria-modal="true" aria-label={`Ereignisse · ${place}`} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="mv-modal-panel ed-panel">
            <div className="mv-modal-head">
              <div>
                <Eyebrow text={`Regenradar · ${place}`} />
                <h2 className="mv-modal-title">Ereignisse im Detail</h2>
              </div>
              <div className="mv-modal-tools">
                <div className="mv-seg" role="tablist" aria-label="Zeitraum">
                  {([6, 48] as const).map((r) => (
                    <button key={r} type="button" role="tab" aria-selected={range === r} className={range === r ? 'is-active' : ''} onClick={() => setRange(r)}>{r} h</button>
                  ))}
                </div>
                <button type="button" className="mv-close" onClick={() => setOpen(false)} aria-label="Schließen"><IconClose /></button>
              </div>
            </div>

            <div className="mv-kpis ed-kpis">
              {kpis.map((x) => (
                <div key={x.k} className={`mv-kpi${x.tone ? ` ed-kpi--${x.tone}` : ''}`}>
                  <span className="mv-kpi-k">{x.k}</span>
                  <span className="mv-kpi-v">{x.v}</span>
                  <span className="mv-kpi-s">{x.s}</span>
                </div>
              ))}
            </div>

            <div className="ed-grid">
              <div className="ed-col">
                {section(`Zeitstrahl · ${range} h`, listed.length ? (
                  <div className="ed-days">
                    {groups.map((g) => (
                      <div key={g.day} className="ed-day">
                        <div className="ed-dayhead">{g.day}</div>
                        <ul className="ed-list">{g.items.map((e) => <EventRow key={e.id} e={e} nowMs={nowMs} compact={false} />)}</ul>
                      </div>
                    ))}
                  </div>
                ) : <div className="ed-empty">{ed.allDry ? `Kein Niederschlag in den nächsten ${range} h.` : 'Keine markanten Ereignisse in diesem Zeitraum.'}</div>)}
              </div>
              <div className="ed-col">
                {section('Phasen · 6 h', (
                  <div className="ed-facts">
                    <div className="ed-fact"><span>Dominante Phase</span><b>{phaseLabelStep(s.dominantPhase)}</b></div>
                    <div className="ed-fact"><span>Phasenwechsel</span><b>{s.phaseTransitions.length ? s.phaseTransitions.map((t) => `${t.timestamp ? fmtClock(t.timestamp.getTime()) : `+${t.atMinutes} min`} ${phaseLabelStep(t.from)} → ${phaseLabelStep(t.to)}`).join(' · ') : 'keine'}</b></div>
                    <div className="ed-fact"><span>Starkregen</span><b style={s.heavyRain ? { color: '#C0392B' } : undefined}>{s.heavyRain ? 'Signal aktiv' : 'kein Signal'}</b></div>
                    <div className="ed-fact"><span>Regen jetzt</span><b>{nowcast.currentlyRaining ? 'ja' : 'nein'}{nowcast.dryWindow ? ` · Trockenfenster ab ${fmtClock(nowcast.nowMs + nowcast.dryWindow.fromMin * MIN)} (${nowcast.dryWindow.durationMin} min)` : ''}</b></div>
                    <div className="ed-fact"><span>Radar-Horizont</span><b>{nowcast.hasRadar ? `${nowcast.radarValidMin} min (${ed.series.radar?.product ?? nowcast.radarSource})` : 'kein Radar-Nowcast am Ort'}</b></div>
                    <div className="ed-fact"><span>Jenseits 6 h</span><b>{ed.wetHoursBeyond ? `${ed.wetHoursBeyond} Stunden mit Niederschlag bis +${ED_HORIZON_H} h` : `trocken bis +${ED_HORIZON_H} h`} · {ed.fusionLabel}</b></div>
                  </div>
                ))}
                <div className="ed-alpine"><AlpineCard nowcast={nowcast} /></div>
                {section('Quellen', (
                  <div className="ed-facts">
                    <div className="ed-fact"><span>Radar</span><b>{nowcast.hasRadar ? `${ed.series.radar?.product ?? nowcast.radarSource} · Lauf ${fmtClock(nowcast.runAtMs)}` : '—'}</b></div>
                    <div className="ed-fact"><span>Punktvorhersage</span><b>{nwpLabel(nowcast)} · geladen {fmtClock(nowcast.fetchedAtMs)}</b></div>
                    <div className="ed-fact"><span>Aktualität</span><b style={fresh.stale ? { color: 'var(--terracotta-500, #C97B47)' } : undefined}>{fresh.stale ? `veraltet · ${fresh.label}` : fresh.label}</b></div>
                    <div className="ed-fact"><span>Kette</span><b>{sourceLabel(nowcast)}</b></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mv-modal-foot">
              <span>● Radar-Minuten nur bis zum letzten Radarbild; jenseits davon Stundenmittel und Regenchance von {ed.fusionLabel}. Gewitter- und Hagelrisiko sind Heuristiken ohne CAPE, bewusst konservativ.</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
