# plan.md — Atmosphäre

> Grober Phasenplan. Prinzip: bestehendes v1.8-Design + bestehende Pipelines
> adoptieren und erweitern; nichts neu auf der grünen Wiese. Auto-Fortschritt bei
> grüner Verifikation; STOP nur bei rotem Check oder einem der drei Entscheidungs-Gates.

## Dokumentierte Abweichungen von den Prompt-Annahmen (aus P0)
- **D1:** 3D via **MapLibre Custom-WebGL-Layer**, nicht Three.js/WebGPU (Leitplanken
  verbieten paralleles System). P4/P6b adaptiert.
- **D2:** Vertikalquelle = **ICON-EU-Sounding** (7 km, 10 Levels, +48 h) + abgeleiteter
  3D-Schnitt, da native ICON-D2-Druckflächen in keiner Pipeline vorliegen. Kein STOP
  (Daten aus bestehender Pipeline). Auflösung/Alter ehrlich kennzeichnen.
- **D3:** Saharastaub-Card in P5 = Entscheidungs-Gate (keine Aerosol-Pipeline) → ausblenden.
- **D4:** Föhn ohne Cross-Barrier-Stationsdruck → ICON-ableitbare Indikatoren.

## Phasen
- **P0 — Diagnose + Doku.** ✅ context.md / architecture.md / plan.md / checklist.md.
- **P1 — Shell:** Linsen-Umschalter (Fliegen/Berg&Weg/Himmel), 3 Tiefen (Verdict/
  Profil/Nerd), globaler Time-Scrubber (+0..+48 h), 3 Breakpoint-Layouts, geteilter
  `activeHour`-Store + URL/localStorage-Sync. Nur Platzhalter, keine Datenlogik.
- **P2 — Vertikalprofil:** `profile-derivations.ts` (rein, getestet) + SVG-Profil
  (Meter, lineare Achse, 0–4000 m Cap + „ganze Höhe"). Quelle: ICON-EU-Sounding +
  Schnitt. Abonniert `activeHour` + Marker.
- **P3 — Verdict (Tiefe 1) + LLM-„Warum?":** `verdict.ts` (rein, getestet) pro Linse;
  Erklärung über bestehenden LLM-Pfad mit getemplatetem Offline-Fallback.
- **P4 — Thermik-Terrain-Overlay (Fliegen):** MapLibre-Layer (green→red Bänder),
  Terrain-Tap → Marker. Perf-Budget via Chrome-DevTools (Desktop + gedrosselt).
- **P5 — Himmel-Cards:** Sonnenuntergang/Nebelmeer/Optik aus ICON; **Staub = Gate**.
- **P6 — Föhn:** 6a Index (rein, getestet) + Anzeige; 6b 3D-Isentropen-Ebene (MapLibre).
- **P7 — Nerd-Mode (lazy) + Feinschliff:** Skew-T/Log-P, CAPE/CIN, rohe Levels, Lauf-
  Alter/Unsicherheit überall; A11y + alle Breakpoints; Abschlusszusammenfassung.

## Verifikation pro Phase
Statische Gates (`npm run typecheck` + `npm run build`; Unit-Tests wo vorhanden) →
Context7 (API-Konsistenz MapLibre 5.6 / web-llm) → Chrome-DevTools (Laufzeit, 3
Breakpoints, Perf) → atomarer Commit + checklist.md. Lint-Skript existiert nicht;
`typecheck` ist das statische Gate.
