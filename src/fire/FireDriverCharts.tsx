/**
 * D3 — die **Windrose** über das Brandzeitfenster.
 *
 * Sie **bleibt eigenes SVG**, auch nach dem MUI-Umbau, und das ist eine inhaltliche
 * Entscheidung, keine Bequemlichkeit: MUI X hat kein Polarchart, und sein `RadarChart`
 * kann weder gestapelte Sektoren mit Stärkeklassen noch einen ZWEITEN Zeiger mit einer
 * ANDEREN Konvention. Genau diese Unterscheidung ist der Kern der Grafik:
 *
 *   • Die **Rose** zeigt, woher der Wind KOMMT (meteorologische Konvention).
 *   • Der **rote Pfeil** zeigt, WOHIN sich der Brandschwerpunkt verlagert hat.
 *
 * Beides in einer Konvention zu zeichnen wäre eine Falle; sie zu verschmelzen, um eine
 * Bibliothekskomponente benutzen zu können, wäre Informationsverlust. Geändert wurde nur,
 * was die MUI-Umstellung sinnvoll macht: die Farben kommen jetzt aus `theme.palette.fire`
 * (dieselben Werte wie zuvor die `--sand-*`/`--stone-*`-Tokens, eine Quelle), und die
 * Legende der Stärkeklassen ist eine `Chip`-Reihe statt handgebauter Punkte.
 *
 * Die **Zeitreihe (D4)** ist seit dem Umbau ein MUI-X-Chart und steht in
 * `dossier/DriverSeriesChart.tsx` — sie wird hier nur weitergereicht, damit die
 * Aufrufstellen unverändert bleiben (EINE Quelle je Grafik).
 *
 * Jeder `<text>` in diesem SVG trägt `font-family` ausdrücklich — ohne sie erbt ein
 * SVG-Text die Standardschrift des Browsers, nicht die des Decks (Befund B1,
 * `audit/brandradar-detail-mitte.md`). Keine Hex-Farbe in dieser Datei.
 */
import { useId } from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { WindRose } from './detail/fireDrivers';
import { WIND_CLASS_LABEL } from './detail/fireDrivers';
import { compassLabel } from './activity/dynamics';
import { SVG_FONT } from '../theme/buscosunTheme';

export { DriverSeriesChart } from './dossier/DriverSeriesChart';
export type { DriverSeriesChartProps } from './dossier/DriverSeriesChart';

const FONT = SVG_FONT;

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
  const t = useTheme();
  const fill = t.palette.fire.roseScale;
  const sectors = rose.sectors.length;
  const width = 360 / sectors;
  const scale = rose.maxSector > 0 ? R_MAX / rose.maxSector : 0;
  // Zwei Ringe als Maßstab — mehr würde bei 20–50 Stunden nur Linien ins Bild bringen.
  const rings = rose.maxSector > 0 ? [Math.ceil(rose.maxSector / 2), rose.maxSector] : [];
  const label = (deg: number, text: string) => {
    const [x, y] = pt(R_MAX + 13, deg);
    return (
      <text key={text} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontFamily={FONT} fontSize="11" fill={t.palette.text.disabled}>
        {text}
      </text>
    );
  };
  return (
    <Box component="figure" className="br-rose" sx={{ m: 0, flex: '0 0 auto' }} aria-labelledby={`${id}-cap`}>
      <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={`Windrose über ${rose.hours} Stunden`}>
        {rings.map((n) => (
          <circle key={n} cx={CX} cy={CY} r={n * scale} fill="none" stroke={t.palette.divider} strokeWidth="1" />
        ))}
        {rings.length > 0 && (
          <text x={CX + 3} y={CY - rings[rings.length - 1] * scale + 10} fontFamily={FONT} fontSize="9.5" fill={t.palette.text.disabled}>
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
            return <path key={`${s.centerDeg}-${k}`} d={d} fill={fill[k]} stroke={t.palette.background.paper} strokeWidth="0.4" />;
          });
        })}
        {dominantFromDeg != null && (
          <line
            x1={CX} y1={CY} x2={pt(R_MAX, dominantFromDeg)[0]} y2={pt(R_MAX, dominantFromDeg)[1]}
            stroke={t.palette.fire.slate} strokeWidth="1.5" strokeDasharray="3 2"
          />
        )}
        {spreadBearingDeg != null && (
          <>
            <line
              x1={CX} y1={CY} x2={pt(R_MAX - 6, spreadBearingDeg)[0]} y2={pt(R_MAX - 6, spreadBearingDeg)[1]}
              stroke={t.palette.fire.extreme} strokeWidth="2"
            />
            <polygon
              points={[pt(R_MAX, spreadBearingDeg), pt(R_MAX - 11, spreadBearingDeg - 5), pt(R_MAX - 11, spreadBearingDeg + 5)]
                .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
              fill={t.palette.fire.extreme}
            />
          </>
        )}
        <circle cx={CX} cy={CY} r="3" fill={t.palette.background.paper} stroke={t.palette.text.disabled} strokeWidth="1" />
        {[[0, 'N'], [90, 'O'], [180, 'S'], [270, 'W']].map(([d, tx]) => label(d as number, tx as string))}
      </svg>
      <Box component="figcaption" id={`${id}-cap`} className="br-rose-cap" sx={{ maxWidth: 280 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.75 }} aria-label="Stärkeklassen">
          {WIND_CLASS_LABEL.map((l, k) => (
            <Chip
              key={l} size="small" variant="outlined" label={l}
              icon={<Box component="span" aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: fill[k], ml: '8px !important' }} />}
            />
          ))}
        </Box>
        <Typography variant="caption" component="p" sx={{ m: 0 }} className="br-note">
          Stundenzahl je Richtung, aus der der Wind <b>kommt</b> ({rose.hours} Stunden im Brandzeitfenster
          {rose.calm > 0 && `, davon ${rose.calm} h Windstille in der Mitte`}
          {rose.missing > 0 && `, ${rose.missing} h ohne Wert`}).
          {dominantFromDeg != null && <> Gestrichelt: vorherrschende Richtung ({compassLabel(dominantFromDeg)}, {dominantFromDeg}°).</>}
          {spreadBearingDeg != null && <> Roter Pfeil: <b>wohin</b> sich der Brandschwerpunkt verlagert hat ({compassLabel(spreadBearingDeg)}) — andere Konvention als die Rose, deshalb eigener Zeiger.</>}
        </Typography>
      </Box>
    </Box>
  );
}
