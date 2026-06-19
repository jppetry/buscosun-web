/**
 * Route-Icon-Set — feine Line-Icons im buscosun-Stil (Design-System v1.8),
 * passend zu ../event/eventIcons und ../radar/radarIcons. 24er-viewBox,
 * `currentColor` (erbt die Umgebungsfarbe → Ink, Terracotta-Akzent, Weiß auf
 * dunklen Pills), runde Enden. Ersetzt sämtliche Emojis im Routenplaner.
 */

import type { SVGProps } from 'react';

type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>;

function Ico({ size = 18, strokeWidth = 1.7, children, ...rest }: IconProps & { children: React.ReactNode }) {
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

/* ---------------- Wetter / Phänomene ---------------- */
export const IconWind = (p: IconProps) => (<Ico {...p}><path d="M3 9h9.5a2.5 2.5 0 1 0-2.5-2.5" /><path d="M3 14h12a2.5 2.5 0 1 1-2.5 2.5" /><path d="M3 19h6.5" /></Ico>);
export const IconWarning = (p: IconProps) => (<Ico {...p}><path d="M12 3.5l9 15.5H3Z" /><path d="M12 10v4.2" /><circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none" /></Ico>);
export const IconSun = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="12" r="4.3" /><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" /></Ico>);
export const IconThermometer = (p: IconProps) => (<Ico {...p}><path d="M10 13.7V5a2 2 0 0 1 4 0v8.7a3.6 3.6 0 1 1-4 0Z" /><circle cx="12" cy="16.6" r="1.2" fill="currentColor" stroke="none" /></Ico>);
export const IconDrop = (p: IconProps) => (<Ico {...p}><path d="M12 3.5c-3.2 4.3-5 6.5-5 9.3a5 5 0 0 0 10 0c0-2.8-1.8-5-5-9.3Z" /></Ico>);
export const IconCompass = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5Z" /></Ico>);
export const IconSnowflake = (p: IconProps) => (<Ico {...p}><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5L4.2 16.5" /><path d="M12 6.4l2-1.4M12 6.4l-2-1.4M12 17.6l2 1.4M12 17.6l-2 1.4M5.8 9.2l-.3 2.3M18.2 9.2l.3 2.3M18.2 14.8l.3-2.3M5.8 14.8l-.3-2.3" strokeWidth="1.4" /></Ico>);

/* ---------------- Pausen ---------------- */
export const IconFork = (p: IconProps) => (<Ico {...p}><path d="M7 3v6a2 2 0 0 0 4 0V3M9 3v18" /><path d="M16 3c-1.6 0-2.5 1.6-2.5 4.5S14.4 12 16 12v9" /></Ico>);
export const IconCoffee = (p: IconProps) => (<Ico {...p}><path d="M4 9h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" /><path d="M16 10h2.2a2.2 2.2 0 1 1 0 4.4H16" /><path d="M7 3.5c-.5.8-.5 1.5 0 2.3M11 3.5c-.5.8-.5 1.5 0 2.3" strokeWidth="1.4" /></Ico>);

/* ---------------- Zeit-Scrubber / Controls ---------------- */
export const IconPlay = (p: IconProps) => (<Ico {...p}><path d="M8 5.6v12.8l10.5-6.4Z" fill="currentColor" stroke="none" /></Ico>);
export const IconPause = (p: IconProps) => (<Ico {...p}><rect x="7" y="5.5" width="3.4" height="13" rx="1.1" fill="currentColor" stroke="none" /><rect x="13.6" y="5.5" width="3.4" height="13" rx="1.1" fill="currentColor" stroke="none" /></Ico>);
export const IconStepBack = (p: IconProps) => (<Ico {...p}><path d="M15 6l-7 6 7 6Z" fill="currentColor" stroke="none" /></Ico>);
export const IconStepForward = (p: IconProps) => (<Ico {...p}><path d="M9 6l7 6-7 6Z" fill="currentColor" stroke="none" /></Ico>);
export const IconLoop = (p: IconProps) => (<Ico {...p}><path d="M4.5 9.2a7.5 7.5 0 0 1 12.8-2.7" /><path d="M17.5 3.2v3.6H14" /><path d="M19.5 14.8a7.5 7.5 0 0 1-12.8 2.7" /><path d="M6.5 20.8v-3.6H10" /></Ico>);

/* ---------------- Status / Verlässlichkeit ---------------- */
export const IconCheck = (p: IconProps) => (<Ico {...p}><path d="M5 12.5l4.2 4.2L19 7" /></Ico>);
export const IconCheckCircle = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8 12.3l2.6 2.6L16 9" /></Ico>);
export const IconApprox = (p: IconProps) => (<Ico {...p}><path d="M3.5 10c1.4-1.8 2.9-1.8 4.3 0s2.9 1.8 4.3 0 2.9-1.8 4.3 0" /><path d="M3.5 15c1.4-1.8 2.9-1.8 4.3 0s2.9 1.8 4.3 0 2.9-1.8 4.3 0" /></Ico>);
export const IconBulb = (p: IconProps) => (<Ico {...p}><path d="M9 16.5a5 5 0 1 1 6 0c-.6.5-1 1-1 1.8h-4c0-.8-.4-1.3-1-1.8Z" /><path d="M10 19.5h4M10.6 21.5h2.8" /></Ico>);

/* ---------------- Navigation / Aktionen ---------------- */
export const IconArrowRight = (p: IconProps) => (<Ico {...p}><path d="M4 12h15" /><path d="M13 6l6 6-6 6" /></Ico>);
export const IconArrowLeft = (p: IconProps) => (<Ico {...p}><path d="M20 12H5" /><path d="M11 6l-6 6 6 6" /></Ico>);
export const IconCalendar = (p: IconProps) => (<Ico {...p}><rect x="4" y="5" width="16" height="16" rx="2.5" /><path d="M4 9.5h16M8.5 3v4M15.5 3v4" /></Ico>);
export const IconBookmark = (p: IconProps) => (<Ico {...p}><path d="M6 4h12v17l-6-4.2L6 21Z" /></Ico>);
export const IconRoute = (p: IconProps) => (<Ico {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8 16.5c6-1 8-4 8-8M9 19h6.5a3 3 0 0 0 0-6H11" strokeWidth="1.4" /></Ico>);
