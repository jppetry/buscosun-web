/**
 * KERN-US2 — Ergebnis: genau ein bester Tag, auf einen Blick.
 *
 * Holt den Punktforecast für den Ort (bestehende Pipeline, keine neue Quelle),
 * bewertet jeden Kandidatentag anlass-bewusst und hebt genau den besten hervor.
 * Tage ohne ausreichende Vorhersage (z. B. AT/CH > ~60 h) werden ehrlich als
 * „keine Vorhersage" gezeigt und nicht gewertet.
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { getPointForecast } from '../pointForecast/pointForecast';
import type { LayerKey } from '../MapView';
import { flagForCountry, shortLocationName } from '../geocode';
import { fmtPhaseHours, phasesLatestHour, planBVenueDef, type EventQuery } from './eventModel';
import {
  recommendBestDay, candidateDays, hoursNeededFor, confidenceTier, defaultTuningFor, rainRiskFor, windHazardFor, heatHazardFor, coldHazardFor, safetyScore,
  assessPlanB,
  type EventRecommendation, type DayResult, type Factor, type PhaseResult, type WindowRisk, type PlanBAssessment,
} from './eventScoring';
import { findBetterLocation, ALT_RADIUS_KM, type AltLocationCandidate } from './eventAltLocation';
import { fetchCapeSeriesAtPoint } from '../sources/iconD2Cape';
import { fetchDwdAlerts } from '../sources/dwdAlerts';
import { convectiveOutlook, type ConvectiveOutlook } from '../radar/convectiveIndex';
import { downloadEventICS } from './icsExport';
import { encodeEventState } from './eventState';
import { exportSvgAsPng } from '../imageExport';
import {
  ActivityIcon, VenueIcon, IconRain, IconSun, IconWind, IconThermometer, IconSnow,
  IconWarning, IconCheck, IconArrowUpRight, IconPin, IconClock, IconCamera, IconSunrise,
  IconSunset, IconFog, IconCloud, IconMoon, IconDrop, IconCity, IconLamp, IconStars, IconTelescope,
} from './eventIcons';
import { fmtSpan, fmtClock, type LightWindows } from '../photo/sun';
import { buildPhotoDay, chanceLabel, type PhotoDay, type CloudMood, type ChanceAssessment } from '../photo/photoLight';
import { estimateLightPollution, type LightPollution } from '../astro/lightPollution';
import { buildAstroNight, rankAstroNights, type AstroNight } from '../astro/astroNight';
import type { PointForecast, PointForecastHour } from '../pointForecast/types';

/** Echte 2D-Wetterkarte (schwer) nur bei Bedarf laden. */
const EmbeddedMapView = lazy(() => import('../MapView'));
/** Karten-Umschalter — wie die Tabs im „Ablauf am besten Tag"-Diagramm. */
const MAP_TABS: Array<{ id: LayerKey; label: string }> = [
  { id: 'temp', label: 'Temperatur' },
  { id: 'nowcast', label: 'Niederschlag' },
  { id: 'wind', label: 'Wind' },
];
/** Raster-Horizont (ICON-D2) in Stunden — darüber keine Karten-Wetterdaten. */
const RASTER_HORIZON_H = 28;
import { useNotifications } from '../notifications/useNotifications';

/** Erkennt das Trauungs-/Zeremonie-Fenster anhand des Phasennamens. */
const isCeremony = (label: string) => /trauung|zeremonie|trauzeremonie/i.test(label);
/** Abend-/Nachtfenster: beginnt ab 17 Uhr oder reicht über Mitternacht. */
const isEveningPhase = (h: [number, number]) => h[0] >= 17 || h[0] >= h[1];

interface Props {
  query: EventQuery;
  onEdit: () => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rec: EventRecommendation; forecast: PointForecast };

export default function EventResult({ query, onEdit }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const { ingest } = useNotifications();

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    setState({ kind: 'loading' });
    (async () => {
      try {
        const hours = hoursNeededFor(candidateDays(query.window), phasesLatestHour(query.phases));
        const forecast = await getPointForecast({
          lat: query.location.lat, lng: query.location.lon, country: query.location.country,
          hours, signal: ac.signal, includeRadarNowcast: true,
        });
        if (!alive) return;
        setState({ kind: 'ready', rec: recommendBestDay(query, forecast), forecast });
      } catch (err) {
        if (!alive || ac.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Wetterdaten nicht erreichbar' });
      }
    })();
    return () => { alive = false; ac.abort(); };
  }, [query]);

  // Frische Empfehlung an die Benachrichtigungs-Logik geben (PUSH-US2/US3):
  // existiert eine Subscription fürs Vorhaben, wird sie ausgewertet.
  useEffect(() => {
    if (state.kind === 'ready') ingest(query, { rec: state.rec, forecast: state.forecast });
  }, [state, query, ingest]);

  return (
    <section className="rt-section">
      {/* Vorhaben-Kopf */}
      <div className="ev-result-head">
        <span className="ev-activity-icon ev-result-glyph" aria-hidden="true"><ActivityIcon id={query.activity.id} size={26} /></span>
        <div>
          <span className="rt-eyebrow">Dein Vorhaben</span>
          <h2 className="ev-result-title">
            {query.activity.label}
            <span className="ev-result-where"> · {flagForCountry(query.location.country)} {shortPlace(query.location.name)}</span>
            {JSON.stringify(query.tuning) !== JSON.stringify(defaultTuningFor(query.activity.id)) && <span className="ev-tune-changed">angepasst</span>}
          </h2>
          <span className="ev-result-window">
            <IconClock size={13} /> {query.phases.length === 1
              ? `bewertet fürs Fenster: ${query.phases[0].label} · ${fmtPhaseHours(query.phases[0].hours)}`
              : `${query.phases.length} Phasen einzeln bewertet: ${query.phases.map((p) => p.label).join(' · ')}`}
          </span>
        </div>
        <button type="button" className="rt-filebar-replace" onClick={onEdit}>Angaben ändern</button>
      </div>

      {state.kind === 'loading' && (
        <div className="ev-card ev-state">
          <span className="ev-spinner" aria-hidden="true" />
          <p>Wir vergleichen das Wetter an deinen Tagen …</p>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="ev-card ev-state ev-state-error">
          <p><IconWarning size={16} /> {state.message}</p>
          <button type="button" className="ev-add-btn" onClick={onEdit}>Erneut versuchen</button>
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          {state.rec.bestIndex < 0
            ? <NoForecast />
            : <Recommendation rec={state.rec} query={query} forecast={state.forecast} activityLabel={query.activity.label} datesMode={query.window.mode === 'dates'} />}
        </>
      )}
    </section>
  );
}

