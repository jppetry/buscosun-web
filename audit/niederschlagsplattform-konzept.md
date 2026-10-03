# Regenradar 2.0 — Konzept Niederschlagsplattform (Kurzfassung im Repo)

> Stand: 2026-10-03 (§2/§8/§9 nach der NP-0-Planung nachgezogen). Vollständiges Konzept als Claude-Doc: <https://claude.ai/code/artifact/7f93924e-2bfd-446b-a2f6-0601f456da2c>
> (dort mit Recherche, Diagrammen und Jans Entscheidungsspalte). UI-Mockup (Design-Canvas, Desktop interaktiv + Mobil +
> Zeichensprache): <https://claude.ai/artifact/3AR1HAJw7iJk8KGhUGnZgz>, Repo-Kopie `reference/regenradar2-*.dc.html`.
> Jans Entscheidung 03.10.: Die Plattform ist der **Nachfolger von `/regenradar`**; das heutige Regenradar bleibt per
> Flag als Rückfall. Teil 1 (gleiche Karte, Daten aus buscosun-data) = Phase RR, `audit/regenradar-datenangleich.md`.
> **Keine Umsetzung aus diesem Dokument ohne Jans Freigabe der Phase** (Diagnose-First, ein Thema je Phase).

## 1. Kernsatz

Regenradar 2.0 beantwortet: **Was fällt hier, wann, als was — und wie sicher ist das?** Gemessen (Rückblick, jetzt),
Nowcast (bis 2–3 h) und Vorhersage (bis 14 Tage) liegen auf **einer** Zeitachse, sehen aber verschieden aus.
Der Ort bekommt **buscosun Fusion 8**, die Karte das Radar und den Punkt-Cube.

## 2. Datenbasis — was trägt was

| Baustein | Raum / Zeit | Niederschlag | Ort im Daten-Repo |
|---|---|---|---|
| buscosun Fusion 8 | ein Ort, 0–336 h stündlich (nativ 1/3/6 h, dazwischen markiert interpoliert) | Hürden-Verteilung (Regenwahrscheinlichkeit + Menge), p10/p50/p90, Schneefallgrenze, Schneeanteil 0…1 (Feuchtkugel), Konfidenz, Member | Rechnung im Browser aus `point/` |
| Punkt-Cube t1/t2/t3 | 0,05° bis 48 h · 0,10° bis 120 h · 0,25° bis 336 h | `precip` Mittel/σ/q10/q90/Member-Mittel, `snowlmt` mit Quantilen, T925/T850/T700 | `point/` |
| Radar-Spiegel | DE RV 1 km 5 min 0–120 min · AT INCA 15 min bis 180 min · CH rzc jetzt | gemessen + Nowcast, Stundenmittel `m<lead>.png` | `radar/img/v1/` |
| KONRAD3D | DE-Verbund, 5 min, +60 min | Umriss, Echobasis/-top, Volumen, VIL, Blitzrate, Hagel/Starkregen/Böen-Flags, Ellipsen | `radar/img/v1/konrad3d/` |
| ICON-D2-Repack | 2,2 km, bis 48 h | Schneedecke, Neuschnee, CAPE, LPI, Temperatur | Repack-Familien |
| Blitze | DE `dwd:Blitzdichte` WMS-T · DACH MTG-LI `li_afa` WMS-T | gemessene Aktivität mit Zeitachse | **fehlt** (heute live `Accumulated_Flash_Area` ohne Zeitachse) → NP-0a |
| HymecNG | DE 1 km 5 min | gemessene Niederschlagsart | **nicht genutzt** — Kodierung offen (F-13) |

**Grenzen, die die Oberfläche sagt:** Fusion 8 schlägt Fusion 7 nur in den Radarstunden (Brier +9,8/+11,8 %*, DE-Treffer
0,33 → 0,52); bei 7–48 h ist Niederschlag laut Lernphase ohne Skill gegen den Cube ⇒ jenseits 6 h **Wahrscheinlichkeit und
Spanne**, keine scheinbar exakte Menge. Radar v1 sättigt bei ≥ 19,96 mm/h, Byte 0 = trocken oder keine Abdeckung.
Ein Kartenfeld aus dem Cube ist die vorgerechnete Hälfte (PAP 2) ohne Stationsanker, Lernstufe und Gelände am Punkt — es
trägt das Etikett „Modell · Cube", nie „Fusion 8".

