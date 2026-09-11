/**
 * BDE-E — das **Brandprofil** als Radar-Netz auf `@nivo/radar`.
 *
 * ── Warum nivo und nicht wieder ein handgezeichnetes SVG ────────────────────────────
 * Weil nivo seit dem 09.09. die Haus-Bibliothek des Brandradars ist (`@nivo/line` trägt
 * D1/D2, D4 und BH5) und `@nivo/radar` dabei **keine einzige neue Abhängigkeit** mitbringt:
 * `core`, `colors`, `legends`, `text`, `theming`, `tooltip`, `d3-scale`, `d3-shape` und
 * `@react-spring/web` liegen alle schon über `@nivo/line` im Baum. Ein zweites handgebautes
 * Polar-SVG neben der Windrose wäre hier also teurer in Pflege und billiger in nichts.
 *
 * ── Was das Netz behauptet, und was nicht ───────────────────────────────────────────
 * Jede Achse ist ein **Perzentilrang**, keine Messgröße: der Wert zur Brandstunde gegen
 * dieselbe Tageszeit der 30 Tage davor an genau diesem Punkt (`fireProfile.ts`). Damit
 * bedeuten alle sechs Achsen dasselbe und dürfen zu EINER Fläche verbunden werden — die
 * übliche Radar-Sünde (sechs willkürliche Skalen, eine Form, die bedeutsam aussieht) ist
 * genau dadurch vermieden. Drei Dinge hält die Darstellung deshalb fest:
 *
 *   • `maxValue` ist **fest 100**, nie `'auto'`. Bei `'auto'` skalierte nivo auf den größten
 *     vorhandenen Rang — ein Brand mit lauter unauffälligen Werten bekäme dieselbe große
 *     Fläche wie ein Extremfall, nur mit anderer Achsenbeschriftung. Das wäre die stille
 *     Falschaussage, gegen die die Ehrlichkeitsregel steht.
 *   • Die Beschriftung nennt **Rohwert und Rang** (`22 % · P92`), nicht nur den Rang. Der
 *     Rang allein ist ortsrelativ und für sich genommen nicht nachprüfbar.
 *   • Achsen **ohne** Rang (zu wenige Vergleichsstunden, fehlender Wert) stehen auf 0 und
 *     tragen im Label ein „—". Sie werden nicht weggelassen: eine fehlende Achse würde die
 *     Form verändern und damit eine andere Aussage machen.
 *
 * In einer schmalen Spalte (< `NARROW_PX`, im Dossier der Regelfall: die Karten stehen dort
 * in ~250 px) trägt das Netz nur die Achsennamen; Rohwert und Rang wandern in eine Liste
 * darunter. Am Netz abgeschnittene Zahlen wären schlimmer als gar keine — und die Liste ist
 * für Screenreader ohnehin die bessere Form.
 *
 * Der Referenzring bei P50 ist als eigene Ebene gezeichnet und heißt in der Legende
 * „üblich für diesen Ort" — ohne ihn hat der Leser keinen Anhalt, ab wann „weit außen"
 * beginnt.
 *
 * ── Warum `Radar` und nicht `ResponsiveRadar` ───────────────────────────────────────
 * `ResponsiveRadar` misst seinen Behälter selbst — und lag im Dossier daneben: gemessen
 * zeichnete es ein 208 px breites SVG, setzte die Achsenbeschriftung aber für eine breitere
 * Fläche und damit **außerhalb** des SVG (Befund: „Temp" 31 px hinter der rechten Kante).
 * Die Karte steht in einer Spalte, die nach dem ersten Rendern noch schmaler wird; die
 * Neumessung kam nicht mehr bei den Beschriftungen an. Hier wird die Breite deshalb EINMAL
 * selbst gemessen (ResizeObserver) und als feste Zahl gereicht — Zeichenfläche und Geometrie
 * können dann nicht mehr auseinanderlaufen.
 *
 * Keine Hex-Farbe in dieser Datei: alles aus `theme.palette`.
 */
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Radar } from '@nivo/radar';
import type { GridLabelProps, RadarCustomLayerProps } from '@nivo/radar';
import { animated } from '@react-spring/web';
import { SVG_FONT } from '../../theme/buscosunTheme';
import { nivoTheme } from '../charts/nivoTheme';
import { axisRankText, axisValueText, type FireProfile, type ProfileAxis } from '../detail/fireProfile';

