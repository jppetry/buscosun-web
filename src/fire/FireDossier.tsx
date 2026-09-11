/**
 * BD2 — das **Brand-Dossier** in der Mitte des Brandradars (Vorlage
 * `reference/brandradar-detail.dc.html`, Variante 1a: Bühnenwechsel Karte ⇄ Dossier,
 * Karte als Miniatur rechts).
 *
 * Seit dem MUI-Umbau ist die Form MUI Material (`Card`/`Accordion`/`Alert`/`Table`), der
 * INHALT unverändert: jede Zeile kommt aus den Bausteinen der Detailkarte
 * (`FireFootprintPanel.tsx`) — dieselben Komponenten, die auch die Historie rendert.
 * Diese Datei ist rein präsentational und hat KEINE eigene Fachaussage; wer hier einen
 * Satz sucht, findet ihn im Panel. (Das prüft `verify:fire-detail`: das Dossier darf die
 * Ursachen-Formel nicht selbst führen.)
 *
 * Gliederung nach `audit/brand-detail.md` §2 D6 und `docs/konzept-brand-detail.md` §1.3:
 *
 *   Kopf → Kennzahlen (4er-Raster) → Faktenzeilen
 *        → Verlauf (D1/D2) → Wetterlage → Wetterführung (D3/D4) → Satellitenbild
 *        → [Standort & Anlage] → Einordnung & Bestätigung (inkl. Ursache) → Merkmale
 *
 * ── Drei Formen, ein Inhalt ──────────────────────────────────────────────────────────
 *  • **Desktop** (`breakpoint: 'desktop'`): zweispaltiges Raster, Verlauf/Satellitenbild/
 *    Einordnung/Merkmale über die volle Breite, `aside` als eigene Spalte im Rahmen.
 *  • **Tablet**: dasselbe Raster, engere Maße, `aside` IM Raster.
 *  • **Mobil**: eigener Screen, Kennzahlen 2×2, die Karten als `Accordion`-Stapel —
 *    Verlauf und Wetterlage offen, der Rest zu. Zugeklappt heißt NICHT gestrichen:
 *    offen wären es ≈ 4 500 px Scrolltiefe, und die Wetterführung allein ≈ 900 px.
 */
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import type { FireRecord } from './footprint/fireRegistry';
import { METHOD_LABEL, provisionalArea } from './footprint/fireRegistry';
import { extentLabel } from './fireClusters';
import { LEVEL_LABEL } from './fireAssessment';
import type { AtWarnContext } from './sources/geosphereWarnContext';
import type { FirmsRow } from './sources/firmsHotspots';
import {
  Badge, CauseText, DetailConfidenceRows, DetailEinordnungRows, DetailFrpRows, DetailKennzahlenRows,
  DetailSubline, DetailVerlauf, DriversBlock, FeaturesRow, RecordStats, WeatherBlock, recordName, recordTitle,
  fireWindowAnchor, EFFIS_ANCHOR_NOTE,
} from './FireFootprintPanel';
import { SatImageryBlock } from './FireSatImagery';
import { satEnabled } from './detail/fireSatImagery';
import {
  DossierBreakpointProvider, DossierCard, DossierGrid, FactList, Overline,
  type DossierBreakpoint,
} from './dossier/DossierPrimitives';
import { FireProfileBlock } from './dossier/FireProfileBlock';

