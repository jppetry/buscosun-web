# Diagnose — Behördendaten DACH (Gate GWBA1) · Stand 2026-08-15, Checkpoint nach A0-1

> Kickoff Jan 2026-08-15. Sonde: `scripts/l0/probe-behoerden.mjs` (Teile axis|nina|geosphere|ems|vg250|geocat),
> Belege `audit/l0/waldbrand-behoerden-<part>.json`. **Noch keine Zeile Produktcode.**

## 0. Pflichtlektüre — bestätigt

Gelesen: `CLAUDE.md`, `docs/DATA_SOURCES.md` §W/W.2/W.2.1/W.2.2/W.2.3, `docs/API.md` §7 + Attributionsregeln
(kein Durable-Cache auf Warninhalten, Datenalter sichtbar, Ausfall ≠ Leerstand, Wortlaut unverändert),
`src/fire/sources/firmsHotspots.ts`, `gwisHotspots.ts`, `src/fire/fireCorroboration.ts`, `src/fire/fireEvents.ts`,
`src/officialSources.ts`, `netlify/edge-functions/firms.ts`, `audit/waldbrand-*.md` (per Digest), Verifier-Stand 524/524.

**Befund aus der Lektüre (vor jeder Messung):** `src/fire/sources/gwisHotspots.ts:30` setzt `maxfeatures=1500`
gegen `ms:viirs.hs.week` — bei 7.352 DACH-Features (gemessen heute) schneidet der MapServer die **jüngsten**
5.852 Detektionen weg (V-224-Mechanik) — im GWIS-**Fallback**-Pfad. Muss in dieser Phase auf eine reine
Notbremse (≥ 12.000, wie `firmsHotspots.MAX_FEATURES`) angehoben und mit Verifier-Anker gesichert werden.

## 1. A0-1 · Achsen-Anker — GEMESSEN (audit/l0/waldbrand-behoerden-axis.json)

| Endpunkt | Layer | BBox-Reihenfolge | Features | erste Koordinate | Urteil |
|---|---|---|---|---|---|
| `/gwis` | `viirs.hs.today` | lat,lon (heutiger Code) | 2.736 | `[10.589, 49.547]` | `[lon,lat]` ✅ |
| `/gwis` | `viirs.hs.today` | lon,lat | **5** | `[49.131, 15.594]` | **`[lat,lon]` gespiegelt** ⚠️ |
| `/gwis` | `viirs.hs.week` | lat,lon | 7.352 | `[11.478, 50.125]` | ✅ |
| `/gwis` | `viirs.hs.week` | lon,lat | **20** | `[47.279, 14.420]` | **gespiegelt** ⚠️ |
| `/effis` | `modis.ba.poly.week` | lat,lon | 26 | `[12.047, 49.709]` | ✅ |
| `/effis` | `modis.ba.poly.week` | lon,lat | 0 | — | leer (kein Fehler) |
| `/effis` | `modis.ba.poly.season` | lat,lon | 293 | `[12.967, 46.450]` | ✅ |
| `/effis` | `modis.ba.poly.season` | lon,lat | 0 | — | leer |

Bestätigt: **der heutige Code ist richtig** (lat,lon-BBox ⇒ RFC-7946-Ausgabe). Die Recherche-Empfehlung
(lon,lat) wird nicht übernommen. **Abweichung zur Kickoff-Angabe:** `/gwis` liefert bei vertauschter BBox
**nicht** die volle Feature-Zahl, sondern eine kleine Restmenge (5 bzw. 20 statt 2.736/7.352) — gespiegelte
Punkte fallen nur zufällig in die vertauschte Box; die Geometrie ist dabei tatsächlich `[lat,lon]`. `/effis`
verhält sich anders: 0 Features. ⇒ Zwei Endpunkte, zwei Verhalten — der Verifier-Anker muss auf die
**zurückgegebenen Koordinaten** prüfen (erster Wert im Längengradband 5,5–17,5, zweiter im Breitengradband
45,5–55,5), nicht auf die URL-Form. Alle Antworten `ACAO: *`. Kein `maxfeatures` gesetzt (V-224).

