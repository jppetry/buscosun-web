# MANUELLE-SCHRITTE — was nur Jan ausführen kann

Gesammelt während des autonomen Laufs (`RUN-LOG.md`). Nichts hiervon blockiert den Lauf; alles ist
vorbereitet (URL-Listen, Prompt-Listen, Checklisten). Reihenfolge = Empfehlung.

## 1 · Pull Request und Deploy-Preview
- [ ] Falls der Lauf den PR nicht selbst öffnen konnte: auf GitHub PR `seo-geo-2026` → `main` öffnen
      (Draft). Netlify baut dann `deploy-preview-<Nr>--<site>.netlify.app`.
- [ ] Merge nach `main` erst nach eigener Sichtung des Previews (Karte, Regenradar, Brandradar, eine
      Ortsseite, eine Wissensseite auf Desktop und Handy).

## 2 · Impressum
- [ ] Platzhalter in `scripts/seo/legal.mjs` (Name, Anschrift) ausfüllen — der Build warnt, solange sie
      fehlen; die Seite markiert die Lücken sichtbar, statt Daten zu erfinden.

## 3 · Search Console / Bing — **vorbereitet, 5 Minuten Arbeit**

Der Eigentumsnachweis ist verdrahtet: In `scripts/seo/verification.mjs` stehen zwei leere Konstanten.
Token eintragen, `npm run build`, pushen — das Meta-Tag steht dann im Kopf der Startseite. Solange die
Konstanten leer sind, wird kein Tag erzeugt.

**Google Search Console**
1. <https://search.google.com/search-console> öffnen, „Property hinzufügen".
2. Wenn du an die DNS-Einträge der Domain kommst: **Domain-Property** wählen und den TXT-Eintrag beim
   Registrar setzen. Das ist der bessere Weg (deckt alle Subdomains und beide Protokolle ab).
   Sonst: **URL-Präfix** `https://buscosun.com/` → Methode „HTML-Tag" → nur den `content`-Wert kopieren
   und als `GOOGLE_SITE_VERIFICATION` eintragen.
3. Nach dem Deploy auf „Bestätigen" klicken.
4. Links „Sitemaps" → `sitemap.xml` eintragen und absenden. Das ist ein **Sitemap-Index**; die beiden
   Teillisten (`sitemap-pages.xml` mit 125 URLs, `sitemap-orte.xml` mit 198) erscheinen danach von selbst
   und lassen sich getrennt auswerten.
5. Einmal „URL-Prüfung" für `https://buscosun.com/` und für eine neue Seite wie
   `https://buscosun.com/fuer/bau-und-kran/` → „Indexierung beantragen". Das beschleunigt den Erstkontakt.

**Bing Webmaster Tools**
1. <https://www.bing.com/webmasters> → „Aus GSC importieren" (schnellster Weg) oder Property manuell
   anlegen und den `msvalidate.01`-Wert als `BING_SITE_VERIFICATION` eintragen.
2. Sitemap `https://buscosun.com/sitemap.xml` einreichen.
3. Die IndexNow-Meldung ist bereits raus (Nr. 9); Bing sollte deshalb früher etwas zeigen als Google.

**Nach 14 Tagen prüfen:** Bericht „Seiten" — Ziel sind ≥ 80 % der eingereichten URLs indexiert, und die
Meldung „Duplikat — Google hat eine andere kanonische Seite" darf für `/wetterkarte/<layer>` **nicht mehr**
auftauchen. Genau das war der Kernbefund des Audits.

## 3b · Alte Kurzfassung
- [ ] Google Search Console: Domain-Property `buscosun.com` per DNS-TXT verifizieren.
- [ ] Bing Webmaster Tools: Property anlegen (Import aus GSC möglich).
- [ ] Sitemap einreichen: `https://buscosun.com/sitemap.xml` — sie ist seit E9 ein **Sitemap-Index** und
      verweist auf `sitemap-pages.xml` (125 URLs: App-Routen, Erklärungen, Methodik, Zielgruppen,
      Werkzeuge, Glossar, Rechtsseiten) und `sitemap-orte.xml` (138 Ortsseiten). Die Search Console zeigt
      die Indexierung dadurch getrennt je Seitentyp. Beide Teillisten stehen auch einzeln in `robots.txt`.
- [ ] Nach 14 Tagen: Bericht „Seiten" — Ziel ≥ 80 % der eingereichten URLs indexiert; die Meldung
      „Duplikat — Google hat eine andere kanonische Seite" darf für `/wetterkarte/<layer>` nicht mehr
      auftreten.

## 4 · Rich-Results-Test (je Seitentyp eine URL)

