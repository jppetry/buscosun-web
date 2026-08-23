/**
 * Feature „Regen für die nächsten 6 Stunden" (Nowcast) — Seite.
 *
 * Ohne Standort: gecraftetes Idle-Intro („Regnet es bald?") als Startbild.
 * Sobald ein Ort gewählt ist, übernimmt das „Command-Deck" (NowcastDeck) —
 * die vollflächige App-Shell im Stil der Wetterkarte (Sand/Ink, dunkles
 * Radarfeld, Steel-Akzent) mit dem realen 6-h-Nowcast aus Radar (0–2 h) +
 * ICON-D2 (2–6 h). Blaue Nowcast-Designsprache (#3A6FA8), abgesetzt von der
 * terracotta-getönten Event-Planung.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Location } from '../types';
import { reverseGeocode } from '../geocode';
import { buildNowcast } from './nowcastEngine';
import type { Nowcast } from './nowcastView';
import NowcastLocationField from './NowcastLocationField';
import NowcastDeck from './NowcastDeck';
import { useIsMobile } from '../mobile/useIsMobile';
// Idle-/Intro-Kopf in der Designsprache des „Entdecke buscosun"-Intros.
import '../intro/intro.css';
import '../route/tourTheme.css';
import './nowcast.css';
import './nowcastMobile.css';

/** Möglichkeiten-Liste des Idle-Kopfs — gespiegelt aus dem Intro-Radar-Schritt. */
const NC_INTRO_CAPS = [
  '„Regen in X Minuten" für deinen Standort',
  'Messung und Modell-Vorhersage klar getrennt',
  'Sturmzellen-Zugbahn, Blitze und Schneefallgrenze',
  'Datenquelle und Aktualität transparent ausgewiesen',
];

/** Möglichkeiten-Liste mobil (RM1) — knapper, 1:1 nach references/mobile-RM1. */
const RM1_CAPS = [
  '„Regen in X Minuten" für deinen Standort',
  'Messung und Modell-Vorhersage klar getrennt',
  'Zellen-Zugbahn, Blitze & Schneefallgrenze',
  'Datenquelle und Aktualität transparent',
];

function IconPin() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21 C12 21 5 14.5 5 9.5 A7 7 0 0 1 19 9.5 C19 14.5 12 21 12 21 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="9.3" r="2.4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/* Kleine Line-Icons (currentColor) für die Möglichkeiten-Liste + „So geht's" —
   identisch zum Intro-Overlay, dort lokal/nicht exportiert. */
function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3,8.5 6.5,12 13,4" />
    </svg>
  );
}
function IconHowTo() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" /><polyline points="6.6,5.4 10,8 6.6,10.6" />
    </svg>
  );
}

import { FeatureRail, type RailFeature } from '../nav/featureRail';

interface Props {
  onBack: () => void;
  onOpenFeature?: (id: RailFeature) => void;
  // --- Router (RT1), additiv: Ort + Kamera aus der Query `/regenradar?ort=…&lat=…` ---
  initialLocation?: Location | null;
  onLocationChange?: (l: Location | null) => void;
  initialView?: { lat: number; lon: number; zoom: number } | null;
  onViewChange?: (v: { lat: number; lon: number; zoom: number }) => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; nowcast: Nowcast }
  | { kind: 'error'; message: string };

