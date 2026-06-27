# buscosun SEO/GEO — Claude Code Ausführungsplan (autonom)

**Ziel:** Maximale organische Reichweite (klassisches + lokales SEO, GEO/AI-Sichtbarkeit, Google Discover) für buscosun.com.
**Stack:** Vite + React + TypeScript, MapLibre GL, Three.js/WebGPU, DWD ICON-D2.
**Workflow:** Sieben-Dateien-System, Diagnose-First (intern, ohne Halt), MCP (Chrome DevTools, Context7, Sequential Thinking, GitHub MCP).
**Modus:** **AUTONOM** — Claude Code läuft alle Phasen sequenziell durch und stoppt NICHT für deine Zustimmung. Gehalten wird nur bei einem fehlgeschlagenen Verifikations-Gate (Fail-Stop) oder einer echten externen Blockade.

> **Sprache:** Prompts auf Englisch (technische Artefakte), Rahmen auf Deutsch.
> **Bedienung:** Du fügst nur den **Master-Orchestrierungs-Prompt** ein. Er arbeitet 0.0 → 4.1 selbstständig ab. Die Einzel-Prompts darunter sind die Spezifikation, die der Master referenziert (musst du nicht einzeln einfügen).

---

## ▶ MASTER-ORCHESTRIERUNGS-PROMPT (einmal einfügen)

```text
ROLE
You are the autonomous lead engineer for the buscosun.com SEO/GEO work package (Vite + React + TS, MapLibre, Three.js/WebGPU, DWD ICON-D2 data).

MISSION
Execute the entire phased plan below — steps 0.0, 0.1, 0.2, 0.3, 0.4, 1.1, 1.2, 2.1, 3.1, 4.1 — IN ORDER and AUTONOMOUSLY. Do NOT pause to ask for my approval between steps. After finishing one step and passing its gate, immediately begin the next step. Run to completion (or to a Fail-Stop) without further input from me.

AUTONOMY RULES
1. Diagnose-first is INTERNAL: at the start of each step, run the diagnosis, decide based on the pre-committed defaults below, log the decision in /docs/seo-geo/architecture.md, and CONTINUE. Do not stop to present the diagnosis for approval.
2. Each step ends with a self-verification GATE (defined in that step). On PASS: log result, git-commit, continue to the next step. On FAIL: this is a Fail-Stop — halt, write the failure + cause + suggested fix into /docs/seo-geo/blockers.md, and report. Never build later phases on a failed gate.
3. Pre-committed DEFAULT decisions (do not ask me — apply these):
   - Rendering approach: build-time pre-rendering / SSG within the existing Vite stack. Pick the concrete tool by what fits the detected versions/deploy target, preference order: React Router v7 "framework mode" prerender > Vike > vite-react-ssg. Only choose SSR/hybrid-ISR instead if the diagnosis shows forecast text MUST be per-request fresh; default to SSG + scheduled regeneration otherwise.
   - hreflang: single "de" + "x-default" to start (no de-DE/AT/CH split yet).
   - Crawlers: ALLOW all search + AI crawlers (Googlebot, Bingbot, Google-Extended, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, CCBot).
   - Programmatic pages: Tier 1 only (largest cities + Alpine/tourism) in the first build; do not auto-expand tiers.
   - Content: build the 3 pilot explainers fully; scaffold the rest.
4. After EVERY step: update checklist.md (check off tasks), prompt.md (log the step), and create a git commit via GitHub MCP with a clear message (e.g. "seo-geo 0.2: SSG prerender — raw HTML verified"). Commits are mandatory so each step is a rollback point during unattended execution.
5. External actions that you CANNOT perform (GSC/Bing verification, sitemap submission, community posting, CDN/WAF inspection you can't reach from code): do NOT wait on them. Append them to /docs/seo-geo/your-actions.md and CONTINUE with everything that is code-side.
6. Confirm current APIs/config via Context7 before using any tool/library config. Never invent codebase facts; verify against the actual repo.

EXECUTION ORDER & SPECS
Execute each step exactly as specified in the plan document sections "PROMPT 0.0" … "PROMPT 4.1". Treat each section's TASK/IMPLEMENT/GATE as binding. Where a section says GATE, apply Autonomy Rule 2.

OUTPUT (continuous)
As you go, print a running log: "[STEP x.y] started → key decision → gate result (PASS/FAIL) → committed <hash>". At the very end, print a summary: steps completed, gates passed, Fail-Stops (if any), and the full contents of your-actions.md.

BEGIN NOW with step 0.0 and proceed automatically through 4.1.
```

---

## Phasen-Überblick

