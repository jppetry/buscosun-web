/**
 * DWD ICON-D2 — **relative Feuchte 2 m** (`relhum_2m`) als natives 2,2-km-Gitter.
 * Datenbasis des Waldbrand-Layers `fireWeather` („Feuerwetter-Treiber").
 *
 * Ein-Feld-Loader nach dem Muster `iconD2Lpi.ts` — dieselbe GRIB2-Kette
 * (`resolveLatestRun` + `fetchStepField` über den `/_dwd_grib`-Edge-Pfad,
 * reguläres lat-lon-Gitter, DE + Umfeld), dieselbe RGBA-Kodierung
 * (R = Wert, A = Verfügbarkeitsmaske), dieselbe gebündelte Nebenläufigkeit.
 *
 * ── Kein Warm-Cron, und das kostet nichts an Code ────────────────────────────
 * Jans Entscheidung vom 2026-08-14: `relhum_2m` kommt **nicht** in
 * `scripts/warm-grib.mjs` (Warm-Budget 90,8 MB/Lauf, Prod-Dispatch ist ein
 * eigenes Gate). `resolveLatestRun` behandelt das bereits von selbst: Parameter
 * **ohne** Manifest-Eintrag fallen auf den Verzeichnis-Scan zurück
 * (`iconD2Precip.ts:109-122`). Es braucht also keinen Sonderpfad — nur das
 * Wissen, dass der erste Abruf dadurch langsamer ist als bei den gewärmten
 * Layern. Deshalb **lazy**: der Aufrufer startet den Loader erst beim Aktivieren.
 *
 * ── Warum „Trockenheit" statt „Feuchte" gerendert wird ───────────────────────
 * Fachlich interessiert die **niedrige** Feuchte: je trockener die Luft, desto
 * schneller trocknet Streu ab und desto leichter entzündet sie sich. Eine Rampe
 * über die rohe Feuchte hätte ihr Alarmende bei 100 % — also genau dort, wo
 * nichts brennt. Der Kanal trägt deshalb `dryness = (100 − rh) / 100`. Das ist
 * eine Achsenumkehr, keine Modellrechnung: der physikalische Wert bleibt
 * unverändert, und `RELHUM_*`-Konstanten machen die Umkehr nachvollziehbar.
 *
 * ── Was dieser Layer NICHT ist ───────────────────────────────────────────────
 * Ein **Treiber**, kein Index und kein Warnprodukt. Die kumulativen FWI-Codes
 * (FFMC, DMC, DC) tragen Wochen an Vorgeschichte und sind client-seitig nicht
 * rechenbar (D-01, `docs/DATA_SOURCES.md` §W.5) — sie kommen fertig von GWIS.
 * Ein zusammengesetzter „Treiber-Score" aus Feuchte, Temperatur, Wind und
 * Niederschlag mit **eigenen** Gewichten ist bewusst **nicht** gebaut: dessen
 * Gewichte wären frei gewählt und damit eine Modellaussage, die niemand
 * kalibriert hat (die Lehre aus dem Rotations-Layer F5). **Entschieden 2026-08-19
 * (Jan, `audit/waldbrand-forecast.md` §13 (a)):** publizierte Gleichungssysteme
 * sind zugelassen — der stündliche FWI nach Van Wagner lebt in `src/fire/fwi/`
 * (WF1) und wird als eigener Layer „Feuerwetter stündlich" gebaut (WF2 ff.);
 * er ersetzt diesen Treiber-Layer nicht. Eigene Gewichte bleiben tabu.
 */

import {
  resolveLatestRun, fetchStepField, subsampledCorners,
  D2_GRIB_PROXY_BASE, type GribField,
} from './iconD2Precip';

export const ICON_D2_RELHUM_ATTRIBUTION =
  'Datenbasis: <a href="https://www.dwd.de/DE/leistungen/opendata/opendata.html" '
  + 'target="_blank" rel="noopener">Deutscher Wetterdienst</a>, ICON-D2 (relhum_2m), '
  + 'Rasterdaten bildlich wiedergegeben · CC BY 4.0';

