/**
 * Maschinenlesbarer Modellkatalog — die **einzige** Quelle für den Per-Land-
 * Modell-Switcher der 2D-Karte (siehe `docs/model-switcher-gate0.md`).
 *
 * Aus diesem Katalog werden generiert (kein doppelt gepflegter Datensatz):
 *  - die Modell-Karten der Switcher-UI (Name, Betreiber, Badges),
 *  - die „Gut für …"-Nutzensätze (`gutFuerSatz`, rein aus Katalogdaten — keine
 *    Fantasieaussagen),
 *  - die Dreier-Gruppierung Lokal & fein / Regional / Global & langfristig,
 *  - die Per-Land-Abdeckung + der stille Native-Fallback außerhalb der Abdeckung,
 *  - die Lizenz-/Attributionszeile je aktiver Quelle,
 *  - der `ingested`-Zustand (ausgegraut „bald verfügbar", solange kein Adapter).
 *
 * WHITELIST-INVARIANTE: Es existieren ausschließlich die vom Betreiber vorab
 * freigegebenen Modelle (kommerziell frei/unlimitiert: CC BY 4.0, Etalab 2.0,
 * OGL, CC0, Public Domain). `CATALOG_IDS` ist die abgeschlossene Menge — der
 * Resolver lädt/zeigt nichts außerhalb davon (Deliverable-Test h).
 *
 * Rein & importzyklusfrei (nur Typ-Import von `../types`), damit die Node-
 * strip-types-Harness (`scripts/verify-*.mjs`) es direkt prüfen kann.
 */

import type { Country } from '../types';

/** Abgeschlossene Menge aller wählbaren Quellen. `native`/`fusion` = Spezialwerte. */
export type ModelId =
  // Spezialwerte derselben Achse (Bestand):
  | 'native' | 'fusion'
  // Heute ingestiert (Switcher geht damit live):
  | 'icon-d2' | 'mosmix' | 'inca' | 'arome-at' | 'obs'
  // Regional/teilw. — Phase 4:
  | 'icon-d2-eps' | 'icon-eu' | 'icon-ch1-eps' | 'icon-ch2-eps' | 'arome-fr'
  // Global/grob — Phase 4:
  | 'ukmo' | 'arpege' | 'icon-global' | 'gem' | 'ifs' | 'gfs'
  // KI — Phase 4:
  | 'aicon' | 'aifs' | 'aifs-ens' | 'aigfs' | 'aigefs' | 'graphcast';

/** Abdeckungsstufe eines Modells je Land (steuert Sichtbarkeit + Fallback). */
export type Coverage = 'full' | 'partial' | 'coarse' | 'none';

/** UI-Dreiergruppe (nach Auflösung/Reichweite). */
export type ModelGroup = 'local' | 'regional' | 'global';

/** Datentyp: Raster-Gitter · Punkt/Station · Analyse (Ist/Radar). */
export type DataKind = 'raster' | 'point' | 'analysis';

/** Lizenzen der Whitelist (alle mit Attributionspflicht außer CC0/PD). */
export type License =
  | 'CC-BY-4.0' | 'Etalab-2.0' | 'OGL-UK' | 'OGL-Canada' | 'CC0' | 'Public-Domain';

