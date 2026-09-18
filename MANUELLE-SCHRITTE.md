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
