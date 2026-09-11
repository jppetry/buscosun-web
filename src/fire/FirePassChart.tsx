/**
 * D1/D2 — **Verlauf eines Brands**: ΣFRP je Überflug als Balken auf log-Achse,
 * Beobachtungslücken > 6 h schraffiert, ☀/☾ je Überflug, „jetzt" als gestrichelte Linie.
 *
 * Seit dem nivo-Umbau stellt **`@nivo/line`** die Zeichenfläche: Achsen, Ticks, Gitter und
 * die beiden Skalen (Zeit · log) kommen von dort, die Farben aus dem Theme
 * (`src/theme/buscosunTheme.ts`) — nicht mehr aus handgerechneten Pixelabständen.
 *
 * ── Warum `@nivo/line` und nicht `@nivo/bar` ────────────────────────────────────────
 * Aus demselben Grund, aus dem hier zuvor kein `BarPlot` stand: **jede** fertige
 * Balken-Komponente — nivos wie MUI X' — verlangt eine **Band**-Achse für die Kategorie.
 * Eine Band-Achse verteilt die Überflüge GLEICHMÄSSIG, und genau das darf dieser Chart
 * nicht. Seine Kernaussage ist der zeitliche Abstand: „Zwischen zwei Überflügen ist nichts
 * beobachtet." Auf einer Band-Achse verschwände die 19-h-Lücke zwischen zwei Nachbarbalken,
 * und die Schraffur (D2) hätte keinen Ort mehr. Also eine echte `time`-Achse, und die
 * Rechtecke liegen als eigene nivo-Ebene über deren Skalen — dieselbe Technik, die die
 * Spezifikation für die Lücken ohnehin vorsieht. `@nivo/bar` ist deshalb bewusst **keine**
 * Abhängigkeit dieses Projekts.
 *
 * Die Serie in `data` wird nie gezeichnet (die Ebene `'lines'` fehlt in `layers`); sie
 * spannt nur die beiden Skalen auf, denn nivo leitet die Domäne aus den Daten ab.
 *
 * ── Die Marken tragen `<title>` statt eines Tooltips ────────────────────────────────
 * nivos Tooltip hängt an `points` einer echten Serie; für hand gezeichnete Rechtecke gäbe
 * es die nicht. Die Sätze sind wörtlich dieselben wie vorher.
 *
 * Ebenfalls unverändert (Prüfliste §6):
 *  • **log-Achse** + „die Balken sind Messpunkte, keine Kurve" in der Bildunterschrift.
 *  • **Schraffur ab 6 h** (`GAP_HOURS`) und die **längste Lücke** in der Bildunterschrift.
 *  • Ein Überflug **ohne** FRP ist kein Balken der Höhe 0 (das wäre eine Falschaussage),
 *    sondern eine weiße Marke auf dem Achsenboden.
 *  • Jeder eigene SVG-`<text>` trägt `font-family` ausdrücklich (Befund B1) — die
 *    Bibliothek setzt sie nur auf ihren eigenen Beschriftungen.
 *
 * Die Rechnung bleibt unangetastet in `detail/passTimeline.ts` (eigener Verifier).
 */
import { useId, useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ResponsiveLine } from '@nivo/line';
import type { FirePass } from './activity/overpasses';
import { passTimeline, GAP_HOURS } from './detail/passTimeline';
import { SVG_FONT } from '../theme/buscosunTheme';
import { nivoTheme } from './charts/nivoTheme';
import { useDossierBreakpoint } from './dossier/DossierPrimitives';

export interface FirePassChartProps {
  passes: readonly FirePass[];
  nowMs: number;
  compact?: boolean;
  /** Dossier-Maß (volle Panelbreite). Schlägt `compact`. */
  wide?: boolean;
  /**
   * OBERGRENZE der Breite im Dossier-Maß. Die Breite selbst misst der Chart an seiner Karte
   * (`ResponsiveLine` per ResizeObserver) — eine feste Zahl je Breakpoint lief auf dem
   * Tablet über den Rand: die Mitte ist dort mit beiden Sidebars nur ~440 px breit.
   */
  wideWidth?: number;
}

