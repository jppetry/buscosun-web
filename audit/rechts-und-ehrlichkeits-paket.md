# audit/rechts-und-ehrlichkeits-paket.md — Diagnose & Spec (Phase R1)

> Stand: 2026-08-01. Auftrag von Jan: die vier höchstpriorisierten Pakete aus `masterplan.md` umsetzen.
> Diagnose-Grundlage: `audit/strategie-2026-07-31/*.md` (bereits belegt) + die hier ergänzten Live-Prüfungen.
> **Entscheidungen von Jan (2026-08-01):** kanonische Domain = **buscosun.com** (O-03) · **V-101 (404) wird mit V-01 gebündelt**, weil beide dieselbe Datei anfassen.

## 0. Umfang

| Paket | V-Einträge | Kern |
|---|---|---|
| **A · Ehrlichkeit** | V-17, V-18, V-23 | Warn-Schweigen AT/CH benennen · erfundene Kennzahl entfernen · falsche Produktversprechen korrigieren |
| **B · Recht & Lizenz** | V-102, V-105, V-103 | Schriften selbst hosten · Karten-Attribution · Impressum/Datenschutz/Kontakt |
| **C · Transport** | V-01, V-101 | Drei fehlende Prod-Proxys · echte 404 |
| **D · Domain (Teilmenge V-100)** | V-02/V-100 | `SITE.url`, `robots.txt`, `llms.txt` auf `.com` |

**Ausdrücklich außerhalb:** OG-PNG-Neuerzeugung, `icsExport.ts`-UID-Domain, SW-Cache-Bump, Search-Console-Umzug (Rest von V-100, braucht Jans Konten) · Edge-Function-Härtung (V-83) · Warm-Cron (V-79 ff.) · Fusion · Shader.

## 1. Live-Verifikation der amtlichen Warn-Quellen (neu, für V-17)

Eine tote Verlinkung im Warn-Kontext wäre schlimmer als keine — deshalb vor der Umsetzung geprüft (WebFetch/WebSearch, 2026-08-01):

| Land | URL | Verifiziert | Titel / Betreiber |
|---|---|---|---|
| DE | `https://www.dwd.de/DE/wetter/warnungen/warnWetter_node.html` | ✅ | „Wetter und Klima – Deutscher Wetterdienst – Warnungen aktuell" |
| AT | `https://portale.geosphere.at/portallib/html/warninfo/warninfo_alle.php` | ✅ | GeoSphere Austria, Warnsystem; **Warnungen gelten nur für den Dauersiedlungsraum, Hochalpin ausgenommen** |
| CH | `https://www.naturgefahren.ch/` | ✅ | „Naturgefahrenportal" des Bundes, **betrieben von MeteoSchweiz** (mit BAFU/SLF/SED), Stand 20.11.2025 |

**Verworfen:** `https://warnungen.geosphere.at/` → `ENOTFOUND` (existiert nicht). Die AT-Einschränkung „Hochalpin ausgenommen" ist gate-relevant und muss im Hinweistext stehen (D-04).

## 2. Ist-Stand am Code (belegt)

### Paket A
- `PointForecastPanel.tsx:134-143` holt Warnungen für **jedes** Land ohne Länderprüfung; `dwdAlerts.ts` kennt nur DE. Render-Block `:246` hängt an `alerts.alerts.length > 0` → in AT/CH **still leer**.
- Muster für den Hinweis existiert bereits: `.pfc-optin` (`:310-317`, AT/CH-Pollen) — gleiche Fläche, gleiche Optik, kein neues CSS nötig.
- `SearchPage.tsx:550-552`: Donut mit `strokeDashoffset="34"` + Text `78%` / „Trefferquote 3 Tage" — aus keiner Messung.
- `SearchPage.tsx:539` „0–2 h Radar, 2–6 h ICON-D2" und `:81` „Regen 0–6 h" widersprechen **D-14** (radar-only, DE 2 h / AT 3 h / CH 0,5 h).
- `SearchPage.tsx:85` „3D-Globus · Sample-Daten" — **falsch**, der Globus rendert Live-GFS (`globe/gfs.ts`, `/_gfs`-Rewrite). Gleiche Fehlerklasse, deshalb hier mitkorrigiert.
- `manifest.webmanifest:4` und `index.html:18` bewerben ein **„Arbeitsfenster"**, das im Code nicht existiert.

### Paket B
- `index.html:11-13` lädt 3 Familien / 13 Schnitte render-blockierend von `fonts.googleapis.com`; Dateien von `fonts.gstatic.com`. Lizenzen: alle drei **SIL OFL 1.1** → Selbst-Hosten ausdrücklich erlaubt.
- `designTokens.css:169-170` definiert bereits `--font-display` / `--font-mono` — der `@font-face`-Block gehört genau dorthin (Datei ist eager geladen).
- `attributionControl: false` in **5** Karten: `atmosphere/ThermalMap.tsx:60`, `globe/GlobeMap.tsx:144`, `HeroMapBackground.tsx:31`, `threed/TerrainMap.tsx:75`, `threed/ThreeDMap.tsx:52`. Korrekt gesetzt ist nur `radar/RadarMap.tsx:109` (`{ compact: true }`) — **das ist das Referenzmuster.**
- Kein Impressum / keine Datenschutzerklärung / kein Kontakt: Grep über `src/` + `scripts/` ohne Treffer. Einziger Kontakt: `mailto:` in `feedback/FeedbackPage.tsx:26-28`.
- **Auslöser für Informationspflichten (gemessen):** Geolocation (`nowcast/NowcastPage.tsx:86-92`), Notifications (`notifications/notificationTransport.ts:71`), **21 localStorage-Schlüssel** + dynamische Familie `buscosun.vsd.limit.<key>`, SW-Caches (`public/sw.js:16-20`), **~30 externe Origins**.

