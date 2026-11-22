/**
 * SW-5/SW-6 — Dock of Seewetter (design `reference/seewetter-desktop.dc.html`, left column 250 px): search, Revier
 * chips, profile chips with the limits (visible and editable, stored locally — plan SW-6), spot list with the class at
 * the chosen hour, layers, switches (WL-4: the water level of the BSH among them, on by default — E-WL-1)
 * and the data situation per region.
 */
import { useId, useState, type CSSProperties, type ReactElement } from 'react';
import { SEA_PROFILES, SEA_PROFILE_BY_ID, limitsChanged, limitsSummary, type SeaClass, type SeaLimits, type SeaProfileId } from './seaProfiles';
import { CLASS_COLOR, CLASS_SHORT, HS_STOPS, LAYER_LABEL, PER_STOPS, cssGradient } from './seaView';
import { SEA_LAYERS, SEA_REVIERE, type SeaLayer, type SeaRevier } from './seaState';
import { CUR_STOPS, LEGEND_SPEEDS, RIPPLE_LAYER_LABEL, RIPPLE_RGB, RIPPLE_SWITCH_HINT, frontHalfWidth, legendFront, rgbCss } from './seaRipples';
import { SEA_PARTICLES_HINT, SEA_PARTICLES_LABEL } from './seaParticles';
import { useSearchSheet } from '../components/LocationSearchSheet';
import { ListSearchSheet } from '../components/ListSearchSheet';

export interface SeaDockSpot { id: string; name: string; sub: string; cls: SeaClass; reason: string; /** Phase DK: a Danish spot — the name carries the pennant. */ dk?: boolean }
export interface SeaToggles { wind: boolean; warn: boolean; stations: boolean; water: boolean; /** Phase ST: map layer „Strömung“ (off by default). */ current: boolean; /** Phase BS-P: wind particles — the switch exists only with `seaParticlesFrom()`. */ particles: boolean; /** Phase SR, since 22.11.2026 a switch: the ripples of the BSH current above the chosen wave layer (on by default). */ ripples: boolean }

interface Props {
  query: string; onQuery: (q: string) => void;
  revier: SeaRevier; onRevier: (r: SeaRevier) => void;
  profile: SeaProfileId; onProfile: (p: SeaProfileId) => void;
  limits: SeaLimits; onLimits: (l: SeaLimits | null) => void;
  spots: readonly SeaDockSpot[]; selectedId: string | null; onPick: (id: string) => void; total: number;
  layer: SeaLayer; onLayer: (l: SeaLayer) => void;
  toggles: SeaToggles; onToggle: (k: keyof SeaToggles) => void;
  loading: boolean;
  /** Phase DK: the catalogue carries Danish spots — only then the Revier „Dänemark“ is offered. */
  hasDk?: boolean;
  /** Phase BS: the catalogue carries lake spots — only then the Revier „Seen“ is offered; with it one chip per lake. */
  hasLakes?: boolean;
  /** Phase BS-P: the switch „Windpartikel“ is offered (`seaParticlesFrom()`). */
  hasParticles?: boolean;
  lakes?: readonly { id: string; name: string; n: number }[];
  lake?: string | null; onLake?: (id: string | null) => void;
  /**
   * Desktop splits the dock: `layers` stays in the left column, `picker` (search, Revier, profile, spots) moves into the
   * readout. `spots` (AM-W) is the picker without the profile block — the planner's step „Startort“, where the profile
   * was chosen a page before.
   */
  show?: 'all' | 'layers' | 'picker' | 'spots';
}

const REVIER_LABEL: Record<SeaRevier, string> = { alle: 'Alle', nordsee: 'Nordsee', ostsee: 'Ostsee', daenemark: 'Dänemark', seen: 'Seen' };
/** Phase DK: the courtesy pennant of a Danish spot (decorative — the Revier and the dossier say „Dänemark“ in words). */
export const DkPennant = () => <i className="sw-dk-flag" aria-hidden="true" />;
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

/**
 * Phase SR: the key of the layer „Strömung“ — the colour of the area by speed, and on it four fronts drawn with the
 * layer's own geometry (`legendFront`): larger and lighter = stronger, tip downstream. Used by the dock tile and the legend.
 */
