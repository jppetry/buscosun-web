# SEO-AUDIT — Ist-Zustand buscosun.com mit Messwerten

> Stand: 2026-09-04 · Stufe 1 (Audit) · erzeugt aus der Code-Inventur (drei parallele Lesungen von `src/`, `scripts/`, `public/`) und Live-Messungen gegen https://buscosun.com. Kein Code geändert, kein Commit.

Alle Werte per `curl` (UA Googlebot) bzw. Playwright (Viewport 390×844, Chrome Desktop-CPU) gegen
`https://buscosun.com`. Lighthouse konnte nicht laufen (Chrome-DevTools-MCP: „browser already running"
auf dem Profil) → in VERIFY als Preview-Pflichtprüfung; Referenzwerte aus `docs/seo-geo/blockers.md`
(Home LCP 257 ms, Ort LCP 938 ms, CLS 0,00, Lighthouse SEO/BP 100 — Stand Juni).

## 1. Indexstatus
- `site:buscosun.com` über die verfügbare Suche: **0 Treffer** (US-Index, nicht belastbar). GSC-Zugang fehlt →
  MANUELLE-SCHRITTE. Annahme für den Plan: Site ist jung/kaum indexiert; Fokus auf sauberes Fundament.

## 2. HTTP / Auslieferung

| URL | Status | Befund |
|---|---|---|
| `/`, 12 App-Routen | 200 | Route-Shells mit eigenem Title/Canonical/OG/JSON-LD (WebSite, WebPage, BreadcrumbList) |
| `/wetterkarte/temperatur` (und alle 25 Sub-Routen) | 200 | **Roh-HTML = Eltern-Shell**: `<title>Interaktive Wetterkarte DACH</title>`, `canonical=/wetterkarte`. Der Client setzt später Title/Canonical der Sub-Route (`RouteMeta.tsx:34-43`). Widersprüchliche Signale → Google nimmt i. d. R. das Roh-Canonical. **25 Sitemap-URLs faktisch auf 3 Elternseiten gefaltet.** |
| `/wetter/muenchen/`, `/wissen/foehn/`, `/funktionen/…`, `/lizenzen/` | 200 | Statisch, self-canonical, JSON-LD vollständig (Place, Dataset, FAQPage, BreadcrumbList, WebApplication / Article / SoftwareApplication) |
| `/karte`, `/wetterkarte/` | 301 | Aliase und End-Slash korrekt |
| `/nope-404`, `/assets/`, `/params/`, `/fire/`, `/countries/` | 404 | Echte 404, keine Verzeichnislisten (Netlify) |
| `/_dwd_opendata/`, `/_dwd_opendata/weather/` | **200 text/html** | **Upstream-Verzeichnislisting von opendata.dwd.de** über buscosun.com |
| `/_meteoalarm/`, `/_gfs/`, `/_cscs/`, `/_mf/`, `/_ecmwf/` | **200** (53 KB HTML, 341 KB XML-Bucket-Listing, 214 B, 395 KB, 247 KB) | Offene Proxys; Bots können Fremd-Buckets über Netlify-Bandbreite crawlen; kein Disallow, kein X-Robots-Tag |
| `/_firms`, `/_dwd_wind`, `/_dwd_grib` | 404 ohne Parameter | Edge Functions antworten nur mit Parametern — unkritisch, aber ohne Disallow |
| `/latest-grib.json`, `/latest-wind.json` | 200 | Manifeste offen (nötig für Client), kein noindex |
| `/manifest.webmanifest` | 200 **application/octet-stream** | falscher MIME-Typ |
| `/sw.js`, `/_og-card.html` | 200 | `_og-card` per robots disallowed + noindex; OK |

Header (alle Antworten): `Cache-Control: public,max-age=0,must-revalidate` — **auch für gehashte
`/assets/*.js`** (Netlify-Default). Kein `X-Robots-Tag` irgendwo. Kein `_headers`, kein `[[headers]]`.

## 3. Roh-HTML (was ein Nicht-JS-Crawler sieht)

