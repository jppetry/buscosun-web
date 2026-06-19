/**
 * Sounding-Panel (Modal) — Hybrid aus 3D-Atmosphärensäule + echtem Skew-T.
 *
 * Holt das GFS-Druckflächenprofil am Punkt (lazy, mit ehrlichem Lade-Hinweis:
 * der erste Aufruf lädt einen GFS-Lauf-Index + ~45 Range-Felder), berechnet
 * Parcel-Größen (soundingMath) und zeigt links eine perspektivische
 * Atmosphärensäule (T-Farbe + Wind mit Höhe + Marker) und rechts das klassische
 * Skew-T mit CAPE/CIN-Flächen — plus Indizes + Klartext-Einschätzung.
 */

import { useEffect, useRef, useState } from 'react';
import { fetchSoundingAtPoint, type SoundingProfile, ICON_EU_SOUNDING_ATTRIBUTION } from '../sources/iconEuSounding';
import { computeSounding, type SoundingDerived } from './soundingMath';
import { tempColorC } from '../globe/gfs';
import SkewTChart from './SkewTChart';

interface Props {
  lat: number;
  lon: number;
  surfaceM?: number;
  name: string;
  onClose: () => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; profile: SoundingProfile; derived: SoundingDerived };

export default function SoundingPanel({ lat, lon, surfaceM = 0, name, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setState({ kind: 'loading' });
    (async () => {
      try {
        const profile = await fetchSoundingAtPoint(lat, lon, surfaceM, 0, ac.signal);
        if (ac.signal.aborted) return;
        setState({ kind: 'ready', profile, derived: computeSounding(profile) });
      } catch (err) {
        if (ac.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Sounding nicht erreichbar' });
      }
    })();
    return () => ac.abort();
  }, [lat, lon, surfaceM]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="td-snd-backdrop" onClick={onClose}>
      <div
        className="td-snd rt-card" role="dialog" aria-modal="true" aria-label={`Vertikal-Sounding ${name}`}
        tabIndex={-1} ref={dialogRef} onClick={(e) => e.stopPropagation()}
      >
        <div className="td-snd-head">
          <div>
            <span className="rt-eyebrow td-eyebrow">Vertikal-Sounding · Skew-T</span>
            <h3 className="td-snd-title">{name}</h3>
          </div>
          <button type="button" className="td-snd-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        {state.kind === 'loading' && (
          <div className="td-snd-state">
            <span className="ev-spinner" />
            <p>Vertikalprofil wird geladen … <em>der erste Abruf lädt die ICON-EU-Druckflächen (kann ~20 s dauern), danach aus dem Cache sofort.</em></p>
          </div>
        )}
        {state.kind === 'error' && <div className="td-snd-state"><p>⚠ {state.message}</p></div>}

        {state.kind === 'ready' && (
          <>
            <div className="td-snd-body">
              <AtmosphereColumn profile={state.profile} derived={state.derived} />
              <SkewTChart profile={state.profile} derived={state.derived} />
              <Indices profile={state.profile} derived={state.derived} />
            </div>
            <p className="td-snd-source">
              {ICON_EU_SOUNDING_ATTRIBUTION.replace(/<[^>]+>/g, '')} · Lauf {fmtUTC(state.profile.runAt)} · gültig {fmtUTC(state.profile.validAt)} ·
              <strong> Richtwert</strong> (ICON-EU ~7 km, Standard-Druckflächen) — keine Radiosonde.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Perspektivische 3D-Atmosphärensäule: T-Farbverlauf + Wind-Streamer + Marker. */
function AtmosphereColumn({ profile, derived }: { profile: SoundingProfile; derived: SoundingDerived }) {
  const W = 150, H = 520, padT = 16, padB = 30;
  const plotH = H - padT - padB;
  const zMax = Math.max(profile.levels[profile.levels.length - 1].heightM, derived.elM ?? 0, 12000);
  const zMin = profile.surfaceM;
  const yOf = (z: number) => padT + plotH * (1 - (z - zMin) / (zMax - zMin));
  // Schräge Vorderkante (Pseudo-3D) — Säule als Parallelogramm mit Tiefe.
  const colX = 54, colW = 46, depth = 22;
  const ls = profile.levels;

  // Vertikaler Farbverlauf über feine Höhenstützen.
  const tAt = (z: number) => {
    for (let i = 1; i < ls.length; i++) if (z <= ls[i].heightM) {
      const a = ls[i - 1], b = ls[i]; const t = (z - a.heightM) / (b.heightM - a.heightM || 1);
      return a.tempC + (b.tempC - a.tempC) * t;
    }
    return ls[ls.length - 1].tempC;
  };
  const segs: { y0: number; y1: number; fill: string }[] = [];
  const N = 60;
  for (let i = 0; i < N; i++) {
    const z0 = zMin + ((zMax - zMin) * i) / N, z1 = zMin + ((zMax - zMin) * (i + 1)) / N;
    const [r, g, b] = tempColorC(tAt((z0 + z1) / 2));
    segs.push({ y0: yOf(z1), y1: yOf(z0), fill: `rgb(${r | 0},${g | 0},${b | 0})` });
  }

  return (
    <svg className="td-snd-col" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Atmosphärensäule am Punkt">
      {/* Tiefenfläche (rechts) */}
      {segs.map((s, i) => (
        <polygon key={`d${i}`} points={`${colX + colW},${s.y0} ${colX + colW + depth},${s.y0 - depth * 0.5} ${colX + colW + depth},${s.y1 - depth * 0.5} ${colX + colW},${s.y1}`}
          fill={s.fill} opacity={0.5} />
      ))}
      {/* Vorderfläche */}
      {segs.map((s, i) => (
        <rect key={`f${i}`} x={colX} y={s.y0} width={colW} height={Math.max(0.5, s.y1 - s.y0)} fill={s.fill} />
      ))}
      <rect x={colX} y={padT} width={colW} height={plotH} className="td-snd-col-frame" />
      {/* Wind-Streamer (Pfeile) je Niveau */}
      {ls.map((l, i) => {
        const spd = Math.hypot(l.windU, l.windV);
        const len = Math.min(28, 6 + spd * 1.3);
        const dir = Math.atan2(l.windU, l.windV); // Strömungsrichtung (hin)
        const cx = colX + colW + depth + 10, cy = yOf(l.heightM);
        const dx = Math.sin(dir) * len, dy = -Math.cos(dir) * len * 0.5;
        return <line key={`w${i}`} x1={cx} y1={cy} x2={cx + dx} y2={cy + dy} className="td-snd-col-wind" markerEnd="url(#sndarrow)" />;
      })}
      {/* Marker: Nullgrad, LCL, EL */}
      {derived.freezingM != null && colMarker(yOf(derived.freezingM), '0 °C', 'fz', colX, colW + depth)}
      {colMarker(yOf(derived.lclM), 'LCL', 'lcl', colX, colW + depth)}
      {derived.elM != null && colMarker(yOf(derived.elM), 'EL', 'el', colX, colW + depth)}
      {/* Höhenachse */}
      {[0, 3000, 6000, 9000, 12000].filter((z) => z >= zMin && z <= zMax).map((z) => (
        <text key={z} x={colX - 6} y={yOf(z) + 3} className="td-snd-col-zlabel" textAnchor="end">{(z / 1000).toFixed(0)}k</text>
      ))}
      <defs>
        <marker id="sndarrow" markerWidth="5" markerHeight="5" refX="3" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 z" className="td-snd-col-arrowhead" />
        </marker>
      </defs>
    </svg>
  );
}

function colMarker(y: number, label: string, cls: string, x: number, w: number) {
  return (
    <g>
      <line x1={x} y1={y} x2={x + w} y2={y} className={`td-snd-col-marker is-${cls}`} />
      <text x={x} y={y - 2} className="td-snd-col-markerlabel">{label}</text>
    </g>
  );
}

function Indices({ profile, derived }: { profile: SoundingProfile; derived: SoundingDerived }) {
  const d = derived;
  const verdict = capeVerdict(d.capeJkg, d.cinJkg, d.liftedIndex);
  const rows: Array<[string, string]> = [
    ['CAPE', `${d.capeJkg} J/kg`],
    ['CIN', `${d.cinJkg} J/kg`],
    ['Lifted Index', d.liftedIndex == null ? '–' : `${d.liftedIndex}`],
    ['LCL', `${d.lclM} m`],
    ['LFC', d.lfcM == null ? '–' : `${d.lfcM} m`],
    ['Gleichgewicht (EL)', d.elM == null ? '–' : `${d.elM} m`],
    ['Nullgradgrenze', d.freezingM == null ? '–' : `${d.freezingM} m`],
    ['Boden', `${Math.round(profile.levels[0].tempC)} °C / Td ${Math.round(profile.levels[0].dewC)} °C`],
  ];
  return (
    <div className="td-snd-idx">
      <div className={`td-snd-verdict td-snd-verdict-${verdict.tone}`}>{verdict.text}</div>
      <dl className="td-snd-idxlist">
        {rows.map(([k, v]) => (<div key={k} className="td-snd-idxrow"><dt>{k}</dt><dd>{v}</dd></div>))}
      </dl>
      <p className="td-snd-legend">
        <span className="td-snd-leg t">T</span> Temperatur · <span className="td-snd-leg td">Td</span> Taupunkt ·
        <span className="td-snd-leg pc">Parcel</span> · <span className="td-snd-leg cape">CAPE</span> / <span className="td-snd-leg cin">CIN</span>
      </p>
    </div>
  );
}

function capeVerdict(cape: number, cin: number, li: number | null): { text: string; tone: 'calm' | 'watch' | 'alert' } {
  if (cape >= 1500) return { text: `Hohes Gewitterpotenzial — CAPE ${cape} J/kg${cin < -75 ? ', aber Deckel (CIN)' : ''}`, tone: 'alert' };
  if (cape >= 500) return { text: `Erhöhtes Gewitterpotenzial — CAPE ${cape} J/kg${cin < -75 ? ', gedeckelt' : ''}`, tone: 'watch' };
  if (cape >= 100) return { text: `Geringes Konvektionspotenzial — CAPE ${cape} J/kg`, tone: 'watch' };
  return { text: li != null && li > 6 ? 'Stabil geschichtet — keine Konvektion zu erwarten' : 'Im Wesentlichen stabil — kaum Konvektion', tone: 'calm' };
}

function fmtUTC(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}. ${String(d.getUTCHours()).padStart(2, '0')}Z`;
}
