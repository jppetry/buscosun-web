/**
 * Radar-Icon-Set — feine Line-Icons im buscosun-Stil (Design-System v1.8),
 * passend zu {@link ../event/eventIcons}. Einheitlich: 24er-viewBox,
 * `currentColor` (erbt die Textfarbe → Ink in hellen Chips, Weiß auf aktiven/
 * dunklen Pills, Steel im Daten-„An"-Zustand), runde Enden.
 *
 * Ersetzt sämtliche Emojis im Regenradar-Panel (Presets, Layer, Zeitachse,
 * Punkt-Streifen, Karten-Overlays) durch maßstabsgetreue Vektor-Glyphen.
 */

import type { SVGProps } from 'react';
import type { RadarLayerId } from './radarModel';

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

/* ---------------- Wetter / Layer ---------------- */
export const IconRain = (p: IconProps) => (<Ico {...p}><path d="M7 15.5a4 4 0 0 1 .4-8 5 5 0 0 1 9.5 1.4 3.6 3.6 0 0 1-1.2 6.6" /><path d="M8.5 18v2.2M12 18.5v2.6M15.5 18v2.2" /></Ico>);
export const IconStormCloud = (p: IconProps) => (<Ico {...p}><path d="M7 14.5a4 4 0 0 1 .4-8 5 5 0 0 1 9.5 1.4 3.6 3.6 0 0 1-1.2 6.6" /><path d="M12.5 12.5l-2.4 3.8h3l-1.4 4" /></Ico>);
export const IconSnowflake = (p: IconProps) => (<Ico {...p}><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5L4.2 16.5" /><path d="M12 6.4l2-1.4M12 6.4l-2-1.4M12 17.6l2 1.4M12 17.6l-2 1.4M5.8 9.2l-.3 2.3M18.2 9.2l.3 2.3M18.2 14.8l.3-2.3M5.8 14.8l-.3-2.3" strokeWidth="1.4" /></Ico>);
export const IconHiking = (p: IconProps) => (<Ico {...p}><path d="M3 20h18" /><path d="M5 20l5.5-11 3.5 6 2-3.5L21 20" /><path d="M10.5 9l1.2-2.2" /></Ico>);
export const IconWind = (p: IconProps) => (<Ico {...p}><path d="M3 9h9.5a2.5 2.5 0 1 0-2.5-2.5" /><path d="M3 14h12a2.5 2.5 0 1 1-2.5 2.5" /><path d="M3 19h6.5" /></Ico>);
export const IconAccum = (p: IconProps) => (<Ico {...p}><path d="M12 3.5c-3.2 4.3-5 6.5-5 9.3a5 5 0 0 0 10 0c0-2.8-1.8-5-5-9.3Z" /><path d="M9.6 13.2h4.8M12 10.8v4.8" strokeWidth="1.4" /></Ico>);
export const IconTarget = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="12" r="7.6" /><circle cx="12" cy="12" r="3.4" /><circle cx="12" cy="12" r="0.7" fill="currentColor" stroke="none" /></Ico>);
export const IconBolt = (p: IconProps) => (<Ico {...p}><path d="M13 2.5L6 13.2h5l-1.4 8.3L18 10.6h-5.2L13 2.5Z" /></Ico>);
export const IconWarning = (p: IconProps) => (<Ico {...p}><path d="M12 3.5l9 15.5H3Z" /><path d="M12 10v4.2" /><circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none" /></Ico>);
export const IconRadarSignal = (p: IconProps) => (<Ico {...p}><path d="M4.5 19.5a9 9 0 0 1 9-9" /><path d="M4.5 19.5a5 5 0 0 1 5-5" /><path d="M13 11l4.5-4.5" strokeWidth="1.4" /><circle cx="4.5" cy="19.5" r="1.1" fill="currentColor" stroke="none" /></Ico>);

/* ---------------- Zeitachse / Controls ---------------- */
export const IconPlay = (p: IconProps) => (<Ico {...p}><path d="M8 5.6v12.8l10.5-6.4Z" fill="currentColor" stroke="none" /></Ico>);
export const IconPause = (p: IconProps) => (<Ico {...p}><rect x="7" y="5.5" width="3.4" height="13" rx="1.1" fill="currentColor" stroke="none" /><rect x="13.6" y="5.5" width="3.4" height="13" rx="1.1" fill="currentColor" stroke="none" /></Ico>);
export const IconStepBack = (p: IconProps) => (<Ico {...p}><path d="M18.5 6v12l-8.5-6Z" fill="currentColor" stroke="none" /><rect x="5.5" y="6" width="2.4" height="12" rx="1" fill="currentColor" stroke="none" /></Ico>);
export const IconStepForward = (p: IconProps) => (<Ico {...p}><path d="M5.5 6v12l8.5-6Z" fill="currentColor" stroke="none" /><rect x="16.1" y="6" width="2.4" height="12" rx="1" fill="currentColor" stroke="none" /></Ico>);
export const IconCrosshair = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="12" r="7.6" /><path d="M12 3.6v3.4M12 17v3.4M3.6 12h3.4M17 12h3.4" /></Ico>);
export const IconLoop = (p: IconProps) => (<Ico {...p}><path d="M4.5 9.2a7.5 7.5 0 0 1 12.8-2.7" /><path d="M17.5 3.2v3.6H14" /><path d="M19.5 14.8a7.5 7.5 0 0 1-12.8 2.7" /><path d="M6.5 20.8v-3.6H10" /></Ico>);