/** Horizont in Stunden. Der Waldbrand-Regler geht in Tagesschritten bis +1
 *  (Mittagsanker) oder — WF3 — in Stundenschritten bis +12 h ab jetzt; beides
 *  liegt aus jedem Lauf innerhalb von +24 h. */
const MAX_STEP = 24;
/** `relhum_2m` ist **instantan** — anders als `lpi_max`/`vmax_10m` ist t+0 gültig. */
const MIN_STEP = 0;
const TARGET_WIDTH = 700;
const CONCURRENCY = 4;

/** Physikalischer Bereich der relativen Feuchte in Prozent. */
export const RELHUM_MIN = 0;
export const RELHUM_MAX = 100;
/**
 * Ab dieser Feuchte gilt die Luft als „nicht mehr trocken" — darunter beginnt
 * die Rampe. 60 % ist der Punkt, ab dem die Streuauflage in der Praxis kaum
 * noch weiter abtrocknet; er kalibriert nur die **Sichtbarkeit**, nicht den Wert.
 */
export const RELHUM_DRY_FROM = 60;

/**
 * Farbrampe des Treiber-Layers, indiziert über `dryness` (0 = feucht, 1 = knochentrocken).
 *
 * Bewusst **anders** als die Gefahrenstufen-Paletten: Der Treiber ist kein Index
 * und darf nicht wie eine amtliche Stufe aussehen. Deshalb ein durchgehender
 * Sand-nach-Ocker-Verlauf statt der Grün-Gelb-Rot-Ampel — er zeigt eine
 * Tendenz, keine Klassen.
 *
 * Der Verlauf beginnt erst bei `dryness` 0,4 (= 60 % Feuchte, `RELHUM_DRY_FROM`)
 * sichtbar zu werden; darunter blendet die `visRange` des `ScalarLayer` aus.
 */
export const drynessRamp: Record<number, string> = {
  0.0: 'rgba(240,236,220,0)',   // feucht — unsichtbar
  0.4: 'rgba(233,214,168,0.35)',
  0.55: 'rgb(226,190,124)',
  0.7: 'rgb(214,150,86)',
  0.85: 'rgb(186,104,60)',
  1.0: 'rgb(140,62,42)',        // extrem trocken
};

