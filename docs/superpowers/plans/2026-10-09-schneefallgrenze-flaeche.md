# Schneefallgrenze als Fläche im Gelände (Phase SK) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Regenradar, show the snowfall line of buscosun Fusion as a surface on the terrain — white cap above the most likely line, finely hatched band between lower and upper bound, cap stronger where it actually precipitates — in the 2D map and on ZT's 3D stage, plus the sentence "Schnee bis zu dir …" at the location, all behind `?sk=1` (default off).

**Architecture:** A self-contained module `src/snowCap/` reads the existing Fusion map field `point/field/v1/<run>/<tier>/snowlmt-LLL.png` (t1/t2), samples Terrarium DEM tiles for the current viewport, and builds on the main thread (time-sliced, no long tasks) one RGBA image in Mercator rows (cap + band hatch) plus contour lines of `DEM − p50` with labels. A layer adapter puts image + lines onto any MapLibre map with standard layers (`image` source + `raster`, `line`, `symbol`) — no shader. NowcastRadarMap mounts it on the 2D map (and suppresses the old ICON-D2 line only when `?sk=1`); NowcastDeck mounts a second instance on ZT's `TowerStage` map via `onStageReady`. The sentence reuses `snowSentence` from Phase HZS unchanged and only adds "Bei dir bleibt es Regen" and the precipitation chance.

**Tech Stack:** React 19, TypeScript 5.7, MapLibre GL 5.24 (standard layers only), Vite 6; headless verifier `.mjs` run with `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs`.

**Spec:** `audit/schneefallgrenze-flaeche.md` (§2 measurement, §3 map means, §4a design, §5 decisions incl. the 09.10. addendum). Read it before starting.

## Global Constraints

- buscosun Fusion is used, never changed: `git diff -- src/pointForecast src/point src/fusion` must stay empty. Field contract `src/point/fieldFormat.ts` is read-only.
- No new shader, no custom WebGL layer, no new dependency (CLAUDE.md STOPP rules).
- Flag `?sk=1` (also `?sk=true`) turns everything on; without it the page is pixel-identical to HEAD (Rule 2). `?sk=0`/absent = today's ICON-D2 line.
- Do not edit HZS files (`src/nowcast/heightTime/**`) or ZT files (`src/nowcast/cellTowers/**`); in `NowcastDeck.tsx` only add the SK lines described here plus the single prop `onStageReady={…}` on `<TowerStage …/>` inside `towerStage(variant)`. In `NowcastRadarMap.tsx` only additive props/lines. Do not edit `MapView.tsx`.
- 3D layers on the ZT stage go in with `beforeId` `'zt-cone'` (exported as `ZT_FIRST_DRAPED_LAYER` from `src/nowcast/cellTowers/TowerStage.tsx`); SK ids are prefixed `sk-`.
- Texts German, code/comments English. Name: always "buscosun Fusion"; the field label stays "Modell · Cube"; the version name comes from the field manifest (`chain.options.fusionName`), the place sentence names `FUSION_NAME` from `fusionRelease.ts`.
- Snowline colour `#4F5FB8` (`--np-snowline`), white casing. Label format exactly: `Schneefallgrenze 1 400 m (1 200–1 650 m)` — values rounded to 50 m, thousands separated by a space; without band: `Schneefallgrenze 1 400 m (ohne Spanne)`.
- Every set constant is marked `// set` in a comment (provenance rule).
- Mobile changes only via the 767 px breakpoint; touch targets ≥ 44 px.
- No commits — Jan commits (CLAUDE.md "Keine Commits ohne Auftrag"). Each task ends with its verifier block green instead.
- Verifiers via PowerShell, never with `2>&1`; call scripts directly with node (npm swallows `--` args).

## Review Focus

1. Map time beyond the field (> +48 h from now, or field run missing / index unreachable): no tint at all and a visible hint — never a stale field hour. Test: Task 2 `pickSnowLead` returns `null` beyond t2 tolerance; Task 6 info `status:'ready'` with `notes` containing the gap text and an empty image.
2. Field cells with A = 0 (e.g. ICON-CH masks snowlmt without precipitation) inside the viewport: transparent, counted as gap, and the contour line must not trace the gap border. Test: Task 3 C5/C6.
3. Viewport crossing the field domain edge (west of 5.5° E / south of 45.5° N): outside = no tint, no line along the domain border. Test: Task 3 C6 (border split) + Task 2 B4 (`snowAt` returns `undefined` outside).
4. Pitched 3D stage: `getBounds()` can span far beyond the screen; the raster must clip to the field domain and to a max span so the image stays bounded. Test: Task 6 `capViewFor` E-case.
5. Location below sea-level DEM noise / DEM tile 404: pixel without elevation = transparent, not "cap". Test: Task 3 C4.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/snowCap/snowCapModel.ts` (new) | Flag, constants, label/phase formatting, probability at height, colour palettes — pure, import-light |
| `src/snowCap/snowField.ts` (new) | Read field index/manifests (t1, t2) for snowlmt, pick the lead for a time, decode PNG → grid, bilinear sample — pure except injected loaders |
| `src/snowCap/capRaster.ts` (new) | Build cap image (Mercator rows) + contour lines from DEM tiles + snow grid + wet sampler — pure, async time-sliced |
| `src/snowCap/capWet.ts` (new) | Wet weight grid on the field grid: radar (DE/AT/CH stacks at the time) else field chance — pure core + loaders |
| `src/snowCap/snowCapLayer.ts` (new) | MapLibre adapter: sources/layers `sk-*`, `setVisible`, `setData`, `remove`, re-insert on `styledata` |
| `src/snowCap/snowCapEngine.ts` (new, lazy chunk) | Orchestrates: field + wet for a time, DEM for a view, builds the raster, hover/pick text |
| `src/snowCap/useSnowCap.ts` (new) | React hook per map: lazy-load engine, recompute on time key and `moveend`, hover/pick functions, info |
| `src/snowCap/snowArrival.ts` (new) | Place sentence: wraps HZS `snowSentence`, adds "Bei dir bleibt es Regen" + chance, 48-h bar cells — pure |
| `src/snowCap/useSnowArrival.ts` (new) | Fetch buscosun Fusion at the place (50 h, cube) and build the sentence |
| `src/snowCap/SnowCapUi.tsx` + `snowCap.css` (new) | Card in readout/Schnellblick with 48-h bar; legend/hint on the map; 3D tap popup content |
| `src/nowcast/NowcastRadarMap.tsx` (modify, additive) | prop `snowCap`, suppress old line when set, 2D hook, legend/hint, hover |
| `src/nowcast/NowcastDeck.tsx` (modify, additive) | flag, `skPickMs`, stage map state, `onStageReady`, card in Readout/Glance, map props, dock sub-label |
| `scripts/verify-snowcap.mjs` (new) + `package.json` + `.github/workflows/ci.yml` | `verify:snowcap` blocks A–G (+ L live) |
| `audit/schneefallgrenze-flaeche.md`, `CLAUDE.md`, `MANUELLE-SCHRITTE.md` | §7 Umsetzung + gates; status row; Jan's gates |

---

### Task 1: Model, flag and verifier skeleton

**Files:**
- Create: `src/snowCap/snowCapModel.ts`
- Create: `scripts/verify-snowcap.mjs`
- Modify: `package.json` (scripts: add `verify:snowcap` after `verify:height-time`)

**Interfaces:**
- Produces: `snowCapEnabledFrom(search: string): boolean`; constants `SK_ALPHA_DRY`, `SK_ALPHA_WET`, `SK_HATCH_PERIOD`, `SK_HATCH_WIDTH`, `SK_HATCH_ALPHA`, `SK_RADAR_WET_MMH`, `SK_RADAR_FULL_MMH`, `SK_LINE_COLOR`, `SK_PICK_HOURS`; `type CapPalette = { cap: [number,number,number]; hatch: [number,number,number]; alphaScale: number }`; `SK_PALETTE_2D`, `SK_PALETTE_3D`; `snowProbAt(h: number, mid: number, half: number): number`; `type SkPhase = 'snow'|'sleet'|'rain'`; `PHASE_WORD_SK: Record<SkPhase, string>`; in `src/snowCap/snowPhase.ts`: `phaseAt(h, mid, half): SkPhase`; `round50(m: number): number`; `fmtSnowLine(mid: number, half: number): string`; `radarWeight(mmh: number | null): number | null`.

- [ ] **Step 1: Write the failing verifier block A**

Create `scripts/verify-snowcap.mjs`:

```js
/**
 * verify-snowcap.mjs — Phase SK (audit/schneefallgrenze-flaeche.md): Schneefallgrenze als Fläche im Gelände (`?sk=1`).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-snowcap.mjs [--live]
 *
 * A Modell: Schalter, Wahrscheinlichkeit/Phase in der Höhe, Beschriftung (50 m, Leerzeichen), Radar-Gewicht.
 * B Feld: Schritt zur Zeit (t1 ±30 min vor t2 ±90 min, sonst keiner), Dekodierung (A = 0 ⇒ NaN), bilinear, außerhalb.
 * C Bild: Kappe über p50, Band schraffiert p10…p90, Deckkraft nach Nässe, Lücken durchsichtig, Linie an der richtigen
 *   Höhe, kein Linienzug am Rand/an Lücken; Negativkontrolle.
 * D Nässe: Radar vor Feld, Länderregel, Zeitfenster des Radars, Feld-Chance als Rückfall.
 * E Ansicht: Ausschnitt geklemmt (Feldgebiet, Spannweite), DEM-Zoom.
 * F Satz am Ort: snowSentence unverändert durchgereicht, „Bei dir bleibt es Regen", Chance, 48-h-Leiste.
 * G Verdrahtung: ohne Schalter nichts, alte Linie nur mit Schalter unterdrückt, Lazy-Chunk, buscosun Fusion unverändert.
 * L (--live) am jüngsten echten t1-Feld.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  snowCapEnabledFrom, snowProbAt, fmtSnowLine, round50, radarWeight, SK_RADAR_WET_MMH, SK_RADAR_FULL_MMH,
} from '../src/snowCap/snowCapModel.ts';
import { phaseAt } from '../src/snowCap/snowPhase.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
let pass = 0, fail = 0;
const add = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 9, 12, 20, 0);

console.log('\n== A Modell ==');
add('A1 Schalter: `?sk=1`/`?sk=true` an, sonst aus',
  snowCapEnabledFrom('?sk=1') && snowCapEnabledFrom('?a=2&sk=true') && !snowCapEnabledFrom('') && !snowCapEnabledFrom('?sk=0') && !snowCapEnabledFrom('?sk=2'));
add('A2 P(Schnee) in der Höhe: Mitte ⇒ 0,5; p90-Höhe ⇒ 0,9; p10-Höhe ⇒ 0,1; ohne Band Stufe',
  Math.abs(snowProbAt(1400, 1400, 250) - 0.5) < 1e-9 && Math.abs(snowProbAt(1650, 1400, 250) - 0.9) < 2e-3
  && Math.abs(snowProbAt(1150, 1400, 250) - 0.1) < 2e-3 && snowProbAt(1400, 1400, 0) === 1 && snowProbAt(1399, 1400, 0) === 0);
add('A3 Phase nach buscosun-Fusion-Schwellen 0,25/0,75: weit oben Schnee, Mitte Schneeregen, weit unten Regen',
  phaseAt(2000, 1400, 250) === 'snow' && phaseAt(1400, 1400, 250) === 'sleet' && phaseAt(800, 1400, 250) === 'rain');
add('A4 Beschriftung: 50-m-Raster, Leerzeichen-Tausender, Spanne; ohne Band benannt',
  fmtSnowLine(1412, 228) === 'Schneefallgrenze 1 400 m (1 200–1 650 m)' && fmtSnowLine(980, 0) === 'Schneefallgrenze 1 000 m (ohne Spanne)'
  && round50(1374) === 1350 && round50(1375) === 1400, fmtSnowLine(1412, 228));
add('A5 Radar-Gewicht: < 0,1 mm/h ⇒ 0, ab 0,5 mm/h ⇒ 1, dazwischen linear, null bleibt null',
  radarWeight(0.05) === 0 && radarWeight(SK_RADAR_FULL_MMH) === 1 && radarWeight(5) === 1 && radarWeight(null) === null
  && Math.abs(radarWeight(0.25) - 0.25 / SK_RADAR_FULL_MMH) < 1e-9 && SK_RADAR_WET_MMH === 0.1);

// ── later blocks are appended by later tasks above this line ──
console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
```

Add to `package.json` `scripts` (after `verify:height-time`):

```json
    "verify:snowcap": "node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-snowcap.mjs",
```

- [ ] **Step 2: Run it to verify it fails**

Run (PowerShell): `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-snowcap.mjs`
Expected: FAIL — `Cannot find module '…/src/snowCap/snowCapModel.ts'`.

- [ ] **Step 3: Implement `src/snowCap/snowCapModel.ts`**

```ts
/**
 * Phase SK (audit/schneefallgrenze-flaeche.md): the snowfall line of buscosun Fusion as a surface on the terrain — model
 * constants and pure helpers. Import-FREE on purpose: the deck and the map read the flag/constants without pulling any
 * buscosun Fusion module into their chunks (the phase word lives in `snowPhase.ts`, loaded only by the lazy part).
 */
export type SkPhase = 'snow' | 'sleet' | 'rain';

/** Rule 2: `?sk=1` (or `true`) on, default off (E-SK-7). */
export function snowCapEnabledFrom(search: string): boolean {
  const v = new URLSearchParams(search).get('sk');
  return v === '1' || v === 'true';
}

/** Cap opacity where it is dry / where it precipitates (E-SK-3) — set, tuned on the device. */
export const SK_ALPHA_DRY = 0.16; // set
export const SK_ALPHA_WET = 0.55; // set
/** Band hatch: period and line width in image pixels, opacity — set. */
export const SK_HATCH_PERIOD = 6; // set
export const SK_HATCH_WIDTH = 1.4; // set
export const SK_HATCH_ALPHA = 0.5; // set
/** Radar weight: wet from 0.1 mm/h (the radar's drizzle floor), full from 0.5 mm/h — set. */
export const SK_RADAR_WET_MMH = 0.1; // set
export const SK_RADAR_FULL_MMH = 0.5; // set
/** Snowline colour of the Regenradar 2.0 sign language (`--np-snowline`). */
export const SK_LINE_COLOR = '#4F5FB8';
/** Hours the place bar offers as map time (E-SK-2). */
export const SK_PICK_HOURS = 48;

export interface CapPalette { cap: [number, number, number]; hatch: [number, number, number]; alphaScale: number }
/** 2D: the radar map lies under `basemap-dim` (dark) — white cap and white hatch. */
export const SK_PALETTE_2D: CapPalette = { cap: [250, 252, 255], hatch: [250, 252, 255], alphaScale: 1 };
/** 3D: light positron relief with hill shading — white cap a bit stronger, hatch in snowline blue. */
export const SK_PALETTE_3D: CapPalette = { cap: [255, 255, 255], hatch: [79, 95, 184], alphaScale: 1.35 };

