# buscosun Fusion Forecast — Übersicht

> Verständliche Kurzfassung. Die vollständige technische Spezifikation (mit allen
> Gewichten, Formeln und Konstanten) steht in [`fusion-forecast-spec.md`](./fusion-forecast-spec.md).
> Quellcode: `src/fusion/`, `src/sources/`, `src/countryProfiles.ts`.

## Was der Fusion Forecast macht

Er nimmt **mehrere Wetterquellen** (Vorhersagemodelle + Live-Stationsmessungen), die als
unregelmäßige Punkt-Stichproben vorliegen, und verschmilzt sie zu **einem dichten
Gitterfeld pro Vorhersagestunde**, das als PNG-Textur direkt an die WebGL-Karten-Layer
(Temperatur / Wind / Wolken / Niederschlag) geht. Alles clientseitig, deterministisch,
kein Backend.

## Der Pfad in 6 Schritten

1. **Quellen wählen** (`countryProfiles.ts`) — DE → DWD, AT → GeoSphere AROME/INCA,
   CH → AROME/MeteoSwiss. Gerechnet wird immer über den gemeinsamen DACH-Ausschnitt,
   damit DE/AT/CH stets durchgängig sichtbar sind.

2. **Parallel laden** (`loadFusedForecast.ts`) — alle aktiven Quellen gleichzeitig
   (`Promise.all`), jede einzeln fehlertolerant, 10-min-Cache. Cold-Load = Max- statt
   Summen-Latenz.

3. **Gewichtet einspeisen** — die Kernentscheidung: **Live-Messungen dominieren Stunde 0**
   (Temp-Gewicht 5,0 vs. Modell 1,4), Modelle tragen den Vorhersagehorizont, INCA/AROME
   verbessern die Alpen. Es gibt kein „bestes Modell", nur additive Information.

4. **Räumlich interpolieren** (`spatialInterp.ts`) — IDW (Inverse Distance Weighting) mit
   drei vorberechneten Kernels (Temp / Wind+Wolken / Precip, je eigener Radius + Power) plus
   Barnes-Gauß-Glättung. Die Sample-Positionen sind über alle Stunden konstant → der Kernel
   wird einmal gebaut, pro Stunde werden nur noch die Werte durchgezogen.

5. **Physik draufrechnen**
   - **(a) Höhenkorrektur**: Temperatur auf Meereshöhe reduzieren, interpolieren, dann mit
     der echten DEM-Höhe (Terrarium-Kacheln) je Zelle zurückrechnen → realistische alpine
     Abkühlung. Die Lapse-Rate wird pro Stunde per OLS-Regression + Reliabilitäts-Shrinkage
     geschätzt.
   - **(b) Speed-erhaltende Wind-Korrektur** gegen die Vektor-Auslöschung beim Glätten
     (Betrag wird separat interpoliert und der Vektor darauf re-skaliert, max. 4×).
   - **(c) Temporaler Median** gegen einzelne MOSMIX-Ausreißer-Stunden.

6. **Als PNG kodieren** (`fusionEngine.ts`) — Wind (u/v in R/G), Temperatur (Wert in R,
   DEM-Höhe in G für die Per-Pixel-Shader-Verfeinerung), Wolken (low/mid/high in R/G/B),
   Niederschlag. Sub-Stunden zwischen ganzen Stunden werden per Textur-Lerp interpoliert
   (`frameInterp.ts`) — außer Wind.

## Das eigentlich Clevere daran

- **Stationen als Stunde-0-Anker** + Modelle für die Zukunft in *einem* Feld.
- **Höhenkorrektur ohne Topographie im NWP** — die kommt aus dem separaten DEM.
- **Kernel-Vorberechnung** macht 24 Stunden × 7 Variablen bezahlbar
  (O(Zellen × Nachbarn) statt × alle-Samples).
- **Zwei-Phasen-Laden** (80×64-Vorschau → 160×128-Vollbild) für schnellen Erstpaint.
