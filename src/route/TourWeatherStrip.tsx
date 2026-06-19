/**
 * Wetter entlang der Route — Karten-Reihe im Stil der Confidence-Tageskarten:
 * pro (ausgedünntem) Streckenpunkt eine Karte mit km/Uhrzeit, Wetter-Icon, großer
 * Temperatur + kleiner gefühlter Temperatur, einem Verlässlichkeits-Ring (Haken/≈
 * + Prozent), Stufen-Label und einem Status-Pill (Lage / Regen / Föhn / Warnung).
 * Höherer Informationsgehalt als das frühere km/Temp/Zeit-Raster, klar lesbar.
 */

import { useMemo } from 'react';
import type { SampleETA } from './tourTiming';
import { WeatherIcon, pickWeatherCondition, describeCondition } from '../components/WeatherIcon';
import { IconCheck, IconApprox, IconWarning } from './routeIcons';

type TierMark = 'check' | 'approx' | 'warn';
function TierGlyph({ mark, size = 13 }: { mark: TierMark; size?: number }) {
  if (mark === 'check') return <IconCheck size={size} />;
  if (mark === 'approx') return <IconApprox size={size} />;
  return <IconWarning size={size} />;
}

interface Props {
  samples: SampleETA[];
  /** Optionaler Klick auf eine Karte (km-Distanz) — koppelt mit dem Scrubber. */
  onPick?: (distM: number) => void;
  /** Aktuell im Scrubber gewählte Distanz (m) — hebt die nächste Karte hervor. */
  selectedDistM?: number | null;
}

const MAX_CARDS = 12;

interface Card {
  key: number; distM: number;
  km: string; time: string; tempMax: string; tempMin: string | null;
  condition: ReturnType<typeof pickWeatherCondition>;
  pct: number; tier: ReturnType<typeof confTier>;
  pill: string; pillKind: 'calm' | 'precip' | 'foehn' | 'warn'; radar: boolean;
}

