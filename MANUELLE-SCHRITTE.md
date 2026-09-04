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

## 3 · Search Console / Bing
- [ ] Google Search Console: Domain-Property `buscosun.com` per DNS-TXT verifizieren.
- [ ] Bing Webmaster Tools: Property anlegen (Import aus GSC möglich).
- [ ] Sitemap einreichen: `https://buscosun.com/sitemap.xml` (nach E9: `sitemap-index.xml`).
- [ ] Nach 14 Tagen: Bericht „Seiten" — Ziel ≥ 80 % der eingereichten URLs indexiert; die Meldung
      „Duplikat — Google hat eine andere kanonische Seite" darf für `/wetterkarte/<layer>` nicht mehr
      auftreten.

## 4 · Rich-Results-Test (je Seitentyp eine URL; Liste wird in E10 ergänzt)

## 5 · AI-Sichtbarkeit (monatlich)
- [ ] `GEO-TESTSET.md` in ChatGPT, Perplexity, Claude und Google AI Overviews/AI Mode abfragen, Log-Tabelle
      dort füllen (N/E/L/F).

## 6 · Entitäten (extern)
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

## 9 · Optional: IndexNow (kostenlos, ohne Konto)
- [ ] Key-Datei `public/<key>.txt` anlegen (32 Hex-Zeichen), dann einmalig:
      `curl -X POST https://api.indexnow.org/indexnow -H "Content-Type: application/json" -d @indexnow.json`
      (JSON-Vorlage wird in E10 unter `scripts/seo/indexnow.example.json` abgelegt).
