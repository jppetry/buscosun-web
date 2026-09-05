/**
 * Layer-Katalog der 2D-Wetterkarte (Dock-Sicht): Kurzlabel + Tooltip je Layer in
 * der Reihenfolge `LAYER_OPTION_ORDER` — EINE Quelle für `MapView.tsx`
 * (`LAYER_OPTIONS`) und den Verifier. Bestand seit Phase KD-R, Texte wortgleich.
 *
 * Die ausführlichen SEO-Texte je Layer (H1, Lead, Absätze, Fakten) stehen bewusst
 * in `src/seo/layerSeoTexts.ts`: sie hängen NICHT am Start-Bundle (Budget-Ratsche
 * eagerJs), sondern werden nur vom Build-Generator und lazy vom
 * `RouteSeoBlock` geladen (SEO/GEO 2026, E1/E2).
 *
 * Kein React, kein DOM: Node lädt die Datei per `--experimental-strip-types`.
 */

import type { LayerKey } from './layerTypes';

export interface LayerDockEntry {
  /** Kurzlabel im Dock. */
  label: string;
  /** Tooltip-/Titeltext im Dock (trägt die Ehrlichkeits-Sätze je Layer). */
  title: string;
}

/** Dock-Reihenfolge (Bestand aus MapView.LAYER_OPTIONS — NICHT `ALL_LAYER_KEYS`). */
export const LAYER_OPTION_ORDER: readonly LayerKey[] = [
  'wind', 'gust', 'nowcast', 'snow', 'temp', 'clouds', 'sat', 'thunder', 'rotation', 'hail', 'cells',
  'warnings', 'lightning', 'lightningfc', 'stations', 'confidence', 'snowline', 'flownowcast', 'poprob',
];

