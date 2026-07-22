/**
 * Event-Icon-Set — feine Line-Icons im buscosun-Stil (statt Emojis).
 * Einheitlich: 24er-viewBox, `currentColor`-Stroke (erbt die Textfarbe der
 * Umgebung → Ink in Kacheln, Akzentfarbe in Warnkarten), runde Enden.
 */

import type { SVGProps } from 'react';

type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>;

function Ico({ size = 22, strokeWidth = 1.7, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth as number} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" {...rest}
    >
      {children}
    </svg>
  );
}

/* ---------------- Aktivitäten ---------------- */
export const IconHiking = (p: IconProps) => (<Ico {...p}><path d="M3 20h18" /><path d="M5 20l5.5-11 3.5 6 2-3.5L21 20" /><path d="M10.5 9l1.2-2.2" /></Ico>);
export const IconBike = (p: IconProps) => (<Ico {...p}><circle cx="6" cy="16" r="3.2" /><circle cx="18" cy="16" r="3.2" /><path d="M6 16l4-7h4.2" /><path d="M10 9l4.2 7" /><path d="M14.2 9l1.6-2h2.2" /></Ico>);
export const IconGrill = (p: IconProps) => (<Ico {...p}><path d="M12 2.5c-3.2 4-4.6 6-4.6 9.4A4.6 4.6 0 0 0 16.6 12c0-2.6-1.5-4.4-2.7-6.2-.7 1.8-1.8 2.1-2.6 1.2-.7-.9.3-2.4.7-4.5Z" /></Ico>);
export const IconCamera = (p: IconProps) => (<Ico {...p}><rect x="3" y="7.5" width="18" height="12.5" rx="2.6" /><circle cx="12" cy="13.8" r="3.3" /><path d="M8.5 7.5l1.3-2.3h4.4l1.3 2.3" /></Ico>);
export const IconPicnic = (p: IconProps) => (<Ico {...p}><path d="M4 10h16l-1.4 9a1 1 0 0 1-1 .9H6.4a1 1 0 0 1-1-.9Z" /><path d="M7 10a5 5 0 0 1 10 0" /><path d="M4.4 13.5h15.2" /></Ico>);
export const IconRun = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="14" r="7.2" /><path d="M12 14l3-2.2" /><path d="M12 6.8V4M10 4h4M18.4 8l1.4-1.4" strokeWidth="1.5" /></Ico>);
export const IconSwim = (p: IconProps) => (<Ico {...p}><path d="M3 13.5c1.8-1.8 3.4-1.8 5.2 0s3.4 1.8 5.2 0 3.4-1.8 5.2 0" /><path d="M3 18c1.8-1.8 3.4-1.8 5.2 0s3.4 1.8 5.2 0 3.4-1.8 5.2 0" /><circle cx="16.5" cy="7" r="2.4" /></Ico>);
export const IconStars = (p: IconProps) => (<Ico {...p}><path d="M11 3.5l1.4 3.9 3.9 1.4-3.9 1.4L11 14l-1.4-3.8-3.9-1.4 3.9-1.4Z" /><path d="M17.5 14l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z" /></Ico>);
export const IconSparkle = (p: IconProps) => (<Ico {...p}><path d="M12 3l1.7 5.6L19 10l-5.3 1.4L12 17l-1.7-5.6L5 10l5.3-1.4Z" /></Ico>);
export const IconRing = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="15" r="5" /><path d="M9.4 10.4L12 5l2.6 5.4" /><path d="M9.6 10.5h4.8" /></Ico>);
export const IconTelescope = (p: IconProps) => (<Ico {...p}><path d="M3 15.6l9.5-3.8 1.5 3.7-9.5 3.8Z" /><path d="M11.5 11l4.6-1.8 1.5 3.7-4.6 1.8" /><path d="M6.5 18.5L8 22M13 16l1.4 4" /></Ico>);

