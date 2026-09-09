# audit/teilen-share.md — „Auswahl teilen" (Phase SH)

> **Stand: 2026-09-09. SH0–SH5 umgesetzt — Gates GSH1–GSH5 grün, s. §14–§18. Acht der neun Feature-Seiten sind teilbar, die neunte (Tourenplanung) bewusst nicht; die Voraussetzung für Teil 4 (Vorschaubild) ist erfüllt. Offen: SH6 — Jans Gate für die Edge Function (E-6).**
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
| ~~**E-7**~~ | Die drei toten „Link teilen"/„PDF"-Knöpfe der Atmosphäre: verdrahten bzw. entfernen? | **Erledigt 2026-09-09, s. §22.2:** Teilen in SH3 verdrahtet, PDF jetzt ein echter Druckbericht über den Druckweg des Browsers (keine PDF-Bibliothek, keine neue Abhängigkeit) |

---

## §12 Verbesserungskatalog (D-28; `improvements.md` fehlt im Arbeitsverzeichnis)

| ID | Befund | Mehrwert | Umsetzungsskizze |
|---|---|---|---|
| **V-SH-1** | `AtmosphereDeck.tsx:167/744/848` — drei Knöpfe „Link teilen"/„PDF" ohne `onClick` | Ein Knopf, der nichts tut, kostet Vertrauen | Teilen an `useShare` hängen; PDF Jan vorlegen |
| ~~**V-SH-2**~~ | Ein alter Karten-Link klemmt still auf „jetzt" (`hourFromValidTime` ⇒ 0) | Absender und Empfänger sehen Verschiedenes, ohne es zu merken | **Erledigt 2026-09-09, s. §21** — `StaleLinkNotice` auf Karte, Warnungen, Brandradar, Atmosphäre und Globus |
| **V-SH-3** | Globus-Permalink speichert `pin` als `[lon, lat]` | Achsenfalle wie im WFS-Befund; jede Wiederverwendung erbt den Fehler | Beim Umzug auf `lat,lon` drehen, Alt-Leser behalten |
| **V-SH-4** | 7 von 9 Feature-Seiten und 35 von 37 Sub-Routen zeigen `/og/home.png` | Jeder geteilte Link sieht heute gleich und generisch aus | `ogImage` in `routes.ts` füllen, fehlende Karten mit dem vorhandenen Rezept rendern |
| **V-SH-5** | `navigator.clipboard` an vier Stellen viermal eigener Code, keiner mit Rückfall | Kopieren scheitert in unsicherem Kontext still | Ein `copyText()` in `src/share/`, die vier Stellen darauf ziehen |
| **V-SH-6** | `src/mapState.ts` (`#m=`) trägt weiter nur 12 von 19 Layern (V-191) | Falle für jeden, der die Datei für aktuell hält | Kopfkommentar „nur noch Legacy-Leser" + Zeiger auf `urlState.ts` |
| **V-SH-7** | `URLSearchParams.toString()` kodiert `:` und `()`, obwohl RFC 3986 sie erlaubt | Der Unterschied zwischen lesbarem Link und Prozentsalat | Eigener Serialisierer in `shareSchema.ts`; Lesen bleibt bei `URLSearchParams` |
| **V-SH-8** | Kill-Switches (`?lz=0`, `?radarcdn=0`, `?bh=0`, …) würden mitgeteilt | Empfänger bekäme still eine gedrosselte App | Benannte Sperrliste in `buildShareUrl` |
| **V-SH-9** | `architecture.md` §2 beschreibt den Vor-RT1-Zustand | Doku widerspricht dem Code | In SH0 korrigiert |
| **V-SH-10** | Vorhersage merkt sich Modellauswahl/Metrik nur in `localStorage` | Nicht teilbar, nicht wiederherstellbar, gerätegebunden | In die URL heben (`ohne=`, `groesse=`), `localStorage` bleibt als Standardwert |
| ~~**V-SH-13**~~ *(2026-09-09)* | Eine geteilte Zeit **in der Zukunft** wird still geklemmt (gemessen: `+3 h` und `+11 h` landeten beide bei `+2 h`) | Ein Link auf „Wind, morgen 15:00" konnte den Zeitpunkt gar nicht wiederherstellen | **Erledigt, s. §23** — und die Ursache war eine andere als vermutet: nicht der Daten-Horizont, sondern die **Erstbild-Basis von drei Stunden** (`START_NOW_ONLY`). Ein Link mit Stunde spannt jetzt das Fenster auf; jenseits der 24-h-Basis wird die Kürzung gemeldet |

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

---

## §14 SH1 — Fundament (umgesetzt 2026-09-08, Gate GSH1)

