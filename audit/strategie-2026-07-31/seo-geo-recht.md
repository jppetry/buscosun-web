# SEO/GEO & Recht — Strategie-Deep-Dive (2026-07-31)

> **Hinweis: Dieses Dokument enthält KEINE Rechtsberatung.** Der Autor ist kein Anwalt.
> Alle rechtlichen Punkte in §6 und §7 sind ausdrücklich **Prüfaufträge und Risiko-Hinweise
> für Jan bzw. eine juristische Prüfung** — keine Feststellung von Rechtslage, Rechtmäßigkeit
> oder Haftung. Wo eine Lizenz nicht am Originaltext verifiziert werden konnte, steht
> ausdrücklich **„zu verifizieren"**.

---

## 1. Auftrag & Abgrenzung

**Rolle:** SEO/GEO & Recht (`agents.md` §2), Planungsphase 2026-07-31.
**Zuständig für:** `scripts/seo/`, `scripts/generate-seo.mjs`, `public/robots.txt`, `public/llms.txt`,
`docs/seo-geo/`, Lizenz-/Attributionslage aller externen Quellen, Datenschutz-/Rechts-Checkliste.

**Nicht zuständig (Verweis):**
- Security-Header/CSP → Infra-Agent (`improvements.md` V-07). Nur referenziert, nicht dupliziert.
- Netlify-Rewrites/Edge-Functions/Crons als Betriebsthema → Infra-Agent (V-01, V-03).
  Ich liefere hier ausschließlich die **SEO-kritische Hälfte** von O-03 (§3) und A6 (§4).
- Produkt-Positionierung → Produkt-Agent. §8 liefert nur den Baustein „Trackerfreiheit".

**Methodik:** Jede Repo-Aussage am Code verifiziert und mit `Datei:Zeile` belegt. Externe Lizenz-
aussagen mit Quelle **und Abrufdatum**. Alt-Doku (`docs/seo-geo/*`, `buscosun_seo_geo_*.md`) wurde
gelesen, aber nur als Historie behandelt (CLAUDE.md: Code > architecture/decisions > Alt-Doku).

**Grundlage:** D-02 (trackerfrei), D-03 (ohne Account), D-04 (Ehrlichkeit), D-05 (DACH),
D-18 (Open-Meteo opt-in), D-22 (SEO statisch + GEO), D-27 (Command-Deck), O-03, O-06.

---

## 2. SEO-Ist-Analyse (quantifiziert)

### 2.1 Was der Generator erzeugt

`scripts/generate-seo.mjs` läuft als dritter Schritt von `npm run build`
(`package.json:8`: `tsc -b && vite build && node scripts/generate-seo.mjs`) und schreibt nach `dist/`.

| Familie | Datenquelle | Erzeugte Seiten | davon indexierbar | Beleg |
|---|---|---|---|---|
| `/wetter/<slug>/` | `scripts/seo/places.mjs` | **138** (DE 58 · AT 40 · CH 40) | 138 | `generate-seo.mjs:34-39` |
| `/wetter/` Hub | — | 1 | 1 | `generate-seo.mjs:42-87` |
| `/wissen/<slug>/` | `scripts/seo/explainers.mjs` | **10** (3 `full`, 7 `stub`) | 3 | `generate-seo.mjs:91-96` |
| `/wissen/` Hub | — | 1 | 1 | `generate-seo.mjs:97-98` |
| `/funktionen/<slug>/` | `scripts/seo/tools.mjs` | **9** (2 `full`, 7 `stub`) | 2 | `generate-seo.mjs:102-107` |
| `/funktionen/` Hub | — | 1 | 1 | `generate-seo.mjs:108-109` |
| `/wetterlage/<slug>/` | `scripts/seo/events.mjs` | **1** (1 `full`) | 1 | `generate-seo.mjs:113-118` |
| `/wetterlage/` Hub | — | 1 | 1 | `generate-seo.mjs:119-120` |
| `404.html` | — | 1 | 0 (`noindex, follow`) | `generate-seo.mjs:124-151` |
| Home `index.html` | Injektion in `#root` | 1 | 1 | `generate-seo.mjs:234-240` |

**Summe: 164 HTML-Dateien, davon 149 indexierbar, 15 `noindex`** (7 Explainer-Scaffolds +
7 Tool-Scaffolds + 404). Die Zahl 149 stimmt exakt mit `sitemap.xml` überein
(`generate-seo.mjs:245`: `PLACES.length + 5 + fullExplainers + fullTools + fullEvents`).

Ortsslugs verifiziert per Node-Import: 138 Orte, Länderverteilung wie oben.
Explainer-Status: `foehn`, `temperaturinversion`, `nebel-hochnebel-nebelobergrenze` = `full`;
`thermik`, `schneefallgrenze`, `gewitter-unwetter`, `biowetter`, `hoehenkorrektur-lapse-rate`,
`modellvergleich-unsicherheit`, `windboeen-sturm` = `stub`.
Tools: `wetterkarte`, `atmosphaere` = `full`; die übrigen 7 = `stub`.

### 2.2 Weitere Artefakte

- **`sitemap.xml`** — 149 URLs, `lastmod` = Build-Datum, `changefreq: daily` **für alle** URLs
  (`generate-seo.mjs:167-168`). *Bewertung:* `changefreq`/`priority` werden von Google seit Jahren
  ignoriert; `lastmod` = Build-Datum ist für 138 statische Ortsseiten **irreführend** — jeder
  Warm-Cron-Commit (15-Min-Takt, `.github/workflows/warm-*.yml`) triggert einen Netlify-Rebuild und
  damit ein neues `lastmod` für alle 149 URLs, obwohl sich kein Inhalt geändert hat. Das ist ein
  aktives Negativ-Signal für das Crawl-Budget.
- **`feed.xml`** (RSS 2.0) — enthält `full`-Events + `full`-Explainer, aktuell **4 Items**
  (`generate-seo.mjs:175-207`).
- **`sitemap-news.xml`** — Google-News-Format, nur Artikel ≤ 2 Tage alt (`generate-seo.mjs:211-231`).
  Aktuell mit hoher Wahrscheinlichkeit **leer**, da nur ein Event existiert
  (`omega-lage-mitteleuropa`) und dessen `datePublished` älter als 2 Tage sein dürfte.
  Eine leere News-Sitemap ist unschädlich, aber signalisiert dem GSC dauerhaft „keine News".
- **`public/og/`** — 14 gebrandete 1200×630-PNGs; `DEFAULT_OG_IMAGE = '/og/home.png'`
  (`content.mjs:226`), Raster-Zwang begründet und im Verifier hart geprüft. **Sauber gelöst.**
- **`public/llms.txt`** — 27 Zeilen, Markdown-Struktur nach llms.txt-Konvention (§5).
- **`public/robots.txt`** — 46 Zeilen; `Allow: /` global, `Disallow: /_og-card.html`,
  explizite Allowlist für **12 KI-/Such-Crawler** (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
  Claude-Web, Claude-SearchBot, PerplexityBot, CCBot, Google-Extended, Applebot-Extended,
  Googlebot, Bingbot) + 2 Sitemap-Zeilen (`robots.txt:45-46`).

### 2.3 JSON-LD-Inventar

Neun Typen, alle in `scripts/seo/content.mjs` erzeugt:

| Typ | Wo | Beleg |
|---|---|---|
| `WebApplication` | Home + jede Ortsseite | `content.mjs:136-149`, `:277` |
| `Organization` | Home | `content.mjs:151-153` |
| `Place` | Ortsseite | `content.mjs:155-163` |
| `Dataset` | Ortsseite (inkl. `license`) | `content.mjs:167-187` |
| `BreadcrumbList` | Ort/Wissen/Funktionen/Wetterlage | `content.mjs:189-199`, `:408`, `:570`, `:716` |
| `FAQPage` | Ort, Explainer, Tool | `content.mjs:201-207` |
| `Article` | Explainer | `content.mjs:389-406` |
| `SoftwareApplication` | Tool-Seite | `content.mjs:552-568` |
| `NewsArticle` | Wetterlage-Artikel | `content.mjs:696-714` |
| `CollectionPage` | die drei Hubs | `content.mjs:499-503`, `:655-658`, `:796` |

*Bewertung:* Für ein Projekt ohne CMS ist das **überdurchschnittlich vollständig**. Zwei Mängel:

1. **Kein `@id`-Graph.** Jedes Objekt ist ein Insel-JSON-LD ohne `@id`/`isPartOf`. Suchmaschinen
   und LLMs können `Organization`, `WebApplication` und `Dataset` nicht als eine Entität verketten.
   Bei einem Domain-Umzug (§3) müssen alle `url`-Felder mitwandern — mit `@id` wäre das ein Ort.
2. **`Dataset.license` zeigt für DE auf eine tote URL.**
   `content.mjs:168-170` setzt `license = 'https://www.dwd.de/DE/service/copyright/copyright_node.html'`
   für alle DE-Orte. Abruf am 2026-07-31 → **HTTP 404**. (Zu verifizieren: DWD blockt ggf. Bots;
   die Alternative `https://www.dwd.de/DE/service/rechtliche_hinweise/rechtliche_hinweise_node.html`
   ist erreichbar.) Ein 404 im `license`-Feld eines `Dataset` entwertet genau die Aussage, die
   das Feld transportieren soll. Siehe auch §6 (Lizenz-Etikett DWD).

### 2.4 Meta / Canonicals / hreflang — Qualitätsbewertung

- **Titles:** Muster `Wetter <Ort> — <Region> | buscosun` (`content.mjs:129`). Konsistent, unter
  60 Zeichen, mit Ortsmodifikator. Für Explainer `<Titel> — einfach erklärt | buscosun`
  (`content.mjs:421`) — gute Long-Tail-Form.
- **Descriptions:** Ortsseiten fest getextet (`content.mjs:130`), Explainer/Tools/Events aus der
  Direktantwort auf 155 Zeichen gekürzt (`content.mjs:422-425`, `:581-585`, `:727-731`). Sauber.
  Schwäche: die 138 Ortsbeschreibungen sind **wortgleich bis auf Ort/Region/Land** — Google
  behandelt das als Near-Duplicate-Signal.
- **Canonicals:** selbstreferenziell, aus `SITE.url + canonicalPath` (`content.mjs:235`).
  **Das ist der Domain-Defekt** — siehe §3.
- **hreflang:** `hreflangLinks()` (`content.mjs:216-220`) erzeugt für **jede** Seite drei
  `alternate`-Links `de-DE`, `de-AT`, `de-CH` **plus** `x-default` — **alle auf dieselbe URL**.

  *Bewertung: nicht gerechtfertigt und potenziell schädlich.* hreflang beschreibt **alternative
  URLs** für Sprach-/Regionsvarianten. Hier existiert je Seite nur **eine** URL; DE/AT/CH sind
  keine Locale-Varianten des Angebots, sondern **Attribute des Ortes** (Zermatt ist immer CH,
  egal wer sucht). Vier Tags, die alle auf sich selbst zeigen, sind bestenfalls ein No-Op und
  erzeugen im GSC-Bericht „Internationale Ausrichtung" Rauschen. `docs/seo-geo/measurement.md:15`
  plant sogar, diesen Bericht monatlich zu prüfen — er wird nie etwas Sinnvolles zeigen.
  **Empfehlung:** hreflang ersatzlos entfernen (nur `<html lang="de">` behalten), bis O-05
  (i18n) tatsächlich eine EN-Variante bringt. Dann sind die Tags echt.

### 2.5 Interne Verlinkung — der strukturelle Hauptmangel

Die statischen Seiten verlinken **untereinander** ordentlich:
Nachbarorte per Distanz (`content.mjs:282`, `nearestPlaces(place, 6)`), passende Explainer
(`content.mjs:285-286`, `relevantExplainersFor`), Breadcrumbs, Hubs.

**Aber: die App verlinkt die statischen Seiten nirgends.** Verifiziert:

```
grep -rn "/wetter/\|/wissen/\|/funktionen/\|/wetterlage/" --include="*.tsx" --include="*.ts" src/
→ 0 Treffer
```

Der einzige Einstieg aus der App-Richtung ist der in `#root` injizierte Fallback-Block
(`content.mjs:348-374`, injiziert in `generate-seo.mjs:239`) — und den **ersetzt React beim Mount**
(so auch im Kommentar `content.mjs:347` dokumentiert). Googlebot rendert JS; nach dem Rendering
sind die 8+8+8 Ortslinks des Fallbacks **weg**. Damit sind alle 149 statischen Seiten für den
gerenderten Crawl **verwaiste Seiten (Orphans)**, erreichbar nur über `sitemap.xml`, `llms.txt`
und untereinander. Das ist der teuerste einzelne SEO-Mangel im Repo: 149 Seiten ohne internen
PageRank-Fluss von der einzigen Seite, die je Backlinks bekommen wird (der Startseite).

