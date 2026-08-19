# Infra & Betrieb — Strategie-Deep-Dive (2026-07-31)

> Rolle: **Infra & Betrieb** (`agents.md` §2). Zuständig für `netlify/`, `.github/`, Warm-Crons,
> Monitoring (O-06), Security-Header, Domain (O-03), Skalierbarkeit/Kosten (Feld 11).
> Alle Aussagen sind am Code/Config bzw. an read-only-Abfragen der GitHub-API belegt.
> **Keine Code-, Config- oder Repo-Änderung erfolgt.** Einzige geschriebene Datei: diese.

---

## 1. Auftrag & Abgrenzung

**Auftrag:** §A-Defekte A1–A9 verifizieren und präzisieren · Betriebs-Härtungsplan (Header/CSP,
SW, Edge, 404) · Observability ohne Nutzer-Tracking (O-06) · Skalierbarkeit & Kosten (Feld 11) ·
Entscheidungsvorlagen O-01 (Backend) und O-03 (Domain) · Betriebs-Runbook (Bus-Faktor 1).

**Nicht in diesem Dokument:** Fusion-Engine-Verhalten (Lade-Timing = STOPP & FRAGEN),
Shader/WebGL, MapView-Zerlegung (O-04, Rendering-Rolle), Teststrategie/CI-Blaupause (O-02,
QA-Rolle — ich liefere nur die Betriebs-Anforderungen an CI), SEO-Inhalte (SEO-Rolle — ich
liefere die Domain-Belege und die Migrations-Mechanik).

**Methodik / Belegtiefe.** Gelesen: `CLAUDE.md`, `architecture.md`, `decisions.md`, `roadmap.md`,
`improvements.md`, `agents.md`, `audit/layer-transport.md`, `audit/live-network-audit.md`,
`audit/wind-transport.md`; dann Code/Config: `netlify.toml`, `netlify/edge-functions/*`,
`.github/workflows/*`, `scripts/warm-*.mjs`, `scripts/generate-seo.mjs`, `scripts/seo/content.mjs`,
`public/sw.js`, `public/robots.txt`, `public/llms.txt`, `public/latest-*.json`, `vite.config.ts`,
`index.html`, `src/sources/gribManifest.ts`, `src/sources/iconD2Precip.ts`,
`src/wind/iconD2WindSource.ts`, `src/MapView.tsx`, `src/notifications/notificationBackend.ts`.
Zusätzlich **read-only** GitHub-API-Abfragen (`api.github.com`, `raw.githubusercontent.com`) für
den echten Stand von `origin/main` — **kein Zugriff auf die Produktionsseite** (Constraint).

