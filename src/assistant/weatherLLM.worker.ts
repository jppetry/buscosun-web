/**
 * Web-Worker-Host für die WebLLM-Engine.
 *
 * Die gesamte Inferenz (WebGPU-Compute) läuft hier im Worker-Thread — NIE im
 * Main-Thread, damit der latenz-empfindliche MapLibre/Three.js-Render-Loop nicht
 * blockiert. Der Handler ist nur ein dünner Message-Bridge; die eigentliche
 * Engine wird vom Main-Thread via `CreateWebWorkerMLCEngine` instanziiert.
 */

import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
