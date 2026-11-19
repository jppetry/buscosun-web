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
import { konradImgUrl, parseKonradImgJson, fetchImgRes, radarMarkRawFirst, RadarImg404 } from './radarImg';

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

// ---------------------------------------------------------------------------
// Phase RN-4 — KONRAD3D from the data repo only (audit/radar-nur-datenrepo.md §10, E-RN-7, Jan 18.11.2026)
// ---------------------------------------------------------------------------
// Until RN-4 the reader went to the DWD (listing 79 KB + XML 0,6–0,8 MB through `/_dwd_opendata`) in the 45 s of every
// 5 min in which the DWD has a slot the gate still holds back, after a 404 on both candidates, after any network error (it
// had no second host) and behind the radar latch. Now it reads the newest slot that passed its gate, then the two before
// it — each as `cells.json` (the XML of the same stamp only when the JSON is unreadable or with `?radarimg=0`), on jsDelivr
// AND raw.githubusercontent (`fetchImgRes`: hedge after 2,5 s, at once after an error). A slot younger than
// `KONRAD_CDN_READY_MS` reads raw first: the mirror commits a slot 303–326 s after the slot time (measured 18.11.) and
// jsDelivr resolves `@main` 31–90 s after the push. A hard failure is repeated once on the same slot, raw first. Nothing
// is asked before the gate (raw holds a 404 ≈ 60 s, audit §1.3) — a consumer that got the slot before the DWD's newest asks
// again when that one passes its gate (`konradFollowUpInMs`).
// Named fallback (Rule 2): `?konraddwd=1` / `localStorage.konraddwd = '1'` (D-31: query beats storage); `?radarcdn=0` —
// "no radar from the CDN" — still means the DWD way.
export const KONRAD_DWD_DEFAULT = false;
/** The explicit switch alone: `?konraddwd=0|1` beats `localStorage.konraddwd`; without a vote `KONRAD_DWD_DEFAULT`. */
export function konradDwdFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('konraddwd'); } catch { /* kaputte Query = kein Votum */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('konraddwd') : null; } catch { s = null; }
  }
  return s === '1' ? true : s === '0' ? false : KONRAD_DWD_DEFAULT;
}
/** May the KONRAD3D reader ask the DWD (through Netlify)? Only with the switch, or when every radar CDN way is switched off. */
export function konradDwdDirect(): boolean { return konradDwdFlagFrom() || !radarCdnEnabled(); }

/** A slot younger than this reads raw.githubusercontent first (commit ≤ 326 s measured + jsDelivr `@main` lag ≤ 90 s + reserve). set. */
export const KONRAD_CDN_READY_MS = 450_000;
/** Slots the repo-only reader tries, newest first (the mirror keeps 24). */
export const KONRAD_REPO_SLOTS = 3;
/** Hard failures (network, deadline — on both hosts) after which one call gives up. set. */
export const KONRAD_REPO_HARD_MAX = 3;
/** RN-4: no KONRAD3D slot readable from the data repo right now. Never thrown with the DWD way on. */
export class KonradNotInRepo extends Error {}

/** Slot time (ms) of a stamp `YYYYMMDDTHHMM00` — also read out of a file name (`KONRAD3D_<stamp>.xml`). NaN for anything else. */
export function konradStampMs(stamp: string): number {
  const m = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(stamp);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
}

/**
 * RN-4: when should a consumer that holds `run` ask again, ahead of its regular 5-min poll? The newest slot is not offered
 * before its gate (it used to come from the DWD then, 45 s of every 5 min), so a poll that is phase-locked to the opening
 * would stay one slot behind. Answer: `gate − age + pad` while the slot the DWD already has waits for its gate; after the
 * gate, while the mirror may still be late, once more after `KONRAD_FOLLOW_RETRY_MS` (clear of the ≈ 60 s raw holds a 404)
 * until `KONRAD_FOLLOW_LATE_MS` behind the gate. `null` = nothing to wait for, or the DWD way is on. All three numbers set.
 */
export const KONRAD_FOLLOW_PAD_MS = 20_000;   // commit 303–328 s after the slot (15 slots, 18.11.) + push ⇒ ask at 350 s
export const KONRAD_FOLLOW_RETRY_MS = 70_000;
export const KONRAD_FOLLOW_LATE_MS = 90_000;
export function konradFollowUpInMs(run: { file: string }, nowMs: number = Date.now()): number | null {
  if (konradDwdDirect()) return null;
  const newest = konradStampMs(guessKonradStamps(1, nowMs, KONRAD_PUBLISH_LAG_MIN * 60_000)[0]);   // what the DWD has by now
  if (!(newest > konradStampMs(run.file))) return null;
  const age = nowMs - newest;
  if (age < KONRAD_CDN_GATE_MS) return KONRAD_CDN_GATE_MS - age + KONRAD_FOLLOW_PAD_MS;
  return age < KONRAD_CDN_GATE_MS + KONRAD_FOLLOW_LATE_MS ? KONRAD_FOLLOW_RETRY_MS : null;
}

