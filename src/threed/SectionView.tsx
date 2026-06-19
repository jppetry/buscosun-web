/**
 * 3D-Wetter · Schnitt-Ansicht (Container).
 *
 * Layer-Toggles, Vertikalschnitt-Renderer, Punkt-Pick-Readout (US-F4), Legende
 * mit Einheit + Höhenbezug (US-F3/N5), Unsicherheitshinweis (US-N7), Kennzahlen
 * und Zeit-Slider (US-A5, in Folge-Task ausgebaut).
 */

import { useEffect, useRef, useState } from 'react';
import type { PreparedSection } from './buildCrossSection';
import { SHEAR_THRESHOLD_KMH_PER_300M, type CrossSection } from './crossSection';
import type { LayerState } from './ThreeDPage';
import SectionChart, { BAND_COLORS, BAND_LABELS, type PickedPoint, type SectionGeo } from './SectionChart';
import GoNoGoPanel from './GoNoGoPanel';
import { estimateFoehn, talwindReversals, bearingDeg } from './dynamics';

interface Props {
  prepared: PreparedSection;
  section: CrossSection;
  timeMs: number;
  onTime: (ms: number) => void;
  layers: LayerState;
  onLayers: (l: LayerState) => void;
  locationName: string;
}

const comma = (n: number) => n.toLocaleString('de-DE');
const dirName = (deg: number) => ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) / 45)) % 8];
const fmtTemp = (c: number | null) => (c == null ? '—' : `${c > 0 ? '+' : ''}${Math.round(c)} °C`);

const LAYER_DEFS: Array<{ key: keyof LayerState; label: string }> = [
  { key: 'mean', label: 'Mittelwind' },
  { key: 'gust', label: 'Böen' },
  { key: 'cloudBase', label: 'Wolkenbasis' },
  { key: 'cloudLayers', label: 'Wolkenschichten' },
  { key: 'streamlines', label: 'Streamlines' },
  { key: 'foehn', label: 'Föhn' },
  { key: 'shear', label: 'Shear' },
  { key: 'inversion', label: 'Inversion' },
];

const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Relativer Zeit-Offset zum Jetzt („jetzt" / „in 3 h" / „vor 20 min" / „in 1 Tag"). */
function relTimeLabel(deltaMs: number): string {
  const min = Math.round(deltaMs / 60_000);
  const a = Math.abs(min);
  if (a < 8) return 'jetzt';
  const fut = min > 0;
  if (a < 60) return fut ? `in ${a} min` : `vor ${a} min`;
  const h = Math.round(a / 60);
  if (a < 60 * 24) return fut ? `in ${h} h` : `vor ${h} h`;
  const d = Math.round(a / (60 * 24));
  return fut ? `in ${d} Tag${d > 1 ? 'en' : ''}` : `vor ${d} Tag${d > 1 ? 'en' : ''}`;
}

const STEP_MS = 15 * 60_000;

/** True auf schmalen Screens (Mobile) — steuert das Hochformat des Schnitts. */
function useIsNarrow(maxWidth = 760): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(`(max-width:${maxWidth}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${maxWidth}px)`);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [maxWidth]);
  return narrow;
}

