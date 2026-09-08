# audit/teilen-share.md — „Auswahl teilen" (Phase SH)

> **Stand: 2026-09-08. SH0 = Diagnose + Plan. Kein Code geschrieben.**
> Auftrag Jans: Teilen-Button je Feature-Seite, Zustand vollständig und **lesbar**
> in der URL, Share-Sheet mit Kanälen, serverseitiges Vorschaubild.
> Diagnose-First (CLAUDE.md): dieses Dokument ist die Voraussetzung für jeden Commit.

---

## §0 Auftrag, Abgrenzung, Vorgehen

**Ziel.** Ein Nutzer trifft auf einer der neun Feature-Seiten eine Auswahl und schickt
genau diesen Zustand an jemanden. Der Empfänger landet auf derselben Ansicht. Der Link
sieht dabei nach buscosun aus und ist lesbar.

**Harte Vorgaben (Jan, 2026-09-08).**
- **A** — der Link trägt den ganzen Zustand. Kein Server-Snapshot, keine Kurz-ID, kein Speicher.
- **B** — die URL bleibt lesbar: sprechender Pfad, Ortsname als Slug, verständliche Enums,
  kein base64/LZ als Normalweg, keine Tracking-Parameter.
- Versioniertes Schema (`v`), nur Abweichungen vom Standard serialisieren, aggressiv runden,
  absolute Zeitangaben, Ziel < 500 Zeichen (hart 1500), robust gegen kaputte Links,
  Rückwärtskompatibilität.

**Nicht Gegenstand dieser Phase:** Empfänger-Tracking, Konten, Kurz-URL-Dienste,
fremde Domains, kostenpflichtige Dienste.

**Vorgehen** (Jans Reihenfolge): 1. Code analysieren · 2. Doku aktualisieren ·
3. **erst nach Jans Bestätigung** implementieren.

---

## §1 Diagnose — wie der Zustand heute in der URL steht

### 1.1 Es gibt zwei Mechanismen, nicht einen

| Gruppe | Seiten | Wo der Zustand steht | Modul |
|---|---|---|---|
| **Query** (RT1, 2026-08-22) | Wetterkarte, Warnungen, Regenradar | Pfad + `?…` | `src/router/urlState.ts` (rein, 432 LOC; `verify:routing` **153/153** am 2026-09-08 nachgezählt — die 105 im CLAUDE.md-Kopf sind fortgeschrieben und veraltet) |
| **Fragment** (Alt, 2026-07) | Waldbrand, Atmosphäre, Event, Wetterarchiv, Globus | `#wb=` `#atm=` `#ev=` `#h=` `#g=` — prozentkodiertes JSON | `fireState.ts`, `atmosphereState.ts`, `eventState.ts`, `historyState.ts`, `GlobePage.tsx` |
| **gar nichts** | Tourenplanung, Vorhersage, Feedback, Validierung | — | — |