export function RippleKey({ width = 250, height = 40, className }: { width?: number; height?: number; className?: string }) {
  // useId carries colons; a plain id keeps the url(#…) reference of the gradient safe in every browser.
  const id = `rk${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const max = CUR_STOPS[CUR_STOPS.length - 1][0];
  const scale = +Math.min(1, (height - 4) / (2 * frontHalfWidth(LEGEND_SPEEDS[LEGEND_SPEEDS.length - 1], 0) + 2)).toFixed(3);
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          {CUR_STOPS.map(([v, c]) => <stop key={v} offset={`${((v / max) * 100).toFixed(1)}%`} stopColor={c} />)}
        </linearGradient>
      </defs>
      <rect width={width} height={height} rx={Math.min(8, height / 2)} fill={`url(#${id})`} />
      {LEGEND_SPEEDS.map((v, i) => {
        // Drawn at the origin and placed by a transform: a low key (the dock tile) shrinks the fronts as a whole.
        const f = legendFront(v, 0, 0);
        return f && (
          <g key={v} fill="none" strokeLinecap="round" strokeLinejoin="round" transform={`translate(${(((i + 0.5) / LEGEND_SPEEDS.length) * width - 4).toFixed(1)} ${height / 2}) scale(${scale})`}>
            <path d={f.relief} stroke={rgbCss(RIPPLE_RGB.relief)} strokeWidth={f.width + 0.6} opacity={0.5 * f.a} />
            <path d={f.whole} stroke={rgbCss(RIPPLE_RGB.front)} strokeWidth={f.width} opacity={0.55 * f.a} />
            <path d={f.crest} stroke={rgbCss(RIPPLE_RGB.crest)} strokeWidth={f.width} opacity={f.a} />
          </g>
        );
      })}
    </svg>
  );
}
const TOGGLE_ICON: Record<keyof SeaToggles, ReactElement> = {
  wind: <path d={WIND_PATH} />,
  warn: <path d="M12 3.5 2.8 19.5h18.4L12 3.5zM12 10v4.5M12 17.2v.1" />,
  stations: <><circle cx="12" cy="12" r="2.2" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></>,
  water: <path d="M12 3.2s6.3 6.5 6.3 10.6a6.3 6.3 0 0 1-12.6 0C5.7 9.7 12 3.2 12 3.2zM9.2 14.2a3 3 0 0 0 2.6 2.4" />,
  // Phase ST: the drift arrow — a float and where it goes.
  current: <><path d="M6 18.5 17.5 7M10.5 6.5h7.5V14" /><circle cx="5" cy="19.5" r="1.9" fill="currentColor" stroke="none" /></>,
  // Phase SR: two fronts across the flow, tip downstream (to the right) — the sign of the ripples.
  ripples: <path d="M6.5 5.5c3.4 2.6 3.4 10.4 0 13M12.5 4c4.6 3.4 4.6 12.6 0 16M19 8.5c1.6 2 1.6 5 0 7" />,
  // Phase BS-P: three streaks of different length — particles drifting with the wind.
  particles: <path d="M3.5 7.5h9M8 12h12.5M4.5 16.5h7M15.5 7.5h2M15 16.5h4" />,
};

/**
 * The limits of the chosen profile as fields (starting values of the profile, stored locally per user). One piece for
 * the dock („Mein Profil“) and for the planner's step „Deine Grenzen“ (AM-W, E-AM-38) — the same fields, the same store.
 */