export interface FireDossierProps {
  r: FireRecord | null;
  nowMs: number;
  atContext?: AtWarnContext | null;
  /**
   * Die Form des Dossiers. Ersetzt die früheren Schalter `compact`/`mobile`: mit zwei
   * Booleans waren „Tablet" und „Mobil" gleichzeitig darstellbar (`compact && mobile`),
   * obwohl es die Form nicht gibt. Ein Wert aus drei kann das nicht.
   */
  breakpoint?: DossierBreakpoint;
  /** Tablet/Mobil: Minikarte (und Legende) innerhalb des Dossier-Rasters; Desktop hat die Spalte rechts. */
  aside?: ReactNode;
  /** Kopfzeile oberhalb (mobil: Kartenstreifen) — wird vor dem Kopf gerendert. */
  lead?: ReactNode;
  /**
   * BD3: zusätzliche Karten im Raster — die Standort-Angaben (`AnomalySiteCards`), wenn der
   * markierte Eintrag auf einem bekannten Anlagenstandort liegt. Vor BD3 standen sie als
   * Inline-Karte im Readout; sie dürfen nicht verloren gehen, nur weil die Mitte den Brand zeigt.
   */
  extra?: ReactNode;
  /** SAT3: die FIRMS-Zeilen des Laufs für das Satellitenbild (nur Live-Dossier; Historie hat keine). */
  detections?: readonly FirmsRow[] | null;
}

/**
 * OBERGRENZE der Chart-Breite je Form. Die tatsächliche Breite messen die Charts an ihrer
 * Karte (MUI X, ResizeObserver) — feste Zahlen je Breakpoint waren eine zweite Quelle für
 * eine Größe, die das Layout ohnehin bestimmt, und liefen auf dem Tablet über den Rand:
 * mit Dock und Readout bleibt der Mitte dort nur ~440 px, nicht die spezifizierten 620.
 */
const CHART_MAX_WIDTH: Record<DossierBreakpoint, number> = { desktop: 720, tablet: 620, mobile: 420 };