export default function SectionView({ prepared, section, timeMs, onTime, layers, onLayers, locationName }: Props) {
  const [picked, setPicked] = useState<PickedPoint | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showGng, setShowGng] = useState(false);
  const portrait = useIsNarrow();
  const timeRef = useRef(timeMs);
  timeRef.current = timeMs;
  const clock = new Date(timeMs).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const toggle = (k: keyof LayerState) => onLayers({ ...layers, [k]: !layers[k] });

  // JETZT-Position auf dem Zeit-Slider (US-A5).
  const realNow = Date.now();
  const timeSpan = prepared.endMs - prepared.startMs;
  const nowPct = realNow >= prepared.startMs && realNow <= prepared.endMs && timeSpan > 0
    ? ((realNow - prepared.startMs) / timeSpan) * 100 : null;

  // US-A5 — Animation: alle 15 Min weiterschalten, am Ende zum Start loopen.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const next = timeRef.current + STEP_MS;
      onTime(next > prepared.endMs ? prepared.startMs : next);
    }, 650);
    return () => window.clearInterval(id);
  }, [playing, prepared.startMs, prepared.endMs, onTime]);

  // Epic D — Föhn (US-D1) + Talwind-Umkehr (US-D3).
  const cols = section.columns;
  const repCol = cols.reduce((a, b) => (b.terrainM > a.terrainM ? b : a), cols[0]);
  const foehn = estimateFoehn(cols.map((c) => c.surface), repCol.lat);
  const lowEnd = cols[0].terrainM <= cols[cols.length - 1].terrainM ? cols[0] : cols[cols.length - 1];
  const highEnd = lowEnd === cols[0] ? cols[cols.length - 1] : cols[0];
  const upBearing = bearingDeg({ lat: lowEnd.lat, lon: lowEnd.lon }, { lat: highEnd.lat, lon: highEnd.lon });
  const valleyAnchor = prepared.anchors.reduce((a, b) => (b.elevM < a.elevM ? b : a), prepared.anchors[0]);
  const talwind = talwindReversals(valleyAnchor.hours, upBearing);
  // Lee-Seite (abwärtige Hälfte) für die Föhn-Durchgriffszone.
  const foehnLeeRightHalf = highEnd === cols[0]; // Berg links → Lee rechts

  // US-B1/B2 — Kaltluftsee-Volumen + Tal/Gipfel-Markierung als Chart-Overlay.
  const inv = section.inversion;
  function chartOverlay(geo: SectionGeo): React.ReactNode {
    return <>{foehnZone(geo)}{inversionZone(geo)}</>;
  }
  // US-D1 — Föhn-Durchgriffszone (Lee-Seite, über Grund).
  function foehnZone(geo: SectionGeo): React.ReactNode {
    if (!layers.foehn || !foehn.present) return null;
    const halfX = geo.plot.left + geo.plot.width / 2;
    const zx = foehnLeeRightHalf ? halfX : geo.plot.left;
    const zw = geo.plot.width / 2;
    return (
      <g>
        <rect x={zx} y={geo.plot.top} width={zw} height={geo.plot.height} fill="#D4A373" opacity={0.16} />
        <g transform={`translate(${zx + zw / 2}, ${geo.plot.top + 14})`}>
          <rect x={-52} y={-11} width={104} height={16} rx={8} fill="#C97B47" />
          <text y={1} textAnchor="middle" className="td-inv-badge">FÖHNFENSTER</text>
        </g>
      </g>
    );
  }
  function inversionZone(geo: SectionGeo): React.ReactNode {
    if (!layers.inversion || !inv.present || inv.heightM == null) return null;
    const yTop = geo.y(inv.heightM), yBot = geo.y(0);
    const cx = geo.plot.left + geo.plot.width / 2;
    const peakBadge = (p: typeof section.summit) => (
      <g transform={`translate(${geo.x(p.distanceM)}, ${geo.y(p.terrainM)})`}>
        <circle r={5} fill={p.relation === 'above' ? '#D4A373' : '#6B8198'} stroke="#FAF6EA" strokeWidth={1.5} />
        <g transform="translate(0,-10)">
          <rect x={-52} y={-13} width={104} height={15} rx={7} fill={p.relation === 'above' ? '#D4A373' : '#6B8198'} />
          <text y={-2} textAnchor="middle" className="td-inv-badge">{p.relation === 'above' ? '☀ über Inversion' : 'im Kaltluftsee'}</text>
        </g>
      </g>
    );
    return (
      <g>
        {/* Kaltluft bis Inversionshöhe (Gelände überdeckt den Teil darunter) */}
        <rect x={geo.plot.left} y={yTop} width={geo.plot.width} height={yBot - yTop} fill="#6B8198" opacity={0.3} />
        <line x1={geo.plot.left} y1={yTop} x2={geo.plot.left + geo.plot.width} y2={yTop} stroke="#FAF6EA" strokeWidth={2} opacity={0.85} />
        <line x1={geo.plot.left} y1={yTop} x2={geo.plot.left + geo.plot.width} y2={yTop} stroke="#3A6FA8" strokeWidth={1} strokeDasharray="6 4" />
        <g transform={`translate(${cx}, ${yTop})`}>
          <rect x={-78} y={-18} width={156} height={16} rx={8} fill="#3A6FA8" />
          <text y={-6} textAnchor="middle" className="td-inv-badge">Inversion {Math.round(inv.heightM).toLocaleString('de-DE')} m ü. NN</text>
        </g>
        {peakBadge(section.summit)}
        {section.valley.terrainM < inv.heightM && peakBadge(section.valley)}
      </g>
    );
  }

  return (
    <div className="td-section">
      {/* Layer-Toggles */}
      <div className="td-layers">
        {LAYER_DEFS.map((l) => (
          <button key={l.key} type="button" className={`td-layer-chip${layers[l.key] ? ' is-on' : ''}`} onClick={() => toggle(l.key)} aria-pressed={layers[l.key]}>
            <span className="td-layer-dot" /> {l.label}
          </button>
        ))}
        <button type="button" className={`td-layer-chip td-gng-chip${showGng ? ' is-on' : ''}`} onClick={() => setShowGng((s) => !s)} aria-pressed={showGng}>
          ⚑ Go/No-Go
        </button>
      </div>

      {/* Datenstand (US-N6) */}
      <p className="td-runstamp">Datenstand: ICON-D2 + DEM · abgerufen {new Date(prepared.runAtMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</p>

      {/* Go/No-Go (US-E) */}
      {showGng && <GoNoGoPanel prepared={prepared} locationName={locationName} timeMs={timeMs} />}

      {/* Schnitt */}
      <div className="rt-card td-chart-card">
        <SectionChart section={section} layers={layers} picked={picked} onPick={setPicked} overlay={chartOverlay} portrait={portrait} />
        {/* Legende (US-F3 / US-N5) */}
        <div className="td-legend">
          <div className="td-legend-row">
            <span className="td-legend-title">Windgeschwindigkeit km/h · Höhe = m ü. NN</span>
          </div>
          <div className="td-legend-bands">
            {BAND_COLORS.map((c, i) => (
              <span key={i} className="td-legend-band"><i style={{ background: c }} /> {BAND_LABELS[i]}</span>
            ))}
          </div>
          <div className="td-legend-row td-legend-marks">
            <span><svg width="20" height="8"><line x1="1" y1="4" x2="15" y2="4" stroke="#2C2A26" strokeWidth="1.6" /></svg> Mittelwind</span>
            <span><svg width="20" height="8"><line x1="1" y1="4" x2="15" y2="4" stroke="#D7263D" strokeWidth="1.6" strokeDasharray="4 3" /></svg> Böen</span>
            <span><svg width="20" height="8"><line x1="1" y1="4" x2="15" y2="4" stroke="#8B9AAB" strokeWidth="1.4" strokeDasharray="4 3" /></svg> Wolkenbasis</span>
            {layers.cloudLayers && <span><i className="td-cloud-swatch" /> Wolkenschichten (tief/mittel/hoch)</span>}
            {layers.shear && <span><i className="td-shear-swatch" /> Shear &gt; {SHEAR_THRESHOLD_KMH_PER_300M} km/h/300 m</span>}
          </div>
        </div>
      </div>

      {/* Inversion (US-B1/B2/B4/B5) */}
      {layers.inversion && (
        <div className={`rt-card td-inv${inv.present ? '' : ' is-none'}`}>
          <span className="td-inv-title">Inversion · Kaltluftsee</span>
          {inv.present ? (
            <>
              <div className="td-inv-grid">
                <div className="td-inv-row"><span>oberhalb der Inversion</span><strong className="is-warm">{fmtTemp(inv.aboveTempC)}</strong></div>
                <div className="td-inv-row"><span>im Tal</span><strong className="is-cold">{fmtTemp(inv.valleyTempC)}</strong></div>
                <div className="td-inv-row td-inv-diff"><span>{(inv.diffK ?? 0) > 0 ? 'Aufstieg lohnt sich' : 'Differenz'}</span><strong>+{Math.round(inv.diffK ?? 0)} K</strong></div>
              </div>
              <p className="td-inv-note">{inv.note} Zeit-Slider bewegen, um die Entwicklung der Inversionshöhe über den Tag zu sehen.</p>
              {inv.stable && (
                <p className="td-inv-warn">⚠ Stabile Inversion: Feinstaub reichert sich im Tal an, Frostgefahr in den Morgenstunden. <em>Hinweis nicht verbindlich.</em></p>
              )}
            </>
          ) : (
            <p className="td-inv-none-text">Keine Inversion prognostiziert — durchmischte, bewölkte oder windige Luft. Tal und Höhe folgen dem normalen Temperaturgradienten.</p>
          )}
        </div>
      )}

      {/* Föhn + Talwind (US-D1/D3) */}
      {layers.foehn && (
        <div className={`rt-card td-inv${foehn.present ? '' : ' is-none'}`}>
          <span className="td-inv-title">Föhn &amp; Talwind</span>
          {foehn.present ? (
            <p className="td-foehn-on">⚠ <strong>Föhn-Durchgriff</strong> (Score {Math.round(foehn.score * 100)}%): {foehn.reasons.join(' · ')}. Auf der Lee-Seite kräftiger, böiger Wind — Start-/Flugzonen sorgfältig wählen.</p>
          ) : (
            <p className="td-inv-none-text">Kein Föhn-Durchgriff prognostiziert (kein kräftiger, trockener Südwind im Alpenraum).</p>
          )}
          <p className="td-foehn-talwind">
            <strong>Talwind:</strong>{' '}
            {talwind.length === 0
              ? 'keine eindeutige Umkehr im Prognosezeitraum.'
              : talwind.slice(0, 4).map((r) => `${fmtClock(r.tMs)} ${r.toUpValley ? 'auf Bergwind (anabatisch)' : 'auf Talwind (katabatisch)'}`).join(' · ')}
          </p>
        </div>
      )}

      {/* Punkt-Abfrage (US-F4) */}
      <div className="rt-card td-pick">
        <span className="td-pick-title">{picked ? `Punkt-Abfrage · ${comma(Math.round(picked.distanceM / 100) / 10)} km` : 'Punkt-Abfrage'}</span>
        {picked ? (
          <div className="td-pick-grid">
            <PickRow label="Höhe" value={`${comma(Math.round(picked.levelM))} m ü. NN`} />
            <PickRow label="über Grund" value={`${comma(Math.round(picked.agl))} m AGL`} />
            <PickRow label="Mittelwind" value={`${Math.round(picked.windKmh)} km/h · ${dirName(picked.windDirDeg)}`} accent />
            <PickRow label="Böe" value={`${Math.round(picked.gustKmh)} km/h`} alert />
            <PickRow label="Temperatur" value={`${picked.tempC.toFixed(1).replace('.', ',')} °C`} />
          </div>
        ) : (
          <p className="td-pick-hint">In den Schnitt klicken, um exakte Werte für Höhe, Wind, Böe und Temperatur zu sehen.</p>
        )}
      </div>

      {/* Kennzahlen */}
      <div className="rt-card td-summary">
        <div className="td-summary-grid">
          <Stat label="Gelände" value={`${comma(Math.round(section.terrainMinM))}–${comma(Math.round(section.terrainMaxM))} m`} />
          <Stat label="Max. Wind" value={`${Math.round(section.maxWindKmh)} km/h`} accent />
          <Stat label="Max. Böe" value={`${Math.round(section.maxGustKmh)} km/h`} />
          <Stat label="Inversion" value={section.inversion.present ? `${comma(Math.round(section.inversion.heightM ?? 0))} m` : 'keine'} />
        </div>
      </div>

      {/* Unsicherheitshinweis (US-N7) */}
      <p className="td-uncertainty">
        <span className="td-uncertainty-mark">ⓘ</span>
        Höhenwind aus 10-m-Wind + Standard-Profil auf AGL hochgerechnet (Grenzschicht-gesättigt), nicht aus echten Druckflächen.
        Gitterzellen ≈ 2 km — die Auflösung begrenzt die Genauigkeit; keine Scheingenauigkeit über die Modellauflösung hinaus.
      </p>

      {/* Zeit-Slider + Animation (US-A5) mit JETZT-Marker */}
      <div className="rt-card td-time">
        <button type="button" className="td-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Abspielen'} title={playing ? 'Pause' : 'Abspielen'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="td-time-track">
          {nowPct != null && (
            <span className="td-now-tick" style={{ left: `${nowPct}%` }} aria-hidden="true">
              <span className="td-now-tick-label">JETZT</span>
            </span>
          )}
          <input type="range" min={prepared.startMs} max={prepared.endMs} step={STEP_MS} value={timeMs}
            onChange={(e) => { setPlaying(false); onTime(Number(e.target.value)); }} aria-label="Zeitpunkt" className="td-time-range" />
        </div>
        <span className="td-time-label">{clock}<em className="td-time-rel">{relTimeLabel(timeMs - realNow)}</em></span>
      </div>
    </div>
  );
}

function PickRow({ label, value, accent, alert }: { label: string; value: string; accent?: boolean; alert?: boolean }) {
  return (
    <div className="td-pick-row">
      <span className="td-pick-label">{label}</span>
      <span className={`td-pick-value${accent ? ' is-accent' : ''}${alert ? ' is-alert' : ''}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="td-stat">
      <span className="td-stat-label">{label}</span>
      <span className={`td-stat-value${accent ? ' is-accent' : ''}`}>{value}</span>
    </div>
  );
}
