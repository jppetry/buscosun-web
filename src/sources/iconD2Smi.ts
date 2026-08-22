/**
 * DWD ICON-D2 — **Bodenfeuchte-Index `smi`** als natives 2,2-km-Gitter.
 * Datenbasis des Waldbrand-Layers `fireSoilDryness` („Bodentrockenheit").
 *
 * Schwesterloader zu `iconD2Relhum.ts` (Luft-Trockenheit): dieselbe GRIB2-Kette,
 * dieselbe RGBA-Kodierung (R = Wert, A = Verfügbarkeitsmaske), dieselbe
 * gebündelte Nebenläufigkeit — aber aus dem **`soil-level`**-Baum statt aus
 * `single-level`, deshalb über `resolveLatestSoilRun`/`fetchSoilStepField`.
 *
 * Kein Warm-Cron (wie `relhum_2m`) → Directory-Scan, deshalb strikt **lazy**.
 *
 * ── Was `smi` ist ───────────────────────────────────────────────────────────
 * Der Soil Moisture Index ist bereits normiert:
 *
 *     smi = 0  ⇒ Welkepunkt      (die Pflanze bekommt kein Wasser mehr)
 *     smi = 1  ⇒ Feldkapazität   (der Boden hält so viel, wie er halten kann)
 *
 * Er ist damit über Bodenarten hinweg vergleichbar — anders als `w_so`
 * (Wassergehalt in kg/m²), das ohne Bodenart-Nachschlag nichts aussagt. Genau
 * deshalb fiel die Wahl auf `smi`.
 *
 * ── Drei Dinge, die erst die Messung ergeben hat (audit/waldbrand-boden.md) ──
 *
 * 1. **`smi` verlässt den Bereich 0..1 in BEIDE Richtungen.** Gemessen am Lauf
 *    2026081515: −0,93 … +2,15. Werte unter 0 sind kein Fehler, sondern der
 *    fachlich interessante Fall — Boden UNTER dem Welkepunkt. Werte über 1
 *    heißen „über Feldkapazität", also nass. Ein `clamp01` auf dem Rohwert wäre
 *    also kein Aufräumen, sondern das Abschneiden genau der Aussage, für die
 *    dieser Layer da ist. Geklemmt wird deshalb erst die **Anzeigeachse**.
 *
 * 2. **Wasserzellen tragen Werte.** Die NaN-Maske der Datei deckt nur das
 *    Modellrandgebiet (151 528 Zellen, davon 0 über Land). Zusätzlich liegen
 *    **212 735** Zellen mit gültigem `smi` auf `soiltyp = 9` (Wasser) — ohne
 *    eigene Maske bekämen Nord- und Ostsee und jeder größere See eine
 *    Trockenheitsfarbe. Deshalb wird `soiltyp` (zeitinvariant, EIN Abruf je
 *    Lauf) mitgeladen und alles außerhalb der wasserführenden Böden (3…8)
 *    transparent gesetzt. Eis (170 Zellen) und Fels (70) fallen mit heraus —
 *    dort ist SMI schlicht nicht definiert.
 *
 * 3. **Die tiefen Ebenen sind nicht unabhängig.** Ebene 243 und 729 liefern
 *    **wertgleiche** Felder (identischer Werte-Hash bei verschiedenen Dateien).
 *    Sie als getrennte Auswahl anzubieten wäre eine Unterscheidung, die es in
 *    den Daten nicht gibt — der Wurzelzonen-Modus nimmt deshalb Ebene 81.
 */

import {
  resolveLatestSoilRun, fetchSoilStepField, fetchInvariantField, subsampledCorners,
  D2_GRIB_PROXY_BASE, type GribField,
} from './iconD2Precip';

export const ICON_D2_SMI_ATTRIBUTION =
  'Datenbasis: <a href="https://www.dwd.de/DE/leistungen/opendata/opendata.html" '
  + 'target="_blank" rel="noopener">Deutscher Wetterdienst</a>, ICON-D2 (smi), '
  + 'Rasterdaten bildlich wiedergegeben · CC BY 4.0';

/**
 * Die zwei angebotenen Tiefen.
 *
 * `topsoil` (9 cm) trägt die Streu- und Grasnarbenzone: sie trocknet in Tagen ab
 * und entscheidet über die Entzündbarkeit. `rootzone` (81 cm) ist der Vorrat,
 * aus dem Bäume zehren — er reagiert in Wochen und zeigt Dürre, nicht Zündrisiko.
 * Am Messtag lagen die Mediane bei 0,13 (9 cm) und 0,85 (81 cm): oben nahe am
 * Welkepunkt, unten feucht. Genau dieser Unterschied ist die Aussage des Layers.
 */
export type SoilDrynessMode = 'topsoil' | 'rootzone';

