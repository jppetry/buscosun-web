# Seewetter-SEO (Phase SS): Spot-Seiten, Übersicht, Wissen, Bing

> Auftrag Jan, 02.11.2026: „buscosun mit dem Seewetter-Feature bei Google und Bing so gut wie möglich ranken lassen, wenn jemand
> etwas zum Thema Seewetter sucht. Tiefe Recherche, danach direkt im Repo im Main umsetzen."
>
> Gebaut in einer Cloud-Sitzung auf einem Klon von `main` = `fa33869`. **Noch nicht im Arbeitsbaum:** Beim Einspielen arbeiteten
> parallel die Linien GLS, WBS, SA und FX-UI in denselben Dateien (7 Dateien mit Konflikten). Jans Entscheidung 02.11. abends:
> warten, bis diese fertig sind. Bis dahin liegt alles als Patch in `audit/seewetter-seo/ss-gegen-fa33869.patch` (§7).

## 0. Kurzfassung

- **56 Spot-Seiten** `/seewetter/<spot>` sind jetzt eigene, indexierbare Sub-Routen: eigene Shell, eigener Canonical, eigener Titel
  („Seewetter Sylt Westerland — Wind, Wellen, Böen"), Steckbrief-Text aus echten Eigenschaften des Ortes, Nachbarspots, Ortsseiten,
  `WebPage.about` als `Place` mit Koordinaten. Vorher teilten alle Spot-Pfade Shell und Canonical von `/seewetter` — für „Seewetter Kiel"
  oder „Wellen Sylt" gab es keine indexierbare Seite.
- **Übersicht `/seewetter`:** Titel mit „Seewetterbericht", Verzeichnis aller Spots nach Revier und Küstenabschnitt (Anker), sichtbare
  Fragen und Antworten, Wassertemperatur genannt. Die App schreibt den Standard-Spot nicht mehr in die Adresse (sonst hätte die
  Übersicht ihren Canonical an St. Peter-Ording abgegeben).
- **Wissen:** `/wissen/seegang-wellenhoehe/` und `/wissen/seewetterbericht/` für die informationalen Suchen („Seewetterbericht",
  „Wellenhöhe", „Windsee Dünung"), mit Abschnitt je Seegebiet und Links auf die Spots.
- **Bing/Google:** eigene Teil-Sitemap `sitemap-seewetter.xml` (lastmod aus Git), `robots.txt`, IndexNow mit `--only=/seewetter`.
- **Nicht gemacht (Jans Gate oder Konzeptfrage):** Live-Werte im Roh-HTML (Edge Function), Seegebiets-Seiten als App-Ansicht,
  automatisches IndexNow nach dem Deploy (§6).

## 1. Diagnose (Stand `fa33869`)

| Punkt | Befund | Beleg |
|---|---|---|
| Spot-Pfade | `/seewetter/<spot>` antwortet 200 mit der Shell der Route, Canonical `/seewetter`, kein eigener Titel | `routes.ts` (`subs: null`), `netlify.toml` `/seewetter/*` |
| Übersicht im Client | beim Laden `navigate(replace)` auf `/seewetter/st-peter-ording` (`SeaPage` `onSpot(…, firstSpot)`) | `src/sea/SeaPage.tsx` |
| Roh-HTML `/seewetter` | 338 Wörter (SN), keine Links auf Spots; Titel ohne „Seewetterbericht"; „rund 60 Spots" (es sind 56) | `dist/seewetter.html`, `routeTexts.ts` |
| Sitemap | `/seewetter` einmal in `sitemap-pages.xml`, kein Spot | `generate-seo.mjs` |
| Bing | IndexNow-Skript meldet nur den ganzen Bestand | `scripts/seo/indexnow.mjs` |
| Wissen | kein Artikel zu Seegang/Wellenhöhe oder zum Seewetterbericht | `scripts/seo/explainers*.mjs` |
| In Ordnung | Aliase 301 (`/kuestenwetter`, `/segelwetter`, `/wellen`), `buscosun.de` → `.com` 301, OG-Karte, `/funktionen/seewetter/`, `/methodik/seewetter-quellen/` | `netlify.toml` |
| Live-Werte | stehen nur im gerenderten DOM (App), nie im Roh-HTML | — |

## 2. Recherche (Kurzfassung, 02.11.2026)

Ausführlicher Bericht im Sitzungsverlauf; die tragenden Befunde:

1. **Nachfrage:** Für die Kernbegriffe gibt es keine öffentlich belastbaren google.de-Volumina; Werte im Keyword Planner bzw. in der
   Search Console nach dem Livegang erheben. Der Kopfbegriff „Seewetterbericht" ist navigational und gehört dem DWD
   ([dwd.de, Seewetter Nord- und Ostsee](https://www.dwd.de/DE/leistungen/seewetternordostsee/seewetternordostsee.html)).
   Realistisch angreifbar: „Seewetter/Wellen/Wind + Ort", „Segelwetter/Seegang + Seegebiet". Ereignisspitzen sind groß
   (Trends 31.10.–01.11.2026: „hohe wellen nordsee" 50 000+).
2. **Wettbewerb:** Spot-Seiten bei windfinder ([Kiel](https://de.windfinder.com/forecast/kiel_leuchtturm)), Seegebietsseiten bei
   WetterOnline ([Westliche Ostsee](https://www.wetteronline.de/segeln-wind-und-wellen/westl-ostsee)), sogar dünne Generator-Seiten
   ([seatemperature.info](https://seatemperature.info/de/kiel-seewetter.html)) ranken. Keine vereint stündliche Welle (Höhe, Periode,
   Richtung), DWD-Wortlaut, Küstenmessung und Bewertung je Profil auf einer Seite.
3. **Google:** Seiten mit `noindex` im Roh-HTML werden womöglich nicht gerendert; Vorab-HTML ist für alle Crawler sicherer
   ([JavaScript-SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)); Redirects sind ein
   starkes Canonical-Signal ([Duplikate](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls));
   „scaled content abuse" trifft Seiten, die sich nur im Ortsnamen unterscheiden
   ([Spam-Richtlinie 2024](https://developers.google.com/search/blog/2024/03/core-update-spam-policies)); `lastmod` nur, wenn es
   stimmt; für AI Overviews kein eigenes Markup ([AI-Funktionen](https://developers.google.com/search/docs/appearance/ai-features)).
   FAQ-Rich-Results gibt es laut Bericht nicht mehr (Search-Central-Changelog Mai 2026) — sichtbare Fragen bleiben als Text nützlich.
4. **Bing:** IndexNow, Sitemaps, crawlbare Links; Warnung vor Inhalt nur hinter Client-Rendering
   ([Webmaster Guidelines](http://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a),
   [IndexNow](https://indexnow.org/de_de/documentation)). Nur geänderte URLs melden.
5. **GEO:** KI-Crawler rendern meist kein JS; zitierfähig sind Text, Tabellen, Quellen, Stand. `llms.txt` ohne messbare Wirkung (besteht ohnehin).
6. **DWD-Nutzung:** CC BY 4.0 mit Quellenvermerk ([DWD Open-Data-FAQ](https://www.dwd.de/DE/leistungen/opendata/faqs_opendata.html));
   Warnungen nur, wenn sie vollständig und aktuell sind — der Seewetter-Pfad zeigt Warnstatus nur im Wortlaut und setzt ihn nach
   vier Stunden auf „unbekannt" (E-SW-14, `SEA_TEXT_PRODUCTS`).

## 3. Entscheidungen im Auftrag (Auto-Modus, Jan bestätigt beim Einspielen)

- **E-SS-1** Spot-Seiten als Sub-Routen mit eigener flacher Shell (`dist/seewetter--<spot>.html`), URL bleibt `/seewetter/<spot>` —
  bestehende Links, Teilen-Links und Ortsseiten-Verweise zeigen schon dorthin.
- **E-SS-2** Seegebiete (Deutsche Bucht, Westliche Ostsee …) bekommen KEINE eigene App-Route (`seaLink.ts`: „keine eigene Prognose,
  ihr Text steht im Spot-Dossier"). Stattdessen: Verzeichnis nach Revier/Küstenabschnitt auf `/seewetter` (Anker) und der Artikel
  `/wissen/seewetterbericht/` mit Abschnitt je Seegebiet. Eigene Seegebiets-Seiten = V-SS-2.
- **E-SS-3** Keine Live-Werte im Roh-HTML: das bräuchte eine Edge Function oder eine Rebuild-Kette (Jans Gate). Die Spot-Texte tragen
  nur Eigenschaften des Ortes; Live-Werte zeigt die App im gerenderten DOM (V-SS-1).
- **E-SS-4** Titel der Übersicht „Seewetter Nord- und Ostsee: Wind, Wellen, Seewetterbericht" (vorher „… Wind, Welle, Wasserstand",
  SN). Begründung: „Seewetterbericht" ist der gesuchte Begriff; Wasserstand steht weiter in H1 und Description. **Bitte bestätigen.**
- **E-SS-5** Spot-Seiten teilen die Vorschau-Karte `seewetter.png` (`OG_CARD_ROUTE_ONLY`), statt 56 PNG mit nur anderem Namen.
- **E-SS-6** Eigene Teil-Sitemap `sitemap-seewetter.xml` (Indexierung in GSC/BWT getrennt lesbar), `lastmod` aus Git der Quelltexte.
- **E-SS-7** Spot-Texte in einem eigenen Lazy-Chunk (`seaSeoText.ts`), damit Layer-Seiten die Steckbriefe nicht mitladen.
- **E-SS-8** Die Übersicht schreibt den Standard-Spot nicht mehr in die Adresse; der erste gewählte Spot navigiert (Zurück führt zur
  Übersicht). Nebenwirkung: die Übersichtskarte springt nicht mehr auf St. Peter-Ording.
- **E-SS-9** Kein FAQPage-Markup für die Übersicht, nur sichtbarer Text.

## 4. Umsetzung

| Datei | Änderung |
|---|---|
| `scripts/sea/gen-spot-seo.mjs` (neu) | erzeugt `src/sea/seaSpotFacts.ts` aus `sea/v1/static/spots.json` + `gauges.json` (Daten-Repo) und `place-modules.json`: Seegebiet, Küstenabschnitt, Ufernormale, Zellabstand, DWD-Station (Lesename), BSH-Pegel ≤ 20 km, 4 Nachbarspots derselben Küste, Ortsseiten mit diesem Spot als nächstem |
| `src/sea/seaSpotFacts.ts` (neu, GENERIERT) | 56 Steckbriefe, Katalog vom 11.10.2026 |
| `src/sea/seaSeo.ts` (neu, eager) | Sub-Routen (Slug, Label, Titel, Description) aus `seaSpotNames.ts`; `SEA_SPOT_COUNT` |
| `src/sea/seaSeoText.ts` (neu, lazy) | H1, Lead, drei Absätze (Ufer/Profile, Herkunft der Werte, amtliche Texte), Fakten, Nachbarn, Links, Ort |
| `src/router/routes.ts` | `seewetter.subs = seaSeoSubs()`, `SubRoute.label`, Meta der Übersicht, Selbstprüfungen [SS] |
| `src/seo/layerSeoTexts.ts` | `SeoText.related`, `.place`, `.faq` (optional) |
| `src/seo/subRouteTexts.ts` | `verifySubRouteTexts(paths, extraTexts)` — Spot-Texte nach denselben Regeln geprüft |
| `src/seo/routeTexts.ts` | Übersicht: 56 statt „rund 60", Wassertemperatur, 6 Fragen, Links auf die Artikel |
| `src/router/RouteSeoBlock.tsx` | Spot-Texte aus eigenem Chunk; Nachbarspots statt 55 Geschwister; Fragen; Linklabel |
| `src/sea/SeaPage.tsx` | `spotInUrl`: Übersicht bleibt `/seewetter`, bis ein Spot gewählt wird (E-SS-8) |
| `src/share/ogCard.ts`, `scripts/verify-share.mjs` | `OG_CARD_ROUTE_ONLY = ['seewetter']` |
| `scripts/seo/content.mjs` | Spot-Verzeichnis der Übersicht, Fragen, Nachbarliste, `about: Place` + `dateModified` im JSON-LD der Spot-Shells |
| `scripts/generate-seo.mjs` | Spot-Texte, `sitemap-seewetter.xml` im Index |
| `scripts/seo/verify-seo.mjs` | Teilliste Seewetter, Zahl der Sub-Shells inkl. Spots |
| `scripts/verify-routing.mjs` | Spot-Texte in `verifySubRouteTexts` |
| `scripts/verify-sea-seo.mjs` (neu), `package.json` | `npm run verify:sea-seo` |
| `scripts/seo/explainers-extra.mjs` | `/wissen/seegang-wellenhoehe/`, `/wissen/seewetterbericht/` |
| `scripts/seo/nicheTools.mjs`, `audiences.mjs`, `llms.mjs` | Links auf Spots und Artikel; „56 Spots"; Segler-Seite ohne Widerspruch zum Warnstatus |
| `scripts/seo/indexnow.mjs` | `--only=<Pfadanfang>`, Grenze 10 000 URLs |
| `netlify.toml` | 56 Rewrites `/seewetter/<spot>` → `/seewetter--<spot>.html` vor `/seewetter/*` |
| `public/robots.txt` | `sitemap-seewetter.xml` (und das fehlende `sitemap-orte-2.xml`) |
| `netlify/edge-shared/shareParser.js` | neu gebaut, weil `routes.ts` und `ogCard.ts` darin stecken — **nicht im Patch**, nach dem Einspielen `npm run edge:share` |

## 5. Verifikation (Cloud-Sitzung, Klon `fa33869` + Phase SS)

**Grenze der Sitzung:** Die npm-Registry war nicht erreichbar — kein `npm ci`, also kein `vite build`, kein `tsc -b`, kein
`npm run budget`. Diese drei sind Jans Schritt (§82). Gelaufen ist, was ohne Abhängigkeiten läuft:

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-seo` (neu) | 23/23 |
| `generate-seo.mjs` auf einem Stub-`dist/` (Vite-Shell ohne Chunks) | 90 Sub-Shells (34 + 56), 57 URLs in `sitemap-seewetter.xml` |
| `verify-seo.mjs` gegen die erzeugten Seiten | 1 425 Prüfungen, 0 Fehler |
| `verify-routing.mjs` | 267/276; die 9 roten sind Vorlade-Prüfungen gegen echte Vite-Chunks (E-DB-20), am Ausgangsstand mit demselben Stub identisch rot |
| `verify-share.mjs` (Edge-Bündel mit esbuild 0.28.2 neu gebaut; am Ausgangsstand byte-gleich zum eingecheckten Bündel) | 563/563 |
| `tsc` 6.0.3 auf den geänderten Modulen; TSX mit Stub-Typen für React/Router | reine TS-Module fehlerfrei; TSX: dieselben 2 Stub-Fehler vor und nach der Änderung |
| Größe (esbuild, minifiziert, gzip -9) | Start-Chunk ≈ +1,1 KB (Namenstabelle + Vorlagen in `routes.ts`), neuer Lazy-Chunk `seaSeoText` ≈ 7,2 KB (nur auf Spot-Seiten), totalJs ≈ +8,5 KB |

**Budget:** eagerJs vorher 110,3 KB (Grenze 112) ⇒ ≈ 111,4 KB, mit der Autobahn-Freischaltung (SA, +1,2) über 112.
totalJs-Grenze 1 957 KB (IST 31.10. 1 955,2) ⇒ wird rot. Anheben nur mit Notiz und gemessener Zahl (Jan 30.09.).

**Fünf Fragen:** (1) Funktionserhalt: nichts entfernt; geändert ist nur, dass `/seewetter` beim Laden keinen Spot in die Adresse
schreibt und die Karte dort nicht mehr auf St. Peter-Ording springt (E-SS-8). (2) Desktop: Seite unverändert, „Über diese Ansicht"
bleibt zugeklappt — ohne Build nicht gesehen. (3) Touch-Ziele unverändert. (4) Konsole und (5) Long Tasks: nicht gemessen
(kein Build); neu zur Laufzeit ist nur der Text-Chunk auf Spot-Seiten.

## 6. Offene Punkte (V-SS)

- **V-SS-1 Live-Werte ins Roh-HTML.** Eine Edge Function setzt die aktuelle Kurzfassung (Wind, Böe, Welle, Stand, Quelle) und die
  nächsten Stunden als Tabelle in die Spot-Shell — für ALLE User-Agents gleich, kurz gecacht (`s-maxage=600, stale-while-revalidate`).
  Mehrwert: KI-Crawler und Bing sehen Zahlen ohne JS, Snippets mit aktuellem Wert. Gate: Edge Function (Jan).
- **V-SS-2 Seegebiets-Seiten** `/seewetter/deutsche-bucht`, `/seewetter/westliche-ostsee` … als echte Ansicht (Reiter „Seegebiet"
  mit Bericht, Spots des Gebiets). Braucht App-Zustand und Teilen-Parser; Konzeptentscheidung gegen `seaLink.ts`.
- **V-SS-3 IndexNow nach dem Deploy automatisch** (Netlify-Build-Plugin `onSuccess`, nur geänderte URLs). Bis dahin von Hand (§82).
- **V-SS-4 Redaktionelle Steckbriefe** (60–120 Wörter je Spot: Exposition, Sandbänke, Revierbesonderheiten), von jemandem geprüft,
  der die Spots kennt. Stärkster Unique-Content-Hebel laut Recherche; ohne geprüftes Wissen bewusst nicht erfunden.
- **V-SS-5 LCP der Übersicht:** MapLibre blockiert den Hauptthread (SN §5.5); Text zuerst, Karte danach.
- **V-SS-6 Keine Seiten ohne Daten** (Bodensee, Mittelmeer): erst mit Modelldaten und Spots.
- **V-SS-7 Auswertung nach 4–8 Wochen:** GSC/BWT nach Mustern „seewetter + ort", Spots mit Impressionen ohne Klicks bekommen bessere Titel.
- **V-SS-8 Verbreitung:** Vereine an Nord- und Ostsee (Embed/Link „Seewetter für euer Revier"), Hinweis an den DSV, Communities nur als
  erkennbarer Betreiber, Regionalmedien bei Sturmlagen; keine Linkkäufe, keine Wikipedia-Eigenlinks.
- **V-SS-9** Die App zeigt Seegebiete in DWD-ASCII („Suedliche Ostsee", „Boddengewaesser Ost"); `dwdName()` aus `seaSeoText.ts` wäre der Fix.

## 7. Einspielen (sobald GLS, WBS, SA und FX-UI fertig sind)

Patch: `audit/seewetter-seo/ss-gegen-fa33869.patch` (gegen `fa33869`, ohne das Edge-Bündel). Erwartete Konflikte mit dem Stand der
Parallel-Linien vom 02.11. abends: `content.mjs` (6), `generate-seo.mjs` (4), `indexnow.mjs` (2), `llms.mjs` (2), `robots.txt`,
`RouteSeoBlock.tsx`, `layerSeoTexts.ts` (je 1). Inhaltlich: SA hat `SeoText.faq` schon eingeführt (gleicher Typ) — beim Einspielen
nur einmal behalten und die Fragen-Darstellung in Shell und `RouteSeoBlock` zusammenführen; mit `ROAD_INDEXABLE = true` erwartet
`verifyRoutes` 54 + 56 Sub-Routen. Danach: `npm run edge:share`, Verifier, Build, Budget (§82).
