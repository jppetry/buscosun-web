/**
 * D1/D2 — **Verlauf eines Brands**: ΣFRP je Überflug als Balken auf log-Achse,
 * Beobachtungslücken > 6 h schraffiert, ☀/☾ je Überflug, „jetzt" als gestrichelte Linie.
 *
 * Seit dem MUI-Umbau steht der Chart auf **MUI X Charts** (`ChartsContainer`): Achsen,
 * Ticks, Gitter, Referenzlinie und die Farben kommen aus dem Theme
 * (`src/theme/buscosunTheme.ts`), nicht mehr aus handgerechneten Pixelabständen.
 *
 * ── Zwei Abweichungen von der Spezifikation, beide erzwungen, beide bewusst ──────────
 *
 * (1) **Die Balken zeichnet diese Datei selbst, nicht `BarPlot`.** MUI X wirft
 *     `checkBarChartScaleErrors`: „Bar charts require a band scale for the category axis."
 *     Eine Band-Achse verteilt die Überflüge GLEICHMÄSSIG — genau das darf dieser Chart
 *     nicht. Seine Kernaussage ist der zeitliche Abstand: „Zwischen zwei Überflügen ist
 *     nichts beobachtet." Auf einer Band-Achse verschwände die 19-h-Lücke zwischen zwei
 *     Nachbarbalken, und die Schraffur (D2) hätte keinen Ort mehr. Also: echte
 *     `time`-Achse, und die Rechtecke liegen über `useXScale()`/`useYScale()` darauf —
 *     dieselbe Technik, die die Spezifikation für die Lücken ohnehin vorsieht.
 *
 * (2) **Die Marken tragen `<title>` statt eines MUI-Tooltips.** Ein MUI-`ChartsTooltip`
 *     braucht `ChartsWrapper` außerhalb des `<svg>` und eine echte Serie; beides gäbe es
 *     für hand gezeichnete Rechtecke nicht. Die Sätze sind wörtlich dieselben wie vorher.
 *
 * Ebenfalls unverändert (Prüfliste §6):
 *  • **log-Achse** + „die Balken sind Messpunkte, keine Kurve" in der Bildunterschrift.
 *  • **Schraffur ab 6 h** (`GAP_HOURS`) und die **längste Lücke** in der Bildunterschrift.
 *  • Ein Überflug **ohne** FRP ist kein Balken der Höhe 0 (das wäre eine Falschaussage),
 *    sondern eine weiße Marke auf dem Achsenboden.
 *  • Jeder eigene SVG-`<text>` trägt `font-family` ausdrücklich (Befund B1) — MUI X setzt
 *    sie nur auf dem `<svg>`-Wrapper seiner eigenen Beschriftungen.
 *
 * Die Rechnung bleibt unangetastet in `detail/passTimeline.ts` (eigener Verifier).
 */
import { useId, useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ChartsContainer } from '@mui/x-charts/ChartsContainer';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import { ChartsGrid } from '@mui/x-charts/ChartsGrid';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { useDrawingArea, useXScale, useYScale } from '@mui/x-charts/hooks';
import type { FirePass } from './activity/overpasses';
import { passTimeline, GAP_HOURS, type PassTimeline } from './detail/passTimeline';
import { SVG_FONT } from '../theme/buscosunTheme';
import { useDossierBreakpoint } from './dossier/DossierPrimitives';

export interface FirePassChartProps {
  passes: readonly FirePass[];
  nowMs: number;
  compact?: boolean;
  /** Dossier-Maß (volle Panelbreite). Schlägt `compact`. */
  wide?: boolean;
  /**
   * OBERGRENZE der Breite im Dossier-Maß. Die Breite selbst misst der Chart an seiner Karte
   * (MUI X sizet ohne `width` per ResizeObserver) — eine feste Zahl je Breakpoint lief auf
   * dem Tablet über den Rand: die Mitte ist dort mit beiden Sidebars nur ~440 px breit.
   */
  wideWidth?: number;
}

const de = (n: number, frac = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });
const stamp = (ms: number) => new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Boden der log-Achse. log(0) ist undefiniert — die Achse braucht eine positive Untergrenze. */
const Y_FLOOR = 0.1;