| Phase | Inhalt | Prompts | Reichweiten-Hebel |
|-------|--------|---------|-------------------|
| **0 — Foundation** | Rendering-Fix (SSG/Prerender), Crawler-Zugang, SEO-Infra, Core Web Vitals | 0.0 – 0.4 | Sichtbarkeit für Google **und** AI-Crawler |
| **1 — Content & Programmatic** | Location-Pages auf DWD-Daten, GEO-Explainer | 1.1 – 1.2 | Long-Tail + AI-Zitierbarkeit |
| **2 — Distribution** | Tool-Landingpages, Shareable Assets | 2.1 | Community-Seeding, Digital PR |
| **3 — Discover & Events** | RSS, Discover-Templates, Event-Workflow | 3.1 | Spiky Reichweite bei Wetterereignissen |
| **∞ — Measurement** | GSC/Bing/Logs/AI-Visibility | 4.1 | Steuerung |

**Fail-Stop-Prinzip:** Der einzige Grund anzuhalten ist ein fehlgeschlagenes Gate (z. B. Text steht nach 0.2 immer noch nicht im rohen HTML). Dann darf NICHT weitergebaut werden, weil sonst die gesamte Content-Arbeit auf einem kaputten Fundament steht.

---

## PROMPT 0.0 — Workspace & Dokumentationssystem

```text
ROLE: senior technical-SEO + React/Vite engineer on buscosun.com.

TASK
Initialize the seven-file documentation system for the work package "seo-geo" under /docs/seo-geo/:
CLAUDE.md, context.md, architecture.md (scaffold), plan.md, checklist.md, prompt.md, tests.md.
Also create empty blockers.md and your-actions.md (used by the autonomous runner).

CONTEXT
- Documentation-only; do NOT touch app code.
- Record the non-negotiable principle in CLAUDE.md + context.md: "All SEO-relevant text (forecasts, explainers, meta, JSON-LD) MUST ship in pre-rendered raw HTML. The Three.js/WebGPU/MapLibre canvas stays a client-only, lazy-mounted enhancement."
- plan.md = the phased roadmap (0 rendering+infra, 1 content+programmatic, 2 distribution, 3 discover, ∞ measurement).

GATE (auto): all nine files exist and contain the stated content. On PASS: commit, continue to 0.1.
```

---

## PROMPT 0.1 — Diagnose Rendering/Indexierung (intern, kein Halt)

```text
ROLE: technical-SEO auditor for JS SPAs.

TASK
Diagnose the current rendering/indexability state. Read-only — no app code changes.

DIAGNOSE & REPORT (into architecture.md):
1. Rendering mode: is index.html an empty <div id="root">? Use Chrome DevTools MCP to compare raw HTML response vs fully rendered DOM; list which content (H1, forecast text, meta, JSON-LD) exists ONLY after JS.
2. Routing: react-router config? real per-route URLs vs hash? unknown routes soft-200 vs 404?
3. Head: <title>/meta client-side (helmet) or static? present in raw HTML?
4. robots.txt + sitemap: exist? allow/block what? any AI bot blocked?
5. Structured data: JSON-LD present? raw HTML or client-injected?
6. Build tooling: exact Vite/React/react-router versions + deploy target (static CDN vs Node server vs which host) — this drives the prerender tool choice.

DECISION (auto, per Master defaults): pick the rendering approach (SSG via React Router v7 prerender > Vike > vite-react-ssg; SSR/ISR only if per-request freshness is mandatory). Write approach + rationale into architecture.md. Do NOT stop for approval — continue.

GATE (auto): architecture.md contains a concrete, version-verified approach + file list. On PASS: commit, continue to 0.2.
```

---

## PROMPT 0.2 — Pre-Rendering / SSG implementieren

```text
ROLE: Vite/React build engineer.

TASK
Implement the SSG/prerender approach from architecture.md so ALL SEO text, meta, JSON-LD ship in raw HTML for every indexable route. Keep Three.js/WebGPU/MapLibre as client-only, lazy-mounted (IntersectionObserver) components.

CONTEXT
- Guard all browser-only APIs (window, navigator.gpu, WebGL ctx) so the prerender build doesn't crash.
- Forecast freshness: scheduled rebuild / ISR-style regeneration tied to ICON-D2 cadence (every 3h, 00/06/09/12/15/18/21 UTC).

INTERNAL DIAGNOSE: confirm exact config via Context7, list files to create/modify and which components need client-only guards. Then implement directly (no approval pause).

GATE (HARD / Fail-Stop): for 3 routes (home, a location placeholder, an explainer placeholder), the raw HTML (curl, JS disabled) MUST contain the H1, a lead paragraph, meta tags, and JSON-LD. Add this as a permanent regression test in tests.md. On PASS: commit, continue to 0.3. On FAIL: Fail-Stop, write cause to blockers.md, halt.
```

