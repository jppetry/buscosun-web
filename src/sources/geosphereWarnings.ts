/**
 * Amtliche **österreichische Wetterwarnungen** von GeoSphere Austria — die
 * AT-Hälfte des 2D-Layers „Warnungen" (Phase W3, `audit/warnungen-at-ch.md` §2,
 * `audit/warmbudget-lizenzen-at-warnungen.md` §3).
 *
 * ── Warum zwei Abrufarten ───────────────────────────────────────────────────
 *  - `getWarnstatus` liefert die **Flächen** (MultiPolygon in EPSG:31287, mit
 *    Enklaven) samt Typ (`wtype`), Stufe (`wlevel`), Beginn/Ende (Epoche) — aber
 *    **keinen Text**.
 *  - `getWarningsForCoords` liefert für EINEN Ort den **amtlichen Klartext**
 *    (`text`, `auswirkungen`, `empfehlungen`, `meteotext`).
 *  Die `warnid` beider Endpunkte ist NICHT joinbar (GeoSphere-Issue #42). Der
 *  Text wird deshalb über einen **Sondierungspunkt im Inneren der Fläche**
 *  geholt und über Typ + Stufe + Zeitfenster zugeordnet. Ist die Zuordnung
 *  nicht eindeutig, wird KEIN Text geraten: die Fläche bleibt (Typ und Stufe
 *  sind amtlich legendiert, OpenAPI `WarnType`/`WarnLevel`), der Wortlaut fehlt,
 *  und die Zahl steht in `textUnavailable`, damit die Karte es ausweisen kann.
 *
 * ── Ehrlichkeitsauflagen ────────────────────────────────────────────────────
 *  - Die Warnungen gelten für den **Dauersiedlungsraum**; hochalpine Lagen sind
 *    ausgenommen (`warningsSourceFor('AT').caveat`). Gehört in die Legende.
 *  - Es gibt keine Datei-Frische: der Server liefert kein echtes `Last-Modified`.
 *    `publishedMs` ist die Antwortzeit des Servers — der Leerfall ist also nur
 *    „zum Abruf waren keine Warnungen gemeldet", keine Aussage über das Alter.
 *  - Kein Durable-Cache (`docs/API.md` §7): ein Sitzungscache für Texte ≤ 15 min.
 *  - CORS ist offen (`ACAO: *`) ⇒ direkter Abruf, kein Proxy, keine
 *    `netlify.toml`-Änderung.
 *
 * Aufrufregel wie bei DE/CH: nur bei aktivem Layer und sichtbarem Tab.
 */

import type { CapAlert, CapArea, CapSeverity } from '../warnings/capAlerts';
import { isRenderableAlert } from '../warnings/capAlerts';
import { mgiLambertToWgs84 } from '../warnings/mgiLambert';
import type { WarnRun } from './dwdCapAlerts';
import { warningsSourceFor } from '../officialSources';

export const GEOSPHERE_WARN_API = 'https://warnungen.zamg.at/wsapp/api';

/** Attribution in der Form der übrigen Warnquellen (`Warnungen XX: Quelle …`). */
export const AT_WARNINGS_ATTRIBUTION =
  'Warnungen AT: Quelle <a href="https://www.geosphere.at/" target="_blank" rel="noopener">GeoSphere Austria</a> (CC BY 4.0)';

/** Amtliche Legende (OpenAPI `WarnType` / `WarnLevel`). */
export const AT_WTYPE_LABEL: Record<number, string> = {
  1: 'Sturm', 2: 'Regen', 3: 'Schnee', 4: 'Glatteis', 5: 'Gewitter', 6: 'Hitze', 7: 'Kälte',
};
const AT_SEVERITY: Record<number, CapSeverity> = { 1: 'Minor', 2: 'Moderate', 3: 'Severe' };
const AT_LEVEL_WORD: Record<number, string> = { 1: 'gelb', 2: 'orange', 3: 'rot' };

const FETCH_CONCURRENCY = 6;
const TEXT_TTL = 15 * 60_000;
const CACHE_TTL = 60_000;

export interface AtWarnRun extends WarnRun {
  /** Flächen, deren amtlicher Wortlaut nicht eindeutig zuzuordnen war. */
  textUnavailable: number;
}

// ---------------------------------------------------------------------------
// Rohform → Fläche
// ---------------------------------------------------------------------------

