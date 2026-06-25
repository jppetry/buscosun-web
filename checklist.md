# checklist.md — Atmosphäre

Legende: [ ] offen · [~] in Arbeit · [x] erledigt (grün verifiziert) · [G] Entscheidungs-Gate

## P0 — Diagnose + Doku
- [x] Design-System inventarisiert (context.md)
- [x] Bestehende Features kartiert (context.md / architecture.md)
- [x] Reusable vs New + Risiken/Abweichungen (context.md)
- [x] plan.md + checklist.md angelegt; CLAUDE.md-Leitplanken

## P1 — Shell
- [x] Feature-Ordner `src/atmosphere/` nach bestehender Struktur
- [x] Routing-Eintrag (`FeatureId 'atmosphere'`, Hash `#atm=`) + Startseiten-Kachel
- [x] Linsen-Umschalter (Fliegen/Berg&Weg/Himmel), Segmented-Control-Muster
- [x] 3 Tiefen-Struktur (Verdict / Profil / Nerd) als Platzhalter
- [x] Globaler Time-Scrubber +0..+48 h, 1-h-Schritte, „jetzt"-Tick
- [x] `activeHour`-Store/Context (Single Source of Truth) + URL/localStorage-Sync
- [x] 3 Breakpoint-Layouts (Desktop/Tablet hoch+quer/Mobile), sticky Scrubber
- [x] A11y: Tastatur + deutsche ARIA-Labels (role=tablist, slider aria-valuetext de)
- [x] Verifikation grün: typecheck+build; DevTools Desktop/Tablet-quer/Mobile +
      Lens/Scrubber-Propagation + Permalink. Hinweis: Tablet-Hochformat-Viewport im
      Headless-Emulator nicht herstellbar (innerH ~769 gecappt) — gleiche Single-
      Column-Mechanik wie Mobile, orientation-Query via matchMedia bestätigt.

## P2 — Vertikalprofil
- [x] `profile-derivations.ts` rein + Selbsttest 11/11 (stabil/Thermik/Deckel/blau/Wind)
- [x] SVG-Profil (Meter, linear, 0–4000 m Cap + „ganze Höhe"): T/Td/Parcel,
      Grenzschicht-/Thermikbalken, Wolken-/Inversionsbänder, Nullgradgrenze,
      Höhenwind, Terrain-Bodenbox
- [x] Quelle ICON-EU-Sounding (bestehende Pipeline) + soundingMath; DEM-Anker
- [x] An `activeHour` + Marker gekoppelt; debounced Refetch; Lade-/Fehler-States
- [x] Scrubber-Zeit am Modelllauf verankert (valid = Lauf + Vorlaufstunde) →
      Uhrzeit == Daten-Gültigzeit; Modelllauf im Header
- [x] Verifikation grün: typecheck+build; Live-ICON-EU-Render (Innsbruck),
      Scrub→Refetch aktualisiert Gültigzeit, 11/11 Derivation-Tests

## P3 — Verdict + LLM-„Warum?"
- [x] `verdict.ts` rein + Selbsttest 10/10 (Fliegen gut/windig/flach, Berg
      Inversion/klar/Wolke, Himmel trüb, Grounding-Block, Template-Fallback)
- [x] Verdict-UI (Status-Punkt sage/amber/terracotta) pro Linse; geteiltes
      store.profile → Linsenwechsel rechnet ohne Refetch neu
- [x] „Warum?" über BESTEHENDEN Assistant-Pfad (useWeatherDescriber/describe,
      neues phenomenon 'atmosphere' + Physik-Anker) + Offline-Template-Fallback
- [x] Verifikation grün: typecheck+build; Live-Render (Fliegen→„Kaum Thermik"
      terracotta, Berg→„Klare Bergsicht" sage), Linsenwechsel ohne Refetch, 10/10
      Tests. Hinweis: Live-LLM + In-UI-Fallback nicht ausführbar — Headless meldet
      WebGPU (Adapter+shader-f16), „Warum?" würde 2,6-GB-Download starten (bewusst
      nicht geklickt); Pfad ist der erprobte AssistantPage-Pfad, Fallback rein/getestet.

## P4 — Thermik-Terrain-Overlay (Fliegen)
- [x] `thermalField.ts` rein + Selbsttest 7/7 (Thermik>0 durchmischt, tief≥hoch,
      stabil schwach, Farbe/Transparenz, Bild-Spiegelung)
