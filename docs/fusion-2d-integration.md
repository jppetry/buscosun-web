# Fusion → 2D-Layer-Integration — Diagnose & Architektur (Gate 0)

> Status: **Gate 0 (Diagnose-First) — abgeschlossen.** Kein Render-Code vor diesem Gate.
> Quellen: `docs/fusion-forecast-spec.md` (Textur-Kontrakt §9), `docs/fusionV2-plan.md` §1
> (As-built), `docs/buscosun-fusion-audit-2026-06.md` (Punkt- vs. Raster-Domäne),
> plus Code-Trace (`src/MapView.tsx`, `src/scalar/*`, `src/wind/*`, `src/fusion/*`,
> `src/pointForecast/*`, `src/nowcast/*`).

---

## 0. Kernbefund vorab (das Wichtigste)

**„Die Fusion" ist kein Monolith, der vier Quadranten speist — es sind getrennte Engines:**

| Quadrant | Engine (Ort) | Ist ein finalisiertes, wählbares „Fusion"-Produkt? |
|---|---|---|
| **Raster-Forecast** | `src/fusion/` (`loadFusedForecast`→`FusionEngine`→PNG-Texturen) | **JA** — das einzige gebrandete, per `ModelChoice` selektierbare Fusion-Produkt |
| **Punkt-Forecast** | `src/pointForecast/` (`getPointForecast`) | Immer-fusioniert, aber **kein** Fusion-vs-Native-Konzept vorhanden |
| **Raster-Nowcast** | `PrecipCompositor` (`src/scalar/precipComposite.ts`) | **NEIN** — native Ein-Quelle-pro-Zelle-Mosaik (RADOLAN/INCA/rzc→ICON-D2), keine Multi-Source-Fusion |
| **Punkt-Nowcast** | `src/nowcast/` (`buildNowcast`) | Radar↔Punkt-Forecast-Blend; **nicht** ins MapView-Panel verdrahtet |

Konsequenz für den Auftrag: Der Fusion⇄Native-Switch ist **vollständig getragen und byte-kompatibel für die Raster-Forecast-Kartenlayer** (Wind/Temp/Wolken/Niederschlag). Für die drei übrigen Quadranten muss „Fusion" bzw. „Native" erst **definiert** werden (kein fertiges Fusion-Produkt vorhanden) — das ist eine Scoping-Entscheidung, kein Hard Stop.

---

## 1. Integration-Map (repräsentativer Layer: Temperatur)

Pfad Datenquelle → Textur → Repaint → Shader, verifiziert an `temp`, generalisiert auf alle Custom-WebGL-Layer:

```
NATIVE (heute sichtbar):
  installTemp (MapView.tsx:1148) → fetchIconD2Temp (t_2m + hsurf-DEM)
    → Slider-Effekt (MapView.tsx:1750) → ScalarLayer.setData(image,{width,height,vMin,vMax,uvBounds})
      + ScalarLayer.setDem(demImage)                         (ScalarLayer.ts:208 / :225)
    → decode R=T, A=Maske, G=Zell-DEM/4500; Per-Pixel-DEM-Refine im Fragment-Shader
    → this.map.triggerRepaint()                              (ScalarLayer.ts:217)

FUSION (heute nur Fallback):
  loadFusedForecast → FusionEngine.run() → encodeScalarPng (fusionEngine.ts:756)
    → DwdForecastResult.hours[h].layers.temperature (Canvas: R=Tnorm, G=DEM/4500, A=Maske)
    → MapView.tsx:1614–1622 temp.setData(...) NUR falls !iconD2TempRef.current
```

**Generalisierung:** Alle fünf Custom-WebGL-Layer folgen exakt demselben Muster —
`setData/setWindData/setFrame` → Textur-Upload → `triggerRepaint()`; Pre-GL-Mutationen
werden in `_pending*` gepuffert und in `onAdd` nachgezogen. Ein Source-Switch ist damit
ein reiner **Daten-Swap in dieselbe Layer-Instanz** (kein Re-Add, kein Reload). Der
WindLayer hat zusätzlich einen Dedup-Guard (`WindLayer.ts:449`) → Toggle off→on ist gratis
und flicker-frei. Sichtbarkeit (`applyVisibility`, MapView.tsx:684) ist von Daten entkoppelt.

