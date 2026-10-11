/** GL-1 — small shared parts: the origin chip that stands at EVERY value (plan §6 "Herkunft"), a locked-state note. */
import type { ReactNode } from 'react';
import { GLACIER_ORIGIN_LABEL, type GlacierOrigin } from './glacierContract';

/** "gemessen" / "Satellit" / "Modell" / "amtlich" — colour per origin (README-gletscher.md tokens, `glacierDeck.css`). */
export function OriginChip({ origin, label, title }: { origin: GlacierOrigin; label?: string; title?: string }) {
  return (
    <span className={`gl-chip is-${origin}`} data-origin={origin} title={title ?? `Herkunft: ${GLACIER_ORIGIN_LABEL[origin]}`}>
      <i aria-hidden="true" />{label ?? GLACIER_ORIGIN_LABEL[origin]}
    </span>
  );
}

/** A value with its origin chip — every number of the page goes through this or sets `data-origin` itself. */
export function Valued({ origin, children, big }: { origin: GlacierOrigin; children: ReactNode; big?: boolean }) {
  return <span className={`gl-valued${big ? ' is-big' : ''}`}><span className="gl-num" data-origin={origin}>{children}</span><OriginChip origin={origin} /></span>;
}

export function LockNote({ children }: { children: ReactNode }) {
  return <span className="gl-lock" role="note"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>{children}</span>;
}
