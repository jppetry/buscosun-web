/**
 * Side-panel rendering the point-forecast as an hourly table.
 *
 * Each row is one forecast hour; columns show T (°C, elevation-corrected),
 * wind (m/s + dir), precip (mm/h), cloud-total (%). Per-variable confidence
 * appears as a thin coloured bar that turns from red (low) to green (high).
 *
 * The first 3 hours are visually highlighted as "nowcast" — they include the
 * live station observations in the blend.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { getPointForecast } from './pointForecast';
import type { PointForecast } from './types';
import type { Country } from '../types';
import type { ModelSource } from '../fusion/modelSource';
import { fetchDwdAlerts, severityColor, type DwdAlertsResult } from '../sources/dwdAlerts';
import {
  fetchPollenForecast,
  pollenColor,
  POLLEN_LABEL,
  POLLEN_SPECIES,
  type PollenForecast,
} from '../sources/dwdPollen';
import { fetchOpenMeteoPollen, type OpenMeteoPollen } from '../sources/openMeteoPollen';
import { isOpenMeteoOptIn, setOpenMeteoOptIn } from '../optIn';
import { avalancheFor, AVALANCHE_MIN_ELEVATION_M } from '../avalanche';
import { hasOwnWarnings, warningsSourceFor, countryLabel } from '../officialSources';
import FavoriteStar from '../FavoriteStar';
import { placePageFor } from '../router/placePages';
import { PointForecastOverview } from './PointForecastOverview';
import { PointForecastCharts } from './PointForecastCharts';

export type PointForecastView = 'overview' | 'charts' | 'table';
type View = PointForecastView;

interface Props {
  lat: number;
  lng: number;
  country: Country;
  locationLabel: string;
  hours?: number;
  /**
   * Modellquelle der Punkt-Engine: `'fusion'` (Default) = Multi-Quellen-Blend,
   * `'native'` = Einzelmodell-Isolation. Vom Fusion⇄Native-Switch der Karte
   * gesteuert; Default hält das eingefrorene Blend-Verhalten.
   */
  sourceMode?: ModelSource;
  /**
   * Optional kontrollierter Tab (Übersicht/Diagramme/Tabelle) — die mobile
   * Kartenseite steuert damit die Ansicht Karte⇄Diagramm von außen. Ohne
   * Prop verhält sich der Tab-Zustand wie bisher (intern).
   */
  view?: PointForecastView;
  onViewChange?: (v: PointForecastView) => void;
}

const REFRESH_MS = 10 * 60 * 1000;        // refresh every 10 min

// Memoized: this panel does the full point-forecast compute + charts/table
// render. Its props (lat/lng/country/label/sourceMode) are all stable primitives
// and are UNCHANGED by a map layer toggle — yet the parent MapView re-renders on
// every toggle (the `active` Set is new each time). Without memo, each toggle
// re-rendered this whole subtree, the dominant share of the measured ~490 ms
// main-thread block on mobile. memo makes a layer toggle skip it entirely.
// Desktop is unaffected (identical output; only redundant renders are skipped).
export const PointForecastPanel = memo(PointForecastPanelImpl);

