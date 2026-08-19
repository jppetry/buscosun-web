/**
 * Copernicus-EMS-Aktivierungen als **Abzeichen** (Phase A2, Gate GWBA1).
 *
 * Quelle: `rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/`
 * — in A0 gemessen (2026-08-15): HTTP 200, `ACAO: *`, 3,5 KB, 10 Aktivierungen
 * mit `code, countries[], eventTime, name, centroid (WKT POINT lon lat),
 * activationTime, category, lastUpdate, closed, gdacsId, n_aois, n_products`;
 * DACH-Treffer EMSR920 „Forest fire in Huertgen Forest, Germany", `Wildfire`,
 * `POINT (6.376 50.754)` (`audit/waldbrand-behoerden.md` §5).
 *
 * ── Das ist eine INTERNE Dashboard-API ───────────────────────────────────────
 * Sie kann ohne Vorwarnung brechen. Deshalb: schematolerant lesen (jedes Feld
 * optional, mehrere Schreibweisen), bei JEDEM Parse-Fehler stumm auf „kein
 * Abzeichen" zurückfallen. Sie blockiert nie ein Rendern und erzeugt nie einen
 * Ladezustand, den der Nutzer sieht — kein Fehlerbanner, keine Statuszeile.
 *
 * Fachlich: Eine Rapid-Mapping-Aktivierung ist eine Großschadensaktivierung —
 * selten, aber zweifelsfrei. Treffer im Umkreis `EMS_RADIUS_M` (25 km) um ein
 * Ereignis ⇒ „bestätigt (Copernicus EMS EMSRxxx)". Abwesenheit sagt nichts.
 *
 * Pur (bis auf `fetchEmsActivations`), DOM-frei — `npm run verify:fire-behoerden`.
 */

export const EMS_URL =
  'https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/';

/** Zuordnungsradius Aktivierungs-Centroid → Ereignis. Der Centroid ist der
 *  Schwerpunkt des Kartierungsgebiets, nicht der Brandherd. */
export const EMS_RADIUS_M = 25_000;

export const EMS_ATTRIBUTION =
  '© European Union, <a href="https://mapping.emergency.copernicus.eu/" target="_blank" rel="noopener">'
  + 'Copernicus Emergency Management Service</a> — Rapid Mapping';

export interface EmsActivation {
  code: string;
  name: string | null;
  countries: string[];
  /** Kategorie wie geliefert (`Wildfire`, `Flood`, …). */
  category: string | null;
  isFire: boolean;
  lat: number | null;
  lon: number | null;
  eventMs: number | null;
  activationMs: number | null;
  closed: boolean | null;
}

const DACH_COUNTRIES = /^(germany|austria|switzerland|deutschland|österreich|schweiz|de|at|ch)$/i;

/** `POINT (6.376 50.754)` → { lon, lat }; alles andere → null. Auch GeoJSON-Point/Arrays. */
export function parseCentroid(raw: unknown): { lon: number; lat: number } | null {
  if (typeof raw === 'string') {
    const m = raw.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (!m) return null;
    const lon = Number(m[1]), lat = Number(m[2]);
    return Number.isFinite(lon) && Number.isFinite(lat) ? { lon, lat } : null;
  }
  if (Array.isArray(raw) && raw.length >= 2 && typeof raw[0] === 'number' && typeof raw[1] === 'number') {
    return { lon: raw[0], lat: raw[1] };
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.coordinates)) return parseCentroid(o.coordinates);
    if (typeof o.lon === 'number' && typeof o.lat === 'number') return { lon: o.lon, lat: o.lat };
  }
  return null;
}

const ms = (v: unknown): number | null => {
  if (typeof v !== 'string' || !v) return null;
  // Zeiten kommen ohne Zone (`2026-08-13T12:55:00`) — EMS führt UTC.
  const t = Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(v) ? v : `${v}Z`);
  return Number.isFinite(t) ? t : null;
};

/** Ein Rohobjekt → Aktivierung; `null`, wenn nicht einmal ein Code da ist. */
export function parseActivation(raw: unknown): EmsActivation | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const code = typeof o.code === 'string' ? o.code : typeof o.activationCode === 'string' ? o.activationCode : null;
  if (!code) return null;
  const countriesRaw = o.countries ?? o.country ?? [];
  const countries = (Array.isArray(countriesRaw) ? countriesRaw : [countriesRaw])
    .map((c) => (typeof c === 'string' ? c : (c as { name?: string })?.name ?? null))
    .filter((c): c is string => !!c);
  const category = typeof o.category === 'string' ? o.category
    : typeof o.categoryName === 'string' ? o.categoryName
      : (o.category as { name?: string })?.name ?? null;
  const c = parseCentroid(o.centroid ?? o.geometry ?? o.location);
  const name = typeof o.name === 'string' ? o.name : typeof o.title === 'string' ? o.title : null;
  return {
    code, name, countries, category,
    isFire: /fire|wildfire|brand/i.test(`${category ?? ''} ${name ?? ''}`),
    lat: c?.lat ?? null, lon: c?.lon ?? null,
    eventMs: ms(o.eventTime ?? o.event_time),
    activationMs: ms(o.activationTime ?? o.activation_time),
    closed: typeof o.closed === 'boolean' ? o.closed : null,
  };
}

