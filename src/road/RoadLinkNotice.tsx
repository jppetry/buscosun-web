/**
 * Autobahnwetter · Hinweise zu einem geteilten Abschnitts-Link (`roadLink.ts`).
 *
 * Zwei Orte, ein Aussehen (Klassen `sh-stale*`, Portal wie `StaleLinkNotice`):
 *  · `RoadLinkNotice`  — der Link benennt keinen Abschnitt (unlesbarer Pfad); die Route räumt die URL auf und sagt, warum.
 *  · `RoadSegNotice`   — die Seite hat den Abschnitt gesucht und Folgendes gefunden:
 *      `moved`    die Abschnittsgrenzen haben sich seit dem Link geändert; gezeigt wird der Abschnitt, der den km enthält;
 *      `gone`     es gibt auf dieser Strecke keinen Abschnitt, der den km enthält;
 *      `corridor` die Strecke kennt der Atlas nicht.
 * Der Zustand eines Abschnitts ist immer der AKTUELLE — das steht in der Vorschau des Links und gilt hier stillschweigend.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import '../share/share.css';

const NOTICE_MS = 20_000;

export type RoadSegNoticeKind =
  | { kind: 'moved'; wantedKm: number; from: number; to: number }
  | { kind: 'gone'; wantedKm: number; road: string }
  | { kind: 'corridor'; road: string };

function Shell({ head, rest, tag, onClose }: { head: string; rest: string; tag: string; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, NOTICE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="sh-stale" role="status" aria-live="polite" data-road-link-notice={tag}>
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

export default function RoadLinkNotice({ invalid }: { invalid: boolean }) {
  const [open, setOpen] = useState(invalid);
  if (!open) return null;
  return <Shell tag="invalid" head="Dieser Link benennt keinen Autobahnabschnitt." rest=" Angezeigt wird die Strecke." onClose={() => setOpen(false)} />;
}

export function RoadSegNotice({ notice, onClose }: { notice: RoadSegNoticeKind | null; onClose: () => void }) {
  if (!notice) return null;
  if (notice.kind === 'moved') {
    return <Shell tag="moved" onClose={onClose}
      head={`Die Abschnittsgrenzen haben sich geändert: km ${notice.wantedKm} liegt jetzt im Abschnitt km ${notice.from}–${notice.to}.`}
      rest=" Gezeigt wird dieser Abschnitt mit der aktuellen Lage." />;
  }
  if (notice.kind === 'gone') {
    return <Shell tag="gone" onClose={onClose}
      head={`Auf der ${notice.road} gibt es keinen Abschnitt bei km ${notice.wantedKm}.`}
      rest=" Angezeigt wird die Strecke." />;
  }
  return <Shell tag="corridor" onClose={onClose}
    head={`Die Strecke ${notice.road} kennt der Atlas nicht.`}
    rest=" Angezeigt wird eine andere Strecke." />;
}