function PointForecastPanelImpl({ lat, lng, country, locationLabel, hours = 24, sourceMode = 'fusion', view: viewProp, onViewChange }: Props) {
  const [data, setData] = useState<PointForecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [alerts, setAlerts] = useState<DwdAlertsResult | null>(null);
  const [pollen, setPollen] = useState<PollenForecast | null>(null);
  const [omPollen, setOmPollen] = useState<OpenMeteoPollen | null>(null);
  const [omOptIn, setOmOptIn] = useState<boolean>(() => isOpenMeteoOptIn());
  const [viewState, setViewState] = useState<View>('overview');
  // Kontrolliert-wenn-übergeben: `view`-Prop gewinnt, sonst interner Zustand.
  const view = viewProp ?? viewState;
  const setView = (v: View) => { onViewChange?.(v); if (viewProp === undefined) setViewState(v); };

  // Mobile-Bottom-Sheet: per Touch nach oben/unten wischbar (peek ↔ full ↔ zu).
  const [snap, setSnap] = useState<'peek' | 'full'>('peek');
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startY: 0, startH: 0, active: false });

  function onGrabStart(e: React.TouchEvent) {
    const body = bodyRef.current;
    if (!body) return;
    drag.current = { startY: e.touches[0].clientY, startH: body.offsetHeight, active: true };
    body.style.transition = 'none';
  }
  function onGrabMove(e: React.TouchEvent) {
    const body = bodyRef.current;
    if (!body || !drag.current.active) return;
    const dy = drag.current.startY - e.touches[0].clientY;      // hoch = positiv
    const maxH = window.innerHeight * 0.92;
    const next = Math.max(60, Math.min(maxH, drag.current.startH + dy));
    body.style.height = `${next}px`;
    e.preventDefault();
  }
  function onGrabEnd() {
    const body = bodyRef.current;
    if (!body || !drag.current.active) return;
    drag.current.active = false;
    const finalH = body.offsetHeight;
    const vh = window.innerHeight;
    body.style.transition = '';
    body.style.height = '';                                      // CSS-Klasse übernimmt (mit Transition)
    if (finalH < vh * 0.24) { setSnap('peek'); setOpen(false); } // weit runter → schließen
    else if (finalH > vh * 0.6) setSnap('full');                 // weit hoch → voll
    else setSnap('peek');
  }

  function enableOmPollen() { setOpenMeteoOptIn(true); setOmOptIn(true); }
  function disableOmPollen() { setOpenMeteoOptIn(false); setOmOptIn(false); setOmPollen(null); }

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(null);
    getPointForecast({ lat, lng, country, hours, signal: abort.signal, includeRadarNowcast: true, sourceMode })
      .then((r) => { if (!abort.signal.aborted) { setData(r); setLoading(false); } })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    const t = window.setInterval(() => {
      getPointForecast({ lat, lng, country, hours, includeRadarNowcast: true, sourceMode }).then(setData).catch(() => {});
    }, REFRESH_MS);
    return () => { abort.abort(); window.clearInterval(t); };
  }, [lat, lng, country, hours, sourceMode]);

  // DWD warnings: refreshed every 5 min, point-query via BrightSky.
  useEffect(() => {
    const abort = new AbortController();
    const load = () =>
      fetchDwdAlerts(lat, lng, abort.signal)
        .then(setAlerts)
        .catch(() => {});
    load();
    const t = window.setInterval(load, 5 * 60_000);
    return () => { abort.abort(); window.clearInterval(t); };
  }, [lat, lng]);

  // Pollen forecast: DE only (DWD opendata has no AT/CH equivalent feed).
  // Cached server-side via the source module; refresh every 6 h.
  useEffect(() => {
    if (country !== 'DE') { setPollen(null); return; }
    const abort = new AbortController();
    const load = () =>
      fetchPollenForecast(lat, lng, abort.signal)
        .then(setPollen)
        .catch(() => {});
    load();
    const t = window.setInterval(load, 6 * 3600_000);
    return () => { abort.abort(); window.clearInterval(t); };
  }, [lat, lng, country]);

  // AT/CH-Pollen via Open-Meteo/CAMS — NUR per Opt-in (Rate-Limit/Lizenz).
  useEffect(() => {
    if (country === 'DE' || !omOptIn) { setOmPollen(null); return; }
    const abort = new AbortController();
    const load = () =>
      fetchOpenMeteoPollen(lat, lng, abort.signal)
        .then(setOmPollen)
        .catch(() => {});
    load();
    const t = window.setInterval(load, 6 * 3600_000);
    return () => { abort.abort(); window.clearInterval(t); };
  }, [lat, lng, country, omOptIn]);

  return (
    <div className={`pfc-panel ${open ? 'pfc-open' : 'pfc-closed'} pfc-m-${snap}`}>
      <button
        className="pfc-toggle"
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Punktforecast einklappen' : 'Punktforecast aufklappen'}
        type="button"
      >
        {open ? '›' : '‹'} Forecast
      </button>
      {open && (
        <div className="pfc-body" ref={bodyRef}>
          <div
            className="pfc-grab"
            role="button"
            tabIndex={0}
            aria-label="Forecast-Fenster ziehen — hoch für mehr, runter zum Schließen"
            onTouchStart={onGrabStart}
            onTouchMove={onGrabMove}
            onTouchEnd={onGrabEnd}
            onTouchCancel={onGrabEnd}
          >
            <span className="pfc-grab-bar" />
          </div>
          <div className="pfc-head">
            <div className="pfc-title">Punktforecast</div>
            <div className="pfc-loc-row">
              <div className="pfc-loc" title={`${lat.toFixed(3)}, ${lng.toFixed(3)}`}>
                {locationLabel}
              </div>
              {/* V-04: der zweite Ort, an dem ein Favorit entstehen kann —
                  hier steht der Nutzer bereits vor „seinem" Ort. */}
              <FavoriteStar loc={{ name: locationLabel, lat, lon: lng, country }} className="pfc-fav" withLabel />
            </div>
            {/* SEO/GEO 2026 (E2): liegt der Ort in der kuratierten Ortsliste, führt ein
                Link zur statischen Ortsseite (Klimafakten, FAQ) — interne Verlinkung App → /wetter/. */}
            {(() => { const pp = placePageFor(lat, lng); return pp ? <a className="pfc-place-link" href={pp.href}>Mehr über das Wetter in {pp.name} →</a> : null; })()}
            {data && (
              <div className="pfc-meta">
                {Math.round(data.query.elevation)} m ü. NN ·
                γ {(data.lapseRatePerM * 1000).toFixed(2)} K/km ·
                {data.nearestStations.length} Stationen ·
                {data.sourcesAvailable.length} Modelle
              </div>
            )}
          </div>

          {loading && <div className="pfc-status">Lade Punktforecast…</div>}
          {error && <div className="pfc-status pfc-err">⚠ {error}</div>}

          {data && !loading && !error && (
            <div className="pfc-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className={view === 'overview' ? 'active' : ''}
                onClick={() => setView('overview')}
                aria-selected={view === 'overview'}
              >
                Übersicht
              </button>
              <button
                type="button"
                role="tab"
                className={view === 'charts' ? 'active' : ''}
                onClick={() => setView('charts')}
                aria-selected={view === 'charts'}
              >
                Diagramme
              </button>
              <button
                type="button"
                role="tab"
                className={view === 'table' ? 'active' : ''}
                onClick={() => setView('table')}
                aria-selected={view === 'table'}
              >
                Tabelle
              </button>
            </div>
          )}

          {alerts && alerts.alerts.length > 0 && (
            <div className="pfc-alerts">
              {alerts.alerts.slice(0, 4).map((a) => (
                <div
                  key={a.alertId}
                  className="pfc-alert"
                  style={{ background: severityColor(a.level) }}
                  title={a.description}
                >
                  <div className="pfc-alert-headline">⚠ {a.headline}</div>
                  {a.instruction && (
                    <div className="pfc-alert-instruction">{a.instruction}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* AT/CH: Warn-Feed ist DE-only (dwdAlerts). Ohne diesen Hinweis sieht eine
              Datenlücke aus wie eine Entwarnung — der gefährlichste stille Fehler der
              App (D-04). Rein additiv; DE bleibt unverändert. */}
          {!hasOwnWarnings(country) && (() => {
            const src = warningsSourceFor(country);
            return (
              <div className="pfc-optin pfc-warn-gap">
                <span className="eyebrow">Amtliche Warnungen</span>
                <p>
                  Für {countryLabel(country)} liegt uns <strong>kein amtlicher Warn-Feed</strong> vor —
                  buscosun kann hier keine Unwetterwarnungen anzeigen. Das heißt <em>nicht</em>,
                  dass keine bestehen.
                </p>
                <a
                  className="pfc-optin-btn"
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {src.name} öffnen ↗
                </a>
                <p className="pfc-warn-gap-src">
                  Quelle: {src.operator}
                  {src.caveat ? ` — ${src.caveat}` : ''}
                </p>
              </div>
            );
          })()}

          {view === 'overview' && pollen && (
            <details className="pfc-pollen pfc-pollen-collapse">
              <summary className="pfc-pollen-summary" title={pollen.legend}>
                <span className="eyebrow">Pollen · {pollen.region}</span>
                <span className="pfc-pollen-now">{pollenSummaryDE(pollen)}</span>
              </summary>
              <div className="pfc-pollen-head">
                <span className="pfc-pollen-sub">heute · morgen · übermorgen</span>
              </div>
              <div className="pfc-pollen-grid">
                {POLLEN_SPECIES.map((sp) => {
                  const lev = pollen.species[sp];
                  const peak = Math.max(lev.today, lev.tomorrow, lev.dayAfter);
                  return (
                    <div key={sp} className="pfc-pollen-row">
                      <span className="pfc-pollen-name">{POLLEN_LABEL[sp]}</span>
                      <div className="pfc-pollen-boxes">
                        <span
                          className="pfc-pollen-box"
                          style={{ background: pollenColor(lev.today) }}
                          title={`heute ${lev.today.toFixed(1)}`}
                        />
                        <span
                          className="pfc-pollen-box"
                          style={{ background: pollenColor(lev.tomorrow) }}
                          title={`morgen ${lev.tomorrow.toFixed(1)}`}
                        />
                        <span
                          className="pfc-pollen-box"
                          style={{ background: pollenColor(lev.dayAfter) }}
                          title={`übermorgen ${lev.dayAfter.toFixed(1)}`}
                        />
                      </div>
                      <span
                        className="pfc-pollen-severity"
                        style={{ color: pollenColor(peak) }}
                      >
                        {pollenSeverityLabel(peak)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {/* AT/CH: Pollen via Open-Meteo/CAMS — Opt-in (kein Default; Rate-Limit/Lizenz). */}
          {view === 'overview' && country !== 'DE' && !omOptIn && (
            <div className="pfc-optin">
              <span className="eyebrow">Pollen für {country === 'AT' ? 'Österreich' : 'die Schweiz'}</span>
              <p>Kein offener amtlicher Pollen-Feed für AT/CH. Optional über <strong>Open-Meteo / CAMS</strong> (externe Quelle, Rate-Limit) — Richtwerte, keine amtliche Aussage.</p>
              <button type="button" className="pfc-optin-btn" onClick={enableOmPollen}>Pollen via Open-Meteo aktivieren</button>
            </div>
          )}
          {view === 'overview' && country !== 'DE' && omOptIn && omPollen && omPollen.species.length > 0 && (
            <details className="pfc-pollen pfc-pollen-collapse">
              <summary className="pfc-pollen-summary">
                <span className="eyebrow">Pollen · CAMS (Open-Meteo)</span>
                <span className="pfc-pollen-now">{pollenSummaryOM(omPollen)}</span>
              </summary>
              <div className="pfc-pollen-head">
                <span className="pfc-pollen-sub">heute · morgen · übermorgen</span>
              </div>
              <div className="pfc-pollen-grid">
                {omPollen.species.map((sp) => {
                  const peak = Math.max(sp.today, sp.tomorrow, sp.dayAfter);
                  return (
                    <div key={sp.key} className="pfc-pollen-row">
                      <span className="pfc-pollen-name">{sp.label}</span>
                      <div className="pfc-pollen-boxes">
                        <span className="pfc-pollen-box" style={{ background: pollenColor(sp.today) }} title={`heute ${sp.today.toFixed(1)}`} />
                        <span className="pfc-pollen-box" style={{ background: pollenColor(sp.tomorrow) }} title={`morgen ${sp.tomorrow.toFixed(1)}`} />
                        <span className="pfc-pollen-box" style={{ background: pollenColor(sp.dayAfter) }} title={`übermorgen ${sp.dayAfter.toFixed(1)}`} />
                      </div>
                      <span className="pfc-pollen-severity" style={{ color: pollenColor(peak) }}>{pollenSeverityLabel(peak)}</span>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="pfc-optin-off" onClick={disableOmPollen} title="Open-Meteo-Pollen wieder deaktivieren">Quelle: Open-Meteo / CAMS · opt-in · deaktivieren</button>
            </details>
          )}

          {/* Alpin: Deep-Link zum amtlichen Lawinenlagebericht (wir modellieren keine Lawinen). */}
          {data && data.query.elevation >= AVALANCHE_MIN_ELEVATION_M && (() => {
            const av = avalancheFor(country);
            if (!av) return null;
            return (
              <div className="pfc-avalanche">
                <span className="eyebrow">Lawinenlagebericht · {av.region}</span>
                <div className="pfc-av-links">
                  <a className="pfc-av-link" href={av.primary.url} target="_blank" rel="noopener noreferrer">{av.primary.name} ↗</a>
                  <a className="pfc-av-link pfc-av-link-sec" href={av.eaws.url} target="_blank" rel="noopener noreferrer">{av.eaws.name} ↗</a>
                </div>
                <p className="pfc-av-note">buscosun modelliert <strong>keine</strong> Lawinengefahr — das ist die amtliche Quelle. Saisonal (Winter); im Sommer kein aktuelles Bulletin.</p>
              </div>
            );
          })()}

          {data && view === 'overview' && <PointForecastOverview data={data} />}
          {data && view === 'charts' && <PointForecastCharts data={data} />}
          {data && view === 'table' && (
            <div className="pfc-table-wrap">
              <table className="pfc-table">
                <thead>
                  <tr>
                    <th>Zeit</th>
                    <th>T °C</th>
                    <th>Wind</th>
                    <th>Regen</th>
                    <th>Wolken</th>
                    <th>Quellen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hours.map((h, i) => (
                    <tr key={i} className={i < 3 ? 'pfc-nowcast' : ''}>
                      <td className="pfc-t">
                        {fmtTime(h.timestamp, i)}
                      </td>
                      <td>
                        {fmtNum(h.temperature, 1)}
                        <span className="pfc-conf" style={confStyle(h.confidence.temperature)} />
                      </td>
                      <td>
                        {h.windSpeed != null ? `${h.windSpeed.toFixed(1)} m/s` : '—'}
                        {h.windDirection != null && (
                          <span
                            className="pfc-arrow"
                            style={{ transform: `rotate(${h.windDirection + 180}deg)` }}
                            aria-label={`Wind aus ${Math.round(h.windDirection)}°`}
                          >▲</span>
                        )}
                        <span className="pfc-conf" style={confStyle(h.confidence.wind)} />
                      </td>
                      <td>
                        {fmtNum(h.precipitation, 1)}{h.precipitation != null ? ' mm/h' : ''}
                        <span className="pfc-conf" style={confStyle(h.confidence.precipitation)} />
                      </td>
                      <td>
                        {fmtNum(h.cloudCoverTotal, 0)}{h.cloudCoverTotal != null ? ' %' : ''}
                        <span className="pfc-conf" style={confStyle(h.confidence.clouds)} />
                      </td>
                      <td className="pfc-src">
                        {h.contributingSources.slice(0, 2).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pfc-tbl-legend">
                <span className="eyebrow">Lesehilfe</span>
                <div className="pfc-tbl-legend-row">
                  <span className="pfc-tbl-legend-dot" />
                  <span>Nowcast — erste 3 h, durch Stationen verankert</span>
                </div>
                <div className="pfc-tbl-legend-row">
                  <span className="pfc-tbl-legend-bar" style={{ width: '22px', background: 'var(--sage-600)' }} />
                  <span>Konfidenz Hoch — 80–100 %</span>
                </div>
                <div className="pfc-tbl-legend-row">
                  <span className="pfc-tbl-legend-bar" style={{ width: '14px', background: 'var(--amber-500)' }} />
                  <span>Konfidenz Moderat — 50–79 %</span>
                </div>
                <div className="pfc-tbl-legend-row">
                  <span className="pfc-tbl-legend-bar" style={{ width: '8px', background: 'var(--terracotta-500)' }} />
                  <span>Konfidenz Niedrig — unter 50 %</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtTime(ts: Date, hourIdx: number): string {
  const time = ts.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (hourIdx === 0) return `jetzt · ${time}`;
  return `+${hourIdx} h · ${time}`;
}
function fmtNum(v: number | null, digits: number): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}
function confStyle(c: number): React.CSSProperties {
  // c = 0 → red, c = 1 → green
  const hue = Math.round(120 * Math.max(0, Math.min(1, c)));
  return { background: `hsl(${hue}, 70%, 50%)`, width: `${Math.max(8, c * 36)}px` };
}
function pollenSeverityLabel(level: number): string {
  // DWD pollen levels: 0 = none, 0.5/1 = very low, 1.5/2 = low, 2.5/3 = moderate
  if (level >= 2.5) return 'HOCH';
  if (level >= 1.5) return 'MITTEL';
  if (level > 0)    return 'GERING';
  return 'KEIN';
}

/** Kompakte Einzeiler-Zusammenfassung für den eingeklappten Pollen-Block:
 *  die belasteten Arten (peak > 0), höchste zuerst, max. zwei. */
function pollenSummaryDE(pollen: PollenForecast): string {
  const items = POLLEN_SPECIES
    .map((sp) => { const l = pollen.species[sp]; return { name: POLLEN_LABEL[sp], peak: Math.max(l.today, l.tomorrow, l.dayAfter) }; })
    .filter((x) => x.peak > 0)
    .sort((a, b) => b.peak - a.peak);
  if (items.length === 0) return 'keine nennenswerte Belastung';
  return items.slice(0, 2).map((x) => `${x.name} ${pollenSeverityLabel(x.peak).toLowerCase()}`).join(' · ');
}
function pollenSummaryOM(om: OpenMeteoPollen): string {
  const items = om.species
    .map((sp) => ({ name: sp.label, peak: Math.max(sp.today, sp.tomorrow, sp.dayAfter) }))
    .filter((x) => x.peak > 0)
    .sort((a, b) => b.peak - a.peak);
  if (items.length === 0) return 'keine nennenswerte Belastung';
  return items.slice(0, 2).map((x) => `${x.name} ${pollenSeverityLabel(x.peak).toLowerCase()}`).join(' · ');
}
