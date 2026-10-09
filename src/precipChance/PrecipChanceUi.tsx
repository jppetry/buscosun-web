/**
 * Phase RC — Oberfläche der Regenchance im Regenradar (`audit/regenchance.md`):
 *   · `ChanceThresholdSeg` Schwelle „> 0 · ≥ 1 mm · ≥ 5 mm" unter der Darstellung (Dock und Mobil-Reiter „Layer").
 *   · `ChanceLegend`       Legende unten auf der Karte: Punktdichte-Stufen, Konturen, Lücke, Quelle + Lauf + Stand.
 *   · `PointChanceCard`    Readout (mobil: „Schnellblick"): der Satz zur gewählten Stunde + 48-h-Leiste mit Slider-Marke;
 *                          ein Klick in die Leiste setzt die Kartenzeit (E-RC-1).
 * Command-Deck (Sand/Ink, League Spartan); mobil nur über den Mobil-Breakpoint in `precipChance.css`.
 */
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import {
  CHANCE_BANDS, CHANCE_THRESHOLDS, CHANCE_THRESHOLD_LABEL, bandDotCells, chanceHourAt, chanceSentence, chanceDayWord,
  fmtChancePct, fmtHourSpan, fmtRunUtcShort, thresholdNoun, type ChanceThreshold,
} from './chanceModel';
import { barAt, chanceKindText, type ChanceBar } from './chanceSeries';
import type { ChanceMapInfo } from './chanceMapTypes';
import type { PointChance } from './usePointChance';
import './precipChance.css';

const H = 3_600_000;

// --- Schwelle -------------------------------------------------------------------------------------

export function ChanceThresholdSeg({ value, onChange }: { value: ChanceThreshold; onChange: (t: ChanceThreshold) => void }) {
  return (
    <div className="ns-miniseg rc-thr" role="tablist" aria-label="Schwelle">
      {CHANCE_THRESHOLDS.map((t) => (
        <button key={t} type="button" role="tab" aria-selected={value === t} className={value === t ? 'is-active' : ''} onClick={() => onChange(t)}
          title={t === 'any' ? 'Niederschlag ja/nein in der Stunde' : `Mindestens ${CHANCE_THRESHOLD_LABEL[t].replace('≥ ', '')} in der Stunde`}>{CHANCE_THRESHOLD_LABEL[t]}</button>
      ))}
    </div>
  );
}

// --- Punktdichte-Muster (dasselbe Raster wie die Karte) -------------------------------------------------

/** Kleines Feld mit den Punkten bis einschließlich Band k (k = −1: leer). */
function DotSwatch({ k }: { k: number }) {
  const cells: number[] = [];
  for (let j = 0; j <= k; j++) cells.push(...bandDotCells(j));
  return (
    <svg className="rc-swatch" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="0" y="0" width="16" height="16" className="rc-swatch-bg" />
      {cells.map((c) => <circle key={c} cx={(c % 8) * 2 + 1} cy={Math.floor(c / 8) * 2 + 1} r={0.55} className="rc-swatch-dot" />)}
    </svg>
  );
}

// --- Legende --------------------------------------------------------------------------------------

