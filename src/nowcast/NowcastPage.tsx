/**
 * Feature „Regen für die nächsten 6 Stunden" (Nowcast) — Seite.
 *
 * Standortabfrage → 6-h-Nowcast aus Radar (0–2 h) + ICON-D2 (2–6 h). Die
 * Ergebnis-Bausteine (Hero, Kennzahlen, Timeline, Karte, Ereignisse, Alarme)
 * wachsen Story für Story in `NowcastResult`. Blaue Nowcast-Designsprache
 * (Akzent #3A6FA8), abgesetzt von der terracotta-getönten Event-Planung.
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import { buildNowcast } from './nowcastEngine';
import { phaseLabelStep } from './nowcastModel';
import { sourceLabel, heroState, leadLabel, freshness, fmtClock as fmtClockV, fmtDuration, type Nowcast } from './nowcastView';
import NowcastTimeline from './NowcastTimeline';
import NowcastRadarMap from './NowcastRadarMap';
import NowcastBarChart from './NowcastBarChart';
import { AccumulationCard, EventsCard, AlpineCard } from './NowcastDetail';
// Idle-/Intro-Kopf in der Designsprache des „Entdecke buscosun"-Intros:
// Eyebrow/Titel/Möglichkeiten/„So geht's"-Bausteine (ohne Line-Art).
import '../intro/intro.css';
import '../route/tourTheme.css';
import './nowcast.css';

/** Möglichkeiten-Liste des Idle-Kopfs — gespiegelt aus dem Intro-Radar-Schritt. */
const NC_INTRO_CAPS = [
  '„Regen in X Minuten" für deinen Standort',
  'Messung und Modell-Vorhersage klar getrennt',
  'Sturmzellen-Zugbahn, Blitze und Schneefallgrenze',
  'Datenquelle und Aktualität transparent ausgewiesen',
];

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

interface Props {
  onBack: () => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; nowcast: Nowcast }
  | { kind: 'error'; message: string };