const Z90 = 1.2815515655446004;

function erf(x: number): number {
  const s = Math.sign(x); const a = Math.abs(x); const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/** P(snow at height h) = P(snowline ≤ h) for the field's normal band (mid ∓ 1.2816 σ = p10…p90); without band a step. */
export function snowProbAt(h: number, mid: number, half: number): number {
  if (!(half > 0)) return h >= mid ? 1 : 0;
  const sigma = half / Z90;
  return 0.5 * (1 + erf((h - mid) / (sigma * Math.SQRT2)));
}

export const PHASE_WORD_SK: Record<SkPhase, string> = { snow: 'Schnee', sleet: 'Schneeregen', rain: 'Regen' };

export const round50 = (m: number) => Math.round(m / 50) * 50;
const fmtM = (m: number) => Math.round(m).toLocaleString('de-DE').replace(/\./g, ' ');

/** "Schneefallgrenze 1 400 m (1 200–1 650 m)" — values on a 50 m grid. */
export function fmtSnowLine(mid: number, half: number): string {
  const head = `Schneefallgrenze ${fmtM(round50(mid))} m`;
  if (!(half > 0)) return `${head} (ohne Spanne)`;
  return `${head} (${fmtM(round50(mid - half))}–${fmtM(round50(mid + half))} m)`;
}

/** Radar intensity → wet weight 0…1 (E-SK-3); `null` = no radar value there. */
export function radarWeight(mmh: number | null): number | null {
  if (mmh == null || !Number.isFinite(mmh)) return null;
  if (mmh < SK_RADAR_WET_MMH) return 0;
  return Math.min(1, mmh / SK_RADAR_FULL_MMH);
}
```

Note: `Math.round(1375/50)*50 = 1400` (A4 relies on JS `Math.round` half-up) — correct.

Also create `src/snowCap/snowPhase.ts` (imported only by the lazy engine and the verifier — it pulls `fusion/meteo.ts`):

```ts
/** Phase SK: phase word at a height with the thresholds buscosun Fusion uses at the point (`phaseLabel`: ≥ 0.75 snow,
 *  ≤ 0.25 rain) — read, never changed. */
import { phaseLabel } from '../pointForecast/fusion/meteo';
import { snowProbAt, type SkPhase } from './snowCapModel';

export function phaseAt(h: number, mid: number, half: number): SkPhase {
  return phaseLabel(snowProbAt(h, mid, half));
}
```

(The verifier of Step 1 already imports `phaseAt` from `snowPhase.ts`.)

Add to block A:

```js
add('A6 Modell importfrei (Deck/Karte ziehen kein buscosun-Fusion-Modul)', !/^import /m.test(src('src/snowCap/snowCapModel.ts')));
```

- [ ] **Step 4: Run block A — expect 6 ✓ / 0 ✗**

Run: `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-snowcap.mjs`

---

### Task 2: Field reader `snowField.ts`

**Files:**
- Create: `src/snowCap/snowField.ts`
- Modify: `scripts/verify-snowcap.mjs` (block B before the summary line)

**Interfaces:**
- Consumes: `fieldFormat.ts` (`FIELD_INDEX_PATH`, `FIELD_MANIFEST_FILE`, `fieldRunDir`, `parseFieldIndex`, `parseFieldManifest`, `decodeSnowPixel`, `FieldGrid`), `cubeFormat.ts` (`TIER_BY_ID`, `TierId`).
- Produces:
  - `interface SnowFieldTier { tier: TierId; run: string; runAtMs: number; stepH: number; grid: FieldGrid; leads: Array<{ leadH: number; validAtMs: number; file: string | null }>; fusionName: string | null }`
  - `type JsonFetcher = (path: string) => Promise<unknown>`
  - `loadSnowTiers(getJson: JsonFetcher): Promise<{ tiers: SnowFieldTier[]; notes: string[] }>`
  - `pickSnowLead(tiers: readonly SnowFieldTier[], tMs: number): { tier: SnowFieldTier; lead: SnowFieldTier['leads'][number] } | null` — t1 within ±30 min, else t2 within ±90 min (t3 has no snowline).
  - `interface SnowGrid { grid: FieldGrid; mid: Float32Array; half: Float32Array }` (row 0 = north, NaN = missing)
  - `snowGridFromRgba(rgba: ArrayLike<number>, grid: FieldGrid): SnowGrid`
  - `snowAt(g: SnowGrid, lat: number, lon: number): { mid: number; half: number } | null | undefined` — bilinear over valid corners; `undefined` outside the grid, `null` all corners missing.

- [ ] **Step 1: Append failing block B to the verifier**

Add imports at the top of `scripts/verify-snowcap.mjs`:

```js
import { pickSnowLead, snowGridFromRgba, snowAt } from '../src/snowCap/snowField.ts';
import { encodeSnowPixel, fieldGrid } from '../src/point/fieldFormat.ts';
import { TIER_BY_ID } from '../src/point/cubeFormat.ts';
```

Insert before the summary line:

```js
console.log('\n== B Feld ==');
{
  const t1 = { tier: 't1', run: 'R1', runAtMs: NOW - 5 * H, stepH: 1, grid: null, fusionName: 'buscosun Fusion 12',
    leads: Array.from({ length: 49 }, (_, L) => ({ leadH: L, validAtMs: NOW - 5 * H + L * H - 20 * 60_000, file: `snowlmt-${String(L).padStart(3, '0')}.png` })) };
  const t2 = { tier: 't2', run: 'R2', runAtMs: NOW - 8 * H, stepH: 3, grid: null, fusionName: null,
    leads: Array.from({ length: 24 }, (_, k) => { const L = 51 + 3 * k; return { leadH: L, validAtMs: NOW - 8 * H + L * H - 20 * 60_000, file: `snowlmt-${L}.png` }; }) };
  const a = pickSnowLead([t1, t2], NOW + 2 * H);
  const b = pickSnowLead([t1, t2], t1.leads[48].validAtMs + 60 * 60_000);
  const c = pickSnowLead([t1, t2], NOW + 400 * H);
  add('B1 Schritt: t1 nächste Stunde (±30 min) vor t2; jenseits t1 der t2-Schritt ±90 min; jenseits t2 keiner',
    a?.tier.tier === 't1' && Math.abs(a.lead.validAtMs - (NOW + 2 * H)) <= 30 * 60_000 && b?.tier.tier === 't2' && c === null, `${a?.lead.leadH}/${b?.lead.leadH}`);
  add('B1b Schritt ohne Datei (file null) zählt nicht', pickSnowLead([{ ...t1, leads: t1.leads.map((l) => ({ ...l, file: null })) }], NOW + 2 * H) === null);
}
{
  const tier = TIER_BY_ID.t1;
  const grid = fieldGrid(tier);
  const W = grid.width, Hh = grid.height;
  const rgba = new Uint8Array(W * Hh * 4);
  // west half: mid 1400 band ±250; east half: missing (A = 0) except one column
  for (let r = 0; r < Hh; r++) for (let c = 0; c < W; c++) {
    const o = (r * W + c) * 4;
    encodeSnowPixel(c < W / 2 ? { mid: 1400, half: 250, prov: 'divergence' } : null, rgba, o);
  }
  const g = snowGridFromRgba(rgba, grid);
  const west = snowAt(g, 50, 7), east = snowAt(g, 50, 16), out = snowAt(g, 40, 7);
  add('B2 Dekodierung: Mitte/halbe Breite in 25-m-Schritten; A = 0 ⇒ NaN (nie 0)',
    g.mid[0] === 1400 && g.half[0] === 250 && Number.isNaN(g.mid[W - 1]) && Number.isNaN(g.half[W - 1]));
  add('B3 Abtastung: Westhälfte 1400 ± 250; Osthälfte ganz fehlend ⇒ null', west?.mid === 1400 && west?.half === 250 && east === null);
  add('B4 außerhalb des Feldgebiets ⇒ undefined (keine Tönung, kein Rand-Wert)', out === undefined && snowAt(g, 50, 4) === undefined);
  // bilinear between two valid columns
  const rgba2 = new Uint8Array(W * Hh * 4);
  for (let r = 0; r < Hh; r++) for (let c = 0; c < W; c++) encodeSnowPixel({ mid: 1000 + 100 * (c % 2), half: 0, prov: 'none' }, rgba2, (r * W + c) * 4);
  const g2 = snowGridFromRgba(rgba2, grid);
  const midLon = grid.lon0 + 0.5 * grid.deg; // halfway between column 0 (1000) and 1 (1100)
  const s = snowAt(g2, grid.lat0 + 10 * grid.deg, midLon);
  add('B5 bilinear zwischen zwei Zellmitten (1000/1100 ⇒ 1050)', s != null && Math.abs(s.mid - 1050) < 1e-6, `${s?.mid}`);
}
```

- [ ] **Step 2: Run — expect B FAIL (module missing)**

- [ ] **Step 3: Implement `src/snowCap/snowField.ts`**

```ts
/**
 * Phase SK: the snowfall line of the Fusion map field (`snowlmt-<LLL>.png`, label "Modell · Cube"; NP-0b contract in
 * `point/fieldFormat.ts`). t1 0–48 h hourly, t2 51–120 h every 3 h; t3 carries none. Pure except the injected loader.
 */
import { TIER_BY_ID, type TierId } from '../point/cubeFormat';
import {
  FIELD_INDEX_PATH, FIELD_MANIFEST_FILE, fieldRunDir, parseFieldIndex, parseFieldManifest, decodeSnowPixel, type FieldGrid,
} from '../point/fieldFormat';

const MIN = 60_000;

export interface SnowFieldTier {
  tier: TierId;
  run: string;
  runAtMs: number;
  stepH: number;
  grid: FieldGrid;
  leads: Array<{ leadH: number; validAtMs: number; file: string | null }>;
  /** Stand of buscosun Fusion the field was BUILT with (manifest `chain.options.fusionName`). */
  fusionName: string | null;
}

export type JsonFetcher = (path: string) => Promise<unknown>;

export async function loadSnowTiers(getJson: JsonFetcher): Promise<{ tiers: SnowFieldTier[]; notes: string[] }> {
  const idx = parseFieldIndex(await getJson(FIELD_INDEX_PATH));
  if (!idx) return { tiers: [], notes: ['Index der Kartenfelder unbekannt'] };
  const tiers: SnowFieldTier[] = [];
  const notes: string[] = [];
  for (const tierId of ['t1', 't2'] as TierId[]) {
    const e = idx.latestByTier[tierId];
    if (!e) { notes.push(`${tierId}: kein Feld im Index`); continue; }
    try {
      const man = parseFieldManifest(await getJson(`${fieldRunDir(e.run, tierId)}/${FIELD_MANIFEST_FILE}`));
      if (!man) { notes.push(`${tierId}: Manifest ungültig`); continue; }
      tiers.push({
        tier: tierId, run: man.run, runAtMs: man.runAtMs, stepH: TIER_BY_ID[tierId].stepH, grid: man.grid,
        leads: man.leads.map((l) => ({ leadH: l.leadH, validAtMs: l.validAtMs, file: l.snowlmt })),
        fusionName: typeof man.chain?.options?.fusionName === 'string' ? (man.chain.options.fusionName as string) : null,
      });
    } catch (err) { notes.push(`${tierId}: Manifest nicht lesbar (${err instanceof Error ? err.message : String(err)})`); }
  }
  return { tiers, notes };
}

/** Tolerance per tier: the snowline is an instant value, the nearest native step within half a step counts. */
const TOL_MS: Record<string, number> = { t1: 30 * MIN, t2: 90 * MIN };

export function pickSnowLead(tiers: readonly SnowFieldTier[], tMs: number): { tier: SnowFieldTier; lead: SnowFieldTier['leads'][number] } | null {
  for (const id of ['t1', 't2']) {
    const t = tiers.find((x) => x.tier === id);
    if (!t) continue;
    let best: SnowFieldTier['leads'][number] | null = null;
    for (const l of t.leads) {
      if (!l.file) continue;
      const d = Math.abs(l.validAtMs - tMs);
      if (d <= TOL_MS[id] && (!best || d < Math.abs(best.validAtMs - tMs))) best = l;
    }
    if (best) return { tier: t, lead: best };
  }
  return null;
}

export interface SnowGrid { grid: FieldGrid; mid: Float32Array; half: Float32Array }

export function snowGridFromRgba(rgba: ArrayLike<number>, grid: FieldGrid): SnowGrid {
  const n = grid.width * grid.height;
  const mid = new Float32Array(n), half = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const v = decodeSnowPixel(rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]);
    mid[i] = v ? v.mid : NaN;
    half[i] = v ? v.half : NaN;
  }
  return { grid, mid, half };
}

