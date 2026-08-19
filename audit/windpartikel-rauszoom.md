# Diagnose — Windpartikel: Dichte normalisiert sich beim Rauszoomen zu träge

> Auftrag (Jan, 2026-08-15): Beim Reinzoomen entstehen zusätzliche Partikel (gewollt, mehr
> Detail). Beim Rauszoomen bleibt die Dichte im zuvor vergrößerten Bereich zu lange zu hoch —
> die Zahl normalisiert sich zu langsam. Ziel: deutlich schneller UND nahtlos (keine sichtbaren
> Sprünge), ohne Mobil-Performance zu beeinträchtigen; bestehende Schutzmechanismen prüfen.

## 0. Kurzfassung

Die Asymmetrie ist **strukturell**, kein Tuning-Problem:

* **Reinzoomen** — das Spawn-/Kodier-Rechteck (`getEquirectangularBounds`, Sichtfeld + 10 %)
  schrumpft. Jedes Partikel, das außerhalb des neuen Rechtecks liegt, ist in der bounds-relativen
  RGBA8-Kodierung nicht darstellbar und wird im `updateFrag` **sofort** recycelt
  (`out_of_bounds ⇒ drop = 1`) — gleichverteilt im neuen, kleineren Rechteck. Die Dichte stimmt
  nach **einem** Frame. Das ist der Effekt „beim Reinzoomen entstehen zusätzliche Partikel".
* **Rauszoomen** — das Rechteck wächst. **Alle** Partikel liegen im alten (kleinen) Rechteck,
  sind also weiterhin gültig und werden **nur über die normale Lebensdauer** recycelt:
  `dropRate 0,003/Frame + speed_t·0,01`. Mittlere Lebensdauer ≈ 100–330 Frames ⇒ der Klumpen im
  alten Ausschnitt braucht **2–5 s**, bis er sich statistisch über die neue Fläche verteilt hat.
* Der bestehende Gegenzug (Auffrisch-Puls `ZOOM_SETTLE_MS 1100 / GAIN 4` auf `zoomend`,
  eingeführt 2026-08-09) recycelt in der Pulssekunde nur ~45 % der Partikel — **und** verkürzt
  dabei global alle Schweife (Drop-Rate ×5), also sichtbarer Übergang, aber unvollständige Wirkung.
  Er wirkt außerdem erst nach `zoomend`, nicht während der Geste.

**Lösung (Z3):** das Recycling im Update-Pass rechnet die **Flächenänderung** des Bezugsrechtecks
direkt um — die Uniforms `u_bounds_prev`/`u_bounds` sind seit der bounds-relativen Kodierung
ohnehin im Shader:

1. Wächst die Fläche um den Faktor A = area(new)/area(prev) > 1, wird jedes Partikel zusätzlich mit
   Wahrscheinlichkeit `1 − 1/A` recycelt (Überschuss-Anteil). Bei kontinuierlichem Zoom sind das
   pro Frame ~1–3 % — unsichtbar, kumulativ exakt.
2. Recycelte Überschuss- **und** Out-of-bounds-Partikel werden **nicht** über das ganze neue
   Rechteck gestreut, sondern gleichverteilt in `new \ (prev ∩ new)` — dem Ring bzw. Streifen, der
   neu ins Bild gekommen ist (Zerlegung in oben/unten/links/rechts-Rechtecke, flächengewichtete
   Auswahl). Damit ist die Dichte nach **jedem** Frame gleichverteilt: die im alten Ausschnitt
   verbleibenden Partikel behalten ihre Bahn (Kontinuität), der Rand füllt sich sofort. Beim
   Schwenken (A = 1) füllt dieselbe Regel exakt den nachrückenden Streifen — heute wird er
   unterbesetzt, weil die Verlassenden über die ganze Fläche gestreut werden.
3. Normale Lebensdauer-Drops (`drop_rate`) spawnen unverändert im ganzen Rechteck.

Rule 2: `zoomRedistribute` (WindLayerOptions, **default an**) mit Uniform `u_redistribute`; bei
`false` ist der Shader-Pfad rechnerisch identisch zum Alt-Verhalten (mix mit 0), und der
Auffrisch-Puls springt wieder ein. Ist die Umverteilung aktiv, wird der Puls **nicht** mehr
gezündet (er wäre nur noch Schweif-Verkürzung ohne Nutzen); `zoomDropBoost` als Dauer-Faktor gegen
Konvergenz-Klumpen weit draußen bleibt unverändert.

⚠️ Das ist eine Änderung an `updateFrag` (Shader-Pipeline ⇒ eigentlich STOPP & FRAGEN). Sie ist
additiv (neuer Uniform, alter Pfad bei `u_redistribute = 0` unverändert), rührt die
RGBA8-Positionskodierung, `highp`, den Sub-Step-Loop und `u_step_scale` **nicht** an. Jan kann sie
per `zoomRedistribute: false` in `MapView.tsx` abschalten.

