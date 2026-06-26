# your-actions.md — manuelle Aktionen (Runner wartet NICHT darauf)

Aktionen, die nur der Mensch ausführen kann (externe Konten, Netzwerk/CDN,
Community). Der autonome Runner sammelt sie hier und macht code-seitig weiter.

## Offen

### Phase 0.3 — SEO-Infra
- [ ] **GSC + Bing Webmaster Tools**: Property `https://buscosun.app` verifizieren.
- [ ] **Sitemaps einreichen**: `/sitemap.xml` (und später `/sitemap-news.xml`,
      `/feed.xml`) in GSC + Bing einreichen.
- [ ] **Host-404**: Statisches Hosting so konfigurieren, dass unbekannte Pfade
      `dist/404.html` mit **HTTP-Status 404** (nicht 200) ausliefern.
      - Netlify: automatisch (`404.html` wird mit 404 serviert).
      - Cloudflare Pages: automatisch.
      - Vercel: `404.html` → 404; ggf. `cleanUrls`/`trailingSlash` prüfen.
      - GitHub Pages: liefert `404.html`, aber mit HTTP 200 (Limitation) — falls
        dort gehostet, vor Tier-Expansion auf einen Host mit echtem 404 wechseln.
- [ ] **CDN/WAF**: sicherstellen, dass keine Firewall-Regel AI-Bots (GPTBot,
      ClaudeBot, PerplexityBot, CCBot, OAI-SearchBot) netzwerkseitig blockt
      (Cloudflare „Block AI Scrapers"-Toggle AUS lassen, wenn Zitierbarkeit erwünscht).
- [ ] **JSON-LD extern gegenprüfen**: Rich-Results-Test (Google) für Home + eine
      Ortsseite (lokal bereits via `verify:seo` JSON-validiert).