/** Bilinear between the four surrounding cell centres, renormalised over the valid ones (row 0 = north). */
export function snowAt(g: SnowGrid, lat: number, lon: number): { mid: number; half: number } | null | undefined {
  const { width: W, height: Hh, lon0, lat0, deg } = g.grid;
  const fx = (lon - lon0) / deg, fy = (lat - lat0) / deg; // fy counts from the south
  if (fx < -0.5 || fy < -0.5 || fx > W - 0.5 || fy > Hh - 0.5) return undefined;
  const x0 = Math.max(0, Math.min(W - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(Hh - 1, Math.floor(fy)));
  const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(Hh - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
  let ws = 0, m = 0, h = 0;
  const take = (x: number, y: number, w: number) => {
    if (w <= 0) return;
    const i = (Hh - 1 - y) * W + x;
    const a = g.mid[i];
    if (Number.isNaN(a)) return;
    ws += w; m += w * a; h += w * g.half[i];
  };
  take(x0, y0, (1 - tx) * (1 - ty)); take(x1, y0, tx * (1 - ty)); take(x0, y1, (1 - tx) * ty); take(x1, y1, tx * ty);
  if (ws <= 1e-9) return null;
  return { mid: m / ws, half: h / ws };
}
```

- [ ] **Step 4: Run — expect A + B green (12 ✓)**

---

### Task 3: Cap raster and contour lines `capRaster.ts`

**Files:**
- Create: `src/snowCap/capRaster.ts`
- Modify: `scripts/verify-snowcap.mjs` (block C)

**Interfaces:**
- Consumes: `snowAt`, `SnowGrid` (Task 2); `CapPalette`, `SK_*` alphas/hatch, `fmtSnowLine` (Task 1); `isoRingsGrid` from `src/precipChance/contours.ts`; `type ElevationTiles` from `src/fusion/elevation.ts`.
- Produces:
  - `interface CapView { west: number; east: number; north: number; south: number; width: number; height: number }`
  - `type WetSampler = (lat: number, lon: number) => number | null` (0…1, null = unknown ⇒ treated as dry)
  - `interface CapResult { rgba: Uint8ClampedArray; width: number; height: number; corners: [[number, number], [number, number], [number, number], [number, number]]; lines: GeoJSON.FeatureCollection; stats: { pixels: number; cap: number; band: number; gap: number; noDem: number } }`
  - `demAt(dem: ElevationTiles, lon: number, lat: number): number` (bilinear Terrarium, NaN without tile)
  - `buildCap(inp: { view: CapView; dem: ElevationTiles; snow: SnowGrid; wet: WetSampler; palette: CapPalette; sliceMs?: number; yieldFn?: () => Promise<void>; signal?: AbortSignal }): Promise<CapResult>`
  - `mercRowLat(view: CapView, j: number): number`, `colLon(view: CapView, i: number): number` (pixel centres)

- [ ] **Step 1: Append failing block C**

Imports:

```js
import { buildCap, demAt, mercRowLat, colLon } from '../src/snowCap/capRaster.ts';
import { SK_PALETTE_2D, SK_ALPHA_DRY, SK_ALPHA_WET } from '../src/snowCap/snowCapModel.ts';
```

Helpers + tests:

```js
console.log('\n== C Bild ==');
// Synthetic Terrarium tiles: elevation rises linearly from south (0 m) to north (3000 m) across the view.
function synthDem(view, z, elevAt) {
  const lng2x = (lng) => ((lng + 180) / 360) * (1 << z);
  const lat2y = (lat) => { const r = (lat * Math.PI) / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z); };
  const x0 = Math.floor(lng2x(view.west)), x1 = Math.floor(lng2x(view.east)), y0 = Math.floor(lat2y(view.north)), y1 = Math.floor(lat2y(view.south));
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  const data = [];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const d = new Uint8ClampedArray(256 * 256 * 4);
    for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) {
      const X = tx + (px + 0.5) / 256, Y = ty + (py + 0.5) / 256;
      const lon = X / (1 << z) * 360 - 180;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * Y / (1 << z)))) * 180 / Math.PI;
      const e = elevAt(lat, lon) + 32768, o = (py * 256 + px) * 4;
      d[o] = Math.floor(e / 256); d[o + 1] = Math.floor(e) % 256; d[o + 2] = Math.round((e % 1) * 256); d[o + 3] = 255;
    }
    data.push(d);
  }
  return { zoom: z, x0, y0, nx, ny, data };
}
const VIEW = { west: 10.0, east: 11.0, north: 47.6, south: 47.0, width: 120, height: 90 };
const elevLin = (lat) => (lat - VIEW.south) / (VIEW.north - VIEW.south) * 3000;
const DEM = synthDem(VIEW, 9, elevLin);
{
  const lat = mercRowLat(VIEW, 0), lon = colLon(VIEW, 0);
  const e = demAt(DEM, lon, lat);
  add('C0 DEM-Abtastung (Terrarium bilinear) trifft die synthetische Höhe auf ±5 m', Math.abs(e - elevLin(lat)) < 5, `${e.toFixed(1)} vs ${elevLin(lat).toFixed(1)}`);
}
const tier = TIER_BY_ID.t1, fgrid = fieldGrid(tier);
const constSnow = (mid, half, holeLon = null) => {
  const rgba = new Uint8Array(fgrid.width * fgrid.height * 4);
  for (let r = 0; r < fgrid.height; r++) for (let c = 0; c < fgrid.width; c++) {
    const lonC = fgrid.lon0 + c * fgrid.deg;
    encodeSnowPixel(holeLon != null && lonC > holeLon ? null : { mid, half, prov: half > 0 ? 'divergence' : 'none' }, rgba, (r * fgrid.width + c) * 4);
  }
  return snowGridFromRgba(rgba, fgrid);
};
const noYield = () => Promise.resolve();
const alphaAt = (res, i, j) => res.rgba[(j * res.width + i) * 4 + 3] / 255;
const rowForElev = (m) => { for (let j = 0; j < VIEW.height; j++) if (elevLin(mercRowLat(VIEW, j)) <= m) return j; return VIEW.height - 1; };
{
  const res = await buildCap({ view: VIEW, dem: DEM, snow: constSnow(1500, 0), wet: () => 0, palette: SK_PALETTE_2D, yieldFn: noYield });
  const above = alphaAt(res, 60, rowForElev(2500)), below = alphaAt(res, 60, rowForElev(800));
  add('C1 Kappe über p50 (trocken = SK_ALPHA_DRY), darunter durchsichtig', Math.abs(above - SK_ALPHA_DRY) < 0.01 && below === 0, `${above.toFixed(3)}/${below}`);
  const wet = await buildCap({ view: VIEW, dem: DEM, snow: constSnow(1500, 0), wet: () => 1, palette: SK_PALETTE_2D, yieldFn: noYield });
  add('C2 nass ⇒ Kappe kräftiger (SK_ALPHA_WET)', Math.abs(alphaAt(wet, 60, rowForElev(2500)) - SK_ALPHA_WET) < 0.01);
  // line: all vertices at elevation ≈ 1500
  const verts = res.lines.features.flatMap((f) => f.geometry.coordinates.flat());
  const bad = verts.filter(([lon, lat]) => Math.abs(elevLin(lat) - 1500) > 60);
  add('C3 Linie liegt auf p50 (alle Punkte ±60 m bei 1 500 m), Beschriftung nach Vorgabe',
    verts.length > 5 && bad.length === 0 && res.lines.features[0]?.properties?.label === 'Schneefallgrenze 1 500 m (ohne Spanne)', `${verts.length} Punkte, ${bad.length} daneben`);
  // negative control: same image but snowline 2500 must move the line
  const neg = await buildCap({ view: VIEW, dem: DEM, snow: constSnow(2500, 0), wet: () => 0, palette: SK_PALETTE_2D, yieldFn: noYield });
  const negBad = neg.lines.features.flatMap((f) => f.geometry.coordinates.flat()).filter(([, lat]) => Math.abs(elevLin(lat) - 1500) > 60);
  add('C3n Gegenprobe: Grenze 2 500 m ⇒ die Linie liegt NICHT mehr bei 1 500 m', negBad.length > 0);
}
{
  const band = await buildCap({ view: VIEW, dem: DEM, snow: constSnow(1500, 300), wet: () => 0, palette: SK_PALETTE_2D, yieldFn: noYield });
  const j = rowForElev(1350); // inside band, below p50
  let hatched = 0, clear = 0;
  for (let i = 0; i < VIEW.width; i++) { if (alphaAt(band, i, j) > 0) hatched++; else clear++; }
  const jOut = rowForElev(900); let outside = 0;
  for (let i = 0; i < VIEW.width; i++) if (alphaAt(band, i, jOut) > 0) outside++;
  add('C4a Band p10…p50: Schraffur (Streifen) — Pixel teils getönt, teils frei; unter p10 nichts',
    hatched > 0 && clear > 0 && hatched < VIEW.width && outside === 0, `${hatched}/${clear}/${outside}`);
  const noDem = { ...DEM, data: DEM.data.map(() => null) };
  const nd = await buildCap({ view: VIEW, dem: noDem, snow: constSnow(1500, 300), wet: () => 1, palette: SK_PALETTE_2D, yieldFn: noYield });
  add('C4 ohne DEM-Kachel: durchsichtig, gezählt als noDem, keine Linie', nd.stats.noDem === VIEW.width * VIEW.height && nd.rgba.every((v, k) => k % 4 !== 3 || v === 0) && nd.lines.features.length === 0);
}
{
  // field gap east of 10.5° E: no tint there, no line along the gap border
  const res = await buildCap({ view: VIEW, dem: DEM, snow: constSnow(1500, 0, 10.5), wet: () => 0, palette: SK_PALETTE_2D, yieldFn: noYield });
  let eastTint = 0;
  for (let j = 0; j < VIEW.height; j++) for (let i = 0; i < VIEW.width; i++) if (colLon(VIEW, i) > 10.56 && alphaAt(res, i, j) > 0) eastTint++;
  const verts = res.lines.features.flatMap((f) => f.geometry.coordinates.flat());
  const onGapEdge = verts.filter(([lon]) => lon > 10.5 - 0.02 && lon < 10.6);
  const vertical = verts.filter(([lon, lat]) => Math.abs(elevLin(lat) - 1500) > 60);
  add('C5 Feldlücke: keine Tönung östlich der Lücke, gezählt als gap', eastTint === 0 && res.stats.gap > 0, `${eastTint}/${res.stats.gap}`);
  add('C6 keine Linie entlang Lücken- oder Bildrand (alle Linienpunkte auf 1 500 m)', vertical.length === 0, `${onGapEdge.length} am Rand, ${vertical.length} daneben`);
}
```

- [ ] **Step 2: Run — expect C FAIL**

- [ ] **Step 3: Implement `src/snowCap/capRaster.ts`**

```ts
/**
 * Phase SK: the cap image and the line — per image pixel the Terrarium height against the Fusion snowfall line.
 *   h ≥ p50          cap (white, alpha dry…wet from the wet sampler, E-SK-3)
 *   p10 ≤ h ≤ p90    band, fine diagonal hatch (on top of the cap where both apply)
 *   no field value / no DEM  transparent (gap, counted)
 * Image rows are equally spaced in Web Mercator (a MapLibre `image` source interpolates linearly in Mercator,
 * audit/karten-layer-verortung.md §14). Line = contour `h − p50 = 0` on a half-resolution grid (`isoRingsGrid`), cut
 * where it touches the image border or a gap, labelled with `fmtSnowLine` at its middle.
 * Pure and DOM-free; the loop yields every `sliceMs` (no long task on a phone).
 */
import type { ElevationTiles } from '../fusion/elevation';
import { isoRingsGrid } from '../precipChance/contours';
import { snowAt, type SnowGrid } from './snowField';
import { fmtSnowLine, SK_ALPHA_DRY, SK_ALPHA_WET, SK_HATCH_ALPHA, SK_HATCH_PERIOD, SK_HATCH_WIDTH, type CapPalette } from './snowCapModel';

export interface CapView { west: number; east: number; north: number; south: number; width: number; height: number }
export type WetSampler = (lat: number, lon: number) => number | null;
export interface CapResult {
  rgba: Uint8ClampedArray; width: number; height: number;
  corners: [[number, number], [number, number], [number, number], [number, number]];
  lines: GeoJSON.FeatureCollection;
  stats: { pixels: number; cap: number; band: number; gap: number; noDem: number };
}

const D2R = Math.PI / 180;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2));
const latOfMercY = (y: number) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;

export function colLon(v: CapView, i: number): number { return v.west + ((i + 0.5) / v.width) * (v.east - v.west); }
export function mercRowLat(v: CapView, j: number): number {
  const yN = mercY(v.north), yS = mercY(v.south);
  return latOfMercY(yN + ((j + 0.5) / v.height) * (yS - yN));
}

const lng2tileX = (lng: number, z: number) => ((lng + 180) / 360) * (1 << z);
const lat2tileY = (lat: number, z: number) => { const r = lat * D2R; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z); };
const terr = (d: Uint8ClampedArray, i: number) => d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;

/** Bilinear Terrarium height (same rule as `elevation.ts` `sample`); NaN without tile. */
export function demAt(dem: ElevationTiles, lon: number, lat: number): number {
  return demAtTile(dem, lng2tileX(lon, dem.zoom), lat2tileY(lat, dem.zoom));
}
function demAtTile(dem: ElevationTiles, fx: number, fy: number): number {
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const ix = tx - dem.x0, iy = ty - dem.y0;
  if (ix < 0 || iy < 0 || ix >= dem.nx || iy >= dem.ny) return NaN;
  const d = dem.data[iy * dem.nx + ix];
  if (!d) return NaN;
  const px = (fx - tx) * 256, py = (fy - ty) * 256;
  const i0 = Math.max(0, Math.min(255, Math.floor(px))), j0 = Math.max(0, Math.min(255, Math.floor(py)));
  const i1 = Math.min(255, i0 + 1), j1 = Math.min(255, j0 + 1);
  const ax = px - i0, ay = py - j0;
  const e0 = terr(d, (j0 * 256 + i0) * 4) * (1 - ax) + terr(d, (j0 * 256 + i1) * 4) * ax;
  const e1 = terr(d, (j1 * 256 + i0) * 4) * (1 - ax) + terr(d, (j1 * 256 + i1) * 4) * ax;
  return e0 * (1 - ay) + e1 * ay;
}

const defaultYield = () => new Promise<void>((r) => setTimeout(r, 0));

