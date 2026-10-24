/**
 * GL — "Alle Gletscher" in the readout: one tile per glacier, built like the fire list of the Brandradar (head row, four key
 * figures, notes). Ranked glaciers first (bucket colour + bar), the rest by area with "–". Every value carries its origin.
 */
import { useEffect, useMemo, useState } from 'react';
import { OriginChip } from './GlacierParts';
import { GLACIER_RAMPS, displayName, fmt0, fmtKm2, fmtRefYear, type GlacierMetricDef, type MetricValue, type RankRow } from './glacierView';
import { GLACIER_COUNTRY_LABEL, GLACIER_REGIONS, type GlacierCatalogEntry } from './glacierContract';

const STEP = 40;
const STATUS_LABEL: Record<NonNullable<GlacierCatalogEntry['status']>, string> = { vanished: 'verschwunden (amtlich)', vanishing: 'verschwindend (amtlich)', 'lost-status': 'Status verloren (amtlich)' };

interface Props {
  ranked: readonly RankRow[];
  rest: readonly { g: GlacierCatalogEntry; value: MetricValue | undefined }[];
  def: GlacierMetricDef;
  hint: string;
  selectedId: string | null;
  onPick: (id: string) => void;
  /** Selects the glacier AND opens its detail view (dossier): the button bottom right of every tile. */
  onOpen: (id: string) => void;
}

function GlacierIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 20 9 8.5l3 4.5 2.5-3.5L21.5 20Z" fill={color} stroke="rgba(44,42,38,.55)" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="m7.2 11.7 1.8-3.2 1.9 2.9-1.1-.6-1.2 1.4Z" fill="#fff" opacity=".9" />
    </svg>
  );
}

export default function GlacierList({ ranked, rest, def, hint, selectedId, onPick, onOpen }: Props) {
  const [shown, setShown] = useState(STEP);
  const total = ranked.length + rest.length;
  useEffect(() => { setShown(STEP); }, [def.id, total]);
  const ramp = GLACIER_RAMPS[def.ramp];
  const maxAbs = useMemo(() => ranked.reduce((m, r) => Math.max(m, Math.abs(r.value.v ?? 0)), 0) || 1, [ranked]);
  const rows = useMemo(() => [...ranked.map((r, i) => ({ ...r, n: i + 1 as number | null })), ...rest.map((r) => ({ ...r, n: null }))].slice(0, shown), [ranked, rest, shown]);

  return (
    <section className="gl-all" aria-label="Alle Gletscher">
      <div className="gl-all-head">
        <span className="gl-label">Alle Gletscher</span>
        <small>{fmt0(Math.min(shown, total))} von {fmt0(total)} gezeigt</small>
      </div>
      <div className="gl-all-sub">{def.label} · {def.locked ? 'gesperrt' : hint} <OriginChip origin={def.origin} /></div>
      {total === 0 ? <div className="gl-empty">Keine Gletscher für diese Auswahl.</div> : (
        <ol className="gl-all-list">
          {rows.map((r) => {
            const g = r.g;
            const b = r.value?.bucket ?? -1;
            const v = r.value?.v;
            const sel = selectedId === g.id;
            const region = GLACIER_REGIONS[g.region]?.label ?? g.region;
            const notes = [g.lead ? 'Leitgletscher' : null, g.debris != null && g.debris >= 2 ? 'überwiegend schuttbedeckt' : null, g.status ? STATUS_LABEL[g.status] : null].filter(Boolean);
            return (
              <li key={g.id} className="gl-tile-li">
                <button type="button" className={`gl-tile${sel ? ' is-sel' : ''}${g.status === 'vanished' ? ' is-gone' : ''}`} aria-pressed={sel} onClick={() => onPick(g.id)}
                  style={b >= 0 ? { ['--gl-tile-c' as string]: ramp[b] } : undefined}>
                  <span className="gl-tile-top">
                    {r.n != null && <span className="gl-tile-n">{r.n}</span>}
                    <GlacierIcon color={b >= 0 ? ramp[b] : '#F3EEE1'} />
                    <span className="gl-tile-name">{displayName(g)}</span>
                    <span className={`gl-tile-badge is-${g.klass}`} title={`Größenklasse ${g.klass}`}>{g.klass}</span>
                    <span className="gl-tile-region" title={GLACIER_COUNTRY_LABEL[g.country]}>{g.country}</span>
                  </span>
                  <span className="gl-tile-stats">
                    <span className="gl-kf is-metric" title={r.value?.reason ?? undefined}>
                      <span className="gl-kf-lbl">{def.label}</span>
                      <span className="gl-kf-val gl-num" data-origin={def.origin}>{r.value?.text ?? '–'}</span>
                      <span className="gl-kf-sub">{r.value?.text ? r.value.period : def.locked ? 'gesperrt' : def.noValue}</span>
                      {r.n != null && v != null && <span className="gl-kf-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, (Math.abs(v) / maxAbs) * 100)}%` }} /></span>}
                    </span>
                    <span className="gl-kf">
                      <span className="gl-kf-lbl">Fläche</span>
                      <span className="gl-kf-val gl-num" data-origin="official">{fmtKm2(g.area.km2)}</span>
                      <span className="gl-kf-sub">Inventar {fmtRefYear(g.area.refYear)}</span>
                    </span>
                    <span className="gl-kf">
                      <span className="gl-kf-lbl">Höhe</span>
                      <span className="gl-kf-val gl-num" data-origin="official">{fmt0(g.z[1])} m</span>
                      <span className="gl-kf-sub">{fmt0(g.z[0])}–{fmt0(g.z[2])} m</span>
                    </span>
                    <span className="gl-kf">
                      <span className="gl-kf-lbl">Region</span>
                      <span className="gl-kf-val is-text">{region}</span>
                      <span className="gl-kf-sub">{g.area.source}</span>
                    </span>
                  </span>
                  {notes.length > 0 && <span className="gl-tile-notes">{notes.map((t) => <span key={t} className="gl-tile-note">{t}</span>)}</span>}
                </button>
                <button type="button" className="gl-tile-open" aria-label={`Detailansicht öffnen: ${displayName(g)}`} onClick={() => onOpen(g.id)}>
                  Detailansicht
                  <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {shown < total && (
        <div className="gl-all-more">
          <button type="button" className="gl-btn" onClick={() => setShown((s) => s + STEP * 3)}>Weitere {fmt0(Math.min(STEP * 3, total - shown))} laden</button>
          <button type="button" className="gl-btn" onClick={() => setShown(total)}>Alle {fmt0(total)}</button>
        </div>
      )}
    </section>
  );
}
