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
| E0 Fundament | 2026-09-05 00:45 | 2026-09-05 01:20 | grün | (s. u.) |

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
