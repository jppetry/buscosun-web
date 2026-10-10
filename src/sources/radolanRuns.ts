/**
 * RADOLAN-RV — Lauf-Zeitstempel und Frühstart des Tar-Abrufs. Bewusst OHNE
 * Abhängigkeiten (kein Worker, kein Decoder), damit der Router ihn aus dem
 * index-Chunk anstoßen kann, sobald die Route feststeht (LE1/H2).
 *
 * Lauf-Zeitstempel: gerechnet statt gelistet (BW-5). Das RV-Verzeichnis ist ein
 * lückenloses 5-Minuten-Raster — gemessen am 2026-08-24: 577 Läufe über 48 h,
 * keine einzige Abweichung vom Takt. Der Veröffentlichungsverzug über zwölf
 * aufeinanderfolgende Läufe (Last-Modified gegen Slot-Zeit): 3,28 / 3,33 /
 * 3,43 min als min/median/max. Wir raten AGGRESSIV, beim frühestmöglichen
 * Slot, und lassen einen 404 den Rest erledigen (`radolan.ts`, Listing bleibt
 * der benannte Fallback).
 *
 * Frühstart (H2): `audit/layer-erstbild.md` §2.2/§2.3 — der Tar (2,4 MB) ist der
 * längste Einzelabruf des Regenradars und des Niederschlag-Layers, und er wurde
 * erst angefragt, wenn React die Karte gemountet hatte (2,4 s nach dem Aufruf).
 * Hier startet er, sobald die Route feststeht; `radolan.ts` nimmt die laufende
 * Antwort entgegen statt selbst zu holen. Ein 404 (Lauf noch nicht da) ist kein
 * Fehler des Frühstarts: der Leser sieht `!res.ok` und probiert wie bisher den
 * nächsten Kandidaten.
 */

export const RV_DIR = '/_dwd_opendata/weather/radar/composite/rv/';
export const RV_STEP_MIN = 5;
export const RV_PUBLISH_LAG_MIN = 3.3;
/** Cache der KOMPRIMIERTEN Tars (Cache API, s. `radolan.ts`). */
export const RV_TAR_CACHE = 'radolan-rv-tar-v1';

// ---------------------------------------------------------------------------
// RD2 — Datenweg über das Daten-Repo-CDN (audit/radar-datenrepo.md §13)
// ---------------------------------------------------------------------------
// Ein Spiegel im Daten-Repo legt jeden RV-Tar BYTE-IDENTISCH nach
// `radar/rv/` auf `main` (alle 25 Frames 0…+120 min bleiben drin); jsDelivr
// liefert ihn aus, ohne dass ein Byte über Netlify läuft. Gemessen (§10.3):
// die Datei steht ≈ 12 s nach der DWD-Ablage auf dem CDN — ABER eine Anfrage,
// die dem Push zuvorkommt, hält jsDelivr als 404 fest (62–118 s, med 66) und
// macht den Slot für ALLE so lange unsichtbar. Deshalb ist der CDN-Weg
// ZEIT-GEGATTERT: ein Slot wird dort frühestens bei Slot + RV_CDN_GATE_MS
// angefragt (DWD-Ablage 3:17–3:26 + Push ≤ 17 s + CDN ≤ 4 s + Reserve).
// Jünger ⇒ Netlify-Weg mit dem aggressiven Rat, exakt wie bisher — die
// Frische der App ändert sich dadurch NICHT. Älter als das Retention-Fenster
// des Spiegels (12 Läufe = 1 h) liegt nichts mehr auf `main` ⇒ ebenfalls
// Netlify. Kill-Switch `?radarcdn=0` bzw. `localStorage.radarcdn = '0'`
// (Query schlägt Speicher in beide Richtungen, D-31-Muster); zwei harte
// Netzfehler des CDN in einer Sitzung schalten den Weg für die Sitzung ab
// (404 zählt nicht — „noch nicht gespiegelt" ist eine Antwort).
export const RADAR_CDN_BASE = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/radar';
export const RV_CDN_GATE_MS = 240_000;              // Slot + 4:00 (gemessen §10.3/§8)
export const RADAR_CDN_WINDOW_MS = 55 * 60_000;     // Retention 12 Läufe minus Reserve
export const RADAR_CDN_FAIL_LATCH = 2;
let _cdnHardFails = 0;