*Gegenprobe, damit die Aussage fair bleibt:* Der Fallback ist **kein Cloaking** (der Kommentar
`content.mjs:347` sagt „inhaltsgleich"), und die Sitemap sorgt für Discovery. Es fehlt nicht die
Auffindbarkeit, sondern die **Autorität** und die thematische Verknüpfung.

### 2.6 SPA ↔ statische Seiten — Verhältnis

Die statischen Seiten sind bewusst **keine** Live-Wetterseiten (`content.mjs:4-6`:
„Keine Live-Wetterzahlen (wären sofort veraltet) — stabile, aus echten Attributen abgeleitete
Faktentexte"). Der CTA öffnet die App am Ort per `#m=`-Permalink, der `encodeMapState` aus
`src/mapState.ts` **repliziert** (`content.mjs:30-36`).

*Risiko (verifiziert als Kopplung, nicht als Defekt):* `mapPermalink()` kodiert die Layer-Bitmaske
hart als `b: 4` mit dem Kommentar „Layer-Bitmaske: ['wind','nowcast','temp','clouds','sat',
'lightning','stations']; Default 'temp' = Bit 4" (`content.mjs:31-34`). Ändert jemand die
Layer-Reihenfolge in `src/mapState.ts`, öffnen alle 138 CTA-Links still den falschen Layer —
ohne dass ein Verifier das merkt. Das gehört in den SEO-Gate (V-SEO-13).

*Positiv:* `scripts/seo/verify-seo.mjs` (142 Zeilen) prüft nach dem Build im **rohen HTML**
H1/Title/Description/JSON-LD-Parsebarkeit und lehnt SVG-`og:image` hart ab
(`content.mjs:222-226` beschreibt die Regel). **Aber:** `verify:seo` ist ein eigenständiges
npm-Skript (`package.json:9`) und **nicht Teil von `build`** (`package.json:8`). Ein SEO-Regress
geht damit unbemerkt live.

### 2.7 Gesamtnote SEO-Ist

**Technisch stark, strukturell verwaist, kanonisch kaputt.** Der Generator ist für eine
Ein-Personen-Frontend-App bemerkenswert reif (JSON-LD-Tiefe, OG-Disziplin, Roh-HTML-Verifier,
Scaffold/`noindex`-Trennung, honest-by-design-Texte). Drei Dinge machen ihn wirkungslos:
(1) die Canonicals zeigen auf die falsche Domain (§3), (2) unbekannte Pfade antworten mit 200
statt 404 (§4), (3) die App verlinkt ihre eigenen Landingpages nicht (§2.5).
Content-Reife: **6 von 20 Nicht-Ortsseiten** sind `full` — 70 % des Wissens-/Funktionsbereichs
ist `noindex`-Gerüst.

---

## 3. Domain-Kanonik O-03 — vollständiger Beleg + Migrations-Checkliste

### 3.1 Vollständiger Grep-Beleg

**`buscosun.app` — im ausgelieferten Produkt (nicht Doku):**

| Datei:Zeile | Inhalt | Wirkung |
|---|---|---|
| `scripts/seo/content.mjs:13` | `url: 'https://buscosun.app'` | **Die Wurzel.** Speist alle `canonical`, `og:url`, `hreflang`, JSON-LD-`url`/`@id`-Ersatz, Sitemap-`loc`, RSS-`link`/`guid`, News-Sitemap-`loc` |
| `public/robots.txt:45` | `Sitemap: https://buscosun.app/sitemap.xml` | Crawler folgen auf die andere Domain |
| `public/robots.txt:46` | `Sitemap: https://buscosun.app/sitemap-news.xml` | dito |
| `public/llms.txt:6` | `[Interaktive 2D-Wetterkarte](https://buscosun.app/)` | GEO-Einstieg auf falscher Domain |
| `public/llms.txt:7` | Tourenplanung | dito |
| `public/llms.txt:8` | Event-Planung | dito |
| `public/llms.txt:9` | 6-Stunden-Nowcast | dito |
| `public/llms.txt:10` | Modellvergleich | dito |
| `public/llms.txt:11` | Arbeitsfenster | dito |
| `public/llms.txt:14` | `/wetter/`-Hub | dito |
| `public/llms.txt:15` | Beispiel München | dito |
| `public/llms.txt:16` | Beispiel Innsbruck | dito |
| `public/llms.txt:17` | Beispiel Zermatt | dito |
| `public/_og-card.html:55` | `<span>buscosun.app</span>` | Domain steht **eingebrannt in allen 14 OG-PNGs** |
| `src/event/icsExport.ts:137` | `…@buscosun.app` (iCal-UID-Domain) | kosmetisch, aber Identitäts-Signal in exportierten Kalendereinträgen |
| `src/notifications/notificationBackend.ts:23` | `createHttpPushBackend('https://api.buscosun.app')` | nur Doc-Kommentar (Backend ist `NULL_BACKEND`) |

**`buscosun.com` — im ausgelieferten Produkt:**

| Datei:Zeile | Inhalt |
|---|---|
| `public/latest-grib.json:5` | `"warmedThroughProxy": "https://buscosun.com/_dwd_grib"` |
| `public/latest-wind.json:12` | `"warmedThroughProxy": "https://buscosun.com/_dwd_wind"` |
| `src/feedback/FeedbackPage.tsx:28` | `['contact', 'buscosun.com'].join('@')` — die einzige Kontaktadresse des Produkts |

**Quantifizierung:** **16 produktive Fundstellen `.app`** (davon 13 SEO-/GEO-wirksam + 1 in allen
OG-Bildern gerendert) gegen **3 produktive Fundstellen `.com`** (2 Betriebs-Manifeste + die
Kontaktadresse). Dazu Doku-Nennungen in `CLAUDE.md:9`, `architecture.md:100`, `roadmap.md:17/69`,
`decisions.md:77`, `improvements.md:31`, `context.md:8/97`, `plan.md:330`, `checklist.md:198`.

**Die entscheidende Asymmetrie:** Betrieben wird `.com` (Warm-Crons wärmen über
`https://buscosun.com/_dwd_*`, die Kontaktadresse ist `@buscosun.com`, `roadmap.md:69` nennt
`.com` als Annahme, `CLAUDE.md:9` sagt „Produktion: buscosun.com"). **Alle SEO-Signale zeigen
auf `.app`.** Damit gilt heute: jede von Google auf `buscosun.com` gecrawlte Seite trägt ein
`rel=canonical` auf `buscosun.app` — Google wird `.com` entweder gar nicht indexieren oder die
Signale auf eine Domain schieben, die (zu verifizieren) möglicherweise nicht einmal ausgeliefert
wird. Das ist kein Schönheitsfehler, sondern **der Grund, warum das gesamte SEO-Paket noch keine
Wirkung zeigen kann.**

### 3.2 Migrations-Checkliste (Zieldomain = `buscosun.com`, sobald Jan O-03 entscheidet)

> **STOPP & FRAGEN:** Die Domain-Entscheidung ist Jans (O-03). Diese Checkliste ist die
> Ausführungsvorlage **nach** der Entscheidung. Schritt 2 (DNS/Redirect) und Schritt 12
> (Cron-URL) berühren Netlify-/Cron-Mechanik → Infra-Agent + Jans Freigabe.

**A · Code/Config (ein Commit, atomar)**
1. `scripts/seo/content.mjs:13` → `url: 'https://buscosun.com'`. Damit wandern in einem Zug:
   alle 149 Canonicals, `og:url` (164 Seiten), `hreflang` (falls beibehalten), Sitemap-`loc`,
   News-Sitemap-`loc`, RSS `<link>`/`<guid isPermaLink="true">`/`<atom:link rel="self">`,
   JSON-LD `url`/`mainEntityOfPage`/`author.url`/`publisher.url`/`logo`/`item`, `og:image`-URLs.
   *Der Generator ist hier vorbildlich gebaut — eine Zeile genügt.*
2. `public/robots.txt:45-46` → beide `Sitemap:`-Zeilen auf `.com`.
3. `public/llms.txt:6-17` → 12 Links auf `.com` (§5 schlägt ohnehin eine Überarbeitung vor —
   zusammenlegen).
4. `public/_og-card.html:55` → `buscosun.com`; **danach die 14 PNGs in `public/og/` neu rendern**
   (`docs/seo-geo/og-images.md` beschreibt den Regen). Sonst trägt jede Social-/Discover-Karte
   dauerhaft die alte Domain.
5. `src/event/icsExport.ts:137` → UID-Domain `.com` (kosmetisch, aber exportierte Termine tragen
   die Identität in fremde Kalender).
6. `src/notifications/notificationBackend.ts:23` → Kommentar-Beispiel angleichen (kosmetisch).

**B · Hosting (Infra-Agent, Jans Gate)**

7. `buscosun.app` als Domain-Alias in Netlify behalten und **301 auf `buscosun.com`** setzen —
   pfaderhaltend (`/wetter/muenchen/` → `/wetter/muenchen/`), **nicht** pauschal auf `/`.
   Pauschale Root-Redirects werden von Google als Soft-404 gewertet und vererben keine Signale.
8. `www`-Variante ebenfalls 301 auf die Apex-Wahl (oder umgekehrt) — genau **eine** Host-Form
   darf 200 antworten.
9. Redirect mindestens **12 Monate** stehen lassen; erst danach die Alt-Domain fallen lassen.

**C · Search Console / Bing WMT**

10. Property `https://buscosun.com` (oder besser: **Domain-Property**) anlegen und verifizieren.
11. In GSC den **Adressänderungs-Assistenten** (Change of Address) von `.app` → `.com` ausführen —
    setzt voraus, dass beide Properties verifiziert sind und die 301 steht. Analog Bing WMT
    („Site Move"). *Ohne diesen Schritt dauert die Signalübertragung deutlich länger.*
12. Neue Sitemaps einreichen: `/sitemap.xml`, `/sitemap-news.xml`, `/feed.xml`.
13. `docs/seo-geo/your-actions.md:9` und `docs/seo-geo/measurement.md:7` nennen noch
    `https://buscosun.app` als GSC-Property — nach dem Umzug korrigieren (Doku-Inkonsistenz, §14).

**D · Client-Caches**

14. **Service-Worker-Cache-Namen bumpen:** `public/sw.js:16` `const VERSION = 'v1'` → `'v2'`.
    Die drei Caches (`bsc-shell-v1`, `bsc-assets-v1`, `bsc-data-v1`, `sw.js:17-19`) werden im
    `activate`-Handler anhand der Namensliste gelöscht (`sw.js:30-33`) — ohne Bump behalten
    Bestandsnutzer die alte `index.html` mit alten Canonicals im Shell-Cache.
    *Achtung:* Der SW cached auch Kartenkacheln/Wetterdaten im `DATA`-Cache (Cap 350,
    `sw.js:20`); ein Bump wirft die weg → einmalig langsamerer erster Load. Akzeptabel, aber
    Jan sollte es wissen.
15. `public/manifest.webmanifest` — enthält **keine** absolute Domain (`start_url: "/"`,
    `scope: "/"`), also **keine Änderung nötig**. Verifiziert.

**E · Verifikation (Gate)**

16. `npm run build && npm run verify:seo` — muss grün sein.
17. Grep-Gate: `grep -rn "buscosun\.app" dist/ public/ src/ scripts/` liefert **0** Treffer
    (außer bewusst belassenen Doku-/Historie-Stellen). Als Schritt in V-SEO-13 verankern.
18. Stichprobe live: `curl -sI https://buscosun.app/wetter/muenchen/` → `301` auf
    `https://buscosun.com/wetter/muenchen/`; `curl -s https://buscosun.com/wetter/muenchen/ | grep canonical`
    → `.com`.

---

## 4. Soft-404 (A6) — exakte Regel-Reihenfolge

### 4.1 Befund

`netlify.toml:46-49`:

```toml
[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```

Netlify wertet Redirect-Regeln **vor** dem automatischen `404.html`-Fallback aus. Da die Regel
nicht `force = true` ist, gewinnen **existierende** Dateien (die 149 statischen Seiten,
`sitemap.xml`, `robots.txt`, `llms.txt`, `/assets/*` — so auch im Kommentar `netlify.toml:42-45`
korrekt beschrieben). Für **jeden nicht existierenden Pfad** greift aber `/*` → `index.html`
**mit HTTP 200**. Die generierte `404.html` (`generate-seo.mjs:151`) wird dadurch **nie**
ausgeliefert.

`docs/seo-geo/your-actions.md:12-14` behauptet das Gegenteil: „Netlify: automatisch
(`404.html` wird mit 404 serviert)". Das gilt nur ohne SPA-Catch-all — **Doku-Irrtum**, §14.

### 4.2 Schadensvektor, quantifiziert

Jeder erfundene, vertippte oder veraltete Pfad liefert eine **HTTP-200-Seite mit dem
`<title>buscosun — Wetter DE · AT · CH</title>` und identischem Inhalt** (`index.html:6`).
Konkret betroffen:

- **Alte/veränderte Ortsslugs.** Wird ein Slug in `places.mjs` umbenannt, bleibt die alte URL
  „gültig" (200) statt 404/301 → Google hält beide, wertet die Serie als Duplikat.
- **Scaffold-Löschungen.** Wird ein `stub`-Explainer entfernt, antwortet `/wissen/<slug>/`
  weiterhin 200 mit der App.
- **Fremde Backlinks / Spam-Pfade.** Jeder `?`-lose Fantasiepfad ist indexierbar.
- **Google-Klassifikation:** identischer Inhalt unter beliebig vielen URLs → „Soft 404" und
  „Duplikat ohne vom Nutzer ausgewählte kanonische Seite" im GSC-Indexierungsbericht.
  Da alle diese Seiten die **Home-Canonical** (via `homeHeadExtras`, `content.mjs:824`) tragen,
  wird das Signal nicht auf 149 Seiten verteilt — aber das Crawl-Budget wird verbrannt und
  die Domain sammelt Qualitätsrauschen.
- **Zusätzlich GEO-relevant:** `parse-crawler-logs.mjs:102` schlägt nur an, wenn Crawler
  **nicht**-200 bekommen. Bei einem 200-für-alles-Server meldet das Messwerkzeug **immer grün** —
  der Defekt maskiert seine eigene Messung.

### 4.3 Exakte Ziel-Reihenfolge (funktionserhaltend)

Netlify wertet Regeln **von oben nach unten** aus; die erste passende gewinnt. Die App braucht
den Catch-all **nicht** für ihre Navigation: `src/App.tsx` routet ausschließlich über
**Hash**-Fragmente (`#m=`, `#r=` …) — und Hashes werden vom Server nie gesehen. Der Catch-all ist
also nur für **eine** Sache nötig: dass `/` selbst die App liefert (das tut aber schon
`index.html` als existierende Datei). **Konsequenz: ein pauschaler `/*`→200 ist gar nicht nötig.**

Vorgeschlagene Reihenfolge in `netlify.toml` (Ersatz für die Regel `:46-49`):

```toml
# 1) Datenproxys — unverändert, MÜSSEN oben bleiben (netlify.toml:27-40)
#    /_dwd_opendata/*  → opendata.dwd.de   (status 200, force)
#    /_gfs/*           → NOAA S3           (status 200, force)
#    (+ /_mf, /_ecmwf, /_cscs, sobald V-01 sie ergänzt — ebenfalls VOR Schritt 3)

# 2) Bekannte App-Einstiege, die keine eigene Datei haben (nur falls je nötig).
#    Heute: KEINE — die App lebt unter "/" auf der existierenden index.html.
#    Platzhalter für spätere Pfad-Routen (V-05):
# [[redirects]]
#   from = "/app/*"
#   to   = "/index.html"
#   status = 200

# 3) Alles Übrige: echte Fehlerseite mit HTTP 404.
[[redirects]]
  from   = "/*"
  to     = "/404.html"
  status = 404
```

**Warum das nichts bricht — Punkt für Punkt:**

| Was | Warum es weiter funktioniert |
|---|---|
| `https://buscosun.com/` | `dist/index.html` **existiert** → nicht-erzwungene Regeln greifen nicht. |
| `https://buscosun.com/#m={…}` (Permalink) | Der Hash wird nie an den Server gesendet; der Browser fordert `/` an → siehe oben. |
| `/#r=`, `/#route` etc. (V-05) | identisch — Hash-only. |
| 149 statische Seiten | existierende `index.html`-Dateien in `dist/wetter/<slug>/` usw. |
| `sitemap.xml`, `robots.txt`, `llms.txt`, `feed.xml`, `/og/*.png`, `/assets/*` | existierende Dateien. |
| `/_og-card.html` | existierende Datei (in robots disallowed, aber erreichbar). |
| Datenproxys | eigene `force = true`-Regeln **vor** dem Catch-all. |
| PWA-Offline-Start | `sw.js:25` cached `'/'` und `'/index.html'` im Install → unverändert. |

**Ein einziges echtes Risiko** und wie es abgedeckt wird: Falls jemals eine **pfadbasierte**
App-Route eingeführt wird (V-05 erwägt das), fiele sie ohne Eintrag in Block 2 auf 404.
Deshalb steht der Platzhalter explizit im Vorschlag — Regelblock 2 ist die Allowlist, die bei
V-05 **zwingend mitgepflegt** werden muss. Das gehört als Zeile in die V-05-Umsetzungsskizze.

**Verifikation des Gates:**
`curl -sI https://buscosun.com/gibtsnicht` → `HTTP/2 404` **und** Body = 404-Seite;
`curl -sI https://buscosun.com/wetter/muenchen/` → `200`;
`curl -sI https://buscosun.com/` → `200`;
Browser-Smoke: `#m=`-Permalink öffnet die Karte (Chrome DevTools MCP, Desktop + iPhone 12 Pro).

> **STOPP & FRAGEN:** `netlify.toml` ist laut `agents.md` §3 keine Hochrisiko-Datei, aber der
> Wechsel von 200→404 verändert Auslieferungssemantik in Produktion. Umsetzung erst mit
> Jans Freigabe und gemeinsam mit dem Infra-Agent (der auch V-01 und V-07 dort anfasst —
> **eine** Änderung an `netlify.toml`, nicht drei parallele).

---

## 5. GEO / KI-Suche — Ist & Ausbau

### 5.1 Was tatsächlich da ist

**`public/robots.txt` (verifiziert, 46 Zeilen):** Explizite `Allow: /`-Blöcke für GPTBot,
OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-Web, Claude-SearchBot, PerplexityBot, CCBot,
Google-Extended, Applebot-Extended (plus Googlebot/Bingbot). `Disallow: /_og-card.html` als
einzige Sperre. **Das ist eine bewusste, ungewöhnliche Positionierung:** die meisten Verlage
sperren genau diese Bots. buscosun lädt sie ein.

**`public/llms.txt` (verifiziert, 27 Zeilen):** Folgt der llms.txt-Konvention (H1 + Blockquote-
Zusammenfassung + thematische Link-Listen). Vier Abschnitte: Funktionen (6 Einträge),
Wetter nach Ort (4), DACH-Besonderheiten (4), **Grenzen (3)**.

Der Abschnitt „Grenzen" (`llms.txt:25-27`) ist der eigentliche Trumpf und verdient hervorgehoben
zu werden: „Reine Frontend-App, kein Server: kein zuverlässiges Push …", „Globus-Ansicht nutzt
gebündelte Beispieldaten …", „Kein amtliches Briefing (kein METAR/TAF …)". **Das ist D-04
(Ehrlichkeit) in maschinenlesbarer Form** — und genau die Art Satz, die ein LLM gerne zitiert,
weil sie eine Frage abschließend beantwortet statt zu werben.

Ebenso stark: `llms.txt:22` („UV-Index, Pollenflug-Index und amtliche Unwetterwarnungen **nur für
Deutschland**") und `llms.txt:23` (Lawinenlagebericht wird **nicht modelliert**, sondern zur
amtlichen Quelle verlinkt).

**GEO-Bausteine in den Seiten selbst:**
- 40–60-Wort-Direktantwort-Lead je Ortsseite (`content.mjs:86-96`, `placeLead`), vom Verifier
  auf Wortzahl geprüft (`verify-seo.mjs:41-50`).
- 5–6 zitierbare Faktensätze je Ort (`content.mjs:59-77`, `placeFacts`).
- 4–5 FAQ-Paare je Ort mit `FAQPage`-Markup (`content.mjs:99-126`).
- Explainer mit `Article`-Markup, Quellenliste (`content.mjs:450-451`, `rel="nofollow noopener"`).
- Ehrliche Footer-Disclaimer auf **jeder** Seitenfamilie: „buscosun gibt keine amtlichen Warnungen
  heraus" (`content.mjs:338`, `:479`, `:777`).

### 5.2 Würde ein LLM auf „Regnet es heute in Innsbruck?" buscosun zitieren?

**Ehrliche Antwort: eher nein — und der Grund ist strukturell, nicht sprachlich.**

Ein Modell, das diese Frage beantwortet, sucht nach **einem aktuellen Zahlenwert**. Auf
`/wetter/innsbruck/` findet es (nach `placeLead`, `content.mjs:87-95`) sinngemäß: „Das Wetter für
Innsbruck (Tirol, Österreich, rund … m — Berglage) zeigt buscosun höhenkorrigiert aus amtlichen
Quellen: GeoSphere Austria (AROME, INCA) + ICON-D2. Temperaturen werden über ein digitales
Geländemodell auf die tatsächliche Höhe umgerechnet …"

Das ist eine gute Antwort auf **„Woher bekomme ich Wetter für Innsbruck?"** und eine schlechte
auf **„Regnet es heute?"**. Die Seite ist bewusst zahlenfrei (`content.mjs:4-6`) — eine
verteidigbare Entscheidung (veraltete Zahlen wären schlimmer), aber sie kostet exakt die
Query-Klasse, die 90 % des Wettersuchvolumens ausmacht.

**Wo buscosun heute schon gewinnen kann** (und wo der Ausbau ansetzen sollte):
- „Warum ist es in Innsbruck wärmer als im Tal?" → `foehn`, `temperaturinversion` (beide `full`)
- „Welches Wettermodell ist für Tirol am besten?" → Modellvergleich, `sourcesFor()`
- „Gibt es amtliche Pollendaten für Österreich?" → `placeFaqs`, `content.mjs:113` sagt **nein**
  und erklärt die Alternative. Das ist eine **zitierfähige Negativ-Auskunft** — Gold für LLMs,
  weil kaum jemand sie liefert.
- „Wetter-App ohne Tracker DACH" → hier ist buscosun faktisch konkurrenzlos.

### 5.3 Konkrete Ausbauvorschläge (Priorität in dieser Reihenfolge)

**G1 · Zeitlose Klimafakten statt Live-Zahlen.** Die Sperre „keine Live-Werte" muss nicht heißen
„keine Zahlen". Klimanormale sind **stabil** und beantworten sehr viele reale Fragen:
„Wie viele Regentage hat Innsbruck im Juli?", „Wie kalt wird es in Zermatt im Januar?".
Die Daten liegen **bereits im Repo**: `public/climaGrid.json`, erzeugt von
`src/ml/_buildClimaGrid.ts:3` aus DWD-Stationsmessungen via Meteostat, plus die 1.192-Zeilen-
Stationstabelle `src/history/meteostatStations.ts`. Ein Build-Schritt kann daraus je Ort eine
Monatsklimatologie-Tabelle rendern (Ø Tmax/Tmin, Regentage, Sonnenstunden) — als HTML-`<table>`
**und** als `Dataset`/`Observation`-JSON-LD. Das macht 138 Seiten von „Landingpage" zu
„Nachschlagewerk" und verzehnfacht die zitierbare Faktendichte. (Nebenwirkung: löst zugleich
das Near-Duplicate-Problem der 138 fast identischen Descriptions aus §2.4.)

**G2 · Unsicherheit als zitierbarer Satz.** D-04 ist buscosuns Alleinstellung, aber die
Ehrlichkeit steht heute in Fußnoten. Vorschlag: pro Ortsseite ein fest formulierter Block
„**Was wir für <Ort> nicht wissen**" mit 3–4 Sätzen im Muster:
> „Für Innsbruck endet die Radar-Nowcast-Reichweite (INCA) nach 3 Stunden. Danach zeigt buscosun
> Modelldaten mit ausgewiesenem Spread, keine Radar-Extrapolation."
> „Für Österreich gibt es keinen amtlichen Pollen-Feed; buscosun weist das aus, statt eine
> deutsche Zahl zu übertragen."

Solche Sätze werden von LLMs **überproportional zitiert**, weil sie eine Wissensgrenze sauber
markieren — etwas, das Wettbewerberseiten systematisch vermeiden. Datenbasis existiert bereits
(`src/precipSource.ts` kennt die Länder-Horizonte, D-14).

**G3 · Entitäten-Verkettung (`@id`-Graph).** Aus den heutigen Insel-Objekten (§2.3) einen Graph
bauen: `Organization` mit stabilem `@id` (`https://buscosun.com/#organization`), `WebSite` mit
`publisher: {@id}`, jede `Place`-Seite mit `isPartOf` auf die `CollectionPage`, jedes `Dataset`
mit `creator: {@id}` und `spatialCoverage: {@id der Place}`. Aufwand klein (eine Refaktorierung
in `content.mjs`), Wirkung: Such-/KI-Systeme erkennen buscosun als **eine** Entität statt als
164 unverbundene Dokumente.

**G4 · `llms.txt` vertiefen.** Heute nur Navigations-Links. Ergänzen:
(a) je Land ein Block „Datenquellen und ihre Grenzen" (DE/AT/CH getrennt — die Asymmetrie ist
das Interessanteste, was buscosun zu sagen hat);
(b) ein Abschnitt „Zitierhinweis" mit der gewünschten Nennung („buscosun (buscosun.com), Datenbasis:
DWD/GeoSphere/MeteoSchweiz");
(c) Verweis auf `/lizenzen` (§6) und `/datenschutz` (§7);
(d) die 3 `full`-Explainer direkt verlinken (heute fehlen sie in `llms.txt` komplett — obwohl sie
der inhaltlich stärkste Teil sind).

**G5 · `llms-full.txt`.** Zusätzlich eine einzelne Markdown-Datei mit dem **Volltext** der
`full`-Explainer und der Ortsfaktensätze. Für Modelle, die nicht 149 Seiten crawlen wollen, ist
das die einzige Chance auf inhaltliche Aufnahme. Trivial aus dem bestehenden Generator ableitbar.

**G6 · GEO-Messung ohne Tracking.** `parse-crawler-logs.mjs` erkennt bereits KI-Referrals per
Referer (`:25-29`). Der Log-Zugang fehlt (Netlify-Logdrain ist Enterprise-Feature — §9).

---

## 6. Lizenz- & Attributions-Audit

> **Prüfauftrag, keine Rechtsberatung.** Die Lizenz-Zuordnungen unten sind nach bestem Wissen
> aus Originalquellen recherchiert (Abrufdatum jeweils angegeben). Wo eine Quelle in dieser
> Session nicht erreichbar war, steht **„zu verifizieren"**. Die Bewertung „erfüllt?" beschreibt,
> was im Code steht — nicht, ob es juristisch genügt.

### 6.1 Wo Attribution im Produkt heute überhaupt sichtbar wird

Drei Orte, und alle drei sind unzureichend:

1. **`src/fusion/modelCatalog.ts`** — ein wirklich gutes Asset: 25 Modelle mit `operator`,
   `license` (Typunion `CC-BY-4.0 | Etalab-2.0 | OGL-UK | OGL-Canada | CC0 | Public-Domain`,
   `:47-49`) und fertigem `attribution`-String je Eintrag (`:115-282`), plus
   `RADAR_SOURCE` je Land (`:306-309`). Die Whitelist-Invariante (`:14-18`) ist explizit als
   „kommerziell frei/unlimitiert" begründet. **Das ist die Blaupause für alles Weitere.**
2. **`src/map/ModelLibraryOverlay.tsx:369-370`** rendert `attribution` des aktiven Modells
   im **Fuß der Modell-Bibliothek** — also nur, **wenn der Nutzer das Overlay öffnet**.
3. **`src/map/ModelSwitcher.tsx:51-61`** (`activeAttributions`) — ebenfalls nur im Switcher.

**Folge:** Ein Nutzer, der die Karte anschaut, ohne die Modell-Bibliothek zu öffnen, sieht
**keine einzige Datenquellen-Attribution**. Und der Katalog deckt nur die Modell-Achse ab —
Basemap, Geocoder, DEM, Satellit, Radar-WMS, Historie, Länder-Polygone kommen darin gar nicht vor.

**Verschärfend — MapLibre-Attribution ist in 5 von 9 Karten abgeschaltet:**

| Datei:Zeile | `attributionControl` | Basemap |
|---|---|---|
| `src/MapView.tsx:764` | *(Default = an)* | `tiles.openfreemap.org/styles/positron` |
| `src/radar/RadarMap.tsx:109` | `{ compact: true }` | Liberty / **Esri** |
| `src/route/RouteMap.tsx:78` | *(Default = an)* | Liberty |
| `src/history/MapPicker.tsx:25` | *(Default = an)* | Liberty |
| `src/atmosphere/ThermalMap.tsx:60` | **`false`** | Liberty + Terrarium-DEM |
| `src/globe/GlobeMap.tsx:144` | **`false`** | eigener Style (Natural Earth) |
| `src/HeroMapBackground.tsx:31` | **`false`** | Liberty |
| `src/threed/TerrainMap.tsx:75` | **`false`** | Liberty |
| `src/threed/ThreeDMap.tsx:52` | **`false`** | Liberty |

Die CSS-Regeln (`src/MapView.css:1284-1291`, `src/map/mapDeck.css:207-215`) **stylen** die
Attribution nur (Farbe/Hintergrund) — sie verstecken sie nicht. Gut. Aber die fünf
`attributionControl: false`-Karten zeigen OSM-abgeleitete Kacheln **ohne jede Nennung**.

### 6.2 Die große Tabelle

| # | Quelle / Asset | Verwendung (Beleg) | Lizenz (Quelle · Abruf) | Attributionspflicht | Erfüllt? | Risiko | Maßnahme |
|---|---|---|---|---|---|---|---|
| 1 | **OpenFreeMap** (Basemap Liberty/Positron) | `MapView.tsx:764`, `RadarMap.tsx:25`, `RouteMap.tsx:78`, `MapPicker.tsx:25`, `ThermalMap.tsx:59`, `HeroMapBackground.tsx:25`, `TerrainMap.tsx:70`, `ThreeDMap.tsx:49` | Projekt MIT; **Daten OSM unter ODbL**; geforderter Text: „OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (openfreemap.org · 2026-07-31) | **Ja, zwingend** | **Nein — in 5 von 8 Karten `attributionControl:false`** | **HOCH** — größtes Attributionsrisiko im Produkt, betrifft die sichtbarste Fläche | Attribution überall an; zusätzlich `/lizenzen` (V-SEO-05, V-SEO-06) |
| 2 | **Esri World Imagery / World Topo** | `src/radar/RadarMap.tsx:37`, `:40` (unauthentifiziert über `server.arcgisonline.com`) | Esri Web Site & Service Terms; Community-Auskunft: Nutzung nur mit ArcGIS-Lizenz, nicht kommerziell frei; geforderte Nennung „Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" (esri.com/en-us/legal/terms/web-site-service; community.esri.com · 2026-07-31) — **zu verifizieren am verbindlichen Terms-Text** | Ja | **Teilweise** — String lautet nur „Esri World Imagery"/„Esri World Topo" (`RadarMap.tsx:38`, `:41`) | **HOCH** — nicht nur Attribution, sondern **Nutzungsberechtigung** fraglich | **STOPP & FRAGEN (§13).** Optionen: (a) korrekte Copyright-Zeile + Terms-Prüfung, (b) Ersatz durch ein Open-Data-Satellitenprodukt, (c) Feature entfernen (nur mit Jans Freigabe, Funktionserhalt!) |
| 3 | **Nominatim / OpenStreetMap** (Geocoding) | `src/geocode.ts:24` (search), `:42` (reverse), **plus eine dritte, an `geocode.ts` vorbei implementierte Inline-Suche** in `src/SearchPage.tsx:287`; **14 aufrufende Stellen** in der App | OSM-Daten **ODbL**; Nominatim Usage Policy: max. 1 req/s, Single-Thread, **kein clientseitiges Autocomplete**, **Ergebnisse cachen**, identifizierender User-Agent/Referer, „Clearly display attribution as suitable for your medium" (operations.osmfoundation.org/policies/nominatim/ · 2026-07-31) | **Ja** | **Nein** — keine OSM-Nennung im Produkt; kein Caching; kein expliziter Identifikations-Header | **HOCH** (Attribution) / **MITTEL** (Policy) | V-SEO-09: Attribution + Ergebnis-Cache + Konsolidierung der Inline-Kopie |
| 4 | **`public/countries/{DE,AT,CH}.geojson`** (40 KB im Repo) | Länder-Maske; Provenienz laut `src/countryMask.ts:9-12` **„Nominatim `polygon_geojson=1&polygon_threshold=0.01`"** | **ODbL** (abgeleitete OSM-Geometrien) — ODbL ist **Share-Alike**; die Nominatim-Policy verbietet zudem „downloading all POIs in an area"/systematische Abfragen | **Ja** (Attribution + ggf. Share-Alike-Hinweis) | **Nein** — keine Nennung | **HOCH** — dies ist **abgeleitete Datenbank im Repo**, nicht nur eine Anzeige | Herkunft dokumentieren; Ersatz durch Natural Earth (Public Domain) prüfen — beseitigt die ODbL-Frage vollständig |
| 5 | **Mapzen/Tilezen Terrarium DEM** | `src/fusion/elevation.ts:16` (`s3.amazonaws.com/elevation-tiles-prod`), `src/atmosphere/ThermalMap.tsx:24` (`elevation-tiles-prod.s3.amazonaws.com`) | AWS Open Data „Terrain Tiles"; Quellenmix (SRTM, NED, ETOPO1 …) mit je eigenen Nennungspflichten, dokumentiert in tilezen/joerd (github.com/tilezen/joerd · Verweis in `elevation.ts:10`) — **zu verifizieren** welche Einzelquellen konkret genannt werden müssen | Ja (quellenabhängig) | **Nein** | **MITTEL** | Auf `/lizenzen` die joerd-Attributionsliste übernehmen |
| 6 | **Natural Earth** (Globus-Küsten/Grenzen 1:50 m) | `public/globe/coastline-50m.geojson`, `borders-50m.geojson` (2,4 MB), eingebunden `src/globe/globeStyle.ts:60-61`; Herkunft dokumentiert `globeStyle.ts:4-6` | **Public Domain**, keine Pflicht (naturalearthdata.com — allgemein bekannt, hier nicht neu abgerufen) | Nein (Courtesy) | n. z. | **KEIN** | Freiwillig auf `/lizenzen` nennen |
| 7 | **DWD Open Data** (ICON-D2/EU/Global, AICON, EPS, MOSMIX, RADOLAN) | `netlify.toml:27-31`, `netlify/edge-functions/dwd-{wind,grib}.ts`, `src/sources/*` | **GeoNutzV** (Verordnung), Quellenvermerk-Pflicht; bei **Veränderung** erwartet der DWD „mindestens eine Nennung des DWD in zentralen Quellenverzeichnissen oder im Impressum"; Änderungshinweis-Muster „Datenbasis: Deutscher Wetterdienst, …" (dwd.de/DE/leistungen/opendata/opendata.html; dwd.de/DE/service/rechtliche_hinweise/… · 2026-07-31) | **Ja — und zwar mit Änderungshinweis** | **Nein/falsch** — Code sagt durchgängig **„CC BY 4.0"** (`modelCatalog.ts:115,149,155,188,195,222,229,307`; Footer `content.mjs:337,478,635,776`); **es gibt kein Impressum** | **HOCH** — falsches Lizenz-Etikett + fehlendes zentrales Quellenverzeichnis; kollidiert zudem mit **D-04** | V-SEO-08 (Etikett korrigieren) + V-SEO-05 (`/lizenzen`) + V-SEO-04 (Impressum) |
| 8 | **DWD GeoServer WMS** (Radar, Blitz, Satellit, Precip-Forecast) | `src/sources/dwdRadar.ts:18`, `dwdLightning.ts:10`, `dwdSatellite.ts:23`, `dwdPrecipForecast.ts:23` | wie 7 (GeoNutzV) | Ja | teilweise (nur via `RADAR_SOURCE`, nur im Overlay) | **MITTEL** | wie 7 |
| 9 | **EUMETSAT/Meteosat** (Satellitenbild, über DWD-WMS bezogen) | `src/sources/dwdSatellite.ts:23-25`; UI-Text `src/components/LayerInfoPanel.tsx:78` „Meteosat-Satellitenbild" | Bezug über DWD ⇒ DWD-Bedingungen; EUMETSAT-eigene Nennungspflicht (typisch „© EUMETSAT") **zu verifizieren** | vermutlich ja | **Nein** | **MITTEL** | Auf `/lizenzen` klären und nennen |
| 10 | **GeoSphere Austria** (AROME-AT, INCA, TAWES) | `src/sources/geosphereArome.ts:81`, `geosphereInca.ts:90`, `geosphereIncaGrid.ts:31`, `geosphereTawes.ts:19-20`, `src/pointForecast/sampleSources.ts:281,357` | Data Hub: Lizenz **je Datensatz im Metadatum**; geforderte Nennung laut Legal-Seite: **„Datenquelle: GeoSphere Austria - https://data.hub.geosphere.at"** (data.hub.geosphere.at/legal · 2026-07-31). Ob durchgängig CC BY 4.0: **zu verifizieren je Datensatz** | **Ja, mit vorgegebenem Wortlaut** | **Nein** — Code sagt „Daten: GeoSphere Austria · CC BY 4.0" (`modelCatalog.ts:131,170,308`), also weder der geforderte Wortlaut noch der Link | **MITTEL** | Wortlaut + URL übernehmen (V-SEO-08) |
| 11 | **MeteoSchweiz / data.geo.admin.ch** (ICON-CH1/CH2-EPS, rzc-Radar) | `src/sources/iconChEpsSource.ts:30`, `meteoSwissRadar.ts:26` | „Opendata BY"-Bedingungen des Bundes (geo.admin.ch); Quellenangabe verpflichtend. Verbindlicher Text **zu verifizieren** (die in dieser Session versuchten URLs antworteten 404) | Ja | **Nein** — Code sagt „Daten: MeteoSchweiz · CC BY 4.0" (`modelCatalog.ts:139,162,309`) | **MITTEL** | Wortlaut verifizieren, dann übernehmen |
| 12 | **Météo-France** (AROME-FR, ARPEGE) | `modelCatalog.ts:177,215`; Host `meteofrance-pnt.s3.rbx.io.cloud.ovh.net`; Proxy `/_mf` **nur im Vite-Dev** (A1/V-01) | **Etalab 2.0** (Open Licence) — Nennung von Urheber, Quelle, Datum | Ja | teilweise („Daten: Météo-France · Etalab 2.0") | **NIEDRIG** | Datumsangabe ergänzen |
| 13 | **ECMWF** (IFS, AIFS, AIFS-ENS) | `modelCatalog.ts:242,256,263`; `data.ecmwf.int`; Proxy `/_ecmwf` **nur Dev** | ECMWF Open Data: **CC BY 4.0** (allgemein dokumentiert; hier **zu verifizieren** am aktuellen Lizenztext) | Ja | teilweise (Katalog-String) | **NIEDRIG** | auf `/lizenzen` |
| 14 | **NOAA/GFS + KI-Modelle** | `netlify.toml:36-40` (`noaa-gfs-bdp-pds.s3`), `modelCatalog.ts:249,270,276,282` | **Public Domain / CC0** | Nein | n. z. | **KEIN** | Courtesy-Nennung |
| 15 | **UK Met Office (UKMO), Environment Canada (GEM)** | `modelCatalog.ts:209,236` (`ingested: false` — noch kein Adapter) | OGL-UK / OGL-Canada | Ja, sobald genutzt | n. z. (noch nicht genutzt) | **NIEDRIG** | vor Ingest klären |
| 16 | **Open-Meteo** (Pollen/CAMS, Archiv, Ensemble, Luftqualität) | `api.open-meteo.com`, `archive-api.`, `ensemble-api.`, `previous-runs-api.`, `air-quality-api.`; Opt-in-Gate `src/optIn.ts:9-17` | Freie API: **nur nicht-kommerziell**, ≤ 10.000 Aufrufe/Tag, Daten **CC BY 4.0** (open-meteo.com/en/licence, /en/terms · 2026-07-31) | **Ja** | **Nein** (keine sichtbare Nennung) — Opt-in-Gate (D-18) ist aber sauber umgesetzt | **MITTEL** — wird **kritisch**, falls buscosun je monetarisiert wird | Attribution ergänzen; Nicht-Kommerzialität als **Abhängigkeit** in jeder Monetarisierungsdiskussion dokumentieren |
| 17 | **BrightSky** (DWD-Wrapper: Alerts, Stationen, Current, Forecast) | `src/sources/brightSkyCurrent.ts:119`, `brightSkyForecast.ts:98`, `dachStations.ts:90,126`, `dwdAlerts.ts:80`, `src/pointForecast/sampleSources.ts:190` | Software MIT; **Daten = DWD** (⇒ GeoNutzV, Position 7). Fair-Use-Hinweis des Betreibers **zu verifizieren** | Ja (DWD durchreichen) | **Nein** | **MITTEL** | auf `/lizenzen`: „DWD via BrightSky" |
| 18 | **Meteostat** (Historie + `public/climaGrid.json`) | `src/history/meteostatSource.ts:25`, `src/ml/_buildClimaGrid.ts:30,134`, Stationstabelle `src/history/meteostatStations.ts` (1.192 Zeilen, im Bundle) | **CC BY 4.0**, kommerziell erlaubt; geforderte Form: **„Source: Meteostat, Deutscher Wetterdienst"** bzw. „Source: Meteostat and its data providers" (dev.meteostat.net/license.html · 2026-07-31) | **Ja, mit vorgegebener Form** | **Nein** — nur Code-Kommentare (`meteostatSource.ts:2-8`), keine UI-Nennung; `climaGrid.json` trägt die Quelle nur im `meta`-Feld (`_buildClimaGrid.ts:134`) | **MITTEL** | Wortlaut in Historie-UI + `/lizenzen` |
| 19 | **Google Fonts** (League Spartan, Space Grotesk, IBM Plex Mono) | **Vom Google-CDN geladen:** `index.html:11-13` (`preconnect fonts.googleapis.com`, `preconnect fonts.gstatic.com`, `<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk…&family=IBM+Plex+Mono…&family=League+Spartan…">`); genutzt in `src/designTokens.css:169-170` + 8 Deck-CSS-Dateien | Schriften selbst: **SIL OFL 1.1** (frei, auch kommerziell, kein Attributionszwang auf der Seite) — **die Lizenz ist nicht das Problem** | Nein (Font-Lizenz) | — | **HOCH — aber als Datenschutz-, nicht Lizenzrisiko** (§7) | **Selbst hosten** (V-SEO-03) |
| 20 | **Eigene Assets** (Icons, OG-PNGs, `og.svg`, `_og-card.html`) | `public/og/*` (14 PNGs), `public/icon*.{svg,png}` | Eigenwerk (Annahme) | — | — | **KEIN** | — |

### 6.3 Die vier Kernbefunde des Audits

1. **Basemap-Attribution ist die größte Lücke.** OSM/ODbL-Attribution ist die am
   eindeutigsten formulierte Pflicht in der ganzen Tabelle („Attribution is mandatory for all
   uses", openfreemap.org · 2026-07-31) — und sie ist in fünf Karten aktiv abgeschaltet
   (`ThermalMap.tsx:60`, `GlobeMap.tsx:144`, `HeroMapBackground.tsx:31`, `TerrainMap.tsx:75`,
   `ThreeDMap.tsx:52`). Für `GlobeMap` ist es unschädlich (eigener Natural-Earth-Style, keine
   OSM-Kacheln); für die anderen vier nicht.
2. **Esri ist ein Nutzungs-, nicht nur ein Attributionsproblem.** `RadarMap.tsx:37-41` ruft
   unauthentifiziert ein kommerzielles Esri-Tile-Endpoint auf. Das gehört vor jede
   Reichweiten-Ambition geklärt. → STOPP & FRAGEN.
3. **„CC BY 4.0" ist für DWD/GeoSphere/MeteoSchweiz mindestens ungenau.** DWD-Open-Data steht
   unter **GeoNutzV**, nicht unter CC BY 4.0. Das steht an **12 Stellen** im Code
   (`modelCatalog.ts` 8×, `content.mjs` 4× in den Footern) und im `Dataset`-JSON-LD.
   Für ein Projekt, dessen Kernversprechen **Ehrlichkeit** ist (D-04), ist ein falsches
   Lizenz-Etikett besonders unpassend — unabhängig von der juristischen Tragweite.
4. **Es gibt kein zentrales Quellenverzeichnis.** Genau das erwartet der DWD bei veränderter
   Nutzung („Nennung des DWD in zentralen Quellenverzeichnissen oder im Impressum"), und genau
   das fordert auch die ODbL-Praxis. buscosun **verändert massiv** (Höhenkorrektur, Fusion/OI,
   Optical-Flow-Nowcast, eigene Farbrampen). Die `/lizenzen`-Seite ist damit nicht „nice to have",
   sondern der fehlende Schlussstein.

### 6.4 Deliverable: die `/lizenzen`-Seite (Command-Deck-konform, D-27)

**Route & Auslieferung.** Als **statische Seite aus dem SEO-Generator** (`/lizenzen/index.html`),
nicht als React-View. Gründe: (a) sie muss ohne JS lesbar sein, (b) sie muss auch dann erreichbar
sein, wenn die App nicht lädt, (c) sie wird damit automatisch crawl- und **LLM-zitierbar**
(→ direkter GEO-Nutzen), (d) sie überlebt die 404-Umstellung aus §4 als existierende Datei.
Ergänzend eine kleine React-Ansicht wäre Doppelpflege — bewusst **nicht** vorgeschlagen.

**Aufbau (Command-Deck: Sand/Ink, League Spartan, Topbar + Inhalt + Fuß-Deck):**

1. **Kopf:** „Woher unsere Daten kommen" + ein Satz D-04-Ton: „Jede Zahl in buscosun hat eine
   Herkunft. Hier steht sie."
2. **Karten & Geodaten** — OpenFreeMap/OpenMapTiles/OSM (ODbL, Pflichttext wörtlich),
   Terrarium-DEM, Natural Earth, Nominatim, Esri (falls es bleibt).
3. **Wetterdaten je Land** — DE (DWD/GeoNutzV, mit Änderungshinweis „Datenbasis: Deutscher
   Wetterdienst, höhenkorrigiert und eigen visualisiert"), AT (GeoSphere, Wortlaut wie
   data.hub.geosphere.at/legal), CH (MeteoSchweiz/geo.admin.ch), plus ECMWF, Météo-France,
   NOAA, Meteostat, BrightSky, Open-Meteo (mit Hinweis „nur nach ausdrücklicher Zustimmung",
   verlinkt auf D-18-Erklärung).
4. **Schriften & Software** — OFL-Fonts, MapLibre GL (BSD-3), `bz2`/`bzip2-wasm`/`jsfive`,
   React (MIT). Erzeugbar aus `package.json`.
5. **Was buscosun daraus macht** — kurzer Änderungshinweis-Block (GeoNutzV-Erwartung erfüllt).
6. **Fuß:** Links auf `/impressum`, `/datenschutz`, `/`, `feed.xml`.

**Maschinenlesbare Ergänzung:** JSON-LD `CreativeWork`/`Dataset` mit `license`- und
`sourceOrganization`-Feldern, dazu eine Zeile in `llms.txt` — dann kann eine KI auf
„Woher hat buscosun seine Daten?" **wörtlich** und korrekt antworten. Das ist der seltene Fall,
in dem eine Pflichtseite gleichzeitig ein GEO-Asset ist.

**Verknüpfung in der App (Funktionserhalt, additiv):** In jeder Karte die MapLibre-Attribution
**einschalten**; zusätzlich im Deck-Fuß bzw. im `ModelLibraryOverlay`-Fuß
(`ModelLibraryOverlay.tsx:369-370`) einen Link „Alle Quellen & Lizenzen →" auf `/lizenzen`.
Nichts wird entfernt — nur ergänzt.

---

## 7. Rechts-Checkliste DACH (Prüfaufträge, keine Beratung)

> **Nochmals ausdrücklich: keine Rechtsberatung.** Die folgenden Punkte sind Beobachtungen am
> Code plus die Frage, die daraus für eine juristische Prüfung folgt. Ob und in welchem Umfang
> Pflichten bestehen, hängt an Umständen, die ich nicht beurteilen kann und darf (u. a.:
> Betreiber natürliche/juristische Person, geschäftsmäßig oder rein privat, Sitz, Reichweite).

### 7.1 Ist-Stand im Repo (verifiziert)

```
grep -rni "impressum|datenschutz|privacy polic|nutzungsbedingungen|haftungsausschluss|disclaimer"
  src/ scripts/ public/ index.html
→ 2 Treffer, beide irrelevant:
  src/event/EventResult.tsx:1271  className="fo-disclaimer"   (CSS-Klasse)
  src/sources/iconD2EpsSource.ts:183                          (Kommentar-Zufallstreffer)
```

**Es existiert im gesamten Repository kein Impressum, keine Datenschutzerklärung, keine
Nutzungsbedingungen und keine Kontaktseite.** Die einzige Kontaktmöglichkeit ist der
`mailto:`-Versand in `src/feedback/FeedbackPage.tsx:28` an `contact@buscosun.com` — die Adresse
wird zur Laufzeit zusammengesetzt („leichte Anti-Grabbing-Hürde", `FeedbackPage.tsx:8-9,26-28`)
und ist damit **für Nutzer nur nach Klick sichtbar** und für Textsuche nicht auffindbar.

### 7.2 Prüfauftrag R1 — Impressum (Anbieterkennzeichnung)

**Beobachtung:** Ein öffentlich erreichbares, dauerhaft betriebenes Web-Angebot mit eigener
Domain, PWA-Manifest, Kontaktadresse und Feedback-Funktion, betrieben aus Deutschland.
**Frage an die juristische Prüfung:** Greift die Anbieterkennzeichnungspflicht (§ 5 DDG, vormals
§ 5 TMG; ggf. § 18 MStV bei journalistisch-redaktionellen Inhalten)? Die `/wetterlage/`-Familie
(`scripts/seo/events.mjs`, `NewsArticle`-JSON-LD `content.mjs:696-714`, Byline mit
Veröffentlichungs-/Änderungsdatum `content.mjs:768`, Einreichung bei Google News geplant laut
`docs/seo-geo/your-actions.md:38-41`) hat **redaktionellen Charakter** — das ist der Punkt, der
die Frage über eine reine „private Homepage" hinaushebt und ausdrücklich geprüft werden sollte.
**Praktische Konsequenz unabhängig vom Ergebnis:** Der DWD erwartet bei veränderter Nutzung eine
Nennung „in zentralen Quellenverzeichnissen **oder im Impressum**" (§6, Position 7) — ein
Impressum bzw. `/lizenzen` ist also **auch lizenzseitig** der naheliegende Ort.

### 7.3 Prüfauftrag R2 — Datenschutzerklärung trotz Trackerfreiheit

**Beobachtung:** D-02 ist ehrlich umgesetzt — kein Analytics-JS im Repo. Trotzdem existieren
Vorgänge, die typischerweise Informationspflichten auslösen. Verifizierte Auslöser:

| # | Auslöser | Beleg | Warum es zu prüfen ist |
|---|---|---|---|
| a | **Schriften vom Google-CDN** | `index.html:11-13` | Beim Seitenaufruf geht **ohne Zutun des Nutzers** eine Verbindung zu `fonts.googleapis.com`/`fonts.gstatic.com`; dabei wird die IP-Adresse an einen Drittanbieter übertragen. Das ist in Deutschland ein **bekanntes Streitthema** (LG München I, Urt. v. 20.01.2022 – 3 O 17493/20, Schadensersatz wegen dynamischer Google-Fonts-Einbindung; ebenso die anschließende Abmahnwelle). **Zu verifizieren durch juristische Prüfung**, ob und wie das hier greift — der technische Sachverhalt ist eindeutig belegt. **Unabhängig davon: technisch trivial vermeidbar (V-SEO-03).** |
| b | **Geolocation-Berechtigung** | `src/nowcast/NowcastPage.tsx:86-87` (`navigator.geolocation.getCurrentPosition`) | Standortdaten sind personenbezogen; die Koordinaten gehen anschließend per `reverseGeocode` (`NowcastPage.tsx:89`) an **Nominatim (OSMF, Drittland-/Drittanbieterfrage)**. Nutzer erfahren das nirgends. |
| c | **Benachrichtigungs-Berechtigung** | `src/notifications/notificationTransport.ts:71`, `src/nowcast/NowcastAlertsPanel.tsx:72` | `Notification.requestPermission()`; Transport ist zwar `NULL_BACKEND`, die Berechtigung wird aber real angefragt. |
| d | **localStorage — 19 Schlüssel** | verifiziert: `buscosun.atm.lens.v1`, `.favorites.v1`, `.forecast.compareMetric.v1`, `.compareSel.v1`, `.distMode.v1`, `.history.dark.v1`, `.history.favorites.v1`, `.history.recents.v1`, `.intro.seen.v1`, `.notify.delivered.v1`, `.notify.settings.v1`, `.notify.subscriptions.v1`, `.nowcast.alerts.config.v1`, `.alerts.locs.v1`, `.alerts.state.v1`, `.optin.openMeteo.v1`, `.radar.lastview.v1`, `.threed.gonogo.v1` (+ `favorites`) | Rein lokal, kein Serverabfluss — aber Speichern/Auslesen auf dem Endgerät ist der Regelungsgegenstand von § 25 TDDDG. **Zu prüfen**, ob die Ausnahme „unbedingt erforderlich" trägt (bei reinen Nutzereinstellungen häufig bejaht — hier aber u. a. Alarm-Abos und Verläufe). |
| e | **Service-Worker-Cache** | `public/sw.js:16-20` (3 Caches, 350 Einträge) | Ebenfalls Endgerätespeicher; gleiche Prüffrage wie (d). |
| f | **Externe Origins = offenzulegende Datenflüsse** | verifiziert per Grep über `src/`: **25 externe Hosts** | Jede dieser Verbindungen überträgt IP + Referer an einen Dritten. Vollständige Liste unten. |
| g | **`mailto:`-Feedback** | `FeedbackPage.tsx:28-37` | Nutzer übermitteln Freitext + optional ihre E-Mail-Adresse an `contact@buscosun.com` — Verarbeitung, über die zu informieren wäre. |
| h | **Netlify als Auftragsverarbeiter** | `netlify.toml`, Edge Functions | Der Host protokolliert Zugriffe (genau die Logs, auf denen §9 die Messung aufbaut). |

**Die 25 externen Origins (Grep über `src/`, 2026-07-31)** — als Grundlage für die
Datenflussliste einer Datenschutzerklärung:
`www.dwd.de` · `maps.dwd.de` · `opendata.dwd.de` (via `/_dwd_opendata`) · `tiles.openfreemap.org` ·
`dataset.api.hub.geosphere.at` · `api.open-meteo.com` · `archive-api.open-meteo.com` ·
`ensemble-api.open-meteo.com` · `previous-runs-api.open-meteo.com` · `air-quality-api.open-meteo.com` ·
`api.brightsky.dev` · `data.geo.admin.ch` · `nominatim.openstreetmap.org` ·
`server.arcgisonline.com` · `s3.amazonaws.com` + `elevation-tiles-prod.s3.amazonaws.com` ·
`noaa-gfs-bdp-pds.s3.amazonaws.com` (via `/_gfs`) · `meteofrance-pnt.s3.rbx.io.cloud.ovh.net` ·
`data.ecmwf.int` · `data.meteostat.net` · `api.ipma.pt` · `opendata-download-metobs.smhi.se` ·
`dmigw.govcloud.dk` · `fonts.googleapis.com` · `fonts.gstatic.com`.

*Anmerkung zugunsten des Projekts:* Ein Teil davon (`opendata.dwd.de`, NOAA-S3) läuft über die
**Netlify-Rewrites** und ist für den Browser same-origin (`netlify.toml:27-40`) — dort fließt
keine Client-IP zum Upstream. Das ist ein echter, nennenswerter Datenschutzvorteil der
Proxy-Architektur (D-20/D-21) und gehört genau so auf die Datenschutzseite. Für alle direkt
angesprochenen Hosts gilt es nicht.

### 7.4 Prüfauftrag R3 — Haftung / Disclaimer bei sicherheitsrelevanten Inhalten

**Beobachtung:** Die App zeigt sicherheitsrelevante Inhalte:
amtliche DWD-Warnungen (`src/sources/dwdAlerts.ts`), Blitzortung, Lawinen-Deeplinks
(SLF/lawinen.report/LWD Bayern/EAWS, `llms.txt:23`), Go/No-Go-Arbeitsfenster für
**Drohne, Kran, Höhenarbeit** (`content.mjs:366`) und Experten-Layer (Gewitterpotenzial F1,
Rotationspotenzial F5).

**Was bereits vorbildlich da ist** — die Ehrlichkeits-Disziplin (D-04) ist im Generator
konsequent umgesetzt:
- `content.mjs:338`: „buscosun gibt keine amtlichen Warnungen heraus."
- `content.mjs:479`: „buscosun erklärt Wetterphänomene und gibt keine amtlichen Warnungen heraus."
- `content.mjs:777`: „Einordnung einer Wetterlage, keine amtliche Warnung. Verbindliche Warnungen
  geben die staatlichen Wetterdienste heraus."
- `content.mjs:118` (FAQ alpin): „buscosun modelliert keine Lawinengefahr, verlinkt aber …"
- `llms.txt:23`, `llms.txt:27`: dieselbe Aussage maschinenlesbar.
- Für F5 (Rotation) ist §0-Ehrlichkeit laut Memory sogar **gate-blockierend** und „Tornado"-Sprache
  ausdrücklich verboten (D-19).

**Die Lücke:** Diese Sätze stehen **nur auf den statischen SEO-Seiten** und in `llms.txt` —
also genau dort, wo **keine** Warnungen angezeigt werden. **In der App selbst** (die die Warnungen,
Blitze und Go/No-Go-Ampeln tatsächlich anzeigt) gibt es keine zentrale, dauerhaft auffindbare
Haftungs-/Nutzungsaussage. Die Ehrlichkeit ist da, aber am falschen Ort.

**Prüfauftrag:** Ist eine Nutzungs-/Haftungsaussage („keine amtliche Warnung; für sicherheits-
kritische Entscheidungen amtliche Quellen heranziehen") an einer festen Stelle **in der App**
angezeigt und verlinkt erforderlich bzw. empfehlenswert? Vorschlag unabhängig vom Ergebnis:
Ein Abschnitt „Was buscosun nicht ist" auf `/lizenzen` bzw. einer `/nutzung`-Seite,
verlinkt aus jedem Deck-Fuß. Das ist **kein Kleingedrucktes, sondern D-04 an der richtigen
Stelle** — und passt zur Marke, statt ihr zu widersprechen.

### 7.5 Prüfauftrag R4 — Barrierefreiheitsstärkungsgesetz (BFSG)

**Beobachtung, außerhalb meines Kernbereichs, deshalb nur als Hinweis:** Das BFSG (in Kraft seit
28.06.2025) erfasst bestimmte Dienstleistungen im elektronischen Geschäftsverkehr; Kleinstunternehmen
und nicht-geschäftliche Angebote sind in Teilen ausgenommen. `improvements.md` V-12 beschreibt die
A11y-Lage (Historie 75 aria-Attribute vs. Globus 5). **Prüfauftrag:** Fällt buscosun in den
Anwendungsbereich? Falls ja, wäre V-12 nicht nur Qualitäts-, sondern Pflichtprogramm — und die
Priorisierung müsste sich ändern. Koordination mit dem A11y-Agenten.

### 7.6 Was buscosun **nicht** braucht (bewusste Entlastung)

Damit die Liste nicht abschreckt — mehrere sonst übliche Themen entfallen hier **belegbar**:
- **Kein Cookie-Banner** — es gibt keine Cookies und kein Tracking (D-02, per Grep bestätigt:
  kein Analytics-Snippet im Repo). Nach dem Google-Fonts-Fix (V-SEO-03) gibt es **keinen einzigen
  einwilligungspflichtigen Drittanbieter beim reinen Seitenaufruf** mehr. Das ist ein sehr seltener,
  vorzeigbarer Zustand.
- **Keine Auftragsverarbeitungs-Kette für Nutzerkonten** — es gibt keine Konten (D-03).
- **Keine Zahlungs-/Verbraucherinformationspflichten** — kein Verkauf, keine Preise
  (`content.mjs:144`: `price: '0'`).

---

## 8. Trackerfreiheit sichtbar machen

### 8.1 Warum das mehr als ein Nebensatz ist

D-02 ist im DACH-Raum ein echtes Differenzierungsmerkmal, gerade gegen WetterOnline/wetter.com,
deren Werbe-/Tracking-Last `roadmap.md` §C zu Recht als Schwäche benennt. Heute taucht die
Aussage **nur als Nebensatz** auf: „ohne Tracker" in Titles/Descriptions
(`content.mjs:130`, `:55`), im Footer (`content.mjs:337`), in `llms.txt:3`, im Manifest
(`public/manifest.webmanifest`, `description`). **Behauptet, nie belegt.**

Der Unterschied zwischen „wir tracken nicht" und „hier ist der Beweis" ist die ganze Differenzierung.

### 8.2 Deliverable: `/ohne-tracker` (Command-Deck, D-27)

Wie `/lizenzen` als **statische Generator-Seite** (crawlbar, LLM-zitierbar, JS-frei lesbar).
Aufbau:

1. **Was wir nicht sammeln** — konkret und prüfbar, nicht Marketing:
   „Kein Analytics-Skript. Keine Cookies. Kein Konto. Keine Werbe-IDs. Kein Fingerprinting.
   Keine Server-Datenbank — buscosun hat **keinen** Anwendungsserver (D-01)."
2. **Was auf deinem Gerät bleibt** — die 19 localStorage-Schlüssel **namentlich** mit je einem Satz
   Zweck (Datenbasis: §7.3(d), maschinell aus dem Code ableitbar). Dazu: „Löschen jederzeit über
   die Browser-Einstellungen — es gibt keine Serverkopie."
3. **Wohin dein Browser Verbindungen aufbaut** — die Origin-Liste aus §7.3 **ehrlich und
   vollständig**, gruppiert nach „amtliche Wetterdienste", „Karten", „Ortssuche". Mit dem
   ehrlichen Zusatz, dass ein Teil über den eigenen Proxy läuft und der Upstream die Nutzer-IP
   dabei **nicht** sieht (`netlify.toml:27-40`).
4. **So kannst du es selbst nachprüfen** — der Kern der Idee, weil er die Behauptung in eine
   **überprüfbare** verwandelt:
   - „Öffne die Entwicklertools (F12) → Netzwerk → lade neu. Du wirst keine Anfrage an
     Analytics-, Werbe- oder Tracking-Dienste finden."
   - „Öffne Anwendung → Cookies. Die Liste ist leer."
   - „Der gesamte Quelltext liegt offen: <Repo-Link>." *(Setzt eine Entscheidung zur
     Veröffentlichung voraus — **STOPP & FRAGEN**, §13.)*
5. **Warum wir das so machen** — 3 Sätze, Verweis auf D-01/D-02/D-03; ehrlich auch über den Preis:
   „Weil wir nichts messen, wissen wir nicht, welche Funktion du nutzt. Deshalb bauen wir nach
   Gesprächen statt nach Klickzahlen — Feedback ist willkommen." **Das ist der D-04-Ton und
   glaubwürdiger als jedes Privacy-Siegel.**
6. **Fuß:** Links auf `/datenschutz`, `/lizenzen`, `/impressum`.

### 8.3 Sichtbarkeit im Produkt

- Ein dezenter Badge „**ohne Tracker · ohne Konto · kostenlos**" im Deck-Fuß, klickbar auf
  `/ohne-tracker`. Die Zeile existiert als Claim bereits („LIVE · DE · AT · CH · OHNE ACCOUNT",
  D-03) — sie muss nur ein Ziel bekommen.
- In der Onboarding-Tour einen Schritt „Wir messen nichts" (Tour existiert bereits).
- In `llms.txt` einen Abschnitt „Datenschutz" mit 3 zitierfähigen Sätzen — das ist die
  Query-Klasse „Wetter-App ohne Tracking", in der buscosun **heute schon** gewinnen könnte.

**Übergabe an die Produkt-Rolle:** Die vier Differenzierungsachsen (`roadmap.md` §C) nennen
„trackerfrei/ohne Account/schnell" als Achse 4. `/ohne-tracker` ist deren **Landingpage**.
Die Positionierungs-Copy sollte der Produkt-Agent verantworten; die Faktenbasis (Origin-Liste,
localStorage-Inventar, Proxy-Vorteil) liefert dieses Dokument.

---

## 9. Messbarkeit ohne Tracking

### 9.1 Was `parse-crawler-logs.mjs` kann — und was nicht

**Kann** (verifiziert, 104 Zeilen):
- 17 Crawler-User-Agents erkennen (`:19-23`), je Bot Trefferzahl, **%-Anteil HTTP 200** und
  bis zu 5 Beispielpfade (`:60-66`, `:82-87`).
- 10 KI-Referrer-Domains am `Referer` erkennen (`:25-29`, `:67-72`) → **KI-Referral-Besuche**,
  die in keiner Search Console auftauchen.
- Exit-Code 1, wenn ein Bot mit ≥ 5 Treffern überwiegend Nicht-200 bekommt (`:100-104`) →
  brauchbares CI-Gate für WAF-/CDN-Blockaden.

**Kann nicht:**
- **Rankings, Impressionen, Klicks, Queries** — im Log steht kein Suchbegriff.
- **Nutzerverhalten** — keine Sessions, keine Verweildauer, keine Conversion. (Bewusst, D-02.)
- **Core Web Vitals / RUM** — LCP/INP sind clientseitige Messgrößen (das ist der Punkt, an dem
  `roadmap.md` §B.3 „messbares Budget (LCP/INP)" an D-02 stößt → **O-06**).
- **Ob eine KI buscosun tatsächlich zitiert** — nur ob sie gecrawlt hat. Deshalb die manuelle
  Prompt-Baseline (`docs/seo-geo/ai-visibility-prompts.md`, 28 Prompts).
- **Und ganz praktisch: es läuft nirgends.** Das Skript braucht eine Logdatei als Argument
  (`:34-38`). **Netlify liefert Rohzugriffslogs nur über Log-Drains (Enterprise-Feature) —
  zu verifizieren für Jans Tarif.** Ohne Logzugang ist die **einzige** Messinfrastruktur des
  Projekts derzeit **nicht betreibbar**. Das ist der stillste Befund dieses Audits und
  entwertet `docs/seo-geo/measurement.md` §3 vollständig.

*Verschärfend:* Solange A6 (§4) besteht, antwortet der Server **auf alles** mit 200 — das
Exit-Code-1-Gate (`:102`) kann per Konstruktion nie auslösen. **A6 fixen ist Voraussetzung
dafür, dass die Messung überhaupt etwas messen kann.**

### 9.2 Kollidiert die Google Search Console mit D-02?

**Nein — und das lässt sich sauber begründen.** Die Kernfrage lautet: *Wird für die Messung
etwas auf dem Gerät des Nutzers ausgeführt oder gespeichert?*

- **GSC:** nein. Google zeigt Daten aus **seinen eigenen** Suchprotokollen. Die Verifikation
  erfolgt per DNS-TXT-Record oder HTML-Datei — **kein JavaScript, kein Cookie, keine Änderung
  am ausgelieferten Verhalten**. Auch das (heute vorhandene) `sitemap.xml` ist reine
  Server-zu-Google-Kommunikation. **D-02 („Kein JS-Tracking") bleibt wörtlich gewahrt.**
  Wichtig: die HTML-Verifikationsdatei ist **nicht** nötig — DNS-TXT ist die sauberere Variante
  und überlebt die 404-Umstellung aus §4 ohne Sonderregel.
- **Bing Webmaster Tools:** identisch. Zusätzlich relevant, weil Bing die ChatGPT-Suche speist
  (`docs/seo-geo/measurement.md:20`) → **direkter GEO-Nutzen**.
- **Abgrenzung — was D-02 verletzen würde:** Google Analytics, GTM, Plausible/Umami/Matomo mit
  JS-Snippet, jedes RUM-Skript, Sentry-Browser-SDK. Das ist die Grenze, und sie ist scharf.

**Empfehlung:** GSC und Bing WMT sind mit D-02 vereinbar und sollten **umgehend** eingerichtet
werden — aber erst **nach** der Domain-Entscheidung (§3), sonst wird die Property zweimal
angelegt und der Change-of-Address-Prozess unnötig ausgelöst. `docs/seo-geo/your-actions.md:9`
plant die Property noch auf `buscosun.app` (§14).

### 9.3 Realistisch messbare SEO-KPIs unter D-02

| KPI | Quelle | Kadenz | Warum es zählt |
|---|---|---|---|
| Indexierte URLs (von 149) | GSC „Seiten" | monatlich | Die einzige Zahl, die sagt, ob das SEO-Paket überhaupt existiert |
| Impressionen / Klicks je Seitenfamilie | GSC „Leistung", Filter `/wetter/` `/wissen/` `/funktionen/` | monatlich | Zeigt, welche Familie trägt — Grundlage für Content-Priorisierung |
| Top-Queries je Ortsseite | GSC | quartalsweise | Verrät, ob Nutzer „Wetter <Ort>" (verloren gegen die Großen) oder Nischen-Queries (gewinnbar) bringen |
| Discover-Impressionen | GSC „Discover" | monatlich | Entscheidet, ob `/wetterlage/` weiterverfolgt wird |
| Rich-Result-Gültigkeit (FAQ, Breadcrumb, Dataset, Article) | GSC „Verbesserungen" | monatlich | Frühwarnung bei JSON-LD-Regress |
| KI-Crawler-Treffer + %200 | `npm run seo:logs` | monatlich | **Blockiert durch fehlenden Logzugang** (§9.1) |
| KI-Referral-Besuche | dito | monatlich | dito |
| KI-Zitierquote (28 Prompts) | manuell, `ai-visibility-prompts.md` | monatlich | Der einzige echte GEO-Erfolgsindikator |
| SEO-Gate grün | `npm run verify:seo` in CI | pro Commit | **Heute nicht in `build`** (`package.json:8` vs. `:9`) → V-SEO-13 |
| Canonical-/Domain-Konsistenz | Grep-Gate in CI | pro Commit | Verhindert Rückfall in §3 |

**Ehrliches Fazit zu O-06:** Für SEO braucht buscosun **kein** RUM — GSC und Logs genügen.
Der Bedarf entsteht anderswo (Perf-Budgets, Fehler-Tracking, Cron-Health/A3). Das ist die
Domäne des Infra-Agenten; aus SEO-Sicht gibt es **keinen** Grund, D-02 aufzuweichen.
Das ist eine der wenigen Stellen, an denen ein strenges Prinzip nichts kostet.

---

## 10. Initiativen

| # | Initiative | Ziel | Aufwand | Wirkung (1–5) | Abhängigkeiten | Definition of Success |
|---|---|---|---|---|---|---|
| I-1 | **Kanonik-Reparatur** (V-SEO-01, V-SEO-02, V-SEO-10, V-SEO-13) | Alle SEO-Signale zeigen auf **eine** Domain, unbekannte Pfade antworten 404, 149 Seiten sind aus der App verlinkt, ein Gate hält es | M | **5** | **O-03 (Jan)**; Infra für `netlify.toml`; Koordination mit V-01/V-07 | `curl`-Stichproben §3.2/§4.3 grün · 0 `.app`-Treffer im Build · GSC zeigt 149 eingereichte URLs · `verify:seo` in CI |
| I-2 | **Rechts- & Lizenz-Fundament** (V-SEO-03…V-SEO-09) | Impressum, Datenschutz, `/lizenzen`, Fonts selbst gehostet, Attribution überall sichtbar, Lizenz-Etiketten korrekt | M–L | **5** (Risiko) / 2 (Traffic) | Jans Angaben (Impressum); juristische Prüfung; Esri-Entscheidung | Drei Pflichtseiten live und verlinkt · 0 externe Origins beim reinen Seitenaufruf · Attribution in allen 9 Karten · kein „CC BY 4.0" mehr für DWD |
| I-3 | **GEO-Offensive** (V-SEO-11, teilweise V-SEO-14) | Aus 138 Landingpages werden zitierfähige Nachschlagewerke; `llms.txt`/`llms-full.txt` ausgebaut; `@id`-Graph | M | **4** | I-1 (Domain muss stimmen, sonst zitieren LLMs die falsche Adresse); `climaGrid.json` | Klimatabelle auf allen 138 Seiten · `llms-full.txt` live · 28-Prompt-Baseline zeigt ≥ 1 Nennung |
| I-4 | **Trackerfreiheit als Produkt** (V-SEO-12) | `/ohne-tracker` als überprüfbares Versprechen + Positionierung | S–M | **3** (SEO) / 5 (Marke) | I-2 (Origin-Liste kommt von dort); Produkt-Agent für Copy; ggf. Repo-Öffnung (STOPP) | Seite live, aus jedem Deck-Fuß verlinkt · Origin-Liste stimmt mit dem Code überein |
| I-5 | **Content-Reife** (V-SEO-14) | 14 `noindex`-Scaffolds werden `full`; Ortsseiten differenzieren sich | L | **4** | I-1, I-3 | 20/20 Nicht-Ortsseiten `full` · Near-Duplicate-Warnungen im GSC verschwunden |
| I-6 | **Messung aktivieren** (§9) | GSC + Bing WMT verifiziert; Logzugang geklärt | S | **3** | **I-1 zwingend zuerst** (sonst Property auf falscher Domain) | Beide Properties verifiziert, Sitemaps eingereicht, erster Monatsbericht in `tests.md` |

**Empfohlene Reihenfolge:** I-1 → I-2 → I-6 → I-3 → I-4 → I-5.
Begründung: I-1 ist Voraussetzung für **jede** Messung und **jede** Zitierung; I-2 ist das
einzige Bündel mit Risiko- statt Chancencharakter (und der Google-Fonts-Punkt ist in einer Stunde
erledigt); I-6 ist billig, aber erst nach I-1 sinnvoll.

---

## 11. Vorgeschlagene V-Einträge

> Für `improvements.md`. Bezeichner hier `V-SEO-NN`; die endgültige fortlaufende `V-NN`-Nummer
> (ab **V-17**) vergibt der Koordinator. **Nicht dupliziert:** V-02 (Domain) und V-06 (404) sind
> meine Themen und werden hier **vertieft, nicht ersetzt** — V-SEO-01 und V-SEO-02 sind als
> Detaillierung zu lesen. V-07 (Security-Header) gehört dem Infra-Agenten und wird nur referenziert.

### V-SEO-01 · Domain-Kanonik operativ vollziehen — Vertiefung zu V-02 (Priorität P0 · Aufwand M · Status offen)
**Was:** 16 produktive `.app`-Fundstellen gegen 3 produktive `.com`-Fundstellen; Wurzel ist
`scripts/seo/content.mjs:13`. Betroffen: alle 149 Canonicals, `og:url` auf 164 Seiten,
`robots.txt:45-46`, `llms.txt:6-17` (12 Links), die Domain **eingebrannt in allen 14 OG-PNGs**
(`public/_og-card.html:55`), `src/event/icsExport.ts:137`. V-02 nennt das Problem; hier steht die
vollständige Fundstellenliste (§3.1) und die 18-Schritt-Checkliste (§3.2) inklusive der drei
Punkte, die V-02 nicht kennt: **OG-Bilder neu rendern**, **Service-Worker-Cache-Version bumpen**
(`public/sw.js:16`), **GSC-Change-of-Address**.
**Mehrwert:** Heute sagt buscosun jeder Suchmaschine „die echte Seite ist woanders" — und zwar
auf jeder einzelnen Seite. Solange das so ist, kann keine der 149 Seiten ranken, egal wie gut
sie ist. Ein Ein-Zeilen-Fix plus Umzugscheckliste macht das gesamte bisherige SEO-Paket zum
ersten Mal wirksam.
**Umsetzung:** §3.2 Schritte A1–A6 (Code, ein Commit), B7–B9 (Netlify-301, Infra + Jan),
C10–C13 (GSC/Bing), D14–D15 (SW-Bump), E16–E18 (Gate). Risiken: OG-PNG-Regen vergessen →
Social-Karten zeigen dauerhaft die alte Domain; SW-Bump vergessen → Bestandsnutzer behalten alte
Canonicals; SW-Bump leert den Datencache (einmalig langsamerer Start). **Abhängigkeit: O-03 (Jan).**
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-02 · Echte 404-Antworten mit exakter Regel-Reihenfolge — Vertiefung zu V-06 (P0 · S · offen)
**Was:** `netlify.toml:46-49` (`/*` → `/index.html`, 200) fängt jeden unbekannten Pfad ab; die
generierte `404.html` (`generate-seo.mjs:151`) wird nie ausgeliefert. `docs/seo-geo/your-actions.md:12-14`
behauptet fälschlich, Netlify erledige das automatisch. Neue Erkenntnis gegenüber V-06: **die App
braucht den Catch-all gar nicht** — `src/App.tsx` routet ausschließlich über Hash-Fragmente, und
`/` wird von der existierenden `index.html` bedient. Der Catch-all kann daher **ersatzlos** durch
`/* → /404.html 404` ersetzt werden. Zweiter neuer Punkt: Solange 200-für-alles gilt, kann das
Log-Gate `parse-crawler-logs.mjs:102` **nie** auslösen — der Defekt maskiert seine eigene Messung.
**Mehrwert:** Suchmaschinen hören auf, beliebige Fantasie-Adressen als gültige Seiten zu zählen.
Das schützt die Qualitätsbewertung der Domain und sorgt dafür, dass das Crawl-Budget auf den 149
echten Seiten landet statt auf Rauschen.
**Umsetzung:** Regelblock aus §4.3 (Proxys oben, optionale App-Route-Allowlist, dann
`/* → /404.html 404`). Verifikation per `curl -sI` auf vier Pfade + MCP-Smoke des `#m=`-Permalinks.
**Risiko:** Wird später eine **pfadbasierte** Route eingeführt (V-05), muss sie in die Allowlist —
diese Zeile gehört in die V-05-Umsetzungsskizze. **STOPP & FRAGEN:** `netlify.toml` gemeinsam mit
V-01/V-07 in **einer** Änderung, nicht in dreien.
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-03 · Schriften selbst hosten statt vom Google-CDN (P0 · S · offen)
**Was:** `index.html:11-13` lädt League Spartan, Space Grotesk und IBM Plex Mono per
`<link>` von `fonts.googleapis.com` (+ `preconnect` auf `fonts.gstatic.com`). Bei **jedem**
Seitenaufruf geht damit ungefragt eine Verbindung inkl. IP-Adresse zu einem Drittanbieter.
Das ist in Deutschland ein bekanntes Streitthema (LG München I, Urt. v. 20.01.2022 – 3 O 17493/20,
sowie die anschließende Abmahnwelle) — **rechtliche Bewertung ist Prüfauftrag (§7.2a), der
technische Sachverhalt ist belegt.** Die Schriftlizenzen selbst (SIL OFL 1.1) erlauben das
Selbst-Hosten ausdrücklich.
**Mehrwert:** Ein bekanntes Abmahn-/Beschwerderisiko fällt weg, ohne dass sich am Aussehen
irgendetwas ändert. Zusätzlich lädt die Seite schneller (zwei DNS-Auflösungen, ein
TLS-Handshake und ein Render-blockierendes Stylesheet weniger) — und die Aussage „ohne Tracker"
wird erstmals ohne Sternchen wahr: **danach baut ein Seitenaufruf keine einzige Verbindung zu
einem Drittanbieter mehr auf**, bevor der Nutzer etwas tut.
**Umsetzung:** WOFF2-Dateien der drei Familien (nur die tatsächlich verwendeten Schnitte, laut
`index.html:13`: Space Grotesk 400/500/600/700, IBM Plex Mono 400/500, League Spartan
300–800) nach `public/fonts/`; `@font-face`-Block mit `font-display: swap` in
`src/designTokens.css` (dort stehen bereits `--font-display`/`--font-mono`, `:169-170`);
`index.html:11-13` entfernen; `<link rel="preload">` für die 2–3 kritischen Schnitte.
**Nebeneffekt:** vereinfacht die CSP in V-07 erheblich (kein `fonts.googleapis.com` in
`style-src`/`font-src`). **Risiko:** Subsetting zu aggressiv → fehlende Glyphen (ä/ö/ü/ß,
`·`, `→`, `°`, Flaggen-Emoji werden vom System gerendert). Visueller Diff Desktop+Mobil als Gate.
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-04 · Impressum, Datenschutzerklärung und Kontakt anlegen (P0 · M · offen)
**Was:** Im gesamten Repository existiert keine dieser Seiten (Grep-Beleg §7.1). Die einzige
Kontaktmöglichkeit ist ein zur Laufzeit zusammengesetzter `mailto:`-Link
(`src/feedback/FeedbackPage.tsx:26-28`). Gleichzeitig gibt es Auslöser, die üblicherweise
Informationspflichten begründen: Geolocation (`src/nowcast/NowcastPage.tsx:86-87`),
Notifications (`src/notifications/notificationTransport.ts:71`), 19 localStorage-Schlüssel,
Service-Worker-Caches (`public/sw.js:16-20`), **25 externe Origins** und redaktionelle Inhalte
in `/wetterlage/` (`NewsArticle`-Markup, `content.mjs:696-714`).
**Mehrwert:** Die Seite wird angreifbar, weil eine Standardangabe fehlt, die jeder erwartet —
und weil ausgerechnet das Projekt, das Datenschutz als Markenkern führt, nicht sagt, was es
mit Daten tut. Mit den drei Seiten wird aus dem Versprechen ein belegtes Versprechen, und Jan
ist auf der sicheren Seite.
**Umsetzung:** Drei statische Seiten aus dem SEO-Generator (`/impressum/`, `/datenschutz/`,
`/kontakt/`) im Command-Deck-Stil (D-27), Muster wie `renderToolPage`; `noindex` **nicht** setzen
(Impressum muss auffindbar sein); aus jedem Deck-Fuß verlinken (additiv, Funktionserhalt).
Inhaltliche Bausteine liegen fertig in §7.3 vor (Origin-Liste, localStorage-Inventar,
Berechtigungs-Auslöser, Proxy-Vorteil). **Jan liefert die Anbieterdaten. Rechtliche Prüfung des
Textes durch eine juristische Stelle — dieses Dokument liefert nur die technische Faktenbasis.**
Abhängigkeit: V-SEO-01 (Domain steht in Impressum/Kontakt).
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-05 · `/lizenzen`-Seite: zentrales Quellen- und Attributionsverzeichnis (P0 · M · offen)
**Was:** buscosun nutzt ~20 externe Datenquellen und Karten-Assets mit teils klar formulierter
Attributionspflicht (§6.2). Ein zentrales Verzeichnis existiert nicht. Der DWD erwartet bei
**veränderter** Nutzung — und buscosun verändert massiv (Höhenkorrektur, OI-Fusion,
Optical-Flow-Nowcast, eigene Rampen) — „mindestens eine Nennung des DWD in zentralen
Quellenverzeichnissen oder im Impressum" (dwd.de · 2026-07-31). GeoSphere gibt sogar einen
**wörtlichen** Text vor: „Datenquelle: GeoSphere Austria - https://data.hub.geosphere.at"
(data.hub.geosphere.at/legal · 2026-07-31).
**Mehrwert:** Alle Quellen stehen einmal richtig und vollständig an einem Ort — das erfüllt die
Nennungserwartungen der Wetterdienste und beantwortet gleichzeitig eine Frage, die Nutzer und
KI-Assistenten oft stellen: „Woher hat diese App ihre Daten?" Eine Pflichtseite, die zugleich
Vertrauens- und Sichtbarkeits-Asset ist.
**Umsetzung:** Statische Generator-Seite `/lizenzen/` im Command-Deck-Stil, Gliederung nach §6.4
(Karten & Geodaten · Wetterdaten je Land · Schriften & Software · „Was buscosun daraus macht").
Datenbasis: `src/fusion/modelCatalog.ts` (`operator`, `license`, `attribution` je Eintrag,
`:115-282`) build-seitig einlesen statt abtippen — dann bleibt die Seite automatisch aktuell.
Ergänzen um die Nicht-Modell-Quellen (Basemap, Nominatim, DEM, Meteostat, BrightSky,
Open-Meteo, Satellit). JSON-LD (`CreativeWork` mit `license`/`sourceOrganization`) + Zeile in
`llms.txt`. Verlinkt aus jedem Deck-Fuß und aus `ModelLibraryOverlay.tsx:369-370`.
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-06 · Karten-Attribution überall sichtbar machen (P0 · S · offen)
**Was:** Fünf Karten setzen `attributionControl: false` — `src/atmosphere/ThermalMap.tsx:60`,
`src/globe/GlobeMap.tsx:144`, `src/HeroMapBackground.tsx:31`, `src/threed/TerrainMap.tsx:75`,
`src/threed/ThreeDMap.tsx:52`. Vier davon zeigen OpenFreeMap-Kacheln, deren Nutzungsbedingungen
lauten: „Attribution is mandatory for all uses", Pflichttext „OpenFreeMap © OpenMapTiles Data
from OpenStreetMap" (openfreemap.org · 2026-07-31). `GlobeMap` ist unkritisch (eigener
Natural-Earth-Style, Public Domain). Zusätzlich fehlt die OSM-Nennung für den **Geocoder**
(`src/geocode.ts:24,42`) und für die aus Nominatim abgeleiteten Länderpolygone
(`public/countries/*.geojson`, Provenienz dokumentiert in `src/countryMask.ts:9-12`).
**Mehrwert:** Die Menschen, deren ehrenamtliche Kartenarbeit buscosun benutzt, werden genannt —
so, wie es die Lizenz verlangt. Kostet einen Zeilenwechsel pro Karte und nimmt ein
vermeidbares Risiko vom Tisch.
**Umsetzung:** In den vier Kacheln-Karten `attributionControl: { compact: true }` (Muster:
`src/radar/RadarMap.tsx:109`); Styling existiert bereits (`src/MapView.css:1284-1291`,
`src/map/mapDeck.css:207-215`) und versteckt nichts. Für `GlobeMap` genügt eine statische
Zeile im Deck-Fuß. Zusätzlich beim Geocoder-Ergebnis eine dezente Zeile „Ortssuche:
OpenStreetMap (ODbL)" mit Link auf `/lizenzen`. **Risiko:** Layout-Verschiebung in den
3D-/Thermal-Ansichten — Desktop-Pixel-Diff als Gate (Desktop-Regression = Phase fehlgeschlagen).
Abhängigkeit: V-SEO-05.
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-07 · Esri-Basemaps klären oder ersetzen (P1 · M · offen — STOPP & FRAGEN)
**Was:** `src/radar/RadarMap.tsx:37,40` bindet unauthentifiziert
`server.arcgisonline.com/ArcGIS/rest/services/World_Imagery|World_Topo_Map` als Satelliten- und
Gelände-Basemap ein. Nach Esri-Community-Auskunft ist die Nutzung an eine ArcGIS-Lizenz gebunden
und nicht für freie kommerzielle Nutzung vorgesehen; die geforderte Nennung lautet
„Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" — der Code setzt nur
„Esri World Imagery" bzw. „Esri World Topo" (`:38`, `:41`). (esri.com/en-us/legal/terms/web-site-service,
community.esri.com · 2026-07-31; **verbindlicher Terms-Text zu verifizieren**.) Das ist der
einzige Punkt im Audit, bei dem nicht nur die Nennung, sondern die **Nutzungsberechtigung**
fraglich ist.
**Mehrwert:** Klarheit darüber, ob eine sichtbare Funktion auf einer Grundlage steht, die
kippen kann. Ein abgeschalteter Fremd-Endpoint würde die Radar-Ansicht ohne Vorwarnung
beschädigen — unabhängig von jeder rechtlichen Frage.
**Umsetzung:** Drei Optionen, Jan entscheidet: **(a)** Terms prüfen (lassen), korrekte
Copyright-Zeile setzen, Nutzung dokumentieren; **(b)** Ersatz durch ein Open-Data-Produkt
(Sentinel-2-Mosaik / EOX Sentinel-2 cloudless, CC BY 4.0 — zu verifizieren) für „Satellit"
und ein OSM-basiertes Terrain für „Gelände"; **(c)** Feature entfernen — **nur mit Jans
ausdrücklicher Freigabe**, weil das gegen die oberste Direktive Funktionserhalt verstößt.
**Empfehlung: (b)**, weil es Funktionserhalt und Risikofreiheit verbindet.
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-08 · Lizenz-Etiketten korrigieren und Lizenz-Link reparieren (P1 · S · offen)
**Was:** Zwei belegte Ungenauigkeiten. **(1)** DWD-Open-Data wird im Code durchgängig als
„CC BY 4.0" bezeichnet — `src/fusion/modelCatalog.ts:115,149,155,188,195,222,229,307` und in den
Footern `scripts/seo/content.mjs:337,478,635,776` („Deutscher Wetterdienst (DWD, CC BY 4.0)").
Tatsächlich gilt die **GeoNutzV** mit Quellenvermerks- und Änderungshinweis-Pflicht
(dwd.de · 2026-07-31). Analog sind „GeoSphere Austria · CC BY 4.0" (`modelCatalog.ts:131,170,308`)
und „MeteoSchweiz · CC BY 4.0" (`:139,162,309`) mindestens ungenau — GeoSphere gibt einen
eigenen Wortlaut vor, MeteoSchweiz die Bedingungen des Bundes (beides teils **zu verifizieren**).
**(2)** `scripts/seo/content.mjs:168-170` setzt als `Dataset.license` für alle DE-Orte
`https://www.dwd.de/DE/service/copyright/copyright_node.html` — Abruf 2026-07-31 → **HTTP 404**
(zu verifizieren, ob DWD Bots blockt; erreichbar ist
`…/DE/service/rechtliche_hinweise/rechtliche_hinweise_node.html`).
**Mehrwert:** buscosuns Kernversprechen ist Ehrlichkeit (D-04). Ein falsches Lizenz-Etikett auf
138 Seiten und ein toter Lizenz-Link im strukturierten Datensatz sind genau die Art kleiner
Ungenauigkeit, die dieses Versprechen unterläuft — und sie sind in einer Stunde behoben.
**Umsetzung:** `License`-Typunion in `modelCatalog.ts:47-49` um `GeoNutzV` und
`OpenData-CH` erweitern; `attribution`-Strings der betroffenen Einträge anpassen; GeoSphere-
Wortlaut wörtlich übernehmen; die vier Footer in `content.mjs` angleichen; `datasetJsonLd`
(`:167-187`) auf die erreichbare URL setzen. `verify:seo` um eine Prüfung „`license`-URL
antwortet nicht 404" erweitern (netzabhängig → nightly, nicht PR-blockierend).
Abhängigkeit: V-SEO-05 (die Seite liefert den kanonischen Text).
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-09 · Nominatim: Policy-Konformität und Attribution (P1 · M · offen)
**Was:** Der Geocoder wird an **14 Stellen** aufgerufen (u. a. `src/MapView.tsx:3916`,
`src/nowcast/NowcastLocationField.tsx:24`, `src/nowcast/NowcastRadarMap.tsx:339`,
`src/history/MapPicker.tsx:38,47`, `src/event/eventAltLocation.ts:70`, plus je einer in
Atmosphäre/Forecast/Event/History/3D). Zentral gekapselt in `src/geocode.ts:24` (search) und
`:42` (reverse) — **außer** `src/SearchPage.tsx:287`, das eine **eigene Inline-Kopie** derselben
Anfrage baut (Korrektur der UX-Meldung: nicht 2, sondern 3 Konstruktionsstellen und 14 Aufrufer).
Gegen die Nominatim Usage Policy (operations.osmfoundation.org · 2026-07-31) geprüft:
**erfüllt** — kein Type-ahead (alle Aufrufer lösen erst auf Enter/Submit/Klick aus, verifiziert
in `SearchPage.tsx:280-289`, `NowcastLocationField.tsx:37`, `MapView.tsx:3907`), Requests werden
per `AbortController` abgebrochen, Referer identifiziert die App.
**Nicht erfüllt:** (a) **Attribution** („Clearly display attribution as suitable for your
medium") — nirgends; (b) **Caching** („Results must be cached on your side") — kein Cache,
identische Suchen gehen erneut raus; (c) Reverse-Geocoding bei jedem Kartenklick
(`NowcastRadarMap.tsx:339`, `MapPicker.tsx:38`) kann bei schnellen Klicks das 1-req/s-Limit
reißen; (d) die abgeleiteten Länderpolygone (`public/countries/*.geojson`, ODbL Share-Alike,
Herkunft `src/countryMask.ts:9-12`) sind nirgends ausgewiesen.
**Mehrwert:** Die Ortssuche ist ein Kernstück der App und hängt an einem kostenlosen,
ehrenamtlich betriebenen Dienst, der Nutzer bei Regelverstoß sperren darf. Ein kleiner Cache
macht die Suche zugleich **spürbar schneller** (wiederholte Orte antworten sofort) und
entlastet den Dienst.
**Umsetzung:** (1) `src/SearchPage.tsx:287` auf `geocodeDACH` umstellen — eine
Anfragestelle statt drei; (2) LRU-Cache (normalisierte Query bzw. auf ~3 Nachkommastellen
gerundete Koordinate) in `geocode.ts`, Persistenz optional in localStorage
(D-03-konform, rein lokal); (3) sanftes Throttle/Debounce vor Reverse-Aufrufen aus Karten-Klicks;
(4) Attributionszeile „Ortssuche: OpenStreetMap-Mitwirkende (ODbL)" unter den Ergebnissen +
Eintrag auf `/lizenzen`; (5) Herkunft der Länderpolygone dokumentieren und **Ersatz durch
Natural Earth (Public Domain) prüfen** — das würde die ODbL-Share-Alike-Frage vollständig
beseitigen. **Risiko:** Cache liefert veraltete Namen — unkritisch bei Ortsnamen.
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-10 · Statische Seiten aus der App verlinken; hreflang bereinigen (P1 · S · offen)
**Was:** Zwei Befunde. **(1) Orphan-Problem:** Grep über `src/` nach `/wetter/`, `/wissen/`,
`/funktionen/`, `/wetterlage/` liefert **0 Treffer** — die React-App verlinkt keine einzige der
149 statischen Seiten. Der crawlbare Fallback in `#root` (`content.mjs:348-374`) wird beim Mount
von React **ersetzt** (`content.mjs:347`), also aus dem gerenderten DOM entfernt. Damit fließt
von der Startseite keinerlei interne Autorität auf die Landingpages.
**(2) hreflang ohne Nutzen:** `content.mjs:216-220` erzeugt je Seite `de-DE`, `de-AT`, `de-CH`
und `x-default` — **alle vier auf dieselbe URL**. Es gibt keine Sprach-/Regionsvarianten;
DE/AT/CH sind Ortsattribute, keine Locales. `docs/seo-geo/measurement.md:15` plant sogar, den
GSC-hreflang-Bericht monatlich zu prüfen — er kann nie etwas Sinnvolles zeigen.
**Mehrwert:** Die 149 mühsam erzeugten Seiten bekommen endlich Zugang zu der Stärke, die die
Startseite aufbaut — statt als Insel am Rand zu liegen. Und der SEO-Bericht in der Search Console
wird ehrlich, statt Rauschen zu produzieren.
**Umsetzung:** (a) Deck-Fuß-Zeile in der App („Wetter nach Ort · Wetterwissen · Funktionen") mit
echten `<a href>`-Links (kein Router nötig, D-06 gewahrt); (b) im `SearchPage`-Bento-Grid die
Ortsvorschläge zusätzlich als echte `/wetter/<slug>/`-Links anbieten (die Slugs liegen in
`scripts/seo/places.mjs` — Bundle-Kosten prüfen, ggf. nur Top-20 je Land); (c) `hreflangLinks()`
entfernen bzw. auf reine Selbstreferenz reduzieren, bis O-05 eine echte zweite Sprache bringt;
`measurement.md:15` entsprechend anpassen. **Risiko:** Deck-Fuß-Links dürfen keine
Layout-Regression auf Mobil verursachen (Touch-Targets ≥ 44 px). Abhängigkeit: V-SEO-01 (erst
Domain klären).
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-11 · GEO-Ausbau: Klimafakten, Unsicherheits-Blöcke, Entitäten-Graph, `llms-full.txt` (P1 · M · offen)
**Was:** Die 138 Ortsseiten sind bewusst zahlenfrei (`content.mjs:4-6`) und beantworten deshalb
die häufigste Frage („Regnet es heute in Innsbruck?") nicht — ein LLM hat keinen Anlass, sie zu
zitieren (Analyse §5.2). Gleichzeitig liegen zeitlose Zahlen **bereits im Repo**:
`public/climaGrid.json` (erzeugt von `src/ml/_buildClimaGrid.ts:3` aus DWD-Messungen via
Meteostat) und die Stationstabelle `src/history/meteostatStations.ts`. Zudem sind die JSON-LD-
Objekte unverkettet (kein `@id`, §2.3) und `llms.txt` verlinkt die drei fertigen Explainer nicht.
**Mehrwert:** Aus 138 Visitenkarten werden 138 Nachschlagewerke: „Wie viele Regentage hat
Innsbruck im Juli?", „Wie kalt wird Zermatt im Januar?" — Fragen, die stabil beantwortbar sind
und die KI-Assistenten gerne zitieren, weil die Antwort nicht morgen falsch ist. Nebenbei
verschwindet das Problem, dass alle 138 Seiten fast denselben Text tragen.
**Umsetzung:** (1) Build-Schritt in `generate-seo.mjs`: je Ort nächstgelegene Klimastation aus
`climaGrid.json` wählen, Monatstabelle (Ø Tmax/Tmin, Regentage, ggf. Sonnenstunden) als
`<table>` rendern + `Dataset`-JSON-LD; Quellenzeile „Source: Meteostat, Deutscher Wetterdienst"
(geforderter Wortlaut, dev.meteostat.net/license.html · 2026-07-31); Entfernungs- und
Höhendifferenz zur Station **ausweisen** (D-04). (2) Block „Was wir für <Ort> nicht wissen"
mit 3–4 belegten Grenzsätzen (Radar-Horizont je Land aus `src/precipSource.ts`, D-14;
UV/Pollen/Warnungen DE-only). (3) `@id`-Graph in `content.mjs` (Organization/WebSite/Place/Dataset
verketten). (4) `llms.txt` um Explainer-Links, Länder-Datenquellenblöcke, Zitierhinweis und
Verweise auf `/lizenzen` + `/datenschutz` erweitern; zusätzlich `llms-full.txt` mit den
Volltexten. **Risiko:** Klimatabelle darf nicht als Vorhersage missverstanden werden —
Überschrift und Einleitung müssen das klarstellen (gate-relevant, D-04).
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-12 · `/ohne-tracker`: Trackerfreiheit überprüfbar machen (P1 · M · offen)
**Was:** D-02 wird heute nur behauptet — „ohne Tracker" steht in Titles, Descriptions
(`content.mjs:55,130`), im Footer (`:337`), in `llms.txt:3` und im Manifest, aber es gibt keinen
Ort, an dem ein Nutzer das nachvollziehen könnte. Gleichzeitig existiert eine belastbare
Faktenbasis: 19 localStorage-Schlüssel, 25 externe Origins, drei SW-Caches, und der oft übersehene
Vorteil, dass DWD-OpenData und NOAA-GFS über den eigenen Proxy laufen (`netlify.toml:27-40`) —
der Upstream sieht die Nutzer-IP dort **nicht**.
**Mehrwert:** Aus einem Werbesatz wird ein Beweis, den jeder in 30 Sekunden selbst führen kann
(F12 → Netzwerk → keine Tracker; Anwendung → Cookies → leer). Genau diese Nachprüfbarkeit ist
das, was buscosun von Wettbewerbern unterscheidet, die dasselbe behaupten. Für Suchanfragen und
KI-Fragen wie „Wetter-App ohne Tracking" gibt es damit erstmals eine Zielseite.
**Umsetzung:** Statische Generator-Seite `/ohne-tracker/` im Command-Deck-Stil (D-27), Gliederung
nach §8.2 (Was wir nicht sammeln · Was auf deinem Gerät bleibt · Wohin dein Browser verbindet ·
So prüfst du es selbst · Warum). localStorage-Inventar und Origin-Liste **build-seitig aus dem
Code generieren** statt abtippen, damit die Seite nicht veraltet. Badge im Deck-Fuß verlinkt
darauf; Abschnitt „Datenschutz" in `llms.txt`. **Abhängigkeit:** V-SEO-03 muss zuerst
umgesetzt sein — solange Google-Fonts geladen werden, ist die Aussage „keine Drittanbieter beim
Seitenaufruf" schlicht falsch, und die Seite würde D-04 verletzen. **STOPP & FRAGEN:** Der
Prüfschritt „Quelltext liegt offen" setzt eine Entscheidung über die Repo-Veröffentlichung
voraus. Copy-Abstimmung mit der Produkt-Rolle.
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-13 · SEO-Gate in Build und CI verankern (P1 · S · offen)
**Was:** `scripts/seo/verify-seo.mjs` (142 Zeilen, prüft H1/Title/Description/JSON-LD im rohen
HTML und lehnt SVG-`og:image` hart ab) ist ein eigenständiges npm-Skript (`package.json:9`) und
**nicht** Teil von `build` (`package.json:8`: `tsc -b && vite build && node scripts/generate-seo.mjs`).
Ein SEO-Regress geht damit unbemerkt live. Drei Prüfungen fehlen zudem ganz:
(a) **Domain-Konsistenz** (Grep auf die Nicht-Zieldomain im Build-Output);
(b) **`#m=`-Permalink-Kopplung** — `content.mjs:31-34` repliziert die Layer-Bitmaske aus
`src/mapState.ts` **hart als `b: 4`**; ändert sich dort die Layer-Reihenfolge, öffnen alle 138
CTA-Links still den falschen Layer;
(c) **404-Verhalten** (nach V-SEO-02).
**Mehrwert:** Der aufwendigste Teil der SEO-Arbeit — dass aller Inhalt ohne JavaScript im HTML
steht — kann nicht mehr versehentlich kaputtgehen. Und die 138 „Karte öffnen"-Buttons zeigen
garantiert weiterhin auf den richtigen Layer.
**Umsetzung:** `verify:seo` an `build` anhängen **oder** (besser, weil Netlify-Builds nicht
scheitern sollen) in den CI-Workflow aus V-11 aufnehmen. Verifier erweitern um: Grep-Gate
Domain; ein Test, der `mapPermalink()` gegen den echten `encodeMapState`-Import aus
`src/mapState.ts` prüft (Node-strip-types-Harness, D-10-konform, Purity ist gegeben, D-12);
optional nightly ein Netz-Test „`Dataset.license`-URL antwortet nicht 404" (V-SEO-08).
**Abhängigkeit:** V-11 (CI-Minimum, Infra/QA-Rolle).
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

### V-SEO-14 · Content-Reife: 14 `noindex`-Scaffolds fertigstellen (P2 · L · offen)
**Was:** Von 20 Nicht-Ortsseiten sind nur **6** `full` und indexierbar: die Explainer `foehn`,
`temperaturinversion`, `nebel-hochnebel-nebelobergrenze` und die Tools `wetterkarte`,
`atmosphaere`. **14 Seiten** stehen auf `noindex, follow` (`content.mjs:432`, `:597`) — darunter
ausgerechnet `modellvergleich-unsicherheit`, `hoehenkorrektur-lapse-rate` und
`schneefallgrenze`, also genau die Themen, in denen buscosun fachlich vorn liegt, sowie die
Tool-Seiten zu Tourenplanung, Event-Tag und Arbeitsfenster — den drei Funktionen, die
`roadmap.md` §C als **Alleinstellung** benennt. Ebenso hat `/wetterlage/` nur **einen** Artikel,
womit `sitemap-news.xml` (nur ≤ 2 Tage alt, `generate-seo.mjs:212-213`) faktisch dauerhaft leer ist.
**Mehrwert:** Die Funktionen, mit denen buscosun tatsächlich gewinnt, sind für Suchmaschinen
und KI-Assistenten derzeit **unsichtbar** — sie stehen auf „nicht indexieren". Jede
fertiggestellte Seite ist eine zusätzliche Tür zu genau den Nutzern, für die das Produkt gebaut
wurde (Tourengeher, Eventplaner, Drohnenpiloten).
**Umsetzung:** Priorisierte Reihenfolge nach Zielgruppenhebel (`docs/zielgruppen-dach.md`):
zuerst die drei Alleinstellungs-Tools (Tourenplanung, Event-Tag, Arbeitsfenster), dann
`modellvergleich-unsicherheit` und `hoehenkorrektur-lapse-rate` (Ehrlichkeits-Thema, D-04),
dann die restlichen Explainer. Struktur je Seite steht schon (`sections`, `faqs`, `sources`,
`relatedExplainers` in `explainers.mjs`/`tools.mjs`); pro Seite fehlen 600–1.000 Wörter + je ein
OG-PNG (Muster `docs/seo-geo/og-images.md`; Namensschema `explainerOgImage`/`toolOgImage`,
`content.mjs:385-386`, `:548-549`). Status-Flip auf `full` nimmt die Seite automatisch in
Sitemap und RSS auf. Für `/wetterlage/`: 1–2 Artikel je Quartal bei markanten Lagen —
und wenn das nicht realistisch ist, `sitemap-news.xml` **ehrlich abschalten** statt eine leere
Datei einzureichen.
**Quelle:** SEO/GEO & Recht (Agent-Team), 2026-07-31.

---

## 12. Bewertung gegen die vier Differenzierungs-Achsen (`roadmap.md` §C)

| Initiative | (1) Entscheidungs- statt Datenprodukt | (2) Alpin-/Vertikal-Tiefe | (3) Radikale Ehrlichkeit | (4) Trackerfrei/ohne Konto/schnell | Urteil |
|---|---|---|---|---|---|
| **I-1 Kanonik** (V-SEO-01/02/10/13) | ○ neutral | ○ | ○ | ● schneller (SW-/404-Hygiene) | **Enabler.** Zahlt auf keine Achse direkt ein, ist aber Voraussetzung dafür, dass **jede** Achse sichtbar wird. Ohne I-1 ist alles Weitere unsichtbar. |
| **I-2 Recht & Lizenz** (V-SEO-03…09) | ○ | ○ | ●● **stark** — korrekte Lizenz-Etiketten und ein Quellenverzeichnis sind gelebte Ehrlichkeit; ein falsches „CC BY 4.0" auf 138 Seiten widerspricht D-04 | ●● **stark** — nach V-SEO-03 baut ein Seitenaufruf **keine** Drittanbieter-Verbindung mehr auf; V-SEO-03 macht die Seite zusätzlich schneller | **Höchste Priorität nach I-1.** Das einzige Bündel, das Risiko senkt *und* zwei Achsen stärkt. |
| **I-3 GEO-Offensive** (V-SEO-11) | ● Klimafakten beantworten Entscheidungsfragen („Wann fahre ich?") | ● Höhenlage, Föhn, Schneefallgrenze sind bereits die Ortsseiten-Fakten | ●● **stark** — „Was wir für <Ort> nicht wissen" ist D-04 in zitierbarer Form und im DACH-Markt unbesetzt | ○ | **Die strategisch interessanteste Initiative.** KI-Suche belohnt genau die Eigenschaft, die buscosun ohnehin hat. |
| **I-4 Trackerfreiheit** (V-SEO-12) | ○ | ○ | ●● **stark** — inkl. der ehrlichen Kehrseite „wir wissen nicht, was du nutzt" | ●●● **die Achse selbst** | **Direkteste Einzahlung auf Achse 4.** Übergabe an die Produkt-Rolle für die Positionierung. |
| **I-5 Content-Reife** (V-SEO-14) | ●● Tourenplanung/Event-Tag/Arbeitsfenster sind die Alleinstellungs-Features — und stehen auf `noindex` | ● Schneefallgrenze, Höhenkorrektur | ● Modellvergleich/Unsicherheit als Explainer | ○ | **Hoher Hebel, hoher Aufwand.** Die drei Tool-Seiten sind der wirksamste Teilschritt. |
| **I-6 Messung** (§9) | ○ | ○ | ● misst ohne Nutzer-Tracking — Ehrlichkeit auch im eigenen Betrieb | ● bestätigt Achse 4 (GSC ohne JS) | **Billig, notwendig, aber erst nach I-1.** |

**Übergreifendes Urteil:** Keine Initiative in diesem Dokument verletzt eine der vier Achsen.
Zwei (I-3, I-4) zahlen auf Achse 3 „radikale Ehrlichkeit" ein — und genau dort liegt der
seltene Fall, in dem SEO/GEO und Produktidentität **dieselbe** Richtung zeigen: Die Eigenschaft,
die buscosun als Produkt auszeichnet (Grenzen ausweisen statt kaschieren), ist zugleich die
Eigenschaft, die KI-Antwortsysteme bevorzugt zitieren. Das ist kein Zufall, sondern sollte
strategisch ausgebeutet werden.

**Warnung zur Priorisierung:** I-1 und I-2 sehen wie „Hausmeisterarbeiten" aus und werden
deshalb gerne verschoben. Sie sind aber Voraussetzung dafür, dass die attraktiven Initiativen
überhaupt Wirkung entfalten können. Eine perfekte GEO-Seite mit Canonical auf die falsche Domain
ist wirkungslos.

---

## 13. STOPP & FRAGEN an Jan

1. **O-03 — Domain-Entscheidung (blockiert I-1, I-3, I-6).**
   Betrieb und Kontaktadresse sagen `.com` (`public/latest-{grib,wind}.json`,
   `src/feedback/FeedbackPage.tsx:28`), 16 produktive Stellen sagen `.app`.
   **Frage:** Ist `buscosun.com` endgültig die Zieldomain? Falls ja, gebe ich §3.2 als
   Umsetzungsauftrag frei. Falls `.app`: dann müssen die Warm-Crons und die Kontaktadresse
   wandern — das berührt Cron-Mechanik und ist die teurere Variante.
   **Zusatzfrage:** Ist `buscosun.app` überhaupt registriert und auf denselben Netlify-Space
   gerichtet? (Ohne Netzzugriff nicht verifizierbar — für die 301-Planung entscheidend.)

2. **Esri-Basemaps (V-SEO-07).** `src/radar/RadarMap.tsx:37,40` nutzt unauthentifiziert ein
   kommerzielles Esri-Endpoint. Optionen: Terms prüfen lassen · durch Open-Data-Satellit ersetzen ·
   Feature entfernen. **Letzteres verstößt gegen die oberste Direktive Funktionserhalt und
   braucht deine ausdrückliche Freigabe.** Meine Empfehlung: Ersatz, nicht Entfernung.

3. **`netlify.toml` (V-SEO-02).** Der 404-Fix ändert Auslieferungssemantik in Produktion.
   Gleichzeitig wollen V-01 (fehlende Proxys) und V-07 (Security-Header) dieselbe Datei anfassen.
   **Frage:** Freigabe für **eine** koordinierte Änderung durch den Infra-Agenten, mit meinem
   Regelblock aus §4.3 als 404-Teil?

4. **Juristische Prüfung (V-SEO-04, §7).** Impressum, Datenschutzerklärung und die Haftungs-/
   Nutzungsaussage sind **keine** Agenten-Arbeit. **Frage:** Soll ich die technische Faktenbasis
   (25 Origins, 19 localStorage-Schlüssel, Berechtigungs-Auslöser, Proxy-Vorteil) als
   Übergabedokument für eine Rechtsberatung aufbereiten? Und: Betreibst du buscosun privat oder
   geschäftsmäßig? Davon hängen mehrere Prüffragen ab.

5. **Google Fonts (V-SEO-03).** Der Fix ist technisch trivial und in einer Stunde erledigt.
   **Frage:** Soll er als Einzelmaßnahme vorgezogen werden (Risiko sofort weg, Ladezeit besser),
   oder gebündelt mit V-07 (CSP), weil er die CSP vereinfacht?

6. **Repo-Öffentlichkeit (V-SEO-12).** Der stärkste Prüfschritt auf `/ohne-tracker` wäre
   „der gesamte Quelltext liegt offen". **Frage:** Ist das Repository öffentlich bzw. soll es
   werden? Falls nein, entfällt dieser Punkt (die übrigen Prüfschritte bleiben gültig).

7. **`sitemap-news.xml` / Google News.** Mit einem Artikel und ohne redaktionellen Rhythmus ist
   die News-Sitemap dauerhaft leer, und `docs/seo-geo/your-actions.md:38-41` plant eine
   Publisher-Center-Einreichung. **Frage:** Willst du `/wetterlage/` wirklich als redaktionelle
   Schiene betreiben (1–2 Artikel/Quartal Minimum)? Falls nein, empfehle ich, News-Sitemap und
   `NewsArticle`-Markup **ehrlich abzuschalten** — das reduziert zugleich die Frage aus §7.2
   (journalistisch-redaktionelle Angebote).

8. **Länderpolygone aus Nominatim (V-SEO-09).** `public/countries/*.geojson` sind
   OSM-abgeleitete Daten im Repo (ODbL, Share-Alike). Ein Austausch gegen Natural Earth
   (Public Domain) würde die Frage beseitigen, ändert aber Grenzverläufe minimal (Optik der
   Länder-Maske). **Frage:** Austausch prüfen oder ODbL-Nennung genügt?

---

## 14. Gefundene Doku-Inkonsistenzen

| # | Fundstelle | Behauptung | Realität (Beleg) |
|---|---|---|---|
| 1 | `docs/seo-geo/your-actions.md:12-14` | „Host-404 … Netlify: automatisch (`404.html` wird mit 404 serviert)" | Falsch, sobald ein SPA-Catch-all existiert — `netlify.toml:46-49` fängt jeden unbekannten Pfad mit 200 ab. Der Punkt steht seit Erstellung fälschlich als „gelöst durch Hosting-Wahl" da. |
| 2 | `docs/seo-geo/your-actions.md:9` und `docs/seo-geo/measurement.md:7` | GSC-Property `https://buscosun.app` verifizieren | Widerspricht `CLAUDE.md:9` und `roadmap.md:69` (Betrieb/Zieldomain `.com`). Nach O-03 zu korrigieren. |
| 3 | `scripts/seo/content.mjs:13` (Kommentar) | „kanonische Origin (anpassen bei abweichender Domain)" | Der Hinweis ist korrekt und hilfreich — er wurde nur nie befolgt. Ursache von 13 der 16 `.app`-Fundstellen. |
| 4 | `src/fusion/modelCatalog.ts:115` u. a. + `content.mjs:337,478,635,776` | DWD-Daten „CC BY 4.0" | DWD-Open-Data steht unter **GeoNutzV**, nicht CC BY 4.0 (dwd.de · 2026-07-31). 12 Fundstellen. |
| 5 | `scripts/seo/content.mjs:168-170` | `Dataset.license` = `dwd.de/DE/service/copyright/copyright_node.html` | Abruf 2026-07-31 → HTTP 404 (zu verifizieren, ob Bot-Blockade). Erreichbar: `…/rechtliche_hinweise/rechtliche_hinweise_node.html`. |
| 6 | `public/llms.txt:14` | „Geo-Landingpages für ~140 Orte" | Exakt **138** (`places.mjs`, per Import verifiziert). Marginal, aber bei einer Datei, die explizit für KI-Zitate gebaut ist, sollte die Zahl stimmen. |
| 7 | `architecture.md:100` | Beschreibt die SEO-/GEO-Lage inkl. Domain-Inkonsistenz | **Korrekt.** Ausdrücklich vermerkt, weil ungewöhnlich: die Architektur-Doku stimmt hier vollständig mit dem Code überein. |
| 8 | `docs/seo-geo/measurement.md:15` | Monatlich den GSC-Bericht „Internationale Ausrichtung / hreflang" prüfen | Kann nie etwas zeigen — alle vier hreflang-Werte zeigen auf dieselbe URL (`content.mjs:216-220`, §2.4). |
| 9 | `roadmap.md:69` (§E, offene Fragen) | „Lizenz-/Attributionslage (DWD/GeoSphere/MeteoSwiss CC-BY) formal geprüft?" | Mit §6 dieses Dokuments erstmals beantwortet: **nein, und die Etiketten sind teils falsch.** Der Befund ist zudem größer als in §E vermutet — die kritischste Lücke ist nicht die Wetterdaten-, sondern die **Karten**-Attribution. |
| 10 | `buscosun_seo_geo_claude_code_plan.md:17` | „Vite + React + TS, MapLibre, **Three.js/WebGPU**, DWD ICON-D2" | Alt-Doku-Fiktion (kein Three.js im Code, D-24). Bereits in `CLAUDE.md:18` als bekannter Irrtum geführt — hier nur bestätigt. |

---

## 15. Offene Fragen / nicht verifizierbar

1. **Status von `buscosun.app`.** Ohne Netzzugriff auf beide Domains nicht feststellbar, ob
   `.app` registriert ist, auf denselben Netlify-Space zeigt, 301 antwortet oder ins Leere läuft.
   **Entscheidend** für Aufwand und Ablauf der Migration (§3.2). → **Jan / Infra-Agent.**
2. **Ob buscosun.com bereits indexiert ist.** Ohne GSC-Zugang nicht prüfbar. Falls Google `.com`
   nie indexiert hat (plausibel wegen der Canonicals auf `.app`), ist die Migration eher ein
   Neustart als ein Umzug — dann entfällt der Change-of-Address-Schritt.
3. **Netlify-Logzugang.** Rohzugriffslogs sind bei Netlify an Log-Drains gebunden
   (typischerweise Enterprise). Ohne sie ist `parse-crawler-logs.mjs` — die **einzige**
   Messinfrastruktur des Projekts — nicht betreibbar (§9.1). **Zu verifizieren an Jans Tarif.**
4. **Verbindlicher Esri-Terms-Text.** Community-Auskünfte deuten auf Lizenzpflicht; der
   maßgebliche Vertragstext wurde nicht abschließend gelesen (§6.2 Position 2). **Zu verifizieren.**
5. **Lizenz je GeoSphere-Datensatz.** Die Legal-Seite verweist auf das Metadatum **je Datensatz**
   (data.hub.geosphere.at/legal · 2026-07-31); ob AROME/INCA/TAWES alle CC BY 4.0 sind, wurde
   nicht einzeln geprüft. **Zu verifizieren.**
6. **MeteoSchweiz / geo.admin.ch — verbindlicher Nutzungstext.** Die in dieser Session versuchten
   URLs antworteten 404. **Zu verifizieren.**
7. **EUMETSAT-Nennungspflicht** für das über DWD bezogene Meteosat-Produkt
   (`src/sources/dwdSatellite.ts:23-25`). **Zu verifizieren.**
8. **Terrarium-DEM-Quellenliste.** Welche Einzelquellen (SRTM, NED, ETOPO1, …) konkret genannt
   werden müssen, steht in tilezen/joerd und wurde nicht ausgewertet. **Zu verifizieren.**
9. **BrightSky-Fair-Use.** Der Betreiber nennt üblicherweise Nutzungshinweise; nicht geprüft, ob
   buscosuns Aufrufvolumen (6 Aufrufstellen, u. a. Stationslisten mit `max_dist=500000`,
   `src/sources/dachStations.ts:90`) darin bleibt. **Zu verifizieren** — eher Betriebs- als
   Rechtsfrage, aber relevant für Zuverlässigkeit.
10. **Ob die 138 Ortsseiten heute überhaupt live sind.** Der Generator läuft im Netlify-Build
    (`package.json:8`); ob der letzte erfolgreiche Deploy sie enthält, ist ohne Netzabruf nicht
    belegbar. **Zu verifizieren** durch eine `curl`-Stichprobe.
11. **Rechtsform und Geschäftsmäßigkeit des Betriebs.** Bestimmt maßgeblich die Prüffragen in
    §7.2/§7.4/§7.5. **Nur Jan kann das beantworten.**
12. **Ob `sitemap-news.xml` heute leer ist.** Hängt vom `datePublished` des einzigen Events und
    vom Build-Datum ab (`generate-seo.mjs:212-213`). Logisch sehr wahrscheinlich leer, aber nicht
    am ausgelieferten Artefakt verifiziert.

---

*Erstellt von der Rolle SEO/GEO & Recht (Claude-Code-Agent-Team) am 2026-07-31.
Keine Quellcode-, Config- oder Doku-Änderung erfolgt; keine Commits. Einzige geschriebene Datei:
dieses Dokument. Alle V-Einträge sind Vorschläge für `improvements.md` und wurden dort **nicht**
eingetragen — die Übernahme obliegt dem Koordinator.
**Dieses Dokument ist keine Rechtsberatung.***
