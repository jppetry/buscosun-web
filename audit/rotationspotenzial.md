# audit/rotationspotenzial.md — Feature-Phase F5: Superzellen-/Rotationspotenzial-Layer

**Maßgebliche Vorgabe für die Umsetzung (via Claude-Code-CLI).** Die Punkte in `plan.md`/`checklist.md` sind die Kurzfassung; diese Datei ist verbindlich.

> **Scope-Hinweis / Jans Freigabe:** Funktionserweiterung (neuer Kartenlayer), von Jan beauftragt — außerhalb der ursprünglichen Mobile-Mission, analog F1–F4/T2. Diagnose-First + harte Regeln aus `CLAUDE.md` gelten unverändert.

---

## §0 ⚠️ Ehrlichkeits-Leitplanken (dieser Layer ist heikel — zuerst lesen)

Dieser Layer zeigt **Modell-Verdachtsflächen für rotierende Aufwinde**, keine Warnung und keine Tatsachen. Er ist ein **Experten-/Nischen-Signal** (Storm-Chaser), kein Allgemein-Produkt. Verpflichtend:

1. **Kein Warnersatz.** Der Tooltip/die Legende müssen klar sagen: „Modell-Verdacht, **kein** amtliches Warnprodukt — maßgeblich sind DWD-Warnungen." Idealerweise Verweis auf den bestehenden `dwdAlerts`-Pfad.
2. **Verdacht ≠ Ereignis.** Hohe Updraft-Helicity / SDI heißt „das Modell erzeugt hier einen rotierenden Aufwind", **nicht** „es gibt einen Tornado/Großhagel". Sprache konsequent im Konjunktiv/Verdachts-Modus („Rotationspotenzial", „Verdachtsfläche"), niemals „Tornado".
3. **Hohe Fehlalarmrate / Rauschen.** UH-Felder in konvektionserlaubenden Modellen sind **extrem lokal und rauschig** (einzelne Gitterzellen springen). → Darstellung geglättet/über Nachbarschaft aggregieren (§3), sonst suggeriert ein einzelner Pixel Präzision, die nicht da ist.
4. **Sober labeln.** Nüchterne Beschriftung, dezente Farbgebung an der Aktivierungsschwelle, keine reißerische Optik. Bewusst als „Experten-Layer" kennzeichnen.

Falls die Diagnose zeigt, dass eine seriöse, nicht-irreführende Darstellung mit diesen Feldern **nicht** möglich ist → **STOPP & FRAGEN** (lieber kein Layer als ein irreführender).

---

## §1 Ziel

Ein neuer, **standardmäßig inaktiver** Experten-Kartenlayer **„Rotationspotenzial"**, der aus ICON-D2-Konvektionsdiagnostik **Verdachtsflächen für Superzellen/rotierende Aufwinde** flächig über DACH rendert und über den Zeit-Slider 0–12 h läuft:

| Signal | ICON-D2-Feld | Bedeutung |
|---|---|---|
| **Rotation** | `uh_max` (Updraft-Helicity-Maximum, m²/s²) | Stärke rotierender Aufwinde (Superzellen-Kern) |
| **(Ebene tief)** | `uh_max_low` | UH in der unteren Schicht (Tornado-näher) |
| **Superzellen-Signatur** | `sdi_2` (Supercell Detection Index v2) | Modell-Detektor für Superzellen-Struktur |

**Nutzenversprechen:** „Wo hat das Modell heute rotierende Gewitter im Blick?" — Verdachtsflächen für organisierte Schwergewitter (Großhagel/Tornado-Potenzial), die **kaum ein Consumer-Dienst** zeigt (Storm-Chaser-Nische).

**Zielgruppe:** Outdoor · Storm-Enthusiasten (Experten-Layer). **Aufwand: Komplex. Mehrwert-Bewertung: 8/10.**

---

## §2 Diagnose — Datenlage & Wiederverwendung (vor Code)

### §2.1 Verfügbarkeit (bestätigt)
Directory-Listing `https://opendata.dwd.de/weather/nwp/icon-d2/grib/06/` enthält **`uh_max`**, **`uh_max_low`**, **`uh_max_med`** und **`sdi_2`** (sowie `w_ctmax`/`vorw_ctmax`) als eigene Parameter-Unterordner. Reguläre ICON-D2-2,2-km-Gitter (`regular_ll`, **nicht** icosahedral) → **derselbe Decode-Pfad wie Temp/Böen** (`fetchIconD2Grid` → `gribGridDecode`), kein EPS-Pfad.