function Recommendation({ rec, query, forecast, activityLabel, datesMode }: { rec: EventRecommendation; query: EventQuery; forecast: PointForecast; activityLabel: string; datesMode: boolean }) {
  const best = rec.days[rec.bestIndex];
  const [linkCopied, setLinkCopied] = useState(false);
  const storm = useEventStormOutlook(query.location, forecast, best);
  const copyEventLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${encodeEventState(query)}`;
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2000);
  };
  // Rangliste: bewertete Tage nach Score absteigend (gleichstand → früher zuerst),
  // Tage ohne Vorhersage chronologisch ans Ende.
  const ranked = [...rec.days].sort((a, b) => {
    if (a.summary && b.summary) return b.score - a.score || a.date.localeCompare(b.date);
    if (a.summary) return -1;
    if (b.summary) return 1;
    return a.date.localeCompare(b.date);
  });
  // KONF-US4: Widerspruch erkennen — gut bewertet, aber unsicher. Dann eine
  // verlässlichere Alternative (bester Tag innerhalb des sicheren Horizonts) anbieten.
  const conflict = best.isTendency && best.score >= 70;
  const reliableAlt = conflict
    ? (ranked.find((d) => d.summary && !d.isTendency && d.score >= 55) ?? null)
    : null;
  return (
    <>
      {/* Bester Tag — Hero mit Begründung (US4) */}
      <div className={`ev-card ev-best${best.isTendency ? ' ev-best-tendency' : ''}`}>
        <ScoreDonut score={best.score} />
        <div className="ev-best-main">
          <div className="ev-best-head">
            <span className="rt-eyebrow ev-best-eyebrow">
              Bester Tag für {activityLabel}
              {best.isTendency && <span className="ev-tendency-tag">Tendenz</span>}
            </span>
            <ConfPill confidence={best.confidence} />
          </div>
          <h3 className="ev-best-day">{formatDayLong(best.date)}</h3>
          {conflict ? (
            <ConflictWarning best={best} alt={reliableAlt} />
          ) : best.isTendency ? (
            <p className="ev-tendency-banner">
              Liegt jenseits des verlässlichen Horizonts ({best.confidenceNote.split(' · ')[0]}) — als grobe <strong>Tendenz</strong> verstehen, nicht als feste Prognose. Werte können sich noch deutlich ändern.
            </p>
          ) : null}
          <p className="ev-best-rationale">{best.isTendency ? `Tendenz: ${lowerFirst(best.rationale)}` : best.rationale}</p>
          {best.risks.length > 0 && <WindowRiskBanner risks={best.risks} multiPhase={best.phases.length > 1} />}
          <p className="ev-conf-note">Verlässlichkeit: {best.confidenceNote}</p>
          <div className="ev-best-stats">
            {[...best.factors].sort((a, b) => b.weight - a.weight).map((f, i) => (
              <FactorStat key={f.key} factor={f} primary={i === 0} approx={best.isTendency} />
            ))}
          </div>
          <p className="ev-best-legend">Faktoren nach Wichtigkeit für {activityLabel} · <span className="ev-leg good">gut</span> <span className="ev-leg ok">okay</span> <span className="ev-leg bad">kritisch</span></p>
          <div className="ev-best-actions">
            <button type="button" className="ev-ics-btn" onClick={() => downloadEventICS(query, best)}
              title="Diesen Tag als Termin (.ics) herunterladen — öffnet sich in Kalender/Handy">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4.5" width="18" height="16" rx="2.5" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2.5" x2="8" y2="6" /><line x1="16" y1="2.5" x2="16" y2="6" />
              </svg>
              In den Kalender ({best.phases.length > 1 ? `${best.phases.length} Phasen` : 'Termin'})
            </button>
            <button type="button" className="ev-share-btn" onClick={copyEventLink}
              title="Link zu dieser Auswertung kopieren (Anlass · Ort · Zeitfenster · Phasen)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
              </svg>
              {linkCopied ? '✓ Link kopiert' : 'Link teilen'}
            </button>
            <span className="ev-ics-hint">.ics &amp; Link — offline, ganz ohne Konto</span>
          </div>
        </div>
      </div>

      {/* Regenrisiko gesondert ausweisen: Trauung (PRE-HOCH-US1) ODER Feierfenster (PRE-EVENT-US1) */}
      {(() => {
        const ceremony = best.phases.find((p) => isCeremony(p.label) && p.summary);
        if (ceremony) return <RainRiskCard phase={ceremony} title="Regenrisiko zur Trauung" />;
        const scorable = best.phases.filter((p) => p.summary);
        if (!scorable.length) return null;
        const wettest = scorable.reduce((a, b) => (b.summary!.precipPeakMmH > a.summary!.precipPeakMmH ? b : a));
        const title = scorable.length > 1 ? `Regenrisiko · ${wettest.label}` : 'Regenrisiko fürs Feierfenster';
        return <RainRiskCard phase={wettest} title={title} />;
      })()}

      {/* Gewittergefahr fürs Eventfenster (#3) — nur DE & nur im nahen CAPE-Horizont */}
      {storm && <ThunderstormCard outlook={storm} />}

      {/* Gefühlte Temperatur + Wind fürs Feierfenster (PRE-EVENT-US2) — Nicht-Hochzeit */}
      {(() => {
        if (best.phases.some((p) => isCeremony(p.label))) return null;
        const scorable = best.phases.filter((p) => p.summary);
        if (!scorable.length) return null;
        const feltMin = Math.round(Math.min(...scorable.map((p) => p.summary!.apparentMinC)));
        const feltMax = Math.round(Math.max(...scorable.map((p) => p.summary!.apparentMaxC)));
        const windMax = Math.round(Math.max(...scorable.map((p) => p.summary!.windMaxMs)));
        const gustMax = Math.round(Math.max(...scorable.map((p) => p.summary!.gustMaxMs)));
        const windowLabel = scorable.length === 1 ? `${scorable[0].label} · ${fmtPhaseHours(scorable[0].hours)}` : 'über alle Phasen';
        return <ComfortCard feltMin={feltMin} feltMax={feltMax} windMax={windMax} gustMax={gustMax} windowLabel={windowLabel} />;
      })()}

      {/* Wind-Warnung für Deko/Zelt/Frisur (PRE-HOCH-US2) — im Hochzeitskontext */}
      {(() => {
        const isWedding = best.phases.some((p) => isCeremony(p.label));
        if (!isWedding) return null;
        const windiest = best.phases.filter((p) => p.summary).reduce<PhaseResult | null>(
          (a, b) => (!a || b.summary!.gustMaxMs > a.summary!.gustMaxMs ? b : a), null);
        const hazard = windiest ? windHazardFor(windiest.summary!) : null;
        return hazard && windiest ? <WeddingWindCard phase={windiest} hazard={hazard} /> : null;
      })()}

      {/* Hitze-/Schwüle-Warnung für Gäste & Catering (PRE-HOCH-US3) */}
      {(() => {
        const isWedding = best.phases.some((p) => isCeremony(p.label));
        if (!isWedding) return null;
        const hottest = best.phases.filter((p) => p.summary).reduce<PhaseResult | null>(
          (a, b) => (!a || b.summary!.apparentMaxC > a.summary!.apparentMaxC ? b : a), null);
        const hazard = hottest ? heatHazardFor(hottest.summary!) : null;
        return hazard && hottest ? <WeddingHeatCard phase={hottest} hazard={hazard} /> : null;
      })()}

      {/* Kälte am Abend (PRE-HOCH-US4) — für jedes Abend-/Nachtfenster */}
      {(() => {
        const evenings = best.phases.filter((p) => p.summary && isEveningPhase(p.hours));
        const coldest = evenings.reduce<PhaseResult | null>(
          (a, b) => (!a || b.summary!.apparentMinC < a.summary!.apparentMinC ? b : a), null);
        const hazard = coldest ? coldHazardFor(coldest.summary!) : null;
        return hazard && coldest ? <EveningColdCard phase={coldest} hazard={hazard} /> : null;
      })()}

      {/* Event-Ablauf (stündlicher Verlauf aller Wetterdaten) am besten Tag */}
      <div className="ev-section-head">
        <span className="rt-eyebrow">Ablauf am besten Tag</span>
        <span className="ev-section-sub">{formatDayLong(best.date)} · Stunde für Stunde über dein Fenster</span>
      </div>
      <EventCourseChart forecast={forecast} best={best} />

      {/* Wetterkarte fürs Event — nur wenn der Zeitraum im Raster-Horizont liegt,
          d. h. echte Wetterdaten für den Tag vorliegen (sonst keine Karte). */}
      {eventWithinRasterHorizon(best) && (
        <>
          <div className="ev-section-head">
            <span className="rt-eyebrow">Dein Event auf der Karte</span>
            <span className="ev-section-sub">Ort &amp; Wetterlage am besten Tag</span>
          </div>
          <EventMapSection location={query.location} best={best} />
        </>
      )}

      {/* Fotografie-Licht (Epic FOTO) — nur für den Foto-Anlass */}
      {query.activity.id === 'photo' && <PhotoLightSection rec={rec} query={query} forecast={forecast} />}

      {/* Astrofotografie & Sternenbeobachtung (Epic ASTRO) — nur für „Sterne schauen" */}
      {query.activity.id === 'stargazing' && <AstroNightSection rec={rec} query={query} forecast={forecast} />}

      {/* Plan B / Ausweich-Logik (Epic PLANB) — nur wenn aktiviert */}
      <PlanBSection query={query} rec={rec} />

      {/* Phasen einzeln (WIN-US2) — nur bei mehreren Phasen */}
      {best.phases.length > 1 && (
        <>
          <div className="ev-section-head">
            <span className="rt-eyebrow">Phasen am besten Tag</span>
            <span className="ev-section-sub">jede einzeln · der Tag zählt die schwächste</span>
          </div>
          <PhaseBreakdown phases={best.phases} />
        </>
      )}

      {/* Sicherheit über die Zeit (KONF-US2) — sichtbar abnehmende Konfidenz */}
      {rec.scorableCount >= 2 && (
        <>
          <div className="ev-section-head">
            <span className="rt-eyebrow">Sicherheit über die Zeit</span>
            <span className="ev-section-sub">spätere Tage sind unsicherer</span>
          </div>
          <div className="ev-card ev-tl-card">
            <ConfidenceTimeline days={rec.days} />
            <p className="ev-tl-note">
              Je weiter ein Tag entfernt liegt, desto unsicherer die Vorhersage — späte Tage sind eher grobe Tendenz als Festlegung.
            </p>
          </div>
        </>
      )}

      {/* Einzeltermine → Termin-Vergleich (PRE-HOCH-US5); sonst Rangliste */}
      {rec.days.length > 1 && (datesMode ? (
        <TerminVergleich days={rec.days} />
      ) : (
        <>
          <div className="ev-section-head">
            <span className="rt-eyebrow">Rangliste</span>
            <span className="ev-section-sub">{rec.scorableCount} von {rec.days.length} Tagen bewertet</span>
          </div>
          <DayScoreChart days={rec.days} />
          <div className="ev-rank-list">
            {ranked.map((d, i) => <RankRow key={d.date} rank={d.summary ? i + 1 : null} day={d} />)}
          </div>
          <p className="ev-days-note">
            Quellen: DWD · GeoSphere · MeteoSwiss, höhenkorrigiert.
            {rec.scorableCount < rec.days.length && ' Tage ohne Wertung liegen jenseits des Vorhersage-Horizonts.'}
          </p>
        </>
      ))}
    </>
  );
}

function NoForecast() {
  return (
    <div className="ev-card ev-state">
      <p>Für die gewählten Tage liegt noch keine Vorhersage vor — bitte wähle Tage innerhalb des Vorhersage-Horizonts (DE bis ~7 Tage, AT/CH bis ~2,5 Tage).</p>
    </div>
  );
}

/** PRE-HOCH-US5 — konkrete Wunschtermine direkt gegeneinander, nach Wettersicherheit. */
function TerminVergleich({ days }: { days: DayResult[] }) {
  const ranked = [...days].sort((a, b) => {
    if (a.summary && b.summary) return safetyScore(b.score, b.confidence) - safetyScore(a.score, a.confidence) || a.date.localeCompare(b.date);
    if (a.summary) return -1;
    if (b.summary) return 1;
    return a.date.localeCompare(b.date);
  });
  const safest = ranked.find((d) => d.summary) ?? null;
  const scorable = days.filter((d) => d.summary).length;
  return (
    <>
      <div className="ev-section-head">
        <span className="rt-eyebrow">Termin-Vergleich</span>
        <span className="ev-section-sub">deine Wunschtermine — wettersicherste zuerst</span>
      </div>
      <div className="ev-rank-list">
        {ranked.map((d, i) => <CompareRow key={d.date} rank={d.summary ? i + 1 : null} day={d} isSafest={d === safest} />)}
      </div>
      <p className="ev-days-note">
        „Sicher" = Wetter-Bewertung × Verlässlichkeit (Vorlauf).{' '}
        {scorable < days.length && 'Termine ohne Wertung liegen jenseits des Vorhersage-Horizonts (~7 Tage). '}
        Quellen: DWD · GeoSphere · MeteoSwiss.
      </p>
    </>
  );
}

function CompareRow({ rank, day, isSafest }: { rank: number | null; day: DayResult; isSafest: boolean }) {
  const band = !day.summary ? 'nodata' : scoreBand(day.score);
  const safety = day.summary ? safetyScore(day.score, day.confidence) : 0;
  const downside = day.isTendency ? day.downside.replace(/\s*\([^)]*\)/, '') : day.downside;
  return (
    <div className={`ev-rank ev-compare ev-rank-${band}${day.isTendency ? ' ev-rank-tendency' : ''}${isSafest ? ' ev-compare-safest' : ''}`}>
      <span className="ev-rank-num">{rank != null ? rank : '–'}</span>
      <div className="ev-rank-day">
        <span className="ev-rank-date">
          {formatDayLong(day.date)}
          {isSafest && <span className="ev-rank-badge">Wettersicherste Wahl</span>}
          {day.summary && day.isTendency && <span className="ev-tendency-tag sm">Tendenz</span>}
        </span>
        <span className={`ev-rank-reason${day.summary ? '' : ' ev-rank-na'}`}>
          {day.summary ? capitalize(day.reason) : 'keine Vorhersage'}
          {day.summary && downside && (band === 'mid' || band === 'low') && (
            <span className={`ev-rank-down ev-rank-down-${band === 'low' ? 'bad' : 'ok'}`}>↓ {downside}</span>
          )}
          {day.summary && day.risks.map((r, k) => <RiskChip key={k} risk={r} compact />)}
        </span>
      </div>
      {day.summary && (
        <div className="ev-compare-metrics">
          <span className="ev-compare-sub">Wetter {day.score} · {Math.round(day.confidence * 100)} % sicher</span>
          <div className="ev-compare-safety">
            <div className="ev-rank-bar"><span style={{ width: `${safety}%`, background: scoreColor(safety) }} /></div>
            <span className="ev-rank-score" style={{ color: scoreColor(safety) }}>{safety}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Bausteine ---------------------------------------------------------------

/**
 * Tages-Score-Balkendiagramm („Proben-Rack") — die Ergebnis-Liste als ein Bild:
 * jeder Tag ein Balken, Höhe = Wetter-Score, Farbe = semantisches Band
 * (gut/okay/kritisch), der beste Tag als Ink-Balken mit Sage-Ring + „Bester",
 * Tage ohne Vorhersage als Stummel, und ab dem verlässlichen Horizont sind die
 * Tendenz-Tage sichtbar gedimmt. Chronologisch — so wird die mit dem Vorlauf
 * sinkende Sicherheit direkt ablesbar. Rein SVG, skaliert per viewBox.
 */
function DayScoreChart({ days }: { days: DayResult[] }) {
  const slot = 64, baseline = 150, maxBarH = 120, top = baseline - maxBarH;
  const W = Math.max(1, days.length) * slot;
  const firstTendencyIdx = days.findIndex((d) => d.summary && d.isTendency);
  const dividerX = firstTendencyIdx > 0 ? firstTendencyIdx * slot : null;
  return (
    <div className="ev-card ev-daychart">
      <svg className="ev-daychart-svg" viewBox={`0 0 ${W} 196`} role="img"
        aria-label="Wetter-Score aller Tage im Vergleich — der beste Tag ist hervorgehoben; spätere Tage sind als Tendenz gedimmt.">
        <line x1="0" y1={baseline} x2={W} y2={baseline} stroke="var(--border-medium, #D9D0B8)" strokeWidth="1" />
        {dividerX != null && (
          <g>
            <line x1={dividerX} y1={top - 16} x2={dividerX} y2={baseline} stroke="var(--border-strong, #C4B896)" strokeWidth="1.2" strokeDasharray="4 4" />
            <text x={dividerX + 6} y={top - 6} className="ev-daychart-horizon">Tendenz →</text>
          </g>
        )}
        {days.map((d, i) => {
          const cx = i * slot + slot / 2;
          if (!d.summary) {
            return (
              <g key={d.date}>
                <rect x={cx - 13} y={baseline - 8} width="26" height="8" rx="4" fill="var(--sand-200, #E0D6BE)" />
                <text x={cx} y={baseline - 14} className="ev-daychart-cap ev-daychart-na" textAnchor="middle">–</text>
                <text x={cx} y="168" className="ev-daychart-wd" textAnchor="middle">{weekdayShort(d.date)}</text>
                <text x={cx} y="182" className="ev-daychart-dt" textAnchor="middle">{dayNum(d.date)}</text>
              </g>
            );
          }
          const barH = Math.max(6, (d.score / 100) * maxBarH);
          const yTop = baseline - barH;
          const isBest = !!d.isBest;
          const barW = isBest ? 32 : 26;
          const fill = isBest ? 'var(--ink-900, #2C2A26)' : scoreColor(d.score);
          return (
            // Tendenz-Tage gedimmt — außer der beste Tag bleibt prominent
            // (seine Unsicherheit zeigen Divider, „Tendenz"-Tag & Hero-Warnung).
            <g key={d.date} opacity={d.isTendency && !isBest ? 0.5 : 1}>
              {isBest && (
                <rect x={cx - barW / 2 - 2} y={yTop - 2} width={barW + 4} height={barH + 4} rx="8"
                  fill="none" stroke="var(--ink-900, #2C2A26)" strokeWidth="2" />
              )}
              <rect x={cx - barW / 2} y={yTop} width={barW} height={barH} rx="6" fill={fill} />
              <text x={cx} y={yTop - 7} className={`ev-daychart-cap${isBest ? ' is-best' : ''}`} textAnchor="middle">{d.score}</text>
              {isBest && (
                <g transform={`translate(${cx}, ${yTop - 24})`}>
                  <rect x="-27" y="-13" width="54" height="18" rx="9" fill="var(--ink-900, #2C2A26)" />
                  <text y="0" className="ev-daychart-best" textAnchor="middle">BESTER</text>
                </g>
              )}
              <text x={cx} y="168" className={`ev-daychart-wd${isBest ? ' is-best' : ''}`} textAnchor="middle">{weekdayShort(d.date)}</text>
              <text x={cx} y="182" className="ev-daychart-dt" textAnchor="middle">{dayNum(d.date)}</text>
            </g>
          );
        })}
      </svg>
      <p className="ev-daychart-note">
        Höhe = Wetter-Score · gedimmt = unsichere Tendenz ·
        <span className="ev-leg good"> gut</span>
        <span className="ev-leg ok"> okay</span>
        <span className="ev-leg bad"> kritisch</span>
      </p>
    </div>
  );
}

// --- Event-Ablauf (stündlicher Verlauf) + Wetterkarte ------------------------

interface CourseHour { hour: number; temp: number | null; app: number | null; precip: number | null; wind: number | null; gust: number | null; cloud: number | null; }

/** Eventfenster (Start-/Endstunde) aus den Phasen des besten Tags. */
function eventWindow(best: DayResult): [number, number] {
  if (!best.phases.length) return [8, 20];
  const s = Math.min(...best.phases.map((p) => p.hours[0]));
  const e = Math.max(...best.phases.map((p) => (p.hours[1] > p.hours[0] ? p.hours[1] : 24)));
  return [s, e];
}

/** Stündliche Wetterreihe des besten Tags über das Eventfenster (aus dem Punktforecast). */
function buildCourse(forecast: PointForecast, dateISO: string, startH: number, endH: number): CourseHour[] {
  const byHour = new Map<number, PointForecastHour>();
  for (const h of forecast.hours) {
    const d = h.timestamp;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (iso === dateISO) byHour.set(d.getHours(), h);
  }
  const out: CourseHour[] = [];
  for (let hh = startH; hh <= endH; hh++) {
    const h = byHour.get(hh);
    out.push({
      hour: hh, temp: h?.temperature ?? null, app: h?.apparentTemperature ?? null,
      precip: h?.precipitation ?? null, wind: h?.windSpeed ?? null, gust: h?.gustSpeed ?? null,
      cloud: h?.cloudCoverTotal ?? null,
    });
  }
  return out;
}

/**
 * Event-Ablauf als sauberes Verlaufsdiagramm im „Eignungs-Verlauf"-Stil der
 * Daten-Bausteine: gerahmte Plotfläche, Gridlines mit Achsen-Labels, weiche Linie
 * mit Punkten (bzw. Balken beim Niederschlag) und ein hervorgehobener Extrempunkt.
 * Ein Umschalter blendet Temperatur / Niederschlag / Wind einzeln ein, sodass jede
 * Größe für sich hochaufgeräumt lesbar ist. Phasen-Ribbon + Phasengrenzen oben.
 */
function EventCourseChart({ forecast, best }: { forecast: PointForecast; best: DayResult }) {
  const [startH, endH] = eventWindow(best);
  const course = buildCourse(forecast, best.date, startH, endH);
  const [metric, setMetric] = useState<'temp' | 'precip' | 'wind'>('temp');
  const svgRef = useRef<SVGSVGElement>(null);

  if (!course.some((c) => c.temp != null)) {
    return (
      <div className="ev-card ev-course-empty">
        <p>Für den {formatDayLong(best.date)} liegen noch keine Stundenwerte vor — der Tag liegt jenseits des Vorhersage-Horizonts (nur Tendenz).</p>
      </div>
    );
  }

  const n = course.length;
  const W = 720, plotX0 = 52, plotX1 = 704, plotW = plotX1 - plotX0;
  const plotY0 = 48, plotY1 = 168, plotH = plotY1 - plotY0;
  const xi = (i: number) => (n <= 1 ? plotX0 + plotW / 2 : plotX0 + (plotW * i) / (n - 1));
  const xForHour = (h: number) => xi(h - startH);

  // --- Metrik-Konfiguration --------------------------------------------------
  const raw = course.map((c) => (metric === 'temp' ? c.temp : metric === 'precip' ? (c.precip ?? 0) : c.wind));
  const sec = metric === 'temp' ? course.map((c) => c.app) : metric === 'wind' ? course.map((c) => c.gust) : null;
  const present = raw.filter((v): v is number => v != null);
  const secPresent = (sec ?? []).filter((v): v is number => v != null);
  let vMin: number, vMax: number;
  if (metric === 'temp') {
    vMin = Math.min(...present); vMax = Math.max(...present, ...secPresent);
    if (vMax - vMin < 4) { const m = (vMin + vMax) / 2; vMin = m - 2; vMax = m + 2; }
    vMin = Math.floor(vMin - 1); vMax = Math.ceil(vMax + 1);
  } else if (metric === 'precip') {
    vMin = 0; vMax = Math.max(1, Math.ceil(Math.max(...present, 0)));
  } else {
    vMin = 0; vMax = Math.max(5, Math.ceil(Math.max(...present, ...secPresent, 0)));
  }
  const color = metric === 'temp' ? '#C97B47' : metric === 'precip' ? '#3A6FA8' : '#6B7A8F';
  const unit = metric === 'temp' ? '°C' : metric === 'precip' ? 'mm/h' : 'm/s';
  const fmt = (v: number) => (metric === 'temp' ? `${Math.round(v)}°` : metric === 'precip' ? (v < 2 ? v.toFixed(1) : String(Math.round(v))) : String(Math.round(v)));
  const yScale = (v: number) => plotY1 - ((v - vMin) / (vMax - vMin || 1)) * plotH;

  // Linie + Fläche aus zusammenhängenden Nicht-Null-Punkten.
  const series = (vals: (number | null)[]) => {
    const pts = vals.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v != null);
    const line = pts.map((p, k) => `${k ? 'L' : 'M'} ${xi(p.i).toFixed(1)} ${yScale(p.v).toFixed(1)}`).join(' ');
    const area = pts.length ? `${line} L ${xi(pts[pts.length - 1].i).toFixed(1)} ${plotY1} L ${xi(pts[0].i).toFixed(1)} ${plotY1} Z` : '';
    return { pts, line, area };
  };
  const main = series(raw);
  const secLine = sec ? series(sec).line : '';

  // Extrempunkt der Metrik hervorheben (Temp: wärmste · Niederschlag: nasseste · Wind: stärkste Böe).
  const hlArr = metric === 'wind' ? (sec as (number | null)[]) : raw;
  let hlIdx = -1, hlVal = -Infinity;
  hlArr.forEach((v, i) => { if (v != null && v > hlVal) { hlVal = v; hlIdx = i; } });
  const showHl = hlIdx >= 0 && (metric !== 'precip' || hlVal > 0.05);
  const hlY = yScale(hlVal);
  const hlText = metric === 'temp' ? `${Math.round(hlVal)}°` : metric === 'precip' ? `${hlVal.toFixed(1)} mm` : `Böen ${Math.round(hlVal)}`;
  const dryRun = metric === 'precip' && Math.max(...present, 0) <= 0.05;

  const grid = [vMin, (vMin + vMax) / 2, vMax];
  const barW = Math.min(16, (plotW / Math.max(1, n)) * 0.55);
  const TABS: Array<{ id: 'temp' | 'precip' | 'wind'; label: string }> = [
    { id: 'temp', label: 'Temperatur' }, { id: 'precip', label: 'Niederschlag' }, { id: 'wind', label: 'Wind' },
  ];

  return (
    <div className="ev-card ev-course">
      <div className="ev-course-head">
        <div className="ev-course-tabs" role="tablist" aria-label="Wettergröße">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={metric === t.id}
              className={`ev-course-tab${metric === t.id ? ' is-active' : ''}`} onClick={() => setMetric(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="ev-chart-export" title="Diagramm als Bild (PNG) herunterladen"
          onClick={() => svgRef.current && void exportSvgAsPng(svgRef.current, {
            filename: `buscosun-ablauf-${best.date}-${metric}.png`,
            title: `Wetter-Ablauf · ${formatDayLong(best.date)}`,
            subtitle: `${TABS.find((t) => t.id === metric)!.label} · stündlich über das Eventfenster`,
            source: 'buscosun · Quellen: DWD · GeoSphere · MeteoSwiss (höhenkorrigiert)',
          })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Als Bild</span>
        </button>
      </div>

      <svg ref={svgRef} className="ev-course-svg" viewBox={`0 0 ${W} 196`} role="img"
        aria-label={`${TABS.find((t) => t.id === metric)!.label} am ${formatDayLong(best.date)}, stündlich über das Eventfenster.`}>
        {/* Phasen-Ribbon */}
        {best.phases.map((p, i) => {
          const eh = p.hours[1] > p.hours[0] ? p.hours[1] : 24;
          const x0 = Math.max(plotX0, xForHour(p.hours[0]));
          const x1 = Math.min(plotX1, eh === endH ? plotX1 : xForHour(eh));
          const band = p.summary ? scoreBand(p.score) : 'nodata';
          return (
            <g key={i}>
              <rect x={x0 + 1} y="8" width={Math.max(3, x1 - x0 - 2)} height="26" rx="6" className={`ev-course-phase ev-course-phase-${band}`} />
              <text x={(x0 + x1) / 2} y="25" className="ev-course-phase-label" textAnchor="middle">{p.label}</text>
            </g>
          );
        })}

        {/* Plotrahmen + Gridlines + Achsen-Labels */}
        <rect x={plotX0} y={plotY0} width={plotW} height={plotH} rx="10" className="ev-course-plot" />
        {grid.map((g, k) => (
          <g key={`g${k}`}>
            <line x1={plotX0} y1={yScale(g)} x2={plotX1} y2={yScale(g)} className="ev-course-grid" />
            <text x={plotX0 - 8} y={yScale(g) + 3} className="ev-course-axis" textAnchor="end">{fmt(g)}</text>
          </g>
        ))}
        {best.phases.slice(1).map((p, i) => (
          <line key={`pb${i}`} x1={xForHour(p.hours[0])} y1={plotY0} x2={xForHour(p.hours[0])} y2={plotY1} className="ev-course-phasebound" />
        ))}
        <text x={plotX1} y={plotY0 - 8} className="ev-course-unit" textAnchor="end">{unit}</text>

        {/* Daten */}
        {metric === 'precip' ? (
          <>
            {course.map((c, i) => (c.precip && c.precip > 0.02) ? (
              <rect key={`b${i}`} x={xi(i) - barW / 2} y={yScale(c.precip)} width={barW} height={plotY1 - yScale(c.precip)} rx="2" fill={color} opacity="0.85" />
            ) : null)}
            {dryRun && <text x={(plotX0 + plotX1) / 2} y={(plotY0 + plotY1) / 2} className="ev-course-drynote" textAnchor="middle">durchgehend trocken</text>}
          </>
        ) : (
          <>
            <path d={main.area} fill={color} opacity="0.12" />
            {secLine && <path d={secLine} fill="none" stroke={metric === 'wind' ? '#D4A373' : '#A89A7A'} strokeWidth="1.4" strokeDasharray="4 3" strokeLinejoin="round" />}
            <path d={main.line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
            {main.pts.map((p) => <circle key={`d${p.i}`} cx={xi(p.i)} cy={yScale(p.v)} r="2.4" fill={color} />)}
          </>
        )}

        {/* Extrempunkt-Highlight */}
        {showHl && (
          <g>
            <circle cx={xi(hlIdx)} cy={hlY} r="6" fill="#FFFFFF" stroke={color} strokeWidth="2.5" />
            <g transform={`translate(${Math.max(plotX0 + 32, Math.min(plotX1 - 32, xi(hlIdx)))}, ${Math.max(plotY0 + 6, hlY - 18)})`}>
              <rect x="-32" y="-13" width="64" height="19" rx="9" fill="var(--ink-900, #2C2A26)" />
              <text y="0" className="ev-course-hlpill" textAnchor="middle">{hlText}</text>
            </g>
          </g>
        )}

        {/* X-Achse (Stunden) */}
        {course.map((c, i) => (n <= 13 || i % 2 === 0) ? (
          <g key={`x${i}`}>
            <line x1={xi(i)} y1={plotY1} x2={xi(i)} y2={plotY1 + 4} className="ev-course-tick" />
            <text x={xi(i)} y={plotY1 + 18} className="ev-course-hour" textAnchor="middle">{c.hour}</text>
          </g>
        ) : null)}
        <text x={plotX1} y={plotY1 + 18} className="ev-course-hour" textAnchor="end">Uhr</text>
      </svg>

      <p className="ev-course-cap">
        {metric === 'temp' ? <>Linie = Temperatur · <span className="ev-course-cap-dash">gestrichelt</span> = gefühlt</>
          : metric === 'wind' ? <>Linie = Wind · <span className="ev-course-cap-dash">gestrichelt</span> = Böen</>
          : <>Balken = Niederschlag je Stunde</>}
        {' · '}{formatDayLong(best.date)}
      </p>
    </div>
  );
}

/** Liegt das Eventfenster im Karten-Raster-Horizont (~1–2 Tage)? Nur dann gibt es
 *  echte Wetter-Layer für den Zeitraum — sonst wird die Event-Karte ausgeblendet. */
function eventWithinRasterHorizon(best: DayResult): boolean {
  const [startH, endH] = eventWindow(best);
  const hourOffset = (h: number) => (new Date(`${best.date}T${String(Math.min(23, h)).padStart(2, '0')}:00:00`).getTime() - Date.now()) / 3_600_000;
  const mid = (hourOffset(startH) + hourOffset(endH)) / 2;
  return mid <= RASTER_HORIZON_H;
}

/**
 * Wetterkarte fürs Event. Wird nur gerendert, wenn der beste Tag im Raster-
 * Horizont (~1–2 Tage) liegt (siehe eventWithinRasterHorizon) — dann gibt es
 * echte Karten-Rasterdaten für den Zeitraum. Die 2D-Karte (MapView) wird
 * eingebettet, zentriert auf den Ort, Layer + Zeit-Slider auf den Event-Zeitpunkt
 * vorpositioniert, sodass man das Wetter über den Zeitraum „durchspielen" kann.
 */
function EventMapSection({ location, best }: { location: EventQuery['location']; best: DayResult }) {
  const [mapLayer, setMapLayer] = useState<LayerKey>('temp');
  const [startH, endH] = eventWindow(best);
  const hourOffset = (h: number) => (new Date(`${best.date}T${String(Math.min(23, h)).padStart(2, '0')}:00:00`).getTime() - Date.now()) / 3_600_000;
  const startOffset = hourOffset(startH);
  const endOffset = hourOffset(endH);
  const initialHour = Math.max(0, (startOffset + endOffset) / 2);

  return (
    <div className="ev-livemap">
      <div className="ev-livemap-tabs ev-course-tabs" role="tablist" aria-label="Kartenebene">
        {MAP_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={mapLayer === t.id}
            className={`ev-course-tab${mapLayer === t.id ? ' is-active' : ''}`} onClick={() => setMapLayer(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ev-livemap-frame">
        <Suspense fallback={<div className="ev-livemap-loading"><span className="ev-spinner" aria-hidden="true" /> Karte wird geladen …</div>}>
          <EmbeddedMapView
            location={location}
            embedded
            initialActive={[mapLayer]}
            embeddedLayer={mapLayer}
            initialHour={initialHour}
            embedHourRange={[Math.max(0, startOffset), endOffset]}
          />
        </Suspense>
      </div>
      <p className="ev-livemap-cap">
        <IconClock size={13} /> Simuliertes Wetter für {formatDayLong(best.date)} — oben die Ebene wählen (Temperatur · Niederschlag · Wind), der Slider verschiebt die Zeit über deinen Zeitraum.
      </p>
    </div>
  );
}

function ScoreDonut({ score }: { score: number }) {
  const r = 34;
  const C = 2 * Math.PI * r;
  const filled = C * (score / 100);
  return (
    <svg className="ev-donut" width="92" height="92" viewBox="0 0 92 92" aria-label={`Score ${score} von 100`}>
      <g transform="translate(46 46)">
        <circle r={r} fill="none" stroke="var(--sand-200, #E0D6BE)" strokeWidth="8" />
        <circle r={r} fill="none" stroke={scoreColor(score)} strokeWidth="8"
          strokeDasharray={`${filled} ${C}`} transform="rotate(-90)" strokeLinecap="round" />
        <text textAnchor="middle" y="4" fontSize="24" fontWeight="600" fill="var(--ink-900, #2C2A26)"
          style={{ fontVariantNumeric: 'tabular-nums' }}>{score}</text>
        <text textAnchor="middle" y="18" fontSize="7" letterSpacing="0.18em" fill="var(--stone-400, #A89A82)">SCORE</text>
      </g>
    </svg>
  );
}

function FactorStat({ factor, primary, approx }: { factor: Factor; primary?: boolean; approx?: boolean }) {
  // Bei Tendenz-Tagen Werte sichtbar entschärfen (keine Scheingenauigkeit).
  const soft = approx && (factor.key === 'temp' || factor.key === 'wind');
  return (
    <div className={`ev-stat ev-stat-${factor.assessment}${primary ? ' ev-stat-primary' : ''}`}>
      <span className="ev-stat-label">
        <span className="ev-stat-dot" />{factor.label}
        {primary && <span className="ev-stat-key">wichtigste</span>}
      </span>
      <span className="ev-stat-value">{soft ? `~ ${factor.valueText}` : factor.valueText}</span>
    </div>
  );
}

function RankRow({ rank, day }: { rank: number | null; day: DayResult }) {
  const band = !day.summary ? 'nodata' : day.isBest ? 'best' : scoreBand(day.score);
  // KONF-US3: jenseits des verlässlichen Horizonts → Negativfaktor ohne
  // scheingenaue Zahl (mm/° in Klammern entfernen).
  const downside = day.isTendency ? day.downside.replace(/\s*\([^)]*\)/, '') : day.downside;
  return (
    <div className={`ev-rank ev-rank-${band}${day.isTendency ? ' ev-rank-tendency' : ''}`}>
      <span className="ev-rank-num">{rank != null ? rank : '–'}</span>
      <div className="ev-rank-day">
        <span className="ev-rank-date">
          {formatDayLong(day.date)}
          {day.isBest && <span className="ev-rank-badge">Bester Tag</span>}
          {day.summary && day.isTendency && <span className="ev-tendency-tag sm">Tendenz</span>}
        </span>
        <span className={`ev-rank-reason${day.summary ? '' : ' ev-rank-na'}`}>
          {day.summary ? capitalize(day.reason) : 'keine Vorhersage'}
          {/* US5: niedrig bewertete Tage zeigen den entscheidenden Negativfaktor */}
          {day.summary && downside && (band === 'mid' || band === 'low') && (
            <span className={`ev-rank-down ev-rank-down-${band === 'low' ? 'bad' : 'ok'}`}>↓ {downside}</span>
          )}
          {/* WIN-US3: Intra-Fenster-Risiko hervorheben (auch bei gutem Tagesmittel) */}
          {day.summary && day.risks.map((r, k) => <RiskChip key={k} risk={r} compact />)}
        </span>
      </div>
      {day.summary && <ConfBars confidence={day.confidence} />}
      {day.summary && (
        <div className="ev-rank-scorewrap">
          <div className="ev-rank-bar"><span style={{ width: `${day.score}%`, background: scoreColor(day.score) }} /></div>
          <span className="ev-rank-score" style={{ color: scoreColor(day.score) }}>{day.score}</span>
        </div>
      )}
    </div>
  );
}

/** Signal-Balken (3 Stufen) für die Konfidenz einer Empfehlung. */
function ConfBars({ confidence, withLabel = true }: { confidence: number; withLabel?: boolean }) {
  const { band, label } = confidenceTier(confidence);
  const filled = band === 'high' ? 3 : band === 'medium' ? 2 : 1;
  const pct = Math.round(confidence * 100);
  return (
    <span className={`ev-conf ev-conf-${band}`} title={`Konfidenz: ${label} (${pct} %)`}>
      <span className="ev-conf-bargroup" aria-hidden="true">
        {[0, 1, 2].map((i) => <i key={i} className={i < filled ? 'on' : ''} />)}
      </span>
      {withLabel && <span className="ev-conf-text">Konf. {pct} %</span>}
    </span>
  );
}

/**
 * Konfidenz-Verlauf über die Tage (chronologisch). Die Linie fällt mit dem
 * Vorlauf sichtbar ab und wandert durch die Hintergrund-Bänder Hoch→Mittel→
 * Gering — so wird „spätere Tage sind unsicherer" auf einen Blick erfassbar.
 */
function ConfidenceTimeline({ days }: { days: DayResult[] }) {
  const W = 640, H = 120, padL = 12, padR = 12, padT = 12, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = days.length;
  const x = (i: number) => (n <= 1 ? padL + plotW / 2 : padL + (plotW * i) / (n - 1));
  const y = (c: number) => padT + plotH * (1 - Math.max(0, Math.min(1, c)));
  const yTop = y(1), yBot = y(0), yHigh = y(0.7), yMed = y(0.45);

  const pts = days.map((d, i) => ({ d, cx: x(i), cy: y(d.confidence), hasData: !!d.summary }));
  const dataPts = pts.filter((p) => p.hasData);
  const line = dataPts.map((p, k) => `${k === 0 ? 'M' : 'L'} ${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(' ');
  const area = dataPts.length >= 2
    ? `${line} L ${dataPts[dataPts.length - 1].cx.toFixed(1)} ${yBot.toFixed(1)} L ${dataPts[0].cx.toFixed(1)} ${yBot.toFixed(1)} Z`
    : '';

  // KONF-US3: Trennlinie am verlässlichen Horizont — erster Tendenz-Tag.
  const firstTendency = pts.find((p) => p.hasData && p.d.isTendency);
  const lastReliable = [...pts].reverse().find((p) => p.hasData && !p.d.isTendency);
  const horizonX = firstTendency && lastReliable
    ? (lastReliable.cx + firstTendency.cx) / 2
    : firstTendency ? firstTendency.cx - 4 : null;

  return (
    <svg className="ev-tl" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label="Konfidenz der Empfehlung über die Tage — nimmt mit dem Vorlauf sichtbar ab; jenseits des verlässlichen Horizonts nur noch Tendenz">
      <rect x={padL} y={yTop} width={plotW} height={yHigh - yTop} className="ev-tl-band-high" />
      <rect x={padL} y={yHigh} width={plotW} height={yMed - yHigh} className="ev-tl-band-med" />
      <rect x={padL} y={yMed} width={plotW} height={yBot - yMed} className="ev-tl-band-low" />
      {horizonX != null && (
        <g>
          <line x1={horizonX} y1={yTop} x2={horizonX} y2={yBot} className="ev-tl-horizon" />
          <text x={horizonX + 5} y={yTop + 11} className="ev-tl-horizon-label">Tendenz →</text>
        </g>
      )}
      <text x={padL + 3} y={yTop + 12} className="ev-tl-yband">Hoch</text>
      <text x={padL + 3} y={yBot - 5} className="ev-tl-yband">Gering</text>
      {area && <path d={area} className="ev-tl-area" />}
      {line && <path d={line} className="ev-tl-line" />}
      {pts.map((p) => (
        <g key={p.d.date}>
          {p.hasData ? (
            <circle cx={p.cx} cy={p.cy} r={p.d.isBest ? 6 : 4}
              className={`ev-tl-dot ev-tl-${confidenceTier(p.d.confidence).band}${p.d.isBest ? ' ev-tl-dot-best' : ''}`} />
          ) : (
            <text x={p.cx} y={y(0.5)} className="ev-tl-gap" textAnchor="middle">–</text>
          )}
          <text x={p.cx} y={H - 9} className="ev-tl-xlabel" textAnchor="middle">{weekdayShort(p.d.date)}</text>
        </g>
      ))}
    </svg>
  );
}

/**
 * KONF-US4 — Warnung bei Widerspruch „gut bewertet, aber unsicher": macht die
 * Spannung Score↔Sicherheit deutlich und rät vom voreiligen Buchen ab. Bietet,
 * wenn vorhanden, eine verlässlichere Alternative im sicheren Horizont an.
 */
function ConflictWarning({ best, alt }: { best: DayResult; alt: DayResult | null }) {
  const pct = Math.round(best.confidence * 100);
  return (
    <div className="ev-conflict" role="alert">
      <span className="ev-conflict-icon" aria-hidden="true"><IconWarning size={18} /></span>
      <div className="ev-conflict-body">
        <strong className="ev-conflict-head">
          Top-Bewertung ({best.score}), aber erst {pct}&nbsp;% Sicherheit
        </strong>
        <p className="ev-conflict-text">
          {capitalize(best.confidenceNote.split(' · ')[0])} — diese Empfehlung kann noch kippen. Zum Einladen oder Buchen lieber abwarten.
          {alt && (
            <> Verlässlicher schon jetzt: <span className="ev-conflict-alt">{formatDayLong(alt.date)}</span> ({alt.score} Punkte · {Math.round(alt.confidence * 100)}&nbsp;% sicher).</>
          )}
        </p>
      </div>
    </div>
  );
}

/** Gesondertes Regenrisiko fürs Fenster (PRE-HOCH-US1 Trauung / PRE-EVENT-US1 Feier). */
function RainRiskCard({ phase, title }: { phase: PhaseResult; title: string }) {
  const risk = rainRiskFor(phase.summary!);
  const pct = Math.round(phase.confidence * 100);
  return (
    <div className={`ev-card ev-rain-card ev-rain-${risk.level}`} role="status">
      <span className="ev-rain-icon" aria-hidden="true">{risk.level === 'none' ? <IconSun size={24} /> : <IconRain size={24} />}</span>
      <div className="ev-rain-body">
        <span className="rt-eyebrow ev-rain-eyebrow">{title} · {fmtPhaseHours(phase.hours)}</span>
        <strong className="ev-rain-level">{risk.label}</strong>
        <p className="ev-rain-detail">
          {risk.detail} · Sicherheit {pct} %{phase.isTendency && ' · noch unsicher (Tendenz)'}
        </p>
      </div>
    </div>
  );
}

/**
 * Gewittergefahr fürs Eventfenster (#3). Holt — nur DE und nur wenn der beste
 * Tag im nahen CAPE-Horizont (~27 h) liegt — ICON-D2-CAPE + amtliche
 * Gewitterwarnung und fusioniert sie mit dem vorhergesagten Niederschlag
 * (Auslöser-Proxy) zum Gewittergefahr-Index. Liegt der Tag weiter draußen, gibt
 * es kein belastbares Gewittersignal → kein Fetch, keine Karte (ehrlich).
 */
function useEventStormOutlook(location: EventQuery['location'], forecast: PointForecast, best: DayResult): ConvectiveOutlook | null {
  const [storm, setStorm] = useState<ConvectiveOutlook | null>(null);
  const bestDate = best.date;
  useEffect(() => {
    setStorm(null);
    if (location.country !== 'DE') return;
    const [startH, endH] = eventWindow(best);
    const startMs = new Date(`${bestDate}T${String(Math.max(0, startH)).padStart(2, '0')}:00:00`).getTime();
    const endMs = new Date(`${bestDate}T${String(Math.min(23, endH)).padStart(2, '0')}:00:00`).getTime();
    const hoursToEnd = (endMs - Date.now()) / 3_600_000;
    if (hoursToEnd > 30 || endMs < Date.now() - 3_600_000) return; // außer CAPE-Reichweite / vorbei
    const ac = new AbortController();
    (async () => {
      try {
        const maxStep = Math.min(27, Math.max(3, Math.ceil(hoursToEnd) + 1));
        const [series, alerts] = await Promise.all([
          fetchCapeSeriesAtPoint(location.lat, location.lon, maxStep, ac.signal),
          fetchDwdAlerts(location.lat, location.lon, ac.signal).then((r) => r.alerts).catch(() => []),
        ]);
        if (ac.signal.aborted) return;
        const warnLevel = alerts.reduce((m, a) => (/gewitter/i.test(a.event) || /gewitter/i.test(a.headline) ? Math.max(m, a.level) : m), 0);
        const inWin = series.filter((s) => s.validAtMs >= startMs - 1_800_000 && s.validAtMs <= endMs + 1_800_000);
        const steps = inWin.map((s) => ({ atMs: s.validAtMs, capeJkg: s.capeJkg, precipMmH: precipAtMs(forecast, s.validAtMs) }));
        if (steps.length) setStorm(convectiveOutlook(steps, warnLevel));
      } catch { /* CAPE nicht erreichbar → keine Karte */ }
    })();
    return () => ac.abort();
  }, [location.country, location.lat, location.lon, bestDate, forecast]);
  return storm;
}

/** Niederschlag (mm/h) der Forecast-Stunde, die `atMs` am nächsten liegt (±45 min). */
function precipAtMs(forecast: PointForecast, atMs: number): number | null {
  let best: number | null = null, bestD = 45 * 60_000;
  for (const h of forecast.hours) { const d = Math.abs(h.timestamp.getTime() - atMs); if (d <= bestD) { bestD = d; best = h.precipitation; } }
  return best;
}

function ThunderstormCard({ outlook }: { outlook: ConvectiveOutlook }) {
  if (!outlook.capeAvailable) return null;
  const { index, peakAtMs } = outlook;
  if (index.level === 'none' || index.level === 'low') return null; // nur bei echter Gefahr
  const when = peakAtMs ? new Date(peakAtMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div className={`ev-card ev-storm-card ev-storm-${index.level}`} role="alert">
      <span className="ev-storm-icon" aria-hidden="true"><StormGlyph /></span>
      <div className="ev-storm-body">
        <span className="rt-eyebrow ev-storm-eyebrow">Gewittergefahr fürs Eventfenster{when ? ` · Spitze gegen ${when} Uhr` : ''}</span>
        <strong className="ev-storm-level">{index.label}</strong>
        <p className="ev-storm-detail">{index.drivers.join(' · ')}</p>
      </div>
    </div>
  );
}

function StormGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 16.9A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" /><polyline points="13 11 9 17 15 17 11 23" />
    </svg>
  );
}