/** Kleiner konzentrischer Radar-Punkt für das Niederschlags-Pill (Quelle: Radar). */
function RadarDot() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="6" cy="6" r="4.6" /><circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function TourWeatherStrip({ samples, onPick, selectedDistM }: Props) {
  const cards = useMemo(() => buildCards(samples), [samples]);
  if (!cards || cards.length < 2) return null;

  // Nächste Karte zur Scrubber-Position hervorheben.
  let selKey: number | null = null;
  if (selectedDistM != null) {
    let bestD = Infinity;
    for (const c of cards) { const d = Math.abs(c.distM - selectedDistM); if (d < bestD) { bestD = d; selKey = c.key; } }
  }

  return (
    <>
      <div className="rt-card rt-rwx" role="group" aria-label="Wetter entlang der Tour">
        <div className="rt-rwx-cards" role="list">
          {cards.map((c) => (
            <button
              key={c.key}
              type="button"
              role="listitem"
              className={`rt-rwx-card${c.key === selKey ? ' is-selected' : ''}`}
              onClick={onPick ? () => onPick(c.distM) : undefined}
            >
              <div className="rt-rwx-card-head">
                <span className="rt-rwx-card-km">{c.km}</span>
                <span className="rt-rwx-card-time">{c.time}</span>
              </div>
              <WeatherIcon condition={c.condition} size={34} />
              <div className="rt-rwx-card-temps">
                <span className="rt-rwx-card-tmax">{c.tempMax}</span>
                {c.tempMin && <span className="rt-rwx-card-tmin">{c.tempMin}</span>}
              </div>
              <div className="rt-rwx-card-conf">
                <ConfidenceRing score={c.pct / 100} color={c.tier.ring} mark={c.tier.mark} />
                <span className="rt-rwx-card-pct" style={{ color: c.tier.text }}>{c.pct} %</span>
              </div>
              <span className="rt-rwx-card-level" style={{ color: c.tier.text }}><TierGlyph mark={c.tier.mark} size={12} /> {c.tier.label}</span>
              <span className={`rt-rwx-pill is-${c.pillKind}`}>{c.radar && c.pillKind === 'precip' && <RadarDot />}{c.pill}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="rt-rwx-cap">
        <span className="rt-rwx-cap-ring" /> Ring = Verlässlichkeit der Vorhersage (<IconCheck size={12} /> hoch · <IconApprox size={12} /> mittel) · gefühlte Temperatur klein · Pill = Lage/Regen/Föhn/Warnung an dem Punkt.
      </p>
    </>
  );
}

/** Verlässlichkeits-Ring: voller Hintergrundkreis + Bogen proportional zum Score, mittig die Tier-Marke. */
function ConfidenceRing({ score, color, mark }: { score: number; color: string; mark: TierMark }) {
  const r = 13, c = 2 * Math.PI * r;
  const dash = Math.max(0.02, score) * c;
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" className="rt-rwx-ring" aria-hidden="true">
      <circle cx="17" cy="17" r={r} fill="none" stroke={color} strokeWidth="4" opacity="0.2" />
      <circle cx="17" cy="17" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`} transform="rotate(-90 17 17)" />
      <g fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {mark === 'check' && <path d="M12.5 17.4l2.8 2.8L21.5 13.4" />}
        {mark === 'approx' && <><path d="M11.5 15.6c1-1.3 2-1.3 3 0s2 1.3 3 0" strokeWidth="1.8" /><path d="M11.5 19c1-1.3 2-1.3 3 0s2 1.3 3 0" strokeWidth="1.8" /></>}
        {mark === 'warn' && <><path d="M17 12.6v3.6" /><path d="M17 19.4v.01" /></>}
      </g>
    </svg>
  );
}

function confTier(pct: number): { ring: string; text: string; mark: TierMark; label: string } {
  if (pct >= 66) return { ring: '#7A9466', text: '#3F5E2F', mark: 'check', label: 'Hohe' };
  if (pct >= 40) return { ring: '#D4A373', text: '#A85E2E', mark: 'approx', label: 'Mittlere' };
  return { ring: '#C97B47', text: '#A85E2E', mark: 'warn', label: 'Geringe' };
}

function buildCards(samples: SampleETA[]): Card[] | null {
  const withW = samples.filter((s) => s.weather != null).sort((a, b) => a.dist - b.dist);
  if (withW.length < 2) return null;

  // Gleichmäßig auf ~MAX_CARDS Punkte ausdünnen (Start/Ende immer dabei).
  const n = withW.length;
  const count = Math.min(n, MAX_CARDS);
  const idxs = count >= n
    ? withW.map((_, i) => i)
    : [...new Set(Array.from({ length: count }, (_, k) => Math.round((k * (n - 1)) / (count - 1))))];

  return idxs.map((i) => {
    const s = withW[i];
    const w = s.weather!;
    const cloud = w.cloudCoverPct ?? 0;
    const precip = w.precipitationMmH ?? 0;
    const ts = new Date(s.etaMs);
    const pct = Math.round((w.confidence?.temperature ?? 0.6) * 100);
    const warn = w.warnings.length > 0;
    const foehn = w.foehn?.isFoehn ?? false;
    const radar = w.precipitationSource === 'radar' && precip > 0.1;

    let pill: string; let pillKind: Card['pillKind'];
    if (warn) { pill = shortenEvent(w.warnings[0]?.event); pillKind = 'warn'; }
    else if (foehn) { pill = 'Föhn'; pillKind = 'foehn'; }
    else if (precip > 0.1) { pill = `${precip.toFixed(precip >= 1 ? 0 : 1).replace('.', ',')} mm`; pillKind = 'precip'; }
    else { pill = describeCondition(cloud, precip); pillKind = 'calm'; }

    return {
      key: s.index, distM: s.dist,
      km: `${(s.dist / 1000).toFixed(s.dist >= 10_000 ? 0 : 1).replace('.', ',')} km`,
      time: ts.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      tempMax: w.temperatureC != null ? `${Math.round(w.temperatureC)}°` : '—',
      tempMin: w.apparentTempC != null ? `${Math.round(w.apparentTempC)}°` : null,
      condition: pickWeatherCondition(cloud, precip, ts),
      pct, tier: confTier(pct),
      pill, pillKind, radar,
    };
  });
}

function shortenEvent(ev?: string): string {
  if (!ev) return 'Warnung';
  return ev.length > 12 ? `${ev.slice(0, 11)}…` : ev;
}
