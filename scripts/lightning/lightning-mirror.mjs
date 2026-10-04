/**
 * NP-0a — Blitze als Produkt des Radar-Spiegels (audit/np0-datenprodukte.md §8, E-NP0-2): der Spiegel
 * (`radar-mirror.mjs` im Daten-Repo) lädt dieses Modul aus seinem buscosun-web-Klon (APP_DIR), Muster des road-Hakens.
 * Reines JS: alles, was den Vertrag (`src/sources/lightningImg.ts`) braucht, läuft im Kindprozess
 * `lightning-derive.mjs` — und der läuft ASYNCHRON (`execFile`, nicht `execFileSync`): der Radar-Strang wartet nie auf
 * einen Blitzabruf (D-NP0-7: ein MTG-Abruf dauerte bis 7 s, das DWD→Push-Budget für RV liegt bei ≈ 11 s).
 *
 * Ablauf: `poll()` kostet im Strang < 1 ms. Ist kein Kindprozess unterwegs und die Prüffrist (`checkSec`, 45 s)
 * vorbei, startet es `lightning-derive.mjs <MIRROR/img> auto` im Hintergrund; der liest die Capabilities beider
 * Quellen, holt fehlende Slots (höchstens 3 je Quelle und Lauf) und schreibt atomar nach `MIRROR/img/lightning-*`.
 * Das nächste `poll()` nach dem Ende meldet `{ changed: true }` — der Spiegel beschneidet dann die Blitz-Quellen und
 * nimmt die Dateien beim nächsten Produkt-Push mit (`publish()` kopiert `MIRROR/img` ganz); nach 5 min ohne
 * Produkt-Push pusht er sie selbst. Ein Fehler nimmt nur die Blitze, nie den Radar-Push.
 *
 * Aus: `LIGHTNING=0` (der Spiegel lädt das Modul dann nicht und lässt `lightning-*` beim Start fallen).
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LIGHTNING_DIRS = Object.freeze(['lightning-de', 'lightning-mtg']);

export function createLightningMirror({
  appDir, mirrorDir, log = console.log, now = () => Date.now(),
  checkSec = Number(process.env.LIGHTNING_CHECK_SEC ?? 45), childTimeoutMs = 90_000,
  // Vom Spiegel: true, solange ein RV-Slot gleich erwartet wird. Dann startet kein Kindprozess — im Lokaltest stieg der
  // RV-Derive unter einem parallelen Blitz-Backfill von 3,0–3,6 auf 5,7–7,2 s (CPU-Konkurrenz, audit §8.5).
  quiet = () => false,
} = {}) {
  const script = appDir ? join(appDir, 'scripts', 'lightning', 'lightning-derive.mjs') : '';
  const registerTs = appDir ? pathToFileURL(join(appDir, 'scripts', 'lib', 'register-ts.mjs')).href : '';
  const enabled = process.env.LIGHTNING !== '0' && !!appDir && existsSync(script);
  const imgRoot = join(mirrorDir, 'img');

  let busy = false;
  let nextCheckAt = 0;
  let finished = null;     // Ergebnis des letzten Kindprozesses, noch nicht abgeholt
  const status = {
    enabled, checkSec, runs: 0, written: 0, rejected: 0, failed: 0,
    lastRunAt: null, lastRunMs: null, caps: {}, last: [], errors: [],
  };

  function start() {
    busy = true;
    const t0 = now();
    execFile(process.execPath, ['--experimental-strip-types', '--import', registerTs, script, imgRoot, 'auto'],
      { encoding: 'utf8', timeout: childTimeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        busy = false;
        status.runs++;
        status.lastRunAt = new Date(t0).toISOString();
        status.lastRunMs = now() - t0;
        if (err) {
          status.failed++;
          const why = String(stderr || err.message).split('\n').find((l) => l.trim() && !l.includes('ExperimentalWarning')) ?? 'unbekannt';
          status.errors = [{ at: new Date(now()).toISOString(), error: why.slice(0, 200) }, ...status.errors].slice(0, 6);
          finished = { done: [], rejected: [], failed: [{ error: why }] };
          return;
        }
        try { finished = JSON.parse(String(stdout).trim().split('\n').pop()); }
        catch { finished = { done: [], rejected: [], failed: [{ error: 'Ausgabe nicht lesbar' }] }; }
      });
  }

  /** Im Strang des Spiegels, jede Schleife: nie blockierend. */
  function poll() {
    if (!enabled) return { changed: false };
    let changed = false;
    if (finished) {
      const r = finished;
      finished = null;
      status.written += r.done.length;
      status.rejected += r.rejected.length;
      status.failed += r.failed.length;
      if (r.caps) status.caps = r.caps;
      if (r.done.length) changed = true;
      status.last = [...r.done.map((d) => ({ ...d, ok: true })), ...r.rejected, ...r.failed].slice(0, 12);
      for (const d of r.done) log(`lightning ${d.id} ${d.stamp} · ${(d.bytes / 1024).toFixed(1)} KB in ${d.ms} ms · aktiv ${d.active} px${d.fractionalPx ? ` · gebrochen ${d.fractionalPx} px` : ''}`);
      for (const x of r.rejected) log(`lightning ${x.id} ${x.timeIso}: verworfen — ${x.reason}`);
      for (const x of r.failed) log(`lightning ${x.id ?? ''} ${x.timeIso ?? ''}: ${x.error} — nächster Versuch`);
    }
    if (!busy && now() >= nextCheckAt && !quiet()) {
      nextCheckAt = now() + checkSec * 1000;
      start();
    }
    return { changed };
  }

  return { get enabled() { return enabled; }, get busy() { return busy; }, poll, status };
}
