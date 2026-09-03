# SAT0 — Satellitenbilder „vorher / nachher" je Brand: Diagnose (kein Code)

Stand: 2026-09-01 · Anlass: Jans Auftrag 2026-08-31 — „ich würde gerne im Brandradar Satellitenbilder
vor und nach den Bränden zur Begutachtung bereitstellen. Kannst du bitte die Möglichkeit recherchieren."

Diese Phase ist reine Recherche + Messung an den Endpunkten. **Es wurde kein Code geändert.**
Alle Zahlen unten sind gemessen (curl mit `Origin: https://buscosun.com`, echte Kachel-/Bildabrufe),
nicht aus Dokumentation abgeschrieben.

## 1. Randbedingungen aus dem Repo

Jede Lösung muss durch diese vier Nadelöhre:

1. **Kein Backend, kein Schlüssel im Client.** Die App ist rein clientseitig; der einzige
   Schlüssel-Proxy (`/_firms`) existiert, weil es nicht anders ging. Eine Quelle, die einen Account,
   eine Instanz-ID oder OAuth verlangt, bräuchte entweder einen exponierten Schlüssel (Kontingent-
   Diebstahl) oder einen neuen Proxy (Jans Gate, Edge-Function-Änderung = STOPP & FRAGEN).
2. **Netlify-Bytes ≈ 0** (Bandbreiten-Linie BW; `usage_exceeded` 2026-08-22). Bilder dürfen nicht
   durch einen Netlify-Proxy fließen.
3. **Klare Lizenz, keine NC-Klausel, kein Scraping** (Repo-Lehre 5 der Waldbrand-Linie).
4. **Keine zweite schwere Karten-Instanz** (BD2-Befund B2: keine zweite `FireMap`; die Minikarte ist
   bewusst leichtgewichtig). D-06: Dependency-Sparsamkeit.

Was der Brandradar je Brand schon hat: Ort (`lat`/`lon`/`bbox`), Brandzeitraum (`firstMs`/`lastMs`),
im Historie-Modus dasselbe je Ereignis. Das genügt als Eingabe für jede Bildquelle.

## 2. Kandidaten und Messbefunde

### K1 — NASA GIBS WMTS: HLS (Sentinel-2 + Landsat harmonisiert, 30 m) ✅ tragfähig

GIBS (`gibs.earthdata.nasa.gov`) führt die zwei HLS-Echtfarb-Layer als WMTS mit Tages-Zeitdimension:

| Layer | Quelle | Gitter | Format |
|---|---|---|---|
| `HLS_S30_Nadir_BRDF_Adjusted_Reflectance` | Sentinel-2 A/B/C | `GoogleMapsCompatible_Level12` (EPSG:3857, ≈ 24 m/px auf 50° N) | PNG |
| `HLS_L30_Nadir_BRDF_Adjusted_Reflectance` | Landsat 8/9 | dito | PNG |

Kachel-Template (RESTful): `…/wmts/epsg3857/best/{Layer}/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png`

**Gemessen (Kachel z12/1377/2120 = Hürtgenwald-Brand, 50,7° N 6,35° E):**

- **CORS offen:** `Access-Control-Allow-Origin: *` auf 200 UND 404 — der Browser lädt direkt,
  **0 Netlify-Bytes, kein Schlüssel**. Attributionssatz wird erbeten („We acknowledge the use of
  imagery provided by services from NASA's Global Imagery Browse Services (GIBS) …").
- **Frische:** Zeitdimension-Default am 31.08. war der **29.08.** ⇒ HLS hinkt ≈ 2–3 Tage hinter der
  Aufnahme (Verarbeitungslatenz), dazu kommt die Wartezeit auf den nächsten Überflug.
- **Kacheln existieren nur an Aufnahmetagen** (sonst 404 mit 196 Bytes). August an dieser Kachel:
  S30 an **7 Tagen** (04./06./09./14./16./24./26.), L30 an **4 weiteren** (02./03./10./11.) ⇒
  kombiniert ein Bild etwa **alle 2–3 Tage**. Ein UI, das stumpf „Brandtag ± 1" lädt, sähe meist 404.
- **DescribeDomains beantwortet die Tagesfrage NICHT:** die bbox-beschränkte Anfrage gab den vollen
  angefragten Bereich als `P1D`-Periode zurück (globale Zeitdomäne des Layers, nicht die Verfügbarkeit
  am Ort). Die Tagesliste muss aus STAC (K3) oder per Probing kommen.
- `Cache-Control: no-store` — der Browser cached Kacheln nicht; bei on-demand-Nutzung (~100 KB je
  Kachel) unkritisch.
- Kein HLS-**Falschfarben**-Layer (SWIR-Komposit Bänder 12/8a/4, in dem Brandnarben am deutlichsten
  wären) auf GIBS — Worldview zeigt den über einen dynamischen NASA-IMPACT-Dienst, dessen Kontrakt
  ungeprüft ist (→ V-SAT-4).

### K2 — Worldview Snapshot API: fertige Einzelbilder ✅ tragfähig, einfachste Form

`https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=…&BBOX=S,W,N,O&CRS=EPSG:4326&LAYERS=…&FORMAT=image/jpeg&WIDTH=…&HEIGHT=…`

Ein GET liefert **ein fertiges JPEG je BBox/Datum/Größe** aus denselben GIBS-Layern — kein Karten-
Widget nötig, zwei `<img>` genügen. **Gemessen:**

- 600 × 480 px um den Brand: **47–59 KB**, CORS `*` (für reine `<img>`-Anzeige wäre CORS nicht
  einmal nötig).
- Antwort-Header **`Data-Present: true|false`** und **`Acquisition-Time`** sind CORS-exponiert —
  der Client erkennt „an diesem Tag kein Bild" ohne das Bild zu dekodieren (gemessen: 13.08. ⇒
  `false` mit 1 994-Byte-Leerbild; L30 am 10.08. ⇒ `true`, 58 KB).
- Es ist der offizielle Backend-Dienst des Worldview-„Take a snapshot"-Knopfs; kein Schlüssel,
  keine publizierte Mengenauflage (→ V-SAT-1; on-demand 2–4 Bilder je Dossier-Klick ist fair use).

### K3 — Szenenwahl: Earth Search STAC (Element84 / AWS Open Data) ✅ tragfähig

`POST https://earth-search.aws.element84.com/v1/search` (Collection `sentinel-2-l2a`), anonym,
**CORS `*` gemessen**. Liefert je Szene `datetime`, **`eo:cloud_cover`** und die COG-Links.

**Der Messbefund, der den Algorithmus bestimmt:** am Hürtgenwald-Punkt war der Brandtag 14.08.
**0 % bewölkt**, aber die Kandidaten davor 09.08. **73–78 %**, 06.08. **90 %**, 04.08. im Bild fast
vollständig Wolken. **Wolken sind das eigentliche Problem, nicht die Aufnahme-Verfügbarkeit** —
„der Tag davor" ist der falsche Algorithmus; gebraucht wird „die letzte ausreichend wolkenarme Szene
vor Brandbeginn / die erste danach", und die Wolkenzahl kommt aus STAC.

Vorbehalt: `eo:cloud_cover` gilt je 110-km-Granulat, nicht am Brandort — ein „klares" Granulat kann
genau über dem Brand eine Wolke haben und umgekehrt (→ V-SAT-2). Deshalb gehört neben die Automatik
ein Datums-Stepper, mit dem der Nutzer selbst durch die Aufnahmetage blättert. Die STAC-Tage decken
sich mit den GIBS-S30-Tagen; die L30-Tage kämen aus einer zweiten Collection (`landsat-c2-l2`) oder
billiger per `Data-Present`-Probing (K2).

### K4 — 10 m in-app: Sentinel-2-COGs auf AWS ⚠ möglich, aber eigene große Phase

`sentinel-cogs.s3.us-west-2.amazonaws.com/…/TCI.tif` — **gemessen:** Range-Request 206, CORS `*`,
Datei 347 MB, Overviews per HTTP-Range lesbar. Technisch ginge echtes 10-m-Material ohne Schlüssel
und ohne Netlify — aber es braucht einen TIFF/COG-Leser: `geotiff.js` wäre eine neue Runtime-
Dependency (D-06), ein Eigenbau (Tiled-TIFF + Deflate via `DecompressionStream`) ist machbar
(das Repo hat einen handgeschriebenen GRIB2-Decoder), aber klar eine eigene Phase. **Nicht für den
ersten Schritt.**

### K5 — Copernicus Browser Deep-Link (10 m, volle Begutachtung) ✅ als Ergänzung

`https://browser.dataspace.copernicus.eu/?zoom=13&lat=…&lng=…&datasetId=S2_L2A_CDAS&fromTime=…&toTime=…&dateMode=SINGLE`
— ohne Login sichtbar, kostenlos, null Code-Risiko. Das Muster „Deep-Link für das, was wir nicht
selbst leisten" ist im Projekt etabliert (NINA, Alertswiss). Der Link wird mit Brandort und dem
gewählten Aufnahmetag vorbelegt; dort gibt es auch Falschfarben und den nativen 10-m-Zoom.

### K6 — geprüft und verworfen

- **CDSE Sentinel Hub OGC (WMS/WMTS):** braucht eine Instanz-ID = Schlüssel im Client (Kontingent
  30 000 PU/Monat wäre öffentlich abgreifbar) oder einen neuen Proxy ⇒ verletzt Nadelöhr 1/2.
- **EOX Sentinel-2 Cloudless:** Jahresmosaik — kein „vorher/nachher".
- **VIIRS Corrected Reflectance (M11-I2-I1, Falschfarbe):** täglich und aktuell (~3 h), aber 375 m —
  für DACH-Brandgrößen zu grob; höchstens für Großlagen als Kontext.
- **Esri World Imagery / Wayback:** Lizenz (kein freier Einsatz außerhalb der Esri-Stacks).

## 3. Augenschein (Belege in `audit/brandradar-satellitenbilder/`)

Worldview-Snapshots, BBox 50,62–50,78° N / 6,25–6,45° O (Hürtgenwald-Brand, 319 ha, 14.–15.08.):

| Datei | Datum | Befund |
|---|---|---|
| `snap-0804.jpg` | 04.08. (vorher) | fast vollständig Wolken — **das** Vorher-Problem im Bild |
| `snap-0814.jpg` | 14.08. (Brandtag, 0 % lt. STAC) | klarer Blick auf das Gebiet |
| `snap-0824.jpg` | 24.08. (nachher) | die **Brandnarbe ist als dunkle, verästelte Struktur klar erkennbar** |

**Sichtbarkeitsgrenze:** 319 ha ≈ 75 × 75 px im 30-m-Bild — gut belegbar. Ein 4-ha-Ereignis
(Jans Niederstetten-Beispiel) wäre ≈ 7 × 7 px Echtfarbe — meist **nicht** belegbar. Die Karte muss
das sagen („bei kleinen Bränden zeigt das 30-m-Bild oft keine sichtbare Narbe"), statt Sichtbarkeit
zu suggerieren; für die Feinbegutachtung ist der 10-m-Deep-Link (K5) der Weg.

**Latenz:** bei einem laufenden oder eben erloschenen Brand existiert das Nachher-Bild noch nicht
(nächster wolkenarmer Überflug + 2–3 Tage HLS-Verarbeitung). Der Nachher-Slot braucht einen
benannten Wartezustand.

## 4. Empfehlung (Phase SAT1, wenn Jan sie will)

Eine neue Dossier-Karte **„Satellitenbild vorher / nachher"** im Live-Dossier UND im
Ereignis-Dossier (beide haben Ort + Zeitraum):

1. Beim Öffnen **eine** STAC-Anfrage je Brand (anonym, CORS, on-demand) ⇒ Aufnahmetage + Wolken-%.
2. Auto-Wahl: letzte wolkenarme Szene **vor `firstMs`**, erste wolkenarme **nach `lastMs`**.
3. Anzeige als **zwei Worldview-Snapshots** (`<img>`, ~50 KB je Bild) mit Umschalter
   „Vorher | Nachher", Aufnahmedatum + Wolken-% als Beschriftung, Datums-Stepper durch die
   Aufnahmetage (`Data-Present`-Header als Wächter), benannte Zustände „noch kein Nachher-Bild" /
   „keine wolkenarme Vorher-Szene im Fenster".
4. Attributionszeile NASA GIBS/Worldview; Deep-Link **„In 10 m im Copernicus Browser öffnen"**
   (Ort + gewählter Tag vorbelegt).

Kosten: **0 Netlify-Bytes, 0 neue Dependencies, kein Schlüssel, keine zweite Karten-Instanz** —
zwei Bilder + ein JSON je Dossier-Klick, alles fremdgehostet. Aufwand ≈ eine Phase.

## 5. Entscheidungen (Jans Gate)

- **E1:** SAT1 bauen — ja/nein? (Empfehlung: ja, Live- und Ereignis-Dossier mit derselben Karte.)
- **E2:** Umschalter „Vorher | Nachher" oder Wisch-Slider? (Empfehlung: Umschalter — 44-px-tauglich,
  kein Layout-Risiko; ein Slider wäre später additiv.)
- **E3:** 10 m in-app (K4, COG-Leser) als spätere Phase? (Default: nein — der Deep-Link deckt die
  Begutachtung, K4 nur falls die externe Ansicht nicht reicht.)

## 6. V-Katalog

- **V-SAT-1:** Die Snapshot-API hat keine publizierte Mengenauflage — Nutzung strikt on-demand
  (kein Vorladen aller Registry-Brände), Volumen beobachten.
- **V-SAT-2:** `eo:cloud_cover` je Granulat ≠ Bewölkung am Brandort — Auto-Wahl kann danebengreifen,
  der Datums-Stepper ist die Korrektur durch den Nutzer.
- **V-SAT-3:** Sichtbarkeitsgrenze ~10–20 ha bei 30 m Echtfarbe — der Ehrlichkeitssatz ist Teil der
  Karte, nicht optional.
- **V-SAT-4:** HLS-Falschfarbe (SWIR 12/8a/4) zeigt Narben deutlicher, liegt aber nicht auf GIBS,
  sondern hinter einem dynamischen NASA-IMPACT-Dienst — Kontrakt/Stabilität ungeprüft; Kandidat für
  eine spätere Verbesserung.
- **V-SAT-5:** GIBS-DescribeDomains liefert keine ortsbezogene Verfügbarkeit — falls NASA das
  nachrüstet, entfiele die STAC-/Probing-Logik.

## 7. SAT1 — Umsetzung + Gate GSAT1 (2026-09-01, Jans Freigabe des Plans)

