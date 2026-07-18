/**
 * perfHud — dev-only runtime performance overlay for the 2D weather map.
 *
 * ZWECK: Echte Frame-/Interaktions-Metriken OHNE Emulator und OHNE echtes Gerät
 * sichtbar machen. Läuft in jedem Browser (dein Windows-Chrome mit echter GPU,
 * headless Chrome unter CPU-Drosselung, notfalls Mobile-Safari) und meldet:
 *   - FPS (aktuell + p50/p95 der Frame-Zeit + schlimmster Frame)
 *   - Long Tasks (>50 ms Main-Thread-Blockaden; Chrome-only, Safari: n/a)
 *   - MapLibre-Repaints/Sek. (belegt die uncapped-triggerRepaint-Schleife)
 *   - JS-Heap (Chrome-only)
 * Plus „Report kopieren" → JSON in die Zwischenablage + Konsole, damit du die
 * Zahlen hier einfügen kannst.
 *
 * ISOLATION (CLAUDE.md-konform):
 *   - Reines DOM/TS-Modul, KEIN React-Coupling, KEIN Shader-/WebGL-/RGBA8-Eingriff.
 *   - Wird nur per Dynamic Import im DEV-Build geladen (aus dem Prod-Bundle
 *     getreeshaked). Standardmäßig unsichtbar — Anzeige via `#perf`-Hash,
 *     localStorage-Flag `perfHud=1` oder Hotkey Shift+P.
 *   - Berührt kein Produktions-Layout und keine Karten-Logik.
 */

type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface PerfHudApi {
  /** Optional: MapLibre-Karteninstanz registrieren, um echte Repaints zu zählen. */
  attachMap(map: { on: (ev: string, cb: () => void) => void; off?: (ev: string, cb: () => void) => void }): void;
  /** Sichtbarkeit umschalten. */
  toggle(): void;
  /** Messfenster zurücksetzen (z. B. vor einem neuen Szenario). */
  reset(): void;
  /** Aktuellen Report als Objekt holen (für programmatische Nutzung/headless). */
  snapshot(): Record<string, unknown>;
}

declare global {
  interface Window {
    __perfHud?: PerfHudApi;
    // requestIdleCallback wird bereits von lib.dom.d.ts auf Window deklariert;
    // eine eigene (abweichende) Signatur hier kollidiert (TS2717/TS2687).
  }
}

const RING = 240; // Frame-Ringpuffer (~4 s bei 60 fps)
const REPAINT_WINDOW_MS = 1000;

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

