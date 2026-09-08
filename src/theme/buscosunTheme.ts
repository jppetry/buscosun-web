/**
 * MUI-Theme des Command-Decks (hell, Sand/Ink) — die Brücke zwischen den bestehenden
 * CSS-Tokens (`src/designTokens.css`, Namensraum `--sand-*`/`--ink-*`/`--br-*`) und den
 * MUI-Komponenten des Brand-Dossiers.
 *
 * ⚠️ Regeln dieser Datei:
 *
 *  1. **Keine erfundene Farbe.** Jeder Wert unten steht bereits in `designTokens.css`,
 *     `fireModel.ts` (FWI-Rampe, `FWI_STEPS`) oder `fireClusters.ts` (`STATIC_GREY`).
 *     Die Hex-Werte stehen hier ausgeschrieben statt als `var(--…)`, weil MUI X Charts
 *     die Farben in SVG-Attribute und in `colorMap`-Interpolationen schreibt — dort
 *     wird eine CSS-Variable nicht überall aufgelöst. Wer eine Farbe ändert, ändert sie
 *     an BEIDEN Stellen; die Prüfung dafür steht in `verify:fire-detail`.
 *
 *  2. **Nur aus dem Brandradar importieren.** Die Datei zieht `@mui/material` nach sich.
 *     `FirePage.tsx` ist lazy geladen; ein Import aus `App.tsx`/`SearchPage.tsx` würde
 *     MUI in den Eager-Chunk ziehen und das Erstbild-Budget sprengen
 *     (`budget.json`: eagerJs 107,9 KB gzip).
 *
 *  3. **Kein Dark-Mode.** Die FWI-Rampe ist auf Sand kalibriert; Stufe 1/2 fällt gegen
 *     Ink unter 3:1 Kontrast. Dark-Mode ist ein eigener Schritt mit zweiter Rampe
 *     (`docs/konzept-brand-detail.md` §5), nicht dieser.
 */
import { createTheme, type Theme } from '@mui/material/styles';

/**
 * Die Schrift des Decks. **Selbst gehostet** (`src/fonts.css`, erzeugt von
 * `scripts/fetch-fonts.mjs`, Schnitte 300–800) — NICHT über fonts.googleapis.com.
 * Die Google-Einbindung wurde am 2026-08-01 entfernt (V-102/D-02: sie schickte bei
 * jedem Seitenaufruf ungefragt die Besucher-IP an einen Dritten). Wer diese Kette
 * wieder auf ein CDN legt, nimmt diese Entscheidung zurück.
 */
export const DECK_FONT = "'League Spartan', var(--font-base), system-ui, sans-serif";

/**
 * Dieselbe Schrift OHNE CSS-Variable — für SVG-`<text>`-Kinder, die wir selbst
 * zeichnen. MUI X setzt die Schrift auf dem `<svg>`-Wrapper; ein `<text>` erbt sie
 * dort korrekt. Bei eigenen SVG-Kindern (Schraffur-Labels, Windrose) bleibt die
 * ausdrückliche Angabe Pflicht — ohne sie erbt der Text die Standardschrift des
 * Browsers für SVG, nicht die des Decks (Befund B1, `audit/brandradar-detail-mitte.md`).
 */
export const SVG_FONT = "'League Spartan', system-ui, sans-serif";