**Nicht verifizierbar** (Constraint „nichts, was Produktion trifft"): Live-Header von
buscosun.com, HTTP-Status unbekannter Pfade in Prod, Netlify-Kontingente/Rechnung, reale
Edge-HIT-Quote heute. Diese Punkte sind in §15 gesammelt und als Jans Gate markiert.

---

## 2. Ist-Stand am Code/Config belegt

### 2.1 Transport-Kette (verifiziert)

| Baustein | Datei | Stand |
|---|---|---|
| Radar-/Allzweck-Rewrite `/_dwd_opendata/*` | `netlify.toml:27-31` | aktiv, Pass-Through **ohne** Cache-Steuerung |
| GFS-Rewrite `/_gfs/*` | `netlify.toml:36-40` | aktiv |
| SPA-Catch-all `/*` → `/index.html` **Status 200** | `netlify.toml:46-49` | aktiv → A6 |
| Edge-Proxy Wind `/_dwd_wind/*` | `netlify/edge-functions/dwd-wind.ts:29,94-98,106-109` | Whitelist `weather/nwp/icon-d2/grib/`, `durable, max-age=21600, immutable` |
| Edge-Proxy GRIB `/_dwd_grib/*` | `netlify/edge-functions/dwd-grib.ts:32,97-98,109-112` | Whitelist 2 Bäume (`icon-d2/grib/`, `icon-d2-eps/grib/`) |
| Warm-Cron GRIB | `.github/workflows/warm-grib.yml:27` (`*/15`), `scripts/warm-grib.mjs` | T2c-Retry (`warm-grib.mjs:203-229`) + race-sicherer Commit-Loop (`warm-grib.yml:66-93`) |
| Warm-Cron Wind | `.github/workflows/warm-wind.yml:29` (`2,17,32,47`), `scripts/warm-wind.mjs` | T2c-Commit-Loop (`warm-wind.yml:62-89`), **ohne** Retry im Warm-Schritt |
| Manifest-Gate Client | `src/sources/gribManifest.ts:27,33,68,90-111`; `src/wind/iconD2WindSource.ts:60,84-106,340-343` | 24-h-Staleness-Guard, Scan-Fallback |

**T2c ist committet und wirksam.** Commit `d8836f6` („Improve", 2026-07-23) enthält
`.github/workflows/warm-grib.yml`, `.github/workflows/warm-wind.yml`, `scripts/warm-grib.mjs`
(`git show --stat d8836f6`). Beleg für Wirksamkeit in Prod: beide Manifeste tragen
`warmedThroughProxy: https://buscosun.com/_dwd_{grib,wind}` (nicht mehr `localhost:5196` wie beim
Seed) — `public/latest-grib.json:5`, `public/latest-wind.json:12`. Die Manifest-Regression aus
Audit §J ist damit geheilt.

### 2.2 ⚠ Wichtige Korrektur zu einer Kernannahme dieser Session

**Die Warm-Crons laufen. Der behauptete ~2-Tage-Stillstand ist ein Artefakt eines veralteten
lokalen Klons.**

- Der lokale Klon hat zuletzt am **2026-07-29T23:03Z** gefetcht (`.git/FETCH_HEAD`,
  `.git/refs/remotes/origin/main`, mtime 2026-07-30 01:03 +02:00). Lokales `origin/main` =
  `fdff7b0`.
- Tatsächliches `origin/main` (read-only `git ls-remote`): **`f2e05de`** — der Klon ist ~2 Tage
  hinterher.
- GitHub-API (read-only): letzte Bot-Commits **2026-07-31T13:40:47Z** (grib) und
  **2026-07-31T10:25:48Z** (wind); lückenlose Kette seit 2026-07-25.
- Manifeste auf `main` **jetzt**: `latest-grib.json` → Lauf **2026073112**, `updatedAt`
  2026-07-31T13:40:44Z, alle 7 Params mit voller Step-Abdeckung, `eps` = 2026073112;
  `latest-wind.json` → Lauf **2026073109**, Steps 0–12, `updatedAt` 2026-07-31T10:25:47Z.
- Workflow-Runs (letzte 100): **100/100 `conclusion=success`**, 0 Fehlschläge, ø 1,09 min Laufzeit;
  `total_count` 703 seit Aktivierung.

**Konsequenz:** `roadmap.md` §A3 („offenbar ~2 Tage Stillstand"), `improvements.md` V-03
(„standen zuletzt ~2 Tage unbemerkt still") und die von der Daten-Rolle weitergegebene Aussage
„jeder Load fällt derzeit auf den Directory-Scan zurück" sind **in dieser Form falsch** und
gehören korrigiert (§14). Die dahinterliegende *Risiko*-Aussage bleibt aber vollständig gültig:
**es gibt keinerlei Alarmierung** — hätte der Cron wirklich gestanden, wäre es exakt so unbemerkt
geblieben, wie alle Beteiligten es angenommen haben. Genau das ist der Beweis für V-03: *die
Beobachtbarkeit ist so schlecht, dass drei Analysen den Betriebszustand falsch eingeschätzt haben.*

### 2.3 Scheduler-Realität (neuer Befund)

GitHub führt die `*/15`-Zeitpläne **nur zu ~31 %** aus: 49 `warm-grib`-Runs im Fenster
2026-07-29T21:50Z → 2026-07-31T13:37Z (39,8 h) = 1,23 Runs/h statt der nominellen 4/h. Das ist
bekanntes Best-Effort-Verhalten von GitHub-Cron unter Last (die vollen Viertelstunden sind die am
stärksten überbuchten Slots). Praktische Folge: das Manifest kann bis zu ~45–60 min hinter dem
DWD-Publikationsstand liegen, statt der geplanten 15 min. Kein Defekt, aber die Doku
(`architecture.md:97` „15-min-Takt") beschreibt eine Taktung, die es so nicht gibt.

### 2.4 Betriebs-Volumen (Basis für §6)

Commits pro Tag = **Netlify-Rebuilds pro Tag** (der Commit-back triggert bewusst einen Rebuild,
`warm-grib.yml:17-19`):

| Datum | grib | wind | gesamt |
|---|---|---|---|
| 2026-07-27 | 15 | 6 | 21 |
| 2026-07-28 | 15 | 7 | 22 |
| 2026-07-29 | 16 | 5 | 23 (+2 human) |
| 2026-07-30 | 15 | 7 | 22 |

→ **~22 Deploys/Tag ≈ 660 Deploys/Monat.**

---

## 3. §A-Defekte A1–A9 — verifiziert, korrigiert, mit Fix-Skizze

| # | Status nach Prüfung | Beleg | Aufwand | Risiko |
|---|---|---|---|---|
| A1 | **bestätigt** | `vite.config.ts:43-62` vs. `netlify.toml` (kein `/_mf`, `/_ecmwf`, `/_cscs`) | S–M | mittel (Edge-Zone) |
| A2 | **bestätigt, präzisiert** | 6 Fundstellen, s. §8 | S | niedrig |
| A3 | **FALSCH in der Sache, RICHTIG im Risiko** | §2.2 | S | niedrig |
| A4 | außerhalb meiner Rolle (Feature-Audit) | — | — | — |
| A5 | außerhalb meiner Rolle (UX/Nav) | — | — | — |
| A6 | **bestätigt, Fix einfacher als gedacht** | `netlify.toml:46-49` + Hash-Routing | S | niedrig |
| A7 | **bestätigt** | kein `public/_headers`, kein `[[headers]]` in `netlify.toml` | S–M | mittel (CSP-Regression) |
| A8 | teilweise meine Rolle: `.git` = **353 MB** (`du -sh .git`), `verify:simradar` in `package.json` | s. u. | M | STOPP (Löschungen) |
| A9 | **bestätigt, mit frischem Beleg** | Fixture-Lücken, s. u. | S–M | niedrig |

### A1 — Prod-Proxy-Lücke (P0)

**Verifiziert.** `vite.config.ts` definiert fünf Upstream-Proxys, `netlify.toml` nur zwei:

| Pfad | Dev (`vite.config.ts`) | Prod (`netlify.toml`) |
|---|---|---|
| `/_dwd_opendata` | :8-12 | :27-31 ✓ |
| `/_dwd_wind` | :19-23 | Edge Function ✓ |
| `/_dwd_grib` | :28-32 | Edge Function ✓ |
| `/_gfs` | :34-38 | :36-40 ✓ |
| `/_cscs` (→ `rgw.cscs.ch`) | :43-47 | **fehlt** |
| `/_mf` (→ `meteofrance-pnt.s3.rbx.io.cloud.ovh.net`) | :51-55 | **fehlt** |
| `/_ecmwf` (→ `data.ecmwf.int`) | :58-62 | **fehlt** |

In Produktion greift für diese drei Pfade der Catch-all (`netlify.toml:46-49`) → die SPA-Shell
(HTML) wird als GRIB/NetCDF interpretiert → Decode-Fehler bzw. stiller Fallback. Betroffen:
ICON-CH1/CH2-EPS (beide Schweizer Hochauflösungsmodelle), AROME-France, ARPEGE, IFS/AIFS/AIFS-ENS.

**Fix-Skizze.** Zwei Varianten, je nach Upstream-Anforderung:
1. **Reiner Rewrite** (Muster `netlify.toml:36-40`) für `/_ecmwf` und `/_mf` — beide sind
   Range-fähige, key-freie Objektspeicher; ein 200-Rewrite reicht.
2. **`/_cscs` braucht Vorsicht:** der Vite-Kommentar (`vite.config.ts:39-42`) hält fest, dass
   `changeOrigin` den `Host`-Header auf `rgw.cscs.ch` setzen muss, weil die **S3-v2-Signatur
   Host+Pfad+Expires umfasst**. Netlify-Rewrites setzen den Host-Header auf das Ziel — das ist
   das gewünschte Verhalten, aber die **Query muss 1:1 durchgereicht werden** (Signatur!). Das
   ist an einem Preview-Deploy zu verifizieren, nicht anzunehmen.
3. Optional statt Rewrite: eine dritte Edge Function nach dem `dwd-grib.ts`-Muster — nur wenn
   Durable-Caching gewünscht ist. **Empfehlung: erst Rewrite (billig, additiv), Cache später.**

**Verifikation:** `scripts/verify-layer-transport.mjs` um Byte-Identität je neuem Pfad erweitern
(Muster T2-6); die bereits existierenden `verify:ch-eps`, `verify:arome-fr`, `verify:ifs`,
`verify:arpege`, `verify:aifs*` laufen dann auch gegen einen Preview-Deploy statt nur gegen Dev.

**Aufwand** S (Rewrites) bis M (mit Verifier + Preview-Gegenprobe). **Risiko:** `netlify.toml` ist
STOPP-&-FRAGEN-Zone (Transport). Die Reihenfolge der Regeln ist kritisch — die drei neuen Einträge
müssen **vor** dem Catch-all stehen (`netlify.toml:26` dokumentiert die Top-down-Auswertung).

### A2 — Domain-Inkonsistenz (P0) → vollständige Belegliste in §8.

### A3 — Warm-Crons: korrigierte Rekonstruktion (P0 bleibt, Begründung ändert sich)

**Chronologie (belegt).**

| Zeitpunkt | Ereignis | Beleg |
|---|---|---|
| 2026-07-18 14:03/14:29 +02:00 | T1 (Edge+Manifest) gebaut, `warm-wind`-Cron aktiviert | `git log` `d6b9e30`, `23996cb` |
| 2026-07-22 21:20/22:50 +02:00 | T2/T2b; dabei Merge-Regression: Jans `1b334bd` setzte `latest-grib.json` auf den localhost-Seed zurück | `audit/layer-transport.md` §J.4.1 Punkt 2 |
| 2026-07-22 21:09–21:40 UTC | Live-Audit misst 117/117 `fwd=stale` — **Folge der Regression**, nicht des Crons | `audit/live-network-audit.md` §3.3 |
| 2026-07-23 06:59 +02:00 | **T2c committet** (`warmUrl`-Retry + shallow-sicherer Commit-Loop + Cron-Versatz) | `d8836f6` |
| seit 2026-07-25 (Sichtbarkeitsfenster der API-Abfrage) | **lückenlose Bot-Commits**, 21–23/Tag | GitHub-API |
| 2026-07-31 13:40Z | letzter Advance, Lauf 2026073112 | `raw.githubusercontent.com/.../latest-grib.json` |

**„Cron lief nicht" vs. „Cron lief, Manifest advancte nicht":** Historisch trat **beides** auf,
aber **keines davon aktuell**:
- *Advance blockiert* (2026-07-22): Ursachenkette dreiteilig — Merge-Regression + transiente
  undici-Fehler ohne Retry + konservativer Near-Horizon-Fail-Safe (`warm-grib.mjs:336-342`).
  Durch T2c behoben (Retry `warm-grib.mjs:203-229`, Heilung durch den Reset-auf-Remote-Tip-Loop
  `warm-grib.yml:75-91`).
- *Cron lief nicht*: **kein Beleg** für ein solches Ereignis. 100/100 der letzten Runs sind
  `success`.
- Der scheinbare Stillstand 2026-07-29 → 2026-07-31 ist ausschließlich der veraltete lokale Klon
  (§2.2).

**Was bleibt P0:** Es gibt **keinen Wächter**. Der Fail-Safe ist per Design *still* — er beendet
den Job mit Exit 0 und der Meldung „Manifest UNVERÄNDERT" (`warm-grib.mjs:340,351`;
`warm-wind.mjs:164`). Ein dauerhaft blockierter Advance erzeugt also **grüne** Workflow-Runs. Das
ist die eigentliche Lücke: *Erfolg im CI ≠ Erfolg im Betrieb.* → V-INF-01.

**Fix-Skizze (S):** ein zusätzlicher Workflow-Step **nach** dem Warmer, der das Alter des
geschriebenen Manifests prüft (`runAt` älter als 6 h ⇒ `::error` + Exit 1) — damit wird aus dem
stillen Fail-Safe ein sichtbarer roter Run, und GitHub schickt Jan die Standard-Fehler-Mail.
Zusätzlich ein dritter, **unabhängiger** Cron („Wächter"), der die *ausgelieferten* Manifeste
prüft (nicht die im Repo) — Details §5. **Risiko:** Cron-Semantik = STOPP & FRAGEN.

### A6 — 404 liefert HTTP 200 (P1)

**Verifiziert:** `netlify.toml:46-49` (`/*` → `/index.html`, `status = 200`, ohne `force`);
`scripts/generate-seo.mjs:122-151` erzeugt eine echte `404.html`, die nie mit Status 404
ausgeliefert wird.

**Neuer Befund, der den Fix stark vereinfacht:** buscosun routet **ausschließlich über
Hash-Permalinks** (`#m=`, `#h=`, `#atm=`, `#g=`, `#ev=`, `#val`, `#3d=`, `#mobiletest` —
`architecture.md` §2, `src/App.tsx`). **Hash-Fragmente werden nie an den Server gesendet.** Jede
echte App-URL ist also `/` plus Fragment; alle übrigen indexierbaren URLs
(`/wetter/<ort>/`, `/wissen/`, `/funktionen/`, `/wetterlage/`, `sitemap*.xml`, `robots.txt`,
`llms.txt`, `/assets/*`) sind **echte Dateien** im `dist/`.

⇒ Der SPA-Catch-all wird für die Navigation gar nicht gebraucht. Er kann durch
`from = "/*" → to = "/404.html", status = 404` ersetzt werden (weiterhin als letzte Regel, ohne
`force`, damit statische Dateien vorgehen).

**Aufwand:** S (2 Zeilen). **Risiko:** niedrig, aber **prüfpflichtig**: nach der Änderung müssen
`/`, alle vier statischen Seitenbäume, `/index.html`, die Assets und ein Hash-Deeplink auf einem
**Preview-Deploy** durchgeklickt werden. Falls je nicht-Hash-Routen eingeführt werden (V-05 will
`#r=`/`#route`/`#fc`/`#fb` — bleibt Hash, also unkritisch), muss die Regel mitwachsen.
**Abhängigkeit:** mit V-05 abstimmen, damit die Navigations-Reparatur nicht auf History-API-Pfade
umschwenkt, ohne die Rewrite-Regel anzupassen.

### A7 — Keine Security-Header (P1) → vollständiger Plan in §4.

### A8 — Alt-Ballast, Infra-Anteil

**Verifiziert:** `.git` = **353 MB** (`du -sh .git`) bei ~75 500 LOC Quelltext — Ursache sind
committete PNG-Screenshots und Traces (Commit `03fff01` allein enthält 20 PNGs zwischen 50 KB und
1,86 MB). Folge: langsames Klonen für jeden neuen Agenten/Rechner, und **jeder** Netlify-Build
klont dieses Repo — bei ~660 Builds/Monat (§2.4) ist das messbare Build-Zeit.
`package.json` enthält weiterhin `"verify:simradar"` zum gelöschten Feature F3 (D-15).

**Fix-Skizze:** (a) `.gitattributes` + Git-LFS für `audit/screenshots/**` **ab jetzt** (billig,
nicht-destruktiv); (b) Historien-Umschreibung (`git filter-repo`) nur mit Jans ausdrücklicher
Freigabe — sie invalidiert alle Klone und Branches (`feat/atmosphere`,
`perf/2d-layer-mobile`, `perf/wind-adaptive-governor`, `feat/regenradar-anflug` existieren noch).
**Empfehlung: (a) sofort, (b) nicht.** **Risiko:** (b) irreversibel ⇒ STOPP & FRAGEN.

### A9 — Fixtures hängen an Jans PC (P1)

**Verifiziert mit frischem Beleg.** `scripts/capture-hourly.ps1` ist ein Windows-Task-Scheduler-
Wrapper (Zeile 1: „run by Windows Task Scheduler"). Lückenanalyse der letzten 86 Stunden
(`fixtures/session-*.json`, 279 Dateien gesamt):

| Fenster | erwartete Captures | vorhanden |
|---|---|---|
| 2026-07-28T00 … 2026-07-31T13 | 86 | **37 (43 %)** |

Zusammenhängende Lücken: 2026-07-28T03–14 (12 h), 2026-07-29T21–2026-07-30T03 (7 h),
**2026-07-30T09 – 2026-07-31T06 (22 h)**.

**Fix-Skizze (S–M):** dritter GitHub-Cron nach exakt dem Warm-Muster (stündlich, Commit-back in
`fixtures/`, gleicher shallow-sicherer Push-Loop). `scripts/capture-fixture.mjs` läuft bereits
headless unter Node (`npm run capture`). Der lokale Task bleibt als Fallback; identische
`validTime`-Dateinamen sind idempotent (Kommentar in `capture-hourly.ps1:3`). Zusätzlich
`npm run fusion:status` (`scripts/archive-status.mjs`) im Cron ausgeben, damit die Abdeckung
sichtbar wird. **Achtung Kosten:** +24 Commits/Tag ⇒ +24 Netlify-Rebuilds/Tag (§6) — deshalb
sollte dieser Cron `[skip ci]`-fähig sein bzw. gebündelt (z. B. 1 Commit alle 6 h mit 6 Dateien)
committen. **Risiko:** Cron-Anlage = STOPP & FRAGEN.

### Zusätzliche P0-Defekte, die §A noch nicht kennt

**A10 (neu) — Warm-Budget deckt nur 7 von 12 sichtbaren GRIB-Layern ab, und wärmt einen
unsichtbaren.**

`scripts/warm-grib.mjs:72-80` wärmt genau: `t_2m`, `vmax_10m`, `tot_prec`, `clcl`, `clcm`, `clch`,
`clct`. Die im Deck sichtbaren Layer sind aber (`src/MapView.tsx:3826-3876`): `nowcast`,
`thunder`, `rotation`, `snow`, `wind`, `gust`, `temp`, `sat`, `lightning`, `lightningfc`,
`stations`. Daraus:

| Layer (sichtbar) | GRIB-Param(e) | im Warm-Budget? | Folge |
|---|---|---|---|
| Temperatur | `t_2m` (+`hsurf`) | ✓ | Edge-HIT |
| Böen | `vmax_10m` | ✓ | Edge-HIT |
| **Gewitterpotenzial** | `cape_ml`, `cin_ml`, `lpi` (`MapView.tsx:1648`, `iconD2Thunder.ts:131`) | **✗** | Manifest-Miss → **Directory-Scan** + kalter Edge |
| **Blitz-Prognose** | `lpi_max` (`iconD2Lpi.ts:119`) | **✗** | dito |
| **Schnee** | `h_snow` / `snow_gsp` (`iconD2Snow.ts:161`) | **✗** | dito |
| **Rotation** | `uh_max`, `uh_max_low`, `sdi_2` (`iconD2Rotation.ts:149`) | **✗** | dito |
| Wolken | `clcl/clcm/clch/clct` | ✓ | **Toggle ist auskommentiert** (`MapView.tsx:3861`) → 52 Dateien/Lauf ≈ 28 MB werden für einen Layer gewärmt, den niemand einschalten kann |

Der Fallback ist funktional korrekt (`iconD2Precip.ts:112-116` dokumentiert ihn ausdrücklich),
aber teuer: pro unwarmed Layer ein ~157-KB-Directory-Listing (`live-network-audit.md` §3.3) plus
25 Origin-Fetches ohne Edge-HIT. Vier **sichtbare** Layer laufen also dauerhaft auf dem kalten
Pfad, während Warm-Budget in einen unsichtbaren Layer fließt. → V-INF-02.

**A11 (neu) — `warm-wind` friert die Step-Liste ein → Fern-Horizont des Windes fällt zeitweise
weg.**

`warm-wind.mjs:144` prüft im Early-Exit **nur** `existing.run === latest.run`. `warm-grib.mjs`
hat genau dafür bereits die Korrektur (`manifestCovers()`, `warm-grib.mjs:246-254`, begründet in
`warm-grib.mjs:14-19`: „ICON-D2 publiziert progressiv"). Beleg, dass der Fall real eintritt: der
im lokalen Klon liegende Manifest-Stand `public/latest-wind.json:4-10` = Lauf 2026072921 mit
**Steps [0,1,2,3,4]**, geschrieben 21:51Z — also 51 min nach Referenzzeit, als nur der nahe
Horizont publiziert war. Bis zum nächsten Lauf (~3 h später) bleibt das Manifest bei 0–4 stehen.

Client-Wirkung (`src/wind/iconD2WindSource.ts:340-343`): `wanted = manifest.steps.filter(s => s <= MAX_STEP)`
— der Zeit-Slider bekommt in diesem Fenster **nur 5 statt 13 Wind-Frames**. Es gibt keinen
Nachlade-Pfad, weil das Manifest als autoritativ gilt. Das ist eine **stille, zeitweise
Funktionsminderung** (Funktionserhalt-Direktive berührt) und war bisher nirgends dokumentiert.
**Fix (S):** `manifestCovers`-Äquivalent aus `warm-grib.mjs` nach `warm-wind.mjs` übernehmen —
~10 Zeilen, identisches Muster, keine Semantikänderung außer „auch neu publizierte Steps
nachwärmen". **Risiko:** Cron-Semantik ⇒ STOPP & FRAGEN. → V-INF-03.

**A12 (neu) — Die App zeigt die Abrufzeit als Datenstand aus (Ehrlichkeits-Defekt, D-04).**

Die Status-Pille der Karte rendert `Stand <fmtTime(s.ok.fetchedAt)>` (`MapView.tsx:3413-3431`).
`fetchedAt` ist für **alle GRIB-Layer** wörtlich `Date.now()` — `MapView.tsx:1496, 1564, 1602,
1629, 1648, 1667, 1692, 1712`. Die Lauf-Referenzzeit ist zu diesem Zeitpunkt vorhanden
(`resolveRunFromManifest` liefert `runAt`, `gribManifest.ts:110`; `resolveLatestRun` reicht sie
durch, `iconD2Precip.ts:119`), wird aber verworfen. Folge: Ein Nutzer, dessen Layer aus einem 9 h
alten Lauf stammt, liest „Stand 15:42" — die Uhrzeit, zu der *er* geladen hat. Das widerspricht
D-04 („Unsicherheit und Datenlücken werden ausgewiesen, nie kaschiert") und macht jeden
Cron-Ausfall für den Nutzer **unsichtbar**. → V-INF-04. Das ist zugleich der billigste Baustein
des Observability-Konzepts (§5).

---

## 4. Betriebs-Härtungsplan (Header/CSP konkret, SW, Edge, 404)

### 4.1 Security-Header — konkreter `public/_headers`-Entwurf

Es existiert **weder** `public/_headers` **noch** ein `[[headers]]`-Block in `netlify.toml`
(verifiziert). Der Host-Inventar für die CSP ist aus dem Code erhoben (Trennung nach
`fetch()`/XHR vs. reine Link-Ziele — Link-Ziele brauchen **keine** CSP-Direktive):

| Zweck | Hosts (aus dem Code) |
|---|---|
| Fonts (CSS) | `fonts.googleapis.com` (`index.html:11,13`) |
| Fonts (Dateien) | `fonts.gstatic.com` (`index.html:12`) |
| Basemap | `tiles.openfreemap.org` (`src/atmosphere/ThermalMap.tsx:59` u. a.) |
| DEM-Kacheln | `elevation-tiles-prod.s3.amazonaws.com` (`ThermalMap.tsx:24`), `s3.amazonaws.com` (`fusion/elevation.ts:16`, `route/enrichElevation.ts:13`) |
| WMS (Satellit, Blitze, Radar) | `maps.dwd.de` (`sources/dwdLightning.ts:10`, `dwdPrecipForecast.ts:23`) |
| Sat-Basemap Radar-Seite | `server.arcgisonline.com` (`radar/RadarMap.tsx:37,40`) |
| Punkt-Forecast/Obs | `api.brightsky.dev` (`pointForecast/sampleSources.ts:190`) |
| Multi-Modell | `api.open-meteo.com`, `ensemble-api…`, `previous-runs-api…`, `archive-api…`, `air-quality-api…` (`confidence/ensemble.ts:34`, `forecastHistory.ts:41`, `hitRate.ts:66`) |
| AT | `dataset.api.hub.geosphere.at` (`sampleSources.ts:281,357`) |
| CH | `data.geo.admin.ch` (`sources/iconChEpsSource.ts:30`) |
| Geocoding | `nominatim.openstreetmap.org` (`src/geocode.ts:24,42`, `SearchPage.tsx:287`) |
| Historie | `data.meteostat.net` (`history/meteostatSource.ts:25`) |
| Nachbar-Obs | `api.ipma.pt`, `dmigw.govcloud.dk`, `opendata-download-metobs.smhi.se` |
| **Nur Links, keine Requests** | `www.dwd.de`, `www.slf.ch`, `www.lawinen.report`, `www.lawinenwarndienst-bayern.de`, `www.avalanches.org`, `www.meteoschweiz.admin.ch`, `www.geosphere.at`, `www.nco.ncep.noaa.gov`, `github.com` |

`rgw.cscs.ch`, `meteofrance-pnt.s3.rbx.io.cloud.ovh.net`, `data.ecmwf.int`, `opendata.dwd.de`,
`noaa-gfs-bdp-pds.s3.amazonaws.com` laufen **same-origin** über Rewrites/Edge (nach A1-Fix
vollständig) und brauchen daher **keinen** CSP-Eintrag — ein zusätzliches Argument, A1 per Rewrite
statt per direktem CORS-Zugriff zu lösen.

**Entwurf (zunächst als `Content-Security-Policy-Report-Only`):**

```
/*
  Content-Security-Policy-Report-Only: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; child-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://tiles.openfreemap.org https://maps.dwd.de https://server.arcgisonline.com https://s3.amazonaws.com https://elevation-tiles-prod.s3.amazonaws.com; connect-src 'self' https://tiles.openfreemap.org https://api.brightsky.dev https://api.open-meteo.com https://ensemble-api.open-meteo.com https://previous-runs-api.open-meteo.com https://archive-api.open-meteo.com https://air-quality-api.open-meteo.com https://dataset.api.hub.geosphere.at https://data.geo.admin.ch https://nominatim.openstreetmap.org https://maps.dwd.de https://s3.amazonaws.com https://elevation-tiles-prod.s3.amazonaws.com https://data.meteostat.net https://api.ipma.pt https://dmigw.govcloud.dk https://opendata-download-metobs.smhi.se https://server.arcgisonline.com; manifest-src 'self'; upgrade-insecure-requests
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(self), notifications=(self), camera=(), microphone=(), payment=(), usb=(), serial=(), midi=(), xr-spatial-tracking=()
  Cross-Origin-Opener-Policy: same-origin
  X-Frame-Options: DENY
```

**Begründungen der heiklen Direktiven (jede am Code belegt):**
- `'wasm-unsafe-eval'` — `bzip2-wasm` instanziiert WebAssembly (Runtime-Dep, `package.json`);
  ohne diese Quelle bricht **jeder** GRIB-Decode. `'unsafe-eval'` wird **nicht** gebraucht.
- `worker-src 'self' blob:` — Vite-ESM-Worker (`vite.config.ts:69`) sind same-origin; MapLibre GL
  erzeugt seinen Worker je nach Bundling-Pfad aus einem Blob. `blob:` ist hier die
  Risiko-minimale Absicherung gegen einen schwer testbaren Regressionsfall.
- `style-src 'unsafe-inline'` — unvermeidbar: React setzt Inline-`style`-Attribute (z. B.
  `MapView.tsx:3560`), MapLibre injiziert `<style>`, die SEO-Seiten tragen ein Inline-`<style>`
  (`generate-seo.mjs:135-139`). Später härtbar über `style-src-elem` + Hashes; Attribute
  benötigen dann `style-src-attr 'unsafe-inline'`.
- `script-src` **ohne** `'unsafe-inline'` — verifiziert möglich: `index.html` hat keinen
  Inline-`<script>`; der einzige Inline-Block ist JSON-LD
  (`scripts/seo/content.mjs:210`, `type="application/ld+json"`), der nicht ausgeführt wird.
  **Genau das ist im Report-Only-Lauf zu bestätigen**, da einzelne Browser JSON-LD dennoch melden.
- `frame-ancestors 'none'` — **Achtung Abhängigkeit:** `architecture.md` §8 nennt einen
  Historie-`embed`-Pfad; falls Einbettung ein Produktziel ist (B2B/Embed, `roadmap.md` §D
  „Later"), muss das hier bewusst gelockert werden. **Offene Frage an Jan (§13).**
- `Permissions-Policy: geolocation=(self)` — die App nutzt Geolocation; `notifications` ist
  formal kein Permissions-Policy-Feature in allen Browsern, schadet aber nicht.

**Einführungsreihenfolge (verbindlich):** (1) Nur die unkritischen Header scharf
(`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`,
`Strict-Transport-Security` ohne `preload`). (2) CSP **Report-Only** deployen, dann alle 12
Einstiege + alle 12 Layer + Route-Upload + Historie + Globus mit offener Konsole durchklicken
(Chrome-DevTools-MCP, Desktop + Mobil) und die Meldungen protokollieren. (3) Erst danach scharf
schalten. (4) `preload` in HSTS **zuletzt** und nur nach der Domain-Entscheidung O-03 — ein
Preload-Eintrag ist praktisch nicht rückholbar. **Aufwand:** S für Schritt 1, M für 2–3.

**Hinweis:** `_headers` gilt für die statischen Antworten. Die Edge-Function-Antworten setzen
ihre Header selbst (`dwd-grib.ts:81-99`) und sind Binärdaten — dort ist zusätzlich
`X-Content-Type-Options: nosniff` sinnvoll (1 Zeile).

### 4.2 Service Worker — drei belegte Risiken

`public/sw.js` ist handgeschrieben, 96 Zeilen, `VERSION = 'v1'` (`sw.js:16`), registriert in
`src/main.tsx:14-16` nur in PROD.

1. **Manifest-Pinning durch den SW (Cache-Poisoning-Klasse „stale forever").**
   `ASSET_RE` (`sw.js:37`) enthält `json` → `/latest-grib.json` und `/latest-wind.json` gelten als
   „gehashtes Asset" und laufen über **stale-while-revalidate** (`sw.js:72-80`). Der Client fetcht
   sie zwar mit `cache: 'no-store'` (`gribManifest.ts:58`, `iconD2WindSource.ts:85`) — **das
   umgeht den Service Worker aber nicht**, `no-store` betrifft nur den HTTP-Cache. Folge: ein
   Wiederbesucher bekommt zuerst den *alten* Manifest-Stand und arbeitet den ganzen Ladevorgang
   mit einem veralteten Lauf ab; erst der nächste Besuch sieht den neuen. Der Code-Kommentar
   (`iconD2WindSource.ts:81-83`) kennt das Verhalten und bewertet es als „stale statt slow" —
   vertretbar, aber es ist **eine zusätzliche, unsichtbare Verzögerungsstufe** und es kollidiert
   mit dem 24-h-Staleness-Guard (ein SW-Stand von 23 h wird noch akzeptiert).
   **Fix (S):** Manifest-Pfade explizit von `isHashedAsset` ausnehmen (`sw.js:38-40`:
   `if (url.pathname.startsWith('/latest-')) return false;`) und network-first behandeln.
2. **Speicher-Sprengung durch den Daten-Cache.** Der Fallback-Zweig (`sw.js:83-95`) cacht **jede**
   sonstige GET-Antwort — inklusive der EPS-Dateien mit 11,5–15,3 MB (`live-network-audit.md`
   §3.2) und der GRIB-Bytes über `/_dwd_grib`. Deckel ist `DATA_MAX = 350` **Einträge**
   (`sw.js:20`), nicht Bytes. 350 Einträge × mehrere MB = **Gigabyte-Größenordnung**. Zusätzlich
   werden `opaque`-Antworten gecacht (`sw.js:87`), die in Chrome/Safari mit ~7 MB Padding auf das
   Quota angerechnet werden → 350 opake Einträge ≈ 2,4 GB Phantom-Quota. Konsequenz: Browser
   räumt den **gesamten** Origin-Speicher ab (inkl. IndexedDB-Wind-Cache, localStorage-Favoriten
   und -Einstellungen). `cache.put` scheitert still (`.catch(() => {})`, `sw.js:88`).
   **Fix (S):** Byte-Budget statt Eintrags-Budget; `/_dwd_grib`, `/_dwd_wind`, `/_dwd_opendata`
   und Antworten > 2 MB **nicht** in den SW-Cache (die App hat mit `icon-d2-grib-decompressed-v1`
   und `buscosun-wind` bereits eigene, bewusst dimensionierte Caches).
3. **Kein Kill-Switch, keine Versionierung pro Deploy.** `VERSION` ist eine Konstante; ein
   fehlerhafter SW bliebe bei Wiederbesuchern beliebig lange aktiv. `skipWaiting()` +
   `clients.claim()` (`sw.js:23,33`) sind gesetzt, d. h. ein neuer SW übernimmt sofort — das ist
   gut, hilft aber nur, wenn `/sw.js` selbst nicht aus dem HTTP-Cache kommt.
   **Fix (S):** `Cache-Control: no-cache` für `/sw.js` im `_headers`-Block; `VERSION` beim Build
   aus dem Commit-Hash setzen (der SEO-Generator läuft ohnehin post-build).

### 4.3 Edge-Functions — Review-Ergebnis

**Positiv verifiziert (keine Findings):**
- Methodenprüfung `GET|HEAD` (`dwd-grib.ts:60-62`), Whitelist zweier Präfixe (`:32,52`),
  Suffix-Zwang `.grib2.bz2` (`:53`), Traversal-Check (`:55`).
- **Traversal ist nicht ausnutzbar.** Ich habe die naheliegende Umgehung `%2e%2e` geprüft: die
  `URL`-Normalisierung kollabiert prozent-kodierte Dot-Segmente **bevor** `url.pathname` gelesen
  wird — der Pfad verlässt dadurch das erlaubte Präfix und wird mit 400 abgewiesen (lokal
  reproduziert). Der `includes('..')`-Check ist damit redundant, aber harmlos. **Kein Defekt.**
- Fehler werden nie durable gecacht (`dwd-grib.ts:87-92`), 502 bei Upstream-Ausfall mit
  `no-store` (`:72-79`) — der Client fällt sauber auf Manifest/Scan zurück.
- Response-Header-Allowlist (`:40,82-85`) verhindert das Durchsickern von `Set-Cookie` u. Ä.

**Zwei echte Härtungslücken:**

1. **Query-String-Passthrough fragmentiert den Cache** (`dwd-grib.ts:56`, `dwd-wind.ts:53`:
   `${DWD_ORIGIN}/${rest}${url.search}`). Die Zieldateien sind immutabel und brauchen **nie**
   eine Query. Ein Dritter kann mit `?a=1`, `?a=2`, … beliebig viele **separate** Durable-Cache-
   Einträge derselben 15-MB-Datei erzeugen und dafür jedes Mal einen Origin-Fetch bei DWD
   auslösen. Kein Client-Code sendet Queries auf diesen Pfaden (`fetchStepBytes`,
   `iconD2Precip.ts:208 ff.`). **Fix (S, 1 Zeile):** `url.search` weglassen bzw. Requests mit
   Query mit 400 abweisen.
2. **Offener Bandbreiten-Verstärker.** Die Funktionen proxen **den kompletten** ICON-D2- und
   ICON-D2-EPS-Baum von opendata.dwd.de für jedermann — ohne Origin-/Referer-Prüfung, ohne
   Rate-Limit, ohne Größenobergrenze. Der EPS-Baum enthält Dateien à 11–15 MB in großer Zahl;
   ein einzelner Skript-Kiddie kann damit in Minuten zweistellige Gigabyte durch buscosuns
   Netlify-Konto ziehen (Kostenwirkung §6). Das ist die **teuerste** offene Flanke des Systems.
   **Fix (S–M):** (a) `Sec-Fetch-Site: same-origin` bzw. `Origin`/`Referer` gegen die eigene
   Domain prüfen und Fremdanfragen mit 403 beantworten — die App fragt ausschließlich
   same-origin an, also ist das funktionsneutral; (b) zusätzlich Netlify Rate Limiting je IP,
   falls im gebuchten Plan verfügbar. **Risiko:** Edge-Semantik ⇒ STOPP & FRAGEN; (a) ist
   verifizierbar über `scripts/verify-layer-transport.mjs` (Header mitschicken).

### 4.4 404 / SPA-Catch-all → Fix in §3 A6 beschrieben (2 Zeilen, Preview-Gate).

---

## 5. Observability-Konzept ohne Tracking + Entscheidungsvorlage O-06

**Leitplanke:** D-02 (trackerfrei) bleibt **absolut** unangetastet. Alles Folgende misst
**Systeme**, nicht Menschen: kein Cookie, kein Identifier, keine IP-Speicherung, kein JS im
Nutzer-Browser, das nach außen sendet — mit der einzigen, ausdrücklich als opt-in markierten
Ausnahme in Baustein 5.

### 5.1 Baustein 1 — Cron-Health mit echtem Alarm (P0, S)

*Problem:* Der Fail-Safe ist still, der Run bleibt grün (§3 A3).

*Lösung, zweistufig:*
- **Selbstprüfung im Warmer:** nach dem Schreiben prüfen, ob `runAt` des Manifests jünger als
  6 h ist; sonst `::error::` + Exit 1. Kostet 5 Zeilen YAML, macht den stillen Fail-Safe sichtbar
  und löst GitHubs eingebaute Fehler-Mail an Jan aus (kein zusätzlicher Dienst!).
- **Unabhängiger Wächter-Cron** (`.github/workflows/health.yml`, stündlich): holt
  `https://buscosun.com/latest-grib.json` und `/latest-wind.json`, prüft `runAt`-Alter (< 9 h),
  `warmedThroughProxy` (muss die Prod-Domain sein — hätte die Merge-Regression vom 22.07. sofort
  gemeldet) und Step-Vollständigkeit je Param. Bei Verletzung Exit 1.
  **Wichtig:** unabhängiger Workflow, damit auch ein *komplett ausgefallener* Warmer auffällt —
  ein Wächter im Warmer selbst schweigt genau dann, wenn der Warmer schweigt.

*Kosten:* 0 € (öffentliches Repo ⇒ GitHub-Actions-Minuten frei; verifiziert: `total_count` 703
Runs ohne Kostenhinweis, API ohne Auth erreichbar ⇒ Repo ist öffentlich). Benachrichtigung über
GitHubs Standard-Mail bei fehlgeschlagenen geplanten Workflows.

### 5.2 Baustein 2 — Synthetische Uptime-/Latenzsonde (P1, S)

*Was prüfen:* (a) `GET /` → 200 + HTML enthält `<div id="root">`; (b) `GET /latest-grib.json` →
gültiges Schema + frisch; (c) **ein** `GET` auf eine im Manifest gelistete `/_dwd_grib`-Datei mit
`Range: bytes=0-1023` → prüft Status **und** liest den `Cache-Status`-Header aus, d. h. es misst
direkt die **Edge-HIT-Quote** — die einzige Metrik, die den ganzen T1/T2-Aufwand rechtfertigt;
(d) `GET /wetter/muenchen/` → 200 (SEO-Bäume leben); (e) nach A6-Fix: `GET /gibtsnicht` → **404**.

*Von wo:* aus dem GitHub-Actions-Runner (Azure, EU/US gemischt) — für Verfügbarkeit ausreichend,
für Latenz-Aussagen aus DACH-Sicht nicht repräsentativ. Wer echte Endnutzer-Latenz will, braucht
einen externen Prober (UptimeRobot Free: 50 Monitore/5 min, 0 €; Better Stack Free: 10 Monitore).
**Empfehlung:** Actions-Sonde als Basis (0 €, im Repo versioniert, kein Drittkonto), externer
Free-Monitor optional obendrauf für „Site komplett down" — denn wenn GitHub ausfällt, fällt auch
die Sonde aus.

*Kosten:* 0 €. *Datenschutz:* keinerlei Nutzerbezug.

### 5.3 Baustein 3 — Sichtbares Frische-Badge in der App (P1, S) — der Ehrlichkeits-Hebel

Die Information ist **bereits im Client** und wird verworfen (§3 A12): `resolveRunFromManifest`
liefert `runAt` (`gribManifest.ts:110`), `resolveLatestRun` reicht es durch
(`iconD2Precip.ts:119`), die Status-Pille zeigt stattdessen `Date.now()`
(`MapView.tsx:1602` u. a., gerendert `MapView.tsx:3425`).

*Vorschlag:* `updateStatus` um ein Feld `runAt` erweitern; die Pille zeigt
„Temperatur · ICON-D2 · **Lauf 12z (vor 3 h)**" statt „Stand 15:42". Ab einem Schwellwert
(> 9 h) zusätzlich ein ehrlicher Hinweis („Daten älter als üblich"). Command-Deck-konform
(D-27) — es ist dieselbe Pille, nur mit dem richtigen Zeitstempel.

*Wirkung:* (a) D-04 wird eingehalten; (b) jeder Betriebsausfall wird **für Nutzer und Jan
gleichzeitig** sichtbar — das ist Monitoring ohne einen einzigen Datenpunkt über Nutzer; (c) es
ist ein Differenzierungsmerkmal gegen Wettbewerber, die nie sagen, wie alt ihre Zahlen sind.

### 5.4 Baustein 4 — Upstream-Kontrakt-Monitor (P1, M)

`architecture.md` §4 benennt die Fragilität ausdrücklich: DWD-Verzeichnislayout, RADOLAN-Header,
DE1200-Eckkoordinaten sind reverse-engineerte Konstanten, die **still** brechen. Es existieren
bereits ~30 `verify:*`-Skripte, die exakt das prüfen — sie laufen nur nie automatisch (V-11).

*Vorschlag:* ein täglicher `contracts.yml`-Cron, der die **netzabhängigen** Verifier bündelt
(`verify:layer-transport`, `verify:precip-source`, `verify:eps`, `verify:ch-eps`,
`verify:arome-fr`, `verify:icon-eu`, `verify:gfs-2d`, `verify:ifs`, `verify:aifs`,
`verify:icon-global`, `verify:aicon`, `verify:arpege`, `verify:thunder`, `verify:lpi`,
`verify:snow`, `verify:rotation`) und **nur** bei Fehlschlag rot wird. Wichtig: Upstream-Churn
(DWD-Publikationsfenster) erzeugt Fehlalarme (`agents.md` §7) → als **nicht-blockierender**
Nightly führen, nicht als PR-Gate, und mit einer Wiederholung nach 30 min entprellen.
Abgrenzung zu O-02/V-11: V-11 ist das PR-Gate (netzfrei), dies ist der Nightly (netzabhängig) —
zusammen ergibt das die volle Abdeckung.

### 5.5 Baustein 5 — Optionaler Fehler-Beacon (P3, S) — nur mit ausdrücklichem Opt-in

*Falls überhaupt:* ein `window.onerror`/`unhandledrejection`-Handler, der **nur nach expliziter
Zustimmung** (Schalter in den Einstellungen, Default AUS, klar beschriftet) eine minimale
Meldung an einen eigenen Endpunkt schickt: `{ message, stack (nur eigene Dateien), buildHash,
route, userAgentFamily }` — **keine** IP-Speicherung, keine ID, keine Koordinaten, keine
Session-Verkettung, 14 Tage Aufbewahrung. Braucht einen Endpunkt ⇒ **abhängig von O-01 Option B**.
*Empfehlung:* zurückstellen, bis Option B ohnehin existiert; bis dahin sind Console-Sauberkeit im
Gate und die Sonden ausreichend.

### 5.6 Entscheidungsvorlage O-06

| | **A — Status quo (nichts)** | **B — Betriebs-Monitoring, keine Nutzerdaten** | **C — Privacy-erhaltendes RUM, selbst gehostet** |
|---|---|---|---|
| Umfang | — | Bausteine 1–4 (+5 optional später) | zusätzlich aggregierte Feld-Metriken (LCP/INP/CLS, Fehlerraten) |
| Kosten | 0 € | **0 €** (GitHub-Actions frei bei öffentlichem Repo) | 5–15 €/Monat (VPS für Plausible/Umami/self-hosted CrUX-Sammler) + Setup |
| Datenschutz-Wirkung | keine | **keine** — es werden ausschließlich eigene Systeme geprüft; D-02/D-03 unberührt; keine Datenschutzerklärungs-Änderung nötig | Grenzfall: auch cookielose Aggregation erhebt Gerätedaten ⇒ DSGVO-Prüfung, Datenschutzerklärung, Marketing-Aussage „trackerfrei" muss umformuliert werden |
| Betriebsaufwand (Bus-Faktor 1) | 0 | +3 YAML-Dateien, keine neue Plattform | +1 Server, +Updates, +Backups, +Angriffsfläche |
| Erkennt Cron-Ausfall? | **nein** | ja, < 1 h | ja |
| Erkennt Prod-Regression? | nein | ja (Sonde) | ja + Nutzerwirkung messbar |
| Widerspruch zu D-02 | nein | **nein** | ja (dem Buchstaben nach nein, dem Versprechen nach diskutabel) |

**Empfehlung: B**, sofort und vollständig; **C ablehnen**, solange die Nutzerbasis keine
statistisch belastbaren RUM-Daten liefert und „trackerfrei" ein Marketing-Asset ist. Baustein 3
(Frische-Badge) ist dabei der wichtigste Einzelposten, weil er Monitoring **ins Produkt** verlegt
statt in ein Dashboard, das niemand ansieht — passend zum Ein-Personen-Betrieb.

---

## 6. Skalierbarkeit & Kosten (quantifiziert, Annahmen offengelegt)

### 6.1 Verifikation der Ausgangszahlen

Aus `audit/live-network-audit.md` §3.2/§3.3, gemessen 2026-07-22, Chrome DevTools MCP, Prod:
- **Session-Gesamtverkehr 1 320 Requests / ~354 MB** ✓ (§3.2, Schlusszeile) — enthält Baseline
  **und alle 12 Toggles**, ist also eine *Obergrenze*, keine typische Sitzung.
- **Temperatur-Toggle (Fusion/EPS): 397 Requests / ~194,6 MB, davon EPS 17 Dateien = 191,98 MB** ✓
  (§3.2 Zeile „Temperatur"). Die vom Auftrag genannten „~195 MB für ein Fusion-Toggle" sind
  bestätigt.
- Baseline-Kaltload 215 Requests / ~32 MB messbar + 5–13 MB DEM (§3.1).

### 6.2 Was davon Netlify abrechnet (Annahme: Bandbreite = same-origin-Auslieferung)

| Posten | MB | Route |
|---|---|---|
| App-Shell + Assets | 0,54 | `/assets/` |
| Manifest | ~0,001 | `/latest-grib.json` |
| t_2m 0–24 (lädt **eager**, auch ohne aktiven Temperatur-Layer, §3.1) | 24,5 | `/_dwd_grib` |
| hsurf | 0,66 | `/_dwd_grib` |
| **Karte ohne jeden Toggle** | **≈ 25,7** | |
| + Wind | +26,1 | `/_dwd_wind` |
| + Böen | +27,2 | `/_dwd_grib` |
| + Niederschlag (tot_prec-Anteil) | +26,2 | `/_dwd_grib` |
| + Temperatur-Toggle (EPS/Fusion) | **+192** | `/_dwd_grib` |

Extern (Basemap 2,1 MB, DEM 5–13 MB, brightsky, MeteoSwiss, GeoSphere, WMS) kostet buscosun
**nichts** — belastet aber fremde Free-Tiers (GeoSphere-Rate-Limit 240/h ist im Audit §3.2
dokumentiert und ein eigenes Skalierungsrisiko: bei wachsender Nutzerzahl greift es *pro Client*,
nicht pro Site, solange es client-seitig bleibt — ein Argument **für** D-01).

### 6.3 Der bislang unbeachtete Hauptposten: der Warm-Cron selbst

Der Warmer holt jede Datei **durch die eigene Edge** (`warm-grib.mjs:233,237`) — jeder gewärmte
Byte ist damit **Netlify-Egress**, auch wenn er aus dem Cache kommt.

| Familie | Dateien je Advance | Bytes (aus Audit-Messungen) |
|---|---|---|
| 2D (t_2m 25, vmax 25, tot_prec 28, clc* 52) + hsurf | 131 | ≈ **107 MB** |
| EPS (5 Params × Steps 0/3/6) + clat/clon | 17 | ≈ **193 MB** |
| Wind (u/v × 0–12) | 26 | ≈ **27 MB** |

Kritisch: `warm-grib.mjs:301-302` baut die Task-Liste über **alle** Steps, sobald *irgendein* Step
fehlt — es wird also bei jedem Advance der **komplette** Lauf erneut durchgezogen, nicht nur das
Delta. Bei ~15 grib- und ~6 wind-Advances/Tag (§2.4):

> **2D:** 15 × 107 MB ≈ 1,6 GB/Tag · **EPS:** ~8 × 193 MB ≈ 1,5 GB/Tag · **Wind:** 6 × 27 MB ≈ 0,16 GB/Tag
> **⇒ ≈ 3,3 GB/Tag ≈ 100 GB/Monat — allein durchs Wärmen, vor dem ersten Besucher.**

Dazu **~660 Netlify-Builds/Monat** (§2.4). Bei geschätzt 2–3 min pro Build (`tsc -b` + `vite build`
+ `generate-seo.mjs`, plus Klon eines 353-MB-Repos) sind das **1 300–2 000 Build-Minuten/Monat**.

### 6.4 Hochrechnung (Annahmen explizit)

**Annahmen:** 1 Sitzung je Nutzer und Monat; Nutzungsmix 60 % „nur Karte", 30 % „Karte + 2 Layer",
10 % „Fusion/Temperatur-Toggle"; keine Wiederbesuchs-Ersparnis (konservativ, der IndexedDB-/
Cache-API-Reuse würde helfen); Warm-Traffic konstant 100 GB/Monat.

Ø je Sitzung = 0,6 × 25,7 + 0,3 × 79 + 0,1 × 271 ≈ **66 MB**.

| Nutzer/Monat | Nutzer-Traffic | + Warm | **Gesamt** | Einordnung |
|---|---|---|---|---|
| 1 000 | 66 GB | 100 GB | **166 GB** | Free-Kontingent (100 GB) bereits **allein durch den Cron** überschritten |
| 10 000 | 660 GB | 100 GB | **760 GB** | knapp innerhalb eines 1-TB-Pakets |
| 100 000 | 6 600 GB | 100 GB | **6,7 TB** | ~5,7 TB Overage |

**Preisangaben — zu verifizieren** (nicht aus dem Repo belegbar, Stand meiner Kenntnis, Jan möge
die Netlify-Rechnung gegenprüfen): Free ~100 GB Bandbreite + ~300 Build-Minuten/Monat; Pro
~19 $/Monat/Platz mit ~1 TB Bandbreite + ~25 000 Build-Minuten; Zusatzbandbreite in der
Größenordnung 55 $ je 100 GB. Bei diesen Zahlen:

- **Heute (kleine Nutzerzahl):** Der **Build-Minuten**-Verbrauch (1 300–2 000/Monat) sprengt das
  Free-Kontingent (300) um Faktor 4–7. Falls buscosun.com auf Free läuft, ist der Betrieb bereits
  jenseits des Kontingents — **das ist die dringendste Kostenfrage und in 5 Minuten in der
  Netlify-Abrechnung prüfbar (§13).**
- **100 000 Nutzer:** ~5,7 TB Overage ⇒ Größenordnung **1 200–3 100 $/Monat**. Die Architektur
  ist bei dieser Größe **nicht** mehr „kostenfrei skalierend" wie D-01 behauptet.

### 6.5 Hebel, gerankt nach gesparten MB je Aufwandseinheit

| # | Hebel | Ersparnis | Aufwand | Bemerkung |
|---|---|---|---|---|
| 1 | **Wolken aus dem Warm-Budget** (`warm-grib.mjs:76-79`) — Toggle ist auskommentiert (`MapView.tsx:3861`) | 52 Dateien/Advance ≈ 28 MB × 15/Tag ≈ **12 GB/Monat**, 0 Nutzerwirkung | **S** (4 Zeilen) | STOPP & FRAGEN (Cron-Semantik); rückgängig, sobald der Layer zurückkommt |
| 2 | **Delta-Wärmen statt Voll-Wärmen** (`warm-grib.mjs:301-302`: nur Steps warmen, die das Manifest noch nicht hat) | schätzungsweise **60–70 % des 2D-Warm-Traffics ≈ 30 GB/Monat** | **S–M** | Trade-off: die Durable-TTL (6 h, `dwd-grib.ts:36`) wird nicht mehr aufgefrischt — bei ~3-h-Laufrhythmus unkritisch, aber zu verifizieren |
| 3 | **Edge gegen Fremdnutzung schließen** (§4.3) | unbekannt, potenziell unbegrenzt | **S** | verhindert den einzigen unbegrenzten Kostenposten |
| 4 | **Manifest über Netlify Blobs statt Commit-back** (T2c-3, `audit/layer-transport.md` §J.1) | **~660 Builds/Monat → ~5** | **M** | löst gleichzeitig Race, Branch-Protection-Abhängigkeit und die Merge-Regressions-Klasse |
| 5 | **T2b-4: EPS-Vor-Resampling im Cron** | **192 MB je Fusion-Sitzung** + **45 GB/Monat** Warm; zusätzlich fällt der teure ikosaedrische Client-Decode (542 k Zellen) weg | **L** | Output-**Äquivalenz**-Beweis Pflicht (§H.2); der einzige Hebel, der die Fusion-Last strukturell bricht |
| 6 | **Near-Horizon-Staffelung 2D** (`live-network-audit.md` §4.6) | ~17 MB je Sitzung (t_2m 24,5 → ~7 MB bis zum ersten Bild) | **M** | größter Hebel auf die *gefühlte* Ladezeit, v. a. mobil |
| 7 | **Vor-Resampling auch für 2D** (25 GRIB-Dateien → ein kompaktes Artefakt) | ~23 MB je Sitzung | **L** | gleiche Äquivalenz-Beweispflicht wie 5 |
| 8 | **T2-7 per-Layer-IndexedDB** | nur Wiederbesuche | **M** | wirkt nicht auf Erstbesucher — deshalb nachrangig gegenüber 5/6 |
| 9 | Fusion-Lade-Timing entkoppeln (Temperatur-Toggle ≠ EPS) | 192 MB für alle, die keine Fusion brauchen | S technisch | **⛔ STOPP & FRAGEN** — Fusion-Verhaltensänderung, hier nur benannt |

**Kern-Aussage für den Masterplan:** Die Wette „statisch = kostenlos skalierend" (D-01) hält bis
etwa **10 000 Nutzer/Monat**. Darüber entscheidet **T2b-4** (Hebel 5) darüber, ob buscosun
bezahlbar bleibt. Die Hebel 1–4 sind dagegen *heute* relevant und zusammen an einem Tag machbar.

---

## 7. Entscheidungsvorlage O-01 (Backend) — Optionen A/B/C mit Empfehlung

### Ausgangslage (belegt)

`src/notifications` ist vollständig gebaut **bis auf den Transport**: der Vertrag steht
(`notificationBackend.ts:47-60` `PushBackend`), die Auslöse-Logik ist **pur und DOM-frei** und
läuft laut Modul-Header „derselbe Code … in einem Node-/Edge-Worker"
(`notificationBackend.ts:14-17`), die Anbindung ist als Einzeiler vorgesehen
(`notificationBackend.ts:23`). Was fehlt, ist ausschließlich: Subscriptions speichern +
periodisch auswerten + Web-Push senden.

**Wie klein der Schritt tatsächlich ist:** buscosun betreibt **bereits** serverseitige Rechenzeit —
zwei Netlify Edge Functions (`netlify/edge-functions/`) und zwei GitHub-Crons, die stündlich
hunderte HTTP-Requests fahren und in ein Repo zurückschreiben. „Kein Backend" ist bei genauer
Betrachtung schon heute „kein *Zustands*-Backend". Option B fügt **einen** Zustand hinzu: eine
Liste von Push-Endpunkten.

### Option A — „client-only bleibt" (D-01 unverändert)

*Was bleibt unmöglich:* echtes Push bei geschlossener App (V-16), Warn-Alerting, Accounts/Sync
über Geräte hinweg, B2B-API/Embed-Produkte mit Kontingenten, serverseitiges Vor-Rechnen
(T2b-4 wäre über den Cron trotzdem möglich!), opt-in Fehler-Beacon (§5.5).
*Kosten:* 0 €/Monat zusätzlich. *Datenschutz-Story:* makellos, unverändert.
*Wartungslast:* unverändert.
*Preis:* Der laut `docs/zielgruppen-dach.md` **größte Einzelhebel** (Push für Pendler, Gärtner,
Winterdienst, Events) bleibt strukturell verschlossen — und `src/notifications` (~1 500 LOC)
bleibt dauerhaft Blindleistung.

### Option B — „Minimal-Backend": ein Endpunkt + ein Cron

*Architektur (bewusst so klein wie möglich):*
1. **Eine** Netlify Function `/api/push` (POST subscribe / DELETE unsubscribe). Speichert in
   **Netlify Blobs** (Key-Value, im Netlify-Plan enthalten, keine eigene DB, kein Server):
   `{ id, endpoint, keys.p256dh, keys.auth, rules[], lat, lon, createdAt }`.
2. **VAPID-Schlüsselpaar** als GitHub/Netlify-Secret; Web-Push ist ein W3C-Standard, der Versand
   ist ein signierter POST an den vom Browser gelieferten Endpunkt (Mozilla/Google/Apple) — kein
   Drittanbieter, kein Firebase.
3. **Ein GitHub-Cron** (`push-tick.yml`, stündlich) — **exakt das Muster, das seit 2026-07-18
   produktiv läuft**: lädt die Subscriptions, ruft die bereits puren
   `getPointForecast`/`evaluateSubscription` auf (`notificationBackend.ts:18-22`) und sendet
   fällige Push-Nachrichten.
4. Client: `createHttpPushBackend(...)` statt `NULL_BACKEND` injizieren — **hinter einem Flag,
   default aus** (D-11).

*Kosten:* im bestehenden Netlify-Plan enthalten (Functions + Blobs). Bei 10 000 Abos × 24 Ticks =
240 000 Auswertungen/Monat — die teure Größe ist der Punkt-Forecast je Abo; deshalb: Koordinaten
auf ~5 km runden und Forecasts pro Raster-Zelle **einmal** berechnen (spart Größenordnungen und
ist zugleich Datenminimierung). Realistisch **0–10 €/Monat** zusätzlich.

*Datenschutz — was sich ehrlich ändert:* Erstmals liegen Daten mit Personenbezug auf einem Server
(Push-Endpoint = pseudonyme Geräte-Adresse, plus ungefährer Ort). Konsequenzen: Datenschutz-
erklärung nötig (**ist ohnehin überfällig**, `roadmap.md` §B10 nennt das fehlende Impressum/DSGVO-
Dokument bereits), AV-Vertrag mit Netlify, Löschkonzept (Abbestellen = sofortige Löschung;
Endpunkte, die der Push-Dienst mit 410 quittiert, automatisch entfernen). **D-02 bleibt
unberührt** (kein Tracking, keine Analytik), **D-03 bleibt unberührt** (kein Account — die
Subscription *ist* die Identität und lebt im Browser). Die Marketing-Zeile „OHNE ACCOUNT" bleibt
wahr; „ohne Backend" müsste zu „ohne Account, ohne Profil" präzisiert werden.

*Wartungslast Bus-Faktor 1:* +1 Function, +1 Cron, +1 Secret-Rotation. Gemessen an vier bereits
laufenden Betriebsartefakten: **etwa +30 %**, nicht +300 %. Größtes Restrisiko: ein
Push-Versand-Bug erreicht Nutzer *außerhalb* der App und ist nicht per Deploy zurücknehmbar →
striktes Rate-Limit je Abo und ein globaler Kill-Switch (Blob-Flag) sind Pflichtbestandteil.

*Was B zusätzlich freischaltet (ohne Mehrkosten):* Manifest-Publikation über Blobs (Hebel 4 in
§6.5 — spart ~655 Builds/Monat), opt-in Fehler-Beacon (§5.5), später ein Embed-/B2B-Endpunkt.

### Option C — „volles Backend": Accounts, Sync, B2B-API

*Umfang:* Auth (E-Mail/OAuth), Datenbank, Sync-Protokoll, Rate-Limiting, Abrechnung, Support.
*Kosten:* 50–200 €/Monat (Managed-DB, Auth-Dienst, Logging) plus der eigentliche Posten:
**Zeit**. Auth und DSGVO-Pflichten (Auskunft, Löschung, Datenpannen-Meldung) sind Dauerlast, kein
Projekt.
*Widerspruch:* verletzt D-03 direkt und beschädigt die D-02-Positionierung („trackerfrei, ohne
Account" ist laut `decisions.md` D-03 **explizites Produktprinzip** und laut `roadmap.md` §C eine
der vier Differenzierungsachsen).
*Bus-Faktor:* bei einem Maintainer nicht verantwortbar — ein Account-System braucht garantierte
Reaktionszeiten (Passwort-Reset, Löschanfragen, Sicherheitslücken).

### Empfehlung

**Option B, gestaffelt und flag-gated — aber erst nach den §A-Defekten und nach der
Datenschutzerklärung.** Begründung:
1. Sie löst den größten dokumentierten Zielgruppen-Hebel (V-16) und macht ~1 500 LOC fertigen
   Code endlich nutzbar.
2. Sie kostet praktisch nichts und nutzt **exakt** das Betriebsmuster, das Jan bereits
   beherrscht (Cron + Manifest + Secret).
3. Sie bricht **keine** der vier Differenzierungsachsen: kein Tracking, kein Account, kein
   Paywall.
4. Sie ist umkehrbar: Flag aus, Function löschen, Blob leeren — der Client fällt auf
   `NULL_BACKEND` zurück.
**A** bleibt bis dahin die gültige Grundlage. **C** ablehnen, solange Bus-Faktor 1 gilt.

*Reihenfolge-Vorschlag:* §A-Defekte → Datenschutzerklärung/Impressum → B als „Push-Pilot" mit
einem einzigen Trigger-Typ (z. B. Frost-Warnung) und ≤ 100 Abos → Auswertung → Ausbau.

---

## 8. Entscheidungsvorlage O-03 (Domain) — Belege + Migrations-Checkliste + Empfehlung

### 8.1 Vollständige Belegliste (ohne `audit/`, `docs/`, `dist/`, `node_modules/`)

**`buscosun.app`:**
| Datei:Zeile | Inhalt | Wirkung |
|---|---|---|
| `scripts/seo/content.mjs:13` | `url: 'https://buscosun.app'` | **Quelle aller Canonicals, JSON-LD, OG-URLs, Sitemap-Einträge** |
| `public/robots.txt:45` | `Sitemap: https://buscosun.app/sitemap.xml` | Crawler-Steuerung zeigt auf Fremd-Domain |
| `public/robots.txt:46` | `Sitemap: https://buscosun.app/sitemap-news.xml` | dito |
| `public/llms.txt:6,7,8,9,10,11,14,15,16,17` | 10 Links auf `https://buscosun.app/...` | GEO-/LLM-Zitierbarkeit auf der falschen Domain |
| `public/_og-card.html:55` | `<span>buscosun.app</span>` | Domain im gerenderten OG-Bild |
| `src/event/icsExport.ts:137` | `…@buscosun.app` als ICS-UID-Domain | kosmetisch, aber in exportierten Kalendereinträgen sichtbar |
| `src/notifications/notificationBackend.ts:23` | `createHttpPushBackend('https://api.buscosun.app')` | nur Kommentar/Beispiel — bei O-01 B mitziehen |

**`buscosun.com`:**
| Datei:Zeile | Inhalt |
|---|---|
| `public/latest-grib.json:5` | `"warmedThroughProxy": "https://buscosun.com/_dwd_grib"` (vom Cron geschrieben, aus Repo-Variable `SITE_URL`) |
| `public/latest-wind.json:12` | `"warmedThroughProxy": "https://buscosun.com/_dwd_wind"` |
| `src/feedback/FeedbackPage.tsx:5,28` | Kontaktadresse `contact@buscosun.com` |

Zusätzlich außerhalb des Repos: **Repo-Variable `SITE_URL`** (`warm-grib.yml:50`,
`warm-wind.yml:52`) steht auf `https://buscosun.com` (bewiesen durch die Manifest-Inhalte). Die
Warm-Crons wärmen also den Edge-Cache von **.com**.

### 8.2 Empfehlung: **buscosun.com** als kanonische Domain

Begründung: (1) Der **Betrieb** läuft bereits vollständig auf .com — Warm-Crons, Edge-Cache,
Manifeste; ein Wechsel auf .app hieße, die produktive Cache-Kette umzuhängen (höheres Risiko als
Textänderungen). (2) Die **Kontaktadresse** ist `@buscosun.com` — Marke und Kommunikation zeigen
dorthin. (3) `roadmap.md` §E führt „buscosun.com ist die Zieldomain" bereits als Arbeitsannahme.
(4) `.com` ist für ein DACH-Publikum das erwartete, vertrauenswürdigere TLD; `.app` erzwingt
zudem HTTPS-Preload (kein Nachteil, aber auch kein Vorteil).
**Gegenargument, ehrlich benannt:** Wenn `buscosun.app` bereits SEO-Historie/Backlinks hat, wäre
ein Wechsel ein temporärer Rankingverlust. Das ist **nur mit Search-Console-Daten entscheidbar**
(§13) — die Empfehlung steht unter diesem Vorbehalt.

### 8.3 Migrations-Checkliste (für die gewählte Domain, hier .com)

1. **Netlify:** .com als Primärdomain setzen; .app als Alias behalten. Netlify erzeugt für
   Nicht-Primärdomains automatisch 301 — **verifizieren**, nicht annehmen.
2. `scripts/seo/content.mjs:13` → `https://buscosun.com`. Das ist die **einzige** Codestelle für
   Canonicals/JSON-LD/Sitemaps (`SITE.url` wird in `generate-seo.mjs` durchgereicht).
3. `public/robots.txt:45,46` → .com.
4. `public/llms.txt` — alle 10 Links → .com.
5. `public/_og-card.html:55` → `buscosun.com`; OG-Bilder in `public/og/` neu rendern.
6. `src/event/icsExport.ts:137` → `@buscosun.com` (UID-Domain; alte UIDs bleiben gültig, nur neue
   Exporte ändern sich — kein Bruch).
7. `npm run verify:seo` (`scripts/seo/verify-seo.mjs`) laufen lassen — es existiert bereits ein
   SEO-HTML-Gate (`architecture.md` §11).
8. **Google/Bing Search Console:** beide Properties anlegen, Adressänderung einreichen, Sitemaps
   auf .com neu einreichen, 301-Kette auf Weiterleitungsschleifen prüfen.
9. **HSTS-`preload` erst danach** (§4.1) — nach dem Preload ist ein Domainwechsel deutlich
   teurer.
10. Externe Referenzen mitziehen: `manifest.webmanifest` (`start_url` prüfen), Social-Profile,
    ggf. Repo-Beschreibung.
11. `SITE_URL`-Repo-Variable **unverändert lassen** (steht schon korrekt) — sie darf nie auf eine
    Domain zeigen, die per 301 weiterleitet, sonst wärmt der Cron den Edge-Cache der falschen
    Domain.

**Aufwand:** S (ein halber Tag inkl. Search-Console). **Risiko:** niedrig technisch, mittel
SEO-seitig (siehe Vorbehalt 8.2). **Reihenfolge:** vor V-07/HSTS-Preload und vor jeder größeren
SEO-Investition.

---

## 9. Betriebs-Runbook-Vorschlag (Bus-Faktor 1)

**Kein fertiges Dokument, sondern der Vorschlag für `docs/runbook.md`** (Umsetzung als eigene
Phase, ~1 Tag). Begründung: Es gibt heute **keine** Stelle, an der steht, was zu tun ist, wenn
etwas kaputtgeht — die Betriebslogik lebt in Audit-Protokollen, die als Historie geschrieben sind.

**Struktur (Vorschlag):**

**§1 Systemkarte auf einer Seite** — was läuft wo: Netlify (Site, 2 Edge Functions, Rewrites),
GitHub (2+n Crons, Repo-Variable `SITE_URL`, Bot-Identität `buscosun-warmer[bot]`), DWD/GeoSphere/
MeteoSwiss als Upstreams, Jans PC (Fixture-Capture, bis V-09/A9 gelöst).

**§2 Ausfallszenarien — Symptom → Diagnose → Erste Hilfe.** Kern des Dokuments:

| # | Symptom | Erste Prüfung | Sofortmaßnahme |
|---|---|---|---|
| 1 | Karte lädt langsam, Daten wirken alt | `curl https://buscosun.com/latest-grib.json` → `runAt`-Alter | `workflow_dispatch` von `warm-grib`; Actions-Log auf „Fail-Safe"/„Retry" lesen |
| 2 | Manifest zeigt `localhost` oder alten Lauf | wurde `public/latest-*.json` manuell committet? | **nichts von Hand fixen** — der nächste Cron-Tick heilt (Reset-auf-Remote-Tip-Loop, `warm-grib.yml:75-91`); Regel: Manifeste **nie** lokal committen (Audit §J.4.5 Punkt 6) |
| 3 | Ein Layer bleibt leer / Konsole zeigt Decode-Fehler | betrifft es **einen** Upstream? `npm run verify:<quelle>` | wenn Upstream-Layout geändert: Quell-Modul anpassen; sonst Publikationsfenster abwarten |
| 4 | Site komplett down | Netlify-Status + letzter Deploy | letzten grünen Deploy per „Publish deploy" zurückrollen (Netlify-UI, kein Git nötig) |
| 5 | Rechnung/Kontingent überschritten | Netlify-Usage (Bandbreite, Build-Minuten) | Warm-Cron-Takt drosseln (`*/15` → `*/30`), Hebel §6.5 #1–4 ziehen |
| 6 | Fusion-Training stallt | `npm run fusion:status` | Capture-Cron prüfen (nach A9-Fix) bzw. Task Scheduler auf Jans PC |
| 7 | Push verschickt Unsinn (nach O-01 B) | — | Kill-Switch-Flag setzen, Cron deaktivieren |

**§3 Wiederkehrende Handgriffe:** Cron manuell auslösen · `SITE_URL` ändern · Deploy zurückrollen ·
Edge-Function-Logs lesen · VAPID-Schlüssel rotieren (falls B) · Domain-/DNS-Wechsel.

**§4 Der „Wenn Jan zwei Wochen ausfällt"-Abschnitt:** Was hält von selbst (statische Site, Edge-
Cache, Crons), was verfällt (Manifest nach 24 h → Staleness-Guard → Directory-Scan → langsam,
**aber funktionsfähig** — das ist F.7-belegt), was wirklich Aufmerksamkeit braucht (Upstream-
Layout-Änderung, Kontingente). **Erkenntnis, die dort hingehört:** die Architektur degradiert
bemerkenswert gnädig — der Worst Case eines Cron-Totalausfalls ist „langsam, nicht kaputt"
(`audit/wind-transport.md` §F.7). Das ist ein Betriebs-Asset und sollte dokumentiert sein,
statt in einem Audit zu schlummern.

**§5 Zugangs-/Geheimnis-Inventar** (nur *wo*, nie *was*): Netlify-Konto, GitHub-Repo-Variablen und
-Secrets, Domain-Registrar, Kontakt-Mailbox. Für Bus-Faktor 1 ist ein Notfall-Zugriff (Passwort-
Manager-Notfallkontakt) die eigentliche Absicherung — die schreibt kein Agent, die richtet Jan
ein.

---

## 10. Initiativen

| # | Initiative | Ziel | Aufwand | Wirkung 1–5 | Abhängigkeiten | Definition of Success |
|---|---|---|---|---|---|---|
| I1 | **Betriebs-Wächter** (V-INF-01) | Kein Ausfall bleibt > 1 h unbemerkt | S | **5** | keine | Ein absichtlich stehengelassener Manifest-Advance erzeugt binnen 1 h eine rote Actions-Mail; Nachweis mit `FAIL_STEP=0` in einem Testlauf |
| I2 | **Warm-Budget = sichtbare Layer** (V-INF-02, V-INF-03) | Alle sichtbaren GRIB-Layer sind Edge-warm, kein Budget für unsichtbare | M | **5** | STOPP-Freigabe Cron | Kaltload von Gewitter/Blitz-Prognose/Schnee/Rotation: 0 Directory-Listings, `Cache-Status: hit`; Wind-Manifest führt in jedem Fenster Steps 0–12 |
| I3 | **§A-Defekt-Sprint** (A1, A2, A6, A7) | Prod-Proxy, Domain, 404, Header | M | **4** | O-03-Entscheidung; Preview-Deploy | 7 Modelle liefern in Prod echte Daten; ein einziger Canonical-Host; `/gibtsnicht` → 404; CSP scharf ohne Konsolenfehler |
| I4 | **Frische-Badge + Ehrlichkeit** (V-INF-04) | Datenstand = Lauf, nicht Abrufzeit | S | **4** | Command-Deck (D-27) | Status-Pille zeigt Lauf + Alter; > 9 h ⇒ sichtbarer Hinweis |
| I5 | **Kosten-/Bandbreiten-Sanierung** (V-INF-06, V-INF-07, V-INF-11) | Betrieb wieder im Kontingent | M | **4** | Netlify-Zahlen (Jan) | Warm-Traffic < 40 GB/Monat; < 30 Builds/Monat; Fremdzugriff auf `/_dwd_*` = 403 |
| I6 | **SW-Sanierung** (V-INF-05) | Kein Manifest-Pinning, kein Quota-Blowout | S | **3** | keine | Manifest kommt nach Deploy sofort frisch; SW-Cache < 50 MB nach einer Vollsitzung |
| I7 | **Kontrakt-Nightly** (V-INF-10) | Upstream-Bruch fällt in ≤ 24 h auf | M | **3** | V-11 (CI-Grundgerüst) | Ein simulierter Layout-Bruch färbt den Nightly rot, PRs bleiben grün |
| I8 | **EPS-Vor-Resampling T2b-4** (V-INF-08) | Fusion-Kaltlast strukturell brechen | L | **5** | Äquivalenz-Beweis; Daten-Rolle | Fusion-Input numerisch identisch (Zell-für-Zell), Transfer < 2 MB statt 192 MB |
| I9 | **Push-Pilot** (V-INF-13, V-16) | O-01 B beweisen | L | **4** | O-01-Entscheidung; Datenschutzerklärung | 100 Abos, ein Trigger-Typ, Kill-Switch erprobt, 0 Fehlsendungen über 4 Wochen |
| I10 | **Runbook + Bus-Faktor** (V-INF-12) | Betrieb ohne Jan überlebbar | M | **3** | keine | Ein fremder Agent kann Szenario 1–4 allein aus `docs/runbook.md` lösen |

---

## 11. Vorgeschlagene V-Einträge

> Nächste freie Nummer in `improvements.md` ist V-17. Die folgenden Einträge sind bewusst als
> `V-INF-NN` benannt, damit der Koordinator sie beim Einpflegen konfliktfrei auf V-17 ff.
> umnummerieren kann.

### 11.0 Zuerst: Korrekturen/Ergänzungen zu bestehenden V-Einträgen (nicht duplizieren)

- **V-01 (Prod-Proxy):** ergänzen um die exakten Zeilenbelege (`vite.config.ts:43-47` `/_cscs`,
  `:51-55` `/_mf`, `:58-62` `/_ecmwf`) und den Hinweis, dass `/_cscs` wegen der **S3-v2-Signatur
  über Host+Pfad+Query** (`vite.config.ts:39-42`) an einem Preview-Deploy zu verifizieren ist,
  bevor man ihn für erledigt erklärt. Reihenfolge: neue Regeln **vor** dem Catch-all.
- **V-02 (Domain):** ergänzen um die vollständige Fundstellenliste aus §8.1 (12 Stellen) und den
  Hinweis, dass `SITE_URL` (Repo-Variable) bereits korrekt auf .com steht und **nicht** angefasst
  werden darf.
- **V-03 (Cron-Health):** **Faktenkorrektur.** Die Aussage „standen zuletzt ~2 Tage unbemerkt
  still" ist falsch (§2.2: lückenlose Bot-Commits, 100/100 Runs `success`, letzter Advance
  2026-07-31T13:40Z). Die **Priorität bleibt P0**, aber die Begründung ändert sich: der
  Fail-Safe ist *still* (Exit 0 + grüner Run, `warm-grib.mjs:340,351`), und drei parallele
  Analysen haben den Betriebszustand aus einem veralteten Klon falsch abgeleitet — das ist der
  Beweis für die fehlende Beobachtbarkeit. Umsetzung → V-INF-01.
- **V-06 (404):** ergänzen um den vereinfachenden Befund, dass buscosun **hash-only** routet und
  der SPA-Catch-all deshalb ersatzlos durch `/* → /404.html 404` ersetzt werden kann.
- **V-07 (Security-Header):** ergänzen um die **fertige** Direktiv-Liste aus §4.1 inkl.
  Begründungen (`'wasm-unsafe-eval'` für bzip2-wasm, `worker-src blob:` für MapLibre,
  `style-src 'unsafe-inline'` unvermeidbar, `script-src` ohne `'unsafe-inline'` möglich) und den
  Report-Only-Rolloutplan.
- **V-09 (Fixtures):** ergänzen um den frischen Lückenbeleg (43 % Abdeckung in 86 h, 22-h-Lücke
  2026-07-30T09 → 2026-07-31T06) und die Kostenwarnung: ein stündlicher Capture-Cron erzeugt
  +24 Commits/Tag ⇒ +24 Netlify-Builds/Tag → gebündelt committen.
- **V-11 (CI-Minimum):** ergänzen um die Arbeitsteilung — V-11 = **netzfreies PR-Gate**,
  V-INF-10 = **netzabhängiger Nightly**; nur zusammen decken sie die reverse-engineerten
  Upstream-Kontrakte ab.
- **V-16 (Push):** ergänzen um die konkrete Minimal-Architektur aus §7 Option B (eine Function +
  Netlify Blobs + ein Cron nach dem Warm-Muster + VAPID) und den Befund, dass die Trigger-Logik
  bereits DOM-frei und damit Node-fähig ist (`notificationBackend.ts:14-17`).

### 11.1 Neue Einträge

### V-INF-01 · Betriebs-Wächter: stiller Fail-Safe wird sichtbarer Alarm  (Priorität P0 · Aufwand S · Status offen)
**Was:** Die Warm-Crons melden Erfolg, auch wenn sie nichts ausgerichtet haben: bei unvollständiger
Wärmung wird das Manifest bewusst nicht umgelegt und der Job endet mit Exit 0
(`scripts/warm-grib.mjs:340,351`, `scripts/warm-wind.mjs:164`). Ein dauerhaft blockierter Advance
erzeugt also lauter **grüne** Runs. Zusätzlich prüft niemand, ob das *ausgelieferte* Manifest
aktuell ist — genau diese Lücke hat 2026-07-22 die Merge-Regression zwei Tage lang verborgen
(`audit/layer-transport.md` §J.4.1).
**Mehrwert:** Wenn die Karte langsam wird, erfährt Jan es innerhalb einer Stunde per Mail — statt
es Wochen später zufällig zu bemerken. Ohne neuen Dienst, ohne laufende Kosten.
**Umsetzung:** (1) In beiden Workflows nach dem Warmer ein Schritt „Manifest-Alter prüfen"
(`runAt` älter als 6 h ⇒ `::error::` + Exit 1). (2) Neuer, **unabhängiger** Workflow
`health.yml` (stündlich), der `https://<SITE_URL>/latest-{grib,wind}.json` holt und prüft:
`runAt`-Alter < 9 h, `warmedThroughProxy` == Prod-Domain, Step-Vollständigkeit je Param. Rot ⇒
GitHubs Standard-Fehlermail. Risiko: Änderung an der Cron-Semantik ⇒ **STOPP & FRAGEN**;
Abhängigkeit: keine.
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-02 · Warm-Budget an die tatsächlich sichtbaren Layer koppeln  (Priorität P0 · Aufwand M · Status offen)
**Was:** `scripts/warm-grib.mjs:72-80` wärmt sieben Parameter, darunter die vier Wolken-Parameter
(52 Dateien je Lauf ≈ 28 MB) für einen Layer, dessen Toggle auskommentiert ist
(`src/MapView.tsx:3861`). Gleichzeitig sind vier **sichtbare** Layer gar nicht im Budget:
Gewitterpotenzial (`cape_ml`/`cin_ml`/`lpi`, `src/sources/iconD2Thunder.ts:131`), Blitz-Prognose
(`lpi_max`, `iconD2Lpi.ts:119`), Schnee (`h_snow`/`snow_gsp`, `iconD2Snow.ts:161`) und Rotation
(`uh_max`/`uh_max_low`/`sdi_2`, `iconD2Rotation.ts:149`). Sie fallen deshalb auf den
Directory-Scan zurück (`iconD2Precip.ts:112-116`) und laden über den kalten Edge-Pfad.
**Mehrwert:** Die vier neuesten Karten-Layer werden so schnell wie Temperatur und Böen — heute
warten Nutzer dort mehrere Sekunden länger, ohne dass es einen Grund gäbe. Nebeneffekt: rund
12 GB Datenverkehr im Monat, die aktuell für einen unsichtbaren Layer aufgewendet werden, werden
frei.
**Umsetzung:** `PARAMS` in `warm-grib.mjs` an die tatsächlich aktiven `DECK_GROUPS`
(`MapView.tsx:3826-3876`) angleichen: Wolken-Params entfernen (mit Kommentar, wie sie
zurückkommen), die neun fehlenden Params mit ihren Karten-Caps ergänzen; Manifest-Schema bleibt
unverändert (per-Param-Step-Listen). Warm-Kosten neu abschätzen, bevor deployt wird. Risiko:
Cron-Semantik ⇒ **STOPP & FRAGEN**; Verifikation über einen Kaltload je Layer (0 Listings,
`Cache-Status: hit`).
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-03 · Wind-Warmer: neu publizierte Schritte nachwärmen (Fern-Horizont-Lücke)  (Priorität P0 · Aufwand S · Status offen)
**Was:** `scripts/warm-wind.mjs:144` bricht ab, sobald das Manifest **denselben Lauf** trägt —
ohne zu prüfen, ob inzwischen weitere Vorlaufschritte publiziert wurden. Da ICON-D2 progressiv
publiziert, friert das Manifest auf dem Stand des ersten Warm-Laufs ein; belegt am Stand
`public/latest-wind.json:4-10` (Lauf 2026072921, **nur Steps 0–4**, geschrieben 51 min nach
Referenzzeit). Der Client übernimmt diese Liste als autoritativ
(`src/wind/iconD2WindSource.ts:340-343`) → der Wind-Zeitslider hat in solchen Fenstern nur 5 statt
13 Stunden. `scripts/warm-grib.mjs:246-254` löst dasselbe Problem bereits korrekt.
**Mehrwert:** Der Wind-Verlauf reicht wieder verlässlich 12 Stunden voraus statt zeitweise nur
4 — ohne dass jemand merkt, dass etwas fehlt. Das ist Funktionserhalt, kein Komfort.
**Umsetzung:** `manifestCovers()`-Äquivalent aus `warm-grib.mjs` nach `warm-wind.mjs` übernehmen
(~10 Zeilen), Early-Exit auf Lauf **und** Step-Abdeckung prüfen. Semantik sonst unverändert.
Risiko: Cron-Semantik ⇒ **STOPP & FRAGEN**. Verifikation: zwei aufeinanderfolgende Läufe kurz
nach einem neuen DWD-Lauf; das Manifest muss von 0–4 auf 0–12 wachsen.
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-04 · Datenfrische ehrlich anzeigen: Lauf-Zeit statt Abrufzeit  (Priorität P1 · Aufwand S · Status offen)
**Was:** Die Status-Pille der Karte zeigt „Stand HH:MM" und meint damit den Zeitpunkt des
Abrufs: `fetchedAt: Date.now()` für alle GRIB-Layer (`src/MapView.tsx:1496,1564,1602,1629,1648,
1667,1692,1712`, gerendert `:3425`). Die Referenzzeit des Modelllaufs ist vorhanden
(`src/sources/gribManifest.ts:110` → `src/sources/iconD2Precip.ts:119`), wird aber verworfen.
Ein 9 Stunden alter Lauf sieht dadurch taufrisch aus.
**Mehrwert:** Nutzer sehen, wie alt die Zahlen wirklich sind — das ist genau das
Ehrlichkeitsversprechen, mit dem sich buscosun von den Wettbewerbern abgrenzt. Und: jeder
Betriebsausfall wird sofort sichtbar, ohne dass irgendetwas gemessen oder getrackt werden muss.
**Umsetzung:** `updateStatus`-Payload um `runAt` erweitern; Pille zeigt „Lauf 12z · vor 3 h";
ab > 9 h zusätzlich ein ruhiger Hinweis („Daten älter als üblich"). Command-Deck-konform (D-27),
keine neue UI-Fläche. Abhängigkeit: keine; ergänzt V-03/V-INF-01 auf der Produktseite.
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-05 · Service Worker: Manifeste und Massendaten aus den SW-Caches nehmen  (Priorität P1 · Aufwand S · Status offen)
**Was:** Zwei Defekte in `public/sw.js`. (1) `ASSET_RE` (`sw.js:37`) erfasst `.json`, wodurch
`/latest-grib.json` und `/latest-wind.json` per stale-while-revalidate (`sw.js:72-80`) aus dem
SW-Cache kommen — das `cache: 'no-store'` des Clients (`gribManifest.ts:58`) umgeht den Service
Worker nicht. Wiederbesucher arbeiten deshalb zuerst mit einem veralteten Lauf. (2) Der
Daten-Cache (`sw.js:83-95`) nimmt jede Antwort auf, auch die 11–15 MB großen EPS-Dateien, und
begrenzt nur die **Anzahl** (`DATA_MAX = 350`, `sw.js:20`), nicht die Bytes; zusätzlich werden
opake Fremdantworten gecacht (`sw.js:87`), die vom Browser mit ~7 MB pro Eintrag auf das Quota
angerechnet werden. Ergebnis: der Browser kann den gesamten Speicher des Origins verwerfen —
inklusive Favoriten und Einstellungen.
**Mehrwert:** Nach einem Update sehen Nutzer sofort die frischen Daten statt der von gestern, und
die App verliert nicht mehr unvermittelt gespeicherte Orte und Einstellungen, weil der Browser
aufräumen musste.
**Umsetzung:** `/latest-*`-Pfade in `isHashedAsset` ausnehmen und network-first behandeln;
`/_dwd_grib`, `/_dwd_wind`, `/_dwd_opendata` und Antworten > 2 MB nicht in den SW-Cache legen
(die App hat dafür eigene, dimensionierte Caches); Byte-Budget statt Eintrags-Budget;
`Cache-Control: no-cache` für `/sw.js` im `_headers`-Block; `VERSION` aus dem Build-Hash setzen.
Risiko: SW-Änderungen wirken erst beim übernächsten Besuch — Rollout beobachten.
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-06 · Edge-Proxy gegen Fremdnutzung und Cache-Fragmentierung härten  (Priorität P1 · Aufwand S · Status offen)
**Was:** Beide Edge Functions proxen den kompletten ICON-D2- und ICON-D2-EPS-Baum für jedermann —
ohne Herkunftsprüfung, ohne Rate-Limit (`netlify/edge-functions/dwd-grib.ts:59-101`). Der
EPS-Baum enthält Dateien à 11–15 MB; Dritte können darüber beliebig viel Bandbreite auf
buscosuns Rechnung ziehen. Zusätzlich wird der Query-String an DWD durchgereicht
(`dwd-grib.ts:56`, `dwd-wind.ts:53`), obwohl die Dateien nie Parameter brauchen — damit lässt
sich der Durable-Cache mit `?a=1`, `?a=2`, … beliebig fragmentieren und jedes Mal ein
Origin-Fetch erzwingen. (Geprüft und **nicht** gefunden: eine Directory-Traversal-Umgehung über
`%2e%2e` — die URL-Normalisierung fängt sie ab.)
**Mehrwert:** Die Rechnung bleibt vorhersehbar, und niemand Fremdes kann buscosun als
Gratis-Download-Beschleuniger für Wetterdaten benutzen.
**Umsetzung:** In beiden Handlern (a) Requests mit Query mit 400 abweisen bzw. `url.search`
verwerfen; (b) Herkunft prüfen (`Sec-Fetch-Site: same-origin` bzw. `Origin`/`Referer` gegen die
eigene Domain) und Fremdanfragen mit 403 beantworten — funktionsneutral, weil die App
ausschließlich same-origin anfragt; (c) `X-Content-Type-Options: nosniff` mitsenden. Verifikation
über `scripts/verify-layer-transport.mjs` (Header mitschicken, Byte-Identität muss erhalten
bleiben). **Achtung:** Der Warm-Cron holt über `SITE_URL` — er muss die Herkunftsprüfung bestehen
(eigener Header oder Ausnahme), sonst legt die Härtung das Wärmen still. Risiko: Edge-Semantik ⇒
**STOPP & FRAGEN**.
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-07 · Warm-Cron: Delta wärmen statt jedes Mal den ganzen Lauf  (Priorität P1 · Aufwand S · Status offen)
**Was:** Sobald ein einziger neuer Schritt publiziert ist, baut `scripts/warm-grib.mjs:301-302`
die Task-Liste über **alle** Schritte des Laufs und zieht den kompletten Satz erneut durch die
eigene Edge — bei ~15 Advances pro Tag sind das rund 1,6 GB täglich allein für die 2D-Layer,
zuzüglich ~1,5 GB für EPS (Rechnung §6.3 des Infra-Deep-Dives).
**Mehrwert:** Der laufende Betrieb kostet spürbar weniger Datenvolumen — Geld, das bei
wachsender Nutzerzahl an anderer Stelle gebraucht wird. Für Nutzer ändert sich nichts.
**Umsetzung:** In `main()` die Task-Liste auf Steps beschränken, die das bestehende Manifest noch
nicht führt (`manifestCovers` liefert die Information bereits). Trade-off prüfen: die
Durable-Cache-TTL beträgt 6 h (`dwd-grib.ts:36`) und wird ohne Nachwärmen nicht aufgefrischt —
bei 3-h-Laufrhythmus unkritisch, aber vor dem Deploy an einem echten Lauf zu belegen. Risiko:
Cron-Semantik ⇒ **STOPP & FRAGEN**.
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-08 · Bandbreiten- und Build-Budget messen, bevor es die Rechnung tut  (Priorität P1 · Aufwand S · Status offen)
**Was:** Niemand kennt den tatsächlichen Verbrauch. Aus dem Repo rekonstruiert: ~100 GB
Datenverkehr im Monat allein durchs Wärmen und **~660 Netlify-Builds im Monat** (22 Bot-Commits
pro Tag, GitHub-API), weil jeder Manifest-Commit einen Rebuild auslöst (`warm-grib.yml:17-19`).
Beides liegt weit über den üblichen Gratis-Kontingenten.
**Mehrwert:** Jan weiß, was der Betrieb wirklich kostet, bevor eine überraschende Rechnung oder
eine gedrosselte Seite auftaucht — und weiß, welcher Hebel wie viel spart.
**Umsetzung:** (1) Jan liest einmalig Netlify-Usage (Bandbreite, Build-Minuten, Function-Aufrufe)
ab und trägt die Zahlen in `docs/runbook.md` ein. (2) Monatliche Kurznotiz im Session-Log.
(3) Falls Kontingente knapp: Reihenfolge der Hebel aus dem Infra-Deep-Dive §6.5 abarbeiten
(Wolken-Warm streichen, Delta-Wärmen, Edge härten, Manifest über Blobs). Reine Betriebsaufgabe,
kein Code.
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-09 · Synthetische Betriebs-Sonde (Uptime, Frische, Edge-Trefferquote)  (Priorität P1 · Aufwand S · Status offen)
**Was:** Es gibt keine einzige automatische Prüfung, ob die ausgelieferte Seite funktioniert. Ob
der ganze T1/T2-Aufwand in Produktion überhaupt wirkt (Edge-Trefferquote), wurde genau **einmal**
gemessen (`audit/live-network-audit.md`, 2026-07-22) — seitdem nie wieder.
**Mehrwert:** Ein Ausfall oder eine schleichende Verschlechterung fällt binnen einer Stunde auf,
nicht erst, wenn sich jemand beschwert. Und man sieht schwarz auf weiß, ob die Karte für echte
Besucher schnell ist.
**Umsetzung:** Workflow `probe.yml` (stündlich): `GET /` (200 + `id="root"`),
`GET /latest-grib.json` (Schema + Frische), ein `Range`-Request auf eine manifestierte
`/_dwd_grib`-Datei mit Auswertung des `Cache-Status`-Headers (= Edge-Trefferquote),
`GET /wetter/muenchen/` (200), nach dem 404-Fix `GET /gibtsnicht` (404). Ergebnisse als
Job-Summary; rot bei Verletzung. Optional zusätzlich ein externer Gratis-Monitor für den Fall,
dass GitHub selbst ausfällt. Keine Nutzerdaten, D-02 unberührt.
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-10 · Nightly-Kontraktprüfung der Upstream-Quellen  (Priorität P1 · Aufwand M · Status offen)
**Was:** Die Quell-Anbindungen beruhen auf reverse-engineerten Konstanten (DWD-Verzeichnislayout,
RADOLAN-Header, DE1200-Ecken — `architecture.md` §4) und brechen bei Upstream-Änderungen **still**.
Es gibt ~30 Verifier, die genau das prüfen (`package.json`), aber keinen Automatismus.
**Mehrwert:** Wenn eine Behörde ihr Dateiformat ändert, weiß Jan es am nächsten Morgen — nicht
erst, wenn Nutzer eine leere Karte melden.
**Umsetzung:** Workflow `contracts.yml` (täglich, nicht PR-blockierend): die netzabhängigen
`verify:*`- und `fusion:*`-Skripte bündeln, Fehlschläge einmal nach 30 min wiederholen
(entprellt gegen DWD-Publikationsfenster, `agents.md` §7), erst dann rot. Ergänzt V-11 (dort:
netzfreies PR-Gate) — erst beide zusammen decken Logik **und** Kontrakt ab. Abhängigkeit: O-02.
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-11 · Manifeste ohne Repo-Commit veröffentlichen (Netlify Blobs)  (Priorität P2 · Aufwand M · Status offen)
**Was:** Jeder Manifest-Advance wird als Commit auf `main` geschrieben und löst einen kompletten
Netlify-Rebuild aus (`warm-grib.yml:17-19`) — ~660 Builds im Monat für zwei Dateien mit zusammen
2,5 KB. Daraus folgen: hohe Build-Kosten, ein Push-Race, das nur mit einer dreifachen
Retry-Schleife beherrschbar ist (`warm-grib.yml:75-91`), Abhängigkeit von Branch-Protection und
die Klasse „lokal mitcommittete Arbeitskopie dreht den Advance zurück"
(`audit/layer-transport.md` §J.4.1). Die Alternative ist in T2c-3 bereits skizziert.
**Mehrwert:** Neue Daten sind sofort da, statt auf einen Rebuild zu warten; die Commit-Historie
bleibt lesbar (heute stammen zwei Drittel aller Commits vom Bot); und ein ganzer Fehlermodus
verschwindet.
**Umsetzung:** Warm-Cron schreibt in Netlify Blobs; eine winzige Function liefert
`/latest-grib.json` und `/latest-wind.json` mit kurzer Cache-Zeit aus; der Client bleibt
unverändert (gleiche URLs). Übergangsweise beides parallel betreiben und vergleichen. Risiko:
Manifest-Mechanik ⇒ **STOPP & FRAGEN**; Abhängigkeit: berührt dieselbe Infrastruktur wie O-01
Option B (dort fällt sie als Nebenprodukt ab).
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-12 · Betriebs-Runbook + Absicherung des Bus-Faktors  (Priorität P1 · Aufwand M · Status offen)
**Was:** Es gibt keine Stelle, an der steht, was bei einer Störung zu tun ist. Das Betriebswissen
liegt verstreut in Audit-Protokollen, die als Historie geschrieben sind
(`audit/wind-transport.md` §F.7, `audit/layer-transport.md` §J.4.5). Ein einziger Maintainer ohne
Runbook bedeutet: fällt Jan aus, kann niemand — auch kein Agent — gezielt eingreifen.
**Mehrwert:** Störungen sind in Minuten statt Stunden behoben, und ein Vertreter (Mensch oder
Agent) kann das System betreiben, ohne sich durch zwölf Audit-Dokumente zu lesen.
**Umsetzung:** `docs/runbook.md` mit: Systemkarte auf einer Seite, sieben Ausfallszenarien
Symptom→Diagnose→Erste Hilfe (Vorlage im Infra-Deep-Dive §9), wiederkehrende Handgriffe
(Cron auslösen, Deploy zurückrollen, `SITE_URL` ändern), Abschnitt „Was hält von selbst, wenn
niemand da ist" (Antwort: erstaunlich viel — der Worst Case ist „langsam, nicht kaputt"), sowie
ein Zugangs-Inventar (nur *wo*, nie *was*). Nicht-technischer, aber wirksamster
Bus-Faktor-Baustein.
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-13 · Push-Pilot auf Minimal-Backend (Umsetzungspfad für O-01 Option B)  (Priorität P2 · Aufwand L · Status offen — abhängig von O-01)
**Was:** Konkretisiert V-16. `src/notifications` ist bis auf den Transport fertig, und die
Auslöse-Logik ist bewusst DOM-frei, damit sie serverseitig laufen kann
(`src/notifications/notificationBackend.ts:14-22`). Gleichzeitig betreibt buscosun längst
serverseitige Rechenzeit (zwei Edge Functions, zwei Crons) — der Schritt zu Push ist kleiner, als
D-01 suggeriert.
**Mehrwert:** „Warne mich vor Frost / Gewitter / Regen" wird ein echtes Einstellen-und-vergessen-
Feature statt eines Versprechens, das nur funktioniert, solange die App offen ist — laut
Zielgruppenanalyse der größte einzelne Hebel.
**Umsetzung:** Eine Netlify Function `/api/push` (Ab-/Anmeldung) + Netlify Blobs als
Schlüssel-Wert-Speicher + ein stündlicher GitHub-Cron nach dem Warm-Muster, der die vorhandene
`evaluateSubscription`-Logik ausführt und per VAPID/Web-Push zustellt; Client injiziert
`createHttpPushBackend` statt `NULL_BACKEND` **hinter einem Flag, default aus** (D-11). Pilot mit
**einem** Auslöser-Typ und ≤ 100 Abos, Kill-Switch als Blob-Flag, Koordinaten auf ~5 km gerundet
(Datenminimierung). Voraussetzungen: Entscheidung O-01, Datenschutzerklärung/Impressum,
Löschkonzept. Risiko: Push erreicht Nutzer außerhalb der App und ist nicht per Deploy
zurücknehmbar ⇒ Rate-Limit und Kill-Switch sind Teil der Definition of Done.
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

### V-INF-14 · Radar-Discovery ent-listen (eigener `latest-radar`-Zeiger)  (Priorität P2 · Aufwand M · Status offen)
**Was:** Die Radar-Auflösung lädt jedes Mal ein 157,7 KB großes HTML-Verzeichnislisting, immer
ungecacht (`cache-status: fwd=miss`) und mehrfach je Sitzung
(`audit/live-network-audit.md` §3.1/§3.3). Radar wurde bei T2 bewusst ausgeklammert (5-Minuten-
Takt, Tar-Bündel statt Einzeldateien, `audit/layer-transport.md` §A) — die Optimierung fehlt
seither.
**Mehrwert:** Die „Regnet es gleich?"-Ansicht — buscosuns wichtigstes Schnellfeature — startet
spürbar schneller, weil sie nicht mehr erst ein Verzeichnis herunterlädt und durchsucht.
**Umsetzung:** Eigene Mini-Phase nach dem Manifest-Muster: ein kurzlebiger `latest-radar`-Zeiger
(5-Minuten-Takt) statt Directory-Scan, alternativ ein Edge-Cache mit kurzer Lebensdauer auf dem
Listing selbst. Ausdrücklich **nicht** T2 aufbohren. Zusätzlich das im Audit belegte
Doppel-Laden koalieren (zwei Konsumenten lösen den Radarstand parallel auf, ohne sich das
Ergebnis zu teilen — `live-network-audit.md` §4.2). Risiko: berührt die Nowcast-Kette ⇒ mit der
Daten-Rolle abstimmen.
**Quelle:** Infra & Betrieb (Agent-Team), 2026-07-31.

---

## 12. Bewertung gegen die vier Differenzierungs-Achsen (`roadmap.md` §C)

| Initiative | (1) Entscheidungsprodukt | (2) Alpin/Vertikal | (3) Radikale Ehrlichkeit | (4) Trackerfrei/ohne Account/schnell | Urteil |
|---|---|---|---|---|---|
| I1 Betriebs-Wächter | — | — | **stark** (Ausfälle bleiben nicht verborgen) | **stark** (schnell bleibt schnell) | zahlt auf 2 Achsen ein |
| I2 Warm-Budget | mittel (Gewitter/Schnee sind Entscheidungs-Layer) | **stark** (Schnee/Rotation sind alpine Signale) | — | **stark** | höchster Wirkungsgrad je Aufwand |
| I3 §A-Sprint (A1) | **stark** (Modellwahl hält ihr Versprechen erst dann) | **stark** (beide CH-Hochauflösungsmodelle) | **stark** (Versprechen ≠ Prod-Realität ist eine Unehrlichkeit) | mittel | Pflichtprogramm |
| I3 §A-Sprint (A7 CSP) | — | — | mittel (Vertrauenssignal) | **stark** (passt zur Datenschutz-Positionierung) | ja |
| I4 Frische-Badge | mittel | — | **sehr stark** — direkteste Einzahlung auf D-04 im ganzen Katalog | mittel | ja, überproportional |
| I5 Kosten-Sanierung | — | — | — | **stark** (ohne Kostenkontrolle droht Werbung/Paywall — der Tod der Achse 4) | strategisch notwendig |
| I6 SW-Sanierung | — | — | mittel (keine falsch-alten Daten) | **stark** | ja |
| I7 Kontrakt-Nightly | mittel | mittel | **stark** (Datenlücken werden erkannt, statt still zu sein) | — | ja |
| I8 EPS-Vor-Resampling | — | mittel | — | **sehr stark** (192 MB → wenige MB; mobil der Unterschied zwischen nutzbar und nicht) | größter Perf-Hebel |
| I9 Push-Pilot | **sehr stark** (aus der Vorhersage wird eine Handlung) | mittel | mittel | **Risiko** — Achse 4 muss aktiv verteidigt werden (kein Account, keine Profile, Opt-in) | nur mit klaren Leitplanken |
| I10 Runbook | — | — | mittel | mittel | Grundlage, nicht Differenzierung |

**Gesamturteil:** Die Infra-Initiativen zahlen überwiegend auf Achse 4 (schnell, respektvoll) und
Achse 3 (Ehrlichkeit) ein. Am stärksten unterschätzt ist **I4 (Frische-Badge)**: winziger Aufwand,
direkteste Einzahlung auf das identitätsstiftende Ehrlichkeits-Prinzip — und zugleich der
Monitoring-Baustein, der ohne jede Datenerhebung auskommt. Der einzige Punkt, an dem eine
Infra-Initiative eine Achse **gefährden** kann, ist I9 (Push): Option B ist so zu bauen, dass
„ohne Account, ohne Profil" wahr bleibt.

---

## 13. STOPP & FRAGEN an Jan

1. **Netlify-Plan und Kontingente.** Läuft buscosun.com auf Free oder Pro? Wie viel Bandbreite,
   Build-Minuten und Function-Aufrufe wurden diesen Monat verbraucht? (Rekonstruktion aus dem
   Repo: ~100 GB Warm-Traffic und ~660 Builds/Monat — beides weit über den üblichen
   Free-Kontingenten. Ich darf die Produktionsseite/das Konto nicht abfragen.)
2. **Domain O-03.** buscosun.com bestätigen? Gibt es zu buscosun.app bereits Search-Console-
   Historie/Backlinks, die gegen den Wechsel sprechen? (Empfehlung .com, unter diesem Vorbehalt.)
3. **Backend O-01.** Freigabe für Option B als **Pilot** (eine Function, ein Cron, Netlify Blobs,
   VAPID, flag-gated, ein Auslöser-Typ)? Falls ja: Datenschutzerklärung/Impressum sind
   Voraussetzung, nicht Nachbereitung.
4. **Warm-Budget (V-INF-02).** Darf `warm-grib.mjs` umgestellt werden — Wolken raus (Toggle ist
   auskommentiert), Gewitter/Blitz-Prognose/Schnee/Rotation rein? Sollen Wolken/Konfidenz/
   Flow-Nowcast/Schneegrenze dauerhaft ausgeblendet bleiben oder zurückkommen? Die Antwort
   bestimmt das Budget.
5. **Wind-Warmer (V-INF-03).** Freigabe für die Step-Abdeckungs-Prüfung analog `warm-grib.mjs` —
   Cron-Semantik, deshalb Gate.
6. **Delta-Wärmen (V-INF-07).** Freigabe für die Umstellung „nur fehlende Steps warmen"?
   Trade-off: die 6-h-Durable-TTL wird nicht mehr aufgefrischt.
7. **Edge-Härtung (V-INF-06).** Freigabe für Herkunftsprüfung (403 für Fremd-Origins) und
   Query-Verwerfen? Zu beachten: der Warm-Cron muss die Prüfung bestehen.
8. **Manifest über Netlify Blobs (V-INF-11, T2c-3).** Grundsätzlich gewünscht? Das ändert die
   Manifest-Mechanik — ausdrückliche STOPP-Zone.
9. **404/Catch-all (A6).** Freigabe, den SPA-Catch-all durch eine echte 404-Regel zu ersetzen?
   (Technisch unbedenklich, weil hash-only geroutet wird — aber es ist eine Änderung an
   `netlify.toml`.)
10. **`frame-ancestors 'none'`.** Ist Einbettung von buscosun-Inhalten in fremde Seiten ein Ziel
    (B2B/Embed)? Wenn ja, darf die CSP das nicht pauschal verbieten.
11. **Fixture-Cron (A9/V-09).** Freigabe für einen dritten Cron? Falls ja: gebündelt committen
    (sonst +24 Deploys/Tag).
12. **Repo-Größe (A8).** Git-LFS für neue Screenshots ab jetzt — ja? Historien-Umschreibung
    (`git filter-repo`) empfehle ich **nicht**; sie invalidiert alle Klone und die vier offenen
    Branches.
13. **HSTS `preload`.** Erst nach der Domain-Entscheidung setzen — bitte bestätigen, dass es
    nicht vorher passiert (praktisch nicht rückholbar).

---

## 14. Gefundene Doku-Inkonsistenzen

1. **`roadmap.md` §A3** — „Warm-Crons ohne Alarmierung: letzter Bot-Commit 2026-07-29 …
   offenbar ~2 Tage Stillstand": **sachlich falsch**. Ursache: Ableitung aus einem lokalen Klon,
   der seit 2026-07-29T23:03Z nicht mehr gefetcht wurde. Tatsächlich: lückenlose Bot-Commits,
   letzter 2026-07-31T13:40:47Z, 100/100 Runs `success` (§2.2). Der Defekt „keine Alarmierung"
   bleibt korrekt — die Beweisführung nicht.
2. **`improvements.md` V-03** — enthält dieselbe falsche Beobachtung; Priorität P0 bleibt, die
   Begründung ist zu ersetzen (§11.0).
3. **`architecture.md` §10 („15-min-Takt, 2 min versetzt")** — der Versatz stimmt
   (`warm-wind.yml:29`), der Takt in der Praxis nicht: GitHub führt nur ~31 % der geplanten Ticks
   aus (§2.3). Formulierung „bis zu 15 min, praktisch 30–60 min" wäre ehrlicher.
4. **`architecture.md` §10 („Bot hat 194 von 308 Commits")** — überholt; allein die letzten 100
   Commits enthalten 96 Bot-Commits, `total_count` der Workflow-Runs ist 703. Datumsstempel
   ergänzen oder Zahl entfernen.
5. **`audit/live-network-audit.md` §3.2** — misst den Wolken-Layer als aktiv nutzbar; seit
   2026-07-23 ist der Toggle auskommentiert (`MapView.tsx:3861`). Das Audit ist korrekt für
   seinen Stand (2026-07-22), sollte aber einen Nachtrag bekommen, weil daraus fälschlich
   Warm-Budget-Bedarf abgeleitet werden könnte (§3 A10).
6. **`decisions.md` D-01 („kostenfrei skalierend, kein Betriebsaufwand")** — die Zahlen in §6
   widersprechen dem: ~100 GB Warm-Traffic und ~660 Builds pro Monat sind Betriebsaufwand mit
   Kostenwirkung. D-01 ist als Prinzip weiterhin richtig, die Begründung sollte präzisiert werden
   („kein *Server*-Betrieb" statt „kein Betriebsaufwand").
7. **`decisions.md` D-20 („24-h-Staleness-Guard + Scan-Fallback … Bekannte Lücke: kein Alert bei
   Cron-Stillstand")** — vollständig korrekt, bestätigt.
8. **`CLAUDE.md`/`architecture.md` „2 Edge Functions"** — korrekt (`netlify/edge-functions/`
   enthält genau `dwd-wind.ts` und `dwd-grib.ts`).
9. **`architecture.md` §10 („Fixtures hängen am Task Scheduler von Jans PC")** — korrekt und mit
   frischen Zahlen belegbar (43 % Abdeckung, §3 A9).
10. **`package.json`** — `verify:simradar` verweist auf das gelöschte Feature F3 (D-15); in V-08
    bereits erfasst, hier nur bestätigt.

---

## 15. Offene Fragen / nicht verifizierbar

1. **Live-Verhalten der Produktion** (Header, echter HTTP-Status unbekannter Pfade, tatsächlich
   ausgelieferte Manifest-Version, aktuelle Edge-Trefferquote): nicht geprüft — die
   Session-Constraint verbietet Zugriffe auf die Produktionsseite. Alle Aussagen zu A6/A7 stützen
   sich auf `netlify.toml` und das Fehlen von `_headers`, was eindeutig, aber nicht empirisch ist.
2. **Netlify-Kontingente, -Plan und -Preise:** nicht aus dem Repo belegbar. Die Preisangaben in
   §6.4 sind als **„zu verifizieren"** markiert. Der Verbrauch ist rekonstruiert, nicht gemessen.
3. **Netlify-Build-Dauer:** geschätzt 2–3 min (tsc + vite + SEO-Generator + Klon eines 353-MB-
   Repos). Ein Blick in die Deploy-Logs ersetzt die Schätzung in Sekunden.
4. **SEO-Historie von buscosun.app** (Backlinks, Indexierung): entscheidet die Domain-Empfehlung
   mit, nur über Search Console feststellbar.
5. **Ob die offene Edge bereits von Dritten genutzt wird:** nur aus Netlify-Analytics/Logs
   ablesbar.
6. **Wirkung der CSP:** die Direktivliste in §4.1 ist aus dem Code hergeleitet und vollständig
   für die gefundenen Hosts — aber MapLibre und Vite können zur Laufzeit Quellen benutzen, die
   statisch nicht sichtbar sind (Blob-Worker, dynamische Importe). **Deshalb ist der
   Report-Only-Lauf keine Kür, sondern Pflicht.**
7. **Warum die Fixture-Lücken auftreten** (PC aus, Standby, Task-Fehler): `fixtures/capture.log`
   würde es zeigen; nicht Teil meines Zuständigkeitsbereichs.
8. **GeoSphere-Rate-Limit (240/h, 5/s)** als Skalierungsgrenze: im Audit beobachtet, aber nicht
   dokumentiert bestätigt; bei wachsender Nutzerzahl relevant, weil client-seitig verteilt —
   ein Backend würde diese Grenze **verschlechtern** (dann trifft sie eine einzige IP). Das ist
   ein bisher unbeachtetes Argument **für** D-01 und gehört in die O-01-Abwägung.