type Pt = [number, number];
export interface AtStatusWarning {
  warnid: string;
  wtype: number;
  wlevel: number;
  startMs: number | null;
  endMs: number | null;
  gemeinden: number;
  /** Polygone `[außen, loch, …]` in Metern (EPSG:31287). */
  polysM: Pt[][][];
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** `getWarnstatus`-Antwort → Rohwarnungen. Schematolerant; Defektes zählt in `skipped`. */
export function parseWarnstatus(text: string): { warnings: AtStatusWarning[]; skipped: number } {
  const warnings: AtStatusWarning[] = [];
  let skipped = 0;
  let j: { features?: unknown };
  try { j = JSON.parse(text) as { features?: unknown }; } catch { return { warnings, skipped: 1 }; }
  const features = Array.isArray(j.features) ? j.features : [];
  for (const f of features as Array<Record<string, unknown>>) {
    const p = (f?.properties ?? {}) as Record<string, unknown>;
    const g = (f?.geometry ?? {}) as { type?: string; coordinates?: unknown };
    const wtype = num(p.wtype), wlevel = num(p.wlevel);
    let polys: unknown = null;
    if (g.type === 'MultiPolygon') polys = g.coordinates;
    else if (g.type === 'Polygon') polys = [g.coordinates];
    if (wtype == null || wlevel == null || !Array.isArray(polys)) { skipped++; continue; }
    const polysM = (polys as unknown[]).map((poly) =>
      (poly as unknown[]).map((ring) =>
        (ring as unknown[]).map((c) => [Number((c as number[])[0]), Number((c as number[])[1])] as Pt)));
    const usable = polysM.filter((poly) => poly[0]?.length >= 4);
    if (!usable.length) { skipped++; continue; }
    const s = num(p.start), e = num(p.end);
    warnings.push({
      warnid: String(p.warnid ?? `${wtype}-${wlevel}-${s}`),
      wtype, wlevel,
      startMs: s != null ? s * 1000 : null,
      endMs: e != null ? e * 1000 : null,
      gemeinden: Array.isArray(p.gemeinden) ? p.gemeinden.length : 0,
      polysM: usable,
    });
  }
  return { warnings, skipped };
}

const proj = (pts: Pt[]): Array<[number, number]> => pts.map(([x, y]) => mgiLambertToWgs84(x, y));

/**
 * Ein Punkt im INNEREN der Fläche (Meter): Scanlinie durch die Mitte des
 * größten Polygons, even-odd über alle Ringe (Löcher zählen mit), Mitte des
 * breitesten Innenstücks. Sicherer als ein Schwerpunkt, der bei konkaven
 * Gemeindeverbünden außerhalb liegen kann.
 */
export function interiorPoint(polys: Pt[][][]): Pt | null {
  let best: Pt[][] | null = null, bestArea = -1;
  for (const poly of polys) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of poly[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const a = (maxX - minX) * (maxY - minY);
    if (a > bestArea) { bestArea = a; best = poly; }
  }
  if (!best) return null;
  const ys = best[0].map((p) => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  for (const frac of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const y = lo + (hi - lo) * frac;
    const xs: number[] = [];
    for (const ring of best) {
      for (let i = 0; i + 1 < ring.length; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    let w = -1, mid = 0;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > w) { w = xs[i + 1] - xs[i]; mid = (xs[i] + xs[i + 1]) / 2; }
    }
    if (w > 0) return [mid, y];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Text je Ort
// ---------------------------------------------------------------------------

export interface AtText {
  type: number;
  level: number;
  text: string;
  auswirkungen: string;
  empfehlungen: string;
  meteotext: string;
  beginMs: number | null;
  endMs: number | null;
  createMs: number | null;
}

/** Wien: +2 h zwischen letztem März- und letztem Oktober-Sonntag (01:00 UTC), sonst +1 h. */
function viennaOffsetMs(y: number, mo: number, d: number, h: number): number {
  const lastSun = (month: number) => {
    const last = new Date(Date.UTC(y, month + 1, 0));
    return last.getUTCDate() - last.getUTCDay();
  };
  const t = Date.UTC(y, mo - 1, d, h);
  const dstStart = Date.UTC(y, 2, lastSun(2), 1);
  const dstEnd = Date.UTC(y, 9, lastSun(9), 1);
  return (t >= dstStart + 3600_000 && t < dstEnd + 3600_000 ? 2 : 1) * 3600_000;
}

/** `dd.mm.yyyy HH:MM` (Wiener Ortszeit), ISO mit/ohne Offset, `yyyy-mm-dd HH:MM:SS+00` → ms. */
export function parseAtTime(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  const dm = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
  if (dm) {
    const [d, mo, y, h, mi] = [Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(dm[4] ?? 0), Number(dm[5] ?? 0)];
    return Date.UTC(y, mo - 1, d, h, mi) - viennaOffsetMs(y, mo, d, h);
  }
  const iso = s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** `getWarningsForCoords`-Antwort → Texte. Schematolerant, wirft nie. */
export function parseAtTexts(text: string): { gemeinde: string | null; items: AtText[] } {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const props = (j?.properties ?? {}) as Record<string, unknown>;
    const loc = ((props.location as Record<string, unknown>)?.properties ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(props.warnings) ? props.warnings : [];
    const items: AtText[] = [];
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    for (const w of raw as Array<Record<string, unknown>>) {
      const p = ((w?.properties ?? w) ?? {}) as Record<string, unknown>;
      const type = num(p.warntypid ?? p.wtype), level = num(p.warnstufeid ?? p.wlevel);
      if (type == null || level == null) continue;
      items.push({
        type, level,
        text: str(p.text), auswirkungen: str(p.auswirkungen), empfehlungen: str(p.empfehlungen),
        meteotext: str(p.meteotext),
        beginMs: parseAtTime(p.begin), endMs: parseAtTime(p.end), createMs: parseAtTime(p.create),
      });
    }
    return { gemeinde: typeof loc.name === 'string' ? loc.name : null, items };
  } catch {
    return { gemeinde: null, items: [] };
  }
}

const TIME_TOL_MS = 2 * 3600_000;
/**
 * Den Text zu einer Fläche wählen — nur bei EINDEUTIGEM Treffer. Gleicher Typ
 * und gleiche Stufe, und wo Zeiten lesbar sind, auch das Zeitfenster. Bei
 * mehreren oder keinem Treffer: `null`, nie raten.
 */
export function pickText(items: AtText[], w: Pick<AtStatusWarning, 'wtype' | 'wlevel' | 'startMs' | 'endMs'>): AtText | null {
  const same = items.filter((t) => t.type === w.wtype && t.level === w.wlevel);
  const timed = same.filter((t) => {
    const okB = t.beginMs == null || w.startMs == null || Math.abs(t.beginMs - w.startMs) <= TIME_TOL_MS;
    const okE = t.endMs == null || w.endMs == null || Math.abs(t.endMs - w.endMs) <= TIME_TOL_MS;
    return okB && okE;
  });
  return timed.length === 1 ? timed[0] : null;
}

const _textCache = new Map<string, { texts: { gemeinde: string | null; items: AtText[] } | null; at: number }>();

async function fetchTexts(lonLat: [number, number], signal?: AbortSignal) {
  const key = `${lonLat[0].toFixed(3)},${lonLat[1].toFixed(3)}`;
  const c = _textCache.get(key);
  if (c && Date.now() - c.at < TEXT_TTL) return c.texts;
  const url = `${GEOSPHERE_WARN_API}/getWarningsForCoords?lon=${lonLat[0].toFixed(4)}&lat=${lonLat[1].toFixed(4)}&lang=de`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`GeoSphere Warnungen: HTTP ${res.status}`);
  const texts = parseAtTexts(await res.text());
  _textCache.set(key, { texts, at: Date.now() });
  return texts;
}

// ---------------------------------------------------------------------------
// Rohwarnung (+ Text) → CapAlert
// ---------------------------------------------------------------------------

/** Baut die Meldung im gemeinsamen Format. Rein; `text`/`gemeinde` dürfen fehlen. */
export function toCapAlert(w: AtStatusWarning, text: AtText | null, gemeinde: string | null): CapAlert {
  const typeLabel = AT_WTYPE_LABEL[w.wtype] ?? `Typ ${w.wtype}`;
  const polygons = w.polysM.map((poly) => poly.map((ring) => proj(ring)));
  const area: CapArea = {
    desc: gemeinde
      ? `${w.gemeinden} ${w.gemeinden === 1 ? 'Gemeinde' : 'Gemeinden'}, u. a. ${gemeinde}`
      : `${w.gemeinden} ${w.gemeinden === 1 ? 'Gemeinde' : 'Gemeinden'}`,
    rings: polygons.map((poly) => poly[0]),
    polygons,
    warnCellIds: [],
    floorM: null,
    ceilingM: null,
  };
  const word = AT_LEVEL_WORD[w.wlevel];
  const description = text
    ? [text.auswirkungen, text.meteotext].filter((s) => s.trim() !== '').join('\n\n')
    : '';
  return {
    id: `at-${w.warnid}`,
    sentMs: text?.createMs ?? null,
    status: 'Actual',
    msgType: 'Alert',
    event: typeLabel,
    // Wortlaut, wenn eindeutig zugeordnet; sonst nur die amtliche Legende
    // (Typ + Farbstufe) — nichts Erfundenes.
    headline: text && text.text.trim() ? text.text : `${typeLabel}${word ? ` · Warnstufe ${word}` : ''}`,
    description,
    instruction: text?.empfehlungen ?? '',
    category: 'Met',
    severity: AT_SEVERITY[w.wlevel] ?? 'Unknown',
    urgency: '',
    certainty: '',
    senderName: 'GeoSphere Austria',
    group: null,
    eventCode: null,
    areaColor: null,
    license: 'Quelle: GeoSphere Austria (CC BY 4.0)',
    effectiveMs: w.startMs,
    onsetMs: w.startMs,
    expiresMs: w.endMs,
    parameters: [{ name: 'at_level', value: String(w.wlevel) }],
    web: warningsSourceFor('AT').url,
    areas: [area],
    infoLanguage: 'de',
    languageFallback: false,
  };
}

// ---------------------------------------------------------------------------
// Abruf
// ---------------------------------------------------------------------------

let _cache: { run: AtWarnRun; at: number } | null = null;

async function mapLimited<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<Array<PromiseSettledResult<R>>> {
  const out: Array<PromiseSettledResult<R>> = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await Promise.allSettled([fn(items[i])]).then((r) => r[0]);
    }
  }));
  return out;
}