Prüfen unter <https://search.google.com/test/rich-results> — je Zeile eine URL, erwarteter Typ dahinter.
Alle Seiten tragen zusätzlich `Organization` und `WebSite` als Entitäten (E3).

| URL | Erwartete Auszeichnung |
|---|---|
| `https://buscosun.com/` | WebSite · WebApplication · Organization |
| `https://buscosun.com/wetter/muenchen/` | Place · Dataset (mit temporalCoverage 1995/2024) · FAQPage · BreadcrumbList |
| `https://buscosun.com/wetterkarte/temperatur` | WebPage · BreadcrumbList |
| `https://buscosun.com/atmosphaere/arbeitsfenster` | WebPage · BreadcrumbList (neue Sub-Route E7) |
| `https://buscosun.com/eventplanung/hochzeit` | WebPage · BreadcrumbList (neue Sub-Route E7) |
| `https://buscosun.com/wissen/foehn/` | Article (mit speakable) · FAQPage · BreadcrumbList |
| `https://buscosun.com/wissen/fire-weather-index/` | Article (neu in E5) |
| `https://buscosun.com/funktionen/arbeitsfenster/` | SoftwareApplication · FAQPage |
| `https://buscosun.com/methodik/hoehenkorrektur/` | TechArticle (mit speakable) · FAQPage |
| `https://buscosun.com/fuer/bau-und-kran/` | WebPage (mit speakable) · FAQPage · BreadcrumbList |
| `https://buscosun.com/glossar/` | DefinedTermSet mit 75 DefinedTerm · BreadcrumbList |
| `https://buscosun.com/wetterlage/waldbrandsaison-2026-dach-zwischenbilanz/` | NewsArticle · BreadcrumbList |
| `https://buscosun.com/ueber/` | AboutPage · Organization |
| `https://buscosun.com/lizenzen/` | WebPage |

- [ ] Jede Zeile einmal prüfen; Warnungen zu optionalen Feldern sind unkritisch, Fehler nicht.

## 5 · AI-Sichtbarkeit (monatlich)
- [ ] `GEO-TESTSET.md` in ChatGPT, Perplexity, Claude und Google AI Overviews/AI Mode abfragen, Log-Tabelle
      dort füllen (N/E/L/F). 300 Prompts sind viel für einen Termin — Vorschlag: pro Monat zwei Zielgruppen
      im Wechsel, dann liegt nach fünf Monaten eine vollständige Runde vor.
- [ ] Beim Prüfen darauf achten, ob das Modell die **Grenzen** mitzitiert (kein Lawinenbericht, keine
      amtlichen Warnungen, Österreich ohne Warnflächen). Genau dafür gibt es `/llms.txt` und
      `/llms-full.txt`; ein Modell, das buscosun ohne diese Einschränkungen empfiehlt, zitiert falsch.

## 6 · Entitäten (extern) — **mit Vorsicht, Reihenfolge zählt**

Wichtig vorweg: Ein Wikidata-Item für ein Produkt, das noch **nirgends** erwähnt wird, hält der
Relevanzprüfung nicht stand und wird gelöscht. Wikidata verlangt entweder einen Wikipedia-Artikel,
oder eine Beschreibung anhand **ernsthafter, öffentlich zugänglicher Quellen**. Ein Eintrag, den der
Betreiber selbst über sein eigenes Produkt anlegt, ohne dass es Belege gibt, fällt in beide Fallen
(Relevanz und Interessenkonflikt) und schadet mehr, als er nützt.

**Deshalb in dieser Reihenfolge:**
1. **Zuerst Belege schaffen.** Zwei bis drei echte, unabhängige Erwähnungen — nicht gekauft, nicht
   selbst in Foren gestreut. Realistische Wege: ein Fachbeitrag über die Höhenkorrektur oder den
   FIRMS-Ortsfest-Klassifikator, den du unter deinem Namen veröffentlichst; eine Vorstellung im
   passenden Fachforum, **mit offengelegter Urheberschaft** und nur dort, wo die Regeln das erlauben;
   ein Eintrag in einer Software-Vergleichsliste (AlternativeTo o. ä.), ebenfalls mit Offenlegung.
2. **Dann Wikidata.** Vorbereiteter Item-Entwurf: siehe `docs/seo-geo/entity-kit.md`.
3. Verzeichnisse ohne Relevanzhürde (AlternativeTo, Awesome-Listen auf GitHub, wenn thematisch passend).

