/**
 * Skew-T-log-p-Diagramm (SVG) — der meteorologische Profi-Standard, gespeist aus
 * dem echten GFS-Druckflächenprofil. Schräggestellte Isothermen + log-Druck-Achse,
 * Umgebungs-T (Terrakotta) und Taupunkt (Sage), Hebungs-Parcel (gestrichelt),
 * CAPE (rot) / CIN (blau) als Flächen, Wind-Barbs rechts, LCL/LFC/EL-Marker.
 *
 * Bewusst ehrlich: GFS 1° (~25 km) auf groben Standardflächen → Richtwert, keine
 * Radiosonde. Die Geometrie folgt der klassischen Konvention, damit CAPE/CIN als
 * Flächen ablesbar bleiben (genau dafür ist Skew-T 2D).
 */

import type { SoundingProfile } from '../sources/iconEuSounding';
import type { SoundingDerived } from './soundingMath';

interface Props {
  profile: SoundingProfile;
  derived: SoundingDerived;
  width?: number;
  height?: number;
}

const T_MIN = -40, T_MAX = 40;   // °C am unteren Rand
const SKEW = 0.55;               // Schräge der Isothermen (px-Anteil je Höhe)
const P_TOP = 200;

export default function SkewTChart({ profile, derived, width = 460, height = 520 }: Props) {
  const padL = 40, padR = 46, padT = 16, padB = 30;
  const W = width - padL - padR;
  const H = height - padT - padB;
  const x0 = padL, y0 = padT;
  const yBot = y0 + H;

  const pBot = Math.max(...profile.levels.map((l) => l.pressureHpa));
  const lnBot = Math.log(pBot), lnTop = Math.log(P_TOP);
  const yOf = (p: number) => y0 + H * (Math.log(p) - lnTop) / (lnBot - lnTop);
  const xOf = (tC: number, p: number) => x0 + ((tC - T_MIN) / (T_MAX - T_MIN)) * W + SKEW * (yBot - yOf(p));

  const ls = profile.levels;
  const isotherms: number[] = [];
  for (let t = -80; t <= 50; t += 10) isotherms.push(t);
  const pLines = [1000, 850, 700, 600, 500, 400, 300, 250, 200].filter((p) => p <= pBot + 1);

  const tPath = ls.map((l, i) => `${i ? 'L' : 'M'} ${xOf(l.tempC, l.pressureHpa).toFixed(1)} ${yOf(l.pressureHpa).toFixed(1)}`).join(' ');
  const tdPath = ls.map((l, i) => `${i ? 'L' : 'M'} ${xOf(l.dewC, l.pressureHpa).toFixed(1)} ${yOf(l.pressureHpa).toFixed(1)}`).join(' ');
  const parcel = derived.parcel.filter((q) => q.p >= P_TOP);
  const parcelPath = parcel.map((q, i) => `${i ? 'L' : 'M'} ${xOf(q.tC, q.p).toFixed(1)} ${yOf(q.p).toFixed(1)}`).join(' ');

  const envTat = (p: number) => interpLevels(ls, p);
  const parcelTat = (p: number) => {
    if (p >= parcel[0].p) return parcel[0].tC;
    for (let i = 1; i < parcel.length; i++) if (p >= parcel[i].p) {
      const a = parcel[i - 1], b = parcel[i]; const t = (a.p - p) / (a.p - b.p); return a.tC + (b.tC - a.tC) * t;
    }
    return parcel[parcel.length - 1].tC;
  };

  // CAPE/CIN als geschlossene Polygone (Parcel-Seite hoch, Umgebungs-Seite zurück).
  const capePolys: string[] = [];
  const cinPolys: string[] = [];
  if (parcel.length > 1) {
    const lfc = derived.lfcHpa;
    let cur: { sign: number; up: string[]; dn: string[] } | null = null;
    const flush = () => {
      if (cur && cur.up.length > 1) (cur.sign > 0 ? capePolys : cinPolys).push([...cur.up, ...cur.dn.reverse()].join(' '));
      cur = null;
    };
    for (let p = pBot; p >= P_TOP; p -= 4) {
      const pe = parcelTat(p), ee = envTat(p);
      const sign = pe > ee ? 1 : -1;
      const relevant = lfc != null && (sign > 0 ? p <= lfc : p >= lfc);
      if (!relevant) { flush(); continue; }
      if (!cur || cur.sign !== sign) { flush(); cur = { sign, up: [], dn: [] }; }
      cur.up.push(`${xOf(pe, p).toFixed(1)},${yOf(p).toFixed(1)}`);
      cur.dn.push(`${xOf(ee, p).toFixed(1)},${yOf(p).toFixed(1)}`);
    }
    flush();
  }

  return (
    <svg className="td-skewt" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Skew-T-Sounding · CAPE ${derived.capeJkg} J/kg, LI ${derived.liftedIndex ?? '–'}`}>
      <rect x={x0} y={y0} width={W} height={H} className="td-skewt-plot" />
      <defs><clipPath id="skewt-clip"><rect x={x0} y={y0} width={W} height={H} /></clipPath></defs>
      <g clipPath="url(#skewt-clip)">
        {isotherms.map((t) => (
          <line key={t} x1={xOf(t, pBot)} y1={yBot} x2={xOf(t, P_TOP)} y2={y0}
            className={`td-skewt-iso${t === 0 ? ' is-zero' : ''}`} />
        ))}
        {cinPolys.map((pts, i) => <polygon key={`cin${i}`} points={pts} className="td-skewt-cin" />)}
        {capePolys.map((pts, i) => <polygon key={`cape${i}`} points={pts} className="td-skewt-cape" />)}
        <path d={parcelPath} className="td-skewt-parcel" />
        <path d={tdPath} className="td-skewt-td" />
        <path d={tPath} className="td-skewt-t" />
        {markerLine(derived.lclHpa, 'LCL', yOf, x0, W)}
        {derived.lfcHpa != null && markerLine(derived.lfcHpa, 'LFC', yOf, x0, W)}
        {derived.elHpa != null && markerLine(derived.elHpa, 'EL', yOf, x0, W)}
      </g>
      {pLines.map((p) => (
        <g key={p}>
          <line x1={x0} y1={yOf(p)} x2={x0 + W} y2={yOf(p)} className="td-skewt-pline" />
          <text x={x0 - 6} y={yOf(p) + 3} className="td-skewt-plabel" textAnchor="end">{p}</text>
        </g>
      ))}
      <g transform={`translate(${x0 + W + 14}, 0)`}>
        {ls.map((l, i) => <WindBarb key={i} y={yOf(l.pressureHpa)} u={l.windU} v={l.windV} />)}
      </g>
      {[-40, -20, 0, 20, 40].map((t) => (
        <text key={t} x={xOf(t, pBot)} y={yBot + 16} className={`td-skewt-tlabel${t === 0 ? ' is-zero' : ''}`} textAnchor="middle">{t}°</text>
      ))}
    </svg>
  );
}

function markerLine(p: number, label: string, yOf: (p: number) => number, x0: number, W: number) {
  const y = yOf(p);
  return (
    <g>
      <line x1={x0} y1={y} x2={x0 + W} y2={y} className="td-skewt-marker" />
      <text x={x0 + W - 4} y={y - 3} className="td-skewt-markerlabel" textAnchor="end">{label}</text>
    </g>
  );
}

/** Wind-Barb aus u/v (m/s → Knoten); zeigt aus der Richtung, aus der der Wind kommt. */
function WindBarb({ y, u, v }: { y: number; u: number; v: number }) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  const spdKt = Math.hypot(u, v) * 1.94384;
  const dir = (Math.atan2(-u, -v) * 180) / Math.PI;
  const L = 16;
  return (
    <g transform={`translate(0, ${y}) rotate(${dir})`}>
      <line x1="0" y1="0" x2="0" y2={-L} className="td-skewt-barb" />
      {barbFlags(spdKt).map((f, i) => {
        const yy = -L + i * 3.5;
        if (f === 50) return <polygon key={i} points={`0,${yy} 7,${yy + 1} 0,${yy + 3}`} className="td-skewt-barbflag" />;
        if (f === 10) return <line key={i} x1="0" y1={yy} x2="7" y2={yy - 2.5} className="td-skewt-barb" />;
        return <line key={i} x1="0" y1={yy} x2="4" y2={yy - 1.3} className="td-skewt-barb" />;
      })}
    </g>
  );
}
function barbFlags(kt: number): number[] {
  let r = Math.round(kt / 5) * 5; const out: number[] = [];
  while (r >= 50) { out.push(50); r -= 50; }
  while (r >= 10) { out.push(10); r -= 10; }
  if (r >= 5) out.push(5);
  return out;
}

function interpLevels(ls: SoundingProfile['levels'], p: number): number {
  if (p >= ls[0].pressureHpa) return ls[0].tempC;
  const last = ls[ls.length - 1];
  if (p <= last.pressureHpa) return last.tempC;
  for (let i = 1; i < ls.length; i++) if (p >= ls[i].pressureHpa) {
    const a = ls[i - 1], b = ls[i];
    const t = (Math.log(p) - Math.log(a.pressureHpa)) / (Math.log(b.pressureHpa) - Math.log(a.pressureHpa));
    return a.tempC + (b.tempC - a.tempC) * t;
  }
  return last.tempC;
}