---

## PROMPT 0.3 — SEO-Infrastruktur

```text
ROLE: technical-SEO engineer.

TASK (implement directly):
1. robots.txt: allow Googlebot, Bingbot, Google-Extended, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, CCBot; link sitemap. If CDN/WAF cannot be verified from code, append to your-actions.md and continue.
2. XML sitemap (index + children) auto-generated at build time; hreflang in sitemap for location pages.
3. Self-referencing canonical on every route.
4. Real 404 status for unknown locations.
5. Per-route title + meta description, OG (og:title, og:image, max-image-preview:large), Twitter Card — all in raw HTML.
6. JSON-LD components in raw HTML: Organization + WebSite on home; reusable Dataset, FAQPage, Article/NewsArticle for later phases.

hreflang default: single "de" + "x-default". Validate JSON-LD vs schema.org and hreflang reciprocity.

GATE (auto): curl proves robots served, sitemap valid XML, sample 404 = HTTP 404, JSON-LD valid in raw HTML on home. Append "submit sitemap to GSC + Bing" to your-actions.md. On PASS: commit, continue to 0.4.
```

---

## PROMPT 0.4 — Core Web Vitals

```text
ROLE: performance engineer for a heavy 3D/WebGPU + map app.

TASK
Hit mobile CWV: LCP < 2.5s, INP < 200ms, CLS < 0.1 (p75) — without removing the interactive experience.

INTERNAL DIAGNOSE: Chrome DevTools MCP + Lighthouse (mobile) to measure LCP/INP/CLS, identify LCP element, profile Three.js/WebGPU + MapLibre init. Then implement:
1. LCP element = real above-the-fold text/poster, NEVER the empty canvas. On mobile ship a static WebP poster; init WebGPU/Three.js only on interaction or larger viewports.
2. INP: heavy work to GPU compute (WebGPU instancedArray for wind particles); break long tasks; scheduler.yield()/useTransition; lazy-init renderer.
3. CLS: reserve canvas/map dimensions (width/height/aspect-ratio).
4. Loading: defer canvas + MapLibre via IntersectionObserver; dynamic-import Three.js/MapLibre; route code-splitting.

GATE (auto): Lighthouse mobile thresholds met on home + one location page (or gap documented in blockers.md with reason). LCP element confirmed text/poster, CLS ~0. On PASS: commit, continue to 1.1.
```

---

## PROMPT 1.1 — Programmatische Location-Pages (DWD, getiert)

```text
ROLE: programmatic-SEO engineer.

TASK (implement directly):
1. Municipality DB (id, name, slug, lat/lon, region, country, tier).
2. Rich location-page template on DWD ICON-D2 (CC BY 4.0; attribution "Datenbasis: Deutscher Wetterdienst"): H1 "Wetter {Ort}", 40–60-word direct-answer lead, forecast table, plus the differentiators (per-location Föhn likelihood, Alpine fog-ceiling, model-confidence band, "best day" output, short reviewed local narrative), FAQ block (FAQPage JSON-LD), Dataset JSON-LD.
3. Hub-and-spoke internal linking: region → municipalities; municipality → nearby places + regional radar + relevant explainers.
4. Build pipeline pre-renders ONLY Tier 1 (largest cities + Alpine/tourism). noindex incomplete pages.

URL scheme default: /wetter/{id}-{slug}, /regenradar/{region}, /wetter/{slug}/16-tage, /wetter/{slug}/stuendlich.

GATE (auto): Tier 1 builds; raw-HTML proof for 2 sample locations (text + JSON-LD without JS); no thin/empty pages indexed. Append "confirm Tier-1 indexing in GSC before expanding tiers" to your-actions.md. On PASS: commit, continue to 1.2.
```

---

## PROMPT 1.2 — GEO-Explainer (AI-Zitierbarkeit)

```text
ROLE: content engineer + meteorology editor.

TASK
Topic cluster of 8–12 explainers; build 3 pilots fully, scaffold the rest.
Topics: Föhn, Temperaturinversion, Nebel/Hochnebel + Nebelobergrenze, Thermik, Schneefallgrenze, Gewitter/Unwetter, Biowetter + one page per unique tool.

Per explainer:
1. Standalone extractable answer in the first 40–60 words.
2. Descriptive H2/H3 + fragment anchors; high fact density; relevant statistics; cite authoritative sources (DWD etc.).
3. FAQPage + Article JSON-LD with author, datePublished, dateModified.
4. Internal links to/from location + tool pages.
5. Objective, declarative tone (no "I think/we believe").
(GEO basis: quotations ~+41%, statistics ~+32%, citations ~+30% to AI-citation likelihood.)

RULES: accuracy paramount (YMYL-adjacent); never imply official DWD warnings; attribute per CC BY 4.0.

GATE (auto): 3 pilots built; raw-HTML + schema validation pass. Append "baseline AI-citation manually in ChatGPT/Perplexity/Gemini" to your-actions.md. On PASS: commit, continue to 2.1.
```

