# Bandbreite — Diagnose BW0

> **Phase:** BW0 (Diagnose). **Datum:** 2026-08-22, abends. **Auftrag:** Jan — „Der gesamte
> Wetterdaten-Traffic läuft client-seitig über den Netlify-Proxy und frisst meine Bandbreite."
> **Status:** Diagnose. **Keine Code-Änderung, kein Commit.** Umsetzung erst nach Jans Go.
>
> Alle Zahlen in diesem Dokument sind **gemessen**, nicht geschätzt — Dateigrößen per
> HTTP-HEAD gegen `opendata.dwd.de` (Lauf 2026082203 bzw. EPS 2026082200), Repack-Größen
> durch echten Decode mit den App-Modulen (`src/sources/gribDecode.ts`,
> `src/wind/windFrameBuild.ts`), Pass-Zahlen aus `git log`. Wo geschätzt wird, steht „geschätzt".

---

## 0. Der Befund in drei Sätzen

**buscosun.com ist zum Zeitpunkt dieser Diagnose offline.** Jeder Pfad — `/`,
`/wetterkarte/wind`, `/latest-wind.json`, `/_dwd_wind/…` — antwortet mit

```
HTTP/1.1 503
content-type: application/json
{"error":"usage_exceeded","message":"Usage exceeded","request_id":"01M0NBE1DV5HY5944WM1M87…"}
```

Und: **der Traffic, der das Kontingent aufgebraucht hat, stammt zum weit überwiegenden Teil
nicht von Nutzern, sondern von den eigenen Warm-Crons.** Sie ziehen pro Modelllauf
**398,4 MiB** durch den eigenen Netlify-Proxy — davon **200,6 MiB für ICON-D2-EPS**, einen
Pfad, den der Client nur anfragt, wenn ein Nutzer im Modell-Umschalter ausdrücklich
„ICON-D2-EPS" wählt. Hochgerechnet auf den beobachteten Takt: **100–125 GB pro Monat, bevor
ein einziger Besucher die Seite öffnet.**

Zum Vergleich: das Free-Kontingent sind **300 Credits/Monat**, Bandbreite kostet **20
Credits/GB** → 300 Credits ≙ **15 GB**. Die Warmer allein liegen bei **~2 000–2 500 Credits**.
Auch der Pro-Plan (3 000 Credits ≙ 150 GB, wenn nur Bandbreite) wäre von ihnen allein
aufgebraucht.

Der dritte Satz ist der unbequeme: **Edge-Caching löst das nicht.** Netlify misst Bandbreite
als „data traffic your project sends out to the internet" — ein Cache-Treffer am Edge ist
weiterhin Egress und wird weiterhin berechnet. Der Durable-Cache (T1/T2) hat Latenz und
DWD-Last gesenkt; auf die Rechnung wirkt er **nicht**. Wer Bandbreite sparen will, muss
**weniger Bytes ausliefern** oder **woanders ausliefern**.

---

## 1. Messmethodik und Belege

| Was | Wie gemessen | Beleg |
|---|---|---|
| Prod-Status | `fetch('https://buscosun.com/…')` auf 3 Pfaden | 503 `usage_exceeded`, `server: Netlify`, `x-nf-request-id` je Anfrage |
| DWD-Dateigrößen | HTTP-HEAD, `content-length`, je Param Stichprobe Step 0 / Mitte / Cap | §3 Tabellen |
| Warm-Pass-Kosten | Größen × Step-Listen aus `scripts/warm-grib.mjs` / `warm-wind.mjs` | §5 |
| Warm-Pass-Häufigkeit | `git log` Commits `chore(transport): warm grib…` / `chore(wind): warm cache…` | §5.3 |
| CORS-Lage DWD | GET mit `Origin: https://buscosun.com`, dazu OPTIONS-Preflight | §8 Option C |
| Repack-Größen | echter bz2-Decode + `decodeGrib2` + `buildWindRgba(…, 700)` + PNG (Sub-Filter, deflate 9) | §8 Option B |
| Bundle-Größen | `gzipSync(level 9)` über `dist/assets/*` | §6 |
| Netlify-Abrechnung | Netlify-Docs (Credits, Edge-Function-Metrik, Durable-Cache) | §4.1 |

**Nicht messbar, solange die Seite 503 liefert:** die tatsächliche Edge-Cache-Trefferquote
(`Cache-Status`-Header). Das ist die eine offene Messung — sie ist nach dem Entsperren
nachzuholen (§11, V-BW-9). Für die Bilanz ist sie **nicht entscheidend**, weil ein Treffer
die Bandbreite nicht senkt (§4.1).

---

## 2. Wie der GRIB-Pfad verdrahtet ist

### 2.1 Vier Transportwege, drei Semantiken

| Weg | Mechanik | Wer | Cache-Header |
|---|---|---|---|
| `/_dwd_wind/*` | **Edge Function** `netlify/edge-functions/dwd-wind.ts` | nur `u_10m`/`v_10m`/`hsurf` | `Netlify-CDN-Cache-Control: public, durable, max-age=21600, immutable` + `Cache-Control: public, max-age=21600, immutable` (`dwd-wind.ts:88-90`) |
| `/_dwd_grib/*` | **Edge Function** `netlify/edge-functions/dwd-grib.ts` | alle übrigen ICON-D2-Params + ICON-D2-**EPS** | identisch (`dwd-grib.ts:94-96`) |
| `/_dwd_opendata/*` | **einfacher Rewrite**, keine Function (`netlify.toml:24-29`) | RADOLAN, Directory-Listings, CAP-Warnungen, Pollen, UV, WBI | **keine** — Pass-Through, kein Edge-Cache |
| `/_firms/*` | **Edge Function** `netlify/edge-functions/firms.ts` | NASA-FIRMS-CSV (Schlüsselträger) | `durable, max-age=1800` / Browser 300 s |

Die Edge Functions konfigurieren sich **datei-basiert** (`export const config = { path, cache: 'manual' }`)
— deshalb stehen sie nicht in `netlify.toml`. Beide sind reine Byte-Weiterleitungen
(kein Re-Encoding), abgesichert durch eine Präfix-Whitelist:

- `dwd-grib.ts:31` — `ALLOWED_PREFIXES = ['weather/nwp/icon-d2/grib/', 'weather/nwp/icon-d2-eps/grib/']`
- `dwd-wind.ts:26` — `ALLOWED_PREFIX = 'weather/nwp/icon-d2/grib/'`
- beide: nur `*.grib2.bz2`, kein `..`, sonst 400 (`dwd-grib.ts:47-56`)

Die Whitelist filtert nach **Pfad-Präfix, nicht nach Variable** (bekannt aus
`audit/waldbrand-boden.md`): eine neue ICON-D2-Variable braucht keinen Edge-Eingriff — und
ist damit auch **kein Kostendeckel**.

### 2.2 Der gemeinsame Kern

Ein einziges Modulpaar bedient alle Layer:

```
src/sources/iconD2Precip.ts
  :42  D2_GRIB_PROXY_BASE = '/_dwd_grib/weather/nwp/icon-d2/grib'
  :48  D2_WIND_PROXY_BASE = '/_dwd_wind/weather/nwp/icon-d2/grib'
  :34  D2_GRIB_BASE       = '/_dwd_opendata/…'      ← Default + Directory-Listings
  :107 resolveLatestRun(param)                      ← Manifest-Gate, sonst Directory-Scan
  :195 fetchDecompressedCached(url)                 ← Cache API + fetch + bz2
  :216 fetchDecodeCached(url)                       ← + decodeGrib2
  :224 fetchStepField(run, param, step, base)       ← die EINE Fetch-Naht aller Layer
  :241 fetchStepBytes(…)                            ← dito, Decode off-main (Wind)
```

`src/wind/iconD2WindSource.ts:17` importiert `fetchStepBytes` + `D2_WIND_PROXY_BASE` von dort;
`src/sources/iconD2FireWeather.ts:36-37` importiert **beide** Basen, damit sich der
dekomprimierte Cache zwischen Windlayer und Feuerwetter teilt.

### 2.3 Die Manifest-Gates

- `src/wind/iconD2WindSource.ts:52` → `/latest-wind.json` (`resolveWindRunFromManifest`, :91)
- `src/sources/gribManifest.ts` → `/latest-grib.json` (benutzt in `iconD2Precip.ts:107 ff.`)

Beide ersetzen den ~1,9-s-Directory-Scan. Wo kein Manifest-Eintrag existiert
(`relhum_2m`, `smi`, `cape_ml` …), läuft weiterhin der Scan über `/_dwd_opendata` — der
zieht das **HTML-Listing** (gemessen: `t_2m`-Listing 18,4 KB, RV-Listing **157,7 KB**).

---

## 3. Was jeder Layer beim Öffnen lädt

### 3.1 Die Step-Deckel (Code)