Jans Entscheidungen: Darstellung **Umschalter „Vorher | Während | Nachher" + Tagesleiste**, Einbau in
**beide** Dossiers (Live + Historie). Vor dem Bau nachgemessen: `landsat-c2-l2` existiert in Earth
Search (am Hürtgenwald-Punkt 3 August-Szenen: 02.08. 4 % · 10.08. 1 % · 18.08. 100 % — eine Teilmenge
der 4 GIBS-L30-Tage; der `Data-Present`-Wächter deckt die Differenz) ⇒ beide Collections in EINER
STAC-Anfrage.

**Gebaut:**
- `src/fire/detail/fireSatImagery.ts` (pur, Aufbau wortgleich zum Vorbild `fireWeatherAtPoint.ts`):
  `stacSearchBody` (beide Collections, `fields`-Beschnitt), `classifyScenes` (Dedupe je Kalendertag —
  S2 schlägt Landsat, sonst kleinster Wolkenwert; Phasen am UTC-Kalendertag; Auto-Wahl letzte/erste
  Szene ≤ 40 % Wolken, nur-wolkig ⇒ bester Kandidat + Satz; jede leere Phase mit benanntem Grund,
  Latenz ≠ Wolken ≠ kein Überflug), `snapshotBbox` (S,W,N,O; Mindesthöhe 0,16°, Breite metrisch 5:4),
  `snapshotUrl`/`copernicusBrowserUrl`, Sitzungs-Cache ohne AbortSignal (GBP1 (3)), Kill-Switch
  `?sat=0`/`localStorage.sat`, Selbstverifikation `verifyFireSatImagery()` (20 Checks, u. a. der
  nachgebaute Hürtgenwald-Fall).
- `src/fire/FireSatImagery.tsx` (`SatImageryBlock`): strukturelle Props (`SatTarget` — kein
  `fireRegistry`-/`historyArtifacts`-Import), Bildabruf per fetch→Blob→ObjectURL, damit
  `Data-Present: false` ein benannter Zustand wird; Blob-Sitzungs-Cache (max 48, Verdrängung revoked);
  Segmente, Bildrahmen 600×480, Tagesleiste, Notes, Attribution + 10-m-Deep-Link mit gewähltem Tag.
- Einbau: `FireDossier.tsx` und `HistoryDossierBody` (FireHistoryPanel.tsx), je hinter der
  Wetterlage-Karte, beide hinter `satEnabled()`; CSS im BD2-Block (`.br-ds-satbild` volle Breite
  Reihe 3, Einordnung/Merkmale → 4/5; nur Bestands-Hex/-Token; mobil 44-px-Knöpfe).
- Doku: `docs/API.md` **§8.8** (Client-Kontrakt, Abgrenzung zu §8.6a; Randnotiz: §8.7 existiert
  doppelt), `scripts/seo/licenses.mjs` (NASA GIBS/Worldview + Element84/AWS).

**Gate GSAT1 — Belege (Playwright, Dev-Server :5201):**
- **Historie „Monat" → Hürtgenwald (Düren):** Karte mit 19 Aufnahmetagen (15.07.–29.08.) samt
  Wolken-%; **Vorher = 10.08. Landsat ~1 %** (die wolkenarme Szene, NICHT der Tag davor — der
  gemessene Algorithmus), **Während = 14.08. Sentinel-2 ~0 %** (Brandtag), Nachher = 16.08. ~40 %
  MIT dem Satz „zu ~40 % bewölkt — eine bessere Szene gibt es im Fenster nicht"; Tagesklick 24.08.
  lädt das Narben-Bild (Vergleichsbild `snap-0824.jpg`); Deep-Link trägt Ort + gewählten Tag.
  `sat1-desktop-history.png`.