export function ChanceLegend({ info, threshold, nowMs }: { info: ChanceMapInfo; threshold: ChanceThreshold; nowMs: number }) {
  const ready = info.status === 'ready' && info.threshold === threshold;
  const span = info.stepFromMs != null && info.stepToMs != null ? Math.round((info.stepToMs - info.stepFromMs) / H) : 1;
  const when = info.hourToMs > 0 ? `${chanceDayWord(info.hourFromMs, nowMs)} ${fmtHourSpan(info.hourFromMs, info.hourToMs)}` : '';
  const title = `${thresholdNoun(threshold)} · ${when}`;
  const lines: ReactNode[] = [];
  if (info.status === 'error') lines.push(<span key="e">⚠ {info.error}</span>);
  else if (!ready) lines.push(<span key="l">wird berechnet …</span>);
  else {
    if (info.field) {
      lines.push(<span key="src">{info.field.fusionName ?? 'buscosun Fusion'} · Modell · Cube · {fmtRunUtcShort(info.field.runAtMs)}</span>);
      lines.push(<span key="lbl" className="ns-legend-note">Kartenfeld ohne Station, Radar und Gelände am Ort — am Ort rechnet die volle buscosun Fusion</span>);
    }
    if (span > 1 && info.stepFromMs != null && info.stepToMs != null) lines.push(<span key="iv" className="ns-legend-note">Wert gilt für {fmtHourSpan(info.stepFromMs, info.stepToMs)} ({span}-h-Intervall der Stufe {info.field?.tier})</span>);
    if (info.past) lines.push(<span key="past" className="ns-legend-note">Slider im Rückblick — gezeigt ist die laufende Stunde; was fiel, zeigt „Intensität"</span>);
    for (const n of info.notes) lines.push(<span key={n} className="ns-legend-note">{n}</span>);
  }
  const tip = info.definition ? `${info.definition.measured}\n${info.definition.caveat}` : undefined;
  return (
    <div className="ns-legend rc-legend" role="note" aria-label={`Legende Niederschlags-Chance, ${title}`} title={tip}>
      <div className="ns-legend-head"><b>Chance</b> · {title}</div>
      <div className="rc-legend-scale">
        <span className="rc-legend-step"><DotSwatch k={-1} />&lt; 10</span>
        {CHANCE_BANDS.map((b, k) => <span key={b} className="rc-legend-step"><DotSwatch k={k} />{Math.round(b * 100)}</span>)}
        <span className="ns-legend-unit">%</span>
      </div>
      <div className="ns-legend-keys">
        <span className="ns-legend-key"><i className="rc-key-line" /> Kontur 30 · 50 · 70 · 90 %</span>
        <span className="ns-legend-key"><i className="ns-hatch" /> keine Daten</span>
      </div>
      <div className="ns-legend-src">{lines}</div>
    </div>
  );
}

// --- Karte am Ort -----------------------------------------------------------------------------------

const W = 300, BAR_H = 46, TOP = 4;

function Strip({ pc, threshold, sliderMs, pickMs, onPick, nowMs }: {
  pc: PointChance; threshold: ChanceThreshold; sliderMs: number | null; pickMs: number | null; onPick: (ms: number | null) => void; nowMs: number;
}) {
  const span = pc.toMs - pc.fromMs;
  const x = (t: number) => ((t - pc.fromMs) / span) * W;
  const y = (p: number) => TOP + (BAR_H - TOP) * (1 - p);
  const shown = chanceHourAt(pickMs ?? sliderMs ?? nowMs, nowMs);
  // Tagesgrenzen (Mitternacht Europe/Berlin) für die Beschriftung
  const days: Array<{ t: number; label: string }> = [];
  for (let t = pc.fromMs + H; t < pc.toMs; t += H) {
    const hh = Number(new Date(t).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false })) % 24;
    if (hh === 0) days.push({ t, label: new Date(t).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short' }) });
  }
  const pickAtX = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const t = pc.fromMs + Math.max(0, Math.min(0.9999, (clientX - r.left) / r.width)) * span;
    onPick(Math.floor(t / H) * H + H / 2);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = shown.fromMs + (e.key === 'ArrowRight' ? H : -H);
    if (next >= pc.fromMs && next < pc.toMs) onPick(next + H / 2);
  };
  const sliderX = sliderMs != null && sliderMs >= pc.fromMs && sliderMs <= pc.toMs ? x(Math.max(sliderMs, pc.fromMs)) : null;
  return (
    <svg className="rc-strip" viewBox={`0 0 ${W} ${BAR_H + 14}`} role="slider" tabIndex={0}
      aria-label={`Stündliche Chance, nächste 48 Stunden — gewählt ${fmtHourSpan(shown.fromMs, shown.toMs)}`}
      aria-valuemin={0} aria-valuemax={47} aria-valuenow={Math.round((shown.fromMs - pc.fromMs) / H)} aria-valuetext={fmtHourSpan(shown.fromMs, shown.toMs)}
      onClick={(e: MouseEvent<SVGSVGElement>) => pickAtX(e.clientX, e.currentTarget)} onKeyDown={onKey}>
      <defs>
        <pattern id="rc-strip-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="rgba(120,112,98,0.10)" />
          <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(120,112,98,0.55)" strokeWidth="1.2" />
        </pattern>
      </defs>
      {[0.5].map((g) => <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} className="rc-strip-grid" />)}
      <line x1={0} x2={W} y1={BAR_H - 0.5} y2={BAR_H - 0.5} className="rc-strip-base" />
      {pc.bars.map((b: ChanceBar, i) => {
        const x0 = x(b.fromMs) + 0.4, w = Math.max(0.8, x(b.toMs) - x(b.fromMs) - 0.8);
        if (!b.p) return <rect key={i} x={x0} y={TOP} width={w} height={BAR_H - TOP - 0.5} fill="url(#rc-strip-hatch)" className="rc-strip-gap"><title>{`${fmtHourSpan(b.fromMs, b.toMs)}: keine Vorhersage (Lücke)`}</title></rect>;
        const p = b.p[threshold];
        const sel = shown.fromMs >= b.fromMs && shown.fromMs < b.toMs;
        const cls = `rc-strip-bar is-${b.kind}${(b.stepToMs - b.stepFromMs) > H ? ' is-wide' : ''}${sel ? ' is-sel' : ''}`;
        return (
          <rect key={i} x={x0} y={y(p)} width={w} height={Math.max(0.6, BAR_H - 0.5 - y(p))} className={cls}>
            <title>{`${chanceDayWord(b.stepFromMs, nowMs)} ${fmtHourSpan(b.stepFromMs, b.stepToMs)}: ${fmtChancePct(p)}${chanceKindText(b) ? ` · ${chanceKindText(b)}` : ''}`}</title>
          </rect>
        );
      })}
      <rect x={x(shown.fromMs)} y={1} width={Math.max(1, x(shown.toMs) - x(shown.fromMs))} height={BAR_H - 1} className="rc-strip-shown" />
      {days.map((d) => (
        <g key={d.t}>
          <line x1={x(d.t)} x2={x(d.t)} y1={TOP} y2={BAR_H} className="rc-strip-day" />
          <text x={x(d.t) + 2} y={BAR_H + 11} className="rc-strip-lbl">{d.label}</text>
        </g>
      ))}
      {sliderX != null && <line x1={sliderX} x2={sliderX} y1={0} y2={BAR_H} className="rc-strip-slider" />}
      <text x={1} y={BAR_H + 11} className="rc-strip-lbl rc-strip-lbl--now">jetzt</text>
      <text x={W - 1} y={BAR_H + 11} textAnchor="end" className="rc-strip-lbl">+48 h</text>
    </svg>
  );
}