### §2.2 Feld-Semantik & Timing (zwingend im Decode verifizieren)
- **`uh_max`/`uh_max_low`** sind **Maxima über das Ausgabeintervall** → am Analyse-Schritt strukturell 0 (wie `vmax_10m`/`lpi_max`). → **`minStepHours = 1`** beim Frame-Wählen, sonst „jetzt" leer.
- **`sdi_2`**: Vorzeichen/Wertebereich **prüfen** (SDI2 typ. dimensionslos, Vorzeichen ~ Rotationsrichtung; |SDI2| groß = Superzellen-Signatur). Instantan oder Intervall-Wert im Decode klären.
- **Einheiten `uh_max`** (m²/s²) und sinnvolle Schwellen sind stark schicht-/modellabhängig → in der Diagnose gegen echte Schwergewitter-Läufe kalibrieren (nicht raten).

### §2.3 Wiederverwendbare Bausteine (Reuse statt Neubau)
- **`src/radar/convectiveIndex.ts`** — Rampen-Helfer (`ramp`, `levelOf`) + das Ehrlichkeits-Muster (Warnung floort, Potenzial ≠ Auslösung) wiederverwenden; die Fusion selbst ist neu (§3).
- **`src/sources/dwdAlerts.ts`** — für den „kein Warnersatz"-Verweis/Floor (amtliche Unwetterwarnung im Tooltip anbinden, optional).
- **`fetchIconD2Grid`** lädt `uh_max`/`sdi_2` direkt; **`frameAtValidTime`** inkl. `minStepHours`.
- **`ScalarLayer`** rendert das (geglättete) Grid.
- **Lazy-Load-Muster** (`src/MapView.tsx`): `install<X>Ref` + `useEffect` auf `active.has(key) && !ref` + Sichtbarkeits-Block (~Z. 891) + `refreshIconD2Layers`-Zweig (~Z. 1524). Vorlagen: Clouds (Z. 1602), Gust (Z. 1612). → **Layer lädt erst beim Aktivieren.**

### §2.4 Warum „Komplex" (nicht Einfach/Mittel)
Anders als F2/F3 ist hier der Aufwand nicht das Laden, sondern **(a)** die seriöse **Kalibrierung** der Schwellen, **(b)** die **Glättung/Nachbarschafts-Aggregation** des rauschigen UH-Felds für eine ehrliche Darstellung, **(c)** die **Fusion** von UH-Stärke + SDI-Signatur zu einer verständlichen Aussage, und **(d)** die **Ehrlichkeits-/Labeling-Anforderungen** (§0). Das ist der eigentliche Arbeitskern.

---

## §3 Darstellung & Fusion (Vorschlag — in der Diagnose kalibrieren)

Pro Gitterzelle, alle Felder auf denselben Step/dieselbe Gültigkeitszeit:

```
uh    = uh_max (bzw. max(uh_max, uh_max_low) je nach Diagnose)
uhS   = uhScore(uh)                 // 0..100, Rampe (m²/s²) — KALIBRIEREN
sdiS  = sdiScore(|sdi_2|)           // 0..100, Superzellen-Signatur
score = clamp(round(max(uhS, 0.6*uhS + 0.4*sdiS)), 0, 100)   // SDI korroboriert/hebt an
```
Danach **Nachbarschafts-Glättung** (z. B. gleitendes Maximum/Mittel über ~3×3–5×5 Zellen) auf das Score-Grid, um Einzelpixel-Rauschen zu dämpfen (§0.3).

Vorschlags-Rampen (Startwerte — **zwingend kalibrieren**, Werte schicht-abhängig):
- `uhScore`: `0→0 · 25→15 · 50→40 · 75→65 · 100→80 · 150→95 · 250→100` (m²/s²).
- `sdiScore`: `0→0 · 0,2→20 · 0,5→55 · 1,0→85 · 1,5→100` (|SDI2|).

