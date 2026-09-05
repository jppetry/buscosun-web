/**
 * BD2 — das Brand-Dossier in der Mitte des Brandradars (Vorlage `reference/brandradar-detail.dc.html`,
 * Variante 1a). Gliederung nach `audit/brand-detail.md` §2 D6:
 *
 *   Kopf → Kennzahlen (4er-Raster, je Wert mit Untertitel, darunter die Zeilen)
 *        → Verlauf (FirePassChart auf voller Panelbreite)
 *        → Wetterlage (Zusammenfassung + Kacheln, Quellenzeile)
 *        → Einordnung & Bestätigung (inkl. Ursache-Kasten)
 *        → Merkmale.
 *
 * Rein präsentational und OHNE eigene Inhalte: jede Zeile kommt aus den Bausteinen der
 * Detailkarte (`FireFootprintPanel.tsx`) — dieselben Komponenten, die auch die Detailkarte
 * im Readout rendert. Konfidenz und Methode stehen hier (Vorlage) unter „Einordnung", in der
 * Detailkarte weiter unter „Kennzahlen" — sortiert, nicht gestrichen.
 */
import type { ReactNode } from 'react';
import type { FireRecord } from './footprint/fireRegistry';
import { METHOD_LABEL, provisionalArea } from './footprint/fireRegistry';
import { extentLabel } from './fireClusters';
import { LEVEL_LABEL } from './fireAssessment';
import type { AtWarnContext } from './sources/geosphereWarnContext';
import type { FirmsRow } from './sources/firmsHotspots';
import {
  Badge, CauseText, DetailConfidenceRows, DetailEinordnungRows, DetailFrpRows, DetailKennzahlenRows,
  DetailSubline, DetailVerlauf, DriversBlock, FeaturesRow, RecordStats, WeatherBlock, recordName, recordTitle,
} from './FireFootprintPanel';
import { SatImageryBlock } from './FireSatImagery';
import { satEnabled } from './detail/fireSatImagery';

