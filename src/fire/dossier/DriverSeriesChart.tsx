/**
 * D4 — **Treiber-Zeitreihe im Brandzeitfenster** auf **nivo** (`@nivo/line`).
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
 * Fünf getrennte Charts teilen sich KEINEN Tooltip — bei nivo so wenig wie zuvor bei
 * MUI X: jeder Chart hat seinen eigenen Datenkontext. Statt das zu umgehen, führt diese
 * Datei den Zeitpunkt selbst: ein `pointermove` über dem Stapel bestimmt die Stunde,
 * jede Zeile bekommt sie als eigene Ebene (`MarkerLayer`), und ÜBER dem Stapel steht eine
 * Ablesezeile mit ALLEN fünf Werten dieser Stunde. Das ist mehr als ein Tooltip je Zeile —
 * man sieht Wind, Feuchte und ISI derselben Stunde gleichzeitig. Fehlt ein Wert, steht
 * dort „—", nie eine Null. Deshalb bleiben nivos eigene Tooltips und Slices **aus**.
 *
 * ── Die Zusage, die nicht fallen darf ────────────────────────────────────────────────
 * Ein `y: null` ist bei nivo eine **Lücke** in der Linie, kein verbundener Punkt — das ist
 * dieselbe Zusage, die vorher `connectNulls: false` trug: „Stunden ohne Wert sind Lücken in
 * der Linie, keine Nullen." Deshalb wird ein fehlender Wert als `null` durchgereicht und
 * **nie** herausgefiltert; ein Filter zöge genau die Gerade, die `connectNulls: true` zöge.
 *
 * ── Warum die Kurve `linear` bleibt ──────────────────────────────────────────────────
 * nivo kann `monotoneX`, und es sähe glatter aus. Zwischen zwei Stundenwerten ist aber
 * nichts gemessen; eine weiche Kurve behauptete einen Verlauf, den niemand kennt — und
 * überschwänge an einer Böenspitze. Modern ist hier die Fläche unter der Linie (Verlauf
 * aus der Zeilenfarbe), nicht die geglättete Linie.
 *
 * Alle Zeilen teilen dieselbe X-Domäne und dieselben Ränder — nur so stehen die fünf
 * Felder übereinander wirklich untereinander.
 */
