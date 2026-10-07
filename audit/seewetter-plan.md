# Seewetter – Implementierungsplan (Phase SW)

> Stand 07.10.2026, Export des Plan-Dokuments (claude.ai Doc „Seewetter – Implementierungsplan“, https://claude.ai/artifact/UpwTiqUiFySdALFGpfwJy3).
> Eingangsdokument für Claude Code. Die Phasen-Diagnose und das Protokoll entstehen in `audit/seewetter.md`.
> Konzept: `audit/seewetter-konzept.md`. Datenlage: `audit/seewetter-datenpruefung.md`, Fixtures in `audit/seewetter/fixtures/`. UI-Vorgabe: `reference/seewetter-desktop.dc.html`, `reference/seewetter-mobile.dc.html`, `reference/README-seewetter.md`.
> Bei Widerspruch zwischen Konzept und Plan gilt der Plan. Entscheidungen E-SW-1 bis E-SW-9 sind Vorschläge; im Auto-Modus entscheidet Claude Code sie nach `prompt-seewetter.md` selbst und dokumentiert sie zur Prüfung.

## Ziel und Umfang

Phase **SW** baut die Kachel und Seite „Seewetter“ (`/seewetter`) auf Basis von DWD `weather/maritime`. Die Daten kommen ausschließlich vorverarbeitet aus `buscosun-data`; ein gemeinsamer Vertrag mit Prüfern sperrt Unplausibles im Producer und im Client. Konzept: [Seewetter – Feature-Konzept](https://claude.ai/artifact/1FNWajcRyXEpRQxov7D32a), UI-Vorgabe: [Seewetter – UI-Mockup](https://claude.ai/artifact/D1nvnMEM4AgET93ocaG3b1).

**Im Umfang**

- Kachel 12 auf der Startseite, Eintrag 13 in der ⌘K-Palette.
- Route `/seewetter` mit SEO-Shell, Lazy-Chunk `src/sea/` im Command-Deck.
- Feld- und Spot-Linie zweimal täglich nach `buscosun-data/sea/`: CWAM-Felder, Spot-Reihen 0–78 h (GWAM-Ausblick bis 174 h erst in SW-8) mit Wind und Böen aus buscosun Fusion.
- Text-Linie im Radar-Spiegel: Seewetterbericht, Küstenbericht, Warnstatus, Mittelfrist – wörtlich plus Gliederung.
- Prüfer auf Wert-, Feld-, Lauf- und Ausgabe-Ebene mit Veröffentlichungs-Sperre; Client-Prüfer; Wächter-Regeln.
- Profile mit offenen Grenzen, Fenster, Stundenband, Spot-Kompass, Verlauf (nivo).
- Stufe 2 (eigenes Gate): Urlaubsreviere mit EWAM und Seewetterbericht Mittelmeer.

**Nicht im Umfang:** Routing, Navigation, Seekarten, eigene Warnungen oder Entwarnungen, Push, Konten, 3D-Seegang, Wasserstand-Vorhersage (BSH, Lizenz offen). DACH-Seen und PEGELONLINE-Wasserstand sind Ausbau (SW-8) mit eigener Entscheidung.

**Arbeitsweise wie im Repo:** Diagnose in `audit/seewetter.md` → Plan → Umsetzung per Claude Code → Verifier → Gate. Neue Pfade hinter `?sea=1`, voreingestellt aus. Kein Secret, kein Backend. STOPP & FRAGEN vor Daten-Repo, Crons, Edge Functions, Shadern und Abhängigkeiten, wie im Startprompt beschrieben.

## Ausgangslage im Code

Fast jedes Bauteil hat im Repo schon ein Vorbild, meist aus Phase AW (Autobahnwetter). Seewetter übernimmt diese Muster, statt neue zu erfinden. Stand: `buscosun-web` am 07.10.2026, gelesen, nicht verändert.

| Stelle | Heute | Für Seewetter |
| --- | --- | --- |
| `src/App.tsx` | `FeatureId` enthält `'road'` | `'sea'` ergänzen |
| `src/router/routes.ts` | Route `autobahnwetter` mit Aliasen, `featureId: 'road'`, `subParam: 'road'`, `noindex` bis Gate C, Selbsttests `[AW]` | Route `seewetter`, Aliase `/kuestenwetter`, `/segelwetter`, `/wellen`; Pfadsegment = Spot (`/seewetter/sylt-west`) über neuen `subParam: 'spot'`; Selbsttests `[SW]` |
| `src/router/router.tsx` | Lazy-Seite `pages/RoadRoute` | `pages/SeaRoute` |
| `src/SearchPage.tsx` | `TOOL_TILE_COUNT = 11`, Palette-Eintrag 12 Autobahnwetter | Kachel 12 Seewetter (volle Breite), Palette 13, Zählung hinter `seaFlagFrom()` |
| `src/road/roadFlag.ts` | `ROAD_LIVE` seit 03.10. an; `?road=0/1` schlägt `localStorage` | `src/sea/seaFlag.ts` mit `SEA_LIVE = false` bis Gate C, `?sea=1` |
| `src/road/*` | `RoadPage`, `RoadMap`, `RoadDock`, `RoadBand`, `RoadReadout`, `roadContract`, `roadClient`, `roadState`, `roadSeo`, `roadDeck.css` | gleiche Aufteilung unter `src/sea/` |
| `src/sources/gribDecode.ts` | handgeschriebener GRIB2-Decoder | in Node über `scripts/lib/register-ts.mjs` wiederverwenden; Spike prüft Bitmap (Sektion 6) und Abtastung N→S |
| `scripts/lib/bz2.mjs`, `png.mjs` | bz2 entpacken, PNG schreiben | Feldlinie: GRIB entpacken, RGBA-Kacheln schreiben, ohne neue Abhängigkeit |
| `src/sources/radarImg.ts` | PNG-Frames als Vertrag | Muster für `f/<step>.png` (R = Hs, G = Richtung, B = Periode, A = Maske) |
| `scripts/road/road-mirror.mjs`, `scripts/radar-mirror/` | Spiegel-Produkte mit `seed`/`poll`/`copyInto` | Textlinie (FQDL50, FQDL51, WODL45, FXDL40, später FQDL60) als eigenes Spiegel-Produkt |
| `scripts/road/road-forecast.mjs`, `workflow-road-fc.yml` | Fusion-Vorhersage an Achspunkten; Workflow-Vorlage für das Datenrepo | Fusion-Wind an Spots; Vorlage `scripts/sea/workflow-sea.yml` |
| `scripts/verify-road-*.mjs`, `road-ui-diff.mjs` | Prüfer `contract`, `decode`, `derive`, `ui` und Pixelvergleich | `verify-sea-*.mjs`, `sea-ui-diff.mjs` |
| `scripts/health-manifests.mjs` | manuell (seit `health.yml` entfiel) | Eintrag für `sea/v1/status.json` |
| `src/wind/` | Windpartikel | Wind-Ebene der Seekarte, nur Fusion-Wind |
| `src/sources/dwdCapAlerts.ts` | CAP-Warnungen Land | Küsten- und Seewarnungen erst nach geklärter Quelle (offen) |
| `@nivo/line` 0.99 | im Bundle | Verlaufsdiagramme Wind/Böe und Seegang |
| `reference/autobahnwetter-*.dc.html` + README | Soll-Bild für Pixelvergleich | `reference/seewetter-*.dc.html` + README (liegen bei) |

## Arbeitspakete im Überblick

```
Daten (Stufe 1)
  SW-0 Spike ──▶ (A) ──▶ SW-1 Vertrag ──┬──▶ SW-2 Feldlinie ──┬──▶ (B) 7 Tage Schattenbetrieb
  messen,        Bericht,  Regeln,       │    CWAM → PNG,      │
  Fixtures       E-SW-1…9  Prüfer        └──▶ SW-3 Textlinie ──┘
                                              Bulletins, Status
Seite (Stufe 1)
  (B) ──▶ SW-4 Einstieg ──▶ SW-5 Seite ──▶ SW-6 Profile ──▶ (C) Seite live ──▶ (D) 14 Tage Wind am Spot
          Kachel, Route     Karte, Band,   Klassen,
                            Texte          Fenster
Stufe 2 und Ausbau
  (D) ──▶ (E) ──▶ SW-7 Reviere (EWAM, FQDL60) ──▶ SW-8 Ausbau (Seen, Pegel, GWAM)

(A)–(E) = Gates, jede Freigabe durch Jan
```

Jede Raute ist eine Freigabe durch Jan. Erst wird gemessen, dann laufen Feld- und Textlinie sieben Tage ohne Seite; die Seite folgt danach. Urlaubsreviere und Ausbau kommen erst, wenn Seite und Wind am Spot bestätigt sind.

## SW-0 Spike: erst messen, dann bauen

Diagnose-First wie bei AW-0. Kein Produktcode, nur Messskripte unter `scripts/sea/spike/` und der Phasenbericht `audit/seewetter.md`. Zeitrahmen: zwei Arbeitstage plus sieben Tage Textsammlung im Hintergrund.

1. **Dekodieren in Node.** Ein CWAM-Lauf, alle 13 Parameter, Schritte 000, 024 und 078, mit `gribDecode.ts` über `register-ts.mjs`. Soll: 124.011 Seepunkte, 7.487 Punkte mit Modellwind exakt 2,00 m/s im untersuchten Lauf, Werte an den elf Mockup-Spots wie in `audit/seewetter-datenpruefung.md`. Kann der Decoder die Bitmap nicht, ist das der erste Befund.
2. **Ankunftszeiten.** Drei Tage, beide Läufe, aus `content.log.bz2` statt aus dem Verzeichnis-Listing (das hing bei GWAM tagelang nach). Bestätigt oder verschiebt die Abrufzeiten 03:50/04:20 und 15:50/16:20 UTC.
3. **Budget.** Einen Lauf vollständig zu `f/<step>.png` und `c/<step>.png` umsetzen und messen. Ziel ≤ 25 MB je Lauf; Browser-Messung lag bei 152 KB je CWAM-Schritt.
4. **Textformate.** Sieben Tage FQDL50, FQDL51, WODL45 und FXDL40 sammeln, möglichst mit einem Tag aktiver Starkwind- oder Sturmwarnung. Daraus die Fixtures für SW-1.
5. **Offene Quellenfragen.** CAP-Warnungen für Küste und Seen (Profil auf dwd.de war aus der Cloud nicht lesbar), Geometrie der Seegebiete, Abdeckung des Fusion-Würfels über Wasser in Küstennähe, ob CWAM Wasserstand oder Strömung liefert.

**Ausgang:** Gate A. Jan liest den Bericht und entscheidet E-SW-1 bis E-SW-9. Erst danach wird Code für SW-1 geschrieben.

## SW-1 Vertrag und Prüfer

`src/sea/seaContract.ts` ist die eine Quelle der Wahrheit für Erzeuger, Client und Prüfer, wie `roadContract.ts`. Er enthält Typen, Pfade, Kodierung der PNG-Kanäle, erwartete Laufzeiten und die Regeln unten. Die Regeln laufen im Erzeuger; der Client prüft nur Alter und Vollständigkeit.

| Ebene | Regel | Folge |
| --- | --- | --- |
| Wert | Hs außerhalb 0 bis 20 m, Periode außerhalb 0 bis 30 s, Richtung außerhalb 0 bis 360° | Wert `null`, gezählt; mehr als 0,1 % eines Feldes → Lauf in Quarantäne |
| Wert | `tm10` exakt 1,0 s bei Hs < 0,05 m | `null` (Platzhalter des Modells) |
| Wert | `ppww` > 12 s bei `shww` < 0,3 m | `null` (Artefakt in flachen Zellen) |
| Wert | Modellwind `sp_10m`, `dd_10m` aus WAM | nie veröffentlicht (harter Boden bei 2,00 m/s); Wind kommt aus Fusion |
| Feld | Hash der Landmaske weicht von `static/mask-<modell>.hash` ab | Lauf in Quarantäne |
| Feld | Zahl der Seepunkte weicht vom Vertrag ab (CWAM 124.011, EWAM 138.388, GWAM aus SW-0) | Lauf in Quarantäne |
| Lauf | CWAM und EWAM nicht vollständig 13 × 79 Dateien, GWAM nicht 13 × 59 | Lauf nicht freigeben, letzter guter bleibt |
| Lauf | Median \|ΔHs\| CWAM gegen EWAM auf gemeinsamen Seepunkten > 0,3 m | Beobachtung im Log, kein Stopp |
| Text | Kopf nicht `FQDL50`, `FQDL51`, `WODL45`, `FXDL40` oder `FQDL60` mit `DWHA` | verwerfen |
| Text | unvollständig (FQDL50, FQDL51, FQDL60 ohne `=` am Ende; WODL45, FXDL40 ohne Schlusszeile `Seewetterdienst Hamburg`) oder Ausgabezeit fehlt | verwerfen |
| Text | WODL45: „keine Warnung“ nur bei exakt bekanntem Satz | sonst Status `unbekannt`, Text wird wörtlich gezeigt |
| Client | Lauf älter als 18 h | Hinweis „veraltet“ |
| Client | Lauf älter als 30 h oder Kill-Schalter | „Keine Daten“, keine Flächen |
| Client | Seewetterbericht älter als 6 h, Warnstatus älter als 4 h | „veraltet“ bzw. Status `unbekannt` |

Prüfer in dieser Stufe: `verify:sea-contract` (Regeln gegen Fixtures), `verify:sea-decode` (GRIB-Ausschnitte gegen bekannte Werte), `verify:sea-text` (Bulletins vom 07.10. und aus SW-0).

## SW-2 Feldlinie und SW-3 Textlinie

Zwei getrennte Linien, weil sie verschieden ticken: Wellenfelder kommen zweimal am Tag als große Pakete, Texte achtmal am Tag als wenige Kilobyte. Beide schreiben unter `sea/v1/` im Datenrepo und werden über jsDelivr gelesen. **STOPP & FRAGEN:** neuer Workflow und neue Cron-Zeiten im Datenrepo brauchen Jans Freigabe; im Web-Repo liegt nur die Vorlage.

### SW-2 Feldlinie

- **Ablauf:** Kindprozess `scripts/sea/sea-derive.mjs`, wie `road-derive.mjs`. Wo er läuft, entscheidet E-SW-4 nach SW-0: als Produkt im Radar-Spiegel (heilende Veröffentlichung, kein Cron-Verzug) oder als eigener Workflow nach Vorlage `scripts/sea/workflow-sea.yml` um 03:50, 04:20, 15:50 und 16:20 UTC. Ist der erwartete Lauf schon veröffentlicht, endet der Schritt nach Sekunden.
- **Schritte:** erwarteten Lauf aus `content.log.bz2` bestätigen → Vollständigkeit 13 × 79 → laden (CWAM rund 95 MB bz2) → dekodieren und Regeln aus SW-1 anwenden → PNG und Spot-Reihen schreiben → `run.json` zuletzt, `status.json` danach.
- **Flächen:** `f/<step>.png` stündlich bis +48 h, danach dreistündlich bis +78 h (59 Schritte). R = Hs in 5 cm, G = Richtung (kommt aus) in 256 Stufen, B = mittlere Periode in 0,1 s, A = 255 Wasser, 0 Land. `c/<step>.png` dreistündlich, doppelte Breite: links Windsee, rechts Dünung, Kanäle wie `f`.
- **Spots:** `spots/<run>.json` mit stündlichen Reihen je Spot (Hs, Richtung, Periode, Windsee, Dünung) und Fusion-Wind mit Böe am Spot. Modellwahl je Spot: CWAM, wo der Spot im CWAM-Wasser liegt, sonst EWAM; ab +79 h GWAM (Ausblick, später).
- **Budget:** Ziel ≤ 25 MB je Lauf für Stufe 1. Rechnung aus der Browser-Messung: 59 × 152 KB für `f` plus 27 × rund 300 KB für `c` ergibt rund 17 MB. SW-0 misst nach. EWAM folgt in Stufe 2 nur als Ausschnitte der Urlaubsreviere.
- **Aufbewahrung und Heilung:** nur der aktuelle und der vorige Lauf. Karten- und Punktlinie force-pushen eine frische Historie; deshalb kopiert jede Veröffentlichung den ganzen `sea/`-Bestand ein, und ein verschluckter Lauf wird nachgezogen, wie bei `road/`. Die jsDelivr-Grenzen (20 MB je Datei, 150 MB je Paket) misst SW-0 gegen den heutigen Bestand des Datenrepos.

**Dateilayout (versioniert, ein Formatwechsel heißt `v2`)**

```
sea/v1/status.json                          Linien, letzter Lauf je Modell, letzte Ausgabe je Text, Prüfer-Bilanz, Sperre, Kill-Switch
sea/v1/run/<modell>/<lauf>/run.json         Lauf, Schritte, Gitter, Masken-Hash, Prüfer-Bilanz (zuletzt geschrieben)
sea/v1/run/<modell>/<lauf>/f/<sss>.png      Seegang gesamt: R = Hs (5 cm), G = Richtung (256 Stufen), B = Tm (0,1 s), A = Wasser
sea/v1/run/<modell>/<lauf>/c/<sss>.png      Komponenten dreistündlich, doppelte Breite: links Windsee, rechts Dünung
sea/v1/spots/<lauf>.json                    Reihen je Spot: Welle aus CWAM/EWAM, Wind und Böe aus buscosun Fusion, Herkunft je Wert
sea/v1/text/<produkt>/<ausgabe>.json        Bulletin: raw (wörtlich), issued, header, Gliederung
sea/v1/quarantine/<lauf|ausgabe>.json       Verworfenes mit Regel und Rohwert, nur Diagnose
sea/v1/static/spots.json                    Spotkatalog (eigene Liste, E-SW-5): Typ, Ufernormale, Seegebiet, Küstenabschnitt, Station, Gitterpunkt
sea/v1/static/mask-<modell>.hash            Hash der Landmaske je Modell
```

Lauf- und Ausgabedateien sind inhaltlich unveränderlich und vertragen `@main` am CDN; der Client rechnet den erwarteten Lauf bzw. die erwartete Ausgabe aus der Uhr und tritt bei 404 einen Schritt zurück. `status.json` dient Wächter und Diagnose.

### SW-3 Textlinie

- Eigenes Produkt im vorhandenen Spiegel (`seed`, `poll`, `copyInto` wie in `road-mirror.mjs`). Abfrage der `_LATEST`-Datei je Produkt alle 15 Minuten mit `If-Modified-Since`.
- Ablage `text/<produkt>/<ausgabe>.json` mit `raw` (wörtlich), `issued`, `header` und einer Gliederung nach Seegebiet und Tag. Gezeigt wird immer der wörtliche Text; die Gliederung dient nur dem Zuordnen zur Karte.
- Der Client rechnet die erwartete Ausgabe aus der Uhr (FQDL50/51 um :15 nach 00, 03, 05, 08, 11, 14, 17, 20 UTC; WODL45 dreistündlich um :45) und geht bei 404 eine Ausgabe zurück. Keine Zeiger-Datei, die im CDN hängen bleiben könnte.
- ISO-8859-1 bei FXDL40 und `<br>` bzw. `NIL` bei FQDL60 werden im Erzeuger normalisiert; Fernschreib-Zeilenumbrüche werden aufgelöst, sonst nichts.

## SW-4 Einstieg, SW-5 Seite, SW-6 Profile

### SW-4 Einstieg und Routing

| Was | Umsetzung |
| --- | --- |
| Kachel | Nr. 12 „Seewetter“, volle Breite hinter Autobahnwetter, Frage „Wie wird es auf dem Wasser?“ |
| Palette | Eintrag 13, Stichworte Seewetter, Küste, Segeln, Kiten, Wellen |
| Rail | Wellen-Symbol, Icon-Farbe `--sw-rail-icon` |
| Route | `/seewetter`, Aliase `/kuestenwetter`, `/segelwetter`, `/wellen`; `/seewetter/<spot>` |
| Sichtbarkeit | `seaFlag.ts`, `SEA_LIVE = false`, `?sea=1` bis Gate C; `noindex` und keine Sitemap bis Gate C |
| Teilen | Spot, Profil, Zeit und Ebene in der URL; OG-Karte über den vorhandenen Share-Pfad |

### SW-5 Seitenmodule

| Modul | Aufgabe |
| --- | --- |
| `seaContract.ts` | Typen, Pfade, Kodierung, Regeln (SW-1) |
| `seaClient.ts` | erwarteten Lauf und Ausgabe aus der Uhr, Schritt zurück bei 404, PNG in Zahlenfelder wandeln |
| `seaProfiles.ts` | sieben Profile, `classify`, `windows`, Uferwinkel |
| `seaState.ts` | URL-Zustand: Spot, Profil, Zeit, Einheit, Ebene, Revier |
| `SeaPage.tsx` | Rahmen Dock │ Karte │ Readout, Stundenband unter der Karte; Breakpoints 767 und 1439 |
| `SeaMap.tsx` | MapLibre; Hs-Fläche auf der CPU eingefärbt (630 × 387 Pixel) als Bildquelle, Richtungspfeile, Spots; kein neuer Shader |
| `SeaDock.tsx` | Suche, Revier, Profil, Spotliste, Ebenen, Schalter, Datenlage |
| `SeaBand.tsx` | Stundenband als Tabelle: Zeilen Wind, Böe, Richtung, Seegang, Periode, Urteil; Spalte fixiert |
| `SeaReadout.tsx` | Reiter Spot, Seegebiet, Quellen; Kompass, zwei `@nivo/line`-Diagramme, Karte „Amtlich“ wörtlich |
| `seaDeck.css` | Layout und Token `--sw-*`; Akzent Petrol `#0F6E7A` in `designTokens.css` |

### SW-6 Profile, Fenster, Stundenband

| Profil | Wind kn | Böe bis | Welle | weitere Regel |
| --- | --- | --- | --- | --- |
| Kite | 15–28 | 33 | – | Böenspanne ≤ 10 kn, nicht ablandig, nur hell |
| Wing/Surf | 12–25 | 30 | – | nicht ablandig, nur hell |
| SUP/Kajak | ≤ 10 | 14 | Hs ≤ 0,5 m | nie ablandig, nur hell |
| Jolle | 5–16 | 20 | Hs ≤ 0,8 m | nur hell |
| Yacht | 8–22 | 27 | Hs ≤ 2,0 m | Windsee-Periode ≥ 3,5 s bei Hs > 1 m |
| Motorboot | ≤ 18 | 24 | Windsee ≤ 1,0 m | – |
| Angeln | ≤ 16 | 22 | Hs ≤ 1,2 m | – |

- **Klassen:** passt, knapp (innerhalb 10 % einer Grenze), außerhalb, keine Daten. Jede Klasse nennt ihren Grund („Böen über 33 kn“).
- **Uferwinkel:** Abweichung zwischen Windrichtung und Ufernormale: bis 30° auflandig, bis 75° schräg auflandig, bis 105° sideshore, bis 150° schräg ablandig, darüber ablandig. Schräg ablandig zählt bei „nicht ablandig“ als außerhalb.
- **Fenster:** mindestens zwei zusammenhängende Stunden „passt“ oder „knapp“.
- **Grenzen** sind Startwerte, im Dock sichtbar und je Nutzer änderbar (lokal gespeichert). Kein Profil sagt „sicher“; der Hinweis zur eigenen Verantwortung steht im Readout.

## SW-7 Urlaubsreviere und SW-8 Ausbau

### SW-7 Urlaubsreviere (Stufe 2)

- **Quelle:** EWAM, 30–66° N, 10,5° W bis 42° E, mit Mittelmeer, Schwarzem Meer und IJsselmeer. Erst nach Gate C und D.
- **Ausschnitte statt ganzes Feld:** Adria, Balearen, Côte d’Azur und Ligurien, Ägäis, Dänemark und Südschweden (Liste aus dem Konzept). Je Ausschnitt eigenes Budget, gemessen wie in SW-0.
- **Text:** FQDL60 (Mittelmeer, einmal täglich gegen 12:16 UTC) wörtlich im Reiter Seegebiet.
- **Ehrlichkeit:** EWAM ist grob (rund 7 × 5,5 km). In Buchten und im Watt steht „grobes Modell“ am Wert; wo CWAM Wasser hat, gewinnt immer CWAM.

### SW-8 Ausbau (nach Bedarf)

- **DACH-Seen:** Wind und Böen aus Fusion, ohne Wellen (kein Wellenmodell für Bodensee, Chiemsee, Genfersee und andere). Sturmwarnleuchten sind keine offene Quelle.
- **Gemessener Wasserstand:** PEGELONLINE (DL-DE Zero 2.0) als Karte „Gemessen“ an der Küste. Wasserstandsvorhersage des BSH erst nach geprüfter Lizenz.
- **Punkt überall:** Reihe an jedem Klickpunkt direkt aus den PNG-Feldern im Client.
- **Ausblick:** GWAM bis +174 h als Tageswhisker (Spanne je Tag), deutlich als Ausblick markiert.

## Verifikation und Gates

| Prüfer | prüft | ab |
| --- | --- | --- |
| `verify:sea-contract` | Regeln und Pfade gegen Fixtures, Quarantäne-Fälle | SW-1 |
| `verify:sea-decode` | GRIB-Ausschnitte gegen bekannte Werte: Seepunkte, Modellwind-Boden, elf Spots | SW-1 |
| `verify:sea-text` | Kopf, Ausgabezeit, Gliederung; `raw` bleibt Zeichen für Zeichen erhalten | SW-1 |
| `verify:sea-derive` | PNG hin und zurück höchstens eine halbe Stufe Fehler; Spot-Reihe = Feldwert; Klassen und Fenster auf Fixture-Reihen | SW-2, SW-6 |
| `verify:sea-ui` | Zustände Spot, Profil, Zeit, Einheit; „veraltet“, „Keine Daten“, Flag aus | SW-5 |
| `sea-ui-diff.mjs` | Pixelvergleich gegen `reference/seewetter-*.dc.html` bei 1440 und iPhone 12 Pro | Gate C |

| Gate | Bedingung | entscheidet |
| --- | --- | --- |
| A Spike | Bericht SW-0 liegt vor, E-SW-1 bis E-SW-9 entschieden | Jan |
| B Schattenbetrieb | Feld- und Textlinie laufen 7 Tage ohne Seite: mindestens 95 % der Läufe vor Laufzeit +5 h veröffentlicht, jede Quarantäne begründet, Budget eingehalten, keine Textausgabe verloren | Jan |
| C Seite live | Prüfer grün, Pixelvergleich bestanden, die fünf Selbstverifikations-Fragen aus CLAUDE.md und die fünf Seewetter-Prüffragen beantwortet, dann `SEA_LIVE` | Jan |
| D Wind am Spot | Fusion-Wind gegen POI-Messung (sicher liefernd: Arkona 10091) über mindestens 14 Tage; Abweichung dokumentiert | Jan |
| E Stufe 2 | Urlaubsreviere erst nach C und D | Jan |

**Fünf Seewetter-Prüffragen vor Gate C** (zusätzlich zu den fünf Selbstverifikations-Fragen aus CLAUDE.md)

1. Zeigt die Seite irgendwo Modellwind aus WAM? Soll: nein.
2. Steht jeder amtliche Text wörtlich, mit Ausgabezeit und Quelle?
3. Kann ein Spot „passt“ zeigen, während eine Warnung für sein Gebiet gilt, ohne dass die Warnung darüber steht? Soll: nein.
4. Was sieht man, wenn der letzte Lauf 31 h alt ist? Soll: „Keine Daten“, keine Fläche.
5. Ist an jeder Zahl erkennbar, ob sie aus Modell, Fusion, Messung oder einem Text stammt?

## Entscheidungen und Risiken

| Nr. | Frage | Vorschlag |
| --- | --- | --- |
| E-SW-1 | Name und Route | „Seewetter“, `/seewetter`, Aliase `/kuestenwetter`, `/segelwetter`, `/wellen` |
| E-SW-2 | Schnitt Stufe 1 | deutsche Küste: CWAM, Texte, Warnstatus, POI, Fusion-Wind |
| E-SW-3 | Ablage | eigene Linie `sea/` in buscosun-data; eigenes Repo nur, wenn das Budget dort nicht passt |
| E-SW-4 | Workflow | Felder als Produkt im Radar-Spiegel, wenn SW-0 Laufzeit und Speicher als unkritisch misst, sonst eigener Workflow; Texte immer im Spiegel |
| E-SW-5 | Spotkatalog | eigene Liste; OSM nur mit ODbL-Freigabe |
| E-SW-6 | DACH-Seen | später, ohne Wellen |
| E-SW-7 | PEGELONLINE | Ausbau SW-8 |
| E-SW-8 | Kachel | Nr. 12, volle Breite |
| E-SW-9 | Standardeinheit | Knoten, umschaltbar auf Bft und km/h |

| Risiko | Wirkung | Gegenmittel |
| --- | --- | --- |
| sea/ belegt rund 35 MB (zwei Läufe) im Datenrepo | jsDelivr-Grenze 150 MB je Paket, größere Force-Pushes | in SW-0 gegen den heutigen Bestand messen; passt es nicht, eigenes Repo (E-SW-3) |
| Fusion-Würfel deckt Wasser nicht ab | kein Wind am Spot | in SW-0 prüfen; Spot an den nächsten Küstenpunkt binden und als Küstenwert kennzeichnen, oder Entscheidung durch Jan |
| Nutzer verlässt sich auf „passt“ | Sicherheitsrisiko | Warnungen immer oben, kein „sicher“, Hinweis zur Eigenverantwortung, Gründe an jeder Klasse |
| Format bei aktiver Warnung unbekannt | Warnstatus falsch | Status `unbekannt` und Text wörtlich, bis Fixtures mit Warnung vorliegen |
| Seegebietsgrenzen fehlen | keine Flächen für Texte | Liste statt Karte, Geometriequelle offen |
| DWD-Lieferung verspätet oder Format ändert sich | Lücken | Regeln, Quarantäne, letzter guter Lauf, Alter sichtbar |
| EWAM überschätzt im Watt | falsche Welle | CWAM hat Vorrang, Hinweis „grobes Modell“ |

## Unterlagen im Repo und Startprompt

Im Web-Repo `C:\dev\buscosun-web` liegen nach diesem Schritt nur Unterlagen, kein Code. Nichts ist committed; das entscheidet Jan.

| Datei | Inhalt |
| --- | --- |
| `audit/seewetter-konzept.md` | Export des Konzepts mit Liste der Abweichungen zum Plan |
| `audit/seewetter-plan.md` | dieser Plan als Markdown für Claude Code |
| `audit/seewetter-datenpruefung.md` | Befunde der Quellenanalyse mit Zahlen und Fallen |
| `audit/seewetter/fixtures/` | Bulletins FQDL50, FQDL51, WODL45, FXDL40, FQDL60 vom 06./07.10. byte-genau mit Prüfsummen |
| `reference/seewetter-desktop.dc.html`, `seewetter-mobile.dc.html` | Soll-Bild für den Pixelvergleich |
| `reference/README-seewetter.md`, `reference/seewetter/` | Lesehilfe und Kartenbilder der Referenz |
| `prompt-seewetter.md` | Startprompt auf Englisch: Claude Code arbeitet Stufe 1 (SW-0 bis SW-6) im Auto-Modus ab, darf buscosun-data und buscosun-archiv selbst pushen, nutzt nivo für Diagramme und Tabellen; SEA_LIVE bleibt aus |

Gate A entscheidet Claude Code im Auto-Modus selbst nach den Empfehlungen und dokumentiert jede Entscheidung zur Prüfung durch Jan. Commits und Pushes im Web-Repo bleiben Jans Gate; die Workflows im Datenrepo starten deshalb erst, wenn der Producer-Code auf main liegt.
