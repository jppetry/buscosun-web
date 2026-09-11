/**
 * BH5 — Saisonverlauf gegen die Vorjahre: kumulierte Ereignisse je Saisontag (1.3.–31.10.).
 *
 * Seit dem nivo-Umbau steht die Grafik auf `@nivo/line` (vorher handgerechnetes SVG).
 * Laufende Saison als Linie, Vorjahre als Band (min–max) mit Mittel. Die Zählgrundlage ist
 * DIESELBE wie die Liste (`historySeries.ts`): der Endwert der laufenden Kurve ist die Zahl
 * der Brände im Saison-Index ohne Anlagen-Ereignisse. Jede Zahl, die hier steht, kommt aus
 * der Datei — nichts wird interpoliert.
 *
 * ── Warum das Band eine eigene Ebene ist ────────────────────────────────────────────
 * Ein min–max-Band ist kein Linienpaar: nivo kann eine Fläche nur zwischen einer Serie und
 * dem Achsenboden füllen (`enableArea`), nicht zwischen ZWEI Serien. Die Spanne der Vorjahre
 * als zwei gefüllte Flächen übereinander zu legen ergäbe unterhalb von `min` eine zweite,
 * dunklere Zone, die nichts bedeutet. Also eine eigene Ebene, die aus denselben Skalen ein
 * geschlossenes Polygon zieht — dieselbe Technik, die schon der Vorgänger benutzte, nur
 * ohne die handgerechneten Pixel.
 *
 * ── Warum `linear` und keine weiche Kurve ───────────────────────────────────────────
 * Die Kurve ist **kumulativ** und darf nie fallen. `monotoneX` hielte das ein, `basis` oder
 * `catmullRom` nicht — eine geglättete Kumulative kann zwischen zwei Tagen sinken und damit
 * behaupten, ein gezähltes Ereignis sei zurückgenommen worden. Linear sagt genau das, was
 * gezählt wurde.
 */
import { useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import { ResponsiveLine } from '@nivo/line';
import { compareToReference, type SeasonSeriesFile, type SeriesCountry } from './history/historySeries';
import { SEASON_FROM_MONTH } from './history/historyEvents';
import { nivoTheme } from './charts/nivoTheme';

export interface HistoryChartProps {
  file: SeasonSeriesFile;
  country?: SeriesCountry;
  compact?: boolean;
}

/** Was eine eigene nivo-Ebene an Skalen und Maßen bekommt. */
interface LayerCtx {
  xScale: (v: number) => number;
  yScale: (v: number) => number;
  innerHeight: number;
  series: readonly { id: string | number; color: string; data: readonly { position: { x: number | null; y: number | null } }[] }[];
  lineGenerator: (points: readonly { x: number | null; y: number | null }[]) => string | null;
}

const MONTH_TICKS = ['Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt'];
const de = (n: number, frac = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });

function monthStartDays(year: number): number[] {
  const out: number[] = [];
  const from = Date.UTC(year, SEASON_FROM_MONTH - 1, 1);
  for (let m = SEASON_FROM_MONTH; m <= 10; m++) out.push(Math.round((Date.UTC(year, m - 1, 1) - from) / 86_400_000));
  return out;
}

