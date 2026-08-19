# Niederschlags-Architektur — „Niederschlag · jetzt–2 h" (gemessenes Radar/Nowcast)

**Stand:** 2026-07-24 (Konsolidierungs-Phase **N1**, revidiert). Maßgebliche Spec:
[`audit/niederschlag-vereinheitlichung.md`](../audit/niederschlag-vereinheitlichung.md).

> **Design-Entscheidung Jan (2026-07-24, Revision):** Die Niederschlags-Ansicht zeigt **nur
> die gemessene Radar-/Nowcast-Hälfte** (0–2 h, per Land), **ohne** Modell-/Fusions-Verlängerung.
> Kürzer und ehrlicher: gemessenes Radar statt Modell-Extrapolation. Die ursprüngliche N1-Idee
> „jetzt–12 h (Radar → Modell nahtlos)" wurde damit **auf den Nowcast-Horizont verkürzt**.

Diese Ansicht der 2D-Karte zeigt über den Zeit-Slider **jetzt … bis zum Nowcast-Horizont** das
gemessene Landesradar, per Land: **DE RADOLAN-RV bis 2 h**, **AT GeoSphere INCA bis 3 h**,
**CH MeteoSchweiz rzc (~jetzt, < 0,5 h)** — als **eine** Ansicht mit **einer** Farbskala. Jenseits
des jeweiligen Land-Horizonts blendet der Layer aus (keine Modellverlängerung).

> **Historie:** Bis zu dieser Revision existierte (a) ein separater Layer **Sim-Radar** (`simradar`,
> ICON-D2 `dbz_cmax`), der **stillgelegt und entfernt** wurde, und (b) eine Modellhälfte (2–12 h,
> ICON-D2/Fusion), die nun ebenfalls **draußen** ist. Siehe
> [`audit/simuliertes-radar.md`](../audit/simuliertes-radar.md).

---

## 1. Überblick

N1 hat die zuvor über `precipFrameReady` + Sichtbarkeits-Booleans in `MapView.tsx` **verstreute**
Quellen-/Sichtbarkeitslogik an **eine** reine, testbare Stelle gehoben
([`src/nowcast/precipSource.ts`](../src/nowcast/precipSource.ts)) und die Ansicht auf gemessenes
Radar/Nowcast reduziert.

| Zeitfenster | Land | Quelle | Renderer |
|---|---|---|---|
| **0–2 h** | DE | DWD RADOLAN-RV (`nowcastRef`) | `RainLayer` (`nowcast`) |
| **0–3 h** | AT | GeoSphere INCA (`incaGridRef`) | `RainLayer` |
| **~0 h** (< 0,5 h) | CH | MeteoSchweiz rzc (`meteoRadarRef`) | `RainLayer` |
| jenseits davon | — | *nichts* (keine Modellverlängerung) | — (Layer aus) |

Der **DACH-Kompositor** ([`src/scalar/precipComposite.ts`](../src/scalar/precipComposite.ts))
mischt **pro Karten-Zelle** das fachlich richtige Landesradar (Box-Heuristik `pickCountry`) —
unabhängig davon, in welchem Land der Nutzer gesucht hat. Er wird **bewusst ohne `d2` (ICON-D2)**
aufgerufen → Zellen jenseits des jeweiligen Radar-Horizonts bleiben leer (transparent), es gibt
keine Modell-Verlängerung mehr.

Der `precip-forecast`-`ScalarLayer` (Fusions-Modell-Niederschlag) ist damit **stillgelegt** (nie
sichtbar); der `RainLayer` ist die **einzige** Niederschlagsquelle — auch im Fusion-Modus. Der
**Fusion⇄Native**-Schalter wirkt weiterhin auf Temperatur/Wind/Wolken, hat auf den Niederschlag
aber keinen Effekt mehr (es gibt keine Modellhälfte).

---

## 2. Die `PrecipSource`-Abstraktion

[`src/nowcast/precipSource.ts`](../src/nowcast/precipSource.ts) ist die **einzige** Stelle, die die
Quellenwahl entscheidet. Reine Logik (keine maplibre/WebGL/Loader-Imports) → headless testbar.

```ts
resolvePrecipSource(hour, country, avail) -> {
  kind: 'radar',   // immer gemessenes Radar/Nowcast (keine Modellhälfte)
  ready: boolean,  // Frame im Land-Horizont verfügbar? jenseits → false (Layer aus)
}
precipCompositeReady(hour, avail) -> boolean          // DACH-OR über DE/AT/CH
precipRadarHorizonHours(avail) -> number              // max geladener Radar-Horizont (Slider)
```

- **Land-Horizonte** (`RADAR_HORIZON_H`): DE 2 h · AT 3 h · CH 0,5 h — deckungsgleich mit
  `precipComposite.ts` (`RV_MAX_H`/`INCA_MAX_H`/`RZC_MAX_H`); CH-Grenze strikt `< 0,5`.
- **`precipCompositeReady`** ersetzt das frühere `precipFrameReady` (ohne dessen ICON-D2-Zweig):
  sichtbar, sobald IRGENDEIN Landesradar die Stunde in seinem Horizont führt.
- **`precipRadarHorizonHours`** liefert den max. geladenen Radar-Horizont (RADOLAN 2 / INCA 3 /
  rzc 0,5) — die Slider-Obergrenze, wenn Niederschlag der Treiber ist (Testmodus: jetzt–2/3 h).

### Datenfluss

