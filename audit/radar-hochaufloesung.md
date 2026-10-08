# audit/radar-hochaufloesung.md — Phase HD: Hochauflösendes Niederschlagsradar

> Auftrag (Jan, 08.10.2026): „wie hochauflösend ist das Niederschlagsradar dargestellt … ich möchte, dass wir an einer
> möglichst genauen Ausarbeitung arbeiten, sodass es ein hochauflösender Niederschlagsradar wird … setze genau das so um,
> mache danach auch optische Verifikationen."
> Stand: **HD-0 Diagnose fertig (§1–§4), Plan §5, HD-1…HD-4 s. §6 ff.** Messwerkzeug und Belege in `audit/radar-hochaufloesung/`.

## §0 Kurzfassung

- **Die Daten sind fein, die Anzeige ist grob.** Alle drei Landesradare liegen im Daten-Repo (`radar/img/v1/`) auf ihrem
  nativen 1-km-Gitter (DE 1100 × 1200, AT 701 × 431, CH 710 × 640, am Gitter nachgerechnet 1,000 × 1,000 km). Die Karte
  (Wetterkarte „Niederschlag" und `/regenradar` über das Profil `radar`) rechnet sie vor dem Zeichnen auf EIN lat/lon-Gitter
  600 × 512 um (`precipIndexMap.G`): **2,22 km Nord–Süd × 1,26–1,50 km Ost–West**, je Zelle 2,8–3,3 km² statt 1 km².
- **Je Zelle wird EIN Radarpixel gelesen** (`buildIndexMap`, nächstes Pixel, kein Mittel). Gemessen am Slot 08.10. 15:05 UTC
  (`diag-grid.mjs`, nur die sichtbare DACH-Fläche): das Komposit liest **29,7 % (DE) · 30,3 % (AT) · 29,8 % (CH)** der
  Radarpixel; **70 % der Pixel erreichen nie den Bildschirm**. Die Gesamtmenge bleibt in etwa (Stichprobe ohne Vorzeichen:
  DE −10 %, AT ±0, CH ±0 der mm/h·km²), die Struktur nicht.
- **Starkregenkerne (≥ 5 mm/h, 8er-Zusammenhang auf dem nativen Gitter):** 177 Kerne im Slot. **39 sind im Komposit ganz
  weg** (DE 19/101, AT 5/34, CH 15/42 — bei 1-Pixel-Kernen 25 von 43, bei 2–4 Pixeln 13 von 46), **113 werden unter
  5 mm/h gezeigt** (die Farbe springt eine Stufe tiefer).
- **Der Shader glättet mit einem kubischen B-Spline** (`RainLayer.ts` `sampleBicubic`): er geht nicht durch die Messwerte,
  sondern mittelt sie — ein Einzelpixel behält in der Mitte **(4/6)² = 44 %** seines Werts, seine Nachbarn bekommen je 11 %.
  Am Slot zeigt die heutige Kette Kerne im Median mit **58 % (1 px) … 81 % (≥ 25 px)** ihrer gemessenen Spitze.
- **Oben ist bei 20 mm/h Schluss.** Die Spiegel-PNGs tragen `precipToU8`-Bytes (linear 0–20 mm/h in 255 Stufen); alles
  darüber hat denselben Wert 255. Im Slot stehen in DE 66, AT 321, CH 43 Pixel auf 255 = „≥ 20 mm/h", wie viel genau, weiß
  der Client nicht. Das steckt im **Daten-Repo**, nicht im Client.
- **Zeitlich:** zwischen zwei Radarzeiten mischt das Profil linear in 5-%-Schritten (`lerpValues`): eine ziehende Zelle
  erscheint als Doppelbild, nicht als Bewegung (bei INCA 15 min, bei RV 5 min).
- **Quellen (§4):** offen gibt es in DACH kein Komposit feiner als 1 km (DWD RV/RY/HG 1 km, GeoSphere INCA 1 km, MeteoSwiss
  RZC 1 km). Feiner sind nur die DWD-Polarvolumen je Standort (`weather/radar/sites/`, `px250`/`sweep_*`: 250 m radial) — ein
  anderes Produkt, nicht Teil dieser Phase.
- **Was zu tun ist (§5):** HD-1 jedes Land auf seinem eigenen 1-km-Gitter zeichnen (drei Texturen, drei Warp-Meshes — die gibt
  es schon — plus eine Länder-Maske je Gitter nach derselben Regel wie heute) · HD-2 ein Filter, der die Messwerte erhält
  (Catmull-Rom, auf den lokalen Wertebereich geklemmt; Bilinear/Nearest wählbar) · HD-3 Spiegel-Format `v2` mit
  logarithmischer zweiter Ebene bis 200 mm/h (v1-Byte bleibt byte-gleich daneben) und Farbskala darüber · HD-4 Zwischenbilder
  entlang des Bewegungsfelds statt linearer Mischung. Alles hinter Schaltern, Voreinstellung aus, ohne Schalter byte-gleich.

## §1 Messung (HD-0)

Werkzeug `audit/radar-hochaufloesung/diag-grid.mjs` (nur lesend; dieselben Decoder und derselbe `PrecipCompositor` wie der
Client, Sampling-Nachbildung = die exakte Algebra des Shaders). Slot: RV `2610081505` Lead 10 (gültig 15:15 UTC), INCA
`20261008T1445` Lead 30 (15:15), rzc `20261008T1510` — ein Tag mit Starkregen (alle drei Quellen erreichen 255).
Sichtbar = innerhalb DE ∪ AT ∪ CH (`public/countries/*.geojson`, die Länder-Maske der Karte, gerastert 0,005°); Land je
Pixel/Zelle = `pickCountry` an der Mitte (die Regel, die das Komposit je Zelle anwendet).

### §1.1 Gitter

| | Spalten × Zeilen | Zelle | Fläche je Zelle |
|---|---|---|---|
| Komposit `G` (Karte heute) | 600 × 512 | 0,0199° × 0,0198° = **2,22 km N–S × 1,50 (47 N) / 1,42 (50 N) / 1,26 (55 N) km O–W** | 3,33 / 3,14 / 2,80 km² |
| RADOLAN-RV DE1200 | 1100 × 1200 | 1,000 × 1,000 km (polar-stereografisch) | 1 km² |
| INCA AT | 701 × 431 | 1,000 × 1,000 km (Lambert) | 1 km² |
| rzc CH | 710 × 640 | 1,000 × 1,000 km (LV95) | 1 km² |

### §1.2 Was das Komposit liest

| Land | Radarpixel sichtbar | Komposit-Zellen | gelesene Pixel | Anteil |
|---|---|---|---|---|
| DE | 419 571 | 124 468 | 124 468 | **29,7 %** |
| AT | 83 868 | 25 375 | 25 375 | **30,3 %** |
| CH | 41 259 | 12 283 | 12 283 | **29,8 %** |

Nasse Pixel / Zellen und Menge (mm/h · km²; die Zellfläche des Komposits je Breite gerechnet):

| Land | Schwelle | nativ Pixel | nativ Menge | Komposit Zellen | Komposit Menge |
|---|---|---|---|---|---|
| DE | ≥ 0,06 mm/h | 169 619 | 129 857 | 49 480 | 117 119 (−10 %) |
| DE | ≥ 5 mm/h | 2 315 | 15 457 | 695 | 14 322 (−7 %) |
| DE | ≥ 10 mm/h | 66 | 812 | 23 | 862 |
| AT | ≥ 0,06 mm/h | 26 412 | 45 352 | 8 001 | 45 371 |
| AT | ≥ 5 mm/h | 1 826 | 14 287 | 560 | 14 285 |
| CH | ≥ 0,06 mm/h | 29 532 | 30 983 | 8 802 | 30 929 |
| CH | ≥ 5 mm/h | 563 | 3 919 | 157 | 3 720 (−5 %) |
| CH | ≥ 10 mm/h | 43 | 600 | 11 | 485 (−19 %) |

Die Menge stimmt im Großen (die Stichprobe ist unverzerrt), die Lage der Starkregenpixel nicht: wo ein Kern zwischen zwei
Abtastpunkte fällt, ist er weg; wo er einen trifft, wird er auf 3 km² aufgeblasen.

### §1.3 Kerne ≥ 5 mm/h (nativ, eigenes Land, 8er-Zusammenhang)

„verloren" = keine Komposit-Zelle des Kerns ≥ 5 mm/h; „heute < 5" = der Shader (B-Spline an den Texelmitten des
Komposits) zeigt den Kern unter 5 mm/h; Spitze = Median des Verhältnisses gezeigte / gemessene Spitze.

| Land | Größe (px) | Kerne | verloren | heute < 5 mm/h | Spitze heute | Spitze HD (Catmull / Bilinear) |
|---|---|---|---|---|---|---|
| DE | 1 | 30 | **13** | 30 | 0,58 | 1,00 / 1,00 |
| DE | 2–4 | 26 | **6** | 23 | 0,70 | 1,00 |
| DE | 5–9 | 19 | 0 | 10 | 0,73 | 1,00 |
| DE | 10–24 | 13 | 0 | 1 | 0,71 | 1,00 |
| DE | ≥ 25 | 13 | 0 | 0 | 0,81 | 1,00 |
| AT | 1 | 4 | **3** | 4 | 0 | 1,00 |
| AT | 2–4 | 8 | **2** | 8 | 0,89 | 1,00 |
| AT | 5–9 | 7 | 0 | 7 | 0,86 | 1,00 |
| AT | 10–24 | 8 | 0 | 3 | 0,83 | 1,00 |
| AT | ≥ 25 | 7 | 0 | 0 | 0,82 | 1,00 |
| CH | 1 | 9 | **9** | 9 | 0 | 1,00 |
| CH | 2–4 | 12 | **5** | 11 | 0,65 | 1,00 |
| CH | 5–9 | 10 | **1** | 6 | 0,64 | 1,00 |
| CH | 10–24 | 7 | 0 | 1 | 0,71 | 1,00 |
| CH | ≥ 25 | 4 | 0 | 0 | 0,84 | 1,00 |

Summe: 177 Kerne, **39 verloren, 113 unter 5 mm/h gezeigt**. Mit dem nativen Gitter und einem Filter durch die Messwerte
(Catmull-Rom geklemmt oder Bilinear, an den Texelmitten exakt) ist die Spitze jedes Kerns 1,00.

### §1.4 Der Filter

`RainLayer.ts` `sampleBicubic` ist ein kubischer **B-Spline** (Gewichte `cubicWeights`: an der Texelmitte 1/6 · 4/6 · 1/6).
B-Splines sind glättend, nicht interpolierend: Einzelpixel in der Mitte (4/6)² = **0,444**, Nachbar 0,111, Diagonale 0,028.
Catmull-Rom (Gewichte an der Mitte 0 · 1 · 0) ist interpolierend (1,000), schwingt aber über — geklemmt auf das Minimum und
Maximum der inneren 2 × 2 Texel bleibt es ohne Überschwingen, ohne negative Werte und ohne künstlichen Regen an Kanten.

### §1.5 Bilder

`audit/radar-hochaufloesung/diag-{DE,AT,CH}-{z10-100m,z8-400m}.png` — je vier Tafeln desselben Fensters (um den größten
Kern des Landes; 100 m/px ≈ z10, 400 m/px ≈ z8; Mercator, Palette und Deckkraft der Karte über dem Dim-Grau):
oben links **nativ nearest** (was das Radar misst) · oben rechts **Komposit nearest** (was die CPU hält) · unten links
**Komposit + B-Spline = heute** · unten rechts **nativ + Catmull-Rom geklemmt = HD-Vorschlag**. Bei 400 m/px sind schmale
Bänder und Zellränder im Komposit verschwunden oder zu 2-km-Blöcken geworden; bei 100 m/px zeigt die heutige Kette Flecken
ohne Binnenstruktur, HD die 1-km-Textur der Messung.

## §2 Ursache im Code

1. `src/scalar/precipIndexMap.ts:17` — `G = { … w: 600, h: 512 }`, ein Gitter für drei Projektionen; Zellgröße s. §1.1.
2. `src/scalar/precipIndexMap.ts:64–87` — `buildIndexMap`: je Komposit-Zelle **ein** Quellindex (`floor(u·cols)`), kein Mittel.
3. `src/scalar/precipComposite.ts:245–273` — `build()` gathert je Zelle den einen Wert; `MapView.tsx:3462–3522` zeichnet nur dieses
   Komposit (Wetterkarte und Profil `radar`), nie die nativen Frames — obwohl `de1200WarpMesh`/`incaWarpMesh`/`rzcWarpMesh`
   existieren und der KI-Nowcast (`MapView.tsx:3338`) den DE1200-Frame bereits 1:1 auf seinem Mesh zeichnet.
4. `src/scalar/RainLayer.ts:47–100` — B-Spline-Shader (§1.4), fest, ohne Option.
5. `src/scalar/RainLayer.ts:317–337` — `PRECIP_VMAX = 20`, `precipToU8` linear; `src/sources/radarImg.ts` nagelt `vMax` als
   Drift-Wächter fest — der Spiegel trägt dieselben Bytes (`radar-derive.mjs`).
6. `src/map/mapProfile.ts:131–136` — `lerpValues`: lineare Mischung zweier Frames (Profil-Morph).

## §3 Was NICHT das Problem ist

- Die Verortung: alle Meshes ≤ 1 m (Phase KL); die Punktabfrage liest dieselben Gitter wie HD zeichnen wird (RP1/RP2).
- Die Übertragung: 1 Byte je Pixel, PNG-Spiegel, Hedge über raw (NL-2) — das native Gitter ist schon im Browser.
- Die Zeitauflösung der Daten: RV 5 min, INCA 15 min, rzc 5 min.

## §4 Quellen — gibt es etwas Feineres?

| Anbieter | Produkt | Auflösung | Takt | Beleg |
|---|---|---|---|---|
| DWD | RV (Komposit, Analyse + 24 × 5 min) | 1 × 1 km, DE1200 1100 × 1200 | 5 min | RADOLAN/RADVOR-Kompositformat 2.6, Verzeichnis `weather/radar/composite/{rv,hg,pg,wn,…}` |
| DWD | Polarvolumen je Standort (`weather/radar/sites/{sweep_vol_z,sweep_pcp_z,px250,…}`) | 250 m radial × 1° (≈ 0,3–2 km tangential je Entfernung) | 5 min | Verzeichnis 08.10.2026 |
| GeoSphere | `nowcast-v1-15min-1km` (INCA RR) | 1 km | 15 min | `dataset.api.hub.geosphere.at/v1/datasets` — kein feineres Gitterprodukt gelistet |
| MeteoSwiss | PRECIP `RZC`, PRECIP-SV `TZC`, CombiPrecip `CPC` | 1 km (ODIM-Metadaten der Datei: 710 × 640 × 1000 m, LV95) | 5 min (CPC 60 min) | `opendatadocs.meteoswiss.ch/d-radar-data/d1-precipitation-radar-products` |

Ergebnis: **1 km ist die offene Obergrenze der Komposite** in allen drei Ländern. Feiner wären nur die DWD-Polarvolumen (eigenes
Produkt: Entfernung/Azimut je Standort, Strahlhöhe, Abschattung — eine eigene Phase, hier nicht). Alles, was HD über 1 km
hinaus zeigt, ist Interpolation und wird so benannt.

## §5 Plan

Alles additiv, hinter Schaltern, Voreinstellung aus; ohne Schalter byte-gleich (Rule 2). Reihenfolge nach Nutzen:

| AP | Inhalt | Schalter | Gate |
|---|---|---|---|
| HD-1 | **Eigene Ebene je Land auf dem nativen Gitter.** Drei `RainLayer` (DE/AT/CH) mit den bestehenden Warp-Meshes; je Gitter eine **Besitz-Maske** (1 = das Pixel gehört nach `pickCountry` an seiner Mitte diesem Land; im Worker gerechnet, einmal je Gitter) als zweite Textur (NEAREST, `discard`); Frame-Wahl mit derselben Regel wie `build()` (ausgelagert in `pickCompositeFrames`, von `build()` selbst benutzt). Komposit-Ebene bleibt und ist der Rückfall. | `?hd=1` / `localStorage.radarhd` (`?hd=0` aus) | G1 Maske = `pickCountry` Pixel für Pixel auf den echten Gittern · G2 Bildschirm: an N zufälligen Pixeln ist die gezeichnete Farbklasse die des Radarpixels (HD nearest), Negativkontrolle HEAD · G3 ohne Schalter pixelgleich zu HEAD (Pixel-Diff, Profil und Wetterkarte) · G4 Fusion/`build()` byte-gleich (`verify:regenradar-profile` C/D, `verify:precip-source`) |
| HD-2 | **Filter** als Option des `RainLayer`: `bspline` (heute, Voreinstellung aller anderen Nutzer) · `catmull` (geklemmt; Voreinstellung von HD) · `bilinear` · `nearest`. | `?hd=catmull|bilinear|nearest|bspline` | G5 Shader-Algebra = Node-Nachbildung an Texelmitten (Spitze 1,00), Synthetik-Kern · G6 mobil keine Long Task > 200 ms beim Frame-Wechsel (Lab) |
| HD-3 | **Spiegel-Format `v2`:** je Frame ein 2-Kanal-PNG — Kanal 1 = der heutige `precipToU8`-Byte (byte-gleich zu v1, alle Verbraucher unverändert), Kanal 2 = logarithmisch 0,06…200 mm/h in 254 Stufen (3,2 % je Stufe); Decoder liefern dafür den rohen mm/h-Wert (additiv). Producer nur mit `RADAR_IMG_V2=1` (sonst byte-gleich), Client liest v2 nur mit Schalter und fällt auf v1 zurück; Farbskala über 20 mm/h (Stufen 30/50/100, `set`). | Producer `RADAR_IMG_V2`, Client `?hdv2=1` | G7 Rundweg Producer → Decoder: Kanal 1 byte-gleich zu v1, Kanal 2 ≤ ½ Stufe · G8 Client-Weg mit lokal bedientem `v2` (CDP-Fetch-Umleitung) · Push = **Jans Gate** |
| HD-4 | **Zwischenbilder entlang der Zugbahn:** Bewegungsfeld je Quelle (Horn-Schunck auf dem vergröberten Frame im Worker, wie der Flow-Nowcast), Morph im Shader: Frame A rückwärts, Frame B vorwärts verschoben und gemischt. | `?hdmorph=1` | G9 Synthetik (wandernder Blob): Zwischenbild liegt auf der Bahn, Spitze erhalten · G10 Profil ohne Schalter byte-gleich |

Nicht in dieser Phase: Polarvolumen (§4), Änderungen an buscosun Fusion (liest v1 weiter), die alte Karte `?rr=legacy`
(E-RR-3: Dateien bleiben, kein HD dort).

## §6 Entscheidungen

- **E-HD-1 (Jan 08.10., „setze genau das so um"):** HD-1…HD-4 bauen, Schalter aus, optische Verifikation danach.
- **E-HD-2 (Jan 08.10. abends, „schalte alles aktiv, ich habe alles gepushed"):** HD ist die Voreinstellung
  (`RADAR_HD_DEFAULT_ON`, Filter Catmull-Rom); `?hd=0` / `localStorage.radarhd = '0'` = das Komposit-Bild von HEAD `96d9725`.
  Ohne Real-Device-Messung — Jans Entscheidung, Befund V-HD-9.
- **E-HD-3 (Jan 08.10., dieselbe Freigabe):** `RADAR_IMG_DUAL: '1'` im Spiegel-Workflow (`scripts/radar-mirror/workflow-radar.yml`
  = Vorlage, Kopie `.github/workflows/radar.yml` im Daten-Repo — mit Jans Push-Vollmacht vom 08.10. abends als Daten-Repo-Commit
  `01400047` auf `origin/main`). Der Client liest Dual-Frames voreingestellt (`RADAR_DUAL_DEFAULT_ON`, `?hdv2=0` = v1-Byte);
  ein Slot ohne `meta.dual` liest exakt wie vorher — wirksam ab dem ERSTEN Spiegel-Job nach dem Push (der laufende Job
  behält seine Umgebung, ≤ 5 h 45).
- **E-HD-4 (Jan 08.10., mit E-HD-2/3):** Farbstufen 30/50/100/200 mm/h (`precipRainRampLog`, `set`) bleiben wie gebaut.
- **E-HD-5 (Jan 08.10.):** Morph im Regenradar voreingestellt an (`RADAR_MORPH_DEFAULT_ON`, `?hdmorph=0` = lineare Mischung).

## §7 Umsetzung (08.10.2026, uncommitted)

Alle Teile additiv, hinter Schaltern; bis E-HD-2 Voreinstellung aus — ohne Schalter war das Produkt pixelgleich zu HEAD `e2d875c`
(§8 G3), seit E-HD-2 (08.10. abends, nach Jans Push `96d9725`) sind HD, Dual und Morph voreingestellt an und `?hd=0`
ist der benannte Rückfall (§8 G3′).
Flags in `src/scalar/radarHd.ts` (rein, headless geprüft): `?hd=0|1|catmull|bilinear|nearest|bspline` / `localStorage.radarhd`,
`?hdv2=0|1` / `radarhdv2`, `?hdmorph=0|1` / `radarhdmorph` (Query schlägt Speicher, D-31-Muster).

### §7.1 HD-1 — eigene Ebene je Land auf dem nativen Gitter
- `MapView.tsx`: mit `hd.on` drei weitere `RainLayer` (`RADAR_HD_LAYER_IDS` = `precip-rain-hd-{de,at,ch}`) direkt über der
  Komposit-Ebene, unter der Länder-Maske; die Komposit-Ebene wird mit dem Schalter unsichtbar, läuft aber weiter (benannter
  Rückfall, sie speist nichts anderes). Sichtbarkeitsregel = die der Komposit-Ebene (`precipFrameReady`, Radar-Quelle).
- Frame-Wahl: `pickCompositeFrames(h, sources, nowMs)` aus `build()` herausgelöst (`precipComposite.ts`); `build()` ruft sie
  selbst — Komposit byte-gleich (§8 C1/C2). Die HD-Ebenen bekommen dieselben Frames (Wetterkarte: Slider-Stunde; Profil:
  absolute Gültigkeitszeit mit Rückblick `rvPast`, Morph zwischen den Nachbar-Frames je Quelle).
- Besitz-Maske je Gitter: `radarCountryMask.ts` — Pixelmitten per bikubischer Verfeinerung aus einem exakten 64²-Gitter
  (wie die Warp-Meshes, Rest ≤ 14 mm), Land per `fastCountryPicker` (dieselben Kanten und Boxen wie `pickCountry`, Kanten nach
  Breitenband gebündelt). Im Worker (`precipIndexWorker` op `mask`, `countryMaskOffMain`): DE1200 171 ms, INCA 65 ms, rzc 78 ms;
  memoisiert je Gitter. Der `RainLayer` liest sie als zweite Textur (NEAREST, `discard`), Upload nur bei neuer Referenz.
- Meshes: `de1200WarpMesh()`, `incaWarpMesh(corners)`, `rzcWarpMesh(corners)` (Phase KL, ≤ 1 m) — unverändert.
- Status: „· 1-km-Gitter (HD)" im Modell-Text, wenn an.

### §7.2 HD-2 — Filter
`RainLayer` Option `filter` (`bspline` = Stand vor HD, Voreinstellung aller anderen Nutzer: Komposit, KI-Nowcast, PoP;
`catmull` = Voreinstellung von HD; `bilinear`; `nearest`), ein Uniform `u_filter`. Catmull-Rom: 16 Taps an Texelmitten,
geklemmt auf Min/Max der inneren 2 × 2 Texel (interpolierend, Spitze 1,00, kein Überschwingen, kein künstlicher Regen —
§8 D3/D4). Die B-Spline-Funktion ist unverändert (nur die Signatur trägt jetzt den Sampler).

### §7.3 HD-3 — Dual-Frames mit Log-Ebene (Daten-Repo)
- Vertrag `radarImg.ts`: je Frame zusätzlich `g<lead>.png` im SELBEN Slot (Farbtyp 4 = Grau + Alpha, 2 Byte je Pixel):
  Kanal 1 = der `precipToU8`-Byte des `f`-Bilds (byte-gleich), Kanal 2 = `precipToU8Log` (0,06 … 200 mm/h, 254 Stufen,
  3,2 % je Stufe, trocken ⇔ trocken wie v1); `meta.dual = { log: {min, max, steps}, frames }` als optionales Zusatzfeld
  (Prüfer lehnt falsche Konstanten/Dateinamen ab; fehlt es, bleibt alles wie v1 — die Regel von `hourMeans`). Aufbewahrung
  läuft mit dem Slot-Verzeichnis, kein Spiegel-Eingriff.
- Producer `radar-derive.mjs`: nur mit `RADAR_IMG_DUAL=1` (sonst byte-gleich, §8 F10); die Decoder (`decodeRvTar`,
  `decodeRvHdf5Tar`, `parseIncaNetcdf`, `parseRzcHdf5`) liefern mit `secondary` eine zweite Quantisierung `values2` derselben
  Raten (`values` unverändert, F13). Gemessen an der echten RV-Tar 08.10. 16:15 UTC: 53 Dateien, 9,4 MB je Slot statt 4,3 MB
  (die `g`-Bilder ≈ 5,1 MB); rzc eine Datei mehr.
- Client: `?hdv2=1` ⇒ die Bild-Leser (`radolan.ts`, `geosphereIncaGrid.ts`, `meteoSwissRadar.ts`) holen je Frame das
  `g`-Bild statt des `f`-Bilds (EIN Abruf, beide Ebenen), bei 404 je Frame das `f`-Bild; `decodeGrayAlphaPng` (`grayPng.ts`,
  ohne Canvas-Rückfall — der würde Kanal 2 als Alpha vormultiplizieren), im RADOLAN-Worker (`dual: true`). `values2` an
  `RvFrame`/`IncaFrame`/`RadarFrame`; ALLE anderen Verbraucher lesen weiter `values`. Die HD-Ebenen zeichnen `values2` mit
  `precipRainRampLog` (gleiche Farben an gleichen mm/h bis 20, darüber 30/50/100/200 — E-HD-4, `set`); die Rampe wird nur
  beim Wechsel der Kodierung getauscht. Der Profil-Morph mischt die Log-Ebene nur, wenn beide Seiten sie tragen.
- Im Daten-Repo liegt noch nichts: Push = Jans Gate (E-HD-3, `MANUELLE-SCHRITTE.md` §50). Bis dahin zeigt `?hdv2=1` v1.

### §7.4 HD-4 — Zwischenbilder entlang der Zugbahn (Regenradar-Profil)
- `RainLayer.setMorph({ b, flow, frac })`: Frame B als zweite Werte-Textur, Fluss als LUMINANCE_ALPHA-Textur auf grobem Gitter
  (u, v in nativen Texeln je Intervall, ±40 geklemmt, `encodeFlow`); der Shader liest A bei `uv − frac·d` und B bei
  `uv + (1 − frac)·d` (je mit dem gewählten Filter) und mischt; `setMorph(null)` = Frame A allein. Ein `frac`-Wechsel ist ein
  Uniform, B/Fluss laden nur bei neuer Referenz.
- Fluss: `radarMorphFlow.ts` — Horn–Schunck (`estimateFlowHS`, α 0,5, 100 Iterationen) auf dem vergröberten Frame
  (`coarsenFrameU8`, DE Faktor 8 → 138 × 150, AT/CH 4), zurück in native Texel; im Worker (`precipIndexWorker` op `flow`,
  `flowOffMain`), memoisiert je Frame-Paar. **Vorab gerechnet** (Effekt in `MapView`: alle Nachbar-Paare einer Quelle, vorwärts
  ab „jetzt", dann der Rückblick, ein Auftrag nach dem anderen) — bei 2,5 Frames/s käme ein erst beim Zeigen angefordertes Feld
  immer zu spät (gemessen: ohne Prefetch nie ein aktiver Morph, mit Prefetch 2/2 Stichproben `frac` 0,05 / 0,5).
- Rückfall: fehlt das Feld (noch), mischt die Quelle linear wie bisher (`lerpValues`).

### §7.5 Werkzeuge
`scripts/verify-radar-hd.mjs` (`npm run verify:radar-hd`, in CI) · `scripts/radar-hd-pixelcheck.mjs` (Browser-Orakel, s. §8) ·
`scripts/radar-hd-console-probe.mjs` (Konsole, Ebenen-Zustand, Kamera, Klick, Shot) · `audit/radar-hochaufloesung/diag-grid.mjs`
(Diagnose §1) · `regenradar-wk-pixeldiff.mjs` um die zwei Regenradar-Szenarien ergänzt.

## §8 Gates

| Gate | Beleg | Ergebnis |
|---|---|---|
| G1 Maske = `pickCountry` Pixel für Pixel | `verify:radar-hd` B2 (exakte Inverse je Pixelmitte auf den echten Gittern), B1 200 000 Zufallspunkte, B4 Negativkontrolle | **0 von 1 320 000 / 302 131 / 454 400 Pixeln anders**; Verfeinerung ≤ 14 mm |
| G2 Bildschirm = Radarpixel | `scripts/radar-hd-pixelcheck.mjs` z10 (Fenster um den größten Kern je Land; Canvas per `toDataURL` im `render`, Hintergrund je Pixel aus einem zweiten Shot ohne Niederschlag, Rampe genau wie der Shader liest — 16 × 16 LINEAR mittelt vier Texel —, Vergleich premultipliziert, Toleranz 8/255, Kamera gegen `map.unproject` 0,00 px, Frames und Shot auf denselben Slot-Stempeln) | **HD nearest 99,92–99,94 %, HD Catmull 99,99–100 %** der Pixel (mittl. \|Δ\| 0,3); HEAD gegen sein Komposit-Orakel 99,75–99,99 %; **Negativkontrolle** (HEAD gegen das native Orakel) 31–73 %. z8: HD 92–99,7 % = HEAD-Niveau (Texel ≈ 2,5 px, Randpixel), Kontrolle 66–76 %. `audit/radar-hochaufloesung/pixelcheck/` |
| G3 ohne Schalter pixelgleich zu HEAD | `regenradar-wk-pixeldiff.mjs` (Produktionsbuilds HEAD `e2d875c` ↔ Arbeitsbaum mit dem ENDSTAND, derselbe Slot) | Niederschlag Desktop + Mobil, Regenradar Mobil, Warnungen **0 px**; Regenradar Desktop 114 px (0,009 %, Uhrzeit), Übersicht Desktop 73 px (Uhr); Übersicht Mobil in 2 von 4 Läufen 0 px, sonst 42 % — die Länder-Maske (`/countries/*.geojson`) war in EINEM der beiden Builds nach 14 s noch nicht gezeichnet (HEAD-Shot ohne Maske), beide Richtungen beobachtet ⇒ Ladezeit-Flake des Labs, kein HD-Pfad (V-HD-8); `audit/radar-hochaufloesung/pixeldiff/` |
| G3′ Rückfall nach E-HD-2 (08.10. abends) | `regenradar-wk-pixeldiff.mjs --curQuery=hd=0&hdmorph=0&hdv2=0` HEAD `96d9725` (Schalter aus) gegen Arbeitsbaum (Voreinstellung an) mit dem Rückfall; Negativkontrolle ohne `--curQuery`; neue Szenarien `rr-ort-*` (`/regenradar/muenchen`, die Landeseite `/regenradar` trägt keine Karte) | **Rückfall:** Wetterkarte Desktop 8 px / Mobil 158 px, Regenradar Ort Desktop 32 px / Mobil 1 372 px (0,05 %) — jede Abweichung ist Uhrzeit, Live-Punkt oder der pulsierende Marker, kein Radarpixel (`pixeldiff-fallback/*.diff.png`); **Negativkontrolle:** Wetterkarte 15 950 px (1,23 %), Regenradar Ort 32 420 px (2,5 %), ausschließlich Regenränder + Statuszeile „1-km-Gitter (HD)" (`pixeldiff-default/`). Voreinstellung im Browser ohne Query: drei HD-Ebenen sichtbar (`tex=1100x1200/701x431/710x640`, Maske da, Filter catmull), Komposit-Ebene versteckt, Konsole sauber; Regenradar beim Abspielen Morph aktiv 2/2 Stichproben (`.cache/hd-default-{wk,rr}.png`) |
| G4 `build()`/Fusion byte-gleich | `verify:radar-hd` C1 (292 Slider-Stunden × Quellensätze), C2; `verify:precip-source` 30/30, `verify:layer-geometry` 76/76, `verify:radar-sampling` 25/25, `verify:fusion-release` 28/28, `verify:regenradar-profile` 33/36 (E8 = gewollte Shader-Änderung, E7 = Phase NS, C1b fällt an HEAD ebenso — Live-Frames) | grün |
| G5 Shader-Algebra | `verify:radar-hd` D1–D4 (B-Spline (1,4,1,0)/6, Einzeltexel 4/9 gegen 1, Catmull interpolierend 256/256, Klemmung 0 Ausreißer bei 3 390 rohen Überschwingern) | grün |
| G7 Dual-Rundlauf | `verify:radar-hd` F1–F13 mit `RADAR_HD_RAW` (echte rzc-Datei und RV-Tar 08.10. 16:15): ohne Schalter byte-gleich, 25/25 `g`-Frames, Kanal 1 = `f` byte-gleich, Kanal 2 = `precipToU8Log` der Raten; Codec ≤ ½ Stufe, trocken ⇔ trocken | grün |
| G8 Client liest Dual | `radar-hd-pixelcheck.mjs --dualDir` (der lokal erzeugte Slot wird der Seite per CDP untergeschoben, Stempel umgeschrieben): Log-Ebene in der Seite = true | **nearest 99,97 %, Catmull 99,99 %** gegen das Log-Orakel; Negativkontrolle (lineares Orakel) 76,8 %, nass 21 % |
| G9 Morph | `verify:radar-hd` G1–G8 (Synthetik: Blob (+4, +1): Fluss (3,9, 1,0), Zwischenbild bei ½ EIN Blob auf der Bahn, Spitze 0,97 gegen 0,87 der linearen Mischung; frac 0/1 = A/B exakt; Vergröberung Faktor 8 zurück in native Texel); Browser `/regenradar/muenchen?hd=catmull&hdmorph=1` beim Abspielen: aktiver Morph in 2/2 Stichproben (`bilder/rr-morph-on.png`, Vergleich `rr-morph-off.png`) | grün |
| Verifier gesamt | `verify:radar-hd` **58/58** (+ F10–F13 mit `RADAR_HD_RAW`), `verify:radar-repack` 54/55 (B2c = Laufzeit unter Last, B1h = Live-Slot — an HEAD 55/55 im Leerlauf), typecheck 0, Build 255/255, `npm run budget` grün nach Anhebung (totalJs 1 632,4 / **1 633**; HD ≈ +13,9 KB gzip, alles lazy; eagerJs 109,3 unverändert) | grün |
| Bilder für das Auge | `audit/radar-hochaufloesung/bilder/` (DACH z6, Steiermark z8/z10, je ohne/mit HD; Regenradar Morph an/aus), `diag-*.png` (§1.5), `pixelcheck/*.png` (Canvas-Shots HD nearest/Catmull/HEAD) | — |

Selbstverifikation: (1) Funktionserhalt — Komposit-Ebene, Live-Pfad, `?rr=legacy`, KI-Nowcast/PoP (B-Spline) unverändert;
(2) Desktop pixelgleich ohne Schalter (G3); (3) keine neuen Bedienelemente; (4) Konsole sauber (Sonde, 10–11 Zeilen, keine
Ausnahme); (5) Long Tasks: headless nicht messbar — Real-Device offen (§9).

## §9 Befunde und Entscheidungen

- **V-HD-1** Headless-Chromium: `map.getStyle().layers` listet Custom-Layer nicht (nur `getLayer`); blockierte Tile-Requests
  (auch nur der Style-JSON) lassen die Karte ohne `load` und ohne Layer — Basemap-Layer per `setLayoutProperty` verstecken.
- **V-HD-2** Die Rampen-Abtastung des RainLayer (`rp = (fract(16t), floor(16t)/16)` auf der 16 × 16-LINEAR-Textur) liest
  zwischen vier Texeln: die Farbe eines Werts ist das Mittel aus Zeile r−1/r und Spalte c−1/c. Nicht sichtbar, aber ein
  Orakel muss es nachbilden (sonst 15 % statt 99,9 %). Korrektur = eigener Schritt (betrifft alle RainLayer-Nutzer).
- **V-HD-3** Ein beim Zeigen angefordertes Bewegungsfeld kommt beim Abspielen nie an (2,5 Frames/s) ⇒ Prefetch aller Paare.
- **V-HD-4** DACH-Maske bei Campione/Lugano: weiße Dreiecke und ein schwarzes Stück (`pixelcheck/CH-z10-*.png`) — Artefakt
  der Even-Odd-Füllung der Enklave, unabhängig von HD (HEAD gleich).
- **V-HD-5** `verify:radar-repack` B1h/B2c sind live- bzw. lastabhängig (B1h: Live-Slot HDF5 ↔ RADOLAN, heute 5 Stufen in
  3,8 %; B2c: Laufzeit unter Fremdlast).
- **V-HD-6** Legende/Status nennen die Starkregen-Stufen über 20 mm/h noch nicht (Dual erst nach E-HD-3).
- **V-HD-7** Phasenwache E8 (`verify:regenradar-profile`) ist mit HD-2 dauerhaft rot bis zum Commit (gewollt).
- **V-HD-8** Das Browser-Lab ist zeitabhängig: die Quellen wechseln alle 5 min (seit dem Stempel-Vergleich erkannt),
  die Länder-Maske lädt im Headless-Build mal vor, mal nach dem 14-s-Shot (Übersicht Mobil 0 px ↔ 42 %), und in 2 von 9
  Zeilen des letzten z10-Laufs trug der Hintergrund-Shot noch Regen (gezählte Menge 57 k / 22 k statt ≥ 330 k Pixel ⇒
  0 %) — dieselben Varianten standen in den anderen Läufen des Tages bei 99,9 %. Endstand z10 (letzter Lauf, 7 gültige
  Zeilen): HD nearest 99,92–99,93 %, HD Catmull 99,996 %, HEAD 99,987–99,993 %, Negativkontrolle 40–60 %. Ein
  Wiederholungslauf im Leerlauf gehört zur Abnahme.
- **V-HD-9** Die Voreinstellung ist seit E-HD-2 an, ohne Real-Device-Messung (Jans Entscheidung): auf dem Telefon kostet
  jeder Frame-Wechsel den Upload von bis zu 1100 × 1200 Bytes + Maske statt 600 × 512, der Catmull-Rom-Filter 16 Taps je
  Fragment; im Lab (SwiftShader) ohne Long Task > 200 ms. Erste Messung auf einem echten Gerät gehört zur Abnahme;
  Rückweg für Nutzer `?hd=0`, für alle `RADAR_HD_DEFAULT_ON = false`.
- Entscheidungen: E-HD-2…5 entschieden (§6, 08.10. abends); offen nur Real-Device (V-HD-9) und der Push des Daten-Repo-Workflows
  (`MANUELLE-SCHRITTE.md` §50).