/** Rohantwort (beliebige Hülle) → DACH-Brandaktivierungen. Wirft nie. */
export function parseEmsResponse(text: string): EmsActivation[] {
  try {
    const j = JSON.parse(text) as unknown;
    const arr = Array.isArray(j) ? j
      : Array.isArray((j as { results?: unknown[] })?.results) ? (j as { results: unknown[] }).results
        : Array.isArray((j as { data?: unknown[] })?.data) ? (j as { data: unknown[] }).data
          : [];
    const out: EmsActivation[] = [];
    for (const raw of arr) {
      const a = parseActivation(raw);
      if (!a || !a.isFire) continue;
      // DACH: nach Ländername ODER nach Lage (Centroid in der Hülle) — nie nur eines.
      const byName = a.countries.some((c) => DACH_COUNTRIES.test(c.trim()));
      const byPos = a.lon != null && a.lat != null && a.lon >= 5 && a.lon <= 18 && a.lat >= 45 && a.lat <= 56;
      if (byName || byPos) out.push(a);
    }
    return out;
  } catch {
    return [];
  }
}

function metersBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const k = Math.cos(((aLat + bLat) / 2) * Math.PI / 180) * 111_320;
  return Math.hypot((aLon - bLon) * k, (aLat - bLat) * 111_320);
}

/**
 * Aktivierung zu einem Ort (Ereignis-Schwerpunkt) — nächste im Radius, sonst
 * `null`. Zeitlich: die Aktivierung darf nicht **vor** dem Ereignisbeginn
 * geschlossen worden sein; ohne `eventMs` gilt nur der Radius.
 */
export function emsActivationFor(
  point: { lat: number; lon: number; firstMs?: number },
  acts: readonly EmsActivation[],
  radiusM = EMS_RADIUS_M,
): EmsActivation | null {
  let best: EmsActivation | null = null;
  let bestD = Infinity;
  for (const a of acts) {
    if (a.lat == null || a.lon == null) continue;
    const d = metersBetween(point.lat, point.lon, a.lat, a.lon);
    if (d > radiusM) continue;
    // Eine Aktivierung von vor Wochen bestätigt kein neues Ereignis: Ereignis-
    // beginn nicht mehr als 30 Tage nach der Aktivierungs-Ereigniszeit.
    if (point.firstMs != null && a.eventMs != null && point.firstMs - a.eventMs > 30 * 86_400_000) continue;
    if (d < bestD) { best = a; bestD = d; }
  }
  return best;
}

/** Der Satz zum Abzeichen — Quelle und Kennung immer dabei. */
export function emsLabel(a: EmsActivation): string {
  const when = a.eventMs != null
    ? new Date(a.eventMs).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    : '—';
  return `Copernicus-EMS-Aktivierung ${a.code} (bestätigt)${a.name ? `: ${a.name}` : ''} · Ereignis ${when}`
    + (a.closed === true ? ' · abgeschlossen' : '');
}

// ---------------------------------------------------------------------------
// Laden — still, kurz gecacht, nie werfend
// ---------------------------------------------------------------------------

let _cache: { acts: EmsActivation[]; at: number } | null = null;
const TTL = 30 * 60_000;

/** Liefert `[]` bei jedem Fehler — kein Ladezustand, kein Banner. */
export async function fetchEmsActivations(signal?: AbortSignal): Promise<EmsActivation[]> {
  if (_cache && Date.now() - _cache.at < TTL) return _cache.acts;
  try {
    const res = await fetch(EMS_URL, { signal });
    if (!res.ok) return [];
    const acts = parseEmsResponse(await res.text());
    _cache = { acts, at: Date.now() };
    return acts;
  } catch {
    return [];
  }
}
export function resetEmsCache(): void { _cache = null; }

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface EmsCheck { name: string; ok: boolean; detail?: string }

