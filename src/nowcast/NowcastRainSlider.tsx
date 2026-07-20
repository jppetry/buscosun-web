/**
 * Regenslider (Mobile RM4) — touch-freundliche 0–6-h-Intensitäts-Timeline.
 *
 * Reimplementiert die Aussage der `NowcastTimeline` als große, mit dem Daumen
 * bedienbare Zeitleiste: Play-Karte (Abspiel-Cursor über die 6 h), Balken je
 * 30-Min-Fenster (Intensität; blass = Modell; Trockenfenster tan; Spitze
 * violett), Skill-Horizont-Marker, ziehbarer Cursor + Live-Readout an der
 * Abspielposition (Intensität · Rate · Quelle · Art). Speist sich ausschließlich
 * aus `nowcast.steps` — keine erfundenen Werte, kein Funktionsverlust.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NOWCAST_HORIZON_MIN, SKILL_HORIZON_MIN, WET_MMH,
  intensityBand, intensityLabel, phaseLabelStep,
  type Nowcast, type NowcastStep,
} from './nowcastModel';
import { fmtClock, fmtMmH } from './nowcastView';

const BUCKET_MIN = 30;
const NB = Math.round(NOWCAST_HORIZON_MIN / BUCKET_MIN); // 12
/** Play: ganze 6 h in ~18 s abgespielt (ruhiger Scrub). */
const PLAY_MS_PER_MIN = 18_000 / NOWCAST_HORIZON_MIN;

interface Bucket { center: number; peak: number; model: boolean; dry: boolean }

function buildBuckets(steps: NowcastStep[]): Bucket[] {
  const out: Bucket[] = [];
  for (let i = 0; i < NB; i++) {
    const from = i * BUCKET_MIN, to = from + BUCKET_MIN, center = from + BUCKET_MIN / 2;
    const inb = steps.filter((s) => s.minutes >= from && s.minutes < to);
    const peak = inb.reduce((m, s) => Math.max(m, s.mmH), 0);
    const modelVotes = inb.filter((s) => s.source !== 'radar').length;
    out.push({ center, peak, model: inb.length > 0 ? modelVotes > inb.length / 2 : center >= SKILL_HORIZON_MIN, dry: peak < WET_MMH });
  }
  return out;
}

/** Balkenhöhe in % — Wurzel-Skala (wie Timeline/Bar-Chart) für lesbare kleine Raten. */
function barPct(peak: number, cap: number): number {
  if (peak < WET_MMH) return 7;
  return 10 + 88 * (Math.sqrt(Math.min(peak, cap)) / Math.sqrt(cap));
}

const X_LABELS: Array<{ min: number; label: string }> = [
  { min: 0, label: 'JETZT' }, { min: 60, label: '+1h' }, { min: 120, label: '+2h' },
  { min: 180, label: '+3h' }, { min: 240, label: '+4h' }, { min: 360, label: '+6h' },
];