---

## PROMPT 2.1 — Tool-Landingpages & Shareable Assets

```text
ROLE: frontend engineer.

TASK (build 2 fully, scaffold the rest):
Indexable, screenshot-rich landing pages for each unique tool (3D wind globe, wind-particle layer, Föhn-prediction map, Alpine fog-ceiling viz, "best day" planner, model-confidence comparison, climate explorer, browser-local LLM meteorologist).
- Clear value prop + the data behind it (DWD attribution); strong above-the-fold static hero image (live canvas as enhancement); direct link into the live tool.
- OG/Twitter cards with large preview images (max-image-preview:large) for compelling forum/social embeds.
- Article/SoftwareApplication JSON-LD; pitch text in raw HTML; CWV rules apply.

GATE (auto): 2 pages built + OG-preview verified. Produce /docs/seo-geo/seeding-kit.md (per community: angle + which tool fits) and append "post tools manually in Wetterzentrale-Forum, Gleitschirm/Drachen-Forum, astronomie.de, Gartenforen" to your-actions.md. On PASS: commit, continue to 3.1.
```

---

## PROMPT 3.1 — RSS, Discover-Templates, Event-Workflow

```text
ROLE: Discover/News readiness engineer.

TASK (implement directly):
1. RSS/Atom feed (auto-generated; NOT blocked in robots).
2. Event-article template (URL /wetterlage/{slug}): large hero image (>=1200px), NewsArticle JSON-LD with visible datePublished/dateModified, accurate non-clickbait headline, separately optimized og:title, links to relevant location pages + explainers.
3. News sitemap for fast event indexing.
4. Reusable "event content" checklist (timeliness, image, timestamp, internal links) in checklist.md.

RULES: accurate, never imply official warnings; all article text in raw HTML.

GATE (auto): feed + 1 sample event article built; valid NewsArticle JSON-LD; compliant hero image; RSS + news sitemap valid. Append "submit RSS/news sitemap; monitor Discover in GSC" to your-actions.md. On PASS: commit, continue to 4.1.
```

---

## PROMPT 4.1 — Measurement & Monitoring

```text
ROLE: measurement engineer (solo operator).

TASK (implement directly):
1. Document where to read GSC (Indexing, Performance, Discover, International Targeting) + Bing WMT; append verification steps to your-actions.md.
2. Server-log parser/script confirming AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Claude-SearchBot) fetch 200s with real content.
3. Analytics segment for AI referrals (chatgpt.com, perplexity.ai, gemini).
4. Manual AI-visibility baseline: 20–30 German prompts ("Wetter {Ort}", "Föhn Vorhersage", "Regenradar {Region}", "Astrowetter {Ort}", "Nebelobergrenze {Region}"), monthly log. Save prompt list + empty log table to /docs/seo-geo/. (Optional paid: Otterly.AI ~$29/mo, Peec AI ~€89/mo.)

GATE (auto / final): monitoring runbook + baseline prompt list saved. On PASS: commit. Then print the final summary (steps completed, gates, any Fail-Stops, full your-actions.md).
```

---

## YOUR-ACTION-Items (sammelt der Runner in your-actions.md — er wartet NICHT darauf)

1. GSC + Bing Webmaster Tools verifizieren, Sitemaps einreichen.
2. CDN/WAF prüfen: keine Firewall-Regel blockt AI-Bots netzwerkseitig.
3. Community-Seeding (Phase 2): Tools transparent/nicht-werblich posten — Subreddit-Aktivität vorher prüfen.
4. Digital-PR-Pitches rund um Wetterereignisse.
5. Monatliches Review der AI-Visibility-Prompts + GSC/Bing.

## Warum trotz Autonomie zwei harte Gates bleiben
- **Nach 0.2** (Text im rohen HTML) und implizit überall, wo Verifikation scheitert: Fail-Stop statt Weiterbauen. Ohne diese Bremse würde der Runner bei kaputtem Rendering munter Content (Phase 1+) erzeugen, der für AI-Crawler unsichtbar bleibt — also stundenlange Arbeit auf einem toten Fundament. Das ist kein Warten auf deine Zustimmung, sondern Schutz vor Folgeschaden.