export function FireDossier({ r, nowMs, atContext = null, breakpoint = 'desktop', aside, lead, extra, detections = null }: FireDossierProps) {
  const bp = breakpoint;
  const mobile = bp === 'mobile';
  const width = CHART_MAX_WIDTH[bp];

  if (!r) {
    return (
      <DossierBreakpointProvider value={bp}>
        <Box component="section" className="br-ds is-empty" aria-label="Brand-Dossier" sx={{ display: 'flex', flexDirection: 'column', gap: mobile ? '10px' : '14px' }}>
          {lead}
          <Card component="div">
            <CardContent sx={{ p: '22px 24px !important' }}>
              <Overline tone="red">Dossier</Overline>
              <Typography variant="body1" sx={{ mt: 1, fontSize: 14, lineHeight: 1.55, color: 'text.secondary' }}>
                <Box component="strong" sx={{ color: 'text.primary' }}>Kein Brand markiert.</Box> Ein Klick auf einen Brand in der Registry{mobile ? '' : ' links'} oder auf der Karte öffnet hier sein Dossier —
                Kennzahlen, Verlauf je Überflug, Wetterlage am Brandort, Einordnung und Merkmale.
              </Typography>
            </CardContent>
          </Card>
          {aside}
        </Box>
      </DossierBreakpointProvider>
    );
  }

  return (
    <DossierBreakpointProvider value={bp}>
      <Box
        component="section"
        className={`br-ds${bp === 'tablet' ? ' is-compact' : ''}${mobile ? ' is-mobile' : ''}`}
        aria-label={`Dossier ${recordTitle(r)}`}
        sx={{ display: 'flex', flexDirection: 'column', gap: mobile ? '10px' : bp === 'tablet' ? '12px' : '14px' }}
      >
        {lead}

        <Card component="header" className="br-ds-head">
          <CardContent>
            {/* Mobil trägt die App-Leiste Titel, Abzeichen und Region — hier wären sie doppelt. */}
            {!mobile && (
              <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2, alignItems: 'flex-start', mb: 2.25 }}>
                <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                  <Typography variant="h5" component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                    {recordName(r)} <Badge r={r} />
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      mt: 0.75, color: 'text.secondary', overflowWrap: 'anywhere', fontSize: 13,
                      // Die Kennung bleibt als Code-Chip erkennbar (Vorlage 1a) — sie ist eine
                      // Kennung, kein Fließtext, und wird zum Kopieren angesehen.
                      '& code': { fontSize: 12, bgcolor: '#EDE6D3', borderRadius: '5px', px: '6px', py: '1px' },
                    }}
                  >
                    <DetailSubline r={r} />
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'flex-end', flex: '0 0 auto', maxWidth: '40%' }} aria-label="Methode und Bewertung">
                  {r.method.map((m) => <Chip key={m} size="small" variant="outlined" label={METHOD_LABEL[m]} />)}
                  {r.confidence.assessment && (
                    <Tooltip title={r.confidence.reasons.join(' · ')}>
                      <Chip size="small" variant="outlined" label={LEVEL_LABEL[r.confidence.assessment]} />
                    </Tooltip>
                  )}
                </Box>
              </Box>
            )}

            <RecordStats r={r} nowMs={nowMs} wide />

            <FactList>
              <DetailKennzahlenRows r={r} nowMs={nowMs} />
              <DetailFrpRows r={r} />
            </FactList>
          </CardContent>
        </Card>

        <DossierGrid>
          <DossierCard
            title="Verlauf" tone="red" label="Verlauf" defaultExpanded
            subtitle="ΣFRP je Überflug · log-Achse · Lücken > 6 h schraffiert"
            className="br-ds-verlauf"
          >
            <DetailVerlauf r={r} nowMs={nowMs} wide wideWidth={width} />
          </DossierCard>

          <DossierCard title="Wetterlage am Brandort" tone="steel" label="Wetterlage am Brandort" defaultExpanded className="br-ds-wetter">
            <WeatherBlock r={r} nowMs={nowMs} />
          </DossierCard>

          {/* BDE-C: die Wetterführung im Brandzeitfenster — Einstufung, Windrose, Zeitreihe.
              Eigene Karte, weil sie etwas anderes sagt als die Wetterlage darüber: dort einzelne
              Zeitpunkte, hier der Verlauf und was er für das Feuer bedeutet (abgeleitet). */}
          <DossierCard
            title="Wetterführung" tone="terra" label="Wetterführung im Brandzeitfenster"
            subtitle="Im Brandzeitfenster · abgeleitet, keine Messung"
            className="br-ds-drv"
          >
            <DriversBlock r={r} nowMs={nowMs} width={width} />
          </DossierCard>

          {/* BDE-E: das Brandprofil — wie ungewöhnlich waren die Treiber FÜR DIESEN ORT?
              Eigene Karte, weil sie eine andere Frage beantwortet als die Wetterführung:
              dort „was war", hier „war das hier viel". Zugeklappt, weil sie einen eigenen
              31-Tage-Abruf auslöst — wer sie nie öffnet, zieht ihn nicht. */}
          <DossierCard
            title="Brandprofil" tone="warn" label="Brandprofil im Ortsvergleich"
            subtitle="Rang gegen die letzten 30 Tage am selben Punkt · abgeleitet"
            className="br-ds-profile"
          >
            <FireProfileBlock
              lat={r.lat} lon={r.lon}
              anchorMs={fireWindowAnchor(r)?.firstMs ?? null}
              anchorNote={fireWindowAnchor(r)?.kind === 'effis' ? EFFIS_ANCHOR_NOTE : undefined}
            />
          </DossierCard>

          {/* SAT1: der Brand im Satellitenbild — vorher, während, nachher (wenn die Wolken es zulassen). */}
          {satEnabled() && (
            <DossierCard
              title="Satellitenbild" tone="stone" label="Satellitenbild vorher, während und nachher"
              subtitle="Vorher · während · nachher — wenn die Wolken es zulassen"
              className="br-ds-satbild"
            >
              <SatImageryBlock t={{ lat: r.lat, lon: r.lon, bbox: r.bbox, firstMs: r.firstMs, lastMs: r.lastMs, detections }} nowMs={nowMs} />
            </DossierCard>
          )}

          {extra}

          {aside && <Box className="br-ds-aside" sx={{ display: 'flex', flexDirection: 'column', gap: mobile ? '10px' : '12px' }}>{aside}</Box>}

          <DossierCard title="Einordnung & Bestätigung" tone="stone" label="Einordnung und Bestätigung" className="br-ds-einordnung">
            <FactList dense>
              <DetailConfidenceRows r={r} />
              <DetailEinordnungRows r={r} atContext={atContext} />
            </FactList>
            {/* Die wichtigste Ehrlichkeitszeile der Seite bekommt einen Rahmen. */}
            <Alert severity="warning" variant="outlined" icon={false} className="br-ds-cause" sx={{ mt: 1.75 }}>
              <AlertTitle>Ursache</AlertTitle>
              <CauseText r={r} />
            </Alert>
          </DossierCard>

          <DossierCard title="Merkmale" tone="stone" label="Merkmale" className="br-ds-merkmale">
            <FeaturesRow r={r} nowMs={nowMs} />
          </DossierCard>
        </DossierGrid>
      </Box>
    </DossierBreakpointProvider>
  );
}

