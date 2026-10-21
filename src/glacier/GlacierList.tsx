/** GL — "Alle Gletscher" in the readout: every glacier of the current country/search, ranked ones first (bucket colour + bar), the rest by area with "–". */
import { useEffect, useMemo, useState } from 'react';
import { OriginChip } from './GlacierParts';
import { GLACIER_RAMPS, displayName, fmt0, fmtKm2, type GlacierMetricDef, type MetricValue, type RankRow } from './glacierView';
import type { GlacierCatalogEntry } from './glacierContract';

const STEP = 60;

interface Props {
  ranked: readonly RankRow[];
  rest: readonly { g: GlacierCatalogEntry; value: MetricValue | undefined }[];
  def: GlacierMetricDef;
  hint: string;
  selectedId: string | null;
  onPick: (id: string) => void;
}

export default function GlacierList({ ranked, rest, def, hint, selectedId, onPick }: Props) {
  const [shown, setShown] = useState(STEP);
  const total = ranked.length + rest.length;
  useEffect(() => { setShown(STEP); }, [def.id, total]);
  const ramp = GLACIER_RAMPS[def.ramp];
  const maxAbs = useMemo(() => ranked.reduce((m, r) => Math.max(m, Math.abs(r.value.v ?? 0)), 0) || 1, [ranked]);
  const rows = useMemo(() => [...ranked.map((r, i) => ({ ...r, n: i + 1 as number | null })), ...rest.map((r) => ({ ...r, n: null }))].slice(0, shown), [ranked, rest, shown]);

  return (
    <section className="gl-all" aria-label="Alle Gletscher">
      <div className="gl-all-head">
        <div><h3 className="gl-h3">Alle Gletscher</h3><small>{fmt0(total)} in der Auswahl · {def.label} · {def.locked ? 'gesperrt' : hint}</small></div>
        <OriginChip origin={def.origin} />
      </div>
      {total === 0 ? <div className="gl-empty">Keine Gletscher für diese Auswahl.</div> : (
        <ul className="gl-all-list">
          {rows.map((r) => {
            const b = r.value?.bucket ?? -1;
            const v = r.value?.v;
            return (
              <li key={r.g.id}>
                <button type="button" aria-current={selectedId === r.g.id} onClick={() => onPick(r.g.id)}>
                  <span className="gl-all-n">{r.n ?? ''}</span>
                  <span className={`gl-all-dot${b < 0 ? ' is-none' : ''}`} style={b >= 0 ? { background: ramp[b] } : undefined} aria-hidden="true" />
                  <span className="gl-all-body">
                    <b>{displayName(r.g)}</b>
                    <span>{r.g.country} · {fmtKm2(r.g.area.km2)}{r.value?.period ? ` · ${r.value.period}` : ''}</span>
                    {r.n != null && v != null && <span className="gl-all-bar" aria-hidden="true"><i style={{ width: `${Math.max(3, (Math.abs(v) / maxAbs) * 100)}%`, background: b >= 0 ? ramp[b] : undefined }} /></span>}
                  </span>
                  <span className="gl-all-v" data-origin={def.origin}>{r.value?.text ?? '–'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {shown < total && (
        <div className="gl-all-more">
          <button type="button" className="gl-btn" onClick={() => setShown((s) => s + STEP * 4)}>Weitere zeigen</button>
          <button type="button" className="gl-btn" onClick={() => setShown(total)}>Alle {fmt0(total)} zeigen</button>
        </div>
      )}
    </section>
  );
}
