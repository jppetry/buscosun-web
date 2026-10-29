/**
 * SW-5/SW-6 — Dock of Seewetter (design `reference/seewetter-desktop.dc.html`, left column 250 px): search, Revier
 * chips, profile chips with the limits (visible and editable, stored locally — plan SW-6), spot list with the class at
 * the chosen hour, layers, switches (WL-4: the water level of the BSH among them, on by default — E-WL-1)
 * and the data situation per region.
 */
import { useId, useState, type ReactElement } from 'react';
import { SEA_PROFILES, SEA_PROFILE_BY_ID, limitsChanged, limitsSummary, type SeaClass, type SeaLimits, type SeaProfileId } from './seaProfiles';
import { CLASS_COLOR, CLASS_SHORT, HS_STOPS, LAYER_LABEL, PER_STOPS, cssGradient } from './seaView';
import { SEA_LAYERS, SEA_REVIERE, type SeaLayer, type SeaRevier } from './seaState';

export interface SeaDockSpot { id: string; name: string; sub: string; cls: SeaClass; reason: string }
export interface SeaToggles { wind: boolean; warn: boolean; stations: boolean; water: boolean }

interface Props {
  query: string; onQuery: (q: string) => void;
  revier: SeaRevier; onRevier: (r: SeaRevier) => void;
  profile: SeaProfileId; onProfile: (p: SeaProfileId) => void;
  limits: SeaLimits; onLimits: (l: SeaLimits | null) => void;
  spots: readonly SeaDockSpot[]; selectedId: string | null; onPick: (id: string) => void; total: number;
  layer: SeaLayer; onLayer: (l: SeaLayer) => void;
  toggles: SeaToggles; onToggle: (k: keyof SeaToggles) => void;
  loading: boolean;
  /** Desktop splits the dock: `layers` stays in the left column, `picker` (search, Revier, profile, spots) moves into the readout. */
  show?: 'all' | 'layers' | 'picker';
}

const REVIER_LABEL: Record<SeaRevier, string> = { alle: 'Alle', nordsee: 'Nordsee', ostsee: 'Ostsee' };
const LIMIT_FIELDS: Array<[keyof SeaLimits, string, string, number]> = [
  ['windMin', 'Wind ab', 'kn', 1], ['windMax', 'Wind bis', 'kn', 1], ['gustMax', 'Böen bis', 'kn', 1], ['spreadMax', 'Böenspanne bis', 'kn', 1],
  ['hsMax', 'Welle bis', 'm', 0.1], ['wsMax', 'Windsee bis', 'm', 0.1],
];

const ICON_PROPS = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const WIND_PATH = 'M3 9h11a2.5 2.5 0 1 0-2.5-2.5M3 14h15a2.5 2.5 0 1 1-2.5 2.5M3 19h6';
const LAYER_ICON: Record<SeaLayer, ReactElement> = {
  hs: <path d="M2.5 9c2.2-3 4.3-3 6.5 0s4.3 3 6.5 0 3.2-2.4 6-0.5M2.5 16c2.2-3 4.3-3 6.5 0s4.3 3 6.5 0 3.2-2.4 6-0.5" />,
  ws: <path d={WIND_PATH} />,
  sw: <path d="M2 14c3.4-7 6.6-7 10 0s6.6 7 10 0" />,
  per: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
};
const TOGGLE_ICON: Record<keyof SeaToggles, ReactElement> = {
  wind: <path d={WIND_PATH} />,
  warn: <path d="M12 3.5 2.8 19.5h18.4L12 3.5zM12 10v4.5M12 17.2v.1" />,
  stations: <><circle cx="12" cy="12" r="2.2" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></>,
  water: <path d="M12 3.2s6.3 6.5 6.3 10.6a6.3 6.3 0 0 1-12.6 0C5.7 9.7 12 3.2 12 3.2zM9.2 14.2a3 3 0 0 0 2.6 2.4" />,
};