/** PRE-HOCH-US2 — Wind-Warnung für Deko/Zelt/Frisur. */
function WeddingWindCard({ phase, hazard }: { phase: PhaseResult; hazard: ReturnType<typeof windHazardFor> }) {
  if (!hazard) return null;
  return (
    <div className={`ev-card ev-wind-card ev-wind-${hazard.level}`} role="alert">
      <span className="ev-wind-icon" aria-hidden="true"><IconWind size={24} /></span>
      <div className="ev-wind-body">
        <span className="rt-eyebrow ev-wind-eyebrow">Wind-Warnung · stärkste Böen in der {phase.label} ({fmtPhaseHours(phase.hours)})</span>
        <strong className="ev-wind-level">{hazard.label} — bis {Math.round(hazard.gust)} m/s</strong>
        <p className="ev-wind-detail">Gefährdet: {hazard.affects.join(' · ')}. {hazard.tip}</p>
      </div>
    </div>
  );
}

/** PRE-HOCH-US3 — Hitze-/Schwüle-Warnung für Gäste & Catering. */
function WeddingHeatCard({ phase, hazard }: { phase: PhaseResult; hazard: ReturnType<typeof heatHazardFor> }) {
  if (!hazard) return null;
  return (
    <div className={`ev-card ev-heat-card ev-heat-${hazard.level}`} role="alert">
      <span className="ev-heat-icon" aria-hidden="true">{hazard.muggy ? <IconThermometer size={24} /> : <IconSun size={24} />}</span>
      <div className="ev-heat-body">
        <span className="rt-eyebrow ev-heat-eyebrow">Hitze-Warnung · heißeste Phase: {phase.label} ({fmtPhaseHours(phase.hours)})</span>
        <strong className="ev-heat-level">{hazard.label} — gefühlt bis {Math.round(hazard.feels)} °C</strong>
        <p className="ev-heat-detail">Belastet: {hazard.affects.join(' · ')}. {hazard.tip}</p>
      </div>
    </div>
  );
}

