/**
 * Lokales LLM für den Meteorologen-Assistenten.
 *
 * Läuft vollständig clientseitig über WebLLM (WebGPU). Die aktive Modell-ID ist
 * EINE Konstante (`MODEL_ID`) — Wechsel = Ein-Zeilen-Änderung. Größere oder
 * selbst-gehostete Modelle (z. B. Gemma 3 4B) werden über `buildAppConfig`
 * registriert, ohne sonstigen Code zu berühren.
 */

import { prebuiltAppConfig, type AppConfig } from '@mlc-ai/web-llm';

/** Aktives Modell. Qwen2.5-7B-Instruct (q4f16) — NICHT-thinking (sofortige
 *  Antworten) bei sehr guter deutscher Sprach-/Faktenqualität. Die Qwen3-Reihe
 *  (3/3.5) wurde verworfen: Thinking-Modelle ignorieren /no_think und liefern
 *  minutenlanges Reasoning → unbrauchbare Latenz für kurze Erklärungen. */
export const MODEL_ID = 'Qwen2.5-7B-Instruct-q4f16_1-MLC';

// ---------------------------------------------------------------------------
// Selbst-gehostetes Gemma 3 4B (optional) — NICHT im WebLLM-Prebuilt-Katalog.
// Einmalig per MLC kompilieren + hosten (Rezept: src/assistant/MODELS.md), die
// beiden URLs eintragen und MODEL_ID = GEMMA3_4B_ID setzen. Sonst kein Code nötig.
// ---------------------------------------------------------------------------
export const GEMMA3_4B_ID = 'gemma-3-4b-it-q4f16_1-MLC';
const GEMMA3_4B_WEIGHTS_URL = ''; // z. B. https://huggingface.co/<dein-repo>/gemma-3-4b-it-q4f16_1-MLC
const GEMMA3_4B_LIB_URL = '';     // z. B. https://<cdn>/gemma-3-4b-it-q4f16_1-webgpu.wasm

/**
 * WebLLM-AppConfig. Standard = Prebuilt-Katalog (undefined → WebLLM nimmt ihn
 * selbst). Sind die Gemma-3-URLs gesetzt, wird das Custom-Modell zusätzlich
 * registriert, sodass `MODEL_ID = GEMMA3_4B_ID` direkt lädt.
 */
export function buildAppConfig(): AppConfig | undefined {
  if (!GEMMA3_4B_WEIGHTS_URL || !GEMMA3_4B_LIB_URL) return undefined;
  return {
    ...prebuiltAppConfig,
    model_list: [
      ...prebuiltAppConfig.model_list,
      {
        model: GEMMA3_4B_WEIGHTS_URL,
        model_id: GEMMA3_4B_ID,
        model_lib: GEMMA3_4B_LIB_URL,
        overrides: { context_window_size: 4096 },
      },
    ],
  };
}

interface ModelDef {
  label: string;
  paramsLabel: string;
  quant: string;
  /** Ungefähre Download-Größe der Gewichte (GB) — Anzeigewert (Katalog führt nur VRAM). */
  downloadGB: number;
  /** „Thinking"-Modell (Qwen3-Reihe) → /no_think injizieren + <think> filtern. */
  thinking?: boolean;
}

const MODELS: Record<string, ModelDef> = {
  'Qwen2.5-7B-Instruct-q4f16_1-MLC': { label: 'Qwen 2.5 Instruct · 7B', paramsLabel: '7B', quant: 'q4f16', downloadGB: 4.5 },
  'Qwen3.5-4B-q4f16_1-MLC': { label: 'Qwen 3.5 · 4B', paramsLabel: '4B', quant: 'q4f16', downloadGB: 2.6, thinking: true },
  'Qwen3-4B-q4f16_1-MLC': { label: 'Qwen 3 · 4B', paramsLabel: '4B', quant: 'q4f16', downloadGB: 2.4, thinking: true },
  'Qwen2.5-3B-Instruct-q4f16_1-MLC': { label: 'Qwen 2.5 Instruct · 3B', paramsLabel: '3B', quant: 'q4f16', downloadGB: 1.9 },
  'Llama-3.1-8B-Instruct-q4f16_1-MLC': { label: 'Llama 3.1 Instruct · 8B', paramsLabel: '8B', quant: 'q4f16', downloadGB: 4.6 },
  'gemma-2-9b-it-q4f16_1-MLC': { label: 'Gemma 2 · 9B', paramsLabel: '9B', quant: 'q4f16', downloadGB: 5.5 },
  [GEMMA3_4B_ID]: { label: 'Gemma 3 · 4B', paramsLabel: '4B', quant: 'q4f16', downloadGB: 2.8 },
};

export interface ModelMeta {
  id: string;
  label: string;
  paramsLabel: string;
  quant: string;
  downloadGB: number;
  vramMB: number | null;
  lowResource: boolean;
  requiredFeatures: string[];
}

export function getModelRecord(id: string = MODEL_ID) {
  return prebuiltAppConfig.model_list.find((m) => m.model_id === id) ?? null;
}

/** Qwen3-Reihe gibt standardmäßig `<think>`-Reasoning aus → unterdrücken. */
export function isThinkingModel(id: string = MODEL_ID): boolean {
  return MODELS[id]?.thinking ?? false;
}

export function getModelMeta(id: string = MODEL_ID): ModelMeta {
  const def = MODELS[id] ?? { label: id, paramsLabel: '', quant: 'q4f16', downloadGB: 0 };
  const rec = getModelRecord(id);
  return {
    id,
    label: def.label,
    paramsLabel: def.paramsLabel,
    quant: def.quant,
    downloadGB: def.downloadGB,
    vramMB: rec?.vram_required_MB ?? null,
    lowResource: rec?.low_resource_required ?? false,
    requiredFeatures: rec?.required_features ?? [],
  };
}
