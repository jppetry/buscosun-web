# WEATHER.md — Meteorologischer Layer-Katalog

> **Stand: 2026-08-05.** Fachliche Beschreibung aller Wetterlayer der 2D-Karte — die **16
> bestehenden** (Ist, am Code verifiziert) und die **9 geplanten** (Konzept).
> **Status: Analyse und Konzept. Keine Implementierung.**
>
> Zugehörig: `docs/DATA_SOURCES.md` (Quellen) · `docs/LAYER_SYSTEM.md` (technischer Vertrag) ·
> `docs/MAP.md` (Rendering) · `docs/2d-layer-erweiterung.md` (Umsetzungsplan) ·
> `docs/niederschlag-architektur.md` (Niederschlags-Spezialfall) ·
> `docs/high-end-radar-feature-catalogue.md` (Funktionskatalog Radar).

---

## 0. Die drei Kategorien — und warum die Trennung nicht verhandelbar ist

buscosun unterscheidet konsequent drei Aussagearten. Das ist keine Kosmetik, sondern die technische
Umsetzung von **D-04 (Ehrlichkeits-Prinzip)** und der Grund, warum es getrennte Layer für
„Blitze" und „Blitzprognose" gibt.

| Kategorie | Bedeutung | Sprachliche Kennzeichnung | Beispiele |
|---|---|---|---|
| **Messung** | ein Instrument hat es gemessen | „gemessen", „Analyse", Messzeit im Chip | Radar, Blitzortung, Stationen, Satellit |
| **Nowcast** | Extrapolation einer Messung, kurzer Horizont | „Nowcast", „Extrapolation", Horizont nennen | RADOLAN-RV, INCA, Flow-Nowcast |
| **Modell** | numerische Vorhersage | „Modell", „Prognose", „Potenzial", Lauf nennen | ICON-D2-Layer, Fusion |

**Vier Regeln, die aus dieser Trennung folgen und für jeden neuen Layer gelten:**

1. Ein Layer mischt Messung und Prognose **nicht ohne sichtbare Kennzeichnung**. Wo eine Quelle das
   tut (DWD `NCEW_EU` enthält erkannte *und* prognostizierte Blitze), sagt die Legende es.
2. Ein Layer, dessen Quelle keine Messung ist, heißt nicht „Radar". Die INCA-Fläche über Österreich
   ist eine **Analyse**, kein Radarkomposit — auch wenn sie Radar assimiliert.
3. Experten-Layer tragen konservative Sprache (D-19): „Verdacht", „Potenzial", „Hinweis" — nie
   „Warnung", nie „Tornado", nie eine Formulierung, die amtliche Warnprodukte imitiert.
4. Fehlt für ein Land die Quelle, sagt der Layer das. „Keine Daten" darf nie wie „keine Gefahr"
   aussehen.

---

# TEIL A — BESTEHENDE LAYER (16)

## 1. Wind

**`wind` · Messung/Modell · DWD ICON-D2 u/v 10 m · 2,2 km**

GPU-Partikelsystem in webgl-wind-Tradition über einer Geschwindigkeits-Heatmap. Ping-Pong-Advektion
mit `calm_boost`-Respawn, Trail-/Fade-Framebuffer. Der einzige Layer, der bewusst **über** Grenzen
und Beschriftungen liegt. Performance ausschließlich über den `FrameGovernor` (D-09) — Partikelzahl
ist nie ein Hebel, damit die Optik geräteübergreifend gleich bleibt.

## 2. Böen

**`gust` · Modell · ICON-D2 `vmax_10m` · 0–24 h**

Spitzenböen als Skalarfläche. Farbrampe an Beaufort orientiert: 17 m/s Sturmböe (Bft 8), 25 m/s
schwere Sturmböe (Bft 10), 33 m/s Orkan (Bft 12). Sicherheitsrelevant für Drohne, Kran,
Höhenarbeit — Kopplung an das Go/No-Go-Feature.

## 3. Niederschlag · jetzt–2 h

**`nowcast` · Nowcast · per Land · D-14**

Der zentrale Niederschlagslayer. Über den Zeit-Slider das gemessene Landesradar bzw. dessen
Nowcast, per Land bis zum jeweiligen Horizont:

| Land | Quelle | Horizont |
|---|---|---|
| DE | DWD RADOLAN-RV | 0–2 h |
| AT | GeoSphere INCA | 0–3 h |
| CH | MeteoSchweiz `rzc` | ~jetzt (< 0,5 h) |

Jenseits des Landeshorizonts blendet der Layer aus — **keine Modellverlängerung**. Diese Entscheidung
(D-14, Jan 2026-07-24) ersetzte bewusst die frühere 0–12-h-Ambition: „kürzer und ehrlicher".
Der DACH-Kompositor mischt pro Kartenzelle die fachlich richtige Quelle, unabhängig davon, in welchem
Land der Nutzer gesucht hat.