**Farbrampe/Legende:** transparent unterhalb einer klaren Aktivierungsschwelle (großzügig — lieber zu wenig als zu viel eingefärbt), dann dezent eskalierend (z. B. Violett/Purpur-Skala, bewusst **anders** als Regen/Radar/Gewitter, damit „Rotation" eigenständig lesbar ist). Stufen sober: „gering / erhöht / deutlich / hoch". **Nie** „Tornado".

**Fusion + Glättung als reine, headless-testbare Funktion** (`src/radar/rotationPotential.ts`, wie `convectiveIndex.ts`) → ohne Browser verifizierbar (§7).

---

## §4 Code-Seams (exakte Anschlusspunkte in `src/MapView.tsx`)

1. **`LayerKey`-Union (Z. 218):** `'rotation'` ergänzen.
2. **`LAYER_OPTIONS` (Z. 249):** Eintrag `{ key: 'rotation', label: 'Rotation', title: 'Rotationspotenzial (Experten-Layer) — ICON-D2 Updraft-Helicity (uh_max) + Supercell-Index (sdi_2), 2,2 km, 0–12 h. Modell-VERDACHTSflächen für rotierende Gewitter (Großhagel/Tornado-Potenzial). KEIN amtliches Warnprodukt — maßgeblich sind DWD-Warnungen. Hohe Fehlalarmrate. DACH.' }`.
3. **`layerRefs` (Z. 473):** optionales Feld `rotation?: ScalarLayer`.
4. **Map-Init-Effekt (~Z. 787ff):** `rotationLayer = new ScalarLayer({ id: ROTATION_LAYER_ID, colorRamp: rotationRamp, visRange: {...} })` + der Karte hinzufügen; `ROTATION_LAYER_ID`-Konstante oben bei den anderen `*_LAYER_ID`.
5. **Sichtbarkeits-Block (~Z. 891):** `[ROTATION_LAYER_ID]: active.has('rotation')`.
6. **`refreshIconD2Layers` (~Z. 1524):** `rotation`-Zweig, der bei aktivem Layer die Felder neu zieht.
7. **Lazy-Load-Effekt (Muster wie Clouds Z. 1602 / Gust Z. 1612):**
   ```ts
   useEffect(() => {
     if (active.has('rotation') && !iconD2RotationRef.current) void installRotationRef.current?.();
   }, [active]);
   ```
   `installRotationRef` wird im Map-Init-Effekt gesetzt und lädt **erst hier** `uh_max`(+`sdi_2`).
8. **Neue Quelle `src/sources/iconD2Rotation.ts`:** `uh_max`(+`uh_max_low`, `sdi_2`) über `fetchIconD2Grid`, Frame-Wahl `minStepHours = 1`; fusioniertes + geglättetes Score-Grid je Frame.
9. **Neue reine Fusion `src/radar/rotationPotential.ts`** mit `verifyRotationPotential()` + `window.__verifyRotationPotential` (Muster `convectiveIndex.ts` Z. 232).
10. **Legende:** Rotations-Palette, sober; Zusatz „Experten-Layer · Verdacht, kein Warnersatz".

---

## §5 Umzusetzende Maßnahmen (F5-1 … F5-7)

- **F5-1** `src/sources/iconD2Rotation.ts`: Grid-Loader `uh_max`(+`uh_max_low`,`sdi_2`) (Reuse `fetchIconD2Grid`/`frameAtValidTime`); **Feld-Semantik/Vorzeichen/Einheiten im Decode verifizieren** (§2.2), `minStepHours=1`.
- **F5-2** `src/radar/rotationPotential.ts`: reine Fusion (§3) + **Nachbarschafts-Glättung** + `verifyRotationPotential()`-Harness (Reuse `ramp`/`levelOf`).
- **F5-3** `rotationRamp` + `visRange` (dezent, eigene Palette, großzügige Aktivierungsschwelle).
- **F5-4** `MapView.tsx`: die 7 additiven Seams aus §4 inkl. **Lazy-Effekt** — additiv, keine bestehende Zeile verändern.
- **F5-5** Legende + Tooltip mit den **Ehrlichkeits-Leitplanken §0** (kein Warnersatz, Verdacht ≠ Ereignis, Fehlalarme, Experten-Layer), Verweis auf DWD-Warnungen.
- **F5-6** `scripts/verify-rotation.mjs` (Node strip-types, kein Vitest).
- **F5-7** Mobile-Sichtprüfung (Toggle im Sheet-Layer-Segment, Touch-Target, Legende).

---

## §6 Abgrenzung / harte Regeln

- **Additiv & lazy:** nicht im `initialActive`-Default; Felder werden **ausschließlich** beim ersten Aktivieren geladen (Lazy-Effekt §4.7). Kaltstart unberührt.
- **Kein Eingriff** in: `dwdAlerts` (nur lesen/verweisen), bestehende Konvektions-/Radar-Layer, Wind-Shader/RGBA8/Fusion-Engine/EPS/Radar. `convectiveIndex.ts` nur lesen/wiederverwenden.
- **Transport:** `uh_max`/`sdi_2` laufen automatisch über den generischen `/_dwd_grib`-Proxy. **Optional/vertagt:** `warm-grib.mjs`-Vorwärmung.
- **Desktop-Regression:** keine (Layer neu + aus).
- **STOPP & FRAGEN**, falls (a) eine seriöse, nicht-irreführende Darstellung mit diesen Feldern nicht möglich ist (§0), (b) `uh_max`/`sdi_2` nicht regulär-gegittert sind, oder (c) die Felder-Semantik unklar bleibt.

---

## §7 Verify (→ `tests.md` V-ROTATION)

1. **Fusion-Harness:** `node scripts/verify-rotation.mjs` grün (ruhig→keine; hohe UH + SDI-Signatur→hoch; nur schwache UH→gering; Glättung dämpft Einzelpixel; Score monoton & clamped 0..100).
2. **Lazy-Load belegt:** Kartenstart **ohne** `uh_max`/`sdi_2`-Requests; erst der Toggle „Rotation" löst die Fetches aus (über `/_dwd_grib`).
3. **t+0/Feld-Semantik:** `minStepHours=1` greift (t+0 nicht künstlich leer trotz Intervall-Maximum); SDI-Vorzeichen/Bereich im Decode dokumentiert; Domänenrand transparent.
4. **Ehrlichkeit (kritisch):** Tooltip/Legende benennen „kein Warnersatz", „Verdacht ≠ Ereignis", „hohe Fehlalarmrate", „Experten-Layer"; Sprache nie „Tornado"; Verweis auf DWD-Warnungen vorhanden. Darstellung geglättet (kein Einzelpixel-Alarmismus).
5. **Diff:** nur neue Datei(en) + additive `MapView.tsx`-Seams; `dwdAlerts`/`convectiveIndex.ts`-Verhalten/Wind-Shader/RGBA8/Fusion/EPS/Radar unberührt (Diff-Beleg).
6. **Mobile (390×844):** Toggle im Sheet-Layer-Segment, Touch-Target ≥ 44 px, Legende (inkl. Experten-Hinweis) sichtbar, keine neuen Konsolenfehler; Desktop mit aktivem/inaktivem Layer sauber; `npm run typecheck` grün.

**Gate GF5:** Harness grün · Lazy-Load im Waterfall belegt (0 Requests vor Aktivierung) · Feld-Semantik/`minStepHours` verifiziert · **Ehrlichkeits-Leitplanken §0 im UI umgesetzt** (kein Warnersatz, Verdachts-Sprache, Glättung) · Domänenrand ehrlich maskiert · additiver Diff · Mobile-Toggle sauber · Desktop unverändert · Konsole/Typecheck grün.

---

## §8 Diagnose-Befund (2026-07-24, vor Code) — Live-Decode gegen echten Lauf

**Werkzeug:** temporäres `scripts/diag-rotation-fields.mjs` (Muster `diag-snow-fields.mjs`/F4) —
holt `uh_max`/`uh_max_low`/`sdi_2` direkt von opendata.dwd.de, entpackt (`bz2`), dekodiert via
echtem `decodeGrib2`; Läufe 2026-07-24 09z + 12z.

### §8.1 Gitter & Feld-Identität (bestätigt)
- Alle drei **regulär lat-lon (GDT 0)**, `unstructured=false`, **1215×746**, di=dj=0,02°,
  Domäne lat[43,18…58,08] lon[−3,94…20,34] → DACH gedeckt, ~151 528 NaN-Zellen = Domänen-Bitmap.
  → **Decode-Pfad wie Temp/Böen (`fetchStepField` + `/_dwd_grib`), NICHT EPS/icosahedral.** ✅
  (Wie F1–F4 wird BEWUSST `fetchStepField` statt `fetchIconD2Grid` genutzt — die Fusion braucht
  Roh-Float-Werte, nicht Uint8; `fetchIconD2Grid` würde `gribGridDecode.ts` anfassen. Prompt-Wortlaut
  „fetchIconD2Grid" = derselbe reguläre GRIB2-Pfad, gemeint ist die Nicht-EPS-Pipeline.)
- **Identität (GRIB2 Sektion 4):** `uh_max` = discipline 0 / cat 7 / num 15, surface 102 **level 2000**
  → Updraft-Helicity **mittlere Troposphäre (~2–5 km, Superzellen-Hauptaufwind)**. `uh_max_low` =
  cat 7 / num 15, surface 102 **level 0** → **untere Schicht (0–3 km, boden-/tornadonah)**.
  `sdi_2` = cat 7 / num **193** (DWD-lokal), surface 1 → Supercell Detection Index. Einheiten UH
  m²/s² (Web/DWD bestätigt). Beide UH-Felder **vorzeichenbehaftet** (zyklonal + / antizyklonal −)
  → Fusion nutzt **|UH|** (vorzeichen-invariant), sdi ebenfalls über |sdi_2|.
- **t+0:** Schritt 000 IST publiziert und trägt hier bereits Werte (nicht künstlich 0). `minStepHours=1`
  bleibt dennoch die ehrliche Wahl (degeneriertes Analyse-Intervall meiden, Muster lpi_max/Böen) —
  Jans HARTE Vorgabe; kostet nur den „jetzt"→+1h-Frame.

### §8.2 ⚠️ Magnituden — die Spec-Rampen (§3) sind ~10²–10³× ZU HOCH (Kalibrier-Blocker)
Empirische |·|-Verteilung über die DACH-Domäne (24.07. 09z/12z, ein **schwacher Rotationstag**):

| Feld | Hintergrund | p99.9 | Tages-Hotspots (|·|max) | Spec-Vorschlag |
|---|---|---|---|---|
| `uh_max` (2–5 km) | <0,1 | ~0,3–0,7 | **~4–8** (Alpen: Südtirol 46,6N/10,7E; 12z-Peak ~5) | Rampe 25…**250** |
| `uh_max_low` (0–3 km) | <0,1 | ~0,5–1,5 | **~7–9** (Kvarner 45,3N/14,3E) | (dito) |
| `sdi_2` | ~1e-6 | <1e-4 | **|max| < 5e-4** (`≥1e-3` = **0 Zellen**) | Rampe 0,2…**1,5** |

→ Mit den Spec-Zahlen bliebe der Layer **dauerhaft leer** (uh) bzw. **sdi trägt nie bei** (sdi_2 ist
heute ~0). ICON-D2-UH liegt **einstellig** (m²/s²), nicht bei zehner-/hunderter-Werten wie in
US-CP-Modellen (HRRR/WRF). Die Spec hat davor selbst gewarnt („do NOT guess — layer/model-abhängig").

### §8.3 Warum das ein STOPP-&-FRAGEN-Punkt ist (§0 / §6c)
- Aufgelöst: Gitter regulär ✅ (§6b), Semantik/Einheiten geklärt ✅.
- **Offen (gate-blockend):** Die HARTE Verify-/Spec-Vorgabe „gegen einen **echten Schwergewitter-Lauf**
  kalibrieren" ist **heute nicht erfüllbar** — DWD-Opendata hält nur die jüngsten Läufe, und der
  aktuelle Tag ist rotationsschwach. Ich kann den **oberen** Rampen-Anker (was ist „hoch" für
  ICON-D2-UH?) nicht beobachten, und der SDI-Korroborationspfad lässt sich mangels Signal nicht
  „live leuchtend" verifizieren. Eine Kalibrierung allein am ruhigen Tag ist genau das von §0.3/§0.4
  verbotene Raten: zu tief → Alpen-Orografie-Rauschen wird täglich als „Rotationsverdacht" gemalt
  (Fehlalarm-Falle); zu hoch → Layer wirkt tot.
- **Entscheidung liegt bei Jan** (sein ehrlichkeits-heikles Produkt, seine Fehlalarm-Toleranz).
  Vorschlag → §8.4.

### §8.4 Vorschlag (konservativ, am gemessenen ICON-D2-Maßstab)
Falls „bauen": Rampen an der **realen** ICON-D2-Skala + großzügige (hohe) Aktivierungsschwelle, damit
ruhige Tage transparent bleiben (Under-Paint, §0.4). Startwerte (im Harness fixiert, später gegen
einen echten Superzellen-Lauf nachziehbar):
- `uhScore` (|UH| in m²/s²): `0→0 · 3→0 · 5→15 · 10→45 · 20→75 · 40→95 · 60→100`.
- `sdiScore` (|sdi_2|): `0→0 · 1e-4→10 · 5e-4→35 · 2e-3→70 · 1e-2→100` (**Boost-only**, via
  `max(uhS, 0.6·uhS+0.4·sdiS)` — sdi kann nie allein aktivieren).
- Nachbarschafts-**Glättung** 5×5 gleitendes Maximum→Mittel auf dem Score-Grid (§0.3), damit
  Einzelzell-Alpen-Peaks nicht als Präzision durchschlagen. Aktivierungs-`visRange` bei ~Score 20.
- Ergebnis am 24.07.: nahezu transparent (nur der Kvarner-Cluster faint „gering" nach Glättung) —
  ehrlich für einen rotationsschwachen Tag.

**→ Rückfrage an Jan gestellt (Kalibrier-Philosophie / bauen-oder-vertagen), bevor Render-Code
entsteht. Kein Code bis zur Freigabe.**
