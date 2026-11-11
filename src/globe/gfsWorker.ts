/**
 * 3D-Globus · GFS-Worker — Fetch + GRIB-Decode + Resampling abseits des
 * Main-Threads. Hält die Kugel/Partikel flüssig, während ein Forecast-Frame
 * geladen wird. Gibt rohe Buffer per Transfer zurück (Main-Thread wrappt sie in
 * Canvases). `fetch` relativer `/_gfs`-URLs läuft same-origin über denselben Proxy.
 */
/// <reference lib="webworker" />

import { resolveLatestGfsRun, buildGlobeData, prefetchFields, type GfsRun, type GlobeSel } from './gfs';

type InMsg =
  | { kind: 'resolve'; id: number }
  | { kind: 'load'; id: number; run: GfsRun; fhour: number; sel: GlobeSel }
  | { kind: 'prefetch'; id: number; run: GfsRun; fhour: number; sel: GlobeSel };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Id of the newest `load` — an older one that is still waiting for its fields skips the pictures (slider drag). */
let latestLoad = 0;

ctx.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    if (msg.kind === 'resolve') {
      const run = await resolveLatestGfsRun();
      ctx.postMessage({ kind: 'run', id: msg.id, run });
    } else if (msg.kind === 'load') {
      latestLoad = msg.id;
      const raw = await buildGlobeData(msg.run, msg.fhour, msg.sel, undefined, () => latestLoad !== msg.id);
      const transfers: Transferable[] = [raw.windRGBA.buffer, raw.windU.buffer, raw.windV.buffer, raw.tempC.buffer];
      if (raw.overlayRGBA) transfers.push(raw.overlayRGBA.buffer);
      if (raw.capN && raw.capS) transfers.push(raw.capN.buffer, raw.capS.buffer);
      ctx.postMessage({ kind: 'data', id: msg.id, raw }, transfers);
    } else if (msg.kind === 'prefetch') {
      await prefetchFields(msg.run, msg.fhour, msg.sel);  // nur Cache füllen, keine Antwort
    }
  } catch (err) {
    if (msg.kind !== 'prefetch') ctx.postMessage({ kind: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
