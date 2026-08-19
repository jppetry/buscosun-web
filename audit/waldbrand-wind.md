# Diagnose — Windlayer im Brandradar (Phase WW1)

> Auftrag (Jan, 2026-08-15): „den windlayer 1:1 auch in das brandradar einpflegen,
> auch als layer der ein- und ausblendbar ist wie die anderen layer links."
> Wind ist der erste von drei angefragten Layern (Wind · Temperatur · Niederschlag);
> diese Diagnose deckt **nur Wind** ab — ein Thema, eine Phase, ein Gate (GWW1).

## 1. Was „1:1" hier heißen kann — und was nicht

Die Wetterkarte zieht ihren Wind über genau vier Bausteine, alle **außerhalb**
von `MapView.tsx`:

| Baustein | Datei | Rolle |
|---|---|---|
| `WindLayer` | `src/wind/WindLayer.ts` | WebGL-Custom-Layer (Partikel + Heatmap) |
| `fetchIconD2Wind` | `src/wind/iconD2WindSource.ts:257` | ICON-D2 u/v 10 m, 2,2 km, progressiv |
| `windFrameAtValidTimeAsync` | `src/wind/iconD2WindSource.ts:608` | Frame zur Zielzeit (Worker-Blend) |
| `ICON_D2_WIND_ATTRIBUTION` | `src/wind/iconD2WindSource.ts:24` | Lizenzzeile |

Damit ist ein **echtes 1:1 möglich** — dieselben Module, dieselben Optionen,
dieselben Bytes. Das ist der Unterschied zu WBU1, wo `MapView.css` kopiert werden
musste: hier gibt es nichts zu kopieren, nur zu importieren. `verify:fire-model`
Sonde (b) verbietet ausschließlich Importe aus `../MapView` — `../wind/*` ist frei.

Die Layer-**Optionen** werden wertgleich aus `MapView.tsx:1390-1425` übernommen
(`speedPxPerMs: 6`, `speedRefZoom: 5.5`, `screenTempoZoomExp: 0.35`,
`zoomDropBoost: 0.42`, `upsample`/`maxParticleFps`/`reduceMotionOnMove` nach
Pointer-Klasse). Abweichen hieße: andere Partikelgeschwindigkeit bei gleichem
GRIB-Wert — genau der Fehler, den `audit/wind-partikel-grib-treue.md` beseitigt hat.

## 2. Der eine Punkt, an dem 1:1 nicht geht: die Zeit

Die Wetterkarte hat einen **Stunden**regler, das Brandradar einen **Tages**regler
(`fireTime.ts`). Und das ICON-D2-Windgitter reicht nur bis **+12 h**
(`iconD2WindSource.ts:30 — MAX_STEP = 12`).

Daraus folgt zwingend:

* Tag 0 („heute") ist der **einzige** Tagesschritt, den der Wind bedienen kann.
  Tag 1 (+24 h) liegt jenseits des Horizonts.
* `windFrameAtValidTimeAsync` **klemmt** eine zu große Zielzeit stillschweigend
  auf den letzten Frame. Würde die Karte damit auf Tag +3 gefüttert, zeigte sie
  den +12-h-Wind und behauptete, es sei Donnerstag. Das ist genau die stille
  Falschaussage, die D-04 und `fireTime.ts` §Ehrlichkeit verbieten.

**Entscheidung:** `FIRE_LAYER_TIME.fireWind = { mode: 'instant', maxDay: 0 }`,
und gefüttert wird **immer `Date.now()`** — nie eine geklemmte Zukunft.

Warum `instant` und nicht `forecast` mit `maxDay: 0`:
`sharedMaxDay()` (fireTime.ts:94) zählt `forecast`-Layer mit und bildet das
Minimum. Ein `forecast`-Layer mit `maxDay: 0` würde den gemeinsamen Regler auf 0
ziehen, `hasForecastSlider()` wäre `false` — und das **Zuschalten des Windes
ließe den Tagesregler des EU-Index verschwinden**. Das wäre eine Regression an
einem bestehenden Layer (oberste Direktive: Funktionserhalt). `instant`-Layer
werden von `sharedMaxDay` bewusst übergangen — dasselbe Muster wie `fireBans`.

Die Ehrlichkeit übernimmt dann der vorhandene Mechanismus: `followsSlider()`
liefert für `instant` nur auf Tag 0 `true`, `laggingLayers()` nimmt den Wind ab
Tag 1 auf, und die Dock-Zeile zeigt die bestehende Zeile
„gilt für heute — folgt dem Tagesregler nicht" (`FirePage.tsx:640`). Kein neuer
Text, kein neuer Mechanismus, keine zweite Wahrheit.

## 3. Einhängepunkt in der Karte

`FireMap.tsx` ist idempotent gebaut: `applyState()` stellt den Sollzustand her
und läuft auf `load`, `styledata`, `idle` und bei jeder Prop-Änderung. Der
`ScalarLayer` des Feuerwetter-Treibers (`fire-weather-scalar`,
`FireMap.tsx:319-355`) ist der **exakte Präzedenzfall** für einen
WebGL-Custom-Layer in dieser Karte, inklusive der dort dokumentierten Falle:

> In `installLayers` darf für einen Custom-Layer **kein Platzhalter** angelegt
> werden — er trüge dieselbe Id, `if (!m.getLayer(...))` fände ihn, der echte
> Layer käme nie in die Karte und die Daten lägen für immer in `_pending`.

Für `fireWind` gilt dasselbe: `installLayers` überspringt ihn (wie `fireWeather`),
`applyState` hängt ihn ein.

**Z-Band 75** — über der amtlichen Landesstufe (70), unter den Hotspot-Punkten
(80). Begründung: Partikel sind eine Bewegungsschicht über den Flächen, aber die
Thermalanomalien müssen anklickbar und auffindbar bleiben
(`fireModel.ts:87` — „Punkte ganz oben, sonst unauffindbar").

**Unter der DACH-Maske.** In der Wetterkarte liegt der Wind über der Maske
(`MapView.tsx:1574` — `addLayer(wind)` ohne `beforeId`). Hier nicht: `applyState`
hebt `fire-dach-mask-fill` per `moveLayer` zuletzt nach oben, der Wind bleibt
darunter und wird außerhalb DE/AT/CH mit 34 % abgedunkelt — konsistent mit dem
Feuerwetter-Treiber, dessen Steckbrief genau das schon zusagt („außerhalb von DE,
AT und CH ist die Fläche abgedunkelt"). Das ICON-D2-Gebiet reicht bis Polen und
Tschechien; ungedimmte Partikel dort behaupteten eine Aussage, die diese Ansicht
nicht macht.

## 4. Sichtbarkeit — zwei Schalter, nicht einer

`WindLayer` ist ein `CustomLayerInterface`; die Wetterkarte schaltet ihn über
**beides**: `setLayoutProperty(id,'visibility')` (`MapView.tsx:1843,1889`) **und**
`setShowParticles()` (`MapView.tsx:3696`). Das ist kein Doppel, sondern Absicht:

* `visibility: 'none'` ⇒ MapLibre ruft `render()` nicht mehr auf.
* `showParticles = false` ⇒ der Repaint-Loop endet (`WindLayer.ts:1912` stößt den
  nächsten Frame nur an, solange `showParticles` gilt).

Nur der erste allein genügte zwar optisch, aber der zweite ist der Beleg, dass
kein Loop weiterläuft. Beide werden gesetzt.

**Bekannte Nebenwirkung:** Solange die Partikel laufen, geht die Karte nie in
`idle` — der `idle`-Aufruf von `applyState` (`FireMap.tsx:411`) fällt dann aus.
Das ist unkritisch, weil `applyState` zusätzlich an `load`, `styledata` und am
Prop-Effekt (`FireMap.tsx:571-575`) hängt; der `idle`-Pfad ist dort ausdrücklich
nur der Auffangpfad („fängt den Rest ab"). Wird als V-Eintrag notiert, nicht als
Blocker.

## 5. Permalink-Bit — anhängen, nie einschieben

`FIRE_LAYER_ORDER` ist die Quelle der Bitmaske (`fireState.ts:57-68`), und
`verifyFireModel` prüft `FIRE_LAYER_ORDER.length === MVP + EXTENDED`. Ein
Einschub würde bestehende `#wb=`-Links auf andere Layer umbiegen (V-191). Der
Wind bekommt deshalb eine **dritte, angehängte** Gruppe
`FIRE_WEATHER_LAYERS = ['fireWind']` und damit Bit 10 — hinter allen bestehenden.
Die Verifier-Zeile wird auf drei Gruppen erweitert; Bits 0…9 bleiben unberührt.

## 6. Ladepfad

Strikt lazy, Muster `fireWeather` (`FirePage.tsx:347-369`): erst beim Aktivieren,
progressiv über `onProgress`, `AbortController` beim Abwählen, Ladezustand über
`setLayerLoad`. `fetchIconD2Wind` bringt seinen eigenen `localStorage`-Sofortcache
und die Warm-Cron-Manifeste mit — **kein neuer Transportpfad, keine Änderung an
Edge Functions oder Crons** (die wären STOPP-&-FRAGEN).

Kein `nowOnly`: die Waldbrandkarte hat keinen Stundenregler, aber der nahe
Horizont lädt ohnehin zuerst und der ferne füllt still nach — die Bytes sind
dieselben, die die Wetterkarte auch holt, und der Browser-Cache trägt sie
zwischen beiden Ansichten.

## 7. Was diese Phase NICHT anfasst

* `MapView.tsx`, `MapView.css`, `src/wind/*` — kein Byte. Der Wind der
  Wetterkarte muss unverändert bleiben (Desktop-Regression = Phase gescheitert).
* Temperatur und Niederschlag im Brandradar — eigene Phasen, eigene Gates.
* Zeitmodell der Wetterkarte, Fusion, Shader, Transport.

## 8. Gate GWW1 — Bedingungen

1. `npm run typecheck` grün.
2. `npm run verify:fire-model` und `verify:fire-time` grün, inkl. der neuen
   Prüfungen (Bit 10, Horizont-Neutralität, `instant`-Semantik).
3. Wind ein-/ausschaltbar wie jeder andere Layer links; ausgeschaltet **keine**
   Repaints mehr.
4. Der Tagesregler des EU-Index behält bei aktivem Wind seine 9 Tage.
5. Ab Tag 1 steht an der Wind-Zeile „gilt für heute — folgt dem Tagesregler nicht".
6. Konsole sauber, Attribution DWD sichtbar.