export default function NowcastPage({ onBack, onOpenFeature, initialLocation, onLocationChange, initialView, onViewChange }: Props) {
  const [location, setLocation] = useState<Location | null>(initialLocation ?? null);
  // Router (RT1): Ortswechsel nach außen melden (nicht beim Mount).
  const prevLocRef = useRef(location);
  useEffect(() => {
    if (prevLocRef.current === location) return;
    prevLocRef.current = location;
    onLocationChange?.(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [reloadNonce, setReloadNonce] = useState(0);
  const acRef = useRef<AbortController | null>(null);
  const isMobile = useIsMobile();

  const useMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      reverseGeocode(latitude, longitude)
        .then((loc) => setLocation(loc ?? { lat: latitude, lon: longitude, name: 'Mein Standort', country: 'DE' }))
        .catch(() => setLocation({ lat: latitude, lon: longitude, name: 'Mein Standort', country: 'DE' }));
    });
  };

  useEffect(() => {
    if (!location) { setState({ kind: 'idle' }); return; }
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setState((prev) => (prev.kind === 'ready' ? prev : { kind: 'loading' }));
    (async () => {
      try {
        const nowcast = await buildNowcast({ lat: location.lat, lon: location.lon, country: location.country, signal: ac.signal });
        if (ac.signal.aborted) return;
        setState({ kind: 'ready', nowcast });
      } catch (err) {
        if (ac.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Nowcast-Daten nicht erreichbar' });
      }
    })();
    return () => ac.abort();
  }, [location, reloadNonce]);

  // Command-Deck: sobald ein Ort gewählt ist, übernimmt die vollflächige Shell.
  if (location) {
    const deckState =
      state.kind === 'ready' ? { kind: 'ready' as const, nowcast: state.nowcast }
      : state.kind === 'error' ? { kind: 'error' as const, message: state.message }
      : { kind: 'loading' as const };
    return (
      <NowcastDeck
        location={location}
        state={deckState}
        onChangeLocation={setLocation}
        reloadNonce={reloadNonce}
        onReload={() => setReloadNonce((n) => n + 1)}
        onBack={onBack}
        onOpenFeature={onOpenFeature}
        initialView={initialView}
        onViewChange={onViewChange}
      />
    );
  }

  // RM1 — Mobile-Idle: eigenes Startbild 1:1 nach references/mobile-RM1.
  if (isMobile) {
    return (
      <div className="rm-idle">
        <nav className="rm-idle-nav">
          <button type="button" className="rm-idle-brand" onClick={onBack} aria-label="Zur Startseite">
            <img src="/buscosun-mark.svg" width={26} height={26} alt="" />
            <span>buscosun</span>
          </button>
          <button type="button" className="rm-idle-back" onClick={onBack}>Zurück</button>
        </nav>
        <main className="rm-idle-main">
          <span className="rm-idle-eyebrow">Regenradar · Nowcast</span>
          <h1 className="rm-idle-title">Regnet es bald bei dir?</h1>
          <p className="rm-idle-body">Minutengenauer Niederschlag für die nächsten 6 Stunden — Radar (0–2 h) &amp; Modell (2–6 h) klar getrennt.</p>
          <ul className="rm-idle-caps">
            {RM1_CAPS.map((c) => (
              <li key={c} className="rm-idle-cap"><span className="rm-idle-cap-mark" aria-hidden="true"><IconCheck /></span>{c}</li>
            ))}
          </ul>
          <span className="rm-idle-label">Standort</span>
          <div className="rm-idle-search"><NowcastLocationField value={location} onChange={setLocation} /></div>
          <button type="button" className="rm-idle-geo" onClick={useMyLocation}><IconPin /> Mein Standort</button>
          <div className="rm-idle-howto">
            <span className="rm-idle-howto-ic" aria-hidden="true"><IconHowTo /></span>
            <p><b>So geht’s:</b> Ort wählen — danach zeigen wir Radar, Zeitverlauf &amp; die 6-h-Prognose.</p>
          </div>
          <p className="rm-idle-source"><span className="rm-src-dot" /> DWD RADOLAN-RV · ICON-D2 (2,2 km) · keine Tracker</p>
        </main>
      </div>
    );
  }

  // Idle-Startbild: gecraftete Intro-Komposition (Line-Art + Möglichkeiten +
  // „So geht's" + Suche) in der „Entdecke buscosun"-Designsprache. Die
  // Werkzeug-Rail steht wie im Deck links, damit man auch ohne Ort springen kann.
  return (
    <div className="nc-idle-shell">
      <FeatureRail
        active="nowcast"
        onOpenFeature={onOpenFeature}
        onHome={onBack}
        navClass="nc-idle-rail"
        btnClass="nc-idle-rail-btn"
        activeClass="is-active"
        spacerClass="nc-idle-rail-spacer"
      />
    <div className="rt-page nc-page">
      <div className="rt-grain" />
      <nav className="rt-nav">
        <a className="rt-nav-logo" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
          <span className="rt-nav-logo-mark" /><span className="rt-nav-logo-name">buscosun</span>
        </a>
        <div className="rt-nav-right">
          <span className="rt-nav-live nc-live"><span className="live-dot nc-dot" /> Radar live</span>
          <span className="rt-nav-avatar">JK</span>
        </div>
      </nav>

      <main className="rt-container">
        <section className="rt-section nc-intro" style={{ ['--intro-accent']: 'var(--nc-blue)' } as CSSProperties}>
          <div className="nc-intro-copy">
            <span className="intro-eyebrow">Regenradar</span>
            <h1 className="nc-intro-title">Regnet es bald?</h1>
            <p className="intro-body">
              High-End-Regenradar für deinen Standort: gemessenes DWD-Radar (0–2 h) mit
              ehrlichem Übergang zur ICON-D2-Vorhersage — minutengenau bis zum Skill-Horizont.
            </p>
            <ul className="intro-caps">
              {NC_INTRO_CAPS.map((c) => (
                <li key={c}><span className="intro-caps-mark" aria-hidden="true"><IconCheck /></span>{c}</li>
              ))}
            </ul>
            <div className="nc-intro-search">
              <span className="rt-eyebrow nc-eyebrow">Standort</span>
              <NowcastLocationField value={location} onChange={setLocation} />
            </div>
            <p className="intro-howto">
              <span className="intro-howto-ic" aria-hidden="true"><IconHowTo /></span>
              <span><strong>So geht’s:</strong> Ort eingeben — der Punkt-Streifen zeigt dir, wann der Regen kommt.</span>
            </p>
          </div>
        </section>

        <div className="rt-trust" style={{ marginTop: '1.6rem' }}>
          <span className="dot nc-dot-static">●</span> DWD RADOLAN-RV (Radar-Nowcast) · ICON-D2 (2,2 km) · keine Tracker
        </div>
      </main>
    </div>
    </div>
  );
}
