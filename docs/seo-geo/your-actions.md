# your-actions.md — manuelle Aktionen (Runner wartet NICHT darauf)

Aktionen, die nur der Mensch ausführen kann (externe Konten, Netzwerk/CDN,
Community). Der autonome Runner sammelt sie hier und macht code-seitig weiter.

## Offen

### Phase 0.3 — SEO-Infra
- [ ] **GSC + Bing Webmaster Tools**: Property `https://buscosun.com` verifizieren.
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

### Phase 1 — Content
- [ ] **Tier-1-Indexierung in GSC bestätigen**, bevor weitere Orts-Tiers ergänzt werden.
- [ ] **AI-Zitierbarkeit baselinen**: die 3 Explainer-Piloten (Föhn, Inversion,
      Nebelobergrenze) manuell in ChatGPT/Perplexity/Gemini abfragen.

### Phase 2 — Distribution
- [x] ~~Per-Tool/-Seite OG-Bilder statt `og.svg`-Platzhalter~~ → erledigt:
      14 gebrandete 1200×630-PNGs in `public/og/` (Regen: `og-images.md`).
      Optional: echte Produkt-Screenshots der Tools als noch hochwertigere Heros.
- [ ] **Community-Seeding** gemäß `seeding-kit.md`: Tools transparent/nicht-werblich
      posten (Wetterzentrale-Forum, Gleitschirm/Drachen-Foren, astronomie.de,
      Garten-/Drohnen-Foren). Vorher Forenregeln + Aktivität prüfen.
- [ ] **Digital-PR-Pitches** rund um Wetterereignisse vorbereiten.

### Phase 3 — Discover & Events
- [ ] **RSS + News-Sitemap einreichen** (`/feed.xml`, `/sitemap-news.xml`) und
      Discover-Berichte in GSC beobachten.
- [ ] **Google Publisher Center** prüfen (optional) für News-Aufnahme.
- [ ] **Echte Event-Artikel** bei markanten Wetterlagen anlegen (Vorlage:
      `scripts/seo/events.mjs`, Checkliste in `checklist.md`). News-Sitemap führt
      nur Artikel der letzten 2 Tage — alte werden automatisch ausgelassen.
- [ ] **Per-Event-Hero-Bilder** (≥1200px) statt `og.svg`-Platzhalter.

### Phase 4 — Measurement (siehe `measurement.md`)
- [ ] **GSC + Bing WMT** monatlich sichten (Indexierung, Leistung, Discover, hreflang).
- [ ] **Server-Logs ziehen** und `npm run seo:logs -- <access.log>` ausführen
      (AI-Crawler-200 + AI-Referrals). Bei Crawler-Nicht-200 → CDN/WAF prüfen.
- [ ] **AI-Visibility-Baseline**: `ai-visibility-prompts.md` (28 Prompts) monatlich
      in ChatGPT/Perplexity/Gemini abfragen, Log-Zeile ergänzen.
- [ ] Optional kostenpflichtig: Otterly.AI / Peec AI für automatisiertes AI-Monitoring.