/** `YYMMDDHHMM` (UTC, `rvStamp`) → ms des Slots. */
export function rvStampToMs(s: string): number {
  return Date.UTC(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10));
}

// ---------------------------------------------------------------------------
// EX-3 — zwei Lieferformen desselben Laufs (audit/fusion-expertenbericht-2026-09-29.md §3.3)
// ---------------------------------------------------------------------------
// Der DWD legt jeden RV-Lauf bis zum 2026-10-20 08 UTC doppelt ab: als RADOLAN-Binär
// (`DE1200_RV<JJMMTTHHMM>.tar.bz2`) und als ODIM-HDF5 (`composite_rv_<JJJJMMTT>_<HHMM>.tar`,
// unkomprimiertes Tar). Danach bleibt nur HDF5. Der Leser fragt deshalb HDF5 ZUERST und
// nimmt das Altformat als benannten Rückfall; `?rvfmt=radolan|hdf5` (bzw.
// `localStorage.rvfmt`) legt die Form fest, ohne Rückfall auf die andere.
// Der Slot-Stempel `JJMMTTHHMM` bleibt der Schlüssel aller Wege (Bild-Verzeichnis, Cache).
// Dieses Modul liegt im Start-Chunk und kennt nur die HDF5-Form; die Adressen des Altformats baut
// `rvUrls` in `radolanDecode.ts`.
/** Dateiname eines RV-Laufs (HDF5-Lieferung); `ts` = `JJMMTTHHMM`. */
export function rvFileName(ts: string): string {
  return `composite_rv_20${ts.slice(0, 6)}_${ts.slice(6)}.tar`;
}

// (`rvFormatOrder` und `rvStampFromFileName` stehen in `radolanDecode.ts` — dieses Modul liegt im Start-Chunk.)

export function rvTarCdnUrl(ts: string): string {
  return `${RADAR_CDN_BASE}/rv/${rvFileName(ts)}`;
}

/** Kill-Switch: `?radarcdn=0|1` schlägt `localStorage.radarcdn` (beide Richtungen). */
export function radarCdnEnabled(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('radarcdn'); } catch { /* kaputte Query = kein Votum */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('radarcdn') : null; } catch { s = null; }
  }
  return s !== '0';
}

/** Harter CDN-Fehler (Netz/Timeout — NICHT 404). Ab RADAR_CDN_FAIL_LATCH: Sitzung auf Netlify. */
export function noteRadarCdnFailure(): void { _cdnHardFails++; }
export function radarCdnUsable(): boolean { return _cdnHardFails < RADAR_CDN_FAIL_LATCH; }

/** Darf DIESER Lauf jetzt vom CDN angefragt werden? (Gate + Fenster + Schalter + Latch) */
export function rvCdnEligible(ts: string, nowMs: number = Date.now()): boolean {
  if (!radarCdnUsable() || !radarCdnEnabled()) return false;
  const age = nowMs - rvStampToMs(ts);
  return age >= RV_CDN_GATE_MS && age <= RADAR_CDN_WINDOW_MS;
}

/** Der EINE Ort für die Wegwahl: CDN wenn berechtigt, sonst der Netlify-Pfad wie bisher. */
export function rvTarUrlFor(ts: string, nowMs: number = Date.now()): string {
  return rvCdnEligible(ts, nowMs) ? rvTarCdnUrl(ts) : rvTarUrl(ts);
}