---

## 2. Contract-Fit-Urteil (der Hard-Stop-Kandidat)

**Frage (Gate 0): Passt der Fusion-Output in den bestehenden Textur-/Tile-Kontrakt — ohne den Kontrakt zu ändern?**

| Layer | Fusion-Encoding (spec §9) | Sink-Kontrakt | Urteil |
|---|---|---|---|
| **wind** | R=u, G=v, A=Maske, +uMin/uMax/vMin/vMax/uvBounds | `WindLayer.setWindData(image, WindMeta)` — liest R/G, Maskierung via uvBounds | **BYTE-IDENTISCH.** Nativ-ICON-D2 speist bereits denselben Kontrakt. Drop-in. |
| **temp** | R=Tnorm, G=DEM/4500, A=Maske, +vMin/vMax/uvBounds; sep. demImage (demMax 4500) | `ScalarLayer.setData(image, ScalarMeta)` + `setDem`; Shader liest R, A(<0.05→discard), G·demMax | **BYTE-IDENTISCH.** `gMax=4500 == demMax=4500`. Genau deshalb funktioniert der heutige Fallback. Drop-in. |
| **clouds** | R/G/B=low/mid/high, A=Maske (Canvas + uvBounds) | `CloudLayer.setFrame({values:Uint8Array RGBA, corners})` | **Kanal-Layout IDENTISCH; Transport divergiert.** Adapter nötig: `getImageData()` (Canvas→Uint8Array) + `uvBounds`→4×`QuadCorners`. Kein Kanal-Remap, kein Re-Encode. |
| **precip** | R=p/10 (0–10 mm/h), A=Maske | (a) `precip-forecast`-`ScalarLayer` (vMin0/vMax10): **byte-identisch** · (b) sichtbarer `rain`-`RainLayer`: Luminanz-1-Kanal, Ramp vMax **20**, corners/warp | **(a) BYTE-IDENTISCH** (existierender, für Fusion gebauter Sink!) · (b) divergiert (Format + Normierung 10↔20 + Geo). → Fusion-Precip auf **(a)** routen (den heute versteckten `precip-forecast`-Layer sichtbar schalten), RainLayer bleibt Radar-Nowcast. |
| **confidence** | (opt.) σ-PNG `layers.uncertainty` R=σ/6 | `ConfidenceLayer.setData(image, ScalarMeta)` (heute Klimatologie) | Byte-kompatibel als *künftiger* Feed; heute nicht Teil des Switch-Scopes. |

