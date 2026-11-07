/**
 * Readout tab „Messpunkte" (Jan 2026-11-08): every measuring point that delivers values in the shown slot, with its current
 * values — searchable (name, road, series) and filterable by the quantities that matter on the road (glaze/frost, road
 * ≤ 0 °C, wet, precipitation, visibility, gusts). Points without any valid value are left out (they say nothing now).
 */
import { useMemo, useState } from 'react';
import type { RoadPoint } from './roadContract';
import { ROAD_CLASS_LABEL } from './roadClasses';
import { ROAD_CLASS_COLOR, ROAD_CLASS_INK, ROAD_CLASS_TINT, conditionText, f1, hm, isCritical, isHatched, shieldText, visText } from './roadView';

type FilterKey = 'alle' | 'glaette' | 'rs0' | 'nass' | 'nd' | 'sicht' | 'wind';
type SortKey = 'kalt' | 'name' | 'strasse' | 'wind' | 'sicht';
type KindKey = 'alle' | 'A' | 'other';

/** A point counts as "delivering" when it carries at least one valid value and its measurement is at most 60 min older than the slot. */
const MAX_AGE_MS = 60 * 60_000;
const GUST_KMH = 50;

const ok = (p: RoadPoint, f: keyof NonNullable<RoadPoint['x']>, v: number | null): v is number => v != null && !p.x?.[f];
const gustKmh = (p: RoadPoint) => (ok(p, 'wg', p.wg) ? p.wg * 3.6 : null);
const hasPrecip = (p: RoadPoint) => (ok(p, 'pr', p.pr) && p.pr > 0) || (ok(p, 'pt', p.pt) && p.pt > 0);

const FILTERS: ReadonlyArray<{ key: FilterKey; label: string; test: (p: RoadPoint) => boolean }> = [
  { key: 'alle', label: 'Alle', test: () => true },
  { key: 'glaette', label: 'Glätte / Frost', test: (p) => isCritical(p.cls) },
  { key: 'rs0', label: 'Fahrbahn ≤ 0 °C', test: (p) => ok(p, 'rs', p.rs) && p.rs <= 0 },
  { key: 'nass', label: 'Nass', test: (p) => p.cls === 'wet' || (ok(p, 'wf', p.wf) && p.wf > 0) },
  { key: 'nd', label: 'Niederschlag', test: hasPrecip },
  { key: 'sicht', label: 'Sicht < 1 km', test: (p) => ok(p, 'vis', p.vis) && p.vis < 1000 },
  { key: 'wind', label: `Böen ≥ ${GUST_KMH} km/h`, test: (p) => (gustKmh(p) ?? 0) >= GUST_KMH },
];
const SORTS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'kalt', label: 'Fahrbahn: kälteste zuerst' },
  { key: 'strasse', label: 'Straße und km' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'wind', label: 'Böen: stärkste zuerst' },
  { key: 'sicht', label: 'Sicht: geringste zuerst' },
];
const PAGE = 120;

const roadNo = (r: string | null) => (r ? Number(r.replace(/\D+/g, '')) || 9999 : 99999);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
/** Nulls last for every sort. */
const byNum = (a: number | null, b: number | null, dir: 1 | -1) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : (a - b) * dir);

function sorter(k: SortKey): (a: RoadPoint, b: RoadPoint) => number {
  const name = (a: RoadPoint, b: RoadPoint) => a.n.localeCompare(b.n, 'de');
  switch (k) {
    case 'name': return name;
    case 'strasse': return (a, b) => roadNo(a.road) - roadNo(b.road) || (a.road ?? '').localeCompare(b.road ?? '') || byNum(a.km, b.km, 1) || name(a, b);
    case 'wind': return (a, b) => byNum(gustKmh(a), gustKmh(b), -1) || name(a, b);
    case 'sicht': return (a, b) => byNum(ok(a, 'vis', a.vis) ? a.vis : null, ok(b, 'vis', b.vis) ? b.vis : null, 1) || name(a, b);
    case 'kalt':
    default: return (a, b) => byNum(ok(a, 'rs', a.rs) ? a.rs : null, ok(b, 'rs', b.rs) ? b.rs : null, 1) || name(a, b);
  }
}

export function roadPointDelivers(p: RoadPoint, slotMs: number | null): boolean {
  if (slotMs != null && slotMs - p.t > MAX_AGE_MS) return false;
  return ok(p, 'rs', p.rs) || ok(p, 'ta', p.ta) || ok(p, 'td', p.td) || ok(p, 'rh', p.rh) || ok(p, 'vis', p.vis)
    || ok(p, 'ws', p.ws) || ok(p, 'wg', p.wg) || ok(p, 'wf', p.wf) || ok(p, 'pr', p.pr);
}

