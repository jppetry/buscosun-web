/**
 * Atmosphäre · Föhn-Querschnitt (6b, 2D-Isentropen).
 *
 * Legt automatisch einen N–S-Schnitt (cross-crest) um den Marker, bereitet ihn
 * über die BESTEHENDE Pipeline auf (prepareCrossSection: DEM + Anker-Forecast)
 * und zeichnet die Isentropen (θ = const) als SVG. Sinkende Linien im Lee zeigen
 * das Föhn-Absinken. Der Schnittzeitpunkt folgt dem globalen Time-Scrubber.
 *
 * 2D-Fallback statt 3D-WebGL-Curtain (Entscheidungs-Gate P6b): ehrlich, getestet,
 * ohne Duplikat des bestehenden threed/CurtainLayer.
 */

import { useEffect, useRef, useState } from 'react';
import { useAtmosphere } from './atmosphereStore';
import { prepareCrossSection, sectionAtTime, type PreparedSection } from '../threed/buildCrossSection';
import { buildIsentropes } from './isentropes';
import type { CrossSection } from '../threed/crossSection';

const DEBOUNCE_MS = 600;
const HALF_DEG = 0.063; // ~7 km nach N und S (cross-crest)
const W = 440, H = 240, PAD_L = 8, PAD_R = 40, PAD_T = 12, PAD_B = 22;

export default function FoehnCrossSection() {
  const { marker, hour } = useAtmosphere();
  const preparedRef = useRef<PreparedSection | null>(null);
  const [section, setSection] = useState<CrossSection | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const acRef = useRef<AbortController | null>(null);

  const lat = marker?.lat ?? null;
  const lon = marker?.lon ?? null;
  const markerKey = `${lat?.toFixed(4)},${lon?.toFixed(4)}`;

  // Marker-Wechsel → Schnitt neu vorbereiten (debounced, abbrechbar).
  useEffect(() => {
    if (lat == null || lon == null) { setState('idle'); preparedRef.current = null; setSection(null); return; }
    setState('loading');
    const timer = window.setTimeout(() => {
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      const points = [{ lat: lat - HALF_DEG, lon }, { lat, lon }, { lat: lat + HALF_DEG, lon }];
      prepareCrossSection(points, ac.signal)
        .then((prepared) => {
          if (ac.signal.aborted) return;
          preparedRef.current = prepared;
          setState('ready');
          applyTime(prepared);
        })
        .catch((err) => { if (!ac.signal.aborted && (err as Error)?.name !== 'AbortError') setState('error'); });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey]);

  // Scrubber-Stunde → Schnittzeitpunkt (kein Refetch, nur Zeit-Slice).
  useEffect(() => {
    if (preparedRef.current) applyTime(preparedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hour]);

  useEffect(() => () => acRef.current?.abort(), []);

  function applyTime(prepared: PreparedSection) {
    const target = Math.min(prepared.endMs, Math.max(prepared.startMs, Date.now() + hour * 3_600_000));
    setSection(sectionAtTime(prepared, target));
  }

  if (state === 'loading' && !section) {
    return <div className="rt-card atm-xsec atm-xsec-state"><span className="ev-spinner" /> Föhn-Schnitt wird gerechnet …</div>;
  }
  if (state === 'error') return <div className="rt-card atm-xsec atm-xsec-state">⚠ Föhn-Schnitt nicht verfügbar.</div>;
  if (!section) return null;

  const lines = buildIsentropes(section, 9);
  const cols = section.columns;
  const maxDist = cols[cols.length - 1].distanceM || 1;
  const yMin = section.terrainMinM, yMax = section.topM;
  const xOf = (d: number) => PAD_L + (d / maxDist) * (W - PAD_L - PAD_R);
  const yOf = (h: number) => (H - PAD_B) - ((h - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);
  const path = (pts: Array<{ distanceM: number; heightM: number }>) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.distanceM).toFixed(1)} ${yOf(p.heightM).toFixed(1)}`).join(' ');
  const terrainPath = `M ${xOf(0)} ${yOf(yMin)} ` +
    cols.map((c) => `L ${xOf(c.distanceM).toFixed(1)} ${yOf(c.terrainM).toFixed(1)}`).join(' ') +
    ` L ${xOf(maxDist)} ${yOf(yMin)} Z`;

  return (
    <div className="rt-card atm-xsec">
      <div className="atm-xsec-head"><span className="rt-eyebrow">Föhn-Querschnitt (N → S)</span></div>
      <svg className="atm-xsec-svg" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label="Isentropen-Querschnitt Nord–Süd: sinkende Linien im Lee zeigen Föhn-Absinken">
        <rect x={PAD_L} y={PAD_T} width={W - PAD_L - PAD_R} height={H - PAD_T - PAD_B} fill="#fff" stroke="var(--sand-200, #E0D6BE)" />
        {lines.map((l, i) => (
          <g key={i}>
            <path d={path(l.points)} fill="none" stroke="var(--steel-600, #3A6FA8)" strokeWidth={1.3} opacity={0.8} />
            <text x={xOf(l.points[l.points.length - 1].distanceM) + 2} y={yOf(l.points[l.points.length - 1].heightM) + 3}
              className="atm-xsec-lbl">{Math.round(l.thetaK)}</text>
          </g>
        ))}
        <path d={terrainPath} fill="var(--sand-300, #D9CEB0)" stroke="var(--stone-500, #8B7355)" strokeWidth={1} />
        <text x={PAD_L + 2} y={H - 6} className="atm-xsec-ax">Nord</text>
        <text x={W - PAD_R - 2} y={H - 6} className="atm-xsec-ax" textAnchor="end">Süd</text>
        <text x={W - PAD_R + 2} y={PAD_T + 8} className="atm-xsec-ax">θ/K</text>
      </svg>
      <p className="atm-xsec-cap">
        θ-Isentropen aus dem abgeleiteten Schnitt (Oberfläche + DEM) · sinkende Linien im Lee = Föhn-Absinken ·
        folgt dem Scrubber · Richtwert, kein echtes Druckflächen-Feld.
      </p>
    </div>
  );
}