export function PointChanceCard({ pc, threshold, sliderMs, pickMs, onPick, nowMs }: {
  pc: PointChance; threshold: ChanceThreshold; sliderMs: number | null; pickMs: number | null; onPick: (ms: number | null) => void; nowMs: number;
}) {
  const hour = chanceHourAt(pickMs ?? sliderMs ?? nowMs, nowMs);
  const bar = barAt(pc.bars, hour.fromMs);
  let line: ReactNode, sub: ReactNode;
  if (pc.status === 'loading') { line = 'buscosun Fusion rechnet …'; sub = null; }
  else if (bar?.p) {
    line = chanceSentence(threshold, bar.p[threshold], bar.stepFromMs, bar.stepToMs, nowMs);
    const how = chanceKindText(bar);
    sub = <><b>{pc.fusionName}</b>{how ? <> · {how}</> : null}</>;
  } else {
    line = `${thresholdNoun(threshold)} ${chanceDayWord(hour.fromMs, nowMs)} ${fmtHourSpan(hour.fromMs, hour.toMs)}: keine Vorhersage`;
    sub = <>Lücke{pc.reason ? <> · {pc.reason}</> : null}</>;
  }
  return (
    <div className="rt-card rc-card" aria-label="Niederschlags-Chance am Ort">
      <p className="rc-card-line">{line}</p>
      {sub && <div className="rc-card-sub">{sub}{hour.past && !pickMs ? <><br />Slider im Rückblick — gezeigt ist die laufende Stunde</> : null}</div>}
      {pc.bars.length > 0 && <Strip pc={pc} threshold={threshold} sliderMs={sliderMs} pickMs={pickMs} onPick={onPick} nowMs={nowMs} />}
      <div className="rc-card-foot">
        <span>Balken = Chance je Stunde (breit = 3-h-Wert) · <i className="rc-foot-mark" /> Slider</span>
        {pickMs != null && <button type="button" className="rc-card-reset" onClick={() => onPick(null)}>Karte folgt wieder dem Slider</button>}
      </div>
      {pc.status === 'ready' && pc.reason && <div className="rc-card-note">{pc.reason}</div>}
    </div>
  );
}