interface Props {
  points: readonly RoadPoint[];
  slotMs: number | null;
  stale: boolean;
  loading: boolean;
  noData: string | null;
  selectedId: string | null;
  onPick: (p: RoadPoint) => void;
}

export default function RoadStationList(p: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('alle');
  const [kind, setKind] = useState<KindKey>('alle');
  const [sort, setSort] = useState<SortKey>('kalt');
  const [limit, setLimit] = useState(PAGE);

  const live = useMemo(() => p.points.filter((x) => roadPointDelivers(x, p.slotMs)), [p.points, p.slotMs]);
  const counts = useMemo(() => new Map(FILTERS.map((f) => [f.key, live.filter(f.test).length] as const)), [live]);
  const rows = useMemo(() => {
    const q = norm(query);
    const test = FILTERS.find((f) => f.key === filter)!.test;
    return live
      .filter((x) => kind === 'alle' || (kind === 'A' ? x.kind === 'A' : x.kind !== 'A'))
      .filter(test)
      .filter((x) => !q || norm(x.n).includes(q) || (x.road != null && norm(x.road).includes(q)) || x.id.toLowerCase().includes(q) || x.g.toLowerCase().includes(q))
      .sort(sorter(sort));
  }, [live, query, filter, kind, sort]);

  if (p.noData) return <div className="aw-empty"><strong>Derzeit keine Messdaten.</strong> {p.noData}</div>;
  if (p.loading && !p.points.length) return <div className="aw-empty" role="status">Messpunkte werden geladen …</div>;

  return (
    <div className="aw-stl">
      <label htmlFor="aw-stl-search" className="aw-eyebrow aw-dock-label">Messpunkt suchen</label>
      <div className="aw-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input id="aw-stl-search" type="search" placeholder="Name, A 8, B 17 …" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} autoComplete="off" />
      </div>
      <div role="group" aria-label="Straßenart" className="aw-seg aw-stl-kind">
        {([['alle', 'Alle'], ['A', 'Autobahn'], ['other', 'Bundes-/Landesstraße']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? 'is-active' : ''} onClick={() => { setKind(k); setLimit(PAGE); }}>{l}</button>
        ))}
      </div>
      <div role="group" aria-label="Filter nach Messgröße" className="aw-stl-filters">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} className={`aw-stl-chip${filter === f.key ? ' is-on' : ''}`} onClick={() => { setFilter(f.key); setLimit(PAGE); }}>
            {f.label}<span>{counts.get(f.key) ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="aw-stl-sort">
        <label htmlFor="aw-stl-sort" className="aw-eyebrow">Sortierung</label>
        <select id="aw-stl-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      <div className="aw-dock-head">
        <span className="aw-dock-h">Messpunkte mit aktuellen Werten</span>
        <span className="aw-count">{rows.length}{rows.length !== live.length ? ` von ${live.length}` : ''}</span>
      </div>
      {p.stale && <p className="aw-note">Die Messung ist veraltet — die Werte stammen aus dem letzten geprüften Slot{p.slotMs != null ? ` (${hm(p.slotMs)})` : ''}.</p>}
      <div className="aw-dock-list aw-stl-list">
        {rows.slice(0, limit).map((x) => <Row key={x.id} p={x} on={x.id === p.selectedId} onPick={p.onPick} hot={filter} />)}
        {!rows.length && <p className="aw-note">{query.trim() ? `Kein Messpunkt passt zu „${query}“.` : 'Kein Messpunkt mit aktuellen Werten erfüllt diesen Filter.'}</p>}
        {rows.length > limit && (
          <button type="button" className="aw-road-more" onClick={() => setLimit((l) => l + PAGE)}>Weitere {Math.min(PAGE, rows.length - limit)} von {rows.length - limit} anzeigen</button>
        )}
      </div>
      <p className="aw-note">Glättemeldeanlagen des DWD (SWIS), geprüft durch buscosun. Gezeigt werden nur Messpunkte, die im aktuellen Slot mindestens einen gültigen Wert liefern. Luft in 4–5 m Höhe.</p>
    </div>
  );
}