| Layer | Modul | Cap | Params je Step | Nur-Jetzt? |
|---|---|---|---|---|
| Wind | `wind/iconD2WindSource.ts:30` | `MAX_STEP = 12` (nah `NEAR_STEP = 4`, spekulativ 3) | `u_10m`,`v_10m` | ✔ `nowOnly` |
| Temperatur | `sources/iconD2TempSource.ts:32` | 24 | `t_2m` (+ `hsurf` einmalig) | ✔ |
| Böen | `sources/iconD2GustSource.ts:23` | 24 | `vmax_10m` | ✔ |
| Niederschlag (Modell) | `sources/iconD2Precip.ts` | 27 | `tot_prec` | ✔ |
| Wolken | `sources/iconD2Clouds.ts:45` | 12 | `clcl`,`clcm`,`clch` (3 ×) | ✔ |
| Gewitter | `sources/iconD2Thunder.ts:36` | 12 | `cape_ml`,`cin_ml`,`lpi` (3 ×) | — |
| Blitzprognose | `sources/iconD2Lpi.ts:42` | 12 | `lpi_max` | — |
| Schnee | `sources/iconD2Snow.ts:44` | 24 | `h_snow` bzw. `snow_gsp`+`snow_con`+`rho_snow` | — |
| Rotation | `sources/iconD2Rotation.ts:44` | 12 | `uh_max`,`uh_max_low`,`sdi_2` (3 ×) | — |
| Feuchte-Treiber | `sources/iconD2Relhum.ts:54` | 24 | `relhum_2m` | — |
| Bodentrockenheit | `sources/iconD2Smi.ts:86` | 24 | `smi` (+ `soiltyp`) | — |
| **Feuerwetter** | `sources/iconD2FireWeather.ts:225-233` | Fenster `jetzt … +6 h` | **6 Params je Step**: `relhum_2m`,`t_2m`,`u_10m`,`v_10m`,`tot_prec`,`h_snow` | Fenster |
| Radar/Nowcast | `sources/radolan.ts:30` | 25 Frames in **einem** Tar | RV-Tar (~0,49 MiB) | — |
| Fusion/EPS | `sources/iconD2EpsSource.ts:41-42` | `MAX_STEP_DEFAULT = 6`, nur `s%3===0` | 5 Params × 3 Steps | — |

### 3.2 Gemessene Dateigrößen (`.grib2.bz2`, Lauf 2026082203)

| Param | ø KB/Datei | Stichprobe (Step 0 / Mitte / Cap) |
|---|---:|---|
| `cape_ml` | **2 706** | 2 060 / 3 129 / 2 929 |
| `cin_ml` | **1 980** | 1 817 / 1 893 / 2 230 |
| `sdi_2` | **1 638** | 1 780 / 1 495 / 1 639 |
| `tot_prec` | **1 288** | 435 / 1 663 / 1 766 |
| `u_10m` | **1 042** | — |
| `relhum_2m` | **1 035** | — |
| `v_10m` | **1 024** | — |
| `t_2m` | **962** | 924 / 911 / 1 051 |
| `vmax_10m` | **750** | 28 / 1 114 / 1 110 |
| `hsurf` (invariant) | 647 | — |
| `uh_max_low` | 541 | 486 / 527 / 609 |
| `uh_max` | 478 | 464 / 427 / 544 |
| `smi` (je Ebene) | 538–785 | — |
| `lpi` / `lpi_max` / `h_snow` / `snow_*` / `rho_snow` | 3–12 | vernachlässigbar |
| **ICON-D2-EPS** `u_10m` | **14 500** | 20 Member in einer Datei |
| **ICON-D2-EPS** `tot_prec` | **13 000** | 7 300 / 14 900 / 16 800 |
| **ICON-D2-EPS** `t_2m` / `v_10m` / `clct` | 12 100–14 400 | — |
| RADOLAN RV-Tar | 498 | 25 Frames, 1 100 × 1 200 |
| RADOLAN RY latest | 15 | — |
| **RV-Directory-Listing** | **158** | 1 152 Einträge, HTML, **ungecacht** |

**Der Bandbreiten-Treiber ist nicht „der Wind".** Nach Bytes je aktivem Layer:

1. **ICON-D2-EPS (Fusion)** — 12–17 MB **pro Datei**. Klassenmäßig 10× alles andere.
2. **Gewitter** (`cape_ml`+`cin_ml`) — 4,7 MB pro Vorlaufstunde.
3. **Feuerwetter** — 6 Params ≈ 5,3 MB pro Vorlaufstunde, davon `relhum_2m` **ungewärmt**.
4. **Rotation** — 2,7 MB pro Vorlaufstunde.
5. **Wind** — 2,1 MB pro Vorlaufstunde (u+v).
6. Radar — 0,49 MB je 5-Min-Lauf, **aber** + 158 KB Listing je Abruf.

---

## 4. Cache-Lage

### 4.1 Netlify-Edge — und warum er die Rechnung nicht senkt

Die beiden GRIB-Functions setzen `Netlify-CDN-Cache-Control: public, durable, max-age=21600, immutable`
und `cache: 'manual'` in der Config. Drei Befunde:

1. **Bandbreite wird am Egress gemessen, nicht an der Herkunft.** Netlify: „Web bandwidth
   metering measures the amount of data traffic your project sends out to the internet,
   which includes assets and web content served … file downloads, function responses."
   Ein Edge-Cache-Treffer spart die DWD-Anfrage und die Latenz — **nicht das Byte an den
   Client**. Die gesamte T1/T2-Transportlinie war für Latenz und DWD-Freundlichkeit richtig
   und ist für die Kostenfrage **wirkungslos**.
2. **`durable` ist für Edge Functions nicht dokumentiert.** Netlifys Doku führt den
   `durable`-Direktiv unter *Functions*; für Edge Functions sind `Cache-Control`,
   `CDN-Cache-Control`, `Netlify-CDN-Cache-Control`, `Expires`, `Vary`/`Netlify-Vary`
   genannt — `durable` nicht. Das Token wird vermutlich ignoriert, der **normale**
   Edge-Cache greift trotzdem (weil `cache: 'manual'` + Cache-Header beide gesetzt sind).
   → **zu messen** (V-BW-9), sobald die Seite wieder antwortet.
3. **Edge-Function-Invocations sind eine EIGENE Metrik.** Netlify zählt „each time an edge
   function is invoked". Ein Cache-Treffer erspart die Invocation; ein Miss nicht. Die
   Warm-Crons erzeugen ~3 000–5 000 Invocations/Tag ≈ 90–150 k/Monat — auch das läuft
   gegen ein Kontingent.

**Der Rewrite-Weg hat gar keinen Cache.** `/_dwd_opendata/*` (`netlify.toml:24-29`) ist ein
reiner Proxy ohne Cache-Header — jedes RV-Tar, jedes Directory-Listing, jeder CAP-Abruf geht
jedes Mal komplett durch. Das 158-KB-RV-Listing zahlt jede Radar-Session und jeder
5-Minuten-Refresh.

### 4.2 Client-Caches — die funktionieren

| Cache | Ort | Deckel | Wirkung |
|---|---|---|---|
| `icon-d2-grib-decompressed-v1` | Cache API, `iconD2Precip.ts:174-208` | **140 Einträge**, FIFO | speichert die **entpackten** Bytes je URL → Reload/Reaktivierung ohne Netz |
| `radolan-rv-tar-v1` | Cache API, `radolan.ts:105-125` | 14 Einträge | speichert die **komprimierten** RV-Tars |
| HTTP-Cache | Browser | — | `max-age=21600, immutable` greift, weil die Function ihn setzt |
| `bsc-data-v2` | Service Worker, `public/sw.js:22, 89-105` | 350 Einträge, FIFO | **network-first** — legt eine ZWEITE Kopie jeder GRIB-Datei ab, liest sie aber nur offline |
| `runCache` / `sharedRun` | Modul-Map, `iconD2Precip.ts:82-84` | TTL 3 min | spart Directory-Scans |

Zwei echte Defekte:

- **`GRIB_CACHE_MAX = 140` ist zu klein für den eigenen Bestand.** Wind 26 + Temp 25 +
  Böen 25 + Niederschlag 28 = 104. Kommen Feuerwetter (6 Params × ~8 Steps = 48) oder
  Gewitter (39) dazu, kippt die FIFO — und die verdrängten Einträge werden **innerhalb
  derselben Sitzung** neu geladen. (V-BW-6)
- **Der Service Worker cacht die GRIB-Dateien ein zweites Mal.** `.grib2.bz2` fällt nicht
  unter `ASSET_RE` (`sw.js:39`) und landet im network-first-Zweig (`sw.js:89-105`) →
  `cache.put` für jede 1-MB-Datei, gelesen wird sie aber nur bei Netzfehler. Das
  verdrängt in einem 350-Einträge-FIFO die Dinge, die offline wirklich helfen, und
  verdoppelt den Speicherbedarf. (V-BW-7)

---

## 5. Die Warm-Crons — die Hauptrechnung

### 5.1 Was sie tun

Beide holen jede Datei **vollständig (GET, `arrayBuffer()`) durch `SITE_URL`** — also durch
Netlify, also als Egress:

- `scripts/warm-grib.mjs:266-268` — `const buf = await res.arrayBuffer();`
- `scripts/warm-wind.mjs:110-113` — dito

`.github/workflows/warm-grib.yml:28` — Takt `*/15`; `warm-wind.yml:29` — `2,17,32,47`.
Early-Exit, wenn das Manifest den Lauf komplett abdeckt.

### 5.2 Was ein Durchlauf kostet (gemessen)

**warm-grib, 2D-Abschnitt** (`scripts/warm-grib.mjs:105-125`, 14 Params):

| Param | Cap | Dateien | ø KB | MiB |
|---|---:|---:|---:|---:|
| `t_2m` | 24 | 25 | 962 | 23,5 |
| `vmax_10m` | 24 | 25 | 750 | 18,3 |
| `tot_prec` | 27 | 28 | 1 288 | **35,2** |
| `cape_ml` | 12 | 13 | 2 706 | **34,4** |
| `cin_ml` | 12 | 13 | 1 980 | **25,1** |
| `sdi_2` | 12 | 13 | 1 638 | **20,8** |
| `uh_max_low` | 12 | 13 | 541 | 6,9 |
| `uh_max` | 12 | 13 | 478 | 6,1 |
| `lpi`,`lpi_max`,`h_snow`,`snow_gsp`,`snow_con`,`rho_snow` | 12/24 | 76 | 3–12 | 0,8 |
| `hsurf` | — | 1 | 647 | 0,6 |
| **Σ** | | **269** | | **171,6 MiB** |

**warm-grib, EPS-Abschnitt** (`scripts/warm-grib.mjs:136-139`):

