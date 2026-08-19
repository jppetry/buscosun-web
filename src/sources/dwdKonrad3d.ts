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

const KONRAD3D_DIR = '/_dwd_opendata/weather/radar/konrad3d/';

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
  const res = await fetch(KONRAD3D_DIR, { signal });
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
  const res = await fetch(KONRAD3D_DIR + file, { signal });
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
