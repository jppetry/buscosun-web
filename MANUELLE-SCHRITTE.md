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

## 48. Phase OF — buscosun Fusion liest Stationsmessungen aus `buscosun-data/obs/v1`; Kandidat buscosun Fusion 12 (Volltest G3 rot ⇒ aus), 2026-10-08

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
