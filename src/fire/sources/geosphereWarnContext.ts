/**
 * GeoSphere-Warnungen als **Kontext** für österreichische Brandereignisse
 * (Phase A3, Gate GWBA1).
 *
 * ── Was das ist — und was nicht ─────────────────────────────────────────────
 * Die GeoSphere-Warn-API ist die einzige rechtlich saubere Live-Quelle
 * Österreichs (CC BY 4.0, kein Schlüssel, `ACAO: *`). Sie kennt **sieben**
 * Warntypen — Sturm, Regen, Schnee, Glatteis, Gewitter, Hitze, Kälte — und
 * **keinen Waldbrand-Typ**. Eine Hitzewarnung auf der Hotspot-Gemeinde ist ein
 * Trockenheitsbeitrag, eine Gewitterwarnung eine plausible Zündquelle. Beides
 * zahlt auf **„plausibel"** ein; keines erzeugt je „bestätigt".
 *
 * ── Gemessen in A0-4 (audit/waldbrand-behoerden.md §4) ─────────────────────
 *  · Server laut OpenAPI: `https://warnungen.zamg.at/wsapp/api` (einziger);
 *    `*.geosphere.at`-Hosts antworten nicht.
 *  · Keine Rate-Limit-Header. Trotzdem: **ein Abruf je Ereignis**, gedeckelt
 *    (`MAX_LOOKUPS`), gecacht je Sitzung — nie je Detektion, nie je Nutzer-Klick.
 *  · Geometrien sind **EPSG:31287** (Austria Lambert) trotz GeoJSON-Form. Für
 *    den Kontext braucht es keine Umprojektion: `getWarningsForCoords?lon&lat`
 *    liefert die Gemeinde (`location.properties.gemeindenr/name`) und ihre
 *    Warnungen mit deutschem Klartext (`text`, `auswirkungen`, `empfehlungen`).
 *  · Warnstufen 1–3 (gelb/orange/rot) — eine EIGENE Skala, nie auf die
 *    Waldbrandstufen 1–5 (DE/CH) abgebildet (Muster `warnings/warnField.ts`).
 *
 * Wortlaut wird **zitiert, nie zusammengefasst** (CLAUDE.md-Sonderregel für
 * amtliche Warntexte). Kein Durable-Cache (docs/API.md §7): Sitzungscache
 * ≤ 15 min, Datenalter über `create`.
 *
 * Pur (bis auf den Fetch), DOM-frei — `npm run verify:fire-behoerden`.
 */

export const GEOSPHERE_WARN_BASE = 'https://warnungen.zamg.at/wsapp/api';
export const GEOSPHERE_WARN_ATTRIBUTION =
  '© <a href="https://www.geosphere.at/" target="_blank" rel="noopener">GeoSphere Austria</a> (CC BY 4.0)';

/** Deckel für Abrufe je Sitzung — nur AT-Ereignisse, die größten zuerst. */
export const MAX_LOOKUPS = 20;
export const CACHE_TTL = 15 * 60_000;

/** Amtliche Legende (OpenAPI-Enum). Der Waldbrand fehlt — bewusst. */
export const AT_WARN_TYPE: Record<number, string> = {
  1: 'Sturm', 2: 'Regen', 3: 'Schnee', 4: 'Glatteis', 5: 'Gewitter', 6: 'Hitze', 7: 'Kälte',
};
export const AT_WARN_LEVEL: Record<number, string> = { 1: 'gelb', 2: 'orange', 3: 'rot' };

/** Warntypen, die als Waldbrand-Kontext gelten. Sturm zählt (Ausbreitung), Regen/Schnee/Glatteis/Kälte nicht. */
export const FIRE_CONTEXT_TYPES = new Set([6, 5, 1]);

/** Grobe AT-Hülle für „ist das ein österreichisches Ereignis?" (Kontext, keine Grenze). */
export const AT_BOUNDS = { west: 9.4, south: 46.3, east: 17.3, north: 49.1 } as const;
export function inAustriaBox(lat: number, lon: number): boolean {
  return lon >= AT_BOUNDS.west && lon <= AT_BOUNDS.east && lat >= AT_BOUNDS.south && lat <= AT_BOUNDS.north;
}

export interface AtWarning {
  type: number;
  typeLabel: string;
  level: number;
  levelLabel: string;
  /** Wörtlicher amtlicher Text. */
  text: string;
  beginRaw: string | null;
  endRaw: string | null;
  createMs: number | null;
  /** Zahlt der Typ auf den Brand-Kontext ein? */
  fireContext: boolean;
}

