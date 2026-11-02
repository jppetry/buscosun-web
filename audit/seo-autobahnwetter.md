# SEO Autobahnwetter (Phase SA): Ranking bei Google und Bing

> Auftrag Jan, 02.11.2026: buscosun mit dem Autobahnwetter bei Google und Bing so gut wie möglich ranken lassen, wenn jemand
> etwas zum Thema Autobahnwetter sucht; erst tiefe Recherche, dann direkt auf `main` umsetzen. Baut auf Phase SN auf
> (`audit/seo-nischen.md` §6: Freischaltung vorbereitet hinter `ROAD_INDEXABLE`).

## 0. Kurzfassung

- **Freigeschaltet:** `ROAD_INDEXABLE = true`. `/autobahnwetter` und 20 Autobahn-Seiten (`/autobahnwetter/a1` … `/a99`) sind indexierbar,
  stehen in der Sitemap, in `llms.txt` und haben eigene statische Shells (Rewrites aus `audit/seo-nischen/road-release.toml` jetzt in `netlify.toml`).
- **Seiten unterscheiden sich in der Sache:** Teilstrecken, Anlagen je Bundesland, höchstgelegene Messstellen, Brücken, Wald,
  Niederungen und freie Lagen kommen ERZEUGT aus dem Daten-Repo (`src/road/roadSeoFacts.ts`); Verlauf und Gelände je Autobahn
  sind von Hand geschrieben und gegen Wikipedia geprüft (§3). Dazu sichtbare FAQ, `FAQPage`, `WebPage.about` mit Wikipedia-Eintrag.
- **Suchwörter in Title und H1:** „Autobahnwetter A8 — Glätte, Wetter und Fahrbahntemperatur", Hub „Autobahnwetter — Glätte und Fahrbahntemperatur aktuell".
- **Parallel im Arbeitsbaum:** Phase GLS (Gletscher-Seiten) und FX-UI (`/buscosun-fusion`) liefen gleichzeitig uncommittet. Die
  SA-Änderungen sind per Drei-Wege-Abgleich auf deren Stand gelegt; `routes.ts`, `generate-seo.mjs`, `content.mjs`, `llms.mjs`,
  `verify-seo.mjs`, `RouteSeoBlock.tsx`, `netlify.toml` tragen jetzt beide Linien (§6).
- **Interne Links:** Hub listet alle 20 mit Zahlen, jede Autobahn-Seite ihre Teilstrecken und Nachbar-Autobahnen (gerechnet, nicht gepflegt),
  die Funktionsseite alle 20, 36 Ortsseiten zusätzlich die Autobahn-Seite.
- **Offen bei Jan (§8):** OG-Karten rendern (Segoe UI gibt es nur auf Windows), voller Build/Typecheck/Budget, Commit/Push, Search Console,
  Bing Webmaster Tools, IndexNow, **Impressum ausfüllen** (der Build meldet TODO-Platzhalter, §2 D-8).

## 1. Recherche (Kurzfassung des Berichts vom 02.11.2026)

Der volle Bericht steht im Sitzungsverlauf. Für die Umsetzung maßgeblich:

