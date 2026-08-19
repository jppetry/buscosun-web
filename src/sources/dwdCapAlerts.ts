/**
 * Transport für die amtlichen **DWD-Wetterwarnungen** (CAP 1.2) — Datenbasis
 * des 2D-Layers „Warnungen" (Phase W1, `audit/wetterwarnungen.md`).
 *
 * Belegte Randbedingungen (live gemessen 2026-08-06):
 *  - `opendata.dwd.de` sendet **kein** `Access-Control-Allow-Origin` ⇒ Abruf
 *    über den bestehenden Proxy `/_dwd_opendata/*` (`netlify.toml:27-31`,
 *    `vite.config.ts:8-12`). Der Proxy wird nur BENUTZT — nichts daran geändert.
 *  - Anders als KONRAD3D gibt es einen **stabilen `LATEST`-Alias**, der mit der
 *    jüngsten zeitgestempelten Datei byte-identisch ist (SHA-1 verglichen,
 *    `audit/wetterwarnungen.md` §3) ⇒ **kein Verzeichnis-Scrape**, eine feste
 *    URL, kein Vorgänger-Fallback nötig.
 *  - Gewählt ist der **Landkreis**-Vollstand (`DISTRICT_DWD_STAT`, Sprache DE):
 *    er liefert für 100 % der Gebiete ein Polygon, die feinere
 *    `COMMUNEUNION`-Variante nur für 3,3 % (§2). ~110 KB je Abruf.
 *  - Der Vollstand ist selbsttragend: Aufhebungen brauchen keine Sonderlogik,
 *    was nicht mehr in der Datei steht, ist weg.
 *
 * Aufrufregel wie bei Z1/HA1: **nur** bei aktivem Layer und sichtbarem Tab
 * abrufen (durchgesetzt im Aufrufer, `MapView.tsx`).
 */

import { parseCapArchive, isRenderableAlert, type CapAlert } from '../warnings/capAlerts';

const CAP_URL =
  '/_dwd_opendata/weather/alerts/cap/DISTRICT_DWD_STAT/'
  + 'Z_CAP_C_EDZW_LATEST_PVW_STATUS_PREMIUMDWD_DISTRICT_DE.zip';

/**
 * Attribution in der **unveränderten** Form „Quelle: Deutscher Wetterdienst"
 * (`docs/API.md` §7): Sie ist hier korrekt, weil dieser Layer die Warnung
 * wiedergibt statt sie abzuleiten — Texte wortwörtlich, Farbe aus der Meldung.
 * Für abgeleitete Raster gilt dagegen die `Datenbasis:`-Form.
 */
export const DWD_WARNINGS_ATTRIBUTION =
  'Warnungen: Quelle <a href="https://www.dwd.de/DE/wetter/warnungen/warnWetter_node.html" '
  + 'target="_blank" rel="noopener">Deutscher Wetterdienst</a> · CC BY 4.0';

export interface WarnRun {
  /** Nur darstellbare Meldungen (echt, nicht zurückgezogen, mit Geometrie). */
  alerts: CapAlert[];
  /** Meldungen im Archiv insgesamt — inkl. der aussortierten. */
  entries: number;
  /**
   * Aussortierte Einträge (unlesbar, ohne Geometrie, Test-/Cancel-Meldungen).
   * Wird bewusst mitgeführt: „0 Warnungen" darf nie heißen „30 nicht gelesen".
   */
  dropped: number;
  /**
   * Publikationszeit der Datei (ms) aus `Last-Modified`. Im **Leerfall** die
   * einzige Frischebelegung — „keine Warnungen" ist nur so viel wert wie das
   * Alter der Datei (V-19).
   */
  publishedMs: number | null;
  /** Jüngste Ausgabezeit über alle Meldungen (`sent`). */
  latestSentMs: number | null;
}

/** Cache des geparsten Standes. Der Layer pollt im 5-Minuten-Takt; der Cache
 *  fängt zusätzlich Doppel-Abrufe (z. B. Slider-Wechsel) ab. */
let _cache: { run: WarnRun; at: number } | null = null;
const CACHE_TTL = 60_000;

/**
 * Aktuellen Warnstand holen und parsen.
 *
 * **Null Warnungen ist kein Fehler**, sondern die häufigste richtige Antwort —
 * der Aufrufer muss den Leerfall als Aussage darstellen, nicht als Lücke.
 */
export async function fetchDwdWarnings(signal?: AbortSignal): Promise<WarnRun> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL) return _cache.run;

  const res = await fetch(CAP_URL, { signal });
  if (!res.ok) throw new Error(`DWD CAP: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());

  const lastMod = res.headers.get('last-modified');
  const publishedMs = lastMod ? (Number.isFinite(Date.parse(lastMod)) ? Date.parse(lastMod) : null) : null;

  const { alerts, entries, skipped } = await parseCapArchive(buf);
  const renderable = alerts.filter(isRenderableAlert);
  const latestSentMs = renderable.reduce<number | null>(
    (acc, a) => (a.sentMs != null && (acc == null || a.sentMs > acc) ? a.sentMs : acc), null);

  const run: WarnRun = {
    alerts: renderable,
    entries,
    dropped: skipped + (alerts.length - renderable.length),
    publishedMs,
    latestSentMs,
  };
  _cache = { run, at: Date.now() };
  return run;
}