## 3. Leitprinzipien

1. Herkunft sichtbar (Art + Alter je Fläche und Zahl). 2. **Kein Modell im Radarkleid** — Jans Entscheidung 24.07. gilt
weiter; hinter dem Nowcast-Horizont wechselt die Karte sichtbar in den Prognose-Stil (Punktdichte = Chance, Konturen =
Median-Menge). 3. Unsicherheit als Form (Beginn mit Spanne, Trichter, p10–p90, Schneegrenze-Gürtel). 4. Schnee als eigene
Dimension (Phase, Grenze, Neuschnee, Decke). 5. Zellen mit Lebenslauf. 6. Eine Karte, eine Logik (`MapView`).
7. DACH-Lücken als Lücken zeigen.

## 4. Layout (Command-Deck, D-27)

Desktop 1440: Rail 62 · Topbar 60 (Ortssuche, Datenstand je Quelle, Ansicht Karte | Karte + 3D | 3D, Teilen) · Dock 250
(Ebenen Niederschlag, Zellbahnen, Blitze, Schnee, Schneefallgrenze; Zusatz Hagel, Blitzprognose; Darstellung Intensität |
Chance | Summe; Phase einfärben; Datenlage DE/AT/CH; in „Karte + 3D" auf 64 px) · Bühne (MapView; geteilt 50 : 50 mit der
3D-Bühne) · Readout 380 (Regenfahrplan Fusion 8 mit Reitern 2 h | 48 h | 14 Tage, Zell-Steckbrief, Schnee am Ort,
Herkunft am Ort) · Zeitachse als Glas-Panel unten (Übersichtsband 14 Tage + Detailachse).
Mobil 390 (nur per Media Query): Karte vollflächig, Suchpille + Ebenen + Teilen (44 px), kompakte Zeitachse über dem
Sheet, Bottom-Sheet mit Reitern Jetzt · Fahrplan · 3D · Ebenen · Quellen.

## 5. Zeitachse

Standard Detailachse −2 h … +2 h in 5-min-Schritten; Zoomstufen 4 h · 12 h · 48 h · 14 T; Übersichtsband 14 Tage
(je Stunde Fusion-8-Chance, Farbe = Phase am Ort) mit Ausschnittsrahmen. Zonen: gemessen (gefüllt), Nowcast
(schraffiert; Grenze je Land DE 2 h, AT 3 h, CH jetzt), Modell (gepunktet). Ereignisse: Zelle am Ort (Fenster aus den
amtlichen Ellipsen), Blitz-Ticks ≤ 10 km, Phasenwechsel am Ort (Schneeanteil kreuzt 0,5), Warnbeginn. Zell-Fokus: Achse
zeigt den Lebenslauf (erste Detektion bis +60 min) mit Sparklines Echotop/VIL/Blitzrate. Technisch: Zeit als absolute
Gültigkeitszeit `timeMs` (Phase RR, Schritt RR-b).

## 6. Visualisierungen

