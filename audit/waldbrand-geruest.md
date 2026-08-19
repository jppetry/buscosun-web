# audit/waldbrand-geruest.md — WB1: Gerüst der Waldbrand-Ansicht (Gate GWB1)

> **Stand: 2026-08-14.** Diagnose **vor** dem ersten Handgriff (`CLAUDE.md`: Diagnose-First).
> Vorgänger: `audit/waldbrand-transport.md` (WB0, Gate GWB0 grün). Plan: `plan.md` §WB1.
> Gate: `checklist.md` §GWB1. Protokoll: `tests.md` §WB-T1.

## 0. Baseline für den Funktionserhalt

`npm run build && npm run budget`, 2026-08-14, **vor** jeder Änderung:

| Metrik | IST | Grenze |
|---|---|---|
| `eagerJs` | **123,1 KB** gzip | 129,5 KB |
| `eagerCss` | **8,5 KB** | 8,5 KB |
| `largestChunk` | **278,4 KB** (`maplibre-ChAaPfnC.js`) | 292,3 KB |
| `totalJs` | **832,1 KB** | 841,4 KB |

Diese vier Zahlen sind der Vergleichsmaßstab am Gate. `eagerCss` steht **exakt auf der Grenze** —
jedes Byte neues eager-CSS bricht das Budget. Das Waldbrand-CSS muss deshalb im Lazy-Chunk landen
(Import in `FirePage.tsx`, **nicht** in `App.tsx` oder `SearchPage.tsx`).

## 1. Die sieben Verdrahtungsstellen — am Code nachgezählt

| # | Ort | IST |
|---|---|---|
| 1 | `src/App.tsx:30` | `FeatureId` = 12 Werte, `'fire'` fehlt · `:15-28` 13 Lazy-Importe · `:79-92` Hash-Routing · `:110-120` `RAIL_FEATURES` (9) · `:135-147` Render-Kette |
| 2 | `src/SearchPage.tsx:69-80` | `FEATURE` = 10 Einträge |
| 3 | `src/SearchPage.tsx:83-94` | `PALETTE` = 10 Einträge (01–10) |
| 4 | `src/SearchPage.tsx:559+` | `BentoGrid` = 7 Kacheln; `HeroQuad` (`:251`) = 2 → **9 gesamt** |
| 5 | `src/SearchPage.tsx:539` | `09 WERKZEUGE` hartcodiert |
| 6 | `src/SearchPage.tsx:67` | `Category` = `'radar' \| 'planen' \| 'verstehen' \| 'erkunden'` |
| 7 | `src/nav/featureRail.tsx:11-12, 98-108` | `RailFeature` = 9, `FEATURE_RAIL_ITEMS` = 9 |

⚠️ **`App.tsx:110-120` ist eine achte, im Plan nicht genannte Stelle:** `RAIL_FEATURES` ist eine
**zweite** Zieltabelle neben `SearchPage.FEATURE` — sie füttert `openRailFeature()`, also jeden
Rail-Klick aus jedem Deck. Fehlt `fire` dort, ist der neue Rail-Knopf sichtbar, tut aber nichts
(`openRailFeature` findet nichts und macht stillschweigend gar nichts, `:121-124`). Das ist genau
die Sorte toter Knopf, die `SearchPage.tsx:16` für die Kacheln ausschließt. **Also acht Stellen,
nicht sieben.**

## 2. `LayerKey` verschieben — und warum die Begründung in V-190 nicht stimmt

`LayerKey` steht in `MapView.tsx:638` (nicht `:637`), 19 Werte. Importeure — **alle fünf mit
`import type`**:

| Datei | Zeile | Form |
|---|---|---|
| `src/App.tsx` | 4 | `import type { LayerKey, MapDeckFeature }` |
| `src/mapState.ts` | 10 | `import type { LayerKey }` |
| `src/event/EventResult.tsx` | 12 | `import type { LayerKey }` |
| `src/components/LayerInfoPanel.tsx` | 14 | `import type { LayerKey }` |
| `src/components/LayerIcon.tsx` | 7 | `import type { LayerKey }` |

`src/fusion/modelSource.ts` importiert **gar nichts** aus `MapView` — dort steht `LayerKey` nur in
einem Kommentar (`:27`). Die Trefferliste von `grep` führt in die Irre.

**Befund:** V-190 (und `architecture.md` §14.1) begründen die Verschiebung damit, dass die
Wiederverwendung von `LayerIcon`/`LayerInfoPanel` „die 316-KB-Datei in den Waldbrand-Chunk zieht".
**Das trifft nicht zu.** `import type` wird bei `isolatedModules: true` (`tsconfig.app.json:10`) von
esbuild/Vite vollständig gelöscht und erreicht den Bundle-Graphen nie.

