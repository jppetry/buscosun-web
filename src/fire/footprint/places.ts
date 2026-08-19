/**
 * **Ortsverzeichnis DACH** — „nächster Ort + Kreis/Bezirk/Kanton" ohne Fremd-API
 * (Phase BP3, Gate GBP1).
 *
 * Quelle: `public/fire/places-dach.json`, erzeugt aus den GeoNames-Länderdumps
 * (CC BY 4.0) durch `scripts/build-places-dach.mjs` — ~7 500 Orte ab 1 500
 * Einwohnern (ohne Stadtteile), ~325 KB / ~125 KB gzip, geladen **einmal, lazy** beim Öffnen des
 * Panels. Kein Nominatim je Zeile (Usage Policy 1 req/s), keine GeoNames-Web-API
 * (Konto + Limit): beides ist nach den Auftrags-Constraints blockiert
 * (`audit/brandflaechen-panel.md` §2.8).
 *
 * Was „nächster Ort" hier bedeutet — und was nicht: der nächstgelegene Ort
 * **aus dem Verzeichnis**, mit Entfernung. Kein Ort im Umkreis von
 * `MAX_KM` ⇒ `null`, und die Zeile zeigt „—" mit Grund. Der Kreis ist der des
 * Ortes, nicht eine Punkt-in-Polygon-Zuordnung — bei Orten nahe einer
 * Kreisgrenze kann er vom Kreis der Brandstelle abweichen; deshalb steht die
 * Entfernung immer daneben.
 *
 * Suche über ein 0,1°-Gitter (Nachbarzellen), reine Funktionen — die Ladung ist
 * der einzige Netzzugriff und lebt in `loadPlaces()`. `verify:fire-registry`
 * prüft die Suche an einem Fixture.
 */

import { metersBetween } from '../sources/firmsHotspots';
import type { Country } from '../../types';

export interface Place {
  lat: number;
  lon: number;
  name: string;
  district: string | null;
  country: Country;
  population: number;
}

export interface PlaceHit extends Place {
  distanceKm: number;
}

export interface PlaceIndex {
  places: readonly Place[];
  /** Zellen `x,y` (0,1°) → Indizes. */
  cells: ReadonlyMap<string, readonly number[]>;
  stamp: string | null;
  source: string;
}

/** Jenseits dieser Entfernung wird kein Ort mehr behauptet. */
export const MAX_KM = 20;
const CELL = 0.1;

export const PLACES_URL = '/fire/places-dach.json';
export const PLACES_ATTRIBUTION = 'Ortsnamen: <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0)';

interface RawFile {
  source: string;
  stamp: string | null;
  districts: string[];
  places: [number, number, string, number, string, number][];
}

/** Aus der Datei einen Index bauen — pur, damit ein Fixture prüfbar ist. */
export function buildPlaceIndex(raw: RawFile): PlaceIndex {
  const places: Place[] = raw.places.map(([lat, lon, name, d, cc, population]) => ({
    lat, lon, name,
    district: d >= 0 ? raw.districts[d] ?? null : null,
    country: cc as Country,
    population,
  }));
  const cells = new Map<string, number[]>();
  places.forEach((p, i) => {
    const k = `${Math.floor(p.lon / CELL)},${Math.floor(p.lat / CELL)}`;
    const l = cells.get(k); if (l) l.push(i); else cells.set(k, [i]);
  });
  return { places, cells, stamp: raw.stamp ?? null, source: raw.source };
}

/**
 * Der nächste Ort. Sucht in der Zelle und ihren Nachbarn (Ring 0…2 ⇒ bis ~30 km),
 * bricht ab, sobald ein Treffer näher liegt als der nächste Ring reichen kann.
 */