### Paket C
- `vite.config.ts:43-62` definiert `/_cscs`, `/_mf`, `/_ecmwf`; `netlify.toml` kennt nur `/_dwd_opendata` und `/_gfs` → **7 von 19 ingestierten Modellen sind in Prod tot** (AROME-FR, ARPEGE, IFS, AIFS, AIFS-ENS, ICON-CH1-EPS, ICON-CH2-EPS).
- `netlify.toml:46-49` liefert für **jeden** unbekannten Pfad `index.html` mit **HTTP 200**; die erzeugte `404.html` (`generate-seo.mjs:151`) wird nie ausgeliefert.
- **Neu verifiziert:** Der SPA-Catch-all ist nicht ersatzlos entfernbar wie im Strategie-Audit angenommen — `generate-seo.mjs:239` schreibt crawlbaren Inhalt in `dist/index.html`, und die App routet zwar hash-only, aber `/` **muss** weiterhin `index.html` liefern. Da Netlify statische Dateien ohnehin vor den Redirects ausliefert, genügt es, den Catch-all von `200 → /index.html` auf `404 → /404.html` umzustellen: `/` trifft weiterhin die reale Datei `dist/index.html`, unbekannte Pfade bekommen echte 404.

## 3. Erhalt-Kontrakt (Funktionserhalt, Oberste Direktive)

Nichts in diesem Paket entfernt Funktionalität. Zu prüfen im Gate:

1. Punkt-Vorhersage: DE zeigt Warnungen **unverändert**; AT/CH bekommen **zusätzlich** einen Hinweis (rein additiv).
2. Startseite: alle 9 Kacheln, 10 Palette-Einträge, Filter-Chips, Footer-Links unverändert vorhanden — **nur Texte** ändern sich; die Vorhersage-Kachel bleibt inklusive Donut-Grafik erhalten.
3. Schriftbild identisch (gleiche Familien, gleiche Schnitte) — visueller Diff Desktop + Mobil.
4. Karten: Attribution wird **eingeblendet**, keine Karte verliert Bedienelemente. Desktop-Pixel-Diff nur an der Attributionszeile.
5. Bestehende `#m=`/`#h=`/`#atm=`-Permalinks funktionieren unverändert (Domainwechsel betrifft nur Canonicals, nicht die Hash-Payloads).
6. `/_dwd_opendata`, `/_dwd_wind`, `/_dwd_grib`, `/_gfs` bleiben unberührt; die drei neuen Rewrites sind rein additiv und stehen **vor** dem Catch-all.

## 4. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Font-Subsetting entfernt Glyphen (ä/ö/ü/ß, `·`, `→`, `°`) | **Kein Subsetting** — die vollständigen `latin`+`latin-ext`-WOFF2 von Google übernehmen, unverändert |
| `/_cscs` nutzt S3-v2-Signatur über Host+Pfad+Query | Netlify-Rewrite reicht Query 1:1 durch (`:splat` + Query-Erhalt); **an einem Preview-Deploy zu verifizieren, bevor V-01 als erledigt gilt** |
| 404-Umstellung bricht eine statische Seite | Netlify liefert existierende Dateien vor Redirects; Gate prüft `/`, `/wetter/muenchen/`, `/sitemap.xml`, `/gibtsnicht` einzeln |
| Impressum mit erfundenen Daten wäre wertlos und schädlich | **Personendaten werden nicht erfunden.** Die Seite trägt klar markierte Platzhalter, die nur Jan füllen kann; Liste in §6 |
| Datenschutzerklärung ist keine Rechtsberatung | Text beschreibt **ausschließlich technisch verifizierte Sachverhalte**; juristische Prüfung bleibt Jans Aufgabe, Hinweis steht im Dokument |

## 5. Verifikationsplan (Gate GR1)

- `npm run typecheck` grün · `npm run build` grün · `npm run verify:seo` grün
- Netzwerk-Wasserfall der Startseite: **0 Requests an `fonts.googleapis.com` / `fonts.gstatic.com`**
- `curl -sI` auf `/`, `/wetter/muenchen/`, `/sitemap.xml` → 200 · auf `/gibtsnicht` → **404**
- Grep über `dist/`: **0 Treffer** für die Nicht-Zieldomain in Canonicals/Sitemap/robots/llms
- Punkt-Vorhersage in AT und CH zeigt den Warnhinweis, in DE unverändert die Warnungen
- Attribution sichtbar in allen 5 zuvor stummen Karten
- Desktop-Screenshot-Diff der Startseite: nur die geänderten Textstellen

## 6. 🔴 Was nur Jan liefern kann (Impressum)

Die Seite ist gebaut und vollständig — es fehlen ausschließlich die Angaben, die niemand außer dem Betreiber kennen kann. Sie sind in `scripts/seo/legal.mjs` als `TODO_JAN`-Konstanten an **einer** Stelle gebündelt:

1. Vollständiger Name (bzw. Firma + Rechtsform)
2. Ladungsfähige Anschrift (Postfach genügt **nicht**)
3. Kontakt: E-Mail (vorhanden: `contact@buscosun.com`) + optional Telefon
4. Bei journalistisch-redaktionellen Inhalten (`/wetterlage/`): inhaltlich Verantwortlicher nach § 18 Abs. 2 MStV
5. Falls einschlägig: USt-IdNr., Registereintrag, Aufsichtsbehörde
6. Bestätigung, ob die BFSG-Kleinstunternehmer-Ausnahme greift (beeinflusst die Barrierefreiheits-Erklärung, V-78)

**Bis diese Angaben eingetragen sind, darf `/impressum/` nicht als erledigt gelten** — die Seite ist dann zwar live und technisch korrekt verlinkt, aber inhaltlich unvollständig.
