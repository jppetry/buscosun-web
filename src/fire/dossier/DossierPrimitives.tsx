/**
 * Die MUI-Primitive des Brand-Dossiers (`docs/konzept-brand-detail.md` §2.2/§2.3).
 *
 * Diese Datei enthält **keine Fachaussage** — sie ist die Form, in der die Bausteine aus
 * `FireFootprintPanel.tsx` erscheinen. Jede Zeile Inhalt kommt von dort; wer hier etwas
 * ändert, ändert die Darstellung an ALLEN Orten, die sie rendern (Dossier-Bühne, Historie).
 *
 * Die eine Regel, die diese Datei trägt (§2.3, Prüfliste §6 Punkt 1):
 *
 *   Ein fehlender Wert ist „—" **mit Grund** — nie 0, nie leer, nie stumm.
 *
 * Auf dem Desktop steht der Grund im `Tooltip`. Auf Mobil hat der Finger kein Hover:
 * dort erscheint derselbe Grund ZUSÄTZLICH als sichtbare `caption`. Deshalb kennt jede
 * Primitive den Breakpoint — über `DossierBreakpointContext`, nicht über eine eigene
 * Media Query (die Breakpoints des Projekts liegen in `mobile/useIsMobile.ts`).
 */
import { createContext, useContext, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

export type DossierBreakpoint = 'mobile' | 'tablet' | 'desktop';

const BreakpointContext = createContext<DossierBreakpoint>('desktop');

export function DossierBreakpointProvider({ value, children }: { value: DossierBreakpoint; children: ReactNode }) {
  return <BreakpointContext.Provider value={value}>{children}</BreakpointContext.Provider>;
}

export function useDossierBreakpoint(): DossierBreakpoint {
  return useContext(BreakpointContext);
}

/** Farbton einer Sektionsüberschrift — dieselben fünf Töne wie die Vorlage 1a. */
export type Tone = 'red' | 'steel' | 'stone' | 'warn' | 'terra' | 'sage';

const TONE_COLOR: Record<Tone, (p: { fire: Record<string, string>; disabled: string }) => string> = {
  red: (p) => p.fire.extreme,
  steel: (p) => p.fire.steel,
  terra: (p) => p.fire.terra,
  warn: (p) => p.fire.warnInk,
  sage: (p) => p.fire.sage,
  stone: (p) => p.disabled,
};

/** Die Eyebrow-Zeile („VERLAUF", „WETTERLAGE AM BRANDORT") als `Typography variant="overline"`. */
export function Overline({ children, tone = 'stone', component = 'span' }: { children: ReactNode; tone?: Tone; component?: 'span' | 'h3' | 'div' }) {
  return (
    <Typography
      variant="overline"
      component={component}
      sx={(t) => ({ display: 'block', color: TONE_COLOR[tone]({ fire: t.palette.fire as unknown as Record<string, string>, disabled: t.palette.text.disabled }) })}
    >
      {children}
    </Typography>
  );
}

export interface DossierCardProps {
  /** Überschrift der Karte (Eyebrow). */
  title: ReactNode;
  tone?: Tone;
  /** Zweite Zeile neben der Überschrift („ΣFRP je Überflug · log-Achse …"). */
  subtitle?: ReactNode;
  /** `aria-label` des Abschnitts — bleibt in beiden Formen (Karte und Accordion) gleich. */
  label: string;
  children: ReactNode;
  /** Mobil: Startzustand des Accordions. Verlauf und Wetterlage stehen offen (§4). */
  defaultExpanded?: boolean;
  /** Zusätzliche Klasse — nur für Sonden/Alt-CSS, nicht für neue Optik. */
  className?: string;
}

/**
 * Eine Sektion des Dossiers. Auf Desktop/Tablet eine `Card`, auf Mobil ein `Accordion` —
 * derselbe Inhalt, dieselbe Überschrift, dasselbe `aria-label`. Grund für den Wechsel:
 * offen wären die sechs Karten auf 412 px ≈ 4 500 px Scrolltiefe; die Wetterführung
 * allein ist ≈ 900 px hoch und begrübe alles darunter (`docs/konzept-brand-detail.md` §4).
 * Zugeklappt heißt NICHT gestrichen — jede Karte bleibt mit einem Tipp erreichbar.
 */
export function DossierCard({ title, tone = 'stone', subtitle, label, children, defaultExpanded = false, className }: DossierCardProps) {
  const bp = useDossierBreakpoint();
  if (bp === 'mobile') {
    return (
      <Accordion defaultExpanded={defaultExpanded} aria-label={label} className={className}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-label={`${label} auf- oder zuklappen`}>
          <Box sx={{ minWidth: 0 }}>
            <Overline tone={tone}>{title}</Overline>
            {subtitle && <Typography variant="caption" component="span" sx={{ display: 'block' }}>{subtitle}</Typography>}
          </Box>
        </AccordionSummary>
        <AccordionDetails>{children}</AccordionDetails>
      </Accordion>
    );
  }
  return (
    <Card
      component="section"
      aria-label={label}
      // `br-ds-card` traegt die Rasterplatzierung aus `fireDeck.css` (Vorlage 1a).
      className={`br-ds-card${className ? ` ${className}` : ''}`}
      sx={tone === 'steel' ? { borderColor: 'fire.steelBorder' } : undefined}
    >
      <CardHeader
        title={<Overline tone={tone} component="h3">{title}</Overline>}
        subheader={subtitle ? <Typography variant="caption" component="span">{subtitle}</Typography> : undefined}
        sx={{ '& .MuiCardHeader-content': { display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' } }}
      />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export interface StatTileProps {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  /** Ton des Untertitels — „EFFIS kartiert" steht in Sage, „geschätzt"/„Obergrenze" neutral. */
  tone?: 'mapped' | 'estimate' | 'none' | 'growing' | 'stable' | 'declining' | 'no-signal';
  /** Farbpunkt vor dem Wert (Stärke-Kachel: dieselbe Tabelle wie der Kartenpunkt). */
  dotColor?: string;
  /**
   * Warum der Wert fehlt bzw. was er bedeutet. Desktop/Tablet: `Tooltip`.
   * Mobil ZUSÄTZLICH sichtbar — **nie ein stummer Wert** (Prüfliste §6 Punkt 1).
   */
  reason?: string;
}

const VALUE_COLOR: Partial<Record<NonNullable<StatTileProps['tone']>, string>> = {
  growing: '#B93C1E',
  declining: 'fire.slate',
  stable: '#7A6E5A',
  'no-signal': 'fire.warnInk',
};

/** Eine der vier Kennzahlen: Label (overline) · Wert (h4) · Untertitel (caption). */
export function StatTile({ label, value, caption, tone, dotColor, reason }: StatTileProps) {
  const bp = useDossierBreakpoint();
  const tile = (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column', minWidth: 0,
        bgcolor: 'fire.tile', border: '1px solid', borderColor: 'divider', borderRadius: '12px',
        p: bp === 'desktop' ? '14px 16px' : '12px 13px',
      }}
    >
      <Typography variant="overline" component="span" sx={{ color: 'text.disabled' }}>{label}</Typography>
      <Typography
        variant="h4" component="span"
        sx={{ mt: '4px', display: 'flex', alignItems: 'center', gap: '5px', overflowWrap: 'anywhere', color: (tone && VALUE_COLOR[tone]) || 'text.primary' }}
      >
        {dotColor && <Box component="span" aria-hidden="true" sx={{ width: 11, height: 11, borderRadius: '4px', bgcolor: dotColor, flex: '0 0 auto' }} />}
        {value}
      </Typography>
      {caption != null && (
        <Typography variant="caption" component="span" sx={{ mt: '6px', color: tone === 'mapped' ? 'fire.sage' : 'text.secondary' }}>
          {caption}
        </Typography>
      )}
      {/* Touch hat kein Hover: auf Mobil steht der Grund sichtbar unter dem Wert. */}
      {reason && bp === 'mobile' && (
        <Typography variant="caption" component="span" sx={{ mt: '4px', color: 'text.disabled', fontSize: 11.5 }}>{reason}</Typography>
      )}
    </Box>
  );
  if (!reason || bp === 'mobile') return tile;
  return <Tooltip title={reason}>{tile}</Tooltip>;
}

/** Das Raster der vier Kennzahlen: 4 Spalten auf Desktop, 2 auf Tablet und Mobil. */
export function KeyStats({ children }: { children: ReactNode }) {
  const bp = useDossierBreakpoint();
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: bp === 'desktop' ? 'repeat(4, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))',
        gap: bp === 'desktop' ? '12px' : '9px',
      }}
    >
      {children}
    </Box>
  );
}

export interface FactRowProps {
  term: string;
  children: ReactNode;
  /** Grund/Erklärung — Desktop `Tooltip` am Begriff, mobil sichtbare `caption`. */
  reason?: string;
  /** Zeile über die volle Breite (Listen, Tabellen) statt zweispaltig. */
  wide?: boolean;
}

/**
 * Eine Faktenzeile. **Kein `<dl>` mehr**: ein `dl` bricht auf 360 px unschön, und die
 * Begriffe des Dossiers („VORHERRSCHENDER WIND", „KONFIDENZ DER RICHTUNG") sind länger
 * als jede vernünftige feste Spalte. Desktop/Tablet: Grid 34 % / 66 %. Mobil: gestapelt,
 * der Begriff als `overline` über dem Wert.
 */
export function FactRow({ term, children, reason, wide = false }: FactRowProps) {
  const bp = useDossierBreakpoint();
  const stacked = bp === 'mobile' || wide;
  const label = (
    <Typography variant="overline" component="dt" sx={{ color: 'text.disabled', letterSpacing: '.14em', pt: stacked ? 0 : '2px' }}>
      {term}
    </Typography>
  );
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: stacked ? '1fr' : 'minmax(0, 34fr) minmax(0, 66fr)',
        columnGap: '14px', rowGap: stacked ? '2px' : '4px',
        py: stacked ? '5px' : '3px',
      }}
    >
      {reason && bp !== 'mobile' ? <Tooltip title={reason}><Box component="span">{label}</Box></Tooltip> : label}
      <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere', color: 'text.secondary' }}>
        {children}
        {reason && bp === 'mobile' && (
          <Typography variant="caption" component="span" sx={{ display: 'block', mt: '2px', color: 'text.disabled', fontSize: 11.5 }}>{reason}</Typography>
        )}
      </Typography>
    </Box>
  );
}