export function nearestPlace(idx: PlaceIndex, lat: number, lon: number, maxKm = MAX_KM): PlaceHit | null {
  const cx = Math.floor(lon / CELL); const cy = Math.floor(lat / CELL);
  let best: Place | null = null; let bestM = Infinity;
  const p0 = { lat, lon };
  for (let ring = 0; ring <= 2; ring++) {
    for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const list = idx.cells.get(`${cx + dx},${cy + dy}`);
      if (!list) continue;
      for (const i of list) {
        const p = idx.places[i];
        const d = metersBetween(p0, p);
        if (d < bestM) { best = p; bestM = d; }
      }
    }
    // Reicht der nächste Ring überhaupt näher heran? Zellhöhe ~11 km.
    if (best && bestM < ring * 11_000) break;
  }
  if (best === null || bestM > maxKm * 1000) return null;
  const b: Place = best;
  return { ...b, distanceKm: Math.round(bestM / 100) / 10 };
}

let _cache: Promise<PlaceIndex> | null = null;

/**
 * Lädt das Verzeichnis einmal je Sitzung. Bewusst OHNE Abbruch-Signal: der
 * geteilte Cache darf nicht am Lebenszyklus des ersten Aufrufers hängen (React
 * ruft Effekte im Dev-Modus doppelt; ein abgebrochener erster Abruf ließe den
 * zweiten mit einem verworfenen Promise zurück). Der Aufrufer prüft selbst,
 * ob er das Ergebnis noch braucht.
 */
export function loadPlaces(): Promise<PlaceIndex> {
  if (!_cache) {
    _cache = fetch(PLACES_URL)
      .then((r) => { if (!r.ok) throw new Error(`Ortsverzeichnis: HTTP ${r.status}`); return r.json() as Promise<RawFile>; })
      .then(buildPlaceIndex)
      .catch((e) => { _cache = null; throw e; });
  }
  return _cache;
}

/** Nur für Tests. */
export function resetPlacesCache(): void { _cache = null; }

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface PlacesCheck { name: string; ok: boolean; detail?: string }

export function verifyPlaces(): { checks: PlacesCheck[]; passed: number; total: number } {
  const checks: PlacesCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const idx = buildPlaceIndex({
    source: 'fixture', stamp: '2026-08-12', districts: ['Landkreis A', 'Bezirk B'],
    places: [
      [50.000, 10.000, 'Adorf', 0, 'DE', 5000],
      [50.050, 10.000, 'Bedorf', 0, 'DE', 1500],
      [47.000, 14.000, 'Cedorf', 1, 'AT', 3000],
      [46.500, 8.000, 'Dedorf', -1, 'CH', 2000],
    ],
  });
  const a = nearestPlace(idx, 50.001, 10.001);
  add('nächster Ort wird gefunden — mit Kreis und Entfernung',
    a?.name === 'Adorf' && a.district === 'Landkreis A' && a.distanceKm < 0.3, JSON.stringify(a));
  add('der nähere von zwei Orten gewinnt (nicht der größere)',
    nearestPlace(idx, 50.045, 10.0)?.name === 'Bedorf');
  add('über die Zellgrenze hinweg (Nachbarzelle) wird gesucht',
    nearestPlace(idx, 50.099, 10.05)?.name === 'Bedorf');
  add('kein Ort im Umkreis ⇒ null (nichts wird behauptet)',
    nearestPlace(idx, 52, 12) === null && nearestPlace(idx, 47.3, 14, 20) === null);
  add('ein Ort ohne Verwaltungseinheit hat district null, nicht leer',
    nearestPlace(idx, 46.5, 8.0)?.district === null);
  add('die Entfernung ist auf 100 m gerundet',
    (() => { const h = nearestPlace(idx, 50.02, 10.0); return h != null && Math.abs(h.distanceKm - 2.2) < 0.15; })());
  add('MAX_KM ist 20 (jenseits behauptet die Zeile nichts)', MAX_KM === 20);
  add('Attribution nennt GeoNames und CC BY', /GeoNames/.test(PLACES_ATTRIBUTION) && /CC BY/.test(PLACES_ATTRIBUTION));
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
