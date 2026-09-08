/**
 * D4 — **Treiber-Zeitreihe im Brandzeitfenster** auf MUI X Charts.
 *
 * Fünf Zeilen, jede mit eigener Skala: Wind km/h (+ Böen gestrichelt) · Temperatur °C ·
 * rel. Feuchte % (0–100 FEST) · Niederschlag mm (Balken) · ISI (ohne Einheit).
 *
 * ── Warum fünf Charts statt eines mit fünf Y-Achsen ─────────────────────────────────
 * Ein Chart mit fünf Y-Achsen ist unlesbar: fünf Linien in einem Feld, die nichts
 * miteinander zu tun haben, laden zum Vergleich ein, der keiner ist. Die Zeilen sind
 * bewusst getrennt — und die Bildunterschrift sagt es: „die Zeilen haben eigene Skalen
 * und sind untereinander nicht vergleichbar."
 *
 * ── Der geteilte Zeiger ──────────────────────────────────────────────────────────────
 * Fünf getrennte MUI-X-Charts teilen sich KEINEN Tooltip: jeder `ChartsTooltip` lebt in
 * seinem eigenen Datenkontext. Statt das zu umgehen, führt diese Datei den Zeitpunkt
 * selbst: ein `pointermove` über dem Stapel bestimmt die Stunde, jede Zeile bekommt sie
 * als `ChartsReferenceLine`, und ÜBER dem Stapel steht eine Ablesezeile mit ALLEN fünf
 * Werten dieser Stunde. Das ist mehr als ein Tooltip je Zeile — man sieht Wind, Feuchte
 * und ISI derselben Stunde gleichzeitig. Fehlt ein Wert, steht dort „—", nie eine Null.
 *
 * ── Die Zusage, die nicht fallen darf ────────────────────────────────────────────────
 * `connectNulls: false` in JEDER Serie. „Stunden ohne Wert sind Lücken in der Linie,
 * keine Nullen" ist eine Zusage an den Nutzer; `connectNulls: true` würde sie brechen,
 * indem es über eine Datenlücke eine Gerade zieht, die niemand gemessen hat.
 *
 * Alle Zeilen teilen dieselbe X-Domäne und dieselben Ränder — nur so stehen die fünf
 * Felder übereinander wirklich untereinander.
 */
import { useMemo, useRef, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsContainer } from '@mui/x-charts/ChartsContainer';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { useDrawingArea, useXScale, useYScale } from '@mui/x-charts/hooks';
import type { FireWeatherHour } from '../detail/fireWeatherAtPoint';
import type { FireIndexSeries } from '../detail/fireDrivers';
import { SVG_FONT } from '../../theme/buscosunTheme';
import { useDossierBreakpoint } from './DossierPrimitives';

export interface DriverSeriesChartProps {
  hours: readonly FireWeatherHour[];
  /** `[von, bis]` der Detektionen — wird in JEDER Zeile hinterlegt. */
  detectionRange: [number, number] | null;
  index: FireIndexSeries | null;
  /** Obergrenze der Breite; die Breite selbst misst MUI X an der Karte (s. `FirePassChart`). */
  width?: number;
}

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
  min?: number;
  max?: number;
}

const PAD_L = 46;
const PAD_R = 40;
const ROW_H = 66;
const AXIS_H = 26;

const de = (n: number, frac = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });

/**
 * Die Regenbalken auf der geteilten Zeitachse (siehe Begründung an der Aufrufstelle).
 * Eine Stunde ohne Wert bekommt KEINEN Balken — sie ist eine Lücke, kein trockener Balken.
 */
function PrecipBars({ hours, color, floor }: { hours: readonly FireWeatherHour[]; color: string; floor: number }) {
  const area = useDrawingArea();
  const xScale = useXScale<'time'>();
  const yScale = useYScale<'linear'>();
  const y0 = yScale(floor) ?? area.top + area.height;
  const bw = Math.max(1.6, Math.min(6, area.width / Math.max(12, hours.length * 1.6)));
  return (
    <g>
      {hours.map((h) => {
        if (h.precipMm == null || h.precipMm <= 0) return null;
        const x = xScale(new Date(h.atMs));
        if (x == null) return null;
        const y = yScale(h.precipMm) ?? y0;
        return (
          <rect key={h.atMs} x={x - bw / 2} y={y} width={bw} height={Math.max(0.8, y0 - y)} fill={color} opacity={0.75}>
            <title>{`${new Date(h.atMs).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit' })} · ${de(h.precipMm, 1)} mm`}</title>
          </rect>
        );
      })}
    </g>
  );
}

