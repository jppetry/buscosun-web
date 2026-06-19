/**
 * 3D-Globus · Seite (nullschool-Erlebnis, LIVE GFS).
 *
 * Vollbild-Erdkugel mit geschwindigkeitsgefärbten Wind-Partikeln und
 * umschaltbarem Overlay (Temperatur / Wind / Feuchte / Druck) auf wählbarer Höhe
 * (Boden / 850 / 500 / 250 hPa). Vorlaufstunden-Navigation + Animation. Klick auf
 * die Kugel pinnt einen Ort (Readout aktualisiert sich mit Zeit/Höhe). Der
 * gesamte Zustand steht im Permalink (`#g=`).
 */

import { useEffect, useRef, useState } from 'react';
import GlobeMap, { type PickInfo, type Projection, type RunInfo } from './GlobeMap';
import type { Height, OverlayKind } from './gfs';
import { prefetch } from './gfsClient';
import './globe.css';

const COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
const dirName = (deg: number) => COMPASS[Math.round((deg % 360) / 45) % 8];
const fmtCoord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;

// Vorlauf: 3-stündliche GFS-Frames bis +120 h (fein genug für flüssige Animation).
const FH_STEP = 3, FH_MAX = 120;
function fhLabel(h: number): string { return h === 0 ? 'jetzt' : h % 24 === 0 ? `+${h / 24} T` : `+${h} h`; }
const OVERLAYS: Array<{ k: OverlayKind; label: string }> = [
  { k: 'temp', label: 'Temp' }, { k: 'wind', label: 'Wind' }, { k: 'rh', label: 'Feuchte' }, { k: 'mslp', label: 'Druck' }, { k: 'none', label: 'Keins' },
];
const HEIGHTS: Array<{ k: Height; label: string }> = [
  { k: 'sfc', label: 'Boden' }, { k: '850', label: '850' }, { k: '500', label: '500' }, { k: '250', label: '250' },
];

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function fmtValid(ms: number): string {
  const d = new Date(ms);
  return `${WD[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}. ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`;
}
function fmtRun(r: RunInfo): string { return `GFS-Lauf ${r.run.date.slice(6, 8)}.${r.run.date.slice(4, 6)}. ${r.run.hour} UTC`; }

// Legenden-Konfiguration je Overlay.
interface Legend { title: string; stops: Array<{ v: number; rgb: string }>; ticks: number[]; fmt?: (t: number) => string; }
const LEGENDS: Partial<Record<OverlayKind, Legend>> = {
  temp: { title: 'Temperatur · °C', ticks: [-40, -20, 0, 20, 40], fmt: (t) => (t > 0 ? `+${t}` : `${t}`), stops: [
    { v: -50, rgb: '40,55,118' }, { v: -30, rgb: '48,108,172' }, { v: -10, rgb: '80,164,178' }, { v: 6, rgb: '118,182,122' }, { v: 22, rgb: '196,174,72' }, { v: 34, rgb: '196,92,54' }, { v: 50, rgb: '128,26,36' } ] },
  wind: { title: 'Windgeschwindigkeit · m/s', ticks: [0, 10, 20, 40, 60], stops: [
    { v: 0, rgb: '42,48,74' }, { v: 6, rgb: '44,142,120' }, { v: 15, rgb: '184,200,72' }, { v: 28, rgb: '236,112,56' }, { v: 50, rgb: '184,60,134' }, { v: 70, rgb: '222,162,220' } ] },
  rh: { title: 'Rel. Feuchte · %', ticks: [0, 40, 70, 100], stops: [
    { v: 0, rgb: '120,96,64' }, { v: 45, rgb: '150,160,100' }, { v: 78, rgb: '70,144,152' }, { v: 100, rgb: '60,70,150' } ] },
  mslp: { title: 'Luftdruck (NN) · hPa', ticks: [970, 1000, 1013, 1030], stops: [
    { v: 955, rgb: '78,42,120' }, { v: 1000, rgb: '90,150,168' }, { v: 1013, rgb: '150,168,140' }, { v: 1024, rgb: '206,176,92' }, { v: 1060, rgb: '150,56,52' } ] },
};
function gradient(stops: { v: number; rgb: string }[]) {
  const min = stops[0].v, max = stops[stops.length - 1].v;
  return `linear-gradient(to right, ${stops.map((s) => `rgb(${s.rgb}) ${Math.round(((s.v - min) / (max - min)) * 100)}%`).join(', ')})`;
}
const tickPos = (t: number, stops: { v: number }[]) => ((t - stops[0].v) / (stops[stops.length - 1].v - stops[0].v)) * 100;

