/**
 * Seewetter · Link auf EINEN Spot (`/seewetter/<spot>`, rein, nur die Namenstabelle und das Zeitschema als Import).
 *
 * ── Einheiten und Kennung ───────────────────────────────────────────────────
 * Die Einheit des Seewetters ist der SPOT (56 Strand-/Hafen-/Kite-Orte an Nord- und Ostsee, Handliste
 * `scripts/sea/spots-src.json`, Katalog `sea/v1/static/spots.json`). Seine Kennung ist der URL-Slug der Handliste
 * (`st-peter-ording`, `borkum`) — von Hand gesetzt, unabhängig von Lauf und Gitter, deshalb über Aktualisierungen stabil.
 * Seegebiete (FQDL50) und Küstenabschnitte (FQDL51) sind Warn-/Berichtszellen des Seewetterdienstes, die der Spot nur trägt
 * (Reiter „Gebiet"); sie bekommen keine eigene Route, weil sie keine eigene Prognose haben und ihr Text im Spot-Dossier steht.
 * Pegel (Wasserstand) hängen am Spot, nicht umgekehrt.
 *
 * ── Zeit und Ansicht im Link ────────────────────────────────────────────────
 * Die Seite führt die Zeit als Stunden ab jetzt (`t=0…78`). Im Link steht der ABSOLUTE Zeitpunkt (`share/hourOffset.ts`),
 * damit der Empfänger denselben Moment sieht — oder erfährt, dass er vorbei ist. Die gewählte Ansicht (Profil `p`, Ebene `l`,
 * Einheit `u`, Reiter `tab`, Revier `rv`) steht ohnehin in der Query und bleibt im Link; der Zustand selbst ist immer der AKTUELLE.
 */
import { SEA_SPOT_NAMES } from './seaSpotNames';

/** Horizont des Zeitbands in Stunden — gleich `SEA_MAX_T` in `seaState.ts` (`verify-share.mjs` prüft das). */
export const SEA_LINK_MAX_T = 78;
export const SEA_SPOT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const REGION_LABEL = { nordsee: 'Nordsee', ostsee: 'Ostsee' } as const;

/** Name und Revier eines Spots aus der Kennung; `null`, wenn der Slug unlesbar oder (noch) nicht in der Tabelle ist. */
export function seaSpotLabel(id: string | null | undefined): { name: string; region: 'nordsee' | 'ostsee'; regionLabel: string } | null {
  if (!id || id.length > 40 || !SEA_SPOT_SLUG_RE.test(id)) return null;
  const row = SEA_SPOT_NAMES[id];
  return row ? { name: row[0], region: row[1], regionLabel: REGION_LABEL[row[1]] } : null;
}

/** Titel + Beschreibung; `null` ohne bekannten Spot (die Vorschau fällt dann auf die allgemeine Seewetter-Vorschau zurück). */
export function describeSeaLink(id: string | null | undefined, whenText: string | null): { title: string; description: string } | null {
  const l = seaSpotLabel(id);
  if (!l) return null;
  return {
    title: `${l.name} — Seewetter ${l.regionLabel}${whenText ? ` · Prognose ${whenText}` : ''}`,
    description: `Wind, Böen und Seegang am Spot ${l.name} (${l.regionLabel}): Modellwerte des DWD und buscosun Fusion, bewertet mit eigenen Grenzen je Profil. `
      + 'Der Link zeigt immer die aktuelle Lage. Keine amtliche Warnung, kein Ersatz für den Seewetterbericht des Seewetterdienstes Hamburg und nicht für die Navigation.',
  };
}