export interface ModelEntry {
  id: ModelId;
  /** Anzeigename. */
  name: string;
  /** Betreiber (Attribution). */
  operator: string;
  kind: DataKind;
  /** Ensemble → 2D rendert Ens-Mittel (UI-Badge). */
  ensemble?: boolean;
  /** KI-Modell → [KI]-Badge. */
  ai?: boolean;
  /** Nowcast-Charakter (kurzer Horizont, „Regen jetzt"). */
  nowcast?: boolean;
  /** Gitterauflösung in km (undefiniert bei reinen Stationsprodukten). */
  resolutionKm?: number;
  /** Vorhersagehorizont in Stunden (0 = reine Analyse/Ist). */
  horizonH: number;
  license: License;
  /** Kurze, dezente Quellenzeile für die UI. */
  attribution: string;
  /**
   * Existiert der Ingest-Adapter HEUTE? `false` → ausgegraut „bald verfügbar".
   * Nur `true`-Modelle sind wähl-/ladbar (Whitelist-Test h).
   */
  ingested: boolean;
  /**
   * Kann das Modell überhaupt einen Raster-Layer speisen? `false` bei reinen
   * Punkt-/Stationsquellen (MOSMIX/Obs) → Raster-Layer fallen auf native zurück.
   */
  rasterCapable: boolean;
  /**
   * Raster entsteht über die FusionEngine-IDW-Gitterung (nicht natives GRIB2).
   * Trägt die verifizierte Alpen-Höhenkorrektur-Schwäche → laienverständlicher
   * Warnhinweis via `qualityNote()`. Solche Quellen erscheinen NIE als „Empfohlen"
   * und sind NIE Ziel eines Auto-Fallbacks. Siehe `docs/model-switcher-gate0.md §0.3`.
   */
  engineGridded?: boolean;
  /**
   * Ehrliche Pipeline-Notiz, wenn der Katalog-Anspruch vom heutigen Ingest
   * abweicht (z. B. „heute nur als Höhenprofil, kein 2D-Raster"). Wird in der UI
   * statt eines nackten „bald verfügbar" gezeigt. Siehe Gate 0 §4.
   */
  pipelineNote?: string;
  /** Per-Land-Abdeckung. */
  coverage: Record<Country, Coverage>;
  /** UI-Gruppe. */
  group: ModelGroup;
  /** Spezialwert der Achse (Bestand): eigener Render-Pfad. */
  special?: 'native' | 'fusion';
}

const full3: Record<Country, Coverage> = { DE: 'full', AT: 'full', CH: 'full' };
const coarse3: Record<Country, Coverage> = { DE: 'coarse', AT: 'coarse', CH: 'coarse' };

/**
 * DER Katalog. Reihenfolge innerhalb einer Gruppe = feiner→gröber (Auflösung),
 * die UI sortiert zusätzlich. `native`/`fusion` werden in der UI gesondert oben
 * geführt und sind hier der Vollständigkeit halber als Spezialwerte gelistet.
 */