| Seite | Wörter im `#root` | H1 | Bewertung |
|---|---|---|---|
| `/` | 151 | „Wetter für Deutschland, Österreich & die Schweiz" | dünn; Links zu 8+8+8 Orten (Fallback) |
| `/wetterkarte` | 439 | ja | Layer-Liste mit **19 identischen Beschreibungs-Sätzen** („<X> für Deutschland, Österreich und die Schweiz auf der interaktiven buscosun-Wetterkarte — amtliche Quellen, höhenkorrigiert, ohne Tracker") |
| `/regenradar` | 80 | ja | sehr dünn |
| `/tourenplanung` | 98 | ja | dünn |
| `/waldbrand` | 143 | ja | dünn, Meta nennt zurückgezogene Layer |
| `/atmosphaere` | 137 | ja | dünn |
| `/wetter/innsbruck/` | ~520 | ja | gut: Lead, 5 Fakten, 4 FAQ, Nachbarn, Wissen-Links; Description-Muster **138× wortgleich** |
| `/wissen/foehn/` | 718 | ja | gut |
| `/funktionen/tourenplanung/` | 254 Roh (Stub ~21 Wörter Inhalt) | ja | noindex-Gerüst |

## 4. Gerenderter DOM (was Googlebot nach JS sieht) — gemessen `/wetterkarte/temperatur`, mobil

| Kennzahl | Wert |
|---|---|
| H1 | **0** |
| H2 | **0** |
| Wörter (`innerText`) | **35** (Temperaturlabels + UI-Chips) |
| `<a href>` intern | **0** (Rail und Dock sind `<button>`; `featureRail.tsx:153,168`) |
| URL nach Mount | `?lat=49.4913&lon=11.5&z=4.41` (replaceState; Canonical bleibt sauber — korrekt) |
| Title/Canonical nach Mount | „Temperaturkarte DACH", `/wetterkarte/temperatur` (Client) — **widerspricht Roh-HTML** |

Konsequenz: Der vorgerenderte `#root`-Inhalt wird beim Mount ersetzt. Für den gerenderten Index sind alle
App-Routen inhaltsleer und ohne ausgehende Links. Die 190 statischen Seiten sind **Orphans** bezogen auf
den gerenderten Graphen (Startseite gerendert verlinkt nur `/impressum/ /datenschutz/ /lizenzen/`).

## 5. Meta, Canonical, hreflang, strukturierte Daten
- Titles/Descriptions je Route vorhanden, Marke als Suffix; Sub-Routen im Roh-HTML falsch (s. o.).
- hreflang `de-DE/de-AT/de-CH/x-default` auf **jeder** Seite, alle auf dieselbe URL → No-Op/Rauschen
  (Vorbefund V-SEO-10 unverändert).
- JSON-LD: 19 Typen, kein `@id`-Graph (Insel-Objekte), `Dataset.license` DE → DWD-Copyright-URL (2026-07-31:
  404 gemeldet), Etikett „DWD, CC BY 4.0" in 4 Footern (`content.mjs:350,491,648,850`) — **DWD-Open-Data
  steht unter GeoNutzV**. `HowTo`/`DefinedTerm`/`speakable` nicht verwendet.
- OG: 14 PNGs, Raster erzwungen; Route-Shells nur `wetterkarte`/`atmosphaere` mit eigenem Bild.

## 6. Sitemap / Feeds / robots / llms
- `sitemap.xml` 189 URLs, `lastmod` = Build-Datum für **alle** (Warm-Crons committen → Rebuild → alle URLs
  „geändert"), `changefreq daily` überall.
- `sitemap-news.xml` leer (171 B), `feed.xml` 4 Items (Artikel von 2026-06-26).
- `robots.txt`: alles erlaubt außer `/_og-card.html`; 12 KI-Crawler explizit erlaubt. **Kein Disallow für
  Proxys/Assets/Daten** → Ebene B nicht umgesetzt.
- `llms.txt` 37 Zeilen, gut strukturiert; verlinkt Go/No-Go auf nicht-kanonische Query-URL; nennt „~140 Orte"
  (138); verlinkt keine Explainer; kein Zitierhinweis; kein `llms-full.txt`.

## 7. Interne Verlinkung (Code-Grep)
- App → statische Seiten: nur `/lizenzen/` (ModelLibraryOverlay, SearchPage) und `/wetter/` (404-Seite).
- Statisch → App: Deep-Links vorhanden (`/wetterkarte/temperatur?ort=…`), statisch ↔ statisch gut (Nachbarn,
  Explainer, Hubs, Breadcrumbs).

## 8. Core Web Vitals mobil (Playwright, kein Lighthouse — s. o.)

| Seite | TTFB | DOM interactive | Load | CLS | Long Tasks (Summe) | Transfer |
|---|---|---|---|---|---|---|
| `/` kalt (SW deregistriert) | 659 ms | 687 ms | 1 266 ms | **0,025** | 318 ms (max 98) | 457 KB (JS 428) |
| `/` warm (SW-Cache) | 1 008 ms | 1 100 ms | 2 846 ms | **0,168** | 869 ms (max **434**) | 0 (Cache) |
| `/wetterkarte/temperatur` | 637 ms | 666 ms | 1 166 ms | 0,012 | **3 365 ms (max 2 772)** | 151 KB jsDelivr + Cache |

Befunde: LCP-Element ist Text (gut). CLS-Ausreißer 0,168 auf Home im Warm-Fall (Hero/Kacheln) — zu
verifizieren mit Lighthouse. Auf der Karte ein 2,8-s-Long-Task (GRIB-Dekodierung/Erstbild; WebGL-Pfad =
STOPP & FRAGEN, **nicht Teil dieses Plans**, aber für INP relevant). Bundle: maplibre 1 030 KB,
index 317 KB, FireRoute 292 KB (Ratsche 1 109,8 KB gzip gesamt, grün).

## 9. Verhalten ohne JavaScript
Roh-HTML trägt H1 + Lead + Layer-Liste; Karte/Canvas fehlt (erwartet). Statische Seiten vollständig ohne JS.

## 10. Vorherige Maßnahmen — Status

| V-SEO | Status |
|---|---|
| 01 Domain-Kanonik | erledigt (.com überall) |
| 02 echte 404 | erledigt |
| 03 Fonts selbst gehostet | erledigt |
| 04 Impressum/Datenschutz/Kontakt | erledigt (Impressum-Platzhalter: Build warnt — prüfen) |
| 05 `/lizenzen/` | erledigt |
| 06/07/08/09 Karten-Attribution, Esri, Lizenz-Etiketten, Nominatim | teils (Esri in RadarMap? zu prüfen; DWD-Etikett offen) |
| 10 interne Verlinkung, hreflang | **offen** |
| 11 GEO-Ausbau G1–G5 | **offen** |
| 12 `/ohne-tracker` | offen (nicht in dist) |
| 13 `verify:seo` im Build | **offen** (`build` ruft es nicht) |
| 14 Scaffolds | offen (7 + 7 Stubs) |

---
