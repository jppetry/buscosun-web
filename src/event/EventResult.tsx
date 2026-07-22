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
  recommendBestDay, candidateDays, hoursNeededFor, confidenceTier, rainRiskFor, windHazardFor, heatHazardFor, coldHazardFor, safetyScore,
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
  VenueIcon, IconRain, IconSun, IconWind, IconThermometer, IconSnow,
  IconWarning, IconCheck, IconArrowUpRight, IconPin, IconClock, IconCamera, IconSunrise,
  IconSunset, IconFog, IconCloud, IconMoon, IconDrop, IconCity, IconLamp, IconStars, IconTelescope,
} from './eventIcons';
import { fmtSpan, fmtClock, type LightWindows } from '../photo/sun';
import { buildPhotoDay, chanceLabel, type PhotoDay, type CloudMood, type ChanceAssessment } from '../photo/photoLight';
import { estimateLightPollution, type LightPollution } from '../astro/lightPollution';
import { buildAstroNight, rankAstroNights, type AstroNight } from '../astro/astroNight';
import type { PointForecast, PointForecastHour } from '../pointForecast/types';
import { useIsMobile } from '../mobile/useIsMobile';
import NotificationCenter from '../notifications/NotificationCenter';
import {
  DeckActivityIcon,
  IconDeckMap, IconDeckRadar, IconDeckEvent, IconDeckEventPlain, IconDeckTour, IconDeckGear,
  IconDeckSearch, IconDeckArrowRight, IconDeckCalendar,
  IconDeckShare, IconDeckSun, IconDeckStorm, IconDeckHouse, IconDeckStarNav,
} from './eventIcons';
import './eventDeck.css';
// Bewusst zusätzlich geladen: die wiederverwendeten Detail-Bausteine (Ablauf-Chart,
// Karte, Rangliste, Konfidenz-Timeline, Plan-B-Sektion, Foto/Astro/Hochzeit-Karten)
// nutzen weiterhin ihre ev-/rt-Klassen. EventPage.css ist vollständig klassen-
// gescoped (keine globalen Selektoren) → kein Konflikt mit dem evd-Deck.
import './EventPage.css';

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
  /** Zurück zum App-Hub (Rail/Logo/Bottom-Nav). Optional — ohne bleibt „Angaben ändern". */
  onBack?: () => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rec: EventRecommendation; forecast: PointForecast };

export default function EventResult({ query, onEdit, onBack }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const isMobile = useIsMobile();
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

  if (state.kind === 'ready' && state.rec.bestIndex >= 0) {
    return (
      <Recommendation
        rec={state.rec} query={query} forecast={state.forecast}
        activityLabel={query.activity.label} datesMode={query.window.mode === 'dates'}
        onEdit={onEdit} onBack={onBack} isMobile={isMobile}
      />
    );
  }

  // Lade-/Fehler-/Kein-Forecast-Zustände in derselben Deck-Schale.
  const body =
    state.kind === 'loading' ? (
      <div className="evd-panel" style={{ display: 'grid', placeItems: 'center', gap: 12, minHeight: 200, textAlign: 'center' }}>
        <span className="ev-spinner" aria-hidden="true" />
        <p style={{ color: 'var(--stone-600)' }}>Wir vergleichen das Wetter an deinen Tagen …</p>
      </div>
    ) : state.kind === 'error' ? (
      <div className="evd-panel" style={{ display: 'grid', placeItems: 'center', gap: 12, minHeight: 200, textAlign: 'center' }}>
        <p style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--evd-critical)' }}><IconWarning size={16} /> {state.message}</p>
        <button type="button" className="evd-btn-primary" onClick={onEdit}>Erneut versuchen</button>
      </div>
    ) : (
      <div className="evd-panel"><NoForecast /></div>
    );

  return <ResultStateShell query={query} onEdit={onEdit} onBack={onBack} isMobile={isMobile}>{body}</ResultStateShell>;
}

