/**
 * Info card on the map for a glacier picked by a click (Jan, 2026-10-24): the shape of the Brandradar's `FireMapCard` —
 * eyebrow with the class, name, country and region, two key figures (area from the inventory, the chosen metric with its
 * origin), the follow star and ONE way into the detail view. Bottom left of the map on desktop, across the map on mobile.
 * The root keeps the class `gl-pill`: the mobile slot and `verify:glacier-ui` address it.
 */
import { useEffect } from 'react';
import { GLACIER_REGIONS, type GlacierCatalogEntry } from './glacierContract';
import { displayName, fmt0, fmtKm2, fmtRefYear, type GlacierMetricDef, type MetricValue } from './glacierView';
import { LockNote, OriginChip } from './GlacierParts';

const COUNTRY_NAME: Record<string, string> = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz' };

interface Props {
  g: GlacierCatalogEntry;
  def: GlacierMetricDef;
  value: MetricValue | undefined;
  followed: boolean;
  onFollow: () => void;
  onOpenDetail: () => void;
  onClose: () => void;
}

export default function GlacierMapCard({ g, def, value, followed, onFollow, onOpenDetail, onClose }: Props) {
  // Escape closes the card, like a popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = displayName(g);
  const region = [COUNTRY_NAME[g.country] ?? g.country, GLACIER_REGIONS[g.region]?.label].filter(Boolean).join(' · ');
  return (
    <section className="gl-pill" role="region" aria-label={`Gletscher ${name}`}>
      <header className="gl-pill-head">
        <span className="gl-pill-ic" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 19L9.5 7l3 5 2-3L21 19z" />
            <path d="M8 10.5l1.5 1.5 1.5-1.5M14.5 12.5l1.3 1.3 1.2-1.3" />
          </svg>
        </span>
        <span className="gl-pill-titles">
          <span className="gl-pill-eyebrow">Gletscher<span className="gl-chip is-official"><i aria-hidden="true" />Klasse {g.klass}</span></span>
          <span className="gl-pill-name">{name}</span>
          <span className="gl-pill-region">{region}</span>
        </span>
        <button type="button" className={`gl-star${followed ? ' is-on' : ''}`} aria-pressed={followed} aria-label={followed ? `${name} nicht mehr folgen` : `${name} folgen`} onClick={onFollow}>{followed ? '★' : '☆'}</button>
        <button type="button" className="gl-pill-close" aria-label="Kachel schließen" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <span className="gl-pill-stats">
        <span className="gl-pill-stat">
          <span className="gl-pill-stat-lbl">Fläche</span>
          <span className="gl-pill-stat-val gl-num" data-origin="official">{fmtKm2(g.area.km2)}</span>
          <span className="gl-pill-stat-sub">Inventar {fmtRefYear(g.area.refYear)}</span>
        </span>
        <span className="gl-pill-stat">
          <span className="gl-pill-stat-lbl">{def.label}</span>
          {value?.v != null ? (
            <>
              <span className="gl-pill-stat-val gl-num" data-origin={def.origin}>{value.text}</span>
              <span className="gl-pill-stat-sub">{value.period}<OriginChip origin={def.origin} /></span>
            </>
          ) : (
            <span className="gl-pill-stat-sub">{def.locked ? <LockNote>gesperrt</LockNote> : value?.reason ?? def.noValue}</span>
          )}
        </span>
      </span>
      <p className="gl-pill-meta">Höhe {fmt0(g.z[0])}–{fmt0(g.z[2])} m laut Inventar</p>
      <button type="button" className="gl-btn is-primary gl-pill-cta" onClick={onOpenDetail}>
        Detailansicht öffnen
        <span className="gl-pill-cta-arrow" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    </section>
  );
}