| Größe | Karte | Ort | Quelle | neu? |
|---|---|---|---|---|
| Niederschlag gemessen/Nowcast | Rampe wie heute + **Phasen-Tönung** (Regen Bestandsrampe, Schneeregen `--np-mix` mit Schraffur, Schnee `--np-snow-*`), Hagelkern als Umriss | Minutenstreifen, Beginn **als Spanne** | Radar-Spiegel; Phase aus T + DEM (Wetterkarten-Logik), später HymecNG | Tönung neu |
| Niederschlag Prognose | **Punktraster** (Dichte = Chance), Konturen 0,5/2/5 mm/h, Schalter „ungünstig (q90)" | 48-h-Säulen Median + p90 blass, Chance als Linie | Cube (Karte), Fusion 8 (Ort) | neu |
| Summe | Rückblick 1/3/6 h aus RV-Analysen + Prognose-Summe Cube, Naht sichtbar | gemessen + erwartet mit Spanne | Spiegel, Cube, Fusion 8 | Naht neu |
| Schneefallgrenze | Linie (Wetterkarten-Logik) in m ü. NN + **Gürtel** q10–q90 | Grenze gegen Ortshöhe, „Schnee bis zu dir ab …" | ICON-D2-T + DEM + ML #2, Cube `snowlmt`, Fusion 8 | Gürtel neu |
| Schnee | Decke / Neuschnee wie heute | Neuschnee als Spanne (Menge × Schneeanteil × Schnee-Wasser-Verhältnis, Literaturwert gekennzeichnet) | Repack, Fusion 8 | Ort neu |
| Zellbahnen | amtlicher Trichter + **Lebenslauf-Spur** + Trend-Chip (Echotop/VIL zweier Läufe) | Ankunftsfenster, Steckbrief | KONRAD3D | Spur/Trend neu |
| Blitze | zeitgebundene Frames DE Blitzdichte + DACH MTG-LI (Parallaxe-Hinweis), Farbe nach Alter; Prognose LPI nur als Umriss | Blitze ≤ 10 km, letzte Aktivität | Blitz-Spiegel (NP-0), KONRAD3D, Repack LPI | Zeitachse neu |
| Hagel | MESHS/POH + KONRAD-Hagel als Zusatzebene | Zell-Hinweis, AT ohne Quelle benannt | MeteoSchweiz, KONRAD3D | vorhanden |

Regeln: Phase als Farbton, nie als Symbol über dem Radar; Modellflächen nie gefüllt im Radarstil; Paletten farbsicher;
Warnsprache nur im Warn-Layer (wörtlich); Zellen tragen „Hinweis".

## 7. 3D-Bühne (neben der Karte, folgt Zeit und Ausschnitt)

**Relief** (ohne neuen Shader): MapLibre `setTerrain` + `hillshade` (Terrarium wie Tourenplanung/Event), Zelltürme als
`fill-extrusion` (KONRAD-Umriss, Echobasis bis Echotop, Farbe nach dBZ max, Hagelvolumen als dunkler Kern), Zugbahn +
Trichter als Linie/Polygone, Niederschlag und Schneekappe (Gelände über p50 weiß, Band schraffiert) als gedrapte Bilder.
Regenstriche/Flocken = eigener Custom-Layer ⇒ STOPP & FRAGEN. Radarvolumen (DWD `sweep_vol_z`) = später, eigener Antrag.
**Höhen-Zeit-Schnitt** am Ort (SVG): x = 48 h / 14 T, y = 0–4 000 m; Geländespanne 10 km, Ortshöhe, Schneefallgrenze
p10–p90 + Median (Fusion 8), Nullgradgrenze (T925/T850/T700 des Cubes), Niederschlagssäulen nach Phase, Schnittpunkt mit
der Ortshöhe als Satz. Echohöhen über NN, über Grund umgerechnet (benannt); Türme nur im DE-Verbund.

## 8. Datenprodukte (je mit Vertrag nach Muster `radarImg.ts`, Verifier, Jans Gate)

NP-0a und NP-0b sind als Phasen ausgeplant: `audit/np0-datenprodukte.md` (Diagnose D-NP0-1…14, Entscheidungen E-NP0-1…6,
Kickoff `prompt-np0.md`). Die Pfade unten sind dort **Empfehlungen** bis zu Jans Entscheidung.