/*
 * Drei Zeilen unter der Nulllinie, in dieser Reihenfolge und ohne Überschneidung:
 *   y0 … y0+22   die Tages-Ticks der MUI-X-Zeitachse (die Bibliothek setzt sie selbst),
 *   y0+GLYPH_DY  ☀/☾ je Überflug,
 *   y0+STAMP_DY  der genaue Zeitstempel (nur beim ersten einer dichten Gruppe).
 * Vorher standen Glyphen und Achsen-Ticks auf derselben Höhe und schoben sich ineinander.
 */
const GLYPH_DY = 38;
const STAMP_DY = 52;

// ---------------------------------------------------------------------------
// Eigene SVG-Ebenen INNERHALB der MUI-X-Zeichenfläche (Hooks liefern die Skalen)
// ---------------------------------------------------------------------------

/** D2 — Beobachtungslücken: schraffierte Felder zwischen zwei Überflügen bzw. bis „jetzt". */
function GapLayer({ tl, patternId, fontSize }: { tl: PassTimeline; patternId: string; fontSize: number }) {
  const area = useDrawingArea();
  const xScale = useXScale<'time'>();
  const t = useTheme();
  const at = (frac: number) => xScale(new Date(tl.fromMs + frac * (tl.toMs - tl.fromMs))) ?? area.left;
  return (
    <g aria-hidden="true">
      {tl.gaps.map((g, i) => {
        const x0 = at(g.x0);
        const x1 = at(g.x1);
        const w = Math.max(1, x1 - x0);
        const label = g.trailing ? `keine Beobachtung · ${de(g.hours, 0)} h (Nachlauf)` : `keine Beobachtung · ${de(g.hours, 0)} h`;
        return (
          <g key={i}>
            <rect x={x0} y={area.top} width={w} height={area.height} fill={`url(#${patternId})`} opacity={0.7}>
              <title>{g.trailing ? `${de(g.hours, 0)} h seit dem letzten Überflug — keine Beobachtung` : `${de(g.hours, 0)} h ohne Überflug`}</title>
            </rect>
            {w > 110 && (
              <text
                x={x0 + w / 2} y={area.top + area.height / 2} textAnchor="middle" dominantBaseline="middle"
                fontFamily={SVG_FONT} fontSize={fontSize} fill={t.palette.text.disabled}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/**
 * D1 — die Balken. Tag `palette.fire.day`, Nacht `palette.fire.night`. Ein Überflug ohne
 * FRP-Angabe bekommt KEINEN Balken (auch keinen der Höhe 0 — das hieße „0 MW gemessen",
 * und gemessen wurde nichts), sondern eine weiße Marke auf dem Achsenboden.
 */
function BarLayer({ tl, wide, fontSize }: { tl: PassTimeline; wide: boolean; fontSize: number }) {
  const area = useDrawingArea();
  const xScale = useXScale<'time'>();
  const yScale = useYScale<'log'>();
  const t = useTheme();
  const y0 = yScale(Y_FLOOR) ?? area.top + area.height;

  // Beschriftungen entzerren: bei drei Satelliten in 20 Minuten trägt nur der erste einer
  // Gruppe Zeitstempel und Tag/Nacht-Zeichen, die MW-Zahl nur, wenn sie nicht in die
  // Y-Achsenbeschriftung läuft. (Die Achsen-Ticks entzerrt MUI X selbst.)
  const px = (ms: number) => xScale(new Date(ms)) ?? area.left;
  const stampAt = new Set<string>(); const mwAt = new Set<string>(); const glyphAt = new Set<string>();
  if (wide) {
    let ls = -1e9; let lm = -1e9; let lg = -1e9;
    for (const b of tl.bars) {
      const x = px(b.atMs);
      if (x - ls >= 76) { stampAt.add(b.key); ls = x; }
      if (b.hasFrp && x - lm >= 34 && x >= area.left + 12) { mwAt.add(b.key); lm = x; }
      if (x - lg >= 14) { glyphAt.add(b.key); lg = x; }
    }
  }
  /*
   * Balkenbreite. Auf einer ECHTEN Zeitachse liegen Überflüge unregelmäßig: fünf Nacht-
   * überflüge innerhalb einer Stunde stehen 4 px auseinander, der nächste 11 h später.
   * Eine feste Breite ließe die dichte Gruppe zu einem Block verschmelzen — man sähe einen
   * breiten Balken statt fünf Messpunkten. Deshalb deckelt der kleinste Abstand die Breite.
   */
  const gaps = tl.bars.slice(1).map((b, i) => px(b.atMs) - px(tl.bars[i].atMs)).filter((g) => g > 0);
  const tightest = gaps.length > 0 ? Math.min(...gaps) : Infinity;
  const bw = Math.max(wide ? 4 : 2, Math.min(wide ? 22 : 9, area.width / Math.max(12, tl.bars.length * 2.5), tightest * 0.8));

  return (
    <g>
      {tl.bars.map((b) => {
        const x = px(b.atMs);
        if (!b.hasFrp) {
          return (
            <g key={b.key}>
              <circle cx={x} cy={y0 - 4} r={wide ? 3.2 : 2.4} fill="#FFFFFF" stroke={t.palette.text.disabled} strokeWidth={1}>
                <title>{`${stamp(b.atMs)} · ${b.satellite} · ${b.pixels} Px ohne FRP-Angabe`}</title>
              </circle>
              {(!wide || glyphAt.has(b.key)) && (
                <text x={x} y={y0 + GLYPH_DY} textAnchor="middle" fontFamily={SVG_FONT} fontSize={wide ? 12 : 7.5} fill={t.palette.text.secondary}>
                  {b.day === false ? '☾' : b.day === true ? '☀' : ''}
                </text>
              )}
            </g>
          );
        }
        const yTop = yScale(Math.max(Y_FLOOR, b.frpMw)) ?? y0;
        return (
          <g key={b.key}>
            <rect
              x={x - bw / 2} y={yTop} width={bw} height={Math.max(1, y0 - yTop)}
              fill={b.day === false ? t.palette.fire.night : t.palette.fire.day} rx={wide ? 2 : 1}
            >
              <title>{`${stamp(b.atMs)} · ${b.satellite} ${b.day === false ? '☾ Nacht' : '☀ Tag'} · ${de(b.frpMw)} MW · ${b.pixels} Px`}</title>
            </rect>
            {wide && mwAt.has(b.key) && (
              <text x={x} y={yTop - 5} textAnchor="middle" fontFamily={SVG_FONT} fontSize={fontSize} fill={t.palette.text.secondary}>{de(b.frpMw)} MW</text>
            )}
            {(!wide || glyphAt.has(b.key)) && (
              <text x={x} y={y0 + GLYPH_DY} textAnchor="middle" fontFamily={SVG_FONT} fontSize={wide ? 12 : 7.5} fill={t.palette.text.secondary}>
                {b.day === false ? '☾' : b.day === true ? '☀' : ''}
              </text>
            )}
            {wide && stampAt.has(b.key) && (
              <text x={x} y={y0 + STAMP_DY} textAnchor="middle" fontFamily={SVG_FONT} fontSize={fontSize} fill={t.palette.text.disabled}>{stamp(b.atMs)}</text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export function FirePassChart({ passes, nowMs, compact = false, wide = false, wideWidth = 380 }: FirePassChartProps) {
  const tl = useMemo(() => passTimeline(passes, nowMs), [passes, nowMs]);
  const patternId = `fp-hatch-${useId().replace(/:/g, '')}`;
  const t = useTheme();
  // Ohne Provider (Historie) gilt 'desktop' — dort ist der Chart ohnehin im breiten Maß.
  const bp = useDossierBreakpoint();
  if (!tl) return null;

  // `undefined` = MUI X misst die Karte selbst. `wideWidth` bleibt die Obergrenze am <figure>.
  const width = wide ? undefined : compact ? 300 : 380;
  // Auf 390 px stünde ein 220 px hoher Chart über einem Drittel des Bildes; 180 reicht für
  // drei Dekaden der log-Achse (§4).
  const height = wide ? (bp === 'mobile' ? 180 : 220) : 130;
  const fontSize = wide ? 12 : 9;
  // Platz unten für Tag/Nacht-Zeichen + Zeitstempel + Achse; links für „100 MW".
  const margin = { left: 6, right: wide ? 30 : 12, top: 18, bottom: wide ? STAMP_DY + 10 : 30 };
  const nowInside = nowMs >= tl.fromMs && nowMs <= tl.toMs;

  return (
    <Box
      component="figure"
      /*
       * Der Chart braucht einen NAMEN: MUI X gibt seiner Zeichenfläche keinen. KEIN
       * `role="img"` — das machte den ganzen Teilbaum präsentational, während MUI X darin
       * eigene fokussierbare `role="none"`-Elemente für die Tastatur hält; die wären dann
       * anspringbar, aber unbenannt. Ein `<figure>` mit Namen benennt die Gruppe und lässt
       * die Bildunterschrift und die Tastatur-Ziele darin sichtbar.
       */
      aria-label="Feuerstrahlungsleistung je Überflug"
      sx={{ m: 0, maxWidth: wide ? wideWidth : undefined }}
      className={`br-pass-chart${wide ? ' is-wide' : ''}`}
    >
      <ChartsContainer
        width={width}
        height={height}
        margin={margin}
        series={[]}
        xAxis={[{
          id: 'zeit', scaleType: 'time', min: new Date(tl.fromMs), max: new Date(tl.toMs),
          // Deklarativ statt handgerechnet: MUI X entzerrt die Tages-Ticks selbst.
          tickNumber: wide ? 5 : 3,
          valueFormatter: (v: Date) => v.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
          disableLine: false,
        }]}
        yAxis={[{
          id: 'frp', scaleType: 'log', min: Y_FLOOR, max: Math.max(1, tl.yMaxMw) * 1.6,
          label: wide ? 'ΣFRP (MW)' : undefined, width: wide ? 64 : 40, labelStyle: { fontSize: 11 },
          // NUR Zehnerpotenzen. MUI X setzt auf einer log-Achse sonst auch 2/3/5 je Dekade —
          // acht Marken auf 160 px, die sich überlagern und nichts hinzufügen. Die Aussage
          // der Achse ist die Größenordnung, nicht der Zwischenwert.
          tickInterval: (v: number) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9,
          valueFormatter: (v: number) => (v >= 1 ? de(v, 0) : de(v, 1)),
        }]}
        sx={{ '& text': { fontFamily: SVG_FONT }, '& .MuiChartsAxis-label': { fontSize: fontSize + 0.5 } }}
      >
        <defs>
          <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={t.palette.fire.hatch} strokeWidth="1.4" />
          </pattern>
        </defs>
        <ChartsGrid horizontal />
        <GapLayer tl={tl} patternId={patternId} fontSize={fontSize} />
        <BarLayer tl={tl} wide={wide} fontSize={fontSize} />
        <ChartsXAxis axisId="zeit" />
        <ChartsYAxis axisId="frp" />
        {nowInside && (
          <ChartsReferenceLine
            axisId="zeit" x={new Date(nowMs)} label={wide ? 'jetzt' : undefined} labelAlign="start"
            lineStyle={{ strokeDasharray: '4 4', stroke: t.palette.fire.extreme, strokeWidth: wide ? 1.5 : 1 }}
            labelStyle={{ fill: t.palette.fire.extreme, fontSize, fontFamily: SVG_FONT }}
          />
        )}
      </ChartsContainer>
      <Typography component="figcaption" variant="caption" sx={{ display: 'block', mt: 1, lineHeight: 1.55 }} className="br-note">
        ΣFRP je Überflug (log-Achse, MW) · <Box component="span" sx={{ color: 'fire.day' }}>■</Box> Tag ·{' '}
        <Box component="span" sx={{ color: 'fire.night' }}>■</Box> Nacht · ○ Überflug ohne FRP-Angabe ·
        {' '}schraffiert: mehr als {GAP_HOURS} h ohne Überflug (längste Lücke {de(tl.maxGapH, 0)} h) · gestrichelt: jetzt.
        {' '}Zwischen zwei Überflügen ist nichts beobachtet — die Balken sind Messpunkte, keine Kurve.
      </Typography>
    </Box>
  );
}