/** Frist NUR für den CDN-Versuch: läuft sie ab, übernimmt der Netlify-Weg —
 *  ein hängendes CDN darf das Radar nicht länger aufhalten als das. Koppelt
 *  das Abbruch-Signal des Aufrufers, ohne `AbortSignal.any` vorauszusetzen. */
export const RADAR_CDN_DEADLINE_MS = 8_000;
/**
 * Phase PF (M8, audit/performance-2026-10-10.md D-PF-13): `touch()` restarts the clock. The deadline is meant to catch a HANGING
 * CDN, not a slow link that is making progress — measured 10.10.2026 on mobile 4G: the 25 dual frames of an RV slot (5,4 MB)
 * take 8–13 s, the 8-s deadline cut them off and the reader fell back to the TAR (7,4 MB, another 10+ s). A reader that
 * calls `touch()` whenever a file of the slot has arrived keeps the hang detection (8 s without ANY progress) and loses the
 * false fallback. Readers that never call it behave exactly as before.
 */
export function radarCdnDeadline(signal: AbortSignal | undefined, ms: number = RADAR_CDN_DEADLINE_MS): { signal: AbortSignal; done: () => void; touch: () => void } {
  const c = new AbortController();
  const fire = () => c.abort(new Error(`CDN-Frist ${ms} ms ohne Fortschritt`));
  let t = setTimeout(fire, ms);
  const onAbort = () => c.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  const touch = () => { if (c.signal.aborted) return; clearTimeout(t); t = setTimeout(fire, ms); };
  return { signal: c.signal, done: () => { clearTimeout(t); signal?.removeEventListener('abort', onAbort); }, touch };
}


/** Nur für Verifier/Tests. */
export function _resetRadarCdn(): void { _cdnHardFails = 0; }

// ---------------------------------------------------------------------------
// RD3 — Bild-Weg: fertig aufbereitete Frames vom Daten-Repo (audit §14)
// ---------------------------------------------------------------------------
// Der Spiegel legt je RV-Slot 25 Graustufen-PNGs (`precipToU8`-Bytes, byte-
// verlustfrei) + meta.json unter `radar/img/v1/rv/<stamp>/` ab. Diese
// Primitiven (Pfade, Gate, Schalter) leben HIER, damit der Router-Frühstart
// sie ohne schwere Importe nutzen kann; Meta-Schema und die übrigen Quellen
// stehen in `radarImg.ts`.
export const RADAR_IMG_VERSION = 'v1';
export const RADAR_IMG_BASE = `${RADAR_CDN_BASE}/img/${RADAR_IMG_VERSION}`;
/**
 * Bild-Gate: Tar-Gate (240 s) + gemessene Derive-Zeit (1,8–1,9 s, §14.1) mit
 * Reserve — die PNGs erscheinen NACH dem Roh-Tar im selben Push-Takt.
 */
export const RV_IMG_GATE_MS = 270_000;

/** Kill-Switch NUR für den Bild-Weg: `?radarimg=0|1` schlägt `localStorage.radarimg`
 *  (D-31); `?radarcdn=0` bleibt der äußere Schalter über alle Radar-CDN-Wege. */
export function radarImgFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('radarimg'); } catch { /* kaputte Query = kein Votum */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('radarimg') : null; } catch { s = null; }
  }
  return s !== '0';
}
export function radarImgEnabled(): boolean { return radarImgFlagFrom(); }

/** Frame-Dateiname je Lead-Minute (`f000.png` … `f120.png`). */
export function radarImgFrameFile(leadMin: number): string {
  return `f${String(leadMin).padStart(3, '0')}.png`;
}
/** HD-3: Dual-Frame je Lead-Minute (`g000.png` … Grau + Alpha = v1-Byte + Log-Ebene). Lebt hier (abhängigkeitsfrei) seit
 *  Phase PF, weil der Frühstart es wärmt; `radarImg.ts` re-exportiert es als Vertragsadresse. */
export function radarImgDualFile(leadMin: number): string {
  return `g${String(leadMin).padStart(3, '0')}.png`;
}

