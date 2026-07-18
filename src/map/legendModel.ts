/**
 * Legenden-Datenmodell für die persistente Instrument-Ribbon-Legende (Spec §7)
 * und die Inline-Skala-Vorschau in Zone A.
 *
 * **Single Source of Truth** sind die vorhandenen Render-Rampen — hier werden
 * keine neuen Farben erfunden, sondern exakt die Rampen gespiegelt, die der
 * jeweilige Layer zeichnet (`temperatureRamp`, `precipRainRamp`, `cloudRamp`
 * aus scalar/*, `gustRamp`/`popRamp` aus scalar/mapRamps, `defaultColorRamp`
 * aus wind/WindLayer). So heißt „welche Farbe = welcher Wert" für den Nutzer
 * dasselbe wie auf der Karte.
 *
 * Reine Daten/Transformation — kein React, kein DOM. `legendForLayer` liest die
 * Rampen erst beim Aufruf (kein Modul-Eval-Zyklus mit MapView).
 */

import type { LayerKey } from '../MapView';
import { temperatureRamp } from '../scalar/ScalarLayer';
import { precipRainRamp, PRECIP_VMAX, cloudRamp, CLOUD_VMAX } from '../scalar/RainLayer';
import { gustRamp, GUST_VMAX_MS, popRamp } from '../scalar/mapRamps';
import { defaultColorRamp as windColorRamp } from '../wind/WindLayer';

export type LegendKind = 'continuous' | 'note';

export interface LegendTick {
  /** Beschriftung (z. B. „20"). */ label: string;
  /** Position entlang des Gradienten, 0..1. */ at: number;
}

export interface LegendSpec {
  layer: LayerKey;
  /** Sprechender Name, z. B. „2-m-Temperatur". */ name: string;
  /** Einheit, z. B. „°C", „mm/h", „%". */ unit: string;
  kind: LegendKind;
  /** CSS-`linear-gradient(...)` der Rampe (nur `kind==='continuous'`). */
  gradientCss?: string;
  /** Achsenmarken unter dem Gradienten. */
  ticks?: LegendTick[];
  /** Kurzbeschreibung (nur `kind==='note'`; kategoriale/observierte Layer). */
  note?: string;
  /**
   * Rohwert (in `unit`) → Position auf dem Gradienten (0..1) für die
   * Live-Cursor-Bubble am gewählten Punkt. `null` außerhalb des Bereichs.
   */
  valueToPos?: (v: number) => number;
  /** Rohwert → Anzeige-String (mit Einheit-Kürzel im UI ergänzt). */
  format?: (v: number) => string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Record<pos0..1, cssColor> → `linear-gradient(<angle>, color pos%, …)`. */
export function rampToGradientCss(ramp: Record<number, string>, angle = '90deg'): string {
  const stops = Object.keys(ramp)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => `${ramp[k]} ${(k * 100).toFixed(2)}%`);
  return `linear-gradient(${angle}, ${stops.join(', ')})`;
}

/** °C-Tick-Formatter (ganzzahlig, mit Vorzeichen für Minusgrade wie im UI). */
const tickInt = (v: number) => `${v}`;

/**
 * Legende für den aktiven Layer. `null`, wenn kein Layer aktiv ist (Ribbon zeigt
 * dann Ruhezustand). Reihenfolge der Auswertung entspricht der visuellen
 * Priorität, falls mehrere Layer aktiv sind: der zuletzt eingeschaltete Skalar
 * bestimmt die Skala — die Aufrufseite übergibt den bevorzugten Layer.
 */
