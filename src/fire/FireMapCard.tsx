/**
 * Info card on the map for a fire picked by a map click: name, status, region,
 * the four key figures and a way into the dossier. The values come from the
 * same helpers as the list card (`RecordStats`, `Badge`), so both say the same.
 */
import { useEffect } from 'react';
import { Badge, RecordStats, recordName, regionLabel } from './FireFootprintPanel';
import { FlameIcon, IndustryIcon } from './fireIcons';
import { STATUS_COLOR, statusLabel, missingReason, type FireRecord } from './footprint/fireRegistry';
import { STATIC_GREY } from './fireClusters';

export function FireMapCard({ r, nowMs, onOpenDossier, onClose }: {
  r: FireRecord;
  nowMs: number;
  onOpenDossier: () => void;
  onClose: () => void;
}) {
  // Escape closes the card, like a popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const accent = r.suspectedStatic ? STATIC_GREY : STATUS_COLOR[r.status.kind];
  return (
    <section
      className="br-mapcard" role="dialog" aria-label={`Brand ${recordName(r)}`}
      style={{ ['--br-mapcard-acc' as string]: accent }}
    >
      <header className="br-mapcard-head">
        <span className="br-mapcard-ic" style={{ color: accent }}>
          {r.anomaly?.kind === 'site' ? <IndustryIcon size={20} /> : <FlameIcon size={20} />}
        </span>
        <span className="br-mapcard-titles">
          <span className="br-mapcard-name">{recordName(r)}</span>
          <span className="br-mapcard-region" title={missingReason(r, 'country') ?? undefined}>{regionLabel(r)}</span>
        </span>
        <Badge r={r} />
        <button type="button" className="br-mapcard-close" aria-label="Kachel schließen" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <RecordStats r={r} nowMs={nowMs} />
      <p className="br-mapcard-meta">{statusLabel(r, nowMs)}</p>
      <button type="button" className="br-mapcard-cta" onClick={onOpenDossier}>
        Dossier öffnen
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>
  );
}
