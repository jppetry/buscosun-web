/**
 * BDE-C — die zwei Grafiken der Wetterführung: **Windrose** über das Brandzeitfenster und
 * die **Zeitreihe der treibenden Größen**. Reines SVG (D-06, keine Chart-Bibliothek:
 * Recharts wären ≈ 95 KB gegen 20,5 KB Luft in der Budget-Ratsche).
 *
 * Beide Grafiken tragen `font-family` an jedem `<text>` ausdrücklich — ohne sie erbt ein
 * SVG-Text die Standardschrift des Browsers, nicht die des Decks (Befund B1,
 * `audit/brandradar-detail-mitte.md`). Farben ausschließlich aus vorhandenen Tokens; die
 * Stärkeklassen der Rose sind die Sand-/Stein-Leiter hell → dunkel, also schwach → stark.
 *
 * Regeln, die hier sichtbar werden:
 *  • Die Rose zeigt, woher der Wind KOMMT (meteorologische Konvention) — der Pfeil der
 *    Ausbreitung zeigt, wohin das Feuer läuft. Beides in einem Bild wäre eine Falle,
 *    deshalb steht die Richtung des Feuers als eigener Zeiger mit eigener Beschriftung.
 *  • Stunden ohne Wert sind Lücken in der Linie, keine Nullen.
 *  • Der Zeitraum der Detektionen ist im Hintergrund hinterlegt — der Rest der Reihe ist
 *    Vorlauf und wird als solcher beschriftet.
 */
import { useId } from 'react';
import type { FireWeatherHour } from './detail/fireWeatherAtPoint';
import type { FireIndexSeries, WindRose } from './detail/fireDrivers';
import { WIND_CLASS_LABEL } from './detail/fireDrivers';
import { compassLabel } from './activity/dynamics';

const FONT = 'League Spartan, system-ui, sans-serif';
/** Schwach → stark. Vorhandene Deck-Token, keine neue Farbe. */
const CLASS_FILL = ['var(--sand-300)', 'var(--stone-400)', 'var(--stone-500)', 'var(--stone-600)'];

// ---------------------------------------------------------------------------
// Windrose
// ---------------------------------------------------------------------------

const R_MAX = 74;
const CX = 100;
const CY = 100;