/** RV-Bild-Slot-Verzeichnis; `ts` ist der Tar-Stempel `YYMMDDHHMM`. */
export function rvImgDir(ts: string): string {
  return `${RADAR_IMG_BASE}/rv/${ts}`;
}

/** Darf DIESER Lauf jetzt als Bild-Slot angefragt werden? (Gate + Fenster + beide Schalter + Latch) */
export function rvImgEligible(ts: string, nowMs: number = Date.now()): boolean {
  if (!radarCdnUsable() || !radarCdnEnabled() || !radarImgEnabled()) return false;
  const age = nowMs - rvStampToMs(ts);
  return age >= RV_IMG_GATE_MS && age <= RADAR_CDN_WINDOW_MS;
}

// NP-0a (audit/np0-datenprodukte.md §8, E-NP0-1): Rückblick 2 h. Die gemessene Analyse `f000.png` jedes RV-Slots
// liegt zusätzlich unter `radar/img/v1/rv-past/<YYMMDDHHMM>/f000.png` — 24 Slots (Altersregel im Spiegel), während die
// vollen RV-Slots (25 Frames + Stundenmittel) bei 12 bleiben. Byte-gleich zur `f000.png` des RV-Slots (der Spiegel
// kopiert sie). `RV_IMG_GATE_MS` und `RADAR_CDN_WINDOW_MS` bleiben unverändert.
/** Slots im Rückblick (2 h bei 5 min). Der Spiegel hält sie mit `PAST_KEEP` (Rückweg `PAST_KEEP=12` ⇒ kein rv-past). */
export const RV_PAST_KEEP = 24;
/** Lese-Fenster des Rückblicks: 24 Slots minus Reserve — dieselbe Herleitung wie die 55 min von `RADAR_CDN_WINDOW_MS`. */
export const RADAR_PAST_WINDOW_MS = 115 * 60_000;

/** Rückblick-Slot-Verzeichnis (nur `f000.png`); `ts` ist der Tar-Stempel `YYMMDDHHMM`. */
export function rvPastDir(ts: string): string {
  return `${RADAR_IMG_BASE}/rv-past/${ts}`;
}

/** Darf die Analyse DIESES Laufs jetzt aus dem Rückblick geholt werden? (Gate wie der Bild-Slot, Fenster 115 min) */
export function rvPastEligible(ts: string, nowMs: number = Date.now()): boolean {
  if (!radarCdnUsable() || !radarCdnEnabled() || !radarImgEnabled()) return false;
  const age = nowMs - rvStampToMs(ts);
  return age >= RV_IMG_GATE_MS && age <= RADAR_PAST_WINDOW_MS;
}

/** Zeitstempel `YYMMDDHHMM` (UTC) eines RV-Laufs. */
export function rvStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return p(d.getUTCFullYear() % 100) + p(d.getUTCMonth() + 1) + p(d.getUTCDate())
    + p(d.getUTCHours()) + p(d.getUTCMinutes());
}

/**
 * Die `count` jüngsten plausiblen Lauf-Zeitstempel, absteigend — GERECHNET,
 * ohne Netz. Der Verifier prüft sie gegen das echte Verzeichnis (`verify:radar-runs`).
 */
export function guessRvRuns(count: number, nowMs: number = Date.now()): string[] {
  const stepMs = RV_STEP_MIN * 60_000;
  const newest = Math.floor((nowMs - RV_PUBLISH_LAG_MIN * 60_000) / stepMs) * stepMs;
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(rvStamp(new Date(newest - i * stepMs)));
  return out;
}

export function rvTarUrl(ts: string): string {
  return `${RV_DIR}${rvFileName(ts)}`;
}

/** Ergebnis eines Frühstarts: die Antwort und ob sie schon aus der Cache-API kam
 *  (dann legt der Leser sie nicht ein zweites Mal ab). */
export interface WarmRvTar { res: Response; fromCache: boolean }

