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
- [ ] `verdict.ts` rein + Tests (Linsen-Mapping)
- [ ] Verdict-UI (Status-Punkt sage/amber/terracotta) pro Linse
- [ ] „Warum?" über bestehenden LLM-Pfad + Offline-Template-Fallback
- [ ] Verifikation grün

## P4 — Thermik-Terrain-Overlay (Fliegen)
- [ ] MapLibre-Overlay-Layer (green→red), nur Fliegen-Linse, sauberes Unmount
- [ ] Terrain-Tap → Marker → Profil/Verdict neu
- [ ] Perf-Notiz (Desktop + gedrosselt) in architecture.md
- [ ] Verifikation grün

## P5 — Himmel-Cards
- [ ] Sonnenuntergang/Nebelmeer/Optik aus ICON + deutsche Erklärtexte
- [G] Saharastaub-Card — keine Aerosol-Pipeline → ausblenden + STOP-Hinweis
- [ ] Sonnenuntergang/Nebelmeer speisen Verdicts; Degradierungspfade getestet
- [ ] Verifikation grün

## P6 — Föhn
- [ ] 6a Föhn-Index (rein, getestet) + Verdict/Anzeige (ICON-ableitbar)
- [ ] 6b 3D-Isentropen-Querschnitt (MapLibre-Layer) + Scrubber-Animation + 2D-Fallback
- [ ] Verifikation grün (Perf Desktop + gedrosselt)

## P7 — Nerd-Mode + Feinschliff
- [ ] Nerd-Panel (lazy): Skew-T/Log-P, CAPE/CIN, Deckel, rohe Levels, Lauf-Alter
- [ ] Empty/Error/Loading deutsch; A11y-Audit; Breakpoint-Review hoher Charts
- [ ] tests.md vollständig; checklist abgehakt; plan.md erledigt
- [ ] Abschlusszusammenfassung im Chat
