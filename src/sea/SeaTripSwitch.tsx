/**
 * Phase AM / AM-W — the two questions of the assistant's first page (`audit/seewetter-ausfahrt.md` §13): „Wer fährt?“
 * (the seven profiles as tiles) and „Art der Ausfahrt“ (Vor Ort | Etappe | Strand, each a card with one sentence). The
 * profile sets the kind of trip the planner opens with; the cards change it. Also the pair „früher / später“ every
 * window of the planner is stepped with.
 */
import type { ReactNode } from 'react';
import { SEA_PROFILES, type SeaProfileId } from './seaProfiles';
import { TRIP_MODE_LABEL, TRIP_MODE_WHAT, type TripMode } from './seaTrip';
import { WIZ_MODE_CHOICES, WIZ_MODE_FITS, WIZ_MODE_GET, WIZ_MODE_GIVE, WIZ_MODE_GUIDE } from './seaSteps';

const Check = () => (
  <svg className="sw-wz-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

export function TripProfiles({ profile, onProfile, note }: { profile: SeaProfileId; onProfile: (p: SeaProfileId) => void; note?: ReactNode }) {
  return (
    <section className="sw-wz-sec">
      <h3 id="sw-am-who">Wer fährt?</h3>
      <div className="sw-wz-tiles" role="group" aria-labelledby="sw-am-who">
        {SEA_PROFILES.map((pf) => (
          <button key={pf.id} type="button" aria-pressed={profile === pf.id} className={`sw-wz-tile${profile === pf.id ? ' is-active' : ''}`} onClick={() => onProfile(pf.id)}>
            {pf.label}
          </button>
        ))}
      </div>
      {note}
    </section>
  );
}

/** The pair „eine Stunde früher / später“ at one end of a window — Start and Rückkehr of „Vor Ort“, Beginn and Ende of Strand. */
export function TripStepper({ label, onShift, canEarlier, canLater }: { label: string; onShift: (by: -1 | 1) => void; canEarlier: boolean; canLater: boolean }) {
  return (
    <span className="sw-pl-step" role="group" aria-label={`${label} verschieben`}>
      <button type="button" disabled={!canEarlier} onClick={() => onShift(-1)} aria-label={`${label} eine Stunde früher`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <button type="button" disabled={!canLater} onClick={() => onShift(1)} aria-label={`${label} eine Stunde später`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </span>
  );
}

// Colours of the sketches: water, land, the line of the plan (the page's accent), the quiet grey of what is not chosen.
const SEA = 'var(--sw-tint, #E3F0F1)', LAND = 'var(--sand-100, #EDE6D3)', SHORE = 'var(--border-strong, #C4B896)';
const ACC = 'var(--sw-accent, #0F6E7A)', INK = 'var(--ink-900, #2C2A26)', MUTED = 'var(--stone-400, #A89A7A)';
const TXT = { fontFamily: 'inherit', fontSize: 11, fontWeight: 600 } as const;
const Boat = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M-10 0h20l-4 5h-12z" fill={INK} />
    <path d="M0-2V-17L9-2z" fill="#fff" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
  </g>
);
const Arrow = ({ x, y1, y2 }: { x: number; y1: number; y2: number }) => (
  <g stroke={ACC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
    <path d={`M${x} ${y1}V${y2}`} /><path d={`M${x - 5} ${y2 - 6}l5 6 5-6`} />
  </g>
);

/** A sketch per kind of trip: what the map will show once the plan stands. */
const MODE_SKETCH: Readonly<Record<TripMode, ReactNode>> = {
  ort: (
    <>
      <rect width="240" height="120" fill={SEA} />
      <circle cx="120" cy="94" r="58" fill="none" stroke={ACC} strokeWidth="1.6" strokeDasharray="4 5" />
      <path d="M0 120V96c40-6 70 6 110 0s70-12 130-4v28z" fill={LAND} stroke={SHORE} strokeWidth="1.2" />
      <circle cx="120" cy="96" r="5.5" fill={ACC} stroke="#fff" strokeWidth="2" />
      <text x="130" y="112" style={TXT} fill={INK}>Spot</text>
      <Boat x={152} y={60} />
      <text x="166" y="50" style={TXT} fill={INK}>Boot</text>
      <text x="183" y="42" style={TXT} fill={ACC}>≤ 5 km</text>
      <rect x="10" y="10" width="112" height="22" rx="11" fill="#fff" stroke={SHORE} />
      <text x="20" y="25" style={TXT} fill={INK}>Start → Rückkehr</text>
    </>
  ),
  etappe: (
    <>
      <rect width="240" height="120" fill={SEA} />
      <path d="M0 0h38c12 30-8 62 10 120H0z" fill={LAND} stroke={SHORE} strokeWidth="1.2" />
      <path d="M240 0v120h-34c14-40-10-80 6-120z" fill={LAND} stroke={SHORE} strokeWidth="1.2" />
      <path d="M58 96 98 70l52-12 46-32" fill="none" stroke={ACC} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {([[98, 70], [150, 58]] as const).map(([x, y]) => <circle key={x} cx={x} cy={y} r="4" fill="#fff" stroke={ACC} strokeWidth="2" />)}
      <circle cx="58" cy="96" r="7" fill={ACC} /><text x="54.5" y="100" style={TXT} fill="#fff">A</text>
      <circle cx="196" cy="26" r="7" fill={ACC} /><text x="192.5" y="30" style={TXT} fill="#fff">B</text>
      <Boat x={124} y={60} />
      <text x="84" y="88" style={TXT} fill={INK}>+1 h</text>
      <text x="150" y="76" style={TXT} fill={INK}>+2 h</text>
      <text x="62" y="18" style={TXT} fill={INK}>Wind, Welle, Strom zum Kurs</text>
    </>
  ),
  strand: (
    <>
      <rect width="240" height="120" fill={SEA} />
      <path d="M0 120V84c30-10 60-14 90-10s60 4 90-4 50-6 60-2v52z" fill={LAND} stroke={SHORE} strokeWidth="1.2" />
      <Arrow x={46} y1={22} y2={62} /><Arrow x={110} y1={18} y2={58} />
      <circle cx="46" cy="80" r="6" fill={ACC} stroke="#fff" strokeWidth="2" />
      <circle cx="120" cy="74" r="6" fill={ACC} stroke="#fff" strokeWidth="2" />
      <circle cx="196" cy="76" r="6" fill={MUTED} stroke="#fff" strokeWidth="2" />
      <g stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"><path d="M196 104V88" /><path d="M191 94l5-6 5 6" /></g>
      <text x="128" y="36" style={TXT} fill={ACC}>Wind von See</text>
      <text x="166" y="112" style={TXT} fill={INK}>vom Land</text>
    </>
  ),
};

/** A pointing hand, fingertip at 0/0 — "tap here" in the first picture, "drag this" in the second. */
const Hand = ({ x, y }: { x: number; y: number }) => (
  <path transform={`translate(${x} ${y})`} fill="#fff" stroke={INK} strokeWidth="1.3" strokeLinejoin="round"
    d="M-3.5 3.5A3.5 3.5 0 0 1 3.5 3.5V10L10 11.5Q13 12.2 12.6 15.2L11.8 20.5Q11.2 24 7.8 24H2Q-.2 24-1.6 22.2L-6.6 15.8Q-7.6 14.2-6 13.2-4.6 12.4-3.5 13.6Z" />
);

/**
 * Page „Startort“ of „Vor Ort“ in two pictures instead of sentences (Jan 19.11.): tap a spot, then drag the boat to
 * where one goes onto the water. The picture of what is to do now carries the accent, a done one the tick.
 */
export function StartSketch({ picked, radiusKm, only }: { picked: boolean; radiusKm: number; only?: 0 | 1 }) {
  const panes = [
    {
      head: 'Spot antippen', text: 'auf der Karte oder in der Liste', state: picked ? 'done' : 'now',
      art: (
        <>
          <rect width="150" height="96" fill={SEA} />
          <path d="M0 96V70c22-7 44 3 70-2s48-9 80-3v31z" fill={LAND} stroke={SHORE} strokeWidth="1.2" />
          <circle cx="26" cy="68" r="5" fill={MUTED} stroke="#fff" strokeWidth="2" />
          <circle cx="126" cy="65" r="5" fill={MUTED} stroke="#fff" strokeWidth="2" />
          <circle cx="78" cy="66" r="13" fill="none" stroke={ACC} strokeWidth="1.6" opacity="0.55" />
          <circle cx="78" cy="66" r="6.5" fill={ACC} stroke="#fff" strokeWidth="2" />
          <Hand x={80} y={69} />
        </>
      ),
    },
    {
      head: 'Boot ziehen', text: `dorthin, wo du aufs Wasser gehst`, state: picked ? 'now' : 'next',
      art: (
        <>
          <rect width="150" height="96" fill={SEA} />
          <circle cx="46" cy="76" r="62" fill="none" stroke={ACC} strokeWidth="1.6" strokeDasharray="4 5" />
          <path d="M0 96V77c20-6 40 4 62 0s52-10 88-5v24z" fill={LAND} stroke={SHORE} strokeWidth="1.2" />
          <circle cx="46" cy="77" r="6" fill={ACC} stroke="#fff" strokeWidth="2" />
          <g opacity="0.3"><Boat x={58} y={58} /></g>
          <g stroke={ACC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M70 52q5-8 12-11" /><path d="M75.1 40.1 82 41l-4.1 5.5" />
          </g>
          <Boat x={96} y={40} />
          <Hand x={100} y={44} />
          <text x="94" y="15" style={TXT} fill={ACC}>≤ {radiusKm} km</text>
        </>
      ),
    },
  ] as const;
  return (
    <ol className={`sw-wz-sketch${only != null ? ' is-one' : ''}`} aria-label="So wählst du den Startort">
      {panes.map((p, i) => only != null && only !== i ? null : (
        <li key={p.head} className={`is-${p.state}`} aria-current={p.state === 'now' ? 'step' : undefined}>
          <span className="sw-wz-skimg"><svg viewBox="0 0 150 96" aria-hidden="true">{p.art}</svg></span>
          <span className="sw-wz-skcap">
            <i aria-hidden="true">{p.state === 'done' ? '✓' : i + 1}</i>
            <span><strong>{p.head}</strong>{p.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function SeaTripSwitch({ mode, onMode }: { mode: TripMode; onMode: (m: TripMode) => void }) {
  return (
    <div className="sw-wz-arts" role="group" aria-label="Art der Ausfahrt">
      {WIZ_MODE_CHOICES.map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} className={`sw-wz-art${mode === m ? ' is-active' : ''}`} onClick={() => { if (m !== mode) onMode(m); }}>
          <span className="sw-wz-art-sk"><svg viewBox="0 0 240 120" aria-hidden="true">{MODE_SKETCH[m]}</svg></span>
          <span className="sw-wz-art-head"><strong>{TRIP_MODE_LABEL[m]}</strong>{mode === m && <Check />}</span>
          <span className="sw-wz-art-what">{TRIP_MODE_WHAT[m]}</span>
          <span className="sw-wz-art-row"><b>{WIZ_MODE_GIVE}</b>{WIZ_MODE_GUIDE[m].give}</span>
          <span className="sw-wz-art-row"><b>{WIZ_MODE_GET}</b>{WIZ_MODE_GUIDE[m].get}</span>
          <span className="sw-wz-art-row"><b>{WIZ_MODE_FITS}</b>{WIZ_MODE_GUIDE[m].fits}</span>
        </button>
      ))}
    </div>
  );
}
