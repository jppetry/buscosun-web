# audit/blitz-vorhersage.md — Feature-Phase F2: Blitz-Vorhersage-Layer (LPI)

**Maßgebliche Vorgabe für die Umsetzung (via Claude-Code-CLI).** Die Punkte in `plan.md`/`checklist.md` sind die Kurzfassung; diese Datei ist verbindlich.

> **Scope-Hinweis / Jans Freigabe:** Funktionserweiterung (neuer Kartenlayer), von Jan beauftragt — außerhalb der ursprünglichen Mobile-Mission (dort „neue Features" = Nicht-Ziel), analog zu F1/T2/Command-Deck. Diagnose-First + harte Regeln aus `CLAUDE.md` gelten unverändert.

---

## §0 Abgrenzung zu den zwei benachbarten „Blitz"-Dingen (WICHTIG — Verwechslungsgefahr)

Es gibt jetzt **drei** klar getrennte Blitz-Bezüge im Projekt. Dieser Layer ist Nr. 2:

| | Was | Zeitrichtung | Quelle | Status |
|---|---|---|---|---|
| **Blitze** (`lightning`, bestehend) | *gemessene* Einschläge, letzte 60 Min | Vergangenheit | DWD-WMS `Accumulated_Flash_Area` (Sferics/Linet), `src/sources/dwdLightning.ts` | live |
| **Blitz-Vorhersage** (`lightningfc`, **dieser Layer F2**) | *prognostizierte* Blitzwahrscheinlichkeit | Zukunft 0–12 h | ICON-D2 `lpi`/`lpi_max` (Grid) | neu |
| **Gewitterpotenzial** (`thunder`, F1) | fusionierter 0–100-Index | Zukunft 0–12 h | `cape_ml`×`cin_ml`×`lpi` | Spec `audit/gewitterpotenzial.md` |

**Bewusste Design-Entscheidung (Jan):** LPI wird hier als **eigenständiger** Layer sichtbar gemacht (nicht nur — wie in F1 — intern als Fusions-Zutat versteckt). F1 und F2 sind **komplementär**, kein Widerspruch: F2 zeigt das rohe, gut verständliche Blitzsignal solo; F1 den zusammengesetzten Gewitter-Index. Sie können unabhängig voneinander umgesetzt/aktiviert werden. **`Accumulated_Flash_Area` (Beobachtung) bleibt unverändert** — F2 konkurriert nicht damit, sondern ergänzt es um die Vorwärtsschau.

---

## §1 Ziel

Ein neuer, **standardmäßig inaktiver** Kartenlayer **„Blitz-Vorhersage"**, der den ICON-D2 **Lightning Potential Index** flächig als Risikoraster über DACH rendert und über den bestehenden Zeit-Slider in die Zukunft (0–12 h) läuft.

**Nutzenversprechen:** „Wo ist in den nächsten Stunden mit Blitzen zu rechnen?" — eine echte **Prognose** statt nur vergangener Sferics. Alleinstellungsmerkmal: **kaum ein Consumer-Dienst** (Windy/Kachelmann/WetterOnline) zeigt einen Blitz-*Prognose*-Layer für Endnutzer; sie zeigen entweder gemessene Blitze oder rohes CAPE.

**Zielgruppe:** Allgemein · Outdoor · Veranstalter. **Aufwand: Einfach. Mehrwert-Bewertung: 9/10.**

---

## §2 Diagnose — Datenlage & Wiederverwendung (vor Code)

### §2.1 Verfügbarkeit (bestätigt)
Directory-Listing `https://opendata.dwd.de/weather/nwp/icon-d2/grib/06/` enthält **`lpi`** und **`lpi_max`** als eigene Parameter-Unterordner. Beide sind reguläre ICON-D2-2,2-km-Gitter (`regular_ll`, **nicht** icosahedral) → **derselbe Decode-Pfad wie Temp/Böen** (`fetchIconD2Grid` → `gribGridDecode`), **kein** EPS-/icosahedraler Pfad. Damit ist F2 ein **Einfeld**-ScalarLayer — deutlich simpler als F1.

### §2.2 `lpi` vs. `lpi_max` — Feld-Wahl (in der Diagnose final entscheiden)
- **`lpi_max`** = Maximum des LPI über das jeweilige Ausgabeintervall → **empfohlene Primärquelle**: „stärkstes Blitzrisiko innerhalb der Stunde" ist die ehrlichere, konservativere Nutzeraussage und verhindert, dass ein kurzer Blitzpeak zwischen zwei Momentaufnahmen durchrutscht.
  - **Achtung t+0:** Als Intervall-Maximum ist `lpi_max` am Analyse-Schritt strukturell 0 (wie `vmax_10m`/`tot_prec`-Δ, siehe `frameAtValidTime.ts` QA-Befund D4). → beim Frame-Wählen **`minStepHours = 1`** setzen, sonst ist der Layer bei „jetzt" flächig leer.
- **`lpi`** = instantaner Wert → keine t+0-Sonderbehandlung, aber kann kurze Peaks zwischen Steps verpassen. Als Alternative/Fallback.
- Entscheidung: **`lpi_max` mit `minStepHours = 1`**, `lpi` als dokumentierter Fallback, falls `lpi_max` im gewählten Lauf lückenhaft publiziert ist.

### §2.3 Wiederverwendbare Bausteine (Reuse statt Neubau)
- **`fetchIconD2Grid`** (aus `src/sources/iconD2Precip.ts`) lädt jedes reguläre ICON-D2-Feld — direkt für `lpi_max` nutzbar (`kind: 'max'`, `accumulate: false`).
- **`frameAtValidTime`** (`src/sources/frameAtValidTime.ts`) inkl. `minStepHours` — genau der Mechanismus, den Böen/Precip schon nutzen.
- **`ScalarLayer`** (`src/scalar/ScalarLayer.ts`) rendert das Grid mit eigener Farbrampe + `visRange`.
- **Lazy-Load-Muster** (`src/MapView.tsx`): `install<X>Ref` + `useEffect` gated auf `active.has(key) && !ref` + Sichtbarkeits-Block (~Z. 891) + `refreshIconD2Layers`-Zweig (~Z. 1524). Vorlagen: Clouds (Z. 1602), Gust (Z. 1612). → **Layer lädt erst beim Aktivieren.**

### §2.4 Ehrliche Grenzen (UI/Tooltip)
- **Domäne:** ICON-D2 DACH + Umland; Modellrand **transparent** maskieren (kein 0).
- **Horizont:** belastbar nur über den nahen NWP-Horizont (~0–12 h, bis Step-Cap). Keine Falsch-Sicherheit über den Horizont hinaus.
- **Prognose ≠ Messung:** klar als Modell-Vorhersage labeln, damit Nutzer sie nicht mit dem gemessenen „Blitze"-Layer verwechseln. Der Tooltip verweist idealerweise auf den Beobachtungs-Layer als Gegenstück.
- **`lpi` ist nur in konvektionserlaubenden Lagen > 0** → an ruhigen Tagen erwartungsgemäß fast leer. Das ist korrekt, kein Fehler.

---

## §3 Darstellung — Risikorampe

Direkter Wert→Farbe-Mapping (keine Fusion nötig). LPI (J/kg) typ. 0..~30+.

Vorschlags-Rampe (Startwerte, in der Diagnose gegen echte Felder kalibrieren) — fünfstufig, transparent unter ~1 J/kg (ruhige Zellen nicht einfärben):

| LPI (J/kg) | Stufe | Farbe (Vorschlag) |
|---|---|---|
| < 1 | keine | transparent |
| 1–3 | gering | Gelb |
| 3–8 | erhöht | Amber/Orange |
| 8–15 | hoch | Rot |
| > 15 | sehr hoch | Magenta |

`visRange`/Alpha analog zur Precip-Rampe (weicher Einblendbereich am unteren Ende). **Klar von der `Accumulated_Flash_Area`-Legende unterscheidbar halten** (andere Palette), damit Beobachtung vs. Prognose optisch trennbar bleiben.

Optional (leichtgewichtig): eine reine `lpiRisk(lpi)`-Rampenfunktion + `verifyLpiRisk()`-Harness analog `convectiveIndex.ts` (Monotonie, Clamp) — nur wenn ohne Mehraufwand; F2 braucht keine Fusionslogik.

---

## §4 Code-Seams (exakte Anschlusspunkte in `src/MapView.tsx`)

1. **`LayerKey`-Union (Z. 218):** `'lightningfc'` ergänzen.
2. **`LAYER_OPTIONS` (Z. 249):** Eintrag `{ key: 'lightningfc', label: 'Blitzprognose', title: 'Blitz-Vorhersage — ICON-D2 Lightning Potential Index (lpi_max, 2,2 km, 0–12 h). Prognostiziertes Blitzrisiko über den Slider — NICHT die gemessenen Blitze der letzten Stunde (das ist der Layer „Blitze"). DACH, near-NWP-Horizont.' }`. Position: direkt neben `lightning` (thematische Nähe, aber getrennt).
3. **`layerRefs` (Z. 473):** optionales Feld `lightningfc?: ScalarLayer`.
4. **Map-Init-Effekt (~Z. 787ff):** `lightningFcLayer = new ScalarLayer({ id: LIGHTNINGFC_LAYER_ID, colorRamp: lpiRamp, visRange: {...} })` anlegen + der Karte hinzufügen; `LIGHTNINGFC_LAYER_ID`-Konstante oben bei den anderen `*_LAYER_ID`.
5. **Sichtbarkeits-Block (~Z. 891):** `[LIGHTNINGFC_LAYER_ID]: active.has('lightningfc')`.
6. **`refreshIconD2Layers` (~Z. 1524):** `lightningfc`-Zweig, der bei aktivem Layer das Grid neu zieht (30-min-Koordinator + Manifest-Gate übernimmt der bestehende Mechanismus).
7. **Lazy-Load-Effekt (Muster wie Clouds Z. 1602 / Gust Z. 1612):**
   ```ts
   useEffect(() => {
     if (active.has('lightningfc') && !iconD2LightningFcRef.current) void installLightningFcRef.current?.();
   }, [active]);
   ```
   `installLightningFcRef` wird im Map-Init-Effekt gesetzt und lädt **erst hier** `lpi_max`.
8. **Neue Quelle `src/sources/iconD2Lpi.ts`:** `fetchIconD2Grid('lpi_max', { accumulate: false, kind: 'max', maxStep: … }, signal)` (Reuse aus `iconD2Precip`), Frame-Wahl mit `minStepHours = 1`.
9. **Legende:** fünfstufiger Eintrag in der Karten-Legende (analog Precip/Temp), Palette bewusst anders als `Accumulated_Flash_Area`.

---

## §5 Umzusetzende Maßnahmen (F2-1 … F2-6)

- **F2-1** `src/sources/iconD2Lpi.ts`: Grid-Loader für `lpi_max` (Reuse `fetchIconD2Grid`), Frame-Wahl `minStepHours = 1`; `lpi`-Fallback dokumentiert.
- **F2-2** `lpiRamp` + `visRange` (§3), Palette klar von der Blitzortung getrennt.
- **F2-3** `MapView.tsx`: die 7 additiven Seams aus §4 (LayerKey/Option/Ref/Init/Visibility/Refresh/**Lazy-Effekt**) — additiv, keine bestehende Zeile in ihrer Funktion verändern.
- **F2-4** Legende (5 Stufen) + Tooltip mit Ehrlichkeits-Hinweisen (§2.4), inkl. Abgrenzung zum Beobachtungs-Layer.
- **F2-5** (optional, leichtgewichtig) `src/… lpiRisk()` reine Rampe + `scripts/verify-lpi.mjs` (Node strip-types) — nur falls ohne Mehraufwand.
- **F2-6** Mobile-Sichtprüfung: Layer erscheint automatisch im Sheet-Layer-Segment (LAYER_OPTIONS-getrieben) → nur Toggle/Touch-Target/Legende auf 390×844 prüfen.

---

## §6 Abgrenzung / harte Regeln

- **Additiv & lazy:** nicht im `initialActive`-Default; `lpi_max` wird **ausschließlich** beim ersten Aktivieren geladen (Lazy-Effekt §4.7). Kaltstart unberührt.
- **Kein Eingriff** in: Wind-Shader/WebGL-Pipeline, RGBA8-Packing, Fusion-Engine, EPS-Pfad, Radar/RADOLAN, **den bestehenden `dwdLightning.ts`/`Accumulated_Flash_Area`-Layer** oder andere Layer-Loader. Reiner, eigenständiger ScalarLayer.
- **Transport:** `lpi_max` läuft automatisch über den generischen `/_dwd_grib`-Proxy (Edge-`ALLOWED_PREFIX` deckt `icon-d2/grib/` ab). **Optional/vertagt:** `lpi_max` in `warm-grib.mjs` vorwärmen — erst wenn der Layer sich bewährt.
- **Desktop-Regression:** keine (Layer neu + aus). Desktop-Diff bei ausgeschaltetem Layer pixelgleich.
- **STOPP & FRAGEN**, falls die Diagnose zeigt, dass `lpi_max` nicht regulär-gegittert vorliegt oder der Decode/`frameAtValidTime` angefasst werden müsste (über das vorhandene `minStepHours` hinaus).

---

## §7 Verify (→ `tests.md` V-BLITZ-VORHERSAGE)

1. **Lazy-Load belegt:** Netzwerk-Waterfall — Kartenstart **ohne** `lpi_max`-Requests; erst der Layer-Toggle „Blitzprognose" löst den Grid-Fetch aus (über `/_dwd_grib`).
2. **t+0-Behandlung:** bei „jetzt" ist der Layer **nicht** flächig leer wegen des Intervall-Maximums (`minStepHours = 1` greift); in einer echten Konvektionslage plausibles Muster, Domänenrand transparent.
3. **Slider/Refresh:** Zeit-Slider bewegt den Layer über die verfügbaren Steps (Vorwärtsschau 0–12 h); 30-min-Refresh zieht bei aktivem Layer nach.
4. **Abgrenzung sichtbar:** „Blitze" (Messung) und „Blitzprognose" (Modell) sind gleichzeitig aktivierbar, optisch unterscheidbar (andere Palette/Legende), Tooltips benennen den Unterschied.
5. **Diff:** nur neue Datei(en) + additive `MapView.tsx`-Seams; `dwdLightning.ts`/Wind-Shader/RGBA8/Fusion/EPS/Radar/Decode unberührt (Diff-Beleg).
6. **Mobile (390×844):** Toggle im Sheet-Layer-Segment, Touch-Target ≥ 44 px, Legende sichtbar, keine neuen Konsolenfehler; Desktop mit aktivem/inaktivem Layer sauber; `npm run typecheck` grün.

**Gate GF2:** Lazy-Load im Waterfall belegt (0 Requests vor Aktivierung) · t+0 nicht leer · Slider-Vorausschau funktioniert · klar von „Blitze" abgegrenzt · Domänenrand ehrlich maskiert · additiver Diff · Mobile-Toggle sauber · Desktop unverändert · Konsole/Typecheck grün.

---

## §8 Diagnose-Befund (Claude Code, 2026-07-24) — VOR Code, am echten Code verifiziert

Alle drei Diagnose-Pflichtpunkte des Auftrags sind **grün**; **kein STOPP-Kriterium** ausgelöst. F2 ist der einfachere Zwilling von F1 (ein Feld statt drei, keine Fusion). Belege je Punkt am Quellcode:

### §8.1 Reguläres Gitter — `lpi`/`lpi_max` laufen über den Temp/Böen-Decode (bestätigt)
- **Dateiname beweist `regular_ll` (GDT 0):** `lpi_max` liegt — wie alle single-level-2D-Felder — als `icon-d2_germany_regular-lat-lon_single-level_<run>_<step>_2d_lpi_max.grib2.bz2` (`iconD2Precip.ts:214` `stepFileName`, param-agnostisch). Der Namensbestandteil `regular-lat-lon` = GDT 0.
- **Derselbe Pfad wie `t_2m`/`vmax_10m`:** Der Decoder akzeptiert GDT 0 (regulär) oder GDT 101 (icosahedral, `unstructured=true`) — GDT 101 betrifft **ausschließlich** den EPS-Baum. `lpi`/`lpi_max` sind Nicht-EPS → GDT 0 → `resolveLatestRun` → `fetchStepField` → `fetchDecodeCached` → `decodeGrib2`. **Kein Decode-Eingriff, kein EPS-/icosahedraler Pfad.** `lpi` ist bereits als F1-Fusionszutat über genau diesen Pfad in Betrieb (`iconD2Thunder.ts:152`) — der Regulär-Grid-Beweis ist also live erbracht; `lpi_max` ist sein Intervall-Maximum-Geschwister im selben Parameter-Ordner.
- **Transport:** läuft automatisch über den generischen `/_dwd_grib`-Edge-Proxy (`D2_GRIB_PROXY_BASE`, `ALLOWED_PREFIX` deckt `icon-d2/grib/` ab). Kein Warm-Cron-Eintrag (bewusst vertagt, §6).

### §8.2 Feld-Wahl — `lpi_max` mit `minStepHours = 1` (final entschieden)
- **`lpi_max`** (Intervall-Maximum) ist Primärquelle (ehrlichere „stärkstes Risiko innerhalb des Intervalls"-Aussage, §2.2). Als Intervall-Maximum ist es am Analyse-Schritt t+0 strukturell 0 (wie `vmax_10m`/`tot_prec`-Δ, `frameAtValidTime.ts` QA-Befund D4).
- **Lösung ohne Decode-/Frame-Eingriff:** genau der bereits vorhandene `minStepHours`-Knopf. Die Frame-Wahl im Render-Effekt nutzt `bracketAtValidTime(frames, targetMs, 1)` — **byte-identisch** zum Böen-Layer (`MapView.tsx:2208`). Der Loader lädt Schritte `1…12` (t+0 als strukturell leer gar nicht erst geholt — kleine Sonderbehandlung, nur der Knopf). **Kein STOPP:** die Frage ist mit dem existierenden `minStepHours` gelöst, nicht durch eine Decode-/`frameAtValidTime`-Änderung.
- **`lpi`** (instantan) ist der dokumentierte Fallback, falls `lpi_max` in einem Lauf lückenhaft publiziert ist — kein t+0-Sonderfall, aber verpasst kurze Peaks zwischen zwei Steps.

### §8.3 Domänenmaske — Rand transparent, nie 0 (bestätigt)
- `decodeGrib2` setzt bitmap-maskierte Zellen auf `NaN`; der Canvas-Builder setzt für nicht-finite Zellen `alpha = 0` (Muster `iconD2GustSource.ts:72`, `iconD2TempSource.ts:155`) → **transparent**. Der `ScalarLayer`-Shader verwirft zusätzlich `raw.a < 0.05` und Fragmente außerhalb `uvBounds`.
- **Maskenanker = das LPI-Feld selbst:** `lpi_max` NaN → alpha 0 (Rand ehrlich leer). In-Domänen-Zellen mit LPI 0 (ruhige Lage) sind endlich → werden gerendert, aber durch `visRange` (Fade unter ~1 J/kg) transparent ausgeblendet („ruhige Zellen nicht einfärben", §3). „kein Wert = transparent, nicht 0" ist damit erfüllt.

### §8.4 Architektur-Entscheidung — `fetchStepField` statt `fetchIconD2Grid` (begründete Abweichung von der Wortlaut-Vorgabe F2-1)
- **`fetchIconD2Grid(kind:'max')` existiert nicht:** `GridToU8Kind` ist am Code exakt `'precip' | 'cloud' | 'cape'` (`gribGridDecode.ts:19`) — **kein `'max'`**. `fetchIconD2Grid` liefert zudem ein **Uint8-quantisiertes** Grid für `RainLayer`, verlustbehaftet. Die nächstliegende Quantisierung `'cape'` ist auf CAPEs 0..~4000-J/kg-Bereich kalibriert und würde LPIs feinen 0..~30-J/kg-Bereich in die untersten Uint8-Buckets zerquetschen (praktisch nur 0/1). Untauglich.
- **Korrekte Wiederverwendung** ist daher — identisch zu F1 §8.4 (von Jan akzeptiert) — der **ScalarLayer-Rohwert-Pfad von Temp/Böen**: `resolveLatestRun` + `fetchStepField` (rohes `GribField` in physikalischen J/kg) + `gribCorners` + `D2_GRIB_PROXY_BASE`. Böen (`vmax_10m`, ein Feld → ein `ScalarLayer` mit eigener Rampe + `visRange`) ist der **exakte Ein-Feld-Präzedenzfall**. Reuse-Ziel „ICON-D2-Grid-Pipeline" (§2.3) voll erfüllt; nur die konkrete Funktion ist `fetchStepField` statt `fetchIconD2Grid` (**dieselbe Datei** `iconD2Precip.ts`). Kein neuer Transport, kein Decode-Eingriff.
- **Ausgabe:** `ScalarLayer` (R = `lpi/LPI_VMAX` linear normiert, A = Maske, `vMin=0`, `vMax=30` J/kg, eigene `lpiRamp` + `visRange`). Direktes Wert→Farbe-Mapping, **keine** Fusionsfunktion im Renderpfad nötig (§3).

### §8.5 Vollständige Seam-Liste (am Code verifiziert — §4 korrekt, ergänzt um Deck-Realität)
Der `LayerKey`-Zusatz `'lightningfc'` erzwingt (Typecheck) über die §4-Liste hinaus dieselben Zusatz-Seams wie F1:
- **`statuses`-Init** (`MapView.tsx:356`, `Record<LayerKey,…>`) → `lightningfc: {}`.
- **`LAYER_INFO`** (`components/LayerInfoPanel.tsx:42`, `Record<LayerKey, Info>`) → `lightningfc`-Eintrag = Tooltip/Legende mit Ehrlichkeits-Hinweisen + Abgrenzung zu „Blitze".
- **`LayerIcon`** (`components/LayerIcon.tsx`) hat `default: return null` → Typecheck ok ohne Case, aber ein eigener **Blitz-mit-Uhr/Vorschau**-Case wird ergänzt (UX; klar anders als der massive Zickzack-Blitz von `lightning`).
- **`applyVisibility` × 2** (`MapView.tsx:940` + `:2446`) → beide `[LIGHTNINGFC_LAYER_ID]: active.has('lightningfc')`.
- **Toggle-Herkunft:** Dock **und** Mobile-Sheet rendern aus **`DECK_GROUPS`** (`MapView.tsx:3428`), nicht direkt aus `LAYER_OPTIONS`. Der Toggle kommt via **einem** additiven `DECK_GROUPS`-Eintrag (Gruppe „Punkte & Vertrauen", direkt neben `lightning` — thematische Nähe, klar getrennt) auf Desktop **und** Mobile automatisch. `LAYER_OPTIONS` bleibt Pflicht (liefert `label`/`title` via `LAYER_BY_KEY`).
- **Legende:** additiver Zweig im `legendsBlock` (`MapView.tsx:2942`), fünfstufig, Palette bewusst violett-forciert → getrennt von der Blitzortung UND (bei Überlappung) von der Gewitter-Rampe.

**Fazit:** Datenlage grün, kein Decode-/EPS-/Transport-/`frameAtValidTime`-Eingriff (nur der `minStepHours`-Knopf), kein STOPP. Umsetzung additiv wie geplant, Ein-Feld-Muster = Böen.

---

## §9 Verify-Protokoll + Selbstverifikation (Claude Code, 2026-07-24) — nach Umsetzung, MCP-belegt

### §9.1 V-BLITZ-VORHERSAGE-Ergebnisse (Chrome DevTools MCP, Dev :5194)
1. **Lazy-Load (kritisch) — GRÜN.** Kartenstart: 194 fetch/xhr-Requests, **0** `lpi_max`. Nach Toggle „Blitzprognose": Directory-Probe `/_dwd_opendata/…/icon-d2/grib/06/lpi_max/` (Scan, da nicht manifest-gegated) + Steps **001–012** via `/_dwd_grib/…/lpi_max/…grib2.bz2` (Lauf 2026072406), alle `200`. Vorher/Nachher-Waterfall belegt.
2. **t+0 nicht leer — GRÜN.** Loader lädt Steps 1–12 (t+0 = Step 000 gar nicht geholt); Render-Effekt `bracketAtValidTime(…, 1)`. Status-Readout „Blitzprognose · DWD ICON-D2 LPI_MAX · 2,2 KM" = Daten bei „jetzt" vorhanden. Domänenrand transparent (kein kontinentaler Bleed nach AT/SI).
3. **Slider/Vorausschau — GRÜN.** Frames 001–012 = 0–12 h; Render-Effekt hängt an `forecastHour` (Sub-Stunden-Lerp); `refreshIconD2Layers`-Zweig ergänzt (Ref-Gate).
4. **Abgrenzung zur Messung — GRÜN.** „Blitze" + „Blitzprognose" gleichzeitig aktiv („3 aktiv", keine Konsolenfehler); optisch getrennt: violetter Toggle/Umriss-Bolt (Prognose) vs. amber Toggle/gefüllter Bolt (Messung); Tooltips + Legende benennen „Prognose ≠ Messung" und verweisen aufeinander.
5. **Rendering — GRÜN (calm-day-plausibel).** 24.07. ist eine ruhige/schwache Lage → LPI ~0 → weitgehend transparent (via `visRange`), Wind-Heatmap darunter sichtbar. Das ist die dokumentierte ehrliche Erwartung (§2.4: „an ruhigen Tagen erwartungsgemäß fast leer — kein Fehler"). Pipeline-Korrektheit sonst identisch zu Böen/Gewitter (12 Grid-Fetches ok, Status ok, keine Fehler).
6. **Diff/Abgrenzung — GRÜN.** Nur neue Dateien (`iconD2Lpi.ts`, `lightningPotential.ts`, `verify-lpi.mjs`) + additive Seams (`MapView.tsx`, `LayerIcon.tsx`, `LayerInfoPanel.tsx`, `package.json`). `dwdLightning.ts`/`gribDecode.ts`/`ScalarLayer.ts`/Wind-Shader/RGBA8/Fusion/EPS/Radar: leerer Diff.
7. **Mobile (390×844) — GRÜN.** Toggle im „Layer"-Sheet (Gruppe „Punkte & Vertrauen", neben „Blitze"), Touch-Target **56 px** hoch (≥44), Legende sichtbar; keine Konsolenfehler. `npm run typecheck` grün; `npm run verify:lpi` **6/6 PASS**.

Beleg-Screenshots: `audit/screenshots/gewitterpotenzial/blitz-vorhersage-{desktop-active,mobile-sheet,mobile-toggle}.png`.

### §9.2 Selbstverifikation (CLAUDE.md, 5 Fragen)
1. **Funktioniert jede vorbestehende Funktion nach der Phase?** Ja. F2 ist rein additiv (neuer Layer-Key + off im Default). Der bestehende „Blitze"-Layer (`dwdLightning.ts`) ist unberührt (leerer Diff) und weiter aktivierbar; beide koexistieren MCP-belegt. Alle übrigen Layer/Toggles unverändert.
2. **Ist die Desktop-Ansicht unverändert (Layer aus)?** Ja, bei ausgeschaltetem Layer rendert die Karte identisch (Layer initial leer/unsichtbar); die einzige UI-Änderung ist ein zusätzlicher Toggle im Panel — die beauftragte Funktionserweiterung selbst (§6: „Layer neu + aus").
3. **Touch-Targets ≥ 44×44 px?** Ja — der „Blitzprognose"-Switch misst 56 px Höhe (volle Zeilenbreite).
4. **Konsole frei von neuen Errors/Warnings?** Ja — Desktop und Mobile: keine.
5. **Interaktion ohne Long Tasks > 200 ms?** Nicht separat getraced (MCP drosselt rAF, Real-Device-Vorbehalt aus CLAUDE.md); der Layer nutzt exakt die Böen/Gewitter-ScalarLayer-Pipeline ohne neue Hot-Path-Logik (nur ein zusätzliches subsampeltes Grid je Aktivierung), Rendering ist ein Textur-Upload je Frame wie bei Temp/Böen. Kein neuer Long-Task-Pfad eingeführt.

**Gate GF2: PASSIERT** — alle sieben V-Punkte grün mit Beleg, Selbstverifikation 4/4 belegt + 1 begründet (kein neuer Perf-Pfad).