export const MODEL_CATALOG: readonly ModelEntry[] = [
  // ---- Spezialwerte (eigener Render-Pfad, oben in der UI) --------------------
  {
    id: 'native', name: 'Native', operator: 'Buscosun-Komposit', kind: 'raster',
    horizonH: 48, license: 'CC-BY-4.0',
    attribution: 'Daten: DWD, GeoSphere Austria, MeteoSchweiz · CC BY 4.0',
    ingested: true, rasterCapable: true, coverage: full3, group: 'local', special: 'native',
    resolutionKm: 2.2,
  },
  {
    id: 'fusion', name: 'Buscosun Fusion', operator: 'Buscosun (hauseigen)', kind: 'raster',
    horizonH: 48, license: 'CC-BY-4.0',
    attribution: 'Kombiniert aus DWD/GeoSphere/MeteoSchweiz · CC BY 4.0',
    ingested: true, rasterCapable: true, engineGridded: true, coverage: full3,
    group: 'local', special: 'fusion', resolutionKm: 2,
  },

  // ---- Lokal & fein (≤ 2,5 km) ----------------------------------------------
  {
    id: 'inca', name: 'INCA', operator: 'GeoSphere Austria', kind: 'raster', nowcast: true,
    resolutionKm: 1, horizonH: 3, license: 'CC-BY-4.0',
    attribution: 'Daten: GeoSphere Austria · CC BY 4.0',
    ingested: true, rasterCapable: true, engineGridded: true,
    // INCA-Grid ist AT-only (bbox deckt nur AT; DE/CH → 400s bzw. nicht publiziert).
    coverage: { DE: 'none', AT: 'full', CH: 'none' }, group: 'local',
  },
  {
    id: 'icon-ch1-eps', name: 'ICON-CH1-EPS', operator: 'MeteoSchweiz', kind: 'raster',
    ensemble: true, resolutionKm: 1, horizonH: 33, license: 'CC-BY-4.0',
    attribution: 'Daten: MeteoSchweiz · CC BY 4.0',
    ingested: true, rasterCapable: true, engineGridded: true,
    // Domäne ist die Schweiz (+ kleiner Rand) → für DE/AT kein Raster (Fallback
    // auf Native). Erster Schnitt: Kontrolllauf (1 Member), nicht Ensemble-Mittel.
    coverage: { DE: 'none', AT: 'none', CH: 'full' }, group: 'local',
    pipelineNote: '2D-Raster aktuell als Kontrolllauf (0–6 h); Ensemble-Mittel folgt. Lädt im Hintergrund.',
  },
  {
    id: 'icon-d2', name: 'ICON-D2', operator: 'DWD', kind: 'raster',
    resolutionKm: 2.2, horizonH: 48, license: 'CC-BY-4.0',
    attribution: 'Daten: DWD · CC BY 4.0',
    ingested: true, rasterCapable: true, coverage: full3, group: 'local',
  },
  {
    id: 'icon-d2-eps', name: 'ICON-D2-EPS', operator: 'DWD', kind: 'raster', ensemble: true,
    resolutionKm: 2.2, horizonH: 48, license: 'CC-BY-4.0',
    attribution: 'Daten: DWD · CC BY 4.0',
    ingested: true, rasterCapable: true, engineGridded: true, coverage: full3, group: 'local',
    pipelineNote: '2D-Raster aktuell als Kurzfrist-Ensemble-Mittel (0–6 h); lädt im Hintergrund.',
  },
  {
    id: 'icon-ch2-eps', name: 'ICON-CH2-EPS', operator: 'MeteoSchweiz', kind: 'raster',
    ensemble: true, resolutionKm: 2.1, horizonH: 120, license: 'CC-BY-4.0',
    attribution: 'Daten: MeteoSchweiz · CC BY 4.0',
    ingested: true, rasterCapable: true, engineGridded: true,
    coverage: { DE: 'none', AT: 'none', CH: 'full' }, group: 'local',
    pipelineNote: '2D-Raster aktuell als Kontrolllauf (0–6 h); Ensemble-Mittel folgt. Lädt im Hintergrund.',
  },
  {
    id: 'arome-at', name: 'AROME-AT', operator: 'GeoSphere Austria', kind: 'raster',
    resolutionKm: 2.5, horizonH: 60, license: 'CC-BY-4.0',
    attribution: 'Daten: GeoSphere Austria · CC BY 4.0',
    ingested: true, rasterCapable: true, engineGridded: true,
    coverage: { DE: 'partial', AT: 'full', CH: 'full' }, group: 'local',
  },
  {
    id: 'arome-fr', name: 'AROME-France', operator: 'Météo-France', kind: 'raster',
    resolutionKm: 1.3, horizonH: 42, license: 'Etalab-2.0',
    attribution: 'Daten: Météo-France · Etalab 2.0',
    ingested: true, rasterCapable: true, engineGridded: true,
    // Domäne EURW1S100 (12°W–16°E) → DE + CH voll, West-AT bis 16°E (Wien außen).
    coverage: { DE: 'full', AT: 'partial', CH: 'full' }, group: 'local',
    pipelineNote: '2D-Raster aktuell nur Temperatur + Wind (0–6 h); Wolken/Niederschlag folgen. Große Dateien, lädt im Hintergrund.',
  },

  // ---- Regional (7 km / Stationen) ------------------------------------------
  {
    id: 'icon-eu', name: 'ICON-EU', operator: 'DWD', kind: 'raster',
    resolutionKm: 7, horizonH: 120, license: 'CC-BY-4.0',
    attribution: 'Daten: DWD · CC BY 4.0',
    ingested: true, rasterCapable: true, engineGridded: true, coverage: full3, group: 'regional',
    pipelineNote: '2D-Raster (Temperatur/Wind/Wolken/Niederschlag), 0–6 h; lädt im Hintergrund.',
  },
  {
    id: 'mosmix', name: 'MOSMIX', operator: 'DWD', kind: 'point',
    horizonH: 240, license: 'CC-BY-4.0',
    attribution: 'Daten: DWD MOSMIX · CC BY 4.0',
    ingested: true, rasterCapable: false, coverage: full3, group: 'regional',
  },
  {
    id: 'obs', name: 'Live-Stationen', operator: 'DWD · TAWES · SMN', kind: 'analysis',
    horizonH: 0, license: 'CC-BY-4.0',
    attribution: 'Stationen: DWD, GeoSphere Austria, MeteoSchweiz · CC BY 4.0',
    ingested: true, rasterCapable: false, coverage: full3, group: 'regional',
  },

  // ---- Global & langfristig (grob) ------------------------------------------
  {
    id: 'ukmo', name: 'UKMO Global', operator: 'UK Met Office', kind: 'raster',
    resolutionKm: 10, horizonH: 168, license: 'OGL-UK',
    attribution: 'Daten: UK Met Office · OGL', ingested: false, rasterCapable: true,
    engineGridded: true, coverage: coarse3, group: 'global',
  },
  {
    id: 'arpege', name: 'ARPEGE', operator: 'Météo-France', kind: 'raster',
    resolutionKm: 25, horizonH: 102, license: 'Etalab-2.0',
    attribution: 'Daten: Météo-France · Etalab 2.0', ingested: true, rasterCapable: true,
    engineGridded: true, coverage: coarse3, group: 'global',
    pipelineNote: '2D-Raster nur Temperatur + Wind (0–6 h); große gebündelte Dateien, Erstabruf langsam.',
  },
  {
    id: 'icon-global', name: 'ICON global', operator: 'DWD', kind: 'raster',
    resolutionKm: 13, horizonH: 180, license: 'CC-BY-4.0',
    attribution: 'Daten: DWD · CC BY 4.0', ingested: true, rasterCapable: true,
    engineGridded: true, coverage: coarse3, group: 'global',
    pipelineNote: '2D-Raster (Temperatur/Wind/Wolken/Niederschlag), icosahedral 13 km, 0–6 h.',
  },
  {
    id: 'aicon', name: 'AICON', operator: 'DWD', kind: 'raster', ai: true,
    resolutionKm: 13, horizonH: 180, license: 'CC-BY-4.0',
    attribution: 'Daten: DWD (AICON) · CC BY 4.0', ingested: true, rasterCapable: true,
    engineGridded: true, coverage: coarse3, group: 'global',
    pipelineNote: 'KI-Modell · 2D-Raster Temperatur/Wind/Niederschlag (0–6 h); Wolken folgen.',
  },
  {
    id: 'gem', name: 'GEM / GDPS', operator: 'ECCC', kind: 'raster',
    resolutionKm: 15, horizonH: 240, license: 'OGL-Canada',
    attribution: 'Daten: Environment Canada · OGL Canada', ingested: false, rasterCapable: true,
    engineGridded: true, coverage: coarse3, group: 'global',
  },
  {
    id: 'ifs', name: 'ECMWF IFS', operator: 'ECMWF', kind: 'raster',
    resolutionKm: 28, horizonH: 240, license: 'CC-BY-4.0',
    attribution: 'Daten: ECMWF · CC BY 4.0', ingested: true, rasterCapable: true,
    engineGridded: true, coverage: coarse3, group: 'global',
    pipelineNote: '2D-Raster (Temperatur/Wind/Wolken/Niederschlag), 0,25°-Globalgitter, 0–6 h.',
  },
  {
    id: 'gfs', name: 'NOAA GFS', operator: 'NOAA', kind: 'raster',
    resolutionKm: 28, horizonH: 384, license: 'Public-Domain',
    attribution: 'Daten: NOAA · Public Domain', ingested: true, rasterCapable: true,
    engineGridded: true, coverage: coarse3, group: 'global',
    pipelineNote: '2D-Raster (Temperatur/Wind/Wolken/Niederschlag), grobes 1°-Globalgitter, 0–6 h.',
  },
  {
    id: 'aifs', name: 'AIFS Single', operator: 'ECMWF', kind: 'raster', ai: true,
    resolutionKm: 28, horizonH: 360, license: 'CC-BY-4.0',
    attribution: 'Daten: ECMWF (AIFS) · CC BY 4.0', ingested: true, rasterCapable: true,
    engineGridded: true, coverage: coarse3, group: 'global',
    pipelineNote: 'KI-Modell · 2D-Raster (Temperatur/Wind/Wolken/Niederschlag), 0,25°, 0–6 h.',
  },
  {
    id: 'aifs-ens', name: 'AIFS ENS', operator: 'ECMWF', kind: 'raster', ai: true, ensemble: true,
    resolutionKm: 28, horizonH: 360, license: 'CC-BY-4.0',
    attribution: 'Daten: ECMWF (AIFS ENS) · CC BY 4.0', ingested: true, rasterCapable: true,
    engineGridded: true, coverage: coarse3, group: 'global',
    pipelineNote: 'KI-Ensemble · 2D-Raster aktuell als Kontrolllauf (0–6 h); perturbiertes Ensemble folgt.',
  },
  {
    id: 'aigfs', name: 'AIGFS', operator: 'NOAA', kind: 'raster', ai: true,
    resolutionKm: 28, horizonH: 384, license: 'CC0',
    attribution: 'Daten: NOAA (AIGFS) · CC0', ingested: false, rasterCapable: true,
    engineGridded: true, coverage: coarse3, group: 'global',
  },
  {
    id: 'aigefs', name: 'AIGEFS', operator: 'NOAA', kind: 'raster', ai: true, ensemble: true,
    resolutionKm: 28, horizonH: 384, license: 'CC0',
    attribution: 'Daten: NOAA (AIGEFS) · CC0', ingested: false, rasterCapable: true,
    engineGridded: true, coverage: coarse3, group: 'global',
  },
  {
    id: 'graphcast', name: 'GraphCastGFS', operator: 'NOAA', kind: 'raster', ai: true,
    resolutionKm: 28, horizonH: 240, license: 'CC0',
    attribution: 'Daten: NOAA (GraphCast) · CC0', ingested: false, rasterCapable: true,
    engineGridded: true, coverage: coarse3, group: 'global',
  },
] as const;

