/**
 * Engine-Manager für das lokale LLM.
 *
 * Verantwortlich für: (1) WebGPU-Capability-Check VOR dem Laden (sauberer
 * „unsupported"-Pfad für ~30 % der Geräte ohne WebGPU → Signal, das der Caller
 * später auf einen Server-Fallback routen kann), (2) Lazy-Load der Engine im
 * Worker mit Fortschritts-Callback (erst auf aktive Nutzer-Aktion), (3) grounded
 * Generierung mit Abbruch-Unterstützung. Die Engine ist ein Modul-Singleton —
 * einmal geladen, von allen Aufrufen geteilt.
 */

import {
  CreateWebWorkerMLCEngine,
  type ChatCompletionMessageParam,
  type InitProgressReport,
  type MLCEngineInterface,
} from '@mlc-ai/web-llm';
import { MODEL_ID, getModelMeta, buildAppConfig, isThinkingModel } from './model';

// ---------------------------------------------------------------------------
// WebGPU-Capability-Check
// ---------------------------------------------------------------------------

export type WebGpuStatus = 'ok' | 'no-webgpu' | 'no-shader-f16' | 'no-adapter';

export interface WebGpuSupport {
  supported: boolean;
  status: WebGpuStatus;
  /** Menschlich lesbarer Grund (DE) für den „unsupported"-Zustand. */
  reason?: string;
  /** Adapter-Name/Beschreibung, falls verfügbar (nur informativ). */
  adapterInfo?: string;
}

interface MinimalGpuAdapter {
  features: { has(name: string): boolean };
  info?: { description?: string; vendor?: string };
}
interface MinimalGpu {
  requestAdapter(opts?: { powerPreference?: string }): Promise<MinimalGpuAdapter | null>;
}

/**
 * Prüft VOR dem Modell-Download, ob WebGPU + das benötigte `shader-f16`-Feature
 * (q4f16-Modelle brauchen es) vorhanden sind. Wirft nie — gibt immer einen
 * klaren Status zurück, den die UI in einen Fallback-Hinweis übersetzen kann.
 */
export async function checkWebGpuSupport(): Promise<WebGpuSupport> {
  const gpu = (navigator as unknown as { gpu?: MinimalGpu }).gpu;
  if (!gpu) {
    return {
      supported: false,
      status: 'no-webgpu',
      reason: 'Dein Browser unterstützt kein WebGPU. Der lokale Meteorologe braucht WebGPU (aktuelles Chrome, Edge oder Safari 18+).',
    };
  }
  let adapter: MinimalGpuAdapter | null = null;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  } catch {
    adapter = null;
  }
  if (!adapter) {
    return {
      supported: false,
      status: 'no-adapter',
      reason: 'WebGPU ist vorhanden, aber es konnte keine GPU angesprochen werden (evtl. in den Browser-Flags deaktiviert).',
    };
  }
  const needsF16 = getModelMeta().requiredFeatures.includes('shader-f16');
  if (needsF16 && !adapter.features.has('shader-f16')) {
    return {
      supported: false,
      status: 'no-shader-f16',
      reason: 'Deine GPU unterstützt kein „shader-f16" — dieses Modell läuft darauf nicht.',
      adapterInfo: adapter.info?.description,
    };
  }
  return { supported: true, status: 'ok', adapterInfo: adapter.info?.description };
}

// ---------------------------------------------------------------------------
// Lazy Engine-Load (Worker)
// ---------------------------------------------------------------------------

export interface LoadProgress {
  /** 0..1 */
  progress: number;
  /** WebLLM-Klartext, z. B. „Fetching param cache[12/38]: 620MB fetched". */
  text: string;
}

let enginePromise: Promise<MLCEngineInterface> | null = null;
let engineRef: MLCEngineInterface | null = null;

export function isEngineLoaded(): boolean {
  return engineRef !== null;
}

/**
 * Lädt die Engine im Worker (idempotent — paralleler/erneuter Aufruf teilt
 * dieselbe Promise). Der Worker wird via Vite-`import.meta.url` als ES-Modul
 * gebündelt. `onProgress` speist den UI-Fortschrittsbalken (erster Download
 * ~2 GB; ohne Anzeige wirkt es eingefroren).
 */
