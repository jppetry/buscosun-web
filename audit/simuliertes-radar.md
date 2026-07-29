# audit/simuliertes-radar.md — Feature-Phase F3: Simuliertes-Radar-Layer (dbz_cmax)

> ⛔ **STILLGELEGT ZUGUNSTEN N1 (2026-07-24).** Der Sim-Radar-Layer (`simradar`/`iconD2Dbz`)
> wurde im Zuge der Konsolidierungs-Phase **N1** („Niederschlag · jetzt–12 h", Radar → Modell
> nahtlos) restlos entfernt. Jans Design-Entscheidung: die 2–12-h-Hälfte bleibt der bestehende
> **Fusion-/Modell-Niederschlag (mm/h)** — *nicht* die `dbz_cmax`-Reflektivität. Dieses Dokument
> bleibt als **Historie** erhalten; die maßgebliche aktuelle Vorgabe ist
> `audit/niederschlag-vereinheitlichung.md` (+ `docs/niederschlag-architektur.md`). `radarModel.ts`
> (`dbzToMmh`/`mmhToDbz`) bleibt und speist weiter das Regenradar (`expertDbz`).

**Maßgebliche Vorgabe für die Umsetzung (via Claude-Code-CLI).** Die Punkte in `plan.md`/`checklist.md` sind die Kurzfassung; diese Datei ist verbindlich.

> **Scope-Hinweis / Jans Freigabe:** Funktionserweiterung (neuer Kartenlayer), von Jan beauftragt — außerhalb der ursprünglichen Mobile-Mission, analog F1/F2/T2/Command-Deck. Diagnose-First + harte Regeln aus `CLAUDE.md` gelten unverändert.

---

## §0 Abgrenzung zum bestehenden Regenradar/Niederschlag (WICHTIG — Verwechslungsgefahr)

| | Was | Zeitrichtung | Quelle | Status |
|---|---|---|---|---|
| **Niederschlag** (`nowcast`, bestehend) | *gemessenes* Radar + Blend | 0–2 h Messung, danach ICON-D2 | RADOLAN-RV/INCA/MeteoSchweiz + `tot_prec` | live |
| **Regenradar „Der Anflug"** (Feature-Seite) | *gemessener* Nowcast-Loop | ~0–2 h | RADOLAN-RV (SINFONY-Blend) | live |
| **Simuliertes Radar** (`simradar`, **dieser Layer F3**) | *simulierte* Modell-Reflektivität | Zukunft 0–12 h | ICON-D2 `dbz_cmax` (Grid) | neu |

**Kernaussage:** F3 ist **Modell-Reflektivität**, keine Messung. Sein Mehrwert liegt **jenseits** des Nowcast-Horizonts: Das gemessene Radar/Nowcast ist in den ersten ~0–2 h präziser — F3 **verlängert** die gewohnte Radar-Optik auf **0–12 h**, wo es sonst kein Radarbild gibt. In den ersten 2 h ist es die schwächere Quelle (nur Modell), danach die einzige. **Klar als „simuliert/Modell" labeln**, damit Nutzer es nicht mit dem echten Radar verwechseln. `nowcast`/Regenradar bleiben **unverändert** — F3 ergänzt, ersetzt nicht.

