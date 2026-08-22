# Rückbau der Raster-Fusion — RF0 (Diagnose) · RF1 (Umsetzung) · Gate GRF1

> Stand: 2026-08-22 · Auslöser: Jans Vorgabe „buscosun Fusion nur noch für
> Punktforecast und Nowcast nutzen". Vorlauf: die Analyse von
> `src/fusion/` + `src/pointForecast/` + `src/nowcast/` vom 2026-08-19.
> Status: **umgesetzt**, Gate §6 grün.

## 1. Befund in einem Satz

„Buscosun Fusion" bezeichnete **zwei** Dinge: den Multi-Quellen-**Blend** am
Punkt (Panel, Event, Route, Nowcast — produktiv und gewollt) und eine
**Raster-Engine** auf der Karte, die im Auslieferungszustand fast nichts mehr
rendert, aber bei jedem Kaltstart zweimal rechnete. Entfernt wurde der Blend
**auf der Karte**; der IDW-Rasterer bleibt als reine Darstellungs-Infrastruktur.

## 2. Warum nicht `src/fusion/` löschen

Der Ordnername ist irreführend. Vier Module darin sind geteilte Infrastruktur:

| Modul | Externe Aufrufer |
|---|---|
| `elevation.ts` | 8 — `pointForecast`, `NowcastRadarMap`, `radar/precipPhase`, `iconD2TempSource`, `threed/buildCrossSection`, `atmosphere` ×3 |
| `spatialInterp.ts` | `pointForecast.ts:25` (`estimateLapseRate`) **+** der Rasterer |
| `frameInterp.ts` | 6 **native** Layer (temp/gust/thunder/lightningfc/rotation/snow) — nicht nur die Fusion |
| `modelSource.ts` · `modelCatalog.ts` | Modellbibliothek, Per-Land-Switcher, SEO-Lizenztabelle, **und** der Punkt-Modus `sourceMode` |

## 3. Der Befund, der den Umfang bestimmt hat

Am Katalog gemessen (`MODEL_CATALOG`, `e.engineGridded === true`):

```
nur über den Rasterer darstellbar: 20 Einträge
  fusion, inca, arome-at, arome-fr, icon-d2-eps, icon-ch1-eps, icon-ch2-eps,
  icon-eu, icon-global, ifs, aifs, aifs-ens, aicon, gfs, arpege, ukmo, gem,
  aigfs, aigefs, graphcast
rasterfähig OHNE Rasterer (nativer GRIB2-Pfad): 2 → native, icon-d2
```

`MapView.tsx` (`fusionFor`) + `MODEL_ID_TO_CHOICE` zeigen den Mechanismus: Wählt
der Nutzer IFS oder AROME, lädt `loadFusedForecast` **nur diese eine Quelle** und
lässt sie durch dieselbe IDW-Gitterung laufen. Die „Einzelmodelle" *sind* die
Engine mit einer Quelle. Ein ersatzloser Rückbau hätte die Modellbibliothek von
22 auf 2 Einträge schrumpfen lassen — deshalb Jans Entscheidung §4.

**Lehre:** Ein Modul, das man löschen will, wird an seinen *Aufrufern* vermessen,
nicht an seinem Namen. Der erste Umfangsvorschlag dieser Session war falsch, weil
er `engineGridded` nicht gelesen hatte.

## 4. Jans Entscheidungen (2026-08-22)

1. **Blend raus, IDW-Gitterer bleibt.** Auf der Karte rendert immer genau ein
   Modell. Der Blend lebt nur noch im Punktforecast und im Nowcast.
2. **Modellschalter bleibt**, die Kachel „Buscosun Fusion" entfällt.
3. **Temp-Erstpaint-Fallback ersatzlos** — ausdrückliche Ausnahme von der
   Funktionserhalt-Direktive (CLAUDE.md). Der Temp-Layer rendert rein nativ;
   lädt ICON-D2 nicht, bleibt er leer statt einen Ersatz zu zeigen.
4. **`fixtures/` löschen**, Skripte + npm-Aliase mitlöschen. Doku bleibt als
   Historie stehen, `public/params/background-v1.json` bleibt liegen.

## 5. Was entfernt wurde

**Module** (`src/fusion/`, 16 Dateien ≈ 2 300 Zeilen): `oi.ts`, `oi.verify.ts`,
`background.ts`, `background.verify.ts`, `increment.ts`, `uncertainty.ts`,
`predictors.ts`, `loso.ts`, `crps.ts`, `desroziers.ts`, `params.ts`,
`archive.ts`, `fixture.ts`, `fixtureBuild.ts`, `captureFixture.ts`,
`phase45.verify.ts`.