/** Der Ring, an dem „üblich" steht — der Median der Vergleichsstunden. */
export const REFERENCE_PCT = 50;
/**
 * Unter dieser Breite (px) greift die schmale Fassung: Kurzbeschriftung und kleinere Ränder.
 * Maßgeblich ist die Breite des BEHÄLTERS, nicht die des Fensters — das Dossier stellt seine
 * Karten auf dem Desktop in eine Spalte von ~250 px, `useDossierBreakpoint()` meldet dort
 * trotzdem `desktop`. Genau daran ist die erste Fassung gescheitert: die Achsen wurden am
 * Rand abgeschnitten („chte · P91"), weil die Ränder für 380 px gerechnet waren.
 */
export const NARROW_PX = 330;
/** Höhe des Netzes; die Breite misst nivo an der Karte. */
const H = 268;
const H_NARROW = 244;

export interface FireProfileChartProps {
  profile: FireProfile;
  /** Schmale Spalte (Sheet/mobil) — kleineres Netz, kürzere Beschriftung. */
  compact?: boolean;
}

interface Row extends Record<string, unknown> {
  axis: string;
  rang: number;
  /** Für Beschriftung und Tooltip mitgeführt, nicht gezeichnet. */
  raw: string;
  rank: string;
  hasRank: boolean;
}

/**
 * Zweizeilige Achsenbeschriftung: Name, darunter Rohwert und Rang. nivos Standard-Label
 * kann nur eine Zeile, und der Rohwert gehört ans Netz — nicht nur in einen Tooltip, den
 * auf einem Touchgerät niemand öffnet.
 */
function gridLabel(rows: readonly Row[], narrow: boolean, colors: { name: string; sub: string }) {
  /**
   * **Kein `x`/`y` auf den Texten.** nivos `transform` an der Gruppe positioniert bereits;
   * setzt man zusätzlich die Koordinaten aus den Props, addieren sich beide und die
   * Beschriftung landet mit doppeltem Radius außerhalb des SVG (gemessen: 21–35 px hinter
   * der Kante, Achsen ohne Namen). Die Props `x`/`y` sind für Fassungen gedacht, die den
   * `transform` NICHT anwenden — eines von beidem, nie beides.
   */
  return function Label({ id, anchor, animated: a }: GridLabelProps) {
    const row = rows.find((r) => r.axis === id);
    return (
      <animated.g transform={a.transform} style={{ pointerEvents: 'none' }}>
        <text
          textAnchor={anchor} dominantBaseline="central"
          fontFamily={SVG_FONT} fontSize={narrow ? 10 : 10.5} fontWeight={600} fill={colors.name}
        >
          {id}
        </text>
        {!narrow && (
          <text
            y={12} textAnchor={anchor} dominantBaseline="central"
            fontFamily={SVG_FONT} fontSize={9.5} fill={colors.sub}
          >
            {row ? `${row.raw}${row.hasRank ? ` · P${Math.round(row.rang)}` : ' · —'}` : ''}
          </text>
        )}
      </animated.g>
    );
  };
}

/**
 * Der Referenzring bei P50 als eigene Ebene. nivos `gridLevels` zeichnet nur gleichmäßige
 * Ringe ohne Bedeutung; dieser eine trägt eine Aussage und muss sich davon abheben.
 */
function referenceRing(color: string) {
  return function Ring({ centerX, centerY, radiusScale }: RadarCustomLayerProps<Row>) {
    const r = radiusScale(REFERENCE_PCT);
    return (
      <g style={{ pointerEvents: 'none' }}>
        <circle
          cx={centerX} cy={centerY} r={r}
          fill="none" stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={0.9}
        />
      </g>
    );
  };
}

