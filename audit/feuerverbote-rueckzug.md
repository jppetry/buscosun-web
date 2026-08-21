# Rückzug „Feuerverbote (CH)" — Layer `fireBans`

> Stand: 2026-08-19 · Auftrag Jan: „Slider und Funktion des Feuerverbots (CH) aus dem Brandradar
> entfernen." Ausdrückliche Ausnahme von der Obersten Direktive (Funktionserhalt) — dasselbe
> Muster wie der Rückzug der „Amtlichen Stufe" (`fireIndexNational`) und der Rasterfläche
> „Feuerwetter stündlich" (`fireForecast`) am selben Tag.

## 1. Was entfernt wurde

Der Layer hatte **keinen eigenen Schieber**: bedient wurde er über den Dock-Schalter
„Feuerverbote (CH)" (Gruppe „Aktuelle Lage") und den Preset-Schnellzugriff „Feuerverbote".
Beide sind entfallen, und mit ihnen der ganze Layer:

| Ort | Änderung |
|---|---|
| `fireModel.ts` | `FireLayerId` ohne `fireBans`; raus aus `FIRE_MVP_LAYERS`, `FIRE_Z_BAND`, `FIRE_DECK_GROUPS`; Preset `verbote` entfallen |
| `fireModel.ts` | **Bit 4 wird `null`** — Platz reserviert, s. §2 |
| `fireTime.ts` | Zeitmodell `fireBans: instant` entfernt; die Anker, die den Layer als `instant`-Beispiel benutzten, laufen jetzt über `fireContext` (ebenfalls `instant`) |
| `FireMap.tsx` | Quelle `fire-ch-bans`, Layer `fire-bans-fill`/`-line`, Prop `chBans`, BAFU-Attribution |
| `FirePage.tsx` | Zustand `chBans`, der lazy Ladeeffekt (`fetchBafuBans`), der Fehlertext-Zweig auf `fireSourceFor('CH')` |
| `FireLayerCard.tsx` · `fireIcons.tsx` · `fireDeck.css` | Steckbrief, Dock-Icon, Legenden-Swatch `.fire-li-ban` |
| `scripts/seo/tools.mjs` | die drei Textstellen, die die Feuerverbote als Funktion versprachen |

`src/fire/sources/bafuFire.ts` **bleibt** im Repo — verifiziert und wiederverwendbar, aber nicht
mehr verdrahtet (also auch nicht mehr im Bundle). Genau das Muster von `dwdFireIndex.ts` nach dem
Rückzug der amtlichen Stufe. Der Kopfkommentar sagt es jetzt für beide Abrufe.
`verify:fire-sources`/`verify:fire-behoerden` prüfen das Modul unverändert weiter (151/151 · 97/97).

## 2. Bit 4 bleibt reserviert

`FIRE_BIT_ORDER` hat jetzt **drei** `null`-Plätze (1, 4, 13). Ein Einschub statt eines `null`
hätte jedes folgende Bit um eins verschoben — geteilte `#wb=`-Links öffneten dann andere Layer als
beim Teilen (die Lehre V-191). Beim Dekodieren fällt ein `null`-Bit einfach weg; ein alter Link mit
gesetztem Bit 4 öffnet nichts und verschiebt nichts.

## 3. Belege

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run verify:fire-model` | 126/126 |
| `npm run verify:fire-time` | 127/127 |
| `npm run verify:fire-danger-views` | 44/44 |
| `npm run verify:fire-spread` | 203/203 |
| `npm run verify:fire-behoerden` | 97/97 |
| `npm run verify:fire-sources` | 151/151 |
| `npm run build` | grün |
| `npm run budget` | totalJs 918,2/926,1 KB · größter Chunk 278,4/292,3 KB — eingehalten |

Repo-weite Gegenprobe: `fireBans` steht in `src/` nur noch in **Kommentaren** (Begründung des
reservierten Bits) und in den Rückzugs-Prüfungen der Verifier.