export function DriverSeriesChart({ hours, detectionRange, index, width = 380 }: DriverSeriesChartProps) {
  const t = useTheme();
  const bp = useDossierBreakpoint();
  const [allRows, setAllRows] = useState(false);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const isiByMs = useMemo(() => {
    const m = new Map<number, number>();
    if (index) for (const h of index.hours) if (!h.spinup) m.set(h.atMs, h.isi);
    return m;
  }, [index]);

  const rows: Row[] = useMemo(() => ([
    {
      key: 'wind', label: 'Wind', unit: 'km/h', color: t.palette.fire.slate, min: 0,
      values: hours.map((h) => h.windKmh),
      second: { values: hours.map((h) => h.gustKmh), label: 'Böen' },
    },
    { key: 'temp', label: 'Temperatur', unit: '°C', color: t.palette.fire.terra, values: hours.map((h) => h.tempC) },
    { key: 'rh', label: 'rel. Feuchte', unit: '%', color: t.palette.fire.steel, values: hours.map((h) => h.rhPct), min: 0, max: 100 },
    { key: 'precip', label: 'Niederschlag', unit: 'mm', color: t.palette.fire.steel, values: hours.map((h) => h.precipMm), bars: true, min: 0 },
    // „ISI" hat keine Einheit — die Zeile trägt nur die Zahl; dass er abgeleitet ist, sagt der Text darunter.
    { key: 'isi', label: 'ISI', unit: '', color: t.palette.fire.extreme, min: 0, values: hours.map((h) => isiByMs.get(h.atMs) ?? null) },
  ] as Row[]).filter((r) => r.values.some((v) => v != null)), [hours, isiByMs, t.palette.fire]);

  if (hours.length < 2 || rows.length === 0) return null;

  const t0 = hours[0].atMs;
  const t1 = hours[hours.length - 1].atMs;
  const xData = hours.map((h) => new Date(h.atMs));

  // Mobil zuerst zwei Zeilen (Wind, rel. Feuchte) — offen wären es hier ≈ 900 px allein für
  // diesen Chart. Die anderen drei sind NICHT gestrichen, sie stehen einen Knopf entfernt.
  const mobileKeys = new Set(['wind', 'rh']);
  const shown = bp === 'mobile' && !allRows ? rows.filter((r) => mobileKeys.has(r.key)) : rows;
  const hidden = rows.length - shown.length;

  const rowH = bp === 'mobile' ? 60 : ROW_H;

  /** Die Stunde unter dem Zeiger — aus der Pixelposition, nicht aus einem Chart-Ereignis. */
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const inner = r.width - PAD_L - PAD_R;
    if (inner <= 0) return;
    const frac = (e.clientX - r.left - PAD_L) / inner;
    if (frac < 0 || frac > 1) { setHoverMs(null); return; }
    const want = t0 + frac * (t1 - t0);
    let best = hours[0].atMs; let bestD = Infinity;
    for (const h of hours) { const d = Math.abs(h.atMs - want); if (d < bestD) { bestD = d; best = h.atMs; } }
    setHoverMs(best);
  };

  const hoverHour = hoverMs == null ? null : hours.find((h) => h.atMs === hoverMs) ?? null;

  const marginFor = (last: boolean) => ({ left: PAD_L, right: PAD_R, top: 8, bottom: last ? AXIS_H : 4 });

  // `common` geht AUCH an `ChartsContainer` (Regenzeile). Deshalb stehen hier nur Props, die
  // beide kennen — `hideLegend` gibt es nur an den fertigen Chart-Komponenten und landete
  // sonst als unbekanntes Attribut im DOM (React-Warnung „does not recognize the prop").
  const common = {
    // Keine Einblendung: eine animierte Linie suggeriert einen Verlauf, wo Messpunkte stehen.
    skipAnimation: true,
    sx: {
      '& text': { fontFamily: SVG_FONT, fontSize: 10.5 },
      // Die Böen sind dieselbe Größe in derselben Skala — gestrichelt, nicht zweifarbig.
      '& .MuiLineElement-root[data-series="boeen"]': { strokeDasharray: '4 3', opacity: 0.55, strokeWidth: 1 },
      '@media (prefers-reduced-motion: reduce)': { '& *': { transition: 'none !important' } },
    },
  } as const;

  const band = detectionRange
    ? ([Math.max(detectionRange[0], t0), Math.min(detectionRange[1], t1)] as [number, number])
    : null;

  /** Detektionsspanne + „jetzt-Zeiger" + Tageslinien — in JEDER Zeile dieselben Marken. */
  const overlays = (rowKey: string) => {
    const out = [] as React.ReactNode[];
    if (band && band[1] > band[0]) {
      out.push(
        <ChartsReferenceLine
          key={`${rowKey}-b0`} axisId="zeit" x={new Date(band[0])}
          lineStyle={{ stroke: t.palette.fire.extreme, strokeWidth: 1, opacity: 0.45 }}
        />,
        <ChartsReferenceLine
          key={`${rowKey}-b1`} axisId="zeit" x={new Date(band[1])}
          lineStyle={{ stroke: t.palette.fire.extreme, strokeWidth: 1, opacity: 0.45 }}
        />,
      );
    }
    if (hoverMs != null) {
      out.push(
        <ChartsReferenceLine
          key={`${rowKey}-h`} axisId="zeit" x={new Date(hoverMs)}
          lineStyle={{ stroke: t.palette.text.disabled, strokeWidth: 1, strokeDasharray: '3 3' }}
        />,
      );
    }
    return out;
  };

  const xAxis = (last: boolean) => ([{
    id: 'zeit', scaleType: 'time' as const, data: xData,
    min: new Date(t0), max: new Date(t1),
    tickNumber: bp === 'mobile' ? 2 : 4,
    valueFormatter: (v: Date) => v.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
    ...(last ? {} : { tickLabelStyle: { display: 'none' }, disableTicks: true }),
  }]);

  return (
    <Box
      component="figure"
      // Kein `role="img"` — Begründung siehe `FirePassChart.tsx`.
      aria-label="Zeitreihe der treibenden Größen im Brandzeitfenster"
      sx={{ m: 0, maxWidth: width }}
      className="br-drvchart"
    >
      {/* Die Ablesezeile: EIN Zeitpunkt, ALLE Zeilen. Ohne Zeiger nennt sie das Fenster. */}
      <Typography
        variant="caption" component="p" aria-live="polite"
        sx={{ m: 0, mb: 0.5, minHeight: 20, color: hoverHour ? 'text.primary' : 'text.disabled', fontVariantNumeric: 'tabular-nums' }}
      >
        {hoverHour
          ? <>
              <Box component="b">{new Date(hoverHour.atMs).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Box>
              {' · '}Wind {hoverHour.windKmh != null ? `${de(hoverHour.windKmh, 0)} km/h` : '—'}
              {hoverHour.gustKmh != null ? ` (Böen ${de(hoverHour.gustKmh, 0)})` : ''}
              {' · '}{hoverHour.tempC != null ? `${de(hoverHour.tempC, 1)} °C` : '— °C'}
              {' · RH '}{hoverHour.rhPct != null ? `${de(hoverHour.rhPct, 0)} %` : '—'}
              {' · '}{hoverHour.precipMm != null ? `${de(hoverHour.precipMm, 1)} mm` : '— mm'}
              {' · ISI '}{isiByMs.has(hoverHour.atMs) ? de(isiByMs.get(hoverHour.atMs)!, 1) : '—'}
            </>
          : 'Zeiger über die Zeilen: alle fünf Größen derselben Stunde auf einmal.'}
      </Typography>

      <Box
        ref={boxRef}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverMs(null)}
        sx={{ '& .MuiChartsSurface-root': { display: 'block' } }}
      >
        <Stack spacing={0}>
          {shown.map((r, i) => {
            const last = i === shown.length - 1;
            const vals = r.values.filter((v): v is number => v != null);
            const secVals = r.second?.values.filter((v): v is number => v != null) ?? [];
            const lo = r.min ?? Math.min(...vals);
            const hiRaw = r.max ?? Math.max(...vals, ...secVals);
            const hi = hiRaw > lo ? hiRaw : lo + 1;
            const yAxis = [{
              id: `y-${r.key}`, min: lo, max: hi, width: PAD_L,
              tickNumber: 2,
              valueFormatter: (v: number) => `${de(v, hi - lo < 5 ? 1 : 0)}${r.unit ? ` ${r.unit}` : ''}`,
            }];
            const height = rowH + (last ? AXIS_H : 0);
            const chartProps = {
              ...common, height, margin: marginFor(last),
              xAxis: xAxis(last), yAxis,
            };
            return (
              <Box key={r.key}>
                {/* Die Zeilenbeschriftung steht ÜBER der Zeile, nicht in ihrer Ecke: dort lag sie
                    auf der obersten Achsenmarke („TEMPERATUR" über „30 °C") und beide wurden
                    unlesbar. Sie kostet 14 px je Zeile — der Preis für zwei lesbare Angaben. */}
                <Typography
                  variant="overline" component="span"
                  sx={{ display: 'block', fontSize: 10, letterSpacing: '.08em', color: 'text.secondary', lineHeight: '14px' }}
                >
                  {r.label}
                </Typography>
                {r.bars ? (
                  /*
                   * Niederschlag als Balken: eine Linie zwischen zwei Regenstunden behauptete
                   * Regen dazwischen. `null` statt 0 — eine Stunde ohne Wert ist kein trockener
                   * Balken.
                   *
                   * MUI X' `BarChart` verlangt eine **Band**-Achse. Eine Band-Achse hat andere
                   * Ränder als die Zeitachse der vier Linienzeilen — die Regenzeile stünde
                   * verschoben unter ihnen, und der geteilte Zeiger zeigte in dieser einen Zeile
                   * auf die falsche Stunde. Deshalb dieselbe `time`-Achse wie oben und die
                   * Rechtecke über `useXScale()` darauf (wie in D1).
                   */
                  <ChartsContainer
                    {...common} height={height} margin={marginFor(last)} yAxis={yAxis}
                    series={[]} xAxis={xAxis(last)}
                  >
                    <PrecipBars hours={hours} color={r.color} floor={lo} />
                    <ChartsXAxis axisId="zeit" />
                    <ChartsYAxis axisId={`y-${r.key}`} />
                    {overlays(r.key)}
                  </ChartsContainer>
                ) : (
                  <LineChart
                    {...chartProps}
                    hideLegend
                    series={[
                      // connectNulls: false ist PFLICHT — Lücken bleiben Lücken, keine Nullen.
                      { id: r.key, data: r.values, color: r.color, connectNulls: false, curve: 'linear', showMark: false, label: r.label },
                      ...(r.second
                        ? [{
                            id: 'boeen', data: r.second.values, color: r.color, connectNulls: false,
                            curve: 'linear' as const, showMark: false, label: r.second.label,
                          }]
                        : []),
                    ]}
                  >
                    {overlays(r.key)}
                  </LineChart>
                )}
              </Box>
            );
          })}
        </Stack>
      </Box>

      {hidden > 0 && (
        <Button fullWidth variant="text" size="small" onClick={() => setAllRows(true)} sx={{ mt: 0.5, minHeight: 44 }}>
          Alle fünf Größen zeigen ({hidden} weitere)
        </Button>
      )}

      <Typography component="figcaption" variant="caption" sx={{ display: 'block', mt: 1, lineHeight: 1.55 }} className="br-note">
        Stündliche Modellwerte über dem Brandzeitfenster; zwischen den beiden roten Marken liegt der
        Zeitraum der Detektionen, davor der Vorlauf. Links steht die Skala der jeweiligen Zeile — die Zeilen
        haben eigene Skalen und sind untereinander nicht vergleichbar. Lücken in einer Linie sind fehlende
        Stunden, keine Nullen. Wind gestrichelt: Böen.
        {index && ' ISI erst nach dem Vorlauf der FFMC-Kette.'}
      </Typography>
    </Box>
  );
}
