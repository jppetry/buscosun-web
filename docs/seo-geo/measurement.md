# measurement.md — Mess- & Monitoring-Runbook (4.1)

Wie die Wirkung des SEO/GEO-Pakets gesteuert wird. buscosun ist **tracker-frei**,
daher Server-Logs statt JS-Analytics. Monatliche Kadenz.

## 1. Google Search Console (GSC)
Property `https://buscosun.app` verifizieren (Aktion → `your-actions.md`). Lesen:
- **Indexierung → Seiten**: Wie viele der eingereichten URLs sind indexiert?
  Achten auf „Gecrawlt – derzeit nicht indexiert" (Thin-Page-Verdacht → ggf.
  Scaffold lassen / Inhalt ausbauen). Tier-Expansion erst, wenn Tier 1 indexiert.
- **Leistung → Suchergebnisse**: Impressionen/Klicks je Query + Seite; filtern
  nach `/wetter/`, `/wissen/`, `/funktionen/`, `/wetterlage/`.
- **Leistung → Discover**: erscheint erst bei Discover-Traffic (Event-Artikel).
- **Sitemaps**: `sitemap.xml` + `sitemap-news.xml` einreichen, Status prüfen.
- **Internationale Ausrichtung / hreflang**: keine Reziprozitätsfehler (de-DE/AT/CH + x-default).
- **Rich-Results / Verbesserungen**: FAQ, Breadcrumb, Dataset, Article, NewsArticle.

## 2. Bing Webmaster Tools (WMT)
Property verifizieren, Sitemaps einreichen. „SEO-Reports" + „Crawl-Informationen"
prüfen. Bing speist auch ChatGPT-Suche (OAI-SearchBot/Copilot) → relevant für GEO.

## 3. Server-Log-Monitoring (AI-Crawler & AI-Referrals)
Zugriffslog des Hosts ziehen (Combined/Common-Format) und auswerten:
```
node scripts/seo/parse-crawler-logs.mjs <access.log> [weitere.log ...]
# oder: npm run seo:logs -- <access.log>
```
Belegt, dass **GPTBot, OAI-SearchBot, ClaudeBot, Claude-SearchBot, PerplexityBot,
Googlebot, Bingbot** echte Inhalte mit **HTTP 200** abrufen (nicht das leere
SPA-Shell-JS), und erkennt **AI-Referrals** (chatgpt.com, perplexity.ai, gemini,
claude.ai, copilot) über den Referer. Exit-Code 1, falls ein Crawler überwiegend
Nicht-200 erhält → Hinweis auf CDN/WAF-Blockade (→ `your-actions.md`).

Monatlich: Trend der Crawler-Treffer + AI-Referrals notieren.

## 4. Manuelle AI-Visibility-Baseline
Da AI-Antworten nicht in GSC auftauchen, einmal pro Monat die Prompt-Liste in
`ai-visibility-prompts.md` in ChatGPT, Perplexity und Gemini abfragen und ins
Log eintragen (genannt? verlinkt? korrekt?). Optional kostenpflichtig:
Otterly.AI (~$29/Mon.), Peec AI (~€89/Mon.).

## 5. Monatliche Routine (Kurz)
1. GSC: Indexierung + Leistung + Discover sichten.
2. Bing WMT: Crawl + Reports.
3. `npm run seo:logs -- <log>`: Crawler-200 + AI-Referrals.
4. `ai-visibility-prompts.md`: Prompts abfragen, Log-Zeile ergänzen.
5. Auffälligkeiten → `blockers.md` (technisch) bzw. `your-actions.md` (extern).
