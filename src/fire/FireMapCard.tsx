/**
 * Info card on the map for a fire picked by a map click: name, status, region,
 * the four key figures and a way into the dossier. The values come from the
 * same helpers as the list cards (`RecordStats`/`Badge` live, `historyStatTiles`
 * in the look-back), so card and list always say the same.
 */
import { useEffect, type ReactNode } from 'react';
import { Badge, RecordStats, Stat, recordName, regionLabel } from './FireFootprintPanel';
import { historyEntryName, historyStatTiles } from './FireHistoryPanel';
import { FlameIcon, IndustryIcon } from './fireIcons';
import { STATUS_COLOR, statusLabel, missingReason, type FireRecord } from './footprint/fireRegistry';
import { STATIC_GREY, clusterColor } from './fireClusters';
import { BR_BADGE_LABEL, badgeOf } from './brandradarMeta';
import type { HistoryIndexEntry } from './history/historyArtifacts';

interface CardActions {
  onOpenDossier: () => void;
  onClose: () => void;
}

function MapCardShell({ eyebrow, name, region, regionTitle, accent, isSite, badge, children, meta, onOpenDossier, onClose }: CardActions & {
  eyebrow: string;
  name: string;
  region: string;
  regionTitle?: string;
  accent: string;
  isSite: boolean;
  badge: ReactNode;
  children: ReactNode;
  meta?: ReactNode;
}) {
  // Escape closes the card, like a popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <section
      className="br-mapcard" role="dialog" aria-label={`Brand ${name}`}
      style={{ ['--br-mapcard-acc' as string]: accent }}
    >
      <header className="br-mapcard-head">
        <span className="br-mapcard-ic" style={{ color: accent }}>
          {isSite ? <IndustryIcon size={20} /> : <FlameIcon size={20} />}
        </span>
        <span className="br-mapcard-titles">
          <span className="br-mapcard-eyebrow">{eyebrow}{badge}</span>
          <span className="br-mapcard-name">{name}</span>
          <span className="br-mapcard-region" title={regionTitle}>{region}</span>
        </span>
        <button type="button" className="br-mapcard-close" aria-label="Kachel schließen" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {children}
      {meta != null && <p className="br-mapcard-meta">{meta}</p>}
      <button type="button" className="br-mapcard-cta" onClick={onOpenDossier}>
        Detailansicht öffnen
        <span className="br-mapcard-cta-arrow" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    </section>
  );
}

/** Live window (24 h / 7 d): a fire of the registry. */
export function FireMapCard({ r, nowMs, ...actions }: CardActions & { r: FireRecord; nowMs: number }) {
  return (
    <MapCardShell
      {...actions}
      eyebrow={r.anomaly?.kind === 'site' ? 'Thermalanomalie' : 'Brand'}
      name={recordName(r)} region={regionLabel(r)} regionTitle={missingReason(r, 'country') ?? undefined}
      accent={r.suspectedStatic ? STATIC_GREY : STATUS_COLOR[r.status.kind]}
      isSite={r.anomaly?.kind === 'site'}
      badge={<Badge r={r} />}
      meta={statusLabel(r, nowMs)}
    >
      <RecordStats r={r} nowMs={nowMs} />
    </MapCardShell>
  );
}

const COUNTRY_NAME: Record<string, string> = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz' };

/** Look-back window (month / season): an event of the history index. */
export function HistoryMapCard({ e, ...actions }: CardActions & { e: HistoryIndexEntry }) {
  const site = e.anomalyKind === 'site';
  const b = badgeOf(e.statusKind, false, e.anomalyKind);
  const flags = [e.effisId && 'EFFIS kartiert', e.anomalyKind === 'site-deviating' && 'Abweichung vom Anlagenmuster', e.nrt > 0 && 'vorläufig (NRT)']
    .filter(Boolean).join(' · ');
  return (
    <MapCardShell
      {...actions}
      eyebrow={site ? 'Thermalanomalie · Rückblick' : 'Brand · Rückblick'}
      name={historyEntryName(e)} region={COUNTRY_NAME[e.country] ?? e.country}
      accent={site ? STATIC_GREY : clusterColor(e.frpSumMw ?? 0)}
      isSite={site}
      badge={<span className={`br-badge is-${b}`}>{BR_BADGE_LABEL[b]}</span>}
      meta={flags || undefined}
    >
      <span className="br-fire-stats">
        {historyStatTiles(e).map((t) => <Stat key={t.lbl} lbl={t.lbl} val={t.val} sub={t.sub} />)}
      </span>
    </MapCardShell>
  );
}