/** One slot from the data repo. `null` = not there (404 on both hosts, or a file without a reference time); throws on a hard failure. */
async function fetchKonradSlotFromRepo(stamp: string, rawFirst: boolean, signal?: AbortSignal): Promise<Konrad3dRun | null> {
  const dl = radarCdnDeadline(signal);
  try {
    if (radarImgEnabled()) {
      const url = konradImgUrl(stamp);
      if (rawFirst) radarMarkRawFirst(url.slice(0, url.lastIndexOf('/')));
      const res = await fetchImgRes(url, dl.signal, 'low');
      const run = parseKonradImgJson(await res.json().catch(() => null));
      if (run && run.refMs > 0) return run as Konrad3dRun;
      // JSON there but unreadable (schema drift) ⇒ the XML of the SAME stamp, from the repo as well
    }
    const res = await fetchImgRes(konradCdnUrl(stamp), dl.signal, 'low');
    const run = parseKonrad3d(await res.text(), `KONRAD3D_${stamp}.xml`);
    return run.refMs === 0 ? null : run;
  } catch (err) {
    if (err instanceof RadarImg404) return null;
    throw err;
  } finally { dl.done(); }
}

async function fetchKonrad3dRepoOnly(signal?: AbortSignal): Promise<Konrad3dRun> {
  const now = Date.now();
  let hard = 0;
  let last: unknown = null;
  for (const stamp of guessKonradStamps(KONRAD_REPO_SLOTS, now)) {
    // a young slot — and every slot while the radar latch is closed — reads raw first, the CDN is its hedge
    let rawFirst = now - konradStampMs(stamp) < KONRAD_CDN_READY_MS || !radarCdnUsable(now);
    for (let attempt = 0; attempt < 2 && hard < KONRAD_REPO_HARD_MAX; attempt++) {
      try {
        const run = await fetchKonradSlotFromRepo(stamp, rawFirst, signal);
        if (run) return run;
        break;                                  // not there ⇒ the slot before it
      } catch (err) {
        if (signal?.aborted) throw err;
        hard++; last = err; rawFirst = true;    // hard failure ⇒ the same slot once more, raw first
        noteRadarCdnFailure();
      }
    }
    if (hard >= KONRAD_REPO_HARD_MAX) break;
  }
  const why = hard
    ? `${hard} Fehlversuche, zuletzt: ${last instanceof Error ? last.message : String(last)}`
    : `keiner der ${KONRAD_REPO_SLOTS} jüngsten Slots liegt im Spiegel`;
  throw new KonradNotInRepo(`KONRAD3D: nicht aus dem Daten-Repo lesbar (${why})`);
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
let _runCache: { run: Konrad3dRun; at: number; want: string } | null = null;
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
  // RN-4: repo only. The cache then also asks WHICH slot is due — a follow-up at the gate must not get the run of a
  // minute ago back (`konradFollowUpInMs` fires 20–65 s after a load, the TTL is 60 s).
  const repoOnly = !konradDwdDirect();
  const want = repoOnly ? guessKonradStamps(1)[0] : '';
  if (_runCache && Date.now() - _runCache.at < RUN_CACHE_TTL && _runCache.want === want) return _runCache.run;
  if (repoOnly) {
    const run = await fetchKonrad3dRepoOnly(signal);
    _runCache = { run, at: Date.now(), want };
    return run;
  }
  // RD2: erst der gerechnete CDN-Weg (ohne Listing); `null` ⇒ Listing + Proxy wie bisher.
  const viaCdn = await fetchKonrad3dFromCdn(signal);
  if (viaCdn) {
    _runCache = { run: viaCdn, at: Date.now(), want };
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
      _runCache = { run, at: Date.now(), want };
      return run;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
      _listCache = null; // Listing neu holen, falls der Cache-Eintrag schuld war
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('KONRAD3D: Abruf fehlgeschlagen');
}

/** Nur für Verifier/Tests. */
export function _resetKonrad3d(): void { _runCache = null; _listCache = null; }