export function SeaLimitsEditor({ profile, limits, onLimits }: { profile: SeaProfileId; limits: SeaLimits; onLimits: (l: SeaLimits | null) => void }) {
  const base = SEA_PROFILE_BY_ID[profile].limits;
  const changed = limitsChanged(profile, limits);
  return (
    <div className="sw-limits">
      {LIMIT_FIELDS.filter(([k]) => base[k] != null).map(([k, label, unit, step]) => (
        <label key={k} className="sw-limit-row">
          <span>{label}</span>
          <span className="sw-limit-in">
            <input type="number" inputMode="decimal" min={0} step={step} value={limits[k] as number}
              onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) onLimits({ ...limits, [k]: v }); }} />
            {unit}
          </span>
        </label>
      ))}
      {base.noOffshore && <div className="sw-limit-row is-fixed"><span>Richtung</span><span>nicht ablandig</span></div>}
      {base.daylight && <div className="sw-limit-row is-fixed"><span>Licht</span><span>nur hell</span></div>}
      {base.steepMinPerS != null && <div className="sw-limit-row is-fixed"><span>Steile See</span><span>Windsee-Periode ≥ {base.steepMinPerS.toLocaleString('de-DE')} s bei Welle &gt; {base.steepHsM} m</span></div>}
      <div className="sw-limit-note">Startwerte, im Browser änderbar und nur hier gespeichert. Deine Grenzen, keine Sicherheitsbewertung.</div>
      {changed && <button type="button" className="sw-link" onClick={() => onLimits(null)}>Startwerte wiederherstellen</button>}
    </div>
  );
}