**Im Rasterer**: der `fusionV2`-Flag-Apparat (OI-Analyse, σ-Layer, Min-Varianz-
Hintergrund), der Multi-Quellen-Blend (`allow()` schloss `'fusion'` ein →
jetzt strikte Gleichheit), der Open-Meteo-Zweig (`useOpenMeteo`/`useDachBias`),
`prefetchPrimarySources`/`prefetchSecondarySources` und drei tote
`if (false …)`-Länderblöcke. `loadFusedForecast.ts` 695 → 488 Zeilen.
`modelChoice` ist **Pflichtfeld** — es gibt keinen Blend-Default mehr.

**Katalog/UI**: Eintrag `id: 'fusion'`, `special: 'fusion'`, die Fusion-Karte in
`ModelSwitcher.tsx` und `ModelLibraryOverlay.tsx`. `'fusion'` bleibt als
`ModelSource`-Typ — aber **nur** für die Punkt-Domäne.

**MapView**: `modelChoice` ist nullable (`null` = die Quelle rendert nativ,
Rasterer wird gar nicht erst geladen); der Temp-Layer fordert den Rasterer nicht
mehr an.

**Peripherie**: `fixtures/` (452 Dateien, 59 MB — alle committed, per
`git checkout` wiederherstellbar), 12 Skripte, 7 npm-Aliase, die
`fusion:*`-Schritte in `ci.yml` und der `fusion-gate`-Job in `nightly.yml`.
Neu: `verify:model-source` (der Resolver-Verifier lief vorher im gelöschten
`fusion:verify`-Bündel mit).

## 6. Gate GRF1 — Belege

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` | grün, 11,9 s |
| `npm run budget` | totalJs 914,8 / 926,1 KB · eagerJs 121,1 / 130,2 KB · largestChunk 278,4 / 292,3 KB — alle eingehalten |
| `npm run verify:model-source` | 64/64 |
| `npm run verify:precip-source` | 30/30 |
| `npm run verify:radar-sampling` | 25/25 |
| `npm run verify:warm-budget` | 30/30 |
| `npm run verify:datenalter` | 54/54 |
| `verify:seo` · `verify:official-sources` · `verify:governor` · `verify:warm-wind` · `verify:health` | alle grün |

Neue Regressionsanker in `verifyModelSource()`: der Katalog kennt kein
`'fusion'` mehr, `setGlobalSource` weist es ab, und ein aus dem
`localStorage` geladener Alt-Zustand mit `global: 'fusion'` rendert **nativ**
statt leer.

`verify:datenalter` hat den Rückbau sofort erwischt: die Begründung „keine
Referenzzeit" war beim Umschreiben eines Kommentars verlorengegangen (53/54).
Der Verifier verlangt den Marker in den **drei** Zeilen vor dem `ok:`-Aufruf —
ein vierzeiliger Kommentar reicht nicht.

## 7. Offene Punkte

- **Windows-Aufgabenplanung — erledigt (2026-08-22).** Die stündliche Aufgabe
  `\BuscosunFusionCapture` (Trigger ab 2026-07-02 16:59, Wiederholung `PT1H`,
  Aktion `powershell -NoProfile -ExecutionPolicy Bypass -File
  C:\dev\buscosun-web\scripts\capture-hourly.ps1`) wurde auf Jans Anweisung
  erst deaktiviert und dann per `Unregister-ScheduledTask` **endgültig
  entfernt**. Ihr letzter Lauf um 00:59:59 war bereits fehlgeschlagen
  (`LastTaskResult 0xFFFD0000`) — der erste Tick nach dem Löschen des Skripts.
  Belege: `Get-ScheduledTask` findet sie nicht mehr, `schtasks /Query` meldet
  „Datei nicht gefunden", die Task-XML unter `C:\Windows\System32\Tasks\`
  ist weg. (`Test-Path` auf den `TaskCache\Tree`-Schlüssel meldet weiterhin
  `True`, `Get-ItemProperty` wirft dort aber eine `SecurityException` — der
  Schlüssel ist ohne Elevation nicht lesbar, das ist ein Rechte-Artefakt und
  kein Task-Rest. Die maßgeblichen Schnittstellen sind sich einig.)
- `public/params/background-v1.json` (164 KB) bleibt auf Jans Wunsch liegen —
  es hatte schon vor dem Rückbau keinen Aufrufer und hat jetzt auch keinen
  Lesecode mehr.
- Der Layer `precip-forecast` bleibt unangetastet: er ist seit der
  Niederschlags-Konsolidierung (N1) dauerhaft unsichtbar geschaltet und war
  nicht Teil des Auftrags.
- Die fünf Raster-Fusions-Dokumente unter `docs/` (`fusion-forecast-paper`,
  `-spec`, `-overview`, `fusionV2-plan`, `fusion-2d-integration`) beschreiben
  ab jetzt **Historie**, nicht den Ist-Zustand. `docs/buscosun-fusion-audit-2026-06.md`
  beschreibt dagegen die Punkt-Fusion und bleibt gültig.
