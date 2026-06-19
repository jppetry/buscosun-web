/**
 * Epic ASTRO — Mond (Phase, Beleuchtung, Höhe).
 *
 * Low-Precision-Algorithmus nach Paul Schlyter (genau genug für Beleuchtungs-
 * grad und ob der Mond über dem Horizont steht — beides reicht, um den Mond-
 * einfluss auf Deep-Sky-Aufnahmen einzuschätzen, ASTRO-US3). Keine Datenquelle.
 */

const RAD = Math.PI / 180;
const rev = (x: number) => ((x % 360) + 360) % 360;

/** Schlyter-Tageszahl (Epoche 2000 Jan 0.0 UT). */
function dayNumber(date: Date): number {
  return date.getTime() / 86_400_000 - 10956;
}

/** Sonnen-Ekliptiklänge (Grad) — Hilfsgröße für Elongation + Sternzeit. */
function sunLongitude(d: number): { lon: number; Ls: number } {
  const w = 282.9404 + 4.70935e-5 * d;
  const e = 0.016709 - 1.151e-9 * d;
  const M = rev(356.047 + 0.9856002585 * d);
  const E = M + (180 / Math.PI) * e * Math.sin(M * RAD) * (1 + e * Math.cos(M * RAD));
  const x = Math.cos(E * RAD) - e;
  const y = Math.sin(E * RAD) * Math.sqrt(1 - e * e);
  const v = Math.atan2(y, x) / RAD;
  const lon = rev(v + w);
  return { lon, Ls: rev(w + M) };
}

interface MoonEcliptic {
  lonecl: number;
  latecl: number;
}

function moonEcliptic(d: number): MoonEcliptic {
  const N = rev(125.1228 - 0.0529538083 * d);
  const i = 5.1454;
  const w = rev(318.0634 + 0.1643573223 * d);
  const a = 60.2666;
  const e = 0.0549;
  const M = rev(115.3654 + 13.0649929509 * d);
  let E = M + (180 / Math.PI) * e * Math.sin(M * RAD) * (1 + e * Math.cos(M * RAD));
  // eine Iteration genügt bei dieser Genauigkeit
  E = E - (E - (180 / Math.PI) * e * Math.sin(E * RAD) - M) / (1 - e * Math.cos(E * RAD));
  const x = a * (Math.cos(E * RAD) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E * RAD);
  const v = rev(Math.atan2(y, x) / RAD);
  const r = Math.sqrt(x * x + y * y);
  const xe = r * (Math.cos(N * RAD) * Math.cos((v + w) * RAD) - Math.sin(N * RAD) * Math.sin((v + w) * RAD) * Math.cos(i * RAD));
  const ye = r * (Math.sin(N * RAD) * Math.cos((v + w) * RAD) + Math.cos(N * RAD) * Math.sin((v + w) * RAD) * Math.cos(i * RAD));
  const ze = r * Math.sin((v + w) * RAD) * Math.sin(i * RAD);
  const lonecl = rev(Math.atan2(ye, xe) / RAD);
  const latecl = Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)) / RAD;
  return { lonecl, latecl };
}

export type MoonPhaseName =
  | 'Neumond' | 'zunehmende Sichel' | 'erstes Viertel' | 'zunehmender Mond'
  | 'Vollmond' | 'abnehmender Mond' | 'letztes Viertel' | 'abnehmende Sichel';

export interface MoonInfo {
  /** Beleuchteter Anteil 0..1 (0 = Neumond, 1 = Vollmond). */
  illumination: number;
  phase: MoonPhaseName;
  /** Mondalter in Tagen (0..29.5). */
  ageDays: number;
  /** Emoji passend zur Phase. */
  emoji: string;
}

const PHASE_EMOJI: Record<MoonPhaseName, string> = {
  'Neumond': '🌑', 'zunehmende Sichel': '🌒', 'erstes Viertel': '🌓', 'zunehmender Mond': '🌔',
  'Vollmond': '🌕', 'abnehmender Mond': '🌖', 'letztes Viertel': '🌗', 'abnehmende Sichel': '🌘',
};

function phaseNameFor(elong: number): MoonPhaseName {
  // elong = ekliptikale Längendifferenz Mond − Sonne (0..360)
  if (elong < 22.5 || elong >= 337.5) return 'Neumond';
  if (elong < 67.5) return 'zunehmende Sichel';
  if (elong < 112.5) return 'erstes Viertel';
  if (elong < 157.5) return 'zunehmender Mond';
  if (elong < 202.5) return 'Vollmond';
  if (elong < 247.5) return 'abnehmender Mond';
  if (elong < 292.5) return 'letztes Viertel';
  return 'abnehmende Sichel';
}

/** Mondphase + Beleuchtungsgrad für einen Zeitpunkt. */
export function moonInfo(date: Date): MoonInfo {
  const d = dayNumber(date);
  const { lon: sunLon } = sunLongitude(d);
  const { lonecl } = moonEcliptic(d);
  const elong = rev(lonecl - sunLon);
  const illumination = (1 - Math.cos(elong * RAD)) / 2;
  const phase = phaseNameFor(elong);
  return { illumination, phase, ageDays: (elong / 360) * 29.530589, emoji: PHASE_EMOJI[phase] };
}

/** Mondhöhe (Elevation in Grad) für Zeitpunkt + Ort. */
export function moonAltitudeDeg(date: Date, latDeg: number, lonDeg: number): number {
  const d = dayNumber(date);
  const oblecl = 23.4393 - 3.563e-7 * d;
  const { Ls } = sunLongitude(d);
  const { lonecl, latecl } = moonEcliptic(d);
  // ekliptikal → äquatorial
  const xe = Math.cos(lonecl * RAD) * Math.cos(latecl * RAD);
  const ye = Math.sin(lonecl * RAD) * Math.cos(latecl * RAD) * Math.cos(oblecl * RAD) - Math.sin(latecl * RAD) * Math.sin(oblecl * RAD);
  const ze = Math.sin(lonecl * RAD) * Math.cos(latecl * RAD) * Math.sin(oblecl * RAD) + Math.sin(latecl * RAD) * Math.cos(oblecl * RAD);
  const ra = rev(Math.atan2(ye, xe) / RAD);
  const dec = Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)) / RAD;
  // Sternzeit
  const ut = (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600);
  const gmst0 = rev(Ls + 180) / 15; // Stunden
  const lst = rev((gmst0 + ut) * 15 + lonDeg); // Grad
  const ha = rev(lst - ra);
  const lat = latDeg * RAD;
  const decR = dec * RAD;
  const alt = Math.asin(Math.sin(lat) * Math.sin(decR) + Math.cos(lat) * Math.cos(decR) * Math.cos(ha * RAD));
  return alt / RAD;
}
