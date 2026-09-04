# RUN-LOG — SEO/GEO-Lauf 2026 (Branch `seo-geo-2026`)

Protokoll des autonomen Laufs nach Jans Freigabe vom 2026-09-05. Je Etappe: Ziel, Ergebnis, Messwerte,
Zeitstempel (Europe/Berlin), Entscheidungen, die im Plan nicht standen. Prüfungen nach `VERIFY.md`.

## Rahmen

- **Arbeitsweise:** eigener Git-Worktree `C:\dev\buscosun-web-seo` auf Branch `seo-geo-2026` (abgezweigt von
  `main` @ `a6174e0`, BW-13). Grund: im Hauptarbeitsverzeichnis laufen parallel andere Linien mit
  uncommitted Änderungen (`src/fire/*`, Brandradar-Detail); ein Branch-Wechsel dort hätte deren Zustand
  verschoben. `node_modules` ist per Junction geteilt.
- **Jans Antworten (2026-09-05):** Deploy-Previews entstehen automatisch je Pull Request (Base `main`);
  `buscosun.app` ist vermutlich nicht registriert und nicht relevant → keine Migrationsschritte, nur
  Nennung tilgen; Repo ist **nicht** öffentlich → `/ohne-tracker/` ohne „Quelltext offen"-Aussage, kein
  Wikidata-Repo-Link; Impressum-Platzhalter füllt Jan am Ende → Build-Warnung bleibt sichtbar, `/ueber/`
  nennt keinen Betreiber; `/wetterlage/` läuft weiter → neuer Saisonbericht (Waldbrandsaison 2026) als
  Artikel; Stufe 2 freigegeben.
- **Werkzeuge:** `gh` fehlt, Netlify-CLI nicht eingeloggt → PR-Erstellung über die GitHub-API mit den
  gespeicherten Git-Credentials (Versuch), sonst manueller Schritt; Lighthouse nur, wenn der
  Chrome-DevTools-MCP startet, sonst Playwright-Metriken.

## Etappen

| Etappe | Start | Ende | Ergebnis | Commit |
|---|---|---|---|---|
| E0 Fundament | 2026-09-05 00:45 | 2026-09-05 01:20 | grün | d39f854 |
| E1 Kanonik & Ebene B | 2026-09-05 01:25 | 2026-09-05 03:05 | grün (lokal); Preview-Belege in E2 | (s. u.) |

## E0 · Fundament — 2026-09-05

**Getan:** Worktree + Branch; die sechs Planungsdokumente, `RUN-LOG.md`, `MANUELLE-SCHRITTE.md` ins Repo;
`build` ruft jetzt `verify-seo.mjs` und `verify-routing.mjs` (SEO-Gate im Build, V-SEO-13); CI-Schritt
„Routing-Gate"; Metatexte in `src/router/routes.ts` ohne zurückgezogene Layer (Waldbrand) und mit
ehrlichem Erstbild-Hinweis (Wetterkarte); `llms.txt` 138 Orte; Alt-Doku `docs/seo-geo/*` auf `.com`;
SEO-PLAN um Jans Entscheidungen und V-SEO-15…23 ergänzt.

**Messwerte:** typecheck grün · build grün (Generator: 138 Geo, 10 Explainer (3 idx), 10 Tools (3 idx),
1 Wetterlage, 13 Route-Shells, Sitemap 189 URLs) · verify:seo grün · verify:routing 105/105 · budget grün
(größter Chunk maplibre 278,4 KB gzip, eager JS 317,8 KB roh) · **Negativ-Kontrolle V-15:** H1 aus
`dist/index.html` entfernt ⇒ `verify-seo.mjs` Exit 1; wiederhergestellt ⇒ Exit 0.

**Entscheidung außerhalb des Plans:** Worktree statt Branch-Wechsel im Hauptverzeichnis (parallele Linien).

## E1 · Kanonik & Ebene B — 2026-09-05

**Getan:**
- `src/map/layerCatalog.ts` (Dock-Label/Tooltip, Reihenfolge) — MapView leitet `LAYER_OPTIONS` daraus ab
  (Diff MapView: +7/−21 Zeilen, Tooltips wortgleich, Verifier prüft den Warn-Tooltip).
