/** GL-1 — Dock of the situation page: search, country, "Karte färben nach" (origin at every metric, locked ones stay visible), ranking. */
import { OriginChip, LockNote } from './GlacierParts';
import { displayName, fmtKm2, type GlacierMetricDef, type RankRow } from './glacierView';
import { GLACIER_LANDS, GLACIER_METRICS, type GlacierLand, type GlacierMetric } from './glacierState';
import { GLACIER_COUNTRY_LABEL } from './glacierContract';

const LAND_LABEL: Record<GlacierLand, string> = { alle: 'Alle', ch: 'CH', at: 'AT', de: 'DE' };
const LAND_TITLE: Record<GlacierLand, string> = { alle: 'Alle Länder', ch: GLACIER_COUNTRY_LABEL.CH, at: GLACIER_COUNTRY_LABEL.AT, de: GLACIER_COUNTRY_LABEL.DE };

interface Props {
  query: string; onQuery: (q: string) => void;
  land: GlacierLand; onLand: (l: GlacierLand) => void;
  metric: GlacierMetric; onMetric: (m: GlacierMetric) => void;
  rows: readonly RankRow[]; selectedId: string | null; onPick: (id: string) => void;
  refYears: string;
  hint: string;
  defs: Readonly<Record<GlacierMetric, GlacierMetricDef>>;
}

export default function GlacierDock({ query, onQuery, land, onLand, metric, onMetric, rows, selectedId, onPick, refYears, hint, defs }: Props) {
  const def = defs[metric];
  return (
    <aside className="gl-dock" aria-label="Auswahl und Rangliste">
      <div className="gl-field">
        <label className="gl-label" htmlFor="gl-suche">Gletscher suchen</label>
        <input id="gl-suche" className="gl-input" type="search" placeholder="Name, Gebirge, Inventar-Nr. …" value={query} onChange={(e) => onQuery(e.target.value)} autoComplete="off" />
      </div>
      <div className="gl-field">
        <div className="gl-label" id="gl-land-l">Land</div>
        <div className="gl-seg" role="group" aria-labelledby="gl-land-l">
          {GLACIER_LANDS.map((l) => <button key={l} type="button" aria-pressed={land === l} title={LAND_TITLE[l]} onClick={() => onLand(l)}>{LAND_LABEL[l]}</button>)}
        </div>
      </div>
      <div className="gl-field">
        <div className="gl-label">Karte färben nach</div>
        <div role="group" aria-label="Größe der Karte">
          {GLACIER_METRICS.map((m) => {
            const d = defs[m];
            return (
              <button key={m} type="button" className={`gl-metric${d.locked ? ' is-locked' : ''}`} aria-pressed={metric === m} aria-disabled={!!d.locked}
                title={d.locked ?? undefined} onClick={() => { if (!d.locked) onMetric(m); }}>
                <span className="gl-m-main"><b>{d.label}</b><span>{d.locked ? 'gesperrt' : d.sub}</span></span>
                <OriginChip origin={d.origin} />
              </button>
            );
          })}
        </div>
        {def.locked && <LockNote>{def.locked}</LockNote>}
      </div>
      <div className="gl-rank-wrap">
        <div className="gl-rank-head"><span className="gl-label">Rangliste</span><small>{hint}</small></div>
        {rows.length === 0 ? <div className="gl-empty">{def.locked ? 'Gesperrt — keine Zahl ohne Berechnung.' : 'Keine Gletscher mit Wert für diese Auswahl.'}</div> : (
          <ul className="gl-rank">
            {rows.map((r, i) => (
              <li key={r.g.id}>
                <button type="button" aria-current={selectedId === r.g.id} onClick={() => onPick(r.g.id)}>
                  <span className="gl-r-n">{i + 1}</span>
                  <span className="gl-r-body"><b>{displayName(r.g)}</b><span>{r.g.country} · {fmtKm2(r.g.area.km2)} · {r.value.period}</span></span>
                  <span className="gl-r-v" data-origin={def.origin}>{r.value.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="gl-dock-foot">Bezugsjahre der Flächen: {refYears}</div>
    </aside>
  );
}
