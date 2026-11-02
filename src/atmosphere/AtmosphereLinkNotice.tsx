/**
 * Vertikalschnitt · Hinweis zu einem Link, von dem Teile unbrauchbar waren.
 *
 * Bis jetzt räumte die Route solche Links stumm auf: ein unbekannter Ort oder eine unlesbare Schnittlinie führte auf die
 * Startseite des Querschnitts, ohne dass irgendwo stand, warum. Der Hinweis benennt, was fehlte — einmal, mit Kreuz.
 * Bauweise wie `StaleLinkNotice` (Portal, Klassen `sh-stale*`). Der Zustand einer Schnittlinie ist immer der AKTUELLE.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import '../share/share.css';

const NOTICE_MS = 20_000;

export type AtmosphereLinkProblem = 'ort' | 'schnitt' | 'marker' | 'sonst';

const TEXT: Record<AtmosphereLinkProblem, string> = {
  ort: 'Der Ort im Link ist unbekannt.',
  schnitt: 'Die Schnittlinie im Link ist unlesbar (nötig sind mindestens zwei Punkte als „Breite,Länge").',
  marker: 'Der Marker im Link ist unlesbar.',
  sonst: 'Ein Teil des Links war unlesbar.',
};

export default function AtmosphereLinkNotice({ problems }: { problems: readonly AtmosphereLinkProblem[] }) {
  const [open, setOpen] = useState(problems.length > 0);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setOpen(false), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [open]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="sh-stale" role="status" aria-live="polite" data-atmosphere-link-notice={problems.join(',')}>
      <span className="sh-stale-txt"><strong>{problems.map((p) => TEXT[p]).join(' ')}</strong> Angezeigt wird, was sich daraus lesen ließ.</span>
      <button type="button" className="sh-stale-x" onClick={() => setOpen(false)} aria-label="Hinweis schließen">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
