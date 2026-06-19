/**
 * Bewegungsarten (Tier 0 / MVP) für „Wetter entlang der Route".
 *
 * Acht Modi mit je eigenem Geschwindigkeitsmodell. Fuß-Sportarten nutzen ein
 * additives Modell (Flachtempo + Steig-/Abstiegsleistung), Rad-Sportarten ein
 * steigungsabhängiges Modell (Flachtempo + Bergfitness + Abfahrts-Limit).
 * Siehe speedModel.ts. Jede Art liefert ein Default-Profil + Slider-Bereiche.
 */

import type { ReactNode } from 'react';
import type { MovementCategory, SpeedProfile } from './speedModel';

export type MovementId =
  | 'wandern' | 'bergwandern' | 'jogging' | 'trail'
  | 'rennrad' | 'gravel' | 'mtb' | 'ebike';

export interface Range { min: number; max: number; }

export interface MovementType {
  id: MovementId;
  label: string;
  category: MovementCategory;
  blurb: string;
  icon: ReactNode;
  defaults: SpeedProfile;
  flatSpeed: Range;
  /** Fuß: Steig-/Abstiegsleistung (Hm/h). */
  ascentRate?: Range;
  descentRate?: Range;
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className="mv-icon" viewBox="0 0 32 32" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

// --- Fuß-Icons ---
const WalkIcon = (
  <Svg>
    <circle cx="15" cy="6.5" r="2.4" />
    <path d="M15 9 L15 18 L12 25 M15 18 L19 23" />
    <path d="M15 12 L19 15" />
    <path d="M21 8 L22 25" />
  </Svg>
);
const MountainIcon = (
  <Svg>
    <path d="M3 25 L12 11 L17 18 L22 9 L29 25 Z" />
    <path d="M22 9 L22 5 L25 6 L22 7" />
  </Svg>
);
const RunIcon = (
  <Svg>
    <circle cx="18" cy="6.5" r="2.4" />
    <path d="M18 9 L14 16 L18 23 M14 16 L10 21" />
    <path d="M16 11 L21 10 M15 13 L11 15" />
  </Svg>
);
const TrailRunIcon = (
  <Svg>
    <circle cx="18" cy="6" r="2.2" />
    <path d="M18 8.5 L14 15 L18 21 M14 15 L10 19" />
    <path d="M16 10.5 L21 9.5 M15 12.5 L11 14" />
    <path d="M3 27 Q9 23 15 27 T27 27" />
  </Svg>
);

// --- Rad-Icons (gemeinsames Grundgerüst + Unterscheidungsmerkmal) ---
function BikeBase({ extra }: { extra?: ReactNode }) {
  return (
    <Svg>
      <circle cx="9" cy="23" r="4.6" />
      <circle cx="23" cy="23" r="4.6" />
      <path d="M9 23 L15 23 L13 12 L21 13 L23 23 M15 23 L21 13" />
      {extra}
    </Svg>
  );
}
const RoadBikeIcon = <BikeBase extra={<path d="M21 13 q3 0 2.4 2.6" />} />;
const GravelBikeIcon = <BikeBase extra={<><path d="M19.5 12 H23" /><circle cx="7" cy="29.5" r="0.6" /><circle cx="11" cy="29.5" r="0.6" /><circle cx="21" cy="29.5" r="0.6" /></>} />;
const MtbIcon = <BikeBase extra={<><path d="M19.5 12 H22.5" /><path d="M22 14 L24 22" /></>} />;
const EbikeIcon = <BikeBase extra={<><path d="M19.5 12 H23" /><path d="M16.5 14 L13.5 19 L15.5 19 L13 23.5" /></>} />;

export const MOVEMENT_TYPES: MovementType[] = [
  {
    id: 'wandern', label: 'Wandern', category: 'foot', blurb: 'T1–T2, einfache Wege', icon: WalkIcon,
    defaults: profile({ flat: 4.5, ascent: 350, descent: 500 }),
    flatSpeed: { min: 3, max: 6 }, ascentRate: { min: 250, max: 500 }, descentRate: { min: 350, max: 700 },
  },
  {
    id: 'bergwandern', label: 'Bergwandern', category: 'foot', blurb: 'T3, alpine Steige', icon: MountainIcon,
    defaults: profile({ flat: 3.5, ascent: 300, descent: 400 }),
    flatSpeed: { min: 2.5, max: 5 }, ascentRate: { min: 200, max: 450 }, descentRate: { min: 300, max: 600 },
  },
  {
    id: 'jogging', label: 'Jogging', category: 'foot', blurb: 'Straßenlauf', icon: RunIcon,
    defaults: profile({ flat: 9, ascent: 600, descent: 650 }),
    flatSpeed: { min: 6, max: 14 }, ascentRate: { min: 400, max: 900 }, descentRate: { min: 400, max: 950 },
  },
  {
    id: 'trail', label: 'Trail-Running', category: 'foot', blurb: 'Laufen im Gelände', icon: TrailRunIcon,
    defaults: profile({ flat: 8, ascent: 500, descent: 600 }),
    flatSpeed: { min: 5, max: 13 }, ascentRate: { min: 350, max: 800 }, descentRate: { min: 350, max: 900 },
  },
  {
    id: 'rennrad', label: 'Rennrad', category: 'bike', blurb: 'Asphalt, schnell', icon: RoadBikeIcon,
    defaults: profile({ flat: 26, climb: 3, maxDown: 60 }),
    flatSpeed: { min: 18, max: 40 },
  },
  {
    id: 'gravel', label: 'Gravel', category: 'bike', blurb: 'Schotter & Asphalt', icon: GravelBikeIcon,
    defaults: profile({ flat: 20, climb: 3, maxDown: 50 }),
    flatSpeed: { min: 14, max: 32 },
  },
  {
    id: 'mtb', label: 'MTB Cross-Country', category: 'bike', blurb: 'Cross-Country', icon: MtbIcon,
    defaults: profile({ flat: 15, climb: 3, maxDown: 45 }),
    flatSpeed: { min: 9, max: 26 },
  },
  {
    id: 'ebike', label: 'E-Bike Trekking', category: 'bike', blurb: 'Motor bis 25 km/h', icon: EbikeIcon,
    defaults: profile({ flat: 23, climb: 4, maxDown: 45 }),
    flatSpeed: { min: 15, max: 25 },
  },
];

export function getMovementType(id: MovementId): MovementType {
  return MOVEMENT_TYPES.find((m) => m.id === id)!;
}

/** Bequemer Default-Profil-Builder. */
function profile(p: { flat: number; ascent?: number; descent?: number; climb?: number; maxDown?: number }): SpeedProfile {
  return {
    flatSpeedKmh: p.flat,
    ascentRateMh: p.ascent ?? 400,
    descentRateMh: p.descent ?? 500,
    climbStrength: p.climb ?? 3,
    maxDownhillKmh: p.maxDown ?? 50,
    paceFactor: 1,
  };
}
