/**
 * Preview card on the map for a coast spot picked by a map click (bottom left, like the fire and motorway cards):
 * badge, name, the verdict for the profile, wind / gusts / wave at the chosen hour, the next window, the official
 * status in one line and the way into the detail view. The values are the ones of the briefing (same helpers).
 */
import { useEffect } from 'react';

export interface SeaMapCardProps {
  badge: string;
  name: string;
  sub: string;
  /** Verdict label and colour (`null` colour = no data, hatched). */
  verdict: string;
  color: string | null;
  stats: ReadonlyArray<{ l: string; v: string; s?: string }>;
  /** Why it does not fit (first reason), the next window, the official line. */
  reason: string | null;
  window: string | null;
  official: { text: string; warn: boolean } | null;
  onOpenDossier: () => void;
  onClose: () => void;
}

export default function SeaMapCard(p: SeaMapCardProps) {
  // Escape closes the card, like a popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.onClose]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="sw-mapcard" role="dialog" aria-label={`Spot ${p.name}`} style={{ ['--sw-mapcard-acc' as string]: p.color ?? '#8B8474' }}>
      <header className="sw-mapcard-head">
        <span className="sw-mapcard-titles">
          <span className="sw-mapcard-eyebrow"><span className="sw-badge">{p.badge}</span>Spot</span>
          <span className="sw-mapcard-name">{p.name}</span>
          <span className="sw-mapcard-sub">{p.sub}</span>
        </span>
        <button type="button" className="sw-mapcard-close" aria-label="Kachel schließen" onClick={p.onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </header>
      <span className={`sw-mapcard-verdict${p.color ? '' : ' is-none'}`}><i style={p.color ? { background: p.color } : undefined} />{p.verdict}</span>
      <div className="sw-mapcard-stats">
        {p.stats.map((s) => (
          <span key={s.l} className="sw-mapcard-stat"><em>{s.l}</em><b>{s.v}</b>{s.s && <small>{s.s}</small>}</span>
        ))}
      </div>
      {p.reason && <p className="sw-mapcard-line">{p.reason}</p>}
      {p.window && <p className="sw-mapcard-line is-win">{p.window}</p>}
      {p.official && <p className={`sw-mapcard-line is-official${p.official.warn ? ' is-warn' : ''}`}>{p.official.text}</p>}
      <button type="button" className="sw-mapcard-cta" onClick={p.onOpenDossier}>
        Detailansicht öffnen
        <span className="sw-mapcard-cta-arrow" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>
    </section>
  );
}