export function initPerfHud(corner: Corner = 'tl'): PerfHudApi {
  if (window.__perfHud) return window.__perfHud;

  // ---- Messzustand -------------------------------------------------------
  const frameDt: number[] = []; // Ringpuffer der Frame-Intervalle (ms)
  let lastTs = performance.now();
  const sessionStart = lastTs;
  let sessionFrames = 0;
  let sessionWorstFrame = 0;

  // Long Tasks (Chrome-only)
  let longTaskCount = 0;
  let longTaskMax = 0;
  let longTaskTotalBlockingMs = 0; // Summe (duration - 50)
  let longTaskSupported = false;

  // Repaints (echte MapLibre-Renders, falls attachMap genutzt wird)
  const repaintTs: number[] = [];
  let repaintTotal = 0;
  let repaintPeakPerSec = 0;
  let mapAttached = false;

  // ---- Long-Task-Observer ------------------------------------------------
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longTaskCount += 1;
        longTaskMax = Math.max(longTaskMax, e.duration);
        longTaskTotalBlockingMs += Math.max(0, e.duration - 50);
      }
    });
    obs.observe({ entryTypes: ['longtask'] });
    longTaskSupported = true;
  } catch {
    longTaskSupported = false; // Safari kennt 'longtask' nicht
  }

  // ---- rAF-Messschleife --------------------------------------------------
  const tick = () => {
    const now = performance.now();
    const dt = now - lastTs;
    lastTs = now;
    frameDt.push(dt);
    if (frameDt.length > RING) frameDt.shift();
    sessionFrames += 1;
    if (dt > sessionWorstFrame) sessionWorstFrame = dt;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const markRepaint = () => {
    const now = performance.now();
    repaintTs.push(now);
    repaintTotal += 1;
    while (repaintTs.length && now - repaintTs[0] > REPAINT_WINDOW_MS) repaintTs.shift();
    if (repaintTs.length > repaintPeakPerSec) repaintPeakPerSec = repaintTs.length;
  };

  function computeWindow() {
    const sorted = [...frameDt].sort((a, b) => a - b);
    const median = pct(sorted, 50) || 0.0001;
    const memAny = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    return {
      fps: Math.round(1000 / median),
      frameP50: +median.toFixed(1),
      frameP95: +pct(sorted, 95).toFixed(1),
      frameWorst: +(sorted[sorted.length - 1] || 0).toFixed(1),
      repaintsPerSec: repaintTs.length,
      heapMB: memAny ? Math.round(memAny.usedJSHeapSize / 1048576) : null,
    };
  }

  function snapshot(): Record<string, unknown> {
    const w = computeWindow();
    const durationS = +((performance.now() - sessionStart) / 1000).toFixed(1);
    const nav = navigator as unknown as { deviceMemory?: number; hardwareConcurrency?: number };
    return {
      capturedAt: new Date().toISOString(),
      device: {
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        deviceMemoryGB: nav.deviceMemory ?? null,
        cores: nav.hardwareConcurrency ?? null,
      },
      window: w,
      session: {
        durationS,
        frames: sessionFrames,
        avgFps: durationS > 0 ? Math.round(sessionFrames / durationS) : 0,
        worstFrameMs: +sessionWorstFrame.toFixed(1),
        longTask: longTaskSupported
          ? { count: longTaskCount, maxMs: +longTaskMax.toFixed(1), totalBlockingMs: +longTaskTotalBlockingMs.toFixed(1) }
          : 'n/a (browser lacks longtask observer)',
        repaint: mapAttached
          ? { total: repaintTotal, peakPerSec: repaintPeakPerSec }
          : 'n/a (map not attached)',
      },
    };
  }

  function reset() {
    frameDt.length = 0;
    repaintTs.length = 0;
    repaintTotal = 0;
    repaintPeakPerSec = 0;
    longTaskCount = 0;
    longTaskMax = 0;
    longTaskTotalBlockingMs = 0;
    sessionFrames = 0;
    sessionWorstFrame = 0;
    lastTs = performance.now();
  }

  // ---- Overlay-DOM -------------------------------------------------------
  const el = document.createElement('div');
  const pos: Record<Corner, string> = {
    tl: 'top:8px;left:8px', tr: 'top:8px;right:8px', bl: 'bottom:8px;left:8px', br: 'bottom:8px;right:8px',
  };
  el.style.cssText =
    `position:fixed;${pos[corner]};z-index:2147483647;` +
    'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'background:rgba(20,18,16,0.86);color:#F5F1E8;padding:8px 10px;border-radius:8px;' +
    'box-shadow:0 4px 16px rgba(0,0,0,0.35);pointer-events:auto;white-space:pre;' +
    'user-select:none;min-width:150px;display:none;';
  const body = document.createElement('div');
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:6px;display:flex;gap:6px';
  const mkBtn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'flex:1;font:10px ui-monospace,monospace;background:#3a352f;color:#F5F1E8;border:1px solid #5C5447;border-radius:5px;padding:3px 4px;cursor:pointer';
    b.onclick = fn;
    return b;
  };
  el.appendChild(body);
  el.appendChild(bar);

  async function copyReport() {
    let label = '';
    try { label = window.prompt('Szenario-Label (z. B. idle-wind / slider / all-layers):', '') || ''; } catch { /* headless */ }
    const report = { label, ...snapshot() };
    const json = JSON.stringify(report, null, 2);
    // eslint-disable-next-line no-console
    console.log('[perfHud] report\n' + json);
    try { await navigator.clipboard.writeText(json); flash('kopiert ✓'); }
    catch { flash('in Konsole ✓'); }
  }

  let flashMsg = '';
  let flashUntil = 0;
  function flash(msg: string) { flashMsg = msg; flashUntil = performance.now() + 1500; }

  bar.appendChild(mkBtn('Copy', () => void copyReport()));
  bar.appendChild(mkBtn('Reset', reset));
  bar.appendChild(mkBtn('×', toggle));

  function render() {
    if (el.style.display !== 'none') {
      const w = computeWindow();
      const lt = longTaskSupported ? `${longTaskCount} (max ${longTaskMax.toFixed(0)}ms)` : 'n/a';
      const rp = mapAttached ? `${w.repaintsPerSec}/s (peak ${repaintPeakPerSec})` : 'attach map';
      const heap = w.heapMB != null ? `${w.heapMB}MB` : 'n/a';
      const now = performance.now();
      const f = now < flashUntil ? `\n${flashMsg}` : '';
      body.textContent =
        `FPS ${w.fps}   frame ${w.frameP50}/${w.frameP95}ms\n` +
        `worst ${w.frameWorst}ms   heap ${heap}\n` +
        `longtask ${lt}\n` +
        `repaints ${rp}` + f;
    }
    setTimeout(render, 250); // HUD selbst nur 4×/s aktualisieren → minimale Eigenlast
  }
  render();

  function setVisible(v: boolean) {
    el.style.display = v ? 'block' : 'none';
    try { localStorage.setItem('perfHud', v ? '1' : '0'); } catch { /* ignore */ }
  }
  function toggle() { setVisible(el.style.display === 'none'); }

  // Hotkey Shift+P
  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); toggle(); }
  });

  document.body.appendChild(el);

  // Standard-Sichtbarkeit: #perf-Hash oder gespeichertes Flag
  let startVisible = false;
  try {
    startVisible = location.hash.toLowerCase().includes('perf') || localStorage.getItem('perfHud') === '1';
  } catch { /* ignore */ }
  if (startVisible) setVisible(true);

  const api: PerfHudApi = {
    attachMap(map) {
      if (mapAttached) return;
      try { map.on('render', markRepaint); mapAttached = true; } catch { /* ignore */ }
    },
    toggle,
    reset,
    snapshot,
  };
  window.__perfHud = api;
  // eslint-disable-next-line no-console
  console.log('[perfHud] aktiv — Shift+P zeigt/versteckt das HUD, #perf im URL startet sichtbar.');
  return api;
}