export function FireHistoryChart({ file, country = 'DACH', compact = false }: HistoryChartProps) {
  const t = useTheme();
  const theme = useMemo(() => nivoTheme(t), [t]);
  const H = compact ? 140 : 158;
  const cur = file.seasons.find((s) => !s.complete) ?? null;
  const ref = file.reference;
  const cmp = compareToReference(file, country);
  const n = file.days;

  const yMax = useMemo(() => {
    let m = 1;
    for (const s of file.seasons) for (const v of s.cumulative[country]) if (v != null && v > m) m = v;
    return m;
  }, [file, country]);

  const ticks = monthStartDays(cur?.year ?? file.seasons[file.seasons.length - 1]?.year ?? 2026);
  const label = cur ? `Saison ${cur.year}` : 'Saison';

  const bandColor = t.palette.fire.hatch;
  const meanColor = t.palette.text.disabled;
  const curColor = t.palette.fire.extreme;

  /** Die Spanne der Vorjahre als geschlossenes Polygon (siehe Kopf). */
  const BandLayer = ({ xScale, yScale }: LayerCtx) => {
    if (!ref) return null;
    const top = ref.max[country].map((v, i) => `${xScale(i)},${yScale(v)}`);
    const bottom = [...ref.min[country]].map((v, i) => `${xScale(i)},${yScale(v)}`).reverse();
    return <polygon points={[...top, ...bottom].join(' ')} fill={bandColor} fillOpacity={0.55} />;
  };

  /**
   * Die Linien — eigene Ebene statt nivos `'lines'`, weil nivo den Serien-`<path>` ohne
   * Kennung ins DOM schreibt: das Mittel der Vorjahre wäre über CSS nur per `:nth-of-type`
   * zu treffen, also über die Reihenfolge einer fremden Implementierung. Bricht die Wette,
   * sähen laufende Saison und Vorjahresmittel gleich aus — und die Bildunterschrift
   * („gestrichelt = Mittel") wäre eine Falschaussage.
   */
  const LinesLayer = ({ series: ser, lineGenerator }: LayerCtx) => (
    <g>
      {ser.map((s) => {
        const d = lineGenerator(s.data.map((p) => p.position));
        if (!d) return null;
        const isMean = String(s.id) !== label;
        return (
          <path
            key={s.id} d={d} fill="none" stroke={s.color}
            strokeWidth={isMean ? 1.2 : 2}
            strokeDasharray={isMean ? '3 2' : undefined}
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );

  /** Der Stand der laufenden Saison — ein Punkt, kein Marker auf jedem Tag. */
  const NowDot = ({ xScale, yScale }: LayerCtx) =>
    cmp ? <circle cx={xScale(cmp.day)} cy={yScale(cmp.value)} r={3.5} fill={curColor} stroke={t.palette.background.paper} strokeWidth={1} /> : null;

  // `null` bleibt `null` — ein Saisontag ohne Zahl ist eine Lücke, keine Null.
  const series = [
    ...(ref ? [{
      id: 'Mittel der Vorjahre', color: meanColor,
      data: ref.mean[country].map((v, i) => ({ x: i, y: v })),
    }] : []),
    ...(cur ? [{
      id: label, color: curColor,
      data: cur.cumulative[country].map((v, i) => ({ x: i, y: v })),
    }] : []),
  ];

  return (
    <figure className="br-history-chart" aria-label={`Saisonverlauf ${label} gegen die Vorjahre`} style={{ margin: 0 }}>
      {/* Breite UND Höhe müssen hier stehen: nivo misst seinen Platz am Container. */}
      <div style={{ width: '100%', height: H }}>
        <ResponsiveLine
          theme={theme}
          data={series}
          colors={{ datum: 'color' }}
          margin={{ left: 38, right: 10, top: 10, bottom: 24 }}
          xScale={{ type: 'linear', min: 0, max: n - 1 }}
          yScale={{ type: 'linear', min: 0, max: yMax }}
          curve="linear"
          animate={false}
          enablePoints={false}
          enableGridX={false}
          gridYValues={[0, Math.round(yMax / 2), yMax]}
          isInteractive={false}
          enableSlices={false}
          enableArea={false}
          lineWidth={2}
          axisTop={null}
          axisRight={null}
          axisLeft={{ tickSize: 0, tickPadding: 6, tickValues: [0, Math.round(yMax / 2), yMax], format: (v) => de(Number(v)) }}
          axisBottom={{
            tickSize: 0, tickPadding: 7, tickValues: ticks,
            format: (v) => MONTH_TICKS[ticks.indexOf(Number(v))] ?? '',
          }}
          layers={[BandLayer as never, 'grid', 'axes', LinesLayer as never, NowDot as never]}
        />
      </div>
      <figcaption className="br-note">
        {cmp ? (
          <>
            <strong>{label}</strong> bis zum Stand: <strong>{de(cmp.value)}</strong> Ereignisse — Vorjahre {cmp.years[0]}–{cmp.years[cmp.years.length - 1]} am selben Saisontag im Mittel {de(cmp.mean)} (Spanne {de(cmp.min)}–{de(cmp.max)}).
          </>
        ) : (
          <>Keine laufende Saison in der Datei — Band und Mittel zeigen die Vorjahre.</>
        )}
        {' '}Rote Linie = laufende Saison, gestrichelt = Mittel, Band = Spanne der Vorjahre. Ohne Anlagen-Ereignisse. {file.limits[0]} {file.limits[1]}
      </figcaption>
    </figure>
  );
}
