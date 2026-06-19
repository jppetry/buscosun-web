# Buscosun Fusion — Audit & Engine-Verbesserungen (2026-06)

Audit der Punktvorhersage-Pipeline (`src/pointForecast/`, intern „Buscosun Fusion")
und der plattformweiten Nutzung, plus umgesetzte Verbesserungen.

## Audit-Ergebnis (ehrlich)

- **Bereits zentralisiert.** `getPointForecast` ist der kanonische Pfad und wird
  von praktisch allen Punkt-Features genutzt (Event, Go/No-Go, Nowcast-Engine,
  Route Wind+Anreicherung, Assistant, 3D-Schnitt, Notifications, Punkt-Panel,
  Foto/Astro konsumieren). Es gibt **kaum Legacy-Duplikate** des Punktforecasts.
- **Open-Meteo-Nutzungen sind keine Duplikate**, sondern eigenständige Features:
  `confidence/` (5-Modell-Vergleich + Ensemble + Hit-Rate + Verlauf),
  `history/` (ERA5-Archiv), `wind/openMeteoSource` (opt-in Layer), GFS (nur
  3D-Globus). Diese auf Fusion „umzustellen" hieße, sie zu entkernen — daher
  bewusst **nicht** angefasst. `loadFusedForecast` (MapView) ist die Raster-
  Layer-Domäne, kein Punktforecast.
- **Prämisse „durchgehend Nowcast → +14 Tage" traf nicht zu.** DE: MOSMIX bis
  ~10 Tage (nur wenn `hours` hoch angefragt), Default 24 h. AT/CH: **harter
  Schnitt bei 60 h** (nur AROME), weil MOSMIX im Punktforecast für AT/CH nicht
  gezogen wurde. Keine Quelle erreicht echte 14 Tage. Entscheidung des Owners:
  **MOSMIX nativ bis ~10 Tage** (keine rate-limitierte/Default-Open-Meteo-Quelle);
  echtes 14-Tage bleibt bewusst offen (nur via Ensemble/Open-Meteo machbar,
  widerspräche der Default-Regel).
- **Radar-Nowcast war nicht integriert.** RADOLAN-RV floss nicht in
  `getPointForecast`; der `nowcast`-Precip-Gewichtsfaktor war vorbereitet, aber
  kein Radar-Sample wurde eingespeist.
- **Physik-Lücken:** Kaltluftseen/Inversion und Hangexposition fehlten; Föhn
  existiert (nur als Badge), Lapse-Rate solide.

## Umgesetzte Änderungen

1. **Horizont (W1)** — `pointForecast.ts`: MOSMIX wird für **alle** Profile mit
   `useMosmix` (DE/AT/CH) gezogen statt nur DE. Beseitigt den 60-h-Hard-Cut für
   AT/CH; die Zeitachse ist nun in jedem Land bis ~10 Tage durchgehend. Innerhalb
   0–60 h ergänzt MOSMIX einen unabhängigen Konsens-Member neben AROME.

2. **Confidence-Decay (W4)** — `pointForecast.ts` (`SKILL_DECAY`): linearer
   Lead-Faktor → **exponentiell und pro Variable**. Temperatur hält lange
   (τ=160 h), Niederschlag/Bewölkung verlieren schneller (τ=36/60 h). Verhindert
   das frühere Über-Bewerten von Mehrtages-Niederschlag.

3. **DACH-Mikroklima-Physik (W3+W5)** — neu `terrainPhysics.ts`, angewandt als
   beschränkte Post-Blend-Temperaturkorrektur in `getPointForecast`:
   - **Kaltluftsee/Inversion:** nächtliche Abkühlung in Senken (DEM-TPI-Senken-
     tiefe), gegated auf Nacht + windstill (< 2,5 m/s) + gering bewölkt (< 65 %);
     Deckel −3,5 °C.
   - **Hangexposition/Einstrahlung:** Süd-Hang tagsüber wärmer, Nord-Hang kühler
     (Sonnenstand × Hangneigung/-exposition aus DEM-Gradient); Deckel ±1,5 °C.
   - **Doppelzähl-Schutz:** beide Korrekturen werden bei einem ko-lokalisierten
     Stations-Anker auf 35 % gedämpft (die Station misst die Mikrolage bereits).
   - Selbsttest `verifyTerrainPhysics()` (8/8 grün, headless via esbuild verifiziert).

4. **Radar-Nowcast in Fusion (W2)** — `pointForecast.ts`: Option
   `includeRadarNowcast` (Default aus). Modulweit gecachter, positions-
   unabhängiger Sampler (eine Abfrage je Land / ~5 min TTL) speist RADOLAN-RV (DE)
   bzw. rzc (CH) als `nowcast`-Familien-Niederschlag in h0–2 ein → nahtloser
   Nowcast→NWP-Niederschlag. AT bleibt bei INCA (kein Doppelzählen).
   Aktiviert in Punkt-Panel, Event und Go/No-Go; Massen-Aufrufer (Route/3D)
   lassen es aus (Performance). `PF_CACHE`-Key trägt das Radar-Flag, damit ein
   Nicht-Radar-Aufrufer keinen radarlosen Treffer an einen Radar-Aufrufer liefert.

## Nachtrag: 14-Tage-Horizont via GFS (ohne Open-Meteo)

Neuer Adapter `src/pointForecast/gfsPoint.ts` + Einbindung in `getPointForecast`:

- **Quelle GFS** (NOAA, Public Domain, AWS-S3 über `/_gfs`-Proxy), +384 h (16 d).
  Reuse der Globus-GRIB-Infrastruktur (`globe/gfs.ts`: DRT-3-Decoder + `sampleGfs`).
- **Lazy**: nur wenn ein Consumer `hours > 240` anfragt (MOSMIX deckt ~10 Tage).
  GFS füllt mit Overlap ab ~9 Tagen (`GFS_TAIL_FROM_H = 216`) bis ~15,5 Tage.
- Eingespeist als **`global`-Familie** (vorhandene Gewichtskurve) → der Blend +
  per-Variable-Confidence-Decay werten Tag 11–14 automatisch als **Tendenz** ab.
- **Lauf-Wahl**: bewusst ein VOLLSTÄNDIG publizierter Lauf (8/14/20/26 h Vorlauf
  mit Probe des letzten Schritts) — der jüngste Lauf hat f≳300 oft noch nicht.
- **Warum ECMWF NICHT**: empirisch geprüft — ECMWF Open Data liefert clientseitig
  keinen praktikablen 14-Tage-Punkt: HRES (oper) endet bei 240 h; ENS (enfo, 15 d)
  hat nur 50 perturbierte Member (kein Kontroll-/Mittelwert) und nutzt CCSDS/AEC-
  Packing (DRT 42), das der vorhandene Decoder nicht liest. 50-Member-Mittel +
  AEC-Decoder im Browser = unpraktikabel.
- **Runtime-verifiziert** (isolierter Chromium → Vite-Import → echte Abfrage,
  Frankfurt, hours 336): Zeitachse 336 h, Quellen enthalten `gfs`, Schwanz mit
  Temperatur/Wind/Niederschlag gefüllt, Konfidenz bei Lead 312 h ehrlich niedrig
  (Temp 0.27 / Niederschlag 0.15).

**Ehrliche Grenzen GFS-Schwanz:** 1° grob; GFS-Temperatur ohne Höhenkorrektur
(Gitterzelle mittelt Topografie) — auf der Tendenz-Skala vernachlässigbar, aber an
hohen Alpenpunkten potenziell biased. Niederschlag aus 6-h-APCP-Eimern (÷6 → mm/h).
~100 kleine GRIB-Range-Fetches je 14-Tage-Abfrage (selten, opt-in via Horizont).
Kein aktueller Consumer fragt >240 h an — die **Fähigkeit** existiert und ist
verifiziert; ein Feature muss den 14-Tage-Horizont aktiv anfordern, um sie zu nutzen.

## Bewusst NICHT geändert / offene Punkte (ehrlich)
- **confidence/ history/ wind-Layer / 3D-Globus-GFS**: eigenständige Features,
  nicht „dedupliziert".
- **Default-`forecastHours`** (24/60/60) unverändert gelassen — die Engine *kann*
  jetzt überall ~10 Tage, der jeweilige Consumer bestimmt den angefragten Horizont
  (z. B. Event 7 Tage). Hover-Panel-Default nicht erhöht (Payload/Perf).
- **Terrain-Korrektur** läuft im Kern für alle Consumer (nutzt bereits geladenes
  DEM, billig), ist aber für flache Nicht-Senken-Punkte per Gate ein No-op.

## Verifikation

- `npx tsc -b --noEmit` grün.
- `verifyTerrainPhysics()` 8/8 (headless ausgeführt).
- Bestehende `verifyAnchorQC()` unverändert gültig (W4 ist bei h=0 identisch zum
  alten linearen Faktor → kein Regress).