interface Props { onBack: () => void }

// --- Permalink (#g=) --------------------------------------------------------
interface GState { ov: OverlayKind; ht: Height; fh: number; pj: Projection; pa: boolean; hd: boolean; c?: [number, number]; z?: number; pin?: [number, number]; }
function parseHash(): Partial<GState> | null {
  const m = location.hash.match(/[#&]g=([^&]+)/);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(m[1])); } catch { return null; }
}
const initial = parseHash();

export default function GlobePage({ onBack }: Props) {
  const [overlay, setOverlay] = useState<OverlayKind>(initial?.ov ?? 'temp');
  const [height, setHeight] = useState<Height>(initial?.ht ?? 'sfc');
  const [projection, setProjection] = useState<Projection>(initial?.pj ?? 'globe');
  const [showParticles, setShowParticles] = useState(initial?.pa ?? true);
  const [hd, setHd] = useState(initial?.hd ?? false);
  const [spinning, setSpinning] = useState(false);
  const [fhour, setFhour] = useState(initial?.fh ?? 0);
  const [hover, setHover] = useState<PickInfo | null>(null);
  const [pin, setPin] = useState<PickInfo | null>(initial?.pin ? { lat: initial.pin[1], lng: initial.pin[0], tempC: null, wind: null } : null);
  const [runInfo, setRunInfo] = useState<RunInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const viewRef = useRef<{ center: [number, number]; zoom: number } | null>(initial?.c ? { center: initial.c, zoom: initial.z ?? 2.2 } : null);

  const readout = pin ?? hover;
  const legend = overlay !== 'none' ? LEGENDS[overlay] : undefined;

  // Permalink synchronisieren.
  useEffect(() => {
    const s: GState = { ov: overlay, ht: height, fh: fhour, pj: projection, pa: showParticles, hd };
    if (viewRef.current) { s.c = viewRef.current.center; s.z = viewRef.current.zoom; }
    if (pin) s.pin = [+pin.lng.toFixed(2), +pin.lat.toFixed(2)];
    history.replaceState(null, '', `${location.pathname}#g=${encodeURIComponent(JSON.stringify(s))}`);
  }, [overlay, height, fhour, projection, showParticles, hd, pin]);

  // Animation: alle ~0,65 s einen 3-h-Frame weiter (zyklisch 0 → +120 h → 0).
  useEffect(() => {
    if (!playing) return;
    const iv = window.setInterval(() => {
      setFhour((cur) => (cur + FH_STEP > FH_MAX ? 0 : cur + FH_STEP));
    }, 650);
    return () => window.clearInterval(iv);
  }, [playing]);

  // Frame-Preload: die nächsten Frames in den Worker-Cache laden, damit das
  // Abspielen (und Scrubben) flüssig aus dem Cache rendert statt zu fetchen.
  useEffect(() => {
    const run = runInfo?.run;
    if (!run) return;
    const sel = { height, overlay };
    for (const ahead of [FH_STEP, FH_STEP * 2, FH_STEP * 3]) {
      const next = fhour + ahead > FH_MAX ? (fhour + ahead) - FH_MAX - FH_STEP : fhour + ahead;
      if (next >= 0 && next <= FH_MAX) prefetch(run, next, sel);
    }
  }, [fhour, overlay, height, runInfo]);

  return (
    <div className="gl-page">
      <GlobeMap
        overlay={overlay} height={height} projection={projection} showParticles={showParticles}
        hd={hd} spinning={spinning} fhour={fhour} pinActive={pin !== null}
        initialView={viewRef.current ?? undefined}
        initialPin={initial?.pin ? { lat: initial.pin[1], lng: initial.pin[0] } : undefined}
        onHover={setHover} onPin={setPin} onRunInfo={setRunInfo}
        onLoading={setLoading} onError={setError}
        onView={(v) => { viewRef.current = v; }}
      />
      {loading && <div className="gl-loading"><span className="gl-spinner" /> GFS-Daten werden geladen …</div>}
      {error && <div className="gl-error">⚠ {error}</div>}

      <header className="gl-top">
        <button type="button" className="gl-back" onClick={onBack} aria-label="Zurück">‹ Start</button>
        <span className="gl-brand"><span className="gl-brand-mark" /> buscosun · Erde</span>
        <button type="button" className={`gl-iconbtn${spinning ? ' is-on' : ''}`} aria-pressed={spinning} title="Auto-Rotation" onClick={() => setSpinning((v) => !v)}>{spinning ? '❚❚' : '▶'}</button>
      </header>

      <section className="gl-panel" aria-label="Globus-Steuerung">
        <div className="gl-panel-title">Globale Wetter-Visualisierung · Live</div>

        <div className="gl-row">
          <span className="gl-row-key">Overlay</span>
          <div className="gl-seg">
            {OVERLAYS.map((o) => (
              <button key={o.k} type="button" className={`gl-link${overlay === o.k ? ' is-active' : ''}`} onClick={() => setOverlay(o.k)}>{o.label}</button>
            ))}
          </div>
        </div>

        <div className="gl-row">
          <span className="gl-row-key">Höhe</span>
          <div className="gl-seg">
            {HEIGHTS.map((hh) => (
              <button key={hh.k} type="button" className={`gl-link${height === hh.k ? ' is-active' : ''}`} onClick={() => setHeight(hh.k)} title={hh.k === 'sfc' ? 'Bodennah (10 m Wind / 2 m Temp)' : `${hh.k} hPa`}>{hh.label}</button>
            ))}
          </div>
        </div>

        <div className="gl-row">
          <span className="gl-row-key">Partikel</span>
          <div className="gl-seg">
            <button type="button" className={`gl-link${showParticles ? ' is-active' : ''}`} onClick={() => setShowParticles((v) => !v)}>{showParticles ? 'An' : 'Aus'}</button>
            <button type="button" className={`gl-link${hd ? ' is-active' : ''}`} onClick={() => setHd((v) => !v)} disabled={!showParticles}>HD</button>
          </div>
        </div>

        <div className="gl-row">
          <span className="gl-row-key">Projektion</span>
          <div className="gl-seg">
            {(['globe', 'flat'] as Projection[]).map((p) => (
              <button key={p} type="button" className={`gl-link${projection === p ? ' is-active' : ''}`} onClick={() => setProjection(p)}>{p === 'globe' ? 'Globus' : 'Flach'}</button>
            ))}
          </div>
        </div>

        <div className="gl-row gl-row-time">
          <span className="gl-row-key">Vorlauf</span>
          <button type="button" className={`gl-link gl-play${playing ? ' is-active' : ''}`} onClick={() => setPlaying((v) => !v)} title="Animation abspielen/pausieren">{playing ? '❚❚' : '▶'}</button>
          <input type="range" className="gl-slider" min={0} max={FH_MAX} step={FH_STEP} value={fhour}
            onChange={(e) => { setPlaying(false); setFhour(+e.target.value); }} aria-label="Vorlaufstunde" />
          <span className="gl-fhlabel">{fhLabel(fhour)}</span>
        </div>
        {runInfo && <div className="gl-validtime">Gültig: <strong>{fmtValid(runInfo.validMs)}</strong></div>}

        <div className="gl-panel-sep" />

        <div className="gl-readout">
          {readout ? (
            <>
              <div className="gl-readout-head">
                <span className="gl-readout-loc">{fmtCoord(readout.lat, 'N', 'S')}, {fmtCoord(readout.lng, 'O', 'W')}</span>
                {pin && <button type="button" className="gl-readout-clear" onClick={() => setPin(null)} aria-label="Pin entfernen">×</button>}
              </div>
              <div className="gl-readout-rows">
                <div className="gl-readout-row"><span className="gl-dot gl-dot-temp" /> {readout.tempC != null ? `${Math.round(readout.tempC)} °C` : '—'}</div>
                <div className="gl-readout-row"><span className="gl-dot gl-dot-wind" /> {readout.wind ? `${Math.round(readout.wind.speedMs * 3.6)} km/h · ${dirName(readout.wind.dirFromDeg)} (${Math.round(readout.wind.speedMs)} m/s)` : '—'}</div>
              </div>
            </>
          ) : (
            <div className="gl-readout-hint">Auf die Kugel klicken, um einen Ort zu pinnen.</div>
          )}
        </div>

        {legend && (
          <div className="gl-legend">
            <span className="gl-legend-title">{legend.title}{height !== 'sfc' && overlay !== 'mslp' ? ` · ${height} hPa` : ''}</span>
            <div className="gl-legend-bar" style={{ background: gradient(legend.stops) }}>
              {legend.ticks.map((t) => (
                <span key={t} className="gl-legend-tick" style={{ left: `${tickPos(t, legend.stops)}%` }}>{legend.fmt ? legend.fmt(t) : t}</span>
              ))}
            </div>
          </div>
        )}

        <div className="gl-panel-foot">
          <span className="gl-attr-mark">ⓘ</span> Live {runInfo ? fmtRun(runInfo) : 'NOAA GFS'} (1°, global, Public Domain) · clientseitig dekodiert (Worker) · Umriss Natural Earth.
        </div>
      </section>
    </div>
  );
}
