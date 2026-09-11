/**
 * Ein nivo-Theme aus dem MUI-Theme — EINE Quelle für Schrift, Achsen und Gitter.
 *
 * nivo bringt eine eigene Default-Optik mit (dunkle Achsen, 11 px Systemschrift). Ohne
 * dieses Theme stünden die Linienzeilen im Brandradar in einer anderen Schrift als der
 * Rest des Decks — derselbe Befund B1, der schon für die handgezeichneten SVGs galt
 * (`audit/brandradar-detail-mitte.md`): eine SVG-Beschriftung erbt die Deck-Schrift nicht.
 *
 * Farben kommen ausschließlich aus `theme.palette` — keine Hex-Werte in dieser Datei.
 */
import type { Theme as MuiTheme } from '@mui/material/styles';
import { SVG_FONT } from '../../theme/buscosunTheme';

export function nivoTheme(t: MuiTheme) {
  const muted = t.palette.text.disabled;
  return {
    background: 'transparent',
    text: { fontFamily: SVG_FONT, fontSize: 10.5, fill: t.palette.text.secondary },
    axis: {
      domain: { line: { stroke: t.palette.divider, strokeWidth: 1 } },
      ticks: {
        line: { stroke: t.palette.divider, strokeWidth: 1 },
        text: { fontFamily: SVG_FONT, fontSize: 10, fill: muted },
      },
      legend: { text: { fontFamily: SVG_FONT, fontSize: 10, fill: muted } },
    },
    grid: { line: { stroke: t.palette.divider, strokeWidth: 0.6 } },
    crosshair: { line: { stroke: muted, strokeWidth: 1, strokeOpacity: 1, strokeDasharray: '3 3' } },
    tooltip: {
      container: {
        fontFamily: SVG_FONT,
        fontSize: 11.5,
        background: t.palette.background.paper,
        color: t.palette.text.primary,
        border: `1px solid ${t.palette.divider}`,
        borderRadius: 8,
        padding: '6px 9px',
      },
    },
  } as const;
}