**Gegenbeweis aus dem Bestand, kein Gedankenexperiment:** `src/mapState.ts` ist **eager** — `App.tsx:5`
importiert `decodeMapState` als Wert — und type-importiert `LayerKey` aus `MapView`. Zöge das
`MapView` mit, läge `eagerJs` nicht bei 123,1 KB, sondern über den 278,4 KB, die allein der
maplibre-Chunk wiegt. Tut es nicht.

**Konsequenz:** Die Verschiebung wird trotzdem gemacht — sie steht im Plan, sie ist mechanisch, sie
entkoppelt sauber, und sie ist die Voraussetzung, falls je ein **Wert** (nicht nur ein Typ) aus
diesem Umfeld gebraucht wird. Aber sie wird **nicht** als Einsparung verkauft: `eagerJs` und
`totalJs` bleiben unverändert, und genau das ist am Gate der Beleg — nicht ein behaupteter Gewinn.

## 3. Der Fehler von `LAYER_ORDER`, den `#wb=` nicht wiederholen darf (V-191)

`src/mapState.ts:24`:

```
const LAYER_ORDER: LayerKey[] = ['wind','nowcast','temp','clouds','sat','lightning',
                                 'stations','confidence','snowline','flownowcast','poprob','gust'];
```

Das sind **12 von 19** `LayerKey`s. Nicht enthalten und damit **nicht permalink-fähig**:
`lightningfc`, `thunder`, `snow`, `rotation`, `cells`, `hail`, `warnings` — also ausgerechnet die
sieben Layer der jüngsten Phasen. `layersToBits` (`:25-29`) wirft unbekannte Keys stillschweigend
weg (`indexOf` → `-1` → kein Bit), `bitsToLayers` kann sie nie zurückgeben. Ein Nutzer, der einen
Link mit aktivem Hagel-Layer teilt, teilt eine Karte ohne Hagel — ohne Fehlermeldung.

**Regel für `#wb=`:** Die Bit-Reihenfolge wird aus der `FireLayerId`-Union **abgeleitet**, nicht
danebengeschrieben, und ein Verifier prüft die Vollständigkeit als eigene Zusicherung. Neue Layer
können dann hinten angehängt werden (bit-stabil), aber keiner kann mehr vergessen werden.

## 4. Was kopiert wird — und woher genau

| Baustein | Vorlage | Anmerkung |
|---|---|---|
| Deck-Seite (Idle → Deck) | `confidence/ForecastPage.tsx` (176 Z.) | kleinste vollständige Deck-Seite im Repo |
| Eigene MapLibre-Instanz + Basemap | `radar/RadarMap.tsx:26-44` | `STREETS = openfreemap/liberty`, Esri-Raster für Gelände/Satellit |
| DACH-Maske | `countryMask.ts:58-76` `loadDachMask()` | fertig, kein Nachbau |
| Rail | `nav/featureRail.tsx` `FeatureRail` | Props: `navClass`/`btnClass`/`activeClass` — Deck bringt eigenes CSS mit |
| Auswahl-Kaskade | `fusion/modelSource.ts:123-126` | als **Muster**, nicht als Import |
| Quellenreine Stufen | `warnings/warnField.ts:65-102` | `colorOrigin: 'official' \| 'derived'` — für CH zwingend `derived` (WB0) |
| Verifier-Harness | `scripts/verify-datenalter.mjs` | echte Module importieren (V-94), plus Quell-Sonden |
| rAF-Playback (erst WB3) | `nowcast/NowcastRadarMap.tsx:268-279` | in WB1 **nicht** gebaut |

## 5. Risiken dieser Phase

| # | Risiko | Gegenmaßnahme |
|---|---|---|
| G1 | `eagerCss` steht **auf** der Grenze (8,5/8,5 KB) | Waldbrand-CSS ausschließlich im Lazy-Chunk; `budget` ist Gate-Bedingung |
| G2 | Zehntes Rail-Icon ändert die Rail-Höhe in **sechs** Decks | Screenshot-Abgleich je Deck, Desktop **und** 390×844 (`checklist.md` §GWB1) |
| G3 | Zehnte Kachel verschiebt das von Jan kuratierte SA1-Raster | DOM-Reihenfolge der neun bestehenden Kacheln unverändert lassen, neue ans Ende |
| G4 | `RAIL_FEATURES` in `App.tsx` vergessen ⇒ toter Rail-Knopf | als achte Verdrahtungsstelle protokolliert, Gate-Punkt „kein Eintrag zeigt ins Leere" |
| G5 | V-164: Layer-Sichtbarkeit friert ein, wenn vor dem Stil-Load getoggelt wird | in `FireMap` von Anfang an über `map.isStyleLoaded()`/`load`-Event absichern statt später nachrüsten |
| G6 | `MapView.tsx` (5.724 Z.) versehentlich anfassen | einziger erlaubter Eingriff: Zeile 638 durch Re-Export ersetzen |