## 2. Offen (nächste Schritte, in dieser Reihenfolge)

- A0-3 NINA/MoWaS-Struktur, A0-4 GeoSphere-Warn-API, EMS-Schema, VG250-WFS, geocat-Lizenz:
  `node scripts/l0/probe-behoerden.mjs --part nina|geosphere|ems|vg250|geocat --json audit/l0/waldbrand-behoerden-<part>.json`
- **STOPP & FRAGEN (Jan) vor A1:** MoWaS-Lizenz (§ 5 UrhG vs. „keine unklare Lizenz") + Route `/_nina/*`.
- Verifier-Anker (Koordinaten + maxfeatures im GWIS-Fallback), dann A2/A3/A4 nach Kickoff.

## 3. A0-3 · NINA/MoWaS — GEMESSEN (audit/l0/waldbrand-behoerden-nina.json, 2026-08-15)

- `warnung.bund.de/api31/{mowas,katwarn,biwapp,dwd,lhp,police}/mapData.json`: alle HTTP 200, **kein
  `Access-Control-Allow-Origin`** ⇒ Edge Function `/_nina/*` ist zwingend (Kickoff-Erwartung bestätigt).
  MoWaS 44 Warnungen (22 KB), Felder `id, version, startDate, severity, urgency, type, i18nTitle, transKeys`.
- Detail `/warnings/{id}.json` = CAP-Struktur (`identifier, sender, sent, status, msgType, scope, code, references,
  info[]`), `info[]` je Sprache mit `event, headline, description, instruction, eventCode[], parameter[], area[]`.
- **Eventcodes:** `eventCode.valueName = "profile:DE-BBK-EVENTCODE"`, `value = "BBK-EVC-NNN"` (Werte direkt in
  der Zielform). Gemessen an 40 Details: `077`×108, `030`×108, `010`×54, `069`×27, `067/011/037/079/034/060/078`×9
  (Codes wiederholen sich je `info`-Block). **32 von 40 tragen einen der fünf Brand-Codes; die Regex trifft 31 —
  alle 31 liegen innerhalb der 32.** Der Kickoff-Satz „der Code allein greift zu kurz" bestätigt sich in dieser
  Stichprobe **nicht** (Lage: Hürtgenwald-Großbrand aktiv, viele „Geruchsbelästigung durch Waldbrand"-Meldungen mit
  Code 077/030). Beides UND-verknüpft wäre zu eng, ODER-verknüpft ist richtig — bleibt so.
- **Geometrie kommt mit:** `/warnings/{id}.geojson` liefert für **40/40** Warnungen Polygone (83 Polygon, 2
  MultiPolygon, `[lon,lat]`, z. B. Rodenbach `[9.00,50.11]–[9.07,50.16]`). `area.geocode` ist nur `AreaId:0`;
  die ARS stecken als 12-stellige Liste in `parameter[valueName=warnVerwaltungsbereiche]`.
  ⇒ **BKG VG250 wird für die Punkt-in-Polygon-Zuordnung nicht gebraucht** — die amtliche Warnfläche liegt schon
  vor. VG250 bliebe nur Rückfall, falls eine Warnung ohne Geometrie käme (in der Stichprobe: keine). Spart Abruf,
  Speicher und eine Lizenzzeile.
- Sender = Leitstellen-Kennung (`DE-NW-DN-SE054`), Klarname in `parameter[sender_langname]`
  (z. B. „Leitstelle Waldeck-Frankenberg") ⇒ das ist die „ausstellende Stelle" für die Beschriftung.
- Textfeldern liegen in Latin-1-Ausgabe der Sonde („S�dring") — Kodierung im Proxy prüfen (`content-type`
  Charset), Wortlaut muss unverändert durchkommen.

## 4. A0-4 · GeoSphere Warn-API — GEMESSEN (audit/l0/waldbrand-behoerden-rest.json)

- **Host:** `openapi.hub.geosphere.at/warnapi/v1/openapi.json` (73,9 KB, `ACAO: *`) nennt als **einzigen Server
  `https://warnungen.zamg.at/wsapp/api`** — Pfade `/getWarnstatus`, `/getWarningsForCoords`, `/getBBoxForCoords`,
  `/getGewitterAuto`. Alle drei Kandidaten auf `*.geosphere.at` antworten nicht (ERR/404). ⇒ `warnungen.zamg.at`
  lebt, ist der dokumentierte Server, `ACAO: *`, kein Schlüssel.
- **Rate-Limit:** `getWarnstatus` (214 KB, 0,2 s), `getWarningsForCoords`, `getBBoxForCoords` — **keine
  `x-ratelimit-*`/`retry-after`-Header**. Undokumentiert bleibt es; gemessen ist keines. Ein Abruf je Sitzung
  (`getWarnstatus`, `Last-Modified`-fähig) genügt fachlich ⇒ **kein Proxy nötig**, kein STOPP-Fall.
- **Bezugssystem:** die Geometrien sind **projiziert** — 9.767 Stützpunkte, x 112 553…685 409, y 275 487…570 407
  = **EPSG:31287 (Austria Lambert)**, exakt wie die Spezifikation sagt und **nicht** WGS84 trotz GeoJSON-Format.
  Format-Namen wären hier die falsche Quelle gewesen. `swissProjection.ts` deckt EPSG:2056 ab, **nicht 31287** ⇒
  für eine Kartendarstellung wäre eine eigene Lambert-Rückprojektion nötig (kein proj4js, D-06). Für die A3-Aufgabe
  „Warnung auf der Hotspot-Gemeinde" reicht `getWarningsForCoords?lon&lat` je Ereignis-Schwerpunkt — kein
  Umprojizieren, aber **ein Abruf je Ereignis** ⇒ deckeln (nur AT-Ereignisse, ≤ ~30, gecacht je Sitzung).
  Antwort trägt `location.properties.gemeindenr/name` + `warnings[].properties.warntypid/wlevel/…` — die
  Gemeindezuordnung liefert GeoSphere selbst.

## 5. A2 · Copernicus EMS — GEMESSEN

`public-activations-info/`: HTTP 200, 3,5 KB, `ACAO: *`, **10 Aktivierungen** (nur offene/aktuelle), Felder
`code, countries, eventTime, name, centroid (WKT POINT lon lat), activationTime, category, lastUpdate, closed,
gdacsId, n_aois, n_products`. DACH-Treffer: **EMSR920 „Forest fire in Huertgen Forest, Germany"**, `Wildfire`,
`POINT (6.376 50.754)`, `eventTime 2026-08-13T12:55`, `closed false`. Kategorie-Wert für Brand: `Wildfire`.
`countries` = englische Ländernamen (`Germany`), Centroid = WKT — beides defensiv parsen. Interne API ⇒ nach
Kickoff schematolerant, Fehler ⇒ stumm kein Abzeichen.

## 6. A3 · geocat — GEMESSEN (autoritative Lizenz der BAFU-Layer)

Beide STAC-Collections tragen den Platzhalter `"license": "proprietary"` und verweisen per `describedby` auf geocat:
- `ch.bafu.gefahren-waldbrand_warnung` → geocat `3f8bc20d-db07-4008-8465-4cc8efa6c84f` „Waldbrandgefahrenwarnung"
- `ch.bafu.gefahren-waldbrand_praeventionsmassnahmen_kantone` → geocat `5deca805-ace4-4401-9750-cb1b02f5a292`
  „Waldbrandpräventionsmassnahmen der Kantone"

Beide Records: `MD_LegalConstraints.useConstraints = otherRestrictions`, `otherConstraints` =
**„Opendata OPEN: Freie Nutzung." / „Opendata OPEN: Open use."** mit Anker
`https://opendata.swiss/en/terms-of-use/#terms_open`. ⇒ Das ist die zu zitierende Lizenzangabe (Kickoff A3 CH).

## 7. VG250 — nach A0-3 nicht mehr nötig

Jede MoWaS-Warnung liefert ihre Fläche als GeoJSON (§3). Die VG250-Sonde wurde deshalb nicht ausgeführt; BKG bleibt
als dokumentierter Rückfall (dl-de/by-2.0), falls je eine Warnung ohne Geometrie auftaucht.

## 8. Umsetzung (2026-08-15) — was gebaut wurde, was wartet

**Gebaut (alles hinter Verifier `verify:fire-behoerden`, 76/76; Gesamt fire-Verifier 616/616):**

| Baustein | Datei | Kern |
|---|---|---|
| Achsen-Anker (A0-1) | `src/fire/sources/wfsAxis.ts` | `axisVerdict/assertDachAxis` auf die **zurückgegebenen Koordinaten**; `bboxIsLatLon` auf jede Abruf-URL; in `gwisHotspots.ts` und `euContext.ts` (beide Brandflächen-Pfade) nach jedem Abruf; gespiegelt ⇒ Antwort verworfen |
| `maxfeatures`-Notbremse (A0-2, V-224) | `gwisHotspots.ts` | 1 500 → **12 000**; live belegt: der GWIS-Fallback zeigte danach **7 835** Wochen-Detektionen statt der 1 500 ältesten |
| EMS-Abzeichen (A2) | `src/fire/sources/emsActivations.ts` | schematolerant (WKT/GeoJSON/Array-Centroid, Länder als String/Objekt, Hüllen `[]/{results}/{data}`), jeder Fehler ⇒ `[]`, 25-km-Zuordnung, ±30-Tage-Zeitregel; **live: EMSR920 Hürtgenwald ⇒ „bestätigt"** (Screenshot) |
| GeoSphere-Kontext (A3 AT) | `src/fire/sources/geosphereWarnContext.ts` | `getWarningsForCoords` je AT-Ereignis (Deckel 20, Cache 15 min, kein Durable-Cache), Typen 1–7 / Stufen 1–3 als eigene Skala, Wortlaut zitiert, **nie „bestätigt"**; live: Linz „Hitze (gelb), Gewitter (gelb) — Kontext, keine Brandbestätigung" |
| Bewertung (A4) | `src/fire/fireAssessment.ts` | drei Beschriftungen, Rangfolge Bestätigung > Statik-Grau (Varallo-Test), kein Score |
| UI | `FireMap.tsx` (Steckbrief-Zeile `.fire-pop-assess`), `FirePage.tsx` (EMS-/AT-Laden still, Deep-Link-Zeile), `FireLayerCard.tsx` (Ehrlichkeitstexte), `fireDeck.css` | |
| Ehrlichkeitsmechanik (V-195) | `src/officialSources.ts` | `hasOfficialFireConfirmation()` (DE nur mit `MOWAS_ENABLED`, AT/CH nie), `fireIncidentSourcesFor()` (AT: OÖ + Burgenland Deep-Links mit Einschränkung; CH: Alertswiss nur Link; DE: NINA) — `verify:official-sources` 44/44 |
| BAFU-Lizenz (A3 CH) | `bafuFire.ts`, `scripts/seo/licenses.mjs`, `docs/DATA_SOURCES.md` §W.6 | geocat „Opendata OPEN: Freie Nutzung." statt STAC-Platzhalter |
| Sonde | `scripts/l0/probe-behoerden.mjs` | axis · nina · geosphere · ems · vg250 · geocat |

**Wartet auf Jan (STOPP & FRAGEN):**
1. **MoWaS (A1)** — Lizenz (§ 5 UrhG vs. „keine unklare Lizenz") + Route `/_nina/*`. Vorbereitet: Vertrag
   `OfficialWarning` in `fireAssessment.ts`, Flag `MOWAS_ENABLED=false` in `officialSources.ts`; Befund §3.
   Neu aus A0-3: VG250 entfällt (Geometrie kommt mit).
2. **Budget** — `totalJs` 867,6 KB gegen Ratsche 865 KB. Gemessen: die drei neuen Module + `officialSources`-
   Zweig bündeln zu **≈ 4,2 KB gzip** (esbuild, minifiziert) — der Überhang ist **dieser Phase** zuzurechnen,
   nicht vorbestehend (IST vor der Phase 864 KB). Kickoff verbietet eine weitere Anhebung ⇒ Jans Entscheidung:
   Anhebung um ~4 KB für die neue Fähigkeit **oder** Sparphase (was zu streichen wäre, wäre Funktion).
3. **V-222** — 7-Tage-Hintergrundabfrage zur Statik-Klassifikation im 24-h-Fenster (A4 nennt die Lücke im
   Steckbrief: „im 24-Stunden-Fenster mangels Vorgeschichte nicht möglich").
4. **Statische Landbedeckungsmaske (A4)** — nicht gebaut; Vorschlag kleiner erster Schnitt (CORINE-Klassen
   Industrie/Abbau/Siedlung als grobe Maske, OSM-Anreicherung als Folgephase) statt Geofabrik-PBFs für drei
   Länder. `landcover`-Eingang in `assess()` ist vorbereitet (`'natural' | 'artificial' | null`).

**Verifikation:** Desktop Chrome, Dev :5211 (FIRMS-Proxy aktiv), 7-Tage-Fenster, 6 819 Detektionen /
2 774 ortsfest / 543 kartiert. Konsole 0 Fehler/0 Warnungen (nur Vite-HMR-Debug). Netz: EMS 1 Abruf,
GeoSphere ≤ 20 (Dev-StrictMode verdoppelt), keine Anfrage an Landes-Feuerwehrseiten. Screenshots
`audit/screenshots/waldbrand-behoerden-{bestaetigt-ems,at-kontext-statisch,at-deeplinks}.jpg`.
`typecheck` 0 Fehler. Real-Device offen.

## 9. Jans Entscheidungen (2026-08-15) und ihre Umsetzung

| # | Entscheidung | Umsetzung | Beleg |
|---|---|---|---|
| 1 | **MoWaS NICHT bauen** (Grenznutzen gefallen, „keine unklare Lizenz"); Flag + Vertrag bleiben; keine Route `/_nina/*`; A0-3 dokumentieren; **Deep-Link** statt Auswertung | `MOWAS_ENABLED=false` bleibt, `OfficialWarning` bleibt; `fireIncidentSourcesFor('DE')` → `warnung.bund.de/meldungen`; Popup-Zeile „Amtliche Warn-/Einsatzlage nachsehen" je Land (`countryGuess`); Steckbrief: „unbestätigt = Normalfall" direkt nach dem ersten Satz; A0-3 in `docs/DATA_SOURCES.md` §W.9 | Verifier: keine `nina.ts`, kein Fetch auf warnung.bund.de |
| 2 | **Budget erhöhen, wenn nur der Lazy-Chunk wächst** | `eagerJs` **123,6 KB → 123,6 KB unverändert** (officialSources landet im lazy geteilten Chunk `iconD2WindSource-*.js`, nicht in `index-*.js`); Wachstum ausschließlich `FirePage-*.js` + neuer Worker-Chunk | s. §10 Budget |
| 3 | **V-222 freigegeben** — 24 h rendern, 7 Tage danach im Leerlauf, Klassifikation im Worker, neutral bis dahin | `fireEventsWorker.ts` + `fireEventsClient.ts` (Hauptthread-Rückfall); `FirePage`: erster Abruf ohne Rückruf → Render → `requestIdleCallback` → 7-Tage-Abruf (nur 24-h-Fenster) → Worker → `toRun(...keys)` → grau; Status „Einordnung läuft …" → „davon N ortsfest (grau) · Einordnung aus 7 Tagen Vorgeschichte" | live 24 h: 1 573 Detektionen, nach ~600 ms 395 grau; Requests `/…/2` vor Paint, `/…/5` + `/…/3/2026-08-08` danach; Screenshot `waldbrand-behoerden-v222-24h-grau.jpg` |
| 4 | **CORINE-only-Maske**, ≤ 100 KB, null Requests; V-231 (OSM) nur, wenn ein Urteil kippt | `scripts/build-clc-mask.mjs` (14 562 Polygone, Klassen 121/131/132, 0,01°-Raster 1200×1000) → `public/fire/clc-industry-mask.png` **24,8 KB**; `clcMask.ts` (einmal lazy laden, 3×3-Nachschlagen); `assess()` erhält „Landbedeckung CORINE 2018: Industrie-/Abbau-/Deponiefläche — Plausibilität, kein Ausschluss" | **Messung an bekannten Fällen** (`scripts/l0/check-clc-mask.mjs`): Duisburg/Linz/Salzgitter/Dillingen/Eisenhüttenstadt/Weisweiler = `industrial`, Varallo/Hürtgenwald/Bayer. Wald = `other` — **kein Urteil kippt** gegenüber dem Persistenz-Klassifikator ⇒ **V-231 erledigt, nicht vertagt** |

**Vorgezogene Punkte:**
- **GWIS-Deckel gemessen** (`ms:viirs.hs.week` auf `/gwis`): `maxfeatures=1500` ⇒ 1 500 Features, **alle in DACH**, acq
  bis 14.08. 12:04 (Vollbestand bis 15.08. 13:44); `maxfeatures=200` ⇒ bis 12.08. Der Deckel wirkt hier **nach** dem
  BBox-Filter, schneidet aber die **jüngsten** ab — der stille, schlimmere Fall. ⇒ **kein serverseitiger Deckel mehr**
  (URL ohne `maxfeatures`, Verifier-Anker), Client-Deckel `capNewest` nach BBox (jüngste bleiben, `GWIS_CLIENT_CAP` 12 000
  = Hauptthread-Schutz).
- **Koordinaten-Anker prüft Koordinaten, nicht Zählstände** — bestätigt: `axisVerdict` wertet nur die Bänder der ersten
  Stützstellen aus; fünf Detektionen im Winter sind ein gültiger Zustand (`empty`/`lonlat`), kein Anker-Fehler.

## 10. Budget (Stand nach allen vier Entscheidungen)

Letzter erfolgreicher Build (vor Maske/V-222): `totalJs` 869,7 KB, `eagerJs` **123,6 KB (unverändert)**. Neue Module
dieser Phase gebündelt (esbuild, minifiziert, gzip): ≈ 6,8 KB inkl. geteilter Helfer + Worker-Chunk ≈ 1,7 KB
(`fireEventsWorker` bündelt `fireEvents` ein zweites Mal). Erwartung ≈ 872–874 KB. ⚠️ Der letzte Build-Versuch scheiterte
an **fremden, gleichzeitigen Änderungen** (`FireMap.tsx(92)`: `fireSoilDryness` fehlt in einem Record; `fireState.ts(56)`
ungenutzte Variable — Phase WT1 eines anderen Agenten, nicht Teil von GWBA1). Die Ratsche wird deshalb **nicht blind**
gesetzt: sobald der Build wieder grün ist → `npm run budget`, IST eintragen, V-232 nachziehen (Betrag, Chunk, Gegenwert:
Bewertung/EMS/GeoSphere/Maske/Worker).

**Nachmessung nach grünem Build (später am 2026-08-15, inkl. fremder WT1-Änderungen):** `totalJs` **875,1 KB**,
`eagerJs` **124,0 KB** (vorher 123,6). Der Entry-Chunk `index-C3-oXVzx.js` enthält **keinen** GWBA1-String
(`clc-industry`, `warnung.bund.de`, `rapidmapping`, `zamg`, `Opendata OPEN`, `ooelfv` = 0 Treffer) — das Eager-Wachstum
von 0,4 KB stammt aus der parallelen WT1-Arbeit (`fireSoilDryness` in `fireModel/fireState`, die App-seitig eingebunden
sind), nicht aus dieser Phase. GWBA1-Anteil: `FirePage-*.js` + `fireEventsWorker-*.js` (3,1 KB roh). Nach Jans Regel
(„eagerJs gewachsen ⇒ stoppen und melden") wird die Ratsche **nicht** angehoben; Entscheidung: Anhebung auf ~876 KB
(GWBA1 ≈ 6–7 KB + WT1-Anteil) oder getrennte Zurechnung, sobald WT1 abgeschlossen ist.
**Jans Anweisung (gleicher Tag): Ratsche angehoben — `budget.json` `totalJs.limitKb` 865 → 876 (IST 875,1 KB); `npm run budget` grün.**
