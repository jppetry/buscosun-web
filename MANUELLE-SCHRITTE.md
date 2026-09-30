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

## 12 · Vorschaubilder am echten Deploy prüfen (SH6, „Auswahl teilen")

Lokal ist alles belegt: die Edge Function `og-meta` liefert im echten Deno je geteiltem Link
eigenen Titel und eigenes Bild, und die Antwort an einen Browser ist byte-gleich zur Shell
(`audit/teilen-share.md` §20.6). Was sich lokal **nicht** prüfen lässt, ist, wie WhatsApp
und Co. daraus eine Karte malen. Nach dem ersten Deploy also einmal:

- [ ] Einen Link aus der App teilen (Teilen-Knopf → Kopieren) und sich selbst per WhatsApp
      schicken. Erwartet: Titel mit Ort und Thema, Bild mit dunklem Kartenfeld und dem Pfad
      der Seite, nicht die Startseiten-Karte.
- [ ] <https://developers.facebook.com/tools/debug/> mit demselben Link. Dort steht, was der
      Crawler wirklich gesehen hat; „Scrape Again" leert Facebooks Zwischenspeicher, falls
      vorher schon einmal die alte Karte gezogen wurde.
- [ ] Gegenprobe im normalen Browser: derselbe Link muss die Seite zeigen wie immer
      (die Function greift nur bei Crawler-User-Agents).
- [ ] Falls ein Bild fehlt: `curl -A "WhatsApp/2.24" -D - "<link>" | grep og:` — die Antwort
      trägt den Beleg-Header `x-buscosun-og`. Fehlt der, hat die Function nicht gegriffen
      (Pfad nicht in `config.path`, oder Deploy älter als die Function).

Nichts davon ist blockierend; die Seite funktioniert unabhängig davon.

---

## 13 · Punktdaten im Daten-Repo freigeben (PD-A) — **blockierend**

Das Fundament der Punkt-Linie steht (`audit/punktdaten-versorgung.md` §22): Formate,
Quellenregister, Kalibrierung, Producer, Verifier, Cron-Vorlage. **Es ist nichts
veröffentlicht** — kein Byte in `jppetry/buscosun-data`. Vier Schritte, die nur Jan
machen kann, in dieser Reihenfolge:

- [ ] **Die Entscheidungen E-9 bis E-18 durchgehen** (`audit/punktdaten-versorgung.md`
      §20 und §22.7). Sie legen fest, was das Repo dauerhaft trägt — eine Änderung
      danach bricht jeden Leser.

- [ ] **`workflow-point.yml` manuell committen.** Die Vorlage liegt in
      `scripts/repack-repo/workflow-point.yml` und gehört nach
      `.github/workflows/point.yml` im Daten-Repo. Eine Action darf ohne
      `workflows`-Scope keine Workflow-Datei pushen — dieselbe Einschränkung wie bei
      `workflow-build.yml`.

- [ ] **Optional: die drei bestehenden Workflows im Daten-Repo auf `sparse-checkout`
      umstellen.** `build.yml`, `radar.yml` und `radar-watchdog.yml` checken heute mit
      `fetch-depth: 1` den vollen Baum aus und ziehen damit auch `point/` mit (≈ 50 MiB
      je Lauf, vier Läufe am Tag). Nicht blockierend — seit dem Rückbau des
      Geländeprodukts geht es um Zehner-MiB, nicht um 300. Sie können es bereits, sie
      klonen `buscosun-web` sparse; es fehlt nur beim eigenen Repo:

      ```yaml
      - uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 1
          sparse-checkout: |
            runs
            radar
            index.json
            hsurf-v1.png
          sparse-checkout-cone-mode: false
      ```

- [ ] **Den ersten Push freigeben.** Der Publisher schreibt ohne `POINT_PUSH=1` nur
      lokal. Zum Prüfen vorher:

      ```
      npm run point:cube -- --tiers=all
      npm run verify:point-data
      npm run point:publish -- --repo=../buscosun-data
      ```

      **`--tiers=all` ist wichtig, nicht bequem:** die Stufen einzeln zu bauen legt sie
      unter verschiedene Läufe, und dann beschreibt kein Manifest mehr sein eigenes
      Verzeichnis (§26). Der Publisher bricht in dem Fall ab, bevor er etwas committet.

      Danach den Baum ansehen (`git -C ../buscosun-data show --stat`), und erst dann
      mit `POINT_PUSH=1` erneut laufen lassen.

Nicht blockierend, aber sinnvoll direkt danach: einen Chunk über jsDelivr abrufen und
prüfen, dass das CDN ihn **unverändert** ausliefert (der Container hat einen CRC im
Kopf — ein `curl … | node -e "…readCubeHeader"` sagt es sofort).

## 14. Punktarchiv freigeben (PD-U, 2026-09-14) — blockierend für die Kalibrierung

Jeder Tag ohne Sammler ist ein Tag ohne Vorhersage-Archiv — Vorhersagen sind nicht
nachholbar (MOSMIX-L 48 h, ICON-D2 ≈ 24 h online). Plan und Belege:
`audit/punktdaten-umsetzungsplan.md` §2 (U-1/U-2), Anhang A.

- [ ] **Entscheidungen E-U-1 und PA-E-1…PA-E-7** (Plan §6) beantworten — vor allem, ob
      das Archiv trotz J-2/J-3 vom 2026-09-05 gewollt ist (PA0 vom 2026-09-08 sagt ja).

- [ ] **`workflow-punktarchiv.yml` ins Archiv-Repo kopieren.** Die Vorlage liegt in
      `scripts/punktarchiv-repo/workflow-punktarchiv.yml` und gehört nach
      `.github/workflows/punktarchiv.yml` in `jppetry/buscosun-archiv`. Der Slot ist
      `10 23 * * *` (nach dem letzten t1-Bau 22:40 + 20 min + 5 min CDN); der Verifier
      `npm run verify:punktarchiv` rechnet ihn nach. Standard-Token reicht (eigenes Repo).

- [x] **Den ersten Slot pushen.** ✅ 2026-09-15: Jan hat `b0c2829` (Slot 2026-09-14, 243 Punkte)
      nach `origin/main` gepusht. Lokal liegt in `C:\dev\buscosun-archiv` ein Slot vom
      2026-09-14 (s. Plan §4.3). Vorher prüfen:

      ```
      npm run verify:punktarchiv
      node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/punktarchiv/collect.mjs --limit=10 --dry
      ```

      Dann im Archiv-Repo `git add -A && git commit -m "archiv: erster Slot" && git push origin main`
      — **nie `--force`**, das Repo ist append-only. Danach den Workflow einmal per
      `workflow_dispatch` starten und den zweiten Slot am Remote sehen.

- [x] **`points.json` liegt in buscosun-web** (`scripts/punktarchiv/points.json`, 243 Punkte)
      und wird vom Cron mitgeklont. ✅ Im Commit `f13661c` enthalten, gepusht 2026-09-15.

Dazu aus derselben Phase — **erledigt am 2026-09-15 mit Jans Freigabe für das Daten-Repo**,
Commit `5ea830a` auf `buscosun-data/main` (Push im ersten Versuch, 18:53 UTC, Fenster vor dem
20:30-Push der Kartenlinie): `scripts/repack-repo/workflow-point.yml` (t2-Slot `30 4,10,16,22`)
liegt als `.github/workflows/point.yml`, das Stadt-Raster liegt unter `point/static/urban/v1/`
(208 Chunks + `static.json`, am Remote mit `decodeCubeChunk` zurückgelesen). Der Push von
`buscosun-web/main` (`f13661c`) bringt Retention-Korrektur, `declined` und hmodel-Diff ab dem
nächsten Cron-Lauf. **Noch offen im Archiv-Repo: die Workflow-Datei** (zweiter Punkt oben).

## 15. Fusion-Implementierung: AP1 + AP-PA2 + AP12a freigeben (FI, 2026-09-16) — **Frist 23:10 UTC**

Belege: `audit/fusion-implementierung.md` §9.2 (AP1), §9.3 (PA2), §9.4 (AP12a). Alles liegt
uncommitted in `buscosun-web`; nichts ist committet, nichts gepusht, kein Daten- oder Archiv-Repo
angefasst.

- [ ] **`buscosun-web/main` pushen — vor 23:10 UTC.** Der Archiv-Cron (`punktarchiv.yml`,
      `10 23 * * *`) klont `main`; nur dann trägt der heutige Slot die 410 Punkte (AT 84, CH 101,
      LI 1 statt 13/5) und die Stundensummen `rr1h`. Jeder Tag später fehlt AT/CH im Backtest
      (Vorhersagen sind nicht nachholbar). **AP1, PA2 und AP12a gehören in DENSELBEN Push:** der
      Sammler braucht `fallbackStore` aus AP1 (`src/point/client/store.ts`, am Remote noch nicht da).
      Vorher prüfen, dann committen und pushen:

      ```
      npm run typecheck
      npm run verify:punktarchiv        # 87/87
      npm run verify:point-data         # 969/969
      npm run verify:point-client       # 112/112
      git add audit CLAUDE.md MANUELLE-SCHRITTE.md scripts src/point tsconfig.app.tsbuildinfo
      git status                        # prompt.md bleibt draußen
      git commit -m "feat(point): parallel reader (AP1), AT/CH archive points (PA2), CDN warm-up after publish (AP12a)"
      git push origin main
      ```

      Wirkung **ohne** weitere Kopie: der nächste Punkt-Job (t1 22:40 UTC, wenn vor 22:40 gepusht)
      fährt schon den neuen Publisher — Purge jeder geänderten Datei, Frischeprüfung, Warm-up, im
      Standard-Budget 180 s. Rückweg ohne Code: im Daten-Repo `POINT_CDN_SYNC: '0'` in die drei
      Publish-Schritte. Erster Slot mit AT/CH: heute ≈ 23:10–23:30 UTC; 0–24 h für AT/CH bewertbar
      ab dem Slot vom 17.09., 336 h ab dem 30.09.

- [ ] **Danach ansehen (2 min):** im Actions-Log des Archiv-Laufs die Zeilen
      `[collect] truth: POI 243/243 · TAWES 84/84 … · SMN 102/102 …` und `Slot-Größe ≈ 17–18 MiB`,
      `0 Fehler` (vorher 38 × jsDelivr-403 im lokalen Probelauf, jetzt mit Ausweichweg). Laufzeit
      erwartet ≈ 16–17 min (gestern 13 min für 243 Punkte).

- [ ] **`workflow-point.yml` ins Daten-Repo kopieren (AP12a, nicht eilig).** Die Änderung sind nur
      drei Zeilen `POINT_CDN_BUDGET_S` (t1 240 · t2 180 · t3 180 s) plus Kommentar — ohne Kopie gilt
      180 s in allen Jobs, das hält überall (Regel F). Mit der Kopie bekommt t1 vier Minuten.
      Nicht in ein Fenster der Kartenlinie legen (`:20` der Stunden 0/3/6/…, `:30` der Stunden
      2/5/8/…) und nicht während eines Punkt-Jobs:

      ```
      cd C:\dev\buscosun-data
      git pull --rebase origin main
      Copy-Item -Force ..\buscosun-web\scripts\repack-repo\workflow-point.yml .github\workflows\point.yml
      git diff --stat                   # genau 11 Zeilen dazu, nichts weg (Remote = committete Vorlage, 16.09. geprüft)
      git add .github/workflows/point.yml
      git commit -m "ci(point): CDN warm-up budget per job (AP12a)"
      git push origin main
      ```

- [ ] **Abnahme AP12a messen, sobald ein Cron-Job mit dem neuen Publisher gelaufen ist** (im Log
      des Publish-Schritts: `CDN-Warm-up: …/… ok … · 403 … · Frist …`). Dann in `buscosun-web`,
      ohne vorher einen Chunk dieses Laufs selbst abzurufen:

      ```
      npm run verify:pv-latency -- --only=bundle --profiles=desktop-none
      ```

      und die kalt-neu-Zahlen (HIT/MISS, Kern p50) gegen `audit/fusion-implementierung/latency/2026-09-16T14-33-41-921Z.json`
      (Kern p50 1 458 ms, 37 MISS) in §9.4 eintragen.

## 16. Archiv-Befunde des Experten beheben (AP-PA3, 2026-09-17) — **Frist 23:10 UTC**