| Param | Steps 0/3/6 | MiB |
|---|---|---:|
| `u_10m` | 14,4 / 14,5 / 14,5 | 43,4 |
| `v_10m` | 14,3 / 14,4 / 14,3 | 43,0 |
| `tot_prec` | 7,3 / 14,9 / 16,8 | 39,0 |
| `t_2m` | 12,9 / 12,9 / 12,8 | 38,6 |
| `clct` | 12,1 / 12,1 / 12,5 | 36,7 |
| **Σ** | **15 Dateien** | **200,6 MiB** |

**warm-wind** (`scripts/warm-wind.mjs:45`, `WARM_MAX_STEP=12`):
26 Dateien (13 Steps × u/v), **26,2 MiB** — sequenziell (`warm-wind.mjs:179-185`, zwei
verschachtelte `for`-Schleifen mit `await`). **Das ist exakt Jans Log-Muster:** „u_10m und
v_10m, Frame 000–012, ~26 Dateien in ~16 Sekunden". Ein Client-Aufruf mit `CONCURRENCY = 6`
(`iconD2WindSource.ts:44`) wäre in ~1 s durch. **Der beobachtete Burst ist der Cron, kein Nutzer.**

**Σ ein voller Umlauf = 398,4 MiB.**

### 5.3 Wie oft (aus `git log`, jeder Commit = ein Durchlauf, der etwas gewärmt hat)

| Datum | `warm grib` | `warm wind` |
|---|---:|---:|
| 2026-08-19 | 23 | 9 |
| 2026-08-20 | 20 | 11 |
| 2026-08-21 | 20 | 10 |

Erwartet wären 8 (ein Lauf alle 3 h). Die Differenz hat eine benennbare Ursache: **beide
Skripte wärmen bei unvollständiger Abdeckung ALLE gelisteten Steps neu, nicht nur die
fehlenden.**

- `scripts/warm-grib.mjs:352-354` — `for (const step of latest.stepsByParam[p.name]) tasks.push(…)`
- `scripts/warm-wind.mjs:179-185` — `for (const step of latest.steps) …`

ICON-D2 publiziert progressiv über ~20–40 min, der Cron tickt alle 15 min → pro Lauf 2–3
Durchläufe, jeder lädt den bereits gewärmten Teil erneut herunter. Auf dem Edge ist das ein
Treffer — **und trotzdem voller Egress**.

### 5.4 Die Bilanz

| Modell | 2D | EPS | Wind | pro Tag | pro 30 Tage | Credits (20/GB) |
|---|---:|---:|---:|---:|---:|---:|
| **Untergrenze** (1 Pass je Lauf, 8/Tag) | 8 × 171,6 | 8 × 200,6 | 8 × 26,2 | **3,11 GiB** | **~100 GB** | ~2 000 |
| **Beobachtet** (20 grib + 10 wind Passes/Tag) | 12 × 171,6 | 8 × 200,6 | 10 × 26,2 | **~4,0 GiB** | **~121 GB** | ~2 420 |

> Free-Plan: **300 Credits/Monat** ≙ 15 GB. Die Warmer allein liegen bei **6,7–8× des
> gesamten Free-Kontingents** — und sie liefen jeden Tag, unabhängig davon, ob jemand die
> Seite besucht hat.

Plausibilitätsprüfung gegen Jans Log: 2 768 Requests. Die Warmer erzeugen 269 + 15 + 26 =
310 Requests je vollem Umlauf, bei 20/10 Passes mit Teil-Abdeckung ~2 500–4 500/Tag. **Gleiche
Größenordnung, gleiche Signatur** (`u_10m`/`v_10m`, Frames 000–012, sequenziell). Die
0,51 % Fehler ≈ 14 sind die 404 auf noch unpublizierte Steps — der Warmer probiert sie
absichtlich (`warm-grib.mjs:261-263`, 4xx wird bewusst nicht wiederholt).

### 5.5 Die zweite, versteckte Kostenstelle: Builds