/** PRE-HOCH-US4 — Warnung vor niedriger gefühlter Abendtemperatur. */
function EveningColdCard({ phase, hazard }: { phase: PhaseResult; hazard: ReturnType<typeof coldHazardFor> }) {
  if (!hazard) return null;
  return (
    <div className={`ev-card ev-cold-card ev-cold-${hazard.level}`} role="alert">
      <span className="ev-cold-icon" aria-hidden="true"><IconSnow size={24} /></span>
      <div className="ev-cold-body">
        <span className="rt-eyebrow ev-cold-eyebrow">Kälte am Abend · {phase.label} ({fmtPhaseHours(phase.hours)})</span>
        <strong className="ev-cold-level">{hazard.label} — gefühlt bis {Math.round(hazard.feels)} °C</strong>
        <p className="ev-cold-detail">{hazard.tip}</p>
      </div>
    </div>
  );
}

/** PRE-EVENT-US2 — gefühlte Temperatur + Wind fürs Feierfenster (immer sichtbar). */
function ComfortCard({ feltMin, feltMax, windMax, gustMax, windowLabel }: { feltMin: number; feltMax: number; windMax: number; gustMax: number; windowLabel: string }) {
  const flame = gustMax < 8 ? 'offene Flamme & Kerzen unkritisch'
    : gustMax < 13 ? 'Kerzen/offene Flamme windgeschützt aufstellen'
    : 'offene Flamme riskant — Deko & Kerzen sichern';
  const comfort = feltMax < 15 ? 'durchweg kühl — warme Optionen bereithalten'
    : feltMin >= 27 ? 'heiß — Schatten & Getränke einplanen'
    : feltMin < 12 ? 'tagsüber mild, später frisch — Decken bereithalten'
    : 'angenehm temperiert';
  return (
    <div className="ev-card ev-comfort-card" role="status">
      <span className="ev-comfort-icon" aria-hidden="true"><IconThermometer size={24} /></span>
      <div className="ev-comfort-body">
        <span className="rt-eyebrow ev-comfort-eyebrow">Komfort im Feierfenster · {windowLabel}</span>
        <strong className="ev-comfort-vals">
          Gefühlt {feltMin === feltMax ? `${feltMax}` : `${feltMin}–${feltMax}`} °C · Wind {windMax} m/s{gustMax >= windMax + 2 ? ` (Böen ${gustMax})` : ''}
        </strong>
        <p className="ev-comfort-detail">{comfort} · {flame}</p>
      </div>
    </div>
  );
}