/** Unter der Minikarte: Ausdehnung der Detektionen und die Lage-Aussage der Fläche. */
export function DossierMapNote({ r, fromRegistry }: { r: FireRecord; fromRegistry: boolean }) {
  const prov = provisionalArea(r);
  return (
    <Typography variant="caption" component="p" className="br-ds-mapnote" sx={{ m: 0, lineHeight: 1.5 }}>
      {/* Die Kartennotiz sagt, WAS gezeichnet ist — Kartierung, Detektionsraster oder nur der Ort. */}
      {r.sources.cluster && <Box component="strong" sx={{ display: 'block', color: 'text.primary', fontWeight: 600, fontSize: 13 }}>{extentLabel(r.sources.cluster)} Ausdehnung der Detektionen.</Box>}
      {prov
        ? prov.note
        : r.areaHa.kind === 'mapped'
          ? 'Gezeichnet ist die EFFIS-Kartierung; sie läuft der Beobachtung 1–3 Tage nach.'
          : r.areaHa.kind === 'upper-bound'
            ? 'Gezeichnet ist das Detektionsraster (Satellitenabdeckung), keine Brandfläche.'
            : 'Keine Fläche — nur der Ort der Detektionen.'}
      {!fromRegistry && ' Der Brandflächen-Layer ist aus; gezeigt wird der umschließende Kasten.'}
    </Typography>
  );
}

/** Legende · Detektion — die drei Zeilen der Vorlage, Farben aus den Tokens. */
export function DossierLegend() {
  return (
    <Card className="br-ds-legend">
      <CardContent sx={{ p: '14px !important', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Overline tone="stone">Legende · Detektion</Overline>
        <LegendRow color="fire.detection">Detektion im Fenster</LegendRow>
        <LegendRow color="fire.static">ortsfest (grau)</LegendRow>
        <LegendRow outline>markierter Brand</LegendRow>
        {/* Die Farben sind abgeleitet, nicht amtlich — das steht an der Legende, nicht im Impressum. */}
        <Typography variant="caption" component="span" sx={{ fontSize: 12 }}>Farben abgeleitet — nicht amtlich</Typography>
      </CardContent>
    </Card>
  );
}

function LegendRow({ color, outline = false, children }: { color?: string; outline?: boolean; children: ReactNode }) {
  return (
    <Typography variant="body2" component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13, color: 'text.primary' }}>
      <Box
        component="i" aria-hidden="true"
        sx={{
          width: 11, height: 11, flex: '0 0 auto',
          borderRadius: outline ? '2px' : '50%',
          bgcolor: outline ? 'transparent' : color,
          border: outline ? '2px solid' : 'none',
          borderColor: outline ? 'fire.mark' : undefined,
          boxSizing: 'border-box',
        }}
      />
      {children}
    </Typography>
  );
}