export default function SeaDock(p: Props) {
  const [open, setOpen] = useState(false);
  const sid = useId();
  const base = SEA_PROFILE_BY_ID[p.profile].limits;
  const changed = limitsChanged(p.profile, p.limits);
  const toggles: Array<[keyof SeaToggles, string, string]> = [
    ['wind', 'Wind an den Spots', 'buscosun Fusion · Pfeile'],
    ['warn', 'Warnstatus Küste', 'DWD Seewetterdienst · Gebiete'],
    ['stations', 'Messstationen', 'DWD · Wind und Böen gemessen'],
    ['water', 'Wasserstand-Vorhersage', 'BSH · Pegel, CC BY 4.0'],
  ];
  const show = p.show ?? 'all';
  const picker = show !== 'layers' && (
    <>
      <label htmlFor={`${sid}-q`} className="sw-eyebrow sw-dock-label">Spot, Hafen oder Ort</label>
      <div className="sw-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input id={`${sid}-q`} type="search" placeholder="Fehmarn, Büsum, Schilksee …" value={p.query} onChange={(e) => p.onQuery(e.target.value)} />
      </div>
      <div role="group" aria-label="Revier" className="sw-seg sw-dock-revier">
        {SEA_REVIERE.map((r) => <button key={r} type="button" aria-pressed={p.revier === r} className={p.revier === r ? 'is-active' : ''} onClick={() => p.onRevier(r)}>{REVIER_LABEL[r]}</button>)}
      </div>

      <div className="sw-dock-head">
        <span className="sw-dock-h">Mein Profil</span>
        <button type="button" className="sw-link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Grenzen ausblenden' : changed ? 'Grenzen (geändert)' : 'Grenzen anzeigen'}</button>
      </div>
      <div className="sw-profiles" role="group" aria-label="Profil">
        {SEA_PROFILES.map((pf) => <button key={pf.id} type="button" aria-pressed={p.profile === pf.id} className={p.profile === pf.id ? 'is-active' : ''} onClick={() => p.onProfile(pf.id)}>{pf.label}</button>)}
      </div>
      <p className="sw-prof-sum">{limitsSummary(p.limits)}</p>
      {open && (
        <div className="sw-limits">
          {LIMIT_FIELDS.filter(([k]) => base[k] != null).map(([k, label, unit, step]) => (
            <label key={k} className="sw-limit-row">
              <span>{label}</span>
              <span className="sw-limit-in">
                <input type="number" inputMode="decimal" min={0} step={step} value={p.limits[k] as number}
                  onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) p.onLimits({ ...p.limits, [k]: v }); }} />
                {unit}
              </span>
            </label>
          ))}
          {base.noOffshore && <div className="sw-limit-row is-fixed"><span>Richtung</span><span>nicht ablandig</span></div>}
          {base.daylight && <div className="sw-limit-row is-fixed"><span>Licht</span><span>nur hell</span></div>}
          {base.steepMinPerS != null && <div className="sw-limit-row is-fixed"><span>Steile See</span><span>Windsee-Periode ≥ {base.steepMinPerS.toLocaleString('de-DE')} s bei Welle &gt; {base.steepHsM} m</span></div>}
          <div className="sw-limit-note">Startwerte, im Browser änderbar und nur hier gespeichert. Deine Grenzen, keine Sicherheitsbewertung.</div>
          {changed && <button type="button" className="sw-link" onClick={() => p.onLimits(null)}>Startwerte wiederherstellen</button>}
        </div>
      )}

      <div className="sw-dock-head">
        <span className="sw-dock-h">Spots</span>
        <span className="sw-count">{p.spots.length === p.total ? p.total : `${p.spots.length} von ${p.total}`}</span>
      </div>
      <div className="sw-dock-list">
        {p.loading && <div className="sw-note">Spots laden …</div>}
        {!p.loading && !p.spots.length && <div className="sw-note">Kein Spot passt zur Suche.</div>}
        {p.spots.map((s) => (
          <button key={s.id} type="button" aria-pressed={p.selectedId === s.id} className={`sw-spot${p.selectedId === s.id ? ' is-active' : ''}`} onClick={() => p.onPick(s.id)} title={`${CLASS_SHORT[s.cls]}: ${s.reason}`}>
            <span className="sw-spot-body"><span className="sw-spot-name">{s.name}</span><span className="sw-spot-sub">{s.sub}</span></span>
            <span className={`sw-dot${s.cls === 'keine' ? ' is-hatched' : ''}`} style={s.cls !== 'keine' ? { background: CLASS_COLOR[s.cls] } : undefined} aria-label={CLASS_SHORT[s.cls]} role="img" />
          </button>
        ))}
      </div>
    </>
  );
  const layers = show !== 'picker' && (
    <>
      <div className={`sw-dock-h sw-dock-sec${show === 'all' ? ' sw-dock-h-layers' : ''}`}>Ebenen</div>
      <div role="group" aria-label="Seegang-Ebene" className="sw-layers sw-layer-tiles">
        {SEA_LAYERS.map((l) => (
          <button key={l} type="button" aria-pressed={p.layer === l} className={p.layer === l ? 'is-active' : ''} onClick={() => p.onLayer(l)}>
            <span className="sw-layer-top"><svg {...ICON_PROPS}>{LAYER_ICON[l]}</svg><span>{LAYER_LABEL[l]}</span></span>
            <span className="sw-layer-ramp" style={{ background: cssGradient(l === 'per' ? PER_STOPS : HS_STOPS) }} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="sw-dock-h sw-dock-sec sw-dock-h-more">Auf der Karte</div>
      <div className="sw-toggles">
        {toggles.map(([k, label, sub]) => (
          <button key={k} type="button" aria-pressed={p.toggles[k]} className={`sw-toggle${p.toggles[k] ? ' is-on' : ''}`} onClick={() => p.onToggle(k)}>
            <span className="sw-toggle-ico"><svg {...ICON_PROPS}>{TOGGLE_ICON[k]}</svg></span>
            <span className="sw-toggle-body"><span className="sw-toggle-label">{label}</span><span className="sw-toggle-sub">{sub}</span></span>
            <span className="sw-switch" aria-hidden="true"><span /></span>
          </button>
        ))}
      </div>

      <div className="sw-dock-data">
        <div className="sw-dock-h sw-dock-sec">Datenlage je Revier</div>
        <div className="sw-data-list">
          <div className="sw-data-row"><div className="sw-data-head"><strong>Küste DE</strong><b className="sw-pill-ok">voll</b></div><span>CWAM 900 m, Seewetterbericht, Warnstatus, Messung, Wasserstand</span></div>
          <div className="sw-data-row"><div className="sw-data-head"><strong>Europa</strong><b className="sw-pill-later">Stufe 2</b></div><span>EWAM 5 km, ohne Warnung des Ziellands</span></div>
          <div className="sw-data-row"><div className="sw-data-head"><strong>DACH-Seen</strong><b className="sw-pill-later">keine Welle</b></div><span>nicht im DWD-Bestand</span></div>
        </div>
      </div>
    </>
  );
  if (show === 'picker') return <div className="sw-dock-picker">{picker}</div>;
  return (
    <aside className="sw-dock" aria-label={show === 'layers' ? 'Ebenen' : 'Spots, Profil und Ebenen'}>
      {picker}
      {layers}
    </aside>
  );
}