export const LAYER_CATALOG: Readonly<Record<LayerKey, LayerDockEntry>> = {
  wind: { label: 'Wind',
    title: 'Wind (DWD ICON-D2 u/v 10m · 2,2 km)' },
  gust: { label: 'Böen',
    title: 'Windböen — Spitzen (DWD ICON-D2 vmax_10m · 2,2 km, 0–24 h). Sicherheitsrelevant für Drohne, Kran, Höhenarbeit (vgl. Go/No-Go).' },
  nowcast: { label: 'Niederschlag',
    title: 'Niederschlag · jetzt–2 h — gemessenes Landesradar/Nowcast, per Land bis zum Nowcast-Horizont (DE RADOLAN-RV bis 2 h · AT GeoSphere INCA bis 3 h · CH MeteoSchweiz). Bewusst kurz & ehrlich: nur die gemessene Nahbereichs-Vorhersage, keine Modell-Verlängerung.' },
  temp: { label: 'Temperatur',
    title: '2-m-Temperatur (DWD ICON-D2 t_2m · 2,2 km, höhenkorrigiert)' },
  clouds: { label: 'Wolken',
    title: 'Bewölkung – tief/mittel/hoch geschichtet (DWD ICON-D2, 2,2 km, 0–12 h) — über den Slider' },
  sat: { label: 'Satellit',
    title: 'Meteosat (DWD OpenData, alle 3 h)' },
  lightning: { label: 'Blitze',
    title: 'Blitzortung letzte 60 Min (DWD Sferics)' },
  lightningfc: { label: 'Blitzprognose',
    title: 'Blitz-Vorhersage — ICON-D2 Lightning Potential Index (lpi_max, 2,2 km, 0–12 h). Prognostiziertes Blitzrisiko über den Slider — NICHT die gemessenen Blitze der letzten Stunde (das ist der Layer „Blitze"). Prognose ≠ Messung. DACH, near-NWP-Horizont.' },
  stations: { label: 'Stationen',
    title: 'Wetterstationen DWD/TAWES/SMN — klicken für Live-Werte' },
  confidence: { label: 'Sicherheit',
    title: 'Vertrauens-Schleier (KI · Klima-MOS): Kreuzschraffur, je dichter desto unsicherer die Vorhersage — aus Vorlaufzeit × klimatologischer Plausibilität gegen 30 J. DWD-Stationsklimatologie' },
  snowline: { label: 'Schneegrenze',
    title: 'Schneefallgrenze (KI · ML #2): Linie — oberhalb fällt Niederschlag als Schnee. Physik-Anker ~+1 °C + gelernte Orts-Korrektur (DWD-Stationen), dem Gelände folgend (höhenkorrigiert)' },
  flownowcast: { label: 'Flow-Nowcast',
    title: 'Flow-Nowcast: Optical-Flow-Extrapolation des Radars (Horn-Schunck-Bewegungsfeld + Lagrange-Advektion). Bewegt den Regen intensitätserhaltend in die nahe Zukunft (~0–60 min). Nur DE (RADOLAN-RV), trainingsfrei.' },
  poprob: { label: 'Regen-Chance',
    title: 'Regenwahrscheinlichkeit (%): kalibriertes Flow-Ensemble — 15 Member advehieren das Radar mit gestörten Bewegungsfeldern; je Zelle der Anteil, der Regen bringt. „Wie wahrscheinlich" statt „wie viel". Nur DE, ~0–60 min.' },
  thunder: { label: 'Gewitter',
    title: 'Gewitterpotenzial — CAPE (Energie) × CIN (Deckel) × LPI (Blitzbereitschaft), ICON-D2 2,2 km, 0–12 h. Flächige Vorwarnung vor dem ersten Radarecho. DACH, near-NWP-Horizont. Potenzial ≠ Auslösung.' },
  snow: { label: 'Schnee',
    title: 'Schneehöhe & Neuschnee — ICON-D2 h_snow (Schneedecke, aktuelle Höhe) + abgeleiteter Neuschnee-Zuwachs (snow_gsp+snow_con → cm), 2,2 km. Die Schnee-MENGE als Fläche (cm), NICHT die Schneegrenzen-Linie (das ist „Schneegrenze"). Modus im Layer umschaltbar. DACH.' },
  rotation: { label: 'Rotation',
    title: 'Rotationspotenzial (Experten-Layer) — ICON-D2 Updraft-Helicity (uh_max + uh_max_low) + Supercell-Index (sdi_2), 2,2 km, 0–12 h, geglättet. Modell-VERDACHTSflächen für rotierende Gewitter (Superzellen: Großhagel, organisierte Schwergewitter). KEIN amtliches Warnprodukt, KEIN Warnersatz — maßgeblich sind die DWD-Warnungen. Verdacht ≠ Ereignis, hohe Fehlalarmrate. DACH.' },
  cells: { label: 'Zellbahnen',
    title: 'Zellbahnen — DWD KONRAD3D: erkannte konvektive Zellen mit AMTLICHER Zugspur und amtlichem Unsicherheits-Trichter (jetzt bis +60 Min, 5-Minuten-Takt). Umriss = gemessen, Spur/Trichter = prognostiziert. Kein amtliches Warnprodukt und kein Warnersatz — maßgeblich sind die DWD-Warnungen. Abdeckung = Reichweite des deutschen Radarverbunds (reicht über die Grenze, dünnt dort aus).' },
  hail: { label: 'Hagel',
    title: 'Hagel — zwei amtliche Radarprodukte, bewusst nicht vermischt. FLÄCHE: MeteoSchweiz MESHS (maximal erwartete Korngröße in cm) bzw. POH (Hagelwahrscheinlichkeit in %), 1 km / 5 Min, nur 1. April–30. September — aus dem SCHWEIZER Radarverbund, dessen Reichweite über die Grenze nach Süddeutschland und Vorarlberg geht und dort ausdünnt. ZELLEN: DWD KONRAD3D — Zellen, in denen das Radar Hagel erkennt, mit Hagelfläche und Hinweis auf Großhagel, aus dem DEUTSCHEN Radarverbund (ebenfalls grenzüberschreitend). Österreich hat KEINE eigene offene Hagelquelle — im Osten Österreichs gibt es daher keine Abdeckung; das heißt NICHT, dass es dort nicht hagelt. Radarerkennung, keine Bodenmeldung. Kein amtliches Warnprodukt und kein Warnersatz.' },
  warnings: { label: 'Warnungen',
    title: 'Amtliche Wetterwarnungen von DWD (Deutschland, CAP, landkreisgenau) und MeteoSchweiz (Schweiz, Warnregionen, über den MeteoAlarm-Feed) — alle 5 Minuten. Das AMTLICHE Warnprodukt: alle anderen Layer dieser Karte verweisen darauf. Überschrift, Beschreibung und Handlungshinweis werden wortwörtlich übernommen. Die Flächenfarbe ist für Deutschland die amtliche Warnfarbe aus der Meldung; der Schweizer Feed führt keine Farbe mit, dort ist sie aus der amtlichen Gefahrenstufe ABGELEITET. Warnstufen werden quellenrein geführt — die Stufennummern der beiden Dienste bedeuten Verschiedenes. Der Layer folgt dem Zeit-Slider: gezeigt wird, was zur eingestellten Stunde gilt. ÖSTERREICH fehlt weiterhin (geplant) — dort warnt GeoSphere Austria; eine leere Fläche über Österreich heißt NICHT „keine Warnung". Fällt eine der beiden Quellen aus, sagt die Karte ausdrücklich, welches Land fehlt. Kein Ersatz für die amtliche Bekanntmachung: maßgeblich bleiben dwd.de/warnungen und meteoschweiz.admin.ch.' },
};

export interface LayerCatalogCheck { name: string; ok: boolean; detail?: string }

export function verifyLayerCatalog(allKeys: readonly LayerKey[]): { checks: LayerCatalogCheck[]; passed: number; failed: number } {
  const checks: LayerCatalogCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  add('Katalog deckt alle Layer-Keys ab', allKeys.every((k) => !!LAYER_CATALOG[k]) && Object.keys(LAYER_CATALOG).length === allKeys.length);
  add('LAYER_OPTION_ORDER ist eine Permutation aller Keys', LAYER_OPTION_ORDER.length === allKeys.length && new Set(LAYER_OPTION_ORDER).size === allKeys.length && allKeys.every((k) => LAYER_OPTION_ORDER.includes(k)));
  add('jeder Layer hat Label und Tooltip', allKeys.every((k) => LAYER_CATALOG[k].label.length > 0 && LAYER_CATALOG[k].title.length > 8));
  add('nur der Warn-Layer nennt sich amtliches Warnprodukt (alle anderen: „kein …")', allKeys.every((k) => k === 'warnings' || !/(?<!kein |KEIN )amtliches Warnprodukt/i.test(LAYER_CATALOG[k].title)));
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
