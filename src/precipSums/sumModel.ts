/**
 * Phase NS — Niederschlagssummen im Regenradar (`audit/niederschlagssummen.md` §9): Fenster, Richtungen, Palette, Zahlen.
 *
 * Rein (kein DOM, kein Netz): Dock, Readout, Karte und `verify:precip-sums` lesen dieselben Konstanten.
 *
 * Zwei Richtungen, nie vermischt:
 *   · „Gefallen" (zurück) — NUR gemessene Werte (Stationen, später amtliche Radar-Summen); fehlt etwas, ist es eine Lücke,
 *     nie 0 mm.
 *   · „Erwartet" (voraus) — am Ort buscosun Fusion für das ganze Fenster (Erwartungswert, Mittel addieren sich); auf der
 *     Karte 0–2 h der Radar-Nowcast des Landes, danach das Kartenfeld von buscosun Fusion (Modell · Cube).
 * Eine Spanne der Fenstersumme gibt es erst, wenn die Abhängigkeit zwischen den Stunden gemessen ist (E-NS-8) — Quantile
 * einzelner Stunden addieren sich nicht.
 */

export const SUM_WINDOWS_H = Object.freeze([1, 3, 6, 12, 24, 48] as const);
export type SumWindowH = typeof SUM_WINDOWS_H[number];
export type SumDir = 'past' | 'future';
/** `chance` = Phase RC (Regenchance, `audit/regenchance.md`), nur mit `?rc=1` erreichbar — die Summen-Logik kennt sie nicht. */
export type SumMode = 'intensity' | 'sum' | 'chance';

export interface SumSelection { mode: SumMode; dir: SumDir; windowH: SumWindowH }
export const SUM_DEFAULT: SumSelection = Object.freeze({ mode: 'intensity', dir: 'past', windowH: 6 });

export const SUM_DIR_LABEL: Record<SumDir, string> = { past: 'Gefallen', future: 'Erwartet' };

/** `?sum=0` = die Ansicht vor Phase NS (Regel 2: benannter Rückfall, exakte Übereinstimmung wie `?pf=live`). */
export function sumsEnabledFrom(search: string): boolean {
  return new URLSearchParams(search).get('sum') !== '0';
}

export function isSumWindow(x: unknown): x is SumWindowH {
  return typeof x === 'number' && (SUM_WINDOWS_H as readonly number[]).includes(x);
}

// --- Palette ------------------------------------------------------------------------------------

/**
 * Ruhige Summen-Palette hell → blau → violett, bewusst ohne die Gelb/Rot-Töne der Intensität (mm/h), damit die zwei
 * Ansichten nie verwechselt werden. Stufen in mm; zwischen zwei Stufen linear im RGB-Raum.
 */
export const SUM_STOPS: ReadonlyArray<{ mm: number; rgb: readonly [number, number, number] }> = Object.freeze([
  { mm: 0.1, rgb: [232, 239, 243] },
  { mm: 0.5, rgb: [205, 224, 237] },
  { mm: 1, rgb: [168, 201, 226] },
  { mm: 2, rgb: [125, 173, 214] },
  { mm: 5, rgb: [78, 139, 196] },
  { mm: 10, rgb: [52, 101, 168] },
  { mm: 20, rgb: [60, 74, 154] },
  { mm: 30, rgb: [86, 64, 143] },
  { mm: 50, rgb: [110, 52, 136] },
  { mm: 100, rgb: [74, 35, 102] },
]);
/** Unter dieser Summe bleibt die Karte durchsichtig (kein messbarer Niederschlag); 0 mm gemessen ist trotzdem ein Wert. */
export const SUM_MIN_VISIBLE_MM = 0.1;
/** Stufen der Legende (mm). */
export const SUM_LEGEND_MM = Object.freeze([0.1, 1, 2, 5, 10, 20, 50] as const);
export const SUM_ALPHA = 0.82;

export function sumColor(mm: number): [number, number, number] | null {
  if (!(mm >= SUM_MIN_VISIBLE_MM)) return null;
  const s = SUM_STOPS;
  if (mm >= s[s.length - 1].mm) return [...s[s.length - 1].rgb] as [number, number, number];
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1];
    if (mm < b.mm) {
      const f = (mm - a.mm) / (b.mm - a.mm);
      return [0, 1, 2].map((k) => Math.round(a.rgb[k] + (b.rgb[k] - a.rgb[k]) * f)) as [number, number, number];
    }
  }
  return [...s[0].rgb] as [number, number, number];
}
export const sumCss = (mm: number): string => { const c = sumColor(mm); return c ? `rgb(${c[0]},${c[1]},${c[2]})` : 'transparent'; };

// --- Zahlen ---------------------------------------------------------------------------------------

const comma = (s: string) => s.replace('.', ',');

/** Gemessene Summe: 0 bleibt „0 mm" (gemessen trocken), unter 0,1 „< 0,1 mm", sonst eine Nachkommastelle bis 10 mm. */
export function fmtMeasuredMm(mm: number): string {
  if (mm <= 0) return '0 mm';
  if (mm < 0.1) return '< 0,1 mm';
  if (mm < 10) return `${comma(mm.toFixed(1))} mm`;
  return `${Math.round(mm)} mm`;
}

/** Erwartungswert: gerundet nach Größe, damit keine Scheingenauigkeit entsteht („etwa 3 mm"). */
export function fmtExpectedMm(mm: number): string {
  if (mm < 0.05) return 'kaum (< 0,1 mm)';
  if (mm < 1) return `etwa ${comma(mm.toFixed(1))} mm`;
  if (mm < 3) return `etwa ${comma((Math.round(mm * 2) / 2).toFixed(1).replace(/\.0$/, ''))} mm`;
  if (mm < 10) return `etwa ${Math.round(mm)} mm`;
  return `etwa ${Math.round(mm)} mm`;
}

export function fmtHour(ms: number): string {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** „Lauf 12 UTC" aus einem Laufzeitpunkt. */
export function fmtRunUtc(ms: number): string {
  return `Lauf ${String(new Date(ms).getUTCHours()).padStart(2, '0')} UTC`;
}
