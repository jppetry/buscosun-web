/** GL-1 — Dock of the situation page: search, country, "Karte färben nach" (origin at every metric, locked ones stay visible); the list of all glaciers sits in the readout (`GlacierList`). */
import { LockNote } from './GlacierParts';
import GlacierMetricToggles from './GlacierMetricToggles';
import type { GlacierMetricDef } from './glacierView';
import { GLACIER_LANDS, type GlacierLand, type GlacierMetric } from './glacierState';
import { GLACIER_COUNTRY_LABEL } from './glacierContract';

const LAND_LABEL: Record<GlacierLand, string> = { alle: 'Alle', ch: 'CH', at: 'AT', de: 'DE' };
const LAND_TITLE: Record<GlacierLand, string> = { alle: 'Alle Länder', ch: GLACIER_COUNTRY_LABEL.CH, at: GLACIER_COUNTRY_LABEL.AT, de: GLACIER_COUNTRY_LABEL.DE };

interface Props {
  query: string; onQuery: (q: string) => void;
  land: GlacierLand; onLand: (l: GlacierLand) => void;
  metric: GlacierMetric; onMetric: (m: GlacierMetric) => void;
  refYears: string;
  defs: Readonly<Record<GlacierMetric, GlacierMetricDef>>;
}

export default function GlacierDock({ query, onQuery, land, onLand, metric, onMetric, refYears, defs }: Props) {
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
        <GlacierMetricToggles metric={metric} onMetric={onMetric} defs={defs} />
        {def.locked && <LockNote>{def.locked}</LockNote>}
      </div>
      <div className="gl-dock-foot">Bezugsjahre der Flächen: {refYears}</div>
    </aside>
  );
}