/** Die Feuer-Palette. Werte 1:1 aus `FWI_STEPS`, `designTokens.css` und `STATIC_GREY`. */
export interface FirePalette {
  /** FWI 1 — Low. `--br-fwi-1` */
  low: string;
  /** FWI 2 — Moderate. `--br-fwi-2` */
  moderate: string;
  /** FWI 3 — High. `--br-fwi-3` */
  high: string;
  /** FWI 4 — Very High. `--br-fwi-4`; zugleich der **Tag**-Balken in D1. */
  veryHigh: string;
  /** FWI 5 — Extreme. `--br-fwi-5`/`--br-red`; zugleich „jetzt"-Linie und Detektionsband. */
  extreme: string;
  /** FWI 6 — Very Extreme. `--br-fwi-6` */
  veryExtreme: string;
  /** Tag-Balken in D1 (= `veryHigh`, eigener Name, weil er dort etwas anderes bedeutet). */
  day: string;
  /** Nacht-Balken in D1. `--stone-600` */
  night: string;
  /** Ortsfeste Quellen (`STATIC_GREY` aus `fireClusters.ts`). */
  static: string;
  /** Schraffur der Beobachtungslücken (D2). `--sand-300` */
  hatch: string;
  /** Detektion (Legende, Kartenpunkt). `--br-det` */
  detection: string;
  /** Markierter Brand (Kontur). `--br-mark` */
  mark: string;
  /** Ausbreitung / Gruppe „Gefahrenlage". `--br-amber` */
  spread: string;
  /** Treiber-Zeile Wind. `--br-slate` */
  slate: string;
  /** Treiber-Zeile Temperatur / Links. `--br-terra` */
  terra: string;
  /** Treiber-Zeilen Feuchte + Niederschlag. `--br-steel` */
  steel: string;
  /** „EFFIS kartiert" / „kartiert". `--br-sage-text` */
  sage: string;
  /** Ton der Vorbehalt-Kästen. `--br-warn-ink` / `--br-warn-tint` / `--br-warn-border` */
  warnInk: string;
  warnTint: string;
  warnBorder: string;
  /** Ton der Steel-Karte (Wetterlage). Vorlage 1a. */
  steelTint: string;
  steelBorder: string;
  /** Kartenfläche innerhalb einer Karte (Kacheln) — heller als `background.paper`. */
  tile: string;
  /**
   * Die vier Stärkeklassen der Windrose, schwach → stark: die Sand-/Stein-Leiter
   * `--sand-300` → `--stone-400` → `--stone-500` → `--stone-600`. Eine Leiter aus EINEM
   * Ton, weil die Klassen eine Ordnung sind und keine Kategorien; eine bunte Skala
   * suggerierte Bedeutungsunterschiede, die es nicht gibt.
   */
  roseScale: readonly string[];
}

declare module '@mui/material/styles' {
  interface Palette {
    fire: FirePalette;
  }
  interface PaletteOptions {
    fire?: FirePalette;
  }
}

const FIRE: FirePalette = {
  low: '#8FBF6B',
  moderate: '#D6D24E',
  high: '#E9A33C',
  veryHigh: '#D4632E',
  extreme: '#A32B1E',
  veryExtreme: '#6B1410',
  day: '#D4632E',
  night: '#5C5447',
  static: '#9A9186',
  hatch: '#C9B98F',
  detection: '#FF6B3D',
  mark: '#FFB03D',
  spread: '#E9A33C',
  slate: '#6B7A8F',
  terra: '#C97B47',
  steel: '#3A6FA8',
  sage: '#5F7A4C',
  warnInk: '#9A5A2A',
  warnTint: '#FBF3E7',
  warnBorder: '#E3C39A',
  steelTint: '#EAF1F7',
  steelBorder: '#C7D6E4',
  tile: '#FDFBF4',
  roseScale: ['#D9CEB0', '#A89A7A', '#8B7355', '#5C5447'],
};

