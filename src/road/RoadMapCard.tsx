/**
 * Preview cards on the map (bottom left, like the fire card): one for a road segment picked by a map click, one for a
 * whole corridor picked by a click on its line. Both end in the way into the dossier. The segment values are the row
 * of the hazard list (`HzRow`), so card and list always say the same.
 */
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import type { HzRow } from './roadHzView';
import { EV_LABEL } from './roadHzView';
import type { RoadSegment } from './roadSegments';
import type { RoadLevel } from './roadHazards';
import { AW_HATCH, AW_SEV, AW_SEV_TINT, AW_UNKNOWN_TINT } from './roadNivoTheme';

interface Actions {
  onOpenDossier: () => void;
  onClose: () => void;
}

function Shell({ label, shields, eyebrow, name, sub, accent, children, onOpenDossier, onClose }: Actions & {
  label: string; shields: readonly string[]; eyebrow: string; name: string; sub: string; accent: string; children: ReactNode;
}) {
  // Escape closes the card, like a popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <section className="aw-mapcard" role="dialog" aria-label={label} style={{ ['--aw-mapcard-acc' as string]: accent } as CSSProperties}>
      <header className="aw-mapcard-head">
        <span className="aw-mapcard-titles">
          <span className="aw-mapcard-eyebrow">
            {shields.map((s) => <span key={s} className="aw-shield">{s}</span>)}
            <span>{eyebrow}</span>
          </span>
          <span className="aw-mapcard-name">{name}</span>
          <span className="aw-mapcard-sub">{sub}</span>
        </span>
        <button type="button" className="aw-mapcard-close" aria-label="Kachel schließen" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {children}
      <button type="button" className="aw-mapcard-cta" onClick={onOpenDossier}>
        Detailansicht öffnen
        <span className="aw-mapcard-cta-arrow" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    </section>
  );
}

const levelChip = (lv: RoadLevel | null, note?: string) => {
  const tint = lv ? AW_SEV_TINT[lv] : AW_UNKNOWN_TINT;
  return (
    <span className="aw-mapcard-lv" style={{ background: tint.bg, borderColor: tint.border, color: tint.ink }}>
      {lv === null ? 'unbekannt' : `Stufe ${lv}`}
      {note && <em>{note}</em>}
    </span>
  );
};

/** A road segment (map click on its line or on a measuring point). */
export default function RoadMapCard({ seg, row, ...actions }: Actions & {
  seg: RoadSegment;
  /** The segment's row in the hazard list; `null` = no hazard in the window or no valid hazard file. */
  row: HzRow | null;
}) {
  const lv = row ? row.best.lv : null;
  return (
    <Shell {...actions} label={`Abschnitt ${seg.name}`} shields={seg.shields} eyebrow="Abschnitt" name={seg.name}
      sub={`km ${Math.round(seg.kmFrom)}–${Math.round(seg.kmTo)} · ${Math.round(seg.lengthKm)} km`} accent={lv ? AW_SEV[lv].bg : '#8B8474'}>
      {row ? (
        <div className="aw-mapcard-body">
          {levelChip(lv, lv === null ? 'keine gültige Messung' : EV_LABEL[row.best.ev ?? 'p'])}
          <span className="aw-mapcard-haz">{row.sub}</span>
          <span className="aw-mapcard-strip" aria-hidden="true">
            {row.strip.map((l, i) => <span key={i} style={{ background: l === null ? AW_HATCH : AW_SEV[l].bg }} />)}
          </span>
          <span className="aw-mapcard-when">{row.when}</span>
        </div>
      ) : (
        <p className="aw-mapcard-none">Keine Gefahr in diesem Zeitraum erkannt. Das ist keine Entwarnung.</p>
      )}
    </Shell>
  );
}

export interface RoadCorridorCardProps extends Actions {
  shields: readonly string[];
  title: string;
  sub: string;
  /** Short fact lines (measuring points, coldest spot, …). */
  facts: readonly string[];
  /** Segments of the corridor with a hazard level in the shared window and the highest level; `null` = no valid hazard file. */
  hazard: { n: number; max: RoadLevel | null } | null;
}

/** A whole corridor (map click on its line). */
export function RoadCorridorCard({ shields, title, sub, facts, hazard, ...actions }: RoadCorridorCardProps) {
  return (
    <Shell {...actions} label={`Strecke ${title}`} shields={shields} eyebrow="Strecke" name={title} sub={sub}
      accent={hazard?.max ? AW_SEV[hazard.max].bg : '#8B8474'}>
      <div className="aw-mapcard-body">
        {hazard && (hazard.n > 0
          ? <>{levelChip(hazard.max)}<span className="aw-mapcard-haz">{hazard.n} {hazard.n === 1 ? 'Abschnitt' : 'Abschnitte'} mit Gefahr</span></>
          : <span className="aw-mapcard-haz">Keine Gefahr im Zeitraum erkannt — keine Entwarnung.</span>)}
        {facts.map((f) => <span key={f} className="aw-mapcard-fact">{f}</span>)}
      </div>
    </Shell>
  );
}