export const SOIL_LEVEL: Record<SoilDrynessMode, number> = {
  topsoil: 9,
  rootzone: 81,
};

export const SOIL_MODE_LABEL: Record<SoilDrynessMode, string> = {
  topsoil: 'Oberboden',
  rootzone: 'Wurzelzone',
};

export const SOIL_MODE_FULL_LABEL: Record<SoilDrynessMode, string> = {
  topsoil: 'Oberboden bis 9 cm — Streu und Grasnarbe, reagiert in Tagen',
  rootzone: 'Wurzelzone bis 81 cm — Vorrat der Bäume, reagiert in Wochen',
};

/** Horizont in Stunden. Der Regler geht in Tagesschritten (Mittagsanker) oder
 *  — WF3 — in Stundenschritten bis +12 h ab jetzt; +24 h ist der Schritt, der
 *  aus JEDEM Lauf erreichbar ist (`smi` liegt bis +48 h vor, aber ein 00z-Lauf
 *  erreicht den Mittag von Tag 2 nicht mehr). */
const MAX_STEP = 24;
const MIN_STEP = 0;
const TARGET_WIDTH = 700;
const CONCURRENCY = 4;

/** Wasserführende ICON-Bodenarten. 1 = Eis, 2 = Fels, 9 = Wasser sind draußen. */
const SOIL_MIN = 3;
const SOIL_MAX = 8;

/**
 * Die Anzeigeachse: `smi` → Trockenheit 0..1.
 *
 *     smi ≥ 1   ⇒ 0    (Feldkapazität und darüber — nass)
 *     smi = 0   ⇒ 1    (Welkepunkt)
 *     smi < 0   ⇒ 1    (unter dem Welkepunkt — bleibt auf dem Maximum)
 *
 * Die Klemmung sitzt bewusst HIER und nicht am Rohwert (s. Kopfkommentar §1):
 * der physikalische Wert bleibt unangetastet, nur die Farbachse endet.
 *
 * Bewusst KEINE Kalibrierung an der gemessenen Tagesverteilung: die Enden 0 und
 * 1 sind physikalisch definierte Punkte (Welkepunkt, Feldkapazität) und gelten
 * im Februar wie im August. Eine an einem Augusttag ausgerichtete Skala sähe
 * kontrastreicher aus und wäre im Winter eine Lüge.
 */
export function drynessFromSmi(smi: number): number {
  if (!Number.isFinite(smi)) return 0;
  if (smi <= 0) return 1;
  if (smi >= 1) return 0;
  return 1 - smi;
}

/**
 * Farbrampe, indiziert über `dryness`.
 *
 * Dieselbe Sand-nach-Ocker-Familie wie der Luft-Treiber (`drynessRamp`), damit
 * beide als „Treiber" lesbar bleiben und nicht wie eine amtliche Ampel — aber
 * merklich kühler/brauner angelegt, sonst wären die zwei Layer übereinander
 * nicht auseinanderzuhalten. Erdtöne statt Sandtöne: es geht um Boden.
 *
 * Die Stützstellen sitzen auf den **benannten Klassen** der Legende, nicht auf
 * runden Zehnteln — was die Farbe zeigt, ist damit dasselbe, was der Text sagt.
 */
export const soilDrynessRamp: Record<number, string> = {
  0.0: 'rgba(226,232,224,0)',    // smi ≥ 1 — gesättigt, unsichtbar
  0.3: 'rgba(214,206,176,0.30)', // smi 0,7 — feucht
  0.6: 'rgb(198,168,112)',       // smi 0,4 — mittel
  0.8: 'rgb(166,118,66)',        // smi 0,2 — trocken
  1.0: 'rgb(104,58,34)',         // smi ≤ 0 — am/unter dem Welkepunkt
};

/** Die Klassen der Legende — EINE Quelle für Farbe, Grenze und Wortlaut. */
export const SOIL_DRYNESS_CLASSES: readonly { smiFrom: number; label: string; color: string }[] = [
  { smiFrom: 1.0, label: 'gesättigt (über Feldkapazität)', color: 'rgb(226,232,224)' },
  { smiFrom: 0.7, label: 'feucht', color: 'rgb(214,206,176)' },
  { smiFrom: 0.4, label: 'mittel', color: 'rgb(198,168,112)' },
  { smiFrom: 0.2, label: 'trocken', color: 'rgb(166,118,66)' },
  { smiFrom: 0.0, label: 'sehr trocken — am Welkepunkt', color: 'rgb(104,58,34)' },
];