/** Echte Antwort-Form aus A0 (gekürzt): EMSR920 + eine spanische Aktivierung. */
export const EMS_FIXTURE = (): string => JSON.stringify([
  { code: 'EMSR921', countries: ['Spain'], eventTime: '2026-08-10T10:08:00', name: 'Wildfire in Spain',
    centroid: 'POINT (-0.693036057514768 42.47825244999649)', activationTime: '2026-08-15T08:52:00',
    category: 'Wildfire', lastUpdate: '2026-08-15T10:04:44.603551', closed: false, gdacsId: null, n_aois: 1, n_products: 0 },
  { code: 'EMSR920', countries: ['Germany'], eventTime: '2026-08-13T12:55:00', name: 'Forest fire in Huertgen Forest, Germany',
    centroid: 'POINT (6.376188560649222 50.75359532631122)', activationTime: '2026-08-13T15:00:00',
    category: 'Wildfire', closed: false },
  { code: 'EMSR900', countries: ['Germany'], eventTime: '2026-07-01T00:00:00', name: 'Flood in Bavaria',
    centroid: 'POINT (12.0 48.5)', category: 'Flood', closed: true },
]);

export function verifyEmsActivations(): { checks: EmsCheck[]; passed: number; total: number } {
  const checks: EmsCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const acts = parseEmsResponse(EMS_FIXTURE());
  add('nur DACH-Brandaktivierungen bleiben (1 von 3)', acts.length === 1 && acts[0].code === 'EMSR920', acts.map((a) => a.code).join(','));
  add('WKT-Centroid wird gelesen', acts[0]?.lon != null && Math.abs(acts[0].lon - 6.376) < 0.01 && Math.abs((acts[0].lat ?? 0) - 50.754) < 0.01);
  add('eventTime ohne Zone wird als UTC gelesen', acts[0]?.eventMs === Date.UTC(2026, 7, 13, 12, 55));
  add('Flood ist kein Feuer', !parseActivation({ code: 'X', category: 'Flood' })?.isFire);
  add('Centroid-Varianten: GeoJSON und [lon,lat]',
    parseCentroid({ type: 'Point', coordinates: [6.4, 50.7] })?.lat === 50.7 && parseCentroid([6.4, 50.7])?.lon === 6.4);
  add('kaputter Centroid ⇒ null, kein Wurf', parseCentroid('POINT (abc)') === null && parseCentroid(42) === null);

  // Zuordnung: Hürtgenwald-Ereignis (6.36, 50.70) liegt ~6 km vom Centroid.
  const hit = emsActivationFor({ lat: 50.70, lon: 6.36, firstMs: Date.UTC(2026, 7, 13, 14) }, acts);
  add('Ereignis 6 km neben dem Centroid wird zugeordnet', hit?.code === 'EMSR920');
  add('Ereignis 60 km entfernt wird NICHT zugeordnet', emsActivationFor({ lat: 51.2, lon: 6.9 }, acts) === null);
  add('Ereignis, das 40 Tage NACH der Aktivierung beginnt, wird nicht zugeordnet',
    emsActivationFor({ lat: 50.70, lon: 6.36, firstMs: Date.UTC(2026, 8, 25) }, acts) === null);
  add('Radius ist 25 km', EMS_RADIUS_M === 25_000);

  // DER Kickoff-Test: erzwungener Parse-Fehler ⇒ kein Abzeichen, kein Wurf.
  add('kaputtes JSON ⇒ [] statt Fehler', parseEmsResponse('{not json').length === 0);
  add('fremdes Schema ⇒ [] statt Fehler', parseEmsResponse(JSON.stringify({ foo: [1, 2, 3] })).length === 0
    && parseEmsResponse(JSON.stringify([{ nonsense: true }, null, 5])).length === 0);
  add('Hülle {results:[…]} wird verstanden', parseEmsResponse(JSON.stringify({ results: JSON.parse(EMS_FIXTURE()) })).length === 1);
  add('Länder als Objekte {name} werden verstanden',
    parseActivation({ code: 'E', countries: [{ name: 'Austria' }], category: 'Wildfire' })?.countries[0] === 'Austria');
  add('DACH auch über die Lage, wenn das Land fehlt',
    parseEmsResponse(JSON.stringify([{ code: 'E', category: 'Wildfire', centroid: 'POINT (13.0 47.5)' }])).length === 1);

  const label = emsLabel(acts[0]);
  add('Beschriftung nennt Quelle, Kennung und „bestätigt"', /Copernicus-EMS/.test(label) && /EMSR920/.test(label) && /bestätigt/.test(label), label);
  add('Attribution nennt Copernicus EMS', /Copernicus Emergency Management Service/.test(EMS_ATTRIBUTION));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