| Produkt | Pfad | Inhalt |
|---|---|---|
| Rückblick 2 h (NP-0a) | `radar/img/v1/rv-past/<slot>/f000.png` (E-NP0-1), rzc und `konrad3d/<slot>/cells.json` | 24 Slots nur für die gemessenen Analysen und Zellen; volle RV-Slots und Tars bleiben 12 (der Rückblick braucht sie nicht). AT ohne Rückblick (INCA-Nowcast hat keine Analyse) |
| Blitz-Spiegel (NP-0a) | `radar/img/v1/lightning-de/<slot>/` + `lightning-mtg/<slot>/` (E-NP0-2) | WMS-T auf festem EPSG:3857-Raster, 5 min, 24 Slots, im selben Spiegel-Push; **Werte** statt Farben, wenn exakt möglich (E-NP0-3); Meta mit Fenster (Blitzdichte 15 min, überlappend), Einheit, Lizenz, Parallaxe |
| Cube-Felder (NP-0b) | `point/field/v1/<lauf>/<stufe>/precip-<lead>.png`, `snowlmt-<lead>.png` + eigener Index | Chance P(nass), Menge \| nass, q90 unbedingt (log-kodiert); Grenze Mitte/unten/oben + Herkunft der Spanne. Die **Chance-Definition** entscheidet Jan auf Messbasis (E-NP0-4): Hürde der Fusion-Kette mit dem Cube als einziger Quelle, Spread-Verteilung oder nur Menge. Etikett „Modell · Cube“ |
| Radar v2 | `radar/img/v2/rv/<slot>/…` | log-Kodierung bis ≥ 100 mm/h + Abdeckungsmaske; v1 byte-gleich |
| HymecNG | `radar/img/v1/hymec/<slot>/class.png` | erst nach F-13 |

Bewusst nicht jetzt: ein „Fusion-Feld" (Fusion 8 je Zelle im Producer, mit Stationen, Radar und Gelände) — erst nach einem
Backtest, der zeigt, dass es den Cube in der Fläche schlägt.

**Richtigstellungen 03.10. (aus der NP-0-Planung, `audit/np0-datenprodukte.md` §1.2):** (1) Die 150-MB-Paketgrenze von
jsDelivr bindet dieses Repo offenbar nicht (`point/` allein ≥ 276 MB und wird ausgeliefert) — Tars bleiben trotzdem 12,
aber weil der Rückblick sie nicht braucht. (2) „P(nass) = dieselbe zensierte Verteilung wie der Motor, `fusion/dist.ts`"
war zu kurz: der Motor baut die Regen-Hürde in einer Kette (K-2 in `fuse.ts`, gelernte Hürde, `precipCal`), `dist.ts`
liefert nur die Quantile daraus ⇒ E-NP0-4.

## 9. Phasen

RR (Teil 1, Karte + Daten) → NP-1 Zeitachse 2.0 → NP-2 Regenfahrplan + Prognose-Stil → NP-3 Schnee-Paket (Winterfälle ab
November) → NP-4 3D-Relief → NP-5 Messphase (Radar v2, HymecNG, Nowcast-Trefferbilanz). Daten: NP-0a (Rückblick, Blitz-
Spiegel) vor NP-1, NP-0b (Cube-Felder) vor NP-2 — Plan `audit/np0-datenprodukte.md`; NP-5a vor NP-5. Alles hinter `?np=1`, heutiges Regenradar unter `?np=0`.

## 10. Offene Entscheidungen (Jan)

E-NP-1 Karte = `MapView` eingebettet · E-NP-2 Modellfläche jenseits des Radar-Horizonts im Prognose-Stil (Entscheidung
24.07. gilt für die Wetterkarte weiter) · E-NP-3 eine Zeitachse bis 14 Tage · E-NP-4 Blitz-Spiegel · E-NP-5 Rückblick
2 h · E-NP-6 3D: Höhen-Zeit-Schnitt zuerst · E-NP-7 Basiskarte positron + Satellit/Topo-Option · E-NP-8 Hagel und
Blitzprognose als Zusatz · E-NP-9 Radar v2 log-8-bit + Maske · E-NP-10 Name „Regenradar" bleibt.
Empfehlungen und Alternativen im Claude-Doc; dort setzt Jan die Spalte „Jans Entscheidung".

## 11. Backlog

Trockenfenster-Finder · Nowcast-Trefferbilanz der letzten Stunde · Seltenheit des Regens (Radar-Summe gegen
KOSTRA-DWD-2020; Lizenz und AT/CH-Gegenstück prüfen) · Tab-Wächter (Notification-API, nur offener Tab) · Regen entlang
der Route · Schneefall-Intensität cm/h · „Was war angesagt?" (Archiv) · Teilen mit Zeit und Zelle · Fahrplan vorlesbar ·
Himmelsblick (AR, mobil).