| Befund | Folge für buscosun | Beleg |
|---|---|---|
| Für „Wetter A7"/„Wetter A3" liefern große Wetterportale Ortsseiten gleichnamiger Orte im Ausland; die Suchabsicht „Wetter entlang der Autobahn" bedient kaum jemand | Seite je Autobahn mit dem Suchwort in Title und H1 | wetter.de-Ergebnisse, im Bericht verlinkt |
| Stärkste Konkurrenz: Kachelmann/Meteologix (Stationskarte, Seiten je Bundesland), WetterKontor (Tabellen je Bundesland), wetter.com-Glätteindex (Fläche) — keine Seite je Autobahn, keine Streckenprognose | Lücke: je Autobahn, Messung + Prognose + Gefahren-Leiste | kachelmannwetter.com/de/autobahn, wetterkontor.de/glaettemeldeanlagen |
| Google „scaled content abuse" (März 2024): viele Seiten vor allem fürs Ranking, egal wie erzeugt | jede Seite braucht eigene Substanz; kein Massenseiten-Satz (keine Stationsseiten) | developers.google.com/search/docs/essentials/spam-policies |
| Bing verarbeitet JavaScript „mit Grenzen", KI-Crawler (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot) rendern kein JS | statisches HTML ist die wichtigste Maßnahme — liegt mit den Shells schon vor | Bing Webmaster Guidelines; Vercel/MERJ Dez. 2024 |
| Bing: `lastmod` „one of the most critical tags"; Google nutzt es nur, wenn es stimmt | eigener, ehrlicher `lastmod` für die Autobahn-Seiten (Git-Datum ihrer Quelldateien) | blogs.bing.com/webmaster (Feb. 2023); Google Sitemaps-Doku |
| IndexNow: nur Geändertes melden | `node scripts/seo/indexnow.mjs --match=/autobahnwetter` (Filter aus Phase GLS) | indexnow.org/faq |
| FAQ-Rich-Results bei Google seit 7. Mai 2026 abgeschaltet | FAQ sichtbar als Text, Markup nur ergänzend | laut Bericht (Search Engine Journal) |
| DWD-Quellenvermerk direkt an den Daten; GMA-Daten sind ungeprüfte Punktmessungen | steht in Fakten und Text jeder Seite | dwd.de Vorlagen Quellenangabe |
| Kein hreflang ohne eigene AT/CH-Inhalte; buscosun.de per 301 | beides schon so (E1, `netlify.toml` Alias-Domain) | Google Lokalisierung, Kanonisierung |

**Nicht belegt:** Suchvolumina. Die Prioritäten beruhen auf SERP-Beobachtung; die echten Zahlen liefert die Search Console nach 2–4 Wochen (§8).

## 2. Diagnose (Stand `fa33869`, 02.11.2026)