export interface IconD2RelhumFrame {
  validAt: Date;
  stepHours: number;
  /** RGBA: R = dryness (0..1), A = Maske (0 außerhalb der D2-Domäne). */
  image: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface IconD2Relhum {
  runAt: Date;
  frames: IconD2RelhumFrame[];
  uvBounds: [number, number, number, number];
  /** Werte-Enden des KANALS (dryness), nicht der Feuchte — s. Kopfkommentar. */
  vMin: number;
  vMax: number;
}

const lngToEquiX = (lng: number) => (lng + 180) / 360;
const latToEquiY = (lat: number) => (90 - lat) / 180;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Feuchte in Prozent → Trockenheit 0..1. Reine Achsenumkehr, exportiert,
 *  damit der Selbsttest sie prüfen kann statt sie nachzubauen. */
export function drynessFromRh(rhPercent: number): number {
  return clamp01((RELHUM_MAX - rhPercent) / (RELHUM_MAX - RELHUM_MIN));
}

function buildRelhumImage(rh: GribField, ss: number): Omit<IconD2RelhumFrame, 'validAt' | 'stepHours'> {
  const { ni, nj } = rh;
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    const y = h - 1 - jj; // S→N → north-up
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const v = rh.values[sj * ni + si];
      const idx = (y * w + ii) * 4;
      // Außerhalb der Domäne (Bitmap-Maske → NaN) transparent, nie 0:
      // 0 % Feuchte wäre knochentrocken und damit die Höchststufe.
      if (!Number.isFinite(v)) { img.data[idx + 3] = 0; continue; }
      img.data[idx] = Math.round(drynessFromRh(v) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { image: canvas, width: w, height: h };
}

/**
 * Lädt `relhum_2m` des jüngsten Laufs (0…+24 h).
 * Progressiv: `onProgress` feuert je fertigem Frame.
 */
export async function fetchIconD2Relhum(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Relhum) => void,
): Promise<IconD2Relhum> {
  const { runStr, runAt, steps } = await resolveLatestRun('relhum_2m', signal);
  const wanted = steps.filter((s) => s >= MIN_STEP && s <= MAX_STEP);
  if (wanted.length === 0) throw new Error('ICON-D2 relhum_2m: keine Schritte im Horizont');

  const gridRef = await fetchStepField(runStr, 'relhum_2m', wanted[0], signal, D2_GRIB_PROXY_BASE);
  const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));
  // Ecken der ABGETASTETEN Punkte statt des nativen Gitters (KL3): der Bau
  // nimmt `min(n-1, k*ss)`, also den ERSTEN Punkt jedes Blocks — ueber
  // `gribCorners` gespannt landete jeder Wert eine halbe Nativzelle zu weit
  // noerdlich (audit/karten-layer-verortung.md, B3).
  const c = subsampledCorners(gridRef, ss); // [NW, NE, SE, SW] in [lon,lat]
  const uvBounds: [number, number, number, number] = [
    lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1]),
  ];

  const frames: IconD2RelhumFrame[] = [];
  const loadStep = async (step: number): Promise<void> => {
    try {
      const rh = await fetchStepField(runStr, 'relhum_2m', step, signal, D2_GRIB_PROXY_BASE);
      frames.push({
        validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step,
        ...buildRelhumImage(rh, ss),
      });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress) onProgress({ runAt, frames: [...frames], uvBounds, vMin: 0, vMax: 1 });
    } catch {
      // Fehlender Schritt → überspringen (Muster Böen/Temp/LPI).
    }
  };

  let ptr = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, async () => {
    while (ptr < wanted.length) {
      if (signal?.aborted) return;
      await loadStep(wanted[ptr++]);
    }
  });
  await Promise.all(workers);

  if (frames.length === 0) throw new Error('ICON-D2 relhum_2m: keine Frames erzeugt');
  return { runAt, frames, uvBounds, vMin: 0, vMax: 1 };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei, DOM-frei)
// ---------------------------------------------------------------------------

export interface RelhumCheck { name: string; ok: boolean; detail?: string }

export function verifyIconD2Relhum(): { checks: RelhumCheck[]; passed: number; total: number } {
  const checks: RelhumCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Die Achsenumkehr ist die einzige Rechnung dieses Moduls — und die, die man
  // am leichtesten falsch herum einbaut.
  add('100 % Feuchte ⇒ Trockenheit 0 (kein Alarm)', drynessFromRh(100) === 0);
  add('0 % Feuchte ⇒ Trockenheit 1 (Maximum)', drynessFromRh(0) === 1);
  add('50 % Feuchte ⇒ 0,5', Math.abs(drynessFromRh(50) - 0.5) < 1e-9);
  add('trockener heißt HÖHER — nicht niedriger',
    drynessFromRh(20) > drynessFromRh(80), `${drynessFromRh(20)} > ${drynessFromRh(80)}`);
  add('Werte über 100 % (Übersättigung im Modell) klemmen bei 0', drynessFromRh(105) === 0);
  add('negative Werte klemmen bei 1', drynessFromRh(-5) === 1);

  add('Bereichskonstanten sind 0..100 %', RELHUM_MIN === 0 && RELHUM_MAX === 100);
  add('Sichtbarkeitsschwelle liegt im plausiblen Bereich',
    RELHUM_DRY_FROM > 30 && RELHUM_DRY_FROM < 90, String(RELHUM_DRY_FROM));

  add('Attribution nutzt die DWD-Formel für ABGELEITETE Daten',
    /Datenbasis:/.test(ICON_D2_RELHUM_ATTRIBUTION)
      && /bildlich wiedergegeben/.test(ICON_D2_RELHUM_ATTRIBUTION));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