export interface IconD2SmiFrame {
  validAt: Date;
  stepHours: number;
  /** RGBA: R = dryness (0..1), A = Maske (0 außerhalb wasserführender Böden). */
  image: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface IconD2Smi {
  runAt: Date;
  mode: SoilDrynessMode;
  level: number;
  frames: IconD2SmiFrame[];
  uvBounds: [number, number, number, number];
  /** Anteil der Landzellen unter dem Welkepunkt — für die ehrliche Statuszeile. */
  shareBelowWilting: number;
}

const lngToEquiX = (lng: number) => (lng + 180) / 360;
const latToEquiY = (lat: number) => (90 - lat) / 180;

/** Ist dieser Bodentyp wasserführend? Fels/Eis/Wasser sind es nicht. */
export function isWaterHoldingSoil(soiltyp: number): boolean {
  if (!Number.isFinite(soiltyp)) return false;
  const t = Math.round(soiltyp);
  return t >= SOIL_MIN && t <= SOIL_MAX;
}

function buildSmiImage(
  smi: GribField,
  soiltyp: GribField | null,
  ss: number,
): Omit<IconD2SmiFrame, 'validAt' | 'stepHours'> & { belowWilting: number; land: number } {
  const { ni, nj } = smi;
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  let belowWilting = 0, land = 0;

  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    const y = h - 1 - jj; // S→N → north-up
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const k = sj * ni + si;
      const v = smi.values[k];
      const idx = (y * w + ii) * 4;
      // Modellrand (NaN) UND Nicht-Boden (Wasser/Fels/Eis) bleiben transparent.
      // Ohne den zweiten Test bekäme die Nordsee eine Trockenheitsfarbe — am
      // Feld gemessen 212 735 Wasserzellen MIT gültigem Wert.
      if (!Number.isFinite(v)) { img.data[idx + 3] = 0; continue; }
      if (soiltyp && !isWaterHoldingSoil(soiltyp.values[k])) { img.data[idx + 3] = 0; continue; }
      land++;
      if (v <= 0) belowWilting++;
      img.data[idx] = Math.round(drynessFromSmi(v) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { image: canvas, width: w, height: h, belowWilting, land };
}

/**
 * Lädt `smi` der gewählten Tiefe aus dem jüngsten Lauf (0…+24 h).
 * Progressiv: `onProgress` feuert je fertigem Frame.
 */
export async function fetchIconD2Smi(
  mode: SoilDrynessMode,
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Smi) => void,
): Promise<IconD2Smi> {
  const level = SOIL_LEVEL[mode];
  const { runStr, runAt, steps } = await resolveLatestSoilRun('smi', level, signal);
  const wanted = steps.filter((s) => s >= MIN_STEP && s <= MAX_STEP);
  if (wanted.length === 0) throw new Error('ICON-D2 smi: keine Schritte im Horizont');

  const gridRef = await fetchSoilStepField(runStr, 'smi', wanted[0], level, signal, D2_GRIB_PROXY_BASE);
  const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));
  // Ecken der ABGETASTETEN Punkte statt des nativen Gitters (KL3): der Bau
  // nimmt `min(n-1, k*ss)`, also den ERSTEN Punkt jedes Blocks — ueber
  // `gribCorners` gespannt landete jeder Wert eine halbe Nativzelle zu weit
  // noerdlich (audit/karten-layer-verortung.md, B3).
  const c = subsampledCorners(gridRef, ss); // [NW, NE, SE, SW] in [lon,lat]
  const uvBounds: [number, number, number, number] = [
    lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1]),
  ];

  // Bodenart EINMAL je Lauf. Fällt sie aus, wird ohne Maske gezeichnet — dann
  // ist die Karte über Wasser falsch, aber nicht leer; die Statuszeile sagt es.
  let soiltyp: GribField | null = null;
  try {
    soiltyp = await fetchInvariantField(runStr, 'soiltyp', signal, D2_GRIB_PROXY_BASE);
  } catch {
    soiltyp = null;
  }

  const frames: IconD2SmiFrame[] = [];
  let belowWilting = 0, land = 0;

  const loadStep = async (step: number): Promise<void> => {
    try {
      const f = await fetchSoilStepField(runStr, 'smi', step, level, signal, D2_GRIB_PROXY_BASE);
      const built = buildSmiImage(f, soiltyp, ss);
      if (step === wanted[0]) { belowWilting = built.belowWilting; land = built.land; }
      frames.push({
        validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step,
        image: built.image, width: built.width, height: built.height,
      });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress) {
        onProgress({
          runAt, mode, level, frames: [...frames], uvBounds,
          shareBelowWilting: land ? belowWilting / land : 0,
        });
      }
    } catch {
      // Fehlender Schritt → überspringen (Muster Böen/Temp/LPI/Relhum).
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

  if (frames.length === 0) throw new Error('ICON-D2 smi: keine Frames erzeugt');
  return {
    runAt, mode, level, frames, uvBounds,
    shareBelowWilting: land ? belowWilting / land : 0,
  };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei, DOM-frei)
// ---------------------------------------------------------------------------

export interface SmiCheck { name: string; ok: boolean; detail?: string }