## 1. Mobil-Bewertung

* Der Update-Pass läuft über die Partikel-Zustandstextur (≈ 45²–150² Texel), nicht über den
  Bildschirm — ein paar Dutzend zusätzliche ALU-Ops je Texel sind auf jeder Mobil-GPU vernachlässigbar
  (< 25 000 Fragmente/Frame). Keine zusätzlichen Texture-Fetches, keine Branches auf Sampler-Ergebnisse.
* `reduceMotionOnMove` (Touch): während der Geste laufen keine Partikel-Pässe; auf `moveend` folgt
  **ein** Update mit großem `prev→new`-Sprung — genau der Fall, den die exakte Umverteilung in einem
  Schritt löst (heute: Klumpen + Puls).
* `maxParticleFps 30`, FrameGovernor-Leiter, Trail-Scale, RGBA8-Packing, `highp`: unangetastet.

## 2. Bestehende Schutzmechanismen (Prüfliste, Beleg s. tests.md §V-WIND-RAUSZOOM)

| Mechanismus | Stelle | Status |
|---|---|---|
| Frame-dt-Normierung + Sub-Steps | `updateParticles` / `advection.ts` | unverändert, `verify:wind-advection` |
| RGBA8 bounds-relative Positionskodierung | `updateFrag` Kodier-/Dekodierzeilen | byte-identisch |
| FrameGovernor (FPS-Leiter, Trail 0,5×) | `perfGovernor.ts` | nicht berührt |
| Repaint-Pause (hidden / IntersectionObserver) | `WindLayer.ts` P3 | nicht berührt |
| Trail-Nachführung ZA-1 | `WindLayer.ts` | nicht berührt |
| Zoom-Auffrisch-Puls (2026-08-09) | `onZoomSettle`/`zoomDropScale` | bleibt als Fallback bei `zoomRedistribute:false` |
| `zoomDropBoost` (Konvergenz-Klumpen weit draußen) | `zoomDropScale` | unverändert aktiv |

## 3. Umsetzung + Messung (2026-08-15, Desktop, Chrome, Dev :5199, München z7,5 → z5,3)

Messgröße: Anteil der Partikel, die nach dem Rauszoomen noch im **alten** Bezugsrechteck liegen,
geteilt durch dessen Flächenanteil am neuen Rechteck (Soll bei Gleichverteilung: **1,0**).
Auslesen per `readParticleState()` + `decodeParticle()` (dieselben Helfer wie `windMotionDiag`),
Alt-/Neu-Verhalten per `zoomRedistribute` zur Laufzeit umgeschaltet, gleiche Windlage.

| Zeit nach `easeTo`-Ende | ALT (Puls aktiv) | NEU (Umverteilung) |
|---|---|---|
| +0,25 s | **11,8×** | 0,93× |
| +0,9 s | 11,1× | 0,99× |
| +1,2 s | 10,5× | 1,02× |
| +2,0 s | 9,8× | 1,07× |
| +3,5 s | **7,8×** | 1,11× |

Mobil-Pfad (`reduceMotionOnMove` + Governor-Boden ⇒ Partikel-Pässe während der Geste ausgesetzt,
**ein** Update auf `moveend`): ALT 11,7× → 8,5× nach 3 s; NEU **0,99×** im ersten Bild.

Schwenken (300 px, z6,5, Histogramm der lokalen x-/y-Position in 10 Klassen, Soll ≈ 250 je Klasse):
nach links ALT `80, 63` in den beiden neuen Klassen → NEU `284, 239`; nach oben NEU `264, 252`;
nach unten `218, 217`. Nach **rechts** bleibt der Streifen auch NEU dünner (`190, 150`) — derselbe
Ostabfall ist im **stehenden** Bild vorhanden (Klasse 7 auch ALT nur 198) und ist eine Eigenschaft
des Windfelds/Datenrands, kein Verteilungsfehler.

Reinzoomen (z5,3 → z7,5): linke Bildhälfte ALT 47,9 % / NEU 50,7 % — unverändert gleichverteilt.
Bildrate während der Zoomfahrt ALT 29 fps / NEU 30 fps (identisch, MCP-Umgebung).
Konsole nach frischem Laden: 0 Fehler / 0 Warnungen; `verify:wind-advection` 50/50.
Screenshots: `audit/screenshots/wind/rauszoom-{alt,neu}-900ms.jpg`.

**Messfalle dieser Sitzung:** die MCP-Tabs lagen zunächst in einem verdeckten Fenster
(`visibilityState hidden`, rAF 0/s — P3-Pause greift korrekt); erst nach Aktivieren des Tabs
(Ctrl+9 im Zielfenster) liefen Animation und Messung.