/** Was eine eigene nivo-Ebene an Skalen und Maßen bekommt. */
interface LayerCtx {
  xScale: (v: Date) => number;
  yScale: (v: number) => number;
  innerWidth: number;
  innerHeight: number;
}

const de = (n: number, frac = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });
const stamp = (ms: number) => new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Boden der log-Achse. log(0) ist undefiniert — die Achse braucht eine positive Untergrenze. */
const Y_FLOOR = 0.1;

/*
 * Drei Zeilen unter der Nulllinie, in dieser Reihenfolge und ohne Überschneidung:
 *   y0 … y0+22   die Tages-Ticks der Zeitachse (die Bibliothek setzt sie selbst),
 *   y0+GLYPH_DY  ☀/☾ je Überflug,
 *   y0+STAMP_DY  der genaue Zeitstempel (nur beim ersten einer dichten Gruppe).
 * Vorher standen Glyphen und Achsen-Ticks auf derselben Höhe und schoben sich ineinander.
 */
const GLYPH_DY = 38;
const STAMP_DY = 52;

/**
 * NUR Zehnerpotenzen als Marken. Eine log-Achse bekommt sonst auch 2/3/5 je Dekade — acht
 * Marken auf 160 px, die sich überlagern und nichts hinzufügen. Die Aussage der Achse ist
 * die Größenordnung, nicht der Zwischenwert.
 */
function decades(min: number, max: number): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(min)); Math.pow(10, e) <= max; e++) out.push(Math.pow(10, e));
  return out;
}