**URTEIL: ✅ CONTRACT FITS — WEITER (kein Hard Stop #2).**
- Wind + Temp: byte-identisch, Drop-in (Nativ speist bereits den Kontrakt).
- Clouds: Kanal-Encoding identisch; nur ein **Transport-Adapter** in der Wiring-Schicht
  (Canvas→Uint8Array, uvBounds→corners). Das ändert **weder** den WebGL-Layer-Kontrakt
  **noch** das Fusion-PNG-Encoding — es ist Integrations-Glue, kein Contract-Edit.
- Precip: byte-identisch, wenn auf den bereits existierenden `precip-forecast`-`ScalarLayer`
  geroutet (der wurde ursprünglich für Fusion-Precip gebaut). Kein Contract-Edit.

Ich ändere an **keiner** Stelle einen Kontrakt, um „passend zu machen". Die Adapter für
Clouds/Precip sind reine Konvertierung zwischen zwei unveränderten Kontrakten.

---

## 3. Layer × Quadrant — Abdeckungsmatrix (kein Layer still auf Native)

`LayerKey` (MapView.tsx:174): `wind gust nowcast temp clouds sat lightning stations confidence snowline flownowcast poprob`.

| Layer | Quadrant | Fusion-Quelle vorhanden? | Switch-Plan |
|---|---|---|---|
| `wind` | Raster-Forecast | ✅ `layers.wind` | Fusion⇄Native Daten-Swap (byte-identisch) |
| `temp` | Raster-Forecast | ✅ `layers.temperature` | Fusion⇄Native Daten-Swap (byte-identisch) |
| `clouds` | Raster-Forecast | ✅ `layers.clouds` | Fusion⇄Native + Transport-Adapter |
| `nowcast`/Precip | Raster-Forecast / -Nowcast | ✅ `layers.precipitation` (Forecast); ❌ kein distinktes Fusion-Nowcast-Raster | Fusion-Precip → `precip-forecast`-ScalarLayer; Radar-Nowcast bleibt `RainLayer` (native) |
| `gust` | Raster-Forecast | ❌ Fusion erzeugt kein `gust`-Feld | **native-by-design** (dokumentiert, nicht versehentlich) |
| `sat`, `lightning` | — (WMS-Raster) | ❌ nicht im Fusion-Scope | native-by-design |
| `stations` | — (Punkt-Obs) | ❌ | native-by-design (ist selbst der h=0-Anker der Fusion) |
| `confidence` | — | (σ-PNG optional, fusionV2) | native-by-design; σ-Feed als Zukunftsoption notiert |
| `snowline`, `flownowcast`, `poprob` | abgeleitet | ❌ | native-by-design (abgeleitete ML/Flow-Produkte) |
| **Punkt-Panel** | Punkt-Forecast | ⚠️ immer-fusioniert, kein Native-Modus | Native = Einzelmodell-Isolation in `getPointForecast` (neue Fähigkeit) |

**„Native-by-design"** = Layer ohne Fusion-Äquivalent bleiben bewusst und dokumentiert nativ;
sie sind **nicht** versehentlich unabgedeckt. Der Fusion⇄Native-Switch ist für sie ein No-op
(bzw. ausgegraut).

---

## 4. Bestehende Host-UI & Repaint

- **`modelChoice`** (`ModelChoice = 'fusion'|'mosmix'|'arome'|'inca'|'obs'`, loadFusedForecast.ts:205)
  existiert als Engine-API, ist in MapView aber **ohne Setter auf `'fusion'` gepinnt**
  (MapView.tsx:294) und **hat keine JSX-UI** (der Per-Land-Selektor wurde entfernt). →
  headless Host, ideal zum Erweitern um den Fusion⇄Native-Toggle.
- Reload ist bereits verdrahtet: `useEffect([modelChoice])` (MapView.tsx:1325) → `reloadForecastRef.current` (`loadOpenMeteo`, :1224). Ein neuer `setModelSource` läuft ohne Remount durch.
- Repaint: jeder Custom-Layer `triggerRepaint()` nach Daten-Mutation; Sichtbarkeit ist entkoppelt. Source-Switch = `setData/setWindData/setFrame`-Swap in dieselbe Instanz. Flicker-frei (WindLayer-Dedup-Guard).

---

## 5. Feature-Flag & Fallback (Design, Phase 5)

- **Flag:** `import.meta.env` + `window.__*`-Konvention des Repos (wie `fusionV2`). Vorschlag:
  `fusion2d.default` (bzw. `window.__fusion2d = 'fusion'|'native'`) — gatet **nur den globalen
  Default**. Der Nutzer-Switch wirkt **unabhängig vom Flag** (Safety-Net, kein Debug-Tool).
- **Auto-Fallback:** schlägt ein Fusion-Feed (Fetch/Decode) fehl, bleibt der Layer für diese
  Stunde/dieses Tile auf Native, nicht-blockierender Indikator via `updateStatus(layer,…)`;
  kein Throw in die Render-Loop, kein leerer Frame. Native ist der eingefrorene Referenzpfad.
- **Production-Default-Flip = Hard Stop.** Implementieren + in beiden Flag-Zuständen testen,
  den echten Flip auf Freigabe offenlassen.

---

## 6. Phasenplan (self-gated; Hard Stops ausgenommen)

1. **Gate 0** — dieses Dokument. ✅
2. **State & Resolver** — ✅ `src/fusion/modelSource.ts` (`ModelSource`, global+Per-Layer-Override,
   `resolveModelSource`, reine Reducer). Selbsttest `verifyModelSource()` **37/37** (Node strip-types;
   +5 Punkt-Domänen-Checks). Eigene `point`-Domäne mit invertiertem eingefrorenem Default (`'fusion'`),
   unabhängig vom Raster-`global` (`'native'`) — `resolvePointSource`/`setPointSource`.
3. **Fusion-Wiring (4 Quadranten)** — ✅ **vollständig & verifiziert.**
   - **Raster** (`de98067`,`269f4c8`): wind + temp byte-identisch resolver-gegated; **clouds**
     (Transport-Adapter Canvas→Uint8Array + `uvBounds→corners`); **precip** (Sichtbarkeits-Swap
     `precip-forecast`↔`rain`). Native-Default unverändert (ICON-D2), Flip→Fusion sichtbar; State-
     Machine (global/Override/native-by-design-Pin) live bestätigt.
   - **Punkt** (`18c7b6f`): `getPointForecast` additiver `sourceMode`; `'native'` = Einzelmodell-
     Isolation (DE→MOSMIX, AT/CH→AROME), roh ohne Obs-Anker/Radar/Consensus, garantierter Fallback
     auf den Blend. **Verifikations-Gate (zweite Engine, Runtime):** Native kollabiert die Quellen
     (München→`[mosmix,dwd_uv]`, Innsbruck→`[arome_at]`); Werte weichen echt ab (Innsbruck **+2.7 °C**
     rohe Gitter-Topografie vs. Blend-QC); Confidence fällt ehrlich auf den **0.60**-Single-Source-Cap
     statt falscher 100 %; Fusion-Pfad byte-identisch.
4. **UI-Switch** — 🔄 Toggle (global + per Layer, flicker-frei) in der Layer-Steuerung.
5. **Fallback & Flag** — Auto-Fallback + Indikator; `fusion2d.default`-Flag.
6. **Verifizieren & Übergabe** — Tests (a–e), Layer×Quadrant-Abdeckung, Stopp am Prod-Default-Flip.

### Scoping-Entscheidung (bestätigt 2026-07-03): **Raster UND Punkt**
Der Fusion⇄Native-Switch deckt **beide Domänen** ab:

- **Raster (Kartenlayer)** — `src/fusion/` gridded Fusion ⇄ native ICON-D2, für `wind/temp/clouds/precip`
  (wind/temp byte-identisch; clouds/precip via Adapter/existierenden Sink). Fusion-fähige Layer:
  `FUSION_CAPABLE_LAYERS = [wind, temp, clouds, nowcast]`. Übrige Layer (gust/sat/lightning/stations/
  confidence/snowline/flownowcast/poprob) bleiben **native-by-design** (kein Fusion-Feld) — vom
  Resolver unverlierbar auf `native` genagelt.
- **Punkt (Panel)** — `getPointForecast` ⇄ **Native**. „Fusion" = der heutige Multi-Source-Blend;
  „Native" = **Einzelmodell-Isolation** (neue, additive Fähigkeit in `getPointForecast`: dominante
  native Quelle je Land, ohne den Blend-Pfad zu verändern). Der globale Switch steuert Raster + Punkt
  gemeinsam; Per-Layer-Overrides gelten für die Raster-Layer.

**Raster-Nowcast** (Radar-`PrecipCompositor`) bleibt der native Nowcast-Pfad; die Fusion-Precip
speist den `precip-forecast`-ScalarLayer (Forecast-Horizont). **Punkt-Nowcast** (`buildNowcast`)
ist eine eigene Seite und nicht Teil des MapView-Panel-Switches.