/**
 * Aktuellen österreichischen Warnstand holen. **Keine Warnung ist kein Fehler**,
 * sondern die häufigste richtige Antwort — der Aufrufer stellt den Leerfall als
 * Aussage dar (mit dem Dauersiedlungsraum-Vorbehalt).
 */
export async function fetchAtWarnings(signal?: AbortSignal): Promise<AtWarnRun> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL) return _cache.run;

  const res = await fetch(`${GEOSPHERE_WARN_API}/getWarnstatus?lang=de`, { signal });
  if (!res.ok) throw new Error(`GeoSphere Warnungen: HTTP ${res.status}`);
  const answeredMs = Date.now();
  const { warnings, skipped } = parseWarnstatus(await res.text());

  const now = Date.now();
  const live = warnings.filter((w) => w.endMs == null || w.endMs > now);

  const settled = await mapLimited(live, FETCH_CONCURRENCY, async (w) => {
    const pt = interiorPoint(w.polysM);
    if (!pt) return { w, text: null as AtText | null, gemeinde: null as string | null };
    const t = await fetchTexts(mgiLambertToWgs84(pt[0], pt[1]), signal);
    return { w, text: t ? pickText(t.items, w) : null, gemeinde: t?.gemeinde ?? null };
  });

  const alerts: CapAlert[] = [];
  let textUnavailable = 0;
  live.forEach((w, i) => {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      if (!r.value.text) textUnavailable++;
      alerts.push(toCapAlert(w, r.value.text, r.value.gemeinde));
    } else {
      // Textabruf gescheitert: die Fläche trotzdem zeigen (Typ/Stufe sind
      // amtlich), den fehlenden Wortlaut aber ausweisen.
      textUnavailable++;
      alerts.push(toCapAlert(w, null, null));
    }
  });

  const renderable = alerts.filter(isRenderableAlert);
  const latestSentMs = renderable.reduce<number | null>(
    (acc, a) => (a.sentMs != null && (acc == null || a.sentMs > acc) ? a.sentMs : acc), null);

  const run: AtWarnRun = {
    alerts: renderable,
    entries: warnings.length,
    dropped: skipped + (alerts.length - renderable.length),
    // Antwortzeit des Servers — KEIN Dateialter (s. Kopfkommentar).
    publishedMs: answeredMs,
    latestSentMs,
    textUnavailable,
  };
  _cache = { run, at: Date.now() };
  return run;
}