**Was ausdrücklich NICHT getan wird:** Erwähnungen unter fremdem Namen setzen, Foren-Beiträge ohne
Offenlegung, gekaufte Links, Kommentar-Spam. Das verstößt gegen die Regeln der jeweiligen Plattform und
gegen die Spam-Richtlinien von Google, und es fällt bei einer kleinen Domain eher auf als bei einer großen.
- [ ] Wikidata-Item „buscosun" (Instanz von: Website/Webanwendung; Betreiber; Sprache de; offizielle
      Website; Lizenz der Datenquellen). Kein Repo-Link (Repo nicht öffentlich).
- [ ] Verzeichnisse: AlternativeTo (Kategorie Wetter, Alternativen zu Windy/Ventusky), OpenStreetMap-Wiki
      „Weather"-Liste (falls passend), DWD-OpenData-Nutzerliste (falls existent).
- [ ] Community-Seeding nach `docs/seo-geo/seeding-kit.md` (nicht werblich, Forenregeln beachten).

## 7 · Messung ohne Tracker
- [ ] Netlify-Logdrain ist Enterprise-Feature → `scripts/seo/parse-crawler-logs.mjs` bleibt ohne Daten.
      Alternative: Netlify Analytics (serverseitig, kostenpflichtig, tracker-frei) — Entscheidung.

## 8 · Entscheidung: Proxy-Abschottung (STOPP-Liste)
- [ ] Die Rewrites `/_dwd_opendata/*`, `/_meteoalarm/*`, `/_gfs/*`, `/_cscs/*`, `/_mf/*`, `/_ecmwf/*` lassen sich
      nur per Edge Function an `Origin`/`Referer` binden. Der Lauf setzt nur `robots.txt` + `X-Robots-Tag`.
      Wenn gewünscht: eine Edge Function `proxy-guard` vor alle sechs Rewrites (Muster: `_dwd_grib`).

## 9 · IndexNow — **erledigt**, nur noch zur Kenntnis

- [x] Schlüsseldatei liegt unter `public/<key>.txt` (32 Hex-Zeichen, Inhalt = der Schlüssel selbst)
      und wird mit ausgeliefert. **Nicht löschen** — ohne sie weist keine künftige Meldung mehr aus,
      dass sie von uns kommt.
- [x] Alle URLs wurden einmalig an `api.indexnow.org` gemeldet (Bing, Yandex, Seznam, Naver;
      Google nimmt an IndexNow **nicht** teil, dort wirkt nur die Search Console).
- Wiederholen nach größeren Inhaltsänderungen: `npm run build && node scripts/seo/indexnow.mjs`
  (`--dry` zeigt vorher, was gemeldet würde). Mehrfaches Melden ist unschädlich.

## 9b · Alte Vorlage (nur noch Referenz)
- [ ] Key-Datei `public/<key>.txt` anlegen (32 Hex-Zeichen, Inhalt = der Schlüssel selbst), dann einmalig:
      `curl -X POST https://api.indexnow.org/indexnow -H "Content-Type: application/json" -d @indexnow.json`
      Vorlage: `scripts/seo/indexnow.example.json` (Schlüssel und URL-Liste eintragen; die vollständige
      Liste steht in `dist/sitemap-pages.xml` und `dist/sitemap-orte.xml`).
- [ ] Ohne IndexNow passiert nichts Schlimmes — es beschleunigt nur die Erstindexierung bei Bing/Yandex.

## 10 · Prüfung des DWD-Lizenzetiketts im Modellkatalog
- [ ] `src/fusion/modelCatalog.ts` führt für die DWD-Modelle `license: 'CC-BY-4.0'`. Die Seiten wurden in
      E3 auf **GeoNutzV** umgestellt (das ist die Lizenz der DWD-Open-Data). Der Katalog liegt in der
      Fusions-Datei und fällt damit unter STOPP & FRAGEN — deshalb wurde er im Lauf **nicht** angefasst.
      Entscheidung nötig: Etikett im Katalog nachziehen (eine Zeile je DWD-Eintrag) oder so belassen.

## 11 · Bilder und Marke
- [ ] Die 60 in E10 erzeugten OG-Karten liegen in `public/og/`. Sie entstehen aus `public/_og-card.html`
      mit einem lokalen Headless-Chromium (kein Netzdienst, keine neue Abhängigkeit) — Vorgehen und
      Befehl stehen in `docs/seo-geo/og-images.md`. Wenn Titel oder Marke sich ändern: neu erzeugen.
- [ ] Falls eine eigene Karte je Ort gewünscht ist (138 Stück): technisch derselbe Lauf, dauert wenige
      Minuten. Bewusst nicht gemacht — die Ortsseiten teilen sich `wetter-default.png`.