export function legendForLayer(layer: LayerKey): LegendSpec | null {
  switch (layer) {
    case 'temp': {
      const { min, max } = { min: -20, max: 40 };
      return {
        layer, name: '2-m-Temperatur', unit: '°C', kind: 'continuous',
        gradientCss: rampToGradientCss(temperatureRamp),
        ticks: [-20, -10, 0, 10, 20, 30, 40].map((v) => ({ label: tickInt(v), at: (v - min) / (max - min) })),
        valueToPos: (v) => clamp01((v - min) / (max - min)),
        format: (v) => `${Math.round(v)}°`,
      };
    }
    case 'nowcast':
      return {
        layer, name: 'Niederschlag', unit: 'mm/h', kind: 'continuous',
        gradientCss: rampToGradientCss(precipRainRamp),
        // Rampe ist nichtlinear: Ticks an ihrer echten Normpos (Wert/PRECIP_VMAX).
        ticks: [0.1, 1, 5, 20].map((v) => ({ label: v < 1 ? '0,1' : `${v}`, at: v / PRECIP_VMAX })),
        valueToPos: (v) => clamp01(v / PRECIP_VMAX),
        format: (v) => `${v < 1 ? v.toFixed(1).replace('.', ',') : Math.round(v)}`,
      };
    case 'clouds':
      return {
        layer, name: 'Bewölkung', unit: '%', kind: 'continuous',
        gradientCss: rampToGradientCss(cloudRamp),
        ticks: [0, 50, 100].map((v) => ({ label: `${v}`, at: v / CLOUD_VMAX })),
        valueToPos: (v) => clamp01(v / CLOUD_VMAX),
        format: (v) => `${Math.round(v)}`,
      };
    case 'gust':
      return {
        layer, name: 'Windböen', unit: 'm/s', kind: 'continuous',
        gradientCss: rampToGradientCss(gustRamp),
        ticks: [0, 17, 25, 33].map((v) => ({ label: `${v}`, at: v / GUST_VMAX_MS })),
        valueToPos: (v) => clamp01(v / GUST_VMAX_MS),
        format: (v) => `${Math.round(v)}`,
      };
    case 'wind':
      return {
        layer, name: 'Wind', unit: 'm/s', kind: 'continuous',
        gradientCss: rampToGradientCss(windColorRamp),
        // Wind-Rampe ist perzeptuell (gamma/speedRef), keine feste m/s-Achse →
        // qualitative Enden statt falscher Zahlen.
        ticks: [{ label: 'ruhig', at: 0.04 }, { label: 'frisch', at: 0.5 }, { label: 'stürmisch', at: 0.96 }],
        valueToPos: (v) => clamp01(v / 30),
        format: (v) => `${v.toFixed(1).replace('.', ',')}`,
      };
    case 'poprob':
      return {
        layer, name: 'Regen-Chance', unit: '%', kind: 'continuous',
        gradientCss: rampToGradientCss(popRamp),
        ticks: [0, 25, 50, 75, 100].map((v) => ({ label: `${v}`, at: v / 100 })),
        valueToPos: (v) => clamp01(v / 100),
        format: (v) => `${Math.round(v)}`,
      };
    case 'confidence':
      return { layer, name: 'Vertrauen', unit: '', kind: 'note',
        note: 'Kreuzschraffur: je dichter, desto unsicherer die Vorhersage (KI · Klima-MOS).' };
    case 'snowline':
      return { layer, name: 'Schneegrenze', unit: '', kind: 'note',
        note: 'Linie = Übergang Regen ↔ Schnee; oberhalb fällt Niederschlag als Schnee.' };
    case 'flownowcast':
      return { layer, name: 'Flow-Nowcast', unit: '', kind: 'note',
        note: 'Optical-Flow-Extrapolation des Radars (~0–60 min, nur DE).' };
    case 'sat':
      return { layer, name: 'Satellit', unit: '', kind: 'note',
        note: 'Meteosat-Bild (DWD OpenData) — Bewölkung/Struktur, keine Wertskala.' };
    case 'lightning':
      return { layer, name: 'Blitze', unit: '', kind: 'note',
        note: 'Blitzortung der letzten 60 Minuten (DWD Sferics).' };
    case 'stations':
      return { layer, name: 'Stationen', unit: '', kind: 'note',
        note: 'Live-Messwerte der Wetterstationen — antippen für Details.' };
    default:
      return null;
  }
}

/** Priorität, welcher aktive Layer die Ribbon-Skala bestimmt (Skalar-Layer mit
 *  kontinuierlicher Rampe zuerst; beobachtende/Note-Layer nachrangig). */
export const LEGEND_PRIORITY: LayerKey[] = [
  'temp', 'nowcast', 'poprob', 'clouds', 'gust', 'wind',
  'snowline', 'flownowcast', 'confidence', 'sat', 'lightning', 'stations',
];

/** Wählt aus den aktiven Layern den, dessen Legende die Ribbon-Skala trägt. */
export function primaryLegendLayer(active: Set<LayerKey>): LayerKey | null {
  for (const k of LEGEND_PRIORITY) if (active.has(k)) return k;
  return null;
}
