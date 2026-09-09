/**
 * Screenshots aus Headless-Chromium — über das DevTools-Protokoll, ohne
 * zusätzliche Abhängigkeit.
 *
 * ── Warum nicht `--screenshot=…` wie in `docs/seo-geo/og-images.md` ─────────
 * Der Schalter ist **weg**. Gemessen am 2026-09-09 mit beiden auf diesem
 * Rechner liegenden Ständen (`chromium_headless_shell-1217` = Chrome 147,
 * `-1223` = Chrome 148): der Aufruf endet mit Status 0, `--dump-dom` liefert
 * sauberes HTML — und es entsteht **keine Datei**. Ein Rezept, das still
 * nichts tut, ist schlimmer als eines, das scheitert; die Doku wird korrigiert.
 *
 * Stattdessen: EIN Browser für alle Bilder, gesteuert über CDP. Node 22 bringt
 * `WebSocket` global mit, mehr braucht es nicht. Das ist zugleich schneller —
 * ein Prozessstart statt einem je Bild.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Pfad zu chrome-headless-shell (Playwright-Ablage oder `OG_CHROME`). */
export function findHeadlessChrome() {
  const env = process.env.OG_CHROME;
  if (env && existsSync(env)) return env;
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (!existsSync(base)) return null;
  const dirs = readdirSync(base)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const p = join(base, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Startet den Browser und liefert einen kleinen Aufnahme-Apparat.
 * `shot(url, file, { width, height })` schreibt genau ein PNG.
 */
export async function openShooter(chromePath, { timeoutMs = 30_000 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'og-shot-'));
  const child = spawn(chromePath, [
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--force-device-scale-factor=1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  // Der Browser nennt seinen WS-Endpunkt auf stderr — bei Port 0 ist das der
  // einzige verlässliche Weg an die tatsächlich vergebene Portnummer.
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
  const waiters = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message} (${JSON.stringify(msg.params ?? {})})`)) : resolve(msg.result);
      return;
    }
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].match(msg)) { waiters.splice(i, 1)[0].resolve(msg); }
    }
  };

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    setTimeout(() => { if (pending.delete(id)) reject(new Error(`Zeitüberschreitung: ${method}`)); }, timeoutMs);
  });
  const waitFor = (match) => new Promise((resolve, reject) => {
    const w = { match, resolve };
    waiters.push(w);
    setTimeout(() => {
      const i = waiters.indexOf(w);
      if (i >= 0) { waiters.splice(i, 1); reject(new Error('Zeitüberschreitung beim Warten auf ein Ereignis')); }
    }, timeoutMs);
  });

  /**
   * Ein Bild. `probe` ist ein optionaler JS-Ausdruck, der IM Dokument
   * ausgewertet wird, nachdem gemalt wurde — damit kann der Aufrufer die
   * Seite selbst befragen (z. B. „liegt das Kartenfeld noch in der Flaeche?").
   * Der Wert kommt zurueck; das Bild wird trotzdem geschrieben.
   */
  async function shot(url, file, { width = 1200, height = 630, format = 'png', quality, probe, media, settleMs = 0 } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', width, height });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    try {
      await send('Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await send('Page.enable', {}, sessionId);
      // `media: 'print'` schaltet die Druck-Stylesheets ein, ohne zu drucken —
      // so laesst sich ein `@media print`-Block ueberhaupt ansehen (E-7).
      if (media) await send('Emulation.setEmulatedMedia', { media }, sessionId);
      const loaded = waitFor((m) => m.sessionId === sessionId && m.method === 'Page.loadEventFired');
      await send('Page.navigate', { url }, sessionId);
      await loaded;
      // Ein Frame Luft: Web-Fonts/SVG sind nach `load` gesetzt, aber noch nicht
      // zwingend gemalt. Zwei rAF-Runden sind billiger als ein fester Schlaf.
      await send('Runtime.evaluate', {
        expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
        awaitPromise: true,
      }, sessionId);
      // Seiten, die ihre Daten erst nach dem `load` holen (Atmosphaerenschnitt),
      // brauchen eine Frist, bevor das Bild etwas zeigt.
      if (settleMs > 0) await new Promise((r) => setTimeout(r, settleMs));
      let probed;
      if (probe) {
        const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true }, sessionId);
        probed = r?.result?.value;
      }
      const { data } = await send('Page.captureScreenshot', {
        format, ...(quality != null ? { quality } : {}),
        clip: { x: 0, y: 0, width, height, scale: 1 }, captureBeyondViewport: true,
      }, sessionId);
      writeFileSync(file, Buffer.from(data, 'base64'));
      return probed;
    } finally {
      await send('Target.closeTarget', { targetId }).catch(() => {});
    }
  }

  async function close() {
    try { ws.close(); } catch { /* egal */ }
    child.kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* egal */ }
  }

  return { shot, close };
}
