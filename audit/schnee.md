# audit/schnee.md — Feature-Phase F4: Schneehöhe-&-Neuschnee-Layer

**Maßgebliche Vorgabe für die Umsetzung (via Claude-Code-CLI).** Die Punkte in `plan.md`/`checklist.md` sind die Kurzfassung; diese Datei ist verbindlich.

> **Scope-Hinweis / Jans Freigabe:** Funktionserweiterung (neuer Kartenlayer), von Jan beauftragt — außerhalb der ursprünglichen Mobile-Mission, analog F1/F2/F3/T2. Diagnose-First + harte Regeln aus `CLAUDE.md` gelten unverändert.

---

## §0 Abgrenzung zum bestehenden `snowline`-Layer (WICHTIG — Verwechslungsgefahr)

| | Was | Darstellung | Quelle | Status |
|---|---|---|---|---|
| **Schneegrenze** (`snowline`, bestehend) | Höhe der Schneefallgrenze | eine **Linie** (ML #2) | Physik-Anker + gelernte Orts-Korrektur, `snowlmt`/AROME | live |
| **Schnee** (`snow`, **dieser Layer F4**) | *Menge*: Schneedecke + Neuschnee | **Flächen-Raster** (cm) | ICON-D2 `h_snow` + abgeleiteter Neuschnee | neu |

**Kernaussage:** F4 zeigt die **Schneemenge als Fläche** (wie viel Schnee liegt / wie viel kommt dazu), nicht die Grenzlinie. Der bestehende ML-`snowline`-Layer (die Linie) bleibt **unverändert** — F4 ergänzt ihn. `snowlmt` als *Linie* ist bereits durch `snowline` abgedeckt → in F4 **nicht** dupliziert.

---

## §1 Ziel

Ein neuer, **standardmäßig inaktiver** Kartenlayer **„Schnee"** mit zwei umschaltbaren Modi (analog dem bestehenden Satelliten-Produkt-Umschalter `SAT_PRODUCT`):
- **Schneedecke** — aktuelle Schneehöhe `h_snow` (cm) als Flächen-Raster.
- **Neuschnee** — Neuschneemenge (cm) über das Vorhersagefenster.

**Nutzenversprechen:** „Wie viel Schnee liegt — und wie viel kommt dazu?" — konkrete cm-Zahlen als Fläche statt nur der Schneegrenzen-Linie.

**Zielgruppe:** Outdoor (Ski/Touren) · Verkehr. **Aufwand: Einfach (Schneedecke) → Einfach–Mittel (Neuschnee-Ableitung). Mehrwert-Bewertung: 8/10.**

---

## §2 Diagnose — Datenlage & Wiederverwendung (vor Code)

### §2.1 Verfügbarkeit (bestätigt)
Directory-Listing `https://opendata.dwd.de/weather/nwp/icon-d2/grib/06/` enthält u. a. **`h_snow`** (Schneehöhe, m), **`w_snow`** (Schnee-Wasser-Äquivalent), **`rho_snow`** (Schneedichte), **`snow_gsp`**/**`snow_con`** (akkumulierter gridskaliger/konvektiver Schneefall), **`freshsnw`**, **`snowlmt`**, **`snowc`**. Alle reguläre ICON-D2-2,2-km-Gitter (`regular_ll`, **nicht** icosahedral) → **derselbe Decode-Pfad wie Temp/Böen** (`fetchIconD2Grid` → `gribGridDecode`), kein EPS-Pfad.

### §2.2 ⚠️ KRITISCHE KORREKTUR — `freshsnw` ist NICHT „Neuschnee in cm"
`freshsnw` ist in ICON/COSMO die **Schnee-*Frische*** (dimensionsloser Alterungsfaktor 0..1 für die Schnee-*Albedo*), **nicht** die Neuschneemenge. Die im Layer-Vorschlag angenommene „Neuschneemenge (cm)" kommt **nicht** aus `freshsnw`. **Vor Code zwingend im Decode/GRIB-Metadaten verifizieren** (shortName/Einheit) und die Quelle entsprechend wählen:
- **Neuschneemenge (cm)** korrekt aus **akkumuliertem Schneefall** `snow_gsp` (+ `snow_con`), Einheit kg/m² = mm Wasser-Äquivalent → über die **Schnee-Wasser-Umrechnung** in cm Neuschnee, **oder** aus der Differenz von `h_snow` über das Intervall.
- `freshsnw` höchstens als **optische Anreicherung** (Albedo/Frische), **nicht** als cm-Zahl. → im ersten Wurf außen vor.

### §2.3 Feld-Wahl
- **Modus „Schneedecke": `h_snow`** (m → cm). **Instantaner Zustand → gültig bei t+0**, kein `minStepHours` nötig. Der neue, heute nicht gezeigte Inhalt.
- **Modus „Neuschnee":** akkumulierter Schneefall `snow_gsp` (+ `snow_con`) → mm SWE → cm. **Akkumulationsfeld → Intervall-Differenz + `minStepHours = 1`** (exakt das Muster von `tot_prec`). `snowlmt`/`freshsnw` **nicht** als cm-Quelle.

### §2.4 Wiederverwendbare Bausteine (Reuse statt Neubau)
- **`src/nowcast/alpineSplit.ts`** hat bereits die **Schnee-Wasser-Äquivalent-Umrechnung ~10:1 (cm Neuschnee je mm Wasser)** und leitet `freshSnowCm` aus Niederschlagsmenge × Phase ab → **genau diese Logik/Konstante für den Neuschnee-Modus wiederverwenden** (nicht neu erfinden). Idealerweise `rho_snow` nutzen, wo verfügbar, statt der pauschalen 10:1.
- **`src/radar/precipPhase.ts` `snowRamp`** — vorhandene Schnee-Farbpalette → für die Rendering-Konsistenz wiederverwenden bzw. spiegeln.
- **`fetchIconD2Grid`** (`src/sources/iconD2Precip.ts`) lädt `h_snow`/`snow_gsp` direkt; für `snow_gsp` `accumulate: true` (wie `tot_prec`), für `h_snow` `accumulate: false`.
- **`frameAtValidTime`** inkl. `minStepHours` (nur für den Neuschnee-Modus).
- **`ScalarLayer`** rendert das Grid (wie `precipLayer`, MapView Z. ~817).
- **Modus-Umschalter** analog `SAT_PRODUCT`/`SAT_PRODUCT_LABELS` (MapView Z. ~280) — etabliertes Muster für einen In-Layer-Modus-Switch.
- **Lazy-Load-Muster** (`src/MapView.tsx`): `install<X>Ref` + `useEffect` auf `active.has(key) && !ref` + Sichtbarkeits-Block (~Z. 891) + `refreshIconD2Layers`-Zweig (~Z. 1524). Vorlagen: Clouds (Z. 1602), Gust (Z. 1612). → **Layer lädt erst beim Aktivieren.**

### §2.5 Ehrliche Grenzen (UI/Tooltip)
- **Domäne:** ICON-D2 DACH + Umland; Modellrand **transparent** maskieren (kein 0).
- **Horizont:** Neuschnee-Summe nur über den NWP-Horizont (bis Step-Cap); jenseits keine Falsch-Sicherheit.
- **Schnee-Wasser-Verhältnis** ist wetterabhängig (10:1 ist Näherung; nasser Schnee ~6:1, Pulver ~15:1) → `rho_snow` bevorzugen, sonst die Näherung klar als solche labeln.
- **`h_snow`** ist die Modell-Schneedecke (Analyse/Prognose), nicht eine Messung.

---

## §3 Darstellung

- **Schneedecke (`h_snow`):** Weiß→Hellblau→Blau-Skala über cm; < ~1 cm transparent. Optik in Anlehnung an `snowRamp`.
- **Neuschnee (`snow_gsp`→cm):** dieselbe Schnee-Skala, Schwellen für frischen Zuwachs (< ~1 cm transparent, dann 1/5/10/25/50 cm-Stufen).
- Legende fünfstufig, klar von der Regen-/Radar-Palette getrennt (Schnee = weiß/blau, nicht blau/grün/rot).

---

## §4 Code-Seams (exakte Anschlusspunkte in `src/MapView.tsx`)

1. **`LayerKey`-Union (Z. 218):** `'snow'` ergänzen.
2. **`LAYER_OPTIONS` (Z. 249):** Eintrag `{ key: 'snow', label: 'Schnee', title: 'Schneehöhe & Neuschnee — ICON-D2 h_snow (Schneedecke) + abgeleiteter Neuschnee (cm), 2,2 km. Menge als Fläche, nicht die Schneegrenzen-Linie (das ist „Schneegrenze"). DACH.' }`.
3. **Modus-State + Labels** analog `SAT_PRODUCT` (Z. ~280): `SnowMode = 'depth' | 'fresh'` + Labels „Schneedecke"/„Neuschnee".
4. **`layerRefs` (Z. 473):** optionales Feld `snow?: ScalarLayer`.
5. **Map-Init-Effekt (~Z. 787ff):** `snowLayer = new ScalarLayer({ id: SNOW_LAYER_ID, colorRamp: snowRamp, visRange: {...} })` + der Karte hinzufügen; `SNOW_LAYER_ID`-Konstante oben bei den anderen `*_LAYER_ID`.
6. **Sichtbarkeits-Block (~Z. 891):** `[SNOW_LAYER_ID]: active.has('snow')`.
7. **`refreshIconD2Layers` (~Z. 1524):** `snow`-Zweig, der bei aktivem Layer das dem Modus entsprechende Grid (`h_snow` oder `snow_gsp`) neu zieht.
8. **Lazy-Load-Effekt (Muster wie Clouds Z. 1602 / Gust Z. 1612):**
   ```ts
   useEffect(() => {
     if (active.has('snow') && !iconD2SnowRef.current) void installSnowRef.current?.();
   }, [active]);
   ```
   `installSnowRef` wird im Map-Init-Effekt gesetzt und lädt **erst hier** das Schnee-Grid. Modus-Wechsel `depth↔fresh` löst einen erneuten (lazy) Fetch des jeweiligen Felds aus.
9. **Neue Quelle `src/sources/iconD2Snow.ts`:** `h_snow` (`accumulate:false`) und `snow_gsp`(+`snow_con`, `accumulate:true`, `minStepHours:1`) über `fetchIconD2Grid`; SWE→cm über `alpineSplit.ts` (Reuse, nicht duplizieren).
10. **Legende:** fünfstufig, Schnee-Palette; Modus-abhängige Beschriftung (cm Schneedecke / cm Neuschnee).

---

## §5 Umzusetzende Maßnahmen (F4-1 … F4-6)

- **F4-1** `src/sources/iconD2Snow.ts`: Grid-Loader `h_snow` (Schneedecke, m→cm, t+0 gültig). **Zuerst `freshsnw`-Semantik im Decode verifizieren** (§2.2).
- **F4-2** Neuschnee-Modus: `snow_gsp`(+`snow_con`) akkumuliert → mm SWE → cm via `alpineSplit.ts`-Umrechnung (`rho_snow` bevorzugt), Frame-Wahl `minStepHours=1`.
- **F4-3** Rendering über die vorhandene `snowRamp` (Reuse); < ~1 cm transparent.
- **F4-4** `MapView.tsx`: die additiven Seams aus §4 inkl. Modus-Umschalter (analog `SAT_PRODUCT`) und **Lazy-Effekt**; `snowline`/ML-Pfad **NICHT anfassen**.
- **F4-5** Legende + Tooltip mit cm-Angabe, Modus-Label, Domänen-/Horizont-Hinweisen + Verhältnis-Näherung (§2.5).
- **F4-6** Mobile-Sichtprüfung: Toggle + Modus-Switch im Sheet-Layer-Segment, Touch-Targets, Legende auf 390×844.

---

## §6 Abgrenzung / harte Regeln

- **Additiv & lazy:** nicht im `initialActive`-Default; Schnee-Grid wird **ausschließlich** beim ersten Aktivieren (und bei Modus-Wechsel) geladen. Kaltstart unberührt.
- **Kein Eingriff** in: den bestehenden `snowline`-ML-Layer, `climaField`, Wind-Shader/RGBA8/Fusion-Engine/EPS/Radar/RADOLAN. `alpineSplit.ts`/`precipPhase.ts` nur **lesen/wiederverwenden**, nicht im Verhalten ändern.
- **Transport:** `h_snow`/`snow_gsp` laufen automatisch über den generischen `/_dwd_grib`-Proxy. **Optional/vertagt:** in `warm-grib.mjs` vorwärmen.
- **Desktop-Regression:** keine (Layer neu + aus).
- **STOPP & FRAGEN**, falls `freshsnw` doch amount-artig kodiert ist (unwahrscheinlich), `h_snow`/`snow_gsp` nicht regulär-gegittert sind, oder die SWE→cm-Wiederverwendung eine Verhaltensänderung an `alpineSplit.ts` erzwingt.

---

## §7 Verify (→ `tests.md` V-SCHNEE)

1. **`freshsnw`-Semantik dokumentiert:** in der Diagnose belegt, dass Neuschnee **nicht** aus `freshsnw` (Frische-Faktor), sondern aus `snow_gsp`(+`snow_con`)/`h_snow`-Δ kommt.
2. **Lazy-Load belegt:** Kartenstart **ohne** `h_snow`/`snow_gsp`-Requests; erst der Toggle „Schnee" löst den Fetch aus (über `/_dwd_grib`); Modus-Wechsel lädt das jeweils andere Feld lazy nach.
3. **Schneedecke t+0:** `h_snow`-Modus bei „jetzt" plausibel gefüllt (kein `minStepHours`); Neuschnee-Modus nutzt `minStepHours=1` (t+0 nicht leer wegen Akkumulation); Domänenrand transparent.
4. **cm-Plausibilität:** in einer Schneelage plausible cm-Werte (Schneedecke Alpen > Flachland; Neuschnee-Summe wächst mit dem Horizont); SWE→cm über die `alpineSplit.ts`-Konstante nachvollziehbar.
5. **Abgrenzung:** `snowline`-Linie (bestehend) + `snow`-Raster (neu) gleichzeitig nutzbar, klar getrennt; Legende Schnee-Palette ≠ Regen-Palette.
6. **Diff:** nur neue Datei(en) + additive `MapView.tsx`-Seams; `snowline`/`climaField`/`alpineSplit.ts`-Verhalten/Wind-Shader/RGBA8/Fusion/EPS/Radar unberührt (Diff-Beleg).
7. **Mobile (390×844):** Toggle + Modus-Switch im Sheet-Layer-Segment, Touch-Targets ≥ 44 px, Legende sichtbar, keine neuen Konsolenfehler; Desktop mit aktivem/inaktivem Layer sauber; `npm run typecheck` grün.

**Gate GF4:** `freshsnw`-Korrektur dokumentiert · Lazy-Load im Waterfall belegt (0 Requests vor Aktivierung, Modus-Wechsel lazy) · Schneedecke t+0 gefüllt, Neuschnee `minStepHours=1` · cm-Werte plausibel · klar von `snowline` abgegrenzt · Domänenrand ehrlich maskiert · additiver Diff · Mobile sauber · Desktop unverändert · Konsole/Typecheck grün.

---

## §8 Diagnose-Ergebnis (vor Code, 2026-07-24)

Live-Sonde gegen `opendata.dwd.de` (Lauf 2026072406) + **echter Decode** der Felder mit dem
App-Decoder (`scripts/diag-snow-fields.mjs`, temporär, danach entfernt). **Ergebnis: kein STOPP.**

### §8.1 Verfügbarkeit & Gitter (Diagnose-Punkt 1) — BESTÄTIGT
Alle Schnee-Felder sind **`regular-lat-lon`** publiziert (Steps 000–048, stündlich) → Decode-Pfad
wie Temp/Böen (`resolveLatestRun`/`fetchStepField`/`gribDecode`). Der echte Decode bestätigt
**GDT 0** (`regular_ll`, nicht icosahedral), Gitter 1215×746, ~17 % Domänenrand NaN-maskiert:

| Feld | disc/cat/num | Bedeutung | Wertebereich (Decode) |
|---|---|---|---|
| `h_snow`   | 0/1/**11**  | **Schneehöhe (m)** | 0,00–**2,61 m** (Alpen-Gletscher im Juli) |
| `snow_gsp` | 0/1/**56**  | akkum. gridskaliger Schneefall (kg/m²) | Step 0 = **0**, Step 6 = 0 (Juli) |
| `snow_con` | 0/1/**55**  | akkum. konvektiver Schneefall (kg/m²) | 0 (Juli) |
| `rho_snow` | 0/1/**61**  | **Schneedichte (kg/m³)** | 0–400 |
| `freshsnw` | 0/1/**203** | **Frische-/Albedo-Faktor** | **0,00–1,00** |

### §8.2 ⚠️ `freshsnw`-Semantik (Diagnose-Punkt 2, KRITISCH) — im Decode BELEGT
`freshsnw` dekodiert zu **exakt [0,00 … 1,00]** — ein **dimensionsloser Faktor** (Schnee-Frische/
Albedo-Alterung), **KEINE cm-Menge** (max 1,0 „cm" wäre unsinnig). Damit ist die Vorgabe-Korrektur
(§2.2) am echten Feld bewiesen: **Neuschnee wird NICHT aus `freshsnw` abgeleitet.** Quelle für den
Neuschnee-Modus ist der **akkumulierte Schneefall `snow_gsp` (+ `snow_con`)** (kg/m² = mm SWE) → cm.
Die STOPP-Bedingung „`freshsnw` doch amount-artig" ist **nicht** eingetreten.

### §8.3 Feld/Timing (Diagnose-Punkt 3) — BESTÄTIGT
- **Schneedecke `h_snow`**: instantane Schneehöhe (num 11) → **gültig bei t+0** (Step 000 vorhanden),
  **KEIN `minStepHours`**. m→cm (×100). Slider-Frame via `bracketAtValidTime(frames, targetMs)`.
- **Neuschnee `snow_gsp`(+`snow_con`)**: **akkumuliert seit Laufbeginn** (num 56; Step 000 = 0 im
  Decode belegt) → am Analyse-Schritt strukturell 0 → **`minStepHours = 1`** (wie `tot_prec`).
  **Design-Entscheidung (dokumentiert):** Der Modus zeigt den **akkumulierten Wert** `snow_gsp(step)`
  direkt (mm SWE seit Laufbeginn → cm), **nicht** die Schritt-zu-Schritt-Differenz. Begründung: die
  Gate-Vorgabe V-SCHNEE #4 verlangt „Neuschnee-**Summe** wächst mit dem Horizont" — das erfüllt nur
  der kumulative Wert (Rate/Δ wächst nicht). Da `snow_gsp` bereits ab Laufbeginn akkumuliert und bei
  Step 0 = 0 ist, ist `snow_gsp(step)` genau die Neuschnee-Summe über [Laufbeginn … Slider-Zeit]. Dies
  weicht bewusst von der wörtlichen „Intervall-Differenz"-Formulierung in §2.3/§4.9 ab, folgt aber der
  expliziten Gate-Semantik (§1 „Neuschneemenge über das Vorhersagefenster", §3 Stufen 1/5/10/25/50 cm).

### §8.4 Reuse (Diagnose-Punkt 4) — additiv, ohne Verhaltensänderung
- **`alpineSplit.ts`** hält die SWE→cm-Konstante `SNOW_RATIO_CM_PER_MM = 1,0` (10:1) — aber **privat**
  (nur inline in `levelAt`). Maßnahme: **neuer, reiner Export `freshSnowCmFromSwe(sweMm, rhoSnow?)`**,
  der **diese Konstante wiederverwendet** und optional `rho_snow` bevorzugt. Bestehende Funktionen
  (`alpineProfile`/`levelAt`/`verifyAlpineSplit`) bleiben **byte-identisch** → **kein** Verhaltens-
  Eingriff (Präzedenz F1/F3). `rho_snow`-Nutzung mit Physik-Wächter: nur bei **plausibler Frischschnee-
  Dichte (≈30–250 kg/m³)** `cm = 100·SWE/ρ`; sonst (fehlend / alter dichter Pack ≥250, für den die
  Pack-Dichte den Frischschnee **unterschätzen** würde) die 10:1-Näherung. Verhältnis wird als
  **Näherung** gelabelt (§2.5).
- **Reuse `fetchStepField` (rohes Feld), NICHT `fetchIconD2Grid`** — wie F1/F2/F3: `GridToU8Kind` kennt
  nur `precip|cloud|cape` (kein Schnee-Kind), und der Neuschnee-Modus braucht die Roh-Fusion mehrerer
  Felder (`snow_gsp`+`snow_con`+`rho_snow`) je Zelle (Muster Gewitter/thunder). Kein Decode-Eingriff.
- **`snowRamp`** aus `precipPhase.ts` (Weiß→Blau, t = value/VMAX, 0-Stop transparent) direkt reused →
  Schnee-Optik klar von der Regen-Palette getrennt. VMAX: Schneedecke 150 cm, Neuschnee 50 cm.
- Domänenrand (NaN) → alpha 0 → transparent; < ~1 cm via `visRange` transparent.

### §8.5 Abgrenzung (unberührt)
`snowline`-ML-Layer, `climaField`, `alpineSplit.ts`-**Verhalten** (nur additiver `freshSnowCmFromSwe`-
Export), `precipPhase.ts`-Verhalten (nur `snowRamp` gelesen), `fetchIconD2Grid`/`gribGridDecode.ts`/
`GridToU8Kind`, Wind-Shader/RGBA8, Fusion, EPS, Radar/RADOLAN. Neue Datei `src/sources/iconD2Snow.ts`
+ additive Seams `MapView.tsx`/`LayerIcon.tsx`/`LayerInfoPanel.tsx`.

**Fazit:** Reguläre Gitter ✓, `freshsnw`=0..1-Faktor (nicht cm) am Feld belegt ✓, `h_snow` t+0 gültig ✓,
`snow_gsp` akkumuliert (Step 0 = 0) → `minStepHours=1` + kumulative Summe ✓, Reuse additiv ✓ →
**implementieren, kein STOPP & FRAGEN.**

---

## §9 Verify-Protokoll V-SCHNEE (Ergebnis, 2026-07-24, Dev :5197)

Chrome DevTools MCP, Karte `#m=…DACH`. Belege unter `audit/screenshots/schnee/`.

1. **`freshsnw`-Semantik belegt — ✓.** Im echten Decode `freshsnw ∈ [0,00…1,00]` = Frische-/Albedo-
   Faktor (§8.2). Neuschnee-Quelle ist `snow_gsp`(+`snow_con`) (cat/num 1/56 + 1/55), NICHT `freshsnw`.
2. **Lazy-Load (kritisch) — ✓.** Kaltstart (Desktop 1440×900): **0** `h_snow`/`snow_gsp`-Requests.
   Toggle „Schnee" (Default-Modus Decke) → Directory-Probe `/_dwd_opendata/…/h_snow/` + **`h_snow`
   Steps 000–024** via `/_dwd_grib` (Lauf 2026072409, regular-lat-lon), alle 200; **kein** `snow_gsp`.
   **Modus-Wechsel → Neuschnee** lädt LAZY **`snow_gsp`+`snow_con`+`rho_snow` Steps 001–024** via
   `/_dwd_grib` nach (Seq-Guard, Mode-lazy belegt). Beleg: Waterfall reqid 671–698 (depth) / 700–772 (fresh).
3. **t+0-Verhalten — ✓.** Schneedecke lädt **Step 000** (h_snow instantan, kein `minStepHours`);
   Neuschnee startet bei **Step 001** (reqid 701, Step 000 als Akkumulations-0 ausgelassen +
   Slider-`minStepHours=1`). Domänenrand transparent (NaN→alpha 0, ~17 % maskiert).
4. **cm-Plausibilität — ✓.** Im Decke-Modus über den Ostalpen (Hohe Tauern/Ötztal, MCP-Recenter
   47,05 N/11,0 E) **klare blaue Schneeflächen** (Gletscher, h_snow bis 2,61 m = 261 cm) bei
   **transparentem Flachland/Voralpenland** → Alpen > Flachland sichtbar belegt. Neuschnee-Summe wächst
   mit dem Horizont (kumulatives `snow_gsp`); 24.07. sommertrocken → Neuschnee flächig 0 = korrekt.
   SWE→cm über `verify-snow.mjs` **20/20 PASS** (10:1-Fallback == alpineSplit-Konstante, `rho_snow`
   im Frischschnee-Bereich physikalisch, alter Pack/fehlend → 10:1). Belege: `after-desktop-depth-alps.png`.
5. **Abgrenzung zur Linie — ✓.** „Schnee" (Raster, Menge) und „Schneegrenze" (`snowline`, ML-Linie)
   sind getrennte, gleichzeitig aktivierbare Layer; Schnee-Palette (`snowRamp`, Weiß→Blau) optisch
   klar ≠ Regen-Palette. Tooltip/Legende benennen „Menge — NICHT die Schneegrenzen-Linie".
6. **Diff/Abgrenzung — ✓.** Neu: `src/sources/iconD2Snow.ts`, `scripts/verify-snow.mjs`. Additiv:
   `MapView.tsx`/`LayerIcon.tsx`/`LayerInfoPanel.tsx`/`package.json` + `alpineSplit.ts` (NUR der neue
   `freshSnowCmFromSwe`-Export, `git diff` = 0 geänderte Bestandszeilen → Verhalten byte-identisch).
   **Unberührt** (`git status` leer): `precipPhase.ts` (nur `snowRamp` gelesen), `climaField.ts`,
   `snowline`-ML-Pfad, `RainLayer.ts`, `ScalarLayer.ts`, `gribGridDecode.ts`/`gribDecode.ts`,
   `radolan.ts`, Wind-Shader/RGBA8/Fusion/EPS/Radar.
7. **Mobile (390×844) — ✓.** „Layer"-Sheet (Detail-Tab): Schnee-Toggle **453×56 px**, Modus-Segment
   „Decke"/„Neuschnee" je **209×44 px** (≥ 44), kein Horizontal-Scroll (`scrollWidth ≤ 390`), Legende
   sichtbar; **keine** neuen Konsolen-Errors/-Warnings (Desktop + Mobile leer); Desktop mit aktivem
   **und** inaktivem Layer sauber (additiv, off im Default); `npm run typecheck` grün. Belege:
   `after-mobile-sheet-mode.png`.

### §9.1 Selbstverifikation (CLAUDE.md) mit Beleg
1. **Bestehende Funktionen erhalten?** Ja — rein additiv (neuer Layer + `freshSnowCmFromSwe`-Export).
   `snowline`/`climaField`/`alpineSplit`-Bestand byte-identisch (§9 Punkt 6). Kein Toggle entfernt.
2. **Desktop pixelgleich?** Ja — Layer standardmäßig aus, `initialActive` unverändert; Kaltstart mit
   inaktivem Layer identisch (0 Schnee-Requests).
3. **Touch-Targets ≥ 44 px?** Ja — Toggle 453×56, Modus-Buttons 209×44 (§9 Punkt 7).
4. **Konsole frei von neuen Errors/Warnings?** Ja — `list_console_messages` (error/warn) leer,
   Desktop + Mobile, über Toggle + Modus-Wechsel.
5. **Keine Long Tasks > 200 ms?** Toggle/Modus-Wechsel/Scrub blieben interaktiv; progressives Laden
   (Concurrency 3, bz2 im Worker-Pool, Decode off-main) folgt dem etablierten Böen/Thunder-Muster.

**Gate GF4: PASSIERT** — alle sieben V-SCHNEE-Punkte grün mit Beleg.