**Unterschied zur mm/h-Niederschlagsansicht:** `dbz_cmax` ist Säulen-Maximum-Reflektivität (das „was würde Radar sehen") — konvektive Zellen treten schärfer hervor (inkl. Hagel-/Graupel-Signatur) als in der akkumulierten mm/h-Darstellung. Eigenständige, komplementäre Visualisierung in Radar-Optik.

---

## §1 Ziel

Ein neuer, **standardmäßig inaktiver** Kartenlayer **„Simuliertes Radar"**, der die ICON-D2-Composite-Reflektivität `dbz_cmax` flächig **in der gewohnten Radar-dBZ-Optik** über DACH rendert und über den bestehenden Zeit-Slider 0–12 h in die Zukunft läuft.

**Nutzenversprechen:** „Wie sieht das Radar in 3, 6, 12 Stunden aus?" — verlängert das vertraute Radarbild über den 2-h-Nowcast-Horizont hinaus. Optionale Anreicherung: `echotop` = Gewitterhöhe/-schwere.

**Zielgruppe:** Allgemein · Luftfahrt · Outdoor. **Aufwand: Mittel. Mehrwert-Bewertung: 9/10.**

---

## §2 Diagnose — Datenlage & Wiederverwendung (vor Code)

### §2.1 Verfügbarkeit (bestätigt)
Directory-Listing `https://opendata.dwd.de/weather/nwp/icon-d2/grib/06/` enthält **`dbz_cmax`** (Composite-/Säulen-Maximum), **`dbz_ctmax`** (Cloud-Top-Max), **`dbz_850`** (850 hPa) und **`echotop`** als eigene Parameter-Unterordner. Alle sind reguläre ICON-D2-2,2-km-Gitter (`regular_ll`, **nicht** icosahedral) → **derselbe Decode-Pfad wie Temp/Böen** (`fetchIconD2Grid` → `gribGridDecode`), kein EPS-Pfad.

### §2.2 Feld-Wahl
- **Primär `dbz_cmax`** — die Composite-Max-Reflektivität, exakt das „Radar-CMAX"-Analogon. **Instantan pro Step** (vertikales Maximum, kein Zeit-Intervall-Maximum) → **gültig bei t+0**, **kein** `minStepHours` nötig (anders als `lpi_max`/`vmax_10m`).
- **Optional/vertagt `echotop`** — Echotop-Höhe als Gewitter-Schwere-Signal; im ersten Wurf **nicht** als eigenes Raster, sondern höchstens als Punkt-Readout/Tooltip-Anreicherung (Punkt-Sampling, kein neuer Layer). `dbz_ctmax`/`dbz_850` bleiben außen vor.

### §2.3 Wiederverwendbare Bausteine (Reuse statt Neubau) — der Schlüssel für „gewohnte Optik"
- **`src/radar/radarModel.ts`** enthält bereits die **dBZ↔mm/h-Umrechnung** und die glatten Radar-Paletten (u. a. `precipRainRamp` aus `scalar/RainLayer`, farbfehlsicht-sichere + dBZ-Graustufen-Varianten). **Genau hieran andocken:** `dbz_cmax` (dBZ) → mm/h (Z-R/Marshall-Palmer, schon vorhanden) → **dieselbe Rampe wie das Regenradar**. Damit ist die Optik zum bestehenden Radar/Niederschlag **konsistent**, ohne eine neue Palette zu erfinden.
- **`fetchIconD2Grid`** (`src/sources/iconD2Precip.ts`) lädt `dbz_cmax` direkt (`accumulate: false`, `kind: 'cmax'`/instant).
- **`frameAtValidTime`** (`src/sources/frameAtValidTime.ts`) — Frame-Wahl (ohne `minStepHours`, da t+0 gültig).
- **`ScalarLayer`** (`src/scalar/ScalarLayer.ts`) rendert das Grid — wie der `precipLayer`/`precip-forecast`-ScalarLayer (MapView Z. ~817).
- **Lazy-Load-Muster** (`src/MapView.tsx`): `install<X>Ref` + `useEffect` auf `active.has(key) && !ref` + Sichtbarkeits-Block (~Z. 891) + `refreshIconD2Layers`-Zweig (~Z. 1524). Vorlagen: Clouds (Z. 1602), Gust (Z. 1612). → **Layer lädt erst beim Aktivieren.**

### §2.4 Ehrliche Grenzen (UI/Tooltip)
- **Simuliert, nicht gemessen** — als Modell-Reflektivität kennzeichnen; Tooltip verweist auf das echte Radar/Regenradar als präzisere 0–2-h-Quelle.
- **Domäne:** ICON-D2 DACH + Umland; Modellrand **transparent** maskieren (kein 0).
- **Horizont:** 0–12 h (bis Step-Cap); jenseits keine Falsch-Sicherheit.
- **Unter ~5–10 dBZ transparent** (kein Echo) — analog „kein Regen" der Precip-Rampe.

---

## §3 Darstellung — dBZ-Optik über die vorhandene Radar-Palette

1. `dbz_cmax` in dBZ dekodieren.
2. Über die **bestehende `radarModel.ts`-Umrechnung** dBZ → mm/h (Z-R) bringen.
3. Mit **derselben `precipRainRamp`/Radar-Palette** rendern, die Regenradar/Niederschlag nutzen → optisch identisch zum gewohnten Radar.
4. Schwellen: < ~5–10 dBZ transparent; darüber die vertraute Blau→Grün→Gelb→Orange→Rot→Magenta-Radar-Skala.

**Begründung:** So braucht es **keine** neue Palette und der Nutzer erkennt sofort „das ist Radar". Der einzige nicht-triviale Schritt ist die saubere dBZ→mm/h-Abbildung — die aber in `radarModel.ts` schon existiert und nur wiederverwendet wird (daher Aufwand **Mittel**, nicht Komplex).

---

## §4 Code-Seams (exakte Anschlusspunkte in `src/MapView.tsx`)

1. **`LayerKey`-Union (Z. 218):** `'simradar'` ergänzen.
2. **`LAYER_OPTIONS` (Z. 249):** Eintrag `{ key: 'simradar', label: 'Sim-Radar', title: 'Simuliertes Radar — ICON-D2 Modell-Reflektivität (dbz_cmax, 2,2 km, 0–12 h) in gewohnter Radar-Optik. Verlängert das Regenradar über den 2-h-Nowcast-Horizont hinaus. SIMULIERT, kein gemessenes Radar — in 0–2 h ist das echte Regenradar präziser. DACH.' }`. Position: nahe `nowcast` (thematisch Radar).
3. **`layerRefs` (Z. 473):** optionales Feld `simradar?: ScalarLayer`.
4. **Map-Init-Effekt (~Z. 787ff):** `simRadarLayer = new ScalarLayer({ id: SIMRADAR_LAYER_ID, colorRamp: <Radar-Palette aus radarModel/RainLayer>, visRange: {...} })` + der Karte hinzufügen; `SIMRADAR_LAYER_ID`-Konstante oben bei den anderen `*_LAYER_ID`.
5. **Sichtbarkeits-Block (~Z. 891):** `[SIMRADAR_LAYER_ID]: active.has('simradar')`.
6. **`refreshIconD2Layers` (~Z. 1524):** `simradar`-Zweig, der bei aktivem Layer das Grid neu zieht.
7. **Lazy-Load-Effekt (Muster wie Clouds Z. 1602 / Gust Z. 1612):**
   ```ts
   useEffect(() => {
     if (active.has('simradar') && !iconD2SimRadarRef.current) void installSimRadarRef.current?.();
   }, [active]);
   ```
   `installSimRadarRef` wird im Map-Init-Effekt gesetzt und lädt **erst hier** `dbz_cmax`.
8. **Neue Quelle `src/sources/iconD2Dbz.ts`:** `fetchIconD2Grid('dbz_cmax', { accumulate: false, kind: 'cmax', maxStep: … }, signal)`; dBZ→mm/h-Mapping über `radarModel.ts` wiederverwenden (nicht duplizieren).
9. **Legende:** die bestehende Radar-/Niederschlags-Legende wiederverwenden bzw. spiegeln, mit Zusatz „simuliert (Modell)".

---

## §5 Umzusetzende Maßnahmen (F3-1 … F3-6)

- **F3-1** `src/sources/iconD2Dbz.ts`: Grid-Loader für `dbz_cmax` (Reuse `fetchIconD2Grid`); dBZ-Werte über die vorhandene `radarModel.ts`-Umrechnung auf mm/h abbilden.
- **F3-2** Rendering an die **bestehende Radar-Palette** hängen (`precipRainRamp`/`radarModel`-Ramp) — keine neue Palette; < ~5–10 dBZ transparent.
- **F3-3** `MapView.tsx`: die 7 additiven Seams aus §4 (LayerKey/Option/Ref/Init/Visibility/Refresh/**Lazy-Effekt**) — additiv, keine bestehende Zeile verändern; **`nowcast`/RainLayer/RADOLAN-Pfad NICHT anfassen.**
- **F3-4** Legende + Tooltip mit „simuliert/Modell", Horizont- und Domänen-Hinweisen + Verweis auf das echte Radar als 0–2-h-Referenz.
- **F3-5** (optional/vertagt) `echotop` als Punkt-Readout/Tooltip-Anreicherung (Gewitter-Schwere) — **kein** eigenes Raster, nur wenn ohne Mehraufwand.
- **F3-6** Mobile-Sichtprüfung: Toggle im Sheet-Layer-Segment, Touch-Target, Legende auf 390×844.

---

## §6 Abgrenzung / harte Regeln

- **Additiv & lazy:** nicht im `initialActive`-Default; `dbz_cmax` wird **ausschließlich** beim ersten Aktivieren geladen (Lazy-Effekt §4.7). Kaltstart unberührt.
- **Kein Eingriff** in: den bestehenden `nowcast`/RainLayer/RADOLAN-RV-/INCA-/MeteoSchweiz-Pfad, das Regenradar-Feature, Wind-Shader/WebGL-Pipeline, RGBA8-Packing, Fusion-Engine, EPS-Pfad. `radarModel.ts` wird nur **gelesen/wiederverwendet**, nicht in seinem Verhalten geändert.
- **Transport:** `dbz_cmax` läuft automatisch über den generischen `/_dwd_grib`-Proxy (Edge-`ALLOWED_PREFIX` deckt `icon-d2/grib/` ab). **Optional/vertagt:** in `warm-grib.mjs` vorwärmen.
- **Desktop-Regression:** keine (Layer neu + aus). Desktop-Diff bei ausgeschaltetem Layer pixelgleich.
- **STOPP & FRAGEN**, falls die dBZ→mm/h-Wiederverwendung eine Verhaltensänderung an `radarModel.ts` erzwingen würde, oder `dbz_cmax` nicht regulär-gegittert vorliegt.

---

## §7 Verify (→ `tests.md` V-SIM-RADAR)

1. **Lazy-Load belegt:** Netzwerk-Waterfall — Kartenstart **ohne** `dbz_cmax`-Requests; erst der Toggle „Sim-Radar" löst den Grid-Fetch aus (über `/_dwd_grib`).
2. **Optik-Konsistenz:** die simulierte Reflektivität rendert in **derselben** Radar-Farbskala wie Regenradar/Niederschlag; t+0 plausibel gefüllt (kein `minStepHours` nötig), Domänenrand transparent.
3. **Horizont-Mehrwert:** Slider über 2 h hinaus (z. B. +6 h) → Layer zeigt weiter ein Radarbild, wo der Nowcast endet; Vorwärtsschau bis Step-Cap; 30-min-Refresh zieht bei aktivem Layer nach.
4. **Abgrenzung zur Messung:** „Sim-Radar" (Modell) und „Niederschlag"/Regenradar (Messung) gleichzeitig nachvollziehbar; Tooltip/Legende benennen „simuliert" und die 0–2-h-Präferenz fürs echte Radar.
5. **Diff:** nur neue Datei(en) + additive `MapView.tsx`-Seams; `nowcast`/RainLayer/RADOLAN/`radarModel.ts`-Verhalten/Wind-Shader/RGBA8/Fusion/EPS unberührt (Diff-Beleg).
6. **Mobile (390×844):** Toggle im Sheet-Layer-Segment, Touch-Target ≥ 44 px, Legende sichtbar, keine neuen Konsolenfehler; Desktop mit aktivem/inaktivem Layer sauber; `npm run typecheck` grün.

**Gate GF3:** Lazy-Load im Waterfall belegt (0 Requests vor Aktivierung) · Optik konsistent zur bestehenden Radar-Palette · t+0 nicht leer · Horizont-Mehrwert jenseits 2 h sichtbar · klar als „simuliert" abgegrenzt · Domänenrand ehrlich maskiert · additiver Diff (radarModel.ts-Verhalten unberührt) · Mobile-Toggle sauber · Desktop unverändert · Konsole/Typecheck grün.

---

## §8 Diagnose-Ergebnis (vor Code, 2026-07-24)

Live-Sondierung gegen `opendata.dwd.de` (Lauf 2026072406) + Code-Mapping gegen die
bestehende Pipeline. **Ergebnis: kein STOPP — alle Reuse-Annahmen bestätigt.**

### §8.1 Verfügbarkeit & Gitter (Diagnose-Punkt 1) — BESTÄTIGT
- `weather/nwp/icon-d2/grib/06/dbz_cmax/` enthält **beide** Gitter-Varianten:
  `icon-d2_germany_**regular-lat-lon**_single-level_…` UND `…icosahedral…` — genau wie
  `t_2m`/`vmax_10m`/`tot_prec`. (Erstsonde zeigte nur `icosahedral`, weil alphabetisch
  vor `regular`; die zweite Sonde belegt beide.)
- Die `regular-lat-lon`-Dateien matchen **unverändert** die bestehende Regex in
  `iconD2Precip.ts:87` (`icon-d2_germany_regular-lat-lon_single-level_<run>_<SSS>_2d_<param>.grib2.bz2`)
  → **derselbe Decode-Pfad wie Temp/Böen** (`resolveLatestRun` → `fetchRunSteps` →
  `fetchStepField` → `gribDecode`, GDT 0 reguläres lat-lon, DE + Umfeld). **KEIN**
  icosahedraler/EPS-Pfad, **kein** Decode-Eingriff.
- Schritt-Liste `regular-lat-lon`: **000–048** (49 Schritte, stündlich). Sample
  `…_003_…dbz_cmax.grib2.bz2` → HTTP 200, 2,34 MB. Cap auf **0–12 h** (§1), Slider
  darüber zeigt via `bracketAtValidTime` den nächstliegenden 12-h-Frame.
- Reuse-Entscheidung (wie F2/LPI, §8.4 dort): **`fetchStepField` (rohes Feld), NICHT
  `fetchIconD2Grid`**. Grund: `fetchIconD2Grid` quantisiert per `GridToU8Kind` auf
  Uint8, und der Enum kennt **nur** `'precip' | 'cloud' | 'cape'` — **kein `'cmax'`**.
  Ein neuer Kind würde `gribGridDecode.ts` (Decode-Nachbarschaft) anfassen; der
  rohe Ein-Feld-Pfad (Böen/LPI-Muster) ist additiv und decode-frei. Der Spec-
  Vorschlag `fetchIconD2Grid(kind:'cmax')` (§4.8) ist damit bewusst durch das
  etablierte `fetchStepField`-Muster ersetzt — dieselben Bytes, kein Decode-Enum-Eingriff.

### §8.2 Instantan / t+0 gültig (Diagnose-Punkt 2) — BESTÄTIGT
- `dbz_cmax` ist das **vertikale Säulen-Maximum** der Reflektivität, **instantan pro
  Step** (kein Zeit-Intervall-Maximum wie `lpi_max`/`vmax_10m`). Beleg: Schritt **000
  ist publiziert** (regular-lat-lon) — bei einem Intervall-Maximum wäre t+0 strukturell
  leer/fehlend (vgl. `lpi_max`, das erst ab 001 startet).
- Folge: **KEIN `minStepHours`** im Frame-Selektor. `bracketAtValidTime(frames, targetMs)`
  ohne dritten Parameter (Muster **Gewitter/thunder**, nicht LPI). Loader lädt ab **Step 0**.

### §8.3 dBZ→mm/h-Reuse (Diagnose-Punkt 3) — additiv, ohne Verhaltensänderung
- `radarModel.ts` besitzt nur die **Vorwärts**-Umrechnung `mmhToDbz` (Marshall-Palmer
  `Z = 200·R^1.6`). Für den Layer wird die **Inverse** `dbzToMmh` gebraucht.
- Maßnahme: **`dbzToMmh` als NEUER, reiner Export** in `radarModel.ts` — dieselben
  Konstanten (200 / 1,6), Single-Source-of-Truth (kein Duplizieren der Physik, §5 F3-1).
  Die bestehenden Funktionen (`mmhToDbz`, `verifyRadarModel`, Paletten, …) bleiben
  **byte-identisch** → **kein Verhaltens-Eingriff**. Präzedenz: F1 exportierte zusätzlich
  aus `convectiveIndex.ts` und passierte damit sein Gate („nur 2× export"). `verifyRadarModel`
  wird **nicht** angefasst; die Korrektheit von `dbzToMmh` prüft ein separates
  `scripts/verify-simradar.mjs` (Rundlauf `mmhToDbz(dbzToMmh(d))==d`, Schwellen-Mapping).
- Render: `R = clamp01(dbzToMmh(dbz) / PRECIP_VMAX)` (PRECIP_VMAX = 20 mm/h) und Palette
  **`precipRainRamp`** (die EXAKTE Rampe des `nowcast`/RainLayer). Da der RainLayer sein
  Raster ebenfalls gegen PRECIP_VMAX=20 normiert, bildet **dasselbe mm/h dieselbe Farbe** ab
  → Optik pixel-konsistent zum gemessenen Radar. Konvektive Kerne (≥ 50 dBZ ≈ 49 mm/h)
  klemmen bei t=1 → Magenta („extrem") — vertraute Radar-Signatur.

### §8.4 Ehrliche Grenzen / Transparenz (Diagnose-Punkt 4) — BESTÄTIGT
- Außer-Domäne-Zellen: `gribDecode.ts` liefert dort NaN (Bitmap-Maske) → im Bild
  `alpha = 0` → **transparent, nie 0** (Muster LPI/Thunder).
- Unter ~5–10 dBZ transparent: `precipRainRamp` hat den 0-Stop bereits transparent
  (erste sichtbare Stufe t=0,003 ≈ 4,5 dBZ). Zusätzlich `visRange {start:0.004, end:0.011}`
  → Fade **~5,5 → ~11,8 dBZ**, darunter transparent (kein „kein-Echo"-Einfärben).

### §8.5 Abgrenzung (unverändert bleibt)
`nowcast`/RainLayer/RADOLAN-RV/INCA/MeteoSchweiz, das Regenradar-Feature,
`radarModel.ts`-**Verhalten** (nur additiver `dbzToMmh`-Export), Wind-Shader/RGBA8,
Fusion-Engine, EPS-Pfad, `gribGridDecode.ts`/`GridToU8Kind`. Neue Datei
`src/sources/iconD2Dbz.ts` + additive `MapView.tsx`/`LayerIcon.tsx`/`LayerInfoPanel.tsx`-Seams.

**Fazit:** Reguläres Gitter ✓, t+0 gültig ✓, dBZ→mm/h-Reuse additiv ✓, Domänen-/Schwellen-
Transparenz ✓ → **implementieren, kein STOPP & FRAGEN.**

---

## §9 Verify-Protokoll V-SIM-RADAR (Ergebnis, 2026-07-24, Dev :5195)

Chrome DevTools MCP, Karte `#m=…DACH`. Belege unter `audit/screenshots/simuliertes-radar/`.

1. **Lazy-Load belegt (kritisch) — ✓.** Kaltstart (Desktop 1440×900) = **126** fetch/xhr,
   davon **0** `dbz_cmax` (nur `u_10m`/`t_2m`-Listings des Default-Windlayers). Nach dem
   Toggle „Sim-Radar": +19 Requests — ein Directory-Listing (`/_dwd_opendata/…/09/dbz_cmax/`)
   **plus die Step-Dateien 000–012** über **`/_dwd_grib/…/dbz_cmax/icon-d2_germany_
   regular-lat-lon_single-level_2026072409_0NN_2d_dbz_cmax.grib2.bz2`**, alle **HTTP 200**
   (Lauf 2026072409). Beleg: Waterfall vor/nach (reqid 686–719).
2. **Optik-Konsistenz — ✓.** Legende + Info-Panel rendern die **`precipRainRamp`**
   (Blau→Grün→Gelb→Orange→Magenta) — dieselbe Skala wie `nowcast`/Regenradar; **Step 000
   geladen** (t+0, **kein** `minStepHours`); Domänenrand transparent (dunkler DACH-Wash vs.
   durchscheinendes Umland). `verify-simradar.mjs`: **21/21 PASS** (dBZ→mm/h-Rundlauf,
   Monotonie, 5–12-dBZ-`visRange`-Fenster, 5 mm/h→t=0,25 == nowcast-Normierung).
   Beleg: `after-desktop-simradar-now.png`.
3. **Horizont-Mehrwert jenseits 2 h — ✓.** Mit vollem Slider (`?startnow=0`, max +23 h) auf
   **+6 h (Fr 18:11)** — der Layer bleibt aktiv **über** den 2-h-Nowcast-Horizont hinaus
   (dort endet RADOLAN-RV). **24.07. ist DACH-weit trocken (0,0 mm, 0 % Niederschlag) →
   `dbz_cmax` flächig ~0 → Layer korrekt transparent** (physikalisch richtig, kein Fehler,
   wie F1/F2 an ruhigen Tagen). Der Renderpfad ist über die 13 fehlerfrei dekodierten
   Frames + leere Konsole belegt; die Optik über die geteilte Rampe. Beleg:
   `after-desktop-simradar-plus6h.png`.
4. **Abgrenzung zur Messung — ✓.** Toggle-Titel, Info-Panel und Legende benennen
   **„simuliert / Modell, nicht gemessen"**, den **0–12-h-Horizont** und die **0–2-h-Präferenz
   fürs echte Radar/„Niederschlag"**; Domänenrand „ohne Wert". „Sim-Radar" (Modell) und
   „Niederschlag" (Messung) stehen als getrennte Toggles direkt nebeneinander.
5. **Diff/Abgrenzung — ✓.** `git diff src/radar/radarModel.ts` = **nur** der additive
   `dbzToMmh`-Export (keine bestehende Zeile geändert → Verhalten byte-identisch). Neu:
   `src/sources/iconD2Dbz.ts`, `scripts/verify-simradar.mjs`. Additive Seams:
   `MapView.tsx`/`LayerIcon.tsx`/`LayerInfoPanel.tsx`/`package.json`. **Unberührt:**
   `RainLayer.ts`/`ScalarLayer.ts`/`radolan.ts`/`gribDecode.ts`/`gribGridDecode.ts`/
   `GridToU8Kind`/`dwd-grib.ts`/Wind-Shader/RGBA8/Fusion/EPS. (`iconD2WindSource.ts` „M"
   im Tree ist eine **vorbestehende** Änderung, nicht F3.)
6. **Mobile (390×844) — ✓.** Toggle „Sim-Radar" im Sheet-Layer-Segment (Gruppe
   Niederschlag) erreichbar, Touch-Target **453×56 px** (≥ 44), Legende „Sim-Radar ·
   simuliert" sichtbar; **keine** neuen Konsolen-Errors/-Warnings (Desktop + Mobile leer);
   Desktop mit aktivem **und** inaktivem Layer sauber (additiv, off im Default); `npm run
   typecheck` grün. Belege: `after-mobile-layer-sheet.png`, `after-mobile-simradar-legend.png`.

### §9.1 Selbstverifikation (CLAUDE.md) mit Beleg
1. **Bestehende Funktionen erhalten?** Ja — rein additiv (neuer Layer + `dbzToMmh`-Export).
   `nowcast`/RainLayer/RADOLAN/Regenradar unverändert; `radarModel.ts`-Bestand byte-identisch
   (§9 Punkt 5). Kein Toggle/Feature entfernt.
2. **Desktop pixelgleich?** Ja — Layer standardmäßig aus, `initialActive` unverändert; mit
   inaktivem Layer ist der Kaltstart identisch (126 Requests, 0 `dbz_cmax`).
3. **Touch-Targets ≥ 44 px?** Ja — Sim-Radar-Zeile 453×56 px (§9 Punkt 6).
4. **Konsole frei von neuen Errors/Warnings?** Ja — `list_console_messages` (error/warn)
   leer, Desktop + Mobile.
5. **Keine Long Tasks > 200 ms?** Toggle/Scrub blieben interaktiv; das progressive Laden
   (Concurrency 4, bz2 im Worker-Pool, Grid-Decode off-main) folgt exakt dem etablierten
   Böen/LPI-Muster ohne Main-Thread-Blockade. (GPU-/Real-Device-Vorbehalt gilt nur für
   Shader-Effekte — hier kein neuer Shader.)

**Gate GF3: PASSIERT** — alle sechs V-SIM-RADAR-Punkte grün mit Beleg.