```
Slider-Stunde h ─▶ resolvePrecipSource(h, country, availability)
                     ├─ h ≤ Land-Horizont & Landesradar da ─▶ kind='radar', ready ─▶ RainLayer (RADOLAN-RV / INCA / rzc)
                     └─ sonst                                ─▶ ready=false ─▶ Layer aus (keine Modellverlängerung)
```

---

## 3. Verdrahtung in `MapView.tsx`

- `precipAvailability()` liest die geladenen Radar-Refs → `PrecipAvailability {radarDE, radarAT, radarCH}`.
- `precipFrameReady(hour)` = dünner Wrapper um `precipCompositeReady(hour, precipAvailability())`.
- Sichtbarkeit `NOWCAST_LAYER_ID` = `active.has('nowcast') && precipFrameReady(hour) && modelSource.radar`;
  `precip-forecast` fest `false` (Modellhälfte stillgelegt).
- Der Kompositor-Effekt speist den `RainLayer` **immer** (auch im Fusion-Modus) und **ohne** `d2`.
- `sliderMax` = `max(Basis, Wolken-Horizont falls aktiv, precipRadarHorizonHours falls Niederschlag aktiv)`.

**Nicht Teil dieser Ansicht** (eigene Layer, unverändert): `flownowcast`, `poprob`. Der ICON-D2-
Precip-Loader (`installIconD2`/`iconD2Ref`) bleibt geladen — er speist weiterhin die **PoP-
Heuristik des Vertrauens-Schleiers** (`confidence`) für AT/CH, wird aber **nicht** mehr in den
Niederschlags-Layer gerendert.

---

## 4. Verifikation

- **Headless-Harness:** `npm run verify:precip-source`
  ([`scripts/verify-precip-source.mjs`](../scripts/verify-precip-source.mjs), Node
  `--experimental-strip-types`, kein Vitest) — Radar-Fenster + Grenzen (DE 2 / AT 3 inkl.,
  CH 0,5 strikt), **keine Modellverlängerung** jenseits des Horizonts, DACH-OR-Sichtbarkeit,
  Slider-Horizont.
- **Protokoll:** `tests.md` → **V-NIEDERSCHLAG**; Gate **GN1** in `checklist.md`.

---

## 5. Verhältnis zur geplanten 2D-Layer-Erweiterung (Analyse 2026-08-05)

Die Analyse zur Erweiterung der 2D-Wetterlayer (`docs/2d-layer-erweiterung.md`) lässt **diese
Ansicht unverändert**. Ausdrücklich festgehalten, weil Funktionserhalt oberste Direktive ist:

- **D-14 wird nicht revidiert.** Der `nowcast`-Layer bleibt radar-only jetzt–2 h; es kommt keine
  Modellverlängerung zurück.
- **`precipSource.ts` wird nicht angefasst** — entschieden am 2026-08-05 in der L5/L6-Spec-Session.
  Das geplante allgemeine Zeitmodell (`src/map/layerTime.ts`, V-136) **ruft**
  `precipRadarHorizonHours` **auf**, statt die Logik zu übernehmen. Damit ist die Byte-Identität
  konstruktiv gegeben statt geprüft — inklusive der Grenz-Inklusivität (DE 2 h und AT 3 h inklusiv
  über `+EPS`, CH strikt `< 0,5`, `precipSource.ts:64-67`).
  **Gate-Nachweis:** `npm run verify:precip-source` bleibt grün **und die Liste der 22 Prüfnamen
  ist vorher/nachher identisch** (kein Check darf verschwinden oder umbenannt werden) — ein grünes
  Exit allein genügt nicht. Begründung samt Gegenargument: `docs/zuglinien-radar-spec.md` §3.6;
  eine spätere Zusammenführung liegt als **O-16** vor.
- Der geplante **Regenradar-Layer (`rainradar`, L6) ist eine zusätzliche Ansicht**, keine Ablösung:
  „gemessen, mit 60 min Rückblick und Playback" statt „gemessen + Nowcast". Er speist sich aus
  demselben Kompositor mit demselben `h` — **kein zweiter Datenpfad**.
- Der geplante **Zuglinien-Layer (`motion`, L6)** visualisiert ein Bewegungsfeld, das aus
  **gemessenen** Analysen mit `estimateFlowHS` gerechnet wird (`src/ml/opticalFlowNowcast.ts`,
  dasselbe Modul wie für `flownowcast`/`poprob`) — keine neue Quelle.
  ⚠️ **RADOLAN-RV enthält selbst kein Bewegungsfeld** (2026-08-05 am Byte belegt,
  `docs/DATA_SOURCES.md` §4.1 B1); die Pfeile sind buscosuns Rechnung und müssen als solche
  attribuiert werden (`Datenbasis: …, eigene Elemente ergänzt`, V-140).
- **`precipComposite.ts` wird in L5/L6 nicht angefasst.** Die Generalisierung auf eine Beitragsliste
  (V-137) bleibt Phase **L8**.

**Was sich ändern soll:** `precipComposite.ts` ist heute auf vier Quellen hart verdrahtet (je vier
`ensureXxx`/`primeXxx`-Methoden). Hagel und Schneefall-Phase brauchen dieselbe
Mehrländer-Zusammenführung, weshalb eine Generalisierung auf eine Beitragsliste vorgeschlagen ist
(**V-137**). **Gate-Bedingung dabei:** Für die Bestandsmenge `{rv, inca, rzc, d2}` muss das Ergebnis
byte-identisch bleiben (`verify:composite-equivalence`).