/** Small stroke icons of the metric tiles (24 × 24). */
const ICON: Readonly<Record<string, string>> = {
  luft: 'M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z',
  tau: 'M12 3.5s-6 6.6-6 10.5a6 6 0 0 0 12 0c0-3.9-6-10.5-6-10.5z',
  wind: 'M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8',
  sicht: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  film: 'M3 15c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 19c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M12 3.5s-3 3.3-3 5.3a3 3 0 0 0 6 0c0-2-3-5.3-3-5.3z',
  nd: 'M7 16a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 16M8 19l-1 2M12 19l-1 2M16 19l-1 2',
};
const dec1 = (v: number) => v.toFixed(1).replace('.', ',');

function Row({ p, on, onPick, hot }: { p: RoadPoint; on: boolean; onPick: (p: RoadPoint) => void; hot: FilterKey }) {
  const hatched = isHatched(p.cls);
  const tint = ROAD_CLASS_TINT[p.cls];
  const g = gustKmh(p);
  const rs = ok(p, 'rs', p.rs) ? p.rs : null;
  const label = ROAD_CLASS_LABEL[p.cls].short;
  const condRaw = p.x?.cond ? null : conditionText(p.cond);
  // The condition word only when it says more than the class pill („trocken" next to „Trocken" is noise).
  const cond = condRaw && condRaw.toLowerCase() !== label.toLowerCase() ? condRaw : null;
  const vals: Array<{ k: string; icon: string; v: string; unit?: string; hot?: boolean }> = [];
  if (ok(p, 'ta', p.ta)) vals.push({ k: 'Luft', icon: 'luft', v: `${f1(p.ta)}°` });
  if (ok(p, 'td', p.td)) vals.push({ k: 'Taupunkt', icon: 'tau', v: `${f1(p.td)}°` });
  if (g != null || ok(p, 'ws', p.ws)) vals.push({ k: 'Wind / Böe', icon: 'wind', v: `${ok(p, 'ws', p.ws) ? Math.round(p.ws * 3.6) : '—'} / ${g != null ? Math.round(g) : '—'}`, unit: 'km/h', hot: hot === 'wind' });
  if (ok(p, 'vis', p.vis)) vals.push({ k: 'Sicht', icon: 'sicht', v: visText(p.vis), hot: hot === 'sicht' });
  if (ok(p, 'wf', p.wf) && p.wf > 0) vals.push({ k: 'Wasserfilm', icon: 'film', v: dec1(p.wf), unit: 'mm', hot: hot === 'nass' });
  if (ok(p, 'pr', p.pr) && p.pr > 0) vals.push({ k: 'Niederschlag', icon: 'nd', v: dec1(p.pr), unit: 'mm/h', hot: hot === 'nd' });
  const accent = hatched ? '#B9AE93' : ROAD_CLASS_COLOR[p.cls];
  const vars = { '--stl-accent': accent, '--stl-tint': tint.bg, '--stl-ink': tint.ink, '--stl-border': tint.border } as React.CSSProperties;
  return (
    <button type="button" className={`aw-stl-card${on ? ' is-active' : ''}`} aria-pressed={on} onClick={() => onPick(p)} style={vars}>
      <span className={`aw-stl-hero${hatched ? ' is-hatched' : ''}${rs != null && rs <= 0 ? ' is-sub0' : ''}${hot === 'rs0' || hot === 'glaette' ? ' is-hot' : ''}`}>
        <b>{rs != null ? `${f1(rs)}°` : '—'}</b>
        <small>{rs != null ? 'Fahrbahn' : 'ohne Fahrbahn'}</small>
      </span>
      <span className="aw-stl-main">
        <span className="aw-stl-head">
          <span className="aw-stl-name">{p.n}</span>
          <span className={`aw-stl-pill${hatched ? ' is-hatched' : ''}`} style={!hatched ? { background: ROAD_CLASS_COLOR[p.cls], color: ROAD_CLASS_INK[p.cls] } : undefined}>{label}</span>
        </span>
        <span className="aw-stl-meta">
          {p.road && <span className={`aw-stl-shield${p.kind === 'A' ? ' is-a' : ''}`}>{shieldText(p.road)}</span>}
          {p.km != null && <span>km {dec1(p.km)}</span>}
          <span>{hm(p.t)} Uhr</span>
          {cond && <span>{cond}</span>}
        </span>
        {vals.length > 0 && (
          <span className="aw-stl-metrics">
            {vals.map((x) => (
              <span key={x.k} className={`aw-stl-m${x.hot ? ' is-hot' : ''}`} title={x.k}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[x.icon]} /></svg>
                <span className="aw-stl-m-k">{x.k}</span>
                <b>{x.v}{x.unit && <i> {x.unit}</i>}</b>
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}