/** Abgeschlossene ID-Menge (Whitelist-Gate). */
export const CATALOG_IDS: ReadonlySet<ModelId> = new Set(MODEL_CATALOG.map((m) => m.id));

const BY_ID: ReadonlyMap<ModelId, ModelEntry> = new Map(MODEL_CATALOG.map((m) => [m.id, m]));

/** Katalogeintrag zu einer ID (undefined nur bei Nicht-Whitelist-ID). */
export function modelEntry(id: ModelId): ModelEntry | undefined {
  return BY_ID.get(id);
}

/** Ist die ID Teil der Whitelist? (Deliverable-Test h). */
export function isWhitelisted(id: string): id is ModelId {
  return CATALOG_IDS.has(id as ModelId);
}

/**
 * Radar-/Analyse-Quelle je Land (orthogonaler Radar-Toggle, KEIN Modell in der
 * Liste). Ehrlich benannt: CH nutzt `rzc/RR`, NICHT „CombiPrecip" (s. Gate 0 §4).
 */
export const RADAR_SOURCE: Record<Country, { name: string; attribution: string; license: License }> = {
  DE: { name: 'RADOLAN-RV', attribution: 'Radar: DWD RADOLAN · CC BY 4.0', license: 'CC-BY-4.0' },
  AT: { name: 'GeoSphere INCA', attribution: 'Radar: GeoSphere Austria INCA · CC BY 4.0', license: 'CC-BY-4.0' },
  CH: { name: 'MeteoSchweiz rzc/RR', attribution: 'Radar: MeteoSchweiz rzc · CC BY 4.0', license: 'CC-BY-4.0' },
};

