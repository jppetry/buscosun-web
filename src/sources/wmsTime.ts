/**
 * Echtes Aufnahme-/Capture-Datum eines WMS-Layers (QA P2-2) — Ehrlichkeit für
 * Satellit & Blitze. Statt der Wanduhr (`Date.now()`) lesen wir das tatsächliche
 * TIME-Dimension-Maximum aus dem GeoServer-`GetCapabilities` und zeigen „Stand
 * HH:MM" = wann die Daten WIRKLICH aufgenommen wurden (Satellit ist bis zu 3 h
 * alt, Blitze ~10 min).
 *
 * Genutzt wird der GeoServer-Per-Layer-Virtual-Service
 * (`/geoserver/dwd/<layer>/wms`) → die Capabilities enthalten nur DIESEN Layer
 * (kleine Antwort statt Workspace-weitem XML).
 */

const GEOSERVER = 'https://maps.dwd.de/geoserver/dwd';
const TTL_MS = 5 * 60_000;

const cache = new Map<string, { at: number; value: Date | null; inflight?: Promise<Date | null> }>();

/** Parst das jüngste ISO-Datum aus einem TIME-Dimension-Inhalt. */
function parseLatestIso(content: string): Date | null {
  const parts = content.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1];
  // Entweder Liste von ISO-Zeiten oder „start/end/period" → wir wollen das Ende.
  let iso = last;
  if (last.includes('/')) { const seg = last.split('/'); iso = seg[1] || seg[0]; }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Liefert das jüngste TIME-Dimension-Datum des Layers (oder null, wenn der Layer
 * keine Zeit-Dimension hat / der Abruf scheitert). Best-effort, 5-min-gecacht.
 */
export async function fetchWmsLatestTime(layerLocalName: string, signal?: AbortSignal): Promise<Date | null> {
  const hit = cache.get(layerLocalName);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.inflight ?? hit.value;

  const inflight = (async (): Promise<Date | null> => {
    try {
      const url = `${GEOSERVER}/${layerLocalName}/wms?service=WMS&version=1.3.0&request=GetCapabilities`;
      const res = await fetch(url, { signal });
      if (!res.ok) return null;
      const xml = await res.text();
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      // WMS 1.3.0: <Dimension name="time">; 1.1.1-Fallback: <Extent name="time">.
      const dims = [...doc.getElementsByTagName('Dimension'), ...doc.getElementsByTagName('Extent')];
      const timeEl = dims.find((d) => (d.getAttribute('name') || '').toLowerCase() === 'time');
      const value = parseLatestIso(timeEl?.textContent?.trim() ?? '');
      cache.set(layerLocalName, { at: Date.now(), value });
      return value;
    } catch {
      cache.set(layerLocalName, { at: Date.now(), value: null });
      return null;
    }
  })();

  cache.set(layerLocalName, { at: now, value: hit?.value ?? null, inflight });
  return inflight;
}
