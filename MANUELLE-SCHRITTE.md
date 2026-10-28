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

Phasendokument `audit/dashboard.md` (§0 Kurzfassung Punkt 6/7, §10 Umsetzung, §11 E-DB-20). Phase 1 (Analyse) am 29.09., Freigabe „starte
phase 2" am selben Tag; Phase 2 am 30.09. fertig, commitet und gepusht mit `377a73a` (30.09., 08:02).

**Erledigt (deine Entscheidungen vom 29./30.09.):**

- [x] Freigabe Phase 2
- [x] E-DB-1 767/1279 wie Vorlage
- [x] E-DB-2 Umschalter nach der Marke + mobil in der Schwebeleiste
- [x] E-DB-3…17 wie empfohlen
- [x] E-DB-18 Zustände ohne Vorlage aus Bausteinen abgeleitet
- [x] Commit + Push (`377a73a`)
- [x] **E-DB-19 + E-DB-16′ (30.09.: „die Grenzen … können gerne angehoben werden")** — `budget.json`: eagerJs 107,9 → 108,0 (IST 107,922), totalJs 1 475 → 1 495 (IST 1 492,0, einschließlich der Altlast aus E-FS-6/E-EX-8); `npm run budget` grün ⇒ auch der Budget-Schritt der CI. **Noch zu commiten:** `budget.json`, dieses Dokument, `audit/dashboard.md`, `CLAUDE.md`.

**Offen:**

- [ ] **Abnahme Pixel-Diff:** Abweichungen und ihre Gründe stehen in §10.4. Die Bilder liegen in `audit/dashboard/pixel/`: `*-A.png` ist die Aufnahme, `*-B-diff.png` markiert Abweichungen rot.
- [ ] **Abnahme Zustände ohne Vorlage:** die zwölf Aufnahmen in `audit/dashboard/states/` (Laden, Fehler, kein Ort, Heute/7/14 Tage, Tablet/Mobil live, Karte mit Umschalter, Bern, Wien).
- [x] **E-DB-20 entschieden (30.09.: „wenn ein Nutzer einen Ort auswählt, erscheint erst das Dashboard … danach im Hintergrund
      die Karte") und umgesetzt, uncommitted** — `audit/dashboard.md` §11:
  - Ortswahl auf der Startseite ⇒ Dashboard; Karten-JS erst nach der Vorhersage im Hintergrund, Montage beim Umschalten.
  - Gemessen wie in Produktion (Shell, HTTP/2): Dashboard-Link mobil-4G erste Ausgabe 3,76 → 3,44 s, ganzes Fenster
    4,41 → 3,88 s; Karten-Link mobil unverändert, Desktop gepoolt +15 ms. Ziel < 2 s nicht erreicht (V-DB-19).
  - Budget nach deiner Freigabe angehoben: eagerJs 108,7 (IST 108,6), totalJs 1 502 (IST 1 500,5), Herkunft in `budget.json`.
- [x] **Commit** `ccfd3cd` (30.09., auf deinen Auftrag, **nicht gepusht**): E-DB-20 samt Budget-/Doku-Nachtrag von oben; nur
      die Dashboard-Hunks von `CLAUDE.md` und diesem Dokument — die GS-Doku-Nachträge (§27, E-EX-7) und die Dateien der
      parallelen Fusion-Sitzung liegen weiter uncommitted.
- [ ] **Push** von `buscosun-web/main` (mit `4112e2f` GS davor, E-GS-3) und danach die Deploy-Prüfung (unten).
- [x] **E-DB-23 umgesetzt (30.09., uncommitted)** — `audit/dashboard.md` §12. Deine Linie: „orientiere dich am ursprünglichen
      Dashboard und mache es punktuell innovativer" (die Skizze „Wetter-Deck" war dir zu aufgeregt). Gewählt und gebaut:
  - Konfidenz-Kachel führt mit der **Bandbreite** („±1,3 °C", „jetzt: 80 % zwischen …") und einem kleinen **Trichter** über
    14 Tage; der Index steht klein darunter.
  - **Leitsatz** über den Tageskarten, aus denselben Tagesdaten („Heute bedeckt, bis 26°. Morgen Regen, kühler, …, 15,6 mm.").
  - Stundenverlauf mit **Nachtflächen** und **Marken**, wo die Bandbreite ±2/3/4 °C erreicht.
  - Folgefund zu E-DB-20 behoben: die Ortswahl auf der Startseite bricht deren Karten-Vorwärmen ab.
  - Gates: `verify:dashboard` 68/68 (`--dist` 71/71), `verify:dashboard-switch` 39/39, Build 249/249, Budget totalJs 1 508 (+1,6 KB).
- [ ] **Ansehen:** `…/wetterkarte/wind/<ort>?ansicht=dashboard` (Dev-Server) — passt die Richtung? Danach Commit (nur die
      Dashboard-Dateien, `src/SearchPage.tsx`, `budget.json`, Doku — nicht die Dateien der parallelen Fusion-Sitzung).
- [x] **E-DB-24 umgesetzt (30.09., uncommitted)** — `audit/dashboard.md` §13: Reiter „Überblick | Details" unter dem Kopf
      (Überblick = oberste Reihe + Prognose, Details = alles weitere), URL `teil=details`, Details lädt erst beim Öffnen.
      Gates: `verify:dashboard-switch` 50/50, `verify:dashboard --dist` 71/71, Build 249/249, Budget totalJs 1 512 (+0,5 KB).
- [ ] **Ansehen und Commit** von E-DB-23 + E-DB-24 zusammen (nur Dashboard-Dateien, `src/SearchPage.tsx`,
      `src/router/pages/WetterkarteRoute.tsx`, `budget.json`, Doku — nicht die Dateien der parallelen Fusion-Sitzung).
- [ ] **V-DB-21 zur Kenntnis (Fusion):** einzelne Stunden mit eingeknickter Bandbreite und stündlich springender Herkunft der
      Streuung in Stufe t3 — der Trichter zeigt deshalb die Hüllkurve je Tag.
- [ ] **E-DB-21 (V-DB-16):** Die Startseite wärmt im Leerlauf die Karte vor. Soll sie zuerst das Dashboard vorwärmen
      (+231 KB JS je Startseitenbesuch)? Empfehlung: erst Real-Device, dann entscheiden.
- [ ] **E-DB-22 (V-DB-17):** Kartenpause — einmaliger Schub von ≈ 3 700 Draws hinter dem Dashboard, schon auf HEAD; macht (B)
      im Umschalt-Verifier zeitabhängig rot. Empfehlung: eigene kleine Phase.
- [ ] **V-DB-12:** die Vorlade-Toleranz in `generate-seo.mjs` auch für Atmosphäre, Eventplanung, Tourenplanung und Brandradar einschalten. Deren Shells tragen schon auf HEAD nur die Basis-Hinweise. Ändert deren Erstbild; eigene kleine Phase.
- [ ] **V-DB-10 zur Kenntnis:** der Konfidenz-Index der Fusion ist in der Stufe fs klein (Garmisch Stunde 0: 6,4 %). Das Dashboard zeigt ihn wahrheitsgemäß als „unsicher". Neu definieren wäre ein Eingriff in buscosun Fusion.
- [ ] **Real-Device** mit `…/wetterkarte/<layer>/<ort>?ansicht=dashboard` und über die Startseite (Ort suchen):
  - Long Tasks (headless nicht messbar) — auch beim Hintergrund-Laden der Karte, während das Dashboard steht;
  - Touch-Ziele;
  - Kartenpause (Akku, Wärme);
  - Wechsel zur Karte (sofort und nach einigen Sekunden) und zurück.
- [ ] **Deploy prüfen:** Produktion zeigt den Umschalter „Dashboard | Karte" auf `/wetterkarte`, `…?ansicht=dashboard` öffnet das
      Dashboard, die Ortssuche der Startseite landet im Dashboard; im Netzwerk-Tab kommt `MapView-*.js` erst nach der Vorhersage.

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
- [x] **E-EX-7 — Frist 04.11.:** erledigt in Phase GS (§27).
- [ ] **E-EX-5 — Frist 30.11.:** Phase „NS" (neues DWD-URL-Schema, ICON-D2/ICON-EU nur noch im Dreiecksgitter): Start und
      Reihenfolge. Empfehlung: Diagnose Anfang Oktober, Producer vor Kartenlinie.
- [ ] **E-EX-1** Ensemble-Mittel in t3 am Hindcast messen (berührt V-PD-9). **E-EX-3** MOSMIX_S für 0–24 h (gemessen
      36 MB je Datei, nicht 80). **E-EX-2** ICON-D2-RUC. **E-EX-4** Klimagitter als Motor-Prior.
- [ ] **E-EX-8** totalJs 1 451,2 → 1 455,5 (+4,3 KB, Radar-HDF5); eagerJs 107,9 gehalten.
- [ ] **Zur Kenntnis:** die Sterne der Archiv-Karten FV-A und FS stehen auf 13 Tagen und der alten Testform; mit der
      Kleinstichproben-Korrektur (§4.2) verlieren knappe Zellen den Stern. Neu rechnen mit dem Neufit (E-FS-3).
      Befund 18 gemessen: gestutzte Normal am Stationswert ist für Wind 1,6–5,0 % schlechter ⇒ nicht umgestellt (§4.4).

## 27. Phase GS — GeoSphere `nwp-v1` → `nwp-v2` (C-LAEF 1 km) im Live-Pfad und in der Karte, 2026-09-30

Phasendokument `audit/geosphere-v2.md`. Gebaut und geprüft (Gates §3), **nicht gepusht**.

- [ ] **E-GS-3 Push von `buscosun-web/main`** (Netlify-Deploy). Danach liest der Live-Rückfallpfad (`?pf=live`) und die
      Rasterfusion AT/CH C-LAEF 1 km; `?nwp=v1` (bzw. `localStorage.nwp = 'v1'`) liest bis zum 04.11. weiter AROME.
- [ ] **E-GS-1** Katalog-Kennung `arome-at` bleibt der URL-Schlüssel, sichtbar „C-LAEF" — bestätigen (Alternative: neue
      Kennung `claef` mit Alias für alte Links; berührt den Parser der Edge Function).
- [ ] **E-GS-2** Fehler-Priors der Familie `highres` gelten unverändert für C-LAEF (gesetzt); eigene σ erst aus dem Archiv.
- [ ] **Nach dem 04.11.:** V-GS-1 — Schalter `?nwp=v1` und die `arome_at`-Reste entfernen.
- [ ] **Zur Kenntnis:** Beim Aufräumen eines Mess-Arbeitsbaums habe ich `node_modules` des Hauptbaums mitgelöscht
      (Junction + `rm -rf`); wiederhergestellt mit `npm ci` (224 Pakete, `package-lock.json` unverändert). Die
      gesperrten Native-Module der laufenden Dev-Server der Dashboard-Session liegen unter `C:\dev\.locked\` und
      können gelöscht werden, sobald diese Server beendet sind.

## 28. Phase AX — Ausbau nach dem Expertenbericht (AX-1…AX-12), 2026-09-30

Phasendokument `audit/fusion-ausbau.md`. Alles gebaut, gemessen und geprüft (Gates je AP), **nicht committet, nicht
gepusht**. Der Live-Pfad ist byte-gleich (`verify:pv-fusion` 229/229); im Cube-Pfad wirken AX-1 (Messung der Station am
Punkt), AX-2b (Altersnotizen) und AX-3 (Anomalie-Interpolation, in der Stufe `fs`) sofort nach dem Deploy — die übrigen
Ergebnisse warten auf deine Gates.

**Seit deiner Freigabe vom 30.09. (Daten-Repo und Jobs):** AX-7 (Ensemble-Mittel, Schema 6) und AX-8 (MOSMIX-S) sind gebaut
und lokal gegen echte Daten geprüft (§6a.3, §6b.3). **Der Punkt-Cron klont `buscosun-web/main`** — beides läuft dort erst
nach dem Push dieses Repos; ich habe deshalb ins Daten-Repo nur kopiert, was ohne den neuen Producer ungefährlich ist
(Cron-Vorlage mit Leerlauf-Schutz, README), und **nicht** die Tabellen, die einen neuen Client brauchen (E-AX-5/7).
Daten-Repo-Commit **`7115d708`** (30.09., 13:47 UTC, gepusht): `.github/workflows/point.yml` = Vorlage (bringt auch die seit
AP12a/AP17 ausstehenden Zeilen `POINT_CDN_BUDGET_S` und `POINT_Z0MOD: '1'` mit — z0mod wird damit im nächsten Cron-Lauf
gebaut, der Code liegt auf `main` seit `36f2bbb`), `README.md` = Vorlage (61 Ebenen mit dem Satz, dass die Läufe bis zum
Push Schema 5 tragen; `point/stations-s/`).

- [x] **AX-7 nach dem Push — eingetreten:** der t1-Lauf `2026093015` (16:40 UTC) war der erste Cube in Schema 6 auf dem Runner
      (`verify:pv-cube` (35) liest ihn aus dem Klon: 61 Ebenen, `_ens` da, T lesbar; `2026093012` t1 noch 57). Der erste t3-Job
      lief 21:58–22:06 UTC (**8,4 min**, Grenze 10; bisher gemessen 5,4 — `JOB_MEASURED_MAX_MIN.t3` nachgezogen) und schreibt
      `2026093012` t3 mit den vier `_ens`-Ebenen an 16 Rasterstunden (11,1 % der Zellen×Stunden, wie σ_ens; wie entworfen).
      Der Archiv-Cron 23:10 UTC sammelt ab heute Nacht mit dem neuen Leser, die Ebenen liegen damit ab morgen im Archiv. Weiter gilt:
      bis zu 24 h liegen Schema-5-Chunks daneben (Leser lesen beide). Danach `verify:pv-latency -- --only=bundle` einmal
      (Bytes je Chunk +4 Ebenen, in t1/t2 leer ⇒ ≈ 4 Byte je Ebene) und die t3-Laufzeit mit 50/24 Membern im Manifest
      (`tiers[].ensemble.mean`, `timing.blocks.ensemble`) nachlesen; `ensMember` bleibt aus, bis der Fit das Mittel als
      Prädiktor trägt (E-AX-6).
- [x] **AX-8 nach dem Push — eingetreten (Push `a02f2b5` 15:33 UTC):** der `stations-s`-Slot 15:50 (Lauf 15:56 UTC) hat den
      ersten MOSMIX-S-Lauf `2026093015` gebaut und publiziert (Job 2 min 17 s, Publish `success`, Index `stationsS.runs`);
      der t2-Lauf 16:40 UTC läuft mit L- und S-Schritt. Erste Messung: 2,3 min ≤ `JOB_MEASURED_MAX_MIN['stations-s']` 3,2
      (bleibt als obere Schranke, bis mehr Läufe da sind); CDN-Budget 60 s nach ein paar Tagen nachrechnen (Regel F).
- [ ] **AX-9 Klimagitter — Produkt liegt im Daten-Repo** (`point/static/clima-grid/v1/`, 208 Chunks, 1,87 MiB, von mir
      gepusht; der Client liest es NUR mit `CubeIo.climaGrid`, im Panel `?cg=1`). Gemessen an 14 762 Punkt-Monaten
      (§6c.3): Gitter gewinnt in Alpen (−28 %), CH (−16 %), |Δh| > 200 m (−23 %), verliert im flachen DE (+10 %); mit
      Trendversatz 0,45 K/Dekade (`FuseCubeOptions.climaTrend`) Stationsfeld 1,63 → 1,36 K, Gitter 1,57 → **1,22 K**.
- [ ] **E-AX-9 Prior in die Stufe?** Empfehlung: `climaGrid` + `climaTrend` in der Stufe `fs` (`defaultCubeIo` /
      `forecastFromBundle` je eine Zeile), nachdem AP9 die Produktwirkung gemessen hat — der Prior wirkt nur über die
      Schrumpfung bei langen Vorläufen und den Schwanz. Konservativer Zwischenschritt: nur `climaTrend` (wirkt schon
      ohne Gitter, −17 % Prior-MAE). Der Trendwert ist ein Literaturwert (set), kein Fit.
- [ ] **AX-10 INCA-Anker (gebaut, nicht gemessen):** in AT die INCA-Analyse (GeoSphere, 1 km, stündlich, Latenz ≈ 1–1,5 h)
      am Punkt als Anker-„Messung" mit Gewicht 0,6 (set) — nur mit `CubeIo.incaAnchor` (`?inca=1`). **E-AX-10:** in die
      Stufe erst nach der Messung (der Sammler schreibt die INCA-Zeile mit, der Fit misst das Gewicht; Leave-Station-out
      geht mit der Analyse nicht).
- [ ] **AX-11 (#21) Globalstrahlung, Sonnenscheindauer, Sichtweite** liegen nach dem Push in beiden Stationsprodukten
      (drei Ebenen hinter den 61 Cube-Ebenen; +1,66 MiB je Lauf) — `station.steps[].values.radGlob/sunDur/vis`. Das
      Dashboard (Phase DB) kann sie von dort nehmen; hier nicht angefasst. Keine Entscheidung nötig, zur Kenntnis.
- [ ] **V-AX-12 zur Kenntnis:** der erste Leerlauf-Schutz des `stations-s`-Jobs traf den Teilstring `mosmix_stationskatalog`
      im alten Bauer — der Lauf 14:03 UTC baute MOSMIX-L einmal neu (byte-gleiche Bündel, nur Zeitstempel/Index). Behoben
      mit dem Marker `POINT_STATIONS_SOURCE` (Daten-Repo `d058317c`, 14:35 UTC); der Verifier prüft Marker und Teilstring-Fall.
      Der t1-Lauf 13:48 UTC lief bereits mit der neuen Vorlage (inkl. `POINT_Z0MOD: '1'`) in 15 min durch; der Slot 14:50 (Lauf 14:58 UTC) endete als benannter Leerlauf mit übersprungenem Publish — der Schutz greift.
- [ ] **E-AX-8 MOSMIX-S als Voreinstellung?** Nein, bis gemessen: der Stationswert (FS) und die Lernstufe sind an MOSMIX-L
      gefittet. Messweg: der Sammler (AP9) liest je Slot zusätzlich die S-Reihe (`readStationPoint` mit
      `stationSource: 'mosmix_s'`, eine Zeile in `scripts/punktarchiv/`), nach ≥ 14 Ausgabetagen S gegen L + Anker an den
      Stationen (der Beleg, den `DECLINED.mosmix_s` verlangte). Im Panel jederzeit `?st=s` / `?st=fresh`.

- [ ] **Commit und Push von `buscosun-web/main`** (Netlify-Deploy). Danach: der Stationswert bekommt in DE/AT/CH die
      Messung der Station am Punkt (vorher an 0 von 8 Stadtpunkten, jetzt 4 von 8 — die übrigen haben keine messende
      Station im Umkreis), TAWES/SMN liefern die wirklich nächsten Stationen, T zwischen den nativen Schritten folgt dem
      Tagesgang (Orakel: 6-h-Schritte −15,5 % MAE, 3-h −4,1 %).
- [ ] **E-AX-1** `near` auch im Live-Pfad (`?pf=live`, Stunde 0 aus den wirklich nächsten Stationen) — ändert das
      Live-Produkt, eigener Commit nach dem Muster von Commit B. Empfehlung: ja.
- [ ] **E-AX-2** `learnedRoute: 'tier'` (Route-3-Strata in t2/t3, E-FV-3): gebaut, am Archiv gemessen — **schlechter**
      (stationsloser Punkt T 51–120 h −11 %!, Wind 126–240 h −17 %!). Bleibt gebaut, Voreinstellung 1, nicht in der Stufe.
      Empfehlung: bei Route 1 bleiben, im Dezember mit Winterzeilen neu messen (E-FL-3).
- [ ] **E-AX-3** `anomalyInterp` in der Stufe `fs` — eine Zeile in `forecastFromBundle` (`cubeSource.ts`). Ich habe sie
      gesetzt (Jans Auftrag 28.09.: „wer buscosun Fusion abfragt, bekommt die neueste Stufe"); Rücknahme = die Zeile löschen.
- [ ] **E-AX-4 Codec Version 3** (Familie `cloudMix`): der Codec ist mit AP9 geteilt — der Sammler schreibt nach dem
      Deploy Version 3, die Leser (Client, AP9) lesen 1–3. Bestätigen.
- [ ] **E-AX-5 Bewölkung als Zwei-Atome-Mischung ins Produkt:** die Tabelle `C:\dev\buscosun-hindcast\fit\2026-09-30-ax4\fusion.ax4.json`
      (Fit 5e + `atoms`, 16 geschriebene Atome) als `point/fusion.client.json` ins Daten-Repo (Purge der drei Pfade wie in
      §24.1) — **nur zusammen mit E-AX-4**. Out of fold: CRPS +5,7 %* (0–6 h +10,7 %*), MAE −9 %, PIT-Rand 0,28 → 0,195,
      Atome kalibriert. Die Client-Tabelle liegt gebaut in `fit\2026-09-30-ax4\fusion.ax4.client.json` (30,3 KB gz statt 29,0;
      `lib/clientTables.mjs` trägt die Atome seit AX-4; mean/variance/occurrence/amount/speed byte-gleich zur veröffentlichten
      Tabelle, geprüft) — sie ersetzt `point/fusion.client.json` im Daten-Repo.
- [ ] **E-AX-6 Ensemble-Mittel in t3** (E-EX-1): gemessen roh — gegen jeden Einzellauf +14…+28 % (T), +13…+16 % (Wind),
      +10…+12 % (Böe); gegen das Mittel zweier Läufe bei T erst ab 246 h (+10 %*), bei 246–336 h nur gleichauf mit der
      Klimatologie. Empfehlung: ENS-Mittel für u/v und Böe (und T) als t3-Member in den Cube (Producer `ecmwfEns.mjs`,
      kehrt V-PD-9 um), danach Fit mit dem Mittel als Prädiktor — nach der Phase NS.
- [ ] **E-AX-7 Landesparameter des Stationswerts:** H15 **GILT** (§5.4: CH Wind 7–120 h +1,3…+3,7 %*, Böe +3,2…+7,0 %*,
      AT Wind +4,7…+5,6 %*, nirgends schlechter; die CH-Lücke gegen MOSMIX schließt sich). Die Tabelle
      `C:\dev\buscosun-hindcast\fit\2026-09-30-ax5\stack.archive.json` (863 Einträge, 28,7 KB gz statt 8,1) ersetzt
      `point/stack.client.json` im Daten-Repo (Purge wie in §24.1). Empfehlung: ja.
- [x] **V-AX-4 Archiv-Schema 3 — erledigt (AX-12, 30.09. abends):** `archiveAdapter.mjs` liest Schema 1/2/3
      (`ARCHIVE_SCHEMAS_READABLE`, `verify:fusion-fit` 16i); `stack-extract.mjs` hat `--slotsFrom` (Ausgabe-Slots) neben
      `--slotsTo`. Der Neufit des Stationswerts (E-FS-3, ≥ 30 Ausgabetage) kann damit über Schema-3-Slots laufen.
- [ ] **AX-12 — Messung heute gegen Fit 5e (Archiv 16.–28.09., 365 513 Zeilen, 13 Ausgabetage, 389 Stationspunkte;
      `audit/fusion-ausbau.md` §6g, Karte `audit/fusion-ausbau/now-vs-5e.md`):** zur Kenntnis — Modus S (Punkt = Station) MAE in
      **22 von 36 Zellen signifikant besser als 5e, keine schlechter** (T +17…+29 %*, Td +10…+22 %*, Wind +20…+27 %*, Böe
      +16…+28 %*, Bewölkung +11…+18 %*; Niederschlag unverändert); gegen MOSMIX T +3…+14 %*, Td +13…+19 %*, Wind/Böe 0–6 h
      +6/+10 %*, sonst gleichauf; der Stationswert Leave-Day-out, die eingesetzte Tabelle liegt ≤ 1,2 % davon. **Zwei Entscheidungen
      berührt:** (1) **E-AX-7 wird dringender** — die Schweiz liegt bei Wind 7–240 h −2,2…−7,0 %! und Böe 7–120 h −5,3…−9,9 %! hinter
      MOSMIX, genau die Lücke, die die AX-5-Tabelle (`fit\2026-09-30-ax5\stack.archive.json` → `point/stack.client.json`) schließt;
      (2) **E-AX-11 (neu, V-AX-13):** am stationslosen Punkt ist Wind in 2 Bins signifikant schlechter als 5e (0–6 h −1,2 %!,
      126–240 h −4,1 %!) und bei 0–120 h unter der Lernstufe allein (−1,3…−5,0 %!), AT in 4 von 5 Bins — Vorschlag: `priorShrink`
      je Größe (Wind/Böe behalten den Klimatologie-Schritt) und/oder Anker-Gewicht des Windes mit der Distanz der Messung dämpfen,
      zuerst als Varianten am Archiv messen (≈ 1 h auf denselben Zeilen), dann entscheiden; nichts gebaut. Verdikte auf 13–14 Tagen
      kippen zwischen GILT und GLEICHSTAND (V-AX-14) — alles indikativ bis ≥ 30 Ausgabetage.
- [x] **AX-12b — die zwei Schaltkandidaten am Archiv gemessen (§6g.5, Karte `audit/fusion-ausbau/now-vs-5e-b.md`) und mit deinem
      Go am 30.09. 18:25 UTC eingespielt: Daten-Repo `1aaec969`, beide Pfade gepurgt, CDN geprüft (§6g.6). Der Stand heißt ab jetzt
      **„buscosun Fusion 6"** (Definition in `CLAUDE.md`, Sprache & Konventionen; Rückbau = Revert von `1aaec969` + Purge).
      Offen daraus: V-AX-16 (Bezeichnung als Konstante im Produkt-Hinweis, mit dem nächsten Push) und E-AX-12 (Karte an den
      nächsten ≥ 14 Archivtagen). Die gemessenen Zahlen:**
- [ ] **E-AX-11 Wind ohne Station — gebaut und gemessen (§6h, Karte `audit/fusion-ausbau/eax11.md`), Entscheidung offen:** zwei
      Motor-Optionen, voreingestellt aus (`priorShrinkWind`: Klimatologie-Schritt bleibt für Wind/Böe; `anchorWindKm`: Wind-Anker
      über die Distanz der Messung gedämpft), `verify:pv-cube` 398/398 (Block 38), `verify:pv-fusion` 235/235 (Live-Pfad
      byte-gleich), Build 249/249, Budget grün. Archiv 13 Tage, Modus L: **der Schritt ist SCHLECHTER** (Böe 0–120 h −3,5…−5,7 %!,
      DE-Wind bis −11 %!; aber AT/CH-Wind +3…+15 %* und 126–240 h +4,7 %* ⇒ V-AX-17: das Defizit liegt im gelernten Windmember,
      Fit-Seite, Winter-Nachfit); **der gedämpfte Anker ist GLEICHSTAND** nach Regel (nirgends schlechter, Böe 0–6 h +0,6 %*,
      Wind 0–6 h +0,5 %; gegen 5e Wind 0–6 h −1,1 %! → −0,6 % n.s.). **Empfehlung:** `anchorWindKm: 10` in die Stufe fs mit
      dem nächsten Push von buscosun-web (dann „buscosun Fusion 7"), den Schritt nicht; E-AX-13 (Schritt nur Wind, nur ≥ 126 h
      oder Relief) erst mit ≥ 30 Ausgabetagen. Bis zum Push bleibt buscosun Fusion 6 unverändert.
      (1) **E-AX-4/5 Wolkenatome:** `fit\2026-09-30-ax4\fusion.ax4.client.json` → `point/fusion.client.json` (5e-Tabelle + 16
      Atome, +5,5 KB). Archiv: Bewölkung CRPS 0–6 h **+10,0 %***, 7–48 h +6 %*, MAE +6,5…+11,7 %*, PIT-Rand 0,28–0,33 → 0,21–0,23,
      126–336 h unverändert (keine Atome geschrieben); Kontrolle K7: alle anderen Größen byte-gleich. **Empfehlung: ja.**
      (2) **E-AX-7 Landesparameter:** `fit\2026-09-30-ax5\stack.archive.json` → `point/stack.client.json`. Archiv: Wind +1,8…+3,2 %*,
      Böe +2,1…+2,9 %*, CH Wind/Böe +1,5…+8,1 %*, AT Wind +4…+6 %*; die Schweiz schließt gegen MOSMIX von −2…−10 %! auf
      −0,6…−1,1 % (n.s.). **Aber Td −0,1…−1,0 % (25–48 h −1,0 %!, V-AX-15)** ⇒ **Empfehlung: ja, ohne die Td-Landeseinträge**
      (Td fällt auf die gepoolten Einträge zurück; T/Wind/Böe mit Land) — beide Spalten sind gemessen.
      Zusammen gegen 5e (Modus S): MAE **23 von 36 Zellen signifikant besser, 0 schlechter**. Danach E-AX-12: dieselbe Karte an den
      nächsten ≥ 14 Archivtagen, dann out-of-sample für beide Tabellen.
- [ ] **V-AX-6 Rampe an den Nähten (Bericht #15):** ohne überlappende Vorläufe nicht messbar — Producer müsste t2 ab 45 h
      und t3 ab 117 h behalten (je zwei Schritte). Entscheidung, ob das die Bytes wert ist.
- [ ] **Nicht gebaut, entworfen (`audit/fusion-ausbau.md` §6f):** #17 CH-Member (CH2-EPS zuerst, hinter `POINT_CH_MEMBERS`),
      #18 Exposition (Merkmal aus `horizonDeg`, Neufit = eigene Fit-Etappe), #20 zeitversetztes Ensemble (ohne Archiv mit
      Vorläufern nicht messbar), #4 RUC (E-EX-5: mit der DWD-Schema-Phase am 30.11.), #6 flächige MOS-Korrektur und #8
      flächige Niederschlagswahrheit (Datenprogramme, brauchen die Archivkarte bzw. Rasterwahrheit); Kalender: #1/2
      (≥ 30 Ausgabetage), #9 (Winter). Gebaut sind #3 (AX-7), #5 (AX-8), #13 (AX-9), #14 (AX-10), #21 (AX-11).
- [ ] **Zur Kenntnis:** dieselbe Archivkarte mit 15 Slots und der korrigierten Teststatistik (EX §4.2) stuft H10 auf
      GLEICHSTAND und E2 auf GLEICHSTAND (die Skills sind unverändert positiv, nur seltener signifikant); V-FS-5 bestätigt.
      Die Dev-Server-Instanz auf :5199 (diese Session) kann beendet werden.

## 29. Phase KF — Konfidenz-Score von buscosun Fusion 6, 2026-09-30 (Diagnose, kein Code geändert)

Beleg: `audit/fusion-konfidenz.md` (§0 Kurzfassung, §6 Vorschlag), `audit/fusion-konfidenz/monotonie.md`, `cdn-probe.md`.
Der Score ist an 99–100 % aller Stunden unter „solide" und bei der Bewölkung immer 0; er ordnet den Fehler zwar (T-Dezile
monoton), ist aber falsch skaliert (V-KF-1…5). Alles Folgende berührt `src/pointForecast/fusion/uncertainty.ts` (Fusion-Engine) und
ist deshalb Jans Entscheidung:

- **E-KF-1** Score neu als kalibrierte Schärfe je Größe (F_v(σ_post/σ_clima), an Fehler-Dezilen des Archivs geeicht), Einigkeit nur
  wo sie misst (Bewölkung: Atommasse; T/Td gegen die ungelernte Member-σ), Lage raus aus dem Produkt (Hinweise bleiben) ⇒ neue
  Nummer „buscosun Fusion 7" (Konvention: jede Kettenänderung = neue Nummer).
- **E-KF-2** Vorab minimal: V-KF-1 (Einigkeit bei `learned` gegen `m0.sigma`) und V-KF-2 (Bewölkung: Schärfe aus der größten
  Atommasse) beheben, mit Fixtures in `verify:pv-cube` Block 10; byte-gleich außer `confidence`; Vorher/Nachher mit
  `audit/fusion-konfidenz/conf-monotonie.mjs`.
- **E-KF-3** Wörter „hoch/solide/mäßig/unsicher" aus gemessenen Fehler-Quintilen (eine Tabelle im Motor, Provenienz `archive`),
  Dashboard/Panel/Bandbreite lesen dieselbe Tabelle (heute drei verschiedene Schwellensätze).
- **E-KF-4** Anzeige: Wort statt Prozentzahl in der Kachel, oder der erwartete Fehler in der Einheit („typisch ±0,8 °C").
- **E-KF-5** `score-archive.mjs` liefert die Konfidenz-Dezile mit (Gate: T/Td 0 Monotonie-Verletzungen).

Empfohlene Reihenfolge: E-KF-2 → E-KF-5 → E-KF-1/3 → E-KF-4.

**Stand nach Jans Freigabe (30.09. abends, „mach E-KF-2 bis E-KF-4 umsetzen") — umgesetzt, uncommitted (`audit/fusion-konfidenz.md` §8):**
- E-KF-2 ✓ (`MemberSigma.raw`, `cloudMixSharpness`), E-KF-3 ✓ (`src/pointForecast/fusion/confidenceClasses.ts`, Tabelle aus
  `audit/fusion-konfidenz/classes.json`), E-KF-4 ✓ (Kachel „‹Wort› · typisch ±x °C", Index im Tooltip; Zeitraumkopf, Tageskarten).
- Gates: `verify:dashboard` 80/80 · `verify:pv-cube` 397/398 (rot nur (35): der lokale Daten-Repo-Klon trägt seit Lauf `2026093015`
  nur Schema-6-Chunks, V-KF-9 — an HEAD gleich) · `verify:pv-fusion` 235/235 · `verify:point-client` 171/171 · Build 249/249 ·
  Budget totalJs 1512 → **1514** (Notiz in `budget.json`, Jans Regel vom 30.09.).
- **Jans Gates jetzt:** (a) Commit (Scope `fusion`/`dashboard`); (b) **Bezeichnung**: der Stand ist nach der Konvention nicht mehr
  „buscosun Fusion 6" (Kette in `confidence` geändert, Tabellen unverändert) — Vorschlag „buscosun Fusion 6.1"; (c) E-KF-1 und
  E-KF-5 bleiben offen; (d) V-KF-9 Verifier (35) auf Schema-Byte 5 filtern.
- Hinweis: der Arbeitsbaum trug parallel fremde uncommitted Änderungen (`fusion/output.ts`, `fusion/fuse.ts`, `scripts/fusionfit/*`,
  `audit/fusion-ausbau.md` — `priorShrinkWind`/`anchorWind`, Phase AX); die Gates liefen mit ihnen. Beim Aufräumen des Dev-Servers
  wurden alle `node.exe`-Prozesse beendet — falls dabei ein Lauf der anderen Sitzung abbrach, ist er neu zu starten.

## 30. Phase AX, 01.10. — „buscosun Fusion 7" gegen 6 gemessen, Archiv-Schema 4 (MOSMIX-S, INCA-Analyse)

Auftrag Jan 01.10. morgens: offene Kandidaten sichten, Messung 1 + 2 (Wind-Anker, Klimagitter) gegen Fusion 6 starten, parallel die
zwei Sammler-Zeilen bauen, und nachvollziehbar sagen, ob 7 besser als 6 ist. Alles in `audit/fusion-ausbau.md` §6i (Messung) und §6j
(Sammler); Karte `audit/fusion-ausbau/fusion7-vs-6.md`. **Uncommitted**, kein `src/`-Eingriff.

**Ergebnis in einem Satz:** Fusion 7 (= Fusion 6 + `anchorWindKm: 10`) ist nach der vorab eingefrorenen Regel **BESSER** — nirgends
signifikant schlechter, vier Tupel signifikant besser — aber der Gewinn ist klein: nur Wind/Böe in den ersten sechs Stunden an Punkten
ohne eigene Station (+0,5 %* / +0,6 %* MAE, 1,008 → 1,004 bzw. 1,213 → 1,206 m/s); mit Station byte-gleich. Das Klimagitter
(E-AX-9) bewegt in der Stufe fs **keine einzige** bewertete Zelle (V-AX-19) und gehört deshalb NICHT in Fusion 7.

**Deine Gates:**
- **(a) Push von `main` vor 23:10 UTC** (der Archiv-Cron klont `main`): damit schreibt der Slot heute Nacht Schema 4 mit der MOSMIX-S-Reihe
  (`stationsS`) und der INCA-Analyse (`incaAnalysis`, nur AT-Punkte). Jeder Tag ohne Push ist ein verlorener Messtag für E-AX-8 und
  E-AX-10. Trockenlauf grün, `verify:punktarchiv` 126/126, `verify:fusion-fit` 125/125. Slot wächst um ≈ 0,5 MiB gz.
- **(b) E-AX-14: `anchorWindKm: 10` in die Stufe fs einschalten = „buscosun Fusion 7"?** Mein Rat: ja, es kostet nichts und ist nirgends
  schlechter — aber sei dir bewusst, dass die neue Nummer dann für ein halbes Prozent in zwei Zellen steht. Alternative: den Anker mit dem
  nächsten echten Gewinn (ENS-Mittel, E-AX-6) zusammen schalten. Einschalten = Motor-Voreinstellung (`cubeSource.ts`, Stufe fs) ⇒ Client-Push.
- **(c) E-AX-9 `climaGrid`/`climaTrend`: NICHT einschalten** (V-AX-19; wirkt nur im Schwanz und in `climatologyOnly`-Schritten, nicht
  bewertbar). Wenn du den Prior-Gewinn willst, muss das Gitter in die Anomalie-Interpolation (AX-3) — eigene Etappe, Messung über
  stündliche Zeilen.
- **(d) Termine:** E-AX-6 (ENS-Mittel) ab ≈ 06.–14.10. messbar (erster Schema-6-Slot 30.09.), E-AX-8/E-AX-10 ab ≈ 15.10. (14 Schema-4-Tage),
  E-FS-3/E-AX-12/E-AX-13 ab ≈ 14.10. (30 Ausgabetage).
- **(e)** Commit-Scope `fusionfit`/`punktarchiv`.

**Stand nach Jans Freigabe (01.10. vormittags, „ja mach das, nenn es buscosun fusion 7") — umgesetzt, uncommitted (§6i.3):**
- E-AX-14 ✓: `anchorWindKm: 10` ist Teil der Stufe fs (`FUSION7_ANCHOR_WIND_KM` in `cubeSource.ts`), Verifier (29) erweitert;
  Definition „buscosun Fusion 7" in `CLAUDE.md` (Sprache & Konventionen). Gates: typecheck 0 · `verify:pv-cube` 399/399 ·
  `verify:point-client` 171/171 · `verify:fusion-fit` 125/125 · `verify:punktarchiv` 126/126 · Build 249/249 · Budget grün (eagerJs 108,6 / 108,7, totalJs 1512,7 / 1514, unverändert — die Konstante kostet < 0,1 KB).
- **Deine Gates jetzt:** (a) Push von `main` **vor 23:10 UTC** — damit zugleich Archiv-Schema 4 (§30 a) UND Fusion 7 live gehen
  (Deploy-Prüfung: Panel-Tab „Bandbreite" → Setzungen zeigt `anchorWind:set … 10 km` an einem Ort ohne eigene Station, z. B. einem
  Dorf; `?pflog=1` nennt die Stufen-Notiz „buscosun Fusion 7"); (b) Commit-Scope `fusion` („buscosun Fusion 7: damped wind anchor in
  stage fs (E-AX-14)") plus `fusionfit`/`punktarchiv`; (c) E-AX-9 bleibt aus (V-AX-19).

## 31. Phasen RK + NL — Ruckler der Karte nach dem Laden, Niederschlag lädt manchmal lange, 2026-10-01

Jans Befunde vom 01.10. Diagnosen und Gate-Belege: `audit/karte-ruckler.md` (§6), `audit/niederschlag-ladezeit.md` (§5).
Umgesetzt mit Jans Freigabe (RK-1, NL-1 + NL-2), **uncommitted**. Beide Phasen berühren nur eigene Dateien — sie lassen
sich getrennt von den parallel laufenden Fusion-Änderungen committen:

- RK: `src/sources/demGrid.ts` (neu), `src/fusion/elevation.ts` (nur ergänzt), `src/sources/iconD2TempSource.ts`,
  `scripts/verify-dem-build.mjs` (neu), `audit/karte-ruckler.md` + `audit/karte-ruckler/`
- NL: `src/sources/radarImg.ts`, `src/sources/radolan.ts`, `scripts/verify-radar-fallback.mjs` (neu),
  `audit/niederschlag-ladezeit.md` + `audit/niederschlag-ladezeit/`
- beide: `package.json` (zwei Verifier-Aliase), `budget.json` (totalJs 1 514 → 1 516 mit Notiz)

**Deine Gates:**
- **(a) Commit + Push + Deploy.** Vorschlag: zwei Commits — `perf(map): build the temperature DEM without blocking the
  main thread (RK-1)` und `fix(radar): deadline for pre-started fetches, raw.githubusercontent fallback per radar image
  (NL-1/NL-2)`. Deploy-Prüfung: Wetterkarte Wind öffnen — nach dem ersten Windbild kein 2-s-Stillstand mehr; Niederschlag
  über mehrere Minuten mehrfach kalt öffnen — in den Netzwerk-Tools erscheinen bei kalten jsDelivr-Dateien Abrufe an
  `raw.githubusercontent.com`, die Konsolenzeile nennt „Quelle Daten-Repo (PNG)". Notbremse: `?radarraw=0`.
- **(b) Real-Device:** Handy, Wetterkarte kalt — läuft der Wind nach dem ersten Bild ohne Stocken? (Emulation CPU 4×:
  7,7 s → 0,1 s.)
- **(c) E-RK-2:** Höhenbild einmal vorrechnen und ablegen (wie `hsurf-v1.png`, LE0-H1) — spart zusätzlich 90 Terrarium-Kacheln
  je Kaltstart. Ablage Daten-Repo oder `public/`?
- **(d) E-NL-2:** Warm-up der Radar-Bild-Slots im Spiegel-Workflow nach dem Push (V-FI-7) — Daten-Repo, erst wenn jsDelivr den
  neuen Commit auflöst.
- **(e) V-NL-4:** `radarraw` und `rvfmt` in die Sperrliste geteilter Links — braucht den Neubau des Edge-Bündels `og-meta`.
- **Hinweis:** auf der Maschine läuft seit 30.09. ein Vite-Dev-Server (PID 14356, ≈ 1 Kern Dauerlast) — nicht von dieser
  Sitzung, nicht beendet. Er verfälscht Leistungsmessungen; beenden, wenn er nicht mehr gebraucht wird.

## 32. Phase AX, 02.10. — INCA-Sammler-Fix, Niederschlagszellen im Scorer, „buscosun Fusion 8" gegen 7 (GLEICHSTAND)

Auftrag Jan 02.10. („lass uns das umsetzen und prüfen, ob buscosun Fusion 8 die 7er Version schlägt an den Stationen"); Befunde und Messung in
`audit/fusion-ausbau.md` §6k–§6l, Karte `audit/fusion-ausbau/fusion8-vs-7.md`.

**Stand (uncommitted):**
- **V-AX-20 behoben:** der INCA-Sammler bündelt die 84 AT-Punkte in 4 Anfragen (GeoSphere-Limit 5/s, 240/h), Frist 90 s, Fehlstatus benannt;
  live geprüft 84/84 Punkte, 420 Zeilen, 11,5 s. Motor: `fetchIncaAnalysisObsBatch`, `incaAnalysisUrl`, `incaObsOf(…, featureIndex)`.
- **Scorer:** Brier, BSS, Reliability, POD/FAR/Frequenz-Bias als Niederschlagszellen (`stack-score.mjs`, `--precipTable`), Kandidat `fusion8`.
- **„buscosun Fusion 8" (= 7 + nachkalibrierte Regenwahrscheinlichkeit): GLEICHSTAND, 0 von 24 Tupeln besser, K12/K13 rot ⇒ NICHT
  eingeschaltet.** Option `FuseCubeOptions.precipCal`, Leser `precipCalPoint.ts`, Tabelle `precipCal.ts`, Pfad `point/precip-cal.client.json`,
  Extractor-Variante F8 sind gebaut und voreingestellt aus (nichts im Daten-Repo, nichts in der Stufe fs). Fusion 7 bleibt der Stand.
- **V-AX-23:** der Radar-Member bei 1–2 h ist als Einzelframe schwach (POD 0,37); Stundenmittel POD 0,49 / FAR 0,47 ⇒ nächster Kandidat (Motor,
  Neu-Extraktion, eigene eingefrorene Regel).

**Deine Gates:**
- (a) **Push von `main` vor 23:10 UTC** (Scope `punktarchiv`/`fusion`: „archive: batch INCA analysis requests (V-AX-20), precipitation cells
  in the stack scorer, precipCal option (off)") — damit der heutige Archiv-Slot INCA an allen 84 AT-Punkten trägt. Prüfung morgen früh im Slot
  `2026-10-02/23xx.json.gz`: `incaAnalysis.stats.withRows` = 84, `requests` 4, `httpErrors` 0.
- (b) E-AX-15: Fusion 8 als Nachkalibrierung nicht einschalten (Empfehlung); Wiederholung ab ≥ 30 Ausgabetagen (≈ 15.10.), dann je Land.
- (c) **erledigt (Jan 02.10. „mach das"):** Kandidat B Radar-Stundenmittel gebaut (`FuseCubeOptions.nowcastHourMean`, aus) und nach vorab
  eingefrorener Regel gemessen (§6l.4/§6l.5, `audit/fusion-ausbau/fusion8b-radar-vs-7.md`): **GLEICHSTAND** — 1 von 4 primären Tupeln
  signifikant besser (L Brier Radarstunden +11,1 %*), das zweite bei p 0,055; nirgends schlechter, K11/K14/K16 grün; DE Treffer 0,33 → 0,52.
  Empfehlung: nicht einschalten, Wiederholung mit derselben Regel ab ≥ 30 Ausgabetagen (≈ 15.10.).
- (e) **erledigt (Jan 02.10. „E-AX-16 sofort, über buscosun-data"):** der Radar-Spiegel schreibt je RV-Slot ein Stundenmittel-Bild je voller Stunde
  (`m<lead>.png`, RGB-Summenbild, exakt; `audit/fusion-ausbau.md` §6m, `audit/radar-datenrepo.md` §15), der Client liest es hinter
  `nowcastHourMean`/`?hm=1` (aus). Am Live-Slot geprüft: |Δ| 0 an 626 Vergleichen, Frames byte-gleich, Browser-Dekoder byte-gleich. **Im Daten-Repo
  ist nichts zu ändern** — Workflow und Spiegelskript bleiben, der Job klont `main` von buscosun-web beim Start.
- (f) **Push von `main`** (Option aus, Derive mit Stundenmittel, Verifier, Doku; Scope `fusion`: „fusion: radar hour-mean as mirror product (E-AX-16), reader/engine option nowcastHourMean (off), radar-hour cells in the stack scorer"). Damit das Produkt heute noch entsteht: nach dem Push den laufenden Job `radar` im Daten-Repo abbrechen (Actions → radar → Cancel) — der Nachfolger klont den neuen Stand und schreibt ab dem nächsten Slot `m<lead>.png`; ohne Abbruch beim nächsten Jobstart (Kette ≈ 5 h 45).
- (g) **Prüfung nach dem ersten Job:** `radar/img/v1/rv/<stamp>/meta.json` trägt `hourMeans` mit zwei Einträgen (bei Slotminute ≥ :30 der zweite mit
  < 12 Frames), `status.json` `deriveMs` für rv (lokal 3,3 s); im Browser `?hm=1&pflog=1` an einem DE-Ort: Notiz „nowcastHourMean: … N Stunden
  vorgemittelt gelesen" mit N ≥ 1 und Member `hourMean.mirror`. Ohne `?hm=1` bleibt alles byte-gleich.
- (h) **E-AX-17 entschieden (Jan 02.10. 22:30 UTC: „sofort aktiv schalten … ab jetzt buscosun Fusion 8"):** umgesetzt — die Stufe fs trägt das
  Radar-Stundenmittel (`FUSION8_NOWCAST_HOUR_MEAN`), der Browser liest es standardmäßig, `?hm=0` ist der Rückfall auf Fusion 7. Grundlage: Karte auf
  allen Slots bis 01.10. (15 Ausgabetage, `audit/fusion-ausbau/fusion8b-radar-vs-7.md` §Zwischenstand): BESSER nach §6l.4 — S Brier Radarstunden
  +9,8 %*, L +11,8 %*, 0–6 h +2,7/+3,1 %*, nirgends schlechter, K11/K14 grün, DE Treffer 0,33 → 0,52; benannt als Zwischenstand (ein Regentag mehr hob
  p 0,055 auf 0,021). **Deployment-Reihenfolge ist unkritisch:** bis der Spiegel-Job `m<lead>.png` schreibt, rechnet der Client exakt Fusion 7
  (verify:pv-cube 41). Push (f), Job-Abbruch und Prüfung (g) wie oben; die Wiederholung ≈ 15.10. bestätigt die Effektgröße.
- (d) E-AX-10 (INCA-Anker-Gewicht) wird ab dem ersten vollständigen Slot messbar; Scorer-Variante folgt mit E-AX-8 (MOSMIX-S) ≈ 15.10.

## 33. Phase RR — Regenradar auf der Karte der Wetterkarte und den Daten aus buscosun-data, 2026-10-03

Auftrag Jan 03.10. (Kickoff `prompt-regenradar.md`, Entscheidungen E-RR-1…3 am selben Tag); Diagnose, Umsetzung und Gate in
`audit/regenradar-datenangleich.md` (§1–§2.7 Befund und Datenwege, §5.1 Gate GRR, §9 Umsetzung, V-RR-1…15).

**Stand (uncommitted, nichts gepusht, nichts gepurgt, Daten-Repo unberührt):**
- `/regenradar` zeichnet auf `MapView` mit dem neuen Profil `radar` (positron, nur Niederschlag, Zellbahnen, Blitze, Schnee,
  Schneefallgrenze der Wetterkarte); Zeit, Rückblick und Frame-Morph kommen aus dem Radar-Stack des Decks. Die alte Karte
  bleibt hinter **`?rr=legacy`** (und als automatischer Rückfall, falls der Karten-Chunk nicht lädt).
- Der Punkt-Streifen rechnet auf **buscosun Fusion 8** — dieselbe Kette wie Punkt-Panel und Dashboard; **`?pf=live`** ist
  der Rückfall auf den Live-Pfad. Live gehen nur die Messungen des Landes (BrightSky / TAWES / SMN), Terrarium und WorldCover.
- Gate GRR bestanden mit einer Einschränkung: das Einschalten der Schneefallgrenze friert einige Sekunden ein — dieselbe
  Rechnung wie in der Wetterkarte (V-RR-15). Wetterkarte ohne Profil pixelgleich zu HEAD.
- Geänderte/neue Dateien: `src/MapView.tsx` (nur hinter `profile`), `src/map/mapProfile.ts` (neu), `src/scalar/precipComposite.ts`
  (`rvPast`, ohne das Feld byte-gleich), `src/nowcast/{NowcastRadarMap,NowcastDeck,NowcastPage,nowcastEngine,nowcastModel,nowcastView}.ts(x)`,
  `src/radar/radar.css`, `budget.json` (totalJs 1520 → 1523 mit Notiz), `package.json` (Alias `verify:regenradar-profile`),
  `scripts/{verify-regenradar-profile,regenradar-netcapture,regenradar-wk-pixeldiff}.mjs` (neu), `audit/regenradar-datenangleich.md`,
  `CLAUDE.md`. Der Arbeitsbaum enthält daneben Dateien der Startseiten-Phase RI1 (`SearchPage.*`, `*Icon.tsx`) — nicht Teil von RR.

**Deine Gates:**
- (a) **Real-Device** (iPhone 12 Pro oder Android über scrcpy), Produktions-Build: `/regenradar/muenchen` — Abspielen 30 s,
  Schritt zurück (Rückblick lädt), Zellbahnen an einem Gewittertag (Steckbrief per Antippen), **Schneefallgrenze einschalten**
  (wie lange friert es ein?), Bildrate gegen `/regenradar/muenchen?rr=legacy`. Emulation ist für WebGL nicht repräsentativ; die
  Headless-Zahlen stehen in §5.1.
- (b) **Durchsicht** von Karte und Deck (Desktop + mobil), dann Commit von RR als eigener Commit (Scope `regenradar`, z. B.
  „regenradar: draw on the Wetterkarte map (MapView radar profile), strip on buscosun Fusion 8, ?rr=legacy fallback") — ohne
  die RI1-Dateien; danach Push/Deploy wie üblich.
- (c) **V-RR-9 — erledigt 03.10. (Jans Freigabe „ja fix es"), geht mit dem RR-Commit mit:** Absicherung an Zellbahnen,
  Hagel DE/CH und Warnungen; HEAD 4/4 Abstürze, Fix 0/4 (Beleg `audit/regenradar-datenangleich.md` V-RR-9). Ursprünglicher Text:
  **V-RR-9 entscheiden — hohe Priorität, schon in Produktion:** Verlassen der Wetterkarte mit aktiven Zellbahnen (Rail →
  andere Ansicht) endet in der React-Router-Fehlerbehandlung (`getSource` auf entfernter Karte; an HEAD `07cc7cf` reproduziert).
  Abhilfe ist eine Zeile in `MapView` ohne neue Prop (`if (mapRef.current === map)`), Pixel unverändert — ich habe sie nur im
  Profil gesetzt, weil die RR-Regel `MapView` außerhalb neuer Props sperrt. Freigabe ⇒ eigener kleiner Fix (Hagel/Warnungen mitprüfen).
- (d) **V-RR-15 entscheiden:** Schneefallgrenze (ML #2) in einen Worker verlegen — wirkt in Wetterkarte und Regenradar, ändert
  `MapView` ohne neue Prop.
- (e) Optional V-RR-13 (ICON-D2-Niederschlag in beiden Karten nicht mehr laden, solange ihn nichts zeichnet), V-RR-14 (`MapView`
  für `/regenradar` vorladen), V-RR-12 (Zellbahnen im Rückblick zur Zeit), V-RR-5 (Warm-up im Spiegel, E-NL-2 — Daten-Repo).
- (f) Hinweis ohne Handlungsbedarf: das Radar-Stundenmittel `m<lead>.png` liegt schon im Spiegel (Slot `2610031040`) — der
  Streifen rechnet bereits Fusion 8. `verify:dashboard-switch` (B) und `verify:point-client` (10s) scheitern an HEAD genauso
  (nicht RR).

## 34. Phase AW — Autobahnwetter (Fahrbahn gemessen DE), 2026-10-03

**Nachtrag 04.10. — AW-6.1 Streckenprognose (`audit/autobahnwetter.md` §14):** läuft ohne dein Zutun (Workflow
`road-fc.yml` im Daten-Repo, stündlich; Archiv-Schritt in `road-archiv.yml`). Für dich:
- **(h) ansehen:** Störung beim ersten Push (§14.5) — 62 s alter Radar-/Straßen-Stand auf `main` des Daten-Repos, zurückgesetzt.
  Falls ein Radar-Slot um 09:00 UTC am CDN hängt: Purge ist dein Gate.
- **(i) E-AW-17 bestätigen:** Lage der Achspunkte aus OpenStreetMap (ODbL, Nennung im README und in `points.json`). Ohne OSM
  lägen die Punkte bis 224 m neben der Fahrbahn (`--no-snap` baut sie auf der BKG-Achse).
- **(j) E-AW-23 entscheiden:** Archiv der Stationsprognosen ≈ 2,1 MB/Tag (≈ 0,8 GB/Jahr) — so lassen oder kürzen.
- **(k) V-AW-20:** beim DWD nachfragen, warum die Ordner `LW`/`SD` (Baden-Württemberg) leer sind.
- **(l) erledigt 04.10.:** Anzeige der Prognose auf der Seite (AW-6.1b, §15). Für dich: am Handy ansehen
  (`/autobahnwetter/a8-4` = Stuttgart, dort gibt es nur Prognosepunkte), E-AW-24…28 bestätigen oder ändern (Luft-Stufen
  0/+3 °C, Niederschlags-Marke ab 50 %, Karte bleibt Messung). Danach V-AW-21 (SWIS-Luft als Anker).
- **(n) E-AW-30 — Messungs-Anker einschalten (V-AW-21, Audit §16):** gebaut und gemessen, steht auf AUS. Mit der
  eigenen Luftmessung der Station ist die Prognose dort bei +1 h um 40 % genauer, bei +3 h um 12 %; Preis: Prognosen
  aus der Messung um Sonnenaufgang sind 3–6 h später ≈ 0,05 K schlechter (deshalb hat meine Vorab-Regel nicht
  bestanden). Empfehlung: einschalten. Dein Wort genügt — dann setze ich `ROAD_FC_ANCHOR_MODE = 'stations'` in
  `src/road/roadFc.ts` und pushe; der nächste Job rechnet damit. Zurück: `'none'` oder `ROAD_FC_ANCHOR: none` als
  `env` in `road-fc.yml`.
- **(o) E-AW-31 — Wind an den Stationen verankern?** Böe bei +1 h 38 % näher am Sensor, aber die Masten messen nicht
  in 10 m: die Zahl hieße dann „Wind an der Messstelle". Gebaut, aus.
- **(p) für die Fusion-Linie:** V-AW-32 (Versatz um Sonnenaufgang klingt zu langsam ab) und V-AW-33 (Messung wird mit
  dem Modellwert bis 30 min daneben gepaart — am Nachmittag fiel der Anker-Gewinn von 30 % auf 1 %) betreffen auch
  den Anker im Browser. Beides wäre ein Eingriff in buscosun Fusion.
- **(q) V-AW-30 — Stationslage (du kümmerst dich, 04.10.):** die Liste liegt in `audit/autobahnwetter/stationslage.md`
  (185 Stationen, weiteste zuerst, je Lage ein Kartenlink) und als `stationslage.csv`. Neu erzeugen:
  `node scripts/road/road-station-positions.mjs --data=<Klon von buscosun-data> --md=… --csv=…`. Sag mir je Station (oder
  als Regel), welche Lage gilt — dann trage ich sie in den Katalog bzw. die Prognosepunkte ein.
- **(r) V-AW-31 erledigt:** der Job rechnet und committet nicht mehr, wenn der jüngste Lauf dieselbe Stunde und dieselben
  Eingaben hatte (Log „kein neuer Lauf — …"). Ein Start von Hand rechnet immer.
- **(m) E-AW-29:** der Job `road-fc` läuft zusätzlich nach jedem `point`-Lauf, weil GitHub den Zeitplan am 04.10. nicht
  startete (Daten-Repo `7374e46`). Wenn dir das zu oft ist: die drei Zeilen `workflow_run` in `road-fc.yml` entfernen.
- Aus: Repo-Variable `ROAD_FC=0` im Daten-Repo. Prüfen von außen:
  `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/road-fc-check.mjs --files=all`.

Auftrag Jan 03.10. (Kickoff AW-0…AW-5, AW-6 nicht). Befunde, Belege und Messwerte: `audit/autobahnwetter.md` (§0 Kurzfassung).

**Stand:**
- **Auf `main` von buscosun-web (gepusht, für Nutzer unsichtbar):** `a2bb63a` Datenlinie (Decoder, Vertrag, Ableitung, Spiegel-Haken,
  Katalog, Korridor-Bauer, README-Vorlage, drei Verifier), `691113c` Klassenspalte im 24-h-Ring + Exportform (E-AW-6, nur vorbereitet),
  `2687a61` Wächter R1–R4, `45f12dd` + `ef6d7af` Fixes der Gesamtprüfung (DWD-Zeitlimits im Spiegel, Status über die Job-Naht, Wächter
  R2/R3/R5, Korridor-Achsen ohne Schleifen) — **wirksam im Spiegel ab dem nächsten Jobstart (≈ 18:35 UTC)**.
- **Im Daten-Repo (gepusht nach Protokoll, nie force):** `cb20f86` README-Abschnitt „Straßenwetter — road/", `scripts/radar-mirror.mjs`
  mit drei Haken, `road/v1/static/stations.json` + `corridors.json`; `bef7411` und `e9ef1f0` Korridor-Titel, `0e801f2` bereinigte
  Korridor-Achsen (A 8 161,3 → 128,7 km). jsDelivr für die geänderten `road/`-Dateien gepurgt. Workflows unverändert. Nach dem
  Force-Push der Kartenlinie (13:07 UTC) geprüft: alles noch da.
- **Schattenbetrieb:** der Radar-Spiegel klont `main` von buscosun-web bei jedem Jobstart und schreibt seither je 15-min-Slot `road/v1/`
  (Belege der ersten Slots: Audit §5). Seit dem Flag (03.10. abends) liest `/autobahnwetter` die Daten für alle.
- **AW-4/AW-5 seit 03.10. abends auf `main`** (Zweig `feat/autobahnwetter` gemergt, Audit §11): Kachel, Route, Rail, ⌘K, Aliase und Seite.
  **Flag `ROAD_LIVE` seit 03.10. abends an** (dein „ja", Audit §13): für alle sichtbar; `?road=0` blendet je Besucher aus; zurück für alle mit
  `ROAD_LIVE = false` in `src/road/roadFlag.ts` + Push.

**Deine Gates:**
- ~~**(a) E-AW-14 — Edge-Bündel `og-meta`**~~ — erledigt 03.10. mit deinem Ja (`npm run edge:share`, gleich dem Patch, `verify:share` 528/528).
- ~~**(b) E-AW-16 — Wächter**~~ — erledigt 03.10.: `health.yml` gelöscht („wird nicht mehr verwendet"). Damit prüft **kein Zeitplan** mehr die
  Straßen-Ableitung (V-AW-19); Handlauf: `node scripts/health-manifests.mjs --url https://buscosun.com` (R1–R5; H2/H3 bleiben rot). Vor Gate C
  entscheiden, ob ein schlanker Straßen-Wächter (stündlich, nur R1–R5) zurückkommt.
- **(c) Gate B nach 7 Tagen Schatten (≈ 10.10.):** Anteil freigegebener Slots, Ankunft gegen Frist, Bilanz je Regel — aus dem Archiv
  (`buscosun-archiv` `road/v1/<Tag>/slots.json` und Halbtage), Stichproben V-AW-5/6, Push-Last (V-AW-10), Radar ohne Rückschritt (Spiegel-Takt).
  Vorlage: Audit §5.
- **(d) Kalibrierung nach ≥ 14 Tagen (≈ 17.10.):** Startwerte der Beobachtungsregeln (`jump`, `neighbours`, `roadAir`, `catalog`, `cube`) aus
  der Quarantäne der Archiv-Halbtage; entscheiden, welche hart werden.
- **(e) Gate C — Rest:** das Flag ist seit 03.10. an (vor Gate B/C). Offen: Real-Device (V-AW-13: Handy, Karte, Blatt, Auswahl), feiner
  Wächter (V-AW-19), Sitemap + die 20 Autobahn-Unterseiten + `index` statt `noindex` (V-AW-8), E-AW-15 Vorschaukarte.
- ~~**(f) E-AW-13**~~ — erledigt 03.10. („so voreinstellen wie vorgeschlagen"): kritischste Klasse zuerst (Glätte, Frost, Nässe), bei Gleichstand
  die kälteste Fahrbahn (`defaultRoadStation`, `verify:road-ui` 39/39).
- ~~**(g) Archiv-Freigabe**~~ — erledigt 03.10. („ja mache"): **AW-6a** Tagesablage in `buscosun-archiv` unter `road/v1/` (Halbtage mit Verlauf + Quarantäne,
  Slot-Protokoll), Workflow `road-archiv.yml` alle 3 h, ≈ 0,47 MB/Tag (Audit §12). Ab da sammeln sich die Daten für Gate B und die Kalibrierung.
  Der Job wird rot (Mail), wenn der jüngste Ring > 3 h alt ist und kein Kill-Schalter gesetzt ist. Offen bleibt AW-6 selbst: Prognose +1/+3/+6 h mit
  Backtest (Gate D, frühestens Dezember).
- **(h) V-AW-4:** P758 (A 94) mit Katalog-Koordinaten reparieren — Datenänderung, nur mit deinem Ja.
- **Hinweis Arbeitsbaum:** nach dem Merge vom 03.10. vor dem nächsten eigenen Commit `git pull` im Haupt-Arbeitsbaum, falls er noch hinter
  `origin/main` steht.

## 35. Phase NP-0a — Rückblick 2 h + Blitz-Spiegel im Radar-Spiegel, 2026-10-03

Auftrag Jan 03.10. (Kickoff `prompt-np0.md`), Entscheidungen E-NP0-1…8 am 03.10. (jeweils die Empfehlung). Befunde, Belege und
Messwerte: `audit/np0-datenprodukte.md` §8 (Diagnose §8.1, Umsetzung NP-0a §8.5, Gate §2.4). Keine Oberfläche — sichtbar wird es
erst mit NP-1.

**Stand (`66f489c` auf `origin/main`; Kern im Daten-Repo `04cb861`):** Vertrag `src/sources/radolanRuns.ts` (Rückblick: `RV_PAST_KEEP`, `RADAR_PAST_WINDOW_MS`,
`rvPastDir`, `rvPastEligible`), `src/sources/radarImg.ts` (`RADAR_IMG_KEEP`), neu `src/sources/lightningImg.ts` (Blitz-Vertrag),
`src/point/nowcastFormat.ts` (rzc hält 24 Slots — Text im Punkt-Manifest), neu `scripts/lib/tiff.mjs`, neu
`scripts/lightning/lightning-mirror.mjs` + `lightning-derive.mjs` (Haken nach dem road-Muster), Kern
`scripts/radar-mirror/radar-mirror.mjs` (Retention je Quelle, rv-past-Kopie, Blitz-Haken, `.tmp-`-Reste, `status.json` Schema 3),
README-Vorlage, neu `verify:np0-radar`. Die road-Zeilen im Kern sind unverändert (E-NP0-7).

**Deine Gates:**
- **(a) Durchsicht** des Commits `66f489c` („feat(radar-mirror): 2-h look-back and lightning mirror as values (NP-0a)"), dann
  **Push `buscosun-web`** — der Spiegel klont `src/` und `scripts/` (Haken, Derive, Vertrag) beim Jobstart von `main`.
- ~~**(b) Kopie des Kerns ins Daten-Repo**~~ — **erledigt 04.10. 20:43 UTC** auf Jans Auftrag („alle notwendigen Änderungen im
  buscosun-data"): Daten-Repo-Commit `04cb861`; vorher geprüft, dass die Daten-Repo-Fassung byte-gleich (CRLF-normalisiert) zur
  Vorlage vor NP-0a war, nachher byte-gleich zur Vorlage auf `origin/main`; nie force. Wirksam ab dem nächsten Radar-Jobstart
  (laufender Job seit 17:41 UTC ⇒ Übergabe ≈ 23:26 UTC). Ursprünglicher Text:
  `scripts/radar-mirror/radar-mirror.mjs` → `buscosun-data/scripts/radar-mirror.mjs`. Vorher
  `git pull` im Daten-Klon und `diff` der Daten-Repo-Fassung gegen `git show <NP-0a-Commit>~1:scripts/radar-mirror/radar-mirror.mjs`
  (CRLF-normalisiert): muss leer sein — sonst hat die Autobahnwetter-Linie dort inzwischen etwas geändert, dann erst zusammenführen
  (V-NP0-5). Commit + Push ins Daten-Repo nach Protokoll (nie force). **Workflow unverändert** (die neuen Variablen haben
  Voreinstellungen im Skript), **README nicht kopieren** — die Kartenlinie legt sie aus der Vorlage im Web-Klon selbst aus.
  Reihenfolge (a)/(b) ist egal: ohne neuen Kern lädt niemand den Haken; ohne Web-Push fehlt das Modul und die Blitze bleiben aus.
- **(c) EUMETSAT-Attribution prüfen (1 Minute, V-NP0-10):** den Wortlaut „Contains modified EUMETSAT Meteosat data 2026 …" in
  `src/sources/lightningImg.ts` gegen das Policy-PDF (<https://www-cdn.eumetsat.int/files/2026-01/45173%20-%20Data_Policy.pdf>)
  halten — er stammt aus dem Suchindex, das PDF war maschinell nicht lesbar.
- **(d) Wirksam ab dem nächsten Jobstart** (der laufende Job liest Skript und Klon nur beim Start): Nachfolger abwarten (≤ 5 h 45)
  oder den Lauf abbrechen und `radar.yml` selbst auslösen. Im Log der ersten Zeile: `Rückblick 24 · Blitze an`.
- **(e) Nach ≥ 2 h:** `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-np0-radar.mjs --live`
  (direkt, `npm run` schluckt `--`-Argumente): rv-past/rzc/konrad3d/Blitze je ≈ 24 Slots, Metas bestehen den Prüfer, RV-Lag aus
  `status.json` (Median ≤ 12 s, max ≤ 30 s). Danach `LIGHTNING_GATE_MS` (25 min) mit den Live-Lagen nachschärfen (§8.5).
- **(f) Rückweg:** im Workflow `radar.yml` unter `Mirror.env` `PAST_KEEP: '12'` (kein rv-past, rzc/KONRAD wieder 12) und/oder
  `LIGHTNING: '0'` (keine Blitze) — nächster Jobstart baut den Stand vor NP-0a, Altbestand fällt mit dem ersten Push weg
  (Lokaltest Lauf D). Client-seitig später `?ltg=0`.
- **(g) V-NP0-17 an die Fusion-Linie** (nicht NP-0): am Archiv ist K-2 allein 0,5–4,8 % Brier besser als mit gelernter Hürde —
  Wiederholung mit ≥ 30 Ausgabetagen und vorab eingefrorener Regel, ändert buscosun Fusion ⇒ dein Gate.

## 36. Phase NP-0b — Kartenfelder aus dem Punkt-Cube (`point/field/v1/`), 2026-10-04

Auftrag Jan 03.10. (Kickoff `prompt-np0.md`), Entscheidungen E-NP0-4 (F1) und E-NP0-5 ((a) + (b)) am 03.10. Befunde, Belege und
Messwerte: `audit/np0-datenprodukte.md` §8.6 (Gate G-NP0b). Keine Oberfläche — sichtbar wird es erst mit NP-2.

**Stand (Jans Commit `2aa82b4` auf `origin/main`; `point.yml` im Daten-Repo `04cb861`):** Vertrag `src/point/fieldFormat.ts`, Producer `scripts/point/build-point-fields.mjs` +
`fieldStore.mjs`, Publisher (Feld-Aufbewahrung + Index), `cdnSync.mjs` (Klassen, t1-Messwert 16,5, `FIELD_END_MIN_BY_TIER`),
`sparseCover.mjs` (Job-Timeouts), Vorlage `scripts/repack-repo/workflow-point.yml`, README-Vorlage, `verify-point-data.mjs`
(`JOB_MAX_MIN.t1` 24, Regel F′), neu `verify:np0-fields`. buscosun Fusion unverändert (nur aufgerufen).

**Deine Gates:**
- **(a) Durchsicht + Commit** (Scope `point`), z. B. „point: map fields from the cube (Modell · Cube) — chance, amount, q90 and snow
  line per tier (NP-0b)". Wieder auf die Autobahnwetter-Sitzung im selben Arbeitsbaum achten. **Push `buscosun-web`** — der
  Punkt-Cron klont den Producer bei jedem Job von `main`.
- ~~(a) Commit + Push~~ — erledigt (Jans Commit `2aa82b4`, auf `origin/main`). ~~**(b) Kopie der Workflow-Vorlage**~~ —
  **erledigt 04.10. 20:43 UTC** im selben Daten-Repo-Commit `04cb861` (vorher byte-gleich zur Vorlage vor NP-0b). Erste Läufe
  mit Feldern: t3 21:55, t2 22:30, t1 22:40 UTC. Ursprünglicher Text:
  `scripts/repack-repo/workflow-point.yml` → `buscosun-data/.github/workflows/point.yml`
  (Nutzer-Token). Neu darin: „Job-Start merken", `public/climaGrid.json` im Sparse-Klon, der Schritt „Build map fields — tX
  (NP-0b)" in t1/t2/t3. Reihenfolge: **erst (a), dann (b)** — ohne Web-Push überspringt der Schritt sich selbst (`test -f`), mit
  Web-Push und alter Vorlage passiert nichts. README nicht kopieren (die Kartenlinie legt sie aus).
- **(c) Nächste Slots abwarten** (t1 `:40`, t2 `:30`, t3 `:55`) oder `point.yml` mit `tiers=t1` auslösen. Im Job-Log des Schritts:
  „… Niederschlags-, … Schneefallgrenzen-Felder, … s". Die erste Runner-Zeit für t1 entscheidet, ob t1 jeden Lauf ein Feld
  bekommt (≤ 300 s) oder jeden zweiten (V-NP0-23); `point/field/v1/budget.json` hält es fest.
- **(d) Live-Prüfung je Stufe:** `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-np0-fields.mjs --live`
  (direkt, `npm run` schluckt `--`-Argumente) nach je einem t1-, t2- und t3-Lauf.
- **(e) Rückweg:** in der Vorlage/im Workflow `POINT_FIELDS: '0'` — der Schritt tut nichts, der Publisher baut `point/field/` beim
  nächsten Lauf jeder Stufe ab. `JOB_MAX_MIN.t1` 24 ist nur eine Planungsgrenze im Verifier.
- **(f) V-NP0-25:** ein t2-Job maß am 02./03.10. 19,3 min (über der Planungsgrenze 15) — unabhängig von NP-0b; Ursache klären, bevor
  eine Grenze geändert wird.

## 37. Archiv — Wahrheits-Nachtrag 03.10. (SMN), 2026-10-04

Kontext: `audit/fusion-implementierung.md` §9.18. Der Nachtrag `2026-10-03/truth-smn.json.gz` liegt auf Jans Auftrag schon im Archiv
(`buscosun-archiv` `09385e5`, händisch gepusht). Offen:

- **(a) Push von `buscosun-web/main`** mit `scripts/punktarchiv/{collect.mjs,truth-supplement.mjs,lib/punktarchiv.mjs,lib/truth.mjs}`,
  `scripts/fusionfit/{lib/archiveAdapter.mjs,score-archive.mjs,stack-extract.mjs}`, `scripts/verify-punktarchiv.mjs` — am besten vor 23:10 UTC,
  sonst stempelt der Archiv-Cron einmal ohne `supplements`-Eintrag (harmlos, Datei bleibt). `verify:punktarchiv` 141/141 vorher.
- **(b) V-FI-111:** Nachtrag künftig automatisch (Workflow-Schritt) oder nur von Hand? **V-FI-112/113** ansehen.

## 38. Phase FR — Register der Stände von buscosun Fusion, 2026-10-05

Kontext: `audit/fusion-release.md`. Umgesetzt und lokal geprüft (`verify:fusion-release` 11/11, `verify:pv-cube` 421/421, `verify:road-fc` 90/90,
`verify:np0-fields` 29/29, `verify:road-ui` 55/55, Build 252/252). Offen:

- **(a) Commit + Push von `buscosun-web/main`.** Danach ohne weiteres Zutun: der nächste `road-fc`-Job (stündlich, klont `main`) baut einmal
  neu, obwohl Stunde und Eingaben gleich sein können (Grund im Log: „buscosun Fusion 8 → buscosun Fusion 9“), und schreibt
  `engine.name: buscosun Fusion 9`, `engine.version: 9`; der nächste Punkt-Cron schreibt den Stand ins Manifest der Kartenfelder.
- **(b) Kontrolle nach ≈ 1 h:** `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-fusion-release.mjs --live`
  — nennt je Datenprodukt den Stand im Daten-Repo („nachgezogen“ oder „zieht beim nächsten Lauf nach“).
- **(c) E-FR-1 ansehen:** `road/fc` und die Autobahnwetter-Seite heißen dann „buscosun Fusion 9 … ohne Messungs-Anker“ (Rechnung unverändert).
- **(d) V-FR-1:** Kopfkommentar der Vorlage `scripts/road/workflow-road-fc.yml` (und der Kopie im Daten-Repo) nennt noch „Fusion 8“ — nur Kommentar.
- **(e) totalJs-Grenze:** siehe `audit/fusion-release.md` §6.

## 39. Phase PA5 — Punktarchiv: Eingabe-Punkte und 2×2-Block (Archiv-Antrag des Prüfstands), 2026-10-05

Kontext: `audit/punktarchiv-erweiterung.md` (§7), Entscheidungen E-PS-11/E-PS-12 in `audit/pruefstand-plan.md` §9. Umgesetzt und lokal geprüft
(`verify:punktarchiv` 162/162, `verify:fusion-fit` 131/131, zwei volle Probeläufe mit 1 025 Punkten). Im Archiv- und im Daten-Repo ist nichts geändert.

- **(a) Commit + Push von `buscosun-web/main` VOR 23:10 UTC** — der Archiv-Cron klont `main`; ab diesem Slot Schema 5 (≈ 37 MB statt 13 MB).
  Jeder Tag ohne Push ist für die 620 neuen Stationen verloren.
- **(b) Nach dem ersten Slot:** Laufzeit des Jobs in Actions (Limit 60 min; lokal 37,5 min, auf dem Runner geschätzt 15–25 min, ungemessen) und
  `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/punktarchiv/check-slot.mjs C:/dev/buscosun-archiv/<Tag>/<HHMM>.json.gz`
  nach `git pull --ff-only` im Archiv-Klon (innerhalb ≈ 8 h, solange der t1-Lauf im Daten-Repo liegt).
- **(c) Rückweg**, falls der Job das Limit reißt: in `.github/workflows/punktarchiv.yml` des Archiv-Repos `--no-extra` an den Sammler-Aufruf hängen.
- **(d) Entschieden (Jan 05.10.):** E-PA5-1 nicht · E-PA5-2 machen (eigener Schritt nach dem ersten Slot) · E-PA5-3 vorerst so lassen · E-PA5-4 jetzt.
- **(e) Nachtrag Niederschlagsstationen (E-PA5-4, `audit/punktarchiv-erweiterung.md` §8):** der Slot hat jetzt 2 069 Punkte und **≈ 60 MB**
  (21,9 GB/Jahr). GitHub warnt ab 50 MB je Datei, die harte Grenze ist 100 MB. Laufzeit auf dem Runner ungemessen (lokal 17,5 min).
  Rückweg in zwei Stufen im Workflow des Archiv-Repos: `--no-precip-only` (zurück auf 620 Eingabe-Punkte), dann `--no-extra`.
- **(f) Offen:** E-PA5-3 Ablage (Jan überlegt), E-PA5-5 Cube-Pfad-Ausgabe an allen 405 Katalogpunkten (+14 MB je Slot) oder als Stichprobe (§9).

## 40. Phase PS — Prüfstand PS-1 … PS-4 gebaut, 2026-10-06

- **(a) Durchsicht + Commit (Scope `pruefstand`):** `scripts/pruefstand/**`, `src/pruefstand/**`, `scripts/verify-pruefstand.mjs`,
  `package.json` (Alias `verify:pruefstand`), `.claude/skills/pruefe-fusion/SKILL.md` (nur diese Datei aus `.claude/` — `settings.local.json`
  bleibt lokal), `audit/pruefstand/**` (README, Rangliste, Berichte 05.10., Rundlauf- und Treue-Belege, ≈ 8 MB; V-PS-16),
  `audit/pruefstand-plan.md` §14.15–§14.20, diese Datei, CLAUDE.md. Gates: `verify:pruefstand` 60/60, typecheck 0, Build 252/252,
  Budget unverändert. Große Daten liegen außerhalb des Repos in `C:\dev\buscosun-pruefstand\` (W1 288 MB, Rohdaten 2,4 GB,
  Konserven 12 GB, Tabellen, Worktrees) — nicht committen, bei Bedarf sichern (V-PS-7).
- **(b) Auslegungen bestätigen (Plan §14.19, R-1 … R-10):** jede ist als `set` in `scripts/pruefstand/protokoll/p1/protokoll.json`
  markiert. Eine Änderung ist P2 (neu versiegeln mit `scripts/pruefstand/seal.mjs` in einem Ordner `protokoll/p2/`), alle Versionen werden
  dann neu bewertet; Konserven bleiben nutzbar, solange Stationen, Quantile, Raster, Schwelle, Referenzen und Tresor gleich bleiben (R-7).
  Besonders ansehen: R-2 (G3 ODER-Lesart), R-3 (G4 Physik, weil Fusion 9 selbst Böe ≥ Wind in 0,29 % verletzt — V-PS-12), R-5
  (`vergleich` ohne Tresor), R-6 (Klimatologie an Rolle B).
- **(c) Register:** Fusion 9 ist Champion (E-PS-14). Der Status „Champion“ einer neuen Version wird von dir gesetzt
  (`scripts/pruefstand/register/fusion-<n>.json`, Feld `status`), nie vom Skill.
- **(d) Ab jetzt je Version:** `/pruefe-fusion <n>` (Volltest), `/pruefe-fusion <n> abnahme` (Urteil, öffnet Tresor und Spur P,
  `register/zugriffe.log`). Spur P beginnt mit dem ersten Archivtag nach dem Freeze; reif nach 7 Tagen — die erste Abnahme mit Spur-P-Fällen
  ist für Fusion 9 ab ≈ 13.10. möglich (Slot 05.10. + 7 Tage), mit allen Vorläufen bis 336 h erst drei Wochen später.
- **(e) Bericht lesen:** `audit/pruefstand/berichte/fusion-9/2026-10-05-abnahme/bericht.html` — Fusion 9 gegen sich selbst (Selbsttest):
  Güteindex Spur R +17,8 % gegen die Klimatologie, G2–G4 grün; `audit/pruefstand/vergleiche/2026-10-05-sauber/` — 5e … 9 im Tresor:
  6 gegen 5e +3,1 %*, 7/8/9 dort per Bauart gleich.
- **(f) Offen:** V-PS-12 (Böe < Wind im Motor, eigener Antrag), V-PS-15 (2×2-Block aus Archiv-Schema 5 in den Replay — neue
  Adapter-Generation, ab dem ersten Schema-5-Slot), V-PS-16 (Berichtsgröße), V-PS-17 (längere Klimatologie), E-PA5-2/E-PA5-5
  (Ausgabe des Cube-Pfads im Archiv ⇒ Treue-Probe gegen das echte Produkt).

## 41. Phase AW — E-AW-30 und die offenen Verbesserungen V-AW-1 … V-AW-29, 2026-10-06

Belege: `audit/autobahnwetter.md` §18. Sieben Commits auf `main` (`a42d516`, `fd27a6a`, `5649871`, `5f483df`, `d0c44b3`,
`f3a5280`, `9cc8c0c`), **nicht gepusht**.

1. **Push von `buscosun-web/main`** — möglichst vor 23:10 UTC. Damit wirken: Anker an den Stationen (E-AW-30, nächster
   `road-fc`-Lauf), die wieder laufende Ablage der Streckenprognose im Archiv (**V-AW-35: steht seit 05.10. 15:36 UTC**),
   Wächter des Zeigers (V-AW-28) und Kopie der statischen Dateien im Archiv (V-AW-24) beim nächsten `road-archiv`-Lauf,
   die Referenz der Regel `cube` (V-AW-1) ab dem nächsten Start des Radar-Jobs, 404 über raw (V-AW-25), der schnellere
   Producer (V-AW-23) und die Seite (V-AW-2/9/12/14/26/29) mit dem Deploy.
   Prüfen danach: `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/road-fc-check.mjs`
   (Kopf `anchor: swis`, `anchored` ≈ 1 100), im Archiv `road/fc/v1/index.json` (neuer Tag), `road/fc/v1/static/manifest.json`.
2. ~~**Daten-Paket ins Daten-Repo**~~ — **erledigt 06.10. 17:24 UTC mit Jans Freigabe** (Daten-Repo `e5597ba`, nur die drei
   Pfade, auf frischem `origin/main` gebaut, nicht force; jsDelivr für die drei `@main`-Pfade gepurgt, CDN-Inhalt = Paket;
   Straßen-Slot `2610061730` des Spiegels hat die neue `corridors.json` behalten; Audit §18.4).
   Ursprünglicher Auftrag: (V-AW-7, V-AW-16, V-AW-22): `C:\dev\buscosun-road-publish\2026-10-06\` — drei Dateien
   (`SHA256SUMS` daneben) nach `road/v1/static/corridors.json`, `road/fc/v1/static/points.json`, `road/fc/v1/static/geo.json`;
   Push nach dem Protokoll (build/point-Lauf abwarten, fetch, rebase, Pfad-Commit, nie force), danach Purge genau dieser drei
   Pfade. Der Spiegel übernimmt `corridors.json` aus dem Repo (copyInto). Folge: 141 statt 137 Korridore (vier Äste mit
   eigener Station), a14 und a143 gekürzt, drei Korridore mit benannter Lücke, 156 Stationen mehr mit Prognose.
   Hinweis: Links `st=a14@<km>` zeigen danach auf andere Orte (km zählt ab dem neuen Anfang).
3. **Optional: Workflow-Kopien** — `scripts/road/workflow-road-fc.yml` → Daten-Repo `.github/workflows/road-fc.yml` (ohne
   Pflichtprüfung der Punktdatei: der Producer holt sie bei Verlust aus dem Archiv) und
   `scripts/punktarchiv-repo/workflow-road-archiv.yml` → Archiv-Repo `.github/workflows/road-archiv.yml` (nur Kommentare
   und die Meldung des roten Schritts). Ohne die Kopien wirkt der Code trotzdem; der alte Workflow bricht nur ab, wenn
   `points.json` fehlt, statt sie zurückzuholen.
4. **DWD-Anfrage** zum aktuellen Stationskatalog und zu den leeren Ordnern LW/SD — Text in `audit/autobahnwetter.md` §18.5.
5. **Entscheiden:** V-AW-36 (Producer nicht ganz deterministisch, Kandidat: Zeitfristen im Motor — buscosun Fusion).
6. **Real-Device:** Ebene „Niederschlag jetzt" (WebGL-Ebene der Wetterkarte) auf dem Handy einschalten, `/autobahnwetter/a8`.

## 42. Phase FR-2 — die ganze Plattform rechnet mit buscosun Fusion, 2026-10-06

Beleg: `audit/fusion-release.md` §8 (Messung `audit/fusion-release/platform-measure.md`). Stand: gebaut, **uncommitted**, Gates grün;
Routenplaner **an** (E-FR-7, Jan 06.10.), die übrigen drei Teile **aus** (Messregel §8.4 nicht bestanden).

1. ~~Ansehen und committen~~ — FR-2 liegt in `18ab8ca` („update“).
2. ~~E-FR-5 Windrichtung~~ — **entschieden 07.10.: (a)**, umgesetzt (§8.11): eine fehlende Richtung bleibt fehlend in Schnitt, Talwind,
   Routenkarte, Tourzeit und 3D-Route; kein Nordpfeil mehr; Wächter C5.
3. ~~E-FR-6 Benachrichtigungen~~ — **entschieden 07.10.: an** (Ladezeit irrelevant, solange nicht extrem). Eventplaner und Vertikalschnitt
   ebenfalls an ⇒ **alle vier Teile rechnen buscosun Fusion**.
4. ~~E-FR-7 Routenplaner~~ — **entschieden 06.10.: eingeschaltet** („nutze es einfach“), §8.10. ~~V-FR-9~~ — **behoben 07.10.** (§8.12):
   Landesgrenze statt Box-Regel, München/Südbayern wieder DE.
5. **Commit + Push** (uncommitted, Vorschlag `feat(fusion): event, section and notifications on buscosun Fusion; a missing wind
   direction stays missing (E-FR-5/6)`): `src/pointForecast/fusion/fusionRelease.ts`, `src/pointForecast/weatherEnrichment.ts`,
   `src/threed/{buildCrossSection,crossSection,dynamics}.ts`, `src/threed/{SectionChart,SectionView,TerrainMap}.tsx`,
   `src/atmosphere/{AtmosphereDeck,TalwindPanel}.tsx`, `src/route/{windSampling,tourTiming}.ts`, `src/route/RouteMap.tsx`,
   `src/route/route3d/{routeSection.ts,RouteTerrainMap.tsx}`, `scripts/verify-fusion-release.mjs`, `scripts/verify-route-3d.mjs`,
   `audit/fusion-release.md` §8.11. **Nicht** dazu: die Autobahn-Dateien der parallelen Sitzung (§43). Danach Deploy-Prüfung im
   Browser: Querschnitt, Event, Tour — Konsole ohne „Rückfall“.
   **Dazu seit §8.12 (V-FR-9/10):** `src/countryProfiles.ts`, `src/pointForecast/clustering.ts`, neu `src/pointForecast/countryBorders.ts`
   + `scripts/gen-country-borders.mjs`, `src/scalar/precipComposite.ts` (nur Import + Kommentar, Gitter byte-gleich),
   `src/atmosphere/{AtmospherePage,GoNoGoReport}.tsx`, `src/threed/{GoNoGoPanel,TerrainView,ThreeDPage,goNoGo}.ts(x)`,
   `src/route/route3d/{model.ts,Route3DView.tsx}`, `scripts/verify-regenradar-profile.mjs`; `budget.json` totalJs 1 567 (meine Notiz
   hängt an der der AW-Sitzung — dieselbe Datei, beide Commits berühren sie). Vorschlag `fix(fusion): border instead of box for the
   country of a point, the cross section names buscosun Fusion (V-FR-9/10)`. `verify:regenradar-profile` E7 wird erst nach dem Commit grün.
6. ~~V-FR-10~~ — **behoben 07.10.** (§8.12): der Schnitt nennt den Stand von buscosun Fusion, die Methode und die echte Auflösung.
7. ~~V-FR-11 / V-FR-12~~ — **umgesetzt 07.10.** (§8.13): Niederschlagsgitter mit derselben Länderregel (Südbayern RADOLAN statt INCA,
   5 519 Zellen), „JK“ auf neun Seiten entfernt. **Commit + Push** (Vorschlag `fix(map,ui): precipitation grid by country border,
   no template initials (V-FR-11/12)`): `src/pointForecast/{countryOfPoint.ts (neu),clustering.ts}`, `src/scalar/precipComposite.ts`,
   die neun Seiten (`EventResult`, `ForecastPage`, `ForecastDeck`, `ThreeDPage`, `NowcastPage`, `NowcastDeck`, `AtmosphereDeck`,
   `HistoryPage`, `RoutePage`), `scripts/verify-{fusion-release,regenradar-profile}.mjs`, Audit §8.13. Danach im Deploy: Regenradar
   über München ansehen (Quelle RADOLAN, Vorlauf bis 2 h).

## 43. Phase AW — Datenprüfung und M6 Stationslage, 2026-10-06/07

Belege: `audit/autobahnwetter-datenpruefung.md` (§0–§5, M6a/M6b), Liste `audit/autobahnwetter/datenpruefung/lage-liste.md`.
Nichts committet, nichts gepusht.

1. **Commit + Push von `buscosun-web/main`** mit M6: `scripts/road/station-positions.mjs` + `.json` (Tabelle),
   `road-derive.mjs`, `build-fc-points.mjs`, `src/road/roadContract.ts`, `roadFc.ts`, `RoadReadout.tsx`,
   `scripts/verify-road-positions.mjs`, `package.json` (Alias). Wirksam für die Messmarker ab dem nächsten Start des
   Radar-Spiegels (klont `main`); Gates: `verify:road-positions` 23/23, `verify:road-derive` 36/36, `verify:road-contract`
   69/69, `verify:road-fc` 102/102, `verify:road-archive` 26/26, `verify:road-decode` 15/15, `verify:road-ui` 64/64,
   typecheck 0, Build + Budget grün.
2. **Daten-Paket ins Daten-Repo** (Prognosepunkte auf derselben Lage): `C:\dev\buscosun-road-publish\2026-10-07-m6\` —
   `road/fc/v1/static/points.json` und `geo.json` (`SHA256SUMS` daneben); Achspunkte bytegleich zum Stand `e5597ba`,
   807 Stationspunkte verschoben (p50 71 m, 80 > 2 km). Protokoll wie 06.10. (frischer `origin/main`, nur die zwei Pfade,
   nie force), danach Purge genau dieser zwei `@main`-Pfade. Reihenfolge zu Schritt 1 egal (vorher: Katalog-Stationen
   stehen schon auf Katalog). Achtung V-AW-39: der erste Lauf danach kann als Wiederholung überspringen. **Erledigt 07.10.2026 07:39 UTC mit Jans Freigabe:** Daten-Repo `6075c37` auf `9ff6464` (nur die zwei Pfade, frischer `origin/main`, nicht force; ein erster Versuch lief in einen Radar-Commit und wurde neu gebaut), Blobs auf `main` = Paket, beide `@main`-Pfade gepurgt, CDN-Inhalt per sha256 = Paket (`ad2dad05c40e…`, `447deba5d7a2…`).
3. **Liste ansehen** (13 Stationen ohne Lage an der eigenen Straße, 10 ohne Straßennummer): je Station Katalog, Meldung
   oder eine eigene Lage festlegen — oder so lassen (Meldelage, „Position nicht bestätigt“).
4. ~~Offen aus der Datenprüfung~~ — **M1–M5 umgesetzt 07.10.2026 (Jans Auftrag), M7 diagnostiziert** (Audit §5.1 und
   „M7 Diagnose“); uncommitted. **Commit + Push von `main`** (Vorschlag `fix(road): reject device fill values and broken
   sensors, honest texts (M1–M5)`): `src/road/roadContract.ts`, `RoadReadout.tsx`, `RoadPage.tsx`, `RoadDock.tsx`,
   `scripts/road/road-derive.mjs`, `road-forecast.mjs`, `scripts/verify-road-contract.mjs`, `verify-road-fc.mjs`,
   `budget.json` (totalJs 1 561), Audit + `audit/autobahnwetter/datenpruefung/m1-*/m4-*/m5-*/m7-*`. Nicht dazu gehören
   die Änderungen der parallelen Sitzung (atmosphere, route, threed, fusionRelease, verify-route-3d, verify-fusion-release).
   Wirkung: Regeln ab dem nächsten Start des Radar-Spiegels (klont `main`), Anker-Filter ab dem nächsten `road-fc`-Lauf,
   Texte mit dem Deploy. Prüfen danach: im nächsten `road/v1/obs/<slot>.json` `byRule` mit `fillValue`/`precipFill`, keine
   Klasse `frost` bei Luft > 10 °C; `road-fc-check.mjs` (Kopf `anchored` ≈ 20 weniger als bisher).
5. **Entscheiden (M7, Sägezahn):** Producer-Kur (3-h/6-h-Quellen vor dem Mitteln auf die Stundenachse) oder PAP 4 in
   buscosun Fusion (= Fusion 10) — Audit §5 „M7 Diagnose“. Ebenso offen: D-10 (vierstellige Straßennummern), Gate B.

## 44. Seewetter (Phase SW), Stufe 1 SW-0 … SW-6 im Auto-Modus, 2026-10-07

Belege: `audit/seewetter.md` (§2 Spike, §3 Entscheidungen im Auto-Modus, §4–§9 Umsetzung mit Prüfer-Ausgaben, §8 Commits,
§10 V-SW, §11 Gates). In `buscosun-web` ist **nichts committet** (Jans Gate). In `buscosun-data` und `buscosun-archiv`
habe ich nach der Vollmacht vom 07.10. selbst gepusht (nur `sea/` und die eigenen Workflows, nie force).

1. **Entscheidungen prüfen** (Gate A im Auto-Modus): E-SW-1 … E-SW-14 (§3) und E-SW-15 … E-SW-28 (Umsetzung). Die
   wichtigsten Abweichungen vom Plan: **E-SW-4** Felder UND Texte in einem eigenen Workflow `sea.yml` statt im
   Radar-Spiegel (der Spiegel blieb unberührt; ein Haken dort war nicht gefahrlos nachweisbar), **E-SW-10** kein fester
   Abrufzeitpunkt (Lauf vollständig erst + 4:07 h), **E-SW-11** Höhe 0 m am Spot (Terrarium liefert über Wasser die
   Wassertiefe), **E-SW-15** Edge-Bündel nicht neu gebaut, **E-SW-16** Tokens im lazy CSS, **E-SW-17** Stundenband als
   Tabelle statt nivo-Heatmap, **E-SW-19** Wind auf der Karte als Fusion-Pfeile an den Spots statt Partikeln.
2. **Vor dem Push von `buscosun-web`:** `npm run edge:share` (baut `netlify/edge-shared/shareParser.js` neu — einziger
   Unterschied: der Routeneintrag `seewetter`, Diff `audit/seewetter/edge-share-bundle.diff`; danach `verify:share`
   528/528). Das berührt die Edge Function `og-meta` (nur die Routentabelle) — deshalb nicht von mir.
3. **Commit + Push von `buscosun-web/main`** (Vorschlag `feat(sea): Seewetter stage 1 behind ?sea=1 — CWAM fields, spot
   series with buscosun Fusion wind, official texts verbatim`): `src/sea/*`, `src/router/pages/SeaRoute.tsx`,
   `src/router/routes.ts`, `src/router/router.tsx`, `src/App.tsx`, `src/SearchPage.tsx`, `src/nav/featureRail.tsx`,
   `scripts/sea/*` (ohne `spike/` nach Wahl), `scripts/verify-sea-*.mjs`, `scripts/lib/fixtures/sea/*`,
   `scripts/health-manifests.mjs`, `scripts/verify-health.mjs`, `scripts/generate-seo.mjs`, `scripts/repack-repo/README.md`,
   `netlify.toml`, `package.json` (fünf Aliase), `budget.json` (E-SW-24), `.gitattributes` (neu), `audit/seewetter*`,
   `audit/seewetter/fixtures/**`, `reference/seewetter*`, `prompt-seewetter.md`. Nicht dazu gehören die Änderungen der
   parallelen Sitzungen im Arbeitsbaum. Gates: `verify:sea-contract` 29/29, `sea-decode` 13/13, `sea-text` 35/35,
   `sea-derive` 40/40, `sea-ui` 33/33, `verify:health` 44/44, `verify:road-ui` 64/64 (Preview), `verify:fusion-release`
   28/28, `verify:share` 527/528 bis Schritt 2, typecheck 0, Build 255/255, Budget grün.
   **Wirkung:** `sea.yml` im Daten-Repo findet den Producer beim nächsten 15-min-Lauf und beginnt den Schattenbetrieb
   (Gate B): Texte sofort, der nächste vollständige CWAM-Lauf ab Lauf + 4:07 h; `sea-archiv.yml` im Archiv-Repo
   archiviert ab dann alle 6 h. Die Seite bleibt unsichtbar (`SEA_LIVE = false`, nur `?sea=1`, noindex, keine Sitemap).
4. **Nach dem Push prüfen:** im Daten-Repo erscheinen Commits „sea: … · CWAM <lauf>“ zweimal täglich und Text-Commits;
   `npm run health -- --url https://buscosun.com` zeigt S1–S3 grün; Actions `sea` grün (rot nur bei Feld- oder
   Textfehler, veröffentlicht wird trotzdem, was gültig ist).
5. **Nach 7 Tagen (Gate B):** ≥ 95 % der Läufe vor Lauf + 5 h veröffentlicht (`sea/v1/status.json` `field.recent`), jede
   Quarantäne begründet (`sea/v1/quarantine/`), Lauf ≤ 25 MB (`run.json` `bytes`; gemessen 13,2 MB), keine Textausgabe
   verloren (Archiv `text.json.gz` gegen das DWD-Fenster).
6. **Nach 14 Tagen (Gate D):** `node scripts/sea/sea-gate-d.mjs --archive=<buscosun-archiv>/sea/v1
   --catalog=<buscosun-data>/sea/v1/static/spots.json` — Wind/Böe am Spot gegen die POI-Messung (17 liefernde
   Küstenstationen, nicht nur Arkona), Abweichung dokumentieren.
7. **Gate C — Seite einschalten:** Real-Device (scrcpy/ADB, mobil das Sheet und das Band), Seite ansehen, dann
   `SEA_LIVE = true` in `src/sea/seaFlag.ts`, `noindex` in `routes.ts` entfernen (Sitemap folgt daraus) und pushen.
   Kill-Schalter jederzeit: Repo-Variable `SEA_KILL=1` im Daten-Repo (Seite zeigt „Keine Daten“), `?sea=0` je Besucher.
8. **Ansehen:** V-SW-1 … V-SW-12 (§10), vor allem V-SW-3 (Böe < Wind in buscosun Fusion) und V-SW-4 (Bathymetrie als
   Höhe über Wasser) — beide betreffen die Fusion-Linie, nicht nur Seewetter.

## 45. buscosun Fusion 10 (Phase F10) — autonome Entwicklungssitzung im Auto-Modus, 2026-10-07

Belege: `audit/fusion-10.md` (§0 Zeitprotokoll, §1 Diagnose, §2 Portfolio, §3 Kandidatenprotokoll mit jedem Prüfstand-Lauf,
§4 Entscheidungen im Auto-Modus A-F10-n, §5 Identität und Leck-Prüfungen, §6 Urteil und V-F10-n), Spezialistenberichte
`audit/fusion-10/{stat,terrain,range}.md`, Prüfstand-Berichte `audit/fusion-10/laeufe/<n>-<modus>/`, Register
`scripts/pruefstand/register/fusion-10.json`. **Nichts gepusht, nichts auf `main` gemergt**; alles liegt auf dem lokalen
Branch `fusion-10` (Tags `f10-lauf-<n>`) und den Spezialisten-Branches `f10/stat`, `f10/terrain`, `f10/range` (Worktrees
unter `C:\dev\buscosun-web-wt\`; dazu `base` = `4bdade3` für den Identitätsverifier — nach der Durchsicht mit
`git worktree remove` aufräumen).

1. **Entscheidungen im Auto-Modus prüfen** (§4): A-F10-1 … A-F10-9 — darunter das Freeze-Datum 2026-10-07 als Setzung
   (Vollmacht 4), der Verzicht auf `ensMember` (keine Schema-6-Ensembleebenen im Hindcast), K2 nicht aufgenommen, K3 als
   zweites Teilmerkmal (AT/CH ab 126 h) nach eigenem Pre-Screen, die Rücknahme der Wind-σ-Skala nach Lauf 1 (A-F10-6), die
   Budget-Anhebung totalJs 1598 → 1600 (A-F10-9).
2. **Was Fusion 10 ist** (Register-Eintrag `n: 10`, Option `longRange: 1`, `src/pointForecast/fusion/longRange.ts`,
   Commit `eac9a43` = Tag `f10-lauf-3`; Tabellen des Daten-Repos unverändert `1aaec969`): Fusion 9 **plus** (1) die
   Langfrist-Rückführung von T, Td und Böe (> 48 h) zur Klimatologie des Motors — momentgetreue Mischung mit Gewicht w und
   σ-Skala s je Größe × Vorlauf-Bin, gefittet an 32 Hindcast-Slots 2025-09-08…2026-09-15 (außerhalb des Tresors; Wind nach
   Lauf 1 auf Identität, A-F10-6) — und (2) den Klimatologie-Schritt für Wind/Böe ab 126 h **nur in AT/CH**
   (`FUSION10_WIND_SHRINK_FROM_H`/`_COUNTRIES`). Alles ≤ 48 h, Niederschlag und Bewölkung rechnen exakt Fusion 9
   (Identitätsverifier `npm run verify:fusion10-identity -- --on=longRange:1`: 11/11, 8/8, 5/5 — nur Werte > 48 h ändern sich).
3. **Prüfstand-Ergebnis Volltest** (Entwicklungsmenge 23 Tage 14.09.–06.10., Rolle B, gegen Fusion 9): Lauf 1 (nur
   Rückführung, mit Wind-σ-Skala) **+0,14 %** (+0,02…+0,30), G2 rot (Wind AT/CH); Lauf 2 (Bündel) **+0,69 %**
   (**+0,51…+0,92**), G2/G3/G4 grün, keine Überanpassungswarnung, 80 von 99 Kernzellen besser als jede Einzelquelle (Fusion 9:
   76). Beste Zellen Wind 240–336 h CH +20,7 %/AT +15,3 %, 120–240 h CH +12,2 %/AT +7,4 %; Td 240–336 h CH +7,6 %; T 120–240 h
   AT +4,2 %. Schlechteste (nicht signifikant) Td 120–240 h AT −2,5 %, Td 48–120 h DE −2,1 %. **Vorbehalt:** die Menge enthält die
   Stack-Fit-Tage und die Entscheidung A-F10-6 wurde auf ihr getroffen. **Abnahme (Spur R 70 Ausgaben, Spur P leer, einmalig 16:40 UTC):** Urteil des Prüfstands **„abgelehnt“ — G2 und G3 rot**
   bei Fortschrittsindex **+0,97 % (95 %: +0,61 … +1,29 %)** und Platz 1 der Rangliste (Güteindex +18,69 % gegen +17,81 %
   für Fusion 6–9). Rot sind genau zwei Details: T 240–336 h AT −0,4 %** (σ-Weitung des letzten Bins) und die Abdeckung
   Wind 120–240 h (75,7 % gegen 76,4 % beim Champion — der AT/CH-Schritt verengt die Bänder dort). Nach der Abnahme wurde
   nichts geändert (Leck-Regel). **Erreicht: Level 1; Level 2 nicht.**
4. **Merge nach `main` (Jan):** `git checkout main && git merge --no-ff fusion-10` (oder Squash — die Tags `f10-lauf-<n>`
   halten die registrierten Commits). **Achtung:** der Commit mit dem Eintrag `n: 10` schaltet mit dem Push JEDE Stelle der
   Plattform auf Fusion 10 (Panel, Dashboard, Regenradar-Streifen, Routen-/Eventplaner, Schnitt, Benachrichtigungen,
   Streckenprognose `road/fc` und Kartenfelder beim nächsten Cron-Lauf). Wer das noch nicht will, setzt vor dem Merge
   `FUSION10_LONG_RANGE = 0` (dann heißt der Stand weiter Fusion 9, der Eintrag bleibt definiert) — der Register-Eintrag des
   Prüfstands zeigt dann auf einen Commit, dessen Stufe Fusion 9 rechnet; für die Abnahme in Spur P muss der Kandidat
   am Commit mit `= 1` registriert bleiben (nicht `--neu` registrieren).
5. **Echte Abnahme in Spur P:** frühestens, wenn ≥ 4 Archivtage NACH dem Freeze 2026-10-07 reife Wahrheit haben (Reife
   7 Tage ⇒ Ausgabetage 08.–11.10. sind ab **19.10.2026** reif). Dann `/pruefe-fusion 10 abnahme` — die Abnahme dieser
   Sitzung (Spur R + leere Spur P) zählt als Vorab-Urteil, s. §3.
6. **Champion-Status und Liveschaltung:** nur Jan (`status: champion` im Register setzt der Skill nicht); die
   Liveschaltung ist der Push von `main` (Schritt 4). **Empfehlung der Sitzung:** Fusion 10 NICHT als Champion und NICHT live
   schalten, solange P1 „abgelehnt“ sagt; stattdessen die zwei Korrekturen V-F10-7 (T-Bin 241–336 h auf Identität) und
   V-F10-8 (Windschritt erst ab 241 h oder mit σ-Boden) am Hindcast außerhalb des Tresors nachmessen und als **Fusion 11**
   registrieren — mit dem Vorbehalt, dass die Tresor-Zellen t 240–336 und ws 120–240 dann nicht mehr blind sind (Spur P
   entscheidet). Wer Fusion 10 trotzdem live will (Index +0,97 % über das ganze Intervall, 62 von 63 Zellen nicht schlechter):
   Schritt 4 mit `FUSION10_LONG_RANGE = 1` — das ist Jans Entscheidung gegen das Protokoll, im Audit als solche festzuhalten.
7. **Nach dem Push prüfen:** `npm run verify:fusion-release -- --live` (nennt den Stand von `road/fc` und `point/field`
   im Daten-Repo; beide ziehen beim nächsten Lauf nach), Panel mit `?pflog=1`: Stufen-Notiz „buscosun Fusion 10“ und die
   Zeile `longRange: …` in den Notizen eines Punkts; `?pf=live` bleibt der Rückfall.

## 46. buscosun Fusion 11 (Phase F11) — die zwei Abnahme-Defekte von Fusion 10 entfernt, neu geprüft, 2026-10-07

Belege: `audit/fusion-11.md` (§0 Zeitprotokoll, §1 Vorbedingungen/Diagnose, §2 Regel vor den Zahlen, §3 Pre-Screen, §4 A-F11-n,
§5 Identität, §6 Prüfstand-Läufe, §7 Gates, §8 V-F11-n), Pre-Screen-Vergleiche `audit/fusion-11/prescreen/`, Prüfstand-Berichte
`audit/fusion-11/laeufe/<n>-<modus>/`, Register `scripts/pruefstand/register/fusion-11.json`. **Nichts gepusht, nichts auf `main`
gemergt**; alles liegt auf dem lokalen Branch `fusion-11` (von `fusion-10`, Tag `f11-lauf-1` = Register-Commit `ace255d`).

1. **Entscheidungen im Auto-Modus prüfen** (§4): A-F11-1 … A-F11-6 — darunter das Freeze-Datum 2026-10-07 als Setzung (Vollmacht 4),
   der Verzicht auf den monotonen Neufit (am Fit-Gitter verworfen), die Stufenform der T-Identität (Fusion-10-Tabelle bis 240 h), der
   Interpolationsrand und die tolerierte Wind-T-Kopplung in der zweiten Negativkontrolle, die σ-Boden-Form gebaut und aus.
2. **Was Fusion 11 ist** (Register-Eintrag `n: 11`, Option `longRangeFix: 1`, Konstanten `FUSION11_*` in `longRange.ts`; Tabellen des
   Daten-Repos unverändert `1aaec969`, Langfrist-Tabelle = die von Fusion 10, kein neuer Fit): Fusion 10 **mit** (1) dem T-Bin 241–336 h
   der Langfrist-Rückführung auf Identität (V-F10-7) und (2) dem AT/CH-Klimatologie-Schritt für Wind/Böe erst ab 241 h statt 126 h
   (V-F10-8) — sonst nichts. Ohne die Option rechnet der Motor byte-gleich Fusion 10, ohne `longRange` byte-gleich Fusion 9
   (Identitätsverifier §5). **Nebenwirkung, deklariert (V-F11-5):** der wegfallende Windschritt bewegt T in AT/CH bei 126–240 h um bis zu
   0,3 K je Wert (Zellmittel 0,00 %) — die aus F10 bekannte Kopplung V-F10-r3, Ursache offen.
3. **Formwahl** nach vorab geschriebener Regel (§2) am Hindcast außerhalb des Tresors (8 Slots 09/2025) und auf der Schnellmenge (7 Tage):
   T-Rampe verlor dort −0,54 % gegen Fusion 9, die Stufe ist exakt Identität; der Windschritt ab 241 h hält die Abdeckung von Fusion 9 und
   verliert nirgends, der σ-Boden bei 126 h gewann nur +0,01 % und verlor in CH. **Vorbehalt:** die Schnellmenge (Herbst 2026, Abdeckung
   t 240–336 h nur 65 %) hätte die Rampe bevorzugt (V-F11-1).
4. **Prüfstand Volltest** (Entwicklungsmenge 23 Tage, Rolle B, gegen Fusion 9): **+0,47 % (95 %: +0,33 … +0,66 %)**, G2/G3/G4 grün,
   77 von 99 Kernzellen besser als jede Einzelquelle (Fusion 10: +0,69 %, 80 Zellen — die Differenz sind genau die zwei zurückgenommenen
   Teile, die auf der Entwicklungsmenge halfen und im Tresor schadeten).
5. **Abnahme (Spur R 70 Ausgaben, Spur P leer, einmalig 18:48 UTC, `zugriffe.log`):** Urteil des Prüfstands **„Kandidat“** — Fortschrittsindex
   gegen Fusion 9 **+0,97 % (95 %: +0,64 … +1,28 %)**, **G2 grün (0 von 63), G3 grün, G4 grün**, G1 „nicht nachweisbar“ (Spur P leer);
   63 von 63 Kernzellen besser als jede Einzelquelle; Rangliste gleichauf mit Fusion 10 (+18,69 %). Die zwei roten Zellen von Fusion 10
   sind grün: t 240–336 h AT 0,00 % (byte-gleich zu Fusion 9, vorher −0,44 %**), Abdeckung ws 120–240 h 76,4 % = Champion (vorher 75,7 %).
   Gegen Fusion 10 ist der Index +0,00 % (−0,03 … +0,03) — Fusion 11 ist protokollkonform, nicht besser als Fusion 10; Preis: Böe 120–240 h
   AT −4,7 % gegen Fusion 10 (Nebenzelle, n. s.; gegen Fusion 9 weiter +14,6 %). **Erreicht: das Ziel des Auftrags (Kandidat).** Vorbehalt:
   die zwei korrigierten Zellen sind nicht blind (Korrekturen aus dem Tresor-Ergebnis von Fusion 10 abgeleitet) — s. Schritt 7.
6. **Merge nach `main` (Jan):** `git checkout main && git merge --no-ff fusion-11` — `fusion-11` enthält `fusion-10` vollständig (ein Merge
   bringt beide Stände). **Achtung:** der Commit mit dem Eintrag `n: 11` schaltet mit dem Push JEDE Stelle der Plattform auf Fusion 11
   (Panel, Dashboard, Regenradar-Streifen, Routen-/Eventplaner, Schnitt, Benachrichtigungen, Streckenprognose `road/fc` und Kartenfelder
   beim nächsten Cron-Lauf). Wer nur Fusion 10 will, setzt `FUSION11_LONG_RANGE_FIX = 0` (Stand heißt dann Fusion 10); wer Fusion 9 will,
   zusätzlich `FUSION10_LONG_RANGE = 0`. Für die Abnahme in Spur P muss der Kandidat am Commit mit `= 1` registriert bleiben (nicht `--neu`).
7. **Echte Abnahme in Spur P:** frühestens, wenn ≥ 4 Archivtage NACH dem Freeze 2026-10-07 reife Wahrheit haben (Ausgabetage 08.–11.10.
   sind ab **19.10.2026** reif): `/pruefe-fusion 11 abnahme`. Die Abnahme dieser Sitzung (Spur R + leere Spur P) ist ein Vorab-Urteil, und in
   den Zellen t 240–336 h und ws 120–240 h **nicht blind** (die Korrekturen stammen aus dem Tresor-Ergebnis von Fusion 10) — Spur P ist der
   saubere Richter.
8. **Champion-Status und Liveschaltung:** nur Jan (`status: champion` im Register setzt der Skill nicht); die Liveschaltung ist der Push von
   `main` (Schritt 6). Nach dem Push: `npm run verify:fusion-release -- --live`, Panel mit `?pflog=1` (Stufen-Notiz „buscosun Fusion 11“,
   Zeile `longRangeFix:set …`), `?pf=live` bleibt der Rückfall.
9. **Aufräumen nach der Durchsicht:** Worktrees `C:\dev\buscosun-web-wt\{base,f10-stat,f10-range,f10-terrain}` mit `git worktree remove`;
   Pre-Screen-Daten `C:\dev\buscosun-fusion11-data\` (≈ 100 MB) löschbar.
## 47. Seewetter — V-SW-2/3/4 (Wind je t1-Würfel, Böe ≥ Wind, Höhe auf See), 2026-10-07

Belege: `audit/seewetter.md` §12. Nummer 47, weil 45/46 auf den Zweigen `fusion-10`/`fusion-11` vergeben sind.

1. **Push von `buscosun-web/main`** mit dem Commit „feat(sea): …V-SW-2/3/4“. Wirkung sofort im Browser: Punkthöhe auf
   dem Wasser 0 m (Land byte-gleich); die Seite liest `status.wind`, solange keiner da ist, wie bisher.
2. **Danach** `scripts/sea/workflow-sea.yml` → `buscosun-data/.github/workflows/sea.yml` (ersetzen). Ab dem nächsten
   15-min-Lauf mit neuem t1-Würfel: Commit „sea: … · Wind t1 <lauf>“, Datei `sea/v1/spots/<lauf>-w<t1>.json`, Zeiger
   `status.wind`. Prüfen: `status.json` → `wind.t1` = `point/index.json` → `latestByTier.t1.run` (≤ 15 min + Verzug),
   `wind.rejected` 0, `wind.buildS`.
3. **E-SW-29:** `FuseCubeOptions.gustAtLeastWind` als Teil des nächsten Stands von buscosun Fusion (Register-Eintrag,
   mit oder nach Fusion 11). Gemessen an 56 Spots: 6 von 4 536 Stunden betroffen (0,13 %, bis 0,85 m/s), sonst
   byte-gleich. Bis dahin bleibt im Seewetter-Produkt E-SW-21 (Böe ⇒ `null`).
4. Ansehen: V-SW-14 (Geländegeometrie über Wasser, nur mit Neufit) und V-SW-15 (Archiv sieht je Lauf nur die neueste
   Auffrischung).

## 47. Stationsmessungen DACH in `buscosun-data/obs/` (Phase OB), 2026-10-07

Belege: `audit/stationsmessungen.md`. Im Daten-Repo **gepusht** (Jans Vollmacht 07.10.): Spiegel `scripts/obs-mirror.mjs`, Workflows
`obs.yml` (Dauerlauf 340 min, startet den Nachfolger) und `obs-watchdog.yml` (:03/:23/:43), README-Abschnitt + `obs/README.md`, erster
Datenstand `obs/v1/`. In buscosun-web **uncommitted**: `scripts/obs/*` (Quelle des Spiegels + Workflow-Vorlagen), README-Vorlage
`scripts/repack-repo/README.md` (Abschnitt „Stationsmessungen“ + Lizenzzeilen), dieses Phasendokument.

1. **Commit + Push von buscosun-web** (`scripts/obs/`, `scripts/repack-repo/README.md`, `audit/stationsmessungen.md`): bis dahin
   überschreibt der Kartenpublisher das Haupt-README des Daten-Repos mit der alten Vorlage — der Abschnitt „Stationsmessungen“
   verschwindet dort beim nächsten Kartenlauf; `obs/README.md` bleibt.
2. **Eine Quelle, zwei Kopien:** jede Änderung am Spiegel in `buscosun-web/scripts/obs/obs-mirror.mjs` UND
   `buscosun-data/scripts/obs-mirror.mjs` (V-OB-4: Wächter fehlt noch).
3. **Abschalten:** Repo-Variable `OBS_KILL=1` im Daten-Repo (Spiegel und Wächter starten nicht mehr).
4. Offen: V-OB-1 (AT-Hydrographie), V-OB-3 (NIME JUN 403), V-OB-5 (Plausibilitätsregeln), V-OB-6 (Leser in buscosun-web).

## 48. Seewetter — V-SW-12/10/9/15/14 (Folgeauftrag), 2026-10-08

Belege: `audit/seewetter.md` §13. Fünf lokale Commits auf `main` (V-SW-12 `6777973`, V-SW-10 `9800483`, V-SW-9 `d5ffc48`,
V-SW-15 `04bf787`, V-SW-14 `d5ccd06`), nicht gepusht. Daten- und Archiv-Repo unberührt.

1. **Push von `buscosun-web/main`.** Wirkt sofort für die Seite (Klassen-Cache) und ab dem nächsten `sea.yml`-Lauf für die
   Aufbewahrung (V-SW-15: alle Auffrischungen behaltener Läufe bleiben, höchstens 8 je Lauf, ≈ 0,56 MB). **Keine Kopie** einer
   Workflow-Vorlage nötig (unverändert), kein neuer Katalog (V-SW-9 lässt ihn byte-gleich).
2. **Prüfen nach ≥ 12 h:** im Daten-Repo liegen unter `sea/v1/spots/` mehrere `<lauf>-w<t1>.json` desselben Laufs; im Archiv
   `sea/v1/index.json` nennt `days[d].wind` jede Auffrischung (nicht nur jede zweite).
3. **Real-Device (V-SW-10):** `/seewetter?sea=1` auf dem Telefon, im Band schnell durch die Stunden wischen — Long Tasks im
   Performance-Panel (vorher erwartet ≈ 35–70 ms je Schritt, jetzt nahe 0).
4. **E-SW-31 (V-SW-9, Ufernormale):** entscheiden zwischen (a) Normale aus der BKG-DLM250-Küste (dl-de/by-2.0) für Spots ≤ 0,2 km an
   der Küste, (b) Lagen der markierten Spots auf den Strand ziehen und neu rechnen, (c) Hand-Normalen für holnis, schleimuende,
   heiligenhafen, ueckermuende; dazu Binz (Hand 90°, Karte ≈ 45°) und Pelzerhaken (Hand 80°, Karte ≈ 150°) ansehen.
   Empfehlung (b), dann (a). OSM bleibt außen vor (ODbL nicht entschieden).
5. **E-SW-30 (V-SW-14, Meeresboden in den Geländegrößen):** Leser-Option `clampSeaFloor` ist gebaut und AUS. Einschalten nur mit
   Neubau von `points.v1.json`, Neufit der Lern- und Klimatabellen und neuer Nummer von buscosun Fusion (Empfehlung: mit dem
   nächsten Stand nach 10/11, zusammen mit `gustAtLeastWind`, Prüfstand P1 vorher/nachher). Wirkung: Kaltluft-Tor kippt an 4 der
   10 Küsten-/Inselstationen und an 12 der 56 Spots.
6. **Aufräumen (V-SW-17):** `E-SW-29` ist im Audit doppelt vergeben; diese Datei hat zwei Abschnitte „47.“ (Seewetter und
   Stationsmessungen) — die Nummerierung der anderen Sitzung nicht ohne Absprache ändern.
7. **E-SW-31 (b) umgesetzt (08.10. nachmittags, `audit/seewetter.md` §13.8):** 12 Spots auf die DLM250-Küste gezogen
   (`scripts/sea/snap-spots.mjs`, frühere Lage als `snap.was` in `spots-src.json`), Katalog neu gebaut. Katalogregel gegen die
   DLM-Küste p50 19 → 13°, p90 79 → 41°, > 45° 8 → 4 (verbleibend genau die (c)-Liste). Damit gilt Punkt 1 „kein neuer Katalog“
   NICHT mehr: **Kopie von `scripts/lib/fixtures/sea/static/spots.json` nach `buscosun-data/sea/v1/static/spots.json`**
   (`areas.json` unverändert), danach Push des Daten-Repos — wirksam ab dem nächsten Seitenaufruf, die Wind-Auffrischung rechnet ab
   dem nächsten `sea.yml`-Lauf an den neuen Lagen. **Überholt durch §65 (11.10.): `spot-geo.json` gehört dazu, und der Katalog
   trägt inzwischen auch die drei Zellen aus V-SW-20.** Offen bleiben (a) DLM-Normale für die 34 Spots ≤ 0,2 km an der Küste und (c).

## 49. Niederschlagssummen im Regenradar (Phase NS), Diagnose, 2026-10-08

Nur Diagnose, kein Code (`audit/niederschlagssummen.md` §0–§9). Zu entscheiden:

1. **E-NS-1/2/3/5/6** (§6): Spiegel-Haken für gemessene Summen (RW + SF + CombiPrecip, INCA-Analyse für AT als eigener Schritt),
   Randstück „Stand RW“, Nowcast-Summen exakt aus der RV-Tar, keine Teilsummen in der Karte, nur „bis jetzt“/„ab jetzt“.
2. **E-NS-7** Reihenfolge: Stufe A ohne neue Daten (Karte am Ort: Gefallen aus `obs/v1` bis 24 h, Erwartet als Erwartungssumme
   von buscosun Fusion), danach Stufe B mit den Datenprodukten und der vollen Karte.
3. **E-NS-8** Spanne der Fenstersumme erst nach einem Fit der Abhängigkeit zwischen den Stunden am Prüfstand (Kopula, Regel vorab);
   bis dahin nur der Erwartungswert — die Spanne „(2–5 mm)“ der Vorgabe kommt damit später.
4. **E-NS-9** Neues Feldprodukt `point/field/v1/…/precipcum-<LLL>.png` (kumulierte Erwartung) im Punkt-Cron — Producer-Eingriff,
   Daten-Repo; das heutige Feld trägt kein Mittel (an 43–65 % der Zellen nicht exakt rückrechenbar, §9.4).
5. **E-NS-10** Legende „buscosun Fusion ‹n› · Modell · Cube · Lauf HH UTC“ (Etikett nach E-FR-1 behalten).
6. **E-NS-11** Mobil gibt es keinen Reiter „Jetzt“ — Karte am Ort in „Schnellblick“.
7. **E-NS-12** (V-NS-7): die bestehende „Summe 6 h · Band“ addiert gesetzte Schrittbänder — ersetzen durch die Erwartungssumme.

### 49.1 Umsetzung Stufe A + B1 (08.10. abends; Jan: „setze es nach deinen Empfehlungen um“)

E-NS-3/5/6/7/8/9/10/11/12 nach Empfehlung umgesetzt (`audit/niederschlagssummen.md` §10), uncommitted. E-NS-1/2 (Spiegel-Haken
RW/SF/CombiPrecip, INCA-Analyse) = Stufe B2/B3, nicht gebaut.

1. **Commit + Push von `main`** (Client + Producer gehören zusammen): `src/precipSums/**`, `src/nowcast/NowcastDeck.tsx`,
   `src/nowcast/NowcastRadarMap.tsx`, `src/point/fieldFormat.ts`, `scripts/point/build-point-fields.mjs`,
   `scripts/verify-precip-sums.mjs` + Fixture, `package.json`, `.github/workflows/ci.yml`, `budget.json`, Audit. ACHTUNG: im
   selben Arbeitsbaum liegen uncommittete Änderungen der Radar-HD-Sitzung (`MapView.tsx`, `RainLayer.ts`, `precipComposite.ts`,
   `precipIndexWorker.ts`, `radarHd.ts` …) — nicht mit in diesen Commit nehmen.
2. **Mit dem Push** baut der Punkt-Cron je Feld zusätzlich `precipcum-<LLL>.png` (t1 ≈ +1,8 MB je Lauf, t2 ≈ +0,25 MB);
   abschalten ohne Code: `POINT_FIELD_CUM=0` in der Cron-Vorlage. Danach `node … scripts/verify-precip-sums.mjs --live` (L1).
3. **Budget:** totalJs-Grenze 1 600 → 1 617 (Phase NS +16,6 KB, alles lazy, Notiz in `budget.json`). Der Arbeitsbaum steht mit
   der Radar-HD-Sitzung bei 1 626,6 — deren +10,7 KB begründet jene Sitzung.
4. **Real-Device** (Mobil): Summen-Ansicht, Legende über der Leiste, Long Tasks beim Rechnen der Karte (V-NS-11).
5. **Offen:** Stufe B2/B3 (E-NS-1/2), Spanne der Fenstersumme (E-NS-8, Kopula-Fit am Prüfstand), V-NS-8…11.

### 49.2 Stufe B2/B3 — gemessene Flächensummen (08.10. spät; Jan: „ja bau es")

E-NS-1/2 nach Empfehlung umgesetzt (`audit/niederschlagssummen.md` §11), uncommitted. **Eigener Workflow statt Spiegel-Haken**
(der Radar-Spiegel-Kern bleibt unberührt — die Radar-HD- und die Autobahnwetter-Linie hängen daran): Producer
`scripts/precipsum/precipsum-derive.mjs`, Ablage `buscosun-data/precipsum/v1/` (eigener Pfad, eigener Workflow).

1. **Commit + Push buscosun-web** zusammen mit §49.1: zusätzlich `src/precipSums/pastSumFormat.ts`, `scripts/precipsum/**`
   (Producer, Publish, Workflow-Vorlage), Änderungen in `src/precipSums/{sumGrid,sumMapEngine,sumMapTypes,usePointSums,PrecipSumsUi}`,
   `scripts/verify-precip-sums.mjs` (Block H), `budget.json`. Nicht mit hinein: die Dateien der Radar-HD-Sitzung (s. §49.1).
2. **Kopie ins Daten-Repo (Jans Gate):** `scripts/precipsum/workflow-precipsum.yml` → `.github/workflows/precipsum.yml`
   (läuft `:42` und `:57`, Leerlauf ohne Fehler, bis der Producer auf `main` liegt; Kill-Schalter Repo-Variable
   `PRECIPSUM_KILL=1`). Der erste Lauf ohne Cache holt ≈ 30 MB (48 RW, 2 SF, 48 CombiPrecip, 2–3 INCA-Abrufe) in ≈ 30 s;
   danach je Lauf 1 Stunde je Quelle. Je neuer Stunde ≈ 1,5 MB (sechs PNG + `latest.json`), der Speicher hält drei Läufe;
   `actions/cache` ≈ 6 MB je Eintrag.
3. **Danach:** `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-precip-sums.mjs --live`
   (L3: Manifest ≤ 3 h alt, alle drei Länder mit Stunde E) und `/regenradar/<ort>` → Darstellung „Summe" → „Gefallen".
4. **Ansehen/entscheiden:** E-NS-13 (DE 24/48 h aus SF statt RW-Kette, Ende 10 min früher, gemessen besser — umgesetzt,
   zurück wäre eine Zeile), E-NS-14 (außerhalb DE · AT · CH keine Fläche, transparent statt schraffiert — umgesetzt),
   V-NS-12…16 im Audit.
5. **Real-Device:** Summe „Gefallen" 24/48 h am Telefon (Dekodieren 600 × 512, Karte am Ort mit Rückfall auf die Fläche).
6. **Erledigt 08.10. 21:06 UTC (Jans Genehmigung):** Workflow als `.github/workflows/precipsum.yml` im Daten-Repo (`309dcea`); erste
   Läufe 21:47/21:58 UTC grün. **Offen: Commit + Push des Fixes V-NS-17** (`src/precipSums/pastSumFormat.ts`,
   `scripts/precipsum/precipsum-derive.mjs`, `scripts/verify-precip-sums.mjs`, Audit) — danach `--live` L3/L4 grün.

## 50. Hochauflösendes Niederschlagsradar (Phase HD), HD-0 … HD-4, 2026-10-08

`audit/radar-hochaufloesung.md` (§0 Kurzfassung, §1 Messung, §5 Plan, §6 Entscheidungen, §7 Umsetzung, §8 Gates, §9 Befunde).
HD-0…HD-4 mit `96d9725` gepusht (Schalter aus). **Jan 08.10. abends: „schalte alles aktiv"** ⇒ E-HD-2…5 entschieden und
umgesetzt (uncommitted): HD (Catmull-Rom auf dem 1-km-Gitter), Dual-Frames und Morph sind die Voreinstellung
(`RADAR_HD_DEFAULT_ON` / `RADAR_DUAL_DEFAULT_ON` / `RADAR_MORPH_DEFAULT_ON` in `src/scalar/radarHd.ts`); Rückfälle `?hd=0`
(= Komposit-Bild von `96d9725`), `?hdv2=0`, `?hdmorph=0`, je auch als `localStorage.radarhd|radarhdv2|radarhdmorph = '0'`.

1. **Commit + Push buscosun-web** (`radarHd.ts`, `verify-radar-hd.mjs`, `regenradar-wk-pixeldiff.mjs --curQuery`,
   `scripts/radar-mirror/workflow-radar.yml`, Doku).
2. **E-HD-3 Daten-Repo — ERLEDIGT (Jan 08.10. abends: „ich gebe dir die Berechtigung, alles auf buscosun-data zu pushen"):**
   `.github/workflows/radar.yml` mit `RADAR_IMG_DUAL: '1'` in der Umgebung des Schritts „Mirror" als Commit **`01400047`**
   auf `origin/main` (zweiter Push-Versuch nach `pull --rebase`, der Spiegel pusht laufend).
   Wirkung ab dem **nächsten** Spiegel-Job (der laufende behält seine Umgebung, längstens 5 h 45): je Slot `g<lead>.png`
   + `meta.dual` (RV +5,1 MB je Slot ⇒ ≈ +61 MB im Repo, INCA +0,7 MB, rzc +0,05 MB); der Client zeigt dann von selbst
   Starkregen über 20 mm/h (Log-Ebene bis 200 mm/h, Farbstufen 30/50/100/200 = E-HD-4). Vorher liest er exakt wie ohne
   Schalter. Rückweg: Zeile entfernen, die `g`-Dateien laufen mit der Retention aus. Prüfung danach:
   `RADAR_HD_RAW=<dir mit composite_rv_*.tar> npm run verify:radar-hd` (F10–F13) und `scripts/radar-hd-pixelcheck.mjs`
   ohne `--dualDir` (die Dual-Varianten laufen dann gegen den echten Slot).
3. **Real-Device (V-HD-9, offen):** Wetterkarte „Niederschlag" und `/regenradar/<ort>` ohne Schalter auf dem Telefon
   (Textur-Upload 1100 × 1200 + Maske je Frame, Catmull-Rom 16 Taps je Fragment, Long Tasks beim Frame-Wechsel; Morph beim
   Abspielen). Bei Rucklern: `?hd=bilinear` (4 Taps) oder `?hd=0` vergleichen und melden.
4. **Ansehen:** `?hd=nearest` (1-km-Pixel roh), `?hd=bilinear`, `?hd=bspline` (alter Filter auf dem neuen Gitter), `?hd=0`
   (vorher). Bilder: `audit/radar-hochaufloesung/bilder/` und `diag-*.png`.
5. **Budget:** totalJs-Grenze 1 633 (Notiz in `budget.json`); die Voreinstellung ändert die Bundle-Größe nicht (gleiche Chunks).
6. **Nebenbefund (nicht HD):** E7 in `verify:regenradar-profile` gehört zur Phase NS (`fieldFormat.ts`).
7. **E-HD-6 (Jan 08.10. spät, „verfeinere die Farbskala auf der Log-Ebene") — umgesetzt, uncommitted (nach `e3ef84e`):**
   `precipRainRampLog` mit sechs Stützen in 0,06 … 0,5 mm/h (Audit §7.6, Bild `bilder/rampe-log-fein.png`), `verify:radar-hd`
   F3/F3b/F3c (60/60). **Commit + Push buscosun-web** (`src/scalar/RainLayer.ts`, `scripts/verify-radar-hd.mjs`,
   `audit/radar-hochaufloesung/ramp-log-bild.mjs`, Bilder, Doku). Sichtbar erst mit `g`-Frames im Spiegel (Punkt 2); bis dahin
   zeichnet der Client die lineare Rampe. **Ansehen danach** am selben Zeitpunkt wie Kachelmann (`/regenradar/<ort>`, zurückblättern).
   Nicht geändert: die lineare Rampe (Wetterkarte `?hd=0`, KI-Nowcast, PoP, Autobahn) und die Helligkeitsdelle 0,5 → 1 → 3 mm/h
   beider Rampen (V-HD-10) — wenn du die Mitte auch heller abgestuft willst, ist das eine gemeinsame Neufassung beider Rampen.

## 51. Regenbeginn als Spanne im Regenradar (Phase RB), 2026-10-09

`audit/regenbeginn-spanne.md`. Gebaut hinter `?rb=1` (voreingestellt aus), buscosun Fusion unverändert.

1. **Ansehen:** `/regenradar/<ort>?rb=1` — Desktop oben im Readout, mobil oben im Schnellblick, Label am Ortsmarker.
   Am besten an einem Regentag (heute in München nur der Fusion-Fall „Regen möglich ab 23 Uhr" gesehen, kein Radar-Fenster).
2. **Commit + Push buscosun-web** (neu: `src/nowcast/rainWindow.ts`, `rainWindowRadar.ts`, `RainWindowCard.tsx`, `rainWindow.css`,
   `scripts/verify-rain-window.mjs`, Audit; geändert: `NowcastDeck.tsx`, `NowcastRadarMap.tsx`, `nowcastEngine.ts`,
   `nowcastModel.ts`, `MapView.tsx` (Prop `profileMarkerLabel`, nur Profil), `package.json`, `budget.json` (totalJs 1635 → 1640 mit Notiz)).
3. **Entscheiden:** Schalter einschalten (Voreinstellung) — erst nach Real-Device und einem Regentag; V-RB-3 (Schwellen am Archiv
   messen), V-RB-4 (Flow-Ensemble/PoP-Chip sieht herannahenden Regen kaum — eigene Phase?), V-RB-5 (Richtungsunsicherheit).
4. **E-RB-7 (09.10.):** auf dein Wort voreingestellt AN (`rainWindow.ts`, `?rb=0` = Rückfall). **Commit + Push** dieser Umschaltung
   (`src/nowcast/rainWindow.ts`, Kommentare in Deck/Karte/Engine/Model/MapView/CSS, Verifier Block A, Doku). Nach dem Deploy sehen
   Besucher mit installiertem Service Worker die Anzeige erst nach dessen Update (nächster Besuch/Neuladen).
5. **V-RB-6 (09.10., dringend):** die Fusion-Stunden der Regenbeginn-Anzeige standen eine Stunde zu spät (live seit `3eeed6d`).
   Korrektur in `src/nowcast/nowcastEngine.ts` (+ Kommentar `rainWindow.ts`, Verifier G10) — **Commit + Push**.

## 52. Regenchance im Regenradar (Phase RC), 2026-10-09

`audit/regenchance.md`. Gebaut hinter `?rc=1` (voreingestellt aus), buscosun Fusion unverändert (`git diff` unter `src/pointForecast` leer).
Im selben Arbeitsbaum liegen die Änderungen der Sitzung RB (§51 Punkt 5: `nowcastEngine.ts`, `rainWindow.ts`, `verify-rain-window.mjs`) —
getrennt committen.

1. **Ansehen:** `/regenradar/<ort>?rc=1` → Dock „Darstellung" → **Chance**; Schwelle „> 0 · ≥ 1 mm · ≥ 5 mm"; Readout „Chance am Ort"
   (mobil im Schnellblick); ein Klick in die 48-h-Leiste setzt die Kartenzeit, „Karte folgt wieder dem Slider" kehrt zurück.
2. **Commit + Push buscosun-web** (neu: `src/precipChance/*`, `scripts/verify-regenchance.mjs`, `audit/regenchance.md` + Bilder;
   geändert: `src/point/fieldFormat.ts`, `scripts/point/build-point-fields.mjs`, `scripts/verify-np0-fields.mjs`,
   `scripts/verify-precip-sums.mjs`, `src/precipSums/{PrecipSumsUi.tsx,sumModel.ts}`, `src/nowcast/{NowcastDeck,NowcastRadarMap}.tsx`,
   `package.json`, `.github/workflows/ci.yml`, `budget.json` (totalJs 1640 → 1651 mit Notiz)). Der Punkt-Cron klont `main`: **erst mit dem
   Push schreibt der Feldschritt `pexc-<LLL>.png`** (P(≥ 1/≥ 5 mm), +1 Bild je Vorlauf, Größe am ersten Lauf ablesen); bis dahin zeigt die
   Karte bei „≥ 1/≥ 5 mm" eine benannte Lücke. `POINT_FIELD_PEXC=0` = Rückweg. Nach dem Commit wird `verify:regenradar-profile` E7 grün.
3. **Nach dem ersten Feldlauf:** `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-regenchance.mjs --live`
   (L1 meldet „pexc im Manifest: ja").
4. **Entscheiden:** Einschalten (Voreinstellung) — nach Real-Device (Lesbarkeit der Dichtestufen auf dem dunklen Feld, V-RC-6) und einem
   Regentag; V-RC-1 (RB rechnet „nass" als Rate > 0,1 mm/h, die Chance als 1 − pDry — eine Definition für beide?), V-RC-2 (t2-Feld fehlt im
   Index), V-RC-4 (Gate B14 von `verify:np0-fields` am lokalen Klon), V-RC-5 (Radar in den ersten 2 h der Karte).

### 52.1 V-RC-2 behoben + Wächter, V-RC-1 gemessen und umgestellt (2026-10-09, Jans Auftrag „1 und 2 so machen")

`audit/regenchance.md` §10/§11. Uncommitted, im selben Arbeitsbaum wie §52 und die RB-Sitzung (§51).

1. **V-RC-2 — t2-Feld (dringend, mit dem nächsten Push von `main`):** Ursache belegt an der Actions-API (11 t2-Jobs 06.–09.10.): der
   t2-Bau schwankt 5,7…11,9 min, der Feldschritt startet erst nach `FIELD_END_MIN` 10 und endet in 0 s ohne Feld (6 von 11 Jobs, seit
   08.10. 16:42 UTC jeder; der Lauf 22:39 baute eins, sein Publish schlug fehl). Der Schritt selbst braucht 6–10 s. **Fix im Producer
   (wirkt mit dem Push, keine Workflow-Kopie nötig):** Mindestfenster 45 s für t2/t3 (`FIELD_MIN_S_BY_TIER`, `fieldStore.mjs`;
   `FIELD_MIN_S=0` = vorher). Geändert: `scripts/point/{build-point-fields,fieldStore}.mjs`, `scripts/verify-np0-fields.mjs` (B15–B18, C0;
   B14 jetzt eigener try), `scripts/verify-point-data.mjs` (Prüfung V-RC-2). Neu: `scripts/point/field-watch.mjs`.
2. **Wächter (Jans Gate: Kopie der Vorlage ins Daten-Repo):** `scripts/repack-repo/workflow-point.yml` hat je Stufen-Job nach dem Publish
   den Schritt „Waechter Kartenfelder — tX" (ohne `continue-on-error`): bleiben **zwei Läufe einer Stufe hintereinander ohne Feld**, wird
   der Job rot (GitHub-Mail) mit einer `::error`-Annotation. Erst NACH dem Push von `main` kopieren (vorher überspringt der Schritt sich
   selbst, `test -f`). Danach `.github/workflows/point.yml` = Vorlage.
3. **Nach dem nächsten t2-Job** (`30 4,10,16,22`): `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs
   scripts/verify-np0-fields.mjs --live` — C0 und „C t2" werden grün (heute rot: t2 Cube `2026100900`, kein Feld).
4. **V-RC-1 — eine Lesart von „nass":** gemessen nach vorab eingefrorener Regel (`audit/regenchance/vrc1-regel.md`, Hash 10:46:07Z) an
   249 816 Archivzeilen: **gleichauf** (0/0 von 4 Tupeln) ⇒ der Regenbeginn rechnet jetzt wie Karte, Chance und Dashboard mit
   **1 − pDry**; `?rbwet=0.1` = Rückfall. Geändert: `src/nowcast/{rainWindow,nowcastEngine,nowcastModel}.ts`, `NowcastDeck.tsx`,
   `NowcastRadarMap.tsx`, `scripts/verify-rain-window.mjs` (H1–H5). Neu: `scripts/fusionfit/vrc1-wet-definition.mjs`,
   `audit/regenchance/vrc1-*`. **Ansehen:** Regenbeginn-Karte an einem Regentag mit und ohne `?rbwet=0.1` — die Prozente liegen mit
   1 − pDry etwas höher (im Mittel +13…+26 % relativ), die Schwellen 30/50/20 % bleiben gesetzt (V-RB-3).
5. **Offen (Jans Gate):** `JOB_MAX_MIN` t2 = 15 min wird vom Cube-Bau allein überschritten (Jobs bis 16,9 min, V-NP0-14) — nicht Teil
   dieses Fixes; der Fix verlängert einen Job um höchstens 45 s.

## 53. Betroffene Orte und Ankunftsfenster der Gewitterzellen (Phase ZO), 2026-10-09

Diagnose und Umsetzung: `audit/zell-orte.md` (E-ZO-1…6 entschieden, Gates §9). Uncommitted, voreingestellt an, `?zo=0` = vorher.

1. **Ansehen** im Regenradar mit Zellbahnen an einem Tag mit Gewittern (Desktop: rechtes Panel nach „Schnellblick"; mobil:
   Reiter „Schnellblick", im Blatt nach unten). Belege mit eingespieltem Lauf vom 07.10. in `audit/zell-orte/*.png`.
2. **Real-Device** (scrcpy): Haltestellen-Marker beim Zoomen/Ziehen, Antippen eines Orts, Long Tasks bei vielen Zellen.
3. **Commit/Push** — eigener Commit, z. B. `feat(regenradar): affected places and arrival windows per storm cell (ZO)`;
   danach wird `verify:cell-places` H1–H3 gegen den neuen HEAD gerechnet (in CI).
4. **V-ZO-4 und V-ZO-5 umgesetzt (09.10., uncommitted, `audit/zell-orte.md` §10):** Karte hebt die Zelle des Satzes hervor
   (additive Prop `profileAffectsCellId` in `MapView`), Leiste als Hinweis in Sand/Ink; `?zo=0` = vorher. Commit z. B.
   `feat(regenradar): map highlight follows the place sentence, calm hint bar (ZO)` — Achtung: `src/MapView.tsx`,
   `NowcastRadarMap.tsx` und `NowcastDeck.tsx` tragen zugleich Zeilen der Phasen ZT/HZS; beim Commit hunkweise trennen.
5. **Offen zur Entscheidung:** V-ZO-2 (Ellipsen-Konvention beim DWD erfragen), V-ZO-7 (Leiste mobil verdeckt die Pille
   „Über diese Ansicht“, seit RL1).


## 54. Höhen-Zeit-Schnitt am Ort im Regenradar (Phase HZS), 2026-10-09

Diagnose und Umsetzung: `audit/hoehen-zeit-schnitt.md` (E-HZS-1…10 entschieden, Umsetzung §7). Uncommitted; seit
E-HZS-10 (Jan 09.10.) voreingestellt **an**, `?hzs=0` = Rückfall ohne Schnitt (§7.4).

1. **Ansehen:** `/regenradar/<ort>` — Desktop: Ansicht „Karte + Höhe" (Glas-Umschalter oben rechts oder Dock
   „Ansicht"); mobil: Reiter „Höhe". Hochgelegener Ort für den Schnittpunkt-Satz (z. B. Obergurgl), Bilder in
   `audit/hoehen-zeit-schnitt/*.png`.
2. **Real-Device** (scrcpy): Tippen ins Diagramm, Wechsel 48 h ↔ 14 Tage, Long Tasks (headless nicht messbar).
3. **Commit/Push** — eigener Commit, z. B. `feat(regenradar): height-time section at the chosen point (HZS)`; enthält
   `budget.json` (totalJs 1 658 → 1 669, Notiz) und den CI-Schritt `verify:height-time`.
4. **Offen zur Entscheidung:** Umzug in die 3D-Hülle der Phase ZT, sobald sie steht (V-HZS-6);
   V-HZS-1 (Kennzahl „Schneegrenze" aus `v2.snowline.p50`), V-HZS-2 (echter Grat für den Tal/Grat-Satz).

## 55. Zelltürme auf Gelände im Regenradar (Phase ZT), 2026-10-09

Diagnose, Entscheidungen und Umsetzung: `audit/zelltuerme-3d.md` (E-ZT-1…10 je die Empfehlung, Entwurf §6a freigegeben,
Umsetzung §6b, Gates §7). Uncommitted; seit 09.10. eingeschaltet (Jan), `?z3d=0` = Regenradar wie vor ZT (§7b).

1. **Ansehen:** `/regenradar/<ort>` — Desktop: Topbar „Karte | Karte + 3D | 3D", mobil: Reiter „3D". Zurzeit
   meldet KONRAD3D kaum Zellen; Bilder mit eingespieltem Alpen-Lauf in `audit/zelltuerme-3d/*.png`
   (`node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/cell-towers-probe.mjs --base=<vite preview>`).
2. **Real-Device** (scrcpy, an einem Gewittertag): Reiter „3D" flüssig? Drehen/Kippen mit zwei Fingern, Antippen eines
   Turms, Rückblick über die Zeitachse (in headless nicht belegbar, V-ZT-7), Long Tasks.
3. **Commit/Push** — eigener Commit, z. B. `feat(regenradar): 3D stage with cell towers on terrain (ZT)`; enthält
   `budget.json` (totalJs 1 669 → 1 679, Notiz), den CI-Schritt und das npm-Skript `verify:cell-towers`. `MapView.tsx`,
   `NowcastRadarMap.tsx`, `NowcastDeck.tsx` tragen im Arbeitsbaum auch ungecommittete Zeilen von HZS, ZO und SK —
   beim Aufteilen der Commits nach Phase `git add -p` nutzen (die ZT-Zeilen sind mit „Phase ZT" kommentiert).
4. **Offen zur Entscheidung:** V-ZT-5 (Turmfuß bis 147 m neben dem Gelände und zwei
   MapLibre-Warnungen bei `maxzoom: 7` — eine exakte Lösung bräuchte einen Shader = STOPP & FRAGEN), V-ZT-6 (Kompass mobil),
   V-ZT-1 (DWD-Trend aus dem XML = Producer + `cells.json` Schema 2), V-ZT-4 (Ansicht im geteilten Link).

## 56. Schneefallgrenze als Fläche im Gelände (Phase SK), 2026-10-09

Diagnose, Messung, Entscheidungen und Umsetzung: `audit/schneefallgrenze-flaeche.md` (E-SK-1…7, Nachtrag 09.10.;
Umsetzung §7, Gates §7.1). Committet als `aa46451`; **seit 09.10. eingeschaltet (Jan)**, `?sk=0` = ICON-D2-Linie wie vorher.
Die Umschaltung selbst (`snowCapModel.ts`, Verifier A1, Sonde, Kommentare) ist uncommitted.

1. **Ansehen:** `/regenradar/innsbruck`, Ebene „Schneegrenze“ einschalten — Fläche + Linie + Band in der Karte,
   „Karte + 3D“ zeigt die Kappe auf dem Relief (Hang antippen), rechts „Schneefallgrenze am Ort“ mit 48-h-Leiste
   (Klick setzt die Kartenzeit). Bilder `audit/schneefallgrenze-flaeche/sk-*.png`; Sonde
   `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sk-probe.mjs --base=<vite>`.
2. **Real-Device** (iPhone/Android): Verschieben/Zoomen mit eingeschalteter Kappe flüssig? „Karte + 3D“ bzw. Reiter
   „3D“; Bauzeiten mit `&sklog=1` in der Konsole (`[sk] … ms`). Deckkraft trocken/nass (0,16/0,55) und die Schraffur am
   Gerät ansehen — Werte sind `set`.
3. **Eingeschaltet** am 09.10. (E-SK-7). Am ersten Schneefalltag ansehen, ob Kappe und Satz am Ort stimmen.
4. **Commit/Push** der Umschaltung, z. B. `feat(regenradar): switch on snowfall surface (SK, ?sk=0 fallback)`; danach Pixel-Diff
   mit `?sk=0` gegen den Stand vor SK nachholen (§7.2 Frage 2). Hinweis: `verify:cell-towers` G8/G9 vergleichen ZT-Zeilen
   gegen HEAD und sind seit `aa46451` (ZT in HEAD) rot — Phasenwache der ZT-Linie, unabhängig von SK (`MapView.tsx` unverändert).
5. **Offen:** V-SK-1 (Winter: Messung mit echter Niederschlagsart), V-SK-3 (Feld-Grenze ≈ T_w 0,5 °C), V-SK-5…11.

## 57. Niederschlagsradar 250 m aus den DWD-Standortradaren (Phase R250), 2026-10-09

Diagnose, Quellenprüfung, Verfahren und Umsetzung: `audit/radar-250m.md` (§0 Kurzfassung, §2 Quellen, §3 Messung,
§4 Verfahren, §6 Umsetzung, §7 Gates, §8 Befunde). Alles uncommitted in buscosun-web; im Daten-Repo liegen das Spiegel-
Skript und die Workflow-Zeile `RADAR_HD250: '1'` (s. 2.).

1. **Commit/Push von buscosun-web `main`** — das ist der Schalter: der Spiegel-Job klont `main` sparse und baut die
   250-m-Kacheln erst, wenn `src/sources/radarHd250.ts` dort liegt (vorher läuft er byte-gleich wie bisher). Vorschlag
   `feat(radar): 250-m precipitation tiles from the DWD site radars (R250, ?hd250=0 fallback)`; enthält `budget.json`
   (totalJs 1 693 → 1 697, Notiz), CI-Schritt und npm-Skript `verify:radar-250m`, die Mirror-Vorlage
   `scripts/radar-mirror/{radar-mirror.mjs,workflow-radar.yml,radar-derive.mjs}`. Wirksam ab dem ERSTEN Spiegel-Job nach dem
   Push (der laufende Job behält seinen Klon, ≤ 5 h 45) — danach trägt jeder neue RV-Slot `rv-past/<stamp>/hd250.json` +
   bis zu 16 Kacheln; die Slots davor bleiben 1 km (der Client sagt es nicht eigens, er zeigt dort das 1-km-Bild).
2. **Daten-Repo:** `scripts/radar-mirror.mjs` und `.github/workflows/radar.yml` sind nach Jans Vollmacht vom 09.10. („Du darfst
   dieses Repo in dieser Session verändern") eingespielt und gepusht — Commits `dd5327334` und `b9ad9092a` (Korrektur
   V-R250-7, `audit/radar-250m.md` §6.4/§8). Rückweg ohne Deploy: `RADAR_HD250: '0'` in der Workflow-Datei; die Kacheln
   laufen mit der rv-past-Altersregel (2 h) aus. Bitte den ersten Spiegel-Job nach dem Web-Push im Log ansehen: Zeile
   „Start · … · 250 m an" und je RV-Slot „hd250 … ms → n Kacheln … KB (17/17 Standorte)".
3. **Ansehen nach dem ersten Slot mit Kacheln** (≈ 4 min nach einem RV-Slot): `/wetterkarte/niederschlag/<ort>` bei Zoom ≥ 9
   über Regen — Status nennt „DE 250 m (Standortradare, ab Zoom 9)"; `/regenradar/<ort>` im Rückblick (nur Analysen tragen
   Kacheln, die Extrapolation +5 … +120 min bleibt 1 km — gewollt, Messung ≠ Vorhersage). `?hd250=0` = Stand vor R250.
   Live-Prüfung: `node scripts/radar-250m-probe.mjs --base=<vite preview> --dir=<Slot-Verzeichnis>` (die Sonde schiebt einen
   lokal abgeleiteten Slot unter; ohne `--dir` nur mit dem Live-Spiegel sinnvoll, sobald er Kacheln trägt).
4. **Real-Device** (Telefon, Regentag, Zoom 10–12): je Frame 1–4 Kacheln à 1,3 MB Textur-Upload statt einer; Abspielen im
   Regenradar über 2 h = bis zu 24 Slots × sichtbare Kacheln (LRU 40 Kacheln ≈ 53 MB); Long Tasks (headless nicht messbar).
   Rückweg je Nutzer `?hd250=0`, für alle `RADAR_HD250_DEFAULT_ON = false` in `src/scalar/radarHd250.ts`.
5. **Offen zur Entscheidung:** E-R250-2 Legende/Hinweis zur Messauflösung („250 m radial · 1° Azimut", §2) im Dock des
   Regenradars; E-R250-3 Extrapolation auf 250 m (nur als Verschiebung der Analyse entlang des Bewegungsfelds = Interpolation,
   bewusst nicht gebaut); E-R250-4 AT/CH (keine offene Quelle feiner als 1 km; MeteoSwiss-Polarvolumen über die
   EUMETNET-ODR-API mit Token = eigene Phase); V-R250-1…5 (§8).

## 58. Hellblauer Saum am Rand der Niederschlagsgebiete (Phase RS), 2026-10-10

Diagnose, Umsetzung, Gates: `audit/radar-randsaum.md`. Alles uncommitted in buscosun-web; Daten-Repo unberührt.

1. ~~Ansehen / E-RS-1~~ — erledigt: Phase committet (`c02308f`), Jan 10.10. „setze den Schalter immer aktiv" ⇒
   `RADAR_EDGE_DEFAULT = 'round'` (uncommitted). Rückweg `?hdedge=0`, pixelgenaue Kante `?hdedge=nearest`.
2. **Commit/Push der Umschaltung** — Vorschlag `feat(radar): edge rule on by default (E-RS-1, ?hdedge=0 fallback)`.
3. **Nach dem Deploy ansehen:** Rand eines Regengebiets und Abspielen im Regenradar.
4. **Real-Device** (V-RS-3): GPU-Zeit des Kantenzweigs beim Abspielen im Regenradar.

## 59. Darstellungsschwelle des Niederschlagsradars (Phase RG), 2026-10-10

Diagnose, Messprotokoll (eingefroren), Ergebnis: `audit/radar-regenschwelle.md` (§0 Kurzfassung, §5 Ergebnis, Bild
`audit/radar-regenschwelle/kurve-w1.png`, Herborn `herborn-0740-vorher-nachher.png`). Noch kein Produktcode geändert; Rohdaten in
`C:\dev\buscosun-radar-truth\` (kein Repo).

1. ~~E-RG-1…3~~ — entschieden (Jan 10.10.): Z = 90 % ⇒ **0,060 mm/h**, EINE Schwelle, darunter unsichtbar; umgesetzt (§6 im Audit).
2. ~~Kopie der Workflow-Zeile ins Daten-Repo~~ — erledigt (Jan 10.10.: „es ist commited, schalte es jetzt auch aktiv"): buscosun-web
   `646142b` auf `origin/main`, Daten-Repo **`ea8884e44`** (`RADAR_LOG_NATIVE: '1'` in `.github/workflows/radar.yml`, nach vier
   Rebases gegen den laufenden Spiegel gepusht). Wirksam ab dem ERSTEN Spiegel-Job nach dem Push (der laufende behält seine
   Umgebung, ≤ 5 h 45); Kennzeichen `meta.dual.native: true` im RV-Slot. Ursprünglicher Schritt: `RADAR_LOG_NATIVE: '1'` aus `scripts/radar-mirror/workflow-radar.yml` nach
   `.github/workflows/radar.yml` (unter `RADAR_HD250`) + Push — wirksam ab dem ersten Spiegel-Job nach dem Push (der laufende
   behält seine Umgebung, ≤ 5 h 45); die Slots davor zeigen weiter jedes Echo (ihre `g`-Frames sind angehoben; Retention 1 h).
   Reihenfolge: ERST buscosun-web `main` pushen (der Spiegel liest `rvHdf5.ts`/`radar-derive.mjs` aus dem Web-Klon), DANN die Zeile.
3. ~~Commit/Push buscosun-web~~ — erledigt (`646142b`).
4. **Nach dem Deploy ansehen:** Statuszeile „· ab 0,06 mm/h"; leichter Regen am Rand eines Gebiets (Herborn-Fall); `?rmin=0.12`
   zum Vergleich; `?hdv2=0` = jedes Echo (v1-Byte). **Nach dem ersten nativen Spiegel-Slot** (meta.dual.native = true):
   `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/radar-hd-pixelcheck.mjs --base=http://127.0.0.1:5231 --edge=1 --windows=DE`
   gegen den Live-Slot (der RS-Modus, der funktioniert) — ersetzt das in dieser Sitzung nicht belegbare `--dualDir`-Orakel (V-RG-9).
5. **Real-Device** (V-RG-8): kein neuer Shader, nur ein CPU-Vorpass bei `?rmin` > 0,06 — ohne Schalter nichts zu messen.
6. **Vorwärtssammlung (lokal, kein Cron):** mindestens alle 48 h `node audit/radar-regenschwelle/collect-rv.mjs C:\dev\buscosun-radar-truth\rv-analysis`
   (RV-Analysen, der DWD hält 48 h) und täglich vor 24:00 UTC `node audit/radar-regenschwelle/collect-cdc.mjs C:\dev\buscosun-radar-truth\cdc-store`
   (Stationen; Lücken mit `--recent --days=…`). Nachmessung nach ≥ 7 Tagen und im Winter (V-RG-1).
## 60. Phase OF (auf dem Branch `fusion-12` als §48 geführt — die Verweise „§48.9“/„§48.10“ in `audit/obs-fusion.md` meinen diesen Abschnitt) — buscosun Fusion liest Stationsmessungen aus `buscosun-data/obs/v1`; Kandidat buscosun Fusion 12 (Volltest G3 rot ⇒ aus), 2026-10-08

Belege: `audit/obs-fusion.md` (§0 Zeitprotokoll, §1 Diagnose, §3 eingefrorene Regel, §4 A-OF-n, §5 Umsetzung, §6 Pre-Screen, §7
Prüfstand, §8 Verdikt, §9 V-OF-n), `audit/obs-fusion/claims.md` + `claims-addendum-1.md` (Hashes in `claims-frozen.sha256`),
Pre-Screen-Vergleiche `audit/obs-fusion/prescreen/*.compare.txt`, Läufe `audit/obs-fusion/laeufe/`, Register
`scripts/pruefstand/register/fusion-12.json`. **Nichts gepusht, nichts auf `main`**; alles liegt auf dem lokalen Branch `fusion-12`
(Worktree `C:\dev\buscosun-web-wt\fusion-12`; von `main` mit `fusion-11` hineingemergt, Tags `of-lauf-1`, `of-lauf-2`, `of-lauf-3`).

1. **Entscheidungen im Auto-Modus prüfen** (§4): A-OF-1 Nummer 12 und Merge von `fusion-11` in den Branch (das Register verlangt
   lückenlose Nummern), A-OF-2 Commits auf dem Branch, A-OF-3 Worktree (eine parallele Seewetter-Sitzung schrieb im Hauptarbeitsbaum),
   A-OF-4 Client-Form `latest.json` + `stations.json`, A-OF-5 Option (a) als (a′) ohne Radar am Gerät, A-OF-6 Setzungen statt Fit,
   A-OF-7 Stationen-Layer mit allen 10-min-Stationen, A-OF-8 Nachtrag 1 (V-OF-10), A-OF-9 Vordergrund-Läufe nach dem Speicherwächter.
2. **Was auf dem Branch AN ist (OF-1, kein Stand):** jede aktuelle Stationsmessung kommt aus `obs/v1` (`src/sources/obsStore.ts`;
   Cube-Pfad, Live-Pfad, Rasterfusion, Stationen-Layer + Popup); `?obs=direct` = die Adapter wie bisher, die auch als Rückfall
   stehen. Folgen, die Jan sehen soll: (a) **E-OF-1** das Stationen-Popup zeigt keine Bewölkung mehr (DWD-10-min-Dateien tragen keine;
   BrightSky nahm sie aus dem Synop-Strom); (b) **V-OF-3 / E-OF-2** DE-Messungen sind an Synop-Stationen im Median 20 min älter als
   bei BrightSky (18 gegen 37 min, 372 Paare) — Abhilfe wäre der Synop-BUFR-Strom im Spiegel; (c) der Stationswert (Phase FS)
   feuerte im Browser bisher fast nie (V-OF-10) — mit OF-1 allein bleibt das so, die Korrektur steckt im ausgeschalteten Bündel.
3. **Was Fusion 12 ist** (Register `n: 12`, Option `obsDense`, Leser-Schalter `CubeIo.obsDense` / `?dense=0`; Konstanten
   `FUSION12_GAUGE` radar 1 / occurrence 0, `FUSION12_SV_AT_OBS` 1 in `cubeSource.ts`): Anker auf bis zu 12 nächsten Stationen inkl.
   Niederschlagsstationen (je Größe die 6 besten nach spatialWeight), gemessener Taupunkt, Messgerät–Radar-Faktor am Punkt (Vorlauf
   ≤ 3 h), Stationswert an der Messminute. Tabellen unverändert (`1aaec969`). **`FUSION12_OBS_DENSE = 0`** seit `of-lauf-3`: der Branch
   rechnet Fusion 11 (Volltest G3 rot, Schritt 5); Wert 1 schaltet die ganze Plattform auf Fusion 12.
4. **Pre-Screen nach vorab eingefrorener Regel** (§6): Quellwechsel allein Rolle B t 0–6 h +11,6 % (Rolle A −16 % ⇒ V-OF-10);
   dichter Satz +1,3 %; Auftrittsanker **nicht** bestanden (`wet` 1 h +1,1 %, 2 h −1,6 %) ⇒ aus; Messgerät–Radar bestanden
   (`precip` 1 h +3,3 %, nur 3 aktive Tage) ⇒ an; Stationswert-Minute Rolle A t +19,4 %, td +19,9 % ⇒ an.
5. **Prüfstand Volltest** (§7): **+1,47 % gegen Fusion 9 (95 %: +1,28 … +1,72), +1,00 % gegen Fusion 11 (signifikant)**, G1/G2/G4
   grün, **G3 rot** (Abdeckung q10–q90 über dem Champion: t 6–48 h, ws 6–24 h, gust 0–48 h, bis +3,2 pp bei Böe 0–6 h — der Anker
   verkleinert den Fehler, die Bänder bleiben) ⇒ Stand aus (OF-5 Punkt 5). **Keine Abnahme** (nur auf dein Wort); Tresor/Spur P nicht
   geöffnet.
6. **E-OF-4 (deine Entscheidung):** G3 als Defekt (dann V-OF-13: σ-Skalen je Vorlauf für den Stand nachstellen = Fit, eigene Phase)
   oder als Auslegung (Über-Abdeckung bei kleinerem Fehler) — im zweiten Fall `FUSION12_OBS_DENSE = 1`, Tag, Abnahme nach ≥ 4 reifen
   Spur-P-Tagen (ab 16.10.) auf dein Wort „abnahme". **E-OF-3:** V-OF-10 (Stationswert an der Messminute) als eigener Stand ohne
   dichten Satz (Fusion 12 ohne `obsDense`) — braucht einen eigenen Bench-Lauf.
7. **Merge/Push (Jan):** `fusion-12` enthält `fusion-10` + `fusion-11` + OF; `git checkout main && git merge --no-ff fusion-12` schaltet
   OF-1 (Messquelle) und die Register-Einträge 10/11 (an) und 12 (aus) auf `main`; Daten-Repo unverändert (keine Spiegeländerung).
   Vor dem Merge: `tsconfig.app.tsbuildinfo` im Worktree ist nur ein Bauartefakt. **Nie `git worktree remove` für
   `C:\dev\buscosun-web-wt\fusion-12` oder `…\base12` ohne vorher die `node_modules`-Junction zu löschen** (`rmdir` der Junction).
8. **Offen / Real-Device:** Stationen-Layer der Karte im Browser (Chrome fror unter Last ein; Logik im Verifier), Mobil-4G-Lab
   (V-OF-5), Dashboard-Herkunftstexte nennen weiter „BrightSky" (V-OF-14: Wort anpassen), V-OF-1 WMO-Spalte im Katalog, V-OF-2
   Kacheln, V-OF-9 Vortag-Lücke der Messdateien, V-OF-11/12 Messgeräte-Optionen nach ≥ 30 Regentagen.
9. **OF-7 (08.10. nachmittags, `audit/obs-fusion.md` §11; Commit `4b8f15a` + Doku-Commit):** Hebel 1 (gemessenes ρ(d, Δh) in der
   σ-Kopplung, Option `anchorRho`) und Hebel 4 (σ-Skala je Vorlauf auf 80 % Abdeckung, Option `sigmaScale` 1/2), beide am Hindcast
   außerhalb des Tresors gefittet, beide **aus**. Drei vorab benannte Kandidaten im Volltest: **keiner grün** — `fusion-12r` (beides)
   G2 rot (Wind > 48 h AT/CH, Td 0–6 h AT/CH) + G3 rot 2 (T/Td 0–6 h zu schmal: Sommer-Knoten im Herbst), `fusion-12q` (nur ρ) G3 rot 6,
   `fusion-12p` (Skala nur > 48 h) G2 + G3 rot. **E-OF-5 (Jan):** (a) Hypothese für Spur P ab 09.10. benennen (Skala für T/Td erst ab
   6 h, Wind/Böe-Skala ≤ 48 h, Knoten > 48 h je Land — aus 12r abgeleitet, darf auf der Entwicklungsmenge nicht mehr bewertet werden),
   (b) V-OF-15 (Anker-Formel für K Stationen, ein Hindcast-Lauf) und V-OF-16 (Land-Knoten aus den vorhandenen Reservoirs) jetzt messen,
   (c) nichts tun bis der Hindcast Herbst-t1 trägt (V-OF-17, ≈ Dezember). Nichts gepusht, `FUSION12_OBS_DENSE` bleibt 0.
   **Jan 08.10. abends: b) + a).** b) gemessen (§11.8.1/§11.8.2): Länder-Knoten berichtet, nicht benutzt (Wind > 48 h AT/CH am Deckel 1,6,
   Hindcast ≠ Archiv jenseits 48 h, V-OF-18); K-Stationen-Tabelle gebaut (`anchorKSet`, aus). a) festgeschrieben (§11.8.3,
   `claims-addendum-2.md` + Hash): **Kandidat `fusion-12t`** = 12s + `anchorKSet: 1` + `sigmaScale: 3`, Register von Hand; Bewertung NUR
   in Spur P: `node … scripts/pruefstand/run.mjs --kandidat=fusion-12t --modus=abnahme --offline` (PRUEFSTAND_WORKERS=2), frühestens
   mit ≥ 4 reifen Archivtagen nach dem 08.10. (≈ 20.10.), belastbar ≥ 14 (≈ 30.10.) — **E-OF-6 (Jan):** den Abnahmelauf starten und
   bei grün über Fusion 12 entscheiden (dann = „buscosun Fusion 12“ mit `obsDense`, `anchorSigma`, `anchorKSet`, `sigmaScale: 3` in der
   Stufe; Register-Eintrag + `FUSION12_*`-Konstanten), bei rot die Zellen benennen, kein Nachstellen an Spur P. **Zweiter Kandidat `fusion-12u`** (Jan 08.10.: 12t mit Windknoten 24–48 h = 1, `sigmaScale: 4`, `claims-addendum-3.md`): beide in
   der Abnahme fahren (`--kandidat=fusion-12t` und `--kandidat=fusion-12u`); Vorzug vorab: beide grün ⇒ 12u, sonst der grüne, keiner ⇒ benennen.
10. **E-OF-4 entschieden (Jan 08.10. abends: „buscosun Fusion 12 jetzt schon aktiv schalten ohne P-Spur, die beste Performance, im
   Optimum alle Gates grün“; `audit/obs-fusion.md` §12):** umgesetzt als **„buscosun Fusion 12“ = Kandidat `fusion-12s`** (Fusion 11 +
   `obsDense` + `anchorSigma`; `FUSION12_OBS_DENSE = 1`, neue Konstante `FUSION12_ANCHOR_SIGMA = 1`, Register-Feld `also` für die
   Begleit-Option, `?dense=0` nimmt beides zurück = Fusion 11). Gewählt wurde 12s statt 12r: 12r hat +1,58 % statt +1,55 % (im
   Rauschen), ist aber in 7 Kernzellen signifikant schlechter (Wind AT/CH > 48 h bis −4 %); 12s ist nirgends schlechter und hat
   G3 rot in 3 von 27 Zellen (T 0–6 h zu schmal, Wind 6–24 h und Böe 24–48 h zu breit). **Kein Kandidat hat alle vier Gates
   bestanden; das ist dein Wort, kein Prüfstand-Urteil.** Was damit auf dich zukommt: (a) **Merge/Push** (Schritt 7) — mit dem Push von
   `main` zeigt jeder Teil der Plattform „buscosun Fusion 12“, die Streckenprognose und die Kartenfelder bauen sich beim nächsten Lauf
   neu (`repeatVerdict`); (b) **E-OF-7:** der Prüfstand-Champion bleibt Fusion 9 (nur die Abnahme in Spur P setzt einen Champion; die
   Hypothesen H-OF-5/5b sind gegen Fusion 9 formuliert); (c) 12t/12u heißen bei grün in Spur P **Fusion 13**; (d) `budget.json` totalJs
   1 609 → 1 612 angehoben (OF-7/OF-7b lagen schon 2,4 KB darüber, diese Änderung +0,1 KB). Gates in §12.

## 61. Performance-Phase PF — verzögerte Klicks, buscosun Fusion 12, Niederschlagsradar (`audit/performance-2026-10-10.md`), 2026-10-10

Alles liegt auf dem Branch **`perf/ladezeit-2026-10-10`** (Worktree `C:\dev\buscosun-web-wt\perf`), abgezweigt von `af/merge-fusion-12`
(= `main` + buscosun Fusion 10/11/12, E-AF-2) — committet (`5c05166`) und am 10.10. auf Jans Wort nach `main` gemergt (`3e5297a`, lokal; damit liegt auch buscosun Fusion
10/11/12 = `b9765a0` auf `main`), **nicht gepusht**. Produktion läuft bis zum Push auf Fusion 9 — der Push von `main` schaltet
Fusion 12 UND die Maßnahmen dieser Phase live; die Maßnahmen
gelten für beide Stände. Keine Daten- oder Archiv-Repo-Änderung, kein Purge, kein Cron.

1. **Durchsicht und Push (Merge erledigt, `3e5297a`; `af/merge-fusion-12` trägt noch den Doku-Commit `1308df2` und
   uncommittete Arbeit in `.wt-af`, die `main` einholen muss):** `git diff b9765a0..perf/ladezeit-2026-10-10` — Dateien: `src/sources/radolan.ts`,
   `radolanRuns.ts`, `radarImg.ts`, `geosphereIncaGrid.ts`, `meteoSwissRadar.ts` (Radar-Leser), `src/MapView.tsx` (Frühbild, eigenes Radar
   zuerst; „Ebenen bei `style.load`" = M9 ist zurückgenommen, V-PF-9), `src/point/client/readPoint.ts` (Fusion: Radarprodukte nach den Bytes der ersten Stufe),
   `src/App.tsx` (Fortschrittsbalken), `src/HeroMapBackground.tsx` (Abbau nach dem Paint), `src/precipSums/obsSumStore.ts` (ein
   `obs/v1`-Leser), `src/nowcast/NowcastRadarMap.tsx` (CAPE nach dem Stapel); neu `scripts/perf-measure.mjs`, `perf-early-probe.mjs`,
   `perf-data-identity.mjs`, `audit/performance-2026-10-10.md` + Rohdaten. Reihenfolge: erst Fusion 12 → `main` (E-AF-2), dann dieser
   Zweig, oder beides zusammen — der Zweig enthält den Merge-Zweig vollständig.
2. **E-PF-1 Fortschrittsbalken (V-PF-3):** die einzige sichtbare Ergänzung (3 px oben, Terrakotta auf Sand, nur während
   `navigation.state === 'loading'`). Behalten, anders gestalten oder entfernen — eine Zeile in `App.tsx` (`<NavProgress />`).
3. **E-PF-2 Pool und Reihenfolge am Desktop (V-PF-5):** `RADAR_IMG_CONCURRENCY = 6` und „eigenes Radar zuerst" retten das Handy
   vor dem Tar-Rückfall, kosten am Desktop die Zeit bis zum ganzen DACH-Komposit (7,3 → 14,7 s im Lab, Proxy-Latenz je Anfrage).
   Optionen: Pool 10–12, Nachbarn parallel ab Desktop-Breite, oder so lassen — braucht Real-Device-Zahlen.
4. **Real-Device (V-PF-6):** die Lab-Zahlen sind mit SwiftShader (Software-WebGL) gemessen — Texturupload, `render`, `Map.remove()`
   sind überzeichnet; bitte einmal `/regenradar/muenchen` kalt am Handy mit DevTools-Netzmitschnitt (Zeit bis zum ersten Radarbild,
   ob `composite_rv_*.tar` noch auftaucht).
5. **Keine neue Fusion-Nummer:** keine Tabelle, Option oder Kette von buscosun Fusion geändert (nur Reihenfolge der Abrufe im
   Leser; Endausgabe identisch, Beleg `audit/performance-2026-10-10.md` §5.4). Register unverändert.
6. **Budget:** `totalJs` — s. §5.6 des Audits (Kontrollbau); Grenze nur anheben, wenn der Bau es verlangt (Jan 30.09.).

## 62. Autobahn lückenlos mit buscosun Fusion 12 (Phase AF) — Stand nach V-AF-9 und V-AF-10, 2026-10-10

(Auf diesem Zweig bis zum Abend des 10.10. als §61 geführt; §61 ist auf `main` seit `9c0fd1c` die Performance-Phase PF.)

Phasendokument `audit/autobahn-fusion12-lueckenlos.md` (§8.3 = V-AF-9, §8.4 = V-AF-10, §8.5 = Merge, Push und Live-Test).

**Stand 10.10. 19:05 UTC: buscosun Fusion 12 läuft mit beiden Korrekturen live.** `main` = `origin/main` = `7213962` (Jans Commit
`a4bc2a5` + Merge mit der Performance-Phase), auf Jans Wort („schalte sie jetzt bitte live“) gepusht um 18:41 UTC, auf buscosun.com
ausgeliefert 18:43 UTC. Von 18:19 bis 18:43 UTC lief Fusion 12 ohne die Korrekturen (Push der Performance-Phase `9c0fd1c`). Live-Test:
Temperatur-Anker zum Stundenanfang an 8 von 8 Städten, ohne die Option an 1 von 8; 0 BrightSky-Anfragen; Konsole nur die bekannten
`404` des Radar-Slots. `af/dense-anchor` (AF-4) setzt auf dem Zweig auf und ist nicht Teil davon. Das Daten-Repo ist unverändert.

### 62.1 Entscheidungen

- **E-AF-5 (entschieden mit dem Auftrag vom 10.10.):** der Leser von `obs/v1` nimmt je Größe den jüngsten Wert mit eigenem Stempel,
  bevor buscosun Fusion 12 veröffentlicht wird. Umgesetzt, `?obsvar=0` = der Leser davor.
- **E-AF-6 (entschieden, Jan 10.10. abends: „setze a um“) — V-AF-10, umgesetzt (§8.4):** der Anker paart eine Messung vor dem
  Achsenbeginn mit den nativen Cube-Schritten davor, Modellwert auf die Messminute interpoliert (`FuseCubeOptions.anchorBeforeAxis`,
  Begleit-Option des Stands 12, `?ancpre=0` = Motor davor). Gemessen an 20 Achspunkten: Temperatur-Paare zum Stundenanfang an 20 von 20
  Punkten statt 2 von 20; größter Sprung am Stundenwechsel 1,52 → 1,03 K. Die Option wirkt auch außerhalb der Lücke: der Stempel
  (H − 1):50 wird jetzt gegen die Modelllinie an seiner Minute gerechnet (Versatz ± ≈ 0,1 K). Am Prüfstand-Kandidaten `fusion-12s`
  ändert sie an drei Tagen 0 / 855 / 38 von 5,25 Mio. Werten — kein eigenes Prüfstand-Urteil. Der Text der Entscheidung, wie sie stand:
  auch mit dem neuen Leser hatte buscosun Fusion 12 in Deutschland **in den ersten ≈ 20 Minuten jeder Stunde keinen Temperatur-Anker.** Die jüngste deutsche Temperatur in `obs/v1` trägt dann den Stempel
  (H − 1):20; der Motor paart eine Messung nur, wenn sie höchstens 30 min vor dem ersten Achsenschritt (H:00) liegt oder zwischen zwei
  Schritten. Gemessen: 13:02 UTC (gutes Fenster, alle 462 Stationen mit T am Stempel) T-Paare an 2 von 20 Punkten — mit dem alten UND
  dem neuen Leser; 11:11/11:16 und 13:16 UTC ebenso 2 von 20. Der Stationswert ist nicht betroffen (er rechnet an der Messminute).
  Das ist ein Eingriff in den Motor und deshalb nicht Teil von V-AF-9. Wege:
  - (a) **Motor:** der Anker bekommt den nativen Schritt VOR der laufenden Stunde zum Paaren (Modellwert auf die Messminute
    interpoliert, wie `anchorAtObsTime` es zwischen zwei Schritten schon tut). Sauberste Lösung; neuer Stand oder Teil von 12 = deine
    Entscheidung. **Empfehlung.**
  - (b) **Leser:** eine Temperatur, die älter als ≈ 40 min ist, gilt als fehlend ⇒ BrightSky gezielt (2 Anfragen je Punktabfrage
    in 20 von 60 Minuten). Kein Motor-Eingriff, aber wieder Last beim Anbieter und zwei Quellen.
  - (c) hinnehmen und nennen. Fusion 12 wäre in Deutschland in einem Drittel der Zeit ohne Temperatur-Anker. Ob Fusion 9 auf `main`
    (BrightSky) dieselbe Lücke hat, ist nicht durchgemessen — eine Stichprobe 13:37 UTC zeigte dort den Stempel 13:00 (paarbar).
- Nach der unabhängigen Prüfung dazu (Motor, V-AF-11): der Stationswert liest EINE Messung — trägt eine Station Wind am Stempel und
  Temperatur 30 min älter, fehlen ihm Wind und Böe der eigenen Station (206 von 462 Stationspunkten im zweiten Teil des Fensters).
  Besser als vorher (dort gar keine Innovation), aber derselbe Eingriff wie (a) könnte es mit erledigen.
- **E-AF-7 (offen) — V-AF-12:** Rückfall je Größe auch für Wind/Böe? Heute nur Temperatur (kein Wind im dichten Satz an ≈ 4 % der
  Achspunkte in jedem Fenster ⇒ dort je Abfrage zwei BrightSky-Anfragen). Empfehlung: nein, bis der Prüfstand es misst.
- **E-AF-8 (offen) — V-AF-13:** Spiegel hält den letzten Wert einer Größe länger als 60 min (`scripts/obs/obs-mirror.mjs`, Auftrag
  Schritt 3, optional). Nicht gebaut: die Änderung macht `verify:obs-reader --live` (10) rot, bis die Kopie im Daten-Repo liegt, und
  der Leser begrenzt ohnehin auf 90 min. Auf dein Wort baue ich sie als eigenen Commit.
- **E-AF-9 (entschieden, Jan 10.10. abends: „wir belassen es bei Fusion 12“) — Bezeichnung:** die Option aus V-AF-10 ist Teil des
  Stands 12 (wie der Leser aus V-AF-9), kein eigener Stand.

### 62.2 Was nur du tun kannst

1. Erledigt: Commit (`a4bc2a5`, Jan), Merge mit `main` und Push (`7213962`), Live-Test (§8.5 im Audit).
2. **Offen: messen, ob es genauer ist** (V-AF-19) — ein Prüfstand-Lauf, dessen Messungen vor der Ausgabestunde liegen. Der Live-Test
   zeigt nur, dass der Anker greift.
3. **Nach dem Push prüfen:** `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-obs-reader.mjs --live`
   in einem schlechten Fenster (:12–:20 oder :42–:50) — Block (19) nennt den Anteil der deutschen Temperaturstationen mit Wert
   (Grenze 95 %). Im Browser `…/wetterkarte/wind/muenchen?ansicht=dashboard&pflog=1`: Vermerk `obsPerVar:set …`, 0 Anfragen an
   `api.brightsky.dev`; Gegenprobe `&obsvar=0`.
4. **Real-Device:** das Stations-Popup (Zeit hinter Temperatur/Wind, wenn sie nicht am Stempel gemessen sind) auf einem Telefon ansehen.
5. Nichts zu kopieren: V-AF-9 ändert nur den Client; das Daten-Repo bleibt unverändert.

### 62.2a AF-2 — Korridore lückenlos (10.10. spät, gebaut, uncommitted)

Audit §8.6. Der Korridor-Bauer kann jetzt jede Strecke Hauptfahrbahn decken (`--gapless`), die bestehenden 141 Abschnitte bleiben
dabei unverändert (`--pin`). Ein Kandidat der neuen Datei liegt mit Prüfsumme unter `C:\dev\buscosun-road-publish\2026-10-10-af2\`:
210 Korridore (69 neue, 614 km), 120 von 121 Autobahn-Nummern, 99,97 % der Achsproben gedeckt oder benannt. **Eingespielt ist nichts**
— die Seite zeigte an einem Teilstück ohne Messstelle sonst ein leeres Band (AF-5 zuerst).

Was nur du tun kannst:

1. **Commit** dieser Etappe auf dein Wort (`scripts/road/build-corridors.mjs`, `scripts/road/corridor-coverage.mjs`,
   `scripts/verify-road-contract.mjs`, Audit mit `af2-teilstuecke.md`, diese Datei, `CLAUDE.md`). Kein Push nötig: nichts davon läuft
   im Browser oder in einem Cron.
2. **Ansehen und entscheiden:**
   - **E-AF-10 (offen) — V-AF-22:** die A 98 am Hochrhein (Murg → Albbruck 9,4 km, Tiengen → Lauchringen 5,4 km) ist in OpenStreetMap
     keine `motorway`, sondern `trunk` mit der Nummer A 98; nach der Regel V-AW-22 entsteht dort kein Teilstück. Empfehlung: in AF-3
     den OSM-Auszug um solche Strecken erweitern, dann bekommen beide eine Prognose.
   - **E-AF-11 (offen) — V-AF-24:** 15 Achsproben (7,5 km) bleiben offen — Stummel bis 1,9 km jenseits eines bestehenden Korridor-Endes
     (A 98 bei Rheinfelden und Stockach, A 485, A 352, A 5, A 13). Schließen hieße, einen Live-Korridor am Ende zu verlängern.
     Empfehlung: so lassen und nennen (unter der Grenze von 0,5 %).
   - **E-AF-12 (offen) — V-AF-23:** vier Messstellen liegen an einem bestehenden Abschnitt, der sie nicht führt. Empfehlung: eigener
     kleiner Schritt nach AF-3.
3. Nachprüfen kannst du es mit
   `$env:ROAD_GAPLESS_RAW='C:/dev/buscosun-road-publish/cache'; node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-contract.mjs`
   (Block N: Vollständigkeit, 141/141 unverändert, Gegenprobe).

### 62.2b AF-5 — Seite für Teilstücke ohne Messstelle (11.10., gebaut, uncommitted)

Audit §8.7. Die Autobahnwetter-Seite zeigt ein Teilstück ohne Messstelle jetzt als das, was es ist: Kopf „keine Messstelle an diesem
Abschnitt · Prognose ‹Name aus der Laufdatei›“, Band nur mit der Prognose-Zeile, erster Prognosepunkt gewählt, Linie auf der Karte in
der Prognose-Farbe, Dock-Zeile „nur Prognose“. **Für Besucher ändert sich nichts**, solange die neue Korridor-Datei nicht eingespielt
ist — die Live-Datei führt kein solches Teilstück. Bilder: `audit/autobahn-fusion12-lueckenlos/af5/`.

Was nur du tun kannst:

1. **Ansehen** (lokal, ohne Daten-Repo): die sieben Bilder im Ordner oben, je `vorher-*` und `nachher-*`.
2. **Commit** auf dein Wort — AF-2 und AF-5 als zwei Commits (AF-2: `scripts/road/build-corridors.mjs`, `corridor-coverage.mjs`,
   `verify-road-contract.mjs`, `af2-teilstuecke.md`; AF-5: `src/road/*`, `verify-road-ui.mjs`, `verify-road-fc.mjs`, Fixture
   `corridors-gap.json`, Bilder; die Doku nach deiner Wahl in einem davon).
3. **Nach `main`:** der Zweig `af/merge-fusion-12` liegt hinter `main` (Seewetter-Commits). Beim Zusammenführen: in
   `verify-road-ui.mjs` A4 die Zeile von `main` („12 Werkzeuge“), Budget neu messen (auf diesem Zweig 1 714,8 / 1 715 KB, 0,2 KB Luft
   — auf `main` wird die Grenze voraussichtlich mit Notiz anzuheben sein). Push = dein Wort (§6 Nr. 2).
4. **Real-Device** nach dem Push (WebGL-Karte, mobil): sichtbar wird der neue Zustand erst mit der neuen Korridor-Datei; vorher lässt
   er sich nur lokal mit der Fixture zeigen.
5. **Entscheiden:**
   - **E-AF-13 (entschieden und umgesetzt, Jan 11.10. abends; Audit §8.8):** die Ortsnamen unter dem Band überlappen nicht mehr —
     Endorte zuerst, dann die Städte in km-Reihenfolge, ein Name ohne Platz steht im Tooltip des Nachbarn. Gemessen am Band waren es
     85 von 210 Abschnitten, nicht nur die mit zwei Orten am selben km. Bilder: `audit/autobahn-fusion12-lueckenlos/af13/`.
     Ursprünglicher Wortlaut: Ortsnamen im Band überlappen an 32 von 141 Live-Korridoren (zwei Orte am selben km), ebenso an
     21 von 68 neuen Teilstücken. Bestand, nicht aus AF-5. Empfehlung: eigener kleiner Schritt vor dem Einspielen (ändert
     Bestandsbilder, deshalb nicht stillschweigend in AF-5).
   - **E-AF-14 (entschieden, Jan 11.10. abends: so lassen) — Voreinstellung:** ein Teilstück öffnet nach deinem Entwurf auf dem ersten Prognosepunkt (km 0), ein
     Abschnitt mit Messstellen ohne Messung weiter auf der kältesten Prognose. So gebaut; sag es, wenn beide gleich sein sollen.
6. Nachprüfen: `npm run build`, dann `npx vite preview --host 127.0.0.1 --port 4318 --strictPort` und
   `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-ui.mjs --base=http://127.0.0.1:4318`
   (82/82, ≈ 4 min).

### 62.2c AF-3 — Punkte für die neuen Teilstücke (11.10. nachts, gebaut und committet; Push und Einspielen warten auf dein Wort)

Audit §8.8 (Ortsnamen) und §8.9 (AF-3). Auf dem Zweig `af/merge-fusion-12` liegen fünf Commits vor `main`: AF-2 (`347897e`), AF-5
(`2e175b6`), Zusammenführung mit `main` (`83ad750`), Ortsnamen unter dem Band (`de46e44`), AF-3 (`fd885e2`). Das Paket für das
Daten-Repo liegt mit Prüfsummen unter `C:\dev\buscosun-road-publish\2026-10-11-af3\` (212 Korridore, 2 958 Achspunkte + 1 814
Stationen, Gelände). **Nichts davon ist gepusht oder eingespielt.**

Was nur du tun kannst — in dieser Reihenfolge:

1. **Ansehen:** `audit/autobahn-fusion12-lueckenlos/af13/` (Ortsnamen vorher/nachher: A 1, A 995, A 36).
2. **„pushe main“ im Chat** (oder selbst: im Arbeitsbaum `.wt-af` `git push origin HEAD:main`, danach im Hauptbaum
   `git merge --ff-only af/merge-fusion-12`). Der Push bringt die Seite für Teilstücke ohne Messstelle, die Ortsnamen und den
   Producer mit `engine.points` nach Produktion; sichtbar ändert sich nur die Ortszeile unter dem Band (und der Callout am oberen
   Kartenrand). Mein Versuch wurde vom Auto-Modus abgelehnt — er braucht dein ausdrückliches Wort.
3. **Erst wenn der Deploy da ist: Einspielen** (E-AF-4, von dir am 10.10. freigegeben): die drei Dateien des Pakets als ein
   Commit auf frischem `origin/main` des Daten-Repos (temporärer Index, nie force), Purge genau dieser drei `@main`-Pfade,
   sha256 am CDN gegen `SHA256SUMS`. Auf dein Wort mache ich es; Reihenfolge nie umdrehen — ohne die neue Seite zeigte ein
   Teilstück ein leeres Band.
4. **Danach prüfen:** der nächste `road-fc`-Lauf (stündlich :12, oder nach dem nächsten `point`-Lauf) nennt 4 772 Punkte und
   212 Korridore im Zeiger; bis dahin steht an einem Teilstück „kein Lauf für diese Strecke“ (so gebaut).
   `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-fc.mjs --data=<frischer Klon>` (113/113).
5. **Real-Device** nach dem Einspielen: `/autobahnwetter/a98-3` und `/autobahnwetter/a36` auf einem Telefon.

Offen aus dieser Runde (Audit §8.8.4, §8.9.5): V-AF-33 (ausgeblendeter Ortsname nur im Tooltip), V-AF-34 (Rang der Städte nach km
statt Größe), V-AF-35 (Callout unter den Zoom-Knöpfen), V-AF-36 (drei A-60-Punkte könnten jetzt einrasten), V-AF-37 (Overpass
abends, alte Spiegel), V-AF-38 (`verify:road-fc --data` lief nie mit), V-AF-39 (Grenzmarke an Abschnitten, die an der Grenze
entlang laufen: A 98 am Hochrhein, A 94 bei Bad Füssing). Weiter offen: E-AF-12 (vier Messstellen), AF-4 (rebasen), AF-6.

### 62.3 Rückwege

- `?ancpre=0` — der Motor vor V-AF-10 (eine Messung vor dem Achsenbeginn paart nur binnen 30 min mit dem ersten Schritt).
- `?obsvar=0` — der Leser vor V-AF-9 (nur die Werte am Stationsstempel), byte-gleich.
- `?dense=0` — buscosun Fusion 11 (sechs volle Stationen, liest ebenfalls je Größe).
- `?obs=direct` — Messungen von den Anbietern (BrightSky, TAWES, SMN) wie vor Phase OF.

## 63. Seewetter für alle eingeschaltet (`SEA_LIVE`), Kachel 12 — und V-SW-18: kein Wind seit dem 07.10., 2026-10-10

Belege: `audit/seewetter.md` §14 (Befund, Ursache, Umsetzung, Gates, Lücken). **Jan 10.10. abends: „ja setze beides um“** —
Schritt 1 erledigt (`buscosun-data` `cd9e29f`, 20:28 UTC), Indexierung umgesetzt (E-SW-32), **Schritt 3 erledigt: `main` von Jan
gepusht (`4a6d2b9`, 20:42 UTC), Produktion geprüft**; **Schritt 2 erledigt 10.10. 23:19 UTC: die erste Auffrischung mit dem
neuen Workflow trägt Wind an 56 von 56 Spots (je 68 Stunden, „buscosun Fusion 12“), die Live-Seite zeigt ihn (§14.5 Nachtrag
im Audit).** Offen aus diesem Abschnitt nur noch §63.2. Das Edge-Bündel (`6511575`) liegt auf `origin/main`; lokal liegt nur noch der
Doku-Commit mit diesem Nachtrag — geht mit deinem nächsten Push mit, keine Eile.

### 63.1 Reihenfolge (der Wind zuerst)

1. **Workflow kopieren:** `buscosun-web/scripts/sea/workflow-sea.yml` → `buscosun-data/.github/workflows/sea.yml` (eine Zeile
   anders: `public/climaGrid.json` in der Sparse-Liste des Producers, dazu ein Kommentar) und pushen. Ohne diese Kopie rechnet
   buscosun Fusion im Job keinen Wind — seit dem 07.10. 16:24 UTC stand an keinem der 56 Spots ein Wert.
2. **Prüfen** nach dem nächsten Wind-Durchlauf (alle 3 h mit dem neuen t1-Würfel, sonst mit dem CWAM-Lauf gegen 04:25 / 16:25
   UTC): `https://raw.githubusercontent.com/jppetry/buscosun-data/main/sea/v1/status.json` → `wind.path`; in dieser Datei
   tragen die Reihen `wind` ab der Rechenstunde Zahlen statt `null`, `wind.engine` nennt „buscosun Fusion 12“.
3. **Dann `buscosun-web/main` pushen** (schaltet die Seite für alle ein). Wird zuerst gepusht, ist die Seite ohne Wind live und
   der Job `sea` im Daten-Repo ab dem nächsten Lauf rot („Klimatologie von buscosun Fusion fehlt …“) — gewollt statt still leer.

### 63.2 Danach

- ~~`npm run edge:share`~~ **erledigt 10.10.** (Jan: „setze das noch um“; Bündel +17 Zeilen = der Routeneintrag, `verify:share`
  528/528; wirksam mit dem nächsten Push). Berichtigt: an der Link-Vorschau ändert das nichts — `og-meta` läuft auf
  `/seewetter` nicht; geteilte Links zeigen Titel/Beschreibung der Route mit dem allgemeinen Bild `og/home.png`. Eigene
  Karte oder Vorschau je Spot = eigener Schritt (V-SW-5).
- Katalog mit den 12 gezogenen Lagen ins Daten-Repo — live liegt noch der alte. **Jetzt §65** (zwei Dateien, nicht eine).
- **Gate D zählt neu:** 14 Tage ab dem ersten Lauf mit Wind (10.10. 23:19 UTC ⇒ frühestens 24.10.), dann `sea-gate-d.mjs` (§44 Punkt 6).
- **E-SW-32 Indexieren: erledigt** (Jan 10.10.) — `/seewetter` in der Sitemap, Spot-Pfade mit Canonical auf die Route. Nach dem
  Deploy in der Search Console die Sitemap neu einreichen, wenn es schnell gehen soll; `llms.txt` um Seewetter ergänzen (SEO-Linie).
- ~~Ansehen: V-SW-20~~ **umgesetzt 11.10. (§65)**; Real-Device bleibt.

### 63.3 Rückwege

- `SEA_LIVE = false` + Push — wieder nur mit `?sea=1`.
- `?sea=0` je Besucher; `SEA_KILL=1` als Repo-Variable im Daten-Repo (Seite zeigt „Keine Daten“).

## 64. `build`-Job im Daten-Repo scheitert im Publish (V-BW-58, `audit/bandbreite.md` §33), 2026-10-11

**Erledigt (11.10.):** von Jan gepusht (`1798fc5`, 08:43 UTC), abgenommen am 09z- und 12z-Lauf (beide grün, Ablage sauber,
nichts Fremdes verändert; Belege `audit/bandbreite.md` §33.3). Offen nur noch §64.3.

Gebaut und lokal geprüft: `scripts/publish-repack.mjs`, `scripts/verify-repack-publish.mjs` (neu),
`scripts/verify-repack.mjs` (eine Text-Prüfung), `package.json` (Alias `verify:repack-publish`). Der Workflow klont den Producer
bei jedem Lauf aus `buscosun-web/main`.

### 64.1 Deine Schritte

1. Commit + Push von `buscosun-web/main` (nur diese vier Dateien plus Doku; im Arbeitsbaum liegen daneben die offenen Änderungen
   der Seewetter-Sitzung). **Keine** Kopie ins Daten-Repo: die Workflow-Datei `build.yml` ist unverändert.
2. Abnahme am nächsten `build`-Lauf (Slots `20 0,3,…,21` und `30 2,5,…,23` UTC, GitHub startet 7–31 min später): im Schritt
   „Publish“ steht `Abgelegt → … (main = …, Versuch n/8)`. Steht dort `Versuch 2/8` oder höher, ist ein fremder Push
   dazwischengekommen und abgefangen worden — das ist der Normalfall, kein Fehler.
3. Danach `https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/index.json`: `runs[0].run` ist der jüngste ICON-D2-Lauf.

### 64.2 Rückweg

Den Commit zurücknehmen (`git revert`) und pushen — dann gilt wieder der Publisher von heute (einmal `--force`). Ein gescheiterter
Publish ersetzt in beiden Fassungen nichts im Daten-Repo.

### 64.3 Ansehen

- V-BW-62: `verify:repack` schickt lokal echte Purges an jsDelivr, solange `REPACK_NO_PURGE=1` nicht gesetzt ist.
- V-BW-63: Wächter für das Alter des jüngsten ICON-D2-Laufs (15z, 18z und 00z vom 10./11.10. fehlen im Daten-Repo).

## 65. Seewetter — V-SW-20 („0,0 m“ an Watt-Spots) umgesetzt, V-SW-21 (Katalog ins Daten-Repo) eingespielt, 2026-10-11

Belege: `audit/seewetter.md` §15. Der Code von V-SW-20 liegt seit 11.10. 08:43 UTC auf `origin/main` (`1798fc5`, zusammen mit
der Bandbreiten-Sitzung committet); lokal offen sind nur noch Doku-Commits, die Datei `scripts/lib/fixtures/sea/static/spot-geo.json`
und die angehobene Budget-Grenze (`budget.json`: totalJs 1 715 → 1 720, auf dein Wort vom 11.10.).

### 65.1 Katalog im Daten-Repo (V-SW-21) — erledigt 11.10. 10:00 UTC, offen nur der Purge

**Erledigt** auf dein Wort („pushe ins Daten-Repo“): beide Dateien als EIN Commit in `buscosun-data` (`32db40c`), ohne Force,
Prüfsummen am Commit gegengelesen. Die erste Wind-Auffrischung danach ist grün (11:18 UTC: `wind.t1 = 2026101109`, 56 Spots,
0 verworfen). Die Schritte darunter bleiben als Beleg stehen, wie die Kopie gebaut ist.

**Ansehen nach ≈ 16:30 UTC (freiwillig):** `status.json` → `field.lastPublishedRun = 2026101112` — erster Wellenlauf an den 8
neuen Zellen; Schillig, Dangast und Cuxhaven-Duhnen sollten dann deutlich weniger Stunden „kein Seegang“ zeigen.

**Dein Schritt (freiwillig, beschleunigt nur):** Purge der zwei Pfade am CDN — sonst kommt der neue Katalog je Knoten binnen
12 h an, in einem Browser mit altem Cache-Eintrag erst nach bis zu 7 Tagen (V-SW-28, gemessen):

- `https://purge.jsdelivr.net/gh/jppetry/buscosun-data@main/sea/v1/static/spots.json`
- `https://purge.jsdelivr.net/gh/jppetry/buscosun-data@main/sea/v1/static/spot-geo.json` (liest nur der Producer aus dem Klon —
  der Purge ist hier ohne Wirkung auf die Seite, der Vollständigkeit halber)

Ursprünglicher Text: Der erste Push-Versuch wurde in der Sitzung von der Berechtigungsprüfung abgelehnt. **Beide** Dateien
in EINEM Commit (der Katalog verschiebt an 8 Spots die Wasserzelle, `spot-geo.json` trägt das Gelände dieser Zellen):

1. `buscosun-web/scripts/lib/fixtures/sea/static/spots.json` → `buscosun-data/sea/v1/static/spots.json`
   (sha256 `32446b5d153c6ed9ba4b13823a70dc8f591bff85383248544e2a3aa0fcca5d90`)
2. `buscosun-web/scripts/lib/fixtures/sea/static/spot-geo.json` → `buscosun-data/sea/v1/static/spot-geo.json`
   (sha256 `471b44d4969fab14233b47acfec739a838f46d6ed3fe1666b0a75cf107116165`)
3. Commit, Push ohne Force. `areas.json` und `mask-cwam.hash` bleiben. Die Prüfsummen gelten für den Inhalt mit LF-Zeilenende
   (`git show HEAD:<pfad> | sha256sum`); ein angehängtes CR aus einem Windows-Checkout stört das JSON nicht. Im Klon vorher `git config core.autocrlf false`, sonst
   hängt Git beim Auschecken ein CR an die einzeiligen JSON-Dateien.

**Wirkung:** die Seite zeigt ab dem nächsten Aufruf die 12 gezogenen Lagen und Ufernormalen; die Wind-Auffrischung rechnet ab
dem nächsten neuen t1-Würfel an den neuen Zellen; die Wellenreihen folgen mit dem nächsten CWAM-Lauf (gegen 04:25 / 16:25 UTC) —
bis dahin stehen an 8 Spots noch die Reihen der alten Zelle (0,5–2 km daneben). Schillig, Dangast und Cuxhaven-Duhnen lesen dann
eine Zelle, die bei Hochwasser nass ist (25–46 % statt 86–92 % der Stunden ohne Seegang).

**Prüfen danach:** `https://raw.githubusercontent.com/jppetry/buscosun-data/main/sea/v1/static/spots.json` → `from.dry` nennt
`cwam-dry-2026101100.json`; im Job `sea` bleibt der Schritt mit der Wind-Auffrischung grün und `status.json` → `wind.spots` 56.

**Rückweg:** den Commit im Daten-Repo zurücknehmen (`git revert`), Push.

### 65.2 Ansehen (V-SW-20, schon live)

- `/seewetter` → St. Peter-Ording: im Stundenband ∅ statt „0,0“ im Tidetakt, „kein Seegang“ im Readout, darunter der Hinweis
  „Watt: … in n der nächsten m Stunden …“. Am Telefon: Satz im Spot-Briefing.
- **Neue Regel der Einordnung (an):** eine Stunde ohne Wasser an der Modellzelle ist „keine Daten · Wasser an der Modellzelle
  fehlt“ und trägt kein Fenster. Am Lauf vom 07.10. waren vorher 1 142 solche Stunden×Profile „passt“ oder „knapp“. Rückfall je
  Aufruf: `?seadry=0`. Wenn dir „keine Daten“ dafür zu schwach oder zu stark ist (Alternative: „außerhalb“), sag es — eine Zeile.
- Offen: V-SW-22 (echte 1–4 cm stehen weiter als „0,0 m“), V-SW-23 (Kartenfeld malt trockene Zellen wie 0 m), V-SW-25 (Ostsee:
  Ursache des Zustands nicht belegt), V-SW-28 (Katalog unter festem `@main`-Pfad: Browser-Cache 7 Tage — Katalog am Commit
  lesen). V-SW-27 erledigt (totalJs-Grenze 1 720).

---

## 66. Wasserstandsvorhersage des BSH auf `/seewetter` (Phase WL) — Lizenz geklärt, Daten eingebaut, 2026-10-12

Belege: `audit/wasserstand-bsh.md` (§3 die API gemessen, §5 Entscheidungen E-WL-1…9a, §8 Umsetzung mit Gates,
§9 Befunde V-WL-1…11). Dein Auftrag vom 12.10.: Status „blockiert / Lizenz ungeklärt" aufheben, Daten
einbauen. **Lizenz CC BY 4.0**, EU High-Value-Dataset, ohne Registrierung, kommerziell nutzbar — in jeder
Antwort des Dienstes belegt (`licence` und `copyright` je Datensatz), nicht nur auf der Portalseite.

Deine zwei Entscheidungen in der Sitzung: die Anzeige ist **voreingestellt an** (`?wl=0` schaltet aus) —
bewusste Ausnahme zur Regel „neue Rechenpfade default-off", im Audit als E-WL-1 festgehalten; und die **Lage**
der 136 Pegel kommt als kompakter Spiegel aus dem Daten-Repo, die **Kurven** live aus der offiziellen API
(E-WL-2).

Alles liegt **uncommitted** im Arbeitsbaum. Gates: `verify:sea-waterlevel` 55/55 netzfrei und 60/60 mit
`--live`, `verify:sea-ui` 62/62, sea-contract 30/30, sea-text 35/35, sea-derive 69/69, sea-decode 13/13,
typecheck 0, Build 256/256, Budget grün (totalJs-Ratsche von Hand 1 720 → 1 726, Notiz in `budget.json`).

### 66.1 Kopie ins Daten-Repo `jppetry/buscosun-data`

**ERLEDIGT 13.10. 16:33 UTC (mit deiner Freigabe im Chat):** Commit `a762bede5` auf `origin/main`
(`sea: WL-2 Pegelkatalog … + Schritt Gauges`, Katalog sha256 `a59a314390a2…` byteidentisch am CDN:
raw, jsDelivr `@a762bede5` und `@main` je 200 / 57 698 B). Produktion zeigt seitdem den nächsten Pegel je
Spot (St. Peter-Ording ⇒ Süderoogsand, Bezug, Hoch-/Niedrigwasser; Bild
`audit/wasserstand-bsh/prod-2026-10-13-gauges-live.png`). Der 15-min-Workflow hält den Katalog ab Lauf
≥ 401 selbst aktuell. Lokales `main` des Klons steht auf `a762bede5`; der frühere lokale Stand (RG-Commit
`ea8884e44`, Inhalt liegt auf `origin/main`) ist als Zweig `keep/rg-radar-log-native` gesichert.

Ablauf-Lehre (V-WL-20): das Daten-Repo wird vom Publisher force-gepusht; ein `git rebase origin/main` spielt
dann die alte Historie neu ab (97 Commits, Konflikte in jeder Datei). Richtig: `git checkout --detach
origin/main` → `git cherry-pick <commit>` → sofort `git push origin HEAD:main`, in einer Schleife, weil die
Crons im Minutentakt dazwischen pushen (zwei Abweisungen vor dem Erfolg).

Paket vom 13.10. weiterhin unter **`C:\dev\buscosun-sea-publish\2026-10-13-wl\`** (nur noch Beleg).

Paket vom 12.10.: **`C:\dev\buscosun-sea-publish\2026-10-12-wl\`** (mit eigener `README.md`). Die Reihenfolge ist frei —
der neue Workflow-Schritt überspringt sich selbst, solange der Producer nicht auf `buscosun-web/main` liegt.

### 66.0 Füllstand (WL-5, 13.10.) — Commit und Push von `buscosun-web`

Uncommitted im Arbeitsbaum (neben SE/RA): `src/sea/waterLevel.ts` (`wlFill`), `src/sea/SeaReadout.tsx`
(`WaterLevelFill`, Bezugswörter je Revier), `src/sea/SeaCharts.tsx` (Beschriftung MHW/MNW an der Ostsee),
`src/sea/seaDeck.css`, `scripts/verify-sea-waterlevel.mjs` (F11…F11h), `scripts/verify-sea-ui.mjs`
(L1b/L1c/L12a/L12b, Fail-fast ohne Server, Zähler 12/13 nach der Gletscher-Kachel), `audit/wasserstand-bsh.md`
§8.4b + V-WL-14…18. Gates: `verify:sea-waterlevel` 63/63, `verify:sea-ui` 68/68 (gegen `npm run build` +
`npx vite preview --host 127.0.0.1 --port 5212 --strictPort`), typecheck 0, Build grün, Budget grün (totalJs
1 768,2 / 1 772). Dein Schritt: Commit (`feat(sea): water level fill gauge (WL-5)`) und Push — der Katalog
aus 66.1 liegt seit 13.10. 16:33 UTC im Daten-Repo, mit dem Push von `buscosun-web` erscheint das Glas bei
allen Besuchern. Beachte V-WL-19: am nächsten Pegel ohne Kurve (z. B. Süderoogsand vor St. Peter-Ording)
gibt es kein Glas, nur die Hoch-/Niedrigwasserzeiten; der Pegel ist in der Karte wählbar.

1. `sea/v1/static/gauges.json` → `buscosun-data/sea/v1/static/gauges.json` (neu, 57,7 KB / 10,3 KB gz,
   sha256 `f6ddb4630a81c3d349138499624ad69e032544092cca89ea5cd82a4671cf342c`, gebaut 12.10. 15:4x UTC aus der
   offiziellen API: 136 Pegel, 82 Nordsee / 54 Ostsee, 0 verworfen).
   Die Prüfsumme gilt für den Inhalt mit LF (`git show HEAD:<pfad> | sha256sum`); im Klon vorher
   `git config core.autocrlf false`.
2. `workflow-sea.yml` → `buscosun-data/.github/workflows/sea.yml` (ersetzt die bestehende Datei, +19 Zeilen:
   ein Schritt „Gauges" vor dem Publish, `continue-on-error`, und der Schritt zählt in die Fehlerzeile am
   Ende). sha256 der Vorlage `dc87624f4ea7de1ccbddfc75aea833bf0e1d5b17cd56a01818485121457987b3`.
3. Commit, Push **ohne Force**. Ab dem nächsten Lauf (alle 15 min) hält der Workflow den Katalog selbst
   aktuell und schreibt nur bei Änderung — der Katalog ist Stammdaten, er ändert sich fast nie.

### 66.2 Push von `buscosun-web/main`

Erst danach rechnet der Browser den Pegel-Layer und die Karte „Wasserstand" bei allen Besuchern. **Bis dahin
ist die Sperre im UI zwar weg, aber die Pegel-Ebene bleibt leer** und die Karte sagt den Grund („Der
Pegelkatalog liegt noch nicht im Daten-Repo — bis dahin zeigt die Karte keine Pegel. Die Quelle selbst ist
freigeschaltet."). Nichts rechnet falsch, nichts behauptet etwas.

### 66.3 Abnahme nach dem Push

- `npm run verify:sea-waterlevel -- --live` (fragt den echten Dienst: CORS, Form, Lizenz an allen 136
  Datensätzen, Katalog von heute gegen alle Regeln).
- `/seewetter` ansehen: Pegel-Rauten auf der Karte, Karte „Wasserstand · amtlich (BSH)" im Spot-Reiter mit
  Verlauf, Hoch-/Niedrigwasserzeiten, beiden Zeitstempeln und der Attribution. Gegenprobe `?wl=0` — Karte und
  Rauten weg, Schalter bleibt im Dock.
- Reiter „Quellen": die Zeile sagt jetzt „erlaubt · CC BY 4.0 (EU High-Value-Dataset, ohne Registrierung,
  kommerziell nutzbar) · ausschließlich über die offizielle OGC API" statt „blockiert".

### 66.4 Was du ansehen solltest (keine Blocker)

- **V-WL-9 Real-Device.** Das Diagramm (gemessen / Vorhersage / Gezeit mit MThw-MTnw-Linien) und die
  Ereignisliste sind nur in headless Chromium gesehen.
- **V-WL-3 der Warnfall war nie live.** Am 12.10. stand an allen 136 Pegeln die Normalkategorie
  „Wasserstandsvorhersage". Der Sturmflut-Pfad ist mit formtreuen, aber erfundenen Fällen geprüft; wie er in
  echt aussieht, siehst du erst bei einer Sturmflut. Entscheidung E-WL-6 dazu: die Kategorie wird **nur
  zitiert**, mit dem Zusatz der BSH-Doku, dass sie für die Nordsee bzw. Ostsee gilt und nicht pegelgenau, und
  der Link auf `sturmflutwarndienst.de` steht **immer** in der Karte. buscosun warnt nicht.
- **V-WL-10 der Schalterblock des Docks liegt unterhalb der Faltung** (Dock `scrollHeight` 3 541 bei 840
  sichtbar) — das gilt für alle vier Schalter und ist Bestand. Weil die Anzeige voreingestellt an ist,
  braucht niemand den Schalter; ein Umbau des Docks wäre eine eigene Phase.
- **V-WL-8, der Befund, der die Anzeige geformt hat:** die **amtliche** Höhe eines Hoch-/Niedrigwassers reicht
  nur etwa einen Tag voraus. Danach trägt an 39 von 82 Nordsee-Pegeln nur die automatische Modellvorhersage
  (MOS) eine Zahl, an den anderen 43 gar keine. Die Karte zeigt beides getrennt — „amtlich" mit ±,
  „automatisch (MOS r0)" ohne, oder „nur Zeit, kein Wert". Wenn dir das zu viel Detail ist, sag es, dann
  kürze ich die Liste auf die amtlichen Zeiten.
- **PEGELONLINE** (gemessener Wasserstand, DL-DE Zero 2.0) bleibt offen — E-SW-7 nennt es als Ausbau. Der
  BSH-Datensatz trägt an 83 von 136 Pegeln einen Deep-Link auf die PEGELONLINE-Stammdaten; die Messreihe
  selbst käme aus der Kurve des BSH (`measurement`), die wir schon zeichnen.

## 67. Regenradar — alte Anzeigen entfernt (Phase RA, `audit/regenradar-altanzeigen.md`), 2026-10-13

Auf dein Wort gelöscht: der alte Satz „Schnellblick" (mit Badges/Chips), „Kennzahlen · 6 h" und die 6-h-Balkenkarte
„Niederschlagssumme" — Desktop-Readout und mobil (Reiter „Schnellblick" und „Detail"). Die Karte „Gefallen | Erwartet"
und der mobile Reiter „Schnellblick" bleiben. Uncommitted.

1. **Ansehen** (`/regenradar/muenchen`, Desktop und Handy), dann **Commit/Push** von `src/nowcast/NowcastDeck.tsx`,
   `nowcastDeck.css`, `nowcastMobile.css`, `scripts/verify-rain-window.mjs`, `scripts/verify-precip-sums.mjs`,
   `audit/regenradar-altanzeigen.md`, `CLAUDE.md`, dieser Datei. Im Arbeitsbaum liegen daneben Änderungen anderer
   Sitzungen (Radar-Störecho, `MapView.tsx`, `SeaPage.tsx`) — nicht mit committen.
2. **Entscheiden:** V-RA-1 (`?rb=0` zeigt oben keinen Satz mehr — Schalter streichen?), V-RA-2 (toten Code
   `heroState` und ungelesene Felder von `nowcast.summary` entfernen), V-RA-3 (Reiter „Schnellblick" umbenennen?).
3. Gewitter-/Hagelrisiko in %, Phase, Charakter und „Starkregen Ja/Nein" haben seither keine Anzeige mehr — sag
   Bescheid, falls eines davon an anderer Stelle wieder erscheinen soll.

## 68. Niederschlagsradar — Echos ohne Niederschlag ausblenden (Phase SE, `audit/radar-stoerecho.md`), 2026-10-13

Dein Befund „Fleck neben Gießen": kein Regen, sondern ein Echo ohne Niederschlag (sehr wahrscheinlich Vogelzug) im
amtlichen DWD-Komposit. Der Filter ist im Derive-Schritt des Radar-Spiegels gebaut, an Stationen gemessen und steht
hinter `RADAR_CLUTTER` — **aus**. Uncommitted. Im Client ändert sich nichts.

1. **Bestätigung an frischen Slots (R-SE-8) — ERLEDIGT, gerechnet 13.10. 04:10 UTC: bestanden** (28 Slots 12.10. 23:15 …
   13.10. 03:45 UTC): Verlust an echtem Regen 1 von 142 Intervallen (0,70 %, Obergrenze 1,37 %), nachts abgeräumt 88 gegen
   81 (Basis) von 609. Die Basis ist schmal (4,5 Stunden einer Front), und die niedrige Abräumquote misst hier nicht das
   Störecho: 463 der 609 trockenen blauen Intervalle tragen eine Regen-Signatur — Niederschlag in der Höhe vor der Front, den
   der Filter mit Absicht stehen lässt (V-SE-11, Audit §7). Nichts zu tun; zum Nachrechnen oder Verlängern (Sammler und
   Wahrheitsabruf liefen als Hintergrundprozesse meiner Sitzung, `C:\dev\buscosun-radar-truth\se\`, `cdc-store\`; der DWD
   hält die Dateien 48 h):
   ```
   node audit/radar-stoerecho/collect.mjs C:/dev/buscosun-radar-truth/se --from=202610122305 --to=<JJJJMMTThhmm jetzt, Minute auf 5> --step=10
   node audit/radar-regenschwelle/collect-cdc.mjs C:/dev/buscosun-radar-truth/cdc-store --recent --days=20261012,20261013
   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/radar-stoerecho/stations.mjs C:/dev/buscosun-radar-truth/se C:/dev/buscosun-radar-truth/se-extract --out=C:/dev/buscosun-radar-truth/se-stations
   node audit/radar-stoerecho/score2.mjs C:/dev/buscosun-radar-truth/se-stations C:/dev/buscosun-radar-truth/se-extract C:/dev/buscosun-radar-truth/cdc-store
   ```
   Die letzte Zeile der Ausgabe nennt **R-SE-8: bestätigt / NICHT bestätigt / OFFEN**. Bestätigt heißt: Verlust an echtem
   Regen ≤ 2 % bei mindestens 100 Fällen, und nachts nicht weniger abgeräumt als die Basis.
2. **Ansehen, dann Commit/Push von `main`**: `src/sources/dwdSweep.ts`, `radarClutter.ts` (beide neu), `dwdPx250.ts`,
   `radarImg.ts`, `radarHd250.ts`, `scripts/radar-mirror/clutter-step.mjs` (neu), `radar-derive.mjs`, `workflow-radar.yml`,
   `scripts/verify-radar-clutter.mjs` (neu), `scripts/verify-radar-threshold.mjs`, `scripts/lib/fixtures/radar-clutter-cases.json`,
   `package.json`, `.github/workflows/ci.yml`, `audit/radar-stoerecho.md` + `audit/radar-stoerecho/`, `audit/radar-regenschwelle.md`
   (V-RG-10), `CLAUDE.md`, diese Datei. Die Dateien der Phase RA (§67) liegen im selben Arbeitsbaum — getrennt committen.
   Ohne Schalter schreibt der Spiegel dieselben Bytes wie vorher (an zwei echten Slots gegen HEAD belegt).
3. **Einschalten (E-SE-1)** — erst nach 1 und 2, denn der Spiegel braucht den Web-Klon mit dem Filter: im Daten-Repo in
   `.github/workflows/radar.yml` die Zeile `RADAR_CLUTTER: '1'` unter `RADAR_LOG_NATIVE` ergänzen (Vorlage
   `scripts/radar-mirror/workflow-radar.yml`, dort steht `'0'`). Wirkung ab dem nächsten Spiegel-Job. Kennzeichen:
   `radar/img/v1/rv/<stamp>/meta.json` trägt `dual.clutter`, und in einer Zugnacht liegt `clutter.png` im Slot. Im Job-Log
   steht je Slot `clutter: N von M Zellen … in X ms` — **X ansehen**: auf meiner Maschine 7–9 s, auf dem Runner ungemessen;
   dazu 8 MB Abruf je Slot vom DWD. Rückweg: `'0'`.
4. **Entscheiden:** E-SE-2 Nachbarschaftsstimme (schließt den dünnen Reststreifen im Fleck, kostet 0,13 Punkte mehr echten
   Regen — die frischen Slots von Schritt 1 entscheiden es nicht: 91 statt 88 von 609, Verlust gleich; Empfehlung: ohne sie
   einschalten und an der nächsten Zugnacht ansehen), V-SE-11 (Blau über trockenem Boden vor einer Front — eigene Messung
   in der RG-Linie, kein Störecho), E-SE-3 Hinweis „Echos ohne Niederschlag ausgeblendet" in der
   Statuszeile der Karte (nicht gebaut, `MapView.tsx` war in Arbeit), V-SE-2 (Regenbeginn und buscosun Fusion lesen das
   Störecho weiter — eigene Phase), V-SE-5 (derselbe zlib-Weg würde den RV-Derive des Spiegels deutlich beschleunigen).
5. **Nachmessen (V-SE-8):** die Regel ruht auf zwei Herbsttagen und einer Nacht. Bei Schnee, in einer Gewitterlage und im
   Sommer je zwei Tage sammeln (Befehle wie in 1 mit eigenem Zeitraum, vorher `extract.mjs`) und `score.mjs`/`score2.mjs`
   wiederholen.

## 69. Ländermaske ohne Lücken — Liechtenstein, Bodensee, Grenznähte (Phase LM, `audit/laendermaske.md`), 2026-10-13

Dein Auftrag „keine leeren Felder an den Grenzregionen, Liechtenstein anzeigen" (E-LM-1). Befund: die Sandmaske der Karte
war aus drei einzeln vereinfachten Landesumrissen gebaut; Liechtenstein, der Bodensee und jede Naht/Überlappung zweier
Umrisse lagen als Sand über den Daten — im Regenradar bei Vaduz war die ganze Karte sand. Umgebaut: EIN aufgelöster
Umriss DE ∪ AT ∪ CH ∪ LI mit gefüllten Innenlöchern (`public/countries/DACH.geojson`), Rückfall `?mask=legacy`.
Gates grün (typecheck, build, budget, `verify:dach-mask` 11/11, `verify:fusion-release` 30/30), Bildbelege
`audit/laendermaske/vorher-*.png` / `nachher-*.png`. Uncommitted.

1. **Ansehen:** `/wetterkarte?lat=47.15&lon=9.55&z=9.5` (Liechtenstein), `?lat=47.6&lon=9.4&z=9` (Bodensee),
   `?lat=47.70&lon=8.87&z=10` (Schaffhausen), `/regenradar` mit Ort Vaduz; dasselbe mit `&mask=legacy` = das alte Bild.
2. **Commit/Push von `main`** (getrennt von RA §67 und SE §68, die im selben Arbeitsbaum liegen): `src/countryMask.ts`,
   `public/countries/LI.geojson` + `DACH.geojson` (neu), `scripts/gen-dach-mask.mjs` + `scripts/verify-dach-mask.mjs` (neu),
   `package.json` (`verify:dach-mask`), `audit/laendermaske.md` + `audit/laendermaske/`, `CLAUDE.md`, diese Datei.
3. **Entscheiden:** V-LM-1 — die Flächensummen (`precipsum`) maskieren weiter nur DE/AT/CH-Zellen, Liechtenstein bleibt dort
   ein Loch (Daten-Repo-Workflow, Sparse-Liste `public/countries` + Maskenliste um `LI` ergänzen — Jans Gate). V-LM-2 —
   Campione d'Italia (IT-Enklave in CH, 2,6 km²) wird jetzt wie DACH gezeigt statt als Even-Odd-Artefakt (V-HD-4); so lassen?
   V-LM-4 — an den Dreiländerecken Basel (FR), Nauders (IT) und Passau (CZ) bleiben kleine Kerben, weil die Lücke dort nicht
   umschlossen ist; Skizze im Audit.
4. **Real-Device:** die Maske ist eine MapLibre-`fill`-Ebene wie bisher (gleiche Ebene, nur andere Ringe; 1 162 statt
   1 716 Stützpunkte) — kein GPU-Risiko erkennbar, Bildbelege sind Headless-Desktop; ein Blick auf dem Handy genügt.

## 70. Radar — Phase SE abgeschlossen, Auflösung auf der ganzen DACH-Karte, 250 m nur auf Wunsch (Phase RA, `audit/radar-aufloesung.md`), 2026-10-13

Dein Auftrag vom Abend: SE committen und einschalten, 1 km ehrlich überall, 250 m nur auf Wunsch, Bildmatrix. Stand:

- **SE committet und live:** `24ac8d2` (nur die SE-Dateien; RA/LM/WL anderer Sitzungen liegen weiter uncommitted), Daten-Repo
  `a019b6954` (`RADAR_CLUTTER: '1'`) — der erste Job danach (`38442817587`, 17:58 UTC) filtert: Slot 19:30 UTC trägt
  `meta.dual.clutter` (733 von 90 038 Zellen, 17 Standorte), `clutter.png`, die 250-m-Kacheln lassen dieselben 733 Blöcke trocken,
  `status.json` ohne Fehler (§7.3 im Audit). Rückweg: `RADAR_CLUTTER: '0'` in `.github/workflows/radar.yml` des Daten-Repos.
- **Phase RA committet:** `dc72a3f` auf `main` (gepusht). Daten-Repo `9b35c098d`: der Rückblick-Slot trägt `g000.png`.
- **Was du ansehen solltest:** `/regenradar/giessen` — Schalter „1 km | 250 m" unter der Niederschlag-Zeile (nur DE-Orte), mit
  Schalter aus „250 m verfügbar", an „250-m-Gitter · 250 m radial · 1° Azimut", beim Abspielen in die Vorhersage „Vorhersage:
  1 km"; `/wetterkarte/niederschlag/giessen` — Statuszeile „… · ab 0,06 mm/h · Echos ohne Niederschlag ausgeblendet",
  mit `?hd=0` „Komposit 600 × 512 (≈ 2 km, kein 1-km-Gitter)"; `/regenradar/salzburg` und `/regenradar/basel` — Statuszeile
  „AT INCA (ab +15 min, kein Rückblick)" / „CH rzc (nur Messung)"; `/regenradar/zuerich` rückwärts — der CH-Rückblick ist
  sofort da. Bilder: `audit/radar-aufloesung/shots/` (152 + Nachläufe), `report.jsonl`.

1. **Entscheiden E-RA-2:** mit Schalter AUS holt der Client keine Kachel, aber je Analyse-Slot in den Kachel-Zooms die
   `hd250.json` (1–3 KB), damit „250 m verfügbar" ehrlich ist. Soll auch das wegfallen (dann nur der Schalter, kein Hinweis)?
   Rückweg: `probe` in `syncHd250` (`MapView.tsx`) entfernen.
2. **Entscheiden E-SE-2** (Nachbarschaftsstimme) an der nächsten Zugnacht am Live-Bild (`?hdv2=0` zeigt jedes Echo zum Vergleich).
3. **Job-Log ansehen:** im Lauf `38442817587` die Zeile `clutter: N von M Zellen … in X ms` — X ist die Rechenzeit auf dem
   Runner (lokal 3–4 s), dazu 8 MB Abruf je Slot; Derive-Summe im Status 4,6 s je RV-Slot.
4. **Real-Device (V-RA-6, V-R250):** Schalter umlegen bei Zoom 10–12 auf dem Telefon — Long Tasks sind headless nicht messbar.
5. **Hinweis V-SE-12:** `src/components/LayerInfoPanel.tsx` trägt uncommitted (Phase RA/LB-1 einer anderen Sitzung) in 20
   Einträgen `desc` und `source` auf EINER Zeile (ein verlorener Zeilenumbruch beim Bearbeiten, `\n`-Falle) — gültig, aber
   unleserlich; vor dem Commit jener Phase geradeziehen. Meine Zeilen in dieser Datei (`note`) sind davon getrennt committet.

## 71. Autobahnwetter — Gefahren-Leiste und Detailansicht (Phase AW-7/AW-8, `audit/autobahnwetter.md` §19), 2026-10-13

Auftrag: Startprompt `audit/autobahnwetter-gefahren-startprompt.md`, Spezifikation `audit/autobahnwetter-gefahren.md`. Gebaut im
Zweig `feat/autobahnwetter-gefahren` (Worktree `C:\dev\buscosun-web\.wt-hz`), **Schalter `ROAD_HZ_LIVE = false`** — ohne
`?roadhz=1` ist die Seite unverändert. Schritte 1 und 2 sind am 14.10. mit Jans Freigabe im Chat erledigt (Auto-Modus hatte den
Push ins Daten-Repo abgelehnt, im manuellen Modus freigegeben).

1. **Push von `main` — erledigt 14.10.** (`feat/autobahnwetter-gefahren`, acht AP-Commits ab `8e8646a` + Umnummerierung + Merge +
   V-AW-60): die Sitzung hat `main` (`7fbb00b`, Jans Commit mit RA/SE/LM/WL-5) in den Zweig gemergt — einziger Konflikt war diese
   Datei (§70 bleibt RA, der Autobahn-Abschnitt heißt §71) —, `main` per Fast-Forward gesetzt, Gates neu gelaufen (§19.8) und
   `7fbb00b..83ba8b0` gepusht. Der Radar-Job lief damit ab dem Jobstart 14.10. früh (`status.hz` erschien mit `blocked`).
2. **Paket ins Daten-Repo — erledigt 14.10. 07:51 UTC:** `road/v1/static/segments.json` (1 629 Abschnitte, 968 KB roh / 191 KB gz,
   ODbL) als Commit `59d6cdd` (Vorgehen `checkout --detach origin/main` → `cherry-pick` → `push HEAD:main`, Blob-SHA256
   `6324e85c…` = `SHA256SUMS`); den README-Abschnitt hatte der `build`-Job schon aus der Vorlage `scripts/repack-repo/README.md`
   übernommen (`03ecbf2`). Beide Pfade `@main` gepurgt (CF + FY), jsDelivr liefert die Datei (HTTP 200, 968 148 Bytes).
   Falle beim Wiederholen: `git cherry-pick` kennt kein `-q` — ein Fehlschlag dort lässt `push HEAD:main` leer „gelingen".
3. **AF-3-Paket — erledigt 14.10. 09:12 UTC (`audit/autobahnwetter.md` §19.10/§19.11):** EIN Commit **`8104f73`** im Daten-Repo mit vier Dateien
   (`road/v1/static/corridors.json`, `road/fc/v1/static/points.json`, `road/fc/v1/static/geo.json` aus `2026-10-11-af3`, dazu die gegen die 212
   Korridore neu gebaute `road/v1/static/segments.json`, 1 731 Abschnitte, 102 neu, 0 entfallen, aus `C:\dev\buscosun-road-publish\2026-10-14-af3-segments\`).
   Vier `@main`-Pfade gepurgt, jsDelivr liefert alle mit der Prüfsumme. Der `road-fc`-Lauf 2610140928 meldet 4 772 Punkte, 212 Korridore, 0 fehlgeschlagen; der
   Gefahren-Slot 2610140930 rechnet 1 731 Abschnitte. **Noch zu tun von dir:** Real-Device `/autobahnwetter/a98-3` und `/autobahnwetter/a36` (§62.2c Punkt 5);
   `verify:road-fc --data=<frischer Klon>` (113/113, V-AF-38 ist offen). Falle beim Wiederholen: das sparse-Muster des Daten-Repo-Klons enthält `road/fc/`
   nicht von Haus aus (`git add` verwirft dort still, Exit 0).
4. **Erster Live-Slot — geprüft 14.10. 08:36 UTC:** erster `hz/`-Slot 2610140830 (89 von 1 629 Abschnitten mit Stufe, 2 unbekannt,
   1,1 s statt 25 s lokal), `health-manifests --url` R1–R7 grün, 13/15 (rot nur H2/H3 `latest-grib.json`, nicht diese Phase).
   Einzelheiten `audit/autobahnwetter.md` §19.9.
5. **Gate E (Gefahren-Schatten, frühestens 7 Tage nach dem ersten `hz/`-Slot):** Folgeprompt am Ende des Startprompts; die
   Reihe steht in `status.json` `recent[].hz` und im Archiv (`road-archiv.yml` trägt `status.json` mit). Vorab aus §19.6 anzusehen:
   E-AW-38 (Terrarium statt DGM200), E-AW-39 (Nebel-Proxy — 292 von 1 629 Abschnitten am 13.10. 17 UTC), E-AW-40 (Fortschreibung
   der Glätte), V-AW-47…54.
   **Gelaufen 23.10. — ROT** (`audit/autobahnwetter.md` §19.12): 17 von 672 Slots gesperrt (Konsistenz „Hitze" am 16.10., Ursache
   N443 Irxleben +41 °C durch `roadAir`, V-AW-62/63), `missing` 0 % im Fenster, Stichprobe 167/167 ohne Fehlbegründung (Ersatz-Slot
   23.10., V-AW-64). Seit 21.10. 15:30 UTC fehlt `fc` in 83 % der Slots: der Punkt-Cron steht seit 19.10. 13:02 UTC am Terminregister
   (Radar-Termin 20.10. ohne `resolved`). **Von dir:** (a) `resolved` für diesen Termin freigeben + Commit/Push von `main`;
   (b) entscheiden, ob `ROAD_HZ_LIVE` bis zu einem grünen Gate E wieder auf `false` geht; (c) V-AW-62/63, danach Gate E neu (7 Tage).
   **Erledigt 23.10.:** (a) ja — `6303c419` auf `origin/main` (nur dieser Commit; **dein lokaler `main` braucht vor dem nächsten Push
   `git pull --rebase`**, 38 Commits inkl. Fusion 13 liegen weiter nur lokal); (b) nein — Leiste bleibt live. Offen: (c).
6. **Gate C+ (Leiste live):** `ROAD_HZ_LIVE = true` erst nach deinem OK im Chat; bis dahin `?roadhz=1`.
7. **V-AW-48 (Füllwert) — umgesetzt 14.10., NICHT committet, wirkt erst mit dem Push von `main`:** Q290 Wolfskopf fällt zwischendurch (17 von 24
   Ring-Slots) auf Fahrbahn = Luft = −0,01 °C **ohne Taupunkt**; die Toleranz allein hätte ihn nicht erfasst. Jetzt `ROAD_FILL.eps` 0,011 **und** Regel 1b
   (Fahrbahn = Luft am selben Füllwert, Taupunkt fehlt ⇒ beide `fillValue`) in `src/road/roadContract.ts`; Verifier V48a–f, `verify:road-contract` 117/117.
   Zahlen, Gegenproben und Risiko (Winter): `audit/autobahnwetter.md` §19.10/§19.11. **Von dir:** Commit (Dateien unten) und Push; im Dezember
   `balance.byRule.fillValue` je Tag ansehen (trifft Regel 1b echte Werte?).
8. **`latest-grib.json` (V-AW-61) — umgesetzt 14.10., NICHT committet:** `health-manifests.mjs` meldet H2/H3 für die Datei als „stillgelegt" (grün, mit
   dem tatsächlichen Alter im Text; `GRIB_MANIFEST_RETIRED=0` = wieder scharf) und prüft stattdessen den Index des Daten-Repos (I1–I3: lesbar, `publishedAt`
   < 6 h, je Familie jüngster Lauf < 9 h). `verify:health` 57/57; echt gegen buscosun.com 18 von 18 grün. Geändert: `scripts/health-manifests.mjs`,
   `scripts/verify-health.mjs`.
   *Commit der Umsetzung (7 + 8) auf dein Wort, ohne die fremde Linie in `src/fire/`:* `src/road/roadContract.ts`, `scripts/verify-road-contract.mjs`,
   `scripts/health-manifests.mjs`, `scripts/verify-health.mjs`, `audit/autobahnwetter.md`, `MANUELLE-SCHRITTE.md`, `CLAUDE.md`.
9. **Befunde V-AW-62…69 — umgesetzt 23.10., NICHT committet (`audit/autobahnwetter.md` §19.13).** Dein Auftrag „setze jetzt alle offenen
   Punkte um": Schiedsrichter `roadAir` (V-AW-62, N443-Nachbarschaft aus dem Archiv als Fixture), `blowupOf` ohne verdächtige Stationen
   (V-AW-63), `hz/`-Archiv je Slot (V-AW-64, ≈ 8 KB gz, Aufbewahrung im Daten-Repo 4 h), `byHazard` im Slot-Protokoll (V-AW-65), Radar-
   Stundenmittel hinter `ROAD_HZ_RADAR=mean` + Messskript (V-AW-66, Entscheidung E-AW-42 bleibt bei dir), Film-Auflösung `wfr`/Deckel Stufe 2
   (V-AW-67, Ursache 0 13 241 Skala 3), `verify:road-ui` nachgezogen (V-AW-68), Wächter mit Zeitplan + Punkt-Cube-Prüfung P1–P3 (V-AW-69).
   **Von dir, in dieser Reihenfolge:**
   (a) **Commit + Push von `main`** (vorher `git pull --rebase`, s. Punkt 5; der Push trägt dann auch Fusion 13 und die 38 lokalen Commits —
   oder du baust wie bei `6303c419` einen Zweig auf `origin/main` mit nur diesen Dateien). Dateien dieser Umsetzung: `src/road/roadContract.ts`,
   `src/road/roadHazards.ts`, `scripts/road/road-derive.mjs`, `scripts/road/road-hazards.mjs`, `scripts/road/road-mirror.mjs`,
   `scripts/road/road-archive.mjs`, `scripts/road/hz-nowcast-score.mjs` (neu), `scripts/health-manifests.mjs`, `scripts/verify-road-contract.mjs`,
   `scripts/verify-road-hazards.mjs`, `scripts/verify-road-archive.mjs`, `scripts/verify-road-ui.mjs`, `scripts/verify-health.mjs`,
   `scripts/repack-repo/README.md`, `.github/workflows/health-watch.yml` (neu), `audit/autobahnwetter.md`, `MANUELLE-SCHRITTE.md`, `CLAUDE.md`.
   Wirkung ohne weiteren Schritt: Radar-Job (Vertragsfixes, `wfr`, 4 h `hz/`) beim nächsten Jobstart ≤ 5,75 h, Archiv-Job (`hz/`-Ablage) beim
   nächsten Lauf ≤ 3 h, Build-Job übernimmt die README-Vorlage.
   (b) **`health-watch.yml`** läuft mit dem Push von selbst (Workflow in diesem Repo, Label `health`); beim ersten Lauf siehst du vermutlich
   ein Issue „P3 … t2/t3 ROT", solange t2/t3 noch vom 19.10. sind — es schließt sich nach 10:30 bzw. 21:55 UTC von selbst. Prüfe einmal
   GitHub → Settings → Notifications: „Actions: failed workflows" UND dass Issues deines Repos dich per E-Mail erreichen.
   (c) **E-AW-42** nach ≥ 7 Tagen Archiv: `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/hz-nowcast-score.mjs
   --archive=<buscosun-archiv>/road/v1` — bleibt der Anteil „ohne Regen auf der Stufe" bei ≈ 28 %, ist `ROAD_HZ_RADAR: 'mean'` im Mirror-Schritt
   von `radar.yml` der Kandidat (Rückweg: Zeile entfernen).
   (d) **Gate E neu:** 7 Tage nach (a), Folgeprompt aus dem Startprompt, Stichprobe aus `road/v1/<Tag>/hz/` des Archivs.
   Nicht angefasst: `budget.json` (eagerJs 110,1 > 110 KB stammt aus den fremden uncommitteten Linien RUC/HB, nicht aus dieser), `ROAD_NEIGHBOUR.k`
   (V-AW-70, dein Gate).

## 72. buscosun Fusion — Spur-P-Abnahme von `fusion-12t`/`12u` (beide abgelehnt), W1 neu, Hindcast-Kette neu gestartet (`audit/obs-fusion.md` §13), 2026-10-21

Dein Auftrag 21.10.: „führe beide Punkte durch" — (1) Hindcast-Nachholkette anwerfen + W1 neu bauen, (2) Spur-P-Abnahme von 12t und 12u.
Beides ist gelaufen, nichts committet, nichts ins Daten- oder Archiv-Repo geschrieben. **Ergebnis: beide Kandidaten abgelehnt.** Auf Spur P
(12 Ausgabetage nach dem Freeze, 4 reif) sind alle Gates grün, der Index gegen Fusion 9 liegt aber bei +0,25 % (12t) / +0,26 % (12u)
statt der behaupteten ≥ +1,3 %. Auf Spur R (Hindcast-Tresor) sind G2 und G3 rot: Wind 0–6 h DE −2,1 %, Böe 0–6 h CH −0,5 %,
Abdeckung Wind 0–6 h 73,4 % (Champion 76,9 %). Das ist V-OF-17: die Sommer-σ-Skala passt nicht in andere Jahreszeiten.
buscosun Fusion 12 (= 12s) bleibt der aktive Stand, Fusion 13 ist nicht vergeben.

1. **E-OF-8 — der Weg zu Fusion 13 (deine Entscheidung):** (a) σ-Skala ≤ 48 h nach Jahreszeit aus der jetzt laufenden Hindcast-Kette —
   frühestens Dezember, dann ein neues Fenster; (b) sofort ein Kandidat `fusion-12v` = 12s + `anchorKSet` OHNE σ-Skala ≤ 48 h, Hypothese
   vorab einfrieren, neues Spur-P-Fenster ab dem Freeze-Tag (erste Abnahme ≥ 4 reife Tage = Freeze + 12 Tage); (c) nichts, Fusion 12
   bleibt. Empfehlung: (b) jetzt einfrieren, (a) im Dezember — beides schließt sich nicht aus.
2. **Wiederholung derselben Abnahme auf breiterer Spur P ≈ 3.11.** (≥ 14 reife Tage): keine Nachstellung, nur mit dem Wort `abnahme`
   von dir; sie kann das Spur-R-Urteil nicht aufheben, zeigt aber, ob der +0,25 % im Herbst hält.
3. **Hindcast-Kette (`C:\dev\buscosun-hindcast`):** `follow 2026-09-22 … 2026-10-20` läuft seit 18:52 UTC unter `watchdog8`
   (≈ 5 h; Log `log\pull-follow-2026-10-21.log`, Fortschritt `grep -c "status 0"`, Ende „DONE follow"). Danach fehlt ein Dauerbetrieb
   (V-OF-19): entweder du legst eine geplante Aufgabe an (täglich, `queue.mjs follow <gestern−2> <gestern>` + Wachhund) oder du sagst mir,
   dass ich je Sitzung einen Eintrag in `log\chains.json` nachtrage. Ohne Kette kein Winter-Nachfit im Dezember.
   Falle V-OF-20: der erste losgelöste Start starb still; nach jedem Start die PID prüfen.
4. **Commit auf dein Wort:** `audit/obs-fusion.md` (§13), `CLAUDE.md` (Zeile OF, Stand 13), diese Datei, `audit/pruefstand/rangliste.json`
   (von der Abnahme geschrieben), neue Berichte `audit/pruefstand/berichte/fusion-12t/2026-10-21-abnahme/` und `…/fusion-12u/…`,
   `scripts/pruefstand/register/zugriffe.log` (zwei Abnahme-Zeilen). Register-Status 12t/12u bleibt `kandidat`, setzt nur du.
5. **Rückwege:** W1 ist append-only (reife Tage final), nichts zurückzunehmen. Die Kette stoppen:
   `Get-CimInstance Win32_Process | ? { $_.CommandLine -like '*hindcast*' } | % { Stop-Process -Id $_.ProcessId }`.

**Nachtrag 22.10. (Jan: „mache b"):**

6. **Hindcast-Kette fertig:** `follow 2026-09-22 … 2026-10-20` endete 21.10. 22:38 UTC (232 Slots, 0 unvollständig, 726 MiB). Punkt 3 bleibt:
   Dauerbetrieb nur mit geplanter Aufgabe oder auf Zuruf; der nächste Nachtrag wäre `follow 2026-10-21 <gestern>`.
7. **V-OF-22 — die Spur-P-Zahlen vom 21.10. entstanden ohne den dichten Messsatz** (`audit/obs-fusion.md` §13.4): die Tagesdateien
   `obs-dense/<Tag>.json.gz` endeten am 07.10., der Replay fiel still auf die Archiv-Messung zurück (Fusion 12 ≡ 11 auf Spur P). Das
   Spur-R-Urteil (abgelehnt) bleibt. Behoben: Dateien 08.–20.10. nachgebaut (335 s), 91 veraltete Konserven gelöscht, Wächter in
   `scripts/pruefstand/run.mjs`/`lib/lauf.mjs` (Abnahme bricht mit Exit 1 ab, wenn ein Tag ohne Tagesdatei lief); `verify:pruefstand` 60/60.
   **Vor jeder Abnahme:** `build-dense-obs.mjs --from=<letzter Tag + 1> --to=<Vortag>` — oder du sagst mir, dass ich das je Sitzung tue.
8. **Kandidat `fusion-12v` registriert (E-OF-8 b):** = `fusion-12s` + `anchorKSet`, ohne σ-Skala; Motor-Commit `4350886` (wie 12t/12u),
   Freeze **2026-10-22**, Status `kandidat`, Hypothese H-OF-5c in `audit/obs-fusion/claims-addendum-4.md` (Hash in `claims-frozen.sha256`):
   Spur P G1–G4 grün, Index ≥ +0,5 %, T 0–6 h im Band; Spur R nichts schlechter. **Erste Abnahme frühestens 03.11.** (4 reife Tage ab 23.10.),
   belastbar ≈ 13.11. — nur mit deinem Wort `abnahme`; dabei 12t/12u mit dichten Dateien wiederholen (keine Nachstellung, Urteil bleibt).
   Bei grün: 12v = buscosun Fusion 13 — Eintrag in `fusionRelease.ts` und Liveschaltung sind dann dein Gate.
9. **Commit:** Zweig `fusion-12v` mit Register-Eintrag, Hypothese, Wächter, Berichten 12t/12u, `rangliste.json`, `zugriffe.log` und
   `audit/obs-fusion.md`; `main` per Fast-Forward darauf gesetzt (lokal, nicht gepusht — der Register-Eintrag muss im Arbeitsbaum liegen,
   sonst findet ihn der Prüfstand nicht). `CLAUDE.md`/diese Datei bleiben uncommitted (tragen fremde AW-Änderungen). Push = du.

**Nachtrag 22.10. abends (Jan: „bauen wir einen neuen Kandidaten … nutze dafür diese neuen Datenmöglichkeiten", `audit/obs-fusion.md` §15):**

10. **Kandidat `fusion-12w` registriert (OF-8, E-OF-9):** = `fusion-12v` + `sigmaScale: 5` (`SIGMA_SCALE_TABLE_W`: nur die Böe bei
    1,5 h und 4,5 h je Land, DE 0,891/0,913 · AT 0,96/0,904 · CH 0,984/0,963; Wind/T/Td und alles ab 15,5 h = 1). Knoten aus den
    echten Sommerläufen mal dem Saisonfaktor der Tag-0-Reihe aller Jahreszeiten außerhalb des Tresors (580 Slots 2023/24 + 2025/26,
    00 UTC). Motor-Commit `35f1285a`, Register `fb00d640` (beide lokal auf `main`, nicht gepusht), Freeze **2026-10-22** (wie 12v),
    Hypothese H-OF-5d in `claims-addendum-5.md` (Hash `83b95c044ea5…`). **Erste Abnahme frühestens 03.11.**, zusammen mit 12v (gleiches
    Spur-P-Fenster), nur mit deinem Wort `abnahme`; vorab festgelegt: sind beide grün, gilt der höhere Index gegen Fusion 9, bei nicht
    nachweisbarem Unterschied 12v. Vorher `build-dense-obs.mjs` bis zum Vortag und `build-w1.mjs` (heute bis 21.10. bzw. 22.10. gelaufen).
11. **V-OF-24 — deine Entscheidung für den nächsten Hebel:** der Fit zeigt, dass die Kurzfrist-Kalibrierung des Windes von der
    Tagesstunde beherrscht wird (bei 1–2 h: 00 UTC Faktor 1,075 nötig, 12 UTC 0,77), nicht vom Vorlauf oder nur der Jahreszeit (Winter
    nachts +18 %). Der Prüfstand sieht das Fenster 0–6 h NUR nachts (Spur R 00 UTC, Archiv-Slot 23:22 UTC). Die ursprünglich geplanten
    Windknoten wurden deshalb VOR dem Prüfstandlauf auf 1 gesetzt (nicht am Prüfstand nachgestellt; §15.6). Eine Skala mit Achse
    Tagesstunde wäre eine neue Form = eigener Kandidat (E-OF-10, messbar aus den 8 Slots je Tag der Lauf-Route und der Nachholkette) —
    sag, ob ich das als nächste Phase vorbereiten soll. Dazu V-OF-25: Wind in AT/CH ohne lokale Information ist auch mit Faktor 1,6
    zu schmal — eine Formfrage, kein Faktor.
12. **Spur R vor der Abnahme:** nur auf dein Wort `vergleich 9 12s 12v 12w tresor` — der Vergleich entscheidet nichts, zeigt aber, ob die
    Böe-Zelle 0–6 h auf dem Tresor ins Band kommt. Ohne das Wort rechne ich den Tresor nicht.
13. **Volltest von 12w gerechnet** (erster Lauf 16:40 UTC bei 100/186 vom Speicherwächter gestoppt; Neustart auf dein „weiter" 18:25 UTC
    losgelöst mit einem Arbeiter, fertig ≈ 18:55 UTC; Bericht `audit/pruefstand/berichte/fusion-12w/2026-10-22-voll/bericht.html`, Audit
    §15.8): Index gegen Fusion 9 **+1,90 %** (+1,56 … +2,17), G1/G2/G4 grün, G3 rot (3 Zellen zu breit, aus der 12s-Linie), 84 von 99
    Kernzellen besser als jede Einzelquelle. Rangfolge auf der Entwicklungsmenge: Platz 4 von 15 hinter 12u/12t (abgelehnt) und 12s;
    gegen 12v +0,02 % (nur Böe 0–6 h, DE +1,2 %). Kein Urteil — das gibt nur die Abnahme. **Für dich:** (a) Bericht-Ordner (untracked)
    und Audit §15.8 committen — auf dein Wort; (b) **V-OF-26:** die K-Kopplung von 12v weitet σ an DE-Stationen im Fenster 0–6 h
    (Wind-Abdeckung 83,7 → 88,5 %, CRPS −1,4 %), weil die Sommertabelle im Herbst unterkoppelt; 12v liegt dort ≈ 0,05 % unter 12s. Ein
    K-Satz nach Jahreszeit aus den Tag-0-Daten wäre ein neuer Kandidat (**E-OF-11**), kein Umbau von 12v/12w vor der Abnahme — sag,
    ob ich ihn vorbereiten soll (zusammen mit E-OF-10 oder getrennt).
14. **Projekt „buscosun Fusion 13" gestartet (dein Auftrag 22.10. abends, E-OF-10 + E-OF-11; `audit/obs-fusion.md` §16):** drei Kandidaten
    gebaut, registriert (Commits `2d0eb64e` Motor + Tabellen, `ee2badcc` Register; nichts gepusht) und im Volltest gegen 12s gemessen —
    **`fusion-12x`** (12s + σ-Skala je Tagesstunde × Vorlauf × Land, `sigmaScale: 6`), **`fusion-12y`** (12s + K-Satz je Jahreszeit,
    `anchorKSet: 2`), **`fusion-12z`** (beides). Ergebnis (Entwicklungsmenge 14.09.–21.10., 38 Tage, Diagnose, kein Urteil):
    **12x +2,05 % gegen 9, gegen 12s +0,13 % (+0,09 … +0,17, nachweisbar)**, Platz 3 hinter den abgelehnten 12u/12t, G2 rot 1 (Td 0–6 h AT, −0,0 %),
    G3 rot 2 (T 0–6 h zu schmal = 12s-Linie, Wind 6–24 h zu breit); **12z +2,02 %, gegen 12s +0,09 %**, G3 nur noch 1 rot; **12y +1,88 %, gegen
    12s −0,05 %** (= 12v, der Saison-K-Satz behebt V-OF-26 nicht). Preis von 12x/12z: T 6–48 h in AT/CH unter dem Band (AT 24–48 h 72 %,
    V-OF-32). Der Wind wird in keinem Kandidaten skaliert: die Stundenskala brachte ihn auf 80 % Abdeckung, verschlechterte aber den CRPS in
    jedem Land (V-OF-30) — der Wächter der Regel hat sie gestrichen. Berichte `audit/pruefstand/berichte/fusion-12{x,y,z}/2026-10-22-voll/`.
    **Für dich:** (a) Commit der Berichte 12w/12x/12y/12z (untracked), Audit §15.8/§16, CLAUDE.md, MANUELLE-SCHRITTE — auf dein Wort;
    (b) Push von `35f1285a` … `ee2badcc`; (c) Abnahme ≈ 03.11. für 12x und 12z (mit 12v/12w, Wiederholung 12t/12u) — dann erst die
    Fusion-13-Frage; Spur R vorher nur auf dein Wort (`vergleich 9 12s 12x 12z tresor`); (d) Entscheidungen **E-OF-12** (Wind-Form: mittelwerttreue
    σ-Skalierung oder Quantil-Nachkalibrierung je Stunde), **E-OF-13** (K-Satz auf dem dichten Satz je Land messen), **E-OF-14** (Saisonfaktor für
    7–48 h, erst ab Dezember messbar). Hinweis: H-OF-6 (b) (Wind auf Spur R) ist nach der Regeländerung §16.4a gegenstandslos — ich habe den Satz
    vor der Hash-Bildung nicht angepasst; die Abnahme wird (b) als nicht erfüllt ausweisen, (a) und (c) gelten.
15. **E-OF-15 umgesetzt — buscosun Fusion 13 = `fusion-12x` (dein Wort 22.10. nachts: „12x live schalten … buscosun fusion 13 nennen";
    `audit/obs-fusion.md` §17):** Eintrag `n: 13` im Register der Stände (`FUSION13_SIGMA_SCALE = 6`), Schalter `?sscale=0` = Fusion 12,
    `FUSION_CURRENT` = 13 — jede Seite und jeder Producer nennt den Stand aus der Datei. Verifier: `verify:fusion-release` 30/30, Typecheck,
    Build 260/260 grün, `verify:pv-cube` 452/453 (fremdes Rot (21)). Committet, **nicht gepusht. Für dich:** (a) **Push von `main`** — erst damit
    ist Fusion 13 auf buscosun.com; der Push trägt auch fremde Commits seit `83ba8b0` (Glacier-Stil `a1d917ed`, Atmosphäre `ba521731`…`90f910c8`)
    und meine `35f1285a` … Fusion 13. Danach bauen die Workflows im Daten-Repo (Streckenprognose, Kartenfelder, Seewetter) beim nächsten Lauf
    mit Fusion 13; bis dahin nennen die Produkte Fusion 12 (E-FR-1). (b) **Budget:** totalJs 1 892,6/1 825 KB und eagerJs 110,1/110 KB rot —
    beide schon vor diesem Schritt rot durch die HB-Linie (§73.4); Fusion 13 bringt +3,8 KB in den lazy Fusionskern, der Erstbild-Pfad ist
    unverändert. Ratsche anheben oder zuordnen = deine Entscheidung mit §73.4. (c) Der Prüfstand-Champion bleibt Fusion 9 (E-OF-7), die
    Abnahme von 12x/12z ≈ 03.11. läuft weiter; wenn sie rot wird, ist `?sscale=0` der benannte Rückweg und `FUSION13_SIGMA_SCALE = 0` die
    Abschaltung im Code. (d) Nach dem Push einmal `/wetter/<ort>` ansehen: Stufen-Zeile nennt „buscosun Fusion 13".

## 73. Historie neu gestaltet — Plattform-Angleich + Bühne (Phase HB, `audit/historie-buehne.md`), 2026-10-22

1. `/wetterarchiv/<ort>` im eigenen Chrome ansehen: Rail links zeigt wieder alle Werkzeuge; Zeiger über die Klimastreifen
   führen → unten links erscheinen Jahr, Wert und Abweichung; Klick auf einen Streifen öffnet das Tagesband.
2. Dunkelmodus (☾ oben rechts) einmal ansehen.
3. Wenn es passt: Commit der drei Dateien `src/history/HistoryPage.tsx`, `src/history/historyDeck.css`,
   `src/history/charts/Stripes.tsx` plus `audit/historie-buehne.md` (Arbeitsbaum ist geteilt — nur diese Dateien stagen).
4. Entscheiden, ob das schon vorher rote Budget (V-HB-1: eagerJs 110,1/110 KB, totalJs 1 888,8/1 825 KB) zugeordnet oder
   bewusst angehoben werden soll.

## 74. 5-min-Niederschlagsform aus ICON-D2-RUC (Phase RUC, `audit/niederschlag-ruc.md`), 2026-10-23

Gebaut, verifiziert (`verify:ruc` 100/100), reviewt und **auf dein Wort („komplett aktiv schalten", 23.10.) eingeschaltet**: die Form
ist voreingestellt an, `?ruc=0` ist der Rückfall. **Stand 23.10. 12:30 MESZ:** Schritt 1 und 3 hast du gemacht (Commit `18674137`
„Update", `main` gepusht, Netlify liefert das Bundle aus); Schritt 2 habe ich mit deiner Erlaubnis gepusht (Daten-Repo `8323d36`,
Workflow `ruc` bei Actions `active`). **Erstlauf 12:55–12:57 MESZ erfolgreich** (Lauf 10z, 41 s, 208 Chunks, `missing` 0, Commit
`1c560b89`); buscosun.com zeigt die 5-min-Schicht (Köln `data-origin="radar+ruc+fusion"`, `?ruc=0` fällt sauber zurück). Offen bleibt
nur die Messung T9 (Schritt 5). Die Schritte bleiben als Protokoll stehen:

1. **Commit der Phase in `buscosun-web`** (nur die RUC-Dateien; die fremden Linien `src/history/*`, `audit/historie-buehne.md`,
   `audit/autobahnwetter.md`, `tsconfig.app.tsbuildinfo` bleiben unberührt):
   ```
   git add -- CLAUDE.md MANUELLE-SCHRITTE.md QUELLENMATRIX.md budget.json docs/DATA_SOURCES.md package.json src/nowcast/EventsTile.tsx src/nowcast/MinuteChart.tsx src/nowcast/MinuteSeriesCard.tsx src/nowcast/NowcastDeck.tsx src/nowcast/NowcastRadarMap.tsx src/nowcast/eventDetail.ts src/nowcast/minuteSeries.css src/nowcast/minuteSeries.ts src/nowcast/nowcastEngine.ts src/nowcast/nowcastModel.ts src/nowcast/rainWindow.ts audit/niederschlag-ruc.md audit/niederschlag-ruc scripts/lib/fixtures/ruc scripts/ruc scripts/verify-ruc.mjs src/nowcast/rucSeries.ts src/point/client/rucPoint.ts src/point/rucFormat.ts
   git commit -m "feat(regenradar): 5-min precipitation form from ICON-D2-RUC behind the radar (phase RUC)"
   ```
2. **Workflow ins Daten-Repo** (frische Basis, kein Rebase, kein Force; `C:\dev\buscosun-data` ist ein Klon mit `origin`):
   ```
   cd C:\dev\buscosun-data
   git fetch --depth=1 origin main
   git checkout --detach FETCH_HEAD
   copy C:\dev\buscosun-web\scripts\ruc\workflow-ruc.yml .github\workflows\ruc.yml
   git add .github/workflows/ruc.yml
   git commit -m "ci: ruc.yml - 5-min precipitation form from ICON-D2-RUC (phase RUC, cron :52)"
   git push origin HEAD:main
   ```
   (Sparse-Checkout: fehlt `.github` in den Mustern, vorher `git sparse-checkout add .github`; wird der Push abgewiesen, die Schritte
   ab `fetch` wiederholen.) Bis `main` von `buscosun-web` gepusht ist, endet jeder Lauf grün ohne Schreiben.
3. **Push von `buscosun-web` `main`**: `main` liegt 40 Commits vor `origin/main` (Fusion 13 `1b61ba35`, Start-Kacheln, Atmo, Brand,
   Glacier, Seewetter, Dashboard-Stil, dazu RUC); der Push macht alles davon auf buscosun.com live. Der erste RUC-Lauf kommt danach
   von selbst um :52 (sofort: Actions → ruc → „Run workflow"; kein `gh` hier, deshalb kein Dispatch aus der Sitzung); `RUC_KILL` nur bei Bedarf anlegen (fehlt sie, läuft der
   Workflow; `1` hält ihn an). Erwartung laut lokalem Volllauf: Bau ≈ 70 s, Publish ≈ 10 s, Commit `ruc: <Lauf>` mit 208 PNG (≈ 5,4 MB)
   + `run.json` + `latest.json` + `stations/<Lauf>-<Katalog>.png`; die letzte Zeile des Bau-Schritts ist eine JSON-Zeile mit `stats`
   (`missing` sollte 0 sein) und `timing`.
4. **Sichtprüfung** nach dem ersten Commit des Workflows: `https://raw.githubusercontent.com/jppetry/buscosun-data/main/ruc/v1/latest.json`
   zeigt den Lauf; `/regenradar` an einem Ort mit Regen in den nächsten Stunden zeigt im Minutenverlauf die 5-min-Stufen hinter dem
   Radar und im Regenbeginn-Satz „ab etwa HH:MM (±30 min)". `?ruc=0` ist der Rückfall (alles wie vor RUC, Verifier G).
5. **Messung T9 nach ≥ 14 Tagen** (läuft parallel zum eingeschalteten Produkt): vorher `build-dense-obs.mjs` bis zum Vortag (wie vor
   einer Prüfstand-Abnahme), dann `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/ruc/ruc-measure.mjs
   --store=<Klon des Daten-Repos>/ruc/v1 --obs=C:/dev/buscosun-pruefstand/obs-dense --from=<Tag nach dem Erstlauf>
   --out=audit/niederschlag-ruc/t9-<datum>.json`. Die Regel ist eingefroren (Hash `4e660c231a709c8a`, Audit §6 T9); das Verdikt rechnet
   das Skript. Mit grünem Verdikt wird die gesetzte Spanne ±15/30/45 durch die gemessene ersetzt; mit rotem Verdikt ist `?ruc=0` der
   Rückfall und die Voreinstellung deine Entscheidung.
6. Optional: der Erstlauf eines Monats (CLAT/CLON-Cache `ruc-cells-v1` leer) holt die Zellkoordinaten einmal (≈ 1 s); nichts zu tun.

## 75. Regen-Kante der Anzeigen im Regenradar (E-RUC-11, `audit/niederschlag-ruc.md` §10, V-RUC-20…23), 2026-10-24

Auf dein Wort („mache die Änderungen so", 24.10. abends) gebaut und **voreingestellt an**; `?mvgate=0` ist der Rückfall (byte-gleich zu
vorher, `verify:ruc` Block J). Eine Fusion-Stunde gilt in Minutenverlauf, Ereignissen und Karten-Pin nur als Regen, wenn Stundenmittel
≥ 0,1 mm/h UND Regenchance ≥ 30 % (`src/nowcast/rainGate.ts`, = `RB_P_EDGE`); darunter kein Balken und keine Stufe, in der Detailansicht
der Hinweis „‹Chance› · ‹Menge›", die Summe zählt nur gezeichnete Stunden und nennt den Rest als „+ x mm möglich". Ereignis-Minuten liegen
nie mehr im Radarfenster (V-RUC-21), die drei Anzeigen nennen eine Minute (V-RUC-22). Beleg `audit/niederschlag-ruc/2026-10-24-regenkante-herborn-48h.jpg`.
Die Messung RUC gegen Fusion 13 vom 23./24.10. (V-RUC-23) liegt unter `audit/niederschlag-ruc/2026-10-24-ruc-vs-fusion13-niederschlag.*`;
dafür wurden lokal die Hindcast-Slots 22.–24.10. nachgezogen (`queue.mjs follow`, `C:\dev\buscosun-hindcast\slots\`) und W1 für
23./24.10. unreif gebaut — beides bleibt lokal, nichts wurde gepusht.

1. **Commit in `buscosun-web`** (nur diese Linie; `MinuteChart.tsx`/`MinuteSeriesCard.tsx` tragen auch die 2-h-Kachel von E-RUC-10 vom 23.10.; die
   fremden Linien AW §19.13, HB, LM, WL-5 bleiben unberührt):
   ```
   git add -- CLAUDE.md MANUELLE-SCHRITTE.md budget.json src/nowcast/rainGate.ts src/nowcast/rucSeries.ts src/nowcast/minuteSeries.ts src/nowcast/minuteSeries.css src/nowcast/MinuteChart.tsx src/nowcast/MinuteSeriesCard.tsx src/nowcast/eventDetail.ts src/nowcast/nowcastEngine.ts src/nowcast/nowcastModel.ts src/nowcast/rainWindow.ts scripts/verify-ruc.mjs audit/niederschlag-ruc.md audit/niederschlag-ruc/2026-10-24-live-herborn-naht-drei-zeiten.jpg audit/niederschlag-ruc/2026-10-24-regenkante-herborn-48h.jpg audit/niederschlag-ruc/2026-10-24-ruc-vs-fusion13-niederschlag.txt audit/niederschlag-ruc/2026-10-24-ruc-vs-fusion13-niederschlag.json audit/niederschlag-ruc/2026-10-24-measure-ruc-f13.mjs
   git commit -m "feat(regenradar): rain gate of the displays - hours under 0.1 mm/h or 30 % chance are hints, not rain (E-RUC-11)"
   ```
   `verify:ruc` 115/115, `verify:rain-window` 62/64 (G2/G3 an HEAD rot, V-RUC-14), typecheck grün, Build 260/260; Budget-Ratsche
   totalJs 1905 → 1912 mit Notiz (IST 1905,7 im geteilten Arbeitsbaum, nicht isoliert messbar), eagerJs unverändert 110,1 (HB, §73.4).
2. **Push = live.** Danach am Regenradar eine Spurenstunde ansehen (Detailansicht, Hinweis „x % · y mm" an der Grundlinie).
3. **Offen für T9:** die Kante 30 % ist gesetzt; V-RUC-23 nennt 35 % als gemessenen Kandidaten eines Herbst-Frontregens — nach 14 Tagen
   Messung entscheiden, ob `RAIN_GATE_P` nachzieht (eine Konstante, ein Ort).
4. **Nachtrag 25.10. (E-RUC-12, `audit/niederschlag-ruc.md` §11, V-RUC-24):** auf dein Wort („das mit den schraffierten Kacheln rückgängig
   machen") zeichnet der Minutenverlauf Stunden ohne RUC-Form nicht mehr schraffiert, sondern wie den Rest der 5-min-Form; der Regenchance-
   Streifen trägt die Unsicherheit. Dieselben Dateien (`MinuteChart.tsx`, `minuteSeries.css`, `MinuteSeriesCard.tsx`, Audit) — der Commit-
   Befehl in Punkt 1 deckt sie, dazu den Beleg `audit/niederschlag-ruc/2026-10-25-ohne-schraffur-herborn-48h.jpg` mit `git add`; wenn du getrennt
   committen willst: `git commit -m "style(regenradar): no hatching for hours without a RUC form (E-RUC-12)"`.
5. **Nachtrag 25.10. (E-RUC-13, `audit/niederschlag-ruc.md` §12):** auf dein Wort („ja, mache, nur bis 27 h") zeichnet der Minutenverlauf die
   5-min-Form bis +27 h als Minutenkurve statt als Stufen: die kumulierte Menge wird monoton-kubisch durch die 5-min-Stützstellen gelegt, jede
   5-min-Summe und jede Stundensumme bleibt exakt (`verify:ruc` Block K, 130/130); Zahlen (erster Regen, Spitze, Summe) bleiben auf den Stufen,
   Fusion-Stunden jenseits +27 h bleiben Balken. Dazu auf dein Wort („ein weicher Übergang, ohne die Daten zu verfälschen") der weiche Start an
   der Radar-Naht (§12.1: Starttangente = letzter Radar-Minutenwert, Deckel 3 × erstes 5-min-Mittel, keine Summe ändert sich). Rückfall
   `?mvcurve=0` = Stufen. Offen für dich: V-RUC-25 (Kurvengipfel über der KPI „Spitze", Empfehlung Untertitel „5-min-Mittel"). Zusätzlich zum Befehl in Punkt 1:
   `git add src/nowcast/rucCurve.ts audit/niederschlag-ruc/2026-10-25-minutenkurve-herborn-48h.jpg audit/niederschlag-ruc/2026-10-25-minutenkurve-naht-herborn-48h.jpg audit/niederschlag-ruc/2026-10-25-detail-27h-herborn.jpg audit/niederschlag-ruc/2026-10-25-detail-27h-naht-rechts-herborn.png`; getrennter Commit, wenn gewünscht:
   `git commit -m "feat(regenradar): 5-min form of the RUC as a mass-conserving minute curve (E-RUC-13)"`.
6. **Nachtrag 25.10. (E-RUC-14, `audit/niederschlag-ruc.md` §13):** auf dein Wort („nur noch 2 h, 6 h und 27 h") zeigt die Detailansicht des
   Minutenverlaufs die Stufen 2 | 6 | 27 h (Voreinstellung 27 h, Titel/KPIs/Summe bis +27 h, `MV_VIEW_H`); die Ereignisse behalten 48 h. Dateien
   `minuteSeries.ts`, `MinuteSeriesCard.tsx`, `verify-ruc.mjs` sind im Befehl von Punkt 1 enthalten; getrennter Commit, wenn gewünscht:
   `git commit -m "feat(regenradar): minute chart overlay offers 2 | 6 | 27 h (E-RUC-14)"`.
7. **Nachtrag 25.10. (E-RUC-15, `audit/niederschlag-ruc.md` §14):** auf dein Wort („mach ein Balkendiagramm daraus", Rückfrage: alles als Balken)
   zeichnet der Minutenverlauf jede Ebene als Balken in ihrer Auflösung (Radarbild 5 min, RUC 5 min, Fusion 1 h), nichts ist interpoliert;
   erster Regen/Spitze/Summe des Radar-Teils aus den Bild-Balken. Rückfall `?mvbars=0` = Linie + Kurve wie vorher (`verify:ruc` 136/136).
   Dateien im Befehl von Punkt 1 enthalten; dazu `git add audit/niederschlag-ruc/2026-10-25-balken-herborn-27h.jpg audit/niederschlag-ruc/2026-10-25-balken-hover-herborn.png`;
   getrennter Commit, wenn gewünscht: `git commit -m "feat(regenradar): minute chart draws every layer as bars at its own resolution (E-RUC-15)"`.

## 76. Autobahnwetter — Dossier-Ebene „Karte | Dossier" (Phase AWD, `audit/autobahn-dossier.md`), 2026-10-26

1. **Sichtprüfung** (nur mit der Gefahren-Leiste, also ohne `?roadhz=0`): `/autobahnwetter` → oben rechts „Karte | Dossier"; ein Abschnitt in der Liste rechts öffnet das Dossier (Streckenband + Detail in der Mitte), „Karte" bringt die Karte zurück. Desktop 1440, Tablet 1024, Mobil 390 (Belege: `%TEMP%\awd-shots\v3-dossier.png`, `v11-tablet-dossier.png`, `v9-mobil-dossier.png`).
2. **E-AWD-2 bestätigen oder umstellen:** ein Klick auf einen Abschnitt oder Messpunkt auf der Karte markiert nur; die markierte Zeile trägt „Dossier öffnen ›". Wenn du lieber sofort ins Dossier springen willst, ist es eine Zeile in `pickSegment`/`pickStation` (`RoadPage.tsx`).
3. **Commit/Push** (Auftrag fehlt bisher, daher nicht committed): `git add src/road/RoadPage.tsx src/road/RoadBand.tsx src/road/RoadHazardDetail.tsx src/road/RoadHazardPanel.tsx src/road/roadDeck.css src/road/roadState.ts scripts/verify-road-ui.mjs audit/autobahn-dossier.md CLAUDE.md MANUELLE-SCHRITTE.md` und `git commit -m "feat(road): map | dossier stage with the section strip and the segment detail in the centre"`. Push = live; `?roadhz=0` schaltet die Leiste samt Umschalter wieder ab.

## 77. Autobahnwetter — „buscosun Fusion — Fahrbahn" (Phase FB, AW-6.2, `audit/autobahn-fahrbahn.md`), 2026-10-26

Gebaut und verifiziert, alles uncommitted im Arbeitsbaum; Daten- und Archiv-Repo unberührt. **Gate D-T ist nach der
eingefrorenen Regel ROT** (bei +1 h schlägt die reine Differenz Fahrbahn − Luft ohne Abklingen um 0,05 K; ab +2 h und
gegen den heutigen Luft-Proxy der Seite ist FB-1 bei jedem Vorlauf 0,5–1,2 K besser), **Gate D-K nicht messbar**
(33 statt ≥ 100 Frost-Ereignisse im Oktober). **Jan hat am Nachmittag trotzdem eingeschaltet (E-FB-10):
`ROAD_SURFACE_LIVE = true`.** Live wird die Fahrbahn aber erst, wenn BEIDES passiert ist: Tabelle im Daten-Repo (Schritt 2)
UND Push von `main` (Schritt 3). Rückweg je Besucher `?rsfc=0`, global `ROAD_SURFACE_LIVE = false` + Push.

1. **Ansehen (2 min):** `/autobahnwetter/a8` — erst NACH Schritt 2 und 3 zeigt es echte Werte; vorher sagt der Lauf
   „nicht gerechnet — static/surface.json fehlt" und die Seite bleibt bei „Luft". Ein Beleg mit Fixture-Lauf liegt in
   `audit/autobahn-fahrbahn/ui/w2-fahrbahn-station-1440.png`. Bericht lesen:
   `audit/autobahn-fahrbahn/backtest-2026-10-26.md` (Gate-Zeilen am Ende).
2. ~~Tabelle ins Daten-Repo kopieren~~ **erledigt 26.10. 15:55 UTC+1 mit Jans Freigabe:** Daten-Repo `8e1f4ce18`
   (`checkout --detach origin/main` → `cherry-pick` → `push HEAD:main`, erster Versuch nach einem abgewiesenen Push auf
   altem Stand), `road/fc/v1/static/surface.json` 12 993 B, SHA-256 auf raw.githubusercontent geprüft. Der stündliche Lauf
   schreibt die Reihen aber erst, wenn `buscosun-web/main` den neuen Producer trägt (Schritt 3 — der Job klont `main`);
   bis dahin ignoriert der alte Producer die Datei. Zur Doku der Schritte:
   `copy C:\dev\buscosun-road-publish\2026-10-26-fb1\surface.json <buscosun-data>\road\fc\v1\static\surface.json`
   (SHA-256 `6f3d60f4e1e2fa5c2e2307501888e2d5d773a0c55b7c4e93a78639b340fe2683`), im Daten-Repo per
   `checkout --detach origin/main` → `add` → `commit -m "road-fc: surface table FB-1 (2026-10-04 … 2026-10-25)"` →
   `push HEAD:main` (V-WL-20). Der nächste `road-fc`-Lauf loggt „Fahrbahn (FB): Tabelle 6f3d60f4e1e2 …, N Punkte mit
   eigener Messung". Rückweg: Datei löschen oder Repo-Variable `ROAD_SURFACE=0` (der Lauf nennt den Grund im Kopf).
3. **Commit/Push `buscosun-web`** (Push = live: mit Schritt 2 zeigt die Seite die Fahrbahn „berechnet"):
   `git add src/road/roadSurface.ts src/road/roadFc.ts src/road/roadFlag.ts src/road/roadFcView.ts src/road/RoadReadout.tsx src/road/RoadPage.tsx src/road/roadDeck.css src/router/pages/RoadRoute.tsx scripts/road/road-forecast.mjs scripts/road/road-fc-archive.mjs scripts/road/road-surface-backtest.mjs scripts/verify-road-surface.mjs scripts/verify-road-fc.mjs scripts/verify-road-ui.mjs package.json budget.json audit/autobahn-fahrbahn.md audit/autobahn-fahrbahn MANUELLE-SCHRITTE.md CLAUDE.md`
   und `git commit -m "feat(road): buscosun Fusion - Fahrbahn: road surface forecast +0..6 h (FB-1) behind ROAD_SURFACE_LIVE, fit + backtest on the archive, shadow series in the route forecast"`.
   Wichtig für den Archiv-Job: `road-fc-archive.mjs` nimmt die neuen Reihen erst mit, wenn `main` gepusht ist (der Job
   klont `main`).
4. **Dezember (ab den ersten Frostnächten, ≥ 100 Ereignisse):** `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/road-surface-backtest.mjs --archive=C:\dev\buscosun-archiv --split=<Datum>` mit NEUER eingefrorener Regel
   (Tabelle rollierend 14 Tage, V-FB-1; Tag/Nacht-Gewichte, V-FB-8). Rot ⇒ Entscheidung, ob der Schalter zurück auf
   `false` geht.
5. **V-FB-6 (Datenprüfung):** 20 Anlagen mit unplausiblem Abstand Fahrbahn − Luft (E774: Fahrbahn 54–74 °C im
   Oktober) passieren die harten Regeln — eigener Auftrag, wenn gewünscht.

## 78. buscosun Fusion 14 — ICON-D2-RUC als Niederschlags-Member (E-RUC-16, `audit/niederschlag-ruc.md` §15), 2026-10-26

Auf dein Wort („neues buscosun fusion 14 … icon ruc inkludiert bei der beimischung … bis 27 h", Rückfrage: „Bauen, fitten, einschalten")
gebaut, gefittet und **eingeschaltet**: Register `n: 14`, `FUSION14_RUC_MEMBER = 2`, Kurven in `priors.ts`; Fit 1–11 h an 23 Hindcast-Slots
23.–26.10. gegen W1: Niederschlag-CRPS −3,2 % gegen Fusion 13, in keiner Vorlaufklasse und keinem Land schlechter; Brier P(nass) 7–11 h
+2,0 % schlechter (V-RUC-26); 13–27 h gesetzt, kein Spur-P-Urteil (Stichprobe von vier Tagen). **Lokal committet, nicht gepusht.**

1. **Push = live** (der Commit trägt nur diese Linie: `src/pointForecast/{types,leadTimeWeights,pfFlags,cubeSource}.ts`,
   `src/pointForecast/fusion/{priors,fusionRelease,output}.ts`, `src/dashboard/model/build.ts`, Audit §15 + Belege
   `audit/niederschlag-ruc/2026-10-26-fit-ruc-f14*`, `CLAUDE.md`, `MANUELLE-SCHRITTE.md`). Danach zeigt jede Seite „buscosun Fusion 14";
   `?rucm=0` ist je Besucher der Rückweg zu Fusion 13, global `FUSION14_RUC_MEMBER = 0` + Push.
2. **Sichtprüfung nach dem Push:** Panel mit `?pflog=1` — die Options-Note nennt `rucMember:set — …`, die Ergebnis-Note
   `rucMember: ICON-D2-RUC-Member an N Stunden (Lauf …, … min alt, …)`; ohne Produkt am Punkt steht dort „… ⇒ Niederschlag wie der Stand
   davor, ohne RUC-Member" (dann rechnet er Fusion 13). Dashboard-Herkunft zeigt „ICON-D2-RUC" an Niederschlagsstunden. Konsole und
   Ladezeit sind nicht geprüft (Sessionregel) — ein Blick lohnt (V-RUC-17).
3. **Nachfit (nach ≥ 14 Tagen RUC-Reihe, V-RUC-27):** `node --max-old-space-size=6144 --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/niederschlag-ruc/2026-10-26-fit-ruc-f14.mjs --ruc=C:/dev/buscosun-data/ruc/v1/stations --from=<ab> --to=<bis> --base --grid=<Gitter> --out=<json>`
   (vorher `queue.mjs follow` + `build-w1.mjs` bis zum Vortag; ein Prozess, über `detach.ps1`). Gitter dann 0,94–0,99 / τ 20–60 h für das
   Vorkommen. Für 13–27 h braucht es Stationsreihen über 12 h hinaus (`RUC_STATION_STEPS` im Producer = Daten-Repo = dein Gate).
4. **Offen zur Entscheidung:** V-RUC-26 (Brier 7–11 h: Modus 3 = Menge aus K-2, P(nass) aus der gelernten Hürde — eine Zeile im Motor,
   dieselbe Messung); Spur P bleibt unmöglich, bis der Hindcast RUC trägt (V-RUC-11).
5. **Streckenprognose `road/fc` (Nachtrag 26.10. abends, §15.5):** der Producer-Workflow checkte `ruc/` nicht aus ⇒ die Streckenprognose
   hätte unter dem Namen Fusion 14 den Niederschlag von 13 gerechnet. Die Vorlage `scripts/road/workflow-road-fc.yml` checkt jetzt auch
   `ruc` aus (`verify:road-fc` E3). **Kopie ins Daten-Repo = dein Gate:** `.github/workflows/road-fc.yml` durch die Vorlage ersetzen und
   pushen; der nächste Lauf nennt im Kopf `rucMember: ICON-D2-RUC-Member an N Stunden`. Ohne die Kopie läuft alles weiter, nur ohne Member.
6. **Kartenfelder, Seewetter, Gletscher (Nachtrag 26.10. abends, dein Wort „schalte es da auch an", §15.5):** der Feld-Producer liest
   jetzt je t1-Zelle die RUC-Spalte (V-RUC-28 umgesetzt); Seewetter- und Gletscher-Producer holen `ruc/` mit in den Cube-Checkout (Werte
   dort byte-gleich, der Lauf nennt den Stand ehrlich). **Drei Kopien ins Daten-Repo = dein Gate**, jede für sich, ohne Kopie läuft alles
   wie bisher: `scripts/repack-repo/workflow-point.yml` → `.github/workflows/point.yml` (nur der t1-Job hat `ruc` im Sparse-Block),
   `scripts/sea/workflow-sea.yml` → `sea.yml`, `scripts/glacier/workflow-glacier-melt.yml` → `glacier-melt.yml`. Prüfung danach: der
   t1-Feldlauf loggt „RUC-Member an N" und `point/field/v1/<lauf>/t1/field.json` trägt `chain.options.ruc.run`; ohne Kopie steht dort
   `reason: "ruc/ nicht im Checkout"`. Offen: V-RUC-29 — das Etikett „Modell · Cube" der Karte nennt den RUC-Anteil nicht (deine Wortwahl
   F1 ⇒ Rückfrage).

## 80. Niederschlagsradar — 25 Bilder bis +2 h überall (Phase NC, `audit/radar-nowcast-dach.md`), 2026-10-27

Alles uncommitted in `buscosun-web`; das Spiegelskript im Daten-Repo ist schon gepusht (`6a7d113bd`) und schlummert.

1. **Commit + Push von `main`** (`buscosun-web`) = dein Gate. Erst damit bildet der nächste Spiegel-Job (≤ 5 h 45 nach dem Push,
   Marker `src/sources/radarNowcastImg.ts` im Sparse-Klon) `radar/img/v1/rzc-nc/` und `inca-5m/`; der Client fällt bis dahin auf den
   Stand vor NC zurück (`null` = rzc-Analyse allein, INCA nach Vorlauf). Prüfung danach: Spiegel-Log „Nowcast-Produkte an",
   `radar/status.json` `nc: true`, Zeilen „rzc-nc … → 73 Dateien", „inca-5m … → 69 Dateien"; im Browser die Konsolenzeilen
   „CH Hochrechnung → Slot …" und „AT INCA · 5 min → Lauf …" ohne `?ncbase`.
2. **E-NC-2 (STOPP-Grenze Shader):** die Übergangszone braucht ein Alpha-Gewicht in der Masken-Zeile des `RainLayer`-Fragment-Shaders
   (`mw`, 4 Zeilen; 0/1-Masken byte-gleich). Zwei Wächter sind deshalb rot (`verify:radar-hd` E2, `verify:regenradar-profile` E8) —
   Freigabe oder Nein (dann Maske binär, Nähte hart an den neuen Linien).
3. ~~**Rückwege:** `?nc=0` je Besucher; Producer `RADAR_NC=0`~~ — **28.10. umgedreht (§6 im Audit, dein Auftrag „ohne Schalter
   byte-gleich"):** Client AUS bis `?nc=1` (alias `?chnc=1`, dein Wortlaut) bzw. `localStorage.radarnc = '1'`; Producer AUS bis
   `RADAR_NC=1`. **Dein Schritt:** die Kopie von `scripts/radar-mirror/radar-mirror.mjs` im Daten-Repo (`6a7d113bd`) trägt noch
   die alte Voreinstellung (an, sobald `main` den Vertrag hat) — vor dem Push von `main` die neue Kopie einspielen oder in
   `radar.yml` bewusst `RADAR_NC=1` setzen (E-NC-4: Voreinstellung aus = Rule 2; Einschalten = deine Entscheidung).
4. **E-NC-5 (28.10., umgesetzt, bitte bestätigen):** die Zugrichtung der CH-Hochrechnung ist jetzt EINE Verschiebung je Bildpaar
   (Korrelation der 4×-vergröberten Bilder, Subpixel) statt des Horn–Schunck-Felds — das Feld ließ die Hochrechnung nach wenigen
   Schritten stehen und maß 15–50 % zu langsam (V-NC-7, Messung `audit/radar-nowcast-dach/flow-scale.mjs`). Morph der Karte und
   INCA-Zwischenbilder unverändert. Nein ⇒ `flowFromSeries` zurück auf `estimateMorphFlow` (ein Block in `radarNowcastExtrap.ts`).
5. **Blaue Flecken Südschweiz (dein Befund 28.10.):** keine Radar-Farbe — es ist der Layer **Schnee** (Schneedecke ICON-D2 `h_snow`,
   gesättigt auf Gletscherhöhe: Hover 3 502 m, „Niederschlag trocken"), der im Regenradar standardmäßig an ist und mit `snowRamp`
   (Weiß→Blau) in derselben Farbfamilie wie leichter Regen liegt. Nicht geändert (Funktionserhalt). Vorschlag V-NC-8: im Profil
   `radar` den Schnee-Layer standardmäßig aus ODER eine klar getrennte Palette — deine Wahl.
6. **Offen:** V-NC-1 (Kreuzungspunkte INCA 120 / CH 60 min messen, ab ≥ 14 Tagen Produkten), V-NC-2 (RV-Reichweite statt Linie),
   V-NC-3 (Sichtprüfung der Nähte an einem Regentag — 28.10. nur ohne Zug), V-NC-4 (Schraffur statt Schleier), V-NC-6 (Nord-CH:
   DWD-RV statt rzc ist eine Qualitätsfrage), V-NC-9 (Mobil: INCA-Altersnotiz wird abgeschnitten).

## 79. Autobahnwetter — Virtueller Fahrbahnsensor (Phase VS = AW-6.2, `audit/autobahnwetter.md` §20), 2026-10-27

Zweig `feat/aw-6.2-virtueller-sensor`, ein Commit je Arbeitspaket; nichts davon ist live (`ROAD_VS_LIVE = false`, E-VS-2).

1. **Recherche-Datei:** ~~fehlt~~ — liegt als `Fahrbahnzustand ohne Sensor.md` in der Repo-Wurzel (28.10., untracked). Soll sie nach
   `audit/fahrbahnmodell-recherche.md` wandern und committet werden? Dann stelle ich das Register §20.6 von `set` auf `literature` um,
   wo die Datei die Quelle nennt (V-VS-22).
2. **Nummern:** E-AW-38…43 des Startprompts waren schon vergeben (§19.6) ⇒ die Entscheidungen heißen E-VS-1…6 (§20.1). Einspruch?
3. **Sicht nach dem 30.11.2026:** der DWD nimmt VIS auch aus ICON-D2-RUC (§20.2 i). Vorschlag §20.3 (2): ab Dezember Sicht 0–48 h
   aus eigener Diagnose + Messung + MOSMIX, RUC-VIS bis dahin nur als Lern-/Vergleichsgröße. Alternativ 6.2.6 zurückstellen.
4. **E-VS-7 SWSMOS-Archiv gekürzt** (GMA-Schnittmenge, `TL TS TD RC`, 48 h ⇒ 223 KB gz je Lauf, ≈ 5,4 MB/Tag, ≈ 160 MB/Monat im
   Archiv-Repo): so gebaut; Nein ⇒ Spalten/Horizont ändern, bevor der Workflow läuft.
5. **Zweig auf GitHub:** beide Workflow-Vorlagen klonen `buscosun-web`. Vor dem Merge brauchen sie den Zweig auf `origin`
   (`git push -u origin feat/aw-6.2-virtueller-sensor`) — dein Push. Danach spiele ich ein (deine Freigabe für Daten- und Archiv-Repo
   liegt im Startprompt vor): `scripts/road/workflow-road-vs.yml` → `buscosun-data/.github/workflows/road-vs.yml` mit Repo-Variable
   `ROAD_VS_WEB_REF = feat/aw-6.2-virtueller-sensor` (leer = main nach dem Merge); `scripts/punktarchiv-repo/workflow-road-archiv.yml` →
   `buscosun-archiv/.github/workflows/road-archiv.yml` (Schritt „Archive SWSMOS", Sparse `road` + `swsmos`) — der Archivjob klont dann
   ebenfalls den Zweig, bis gemerged ist (eine Zeile in der Vorlage, `--branch`). Ohne Schritt 5 sammelt niemand SWSMOS; der DWD hält 48 h.
6. **Erster Volllauf des Antriebs** (nach 5): `workflow_dispatch` von `road-vs` oder lokal
   `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/vs/build-forcing.mjs --data=C:\dev\buscosun-data --out=<Ordner>`
   (ohne `--publish`), Log: Felder, `missing`, `outOfRange`, Größe, Zeit — Zahlen gehören in §20.7.
7. **Rückwege:** Repo-Variable `ROAD_VS=0` (kein Antrieb), Schritt „Archive SWSMOS" entfernen (kein SWSMOS), `?roadvs=0` je Besucher
   (wirkt erst, wenn die Seite den VS zeigt).
8. **Ortsdatei (6.2.2):** `road/vs/v1/static/site.json.gz` (0,76 MB) liegt gebaut im lokalen Klon `C:\dev\buscosun-data`, noch nicht
   gepusht; sie geht mit dem ersten Push der Linie ins Daten-Repo (Schritt 5), zusammen mit `static/cells.json` aus dem ersten
   Antriebslauf. Neubau nur bei neuer Punktdatei: `build-site.mjs --data=… --cache=C:\dev\buscosun-road-publish\cache\glo30` (≈ 5 min,
   1,3 GB GLO-30 aus dem Plattencache).
9. **Dauerlauf (6.2.7) und Archiv:** die Vorlage `scripts/road/workflow-road-vs.yml` enthält jetzt zwei Schritte (Antrieb, dann
   `run-vs.mjs --publish`; Sparse `road/fc/v1 road/v1 road/vs`), die `road-archiv`-Vorlage den Schritt „Archive virtual sensor"
   (`archive-vs.mjs`, Daten-Klon sparse um `road/vs/v1` erweitert). Einspielen wie in Schritt 5. Erster Lauf lokal gemessen: Antrieb
   117 s, Derive 191 s, 1 086 gekoppelte Stationen, Zustand 1,2 MB gz, Produkt 11 MB roh — acht Läufe am Tag ≈ 100 MB Commits im
   Daten-Repo (V-VS-18, bei Bedarf Zustand/Produkt dünner).
10. **Standortkorrektur lernen (ab ≈ 7 Tage Archiv):** `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/vs/build-residuals.mjs --archive=C:\dev\buscosun-archiv\road\vs\v1 --out=C:\dev\buscosun-data\road\vs\v1\static\residuals.json`,
    dann Commit/Push des Daten-Repos (Weg V-WL-20). Ohne Tabelle rechnet der VS ohne Korrektur und sagt es im Kopf (`residuals: null`).
11. **Prüfstand (6.2.8, ab ≈ 14 Tage Archiv, Gate G erst mit Winterdaten):** `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/vs/score-vs.mjs --vs=C:\dev\buscosun-archiv\road\vs\v1 --gma=C:\dev\buscosun-archiv\road\v1 --swsmos=C:\dev\buscosun-archiv\swsmos\v1 --out=audit\autobahnwetter\vs\score-<Datum>.json`
    — Ergebnis mit allen Baselines in §20.14; danach entscheidest du die Gate-G-Schwellen (Vorschlag dort).
12. **Nicht gebaut (bewusst, offen):** Modellflächen T/HHL für Bourgouin (V-VS-6); RUC-EPS-Memberanteil (gibt es im v1-Pfad nicht);
    CDC-Sichtstationen für die Kalibrierung (V-VS-15); POI-Sicht (V-VS-14); gepooltes Gradient-Boosting (nach einem Winter, V-VS-12).
    Die Verdrahtung in der Seite (V-VS-17) ist seit 28.10. gebaut (Schritt 13).
13. **Anzeige prüfen (AW-6.2.9, E-VS-8, 28.10.) — ERLEDIGT 28.10. 10:00 UTC mit deiner Freigabe (§20.16):** Schritte 5, 8, 9 sind
    eingespielt (Zweig auf `origin`, `road-vs.yml` + Ortsdatei + Zellindex im Daten-Repo `95a4306e5`, `road-archiv.yml` im Archiv
    `ba0a83e`, Variable `ROAD_VS_WEB_REF` auf beiden Repos — nach dem Merge leeren), erster Lauf 2026102806 veröffentlicht, die fünf
    Blicke belegt. Offen aus dem ersten Lauf: V-VS-25 (Messslot „nicht nutzbar" ⇒ 0 gekoppelt). Der Cron läuft ab 10:25 UTC alle 3 h;
    Seite mit `?roadvs=1` (`ROAD_VS_LIVE` bleibt `false`; `?roadvs=0` schaltet zurück, `localStorage.roadvs` merkt sich die Wahl).
    Was zu sehen ist: (a) eine Messstelle ohne gültigen Fahrbahnwert — Kopfzeile
    „Fahrbahnsensor ausgefallen · virtueller Sensor", Wert mit Info-Zeichen, Badge in Klassenfarbe mit gestrichelter Umrandung,
    Klick auf „i" öffnet die Herkunft; (b) ein Prognosepunkt — Hero „Fahrbahn · berechnet" über dem Luft-Hero, Verlauf 0 … 24 h;
    (c) Strecke — gestrichelt umrandete Chips an Zeilen ohne Messung; (d) Karte — Marker mit hellem gestrichelten Innenring und Label
    `~+1,2°`, Achsenpunkte in der Fahrbahn-Klassenfarbe; (e) Mobil 390 px — Info-Knopf treffbar (44 px). Kartenlegende ohne VS-Eintrag
    (V-VS-19, nach dem AWD-Commit). Befunde in §20.16.