export async function buildCap(inp: {
  view: CapView; dem: ElevationTiles; snow: SnowGrid; wet: WetSampler; palette: CapPalette;
  sliceMs?: number; yieldFn?: () => Promise<void>; signal?: AbortSignal;
}): Promise<CapResult> {
  const { view: v, dem, snow, wet, palette } = inp;
  const W = v.width, Hh = v.height;
  const sliceMs = inp.sliceMs ?? 8;
  const yieldFn = inp.yieldFn ?? defaultYield;
  const rgba = new Uint8ClampedArray(W * Hh * 4);
  const diff = new Float32Array(W * Hh).fill(NaN); // h − p50, NaN = gap / no DEM
  const stats = { pixels: W * Hh, cap: 0, band: 0, gap: 0, noDem: 0 };
  const colFx = new Float64Array(W), lons = new Float64Array(W);
  for (let i = 0; i < W; i++) { lons[i] = colLon(v, i); colFx[i] = lng2tileX(lons[i], dem.zoom); }
  const aDry = Math.min(1, SK_ALPHA_DRY * palette.alphaScale), aWet = Math.min(1, SK_ALPHA_WET * palette.alphaScale);
  const aHatch = Math.min(1, SK_HATCH_ALPHA * palette.alphaScale);
  let t0 = performance.now();
  for (let j = 0; j < Hh; j++) {
    if (inp.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const lat = mercRowLat(v, j);
    const fy = lat2tileY(lat, dem.zoom);
    for (let i = 0; i < W; i++) {
      const k = j * W + i, o = k * 4;
      const h = demAtTile(dem, colFx[i], fy);
      if (!Number.isFinite(h)) { stats.noDem++; continue; }
      const s = snowAt(snow, lat, lons[i]);
      if (!s) { if (s === null) stats.gap++; continue; }
      diff[k] = h - s.mid;
      let a = 0; let rgb = palette.cap;
      if (h >= s.mid) {
        const w = Math.max(0, Math.min(1, wet(lat, lons[i]) ?? 0));
        a = aDry + (aWet - aDry) * w; stats.cap++;
      }
      if (s.half > 0 && h >= s.mid - s.half && h <= s.mid + s.half) {
        stats.band++;
        if ((i + j) % SK_HATCH_PERIOD < SK_HATCH_WIDTH) { a = Math.max(a, aHatch); rgb = palette.hatch; }
      }
      if (a > 0) { rgba[o] = rgb[0]; rgba[o + 1] = rgb[1]; rgba[o + 2] = rgb[2]; rgba[o + 3] = Math.round(a * 255); }
    }
    if (performance.now() - t0 > sliceMs) { await yieldFn(); t0 = performance.now(); }
  }
  const lines = contourLines(diff, v, snow);
  return {
    rgba, width: W, height: Hh,
    corners: [[v.west, v.north], [v.east, v.north], [v.east, v.south], [v.west, v.south]],
    lines, stats,
  };
}

/** Contour `diff = 0` on a 2× coarser grid, cut at image border and gaps, ≥ 6 vertices, label in the middle. */
function contourLines(diff: Float32Array, v: CapView, snow: SnowGrid): GeoJSON.FeatureCollection {
  const W = v.width, Hh = v.height;
  const w2 = Math.max(2, Math.floor(W / 2)), h2 = Math.max(2, Math.floor(Hh / 2));
  const g = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    let s = 0, n = 0, nan = false;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const val = diff[(Math.min(Hh - 1, y * 2 + dy)) * W + Math.min(W - 1, x * 2 + dx)];
      if (Number.isNaN(val)) nan = true; else { s += val; n++; }
    }
    g[y * w2 + x] = nan || !n ? NaN : s / n;
  }
  const bad = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > w2 - 1 || y > h2 - 1) return true;
    const xa = Math.floor(x), ya = Math.floor(y), xb = Math.min(w2 - 1, Math.ceil(x)), yb = Math.min(h2 - 1, Math.ceil(y));
    return Number.isNaN(g[ya * w2 + xa]) || Number.isNaN(g[ya * w2 + xb]) || Number.isNaN(g[yb * w2 + xa]) || Number.isNaN(g[yb * w2 + xb]);
  };
  const toLonLat = ([x, y]: [number, number]): [number, number] => {
    const i = (x + 0.5) * (W / w2) - 0.5, j = (y + 0.5) * (Hh / h2) - 0.5;
    const lon = v.west + ((i + 0.5) / W) * (v.east - v.west);
    const yN = mercY(v.north), yS = mercY(v.south);
    return [lon, latOfMercY(yN + ((j + 0.5) / Hh) * (yS - yN))];
  };
  const features: GeoJSON.Feature[] = [];
  for (const ring of isoRingsGrid(g, w2, h2, 0)) {
    let run: Array<[number, number]> = [];
    const flush = () => {
      if (run.length >= 6) {
        const coords = run.map(toLonLat);
        const [mlon, mlat] = coords[Math.floor(coords.length / 2)];
        const s = snowAt(snow, mlat, mlon);
        features.push({ type: 'Feature', properties: { label: s ? fmtSnowLine(s.mid, s.half) : '' }, geometry: { type: 'LineString', coordinates: coords } });
      }
      run = [];
    };
    for (const p of ring) { if (bad(p[0], p[1])) flush(); else run.push(p); }
    flush();
  }
  return { type: 'FeatureCollection', features };
}
```

- [ ] **Step 4: Run — A + B + C green. If C6 fails, check `bad()` against the coordinates `isoRingsGrid` emits at gap edges (frac 0.5 ⇒ half-cell positions next to NaN) before touching anything else.**

---

### Task 4: Wet weight `capWet.ts`

**Files:**
- Create: `src/snowCap/capWet.ts`
- Modify: `scripts/verify-snowcap.mjs` (block D)

**Interfaces:**
- Consumes: `radarWeight` (Task 1); `sampleRadarPoint` (`src/pointForecast/radarSample.ts`); `countryRowPicker` (`src/pointForecast/countryOfPoint.ts`); `RADAR_VMAX` (`src/radar/radarModel.ts`); `type RadarStack, RadarFrame` (`src/radar/radarFrames.ts`); `chanceAt` + `type FieldGrid`.
- Produces:
  - `frameAtTime(stack: RadarStack, tMs: number): RadarFrame | null` — nearest frame within `stepMin/2 + 1` min, else null.
  - `interface WetGrid { grid: FieldGrid; w: Float32Array; source: Uint8Array /* 0 none, 1 radar, 2 field */; radar: number; field: number }`
  - `buildWetGrid(grid: FieldGrid, stacks: Partial<Record<'DE'|'AT'|'CH', RadarStack | null>>, tMs: number, chance: Float32Array | null): WetGrid`
  - `wetSampler(wg: WetGrid): (lat: number, lon: number) => number | null` (nearest cell)

- [ ] **Step 1: Append failing block D**

```js
import { frameAtTime, buildWetGrid, wetSampler } from '../src/snowCap/capWet.ts';
```

```js
console.log('\n== D Nässe ==');
{
  const mk = (t, lead, measured) => ({ values: new Uint8Array(4), width: 2, height: 2, timeMs: t, leadMinutes: lead, measured });
  const st = { country: 'DE', source: 'radolan_rv', stepMin: 5, frames: [mk(NOW - 10 * 60_000, -10, true), mk(NOW, 0, true), mk(NOW + 120 * 60_000, 120, false)], corners: [[0,0],[0,0],[0,0],[0,0]] };
  add('D1 Radar-Frame zur Zeit: ±(Schritt/2 + 1 min), sonst keiner',
    frameAtTime(st, NOW + 2 * 60_000)?.timeMs === NOW && frameAtTime(st, NOW + 30 * 60_000) === null && frameAtTime(st, NOW + 121 * 60_000)?.leadMinutes === 120);
  const fg = fieldGrid(TIER_BY_ID.t1);
  const chance = new Float32Array(fg.width * fg.height).fill(0.8);
  const wg = buildWetGrid(fg, {}, NOW, chance);
  const s = wetSampler(wg);
  add('D2 ohne Radar trägt die Feld-Chance (0,8) — Quelle „Feld"', Math.abs(s(48, 10) - 0.8) < 1e-6 && wg.radar === 0 && wg.field > 0);
  const wg0 = buildWetGrid(fg, {}, NOW, null);
  add('D3 weder Radar noch Feld ⇒ null (zählt als trocken, nie „nass")', wetSampler(wg0)(48, 10) === null);
}
```

(The radar path is covered in the browser gate — `sampleRadarPoint` needs real stack geometry; D1 covers the time rule.)

- [ ] **Step 2: Run — expect D FAIL**

- [ ] **Step 3: Implement `src/snowCap/capWet.ts`**

```ts
/**
 * Phase SK (E-SK-3): where it actually precipitates the cap is stronger. Weight per field cell (t1 grid, 0.05°):
 * the radar of the cell's country at the map time if that country has a frame there (DE RV / AT INCA / CH rzc; country
 * rule as the precipitation map, V-FR-11), otherwise the chance of the Fusion map field for that hour. Pure.
 */
import type { FieldGrid } from '../point/fieldFormat';
import type { RadarFrame, RadarStack } from '../radar/radarFrames';
import { RADAR_VMAX } from '../radar/radarModel';
import { sampleRadarPoint } from '../pointForecast/radarSample';
import { countryRowPicker } from '../pointForecast/countryOfPoint';
import { radarWeight } from './snowCapModel';

export function frameAtTime(stack: RadarStack, tMs: number): RadarFrame | null {
  const tol = (stack.stepMin / 2 + 1) * 60_000;
  let best: RadarFrame | null = null;
  for (const f of stack.frames) {
    const d = Math.abs(f.timeMs - tMs);
    if (d <= tol && (!best || d < Math.abs(best.timeMs - tMs))) best = f;
  }
  return best;
}

export interface WetGrid { grid: FieldGrid; w: Float32Array; source: Uint8Array; radar: number; field: number }

export function buildWetGrid(grid: FieldGrid, stacks: Partial<Record<'DE' | 'AT' | 'CH', RadarStack | null>>, tMs: number, chance: Float32Array | null): WetGrid {
  const W = grid.width, Hh = grid.height, n = W * Hh;
  const w = new Float32Array(n).fill(NaN), source = new Uint8Array(n);
  const frames = { DE: stacks.DE ? frameAtTime(stacks.DE, tMs) : null, AT: stacks.AT ? frameAtTime(stacks.AT, tMs) : null, CH: stacks.CH ? frameAtTime(stacks.CH, tMs) : null };
  let radar = 0, field = 0;
  for (let r = 0; r < Hh; r++) {
    const lat = grid.lat0 + (Hh - 1 - r) * grid.deg;
    const pick = countryRowPicker(lat);
    for (let c = 0; c < W; c++) {
      const k = r * W + c, lon = grid.lon0 + c * grid.deg;
      const cc = pick(lon) as 'DE' | 'AT' | 'CH' | string;
      const st = cc === 'DE' || cc === 'AT' || cc === 'CH' ? stacks[cc] : null;
      const fr = cc === 'DE' || cc === 'AT' || cc === 'CH' ? frames[cc] : null;
      if (st && fr) {
        const v = radarWeight(sampleRadarPoint(st.source as never, fr.values, fr.width, fr.height, st.corners, lat, lon, RADAR_VMAX));
        if (v != null) { w[k] = v; source[k] = 1; radar++; continue; }
      }
      const p = chance ? chance[k] : NaN;
      if (Number.isFinite(p)) { w[k] = p; source[k] = 2; field++; }
    }
  }
  return { grid, w, source, radar, field };
}

export function wetSampler(wg: WetGrid): (lat: number, lon: number) => number | null {
  const { width: W, height: Hh, lon0, lat0, deg } = wg.grid;
  return (lat, lon) => {
    const ix = Math.round((lon - lon0) / deg), iy = Math.round((lat - lat0) / deg);
    if (ix < 0 || iy < 0 || ix >= W || iy >= Hh) return null;
    const v = wg.w[(Hh - 1 - iy) * W + ix];
    return Number.isNaN(v) ? null : v;
  };
}
```

Check before running: `countryRowPicker` returns `Country` from `src/types` — if its type is a union including other codes, the `as` cast stays; if `sampleRadarPoint`'s first param type is `RadarGridSource`, replace `as never` with that exact type imported from `radarSample.ts`.

- [ ] **Step 4: Run — A–D green**

---

### Task 5: Layer adapter `snowCapLayer.ts`

**Files:**
- Create: `src/snowCap/snowCapLayer.ts`

**Interfaces:**
- Consumes: `CapResult` (Task 3), `SK_LINE_COLOR` (Task 1).
- Produces: `class SnowCapLayer { constructor(map: maplibregl.Map, opts: { beforeId: () => string | undefined; prefix?: string }); setVisible(on: boolean): void; setData(r: Pick<CapResult, 'rgba' | 'width' | 'height' | 'corners' | 'lines'> | null): void; remove(): void }`; helper `lowestRadarLayerId(map): string | undefined` (first of `precip-rain-layer`, `precip-rain-hd-de|at|ch`, `flow-nowcast-layer` in style order, else first symbol layer).

- [ ] **Step 1: Implement** (pattern: `src/precipSums/sumMapLayer.ts`, image via canvas data URL; standard layers only):

```ts
/**
 * Phase SK: the cap on any MapLibre map — `image` source + `raster` (cap, band hatch), `line` ×2 (white casing, snowline
 * blue) and `symbol` (label along the line). Standard layers only: no shader, no WebGL change. Re-inserted after a style
 * change. 2D: below the radar layers (the radar stays readable); 3D (ZT stage): before `zt-cone`, above the radar picture.
 */
import type maplibregl from 'maplibre-gl';
import type { CapResult } from './capRaster';
import { SK_LINE_COLOR } from './snowCapModel';

const EMPTY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const RADAR_IDS = ['precip-rain-layer', 'precip-rain-hd-de', 'precip-rain-hd-at', 'precip-rain-hd-ch', 'flow-nowcast-layer'];

export function lowestRadarLayerId(map: maplibregl.Map): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  return layers.find((l) => RADAR_IDS.includes(l.id))?.id ?? layers.find((l) => l.type === 'symbol')?.id;
}

export class SnowCapLayer {
  private url = EMPTY_PNG;
  private corners: CapResult['corners'] = [[5.5, 55.5], [17.5, 55.5], [17.5, 45.5], [5.5, 45.5]];
  private lines: GeoJSON.FeatureCollection = EMPTY_FC;
  private visible = false;
  private readonly ids: { img: string; lineSrc: string; casing: string; line: string; label: string };
  private readonly onStyle = () => this.ensure();

  constructor(private readonly map: maplibregl.Map, private readonly opts: { beforeId: () => string | undefined; prefix?: string }) {
    const p = opts.prefix ?? 'sk';
    this.ids = { img: `${p}-cap`, lineSrc: `${p}-line-src`, casing: `${p}-line-casing`, line: `${p}-line`, label: `${p}-label` };
    map.on('styledata', this.onStyle);
  }