/** WIN-US3 — Marker für ein Schlechtwetter-Risiko genau im Eventfenster. */
function RiskChip({ risk, compact }: { risk: WindowRisk; compact?: boolean }) {
  return (
    <span className={`ev-risk-chip ev-risk-${risk.severity}`} title={`${risk.label}: ${risk.detail}`}>
      {risk.kind === 'rain' ? <IconRain size={13} /> : <IconWind size={13} />}
      {compact ? risk.label : `${risk.label} · ${risk.detail}`}
    </span>
  );
}

/** WIN-US3 — prominenter Hinweis, dass ungünstiges Wetter genau ins Fenster fällt. */
function WindowRiskBanner({ risks, multiPhase }: { risks: WindowRisk[]; multiPhase: boolean }) {
  const alert = risks.some((r) => r.severity === 'alert');
  return (
    <div className={`ev-riskbanner${alert ? ' ev-riskbanner-alert' : ''}`} role="alert">
      <span className="ev-riskbanner-icon" aria-hidden="true"><IconWarning size={18} /></span>
      <p className="ev-riskbanner-text">
        <strong>Genau im {multiPhase ? 'Eventfenster' : 'Fenster'}:</strong>{' '}
        {risks.map((r) => `${r.label} (${r.detail})`).join(' · ')} — fällt mitten in deine Zeit, auch wenn der Tag insgesamt günstig wirkt.
      </p>
    </div>
  );
}