export function verifyIconD2Smi(): { checks: SmiCheck[]; passed: number; total: number } {
  const checks: SmiCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // --- Die Anzeigeachse. Die Richtung ist das, was man am leichtesten dreht.
  add('Feldkapazität (smi = 1) ⇒ Trockenheit 0', drynessFromSmi(1) === 0);
  add('Welkepunkt (smi = 0) ⇒ Trockenheit 1', drynessFromSmi(0) === 1);
  add('halbe Sättigung ⇒ 0,5', Math.abs(drynessFromSmi(0.5) - 0.5) < 1e-9);
  add('trockener heißt HÖHER — nicht niedriger',
    drynessFromSmi(0.1) > drynessFromSmi(0.9), `${drynessFromSmi(0.1)} > ${drynessFromSmi(0.9)}`);

  // --- Der gemessene Befund: smi verlässt 0..1 in BEIDE Richtungen. Beide Enden
  //     müssen klemmen, ohne dass die Rechnung kippt (audit §1).
  add('unter dem Welkepunkt (smi < 0) bleibt auf dem Maximum, kippt nicht',
    drynessFromSmi(-0.93) === 1, String(drynessFromSmi(-0.93)));
  add('über Feldkapazität (smi > 1) bleibt bei 0, wird nicht negativ',
    drynessFromSmi(2.15) === 0, String(drynessFromSmi(2.15)));
  add('die gemessenen Extremwerte des Laufs liegen beide im gültigen Ausgang',
    drynessFromSmi(-0.9289) >= 0 && drynessFromSmi(-0.9289) <= 1
      && drynessFromSmi(2.1523) >= 0 && drynessFromSmi(2.1523) <= 1);
  add('NaN ergibt 0 statt NaN (die Maske blendet die Zelle ohnehin aus)',
    drynessFromSmi(Number.NaN) === 0);

  // --- Die Bodenmaske. Ohne sie bekäme die Nordsee eine Trockenheitsfarbe.
  add('Wasser (soiltyp 9) ist KEIN wasserführender Boden', !isWaterHoldingSoil(9));
  add('Eis (1) und Fels (2) sind ausgeschlossen',
    !isWaterHoldingSoil(1) && !isWaterHoldingSoil(2));
  add('Sand (3) bis Torf (8) sind eingeschlossen',
    [3, 4, 5, 6, 7, 8].every(isWaterHoldingSoil));
  add('unbekannte/fehlende Bodenart ⇒ ausgeschlossen (lieber nichts als falsch)',
    !isWaterHoldingSoil(Number.NaN) && !isWaterHoldingSoil(0) && !isWaterHoldingSoil(10));

  // --- Die zwei Tiefen. 243/729 sind wertgleich (gemessen) und deshalb NICHT
  //     als eigene Auswahl angeboten — s. audit §3.
  add('die zwei Modi zeigen VERSCHIEDENE Tiefen',
    SOIL_LEVEL.topsoil !== SOIL_LEVEL.rootzone,
    `${SOIL_LEVEL.topsoil} / ${SOIL_LEVEL.rootzone}`);
  add('Oberboden ist flacher als die Wurzelzone',
    SOIL_LEVEL.topsoil < SOIL_LEVEL.rootzone);
  add('keine der beiden Tiefen ist eine der wertgleichen Ebenen 243/729',
    ![243, 729].includes(SOIL_LEVEL.topsoil) && ![243, 729].includes(SOIL_LEVEL.rootzone));
  add('jeder Modus hat ein kurzes UND ein erklärendes Label',
    (['topsoil', 'rootzone'] as SoilDrynessMode[]).every(
      (m) => !!SOIL_MODE_LABEL[m] && SOIL_MODE_FULL_LABEL[m].length > SOIL_MODE_LABEL[m].length));

  // --- Legende: die Klassen müssen absteigend und lückenlos sein, sonst
  //     behauptet die Legende Grenzen, die die Farbe nicht hat.
  add('Legendenklassen sind absteigend nach smi sortiert',
    SOIL_DRYNESS_CLASSES.every((c, i) => i === 0 || SOIL_DRYNESS_CLASSES[i - 1].smiFrom > c.smiFrom));
  add('die unterste Klasse beginnt am Welkepunkt',
    SOIL_DRYNESS_CLASSES.at(-1)?.smiFrom === 0);
  add('jede Klasse trägt Wortlaut und Farbe',
    SOIL_DRYNESS_CLASSES.every((c) => !!c.label && /^rgb/.test(c.color)));

  add('Attribution nutzt die DWD-Formel für ABGELEITETE Daten',
    /Datenbasis:/.test(ICON_D2_SMI_ATTRIBUTION)
      && /bildlich wiedergegeben/.test(ICON_D2_SMI_ATTRIBUTION));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