Beleg: `audit/fusion-implementierung.md` §9.12 (17 Befunde, je mit Messung; 11 im Archiv/Client behoben, 6 als
V-FI-23…30 gestellt). Alles liegt uncommitted in `buscosun-web`; das Archiv-Repo braucht KEINE Änderung (der
Cron klont `main`), das Daten-Repo auch nicht.

- [ ] **Commit 1 — PA3 + E-F-11 + E-F-12, `main` pushen vor 23:10 UTC.** Der heutige Slot trägt dann Schema 2:
      Stationshöhe im Plan (die 10 Gipfelstationen nehmen ihre eigene Station wieder an), RV-Abdeckung als
      Standortregel (Cottbus, Görlitz, Lindenberg, Prag bekommen den Nowcast; Kärnten/Engadin verlieren die
      erfundene Trockenheit), die 23-UTC-Stunde der Wahrheit, `fxh`, `ageAtSlotH`, `stats.warnings`, die neue
      Punktliste (405 Punkte — 5 leere POI-Stationen weniger, DK/NL/BE/LU im DE-Profil), dazu E-F-12 im Cube-Pfad
      (Stationshöhe bei ≤ 250 m, default-off). Vorher prüfen, dann committen und pushen:

      ```
      npm run typecheck
      npm run verify:punktarchiv        # 103/103
      npm run verify:point-data         # 974/974
      npm run verify:point-client       # 118/118
      npm run verify:pv-cube            # 204/204
      git add audit CLAUDE.md MANUELLE-SCHRITTE.md scripts src/point src/pointForecast/cubeSource.ts
      git reset -q scripts/verify-pv-fusion.mjs          # gehört zu Commit 2
      git status                        # staged: 17 Dateien; NICHT staged: sampleSources.ts, meteoSwissSmn.ts, leadTimeWeights.ts, verify-pv-fusion.mjs (Commit 2), prompt.md (deine Datei)
      git commit -m "fix(punktarchiv): expert findings PA3 — station height, RV site rule, 23-UTC truth, schema 2; E-F-11 DE profile, E-F-12 station height ≤ 250 m"
      git push origin main
      ```

      Ohne Push läuft der Slot um 23:10 mit dem alten Sammler weiter (Schema 1, alle Befunde bleiben).
      Rückweg: nichts — Schema-1-Slots bleiben lesbar, das Archiv ist append-only.

- [ ] **Commit 2 — V-FI-25 + V-FI-26 (Live-Pfad), direkt danach.** Vier Dateien, keine davon in Commit 1:
      MOSMIX-Taupunkt in die Fusion (`sampleSources.ts`), SMN-Böenspalte `fkl010z1` (`meteoSwissSmn.ts`),
      Kommentar (`leadTimeWeights.ts`), Prüfung (`verify-pv-fusion.mjs`). Ändert Taupunkt/Feuchte der
      Live-Vorhersage aller DE-Punkte jenseits der Ankerstunden (gemessen: 0/240 statt ~230/240 Stunden
      Klimatologie) und lässt den CH-Böenanker tragen. Der Slot trägt den Sammler-Commit (`codeHash`), der
      Bewerter trennt B5 vor/nach:

      ```
      npm run verify:pv-fusion          # 227/227
      git add src/pointForecast/sampleSources.ts src/sources/meteoSwissSmn.ts src/pointForecast/leadTimeWeights.ts scripts/verify-pv-fusion.mjs
      git status                        # staged: genau diese 4
      git commit -m "fix(pointForecast): MOSMIX dew point reaches buscosun Fusion (V-FI-25), SMN gust column fkl010z1 (V-FI-26)"
      git push origin main
      ```

      Netlify baut aus `main`; nach dem Deploy an einem DE-Ort im Punkt-Panel prüfen, dass Taupunkt/Feuchte
      jenseits +6 h nicht mehr auf der Klimatologie liegen (`fusion.dewPoint.climatologyOnly` false).

- [ ] **Danach ansehen (2 min):** im Actions-Log `[collect] … 0 Fehler · N Warnungen` und die Warnzeilen —
      erwartet `cubeSourcesAbsent` (t1 icon_ch2_eps, t2 claef: V-FI-27), `cubeQuantilesMissing` t1 ≈ 98/405
      (C-LAEF endet bei 51,5 °N), `nowcastUncovered` ≈ 30 (Kärnten, Osttirol, Engadin, Tessin, Odense, Sylt —
      gemessen ohne Radar), `nowcastOutsideRaster` inca ≈ 11, `liveElevation` ≈ 31 (V-FI-24). Slot-Größe
      weiterhin ≈ 18 MiB.

- [x] **Entschieden (17.09., 16:35 UTC) und umgesetzt (§9.12.5):** V-FI-25 und V-FI-26 freigegeben (Commit 2),
      E-F-11 ja (DE-Profil für DK/NL/BE/LU), E-F-12 ja mit 250 m statt 1 km. Offen bleibt nur der Push.

## 17. Cube-Pfad: Mobil-Härtung (AP12) und Punkt-Panel hinter `?pf=cube` (AP11), 2026-09-18

Beleg: `audit/fusion-implementierung.md` §9.14 (Diagnose, Umsetzung, Vorher/Nachher am selben Tag:
`latency/2026-09-18-before.json` gegen `latency/2026-09-18-after.json`). Alles liegt uncommitted in `buscosun-web`
(nur `src/point/client/*`, `src/pointForecast/{cubeSource,pointForecast}.ts`, `fusion/output.ts`, Harnisch, Verifier);
Daten- und Archiv-Repo unberührt. Der Live-Pfad ist unverändert (`verify:pv-fusion` 227/227), der Cube-Pfad bleibt
default-off (`pointSource: 'cube'`), das App-Bundle unverändert (eagerJs 107,9).

- [x] **Entscheidung 1 — welches Maß zählt das §6-Gate auf 4G?** — *entschieden 18.09.: die erste Darstellung (Gate AP12 grün).* Gemessen (Mobil-4G, 10 Orte, p50 / p95):
      **erste Darstellung** (t1 + Station, 0–47 h — E-F-3 „t1 zuerst") **1 812 / 2 176 ms — grün**;
      **ganzes 336-h-Fenster** 2 478 / 2 902 ms — **rot** (vorher 2 518); warm 193 ms (vorher 1 310) — grün.
      Das Panel fragt heute 24 h an (1 805 / 2 122 ms). Desktop-4G: erste 1 686, ganz 2 296 (vorher 2 258 — t1 zuerst
      kostet das ganze Fenster eine RTT, V-FI-47). **Empfehlung:** die erste Darstellung zählen (sie ist byte-gleich
      der Anfang der ganzen Antwort, der Rest folgt ≈ 0,7 s später über `onUpdate`) und das ganze Fenster weiter
      berichten. Bis zur Entscheidung beginnt Stufe 2 (AP11-Panel) nicht.
- [ ] **Entscheidung 2 — V-FI-42 (Publisher, S&F):** *(18.09.: später entscheiden)* `scripts/point/cdnSync.mjs` wärmt je Chunk zusätzlich die
      identity-Variante (ein Abruf `Range: bytes=0-731`; gemessen: danach ist jeder Bereich am Edge HIT). Erst dann
      lohnt es, `CubeIo.planeRanges` einzuschalten (gemessen erste Darstellung Desktop-4G −263 ms, 3G −700 ms, Mobil
      −48 ms; ganzes Fenster −77 … −283 ms). Ohne das wärmt nur der erste Nutzer je Edge (MISS 0,3–1,8 s).
- [ ] **AP11 ansehen (Beleg §9.15):** ohne Schalter ist das Panel pixelgleich (Desktop + Mobil, alle drei Tabs); mit
      `…/wetterkarte/temperatur/muenchen?startnow=0&pf=cube&pflog=1` erscheint der Tab „Bandbreite" (Bildschirmfotos
      `audit/fusion-implementierung/ap11/`). `?startnow=0` ist nötig, weil das Panel in der Produktion ausgeblendet ist
      (V-FI-53, Bestand). Die Voreinstellung bleibt live, bis AP9 das Gate liefert.
- [ ] **Budget-Anhebung bestätigen:** `totalJs` 1 372 → **1 430 KB** (IST 1 424,1): der Cube-Pfad hat mit AP11 zum ersten
      Mal einen Verbraucher im App-Bau — `cubeSource` 47,2 KB, `PointForecastBands` 4,9 + 1,6 KB CSS, `decodeWorker`
      3,9 KB, alles lazy (lädt nur mit `?pf=cube`); eagerJs 107,9 unverändert.
- [ ] **Commit A + Push von `main`** (Scope `pointForecast`/`point-client`: AP12, AP11, V-FI-21 Kodierer, V-FI-17 z0,
      V-FI-24 Option), wenn die Entscheidungen stehen. Vorher (Verifier einzeln, nicht parallel zu anderen Sessions):

      ```
      npm run typecheck
      npm run verify:point-client       # 136/136
      npm run verify:pv-cube            # 246/246  (Kosten-Prüfungen (4)/(9)/(11) nur allein laufen lassen)
      npm run verify:pv-fusion          # 227/227 ohne Commit B (229/229 mit)
      npm run verify:punktarchiv        # 103/103 (unberührt, der Sammler ruft cubeSource/pointForecast)
      npm run build && npm run budget   # 241/241, eagerJs 107,9, totalJs 1 427,6 / 1 430
      ```

      Dateien für A: `src/point/client/{store,cache,readPoint,decodePool,decodeWorker}.ts`,
      `src/point/client/{chunkRanges,z0Point}.ts` (neu), `src/pointForecast/{cubeSource,pointForecast}.ts`,
      `src/pointForecast/fusion/output.ts`, `src/pointForecast/fusion/v2codec.ts` (neu), `src/pointForecast/PointForecastPanel.tsx`,
      `src/pointForecast/{PointForecastBands.tsx,pointForecastBands.css,pfFlags.ts}` (neu), `budget.json`,
      `scripts/{verify-point-client,verify-pv-cube,verify-pv-latency}.mjs`, `scripts/pv-latency/lab.ts`,
      `scripts/lib/cdpBrowser.mjs`, `audit/fusion-implementierung.md` (§9.14–§9.16), `audit/fusion-implementierung/{ap11,v2codec}/`,
      `audit/fusion-implementierung/latency/2026-09-18*.json`, `CLAUDE.md` (nur die eigenen Zeilen), dieses §17.
      ⚠ Im Baum liegen gleichzeitig Änderungen zweier anderer Sessions (AP9: `scripts/punktarchiv/**`, `prompt.md`; HZ1:
      `src/wind/*`, `src/MapView.tsx`, `scripts/verify-wind-advection.mjs`) — nur die eigenen Dateien stagen.
- [ ] **Commit B (V-FI-11, ändert das Live-Produkt — Jans Freigabe):** `src/sources/brightSkyCurrent.ts` +
      `scripts/verify-pv-fusion.mjs` (die zwei neuen Prüfungen V-FI-24 und V-FI-11). BrightSky füllt fehlende Messgrößen einer
      Station aus Nachbarstationen; der Leser schrieb sie der angefragten Station zu (Zugspitze +0 h 17,2 °C mit der
      Garmischer Temperatur; um München 14 von 20 Antworten mit geborgten Größen). Nach dem Fix gehört jeder Wert seiner
      Station: Zugspitze +0 h 2,8 °C; München: Lapse 6,73 → 6,50 K/km, T +0 h −0,3 K, Wind +0,5 m/s (Tagesmessung). Wirkt auf
      den Live-Punktpfad UND die Rasterfusion der Karte (V-FI-61: Alpen-Temperatur im Fusionsmodus einmal ansehen).
      Nebenwirkung benannt: unter den 6 nächsten Stationen stehen jetzt Teil-Punkte (V-FI-60) — um München 3 statt 6
      Temperaturen. Freigeben (Push nach A) oder zurückhalten (dann nur A pushen; `verify:pv-fusion` bleibt 227/227).
- [ ] **Real-Device (vor jeder Default-Umstellung, AP11):** auf einem echten Android-Gerät
      `…/wetterkarte/temperatur/muenchen?startnow=0&pf=cube&pflog=1` öffnen, mit DevTools-Trace (Remote Debugging) —
      die Rechnung läuft heute ≈ 300 ms am Stück im Hauptthread (V-FI-50), headless-shell meldet keine Long Tasks.
      Gleich mitsehen: Wischen des Sheets, Tab „Bandbreite", eine Stunde aufklappen, `pflog`-Zeiten notieren.

