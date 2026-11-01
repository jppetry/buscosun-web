/**
 * Brandradar · Hinweis zu einem geteilten Brand-Link (`fireLink.ts`).
 *
 * Erscheint nur, wenn der Link NICHT zu einem Brand geführt hat:
 *  · `gone` / `gone-effis` — die Kennung ist gültig, der Brand steht aber weder im Live-Fenster (7 Tage)
 *    noch in der Saison-Historie. Der Hinweis nennt Ort und Zeit der ersten Detektion (Werte aus dem
 *    Link selbst) und sagt ausdrücklich, dass das NICHT „erloschen" heißt — die Quelle meldet kein Ende.
 *  · `invalid` — der Link benennt keinen Brand; die Übersicht öffnet.
 *
 * Bauweise wie `StaleLinkNotice` (Portal an den Body, Klassen `sh-stale*` aus `share.css`); anders als dort
 * bleibt der Hinweis länger stehen (20 s), weil er eine Entscheidung der Seite erklärt, nicht nur eine Zeit.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { describeFireLink, fireCoordText, fireTimeText, type FireLinkTarget } from './fireLink';
import '../share/share.css';

export type FireLinkNoticeKind = 'gone' | 'gone-effis' | 'invalid';

const NOTICE_MS = 20_000;

export function FireLinkNotice({ kind, target, onClose }: { kind: FireLinkNoticeKind; target: FireLinkTarget | null; onClose: () => void }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const t = window.setTimeout(() => closeRef.current(), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, []);
  if (typeof document === 'undefined') return null;

  let head: string;
  let rest: string;
  if (kind === 'invalid' || !target) {
    head = 'Dieser Link benennt keinen Brand.';
    rest = ' Angezeigt wird die Übersicht der Brände.';
  } else if (target.kind === 'effis') {
    head = `Die Brandfläche (EFFIS ${target.effisId}) steht nicht mehr in den Daten des Brandradars.`;
    rest = ' Das heißt nicht, dass der Brand erloschen ist. Angezeigt wird die Übersicht der Brände.';
  } else {
    head = `Dieser Brand steht nicht mehr in den Daten des Brandradars (erste Detektion ${fireTimeText(target.acqMs)} bei ${fireCoordText(target.lat, target.lon)}).`;
    rest = ' Das Radar zeigt die letzten 7 Tage und die Saison-Historie; das Verschwinden aus den Daten heißt nicht, dass er erloschen ist. Die Karte steht an der Stelle der ersten Detektion.';
  }

  // Titel nur zur Kontrolle im Test, nicht sichtbar.
  const title = target ? describeFireLink(target).title : undefined;
  return createPortal(
    <div className="sh-stale" role="status" aria-live="polite" data-fire-link-notice={kind} title={title}>
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