/**
 * Abdeckung eines Modells in einem Land. `'none'` ⇒ das Modell erscheint im
 * Land-Switcher nicht (bzw. der Layer fällt auf native zurück).
 */
export function coverageIn(id: ModelId, country: Country): Coverage {
  return modelEntry(id)?.coverage[country] ?? 'none';
}

/**
 * Kann `id` in `country` einen Raster-Layer bedienen? False ⇒ Resolver liefert
 * native (Fähigkeits-/Abdeckungs-Fallback, Deliverable e/f). Bedingungen:
 * ingestiert · rasterfähig · Abdeckung ≥ teilw. (bzw. grob als Global-Fallback).
 */
export function canRasterIn(id: ModelId, country: Country): boolean {
  const e = modelEntry(id);
  if (!e || !e.ingested || !e.rasterCapable) return false;
  const cov = e.coverage[country];
  return cov === 'full' || cov === 'partial' || cov === 'coarse';
}

/** Modelle, die im Land-Switcher erscheinen (Abdeckung ≥ teilw. oder grob). */
export function modelsForCountry(country: Country): ModelEntry[] {
  return MODEL_CATALOG.filter((m) => !m.special && coverageIn(m.id, country) !== 'none');
}

/** Nach Gruppe sortiert (feiner→gröber), für die UI. */
export function modelsByGroup(country: Country, group: ModelGroup): ModelEntry[] {
  return modelsForCountry(country)
    .filter((m) => m.group === group)
    .sort((a, b) => (a.resolutionKm ?? 999) - (b.resolutionKm ?? 999));
}