export function FireProfileChart({ profile, compact = false }: FireProfileChartProps) {
  const t = useTheme();
  const box = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  // Vor der ersten Messung gilt `compact` als Vorgabe — sonst blitzte einmal die breite
  // Fassung auf und schöbe das Netz beim Messen um.
  const narrow = w == null ? compact : w < NARROW_PX;
  // Die Ränder wachsen mit der Fläche: unter 330 px trägt das Netz nur Namen (die Zahlen
  // stehen darunter), darüber die zweizeilige Beschriftung — die braucht mehr Platz.
  const pad = narrow ? 40 : 78;
  const height = narrow ? H_NARROW : H;
  const rows: Row[] = profile.axes.map((a: ProfileAxis) => ({
    axis: narrow ? a.short : a.label,
    // Ohne Rang steht die Achse auf 0 — sie verschwindet nicht, sonst änderte sich die Form.
    rang: a.pct ?? 0,
    raw: axisValueText(a),
    rank: axisRankText(a),
    hasRank: a.pct != null,
  }));
  const missing = profile.axes.filter((a) => a.pct == null);
  // Der Tooltip schlägt über die ANGEZEIGTE Beschriftung nach — sie wechselt mit der Breite.
  const byAxis = new Map(profile.axes.map((a) => [narrow ? a.short : a.label, a]));

  return (
    <Box ref={box}>
      <Box sx={{ height, display: 'flex', justifyContent: 'center' }}>
        {w != null && w > 0 && (
        <Radar<Row>
          width={w}
          height={height}
          data={rows}
          keys={['rang']}
          indexBy="axis"
          maxValue={100}
          margin={{ top: 32, right: pad, bottom: 32, left: pad }}
          gridShape="circular"
          gridLevels={4}
          gridLabelOffset={narrow ? 14 : 20}
          gridLabel={gridLabel(rows, narrow, { name: t.palette.text.primary, sub: t.palette.text.disabled })}
          layers={['grid', referenceRing(t.palette.fire.sage), 'layers', 'slices', 'dots']}
          colors={[t.palette.fire.veryHigh]}
          fillOpacity={0.22}
          borderWidth={1.6}
          borderColor={{ from: 'color' }}
          dotSize={7}
          dotColor={t.palette.background.paper}
          dotBorderWidth={1.8}
          dotBorderColor={{ from: 'color' }}
          enableDotLabel={false}
          isInteractive
          animate={false}
          theme={nivoTheme(t)}
          valueFormat={(v) => `P${Math.round(v)}`}
          sliceTooltip={({ index }) => {
            const a = byAxis.get(String(index));
            if (!a) return null;
            return (
              <Box sx={{
                bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2,
                px: 1.2, py: 0.9, maxWidth: 268,
              }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{a.label}</Typography>
                <Typography variant="body2">{axisValueText(a)} — {axisRankText(a)}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.4 }}>
                  {a.note}
                </Typography>
              </Box>
            );
          }}
        />
        )}
      </Box>

      {narrow && (
        <Box
          component="dl"
          sx={{
            display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1, rowGap: 0.25,
            m: 0, mt: 0.5, mb: 0.75,
          }}
        >
          {profile.axes.map((a) => (
            <Box key={a.key} sx={{ display: 'contents' }}>
              <Typography component="dt" variant="caption" sx={{ fontWeight: 600 }}>{a.label}</Typography>
              <Typography component="dd" variant="caption" color="text.secondary" sx={{ m: 0 }}>
                {axisValueText(a)} · {a.pct != null ? `P${Math.round(a.pct)}` : 'kein Rang'}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 0.5, mt: 0.5 }}>
        <Stack direction="row" spacing={0.6} sx={{ alignItems: 'center' }}>
          <Box sx={{
            width: 16, height: 0, borderTop: '1px dashed', borderColor: 'fire.sage', flexShrink: 0,
          }} />
          <Typography variant="caption" color="text.secondary">
            üblich für diesen Ort (P{REFERENCE_PCT})
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.6} sx={{ alignItems: 'center' }}>
          <Box sx={{
            width: 16, height: 10, bgcolor: 'fire.veryHigh', opacity: 0.28,
            border: 1, borderColor: 'fire.veryHigh', borderRadius: 0.5, flexShrink: 0,
          }} />
          <Typography variant="caption" color="text.secondary">
            diese Brandstunde · weiter außen = ungewöhnlicher
          </Typography>
        </Stack>
      </Stack>

      {missing.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.6 }}>
          Ohne Rang und deshalb auf null gezeichnet: {missing.map((a) => a.label).join(', ')}.
          Die Achse bleibt stehen — sie wegzulassen würde die Form und damit die Aussage verändern.
        </Typography>
      )}
    </Box>
  );
}