Jans Freigabe („starte") auf Basis der Empfehlungen zu **E-1** (Ort HINTER dem Layer) und
**E-2** (`v` nur schreiben, wenn ≠ 1). Umfang wie in §9 geplant: die reinen Bausteine, der
Verifier und der Ort-Slug im Pfad für die drei Query-Seiten. **Keine UI** — der Teilen-Knopf
ist SH2.

### 14.1 Was jetzt da ist

| Datei | Rolle |
|---|---|
| `src/share/placeSlug.ts` | Slug-Regel, Slug-Form, Notname, 500-m-Schwelle, Abstand — **importfrei** (Deno-tauglich für SH6) |
| `src/share/placeTable.ts` | `placeSlugs.json` (jetzt 5-spaltig, mit Land) → `placeBySlug`, `slugForPlace`, `resolveRoutePlace` |
| `src/share/shareSchema.ts` | Vokabular v1: schonende Kodierung, Rundung, absolute Zeit, Längenurteil, Sperrliste |
| `src/share/shareText.ts` | Titel · Beschreibung · Nachricht (dieselbe Quelle wie später die OG-Meta) |
| `src/share/shareTargets.ts` | WhatsApp · Gmail · mailto · `copyText()` mit Rückfall (V-SH-5) |
| `src/share/shareAdapters.ts` | Registry je Seite: `buildShareUrl` / `parseShareUrl` / `describeShareUrl` / `canonicalShareKey` |
| `scripts/verify-share.mjs` | `npm run verify:share` — **236/236** |

Geändert: `urlState.ts` (Ortssegment, `z` auf 1 Nachkommastelle, `encodeShareQuery`,
`timePast`), `routes.ts` (`place: true`, zweistufiges `routeForPath`, Canonical schneidet den
Ort ab), `router.tsx` (`/:ort?`), `netlify.toml` (`/warnungen/*`, `/regenradar/*`),
`prefetch.ts` (RV-Frühstart erkennt den Ort auch im Pfad), `legacyHash.ts` (injizierbare
Slug-Auflösung), `WetterkarteRoute` / `NowcastRoute` / `useAppNav`,
`scripts/seo/content.mjs`, `scripts/seo/export-place-slugs.mjs`, `verify-routing.mjs`, `budget.json`.

### 14.2 Was ein Link jetzt ist (am gebauten Stand gemessen)

```
vorher   /wetterkarte/temperatur?ort=M%C3%BCnchen&olat=48.1374&olon=11.5755&land=de   (76)
jetzt    /wetterkarte/temperatur/muenchen                                             (32)

vorher   /regenradar?lat=48.1374&lon=11.5755&z=8&ort=M%C3%BCnchen&olat=…&land=de      (90)
jetzt    /regenradar/muenchen                                                         (20)

Zeit     t=2026-09-12T15%3A00Z   ⇒   t=2026-09-12T15:00Z
Layer    l=wind%2Cstationen      ⇒   l=wind,stationen
```

Worst Case der Wetterkarte (freier Ort + alle 18 Zusatzlayer + Modell + Mode + Radar +
Kamera + Zeit): **389 Zeichen** — unter Jans Zielgröße 500, im Verifier gemessen.

### 14.3 Belege (Gate GSH1)

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:share` | **236/236** |
| `npm run verify:routing` | **235/235** (vorher 153/153; die neuen Prüfungen sind eingerechnet) |
| `npm run typecheck` | grün |
| `npm run build` (inkl. `generate-seo` + `verify:seo` + `verify:routing`) | grün |
| `npm run budget` | eagerJs **107,3** / 107,9 · eagerCss 2,4 / 2,5 · largestChunk 279,9 / 292,3 · totalJs 1324 / 1330 |
| Browser (Preview, Chrome DevTools) | `/wetterkarte/wind/muenchen` mountet, Suchfeld „München", Canonical `/wetterkarte/wind`; `/regenradar/muenchen` und `/warnungen/wien` ebenso; Alt-Link `?ort=München&olat=…` wird **einmal per replace** auf `/wetterkarte/temperatur/muenchen` gezogen; unbekannter Ort-Slug fällt auf den DACH-Überblick zurück (keine 404); `/wetterkarte/tempratur/muenchen` bleibt 404; Konsole über alle Navigationen **leer** |
| Erzeugte Seiten | `dist/wetter/muenchen/index.html` verlinkt `/wetterkarte/temperatur/muenchen` und `/regenradar/muenchen`; **kein** dreisegmentiger Pfad in der Sitemap |

### 14.4 Zwei Korrekturen am Plan

**(a) Die `%25`-Regel aus §6 war falsch.** Der Plan wollte Doppel-Encoding daran erkennen,
dass im Ziel-Link kein `%25` vorkommt. Das ist kein tragfähiger Test: enthält die geteilte
URL selbst ein Prozentzeichen (`Feldberg%20(Schwarzwald)`), MUSS im `text=`-Parameter
`%2520` stehen — der Empfänger dekodiert genau einmal und hat die Original-URL zurück. Der
belastbare Test ist der Rundlauf über den Standard-Parser:
`new URL(ziel).searchParams.get('text') === nachricht`. Genau den führt `verifyShareTargets`;
`%2525` (zweifach kodiert) bleibt daneben als grobe Gegenprobe.

**(b) Der Erstbild-Pfad wächst um 1,0 KB gzip** (eagerJs 106,3 → 107,3, Ratsche 107,9
unverändert, 0,6 KB Luft). §10.9 hatte „kein Wachstum" zugesagt. Das stimmt für den
*Share-Chunk* — der ist lazy —, aber `urlState.ts` liegt eager, und der schonende
Serialisierer plus das Ortssegment kosten dort. Belegt und eingegrenzt: die Ortstabelle
(3,5 KB), die Sperrliste der Kill-Switches, die Tracking-Erkennung und alle `verify*()` sind
per Textsonde am gebauten `dist/assets/index-*.js` **nicht** im Start-Chunk.
`resolveRoutePlace` ist deshalb aus `urlState.ts` nach `placeTable.ts` gewandert.

### 14.5 Entscheidungen, die beim Bauen dazukamen

1. **`placeSlugs.json` hat eine fünfte Spalte (Land).** Ohne sie löst ein Slug den Ort nicht
   vollständig auf, und `land=` müsste in jedem Link stehen. `npm run seo:places` erzeugt sie;
   `verify:routing` prüft die Gleichheit mit `places.mjs`.
2. **`land=` wird auch für Tabellenorte geschrieben, wenn es von `DE` abweicht.**
   `prefetch.ts` liegt im index-Chunk, kennt die Ortstabelle bewusst nicht und entscheidet an
   `land` den RADOLAN-Frühstart (V-LE-12). Ohne diese eine Ausnahme wäre die LE2-Optimierung
   für österreichische und Schweizer Links still ausgefallen.
3. **Ein Ortssegment gibt es nur hinter einem BEKANNTEN Layer-Slug.**
   `/wetterkarte/tempratur/muenchen` bleibt eine 404 — sonst verschwände jeder Tippfehler
   still in einem „Ort", und V-101 (Fantasie-Adressen sind echte 404) wäre unterlaufen.
4. **Der Anzeigename darf in der Query fehlen**, solange die Koordinate steht: bei
   `bad-reichenhall` trägt der Slug den Namen verlustfrei, bei `muenchen` nicht (Umlaut).
   `slugCarriesName()` entscheidet das; `?ort=Foo` ohne Koordinate bleibt ungültig wie bisher.
5. **`resolveRoutePlace`: die Koordinate der Query gewinnt** gegen den Tabelleneintrag. Der
   Tabellenwert ist das Ortszentrum, die Query der Punkt, den der Absender gewählt hat.
6. **Die Slug-Regel steht zweimal im Repo** (TS + `places.mjs`), weil `verify:seo` ohne
   `--experimental-strip-types` läuft und kein TS importieren kann. `verify:routing` beweist
   die Gleichheit über **alle 198 Orte**, statt sie zu behaupten.
7. **`placeSlugs.json` braucht `with { type: 'json' }`** — Node 22 verlangt das Attribut,
   Vite und Deno verstehen es. (`src/router/placePages.ts` importiert dieselbe Datei ohne
   Attribut; das läuft nur, weil Node sie nie lädt.)

### 14.6 Neue Fallstricke fürs Protokoll

- **Ein Heredoc mit einem ganzen Audit-Dokument sprengt `uv_spawn`** (`ENAMETOOLONG`) — für
  lange Dateien das Write-Werkzeug nehmen.
- **`python - <<'PY'` braucht `PYTHONUTF8=1`**, und deutsche Anführungszeichen beenden einen
  `"`-String: Dreifach-Anführungszeichen benutzen. Hat in dieser Sitzung dreimal zugeschlagen.
- **`Intl` schreibt im Deutschen „Sa." mit Punkt** — ein Wochentags-Regex ohne optionalen
  Punkt schlägt fehl.
- **Die „105/105" für `verify:routing` im CLAUDE.md-Kopf waren fortgeschrieben und falsch**
  (tatsächlich 153/153 vor dieser Phase). Lehre BW-1 gilt weiter: nachzählen statt fortschreiben.

### 14.7 Was als Nächstes ansteht

**SH2 (Share-UI)** — `ShareButton`/`ShareSheet`, Kanäle verdrahtet, `navigator.share` auf
Mobil, Vorschau mit voller URL, Fokus/Escape/44 px. Alle Bausteine dafür liegen bereit;
`ShareState` trägt schon `timePast` und `placeUnresolved`, damit die UI einen alten Link und
einen unauflösbaren Ort **benennen** kann, statt still zu klemmen (V-SH-2).

---

## §15 SH2 — Share-UI (umgesetzt 2026-09-08, Gate GSH2)

Der Teilen-Knopf, das Sheet und die vier Kanäle — verdrahtet an den drei Seiten aus SH1
(Wetterkarte, Warnungen, Regenradar), Desktop und Mobil.

### 15.1 Aufbau

| Datei | Rolle | geladen |
|---|---|---|
| `src/share/ShareButton.tsx` | Icon-Knopf, 44 × 44, `aria-haspopup="dialog"`; hält nur den Offen-Zustand | mit dem Deck |
| `src/share/share.css` | Namensraum `.sh-*`, Command-Deck-Tokens | mit dem Deck |
| `src/share/shareOpen.ts` | Adresszeile → Schnappschuss, natives Teilen, Vorschau-Kürzung | **beim ersten Klick** |
| `src/share/ShareSheet.tsx` | Popover (Desktop) / Bottom-Sheet (mobil), Fokus, Escape, Kanäle | **beim ersten Klick** |

**Der Zustand kommt aus `window.location`, nicht aus Props.** `shareSnapshot()` liest Pfad und
Query und legt sie mit `parseShareUrl` aus — derselbe Parser, den ab SH6 auch die OG-Meta
benutzt. Das hat drei Folgen, die alle erwünscht sind: der Nutzer teilt garantiert genau das,
was in seiner Adresszeile steht; es gibt keine zweite Zustandsquelle, die auseinanderlaufen
könnte; und die Share-Logik hängt an keinem Renderpfad. Nachgewiesen am Netzwerk-Mitschnitt:
`shareOpen-*.js` und `ShareSheet-*.js` erscheinen **erst nach dem Klick**, nicht beim
Seitenaufbau.

Einziger Randfall, der genannt gehört: die Kamera schreibt die Route mit 300 ms Verzögerung
zurück. Ein Klick unmittelbar nach dem Schwenken kann den Ausschnitt um diese Spanne älter
zeigen — ein Klick dauert länger als 300 ms, in der Praxis unauffällig.

### 15.2 Verhalten

- **Mobil mit `navigator.share`** ⇒ natives Teilen-Blatt. Bricht der Nutzer ab (`AbortError`),
  erscheint **kein** eigenes Menü — ein Abbruch ist eine Entscheidung, keine Fehlfunktion.
  Nur wenn die Schnittstelle fehlt oder scheitert, öffnet das eigene Sheet.
- **Desktop** ⇒ Popover unter dem Knopf, rechtsbündig, im Bild gehalten.
- **Kanäle** WhatsApp (mobil `whatsapp://`, sonst `wa.me`) · Gmail · `mailto:` · Kopieren.
  Mail fällt ab 1 800 Zeichen Gesamtlänge weg, statt einen Link zu erzeugen, der beim
  Empfänger abgeschnitten ankommt.
- **Vorschau** zeigt die URL vollständig bis 90 Zeichen, darüber mittig gekürzt — der Anfang
  (die Domain) bleibt immer stehen, der volle Text hängt am `title` und wandert beim Kopieren
  ungekürzt in die Zwischenablage.
- **Hinweise** erscheinen nur, wenn sie auftreten können: „Zeitpunkt in der Vergangenheit"
  (eine lange offene Seite, an der niemand die Karte bewegt hat) und die zwei Längenstufen.
  Der Hinweis auf einen unauflösbaren Ort ist **entfallen** — die Seiten-Wrapper schreiben
  einen solchen Slug schon beim Ankommen aus der URL (am Preview nachgeprüft), im Sheet kann
  er also nie erscheinen. Eine Meldung, die nie erscheint, gehört nicht ins Produkt.

### 15.3 Barrierefreiheit

`aria-haspopup="dialog"` + `aria-expanded` am Knopf, `role="dialog" aria-modal="true"` mit
`aria-label` am Sheet, Fokus beim Öffnen auf das **erste Ziel** (nicht auf „Schließen" — wer
teilen will, soll mit Enter teilen können), Tab-Falle im Sheet, `Escape` schließt und gibt
den Fokus an den Knopf zurück, Klick daneben schließt ebenfalls. Alle Ziele sind echte
`<a>`/`<button>`; die Kopier-Rückmeldung läuft über eine `role="status"`-Region.
Gemessene Touch-Ziele: Knopf 44 × 44 (Karte) bzw. 46 × 46 / 48 × 50 in den mobilen
Schwebeleisten, Kanäle 44 px Desktop / 48 px mobil.

### 15.4 Belege (Gate GSH2)

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:share` | **260/260** |
| `npm run verify:routing` | **235/235** |
| `npm run typecheck` · `npm run build` | grün |
| `npm run budget` | eagerJs **107,5** / 107,9 · eagerCss 2,4 / 2,5 · largestChunk 279,9 / 292,3 · totalJs **1330,9 / 1340** (Ratsche angehoben, s. 15.6) |
| Desktop 1440 × 900 | Popover unter dem Knopf (top 60/62, 20–68 px Rand, 380 breit), Titel „Wetterkarte München — Wind", volle URL, vier Ziele à 44 px, Fokus auf WhatsApp, **Escape schließt und gibt den Fokus zurück**, Klick daneben schließt, `aria-expanded` zurück auf `false` |
| iPhone 12 Pro 390 × 844 | Bottom-Sheet über die volle Breite (390), Ziele einspaltig à 48 px, URL bricht um statt zu überlaufen, **kein horizontaler Überlauf**; mit `navigator.share` geht der Klick ans native Blatt, ohne fällt er aufs Sheet zurück |
| Kanäle | a11y-Baum zeigt echte Links; `wa.me/?text=…%0Ahttp%3A%2F%2F…` — **genau einmal kodiert** |
| Kopieren | mit Dokument-Fokus „Link kopiert" + Ansage in der Status-Region; ohne Fokus „Kopieren ging nicht" **innerhalb von 1,5 s** statt stillem Hängen |
| Konsole | über Aufbau, Öffnen, Kopieren und Schließen **leer** |
| Nachladen | `shareOpen-*.js`, `ShareSheet-*.js` und `layerCatalog-*.js` erscheinen im Netzwerk-Mitschnitt **erst nach dem Klick** |
| Screenshots | `audit/teilen-share/sh2-desktop-wetterkarte.png`, `…/sh2-mobile-wetterkarte.png`, `…/sh2-mobile-regenradar.png` |

### 15.5 Drei Fehler, die erst der Browser gezeigt hat

Alle drei waren im Code nicht zu sehen und in keinem headless-Verifier zu fangen.

1. **Das Sheet lag im Flex-Container des Decks.** `ShareButton` rendert das Sheet als
   Geschwister — und in der mobilen Kartenleiste greift `.mdk-m-topfloat > div { display: flex }`.
   Ergebnis: Titel, URL und Ziele nebeneinander, jedes Ziel 134 × 153 px. `position: fixed`
   schützt davor **nicht** — es nimmt ein Element aus dem Fluss, aber nicht aus der Vererbung.
   Kur: `createPortal` an `document.body`. Das räumt zugleich die zweite Falle aus, die hier
   nur zufällig nicht zuschlug: ein Vorfahr mit `transform` oder `filter` macht `fixed`
   relativ zu **sich** — dann klebte das Sheet an der Leiste statt am Fenster.
2. **Ein hängendes natives Teilen-Blatt hat den Knopf dauerhaft blockiert.** `busy` lag um den
   `await navigator.share(...)`; im ferngesteuerten Browser löst diese Zusage nie auf, und der
   Knopf war für den Rest der Sitzung tot. `busy` deckt jetzt nur noch den Nachladevorgang ab.
3. **`clipboard.writeText` kann hängen** (ohne Dokument-Fokus, hinter einem offenen
   Berechtigungsdialog, in ferngesteuerten Browsern). Der Nutzer bekam dann **gar keine**
   Rückmeldung. `copyText` läuft jetzt gegen eine Frist von 1,5 s und fällt danach auf
   `execCommand` bzw. auf ein ehrliches „Kopieren ging nicht" zurück.

### 15.6 Budget: totalJs angehoben, Erstbild-Pfad unberührt

`totalJs` 1324,0 → **1340,0** (IST 1330,9). Gemessen +6,8 KB gzip. Eindeutig neu sind **5,3 KB**
in zwei Chunks, die erst beim ersten Klick geladen werden (`ShareSheet` 2,75 · `shareOpen` 2,54);
der Rest (~1,5 KB) ist Chunk-Umverteilung — Rollup hat einen gemeinsamen Bucket für Wetterkarte
und Regenradar gebildet. **Achtung bei der Deutung:** dieser Bucket heißt `ShareButton-*.js` und
wiegt 13,6 KB, enthält aber vor allem maplibre-nahen Code, der vorher doppelt inline lag — der
Knopf kostet keine 13,6 KB. `eagerJs` 107,3 → 107,5 (Ratsche 107,9 unverändert), `eagerCss`
unverändert 2,4: `share.css` hängt am Deck-Chunk, nicht an `index.html`.

### 15.7 Was SH2 NICHT umfasst

- **Die Empfängerseite von V-SH-2.** Der Hinweis „der geteilte Zeitpunkt liegt in der
  Vergangenheit" gehört auch **beim Öffnen eines alten Links** ins Readout der Karte, nicht nur
  ins Sheet des Absenders. Das ist eine Änderung an `MapView`/`NowcastDeck` und bleibt offen.
- Die sechs übrigen Feature-Seiten — sie bekommen den Knopf erst, wenn ihr Zustand aus dem
  Fragment in die Query gewandert ist (SH3–SH5). `ShareButton` ist dafür vorbereitet:
  `parseShareUrl` liefert für eine noch nicht teilbare Seite `null`, und dann passiert beim
  Klick schlicht nichts — der Knopf wird dort erst gesetzt, wenn er etwas kann.

---

## §16 SH3 — Waldbrand und Atmosphäre aus dem Fragment (umgesetzt 2026-09-08/09, Gate GSH3)

Die Etappe, die Teil 4 überhaupt erst möglich macht: der Zustand dieser beiden Seiten lag als
prozentkodiertes JSON in `#wb=` bzw. `#atm=`/`#3d=`. Ein Fragment erreicht den Server nie —
also konnte für sie kein Vorschaubild und kein zustandsbezogener `og:title` entstehen (§1.2).

### 16.1 Was gebaut wurde

| Datei | Rolle |
|---|---|
| `src/fire/fireUrl.ts` | **neu**, pur: Waldbrand-Zustand ⇄ Query (`t` · `l` · `fenster` · `index` · `flaechen` · `tag` · `boden` · `zeitraum` · `reiter` · `dossier`) |
| `src/atmosphere/atmosphereUrl.ts` | **neu**, pur: Atmosphären-Zustand ⇄ Query (`t` · `nerd` · `marker` · `schnitt` + Ortsgruppe) |
| `src/router/pages/FireRoute.tsx` | **einziger Schreiber** von Pfad + Query; übersetzt `#wb=` beim Ankommen |
| `src/router/pages/AtmosphereRoute.tsx` | dito für `#atm=`/`#3d=`; Ort als Pfad-Slug hinter der Linse |
| `src/fire/FirePage.tsx` · `src/atmosphere/atmosphereStore.tsx` | Hash-Schreiber **entfernt**, Zustand geht per `onUrlState` nach oben |
| `src/share/shareAdapters.ts` | beide Seiten teilbar; `SHARE_ROUTES` jetzt fünf |
| Decks | Teilen-Knopf in Brandradar-Topbar + mobiler Kartenzeile, Atmosphären-Topbar + mobiler Leiste |

Die alten Codecs (`fireState.ts`, `atmosphereState.ts`, `threedState.ts`) bleiben als **Leser**
erhalten — genau dafür werden sie beim Ankommen noch gebraucht.

### 16.2 Wie die Links jetzt aussehen

```
vorher   /waldbrand/aktive-braende#wb=%7B%22b%22%3A37124%2C%22d%22%3A0%2C%22w%22%3A48%7D   (195)
jetzt    /waldbrand/aktive-braende?fenster=7t                                              (52)

vorher   /atmosphaere/querschnitt#atm=%7B%22l%22%3A%5B47.2692%2C11.4041%2C%22Innsbruck%22…  (247)
jetzt    /atmosphaere/querschnitt/innsbruck?t=2026-09-13T00:00Z&nerd=1&land=at              (88)
```

### 16.3 Vier Entscheidungen, die der Code erzwungen hat

**(a) Das Brandradar bekommt KEIN Ortssegment.** §3.9 hatte `/waldbrand/aktive-braende/freiburg-im-breisgau`
vorgesehen. Beim Lesen des Codes zeigte sich: `FirePage` übergab dem alten Codec fest
`location: null` — die Seite hat gar keine Ortswahl, sie ist ein DACH-Flächenblick. Der Decoder
konnte `l` zwar lesen, geschrieben hat es nie jemand. Ein Ortssegment wäre eine Behauptung ohne
Zustand dahinter. **§3.9 ist damit korrigiert.**

**(b) Die immer aktiven Layer stehen nicht in der URL.** `FIRE_ALWAYS_ON` (Detektionen,
Brandflächen, Thermalanomalien, frühere Brandflächen) ist seit 2026-09-05 in *jedem* Zustand —
sie sagen also nichts. In `l=` stehen nur die fünf schaltbaren; das ersetzt die Bitmaske
`b=37124` durch `l=gefahrenindex,feuerwetter` und macht sie meistens ganz überflüssig, weil die
Sicht im Pfad sie schon impliziert.

**(c) Die Zeit ist absolut — mit zwei Formen.** Auf der Tagesachse ein reines Datum
(`t=2026-09-14`), auf der Stundenachse Datum + Uhrzeit (`t=2026-09-12T15:00Z`). Die Form
**entscheidet zugleich über die Achse**: das war vorher das Vorhandensein von `h` im Hash. Und:
„heute" ist auf der Tagesachse keine Vergangenheit — erst ein früheres Datum wird als solches
gemeldet.

**(d) Mobil öffnet das Brandradar wieder auf der Karte.** Der alte Hash trug `fp`/`ta` und
sagte damit, ob der Nutzer auf dem Brände-Blatt war. Im neuen Schema ist der Reiter *immer*
gesetzt — ohne Gegenmaßnahme hätte jede Seite mobil auf dem Blatt statt auf der Karte geöffnet.
`readoutExplicit` unterscheidet jetzt „die URL nennt den Reiter" von „der Reiter hat halt einen
Wert". Ein Regressionsrisiko, das nur beim Lesen der alten Bedingung sichtbar wurde.

### 16.4 Architektur: ein Schreiber statt zweier

Vorher schrieben Seite (Fragment) und Wrapper (Pfad) unabhängig. Jetzt gilt für beide Seiten das
RT1-Muster aus `WetterkarteRoute`: **der Wrapper ist der einzige Schreiber**, die Seite meldet
ihren Zustand per `onUrlState`. Zustandsänderungen laufen als gebündelter `replaceState` am
Router vorbei (300 ms) — sonst erzeugte der Zeit-Schieber je Schritt einen History-Eintrag.

Nebeneffekt, der zählt: `parseFireQuery` rechnet das Preset der Sub-Route bereits ein, deshalb
ist das zweite `routePreset` in `FirePage` entfallen. Zwei Quellen, die sich widersprechen
konnten, sind eine geworden.

### 16.5 Teilen ohne die schweren Module

`shareAdapters.ts` baut die URL für Waldbrand und Atmosphäre **nicht neu**, sondern übernimmt
den Pfad und filtert nur die Query (Kill-Switches, Tracking). Grund: ein Neuaufbau hier zöge
`fireUrl.ts`/`atmosphereUrl.ts` samt Fire-Modell, EFFIS-Körben und Schnittgeometrie in den
Share-Chunk — mehrere KB, die jeder Kartennutzer beim ersten Klick mitlädt, ohne je das
Brandradar zu öffnen. Der Wrapper schreibt die URL ohnehin schon kanonisch; zu tun bleibt genau
das, was er nicht tut.

Titel und Beschreibung kommen aus der **einen** Routen-Tabelle (`ROUTE_BY_ID`), nicht aus einem
zweiten Text: „Brandradar — Aktive Brände", „Atmosphäre Innsbruck — Querschnitt, Sa 13.09. 02:00".

### 16.6 Der Fehler, den erst der Browser gezeigt hat

**`?fenster=48h` verschwand spurlos.** Der Plan (§3.9) nannte eine Fenster-Leiter
6/12/24/48/72 h/7 T, und ich hatte sie so in den Codec geschrieben. Am Preview stand die URL
danach auf `?index=isi` — `fenster` war weg und der Rückblick zurück auf 24 h.

Die Ursache steht in `fireTime.ts`: `FIRE_LAYER_TIME` bietet **genau zwei** Fenster an
(`windowsH: [24, 168]`), und `reconcileFireTime` klemmt jeden anderen Wert sofort auf
`windows[0]`. Ein URL-Vokabular, das die App nicht kennt, ist kein Zustand — es ist ein stiller
Datenverlust. Der Codec kennt jetzt `24h` und `7t`, und ein erfundener Wert wird als **ungültig
gemeldet** statt still ersetzt (`verify:share` prüft beides).

Die Lehre ist dieselbe wie bei den Index-Schritten aus BW-13 (V-BW-51, „die Schrittliste enthält
Objekte, keine Zahlen"): **das Vokabular einer URL kommt aus dem Code, nicht aus der Plan-Skizze.**
Ein Verifier gegen selbst erfundene Werte ist grün und trotzdem falsch.

### 16.7 Belege (Gate GSH3)

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:share` | **330/330** |
| `npm run verify:routing` | **238/238** |
| `npm run typecheck` · `npm run build` | grün |
| `npm run budget` | eagerJs **107,6** / 107,9 · eagerCss 2,4 / 2,5 · largestChunk 281,6 / 292,3 · totalJs **1334,6 / 1340** |
| Alt-Link `#wb=` | `/waldbrand#wb=%7B%22b%22%3A37124…%7D` ⇒ `/waldbrand/aktive-braende`, **Fragment weg**, Canonical `/waldbrand/aktive-braende` |
| Alt-Link `#atm=` | `/atmosphaere#atm=%7B…%22le%22%3A2%2C%22n%22%3A1%2C%22c%22%3A…%7D` ⇒ `/atmosphaere/querschnitt/innsbruck?t=2026-09-09T11:10Z&nerd=1&schnitt=47.2,11.3;47.4,11.5&land=at` — Linse, Ort, **absolute** Zeit, Nerd-Modus und Schnittlinie alle übernommen |
| Deep-Link Waldbrand | `?fenster=7t&index=isi` überlebt; im Dock steht „7 Tage" aktiv (nach der Korrektur aus 16.6) |
| Deep-Link Atmosphäre | `/atmosphaere/berg-und-weg/innsbruck?land=at` mountet mit Innsbruck, Canonical `/atmosphaere/berg-und-weg` |
| Teilen | Brandradar „Brandradar — Aktive Brände", Atmosphäre „Atmosphäre Innsbruck — Querschnitt, Mi. 09.09. 13:10"; Sheet am Body, Knopf 44 × 44 |
| Konsole | über Alt-Link-Migration, Deep-Link und Teilen **leer** |
| Screenshot | `audit/teilen-share/sh3-desktop-brandradar.jpeg` |

Die Atmosphäre ließ sich nicht fotografieren — die Aufnahme blieb hängen. Das ist die bekannte
Grenze aus R3D („WebGL-Gelände lässt sich nicht zuverlässig fotografieren"), kein neuer Befund;
belegt ist sie über die ausgelesenen Werte oben.

### 16.8 Was auffiel und offen bleibt

- **V-SH-1 ist zur Hälfte erledigt:** die drei Attrappen der Atmosphäre („Link teilen" ohne
  `onClick`) sind echte Knöpfe geworden, und der Knopf steht jetzt in **jeder** Linse — vorher
  gab es ihn nur im Arbeitsfenster, alle anderen Ansichten waren gar nicht teilbar. Der
  **PDF-Knopf** ist weiterhin eine Attrappe; er bleibt Jans Entscheidung (E-7).
- **V-SH-11 (neu):** `decodeFireState` liest ein Feld `l` (Ort), das nie jemand schreibt. Seit
  SH3 ist der Leser nur noch für Alt-Links da; das Feld ist toter Vertrag. Aufräumen, sobald die
  Alt-Link-Frist abgelaufen ist.
- Offen bleibt die **Empfängerseite von V-SH-2** (Hinweis beim Öffnen eines alten Links) —
  unverändert aus SH2.

---

## §17 SH4 — Event, Wetterarchiv, Globus (umgesetzt 2026-09-09, Gate GSH4)

Die letzten drei Fragment-Seiten. Damit sind **acht der neun** Feature-Seiten teilbar; die
Tourenplanung kann es nicht (§1.8, eine GPX passt in keine URL).

### 17.1 Was gebaut wurde

| Datei | Rolle |
|---|---|
| `src/event/eventUrl.ts` | **neu**, pur: `anlass` · `von`/`bis` · `tage` · `phasen` · `flaeche` + Ortsgruppe |
| `src/history/historyUrl.ts` | **neu**, pur: 18 Schlüssel im Klartext statt `v=tmax&r=yearly&p=all&c=kenntage&k=hot` |
| `src/globe/globeUrl.ts` | **neu**, pur: `feld` · `hoehe` · `t` · `c` · `z` · `pin` · `flach` · `partikel` · `hd` + Alt-Leser für `#g=` |
| `EventRoute` · `HistoryRoute` · `GlobeRoute` | **einzige Schreiber**; übersetzen `#ev=`/`#h=`/`#g=` beim Ankommen |
| `EventPage` · `HistoryPage` · `GlobePage` | Fragment-Leser/-Schreiber **entfernt**, Zustand geht per `onUrlState` nach oben |
| `EventResult` | „Link teilen" ist der gemeinsame `ShareButton` statt eines eigenen Kopier-Knopfs |
| `shareAdapters.ts` | `SHARE_ROUTES` jetzt **acht**; Ortssegment je Seite an der richtigen Stelle |
| Decks | Teilen-Knopf in der Wetterarchiv-Topbar und im Globus-Kopf |

### 17.2 Wie die Links jetzt aussehen

```
vorher   /eventplanung#ev=%7B%22a%22%3A%5B%22wedding%22%2C%22Hochzeit%22%5D%2C…   (340)
jetzt    /eventplanung/hochzeit/konstanz?von=2026-09-18&bis=2026-09-25            ( 81)

vorher   /wetterarchiv#h=n=Stuttgart&ll=48.7758%2C9.1829&v=tmax&r=yearly&…        (144)
jetzt    /wetterarchiv/stuttgart?groesse=tmax&diagramm=kenntage                   ( 74)

vorher   /globus#g=%7B%22ov%22%3A%22wind%22%2C%22ht%22%3A%22sfc%22%2C%22fh%22%3A24…(238)
jetzt    /globus?feld=wind&t=2026-09-10T00:00Z&c=51.2,10.4&z=2.6&pin=48.14,11.58  ( 97)
```

Der Event-Link war mit 340 Zeichen der längste im Repo (§1.3) — jetzt ist er der zweitkürzeste.

### 17.3 V-SH-3 ist erledigt: die Achsen des Globus stehen gerade

`#g=` speicherte `c: [lon, lat]` und `pin: [lon, lat]` — überall sonst im Repo gilt `lat, lon`
(repo-weite Lehre 2 der Waldbrand-Linie). Die neuen Parameter sind `c=lat,lon` und `pin=lat,lon`;
**der Alt-Leser behält die alte Reihenfolge**, sonst spränge jeder bestehende Link nach Asien.
Am Preview belegt: `c: [10.4, 51.2]` / `pin: [11.58, 48.14]` kamen als
`c=51.2,10.4&pin=48.14,11.58` an — dieselben Punkte, richtig benannt.

### 17.4 Die Zeit des Globus braucht den Lauf — und wartet auf ihn

`fh` zählte Stunden ab dem GFS-Lauf, und der wechselt alle sechs Stunden: ein geteilter Link
zeigte danach etwas anderes. Jetzt steht die Gültigkeitszeit in der URL. Der Haken: **welcher
Lauf gilt, weiß die Seite erst mit dem ersten Frame** (`RunInfo` kommt asynchron). Deshalb merkt
sich `GlobePage` den gewünschten Zeitpunkt und rechnet ihn **genau einmal** in eine
Vorhersagestunde um, sobald der Lauf bekannt ist; danach gehört die Stunde dem Nutzer.
Solange kein Lauf bekannt ist, schreibt die Seite **kein** `t` — eine erfundene Gültigkeitszeit
wäre schlimmer als keine.

Am Preview belegt: Alt-Link mit `fh: 24` ⇒ `t=2026-09-10T00:00Z`, und die UI zeigt „+1 T ·
Gültig: Do, 10.09. 00:00".

### 17.5 Drei Stellen, an denen der Code die Form vorgab

**(a) Beim Wetterarchiv steht der Ort an Segment 1, nicht an 2.** Die Seite hat keine Sichten
(`subs: null`), also ist `/wetterarchiv/stuttgart` der Ort — bei Atmosphäre und Event steht dort
die Linse bzw. der Anlass und der Ort erst an Stelle 2. `shareAdapters` führt das jetzt als
Tabelle (`PLACE_SEGMENT`), statt es je Seite zu erraten.

**(b) Das Archiv kennt kein Land.** `HistoryLocation` führt `admin` statt `country` — der
Ort-Slug wird deshalb mit `country: 'DE'` gebildet, und `land=` steht in diesen Links nie. Das
ist keine Nachlässigkeit: die Seite fragt das Land nie ab, ein `land=at` wäre erfunden.

**(c) Tuning und Plan-B bleiben draußen.** Die Regel stammt aus `eventState.ts` („kein
Scheinzustand") und gilt weiter — `verify:share` prüft jetzt ausdrücklich, dass im
Event-Vokabular kein Schlüssel dafür auftaucht.

### 17.6 Belege (Gate GSH4)

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:share` | **411/411** |
| `npm run verify:routing` | **238/238** |
| `npm run typecheck` · `npm run build` | grün |
| `npm run budget` | eagerJs **107,6** / 107,9 · eagerCss 2,4 / 2,5 · largestChunk 281,6 / 292,3 · totalJs **1339,7 / 1350** (Ratsche angehoben, s. 17.7) |
| Alt-Link `#h=` | `/wetterarchiv#h=n=Stuttgart&ll=…&v=tmax&c=kenntage&k=hot` ⇒ `/wetterarchiv/stuttgart?groesse=tmax&diagramm=kenntage`, Fragment weg, Kenntage aktiv, Canonical `/wetterarchiv` |
| Alt-Link `#g=` | ⇒ `/globus?feld=wind&t=2026-09-10T00:00Z&c=51.2,10.4&z=2.6&pin=48.14,11.58` — **Achsen gedreht**, Stunde 24 als absolute Zeit, UI zeigt „+1 T" |
| Alt-Link `#ev=` | ⇒ `/eventplanung/hochzeit/konstanz?von=…&bis=…&phasen=Trauung:14-16,Empfang:16-19`, Ort restauriert, Canonical `/eventplanung/hochzeit` |
| Deep-Link Event | `/eventplanung/hochzeit/konstanz?von=2026-09-10&bis=2026-09-14` öffnet direkt im Resultat; Preset-Phasen bleiben aus der URL, der Link ist minimal |
| Teilen | „Event-Planung Konstanz — Hochzeit", „Wetterarchiv Stuttgart", „Globus — Do. 10.09. 02:00"; Sheet am Body, Knopf 44 × 44, im Globus in dunkler Glasfläche |
| Konsole | ein einziger Fehler: **404 von `api.brightsky.dev/current_weather` für einen Gitterpunkt ohne nahe Station** — eine fremde Datenquelle, unabhängig von dieser Etappe. Keine App-Fehler. |

### 17.7 Budget

`totalJs` 1340 → **1350** (IST 1339,7). Über SH3 und SH4 zusammen +8,8 KB gzip für die fünf
neuen Codecs — jeder im lazy Chunk seiner Route. Der Preis der Rückwärtskompatibilität ist,
dass die alten Fragment-Codecs als **Leser** daneben stehen bleiben; das fällt weg, sobald die
Alt-Link-Frist abläuft. `eagerJs` unverändert bei 107,6 (Ratsche 107,9): der Erstbild-Pfad
wächst nicht.

### 17.8 Was auffiel

- **V-SH-3 erledigt** (Globus-Achsen), **V-SH-5 erledigt** (die vierte eigene
  `clipboard`-Stelle in `EventResult` ist weg — der gemeinsame Knopf kann mehr als kopieren).
- **V-SH-12 (neu):** Der Globus ist die einzige dunkle Oberfläche im Repo. Der Teilen-Knopf hat
  dort eine eigene dunkle Glasfläche; das **Sheet bleibt hell**, weil es ein Dialog in der
  App-Sprache ist und kein Teil der Globus-Oberfläche. Wenn Jan das anders will, ist es eine
  Design-Entscheidung, keine Fehlerbehebung.
- Ein Event-Link mit Tagen **jenseits des 7-Tage-Horizonts** öffnet die ehrliche Meldung
  „Für die gewählten Tage liegt noch keine Vorhersage vor" statt eines Resultats — und dann gibt
  es dort auch keinen Teilen-Knopf, weil es nichts zu teilen gibt. Das ist bestehendes Verhalten
  und richtig so; beim Testen sah es zunächst wie ein fehlender Knopf aus.
- Offen bleibt die **Empfängerseite von V-SH-2** und **V-SH-11** (toter `l`-Vertrag im
  Fire-Leser), beide unverändert.

### 17.9 Damit ist die Voraussetzung für Teil 4 erfüllt

Acht von neun Feature-Seiten tragen ihren Zustand in Pfad + Query. Der Grund, warum SH3 und SH4
überhaupt nötig waren, ist damit ausgeräumt: **eine Edge Function kann den Zustand jetzt lesen.**
Die nächste Etappe ist SH5 (Vorhersage + Tourenplanung — die zwei Seiten ohne URL-Zustand),
danach SH6 (Open Graph, Jans Gate).

---

## §18 SH5 — Vorhersage und Tourenplanung (umgesetzt 2026-09-09, Gate GSH5)

Die zwei Seiten, die **gar keinen** URL-Zustand hatten (§1.1). Damit ist der Umzug
abgeschlossen: **acht der neun Feature-Seiten sind teilbar**, die neunte bewusst nicht.

### 18.1 Vorhersage — von null auf teilbar

Bis hierher lebten Ort, gewählter Tag, Diagrammgröße und die abgewählten Modelle in
React-State und `localStorage`. Ein Link führte immer auf das leere Suchfeld, ein Reload verlor
die Auswahl.

```
jetzt   /vorhersage/stuttgart?tag=2026-09-14&groesse=regen&ohne=gfs_seamless   (70)
```

Zwei Punkte sind mehr als ein Umzug:

**Der Tag steht als Datum, nicht als Index.** `selected` war die Position in der Tagesliste —
morgen zeigt derselbe Index einen anderen Tag. Beim Öffnen sucht die Seite das Datum in der
Liste; findet sie es nicht (der Tag ist durchgelaufen), bleibt sie bei „heute" und **rät nicht**.

**`localStorage` bleibt der Standard, die URL gewinnt** (V-SH-10, damit erledigt). Wer nichts
teilt, behält seine gemerkte Diagrammgröße und Modellauswahl; wer einen Link öffnet, sieht, was
der Absender sah. Am Preview mit **geleertem** `localStorage` belegt: `groesse=wind`, zwei
abgewählte Modelle und `konsens=0` überlebten den Rundlauf unverändert.

### 18.2 Tourenplanung — was ein Link ehrlich tragen kann

§3.10 hatte Startzeit, Bewegungsart, **Geschwindigkeitsprofil, Pausen** und Sicht vorgesehen.
Beim Bauen fielen zwei Dinge auf, die den Umfang korrigieren:

**(a) Die Feineinstellungen sind nicht URL-förmig.** `SpeedProfile` sind sechs Zahlen,
`BreakConfig` sieben plus eine Liste, `EbikeConfig` sieben. Als Query ergäbe das
`tempo=24,600,900,3,55,1&pausen=1,zeit,90,10,1,240,45` — genau die Zahlenkette, die Jans
Vorgabe B ausschließt.

**(b) Sie sind überflüssig.** `selectType(id)` setzt Profil **und** Pausen aus
`getMovementType(id).defaults` (TourView:126). Die Bewegungsart trägt die vollständige
Voreinstellung; was jemand daran feinjustiert hat, gehört ihm und seinem Gerät — dieselbe Regel
wie „Tuning und Plan-B werden nicht geteilt" in der Event-Planung.

Es bleiben drei Werte, die etwas über die **Tour** sagen und lesbar sind:

```
/tourenplanung/3d?art=gravel&start=2026-09-13T07:30Z&richtung=rueckwaerts   (72)
```

**Und die Tourenplanung bekommt keinen Teilen-Knopf.** Die Strecke passt in keine URL
(`tourStore.ts`: „eine GPX passt in keine URL"), also sähe der Empfänger die Tour nicht. Ein
Knopf, der einen solchen Link erzeugt, verspricht mehr als er hält. `parseShareUrl` liefert für
diese Route deshalb bewusst `null` — der Zustand in der URL nützt dem, der **selbst**
zurückkommt (Lesezeichen, Reload), nicht einem Empfänger. Jans Entscheidung E-4 lautete
„Einstellungen ohne Strecke, mit ehrlichem Hinweis"; der ehrlichste Hinweis ist, den Knopf
dort nicht anzubieten. **Wenn Jan den Knopf trotzdem will, ist das eine Zeile — bitte sagen.**

### 18.3 Belege (Gate GSH5)

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:share` | **448/448** |
| `npm run verify:routing` | **238/238** |
| `npm run typecheck` · `npm run build` | grün |
| `npm run budget` | eagerJs **107,6** / 107,9 · eagerCss 2,4 / 2,5 · largestChunk 281,6 / 292,3 · totalJs **1342,1 / 1350** |
| Vorhersage, Deep-Link | `/vorhersage/stuttgart?tag=2026-09-12&groesse=regen&ohne=gfs_seamless` — Ort aus dem Pfad, Samstag markiert, „Niederschlag" aktiv, URL nach dem Rückschreiben unverändert, Canonical `/vorhersage` |
| Vorhersage, URL schlägt `localStorage` | mit geleertem Speicher überlebten `groesse=wind`, `ohne=ecmwf_ifs025,gem_seamless` und `konsens=0` den Rundlauf |
| Teilen | „Vorhersage Stuttgart", Sheet am Body, Knopf in der Topbar |
| Tourenplanung, Deep-Link | `/tourenplanung/3d?art=gravel&start=…&richtung=rueckwaerts` bleibt stehen; **kein** Teilen-Knopf |
| Tourenplanung, kaputt | `?art=raumschiff&richtung=seitwaerts` ⇒ still zu `/tourenplanung` bereinigt |
| Konsole | über alle Prüfungen **leer** |

### 18.4 Stand der Phase

| Seite | Zustand in der URL | Teilen-Knopf |
|---|---|---|
| Wetterkarte · Warnungen · Regenradar | ✓ (SH1) | ✓ |
| Waldbrand · Atmosphäre | ✓ (SH3) | ✓ |
| Eventplanung · Wetterarchiv · Globus | ✓ (SH4) | ✓ |
| Vorhersage | ✓ (SH5) | ✓ |
| Tourenplanung | teilweise (SH5: Art, Start, Richtung — **nicht die Strecke**) | — bewusst nicht |

Offen: **SH6** (Open Graph). Dessen Voraussetzung ist erfüllt — eine Edge Function kann den
Zustand jeder teilbaren Seite lesen. Die Freigabe der Edge Function ist Jans Gate (E-6).

### 18.5 Offene Punkte, unverändert

- **V-SH-2**, Empfängerseite: „der geteilte Zeitpunkt liegt in der Vergangenheit" gehört auch
  beim Öffnen eines alten Links ins Readout, nicht nur ins Sheet des Absenders.
- ~~**V-SH-11**~~: erledigt, s. §19.
- ~~**V-SH-12**~~: erledigt 2026-09-09, s. §22.1 — Sheet und Hinweis haben auf dem Globus
  eine dunkle Fassung; die Palette liegt als `--shp-*`-Variablen EINMAL da, nicht zweimal.
- **E-7**: der PDF-Knopf der Atmosphäre ist weiterhin eine Attrappe.

---

## §19 V-SH-11 — der tote Ort-Vertrag im Waldbrand-Leser (erledigt 2026-09-09)

### 19.1 Der Befund

`decodeFireState` las aus dem Alt-Hash `#wb=` ein Feld `l` — Ort als
`[lat, lon, name, land]` —, baute daraus ein `Location` und gab es als
`FireState.location` weiter. `encodeFireState` konnte es schreiben.

**Geschrieben hat es nie jemand.** Über **alle elf Commits**, die `FirePage.tsx`
berührt haben, steht am Aufruf unverändert `location: null, layers: activeList`.
Das ist kein Zufall: das Brandradar hat gar keine Ortswahl — es ist ein
DACH-Flächenblick mit Zeitachse, kein Punktprodukt. Der Leser hat also über die
gesamte Lebenszeit der Datei einen Wert entgegengenommen, den kein Schreiber
erzeugt hat.

Ein Leser ohne Schreiber ist schlimmer als toter Code: er sieht **gepflegt** aus.
Der Nächste, der `FireState.location` liest, hält es für einen Vertrag und baut
darauf — und bekommt dauerhaft `null`, ohne dass irgendwo steht, warum.

### 19.2 Was entfernt wurde

| Ort | vorher | jetzt |
|---|---|---|
| `FireState` | `location: Location \| null` | Feld entfallen (Kommentar mit Begründung) |
| `encodeFireState` | `if (s.location) payload.l = [r5(lat), r5(lon), name, country]` | weg — samt Helfer `r5`, der nur dafür da war |
| `decodeFireState` | `l?: [number, number, string, string]` im Typ, Zweig baut `Location` | weg; das Feld wird schlicht **überlesen** |
| Import | `import type { Country, Location } from '../types'` | weg |

Der Kopfkommentar der Datei sagt jetzt zwei Dinge, die vorher nirgends standen:
dass sie seit SH3 **nur noch Alt-Links liest** (geschrieben wird die Query,
`fireUrl.ts`), und warum der Ort raus ist — mit der Auszählung als Beleg.

### 19.3 Rückwärtskompatibilität: nachgewiesen, nicht behauptet

Die Regel der Phase ist „bestehende Links dürfen nicht brechen". Ein
`#wb=`-Link **mit** `l` ist zwar nie aus buscosun herausgegangen, aber
handschreibbar — also wurde genau der geprüft, in zwei Stufen.

**Selbsttest (netzfrei, läuft in `verify:fire-model`):**

```
OK  kein Ort im Encoder-Ergebnis (das Brandradar hat keine Ortswahl)
OK  handgeschriebener Alt-Link mit `l` wird gelesen, das Feld überlesen
    — {"layers":["fireDanger","fireBurnt"],"day":0,"windowH":24,…}
```

Der zweite Test füttert wörtlich
`{"b":1,"d":0,"w":24,"l":[47.99,7.84,"Freiburg","DE"]}`: die Layer kommen an,
`location` ist **nicht** im Ergebnis, nichts wirft.

**Am laufenden Preview**, derselbe Link vollständig kodiert
(`#wb=%7B%22b%22%3A1…%22l%22%3A%5B47.99609,7.84913,"Freiburg im Breisgau","DE"%5D%7D`):

```json
{"url":"/waldbrand/gefahrenindex?fenster=7t","hashGone":true,
 "windowButtons":["24 h=false","7 Tage=true"],
 "hasShareBtn":true,"mentionsFreiburgAsPlace":false}
```

Der Hash wird gelesen, in die neue Query übersetzt, das Fenster `168 h` kommt als
`7t` an — und „Freiburg" taucht nirgends als Ort auf, weil es nie einer war.

### 19.4 Konsole: acht Einträge, alle fremd

Die Prüfung war **nicht** konsolenrein — und das gehört gesagt, statt es zu
runden. Alle acht Fehler stammen aus fremden Datenquellen und sind vom Code
dieser Etappe unabhängig; jeder wird im Client bereits still abgefangen:

| Einträge | Quelle | Warum |
|---|---|---|
| 1 × `ERR_FAILED` + `TypeError: Failed to fetch` | `rapidmapping.emergency.copernicus.eu` (Copernicus EMS) | interne Dashboard-API, im Modulkopf ausdrücklich als „kann ohne Vorwarnung brechen" geführt; `emsActivations.ts` fällt stumm auf „kein Abzeichen" zurück |
| 18 × `404` | `warnungen.zamg.at/wsapp/api/getWarningsForCoords` | die grobe AT-Hülle (`AT_BOUNDS` 9,4–17,3 O / 46,3–49,1 N) überlappt Bayern und Baden-Württemberg; für deutsche Koordinaten antwortet GeoSphere 404. `fetchWarnContext` prüft `res.ok` und liefert `null` |

**Nebenbefund, nicht Teil dieser Etappe:** die 18 vergeblichen Abrufe verbrauchen
den Deckel `MAX_LOOKUPS = 20` — an einem Tag mit vielen deutschen Detektionen
bleibt für die österreichischen kein Kontingent mehr. Das ist ein Defekt der
Waldbrand-Linie, kein Share-Thema; er gehört als eigener V-Eintrag in
`audit/waldbrand-behoerden.md` und wird hier nur festgehalten, nicht behoben
(ein Thema = eine Phase).

### 19.5 Belege (Gate)

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:fire-model` | **123/123** (beide neuen Prüfungen in der Ausgabe sichtbar) |
| `npm run verify:share` | **448/448** |
| `npm run verify:routing` | **238/238** |
| `npm run typecheck` · `npm run build` | grün |
| `npm run budget` | eagerJs 107,6 / 107,9 · totalJs **1342,0** / 1350 · largestChunk **281,5** / 292,3 |

Der `FireRoute`-Chunk ist um 0,1 KB gzip kleiner als vor der Etappe (281,6 →
281,5) — die einzige Zahl, die ein Rückbau überhaupt bewegen kann, und sie
bewegt sich in die richtige Richtung.

---

## §20 SH6 — Open Graph, Stufe 1 (umgesetzt 2026-09-09, Gate GSH6)

Jans Freigaben vom 2026-09-09: **E-5** wie empfohlen (heller Rahmen, dunkles Kartenfeld)
und **E-6** („Netlify Edge Function ist okay"). Damit ist Teil 4 des Auftrags gebaut —
und die Phase abgeschlossen.

### 20.1 Was jetzt beim Empfänger ankommt

Vorher zeigte **jeder** geteilte Link dieselbe Startseiten-Karte und denselben Routentitel.
Jetzt (gemessen an der echten Crawler-Antwort, §20.6):

```
/wetterkarte/wind/muenchen?t=2027-01-08T15:00Z
  og:title   Wetterkarte München — Wind, Fr. 08.01. 16:00 | buscosun
  og:image   /og/app/wetterkarte-wind.png
/eventplanung/hochzeit/koeln
  og:title   Event-Planung Köln — Hochzeit | buscosun
  og:image   /og/app/eventplanung-hochzeit.png
/atmosphaere/querschnitt/innsbruck?nerd=1
  og:title   Atmosphäre Innsbruck — Querschnitt | buscosun
  og:image   /og/app/atmosphaere-querschnitt.png
```

Titel und Beschreibung kommen aus **demselben** `describeShareUrl`, das im Browser das
Share-Sheet füllt — Jans Vorgabe „eine gemeinsame Parser-Implementierung, kein zweiter
Parser". Wie das trotz Deno gelingt, steht in §20.4.

### 20.2 Die 50 Karten (Stufe 1, kein Bild zur Laufzeit)

`public/og/app/` trägt eine Karte je Feature-Route und je Sub-Route: 12 Routen + 37
Sub-Routen + `tourenplanung-3d` = **50 PNG à 1200×630**, zusammen 4,5 MB. Sie sind
statische Dateien; zur Laufzeit wird **nichts** gerendert (das wäre Stufe 2 = SH7).

**Optik (E-5).** Heller Rahmen in Sand/Ink wie die 74 Inhaltskarten, rechts ein dunkles
Kartenfeld (`--nc-radarbg #0B1016`) mit Gitter, Akzentschein und einem **Motiv je Feature**
— Isolinien für die Wetterkarte, Ringe fürs Regenradar, Warndreieck, Höhenprofil, Kalender,
Balken, Kugel, Hotspots, Vertikalschnitt. Unten im dunklen Feld steht der **Pfad der Seite**
in Schreibmaschinenschrift: `buscosun.com/wetterkarte/wind`. Damit trägt die Karte denselben
Vertrauensanker wie der Link selbst — man sieht, wohin er führt, bevor man ihn anklickt.

**Was die Karten NICHT tun:** sie zeigen keinen Zustand (kein Ort, keine Uhrzeit, kein
Messwert). Das steht im Titel darüber. Eine Karte je Ort × Layer × Stunde wäre Stufe 2 mit
Renderer und Cache; Stufe 1 kostet **null** Laufzeit und deckt den Unterschied ab, der
wirklich zählt: „ist das die Windkarte oder das Brandradar?"

**Welche Karte zu welcher Seite gehört, entscheidet eine Regel, keine Liste.**
`ogCardPath(routeId, sub)` in `src/share/ogCard.ts` — benutzt von vier Stellen: dem
Renderer, dem Shell-Generator, der Edge Function und dem Verifier. Das korrigiert §8 des
Plans, der 49 `ogImage`-Literale in `routes.ts` vorsah: die hätte niemand gegen den Bestand
geprüft, und das Feld `SubRoute.ogImage` **hat nie jemand geschrieben** — exakt das Muster,
das V-SH-11 einen Tag vorher aus `fireState.ts` entfernt hat. Beide toten Felder
(`RouteMeta.ogImage`, `SubRoute.ogImage`) sind jetzt weg.

`verify:share` prüft beide Richtungen: **jede Seite hat ihre Karte** und **keine Karte ist
ohne Seite**. Eine umbenannte Sub-Route fällt damit im Verifier auf, nicht beim Empfänger
als 404-Bild.

### 20.3 Der Renderer — und ein Rezept, das still nichts mehr tat

`public/_og-app-card.html` ist ein zweiter Karten-Renderer neben `_og-card.html` (die
Inhaltskarten bleiben unberührt, sonst sähen `/funktionen/wetterkarte/` und `/wetterkarte`
plötzlich verschieden aus). Erzeugt wird mit `npm run og:app-cards`.

**Dabei ist die bestehende Anleitung durchgefallen.** `docs/seo-geo/og-images.md` beschrieb
`chrome-headless-shell --screenshot=…`. Gemessen mit beiden Ständen auf dem Rechner
(Chrome 147 und 148): **Status 0, `--dump-dom` liefert sauberes HTML, und es entsteht keine
Datei.** Der Schalter ist ersatzlos verschwunden. Ein Rezept, das still nichts tut, ist
schlimmer als eines, das scheitert — die Doku ist korrigiert.

Ersatz: `scripts/lib/headlessShot.mjs` steuert EINEN Browser über das DevTools-Protokoll
(`Page.captureScreenshot`) mit dem `WebSocket`, den Node 22 mitbringt. Keine neue
Abhängigkeit, und schneller, weil nicht je Bild ein Prozess startet: 50 Karten in ~90 s.

### 20.4 Ein Parser, zwei Laufzeiten

Jans Vorgabe war eindeutig: **kein zweiter Parser.** Direkt importieren kann die Edge
Function `shareAdapters.ts` trotzdem nicht — sie läuft unter **Deno**, und Deno verlangt an
jedem Import eine Datei-Endung (`'./routes'` ist dort ein Fehler). Der Baum darunter hat
Dutzende solcher Importe plus ein JSON-Modul mit Import-Attribut.

Der Ausweg ist nicht eine Kopie, sondern **dasselbe Modul als Bündel**:

```
src/share/edgeShare.ts   (Einstieg: nur Lesen und Beschreiben)
   │  npm run edge:share   (esbuild, liegt ohnehin im Baum)
   ▼
netlify/edge-shared/shareParser.js   50 KB, unminifiziert, eingecheckt
netlify/edge-shared/shareParser.d.ts → export * from '../../src/share/edgeShare.ts'
```

Damit hat auch der **Typvertrag** nur eine Quelle. Und damit das Artefakt nie unbemerkt
veraltet, baut `verify:share` es bei jedem Lauf neu und vergleicht **Byte für Byte** mit der
eingecheckten Datei: wer `shareAdapters.ts` ändert und `npm run edge:share` vergisst,
bekommt einen roten Verifier — nicht eine Vorschau, die den Zustand von vorgestern
beschreibt. Der Verifier läuft ab jetzt auch in CI.

### 20.5 Die Edge Function — was sie tut und was sie ausdrücklich nicht tut

`netlify/edge-functions/og-meta.ts`, Datei-Konfiguration wie `firms.ts`, kein Eingriff in
`netlify.toml`. Sie greift nur auf den **neun teilbaren Routen**.

**Der Nutzerpfad ist unberührt — und das ist gemessen, nicht behauptet.** Ist der
User-Agent kein bekannter Vorschau-Crawler, kehrt die Funktion sofort zurück: vor dem
Lesen der Shell, vor dem Import des Parsers. Der dynamische Import steht IM Crawler-Zweig,
dieselbe Regel wie beim Teilen-Knopf im Client — die 50 KB Parser landen nie im kritischen
Pfad. Beleg in §20.6: die Antwort an einen iPhone-Safari ist **byte-gleich** zur statischen
Shell.

**Drei Abweichungen vom Plan, alle mit Grund:**

1. **Kein `durable`-Cache** (§7.4 sah ihn vor). Die Antwort hängt am User-Agent; eine
   gecachte Fassung ohne exakt passendes `Vary` kann die Crawler-Antwort an Menschen
   ausliefern. `Vary: User-Agent` wiederum zersplittert den Cache in fast so viele Einträge,
   wie es Crawler-Versionen gibt — der Gewinn wäre klein, das Risiko eine falsche
   Auslieferung. Also: `Cache-Control: public, max-age=300` und ein ehrliches `Vary`.
2. **`og:url` trägt den Zustand, `rel=canonical` bleibt der Routenpfad.** Die Vorschau soll
   den geteilten Link zeigen; der Index soll die Query nie sehen (V-101).
3. **Ein Beleg-Header.** `x-buscosun-og` nennt den kanonisierten Schlüssel
   (`wetterkarte|l:wind|o:muenchen|t:2027-01-08T15`) — genau den, unter dem Stufe 2 später
   ein Bild ablegen würde. Ein `curl` genügt damit als Nachweis, dass die Funktion griff.

Bei **jedem** Fehler und bei jedem Zweifel (keine teilbare Route, kein HTML, Status ≠ 200,
URL über der harten Grenze von 1500 Zeichen) gibt sie die Shell unverändert zurück. Eine
generische Vorschau ist ein kleiner Verlust, eine kaputte Seite ein großer.

### 20.6 Belege (Gate GSH6) — gegen die echte Laufzeit, nicht gegen einen Nachbau

Geprüft mit `netlify dev` (Netlify CLI 26.2.0), also im **echten Deno**, gegen den
gebauten `dist/`-Stand.

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:share` | **491/491** (SH1–SH5 waren 448) |
| `npm run verify:routing` | 238/238 |
| `npm run verify:seo` | 803/803 |
| `npm run typecheck` · `npm run build` | grün |
| `npm run budget` | eagerJs **107,7 / 107,9 (Ratsche unverändert)** · eagerCss 2,4 · largestChunk 281,5 · totalJs 1342,2 / 1350 |

**Crawler (`User-Agent: WhatsApp/2.24.1 A`) — sieben Seiten, sieben verschiedene Vorschauen:**

```
/wetterkarte/wind/muenchen?t=…   Wetterkarte München — Wind, Fr. 08.01. 16:00   wetterkarte-wind.png
/waldbrand/historie?fenster=7t   Brandradar — Historie                          waldbrand-historie.png
/regenradar/freiburg-im-b…       Regenradar Freiburg im Breisgau                regenradar.png
/eventplanung/hochzeit/koeln     Event-Planung Köln — Hochzeit                  eventplanung-hochzeit.png
/atmosphaere/querschnitt/inns…   Atmosphäre Innsbruck — Querschnitt             atmosphaere-querschnitt.png
/globus?feld=temp&hoehe=500hpa   Globus                                         globus.png
/vorhersage/stuttgart?tag=…      Vorhersage Stuttgart                           vorhersage.png
```

**Mensch (iPhone-Safari-UA), derselbe Link:**

```
$ cmp human.html dist/wetterkarte--wind.html
BYTE-GLEICH (12 934 Bytes)
Kopfzeilen: cache-control: public, max-age=0 · vary: Accept-Encoding
            KEIN x-buscosun-og, KEIN Vary: User-Agent
```

Der Unterschied zwischen beiden Antworten sind **15 Zeilen**, und zwar genau:
`og:title`, `og:url`, `twitter:title`, `og:image:width`, `og:image:height`. `og:image` und
`og:description` standen schon vorher richtig da — die Sub-Routen-Shell trug ihre Karte
bereits, die Function musste sie nicht korrigieren.

**Robustheit:**

| Fall | Antwort |
|---|---|
| `?t=morgen&z=viel` | 200, Titel ohne Zeit („Wetterkarte — Wind") |
| `/wetterkarte/wind/gibtsnichtdorf` | 200, Titel ohne Ort — der unauflösbare Slug wird still fallen gelassen |
| `?ort=A%26B%20%22Q%22` | `og:title content="Vorhersage A&amp;B &quot;Q&quot;"` — korrekt escaped |
| URL mit 1600 Zeichen | Shell unverändert, **kein** `x-buscosun-og` |
| `/tourenplanung`, `/wissen/foehn/`, `/wetter/muenchen/`, `/` | Funktion greift gar nicht; Bilder unverändert (`foehn.png`, `wetter-default.png`, `home.png`) |
| Antwort ist kein HTML | unverändert durchgereicht |

### 20.7 Zwei Fehler, die erst diese Etappe sichtbar gemacht hat

**(1) `Number(null)` ist 0, nicht `NaN`.** In `placeFromPairs` stand seit SH3
`Number(q.get('olat'))`. Fehlt das Paar, ist das Ergebnis **0** — und damit bekam jede
Durchreiche-URL mit Ortssegment, aber ohne Koordinaten (`/vorhersage/stuttgart`) still einen
Ort auf **0°/0°** im Atlantik. Der Name kam aus der Tabelle, deshalb sah jeder Titel richtig
aus. Aufgefallen ist es erst am Cache-Schlüssel: `o:0.00,0.00` für **jeden** Ort. Behoben,
mit Regressionsprüfung.

**(2) Die geteilte Zeit verlor eine Minute.** Der erste Crawler-Test zeigte
„Fr. 08.01. **15:59**" für `t=2027-01-08T15:00Z`. Grund: `parseShareUrl` rechnete die
absolute Zeit über die **Slider-Stunde** zurück, und `parseMapSearch` rundet die auf
10-Minuten-Schritte **relativ zu jetzt** — für die Karte richtig (ihre Schritte liegen auf
diesem Raster), für einen Text falsch. Jetzt wird `t=` direkt gelesen; der geteilte Zeitpunkt
ist absolut, also wird er auch absolut gelesen. Zwei Prüfungen halten es fest, eine davon
mit einem „jetzt", das bewusst nicht auf dem Raster liegt.

Beides wäre ohne den Blick auf die **echte** Antwort nicht aufgefallen. Das ist die Lehre
dieser Etappe, und sie steht schon in §16.3 in anderer Form: ein Verifier gegen die eigene
Erwartung kann grün sein, während das Produkt etwas anderes sagt.

**(3) Ein drittes, kleineres:** die Zeitzone. Eine Edge Function läuft in **UTC**. Ohne
ausdrückliche Zone hätte die Vorschau „14:00" behauptet, während die Nachricht daneben
„16:00" sagt. `formatWhen`/`shareCopy`/`describeShareState` nehmen jetzt eine Zone; die
Function übergibt `Europe/Berlin` (eine Zone für ganz DACH). Ehrliche Restlücke: teilt jemand
aus einer anderen Zeitzone, nennt seine Nachricht seine Uhrzeit und die Vorschau die
deutsche. Für ein DACH-Produkt ist die deutsche die richtige Aussage.

### 20.8 Kosten

| | Stufe 1, wie gebaut |
|---|---|
| Zusätzliche Dienste | **keine** (Jans Vorgabe) |
| Laufende Geldkosten | **0** |
| Repo/Deploy | +4,5 MB (50 PNG), einmalig |
| Netlify-Bandbreite | ~10 KB HTML je Crawler-Zugriff + ~90 KB je Karte, ein Tag gecacht (`netlify.toml`); die Plattformen holen das Bild einmal und liefern es danach aus **ihrem** CDN |
| Funktionsaufrufe | eine Invocation je Aufruf der neun Routen; der Nicht-Crawler-Zweig ist ein Regex-Test und kehrt sofort zurück |
| Start-Chunk | +0,1 KB gzip (`ogCardPath`); Parser, Stil-Tabelle und Renderer sind per Textsonde nachweislich **nicht** drin |

Der einzige laufende Posten sind die Funktionsaufrufe: sie hängen jetzt an der Zahl der
Seitenaufrufe der neun Routen, nicht mehr nur an Crawlern. Wird das je knapp, ist der Hebel
`config.path` — er kann auf einzelne Routen verengt werden, ohne dass sich sonst etwas ändert.

### 20.9 Stand der Phase

| Etappe | Stand |
|---|---|
| SH0 Diagnose + Plan | ✓ |
| SH1 Fundament · SH2 Share-UI | ✓ |
| SH3 Waldbrand + Atmosphäre · SH4 Event + Archiv + Globus · SH5 Vorhersage + Tour | ✓ |
| **SH6 Open Graph Stufe 1** | ✓ (diese Etappe) |
| *SH7 Open Graph Stufe 2 (Bild zur Laufzeit)* | *offen, eigene Phase, nur nach Jans Entscheidung* |

**Damit ist der Auftrag „Auswahl teilen" in allen vier Teilen umgesetzt.** Offen bleiben
drei kleine Posten, keiner davon blockierend: **V-SH-2** (Empfängerseite des Hinweises „der
geteilte Zeitpunkt liegt in der Vergangenheit"), **V-SH-12** (das helle Sheet auf dem
dunklen Globus — Design-Entscheidung) und **E-7** (der PDF-Knopf der Atmosphäre ist weiter
eine Attrappe).

**Ein manueller Schritt bleibt Jan:** die Vorschau am **echten** Deploy prüfen (WhatsApp an
sich selbst, Facebook-Sharing-Debugger) — lokal lässt sich alles bis zur Antwort belegen,
aber nicht, wie WhatsApp sie rendert. Steht in `MANUELLE-SCHRITTE.md`.

---

## §21 V-SH-2 — der Hinweis auf der Empfängerseite (erledigt 2026-09-09)

### 21.1 Was gefehlt hat

Ein geteilter Link trägt einen **absoluten** Zeitpunkt (`t=2026-09-12T15:00Z`, Vorgabe A).
Wird er später geöffnet, klemmt jede Seite auf „jetzt" bzw. „heute" — richtig gerechnet und
**stumm**. Der Absender wurde seit SH2 gewarnt („geteilt wird die Ansicht für jetzt"); die
Seite des Empfängers sagte nichts. Genau das steht in Jans Vorgabe zu Teil 1: „eine
definierte Rückfallstrategie, wenn der geteilte Modelllauf nicht mehr existiert —
nächstliegender verfügbarer Lauf plus ein **dezenter UI-Hinweis**."

Der Kopfkommentar in `urlState.ts` versprach das seit SH2 wörtlich („die UI kann das ab SH2
benennen") — und keine UI tat es. Ein Versprechen im Kommentar ist kein Feature.

### 21.2 Was gebaut wurde

`src/share/StaleLinkNotice.tsx` (1,1 KB im eigenen lazy Chunk) — eine Zeile über dem
Inhalt, in der Optik der Sheet-Hinweise (Terracotta-Tönung, Akzentkante links):

```
Geteilter Zeitpunkt: Mi. 09.09. 07:00 — vorbei. Angezeigt wird die Lage für jetzt.
Geteilter Tag: Mo. 07.09. — vorbei. Angezeigt wird heute.
Geteilter Zeitpunkt: Di. 08.09. 14:00 — vorbei. Angezeigt wird der aktuelle Lauf.
```

Jede Seite sagt, was **bei ihr** stattdessen gilt — „die Lage für jetzt" (Karte,
Atmosphäre), „heute" (Brandradar-Tagesachse), „der aktuelle Lauf" (Globus). Ein
Einheitssatz hätte für den Globus die Unwahrheit gesagt.

Verdrahtet in den vier Wrappern, die eine geteilte Zeit lesen können:
`WetterkarteRoute` (auch `/warnungen`), `FireRoute`, `AtmosphereRoute`, `GlobeRoute`.
Nicht im Regenradar: dessen Wrapper ruft `parseMapSearch(loc.search, 0)` — die Seite hat
gar keine `t`-Achse, also gibt es dort auch nichts zu klemmen.

**Die Parser mussten dafür mehr sagen als bisher.** Alle vier meldeten `timePast: boolean`
— „es war einer" —, aber nicht **welcher**. Ein Hinweis, der den Zeitpunkt nicht nennen
kann, ist eine Behauptung; jetzt liefern sie `pastAtMs`. Ein Selbsttest hält beide
zusammen: `timePast` ⟺ `pastAtMs != null`, über alle vier Parser.

### 21.3 Zwei Entscheidungen, die anders ausfielen als gedacht

**(1) Der Hinweis geht von selbst weg — nach zwölf Sekunden.** Der erste Entwurf ließ ihn
stehen, bis jemand ihn wegklickt. Das ist falsch: Sobald der Empfänger die Zeit **selbst**
verstellt, ist die Aussage „angezeigt wird die Lage für jetzt" **unwahr** — und ein
falscher Hinweis ist schlimmer als keiner. Ein Zustandssatz, der zur Lüge werden kann,
gehört nicht dauerhaft ins Bild. Die Sekunden nach dem Ankommen sind genau die, in denen
sich jemand fragt, warum er etwas anderes sieht als versprochen. Wegklicken geht sofort
(44-px-Ziel), und der Text ist `role="status"` mit `aria-live="polite"` — ein Screenreader
liest ihn beim Ankommen vor, ohne den Fokus zu stehlen.

**(2) Mobil steht er OBEN, nicht unten.** Der erste Versuch setzte ihn über die Bottom-Bar
— und legte ihn damit genau auf den Zeit-Schieber des Decks (am iPhone-12-Pro-Bild gesehen,
nicht vermutet). Auch auf dem Desktop wanderte er zweimal: 72 px verdeckte die Modellzeile,
118 px die **Quellenangabe** („Deutschland · DWD ICON-D2 / MOSMIX + Live · RADOLAN-RV").
Ein Hinweis, der die Quellenangabe verdeckt, täuscht mehr, als er erklärt. Jetzt: 176 px
(Desktop) bzw. 122 px (mobil), beides gemessen an den Unterkanten der schwebenden Chips.

Dazu die Lehre aus SH2, die wieder galt: **Portal an den Body**. Die Decks setzen in ihren
Leisten `display: flex` auf die direkten Kinder; `position: fixed` nimmt aus dem Fluss,
aber nicht aus der Vererbung.

### 21.4 Belege (Gate)

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:share` | **512/512** (SH6 waren 491) |
| `npm run verify:routing` | **240/240** (238 + die zwei neuen `pastAtMs`-Prüfungen in `urlState`) |
| `npm run verify:fire-model` | 123/123 |
| `npm run typecheck` · `npm run build` | grün |
| `npm run budget` | eagerJs **107,8 / 107,9 (Ratsche unverändert)** · eagerCss 2,4 · largestChunk 281,7 · totalJs 1343,7 / 1350 |
| Textsonde am Bundle | der Hinweis liegt in `StaleLinkNotice-*.js` (1,1 KB), **nicht** im Start-Chunk — als Prüfung im Verifier verankert |

**Am gebauten Stand (Vite-Preview), vier Seiten:**

| Link | Anzeige |
|---|---|
| `/wetterkarte/temperatur/hamburg?t=…T05:00Z` | „Geteilter Zeitpunkt: Mi. 09.09. 07:00 — vorbei. Angezeigt wird die Lage für jetzt." (Screenshot) |
| `/waldbrand/gefahrenindex?t=2026-09-07` | „Geteilter **Tag**: Mo. 07.09. — vorbei. Angezeigt wird heute." (Screenshot) |
| `/globus?feld=wind&t=…T12:00Z` | „… Angezeigt wird der aktuelle Lauf." — helle Karte auf dunklem Globus, gut lesbar (Screenshot) |
| `/atmosphaere/querschnitt/innsbruck?t=…T05:00Z` | Hinweis steht, überlappt kein einziges Bedienelement (im DOM gegen alle Buttons/Chips geprüft) |
| **Gegenprobe:** `?t=` in der Zukunft | **kein** Hinweis |
| Desktop 1440×900 / iPhone 12 Pro 390×844 | beide geprüft, Schließen-Ziel 44 × 44 px, Portal am `body` |
| Konsole | Karte und Atmosphäre leer; Brandradar wie in §19.4 **1× Copernicus-EMS + 17× zamg-404** — dieselben fremden Quellen, am Netzwerk-Mitschnitt nachgezählt |

### 21.5 Eine bekannte, bewusst offene Überlappung

Auf dem **Brandradar mobil** legt sich der Hinweis für seine zwölf Sekunden über die
Sortier-Chips der Brandliste („Fläche · Aktualität · …"). Dort ist der obere Bereich
dichter als auf den Kartenseiten. Das ist hingenommen: es sind Bedienelemente, keine
Wahrheitsangaben, sie sind danach wieder da, und der Hinweis lässt sich sofort wegklicken.
Eine Sonderposition je Seite wäre ein Knopf mehr an einer Schraube, die sich bei jeder
Deck-Änderung verstellt.

### 21.6 Neuer Befund: V-SH-13 (nicht in dieser Etappe behoben)

Beim Prüfen fiel die **andere** Richtung auf: eine geteilte Zeit in der **Zukunft**, die
über den Horizont des Layers hinausgeht, wird ebenfalls still geklemmt. Gemessen am
2026-09-09, 11:10 UTC, Windkarte: `?t=…T14:10Z` (+3 h) und `?t=…T22:00Z` (+11 h) landeten
beide bei `t=…T13:10Z` — dem Ende des damals verfügbaren Windhorizonts (+2 h).

Beim **Senden** kann das nicht passieren (der Schieber reicht nie weiter als die Daten).
Beim **Empfangen** schon: genau dann, wenn der Lauf zurückliegt, den der Absender sah —
und das ist der Fall aus BW-13/V-BW-58, in dem die Karte sechs Stunden auf 12z stand. Der
Hinweis aus dieser Etappe deckt ihn NICHT ab, weil er nur die Vergangenheit kennt. Die
Kur bräuchte eine Rückmeldung aus `MapView`, dass die Stunde beschnitten wurde — das ist
ein Eingriff in die Zeitlogik der Karte und gehört in eine eigene Etappe, nicht hier
nebenbei. Als **V-SH-13** aufgenommen.

---

## §22 V-SH-12 und E-7 — die dunkle Fassung und der PDF-Knopf (erledigt 2026-09-09)

Jans Auftrag: „mache V-SH-12 und E-7". Beides waren offene **Entscheidungen**, keine Fehler —
und beide Antworten fielen so aus, dass am Ende weniger Code steht, nicht mehr.

### 22.1 V-SH-12 — das Sheet auf dem Globus ist jetzt dunkel

Der Globus ist die einzige dunkle Oberfläche im Repo. Seit SH4 trug der Teilen-Knopf dort die
Glasfläche der übrigen Globus-Knöpfe, das **Sheet** blieb hell — mit der Begründung, es sei ein
Dialog in der App-Sprache. Am Bild war das ein weißes Rechteck auf einer nachtblauen Kugel.

**Nicht gebaut: eine zweite Optik.** Die naheliegende Lösung wäre gewesen, jede Regel für
`--dark` zu verdoppeln — neun Selektoren mit je zwei Farbwerten, die beim nächsten
Design-Schritt auseinanderlaufen. Stattdessen steht die Palette jetzt **einmal** als
`--shp-*`-Variablen auf `.sh-sheet, .sh-stale`, und `.sh-sheet--dark, .sh-stale--dark` tauschen
nur diese Werte:

| | hell (überall) | dunkel (Globus) |
|---|---|---|
| Fläche | `--cream-50` #FAF6EA | #141A24 |
| Text | `--ink-900` #2C2A26 | #EEF1F6 |
| Ziel-Kacheln | #fff | #1B2230 |
| Rahmen | `--border-default` | `rgba(255,255,255,.12)` |
| Akzent | `--terracotta-700` #A85E2E | #D88A56 |

Die dunklen Werte sind **nicht erfunden**: es sind die Glasflächen und Textfarben aus
`src/globe/globe.css` und das Terracotta der dortigen Wortmarke. Weitergegeben wird der Ton als
`tone="dark"` — `ShareButton` → `ShareSheet`, und dieselbe Fassung nimmt der Hinweis aus §21
(`StaleLinkNotice`), damit auf dem Globus nicht die eine Meldung hell und die andere dunkel ist.

**Belegt (Vite-Preview, echter Browser):**

```
Globus, Sheet offen:  class="sh-sheet sh-sheet--dark"
  Fläche rgb(20,26,36) · Text rgb(238,241,246) · Ziel rgb(27,34,48)
  Eyebrow rgb(216,138,86) · Rahmen rgba(255,255,255,.12) · Portal am body · role=dialog
Wetterkarte, Sheet offen:  class="sh-sheet"   (KEIN --dark)
  Fläche rgb(250,246,234) · Text rgb(44,42,38) · Ziel rgb(255,255,255) · Eyebrow rgb(168,94,46)
```

Die zweite Zeile ist der eigentliche Beleg: die Umstellung auf Variablen hat die helle Fassung
**wertgleich** gelassen — kein Pixel Unterschied auf acht der neun Seiten.

### 22.2 E-7 — der PDF-Knopf druckt jetzt einen Bericht

Der Knopf stand seit dem Command-Deck-Redesign im Arbeitsfenster (`vsd-toppill`,
Download-Symbol, „PDF") — **ohne `onClick`**. Daneben stand: „Auswertung enthält Ort, Zeit,
Höhe, Werte, Grenzwert & Status — als PDF/Link exportierbar." Ein Versprechen, das die
Oberfläche gibt und der Code nicht hält, ist schlimmer als ein fehlender Knopf.

**Drei Wege, einer gewählt:**

| | Weg | Bewertung |
|---|---|---|
| a | PDF-Bibliothek (jsPDF, pdf-lib) | neue Laufzeit-Abhängigkeit für eine Seite ⇒ Dependency-Gate (STOPP & FRAGEN), ~100 KB im Bundle |
| b | Knopf entfernen | löst das Versprechen ein, nimmt aber der Zielgruppe (Drohne, Kran, Gerüst) genau das, was sie braucht: ein Blatt für die Mappe |
| c | **Druckweg des Browsers** | jeder Druckdialog kann „Als PDF speichern"; es braucht nur eine Seite, die für Papier gebaut ist |

Gewählt **(c)**: `src/atmosphere/GoNoGoReport.tsx` hängt per Portal am Body, ist am Schirm
`display: none` und im Druck das **Einzige** (`#root` wird ausgeblendet). Damit muss das Deck
für den Druck nicht umgebaut werden, und ein Ausdruck zeigt nie eine halbe Bedienoberfläche.

**Was auf dem Blatt steht** — genau die Zusage der Bildunterschrift, plus die Ehrlichkeit, die
auf Papier mehr zählt als am Schirm (der Zettel überlebt den Tab):

```
Arbeitsfenster · Go / No-Go                      Erstellt: Mi., 09.09.2026, 14:06
Ort            Innsbruck · 47,3492, 11,4492 · 2258 m ü. NN
Arbeitshöhe    120 m über Grund
Böen-Limit     40 km/h (eigener Grenzwert)
Zeitfenster    Mi., 09.09.2026, 14:00 bis Fr., 11.09.2026, 01:00
Modelllauf     Mi., 09.09.2026, 14:05

GO   jetzt 14:00: Böen auf Arbeitshöhe unter dem Limit (31 km/h von 40 km/h).
     Nächstes Fenster über dem Limit ab 14:15 (bis 18:15, 67 km/h).

Böen auf Arbeitshöhe, jetzt   31 km/h        Spitze im Zeitfenster   67 km/h
Bodenwert (10 m)              19 km/h        Höhenfaktor             ×1,6 (α = 0,20)

Fenster über dem Limit:  14:15 – 18:15, 67 km/h

Keine amtliche Freigabe und keine Flugerlaubnis. …
Diese Ansicht als Link: http://…/atmosphaere/arbeitsfenster/innsbruck?schnitt=…
```

**Der Satz mit dem nächsten Fenster ist beim Bauen dazugekommen**, und er ist der Grund, warum
ein Ausdruck kein Bildschirmabzug sein darf: der Status gilt für **jetzt**. Ein großes „GO"
über einem No-Go-Fenster, das in einer Viertelstunde beginnt, liest sich auf Papier wie eine
Freigabe für den Tag. Am Schirm sieht man das Band daneben; der Ausdruck muss es sagen.

Der Ort ist bewusst der **exponierteste Anker** der Schnittlinie — derselbe, den
`evaluateGoNoGo` auswertet (2258 m ü. NN, nicht das Ortszentrum von Innsbruck). Ein Bericht,
der eine andere Stelle nennt als die berechnete, wäre eine falsche Aussage über ein
Sicherheitsurteil.

### 22.3 Belege (Gate)

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:route-3d` | **587/587** (E-7-Block neu: 23 Prüfungen) |
| `npm run verify:share` | 512/512 |
| `npm run verify:routing` | 240/240 |
| `npm run typecheck` · `npm run build` · `npm run verify:seo` | grün · 803/803 |
| `npm run budget` | eagerJs **107,8 / 107,9 (Ratsche unverändert)** · eagerCss 2,4 · largestChunk 281,7 · totalJs 1345,6 / 1350 |

**Am gebauten Stand:**

- **Druck-Isolation, beide Medien gemessen** (Headless-Chromium mit
  `Emulation.setEmulatedMedia`): `media=print` ⇒ `#root` `display:none`, `.vsd-print` `block`;
  `media=screen` ⇒ genau umgekehrt. Screenshot des Druckbildes (Kopf, Typografie, A4-Ränder)
  liegt in der Ablage.
- **Inhalt des Berichts** aus dem laufenden Browser gelesen (Deep-Link mit `schnitt=`, echte
  Daten): alle neun Zeilen, die Statuszeile und das No-Go-Fenster **stimmen mit den Werten auf
  dem Schirm überein** (31 km/h auf 120 m, Limit 40, Boden 19, Faktor ×1,6, „GO ab 18:15" im
  Band ⇔ Fenster 14:15–18:15 im Bericht).
- **Knopf** in der Barrierefreiheits-Ansicht: `button "PDF" description="Auswertung drucken
  oder als PDF speichern"` — vorher ohne Beschreibung und ohne Wirkung.

**Was NICHT belegt ist, und warum:** ein Druckbild **mit** Inhalt. Headless-Chromium baut die
Schnittlinie nicht (kein WebGL ⇒ keine Karte ⇒ kein Schnitt), und der echte Browser kann kein
Druckmedium emulieren; `window.print()` öffnet einen modalen Dialog, der die Prüfsitzung
blockiert. Inhalt und Druckoptik sind daher **getrennt** belegt: Werte aus dem echten Browser,
Layout aus dem Headless-Lauf. Beim zweiten Versuch, beides zusammenzubringen, hing der
GeoSphere-Nowcast (s. §22.5).

### 22.4 Zwei Verifier-Befunde am Rand

**(1) Mein eigener Check schlug beim ersten Lauf falsch an.** „Kein PDF-Knopf ohne Funktion
mehr" zählte per Regex ALLE `<button …><IconDownload /> PDF</button>` — also auch die gerade
verdrahteten. Ein Verifier, der beim ersten Lauf anschlägt, ist selbst ein Befund; jetzt teilt
er am `<button` auf und prüft je Knopf, ob ein `onClick` dabei ist.

**(2) `verify:route-3d` war vorher schon rot** — und niemandem war es aufgefallen: die Prüfung
„die Laufzeit-Abhängigkeiten sind unverändert **sieben**" ist seit dem 2026-09-06 falsch, denn
Jans MUI-Beschluss zum Brand-Dossier hat fünf Pakete dazugenommen (in `budget.json`
dokumentiert). Genau die Sorte fortgeschriebene Zahl, die BW-1 gelehrt hat zu **zählen**
statt zu behaupten. Behoben, und zwar so, dass ein künftiger Fehlschlag auch sagt, WAS
dazugekommen ist: die Prüfung vergleicht jetzt die **Liste** der zwölf bekannten
Abhängigkeiten, nicht ihre Anzahl. Der eigentliche Zweck bleibt unverändert — kein
PDF-/Druck-Paket, kein heimlicher Zuwachs.

### 22.5 Zwei Befunde, die nicht zu dieser Aufgabe gehören

- **Der GeoSphere-Nowcast hat keine eigene Frist.** `fetchIncaPoint`
  (`src/pointForecast/sampleSources.ts`) ruft `fetch(url, { signal })` — die Frist müsste vom
  Aufrufer kommen, und keiner setzt eine. Beim Prüfen blieben zwei von sechs Ankerpunkten über
  **vier Minuten** auf `pending` (nicht „failed" — hängend), und das Arbeitsfenster stand
  dauerhaft auf „Wetterdaten an Ankerpunkten …". Eine hängende Fremdquelle darf eine Auswertung
  nicht unbegrenzt blockieren; `AbortSignal.timeout` an dieser einen Stelle wäre die Kur. Gehört
  in die Atmosphären-/Punkt-Linie, nicht hierher.
- **Parallelarbeit im selben Arbeitsverzeichnis.** Während dieser Etappe schrieb eine andere
  Linie `src/point/*` und `scripts/point/*` (neue npm-Skripte `point:cube`, `point:terrain`,
  `point:publish`, `verify:point-data`). Ein Zwischenstand von `src/point/sourceMatrix.ts` hat
  `npm run typecheck` für ein paar Minuten rot gemacht — Fehler in einer Datei, die diese
  Etappe nicht berührt. Wer hier Gates abnimmt, muss wissen, dass der Baum nicht allein ihm
  gehört (`CLAUDE.md`: „ein Thema = eine Phase" gilt auch für parallele Sitzungen).

---

## §23 V-SH-13 — die geteilte Stunde kommt an (erledigt 2026-09-09)

### 23.1 Die Diagnose kippt den Befund

Der Katalogeintrag aus §21.6 lautete: „eine geteilte Zeit in der **Zukunft**, die über den
Horizont des Layers hinausgeht, wird still geklemmt". Die Messung hatte gestimmt (`+3 h` und
`+11 h` landeten beide bei `+2 h`), die **Erklärung** nicht. Der Grund ist nicht der Horizont
der Daten, sondern der **Erstbild-Modus**:

```
MapView.tsx:2385   const sliderHours = (START_NOW_ONLY && !embedded) ? NOWONLY_AHEAD_H + 1 : FORECAST_HOURS;
                                                                      └── 2 + 1 = DREI Stunden
MapView.tsx:982    const forecastAheadHRef = useRef(0);   // Frames laden erst beim ersten Slider-Zug
MapView.tsx:4038   if (forecast && forecastHour > sliderMax) setForecastHour(sliderMax);   // ⇒ klemmt
```

`START_NOW_ONLY` ist die Erstbild-Optimierung (default an, `?startnow=0` schaltet sie ab): die
Zeitbasis ist drei Stunden lang, die Frames laden erst, wenn jemand den Schieber bewegt. Eine
aus der URL wiederhergestellte Stunde jenseits davon wird sofort auf `sliderMax` gekürzt — und
nichts holt sie je zurück.

**Das Kontrollexperiment macht es eindeutig** (2026-09-09, derselbe Link, gemessen am gebauten
Stand):

| Aufruf | URL nach dem Ankommen | Anzeige |
|---|---|---|
| `/wetterkarte/wind/muenchen?t=…T21:00Z` (+8 h) | `t=…T15:00Z` (**+2 h**) | geklemmt, stumm |
| derselbe Link **`&startnow=0`** | `t=…T21:00Z` **unverändert** | „Stand · Mi 23:00" — richtig |

Die Daten waren also da. Nur das Fenster war zu kurz. Damit ist der Befund kein
Anzeige-Detail, sondern ein Loch in Jans Vorgabe „Deep-Link-Restore inklusive Zeit": ein Link
auf „Wind, morgen 15:00" konnte den Zeitpunkt **gar nicht** wiederherstellen — auf keiner
Karte, seit es den Erstbild-Modus gibt.

### 23.2 Der Fix: ein Link mit Stunde ist kein Erstbild

Zwei Zeilen in `MapView.tsx`, beide an den Stellen, die der Erstbild-Modus gesetzt hat:

```ts
// Fenster der Grid-Layer: startet auf der verlangten Stunde statt auf 0
const forecastAheadHRef = useRef(Math.max(0, Math.ceil(initialHour ?? 0)));

// Zeitbasis: voll, wenn der Link über das Jetzt-Fenster hinaus verlangt
const sharedAhead = Math.max(0, initialHour ?? 0) > NOWONLY_AHEAD_H;
const sliderHours = (START_NOW_ONLY && !embedded && !sharedAhead) ? NOWONLY_AHEAD_H + 1 : FORECAST_HOURS;
```

**Das Erstbild bleibt unberührt.** Ohne `t=` ist `initialHour` 0, `sharedAhead` ist falsch, und
jede Zeile führt exakt denselben Wert wie vorher — LZ1 (Klick → Bild ≈ 200 ms) ist nicht
betroffen. Am gebauten Stand nachgeprüft: ein Aufruf ohne `t=` zeigt weiterhin „JETZT · MI
15:30" **ohne** Stundenmarken am Schieber (die erscheinen erst ab `sliderMax ≥ 4`), also
dieselbe kurze Basis wie zuvor.

Und es lädt **nicht mehr als nötig**: `stepsForNowWindow(steps, runAt, aheadHours)` schneidet
bei `jetzt + ahead` ab. Ein Link auf +6 h holt sechs Stunden, nicht vierundzwanzig — der
`?startnow=0`-Weg aus dem Kontrollexperiment wäre teurer gewesen.

### 23.3 Was übrig bleibt, wird gesagt

Jenseits der 24-Stunden-Basis (`FORECAST_HOURS`) kürzt die Karte weiterhin — und das ist
richtig, denn dort hört das Zeitmodell der Seite auf. Neu ist, dass sie es **meldet**:
`onHourChange(hour, 'clamped')`. Der Wrapper zählt nur die **erste** Meldung nach dem Ankommen
und nur, wenn der Link überhaupt eine Stunde verlangt hat — eine spätere Kürzung entsteht,
weil der Nutzer selbst einen Layer abschaltet, und darüber muss ihm niemand etwas erzählen.

```
Geteilter Zeitpunkt: Do. 10.09. 21:00 — so weit reicht diese Ansicht nicht.
Angezeigt wird das Ende des Zeitfensters.
```

**Der Hinweis nennt bewusst keine Ersatzzeit** — und das ist die Korrektur eines Fehlers, den
erst der Screenshot gezeigt hat. Der erste Entwurf schrieb „Angezeigt wird Do. 10.09. 14:20"
(die Schieber-Stunde, sauber auf dem 10-Minuten-Raster der URL). Im Bild darunter stand aber
„+23 H · **DO 02:00** · Stand · Do 02:00": der Windlayer reicht nur bis dorthin, die
Schieber-Stunde ist nicht die angezeigte Gültigkeitszeit. Zwei Zeiten nebeneinander, von denen
eine falsch ist, sind schlechter als eine Aussage ohne Zahl — die genaue Zeit steht ohnehin im
Zeit-Deck.

### 23.4 Ein Feld statt zweier: `wantedAtMs`

Für den Hinweis aus §21 hatten die vier Parser `pastAtMs` bekommen — „welcher Zeitpunkt, wenn
er vorbei war". V-SH-13 braucht denselben Wert für einen **künftigen** Zeitpunkt. Zwei Felder
für dieselbe Angabe wären die zweite Wahrheit gewesen; deshalb heißt es jetzt überall
`wantedAtMs` = „was der Link verlangt hat", und `timePast` sagt zusätzlich, ob es vorbei ist.
Alle vier Parser (`urlState`, `atmosphereUrl`, `globeUrl`, `fireUrl`) setzen es gleich, alle
Verbraucher fragen `timePast` ab. Der Verifier prüft beides — auch, dass ein künftiger
Zeitpunkt benannt wird, ohne als „vorbei" zu gelten.

### 23.5 Belege (Gate)

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:share` | **528/528** (13 neue V-SH-13-Prüfungen; V-SH-2 waren 512) |
| `npm run verify:routing` | **241/241** |
| `npm run verify:route-3d` | 587/587 |
| `npm run typecheck` · `npm run build` · `verify:seo` | grün · 803/803 |
| `npm run budget` | eagerJs **107,8 / 107,9 (Ratsche unverändert)** · largestChunk 281,7 · totalJs 1345,8 / 1350 |

**Am gebauten Stand, drei Fälle:**

| Link | Ergebnis |
|---|---|
| `?t=+8h` (im Rahmen) | URL **behält** `t=2026-09-09T21:00Z`, Deck „+6 h · Stand Mi 22:58" — **kein** Hinweis, weil es nichts zu sagen gibt |
| `?t=+30h` (jenseits der Basis) | gekürzt auf +23 h **und** Hinweis „so weit reicht diese Ansicht nicht" (Screenshot) |
| ohne `t=` | „JETZT · MI 15:30", keine Stundenmarken ⇒ kurze Erstbild-Basis wie vorher, kein Hinweis |
| Gegenprobe V-SH-2 | ein vergangener Link zeigt weiterhin „… — vorbei. Angezeigt wird die Lage für jetzt." und **nur diesen einen** Hinweis |
| Konsole | leer |

### 23.6 Was dabei auffiel (nicht behoben)

Der Schieber kann weiter reichen als die geladenen Frames: `sliderMax` nimmt auch den
Wolken-Horizont (bis 12 h) auf, während `forecastAheadHRef` im Erstbild-Modus nur auf 2 h
wächst. Wer dann auf +8 h zieht, sieht den nächstgelegenen vorhandenen Frame — ohne Hinweis.
Dieselbe Familie wie V-SH-13, aber ein anderer Auslöser (Nutzer statt Link), und die Kur wäre
ein Nachladen **während** des Ziehens — also eine Änderung am Ladeverhalten der Karte mit
Messpflicht (LZ1). Gehört in die Layer-/Ladezeit-Linie, nicht in die Teilen-Phase.
