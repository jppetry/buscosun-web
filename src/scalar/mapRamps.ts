/**
 * Karten-Farbrampen der 2D-Layer, die nicht schon in `ScalarLayer`/`RainLayer`
 * wohnen (Nowcast-Scalar, Böen, Regenwahrscheinlichkeit). Ausgelagert aus
 * `MapView.tsx`, damit sie **eine** Quelle sind für den Render-Pfad (ScalarLayer/
 * RainLayer `colorRamp`) UND die persistente Ribbon-Legende (`map/legendModel`).
 *
 * Reine Datentabellen — keine Logik, keine Imports aus `MapView` → kein
 * Zyklus. Werte 1:1 aus dem bisherigen `MapView`-Stand (unverändert).
 */

/** Nowcast/Niederschlag als ICON-D2-ScalarLayer (normiert gegen 10 mm/h).
 *  Der 0–2-h-Radar-Nowcast nutzt separat `precipRainRamp` (RainLayer); die
 *  Legende folgt Spec §7 → `precipRainRamp` als kanonische Niederschlagsskala. */
export const precipRamp: Record<number, string> = {
  0.0:   'rgba(180, 220, 250, 0.0)',  // 0 mm/h — transparent
  0.01:  'rgb(180, 220, 250)',        // 0.1 mm/h drizzle — pale blue
  0.05:  'rgb(95, 175, 235)',         // 0.5 mm/h light rain — medium blue
  0.1:   'rgb(45, 130, 215)',         // 1 mm/h moderate rain — deep blue
  0.2:   'rgb(60, 195, 130)',         // 2 mm/h — green
  0.3:   'rgb(245, 200, 50)',         // 3 mm/h — amber
  0.5:   'rgb(235, 110, 55)',         // 5 mm/h heavy — orange
  0.75:  'rgb(200, 50, 50)',          // 7.5 mm/h very heavy — red
  1.0:   'rgb(170, 50, 130)',         // 10 mm/h extreme — purple
};

/** Windböen-Farbrampe (0..1 ≙ 0..40 m/s): ruhig grünlich → Amber → Terrakotta →
 *  Magenta/Violett für Sturm/Orkan. Schwellen grob an Beaufort orientiert
 *  (~17 m/s Sturmböe Bft 8, ~25 m/s Bft 10, ~33 m/s Bft 12). */
export const gustRamp: Record<number, string> = {
  0.0:    'rgb(214,226,224)', // 0 m/s, ruhig
  0.125:  'rgb(150,200,162)', // 5 m/s
  0.25:   'rgb(120,190,120)', // 10 m/s
  0.35:   'rgb(214,204,120)', // 14 m/s
  0.425:  'rgb(224,168,92)',  // 17 m/s — Sturmböe (Bft 8)
  0.525:  'rgb(214,110,70)',  // 21 m/s — Bft 9
  0.625:  'rgb(190,58,58)',   // 25 m/s — schwere Sturmböe (Bft 10)
  0.75:   'rgb(150,50,110)',  // 30 m/s — Bft 11
  0.875:  'rgb(110,50,130)',  // 35 m/s — orkanartig
  1.0:    'rgb(70,40,110)',   // 40 m/s — Orkan (Bft 12)
};
/** Oberes Ende der Böen-Rampe in m/s (0..1 ≙ 0..GUST_VMAX_MS). */
export const GUST_VMAX_MS = 40;

/** Wahrscheinlichkeits-Farbrampe (t = PoP 0..1): hellblau → blau → violett.
 *  Alpha im Verlauf eingebacken (RainLayer hat kein visRange): < ~4 % transparent,
 *  Einblendung bis ~25 %, darüber voll (× layer-opacity). */
export const popRamp: Record<number, string> = {
  0.0:  'rgba(190,214,255,0)',
  0.04: 'rgba(185,210,255,0)',
  0.12: 'rgba(150,190,252,0.55)',
  0.25: 'rgba(122,170,250,1)',
  0.5:  'rgba(74,120,228,1)',
  0.75: 'rgba(112,70,198,1)',
  1.0:  'rgba(86,28,138,1)',
};