export const buscosunTheme: Theme = createTheme({
  cssVariables: false,
  palette: {
    mode: 'light',
    primary: { main: FIRE.extreme, contrastText: '#FAF6EA' },
    secondary: { main: FIRE.terra, contrastText: '#FAF6EA' },
    error: { main: FIRE.extreme },
    warning: { main: FIRE.warnInk },
    info: { main: FIRE.steel },
    success: { main: FIRE.sage },
    background: { default: '#EDE6D3', paper: '#FAF6EA' },
    text: { primary: '#2C2A26', secondary: '#5C5447', disabled: '#8B7355' },
    divider: '#E0D6BE',
    fire: FIRE,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: DECK_FONT,
    h5: { fontSize: 26, fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.15 },
    h6: { fontSize: 20, fontWeight: 700, letterSpacing: '-0.2px', lineHeight: 1.2 },
    // Der Wert einer Kennzahl-Kachel — die Vorlage 1a setzt ihn auf 22 px.
    h4: { fontSize: 22, fontWeight: 700, letterSpacing: '-0.2px', lineHeight: 1.15 },
    body2: { fontSize: 13, lineHeight: 1.5 },
    caption: { fontSize: 12.5, lineHeight: 1.5, color: '#8B7355' },
    overline: { fontSize: 12, fontWeight: 700, letterSpacing: '.16em', lineHeight: 1.2, textTransform: 'uppercase' },
  },
  transitions: {
    duration: {
      // Karten-Hover 120 ms, Accordion 200 ms (`docs/konzept-brand-detail.md` §5 „Motion").
      shortest: 120,
      shorter: 150,
      short: 200,
      standard: 200,
    },
  },
  components: {
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: ({ theme }) => ({
          borderColor: theme.palette.divider,
          borderRadius: 14,
          backgroundColor: theme.palette.background.paper,
          // Kein Schatten: die Vorlage hat 1 px Rahmen, keine Elevation.
          transition: theme.transitions.create('border-color', { duration: 120, easing: 'ease-out' }),
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }),
      },
    },
    MuiCardHeader: {
      defaultProps: { disableTypography: true },
      styleOverrides: { root: { padding: '18px 20px 0' } },
    },
    MuiCardContent: {
      styleOverrides: { root: { padding: '12px 20px 18px', '&:last-child': { paddingBottom: 18 } } },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontFamily: DECK_FONT, fontWeight: 600, letterSpacing: '.04em' },
        sizeSmall: { height: 26, fontSize: 12, borderRadius: 8 },
        outlined: ({ theme }) => ({ borderColor: theme.palette.divider, backgroundColor: '#F5F1E8' }),
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12, fontSize: 13, lineHeight: 1.55, alignItems: 'flex-start' },
        message: { paddingTop: 2, minWidth: 0 },
      },
      // Sand-Ton statt MUI-Blau/Gelb — der Kasten gehört ins Deck, nicht in Material Default.
      // MUI v9 kennt keine `outlinedInfo`-Slots mehr; die Kombination aus Variante und
      // Schwere steht in `variants` neben den `styleOverrides`.
      variants: [
        {
          props: { variant: 'outlined', severity: 'info' },
          style: { backgroundColor: '#F5F1E8', borderColor: '#E0D6BE', color: '#5C5447' },
        },
        {
          props: { variant: 'outlined', severity: 'warning' },
          style: { backgroundColor: FIRE.warnTint, borderColor: FIRE.warnBorder, color: FIRE.warnInk },
        },
      ],
    },
    MuiAlertTitle: {
      styleOverrides: {
        root: { fontSize: 12, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 4 },
      },
    },
    MuiAccordion: {
      defaultProps: { disableGutters: true, square: false },
      styleOverrides: {
        root: ({ theme }) => ({
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 12,
          backgroundColor: theme.palette.background.paper,
          boxShadow: 'none',
          '&::before': { display: 'none' },
          '@media (prefers-reduced-motion: reduce)': { '& .MuiCollapse-root': { transition: 'none' } },
        }),
      },
    },
    MuiAccordionSummary: {
      // 44 px Touch-Ziel (CLAUDE.md, Selbstverifikationsfrage 3).
      styleOverrides: { root: { minHeight: 48, padding: '0 14px' }, content: { margin: '10px 0' } },
    },
    MuiAccordionDetails: { styleOverrides: { root: { padding: '0 14px 14px' } } },
    MuiTooltip: {
      defaultProps: { enterTouchDelay: 0, describeChild: true, arrow: true },
      styleOverrides: {
        tooltip: { fontFamily: DECK_FONT, fontSize: 12.5, lineHeight: 1.5, maxWidth: 320, backgroundColor: '#2C2A26' },
        arrow: { color: '#2C2A26' },
      },
    },
    MuiTable: { styleOverrides: { root: { fontVariantNumeric: 'tabular-nums' } } },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme }) => ({ fontFamily: DECK_FONT, fontSize: 12.5, borderColor: theme.palette.divider, padding: '6px 8px' }),
        head: ({ theme }) => ({
          fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
          color: theme.palette.text.disabled, backgroundColor: theme.palette.background.paper,
        }),
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { fontFamily: DECK_FONT, fontWeight: 600, textTransform: 'none', letterSpacing: 0, borderRadius: 10 },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontFamily: DECK_FONT, fontWeight: 600, textTransform: 'none', letterSpacing: 0,
          minHeight: 44, borderColor: theme.palette.divider,
          '&.Mui-selected': { backgroundColor: theme.palette.fire.extreme, color: '#FAF6EA' },
          '&.Mui-selected:hover': { backgroundColor: theme.palette.fire.veryExtreme, color: '#FAF6EA' },
        }),
      },
    },
    MuiIconButton: { styleOverrides: { root: ({ theme }) => ({ color: theme.palette.text.secondary }) } },
    MuiSkeleton: {
      defaultProps: { animation: 'wave' },
      styleOverrides: { root: { backgroundColor: '#EDE6D3' } },
    },
    MuiDivider: { styleOverrides: { root: ({ theme }) => ({ borderColor: theme.palette.divider }) } },
  },
});
