# architecture.md — Atmosphäre (P0)

## Aktuelle Architekturkarte (relevant)

```
App.tsx  (FeatureId-Union + Hash-Router: #3d= #g= #h= #ev #m= #val)
 ├─ SearchPage           Startseite + Feature-Kacheln
 ├─ MapView              2D-MapLibre-Karte
 ├─ threed/ThreeDPage    3D-Schnitt/Gelände (MapLibre CurtainLayer)
 ├─ globe/GlobePage      Globus (MapLibre globe + WindLayer + GFS-Worker)
 ├─ assistant/Assistant  Browser-LLM-Meteorologe (web-llm, WebGPU)
 └─ … route/event/nowcast/confidence/history/validation

Daten:
  getPointForecast (pointForecast/*)  ← MOSMIX/AROME/INCA/Radar-Blend
  loadElevationLookup (fusion/elevation.ts) ← Mapzen-Terrarium-DEM
  buildCrossSection/sectionAtTime (threed/*) ← DEM + Anker-Forecast → Höhen-Grid
  crossSection.ts ← Vertikalstruktur heuristisch (Potenzgesetz, Inversion, LCL)
  iconEuSounding.fetchSoundingAtPoint ← echte Druckflächen (7 km, 10 Levels)
  soundingMath.ts ← CAPE/CIN/LCL/LFC/EL
  fetchMultiModelForecast (confidence/*) ← Modell-Spread

LLM:
  assistant/engine.ts (WebWorker MLC) · prompt.ts · grounding.ts · weatherFacts.ts
```

## Wo Atmosphäre andockt

```
App.tsx
 └─ atmosphere/AtmospherePage.tsx        (FeatureId 'atmosphere', Hash #atm=)
     ├─ store/atmosphereStore.ts          activeHour (Single Source of Truth) +
     │                                     Linse (Fliegen|Berg&Weg|Himmel) + Tiefe
     ├─ AtmosphereGlobe/Terrain            erweitert MapLibre-Layer (CurtainLayer/
     │                                     WindLayer); Marker = Profil-Position
     ├─ profile/VerticalProfile.tsx        SVG, Meter/lineare Achse, 0–4000 m Cap
     │   └─ profile-derivations.ts         REIN, getestet (Grenzschicht, Wolkenbasis,
     │                                     Nullgrad, Inversion, Thermik)  ← speist Verdict
     ├─ verdict/verdict.ts (+ UI)          REIN, getestet; „Warum?" über bestehenden
     │                                     LLM-Pfad (grounding + engine), Fallback-Template
     ├─ sky/ (P5 Cards)                    Sonnenuntergang/Nebelmeer/Optik (ICON);
     │                                     Staub = Gate (ausgeblendet, keine Pipeline)
     ├─ foehn/ (P6)                        Index (rein, getestet) + 3D-Isentropen-Ebene
     │                                     (MapLibre-Layer, nicht Three.js)
     ├─ nerd/ (P7, lazy)                   Skew-T/Log-P, CAPE/CIN, rohe Levels
     └─ atmosphereState.ts                 Hash-Codec #atm= (Muster threedState.ts)
```

**Datenquellen (ausschließlich bestehende Pipelines):**
- Oberfläche/Anker: `getPointForecast`
- Vertikalprofil: `iconEuSounding` (+ `soundingMath`) als primäre vertikale Quelle;
  abgeleiteter Schnitt `buildCrossSection`/`crossSection` für Höhen-Grid/Overlay
- Terrain: `loadElevationLookup`
- Modell-Spread: `fetchMultiModelForecast`
- Erklärung: `assistant/*` (LLM erklärt, rechnet nie)

**Perf-Notizen (werden in P4/P6b ergänzt):** Frame-Timing vorher/nachher via Chrome-
DevTools-MCP; Layer mounten pro Linse, sauberes Unmount; Mobile/Tablet-Fallback.