export function FirePassChart({ passes, nowMs, compact = false, wide = false, wideWidth = 380 }: FirePassChartProps) {
  const tl = useMemo(() => passTimeline(passes, nowMs), [passes, nowMs]);
  const patternId = `fp-hatch-${useId().replace(/:/g, '')}`;
  const t = useTheme();
  const theme = useMemo(() => nivoTheme(t), [t]);
  // Ohne Provider (Historie) gilt 'desktop' — dort ist der Chart ohnehin im breiten Maß.
  const bp = useDossierBreakpoint();
  if (!tl) return null;

  // `undefined` = der Chart misst die Karte selbst. `wideWidth` bleibt die Obergrenze am <figure>.
  const width = wide ? undefined : compact ? 300 : 380;
  // Auf 390 px stünde ein 220 px hoher Chart über einem Drittel des Bildes; 180 reicht für
  // drei Dekaden der log-Achse (§4).
  const height = wide ? (bp === 'mobile' ? 180 : 220) : 130;
  const fontSize = wide ? 12 : 9;
  // Platz unten für Tag/Nacht-Zeichen + Zeitstempel + Achse; links für „100 MW".
  const margin = { left: wide ? 64 : 40, right: wide ? 30 : 12, top: 18, bottom: wide ? STAMP_DY + 10 : 30 };
  const nowInside = nowMs >= tl.fromMs && nowMs <= tl.toMs;
  const yMax = Math.max(1, tl.yMaxMw) * 1.6;
  const yTicks = decades(Y_FLOOR, yMax);

  /** Die Schraffur — eine eigene `<defs>`-Ebene, damit das Muster im selben `<svg>` steht. */
  const HatchDefs = () => (
    <defs>
      <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke={t.palette.fire.hatch} strokeWidth="1.4" />
      </pattern>
    </defs>
  );

  /** D2 — Beobachtungslücken: schraffierte Felder zwischen zwei Überflügen bzw. bis „jetzt". */
  const GapLayer = ({ xScale, innerHeight }: LayerCtx) => {
    const at = (frac: number) => xScale(new Date(tl.fromMs + frac * (tl.toMs - tl.fromMs)));
    return (
      <g aria-hidden="true">
        {tl.gaps.map((g, i) => {
          const x0 = at(g.x0);
          const x1 = at(g.x1);
          const w = Math.max(1, x1 - x0);
          const label = g.trailing ? `keine Beobachtung · ${de(g.hours, 0)} h (Nachlauf)` : `keine Beobachtung · ${de(g.hours, 0)} h`;
          return (
            <g key={i}>
              <rect x={x0} y={0} width={w} height={innerHeight} fill={`url(#${patternId})`} opacity={0.7}>
                <title>{g.trailing ? `${de(g.hours, 0)} h seit dem letzten Überflug — keine Beobachtung` : `${de(g.hours, 0)} h ohne Überflug`}</title>
              </rect>
              {w > 110 && (
                <text
                  x={x0 + w / 2} y={innerHeight / 2} textAnchor="middle" dominantBaseline="middle"
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
  };

  /**
   * D1 — die Balken. Tag `palette.fire.day`, Nacht `palette.fire.night`. Ein Überflug ohne
   * FRP-Angabe bekommt KEINEN Balken (auch keinen der Höhe 0 — das hieße „0 MW gemessen",
   * und gemessen wurde nichts), sondern eine weiße Marke auf dem Achsenboden.
   */
  const BarLayer = ({ xScale, yScale, innerWidth, innerHeight }: LayerCtx) => {
    const y0 = innerHeight;
    const px = (ms: number) => xScale(new Date(ms));

    // Beschriftungen entzerren: bei drei Satelliten in 20 Minuten trägt nur der erste einer
    // Gruppe Zeitstempel und Tag/Nacht-Zeichen, die MW-Zahl nur, wenn sie nicht in die
    // Y-Achsenbeschriftung läuft. (Die Achsen-Ticks entzerrt die Bibliothek selbst.)
    const stampAt = new Set<string>(); const mwAt = new Set<string>(); const glyphAt = new Set<string>();
    if (wide) {
      let ls = -1e9; let lm = -1e9; let lg = -1e9;
      for (const b of tl.bars) {
        const x = px(b.atMs);
        if (x - ls >= 76) { stampAt.add(b.key); ls = x; }
        if (b.hasFrp && x - lm >= 34 && x >= 12) { mwAt.add(b.key); lm = x; }
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
    const bw = Math.max(wide ? 4 : 2, Math.min(wide ? 22 : 9, innerWidth / Math.max(12, tl.bars.length * 2.5), tightest * 0.8));

    return (
      <g>
        {tl.bars.map((b) => {
          const x = px(b.atMs);
          const glyph = (
            <text x={x} y={y0 + GLYPH_DY} textAnchor="middle" fontFamily={SVG_FONT} fontSize={wide ? 12 : 7.5} fill={t.palette.text.secondary}>
              {b.day === false ? '☾' : b.day === true ? '☀' : ''}
            </text>
          );
          if (!b.hasFrp) {
            return (
              <g key={b.key}>
                <circle cx={x} cy={y0 - 4} r={wide ? 3.2 : 2.4} fill={t.palette.background.paper} stroke={t.palette.text.disabled} strokeWidth={1}>
                  <title>{`${stamp(b.atMs)} · ${b.satellite} · ${b.pixels} Px ohne FRP-Angabe`}</title>
                </circle>
                {(!wide || glyphAt.has(b.key)) && glyph}
              </g>
            );
          }
          const yTop = yScale(Math.max(Y_FLOOR, b.frpMw));
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
              {(!wide || glyphAt.has(b.key)) && glyph}
              {wide && stampAt.has(b.key) && (
                <text x={x} y={y0 + STAMP_DY} textAnchor="middle" fontFamily={SVG_FONT} fontSize={fontSize} fill={t.palette.text.disabled}>{stamp(b.atMs)}</text>
              )}
            </g>
          );
        })}
      </g>
    );
  };

  /** „jetzt" — gestrichelt, nur wenn der Zeitpunkt überhaupt im Fenster liegt. */
  const NowLayer = ({ xScale, innerHeight }: LayerCtx) => {
    if (!nowInside) return null;
    const x = xScale(new Date(nowMs));
    return (
      <g aria-hidden="true">
        <line
          x1={x} x2={x} y1={0} y2={innerHeight}
          stroke={t.palette.fire.extreme} strokeWidth={wide ? 1.5 : 1} strokeDasharray="4 4"
        />
        {wide && (
          <text x={x + 4} y={11} fontFamily={SVG_FONT} fontSize={fontSize} fill={t.palette.fire.extreme}>jetzt</text>
        )}
      </g>
    );
  };

  return (
    <Box
      component="figure"
      /*
       * Der Chart braucht einen NAMEN: die Bibliothek gibt ihrer Zeichenfläche keinen. KEIN
       * `role="img"` — das machte den ganzen Teilbaum präsentational, während darin eigene
       * fokussierbare Elemente für die Tastatur liegen; die wären dann anspringbar, aber
       * unbenannt. Ein `<figure>` mit Namen benennt die Gruppe und lässt die Bildunterschrift
       * und die Tastatur-Ziele darin sichtbar.
       */
      aria-label="Feuerstrahlungsleistung je Überflug"
      sx={{ m: 0, maxWidth: wide ? wideWidth : undefined }}
      className={`br-pass-chart${wide ? ' is-wide' : ''}`}
    >
      <Box sx={{ width, height, '& svg': { display: 'block', overflow: 'visible' } }}>
        <ResponsiveLine
          theme={theme}
          // Wird nie gezeichnet ('lines' fehlt in `layers`) — spannt nur die beiden Skalen auf.
          data={[{ id: 'frp', data: [{ x: new Date(tl.fromMs), y: Y_FLOOR }, { x: new Date(tl.toMs), y: yMax }] }]}
          margin={margin}
          xScale={{ type: 'time', min: new Date(tl.fromMs), max: new Date(tl.toMs), useUTC: false, precision: 'minute' }}
          yScale={{ type: 'log', base: 10, min: Y_FLOOR, max: yMax }}
          animate={false}
          enablePoints={false}
          enableArea={false}
          enableGridX={false}
          gridYValues={yTicks}
          isInteractive={false}
          enableSlices={false}
          axisTop={null}
          axisRight={null}
          axisLeft={{
            tickSize: 0, tickPadding: 6, tickValues: yTicks,
            format: (v) => (Number(v) >= 1 ? de(Number(v), 0) : de(Number(v), 1)),
            legend: wide ? 'ΣFRP (MW)' : undefined,
            legendPosition: 'middle',
            legendOffset: -50,
          }}
          axisBottom={{
            tickSize: 0, tickPadding: 8, tickValues: wide ? 5 : 3,
            format: (v) => (v as Date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
          }}
          layers={[HatchDefs as never, GapLayer as never, 'grid', 'axes', BarLayer as never, NowLayer as never]}
        />
      </Box>
      <Typography component="figcaption" variant="caption" sx={{ display: 'block', mt: 1, lineHeight: 1.55 }} className="br-note">
        ΣFRP je Überflug (log-Achse, MW) · <Box component="span" sx={{ color: 'fire.day' }}>■</Box> Tag ·{' '}
        <Box component="span" sx={{ color: 'fire.night' }}>■</Box> Nacht · ○ Überflug ohne FRP-Angabe ·
        {' '}schraffiert: mehr als {GAP_HOURS} h ohne Überflug (längste Lücke {de(tl.maxGapH, 0)} h) · gestrichelt: jetzt.
        {' '}Zwischen zwei Überflügen ist nichts beobachtet — die Balken sind Messpunkte, keine Kurve.
      </Typography>
    </Box>
  );
}
