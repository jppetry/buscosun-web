# Modelle für den lokalen Meteorologen

Aktives Modell: Konstante `MODEL_ID` in `model.ts`. Wechsel = eine Zeile.
Grounding/Prompt/UI sind modell-unabhängig.

## Prebuilt (kein Build nötig — nur `MODEL_ID` setzen)

| MODEL_ID | Params | Download | VRAM | Notiz |
|---|---|---|---|---|
| `Qwen3.5-4B-q4f16_1-MLC` | 4B | ~2,6 GB | ~3,9 GB | **aktiv**, Thinking → `/no_think` + `<think>`-Filter |
| `Qwen3-4B-q4f16_1-MLC` | 4B | ~2,4 GB | ~3,4 GB | low-resource, Thinking |
| `Qwen2.5-3B-Instruct-q4f16_1-MLC` | 3B | ~1,9 GB | ~2,5 GB | erste Version, Qualität unzureichend |
| `gemma-2-9b-it-q4f16_1-MLC` | 9B | ~5,5 GB | ~6,4 GB | stärkstes Deutsch, hoher VRAM |

## Gemma 3 4B (nicht prebuilt — selbst kompilieren + hosten)

Gemma 3 4B ist nicht im WebLLM-Katalog. Einmalig auf einer GPU-Maschine bauen:

```bash
pip install -U mlc-llm-nightly-cu123 mlc-ai-nightly-cu123   # passende CUDA-Variante
# Gewichte quantisieren (q4f16) + Config + WebGPU-Lib kompilieren:
mlc_llm convert_weight ./gemma-3-4b-it --quantization q4f16_1 \
  -o dist/gemma-3-4b-it-q4f16_1-MLC
mlc_llm gen_config ./gemma-3-4b-it --quantization q4f16_1 \
  --conv-template gemma3_instruction --context-window-size 4096 \
  -o dist/gemma-3-4b-it-q4f16_1-MLC
mlc_llm compile dist/gemma-3-4b-it-q4f16_1-MLC/mlc-chat-config.json \
  --device webgpu -o dist/libs/gemma-3-4b-it-q4f16_1-webgpu.wasm
```

Dann hosten:
- Gewichte-Ordner (`dist/gemma-3-4b-it-q4f16_1-MLC/`) auf HuggingFace oder eigenen CDN.
- die `.wasm`-Lib auf einen CDN.

In `model.ts` eintragen und aktivieren:
```ts
const GEMMA3_4B_WEIGHTS_URL = 'https://huggingface.co/<repo>/gemma-3-4b-it-q4f16_1-MLC';
const GEMMA3_4B_LIB_URL = 'https://<cdn>/gemma-3-4b-it-q4f16_1-webgpu.wasm';
export const MODEL_ID = GEMMA3_4B_ID;
```
`buildAppConfig()` registriert das Custom-Modell automatisch; sonst ist nichts zu ändern.
