/**
 * Transport für das DWD-Objektprodukt **KONRAD3D** (Zell-Erkennung und
 * -Verfolgung) — Datenbasis des 2D-Layers „Zellbahnen" (E3).
 *
 * Belegte Randbedingungen (live gemessen 2026-08-05, `audit/zellbahnen.md` §2):
 *  - `opendata.dwd.de` sendet **kein** `Access-Control-Allow-Origin` ⇒ der
 *    Abruf läuft zwingend über den bestehenden Proxy `/_dwd_opendata/*`
 *    (`netlify.toml:27-31`, `vite.config.ts:8-12`). Der Proxy wird hier nur
 *    BENUTZT — an ihm wird nichts geändert.
 *  - Es gibt **keinen `latest`-Alias** (anders als bei Mesozyklonen und RV) ⇒
 *    Verzeichnis-Scrape, jüngster Zeitstempel gewinnt.
 *  - Takt 5 min, Retention 48 h (576 Dateien), ~0,6 MB je Datei, Latenz ~5 min.
 *
 * Wegen der Dateigröße gilt die Aufrufregel: **nur** bei aktivem Layer und
 * sichtbarem Tab abrufen (durchgesetzt im Aufrufer, `MapView.tsx`).
 */

import { parseKonrad3d, type Konrad3dRun } from '../radar/konrad3d';
import {
  RADAR_CDN_BASE, radarCdnEnabled, radarCdnUsable, noteRadarCdnFailure, radarCdnDeadline,
  radarImgEnabled,
} from './radolanRuns';
import { konradImgUrl, parseKonradImgJson } from './radarImg';

const KONRAD3D_DIR = '/_dwd_opendata/weather/radar/konrad3d/';

// ---------------------------------------------------------------------------
// RD2 — Datenweg über das Daten-Repo-CDN (audit/radar-datenrepo.md §13)
// ---------------------------------------------------------------------------
// Der Radar-Spiegel legt jede KONRAD3D-XML byte-identisch nach `radar/konrad3d/`
// auf `main`; die Zeitstempel sind rechenbar (5-Minuten-Raster, Verzug beim DWD
// gemessen ≈ 4:45–4:57 min, §1.2/§10.3) — damit entfällt auf dem CDN-Weg auch
// das 78,5-KB-Verzeichnislisting (H12/V-RD-3). Wie beim RV-Tar gilt ein
// ZEIT-GATE (zu frühe Anfragen hielte jsDelivr als 404 fest): ein Lauf wird
// frühestens bei Slot + KONRAD_CDN_GATE_MS angefragt. Existiert beim DWD schon
// ein Lauf, den das Gate noch sperrt (≈ 45 s je 5 min), übernimmt der bisherige
// Listing-Weg — die Karte bleibt exakt so frisch wie vor RD2.
export const KONRAD_PUBLISH_LAG_MIN = 4.75;
export const KONRAD_CDN_GATE_MS = 330_000;   // Slot + 5:30 (Ablage ≈ 4:57 + Push ≤ 17 s + Reserve)

/** Zeitstempel `YYYYMMDDTHHMM00` (UTC) eines KONRAD3D-Laufs. */
export function konradStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
}

/** Die `count` jüngsten Läufe, die bei `lagMs` Verzug sicher vorliegen — gerechnet, ohne Listing. */
export function guessKonradStamps(count: number, nowMs: number = Date.now(), lagMs: number = KONRAD_CDN_GATE_MS): string[] {
  const stepMs = 5 * 60_000;
  const newest = Math.floor((nowMs - lagMs) / stepMs) * stepMs;
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(konradStamp(new Date(newest - i * stepMs)));
  return out;
}

export function konradCdnUrl(stamp: string): string {
  return `${RADAR_CDN_BASE}/konrad3d/KONRAD3D_${stamp}.xml`;
}

/** CDN-Versuch; `null` heißt: der Listing-Weg (unten) übernimmt — wie bisher. */
async function fetchKonrad3dFromCdn(signal?: AbortSignal): Promise<Konrad3dRun | null> {
  if (!radarCdnEnabled() || !radarCdnUsable()) return null;
  const now = Date.now();
  // Frische-Fenster: der DWD hat schon einen Lauf, den das Gate noch sperrt.
  if (guessKonradStamps(1, now, KONRAD_PUBLISH_LAG_MIN * 60_000)[0] !== guessKonradStamps(1, now)[0]) return null;
  for (const stamp of guessKonradStamps(2, now)) {
    const file = `KONRAD3D_${stamp}.xml`;
    const dl = radarCdnDeadline(signal);
    try {
      // RD3 (audit §14): erst das kompakte cells.json des Spiegels (10–30 KB statt
      // ~255 KB XML — dieselbe `parseKonrad3d`-Ausgabe, deep-equal im Verifier);
      // 404/Schema-Drift fällt still auf das XML DESSELBEN Stempels zurück.
      if (radarImgEnabled()) {
        const jr = await fetch(konradImgUrl(stamp), { signal: dl.signal, priority: 'low' });
        if (jr.ok) {
          const run = parseKonradImgJson(await jr.json());
          if (run && run.refMs > 0) return run as Konrad3dRun;
        }
      }
      const res = await fetch(konradCdnUrl(stamp), { signal: dl.signal, priority: 'low' });
      if (!res.ok) continue;                    // 404: Spiegel hinkt ⇒ älterer Kandidat, dann Listing
      const run = parseKonrad3d(await res.text(), file);
      if (run.refMs === 0) continue;            // unvollständige Datei ⇒ weiterprobieren
      return run;
    } catch (err) {
      if (signal?.aborted) throw err;
      noteRadarCdnFailure();                    // Netz/Timeout: Sitzungs-Latch, Listing übernimmt
      return null;
    } finally { dl.done(); }
  }
  return null;
}