/* ---------------- Wetter / Status ---------------- */
export const IconSun = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="12" r="4.3" /><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" /></Ico>);
export const IconRain = (p: IconProps) => (<Ico {...p}><path d="M7 15.5a4 4 0 0 1 .4-8 5 5 0 0 1 9.5 1.4 3.6 3.6 0 0 1-1.2 6.6" /><path d="M8.5 18v2.2M12 18v2.6M15.5 18v2.2" /></Ico>);
export const IconWind = (p: IconProps) => (<Ico {...p}><path d="M3 9h9.5a2.5 2.5 0 1 0-2.5-2.5" /><path d="M3 14h12a2.5 2.5 0 1 1-2.5 2.5" /><path d="M3 19h6.5" /></Ico>);
export const IconThermometer = (p: IconProps) => (<Ico {...p}><path d="M10 13.7V5a2 2 0 0 1 4 0v8.7a3.6 3.6 0 1 1-4 0Z" /><circle cx="12" cy="16.6" r="1.2" fill="currentColor" stroke="none" /><path d="M14 8h2M14 11h2" strokeWidth="1.4" /></Ico>);
export const IconSnow = (p: IconProps) => (<Ico {...p}><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5L4.2 16.5" /><path d="M12 6.4l2-1.4M12 6.4l-2-1.4M12 17.6l2 1.4M12 17.6l-2 1.4M5.8 9.2l-.3 2.3M18.2 9.2l.3 2.3M18.2 14.8l.3-2.3M5.8 14.8l-.3-2.3" strokeWidth="1.4" /></Ico>);
export const IconWarning = (p: IconProps) => (<Ico {...p}><path d="M12 3.5l9 15.5H3Z" /><path d="M12 10v4.2" /><circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none" /></Ico>);
export const IconCheck = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8 12.3l2.6 2.6L16 9" /></Ico>);
export const IconBell = (p: IconProps) => (<Ico {...p}><path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.4 2.3H4.6Z" /><path d="M9.8 18.8a2.2 2.2 0 0 0 4.4 0" /></Ico>);
export const IconArrowUpRight = (p: IconProps) => (<Ico {...p}><path d="M7 17L17 7" /><path d="M9 7h8v8" /></Ico>);
export const IconPin = (p: IconProps) => (<Ico {...p}><path d="M12 21.5s6-5.6 6-10.2A6 6 0 0 0 6 11.3c0 4.6 6 10.2 6 10.2Z" /><circle cx="12" cy="11" r="2.2" /></Ico>);
export const IconClock = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Ico>);
export const IconSliders = (p: IconProps) => (<Ico {...p}><path d="M4 7h9M17 7h3" /><circle cx="15" cy="7" r="2.2" /><path d="M4 12h3M11 12h9" /><circle cx="9" cy="12" r="2.2" /><path d="M4 17h7M15 17h5" /><circle cx="13" cy="17" r="2.2" /></Ico>);
export const IconReset = (p: IconProps) => (<Ico {...p}><path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4" /><path d="M4 4.5V8h3.5" /></Ico>);
export const IconChevron = (p: IconProps) => (<Ico {...p}><path d="M6 9l6 6 6-6" /></Ico>);

/* ---------------- Foto / Astro ---------------- */
export const IconSunrise = (p: IconProps) => (<Ico {...p}><path d="M3 18.5h18" /><path d="M7 18.5a5 5 0 0 1 10 0" /><path d="M12 3v5M9.5 6.5L12 4l2.5 2.5" /><path d="M3.5 14h2M18.5 14h2" strokeWidth="1.4" /></Ico>);
export const IconSunset = (p: IconProps) => (<Ico {...p}><path d="M3 18.5h18" /><path d="M7 18.5a5 5 0 0 1 10 0" /><path d="M12 8V3M9.5 5.5L12 8l2.5-2.5" /><path d="M3.5 14h2M18.5 14h2" strokeWidth="1.4" /></Ico>);
export const IconFog = (p: IconProps) => (<Ico {...p}><path d="M4 8h15" /><path d="M3 12h18" /><path d="M5 16h14" /><path d="M4 20h13" /></Ico>);
export const IconCloud = (p: IconProps) => (<Ico {...p}><path d="M7 18a4.5 4.5 0 0 1-.4-9 5.5 5.5 0 0 1 10.6 1.3A3.8 3.8 0 0 1 16.5 18Z" /></Ico>);
export const IconMoon = (p: IconProps) => (<Ico {...p}><path d="M20.5 14.5A8.5 8.5 0 1 1 10 4a6.7 6.7 0 0 0 10.5 10.5Z" /></Ico>);
export const IconDrop = (p: IconProps) => (<Ico {...p}><path d="M12 3.5c-3.2 4.3-5 6.5-5 9.3a5 5 0 0 0 10 0c0-2.8-1.8-5-5-9.3Z" /></Ico>);
export const IconCity = (p: IconProps) => (<Ico {...p}><path d="M3 21h18" /><path d="M5 21V10l5-2.5V21" /><path d="M13 21V6l6 3.2V21" /><path d="M7.4 12.5v0M7.4 15.5v0M15.6 11.5v0M15.6 14.5v0" strokeWidth="1.6" /></Ico>);
export const IconLamp = (p: IconProps) => (<Ico {...p}><path d="M9 16.5a5 5 0 1 1 6 0c-.6.5-1 1-1 1.8h-4c0-.8-.4-1.3-1-1.8Z" /><path d="M10 19.5h4M10.6 21.5h2.8" /></Ico>);

/**
 * Vorlagen-getreue Anlass-Icons (Command-Deck-Event, eventplaner.dc.html).
 * Diese Varianten übernehmen die SVG-Pfade der Vorlage 1:1, damit die
 * Kachel-Icons pixelnah sitzen. `fill="none"` + currentColor-Stroke.
 */
export const IconDeckGrill = (p: IconProps) => (<Ico {...p} strokeLinecap="round"><path d="M12 21 C7.5 21 5 17.8 5 14.5 C5 11 8 9 8.5 5.5 C11 8 10.5 10 11 11 C11.5 8.5 13 7 12.5 3 C16 5.5 19 9.5 19 14.5 C19 17.8 16.5 21 12 21 Z" /></Ico>);
export const IconDeckRing = (p: IconProps) => (<svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><circle cx="8.5" cy="13" r="4.5" /><circle cx="15.5" cy="13" r="4.5" /></svg>);
export const IconDeckMountains = (p: IconProps) => (<svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden="true"><path d="M3 20 L9 8 L13 14 L16 9 L21 20 Z" /></svg>);
export const IconDeckDrone = (p: IconProps) => (<svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><circle cx="12" cy="12" r="2.5" /><g strokeWidth={1.4}><ellipse cx="6" cy="7" rx="3" ry="1.6" /><ellipse cx="18" cy="7" rx="3" ry="1.6" /><ellipse cx="6" cy="17" rx="3" ry="1.6" /><ellipse cx="18" cy="17" rx="3" ry="1.6" /></g></svg>);
export const IconDeckCamera = (p: IconProps) => (<svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden="true"><path d="M4 8 H7 L9 5.5 H15 L17 8 H20 A1 1 0 0 1 21 9 V18 A1 1 0 0 1 20 19 H4 A1 1 0 0 1 3 18 V9 A1 1 0 0 1 4 8 Z" /><circle cx="12" cy="13" r="3.5" /></svg>);
export const IconDeckStar = (p: IconProps) => (<svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" aria-hidden="true"><path d="M12 3 L13.6 8.4 L19 8.6 L14.7 12 L16.2 17.4 L12 14.2 L7.8 17.4 L9.3 12 L5 8.6 L10.4 8.4 Z" /></svg>);

/* ---------------- Command-Deck-Chrome (Rail · Bottom-Nav · Aktionen) ----------------
   Vorlagen-getreue SVGs aus eventplaner.dc.html. Eigene <svg>, damit Stroke-Breiten
   und fill exakt der Vorlage entsprechen (unabhängig vom feinen Ico-Set oben). */
function Raw({ size = 21, sw = 1.6, children, ...rest }: { size?: number; sw?: number; children: React.ReactNode } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>{children}</svg>;
}
export const IconDeckMap = (p: { size?: number }) => (<Raw size={p.size}><path d="M12 3 L21 8 L12 13 L3 8 Z" /><path d="M3 13 L12 18 L21 13" /></Raw>);
export const IconDeckRadar = (p: { size?: number }) => (<Raw size={p.size} sw={1.5}><circle cx="12" cy="12" r="9" /><path d="M12 3 A9 9 0 0 1 21 12" /><path d="M12 12 L19.5 7" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></Raw>);
export const IconDeckEvent = (p: { size?: number }) => (<Raw size={p.size}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><line x1="3.5" y1="9.5" x2="20.5" y2="9.5" /><line x1="8" y1="3" x2="8" y2="6.5" /><line x1="16" y1="3" x2="16" y2="6.5" /><path d="M8 14 L11 17 L16.5 12" /></Raw>);
export const IconDeckEventPlain = (p: { size?: number }) => (<Raw size={p.size}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><line x1="3.5" y1="9.5" x2="20.5" y2="9.5" /><path d="M8 14 L11 17 L16.5 12" /></Raw>);
export const IconDeckTour = (p: { size?: number }) => (<Raw size={p.size ?? 20} sw={1.5}><path d="M6 20 C6 20 5 13.5 9 11.5 C13 9.5 12 6.5 16 5.5" /><circle cx="6" cy="20" r="1.8" fill="currentColor" stroke="none" /><path d="M16 2.5 C14 2.5 12.4 4.1 12.4 6.1 C12.4 8.8 16 11.5 16 11.5 C16 11.5 19.6 8.8 19.6 6.1 C19.6 4.1 18 2.5 16 2.5 Z" strokeWidth={1.3} /><circle cx="16" cy="6.1" r="1.3" fill="currentColor" stroke="none" /></Raw>);
export const IconDeckGear = (p: { size?: number }) => (<Raw size={p.size ?? 20} sw={1.5}><circle cx="12" cy="12" r="3" /><path d="M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.2 5.2 L7 7 M17 17 L18.8 18.8 M18.8 5.2 L17 7 M7 17 L5.2 18.8" /></Raw>);
export const IconDeckStarNav = (p: { size?: number }) => (<Raw size={p.size ?? 21} sw={1.4}><path d="M12 4 L14.3 9.2 L20 9.7 L15.7 13.5 L17 19 L12 16 L7 19 L8.3 13.5 L4 9.7 L9.7 9.2 Z" /></Raw>);
export const IconDeckSearch = (p: { size?: number }) => (<svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth={1.6} /><line x1="12.5" y1="12.5" x2="16" y2="16" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" /></svg>);
export const IconDeckPin = (p: { size?: number }) => (<Raw size={p.size ?? 14} sw={1.5}><path d="M12 21 C12 21 19 14.5 19 9.5 A7 7 0 0 0 5 9.5 C5 14.5 12 21 12 21 Z" /><circle cx="12" cy="9.5" r="2.4" /></Raw>);
export const IconDeckArrowRight = (p: { size?: number }) => (<Raw size={p.size ?? 16} sw={1.8}><path d="M5 12 H19 M13 6 L19 12 L13 18" /></Raw>);
export const IconDeckChevLeft = (p: { size?: number }) => (<Raw size={p.size ?? 17} sw={1.9}><path d="M15 5 L8 12 L15 19" /></Raw>);
export const IconDeckPlus = (p: { size?: number }) => (<Raw size={p.size ?? 15} sw={1.8}><path d="M12 5 V19 M5 12 H19" /></Raw>);
export const IconDeckCalendar = (p: { size?: number }) => (<Raw size={p.size ?? 15} sw={1.5}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><line x1="3.5" y1="9.5" x2="20.5" y2="9.5" /></Raw>);
export const IconDeckShare = (p: { size?: number }) => (<Raw size={p.size ?? 14} sw={1.8}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /></Raw>);
export const IconDeckBell = (p: { size?: number }) => (<Raw size={p.size ?? 17} sw={1.6}><path d="M12 3 A6 6 0 0 1 18 9 V13 L20 16 H4 L6 13 V9 A6 6 0 0 1 12 3 Z" /><path d="M9.5 19 A2.5 2.5 0 0 0 14.5 19" /></Raw>);
export const IconDeckHouse = (p: { size?: number }) => (<Raw size={p.size ?? 20} sw={1.5}><path d="M6 11 L12 5.5 L18 11 V19 A1 1 0 0 1 17 20 H7 A1 1 0 0 1 6 19 Z" /><path d="M9.5 20 V14.5 H14.5 V20" /></Raw>);
export const IconDeckSun = (p: { size?: number }) => (<Raw size={p.size ?? 20} sw={1.5}><circle cx="12" cy="12" r="5.5" /><path d="M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.5 5.5 L7 7 M17 17 L18.5 18.5" /></Raw>);
export const IconDeckStorm = (p: { size?: number }) => (<Raw size={p.size ?? 20} sw={1.5}><path d="M7 16 A4.4 4.4 0 0 1 8 7.6 A5.6 5.6 0 0 1 18.4 10 A3.4 3.4 0 0 1 17.8 16.5 H8 A4.4 4.4 0 0 1 7 16 Z" /><path d="M12.5 13 L10 17 H12 L11.2 20.5 L14 15.5 H12 Z" /></Raw>);

/* ---------------- Dispatcher ---------------- */
const ACTIVITY_ICONS: Record<string, (p: IconProps) => React.JSX.Element> = {
  wedding: IconRing,
  hiking: IconHiking, cycling: IconBike, bbq: IconGrill, photo: IconCamera,
  picnic: IconPicnic, running: IconRun, swimming: IconSwim, stargazing: IconStars,
  drone: IconBike, custom: IconSparkle,
};

/** Vorlagen-getreue Kachel-Icons (Command-Deck-Event) — sonst Fallback aufs feine Set. */
const DECK_ACTIVITY_ICONS: Record<string, (p: IconProps) => React.JSX.Element> = {
  bbq: IconDeckGrill, wedding: IconDeckRing, hiking: IconDeckMountains,
  drone: IconDeckDrone, photo: IconDeckCamera, stargazing: IconDeckStar,
  cycling: IconBike, picnic: IconPicnic, running: IconRun, swimming: IconSwim,
  custom: IconSparkle,
};
export function DeckActivityIcon({ id, size }: { id: string; size?: number }) {
  const C = DECK_ACTIVITY_ICONS[id] ?? IconSparkle;
  return <C size={size} />;
}
export function ActivityIcon({ id, size }: { id: string; size?: number }) {
  const C = ACTIVITY_ICONS[id] ?? IconSparkle;
  return <C size={size} />;
}

const VENUE_ICONS: Record<string, (p: IconProps) => React.JSX.Element> = {
  tent: IconTent, indoor: IconHouse, shelter: IconUmbrella, none: IconBell,
};
export function VenueIcon({ id, size }: { id: string; size?: number }) {
  const C = VENUE_ICONS[id] ?? IconTent;
  return <C size={size} />;
}

/* Venue-spezifisch */
export function IconTent(p: IconProps) { return (<Ico {...p}><path d="M12 4L3 20h18Z" /><path d="M12 4v16" /><path d="M12 20l4-6 5 6" /></Ico>); }
export function IconHouse(p: IconProps) { return (<Ico {...p}><path d="M4 11l8-6 8 6" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></Ico>); }
export function IconUmbrella(p: IconProps) { return (<Ico {...p}><path d="M3.5 12a8.5 8.5 0 0 1 17 0Z" /><path d="M12 12v6.5a2 2 0 0 0 4 0" /></Ico>); }
