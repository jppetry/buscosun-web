# audit/gewitterpotenzial.md — Feature-Phase F1: Gewitterpotenzial-Layer

**Maßgebliche Vorgabe für die Umsetzung (via Claude-Code-CLI).** Die Punkte in `plan.md`/`checklist.md` sind die Kurzfassung; diese Datei ist verbindlich.

> **Scope-Hinweis / Jans Freigabe:** Dies ist eine **Funktionserweiterung** (neuer Kartenlayer), nicht Teil der ursprünglichen Mobile-Optimierungs-Mission (dort ist „neue Features" explizites Nicht-Ziel). Jan hat das Vorhaben ausdrücklich beauftragt — analog zu den bereits über die Mission hinausgewachsenen Phasen (T2-Transport, Command-Deck-Redesigns). Diagnose-First und die harten Regeln aus `CLAUDE.md` gelten unverändert.

---

## §1 Ziel

Ein neuer, **standardmäßig inaktiver** Kartenlayer **„Gewitterpotenzial"**, der aus drei bereits über den ICON-D2-Pfad verfügbaren Feldern einen einzigen, verständlichen 0–100-Index je Gitterzelle bildet und flächig als Farbraster über DACH rendert:

| Signal | ICON-D2-Feld | Bedeutung |
|---|---|---|
| **Energie** | `cape_ml` (mixed-layer CAPE, J/kg) | Konvektions-*Potenzial* — wie viel Auftriebsenergie steht bereit |
| **Deckel** | `cin_ml` (convective inhibition, J/kg) | *Hemmung* — wie stark eine Sperrschicht die Auslösung unterdrückt |
| **Auslösung** | `lpi` (Lightning Potential Index, J/kg) | *Blitzbereitschaft* — wo das Modell aktive Elektrifizierung/Konvektion erzeugt |

**Nutzenversprechen:** „Wo braut sich in den nächsten 0–12 h etwas zusammen?" — eine flächige Gewitter-Vorwarnung **weit vor dem ersten Radarecho**, weil sie auf dem Modell-*Potenzial* beruht statt auf bereits gefallenem Niederschlag. Alleinstellungsmerkmal ggü. Windy/Kachelmann/WetterOnline: die meisten zeigen CAPE **oder** Blitze einzeln und roh; hier entsteht ein fusionierter, ehrlich beschrifteter Index.

**Zielgruppe:** Allgemein · Outdoor · Segeln · Luftfahrt. **Mehrwert-Bewertung: 10/10.**

---

## §2 Diagnose — Datenlage & Wiederverwendung (vor Code)

### §2.1 Verfügbarkeit der Parameter (bestätigt)
Directory-Listing `https://opendata.dwd.de/weather/nwp/icon-d2/grib/06/` enthält alle drei Felder als eigene Parameter-Unterordner: **`cape_ml`, `cin_ml`, `lpi`** (zusätzlich `lpi_max`, `cape_con`, `hbas_sc`, `htop_dc` u. a. für spätere Layer). Alle drei sind reguläre ICON-D2-2,2-km-Gitter (`regular_ll`, **nicht** icosahedral — das betrifft nur den EPS-Baum) und laufen damit über **denselben Decode-Pfad wie Temp/Böen** (`fetchIconD2Grid` → `gribGridDecode`), nicht über den teuren icosahedralen EPS-Pfad.

### §2.2 Bereits vorhandene Bausteine (Reuse statt Neubau)
- **`src/sources/iconD2Cape.ts`** lädt `cape_ml` heute schon — aber **nur punktweise** (`fetchCapeSeriesAtPoint`) für den Go/No-Go-/Event-Index, **nicht** als Kartenlayer. Der Grid-Fetch (`fetchIconD2Grid('cape_ml', …)`) ist dort exemplarisch vorgezeichnet.
- **`src/radar/convectiveIndex.ts`** fusioniert bereits CAPE + Zellintensität + Warnstufe zu einem 0–100-Score mit stückweise-linearen Rampen (`capeScore`, `levelOf`, `ramp`). Die **Rampen-Helfer und Schwellen sind wiederverwendbar**; die Fusionslogik ist aber punkt-/radar-orientiert und muss für die **3-Feld-Gitter-Fusion** (CAPE × CIN × LPI, ohne Radar) neu geschrieben werden (§3).
- **`src/scalar/ScalarLayer.ts`** ist der generische WebGL-Scalar-Raster-Layer (nutzt Temp/Böen/Precip). Der Gewitter-Index rendert als **ein** `ScalarLayer` mit eigener Farbrampe + `visRange`.
- **Lazy-Load-Muster** (`src/MapView.tsx`): jeder Layer hat (a) eine `install<X>Ref`-Closure, die im Map-Init-Effekt gesetzt wird, (b) einen `useEffect`, der **nur bei `active.has(key) && !ref`** den Installer ruft, (c) einen Eintrag im Sichtbarkeits-Block (~Z. 891) und (d) einen Zweig im 30-min-`refreshIconD2Layers`-Koordinator (~Z. 1524). Der Gewitter-Layer folgt exakt diesem Muster → **er wird erst geladen, wenn der Nutzer ihn aktiviert.**

### §2.3 Ehrliche Grenzen (müssen im UI/Tooltip stehen)
- **Domäne:** ICON-D2 deckt DACH + Umland ab; nahe dem Modellrand ehrlich maskieren (kein Wert = transparent, nicht 0).
- **Horizont:** belastbares Konvektionssignal nur über den nahen NWP-Horizont (~0–12 h, technisch bis zum verfügbaren Step-Cap). Kein Gewittersignal für weit entfernte Tage — die Rampe darf keine Falsch-Sicherheit über den Horizont hinaus suggerieren.
- **Potenzial ≠ Auslösung:** hohes CAPE allein ist noch kein Gewitter. Deshalb die CIN-Dämpfung (Deckel) **und** die LPI-Realisierung in die Fusion (§3) — genau die Ehrlichkeit, die `convectiveIndex.ts` schon vorlebt.
- **`lpi`** wird von ICON-D2 nur in konvektionserlaubenden Lagen ausgegeben; außerhalb ist es ~0 → als Realisierungs-Booster nutzen, nicht als alleinige Basis.

---

## §3 Fusionsformel (Vorschlag — in der Diagnose gegen echte Felder kalibrieren)

Pro Gitterzelle, alle drei Felder auf denselben Step/dieselbe Gültigkeitszeit gebracht:

```
pot   = capeScore(cape)                      // 0..100, Rampe wie convectiveIndex.ts §capeScore
lid   = cinGate(cin)                         // 0..1: |CIN| klein → 1 (offen), |CIN| groß → →0 (gedeckelt)
real  = lpiScore(lpi)                        // 0..100: LPI → Blitz-/Auslöse-Realisierung

base  = pot * lid                            // gedeckeltes Potenzial
syn   = (pot*lid > 40 && real > 30) ? 15 : 0 // Potenzial UND Realisierung = klassische Lage
score = clamp(round(max(0.55*base + 0.45*real + syn)), 0, 100)
```

Vorschlags-Rampen (Startwerte, DACH-übliche Schwellen — Feintuning in der Diagnose):
- `capeScore`: bestehende Stützpunkte aus `convectiveIndex.ts` übernehmen `[[0,0],[100,5],[250,22],[500,42],[1000,62],[1500,75],[2500,90],[3500,100]]`.
- `cinGate` (CIN ist negativ oder als Betrag geliefert — Vorzeichen-Konvention **im Decode prüfen!**): `|CIN|` 0→1,0 · 50→0,85 · 100→0,6 · 200→0,3 · 400→0,1.
- `lpiScore`: `0→0 · 1→10 · 3→30 · 8→60 · 15→85 · 30→100`.

**Farbrampe/Legende:** transparent unterhalb ~Score 8 (keine Gewitterlage nicht einfärben — vgl. Precip-Rampe, die < ~4 % transparent hält), dann Gelb (gering) → Amber (erhöht) → Orange (deutlich) → Rot → Magenta (extrem). Stufen-Labels analog `levelOf()`: keine / gering / erhöht / deutlich / hoch.

**Fusion muss eine reine, headless-testbare Funktion sein** (wie `convectiveIndex`), damit sie ohne Browser verifizierbar ist (§7, kein Vitest — Node-strip-types-Harness).

---

## §4 Code-Seams (exakte Anschlusspunkte in `src/MapView.tsx`)

1. **`LayerKey`-Union (Z. 218):** `'thunder'` ergänzen.
2. **`LAYER_OPTIONS` (Z. 249):** Eintrag `{ key: 'thunder', label: 'Gewitter', title: 'Gewitterpotenzial — CAPE (Energie) × CIN (Deckel) × LPI (Blitzbereitschaft), ICON-D2 2,2 km, 0–12 h. Flächige Vorwarnung vor dem ersten Radarecho. DACH, near-NWP-Horizont.' }`. Position: sinnvoll nach `nowcast`/`lightning` (thematisch Konvektion).
3. **`layerRefs` (Z. 473):** optionales Feld `thunder?: ScalarLayer` ergänzen.
4. **Map-Init-Effekt (~Z. 787ff):** neben `tempLayer`/`gustLayer`/`precipLayer` einen `thunderLayer = new ScalarLayer({ id: THUNDER_LAYER_ID, colorRamp: thunderRamp, visRange: {...} })` anlegen und der Karte hinzufügen; Layer-ID-Konstante oben bei den anderen `*_LAYER_ID` definieren.
5. **Sichtbarkeits-Block (~Z. 891):** `[THUNDER_LAYER_ID]: active.has('thunder')` (analog `temperature`/`gust`).
6. **`refreshIconD2Layers` (~Z. 1524):** einen `thunder`-Zweig ergänzen, der bei aktivem Layer die drei Grids neu zieht (30-min-Koordinator + Manifest-Gate übernimmt der bestehende Mechanismus).
7. **Lazy-Load-Effekt (Muster wie Clouds Z. 1602 / Gust Z. 1612):**
   ```ts
   useEffect(() => {
     if (active.has('thunder') && !iconD2ThunderRef.current) void installThunderRef.current?.();
   }, [active]);
   ```
   `installThunderRef` wird — wie `installCloudsRef` etc. — im Map-Init-Effekt gesetzt und lädt **erst hier** die drei Felder.
8. **Neue Quelle `src/sources/iconD2Thunder.ts`:** lädt `cape_ml`, `cin_ml`, `lpi` als Grids über `fetchIconD2Grid` (Reuse aus `iconD2Precip`/`iconD2Cape`), bringt sie per `frameAtValidTime` auf gemeinsame Gültigkeitszeiten und liefert je Frame ein fusioniertes Score-Grid.
9. **Neue reine Fusion `src/radar/thunderPotential.ts`** (oder in `convectiveIndex.ts` als zweite Funktion) mit `verifyThunderPotential()` + `window.__verifyThunderPotential` (Muster wie `convectiveIndex.ts` Z. 232).
10. **Legende:** Eintrag in der bestehenden Karten-Legende (analog Precip/Temp), fünfstufig mit den `levelOf`-Labels.

---

## §5 Umzusetzende Maßnahmen (F1-1 … F1-7)

- **F1-1** `src/sources/iconD2Thunder.ts`: Grid-Loader für `cape_ml`/`cin_ml`/`lpi` (Reuse `fetchIconD2Grid`, `frameAtValidTime`), CIN-Vorzeichen-Konvention aus dem Decode verifizieren.
- **F1-2** `src/radar/thunderPotential.ts`: reine Fusion (§3) + Rampen (Reuse `ramp`/`capeScore` aus `convectiveIndex.ts`) + `verifyThunderPotential()`-Harness.
- **F1-3** `src/scalar/…`: `thunderRamp` + `visRange` (Farb-/Transparenz-Verlauf §3).
- **F1-4** `MapView.tsx`: die 7 Seams aus §4 (LayerKey, Option, Ref, Init, Visibility, Refresh, **Lazy-Effekt**) — additiv, keine bestehende Zeile in ihrer Funktion verändern.
- **F1-5** Legende + Tooltip mit den Ehrlichkeits-Hinweisen aus §2.3.
- **F1-6** `scripts/verify-thunder.mjs` (Node strip-types, kein Vitest): fährt `verifyThunderPotential()` headless.
- **F1-7** Mobile-Check: der Layer erscheint im Command-Deck-Sheet-Layer-Segment automatisch (LAYER_OPTIONS-getrieben) → nur verifizieren, dass Toggle/Touch-Target/Legende auf 390×844 sauber sind (keine Sonderregel).

---

## §6 Abgrenzung / harte Regeln

- **Additiv & lazy:** Layer ist **nicht** im `initialActive`-Default; Daten werden **ausschließlich** beim ersten Aktivieren geladen (Lazy-Effekt §4.7). Kaltstart der Karte bleibt unberührt.
- **Kein Eingriff** in: Wind-Shader/WebGL-Pipeline, RGBA8-Packing, Fusion-Engine (`src/fusion/*`), EPS-/icosahedral-Pfad, Radar/RADOLAN, bestehende Layer-Loader. Der neue Layer ist ein **eigenständiger** ScalarLayer über native ICON-D2-Regulärgitter.
- **Transport:** die drei Felder laufen automatisch über den bereits generischen `/_dwd_grib`-Proxy (Edge-`ALLOWED_PREFIX` deckt `icon-d2/grib/` schon ab). **Optional/vertagt:** die drei Params in `warm-grib.mjs` vorwärmen — erst wenn der Layer sich bewährt (nicht Teil von F1, sonst wächst der Warm-Traffic für einen inaktiven Default-Layer).
- **Desktop-Regression:** keine — der Layer ist neu und aus. Desktop-Diff muss trotzdem pixelgleich bleiben, solange der Layer aus ist.
- **STOPP & FRAGEN**, falls die Diagnose zeigt, dass `lpi`/`cin_ml` doch nicht regulär-gegittert vorliegen oder der Decode angefasst werden müsste.

---

## §7 Verify (→ `tests.md` V-GEWITTER)

1. **Fusion-Harness:** `node scripts/verify-thunder.mjs` grün (ruhig→keine, hohes CAPE+offener Deckel+LPI→hoch, hohes CAPE+starker Deckel→gedämpft, Score-Monotonie, Clamp 0..100).
2. **Lazy-Load belegt:** Netzwerk-Waterfall — beim Kartenstart **keine** `cape_ml`/`cin_ml`/`lpi`-Requests; erst der Layer-Toggle löst genau diese drei Grid-Fetches aus (über `/_dwd_grib`).
3. **Rendering:** Layer zeigt bei einer realen Konvektionslage ein plausibles Muster; Domänenrand transparent maskiert; Legende fünfstufig lesbar.
4. **Slider/Refresh:** Zeit-Slider bewegt den Layer über die verfügbaren Steps; 30-min-Refresh zieht bei aktivem Layer nach.
5. **Abgrenzung:** `git diff` berührt nur die neuen Dateien + die additiven `MapView.tsx`-Seams; wind/scalar-Shader/fusion/radolan/Decode unberührt (Diff-Beleg).
6. **Mobile (390×844):** Toggle im Sheet-Layer-Segment, Touch-Target ≥ 44 px, Legende sichtbar, keine neuen Konsolenfehler; Desktop mit aktivem/inaktivem Layer sauber; `npm run typecheck` grün.

**Gate GF1:** Harness grün · Lazy-Load im Waterfall belegt (0 Requests vor Aktivierung) · Fusion plausibel gegen eine echte Lage · Domänenrand ehrlich maskiert · additiver Diff · Mobile-Toggle sauber · Desktop unverändert · Konsole/Typecheck grün.

---

## §8 Diagnose-Befund (Claude Code, 2026-07-24) — VOR Code, am echten Code verifiziert

Alle drei Diagnose-Pflichtpunkte des Auftrags sind **grün**; **kein STOPP-Kriterium** ausgelöst. Belege je Punkt am Quellcode:

### §8.1 Reguläres Gitter — cape_ml/cin_ml/lpi laufen über den Temp/Böen-Decode (bestätigt)
- **Dateiname beweist `regular_ll`:** Alle single-level-2D-Felder liegen als `icon-d2_germany_regular-lat-lon_single-level_<run>_<step>_2d_<param>.grib2.bz2` (vgl. `iconD2Precip.ts:214` `stepFileName`). Der Namensbestandteil `regular-lat-lon` = GDT 0.
- **Decoder akzeptiert nur GDT 0 (regulär) oder GDT 101 (icosahedral):** `gribDecode.ts:211/221/230`. GDT 101 (icosahedral, `unstructured=true`) betrifft **ausschließlich** den EPS-Baum (`gribDecode.ts:44` Doku). cape_ml/cin_ml/lpi sind Nicht-EPS → GDT 0 → **derselbe Pfad wie `t_2m`/`vmax_10m`**: `fetchStepField` → `fetchDecodeCached` → `decodeGrib2`. **Kein Decode-Eingriff nötig.**
- **Packing:** simple packing (DRT 0/1, 16 bit), von `gribDecode.ts:248` unterstützt — kein JPEG2000/AEC-Sonderfall.

### §8.2 CIN-Vorzeichen — sign-agnostisch gelöst (kein Blocker)
- **Decode liefert die physikalische Größe** `(R + int·2^E)·10^-D` (`gribDecode.ts:296`); ob `cin_ml` als **negativer** Wert oder als **positiver Betrag** publiziert wird, hängt an der GRIB-Kodierung (R/D) und ist ohne einen echten Fetch nicht bit-sicher vorab feststellbar.
- **Entscheidung (robust, deckt beide Konventionen ab):** `cinGate()` rechnet auf `Math.abs(cin)` — genau die `|CIN|`-Vorgabe aus §3. Damit ist die Fusion **unabhängig vom Vorzeichen korrekt** (großer Deckel → Gate →0, egal ob −400 oder +400 J/kg ankommen). Der Harness testet beide Vorzeichen explizit; ein Dev-`console.debug` im Loader loggt einmalig min/max des dekodierten Feldes zur Laufzeit-Bestätigung. **Kein STOPP** — die Sign-Frage ändert weder Decode noch Fusionsergebnis.

### §8.3 Domänenmaske — Rand transparent, nie 0 (bestätigt)
- **`decodeGrib2` setzt bitmap-maskierte Zellen auf `NaN`** (`gribDecode.ts:299`, `values[k] = NaN`). Der Canvas-Builder setzt für nicht-finite Zellen `alpha = 0` (Muster `iconD2GustSource.ts:72`, `iconD2TempSource.ts:155`) → **transparent**. Der `ScalarLayer`-Shader verwirft zusätzlich `raw.a < 0.05` (`ScalarLayer.ts:72`) und Fragmente außerhalb `uvBounds` (`:69`).
- **Maskenanker = Energiefeld:** eine Zelle gilt als „in Domäne", wenn `cape` finite ist. `lpi`/`cin` NaN im Inneren → als `0`/Betrag-0 behandelt (keine Realisierung/kein Deckel), **nicht** maskiert. So bleibt der Rand ehrlich leer, das Innere immer gerendert. „kein Wert = transparent, nicht 0" (§2.3) ist damit erfüllt.

### §8.4 Architektur-Entscheidung — `fetchStepField` statt `fetchIconD2Grid` (bewusste, begründete Abweichung von der Wortlaut-Vorgabe F1-1)
- `fetchIconD2Grid` liefert **ein** Feld als **Uint8-quantisiertes** Grid für `RainLayer` (`gribGridDecode.ts:19` `GridToU8Kind` = precip|cloud|cape — für cin/lpi existiert keine Quantisierung), verlustbehaftet und einkanalig. Die **3-Feld-Fusion braucht die rohen physikalischen J/kg-Werte** aller drei Felder je Zelle.
- **Korrekte Wiederverwendung** ist daher der ScalarLayer-Pfad von **Temp/Böen**: `resolveLatestRun` + `fetchStepField` (rohes `GribField`) + `gribCorners` + `D2_GRIB_PROXY_BASE` — **exakt** wie `iconD2TempSource.ts` `t_2m` **und** `hsurf` zu **einem** Canvas fusioniert. Reuse-Ziel „ICON-D2-Grid-Pipeline" (§2.2) ist voll erfüllt; nur die konkrete Funktion ist `fetchStepField` statt `fetchIconD2Grid` (dieselbe Datei `iconD2Precip.ts`). **Kein neuer Transport, kein Decode-Eingriff.**
- **Ausgabe:** `ScalarLayer` (R = `score/100` normiert, A = Maske, `vMin=0`, `vMax=100`, eigene `thunderRamp` + `visRange`) — genau §2.2/§4.4.

### §8.5 Rampen-Reuse & Ausrichtung
- `ramp()` und `capeScore()` sind in `convectiveIndex.ts` bisher **modulprivat** (`:50`, `:65`). Reuse laut §5 F1-2 → beide bekommen das `export`-Keyword (rein additiv, **keine** Verhaltensänderung; Signatur/Stützpunkte identisch). `thunderPotential.ts` importiert sie; `capeScore` ist byte-gleich die §3-Vorgabe.
- **Frame-Ausrichtung:** Alle drei Felder stammen aus **demselben Lauf** (identisches `runStr`, identische Step-Liste) → gemeinsame Gültigkeitszeit ist per Step strukturell garantiert; je Step werden alle drei parallel geholt und fusioniert (fehlt eines → Step übersprungen, Muster Böen). Die eigentliche Zeit-Auswahl (Slider) macht wie bei Böen `bracketAtValidTime`/`frameAtValidTime` im MapView.

### §8.6 Vollständige Seam-Liste (am Code verifiziert — §4 ist korrekt, ergänzt um Deck-Realität)
Der `LayerKey`-Zusatz `'thunder'` erzwingt (Typecheck) über die §4-Liste hinaus:
- **`statuses`-Init** (`MapView.tsx:336`, `Record<LayerKey,…>`) → `thunder: {}`.
- **`LAYER_INFO`** (`components/LayerInfoPanel.tsx:41`, `Record<LayerKey, Info>`) → `thunder`-Eintrag = **Tooltip/Legende mit Ehrlichkeits-Hinweisen** (§2.3).
- **`LayerIcon`** (`components/LayerIcon.tsx`) hat `default: return null` → Typecheck ok ohne Case, aber ein eigener **Gewitterwolke-mit-Blitz**-Case wird ergänzt (UX).
- **Toggle-Herkunft:** Dock **und** Mobile-Sheet rendern aus **`DECK_GROUPS`** (`MapView.tsx:2991`/`:3232`), **nicht** direkt aus `LAYER_OPTIONS`. Der Toggle muss also in `DECK_GROUPS` (Gruppe „Niederschlag", thematisch Konvektion vor dem Radarecho). `LAYER_OPTIONS` bleibt Pflicht (liefert `label`/`title` via `LAYER_BY_KEY`). Dies korrigiert die Wortlaut-Annahme aus §4.7/F1-7 („LAYER_OPTIONS-getrieben") — der Toggle erscheint durch **einen** additiven `DECK_GROUPS`-Eintrag auf Desktop **und** Mobile automatisch.

**Fazit:** Datenlage grün, kein Decode/EPS/Transport-Eingriff, kein STOPP. Umsetzung additiv wie geplant.
