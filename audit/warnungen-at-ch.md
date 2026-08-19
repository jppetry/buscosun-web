# Warn-Layer AT + CH — Quellen-Diagnose

> Stand: 2026-08-08. Recherche zur Frage „Können Österreich und die Schweiz im bestehenden
> `LayerKey 'warnings'` mitabgedeckt werden?"
> **Status: Diagnose. Kein Code, keine Quellenwahl final.**
> Alle Kernaussagen sind an echten Live-Payloads vom 2026-08-08 verifiziert.
> Katalogeintrag: **`improvements.md` V-173**. Korrigiert: `docs/API.md` §8.2 und
> `docs/DATA_SOURCES.md` §9.3 + §11 (beide am 2026-08-08 nachgezogen).

---

## 0. Kurzantwort

**Ja — aber nicht mit *einer* Quelle.** Die naheliegende Idee, MeteoAlarm als gemeinsamen
EU-Kanal für beide Länder zu nehmen, scheitert an Österreich: der AT-Feed enthält **keine
Geometrie**. Umgekehrt liefert der CH-Feed **volle Polygone** — entgegen der bisherigen
Annahme in `docs/API.md` §8.2.

Die tragfähige Kombination ist deshalb **quellenrein pro Land**:

| Land | Quelle | Geometrie | CORS | Aufwand |
|---|---|---|---|---|
| DE | DWD CAP `DISTRICT_DWD_STAT` (unverändert) | ✅ Landkreis-Polygone | Proxy (vorhanden) | — umgesetzt |
| **AT** | **GeoSphere Warn-API `getWarnstatus`** | ✅ MultiPolygon je Warnung | ✅ `*` | **M** |
| **CH** | **MeteoAlarm-Feed Schweiz (Absender MeteoSchweiz)** | ✅ CAP-`<polygon>`, hochaufgelöst | ❌ → Netlify-Rewrite | **S–M** |

---

## 1. Zwei Korrekturen an der bestehenden Doku

Beide Aussagen im Repo sind **an echten Payloads widerlegt** und blockieren heute die
CH-Abdeckung zu Unrecht.

### 1.1 `docs/API.md` §8.2 — MeteoAlarm

> Ist-Stand: *„⚠️ **nur Bounding-Boxen** (EMMA_ID-Regionen), keine Detailpolygone."*

Das gilt für **DE und AT**, **nicht für CH**. Gemessen am CH-Feed:

```json
{ "altitude": 0.0, "areaDesc": "Mendrisiotto", "ceiling": 3000,
  "polygon": ["45.9174690246582,8.914362907409668 45.91419219970703,8.916922569274902
               45.91018295288086,8.921401023864746 45.90314483642578,8.925984382629395 …"] }
```

Das sind echte, hochaufgelöste Warngebiets-Ringe von MeteoSchweiz
(`"sender": "meteoalarm.cap@meteoswiss.ch"`), keine Boxen. Zum Vergleich der AT-Feed
derselben Plattform — dort steht an **jedem** `area` nur:

```json
{ "areaDesc": "Hermagor", "geocode": [ { "value": "AT203", "valueName": "EMMA_ID" } ] }
```

Die Bounding-Box-Einschränkung stammt aus der **neuen EDR-API** (`api.meteoalarm.org`,
registrierungspflichtig) — sie wurde offenbar auf die offenen Feeds übertragen.

### 1.2 `docs/DATA_SOURCES.md` §9.3 — Schweiz

> Ist-Stand: *„Empfehlung für CH: Kein eigener Warn-Layer."* · *„CH: keine offenen Warnungen"*

Die dort geprüften Wege (OGD/STAC, `naturgefahren.ch`, GIN, `api3.geo.admin.ch`,
`opendata.swiss`, App-Backend) sind **alle korrekt negativ bewertet** — die Prüfung war
gründlich. Übersehen wurde nur, dass MeteoSchweiz seine Warnungen als EUMETNET-Mitglied
über MeteoAlarm **mit** Geometrie publiziert. Der Blocker ist damit gelöst, ohne dass das
undokumentierte App-Backend angefasst werden muss.

---

## 2. Österreich — GeoSphere Warn-API

Bereits vollständig bewertet in `docs/DATA_SOURCES.md` §9.2 (A1, Note 1) und
`docs/API.md` §4.2. Hier nur die Live-Bestätigung von heute:

```
GET https://warnungen.zamg.at/wsapp/api/getWarnstatus
```

