/**
 * cdpBrowser.mjs — ein Headless-Chromium über das DevTools-Protokoll, als
 * allgemeine Sitzung (Netzdrossel, CPU-Drossel, Netzmitschnitt, JS-Auswertung).
 *
 * Herkunft: derselbe Start- und WebSocket-Weg wie `headlessShot.mjs` (OG-Karten),
 * dort aber auf „ein Bild je URL" zugeschnitten und mit privatem `send`. Hier ist
 * `send`/`waitFor` öffentlich, damit `verify-pv-latency.mjs` (Phase FI, AP0) einen
 * Browser-Kontext je Messung anlegen, Netzbedingungen setzen und die Antworten je
 * Abruf (Bytes, `x-cache`, Zeiten) mitlesen kann. Keine Abhängigkeit: Node 22 bringt
 * `WebSocket` mit, der Browser ist der lokal liegende `chrome-headless-shell`.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export { findHeadlessChrome } from './headlessShot.mjs';

/** Netzprofile (CDP `Network.emulateNetworkConditions`), Durchsatz in Byte/s. */
export const NET_PROFILES = Object.freeze({
  none: null,
  // Chrome-DevTools-Voreinstellungen: „Fast 4G" ≈ 9 Mbit/s ↓, 1,5 Mbit/s ↑, 170 ms; „Fast 3G" ≈ 1,6 Mbit/s ↓, 0,75 ↑, 560 ms.
  fast4g: { offline: false, latency: 170, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
  fast3g: { offline: false, latency: 560, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 },
});

export async function openBrowser(chromePath, { timeoutMs = 60_000, extraArgs = [] } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'pv-lab-'));
  const child = spawn(chromePath, [
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--force-device-scale-factor=1',
    ...extraArgs,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const to = setTimeout(() => reject(new Error('Browser meldete keinen DevTools-Endpunkt')), timeoutMs);
    child.stderr.on('data', (d) => {
      buf += String(d);
      const m = buf.match(/ws:\/\/[^\s]+/);
      if (m) { clearTimeout(to); resolve(m[0]); }
    });
    child.on('exit', (code) => { clearTimeout(to); reject(new Error(`Browser beendete sich (${code})`)); });
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WS-Verbindung fehlgeschlagen')); });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message} (${msg.error.data ?? ''})`)) : resolve(msg.result);
      return;
    }
    for (const l of listeners) l(msg);
  };

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    setTimeout(() => { if (pending.delete(id)) reject(new Error(`Zeitüberschreitung: ${method}`)); }, timeoutMs);
  });
  /** Ereignisse abonnieren; gibt die Abmeldefunktion zurück. */
  const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const waitFor = (match, ms = timeoutMs) => new Promise((resolve, reject) => {
    const off = on((msg) => { if (match(msg)) { off(); resolve(msg); } });
    setTimeout(() => { off(); reject(new Error('Zeitüberschreitung beim Warten auf ein Ereignis')); }, ms);
  });

  /**
   * Ein frischer Browser-Kontext (eigener Cache, eigene IndexedDB — der „kalte" Nutzer)
   * mit einem Tab. `net` ist ein Profil aus NET_PROFILES, `cpu` der Drosselfaktor.
   */
  async function newContext({ url = 'about:blank', width = 1440, height = 900, mobile = false, net = null, cpu = 1 } = {}) {
    const { browserContextId } = await send('Target.createBrowserContext', {});
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', width, height, browserContextId });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => send(method, params, sessionId);
    await s('Page.enable', {});
    await s('Runtime.enable', {});
    await s('Network.enable', { maxTotalBufferSize: 64 * 1024 * 1024 });
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 3 : 1, mobile });
    if (net) await s('Network.emulateNetworkConditions', net);
    if (cpu > 1) await s('Emulation.setCPUThrottlingRate', { rate: cpu });

    // Netzmitschnitt: je Anfrage URL, Status, Kopfzeilen (x-cache!), Bytes auf dem Draht, Zeiten.
    const reqs = new Map();
    const off = on((msg) => {
      if (msg.sessionId !== sessionId) return;
      const p = msg.params;
      if (msg.method === 'Network.requestWillBeSent') reqs.set(p.requestId, { url: p.request.url, t0: p.timestamp, wall0: p.wallTime });
      else if (msg.method === 'Network.responseReceived') {
        const r = reqs.get(p.requestId); if (!r) return;
        const h = p.response.headers || {};
        Object.assign(r, { status: p.response.status, xCache: h['x-cache'] ?? h['X-Cache'] ?? null, age: h.age ?? h.Age ?? null,
          enc: h['content-encoding'] ?? null, fromCache: !!p.response.fromDiskCache, protocol: p.response.protocol,
          ttfbMs: p.response.timing ? Math.round(p.response.timing.receiveHeadersEnd) : null });
      } else if (msg.method === 'Network.loadingFinished') {
        const r = reqs.get(p.requestId); if (!r) return;
        r.bytes = p.encodedDataLength; r.t1 = p.timestamp; r.ms = Math.round((p.timestamp - r.t0) * 1000);
      } else if (msg.method === 'Network.loadingFailed') {
        const r = reqs.get(p.requestId); if (r) { r.failed = p.errorText; r.t1 = p.timestamp; }
      }
    });

    if (url !== 'about:blank') {
      const loaded = waitFor((m) => m.sessionId === sessionId && m.method === 'Page.loadEventFired');
      await s('Page.navigate', { url });
      await loaded;
    }

    /** JS im Dokument auswerten (Promise wird abgewartet, Wert kommt zurück). */
    async function evaluate(expression) {
      const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result?.value;
    }
    function requests() { return [...reqs.values()]; }
    function resetRequests() { reqs.clear(); }
    async function close() {
      off();
      await send('Target.closeTarget', { targetId }).catch(() => {});
      await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
    }
    return { sessionId, send: s, evaluate, requests, resetRequests, close };
  }

  async function close() {
    try { ws.close(); } catch { /* egal */ }
    child.kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* egal */ }
  }

  return { send, on, waitFor, newContext, close };
}