function pt(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

/** Ringsegment eines Sektors — außen im Uhrzeigersinn, innen zurück. */
function wedge(r0: number, r1: number, a0: number, a1: number): string {
  const [x0o, y0o] = pt(r1, a0); const [x1o, y1o] = pt(r1, a1);
  const [x1i, y1i] = pt(r0, a1); const [x0i, y0i] = pt(r0, a0);
  return `M${x0o.toFixed(2)},${y0o.toFixed(2)}A${r1},${r1} 0 0 1 ${x1o.toFixed(2)},${y1o.toFixed(2)}`
    + `L${x1i.toFixed(2)},${y1i.toFixed(2)}A${r0},${r0} 0 0 0 ${x0i.toFixed(2)},${y0i.toFixed(2)}Z`;
}

export interface WindRoseChartProps {
  rose: WindRose;
  /** Richtung, in die sich der Brand verlagert hat (Grad) — eigener Zeiger, `null` = keiner. */
  spreadBearingDeg?: number | null;
  /** Vorherrschende Windrichtung („kommt aus") — als Speiche hervorgehoben. */
  dominantFromDeg?: number | null;
  size?: number;
}

export function WindRoseChart({ rose, spreadBearingDeg = null, dominantFromDeg = null, size = 200 }: WindRoseChartProps) {
  const id = useId();
  const sectors = rose.sectors.length;
  const width = 360 / sectors;
  const scale = rose.maxSector > 0 ? R_MAX / rose.maxSector : 0;
  // Zwei Ringe als Maßstab — mehr würde bei 20–50 Stunden nur Linien ins Bild bringen.
  const rings = rose.maxSector > 0 ? [Math.ceil(rose.maxSector / 2), rose.maxSector] : [];
  const label = (deg: number, text: string) => {
    const [x, y] = pt(R_MAX + 13, deg);
    return <text key={text} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontFamily={FONT} fontSize="11" fill="var(--stone-500)">{text}</text>;
  };
  return (
    <figure className="br-rose" aria-labelledby={`${id}-cap`}>
      <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={`Windrose über ${rose.hours} Stunden`}>
        {rings.map((n) => (
          <circle key={n} cx={CX} cy={CY} r={n * scale} fill="none" stroke="var(--sand-200)" strokeWidth="1" />
        ))}
        {rings.length > 0 && (
          <text x={CX + 3} y={CY - rings[rings.length - 1] * scale + 10} fontFamily={FONT} fontSize="9.5" fill="var(--stone-400)">
            {rings[rings.length - 1]} h
          </text>
        )}
        {rose.sectors.map((s) => {
          let r0 = 0;
          return s.counts.map((c, k) => {
            if (c === 0) return null;
            const r1 = r0 + c * scale;
            const d = wedge(r0, r1, s.centerDeg - width / 2, s.centerDeg + width / 2);
            r0 = r1;
            return <path key={`${s.centerDeg}-${k}`} d={d} fill={CLASS_FILL[k]} stroke="var(--sand-50)" strokeWidth="0.4" />;
          });
        })}
        {dominantFromDeg != null && (
          <line
            x1={CX} y1={CY} x2={pt(R_MAX, dominantFromDeg)[0]} y2={pt(R_MAX, dominantFromDeg)[1]}
            stroke="var(--br-slate)" strokeWidth="1.5" strokeDasharray="3 2"
          />
        )}
        {spreadBearingDeg != null && (
          <>
            <line
              x1={CX} y1={CY} x2={pt(R_MAX - 6, spreadBearingDeg)[0]} y2={pt(R_MAX - 6, spreadBearingDeg)[1]}
              stroke="var(--br-red)" strokeWidth="2"
            />
            <polygon
              points={[pt(R_MAX, spreadBearingDeg), pt(R_MAX - 11, spreadBearingDeg - 5), pt(R_MAX - 11, spreadBearingDeg + 5)]
                .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
              fill="var(--br-red)"
            />
          </>
        )}
        <circle cx={CX} cy={CY} r="3" fill="var(--sand-50)" stroke="var(--stone-400)" strokeWidth="1" />
        {[[0, 'N'], [90, 'O'], [180, 'S'], [270, 'W']].map(([d, t]) => label(d as number, t as string))}
      </svg>
      <figcaption id={`${id}-cap`} className="br-rose-cap">
        <ul className="br-rose-key" aria-label="Stärkeklassen">
          {WIND_CLASS_LABEL.map((l, k) => (
            <li key={l}><i style={{ background: CLASS_FILL[k] }} aria-hidden="true" />{l}</li>
          ))}
        </ul>
        <p className="br-note">
          Stundenzahl je Richtung, aus der der Wind <b>kommt</b> ({rose.hours} Stunden im Brandzeitfenster
          {rose.calm > 0 && `, davon ${rose.calm} h Windstille in der Mitte`}
          {rose.missing > 0 && `, ${rose.missing} h ohne Wert`}).
          {dominantFromDeg != null && <> Gestrichelt: vorherrschende Richtung ({compassLabel(dominantFromDeg)}, {dominantFromDeg}°).</>}
          {spreadBearingDeg != null && <> Roter Pfeil: <b>wohin</b> sich der Brandschwerpunkt verlagert hat ({compassLabel(spreadBearingDeg)}) — andere Konvention als die Rose, deshalb eigener Zeiger.</>}
        </p>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Zeitreihe
// ---------------------------------------------------------------------------

interface Row {
  key: string;
  label: string;
  unit: string;
  color: string;
  values: (number | null)[];
  /** Zweite Linie derselben Zeile (Böen) — teilt sich die Skala. */
  second?: { values: (number | null)[]; label: string };
  /** Balken statt Linie (Niederschlag). */
  bars?: boolean;
  /** Untergrenze der Skala festhalten (Feuchte 0–100, Regen ab 0). */
  min?: number;
  max?: number;
}

export interface DriverSeriesChartProps {
  hours: readonly FireWeatherHour[];
  /** `[von, bis]` der Detektionen — wird hinterlegt. */
  detectionRange: [number, number] | null;
  index: FireIndexSeries | null;
  width?: number;
}

const ROW_H = 40;
const PAD_L = 56;
const PAD_R = 34;
const PAD_T = 6;
const AXIS_H = 18;

export function DriverSeriesChart({ hours, detectionRange, index, width = 380 }: DriverSeriesChartProps) {
  const id = useId();
  if (hours.length < 2) return null;
  const t0 = hours[0].atMs;
  const t1 = hours[hours.length - 1].atMs;
  const span = Math.max(1, t1 - t0);
  const x = (ms: number) => PAD_L + ((ms - t0) / span) * (width - PAD_L - PAD_R);

  const isiByMs = new Map<number, number>();
  if (index) for (const h of index.hours) if (!h.spinup) isiByMs.set(h.atMs, h.isi);

  const rows: Row[] = [
    {
      key: 'wind', label: 'Wind', unit: 'km/h', color: 'var(--br-slate)', min: 0,
      values: hours.map((h) => h.windKmh),
      second: { values: hours.map((h) => h.gustKmh), label: 'Böen' },
    },
    { key: 'temp', label: 'Temperatur', unit: '°C', color: 'var(--br-terra)', values: hours.map((h) => h.tempC) },
    { key: 'rh', label: 'rel. Feuchte', unit: '%', color: 'var(--br-steel)', values: hours.map((h) => h.rhPct), min: 0, max: 100 },
    { key: 'precip', label: 'Niederschlag', unit: 'mm', color: 'var(--br-steel)', values: hours.map((h) => h.precipMm), bars: true, min: 0 },
    // „ISI" hat keine Einheit — die Zeile trägt deshalb nur die Zahl; dass er abgeleitet ist, sagt der Text darunter.
    { key: 'isi', label: 'ISI', unit: '', color: 'var(--br-red)', min: 0, values: hours.map((h) => isiByMs.get(h.atMs) ?? null) },
  ].filter((r) => r.values.some((v) => v != null));

  const height = PAD_T + rows.length * ROW_H + AXIS_H;

  // Tagesgrenzen als senkrechte Linien — die x-Achse trägt sonst nur Stunden ohne Halt.
  const days: number[] = [];
  for (let ms = Math.ceil(t0 / 86_400_000) * 86_400_000; ms <= t1; ms += 86_400_000) days.push(ms);

  return (
    <figure className="br-drvchart" aria-labelledby={`${id}-cap`}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Zeitreihe der treibenden Größen im Brandzeitfenster">
        {detectionRange && (
          <rect
            x={x(Math.max(detectionRange[0], t0))} y={PAD_T}
            width={Math.max(1, x(Math.min(detectionRange[1], t1)) - x(Math.max(detectionRange[0], t0)))}
            height={rows.length * ROW_H} fill="var(--br-red)" opacity="0.07"
          />
        )}
        {days.map((ms) => (
          <line key={ms} x1={x(ms)} y1={PAD_T} x2={x(ms)} y2={PAD_T + rows.length * ROW_H} stroke="var(--sand-200)" strokeWidth="1" />
        ))}
        {rows.map((r, i) => {
          const top = PAD_T + i * ROW_H;
          const inner = ROW_H - 12;
          const vals = r.values.filter((v): v is number => v != null);
          const lo = r.min ?? Math.min(...vals);
          const hiRaw = r.max ?? Math.max(...vals, ...(r.second?.values.filter((v): v is number => v != null) ?? []));
          const hi = hiRaw > lo ? hiRaw : lo + 1;
          const y = (v: number) => top + inner - ((v - lo) / (hi - lo)) * inner;
          const line = (vs: (number | null)[]) => {
            let d = ''; let pen = false;
            vs.forEach((v, k) => {
              if (v == null) { pen = false; return; }
              const px = x(hours[k].atMs);
              d += `${pen ? 'L' : 'M'}${px.toFixed(1)},${y(v).toFixed(1)}`;
              pen = true;
            });
            return d;
          };
          return (
            <g key={r.key}>
              <line x1={PAD_L} y1={top + inner} x2={width - PAD_R} y2={top + inner} stroke="var(--sand-200)" strokeWidth="1" />
              <text x={PAD_L - 6} y={top + inner - 1} textAnchor="end" fontFamily={FONT} fontSize="10" fill="var(--stone-500)">{r.label}</text>
              <text x={width - PAD_R + 4} y={top + 8} fontFamily={FONT} fontSize="9.5" fill="var(--stone-400)">
                {Math.round(hi)} {r.unit}
              </text>
              {r.bars
                ? r.values.map((v, k) => (v == null || v <= 0 ? null : (
                  <rect
                    key={k} x={x(hours[k].atMs) - 1.2} y={y(v)} width="2.4"
                    height={Math.max(0.8, top + inner - y(v))} fill={r.color} opacity="0.75"
                  />
                )))
                : (
                  <>
                    {r.second && <path d={line(r.second.values)} fill="none" stroke={r.color} strokeWidth="1" opacity="0.45" strokeDasharray="3 2" />}
                    <path d={line(r.values)} fill="none" stroke={r.color} strokeWidth="1.5" />
                  </>
                )}
            </g>
          );
        })}
        {days.map((ms) => (
          <text
            key={`l${ms}`} x={x(ms)} y={height - 5} textAnchor="middle"
            fontFamily={FONT} fontSize="9.5" fill="var(--stone-400)"
          >
            {new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}
          </text>
        ))}
      </svg>
      <figcaption id={`${id}-cap`} className="br-note">
        Stündliche Modellwerte über dem Brandzeitfenster; der hinterlegte Streifen ist der Zeitraum der
        Detektionen, davor liegt der Vorlauf. Rechts steht der Höchstwert der jeweiligen Zeile — die Zeilen
        haben eigene Skalen und sind untereinander nicht vergleichbar. Lücken in einer Linie sind fehlende
        Stunden, keine Nullen. Wind gestrichelt: Böen.
        {index && ' ISI erst nach dem Vorlauf der FFMC-Kette.'}
      </figcaption>
    </figure>
  );
}
