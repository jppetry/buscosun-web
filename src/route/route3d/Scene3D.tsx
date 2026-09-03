/**
 * R3D · die Szene (SVG, axonometrisch).
 *
 * Zeichenreihenfolge = Tiefenordnung. Weil Wand, Regen und Ebenen in derselben
 * Schnittebene liegen wie das Geländeprofil, ist die Verdeckung exakt: alles
 * Atmosphärische wird am **Himmelspolygon** (`skyPath`) beschnitten und dann
 * das Gelände darüber gezeichnet. Ein Berg verdeckt damit die Windwand
 * dahinter — dieselbe Aussage wie ein Tiefentest, ohne WebGL
 * (`audit/route-3d.md` §5 B5, §6 Weg A).
 *
 * Farben: die fünf Windbänder sind die Legendenfarben des 2D-Schnitts
 * (`SectionChart.BAND_COLORS`) — dieselbe Skala, damit 2D und 3D nicht
 * verschieden aussehen. **Stufig**, nicht als Verlauf (Ehrlichkeitsauflage).
 */

import { useId, useMemo } from 'react';
import { BAND_COLORS } from '../../threed/SectionChart';
import {
  cellPath, freeSpan, heightRange, heightTicks, layoutCards, makeProjection, planePath,
  reliefPath, ribbonPoints, skyPath, terrainCapPath, terrainPath,
  type CardBox, type Point2, type Viewport,
} from './scene';
import {
  terrainAt, REL_COLORS as MODEL_REL_COLORS, TEMP_COLORS as MODEL_TEMP_COLORS,
  TEMP_STEPS as MODEL_TEMP_STEPS, tempStepIndex as modelTempStepIndex,
  WIND_BAND_LABELS, type SceneColumn, type SceneModel, type TerrainNode,
} from './model';
import { hhmm, type Pearl, type RainWindow } from './corridor';
import { kmLabel, STATUS_WORD, type GoSection, type GoStatus } from './gonogo';

/* Palette und Relationsfarben liegen in `model.ts` (pur) — hier stehen sie nur
   noch als Durchreiche, damit bestehende Importe stimmen (R3D-8). */
export const TEMP_STEPS = MODEL_TEMP_STEPS;
export const TEMP_COLORS = MODEL_TEMP_COLORS;
export const tempStepIndex = modelTempStepIndex;

export interface LayerFlags {
  temp: boolean;
  wind: boolean;
  rain: boolean;
  cloud: boolean;
  snow: boolean;
  warn: boolean;
  /** Zeitkorridor (1b): Wetterperlen zur ETA. */
  pearls: boolean;
  /** Zeitkorridor (1b): der Streckenabschnitt, den der Regen trifft. */
  wetseg: boolean;
  /** Zeitkorridor (1b): Windpfeile zur Fahrtrichtung. */
  arrows: boolean;
}

/** Welche Frage die Szene beantwortet — 1a „was zieht über die Strecke",
 *  1b „wo bin ich wann", 1c „wo wird es kritisch". Dieselbe Geometrie,
 *  andere Aufsätze. */
export type SceneMode = 'wetter' | 'zeit' | 'gonogo';

/**
 * Farbe der Entscheidung (1c). Sie trägt **nie allein**: jeder Abschnitt
 * bekommt sein Wort (`STATUS_WORD`), in der Szene wie in der Liste — die
 * Vorlage schreibt es ausdrücklich vor („nicht nur Farbe").
 */
export const STATUS_COLORS: Record<GoStatus, string> = {
  go: '#7A9466', knapp: '#C99A5B', unklar: '#8C9AA8', 'no-go': '#D7263D',
};

export const REL_COLORS = MODEL_REL_COLORS;
export const REL_WORDS: Record<'tail' | 'cross' | 'head', string> = {
  tail: 'Rücken', cross: 'Seite', head: 'Gegen',
};

interface Props {
  scene: SceneModel;
  layers: LayerFlags;
  /** Gewünschte Überhöhung (Regler). */
  exaggeration: number;
  /** Markerposition (m entlang der Strecke). */
  markerM: number;
  isMobile: boolean;
  onPickDist?: (distM: number) => void;
  /** Modus der Szene (Default `wetter` = 1a). */
  mode?: SceneMode;
  /** Wetterperlen zur ETA (nur im Zeitkorridor). */
  pearls?: Pearl[];
  /** Regenfenster entlang der Strecke (nur im Zeitkorridor). */
  windows?: RainWindow[];
  /** Abschnitte mit Go/No-Go-Status (nur im Grenzwert-Modus). */
  sections?: GoSection[];
}