export function loadEngine(onProgress?: (p: LoadProgress) => void): Promise<MLCEngineInterface> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const worker = new Worker(new URL('./weatherLLM.worker.ts', import.meta.url), { type: 'module' });
    const engine = await CreateWebWorkerMLCEngine(worker, MODEL_ID, {
      appConfig: buildAppConfig(),
      initProgressCallback: (r: InitProgressReport) =>
        onProgress?.({ progress: r.progress, text: r.text }),
    });
    engineRef = engine;
    return engine;
  })();
  // Bei Fehler die Promise zurücksetzen, damit ein erneuter Versuch möglich ist.
  enginePromise.catch(() => {
    enginePromise = null;
  });
  return enginePromise;
}

export interface GenerateOpts {
  /** Niedrig halten (Default 0.3) — wir wollen Umformulieren, nicht Fabulieren. */
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Streaming-Token-Callback (für die tippende UI). Erhält den BEREINIGTEN Text. */
  onToken?: (delta: string, full: string) => void;
}

/** Entfernt `<think>…</think>`-Reasoning (Qwen3-Reihe) aus dem Text — geschlossene
 *  Blöcke raus, ein noch offener „denkt gerade"-Block ab `<think>` abgeschnitten. */
function stripThinking(s: string): string {
  let out = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const open = out.search(/<think>/i);
  if (open >= 0) out = out.slice(0, open);
  return out.replace(/^\s+/, '');
}

/** Hängt bei Thinking-Modellen `/no_think` an die letzte User-Nachricht (Qwen3-Schalter). */
function withNoThink(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
  const out = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === 'user' && typeof out[i].content === 'string') {
      out[i] = { ...out[i], content: `${out[i].content as string}\n\n/no_think` } as ChatCompletionMessageParam;
      break;
    }
  }
  return out;
}

/**
 * Grounded Generierung. Bricht bei `signal`-Abort über `interruptGenerate()` ab
 * (z. B. wenn der Nutzer während der Generierung wegnavigiert).
 */
export async function generate(
  messages: ChatCompletionMessageParam[],
  opts: GenerateOpts = {},
): Promise<string> {
  const engine = engineRef ?? (enginePromise ? await enginePromise : null);
  if (!engine) throw new Error('Modell ist noch nicht geladen.');

  // Thinking-Modelle (Qwen3-Reihe) brauchen Budget für den <think>-Block PLUS die
  // eigentliche Antwort — sie ignorieren /no_think teils, also lieber Luft lassen.
  const { temperature = 0.3, maxTokens = isThinkingModel() ? 1024 : 400, signal, onToken } = opts;
  if (signal?.aborted) throw new DOMException('abgebrochen', 'AbortError');

  const msgs = isThinkingModel() ? withNoThink(messages) : messages;

  const onAbort = () => {
    try { void engine.interruptGenerate(); } catch { /* ignore */ }
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (onToken) {
      const chunks = await engine.chat.completions.create({
        messages: msgs, temperature, max_tokens: maxTokens, stream: true,
      });
      let raw = '';
      let lastVisible = '';
      for await (const chunk of chunks) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (!delta) continue;
        raw += delta;
        const visible = stripThinking(raw);   // Reasoning live ausblenden
        if (visible !== lastVisible) { lastVisible = visible; onToken(delta, visible); }
      }
      return stripThinking(raw).trim();
    }
    const reply = await engine.chat.completions.create({
      messages: msgs, temperature, max_tokens: maxTokens, stream: false,
    });
    return stripThinking(reply.choices[0]?.message?.content ?? '').trim();
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Engine entladen (GPU-Speicher freigeben). Der IndexedDB-Cache bleibt. */
export async function unloadEngine(): Promise<void> {
  const engine = engineRef;
  engineRef = null;
  enginePromise = null;
  if (engine) {
    try { await engine.unload(); } catch { /* ignore */ }
  }
}