import { useId, useMemo, useRef, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { ResponsiveLine } from '@nivo/line';
import type { FireWeatherHour } from '../detail/fireWeatherAtPoint';
import type { FireIndexSeries } from '../detail/fireDrivers';
import { nivoTheme } from '../charts/nivoTheme';
import { useDossierBreakpoint } from './DossierPrimitives';

export interface DriverSeriesChartProps {
  hours: readonly FireWeatherHour[];
  /** `[von, bis]` der Detektionen — wird in JEDER Zeile hinterlegt. */
  detectionRange: [number, number] | null;
  index: FireIndexSeries | null;
  /** Obergrenze der Breite; die Breite selbst misst nivos `ResponsiveLine` an der Karte. */
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

/** Was eine eigene nivo-Ebene an Skalen und Maßen bekommt. */
interface LayerCtx {
  xScale: (v: Date) => number;
  yScale: (v: number) => number;
  innerWidth: number;
  innerHeight: number;
  series: readonly { id: string | number; color: string; data: readonly { position: { x: number | null; y: number | null } }[] }[];
  lineGenerator: (points: readonly { x: number | null; y: number | null }[]) => string | null;
}

/**
 * Die Linien selbst — eigene Ebene statt nivos `'lines'`.
 *
 * nivos Linien-Ebene zeichnet je Serie ein `<path>` OHNE Kennung im DOM (kein `id`, kein
 * `data-*`); die Reihenfolge ist zudem umgekehrt. Die Böen über einen `:nth-of-type`
 * anzusprechen wäre eine Wette auf ein Implementierungsdetail — bricht sie, sind Wind und
 * Böen dieselbe Linie und die Grafik behauptet, es gäbe keine Böen. Die Ebene bekommt
 * `series` und `lineGenerator` ohnehin gereicht, also entscheidet die Serien-Kennung hier
 * direkt über den Strich.
 */
function LinesLayer({ series, lineGenerator, dashedId }: LayerCtx & { dashedId?: string }) {
  return (
    <g>
      {series.map((s) => {
        const d = lineGenerator(s.data.map((p) => p.position));
        if (!d) return null;
        const dashed = dashedId != null && String(s.id) === dashedId;
        return (
          <path
            key={s.id} d={d} fill="none" stroke={s.color}
            strokeWidth={dashed ? 1 : 1.6}
            strokeDasharray={dashed ? '4 3' : undefined}
            opacity={dashed ? 0.55 : 1}
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
}

const PAD_L = 46;
const PAD_R = 40;
const ROW_H = 66;
const AXIS_H = 26;

const de = (n: number, frac = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });

export function DriverSeriesChart({ hours, detectionRange, index, width = 380 }: DriverSeriesChartProps) {
  const t = useTheme();
  const bp = useDossierBreakpoint();
  const uid = useId().replace(/[:]/g, '');
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

  const theme = useMemo(() => nivoTheme(t), [t]);

  if (hours.length < 2 || rows.length === 0) return null;

  const t0 = hours[0].atMs;
  const t1 = hours[hours.length - 1].atMs;

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

  const band = detectionRange
    ? ([Math.max(detectionRange[0], t0), Math.min(detectionRange[1], t1)] as [number, number])
    : null;

  /**
   * Detektionsspanne + Zeiger — in JEDER Zeile dieselben Marken.
   * Eigene nivo-Ebene statt einer Referenzlinien-Komponente: nivo hat keine, und eine
   * Ebene bekommt `xScale` ohnehin, also entfällt jede zweite Pixelrechnung.
   */
  const MarkerLayer = ({ xScale, innerHeight }: LayerCtx) => (
    <g aria-hidden="true">
      {band && band[1] > band[0] && [band[0], band[1]].map((ms, i) => (
        <line
          key={`b${i}`} x1={xScale(new Date(ms))} x2={xScale(new Date(ms))} y1={0} y2={innerHeight}
          stroke={t.palette.fire.extreme} strokeWidth={1} opacity={0.45}
        />
      ))}
      {hoverMs != null && (
        <line
          x1={xScale(new Date(hoverMs))} x2={xScale(new Date(hoverMs))} y1={0} y2={innerHeight}
          stroke={t.palette.text.disabled} strokeWidth={1} strokeDasharray="3 3"
        />
      )}
    </g>
  );

  /**
   * Die Regenbalken auf DERSELBEN Zeitskala wie die vier Linienzeilen.
   * Eine Linie zwischen zwei Regenstunden behauptete Regen dazwischen; eine Band-Achse
   * (die jede fertige Balken-Komponente verlangt) verteilte die Stunden gleichmäßig und
   * verschöbe diese eine Zeile gegen die anderen vier — der geteilte Zeiger zeigte dann
   * hier auf die falsche Stunde. Eine Stunde ohne Wert bekommt KEINEN Balken: sie ist eine
   * Lücke, kein trockener Balken.
   */
  const precipBars = (color: string) => function PrecipBars({ xScale, yScale, innerWidth, innerHeight }: LayerCtx) {
    const bw = Math.max(1.6, Math.min(6, innerWidth / Math.max(12, hours.length * 1.6)));
    return (
      <g>
        {hours.map((h) => {
          if (h.precipMm == null || h.precipMm <= 0) return null;
          const x = xScale(new Date(h.atMs));
          const y = yScale(h.precipMm);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return (
            <rect key={h.atMs} x={x - bw / 2} y={y} width={bw} height={Math.max(0.8, innerHeight - y)} fill={color} opacity={0.75} rx={0.8}>
              <title>{`${new Date(h.atMs).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit' })} · ${de(h.precipMm, 1)} mm`}</title>
            </rect>
          );
        })}
      </g>
    );
  };

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

      <Box ref={boxRef} onPointerMove={onMove} onPointerLeave={() => setHoverMs(null)}>
        <Stack spacing={0}>
          {shown.map((r, i) => {
            const last = i === shown.length - 1;
            const vals = r.values.filter((v): v is number => v != null);
            const secVals = r.second?.values.filter((v): v is number => v != null) ?? [];
            const lo = r.min ?? Math.min(...vals);
            const hiRaw = r.max ?? Math.max(...vals, ...secVals);
            const hi = hiRaw > lo ? hiRaw : lo + 1;
            const height = rowH + (last ? AXIS_H : 0);
            const gradId = `drv${uid}${r.key}`;

            // `null` bleibt `null` — das IST die Lücke (siehe Kopf).
            const series = r.bars
              // Die Regenzeile trägt keine Linie; die Serie spannt nur die Skala auf, gezeichnet
              // wird sie nicht (die Ebene `lines` fehlt in ihrer `layers`-Liste).
              ? [{ id: r.label, color: r.color, data: [{ x: new Date(t0), y: lo }, { x: new Date(t1), y: hi }] }]
              : [
                  { id: r.label, color: r.color, data: hours.map((h, k) => ({ x: new Date(h.atMs), y: r.values[k] })) },
                  ...(r.second
                    ? [{
                        id: r.second.label, color: r.color,
                        data: hours.map((h, k) => ({ x: new Date(h.atMs), y: r.second!.values[k] })),
                      }]
                    : []),
                ];

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
                <Box
                  sx={{
                    height,
                    '@media (prefers-reduced-motion: reduce)': { '& *': { transition: 'none !important' } },
                  }}
                >
                  <ResponsiveLine
                    theme={theme}
                    data={series}
                    colors={{ datum: 'color' }}
                    margin={{ left: PAD_L, right: PAD_R, top: 8, bottom: last ? AXIS_H : 4 }}
                    xScale={{ type: 'time', min: new Date(t0), max: new Date(t1), useUTC: false, precision: 'hour' }}
                    yScale={{ type: 'linear', min: lo, max: hi }}
                    curve="linear"
                    // Messpunkte, keine Kurve: keine Einblendung, keine Punkte, keine Legende.
                    animate={false}
                    enablePoints={false}
                    enableGridX={false}
                    gridYValues={2}
                    isInteractive={false}
                    enableSlices={false}
                    enableArea={!r.bars}
                    areaOpacity={1}
                    lineWidth={1.6}
                    axisTop={null}
                    axisRight={null}
                    axisLeft={{
                      tickSize: 0, tickPadding: 6, tickValues: 2,
                      format: (v) => `${de(Number(v), hi - lo < 5 ? 1 : 0)}${r.unit ? ` ${r.unit}` : ''}`,
                    }}
                    axisBottom={last
                      ? {
                          tickSize: 0, tickPadding: 8, tickValues: bp === 'mobile' ? 2 : 4,
                          format: (v) => (v as Date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
                        }
                      : null}
                    /*
                     * Die Fläche gehört NUR der Hauptgröße. Am Bild gemessen: füllt die
                     * Böen-Serie mit, liegt über der Wind-Zeile eine Fläche bis zur
                     * Böenspitze — die Zeile liest sich dann, als läge der WIND bei
                     * 40–60 km/h. Die Böen sind eine gestrichelte Linie, keine zweite
                     * Menge. Deshalb ein zweiter, vollständig durchsichtiger Verlauf für
                     * sie: `enableArea` gilt je Chart, nicht je Serie.
                     */
                    defs={[
                      {
                        id: gradId, type: 'linearGradient',
                        colors: [{ offset: 0, color: r.color, opacity: 0.28 }, { offset: 100, color: r.color, opacity: 0 }],
                      },
                      {
                        id: `${gradId}none`, type: 'linearGradient',
                        colors: [{ offset: 0, color: r.color, opacity: 0 }, { offset: 100, color: r.color, opacity: 0 }],
                      },
                    ]}
                    fill={r.second
                      ? [{ match: { id: r.second.label }, id: `${gradId}none` }, { match: '*', id: gradId }]
                      : [{ match: '*', id: gradId }]}
                    layers={r.bars
                      ? ['grid', 'axes', precipBars(r.color) as never, MarkerLayer as never]
                      : [
                          'grid', 'axes', 'areas',
                          // Die Böen sind dieselbe Größe in derselben Skala — gestrichelt, nicht zweifarbig.
                          ((p: LayerCtx) => <LinesLayer {...p} dashedId={r.second?.label} />) as never,
                          MarkerLayer as never,
                        ]}
                  />
                </Box>
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