**Befunde V-FI-21/17/24/11 (Stufen 3–6, Beleg §9.16):**

- [ ] **Entscheidung 3 — V-FI-55 (mit AP9, E-U-13 Archivgröße):** der Cube-Pfad kompakt im Archiv (`fusion/v2codec.ts`,
      Rundweg exakt bis auf Verteilungs-/Ankerzahlen ≤ ½ Schritt) kostet je Slot bei 405 Punkten **+13,5 MiB stündlich
      (+75 % auf ≈ 18 MiB)** oder **+6,6 MiB nur native Schritte (+37 %)** — ≈ +4,8 bzw. +2,4 GB/Jahr. v2 als JSON wären 46 MiB.
      Frage an Jan: welche Form legt der Sammler ab?
- [ ] **Entscheidung 4 — V-FI-17 (z0-Näherung, set):** die zweistufige Windkorrektur des Cube-Pfads rechnet jetzt mit
      z0 am Punkt (WorldCover, 500-m-Kreis) und — mangels GRIB-z0 im Cube — mit einer z0-Näherung der Modellzelle aus
      derselben Karte (log-Mittel über die Zellweite der Stufe). Aktiv nur hinter `?pf=cube` (`defaultCubeIo`); der
      AP9-Sammler rechnet ohne. Gutheißen, oder erst mit GRIB-z0 im Cube (V-FI-58, Producer/Schema = S&F)?
- [ ] **V-FI-24 an die AP9-Session übergeben (nicht von dieser Session geändert):** `scripts/punktarchiv/collect.mjs`
      Zeile 461, im Aufruf `getPointForecast({ … })` **`elevationM: p.elev,`** ergänzen — dann rechnet der Live-Pfad
      an den 31 Punkten mit DEM − Station > 50 m in Stationshöhe. Das ändert die B5-Grundlinie an diesen Punkten ⇒ im
      Slot benennen (Hinweistext Zeile 451, `codeHash`).

## 18. buscosun Fusion — Vollform ohne Archiv (AP13–AP17), 2026-09-18

Beleg: `audit/fusion-vollform.md` (Plan §0–§8, Entscheidungen §6.1, Etappenprotokoll §9). Der Plan ist freigegeben;
E-F-13…22 sind entschieden (alle ja außer E-F-22). AP9 läuft parallel nach dem neuen `prompt.md`. Alles
uncommitted, Daten- und Archiv-Repo unberührt, jede neue Option voreingestellt aus.

- [ ] **AP9 starten** (parallele Session) mit dem neu geschriebenen `prompt.md`:
      - 15 Korrekturen aus V-FI-77;
      - gekürzter 2×2-Block;
      - POI-Wetterspalten;
      - Provenienz-Hashes;
      - Schema 3;
      - Nachlauf-Prüfung.
- [ ] **E-F-19 (b) — Slot-Wachstum abzeichnen, bevor AP9 Schema 3 einfriert:**
      - AP9 misst am echten Slot mit dem gekürzten Block (Nachbarn nur 31 PAP-3-Ebenen);
      - dazu kommt V-FI-55;
      - daraus GB/Jahr und Monate bis zur GitHub-Warnung bei 5 GB.
      Die 44 %/29 % im Plan sind Chunk-Schätzungen, keine Slot-Messung.
- [ ] **E-F-15 — den AP17-Diff freigeben (z0 der Modelle, `point/static/z0mod/v1`)** — Beleg
      `audit/fusion-vollform.md` §9.5:
      - **RV12 gemessen: kein Orographie-Anteil** (z0 fällt über 2 500 m auf p50 0,06 m; ICON-CH1 über 1 500 m
        unabhängig von SSO_STDH). Aber das GRIB-z0 liegt 1,5- bis 5-mal über der WorldCover-Näherung (V-FI-100): mit
        `z0Model` stiege der korrigierte Wind im Median um 3–5 %, höchstens 10 %. Deshalb bleibt der Browser aus.
      - **Der Diff** (ansehen: `git diff -- scripts/point/ scripts/repack-repo/workflow-point.yml src/point/cubeFormat.ts`
        und die neue Datei `scripts/point/staticZ0mod.mjs`):
        - `scripts/point/staticZ0mod.mjs` (neu): ln-Blockmittel je Zelle, Neubau-Regel (erster Bau, neue Spalte, neuer
          Monat oder > 1 % der Landzellen mit Faktor > 1,65; nie bei fehlender Spalte), Schreiber, Selbsttest;
        - Adapter `dwdRegular` (ICON-D2 `z0`, ICON-EU `Z0`), `dwdIcosahedral` (ICON global `Z0`), `meteoswiss`
          (ICON-CH1/-CH2 `Z0`, ctrl, Vorlauf 0) — je eine Methode `roughness`;
        - `build-point-cube.mjs`: `runRoughness` nur mit `POINT_Z0MOD=1`, `z0mod` in `run.json` nur dann;
        - `scripts/repack-repo/workflow-point.yml`: `POINT_Z0MOD: '1'` in den Bauschritten t1/t2/t3;
        - `verify-point-data.mjs`: (3az) 11 Prüfungen, (3w) mit benannter Ausnahme + Gegenprobe (990/990).
        - **Publisher unverändert** (das Register findet das Produkt, `cdnSync` wärmt neue Dateien).
      - **Kosten:** je Job t1 +4,3 MB, t2 +3,2 MB, t3 +1,7 MB Download (≈ 50 MB/Tag), Wandzeit neben den Feldbahnen;
        Daten-Repo einmal 265 KiB, danach nur bei Neubau.
      - **Negativkontrolle gemessen:** echter eingeschränkter t3-Bau ohne/mit Schalter — Cube- und hmodel-Chunks
        byte-gleich, `run.json` nur um `z0mod` (und flüchtige Zeiten) verschieden.
      - **Freigeben heißt, in dieser Reihenfolge:**
        1. `buscosun-web` mit AP17 committen und pushen — das schaltet noch nichts ein (der Schalter fehlt in der
           Workflow-Kopie des Daten-Repos).
        2. Die Vorlage `scripts/repack-repo/workflow-point.yml` ins Daten-Repo kopieren — ab dem nächsten Job je Stufe
           baut der Producer `z0mod` (erster Bau schreibt, danach nur bei Neubau).
        3. Nach dem ersten Job je Stufe prüfen: `run.json` → `tiers[].z0mod.reason` = „erstmals gebaut", `absent` nennt
           IFS/AIFS/AICON/C-LAEF; `point/index.json` → `static.products` nennt `z0mod/v1`.
      - **Rückweg:** die Zeile `POINT_Z0MOD: '1'` aus der Kopie nehmen — das Produkt bleibt liegen und wird nicht
        gelesen (Browser aus).
      - **Nicht Teil dieser Freigabe:** `CubeIo.z0mod` + `fuse.z0Model` im Browser — erst nach dem Stationsvergleich
        beider Varianten (V-FI-100, AP9-Nachlauf/AP10).
      - **Zur Kenntnis:** V-FI-102 (`run.json` nennt je Quelle nur die Zahl der Stunden, nicht welche — Skizze
        `sources[].leads`, ein weiterer Producer-Diff, wenn du willst).
- [ ] **E-F-20 — Publisher-Weg der Fit-Werte (S&F, wenn er ansteht):** `calib.fit.json` aus dem Archiv-Repo in
      `point/calib.json` (Schema 2). AP13 baut nur Schema 2 und den Client-Leser (voreingestellt aus); das veröffentlichte
      `calib.json` bleibt bis dahin Schema 1.
- [ ] **E-F-21 — totalJs-Ratsche je AP:** jede Etappe legt ihren gemessenen Zuwachs vor (lazy, eagerJs 107,9
      unverändert); du bestätigst die neue Zahl.
      - **AP13:** 1 430 → **1 432** (IST 1 431,5; +3,9 KB gzip, alles im Lazy-Chunk `cubeSource`). Textsonde: der
        Fit-Kern ist in keinem Chunk. Beleg `audit/fusion-vollform.md` §9.1.3, Notiz in `budget.json`.
      - **AP14:** 1 432 → **1 433** (IST 1 432,8; +1,3 KB gzip, alles im Lazy-Chunk `cubeSource`). Beleg §9.2.3.
      - **AP16:** 1 433 → **1 437** (IST 1 436,2; +3,3 KB gzip, alles im Lazy-Chunk `cubeSource`). Textsonde: der
        Fit-Kern in keinem Chunk, nichts im Start-Chunk. Beleg §9.4.5, Notiz in `budget.json`.
      - **AP17:** 1 437 → **1 438** (IST 1 437,4; +1,2 KB gzip, alles im Lazy-Chunk `cubeSource`). Textsonde: der
        Producer in keinem Chunk, nichts im Start-Chunk. Beleg §9.5.6, Notiz in `budget.json`.
- [ ] **AP13 ansehen und committen** (Beleg §9.1; nichts eingeschaltet, Produkt byte-gleich bis auf `calibByVar`).
      Vorher, einzeln:

      ```
      npm run typecheck
      npm run verify:pv-cube          # 256/256 (Kosten-Prüfungen nur allein)
      npm run verify:point-client     # 139/139
      npm run verify:point-data       # 978/978
      npm run verify:calib-fit        # 14/14 (≈ 60 s)
      npm run verify:pv-fusion        # 229/229 (unberührt)
      npm run verify:punktarchiv      # 103/103 (unberührt)
      npm run build && npm run budget # 241/241, totalJs 1 431,5 / 1 432
      ```

      - Dateien (Scope `pointForecast`/`point-calib`):
        - `src/point/{calibDoc,calibFit}.ts` (neu), `src/point/client/calibPoint.ts` (neu), `src/point/calibration.ts`;
        - `src/pointForecast/cubeSource.ts`, `src/pointForecast/fusion/{output,uncertainty,terrainTerms}.ts`;
        - `scripts/verify-calib-fit.mjs` (neu), `scripts/{verify-pv-cube,verify-point-client}.mjs`;
        - `package.json` (Alias), `budget.json`;
        - `audit/fusion-vollform.md`, `audit/fusion-implementierung/latency/2026-09-18T16-25-44-456Z.json` und
          `…T17-02-35-260Z.json`.
        - Dazu Doku: `prompt.md` (AP9-Kickoff neu), `CLAUDE.md`, dieses §18.
      - `tsconfig.app.tsbuildinfo` hat `tsc -b` verändert (Build-Artefakt), `prompt-vollform-plan.md` ist der alte
        Planungs-Kickoff — beide nicht mitnehmen, wenn du sie sonst auch nicht committest.
      - ⚠ Läuft AP9 parallel: nur diese Dateien stagen.
- [ ] **`crossChunk` im Browser einschalten** (AP14) erst nach dem Randbefund aus dem Archiv (gepaart beschnitten gegen
      vollständig, AP9-Nachlauf).
      - Gebaut und geprüft (§9.2), voreingestellt aus.
      - Preis gemessen: erste Darstellung unverändert; voller Block als eigene Ausgabe, Mobil-4G kalt ≈ 2,8–3,4 s ab
        Start; +406–781 KB nur an ≈ 25 % der Orte.
      - Einschalten = eine Zeile in `defaultCubeIo` (`crossChunk: true`).
- [ ] **AP14 ansehen und committen** (mit oder nach AP13; Befehle wie dort, Zielzahlen `verify:pv-cube` 260/260,
      `verify:point-client` 143/143, totalJs 1 432,8 / 1 433).
      - Dateien:
        - `src/point/cubeFormat.ts`, `src/point/client/{cubePoint,readPoint}.ts`;
        - `src/pointForecast/cubeSource.ts`, `src/pointForecast/fusion/grid.ts`;
        - `scripts/lib/pvCubeFixtures.mjs` (geteilt mit AP9, nur additiv);
        - `scripts/{verify-point-client,verify-pv-cube,verify-pv-latency}.mjs`, `scripts/pv-latency/lab.ts`;
        - `budget.json`;
        - `audit/fusion-vollform/chunk-border.mjs`, `audit/fusion-implementierung/latency/2026-09-18T17-32-20-129Z.json`.
      - Dazu Doku: `audit/fusion-vollform.md` §0/§9.2, `CLAUDE.md`, dieses §18.