Skala 0…20 mm/h, Alpha in die Rampe eingebacken (< 0,06 mm/h transparent). Bikubische
B-Spline-Abtastung glättet die 1-km-Stufen ohne Überschwingen.

## 4. Schnee

**`snow` · Modell · ICON-D2 `h_snow` / `snow_gsp`+`snow_con` · 2,2 km**

Schneemenge als Fläche in cm, zwei Modi: **Schneedecke** (aktuelle Höhe, instantan) und
**Neuschnee** (Zuwachs über das Vorhersagefenster, SWE→cm). Nicht zu verwechseln mit der
Schneegrenzen-Linie. Ehrlichkeitshinweis im Layer: Modell, keine Messung; am Modellrand ohne Wert;
das Schnee-Wasser-Verhältnis ist eine Näherung.

## 5. Temperatur

**`temp` · Modell · ICON-D2 `t_2m` · 2,2 km, höhenkorrigiert**

Besonderheit gegenüber allen Wettbewerbern in dieser Preisklasse: **per-Pixel-DEM-Lapse-Refinement**.
Der G-Kanal der Werte-Textur trägt die Zellmittel-Höhe; der Shader rechnet auf Meereshöhe zurück und
wendet 6,5 °C/km gegen ein fragment-gesampeltes DEM neu an. Ergebnis: kontinuierliche
Tal/Grat-Gradienten statt 6-km-Treppen. Skala −20…+40 °C.

## 6. Wolken

**`clouds` · Modell · ICON-D2 CLCT/CLCL/CLCM/CLCH · 0–12 h**

Bewölkungsgrad, geschichtet aus tiefen, mittleren und hohen Wolken. < 3 % transparent
(klarer Himmel).

## 7. Satellit

**`sat` · Messung · DWD OpenData / Meteosat · alle 3 h**

Zwei Produkte: **Europa RGB/IR** (HRV bei Tag, IR 10.8 bei Nacht, automatisch umgeschaltet, ~1 km)
und **Welt IR** (IR 10.8, ~3 km, 24/7). Kadenz 3 h — für Animation zu grob; das echte
Aufnahmedatum wird über `wmsTime.ts` aus der TIME-Dimension gelesen und **als solches** angezeigt
(nicht die Abrufzeit — D-04/V-19).

## 8. Gewitterpotenzial

**`thunder` · Modell · ICON-D2 CAPE × CIN × LPI · 0–12 h**

Fusion aus Energie (CAPE), Deckel (CIN) und Blitzbereitschaft (LPI) zu einem 0–100-Score.
Fünfstufig: gering (Gelb) → erhöht (Amber) → deutlich (Orange) → hoch (Rot) → extrem (Magenta).
Flächige Vorwarnung **vor** dem ersten Radarecho. Ehrlichkeitshinweis: „Potenzial ≠ Auslösung",
am Modellrand ohne Wert.

## 9. Rotationspotenzial

**`rotation` · Modell · Experten-Layer · ICON-D2 `uh_max` + `uh_max_low` + `sdi_2` · 0–12 h**

Geglättete Verdachtsflächen für rotierende Aufwinde/Superzellen. Bewusst **desaturierte**
Violett/Indigo-Palette — nüchtern, nicht reißerisch, klar getrennt von Regen, Gewitter und
Blitzprognose. Aktivierungsschwelle großzügig (Score 20) nach dem Prinzip „lieber Under- als
Over-Paint".

Die Layer-Beschreibung ist ein Musterbeispiel für D-19: *„KEIN amtliches Warnprodukt, kein
Warnersatz — maßgeblich sind die DWD-Warnungen. Verdacht ≠ Ereignis, hohe Fehlalarmrate."*
Die Spec-Schwellen waren ursprünglich ~100× zu hoch angesetzt und wurden an der gemessenen Skala
nachkalibriert.

## 10. Blitze

**`lightning` · Messung · DWD `Accumulated_Flash_Area` · letzte 60 Min**

Blitzortung als WMS-Raster. → Wird durch die Erweiterung ersetzt/ergänzt (§18).

## 11. Blitzprognose

**`lightningfc` · Modell · ICON-D2 `lpi_max` · 0–12 h**

Prognostiziertes Blitzrisiko, Skala 0–30 J/kg, fünfstufig bis „Elektrik-Violett". Die Palette ist
**bewusst violett-forciert**, damit sie optisch klar getrennt bleibt von (a) den gemessenen Blitzen
(amber) und (b) der Gewitterrampe (endet magenta). Beobachtung, Prognose und Fusion müssen
unterscheidbar bleiben — auch bei Überlappung.

## 12. Stationen

**`stations` · Messung · DWD · TAWES · SMN**

Live-Messwerte echter Wetterstationen, klickbar. Liegt über der Länder-Maske (fester Kontrakt).

## 13. Sicherheit (Vertrauens-Schleier)