/* ---------------- Panel-Optionen ---------------- */
export const IconSliders = (p: IconProps) => (<Ico {...p}><path d="M4 7h9M17 7h3" /><circle cx="15" cy="7" r="2.2" /><path d="M4 12h3M11 12h9" /><circle cx="9" cy="12" r="2.2" /><path d="M4 17h7M15 17h5" /><circle cx="13" cy="17" r="2.2" /></Ico>);
export const IconChevron = (p: IconProps) => (<Ico {...p}><path d="M6 9l6 6 6-6" /></Ico>);
export const IconPalette = (p: IconProps) => (<Ico {...p}><path d="M12 3.5a8.5 8.5 0 0 0-.4 17c1.3.1 2-1 1.6-2.1-.5-1.3.3-2.4 1.7-2.4H17a4 4 0 0 0 4-4.2C20.7 6.7 16.8 3.5 12 3.5Z" /><circle cx="8" cy="10.5" r="1.1" fill="currentColor" stroke="none" /><circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="16" cy="10.5" r="1.1" fill="currentColor" stroke="none" /></Ico>);
export const IconMap = (p: IconProps) => (<Ico {...p}><path d="M3 6.5l6-2.3 6 2.3 6-2.3v13.6l-6 2.3-6-2.3-6 2.3Z" /><path d="M9 4.2v13.6M15 6.5v13.6" /></Ico>);
export const IconContrast = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" /></Ico>);
export const IconClock = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Ico>);
export const IconLayers = (p: IconProps) => (<Ico {...p}><path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8Z" /><path d="M3.5 12l8.5 4.5 8.5-4.5" /><path d="M3.5 16l8.5 4.5 8.5-4.5" /></Ico>);

/* ---------------- Status / Verdict ---------------- */
export const IconCheck = (p: IconProps) => (<Ico {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8 12.3l2.6 2.6L16 9" /></Ico>);
export const IconHourglass = (p: IconProps) => (<Ico {...p}><path d="M7 4h10M7 20h10" /><path d="M7.5 4c0 4 4.5 5.5 4.5 8s-4.5 4-4.5 8M16.5 4c0 4-4.5 5.5-4.5 8s4.5 4 4.5 8" /></Ico>);
export const IconDrop = (p: IconProps) => (<Ico {...p}><path d="M12 3.5c-3.2 4.3-5 6.5-5 9.3a5 5 0 0 0 10 0c0-2.8-1.8-5-5-9.3Z" /></Ico>);
export const IconGraupel = (p: IconProps) => (<Ico {...p}><path d="M7 13.5a4 4 0 0 1 .4-8 5 5 0 0 1 9.5 1.4 3.6 3.6 0 0 1-1.2 6.6" /><circle cx="9" cy="19" r="1" /><circle cx="12.5" cy="20" r="1" /><circle cx="16" cy="19" r="1" /></Ico>);
export const IconHail = (p: IconProps) => (<Ico {...p}><path d="M7 12.5a4 4 0 0 1 .4-8 5 5 0 0 1 9.5 1.4 3.6 3.6 0 0 1-1.2 6.6" /><path d="M9 17.5l-.6 1.2 1.3.3-.7 1.2M14.5 17.5l-.6 1.2 1.3.3-.7 1.2" strokeWidth="1.4" /></Ico>);

/* ---------------- Dispatcher ---------------- */
const LAYER_ICONS: Record<RadarLayerId, (p: IconProps) => React.JSX.Element> = {
  precip: IconRain, accum: IconAccum, cells: IconTarget, lightning: IconBolt,
  warnings: IconWarning, coverage: IconRadarSignal,
  rain: IconDrop, snow: IconSnowflake, graupel: IconGraupel, hail: IconHail,
  snowline: IconSnowflake, wind: IconWind,
};
export function LayerIcon({ id, size }: { id: RadarLayerId; size?: number }) {
  const C = LAYER_ICONS[id] ?? IconRain;
  return <C size={size} />;
}

const PRESET_ICONS: Record<string, (p: IconProps) => React.JSX.Element> = {
  standard: IconRain, storm: IconStormCloud, winter: IconSnowflake, hiking: IconHiking,
};
export function PresetIcon({ id, size }: { id: string; size?: number }) {
  const C = PRESET_ICONS[id] ?? IconRain;
  return <C size={size} />;
}