- `src/seo/layerSeoTexts.ts` (19 Layer × H1/Lead ≥ 60 Wörter/2 Absätze/5 Fakten/Explainer) und
  `src/seo/subRouteTexts.ts` (+3 Atmosphäre-Linsen, +3 Brand-Sichten) — **außerhalb des Start-Bundles**.
- `src/router/routes.ts`: `CONTENT_UPDATED`, `updated` je Route, `sitemapPaths()` mit lastmod,
  `indexableSubRoutes()` (24 = 18 Layer + 3 + 3; `/wetterkarte/warnungen` bleibt Cross-Alias),
  Waldbrand-Descriptions ≤ 160 Zeichen; `urlState.ts`: `LAYER_SLUG_DESCRIPTION` (24 eindeutige Descriptions).
- Generator: 24 flache Sub-Shells `dist/<route>--<slug>.html` mit eigenem Title/Description/Canonical/OG/
  JSON-LD (WebPage + BreadcrumbList 3-stufig), Katalogtext + Fakten + Geschwister-Links + Hub-Links im
  `#root`; Sitemap-lastmod aus Inhalt (5 verschiedene Daten statt 1), kein `changefreq`; hreflang komplett
  entfernt (auch Hub `/wetter/`).
- `netlify.toml`: 24 Sub-Routen-Regeln vor den Wildcards; `[[headers]]`: `/assets/*` immutable + noindex,
  Manifest-MIME, `/fonts/*` immutable, 10 Datenpfade noindex. `robots.txt`: EINE UA-Gruppe (die alten
  UA-Einzelblöcke hätten die Disallows für Googlebot & Co. aufgehoben), Disallow für 6 Proxys, 3 Edge
  Functions, 8 Datenpfade; `/assets/` bewusst offen (Z1).
- Verifier: `verify-routing` +21 Checks (Katalog, Sub-Texte, Sub-Regeln, robots, Header, Sub-Shells),
  `verify-seo` +~200 Checks (24 Shells, Sitemap).

**Messwerte:** typecheck grün · build grün · verify-seo 383/383 · verify-routing 139/139 · budget grün
(eager roh 320,4 KB nach 317,8 KB; **Zwischenstand mit Texten im Start-Bundle: eagerJs 120,5 KB gzip > 107,9
Ratsche ⇒ Texte in lazy Modul verschoben**, Ratsche unverändert) · Sub-Shell `wetterkarte--temperatur`:
316 Wörter im `#root`, eigener Canonical · Sitemap 189 URLs, lastmod 2026-06-09 ×139 / 06-26 ×6 / 08-01 ×4 /
08-14 ×1 / 09-05 ×39 · hreflang in dist: 0 Dateien · CI-Verifier lokal: datenalter 54/54, precip-source 30/30,
governor, thunder 13, lpi 6, snow 20, rotation 30, warm-budget 30, health 20, model-source, event-zone,
official-sources alle grün; **verify:fire-detail 296/296**.

**Abweichung/Befund:** `verify:route-3d` meldet im Worktree 563/564 („im Grenzwert-Modus bleibt keine Ebene
ohne Schalter eingeschaltet"), im Hauptverzeichnis 564/564 bei identischer Datei: der Check sucht einen
LF-String (`mode === 'gonogo'
      // …`), der Worktree ist per autocrlf CRLF ausgecheckt. Kein Befund
gegen den Code; Verifier ist CRLF-empfindlich (V-SEO-24, s. SEO-PLAN). CI (Linux, LF) ist davon unberührt.
`verify-layer-matrix.mjs` ist ein Golden-Baseline-Werkzeug mit Argumenten, kein npm-Alias — nicht Teil des Gates.

**Entscheidungen außerhalb des Plans:** kein SW-Version-Bump (Cache-Control `immutable` ändert das SW-Verhalten
nicht — `ASSET_RE` ist ohnehin stale-while-revalidate); Header wirken nicht auf Proxy-Rewrites (Netlify), dort
schützt nur robots.txt (in netlify.toml dokumentiert); `sitemap-news.xml` bleibt (Jan schreibt einen Saisonbericht).
