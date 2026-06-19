/**
 * 3D-Wetter · Gelände-Ansicht (3. Modus, Container).
 *
 * Vollflächige 3D-Geländekarte mit dem Atmosphären-Vorhang entlang der
 * Schnittlinie (`TerrainMap`), darunter die gewohnten Bedien-/Leseelemente:
 * Layer-Chips (die im Vorhang sinnvollen), Wind-Legende, Datenstand (US-N6),
 * Unsicherheitshinweis (US-N7) und Zeit-Slider mit Animation (US-A5).
 */

import { useEffect, useRef, useState } from 'react';
import type { PreparedSection } from './buildCrossSection';
import type { CrossSection } from './crossSection';
import type { LayerState } from './ThreeDPage';
import type { GeoPoint } from './sectionGeometry';
import TerrainMap from './TerrainMap';
import { BAND_COLORS, BAND_LABELS } from './SectionChart';
import { tempRampRGB } from './crossSection';

interface Props {
  center: GeoPoint;
  points: GeoPoint[];
  onPoints: (p: GeoPoint[]) => void;
  prepared: PreparedSection;
  section: CrossSection;
  timeMs: number;
  onTime: (ms: number) => void;
  layers: LayerState;
  onLayers: (l: LayerState) => void;
}

// Nur die Layer, die der Vorhang tatsächlich darstellt.
const CURTAIN_LAYERS: Array<{ key: keyof LayerState; label: string }> = [
  { key: 'mean', label: 'Mittelwind' },
  { key: 'gust', label: 'Böen' },
  { key: 'temp', label: 'Temperatur' },
  { key: 'streamlines', label: 'Windlinien' },
  { key: 'cloudLayers', label: 'Wolkenschichten' },
];

// Temperatur-Legende (repräsentative Stützstellen der Rampe).
const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const TEMP_BAND_COLORS = [-10, 0, 8, 18, 28].map((t) => rgb(tempRampRGB(t)));
const TEMP_BAND_LABELS = ['≤ -10°', '0°', '+8°', '+18°', '≥ +28°'];

const STEP_MS = 15 * 60_000;

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