/** Der Stapel der Faktenzeilen — Trennlinien statt Kästen, wie in der Vorlage. */
export function FactList({ children, dense = false }: { children: ReactNode; dense?: boolean }) {
  return (
    <Stack component="dl" sx={{ m: 0, mt: dense ? 0 : '12px' }} divider={<Divider flexItem />}>
      {children}
    </Stack>
  );
}

/**
 * Stufe 2 aus §2.3: **ein ganzer Block fehlt, der Grund ist bekannt.** Kein leeres Chart,
 * kein „0 mm"-Achsenkreuz — der bestehende Satz in einem Kasten. `severity="warning"`
 * nur, wenn es ein Ausfall ist („keine Daten" ≠ „keine Brände").
 */
export function MissingBlock({ children, severity = 'info', action }: { children: ReactNode; severity?: 'info' | 'warning'; action?: ReactNode }) {
  return (
    <Alert severity={severity} variant="outlined" icon={false} action={action}>
      {children}
    </Alert>
  );
}

/**
 * Ladezustand eines Diagramms. Ein `Skeleton` IM Chart-Maß statt eines Spinners: die
 * Karte behält ihre Höhe, es gibt keinen Layout-Sprung, wenn die Werte eintreffen.
 */
export function ChartSkeleton({ height, note }: { height: number; note?: string }) {
  return (
    <Box>
      <Skeleton variant="rounded" height={height} sx={{ borderRadius: '10px' }} />
      {note && <Typography variant="caption" component="p" sx={{ mt: 1, mb: 0 }}>{note}</Typography>}
    </Box>
  );
}