export default function NowcastPage({ onBack }: Props) {
  const [location, setLocation] = useState<Location | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [reloadNonce, setReloadNonce] = useState(0);
  const acRef = useRef<AbortController | null>(null);

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

  return (
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
        {/* Idle-Kopf ohne Standort: gecraftete Intro-Komposition (Line-Art +
            Möglichkeiten + „So geht's" + Suche) in der „Entdecke buscosun"-
            Designsprache. Sobald ein Ort gewählt ist, übernimmt der Hero
            („Trocken." / „In 20 Min Regen.") und die Suche wird kompakt. */}
        {!location ? (
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
        ) : (
          <section className="rt-section nc-loc-section is-compact">
            <NowcastLocationField value={location} onChange={setLocation} />
          </section>
        )}

        {location && state.kind === 'loading' && (
          <div className="rt-card nc-state"><span className="ev-spinner" /> <p>Radar &amp; Modell werden ausgewertet …</p></div>
        )}
        {location && state.kind === 'error' && (
          <div className="rt-card nc-state"><p>⚠ {state.message}</p></div>
        )}
        {location && state.kind === 'ready' && (
          <NowcastResult nowcast={state.nowcast} location={location} reloadNonce={reloadNonce} onReload={() => setReloadNonce((n) => n + 1)} />
        )}

        <div className="rt-trust" style={{ marginTop: '1.6rem' }}>
          <span className="dot nc-dot-static">●</span> DWD RADOLAN-RV (Radar-Nowcast) · ICON-D2 (2,2 km) · keine Tracker
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// Ergebnis — wächst Story für Story (US1: Kopf mit Ort/Zeit/Lauf)
// ============================================================================
function NowcastResult({ nowcast, location, reloadNonce, onReload }: { nowcast: Nowcast; location: Location; reloadNonce: number; onReload: () => void }) {
  const [mode, setMode] = useState<'standard' | 'detail'>('detail');
  const fresh = freshness(nowcast);
  return (
    <section className="rt-section">
      <div className="nc-result-head">
        <div>
          <span className="rt-eyebrow nc-eyebrow">
            Regenradar · {flagForCountry(location.country)} {shortPlace(location.name)}
          </span>
          <span className="nc-result-sub">aktuell {fmtClock(nowcast.nowMs)} · Standortabfrage</span>
        </div>
        <div className="nc-head-right">
          <div className="nc-mode-toggle" role="tablist" aria-label="Ansicht">
            <button type="button" role="tab" aria-selected={mode === 'standard'}
              className={`nc-mode-btn${mode === 'standard' ? ' is-active' : ''}`} onClick={() => setMode('standard')}>Standard</button>
            <button type="button" role="tab" aria-selected={mode === 'detail'}
              className={`nc-mode-btn${mode === 'detail' ? ' is-active' : ''}`} onClick={() => setMode('detail')}>Detail-Modus</button>
          </div>
          <span className="nc-runstamp" title="Datenaktualität">{sourceLabel(nowcast)}</span>
          {/* US-A5 — Aktualität + Reload */}
          <span className={`nc-fresh${fresh.stale ? ' is-stale' : ''}`}>
            <span className="nc-fresh-dot" />
            {fresh.stale ? `veraltet · ${fresh.label}` : fresh.label}
            <button type="button" className="nc-fresh-reload" onClick={onReload} title="Neu laden" aria-label="Daten neu laden">↻</button>
          </span>
        </div>
      </div>

      {/* US2 — Hero „Regnet es bald?" */}
      <NowcastHero nowcast={nowcast} />

      {/* US3 — Kennzahlen */}
      <MetricCards nowcast={nowcast} mode={mode} />

      {/* US4/US-E5/US-B1/US-B5 — Intensität & Confidence Timeline */}
      <div className="nc-block-head">
        <span className="rt-eyebrow nc-eyebrow">
          {mode === 'detail' ? 'Detail-Timeline · Phase · Charakter · 6 h' : 'Intensität & Confidence · 0–6 h'}
        </span>
        <span className="nc-block-sub">{fmtClockV(nowcast.nowMs)} → {fmtClockV(nowcast.nowMs + 360 * 60_000)}</span>
      </div>
      <div className="rt-card nc-tl-card">
        <NowcastTimeline nowcast={nowcast} variant={mode} />
      </div>

      {/* US-B6 / Ereignisse — nur im Detail-Modus */}
      {mode === 'detail' && (
        <>
          <div className="nc-detail-grid">
            <AccumulationCard nowcast={nowcast} />
            <EventsCard nowcast={nowcast} />
          </div>
          {/* US-F1 — nur für alpine Standorte */}
          <AlpineCard nowcast={nowcast} />
        </>
      )}

      {/* US5 / US-D2 — Niederschlagsraster-Karte ODER Diagramm (umschaltbar) */}
      <GeoOrChart nowcast={nowcast} location={location} reloadNonce={reloadNonce} />

      {/* US-E1 / US-E4 / Guardrails */}
      <NowcastFootnotes nowcast={nowcast} />
    </section>
  );
}

// US-E1 (Datenherkunft), US-E4 (Radar-Artefakte erklären), US-H1/US-D5 (Guardrails)
function NowcastFootnotes({ nowcast }: { nowcast: Nowcast }) {
  return (
    <div className="nc-foot">
      <details className="nc-help">
        <summary>Datenquellen &amp; Modelllauf</summary>
        <ul>
          <li><strong>Nahbereich 0–2 h:</strong> {nowcast.hasRadar ? `DWD RADOLAN-RV (Radar-Nowcast, 1 km)${nowcast.runAtMs ? ` · Lauf ${fmtClockV(nowcast.runAtMs)}` : ''}` : 'kein Radar verfügbar — Modell ab jetzt'}</li>
          <li><strong>Fernbereich 2–6 h:</strong> ICON-D2 (2,2 km, DWD) — punktgenau höhenkorrigiert</li>
          <li><strong>Blend:</strong> Radar-Extrapolation wird zwischen ~1,5 und 2,5 h gleitend auf das Modell übergeblendet (vorlaufgewichtet).</li>
        </ul>
      </details>

      <details className="nc-help">
        <summary>Wann das Radar trügt — und warum die App abweichen darf</summary>
        <ul>
          <li><strong>Niederschlag „aloft":</strong> Das Radar sieht Regen in der Höhe, der unterwegs verdunstet — am Boden bleibt es trocken.</li>
          <li><strong>Bodenclutter / Fehlechos:</strong> Berge, Gebäude oder Schwärme erzeugen Echos ohne realen Niederschlag.</li>
          <li><strong>Sprühregen / Niesel:</strong> Sehr feine Tropfen reflektieren kaum — leichter Niesel wird unterschätzt.</li>
          <li><strong>Heller Bereich (Schmelzschicht):</strong> Tauender Schnee überzeichnet die Intensität in einer dünnen Höhenschicht.</li>
        </ul>
      </details>

      <p className="nc-guardrail">
        <span className="nc-guardrail-mark">⚑</span>
        Ehrlichkeits-Grenzen: Jenseits des Skill-Horizonts (~{Math.round(nowcast.skillHorizonMin / 60)} h) zeigen wir
        <strong> keine minutengenauen</strong> Start-/Stoppzeiten. Eine einzelne kurze Regenphase markiert
        <strong> nicht</strong> den ganzen Zeitraum als „Regen" — Zusammenfassungen spiegeln Dauer &amp; Abdeckung,
        kein irreführender Tages-Prozentwert.
      </p>
    </div>
  );
}

function GeoOrChart({ nowcast, location, reloadNonce }: { nowcast: Nowcast; location: Location; reloadNonce: number }) {
  const [view, setView] = useState<'map' | 'chart'>('map');
  return (
    <>
      <div className="nc-block-head">
        <span className="rt-eyebrow nc-eyebrow">
          {view === 'map' ? 'Niederschlagsraster · Radar' : 'Intensität je 15 Min · Diagramm'}
        </span>
        <div className="nc-mode-toggle" role="tablist" aria-label="Karte oder Diagramm">
          <button type="button" role="tab" aria-selected={view === 'map'}
            className={`nc-mode-btn${view === 'map' ? ' is-active' : ''}`} onClick={() => setView('map')}>Karte</button>
          <button type="button" role="tab" aria-selected={view === 'chart'}
            className={`nc-mode-btn${view === 'chart' ? ' is-active' : ''}`} onClick={() => setView('chart')}>Diagramm</button>
        </div>
      </div>
      {view === 'map'
        ? <NowcastRadarMap location={location} nowcast={nowcast} reloadKey={reloadNonce} />
        : <div className="rt-card nc-tl-card"><NowcastBarChart nowcast={nowcast} /><BarChartLegend /></div>}
    </>
  );
}

function BarChartLegend() {
  return (
    <div className="nc-tl-legend" style={{ marginTop: '0.6rem' }}>
      <span><i style={{ background: '#3A6FA8' }} /> Regen</span>
      <span><i style={{ background: '#6B7A8F' }} /> Schnee</span>
      <span><i className="nc-lg-dry" /> Trockenfenster</span>
      <span><i className="nc-lg-skill" /> Skill-Horizont +2 h</span>
      <span style={{ color: 'var(--stone-500, #8B7355)' }}>blasse Balken = Modell (ICON-D2)</span>
    </div>
  );
}

function MetricCards({ nowcast, mode }: { nowcast: Nowcast; mode: 'standard' | 'detail' }) {
  const s = nowcast.summary;
  const comma = (n: number) => n.toString().replace('.', ',');
  // Phasenübergang als Untertitel der Phase-Karte (US-B1 AK2).
  const trans = s.phaseTransitions[0];
  const phaseSub = trans
    ? `ab ~${fmtClock(trans.timestamp?.getTime() ?? nowcast.nowMs)} ${phaseLabelStep(trans.from)} → ${phaseLabelStep(trans.to)}`
    : s.character;
  return (
    <div className="nc-cards">
      <div className={`nc-card${s.dominantPhase === 'freezing' ? ' nc-card-alert' : ''}`}>
        <span className="nc-card-label">Phase</span>
        <span className="nc-card-value">{s.phase === 'dry' ? 'Trocken' : phaseLabelStep(s.dominantPhase)}</span>
        <span className="nc-card-sub">{phaseSub}</span>
      </div>
      <div className="nc-card">
        <span className="nc-card-label">Summe 6 h</span>
        <span className="nc-card-value">{comma(s.sumMm)} mm</span>
        <span className="nc-card-sub">Band {comma(s.sumMinMm)} – {comma(s.sumMaxMm)}</span>
      </div>
      <div className={`nc-card${s.thunderRiskPct >= 30 ? ' nc-card-alert' : ''}`}>
        <span className="nc-card-label">Gewitter</span>
        <span className="nc-card-value">{s.thunderRiskPct} %</span>
        <span className="nc-card-sub">{s.thunderLabel}</span>
      </div>
      <div className="nc-card">
        <span className="nc-card-label">Schneefallgrenze</span>
        <span className="nc-card-value">{s.snowLineM != null ? `${s.snowLineM} m` : '—'}</span>
        <span className="nc-card-sub">{s.snowLineNote}</span>
      </div>

      {mode === 'detail' && (
        <>
          <div className={`nc-card${s.heavyRain ? ' nc-card-alert' : ''}`}>
            <span className="nc-card-label">Starkregen</span>
            <span className="nc-card-value">{s.heavyRain ? 'Ja' : 'Nein'}</span>
            <span className="nc-card-sub">Spitze {comma(s.peakMmH)} mm/h{s.heavyRain ? ' · DWD-Schwelle' : ''}</span>
          </div>
          <div className={`nc-card${s.hailRiskPct >= 20 ? ' nc-card-alert' : ''}`}>
            <span className="nc-card-label">Hagel</span>
            <span className="nc-card-value">{s.hailRiskPct} %</span>
            <span className="nc-card-sub">{s.hailRiskPct >= 20 ? 'erhöhtes Risiko' : s.hailRiskPct > 0 ? 'geringes Risiko' : 'kein Signal'}</span>
          </div>
          <div className="nc-card">
            <span className="nc-card-label">Charakter</span>
            <span className="nc-card-value">{characterHeadline(nowcast)}</span>
            <span className="nc-card-sub">{s.character}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Überschrift der Charakter-Karte: überwiegt Schauer oder Dauerregen? */
function characterHeadline(nc: Nowcast): string {
  let sh = 0, st = 0;
  for (const s of nc.steps) { if (s.character === 'showery') sh++; else if (s.character === 'steady') st++; }
  if (sh === 0 && st === 0) return '—';
  return sh >= st ? 'Schauer' : 'Dauerregen';
}

function HeroBadges({ nowcast }: { nowcast: Nowcast }) {
  const s = nowcast.summary;
  const badges: Array<{ text: string; cls: string }> = [];
  if (s.dominantPhase === 'freezing') badges.push({ text: '⚠ Glättegefahr · gefrierender Regen', cls: 'nc-badge-alert' });
  if (s.thunderRiskPct >= 30) badges.push({ text: `⚡ Gewitterrisiko ${s.thunderRiskPct} %${s.hailRiskPct >= 20 ? ' · Hagel' : ''}`, cls: 'nc-badge-warn' });
  if (s.heavyRain) badges.push({ text: `💧 Starkregen möglich · Spitze ${s.peakMmH.toString().replace('.', ',')} mm/h`, cls: 'nc-badge-warn' });
  if (!badges.length) return null;
  return <div className="nc-badges">{badges.map((b, i) => <span key={i} className={`nc-badge ${b.cls}`}>{b.text}</span>)}</div>;
}

function NowcastHero({ nowcast }: { nowcast: Nowcast }) {
  const h = heroState(nowcast);
  return (
    <div className="nc-hero">
      <span className="nc-glance-tag">Schnellblick</span>
      {h.kind === 'coming' && (
        <>
          <p className="nc-hero-line">
            <span>{h.beyondSkill ? 'Später ' : 'In '}</span>
            <span className="nc-hero-accent">{h.beyondSkill ? 'evtl. Regen' : leadLabel(h.inMin)}</span>
            {!h.beyondSkill && <span> Regen.</span>}
          </p>
          {h.beyondSkill ? (
            <p className="nc-hero-sub">
              Erst in {leadLabel(h.inMin)} ({h.intensity}) — jenseits des Skill-Horizonts, daher keine minutengenaue Aussage.
            </p>
          ) : (
            <p className="nc-hero-sub">
              Beginnt ~{h.onsetClock}{h.endClock && <> · endet ~{h.endClock}</>} · {h.intensity} · {h.character}
            </p>
          )}
        </>
      )}
      {h.kind === 'raining' && (
        <>
          <p className="nc-hero-line"><span className="nc-hero-accent">Es regnet</span><span> gerade.</span></p>
          {h.dry ? (
            <p className="nc-hero-sub nc-hero-good">
              ✓ Danach {fmtDuration(h.dry.durationMin)} trocken · {fmtClockV(nowcast.nowMs + h.dry.fromMin * 60_000)}–{fmtClockV(nowcast.nowMs + h.dry.toMin * 60_000)}
              {h.returnClock && <> · neuer Schauer ab ca. {h.returnClock}</>}
            </p>
          ) : (
            <p className="nc-hero-sub">Der Regen hält über die nächste Zeit an — kein längeres Trockenfenster in Sicht.</p>
          )}
        </>
      )}
      {h.kind === 'dry' && (
        <>
          <p className="nc-hero-line"><span className="nc-hero-accent">Trocken.</span></p>
          <p className="nc-hero-sub">Kein Regen in den nächsten 6 Stunden erwartet.</p>
        </>
      )}
      <HeroBadges nowcast={nowcast} />
    </div>
  );
}

// ============================================================================
// Ort-Suche (kompakt, DACH) — wie in der Event-/Klima-Ansicht
// ============================================================================
function NowcastLocationField({ value, onChange }: { value: Location | null; onChange: (l: Location | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function search() {
    const q = query.trim();
    if (!q) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null); setResults([]);
    try {
      const found = await geocodeDACH(q, ac.signal);
      if (ac.signal.aborted) return;
      if (found.length === 0) setError('Keine Ergebnisse in DE / AT / CH gefunden.');
      else if (found.length === 1) onChange(found[0]);
      else setResults(found);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); void search(); }
    if (e.key === 'Escape') { setResults([]); setError(null); }
  }

  if (value) {
    return (
      <div className="ev-loc-chip rt-card">
        <span className="ev-loc-flag" aria-hidden="true">{flagForCountry(value.country)}</span>
        <span className="ev-loc-name">{value.name}</span>
        <button type="button" className="ev-loc-change" onClick={() => { onChange(null); setResults([]); setQuery(''); }}>Ändern</button>
      </div>
    );
  }
  return (
    <div className="ev-search-wrap">
      <div className="ev-search">
        <svg className="ev-search-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="8" cy="8" r="6" /><line x1="13" y1="13" x2="17" y2="17" strokeLinecap="round" />
        </svg>
        <input type="text" className="ev-search-input" placeholder="Stadt, Adresse oder PLZ …" value={query}
          onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} disabled={loading} aria-label="Ort suchen" />
        <button type="button" className="ev-search-go nc-search-go" onClick={() => void search()} disabled={loading || !query.trim()}>
          {loading ? 'Suche …' : 'Suchen'}
        </button>
      </div>
      {(results.length > 0 || error) && (
        <div className="ev-search-dropdown" role="listbox">
          {error && <div className="ev-search-error">⚠ {error}</div>}
          {results.map((r) => (
            <button key={`${r.lat},${r.lon}`} type="button" className="ev-search-result" onClick={() => onChange(r)}>
              <span className="ev-loc-flag" aria-hidden="true">{flagForCountry(r.country)}</span>
              <span className="ev-search-result-name">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Helfer ------------------------------------------------------------------
function shortPlace(name: string): string { return name.split(',')[0]; }
function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
