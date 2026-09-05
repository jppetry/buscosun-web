# VERIFY — Prüfungen je Etappe mit Bestanden-Kriterien

> Stand: 2026-09-04 · Stufe 1 (Verifikationsplan) · erzeugt aus der Code-Inventur (drei parallele Lesungen von `src/`, `scripts/`, `public/`) und Live-Messungen gegen https://buscosun.com. Kein Code geändert, kein Commit.

Alle Prüfungen laufen ohne Rückfrage (Memory „Prüfläufe ohne Rückfrage"), über PowerShell im Repo.
`PREVIEW` = Netlify-Deploy-Preview-URL des Branches (aus `git push`-Ausgabe/Netlify-Kommentar; Fallback:
lokaler `dist/`-Server `npx serve dist` mit `netlify.toml`-Emulation **nur** für Roh-HTML-Checks —
Redirect-/Header-Checks brauchen den Preview).

| ID | Prüfung | Werkzeug | Bestanden wenn |
|---|---|---|---|
| V-0 | Typen/Build | `npm run typecheck`, `npm run build` | Exit 0; Build enthält `verify:seo` + `verify:routing` |
| V-1 | Budget | `npm run budget` | keine rote Ratsche (totalJs ≤ 1 109,8 KB; RouteSeoBlock/Link-Refactor +≤ 3 KB) |
| V-2 | Roh-HTML je Sitemap-URL | Skript `scripts/seo/verify-live.mjs` (neu, E0): holt Sitemap vom PREVIEW, je URL `curl -A Googlebot` | 200, `<title>` ≠ Eltern, Self-Canonical, keine `hreflang`, ≥ 1 H1, JSON-LD parsebar, `og:image` PNG existiert (HEAD 200) |
| V-3 | Ebene B | dasselbe Skript | `/_dwd_opendata/`, `/_gfs/`, `/assets/index-*.js`, `/latest-grib.json`: `X-Robots-Tag` enthält `noindex`; `robots.txt` enthält alle Disallows aus E1; `/assets/*.js` mit UA Googlebot → 200 |
| V-4 | Headers | curl -I | `/assets/*` `immutable`; Manifest `application/manifest+json`; HTML `max-age=0` unverändert |
| V-5 | 404/301 | curl | `/nope` 404; Aliase 301; `/wetterkarte/` 301 → ohne Slash; Cross-Alias `/wetterkarte/warnungen` 301 |
| V-6 | Gerenderter DOM | Playwright (390×844 mobil + 1440×900) je App-Route + je 3 Sub-Routen | genau 1 `h1`, ≥ 120 Wörter `innerText`, ≥ 8 interne `<a href>`, Canonical == Roh-Canonical, Konsole ohne `error`, keine Long Task > 200 ms **aus dem SEO-Block** (Vergleich mit Kontrolllauf ohne Block; Karten-Long-Tasks sind Bestand) |
| V-7 | Desktop-Regression | Playwright-Screenshots Karte 1440×900 vor/nach je Route, Diff oberhalb des SEO-Blocks | Pixel-Diff 0 im Kartenbereich; Diff-PNG-Pfade im RUN-LOG |
| V-8 | Touch-Targets | Playwright: Bounding-Boxes aller Links/Buttons im SEO-Block mobil | ≥ 44×44 px |
| V-9 | Sitemap | XML-Parse | valide; `lastmod` nicht für alle gleich; kein `noindex`-Ziel enthalten; alle URLs V-2-grün |
| V-10 | Funktionserhalt | `npm run verify:routing`, `verify:fire-detail`, `verify:layer-matrix`, `verify:event-zone`, `verify:route-3d` | Zählstände wie vor der Etappe (im RUN-LOG notiert) |
| V-11 | Content-Qualität | `verify-seo.mjs` erweitert | `full`-Explainer ≥ 450 Wörter, Tools ≥ 400, `/fuer/*` ≥ 500 mit Negativ-Abschnitt, Glossar ≥ 60 Einträge, Orts-Descriptions paarweise verschieden, kein „CC BY" neben „DWD", kein „Tornado", „bestätigt" nur mit „EFFIS/EMS/amtlich" im selben Satz |
| V-12 | JSON-LD-Graph | Verifier | jeder `@id` genau einmal definiert, alle Referenzen auflösbar |
| V-13 | GEO-Dateien | Verifier | `llms.txt`/`llms-full.txt` UTF-8, alle Links 200 auf PREVIEW, Zahl der Orte == `PLACES.length` |
| V-14 | CWV (informativ) | Lighthouse mobil via Chrome-DevTools-MCP (wenn verfügbar) oder Playwright-Metriken | Home/Ort/Explainer: LCP < 2,5 s, CLS < 0,1; App-Routen: CLS < 0,1; Abweichungen im RUN-LOG |
| V-15 | Negativ-Kontrolle des Gates | H1 aus einer Shell entfernen → `npm run build` | bricht ab (Exit ≠ 0); danach zurücknehmen |

Je Etappe Pflicht: V-0, V-1, V-10 + die etappenspezifischen (E1: V-2–V-5, V-9; E2: V-6–V-8; E3/E4/E5/E6/E8:
V-2, V-11, V-12; E7: V-2, V-5, V-6; E9: V-13; E10: alle + V-14/V-15).

---