function offsetLabel(min: number): string {
  if (min <= 0) return 'JETZT';
  if (min < 60) return `+${min} Min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `+${h} Std` : `+${h} Std ${m}`;
}

export default function NowcastRainSlider({ nowcast }: { nowcast: Nowcast }) {
  const steps = nowcast.steps;
  const buckets = buildBuckets(steps);
  const cap = Math.max(3, ...buckets.map((b) => b.peak));
  const maxPeak = Math.max(...buckets.map((b) => b.peak));
  const spikeIdx = maxPeak >= WET_MMH ? buckets.findIndex((b) => b.peak === maxPeak) : -1;

  const [cursorMin, setCursorMin] = useState(0);
  const [playing, setPlaying] = useState(false);
  const plotRef = useRef<HTMLDivElement | null>(null);

  // Abspiel-Schleife (rAF) — Cursor 0 → 360, stoppt am Ende.
  useEffect(() => {
    if (!playing) return;
    let raf = 0, prev = performance.now();
    const tick = (t: number) => {
      const dt = t - prev; prev = t;
      setCursorMin((m) => {
        const n = m + dt / PLAY_MS_PER_MIN;
        if (n >= NOWCAST_HORIZON_MIN) { setPlaying(false); return NOWCAST_HORIZON_MIN; }
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const setFromClientX = useCallback((clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setCursorMin(pct * NOWCAST_HORIZON_MIN);
  }, []);

  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setPlaying(false);
    setFromClientX(e.clientX);
    const onMove = (ev: PointerEvent) => setFromClientX(ev.clientX);
    const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [setFromClientX]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { setPlaying(false); setCursorMin((m) => Math.min(NOWCAST_HORIZON_MIN, m + 15)); }
    if (e.key === 'ArrowLeft') { setPlaying(false); setCursorMin((m) => Math.max(0, m - 15)); }
  };

  // Live-Readout: Schritt am Cursor.
  const at = steps.reduce((best, s) => (Math.abs(s.minutes - cursorMin) < Math.abs(best.minutes - cursorMin) ? s : best), steps[0]);
  const wet = at.mmH >= WET_MMH;
  const cursorClock = fmtClock(nowcast.nowMs + Math.round(cursorMin) * 60_000);
  const cursorPct = (cursorMin / NOWCAST_HORIZON_MIN) * 100;
  const skillPct = (SKILL_HORIZON_MIN / NOWCAST_HORIZON_MIN) * 100;
  const source = at.source === 'nwp' ? 'Modell' : at.source === 'blend' ? 'Radar → Modell' : 'Radar';

  return (
    <div className="rm-slider">
      {/* Play-Karte */}
      <div className="rm-card rm-playcard">
        <button type="button" className="rm-play" onClick={() => { setCursorMin((m) => (m >= NOWCAST_HORIZON_MIN ? 0 : m)); setPlaying((p) => !p); }}
          aria-label={playing ? 'Abspielen pausieren' : 'Regenverlauf abspielen'} aria-pressed={playing}>
          {playing
            ? <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            : <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5 L19 12 L7 19 Z" /></svg>}
        </button>
        <div className="rm-playcard-mid">
          <span className="rm-playcard-label">Abgespielte Zeit</span>
          <span className="rm-playcard-big">{offsetLabel(Math.round(cursorMin))} · {cursorClock}</span>
        </div>
        <div className="rm-playcard-run">
          <span className="rm-playcard-label">Lauf</span>
          <span className="rm-playcard-runval">{fmtClock(nowcast.runAtMs || nowcast.fetchedAtMs)}</span>
        </div>
      </div>

      {/* Balken-Timeline */}
      <div className="rm-card rm-tlcard">
        <div className="rm-tl-labels">
          {X_LABELS.map((l) => (
            <span key={l.min} className={`rm-tl-xlabel${l.min === 0 ? ' is-now' : ''}`} style={{ left: `${(l.min / NOWCAST_HORIZON_MIN) * 100}%` }}>{l.label}</span>
          ))}
        </div>
        <div className="rm-tl-plot" ref={plotRef} onPointerDown={startDrag}>
          <span className="rm-tl-skillpill" style={{ left: `${skillPct}%` }}>Skill-Horizont +{Math.round(SKILL_HORIZON_MIN / 60)}h</span>
          <span className="rm-tl-skillline" style={{ left: `${skillPct}%` }} aria-hidden="true" />
          <div className="rm-tl-bars" role="img" aria-label={`Regenintensität über 6 Stunden; Spitze ${fmtMmH(maxPeak)}`}>
            {buckets.map((b, i) => {
              const cls = b.dry ? 'is-dry' : i === spikeIdx ? 'is-spike' : b.model ? 'is-model' : 'is-radar';
              return <span key={i} className={`rm-tl-bar ${cls}`} style={{ height: `${barPct(b.peak, cap)}%`, background: b.dry ? undefined : i === spikeIdx ? undefined : b.model ? undefined : intensityColor(intensityBand(b.peak)) }} />;
            })}
          </div>
          <span className="rm-tl-baseline" aria-hidden="true" />
          <button type="button" className="rm-tl-cursor" role="slider" tabIndex={0}
            aria-label="Abspielposition" aria-valuemin={0} aria-valuemax={NOWCAST_HORIZON_MIN} aria-valuenow={Math.round(cursorMin)}
            aria-valuetext={`${offsetLabel(Math.round(cursorMin))}, ${cursorClock}`}
            style={{ left: `${cursorPct}%` }} onPointerDown={startDrag} onKeyDown={onKey}>
            <span className="rm-tl-cursor-dot" />
          </button>
        </div>
        <div className="rm-tl-legend">
          <span className="rm-tl-lg"><i className="rm-lg-grad" /> Intensität <em>leicht…stark</em></span>
          <span className="rm-tl-lg"><i className="rm-lg-model" /> blass = Modell</span>
          <span className="rm-tl-lg"><i className="rm-lg-dry" /> Trockenfenster</span>
        </div>
      </div>

      {/* Live-Readout an der Abspielposition */}
      <div className="rm-card rm-readoutpos">
        <div className="rm-readoutpos-head">An der Abspielposition · {cursorClock}</div>
        <div className="rm-readoutpos-grid">
          <div><span className="rm-rp-label">Intensität</span><span className="rm-rp-val rm-rp-accent">{wet ? intensityLabel(intensityBand(at.mmH)) : 'trocken'}</span></div>
          <div><span className="rm-rp-label">Rate</span><span className="rm-rp-val">{fmtMmH(at.mmH)}</span></div>
          <div><span className="rm-rp-label">Quelle</span><span className="rm-rp-val">{source}</span></div>
          <div><span className="rm-rp-label">Art</span><span className="rm-rp-val">{wet ? phaseLabelStep(at.phase === 'dry' ? 'rain' : at.phase) : 'trocken'}</span></div>
        </div>
      </div>

      {/* Ehrlichkeits-Hinweis */}
      <div className="rm-honesty">
        <FlagIcon />
        <span>Jenseits des Skill-Horizonts (~{Math.round(SKILL_HORIZON_MIN / 60)} h) blendet Radar gleitend aufs Modell über — keine minutengenauen Start-/Stoppzeiten.</span>
      </div>
    </div>
  );
}

function intensityColor(b: ReturnType<typeof intensityBand>): string {
  // Blau-Skala aus dem Modell (Radar-Balken). Spitze/Modell/Trocken via CSS-Klassen.
  switch (b) {
    case 'light': return 'var(--nc-int-light)';
    case 'moderate': return 'var(--nc-int-moderate)';
    case 'strong': return 'var(--nc-int-strong)';
    case 'severe': return 'var(--nc-int-strong)';
    default: return 'var(--nc-dry)';
  }
}

function FlagIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 1 }}>
      <path d="M6 3 V21" stroke="var(--terracotta-500)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 4 H17 L14.5 7.5 L17 11 H6 Z" fill="var(--terracotta-500)" fillOpacity=".18" stroke="var(--terracotta-500)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