- **Live (aktiver Brand 49,17° N 15,65° O):** „Während" und „Nachher" deaktiviert, darunter die zwei
  Gründe („kein Überflug während des Brandes", „Noch kein Nachher-Bild — … plus 2–3 Tage
  Verarbeitung"); Vorher = 27.08. ~23 %. Dabei trat der **Data-Present-Fall live** auf: STAC listet
  den 27.08., der Bilddienst trägt ihn noch nicht ⇒ benannter Wartezustand statt Leerbild
  (`sat1-mobile-dossier.png`).
- **Netzwerk:** genau 1 STAC-POST je Dossier + 1 Snapshot je betrachtetem Tag (kein Vorladen, kein
  Doppelabruf beim Zurückschalten — Blob-Cache); alle Bild-Bytes an `wvs.earthdata.nasa.gov`/
  `element84.com` ⇒ **0 Netlify-Bytes**.
- **Kill-Switch:** `?sat=0` (über about:blank geladen, WF3-Falle) ⇒ 0 Satellitenbild-Karten, Dossier
  samt Verlauf unverändert.
- **Mobil (390×844, `innerWidth` 390 + `matchMedia` true zugesichert, §26.4):** Dossier-Seite mit
  Karte, 15 Knöpfe, kleinstes Touch-Ziel **44 px**, kein horizontaler Überlauf.
- **Verifier/Build:** `verify:fire-detail` **99/99** (+32: 20 Modul-Selbstchecks + 12 Sonden),
  `verify:fire-model` 122/122, `verify:fire-time` 114/114, `verify:fire-history` 112/113 (Rest
  `spreadFc` = Altbestand), typecheck grün, `npm run build` + Budget grün (**keine Ratsche nötig** —
  das Feature liegt im Fire-Routen-Chunk, keine neue Dependency).

**Fünf Selbstverifikations-Fragen:**
1. *Funktionserhalt:* rein additiv — mit `?sat=0` ist das Dossier byte-gleich zum SAT0-Stand (belegt);
   alle Bestands-Verifier unverändert grün.
2. *Desktop-Regression:* nur das Dossier-Raster erweitert (Einordnung/Merkmale rücken eine Reihe),
   Karten-Bühne, Sidebars, Zeit-Deck unberührt.
3. *Touch-Ziele:* gemessen min 44 px (mobil).
4. *Konsole:* 17 Fehler = Altbestand (EMS-CORS, ZAMG-404), **0 Warnungen**, keiner aus SAT1.
5. *Long Tasks:* Durchblättern von 5 Tagen am Dev-Server max **74 ms** (< 200); Prod-Messung bleibt
   wie bei BD1/BD2 offen.

**Verifier-Lehre (wieder §14.5):** die Negativ-Sonde „kennt kein FireRecord" schlug auf den eigenen
Doku-KOMMENTAR der Komponente an — umgestellt auf die Import-Ebene (`!/fireRegistry/`).

**Neu im Katalog:**
- **V-SAT-6:** steht die Auto-Wahl auf einem Tag, den der Bilddienst noch nicht trägt
  (`Data-Present: false`, live am 27.08. gesehen), könnte die Karte automatisch zur nächstälteren
  Szene weiterrücken, statt nur den Wartezustand zu zeigen — ein Abruf mehr, klarer Startzustand.
- **V-SAT-7:** `landsat-c2-l2` nennt weniger Tage als GIBS L30 trägt (3 von 4 im Messmonat) — eine
  zweite Quelle für L30-Tage (Probing) würde die Leiste dichter machen.

### 7.1 Nachtrag SAT1a (2026-09-01) — Jans Frage „warum sind die Satellitenbilder so undeutlich?"

Zwei Ursachen, eine behoben:

1. **Eigener Anteil (behoben):** Der Snapshot wurde mit 600 × 480 px über ~22 km angefordert —
   das sind ~37 m je Pixel, während GIBS auf DACH-Breite ~25 m je Pixel vorhält (Level 12): der
   Abruf hat Detail weggeworfen. Jetzt fordert `snapshotUrl` standardmäßig **2× an (1200 × 960,
   `SNAP_SCALE`)** und zeigt bei 600 CSS-px — am selben 24.08.-Ausschnitt gemessen 158 statt
   50 KB und sichtbar schärfer (Feldgrenzen, Ortschaften, Straßen lesbar; `/tmp`-Vergleich
   vgl-600/vgl-1200), zusätzlich Retina-scharf. `verify:fire-detail` **100/100** (+1 Selbstcheck
   WIDTH=1200), typecheck grün.
2. **Physik (bleibt, steht als Satz an der Karte):** HLS ist ein 30-m-Produkt — ein Pixel ist ein
   Waldstück, kein Baum; Häuser und Wege verschwinden strukturell. Dazu kommt tagesabhängiger
   Dunst/Zirrus (die milchigen Schlieren im 24.08.-Bild sind dünne Wolkenbänder, kein Artefakt
   der Einbindung). Mehr Schärfe hieße 10 m: heute über den Copernicus-Deep-Link an der Karte,
   in-app nur über K4 (COG-Leser, eigene Phase, E3).

## 8. Optionen für maximale Auflösung (Jans Frage 2026-09-01: „egal welcher Programmieraufwand")

**Die ehrliche Decke zuerst:** Es gibt KEINE frei nutzbare, regelmäßig aktualisierte Erdbeobachtung
besser als **Sentinel-2 mit 10 m** (Echtfarbe B02/B03/B04 und NIR B08; SWIR B11/B12 in 20 m).
Alles darüber ist entweder kommerziell (Planet/Maxar/Airbus-Tasking: Geld + Lizenz), auf
Katastrophen-Aktivierungen beschränkt (Maxar Open Data — kein DACH-Regelfall) oder Jahre alt
(Landes-Orthophotos 20 cm: gestochen scharf, aber Befliegung alle 2–3 Jahre ⇒ zeigen den Wald VOR
dem Brand, nie die Narbe). Der Sprung, den wir programmiertechnisch kaufen können, ist
**30 m → 10 m (Faktor 3, Faktor 9 in der Fläche)** — plus etwas Wichtigeres als Auflösung: **SWIR**.

### O1 — SAT2a: eigener COG-Leser + 10-m-Zoom-Viewer im Dossier (Empfehlung, Teil 1)

Quelle: `sentinel-cogs.s3.us-west-2.amazonaws.com` (AWS Open Data), Asset `visual` (TCI, 10 m RGB)
je Szene aus der STAC-Antwort, die SAT1 ohnehin schon holt. **Struktur am echten Objekt gemessen
(TIFF-Header der 14.08.-Szene):** klassisches Little-Endian-TIFF, 10 980², **Compression 8 =
Deflate** (nativ per `DecompressionStream('deflate')` — kein zlib-Port nötig), **Predictor 2**
(horizontale Differenz, eine Zeile Code), Kachelpyramide 1024²-Kacheln + **4 Overview-Ebenen**
(512²) bis 687², und **alle IFDs liegen in den ersten 16 KB** ⇒ EIN Range-Request liefert das
ganze Inhaltsverzeichnis. CORS `*` und Range 206 sind aus SAT0 gemessen.

Bauplan: `src/fire/detail/cogTiff.ts` (pur: IFD-Parser, Kachelindex, Deflate + Predictor,
~300–500 Zeilen — das Repo hat mit dem GRIB2-Decoder das Muster) + Viewer-Canvas im Dossier:
Überblick aus einer Overview-Ebene (~100–300 KB), beim Hineinzoomen nur die sichtbaren
Voll-Auflösungs-Kacheln (1 Kachel = 10,24 km; ein Brandfenster = 1–4 Kacheln, ~3–10 MB — nur auf
ausdrückliches Zoomen, nie automatisch). **Keine neue Dependency, kein Schlüssel, 0 Netlify-Bytes,
kein WebGL (Canvas 2D ⇒ kein STOPP-&-FRAGEN).** Aufwand ≈ 1–2 Phasen. Ergebnis: ein 2-ha-Brand ist
14 × 14 Pixel statt 2 × 2 — echte Begutachtung im Dossier.

### O2 — SAT2b: SWIR-Falschfarbe + dNBR-Overlay (Empfehlung, Teil 2 — macht Flächen ERKENNBAR)

Für „tatsächliche Brandflächen erkennen" ist der **Kontrast wichtiger als die Pixelgröße**: im
SWIR-Komposit (B12/B8A/B04, 20 m) leuchten Narben, die in Echtfarbe fast unsichtbar sind, und aus
Vorher-/Nachher-Szene lässt sich der **dNBR** rechnen ((B8A−B12)/(B8A+B12), differenziert) — genau
die Methode, mit der EFFIS selbst kartiert, und genau das ruhende BA-Linien-Konzept
(`konzept-brandflaechen-modul.md`), nur on-demand je Brandfenster im Client statt als Batch.
Dieselben COGs, derselbe Leser aus O1 (B12/B8A sind uint16-Einband-COGs gleicher Bauart) — nur ein
kleiner Bild-Rechenkern obendrauf. **VB0-Abgrenzung:** VB0 hat widerlegt, dass aus
FIRMS-DETEKTIONSGEOMETRIE eine gute Fläche wird; dNBR arbeitet auf dem Nachher-BILD und ist eine
andere, etablierte Evidenzklasse. Auflage bleibt: das Overlay heißt „verbrannt wirkende Fläche
(dNBR, unkalibriert)", nie amtlicher Umriss — die EFFIS-Kartierung bleibt die Referenz.

### O3 — geotiff.js statt Eigenbau

Fertige Bibliothek, aber neue Runtime-Dependency (D-06-Gate) und deutlich mehr Bundle als der
schmale Eigenbau. Nur Rückfallplan, falls O1 an einer TIFF-Variante scheitert (nach der Messung
unwahrscheinlich — Deflate+Predictor 2 ist die einzige Kombination im Bestand).

### O4 — höher als 10 m: existiert frei nicht regelmäßig

Maxar Open Data (30–50 cm) nur nach großen Katastrophen-Aktivierungen; kommerzielle Anbieter =
Geld/Lizenz/Schlüssel; Orthophotos der Länder = veraltete „Vorher"-Basis. Könnte später als
**Vorher-Unterlage** unter das dNBR-Overlay (Ehrlichkeitssatz „Luftbild älter als der Brand"),
ist aber kein Weg zur Narbe.

**Empfehlung:** Linie **SAT2 = O1 + O2** (erst der Leser + 10-m-Viewer, dann SWIR/dNBR als zweite
Phase auf demselben Leser). Jans Gate; kein STOPP-Fall enthalten.

---

## §9 SAT2a — Eigener COG-Leser + zoombarer 10-m-Viewer (2026-09-02, Jans Plan-Freigabe)

Jans Auftrag aus §8 („maximal hohe Auflösung, egal welcher Programmieraufwand") und seine
Darstellungs-Wahl per Rückfrage: **zoombare Canvas im bestehenden 600-px-Bildrahmen +
Vollbild-Knopf** (Overlay, Esc/× schließt). Umgesetzt ist O1; O2 (SWIR/dNBR) bleibt die
Folgephase auf demselben Leser (V-SAT-9).

### §9.1 Sonden vor dem Bau (2026-09-01/02) — die tragende Unbekannte geschlossen

- **Das `visual`-Asset der SAT1-Collection `sentinel-2-l2a` zeigt auf den CORS-OFFENEN Bucket**
  `sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/…/TCI.tif` — NICHT auf den
  CORS-losen Batch-Bucket `e84-earth-search-sentinel-data` aus API.md §8.6a (der gehört zur
  anderen Collection `sentinel-2-c1-l2a`; beide Messungen stimmen, es sind zwei Buckets).
  Gemessen am 14.08.-Item: Range → **206**, `Access-Control-Allow-Origin: *`, Datei 347 134 985 B;
  **Preflight** (`OPTIONS` mit `Access-Control-Request-Headers: range`) → 200 mit
  `Access-Control-Allow-Headers: range` — wichtig, weil ein `fetch` mit Range-Header im
  Browser preflightet.
- **Die Georeferenz liefert STAC gratis**: je Asset `proj:shape` (10980²) und `proj:transform`
  `[10, 0, X0, 0, −10, Y0]`, je Item `proj:epsg` ⇒ der Leser parst KEINE GeoTIFF-Geo-Tags.
  Am Messpunkt (50.7 N / 6.35 O) lagen ZWEI überlappende Granulate (31UGS EPSG 32631 UND
  32ULB EPSG 32632) — die Zone kommt deshalb IMMER aus `proj:epsg`, nie aus der Länge.
- **Earth Search projiziert verschachtelte Asset-Felder nicht** — trotz
  `fields.include: assets.visual.href` kam die volle Asset-Liste zurück ⇒ die COG-Referenz
  holt eine ZWEITE, on-demand Tages-Suche ohne fields-Beschnitt, die SAT1-Anfrage bleibt
  unangetastet.
- **Parser am echten Objekt belegt** (16-KB-Range der 347-MB-Datei): 5 IFDs —
  10980² (1024²-Kacheln, 121, ~245 MB) · 5490² (512², ~64 MB) · 2745² (~17 MB) · 1373² (~4 MB)
  · 687² (~1 MB), alle Compression 8/Predictor 2; eine echte 20-m-Kachel (524 KB) dekodiert
  zu exakt 786 432 B mit Waldgrün am Hürtgenwald-Punkt. **Korrektur zu §8:** die
  20-m-Kacheln sind ~0,5 MB — das Startfenster kostet real **~1–2 MB** (nicht 0,1–0,3);
  der Einstiegsknopf trägt deshalb die ehrliche Spanne „~1–10 MB je nach Zoom".
- **Landsat bleibt draußen**: `landsat-c2-l2`-Assets liegen auf dem USGS-Bucket
  (requester-pays, kein anonymer CORS-Pfad) und wären ohnehin 30 m.

### §9.2 Umsetzung

- **`src/fire/detail/cogTiff.ts`** (pur, DOM-frei, Muster `gribDecode.ts`): IFD-Parser (LE + BE,
  Tags 256/257/258/259/277/317/322–325), `needMoreBytes` als ITERATIVER Vertrag (jede Runde
  nennt das nächste fehlende Pufferende; gemessen reicht 16 KB, 64 KB ist die Versicherung),
  `pickLevel` (gröbste Ebene, die das Ziel-m/px noch erreicht; Endanschlag statt „unendlich"),
  `tilesFor`/`estimateBytes`, `decodeTile` = `DecompressionStream('deflate')` (zlib —
  Abgrenzung zum 'gzip'-Bestand) + Predictor 2 rückwärts; alles außerhalb von
  uint8/1–3 Kanäle/Compression 1|8/Predictor 1|2 ist ein benannter `cog-unsupported`-Fehler,
  nie ein stilles Falschbild. `verifyCogTiff()` baut synthetische tiled TIFFs in-memory
  (eigener Fixture-Writer + `CompressionStream`) — Rundlauf byte-gleich in 4 Kombinationen,
  Randkacheln, Konvergenz des Nachschub-Vertrags, Ebenen- und Kachelwahl an der echten Pyramide.
- **`src/fire/detail/sentinelGeo.ts`** (Haus-Stil `radolanGeo.ts`): WGS84-UTM fwd/inv
  (k0 = 0.9996), `utmZoneOf(epsg)`, `pixelOf(lat, lon, epsg, transform)` (äußere NW-Ecke).
  `verifySentinelGeo()`: Mittelmeridian-Exaktheit, Maßstab k0 am Äquator, **Goldwert CN Tower
  (17T 630084/4833438 — getroffen auf < 1 m)**, Rundlauf < 1 cm in eigener UND Nachbarzone
  (weiter draußen divergiert die Reihe planmäßig und kommt bei S2 nie vor), beide
  Überlapp-Granulate als gemessene Anker, fremde EPSG ⇒ `null`.
- **`fireSatImagery.ts` additiv**: `stacDayBody` (EINE Collection, Tagesfenster, limit 4, ohne
  fields), `parseS2CogCandidates` (nur vollständige https-Assets, Randabstand `marginPx`
  gerechnet), **`pickGranule`** — verfeinert gegenüber dem Plan: deckt der Randabstand das
  Fenster (`GRANULE_WINDOW_PX` 1200), entscheidet die WOLKE; sonst der größere Randabstand
  (ein wolkenfreies Granulat nützt nichts, wenn der Brand an seiner Schnittkante klebt);
  `fetchS2CogRef` mit Sitzungs-Cache ohne AbortSignal (GBP1 (3)); Kill-Switch
  **`sat10Enabled()`** injektierbar (Muster `hdf5WorkerEnabled`, Wahrheitstafel im Verifier).
- **`src/fire/FireCogViewer.tsx`** (eigener Lazy-Chunk **5,9 KB gz**, geladen erst mit dem
  Klick — NerdPanel-Muster `{cog10 && <Suspense>}`): Canvas 2D (kein WebGL ⇒ kein
  STOPP-&-FRAGEN-Fall), Ziehen (Pointer-Capture), Rad-Zoom (manueller Listener mit
  `passive: false` — Reacts onWheel kann den Seiten-Scroll nicht verhindern), Pinch,
  +/−/⌂/⤢/×-Knöpfe; Kachel-Pipeline mit Sitzungs-Cache (Deckel 24, `ImageBitmap.close()` bei
  Verdrängung, in-flight 4), gröbere Ebenen bleiben als Unterlage stehen; **Fadenkreuz** am
  Brandpunkt, **Maßstabsbalken**, Statuszeile „N Kacheln · M MB geladen · ~x m/px" plus der
  10-m-Kostenzahl der aktuellen Sicht (`estimateBytes`); oberhalb der Datenauflösung ist die
  Glättung AUS (echte Pixel statt weichgezeichneter Behauptung); Szenenrand-Satz, wenn der
  Brand nahe der Granulatkante liegt; jeder Fehlerzustand benannt mit Copernicus-Link als
  Ausweg. **Vollbild als Portal an `document.body`** — `position: fixed` bliebe sonst im
  `overflow: hidden` des Rahmens gefangen, sobald ein Vorfahr eine transform trägt; Esc
  schließt erst das Vollbild, dann den Viewer; Body-Scroll gesperrt, solange es offen ist.
- **Einbau** in `FireSatImagery.tsx` (damit in BEIDEN Dossiers): Knopf „In 10 m ansehen —
  lädt je nach Zoom ~1–10 MB" nur bei `scene.sat === 's2'` + `sat10Enabled()`; bei
  Landsat-Szenen steht der Grund im Fußtext; Tageswechsel re-initialisiert den Viewer
  (key = dayIso), Wechsel auf einen Landsat-Tag schließt ihn.

### §9.3 Gemessen (Gate GSAT2a)

Headless: `verify:fire-detail` **153/153** (+53: 20 `[cog]`-Modul, 10 `[geo]`, 6 `[10m]` im
SAT-Modul, 17 Skript-Sonden), fire-model 122/122, fire-time 114/114, fire-history 112/113
(spreadFc-Altbestand), verify:seo 114, typecheck grün, `npm run build` grün, Budget
**totalJs 1 079/1 109,8** (KEINE Ratsche nötig; eagerJs unverändert 103,1 — der Viewer ist
ein Lazy-Chunk).

Browser (Playwright; Hürtgenwald-Ereignis, Tag 24.08., Dev + Prod-Preview):

- Überblick nach dem Klick: **4 Kacheln · 2,0 MB · ~20 m/px**, Maßstab „5 km", Statuszeile
  nennt „volle 10 m hier ≈ 11 MB" VOR dem Zoomen; Fadenkreuz sitzt auf der Narbe
  (`sat2a-uebersicht.png`, Vergleich `sat2a-30m-vergleich.png`).
- Zwei Zoomstufen: **8 Kacheln · 9,4 MB · ~10 m/px** — die Brandnarbe mit Wegen und
  Schneisen klar aufgelöst (`sat2a-zoom.png`); die Kostenzeile verschwindet bei 10 m/px
  (nichts mehr zu versprechen).
- **Netz exakt wie entworfen**: 1 Tages-STAC-POST + 9 Range-Abrufe (1 Header + 8 Kacheln)
  auf GENAU einer Datei (`…31UGS_20260824…/TCI.tif`), alle 206; **0 Netlify-Bytes**.
- **Vollbild**: Portal 1440 × 900 an (0,0), Body-Scroll gesperrt und wiederhergestellt,
  Esc-Kaskade (Vollbild → Viewer → 30-m-Bild), Zoom/Position überleben den Wechsel
  (`sat2a-vollbild.png`).
- **Landsat-Tag 10.08.**: kein 10-m-Knopf, der Satz „nur an Sentinel-2-Tagen" steht im Fuß.
- **`?sat10=0`**: Knopf weg, SAT1-Karte intakt (3 Phasen, 19 Tage, Bild); `?sat=0`
  unverändert (ganze Karte weg).
- **Mobil, echte 375-px-Emulation** (Zusicherung `innerWidth` 375 + `matchMedia` true, §26.4):
  Live-Dossier „bei Osternienburg", S2-Tag 30.08. — Einstiegsknopf 44 px, alle fünf
  Steuer-Knöpfe 44 × 44, horizontaler Überlauf 0 px, Zoom über Knöpfe belegt
  (2 Kacheln 0,2 MB @ 20 m → 3 Kacheln 0,4 MB @ 10 m — der kleine Rahmen braucht weniger);
  `sat2a-mobil.png`.
- **Long Tasks am Prod-Build: 0** über die gesamte Viewer-Sitzung (Öffnen, Header, 9,4 MB
  Kachel-Dekode, zwei Zoomstufen, echtes Maus-Schwenken); die 107/92/62 ms davor gehören dem
  Dossier-Öffnen (Altbestand) ⇒ **die Worker-Eskalation aus dem Plan entfällt gemessen**
  (`DecompressionStream` arbeitet stream-basiert, die Predictor-Schleife kostet einstellige ms).
- Konsole: ausschließlich Altbestand (ZAMG-404, EMS-CORS, EFFIS-WMS-500) — 0 neue
  Fehler/Warnungen.

### §9.4 Befunde aus dem laufenden Bild

1. **Mobil existiert das HISTORIE-Dossier gar nicht** (Altbestand BD2f): `FirePage` rendert
   `historyDossier` nur `!isMobile`; mobil zeigt die Historie die Inline-Detailkarte — und
   damit fehlen dort auch Wetterlage-Steel, FRP-Verlauf und die Satellitenbild-Karte. Der
   SAT2a-Mobil-Beleg lief deshalb am LIVE-Dossier (das mobil vollständig ist) ⇒ **V-SAT-11**.
2. Der BH-Permalink trägt eine **positionale** Ereignis-Kennung (`b`), die einen Reload nicht
   überlebt (leeres Dossier nach F5, Zeile neu anklicken nötig) — Altbestand BH3/BD2f, hier
   nur als Mess-Stolperstein dokumentiert.
3. Zwei Verifier-Erwartungen waren beim ersten Lauf FALSCH GERECHNET (Fenster 1000–2100 px
   spannt DREI Kachelspalten, nicht zwei; der fwd∘inv-Rundlauf 13° außerhalb der Zone misst
   die planmäßige Reihen-Divergenz, keinen Fehler) — die Sonden wurden an der nachgerechneten
   Wahrheit korrigiert, nicht der Code an den Sonden.

### §9.5 Fünf Selbstverifikations-Fragen (Gate GSAT2a)

1. **Funktionserhalt einzeln:** SAT1-Karte, Phasen, Tagesleiste, Snapshot, Deep-Link, beide
   Dossiers — alle 153 Sonden grün, `?sat10=0`-Lauf zeigt die Karte unverändert. ✔
2. **Desktop pixelgleich außerhalb des Neuen:** ohne Klick auf den (neuen) Knopf ändert sich
   nichts am Bestand; Grid-Reihen 3/4/5 unverändert (Sonden). ✔
3. **Touch-Ziele ≥ 44 px:** gemessen 44 (Einstieg) + 5 × 44 × 44 (Steuerung), mobil 0 px
   Überlauf. ✔
4. **Konsole sauber:** 0 neue Fehler/Warnungen (nur benannter Altbestand). ✔
5. **Keine Long Tasks > 200 ms:** 0 Long Tasks im Viewer am Prod-Build. ✔

### §9.6 V-Katalog (Fortschreibung)

- **V-SAT-8** (geschlossen durch Messung): Kachel-Dekode in einen Worker — am Prod-Build
  0 Long Tasks gemessen, entfällt; wieder aufmachen, falls Real-Device anderes zeigt.
- **V-SAT-9**: SAT2b — SWIR-Falschfarbe (B12/B8A/B04, `swir22`/`nir08`/`red`, uint16-Einband
  gleicher Bauart) + dNBR-Overlay „verbrannt wirkende Fläche (dNBR, unkalibriert)" auf
  demselben Leser; §8 O2, Jans Gate.
- **V-SAT-10**: Vollbild-Wisch-Vergleich Vorher/Nachher (zwei Szenen im selben Viewer).
- **V-SAT-11**: das Historie-Dossier mobil nachrüsten (heute nur Live-Brände; Altbestand
  BD2f — betrifft Wetterlage, Verlauf UND Satellitenbild).

## §10 SAT2b — SWIR-Falschfarbe + dNBR-Overlay auf demselben Leser (2026-09-02, Jans Go „starte das")

Jans Auftrag: V-SAT-9 umsetzen — „damit werden Brandflächen erkennbar, nicht nur schärfer."
Randbedingungen unverändert: 0 Netlify-Bytes, kein Schlüssel, keine Dependency, Canvas 2D
(kein STOPP-&-FRAGEN), Funktionserhalt (Echtfarbe bleibt Default des Viewers, SAT1 unberührt).

### §10.1 Sonden vor dem Bau (2026-09-02) — vier Befunde tragen den Bau

**(1) Die Band-COGs sind dieselbe Bauart, nur kleiner und uint16.** Am 14.08.-Item gemessen:
`swir22` = B12.tif, `nir08` = B8A.tif (je 20 m, 5490², gleicher UTM-Ursprung wie das TCI,
Datei ~61 MB), `red` = B04.tif (10 m, 10980²). Alle: LE, Compression 8 = Deflate,
**Predictor 2 auf 16-bit-Werten** (additive Differenz je 16-bit-Sample, nicht je Byte),
alle IFDs in EINEM 16-KB-Range — **der vorhandene Tag-Parser liest sie unverändert**, nur der
Dekodepfad braucht die uint16-Variante. CORS mit `Origin`-Header nachgemessen: GET+Range 206
mit ACAO `*`, Preflight `allow-headers: range` (die erste Sonde ohne Origin zeigte `acao null` —
S3 sendet CORS-Header nur auf Anfragen MIT Origin; Browser senden ihn immer, die Sonde nicht).
Eine 20-m-Vollkachel B12 ≈ 0,39 MB.

**(2) Die Reflektanz-Skala steht im STAC und ist NICHT konstant.** `raster:bands` je Asset:
`scale 0.0001, offset −0.1, nodata 0` (Processing Baseline ≥ 04.00, seit 2022; ältere Szenen
im Archiv tragen offset 0). BOA = DN·scale + offset — der Offset drückt dunkles Wald-SWIR unter
0 und macht den NBR-Quotienten > 1 (gemessen 1,556 — physikalisch unmöglich). Die Klemmung
**BOA = max(0, DN·scale + offset)** ist die konsistente Lösung: am gemessenen Narbenpixel
(vorher B8A/B12 = 3105/542, nachher 2688/1723) ergibt sie dNBR **0,600**; Skala und Offset
werden je Szene aus `raster:bands` gelesen, nie als Konstante angenommen.

**(3) dNBR funktioniert am echten Ereignis.** 3×3-km-Fenster um 50,70/6,35 (vorher 25.07.,
nachher 24.08., beide 31UGS): Hintergrund-dNBR zentriert um ~0,05 (Jahreszeit-Drift Juli→August),
die Narbe hebt sich mit 0,27–0,60 klar ab (Maximum 0,600 bei +1,4 km SO — der Nominalpunkt sitzt
am Narbenrand); 642 Pixel > 0,27 allein in diesem kleinen Fenster. Kosten: 4 Raster × 1 Kachel =
1,54 MB. **Die Vorher-Szene liegt ideal:** S2-Tage vor dem Brand am Punkt: 09.08. 78 % ·
06.08. 90 % · 04.08. 86 % · 30.07. 94 % · **25.07. 0,2 %** — der SAT1-Algorithmus „letzte Szene
≤ 40 % davor" trifft sie; 35 Tage Rückschau reichen. **Gleiches Granulat (31UGS vorher UND
nachher) ⇒ identisches Pixelgitter und identische Kachel-Struktur — keine Umprojektion, kein
Resampling**; die Granulat-Kennung steht im Item-Namen und im Asset-Pfad.

**(4) Die Kachelgitter der Bänder decken sich NUR auf der 5490er-Ebene.** Gemessen:
B04-Pyramide 10980/1024er → 5490/**512er** → 2745/**512er** → 1373/512er → 687/512er;
B8A/B12: 5490/**512er** → 2745/**256er** → 1373/256er → 687/256er → 344/256er. Unterhalb 5490
sind B04-Kacheln also doppelt so groß — aber die 512er-Grenzen sind exakte Vielfache der
256er-Grenzen: **jede Ausgabe-Kachel (B8A/B12-Gitter) liegt vollständig in genau EINER
B04-Kachel** (Integer-Offset, `subTileU16`-Ausschnitt, kein Resampling). dNBR braucht B04 gar
nicht (nur B8A/B12, vorher/nachher strukturgleich auf allen Ebenen — am 25.07.-Paar belegt).
Wächter im Code: Breiten gleich + Kachelbreite teilt — sonst benannter `cog-unsupported`.

### §10.2 Plan (aus den Sonden)

1. `cogTiff.ts` additiv: `littleEndian` in der IFD (der uint16-Dekoder braucht die Byte-Ordnung),
   `decodeTileU16` (bits 16, spp 1, Predictor 2 auf 16-bit-Werten), `subTileU16`; Fixture-Writer
   lernt 16 bit, Rundläufe LE/BE × Predictor 1/2 im Verify.
2. Neues pures Modul `burnIndex.ts`: BOA mit Klemmung, NBR/dNBR, SWIR-Falschfarb-Stretch,
   dNBR-Rampe mit USGS-Konventionsschwellen (0,10/0,27/0,44/0,66 — „unkalibriert" steht dran),
   Kachel-Kompositoren (RGBA), Verify mit dem gemessenen Goldwert 0,600.
3. `fireSatImagery.ts` additiv: `S2CogRef.bands` (Hrefs + scale/offset aus `raster:bands` +
   Granulat-Kennung), `fetchS2PreCogRef` (Listen-Suche 35 Tage zurück, NUR dasselbe Granulat,
   letzte ≤ 40 % Wolken; dann die vorhandene Tages-Suche) — Absage ist ein benannter Zustand.
4. `FireCogViewer.tsx`: Modus-Chips „Echtfarbe | SWIR | Verbrannt (dNBR)" (nur wenn Bänder da),
   Band-Header- und uint16-Kachel-Cache, dNBR als Overlay ÜBER der Echtfarbe, Legende + Sätze
   (Vergleichsdaten, unkalibriert, keine Wolkenmaske, 20-m-Auflösung), Datenauflösung je Modus.
5. Bewusst NICHT: SCL-Wolkenmaske (eigene Folgeentscheidung, der Satz benennt die Lücke),
   Wisch-Vergleich (V-SAT-10), Landsat, Kalibrierung der Schwellen am Ereignis.

### §10.3 Umsetzung + Gate GSAT2b (gemessen 2026-09-02, Dev + Prod-Preview)

**Gebaut (additiv):** `cogTiff.ts` +`littleEndian`/`decodeTileU16`/`subTileU16` (Fixture-Writer
schreibt jetzt auch 16 bit, Rundläufe LE/BE × Predictor 1/2 wert-gleich); neues pures Modul
`burnIndex.ts` (BOA mit Klemmung je Szenen-Skala, NBR/dNBR, `DNBR_CLASSES` als EINE Quelle für
Canvas-Pixel UND Legende, SWIR-Stretch 2,5, Kachel-Kompositoren, Goldwert 0,600 im Verify);
`fireSatImagery.ts` +`S2CogRef.bands`/`square`, `granuleSquareOf`, `stacPreListBody`/`pickPreDay`/
`fetchS2PreCogRef` (Vorher-Szene NUR desselben Granulats, Absage memoiert als fachliches Ergebnis);
`FireCogViewer.tsx` Modus-Chips „Echtfarbe | SWIR | Verbrannt (dNBR)" (nur mit Band-Assets,
Echtfarbe bleibt Default), Band-Header-Cache, uint16-Kachel-Cache (Deckel 32), dNBR als Overlay
ÜBER der Echtfarbe (nur die gewählte Ebene — gestapelte Halbtransparenz verdoppelte die Deckkraft),
Legende + Ehrlichkeitssätze, `.br-cog-notes`-Stapel im CSS.

**Browser-Belege (Hürtgenwald, Nachher-Tag 24.08., Prod-Preview):**
- **dNBR:** „Vergleich 25.07. → 24.08." — die Narbe steht als kompakte rot-violette Fläche
  (0,44–0,66 und > 0,66) exakt am Fadenkreuz, Feldwechsel-Sprenkel rundum in der schwachen
  Klasse, genau wie der Satz es benennt (`sat2b-dnbr.png`, `sat2b-dnbr-vollbild.png`).
- **Netz je Sitzung (alle drei Modi + Zoom auf 2 km):** 3 STAC-POSTs (Tag + Vorher-Liste +
  Vorher-Tag) + 34 Range-206 auf 5 Dateien, 16,8 MB, **0 Netlify-Bytes**; nur dNBR bis zum
  Überblick: 3 STAC + 30 Abrufe, 9,4 MB.
- **Long Tasks am Prod-Build: max 196 ms** (ein Task beim gleichzeitigen Kompositieren von
  4 Vollkacheln nach schnellem Rad-Zoom; sonst 57 ms und 0) — unter dem 200-ms-Gate, aber
  nahe dran: Real-Device-Vorbehalt als V-SAT-12.
- Konsole im ganzen Viewer-Lauf **0 Fehler / 0 Warnungen**; Esc-Kaskade + Scroll-Sperre + Modus
  überlebt den Vollbild-Wechsel; Landsat-Tag: kein Knopf + Satz (unverändert); `?sat10=0`:
  kein Einstieg, SAT1-Karte vollständig (Snapshot + 19 Tage).
- **Mobil** (max-width 767 aktiv, Zusicherung `matchMedia`; `resize_page`-Boden 500 px
  `innerWidth` — ET-Lehre): alle **9** Ziele 44 px (Einstieg + 3 Chips + 5 Steuerknöpfe),
  0 px Überlauf, 0 Kollisionen (`sat2b-mobil.png`).

`verify:fire-detail` **199/199** (+46: cogTiff-u16-Rundläufe, burnIndex 15, Kandidaten/Vorher-
Suche, Viewer-Sonden), fire-model 122/122, fire-time 114/114, fire-history 112/113 (Altbestand),
typecheck + Build + Budget grün (totalJs 1 082,6/1 109,8 — KEINE Ratsche; eagerJs 103,1
unverändert; Viewer-Chunk 9,0 KB gz, weiter lazy).

### §10.4 Befunde aus dem laufenden Bild

1. **Der dNBR-Vergleich nahm zuerst den Brandtag als „Vorher"** — die Suche ankerte am
   Betrachtungstag (24.08.) und fand als letzte wolkenarme Szene den 14.08., den Tag des
   Feuers. Der Anker MUSS der Brandbeginn sein: `CogViewerProps.fireStartIso` (aus
   `t.firstMs`), die Suche endet strikt davor ⇒ 25.07. Ohne bekannten Zeitraum bleibt der
   Betrachtungstag der Anker.
2. **Ein latenter SAT2a-Fehler legte den ganzen Viewer lahm:** die Effekt-Aufräumung rief
   `cancelAnimationFrame(rafRef.current)`, setzte die ID aber nie auf 0 zurück — traf die
   Aufräumung einen AUSSTEHENDEN Draw (genau das tut der Moduswechsel, der neu in den
   Effekt-Deps steht), hielt `schedule()` die stehengebliebene ID für einen ausstehenden Frame
   und zeichnete NIE wieder (Kacheln fertig geladen, Canvas schwarz, Statuszeile eingefroren).
   In SAT2a unsichtbar, weil die Deps sich praktisch nie mit ausstehendem Draw änderten.
3. **Zwei ehrliche Korrekturen an den Sätzen:** die frische Hürtgenwald-Narbe erscheint im
   SWIR-Komposit NICHT „rot-orange" (das gilt für schwere/aktive Brände; hier SWIR-Reflektanz
   nur ~0,07 ⇒ dunkel-oliv) — der Satz sagt es jetzt richtig und verweist auf den dNBR-Modus;
   und die Feld-Sprenkel im Bild (Ernte Juli→August) stehen als benannte Fehlsignal-Quelle im
   dNBR-Satz.
4. **Mobil überlappten Modus-Chips und Steuerknöpfe** (beide absolut in der Kopfzeile) —
   Chips stapeln mobil vertikal, 0 Kollisionen gemessen.
5. **Mess-Lehren:** S3 sendet CORS-Header nur auf Anfragen MIT `Origin` (die erste Sonde ohne
   Origin zeigte `acao null` — kein Befund); der Resource-Timing-Puffer (250) war auf der
   kachellastigen Seite längst voll, „fehlende" Netz-Einträge waren ein Messartefakt (LE0-Lehre
   in neuer Gestalt) ⇒ Netzbilanz über einen fetch-Zähler erhoben; und ein Hintergrund-Tab
   drosselt rAF — Zeichen-Zustände nur mit Vordergrund-Tab bewerten (Fund 2 wurde erst dadurch
   von der Drossel unterscheidbar).

### §10.5 Fünf Selbstverifikations-Fragen (Gate GSAT2b)

1. **Funktionserhalt einzeln:** SAT1-Karte, SAT2a-Echtfarbe (Start byte-gleich: 4 Kacheln/2,0 MB/
   „volle 10 m hier ≈ 11 MB"), Deep-Link, Landsat-Sätze, `?sat=0`/`?sat10=0` — alle Sonden grün,
   Browser-Gegenproben ✔
2. **Desktop pixelgleich außerhalb des Neuen:** ohne Band-Assets bzw. ohne Chip-Klick ändert
   sich nichts; die Chips erscheinen nur im geöffneten Viewer. ✔
3. **Touch-Ziele ≥ 44 px:** 9/9 gemessen, 0 Kollisionen, 0 px Überlauf. ✔
4. **Konsole sauber:** 0 Fehler / 0 Warnungen im Prod-Preview-Lauf. ✔
5. **Keine Long Tasks > 200 ms:** max 196 ms (einmalig, 4-Kachel-Komposit nach Schnell-Zoom);
   Real-Device-Vorbehalt V-SAT-12. ✔

### §10.6 V-Katalog (Fortschreibung)

- **V-SAT-9** (SAT2b): **umgesetzt** — SWIR + dNBR auf demselben Leser, Gate GSAT2b.
- **V-SAT-12** (neu): 196-ms-Task beim 4-Kachel-dNBR-Komposit liegt nahe am Gate — auf einem
  Real-Device nachmessen; Eskalationsweg bleibt der LE2-Worker (`hdf5OffMain`-Muster), nicht
  vorauseilend bauen.
- **V-SAT-13** (neu): SCL-Wolkenmaske (eigenes 20-m-Band gleicher Bauart) würde Wolken/Schatten
  aus dem dNBR-Overlay maskieren und die Feld-Sprenkel ließen sich per Landbedeckung dämpfen —
  eigene Folgeentscheidung (Jans Gate), der Satz benennt die Lücke solange.
- V-SAT-10 (Wisch-Vergleich) und **V-SAT-11** (Historie-Dossier existiert mobil nicht —
  Altbestand BD2f) bleiben offen.

## §11 SAT2c — SCL-Szenenklassifikation am dNBR-Overlay (V-SAT-13; Jans Go 2026-09-02)

Jans Auftrag: „V-SAT-13: eine SCL-Wolkenmaske (gleiches Band-Format) würde Wolken/Schatten aus dem
Overlay maskieren und die Feld-Sprenkel per Landbedeckung dämpfen." Die Sonden haben beide Hälften
des Auftrags an den echten Szenen GEMESSEN — und die zweite Hälfte widerlegt.

### §11.1 Sondenbefunde (2026-09-02, echte Endpunkte, Hürtgenwald-Fenster 3 × 3 km)

**(1) Das SCL-Band ist ein Leser-Zwilling der dNBR-Bänder.** `scl`-Asset auf beiden Szenen
(24.08. + 25.07., 31UGS): derselbe Bucket, EXAKT das 20-m-Gitter von B8A/B12 (5490²,
Transform `[20,0,699960,0,-20,5700000]`), uint8 · nodata 0 · Deflate · Predictor 2 · 1 Kanal,
alle IFDs in den ersten 16 KB, Pyramide 5490/2745/1373/687 (+ eine 344er-Ebene, die keinen
dNBR-Partner hat) mit denselben Kachelgrößen 512/256 wie B8A/B12 ⇒ **deckungsgleiche Kachel-
Indizes auf allen gepaarten Ebenen, kein Resampling**. Der vorhandene uint8-Pfad `decodeTile`
(liest 1–3 Kanäle) dekodiert die Kacheln UNVERÄNDERT; eine Vollkachel kostet 5–12 KB.
Kein `classification:classes`-Feld im STAC — die Klassenbedeutung ist die Sen2Cor-Konvention
(0 nodata · 1 saturiert · 2 dunkel · 3 Wolkenschatten · 4 Vegetation · 5 unbewachsen · 6 Wasser ·
7 unklassifiziert · 8 Wolke mittel · 9 Wolke hoch · 10 dünner Zirrus · 11 Schnee).

**(2) Eine binäre Wolkenmaske der NACHHER-Szene löscht am realen Ereignis 100 % des Signals.**
Kreuztabelle Nachher-SCL (24.08.) × dNBR-Klasse im Narbenfenster: JEDES Pixel mit dNBR ≥ 0,27
liegt unter Klasse 10 „dünner Zirrus" (571 + 10 px) oder 8 „Wolke mittel" (65 px) — die Szene
trägt großflächig Zirrus-Klassifikation, obwohl die Narbe im Bild klar sichtbar ist und der
Goldwert 0,600 dort GEMESSEN wurde (§10.1 (2)). Wer die Klassen 8/9/10 der Nachher-Szene
transparent schaltet, löscht die Narbe. Klasse 9 („Wolke hoch") betrifft 4 px, Klasse 3
(Schatten) 0 px.

**(3) Die VORHER-Szene ist der sichere Ort für eine harte Maske.** Vor dem Brand existiert die
Narbe nicht — dort kann eine Wolken-/Schattenklasse nie Brandsignal sein, sie macht den
NBR-Vergleich am Pixel nur bedeutungslos. Am Ereignis ist die Vorher-Szene sauber (93,1 %
Vegetation, 6,9 % unbewachsen) ⇒ die Maske ändert dort 0 Pixel; an schlechteren Vorher-Szenen
(die Wahl lässt bis 40 % Granulat-Wolke zu) entfernt sie genau die falschen Ursachen.

**(4) Die „Landbedeckungs-Dämpfung per SCL" ist widerlegt.** SCL kennt KEINE Wald-Klasse:
im Juli tragen die Felder Bewuchs und heißen „Vegetation" (4) wie der Wald (Sprenkel-Pixel
0,10–0,27: 3 963 auf Vorher-Klasse 4, nur 125 auf Klasse 5 — schon kahle Felder sprenkeln
ohnehin kaum, weil beide Szenen kahl sind). Und die Gegenprobe am wolkenfreien Brandtag
(14.08., 0 % Wolke) zeigt: **die frische Brandfläche selbst wird Klasse 5 „unbewachsen"**
(355 + 7 px der hohen dNBR-Klassen; Rest Klasse 4) — exakt die Klasse eines Stoppelfelds.
Jede SCL-basierte Dämpfung „unbewachsener" Flächen dämpft die Narbe mit. Eine echte
Landbedeckungsquelle je Pixel (z. B. CORINE-Raster) wäre eine NEUE Datenquelle ⇒ V-SAT-14,
Jans Gate.

### §11.2 Entscheidungen (aus den Messungen, nicht aus dem Auftragstext)

- **E1 — Vorher-Szene hart maskieren:** Klassen 1/3/6/8/9/10/11 (saturiert, Schatten, Wasser,
  alle Wolken, Schnee) ⇒ Pixel transparent. Beweisbar sicher (keine Narbe vor dem Brand).
- **E2 — Nachher-Szene NIE binär löschen:** nur die eindeutigen Nie-Narbe-Klassen 1/6/11 hart;
  die Wolken-/Schattenklassen 3/8/9 setzen die dNBR-Farbe auf **halbe Deckkraft** („blasser =
  dort kann das Signal Wolke oder Schatten statt Brand sein"); Klasse 10 (dünner Zirrus) bleibt
  UNANGETASTET — sie ist per Definition semitransparent und trägt am Ereignis die gesamte
  sichtbare Narbe. Klasse 2 („dunkel") bleibt ebenfalls unangetastet (Verwechslungsrisiko mit
  frischer, dunkler Narbe).
- **E3 — keine Landbedeckungs-Dämpfung** (§11.1 (4)); der Ernte-Satz bleibt, der Masken-Satz
  benennt, was die Klassifikation kann und was nicht.

### §11.3 Plan

1. `burnIndex.ts` additiv: SCL-Prädikate `sclPreMasked`/`sclPostMasked`/`sclPostUnsure` +
   `dnbrTileRgba(…, preScl?, postScl?)` (ohne SCL byte-gleiches Verhalten), Verify-Erweiterung.
2. `fireSatImagery.ts`: `S2CogRef.bands` trägt zusätzlich `scl: string | null` — optional,
   ein fehlendes SCL-Asset lässt SWIR/dNBR unverändert arbeiten (nie alles-oder-nichts über
   die Maske).
3. `FireCogViewer.tsx`: SCL-Header + -Kacheln (eigener uint8-Kachel-Cache) nur im dNBR-Modus,
   Ebenen-Paarung über Breite + Kachelgröße wie gehabt; ein SCL-Ausfall (Netz, Gitter) darf den
   dNBR-Modus NIE brechen ⇒ benannter stiller Verzicht, der Satz sagt dann „ohne Wolkenmaske".
   Satz + Legende benennen Maske und Blasser-Regel.
4. Verifier-Sonden, `docs/API.md`, Gate GSAT2c mit Browser-Belegen am Ereignis (Narbe bleibt,
   Netzkosten, Konsole, Mobil unverändert).

### §11.4 Umsetzung + Gate GSAT2c (gemessen 2026-09-02, Prod-Preview)

**Gebaut (additiv, exakt der Plan §11.3):** `burnIndex.ts` +`sclPreMasked`/`sclPostMasked`/
`sclPostUnsure` + `dnbrTileRgba(…, preScl?, postScl?)` (ohne SCL byte-gleich — im Verify als
Gleichheitsprobe); `fireSatImagery.ts`: `bands.scl` OPTIONAL (fehlendes SCL-Asset lässt
SWIR/dNBR unverändert, Sonde); `FireCogViewer.tsx`: SCL-Header + -Kacheln fehlertolerant
(jeder Abruf mit `catch ⇒ null` — ein SCL-Ausfall nimmt nur die Maske, nie das Overlay),
eigener uint8-Kachel-Cache (Deckel 32), `DnbrLevel.preScl/postScl` über dieselbe
Ebenen-Paarung, `sclMask`-Flag steuert Satz + Legenden-Chip („blasser: Wolke/Schatten
nachher möglich" — nur bei aktiver Maske).

**Browser-Belege (Hürtgenwald 24.08., Prod-Preview :5206):**
- **Die Narbe bleibt** — der Überblick (5 km) zeigt sie unverändert als kompakte rot-violette
  Fläche am Fadenkreuz, im 1-km-Zoom flächig in den starken Klassen mit sichtbar blasseren
  Flecken (= Klasse-8-Markierung; `sat2c-dnbr-maske.png`, `sat2c-dnbr-zoom.png`). E2 hat
  gehalten: eine binäre Maske hätte hier alles gelöscht (§11.1 (2)).
- Satz: „… Wolken/Schatten laut Szenenklassifikation: in der Vorher-Szene maskiert, in der
  Nachher-Szene blasser dargestellt (dünner Zirrus läuft durch) …"; Legende trägt den
  Blasser-Chip zusätzlich zu den vier Klassen.
- **Netz:** +2 SCL-Dateien (Vorher + Nachher, je 1 Header + 4 Kacheln = 10 Abrufe, Kacheln
  5–12 KB ⇒ ≈ 60–90 KB Zusatz), weiterhin NUR earth-search + sentinel-cogs, 0 Netlify-Bytes;
  Sitzung bis 1-km-Zoom: 32 Kacheln · 15,6 MB (Statuszeile = fetch-Zähler).
- **Long Tasks beim 4-Stufen-Zoom bis Vollauflösung: max 52 ms**; Konsole **0 Fehler /
  0 Warnungen**.
- **Mobil (375-px-Anforderung, real 500 px `innerWidth`, `matchMedia(max-width:767)` = true):**
  0 px Überlauf; KEINE neuen Touch-Ziele (der Legenden-Chip ist Text, `.br-cog-legend` hat
  `flex-wrap: wrap`). Das Historie-Dossier existiert mobil weiterhin nicht (V-SAT-11,
  Altbestand — die Bühne ist dort versteckt, der Viewer unerreichbar).

`verify:fire-detail` **212/212** (+13: 4 burnIndex-SCL-Regeln inkl. Byte-Gleichheit ohne SCL,
2 STAC-scl-Sonden, 7 Text-Sonden auf Fehlertoleranz/Paarung/Satz/Legende), typecheck grün,
Build grün, Budget totalJs 1 083,0/1 109,8 (+0,4 KB, KEINE Ratsche; eagerJs 103,1 unverändert).

### §11.5 Fünf Selbstverifikations-Fragen (Gate GSAT2c)

1. **Funktionserhalt einzeln:** Echtfarbe/SWIR unangetastet (kein Codepfad berührt), dNBR ohne
   SCL byte-gleich zu SAT2b (Verify-Gleichheitsprobe + optionales Feld), `?sat10=0`/SAT1
   unverändert; die Narbe am Ereignis bleibt sichtbar. ✔
2. **Desktop pixelgleich außerhalb des Neuen:** Änderungen nur im dNBR-Overlay + dessen
   Satz/Legende. ✔
3. **Touch-Ziele ≥ 44 px:** keine neuen Ziele; 0 px Überlauf mobil. ✔
4. **Konsole sauber:** 0/0 im Prod-Preview-Lauf. ✔
5. **Keine Long Tasks > 200 ms:** max 52 ms (Zoom bis Vollauflösung mit Maske). ✔

### §11.6 V-Katalog (Fortschreibung)

- **V-SAT-13**: **umgesetzt in der gemessenen Form** — SCL-Maske asymmetrisch (Vorher hart,
  Nachher blasser statt gelöscht, Zirrus läuft durch); die „Landbedeckungs-Dämpfung" aus dem
  ursprünglichen Wortlaut ist WIDERLEGT (§11.1 (4)) und wurde nicht gebaut.
- **V-SAT-14** (neu): Ernte-Sprenkel-Dämpfung bräuchte eine echte Landbedeckungsquelle je
  Pixel (z. B. CORINE-Raster clientseitig) — neue Datenquelle, eigene Entscheidung (Jans
  Gate); bis dahin trägt der Satz die Lücke.
- V-SAT-10 (Wisch-Vergleich), V-SAT-11 (Historie-Dossier mobil, Altbestand BD2f) und
  V-SAT-12 (Real-Device-Task) bleiben offen.

## 12. SAT2d — Landbedeckungs-Dämpfung der Ernte-Sprenkel (V-SAT-14, Jans Go 2026-09-02)

Jans Auftrag: „setze das jetzt um: V-SAT-14 (Landbedeckungsquelle für die Sprenkel-Dämpfung)" —
damit ist das in §11.6 benannte Gate geöffnet. SAT2c hatte gemessen, dass die SCL diese Aufgabe
NICHT erfüllen kann (keine Wald-Klasse, Narbe selbst wird Klasse 5); gebraucht wird eine echte
Landbedeckungsquelle je Pixel, clientseitig, ohne Schlüssel, ohne Netlify-Bytes.

### 12.1 Sondenbefunde (Skripte `sat2d-probe1…6.mjs`, 2026-09-02)

1. **ESA WorldCover 2021 v200 ist die Quelle** (10 m global, CC BY 4.0): die 3°-Kachel-COGs
   sind EXAKT die Bauart, die der SAT2a-Leser schon kann — uint8 · ein Band · Deflate (comp 8)
   · Predictor 1 · 1024²-Kacheln · volle Pyramide 36000/18000/9000/4500/2250/1125/562 px
   (≈ 9,3/18,5/37/74/148 m/px N-S), ganze Kachel N48E006 nur 94,2 MB, IFDs brauchen
   18 828 B (16-KB-Header ⇒ `needMoreBytes`, der vorhandene 64-KB-Retry-Pfad greift).
   Gitter ist **EPSG:4326** (3°/36000 = 9,26 m N-S je Pixel), Kachelname = SW-Ecke im
   3°-Raster (`N48E006`), deterministisch aus lat/lon — kein STAC nötig.
2. **Der AWS-Bucket ist CORS-los** (`esa-worldcover.s3.eu-central-1.amazonaws.com`: ACAO null
   trotz Origin, Preflight 403) — der direkte Browser-Weg scheitert, obwohl Range 206 geht.
3. **Microsoft Planetary Computer liefert DIESELBE Datei byte-identisch** (94 225 409 B) mit
   vollem CORS: Token-Endpunkt `…/api/sas/v1/token/esa-worldcover` anonym + `ACAO *`
   (SAS-Token ~1 h gültig, Feld `msft:expiry`), Azure-Blob
   `ai4edataeuwest.blob.core.windows.net/esa-worldcover/v200/2021/map/ESA_WorldCover_10m_2021_v200_<Kachel>_Map.tif?<token>`
   mit Range 206 + `ACAO *` + Preflight-OK für `range`. **Alle DACH-Landkacheln existieren**
   (N45…N54 × E003…E015 per HEAD geprüft; einzig N54E003 = offene Nordsee 404 — der
   Fehlertoleranzpfad deckt das). jsDelivr könnte ebenfalls Range (206, am Daten-Repo
   gemessen) — als Spiegel-Reserve notiert, nicht gebraucht.
4. **Fachliche Eignung, an den echten Szenen gemessen** (31UGS, 24.08. vs 25.07., Kreuztabelle
   WorldCover-Klasse × dNBR): über der Zülpicher Börde (10 × 10 km reines Kulturland) tragen
   **13,4 % der Acker-Pixel** ein falsches Signal ≥ 0,27 (22 847 px ≈ 9 km² „Brand", Ernte +
   Zirrus überlagert), „bebaut" unter demselben Zirrus nur 2,8 % — die Sprenkel sind real und
   liegen auf Acker. **Aber:** an der Narbenzone selbst liegt das echte Signal auf Baum UND
   **Gras** (die Hürtgenwald-Fläche ist teils Heide — WorldCover sagt am Goldnarbenpixel
   Klasse 30), und im 2–5-km-Umfeld erzeugt der Zirrus auch auf Baumbestand Fehlsignal
   (das dämpft bereits die SCL-Maske, nicht die Landbedeckung). ⇒ Eine „Nur-Wald"-Dämpfung
   würde echte Gras-/Heide-Narben dämpfen; gedämpft werden dürfen nur Klassen, auf denen
   ein Vegetationsbrand-Signal unwahrscheinlicher ist als Ernte/Nutzung.
5. **Perf-Falle gemessen:** die exakte UTM→Grad-Umtastung (`utmInv`) je Pixel kostet
   **51,5 ms je 256²-Kachel** — über 4–8 Kacheln ein Long-Task-Risiko. Ein 16er-Stützgitter
   (17×17 = 289 `utmInv`-Aufrufe) + bilineare Interpolation der Gradwerte kostet < 1 ms;
   der Interpolationsfehler über 320-m-Spannen ist ≪ 1 WorldCover-Pixel.

### 12.2 Entscheidungen

- **E1 — Dämpfung, nie Löschung, und nur auf Nicht-Wildvegetation:** halbe Deckkraft
  (dasselbe `al >> 1` wie die SCL-Nachher-Maske) für WorldCover-Klassen **40 Acker ·
  50 bebaut · 60 vegetationsarm · 70 Schnee/Eis · 80 Wasser**; volle Deckkraft für
  10 Baum · 20 Strauch · 30 Gras · 90 Feuchtgebiet · 95 Mangrove · 100 Moos/Flechte und
  für 0/unbekannt/Ausfall. Begründung: Getreidefeld- und Nutzungsbrände EXISTIEREN —
  blasser heißt „dort ist Ernte/Nutzung wahrscheinlicher als Brand", nicht „kein Brand".
  Die Karte ist Stand 2021 (vor dem Brand) — genau deshalb funktioniert sie, wo die SCL
  scheiterte: die Vor-Brand-Bedeckung der Narbe ist Wald/Heide, nie „unbewachsen".
- **E2 — Transport Planetary Computer, fehlertolerant wie die SCL:** anonymer SAS-Token
  (Sitzungs-Cache mit Ablauf-Wächter, Fehlschlag nicht memoiert), Range-Reads mit dem
  vorhandenen `cogTiff`-Leser; JEDER Abruf catch ⇒ null — ein Ausfall (Token, Blob,
  Dekode, Nordsee-404) nimmt nur die Dämpfung, nie das Overlay; ohne WorldCover ist die
  Ausgabe byte-gleich zu SAT2c. Kill-Switch `?wc=0` / `localStorage.wc` (neue externe
  Quelle ⇒ Rule 2).
- **E3 — Ebenen-Paarung + Umtastung:** je dNBR-Anzeigeebene die WorldCover-Ebene über
  `pickLevel` (20→18,5 · 40→37 · 80→74 · 160→148 m/px); Umtastung nächster Nachbar über
  das 16er-Stützgitter (12.1 (5)); Kachelwahl je Pixel (ein Fenster kann die 51°-Grenze
  zwischen zwei 3°-Kacheln schneiden — 31UGS tut es).
- **E4 — Ehrlichkeit + Lizenz:** Satz und Legenden-Chip nur bei aktiver Dämpfung
  („blasser: Acker/Siedlung — Ernte statt Brand möglich"), Quelle + CC BY 4.0 im Satz;
  Lizenzregister-Eintrag. Ohne WorldCover bleibt der bisherige Ernte-Satz stehen.

### 12.3 Plan

`worldCover.ts` (neu, pur + Token/URL-Helfer + `verifyWorldCover`) → `burnIndex.ts` additiv
(`dnbrTileRgba(…, wcCls?)`, kombinierte Blasser-Regel mit der SCL — einmal halbieren, nie
vierteln) → `FireCogViewer.tsx` (WC-Header/-Kachel-Caches nach dem SCL-Muster, Stützgitter-
Umtastung je dNBR-Kachel, Bytes in der Statuszeile, `wcMask`-Flag, Satz + Chip) →
Lizenzregister + `docs/API.md` → Verifier `[wc]` → Browser-Beleg + Gate GSAT2d.

### 12.4 Umsetzung + Gate GSAT2d (2026-09-02)

Gebaut additiv, exakt nach Plan §12.3:

- **`src/fire/detail/worldCover.ts`** (neu, DOM-frei): Kachelname/Blob-URL/Pixel-Lage
  (`wcTileName`/`wcMapUrl`/`wcLocate`), Token-Cache mit Ablauf-Wächter (`fetchWcToken`,
  Fehlschlag nie memoiert), Geo-Stützgitter `wcGeoGrid` (16er-Raster + bilinear, im Verifier
  gegen die exakte Inverse ≤ 0,5 m belegt), Header-/Kachel-Caches (FIFO-Deckel 16, Fehlversuche
  werden entmemoiert) und `prepareWcSampler` (Verfügbarkeitsprobe = Token + Kachel des
  Brandpunkts; der Sampler wählt die WC-Ebene je Anzeigeauflösung über `pickLevel`, die vier
  Blockecken finden jede geschnittene 3°-Kachel — 31UGS schneidet die 51°-Grenze wirklich).
  Kill-Switch `?wc=0` / `localStorage.wc`. `WC_ATTRIBUTION` trägt den CC-BY-Pflichttext.
- **`burnIndex.ts`**: `wcDamped()` neben den SCL-Prädikaten (EINE Stelle für alle
  dNBR-Anzeigeregeln), `dnbrTileRgba(…, wcCls?)` additiv — SCL-Unsicherheit und
  Landbedeckung halbieren zusammen genau EINMAL (`al >> 1`), ohne `wcCls` byte-gleich
  (Verify-Gleichheitsprobe).
- **`FireCogViewer.tsx`**: der dNBR-Effekt entscheidet die Dämpfung VOR dem ersten
  Kachelbau (`prepareWcSampler` im selben await-Zug wie die Ebenen-Paarung — sonst mischte
  die Sitzung gedämpfte und ungedämpfte Kacheln), der Bitmap-Schlüssel trägt `|wc`,
  `loadDnbrTile` holt die Klassen je Kachel fehlertolerant (`catch ⇒ null` nimmt nur die
  Dämpfung), WC-Bytes zählen in die ehrliche Statuszeile; Satz nennt Quelle + Lizenz
  („auf Acker, Siedlung und anderen Nicht-Wildvegetationsflächen (ESA WorldCover 2021,
  CC BY 4.0) blasser …"), ohne WorldCover bleibt der bisherige Ernte-Satz; Legenden-Chip
  „blasser: Acker/Siedlung — Ernte statt Brand möglich" nur bei aktiver Dämpfung.
- **Lizenzregister** (`scripts/seo/licenses.mjs`): ESA-WorldCover-Eintrag mit Pflichttext,
  Transportweg und CORS-Befund; **`docs/API.md`**: SAT2d-Nachtrag mit Token-Weg und Messwerten.

**Belegt (Prod-Preview :5208, isolierte Kontexte, Hürtgenwald 24.08. vs 25.07.):**

1. **Wirkung im Bild, numerisch:** dieselbe 5-km-Sicht mit/ohne Dämpfung per Canvas-Abtastung
   (96×77) verglichen — **7,1 % der Bildpixel sichtbar blasser** (523/7392, davon 109 stark),
   der **Narbenkern ±8 px ums Fadenkreuz: 0/272 Pixel verändert**. Die Dämpfung trifft
   Felder/Siedlung, nie die Narbe (`sat2d-diff.mjs`; Screenshots `sat2d-dnbr-wc.png`,
   `sat2d-dnbr-ohne-wc.png`, `sat2d-dnbr-zoom.png`).
2. **Satz + Legende:** WC-Satz mit Quelle/Lizenz und BEIDE Blasser-Chips bei aktiver Maske;
   mit `?wc=0` fällt der Satz auf den Ernte-Satz zurück, nur der SCL-Chip bleibt.
3. **Netz:** genau **1 Token-Abruf (planetarycomputer) + 7 Blob-Abrufe (ai4edataeuwest:
   1 Header 64 KB + 6 Kacheln)** für die 5-km-Sicht — Status-Delta zur Kontrollsicht
   **6 Kacheln / ≈ 0,5 MB**; beim Zoom auf 1 km kommen KEINE weiteren WC-Kacheln (dieselbe
   18,5-m-Ebene deckt die Sicht). `?wc=0` ⇒ **0** WC-Anfragen. 0 Netlify-Bytes.
4. **Konsole:** 0 neue Fehler/Warnungen (nur Altbestand: GeoSphere-404, EMS-CORS; die
   aria-hidden-Warnung der offstage-Hauptkarte ist der BD2-Bühnenwechsel, nicht SAT2d —
   sie erscheint auch ohne geöffneten Viewer).
5. **Long Tasks:** beim 5-stufigen Zoom bis zur Vollauflösung max **52 ms** (52/50) —
   die Stützgitter-Interpolation ist unter der Messschwelle (die exakte Inverse hätte
   51,5 ms JE KACHEL gekostet, §12.1 (5)).
6. **Headless:** `verify:fire-detail` **237/237** (+25: 9 worldCover-Selbstprüfungen,
   4 neue burnIndex-Checks, 12 Text-/Doku-Sonden), typecheck grün, Build grün, Budget
   totalJs **1 085,1/1 109,8** (+2,1 KB, alles im Lazy-Viewer-Chunk, KEINE Ratsche;
   eagerJs unverändert).

### 12.5 Selbstverifikation (Gate-Fragen)

1. **Funktionserhalt:** ✔ — ohne WorldCover (Kill-Switch, Token-Ausfall, Nordsee-404) ist das
   Overlay byte-gleich zu SAT2c (Verify-Gleichheitsprobe + Kontrolllauf `?wc=0`: Ernte-Satz,
   SCL-Chip, Narbe identisch); SAT1/SAT2a/b/c-Wege unangetastet.
2. **Desktop-Regression:** ✔ — außerhalb des dNBR-Modus ändert sich kein Pixel (die Dämpfung
   hängt nur am dNBR-Kachelbau); im dNBR-Modus ist die Änderung die beabsichtigte.
3. **Touch-Ziele:** ✔ — SAT2d fügt KEIN interaktives Ziel hinzu (der Legenden-Chip ist Text
   im `flex-wrap`-Container der bestehenden Legende).
4. **Konsole:** ✔ — 0 neue Fehler/Warnungen (Beleg 12.4 (4)).
5. **Long Tasks:** ✔ — max 52 ms (Beleg 12.4 (5)).

### 12.6 V-Katalog

- **V-SAT-14 ist umgesetzt** — in der GEMESSENEN Form: Quelle ESA WorldCover 2021 statt
  CORINE (Leser-kompatible COGs, 10 m, CC BY 4.0; CORINE-Raster hätten einen neuen
  Leser + Lambert-Umtastung gebraucht), Transport Planetary Computer (der ESA-Bucket ist
  CORS-los), und gedämpft wird NICHT „außerhalb von Wald", sondern nur außerhalb von
  Wildvegetation — die Hürtgenwald-Narbe liegt teils auf Klasse 30 „Gras" (Heide).
- **V-SAT-15** (neu): der SAS-Token läuft ~1 h — eine lange offene Dossier-Sitzung, die
  NACH Ablauf erstmals zoomt, holt still einen frischen Token (gebaut); sollte der
  Planetary-Computer-Dienst dauerhaft entfallen, wäre der gemessene jsDelivr-Range-Weg
  der benannte Ersatz — **umgesetzt als SAT2e, §12.7** (eigenes statisches Repo statt
  Daten-Repo, 37-m-Ebene statt „der benötigten Ebenen" — Begründung dort).
- V-SAT-10 (Wisch-Vergleich), V-SAT-11 (Historie-Dossier mobil, Altbestand BD2f) und
  V-SAT-12 (Real-Device-Task) bleiben offen.

## 12.7 SAT2e — V-SAT-15 umgesetzt: eigener jsDelivr-Spiegel als benannter Ersatzweg (2026-09-03, Jans „mache das")

**Fallback-Ordnung nach dieser Phase:** PC (10 m, Primärweg, unverändert) → **eigener Spiegel
(37 m, jsDelivr, Sitzungs-Latch)** → aus (heutiges Verhalten). Erst wenn BEIDE Wege hart
ausfallen, verliert das dNBR-Overlay die Dämpfung — und auch dann nur die Dämpfung.

### 12.7.1 Sondenbefunde (vor dem Bau bzw. am Bau gemessen)

1. **Die Dateigrenze erzwingt die 37-m-Ebene:** jsDelivr liefert von GitHub max. 20 MB je Datei
   (Range 206 am Daten-Repo gemessen, §12.1 (3)). An N48E006: ganze Datei 94,2 MB, 18000-px-Ebene
   22,9 MB (beide drüber), **9000-px-Ebene 8,3 MB — passt**. ⇒ je Kachel EINE Ein-Ebenen-TIFF.
2. **Nicht ins Daten-Repo** (Abweichung vom V-Eintrag-Wortlaut „Daten-Repo-Spiegel", mit
   Arithmetik): buscosun-data trägt ~60–70 MB (ICON-Läufe KEEP 4 + Radar-Retention) und wird von
   zwei Schreibern force-gepusht; +116 MB WorldCover sprengen die 150-MB-Paketgrenze. ⇒ eigenes
   **statisches Repo `jppetry/buscosun-worldcover`**, EIN unveränderlicher Commit, Client pinnt
   den Commit-SHA (BW-2-Muster). Keine Actions, kein Workflow — statische Dateien sind der
   jsDelivr-Normalfall, der ToS-Satz „Actions as CDN" fällt hier gar nicht an.
3. **Größen aller 17 DACH-Kacheln, im Vollbau gemessen** (AWS-Bucket per Range, Node — CORS
   betrifft nur den Browser): N45 E003 8,62 · E006 8,56 · E009 8,56 · E012 6,89 · E015 7,56 —
   N48 E006 7,93 · E009 8,07 · E012 8,21 · E015 7,49 — N51 E003 4,47 · E006 8,45 · E009 7,36 ·
   E012 6,59 · E015 6,71 — N54 E006 1,65 · E009 5,08 · E012 3,57 MB. **Summe 115,78 MB** —
   größte Datei 8,62 MB, beide Budgets mit Luft; das geplante Druckventil (N51E003 → N45E003 →
   N51E015) wird nicht gebraucht. Kachelliste mit Randbegründung: N45E003 (CH-Westzipfel Genf
   lon 5,96) · N51E003 (DE-Westzipfel Selfkant lon 5,87) · N51E015 (DE-Ostzipfel Neißeaue
   lon 15,04); ausgeschlossen N48E003 (nur F/B/L), N54E003 (offene Nordsee, 404 gemessen
   §12.1 (3)), N54E015 (kein DACH-Land östlich 15° über 54° N).
4. **Remux statt Re-Encode ist beweisbar verlustfrei:** die Kachel-Nutzlasten der 9000er-Ebene
   sind fertige zlib-Deflate-Blöcke — sie werden verbatim in eine neue Ein-IFD-Datei kopiert
   (nur neue Offsets), und der UNVERÄNDERTE Leser (`parseCogIfds`/`decodeTile`) liest beides.
   Der Producer beweist das je Kachel am Objekt (3 Stichproben-Kacheln dekodiert byte-gleich),
   der Verifier headless am synthetischen Rundlauf inkl. Verbatim-Vergleich der Nutzlasten.
5. **PowerShell-npm-Falle erneut belegt:** `npm run wc:mirror -- --probe` reichte `--probe`
   nicht durch (bekannte Lehre AF0) — statt der Header-Probe lief der Vollbau. Folgenlos, weil
   der Vollbau dieselben Budget-Asserts trägt; reine Proben direkt mit
   `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fire/wc/build-wc-mirror.mjs --probe`.

### 12.7.2 Entscheidungen

- **E1 — Latch nach RD2-Muster, aber sofortiger Durchfall:** 2 harte Fehler (nur geworfene
  fetches — Netz/Timeout; ein 404 wie die Nordsee zählt NIE) latchen einen Weg für die Sitzung.
  Der ERSTE PC-Fehler fällt aber im selben Aufruf zum Spiegel durch — sonst bliebe der erste
  Render ohne Dämpfung, obwohl der Ersatzweg bereitsteht. Die Sampler-Closure läuft je Aufruf
  durch die Wegwahl `wcSource()` ⇒ ein Kipp mitten in der Sitzung (Token-Ablauf + PC weg)
  wandert transparent.
- **E2 — Schlüssel tragen den Weg:** Header-/Kachel-Caches (`via`-Präfix) und die
  dNBR-Kachelschlüssel (`|wc` = PC, `|wcm` = Spiegel) trennen 10-m- von 37-m-gedämpften
  Kacheln — ein Kipp mischt nie beide unter einem Schlüssel. Transiente Ausnahme (akzeptiert,
  dokumentiert): die eine Kachel, die beim Kipp gerade im Flug ist.
- **E3 — Ehrlichkeit:** im Spiegel-Fall trägt der Satz den Zusatz „Landbedeckung hier aus dem
  eigenen Spiegel (37 m statt 10 m)", genau EINE console-Zeile nennt den Wegwechsel (RD2-Muster).
  Quelle + Lizenz bleiben identisch (es SIND WorldCover-Daten); die CC-BY-4.0-Attribution steht
  zusätzlich im Spiegel-README und in `wc-mirror.json` (Lizenzpflicht).
- **E4 — Schalter:** `?wcm=1` erzwingt den Spiegel (Beleg/Debug), `?wcm=0` schaltet den
  Ersatzweg ab; Query schlägt `localStorage.wcm` in beide Richtungen. `?wc=0` bleibt der
  Alles-aus-Schalter ÜBER der Wegwahl (Rule 2: PC gesund ⇒ Abrufstrom byte-identisch zu SAT2d).
- **E5 — Sticky-404-Disziplin:** der Client pinnt den Commit-SHA (nie `@main`), und KEIN
  Abruf — auch kein Browser-Test — berührt die Spiegel-URL, bevor der Commit auf GitHub liegt
  (jsDelivr hält vorzeitig angefragte 404 fest, RD2-Lehre). Der SHA steht schon fest
  (`cc3ce5590dd47a0fe002338607ba7c0b07ce9ea4` — lokal committet, ein Push ändert ihn nicht).

### 12.7.3 Umsetzung

- `cogTiff.ts` additiv: `writeTiledTiff` (exportiert) = die IFD-/Layout-Hälfte des
  Fixture-Writers, nimmt vorkomprimierte Kacheln; alle bestehenden Fixture-Rundläufe beweisen
  ihn mit. `scripts/fire/wc/wcRemux.mjs` (`remuxWcLevel` pur mit injiziertem `readRange`,
  `assertWcLevelContract` = lauter Abbruch bei Vertrags-Drift) +
  `scripts/fire/wc/build-wc-mirror.mjs` (npm `wc:mirror`; `--probe`/Vollbau/`--check`,
  Budget-Asserts hart, Range-Läufe koalesziert, README + `wc-mirror.json` mit sha256).
- `worldCover.ts`: `WC_MIRROR_SHA`/`WC_MIRROR_BASE`/`wcMirrorUrl`, `wcMirrorFlag`,
  `wcSource()` als DIE Wegwahl-Stelle, Latches + `wcVia()` + `_resetWc()`, `wcFetchRange`
  (Latch-Buchführung nur für geworfene Abrufe; 200-statt-206-Härtung schneidet den Ausschnitt
  selbst), Verfügbarkeitsprobe max. 3 Runden mit Abbruch bei definitiver Antwort.
- `FireCogViewer.tsx`: `WcTileArgs.via`, `wcKeySuffix`, `wcSrcVia`-State (gesetzt nach der
  Vorbereitung, beim Draw aufgefrischt), Satz-Zusatz nur unter `wcSrcVia === 'mirror'`.
- Verifier: +24 Checks (`[wc]`-Modulchecks: Spiegel-URL-Form, Flag-Wahrheitstafel, Latch,
  Ein-IFD-`pickLevel`, `wcVia`; `[wcm]`: Remux-Rundlauf headless byte-gleich + Verbatim-Beweis,
  Vertrags-Abbruch, `codeOnly`-Sonden auf via-Schlüssel/console-Zeile/Härtung/Begrenzung,
  Producer-/Doku-Sonden); zwei bestehende `[wc]`-Sonden im selben Zug nachgezogen (der
  `|wc`-Schlüssel-Regex und die `_tok = null`-Negativsonde, die auf `_resetWc` ansprang).
- Doku: API.md §8.8 SAT2e-Nachtrag, Lizenzregister-Ergänzung, dieser Abschnitt.

**Headless belegt:** `verify:fire-detail` **261/261** (+24), `typecheck` grün, `npm run build`
grün, Budget totalJs **1 085,8/1 109,8** (+0,7 KB im Lazy-Chunk, keine Ratsche). Spiegel-Baum
gebaut und lokal committet (`.cache/wc-mirror/repo`, 17 Kacheln · 115,78 MB · Commit
`cc3ce559…`), jede Kachel beim Bau mit 3 dekodierten Stichproben byte-gleich zur Quelle.

### 12.7.4 Gate GSAT2e — gemessen (2026-09-03, Prod-Preview, Hürtgenwald-Ereignis 16.08.)

Repo `jppetry/buscosun-worldcover` von Jan angelegt, Commit **`cc3ce559…` gepusht** (SHA am Origin
gegen den Client-Pin geprüft: identisch). Danach — und erst danach (E5) — die Belege:

1. **CDN-Vertrag:** Range-Anfrage auf die echte 8-MB-Kachel ⇒ **206**, exakt 65 536 B,
   `ACAO: *`, `cache-control: … immutable`. Im **Browser** (Cross-Origin-`fetch` aus der App):
   206 mit exakter Byte-Zahl, TIFF-Magic `II/42` — der Range-Header ist safelisted, **kein
   Preflight blockiert** (der explizite OPTIONS liefert zwar leere `allow-headers`, das ist
   folgenlos, weil `bytes=a-b` ein „simple range" ist). `wc:mirror --check`: Kachel 40 von
   N48E006 vom CDN **byte-gleich** zur AWS-Quelle.
2. **Spiegel erzwungen (`?wcm=1`):** 3 jsDelivr-Abrufe (299 KB: Header + 2 Kacheln),
   **0 Anfragen an Planetary Computer/Azure**; Dämpfung sichtbar, Legenden-Chip da, Satz trägt
   Quelle + CC BY 4.0 **und den Zusatz „— Landbedeckung hier aus dem eigenen Spiegel (37 m statt
   10 m)"**; genau EINE console-Zeile („Spiegel erzwungen"). Beleg
   `brandradar-satellitenbilder/sat2e-spiegel-wcm1.png`.
3. **PC gesund (Rule 2):** **0 jsDelivr-WC-Abrufe**, 1 Token + 1 Blob wie vor der Phase,
   Dämpfung aktiv, **kein** Spiegel-Satz ⇒ der Normalfall ist unverändert.
4. **PC-Ausfall simuliert** (`fetch` wirft für `planetarycomputer.*` + `ai4edataeuwest.*`):
   7 blockierte PC-Aufrufe, Latch kippt, **2 jsDelivr-Abrufe (187 KB)**, Dämpfung läuft weiter,
   Satz wechselt auf den Spiegel-Wortlaut, console-Zeile „Planetary Computer nicht erreichbar →
   WorldCover-Spiegel"; dNBR-Overlay unversehrt.
5. **Beide Wege tot:** 4 Abrufe blockiert, Dämpfung fällt, **Overlay unversehrt** (32,6 % gefärbte
   Bildpixel), und der ursprüngliche Ernte-Satz steht wieder da — exakt das Verhalten vor SAT2e.
6. **`?wc=0`:** 0 WC-Anfragen **jeder Art** (weder PC noch Spiegel), dNBR unverändert, Ernte-Satz.
7. **Ehrlichkeit am Kaltstart:** auf einer echt neu geladenen Seite (über `about:blank`, WF3-Falle)
   öffnet der Viewer in Echtfarbe; beim ERSTEN dNBR-Eintritt stehen Dämpfung und Spiegel-Satz
   **im selben Render** (1,5 s) — keine Lücke, in der gedämpft aber nicht gesagt wird.
8. **Konsole:** 0 neue Fehler/Warnungen. Die 14 × 404 sind ausschließlich `/_firms/*` (die
   Netlify-Edge-Function existiert unter `vite preview` nicht) — Altbestand der Messumgebung.

**Long Tasks — ein Befund, der SAT2d korrigiert (V-SAT-16):** dieselbe Sequenz (dNBR + dreimal
zoomen bis 1 km) gemessen: **ohne WorldCover (`?wc=0`) 0 Long Tasks**, über den **Spiegel 936 ms**,
über den **PC 1 028 ms**. Die Last hängt also an der WorldCover-**Abtastung**, nicht am Transport —
V-SAT-15 fügt nichts hinzu (der Spiegel ist sogar günstiger), aber die §12.4-Angabe „max 52 ms"
ist damit **widerlegt**. Ursache im Browser nachgemessen, je 1024²-Kachel (1 M Pixel) in der
Schleife von `prepareWcSampler`: reine Arithmetik **26 ms**, mit `wcTileName`-String je Pixel
**100 ms**, mit zusätzlichem `names.indexOf` + Template-Map-Schlüssel je Pixel **496 ms** — die
Pixel-Schleife baut also pro Kachel ~1 M Strings und Map-Schlüssel.

### 12.7.5 Selbstverifikation (Gate-Fragen)

1. **Funktionserhalt:** ✔ — PC gesund ⇒ Abrufstrom und Ausgabe unverändert (12.7.4 (3)); fallen
   beide Wege aus, ist das Verhalten exakt das vor SAT2e (5); `?wc=0` unberührt (6).
2. **Desktop-Regression:** ✔ — außerhalb des dNBR-Modus ändert sich kein Pixel; im dNBR-Modus
   ist die einzige Änderung der Satz-Zusatz im Spiegel-Fall.
3. **Touch-Ziele:** ✔ — SAT2e fügt **kein** interaktives Ziel hinzu (nur Satztext); die Schalter
   `?wcm=1|0` sind URL-Schalter ohne UI.
4. **Konsole:** ✔ — 0 neue Fehler/Warnungen; genau eine `console.info`-Zeile beim Wegwechsel (8).
5. **Long Tasks:** ✘ **nicht grün, aber nicht durch diese Phase verursacht** — 936 ms (Spiegel)
   gegen 1 028 ms (PC) und 0 ms ohne WorldCover; der Verursacher ist der SAT2d-Sampler
   (V-SAT-16). Diese Phase verschlechtert nichts, hebt den Bestandsfehler aber und nennt ihn.

### 12.7.6 V-Katalog (Fortschreibung)

- **V-SAT-15 ist umgesetzt** — als eigenes statisches Repo statt Daten-Repo (Arithmetik in
  12.7.1 (2)) und mit der 37-m-Ebene statt „der benötigten Ebenen" (Dateigrenze, 12.7.1 (1));
  der Cloudflare-Worker-Proxy bliebe der bessere Plan B für VOLLE 10 m (RD0 Weg B, Jans Gate E2).
- **V-SAT-16 (neu, Bestandsfehler aus SAT2d, gemessen in 12.7.4):** die Pixel-Schleife in
  `prepareWcSampler` baut je 1024²-Kachel ~1 M Kachelnamen-**Strings** (`wcTileName`), ruft
  `names.indexOf` je Pixel und setzt den Cache-Schlüssel als Template-Literal je Pixel zusammen
  ⇒ **~500 ms je Kachel**, gemessen als Long Task von 936 ms (Spiegel) bzw. 1 028 ms (PC);
  ohne WorldCover 0. **Mehrwert:** die Dämpfung friert heute beim Zoomen den Hauptthread rund
  eine Sekunde ein — das ist die einzige Stelle des Viewers über der 200-ms-Grenze.
  **Umsetzungsskizze (billig, eigene Phase mit eigener Vorher/Nachher-Messung):** die
  3°-Kachel wechselt nur an Kachelgrenzen — je Pixel statt eines Strings einen kleinen
  Ganzzahl-Index aus `Math.floor(lat/3)`/`Math.floor(lon/3)` rechnen, die (höchstens vier)
  Kacheln vorab in ein Array legen und Kachel-/Pixel-Zuordnung über Zahlen statt über Map-
  Schlüssel führen; Erwartung ~500 ms → ~30 ms je Kachel. **Nicht in dieser Phase gebaut**
  (anderes Thema als der Ersatzweg, und ein Perf-Umbau braucht sein eigenes Gate).
- Offen bleiben V-SAT-10 (Wisch-Vergleich), V-SAT-11 (Historie-Dossier mobil) und V-SAT-12
  (Real-Device); V-SAT-12 ist durch V-SAT-16 präzisiert — der 196-ms-Task war die Spitze
  desselben Eisbergs.


---

## §12.8 SAT2f — V-SAT-16: die Pixel-Schleife des Samplers ohne Strings

**Auftrag (Jan, 2026-09-03):** „setze das noch um" — der in 12.7.6 gefundene 1-Sekunden-Blocker.
Reine Perf-Phase: **die Ausgabe muss Pixel für Pixel dieselbe bleiben.** Genau daran hängt das
Gate — eine schnellere Dämpfung, die auch nur ein Pixel anders klassifiziert, wäre keine
Beschleunigung, sondern eine stille Änderung der Aussage.

### 12.8.1 Diagnose — wo die Sekunde wirklich liegt

Die Browser-Messung aus 12.7.4 hatte den Verursacher schon eingegrenzt (Spiegel 936 ms · PC
1 028 ms · **ohne WorldCover 0 ms** ⇒ nicht der Transport). Diese Phase misst nach, WAS in der
Schleife kostet — mit `audit/brandradar-satellitenbilder/wc-sampler-bench.mjs`, der die
Schleife von vorher **wortgleich** als `refMapBlock` mitführt und damit zugleich das
Gleichheits-Orakel ist (BW-1-Muster „byte-gleich zur Referenz").

Je Ausgabe-Pixel lief bisher:

| Posten | Kosten je 1024²-Kachel |
|---|---|
| `wcLocate(...)` — **Objekt-Allokation** je Pixel | ~1 M Objekte |
| darin `wcTileName(...)` — Template-Literal + `padStart` + `String()` | ~1 M **Strings** |
| `perName.get(name)` — Map-Suche über String-Schlüssel | ~1 M Hash-Läufe |
| `` `${via}|${name}|${width}|${idx}` `` — Kachel-Schlüssel je Pixel | ~1 M **Strings** |
| `need.has/set(key)` — zweite Map über String-Schlüssel | ~1 M Hash-Läufe |
| `names.indexOf(name)` — lineare Suche mit **String**-Vergleich, **zweimal** je Pixel | ~2 M Vergleiche |
| zweite Schleife: nochmals Name-Lookup + Template-Literal je Pixel | ~1 M Strings |

Die eigentliche Rechnung — acht Divisionen und ein paar `Math.floor` — ist der billigste Teil.
Eine Bisektion in reinem JS (`scratchpad`, 1 M Pixel) beziffert sie: leere Schleife 2,1 ms,
+ Kachelindex 9,8 ms, + Vollauflösungs-Pixel 31,0 ms, + Ebenen-/Kachel-Rechnung 46,8 ms,
+ die zwei Schreibvorgänge **60,4 ms**. Alles darüber ist Zeremonie um Zeichenketten.

**Zwei Nebenbefunde:**

1. **Die Division durch `WC_PX_DEG` ist NICHT der Posten.** Ersetzt man sie durch eine
   Multiplikation mit dem Kehrwert, ändert sich nichts (60,0 gegen 60,4 ms) — die naheliegende
   Mikro-Optimierung wäre wirkungslos gewesen und hätte nur die Lesbarkeit gekostet.
2. Der Kachelname trägt **keine Information, die der Code nicht hätte**: er ist eine Bijektion
   zu `(⌊lat/3⌋, ⌊lon/3⌋)`. Ein Name wird nur für eine **URL** gebraucht — und davon gibt es je
   Block höchstens vier.

### 12.8.2 Entscheidungen

- **E1 — Ganzzahl statt Name.** `wcTileCode(lat, lon)` packt die 3°-Zelle in eine Zahl
  (`((⌊lat/3⌋+30) << 7) + (⌊lon/3⌋+60)`), `wcNameFromCode` ist der Rückweg und **die einzige
  Stelle, an der ein Kachelname entsteht**. `wcTileName` bleibt die öffentliche Namensautorität
  und leitet nur noch ab — es gibt weiterhin genau eine Namensregel, nicht zwei.
- **E2 — die Schleife wird eine pure Funktion.** `wcMapBlock(grid, nPix, slots, onNeed)` ist
  netz- und DOM-frei und damit headless gegen die alte Fassung nachrechenbar. Vorher steckte
  die Zuordnung in einer Closure hinter `await` — nicht prüfbar, ohne das Netz zu stellen.
- **E3 — die Netz-Reihenfolge bleibt.** `onNeed` feuert beim **ersten** Treffer einer Kachel,
  genau wie vorher `need.has(key)`; der Abruf beginnt also weiterhin *während* der Schleife
  und nicht danach. Das ist bewusst: sonst hätte die Phase die Ladezeit verschoben, während sie
  die Rechenzeit misst — zwei Änderungen in einer Messung.
- **E4 — der `via`-Schlüssel bleibt, wo er hingehört.** Die Trennung PC ⇄ Spiegel (V-SAT-15)
  sitzt in `wcIfds`/`loadWcTile`; die Closure baut gar keinen Schlüssel mehr. Die V-SAT-15-Sonde
  wurde deshalb umgedreht: sie verlangt das via-Präfix an den zwei Cache-Stellen und **verbietet**
  die Rückkehr des Schlüsselbaus je Pixel.
- **E6 — die Verschmelzung mit `wcGeoGrid` wurde gemessen und VERWORFEN.** Der Trace wies
  `wcGeoGrid` mit 48 ms neben `wcMapBlock` mit 126 ms aus; die naheliegende Idee war, die
  bilineare Ausdehnung in die Zuordnungsschleife zu ziehen und damit zwei `Float64Array` über
  den ganzen Block (16 MB je 1024²-Kachel) zu sparen. Gebaut, gemessen, zurückgebaut:
  **Node 135 → 133 ms, Browser 209 → 236 ms** — der Speicherverkehr war nicht der Engpass, und
  die breitere Schleife ist sogar etwas schlechter. Es bleibt bei zwei schlanken Schleifen.
  (Der Versuch steht hier, damit ihn niemand für ungeprüft hält und erneut unternimmt.)
- **E5 — kein zweiter Schleifenrumpf.** Ein spezialisierter Ein-Kachel-Pfad wäre nochmals rund
  doppelt so schnell (die Slot-Felder würden Konstanten), verdoppelte aber die Zuordnungsformel
  im Code. Bei erreichten Werten unter der 200-ms-Grenze ist das ein schlechter Tausch — die
  Formel darf nicht an zwei Stellen stehen.

### 12.8.3 Bau

`src/fire/detail/worldCover.ts`, additiv und ohne Vertragsänderung nach außen
(`WcSampler`-Signatur, `prepareWcSampler`, alle Kill-Switches unverändert):

- neu `wcTileCode` / `wcNameFromCode`; `wcTileName` delegiert.
- neu `wcMapBlock` + `WcSlot` + `WC_SLOT_SHIFT` (die Packung `slot·2²⁰ + idx` ist **dieselbe**
  wie vorher). Slot-Felder liegen als typisierte Spalten (`Int32Array`/`Float64Array`), der
  Merker „Kachel schon angefordert" ist **ein flaches `Uint8Array`** statt eines `Set<string>`.
- der Sampler baut aus den vier Blockecken die ≤ 4 **Codes**, holt die Header, legt die Slots an
  und liest danach nur noch ganzzahlig; `fac === 0` markiert „Header-Ausfall" ⇒ diese Pixel
  bleiben Klasse 0, exakt wie vorher der `null`-Eintrag in `perName`.

**Ein Befund aus dem eigenen Prüfstand:** der Bench-Fall, den ich „51°-Grenze (2 Kacheln)"
genannt hatte, schnitt die Grenze **gar nicht** — 20 km Blockhöhe reichen an dieser Stelle
nicht, es war eine Kachel. Der Zwei-Kachel-Pfad war damit nie gemessen. Aufgefallen ist es nur,
weil die Verifier-Sonde `names.length === 2` **fordert**, statt sich auf das Etikett zu
verlassen. Korrigiert (n0 5 662 000, 40/160 m Schrittweite ⇒ wirklich zwei Kacheln), und der
Bench **druckt die Kachelzahl jetzt mit** — ein Etikett kann so nicht wieder lügen.

### 12.8.4 Gate GSAT2f — gemessen

**Headless.** `audit/brandradar-satellitenbilder/wc-sampler-bench.mjs`, Median aus 7 Läufen je
Zeile, Referenz und neue Fassung auf **denselben** Daten in **demselben** Prozess:

| Fall | Ebene | Block | vorher | nachher | Faktor | Zuordnung gleich |
|---|---|---|---|---|---|---|
| Hürtgenwald 31UGS (1 Kachel) | 18000 | 256² | 134,9 ms | 5,4 ms | 25,0× | ja |
| Hürtgenwald 31UGS (1 Kachel) | 18000 | 1024² | 1 813,1 ms | 102,2 ms | 17,7× | ja |
| Hürtgenwald 31UGS (1 Kachel) | 9000 | 256² | 103,2 ms | 4,9 ms | 20,9× | ja |
| Hürtgenwald 31UGS (1 Kachel) | 9000 | 1024² | 1 760,9 ms | 103,0 ms | 17,1× | ja |
| 51°-Grenze (2 Kacheln) | 18000 | 256² | 116,4 ms | 4,4 ms | 26,7× | ja |
| 51°-Grenze (2 Kacheln) | 18000 | 1024² | 1 773,0 ms | 96,4 ms | 18,4× | ja |
| 51°-Grenze (2 Kacheln) | 9000 | 256² | 105,5 ms | 5,0 ms | 20,9× | ja |
| 51°-Grenze (2 Kacheln) | 9000 | 1024² | 1 763,0 ms | 101,0 ms | 17,4× | ja |

**Gleichheit ist der eigentliche Beleg:** über alle acht Fälle ist jedes `tileOf[k]`, jedes
`pixOf[k]` und der komplette Satz angeforderter Kacheln (samt Reihenfolge) identisch zur
Fassung von vorher. Da die Klassen-Ausgabe `cls` ausschließlich aus diesen beiden Feldern
gelesen wird, ist die **Dämpfung Pixel für Pixel unverändert** — das ist stärker als ein
Bildvergleich, der nur zeigt, dass nichts *auffällig* anders ist.

**Browser (Prod-Preview, Hürtgenwald-Ereignis 16.08., dNBR-Aufbau, Kaltstart je Lauf über
`about:blank`).** Die Zahl ist der längste Long Task der Kachelbau-Phase:

| Lauf | vorher (12.7.4) | nachher | |
|---|---|---|---|
| ohne WorldCover (`?wc=0`) | 0 ms | **0 ms** | 0 WC-Anfragen, Ernte-Satz zurück |
| Planetary Computer | 1 028 ms | **209 / 227 ms** | Dämpfung + Chip, kein Spiegel-Satz |
| Spiegel (`?wcm=1`) | 936 ms | **230 ms** | Dämpfung + Chip + „37 m statt 10 m" |

Konsole 0 Fehler / 0 Warnungen; im Spiegel-Lauf genau eine `console.info`-Zeile, im
`?wc=0`-Lauf gar keine. `typecheck` grün, `verify:fire-detail` **273/273** (+12), Build grün,
Budget grün (totalJs 1 088,6/1 109,8; +2,8 KB im Lazy-Chunk).

**Wie die Zuordnung belegt ist (V-WF-13-Regel: Long Tasks nur mit Kontrolllauf zuordnen):** der
`?wc=0`-Lauf erzeugt **null** Long Tasks, obwohl er dieselben 42 dNBR-Kacheln baut. Alles, was
gemessen wird, ist also WorldCover-Arbeit — nicht der dNBR-Aufbau und nicht die (weiterhin
offstage rendernde) Hauptkarte aus V-BD2-1.

### 12.8.5 Selbstverifikation

1. **Funktionserhalt:** ✔ — die Zuordnung ist beweisbar unverändert (12.8.4), alle Kill-Switches
   (`?wc=0`, `?wcm=1|0`), der Latch, die Wegwahl und die Sätze sind unangetastet; die öffentliche
   Sampler-Signatur ist dieselbe.
2. **Desktop-Regression:** ✔ — es ändert sich kein Pixel; die Phase fasst ausschließlich die
   Rechenreihenfolge innerhalb einer puren Funktion an.
3. **Touch-Ziele:** ✔ — kein UI-Element berührt.
4. **Konsole:** ✔ — 0 Fehler, 0 Warnungen; die eine Spiegel-Zeile bleibt die einzige Ausgabe.
5. **Long Tasks:** **teils** — der Blocker ist von 936/1 028 ms auf 209–230 ms gefallen (Faktor
   4,3–4,9), liegt damit aber weiterhin **knapp über der 200-ms-Grenze**. Das wird hier so
   gesagt und nicht gerundet. Was übrig ist, ist nicht mehr die Namensschleife: sie kostet je
   1024²-Block noch rund 100 ms (Prüfstand), der Rest sind Abruf, Deflate-Dekode der
   WorldCover-Kachel und das gedämpfte Zusammensetzen. Der nächste Hebel wäre struktureller
   Art — den Kachelbau über Frames verteilen statt ihn schneller zu machen (**V-SAT-17**).

### 12.8.6 V-Katalog (Fortschreibung)

- **V-SAT-16 ist umgesetzt** — Ganzzahl-Kachelcode statt Namens-Strings, Faktor 17–27× in der
  Schleife, 4,3–4,9× am gemessenen Long Task, Ausgabe beweisbar identisch. Die Erwartung aus
  12.7.6 („~500 ms → ~30 ms je Kachel") war der Größenordnung nach richtig, in der absoluten
  Zahl zu optimistisch: gemessen bleiben je 1024²-Block rund 100 ms.
- **V-SAT-17 (neu):** der erste dNBR-Aufbau mit Dämpfung ist EIN Task von 209–230 ms, weil
  Abruf, Dekode, Zuordnung und Komposit einer Kachel in einem Zug laufen. **Mehrwert:** erst
  eine Aufteilung über Frames bringt die Ansicht sicher unter die 200-ms-Grenze — auch auf
  langsamen Geräten, wo der Faktor dieser Phase allein nicht reicht (V-SAT-12 Real-Device ist
  weiterhin offen). **Umsetzungsskizze:** den Kachelbau des Viewers je Frame deckeln (ein
  Komposit je rAF statt aller fertigen auf einmal) — Darstellungsfrage, keine Datenfrage, und
  sie berührt `worldCover.ts` gar nicht. **Nicht in dieser Phase gebaut** (Jans Auftrag war der
  Blocker in der Schleife; ein Frame-Budget ist ein eigenes Thema mit eigenem Gate).
- **Mess-Lehre:** eine Optimierung, die plausibel klingt, ist erst eine, wenn sie gemessen ist —
  die Verschmelzung von Gitter und Zuordnung (E6) sparte 16 MB Speicherverkehr je Kachel und
  war trotzdem **langsamer**. Sie steht als geprüfter Irrweg im Text, damit sie niemand für
  eine Lücke hält.
- **Prüfstands-Lehre:** ein Fall-Etikett ist keine Messung. Der Bench-Fall „51°-Grenze
  (2 Kacheln)" schnitt die Grenze nicht; aufgefallen ist es erst, weil die Verifier-Sonde die
  Kachelzahl **fordert** statt sie zu glauben. Der Prüfstand druckt sie seitdem mit.