export interface AtWarnContext {
  gemeindenr: number | null;
  gemeinde: string | null;
  warnings: AtWarning[];
  fetchedMs: number;
}

export function warningsForCoordsUrl(lat: number, lon: number): string {
  return `${GEOSPHERE_WARN_BASE}/getWarningsForCoords?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}&lang=de`;
}

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** `2026-08-15 08:00:00+00` → ms; unbekannt → null. */
export function parseCreate(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const t = Date.parse(raw.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  return Number.isFinite(t) ? t : null;
}

/** Antwort von `getWarningsForCoords` → Kontext. Schematolerant, wirft nie. */
export function parseWarnContext(text: string, fetchedMs: number): AtWarnContext | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const props = (j?.properties ?? {}) as Record<string, unknown>;
    const loc = ((props.location as Record<string, unknown>)?.properties ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(props.warnings) ? props.warnings : [];
    const warnings: AtWarning[] = [];
    for (const w of raw) {
      const p = ((w as Record<string, unknown>)?.properties ?? w ?? {}) as Record<string, unknown>;
      const type = n(p.warntypid ?? p.wtype);
      const level = n(p.warnstufeid ?? p.wlevel);
      if (type == null || level == null) continue;
      warnings.push({
        type, typeLabel: AT_WARN_TYPE[type] ?? `Typ ${type}`,
        level, levelLabel: AT_WARN_LEVEL[level] ?? `Stufe ${level}`,
        text: typeof p.text === 'string' ? p.text : '',
        beginRaw: typeof p.begin === 'string' ? p.begin : null,
        endRaw: typeof p.end === 'string' ? p.end : null,
        createMs: parseCreate(p.create),
        fireContext: FIRE_CONTEXT_TYPES.has(type),
      });
    }
    return { gemeindenr: n(loc.gemeindenr), gemeinde: typeof loc.name === 'string' ? loc.name : null, warnings, fetchedMs };
  } catch {
    return null;
  }
}

/** Nur die Kontext-relevanten Warnungen, höchste Stufe zuerst. */
export function fireContextWarnings(ctx: AtWarnContext | null): AtWarning[] {
  return (ctx?.warnings ?? []).filter((w) => w.fireContext).sort((a, b) => b.level - a.level);
}

/** Der Satz für den Steckbrief — Warntyp/Stufe amtlich, Text als Zitat. Nie „bestätigt". */
export function contextLabel(ctx: AtWarnContext): string | null {
  const ws = fireContextWarnings(ctx);
  if (!ws.length) return null;
  // Mehrere Warnungen desselben Typs (verschiedene Zeiträume) nur einmal nennen.
  const parts = [...new Set(ws.map((w) => `${w.typeLabel} (${w.levelLabel})`))];
  const where = ctx.gemeinde ? ` für ${ctx.gemeinde}` : '';
  return `GeoSphere-Warnung${where}: ${parts.join(', ')} — Kontext, keine Brandbestätigung`;
}

// ---------------------------------------------------------------------------
// Laden — je Ereignis, gedeckelt, gecacht, still
// ---------------------------------------------------------------------------

const _cache = new Map<string, { ctx: AtWarnContext | null; at: number }>();
const keyOf = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

export async function fetchWarnContext(lat: number, lon: number, signal?: AbortSignal): Promise<AtWarnContext | null> {
  const k = keyOf(lat, lon);
  const c = _cache.get(k);
  if (c && Date.now() - c.at < CACHE_TTL) return c.ctx;
  let ctx: AtWarnContext | null = null;
  try {
    const res = await fetch(warningsForCoordsUrl(lat, lon), { signal });
    if (res.ok) ctx = parseWarnContext(await res.text(), Date.now());
  } catch { ctx = null; }
  _cache.set(k, { ctx, at: Date.now() });
  return ctx;
}

/**
 * Kontext für eine Liste von Ereignissen: nur AT-Lagen, höchstens `MAX_LOOKUPS`,
 * in der gegebenen Reihenfolge (Aufrufer sortiert nach Stärke). Liefert
 * Map<eventId, ctx>. Fehler je Ereignis ⇒ kein Eintrag.
 */
export async function fetchWarnContextsFor(
  events: readonly { id: string; lat: number; lon: number }[], signal?: AbortSignal,
): Promise<Map<string, AtWarnContext>> {
  const out = new Map<string, AtWarnContext>();
  let looked = 0;
  for (const e of events) {
    if (!inAustriaBox(e.lat, e.lon)) continue;
    if (looked >= MAX_LOOKUPS) break;
    looked++;
    const ctx = await fetchWarnContext(e.lat, e.lon, signal);
    if (ctx) out.set(e.id, ctx);
  }
  return out;
}
export function resetWarnContextCache(): void { _cache.clear(); }

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface GsCheck { name: string; ok: boolean; detail?: string }

