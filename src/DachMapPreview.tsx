/**
 * DachMapPreview — Zier-Grafik der Startseiten-Kachel „01 · Wetterkarte" (Phase WK, Entwurf „2d · Berge & Wälder",
 * E-WK-1): eine ruhige, gezeichnete DACH-Karte auf Sand — Land mit weichem Schatten, Hügel, Wald, zwei Reihen Berge mit
 * Schneekappen, gestrichelte Landesgrenzen, Umriss und beschriftete Städte. Keine Daten, keine Bewegung; die Geometrie
 * (Umrisse, Relief, Wald, Städte, Projektion) steht in `dachPreviewPaths.ts` (GENERIERT, `scripts/gen-dach-preview.mjs`).
 * Der Text der Kachel steht im DOM davor (`.tile-karte-text`, SearchPage.css), die Karte sitzt absolut dahinter/daneben.
 */
import {
  DACH_PREVIEW_CITIES as CITIES, DACH_PREVIEW_FOREST as FOREST, DACH_PREVIEW_PATHS as P, DACH_PREVIEW_RELIEF as R,
} from './dachPreviewPaths';

const SHAPE = `${P.DE}${P.AT}${P.CH}`;
const CAPITALS = new Set(['Berlin', 'Wien', 'Bern']);
/** Beschriftung links vom Punkt (sonst rechts); mobil rückt München nach links, sonst stößt es an Wien. */
const LABEL_LEFT = { wide: new Set(['Wien', 'Graz']), narrow: new Set(['Wien', 'München']) };
const f2 = (n: number) => Math.round(n * 100) / 100;

/** Rahmen je Form: viewBox, Ausrichtung, Lage der Karte (Vorschau-Einheiten → viewBox-Pixel), sichtbare Städte, Schriftgröße. */
const FRAME = {
  wide: {
    box: '0 0 640 520', align: 'xMaxYMid meet', x: 276, y: 38, k: 1.86, label: 9.5,
    cities: ['Hamburg', 'Berlin', 'Köln', 'Frankfurt', 'Leipzig', 'München', 'Wien', 'Zürich', 'Bern', 'Innsbruck', 'Graz'],
  },
  narrow: {
    // Mobil: nur der Kartenbereich (Land + Beschriftungen), rechts neben dem Text; Koordinaten bleiben die des Bezugsrahmens 358 × 396.
    box: '76 128 214 268', align: 'xMidYMid meet', x: 84, y: 134, k: 1, label: 8.5,
    cities: ['Hamburg', 'Berlin', 'Frankfurt', 'München', 'Wien', 'Zürich', 'Bern'],
  },
} as const;

/** Wald: jeder Baum als zwei Formen, in Feldreihenfolge (hinten → vorn). Ein Mal gebaut, die Daten ändern sich nie. */
const FOREST_EL = FOREST.map(([x, y, kind, s], i) => {
  if (kind === 1) {
    const h = 4.9 * s, w = 1.75 * s, top = f2(y - 0.62 * h), base = f2(y + 0.38 * h);
    return (
      <g key={i}>
        <path d={`M${x} ${top}L${f2(x + w)} ${base}L${f2(x - w)} ${base}Z`} fill="#6E8A5C" />
        <path d={`M${x} ${top}L${x} ${base}L${f2(x - w)} ${base}Z`} fill="#93AC7C" />
      </g>
    );
  }
  const r = 1.95 * s;
  return (
    <g key={i}>
      <circle cx={f2(x + 0.45)} cy={f2(y + 0.4)} r={f2(r)} fill="var(--sage-600)" />
      <circle cx={f2(x - 0.25)} cy={f2(y - 0.3)} r={f2(0.8 * r)} fill="#A6BA8E" />
    </g>
  );
});

export function DachMapPreview({ mobile }: { mobile: boolean }) {
  const fr = mobile ? FRAME.narrow : FRAME.wide;
  return (
    <svg viewBox={fr.box} preserveAspectRatio={fr.align} className="tile-karte-svg" aria-hidden="true">
      <defs>
        <clipPath id="wkClip"><path d={SHAPE} /></clipPath>
      </defs>
      <g className="tile-karte-land" transform={`translate(${fr.x} ${fr.y}) scale(${fr.k})`}>
        <path d={SHAPE} transform="translate(1.2 2)" fill="var(--sand-300)" fillOpacity=".6" />
        <path d={SHAPE} fill="#EFE7D4" />
        <g clipPath="url(#wkClip)">
          <path d={R.hill.a} fill="#BDCDA0" />
          <path d={R.hill.b} fill="#9DB27E" />
          {FOREST_EL}
          <g fillOpacity=".75">
            <path d={R.back.a} fill="#D6C39C" />
            <path d={R.back.b} fill="#AE9468" />
          </g>
          <path d={R.back.s} fill="#fff" fillOpacity=".9" />
          <path d={R.front.a} fill="#D6C39C" />
          <path d={R.front.b} fill="#AE9468" />
          <path d={R.front.s} fill="#fff" />
        </g>
        <g fill="none" stroke="var(--ink-900)" strokeOpacity=".3" strokeWidth="1" strokeDasharray="3 4">
          <path d={P.AT} vectorEffect="non-scaling-stroke" /><path d={P.CH} vectorEffect="non-scaling-stroke" />
        </g>
        <path d={SHAPE} fill="none" stroke="var(--ink-900)" strokeOpacity=".6" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
      {fr.cities.map((name) => {
        const [ux, uy] = CITIES[name];
        const x = fr.x + ux * fr.k, y = fr.y + uy * fr.k;
        const cap = CAPITALS.has(name), r = cap ? 3.2 : 2.3, left = LABEL_LEFT[mobile ? 'narrow' : 'wide'].has(name);
        return (
          <g key={name}>
            {cap && <circle cx={f2(x)} cy={f2(y)} r="6.2" fill="var(--terracotta-500)" fillOpacity=".22" />}
            <circle cx={f2(x)} cy={f2(y)} r={r} fill={cap ? 'var(--terracotta-500)' : 'var(--ink-900)'} stroke="#FAF6EA" strokeWidth="1.2" />
            <text
              className="tile-karte-label" x={f2(x + (left ? -(r + 4) : r + 4))} y={f2(y + 3.2)}
              textAnchor={left ? 'end' : 'start'} fontSize={fr.label}
            >{name.toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}