| Nr. | Befund | Schwere |
|---|---|---|
| D-1 | `/autobahnwetter` ist `noindex` und in keiner Sitemap; die 20 Unterseiten existieren nur hinter `ROAD_INDEXABLE = false` | blockiert jedes Ranking |
| D-2 | Die 20 Unterseiten-Texte (`roadSeoText`) unterschieden sich nur im Namen und im Streckenzug („A 8: Was messen …") — genau das Muster „scaled content" | hoch |
| D-3 | Titles ohne Suchwort „Autobahnwetter A8"/„Wetter A8": „A 8 — Glätte und Fahrbahnzustand"; die Schreibweise „A 8" trifft die Eingabe „a8" schlechter | hoch |
| D-4 | Hub-H1 „Autobahnwetter: Was messen die Anlagen?" ohne „Glätte"; Title ohne „aktuell"/„Fahrbahntemperatur" | mittel |
| D-5 | Ortsseiten verlinken die nächste Teilstrecke (`/autobahnwetter/a61-2`), die keine eigene Seite ist; die Autobahn-Seite bekam keinen Link | mittel |
| D-6 | Sitemap-`lastmod` aller App-Routen hing an `routes.ts`/`subRouteTexts.ts`; die Autobahn-Texte lägen außerhalb | mittel |
| D-7 | Streckenzüge falsch: A 44 „Ruhrgebiet bis Kassel" (beginnt in Aachen), A 45 „Dortmund bis Aschaffenburg" (endet am Seligenstädter Dreieck) | mittel |
| D-8 | Der Build meldet „Impressum UNVOLLSTÄNDIG — TODO-Platzhalter (Name, Anschrift)" in `scripts/seo/legal.mjs` | hoch für Vertrauen (E-E-A-T) und rechtlich; nur Jan kann es füllen |
| D-9 | `render-og-app-cards.mjs` zeichnet in „Segoe UI" (nur Windows); im Container gerendert sähen die Karten anders aus | Umsetzungsgrenze |
| — | Schon richtig: statische Shells mit H1/Lead/Fakten ohne JS, Canonical je Pfad, buscosun.de → 301, robots.txt lässt Bingbot/OAI-SearchBot/ClaudeBot zu, IndexNow-Schlüssel liegt in `public/` | — |

## 3. Faktencheck der Geländesätze

Ein eigener Prüflauf hat jeden Satz gegen den deutschen Wikipedia-Artikel „Bundesautobahn N" (abgerufen 02.11.2026) gelesen. 9 von 20
waren richtig, 11 korrigiert, keiner gestrichen. Korrekturen u. a.: A 1 Lücke Blankenheim–Kelberg (nicht Daun), A 44 beginnt in Aachen und
führt nicht durch Paderborn, A 45 endet am Seligenstädter Dreieck, A 46 endet in Olsberg (drei Teilstücke), A 20 endet am Kreuz Uckermark,
A 3 endet an der österreichischen Grenze, A 93 durchquert das Fichtelgebirge, A 99 im Süden nicht geschlossen. Belegt: Rennsteigtunnel
7 916 m, längster Straßentunnel Deutschlands; A 7 rund 962 km, höchster Autobahnpunkt 914 m bei Nesselwang. Alle 20 Wikipedia-URLs
(`WebPage.about.sameAs`) existieren.

Grundsatz für diese Sätze: Verlauf und Landschaft, keine Unfall- oder Gefahrenaussagen, keine Steigungsprozente (das Höhenmodell misst
über Brücken und Tunnel das Gelände, nicht die Fahrbahn).

## 4. Entscheidungen

| Nr. | Frage | Entscheidung | Grund |
|---|---|---|---|
| E-SA-1 | Freischalten trotz offener Gates C/E? | ja, `ROAD_INDEXABLE = true` | Jans Auftrag vom 02.11. („ranken lassen") setzt Indexierung voraus. Die Seite ist seit 03.10. für alle sichtbar; indexierbar ändert die Anzeige nicht. Offen bleiben die Vorbedingungen aus SN §6 (Stichprobe nach den Fühler-Fixes, `road-archiv` grün) — §8 |
| E-SA-2 | Schreibweise im Title/H1 | „A8" (Suchform), im Fließtext „A 8" | Nutzer tippen „a8 wetter"; die amtliche Form bleibt im Text |
| E-SA-3 | Eigene Brennpunkt-Seiten (Albaufstieg, Kasseler Berge …)? | nein, vorerst Sätze auf den Autobahn-Seiten | ohne Suchvolumen-Daten wären es dünne Seiten; der Albaufstieg hat zudem keine Messreihe (BW). Wieder vorlegen mit Search-Console-Daten (V-SA-2) |
| E-SA-4 | Mehr als 20 Autobahnen? | **Jans Entscheidung**, hier nicht geändert (E-AW-4) | Kandidaten mit ≥ 8 Anlagen mit Reihe: A 24, A 92, A 38, A 43, A 29, A 40, A 70, A 19, A 30, A 72, A 14, A 27, A 60 (Zählung `stations.json`). A 81 nein: 16 Anlagen, alle BW, keine Reihe |
| E-SA-5 | Live-Lagesatz („7 von 31 Messstellen unter 0 °C") im statischen HTML? | nein in dieser Phase | bräuchte eine Edge Function oder Build-Hooks = STOPP-Zone (CLAUDE.md). Google sieht die Live-Werte im gerenderten DOM; für Bing und KI-Crawler wäre es ein Gewinn (V-SA-1) |
| E-SA-6 | FAQ-Markup | sichtbare Fragen als Text, `FAQPage` nur für genau diese | kein Google-Snippet mehr, aber harmlos; Verifier prüft Sichtbarkeit |
| E-SA-7 | `lastmod` der Autobahn-Seiten | eigene Gruppe: Git-Datum von `routes.ts`, `routeTexts.ts`, `roadSeo*.ts` | ehrlich je Seitengruppe; ein Commit an den Autobahn-Texten meldet nicht alle App-Routen als geändert |
| E-SA-8 | Zahlen von Hand oder erzeugt? | erzeugt (`scripts/seo/build-road-seo-facts.mjs`), Höhen nur mit Gegenprobe Höhenmodell ≤ 60 m | „kein Wert ohne Herkunft"; drei Höhen der Stationsliste passen nicht zum Gelände (Piding 820 m, Oberaudorf 874 m, Lemathe 493 m gegen 459/469/176 m im Modell) und fallen so heraus |

## 5. Umsetzung

| Datei | Änderung |
|---|---|
| `src/router/routes.ts` | `ROAD_INDEXABLE = true`; Hub-Title, Description, H1, Lead mit den Suchwörtern |
| `src/road/roadSeo.ts` (eager) | nur noch Liste, `roadSeoQuery`, Titles/Descriptions der 20 Seiten; Streckenzüge A 8/A 44/A 45 korrigiert |
| `src/road/roadSeoTexts.ts` (neu, lazy) | Texte je Autobahn: Verlauf (geprüft), Teilstrecken, Anlagen je Land, BW-Hinweis, höchste Messstellen, Ortsmerkmale und ihre Wirkung auf die Schwellen (wie `roadHazards.ts`), FAQ, `about` |
| `src/road/roadSeoFacts.ts` (neu, ERZEUGT) | Zahlen aus `buscosun-data` (corridors, segments, stations, points, geo), Stand im Kopf |
| `scripts/seo/build-road-seo-facts.mjs` (neu) | Generator, `--data <Klon>` oder raw.githubusercontent, `--check` |
| `src/seo/layerSeoTexts.ts` | `SeoText.faq`, `SeoText.about` (optional) |
| `src/seo/routeTexts.ts` | Hub: Absatz zu den 20 Seiten, fünf FAQ |
| `src/seo/subRouteTexts.ts` | liest `roadSeoText` aus `roadSeoTexts.ts` |
| `src/router/RouteSeoBlock.tsx`, `routeSeoBlock.css` | FAQ im „Über diese Ansicht"-Block (zugeklappt, Karte unverändert); Überschrift der Autobahn-Liste |
| `scripts/seo/content.mjs` | FAQ-Abschnitt + `FAQPage` in Route- und Sub-Shells, `WebPage.about`, Hub-Liste mit Anlagen/km/Ländern |
| `scripts/generate-seo.mjs` | `lastmod`-Gruppe `road`; Text an `subRouteHeadExtras` |
| `scripts/seo/placeContent.mjs` | Ortsseite verlinkt zusätzlich die Autobahn-Seite, wenn die nächste Teilstrecke keine eigene Seite hat |
| `scripts/seo/nicheTools.mjs` | `/funktionen/autobahnwetter/` verlinkt alle 20 |
| `scripts/seo/llms.mjs` | `llms.txt` nennt die 20 Seiten |
| `scripts/seo/verify-seo.mjs` | Block 6b: H1 mit Suchwort, FAQ sichtbar = `FAQPage`, `about` = Wikipedia, keine Warnsprache, Hub verlinkt alle |
| `netlify.toml` | 20 Rewrites vor `/autobahnwetter/*` |
| `netlify/edge-shared/shareParser.js` | neu gebündelt (`edge:share`) |

## 6. Verifikation

**Umgebung:** Diese Sitzung lief in einem Cloud-Container ohne Zugang zur npm-Registry. Es gab kein Vite und keine vollständigen
Typen. Gelaufen ist deshalb, was ohne Bundle geht. Der Generator lief gegen eine Platzhalter-Shell mit leerem Start-Chunk. Dazu kamen ein
Stub für `bz2` und esbuild 0.28.2 statt 0.25.12. Dass esbuild 0.28.2 dasselbe Bündel baut, ist am Stand `fa33869` byte-gleich
nachgewiesen.

| Prüfung | Ergebnis |
|---|---|
| `generate-seo.mjs` | 16 Route-Shells + 54 Sub-Shells (34 + 20), Sitemap mit 20 Autobahn-URLs, `llms.txt` |
| `verify-seo.mjs` | **1 059 ohne Fehler** (vorher 1 037 + 22 neue Prüfungen in 6b); Gegenprobe: H1, Frage, `sameAs` und Warnwort einzeln verfälscht ⇒ alle vier schlagen an |
| `verify-routing.mjs` | 265/274; die 9 roten sind alle `[shell]`-Prüfungen der Vorlade-Hinweise (E-DB-20 u. a.). Sie brauchen echte Vite-Chunks und sind am unveränderten Stand mit derselben Platzhalter-Shell **identisch rot**. Die Texte sind grün (≥ 60 Wörter Lead, ≥ 2 Absätze ≥ 40 Wörter, Descriptions ≤ 160 Zeichen) |
| `verify-share.mjs` | 560/562; die 2 roten sind die 20 fehlenden OG-Karten (§8, Schritt 1) |
| Edge-Bündel | neu gebaut, `--check` gleich |
| Typen | `roadSeo.ts`, `roadSeoFacts.ts`, `roadSeoTexts.ts`, `routeTexts.ts` isoliert mit `strict`/`noUnused*` fehlerfrei. In `routes.ts`, `subRouteTexts.ts` und `RouteSeoBlock.tsx` gibt es keinen Fehler außer den fehlenden React-Typen, und dieselben Fehler zeigt auch der unveränderte Stand |
| Syntax | alle geänderten `.mjs` (`node --check`), `.ts/.tsx` (esbuild-Transform) |

**Nicht gelaufen (Jan, §8):** `npm run typecheck`, `npm run build` (echter Bundle-Lauf inkl. `verify-routing` mit Chunks), `npm run budget`
(eagerJs: `roadSeoSubs` war im SN-Probelauf schon gezählt, 111,5 von 112 KB; neu sind ein längerer Hub-Lead und `roadSeoQuery`, geschätzt
+0,1–0,2 KB gz — knapp), Browser-Sichtprüfung des „Über diese Ansicht"-Blocks, Lighthouse.

## 7. Gate SA

| Kriterium | Stand |
|---|---|
| Hub + 20 Seiten indexierbar, Sitemap, Shells, Rewrites | erfüllt (Container) |
| jede Seite mit eigener Substanz, Zahlen mit Herkunft, Geländesatz belegt | erfüllt (§3, Generator) |
| `verify-seo` grün, Texte in `verify-routing` grün | erfüllt |
| OG-Karten vorhanden, `verify:share` grün | **offen** (Jan, Windows-Font) |
| `typecheck`, `build`, `budget` grün | **offen** (Jan) |
| live: `/autobahnwetter/a8` liefert die eigene Shell (200, eigener Canonical), Sitemap enthält die 20 URLs | nach dem Push (`verify-live.mjs`, URL-Prüfung GSC) |

## 8. Jans Schritte

Siehe `MANUELLE-SCHRITTE.md` §83.

## 9. Befunde (V-SA)

| Nr. | Befund / Mehrwert | Skizze |
|---|---|---|
| V-SA-1 | Bing und KI-Crawler sehen keine Live-Werte (nur Google rendert JS). Ein Lagesatz im HTML („Stand 06:15: an 7 von 31 Anlagen der A 8 Fahrbahn unter 0 °C") wäre das stärkste Frische-Signal | Edge Function auf `/autobahnwetter/*`, die aus dem jüngsten `road/v1`-Slot (gecacht 10–15 min) einen Satz und `dateModified` in die Shell schreibt — für Nutzer und Bots gleich. STOPP-Zone ⇒ Jans Entscheidung |
| V-SA-2 | Brennpunkt-Seiten (Kasseler Berge, Irschenberg, Rennsteig, Sauerlandlinie …) könnten Wintersuchspitzen abholen | erst mit Search-Console-Daten; nur wo eine Messreihe existiert (nicht Albaufstieg, solange BW leer ist) |
| V-SA-3 | Erweiterung auf weitere Autobahnen (E-SA-4) | Liste in E-SA-4; Generator und Texte tragen jede Autobahn ohne Handarbeit, neu sind nur Liste, Rewrites, Karten |
| V-SA-4 | Die Stationsliste des DWD (Stand 2020) führt Anlagen, die nicht mehr melden; die Seiten zählen die Liste, nicht die meldenden Anlagen | zusätzlich „meldeten im Oktober" aus der Tagesablage `road-archiv` zählen |
| V-SA-5 | Teilstrecken-Namen kommen aus GeoNames am Achsende („Daun – Riegelsberg", obwohl die A 1 bei Kelberg wieder beginnt) | Namen der Anschlussstellen (OSM) statt GeoNames für Anfang/Ende |
| V-SA-6 | Impressum mit TODO-Platzhaltern (D-8) | `scripts/seo/legal.mjs` füllen — Pflicht und Vertrauenssignal |
| V-SA-7 | `render-og-app-cards.mjs` braucht Windows (Segoe UI, chrome-headless-shell unter `%LOCALAPPDATA%`) | Schrift aus `public/fonts` einbinden, dann läuft der Renderer überall gleich |
| V-SA-8 | `/autobahnwetter/a8-2` usw. sind `noindex` mit Canonical auf den Hub | Canonical auf die Autobahn-Seite (`/autobahnwetter/a8`) bündelt die Signale besser; braucht eine Regel in `canonicalPath` und der Edge-Vorschau |