/** Echte Antwortform aus A0-4 (Salzburg, Hitzewarnung gelb), gekürzt. */
export const GS_FIXTURE = (): string => JSON.stringify({
  type: 'Feature',
  geometry: { type: 'MultiPolygon', coordinates: [[[[375207, 429165], [375159, 430061], [375481, 430771], [375207, 429165]]]] },
  properties: {
    location: { type: 'Municipal', properties: { gemeindenr: 50101, name: 'Salzburg', urlname: 'salzburg' } },
    warnings: [
      { type: 'Warning', properties: { warnid: 10, chgid: 202608150, verlaufid: 11, warntypid: 6, warnstufeid: 1, begin: '15.08.2026 00:00', end: '15.08.2026 23:59', create: '2026-08-15 08:00:00+00', text: 'Es ist mit erhöhter Hitzebelastung zu rechnen.', auswirkungen: '* Erhöhte Körpertemperatur', empfehlungen: '* Viel trinken' } },
      { type: 'Warning', properties: { warnid: 11, warntypid: 2, warnstufeid: 2, text: 'Ergiebiger Regen.' } },
    ],
  },
});

export function verifyGeosphereWarnContext(): { checks: GsCheck[]; passed: number; total: number } {
  const checks: GsCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const now = Date.UTC(2026, 7, 15, 9);
  const ctx = parseWarnContext(GS_FIXTURE(), now);
  add('Antwort wird gelesen: Gemeinde Salzburg (50101)', ctx?.gemeinde === 'Salzburg' && ctx?.gemeindenr === 50101);
  add('zwei Warnungen, Typ/Stufe amtlich beschriftet', ctx?.warnings.length === 2 && ctx.warnings[0].typeLabel === 'Hitze' && ctx.warnings[0].levelLabel === 'gelb');
  add('Wortlaut unverändert übernommen', ctx?.warnings[0].text === 'Es ist mit erhöhter Hitzebelastung zu rechnen.');
  add('`create` mit +00 wird gelesen', ctx?.warnings[0].createMs === Date.UTC(2026, 7, 15, 8));
  add('Hitze ist Brand-Kontext, Regen nicht', ctx?.warnings[0].fireContext === true && ctx?.warnings[1].fireContext === false);
  add('Kontext-Liste enthält nur Hitze', fireContextWarnings(ctx).length === 1);
  const label = contextLabel(ctx!);
  add('Beschriftung nennt Quelle, Gemeinde, Typ, Stufe und „keine Brandbestätigung"',
    !!label && /GeoSphere/.test(label) && /Salzburg/.test(label) && /Hitze \(gelb\)/.test(label) && /keine Brandbestätigung/.test(label), label ?? '');
  add('das Wort „bestätigt" fällt nur verneint', !!label && !/(?<!Brand)bestätigt/.test(label.replace('keine Brandbestätigung', '')));
  add('URL: dokumentierter Host, lon/lat, deutsch',
    warningsForCoordsUrl(47.8, 13.04) === 'https://warnungen.zamg.at/wsapp/api/getWarningsForCoords?lon=13.0400&lat=47.8000&lang=de');
  add('kaputtes JSON ⇒ null statt Wurf', parseWarnContext('{nope', now) === null);
  add('fremdes Schema ⇒ leerer Kontext statt Wurf', parseWarnContext(JSON.stringify({ a: 1 }), now)?.warnings.length === 0);
  add('AT-Hülle: Salzburg drin, Berlin und Zürich draußen', inAustriaBox(47.8, 13.04) && !inAustriaBox(52.52, 13.4) && !inAustriaBox(47.37, 8.54));
  add('Deckel je Sitzung 20, Cache ≤ 15 min (kein Durable-Cache, API.md §7)', MAX_LOOKUPS === 20 && CACHE_TTL <= 15 * 60_000);
  add('sieben amtliche Typen, KEIN Waldbrand-Typ', Object.keys(AT_WARN_TYPE).length === 7 && !Object.values(AT_WARN_TYPE).some((t) => /brand/i.test(t)));
  add('Stufen 1–3 — eigene Skala, nicht 1–5', Object.keys(AT_WARN_LEVEL).length === 3);
  add('Attribution nennt GeoSphere und CC BY 4.0', /GeoSphere/.test(GEOSPHERE_WARN_ATTRIBUTION) && /CC BY 4\.0/.test(GEOSPHERE_WARN_ATTRIBUTION));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