/** Höhe der Legendenzeile am Fuß der Szene (Grundlinie `vp.h - 12`). */
const LEGEND_BAND = 26;

const DESKTOP: Viewport = { w: 1160, h: 520, padL: 62, padR: 26, padT: 26, padB: 34, depthX: 96, depthY: 74 };
const MOBILE: Viewport = { w: 390, h: 320, padL: 40, padR: 12, padT: 14, padB: 20, depthX: 28, depthY: 22 };

export default function Scene3D({
  scene, layers, exaggeration, markerM, isMobile, onPickDist,
  mode = 'wetter', pearls = [], windows = [], sections = [],
}: Props) {
  const uid = useId().replace(/:/g, '');
  const vp = isMobile ? MOBILE : DESKTOP;

  const view = useMemo(() => {
    const extra: number[] = [];
    if (scene.cloudBase) extra.push(scene.cloudBase.maxM);
    if (scene.snowLine) extra.push(scene.snowLine.maxM);
    // Die Höhenachse folgt dem PROFIL: Sohle und Gipfel liegen zwischen den
    // Wetterpunkten, nicht auf ihnen.
    const heights = (scene.terrain.length >= 2 ? scene.terrain : scene.columns).map((c) => c.terrainM);
    if (scene.relief.length) for (const rp of scene.relief) for (const n of rp.nodes) heights.push(n.terrainM);
    const { floorM, topM } = heightRange(heights, extra);
    const p = makeProjection(vp, Math.max(1, scene.totalM), floorM, topM, exaggeration);
    return { p, floorM, topM, ticks: heightTicks(floorM, topM) };
  }, [scene, vp, exaggeration]);

  const { p } = view;
  const cols = scene.columns;
  if (cols.length < 2) {
    return <div className="r3-scene r3-scene--empty">Für diese Strecke liegen zu wenige Punkte für die Szene vor.</div>;
  }

  // Status je Spalte — das Routenband faerbt sich nach der Entscheidung,
  // nicht nach der Temperatur (1c).
  const statusByIdx: GoStatus[] = [];
  for (const sec of sections) for (let i = sec.fromIdx; i <= sec.toIdx; i++) statusByIdx[i] = sec.status;

  // Das Gelände hat seine eigene Auflösung (§19.1). Die Spalten bleiben die
  // Wetterträger; alles Geometrische — Silhouette, Verdeckungsmaske, Band,
  // Label-Freiflächen — hängt am Profil.
  const profile: TerrainNode[] = scene.terrain.length >= 2
    ? scene.terrain
    : cols.map((c) => ({ distM: c.distM, terrainM: c.terrainM }));
  const ptAt = (distM: number): Point2 => p.project(distM, terrainAt(profile, distM));
  // Tiefe je Seitenprofil: das entfernteste steht an der Rückwand.
  const maxOffsetM = scene.relief.reduce((m, r) => Math.max(m, r.offsetM), 0);

  const skyClip = `r3sky-${uid}`;
  const ribbon = ribbonPoints(p, profile);
  const startPt = ptAt(cols[0].distM);
  const goalPt = ptAt(cols[cols.length - 1].distM);
  const marker = markerColumn(cols, markerM);
  const markerPt = ptAt(marker.distM);

  return (
    <svg
      className="r3-scene"
      viewBox={`0 0 ${vp.w} ${vp.h}`}
      role="img"
      aria-label={`Geländeschnitt entlang der Strecke mit ${activeLayerNames(layers, scene, mode)}`}
      onClick={(e) => {
        if (!onPickDist) return;
        const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const x = ((e.clientX - box.left) / box.width) * vp.w;
        const rel = (x - vp.padL) / Math.max(1, vp.w - vp.padL - vp.padR - vp.depthX);
        onPickDist(Math.max(0, Math.min(1, rel)) * scene.totalM);
      }}
    >
      <defs>
        <clipPath id={skyClip}>
          <path d={skyPath(p, profile)} />
        </clipPath>
        <linearGradient id={`r3sky-g-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#111820" />
          <stop offset="100%" stopColor="#0B0E12" />
        </linearGradient>
      </defs>

      <rect x={0} y={0} width={vp.w} height={vp.h} fill={`url(#r3sky-g-${uid})`} />

      {/* Gemessenes Gelände neben der Strecke — hinten zuerst. Es ersetzt die
          Extrusion des eigenen Profils durch abgetastetes Relief (§19.3). */}
      {scene.relief.length > 0 && (
        <g className="r3-relief">
          {[...scene.relief].sort((a, b) => b.offsetM - a.offsetM).map((rp) => (
            <path
              key={rp.offsetM}
              d={reliefPath(p, rp.nodes, maxOffsetM > 0 ? rp.offsetM / maxOffsetM : 1)}
              className="r3-relief-band"
              style={{ opacity: 0.28 + 0.34 * (1 - (maxOffsetM > 0 ? rp.offsetM / maxOffsetM : 1)) }}
            />
          ))}
        </g>
      )}

      {/* Höhenachse — die Szene ist ein Diagramm, keine Illustration. */}
      <g className="r3-axis">
        {view.ticks.map((m) => {
          const a = p.project(0, m, 0);
          const b = p.project(scene.totalM, m, 0);
          const c = p.project(scene.totalM, m, 1);
          return (
            <g key={m}>
              <path d={`M${a.x},${a.y} L${b.x},${b.y} L${c.x},${c.y}`} className="r3-axis-line" />
              <text x={a.x - 8} y={a.y + 4} className="r3-axis-lab" textAnchor="end">{m}</text>
            </g>
          );
        })}
        <text
          x={p.project(0, view.floorM).x - 8}
          y={p.project(0, view.floorM).y + 4}
          className="r3-axis-unit"
          textAnchor="end"
        >
          m ü. NN
        </text>
      </g>

      {/* Alles Atmosphärische liegt HINTER dem Gelände. */}
      <g clipPath={`url(#${skyClip})`}>
        {layers.wind && scene.windCells.map((c, i) => (
          <path
            key={`w${i}`}
            d={cellPath(p, c.fromM, c.toM, c.loM, c.hiM)}
            fill={BAND_COLORS[c.band]}
            fillOpacity={0.42}
            shapeRendering="crispEdges"
          />
        ))}

        {layers.warn && scene.warnZones.map((z, i) => (
          <path
            key={`z${i}`}
            d={cellPath(p, z.fromM, z.toM, view.floorM, view.topM)}
            className={`r3-warnzone r3-warnzone--l${Math.min(5, Math.max(1, z.level))}`}
          />
        ))}

        {/* Grenzwert-Zone (1c): der km-Bereich, in dem ein Grenzwert nicht
            haelt — von der Sohle bis zur Decke, damit sie auch dort sichtbar
            ist, wo das Profil flach liegt. „go" bekommt keine Zone: eine
            Ansicht, die alles einrahmt, rahmt nichts ein. */}
        {mode === 'gonogo' && sections.filter((x) => x.status !== 'go').map((x, i) => (
          <path
            key={`gz${i}`}
            d={cellPath(p, x.fromM, x.toM, view.floorM, view.topM)}
            className={`r3-gozone r3-gozone--${x.status}`}
          />
        ))}

        {layers.rain && scene.rain.map((r, i) => (
          <RainCurtain key={`r${i}`} p={p} col={r} uid={`${uid}-${i}`} />
        ))}

        {layers.cloud && scene.cloudBase && <path d={planePath(p, scene.cloudBase.meanM)} className="r3-cloudplane" />}
        {layers.snow && scene.snowLine && <path d={planePath(p, scene.snowLine.meanM)} className="r3-snowplane" />}
      </g>

      {/* Beschriftung der Ebenen: NICHT geclippt, und dort, wo die Ebene frei liegt. */}
      {layers.cloud && scene.cloudBase && (
        <PlaneLabel p={p} cols={profile} altM={scene.cloudBase.meanM} dy={-8}
          text={`Wolkenbasis ≈ ${Math.round(scene.cloudBase.meanM)} m · abgeleitet`} />
      )}
      {layers.snow && scene.snowLine && (
        <PlaneLabel p={p} cols={profile} altM={scene.snowLine.meanM} dy={15}
          text={`Schneefallgrenze ${Math.round(scene.snowLine.meanM)} m`} />
      )}

      {/* Gelände. Die Kappe ist die Extrusion des eigenen Profils — sie ist nur
          dann die ehrlichste verfügbare Tiefe, wenn kein gemessenes Relief
          vorliegt; sonst stünde eine Zeichnung vor einer Messung. */}
      {scene.relief.length === 0 && <path d={terrainCapPath(p, profile)} className="r3-terrain-cap" />}
      <path d={terrainPath(p, profile)} className="r3-terrain" />

      {/* Das Routenband auf dem Profil — eingefärbt nach Temperatur, stufig. */}
      <g className="r3-ribbon">
        <polyline
          points={ribbon.map((q) => `${q.x},${q.y}`).join(' ')}
          className="r3-ribbon-base"
        />
        {/* Die Farbe gehört der Spalte, der Verlauf dem Profil: zwischen zwei
            Wetterpunkten folgt das Band jeder Kuppe, statt sie abzuschneiden. */}
        {mode === 'gonogo'
          ? cols.slice(1).map((_, i) => {
              const st = statusByIdx[i + 1] ?? statusByIdx[i];
              if (!st) return null;
              return (
                <polyline
                  key={`g${i}`}
                  points={ribbonSegment(p, profile, cols[i].distM, cols[i + 1].distM).map((q) => `${q.x},${q.y}`).join(' ')}
                  fill="none"
                  stroke={STATUS_COLORS[st]}
                  strokeWidth={isMobile ? 4.5 : 6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })
          : layers.temp && cols.slice(1).map((c, i) => {
              const t = c.tempC ?? cols[i].tempC;
              if (t == null) return null;
              return (
                <polyline
                  key={`t${i}`}
                  points={ribbonSegment(p, profile, cols[i].distM, c.distM).map((q) => `${q.x},${q.y}`).join(' ')}
                  fill="none"
                  stroke={TEMP_COLORS[tempStepIndex(t)]}
                  strokeWidth={isMobile ? 3.5 : 4.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
      </g>

      {/* --- Zeitkorridor (1b) ---------------------------------------- */}

      {/* Der getroffene Abschnitt. Er ist KEINE Zelle mit Zuggeschwindigkeit
          (audit B10), sondern das, was das Radarprodukt selbst extrapoliert
          hat: welcher km-Bereich zu welcher Zeit nass ist. */}
      {mode === 'zeit' && layers.wetseg && windows.map((w, i) => {
        // Ein Fenster über einer einzigen Spalte hat keine zwei Stützpunkte —
        // es bekommt seine Kanten aus dem Profil, statt unsichtbar zu bleiben.
        const seg = ribbonSegment(p, profile, w.fromM, w.toM);
        if (seg.length < 2) {
          const a = ptAt(w.fromM);
          const b = ptAt(w.toM);
          return (
            <line
              key={`ws${i}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              className={`r3-wetseg${markerM >= w.fromM && markerM <= w.toM ? ' is-active' : ''}`}
              strokeWidth={isMobile ? 5 : 7.5}
            />
          );
        }
        const active = markerM >= w.fromM && markerM <= w.toM;
        return (
          <polyline
            key={`ws${i}`}
            points={seg.map((q) => `${q.x},${q.y}`).join(' ')}
            className={`r3-wetseg${active ? ' is-active' : ''}`}
            strokeWidth={isMobile ? 5 : 7.5}
          />
        );
      })}

      {/* Windpfeile zur Fahrtrichtung — Farbe UND Richtung UND Legendenwort. */}
      {mode === 'zeit' && layers.arrows && (
        <g className="r3-arrows">
          {arrowPicks(cols, isMobile ? 4 : 9).map((c, i) => {
            const q = ptAt(c.distM);
            const rel = c.windRel!;
            return (
              <g key={`a${i}`} transform={`translate(${q.x}, ${q.y - (isMobile ? 12 : 18)})`} fill={REL_COLORS[rel]}>
                <path d={arrowPath(rel, isMobile ? 9 : 12)} />
              </g>
            );
          })}
        </g>
      )}

      {/* Gipfel in Wolke — benannt, nicht nur gefärbt. */}
      {layers.cloud && scene.peaksInCloud.length > 0 && (() => {
        const top = scene.peaksInCloud.reduce((m, x) => (x.terrainM > m.terrainM ? x : m));
        const q = p.project(top.distM, top.terrainM, 0);
        return (
          <g className="r3-peakcloud">
            <circle cx={q.x} cy={q.y} r={4} />
            <text x={q.x + 8} y={q.y - 6}>Gipfel in Wolke · {Math.round(top.terrainM)} m</text>
          </g>
        );
      })()}

      {/* Start / Ziel. Im Zeitkorridor sagen die Perlen bereits „km 0,0" und
          „Ziel" — die Höhentexte kollidierten mit ihnen und mit dem
          Wolkenbasis-Label, also entfallen sie (die Punkte bleiben). Auf dem
          Tablet traf es die Ziel-Perle; die Regel gilt deshalb je Modus, nicht
          je Breite (§16.4). */}
      <g className="r3-ends">
        <circle cx={startPt.x} cy={startPt.y} r={5} className="r3-end r3-end--start" />
        <circle cx={goalPt.x} cy={goalPt.y} r={5} className="r3-end r3-end--goal" />
        {!(mode === 'zeit' && layers.pearls) && (
          <>
            {/* Die Legende liegt am Fuß der Szene. Startet die Strecke tief —
                auf dem Handy die Regel —, lief die Start-Beschriftung bisher
                MITTEN durch sie hindurch (in 1a wie in 1c gemessen). Dann steht
                sie über dem Punkt statt darunter. */}
            <text
              x={startPt.x + 8}
              y={startPt.y + 18 > vp.h - LEGEND_BAND ? startPt.y - 12 : startPt.y + 18}
            >
              Start · {Math.round(cols[0].terrainM)} m
            </text>
            <text
              x={goalPt.x - 8}
              y={goalPt.y - 12}
              textAnchor="end"
            >
              Ziel · {Math.round(cols[cols.length - 1].terrainM)} m
            </text>
          </>
        )}
      </g>

      {/* Marker der gekoppelten Regler */}
      <g className="r3-marker">
        <line x1={markerPt.x} y1={p.project(marker.distM, view.topM).y} x2={markerPt.x} y2={markerPt.y} />
        <circle cx={markerPt.x} cy={markerPt.y} r={7} />
      </g>

      {/* Fahne an der Zone (1c): Wort UND km-Bereich. Sie steht nur an den
          Zonen, die breit genug sind, um sie zu tragen — sonst überdeckten sich
          bei kleinteiligem Wechsel mehrere Fahnen (dieselbe Falle wie bei den
          Perlen, §14.4). */}
      {mode === 'gonogo' && (() => {
        const minW = isMobile ? 76 : 108;
        const flags = sections
          .filter((x) => x.status !== 'go')
          .map((x) => {
            const a = p.project(x.fromM, view.topM, 0);
            const b = p.project(x.toM, view.topM, 0);
            return { sec: x, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y: Math.min(a.y, b.y) };
          })
          .filter((f) => f.x1 - f.x0 >= minW);
        // Die Streckenenden sind feste Beschriftungen — die Fahne weicht
        // ihnen aus, statt sie zu verdecken (dieselbe Auflage wie §16.4 (2)
        // fuer die Wolkenbasis; auf dem Handy lag „Ziel · 1279 m" unter ihr).
        const taken = [
          { x: ribbon[0].x + 8, y: ribbon[0].y + 18, w: 88, h: 16 },
          { x: ribbon[ribbon.length - 1].x - 88, y: ribbon[ribbon.length - 1].y - 20, w: 88, h: 16 },
        ];
        return flags.map((f, i) => {
          const label = `${STATUS_WORD[f.sec.status].toUpperCase()} · km ${kmLabel(f.sec.fromM)}–${kmLabel(f.sec.toM)}`;
          const w = label.length * (isMobile ? 6.2 : 7.4) + 16;
          const cx = Math.max(vp.padL + w / 2, Math.min(vp.w - vp.padR - w / 2, (f.x0 + f.x1) / 2));
          let cy = f.y + (isMobile ? 12 : 16);
          for (let step = 0; step < 3; step++) {
            const box = { x: cx - w / 2, y: cy - 11, w, h: 22 };
            const clash = taken.some((t) => box.x < t.x + t.w && t.x < box.x + box.w
              && box.y < t.y + t.h && t.y < box.y + box.h);
            if (!clash) break;
            cy += 26;
          }
          return (
            <g key={`gf${i}`} className={`r3-goflag r3-goflag--${f.sec.status}`}>
              <line x1={f.x0} y1={f.y} x2={f.x1} y2={f.y} />
              <rect x={cx - w / 2} y={cy - 11} width={w} height={22} rx={11} />
              <text x={cx} y={cy + 4} textAnchor="middle">{label}</text>
            </g>
          );
        });
      })()}

      {/* Wetterperlen zuletzt: sie sind Beschriftung, nicht Atmosphäre, und
          liegen deshalb bewusst über allem — auch über dem Gelände. */}
      {mode === 'zeit' && layers.pearls && (() => {
        const w = isMobile ? 104 : 132;
        const h = isMobile ? 40 : 48;
        const anchors = pearls.map((pl) => {
          const a = ptAt(pl.distM);
          return { x: Math.max(vp.padL + w / 2, Math.min(vp.w - vp.padR - w / 2, a.x)), y: a.y };
        });
        // Die Wolkenbasis traegt das Wort „abgeleitet" — eine Perle darf es
        // nicht verdecken (im Browser passiert, §16.4). Ihr Kasten ist deshalb
        // belegt; die Breite ist eine Schaetzung aus der Zeichenzahl.
        const reserved = [];
        if (layers.cloud && scene.cloudBase) {
          const span = freeSpan(profile, scene.cloudBase.meanM);
          if (span) {
            const q = p.project(span.midM, scene.cloudBase.meanM, 0.5);
            const chars = `Wolkenbasis ≈ ${Math.round(scene.cloudBase.meanM)} m · abgeleitet`.length;
            reserved.push({ x: q.x, y: q.y - 8, w: chars * (isMobile ? 6.0 : 6.8), h: 20 });
          }
        }
        const boxes = layoutCards(anchors, {
          w, h, lift: isMobile ? 54 : 78, minY: vp.padT + h / 2, stepY: h + 8, reserved,
        });
        return pearls.map((pl, i) => (
          <PearlCard key={`p${i}`} anchor={ptAt(pl.distM)} pearl={pl} box={boxes[i]} isMobile={isMobile} />
        ));
      })()}

      {/* Legende — Farbe trägt nie allein, jedes Band hat seine Zahl. */}
      {mode === 'zeit' && layers.arrows && (
        <g className="r3-legend r3-legend--rel" transform={`translate(${vp.padL - 4}, ${vp.h - 12})`}>
          {(['tail', 'cross', 'head'] as const).map((rel, i) => (
            <g key={rel} transform={`translate(${i * (isMobile ? 58 : 96)}, 0)`}>
              <rect width={isMobile ? 10 : 12} height={isMobile ? 10 : 12} y={-10} fill={REL_COLORS[rel]} />
              <text x={isMobile ? 14 : 17} y={0}>{REL_WORDS[rel]}</text>
            </g>
          ))}
          {/* Der Nachsatz steht auf dem Handy schon auf dem Chip — hier liefe er
              unter die Überhöhungs-Knöpfe. */}
          {!isMobile && <text x={3 * 96} y={0} className="r3-legend-unit">Wind zur Fahrtrichtung</text>}
        </g>
      )}

      {mode === 'gonogo' && (
        <g className="r3-legend r3-legend--go" transform={`translate(${vp.padL - 4}, ${vp.h - 12})`}>
          {(['go', 'knapp', 'unklar', 'no-go'] as const).map((st, i) => (
            <g key={st} transform={`translate(${i * (isMobile ? 62 : 86)}, 0)`}>
              <rect width={isMobile ? 10 : 12} height={isMobile ? 10 : 12} y={-10} fill={STATUS_COLORS[st]} />
              <text x={isMobile ? 14 : 17} y={0}>{STATUS_WORD[st]}</text>
            </g>
          ))}
          {!isMobile && (
            <text x={4 * 86} y={0} className="r3-legend-unit">
              Status am Abschnitt · jeder trägt seinen Text
            </text>
          )}
        </g>
      )}

      {mode === 'wetter' && layers.wind && (
        <g className="r3-legend" transform={`translate(${vp.padL - 4}, ${vp.h - 12})`}>
          {WIND_BAND_LABELS.map((lab, i) => (
            <g key={lab} transform={`translate(${i * (isMobile ? 64 : 92)}, 0)`}>
              <rect width={isMobile ? 10 : 12} height={isMobile ? 10 : 12} y={-10} fill={BAND_COLORS[i]} />
              <text x={isMobile ? 14 : 17} y={0}>{lab}</text>
            </g>
          ))}
          <text x={(isMobile ? 5 : 5) * (isMobile ? 64 : 92)} y={0} className="r3-legend-unit">km/h auf Höhe</text>
        </g>
      )}
    </svg>
  );
}

/** Beschriftung einer Höhenebene — in der längsten frei liegenden Spanne. */
function PlaneLabel({
  p, cols, altM, text, dy,
}: { p: ReturnType<typeof makeProjection>; cols: Array<{ distM: number; terrainM: number }>; altM: number; text: string; dy: number }) {
  const span = freeSpan(cols, altM);
  if (!span) return null;
  const q = p.project(span.midM, altM, 0.5);
  return <text x={q.x} y={q.y + dy} className="r3-plane-lab" textAnchor="middle">{text}</text>;
}

/** Regensäule: schraffierte Striche aus der Wolkenbasis auf die Strecke. */
function RainCurtain({ p, col, uid }: { p: ReturnType<typeof makeProjection>; col: SceneModel['rain'][number]; uid: string }) {
  const a = p.project(col.fromM, col.baseM);
  const b = p.project(col.toM, col.topM);
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const yTop = Math.min(a.y, b.y);
  const yBot = Math.max(a.y, b.y);
  const strokes: number[] = [];
  // Dichte trägt die Intensität — zusätzlich zur Deckkraft, damit nicht die
  // Farbe allein die Aussage macht.
  const step = col.mmH >= 4 ? 6 : col.mmH >= 1.5 ? 9 : 14;
  for (let x = x0; x <= x1; x += step) strokes.push(x);
  const opacity = Math.min(0.85, 0.3 + col.mmH * 0.12);
  // Die Niederschlagsart steckt im Modell (`precipitationType`) und stand
  // bisher nur in der Strichfarbe. Schnee fällt nicht schräg: er bekommt
  // senkrechte, gestrichelte Striche, Schneeregen die halbe Neigung — die Art
  // ist damit auch ohne Farbvergleich zu erkennen (§19.6).
  const slant = col.type === 'snow' ? 0 : col.type === 'sleet' ? 3.5 : 7;
  return (
    <g className={`r3-rain r3-rain--${col.type}`} data-uid={uid} opacity={opacity}>
      {strokes.map((x, i) => (
        <line key={i} x1={x} y1={yTop} x2={x - slant} y2={yBot} />
      ))}
    </g>
  );
}

/**
 * Eine Wetterperle: Uhrzeit · km, Temperatur, Windwort. Sie hängt an einer
 * gestrichelten Leine über ihrem Streckenpunkt — „jede Perle = deine Ankunft
 * dort". Karten stehen abwechselnd höher, damit benachbarte sich nicht decken.
 */
function PearlCard({
  anchor, pearl, box, isMobile,
}: { anchor: Point2; pearl: Pearl; box: CardBox; isMobile: boolean }) {
  const { w, h, x: cx, y: cy } = box;
  const c = pearl.col;
  const relWord = c.windRel ? REL_WORDS[c.windRel] : null;
  const wetHere = (c.precipMmH ?? 0) >= 0.1;
  return (
    <g className={`r3-pearl${wetHere ? ' is-wet' : ''}`}>
      <line x1={cx} y1={cy + h / 2} x2={anchor.x} y2={anchor.y} className="r3-pearl-lead" />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={8} className="r3-pearl-box" />
      <text x={cx - w / 2 + 9} y={cy - h / 2 + (isMobile ? 14 : 16)} className="r3-pearl-when">
        {hhmm(pearl.atMs)} · {pearl.kind === 'goal' ? 'Ziel' : `km ${(pearl.distM / 1000).toFixed(1).replace('.', ',')}`}
      </text>
      <text x={cx - w / 2 + 9} y={cy + h / 2 - (isMobile ? 8 : 10)} className="r3-pearl-temp">
        {c.tempC != null ? `${Math.round(c.tempC)}°` : '—'}
      </text>
      {relWord && (
        <text x={cx + w / 2 - 9} y={cy + h / 2 - (isMobile ? 8 : 10)} className="r3-pearl-rel" textAnchor="end"
          fill={REL_COLORS[c.windRel!]}>
          {relWord}
        </text>
      )}
    </g>
  );
}

/** Pfeilform je Relation: Rücken zeigt in Fahrtrichtung, Gegen dagegen, Seite quer. */
export function arrowPath(rel: 'tail' | 'cross' | 'head', r: number): string {
  const b = r * 0.5;
  if (rel === 'tail') return `M${-r},${-b} L${r},0 L${-r},${b} Z`;
  if (rel === 'head') return `M${r},${-b} L${-r},0 L${r},${b} Z`;
  return `M${-b},${r} L${0},${-r} L${b},${r} Z`;
}

/** Gleichmäßig verteilte Spalten mit bekannter Windrelation. */
function arrowPicks(cols: SceneColumn[], count: number): SceneColumn[] {
  const usable = cols.filter((c) => c.windRel != null);
  if (usable.length === 0) return [];
  if (usable.length <= count) return usable;
  const out: SceneColumn[] = [];
  const stride = usable.length / count;
  for (let i = 0; i < count; i++) out.push(usable[Math.min(usable.length - 1, Math.round(i * stride))]);
  return out;
}

/**
 * Ein Stück Routenband zwischen zwei Distanzen — mit **exakten** Endpunkten.
 * Die Grenze zweier Abschnitte liegt in der Mitte zwischen zwei Wetterpunkten
 * (`segmentEdges`) und damit fast nie auf einem Profilknoten; ohne die
 * interpolierten Enden entstünden Lücken zwischen den Farben.
 */
function ribbonSegment(
  p: ReturnType<typeof makeProjection>,
  nodes: TerrainNode[],
  fromM: number,
  toM: number,
): Point2[] {
  if (toM <= fromM) return [];
  const out: Point2[] = [p.project(fromM, terrainAt(nodes, fromM))];
  for (const n of nodes) {
    if (n.distM <= fromM) continue;
    if (n.distM >= toM) break;
    out.push(p.project(n.distM, n.terrainM));
  }
  out.push(p.project(toM, terrainAt(nodes, toM)));
  return out;
}

function markerColumn(cols: SceneColumn[], distM: number): SceneColumn {
  let best = cols[0];
  let bd = Math.abs(best.distM - distM);
  for (const c of cols) {
    const d = Math.abs(c.distM - distM);
    if (d < bd) { best = c; bd = d; }
  }
  return best;
}

function activeLayerNames(l: LayerFlags, s: SceneModel, mode: SceneMode): string {
  const on: string[] = [];
  if (mode === 'zeit') {
    if (l.pearls) on.push('Wetterperlen zur Ankunftszeit');
    if (l.wetseg) on.push('getroffener Streckenabschnitt');
    if (l.arrows) on.push('Wind zur Fahrtrichtung');
    if (l.cloud && s.cloudBase) on.push('Wolkenbasis');
    if (l.snow && s.snowLine) on.push('Schneefallgrenze');
    return on.length ? on.join(', ') : 'ohne eingeschaltete Ebenen';
  }
  if (mode === 'gonogo') {
    on.push('Streckenband nach Go/No-Go-Status');
    if (l.cloud && s.cloudBase) on.push('Wolkenbasis');
    if (l.snow && s.snowLine) on.push('Schneefallgrenze');
    if (l.warn && s.warnZones.length) on.push('Warnzone');
    return on.join(', ');
  }
  if (l.temp) on.push('Temperatur am Band');
  if (l.wind) on.push('Windwand');
  if (l.rain && s.rain.length) on.push('Regen');
  if (l.cloud && s.cloudBase) on.push('Wolkenbasis');
  if (l.snow && s.snowLine) on.push('Schneefallgrenze');
  if (l.warn && s.warnZones.length) on.push('Warnzone');
  return on.length ? on.join(', ') : 'ohne eingeschaltete Wetter-Ebenen';
}
