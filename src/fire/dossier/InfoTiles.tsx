/**
 * Kleine Info-Kacheln mit Icon für die Wetterführung (Jans Auftrag 2026-10-14): statt Textzeilen
 * ein Raster aus Karten — Icon · Label · Wert · eine Zeile Zusatz. Der volle Wortlaut steht im
 * Tooltip (`title`); nichts wird gestrichen, nur umgesetzt.
 */
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

export type InfoIcon = 'wind' | 'compass' | 'drop' | 'rain' | 'thermo' | 'bolt' | 'index' | 'spread';

export function InfoTileIcon({ k, size = 18 }: { k: InfoIcon; size?: number }) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
  } as const;
  switch (k) {
    case 'wind': return <svg {...p}><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7" /></svg>;
    case 'compass': return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5Z" /></svg>;
    case 'drop': return <svg {...p}><path d="M12 3.5s6 6.2 6 10.3a6 6 0 0 1-12 0C6 9.700 12 3.500 12 3.500Z" /></svg>;
    case 'rain': return <svg {...p}><path d="M7 14.500A4.500 4.500 0 0 1 8 5.700a5.500 5.500 0 0 1 10.300 2.300A3.400 3.400 0 0 1 17.500 14.500Z" /><path d="M9 17.500l-1 2.500M13 17.500l-1 2.500M17 17.500l-1 2.500" /></svg>;
    case 'thermo': return <svg {...p}><path d="M10 14.500V5a2 2 0 0 1 4 0v9.500a4 4 0 1 1-4 0Z" /><circle cx="12" cy="17.500" r="1.500" fill="currentColor" /></svg>;
    case 'bolt': return <svg {...p}><path d="M13 3 5.500 13.500H11L10 21l8.500-11H12.500Z" /></svg>;
    case 'index': return <svg {...p}><path d="M4 19V9M10 19V5M16 19v-8M22 19H2" /></svg>;
    case 'spread': return <svg {...p}><path d="M4 20 20 4M20 4h-7M20 4v7" /></svg>;
  }
}

/** Icon zu einem Einstufungsgrund — nach Stichwort, ersatzweise der Blitz. */
export function iconForReason(text: string): InfoIcon {
  if (/wind|böe/i.test(text)) return 'wind';
  if (/feucht|RH\b/i.test(text)) return 'drop';
  if (/regen|niederschlag|nass|trocken/i.test(text)) return 'rain';
  if (/temp|warm|heiß|kalt|°C/i.test(text)) return 'thermo';
  return 'bolt';
}

export interface InfoTileData {
  key: string;
  icon: InfoIcon;
  label?: string;
  value: ReactNode;
  caption?: ReactNode;
  title?: string;
  /** Färbt Icon und Wert: `up` treibt das Feuer, `down` dämpft es. */
  tone?: 'up' | 'down';
  /** Klasse für den Wert (Verifier-/Stil-Haken, z. B. `br-drv-pt`). */
  valueClass?: string;
}

export function InfoTileGrid({ tiles, minWidth = 170, className }: { tiles: readonly InfoTileData[]; minWidth?: number; className?: string }) {
  return (
    <Box className={className} sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap: '8px' }}>
      {tiles.map((t) => {
        const accent = t.tone === 'up' ? 'fire.extreme' : t.tone === 'down' ? 'fire.steel' : 'text.secondary';
        return (
          <Tooltip key={t.key} title={t.title ?? ''} disableHoverListener={!t.title}>
            <Box sx={{
              display: 'flex', gap: 1, alignItems: 'center', p: 1, borderRadius: '10px', minWidth: 0,
              border: '1px solid', borderColor: 'divider', bgcolor: '#FDFBF4',
            }}>
              <Box sx={{
                flex: '0 0 auto', width: 28, height: 28, borderRadius: '8px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: accent, bgcolor: 'rgba(139, 115, 85, 0.1)',
              }}>
                <InfoTileIcon k={t.icon} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                {t.label && (
                  <Typography component="div" sx={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, color: 'text.disabled' }}>{t.label}</Typography>
                )}
                <Typography component="div" className={t.valueClass} sx={{ fontSize: 15, lineHeight: 1.25, fontWeight: 700, color: t.tone ? accent : 'text.primary', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{t.value}</Typography>
                {t.caption && <Typography component="div" sx={{ fontSize: 11.5, lineHeight: 1.35, color: 'text.secondary' }}>{t.caption}</Typography>}
              </Box>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