export default function SeaDock(p: Props) {
  const [open, setOpen] = useState(false);
  const sid = useId();
  const sheet = useSearchSheet();   // phone / tablet: full-screen search page instead of typing in the dock
  const changed = limitsChanged(p.profile, p.limits);
  const toggles: Array<[keyof SeaToggles, string, string]> = [
    // Jan, 22.11.2026: the current's ripples as a switch like „Wind an den Spots“, at the very top, on by default.
    ['ripples', RIPPLE_LAYER_LABEL, RIPPLE_SWITCH_HINT],
    ['wind', 'Wind an den Spots', 'buscosun Fusion · Pfeile'],
    ['warn', 'Warnstatus Küste', 'DWD Seewetterdienst · deutsche Gebiete'],
    ['stations', 'Messstationen', 'DWD · Wind und Böen gemessen'],
    ['water', 'Wasserstand-Vorhersage', 'BSH · Pegel, CC BY 4.0'],
    // SR: the ripple layer is the main layer „Strömung“; this switch is its arrow option and says so.
    ['current', 'Strömungspfeile', 'BSH-Modell · Pfeile, wohin der Strom setzt'],
  ];
  // Phase BS-P: on for everyone (Jan 22.11.); with `?swp=0` the list is the one before.
  if (p.hasParticles) toggles.push(['particles', SEA_PARTICLES_LABEL, SEA_PARTICLES_HINT]);
  // Phase DK: with Danish spots in the catalogue the two layers also carry DMI stations and DMI model points — named here.
  if (p.hasDk) {
    toggles[3][2] = 'DWD und DMI · Wind und Böen gemessen';
    toggles[4][2] = 'BSH-Pegel und DMI-Modellpunkte, CC BY 4.0';
  }
  const show = p.show ?? 'all';
  const picker = show !== 'layers' && (
    <>
      <label htmlFor={`${sid}-q`} className="sw-dock-h sw-dock-sec sw-dock-label sw-dock-first">Spot, Hafen oder Ort</label>
      <div className="sw-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input id={`${sid}-q`} type="search" placeholder="Fehmarn, Büsum, Schilksee …" value={p.query} onChange={(e) => p.onQuery(e.target.value)} onFocus={sheet.openSheet} />
      </div>
      {sheet.open && (
        <ListSearchSheet label="Spot suchen" placeholder="Fehmarn, Büsum, Schilksee …" query={p.query} onQuery={p.onQuery}
          inputRef={sheet.inputRef} onClose={sheet.close} accent="#0F6E7A" accentDark="#0A525B"
          empty={p.loading ? 'Spots laden …' : 'Kein Spot passt zur Suche.'}
          rows={p.spots.map((s) => ({
            id: s.id, name: s.name, sub: s.sub,
            lead: <span className={`sw-dot${s.cls === 'keine' ? ' is-hatched' : ''}`} style={s.cls !== 'keine' ? { background: CLASS_COLOR[s.cls] } : { background: 'repeating-linear-gradient(135deg, #8B8474 0 2px, #EDE6D3 2px 4px)' }} />,
          }))}
          onPick={(id) => { sheet.close(); p.onPick(id); }} />
      )}
      <div role="group" aria-label="Revier" className="sw-seg sw-dock-revier">
        {SEA_REVIERE.filter((r) => (r !== 'daenemark' || p.hasDk || p.revier === r) && (r !== 'seen' || p.hasLakes || p.revier === r)).map((r) => <button key={r} type="button" aria-pressed={p.revier === r} className={p.revier === r ? 'is-active' : ''} onClick={() => p.onRevier(r)}>{REVIER_LABEL[r]}</button>)}
      </div>
      {/* Phase BS: one chip per lake, largest first; the first chip shows all lakes again. */}
      {p.revier === 'seen' && p.lakes && p.lakes.length > 0 && p.onLake && (
        <div role="group" aria-label="See" className="sw-lk-chips">
          <button type="button" aria-pressed={!p.lake} className={!p.lake ? 'is-active' : ''} onClick={() => p.onLake!(null)}>Alle Seen</button>
          {p.lakes.map((l) => <button key={l.id} type="button" aria-pressed={p.lake === l.id} className={p.lake === l.id ? 'is-active' : ''} onClick={() => p.onLake!(l.id)}>{l.name}<em>{l.n}</em></button>)}
        </div>
      )}

      {show !== 'spots' && (
        <>
          <div className="sw-dock-head">
            <span className="sw-dock-h sw-dock-sec">Mein Profil</span>
            <button type="button" className="sw-link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Grenzen ausblenden' : changed ? 'Grenzen (geändert)' : 'Grenzen anzeigen'}</button>
          </div>
          <div className="sw-profiles" role="group" aria-label="Profil">
            {SEA_PROFILES.map((pf) => <button key={pf.id} type="button" aria-pressed={p.profile === pf.id} className={p.profile === pf.id ? 'is-active' : ''} onClick={() => p.onProfile(pf.id)}>{pf.label}</button>)}
          </div>
          <p className="sw-prof-sum">{limitsSummary(p.limits)}</p>
          {open && <SeaLimitsEditor profile={p.profile} limits={p.limits} onLimits={p.onLimits} />}
        </>
      )}

      <div className="sw-dock-head">
        <span className="sw-dock-h sw-dock-sec">Spots</span>
        <span className="sw-count">{p.spots.length === p.total ? p.total : `${p.spots.length} von ${p.total}`}</span>
      </div>
      <div className="sw-dock-list">
        {p.loading && <div className="sw-note">Spots laden …</div>}
        {!p.loading && !p.spots.length && <div className="sw-note">Kein Spot passt zur Suche.</div>}
        {p.spots.map((s) => (
          <button key={s.id} type="button" aria-pressed={p.selectedId === s.id} className={`sw-spot${p.selectedId === s.id ? ' is-active' : ''}`} onClick={() => p.onPick(s.id)} title={`${CLASS_SHORT[s.cls]}: ${s.reason}`}>
            <span className={`sw-dot sw-spot-dot${s.cls === 'keine' ? ' is-hatched' : ''}`} style={s.cls !== 'keine' ? { background: CLASS_COLOR[s.cls], '--sw-dot': CLASS_COLOR[s.cls] } as CSSProperties : undefined} aria-label={CLASS_SHORT[s.cls]} role="img" />
            <span className="sw-spot-body"><span className="sw-spot-name">{s.name}{s.dk && <DkPennant />}</span><span className="sw-spot-sub">{s.sub}</span></span>
            <svg className="sw-spot-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        ))}
      </div>
    </>
  );
  const layers = show !== 'picker' && show !== 'spots' && (
    <>
      <div className={`sw-dock-h sw-dock-sec${show === 'all' ? ' sw-dock-h-layers' : ''}`}>Ebenen</div>
      <div role="group" aria-label="Ebene der Karte" className="sw-layers sw-layer-tiles">
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
    </>
  );
  if (show === 'picker' || show === 'spots') return <div className="sw-dock-picker">{picker}</div>;
  return (
    <aside className="sw-dock" aria-label={show === 'layers' ? 'Ebenen' : 'Spots, Profil und Ebenen'}>
      {picker}
      {layers}
    </aside>
  );
}