Jeder Manifest-Commit löst absichtlich einen Netlify-Rebuild aus (`warm-grib.yml:17-19`:
„deshalb KEIN `[skip ci]`"). Bei ~30 Commits/Tag sind das **~900 Produktions-Builds pro
Monat**, jeder baut das komplette Vite-Bundle und deployt 11,3 MB `dist/`. Im Credit-Modell
zählt Build-Zeit in die Compute-Kosten. Zusätzlich: **jeder Deploy invalidiert den
Standard-Edge-Cache der statischen Assets** — die Seite startet ~30× am Tag kalt.

---

## 6. Was eine echte Nutzer-Session kostet

Wichtig für die Verhältnismäßigkeit: **`START_NOW_ONLY` ist per Default an** (`MapView.tsx:408-418`,
abschaltbar mit `?startnow=0`). Eine Sitzung lädt nur das Jetzt-Bracket (max. 2 Steps,
`frameAtValidTime.ts:49-60`), nicht 13. Der Default-Layer ist `wind` (`router/urlState.ts:74`,
`MapView.tsx:859`).

| Ansicht / Aktion | Bytes | Anmerkung |
|---|---:|---|
| App-Shell `/wetterkarte` (JS gz) | ~0,47 MB | `index` 101,3 + `maplibre` 277,6 + `MapView` 85,8 KB gz; danach aus HTTP-/SW-Cache |
| Fonts + CSS | ~0,1 MB | einmalig |
| **Wind, Jetzt-Bracket** | **4,03 MiB** | 2 × (1 042 + 1 024) KB |
| **`t_2m` Jetzt-Bracket + `hsurf`** | **2,52 MiB** | **immer**, auch bei ausgeschaltetem Temp-Layer — die Stadt-Labels brauchen es (`MapView.tsx:2901-2924`) |
| **Σ Kaltstart Wetterkarte** | **~7,1 MiB** | |
| + Slider auf +2 h | + ~6 MiB | Wind + Temp je 2 weitere Stützen |
| + Layer „Gewitter" | + 9,4 MiB | 2 × (`cape_ml` + `cin_ml` + `lpi`) |
| + Layer „Rotation" | + 5,2 MiB | 2 × (`uh_max` + `uh_max_low` + `sdi_2`) |
| + Layer „Niederschlag" | + 0,64 MiB | RV-Tar 0,49 + Listing 0,15; **je 5 min erneut** (`MapView.tsx:2728`) |
| `/regenradar` (DE) | ~5,2 MiB | Nowcast-Tar + 9 Archiv-Tars (`radarFrames.ts:117`) + Listing |
| `/waldbrand` (Default) | 0 MiB GRIB | `fireDanger` + `fireHotspots` (`FirePage.tsx:184`) |
| `/waldbrand` + Feuerwetter/Ausbreitung | **~35 MiB** | 7 Steps × 6 Params (`iconD2FireWeather.ts:225-233`); `relhum_2m` ist **nicht gewärmt** → geht bei kaltem Edge komplett zum DWD |
| Modell-Umschalter → „ICON-D2-EPS" | **~200 MiB** | `loadFusedForecast.ts:243` — nur dann |

**Rechnung:** Bei 3,34 GB/Tag Cron-Traffic und 7 MiB je Kartensitzung entsprächen die
Warmer **etwa 480 Nutzer-Sitzungen pro Tag**. Ob die Seite so viele hat, weiß nur das
Netlify-Panel — nach Jans Log („nahezu alle Requests sind GRIB2-Proxy-Aufrufe" im
Sequenz-Muster des Warmers) eher nicht.

---

## 7. Bilanz: wer verbraucht was

| Verursacher | ~GB/Monat | Anteil | Vermeidbar? |
|---|---:|---:|---|
| warm-grib **EPS-Abschnitt** | **~48** | ~40 % | **ja, vollständig** — Pfad ist opt-in, praktisch nie angefragt |
| warm-grib 2D-Abschnitt | ~52 | ~43 % | ja, um ~80 % (Re-Warm + Vorprozessierung) |
| warm-wind | ~8 | ~7 % | ja, um ~90 % (Re-Warm + Vorprozessierung) |
| Nutzer-Sitzungen | ? | Rest | ja, um ~85 % (Vorprozessierung) |
| Statische Assets / SEO-Seiten | klein | — | — |
| Basemap, DEM | **0** | — | extern: `tiles.openfreemap.org` (`MapView.tsx:1272`), `s3.amazonaws.com/elevation-tiles-prod` (`fusion/elevation.ts:16`) |

---

## 8. Optionen

### Option A — Caching statt Wegzug

**Bewertung: löst das Problem nicht.** Der Edge-Cache ist bereits gesetzt (`immutable`,
6 h), der Browser-Cache ebenfalls, der App-Cache ebenfalls. Bandbreite wird am Egress
gemessen (§4.1). Was Option A **doch** bringt, sind die Deduplizierungs-Fehler: der
fehlende Cache auf `/_dwd_opendata` (RV-Listing 158 KB je Abruf), die zu kleine
`GRIB_CACHE_MAX`, die SW-Doppelablage. Das sind **Quick Wins**, keine Lösung.

- Ersparnis: **< 5 %** der Gesamtbandbreite
- Latenz: unverändert bis leicht besser
- Aufwand: klein · Risiko: klein
- STOPP & FRAGEN: **ja**, sobald `netlify.toml` oder eine Edge Function angefasst wird

### Option B — Vorprozessierung in GitHub Actions + Auslieferung außerhalb von Netlify

**Der Kern: die App braucht die GRIB2-Bytes gar nicht.** Sie subsamplet jedes Feld auf
`TARGET_WIDTH = 700` (→ **608 × 373**) und quantisiert auf 8 Bit, bevor irgendetwas
gezeichnet wird. Alles, was zwischen DWD-Datei und Textur passiert, ist Rechenarbeit, die
heute **jeder Besucher einzeln** macht — und für die jeder Besucher die volle GRIB-Datei
bezahlt.

**Gemessen** (echter Decode mit `decodeGrib2` + `buildWindRgba(…, 700)`, PNG mit
Sub-Filter/deflate 9, Lauf 2026082203):

| | DWD `.grib2.bz2` | vorprozessiert (PNG 608 × 373) | Faktor |
|---|---:|---:|---:|
| Wind je Schritt (u+v, RGB) | 2 049 KB | **256 KB** | **7,9×** |
| Wind Step 006 | 2 052 KB | 259 KB | 7,9× |
| Wind Step 012 | 2 104 KB | 268 KB | 7,8× |
| `t_2m` je Schritt (Grau) | 922 KB | **74 KB** | **12,5×** |
| `t_2m` Step 024 | 1 051 KB | 77 KB | 13,6× |
| **Warmsatz 2D, 269 Dateien** | **171,6 MiB** | **~11 MiB** (geschätzt aus ø 74 KB/Kanal) | **~15×** |
| **Kartensitzung (Default)** | 6,55 MiB | **0,71 MiB** | **9,2×** |

**Kein Qualitätsverlust auf der Karte:** 608 × 373 × 8 Bit ist *exakt das*, was der Shader
heute bekommt. Die Rampe `-20 … +40 °C` über 255 Stufen = 0,235 °C — heutiger Stand.

**Wichtige Ehrlichkeits-Einschränkung:** Nicht jeder Verbraucher nimmt das subgesampelte
Raster. `fetchStepField` liefert das **native** `GribField`, und einige Pfade rechnen darauf
(Punktabfragen, die Feuerwetter-Kette, `subsampledCorners`-Geometrie aus KL1). Ein Repack
muss **je Verbraucher** entschieden werden; wer native Auflösung oder echte Floats braucht,
bekommt entweder ein eigenes Format oder bleibt beim GRIB-Pfad. Das ist eine Phasen-Frage,
kein Blocker — aber es ist **nicht** „ein Format für alles".

**Wohin ausliefern:**

| Ziel | Egress-Kosten | Limits / Risiken | Eignung |
|---|---|---|---|
| **Cloudflare R2 + Custom Domain** | **0** (Egress frei, auch über S3-API/`r2.dev`) | Free: 10 GB Speicher, 1 Mio. Class-A- (`PutObject`), 10 Mio. Class-B-Ops/Monat. Neuer Provider, `R2_*`-Secrets, CORS, Domain | **beste Passung** — Bedarf: ~11 MiB/Lauf × 8 = 88 MiB/Tag; mit 24-h-Retention weit unter 10 GB, ~2 400 PUT/Tag ≈ 72 k/Monat |
| **GitHub Pages** (Orphan-Daten-Branch, Force-Push) | 0 | **100 GB/Monat weiche Grenze** — dieselbe Größenordnung, die gerade gerissen wurde; Pages ist ausdrücklich „not … a free web-hosting service to run your online business" | **riskant** — verlagert das Problem nur |
| **jsDelivr vor GitHub** | 0 | 20-MB-Dateigrenze (passt), Branch-Refs 12 h gecacht → **pro Lauf unveränderliche Dateinamen zwingend** (haben wir), Fremdabhängigkeit ohne SLA | **gute Zweitwahl / Fallback** |
| **Release-Assets** | 0 | CORS über Redirect zu messen (`audit/waldbrand-forecast.md` §2b, Weg C) | ungemessen |
| **Netlify Blobs** | zählt weiter auf Netlify | löst die Kostenfrage nicht | nein |

- Ersparnis: **~85–90 %** der Gesamtbandbreite; auf Netlify verbleibt nur noch die App-Shell
- Latenz: **besser** (0,7 statt 6,6 MiB, kein bz2 im Browser — der 4-s-WASM-Timeout aus
  V-WF-10 entfällt für diese Layer)
- Aufwand: **groß** — neuer Workflow (Decode in Node, dieselben Module wie der Client),
  Format-Vertrag, zweiter Origin, Client-Umschaltung mit Fallback auf den GRIB-Pfad
- Risiken: DWD CC BY 4.0 erlaubt Weiterverbreitung mit Namensnennung (haben wir bereits);
  Repo-Wachstum bei Commit-back **inakzeptabel** (88 MiB/Tag auf `main`) → Orphan-Branch
  oder R2; ein zweiter Origin ist eine neue Ausfallachse
- STOPP & FRAGEN: **ja** — neue Workflow-Datei, neuer Speicherweg, ggf. Secrets

### Option C — Client fetcht direkt bei opendata.dwd.de

**Gemessen, mit `Origin: https://buscosun.com`:**

| Anfrage | Status | `Access-Control-Allow-Origin` |
|---|---|---|
| GET GRIB-Datei | 206 (Range funktioniert!) | **fehlt** |
| GET Directory-Listing | 200 | **fehlt** |
| OPTIONS (Preflight) | **405** | **fehlt** |

**Damit ist Option C ausgeschlossen.** Kein ACAO, kein Preflight → der Browser blockt jede
Cross-Origin-Antwort. Der Proxy ist keine Bequemlichkeit, er ist die Bedingung. (Was der
Test nebenbei zeigt: `Range` liefert 206. Für die ICON-D2-Einzelflächen nützt das nichts —
eine Datei = eine GRIB-Nachricht. Für **EPS** wäre es interessant, 20 Member in einer
14-MB-Datei, `MAX_MEMBERS = 8` (`iconD2EpsSource.ts:41`) → ~60 % ungenutzt. Da EPS ohnehin
nur opt-in ist, lohnt der Aufwand nicht.)

### Option D — Weniger Daten laden

Additiv zu B, unabhängig davon wirksam:

1. **`relhum_2m` in den Warmsatz** oder das Feuerwetter auf den Jetzt-Bracket deckeln —
   heute 7 Steps × 6 Params ≈ 35 MiB je Aktivierung, davon ~7 MiB ungewärmt.
2. **RV-Listing ersetzen.** Die RV-Zeitstempel sind ein 5-Minuten-Raster; man kann sie
   rechnen statt ein 158-KB-HTML zu parsen (`radolan.ts:83-92`), mit Fallback auf das
   Listing, wenn der Rat danebengeht — dasselbe Muster wie die Wind-Spekulation.
3. **`DE_PAST_SEED_FRAMES = 9` erst beim Start des Rückblick-Loops** statt beim Öffnen der
   Radarseite (`NowcastRadarMap.tsx:221`): −4,5 MiB je Session, die den Loop nie startet.
4. **Warm-Horizont an das reale Nutzungsprofil binden.** Unter `START_NOW_ONLY` berührt
   eine Sitzung 2 Wind-Schritte; gewärmt werden 13. Bei `cape_ml` (2,7 MB/Datei) werden
   13 Schritte gewärmt für einen Layer, der nach `MAX_STEP=12` maximal 2 davon zeigt,
   solange der Slider nicht bewegt wird.

- Ersparnis: 30–50 % (ohne B), Latenz besser, Aufwand klein–mittel
- Risiko: Funktionserhalt — Punkte 1/3/4 dürfen **nichts entfernen**, nur später laden

### Option E — Netlify-Plan / Ausgabendeckel

Kein Engineering, aber die Notbremse: Plan anheben oder ein Spend-Cap setzen, damit ein
Ausreißer nicht wieder in „alle Sites pausiert" endet. **Ohne A–D kauft das nur Zeit** —
2 000–2 500 Credits/Monat Cron-Traffic sprengen auch den Pro-Plan (3 000).

---

## 9. Priorisierte Liste

### (a) Quick Wins — heute machbar, kein Architekturbruch

| # | Maßnahme | Datei:Zeile | Ersparnis | Risiko |
|---|---|---|---|---|
| **Q1** | **EPS-Warmung abschalten.** `EPS_PARAMS` leeren bzw. hinter ein Env-Flag (Muster `WARM_FEATURE_LAYERS`, `:102`). Der Client findet EPS weiterhin über seinen Directory-Scan — der Pfad feuert nur bei ausdrücklicher Modellwahl (`loadFusedForecast.ts:243`). | `scripts/warm-grib.mjs:136-139`, `:353` | **~48 GB/Mon** | klein — Funktionserhalt gewahrt, nur langsamer für den seltenen EPS-Nutzer |
| **Q2** | **Nur fehlende Steps nachwärmen.** Task-Liste = `latest.stepsByParam[p] \ existing.params[p]` statt aller Steps. | `warm-grib.mjs:352-354`, `warm-wind.mjs:179-185` | **~25–35 GB/Mon** | klein — der Fail-Safe-Vergleich muss dann die *kumulierte* Liste prüfen |
| **Q3** | **Warm-Horizont deckeln** auf den Near-Horizon (0…4 h) für die teuren Params (`cape_ml`, `cin_ml`, `sdi_2`, `tot_prec`). Ferne Steps holt der Client bei Bedarf. | `warm-grib.mjs:105-125` (`maxStep`) | **~30 GB/Mon** | klein — Latenz beim Scrubben steigt |
| **Q4** | **`GRIB_CACHE_MAX` 140 → 400.** Verhindert Refetches innerhalb derselben Sitzung. | `iconD2Precip.ts:175` | Session-Traffic | klein |
| **Q5** | **GRIB/RADOLAN aus dem SW-Datencache nehmen** (`/_dwd_`-Präfix im `fetch`-Handler durchreichen). Sie liegen bereits in `icon-d2-grib-decompressed-v1`. | `public/sw.js:89-105` | Speicher, Eviction-Qualität | klein |
| **Q6** | **RV-Listing rechnen statt laden**, Listing nur als Fallback. | `radolan.ts:83-92` | 158 KB × jeder Radar-Abruf | klein |
| **Q7** | **`seedDePastArchive` erst beim Rückblick-Start.** | `NowcastRadarMap.tsx:221` | 4,5 MiB/Session | klein |
| **Q8** | **Manifest-Commit vom Build entkoppeln** — ~900 Builds/Monat. Weg: Manifest nicht mehr aus `public/` bauen, sondern als Deploy-unabhängige Datei ausliefern. | `warm-*.yml:60-96` | Build-Compute | **STOPP & FRAGEN** |

> **Q1 + Q2 + Q3 allein bringen ~100 GB/Monat** — sie sind der Unterschied zwischen „Seite
> offline" und „Seite läuft". Sie fassen ausschließlich Skripte in `scripts/` an, keinen
> App-Code, keine Edge Function, keine `netlify.toml`.

### (b) Mittelfristig — Vorprozessierung + externes Hosting (Option B)

Vorgeschlagene Phasenfolge, jede mit eigenem Gate:

| Phase | Inhalt | Beleg-Gate |
|---|---|---|
| **BW1** | Format-Vertrag + Producer-Skript (Node, **dieselben Module wie der Client**: `gribDecode.ts`, `windFrameBuild.ts`) — schreibt PNG + `manifest.json` lokal. Kein Netz-Ziel, kein Workflow. | Byte-Identität Producer-PNG ↔ Client-Textur an ≥ 3 Läufen |
| **BW2** | Client liest bevorzugt das Repack, fällt bei Fehlen **transparent auf den GRIB-Pfad** zurück (Muster Manifest-Gate T1.3). Default-off hinter Flag („Rule 2"). | Wind + Temp pixelgleich, Verifier |
| **BW3** | Speicherweg (**Jans Entscheidung**: R2 vs. Orphan-Branch+jsDelivr) + Workflow. | Deploy-Preview, Kosten-Nachmessung |
| **BW4** | Ausrollung auf die teuren Layer (`cape_ml`/`cin_ml`/`sdi_2`, Feuerwetter), Warm-Crons entfallen für die repackten Params. | Bandbreiten-Nachmessung am Konto |

Erwartet nach BW4: Netlify trägt nur noch App-Shell + `/_dwd_opendata` (Radar, Warnungen) +
`/_firms` — grob **< 10 GB/Monat**.

### (c) Strukturell

| # | Maßnahme | Bewertung |
|---|---|---|
| **S1** | **Client→DWD direkt** | **ausgeschlossen** (gemessen: kein ACAO, OPTIONS 405) |
| **S2** | **GRIB2 verlässt den Browser vollständig** — der handgeschriebene Decoder inkl. CCSDS-AEC wird zum Build-Zeit-Werkzeug statt Laufzeit-Code. Nebenwirkung: der bz2-WASM-Timeout (V-WF-10) und ~90 ms/Kettenschritt Hauptthread-Last entfallen. | größte Hebelwirkung, größter Eingriff — erst nach BW4 sinnvoll |
| **S3** | **Netlify-Plan + Spend-Cap** (Option E) | Notbremse, nicht Lösung |
| **S4** | **Kostenbudget wie das Bundle-Budget.** `budget.json` rationiert KB im Bundle; für MB am Egress gibt es kein Äquivalent. Ein `bandwidth.json` mit Ratsche + `verify:bandwidth` (Warm-Sätze × gemessene Dateigrößen, netzfrei) würde jeden neuen Layer zwingen, seine Bytes zu deklarieren. | klein, hoher Schutzwert |

---

## 10. Auswirkung auf Doku und Regeln

| Dokument | Was sich ändert |
|---|---|
| `architecture.md` §11/§14 | Transport-Kapitel braucht einen Abschnitt „Kosten": Edge-Cache senkt Latenz, **nicht** Bandbreite. Die Warm-Crons sind als Kostenverursacher zu führen. |
| `decisions.md` | **Neuer ADR nötig:** „Vorprozessierte Raster statt GRIB2 im Browser" + der Speicherweg. Der R2-Entscheid vom 2026-08-19 („funktioniert, aber ohne Not", `audit/waldbrand-forecast.md:27`) ist **zu revidieren**: die Not ist eingetreten und messbar. R2s eine Eigenschaft — **Egress kostet nichts** — ist genau die, an der buscosun gerade scheitert. |
| `CLAUDE.md` | Statusblock + eine repo-weite Lehre (§ unten). |
| `audit/waldbrand-forecast.md` §2(b) | Weg E (R2) war dort „ohne Not"; Begründungslage hat sich geändert. |
| STOPP & FRAGEN | Betroffen: Edge Functions (Q8 evtl.), `netlify.toml` (nicht nötig für a), Warm-Crons (**Q1–Q3 fassen Cron-**Skripte** an — nach `CLAUDE.md` „Änderungen an Edge Functions/Warm-Crons/Manifest-Mechanik" = Jans Gate**), neue Workflow-Datei (BW3), neue Dependency (**keine** — PNG-Encoder existiert handgeschrieben in `scripts/build-clc-mask.mjs:81-106`, `bz2` ist bereits Runtime-Dependency). |
| Funktionserhalt | **Nichts in (a) und (b) entfernt eine Funktion.** Q1 macht den EPS-Pfad langsamer, nicht unerreichbar; Q3 verschiebt ferne Stunden vom Cron zum Bedarfsabruf; BW2 hat einen benannten Fallback. |

---

## 11. Offene Fragen an Jan

| # | Frage | Default, wenn keine Antwort |
|---|---|---|
| 1 | **Sofort:** Warm-Crons pausieren (`workflow_dispatch`-only), bis Q1–Q3 stehen? Ohne das läuft die Rechnung weiter. | ja — pausieren |
| 2 | Netlify-Plan anheben / Spend-Cap setzen? | Cap setzen, Plan nach Nachmessung |
| 3 | Speicherweg für BW3: **R2** (Egress 0, neuer Provider, Secrets) vs. **Orphan-Branch + jsDelivr** (kein neues Konto, Fremd-CDN ohne SLA)? | R2 — der Punkt ist genau der Egress |
| 4 | Darf der EPS-Warmsatz ganz entfallen (Q1)? | ja |
| 5 | Ist `START_NOW_ONLY` weiterhin der gewünschte Default? Es ist als „Testmodus" kommentiert (`MapView.tsx:395`) und spart pro Sitzung ~85 % der Layer-Bytes. | ja, beibehalten |

**Offene Messung:** die tatsächliche Edge-Cache-Trefferquote (`Cache-Status`-Header) —
nicht erhebbar, solange die Seite 503 liefert. Nachzuholen (V-BW-9).

---

## 12. Verbesserungskatalog (V-Einträge, hier gesammelt — `improvements.md` fehlt im Baum)

| ID | Befund | Mehrwert | Skizze |
|---|---|---|---|
| **V-BW-1** | EPS-Warmung: 200,6 MiB/Lauf für einen opt-in-Pfad | ~48 GB/Mon | `EPS_PARAMS = []` hinter Env-Flag, `warm-grib.mjs:136` |
| **V-BW-2** | Warmer laden bei Teil-Abdeckung alle Steps neu | ~25–35 GB/Mon | Differenzmenge gegen `existing.params`, `warm-grib.mjs:352` / `warm-wind.mjs:179` |
| **V-BW-3** | Warm-Horizont ignoriert das reale Nutzungsprofil (`START_NOW_ONLY`) | ~30 GB/Mon | `maxStep` der teuren Params auf Near-Horizon |
| **V-BW-4** | ~900 Netlify-Builds/Monat durch Manifest-Commit-back | Compute + kalter Asset-Cache | Manifest deploy-unabhängig ausliefern |
| **V-BW-5** | `/_dwd_opendata` ohne jeden Cache-Header (RV-Tars, Listings) | Bandbreite + Latenz | Cache-Header bzw. Zeitstempel rechnen statt Listing laden |
| **V-BW-6** | `GRIB_CACHE_MAX = 140` < eigener Bestand → Refetch in derselben Sitzung | Session-Traffic | Deckel auf ~400, `iconD2Precip.ts:175` |
| **V-BW-7** | Service Worker legt jede GRIB-Datei ein zweites Mal ab, liest sie nur offline | Speicher, Eviction | `/_dwd_`-Präfix im `fetch`-Handler durchreichen, `sw.js:89` |
| **V-BW-8** | `t_2m` + `hsurf` (2,5 MiB) laden **immer**, nur für Stadt-Labels | 2,5 MiB/Session | Labels aus einem winzigen Stationspunkt-JSON statt aus dem Vollgitter |
| **V-BW-9** | Edge-Cache-Trefferquote nie gemessen | Grundlage jeder Transport-Aussage | `Cache-Status` an ≥ 20 URLs nach Entsperrung |
| **V-BW-10** | Kein Egress-Budget analog `budget.json` | verhindert die Wiederholung | `bandwidth.json` + `verify:bandwidth` (netzfrei, Warmsätze × Größentabelle) |
| **V-BW-11** | `relhum_2m` ungewärmt, aber Pflichtanker des Feuerwetters (7 Steps) | Latenz + DWD-Last | in den Warmsatz oder Fenster deckeln |
| **V-BW-12** | `DE_PAST_SEED_FRAMES = 9` lädt eager beim Öffnen der Radarseite | 4,5 MiB/Session | erst beim Start des Rückblick-Loops |

---

## 13. Lehren (repo-weit)

1. **Ein Cache-Treffer ist kein gesparter Byte.** Die T1/T2-Transportlinie hat Latenz und
   DWD-Last gesenkt und war dafür richtig — sie hat die Kosten aber nur *verschoben*, vom
   DWD zum eigenen Konto. Jede künftige Transport-Entscheidung muss **Egress** getrennt von
   **Latenz** ausweisen.
2. **Ein Warm-Cron ist ein Nutzer, der jede Datei anfordert.** Er ist damit teurer als alle
   echten Nutzer zusammen, sobald das Verhältnis „gewärmte Dateien : tatsächlich
   abgerufene Dateien" schlecht ist. Hier: 269 gewärmte gegen ~6 abgerufene je Sitzung —
   **45 : 1**. Ein Warmer braucht eine ausgewiesene Trefferquote, sonst ist er reine Kosten.
3. **Progressive Publikation verlangt Differenz-Logik.** „Deckt das Manifest den Lauf ab?"
   ist die falsche Frage, wenn die Antwort „nein" bedeutet: alles neu laden. Richtig ist
   „welche Steps fehlen?".
4. **Die App rechnet die Daten ohnehin klein** (608 × 373 × 8 Bit) — und zahlt trotzdem für
   das 1 215 × 746-Original, einmal pro Besucher. Gemessen ist das der Faktor **8–13×**.
   Wo ein Client eine Quantisierung erzwingt, gehört die Quantisierung **vor** den Transport.
5. **Ein „Testmodus" als Default ist ein Kostenmechanismus ohne Namen.** `START_NOW_ONLY`
   spart pro Sitzung ~85 % — er heißt aber „Testmodus" und ist nirgends als
   Bandbreiten-Entscheidung dokumentiert. Er sollte als solche geführt werden.

---

# 14. Nachmessung 2026-08-23 — Seite wieder online

> Jans Hinweis „die Seite ist wieder online". Alle Messungen dieses Abschnitts am **echten
> Prod-Build**: Chrome DevTools MCP (isolierter Kontext, kalter Cache) + Node-Sonden +
> GitHub-Actions-API. Referenzzeit 2026-08-22 ~23:00 UTC.

## 14.1 Der Edge-Cache: er funktioniert — aber nur lokal (V-BW-9 geschlossen)

Dieselbe URL dreimal hintereinander über `/_dwd_wind`:

```
#1 200  1037 KB  3841 ms  cache-status="Netlify Edge"; fwd=miss; fwd-status=200; stored
#2 200  1037 KB  1033 ms  cache-status="Netlify Edge"; hit; ttl=21598
#3 200  1037 KB   627 ms  cache-status="Netlify Edge"; hit; ttl=21598
```

Über `/_dwd_grib` identisch (825 → 705 → 545 ms, `hit; ttl=21599`).

**Der Cache greift.** `cache: 'manual'` + `Netlify-CDN-Cache-Control` sind korrekt
verdrahtet, `Cache-Control: public,max-age=21600,immutable` erreicht den Browser. Aber:

> **In der vollständigen Header-Liste steht ausschließlich `"Netlify Edge"`. Ein Eintrag
> `"Netlify Durable"` kommt NIE vor.**

Nach Netlifys eigener Doku ist „Edge Cache" der **lokale HTTP-Cache eines CDN-Knotens**,
„Durable Cache" die **globale** Schicht — und der `durable`-Direktiv ist für *Functions*
dokumentiert, **nicht für Edge Functions**. Die Messung bestätigt die Doku: das Wort
`durable` in `dwd-grib.ts:94` und `dwd-wind.ts:88` ist **wirkungslos**.

**Konsequenz — der eigentliche Konstruktionsfehler der Warm-Linie:** Ein Warm-Durchlauf
füllt **einen** PoP, nämlich den, den der GitHub-Actions-Runner erreicht (GitHub-hosted
Runner stehen nicht in der DACH-Region). Ein Besucher aus Frankfurt oder Zürich trifft
einen **anderen** Knoten und damit einen **kalten** Cache. Die Warmer zahlen den vollen
Egress für eine Wärmung, die die Zielgruppe nicht erreicht.

> Was ich **nicht** beweisen kann: welchen PoP der Actions-Runner konkret trifft. Bewiesen
> ist nur, dass es keine globale Schicht gibt — damit ist „ein Fill wärmt alle" falsch.

## 14.2 Prod ist sieben Tage alt — beide Manifest-Gates sind tot

| Beleg | Befund |
|---|---|
| `buscosun.com/latest-wind.json` | `run = 2026081609`, `updatedAt = 2026-08-16T09:53` |
| `buscosun.com/latest-grib.json` | `run = 2026081609`, `eps.run = 2026081606` |
| `raw.githubusercontent…/main/public/latest-wind.json` | `run = 2026082200` — **Repo ist 6 Tage weiter als Prod** |
| `/wetterkarte/wind` | rendert die **Startseite** → RT1-Routing (22.08.) ist nicht deployt |
| Service Worker in Prod | `bsc-shell-v1` / `bsc-data-v1` / `bsc-assets-v1` → **v1**, nicht das RT1-`v2` |

**Seit dem 16.08. ist kein Produktions-Deploy mehr gelandet.** Jeder Manifest-Commit der
Warmer seit dem 16.08. liegt in `main` und wurde nie ausgeliefert.

Die Wirkungskette, live gemessen:

1. Client liest `/latest-wind.json` → Lauf `2026081609`, **7 Tage alt**
2. `MAX_MANIFEST_RUN_AGE_H = 24` (`iconD2WindSource.ts:60`) → Manifest **verworfen**.
   Der Guard arbeitet korrekt — die Dateien dieses Laufs sind beim DWD weg (gegengeprüft:
   `…2026081609_001_2d_u_10m.grib2.bz2` → **404**, `cache-control: no-store`, nicht gecacht)
3. → Fallback `resolveViaScan()` → **Directory-Scan** über `/_dwd_opendata`
   (gemessen: `…/21/t_2m/` und `…/21/u_10m/`, je **18 KB**, 873 / 937 ms)
4. Der Scan findet den **aktuellen** Lauf `2026082221` — den der Warmer (steht auf
   `2026082203`) nie angefasst hat → **kalter Edge**
5. Gemessene Ladezeiten je Datei: **1 738 / 1 752 / 1 794 / 1 857 / 2 000 / 2 015 / 2 938 ms**
   — gegen **545–627 ms** bei einem Edge-Treffer (§14.1)

> **Die Warm-Crons kosten ~120 GB/Monat, und ihr Ergebnis wird derzeit von keinem einzigen
> Besucher benutzt.** Sie wärmen den falschen Lauf, auf dem falschen Knoten, mit einem
> Manifest, das nie ausgeliefert wird.

## 14.3 Kaltsitzung Wetterkarte — gemessen statt modelliert

Chrome, isolierter Kontext, leerer Cache, Weg wie ein echter Nutzer (Startseite →
„DACH-Wetterkarte"), Default-Layer Wind, `START_NOW_ONLY` aktiv (Slider max = 2, bestätigt):

| Ressource | KB | Dauer |
|---|---:|---:|
| `[grib] t_2m/…_2026082221_003` | 1 050 | 2 938 ms |
| `[grib] t_2m/…_2026082221_002` | 1 047 | 1 794 ms |
| `[wind] u_10m/…_002` | 1 042 | 1 738 ms |
| `[wind] u_10m/…_003` | 1 042 | 2 000 ms |
| `[wind] v_10m/…_003` | 1 016 | 2 015 ms |
| `[wind] v_10m/…_002` | 1 014 | 1 752 ms |
| `[grib] hsurf/…_000_0_hsurf` | 647 | 1 857 ms |
| `[opendata] …/21/t_2m/` (Listing) | 18 | 873 ms |
| `[opendata] …/21/u_10m/` (Listing) | 18 | 937 ms |
| **Σ GRIB / Proxy** | **6,73 MiB** | |
| App-Shell (46 Requests, gz über die Leitung) | 0,53 MiB | |
| **Σ Kaltsitzung** | **7,26 MiB** | |

**Das Modell aus §6 sagte 7,1 MiB — gemessen 7,26 MiB.** Die Rechnung dieser Diagnose steht.

Nebenbefunde:

- **Basemap und DEM kosten nichts.** `tiles.openfreemap.org`: 73 Requests / 7,1 MB dekodiert;
  `s3.amazonaws.com` (Terrarium-DEM): 94 Requests — beide **extern**, kein Netlify-Byte. Der
  Basemap-Traffic ist damit fast so groß wie der Wetterdaten-Traffic und trotzdem gratis.
  Das ist der Beweis, dass „woanders ausliefern" (Option B) trägt.
- **Reload mit warmem Client-Cache: 2 Requests, 36 KB, 0 MiB GRIB.**
  `icon-d2-grib-decompressed-v1` hält 7 Einträge → der App-Cache arbeitet einwandfrei. Übrig
  bleiben nur die zwei Directory-Listings, die es ohne den toten Manifest-Gate nicht gäbe.
- **V-BW-7 live bestätigt:** `bsc-data-v1` enthält **163 Einträge** — der Service Worker legt
  jede GRIB-Datei ein zweites Mal ab und liest sie nur offline.

## 14.4 `/_dwd_opendata` — bestätigt ohne jeden Cache

```
#1 200  154 KB  1144 ms  cache-status="Netlify Edge"; fwd=miss; fwd-status=200   cache-control=—
#2 200  154 KB   827 ms  cache-status="Netlify Edge"; fwd=miss; fwd-status=200   cache-control=—
```

Kein `stored`, kein `hit`, kein `cache-control`. Das RV-Listing kostet **154 KB bei jedem
Abruf** — jede Radar-Session, jeder 5-Minuten-Refresh. (V-BW-5 bestätigt.)

## 14.5 Der aktuelle Cron-Zustand — ein scharfgestelltes Risiko

GitHub-Actions-API, letzte 60 Läufe:

| Workflow | Takt | Dauer | Ergebnis |
|---|---|---|---|
| `warm-grib` | alle ~13–19 min | **324–666 s, typisch ~330 s** | „success" |
| `warm-wind` | alle ~13–19 min | 22–49 s | „success" |
| `health` | stündlich | 25 s | **failure** |

- **`warm-wind` steigt früh aus** (25 s): das Repo-Manifest steht auf `2026082200`, und genau
  diesen Lauf führt das DWD-`00z`-Verzeichnis noch → `manifestCovers` = true → Early-Exit.
- **`warm-grib` steigt NIE aus** (~330 s): Repo-Manifest `run = 2026082203`,
  `eps.run = 2026082200`; das DWD führt inzwischen **`2026082218`** (2D **und** EPS, per
  Verzeichnis-Sonde bestätigt) → `needMain = true` **und** `needEps = true` → **volle
  Task-Liste bei jedem Tick**.
- **Der letzte Manifest-Commit ist vom 22.08. 04:21.** Seither ~19 h × ~4,5 Läufe/h ≈ **85
  Durchläufe ohne einen einzigen Advance.**

Warum kein Advance: während des 503 schlug jeder `warmUrl` fehl → Near-Horizon-Fail-Safe →
Manifest unverändert → kein Commit → nächster Tick beginnt wieder bei null. Die ~330 s sind
die Retry-Backoffs (284 Dateien × 3 Versuche × (1 s + 3 s) ÷ 4 Worker ≈ 285 s), nicht ein
echter Transfer — dafür spricht auch, wie **konstant** sie sind (324/329/331/332/333/334/337/338).

**Die Gefahr beginnt jetzt.** Mit der wieder erreichbaren Seite wird der nächste Durchlauf
ein **echter** Transfer von **372 MiB** (171,6 2D + 200,6 EPS). Gelingt er vollständig,
schreibt er das Manifest und die folgenden Ticks steigen aus. Reißt aber **eine einzige
Datei** (ein noch unpublizierter Step → 404, ein transienter Fehler), greift der Fail-Safe —
und der volle 372-MiB-Pass wiederholt sich **alle 13 Minuten**:

> 372 MiB × ~110 Läufe/Tag = **~40 TiB/Tag**.

Der EPS-Fail-Safe ist der strengere:
`latestEps.stepsByParam[p].every(s => warmedEps[p].includes(s))` (`warm-grib.mjs:311-313`)
verlangt **jeden** Step **jedes** EPS-Params. Ein Ausfall unter 15 Dateien à 13 MB verwirft
alle 15.

> Die Historie zeigt, dass es im Normalbetrieb nicht dauerhaft schleift (Sonde über die
> `latest-grib.json`-Commits: `eps.run` wandert sauber 2026081921 → … → 2026082200, ~2–3
> Commits je 3-h-Zyklus — genau die ~20 Passes/Tag aus §5.3). Aber der Zustand von **heute**
> ist genau der, in dem die Schleife entsteht.

---

# 15. Was die Nachmessung an der Bewertung ändert

| Aussage aus §0–§13 | Status nach der Nachmessung |
|---|---|
| Site 503, Konto über Kontingent | **war so, jetzt 200** |
| Edge-Caching senkt die Rechnung nicht | **unverändert richtig** — Egress bleibt Egress |
| Warm-Crons = 100–125 GB/Monat | **unverändert**; Pass-Kosten und Häufigkeit bestätigt |
| EPS = ~40 % der Rechnung | **unverändert** — plus neuer Fail-Safe-Verstärker |
| Kaltsitzung ~7,1 MiB | **gemessen 7,26 MiB** — Modell bestätigt |
| Client → DWD unmöglich (CORS) | **unverändert** |
| Repack spart Faktor 8–13× | **unverändert** |
| *neu* | **`durable` wirkt auf Edge Functions nicht** → Wärmung ist per-PoP, nicht global |
| *neu* | **Prod seit 16.08. nicht deployt** → beide Manifest-Gates tot → jeder Besucher zahlt den ungewärmten Pfad (1,7–2,9 s statt 0,55 s je Datei) |
| *neu* | **`warm-grib` hängt seit ~19 h ohne Advance** und ist auf einen 372-MiB-Pass alle 13 min scharfgestellt |

**Die Warm-Linie ist damit nicht nur teuer, sondern in ihrem gegenwärtigen Zustand
wirkungslos.** Sie hat drei unabhängige Bedingungen, und alle drei sind gerade verletzt:

1. **ein globaler Cache** — existiert für Edge Functions nicht (§14.1);
2. **ein ausgeliefertes Manifest** — seit 16.08. nicht deployt (§14.2);
3. **ein gewärmter Lauf, der dem entspricht, was der Client anfragt** — der Warmer steht auf
   `…03`, die Clients holen `…21` (§14.2).

---

# 16. Aktualisierte Priorisierung

## Sofort (Stunden, Reihenfolge zwingend)

| # | Maßnahme | Warum jetzt |
|---|---|---|
| **N1** | **`warm-grib` anhalten** (`schedule` auskommentieren bzw. `workflow_dispatch`-only) | verhindert den scharfgestellten 372-MiB-alle-13-min-Fall. Einzige Maßnahme, die keinen Aufschub verträgt. |
| **N2** | **Deploy-Pipeline entsperren** — warum landet seit 16.08. kein Produktions-Deploy? (blockierte Builds bei erschöpften Credits ist die naheliegende Erklärung; am Netlify-Panel zu prüfen) | Ohne das wirkt **keine** der übrigen Maßnahmen, weil weder Code noch Manifest in Prod ankommt. |
| **N3** | Q1 (EPS-Warmung aus) + Q2 (nur fehlende Steps) + Q3 (Warm-Horizont) — §9(a) | ~100 GB/Monat |

## Danach unverändert

§9(b) BW1–BW4 (Vorprozessierung, Faktor 8–15×) und §9(c). Die Nachmessung **stärkt** sie:
mit dem Repack entfallen die Warm-Crons **und** die `durable`-Frage **und** die
Manifest-Gates. Der Client lädt dann eine 256-KB-PNG statt zweier 1-MB-GRIB-Dateien, aus
einem Speicher mit kostenlosem Egress — genau das Modell, nach dem Basemap und DEM heute
schon gratis laufen (§14.3).

## Neu bewertet

| # | Maßnahme | Bewertung |
|---|---|---|
| **N4** | **GRIB-Proxy von Edge Function auf Netlify Function umstellen**, damit `durable` wirklich greift | macht die Wärmung erstmals global wirksam, senkt DWD-Last und Latenz — **senkt die Bandbreite aber weiterhin nicht**. Lohnt nur, wenn die Warm-Linie bleiben soll, statt durch BW1–BW4 ersetzt zu werden. **Empfehlung: nicht bauen.** STOPP & FRAGEN (Edge Function). |
| **N5** | Staleness-Guard (`MAX_MANIFEST_RUN_AGE_H`) | **kein Handlungsbedarf** — er hat den 404-Sturm auf den toten 16.08.-Lauf verhindert (gegengeprüft: 404, `no-store`, nicht gecacht). Der Code ist hier richtig; falsch ist der Betrieb drumherum. |

---

# 17. Ergänzende V-Einträge

| ID | Befund | Skizze |
|---|---|---|
| **V-BW-13** | `durable` in `Netlify-CDN-Cache-Control` ist auf Edge Functions wirkungslos — gemessen: `Cache-Status` führt nur `"Netlify Edge"` | Kommentar in `dwd-grib.ts:92-94` / `dwd-wind.ts:86-88` korrigieren (er behauptet „Durable Edge Cache"), Entscheidung N4 dokumentieren |
| **V-BW-14** | Prod-Deploy seit 16.08. nicht gelandet, unbemerkt — `health.yml` schlägt zwar fehl, aber der Alarm läuft ins Leere | Health-Check muss die **Deploy-Aktualität** prüfen (Manifest in Prod vs. Manifest in `main`) und sichtbar melden |
| **V-BW-15** | Der EPS-Fail-Safe ist all-or-nothing über 15 Dateien à 13 MB → ein Ausfall wirft 200 MiB weg und erzwingt den vollen Neuversuch | Teil-Advance je Param zulassen; das Muster `mergeSteps` (`warm-wind.mjs:222`) existiert bereits |
| **V-BW-16** | Kein Deckel gegen Wiederholungsschleifen in den Warmern | Abbruch nach N erfolglosen Durchläufen desselben Laufs + Meldung, statt endlos alle 13 min |

---

# 18. Rückzug des Cache-Wärmens + Gate GBW1 (2026-08-23)

> Jans Auftrag: *„Produkt 1 ist stark und sollte beibehalten werden. Produkt 2
> bitte komplett löschen."* — **Ausdrückliche Ausnahme vom Funktionserhalt**
> (CLAUDE.md), Muster wie die Layer-Rückzüge vom 2026-08-22. Damit ist N1
> (warm-grib anhalten) gegenstandslos: ohne GET-Schleife gibt es den
> 372-MiB-alle-13-min-Fall nicht mehr. **Kein Commit** (CLAUDE.md: keine Commits
> ohne Auftrag).

## 18.1 Die zwei Produkte des Crons

Die Warm-Crons erzeugten zwei getrennte Dinge. Die Trennung ist der ganze Punkt:

| | Produkt 1 — **Manifest** | Produkt 2 — **gewärmter Edge-Cache** |
|---|---|---|
| Was | `latest-{wind,grib}.json`: Lauf + Step-Listen | ~372 MiB/Durchlauf durch `SITE_URL/_dwd_*` |
| Nutzen | Client spart den Directory-Scan (Code: ~1,9 s; gemessen 2 Listings à 18 KB, 873/937 ms) + „stale statt kalt" | sollte den ersten Besucher vom kalten DWD-Pfad befreien |
| Kosten | ein paar DWD-Listings, **0 Netlify-Bytes** | **~123 GB/Monat** |
| Wirkt? | **ja** | **nein** — §14.1: `Cache-Status` führt nur `"Netlify Edge"`, nie `"Netlify Durable"` ⇒ per-PoP-Cache ⇒ gewärmt wurde der PoP des GitHub-Runners |
| Status | **behalten** | **gelöscht** |

Zwei Annahmen waren verfallen, ohne dass eine Codezeile falsch wurde:

1. **Plattform:** „`durable` legt es in den globalen Cache" war im Juli 2026 eine
   plausible Lesart der Netlify-Doku und steht so im Datei-Kopf. Der
   `Cache-Status`-Header widerlegt sie.
2. **Client:** Der Warmsatz war für einen Client dimensioniert, der 13 Wind- und
   25 Temperaturschritte lud. `START_NOW_ONLY` (2026-07-23) hat das auf **zwei**
   reduziert; der Warmsatz schrumpfte nie mit. Das Verhältnis „gewärmte zu
   abgerufenen Dateien" wanderte damit still von ~7 : 1 auf **45 : 1**.

Genau dagegen zielt V-BW-10 (`bandwidth.json` + `verify:bandwidth`): `budget.json`
rationiert KB im Bundle, für MB am Egress gab es kein Gegenstück.

## 18.2 Was gelöscht wurde

| Datei | Entfernt |
|---|---|
| `scripts/warm-grib.mjs` | `warmUrl()` (inkl. T2c-Retry), `warmStepUrl()`, `warmEpsStepUrl()`, `stepFile()`, `epsStepFile()`, `invariantFile()`, `epsInvariantFile()`, `pad3`, `WARM_CONCURRENCY`, der Task-Pool und das Invarianten-Wärmen (hsurf, clat/clon) |
| `scripts/warm-wind.mjs` | `warmOne()`, `stepFile()`, `pad3` |
| beide | Manifest-Feld `warmedThroughProxy` — es hätte behauptet, was nicht mehr passiert |
| `.github/workflows/warm-{grib,wind}.yml` | `WARM_CONCURRENCY`, Ablauf-Kommentare zum Wärmen |

**Erhalten (Produkt 1, unverändert):** Discovery (`listSteps`/`listEpsSteps`,
`findLatestCompleteRun`/`findLatestEpsRun`), Early-Exit (`manifestCovers`/
`manifestCoversEps`), Near-Horizon-Fail-Safe, V-81-Sicherung `mergeSteps`,
atomares Schreiben, Commit-back, `FORCE`, `FAIL_STEP`, `WARM_MAX_STEP`,
`NEAR_REQUIRED`, die Param-Listen `BASE_PARAMS`/`FEATURE_PARAMS`/`EPS_PARAMS`.

**Nicht angefasst:** `netlify/edge-functions/dwd-grib.ts` und `dwd-wind.ts`. Der
Edge-Cache bleibt und wirkt weiter — er füllt sich jetzt ausschließlich durch
echte Besucher (gemessen: `fwd=miss; stored` → `hit; ttl=21598`, 6 h).

**Neues Feld `publishedFor`.** Ersetzt `warmedThroughProxy` als Herkunfts-Anker
des Wächters H4 (Schutz gegen ein lokal geschriebenes Manifest in Prod, V-02/V-100).
`health-manifests.mjs` akzeptiert übergangsweise beide Schreibweisen, damit der
Wächter grün bleibt, solange in Prod noch ein Manifest von vor dem Rückzug liegt.

**Bewusste Verhaltensänderung (gehört ins Gate, nicht in eine Fußnote):** das
Manifest nennt jetzt die Steps, die das DWD **listet**, statt der Steps, die
erfolgreich **heruntergeladen** wurden. Tragfähig, weil (a) die Liste noch nie
aus den Bytes stammte, sondern immer aus `listSteps`; (b) der Client einen
fehlenden Step pro Schritt abfängt (`iconD2WindSource.ts:317-320`); (c) ein
unbrauchbares Manifest komplett auf den Directory-Scan zurückfällt
(`iconD2WindSource.ts:385-393`, `iconD2Precip.ts:112-116`); (d) `mergeSteps`
weiterhin verhindert, dass ein Manifest schrumpft.

## 18.3 Belege

**Kein Byte durch Netlify — mit unauflösbarer `SITE_URL` erzwungen.** Ginge auch
nur ein Fetch durch `SITE_URL`, müsste der Lauf scheitern:

```
$env:SITE_URL='https://darf-nicht-benutzt-werden.invalid'; FORCE=1

[warm-grib] Start · publishedFor=https://darf-nicht-benutzt-werden.invalid · …
[warm-grib] Lauf 2026082309 vollständig genug (near 0…4 ✓ für 14 Params), warmbare Steps gesamt: 269
[warm-grib] EPS-Lauf 2026082309 (Client-Wahl), warmbare Steps gesamt: 15
[warm-grib] 284 Steps aus den DWD-Listings bestätigt — 0 Bytes durch …
[warm-grib] Manifest umgelegt → 2D-Lauf 2026082309 (neu) · EPS-Lauf 2026082309 (neu). Fertig.
--- Dauer: 2.7 s · exit=0 ---
```

| | vorher | nachher |
|---|---:|---:|
| Netlify-Egress je `warm-grib`-Durchlauf | **372 MiB** | **0** |
| Netlify-Egress je `warm-wind`-Durchlauf | 26,2 MiB | **0** |
| Netlify-Requests je Durchlauf | 310 | **0** |
| Laufzeit `warm-grib` | ~330 s | **2,7 s** |
| Hochrechnung | ~123 GB/Monat | **0** |

**Manifest inhaltlich unverändert**, nur der Herkunfts-Anker ist neu:
`Felder: run, runAt, updatedAt, publishedFor, params, eps` —
`warmedThroughProxy? false · mode? false`. Step-Listen wie zuvor
(`t_2m:25(0..24)`, `tot_prec:28(0..27)`, EPS je `[0,3,6]`).

**Wächter grün gegen die erzeugten Dateien:** `health-manifests --file` → **8/8**,
darunter „H5 Step-Vollständigkeit — 14 Param-Liste(n) lückenlos ab 0".

**Verifier / Typecheck:**

| Lauf | Ergebnis |
|---|---|
| `verify:health` | **20/20** (vorher 15, +5 Fälle für `publishedFor`) |
| `verify:warm-wind` | 13/13 |
| `verify:warm-budget` | 30/30 |
| `verify:layer-transport` | grün (Edge Functions unberührt) |
| `verify:wind-transport` | grün |
| `typecheck` | grün (Exit 0) |
| `node --check` beide Skripte | grün |

> `verify:warm-budget` liest `BASE_PARAMS`/`FEATURE_PARAMS`/`EPS_PARAMS` per
> Regex aus dem Quelltext und verlangt u. a. `EPS_PARAMS = [… 'clct' …]`. Die
> Listen bleiben deshalb **inhaltlich unangetastet** — sie beschreiben jetzt,
> welche Params ins Manifest gehören, nicht mehr, was gewärmt wird. (Muster-Falle
> „Verifier-Regexe", `audit/aktivfeuer.md`.)

Diff: 6 Dateien, +217/−216 — `warm-grib.mjs` −233/+… (Netto ~40 Zeilen kürzer).

## 18.4 Die fünf Selbstverifikations-Fragen

1. **Funktionserhalt** — **bewusst durchbrochen**, auf Jans ausdrücklichen
   Auftrag. Produkt 2 ist entfernt, nicht abgeschaltet. Produkt 1 ist
   vollständig erhalten (§18.2, Liste „Erhalten").
2. **Desktop pixelgleich** — kein UI-Code berührt (Diff: 4 Skripte, 2 Workflows).
3. **Touch-Targets** — nicht betroffen.
4. **Konsole sauber** — nicht betroffen; die Skript-Läufe sind Exit 0 ohne Fehler.
5. **Long Tasks** — nicht betroffen (kein Client-Code).

## 18.5 Was NICHT erledigt ist

| Offen | Warum |
|---|---|
| **N2 Deploy-Pipeline** | Prod liefert weiter den Build vom 16.08.; die Manifeste erreichen den Client erst nach einem erfolgreichen Deploy. **Ohne N2 wirkt der Rückzug nur auf die Rechnung, nicht auf die Latenz.** Netlify-Panel = Jans Seite. |
| **V-BW-4 (~900 Builds/Monat)** | Der Commit-back löst weiterhin je Advance einen Netlify-Build aus — jetzt der letzte verbliebene Cron-Kostenposten. |
| **Dateinamen `warm-*.mjs`** | historisch, es wird nichts mehr gewärmt. Umbenennen träfe `verify-warm-budget.mjs` (liest per Pfad) und `verify-warm-wind.mjs` (Import) — zurückgestellt, damit der Rückzug ein reiner Verhaltens-Diff bleibt. Als **V-BW-18** notiert. |
| **Q2 (Delta statt Vollauf)** | gegenstandslos geworden — der Vollauf zieht keine Bytes mehr. |
| **BW1–BW4 (Repack)** | betrifft den Nutzer-Traffic, unverändert offen; Speicherweg (R2 vs. Pages/jsDelivr) ist Jans Entscheidung. |
| **`clat`/`clon`-Warmung war ohnehin tot** | Beim Messen aufgefallen: die EPS-Invarianten-URL lieferte **404** (Namensmuster passte nicht). Mit dem Rückzug entfallen — der Client holt sie über seinen eigenen Pfad. **V-BW-17 ist damit erledigt.** |

## 18.6 Selbstheilung beobachtet

Während der Umsetzung hat sich der in §14.5 beschriebene Hängezustand von selbst
gelöst: `warm-grib` um 23:25 UTC ein echter Durchlauf (177 s), Commit 23:28,
seither Early-Exit in 22–24 s; `health` wieder grün. Die 372-MiB-Schleife ist
also nicht eingetreten — der Rückzug nimmt ihr dauerhaft die Grundlage.

| ID | Befund | Skizze |
|---|---|---|
| **V-BW-18** | `warm-grib.mjs`/`warm-wind.mjs` heißen nach einer Funktion, die es nicht mehr gibt | Umbenennen nach `publish-*-manifest.mjs`, zusammen mit `verify-warm-budget.mjs` (Pfad) und `verify-warm-wind.mjs` (Import) |