/** Ganze Tage aus Stunden, gerundet (für „Gut für"-Sätze). */
function days(h: number): number {
  return Math.max(1, Math.round(h / 24));
}

/** Deutsches Tag/Tage mit korrektem Singular („1 Tag" statt „1 Tage"). */
function dayStr(h: number): string {
  const d = days(h);
  return `${d} ${d === 1 ? 'Tag' : 'Tage'}`;
}

/**
 * „Gut für …"-Nutzensatz, **rein aus Katalogdaten generiert** (keine
 * Fantasieaussagen). Deterministisch → headless testbar.
 */
export function gutFuerSatz(id: ModelId): string {
  const e = modelEntry(id);
  if (!e) return '';
  if (e.special === 'native') return 'Gut für: den zuverlässigen Alltag — je Region das beste Modell automatisch';
  if (e.special === 'fusion') return 'Gut für: ein geglättetes Gesamtbild aus allen Quellen';
  if (e.nowcast) return `Gut für: Regen in den nächsten ${e.horizonH} Stunden`;
  if (e.kind === 'analysis') return 'Gut für: die aktuelle Lage aus echten Messungen';
  if (e.kind === 'point') return `Gut für: Ortsvorhersage bis ${dayStr(e.horizonH)} an Stationen`;
  const fine = (e.resolutionKm ?? 99) <= 2.5;
  if (e.ensemble) {
    return `Gut für: Trends bis ${dayStr(e.horizonH)} — mit Unsicherheitsspanne`;
  }
  if (fine && e.horizonH <= 60) {
    return `Gut für: die nächsten ${dayStr(e.horizonH)}, sehr detailliert`;
  }
  if ((e.resolutionKm ?? 0) >= 10) {
    return `Gut für: Langfrist-Trends bis ${dayStr(e.horizonH)}`;
  }
  return `Gut für: die nächsten ${dayStr(e.horizonH)}`;
}

/**
 * Nur `native` ist die empfohlene Standard-Quelle. Engine-gerasterte Quellen
 * (Fusion/AROME/INCA …) erscheinen bewusst **nie** als „Empfohlen".
 */
export function isRecommended(id: ModelId): boolean {
  return modelEntry(id)?.special === 'native';
}

/**
 * Laienverständlicher Qualitätshinweis für engine-gerasterte Quellen (statt
 * Fachjargon). `null`, wenn kein Hinweis nötig (nativ/Punkt/Analyse). Native
 * ist nie engine-gerastert → nie ein Warnhinweis auf der empfohlenen Quelle.
 */
export function qualityNote(id: ModelId): string | null {
  const e = modelEntry(id);
  if (!e || !e.engineGridded) return null;
  return 'Vereinfachtes Raster — in Gebirgslagen weniger genau';
}

/** Kompakte Badge-Texte für eine Modellkarte (Auflösung · Horizont · Flags). */
export function badges(id: ModelId): string[] {
  const e = modelEntry(id);
  if (!e) return [];
  const out: string[] = [];
  if (e.resolutionKm != null) out.push(`${String(e.resolutionKm).replace('.', ',')} km`);
  else if (e.kind === 'point') out.push('Stationen');
  if (e.horizonH > 0) out.push(`+${e.horizonH} h`);
  if (e.nowcast) out.push('Nowcast');
  if (e.ensemble) out.push('Ensemble (Mittel)');
  if (e.ai) out.push('[KI]');
  if (!e.ingested) out.push('bald verfügbar');
  return out;
}