/** WIN-US2 — Einzelbewertung je Phase (Trauung/Empfang/Abendfeier …). */
function PhaseBreakdown({ phases }: { phases: PhaseResult[] }) {
  const worst = phases.filter((p) => p.summary).reduce<PhaseResult | null>((a, b) => (!a || b.score < a.score ? b : a), null);
  return (
    <div className="ev-phase-list">
      {phases.map((p, i) => {
        const band = !p.summary ? 'nodata' : scoreBand(p.score);
        const isWorst = p.summary && worst != null && p === worst;
        return (
          <div key={i} className={`ev-phase ev-phase-${band}${isWorst ? ' ev-phase-worst' : ''}`}>
            <div className="ev-phase-when">
              <span className="ev-phase-label">{p.label}{isWorst && <span className="ev-phase-tag">Engpass</span>}</span>
              <span className="ev-phase-hours">{fmtPhaseHours(p.hours)}</span>
            </div>
            <div className="ev-phase-body">
              {p.summary ? (
                <span className="ev-phase-reason">
                  {capitalize(p.reason)}
                  {p.isTendency && <span className="ev-tendency-tag sm">Tendenz</span>}
                  {p.risks.map((r, k) => <RiskChip key={k} risk={r} />)}
                </span>
              ) : (
                <span className="ev-phase-reason ev-rank-na">keine Vorhersage</span>
              )}
            </div>
            {p.summary && (
              <div className="ev-phase-scorewrap">
                <ConfBars confidence={p.confidence} withLabel={false} />
                <span className="ev-phase-score" style={{ color: scoreColor(p.score) }}>{p.score}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Prominente Konfidenz-Pille im Hero. */
function ConfPill({ confidence }: { confidence: number }) {
  const { band, label } = confidenceTier(confidence);
  const pct = Math.round(confidence * 100);
  return (
    <span className={`ev-conf-pill ev-conf-${band}`}>
      <ConfBars confidence={confidence} withLabel={false} />
      Konfidenz {label} · {pct} %
    </span>
  );
}

// --- Fotografie-Licht (Epic FOTO) --------------------------------------------

/**
 * Foto-Lichtlage: exakte goldene/blaue Stunde je Tag (US1), Bewölkungsqualität
 * (US2), Nebel-/Abendrot-Chance (US3) und eine ehrliche Licht-Wahrscheinlichkeit
 * statt Garantie (US4). Nur für den Foto-Anlass.
 */
function PhotoLightSection({ rec, query, forecast }: { rec: EventRecommendation; query: EventQuery; forecast: PointForecast }) {
  const { lat, lon } = query.location;
  const best = rec.days[rec.bestIndex];
  const bestPhoto = buildPhotoDay(forecast, best.date, lat, lon, best.confidence);
  // Chronologische Liste aller Kandidatentage.
  const list = rec.days.map((d) => ({ day: d, photo: buildPhotoDay(forecast, d.date, lat, lon, d.confidence) }));

  return (
    <>
      <div className="ev-section-head">
        <span className="rt-eyebrow">Foto-Licht</span>
        <span className="ev-section-sub">goldene & blaue Stunde · Lichtqualität · Chancen</span>
      </div>

      {/* Bester Tag — ausführlich */}
      <div className="ev-card fo-hero">
        <div className="fo-hero-head">
          <span className="fo-hero-icon" aria-hidden="true"><IconCamera size={24} /></span>
          <div>
            <span className="rt-eyebrow">Bester Foto-Tag</span>
            <h3 className="fo-hero-day">{formatDayLong(best.date)}</h3>
          </div>
          {bestPhoto.lightProbability != null && (
            <div className="fo-prob">
              <span className="fo-prob-val">~{bestPhoto.lightProbability}%</span>
              <span className="fo-prob-label">gutes Licht</span>
            </div>
          )}
        </div>

        <LightWindowGrid w={bestPhoto.windows} />

        {/* US2 — Bewölkungsqualität */}
        {(bestPhoto.eveningMood || bestPhoto.morningMood) && (
          <div className="fo-moods">
            {bestPhoto.eveningMood && bestPhoto.eveningMood.kind !== 'unknown' && <MoodCard when="Abendlicht" mood={bestPhoto.eveningMood} />}
            {bestPhoto.morningMood && bestPhoto.morningMood.kind !== 'unknown' && <MoodCard when="Morgenlicht" mood={bestPhoto.morningMood} />}
            <p className="fo-mood-note">Die Bewölkungsart bestimmt den Faktor <strong>Licht</strong> in der Tagesbewertung.</p>
          </div>
        )}

        {/* US3 — Chancen */}
        {(bestPhoto.fog.level !== 'low' || bestPhoto.afterglow.level !== 'low') && (
          <div className="fo-chances">
            {bestPhoto.fog.level !== 'low' && <ChanceBadge kind="fog" chance={bestPhoto.fog} />}
            {bestPhoto.afterglow.level !== 'low' && <ChanceBadge kind="afterglow" chance={bestPhoto.afterglow} />}
          </div>
        )}

        {/* US4 — Wahrscheinlichkeit, keine Garantie */}
        <p className="fo-disclaimer">
          {bestPhoto.lightProbability != null
            ? <>Gutes Fotolicht ist <strong>~{bestPhoto.lightProbability}&nbsp;% wahrscheinlich</strong> — eine Wahrscheinlichkeit, keine Garantie für perfektes Licht.</>
            : <>Lichtfenster sind exakt berechnet; eine Wetter-Wahrscheinlichkeit gibt es erst im Vorhersage-Horizont.</>}
        </p>
      </div>

      {/* Lichtfenster je Tag (US1) */}
      <div className="fo-daylist">
        {list.map(({ day, photo }) => <PhotoDayRow key={day.date} day={day} photo={photo} isBest={day.date === best.date} />)}
      </div>
      <p className="ev-days-note">Lichtfenster aus Sonnenstand (exakt). Lichtqualität & Chancen sind Wahrscheinlichkeiten — keine Garantie.</p>
    </>
  );
}

/** Auf-/Untergang + blaue/goldene Stunde morgens & abends. */
function LightWindowGrid({ w }: { w: LightWindows }) {
  if (w.note === 'midnight-sun') return <p className="fo-polar"><IconSun size={15} /> Mitternachtssonne — keine echte Dämmerung an diesem Tag.</p>;
  if (w.note === 'no-twilight') return <p className="fo-polar"><IconMoon size={15} /> Dämmerungsnah dunkel — keine goldene/blaue Stunde an diesem Tag.</p>;
  return (
    <div className="fo-windows">
      <div className="fo-win-col">
        <span className="fo-win-head"><IconSunrise size={15} /> Morgens · Aufgang {fmtClock(w.sunrise)}</span>
        <span className="fo-win-row fo-win-blue">Blaue Stunde <b>{fmtSpan(w.blueMorning)}</b></span>
        <span className="fo-win-row fo-win-gold">Goldene Stunde <b>{fmtSpan(w.goldenMorning)}</b></span>
      </div>
      <div className="fo-win-col">
        <span className="fo-win-head"><IconSunset size={15} /> Abends · Untergang {fmtClock(w.sunset)}</span>
        <span className="fo-win-row fo-win-gold">Goldene Stunde <b>{fmtSpan(w.goldenEvening)}</b></span>
        <span className="fo-win-row fo-win-blue">Blaue Stunde <b>{fmtSpan(w.blueEvening)}</b></span>
      </div>
    </div>
  );
}

function MoodCard({ when, mood }: { when: string; mood: CloudMood }) {
  const MoodGlyph = mood.kind === 'harsh' ? IconSun : IconCloud;
  return (
    <div className={`fo-mood fo-mood-${mood.kind}`}>
      <span className="fo-mood-emoji" aria-hidden="true"><MoodGlyph size={22} /></span>
      <div className="fo-mood-body">
        <span className="fo-mood-when">{when}</span>
        <strong className="fo-mood-label">{mood.label}</strong>
        <span className="fo-mood-desc">{mood.note}</span>
      </div>
    </div>
  );
}

function ChanceBadge({ kind, chance }: { kind: 'fog' | 'afterglow'; chance: ChanceAssessment }) {
  const Glyph = kind === 'fog' ? IconFog : IconSunset;
  const name = kind === 'fog' ? 'Nebel-Chance' : 'Abendrot-Chance';
  return (
    <span className={`fo-chance fo-chance-${chance.level}`}>
      <Glyph size={14} /> {name} {chanceLabel(chance.level)} <b>~{Math.round(chance.prob * 100)} %</b>
    </span>
  );
}

/** Kompakte Tageszeile: goldene Stunde AM/PM + Chancen + Licht-Wahrscheinlichkeit. */
function PhotoDayRow({ day, photo, isBest }: { day: DayResult; photo: PhotoDay; isBest: boolean }) {
  const w = photo.windows;
  return (
    <div className={`fo-day${isBest ? ' is-best' : ''}`}>
      <div className="fo-day-date">
        {formatDayLong(day.date)}
        {isBest && <span className="ev-rank-badge">Bester</span>}
      </div>
      <div className="fo-day-times">
        <span className="fo-day-t fo-win-gold" title="Goldene Stunde morgens"><IconSunrise size={14} /> {fmtSpan(w.goldenMorning)}</span>
        <span className="fo-day-t fo-win-gold" title="Goldene Stunde abends"><IconSunset size={14} /> {fmtSpan(w.goldenEvening)}</span>
      </div>
      <div className="fo-day-tags">
        {photo.fog.level !== 'low' && <span className="fo-tag fo-tag-fog"><IconFog size={13} /> Nebel</span>}
        {photo.afterglow.level !== 'low' && <span className="fo-tag fo-tag-glow"><IconSunset size={13} /> Abendrot</span>}
        {photo.lightProbability != null && <span className="fo-day-prob">~{photo.lightProbability} % Licht</span>}
      </div>
    </div>
  );
}

// --- Astrofotografie & Sternenbeobachtung (Epic ASTRO) -----------------------

/**
 * Astro-Nächte: Lichtverschmutzung am Ort (US5), beste Nacht im Zeitraum (US1)
 * mit mehrschichtiger Bewölkung (US2), Mondphase (US3), Tau-/Feuchterisiko (US4),
 * Dunkelheitszeiten (US6) und ehrlicher Konfidenz (US7). Nur „Sterne schauen".
 */
function AstroNightSection({ rec, query, forecast }: { rec: EventRecommendation; query: EventQuery; forecast: PointForecast }) {
  const { lat, lon } = query.location;
  const lp = estimateLightPollution(lat, lon);
  const nights = rec.days.map((d) => buildAstroNight(forecast, d.date, lat, lon, d.confidence, d.isTendency));
  const ranking = rankAstroNights(nights);
  const best = ranking.bestIndex >= 0 ? ranking.nights[ranking.bestIndex] : null;

  // Nach Astro-Score absteigend, Nächte ohne Wetterdaten ans Ende.
  const ranked = [...ranking.nights].sort((a, b) => {
    if (a.hasWeather && b.hasWeather) return b.score - a.score || a.dateISO.localeCompare(b.dateISO);
    if (a.hasWeather) return -1;
    if (b.hasWeather) return 1;
    return a.dateISO.localeCompare(b.dateISO);
  });

  return (
    <>
      <div className="ev-section-head">
        <span className="rt-eyebrow">Astro-Nächte</span>
        <span className="ev-section-sub">beste Nacht · Mond · Wolkenschichten · Dunkelheit</span>
      </div>

      {/* US5 — Lichtverschmutzung am Ort */}
      <LightPollutionCard lp={lp} location={query.location} />

      {best ? (
        <>
          <AstroBestNight night={best} />
          <div className="as-list">
            {ranked.map((n) => <AstroNightRow key={n.dateISO} night={n} isBest={n.isBest} />)}
          </div>
          {/* US7 — ehrliche Verlässlichkeit */}
          <p className="ev-days-note">
            Dunkelheits- und Mondzeiten sind exakt berechnet. Bewölkung, Seeing und Taubildung sind Prognosen, die oft
            danebenliegen — daher trägt jede Nacht eine erkennbare Konfidenz, keine Garantie.
          </p>
        </>
      ) : (
        <div className="ev-card ev-state"><p>Für die Nächte liegt noch keine belastbare Bewölkungsvorhersage vor — Dunkelheits- und Mondzeiten siehe unten.</p></div>
      )}
    </>
  );
}

function LightPollutionCard({ lp, location }: { lp: LightPollution; location: { name: string; country: string } }) {
  return (
    <div className={`ev-card as-lp as-bortle-${lp.bortle <= 3 ? 'dark' : lp.bortle <= 5 ? 'mid' : 'bright'}`} role="status">
      <span className="as-lp-icon" aria-hidden="true">{lp.bortle <= 3 ? <IconStars size={24} /> : lp.bortle <= 5 ? <IconCity size={24} /> : <IconLamp size={24} />}</span>
      <div className="as-lp-body">
        <span className="rt-eyebrow">Himmelsaufhellung · {flagForCountry(location.country)} {shortPlace(location.name)}</span>
        <strong className="as-lp-label">Bortle ~{lp.bortle} · {lp.label}</strong>
        <p className="as-lp-note">{lp.note} Nächste Großstadt: {lp.nearestCity} (~{lp.nearestKm} km). <em>Schätzung aus Stadtnähe, kein Messwert.</em></p>
      </div>
    </div>
  );
}

function AstroBestNight({ night }: { night: AstroNight }) {
  const dk = night.darkness;
  return (
    <div className="ev-card as-best">
      <div className="as-best-head">
        <span className="as-best-icon" aria-hidden="true"><IconTelescope size={24} /></span>
        <div>
          <span className="rt-eyebrow">Beste Nacht</span>
          <h3 className="as-best-day">{formatNight(night.dateISO)}</h3>
        </div>
        <div className="as-best-score" style={{ color: scoreColor(night.score) }}>{night.score}</div>
      </div>

      {/* US6 — Dunkelheit */}
      <div className="as-row">
        <span className="as-row-label"><IconStars size={15} /> Volle Dunkelheit</span>
        <span className="as-row-val">
          {dk.note === 'no-darkness' ? 'keine astronomische Dunkelheit (helle Sommernacht)'
            : dk.note === 'all-night' ? 'die ganze Nacht'
            : `${fmtClock(dk.dusk)}–${fmtClock(dk.dawn)} · ${dk.durationH.toFixed(1).replace('.', ',')} h`}
        </span>
      </div>

      {/* US3 — Mond */}
      <div className="as-row">
        <span className="as-row-label"><IconMoon size={15} /> Mond</span>
        <span className="as-row-val">
          {night.moon.phase} · {Math.round(night.moon.illumination * 100)} % beleuchtet
          {night.moon.illumination >= 0.1 && (night.moon.upDuringNight ? ' · stört (über Horizont)' : ' · unter Horizont, stört kaum')}
        </span>
      </div>

      {/* US4 — Tau/Feuchte */}
      <div className="as-row">
        <span className="as-row-label"><IconDrop size={15} /> Taurisiko</span>
        <span className="as-row-val">
          <span className={`as-dew as-dew-${night.dew.level}`}>{night.dew.level === 'high' ? 'hoch' : night.dew.level === 'moderate' ? 'erhöht' : 'gering'}</span>
          {night.dew.spreadC != null && <> · Spanne T−Taupunkt {night.dew.spreadC} °C{night.dew.dewPointC != null ? ` (Taupunkt ${night.dew.dewPointC} °C)` : ''}</>}
          {night.dew.level !== 'low' && ' — Taukappe/Heizung einplanen'}
        </span>
      </div>

      {/* US2 — mehrschichtige Bewölkung */}
      <CloudLayers cloud={night.cloud} />

      {/* US7 — Konfidenz */}
      <div className="as-conf">
        <ConfBars confidence={night.confidence} />
        <span className="as-conf-note">
          {night.isTendency ? 'Noch Tendenz — Bewölkung kann kippen.' : 'Bewölkungsprognose mit dieser Sicherheit'} · keine Garantie für klare Sicht.
        </span>
      </div>
    </div>
  );
}

/** US2 — Bewölkung nach Höhenschichten (tief/mittel/hoch) statt einem Wert. */
function CloudLayers({ cloud }: { cloud: AstroNight['cloud'] }) {
  if (cloud.total == null) return <p className="as-cloud-nodata">Keine Bewölkungsdaten (außerhalb des Vorhersage-Horizonts).</p>;
  const rows: Array<{ label: string; v: number | null; hint?: string }> = [
    { label: 'Hoch', v: cloud.high, hint: 'dünne Schleier stören schon' },
    { label: 'Mittel', v: cloud.mid },
    { label: 'Tief', v: cloud.low },
  ];
  return (
    <div className="as-clouds">
      <span className="as-clouds-head">Bewölkung nach Schichten · gesamt {cloud.total} %</span>
      {rows.map((r) => (
        <div key={r.label} className="as-cloud-row">
          <span className="as-cloud-name">{r.label}</span>
          <div className="as-cloud-bar"><span style={{ width: `${r.v ?? 0}%` }} /></div>
          <span className="as-cloud-val">{r.v != null ? `${r.v} %` : '—'}</span>
          {r.hint && <span className="as-cloud-hint">{r.hint}</span>}
        </div>
      ))}
    </div>
  );
}

function AstroNightRow({ night, isBest }: { night: AstroNight; isBest: boolean }) {
  const dk = night.darkness;
  const darkText = dk.note === 'no-darkness' ? 'keine Dunkelheit' : dk.note === 'all-night' ? 'ganze Nacht' : `${fmtClock(dk.dusk)}–${fmtClock(dk.dawn)}`;
  return (
    <div className={`as-night${isBest ? ' is-best' : ''}${night.hasWeather ? '' : ' as-night-nodata'}`}>
      <div className="as-night-main">
        <span className="as-night-date">
          {formatNight(night.dateISO)}
          {isBest && <span className="ev-rank-badge">Beste Nacht</span>}
          {night.hasWeather && night.isTendency && <span className="ev-tendency-tag sm">Tendenz</span>}
        </span>
        <span className="as-night-reason">{night.hasWeather ? capitalize(night.reason) : 'keine Bewölkungsvorhersage'}</span>
        <span className="as-night-sub"><IconMoon size={12} /> {Math.round(night.moon.illumination * 100)} % · <IconStars size={12} /> {darkText}{night.hasWeather && night.dew.level !== 'low' ? <> · <IconDrop size={12} /> Tau</> : ''}</span>
      </div>
      {night.hasWeather && <ConfBars confidence={night.confidence} />}
      {night.hasWeather && (
        <div className="ev-rank-scorewrap">
          <div className="ev-rank-bar"><span style={{ width: `${night.score}%`, background: scoreColor(night.score) }} /></div>
          <span className="ev-rank-score" style={{ color: scoreColor(night.score) }}>{night.score}</span>
        </div>
      )}
    </div>
  );
}

function formatNight(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const next = new Date(d.getTime() + 86_400_000);
  const a = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  const b = next.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  return `Nacht ${a} → ${b}`;
}

// --- Plan B / Ausweich-Logik (Epic PLANB) ------------------------------------

/** Plan-B-Block: Schwellen-Status (US1), Empfehlung (US2), Ausweichtag (US3),
 *  Entscheidungsfrist (US4) und Ausweichort (US5). Nur wenn Plan B aktiviert. */
function PlanBSection({ query, rec }: { query: EventQuery; rec: EventRecommendation }) {
  const assess: PlanBAssessment | null = assessPlanB(query, rec);
  if (!assess) return null;
  const venue = planBVenueDef(query.planB.venue);
  return (
    <>
      <div className="ev-section-head">
        <span className="rt-eyebrow">Plan B</span>
        <span className="ev-section-sub">Schwelle: {assess.metricLabel} {assess.thresholdText}</span>
      </div>

      <div className={`ev-card ev-planb ev-planb-${assess.triggered ? 'on' : 'ok'}`} role={assess.triggered ? 'alert' : 'status'}>
        <span className="ev-planb-icon" aria-hidden="true">{assess.triggered ? <IconWarning size={22} /> : <IconCheck size={22} />}</span>
        <div className="ev-planb-body">
          <span className="rt-eyebrow ev-planb-eyebrow">
            {assess.targetIsWish ? 'Wunschtag' : 'Bester Tag'} · {formatDayLong(assess.targetDate)}
          </span>
          <strong className="ev-planb-status">
            {assess.metricLabel}: {assess.valueText} — {assess.triggered ? `${assess.thresholdText} ⇒ Plan B` : 'Plan A hält'}
          </strong>
          {assess.triggered ? (
            <p className="ev-planb-rec"><span aria-hidden="true"><VenueIcon id={query.planB.venue} size={16} /></span> {assess.recommendation}</p>
          ) : (
            <p className="ev-planb-rec ev-planb-ok-text">Im grünen Bereich — kein Plan B nötig. Ausweich-Option bereit: <VenueIcon id={query.planB.venue} size={14} /> {venue.label}.</p>
          )}
          <p className={`ev-planb-decision${assess.decision.reliableNow ? ' is-ready' : ''}`}><IconClock size={13} /> {assess.decision.note}</p>
        </div>
      </div>

      {assess.triggered && assess.alternative && <AusweichtagCard alt={assess.alternative} target={assess.targetDay} />}

      <AltLocationFinder query={query} targetDate={assess.targetDate} homeScore={assess.targetDay.score} triggered={assess.triggered} />
    </>
  );
}

/** PLANB-US3 — besser bewerteter Ausweichtag. */
function AusweichtagCard({ alt, target }: { alt: DayResult; target: DayResult }) {
  return (
    <div className="ev-card ev-altday" role="status">
      <span className="ev-altday-icon" aria-hidden="true"><IconArrowUpRight size={22} /></span>
      <div className="ev-altday-body">
        <span className="rt-eyebrow ev-altday-eyebrow">Ausweichtag-Vorschlag</span>
        <strong className="ev-altday-title">{formatDayLong(alt.date)} ist besser — Score {alt.score} statt {target.score}</strong>
        <p className="ev-altday-reason">
          {capitalize(alt.reason)} · {Math.round(alt.confidence * 100)} % sicher{alt.isTendency ? ' (Tendenz)' : ''}. {lowerFirst(alt.rationale)}
        </p>
      </div>
      <span className="ev-altday-score" style={{ color: scoreColor(alt.score) }}>{alt.score}</span>
    </div>
  );
}

type AltLocState =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'found'; cand: AltLocationCandidate }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

/** PLANB-US5 — besser geeigneten Ort in der Nähe suchen (gezielte Aktion). */
function AltLocationFinder({ query, targetDate, homeScore, triggered }: { query: EventQuery; targetDate: string; homeScore: number; triggered: boolean }) {
  const [state, setState] = useState<AltLocState>({ kind: 'idle' });
  const acRef = useRef<AbortController | null>(null);
  useEffect(() => () => acRef.current?.abort(), []);

  const search = async () => {
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setState({ kind: 'searching' });
    try {
      const cand = await findBetterLocation({ query, targetDate, homeScore, signal: ac.signal });
      if (ac.signal.aborted) return;
      setState(cand ? { kind: 'found', cand } : { kind: 'none' });
    } catch (err) {
      if (ac.signal.aborted) return;
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Suche fehlgeschlagen' });
    }
  };

  return (
    <div className="ev-card ev-altloc">
      <div className="ev-altloc-head">
        <span className="rt-eyebrow ev-altloc-eyebrow">Ausweichort {triggered ? '— Termin retten' : '(optional)'}</span>
        <button type="button" className="ev-add-btn" disabled={state.kind === 'searching'} onClick={() => void search()}>
          {state.kind === 'searching' ? 'Suche läuft …' : `Besseren Ort im Umkreis (${ALT_RADIUS_KM} km) suchen`}
        </button>
      </div>
      {state.kind === 'idle' && (
        <p className="ev-altloc-hint">Prüft Orte rund um {shortLocationName(query.location.name)} für den {formatDayLong(targetDate)}.</p>
      )}
      {state.kind === 'found' && (
        <p className="ev-altloc-result ev-altloc-hit">
          <IconPin size={14} /> <strong>{shortLocationName(state.cand.location.name)}</strong> ({state.cand.distanceKm} km {state.cand.bearing}) — Score {state.cand.score} statt {homeScore} (+{state.cand.scoreDelta}). Dorthin ausweichen könnte den Termin retten.
        </p>
      )}
      {state.kind === 'none' && (
        <p className="ev-altloc-result">Kein klar besserer Ort im Umkreis von {ALT_RADIUS_KM} km — der Wunschort ist die beste Wahl in der Nähe.</p>
      )}
      {state.kind === 'error' && <p className="ev-altloc-result ev-altloc-err"><IconWarning size={14} /> {state.message}</p>}
    </div>
  );
}

// --- Helfer ------------------------------------------------------------------

function scoreColor(score: number): string {
  // Gut = unser Orange (terracotta), mittel = amber, schwach/kritisch = neutrales
  // Slate — so bleibt „gut" klar von „kritisch" unterscheidbar, obwohl Grün raus ist.
  if (score >= 70) return 'var(--terracotta-500, #C97B47)';
  if (score >= 45) return 'var(--amber-500, #D4A373)';
  return 'var(--slate-500, #6B7A8F)';
}
function scoreBand(score: number): 'good' | 'mid' | 'low' {
  return score >= 70 ? 'good' : score >= 45 ? 'mid' : 'low';
}
function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function lowerFirst(s: string): string { return s.charAt(0).toLowerCase() + s.slice(1); }
function shortPlace(name: string): string { return name.split(',')[0]; }

function formatDayLong(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}
function weekdayShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
}
/** Tag-des-Monats mit Punkt, ohne führende Null (z. B. "2026-06-08" → "8."). */
function dayNum(iso: string): string {
  return `${Number(iso.slice(8, 10))}.`;
}