export const KONRAD3D_ATTRIBUTION =
  'Zellbahnen: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD KONRAD3D</a> · CC BY 4.0';

/** Dieselbe Quelle, aber für den Hagel-Layer korrekt benannt (Phase HA1). */
export const KONRAD3D_HAIL_ATTRIBUTION =
  'Hagel DE: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD KONRAD3D</a> · CC BY 4.0';

/** Zeitstempel-Cache des Verzeichnislistings (Muster `_runCache`, radolan.ts:144). */
let _listCache: { file: string; at: number } | null = null;
const LIST_CACHE_TTL = 60_000;

/** Cache des **geparsten** Laufs. Zwei Layer (Zellbahnen + Hagel) speisen sich aus
 *  derselben Datei; ohne diesen Cache lüde jeder von ihnen dieselben ~0,6 MB
 *  einzeln. TTL = Publikationstakt (5 min) minus Sicherheitsabstand. */
let _runCache: { run: Konrad3dRun; at: number } | null = null;
const RUN_CACHE_TTL = 60_000;

/** Listet das KONRAD3D-Verzeichnis und liefert die Dateinamen, jüngster zuerst. */
async function listKonrad3dFiles(signal?: AbortSignal): Promise<string[]> {
  // LE2/H7: Zellbahnen sind Beiwerk zum Radarbild — Listing (79 KB) und XML
  // (≈ 0,8 MB) liefen bisher im selben Startfenster wie der RV-Tar (V-LE-8).
  const res = await fetch(KONRAD3D_DIR, { signal, priority: 'low' });
  if (!res.ok) throw new Error(`KONRAD3D Verzeichnis: ${res.status}`);
  const html = await res.text();
  const set = new Set<string>();
  const re = /KONRAD3D_\d{8}T\d{6}\.xml/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) set.add(m[0]);
  // Der Dateiname ist ISO-artig sortierbar (YYYYMMDDTHHMMSS) — lexikografisch
  // absteigend = zeitlich absteigend.
  return [...set].sort().reverse();
}

async function fetchOne(file: string, signal?: AbortSignal): Promise<Konrad3dRun> {
  const res = await fetch(KONRAD3D_DIR + file, { signal, priority: 'low' });
  if (!res.ok) throw new Error(`KONRAD3D ${file}: ${res.status}`);
  const xml = await res.text();
  const run = parseKonrad3d(xml, file);
  if (run.refMs === 0) throw new Error(`KONRAD3D ${file}: keine Referenzzeit`);
  return run;
}

/**
 * Jüngsten KONRAD3D-Lauf holen und parsen.
 *
 * Wie bei RADOLAN-RV wird bei einem Fehlschlag der jüngsten Datei die
 * vorherige versucht: die neueste Datei kann während des Publikationsfensters
 * kurzzeitig unvollständig sein.
 *
 * **Null Zellen ist kein Fehler** — an einem konvektionsfreien Tag ist genau
 * das die richtige Antwort (`run.cells.length === 0`).
 */
export async function fetchKonrad3d(signal?: AbortSignal): Promise<Konrad3dRun> {
  if (_runCache && Date.now() - _runCache.at < RUN_CACHE_TTL) return _runCache.run;
  // RD2: erst der gerechnete CDN-Weg (ohne Listing); `null` ⇒ Listing + Proxy wie bisher.
  const viaCdn = await fetchKonrad3dFromCdn(signal);
  if (viaCdn) {
    _runCache = { run: viaCdn, at: Date.now() };
    return viaCdn;
  }
  let files: string[];
  if (_listCache && Date.now() - _listCache.at < LIST_CACHE_TTL) {
    files = [_listCache.file];
  } else {
    files = await listKonrad3dFiles(signal);
  }
  if (files.length === 0) throw new Error('KONRAD3D: keine Dateien gefunden');

  let lastErr: unknown;
  for (const file of files.slice(0, 2)) {
    try {
      const run = await fetchOne(file, signal);
      _listCache = { file, at: Date.now() };
      _runCache = { run, at: Date.now() };
      return run;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
      _listCache = null; // Listing neu holen, falls der Cache-Eintrag schuld war
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('KONRAD3D: Abruf fehlgeschlagen');
}