**`confidence` · ML · Klima-MOS · 30 J. DWD-Klimatologie**

Kreuzschraffur, deren Dichte proportional zur Vorhersage-Unsicherheit ist — aus Vorlaufzeit ×
klimatologischer Plausibilität. Liegt über den Datenschichten, unter den Beschriftungen.
Reliability/Brier headless kalibriert, Ergebnis auf der Validierungs-Seite einsehbar.

## 14. Schneegrenze

**`snowline` · ML · Physik-Anker + gelernte Ortskorrektur**

Linie, oberhalb derer Niederschlag als Schnee fällt. Physik-Anker ~+1 °C plus gelernte Korrektur
aus DWD-Stationen, dem Gelände folgend (höhenkorrigiert). Native GeoJSON-Linie mit Casing.

## 15. Flow-Nowcast

**`flownowcast` · Nowcast · Optical Flow auf RADOLAN-RV · ~0–60 min · nur DE**

Horn-Schunck-Bewegungsfeld plus Lagrange-Advektion. Bewusst kein CNN gewählt (D-17), weil
Optical Flow **intensitätserhaltend** ist. Trainingsfrei. Live gegen späteres Radar geprüft
(Brier, CSI, Reliability).

## 16. Regen-Chance

**`poprob` · Nowcast/Ensemble · 15-Member-Flow-Ensemble · nur DE · ~0–60 min**

15 Member advehieren das Radar mit gestörten Bewegungsfeldern; je Zelle der Anteil, der Regen
bringt. „Wie wahrscheinlich" statt „wie viel" — die richtige Framing-Umstellung jenseits von
~90 Minuten.

---

# TEIL B — GEPLANTE LAYER (9 + Ausbaustufen)

> Alle folgenden Beschreibungen sind **Konzept**. Quellenbewertung in `docs/DATA_SOURCES.md`,
> Umsetzung in `docs/2d-layer-erweiterung.md`.

## 17. Regenradar (Messung, mit Rückblick)

**Geplanter Key: `rainradar` · Bit 16 · Messung · Zeitmodus `forecast` mit `pastWindowH = 1` ·
Z-Band `precip` (3) · Phase L6**
Umsetzungsspezifikation: **`docs/zuglinien-radar-spec.md`** Teil III.

**Abgrenzung zu `nowcast`:** `nowcast` zeigt Analyse **und** Nowcast in einer durchgehenden Ansicht.
Der neue Layer zeigt dieselben Pixel — dafür mit **Rückblick** (60 Minuten, O-10) und mit
Abspielsteuerung. Er beantwortet „woher kam das", nicht „wohin geht es".
**Er ist eine zweite Ansicht auf denselben Kompositor, kein zweiter Datenpfad** — D-14 bleibt
unangetastet, es gibt keine Modellverlängerung.

| Land | Quelle | Zeitbereich | Kadenz |
|---|---|---|---|
| DE | RV-`_000`-Frames der letzten 12 Läufe (Session-Cache + Archiv-Seed) | −60 min … +2 h | 5 min |
| AT | INCA-Analyse — **als Analyse gekennzeichnet**, ⚠️ **ohne gemessenen „jetzt"-Frame** (kleinster Lead ≥ 0,25 h) | Session-Cache … +3 h | 15 min |
| CH | MeteoSchweiz RZC | Session-Cache … jetzt | 5 min |

⚠️ **Der Rückblick wächst über die Sitzung, außer für DE.** Nur Deutschland hat einen
Archiv-Seed (`seedDePastArchive`, 12 RV-Tars, nicht im Kaltstartpfad); AT und CH sammeln ihre
Vergangenheit erst im Sitzungsverlauf. Das ist auf der Zeitleiste sichtbar zu machen (Länderbänder,
Spec §12.3) und nicht zu kaschieren.

**Gegenseitiger Ausschluss:** `rainradar` und `nowcast` liegen beide im Band `precip` und zeigen
bei h ≥ 0 dieselben Werte. Weicher Ausschluss nach O-12 — der zuletzt aktivierte gewinnt, mit
sichtbarem Hinweis; **kein hartes Sperren** (das würde als Wegnahme gelesen).