export default function TerrainView({ center, points, onPoints, prepared, section, timeMs, onTime, layers, onLayers }: Props) {
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(timeMs);
  timeRef.current = timeMs;
  const toggle = (k: keyof LayerState) => onLayers({ ...layers, [k]: !layers[k] });
  const clock = new Date(timeMs).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const realNow = Date.now();
  const timeSpan = prepared.endMs - prepared.startMs;
  const nowPct = realNow >= prepared.startMs && realNow <= prepared.endMs && timeSpan > 0 ? ((realNow - prepared.startMs) / timeSpan) * 100 : null;
  const ro = sectionReadout(section);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const next = timeRef.current + STEP_MS;
      onTime(next > prepared.endMs ? prepared.startMs : next);
    }, 650);
    return () => window.clearInterval(id);
  }, [playing, prepared.startMs, prepared.endMs, onTime]);

  return (
    <div className="td-section td-terrain">
      {/* Layer-Toggles (nur vorhang-relevant) */}
      <div className="td-layers">
        {CURTAIN_LAYERS.map((l) => (
          <button key={l.key} type="button" className={`td-layer-chip${layers[l.key] ? ' is-on' : ''}`} onClick={() => toggle(l.key)} aria-pressed={layers[l.key]}>
            <span className="td-layer-dot" /> {l.label}
          </button>
        ))}
      </div>

      <p className="td-runstamp">Datenstand: ICON-D2 + DEM · abgerufen {new Date(prepared.runAtMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr · Relief © AWS Terrain Tiles</p>

      {/* Geländekarte mit Vorhang */}
      <div className="rt-card td-terrain-card">
        <TerrainMap center={center} points={points} section={section} layers={layers} onChange={onPoints} />
        <div className="td-terrain-foot">
          <span>Karte mit der Maus drehen/neigen · Wand zeigt den Wetterschnitt entlang der Linie</span>
          {points.length > 0 && <button type="button" className="td-clear" onClick={() => onPoints([])}>Linie zurücksetzen</button>}
        </div>
        {/* Legende: Temperatur, wenn aktiv — sonst Wind (US-F3 / US-N5) */}
        <div className="td-legend">
          <div className="td-legend-row">
            <span className="td-legend-title">{layers.temp ? 'Temperatur °C (Vorhang-Farbe)' : 'Windgeschwindigkeit km/h (Vorhang-Farbe)'}</span>
          </div>
          <div className="td-legend-bands">
            {(layers.temp ? TEMP_BAND_COLORS : BAND_COLORS).map((c, i) => (
              <span key={i} className="td-legend-band"><i style={{ background: c }} /> {(layers.temp ? TEMP_BAND_LABELS : BAND_LABELS)[i]}</span>
            ))}
          </div>
          {layers.streamlines && (
            <div className="td-legend-row td-legend-marks">
              <span><svg width="22" height="8"><line x1="1" y1="4" x2="17" y2="4" stroke="#23364d" strokeWidth="1.8" /></svg> Windlinien (Strömung entlang des Schnitts)</span>
            </div>
          )}
        </div>
      </div>

      {/* Aus dem Schnitt ablesen — Kennzahlen (crisp, ohne Perspektiv-Verzerrung) */}
      <div className="rt-card td-summary">
        <span className="rt-eyebrow td-eyebrow">Aus dem Schnitt ablesen</span>
        <div className="td-summary-grid">
          <div className="td-stat">
            <span className="td-stat-label">Inversion</span>
            <span className={`td-stat-value${ro.inv.present ? ' is-accent' : ''}`}>{ro.inv.present ? `~${ro.inv.heightM} m` : '—'}</span>
            <span className="td-summary-time">{ro.inv.present ? `+${ro.inv.diffK} K wärmer oben · ${ro.inv.stable ? 'stabil' : 'labil'}` : 'keine prognostiziert'}</span>
          </div>
          <div className="td-stat">
            <span className="td-stat-label">Stärkster Höhenwind</span>
            <span className="td-stat-value">{ro.maxWind} km/h</span>
            <span className="td-summary-time">auf ~{ro.maxWindAlt.toLocaleString('de-DE')} m</span>
          </div>
          <div className="td-stat">
            <span className="td-stat-label">Tal → Gipfel</span>
            <span className="td-stat-value">{ro.valleyM.toLocaleString('de-DE')}–{ro.summitM.toLocaleString('de-DE')} m</span>
            <span className="td-summary-time">{ro.reliefM.toLocaleString('de-DE')} m Relief</span>
          </div>
          <div className="td-stat">
            <span className="td-stat-label">Wolkenbasis</span>
            <span className="td-stat-value">{ro.cloudBaseM != null ? `~${ro.cloudBaseM.toLocaleString('de-DE')} m` : 'frei'}</span>
            <span className="td-summary-time">{ro.cloudBaseM != null ? 'mittlere Untergrenze' : 'keine nennenswerte Bewölkung'}</span>
          </div>
        </div>
      </div>

      {/* Unsicherheitshinweis (US-N7) */}
      <p className="td-uncertainty">
        <span className="td-uncertainty-mark">ⓘ</span>
        Der Vorhang ist der vertikale Wetterschnitt entlang deiner Linie, auf echtes Relief gestellt. Höhenwind aus 10-m-Wind + Standard-Profil
        (Grenzschicht-gesättigt) abgeleitet, nicht aus echten Druckflächen; Geländeüberhöhung {EXAG_LABEL}× zur besseren Sicht.
      </p>

      {/* Zeit-Slider + Animation (US-A5) */}
      <div className="rt-card td-time">
        <button type="button" className="td-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Abspielen'} title={playing ? 'Pause' : 'Abspielen'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="td-time-track">
          {nowPct != null && (
            <span className="td-now-tick" style={{ left: `${nowPct}%` }} aria-hidden="true"><span className="td-now-tick-label">JETZT</span></span>
          )}
          <input type="range" min={prepared.startMs} max={prepared.endMs} step={STEP_MS} value={timeMs}
            onChange={(e) => { setPlaying(false); onTime(Number(e.target.value)); }} aria-label="Zeitpunkt" className="td-time-range" />
        </div>
        <span className="td-time-label">{clock}<em className="td-time-rel">{relTimeLabel(timeMs - realNow)}</em></span>
      </div>
    </div>
  );
}

const EXAG_LABEL = '1,3';

/** Kompakte Kennzahlen aus dem Schnitt für die „ablesen"-Karte. */
function sectionReadout(section: CrossSection) {
  let maxWind = 0, maxWindAlt = 0;
  for (const col of section.columns) for (const cell of col.cells) {
    if (cell.windKmh > maxWind) { maxWind = cell.windKmh; maxWindAlt = cell.levelM; }
  }
  const bases = section.columns.map((c) => c.cloudBaseM).filter((b): b is number => b != null);
  const cloudBaseM = bases.length >= section.columns.length * 0.3
    ? Math.round(bases.reduce((s, b) => s + b, 0) / bases.length / 10) * 10
    : null;
  const inv = section.inversion;
  return {
    inv: {
      present: inv.present,
      heightM: inv.heightM != null ? Math.round(inv.heightM) : null,
      diffK: inv.diffK != null ? Math.round(inv.diffK * 10) / 10 : null,
      stable: inv.stable,
    },
    maxWind: Math.round(maxWind),
    maxWindAlt: Math.round(maxWindAlt / 50) * 50,
    valleyM: Math.round(section.terrainMinM),
    summitM: Math.round(section.terrainMaxM),
    reliefM: Math.round(section.terrainMaxM - section.terrainMinM),
    cloudBaseM,
  };
}