export interface FireDossierProps {
  r: FireRecord | null;
  nowMs: number;
  atContext?: AtWarnContext | null;
  /** Tablet: Chart im 560er-Maß, zweispaltig mit `aside` in der zweiten Spalte. */
  compact?: boolean;
  /** Mobil: eine Spalte, Chart auf Sheet-Breite. */
  mobile?: boolean;
  /** Tablet/Mobil: Minikarte (und Legende) innerhalb des Dossier-Rasters; Desktop hat die Spalte rechts. */
  aside?: ReactNode;
  /** Kopfzeile oberhalb (mobil: „← Brände" + Segment) — wird vor dem Kopf gerendert. */
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

function Eyebrow({ children, tone }: { children: ReactNode; tone?: 'red' | 'steel' | 'stone' | 'warn' | 'terra' }) {
  return <span className={`br-ds-eyebrow${tone ? ` is-${tone}` : ''}`}>{children}</span>;
}

export function FireDossier({ r, nowMs, atContext = null, compact = false, mobile = false, aside, lead, extra, detections = null }: FireDossierProps) {
  if (!r) {
    return (
      <section className="br-ds is-empty" aria-label="Brand-Dossier">
        {lead}
        <div className="br-ds-card br-ds-emptycard">
          <Eyebrow tone="red">Dossier</Eyebrow>
          <p className="br-ds-emptytext">
            <strong>Kein Brand markiert.</strong> Ein Klick auf einen Brand in der Registry{mobile ? '' : ' links'} oder auf der Karte öffnet hier sein Dossier —
            Kennzahlen, Verlauf je Überflug, Wetterlage am Brandort, Einordnung und Merkmale.
          </p>
        </div>
        {aside}
      </section>
    );
  }
  return (
    <section className={`br-ds${compact ? ' is-compact' : ''}${mobile ? ' is-mobile' : ''}`} aria-label={`Dossier ${recordTitle(r)}`}>
      {lead}
      <header className="br-ds-card br-ds-head">
        <div className="br-ds-headrow">
          <div className="br-ds-headtx">
            <h2 className="br-ds-title">{recordName(r)} <Badge r={r} /></h2>
            <p className="br-ds-sub"><DetailSubline r={r} /></p>
          </div>
          <div className="br-ds-chips" aria-label="Methode und Bewertung">
            {r.method.map((m) => <span key={m} className={`fire-fp-src is-${m}`}>{METHOD_LABEL[m]}</span>)}
            {r.confidence.assessment && (
              <span className={`fire-fp-assess is-${r.confidence.assessment}`} title={r.confidence.reasons.join(' · ')}>
                {LEVEL_LABEL[r.confidence.assessment]}
              </span>
            )}
          </div>
        </div>
        <RecordStats r={r} nowMs={nowMs} wide />
        <dl className="fire-fp-dl br-ds-dl">
          <DetailKennzahlenRows r={r} nowMs={nowMs} />
          <DetailFrpRows r={r} />
        </dl>
      </header>

      <div className="br-ds-grid">
        <section className="br-ds-card br-ds-verlauf" aria-label="Verlauf">
          <div className="br-ds-cardhead">
            <Eyebrow tone="red">Verlauf</Eyebrow>
            <span className="br-ds-cardsub">ΣFRP je Überflug · log-Achse · Lücken &gt; 6 h schraffiert</span>
          </div>
          {/* 360 Einheiten in der Desktop-Spalte (BD2d: die Mitte ist schmaler, die Sidebars bleiben), 420 auf dem Tablet, 340 auf Sheet-Breite — 12-px-Schrift rendert überall ≈ 12 px. */}
          <DetailVerlauf r={r} nowMs={nowMs} wide wideWidth={mobile ? 340 : compact ? 420 : 360} />
        </section>

        <section className="br-ds-card is-steel br-ds-wetter" aria-label="Wetterlage am Brandort">
          <div className="br-ds-cardhead">
            <Eyebrow tone="steel">Wetterlage am Brandort</Eyebrow>
          </div>
          <WeatherBlock r={r} nowMs={nowMs} />
        </section>

        {/* BDE-C: die Wetterführung im Brandzeitfenster — Einstufung, Windrose, Zeitreihe.
            Eigene Karte, weil sie etwas anderes sagt als die Wetterlage darüber: dort einzelne
            Zeitpunkte, hier der Verlauf und was er für das Feuer bedeutet (abgeleitet). */}
        <section className="br-ds-card br-ds-drv" aria-label="Wetterführung im Brandzeitfenster">
          <div className="br-ds-cardhead">
            <Eyebrow tone="terra">Wetterführung</Eyebrow>
            <span className="br-ds-cardsub">Im Brandzeitfenster · abgeleitet, keine Messung</span>
          </div>
          <DriversBlock r={r} nowMs={nowMs} width={mobile ? 330 : compact ? 420 : 360} />
        </section>

        {/* SAT1: der Brand im Satellitenbild — vorher, während, nachher (wenn die Wolken es zulassen). */}
        {satEnabled() && (
          <section className="br-ds-card br-ds-satbild" aria-label="Satellitenbild vorher, während und nachher">
            <div className="br-ds-cardhead">
              <Eyebrow tone="stone">Satellitenbild</Eyebrow>
              <span className="br-ds-cardsub">Vorher · während · nachher — wenn die Wolken es zulassen</span>
            </div>
            <SatImageryBlock t={{ lat: r.lat, lon: r.lon, bbox: r.bbox, firstMs: r.firstMs, lastMs: r.lastMs, detections }} nowMs={nowMs} />
          </section>
        )}

        {extra}

        {aside && <div className="br-ds-aside">{aside}</div>}

        <section className="br-ds-card br-ds-einordnung" aria-label="Einordnung und Bestätigung">
          <div className="br-ds-cardhead">
            <Eyebrow tone="stone">Einordnung &amp; Bestätigung</Eyebrow>
          </div>
          <dl className="fire-fp-dl br-ds-dl">
            <DetailConfidenceRows r={r} />
            <DetailEinordnungRows r={r} atContext={atContext} />
          </dl>
          <div className="br-ds-cause">
            <Eyebrow tone="warn">Ursache</Eyebrow>
            <p className="br-ds-causetext"><CauseText r={r} /></p>
          </div>
        </section>

        <section className="br-ds-card br-ds-merkmale" aria-label="Merkmale">
          <div className="br-ds-cardhead">
            <Eyebrow tone="stone">Merkmale</Eyebrow>
          </div>
          <dl className="fire-fp-dl br-ds-dl is-features">
            <FeaturesRow r={r} nowMs={nowMs} />
          </dl>
        </section>
      </div>
    </section>
  );
}

/** Unter der Minikarte: Ausdehnung der Detektionen und die Lage-Aussage der Fläche. */
export function DossierMapNote({ r, fromRegistry }: { r: FireRecord; fromRegistry: boolean }) {
  const prov = provisionalArea(r);
  return (
    <p className="br-ds-mapnote">
      {r.sources.cluster && <strong>{extentLabel(r.sources.cluster)} Ausdehnung der Detektionen. </strong>}
      {prov
        ? prov.note
        : r.areaHa.kind === 'mapped'
          ? 'Gezeichnet ist die EFFIS-Kartierung; sie läuft der Beobachtung 1–3 Tage nach.'
          : r.areaHa.kind === 'upper-bound'
            ? 'Gezeichnet ist das Detektionsraster (Satellitenabdeckung), keine Brandfläche.'
            : 'Keine Fläche — nur der Ort der Detektionen.'}
      {!fromRegistry && ' Der Brandflächen-Layer ist aus; gezeigt wird der umschließende Kasten.'}
    </p>
  );
}

/** Legende · Detektion — die drei Zeilen der Vorlage, Farben aus den Tokens. */
export function DossierLegend() {
  return (
    <div className="br-ds-card br-ds-legend">
      <Eyebrow tone="stone">Legende · Detektion</Eyebrow>
      <span className="br-legend-dot"><i style={{ background: 'var(--br-det)' }} />Detektion im Fenster</span>
      <span className="br-legend-dot"><i style={{ background: 'var(--br-grey-dot)' }} />ortsfest (grau)</span>
      <span className="br-legend-dot"><i className="is-mark" />markierter Brand</span>
      <span className="br-legend-derived">Farben abgeleitet — nicht amtlich</span>
    </div>
  );
}