- [ ] **AP15 — das Abnahme-Gate vor dem Archiv ist ROT** (Beleg `audit/fusion-vollform.md` §9.3.2):
      - Bei |Δh| > 300 m: Druckflächen-Profil MAE **1,94 K** gegen Standard-Lapse **1,39 K** (Referenz t1-Profil,
        3 501 Fälle an 95 Punkten).
      - Nachts 2,79 gegen 1,64; tags besser, 0,87 gegen 1,23.
      - Ursache ist der 2-m-Punkt in der Säule, nicht die Inversionserkennung.
      - Keine Regel-Variante schlägt die Standard-Lapse über das Rauschen hinaus.
      - **Die Option ist nicht verdrahtet** (0 Byte, keine `v2codec`-Änderung). Gebaut sind nur die reinen Bausteine
        (`profileColumn.ts`, `extendBelowBase`) für den AP9-Nachlauf.
      - **Zu bestätigen:** (a) nicht verdrahten, bis AP9 gegen Stationen misst; (b) AP9 nimmt den Vergleich in den
        Nachlauf: (i) gegen (ii) gegen V-e je Nacht/Tag und über/unter der Zelle, t2/t3 ab dem Slot mit Schema 3.
        Kippt die Wahrheit das Urteil, folgt die Verdrahtung als S-Paket; sonst ist Lücke 2 ohne zusätzliche
        Druckflächen (1000/950 hPa, V-FI-78) nicht wirksam zu schließen.
- [ ] **AP15 ansehen und committen** (mit oder nach AP14; nichts im Produkt geändert, `vertical.ts` ohne Option
      bitgleich zu HEAD). Zielzahlen: `verify:pv-cube` 269/269, sonst wie AP14; totalJs 1 432,9 / 1 433 (keine neue
      Ratsche).
      - Dateien:
        - `src/point/profileColumn.ts` (neu), `src/pointForecast/fusion/vertical.ts`;
        - `scripts/verify-pv-cube.mjs`;
        - `audit/fusion-vollform/{pressure-profile-shadow,pressure-levels}.mjs`;
        - `audit/fusion-implementierung/latency/2026-09-18T17-43-28-696Z.json` (vorher) und `…T18-01-48-474Z.json`
          (nachher).
      - Dazu Doku: `audit/fusion-vollform.md` §9.3, `CLAUDE.md`, dieses §18.
- [ ] **AP16 — Landbedeckung: gebaut, nichts eingeschaltet** (Beleg `audit/fusion-vollform.md` §9.4):
      - `CubeIo.landCover` (d_water in v2, Eingang für κ und die Modellzell-Box), `FuseCubeOptions.kappa`,
        `FuseCubeOptions.z0CellBox` — alle voreingestellt aus, ohne Option byte-gleich zum Stand vor AP16.
      - Einschalten ist **keine** Entscheidung für jetzt: κ (λ) und die Modellzell-Box sind Kalibrierung (AP10), d_water
        ist nur Ausgabe (E-F-17). Der AP9-Nachlauf kann die Landbedeckung zur Nachlaufzeit aus dem SHA-gepinnten Spiegel
        rechnen (`loadLandCoverAtPoint` läuft in Node); der Sammler muss dafür nichts speichern.
      - **Zur Kenntnis (AP10):**
        - V-FI-94: d_water trifft mit A_min 10 px meist Teiche/Fluss-Stücke (Körper p50 ≈ 0,045 km²); ob ein
          zweiter Abstand zu Gewässern ≥ 1 km² gebraucht wird, entscheidet der Term.
        - V-FI-98: tpiSigma gemessen — DE 22,6 · AT 117,1 · CH 135,0 · gepoolt 104,6 m. Der Leser nimmt nur den
          gepoolten Wert; damit erreicht in DE kaum ein Punkt das Muldengate. Nicht im Produkt
          (`audit/fusion-vollform/tpi-sigma.fit.json`), wirksam erst mit gemessenem A.
- [ ] **AP16 ansehen und committen** (mit oder nach AP15). Zielzahlen einzeln: `verify:pv-cube` 280/280,
      `verify:point-client` 161/161, `verify:calib-fit` 14/14, `verify:point-data` 978/978, `verify:pv-fusion` 229/229;
      Build, totalJs 1 436,2 / 1 437 (neue Ratsche, s. E-F-21).
      - Dateien:
        - `src/point/client/landCover.ts` (neu), `src/point/client/z0Point.ts`, `src/point/calibFit.ts`;
        - `src/pointForecast/cubeSource.ts`, `src/pointForecast/fusion/{grid,output}.ts`;
        - `scripts/{verify-point-client,verify-pv-cube,verify-calib-fit,verify-pv-latency}.mjs`, `scripts/pv-latency/lab.ts`;
        - `budget.json`;
        - `audit/fusion-vollform/{landcover-places,tpi-sigma}.mjs`, `audit/fusion-vollform/tpi-sigma.fit.json`;
        - Latenz: `audit/fusion-implementierung/latency/2026-09-18T18-33-57-166Z.json` (vorher),
          `…T19-10-20-564Z.json` (nachher) und `…T19-13-40-958Z.json` (Landbedeckung an/aus).
      - Dazu Doku: `audit/fusion-vollform.md` §9.4, `CLAUDE.md`, dieses §18.
- [ ] **AP17 ansehen und committen** (mit oder nach AP16; der Commit selbst schaltet nichts ein — s. E-F-15 oben).
      Zielzahlen einzeln: `verify:pv-cube` 290/290, `verify:point-client` 165/165, `verify:point-data` 990/990,
      `verify:calib-fit` 14/14, `verify:pv-fusion` 229/229, `verify:punktarchiv` 103/103; Build, totalJs 1 437,4 / 1 438.
      - Dateien, Producer-Teil (= der Diff zur Freigabe):
        - `scripts/point/staticZ0mod.mjs` (neu), `scripts/point/build-point-cube.mjs`;
        - `scripts/point/adapters/{dwdRegular,dwdIcosahedral,meteoswiss}.mjs`;
        - `scripts/repack-repo/workflow-point.yml` (danach die Kopie ins Daten-Repo);
        - `scripts/verify-point-data.mjs`.
      - Dateien, Client-Teil (voreingestellt aus):
        - `src/point/cubeFormat.ts`, `src/point/client/readPoint.ts`;
        - `src/pointForecast/cubeSource.ts`, `src/pointForecast/fusion/output.ts`;
        - `scripts/{verify-pv-cube,verify-point-client}.mjs`, `budget.json`.
      - Diagnose und Messung: `audit/fusion-vollform/{z0mod-diag,z0mod-local,z0mod-places}.mjs`; Latenz
        `audit/fusion-implementierung/latency/2026-09-18T20-11-48-289Z.json` (nachher; vorher = `…T19-10-20-564Z.json`).
      - Dazu Doku: `audit/fusion-vollform.md` §9.5, `CLAUDE.md`, dieses §18.
      - Nicht mitnehmen: `prompt-hindcast.md` (nicht aus dieser Linie), `tsconfig.app.tsbuildinfo`, `prompt-vollform-plan.md`.

## 19. AP10a — Hindcast-Archiv für die Kalibrierung (Fremdkalibrierung), 2026-09-19

