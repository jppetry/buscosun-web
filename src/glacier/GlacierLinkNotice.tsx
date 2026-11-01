/**
 * Gletscher · Hinweis zu einem Link, der KEINEN Gletscher benennt (`/gletscher/<unsinn>`, `?sel=<unsinn>`).
 *
 * Der Wrapper (`GlacierRoute`) räumt die URL beim Ankommen auf; ohne diesen Hinweis wäre der Sprung auf die
 * DACH-Lage stumm. Ein WOHLGEFORMTER Slug, den der Atlas nicht kennt, ist ein anderer Fall und steht in `GlacierPage`
 * („Diesen Gletscher gibt es im Atlas nicht"). Bauweise wie `StaleLinkNotice` (Portal, Klassen `sh-stale*`).
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import '../share/share.css';

const NOTICE_MS = 15_000;

export default function GlacierLinkNotice({ show }: { show: boolean }) {
  // `show` is fixed by the route's first parse; the state only closes the notice
  const [open, setOpen] = useState(show);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setOpen(false), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [open]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="sh-stale" role="status" aria-live="polite" data-glacier-link-notice="invalid">
      <span className="sh-stale-txt"><strong>Dieser Link benennt keinen Gletscher.</strong> Angezeigt wird die DACH-Lage.</span>
      <button type="button" className="sh-stale-x" onClick={() => setOpen(false)} aria-label="Hinweis schließen">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
