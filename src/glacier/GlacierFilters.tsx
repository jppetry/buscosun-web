/**
 * GL — Search and filters above "Alle Gletscher" in the readout. The search field shares its text with the dock's search
 * (one `query`); the filters narrow the list AND the map together: size class, region, and a few catalogue properties.
 * Nothing here is a value — only selection.
 */
import { GLACIER_REGIONS, type GlacierCatalogEntry, type GlacierClass } from './glacierContract';
import type { GlacierLatest } from './glacierClient';
import type { GlacierLand } from './glacierState';
import { fmt0 } from './glacierView';

export type GlacierTrait = 'series' | 'lead' | 'debris' | 'named' | 'status';
export interface GlacierFilter { klass: GlacierClass[]; region: string; traits: GlacierTrait[] }
export const NO_FILTER: GlacierFilter = { klass: [], region: '', traits: [] };

const CLASSES: readonly GlacierClass[] = ['A', 'B', 'C'];
const CLASS_TITLE: Record<GlacierClass, string> = { A: 'ab 1 km²', B: '0,1 bis 1 km²', C: 'unter 0,1 km²' };
const TRAITS: ReadonlyArray<{ id: GlacierTrait; label: string; title: string }> = [
  { id: 'series', label: 'Mit Messreihe', title: 'Länge oder Massenbilanz gemessen (WGMS, GLAMOS, ÖAV)' },
  { id: 'lead', label: 'Leitgletscher', title: 'Leitgletscher der Seite' },
  { id: 'debris', label: 'Schuttbedeckt', title: 'überwiegend schuttbedeckt laut Inventar' },
  { id: 'named', label: 'Mit Namen', title: 'nur Gletscher mit Namen' },
  { id: 'status', label: 'Amtlicher Status', title: 'verschwunden, verschwindend oder Status verloren — laut Behörde' },
];

export const filterActive = (f: GlacierFilter): boolean => f.klass.length > 0 || f.region !== '' || f.traits.length > 0;

export function passesFilter(g: GlacierCatalogEntry, f: GlacierFilter, latest: GlacierLatest | undefined): boolean {
  if (f.klass.length && !f.klass.includes(g.klass)) return false;
  if (f.region && g.region !== f.region) return false;
  for (const t of f.traits) {
    if (t === 'series' && !(latest?.len || latest?.ba)) return false;
    if (t === 'lead' && !g.lead) return false;
    if (t === 'debris' && !(g.debris != null && g.debris >= 2)) return false;
    if (t === 'named' && !g.name) return false;
    if (t === 'status' && !g.status) return false;
  }
  return true;
}

const toggle = <T,>(list: readonly T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

interface Props {
  query: string; onQuery: (q: string) => void;
  filter: GlacierFilter; onFilter: (f: GlacierFilter) => void;
  land: GlacierLand;
  count: number;
}

export default function GlacierFilters({ query, onQuery, filter, onFilter, land, count }: Props) {
  const regions = Object.entries(GLACIER_REGIONS).filter(([, r]) => land === 'alle' || r.country.toLowerCase() === land);
  const active = filterActive(filter) || query.trim() !== '';
  return (
    <section className="gl-rfilter" aria-label="Gletscher suchen und filtern">
      <label className="gl-rsearch">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" placeholder="Gletscher suchen: Name, Inventar-Nr. …" value={query} onChange={(e) => onQuery(e.target.value)} aria-label="Gletscher suchen" autoComplete="off" />
      </label>
      <div className="gl-rf-row">
        <span className="gl-rf-lbl" id="gl-rf-klass">Klasse</span>
        <div className="gl-rf-chips" role="group" aria-labelledby="gl-rf-klass">
          {CLASSES.map((k) => (
            <button key={k} type="button" aria-pressed={filter.klass.includes(k)} title={`Größenklasse ${k}: ${CLASS_TITLE[k]}`}
              onClick={() => onFilter({ ...filter, klass: toggle(filter.klass, k) })}>{k}</button>
          ))}
        </div>
        <select className="gl-rf-select" value={filter.region} onChange={(e) => onFilter({ ...filter, region: e.target.value })} aria-label="Region">
          <option value="">Alle Regionen</option>
          {regions.map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
        </select>
      </div>
      <div className="gl-rf-chips is-wrap" role="group" aria-label="Merkmale">
        {TRAITS.map((t) => (
          <button key={t.id} type="button" aria-pressed={filter.traits.includes(t.id)} title={t.title}
            onClick={() => onFilter({ ...filter, traits: toggle(filter.traits, t.id) })}>{t.label}</button>
        ))}
      </div>
      <div className="gl-rf-foot">
        <span>{fmt0(count)} Gletscher in der Auswahl</span>
        {active && <button type="button" className="gl-linkish" onClick={() => { onQuery(''); onFilter(NO_FILTER); }}>Suche und Filter zurücksetzen</button>}
      </div>
    </section>
  );
}