**Fachliche Hinweise für die Legende:** RZC sättigt bei 118 mm/h (der Wert ist eine Untergrenze).
Radar misst nicht am Boden, sondern in Höhe des Strahls — im Gebirge mit Abschattung. Der
Feature-Katalog §10 nennt Strahlabschattung, Bright-Band und Reichweitenabfall ausdrücklich als
Differenzierungsmerkmal („most consumer apps hide radar's lies").

## 18. Niederschlagszuglinien / Niederschlagsbewegung

**Geplanter Key: `motion` · Bit 17 · abgeleitet (keine Messung!) · Zeitmodus `forecast` ·
Z-Band `vector` (6) · Phase L6**
Umsetzungsspezifikation: **`docs/zuglinien-radar-spec.md`** §10.

Die Bewegung als eigene visuelle Ebene, in drei Ausbaustufen:

| Stufe | Darstellung | Datengrundlage | Phase |
|---|---|---|---|
| E1 | Flüssige Verlagerung (Playback + CPU-Crossfade) | RV-Frames −60 min…+120 min | **L6** |
| E2 | **Zugvektoren** — Pfeile mit Richtung und Tempo | Horn-Schunck über **gemessene** Analysen (`estimateFlowHS`, vorhanden) | **L6** |
| E3 | **Zellbahnen** — Umriss, prognostizierter Pfad, amtlicher Unsicherheits-Trichter, ETA | **KONRAD3D** (amtlich, Schema seit 2026-08-05 belegt); `cellTracking.ts`-Fallback spezifiziert, **nicht gebaut** (V-149) | ✅ **umgesetzt 2026-08-05** (Phase **Z1**, `LayerKey 'cells'`, Gate GZ1) — vorgezogen aus L11 |

**Legende und Sprache (verbindlich):**
- **Einheit km/h**, Pfeil zeigt, **wohin** der Niederschlag zieht (umgekehrter Sinn zur
  Windrichtung — die Legende muss es sagen).
- Der Zusatz **„aus zwei gemessenen Radarbildern berechnet (buscosun)"** ist Pflicht: die Pfeile
  sind buscosuns Rechnung, kein DWD-Produkt. Attribution entsprechend
  `Datenbasis: Deutscher Wetterdienst, eigene Elemente ergänzt` (→ V-140).
- Für AT: **„aus der INCA-Analyse abgeleitet"** — die Beschriftung „Radar" ist für AT unzulässig.
- Zeitangaben auf 5 Minuten gerundet („erreicht … in ~35 min"), nie minutengenau.
- **Nie** „trifft", „Warnung", „Unwetter", „Gefahr" (D-04/D-19).

⚠️ **Zwei Fallen, die ausdrücklich benannt gehören:**
1. Der Fluss darf **nur aus gemessenen Analysen** geschätzt werden, nie aus den
   RV-Vorhersageframes — diese tragen bereits die Advektion des DWD-Nowcasts (zirkulär).
2. INCA liefert `dd`/`ff` (10-m-Wind) direkt daneben. **Bodenwind ist nicht die
   Verlagerungsrichtung von Niederschlagsgebieten.** Ein Zuglinien-Layer daraus wäre fachlich
   falsch und nach D-04 unzulässig.

**Schweiz:** keine Pfeile. Es gibt keine offene Bewegungs- oder Nowcast-Quelle (INCA-CH ist „Data
on request"). Der Layer zeigt den Lückentext plus Deep-Link (O-14 Option B) — **kein Modellersatz,
keine Interpolation über die Grenze.**

**Die wichtigste Gestaltungsanforderung ist nicht die Animation, sondern der Bruch:** Der Übergang
von gemessen zu vorhergesagt muss auf der Zeitachse **hart sichtbar** sein — gestrichelte Spur,
Farbwechsel oder eine „⟶ Vorhersage"-Marke. Der Feature-Katalog nennt das *„the single
most-underrated feature"*; für buscosun ist es die visuelle Umsetzung von D-04.

**Ehrlichkeitsgrenze:** Radarextrapolation verliert jenseits von ~60–90 Minuten schnell an Wert.
Die Konfidenz muss auf der Zeitachse sichtbar abklingen. „Nowcast confidently extended to 6 h on
radar extrapolation alone" steht im Feature-Katalog §16 ausdrücklich unter den **Anti-Features**.

## 19. Hagel — ✅ **umgesetzt 2026-08-06** (Phase HA1, Gate GHA1)

**Key: `hail` · Messung (radarabgeleitet) · Diagnose `audit/hagel.md`**

| Ebene | Produkt | Größe | Takt | Status |
|---|---|---|---|---|
| **Fläche** (Schweizer Radarverbund) | **MESHS** (`mzc…h5`, `quantity=MESH`) — maximal erwartete Hagelkorngröße, Treloar-Verfahren | **mm** ⚠️ (nicht cm — an der Datei gemessen), Anzeige in cm | 5 min | ✅ gebaut |
| **Fläche** (Schweizer Radarverbund) | **POH** (`bzc…h5`, `quantity=POH`) — Hagelwahrscheinlichkeit, Waldvogel-Verfahren | **Anteil 0…1** ⚠️ (nicht %), Anzeige ×100 | 5 min | ✅ gebaut |
| **Zellen** (deutscher Radarverbund) | **DWD KONRAD3D** — `intensity/hail_flag` + `hymec/{area_hail, area_large_hail, echo_top_hail}` | km² · m · Stufe 0/1/2 | 5 min | ✅ gebaut |
| — | RADVOR RE, Bit 13 „Hagelflag" | binär | 5 min, 0…+120 min | ⚠️ **zurückgestellt**, Georeferenz unbelegt → V-152 |
| **AT** | — **keine eigene offene Quelle**; im Osten keine Abdeckung, im Westen nur Reichweite der Nachbarverbünde | | | ausgewiesen |

⚠️ **Die Produkte hängen an Radarverbünden, nicht an Staatsgrenzen** — bei der Verifikation lag das
stärkste POH-Signal in **Bayern** (10,07 °E/47,93 °N, 36 %). Der Layer beschriftet deshalb
„Fläche/Zellen" mit dem jeweiligen Verbund statt „CH/DE".

**Warum das der stärkste geplante Layer ist:** Eine amtliche, kostenlose, 5-minütige
Hagelkorngrößen-Karte zeigt im DACH-Consumer-Markt praktisch niemand. Für Landwirtschaft, Bau,
Fahrzeughalter und Veranstalter ist das ein Entscheidungs-Layer.

**Zwei harte Ehrlichkeitsanforderungen:**
1. **Saisonalität CH:** POH/MESHS werden **nur vom 1. April bis 30. September** gerechnet.
   Außerhalb existieren die Dateien und sind leer. Der Layer muss in dieser Zeit einen
   **Saisonhinweis** zeigen — nicht eine leere Fläche, die wie „kein Hagel" aussieht.
2. **AT-Lücke:** ausdrücklich benennen, mit Verweis auf die amtliche Stelle.

**Was nicht gebaut wird:** Ein Hagel-Layer aus `opendata.dwd.de/weather/radar/composite/hg/`. Das
Verzeichnis existiert, aber „HG" kommt in keiner zugänglichen DWD-Formatbeschreibung vor. Ein Layer,
der „Hagel" behauptet, weil ein Verzeichnis so heißt, ist derselbe Fehlertyp wie die erfundenen
„78 %" (V-18) — nur sicherheitsrelevant.

## 20. Gewitter (beobachtete Zellen)

**Geplanter Key: `storm` · Messung (+ Prognose, gekennzeichnet)**

Abgrenzung: `thunder` = Potenzial (Modell), `lightningfc` = Blitzrisiko (Modell), `storm` = **was
das Radar jetzt sieht**.

| Stufe | Quelle | Darstellung |
|---|---|---|
| 1 | DWD `dwd:NCEW_EU` (NowCastELEC-Polygone) | Raster/Polygone |
| 2 | DWD KONRAD3D (5-min-XML-Objekte) | Zellumriss, Zug-ID, Pfadkegel, ETA |
| — | DWD Mesozyklonen-XML | Experten-Zusatz, sehr selten belegt |

**Ehrlichkeitsproblem bei Stufe 1:** `NCEW_EU` enthält laut Beschreibung Polygone um **erkannte und
prognostizierte** Blitze in einem Layer. Wenn die Attributierung keine Trennung erlaubt, muss die
Legende das ausdrücklich sagen — eine unmarkierte Vermischung von Messung und Prognose widerspricht
D-04.

**Fachlicher Wert von Stufe 2:** Die Frage „erreicht mich diese Zelle, und wann?" ist im
Feature-Katalog §15 eines der fünf Differenzierungsmerkmale. Mit KONRAD3D wäre die Antwort
**amtlich** statt selbst gerechnet.

## 21. Blitzaktivität

**Geplanter Key: `flash` · Messung**

Ersetzt/ergänzt den heutigen `lightning`-Layer durch zwei Quellen mit unterschiedlicher Physik:

| Quelle | Was gemessen wird | Auflösung | Abdeckung | Zeitachse |
|---|---|---|---|---|
| **DWD `dwd:Blitzdichte`** | Blitzdichte aus dem NowCastMix-Verfahren, 0–3000 Blitze pro Zeiteinheit und 100 km², nichtlinear auf 0–127 abgebildet | ~1 km | **DE** | **13 Monate, 5-min-Raster** |
| **EUMETSAT `mtg_fd:li_afa`** | optische **Gesamt**blitzaktivität (Wolke-Wolke **und** Wolke-Boden) vom MTG Lightning Imager | 2 km | **DACH+** | 14 Monate, 5-min-Raster |

**Drei fachliche Hinweise, die in die Legende gehören:**
1. **Satellit ≠ Bodennetz.** Der Lightning Imager sieht optische Gesamtblitzaktivität, ein Bodennetz
   sieht überwiegend Erdblitze. Die Bilder unterscheiden sich **systematisch**, nicht zufällig.
2. **Parallaxe.** Der Satellit steht geostationär bei 0° Länge; bei ~50° N ist der Versatz
   gegenüber der Radar-Ortung nicht vernachlässigbar. Das Radar bleibt die Ortungsreferenz.
3. **Überlappende Fenster.** `Blitzdichte` schreitet alle 5 Minuten fort, zeigt aber jeweils die
   letzten 15 Minuten. Aufeinanderfolgende Bilder sind nicht unabhängig — Aufsummieren zählt
   dreifach.

**Was nicht gebaut wird:** kein Layer auf Basis von Blitzortung.org. Die Nutzungsbedingungen
verbieten kommerzielle Nutzung ausdrücklich und untersagen den Einsatz in Sturmwarnsystemen; der
Rohdatenzugang ist an aktiven Stationsbetrieb gebunden. Das Projekt bezeichnet sich selbst als
*„not an official information service for lightning data"*.

**Für AT und CH gibt es keine offenen Bodennetz-Blitzdaten** (ALDIS kommerziell, MeteoSchweiz nicht
publiziert). Die Satellitenquelle schließt die Lücke fachlich nur teilweise — auch das gehört in
die Legende.

## 22. Schneefall (gemessen/analysiert)

**Geplanter Key: `snowfall` · Messung/Analyse**

Abgrenzung: `snow` = Modell-Schneemenge (ICON-D2), `snowline` = Grenzlinie (ML),
`snowfall` = **die gemessene bzw. amtlich analysierte Phase und Schneelage**.

| Land | Quelle | Was |
|---|---|---|
| **DE** | RADVOR RE — „Anteil des festen Niederschlags", Wertebereich 0–1000 | Phasenanteil im 5-min-Takt, 0…+120 min |
| **AT** | GeoSphere SNOWGRID-CL — `snow_depth` (m), `swe_tot` (kg/m²) | Schneedecke, **täglich**, ~1 Tag Verzug |
| **CH** | MeteoSchweiz SMN + SLF/IMIS | Stationswerte, keine Fläche |

**Der DE-Teil ist besonders wirtschaftlich:** RE liefert Phase **und** Hagelflag im selben Request.
Wer den Hagel-Layer (§19) baut, hat den Schneefall-Layer zu ~60 % erledigt.

**Kreuzprüfung als Qualitätsanforderung:** Der Phasenanteil aus RE und die ML-Schneefallgrenze
(`snowline`) müssen zueinander passen. Wenn sie sich widersprechen, ist das ein Befund — und
sichtbar zu machen, nicht zu glätten.

**Ehrlichkeitshinweis AT:** Ein Tag Verzug ist für einen Wetterlayer viel. Das Datenalter muss
prominent stehen.

## 23. Wetterwarnungen

**Key: `warnings` · amtlich · ✅ UMGESETZT (Phase W1, 2026-08-06)**

> **Abweichung von der Planung, belegt:** Umgesetzt ist **nicht** der WFS-Weg, sondern der
> **CAP-Vollstand** `alerts/cap/DISTRICT_DWD_STAT/…_DE.zip`. Grund: Er trägt für **95 von 95**
> Gebieten ein Polygon (die Gemeindeverbands-Variante nur für 67 von 2029), bringt die amtliche
> Warnfarbe je Meldung selbst mit und braucht dank stabilem `LATEST`-Alias kein
> Verzeichnis-Scrape. Die frühere Bewertung „CAP = nur `WARNCELLID`" galt nur für den feineren
> Schnitt — korrigiert in `docs/DATA_SOURCES.md` §9.1. Gemeindegenauigkeit über WFS bleibt als
> **V-158** offen. Diagnose: `audit/wetterwarnungen.md`.
>
> Umsetzung: `src/warnings/capAlerts.ts` (ZIP + CAP-Parser), `src/warnings/warnField.ts`
> (GeoJSON/Farben/Zeit/Texte), `src/sources/dwdCapAlerts.ts` (Transport).
> Verifier: `npm run verify:warnings` (101/101, netzfrei).

| Land | Quelle | Geometrie | Stufen |
|---|---|---|---|
| **DE** ✅ | **DWD CAP `DISTRICT_DWD_STAT` (umgesetzt)** · WFS `dwd:Warnungen_Gemeinden` bleibt Option für Gemeindegenauigkeit | **Landkreis-Polygone, 100 % Abdeckung** | Minor … Extreme (CAP), amtliche Farbe je Meldung |
| **AT** | GeoSphere `getWarnstatus` (+ `getWarningsForCoords` für Klartext) | Gemeinde-MultiPolygone, 375 m vereinfacht | 1 gelb, 2 orange, 3 rot |
| **CH** | — **keine offene amtliche Quelle** | — | — |

**Warntypen AT** (amtliche Legende aus der OpenAPI-Spezifikation):
`1 = Sturm · 2 = Regen · 3 = Schnee · 4 = Glatteis · 5 = Gewitter · 6 = Hitze · 7 = Kälte`.

**Farbgebung DE** — ⚠️ **hier stand eine Näherung.** `src/sources/dwdAlerts.ts:146` führt
Stufe 5 `#7e0028` · 4 `#cc0000` · 3 `#ff7f00` · 2 `#ffcc00` · 1 `#9ec5e5`. Die CAP-Meldungen
liefern die **amtliche** Farbe dagegen selbst mit (`AREA_COLOR`-eventCode); gemessen am
2026-08-06: `Minor` = `#ffeb3b`, `Moderate` = `#fb8c00`, Hitze = `#cc99ff` — also **nicht**
identisch mit den obigen Werten. Der Layer zeichnet deshalb immer die Farbe **aus der Meldung**;
die Tabelle oben greift nur als dokumentierter Rückfall. `Severe`/`Extreme` lagen am Messtag
nicht vor und sind daher **ungemessen** (→ V-156). `dwdAlerts.ts` bleibt unverändert
(Funktionserhalt, es speist den Punkt-Forecast).

**Vier Gestaltungsregeln, die aus Lizenz und Prinzip folgen:**
1. **Nie die eigene Schwere erfinden.** Der Layer zeigt die amtliche Stufe, nie eine abgeleitete.
   Der Feature-Katalog §3 formuliert es knapp: *„never invent your own severity."*
2. **Gültigkeit respektieren.** `ONSET`/`EXPIRES` steuern die Sichtbarkeit; eine abgelaufene Warnung
   verschwindet.
3. **Nicht durable cachen.** DWD verlangt, dass die Darstellung sicherstellt, dass Warnungen alle
   Nutzer „vollständig und unverzüglich" erreichen — sonst ist die Quellenangabe zu entfernen.
   MeteoSchweiz erlaubt Weitergabe nur „unverzüglich und inhaltlich unverändert".
4. **CH-Lücke benennen und verlinken.** `src/officialSources.ts` führt das Naturgefahrenportal
   bereits — der Layer sagt „für die Schweiz liegen keine offenen amtlichen Warndaten vor" und
   verlinkt dorthin. Das ist die Fortsetzung von V-17, nicht deren Rücknahme.

**AT-Besonderheit:** Die GeoSphere-Warnungen gelten für den **Dauersiedlungsraum**, hochalpine Lagen
sind ausgenommen. Dieser Hinweis steht bereits korrekt in `src/officialSources.ts` und muss in den
Layer wandern.

## 24. Unwetterwarnungen

**Geplanter Key: `severe` · amtlich**

Kein eigener Datenkanal, sondern **dieselbe Quelle mit Schweregrad-Filter**:
DE ab Stufe 4 (Unwetterwarnung), AT ab `wlevel` 2 (orange).

Warum trotzdem ein eigener Layer? Weil die Nutzungssituationen verschieden sind: „Was ist heute los?"
(alle Warnungen) gegenüber „Ist etwas Gefährliches unterwegs?" (nur Unwetter). Zwei Layer statt eines
Filters kosten technisch fast nichts (ein Deskriptor, dieselbe Quelle, ein anderer Filterwert) und
passen in das Preset-Konzept („Unwetterlage").

## 25. Weitere hochwertige DACH-Layer (Ausbaustufen)

| Layer | Quelle | Fachlicher Wert | Aufwand |
|---|---|---|---|
| **Lawinenlage** | SLF (CH, CAAMLv6 + GeoJSON **mit fertigen EAWS-Farben**), ALBINA/EAWS (AT/IT), EAWS-Regionen (CC0) | Alpine Kernzielgruppe; passt exakt zur Haltung „verlinken statt modellieren" (`src/avalanche.ts`) | **S** — bestes Aufwand/Nutzen-Verhältnis im ganzen Katalog |
| **Europa-Radar** | OPERA/EUMETNET CIRRUS/NIMBUS, 1 km / 5 min | Schließt die harte Kante an der deutschen Grenze — heute endet das Radar dort abrupt | **L** |
| **Satellit HD** | EUMETView `msg_rss` (**5 min**), `mtg_fd:rgb_geocolour` (10 min) | Ersetzt die 3-h-Kadenz durch echte Animation | **S** ⚠️ Lizenzstufe klären |
| **Waldbrandgefahr** | EFFIS/GWIS `ecmwf.fwi`, `viirs.hs` | Sommerthema, DACH-weit, key-frei | **S** |
| **Pollen / UV / Luftqualität** | CAMS `eccharts.ecmwf.int/wms/?token=public` — Erle, Birke, Gräser, Beifuß, Olive, Ambrosia + UV-Index | **Schließt V-26 und V-27 ohne API-Key** und damit ohne D-06-Konflikt | **S** |
| **Hagelklimatologie CH** | `wmts.geo.admin.ch` Wiederkehrperioden 10/20/50/100 Jahre | Kontext: „wie hagelgefährdet ist diese Region grundsätzlich" | **XS** |

---

## 26. Farbpaletten-Ordnung

Die bestehenden Paletten sind bewusst gegeneinander abgegrenzt — jede neue muss sich einfügen, ohne
eine bestehende Aussage zu verwässern.

| Bereich | Farbfamilie | Belegt durch |
|---|---|---|
| Niederschlagsintensität | hellblau → blau → grün → gelb → orange → rot → magenta | `nowcast`, `flownowcast` |
| Wahrscheinlichkeit | hellblau → blau → violett | `poprob` |
| Wind/Böen | grünlich → amber → terrakotta → magenta/violett | `wind`, `gust` |
| Temperatur | blau → grün → gelb → terrakotta → rot | `temp` |
| Wolken/Satellit | weiß/grau | `clouds`, `sat` |
| Gewitterpotenzial | gelb → amber → orange → rot → **magenta** | `thunder` |
| Blitzprognose | gelb → amber → rot-orange → magenta → **Elektrik-Violett** | `lightningfc` |
| Rotation | **desaturiertes** Lavendel → Pflaume → Indigo → Purpur | `rotation` |
| Schnee | hellblau → mittelblau | `snow` |

**Vorschläge für die neuen Layer** (Entscheidung offen):

| Neuer Layer | Palette | Begründung |
|---|---|---|
| Regenradar | **identisch zu `nowcast`** | derselbe Messwert, dieselbe Skala — alles andere verwirrt |
| Hagel | **eigene Familie: Cyan → Türkis → Weiß** | muss sich von Regen *und* von Gewitter absetzen; Hagel ist Eis |
| Schneefall (Phase) | Schneepalette + **Schraffur** für Mischphase | Phase ist kategorial, nicht kontinuierlich |
| Blitzaktivität | amber wie `lightning` | Kontinuität zum bestehenden Layer |
| Gewitterzellen | Umriss statt Fläche | Objekt, kein Feld — Farbe für die Intensität, Kontur für die Identität |
| Warnungen | **amtliche DWD-Skala, unverändert** | Wiedererkennung ist hier wichtiger als Designkonsistenz |
| Lawinen | **EAWS-Skala, unverändert** | dito — und die Farben liegen bereits im Payload |

**Farbenblindheit:** Der Feature-Katalog fordert mindestens eine farbenblindsichere Palette. Die
LUT-Architektur macht das nahezu gratis (`setColorRamp()` ohne Neuladen). Zusätzlich gilt:
Bedeutung nie **nur** über Farbe — Phase über Schraffur, Intensität zusätzlich als Zahl im Readout.

---

## 27. Länder-Abdeckungsmatrix

Der ehrliche Gesamtblick nach der Erweiterung. **Diese Tabelle ist die Vorlage für die
Abdeckungshinweise im UI.**

| Layer | DE | AT | CH |
|---|---|---|---|
| Wind, Böen, Temperatur, Wolken | ✅ | ✅ | ✅ |
| Niederschlag jetzt–2 h | ✅ RADOLAN-RV | ⚠️ INCA (Analyse) | ⚠️ nur „jetzt" |
| Regenradar (Rückblick) | ✅ 60 min Archiv-Seed | ⚠️ Analyse, **kein „jetzt"-Frame**, Rückblick nur aus der Sitzung | ⚠️ Messung, Rückblick nur aus der Sitzung (14-Tage-Archiv nicht angebunden) |
| Zuglinien / Bewegung | ✅ aus **gemessenen** Analysen (eigene Rechnung) | ⚠️ aus der **INCA-Analyse** abgeleitet, 15-min-Takt | ❌ **keine offene Quelle** — Layer endet an der Grenze |
| Zellbahnen (KONRAD3D) | ✅ inkl. amtlichem Unsicherheits-Trichter | ❌ | ❌ |
| Hagel | ✅ RE-Flag | ❌ **keine Quelle** | ✅ POH + MESHS |
| Gewitterzellen | ✅ | ❌ | ❌ |
| Blitzaktivität | ✅ Bodennetz + Satellit | ⚠️ nur Satellit | ⚠️ nur Satellit |
| Schneefall | ✅ Phase | ⚠️ täglich | ⚠️ Stationen |
| Wetterwarnungen | ✅ | ✅ (ohne Hochalpin) | ❌ **keine offene Quelle** |
| Unwetterwarnungen | ✅ | ✅ | ❌ |
| Lawinen | ⚠️ DE-BY über EAWS | ✅ ALBINA/EAWS | ✅ SLF |
| Satellit | ✅ | ✅ | ✅ |

**Legende:** ✅ vollwertig · ⚠️ eingeschränkt (Grund nennen!) · ❌ keine Quelle (amtliche Stelle
verlinken)

Die ⚠️- und ❌-Felder sind **keine Peinlichkeit, sondern das Produktversprechen**. Kein
Wettbewerber im DACH-Raum zeigt eine solche Matrix. Sie ist die konsequente Fortsetzung von D-04 und
von V-17, das die Warn-Lücke in AT/CH erstmals ausdrücklich benannt hat.