Die Pfad-Ebene ist überall schon da: `/waldbrand/aktive-braende`, `/atmosphaere/querschnitt`,
`/eventplanung/hochzeit` usw. sind seit SEO/GEO E7 kanonische Pfade. Aber der Pfad trägt nur
ein **Preset** (`fireRouteView.ts`: „die Sub-Route sagt, was die Seite beim Öffnen ohne Hash
vorbelegt") — der eigentliche Zustand liegt daneben im Fragment.

### 1.2 Der entscheidende Befund: das Fragment erreicht den Server nie

Ein `#…`-Fragment wird vom Browser **nicht mitgesendet**. Daraus folgt dreierlei:

1. **Teil 4 (Vorschaubild) ist mit dem heutigen Zustandsmodell für fünf von neun Seiten
   grundsätzlich unmöglich** — auch mit Edge Function. Der Crawler von WhatsApp sieht bei
   `…/waldbrand/aktive-braende#wb=%7B…%7D` exakt `…/waldbrand/aktive-braende`.
2. Der Netlify-Rewrite (`netlify.toml`) und die erzeugte Shell (`generate-seo.mjs`) können
   den Zustand nicht kennen — Titel und Beschreibung bleiben generisch.
3. WhatsApp/Signal/iMessage schneiden beim Erkennen von Links gelegentlich am `#` ab; ein
   Link, dessen Bedeutung hinter dem `#` steht, ist damit still kaputt.

**Der Umzug von Fragment nach Query ist deshalb keine Kosmetik, sondern die Voraussetzung
für Teil 4.** Er ist der teuerste Teil dieser Phase und der Grund, warum sie in Etappen zerfällt.

### 1.3 Gemessen: so sehen die teilbaren Links heute aus

Messlauf gegen die echten Codecs (`node --experimental-strip-types --import
./scripts/lib/register-ts.mjs`, Ort/Layer/Zeit realistisch gesetzt):

| Seite | Zeichen | Link (gekürzt) |
|---|---:|---|
| Regenradar | 110 | `…/regenradar?lat=48.1374&lon=11.5755&z=8&ort=M%C3%BCnchen&olat=…&land=de` |
| Wetterarchiv | 144 | `…/wetterarchiv#h=n=Stuttgart&ll=48.7758%2C9.1829&a=Baden-W%C3%BCrttemberg&v=tmax&…` |
| Wetterkarte | 160 | `…/wetterkarte/wind?lat=47.8744&…&t=2026-09-12T15%3A00Z&l=boeen&ort=Feldberg+%28Schwarzwald%29&…` |
| Atmosphäre | 192 | `…/atmosphaere/berg-und-weg#atm=%7B%22l%22%3A%5B47.2692%2C11.4041%2C%22Innsbruck%22…` |
| Waldbrand | 195 | `…/waldbrand/aktive-braende#wb=%7B%22b%22%3A37124%2C%22d%22%3A0%2C%22w%22%3A48%2C…` |
| Globus | 238 | `…/globus#g=%7B%22ov%22%3A%22temp%22%2C%22ht%22%3A%22sfc%22%2C%22fh%22%3A24%2C…` |
| Atmosphäre + Schnitt | 247 | `…#atm=…%2C%22c%22%3A%5B%5B47.2%2C11.3%5D%2C%5B47.4%2C11.5%5D%5D%7D` |
| **Eventplanung** | **340** | `…/eventplanung/hochzeit#ev=%7B%22a%22%3A%5B%22wedding%22%2C%22Hochzeit%22%5D%2C…` |

Die Längen sind unkritisch. Das Problem ist die **Form**: fünf von acht Links sind
prozentkodiertes JSON — genau der „kryptische Zeichensalat", den Jans Vorgabe B ausschließt.
Selbst die Query-Seiten leiden: `t=2026-09-12T15%3A00Z` und `ort=Feldberg+%28Schwarzwald%29`
sind nur deshalb unleserlich, weil `URLSearchParams.toString()` `:` und `()` kodiert, obwohl
RFC 3986 beide im Query-Teil erlaubt.

### 1.4 Die Zeit ist an fünf Stellen verschieden gedacht

| Seite | Form | absolut? | Bewertung |
|---|---|---|---|
| Wetterkarte | `t=2026-09-12T15:00Z` | ja | richtig — aber s. **V-SH-2** |
| Eventplanung | `w:['r','2026-09-18','2026-09-25']` | ja | richtig |
| Wetterarchiv | Jahr/Monat/Tag | ja | richtig |
| Atmosphäre | `h` = Stunden ab jetzt (0…48) | **nein** | Empfänger sieht etwas anderes |
| Waldbrand | `d` = Tage ab heute, `h` = Stunden ab jetzt | **nein** | Empfänger sieht etwas anderes |
| Globus | `fh` = Vorhersagestunde 0…120 ab dem GFS-Lauf | **nein** | driftet mit jedem neuen Lauf |
| 3D/Schnitt (`#3d=`) | `t` = Millisekunden-Epoch | ja | absolut, aber unlesbar |

Drei Seiten verletzen Jans Absolut-Vorgabe. „Schau dir mal die Böen an" zeigt dem Empfänger
zwei Stunden später eine andere Stunde.

### 1.5 Der Ort ist fünfmal verschieden kodiert

| Form | Wo |
|---|---|
| `ort=…&olat=…&olon=…&land=de` | Wetterkarte, Regenradar (`urlState.ts`) |
| `l:[lat, lon, name, country]` | Waldbrand, Atmosphäre, Event, `#m=`, `#3d=` |
| `n=…&ll=lat,lon&a=admin` | Wetterarchiv |
| `pin:[lon, lat]` — **Achsen vertauscht** | Globus (`GlobePage.tsx:91`) |
| gar nicht | Vorhersage, Tourenplanung |

Die Globus-Form ist die bekannte Achsenfalle (vgl. die repo-weite Lehre 2 aus der
Waldbrand-Linie). Eine Teilen-Funktion, die je Seite anders rechnet, wird genau hier Fehler
machen. **Ein Ort-Codec für alle** ist die Voraussetzung.

### 1.6 og:image: heute zeigt fast jeder geteilte Link die generische Startseiten-Karte

`src/router/routes.ts` setzt `ogImage` an genau **zwei** Stellen: `/wetterkarte`
(`/og/wetterkarte.png`) und `/atmosphaere` (`/og/atmosphaere.png`). Alle anderen sieben
Feature-Seiten und **alle 37 indexierbaren Sub-Routen** fallen auf `DEFAULT_OG_IMAGE =
'/og/home.png'` zurück (`scripts/seo/content.mjs:303`, `routeHeadExtras`/`subRouteHeadExtras`);
im Client (`RouteMeta.tsx`) fällt `og:image` sogar ganz weg, weil dort nur `base.ogImage` gilt.

Das widerspricht Jans Vorgabe („kein generisches Standardbild") — und es ist der **billigste
große Hebel** der ganzen Phase: der Karten-Renderer existiert bereits
(`public/_og-card.html`, 74 fertige PNGs, Rezept in `docs/seo-geo/og-images.md`), es fehlt
fast nur die Verdrahtung.

### 1.7 Was heute schon „Teilen" heißt

- `src/event/EventResult.tsx:246` — „Link teilen" kopiert `origin + pathname + #ev=…` in die
  Zwischenablage. Einziger echter Share-Weg im Repo.
- `src/atmosphere/AtmosphereDeck.tsx:167, 744, 848` — drei Knöpfe „Link teilen" / „PDF"
  **ohne `onClick`**. Sie tun nichts. (**V-SH-1**)
- `navigator.share` wird nirgends benutzt. `navigator.clipboard` an vier Stellen
  (Event, Feedback, Brand-Dossier, Brand-Historie), jedes Mal eigener Code.

### 1.8 Die Tourenplanung kann Vorgabe A nicht erfüllen

`src/route/tourStore.ts` sagt es selbst: „Der Pfad kann das nicht tragen (B3): **eine GPX
passt in keine URL**." Die Strecke liegt in IndexedDB (bis 100 000 Punkte, ~3,2 MB binär).
Eine auf 80 Stützpunkte reduzierte Polylinie wäre ~500 Zeichen — technisch möglich, aber
sie verändert Höhenprofil, Zeitplan und Bewertung, und die Seite behauptete dann eine
Genauigkeit, die sie nicht hat. **Entscheidung nötig (§11, E-4).**

### 1.9 Nebenbefunde

- `src/mapState.ts` (`#m=`) führt weiterhin eine handgeschriebene `LAYER_ORDER` mit **12 von
  19** Layern (V-191). Der Codec lebt nur noch für die Legacy-Migration
  (`legacyHash.ts`) — dort ist der Verlust folgenlos, aber die Datei ist eine Falle für jeden,
  der sie für neu hält.
- `architecture.md` §2 beschreibt noch den Vor-RT1-Zustand („`src/App.tsx` … initialisiert
  einmalig aus `location.hash`"). Wird in dieser Phase korrigiert.
- `routeForPath()` liefert für zweistufige Sub-Pfade `null` (`/wetterkarte/a/b` ⇒ 404) —
  `verifyRoutes()` prüft das ausdrücklich. Der Ort-Slug im Pfad (§2.2) muss dort mit.

---

## §2 Zielbild — ein Schema für alle neun Seiten

### 2.1 Grundregeln (v1)

1. **Pfad trägt die Identität**, Query den Rest:
   `/<feature>/<ansicht>[/<ort-slug>]?<abweichungen>`
2. **Nur Abweichungen vom Standard** werden geschrieben (Muster `fireState.ts`
   „Standard-still" und `buildMapSearch`). Wichtigster Hebel für kurze URLs.
3. **Feste Schlüsselreihenfolge** je Seite → byte-stabile Links, cachefähiger OG-Schlüssel.
4. **Werte sind lesbare Enums**: `groesse=boeen`, nicht `g=3`. Deutsch, wie die Pfad-Slugs.
5. **Rundung**: `lat`/`lon` 4 Nachkommastellen (≈ 11 m), `z` **1** (heute 2),
   Bearing/Pitch ganzzahlig und nur ≠ 0. Nachlauf-Nullen fallen weg (`fmt()` existiert).
6. **Zeit immer absolut**: `t=2026-09-12T15:00Z` (Minutenauflösung, `Z` fest — die App
   rechnet ohnehin in UTC und zeigt lokal).
7. **Keine Prozent-Kodierung, wo RFC 3986 sie nicht verlangt.** Eigener Serialisierer statt
   `URLSearchParams.toString()`: `: , ; ( ) @` bleiben roh. Beim Lesen bleibt
   `URLSearchParams` zuständig — es dekodiert beide Formen.
8. **Keine Tracking-, Session- oder Zufallsparameter.** Bestehende Kill-Switches
   (`?lz=0`, `?radarcdn=0`, `?bh=0`, `?ta=0`, `?afEst=0`, `?tour=0`) sind Diagnosewerkzeuge
   und werden **nicht** mitgeteilt — `buildShareUrl` filtert sie aus dem `extra`-Durchreicher.

### 2.2 Der Ort steht als Slug im Pfad

```
/wetterkarte/wind/muenchen                     ← Ort aus der Tabelle: Name + Koordinate bekannt
/wetterkarte/wind/feldberg-schwarzwald?ort=Feldberg (Schwarzwald)&olat=47.8744&olon=8.0043
```

- Slug-Regel = `toSlug()` aus `scripts/seo/places.mjs` (Kleinbuchstaben, ae/oe/ue/ss,
  Bindestrich). Sie wandert nach `src/share/placeSlug.ts` und wird von `places.mjs`
  **importiert** — eine Regel, nicht zwei.
- **Tabellenort** (`src/router/placeSlugs.json`, heute 198 Einträge): Slug allein genügt,
  Name und Koordinate kommen aus der Tabelle. Kürzester und schönster Fall.
- **Freier Ort** (Nominatim-Treffer): Slug im Pfad für das Auge, `olat`/`olon` für die
  Genauigkeit, `ort=` nur, wenn der Anzeigename nicht verlustfrei aus dem Slug entsteht
  (Umlaute, Klammern). Die Redundanz ist bewusst: sie kostet ~40 Zeichen und kauft die
  Lesbarkeit, die Jan verlangt.
- **Kein Ort** (DACH-Überblick): kein drittes Segment.

Der Ort-Slug macht die Route zweistufig (`/wetterkarte/:layer?/:ort?`). Netlify deckt das
bereits ab (`/wetterkarte/*` → `wetterkarte.html`, Splat matcht über Slashes). Zu ändern
sind `routeForPath()`, `router.tsx` und der Testfall `routeForPath('/wetterkarte/a/b') === null`.

**Canonical und Sitemap bleiben unberührt:** der Ort-Slug ist **nie** kanonisch
(`canonicalPath()` schneidet ihn ab) und **nie** in der Sitemap. Sonst entstünde ein
unendlicher indexierbarer Raum. Für Ortswetter gibt es die statischen Seiten
`/wetter/<slug>/` — die bleiben die SEO-Adresse.

### 2.3 Warum der Layer im Pfad bleibt und der Ort dahinter kommt

Jans Beispiel war `/wetterkarte/feldberg?layer=wind`. Das dreht die heutige Struktur um und
kostet: 18 Sub-Routen-Shells (`dist/wetterkarte--<slug>.html`), 18 Netlify-200-Rewrites, 18
Sitemap-Einträge, 18 Canonicals, die Layer-Titel/Descriptions und die E1/E2-Texte in
`src/seo/subRouteTexts.ts` hängen alle daran. `/wetterkarte/wind` ist eine **indexierte
Suchadresse**, `feldberg` ist es nicht.

Deshalb: **`/wetterkarte/wind/feldberg-schwarzwald`** — dieselbe Lesbarkeit, ohne die
SEO-Linie einzureißen. Ist Jan die Reihenfolge wichtiger als die Sub-Routen, ist das
eine eigene Etappe (§11, E-1).

### 2.4 Version

`v` wird **nur geschrieben, wenn ≠ 1**; ein fehlendes `v` bedeutet v1. Das erfüllt Jans
Versionierungsvorgabe (alte Links brechen nie: der v1-Parser bleibt erhalten und wird für
alles ohne `v` benutzt) und zugleich seine Kürze-Vorgabe (kein Ballast in 99 % der Links).
`parseShareUrl` schlägt bei unbekanntem `v` **nicht** fehl, sondern liest, was es versteht.

### 2.5 Robustheit

- Unbekannter Schlüssel ⇒ durchreichen, nie werfen (heutiges Verhalten von `parseMapSearch`).
- Bekannter Schlüssel mit ungültigem Wert ⇒ Standard, Schlüssel wird gemeldet und beim
  Ankommen per `replaceState` still aus der URL entfernt (heutiges Verhalten).
- Ort-Slug unbekannt **und** ohne `olat`/`olon` ⇒ DACH-Überblick, ein Satz im Readout
  („Der geteilte Ort ließ sich nicht auflösen"), **kein** 404.
- Jeder Parser hat eine `verify*()`-Selbstprüfung nach dem Muster D-12.

### 2.6 Rückwärtskompatibilität

- Alle `#…`-Codecs **bleiben lesbar**. Beim Ankommen wandelt ein erweiterter
  `legacyHash.ts`-Weg Fragment ⇒ Pfad+Query um und schreibt per `replace`. Der Nutzer sieht
  den neuen Link, der alte funktioniert weiter. Genau das Muster, mit dem RT1 `#m=`
  abgelöst hat.
- Die Schreiber (`encodeFireState` & Co.) werden **stillgelegt, nicht gelöscht** — Bit-Ordnung
  und Feld-Semantik bleiben als Leseregel erhalten (`FIRE_BIT_ORDER` mit `null`-Plätzen).
- Bestehende Query-Links der Wetterkarte bleiben gültig; neu ist nur das optionale dritte
  Pfadsegment und die schonendere Kodierung.

---

## §3 Schema je Feature-Seite (mit Beispiel-URL und Länge)

Gemessen inkl. `https://buscosun.com`. Standardwerte werden **nicht** geschrieben.

### 3.1 Wetterkarte — `/wetterkarte/<layer>[/<ort>]`

| Key | Bedeutung | Werte | Standard |
|---|---|---|---|
| Pfad 2 | Hauptlayer | 19 Slugs (`wind`, `boeen`, `niederschlag`, …) | `wind` |
| Pfad 3 | Ort | Slug | kein Ort (DACH) |
| `l` | weitere Layer | Slugs, komma; `-` = keiner | nur Hauptlayer |
| `t` | Gültigkeitszeit | ISO + `Z` | jetzt |
| `lat` `lon` `z` | Kamera | 4/4/1 | DACH-Fit |
| `modell` | Modell des aktiven Landes | Katalog-ID | `native` |
| `mode` | Punktquelle | `fusion` \| `native` | `fusion` |
| `radar` | Landesradar | `0` | an |
| `ort` `olat` `olon` `land` | freier Ort | | Tabellenort |

```
 80  https://buscosun.com/wetterkarte/wind/muenchen?l=boeen&t=2026-09-12T15:00Z&z=9.5
169  https://buscosun.com/wetterkarte/wind/feldberg-schwarzwald?ort=Feldberg (Schwarzwald)&olat=47.8744&olon=8.0043&l=boeen&t=2026-09-12T15:00Z&lat=47.8744&lon=8.0043&z=9.5
 85  https://buscosun.com/wetterkarte/temperatur?lat=50.2&lon=10.5&z=6&t=2026-09-13T06:00Z
389  Worst Case: freier Ort + alle 18 Zusatzlayer + Modell + Mode + Radar + Kamera + Zeit
```

### 3.2 Warnungen — `/warnungen[/<ort>]`

Wie 3.1 ohne Layer-Segment (der Layer ist die Seite).

```
 39  https://buscosun.com/warnungen/muenchen
```

### 3.3 Regenradar — `/regenradar[/<ort>]`

| Key | Bedeutung | Standard |
|---|---|---|
| `lat` `lon` `z` | Kamera | Ort-Fit |
| `schnee` | Schnee-Modus | aus |
| `spur` | Zellbahnen | an |

```
 44  https://buscosun.com/regenradar/muenchen?z=8
```

Bewusst **ohne** `t`: die Ansicht ist gemessenes Radar „jetzt" (N1) — eine geteilte
Vergangenheit wäre eine Behauptung, die die Quelle nicht trägt.

### 3.4 Vorhersage — `/vorhersage/<ort>` *(heute ganz ohne URL-Zustand)*

| Key | Bedeutung | Werte | Standard |
|---|---|---|---|
| Pfad 2 | Ort | Slug | — (ohne Ort: Idle-Seite) |
| `tag` | ausgewählter Tag, **absolut** | `YYYY-MM-DD` | heute |
| `groesse` | Diagrammgröße | `temperatur` \| `regen` \| `wind` \| `wolken` | `temperatur` |
| `ohne` | abgewählte Modelle | IDs, komma | keine |

```
 70  https://buscosun.com/vorhersage/stuttgart?tag=2026-09-14&groesse=regen
```

Heute ist `selected` ein **Index** (0…n) und die Modellwahl liegt in `localStorage`
(`ModelCompare.tsx`) — der Index muss beim Teilen zum Datum werden, sonst zeigt der
Empfänger morgen einen anderen Tag.

### 3.5 Eventplanung — `/eventplanung/<anlass>[/<ort>]`

| Key | Bedeutung | Standard |
|---|---|---|
| Pfad 2 | Anlass | 10 Slugs (`grillen`, `hochzeit`, …) |
| `von` `bis` | Zeitraum `YYYY-MM-DD` | kommende 7 Tage |
| `tage` | Einzeltage statt Zeitraum | — |
| `phasen` | `Label:von-bis`, komma | Anlass-Preset |
| `flaeche` | gezeichnete Zone `w,s,e,n` | keine Zone |

```
 81  https://buscosun.com/eventplanung/hochzeit/konstanz?von=2026-09-18&bis=2026-09-25
133  …&phasen=Trauung:14-16,Empfang:16-19,Abendfeier:19-24
277  Worst Case: 7 Einzeltage + 4 Phasen + Fläche + freier Ort
```

Tuning und Plan-B werden wie heute **nicht** geteilt (`eventState.ts`: „kein Scheinzustand") —
sie entstehen aus dem Anlass-Preset. Das bleibt so und wird im Share-Sheet gesagt.

### 3.6 Wetterarchiv — `/wetterarchiv/<ort>`

| Key | Bedeutung | Standard |
|---|---|---|
| `modus` | `veraenderung` \| `zeitpunkt` | `veraenderung` |
| `groesse` | `tmean` `tmax` `tmin` `regen` `sonne` `wind` `feuchte` | `tmean` |
| `diagramm` | `streifen` `anomalie` `kenntage` `kalender` … | `streifen` |
| `kenntag` | `hitzetage` `sommertage` `frost` `tropennaechte` | `hitzetage` |
| `zeitraum` | `alle` \| `10j` \| `30j` \| `letztes-jahr` \| `1990-2020` | `alle` |
| `normal` | Referenzperiode | `1961-1990` |
| `datum` | für „Wetter an meinem Tag" | `07-14` |
| `jahr` | Fokusjahr (Drilldown) | keins |

```
 92  https://buscosun.com/wetterarchiv/stuttgart?groesse=tmax&diagramm=kenntage&kenntag=hitzetage
```

Heute sind die Werte teils englische Kürzel im Fragment (`v=tmax&c=kenntage&k=hot`); die
deutschen Enums kommen dazu, die alten bleiben lesbar (Rückwärtskompatibilität).

### 3.7 Atmosphäre — `/atmosphaere/<linse>[/<ort>]`

| Key | Bedeutung | Standard |
|---|---|---|
| Pfad 2 | Linse: `berg-und-weg` \| `fliegen` \| `querschnitt` \| `arbeitsfenster` | `berg-und-weg` |
| `t` | Zeitpunkt, **absolut** (heute `h` relativ) | jetzt |
| `ansicht` | Unterlinse | `hoehenwind` |
| `schnitt` | Schnittlinie `lat,lon;lat,lon;…` (≤ 24 Punkte) | keine |
| `nerd` | Nerd-Modus | aus |

```
 75  https://buscosun.com/atmosphaere/berg-und-weg/innsbruck?t=2026-09-13T00:00Z
109  https://buscosun.com/atmosphaere/querschnitt/innsbruck?t=…&schnitt=47.2,11.3;47.4,11.5&nerd=1
513  Worst Case: 24-Punkt-Schnittlinie aus einer importierten Tour + freier Ort
```

**513 Zeichen reißt Jans Zielgröße 500, nicht die Grenze 1500.** Es ist der einzige
gemessene Fall über 500 und tritt nur auf, wenn eine Tour als Schnittlinie importiert wurde
(`simplifyToCutLine`, `maxPoints = 24`). Vorschlag: so lassen und ehrlich nennen, statt für
diesen Sonderfall ein Kompressionsformat einzuführen.

### 3.8 3D-Globus — `/globus`

| Key | Bedeutung | Standard |
|---|---|---|
| `feld` | `temperatur` \| `wind` \| `feuchte` \| `druck` \| `keins` | `temperatur` |
| `hoehe` | `boden` \| `850` \| `500` \| `250` | `boden` |
| `t` | Gültigkeitszeit, **absolut** (heute `fh` relativ zum Lauf) | jetzt |
| `c` `z` | Kamera `lat,lon` + Zoom | Standardblick |
| `pin` | gesetzter Punkt `lat,lon` — **Achsen wie überall** | keiner |
| `flach` | Projektion flach statt Globus | Globus |
| `partikel` | Partikel aus | an |

```
 97  https://buscosun.com/globus?feld=temperatur&t=2026-09-13T12:00Z&c=51.2,10.4&z=2.6&pin=48.14,11.58
```

### 3.9 Waldbrand — `/waldbrand/<sicht>[/<ort>]`

| Key | Bedeutung | Standard |
|---|---|---|
| Pfad 2 | Sicht: `gefahrenindex` \| `aktive-braende` \| `trockenheit` \| `historie` \| `thermalanomalien` | `gefahrenindex` |
| `t` | Tag/Stunde, **absolut** (heute `d`/`h` relativ) | heute/jetzt |
| `fenster` | Rückblick der Hotspots | `24h` |
| `flaechen` | Zeitkörbe | `saison` |
| `boden` | Tiefe | `oberboden` |
| `zeitraum` | Historie-Fenster | Live |
| `liste` | Brandflächen-Panel offen | zu |
| `dossier` | Mitte zeigt Dossier | Karte |

```
 86  https://buscosun.com/waldbrand/aktive-braende/freiburg-im-breisgau?fenster=48h&liste=1
 76  https://buscosun.com/waldbrand/historie/freiburg-im-breisgau?zeitraum=saison
```

Die Layer-Bitmaske (`b=37124`) verschwindet: die Sicht im Pfad plus die immer aktiven Layer
(`FIRE_ALWAYS_ON`) beschreiben denselben Zustand lesbar. `applyFireView`/`fireViewFromState`
sind der bereits verifizierte Rundlauf dafür.

### 3.10 Tourenplanung — `/tourenplanung[/3d]`

Kann Vorgabe A **nicht** erfüllen (§1.8). Vorschlag:

```
 72  https://buscosun.com/tourenplanung/3d?start=2026-09-13T07:30Z&art=gravel
```

… trägt Startzeit, Bewegungsart, Geschwindigkeitsprofil, Pausen und Sicht — **nicht** die
Strecke. Der Empfänger sieht die Upload-Seite mit einem Satz: „Der Absender hat seine
Einstellungen geteilt; die Strecke musst du selbst laden." Alternative in §11, E-4.

### 3.11 Zusammenfassung Längen

| | Zeichen |
|---|---:|
| Median über alle Seiten (Normalfall) | **81** |
| Größter Normalfall (Wetterkarte, freier Ort) | 169 |
| Größter Worst Case (Atmosphäre, 24-Punkt-Schnitt) | **513** |
| Jans Zielgröße | 500 |
| Jans harte Grenze | 1500 |

Vor jedem Kopieren prüft `buildShareUrl` die Länge: > 1500 ⇒ **melden** (das Sheet zeigt
„Dieser Zustand ist zu groß für einen Link — bitte … abwählen"), nie stillschweigend kürzen.

---

## §4 Lesbarkeitsnachweis (Jans Testkriterium)

„Ein Dritter soll ohne Doku erraten können, wohin der Link führt."

| Link | Was ein Dritter liest |
|---|---|
| `buscosun.com/wetterkarte/wind/muenchen?l=boeen&t=2026-09-12T15:00Z` | Wetterkarte, Wind + Böen, München, Freitag 15 Uhr |
| `buscosun.com/regenradar/muenchen` | Regenradar München |
| `buscosun.com/warnungen/muenchen` | Warnungen München |
| `buscosun.com/vorhersage/stuttgart?tag=2026-09-14&groesse=regen` | Vorhersage Stuttgart, Montag, Regen |
| `buscosun.com/eventplanung/hochzeit/konstanz?von=2026-09-18&bis=2026-09-25` | Hochzeitswetter Konstanz, 18.–25. September |
| `buscosun.com/wetterarchiv/stuttgart?groesse=tmax&diagramm=kenntage&kenntag=hitzetage` | Wetterarchiv Stuttgart, Hitzetage |
| `buscosun.com/atmosphaere/berg-und-weg/innsbruck?t=2026-09-13T00:00Z` | Atmosphäre Innsbruck, Berg & Weg, Samstag 0 Uhr |
| `buscosun.com/waldbrand/aktive-braende/freiburg-im-breisgau?fenster=48h` | Aktive Brände Freiburg, 48 Stunden |
| `buscosun.com/globus?feld=temperatur&t=2026-09-13T12:00Z` | Globus, Temperatur, Samstag 12 Uhr |

Kein Buchstabenkürzel ohne Bedeutung, keine Zahl ohne Einheit, keine Prozentkodierung außer
bei echten Umlauten/Leerzeichen im Ortsnamen. **Gegenprobe heute:**
`buscosun.com/waldbrand/aktive-braende#wb=%7B%22b%22%3A37124%2C%22d%22%3A0…`

Der Nachweis wird maschinell geführt: `verify:share` prüft für jede Seite, dass die erzeugte
Beispiel-URL (a) keinen `%`-Anteil > 5 % hat, (b) keinen Schlüssel ohne Eintrag im Vokabular
enthält, (c) unter 500/1500 bleibt, (d) den Rundlauf besteht.

---

## §5 Share-UI (Teil 2)

### 5.1 Komponenten

```
src/share/
  shareSchema.ts    rein  Vokabular, Rundung, Serialisierer/Parser ohne URLSearchParams-Kodierung
  placeSlug.ts      rein  toSlug/deSlug + Tabellen-Lookup (von scripts/seo/places.mjs importiert)
  shareAdapters.ts  rein  Registry RouteId → { toUrl, fromUrl, describe } — EIN Ort je Seite
  shareText.ts      rein  Titel · Beschreibung · Nachrichtentext aus dem geparsten Zustand
  shareTargets.ts   rein  WhatsApp/Gmail/mailto/Copy — URL-Bau, Desktop/Mobil-Weiche
  useShare.ts       Hook  aktueller Zustand → URL, navigator.share/clipboard, Toast-Zustand
  ShareButton.tsx   UI    Icon-Button, 44×44, per className in jedes Deck
  ShareSheet.tsx    UI    Popover (Desktop) / BottomSheet (Mobil) — lazy
  share.css         CSS   eigener Namespace .sh-*, Tokens aus designTokens.css
```

**`shareText.ts` und `shareAdapters.ts` müssen abhängigkeitsarm und DOM-frei bleiben** —
die Netlify Edge Function importiert sie (Deno) für die OG-Meta. Ein zweiter Parser ist
ausgeschlossen (Jans Vorgabe). Beide tsconfigs haben `allowImportingTsExtensions: true`,
der Import `../../src/share/shareText.ts` typecheckt und läuft in Deno wie in Vite.

### 5.2 Platzierung

Jedes Deck hat eine eigene Topbar mit eigenem CSS-Namensraum:
`.mdk-topright` (Karte) · `.rr-topright` (Radar) · `.br-topbar-right` (Brand) ·
`.hd-topbar` · `.evd-topbar` · `.rd-topbar` · `.fcd-topbar` · `.vsd-topbar` · Globus (keine).
`ShareButton` wird in jede Topbar rechts eingesetzt und erbt die Deck-Optik über eine
`className`-Prop — dasselbe Muster wie `FeatureRail` (`navClass`/`btnClass`).
Mobil: in die vorhandene Bottom-Bar bzw. neben den Zurück-Knopf; die drei toten
„Link teilen"-Knöpfe der Atmosphäre werden verdrahtet statt ersetzt (Funktionserhalt).

### 5.3 Verhalten

- **Mobil** (`useIsMobile`, ≤ 767 px) **und** `navigator.share` vorhanden ⇒ natives Share-Sheet
  mit `{ title, text, url }`. Eigenes Menü nur als Rückfall.
- **Desktop** ⇒ eigenes Popover: Vorschau (URL vollständig, `word-break`, nur > 90 Zeichen
  mittig gekürzt mit `…` und immer voll kopierbar), darunter WhatsApp · Gmail · Mail · Kopieren.
- **A11y**: `<button aria-haspopup="dialog" aria-expanded>`, Popover als `role="dialog"`
  mit `aria-label`, Fokus beim Öffnen auf das erste Ziel, Fokus-Falle, `Escape` schließt und
  gibt den Fokus zurück, Ziele sind echte `<a>`/`<button>`. Touch-Targets ≥ 44 px.
  Toast als `role="status"` (`aria-live="polite"`).
- **Kritischer Pfad**: `ShareSheet` + `share.css` sind `React.lazy` und werden erst beim
  ersten Klick geladen. `ShareButton` + `useShare` sind ~2 KB. Die URL wird **nicht** bei
  jedem Pan neu gebaut, sondern erst beim Öffnen des Sheets (keine Kosten im Renderpfad,
  vgl. LZ1-Auflagen).

---

## §6 Kanäle (Teil 3)

| Ziel | URL | Hinweise |
|---|---|---|
| WhatsApp Desktop | `https://wa.me/?text=<enc>` | öffnet Web/Desktop-App |
| WhatsApp Mobil | `whatsapp://send?text=<enc>` mit `wa.me`-Rückfall nach 700 ms | |
| Gmail | `https://mail.google.com/mail/?view=cm&fs=1&su=<enc>&body=<enc>` | |
| Mail generisch | `mailto:?subject=<enc>&body=<enc>` | s. u. |
| Kopieren | `navigator.clipboard.writeText` + Toast; Rückfall `document.execCommand` in unsicherem Kontext | |

**Doppel-Encoding.** Genau **einmal** `encodeURIComponent` auf den fertigen Nachrichtentext
(der die URL enthält). Die URL selbst wird von `buildShareUrl` bereits RFC-korrekt gebaut
und **nicht** noch einmal kodiert. Der Verifier prüft, dass in keinem Ziel-Link `%25`
vorkommt — das wäre der Beweis für doppelte Kodierung.

**mailto-Länge.** Praxisgrenzen: Windows-Shell ~2 048 Zeichen, ältere Outlook-Versionen
~1 800, iOS/Android unkritisch. Unsere Nachricht liegt bei 120–250 Zeichen (URL + ein Satz),
Worst Case ~650. Wird dokumentiert und geprüft; ab 1 500 Zeichen Gesamtlänge zeigt das Sheet
statt Mail nur noch „Link kopieren".

**Nachrichtentext** aus `shareText.ts`, aus denselben Parametern wie der App-Zustand:

```
Wetterkarte Feldberg — Wind (10 m), Fr 12.09. 15:00
https://buscosun.com/wetterkarte/wind/feldberg-schwarzwald?…
```

Sprache aus der App-Locale (heute durchgehend `de`; die Funktion nimmt die Locale als
Parameter, damit später kein zweiter Textbau entsteht). Datumsformat über `Intl`, Zeitzone
lokal — der **Link** bleibt UTC, der **Text** ist für Menschen.

---

## §7 Vorschaubild / Open Graph (Teil 4)

### 7.1 Voraussetzung

Ohne §2 (Zustand in Pfad+Query) ist hier für fünf Seiten nichts möglich (§1.2). Die Reihenfolge
in §9 ist deshalb keine Bequemlichkeit, sondern zwingend.

### 7.2 Was heute fehlt

- `og:title`/`og:description` je Zustand: gibt es nicht (die Shell kennt nur Route/Sub-Route).
- `og:image` je Zustand: gibt es nicht.
- `og:image` je **Seite**: nur für 2 von 9 (`/wetterkarte`, `/atmosphaere`); alle anderen
  zeigen `/og/home.png` (§1.6).

### 7.3 Optionen für das Bild

| | Weg | Kosten | Risiko | Bewertung |
|---|---|---|---|---|
| **a** | Satori + resvg-wasm in einer Netlify Edge Function, Ergebnis gecacht | Funktionsaufrufe + **Netlify-Bandbreite** je Bild (150–400 KB); resvg-WASM ~1,5 MB im Bundle, spürbarer Kaltstart | mittel–hoch: Bundle-Größe, Kaltstart, unbegrenzter Parameterraum als Verstärker | überzogen für den Gewinn |
| **b** | Vorgerenderte Vorlagen je Seite/Layer, dynamisch nur der Text | **null** für die Vorlage; der Text braucht trotzdem einen Renderer, sonst ist es (b′) | gering | Stufe 2 |
| **b′** | Rein statische Karten je Seite **und je Sub-Route** — der Mechanismus, den das Repo schon hat | einmalig ~10 min Rendern, ~40 KB je PNG als Repo-Datei | sehr gering | **Stufe 1** |
| **c** | Echtes Karten-Rendering headless | Chrome je Anfrage; auf Netlify Edge (Deno) technisch **nicht möglich**, als Function teuer und langsam | hoch | verworfen |

**Empfehlung — zwei Stufen:**

**Stufe 1 (in dieser Phase, kein Bild-Rendering zur Laufzeit):**
- `og:title`/`og:description` **je Zustand** über eine Edge Function, die nur den `<head>`
  der bestehenden Shell umschreibt (HTML ~10 KB, `Netlify-CDN-Cache-Control: durable` wie
  `firms.ts` ⇒ der zweite Crawler-Zugriff kostet keine Funktion).
- `og:image` je Seite und je Sub-Route: `ogImage` in `routes.ts` füllen und die fehlenden
  Karten mit dem vorhandenen Rezept rendern (`public/_og-card.html`,
  `docs/seo-geo/og-images.md`). Ein Teil existiert bereits (`waldbrandgefahr.png`,
  `regenradar-radolan-inca-rzc.png`, `globus.png`, `historie.png`, `event-tag.png`,
  `modellvergleich.png`, `tourenplanung.png`, `arbeitsfenster.png`, `schneefallgrenze.png`,
  `hagel-meshs-poh.png`, `windboeen-sturm.png`, `gewitterzellen-konrad.png`,
  `thermalanomalien-firms.png`) und muss nur verdrahtet werden.
- **Ergebnis:** WhatsApp zeigt eine gebrandete Karte, die zur Seite passt, und darunter
  „Wetterkarte Feldberg — Wind (10 m), Fr 12.09. 15:00". Das ist der Vertrauensanker, den
  Jan beschreibt, zu ~0 Laufzeitkosten.

**Stufe 2 (eigene Phase, Jans Gate):** dynamisches Bild. Dann bevorzugt **(b) mit Satori auf
statischem Hintergrund** — der Hintergrund ist eine der Stufe-1-PNGs als data-URI, Satori
setzt nur Ort, Kennwert und Zeitstempel darüber. Satori liefert SVG, und `image/svg+xml`
taugt als `og:image` **nicht** (die Plattformen rendern kein SVG) — also entweder resvg-wasm
in der Function oder das PNG einmalig erzeugen und in **`buscosun-data` + jsDelivr** ablegen.

### 7.4 Cache-Schlüssel und Missbrauchsschutz

- Schlüssel = **kanonisierter** Parameter-String: feste Reihenfolge, gerundete Werte
  (`z` 1 Nachkommastelle, `lat`/`lon` 4, `t` auf 10 min), Standardwerte entfernt, Ort auf
  den Slug reduziert. `canonicalShareKey()` liegt neben dem Parser und wird von App **und**
  Edge Function benutzt.
- Nur **bekannte** Schlüssel gehen in den Key ein; alles andere wird verworfen — sonst
  erzeugt `?a=1&a=2&…` beliebig viele Varianten.
- Die Edge Function antwortet nur für **Crawler-User-Agents** mit umgeschriebenem `<head>`
  (`facebookexternalhit`, `WhatsApp`, `Twitterbot`, `Slackbot`, `LinkedInBot`, `TelegramBot`,
  `Discordbot`, `Googlebot`, `Bingbot`); alle anderen bekommen die Shell unverändert. Damit
  ist der reguläre Nutzerpfad **byte-gleich zu heute** — keine Regression im Erstbild.
- Deckel: unbekannte Parameter, > 1 500 Zeichen oder mehr als N Schlüssel ⇒ die Function
  liefert die Shell unverändert (generisches Kartenbild). Kein Fehler, keine Kosten.

### 7.5 Grobe Kostenschätzung

| | Stufe 1 | Stufe 2 |
|---|---|---|
| Netlify-Funktionsaufrufe | nur Crawler, durable gecacht — geschätzt < 2 000/Monat | dito + je neuem Bild ein Render |
| Netlify-Bandbreite | ~10 KB HTML je Crawler-Zugriff + PNG (statisch, ~40 KB, `immutable`) | + 150–400 KB je neuem Bild |
| Repo-Größe | +46 PNGs × ~40 KB ≈ **1,8 MB** einmalig | — |
| Laufende Geldkosten | **0** | 0, solange im Netlify-Freikontingent |
| Aufwand | ~1,5 Tage | eigene Phase |

**⚠ Zwei Punkte, die Jan entscheiden muss:** Edge Functions sind STOPP-&-FRAGEN-Zone
(CLAUDE.md). Und: **R2 gibt es in diesem Repo nicht** — kein Konto, keine Bindung, kein
Schlüssel. Der etablierte CDN-Weg ist das Daten-Repo `buscosun-data` über jsDelivr. Für
statische Karten ist das ohnehin unnötig (Netlify liefert 40-KB-PNGs mit `immutable`
praktisch kostenlos); für Stufe 2 wäre jsDelivr der Weg, nicht R2.

### 7.6 Optik

Jans Vorgabe war „dunkles Theme". Der Bestand ist hell: 74 Karten in Sand/Ink
(`--cream-50 #FAF6EA`, `--ink-900 #2C2A26`, Terracotta-Akzent), Design-Standard D-27 ist
„hell, Sand/Ink". Eine dunkle Sonderreihe ließe buscosun in der Vorschau wie zwei Marken
aussehen. **Vorschlag:** Rahmen, Wortmarke und Typografie bleiben hell/Sand wie die
bestehenden 74 Karten; das **Kartenfeld im Inneren** ist dunkel (`--nc-radarbg #0B1016`) —
genau wie die Decks es tun (heller Rahmen, dunkle Mitte). Das erfüllt „modern, dunkel,
sofort als buscosun erkennbar" **und** die Konsistenz. Entscheidung: §11, E-5.

---

## §8 Betroffene Dateien

**Neu**

```
src/share/{shareSchema,placeSlug,shareAdapters,shareText,shareTargets}.ts
src/share/{useShare.ts,ShareButton.tsx,ShareSheet.tsx,share.css}
scripts/verify-share.mjs                       (+ npm-Alias verify:share)
netlify/edge-functions/og-meta.ts              (Stufe 1, Jans Gate)
public/og/<46 fehlende Karten>.png
audit/teilen-share.md                          (dieses Dokument)
```

**Geändert**

| Datei | Warum |
|---|---|
| `src/router/routes.ts` | `ogImage` je Route + Sub-Route; `routeForPath`/`canonicalPath` für das Ort-Segment; `verifyRoutes` nachziehen |
| `src/router/router.tsx` | `:layer?/:ort?` bzw. `:view?/:ort?` je Route |
| `src/router/urlState.ts` | Ort-Segment, `z` auf 1 Nachkommastelle, schonender Serialisierer, Kill-Switch-Filter |
| `src/router/legacyHash.ts` | `#wb=` `#atm=` `#ev=` `#h=` `#g=` → Pfad+Query migrieren (heute nur Pfad + Hash behalten) |
| `src/router/pages/*.tsx` | je Seite: Ort-Segment lesen/schreiben, Query statt Fragment |
| `src/{fire,atmosphere,event,history,globe}/…State.ts` | Schreiber stilllegen, Leser als Legacy behalten |
| `src/globe/GlobePage.tsx` | Permalink von `#g=` auf Query; `pin` auf `lat,lon` drehen |
| `src/confidence/ForecastDeck.tsx` | Tag-Index → absolutes Datum, Metrik/Modelle in die URL |
| `src/route/RoutePage.tsx` | Einstellungen in die URL (ohne Strecke) |
| Topbars: `MapView.tsx`, `NowcastDeck.tsx`, `FirePage.tsx`, `HistoryPage.tsx`, `EventPage.tsx`/`EventResult.tsx`, `RouteDeck.tsx`, `ForecastDeck.tsx`, `AtmosphereDeck.tsx`, `GlobePage.tsx` | `ShareButton` einsetzen |
| `scripts/seo/places.mjs` | `toSlug` aus `src/share/placeSlug.ts` importieren |
| `scripts/seo/content.mjs` | `og:*` je Zustand vorbereiten (Stufe 1) |
| `scripts/verify-routing.mjs` | Ort-Segment, neue Rewrites |
| `netlify.toml` | ggf. Rewrite je Ort-Segment; Header für `/og/*` |
| `budget.json` | Ratsche für den Share-Chunk (Schätzung +4…6 KB gzip, **lazy**; `eagerJs` darf **nicht** wachsen) |
| `architecture.md`, `CLAUDE.md` | Doku (in SH0 erledigt) |

---

## §9 Reihenfolge (Etappen = PRs, je mit Gate)

| # | Etappe | Inhalt | Gate |
|---|---|---|---|
| **SH0** | Diagnose + Plan | dieses Dokument, `architecture.md` §2 + §15, CLAUDE.md-Landkarte | **Jans Bestätigung** |
| **SH1** | Fundament, ohne UI | `src/share/*` (rein), `verify:share`, Ort-Slug-Modul, Adapter für die **drei Query-Seiten** (Wetterkarte, Warnungen, Regenradar) inkl. Ort-Segment im Pfad | `verify:share` grün, `verify:routing` unverändert grün, typecheck, Build, Budget |
| **SH2** | Share-UI | `ShareButton`/`ShareSheet`/Kanäle, in den drei Query-Seiten verdrahtet | Desktop pixelgleich, iPhone-12-Pro-Sheet, A11y-Prüfliste, Konsole sauber, `eagerJs` unverändert |
| **SH3** | Fragment → Query, Teil 1 | Waldbrand + Atmosphäre: Zustand nach Query, absolute Zeit, Legacy-Migration | Alt-Links `#wb=`/`#atm=` laufen (belegt), `verify:fire-model` grün |
| **SH4** | Fragment → Query, Teil 2 | Event + Wetterarchiv + Globus (inkl. Achsen-Fix `pin`) | Alt-Links laufen, `verify:share` deckt alle Seiten |
| **SH5** | Seiten ohne Zustand | Vorhersage (Tag absolut, Metrik, Modelle), Tourenplanung (Einstellungen ohne Strecke) | Deep-Link-Restore belegt |
| **SH6** | OG Stufe 1 | `ogImage` je Route/Sub-Route + fehlende Karten + Edge Function `og-meta` (**Jans Gate**) | `verify:seo` grün, Crawler-Antwort per curl belegt, Nutzerpfad byte-gleich |
| *SH7* | *OG Stufe 2 — dynamisches Bild* | *eigene Phase, nur nach Jans Entscheidung* | — |

SH1 + SH2 liefern bereits einen benutzbaren Teilen-Knopf für die drei meistgeteilten Seiten.

---

## §10 Risiken und Fallstricke

1. **Das Fragment erreicht den Server nie** (§1.2) — jeder Plan, der Teil 4 vor der Migration
   verspricht, ist falsch.
2. **Zweistufige Sub-Pfade sind heute 404** (`routeForPath`, ausdrücklich getestet). Ohne
   Anpassung liefert `/wetterkarte/wind/muenchen` die 404-Shell — und zwar erst in Produktion,
   weil Netlifys `/wetterkarte/*` den Splat durchreicht, der Client aber `null` bekommt.
3. **Ort-Slug darf nie kanonisch werden.** Sonst öffnet sich ein unendlicher indexierbarer
   Raum (jeder Ort × jeder Layer × jede Kamera). `canonicalPath()` muss ihn abschneiden,
   `sitemapPaths()` ihn ignorieren, und die Sub-Routen-Shell bleibt dieselbe.
4. **`z` auf 1 Nachkommastelle ändert `verifyUrlState()`** (der Testfall erwartet heute `z=8`
   aus `8.004`). Die Rundung verschiebt den Ausschnitt um ≤ 3,5 % — vertretbar, muss aber
   im Verifier mitwandern.
5. **Kill-Switches gehören nicht in einen geteilten Link.** `parseMapSearch` reicht unbekannte
   Keys durch (`extra`), und `?lz=0` oder `?radarcdn=0` würden mitgeteilt — der Empfänger
   bekäme still eine gedrosselte App. `buildShareUrl` filtert eine benannte Liste heraus.
6. **Doppel-Encoding** ist der klassische Fehler bei `wa.me` (§6). Verifier-Regel: kein `%25`.
7. **Der Globus-Pin hat vertauschte Achsen** (`[lng, lat]`). Beim Umzug korrigieren **und**
   den Alt-Leser in der alten Reihenfolge lassen, sonst springen bestehende Links nach Asien.
8. **Ein alter Link zeigt eine tote Stunde.** `hourFromValidTime` klemmt Vergangenheit still
   auf 0. Beim Ankommen aus einem geteilten Link muss die App das **sagen**
   („Der geteilte Zeitpunkt liegt in der Vergangenheit — gezeigt wird jetzt") bzw. auf den
   nächstgelegenen verfügbaren Schritt gehen und es benennen. Ehrlichkeit ist Produktprinzip.
9. **Kein Wachstum im Erstbild-Pfad.** LZ1 hat den Klick→Bild-Weg gerade auf ~200 ms gebracht.
   `ShareSheet` ist lazy, die URL wird erst beim Öffnen gebaut, `eagerJs` bleibt bei 106,3 KB.
10. **Edge Function = STOPP & FRAGEN** (CLAUDE.md). SH6 startet erst nach Jans ausdrücklicher
    Freigabe; die Datei kann wie `firms.ts` additiv und wirkungslos vorliegen.
11. **PowerShell-Fallen** (bestehende Lehren): `Set-Content -Encoding utf8` kodiert BOM-lose
    UTF-8 doppelt; `node … 2>&1 | Out-File` macht aus stderr-Warnungen Exit 1 — Verifier nie
    mit `2>&1` starten.

---

## §11 Offene Entscheidungen für Jan

| # | Frage | Empfehlung |
|---|---|---|
| **E-1** | Ort **hinter** dem Layer (`/wetterkarte/wind/feldberg`) oder **statt** ihm (`/wetterkarte/feldberg?layer=wind`, Jans Beispiel)? | **hinter** — sonst fallen 18 SEO-Shells, 18 Rewrites, 18 Canonicals und die Sitemap-Einträge (§2.3) |
| **E-2** | `v` nur schreiben, wenn ≠ 1? | **ja** — versioniert, aber ohne Ballast (§2.4) |
| **E-3** | Ortstabelle (198) für kürzere Links auf ~1 000 erweitern? | **später** — der Gewinn sind ~40 Zeichen; die Tabelle ist ein SEO-Artefakt |
| **E-4** | Tourenplanung: Einstellungen ohne Strecke teilen, gar nicht teilen, oder Strecke als reduzierte Polylinie (~500 Zeichen, verlustbehaftet)? | **Einstellungen ohne Strecke**, mit ehrlichem Hinweis (§3.10) |
| **E-5** | OG-Karten hell (wie die 74 bestehenden) oder dunkel (Jans Vorgabe)? | **heller Rahmen, dunkles Kartenfeld** (§7.6) |
| **E-6** | Edge Function `og-meta` freigeben? | ja, aber als eigenes Gate nach SH5 |
| **E-7** | Die drei toten „Link teilen"/„PDF"-Knöpfe der Atmosphäre: verdrahten bzw. entfernen? | Teilen verdrahten; PDF **ist keine Funktion** und wird zur Entscheidung vorgelegt statt still gelöscht |

---

## §12 Verbesserungskatalog (D-28; `improvements.md` fehlt im Arbeitsverzeichnis)

| ID | Befund | Mehrwert | Umsetzungsskizze |
|---|---|---|---|
| **V-SH-1** | `AtmosphereDeck.tsx:167/744/848` — drei Knöpfe „Link teilen"/„PDF" ohne `onClick` | Ein Knopf, der nichts tut, kostet Vertrauen | Teilen an `useShare` hängen; PDF Jan vorlegen |
| **V-SH-2** | Ein alter Karten-Link klemmt still auf „jetzt" (`hourFromValidTime` ⇒ 0) | Absender und Empfänger sehen Verschiedenes, ohne es zu merken | Beim Ankommen aus einem Link mit `t` in der Vergangenheit einen Hinweis im Readout zeigen |
| **V-SH-3** | Globus-Permalink speichert `pin` als `[lon, lat]` | Achsenfalle wie im WFS-Befund; jede Wiederverwendung erbt den Fehler | Beim Umzug auf `lat,lon` drehen, Alt-Leser behalten |
| **V-SH-4** | 7 von 9 Feature-Seiten und 35 von 37 Sub-Routen zeigen `/og/home.png` | Jeder geteilte Link sieht heute gleich und generisch aus | `ogImage` in `routes.ts` füllen, fehlende Karten mit dem vorhandenen Rezept rendern |
| **V-SH-5** | `navigator.clipboard` an vier Stellen viermal eigener Code, keiner mit Rückfall | Kopieren scheitert in unsicherem Kontext still | Ein `copyText()` in `src/share/`, die vier Stellen darauf ziehen |
| **V-SH-6** | `src/mapState.ts` (`#m=`) trägt weiter nur 12 von 19 Layern (V-191) | Falle für jeden, der die Datei für aktuell hält | Kopfkommentar „nur noch Legacy-Leser" + Zeiger auf `urlState.ts` |
| **V-SH-7** | `URLSearchParams.toString()` kodiert `:` und `()`, obwohl RFC 3986 sie erlaubt | Der Unterschied zwischen lesbarem Link und Prozentsalat | Eigener Serialisierer in `shareSchema.ts`; Lesen bleibt bei `URLSearchParams` |
| **V-SH-8** | Kill-Switches (`?lz=0`, `?radarcdn=0`, `?bh=0`, …) würden mitgeteilt | Empfänger bekäme still eine gedrosselte App | Benannte Sperrliste in `buildShareUrl` |
| **V-SH-9** | `architecture.md` §2 beschreibt den Vor-RT1-Zustand | Doku widerspricht dem Code | In SH0 korrigiert |
| **V-SH-10** | Vorhersage merkt sich Modellauswahl/Metrik nur in `localStorage` | Nicht teilbar, nicht wiederherstellbar, gerätegebunden | In die URL heben (`ohne=`, `groesse=`), `localStorage` bleibt als Standardwert |

---

## §13 Verifikation dieser Phase

- **Neu:** `npm run verify:share` — reine Prüfungen ohne Netz:
  Rundlauf je Seite (Zustand → URL → Zustand identisch), Standard-Stille (Standardzustand
  ⇒ blanker Pfad), Rundung, Lesbarkeit (§4), Längen-Deckel, Legacy-Migration je Alt-Präfix,
  Kanal-Links ohne Doppel-Encoding, kanonischer OG-Schlüssel stabil gegen Zoom-Rauschen.
- **Bestehend, muss grün bleiben:** `verify:routing` (153/153, am 2026-09-08 gezählt), `verify:seo`,
  `verify:fire-model`, `verify:repack` (348/348), `npm run typecheck`, `npm run build`,
  `npm run budget` (`eagerJs` ≤ 107,9 · `eagerCss` ≤ 2,5).
- **UI:** Chrome DevTools MCP, Desktop 1440×900 und iPhone 12 Pro 390×844 DPR 3; die fünf
  Selbstverifikations-Fragen schriftlich mit Beleg.
