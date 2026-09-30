/**
 * GeoSphere-Warnungen am Punkt für das Dashboard (Phase DB, E-DB-12) — KOPIE MIT WÄCHTER von
 * `src/fire/sources/geosphereWarnContext.ts` (`getWarningsForCoords`, `parseWarnContext`).
 *
 * Warum eine Kopie: ein Import aus dem Brandradar-Modul spaltete es aus dem FireRoute-Chunk heraus; Vite trägt den neuen
 * Chunk dann in die Vorladeliste des Start-Chunks ein (+ Bytes auf eagerJs, gemessen 30.09.). `verify:dashboard` prüft,
 * dass beide Parser auf derselben Antwort (GS_FIXTURE des Brandradars und Varianten) dasselbe liefern.
 * Texte bleiben wörtlich (Warn-Layer-Sonderregel); der Parser ist schematolerant und wirft nie.
 */
const BASE = 'https://warnungen.zamg.at/wsapp/api';
const TYPE: Record<number, string> = { 1: 'Sturm', 2: 'Regen', 3: 'Schnee', 4: 'Glatteis', 5: 'Gewitter', 6: 'Hitze', 7: 'Kälte' };
const LEVEL: Record<number, string> = { 1: 'gelb', 2: 'orange', 3: 'rot' };

export interface AtPointWarning { type: number; typeLabel: string; level: number; levelLabel: string; text: string; beginRaw: string | null; endRaw: string | null; createMs: number | null }
export interface AtPointWarnings { gemeindenr: number | null; gemeinde: string | null; warnings: AtPointWarning[]; fetchedMs: number }

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** `2026-08-15 08:00:00+00` → ms; unbekannt → null (wie `parseCreate` des Brandradars). */
export function parseAtTime(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const t = Date.parse(raw.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  return Number.isFinite(t) ? t : null;
}

export function parseAtWarnings(text: string, fetchedMs: number): AtPointWarnings | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const props = (j?.properties ?? {}) as Record<string, unknown>;
    const loc = ((props.location as Record<string, unknown>)?.properties ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(props.warnings) ? props.warnings : [];
    const warnings: AtPointWarning[] = [];
    for (const w of raw) {
      const p = ((w as Record<string, unknown>)?.properties ?? w ?? {}) as Record<string, unknown>;
      const type = n(p.warntypid ?? p.wtype);
      const level = n(p.warnstufeid ?? p.wlevel);
      if (type == null || level == null) continue;
      warnings.push({
        type, typeLabel: TYPE[type] ?? `Typ ${type}`, level, levelLabel: LEVEL[level] ?? `Stufe ${level}`,
        text: typeof p.text === 'string' ? p.text : '',
        beginRaw: typeof p.begin === 'string' ? p.begin : null, endRaw: typeof p.end === 'string' ? p.end : null,
        createMs: parseAtTime(p.create),
      });
    }
    return { gemeindenr: n(loc.gemeindenr), gemeinde: typeof loc.name === 'string' ? loc.name : null, warnings, fetchedMs };
  } catch {
    return null;
  }
}

/** Anders als der Brandradar-Leser wirft dieser bei Netz-/HTTP-Fehlern — das Dashboard zeigt dann „nicht abrufbar". */
export async function fetchAtWarnings(lat: number, lon: number, signal?: AbortSignal): Promise<AtPointWarnings | null> {
  const res = await fetch(`${BASE}/getWarningsForCoords?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}&lang=de`, { signal });
  if (!res.ok) throw new Error(`GeoSphere HTTP ${res.status}`);
  return parseAtWarnings(await res.text(), Date.now());
}
