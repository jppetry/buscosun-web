/**
 * Go / No-Go · Arbeitsfenster — Seite (P1, backend-frei, kontolos).
 *
 * Ort wählen → Berufs-Profil (oder eigene Schwellen) → Ampel-Timeline der
 * nächsten ~48 h plus grüne Arbeitsfenster. Wertet die bestehende
 * Punktforecast-Pipeline aus; Schwellen liegen in localStorage. Richtwerte,
 * keine amtlichen Grenzen — Disclaimer prominent.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import { getPointForecast } from '../pointForecast/pointForecast';
import type { PointForecast } from '../pointForecast/types';
import { fetchCapeSeriesAtPoint } from '../sources/iconD2Cape';
import { fetchDwdAlerts } from '../sources/dwdAlerts';
import { convectiveOutlook, type ConvectiveOutlook } from '../radar/convectiveIndex';
import {
  PARAMS, PROFILES, defaultCustomThresholds, evalHour, spansFrom, firstGoWindow,
  type Thresholds, type Status, type HourEval, type StatusSpan, type ParamKey,
} from './gonogoModel';
import { exportSvgAsPng } from '../imageExport';
import '../route/tourTheme.css';
import './gonogo.css';

const PROFILE_KEY = 'buscosun.gonogo.profile.v1';
const CUSTOM_KEY = 'buscosun.gonogo.custom.v1';
const HOURS = 48;

const STATUS_COLOR: Record<Status, string> = {
  go: '#5B9A6F', caution: '#D4A373', nogo: '#B5483D', unknown: '#C4BBA6',
};
const STATUS_LABEL: Record<Status, string> = {
  go: 'Frei', caution: 'Vorsicht', nogo: 'Stopp', unknown: 'Keine Vorhersage',
};

interface Props { onBack: () => void }

type FcState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; forecast: PointForecast }
  | { kind: 'error'; message: string };

export default function GoNoGoPage({ onBack }: Props) {
  const [location, setLocation] = useState<Location | null>(null);
  const [profileId, setProfileId] = useState<string>(() => {
    try { return localStorage.getItem(PROFILE_KEY) || 'drone'; } catch { return 'drone'; }
  });
  const [custom, setCustom] = useState<Thresholds>(() => {
    try { const raw = localStorage.getItem(CUSTOM_KEY); if (raw) return JSON.parse(raw) as Thresholds; } catch { /* ignore */ }
    return defaultCustomThresholds();
  });
  const [state, setState] = useState<FcState>({ kind: 'idle' });
  // Gewittergefahr-Ausblick (nur DE, nur naher CAPE-Horizont) — rein informativ,
  // beeinflusst die Ampel-Schwellen NICHT.
  const [storm, setStorm] = useState<ConvectiveOutlook | null>(null);
  const acRef = useRef<AbortController | null>(null);

  function selectProfile(id: string) { setProfileId(id); try { localStorage.setItem(PROFILE_KEY, id); } catch { /* ignore */ } }

  const activeThresholds: Thresholds = profileId === 'custom'
    ? custom
    : PROFILES.find((p) => p.id === profileId)?.thresholds ?? custom;

  // Jede Schwellen-Änderung macht daraus „Eigenes Profil" (Preset als Startpunkt).
  function setThreshold(key: ParamKey, field: 'watch' | 'alert', value: number | null) {
    const base: Thresholds = JSON.parse(JSON.stringify(activeThresholds));
    base[key][field] = value;
    setCustom(base);
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(base)); } catch { /* ignore */ }
    selectProfile('custom');
  }

  useEffect(() => {
    if (!location) { setState({ kind: 'idle' }); return; }
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const forecast = await getPointForecast({ lat: location.lat, lng: location.lon, country: location.country, hours: HOURS, signal: ac.signal, includeRadarNowcast: true });
        if (ac.signal.aborted) return;
        setState({ kind: 'ready', forecast });
      } catch (err) {
        if (ac.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Wetterdaten nicht erreichbar' });
      }
    })();
    return () => ac.abort();
  }, [location]);

  // Gewittergefahr lazy nachladen, sobald der Forecast steht (DE-only, Hintergrund).
  useEffect(() => {
    setStorm(null);
    if (state.kind !== 'ready' || !location || location.country !== 'DE') return;
    const ac = new AbortController();
    const hours = state.forecast.hours;
    (async () => {
      try {
        const [series, alerts] = await Promise.all([
          fetchCapeSeriesAtPoint(location.lat, location.lon, 24, ac.signal),
          fetchDwdAlerts(location.lat, location.lon, ac.signal).then((r) => r.alerts).catch(() => []),
        ]);
        if (ac.signal.aborted) return;
        const warnLevel = alerts.reduce((m, a) => (/gewitter/i.test(a.event) || /gewitter/i.test(a.headline) ? Math.max(m, a.level) : m), 0);
        const steps = series.map((s) => ({ atMs: s.validAtMs, capeJkg: s.capeJkg, precipMmH: nearestPrecip(hours, s.validAtMs) }));
        setStorm(convectiveOutlook(steps, warnLevel));
      } catch { /* ICON-D2 CAPE nicht erreichbar → kein Banner */ }
    })();
    return () => ac.abort();
  }, [state, location]);

  const evals: HourEval[] = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return state.forecast.hours.slice(0, HOURS).map((h) => evalHour(h, activeThresholds));
  }, [state, activeThresholds]);
  const spans = useMemo(() => spansFrom(evals), [evals]);
  const nextGo = useMemo(() => firstGoWindow(spans, 1), [spans]);

  return (
    <div className="rt-page gng-page">
      <div className="rt-grain" />
      <nav className="rt-nav">
        <a className="rt-nav-logo" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
          <span className="rt-nav-logo-mark" /><span className="rt-nav-logo-name">buscosun</span>
        </a>
        <div className="rt-nav-right">
          <span className="rt-nav-live">{state.kind === 'ready' ? 'Daten live' : 'Arbeitsfenster'}</span>
          <button type="button" className="rt-nav-item" onClick={onBack}>Zurück</button>
        </div>
      </nav>

      <main className="rt-container">
        <header className="rt-intro">
          <span className="rt-eyebrow">Go / No-Go · Arbeitsfenster</span>
          <h1>Wann darfst du raus?</h1>
          <p>Wähle Ort und Profil — wir zeigen die nächsten 48 Stunden als Ampel und nennen die freien Fenster. Für Drohne, Kran, Höhenarbeit, Anstrich oder Event-Aufbau.</p>
        </header>

        <section className="rt-section">
          <span className="rt-eyebrow">1 · Ort</span>
          <LocationField value={location} onChange={setLocation} />
        </section>

        <section className="rt-section">
          <span className="rt-eyebrow">2 · Profil</span>
          <div className="gng-profiles" role="radiogroup" aria-label="Profil">
            {PROFILES.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={profileId === p.id}
                className={`gng-profile${profileId === p.id ? ' is-active' : ''}`} onClick={() => selectProfile(p.id)}>
                <span className="gng-profile-label">{p.label}</span>
                <span className="gng-profile-hint">{p.hint}</span>
              </button>
            ))}
            <button type="button" role="radio" aria-checked={profileId === 'custom'}
              className={`gng-profile gng-profile-custom${profileId === 'custom' ? ' is-active' : ''}`} onClick={() => selectProfile('custom')}>
              <span className="gng-profile-label">Eigenes Profil</span>
              <span className="gng-profile-hint">Schwellen frei setzen</span>
            </button>
          </div>

          <ThresholdEditor thresholds={activeThresholds} onChange={setThreshold} />
        </section>

        {location && state.kind === 'loading' && (
          <div className="rt-card gng-state"><span className="ev-spinner" /> <p>Vorhersage wird geladen …</p></div>
        )}
        {location && state.kind === 'error' && (
          <div className="rt-card gng-state"><p>⚠ {state.message}</p></div>
        )}

        {state.kind === 'ready' && evals.length > 0 && (
          <>
            <section className="rt-section">
              <div className="gng-result-head">
                <span className="rt-eyebrow">3 · Nächste {evals.length} Stunden</span>
                {nextGo
                  ? <span className="gng-next gng-next-go">Nächstes freies Fenster: <strong>{fmtWindow(nextGo)}</strong></span>
                  : <span className="gng-next gng-next-none">Kein durchgehend freies Fenster in den nächsten {evals.length} h</span>}
              </div>
              {storm && <StormBanner outlook={storm} />}
              <Timeline evals={evals} location={location!} profileLabel={profileId === 'custom' ? 'Eigenes Profil' : PROFILES.find((p) => p.id === profileId)?.label ?? ''} />
            </section>

            <section className="rt-section">
              <span className="rt-eyebrow">Fenster im Detail</span>
              <div className="gng-spanlist">
                {spans.map((s, i) => (
                  <div key={i} className={`gng-span gng-span-${s.status}`}>
                    <span className="gng-span-pill" style={{ background: STATUS_COLOR[s.status] }}>{STATUS_LABEL[s.status]}</span>
                    <span className="gng-span-time">{fmtWindow(s)}</span>
                    <span className="gng-span-dur">{s.hours} h</span>
                    <span className="gng-span-reason">{spanReason(s, evals)}</span>
                  </div>
                ))}
              </div>
            </section>

            <p className="gng-disclaimer">
              ⚠ <strong>Richtwerte, keine amtlichen oder herstellerverbindlichen Grenzwerte.</strong> Wind/Böen sind 10-m-Modellwerte (DWD ICON-D2 · GeoSphere · MeteoSwiss, höhenkorrigiert) — lokale Verstärkung an Kanten, Dächern und in Schluchten ist möglich. Die Entscheidung und Verantwortung bleiben bei dir.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

// --- Gewittergefahr-Banner (informativ, DE-Nahbereich) -----------------------

/** Niederschlag (mm/h) der Forecast-Stunde, die `atMs` am nächsten liegt (±45 min). */
function nearestPrecip(hours: PointForecast['hours'], atMs: number): number | null {
  let best: number | null = null, bestD = 45 * 60_000;
  for (const h of hours) {
    const d = Math.abs(h.timestamp.getTime() - atMs);
    if (d <= bestD) { bestD = d; best = h.precipitation; }
  }
  return best;
}

function StormBanner({ outlook }: { outlook: ConvectiveOutlook }) {
  // Ohne echte CAPE-Daten (Punkt außerhalb ICON-D2) zeigen wir KEIN Gewittersignal.
  if (!outlook.capeAvailable) return null;
  const { index, peakAtMs, capeHorizonMs } = outlook;
  const horizonTxt = capeHorizonMs ? `bis ${fmtDayHour(new Date(capeHorizonMs))}` : '';
  const active = index.level !== 'none' && index.level !== 'low';
  if (!active) {
    return (
      <div className="gng-storm gng-storm-clear">
        <IconStorm /> <span>Keine Gewitterlage erkennbar{horizonTxt ? ` (${horizonTxt})` : ''}.</span>
      </div>
    );
  }
  return (
    <div className={`gng-storm gng-storm-${index.level}`} role="note">
      <IconStorm />
      <div className="gng-storm-body">
        <strong>Gewittergefahr: {index.label}</strong>
        {peakAtMs && <span className="gng-storm-when"> · Spitze {fmtDayHour(new Date(peakAtMs))}</span>}
        <span className="gng-storm-drivers">{index.drivers.join(' · ')}</span>
      </div>
    </div>
  );
}

function IconStorm() {
  return (
    <svg className="gng-storm-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 16.9A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" /><polyline points="13 11 9 17 15 17 11 23" />
    </svg>
  );
}

// --- Ampel-Timeline ----------------------------------------------------------

function Timeline({ evals, location, profileLabel }: { evals: HourEval[]; location: Location; profileLabel: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const cellW = 15, plotTop = 22, barH = 46, axisH = 30;
  const W = evals.length * cellW;
  const H = plotTop + barH + axisH;

  return (
    <div className="gng-timeline-card rt-card">
      <div className="gng-timeline-head">
        <div className="gng-legend">
          {(['go', 'caution', 'nogo', 'unknown'] as Status[]).map((s) => (
            <span key={s} className="gng-legend-item"><i style={{ background: STATUS_COLOR[s] }} />{STATUS_LABEL[s]}</span>
          ))}
        </div>
        <button type="button" className="gng-export" title="Ampel als Bild (PNG) herunterladen"
          onClick={() => svgRef.current && void exportSvgAsPng(svgRef.current, {
            filename: 'buscosun-arbeitsfenster.png',
            title: `Arbeitsfenster · ${profileLabel}`,
            subtitle: `${location.name} · nächste ${evals.length} h`,
            source: 'buscosun · Richtwerte, keine amtlichen Grenzen · DWD/GeoSphere/MeteoSwiss',
          })}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Als Bild</span>
        </button>
      </div>
      <div className="gng-timeline-scroll">
        <svg ref={svgRef} className="gng-timeline-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Ampel der nächsten ${evals.length} Stunden für ${profileLabel}`}>
          {evals.map((e, i) => {
            const x = i * cellW;
            const hour = e.timestamp.getHours();
            const isDayStart = hour === 0 || i === 0;
            return (
              <g key={i}>
                <rect x={x + 0.5} y={plotTop} width={cellW - 1} height={barH} fill={STATUS_COLOR[e.status]}
                  opacity={e.status === 'unknown' ? 0.5 : 0.92}>
                  <title>{`${fmtDayHour(e.timestamp)} · ${STATUS_LABEL[e.status]}${e.reason ? ` · ${e.reason}` : ''}`}</title>
                </rect>
                {hour % 6 === 0 && (
                  <>
                    <line x1={x} y1={plotTop + barH} x2={x} y2={plotTop + barH + 4} stroke="#C4B896" strokeWidth="1" />
                    <text x={x + 1} y={plotTop + barH + 16} className="gng-tl-hour">{hour}</text>
                  </>
                )}
                {isDayStart && (
                  <text x={x + 1} y={plotTop - 8} className="gng-tl-day">{i === 0 ? 'heute' : fmtWeekday(e.timestamp)}</text>
                )}
                {isDayStart && i !== 0 && <line x1={x} y1={plotTop} x2={x} y2={plotTop + barH} stroke="#fff" strokeWidth="1.5" />}
              </g>
            );
          })}
          <text x={W - 2} y={plotTop + barH + 16} className="gng-tl-hour" textAnchor="end">Uhr</text>
        </svg>
      </div>
    </div>
  );
}

// --- Schwellen-Editor --------------------------------------------------------

function ThresholdEditor({ thresholds, onChange }: { thresholds: Thresholds; onChange: (k: ParamKey, f: 'watch' | 'alert', v: number | null) => void }) {
  return (
    <details className="gng-editor rt-card">
      <summary>Schwellen anpassen <span className="gng-editor-note">— jede Änderung wird zu „Eigenes Profil"</span></summary>
      <table className="gng-thr-table">
        <thead>
          <tr><th>Parameter</th><th>gelb ab/unter</th><th>rot ab/unter</th><th></th></tr>
        </thead>
        <tbody>
          {PARAMS.map((meta) => {
            const thr = thresholds[meta.key];
            const onFor = thr.watch != null || thr.alert != null;
            return (
              <tr key={meta.key} className={onFor ? '' : 'is-off'}>
                <td className="gng-thr-label">{meta.label}</td>
                <td><NumCell value={thr.watch} unit={meta.unit} onChange={(v) => onChange(meta.key, 'watch', v)} /></td>
                <td><NumCell value={thr.alert} unit={meta.unit} onChange={(v) => onChange(meta.key, 'alert', v)} /></td>
                <td>
                  <button type="button" className="gng-thr-toggle" onClick={() => {
                    if (onFor) { onChange(meta.key, 'watch', null); onChange(meta.key, 'alert', null); }
                    else { const d = defaultCustomThresholds()[meta.key]; onChange(meta.key, 'watch', d.watch); onChange(meta.key, 'alert', d.alert); }
                  }}>{onFor ? 'aus' : 'an'}</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

function NumCell({ value, unit, onChange }: { value: number | null; unit: string; onChange: (v: number | null) => void }) {
  return (
    <span className="gng-num">
      <input type="number" inputMode="decimal" step={unit === 'mm/h' ? 0.1 : 1} value={value ?? ''}
        onChange={(e) => { const v = e.target.value; onChange(v === '' ? null : Number(v)); }}
        placeholder="–" aria-label={`Schwelle ${unit}`} />
      <em>{unit}</em>
    </span>
  );
}

// --- Ort-Suche (kompakt, DACH) — gleiches Muster wie übrige Features ----------

function LocationField({ value, onChange }: { value: Location | null; onChange: (l: Location | null) => void }) {
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
      if (found.length === 0) setError('Keine Ergebnisse in DE / AT / CH.');
      else if (found.length === 1) onChange(found[0]);
      else setResults(found);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally { setLoading(false); }
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
        <button type="button" className="ev-search-go" onClick={() => void search()} disabled={loading || !query.trim()}>
          {loading ? 'Suche …' : 'Suchen'}
        </button>
      </div>
      {(results.length > 0 || error) && (
        <div className="ev-search-dropdown" role="listbox">
          {error && <div className="ev-search-error">⚠ {error}</div>}
          {results.map((r, i) => (
            <button key={`${r.lat},${r.lon}-${i}`} type="button" className="ev-search-result" onClick={() => onChange(r)}>
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

const pad2 = (n: number) => String(n).padStart(2, '0');
function fmtWeekday(d: Date): string { return d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''); }
function fmtDayHour(d: Date): string { return `${fmtWeekday(d)} ${pad2(d.getHours())}:00`; }

/** „heute 14–18 Uhr" bzw. „Do 22 – Fr 03 Uhr" über Tagesgrenzen. */
function fmtWindow(s: StatusSpan): string {
  const sameDay = s.start.toDateString() === new Date(s.end.getTime() - 1).toDateString();
  const dayWord = (d: Date) => (d.toDateString() === new Date().toDateString() ? 'heute' : fmtWeekday(d));
  const startTxt = `${dayWord(s.start)} ${pad2(s.start.getHours())}`;
  const endH = s.end.getHours();
  if (sameDay) return `${startTxt}–${pad2(endH)} Uhr`;
  return `${startTxt} – ${dayWord(new Date(s.end.getTime() - 1))} ${pad2(endH)} Uhr`;
}

/** Häufigster begrenzender Faktor einer Spanne (für die Detail-Zeile). */
function spanReason(s: StatusSpan, evals: HourEval[]): string {
  if (s.status === 'go') return 'alles im grünen Bereich';
  if (s.status === 'unknown') return 'jenseits des Vorhersage-Horizonts';
  const inSpan = evals.filter((e) => e.timestamp >= s.start && e.timestamp < s.end && e.reason);
  const worst = inSpan.find((e) => e.status === s.status);
  return worst?.reason ?? '';
}