interface Warm { at: number; p: Promise<WarmRvTar> }
const warm = new Map<string, Warm>();
/** Ein vorgestarteter Tar gilt so lange wie sein Lauf plausibel jüngster ist. */
export const RV_WARM_TTL_MS = RV_STEP_MIN * 60_000;

/**
 * Startet den Abruf des jüngsten plausiblen RV-Tars vor (Cache-API zuerst — liegt
 * der Lauf schon, gibt es nichts zu laden). Liefert die URL, die vorgestartet
 * wurde, oder `null` ohne `fetch` (SSR/Headless). Zweiter Aufruf = No-op.
 */
export function warmRvTar(nowMs: number = Date.now()): string | null {
  if (typeof fetch !== 'function') return null;
  const ts = guessRvRuns(1, nowMs)[0];
  // RD3: ist der jüngste plausible Slot schon Bild-berechtigt, wärmt der Frühstart
  // meta.json + f000.png (Erstbild-Frame) statt des ganzen Tars — der Leser nimmt
  // beide über dieselben URL-Schlüssel entgegen.
  if (rvImgEligible(ts, nowMs)) {
    const dir = rvImgDir(ts);
    // Phase PF (M1): the dual analysis frame (`g000.png`, log plane) is warmed as well — the reader takes it first and draws it
    // before the forecast frames; on a slot without dual frames it is a cheap 404 and the `f000.png` stays the first picture.
    for (const u of [`${dir}/meta.json`, `${dir}/${radarImgDualFile(0)}`, `${dir}/${radarImgFrameFile(0)}`]) {
      const curImg = warm.get(u);
      if (curImg && nowMs - curImg.at < RV_WARM_TTL_MS) continue;
      const pi = (async (): Promise<WarmRvTar> => ({ res: await fetch(u, { priority: 'high' } as RequestInit), fromCache: false }))();
      pi.catch(() => { /* der Leser sieht die Ablehnung */ });
      warm.set(u, { at: nowMs, p: pi });
    }
    return `${dir}/meta.json`;
  }
  // RD2: derselbe Resolver wie der Leser — CDN, sobald der Slot das Gate passiert
  // hat, sonst Netlify. Der Leser probiert beim `take` beide URL-Schlüssel.
  // EX-3: in der Lieferform, die der Leser zuerst versucht (HDF5; der Schalter `rvfmt` ist ein
  // Diagnoseweg und wirkt erst im Leser).
  const url = rvTarUrlFor(ts, nowMs);
  const cur = warm.get(url);
  if (cur && nowMs - cur.at < RV_WARM_TTL_MS) return url;
  const p = (async (): Promise<WarmRvTar> => {
    try {
      if (typeof caches !== 'undefined') {
        const cache = await caches.open(RV_TAR_CACHE);
        const hit = await cache.match(url);
        if (hit) return { res: hit, fromCache: true };
      }
    } catch { /* Cache-API nicht verfügbar → Netz */ }
    // `priority: 'high'`: der Tar ist das Erstbild; Kacheln, Fonts und
    // Nachbarquellen dürfen dahinter warten (LE0 H7 — hier nur für den Frühstart).
    return { res: await fetch(url, { priority: 'high' } as RequestInit), fromCache: false };
  })();
  p.catch(() => { /* der Leser sieht die Ablehnung */ });
  warm.set(url, { at: nowMs, p });
  return url;
}

/** Nimmt den vorgestarteten Abruf EINMAL entgegen; `null` = selbst holen. */
export function takeWarmRvTar(url: string, nowMs: number = Date.now()): Promise<WarmRvTar> | null {
  const cur = warm.get(url);
  if (!cur) return null;
  warm.delete(url);
  return nowMs - cur.at < RV_WARM_TTL_MS ? cur.p : null;
}

/** Nur für Verifier/Tests. */
export function _warmRvCount(): number { return warm.size; }
export function _resetWarmRv(): void { warm.clear(); }