/* Deck-Schale für Lade-/Fehlerzustände (ohne Empfehlungsdaten). */
function ResultStateShell({ query, onEdit, onBack, isMobile, children }: { query: EventQuery; onEdit: () => void; onBack?: () => void; isMobile: boolean; children: React.ReactNode }) {
  if (isMobile) {
    return (
      <div className="evd-m-root">
        <MobileResultHeader query={query} onEdit={onEdit} onBack={onBack} />
        <div className="evd-m-scroll evd-m-scroll--nav">{children}</div>
        <ResultBottomNav onBack={onBack} />
      </div>
    );
  }
  return (
    <div className="evd-root">
      <ResultTopbar query={query} onEdit={onEdit} onBack={onBack} />
      <div className="evd-body">
        <ResultRail onBack={onBack} />
        <div className="evd-center evd-scroll">{children}</div>
      </div>
    </div>
  );
}

/* ---- geteilte Deck-Chrome-Bausteine ---- */
function ResultTopbar({ query, onEdit, onBack }: { query: EventQuery; onEdit: () => void; onBack?: () => void }) {
  return (
    <div className="evd-topbar">
      <div className="evd-brandwrap">
        <img src="/buscosun-mark.svg" width={26} height={26} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        <button className="evd-brand" onClick={() => (onBack ? onBack() : onEdit())}>buscosun</button>
      </div>
      <div className="evd-topdivider" />
      <div className="evd-topsearch">
        <IconDeckSearch />
        <span className="evd-topsearch-name">{flagForCountry(query.location.country)} {shortPlace(query.location.name)}</span>
        <button className="evd-link" onClick={onEdit}>Ändern</button>
      </div>
      <div className="evd-topright">
        <div className="evd-live"><span className="evd-live-dot" /><span className="evd-live-txt">DATEN LIVE</span></div>
        <NotificationCenter />
        <span className="evd-avatar">JK</span>
      </div>
    </div>
  );
}

function ResultRail({ onBack }: { onBack?: () => void }) {
  return (
    <nav className="evd-rail" aria-label="Werkzeuge">
      <button className="evd-rail-btn" title="Wetterkarte" onClick={onBack}><IconDeckMap /></button>
      <button className="evd-rail-btn" title="Regenradar" onClick={onBack}><IconDeckRadar /></button>
      <button className="evd-rail-btn evd-rail-btn--active" title="Event-Planung" aria-current="page"><IconDeckEvent /></button>
      <button className="evd-rail-btn" title="Tourenplanung" onClick={onBack}><IconDeckTour /></button>
      <span className="evd-rail-spacer" />
      <button className="evd-rail-btn" title="Einstellungen" onClick={onBack}><IconDeckGear /></button>
    </nav>
  );
}

function MobileResultHeader({ query, onEdit, onBack }: { query: EventQuery; onEdit: () => void; onBack?: () => void }) {
  return (
    <div className="evd-m-header">
      <div className="evd-m-brandrow">
        <img src="/buscosun-mark.svg" width={22} height={22} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} onClick={onBack} />
        <div className="evd-m-htext">
          <div className="evd-m-eyebrow">Event · {query.activity.label}</div>
          <div className="evd-m-title">{flagForCountry(query.location.country)} {shortPlace(query.location.name)}</div>
        </div>
      </div>
      <button className="evd-m-changed" onClick={onEdit}>Ändern</button>
    </div>
  );
}

function ResultBottomNav({ onBack }: { onBack?: () => void }) {
  return (
    <nav className="evd-m-nav" aria-label="Navigation">
      <button className="evd-m-navitem" onClick={onBack}><IconDeckMap size={21} /><span>Karte</span></button>
      <button className="evd-m-navitem" onClick={onBack}><IconDeckRadar size={21} /><span>Radar</span></button>
      <button className="evd-m-navitem evd-m-navitem--active" aria-current="page"><IconDeckEventPlain size={21} /><span>Event</span></button>
      <button className="evd-m-navitem" onClick={onBack}><IconDeckStarNav size={21} /><span>Favoriten</span></button>
    </nav>
  );
}