Protokoll: `audit/kalibrierung-fremdarchive.md` §8. Daten lokal in `C:\dev\buscosun-hindcast\` (kein Git-Repo, nichts
geht in `buscosun-data` oder `buscosun-archiv`), Code in `scripts/hindcast/` (uncommitted). Hintergrundläufe laufen
losgelöst weiter (Wachhund `scripts/hindcast/watchdog.ps1`, hält den Rechner wach).

- [ ] **Rechner an lassen**, bis `C:\dev\buscosun-hindcast\log\watchdog.log` „all chains done" meldet (Schätzung
      §8.0: 1,5–2 Tage). Deckel zu / Ruhezustand hält alles an; danach genügt ein Neustart des Wachhunds (§8.8).
      **Frist:** die Ketten `dr-A/B/C` holen das auslaufende data_run-Fenster (die Front rückt täglich einen Tag vor;
      am 19.09. stand sie bei 2026-06-17, die Kette `dr-A` beginnt am 21.06.).
- [ ] **Entscheidungen** (§8.6): E-F-26 (Open-Meteo-API für die Bins 7–48 h im Winter — Empfehlung: nicht jetzt),
      E-F-27 (Python nur als Leser — bestätigen), E-F-28 (Feld `source` in der Fit-Registry — an die Vollform-Linie),
      E-F-29 (keine Tag-0-Slots im data_run-Fenster), E-F-30 (t3-σ_ens an jeder Stunde).
- [ ] **Ansehen und committen** (eigener Commit, keine gemeinsamen Dateien mit AP9/Vollform außer der Doku):
      - `scripts/hindcast/**` (neu),
      - `audit/kalibrierung-fremdarchive.md` §8, `CLAUDE.md` (Zeile „AP10a Hindcast"), dieses §19.
      - Nicht mitnehmen: nichts aus `C:\dev\buscosun-hindcast\` (die Daten bleiben lokal).
- [ ] **Nach dem Ende aller Ketten** läuft die volle Abnahme selbst (Kette `accept`) und stempelt `index.json`
      (`verification`); `verify\<Datum>.json` ansehen. Erst mit diesem Stempel ist das Archiv für den Fit freigegeben —
      die nächste Sitzung (Fälle + Fit) prüft ihn als Erstes.

## 20. AP-PA4 — zweiter Expertenbericht am Archiv (Slot 21.09.), 2026-09-22 — **Frist 23:10 UTC**

Protokoll: `audit/fusion-implementierung.md` §9.17. Geändert nur `scripts/punktarchiv/**`, `scripts/verify-punktarchiv.mjs`,
`prompt.md`, Doku — kein `src/`, kein Producer, kein Motor. `verify:punktarchiv` 125/125.

- [ ] **Push von `main` vor 23:10 UTC** (der Archiv-Cron klont `main`): der heutige Slot trägt dann **Schema 3** — Live-Pfad
      zuerst (As-of = Abrufzeit, `live.asOf`), `finishedAt`, Stationshöhe am Live-Aufruf (`elevationM`, V-FI-24;
      Reihenbruch, im Bewerter nach `codeHash` trennen), `live.fusion` spaltenweise (17,8 → 10,7 MB gz je Slot),
      `truth.*.ps` (Stationsdruck), Plan-Achse 56 Schritte, `stations.nearest`, Notizen/Caveats. Ohne den Push bleibt jeder
      weitere Slot 17,8 MB und ohne `ps`/`nearest`.
      Dateien: `scripts/punktarchiv/collect.mjs`, `scripts/punktarchiv/lib/{punktarchiv,truth}.mjs`,
      `scripts/verify-punktarchiv.mjs`, `prompt.md` (AP9 → Schema 4), `CLAUDE.md`, `audit/fusion-implementierung.md`,
      dieses §20. Die Dateien `2321.json` und `befund_punktarchiv_slot_2321.md` in der Repo-Wurzel gehören NICHT in den
      Commit (134 MB; der Bericht kann nach `audit/fusion-implementierung/` wandern, wenn du ihn behalten willst).
- [ ] **Entscheidung V-FI-104 (Producer, PAP 2):** Sägezahn in `t2m`/`hModEff` durch den stündlichen Quellenmix — bleibt
      nach Höhenreduktion (Betrag 0,76 gegen 0,33 K). Vorschlag: 3-h-/6-h-Quellen zeitlich auf die Stundenachse interpolieren,
      bevor gemittelt wird (Producer-Join), `hModEff` wird je Punkt konstant. Fusion-Engine-Änderung ⇒ deine Freigabe.
- [ ] **Entscheidung V-FI-105 (Producer/statisches Produkt):** CLAEF (t1) und AICON (t2/t3) haben keine Modellhöhe ⇒
      `hModEff` ist das Mittel der übrigen Quellen (Giswil 1153 statt ≈ 1050 m). Vorschlag: Stellvertreter-Orographie
      (ICON-D2 für CLAEF, ICON global für AICON) mit Provenienz `proxy`.
- [ ] **Entscheidung V-FI-106 (Producer, gering):** t1-Quantile aus `claef_eps` passen nicht zum Mittel (45 % außerhalb
      q10–q90); der Cube-Pfad liest sie nicht. Vorschlag: als Abstand zum eigenen Mittel speichern oder in t1 weglassen.
- [ ] **Entscheidung V-FI-107 (Motor, Live UND Cube, STOPP & FRAGEN):** Windgeschwindigkeit driftet mit dem Vorlauf auf
      4–5 m/s (Slot 21.09.: 2,95 → 5,10 m/s bei 150–240 h; MOSMIX 2,5), weil der Komponenten-Prior (`windSigmaAt`, 3,2 m/s +
      Höhe/TPI) über die Rice-Verteilung eine implizite mittlere Geschwindigkeit σ·√(π/2) erzeugt. Vorschlag: σ je Punkt aus
      der Stationsklimatologie messen (Hindcast/Punktarchiv), nicht setzen. Bis dahin Wind-Scores jenseits ≈ 72 h als verzerrt
      kennzeichnen.
- [ ] **Entscheidung V-FI-108 (Design):** Einzelwerte je Quelle sind nirgends archiviert ⇒ Basislinie „Fusion gegen jede Quelle"
      und Σ-Gewichte (PAP 2) sind nicht erreichbar. Vorschlag: Punktauszug je Lauf/Stufe/Quelle an den 405 Archivpunkten aus dem
      Producer (≈ 1–2 MB gz je Lauf, geschätzt), Sammler kopiert ihn — oder Gewichte aus dem Hindcast (Open-Meteo-Modelle als
      Stellvertreter).
- [ ] **AP9-Kickoff:** `prompt.md` baut jetzt Schema 4 auf Schema 3 auf; Punkt 1e (Stationshöhe am Live-Aufruf) ist erledigt.

## 21. Phase FL — buscosun Fusion Lernphase (Bias, Σ, Varianz, Verifikation gegen jede Einzelquelle), 2026-09-23

Design: `audit/fusion-lernphase.md`. Planungssession 23.09. mit deinen Entscheidungen E-FL-1…4 und E-FL-10; die Umsetzung
FL-AP1 ff. läuft in derselben Session (kein Commit, kein Push, kein Producer-Eingriff, alles unter `src/` hinter Optionen).

- [ ] **Ergebnis lesen (§11.6, Scorecard 2 vom 24.09., `C:\dev\buscosun-hindcast\score\2026-09-24\scorecard.md`):** Form K schlägt in
      0–240 h für T/Td jede Einzelquelle (−26…−54 % CRPS), MMM, Klima, Persistenz und den Cube (−6…−21 %) signifikant, Spread/Skill ≈ 1;
      Böe 0–120 h, Bewölkung 0–240 h ebenso. Rot: 246–336 h (Klimatologie schlägt alles, V-FL-24), Wind ab 51 h und PIT-Rand 0,27–0,33
      (V-FL-22), Niederschlag ≈ Cube. **Entscheidungen:** (a) Client-Tabellen für T/Td/Böe/Bewölkung 0–240 h veröffentlichen (unten),
      (b) Wind und 246–336 h im Client auf dem Cube lassen (Tabellen tragen sie, `predict` kann je Stratum aussparen — sag, ob ich die
      `no-skill`-Regel auf „gegen Klimatologie" umstelle, V-FL-23/24), (c) V-FI-108: Form P bringt nur 1–4 % ⇒ kein Punktauszug nötig?
- [ ] **Design lesen und freigeben** (`audit/fusion-lernphase.md` §1–§8): Anspruch A/B, Stufen A–G, Formen P und K,
      Gates G-FL-1…4, Lückenliste §2.7/§7. Deine Entscheidungen sind dort als E-FL-1…4 protokolliert:
      Client über calib.json · EMOS linear in Merkmalen · Winter 7–48 h aus Archiv + Folgekette · Baselines = 7 Rohmodelle
      + MMM + Klima + Persistenz, MOSMIX/Live-Pfad nur im Archiv-Fenster.
- [ ] **E-FL-5** `point/calib.json` Schema-Bump 3 (Koeffizientenblöcke `bias/cov/variance/wind/precip/clima/anchor`,
      Leser liest 1/2/3). Publisher-Weg bleibt E-F-20 (STOPP & FRAGEN).
- [ ] **E-FL-6** Föhn-Prädiktor aus dem Kamm-Druckgradienten (zwei Cube-Zellen zusätzlich im Client) — ja/nein.
- [ ] **E-FL-7** MOSMIX-Gewicht in `fuseHour`: aus dem Archiv-Fenster mit kurzem Beleg oder `set` bis genug Slots da sind.
- [ ] **E-FL-8** additive Exporte (`accessorsFor`, `makeSource`, `planDay0`) aus `scripts/hindcast/build-slots.mjs`
      (Hindcast-Linie, AP10a-Commit §19 noch offen) — Slots bleiben byte-gleich (V3-a-Wächter).
- [ ] **E-FL-9** ≈ 7 GB Plattenplatz für die Fälle unter `C:\dev\buscosun-hindcast\cases\` (plus ≈ 0,3 GB Kacheln).
- [ ] **Maschine:** Folgekette `queue.mjs follow` täglich weiterlaufen lassen (data_run-Frist ≈ 3 Monate), sonst bleibt
      die Winterlücke 7–48 h; vor dem **30.09.** den neuen dynamical-Zugriffsweg prüfen (t3-σ_ens hängt daran, V-HC-8).
- [ ] **V-FI-108 mit Zahl:** nach FL-AP4 steht P − K in der Scorecard — dann Entscheidung Punktauszug je Quelle aus dem
      Producer oder PAP 2 im Producer (beides Producer-Diff = dein Gate).
- [ ] **STOPP & FRAGEN bleibt:** Motor-Änderungen außerhalb der Option `learned` (V-FI-107 `windSigmaAt` wird nur mit
      Option ersetzt), Publisher-Weg für `fusion.hindcast.json`, jeder Commit.
- [ ] **Publisher-Weg der Client-Tabellen (E-F-20-analog):** `fit\<datum>\fusion.client.json` (≈ 100 KB, Form K, Provenienz `hindcast`)
      nach `point/fusion.client.json` ins Daten-Repo — erst, wenn die Scorecard G-FL-1/G-FL-2 für Form K trägt; bis dahin liest der
      Client nichts (`CubeIo.learnedSource` voreingestellt `none`).
- [ ] **Einschalten im Browser:** `learnedSource: 'json'` in `defaultCubeIo` nur hinter `?pf=cube` und nur nach deiner Freigabe der
      Scorecard; der Cube-Pfad bleibt ohne Option byte-gleich (`verify:pv-cube` Block 24).
- [ ] **Kosten-Gates wiederholen** (`verify:pv-cube` (4)/(9), `verify:point-client` (10s)) ohne laufende Bau-Worker — V-FL-12.
- [ ] **E-FL-11 totalJs-Ratsche (E-F-21):** Build 241/241, eagerJs 107,9 KB unverändert, **totalJs 1 441,4 KB > Grenze 1 438 KB**
      (+3,4 KB gz im lazy `cubeSource`-Chunk: `predict`/`design`/`features`/`strata`/`tables`/`learnedPoint`). Entweder Grenze auf 1 442
      anheben (`npm run budget -- --update`, im Diff sichtbar) oder ich trenne die Vorhersage-Konstanten vom Fit-Kern (≈ 1 KB, kein
      Funktionsverlust). Deine Entscheidung.
- [ ] **Nachtrag 24.09. — Scorecard 2 lesen mit Vermerk V-FL-25:** die DM-p-Werte in `score6-09-24\scorecard.{json,md}` sind mit einer
      falschen Φ gerechnet (Φ(z·√2)); nachgerechnet kippen drei G-FL-1-Zellen der Form K (Wind 25–48 h gegen Klima, Bewölkung 126–240 h
      gegen Klima, Niederschlag 126–336 h gegen Cube), die Kernaussage T/Td 0–240 h, Böe 0–120 h, Bewölkung 0–120 h bleibt (§11.8).
      Entscheidung (a) oben gilt damit für Bewölkung nur bis 120 h. Verifier-Fix ist drin (`stats.mjs`, `verify-pv-score.mjs`, 9g).
- [ ] **E-FL-12 Klimatologie-Produkt für Wind und Böe:** der größte gemessene Gewinn (Wind −3 %, Böe −4…−7 %, Bergstationen: Klima schlägt
      fl-K heute schon bei 0–6 h) braucht eine Punktklimatologie je Größe; `ClimaField` trägt nur T. Optionen: (i) stündliche Wind-/Böen-
      Klimatologie je Zelle aus dem Hindcast-Cube (statisches Produkt im Daten-Repo, Publisher-Weg = dein Gate), (ii) Stationsreihen
      interpoliert (Höhen-/TPI-abhängig, ungenau abseits der Stationen), (iii) vorerst nur T über `ClimaField`. Deine Entscheidung.
- [ ] **E-FL-13 Freigabe FL-AP8 (Fit-Iteration 2, §11.8 Bauplan):** Halbmonatsfalten (V-FL-27), Standort × Tagesgang (V-FL-26), μ_c als
      Spalte (V-FL-23), σ-Skala per CRPS (V-FL-15), Speed-EMOS Wind (V-FL-22), Hürde mit Cube-Prädiktor + CV-Schranke (V-FL-18),
      Anker-Kurve aus den Tabellen (V-FL-20; berührt `anchorTerm` — nur mit Option `learned`, sonst byte-gleich), schlanke Client-
      Tabelle (V-FL-28, 36 → 18 KB gz). Danach Fit 3 + Scorecard 3 (≈ 3 h Rechenzeit + 1 h Scorer, Maschine frei). Kein Producer-Eingriff.
- [ ] **FL-AP8b (24.09.) — Anker-Kurve gebaut, Einschalten = dein Gate (V-FL-20, §11.10):** der Anker des Cube-Pfads nimmt mit
      `FuseCubeOptions.learned` UND einem `anchor`-Block in `fusion.client.json` das gemessene Gewicht w(τ) = cov(e₁,e_τ)/var(e₁)
      (1…48 h, jenseits 0) statt e^(−τ/τ_v) — ein **Motor-Eingriff hinter der Option** (`anchor.ts` additiv, `cubeSource.ts`);
      ohne Option, ohne Block oder je Größe ohne Kurve byte-gleich (`verify:pv-cube` Block 25, 308/308; `verify:pv-fusion` 229/229,
      Live-Pfad unberührt). Im Browser wirkt es erst mit `learnedSource: 'json'` (dein Gate „Einschalten im Browser" oben) — und nur,
      wenn `fusion.client.json` den `anchor`-Block behält (V-FL-28 darf ihn nicht streichen: +2,6 KB gz). Offen: die Kurve endet bei
      48 h (ρ_T(48) ≈ 0,29 fällt auf 0), `ANCHOR_MAX_LEAD_H` im Fit verlängern = Fit-Diff. totalJs 1 442,6 KB > 1 438 (E-FL-11, Grenze
      nicht angehoben).
- [ ] **FL-AP8a (24.09.) — V-FL-26 umgesetzt, Fit 3 + Scorecard 3 (§11.9):** `fusionFit@2` (14 Standort × Tagesgang-Spalten im
      Mittelwertdesign, Tabellen mit `design.mean`; `fusionFit@1`-Tabellen lehnt der Leser ab). Scorecard 3 gegen Scorecard 2: T CRPS 0–6 h
      **−5,3 %**, 7–120 h −2,5…−3,0 %, Böe −1…−1,3 %, Td +0,0…+0,4 %, Wind/Bewölkung/Niederschlag ±0,2 %; T über 800 m −13 %, CH −9 %; kein
      Gate-Verlust durch die Spalten (die Wechsel sind die V-FL-25-Zellen und fl-P Böe 246–336 h G2 mit PIT-Rand 0,149). **Dein Gate:**
      (a) `fit\2026-09-25-v26\fusion.client.json` (163 KB / 39 KB gz, Form K, trägt den `anchor`-Block für FL-AP8b) ist das neue Artefakt für den
      Publisher-Weg `point/fusion.client.json` (E-F-20-analog, oben) — die Fit-2-Datei passt nicht mehr zum Client (`fusionFit@1` ⇒
      `learned: … nicht lesbar`, Rechnung ohne Lernstufe, benannt); (b) Entscheidung (a) oben (Client-Tabellen für T/Td/Böe/Bewölkung) gilt mit
      den Fit-3-Zahlen weiter; (c) V-FL-32 — Td trägt die T-Spalten nicht (Band ≥ 800 m +1,5…+1,7 % CRPS): Spaltensatz je Größe = Fit-Diff
      `fusionFit@3`, ja/nein; (d) totalJs 1 442,6 KB > 1 438 KB (E-FL-11 unverändert offen, Grenze nicht angehoben). Logs und Vergleichstabellen:
      `fit\2026-09-25-v26\fit.log`, `score\2026-09-25-v26\score.log`, `compare-fit.md`/`compare-score.md` (Kopien in
      `audit/fusion-lernphase/ap8a-2026-09-25/`). Referenzen `fit\2026-09-24\` und `score\2026-09-24\` unverändert.
- [ ] **FL-AP8c (25.09.) — V-FL-15/22/18/28 gebaut, `fusionFit@3`, Fit 4 + Scorecard 4 (§11.11):** σ-Skala je Stratum per CRPS
      (`VarianceEntry.scale`; Bewölkung Pflicht, T/Td/Böe nur bei Out-of-fold-Gewinn), Speed-EMOS als **gestutzte Normal**
      TN(a + b·E_Rice, c·sd_Rice) hinter dem u/v-Modell (`tables.speed`, out of fold gegen die Rice, sonst `no-skill`), Hürde mit Spalte
      logit(1 − pDry_Cube) und CV-Schranke (`no-skill`; die Hürde wird jetzt im Speicher mit gedämpftem Newton bis zur Konvergenz gefittet —
      die alte Durchlauf-IRLS divergierte, **V-FL-36**, betraf die Hürde seit FL-AP3), schlanke Client-Tabelle (`lib/clientTables.mjs` ohne
      cv/prior/jitter/folds/ρ_f/Klimatologie; `names` und `anchor` bleiben). Gates: `verify:fusion-fit` 67/67, `verify:pv-cube` 314/314 (Block 26),
      `verify:point-client` 165/165, `verify:calib-fit` 14/14, `verify:pv-fusion` 229/229, Build 241/241, totalJs **1 443,8 KB > 1 438**
      (E-FL-11 unverändert offen, Grenze nicht angehoben). **Deine Gates:**
      (a) **STOPP & FRAGEN nachgeholt — Codec:** `fusion/dist.ts` hat die neue Familie `truncatedNormal` (nur der Lernpfad erzeugt sie),
          und `fusion/v2codec.ts` trägt sie am Ende der `DIST_KINDS`-Tabelle mit **`V2C_VERSION` 1 → 2**; der Dekoder liest 1 und 2
          (`V2C_READABLE`, Version-1-Dokumente dekodieren unverändert, Block 26 prüft es; Block 17 nimmt jetzt Version 3 als fremd). Der
          Codec ist mit AP9 geteilt (Regel „geteilt nur additiv, Änderung ⇒ V2C_VERSION"): bitte bestätigen, sonst nehme ich den
          Client-Teil der Speed-EMOS zurück (Fit/Scorer/Tabellen bleiben davon unberührt).
      (b) **Publisher-Weg:** das neue Artefakt für `point/fusion.client.json` ist `fit\2026-09-25-ap8c\fusion.client.json` (`fusionFit@3`;
          die v26-Datei ist `fusionFit@2` und fällt beim Leser mit benannter Meldung durch ⇒ Rechnung ohne Lernstufe): **115 KB / 24,8 KB gz**
          (Fit 3: 39 KB gz; die 18–21 KB aus §11.8 galten für das 37-Spalten-Design ohne `anchor`-Block).
      (c) **Einschalten im Browser (je eigene Option, beide voreingestellt aus, nur mit `learned`):** `CubeIo.fuse.learnedSpeed`
          (Wind als TN der Motor-Rice, Richtung aus u/v) und `CubeIo.fuse.learnedPrecip` (gelernte Hürde statt K-2, nur ohne Radar-/
          Stationsmember). **Scorecard 4 (§11.11):** Wind CRPS −2,1 … −5,4 % je Bin, PIT-Rand 0,27–0,33 → 0,20–0,24, gegen den Cube
          −11,5 … −26,1 %* — aber **DE +2,8 %** bei 0–6 h und 25–48 h (AT/CH −4 … −13 %, V-FL-38: das Gesetz gilt je Stratum, nicht je
          Land) ⇒ Empfehlung `learnedSpeed` erst nach V-FL-38, oder jetzt mit dem benannten DE-Verlust. Niederschlag: 0–6 h −1,2 %* gegen
          den Cube (Brier −4,8 %), 7–48 h `no-skill` (K-2 bleibt von selbst), 51–120 h −0,6 % ⇒ `learnedPrecip` ist ungefährlich, aber
          klein. Die σ-Skala wirkt mit `learned` automatisch (Teil der Varianztabelle): Bewölkung CRPS −0,4 … −3,6 %, PIT-Rand 0,22–0,35 →
          0,14–0,18; **an T/Td/Böe drückt der Faktor 0,9 (17 Strata) den Spread/Skill auf 0,86–0,92 bei ≤ 0,4 % CRPS-Gewinn (V-FL-37) —
          sag, ob ich die Skala per Regel auf die Bewölkung beschränke (Fit-Diff, Tabellen neu schreiben).**
      (e) **V-FL-36/40 (behoben, aber rückwirkend):** die Hürde der Scorecards 1–3 war eine unkonvergierte IRLS; „Niederschlag ≈ Cube" dort
          war der Fit, nicht die Datenlage. Die Zahlen der Scorecard 4 sind die ersten mit konvergierter Hürde.
      (d) Nicht gebaut (benannt): V-FL-27 Halbmonatsfalten, V-FL-23 μ_c, V-FL-32 Td-Spaltensatz (= `fusionFit@4`), V-FL-35 Anker-σ,
          V-FL-29…31 — je eigener Auftrag.

## 22. Phase FX — buscosun Fusion jenseits des Lehrbuch-Post-Processings (Forschungsiteration), 2026-09-25

Phasendokument `audit/fusion-forschung.md` (Diagnose §2, Hypothesen + Adversarial-Urteile §3, Formel-Urteile §4, Bauplan §5, Protokoll §6,
V-FX-1…22 in §7). Fit-/Scorer-seitig gebaut (hinter Flags, ohne Option byte-gleich): Halbmonatsfalten, Scorer-Maße (rms-Spread,
randomisierte PIT, Vorlaufstunden-/Saison-Strata), μ_c-Spalte mit Ridge-Ziel ρ_f, Windgesetz mit offenem Gitter/zweiter Familie/Band-Verdikt,
Skalenregel — Fit 5a/5b + Scorecard 5a/5b gegen Scorecard 4 (§6). Kein Commit, kein Push, kein Producer-/Motor-Eingriff.

- [ ] **Ergebnis lesen (§6.3, Scorecard 5b `score\2026-09-25-fx5b\` gegen Scorecard 4, like-for-like 6 805 912 Zeilen):** T 246–336 h −10,1 % CRPS
      und erstmals signifikant besser als die Stationsklimatologie (+4,1 %*), Td −12,5 % (Klima-Niveau), Böe −4,8…−10,5 % je Bin, Wind −3,6…−5,0 %
      je Bin mit DE −1,9…−5,7 % (V-FL-38 erledigt) und halbiertem Klima-Verlust am langen Ende (−4,1/−9,7 %!), T/Td 0–240 h −0,8…−3,5 %,
      Niederschlag ≥ Cube in jedem Bin, Bewölkung 0–48 h +1,0 % (V-FX-25, nächster Fit). Fit 5a (nur Halbmonatsfalten): T/Td −1,1…−3,4 %, Wind
      −0,5…−1,1 %, Böe −1,1…−2,6 %, keine Regression. **Entscheidung:** Fit 5b ist der neue Referenzstand für die nächste Iteration (CRPS-Zielwahl
      für die Bewölkung, M2 σ-Modell); keine Veröffentlichung vor E-FX-1.
- [ ] **Lesen (§0–§2):** drei Messfehler der Scorecard 4 (Spread latent ⇒ Bewölkungs-G-FL-2 war Artefakt; Lauf-Route-Falten mit 14–21 Trainingstagen;
      Brier-Tabelle über verschiedene Zeilenmengen ⇒ „Form P −6,0 % bei 25–48 h" ist widerlegt). Wind-Unterdispersion real ≥ 800 m. Kreuzung gegen die
      Stationsklimatologie: Wind 105 h, Böe 156 h, Td 234 h, Bewölkung 246 h, T 264 h — Mechanismus: fehlende Schrumpfung (b 0,36/0,20 statt ≈ 1).
- [ ] **E-FX-1 Klimatologieprodukt im Client (E-FL-12 neu):** (a) Stationstabelle ≈ 90–110 KB gz (oder ≈ 1 KB je Punkt, drei nächste Stationen), (b)
      Merkmalsregression der Koeffizienten ≈ 8 KB gz — nur mit Leave-Station-out-Beleg (Anspruch B; bisher negativ: gepoolte Klimatologie ±0,1 %),
      (c) nur T über `ClimaField`. Ohne Produkt bleibt die μ_c-Spalte (C1) eine Scorer-Zahl; eine `clima: station`-Tabelle rechnet im Client ohne
      Lernstufe (benannt `absent`).
- [ ] **E-FX-2 V-FL-37:** σ-Skala per Regel nur für die Bewölkung (`--scaleVars=clct`; Fit 5b läuft so). Bestätigen oder zurück auf Fit-4-Regel.
- [ ] **E-FX-3 Client-Kette messen (A6, V-FX-9):** Fallbau mit `learned` und Falten-Tabellen je Monat (6–10 h auf 4 Kernen) ⇒ Kandidat `fl-K+engine`;
      danach Entscheidung Gesetz vor `fuseHour` (momentengleiche Rice) — Motor-Reihenfolge = dein Gate.
- [ ] **E-FX-4 Motor-Liste (STOPP & FRAGEN, nicht gebaut):** M9 Anker senkt σ (`anchor.ts`/`cubeSource.ts`); neue Familien Weibull (Klimatologie),
      Zwei-Atome (Bewölkung), Flauten-Hürde (Wind) in `dist.ts`/Codec; Client-Seite von C1 (μ_c in `cubeSource.ts`) und A1 (Band-Schlüssel).
- [ ] **E-FX-5 Niederschlags-Produkt bei t2/t3:** der Cube-Wert ist die Mittelrate über 3/6 h, die Wahrheit die 1-h-Summe (`recompute.mjs`); Fenstermittel
      oder Stundensumme als Produktgröße — die Hürde folgt der Definition (A5, V-FX-14).
- [ ] **E-FX-6 Codec-Version 2 (TN):** bleibt, oder nach A6 (2) momentengleiche Rice ⇒ Bump entbehrlich.
- [ ] **E-FX-7 Publisher-Kandidat:** keine Client-Tabelle aus Fit 5 vor Scorecard 5b und E-FX-1; die Fit-4-Tabelle bleibt lesbar (kein Versionsbump:
      `design.mean.clima` ist optional, fehlend = heutiges Design).
- [ ] **Maschine:** Fit 5a/5b + Scorecard 5a/5b ≈ 4 h sequenziell (eigene Prozesse); Folgekette `queue.mjs follow` weiter täglich; dynamical-Zugang vor 30.09.
- [ ] **FX-4 lesen (26.09., `audit/fusion-forschung.md` §6.4, `audit/fusion-forschung/{diag-fx4.md, fx4-decision-5c.md}`):** Leave-Station-out an 389 Stationen —
      μ_c aus Standortmerkmalen (Ridge-Trend Höhe/Lage/Gelände) T 1,06 K, Td 0,68, Böe 1,31 m/s RMS (gepoolt 1,87/1,70/1,76; `ClimaField` 2,14 K), Wind nur
      0,70/0,65 gegen 0,78/0,63 (Exposition in keinem Merkmal). **Fit 5c + Scorecard 5c mit GESCHÄTZTEM μ_c** (`fit\2026-09-26-fx5c`, `score\2026-09-26-fx5c`,
      dieselben 6 805 912 Zeilen, DM gegen fl-K@5a auf identischen Zeilen): T 246–336 h +4,7 %*, Td +8,5 %*, Böe +1,9/+2,8 %*, Wind +0,3…+1,6 %* (nur
      < 20 km Stationsabstand), T/Td 126–240 h +0,3 % n.s., Bewölkung −1,1…−3,2 %! ⇒ **Regel (vorab festgelegt) verletzt, nicht gebaut**; Fit 5d abgebrochen
      (gleicher Bewölkungs-Schätzer). Client-Wiring war vorbereitet und geprüft (pv-cube 319/319, point-client 167/167, totalJs +2,9 KB) und ist zurückgebaut.
- [ ] **E-FX-1 (beantwortet durch Messung):** kein Klimatologieprodukt jetzt. Geblieben: Schätzer `src/point/fusionFit/climaProduct.ts`, Produktbau
      `scripts/fusionfit/clima-product.mjs` (lokal `C:\dev\buscosun-hindcast\product\2026-09-26\clima\v1\stations.json`, 24,9 KB gz, Lizenzen DWD/GeoSphere/
      MeteoSwiss CC BY 4.0 — nichts kopiert), `fit.mjs --climaMu`, `score.mjs --refTables`. E-FX-7 bleibt: keine Client-Tabelle aus Fit 5.
- [ ] **E-FX-8 Regel je Größe × Bin?** Ein Produkt nur für T/Td/Böe bei 246–336 h (Wind/Bewölkung ohne μ_c-Spalte) bestünde Regel 2/3 und Regel 1 halb —
      Fit 5e (`--climaVars=t,td,gust`, ≈ 5,5 h Maschine) bauen oder E-FX-1 schließen, bis eine Windklimatologie mit Exposition existiert (E-FX-9).
- [ ] **E-FX-9 Windklimatologie mit Exposition:** Monatsmittel u/v/Böe je Cube-Zelle als statisches Producer-Produkt oder ERA5-Land-Kacheln (CC BY 4.0);
      vorher A3 (μ_c^mod-Anomalieform) an den 405 Punkten aus den Fallreihen messen — Producer/Motor = dein Gate.
- [ ] **Maschine FX-4:** Kette Fit 5c (2 h 14) → Scorecard 5c (2 h 59, Referenzkandidaten verdoppeln die Zeit, V-FX-36); lange Ketten vom Werkzeugprozess
      gelöst starten (V-FX-34). Der Hintergrund-Wächter wurde wegen Speicherknappheit beendet (Fit-Spitze); `queue.mjs follow` und der dynamical-Zugang bleiben offen.
- [ ] **FX-5 lesen (27.09., `audit/fusion-forschung.md` §6.5, `audit/fusion-forschung/{fx5-decision-5e.md, diag-fx5-a3.md}`):** E-FX-8 gebaut und gemessen — Fit 5e
      (`fit\2026-09-27-fx5e`, μ_c-Spalte nur T/Td/Böe, geschätztes μ_c ridgeTx) + Scorecard 5e (`score\2026-09-27-fx5e`, dieselben 6 805 912 Zeilen, Referenzen 5a und 5c):
      **T 246–336 h +4,7 %*, Td +8,5 %*, Böe +1,9/+2,8 %* gegen 5a; Bewölkung/Niederschlag exakt 0,0 (Negativkontrolle); Wind +0,3…+1,7 %* = A1 allein (V-FX-40); keine
      Schicht unter −2 % (Rand Wind DE 7–24 h −1,9 %!)** ⇒ Regel fx5 bestanden, **Stufe 3 gebaut**: Produkt lokal `product\2026-09-27\clima\v1\stations.json` (12,0 KB gz,
      nur T/Td/Böe, CC BY 4.0 DWD/GeoSphere/MeteoSwiss), Client-Wiring `CubeIo.climaSource: 'json'` + Leser `climaPoint.ts` (voreingestellt aus, Produktion byte-gleich),
      Fit-5e-Client-Tabelle 28,3 KB gz. Gates grün (`verify:fusion-fit` 104/104, `verify:pv-cube` 320/320, `verify:point-client` 167/167, calib-fit 14/14, pv-fusion 229/229,
      Build 241/241); Budget eagerJs 107,9 unverändert, **totalJs 1 447,6 KB > 1 438 (+2,9 KB gz im lazy cubeSource-Chunk, E-FL-11)**. Kein Commit, nichts kopiert.
- [ ] **E-FX-10 Kopie ins Daten-Repo (dein Gate, nur GEMEINSAM — V-FX-43):** `C:\dev\buscosun-hindcast\product\2026-09-27\clima\v1\stations.json` → `buscosun-data/point/static/clima/v1/stations.json`
      UND `C:\dev\buscosun-hindcast\fit\2026-09-27-fx5e\fusion.client.json` → `buscosun-data/point/fusion.client.json`; danach Warm-up (GET) beider Dateien am Edge. Ohne das
      Produkt rechnet die station-Tabelle T/Td/Böe nicht gelernt (benannt `learnedClima:absent`). Alternative: E-FX-7 (Fit-4-Tabelle) beibehalten, nichts kopieren.
- [ ] **E-FX-11 Einschalten hinter `?pf=cube`:** `defaultCubeIo` → `learnedSource: 'json'` + `climaSource: 'json'` gemeinsam (heute beide aus); erst nach E-FX-10, dann
      Real-Device-Blick auf die erste Darstellung (`?startnow=0&pf=cube&pflog=1`; das Produkt liegt nie auf dem kritischen Pfad).
- [ ] **E-FL-11 totalJs:** 1 444,7 → **1 447,6 KB** (Ratsche 1 438) — anheben oder Rückbau des Client-Wirings verlangen.
- [ ] **V-FX-39:** `clima-product.mjs` war nach dem FX-4-Rückbau nicht lauffähig (fehlende Konstanten in `cubeFormat.ts`) — wiederhergestellt; zur Kenntnis.
- [ ] **E-FX-9 — durch A3 beantwortet: NEIN (§6.5, `diag-fx5-a3.md`, 389 Punkte, Hash-Verdünnung):** die Klimatologie des Cube-Members trägt in der Anomalieform nichts
      (u/v 126–336 h −0,3…+0,5 % = verwürfelte Kontrolle, β_μc 0,02–0,10; Stationsklimatologie +3,9…+8,2 %*, LOSO +0,2…+1,8 %*; Böe +2,1/+4,4 %* ≈ LOSO) ⇒ kein
      Producer-Produkt Monatsmittel u/v/Böe je Zelle, kein Motor-Eingriff. Offen als Frage: ERA5-Land-Kacheln (V-FX-45) oder rollende 12-Monats-Stationsklimatologie
      (V-FX-46: +8,6 %* bei ws 246–336 h, in Echtzeit nur mit Vergangenheit zu messen). Zur Kenntnis: das rohe Member ist bei ws 246–336 h 7,9 %* besser als das u/v-Modell (V-FX-47).
- [ ] **V-FX-44 / E-FX-12 (Befund 27.09.):** die Zeilenverdünnung `(validAtH + pointIdx) % stride` von Fit und Scorer ist bei t3 (6-h-Schritte) eine Punktauswahl —
      Bins 4/5 aller Fits und Scorecards seit Fit 4 hängen an **65 von 389 Stationen** (t2: 130, t1: 259; Zeilenanteil je 16,7 %). Like-for-like zwischen den Karten bleibt
      gültig; Schicht-/dnn-Zahlen der Bins 3–5 auf 65/130 Stationen lesen. Entscheidung: Hash-Auswahl + Referenzkette 5a → 5e neu (≈ 8 h) jetzt oder mit dem Winter-Nachfit.
- [ ] **Mobil-4G (Lab, 04:04 UTC, Maschine frei):** cube-cold-prog erste Darstellung 1 588 / total 1 797 ms, warm 237 ms — keine Regression erkennbar (Referenz 18.09. 1 812 / 193 ms, andere Leitung).

## 23. Phase FV — Abschlussvalidierung von buscosun Fusion (Stand Fit 5e), 2026-09-27

Phasendokument `audit/fusion-validierung.md` (§0 Kurzfassung, §4 Verdikt, §5 Befunde V-FV-1…11, §6 Entscheidungen). Behauptungen vorab eingefroren
(10:36:17Z, Hash in `audit/fusion-validierung/claims-frozen.sha256`), Verdikte gerechnet von `audit/fusion-validierung/fv-decision.mjs`.
Kein Commit, kein Push, keine Kopie, nichts unter `src/` geändert.

- [ ] **Ergebnis zur Kenntnis:** Hindcast (FV-H, 6,8 Mio. Fälle, 389 Stationen): H2 gilt (besser als jedes Rohmodell und das Mittel), H8 gilt; H1 (gegen
      die Tabellen der Scorecard 4) und H3 (gegen den heutigen Motor) scheitern je an einer bzw. zwei Zellen nahe null; H4 scheitert an der Bewölkung
      (PIT-Rand 0,26–0,30 in jedem Bin). Archiv (FV-A, 12 Ausgabetage, an MOSMIX-Stationen, indikativ): H6 und H7 gelten nicht — die volle Kette ist im
      CRPS besser als MOSMIX, im Punktwert aber schlechter als MOSMIX und als das heutige Live-Produkt (außer Niederschlag).
- [ ] **E-FV-1 H6b messen?** Stationsloser Punkt gegen MOSMIX (Leave-Station-out mit der nächsten anderen MOSMIX-Station), ≈ 15 min, als nachträgliche
      Behauptung gekennzeichnet.
- [ ] **E-FV-2 (Empfehlung: nein, noch nicht):** E-FX-10/11 (Klimatologieprodukt + Fit-5e-Tabelle kopieren, `learnedSource`/`climaSource` hinter `?pf=cube`
      einschalten) zurückstellen, bis die Member-Gewichte gemessen sind (V-FV-6, Motor).
- [ ] **E-FV-3 Motor:** t2/t3 im Client mit den ganzjährigen Route-3-Strata statt Route 1 (Sommer 2026) — V-FV-1.
- [ ] **E-FV-4:** `--thin=hash` als Voreinstellung von `fit.mjs`/`score.mjs` (V-FV-3; alte Karten dann nur mit `--thin=legacy` reproduzierbar).
- [ ] **E-FV-5:** Client-Tabelle nicht wechseln (5e vs 4 im Archiv uneinheitlich, V-FV-9), bis das Archiv ≥ 30 Ausgabetage je Bin trägt.
- [ ] **E-FL-11 totalJs** unverändert 1 447,6 KB > 1 438 (diese Phase 0 Byte).
- [ ] **Zur Kenntnis V-FV-2:** der erste Archivlauf las die ganzzahligen Radarraten roh (×100); verworfen (`score\2026-09-27-fv-a-run1-void`), behoben,
      Verifier 16h. AP9: Archivspalten nur mit ihrer Kopf-Skala lesen (`scripts/fusionfit/lib/archiveAdapter.mjs` kann übernommen werden).

## 24. Phase FS — Stationswert von buscosun Fusion gegen MOSMIX (Stand Fit 5e), 2026-09-28

Phasendokument `audit/fusion-stationswert.md` (§0 Kurzfassung, §4 Verdikt, §5 Befunde V-FS-1…11, §6 Entscheidungen). Behauptungen vorab
eingefroren (17:43:58Z, Hash in `audit/fusion-stationswert/claims-frozen.sha256`), Verdikte gerechnet von `scripts/fusionfit/stack-score.mjs`.
Kein Commit, kein Push, keine Kopie, kein Publisher-Lauf. Unter `src/` geändert: `pointForecast/cubeSource.ts`, `fusion/fuse.ts`,
`fusion/output.ts`, neu `fusion/stationValue.ts` — vier Optionen, alle voreingestellt aus, ohne Option byte-gleich zu HEAD (312/312 Läufe).

- [ ] **Ergebnis zur Kenntnis:** die Kette trug zwei Fehler (V-FS-2 doppelte Höhen-/Geländekorrektur des gelernten Mittels, V-FS-3 doppelte
      Schrumpfung); der Stationswert M + b + w·I + c·(L − M) schlägt MOSMIX an der Station (T +13/+6/+5/+3 %, Td +18…+10 %, Wind/Böe 0–6 h
      +5/+8 %, sonst gleichauf, keine Zelle schlechter). 13 Ausgabetage, indikativ.
- [ ] **E-FS-1:** `learnedAtPoint` zur Voreinstellung von `learned` machen (Fehlerkorrektur; heute Option, damit FV-A reproduzierbar bleibt).
      Empfehlung: ja.
- [ ] **E-FS-2:** `priorShrink: false` im Cube-Pfad (D2 bestätigt). Empfehlung: ja, zusammen mit E-FS-1.
- [ ] **E-FS-3:** Stationswert einschalten — braucht einen Leser im Client (`CubeIo.stackSource`, V-FS-10) und den Publisher-Weg der Tabelle
      (`C:\dev\buscosun-hindcast\fit\2026-09-28-fs\stack.archive.json`, 17 KB). Empfehlung: Neufit ab ≥ 30 Ausgabetagen, vorher V-FS-5
      (Schweiz: Wind/Böe −2…−10 % gegen MOSMIX) klären.
- [ ] **E-FS-4:** `learnedClouds` (H14 gilt: CRPS +18…+22 % gegen die Kette). Empfehlung: ja, mit `learned`.
- [ ] **E-FS-5:** E-FV-2 neu bewerten — „Lernstufe noch nicht einschalten" galt der Kette mit beiden Fehlern.
- [ ] **E-FS-6 totalJs** 1 450,6 KB > 1 438 (+3,0 KB aus dieser Phase, Lazy-Chunk des Cube-Pfads).
- [ ] **Zur Kenntnis V-FS-6:** dem Client fehlen das Merkmal `lake` und das Höhenband des Windgesetzes — die Lernstufe im Browser weicht
      vom Scorer ab (T p50 0,05 K, max 0,16 K).
- [ ] **Real-Device / Browser:** s. §24.1 — seit dem Abend des 28.09. ist die Stufe im Client voreingestellt; sie wirkt, sobald die Dateien im Daten-Repo liegen.

### 24.1 Die neueste Stufe live bringen (Jans Auftrag 28.09. abends) — drei Schritte, nur du

Der Client ist fertig: `defaultCubeIo` liest die drei Dateien und rechnet mit der neuesten Stufe, sobald sie da sind
(`audit/fusion-stationswert.md` §7). Bis dahin rechnet der Browser wie bisher und nennt jede fehlende Datei.

- [x] **1. Kopie ins Daten-Repo — erledigt 29.09. 04:52 UTC (Commit `3dd7475`, mit Jans Erlaubnis; CDN 200, kein Purge nötig).** Ursprünglich: (`buscosun-data`, außerhalb der Publish-Fenster: nicht um :20 der Stunden 0/3/6/… und nicht um :30 der
      Stunden 2/5/8/… UTC, nicht während eines Punkt-Jobs). Aus `C:\dev\buscosun-hindcast\publish\2026-09-28-fs\` die drei Dateien an
      denselben Pfad: `point/fusion.client.json`, `point/static/clima/v1/stations.json`, `point/stack.client.json`. Prüfsummen in
      `SHA256SUMS`. Danach nachsehen, dass sie auf `origin/main` stehen (der Force-Push der Kartenlinie ersetzt sonst die Historie).
- [x] **2. Purge — nicht nötig** (alle drei Pfade antworten 200, auch unter `@main`). Ursprünglich: Purge der drei Pfade am CDN — sie sind am 28.09. abgefragt worden und antworten 404 (V-FS-13).
- [ ] **3. Commit und Push von `buscosun-web`** (Code dieser Phase), dann Deploy.
- [ ] **Abnahme nach dem Deploy:** `…?startnow=0&pflog=1` an einem Stationsort (ohne `pf`) — im Herkunftsblock stehen `learned:hindcast`, `learnedAtPoint:set`,
      `priorShrink:off`, `learnedClouds:hindcast`, `stationValue:archive` und die Notiz `stage:fs — neueste Stufe`.
- [x] **E-FS-7 entschieden (Jan, 29.09.: „komplett freischalten"):** der Cube-Pfad ist die Voreinstellung des Panels, `?pf=live` der Rückfall; im Browser geprüft (Desktop). Ursprüngliche Frage: soll das Panel den Cube-Pfad OHNE `?pf=cube` zeigen? Heute ist der Live-Pfad die Voreinstellung; der
      Cube-Pfad ist auf dem Gerät nicht abgenommen (V-FI-50 Long Task, V-FI-53). Empfehlung: erst Real-Device, dann umstellen.
- [ ] **Hinweis:** die Temperatur ändert sich sichtbar (am 28.09. bis +2 K in der warmen Anomalie) — das ist die entfallene doppelte
      Schrumpfung, am Archiv gemessen (D2).

## 25. Phase DB — Wetter-Dashboard (Umschalten Dashboard ⇄ Karte), 2026-09-29/30 — Abnahme Phase 2

Phasendokument `audit/dashboard.md` (§0 Kurzfassung Punkt 6, §10 Umsetzung). Phase 1 (Analyse) am 29.09., Freigabe „starte
phase 2" am selben Tag; Phase 2 am 30.09. fertig, **uncommitted**.

**Erledigt (deine Entscheidungen vom 29.09.):**

- [x] Freigabe Phase 2
- [x] E-DB-1 767/1279 wie Vorlage
- [x] E-DB-2 Umschalter nach der Marke + mobil in der Schwebeleiste
- [x] E-DB-3…17 wie empfohlen
- [x] E-DB-18 Zustände ohne Vorlage aus Bausteinen abgeleitet

**Offen:**

- [ ] **Abnahme Pixel-Diff:** Abweichungen und ihre Gründe stehen in §10.4. Die Bilder liegen in `audit/dashboard/pixel/`: `*-A.png` ist die Aufnahme, `*-B-diff.png` markiert Abweichungen rot.
- [ ] **Abnahme Zustände ohne Vorlage:** die zwölf Aufnahmen in `audit/dashboard/states/` (Laden, Fehler, kein Ort, Heute/7/14 Tage, Tablet/Mobil live, Karte mit Umschalter, Bern, Wien).
- [ ] **E-DB-19 — eagerJs 107,922 > 107,9 (+37 B).**
  - Ursache: der Vorlade-Eintrag des nun geteilten `@nivo/line`-Chunks im Start-Chunk.
  - Entweder: Ratsche auf 108,0 (Empfehlung).
  - Oder: `@nivo/line` im Dashboard durch einen eigenen Zeitachsen-Rahmen ersetzen.
- [ ] **E-DB-20 — Dashboard-Link mobil-4G: erste Ausgabe 4,7 s statt < 2 s** (p95 < 5 s erfüllt; Desktop 1,5 s erfüllt).
  - Ursache: das Karten-JS lädt auf demselben Weg.
  - Entweder: ein eigener Einstieg für `?ansicht=dashboard` (Eingriff in Router und Start-Chunk).
  - Oder: so lassen.
  - Empfehlung: erst das Real-Device-Ergebnis abwarten.
- [ ] **E-DB-16′ totalJs:** Ratsche 1 438 → 1 475 für den Zuwachs dieser Phase (+36,5 KB, alles lazy) bestätigen. Stand 1 492,0; die restlichen ≈ 17 KB stammen aus früheren Ständen (E-FS-6, E-EX-8).
- [ ] **V-DB-12:** die Vorlade-Toleranz in `generate-seo.mjs` auch für Atmosphäre, Eventplanung, Tourenplanung und Brandradar einschalten. Deren Shells tragen schon auf HEAD nur die Basis-Hinweise. Ändert deren Erstbild; eigene kleine Phase.
- [ ] **V-DB-10 zur Kenntnis:** der Konfidenz-Index der Fusion ist in der Stufe fs klein (Garmisch Stunde 0: 6,4 %). Das Dashboard zeigt ihn wahrheitsgemäß als „unsicher". Neu definieren wäre ein Eingriff in buscosun Fusion.
- [ ] **Real-Device** mit `…/wetterkarte/<layer>/<ort>?ansicht=dashboard`:
  - Long Tasks (headless nicht messbar);
  - Touch-Ziele;
  - Kartenpause (Akku, Wärme);
  - Wechsel zurück zur Karte.
- [ ] **Commit/Push/Deploy.** Dateien der Phase:
  - neu `src/dashboard/**`, `scripts/verify-dashboard.mjs`, `scripts/verify-dashboard-switch.mjs`, `scripts/dashboard-pixel-diff.mjs`, `scripts/dashboard-latency.mjs`, `audit/dashboard.md`, `audit/dashboard/**`, `reference/dashboard.dc.html`;
  - geändert `src/MapView.tsx`, `src/map/mapDeck.css`, `src/router/pages/WetterkarteRoute.tsx`, `src/wind/WindLayer.ts`, `src/pointForecast/cubeSource.ts`, `scripts/generate-seo.mjs`, `budget.json`, `package.json`, Doku;
  - die Vorlagen `reference/{desktop,tablet,mobile}.png` sind ebenfalls geändert.
  - Nicht dazu: `fusion-verbesserungen-2026-09-29.md` und `Claude outputs/` (parallele Sitzung).

## 26. Phase EX — Expertenbericht vom 29.09. zu buscosun Fusion (Fristen, Radar-HDF5, Scorer), 2026-09-29

Phasendokument `audit/fusion-expertenbericht-2026-09-29.md` (§0 Kurzfassung, §1 die 21 Vorschläge, §2 Fristen, §5 Reihenfolge).

**Schon geschehen (mit deiner Freigabe vom 29.09.):** Cron-Fix `db1baa5` auf `buscosun-web/main` — das Gate des Punkt-Crons
wertete den Termin „30.09. dynamical" als überfällig, vier Läufe schlugen fehl (13:49–19:44 UTC).

- [x] **Nachgesehen:** Punkt-Cron nach dem Fix grün — 29.09. 21:57 (t3, 5,8 min), 22:37 (t2, 9,5), 22:44 (t1, 15,3), 30.09. 02:00 (12,5).
- [x] **Radar-HDF5 eingeschaltet (30.09., deine Freigabe):** `buscosun-web/main` `cdc9a9b` gepusht (Netlify liefert den
      neuen Start-Chunk), danach `buscosun-data` `a506f2e` (Kopie von `radar-mirror.mjs`, außerhalb des Repack-Fensters).
      Der Spiegel-Job vom 29.09. 22:08 UTC lief noch mit dem alten Skript; der Nachfolger (≈ 03:53 UTC) legt HDF5 ab.
- [ ] **Am 01.10. `radar/status.json` ansehen:** `deriveMs` und Abstand DWD → Push gegen das Bild-Gate 270 s (V-EX-11).
  Rückweg bis zum Stichtag: `RV_FORMAT=radolan` im Workflow, im Browser `?rvfmt=radolan`.
- [ ] **E-EX-6** Radarwerte in RADOLAN-Einheiten wie bisher (gebaut) oder in den feineren HDF5-Werten (27 % der schwächsten
      Echos fielen unter die Farbschwelle). Empfehlung: wie bisher.
- [ ] **Nach dem 06.10.:** Dauer des ersten t2- und t3-Jobs ansehen (ICON-EPS-Dateien doppelt so groß; t2 heute 8,3 von 15 min).
- [ ] **E-EX-7 — Frist 04.11.:** GeoSphere `nwp-v2-1h-1km` unter eigener Kennung im Live-Rückfallpfad und in der Karte
      (Zuordnung der Größen in §3.4). Ohne das schlägt das Cron-Gate ab dem 03.11. 12 UTC fehl.
- [ ] **E-EX-5 — Frist 30.11.:** Phase „NS" (neues DWD-URL-Schema, ICON-D2/ICON-EU nur noch im Dreiecksgitter): Start und
      Reihenfolge. Empfehlung: Diagnose Anfang Oktober, Producer vor Kartenlinie.
- [ ] **E-EX-1** Ensemble-Mittel in t3 am Hindcast messen (berührt V-PD-9). **E-EX-3** MOSMIX_S für 0–24 h (gemessen
      36 MB je Datei, nicht 80). **E-EX-2** ICON-D2-RUC. **E-EX-4** Klimagitter als Motor-Prior.
- [ ] **E-EX-8** totalJs 1 451,2 → 1 455,5 (+4,3 KB, Radar-HDF5); eagerJs 107,9 gehalten.
- [ ] **Zur Kenntnis:** die Sterne der Archiv-Karten FV-A und FS stehen auf 13 Tagen und der alten Testform; mit der
      Kleinstichproben-Korrektur (§4.2) verlieren knappe Zellen den Stern. Neu rechnen mit dem Neufit (E-FS-3).
      Befund 18 gemessen: gestutzte Normal am Stationswert ist für Wind 1,6–5,0 % schlechter ⇒ nicht umgestellt (§4.4).