/**
 * „JSON kopieren" als Icon-Knopf mit `Snackbar` statt des 1,5-s-Textwechsels.
 * Schlägt das Kopieren fehl, wird NICHTS behauptet — die Meldung erscheint nur nach
 * einem erfolgreichen `writeText`.
 */
export function CopyButton({ text, label, ariaLabel }: { text: () => string; label: string; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const copy = () => {
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(text()).then(() => setOpen(true), () => { /* still: nichts behaupten */ });
  };
  return (
    <>
      <Tooltip title={label}>
        <IconButton size="small" onClick={copy} aria-label={ariaLabel} sx={{ minWidth: 44, minHeight: 44 }}>
          <ContentCopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Snackbar open={open} autoHideDuration={2000} onClose={() => setOpen(false)} message="kopiert" />
    </>
  );
}

/** Kleine Hilfe: „—" mit Grund als ein Stück, für Faktenzeilen. */
export function Missing({ reason }: { reason?: string | null }) {
  const bp = useDossierBreakpoint();
  if (!reason) return <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>;
  if (bp === 'mobile') {
    return (
      <Box component="span">
        <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>{' '}
        <Box component="span" sx={{ color: 'text.disabled', fontSize: 11.5 }}>{reason}</Box>
      </Box>
    );
  }
  return (
    <Tooltip title={reason}>
      <Box component="span" sx={{ color: 'text.disabled', borderBottom: '1px dotted', cursor: 'help' }}>—</Box>
    </Tooltip>
  );
}

/**
 * Das Raster der Dossier-Karten.
 *
 * Es benutzt **das bestehende `.br-ds-grid` aus `fireDeck.css`** — nicht ein zweites,
 * inline gesetztes Raster. Grund: die Platzierungen der Karten (`.br-ds-verlauf`,
 * `.br-ds-aside`, `.br-ds-satbild` …) stehen dort samt Breakpoints (1439 px / 767 px) und
 * sind gegen die Vorlage 1a verifiziert. Ein zweites Raster daneben hat sie überstimmt und
 * die Minikarte über den Verlauf gelegt — zwei Quellen für dieselbe Anordnung sind genau
 * der Fehler, den dieser Umbau vermeiden soll.
 *
 * **Kein Masonry.** `@mui/lab` bleibt draußen: Masonry ordnet die DOM-Reihenfolge um, damit
 * die Spalten gleich hoch enden — die Lesereihenfolge und der Tabulator-Weg folgen dann der
 * Kachelhöhe statt dem Inhalt. Das Dossier hat aber eine GEMEINTE Reihenfolge (Verlauf vor
 * Wetterlage vor Einordnung vor Merkmale), und die Karten mit voller Breite („Einordnung",
 * „Merkmale") stünden in einer Masonry-Spalte gar nicht. `align-items: start` im vorhandenen
 * Grid löst das eigentliche Problem — ungleich hohe Karten — ohne diese Kosten.
 */
export function DossierGrid({ children }: { children: ReactNode }) {
  return <Box className="br-ds-grid">{children}</Box>;
}
