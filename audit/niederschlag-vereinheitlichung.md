# audit/niederschlag-vereinheitlichung.md — Konsolidierungs-Phase N1: Eine Niederschlags-Ansicht (Radar↔Modell, 0–12 h)

**Maßgebliche Vorgabe für die Umsetzung (via Claude-Code-CLI).** Die Punkte in `plan.md`/`checklist.md` sind die Kurzfassung; diese Datei ist verbindlich.

> **Scope-Hinweis / Jans Freigabe:** Konsolidierung/Refactor + Stilllegung des SIM-Radar-Layers, von Jan beauftragt. **Design-Entscheidung Jan (2026-07-24): die 2–12-h-Modellhälfte bleibt der bestehende Fusion-/Modell-Niederschlag (mm/h)** — *nicht* die dbz_cmax-Reflektivität. Diagnose-First + harte Regeln aus `CLAUDE.md` gelten. Berührt Radar-Pipeline + Fusion-**Verdrahtung** (nicht die Fusion-**Logik**) + löscht eine Komponente (SIM-Radar) — beides ausdrücklich von Jan autorisiert.

---

## §0 Kernbefund der Diagnose — der Blend existiert bereits

Der bestehende **`nowcast`-Layer macht den Radar→Modell-Übergang schon heute** — er wird nicht neu gebaut, sondern konsolidiert:
- **0–2 h gemessenes Radar/Nowcast, per Land:** DE RADOLAN-RV (`nowcastRef`), AT GeoSphere INCA ≤3 h (`incaGridRef`), CH MeteoSchweiz rzc (`meteoRadarRef`) — gerendert über `RainLayer` (`NOWCAST_LAYER_ID`), Quelle: `precipFrameReady(hour)` ([MapView.tsx:724](../src/MapView.tsx#L724)).
- **>2 h Modell:** `precip-forecast`-`ScalarLayer`, gespeist von der **Fusion-Engine** (`fusionActiveFor('nowcast')`, [:2317](../src/MapView.tsx#L2317)) — per-Land beste Quelle über den bestehenden Model-Switcher (DE ICON-D2, AT AROME/INCA, CH ICON-CH).
- **Gemeinsame Palette:** beide nutzen bereits `precipRainRamp`.
- **Umschaltung heute:** verstreut über `precipFrameReady()` + Sichtbarkeits-Booleans ([:1129/1132](../src/MapView.tsx#L1129)).

**SIM-Radar (`simradar`, dbz_cmax)** ist ein **separater** Layer (F3, implementiert). Mit Jans Entscheidung (Fusion-mm/h für 2–12 h) wird `dbz_cmax` **nicht** die Modellhälfte → **SIM-Radar wird stillgelegt** (§5).

**Fazit:** Die Aufgabe ist **nicht** „Blend bauen", sondern (1) die verstreute Quellenwahl in **eine saubere `PrecipSource`-Abstraktion** heben, (2) SIM-Radar entfernen, (3) auf saubere 0–12-h-Abdeckung + nahtlosen Seam vereinheitlichen, (4) Doku.

---

## §1 Ziel

Eine einzige Ansicht **„Niederschlag"** über den Zeit-Slider **jetzt … +12 h**, bei der der Nutzer nie zwischen Radar und Modell wählt und den Quellenwechsel nicht bemerkt. Die UI arbeitet nur noch gegen **eine** gemeinsame Niederschlagsquelle und kennt „Radar" vs. „Modell" nicht mehr.

- **0–2 h:** ausschließlich Radar/Nowcast (bestehend, per Land).
- **2–12 h:** Fusion-/Modell-Niederschlag (mm/h, per Land beste Quelle — **Fusion-Logik unverändert**).
- **Einheitliche Farbskala + Legende** über den gesamten Zeitraum (`precipRainRamp`, bereits gegeben).

---

## §2 Ist-Architektur (Diagnose, vor Code)

| Zeitfenster | Land | Quelle | Renderer | Auswahl heute |
|---|---|---|---|---|
| 0–2 h | DE | RADOLAN-RV (`nowcastRef`) | `RainLayer` `NOWCAST_LAYER_ID` | `precipFrameReady` + Visibility-Bool |
| 0–3 h | AT | GeoSphere INCA (`incaGridRef`) | `RainLayer` | `precipFrameReady` |
| ~0 h | CH | MeteoSchweiz rzc (`meteoRadarRef`) | `RainLayer` | `precipFrameReady` |
| 2–12 h | DACH | Fusion-Modell-Niederschlag | `precip-forecast` `ScalarLayer` | `fusionActiveFor('nowcast')` |

**Nicht Teil dieser Phase (bleiben eigene Layer):** `flownowcast` (Optical-Flow-Extrapolation), `poprob` (Regenwahrscheinlichkeit) — eigenständige DE-Produkte, **unverändert**.

---

## §3 Ziel-Architektur — die `PrecipSource`-Abstraktion

**Neues Modul `src/nowcast/precipSource.ts`** (reine, testbare Logik) kapselt die gesamte Quellenwahl:

```ts
export type PrecipSourceKind = 'radar' | 'model';
export interface PrecipAvailability {
  radarDE: boolean; radarAT: boolean; radarCH: boolean;   // Landesradar-Frames geladen?
  modelHorizonH: number | null;                            // Fusion/Modell-Horizont (h ab jetzt)
}
export interface PrecipResolution {
  kind: PrecipSourceKind;      // 'radar' (0–2 h) | 'model' (2–12 h)
  seamBlend?: number;          // 0..1 optionaler Crossfade nahe dem Seam (~1,5–2,5 h)
}
/** EINZIGE Stelle, die entscheidet, welche Quelle die gegebene Slider-Stunde speist. */
export function resolvePrecipSource(hour: number, country: Country, avail: PrecipAvailability): PrecipResolution;
```

- Zieht die heutige `precipFrameReady`-Logik + die Radar↔Modell-Visibility-Entscheidung an **eine** Stelle zusammen.
- Die MapView-Sichtbarkeit von `NOWCAST_LAYER_ID` (Radar-`RainLayer`) vs. `precip-forecast` (Modell-`ScalarLayer`) wird **ausschließlich** aus `resolvePrecipSource(...)` abgeleitet — keine verstreuten Booleans mehr.
- **Nahtstelle (~2 h):** Palette ist identisch (`precipRainRamp`); zusätzlich ein kurzer Overlap/Crossfade (`seamBlend`) über ~1,5–2,5 h, damit kein harter Pop entsteht. **Keine Lücke:** ist der erste Modell-Frame noch nicht da, hält die Ansicht das letzte Radar bzw. zeigt den bestehenden Lade-Indikator (nie leer).
- **Renderer-Reuse:** beide Renderer (`RainLayer` für Radar-Quads, `ScalarLayer` für das Modell-Grid) bleiben; die Abstraktion koordiniert nur ihre Sichtbarkeit/Blend. **Kein neuer Renderer.**
- **UI-Entkopplung:** Timeline/Slider spannt 0–12 h und spricht nur `resolvePrecipSource`/den `nowcast`-Layer an — **keine** Radar-/Modell-Kenntnis in der UI.
- Headless-testbar → `verifyPrecipSource()` + `scripts/verify-precip-source.mjs` (Node strip-types, kein Vitest): Seam bei 2 h, per-Land-Horizonte, Lücken-/Fallback-Fälle.

---

## §4 Datenfluss (Ziel)

```
Slider-Stunde h ─▶ resolvePrecipSource(h, country, availability)
                     ├─ h ≤ ~2 h & Landesradar da ─▶ kind='radar' ─▶ RainLayer (RADOLAN-RV / INCA / rzc)
                     └─ sonst (bis Modell-Horizont) ─▶ kind='model' ─▶ ScalarLayer (Fusion-Niederschlag mm/h, per Land)
                     └─ nahe Seam ─▶ seamBlend für weichen Crossfade
```
Datenquellen unverändert geladen (bestehende Loader): `installNowcast` (RADOLAN/INCA/rzc) + der zentrale Fusion-Effekt (`precip-forecast`). **Diese Phase ändert keine Loader-/Decode-/Fusion-Logik**, nur die *Auswahl-/Sichtbarkeits-Schicht*.

---

## §5 SIM-Radar-Stilllegung (alle Seams — von Jan autorisiert)

`simradar`/`dbz_cmax` entfällt, da die 2–12-h-Hälfte der Fusion-Niederschlag bleibt. Zu entfernende Anschlusspunkte in `src/MapView.tsx` (Stand Diagnose):
- Import `fetchIconD2Dbz`/`IconD2Dbz` (:58); Konstante `SIMRADAR_LAYER_ID` (:265).
- `LayerKey`-Union `'simradar'` (:305); `LAYER_OPTIONS`-Eintrag (:340); `statuses`-Init (:442).
- `layerRefs`-Feld (:580, :1057); `iconD2SimRadarRef`/`installSimRadarRef` (:642–643).
- Layer-Erzeugung `simRadarLayer` (~:985); Sichtbarkeit (:1124, :2847).
- `installSimRadar` (:1705–1719); Refresh-Job (:1868); Lazy-Effekt (:1971); Zeit-Interp-Effekt (:2572–2582).
- Legenden-Block/Render (:3362, :3385); Deck-Eintrag (:3945).
- **Datei `src/sources/iconD2Dbz.ts`** und der Deck-/LayerIcon-/LayerInfoPanel-Bezug: entfernen **oder** dokumentiert parken. Empfehlung: entfernen (sauber, modular). `radarModel.ts` bleibt (nur von SIM-Radar *gelesen*, weiter für Regenradar genutzt).
- **F3-Doku** (`audit/simuliertes-radar.md`, plan/checklist/tests GF3) als „stillgelegt zugunsten N1" markieren, nicht löschen (Historie).

---

## §6 Umzusetzende Maßnahmen (N1-1 … N1-7)

- **N1-1** `src/nowcast/precipSource.ts`: `resolvePrecipSource` + Typen (§3), extrahiert aus `precipFrameReady` + der Radar/Modell-Visibility-Logik; reine Funktion.
- **N1-2** `scripts/verify-precip-source.mjs` (Node strip-types): Seam@2h, per-Land-Horizonte, Lücken-/Fallback-Fälle, Crossfade-Monotonie.
- **N1-3** `MapView.tsx`: Sichtbarkeit von `NOWCAST_LAYER_ID` ↔ `precip-forecast` **ausschließlich** aus `resolvePrecipSource` ableiten; `precipFrameReady` durch die Abstraktion ersetzen/dahinter kapseln (kein Verhaltensbruch für DE/AT/CH).
- **N1-4** Seam-Crossfade (`seamBlend`) + Lücken-Sicherung (nie leer am Übergang); Timeline garantiert volle **0–12 h** (auch im `START_NOW_ONLY`-Testmodus die volle Spanne für Niederschlag).
- **N1-5** SIM-Radar vollständig entfernen (§5); `LAYER_OPTIONS`/Legende/Deck bereinigen.
- **N1-6** Label/Tooltip des `nowcast`-Layers auf „Niederschlag · jetzt–12 h (Radar → Modell, nahtlos)" aktualisieren; keine „Radar/Modell"-Wahl mehr in der UI.
- **N1-7** Doku (§8): README/Projektdoku um Architektur, Datenfluss, Quellen, Umschaltlogik, 0–12-h-Abdeckung.

---

## §7 Abgrenzung / harte Regeln

- **Fusion-Engine-LOGIK unangetastet.** Nur die *Verdrahtung/Sichtbarkeit* (welcher fertige Layer wann sichtbar ist) wird zentralisiert. `src/fusion/*` wird **nicht** geändert. Falls die Konsolidierung doch einen Eingriff in die Fusion-*Berechnung* nahelegt → **STOPP & FRAGEN**.
- **Renderer-Reuse:** `RainLayer` + `ScalarLayer` bleiben; kein neuer Renderer, keine Shader-/RGBA8-Änderung.
- **Erhalt:** `flownowcast`, `poprob`, Model-Switcher DE/AT/CH, Fusion⇄Native-Toggle, alle anderen Layer — **funktional unverändert**.
- **SIM-Radar-Löschung** ist ein `CLAUDE.md`-STOPP-Punkt („Löschen von Komponenten") — hier durch Jans expliziten Auftrag („ersetzt durch gemeinsame Ansicht") autorisiert.
- **Desktop-Regression:** keine sichtbare Änderung außer: SIM-Radar-Toggle weg, `nowcast` reicht sauber bis 12 h, Label „Niederschlag". Ansonsten pixelgleich.
- **Output-Identität:** Für jede Slider-Stunde muss die zusammengeführte Ansicht **dasselbe** rendern wie heute der jeweils zuständige Layer (Radar 0–2 h, Fusion 2–12 h) — nur ohne separaten SIM-Radar und ohne verstreute Logik.

---

## §8 Dokumentation (N1-7)

README bzw. Projektdoku (z. B. `docs/niederschlag-architektur.md` + Verweis in README) beschreibt:
- **Architektur:** `PrecipSource`-Abstraktion, `RainLayer`/`ScalarLayer`-Renderer, MapView-Verdrahtung.
- **Datenfluss:** §4-Diagramm.
- **Quellen:** DE RADOLAN-RV / AT INCA / CH rzc (0–2 h) · Fusion-Modell-Niederschlag per Land (2–12 h).
- **Umschaltlogik:** `resolvePrecipSource` inkl. Seam@2h + Crossfade + Lücken-Fallback.
- **Zeitliche Abdeckung:** jetzt … +12 h, nahtlos.

---

## §9 Verify (→ `tests.md` V-NIEDERSCHLAG)

1. **Abstraktions-Harness:** `node scripts/verify-precip-source.mjs` grün (Seam@2h, per-Land, Lücke/Fallback, Crossfade).
2. **Nahtloser Slider:** langsames Ziehen 0→12 h → an keiner Stelle Leer-/Pop-/Doppel-Frame; Seam ~2 h optisch weich (Palette identisch, Crossfade greift). Beleg: Screenshots bei 1 h / 2 h / 3 h / 6 h / 12 h je DE/AT/CH.
3. **Output-Identität:** je Stichprobenstunde rendert die zusammengeführte Ansicht identisch zum heutigen zuständigen Layer (Radar 0–2 h / Fusion 2–12 h). Beleg: Vorher/Nachher-Screenshots.
4. **SIM-Radar weg:** kein `simradar`-Toggle/-Legende/-Deck-Eintrag mehr; `git grep simradar` in `src/` leer (bzw. nur Historie in `audit/`); keine toten Imports; `dwdLightning`/`radarModel`/Regenradar-Feature unberührt.
5. **Erhalt:** `flownowcast`, `poprob`, Model-Switcher DE/AT/CH, Fusion⇄Native, übrige Layer voll funktionsfähig (Stichprobe).
6. **UI-Entkopplung:** Timeline/UI referenziert keine Radar-/Modell-Unterscheidung mehr (nur `nowcast`/`resolvePrecipSource`).
7. **Doku:** README/Projektdoku (§8) aktualisiert und korrekt.
8. **Konsole/Typecheck/Mobile:** keine neuen Fehler; `npm run typecheck` grün; `nowcast`-Toggle + Slider auf 390×844 sauber; Desktop pixelgleich (außer den gewollten Änderungen).

**Gate GN1:** Abstraktion grün + zentral · Slider 0–12 h nahtlos (Seam weich, keine Lücke) · Output-Identität belegt · SIM-Radar restlos entfernt · Fusion-Logik/`flownowcast`/`poprob`/Model-Switcher unverändert · UI ohne Radar/Modell-Kenntnis · Doku aktualisiert · Konsole/Typecheck grün · Desktop bis auf gewollte Änderungen unverändert.

---

## §10 Umsetzungs-Diagnose (Code-Lesung vor Implementierung, 2026-07-24)

Präzisierung von §0 nach vollständiger Lesung des Render-Pfads — wichtig, damit die
Output-Identität nicht durch eine falsche Modellvorstellung bricht:

- **Der 2-h-Radar→Modell-Seam liegt bereits IM Komposit**, nicht zwischen zwei Layern.
  Der `PrecipCompositor.build(h, {rv,inca,rzc,d2})` ([precipComposite.ts:196](../src/scalar/precipComposite.ts#L196))
  mischt **pro Karten-Zelle**: DE-Fläche nutzt RADOLAN, solange `h ≤ RV_MAX_H (2)` und ein
  gültiger Quell-Index existiert, sonst fällt die Zelle auf **ICON-D2** (`d2`); AT bis 3 h
  (INCA), CH bis 0,5 h (rzc). Der Seam ist also ein **per-Zelle-Fallback bei identischer
  Palette** → farblich stetig, nie leer, wo `d2` existiert. **Diese Blend-Logik wird NICHT
  angefasst** („do not rebuild the blend").
- **Es gibt ZWEI sich ausschließende Render-Pfade für `nowcast`, gewählt über den
  Fusion⇄Native-Schalter** (`fusionActiveFor('nowcast')`) — **nicht** über die Stunde:
  1. **Native** (`!fusionActiveFor`): der `RainLayer` (`NOWCAST_LAYER_ID`) zeigt das
     Komposit (Radar 0–2 h **+ ICON-D2 >2 h** in EINEM Layer). Sichtbar gegated durch
     `precipFrameReady(forecastHour)`.
  2. **Fusion** (`fusionActiveFor`): der `precip-forecast`-`ScalarLayer` zeigt den
     Fusions-Niederschlag über **0–12 h** (inkl. „jetzt"); `RainLayer` ist dann aus.
  → Die RainLayer↔precip-forecast-**Layer-Wahl ist die Modellquellen-Achse (Fusion/Native)**
    und bleibt erhalten. Die **Stunden-abhängige** Radar↔Modell-Entscheidung + die
    Frame-Verfügbarkeit (`precipFrameReady`) sind das, was `resolvePrecipSource` zentralisiert.
- **Konsequenz für N1-3 (Output-Identität byte-genau):** `resolvePrecipSource` ist die
  **einzige** Stelle für (a) die Frame-Verfügbarkeit (ersetzt `precipFrameReady`, DACH-Komposit =
  OR über DE/AT/CH — arithmetisch identisch zu heute) und (b) die Seam-Semantik (`kind`,
  `seamBlend`, Lücken-Fallback) für Harness + Doku. Die Sichtbarkeits-Booleans lesen `ready`
  aus dem Resolver statt aus `precipFrameReady`; die Fusion-Toggle-Terme bleiben unverändert
  → keine sichtbare Verhaltensänderung. Der weiche Seam ist durch das palette-stetige Komposit
  bereits gegeben; `seamBlend` wird als geprüfte Metadaten mitgeführt (kein Opazitäts-Crossfade
  in den Live-Layern, der die Output-Identität an den Stichprobenstunden brechen würde).
- **SIM-Radar** (`simradar`/`iconD2Dbz`) ist ein davon **unabhängiger** ScalarLayer und wird
  restlos entfernt (§5). `radarModel.ts` (`dbzToMmh`/`mmhToDbz`) bleibt — es speist weiter das
  **Regenradar**-Feature (`expertDbz`-Umschalter in `NowcastRadarMap`/`PointStrip`), NICHT den
  gelöschten Layer.

---

## §11 Revision (Jan, 2026-07-24): „auf 2 h verkürzen" — Modellhälfte raus

Nach der ersten Umsetzung (0–12 h, Radar → Modell nahtlos) hat Jan die Ansicht **verkürzt**:
Die Niederschlags-Ansicht zeigt **nur die gemessene Radar-/Nowcast-Hälfte**, per Land bis zum
Nowcast-Horizont (**DE ≤2 h RADOLAN-RV · AT ≤3 h INCA · CH <0,5 h rzc**). Die **Modell-/
Fusionshälfte (2–12 h)** — sowohl die ICON-D2-Verlängerung im Kompositor als auch der Fusions-
`precip-forecast` — ist **draußen**. Begründung: kürzer & ehrlicher (gemessenes Radar statt
Modell-Extrapolation).

Umsetzungs-Delta gegenüber §3/§4/§6:
- `precipSource.ts` ist jetzt **radar-only**: `resolvePrecipSource` → `{kind:'radar', ready}`;
  jenseits des Land-Horizonts `ready:false` (Layer aus). Kein `seamBlend`/`hold`/`modelHorizonH`
  mehr; neu: `precipRadarHorizonHours` (Slider-Obergrenze = max geladener Radar-Horizont).
- `MapView`: Kompositor wird **ohne `d2`** aufgerufen; `NOWCAST_LAYER_ID` ist die **einzige**
  Precip-Quelle (auch im Fusion-Modus), `precip-forecast` ist fest `false`. `sliderMax` nutzt für
  Niederschlag `precipRadarHorizonHours` (≤3 h) statt des ICON-D2-12-h-Horizonts.
- Label/Tooltip/Deck/Info-Panel: **„Niederschlag · jetzt–2 h"**.
- `iconD2Ref`/`installIconD2` bleiben geladen (speisen weiter die **`confidence`-PoP-Heuristik**
  für AT/CH), werden aber nicht mehr in den Niederschlag gerendert.
- Fusion⇄Native bleibt für Temp/Wind/Wolken erhalten; auf den Niederschlag wirkt es nicht mehr
  (keine Modellhälfte). SIM-Radar-Stilllegung (§5) unverändert gültig.

Die §9-Verify-Punkte gelten sinngemäß mit „bis Nowcast-Horizont" statt „0–12 h" und „kein
Modell jenseits des Horizonts" statt „Seam@2h".
