/**
 * Seewetter · Hinweise zu einem geteilten Spot-Link (`seaLink.ts`).
 *  · `invalid`  — der Pfad benennt keinen Spot (unlesbarer Slug); die Route räumt die URL auf und sagt, warum;
 *  · `unknown`  — der Slug ist wohlgeformt, der Katalog kennt den Spot aber nicht (mehr); die Seite zeigt den Standard-Spot.
 * Bauweise wie `StaleLinkNotice` (Portal, Klassen `sh-stale*`). Der Zustand eines Spots ist immer der AKTUELLE.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../share/share.css';

const NOTICE_MS = 20_000;

export default function SeaLinkNotice({ kind, slug, onClose }: { kind: 'invalid' | 'unknown'; slug?: string; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, NOTICE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (typeof document === 'undefined') return null;
  const head = kind === 'invalid' ? 'Dieser Link benennt keinen Spot.' : `Den Spot „${slug ?? ''}" kennt der Atlas nicht (mehr).`;
  const rest = kind === 'invalid' ? ' Angezeigt wird der Standard-Spot.' : ' Angezeigt wird der Standard-Spot; die Spot-Liste nennt alle.';
  return createPortal(
    <div className="sh-stale" role="status" aria-live="polite" data-sea-link-notice={kind}>
      <span className="sh-stale-txt"><strong>{head}</strong>{rest}</span>
      <button type="button" className="sh-stale-x" onClick={onClose} aria-label="Hinweis schließen">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