- ✅ `{"type":"FeatureCollection", …}`, Features als **MultiPolygon**
- ⚠️ Koordinaten **in Metern**: `[[[[379930,300024],[378089,299562],[377014,299646], …`
  → **EPSG:31287** (MGI/Austria Lambert), Reprojektion nach 4326 zwingend
- Properties: `warnid`, `wtype`, `wlevel`, `start`, `end`, `gemeinden[]`
- 5 aktive Warnungen zum Abrufzeitpunkt

**Das Wichtigste zur Architektur:** `getWarnstatus` liefert **keinen amtlichen Warntext** —
nur Typ und Stufe. Der Text kommt aus `getWarningsForCoords?lon=&lat=&lang=de`
(`text`, `auswirkungen`, `empfehlungen`). Für die Sonderregel „Zitat statt Umformulierung"
heißt das: **Fläche und Steckbrief sind zwei Requests.** Genau die Aufteilung, die
`DATA_SOURCES.md` §9.2 bereits empfiehlt.

**Bekannter Defekt (aus der Repo-Doku, weiterhin gültig):** `warnid` ist zwischen
`getWarnstatus` und `getWarningsForCoords` **nicht joinbar** (GeoSphere-Issue #42) — nicht
als Cache- oder Dedup-Schlüssel verwenden.

**Ehrlichkeits-Auflage:** Warnungen gelten für den **Dauersiedlungsraum**, hochalpine Lagen
sind ausgenommen. Eine warnfreie Alpenfläche in AT bedeutet **nicht** „keine Gefahr",
sondern „nicht abgedeckt". Der Text steht bereits korrekt in `src/officialSources.ts` und
muss in die Legende, nicht in eine Fußnote.

---

## 3. Schweiz — MeteoAlarm-Feed

```
offiziell:      https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-switzerland
undokumentiert: https://feeds.meteoalarm.org/api/v1/warnings/feeds-switzerland
```

Gemessene Struktur (JSON-Variante, CAP 1.2):

```json
"identifier": "2.49.0.0.756.0.CH.260803110149c5aa39663bba5f271732"
"sender":     "meteoalarm.cap@meteoswiss.ch"
"status":     "Actual"
"msgType":    "Update"
"scope":      "Public"
```

- **Jedes** `area`-Objekt trägt ein `polygon` — kein Objekt nur mit `areaDesc`/`geocode`
- `info`-Felder deckungsgleich mit dem DWD-Profil: `event`, `headline`, `description`,
  `instruction`, `severity`, `urgency`, `certainty`, `senderName`, `eventCode`,
  `parameter`, `effective`, `onset`, `expires`, `web`, `area`
- Severity live gemessen: `Minor` **und** `Extreme` — die im DWD-Vollstand bis heute
  ungemessenen oberen Stufen (`warnField.ts` ⚠️-Kommentar) sind hier real belegbar
- Lizenz CC BY 4.0, key-frei, stabiler Latest-Alias (die Länder-URL *ist* der Alias)

**Der offizielle Vertrag ist der Atom-Feed**, die `/api/v1`-JSON-Variante ist das
undokumentierte Website-Backend. Der Atom-Feed ließ sich in dieser Recherche nicht im
Klartext dekodieren (gzip) — **seine innere Struktur ist noch unverifiziert**. Vor der
Wahl zwischen beiden gehört ein realer Payload-Mitschnitt (→ §6).

---

## 4. Vier Fallstricke, die eine naive Implementierung falsch machen würde

### 4.1 ⚠️ Höhenbänder der CH sind **Meter**, nicht Fuß — der teuerste Fehler

CAP 1.2 definiert `altitude`/`ceiling` normativ als **Fuß über NN**. DWD hält sich daran,
erkennbar an den krummen Zahlen: `1968.50394 ft` = exakt 600 m, `9842.5197 ft` = exakt
3000 m. `capAlerts.ts:246` rechnet deshalb korrekt mit `FEET_TO_M`.

MeteoSchweiz schreibt dagegen **runde Meterwerte** in dasselbe Feld. Gemessene
`ceiling`-Werte im CH-Feed: **`800.0`, `600.0`, `3000`** — alle glatt, keine mit
Nachkommastellen. Die 800 m sind die amtliche Schweizer Warnschwelle
(Niederungen unter 800 m / Berge über 800 m, Fachbericht MeteoSchweiz Nr. 276).

**Konsequenz:** Würde `feetToM()` auf die CH-Werte angewandt, entstünde aus einer Warnung
„gilt nur unterhalb 800 m" der Satz „gilt nur unterhalb **244 m**" — eine amtliche Warnung
wäre **verfälscht** und in ihrer Aussage umgedreht. Das ist ein Verstoß gegen die
Sonderregel des Warn-Layers und gegen die MeteoSchweiz-Lizenzklausel („nur unverzüglich und
**inhaltlich unverändert**").

→ Die Einheit muss **pro Quelle** geführt werden, nicht global im Parser angenommen.

### 4.2 Fünf Sprachen pro Meldung — `parseCapAlert` nimmt heute die falsche

Jede CH-Meldung trägt fünf `info`-Blöcke: `en`, `de`, `fr`, `it`, `rm`. `capAlerts.ts:281`
nimmt via `block(alert.inner, 'info')` unbedingt den **ersten** — im gemessenen Feed ist
das `en`. Der Steckbrief zeigte dann „Extreme heat wave" statt „Extreme Hitzewelle".

→ `info`-Auswahl über `language` (mit dokumentiertem Fallback), nicht über die Reihenfolge.

### 4.3 `lat,lon` statt `lon,lat`

Gilt für CH genauso wie für DWD. `parsePolygon()` in `capAlerts.ts:327` dreht bereits
korrekt — beim Anschluss der neuen Quelle darf die Drehung nicht doppelt passieren.
Die Plausibilitätsgrenzen dort fangen ein vertauschtes Paar **nicht** ab.

### 4.4 Drei unterschiedliche Stufenskalen

| | Skala | Werte |
|---|---|---|
| DWD (CAP) | 4 | `Minor` / `Moderate` / `Severe` / `Extreme` |
| GeoSphere AT | 3 | `wlevel` 1 = gelb · 2 = orange · 3 = rot |
| MeteoSchweiz | 5 | Stufe 1 (grün) … 5 (dunkelrot) — über CAP auf 4 gemappt |

Die **Nummern sind nicht kompatibel** (DWD-Stufe 1 = gelb, CH-Stufe 1 = grün/keine Gefahr).
Ein gemeinsames Rendering darf ausschließlich über Farbe/Severity mappen, nie über die
Stufennummer. Vorschlag im Sinne von D-04: **Stufen quellenrein führen**, nur die Farbskala
teilen — die AT-Dreistufigkeit nicht künstlich auf vier aufblähen.

Für AT sind die Farben nicht in den Daten enthalten (anders als DWDs `AREA_COLOR`); sie
müssen aus der `wlevel`-Enum abgeleitet und als abgeleitet gekennzeichnet werden.

---

## 5. Transport und Repo-Anschluss

| | Weg | Begründung |
|---|---|---|
| AT | **direkt aus dem Browser** | `access-control-allow-origin: *`, `GET, HEAD`, `max-age 600` — steht bereits in `docs/API.md` §0 unter „Direkt" |
| CH | **Netlify-Rewrite** `/_meteoalarm/*` → `feeds.meteoalarm.org/:splat` | kein CORS; Muster wie `/_dwd_opendata` |

**Wichtig zur STOPP-&-FRAGEN-Regel:** Ein Eintrag in `netlify.toml` ist ein *Rewrite*, keine
Edge Function — die Regel („Änderungen an Edge Functions/Warm-Crons/Manifest-Mechanik")
greift hier nicht. Ein Rewrite ist hier auch **fachlich** der richtige Weg, weil
`docs/API.md` §7 für Warnungen einen Durable-Cache ausdrücklich ausschließt.

**Polling:** AT über `HEAD /getWarnstatus` → `Last-Modified`, nur bei Änderung nachladen.
CH ohne `ETag`, aber mit `cache-control: max-age=0, private, must-revalidate` — der Origin
will selbst keinen Cache. Der bestehende 5-Minuten-Takt des Layers passt für beide.

**Betroffene Dateien:**

| Datei | Änderung |
|---|---|
| `src/warnings/capAlerts.ts` | Sprachauswahl über `language`; Höheneinheit pro Quelle statt fest Fuß |
| `src/warnings/warnField.ts` | Quellen-Feld in `WarnFeatureProperties`; Stufen-/Farb-Mapping je Quelle |
| `src/sources/` (neu) | `geosphereWarnings.ts` (AT), `meteoAlarmCh.ts` (CH) |
| `src/officialSources.ts` | `hasOwnWarnings()` und `verifyOfficialSources()` — der Selbsttest **erzwingt heute aktiv**, dass AT/CH keine eigenen Warnungen haben (Zeile 94) |
| `netlify.toml` | ein Rewrite-Block für `/_meteoalarm/*` |
| `vite.config.ts` | denselben Proxy für den Dev-Server |
| `docs/API.md` §8.2, `docs/DATA_SOURCES.md` §9.3 | Korrekturen aus §1 |

Die Deep-Links in `officialSources.ts` bleiben **erhalten**, auch wenn eigene Daten kommen —
für AT wegen der Dauersiedlungsraum-Lücke, für CH als amtliche Primärquelle. Das ist zugleich
die Oberste Direktive (Funktionserhalt).

**Reprojektion AT:** Bei der Dependency-Askese (D-06) spricht viel dafür, die inverse
Lambert-Conformal-Conic samt Bessel-Datumsshift handzuschreiben (~40 Zeilen) statt `proj4`
aufzunehmen — dieselbe Linie wie beim handgeschriebenen GRIB2-Decoder. Parameter:
`lat_1=49`, `lat_2=46`, `lat_0=47.5`, `lon_0=13.33333`, `x_0=y_0=400000`, Ellipsoid
Bessel 1841. Ohne Datumsshift bleibt ein Versatz von einigen hundert Metern — auf
Warnflächenebene tolerierbar, aber bewusst zu entscheiden und zu dokumentieren.

---

## 6. Offene Punkte vor einem Gate

1. **Atom vs. JSON für CH.** Der Atom-Feed ist der offiziell zugesagte Vertrag, seine innere
   Struktur ist aber unverifiziert (gzip). Die JSON-Variante ist verifiziert, aber
   undokumentiert und kann ohne Ankündigung brechen. → Ein Payload-Mitschnitt des Atom-Feeds
   entscheidet das; Kandidat für Flag-Gating nach „Rule 2" mit dem jeweils anderen als Fallback.
2. **CORS-Gegenprobe CH** mit echtem Origin-Header
   (`curl -I -H "Origin: https://buscosun.com" …`). Das Fehlen von `Access-Control-Allow-Origin`
   im Blind-Scan ist ein starkes Indiz, kein Beweis.
3. **MeteoAlarm-T&C im Volltext** (`meteoalarm.org/en/page/terms-and-conditions`) — die
   CC-BY-4.0-Angabe stammt von den Portalseiten, nicht aus dem T&C-Volltext. Einmal manuell lesen.
4. **CH-Auflösung im Vergleich:** MeteoSchweiz warnt intern in **159 Warnregionen**. Ob die
   MeteoAlarm-Polygone diesen Schnitt tragen oder gröber sind, ist offen — für die Legende
   relevant, nicht für die Machbarkeit.
5. **Vollständige `wtype`/`event`-Abdeckung** beider Quellen an einer echten Lage prüfen
   (heute nur Hitze + Gewitter im Feed).

---

## 7. Nebenbefund

`GET https://warnungen.zamg.at/wsapp/api/getGewitterAuto` liefert automatische
Gewitter-Nowcasts als MultiPoint mit Intensitätsstufe je Gemeinde. Inhaltlich nahe am
bestehenden `cells`-Layer (KONRAD3D) und ein Kandidat, dort die AT-Lücke zu schließen —
gehört aber klar in eine eigene Phase.

---

## 8. Nachmessung 2026-08-08, 18:11–18:16 UTC (Phase W2, erste Sitzung)

> Diese Sektion korrigiert §3 und §6 **an gemessenen Payloads**. Sie ist vor jeder Zeile
> Code entstanden (Diagnose-First) und beantwortet die offenen Punkte 1, 2 und 3 aus §6.
> Alle Zahlen stammen aus einem Mitschnitt derselben Minute; die Rohdateien liegen im
> Sitzungs-Scratchpad (`ch-atom.raw`, `ch-json.raw`, drei `alert-*.xml`).

### 8.1 Der Atom-Feed ist lesbar — aber er trägt **keinen amtlichen Warntext**

§3 hielt die innere Struktur des Atom-Feeds für unverifiziert („gzip"). Das war ein
Artefakt des damaligen Abrufs: mit `curl --compressed` kommt **Klartext-XML**, 268 509 B,
`content-type: application/atom+xml`. Der Feed ist also uneingeschränkt lesbar.

Entscheidend ist, **was fehlt**. Vollständige Elementliste über den ganzen Feed:

```
cap:areaDesc  cap:certainty  cap:effective  cap:event   cap:expires  cap:identifier
cap:message_type  cap:onset  cap:polygon    cap:scope   cap:sent     cap:severity
cap:status    cap:urgency
```

Nicht enthalten — je **0** Vorkommen im gesamten Feed: `headline`, `description`,
`instruction`, `senderName`, `language`, `altitude`, `ceiling`, `eventCode`, `parameter`,
`geocode`, `web`, `references`.

**Konsequenz:** Der Atom-Feed kann die Warn-Sonderregel („Zitat statt Zusammenfassung")
**nicht allein erfüllen** — es gibt nichts zu zitieren. `cap:event` ist zudem **englisch**
(`Heat wave`, `Extreme heat wave`, `Heavy thunderstorm`). Auch das Höhenband fehlt
vollständig. Die Annahme aus §6.1, Atom und JSON seien zwei austauschbare Varianten
derselben Information, ist damit **widerlegt**.

Was der Feed dafür mitbringt und die JSON-Variante **nicht** hat:
- `<updated>2026-08-08T18:05:41.121880Z</updated>` auf Feed-Ebene — die einzige
  Frischebelegung dieser Quelle überhaupt (s. §8.4), und damit die Antwort auf die
  Leerfall-Frage aus V-19.
- `<title>` je Eintrag mit dem **amtlichen Farbwort**: „**Orange** High-temperature
  Warning …", „**Red** …".
- je Eintrag `<link type="application/cap+xml" href="…/api/v1/warnings/feeds-switzerland/<uuid>"/>`
  — der Feed **verweist selbst** auf das vollständige CAP-Dokument (s. §8.3).

Mitgemessen: 33 Einträge, 33 verschiedene `identifier`, alle mit Index-Tupel
`index_info=0 & index_area=0 & index_polygon=0`. Das Schema sieht also mehrere Einträge je
Meldung vor, wenn eine Meldung mehrere Gebiete hat; in diesem Mitschnitt hatte **jede**
Meldung genau ein Gebiet. ⚠️ Ein Mehrgebiets-Fall ist damit **nicht** belegt — die
Geometrie-Vollständigkeit des Atom-Feeds ist plausibel, aber ungeprüft.

### 8.2 Die JSON-Variante ist ein **Archiv**, kein Vollstand — und 12,9 MB groß

| Messwert | JSON-Liste | Atom-Feed |
|---|---|---|
| Bytes auf der Leitung | **12 913 511** (12,9 MB) | 268 509 |
| Dauer | **6,6 s** | 0,24 s |
| Kompression | **keine** — der Server ignoriert `Accept-Encoding: gzip, deflate, br` (kein `content-encoding` in der Antwort) | dito |
| Meldungen | 306 | 33 |
| davon zum Abrufzeitpunkt **bereits abgelaufen** | **282** | — |
| Zeitraum `sent` | 2026-07-28 … 2026-08-08 (**~12 Tage**) | — |
| Frischestempel im Dokument | **keiner** (einziger Top-Level-Schlüssel: `warnings`) | `<updated>` |

Zum Vergleich: der DWD-Vollstand für ganz Deutschland ist **112 476 B**. Die
JSON-Variante kostet also das **115-Fache** für ein Zehntel der Fläche — bei einem
5-Minuten-Takt und über den Netlify-Proxy.

Zur Dedup-Frage aus dem Kickoff: 128 der 306 Meldungen sind `msgType: "Update"` mit
`references`. Von den 111 referenzierten Kennungen ist **keine einzige** noch im Feed
enthalten — abgelöste Meldungen werden also entfernt. **Ein Dedup gegen `references` ist
nicht nötig**; der Zeitfilter erledigt die abgelaufenen. Die Bytes bleiben trotzdem.

### 8.3 Der dritte Weg: das je-Meldung-CAP-Dokument, auf das der Atom-Feed zeigt

Der `application/cap+xml`-Link jedes Atom-Eintrags liefert **echtes CAP 1.2**, 38–48 kB:

```xml
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>2.49.0.0.756.0.CH.26080810581837b8ac60900fc5f2e1d9</identifier>
  <sender>meteoalarm.cap@meteoswiss.ch</sender>  <status>Actual</status>
  <info><language>en</language> … </info>   ← 5 Blöcke: en · de · fr · it · rm
```

Enthalten sind alle im DWD-Profil genutzten Felder: `headline`, `description`,
`instruction`, `senderName`, `severity`, `altitude`/`ceiling`, `eventCode`, `parameter`,
`web`, `area`/`polygon`. **`parseCapAlert()` kann dieses Dokument unverändert lesen** —
es ist dasselbe Format, für das der Parser gebaut wurde.

Die Kennungen sind unveränderlich ⇒ ein Cache je `identifier` ist trivial korrekt: im
Dauerbetrieb kostet ein Poll den Index (268 kB) plus die CAP-Dokumente nur der **neu**
hinzugekommenen Meldungen.

### 8.4 Frische: **kein** `Last-Modified`, **kein** `ETag` — auf keinem der drei Endpunkte

Alle drei antworten mit `cache-control: max-age=0, private, must-revalidate` und **ohne**
`last-modified`/`etag`. Der W1-Mechanismus (Dateizeit als Frischebeleg im Leerfall,
V-19) trägt hier also **nicht**. Einzige Alternative ist der `<updated>`-Stempel des
Atom-Feeds — er existiert nur dort, nicht in der JSON-Variante. Ein Leerfall „keine
Warnungen in der Schweiz", der aus der JSON-Liste stammt, hätte **keinerlei**
Frischebelegung und dürfte so nicht angezeigt werden.

### 8.5 CORS-Gegenprobe (offener Punkt §6.2) — **erledigt, negativ**

`curl -H "Origin: https://buscosun.com"` gegen **beide** Endpunkte: `HTTP/1.1 200 OK`,
**kein** `Access-Control-Allow-Origin` in der Antwort. Das Indiz aus §5 ist damit ein
Beleg: ein Proxy ist zwingend.

### 8.6 Farbe: kein `AREA_COLOR` — aber die amtliche Stufe **liegt bei**

Bestätigt: der einzige `eventCode`-`valueName` ist `NinjoWarnTypeId` (1530 Vorkommen =
306 Meldungen × 5 Sprachen). **Kein `AREA_COLOR`, kein `LICENSE`** ⇒ `a.license` bleibt
für CH leer, und `warnColor()` fiele heute auf `SEVERITY_FALLBACK_COLOR` zurück — also
auf DWD-Werte, die für `Severe`/`Extreme` ausdrücklich **ungemessen** sind
(`warnField.ts:44`).

Der Ausweg steht in den Daten, nur an anderer Stelle — in `<parameter>`:

| `awareness_level` | `severity` | Ereignis (de) |
|---|---|---|
| `3; orange; Severe` | Severe | Markante Hitzewelle · Heftiges Gewitter |
| `4; red; Extreme` | Extreme | Extreme Hitzewelle |

Damit liefert die Quelle **Stufennummer und amtliches Farbwort selbst**. Der RGB-Wert
bleibt unsere Zutat und ist als abgeleitet zu kennzeichnen (D-04) — oder aus der
amtlichen MeteoAlarm-/MeteoSchweiz-Farbtafel zu belegen.

Gemessene Severities: `Minor` 128 · `Severe` 154 · `Extreme` 24 — **kein `Moderate`**.
`Extreme` ist damit erstmals real belegbar; im DWD-Bestand ist es bis heute ungemessen
(offener Punkt aus Gate GW1, V-156).

Gegenprobe zur Sprachauswahl: `severity`, `ceiling` und `areaDesc` sind über alle fünf
`info`-Blöcke **identisch** (0 von 306 Meldungen weichen ab). Die Sprachauswahl ändert
also ausschließlich Text — nicht Einstufung oder Geometrie.

### 8.7 ⚠️ Neue Falle: `ceiling` **widerspricht** dem amtlichen Text

§4.1 ist bestätigt — `altitude` durchweg `0.0`, `ceiling` ∈ {`800.0`, `600.0`, `3000`},
glatte Meterwerte, `feetToM()` darauf wäre eine Verfälschung.

Beim Gegenlesen fiel jedoch ein **zweiter, feinerer Fehler** auf, den §4.1 nicht kennt:
Das strukturierte Feld stimmt nicht immer mit der Prosa derselben Meldung überein.

- **97** deutschsprachige Meldungen enthalten den Satz „Warnung gilt unterhalb von N m ü.M."
- bei **32** davon widerspricht `ceiling` dieser Angabe
- Live-Beispiel (gültige Meldung, Mitschnitt `alert-Severe-00fd11b4…xml`):
  `<description>` sagt „Warnung gilt **unterhalb von 800 m** ü.M.", `<ceiling>` sagt
  **`3000.0`** — genau der Wert, den `CEILING_UNRESTRICTED_M` als „keine
  Höhenbeschränkung" liest.

**Konsequenz:** Ein aus `ceiling` erzeugter Höhenband-Hinweis würde bei diesen Meldungen
**schweigen**, obwohl der amtliche Text eine Einschränkung ausspricht — die Fläche
überzeichnete die Warnung, und zwar unbemerkt. Bei DE war genau das umgekehrt belegt
(GW1: Steckbrief „600 m" ↔ Meldungstext „600m", `tests.md` §V-WARNUNGEN). Für CH gilt:
**der Text ist die Wahrheit, das Feld ist es nicht.** Da der Text ohnehin wortwörtlich
zitiert wird, ist die ehrliche Lösung, den Höhenband-Hinweis für CH **nicht** aus
`ceiling` zu erzeugen, statt eine falsche Zusatzaussage zu bauen. → `improvements.md`
V-176.

### 8.8 Lizenz — die Repo-Angabe „CC BY 4.0" ist zu knapp

Wörtlich aus `<rights>` des Atom-Feeds:

> „Copyright © 2026 MeteoAlarm.Org. Licensed under **terms equivalent to CC BY 4.0, with
> additional requirements for redistributing** outlined in our Terms and Conditions."

Das ist **nicht** dasselbe wie „CC BY 4.0", wie `docs/API.md` §8.2 und
`docs/DATA_SOURCES.md` §9.3 es heute führen. Offener Punkt §6.3 (T&C im Volltext lesen)
bleibt damit offen und wird durch diesen Fund **dringender**, nicht erledigt.
Weiter gemessen: `senderName` lautet in **allen** Sprachblöcken „MeteoSwiss" (nicht
„MeteoSchweiz"), `web` durchweg `http://www.meteoswiss.admin.ch` (**http**, nicht https).

### 8.9 Doku-Widersprüche, die dieser Sitzung aufgefallen sind

1. `docs/DATA_SOURCES.md` **§9.4** (Vergleichstabelle) führt CH weiterhin als „—" und
   MeteoAlarm als „⚠️ BBox / Note 4" — das widerspricht der Korrektur in §9.3 derselben
   Datei. Die Tabelle wurde beim Nachziehen am 2026-08-08 übersehen.
2. `improvements.md` schreibt am Dateiende als nächste freie Nummer **V-176**; der
   Kickoff `prompt-warnungen-ch.md` nennt **V-174** — die Nummer ist seit dem
   Windpartikel-Befund vergeben (V-174, V-175). Gültig ist die Datei: **V-176**.
3. Der Kickoff nennt als Regressions-Baseline u. a. `verify:cells` mit **64/64**; gemessen
   sind **133/133** (Phase Z2 hat den Harness erweitert). Deshalb die Kickoff-Regel
   „Zahlen messen, nicht aus Dokumenten übernehmen" — sie hat hier direkt gegriffen.

---

## 9. Umsetzung W2 — Selbstverifikation (Gate GW2, 2026-08-08)

Die fünf Fragen aus `CLAUDE.md` §Verifikation, schriftlich und mit Beleg. Protokoll:
`tests.md` §V-WARNUNGEN-CH. Gate: `checklist.md` §Phase W2.

**1 · Funktionserhalt, einzeln je Funktion.**

| Funktion (W1) | Beleg, dass sie unverändert ist |
|---|---|
| DWD-Abruf | `fetchDwdWarnings()` unangetastet — URL, 60-s-TTL, Rückgabeform identisch |
| CAP-Parser DE | Vorgaben `altitudeUnit: 'feet'` + erster `<info>`-Block = exakt das W1-Verhalten; zusätzlicher Check belegt, dass selbst `language: 'de'` am DWD-Ergebnis **nichts** ändert (`de` trifft `de-DE`) |
| Höhenband DE | Feature trägt weiterhin „gilt nur unterhalb 600 m Höhe" (Verifier + Steckbrief live, Kreis Donau-Ries) |
| Amtliche Farbe DE | `#cc99ff` aus `AREA_COLOR`, kein Fallback (Verifier + Steckbrief live) |
| Lizenz DE | „© GeoBasis-DE / BKG 2021 (Daten modifiziert)" reist bis in die Fußzeile |
| Alle Warnungen am Klickpunkt | Sortier- und Popup-Logik unberührt; Verifier-Checks unverändert grün |
| Zeitfilter / Slider | unverändert; 23 DE-Warnungen bei +15 h vorher wie nachher |
| Deep-Links AT/CH | `warningsSourceFor()` unverändert, AT behält den Dauersiedlungsraum-Vorbehalt |
| Punkt-Vorhersage | `hasOwnWarnings()` **nicht** angefasst ⇒ der AT/CH-Hinweis in `PointForecastPanel` bleibt exakt wie er war |
| 101 W1-Checks | **unverändert im Code** und grün (175/175 gesamt) |

**2 · Desktop pixelgleich außerhalb des Warn-Layers.** Alle Änderungen liegen im Layer
`warnings` (Quelle, Legende, Steckbrief, Layertext) plus zwei Transport-Einträge. Kein
gemeinsames CSS, kein Shader, kein Token angefasst. Vergleich
`before/desktop-de-23-warnungen-plus15h.png` gegen `desktop-de23-ch7-plus15h.png`: außerhalb der
Warnflächen und der Statuszeile keine Abweichung; die deutschen Flächen selbst sind identisch
(23 Warnungen, gleiche Farben, gleiche Geometrie).

**3 · Touch-Targets ≥ 44 px.** Gemessen auf iPhone 12 Pro 390×844 DPR 3 über alle
`[role=switch]` und die Bottom-Nav: **kein** Ziel unter 44 px. (Die aus W1 bekannte
Dock-Zeilen-Unterschreitung auf **Desktop** — 200×40 px, V-155 — ist vorbestehend und von dieser
Phase unberührt.)

**4 · Konsole sauber.** Nach sauberem Reload 0 Fehler / 0 Warnungen, Desktop und mobil. Die
zwischenzeitlich sichtbaren 500er stammten aus Vite-HMR während der laufenden Bearbeitung
(und zuletzt aus dem fremden Syntaxfehler in `src/wind/shaders.ts`, s. §9-Schluss) — nicht aus
Anwendungscode.

**5 · Keine Long Tasks > 200 ms — NICHT BESTANDEN, sondern NICHT ENTSCHEIDBAR.**
Dieselbe Konfiguration lieferte über mehrere Läufe **216 ms** und **10 333 ms**; die
*DE-only*-Variante, die diese Phase gar nicht anfasst, fiel dabei **schlechter** aus als beide
Quellen zusammen (854 / 526 / 428 ms). Damit misst der Aufbau nicht die Anwendung, sondern sich
selbst — die in `agents.md` §7 dokumentierte MCP-Verzerrung. Die Frage wird deshalb **offen**
ausgewiesen und nicht abgehakt; sie braucht eine Real-Device-Messung. Was belastbar gemessen
werden konnte, steht im Protokoll: Netzdisziplin (0 Requests vor Aktivierung), Kaltstart
(25 Requests / 1,32 MB) und Warmstart (1 Request / 263 kB).

**Fremdbefund, nicht Teil dieser Phase.**
`src/wind/shaders.ts:568` trug mitten in der Sitzung eine **hinzugefügte** Zeile der
uncommitteten Windpartikel-Arbeit mit Backticks um `hasWind` in einem GLSL-Kommentar — das
beendet das umgebende JS-Template-Literal und legte Dev-Server und Build lahm. Auf Jans Weisung
nicht angefasst; extern behoben, danach `typecheck` und `build` wieder grün.

---

## Quellen

- [MeteoAlarm Feeds](https://feeds.meteoalarm.org/) · [CH-Feed (JSON)](https://feeds.meteoalarm.org/api/v1/warnings/feeds-switzerland) · [AT-Feed (JSON)](https://feeds.meteoalarm.org/api/v1/warnings/feeds-austria)
- [GeoSphere Warn-API (OpenAPI 1.1.0)](https://openapi.hub.geosphere.at/warnapi/v1/) · [Datensatz „warnungen-v1"](https://data.hub.geosphere.at/dataset/warnungen-v1) · [Lizenz/Attribution](https://data.hub.geosphere.at/legal)
- [MeteoSwiss Terms of Use (CC BY 4.0, Warn-Sonderklausel)](https://opendatadocs.meteoswiss.ch/general/terms-of-use) · [Gefahrenstufen](https://www.meteoswiss.admin.ch/weather/hazards/explanation-of-the-danger-levels.html)
- [Fachbericht MeteoSchweiz Nr. 276 (159 Warnregionen, 800-m-Schwelle)](https://www.meteosuisse.admin.ch/dam/jcr:e5cb361d-62bb-42dc-b478-fde7919a59c3/Fachbericht_MeteoSchweiz_Nr.276.pdf)
- [MeteoAlarm EDR-API (registrierungspflichtig, Bounding-Boxen)](https://api.meteoalarm.org/edr/v1/)