function Recommendation({ rec, query, forecast, activityLabel, datesMode, onEdit, onBack, isMobile }: { rec: EventRecommendation; query: EventQuery; forecast: PointForecast; activityLabel: string; datesMode: boolean; onEdit: () => void; onBack?: () => void; isMobile: boolean }) {
  const best = rec.days[rec.bestIndex];
  const [linkCopied, setLinkCopied] = useState(false);
  const storm = useEventStormOutlook(query.location, forecast, best);
  const copyEventLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${encodeEventState(query)}`;
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2000);
  };
  const ranked = [...rec.days].sort((a, b) => {
    if (a.summary && b.summary) return b.score - a.score || a.date.localeCompare(b.date);
    if (a.summary) return -1;
    if (b.summary) return 1;
    return a.date.localeCompare(b.date);
  });
  const conflict = best.isTendency && best.score >= 70;
  const reliableAlt = conflict ? (ranked.find((d) => d.summary && !d.isTendency && d.score >= 55) ?? null) : null;

  const isWedding = best.phases.some((p) => isCeremony(p.label));
  const scorablePhases = best.phases.filter((p) => p.summary);
  const factors = [...best.factors].sort((a, b) => b.weight - a.weight);
  const tier = confidenceTier(best.confidence);
  const confPct = Math.round(best.confidence * 100);
  const dObj = new Date(`${best.date}T00:00:00`);
  const riskDate = `${weekdayShort(best.date)} ${dObj.getDate()}.${dObj.getMonth() + 1}.`;

  // --- Regenrisiko fürs Feierfenster/Trauung ---
  const rainPhase = best.phases.find((p) => isCeremony(p.label) && p.summary)
    ?? (scorablePhases.length ? scorablePhases.reduce((a, b) => (b.summary!.precipPeakMmH > a.summary!.precipPeakMmH ? b : a)) : null);
  const rain = rainPhase ? rainRiskFor(rainPhase.summary!) : null;
  const rainGood = !rain || rain.level === 'none' || rain.level === 'low';

  // --- Komfort ---
  const feltMin = scorablePhases.length ? Math.round(Math.min(...scorablePhases.map((p) => p.summary!.apparentMinC))) : null;
  const feltMax = scorablePhases.length ? Math.round(Math.max(...scorablePhases.map((p) => p.summary!.apparentMaxC))) : null;
  const windMax = scorablePhases.length ? Math.round(Math.max(...scorablePhases.map((p) => p.summary!.windMaxMs))) : null;
  const gustMax = scorablePhases.length ? Math.round(Math.max(...scorablePhases.map((p) => p.summary!.gustMaxMs))) : null;

  // --- Gewitter ---
  const stormShown = storm && storm.capeAvailable;
  const stormHigh = stormShown && storm!.index.level === 'elevated';

  // --- Plan B (Kurz-Readout) ---
  const planAssess = query.planB.enabled ? assessPlanB(query, rec) : null;

  const factorCard = (f: Factor, i: number) => (
    <div key={f.key} className={`evd-factor${f.assessment === 'ok' ? ' evd-factor--amber' : f.assessment === 'bad' ? ' evd-factor--bad' : ''}`}>
      <div className="evd-factor-head">
        <span className={`evd-factor-dot evd-factor-dot--${f.assessment === 'good' ? 'good' : f.assessment === 'ok' ? 'ok' : 'bad'}`} />
        <span className="evd-factor-lab">{f.label}</span>
      </div>
      <div className="evd-factor-val">{f.valueText}</div>
      {i === 0 ? <span className="evd-factor-primary">WICHTIGSTE</span> : <div className="evd-factor-note">{f.phrase}</div>}
    </div>
  );

  const donut = (size: number) => {
    const r = size === 104 ? 40 : size === 86 ? 33 : 31;
    const stroke = size === 104 ? 9 : 8;
    const circ = 2 * Math.PI * r;
    const dash = (best.score / 100) * circ;
    const num = size === 104 ? 30 : size === 86 ? 25 : 23;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2} ${size / 2})`}>
          <circle r={r} fill="none" stroke="var(--sand-200)" strokeWidth={stroke} />
          <circle r={r} fill="none" stroke={scoreColor(best.score)} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} transform="rotate(-90)" />
          <text textAnchor="middle" y={size === 104 ? 6 : 5} fontSize={num} fontWeight={700} fill="var(--ink-900)" fontFamily="League Spartan">{best.score}</text>
          <text textAnchor="middle" y={size === 104 ? 22 : 18} fontSize={size === 104 ? 8 : 7} letterSpacing="2" fill="var(--stone-400)" fontFamily="League Spartan">SCORE</text>
        </g>
      </svg>
    );
  };

  const icsBtn = (
    <button type="button" className="evd-btn-ink" onClick={() => downloadEventICS(query, best)} title="Diesen Tag als Termin (.ics) herunterladen">
      <IconDeckCalendar size={15} />In den Kalender
    </button>
  );
  const shareBtn = (
    <button type="button" className="evd-btn-white" onClick={copyEventLink} title="Link zu dieser Auswertung kopieren">
      <IconDeckShare size={14} />{linkCopied ? '✓ Link kopiert' : 'Link teilen'}
    </button>
  );

  // --- Wiederverwendete Detail-Bausteine (Funktionserhalt) für die Center-Extras ---
  const centerExtras = (
    <>
      {query.activity.id === 'photo' && <PhotoLightSection rec={rec} query={query} forecast={forecast} />}
      {query.activity.id === 'stargazing' && <AstroNightSection rec={rec} query={query} forecast={forecast} />}
      {isWedding && (() => {
        const windiest = scorablePhases.reduce<PhaseResult | null>((a, b) => (!a || b.summary!.gustMaxMs > a.summary!.gustMaxMs ? b : a), null);
        const hazard = windiest ? windHazardFor(windiest.summary!) : null;
        return hazard && windiest ? <WeddingWindCard phase={windiest} hazard={hazard} /> : null;
      })()}
      {isWedding && (() => {
        const hottest = scorablePhases.reduce<PhaseResult | null>((a, b) => (!a || b.summary!.apparentMaxC > a.summary!.apparentMaxC ? b : a), null);
        const hazard = hottest ? heatHazardFor(hottest.summary!) : null;
        return hazard && hottest ? <WeddingHeatCard phase={hottest} hazard={hazard} /> : null;
      })()}
      {(() => {
        const evenings = best.phases.filter((p) => p.summary && isEveningPhase(p.hours));
        const coldest = evenings.reduce<PhaseResult | null>((a, b) => (!a || b.summary!.apparentMinC < a.summary!.apparentMinC ? b : a), null);
        const hazard = coldest ? coldHazardFor(coldest.summary!) : null;
        return hazard && coldest ? <EveningColdCard phase={coldest} hazard={hazard} /> : null;
      })()}
      <PlanBSection query={query} rec={rec} />
      {best.phases.length > 1 && (
        <>
          <div className="evd-sec-head"><span className="evd-sec-lab">Phasen am besten Tag</span><span className="evd-sec-note">jede einzeln · der Tag zählt die schwächste</span></div>
          <PhaseBreakdown phases={best.phases} />
        </>
      )}
    </>
  );

  // --- Rangliste ---
  const ranglisteBlock = rec.days.length > 1 && (datesMode ? (
    <>
      <div className="evd-sec-head"><span className="evd-sec-lab">Termin-Vergleich</span><span className="evd-sec-note">{rec.scorableCount} von {rec.days.length} bewertet</span></div>
      <TerminVergleich days={rec.days} />
    </>
  ) : (
    <>
      <div className="evd-sec-head"><span className="evd-sec-lab">Rangliste</span><span className="evd-sec-note">{rec.scorableCount} von {rec.days.length} Tagen bewertet</span></div>
      <div className="evd-panel">
        <DayScoreChart days={rec.days} />
        <div className="evd-ranklist">
          {ranked.slice(0, 5).map((d, i) => <RankRow key={d.date} rank={d.summary ? i + 1 : null} day={d} />)}
        </div>
        <p className="evd-panel-cap" style={{ marginTop: 12 }}>Quellen: DWD · GeoSphere · MeteoSwiss, höhenkorrigiert.{rec.scorableCount < rec.days.length && ' Tage ohne Wertung liegen jenseits des Vorhersage-Horizonts.'}</p>
      </div>
    </>
  ));

  // --- Risiko-Readout-Karten ---
  const readoutCards = (
    <>
      <div className={`evd-risk-card${rainGood ? ' evd-risk-card--good' : ''} evd-risk-card--flex`}>
        <span className="evd-risk-ico"><IconDeckSun size={20} /></span>
        <div>
          <span className="evd-risk-lab">Regenrisiko fürs Feierfenster</span>
          <div className={`evd-risk-val ${rainGood ? 'evd-risk-val--good' : 'evd-risk-val--warn'}`}>{rain ? rain.label : 'Keine Wertung'}</div>
          <div className="evd-risk-desc">{rain ? rain.detail : 'Für dieses Fenster liegt keine Vorhersage vor.'}</div>
        </div>
      </div>

      <div className="evd-risk-card evd-risk-card--flex">
        <span className="evd-risk-ico" style={{ background: 'var(--evd-sage-tint)' }}><IconDeckStorm size={20} /></span>
        <div>
          <span className="evd-risk-lab">Gewittergefahr</span>
          <div className={`evd-risk-val ${stormHigh ? 'evd-risk-val--warn' : 'evd-risk-val--good'}`}>{stormShown ? storm!.index.label : 'Gering'}</div>
          <div className="evd-risk-desc">{stormShown ? storm!.index.drivers.join(' · ') : 'Kein belastbares CAPE-Signal · keine amtliche DWD-Warnung.'}</div>
        </div>
      </div>

      <div className="evd-risk-card">
        <span className="evd-risk-lab">Gefühlt &amp; Wind · {scorablePhases.length === 1 ? scorablePhases[0].label : 'ganzer Tag'}</span>
        <div className="evd-comfort-grid">
          <div className="evd-comfort-cell"><div className="evd-comfort-lab">Gefühlt</div><div className="evd-comfort-val">{feltMin != null ? `${feltMin}–${feltMax} °C` : '—'}</div></div>
          <div className="evd-comfort-cell"><div className="evd-comfort-lab">Wind · Böen</div><div className="evd-comfort-val">{windMax != null ? `${windMax} · ${gustMax} m/s` : '—'}</div></div>
        </div>
        <div className="evd-risk-desc" style={{ marginTop: 8 }}>{feltMin != null && windMax != null && windMax <= 4 ? 'Angenehm, kaum Wind — gute Bedingungen für draußen.' : 'Gefühlte Temperatur & Böen fürs Feierfenster.'}</div>
      </div>

      <div className="evd-readout-sep"><span>Plan B</span><span className="rule" /></div>
      <div className={`evd-risk-card${planAssess && !planAssess.triggered ? ' evd-risk-card--good' : ''} evd-risk-card--flex`}>
        <span className="evd-risk-ico"><IconDeckHouse size={20} /></span>
        <div>
          <span className="evd-risk-lab">{planAssess ? `Schwelle ${planAssess.thresholdText}` : 'Schwelle nicht aktiv'}</span>
          <div className={`evd-risk-val ${!planAssess ? 'evd-risk-val--ink' : planAssess.triggered ? 'evd-risk-val--warn' : 'evd-risk-val--good'}`}>
            {!planAssess ? 'Nicht aktiviert' : planAssess.triggered ? 'Plan B empfohlen' : 'Plan B nicht nötig'}
          </div>
          <div className="evd-risk-desc">
            {!planAssess ? 'Im Wizard aktivierbar (Schritt „Plan B").' : planAssess.recommendation}
          </div>
        </div>
      </div>
    </>
  );

  const confidenceBlock = rec.scorableCount >= 2 && (
    <>
      <div className="evd-readout-sep"><span>Sicherheit über die Zeit</span><span className="rule" /></div>
      <div className="evd-risk-card">
        <ConfidenceTimeline days={rec.days} />
        <div className="evd-risk-desc" style={{ marginTop: 8 }}>Je weiter ein Tag entfernt liegt, desto unsicherer — späte Tage sind eher grobe Tendenz als Festlegung.</div>
      </div>
    </>
  );

  // ------- Mobile: vertikaler Fluss -------
  if (isMobile) {
    return (
      <div className="evd-m-root">
        <MobileResultHeader query={query} onEdit={onEdit} onBack={onBack} />
        <div className="evd-m-scroll evd-m-scroll--nav">
          <div className="evd-m-hero">
            <div className="evd-m-hero-top">
              {donut(80)}
              <div>
                <span className="evd-eyebrow">Bester Tag für {activityLabel}</span>
                <h3 className="evd-hero-title" style={{ fontSize: 23 }}>{formatDayLong(best.date)}</h3>
                <span className={`evd-conf-pill${tier.band === 'high' ? '' : ' evd-conf-pill--amber'}`} style={{ marginTop: 6 }}>Konfidenz {tier.label} · {confPct} %</span>
              </div>
            </div>
            <p className="evd-hero-desc">{best.isTendency ? `Tendenz: ${lowerFirst(best.rationale)}` : best.rationale}</p>
            <div className="evd-m-factors">{factors.map(factorCard)}</div>
            <div className="evd-m-actions">{icsBtn}{shareBtn}</div>
          </div>

          <div className="evd-sec-head"><span className="evd-sec-lab">Ablauf am besten Tag</span></div>
          <EventCourseChart forecast={forecast} best={best} />

          <div className="evd-sec-head"><span className="evd-sec-lab">Risiko-Readout</span></div>
          <div className="evd-m-risklist">{readoutCards}</div>
          {confidenceBlock}

          {ranglisteBlock}
          {centerExtras}
          <p className="evd-panel-cap" style={{ textAlign: 'center', marginTop: 14 }}>● DWD · GeoSphere · MeteoSwiss · höhenkorrigiert · keine Tracker</p>
        </div>
        <ResultBottomNav onBack={onBack} />
      </div>
    );
  }

  // ------- Desktop / Tablet: Dock | Center | Readout -------
  return (
    <div className="evd-root">
      <ResultTopbar query={query} onEdit={onEdit} onBack={onBack} />
      <div className="evd-body">
        <ResultRail onBack={onBack} />

        {/* DOCK — DEIN VORHABEN */}
        <div className="evd-dock evd-scroll">
          <div className="evd-dock-head">
            <span className="evd-field-label">Dein Vorhaben</span>
            <button className="evd-link" onClick={onEdit}>Angaben ändern</button>
          </div>
          <div className="evd-dock-card evd-dock-anlass">
            <span className="evd-anlass-ico"><DeckActivityIcon id={query.activity.id} size={21} /></span>
            <div>
              <div className="evd-anlass-tag" style={{ letterSpacing: 1 }}>ANLASS</div>
              <div className="evd-anlass-name" style={{ fontSize: 17 }}>{query.activity.label}</div>
              <div className="evd-anlass-tag">{query.activity.tag}</div>
            </div>
          </div>
          <div className="evd-dock-section">
            <span className="evd-field-label">Zeitraum</span>
            <div className="evd-daterow" style={{ marginTop: 9 }}>
              <div className="evd-datecard" style={{ cursor: 'default' }}><div className="evd-datecard-lab">{query.window.mode === 'range' ? 'Von' : 'Termine'}</div><div className="evd-datecard-val" style={{ fontSize: 14 }}>{query.window.mode === 'range' ? shortDateResult(query.window.from) : `${query.window.dates.length} Tage`}</div></div>
              {query.window.mode === 'range' && <div className="evd-datecard" style={{ cursor: 'default' }}><div className="evd-datecard-lab">Bis</div><div className="evd-datecard-val" style={{ fontSize: 14 }}>{shortDateResult(query.window.to)}</div></div>}
            </div>
            <div className="evd-dock-sub">{rec.scorableCount} von {rec.days.length} Tagen bewertet</div>
          </div>
          <div className="evd-dock-section">
            <span className="evd-field-label">Phasen</span>
            <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {query.phases.map((p) => (
                <div className="evd-dock-mini" key={p.id}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--terracotta-500)', flex: '0 0 auto' }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{p.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--stone-500)' }}>{fmtPhaseHours(p.hours)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="evd-dock-card" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Plan-B-Schwelle</span>
              <span className={`evd-switch${query.planB.enabled ? ' evd-switch--on' : ''}`} style={{ width: 34, height: 19 }} />
            </div>
            <div className="evd-dock-sub">{planAssess ? `Ab ${planAssess.thresholdText} → Ausweich vorschlagen.` : 'Nicht aktiviert.'}</div>
            {planAssess?.alternative && <div className="evd-pilltags"><span className="evd-pilltag evd-pilltag--amber">Ausweichtag: {shortDateResult(planAssess.alternative.date)}</span></div>}
          </div>
          <button className="evd-dock-cta" onClick={onEdit}>Angaben ändern <IconDeckArrowRight /></button>
        </div>

        {/* CENTER */}
        <div className="evd-center evd-scroll">
          <div className="evd-hero">
            <div className="evd-hero-left">
              {donut(104)}
              <span className={`evd-conf-pill${tier.band === 'high' ? '' : ' evd-conf-pill--amber'}`}>Konfidenz {tier.label} · {confPct} %</span>
            </div>
            <div className="evd-hero-main">
              <span className="evd-eyebrow">Bester Tag für {activityLabel}{best.isTendency ? ' · Tendenz' : ''}</span>
              <h3 className="evd-hero-title">{formatDayLong(best.date)}</h3>
              <p className="evd-hero-desc">{best.isTendency ? `Tendenz: ${lowerFirst(best.rationale)}` : best.rationale}</p>
              <p className="evd-hero-meta">Verlässlichkeit: {best.confidenceNote}{conflict && reliableAlt ? ` · verlässlichere Alternative: ${formatDayLong(reliableAlt.date)}` : ''}</p>
              <div className="evd-factors">{factors.map(factorCard)}</div>
              <p className="evd-legend">Faktoren nach Wichtigkeit für {activityLabel} · <span className="g">gut</span> <span className="o">okay</span> <span className="c">kritisch</span></p>
              <div className="evd-hero-actions">{icsBtn}{shareBtn}<span className="evd-hero-hint">.ics &amp; Link — offline, ganz ohne Konto</span></div>
            </div>
          </div>

          <div className="evd-sec-head"><span className="evd-sec-lab">Ablauf am besten Tag</span><span className="evd-sec-note">{formatDayLong(best.date)} · Stunde für Stunde</span></div>
          <EventCourseChart forecast={forecast} best={best} />

          {eventWithinRasterHorizon(best) && (
            <>
              <div className="evd-sec-head"><span className="evd-sec-lab">Dein Event auf der Karte</span><span className="evd-sec-note">Ort &amp; Wetterlage am besten Tag</span></div>
              <EventMapSection location={query.location} best={best} />
            </>
          )}

          {ranglisteBlock}
          {centerExtras}
        </div>

        {/* READOUT */}
        <div className="evd-readout evd-scroll">
          <div className="evd-readout-head">
            <span className="evd-sec-lab" style={{ letterSpacing: '2.5px' }}>Risiko-Readout · {riskDate}</span>
            <span style={{ fontSize: 10, color: 'var(--evd-sage-text)', fontWeight: 600 }}>● geprüft</span>
          </div>
          {readoutCards}
          {confidenceBlock}
          <div className="evd-readout-foot">● Native Behörden-Quellen: DWD · GeoSphere · MeteoSwiss · höhenkorrigiert · keine Tracker</div>
        </div>
      </div>
    </div>
  );
}

function shortDateResult(iso: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
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

/** WIN-US3 — Marker für ein Schlechtwetter-Risiko genau im Eventfenster. */
function RiskChip({ risk, compact }: { risk: WindowRisk; compact?: boolean }) {
  return (
    <span className={`ev-risk-chip ev-risk-${risk.severity}`} title={`${risk.label}: ${risk.detail}`}>
      {risk.kind === 'rain' ? <IconRain size={13} /> : <IconWind size={13} />}
      {compact ? risk.label : `${risk.label} · ${risk.detail}`}
    </span>
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
  // Command-Deck-Palette (eventplaner.dc.html): gut = Sage, okay = Amber,
  // kritisch = Terracotta — passt zu Score-Donut, Rangliste-Balken & Legende.
  if (score >= 70) return 'var(--sage-600, #7A9466)';
  if (score >= 45) return 'var(--evd-okay, #B8862F)';
  return 'var(--evd-critical, #B5482E)';
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