  private ensure(): void {
    const m = this.map;
    if (!m.isStyleLoaded?.() && !m.getStyle()) return;
    try {
      const vis = this.visible ? 'visible' : 'none';
      const before = this.opts.beforeId();
      const { img, lineSrc, casing, line, label } = this.ids;
      if (!m.getSource(img)) m.addSource(img, { type: 'image', url: this.url, coordinates: this.corners });
      if (!m.getLayer(img)) m.addLayer({ id: img, type: 'raster', source: img, layout: { visibility: vis }, paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, before);
      if (!m.getSource(lineSrc)) m.addSource(lineSrc, { type: 'geojson', data: this.lines });
      if (!m.getLayer(casing)) m.addLayer({ id: casing, type: 'line', source: lineSrc, layout: { visibility: vis, 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2.6, 10, 4], 'line-opacity': 0.9 } }, before);
      if (!m.getLayer(line)) m.addLayer({ id: line, type: 'line', source: lineSrc, layout: { visibility: vis, 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': SK_LINE_COLOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 10, 2] } }, before);
      if (!m.getLayer(label)) {
        m.addLayer({
          id: label, type: 'symbol', source: lineSrc,
          layout: { visibility: vis, 'symbol-placement': 'line', 'symbol-spacing': 420, 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans Regular'], 'text-keep-upright': true, 'text-max-angle': 30, 'text-padding': 6 },
          paint: { 'text-color': '#3E4C9A', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.8 },
        });
      }
    } catch { /* style loading — the next `styledata` re-inserts */ }
  }

  private all(): string[] { const i = this.ids; return [i.img, i.casing, i.line, i.label]; }

  setVisible(on: boolean): void {
    this.visible = on;
    this.ensure();
    for (const id of this.all()) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }

  setData(r: Pick<CapResult, 'rgba' | 'width' | 'height' | 'corners' | 'lines'> | null): void {
    if (!r) { this.url = EMPTY_PNG; this.lines = EMPTY_FC; }
    else {
      const c = document.createElement('canvas');
      c.width = r.width; c.height = r.height;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.putImageData(new ImageData(r.rgba as unknown as Uint8ClampedArray<ArrayBuffer>, r.width, r.height), 0, 0);
      this.url = c.toDataURL('image/png');
      this.corners = r.corners;
      this.lines = r.lines;
    }
    this.ensure();
    (this.map.getSource(this.ids.img) as maplibregl.ImageSource | undefined)?.updateImage({ url: this.url, coordinates: this.corners });
    (this.map.getSource(this.ids.lineSrc) as maplibregl.GeoJSONSource | undefined)?.setData(this.lines);
  }

  remove(): void {
    this.map.off('styledata', this.onStyle);
    try {
      for (const id of [...this.all()].reverse()) if (this.map.getLayer(id)) this.map.removeLayer(id);
      for (const id of [this.ids.img, this.ids.lineSrc]) if (this.map.getSource(id)) this.map.removeSource(id);
    } catch { /* map already gone */ }
  }
}
```

The label layer is added without `before` on purpose (labels on top of everything in 2D; in 3D below ZT's towers is irrelevant for text).

- [ ] **Step 2: `npm run typecheck` — expect 0 errors.**

---

### Task 6: Engine + hook (time, viewport, DEM, hover)

**Files:**
- Create: `src/snowCap/snowCapEngine.ts`, `src/snowCap/useSnowCap.ts`
- Modify: `scripts/verify-snowcap.mjs` (block E)

**Interfaces:**
- Consumes: Tasks 1–5; `loadElevationTiles` (`src/fusion/elevation.ts`); `fetchDataRepo`, `memoized` (`src/precipSums/obsSumStore.ts`); `decodeRgbaPngBrowser` (`src/point/client/browserPng.ts`); `loadChanceTiers`, `pickChanceStep`, `chanceGridFromRgba` (`src/precipChance/chanceField.ts`); `fieldRunDir`; `getRadarStack` (`src/radar/radarFrames.ts`).
- Produces:
  - `interface SnowCapInfo { status: 'idle' | 'loading' | 'ready' | 'error'; validMs: number | null; field: { tier: string; run: string; runAtMs: number; fusionName: string | null } | null; wet: 'radar' | 'field' | 'mixed' | 'none'; notes: string[]; gapShare: number | null; error?: string }`
  - `SNOW_CAP_IDLE: SnowCapInfo`
  - `capViewFor(bounds: { west: number; east: number; north: number; south: number }, cssW: number, cssH: number, mobile: boolean): CapView | null` — clip to field domain lon 5.5–17.5 / lat 45.5–55.5 and to a max span of 6° × 4° around the bounds' centre; width ≤ 1024 (mobile ≤ 640), height proportional in Mercator, ≥ 64; null if empty.
  - `demZoomFor(mapZoom: number, view: CapView): number` — `clamp(round(mapZoom) + 1, 5, 11)`, lowered until the tile count ≤ 30.
  - engine: `prepareSnowCapTime(tMs: number): Promise<{ info: SnowCapInfo; snow: SnowGrid | null; wet: WetGrid | null }>`; `renderSnowCap(prep, view, demZoom, palette, signal): Promise<{ result: CapResult | null; dem: ElevationTiles | null }>`; `snowCapAt(prep, dem, lat, lon): { h: number | null; mid: number; half: number; phase: SkPhase | null } | null`; `snowCapHoverText(…)`: `"Höhe 820 m · Schneefallgrenze 1 400 m (1 200–1 650 m) · Regen"`.
  - hook: `useSnowCap(map: maplibregl.Map | null, active: boolean, tMs: number | null, opts: { palette: CapPalette; beforeId: () => string | undefined; prefix: string; mobile: boolean }): { info: SnowCapInfo; hoverAt: (lat: number, lon: number) => string | null; pickAt: (lat: number, lon: number) => ReturnType<typeof snowCapAt> }`

- [ ] **Step 1: Append failing block E (pure parts of the engine live in `snowCapEngine.ts` — export `capViewFor`, `demZoomFor` from it; they must not import DOM at module top)**

```js
import { capViewFor, demZoomFor } from '../src/snowCap/snowCapEngine.ts';
```

```js
console.log('\n== E Ansicht ==');
{
  const v = capViewFor({ west: 10, east: 12, north: 48, south: 46.8 }, 800, 600, false);
  add('E1 Ausschnitt innerhalb des Feldgebiets bleibt, Breite ≤ 1024, Höhe aus Mercator-Verhältnis', v && v.west === 10 && v.east === 12 && v.width === 800 && v.height > 64, JSON.stringify(v));
  const p = capViewFor({ west: -20, east: 40, north: 70, south: 30 }, 1400, 900, false);
  add('E2 gekippte 3D-Karte (riesige Bounds): auf Feldgebiet UND ≤ 6° × 4° um die Mitte geklemmt, Breite ≤ 1024',
    p && p.west >= 5.5 && p.east <= 17.5 && p.south >= 45.5 && p.north <= 55.5 && p.east - p.west <= 6 + 1e-9 && p.north - p.south <= 4 + 1e-9 && p.width <= 1024, JSON.stringify(p));
  add('E3 außerhalb des Feldgebiets ⇒ null (keine Tönung)', capViewFor({ west: -5, east: 0, north: 44, south: 40 }, 800, 600, false) === null);
  add('E4 mobil ≤ 640 px breit', capViewFor({ west: 10, east: 12, north: 48, south: 46.8 }, 1170, 2532, true).width <= 640);
  const z = demZoomFor(12, capViewFor({ west: 10, east: 12, north: 48, south: 46.8 }, 800, 600, false));
  add('E5 DEM-Zoom ≤ 11 und höchstens 30 Kacheln', z <= 11 && z >= 5, `z${z}`);
}
```

- [ ] **Step 2: Run — expect E FAIL**

- [ ] **Step 3: Implement `src/snowCap/snowCapEngine.ts`**

```ts
/**
 * Phase SK: the computing part of the snow cap — own lazy chunk (`useSnowCap` loads it only with `?sk=1` and the layer
 * "Schneefallgrenze" on). Per map time: field step (t1, then t2) + wet grid (radar of the country, else field chance);
 * per viewport: Terrarium tiles + `buildCap`. Network via the data-repo paths of the sums (raw first, jsDelivr hedge).
 */
import type { ElevationTiles } from '../fusion/elevation';
import { loadElevationTiles } from '../fusion/elevation';
import { fieldRunDir } from '../point/fieldFormat';
import { decodeRgbaPngBrowser } from '../point/client/browserPng';
import { fetchDataRepo, memoized } from '../precipSums/obsSumStore';
import { loadChanceTiers, pickChanceStep, chanceGridFromRgba } from '../precipChance/chanceField';
import { getRadarStack, type RadarStack } from '../radar/radarFrames';
import { loadSnowTiers, pickSnowLead, snowGridFromRgba, snowAt, type SnowGrid } from './snowField';
import { buildWetGrid, wetSampler, type WetGrid } from './capWet';
import { buildCap, demAt, type CapResult, type CapView } from './capRaster';
import { PHASE_WORD_SK, fmtSnowLine, type CapPalette, type SkPhase } from './snowCapModel';
import { phaseAt } from './snowPhase';

const H = 3_600_000;
const DOMAIN = { west: 5.5, east: 17.5, south: 45.5, north: 55.5 };
const MAX_SPAN_LON = 6, MAX_SPAN_LAT = 4; // set — bounds a pitched 3D view

export interface SnowCapInfo {
  status: 'idle' | 'loading' | 'ready' | 'error';
  validMs: number | null;
  field: { tier: string; run: string; runAtMs: number; fusionName: string | null } | null;
  wet: 'radar' | 'field' | 'mixed' | 'none';
  notes: string[];
  gapShare: number | null;
  error?: string;
}
export const SNOW_CAP_IDLE: SnowCapInfo = { status: 'idle', validMs: null, field: null, wet: 'none', notes: [], gapShare: null };

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

export function capViewFor(b: { west: number; east: number; north: number; south: number }, cssW: number, cssH: number, mobile: boolean): CapView | null {
  const cx = (b.west + b.east) / 2, cy = (b.north + b.south) / 2;
  let west = Math.max(b.west, cx - MAX_SPAN_LON / 2, DOMAIN.west), east = Math.min(b.east, cx + MAX_SPAN_LON / 2, DOMAIN.east);
  let south = Math.max(b.south, cy - MAX_SPAN_LAT / 2, DOMAIN.south), north = Math.min(b.north, cy + MAX_SPAN_LAT / 2, DOMAIN.north);
  if (!(east > west) || !(north > south)) return null;
  const maxW = mobile ? 640 : 1024;
  const width = Math.max(64, Math.min(maxW, Math.round(cssW)));
  const lonSpanRad = ((east - west) * Math.PI) / 180;
  const height = Math.max(64, Math.min(maxW, Math.round((width * (mercY(north) - mercY(south))) / lonSpanRad)));
  void cssH;
  return { west, east, north, south, width, height };
}

const lng2x = (lng: number, z: number) => ((lng + 180) / 360) * (1 << z);
const lat2y = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z); };
export function demZoomFor(mapZoom: number, v: CapView): number {
  let z = Math.max(5, Math.min(11, Math.round(mapZoom) + 1));
  const tiles = (zz: number) => (Math.floor(lng2x(v.east, zz)) - Math.floor(lng2x(v.west, zz)) + 1) * (Math.floor(lat2y(v.south, zz)) - Math.floor(lat2y(v.north, zz)) + 1);
  while (z > 5 && tiles(z) > 30) z--;
  return z;
}

const imgMemo = new Map<string, Promise<{ data: Uint8Array | Uint8ClampedArray; width: number; height: number }>>();
function loadImage(path: string) {
  let p = imgMemo.get(path);
  if (!p) {
    p = memoized(`snowcap:${path}`, 'field', () => fetchDataRepo(path, 'bytes') as Promise<Uint8Array>).then(decodeRgbaPngBrowser);
    imgMemo.set(path, p);
    p.catch(() => imgMemo.delete(path));
    while (imgMemo.size > 8) imgMemo.delete(imgMemo.keys().next().value as string);
  }
  return p;
}

export interface SnowCapPrep { info: SnowCapInfo; snow: SnowGrid | null; wet: WetGrid | null }

export async function prepareSnowCapTime(tMs: number): Promise<SnowCapPrep> {
  const notes: string[] = [];
  const set = await memoized('snowcap:tiers', 'fieldIndex', () => loadSnowTiers((p) => fetchDataRepo(p, 'json')));
  notes.push(...set.notes);
  const pick = pickSnowLead(set.tiers, tMs);
  if (!pick) {
    notes.push('Schneefallgrenze für diese Zeit ohne Daten (Kartenfeld reicht 0–120 h ab Lauf; jenseits davon führt keine Quelle sie)');
    return { info: { ...SNOW_CAP_IDLE, status: 'ready', validMs: null, notes, gapShare: 1 }, snow: null, wet: null };
  }
  const { tier, lead } = pick;
  const img = await loadImage(`${fieldRunDir(tier.run, tier.tier)}/${lead.file}`);
  if (img.width !== tier.grid.width || img.height !== tier.grid.height) throw new Error(`Kartenfeld ${img.width}×${img.height} statt ${tier.grid.width}×${tier.grid.height}`);
  const snow = snowGridFromRgba(img.data, tier.grid);
  // wet: radar stacks (cached by radarFrames) + field chance of the hour on the SAME grid as the snow field (t1 or t2)
  const [de, at, ch] = await Promise.all((['DE', 'AT', 'CH'] as const).map((c) => getRadarStack(c).catch(() => null as RadarStack | null)));
  let chance: Float32Array | null = null;
  try {
    const cs = await memoized('snowcap:chance-tiers', 'fieldIndex', () => loadChanceTiers((p) => fetchDataRepo(p, 'json')));
    const hour = Math.floor(tMs / H) * H;
    const cp = pickChanceStep(cs.tiers.filter((t) => t.tier === tier.tier), hour, hour + H, 'any');
    if (cp?.file) {
      const ci = await loadImage(`${fieldRunDir(cp.tier.run, cp.tier.tier)}/${cp.file}`);
      if (ci.width === tier.grid.width && ci.height === tier.grid.height) chance = chanceGridFromRgba(ci.data, ci.width, ci.height, 'any');
    }
  } catch (e) { notes.push(`Regenchance des Felds nicht lesbar (${e instanceof Error ? e.message : String(e)})`); }
  const wet = buildWetGrid(tier.grid, { DE: de, AT: at, CH: ch }, tMs, chance);
  const kind: SnowCapInfo['wet'] = wet.radar && wet.field ? 'mixed' : wet.radar ? 'radar' : wet.field ? 'field' : 'none';
  let miss = 0; for (let i = 0; i < snow.mid.length; i++) if (Number.isNaN(snow.mid[i])) miss++;
  return {
    info: { status: 'ready', validMs: lead.validAtMs, field: { tier: tier.tier, run: tier.run, runAtMs: tier.runAtMs, fusionName: tier.fusionName }, wet: kind, notes, gapShare: miss / snow.mid.length },
    snow, wet,
  };
}

const demMemo = new Map<string, Promise<ElevationTiles>>();
function demFor(v: CapView, z: number, signal: AbortSignal): Promise<ElevationTiles> {
  const key = `${z}:${Math.floor(lng2x(v.west, z))}:${Math.floor(lat2y(v.north, z))}:${Math.floor(lng2x(v.east, z))}:${Math.floor(lat2y(v.south, z))}`;
  let p = demMemo.get(key);
  if (!p) {
    p = loadElevationTiles({ lngMin: v.west, lngMax: v.east, latMin: v.south, latMax: v.north }, z, signal);
    demMemo.set(key, p); p.catch(() => demMemo.delete(key));
    while (demMemo.size > 4) demMemo.delete(demMemo.keys().next().value as string);
  }
  return p;
}

export async function renderSnowCap(prep: SnowCapPrep, view: CapView, demZoom: number, palette: CapPalette, signal: AbortSignal): Promise<{ result: CapResult | null; dem: ElevationTiles | null }> {
  if (!prep.snow) return { result: null, dem: null };
  const dem = await demFor(view, demZoom, signal);
  const wet = prep.wet ? wetSampler(prep.wet) : () => null;
  const result = await buildCap({ view, dem, snow: prep.snow, wet, palette, signal });
  return { result, dem };
}

export function snowCapAt(prep: SnowCapPrep | null, dem: ElevationTiles | null, lat: number, lon: number): { h: number | null; mid: number; half: number; phase: SkPhase | null } | null {
  if (!prep?.snow) return null;
  const s = snowAt(prep.snow, lat, lon);
  if (!s) return null;
  const h = dem ? demAt(dem, lon, lat) : NaN;
  return { h: Number.isFinite(h) ? h : null, mid: s.mid, half: s.half, phase: Number.isFinite(h) ? phaseAt(h, s.mid, s.half) : null };
}

export function snowCapHoverText(at: ReturnType<typeof snowCapAt>): string | null {
  if (!at) return null;
  const head = at.h != null ? `Höhe ${Math.round(at.h).toLocaleString('de-DE').replace(/\./g, ' ')} m · ` : '';
  return `${head}${fmtSnowLine(at.mid, at.half)}${at.phase ? ` · ${PHASE_WORD_SK[at.phase]}` : ''}`;
}
```

Note for E1: `capViewFor` uses the CSS width directly when ≤ 1024; the test asserts `width === 800`.

- [ ] **Step 4: Implement `src/snowCap/useSnowCap.ts`**

```ts
/**
 * Phase SK: snow cap on one MapLibre map (2D map or ZT's 3D stage). Recomputes when the time key changes (5-min radar
 * frame / field hour) and after `moveend` (debounced). The engine is a lazy chunk.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import type { CapPalette } from './snowCapModel';
import type { SnowCapInfo, SnowCapPrep } from './snowCapEngine';
import type { ElevationTiles } from '../fusion/elevation';
import type { SnowCapLayer } from './snowCapLayer';

type Engine = typeof import('./snowCapEngine');
type LayerMod = typeof import('./snowCapLayer');
let engineP: Promise<[Engine, LayerMod]> | null = null;
const loadEngine = () => (engineP ??= Promise.all([import('./snowCapEngine'), import('./snowCapLayer')]).catch((e) => { engineP = null; throw e; }));

const IDLE: SnowCapInfo = { status: 'idle', validMs: null, field: null, wet: 'none', notes: [], gapShare: null };

export function useSnowCap(map: maplibregl.Map | null, active: boolean, tMs: number | null, opts: { palette: CapPalette; beforeId: () => string | undefined; prefix: string; mobile: boolean }) {
  const [info, setInfo] = useState<SnowCapInfo>(IDLE);
  const [viewTick, setViewTick] = useState(0);
  const layerRef = useRef<SnowCapLayer | null>(null);
  const prepRef = useRef<SnowCapPrep | null>(null);
  const demRef = useRef<ElevationTiles | null>(null);
  const engRef = useRef<Engine | null>(null);
  const optsRef = useRef(opts); optsRef.current = opts;
  const timeKey = tMs == null ? null : Math.round(tMs / 300_000);

  useEffect(() => () => { layerRef.current?.remove(); layerRef.current = null; }, [map]);
  useEffect(() => { layerRef.current?.setVisible(active); if (!active) setInfo(IDLE); }, [active, map]);

  // viewport: moveend → debounce 150 ms
  useEffect(() => {
    if (!map || !active) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const on = () => { if (t) clearTimeout(t); t = setTimeout(() => setViewTick((x) => x + 1), 150); };
    map.on('moveend', on);
    return () => { map.off('moveend', on); if (t) clearTimeout(t); };
  }, [map, active]);

  // time → field + wet
  useEffect(() => {
    if (!map || !active || timeKey == null) return;
    let alive = true;
    setInfo((p) => ({ ...p, status: 'loading' }));
    loadEngine()
      .then(([eng, lm]) => {
        engRef.current = eng;
        if (alive && !layerRef.current) { layerRef.current = new lm.SnowCapLayer(map, { beforeId: optsRef.current.beforeId, prefix: optsRef.current.prefix }); layerRef.current.setVisible(true); }
        return eng.prepareSnowCapTime(timeKey * 300_000);
      })
      .then((prep) => { if (!alive) return; prepRef.current = prep; setInfo(prep.info); setViewTick((x) => x + 1); })
      .catch((e) => { if (alive) setInfo((p) => ({ ...p, status: 'error', error: e instanceof Error ? e.message : String(e) })); });
    return () => { alive = false; };
  }, [map, active, timeKey]);

  // viewport or new prep → raster
  useEffect(() => {
    const eng = engRef.current, prep = prepRef.current, layer = layerRef.current;
    if (!map || !active || !eng || !prep || !layer) return;
    const ac = new AbortController();
    const b = map.getBounds();
    const c = map.getCanvas();
    const view = eng.capViewFor({ west: b.getWest(), east: b.getEast(), north: b.getNorth(), south: b.getSouth() }, c.clientWidth, c.clientHeight, optsRef.current.mobile);
    if (!view || !prep.snow) { layer.setData(null); return; }
    eng.renderSnowCap(prep, view, eng.demZoomFor(map.getZoom(), view), optsRef.current.palette, ac.signal)
      .then(({ result, dem }) => { if (ac.signal.aborted) return; demRef.current = dem; layer.setData(result); })
      .catch((e) => { if ((e as { name?: string })?.name !== 'AbortError') setInfo((p) => ({ ...p, status: 'error', error: e instanceof Error ? e.message : String(e) })); });
    return () => ac.abort();
  }, [map, active, viewTick]);

  const pickAt = useMemo(() => (lat: number, lon: number) => engRef.current?.snowCapAt(prepRef.current, demRef.current, lat, lon) ?? null, []);
  const hoverAt = useMemo(() => (lat: number, lon: number) => {
    const eng = engRef.current;
    if (!active || !eng) return null;
    return eng.snowCapHoverText(eng.snowCapAt(prepRef.current, demRef.current, lat, lon));
  }, [active]);
  return { info, hoverAt, pickAt };
}
```

- [ ] **Step 5: Run verifier (A–E green) + `npm run typecheck` (0).**

---

### Task 7: 2D map integration in `NowcastRadarMap.tsx`

**Files:**
- Modify: `src/nowcast/NowcastRadarMap.tsx` (additive only)
- Create: `src/snowCap/SnowCapUi.tsx` (legend part), `src/snowCap/snowCap.css`
- Modify: `scripts/verify-snowcap.mjs` (block G, wiring checks on source text)

**Interfaces:**
- Consumes: `useSnowCap`, `SK_PALETTE_2D`, `lowestRadarLayerId` (lazy: import the function inside `beforeId` from the already-loaded layer module is not possible synchronously — so `lowestRadarLayerId` lives in `snowCapModel.ts`? No: keep it in `snowCapLayer.ts` and pass `beforeId: () => lowestRadarLayerIdSync(map)` implemented inline in NowcastRadarMap with the same id list — see Step 2).
- Produces: prop `snowCap?: { pickMs: number | null; stageMap: maplibregl.Map | null }` on NowcastRadarMap; component `SnowCapLegend({ info }: { info: SnowCapInfo })` in `SnowCapUi.tsx`.

- [ ] **Step 1: Append failing block G (source-text wiring checks)**

```js
console.log('\n== G Verdrahtung ==');
{
  const nrm = src('src/nowcast/NowcastRadarMap.tsx');
  add('G1 Karte: Prop `snowCap` optional, alte Linie nur mit `snowCap` aus den Profil-Ebenen genommen',
    /snowCap\?:\s*\{/.test(nrm) && /snowCap\s*\?\s*[^;]*filter\(\(l\)\s*=>\s*l\s*!==\s*'snowline'\)/.test(nrm));
  add('G2 Karte: useSnowCap nur aktiv mit `snowCap` UND Ebene „snowline"', /useSnowCap\(mapInst,\s*!!snowCap\s*&&\s*layerSet\.has\('snowline'\)/.test(nrm));
  const deck = src('src/nowcast/NowcastDeck.tsx');
  add('G3 Deck: Schalter aus `?sk=1`, ohne Schalter `{}`-Props', /snowCapEnabledFrom\(/.test(deck) && /skOn\s*\?\s*\{[\s\S]*?snowCap:/.test(deck) && /:\s*\{\}\s*;/.test(deck));
  add('G4 Deck: nur `onStageReady` an der ZT-Bühne ergänzt', /<TowerStage[^>]*onStageReady=\{/.test(deck));
  const gitDiff = execFileSync('git', ['diff', '--stat', '--', 'src/pointForecast', 'src/point', 'src/fusion', 'src/MapView.tsx'], { cwd: ROOT, encoding: 'utf8' });
  add('G5 buscosun Fusion, Feldvertrag und MapView unverändert (git diff leer)', gitDiff.trim() === '', gitDiff.trim());
  const eng = src('src/snowCap/snowCapEngine.ts');
  add('G6 Rechenteil lazy: kein statischer Import von snowCapEngine außerhalb von src/snowCap', !/from '\.\.\/snowCap\/snowCapEngine'/.test(nrm + deck) && eng.length > 0);
}
```

- [ ] **Step 2: Edit `NowcastRadarMap.tsx`**

a) Imports (next to the RC imports):

```ts
// Phase SK (`?sk=1`, audit/schneefallgrenze-flaeche.md): snowfall line of buscosun Fusion as a surface on the terrain.
import { useSnowCap } from '../snowCap/useSnowCap';
import { SK_PALETTE_2D } from '../snowCap/snowCapModel';
import { SnowCapLegend } from '../snowCap/SnowCapUi';
```

b) Props interface, after `onProfileRadarPick`:

```ts
  /** Phase SK (`?sk=1`): snow cap instead of the ICON-D2 line; `pickMs` = hour chosen in the place bar (else the slider);
   *  `stageMap` = ZT's 3D map (second instance). Missing = exactly as before. */
  snowCap?: { pickMs: number | null; stageMap: maplibregl.Map | null };
```

and add `snowCap` to the destructured props of `NowcastRadarMap`.

c) `profileLayers`: replace the expression so that only with `snowCap` the old line drops out:

```ts
  const profileLayers = useMemo(() => {
    const base = sumMode || chanceMode ? layers.filter((l) => l !== 'precip') : layers;
    // Phase SK: with `?sk=1` the cap replaces the ICON-D2 line (E-SK-1); without it the list is the one before.
    return radarProfileLayers(snowCap ? base.filter((l) => l !== 'snowline') : base);
  }, [layers, sumMode, chanceMode, snowCap]);
```

(The G1 regex expects `snowCap ? base.filter((l) => l !== 'snowline')`; keep that literal shape.)

d) After `chanceMap` (needs `profileTimeMs` and `layerSet`; if `layerSet` is declared later in the component, place this after its declaration):

```ts
  // Phase SK: one hook per map — 2D below the radar, 3D (ZT stage) before `zt-cone` (above the radar picture).
  const skTimeMs = snowCap ? (snowCap.pickMs ?? profileTimeMs ?? Date.now()) : null;
  const skBeforeId2d = useCallback(() => {
    const ls = mapInst?.getStyle()?.layers ?? [];
    const radarIds = ['precip-rain-layer', 'precip-rain-hd-de', 'precip-rain-hd-at', 'precip-rain-hd-ch', 'flow-nowcast-layer'];
    return ls.find((l) => radarIds.includes(l.id))?.id ?? ls.find((l) => l.type === 'symbol')?.id;
  }, [mapInst]);
  const skBeforeId3d = useCallback(() => (snowCap?.stageMap?.getLayer('zt-cone') ? 'zt-cone' : undefined), [snowCap?.stageMap]);
  const skMobile = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches;
  const snowCap2d = useSnowCap(mapInst, !!snowCap && layerSet.has('snowline'), skTimeMs, { palette: SK_PALETTE_2D, beforeId: skBeforeId2d, prefix: 'sk', mobile: skMobile });
  const snowCap3d = useSnowCap(snowCap?.stageMap ?? null, !!snowCap && layerSet.has('snowline'), skTimeMs, { palette: SK_PALETTE_3D, beforeId: skBeforeId3d, prefix: 'sk3', mobile: skMobile });
```

(Add `SK_PALETTE_3D` to the import from `snowCapModel`. G2's regex expects `useSnowCap(mapInst, !!snowCap && layerSet.has('snowline')` — keep it literal.)

e) Hover: extend the existing ref assignment additively:

```ts
  sumHoverRef.current = sumMode ? sumMap.hoverAt : chanceMode ? chanceMap.hoverAt : (snowCap && layerSet.has('snowline') ? snowCap2d.hoverAt : null);
```

Check the hover rendering condition `(sumMode || chanceMode) && sumHover` — add `|| (!!snowCap && layerSet.has('snowline'))` to that condition so the snow hover text shows; keep the mm/h hover for the radar when `sumHover` is null (the callback already falls back when `sumHoverRef.current` returns null? It does not: it returns early. Change the callback body additively to: `if (sumHoverRef.current) { const t = p ? sumHoverRef.current(p.lat, p.lon) : null; if (t || sumMode || chanceMode) { setHover(null); setSumHover(t); return; } }` so outside the field the radar hover still works).

f) Legend: next to the existing RR note — show the old note only without `snowCap`, the new legend with it:

```tsx
        {useProfile && layerSet.has('snowline') && !snowCap && ( /* existing RR-f note unchanged */ )}
        {useProfile && layerSet.has('snowline') && snowCap && <SnowCapLegend info={snowCap2d.info} />}
```

(Wrap the existing block's condition by adding `&& !snowCap`; do not change its content.)

- [ ] **Step 3: Create `src/snowCap/SnowCapUi.tsx` (legend) and `snowCap.css`**

```tsx
/**
 * Phase SK: legend of the snow cap on the map, the place card with the 48-h bar (Task 8) and the 3D tap card (Task 9).
 * Command-Deck look (Sand/Ink, League Spartan), classes `sk-*` in `snowCap.css`.
 */
import type { SnowCapInfo } from './snowCapEngine';
import { SK_LINE_COLOR } from './snowCapModel';
import './snowCap.css';

const H = 3_600_000;
const fmtRun = (ms: number) => `${String(new Date(ms).getUTCHours()).padStart(2, '0')} UTC`;
const fmtT = (ms: number) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms).replace('.', '');

export function SnowCapLegend({ info }: { info: SnowCapInfo }) {
  const wetText = info.wet === 'radar' ? 'Radar' : info.wet === 'mixed' ? 'Radar, sonst Regenchance des Felds' : info.wet === 'field' ? 'Regenchance des Felds' : 'ohne Niederschlagsangabe';
  return (
    <div className="sk-legend" role="note">
      <div className="sk-legend-row">
        <i className="sk-sw sk-sw-cap" /> Schneefall oberhalb der Grenze
        <i className="sk-sw sk-sw-band" /> Spanne p10–p90
        <i className="sk-sw sk-sw-line" style={{ background: SK_LINE_COLOR }} /> Schneefallgrenze
      </div>
      {info.status === 'loading' && <div className="sk-legend-sub">Schneefallgrenze lädt …</div>}
      {info.status === 'error' && <div className="sk-legend-sub sk-warn">Schneefallgrenze nicht verfügbar ({info.error})</div>}
      {info.status === 'ready' && info.field && (
        <div className="sk-legend-sub">
          {info.field.fusionName ?? 'buscosun Fusion'} · Modell · Cube · Lauf {fmtRun(info.field.runAtMs)}
          {info.validMs != null && <> · gültig {fmtT(info.validMs)}</>} · kräftig, wo es niederschlägt ({wetText}) · Spanne der Modelle, unkalibriert
        </div>
      )}
      {info.status === 'ready' && !info.field && <div className="sk-legend-sub sk-warn">Keine Tönung: {info.notes[info.notes.length - 1] ?? 'keine Daten'}</div>}
      {info.status === 'ready' && info.gapShare != null && info.gapShare > 0.02 && info.field && (
        <div className="sk-legend-sub">Ohne Tönung, wo das Feld keine Grenze führt ({Math.round(info.gapShare * 100)} % der Zellen)</div>
      )}
    </div>
  );
}
void H;
```

`snowCap.css` (tokens of the deck; mobile only via 767 px):

```css
.sk-legend { position: absolute; left: 12px; bottom: 64px; max-width: min(520px, calc(100% - 24px)); background: rgba(250, 246, 234, 0.95); border: 1px solid #E0D6BE; border-radius: 10px; padding: 8px 10px; font: 500 12px/1.35 'League Spartan', system-ui, sans-serif; color: #2C2A26; z-index: 3; }
.sk-legend-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.sk-legend-sub { margin-top: 4px; color: #5C5447; font-size: 11.5px; }
.sk-warn { color: #8B4A1F; }
.sk-sw { display: inline-block; width: 14px; height: 10px; border-radius: 2px; vertical-align: middle; }
.sk-sw-cap { background: #FBFCFF; border: 1px solid #C9D3F4; }
.sk-sw-band { background: repeating-linear-gradient(45deg, #4F5FB8 0 1.5px, transparent 1.5px 5px); border: 1px solid #C9D3F4; }
.sk-sw-line { height: 3px; box-shadow: 0 0 0 1.5px #FFFFFF; }
@media (max-width: 767px) { .sk-legend { bottom: calc(96px + env(safe-area-inset-bottom)); font-size: 11.5px; } }
```

Check during the browser gate that `.sk-legend` does not cover the time axis or the existing legend; if it does, put it into the existing legend container instead (same props).

- [ ] **Step 4: verifier (A–E, G1/G2/G5/G6 green; G3/G4 still red until Task 8), typecheck 0.**

---

### Task 8: Place sentence, 48-h bar, deck wiring

**Files:**
- Create: `src/snowCap/snowArrival.ts`, `src/snowCap/useSnowArrival.ts`
- Modify: `src/snowCap/SnowCapUi.tsx` (add `SnowArrivalCard`)
- Modify: `src/nowcast/NowcastDeck.tsx` (additive)
- Modify: `scripts/verify-snowcap.mjs` (block F)

**Interfaces:**
- Consumes: from HZS `src/nowcast/heightTime/heightTimeModel.ts` (read-only): `snowPointsFromV2`, `columnsFromV2`, `snowSentence`, `wetAround`, `dayClock`, `fmtM`, types `SnowPoint`, `Column`, `SnowSentence`; `FUSION_NAME`; `getPointForecast`; `pfSourceFrom`.
- Produces:
  - `interface SnowArrival { sentence: SnowSentence; display: string; meta: string[]; hTrue: number | null; cells: Array<{ fromMs: number; toMs: number; kind: 'snow' | 'band' | 'rain' | 'gap' }> }`
  - `snowArrival(points: readonly SnowPoint[], hTrue: number | null, columns: readonly Column[], fromMs: number, hours: number): SnowArrival`
  - `useSnowArrival(p: { lat: number; lon: number; country: Country } | null, enabled: boolean): { status: 'loading' | 'ready' | 'gap'; arrival: SnowArrival | null; fusionName: string; reason: string | null }`
  - `SnowArrivalCard(props: { st: ReturnType<typeof useSnowArrival>; mapMs: number | null; pickMs: number | null; onPick: (ms: number | null) => void; variant: 'desktop' | 'mobile' })`

- [ ] **Step 1: Append failing block F**

```js
import { snowArrival } from '../src/snowCap/snowArrival.ts';
import { snowSentence } from '../src/nowcast/heightTime/heightTimeModel.ts';
```

```js
console.log('\n== F Satz am Ort ==');
{
  const from = Date.UTC(2026, 9, 9, 12);
  const pts = (fn) => Array.from({ length: 49 }, (_, k) => { const m = fn(k); return { tMs: from + k * H, p10: m - 250, p50: m, p90: m + 250 }; });
  const wetCols = (p) => Array.from({ length: 48 }, (_, k) => ({ fromMs: from + k * H, toMs: from + (k + 1) * H, stepFromMs: from + k * H, stepToMs: from + (k + 1) * H, tier: 't1', mmh: 0.5, pWet: p, pSnow: null, phase: null }));
  const sinking = pts((k) => 2000 - k * 40); // reaches 650 m around k ≈ 34
  const a = snowArrival(sinking, 650, wetCols(0.6), from, 48);
  add('F1 sinkende Grenze: Satz = snowSentence unverändert (kind reaches), Meta nennt Ortshöhe, Chance und buscosun Fusion',
    a.sentence.kind === 'reaches' && a.display === snowSentence(sinking, 650, wetCols(0.6)).text
    && a.meta.some((m) => m === 'Ortshöhe 650 m') && a.meta.some((m) => /^Niederschlag dann 60 %$/.test(m)), `${a.display} | ${a.meta.join(' | ')}`);
  const high = pts(() => 2400);
  const r = snowArrival(high, 650, wetCols(0.7), from, 48);
  add('F2 sicher darunter + Niederschlag erwartet ⇒ „Bei dir bleibt es Regen"', r.display === 'Bei dir bleibt es Regen');
  const dry = snowArrival(high, 650, wetCols(0.05), from, 48);
  add('F3 sicher darunter, aber trocken ⇒ „Kein Schnee bei dir bis …" (nie „bleibt es Regen" ohne Regen)', /^Kein Schnee bei dir bis /.test(dry.display) && dry.display !== 'Bei dir bleibt es Regen', dry.display);
  const near = pts(() => 800); // p10 550 ≤ 650 < p50 ⇒ possible, not "sicher darunter"
  const n = snowArrival(near, 650, wetCols(0.7), from, 48);
  add('F4 Grenze knapp über dem Ort (p10 ≤ Ortshöhe) ⇒ snowSentence „möglich", nie „bleibt es Regen"', n.sentence.kind === 'possible' && n.display === n.sentence.text);
  add('F5 48-h-Leiste: 48 Zellen, Schnee/Band/Regen nach p50/p10 gegen Ortshöhe, ohne Wert = gap',
    a.cells.length === 48 && a.cells[0].kind === 'rain' && a.cells[47].kind === 'snow'
    && snowArrival(sinking.map((p, k) => (k === 5 ? { ...p, p50: null, p10: null, p90: null } : p)), 650, wetCols(0.6), from, 48).cells[5].kind === 'gap');
}
```

- [ ] **Step 2: Run — F FAIL**

- [ ] **Step 3: Implement `src/snowCap/snowArrival.ts`**

```ts
/**
 * Phase SK (E-SK-5 replaced 09.10.): the place sentence is the one of Phase HZS (`snowSentence`, E-HZS-6) — unchanged.
 * SK only adds what was asked for and is missing there: "Bei dir bleibt es Regen" when the line stays SAFELY above the
 * place (p10 > height at every step with a value) and precipitation is expected (some hour P(wet) ≥ HZS_DRY_P), the
 * chance as a number, and the cells of the 48-h bar. Pure.
 */
import { snowSentence, wetAround, dayClock, fmtM, HZS_DRY_P, type Column, type SnowPoint, type SnowSentence } from '../nowcast/heightTime/heightTimeModel';

const H = 3_600_000;

export interface SnowArrival {
  sentence: SnowSentence;
  display: string;
  meta: string[];
  hTrue: number | null;
  cells: Array<{ fromMs: number; toMs: number; kind: 'snow' | 'band' | 'rain' | 'gap' }>;
}

const pct = (p: number) => `${Math.round(p * 20) * 5} %`;

export function snowArrival(points: readonly SnowPoint[], hTrue: number | null, columns: readonly Column[], fromMs: number, hours: number): SnowArrival {
  const sentence = snowSentence(points, hTrue, columns);
  let display = sentence.text;
  const meta: string[] = [];
  if (hTrue != null && Number.isFinite(hTrue)) meta.push(`Ortshöhe ${fmtM(hTrue)} m`);
  if (sentence.kind === 'stays-above' && hTrue != null) {
    const vals = points.filter((p) => p.p50 != null);
    const safe = vals.length > 0 && vals.every((p) => p.p10 != null && (p.p10 as number) > hTrue);
    const wetSomewhere = columns.some((c) => c.pWet != null && c.pWet >= HZS_DRY_P);
    if (safe) display = wetSomewhere ? 'Bei dir bleibt es Regen' : `Kein Schnee bei dir bis ${dayClock(fromMs + hours * H)}`;
  }
  if (sentence.kind === 'reaches' || sentence.kind === 'possible' || sentence.kind === 'already') {
    const w = wetAround(columns, sentence.atMs);
    if (w != null) meta.push(`Niederschlag dann ${pct(w)}`);
  }
  const cells: SnowArrival['cells'] = [];
  for (let k = 0; k < hours; k++) {
    const a = fromMs + k * H, b = a + H;
    // A native step inside the hour decides (null p50 there = gap, never borrowed); only hours without any step (3-h t2
    // steps) take the nearest step within 90 min.
    const inHour = points.find((q) => q.tMs >= a && q.tMs < b);
    const p = inHour ? (inHour.p50 != null ? inHour : null) : (points.find((q) => Math.abs(q.tMs - a) <= 90 * 60_000 && q.p50 != null) ?? null);
    let kind: 'snow' | 'band' | 'rain' | 'gap' = 'gap';
    if (p && hTrue != null) kind = (p.p50 as number) <= hTrue ? 'snow' : p.p10 != null && (p.p10 as number) <= hTrue ? 'band' : 'rain';
    cells.push({ fromMs: a, toMs: b, kind });
  }
  return { sentence, display, meta, hTrue, cells };
}
```

Before implementing, open `heightTimeModel.ts` and confirm the exact `SnowPoint` / `Column` field names (`tMs`, `p10`, `p50`, `p90`; `pWet`) and that `HZS_DRY_P`, `wetAround`, `dayClock`, `fmtM` are exported (they are as of 09.10. 15:02). Do not edit that file. If `pct` should match the RC wording "nie 0 %", reuse `fmtChancePct` from `src/precipChance/chanceModel.ts` instead and adjust F1's regex.

- [ ] **Step 4: Implement `src/snowCap/useSnowArrival.ts`** (pattern `usePointChance.ts`):

```ts
/**
 * Phase SK: buscosun Fusion in the current stage at the place (50 h, cube path, same call as chance/sums) → the place
 * sentence. No fallback to another measure: without buscosun Fusion (or `?pf=live`) the card is a named gap.
 */
import { useEffect, useState } from 'react';
import type { Country } from '../types';
import { getPointForecast } from '../pointForecast/pointForecast';
import { pfSourceFrom } from '../pointForecast/pfFlags';
import type { PointForecastV2 } from '../pointForecast/fusion/output';
import { FUSION_NAME } from '../pointForecast/fusion/fusionRelease';
import { snowPointsFromV2, columnsFromV2 } from '../nowcast/heightTime/heightTimeModel';
import { snowArrival, type SnowArrival } from './snowArrival';
import { SK_PICK_HOURS } from './snowCapModel';

const H = 3_600_000;
export interface SnowArrivalState { status: 'loading' | 'ready' | 'gap'; arrival: SnowArrival | null; fusionName: string; reason: string | null; fromMs: number }

export function useSnowArrival(p: { lat: number; lon: number; country: Country } | null, enabled: boolean): SnowArrivalState {
  const [st, setSt] = useState<SnowArrivalState>(() => ({ status: 'loading', arrival: null, fusionName: FUSION_NAME, reason: null, fromMs: Math.floor(Date.now() / H) * H }));
  const lat = p?.lat, lon = p?.lon, country = p?.country;
  useEffect(() => {
    if (!enabled || lat == null || lon == null || !country) return;
    const ac = new AbortController();
    const fromMs = Math.floor(Date.now() / H) * H, toMs = fromMs + SK_PICK_HOURS * H;
    setSt({ status: 'loading', arrival: null, fusionName: FUSION_NAME, reason: null, fromMs });
    const gap = (why: string) => setSt({ status: 'gap', arrival: null, fusionName: FUSION_NAME, reason: why, fromMs });
    if (pfSourceFrom(typeof window !== 'undefined' ? window.location.search : '') === 'live') { gap('buscosun Fusion abgeschaltet (?pf=live)'); return () => ac.abort(); }
    import('../pointForecast/cubeSource')
      .then((cs) => getPointForecast({ lat, lng: lon, country, hours: SK_PICK_HOURS + 2, signal: ac.signal, includeRadarNowcast: true, pointSource: 'cube' }).then((fc) => ({ fc, exceed: cs.exceedance })))
      .then(({ fc, exceed }) => {
        if (ac.signal.aborted) return;
        const v2 = (fc.cube as { v2?: PointForecastV2 } | undefined)?.v2;
        if (!v2) { gap('buscosun Fusion ohne Verteilung'); return; }
        const hTrue = v2.point.hTrue != null && Number.isFinite(v2.point.hTrue) ? v2.point.hTrue : null;
        const arrival = snowArrival(snowPointsFromV2(v2, fromMs, toMs), hTrue, columnsFromV2(v2, fromMs, toMs, exceed), fromMs, SK_PICK_HOURS);
        setSt({ status: 'ready', arrival, fusionName: FUSION_NAME, reason: null, fromMs });
      })
      .catch((e) => { if (!ac.signal.aborted && (e as { name?: string })?.name !== 'AbortError') gap(`buscosun Fusion nicht verfügbar (${e instanceof Error ? e.message : String(e)})`); });
    return () => ac.abort();
  }, [enabled, lat, lon, country]);
  return st;
}
```

Check `columnsFromV2`'s 4th parameter type (`Exceed | null`) against `cs.exceedance`; HZS passes the same (`useHeightTime.ts`).

- [ ] **Step 5: Add `SnowArrivalCard` to `SnowCapUi.tsx`**

```tsx
import type { SnowArrivalState } from './useSnowArrival';

export function SnowArrivalCard({ st, mapMs, pickMs, onPick, variant }: { st: SnowArrivalState; mapMs: number | null; pickMs: number | null; onPick: (ms: number | null) => void; variant: 'desktop' | 'mobile' }) {
  if (st.status === 'loading') return <div className={`sk-card sk-card--${variant}`}><span className="ev-spinner" /> buscosun Fusion rechnet die Schneefallgrenze am Ort …</div>;
  if (st.status === 'gap' || !st.arrival) return <div className={`sk-card sk-card--${variant} sk-warn`}>Schneefallgrenze am Ort: {st.reason ?? 'keine Daten'}</div>;
  const a = st.arrival;
  const marker = pickMs ?? mapMs;
  return (
    <div className={`sk-card sk-card--${variant}`}>
      <div className="sk-sentence">{a.display}</div>
      <div className="sk-meta">{[...a.meta, st.fusionName].join(' · ')}</div>
      <div className="sk-bar" role="listbox" aria-label="Kartenzeit wählen (48 h)">
        {a.cells.map((c) => {
          const on = marker != null && marker >= c.fromMs && marker < c.toMs;
          return (
            <button key={c.fromMs} type="button" role="option" aria-selected={on}
              className={`sk-cell sk-cell--${c.kind}${on ? ' is-on' : ''}`}
              title={`${fmtT(c.fromMs)} · ${c.kind === 'snow' ? 'Grenze bei dir oder tiefer' : c.kind === 'band' ? 'Grenze knapp über dir (Spanne)' : c.kind === 'rain' ? 'Grenze über dir' : 'keine Daten'}`}
              onClick={() => onPick(on && pickMs != null ? null : c.fromMs + 30 * 60_000)} />
          );
        })}
      </div>
      <div className="sk-bar-axis"><span>jetzt</span><span>+24 h</span><span>+48 h</span></div>
      {pickMs != null && <button type="button" className="sk-follow" onClick={() => onPick(null)}>Karte folgt wieder dem Slider</button>}
    </div>
  );
}
```

CSS additions in `snowCap.css`:

```css
.sk-card { background: #FAF6EA; border: 1px solid #E0D6BE; border-radius: 12px; padding: 10px 12px; margin: 6px 0 10px; font-family: 'League Spartan', system-ui, sans-serif; color: #2C2A26; }
.sk-sentence { font-size: 15px; font-weight: 600; line-height: 1.3; }
.sk-meta { font-size: 12px; color: #5C5447; margin-top: 3px; }
.sk-bar { display: grid; grid-template-columns: repeat(48, 1fr); gap: 1px; margin-top: 8px; height: 18px; }
.sk-cell { border: 0; padding: 0; min-width: 0; height: 100%; border-radius: 2px; cursor: pointer; background: #E6DFCF; }
.sk-cell--snow { background: #4F5FB8; }
.sk-cell--band { background: repeating-linear-gradient(45deg, #4F5FB8 0 1.5px, #E9ECF8 1.5px 4px); }
.sk-cell--rain { background: #D7CFBD; }
.sk-cell--gap { background: repeating-linear-gradient(45deg, #C9BFA8 0 1px, #F3EEE2 1px 4px); }
.sk-cell.is-on { outline: 2px solid #2C2A26; outline-offset: 1px; }
.sk-bar-axis { display: flex; justify-content: space-between; font-size: 11px; color: #8B7355; margin-top: 2px; }
.sk-follow { margin-top: 6px; background: none; border: 0; color: #3E4C9A; font: inherit; font-size: 12px; text-decoration: underline; cursor: pointer; padding: 0; min-height: 44px; }
@media (max-width: 767px) { .sk-bar { height: 44px; } }
```

(Mobile: cells are 44 px high so each target is ≥ 44 px tall; width 1/48 of the sheet is < 44 px — acceptable only together with the 44 px height? No: self-check question 3 requires ≥ 44 px targets. On mobile render 16 cells of 3 h instead (one button per 3 h, picks the middle hour) via `variant === 'mobile'` grouping. Implement: `const shown = variant === 'mobile' ? group3(a.cells) : a.cells;` where `group3` merges each 3 consecutive cells, kind = the "most snowy" of the three (snow > band > rain > gap), and set `grid-template-columns: repeat(16, 1fr)` in the mobile media query.)

- [ ] **Step 6: Wire `NowcastDeck.tsx` (additive, after the ZT block; never inside ZT/HZS lines except the single `onStageReady` prop)**

```ts
// Phase SK (`?sk=1`, audit/schneefallgrenze-flaeche.md): snowfall line as a surface — map props, place card, ZT stage map.
import { snowCapEnabledFrom } from '../snowCap/snowCapModel';
import { useSnowArrival } from '../snowCap/useSnowArrival';
import { SnowArrivalCard } from '../snowCap/SnowCapUi';
```

Inside the component, after the ZT block:

```ts
  const skOn = useMemo(() => snowCapEnabledFrom(typeof window !== 'undefined' ? window.location.search : ''), []);
  const skActive = skOn && layers.includes('snowline');
  const [skPickMs, setSkPickMs] = useState<number | null>(null);
  useEffect(() => { setSkPickMs(null); }, [location.lat, location.lon, location.country]);
  const [skStageMap, setSkStageMap] = useState<maplibregl.Map | null>(null);
  const skArrival = useSnowArrival({ lat: location.lat, lon: location.lon, country: location.country }, skActive && nowcast != null);
  const skCard = (variant: 'desktop' | 'mobile') => (skActive ? <SnowArrivalCard st={skArrival} mapMs={sliderMs} pickMs={skPickMs} onPick={setSkPickMs} variant={variant} /> : null);
  const skMapProps = skOn ? {
    snowCap: { pickMs: skPickMs, stageMap: skStageMap },
    ...(skActive ? {
      onTimeChange: setSliderMs,
      onUserTime: () => { setSkPickMs(null); if (chanceActive) setPickMs(null); },
    } : {}),
  } : {};
```

- Add `{...skMapProps}` as the LAST spread on both `<NowcastRadarMap …/>` elements (desktop `center` and mobile). Because it composes `onUserTime` for chance too, it may come last safely; `onTimeChange` is the same setter as RC/HZS/ZT.
- In `towerStage(variant)` add exactly one prop to `<TowerStage …/>`: `onStageReady={skOn ? setSkStageMap : undefined}`.
- `ReadoutBody` and `GlancePanel`: add optional prop `snowCard?: ReactNode` (default `null`) and render it right after `{cellCard}` (desktop) / after the RainWindowCard block (mobile) under a section label:

```tsx
      {snowCard && (<><div className="rr-section-label">Schneefallgrenze am Ort</div>{snowCard}</>)}
```

  and pass `snowCard={skCard('desktop')}` / `snowCard={skCard('mobile')}` where `ReadoutBody`/`GlancePanel` are mounted.
- Dock sub-label: where `snowSub` is computed (`const snowSub = …`), keep it; at its use `const sub = l.id === 'snowline' ? snowSub : l.sub;` change to `const sub = l.id === 'snowline' ? (skOn ? 'Fläche + Spanne · buscosun Fusion' : snowSub) : l.sub;` — only if `skOn` is in scope there (it is a separate component: pass `skOn` as an optional prop defaulting to `false`; if that touches ZT-owned lines, skip this sub-step and note it).

The G3 regex expects `skOn ? {` … `snowCap:` and a `: {};` — matches the block above.

- [ ] **Step 7: Run verifier (all A–G green except G4 if ZT renamed the prop — then read ZT's `TowerStage.tsx` and align), `npm run typecheck` 0.**

---

### Task 9: 3D — tap a slope on the ZT stage

**Files:**
- Modify: `src/nowcast/NowcastRadarMap.tsx` (additive effect next to `snowCap3d`)
- Modify: `src/snowCap/SnowCapUi.tsx` (`snowTapHtml`)

**Interfaces:**
- Consumes: `snowCap3d.pickAt` (Task 6), `PHASE_WORD_SK`, `fmtSnowLine`; ZT layer ids prefixed `zt-` (towers).
- Produces: `snowTapHtml(at: ReturnType<pickAt>): string | null` — `"<b>Höhe 1 820 m</b><br>Schneefallgrenze 1 400 m (1 200–1 650 m)<br>Schnee"`.

- [ ] **Step 1: Add `snowTapHtml` to `SnowCapUi.tsx`**

```ts
import { PHASE_WORD_SK, fmtSnowLine } from './snowCapModel';
export function snowTapHtml(at: { h: number | null; mid: number; half: number; phase: 'snow' | 'sleet' | 'rain' | null } | null): string | null {
  if (!at) return null;
  const h = at.h != null ? `Höhe ${Math.round(at.h).toLocaleString('de-DE').replace(/\./g, ' ')} m` : 'Höhe unbekannt';
  return `<div class="sk-tap"><b>${h}</b><br>${fmtSnowLine(at.mid, at.half)}<br>${at.phase ? PHASE_WORD_SK[at.phase] : '—'}<br><span>buscosun Fusion · Modell · Cube</span></div>`;
}
```

- [ ] **Step 2: Popup helper in the lazy layer module** — `NowcastRadarMap.tsx` imports `maplibregl` as a TYPE only (line 23); do not add a value import there. Add to `src/snowCap/snowCapLayer.ts`:

```ts
import maplibreglValue from 'maplibre-gl';
/** Phase SK: the 3D tap card (one at a time per map). */
export function openSnowTap(map: maplibregl.Map, lngLat: { lng: number; lat: number }, html: string, prev: maplibregl.Popup | null): maplibregl.Popup {
  prev?.remove();
  return new maplibreglValue.Popup({ closeButton: true, maxWidth: '260px', className: 'sk-popup' }).setLngLat(lngLat).setHTML(html).addTo(map);
}
```

(`maplibre-gl` is already in the map chunk; the lazy SK chunk only references it.)

- [ ] **Step 3: Effect in `NowcastRadarMap.tsx`** (after the `snowCap3d` hook):

```ts
  // Phase SK: tap a slope on the 3D stage → height, snowline, phase. A tap on a tower stays ZT's (towers first).
  useEffect(() => {
    const m = snowCap?.stageMap;
    if (!m || !layerSet.has('snowline')) return;
    let popup: maplibregl.Popup | null = null;
    let alive = true;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const towerIds = (m.getStyle()?.layers ?? []).filter((l) => l.id.startsWith('zt-tower')).map((l) => l.id);
      if (towerIds.length && m.queryRenderedFeatures(e.point, { layers: towerIds }).length) return;
      void import('../snowCap/SnowCapUi').then(({ snowTapHtml }) => {
        const html = snowTapHtml(snowCap3d.pickAt(e.lngLat.lat, e.lngLat.lng));
        if (!html || !alive) return;
        return import('../snowCap/snowCapLayer').then(({ openSnowTap }) => { if (alive) popup = openSnowTap(m, e.lngLat, html, popup); });
      });
    };
    m.on('click', onClick);
    return () => { alive = false; m.off('click', onClick); popup?.remove(); };
  }, [snowCap?.stageMap, layerSet, snowCap3d.pickAt]);
```

(`SnowCapUi` is statically imported by NowcastRadarMap already for the legend — then use the static `snowTapHtml` import instead of the dynamic one.)

Note: `pickAt` samples the DEM tiles of the stage's last raster (`demRef`); the height there is the Terrarium height of that view's zoom. If `e.lngLat` lies outside the last raster's DEM, `h` is null and the card says "Höhe unbekannt" — acceptable, named.

CSS: `.sk-tap { font: 500 12px/1.35 'League Spartan', system-ui, sans-serif; color: #2C2A26; } .sk-tap span { color: #8B7355; font-size: 11px; }`

- [ ] **Step 4: typecheck 0, verifier green.**

---

### Task 10: Gates, docs, Jan's steps

**Files:**
- Modify: `.github/workflows/ci.yml` (add a step `npm run verify:snowcap` after `verify:height-time`)
- Modify: `scripts/verify-snowcap.mjs` (block L `--live`)
- Modify: `audit/schneefallgrenze-flaeche.md` (§7 Umsetzung, §7.1 Gates, §7.2 five questions), `CLAUDE.md` (one status row + audit table row), `MANUELLE-SCHRITTE.md` (new § for SK)

- [ ] **Step 1: Block L (`--live`)**: fetch `point/field/v1/index.json` and the newest t1 `field.json` + one `snowlmt-012.png` from `https://raw.githubusercontent.com/jppetry/buscosun-data/main/…` (`fetch`), decode with `decodePng`/`toRgba` from `scripts/lib/png.mjs`, build `snowGridFromRgba`, and check: ≥ 50 % of cells have A = 255; at 20 random valid cell centres `snowAt` equals the decoded pixel exactly; `buildCap` over a 1°×0.6° Alps view with a synthetic DEM at 3000 m everywhere gives cap alpha > 0 wherever mid < 3000. Print the run and the fusionName.

- [ ] **Step 2: Full gate run (PowerShell, each separately, never `2>&1`)**
  - `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-snowcap.mjs` and `… --live`
  - `npm run typecheck`
  - neighbours: `verify:regenchance`, `verify:height-time`, `verify:rain-window`, `verify:cell-places`, `verify:precip-sums`, `verify:fusion-release`, `verify:regenradar-profile`, `verify:dashboard` (expected states as in their audits; note pre-existing reds C1b/E7)
  - `npm run build`, `npm run budget` — if totalJs exceeds the ratchet, raise it in `budget.json` with a note (Jan's rule 30.09.), never `--update`
  - Pixel diff without flag: `scripts/regenradar-wk-pixeldiff.mjs` HEAD build vs working-tree build, desktop + mobile, `/regenradar` and `/regenradar/muenchen` — expect 0 px apart from the pulsing "RADAR LIVE" dot
  - Browser (Dev server via `npx vite`, CDP probe pattern of `scripts/hzs-probe.mjs`; copy it to `scripts/sk-probe.mjs`): Desktop 1440×900 and iPhone 12 Pro 390×844 DPR 3, URL `/regenradar/innsbruck?sk=1&z3d=1&ansicht3d=split` with layer "Schneefallgrenze" on: screenshots 2D (cap + band + line + label + legend), split 3D (cap on relief), tap on a slope (popup), place card + bar click (map time changes), `?sk=1` with map time beyond the field (hint, no tint); console 0 errors/warnings; measure `buildCap` time per run via `performance.now()` logs behind `?sklog=1` (add a one-line `console.debug` gated by that param in `useSnowCap`).
  - `git diff --stat -- src/pointForecast src/point src/fusion src/MapView.tsx src/nowcast/heightTime src/nowcast/cellTowers` → only the single `TowerStage` prop line may appear (in `NowcastDeck.tsx`, which is not in this list) — must be empty.

- [ ] **Step 3: Docs** — §7 in the audit with the gate table and the five self-check questions (1 Funktionserhalt, 2 Desktop pixel-identical without flag, 3 touch ≥ 44 px, 4 console clean, 5 no long tasks > 200 ms — measured slice durations + Real-Device = Jan); CLAUDE.md status row "Phase SK" replacing nothing else; MANUELLE-SCHRITTE new § "SK": Real-Device check (iPhone/Android: smoothness of panning with cap on, 3D split), Einschalten (`?sk=1` → default) = Jan's word, Commit/Push = Jan; V-SK-1…4 stay in the audit.

- [ ] **Step 4: Report to Jan with the evidence paths (no commit).**
