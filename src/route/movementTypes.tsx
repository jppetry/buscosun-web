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

/* Icon-Formen exakt aus references/routenplaner.dc.html (24er viewBox, 1.7 stroke). */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className="mv-icon" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

// --- Fuß-Icons ---
const WalkIcon = (
  <Svg>
    <circle cx="13" cy="4" r="1.8" />
    <path d="M13 7 L10 12 L14 14 L15 20 M10 12 L6 13 M14 14 L11 11 L15 9 L18 11" />
  </Svg>
);
const MountainIcon = (
  <Svg>
    <path d="M3 20 L10 8 L14 14 L17 9 L21 20 Z" />
    <path d="M17 9 L17 5 L20 6 L17 7" />
  </Svg>
);
const RunIcon = (
  <Svg>
    <circle cx="15" cy="4.5" r="1.8" />
    <path d="M15 7 L11 11 L14 14 L13 20 M11 11 L7 12 M14 14 L17 12" />
  </Svg>
);
const TrailRunIcon = (
  <Svg>
    <path d="M4 20 L9 5 L13 18 M11 12 L16 4 L20 20" />
  </Svg>
);

// --- Rad-Icons (gemeinsames Grundgerüst aus der Vorlage + Unterscheidungsmerkmal) ---
function BikeBase({ topBar, extra }: { topBar?: boolean; extra?: ReactNode }) {
  return (
    <Svg>
      <circle cx="5.5" cy="17" r="3.5" />
      <circle cx="18.5" cy="17" r="3.5" />
      <path d="M5.5 17 L9 8 H13 M12 8 L15.5 17" />
      {topBar && <path d="M9.5 8 H15" />}
      {extra}
    </Svg>
  );
}
const RoadBikeIcon = <BikeBase topBar />;
const GravelBikeIcon = <BikeBase extra={<path d="M18.5 17 L17 11" />} />;
const MtbIcon = <BikeBase />;
const EbikeIcon = <BikeBase extra={<path d="M13 4 L11 8 h3 l-1.5 3.5" />} />;

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