- [x] MapLibre-Karte (Terrarium raster-dem + setTerrain) NUR Fliegen-Linse;
      Thermik-Overlay als Raster-ImageSource aus EINEM ICON-EU-Profil + Flächen-DEM
      (sage→amber→terracotta, schwach=transparent); sauberes Unmount beim Linsenwechsel
- [x] Terrain-Tap → setMarker (Muster wie TerrainMap) → Profil/Verdict neu
- [x] Verifikation grün: typecheck+build; 7/7 Tests; Live Innsbruck — Overlay
      transparent (stabiler Abend) → farbig (labiler Nachmittag, „Gute Thermik
      2584 m"), Scrub aktualisiert Overlay, Unmount sauber, keine Konsolen-Errors
- [~] Perf: Overlay = 160×120 CPU-Raster (trivial), eine Karteninstanz, kein
      Custom-GL-Layer; keine formale gedrosselte Frame-Trace gefahren (Headless),
      kein Jank/Errors beobachtet → in architecture.md vermerkt

## P5 — Himmel-Cards
- [x] `skyCards.ts` rein + Selbsttest 8/8 (Sonnenuntergang poor/good/fair,
      Nebelmeer good/fair/none, Optik good/none)
- [x] Sonnenuntergang/Nebelmeer/Optik aus ICON-EU-Wolkenstruktur + deutsche,
      probabilistische Texte; Cards degradieren einzeln (none-Zustand)
- [G] Saharastaub-Card AUSGEBLENDET — keine Aerosol-/Staub-Pipeline im Repo
      (Entscheidungs-Gate); ehrlicher Hinweis in der UI (DUST_NOTE)
- [x] Sonnenuntergang + Nebelmeer speisen das Himmel-Verdict (skyVerdict nutzt
      sunsetCard/fogSeaCard)
- [x] Verifikation grün: typecheck+build; 8/8 Tests; Live Innsbruck/Himmel —
      3 Cards + Staub-Hinweis, Verdict aus Sonnenuntergang-Signal, keine Errors

## P6 — Föhn
- [x] 6a Föhn-Index (`foehn.ts`, rein, Selbsttest 5/5) + `FoehnPanel` (Berg-&-Weg)
- [G] 6a Cross-Barrier-Druckdifferenz AUSGELASSEN — kein Stationsdruck-Ingest
      (Gate); Hinweis PRESSURE_GATE_NOTE; Index aus ICON-EU-Höhenwind + Trockenheit
- [x] 6a Verifikation grün: typecheck+build; 5/5 Tests; Live „Kein Föhn" + Hinweis
- [x] 6b 2D-Isentropen-Querschnitt (statt 3D-WebGL-Curtain, per Freigabe):
      `isentropes.ts` rein + Selbsttest 6/6 (θ↑ mit Höhe, flach≈horizontal,
      Föhn-Absinken im Lee, Bereichs-Clamping). `FoehnCrossSection` legt N–S-Schnitt
      via bestehendem prepareCrossSection, zeichnet θ-Isentropen als SVG, folgt dem
      Scrubber (Zeit-Slice ohne Refetch). Ehrlich: θ aus heuristischem Schnitt.
- [x] 6b Verifikation grün: typecheck+build; 6/6 Tests; Live Innsbruck/Berg —
      Isentropen (312–324 K) + Gelände, keine Errors. (3D-WebGL-Curtain bewusst
      nicht gebaut — Duplikat von threed/CurtainLayer; 2D ist das Paket-Fallback.)

## P7 — Nerd-Mode + Feinschliff
- [x] Nerd-Panel **lazy** (`React.lazy` → eigener Chunk `NerdPanel-*.js` ~2,6 kB,
      nicht im Standard-Bundle): Skew-T/Log-P (reused `threed/SkewTChart`), CAPE/CIN/
      LCL/LFC/EL/LI, Deckelinversions-Stärke (dünn <200 m markiert), rohe ICON-EU-
      Level-Tabelle (hPa/m/T/Td/Wind), Lauf-Alter
- [x] Feinschliff: Lauf-Alter im Header („vor X h"); Empty/Error/Loading deutsch in
      allen Loadern; Unsicherheit/Lauf-Alter überall (Profil/Verdict/Sky/Föhn/Nerd);
      A11y (role=tablist, slider aria-valuetext, aria-expanded, SVG aria-label)
- [x] Verifikation grün: typecheck+build (Lazy-Chunk bestätigt); Live Desktop +
      Mobile (390) — Skew-T + Indizes + Roh-Tabelle + Lauf-Alter, keine Errors
- [x] tests.md aktuell; checklist abgehakt; plan.md erledigt; Abschluss im Chat
