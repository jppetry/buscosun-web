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
| **V-BW-21** | `buildDemImage` blockiert den Hauptthread **2,57–2,70 s** (sechs Läufe an ruhiger Maschine, §23.7; zuerst gesehen in §22.7f): 700 × ~1 140 Zellen × 9 Stützpunkte, gipfelerhaltendes Maximum. Beginnt in **jedem** der sechs Läufe 2–26 ms nach der letzten Terrarium-Kachel und ist auf beiden Datenwegen gleich groß (2 573 gegen 2 591 ms) — das DEM kommt von Terrarium/S3 und hat mit ICON-D2 nichts zu tun. Der Repack macht die Aufgabe nur sichtbarer, weil die GRIB-Wartezeit davor entfällt | die größte einzelne Ruckelquelle des Kartenstarts; sie überlebt jede Transport-Optimierung | in einen Worker (das DEM ist reine Rechnung ohne DOM, wie `windFrameBuild`), oder in Scheiben über `requestIdleCallback`. Nebenweg: das Ergebnis je Bounds in IndexedDB legen — es ist statisch, `demCache` hält es heute nur bis zum Reload |
| **V-BW-22** | **`cape_ml` kostet 12,65 MiB für EINE Zahl** (§24.2): `fetchPeakCapeAtPoint` lädt vier vollständige ICON-D2-Raster (je 3,0–3,2 MiB), um das Maximum an einem Punkt über 0…3 h zu bilden — **76 % der DE-Regenradar-Sitzung**. Der Plan hielt `/regenradar` für ICON-D2-frei; das gilt für `radarFrames.ts`, nicht für die Seite (`NowcastRadarMap.tsx:32`) | der mit Abstand größte Posten der Radarseite; 13 264 KB für 4 Byte Aussage | drei Wege in §24.6, Empfehlung (a): erst laden, wenn der Gewitter-Index sichtbar gebraucht wird. `convectiveIndex` hat ein benanntes `fallbackRiskPct` und läuft ohne CAPE weiter (so wie heute in AT/CH). **Jans Entscheidung** — der Weg ändert eine angezeigte Aussage |
| **V-BW-23** | **CH lädt 81 Stations-CSVs einzeln** (`ogd-smn_<stn>_t_now.csv`, ~8,5 KB je Datei) plus ein 151-KB-Stationsverzeichnis: gemessen **861 862 B und 8 Sekunden** = 40 % der CH-Sitzung, mehr als das CH-Radar selbst | größter Posten der CH-Sitzung, und der langsamste | nur die Stationen im Umkreis des Punktes abrufen statt aller; sonst wie bei Meteostat (BH4) je Station cachen |
| **V-BW-24** | **`maps.dwd.de/geoserver/dwd/wms` wird viermal mit identischer URL geholt** (je 5 622 B) | klein, aber dieselbe Ursache wie §24.3 | `shareInFlight` (BW-5) auch auf diesen Abruf ziehen |
| **V-BW-25** | **Verifier-Sonden auf eingefrorenen Zahlen** melden den nächsten planmäßigen Schritt als Fehler. Zwei Fälle in zwei Phasen: `verify:routing` prüfte `const VERSION = 'v2'` wörtlich und fiel über den SW-Bump aus BW-3; `src/radar/_verify.ts` verlangte `RADAR_PRESETS.length >= 4`, seit einem Rückbau gibt es drei — der Harnisch stand seither auf 66/67, ohne dass etwas kaputt war | ein Verifier, der ohne Defekt rot ist, wird irgendwann nicht mehr gelesen | beide behoben (Absicht statt Zahl). Offen: ein Durchgang durch die übrigen Harnische mit derselben Frage |

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

---

# 19. BW-P + BW-0 — Browser-Beweis und Feuerwetter-Rückzug (2026-08-23)

> Erste zwei Stufen des Plans „Benutzerabhängige Bandbreite minimieren".
> Jans Entscheidungen: Speicherweg **jsDelivr über GitHub**, Repack-Umfang
> **nur Wind + Temperatur**, **Feuerwetter komplett löschen** (inkl. der
> Ausbreitungspfeile). **Kein Commit.**

## 19.1 BW-P — der Rundlauf ist auch im Browser verlustfrei

Der bit-identische Rundlauf aus §8 war ein **Node**-Rundlauf. Im Browser kommen
Farbmanagement und Alpha-Premultiplication dazu — fällt der Rundlauf dort, ist
der ganze Repack-Weg tot. Deshalb vor der ersten Zeile Produktionscode geprüft
(Playwright gegen die Prod-Origin, adversarialer Rahmen 256×256: **jede**
R/G-Kombination, obere Hälfte A = 255, untere A = 0; PNG in der Seite selbst per
`CompressionStream('deflate')` gebaut, also ohne Canvas-Beteiligung):

| Dekodierung | opake Pixel falsch | maskierte RGB falsch | Alpha falsch | größte Abweichung |
|---|---:|---:|---:|---:|
| `createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })` | **0** | 0 | 0 | **0** |
| ohne Optionen | 0 | 0 | 0 | 0 |

65 536 Pixel, PNG 167 129 B. Chrome ist auch **ohne** die Optionen exakt — unsere
Alphawerte sind nur 0 oder 255 (keine partielle Deckung, also kein
Premultiply-Verlust) und das PNG trägt kein Farbprofil. Die Optionen werden
trotzdem gesetzt: als Absicherung gegen einen künftigen Layer mit Teildeckung
und gegen Browser, die ein Profil annehmen.

> **Damit steht die tragende Annahme des Plans.** Was der Producer schreibt,
> liest der Client Byte für Byte identisch zurück.

## 19.2 BW-0 — was entfernt wurde

Ausdrückliche **Ausnahme vom Funktionserhalt** (CLAUDE.md), Muster wie die
Layer-Rückzüge vom 2026-08-19/22.

**Gelöschte Dateien (12):**
`src/sources/iconD2FireWeather.ts` · `src/fire/fwi/` (`fwi.ts`,
`fireWeatherGrid.ts`, `isiRamp.ts`) · `src/fire/spread/` (9 Dateien: `fbp.ts`,
`isiPointSample.ts`, `spreadForecast.ts`, `spreadLayer.ts`, `spreadReach.ts`,
`spreadRun.ts`, `spreadText.ts`, `spreadVector.ts`, `terrainSampler.ts`) ·
`scripts/verify-fire-{spread,fwi,weather-grid}.mjs` + ihre drei
`package.json`-Aliase.

**Drei sichtbare Dinge hingen an derselben Quelle** — das war beim Auftrag nicht
absehbar und ist am Code durchgezogen worden:

| Weg | Beleg |
|---|---|
| Layer „Ausbreitung (Modell)" (Bit 14) | `FirePage.tsx` — `if (!active.has('fireSpread')) { setSpread(null); return; }` |
| Punktkurve „Feuerwetter am Punkt" | war bei `FirePage.tsx:788` auf `active.has('fireSpread')` gegated |
| Windgitter der Waldbrandseite | wurde nur für die Ausbreitung geladen; ohne sie hat es keinen Verbraucher mehr |

**Bit 14 bleibt in `FIRE_BIT_ORDER` als `null` reserviert** (Muster Bit
1/4/5/6/10/13), damit geteilte `#wb=`-Links nicht auf andere Layer zeigen.
`fireAnomalies` steht unverändert auf Bit 15 — per Verifier belegt.

**Bewusst erhalten, am Code geprüft statt angenommen:**
- Layer `fireWeather` (RH-Treiber) — anderer Layer, Quelle `iconD2Relhum.ts`.
- Die **Gefahrensichten** `fwi`/`ranking`/`dc`/`isi`/`ffmc` — sie hängen an
  **EFFIS-WMS** (`dangerViews.ts`, `layer: 'ecmwf.isi'`), nicht am Producer. Die
  Waldbrandseite behält ihre Gefahrenanzeige vollständig.
- Die **Stundenachse**. `fireSpread` war der einzige Layer mit `mode: 'hourly'`,
  also verliert `hourlyForced()` seinen Auslöser. Aber `hourlyAvailable()` zählt
  alle Layer mit `maxHour`, und `fireWeather` wie `fireSoilDryness` haben ihn:
  der Umschalter „Tage | Stunden" bleibt, er wird nur nicht mehr **erzwungen**.
  Zwei neue Prüfungen in `verify:fire-time` halten genau das fest.

**Folge, die benannt gehört:** das AF2-**Windflag** (`dynamics.ts`) bleibt
dauerhaft `null` mit seinem benannten Grund. Es war schon bisher nur mit
aktivem `fireSpread` gefüllt — und `fireSpread` gehört nicht zum Default-Set
(`['fireDanger','fireHotspots']`). Für den Normalfall ändert sich also nichts.

Vier Kommentare, die den gelöschten Code beschrieben, wurden korrigiert
(`dynamics.ts`, `fireAssessment.ts`, `iconD2Precip.ts`, `iconD2Relhum.ts`) —
ein Kommentar darf nichts behaupten, was es nicht mehr gibt.

## 19.3 Gate GBW0 — Belege

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | **grün** (Exit 0) |
| `npm run build` | grün |
| `npm run budget` | grün — `totalJs` **975,7 → 969,2 KB gz**, Ratsche auf 1 017,7 nachgezogen |
| `verify:fire-time` | **114/114** (zwei Prüfungen ersetzt: Stundenachse ohne Erzwinger, Wind ohne Verbraucher; fünf neue Rückzugs-Sonden) |
| `verify:fire-model` | **112/112** |
| `verify:fire-registry` | 81/81 |
| `verify:fire-events` | 42/42 |
| `verify:fire-anomalies` | 56/56 |
| `verify:fire-danger-views` | 43/43 |
| `verify:fire-boden` | 52/52 |
| Runtime-Dependencies | unverändert 7 (keine neue, keine entfallene) |
| tote Verweise | keine — repo-weiter Grep auf `iconD2FireWeather`/`fire/spread`/`fire/fwi` findet nur noch Historien-Kommentare |

**Vier Verifier melden Fehler — alle vier sind Altlasten, keiner geht auf den
Rückzug zurück.** Einzeln nachgewiesen, indem die geprüfte Zeichenkette gegen
die aktuelle Quelle gehalten wurde:

| Verifier | Fehlschläge | Ursache |
|---|---:|---|
| `verify:fire-clusters` | 12 | Command-Deck-Redesign (BR1): `fire-ro-layerinfo`, `fire-scales`, `fire-at-gap`, `fire-season`, `gezeigt: {p.shown}`, die Sortier-Tupel u. a. existieren in `FirePage.tsx`/`FireFootprintPanel.tsx` **gar nicht mehr** — auch an Stellen, die dieser Rückzug nie berührt hat |
| `verify:fire-footprint` | 1 | erwartet `fireZones={mapZones}`; der Code schreibt seit der Historie-Arbeit `fireZones={history ? EMPTY_ZONES : mapZones}` |
| `verify:fire-zones` | 1 | Dependency-Sonde kennt `react-router` nicht (RT1, 2026-08-22, D-06-Ausnahme) |
| `verify:fire-clusters` (dieselbe Sonde) | — | dito |

→ Als **V-BW-19** notiert: diese drei Verifier hängen dem Code seit BR1/RT1/BH
hinterher. Sie gehören nachgezogen, aber nicht in dieser Phase — sonst
vermischen sich Rückzug und Verifier-Pflege in einem Diff.

## 19.4 Eine Lehre aus der Umsetzung

Beim Entfernen der `onPointForecast`-Prop aus `FireMap.tsx` habe ich einen
Bereichsschnitt mit dem Anker `'  /**'` gesetzt — der traf das **erste**
Vorkommen in der Datei und löschte den halben `Props`-Block. Der Typecheck hat
es sofort und vollständig aufgedeckt (41 Fehler, alle „Property … does not
exist on type 'Props'"), und der Block ließ sich aus `git show HEAD:` sauber
rekonstruieren.

> **Lehre:** Ein Bereichsschnitt braucht einen Anker, der in der Datei
> **eindeutig** ist — `'  /**'` ist es nie. Zeilenbasiert schneiden und die
> Bereiche vor dem Schnitt ausgeben; und niemals ohne `typecheck` unmittelbar
> danach. Dass jede Änderung in einem Repo mit sauberem Typecheck-Gate passiert,
> war hier der Unterschied zwischen einer Minute und einem verlorenen Nachmittag.

## 19.5 Nächster Schritt

**BW-1** — Producer lokal, Byte-Identität beweisen. Vorarbeit: `buildTempImage`
(`iconD2TempSource.ts`) ist nicht DOM-frei und muss nach dem Muster von
`windFrameBuild.ts` in ein gemeinsames Modul (`buildTempRgba`), das Client und
Producer **beide** importieren.

---

# 20. BW-1 — Producer und Byte-Identität (2026-08-23)

> Ziel der Phase: **beweisen**, dass ein vorprozessiertes PNG dem Client exakt
> dieselben Bytes liefert wie der heutige GRIB-Pfad — bevor irgendein Client
> darauf umgestellt wird. Kein Netz-Ziel, kein Client-Code. **Kein Commit.**

## 20.1 Die Vorarbeit: eine Mathematik, zwei Aufrufer

`buildWindRgba` war schon DOM-frei (`src/wind/windFrameBuild.ts`, ausgelagert für
den Wind-Worker). `buildTempImage` war es nicht — es rief `document.createElement`
mitten in der Rechenschleife. Herausgelöst nach demselben Muster:

**Neu: `src/sources/tempFrameBuild.ts`** — `buildTempRgba`, `buildHsurfGrey`,
`tempByte`, `hsurfByte`, plus die Normierungskonstanten. `iconD2TempSource.ts`
behält nur noch den Canvas-Transport (`putImageData`) und reicht `TEMP_VMIN`/
`TEMP_VMAX` weiter, damit `scalar/confidenceImage.ts` unverändert bleibt.

Das ist die entscheidende Struktur der ganzen Linie: Producer und Client können
gar nicht auseinanderlaufen, weil sie **dasselbe Modul** aufrufen — nicht zwei
gleich gemeinte Kopien. `verify:repack` prüft das zusätzlich am Quelltext
(Producer importiert die Module und enthält keine eigene Normierung).

## 20.2 Eine Format-Entscheidung, die gemessen wurde statt geraten

Der Plan rechnete mit **74 KB je Temperaturschritt**. Der erste Producer-Lauf
lieferte **161 KB**. Die Ursache am Bild gemessen:

| Inhalt | Größe |
|---|---:|
| voll (R = Temp, G = hsurf, A = Maske), RGBA | 161 KB |
| nur Temperatur + Maske | 97 KB |
| nur hsurf | 89 KB |
| Temperatur allein als Graustufe | **73 KB** ← das war die Zahl im Plan |

Der Plan hatte die **Orographie nicht mitgerechnet**. Und die ist zeitinvariant:
das kombinierte Format hätte dasselbe Gelände **25×** je Lauf ausgeliefert.

Gegenprobe, weil „invariant" eine Behauptung ist, bis man sie misst: `hsurf` aus
drei Läufen (15/12/09 UTC) verglichen — **0 abweichende Zellen, max 0**. Es ist
nicht nur zeit-, sondern **lauf-invariant**. Also:

| Datei | Farbtyp | Inhalt | Größe |
|---|---|---|---:|
| `wind-<SSS>.png` | RGB | R = norm. u, G = norm. v | 247 KB (Median) |
| `temp-<SSS>.png` | Grau + Alpha | Grau = norm. °C, Alpha = Maske | **90 KB** (Median) |
| `hsurf.png` | Grau | norm. Orographie | 64 KB, **einmal** |

161 → 90 KB je Schritt. Blau und Alpha darf das Wind-PNG nur weglassen, weil sie
konstant sind — der Verifier prüft das je Frame, statt es zu glauben.

**Die Maske gewinnt beim Zusammensetzen.** `composeTempRgba` nimmt Alpha aus dem
Zeitschritt und die Höhe aus `hsurf.png`; wo Alpha 0 ist, wird der ganze Pixel 0.
Damit stimmt das Ergebnis auch dann exakt, wenn ICON einmal andere Zellen maskiert
als im Referenzschritt — die Alternative (Maske aus `hsurf.png` nehmen) hätte eine
Annahme über alle künftigen Läufe eingebaut, für die es keinen Beleg gibt.

## 20.3 Gate GBW1 — der Beweis

`verify:repack` **41/41**, über **drei echte Läufe** (2026-08-23 15/12/09 UTC),
je zwei Schritte, Wind und Temperatur:

```
GRIB → Client-Modul                         →  Referenz-Bytes
GRIB → Producer → PNG → Decoder → Compose   →  Ist-Bytes
```

Verglichen wird mit `Buffer.compare === 0` — nicht „Abweichung klein".
**907 136 Bytes je Frame, jedes Mal identisch.**

Der Decoder im Verifier ist bewusst eine **eigene** Implementierung des
Un-Filterns (nicht die Umkehrung des Encoders) und prüft jede Chunk-CRC — sonst
bewiese der Rundlauf die Gleichheit zweier Fehler.

**Negativkontrollen** — ein Gate, das nicht fehlschlagen kann, misst nichts:

| Eingriff | Ergebnis |
|---|---|
| ein einziges Byte gekippt | erkannt |
| Abtastfaktor `ss` 2 → 3 | erkannt |
| ohne `hsurf` zusammengesetzt | erkannt |
| PNG-Chunk beschädigt | erkannt (CRC) |
| Zielbreite 700 → 701 | **nicht** erkannt — und das ist richtig |

Der letzte Fall ist eine Lehre: 700 und 701 ergeben `ceil(1215/·) = 2`, also
**dasselbe Bild**. Maßgeblich ist nie `TARGET_WIDTH`, sondern der Abtastfaktor —
jede Breite von 608 bis 1215 liefert Bit für Bit das gleiche Ergebnis. Meine erste
Negativkontrolle war deshalb falsch gewählt, nicht das Gate blind.

Was dieses Gate **nicht** zeigt: dass Chrome genauso dekodiert. Das ist BW-P
(§19.1, adversarialer Rahmen über `createImageBitmap`, 0 abweichende Bytes). Erst
beide Hälften zusammen schließen die Kette Producer → CDN → Browser.

| weitere Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | **grün** |
| `npm run build` · `npm run budget` | grün — `totalJs` 969,2 → **969,3 KB gz** (Ratsche 1 017,7) |
| `verify:layer-geometry` | 15/15 — die Abtastung ist unverändert |
| `verify:snow` 20/20 · `verify:radar-sampling` 25/25 · `verify:precip-source` 30/30 | grün (Leser des Temp-Bilds) |
| `verify:datenalter` 54/54 · `verify:health` 20/20 · `verify:warm-wind` 13/13 · `verify:warm-budget` 30/30 | grün |
| Runtime-Dependencies | unverändert **7** — PNG-Codec handgeschrieben (`scripts/lib/png.mjs`) |

Verifier-Zahl **51** (`verify:repack` neu; die drei Feuerwetter-Verifier sind mit
BW-0 entfallen).

## 20.4 Mengengerüst für BW-2 — jetzt gemessen, nicht geschätzt

Voller Lauf 2026-08-23 15 UTC, alle Schritte, 126,9 s lokal:

| | Schritte | Summe | Median |
|---|---:|---:|---:|
| Wind (0…12 h) | 13 | 3,11 MiB | 247 KB |
| Temperatur (0…24 h) | 25 | 2,24 MiB | 90 KB |
| `hsurf` | 1, lauf-invariant | 0,06 MiB | 64 KB |
| **je Lauf** | | **5,35 MiB** | |

**49,88 MiB GRIB (bz2) → 5,41 MiB PNG = Faktor 9,2×.** Bei 4 Läufen Retention
liegen ~21 MiB im Daten-Repo; jsDelivrs Grenze ist 20 MB **je Datei**. Zum
Vergleich: ein 1:1-Spiegel der GRIB-Dateien wären 50 MiB je Lauf. Der Repack ist
das, was den kostenlosen Weg überhaupt trägt — die Planannahme (~5,1 MiB) hält.

**Projektion Kaltsitzung** (2 Schritte, `START_NOW_ONLY`):

| | heute | nach Repack | Faktor |
|---|---:|---:|---:|
| Wind, 2 Schritte (u+v) | 4,03 MiB | 0,48 MiB | 8,3× |
| Temperatur, 2 Schritte + hsurf | 2,52 MiB | 0,24 MiB | 10,3× |
| **Datenanteil** | **6,55 MiB** | **0,72 MiB** | **9,1×** |

Nachgemessen wird das erst in BW-4 am Browser — hier steht die Rechnung, nicht das
Ergebnis.

## 20.5 Drei Lehren

**(1) Das DWD reißt Verbindungen ab.** Der erste volle Lauf starb bei Wind-Schritt 6
an `ECONNRESET` / `TypeError: terminated` — eine einzelne abgerissene Verbindung
kostete 51 Dateien Arbeit. Dieselbe Ursache hatte T2c bei den Warm-Crons. Der
Producer wiederholt jetzt 3× mit wachsendem Abstand (4xx nie — „gibt es nicht"
heilt nicht durch Warten), einzelne Schritte sind nicht mehr tödlich, **fehlende
werden im Manifest genannt** statt stillschweigend weggelassen, und ein
unvollständiger **Nah-Horizont** (0…2 h — das, was eine Kaltsitzung wirklich lädt)
setzt Exit-Code 1, damit BW-2 kein taubes Tag umlegt.

**(2) Ein Skript, das vor dem Schreiben wirft, schreibt gar nichts.** Ein
Patch-Skript mit vier Ersetzungen scheiterte an der letzten Zusicherung — die
ersten drei waren damit ebenfalls weg, und der danach laufende Producer sah
erfolgreich aus, obwohl keine der Änderungen drin war. Exakt die Falle aus §19.4
und aus der AF4-Linie. **Änderungen einzeln anwenden**, nicht gebündelt hinter
einer gemeinsamen Zusicherung.

**(3) V-BW-20 — die Normierung steht viermal im Repo.** `TEMP_VMIN`/`TEMP_VMAX`/
`DEM_MAX` sind in `scalar/snowLine.ts` und `scalar/confidenceImage.ts` als
Literale kopiert (`fusion/fusionEngine.ts` und `qa/layerSampler.ts` tragen `4500`
ebenfalls). Diese Dateien **lesen** das Bild, das der Producer schreibt — laufen
die Werte auseinander, zeigt die Karte still falsche Temperaturen. Der Umbau wäre
eine eigene Phase (`fusionEngine.ts` ist STOPP-&-FRAGEN-Zone); bis dahin bewacht
`verify:repack` die Kopien gegen das Modul.

## 20.6 Nächster Schritt

**BW-2** — Ablage: Daten-Repo `buscosun-data`, Tag je Lauf, jsDelivr, Manifest-
Abschnitt `repack` mit Basis, Tag und den vier Normierungswerten je Schritt.
`hsurf.png` bekommt einen **lauf-unabhängigen** Pfad — es ist gemessen invariant
und muss weder je Lauf hochgeladen noch je Lauf erneut geladen werden.

---

# 21. BW-2 — Ablage (2026-08-23)

> Ziel der Phase: die Bilder aus BW-1 so ablegen, dass der Client sie **eindeutig
> dem richtigen Lauf zuordnen** kann — und zwar ohne Netlify-Byte, ohne Secret,
> ohne neue Workflow-Datei in diesem Repo. **Kein Commit, kein Push.**
>
> BW-1 hat bewiesen, dass die *Bytes* stimmen. BW-2 hat es mit einer anderen
> Fehlerklasse zu tun: **richtiger Wert am falschen Lauf**, oder **Bild ohne
> seine Normierung**. Beides ist stumm — die Karte zeigt etwas Plausibles.

## 21.1 Zwei Messungen, die den Plan korrigieren

**(a) Tag oder Commit?** Der Plan wollte ein Tag je Lauf, weil jsDelivr
Branch-Auflösungen 12 h cacht. Am 2026-08-23 nachgemessen:

| Ref | `Cache-Control` |
|---|---|
| `…@main/…` (Branch) | `public, max-age=604800, **s-maxage=43200**` |
| `…@<sha>/…` (unveränderlich) | `public, max-age=31536000, **immutable**` |

Beide mit `Access-Control-Allow-Origin: *`. Die Sorge des Plans stimmt — aber ein
**Commit-SHA ist bereits unveränderlich**. Er braucht kein Tag, kein Aufräumen
von Alt-Tags, und er kann keine alten Objekte am Leben halten. Das Tag wäre
Zeremonie gewesen; der SHA leistet dasselbe mit weniger Mechanik.

Zusätzlich verschwindet die Frische-Frage ganz aus dem Client: `index.json` wird
über `raw.githubusercontent.com` **serverseitig vom Cron** gelesen, der Browser
sieht ausschließlich SHA-adressierte URLs aus dem Manifest. Die 12-h-Falle kann
ihn gar nicht erreichen.

**(b) Die Tag-Retention des Plans räumt nichts auf.** „Alte Tags räumt die Action
auf" klingt nach Speicherhygiene, ist aber keine: ein gelöschtes Tag lässt die
Blobs im Repo — ein *vorhandenes* Tag hält sie sogar am Leben. 8 Läufe/Tag ×
5,35 MiB wären **~15,6 GB/Jahr unwiderruflich in der Historie**, in einem Repo,
das die Action bei jedem Lauf klont.

Deshalb: jeder Publish schreibt eine **frische Historie** aus zwei Commits und
force-pusht sie. Das Repo bleibt konstant bei ~21 MiB (Retention 4 Läufe ≈ 12 h).

Der Preis, ehrlich benannt: ein Client, der noch ein Manifest mit einem alten SHA
hält, bekommt nach GitHubs Räumung 404 — und fällt auf GRIB zurück (BW-3). Die
**Korrektheit hängt am Fallback, nicht am Räumzeitpunkt**; die Räumverzögerung ist
nur Effizienz. Verloren geht nichts: alles ist aus DWD-Rohdaten reproduzierbar.

## 21.2 Ein Widerspruch im Plan, und wie er aufgelöst ist

Drei Vorgaben zusammen sind **nicht erfüllbar**:

1. eigenes Daten-Repo,
2. keine neue Workflow-Datei (STOPP-&-FRAGEN-Zone bleibt zu),
3. keine Secrets.

Der `GITHUB_TOKEN` einer Action schreibt **nur in ihr eigenes Repo**. Ein Batch
in `buscosun-web`, der nach `buscosun-data` pusht, bräuchte zwingend einen PAT
als Secret. Das war im Plan nicht gesehen.

Aufgelöst, ohne eine der drei Vorgaben zu brechen: **der Producer-Batch läuft im
Daten-Repo.** Dort schreibt das Standard-Token in sein eigenes Repo — kein
Geheimnis. `buscosun-web` bekommt **keine** neue Workflow-Datei; seine
bestehenden Crons lesen nur `index.json` und hängen den Abschnitt an.

Der Producer wird dabei aus `buscosun-web` **geklont** (öffentlich, tokenfrei) —
er muss dieselben Module benutzen wie der Client, sonst zeichnet die Karte andere
Werte als die Punktabfrage nennt. Eine Kopie im Daten-Repo wäre genau der Drift,
den BW-1 strukturell ausgeschlossen hat.

Die Workflow-Datei wird deshalb in **`scripts/repack-repo/workflow-build.yml`
gepflegt** (reviewbar, versioniert) und vom Publisher ins Daten-Repo ausgelegt.

Nebenbefund: der Producer hängt an **genau einer** Laufzeit-Abhängigkeit, `bz2`.
`gribDecode.ts` ist importfrei, `windFrameBuild.ts`/`tempFrameBuild.ts`
importieren nur Typen. Der Batch braucht kein `npm ci`.

## 21.3 Was gebaut wurde

| Datei | Rolle |
|---|---|
| `scripts/lib/repackManifest.mjs` | **die eine Stelle**, die den `repack`-Abschnitt formt und URLs baut — geteilt von Publisher, beiden Crons und dem Verifier |
| `scripts/publish-repack.mjs` | legt `data/repack/` ins Daten-Repo, Retention, zwei Commits, Force-Push. Ohne `--push` reiner Probelauf |
| `scripts/repack-repo/{README.md,workflow-build.yml}` | Begleitdateien des Daten-Repos, hier gepflegt |
| `scripts/warm-{wind,grib}.mjs` | **additiv**: lesen `index.json` und hängen den Abschnitt an. Sonst unverändert |
| `scripts/repack-icon-d2.mjs` | Layout spiegelt jetzt das Daten-Repo; `hsurf-v1.png` an der Wurzel; `state.json` + `REPACK_SKIP_IF_RUN` |

**Warum zwei Commits:** `index.json` muss den SHA nennen, unter dem die Bilder
liegen — den es vor dem Commit nicht gibt. Also Commit 1 = Bilder (sein SHA
wandert ins Manifest), Commit 2 = Index, der auf Commit 1 zeigt. Beide sind von
`main` erreichbar. Kein API-Aufruf, kein Rate-Limit, kein Token.

**Die Anti-Drift-Regel:** `repack.run === manifest.run`, sonst **kein Abschnitt**.
Ein Manifest darf auf einen neuen DWD-Lauf umlegen, bevor der Producer ihn
gerechnet hat — dann fehlt der Abschnitt und der Client nimmt GRIB. Was nie
passieren darf: das Manifest nennt Lauf X, der Abschnitt zeigt auf Lauf X−1. Das
wäre eine stille Falschaussage über die Gültigkeitszeit **jedes** Frames.

## 21.4 Die drei Fälle von `carryRepack` — und warum der dritte zählt

| Lage | Verhalten |
|---|---|
| Index gelesen, führt den Lauf | Abschnitt übernehmen |
| Index gelesen, führt ihn **nicht** | **weglassen** statt veralten lassen |
| Index **nicht lesbar** (Netz, 404, 500) | bestehenden Abschnitt behalten — aber nur, wenn er zu **diesem** Lauf gehört |

Der dritte Fall ist der, den man leicht falsch macht. Ihn wegen eines
Netzaussetzers fallen zu lassen hieße: bei jedem Aussetzer ein Commit, ein
Netlify-Rebuild, und alle Besucher grundlos zurück auf GRIB — obwohl die Bilder
weiter liegen (der SHA ist unveränderlich).

Und der Early-Exit musste den Abschnitt mitprüfen: der Producer kommt
typischerweise **nach** dem Manifest-Advance zum Zug. Ohne diese Erweiterung
stünde sein Abschnitt bis zum nächsten DWD-Lauf (~3 h) nicht im Manifest. Exakt
das V-81-Muster — „gleicher Lauf" heißt nicht „nichts Neues".

## 21.5 Gate GBW2

`verify:repack` **79/79** (BW-1 41 + BW-2 38), dazu vier Gegenproben an den
echten Skripten mit lokalem Index-Server:

| Gegenprobe | Ergebnis |
|---|---|
| zweiter Lauf, Index unverändert | Early-Exit — kein Commit-Geflacker |
| Index antwortet **500** | Abschnitt **behalten**, Early-Exit |
| Index kennt den Lauf **nicht** | Abschnitt **fällt weg**, Manifest ohne `repack` |
| guter Index kehrt zurück, Lauf schon abgedeckt | Abschnitt **kommt nach** (V-81-Muster) |

Aus dem Verifier, in Auswahl:

- jeder Wind-Schritt trägt seine vier Normierungswerte, **13 verschiedene von 13**
  (also wirklich je Frame bestimmt, keine feste Skala),
- die `hsurf`-URL trägt **keinen** Lauf-Pfad — die Lauf-Unabhängigkeit ist in der
  URL sichtbar, nicht nur behauptet,
- ein fremder Lauf liefert **keinen** Abschnitt (Anti-Drift),
- der Publisher kopiert **byte-identisch** (84 Dateien gegen die Producer-Ausgabe
  verglichen) und der Index nennt die echten Dateigrößen,
- Retention behält die 4 neuesten und **nennt** die entfernten,
- Producer-Caps == Client-Caps (12/24).

Dazu die Prüfungen, die erst der Betrieb erzwungen hat (§21.6) — alle an echten
Vorgängen, nicht an Attrappen:

| Prüfung | Beleg |
|---|---|
| Unerreichbares Remote → Abbruch **vor** dem Bauen | exit 1, ohne „Baum fertig" |
| Ein Lauf, den der Publish nicht gerechnet hat, überlebt ihn | `2026082318` lag nur im Remote → erhalten |
| Retention entfernt den ältesten Lauf aus dem **gepushten** Baum | `KEEP=2` → Remote führt [2026082321, 2026082318] |
| `skipDecision`: neu / vollständig / **unvollständig** / unbekannt | „Wind 11/13 → nachrechnen" |
| Der Batch reicht Lauf **und** Schrittzahlen durch | `workflow-build.yml` |
| `fetchIndex` wiederholt nach 5xx, **nicht** nach 404 | 2 Abrufe bzw. 1 Abruf |
| jsDelivr: `ACAO: *` + `immutable` | HTTP 200, `max-age=31536000, immutable` |
| **Die gelieferten Bytes sind die Producer-Bytes** | 241 839 B empfangen == 241 839 B lokal |
| `hsurf` unter lauf-unabhängigem Pfad abrufbar | HTTP 200 |
| Live-Index == letzter lokaler Push | `f3cbc6c` == `f3cbc6c` |

| weitere Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` · `npm run build` · `npm run budget` | grün, unverändert (BW-2 fasst keinen Client-Code an; „Alle Budgets eingehalten", größter Chunk maplibre 278,4 KB gz) |
| `verify:warm-wind` 13/13 · `verify:warm-budget` 30/30 | grün — die Änderung an beiden Crons ist additiv |
| `verify:health` 20/20 · `verify:datenalter` 54/54 | grün |
| `verify:layer-geometry` 15/15 · `verify:snow` 20/20 · `verify:radar-sampling` 25/25 · `verify:precip-source` 30/30 | grün |
| `public/latest-{wind,grib}.json` | **unberührt** — alle Proben liefen gegen Kopien im Scratchpad |

Die CDN-Zeile des Verifiers zählt ohne `REPACK_CHECK_CDN=1` **nicht** als
bestanden, sondern meldet `⊘ nicht geprüft` — ein übersprungener Test, der grün
aussieht, ist schlimmer als keiner. Seit das Repo steht, ist sie scharf; was sie
misst, steht in §21.6.

## 21.6 Der erste echte Push — und der Fehler, den er aufgedeckt hat

Jan hat `buscosun-data` am 2026-08-24 angelegt (öffentlich, leer). Damit waren
die drei Pfade prüfbar, die bis dahin nie gelaufen waren.

### Was sofort funktioniert hat

**Publish #1** legte drei Läufe ab (Daten-Commit `471ea06…`, Index-Commit
`69bcbf4…`). Die offene Messung — wie schnell jsDelivr einen *gerade* gepushten
Commit sieht — ist damit gemacht, und die Antwort ist: **sofort.**

| | |
|---|---|
| `raw…/index.json` sichtbar | 0,8 s, **erster** Versuch |
| `cdn.jsdelivr.net/…@471ea06…/runs/2026082318/wind-000.png` | 1,9 s, **erster** Versuch |
| `access-control-allow-origin` | `*` |
| `cache-control` | `public, max-age=31536000, s-maxage=31536000, immutable` |
| zweiter Abruf | 533 ms |

Es gibt also **keinen Vorlauf**, in dem ein frischer Commit noch nicht auflösbar
wäre — die Sorge, der Client könnte auf einen Abschnitt zeigen, den das CDN noch
nicht kennt, ist gegenstandslos. Nebenbei bestätigt die Kopfzeile die
Entscheidung aus §21.1 ein zweites Mal: der unveränderliche Ref bekommt
`s-maxage=31536000`, der Branch-Ref bekäme 43 200.

**Und die Kette ist zu.** BW-1 hat bewiesen, was hier *entsteht* — nicht, was
drüben *ankommt*. `verify:repack` vergleicht jetzt die vom CDN gelieferten Bytes
gegen die Producer-Ausgabe: **234 842 B empfangen, 234 842 B lokal, identisch.**
Damit ist der Weg Producer → CDN → (BW-P) Browser lückenlos belegt, statt an der
Übertragung zu enden.

### Der Fehler, den erst der zweite Publish gezeigt hat

**Publish #2** stellte den Ablauf der Action nach: nur der neueste Lauf liegt
lokal vor, die beiden älteren müssen aus dem Klon kommen. Der Klon brach ab:

```
error: RPC failed; curl 56 Recv failure: Connection was reset
```

Das Skript meldete daraufhin **„→ erster Publish"**, baute einen Baum mit
**einem statt drei Läufen** — und stand im Begriff, ihn per Force-Push über den
Bestand zu legen. Dass nichts verloren ging, ist kein Verdienst des Entwurfs:
der Push blieb in derselben Störung hängen und wurde abgebrochen; `ls-remote`
bestätigte danach, dass das Remote unverändert auf `69bcbf4` stand.

**Warum das schwer wiegt.** Force-Push und „Klon fehlgeschlagen = Repo leer"
sind einzeln vertretbar und zusammen ein Datenverlust-Automat: ein Netzaussetzer
in der Action hätte das Daten-Repo von vier Läufen auf einen zurückgeworfen.
Sichtbar wäre das nirgends — Clients mit einem Manifest auf einen der
weggefallenen Läufe bekämen 404 und fielen still auf GRIB zurück. Die Ersparnis
verschwindet, die Karte bleibt richtig; also meldet niemand etwas.

**Behoben** ist es, indem die Frage *„gibt es überhaupt einen Bestand?"* getrennt
und **vorher** beantwortet wird — mit `git ls-remote --heads`, das nur die
Ref-Liste überträgt und deshalb nicht an derselben Übertragung scheitern kann
wie ein Klon:

| `ls-remote` | Bedeutung | Verhalten |
|---|---|---|
| schlägt fehl | Bestand **unbekannt** | Abbruch, **kein Push** (exit 1) |
| leer | Repo ohne Zweige | echter erster Publish |
| nennt `main` | Bestand vorhanden | Klon **muss** gelingen (2 Versuche), sonst Abbruch ohne Push |

Die allgemeine Lehre, über diese Phase hinaus: **ein Force-Push darf aus „ich
konnte nicht nachsehen" niemals „da ist nichts" folgern.** Das sind zwei Fragen,
und nur eine von beiden darf von einer Übertragung beantwortet werden, die auf
halbem Weg abreißen kann.

Geprüft wird das jetzt netzfrei an einem **lokalen Bare-Repo**, also wiederholbar
— anders als der Vorfall: ein Publish gegen ein unerreichbares Remote bricht ab,
*bevor* ein Baum entsteht; und der nachgestellte Action-Ablauf (drei Läufe
abgelegt, dann mit nur dem neuesten lokal publiziert) muss den mittleren Lauf aus
dem Klon **behalten** und den ältesten per Retention **entfernen**. Damit ist
auch der Saat-Klon-Zweig belegt, ohne von der Tagesform des Netzes abzuhängen.

### Zweiter Befund desselben Abends: der Index ist nicht immer lesbar

`raw.githubusercontent.com` lief zweimal binnen zehn Minuten in
`UND_ERR_CONNECT_TIMEOUT` (185.199.108.133:443), während derselbe Abruf davor und
danach unter einer Sekunde brauchte. Das ist **`carryRepack` (3) im Feld** — der
Fall aus §21.4, der bis dahin nur durchgespielt war. Er trägt: der bestehende
Abschnitt bleibt stehen, kein Commit-Geflacker, kein Rebuild.

Ein Aussetzer kostet aber einen ganzen Cron-Takt, bis ein **neuer** Lauf seinen
Abschnitt bekommt. `fetchIndex` wiederholt deshalb einmal — und zwar **nur** bei
Netzfehlern und 5xx. Bei **404 nicht**: „noch nicht abgelegt" ist eine Antwort,
keine Störung, und Wiederholen machte jeden Takt vor dem ersten Producer-Lauf
langsamer. Beide Hälften der Regel stehen im Verifier, an einem echten
Testserver.

### Der ganze Kreis, einmal live gelaufen

Nach dem Fix ein dritter Publish — diesmal mit Bestand, also der **erste
Force-Push über eine vorhandene Historie**: Klon 6,7 MiB, drei Läufe übernommen,
Daten-Commit `baf46bf…`, `main` auf `e9ecace…`. Der Saat-Klon-Zweig ist damit
auch am echten Remote gelaufen, nicht nur am lokalen.

Direkt danach der Blick auf den **weggedrückten** Commit `471ea06…`, den `main`
nicht mehr erreicht:

| Abruf | Ergebnis |
|---|---|
| alter, nicht mehr erreichbarer Commit | **HTTP 200**, 234 842 B, **19,9 s** |
| neuer Commit | HTTP 200, 234 842 B, 3,1 s |

Zwei Aussagen darin. Erstens: der in §21.1 benannte Preis fällt **verzögert** an
— GitHub räumt nicht sofort, ein Client mit altem Manifest läuft noch eine Weile
weiter. Zweitens, und wichtiger für BW-3: **19,9 s**. Der Fallback darf deshalb
nicht erst am Fehler hängen, sondern muss an einer **Frist** hängen — sonst
steht die Karte zwanzig Sekunden, statt in zwei Sekunden GRIB zu nehmen. Das ist
eine Anforderung an BW-3, keine Randnotiz.

**Und der Kreis selbst**, mit den echten Cron-Skripten gegen den echten Index
(Manifeste im Scratchpad, `public/latest-*.json` unberührt): der DWD
veröffentlichte in genau diesem Moment den Lauf **2026082321**, während das
Daten-Repo bei 18 UTC stand. `warm-wind` legte das Manifest auf 21 UTC um und
hängte **keinen** Abschnitt an:

```
[warm-wind] Daten-Repo führt Lauf 2026082321 noch nicht — führt [2026082318, …] @ baf46bf
[warm-wind] Manifest umgelegt → Lauf 2026082321, Steps [0…12], ohne Repack.
```

Das ist die Anti-Drift-Regel aus §21.3 im Betrieb, an einem Fall, den man sich
nicht hätte bestellen können: lieber gar kein Abschnitt als einer, der auf den
Vorlauf zeigt. Der Client nimmt in diesem Fenster GRIB — richtig, nur nicht
sparsam —, bis der Producer nachzieht.

### Dritter Befund: „schon da" ist nicht „vollständig da"

Damit der Kreis auch positiv belegt ist, hat der Producer den Lauf 2026082321
gerechnet:

```
[repack] GRIB (bz2) 46,04 MiB → PNG 4,90 MiB = Faktor 9,4×
[repack] FEHLENDE Schritte — Wind [4,5] · Temperatur []
```

Die Ursache ist **nicht** die DWD-Seite: beide Dateien sind gelistet und liefern
HTTP 200 (~1,0 MB), und über den Producer-Pfad dekodieren sie sauber zu
1215×746 — sie brauchten nur 3,5–6,3 s je Datei. Es war ein
**Übertragungsfehlschlag auf unserer Seite**, dem die drei Versuche mit 0,5/1,5 s
Wartezeit auf dieser Leitung nicht gewachsen waren. (Auf `ubuntu-latest` ist die
Leitung zum DWD schnell; hier war sie es an diesem Abend nirgends — vgl. die
GitHub-Aussetzer oben.)

Der Producer benennt die Lücke, gut. Der **Ausstieg des stündlichen Batches**
fragte bis dahin aber nur „liegt der Lauf schon?" — und hätte damit die beiden
fehlenden Schritte für die vollen drei Stunden bis zum nächsten DWD-Lauf
festgeschrieben. Ausgerechnet Wind 4 und 5: der Nahbereich, den **jeder** Client
lädt. Sie kämen still aus GRIB — also genau das, was diese Phase abstellen soll,
und niemand hätte etwas gemerkt.

Dass die Lücke aus dem Netz kam und nicht aus dem Publikationsfenster, macht die
Regel **wichtiger**, nicht unwichtiger: ein Publikationsfenster schließt sich von
allein, ein verlorener Abruf nicht.

Zusätzlich holt `fetchRaw` jetzt **vier** statt drei Mal (0,5 / 1,5 / 4,5 s) —
gemessen an derselben Leitung, auf der drei Versuche zweimal dieselben zwei
Schritte verloren. Das ist die Vorbeugung; `skipDecision` ist das Netz darunter.
Beides zusammen, nicht eins davon: eine Wiederholung mehr verkleinert die
Wahrscheinlichkeit, sie beseitigt sie nicht.

Der Ausstieg fragt jetzt nach **Vollständigkeit**: der Batch reicht neben der
Lauf-Kennung auch die abgelegten Schrittzahlen durch, und `skipDecision` (rein,
im Verifier durchgespielt) steigt nur aus, wenn sie reichen. Live nachgestellt:

```
"reason": "Lauf 2026082321 liegt schon, aber unvollständig (Wind 11/13, Temperatur 25/25) → nachrechnen."
```

Der Preis ist ein zusätzlicher Producer-Lauf, solange das DWD noch schiebt —
Actions-Minuten, die für öffentliche Repos nichts kosten. Der Nutzen ist, dass
die Ersparnis nicht davon abhängt, **wann in der Publikationsphase** der Cron
zufällig tickt.

Das ist dieselbe Fehlerfamilie wie der Force-Push-Fehler weiter oben, nur
harmloser: ein Zustand wird aus einem **Teil**-Merkmal geschlossen („Lauf liegt"
statt „Lauf liegt vollständig", „Klon fehlgeschlagen" statt „Repo ist leer").
Beide Male ist die Folge stumm.

### Und so steht der Abschnitt am Ende im Manifest

Mit dem vollständigen Lauf im Repo lief der Kreis auch positiv durch — beide
Crons gegen den echten Index, Manifeste im Scratchpad:

```
[warm-wind] Lauf 2026082321 im Daten-Repo (13 Schritte, Commit f3cbc6c)
[warm-wind] Gleicher Lauf 2026082321, aber der Repack-Abschnitt hat sich geändert (— → f3cbc6c) → umlegen.
[warm-grib] Manifest umgelegt → 2D-Lauf 2026082321 (neu) · EPS-Lauf 2026082321 (neu) · Repack-Commit f3cbc6c.
```

Die zweite Zeile ist **V-81, live**: das Manifest stand schon auf Lauf 21 (ohne
Abschnitt, s. o.), der Producer kam später — und der Abschnitt wurde
nachgetragen, statt bis zum nächsten DWD-Lauf zu warten. Genau dafür war der
Early-Exit erweitert worden; hier ist der Fall von selbst eingetreten.

Was am Ende dasteht, Wind (gekürzt) und Temperatur:

```jsonc
"repack": {
  "run": "2026082321", "commit": "f3cbc6c…", "path": "runs/2026082321",
  "base": "https://cdn.jsdelivr.net/gh/jppetry/buscosun-data",
  "wind": { "steps": [ { "step": 0, "file": "wind-000.png", "bytes": 241839,
      "uMin": -10.936…, "uMax": 11.003…, "vMin": -12.636…, "vMax": 9.444… }, … ] }   // 13
}
"repack": {
  "run": "2026082321", "commit": "f3cbc6c…",
  "temp": { "steps": [ … ],                                                          // 25
            "vMin": -20, "vMax": 40,
            "hsurf": { "url": "hsurf-v1.png", "scope": "repo", "channels": 1 } }
}
```

Drei Dinge daran sind Absicht und im Verifier festgehalten: der Wind-Abschnitt
trägt **keine** Temperaturdaten und umgekehrt; jeder Windschritt trägt seine
**eigenen** vier Normierungswerte (die Temperatur hat eine feste Skala, deshalb
steht sie einmal am Abschnitt); und `hsurf` trägt `scope: "repo"` samt einer URL
**ohne** Lauf-Pfad — die Lauf-Unabhängigkeit ist damit im Manifest sichtbar, nicht
bloß behauptet.

## 21.7 Zahlen der Ablage

Stand nach dem letzten Publish (Daten-Commit `f3cbc6c…`, `main` = `f26afef…`):

| | |
|---|---:|
| Läufe im Repo | 4 (2026082321 · 18 · 15 · 12) |
| Repo-Größe | 12,06 MiB |
| davon der **vollständige** Lauf 2026082321 | 5,39 MiB (13 Wind- + 25 Temperaturschritte) |
| Umpackung dieses Laufs | 50,01 MiB GRIB → 5,39 MiB PNG = **9,3×** |
| `hsurf-v1.png` | 64 KB, **einmal** für alle Läufe |
| Manifest `latest-wind.json` | 298 B → 2 486 B (13 Schritte mit je vier Normierungswerten) |
| Retention 4 **volle** Läufe | ~21,6 MiB, konstant |

Die drei älteren Läufe im Repo tragen nur die zwei Schritte, mit denen BW-1 die
Byte-Identität geprüft hat — daher 12,06 statt ~21,6 MiB. Mit dem stündlichen
Batch füllen sie sich von selbst auf.

Die Lauf-Invarianz von `hsurf` ist dabei ein **viertes** Mal bestätigt worden —
diesmal über den Dateipfad: der Producer warnt, wenn die Datei sich ändert, und
hat über vier Läufe geschwiegen.

## 21.8 Nächster Schritt

**BW-3** — Client liest PNG hinter `?repack=1`, default-off, GRIB als benannter
Fallback. `IconD2WindFrame.image` bleibt `HTMLCanvasElement` (die drei
`getContext('2d')`-Aufrufer sind in der Plan-Korrektur benannt); Weg: Manifest →
`repack`-Abschnitt → `createImageBitmap(…, { premultiplyAlpha: 'none' })` →
`getImageData` → `rgbaToCanvas`. Der Service Worker (`public/sw.js:89-105`) muss
`cdn.jsdelivr.net` durchreichen — eigener Gate-Punkt mit Cache-Namen-Bump.

**Zwei Vorgaben, die aus §21.6 dazukommen:**

1. Der Fallback hängt an einer **Frist**, nicht nur am Fehler. Ein weggedrückter
   Commit antwortete mit 200 nach **19,9 s** — ohne Frist stünde die Karte
   solange, obwohl GRIB in zwei Sekunden da wäre. Vorschlag: `AbortSignal.timeout`
   in der Größenordnung des GRIB-Pfads, danach GRIB, und der Frame-Loader merkt
   sich den Fehlschlag für die Sitzung (sonst zahlt jeder Schritt die Frist neu).
2. Der Abschnitt kann **fehlen**, und das ist der Normalfall im Fenster zwischen
   DWD-Veröffentlichung und Producer-Lauf (live gesehen: Manifest auf 21 UTC,
   Daten-Repo auf 18 UTC). „Kein Abschnitt" ist deshalb kein Sonderfall, den man
   eigens melden müsste, sondern der erwartete Zustand mehrmals täglich.

---

# 22. BW-3 — Der Client liest die Bilder (2026-08-24)

> Ziel der Phase: die Wetterkarte holt Wind und Temperatur aus dem Daten-CDN
> statt aus GRIB — **default-off hinter `?repack=1`**, mit dem GRIB-Pfad als
> benanntem Fallback („Rule 2"). BW-1 hat bewiesen, dass die Bytes stimmen,
> BW-2, dass der Client sie dem richtigen Lauf zuordnen kann. Hier entscheidet
> sich, ob er sie auch **findet, dekodiert und rechtzeitig aufgibt**.

## 22.1 Vier Fragen, die der Code heute nicht beantwortet

1. **Wer weiß vom Abschnitt?** Wind und Temperatur lesen ihr Manifest über
   *verschiedene* Wege: `resolveWindRunFromManifest`
   (`src/wind/iconD2WindSource.ts:91`) parst `/latest-wind.json` selbst, die
   Temperatur geht über den geteilten Resolver `resolveRunFromManifest`
   (`src/sources/gribManifest.ts:99`), der nur `{run, runAt, steps}`
   durchreicht. Der `repack`-Abschnitt fällt heute in beiden Fällen auf den Boden.
2. **Welche Kanäle kommen zurück?** Die zwei Familien sind NICHT symmetrisch —
   s. §22.2. Das ist der Punkt, an dem eine naive Umsetzung eine plausible
   falsche Karte erzeugt.
3. **Wann gibt der Client auf?** §21.6 hat einen weggedrückten Commit gemessen,
   der nach **19,9 s** noch mit 200 antwortete. Ohne Frist stünde die Karte
   solange, obwohl GRIB in ~2 s liefert.
4. **Was macht der Service Worker damit?** `public/sw.js:89-105` legt jedes GET,
   das kein gehashtes Same-Origin-Asset ist, im gedeckelten `bsc-data`-Cache ab
   — die PNGs lägen dort ein zweites Mal und verdrängten per FIFO (350 Einträge)
   die Wetterdaten, für die der Cache gedacht ist. Das ist V-BW-7 in neuer Form.

## 22.2 Die zwei Familien sind nicht symmetrisch

Der Producer schreibt bewusst verschiedene Farbtypen (BW-1, §20.2) — und daraus
folgt für den Client zweierlei Arbeit:

| | Datei | Farbtyp | was `getImageData` liefert | was der Client braucht |
|---|---|---|---|---|
| Wind | `wind-NNN.png` | 2 (RGB) | R = u, G = v, B = 0, **A = 255** | genau das |
| Temperatur | `temp-NNN.png` | 4 (Grau + Alpha) | **R = G = B = °C**, A = Maske | R = °C, **G = hsurf**, B = 0, A = Maske |
| Orographie | `hsurf-v1.png` | 0 (Grau) | R = G = B = hsurf, A = 255 | nur der Graukanal |

**Wind ist damit fertig, sobald das Bild dekodiert ist.** Temperatur nicht: der
Browser expandiert Grau auf alle drei Farbkanäle, also steht die Temperatur auch
im Grünkanal — genau dort, wo der `ScalarLayer` die **Bezugshöhe** liest
(`raw.g * u_dem_max`, `src/scalar/ScalarLayer.ts:76`). Wer das PNG ungefiltert
durchreicht, bekommt eine Karte, die aussieht wie immer und deren
Höhenkorrektur mit der Temperatur als Meterzahl rechnet: 20 °C stünden für rund
2 400 m Bezugshöhe. Kein Absturz, keine Fehlermeldung — nur falsche Werte.

Die Zusammensetzung ist **kein neuer Code**: `composeTempRgba` in
`scripts/repack-icon-d2.mjs:252` ist seit BW-1 die Referenz und wird von
`verify:repack` je Lauf gegen `buildTempRgba` byte-geprüft. Der Client bekommt
dieselbe Regel, und der Verifier prüft ab jetzt **beide** Implementierungen
gegen dieselbe Wahrheit statt nur die eine.

## 22.3 Die Frist — gemessen, nicht geraten

Alle Zahlen am 2026-08-24 gegen `cdn.jsdelivr.net`, Läufe 2026082321/15:

| Lage | Median | p90 | max |
|---|---:|---:|---:|
| 26 Temp-Dateien seriell, erstmalig geholt | 1 652 ms | 4 422 ms | 12 706 ms |
| dieselben 26, Nebenläufigkeit 6 (wie der Client) | 494 ms | 758 ms | 907 ms |
| Wiederholung, warm | 131 ms | 213 ms | 214 ms |
| 13 Wind-Dateien seriell, erstmalig | 906 ms | 2 310 ms | 2 610 ms |
| eine nie geholte Datei, kalt / warm | 1 055 / 364 ms | | |
| eine fehlende Datei (404) | ~110 ms | | 527 ms |

Zwei Befunde daraus:

- **Der 12,7-s-Ausreißer ist kein Kaltstart-Preis.** Der Einzelversuch auf eine
  nie geholte Datei kostet gemessen **1,0 s**, nicht 13 — der Ausreißer lag an
  der Leitung, nicht am CDN. Eine Frist muss den Regelfall (unter 1 s) nicht
  schützen, sondern den Hänger.
- **Ein abgebrochener Abruf wärmt den Edge NICHT verlässlich.** Nach Abbruch bei
  250 ms kam der nächste Abruf derselben Datei weiter als `x-cache: MISS, MISS`
  (1 000 ms). Die naheliegende Hoffnung „das Timeout nützt wenigstens dem
  nächsten Besucher" trägt also nicht und wird nicht behauptet.

**Entscheidung:** zwei Fristen statt einer.

- **Erster Abruf der Sitzung: 3 s.** Er beantwortet nur eine Frage — trägt der
  Weg überhaupt? Ein totes CDN kostet damit 3 s, nicht mehr.
- **Danach: 6 s je Datei.** Das ist rund das Dreifache des schlechtesten
  gemessenen p90 und liegt in der Größenordnung des GRIB-Pfads, den es ersetzt
  (§14.3: 1,0 MB in 1,7–2,9 s je Datei).
- **Ein Fehlschlag gilt für die Sitzung.** Sonst zahlt jeder der 38 Schritte die
  Frist erneut. Der Grund ist strukturell: alle Dateien hängen an EINEM
  Commit — ist der weg, sind sie alle weg.

## 22.4 „Kein Abschnitt" ist der Normalfall

Zwischen DWD-Veröffentlichung und Producer-Lauf nennt das Manifest einen Lauf,
den das Daten-Repo noch nicht führt (live gesehen: Manifest 21 UTC, Repo
18 UTC). Der Client sieht dann keinen `repack`-Abschnitt und lädt GRIB. Das ist
**mehrmals täglich der erwartete Zustand**, kein Ausfall — und wird deshalb
weder gemeldet noch gezählt.

Die Anti-Drift-Regel aus §21 gilt auf der Client-Seite ein zweites Mal, und zwar
aus einem anderen Grund: der Warm-Cron prüft `repack.run === manifest.run`, aber
beide Loader können am Manifest **vorbei** auflösen (Directory-Scan, wenn das
Manifest fehlt, zu alt ist oder den Horizont nicht mehr deckt). Dann gehört der
Abschnitt zu einem anderen Lauf als die Frames. Der Client prüft die Gleichheit
deshalb selbst, am tatsächlich aufgelösten Lauf — nicht am Manifest.

## 22.5 Die Einhängepunkte

| Datei | Änderung |
|---|---|
| `src/sources/repackSource.ts` (neu) | Die eine Stelle: Abschnitt prüfen, URL bauen, PNG → RGBA laden (Frist + Sitzungsgedächtnis), Temperatur zusammensetzen. DOM-frei bis auf den Bildlader → vom Verifier importierbar |
| `src/wind/iconD2WindSource.ts` | `resolveWindRunFromManifest` reicht den Abschnitt durch; `loadStep` nimmt PNG statt u+v-GRIB, `uvBounds` aus `grid.corners` statt aus dem dekodierten Feld |
| `src/sources/gribManifest.ts` | `ParsedManifest`/`ManifestRun` tragen den rohen Abschnitt (additiv, geteilter 60-s-Cache bleibt) |
| `src/sources/iconD2TempSource.ts` | Abschnitt über `resolveRepackFromManifest`; PNG-Pfad spart zusätzlich den `hsurf`-GRIB-Abruf (647 KB); GRIB-Fallback holt `hsurf` dann nachträglich |
| `public/sw.js` | `cdn.jsdelivr.net` **durchreichen** (Cache-Namen-Bump `v2` → `v3`) |
| `scripts/verify-repack.mjs` | Client-Modul gegen dieselbe Wahrheit wie den Producer |

Nicht angefasst: `MapView.tsx` (beide Loader behalten ihre Signatur),
`ScalarLayer`, `WindLayer`, die Shader, der Frame-Cache in IndexedDB. Der
`IconD2WindFrame.image` bleibt `HTMLCanvasElement` — die drei Aufrufer mit
`getContext('2d')` (`:449`, `:598`, `:749`) sind der Grund, und `rgbaToCanvas`
(`:152`) ist bereits der passende Übergang.

## 22.6 Was gebaut wurde

Ein neues Modul und vier Einhängungen — der Rest des Repos ist unberührt.

**`src/sources/repackSource.ts`** ist die eine Stelle. Sie trennt sauber, was
ohne Browser prüfbar ist (Abschnitt annehmen oder ablehnen, URL bauen, Bild
zusammensetzen, Schalter) von dem, was einen Browser braucht (Bild laden). Nur
deshalb kann `verify:repack` den *Client* gegen dieselbe Wahrheit messen wie den
Producer, statt seinen Quelltext zu lesen.

Vier Entscheidungen darin sind keine Geschmacksfrage:

1. **Der Lauf wird gegen die AUFGELÖSTE Kennung geprüft, nicht gegen die des
   Manifests.** Beide Loader können am Manifest vorbei auflösen (Directory-Scan
   bei fehlendem, zu altem oder den Horizont nicht mehr deckendem Manifest).
   Ohne diesen Vergleich zeigte die Karte Werte des einen Laufs mit der
   Gültigkeitszeit eines anderen — und nichts daran sähe falsch aus.
2. **Dateinamen aus dem Manifest gehen in eine URL** und werden deshalb eng
   geprüft (`^[a-z0-9][a-z0-9._-]*\.png$`). Ein `../` darin trüge den Abruf aus
   dem Lauf-Verzeichnis heraus.
3. **Die Maße des dekodierten Bilds werden gegen den Abschnitt geprüft.** Ein
   Bild anderer Größe ist kein Darstellungsfehler, sondern ein Verortungsfehler:
   jeder Wert läge woanders, als die Ecken sagen.
4. **Ein Fehlschlag gilt für die Sitzung.** Das folgt aus der Ablage — alle
   Dateien hängen an EINEM Commit. Ist der weg, sind sie alle weg; jeder weitere
   Schritt bezahlte die Frist nur erneut. Ein Abbruch **durch den Aufrufer**
   (Layer abgewählt, Seite verlassen) zählt ausdrücklich nicht als Fehlschlag.

Die Einhängungen:

| Datei | was sich ändert |
|---|---|
| `src/sources/gribManifest.ts` | `getManifest()` herausgelöst, damit Lauf-Auflösung und `repack`-Abschnitt sich EIN Fetch-Promise teilen; der Abschnitt wird **roh** durchgereicht — dieser Resolver kennt weder CDN noch Bildformat |
| `src/wind/iconD2WindSource.ts` | `WindRunInfo.repack`; `loadStep` nimmt das PNG, wenn es für diesen Lauf liegt, sonst u+v-GRIB. `uvBounds` kommt dann aus `grid.corners` |
| `src/sources/iconD2TempSource.ts` | Abschnitt über `resolveRepackForRun`; im PNG-Pfad entfällt der `hsurf`-GRIB-Abruf **und** der Feld-Abruf, der nur der Geometrie diente. Der GRIB-Fallback holt `hsurf` nachträglich (einmal, gemerkt) |
| `public/sw.js` | `cdn.jsdelivr.net` wird durchgereicht, Cache-Namen `v2` → `v3` |

Nicht angefasst: `MapView.tsx` (beide Loader behalten ihre Signatur), die
Shader, `ScalarLayer`, `WindLayer`, der IndexedDB-Frame-Cache.

## 22.7 Gate GBW3 — die Belege

### (a) Der Rundlauf, jetzt mit den ECHTEN Dateien im echten Browser

BW-P (§19.1) hat den Rundlauf an einem *adversarialen* Rahmen gemessen, BW-1 die
Byte-Gleichheit in *Node*. Was fehlte, war beides zusammen: unsere wirklichen
Dateien, über das wirkliche CDN, in Chrome. Nachgeholt — SHA-256 des
zusammengesetzten Client-Bilds, einmal in Node aus `data/repack/`, einmal in
Chrome 151 aus `cdn.jsdelivr.net`:

| Datei | Node | Chrome |
|---|---|---|
| `temp-003.png` + `hsurf-v1.png` | `7996b1d5…792beceb` | `7996b1d5…792beceb` |
| `temp-004.png` + `hsurf-v1.png` | `aef56f95…5ae8e179` | `aef56f95…5ae8e179` |
| `wind-000.png` | `90fe02c7…b06b3927` | `90fe02c7…b06b3927` |

907 136 Byte je Temperaturbild, 608×373. **Die Kette GRIB → Producer → jsDelivr
→ Chrome ist damit geschlossen und exakt**, nicht „innerhalb der Toleranz".

### (b) Was der Besuch kostet — beide Wege, kalter Cache, dieselbe Seite

Prod-Build, `vite preview`, Service Worker abgemeldet, IndexedDB und Cache-API
geleert, Desktop 1440×900, `/wetterkarte/wind` (der Default-Layer):

| | Abrufe an `/_dwd_*` | über den eigenen Origin | über das CDN |
|---|---:|---:|---:|
| `?repack=0` (heute) | 7 | **6,675 MiB** | 0 |
| `?repack=1` | **0** | **0 MiB** | 5 Dateien, 0,733 MiB |

Faktor **9,1×** auf dem Datenanteil — und der Rest liegt nicht mehr auf
Netlifys Rechnung. Die sieben GRIB-Dateien sind `u_10m`/`v_10m` für zwei
Schritte, `hsurf` und `t_2m` für zwei Schritte; die fünf CDN-Dateien sind
`wind-003/004.png`, `hsurf-v1.png`, `temp-003/004.png`. Der Wert deckt sich mit
der Diagnose (§14.3: 6,73 MiB), gemessen an einem anderen Tag, anderem Lauf.

Nebenbefund, der die Diagnose bestätigt: auf der **Wind**-Seite werden `hsurf`
und `t_2m` mitgeladen — für die 141 Stadt-Labels, wie in §14.3 beschrieben. Sie
sind auf dem Repack-Pfad drei kleine PNGs statt 2,7 MiB GRIB.

### (c) Der Fallback — an einer Frist, nicht am Fehler

Der eigentliche Grund für die Frist war eine Messung: ein force-weggedrückter
Commit antwortete noch nach **19,9 s** mit 200 (§21.6). Nachgestellt, indem
jeder jsDelivr-Abruf in der Seite hängen bleibt (er löst nie auf, reagiert aber
auf Abbruch):

```
CDN-Abrufe gestartet: 3 · abgebrochen: 3 · nach 3005 / 3008 / 3008 ms
danach: 7 GRIB-Dateien, 6,675 MiB — exakt der Bestandsweg
Karte gerendert: ja
Konsole: genau EINE Zeile
  [repack] CDN nicht nutzbar (Frist abgelaufen) → GRIB für diese Sitzung.
```

Drei Belege in einem: die **erste Frist** (3 s) greift, sie greift **für alle
gleichzeitig laufenden Abrufe** statt dreimal nacheinander, und das
**Sitzungsgedächtnis** hält — die restlichen zwei Schritte haben es gar nicht
erst versucht. Ein totes CDN kostet damit einmalig 3 s, nicht 38 × 6 s.

### (d) Zeigt die Karte dasselbe?

Screenshot-Diff Desktop 1440×900, Temperaturlayer, feste Kamera:

| Vergleich | abweichende Pixel | größte Kanalabweichung |
|---|---:|---:|
| GRIB gegen CDN | 38 817 (3,505 %) | 160 |
| **GRIB gegen GRIB** (derselbe Weg, ~1 min später) | **39 909 (3,604 %)** | **206** |
| CDN gegen die zweite GRIB-Aufnahme | 2 193 (0,198 %) | 206 |

**Der Weg ist nicht die Ursache der Abweichung, die Zeit ist es.** Zwei
Aufnahmen desselben Wegs unterscheiden sich stärker als die zwei Wege
untereinander. Der Grund steht im Code: `lerpFrameImage` blendet zwischen zwei
Stundenframes, und der Blendfaktor hängt an `Date.now()` — zwei Ladevorgänge
sind nie exakt derselbe Moment. Eine „pixelgleich"-Behauptung wäre hier also
nicht prüfbar; die Byte-Gleichheit aus (a) sagt dasselbe schärfer, denn was in
den Renderer geht, ist beweisbar identisch.

### (e) Die Werte stimmen auch physikalisch

`verify:repack` beweist, dass beide Wege dieselben Bytes ergeben — das schlösse
nicht aus, dass beide dieselbe falsche Normierung benutzen. Deshalb der Rückweg
aus dem PNG in °C, verglichen mit einer FREMDEN Kette (Open-Meteo `icon_d2`,
dasselbe Modell, andere Auslieferung), Lauf 2026082321 + 3 h:

```
Ort            PNG °C   ICON-D2 °C   Δ K    hsurf m
Hamburg          14.1        13.8    0.32        18
Berlin           13.6        13.7   -0.05        35
München          13.9        14.0   -0.12       529
Wien             17.9        19.0   -1.12       176
Zürich           16.5        18.1   -1.63       441
Innsbruck        15.1        15.2   -0.14       618
…
n=10 · mittlere |Δ| 0,48 K · größte |Δ| 1,63 K
Auflösung der 8-bit-Skala: 0,235 K je Stufe
```

Beide Kanäle sind plausibel: die Temperatur trifft bis auf ein halbes Kelvin
(die zwei größten Abweichungen liegen in den Alpen bzw. am Domänenrand, wo
Open-Meteo anders herunterskaliert), und die Orographie aus `hsurf-v1.png` gibt
Hamburg 18 m, Innsbruck 618 m — also Modellgelände, nicht Zufall.

> **`qa:layers` konnte nicht laufen:** der Harnisch braucht Playwright, das hier
> nicht installiert ist; es zu installieren wäre eine Dependency-Änderung
> (STOPP & FRAGEN). Die Frage dahinter — stimmen die Werte gegen eine fremde
> Quelle — ist mit (e) beantwortet, und zwar an genau den Dateien, die der
> Client lädt.

### (f) Konsole, Mobil, Lange Aufgaben

- **Konsole:** auf beiden Wegen keine Fehler und keine Warnungen. Der einzige
  Eintrag ist eine vorbestehende DevTools-*Issue* („a form field element should
  have an id or name attribute"), die mit `?repack=0` genauso erscheint.
- **Mobil (iPhone 12 Pro, 390×844, DPR 3):** `?repack=1` lädt 5 CDN-Dateien,
  0,733 MiB, **0 GRIB**, Konsole sauber
  (`audit/screenshots/bw3-mobile-390-wind-cdn.png`).
- **Lange Aufgaben:** eine Aufgabe über 200 ms, und sie ist **nicht neu**.
  Rücken an Rücken unter gleicher Maschinenlast gemessen: `?repack=1` 3 198 ms,
  `?repack=0` 2 857 ms — dieselbe Größenordnung auf beiden Wegen. Zugeordnet
  ist sie auch: sie beginnt **7 ms** nach der letzten Terrarium-Kachel (zweimal
  reproduziert, 7 ms und 7 ms), also mit `buildDemImage` — dem
  gipfelerhaltenden Umtasten des Höhenmodells, 700 × ~1 140 Zellen × 9
  Stützpunkte auf dem Hauptthread. Das läuft auf **beiden** Wegen und hat mit
  dem Repack nichts zu tun. Neuer Eintrag **V-BW-21**.

  Eine Nuance gehört dazu: auf dem Repack-Pfad wird die DEM-Arbeit *früher*
  erreicht, weil die GRIB-Wartezeit davor entfällt. Die Kosten ändern sich
  nicht, ihre Sichtbarkeit schon.

### (g) Die fünf Selbstverifikations-Fragen

| Frage | Antwort | Beleg |
|---|---|---|
| 1 Funktionserhalt | ja — der GRIB-Pfad ist unverändert und default aktiv; der neue Weg ist ausschließlich additiv hinter `?repack=1` | Verifier „Schalter ist default-off"; `?repack=0` lädt exakt die 7 GRIB-Dateien wie vorher |
| 2 Desktop pixelgleich | keine Layout-Änderung, kein CSS angefasst; Kartenwerte byte-identisch | (a), (d) |
| 3 Touch-Targets ≥ 44 px | keine UI geändert | — |
| 4 Konsole sauber | ja | (f) |
| 5 keine Long Tasks > 200 ms | **nein — aber unverändert.** Die eine Aufgabe ist vorbestehend und zugeordnet | (f), V-BW-21 |

### (h) Prüfläufe

```
verify:repack        105/105   (BW-1 41 · BW-2 38 · BW-3 26)
typecheck            grün
npm run build        grün
npm run budget       alle Budgets eingehalten (totalJs 971,6 / 1017,7 KB · maplibre 278,4 KB gz)
verify:layer-geometry · verify:warm-wind · verify:warm-budget ·
verify:datenalter · verify:health · verify:radar-sampling ·
verify:precip-source                                            alle grün
```

Die 26 neuen Prüfungen decken drei Klassen ab: **der Client baut dieselben URLs
wie der Producer** (sonst 404 erst in Produktion), **er lehnt ab, was er
ablehnen muss** (fremder Lauf, fremdes Schema, `http://`, abgeschnittener
Commit, `../` im Dateinamen, Windschritt ohne Normierung, leere Schrittliste,
Gitter ohne Ecken, fehlende Familie) und **er setzt das Temperaturbild richtig
zusammen**. Die letzte Prüfung hat eine Gegenprobe: dasselbe Bild ungefiltert
durchgereicht MUSS abweichen — sonst prüfte die Zeile darüber nichts.

Dazu die Geometrie-Zeile, die den Verzicht auf den GRIB-Abruf rechtfertigt:
`uvBounds` aus dem Abschnitt und `uvBounds` aus dem dekodierten Feld sind auf
**0** gleich, nicht auf „nahe".

## 22.8 Was offen bleibt

- **BW-4** schaltet scharf: die Vorgabezeile in `repackFlagFrom` dreht sich auf
  „an, außer ausdrücklich abgeschaltet", danach dieselbe Messung wie in der
  Diagnose (Startseite → Wetterkarte, `performance.getEntriesByType('resource')`
  nach Origin), ADR in `decisions.md`, Statusblock in `CLAUDE.md`.
  → **Erledigt am 2026-08-24, §23 (Gate GBW4).**
- **Der Produktions-Kreis läuft noch nicht von selbst.** `public/latest-*.json`
  in Prod tragen keinen `repack`-Abschnitt, weil die Warm-Crons dieses Repos
  uncommitted sind und der Producer-Batch im Daten-Repo nicht dispatcht ist
  (beides Jans Gate). Solange ist der Schalter auch scharf wirkungslos — der
  Client sieht keinen Abschnitt und nimmt GRIB. Für die Messungen hier lagen die
  echten Cron-Ausgaben in `dist/`; `public/` ist unberührt geblieben.
- **V-BW-21** (neu): `buildDemImage` blockiert den Hauptthread ~3 s. Vorschlag
  in §12.

---

# 23. BW-4 — Scharfschalten (2026-08-24)

Die Phase ändert **eine Zeile** — die Vorgabe in `repackFlagFrom`
(`src/sources/repackSource.ts`) dreht von „aus, außer ausdrücklich an" auf
„an, außer ausdrücklich aus":

    -  return stored === '1';
    +  return stored !== '0';

Sonst nichts. Ladeweg, Bildformat, Fristen und der benannte Fallback stehen
unverändert seit BW-3 und sind dort belegt (Gate GBW3, §22.7). Was sich ändert,
ist ausschließlich, **wer** auf dem neuen Weg landet: bisher nur, wer
`?repack=1` anhängte — ab jetzt jeder.

## 23.1 Damit wechselt die Beweislast

Solange der Weg default-off war, war das Einschalten die Zusage. Jetzt ist es
das **Abschalten**, und das ist die eigentliche neue Anforderung dieser Phase:

| Weg zurück | wirkt | Beleg |
|---|---|---|
| `?repack=0` | für diesen Aufruf | §23.3 |
| `localStorage.repack = '0'` | dauerhaft für dieses Gerät | §23.2 — die Kontrollmessung IST dieser Fall |
| `?repack=1` bzw. `'1'` | zurück auf den neuen Weg | `verify:repack` |

Die Query schlägt den Speicher **in beide Richtungen**. Ohne diese Regel käme
ein einmal abgeschaltetes Gerät nicht ohne Umweg über die Konsole zurück — der
Kill-Switch wäre eine Einbahnstraße.

Dazu eine Falle, die der Code erst auf den zweiten Blick zeigt: `?repack=0`
steht in einer URL, die die Wetterkarte **selbst umschreibt** (Kamera ⇒
`replaceState`, 300 ms debounced). Ein Kill-Switch, den die Karte beim ersten
Schwenk aus der URL wirft, ist keiner. Er überlebt, weil `repack` kein bekannter
Query-Key ist, deshalb in `parseMapSearch(…).extra` landet und von
`WetterkarteRoute.tsx:105` unverändert wieder angehängt wird. Das ist seit
dieser Phase eine geprüfte Zusage, keine Nebenwirkung.

Und eine zweite Stelle, an der das Drehen der Vorgabe eine bis dahin harmlose
Zeile gefährlich macht: `repackEnabled()` las den Speicher **im selben `try`**
wie den Rest und gab bei jedem Fehler `false` zurück. `localStorage` wirft in
manchen Datenschutz-Einstellungen aber schon beim **Lesen** — solange die
Vorgabe „aus" war, kam dabei ohnehin „aus" heraus. Seit BW-4 hieße dieselbe
Zeile: genau diese Besucher sind still vom neuen Weg ausgenommen. Nicht kaputt,
aber ohne die Ersparnis, und niemand sähe es. Der Speicherzugriff hat deshalb
jetzt seinen eigenen Fang; ein unlesbarer Speicher heißt „kein gespeicherter
Wunsch", und damit gilt die Vorgabe. **Lehre: wenn eine Vorgabe kippt, muss
jeder Fehlerpfad, der bisher zufällig auf sie zeigte, noch einmal gelesen
werden** — er zeigt jetzt woandershin.

## 23.2 Die Messung

Methode wie in der Diagnose (§2): Prod-Build, Prod-Preview, Weg **Startseite →
Kachel „01 · WETTERKARTE"**, danach `performance.getEntriesByType('resource')`
nach Origin summiert. Beide Läufe liefen auf **je eigenem Port** — 5205 für den
Bestandsweg, 5204 für die Vorgabe —, damit jeder Lauf einen eigenen HTTP-Cache,
eine eigene Service-Worker-Registrierung und eigenen Speicher hat; vorher
zusätzlich Service Worker abgemeldet, Cache API und IndexedDB gelöscht. Gemessen
wird `encodedBodySize`, weil `transferSize` bei Antworten aus dem Vorlade- oder
SW-Cache 0 meldet und die Zahl damit kleiner aussähe, als sie ist.

Im Manifest stand der echte Cron-Abschnitt für Lauf **2026082321**, die Bilder
kamen vom echten CDN (Commit `f3cbc6c4`).

| | eigener Origin | davon GRIB | jsDelivr | Abrufe gesamt |
|---|---:|---:|---:|---:|
| `localStorage.repack = '0'` (Bestandsweg) | **7 785 032 B** = 7,424 MiB | 7 Dateien / 6 993 803 B = **6,670 MiB** | 0 | 237 |
| Vorgabe (BW-4, kein Parameter) | **1 294 732 B** = 1,235 MiB | **0** | 5 Dateien / 770 830 B = 0,735 MiB | 228 |

- **Eigener Origin — das, was auf Netlifys Rechnung stünde: 7,424 → 1,235 MiB.**
  Das sind 6,19 MiB weniger je Kaltsitzung, Faktor **6,0×**.
- **Der Datenanteil verlässt den eigenen Origin vollständig**: 6,670 MiB → 0.
  Auch als Bytes gerechnet ist es Faktor **9,1×** (6,670 gegen 0,735 MiB).
- Die fünf CDN-Dateien sind genau die erwarteten: `wind-004.png`,
  `wind-005.png`, `temp-004.png`, `temp-005.png` und einmal `hsurf-v1.png`.
- Die Erwartung der Diagnose war „~1,1 MiB Gesamtsitzung, Datenanteil ~0". Sie
  trifft zu; die 1,235 statt 1,1 MiB sind die App-Shell dieses Builds, keine
  Daten.

**Mobil (390 × 844, DPR 3, iPhone 12 Pro):** dasselbe Bild — **0 GRIB**,
5 CDN-Dateien / 773 618 B. (Anderer Zeitpunkt, deshalb Schritte 005/006 statt
004/005.) Screenshots:
`audit/screenshots/bw4-desktop-wetterkarte-default.png`,
`audit/screenshots/bw4-mobile-390-wetterkarte-default.png`.

## 23.3 Der Kill-Switch, an der laufenden Karte

`/wetterkarte/wind?repack=0`, kalter Kontext, `localStorage` leer:

- **0** Abrufe an `cdn.jsdelivr.net`, **7** an `/_dwd_grib` — exakt der
  Bestandsweg.
- Nach dem ersten Zustands-Schreiben der Karte steht in der Adresszeile
  `/wetterkarte/wind?lat=50.0652&lon=11.5&z=4.52&repack=0` — der Parameter hat
  das Umschreiben überlebt.
- `localStorage.repack` ist danach `null`: die Query schreibt **nicht** in den
  Speicher. Das ist Absicht — ein geteilter Link soll dem Empfänger nichts
  dauerhaft umstellen.

Der dauerhafte Weg (`localStorage.repack = '0'`) ist nicht zusätzlich geprüft,
sondern **ist** der Bestandsweg-Lauf aus §23.2: dort war genau dieser Schlüssel
gesetzt, und es gab 0 CDN-Abrufe.

## 23.4 Der Fall, der heute in Produktion gilt: „kein Abschnitt"

Der Produktions-Kreis läuft noch nicht von selbst (§23.6). Deshalb ist der
wichtigste Lauf dieser Phase der, in dem das Manifest **keinen**
`repack`-Abschnitt trägt und der Schalter trotzdem scharf steht. Dafür wurden in
`dist/` die echten, unveränderten `public/latest-*.json` eingesetzt:

- **0 Abrufe** an `cdn.jsdelivr.net`.
- 8 Abrufe über `/_dwd_*` (7 039 330 B) — der Bestandsweg, unverändert.
- Zwei Manifest-Abrufe, 20 ms und 22 ms. **Kein zusätzlicher Abruf, keine
  verbrauchte Frist**: `parseRepackSection(null, …)` gibt `null` zurück, bevor
  irgendetwas geladen wird.
- Konsole sauber.

Scharf geschaltet ist der Weg damit heute **wirkungslos, nicht kaputt** — und
das ist auch der Normalfall mehrmals täglich zwischen DWD-Publikation und
Producer-Lauf (§22.4).

## 23.5 Gate GBW4

| Frage | Antwort | Beleg |
|---|---|---|
| Karte funktioniert unverändert | ja, Desktop und Mobil, beide Wege | §23.2, Screenshots |
| Datenanteil verlässt den eigenen Origin | ja: 6,670 MiB → 0 | §23.2 |
| Gesamtsitzung wie in der Diagnose erwartet | ja: 7,424 → 1,235 MiB (Erwartung ~1,1) | §23.2 |
| Kill-Switch wirkt und überlebt die Karte | ja, beide Formen | §23.3 |
| „Kein Abschnitt" bleibt folgenlos | ja, 0 CDN-Abrufe, keine Frist | §23.4 |
| 1 Funktionserhalt | ja — kein Rückbau; der Bestandsweg bleibt vollständig erreichbar | §23.3 |
| 2 Desktop unverändert | ja | Screenshot, gleiche Kartenlage wie GBW3 |
| 3 Touch-Ziele ≥ 44 px | unberührt — diese Phase ändert keine UI | — |
| 4 Konsole sauber | ja; nur zwei vorbestehende a11y-Hinweise („form field element should have an id or name") | §23.2 |
| 5 keine Long Tasks > 200 ms | **nein — und jetzt zugeordnet statt vermutet.** Sechs Läufe an ruhiger Maschine: die große Aufgabe ist auf beiden Wegen gleich groß (2 573 gegen 2 591 ms, bester von je 3) und beginnt in JEDEM Lauf 2–26 ms nach der letzten Terrarium-Kachel ⇒ `buildDemImage`, V-BW-21 | §23.7 |

Die letzte Zeile hat zwei Anläufe gebraucht und ist deshalb in **§23.7**
ausführlich belegt: der erste Versuch lief gegen neun Vite-Prozesse aus früheren
Sitzungen und sprang zwischen zwei Läufen um mehr als das Zehnfache (Lehre aus
VB0: der Leistungsanker misst die Maschine mit). Nach dem Aufräumen streuen
sechs Läufe um 3 %.

**Prüfläufe:** `npm run typecheck` grün · `verify:repack` **106/106** (dreimal
gelaufen, stabil; zwei Schalter-Prüfungen gedreht, eine neue für das Überleben
von `?repack=0` in der Karten-URL) · `npm run build` grün · `npm run budget`
eingehalten (eagerJs 101,5/106,5 KB · largestChunk 278,4/292,3 KB gz · totalJs
971,6/1017,7 KB) · `verify:routing` **70/70** · `verify:radar-sampling` 25/25 ·
`verify:precip-source` 30/30 · `verify:warm-budget` 30/30 · `verify:datenalter`
54/54 · `verify:layer-geometry`, `verify:health`, `verify:warm-wind` PASS.

Dabei fiel ein **Altfehler aus BW-3** auf, den erst dieser Gesamtlauf zeigte:
`verify:routing` stand auf 69/70, weil die Zeile
`add('[sw] VERSION ist v2…', /const VERSION = 'v2'/.test(sw))` die Versionszahl
**wörtlich** prüfte — BW-3 hatte den Service Worker auf `v3` gebumpt, genau wie
es der Plan verlangt. Die Prüfung stand damit gegen ihre eigene Absicht: gemeint
war nie „die Zahl ist 2", sondern „die Zahl liegt hinter der Hash-Ära **und** die
Cache-Namen hängen an ihr" — sonst verwirft ein Bump nichts, und der Bump ist der
ganze Zweck. Jetzt geprüft wird die Absicht (`≥ v2` und alle drei Namen aus
`${VERSION}` gebildet). Dieselbe Familie wie **V-BW-19**: eine Textsonde auf
einen Wert, der sich planmäßig ändert, meldet den nächsten planmäßigen Schritt
als Fehler.

## 23.6 Was jetzt noch fehlt — und es ist nicht mehr Code

Der Client ist fertig. Damit die Messung aus §23.2 auch für echte Besucher gilt,
fehlen zwei Schritte, die beide **Jans Gate** sind:

1. **Die Warm-Crons dieses Repos committen und deployen.** `scripts/warm-wind.mjs`
   und `scripts/warm-grib.mjs` schreiben den `repack`-Abschnitt seit BW-2, sind
   aber uncommitted; in Produktion läuft die alte Fassung, und
   `public/latest-*.json` tragen deshalb keinen Abschnitt (nachgesehen am
   2026-08-24: nur `run, runAt, steps/params, updatedAt, warmedThroughProxy`).
2. **Den Producer-Batch im Daten-Repo dispatchen.** Der Live-Index trägt heute
   vier Läufe (2026082312/15/18/21), veröffentlicht am 2026-08-23 23:17 — alle
   aus dem Handlauf von BW-2/BW-3, nicht aus einem laufenden Zeitplan.

Bis dahin gilt der Befund aus §23.4: der Schalter steht scharf und läuft ins
Leere, ohne Kosten und ohne Fehler. Sobald beide Schritte getan sind, greift der
neue Weg ohne weitere Änderung am Client — deshalb steht diese Phase hier und
nicht danach.

**N2 ist erledigt** (nachgesehen am 2026-08-24, 11:15 UTC): buscosun.com
antwortet wieder mit 200, `/wetterkarte/wind` liefert eine Route-Shell und die
Startseite lädt den `cjs-helpers`-Chunk — beides gibt es erst seit RT1, die
Deploys laufen also wieder. `latest-wind.json` in Prod trägt `updatedAt`
**10:18 UTC**, `latest-grib.json` **10:47 UTC**, beide für Lauf 2026082409: auch
der Commit-back der Crons kommt an. Damit ist der Satz aus §7 („ohne N2 wirkt
keine der übrigen Maßnahmen") **nicht mehr gültig** — der Weg zur Wirkung ist
frei. Prod liefert erwartungsgemäß noch Service Worker `v2` ohne
jsDelivr-Durchreicher und Manifeste ohne `repack`-Abschnitt: die BW-Arbeit ist
uncommitted.

Unverändert offen aus früheren Phasen: **V-BW-21** (`buildDemImage`, 2,57–2,70 s
Hauptthread, §23.7), **V-BW-19**, **V-BW-20**, **V-BW-4** (der Commit-back löst je
Advance einen Netlify-Build aus, ~900/Monat — nach dem Repack der letzte
verbliebene Cron-Kostenposten) und die Quick Wins Q4/Q5.
**BW-5 ist seit 2026-08-24 umgesetzt** (§24, Gate GBW5).

## 23.7 Die lange Aufgabe — nachgemessen an ruhiger Maschine (2026-08-24)

Der erste Anlauf war unbrauchbar: auf der Maschine liefen **neun** Vite-Prozesse
aus Sitzungen vom 17., 19., 22. und 23. August (je Server zusätzlich der
`npx`-Wrapper). Die Werte sprangen zwischen zwei Läufen desselben Wegs um mehr
als das Zehnfache. Nach dem Beenden aller neun wurde die Messung wiederholt —
ein Preview-Server, ein Tab, sechs Läufe, vor jedem Lauf Service Worker
abgemeldet und Cache API + IndexedDB gelöscht.

**Besonderheit des Tages**, weil sie das Ergebnis erklärt: der letzte gebaute
Repack-Lauf ist **2026082321**. Sein **Wind**-Horizont (`MAX_STEP 12`) endete um
09:00 UTC, gemessen wurde um 11:10 UTC — der Wind fiel deshalb auf GRIB zurück
und löste dabei über den Verzeichnis-Scan sogar einen **frischeren** DWD-Lauf
auf (2026082409). Die **Temperatur** (`MAX_STEP 24`, Horizont bis 21:00 UTC) kam
weiter vom CDN. Der Vergleich unten ist damit ein echtes A/B **auf der
Temperatur-Hälfte** und ein Gleichstand auf der Wind-Hälfte. Das ist keine
Panne, sondern der in §22.4 beschriebene Normalfall — hier zum ersten Mal live
und je Familie getrennt beobachtet: **die zwei Familien fallen unabhängig
voneinander zurück.**

**Weg A — Vorgabe** (Temperatur CDN, Wind GRIB):

| Lauf | letzte Terrarium-Kachel | größte Aufgabe | Abstand | Aufgaben > 200 ms |
|---:|---:|---:|---:|---|
| 1 | 3 512 ms | **2 573 ms** @ 3 538 | 26 ms | 2 573 · 262 |
| 2 | 1 563 ms | 2 595 ms @ 1 567 | 4 ms | 2 595 · 258 |
| 3 | 1 464 ms | 2 656 ms @ 1 467 | 3 ms | 2 656 · 202 |

**Weg B — `?repack=0`** (beide Familien GRIB):

| Lauf | letzte Terrarium-Kachel | größte Aufgabe | Abstand | Aufgaben > 200 ms |
|---:|---:|---:|---:|---|
| 1 | 2 495 ms | **2 591 ms** @ 2 497 | 2 ms | 2 591 · 243 |
| 2 | 2 628 ms | 2 668 ms @ 2 634 | 6 ms | 2 668 |
| 3 | 2 328 ms | 2 704 ms @ 2 343 | 15 ms | 2 704 |

Drei Aussagen, jede einzeln belegt:

1. **Die Zuordnung trägt in jedem Lauf.** Die große Aufgabe beginnt 2, 3, 4, 6,
   15 bzw. 26 ms nach dem Ende der **letzten** Terrarium-Kachel — sechs von
   sechs. Das ist `buildDemImage` (700 × ~1 140 Zellen × 9 Stützpunkte,
   gipfelerhaltendes Maximum, auf dem Hauptthread). GBW3 hatte 7 ms gemessen und
   daraus geschlossen; jetzt ist es kein Schluss mehr, sondern eine Reihe.
2. **Die Wege unterscheiden sich nicht.** Bester von 3: **2 573 ms (A) gegen
   2 591 ms (B)** — 18 ms Unterschied bei einer Streuung von 83 bzw. 113 ms
   innerhalb desselben Wegs. Nach Median (2 595 gegen 2 668 ms) läge A sogar
   vorn; auch das ist Rauschen. Es gibt keinen messbaren Aufpreis des PNG-Wegs.
3. **Die Aufgabe ist unabhängig von beiden Datenwegen.** Das DEM kommt von
   Terrarium/S3 und hat mit ICON-D2 nichts zu tun — sie überlebt jede
   Transport-Optimierung. Der Repack macht sie nur **sichtbarer**, weil die
   GRIB-Wartezeit davor entfällt.

Die kleineren Aufgaben (202–262 ms) treten auf beiden Wegen auf, aber nicht in
jedem Lauf und zu verschiedenen Zeitpunkten (3,1 s bzw. 5,2–5,5 s) — sie sind
nicht zugeordnet und in dieser Größenordnung auch nicht die Ruckelquelle, die
V-BW-21 beschreibt.

**Was diese Messung NICHT beantwortet:** die Wind-Hälfte lief in beiden Wegen
über GRIB, weil kein Repack-Lauf mehr den aktuellen Zeitpunkt abdeckte. Die
vollständige Gegenüberstellung beider Familien steht in GBW3 (3 198 gegen
2 857 ms, ebenfalls ohne Unterschied jenseits der Streuung). Sobald der
Producer-Batch läuft (§23.6), ist sie jederzeit ohne Vorbereitung wiederholbar.


# 24. BW-5 — Regenradar (2026-08-24)

Das Regenradar ist RADOLAN, nicht ICON-D2; der Repack aus BW-1…BW-4 erfasst es
nicht. Diese Phase steht deshalb völlig getrennt von der Repack-Linie und ist
einzeln rücknehmbar.

## 24.1 Gemessen, bevor gebaut wurde

Methode wie §23.2: Prod-Build, eigener Preview-Port, vor jedem Lauf Service
Worker abgemeldet und Cache API + IndexedDB gelöscht, Summe über
`performance.getEntriesByType('resource')` nach `encodedBodySize`. Der Ort kommt
als Deep-Link in der Query (`?ort=…&olat=…&olon=…&land=…`), weil `/regenradar`
**ohne Ort gar nichts lädt** — die nackte Seite ist 0,52 MiB Shell und ein
Suchfeld. Alle Messungen am 2026-08-24, 11:40–12:05 UTC.

| Land | Ort | Requests | Sitzung | davon Daten |
|---|---|---:|---:|---:|
| DE | Frankfurt am Main | 100 | **16,58 MiB** | 16,02 MiB |
| AT | Wien | 42 | **2,10 MiB** | 1,56 MiB |
| CH | Zürich | 141 | **2,29 MiB** | 1,70 MiB |

Die Diagnose (§9 a, Q6/Q7) hatte für DE „~12 Requests, ~5,2 MiB" notiert. Das
war **um mehr als das Dreifache zu niedrig** — und aus einem Grund, den die
damalige Messung nicht sehen konnte.

## 24.2 Der größte Posten ist gar nicht das Radar

| Posten | Requests | Bytes | Anteil DE-Sitzung |
|---|---:|---:|---:|
| **`cape_ml` (ICON-D2) über `/_dwd_grib`** | 4 | **12,65 MiB** | **76,3 %** |
| RV-Tars (`/_dwd_opendata`) | 10 | 3,06 MiB | 18,4 % |
| RV-Verzeichnis-Listings | 3 | 0,45 MiB | 2,7 % |
| App-Shell | 45 | 0,56 MiB | 3,4 % |
| Basiskarte (openfreemap) | 9 | 0,52 MiB | 3,1 % |
| brightsky-Beobachtungen | 22 | 0,04 MiB | 0,3 % |

**Der Plan sagt: „`/regenradar` ist **100 % ICON-D2-frei**
(`radarFrames.ts:19-23` importiert nur `radolan.ts`, `geosphereIncaGrid.ts`,
`meteoSwissRadar.ts`)." Das stimmt für `radarFrames.ts` und ist für die Seite
falsch.** `NowcastRadarMap.tsx:32` importiert `fetchPeakCapeAtPoint` aus
`sources/iconD2Cape.ts`; der Effekt bei `:251-259` startet ihn bei jedem Mount
und bei jedem Punktwechsel (nur DE). `fetchPeakCapeAtPoint` ruft
`fetchCapeSeriesAtPoint(lat, lon, 3)` → `fetchIconD2Grid('cape_ml', { maxStep: 3 })`
→ **vier vollständige ICON-D2-Raster** (1215 × 746, je 3,0–3,2 MiB bz2), um daraus
**eine einzige Zahl** zu gewinnen: das Maximum an EINEM Punkt über 0…3 h.

Das ist das schlechteste Byte-pro-Aussage-Verhältnis im ganzen Projekt:
**13 264 KB für 4 Byte.** Zum Vergleich: der komplette Radar-Nowcast, aus dem
die Karte 25 Frames zeichnet, kostet 328 KB.

Der Wert speist `convectiveIndex({ capeJkg, … })` (`:307-315`). Die Funktion hat
ein benanntes `fallbackRiskPct` und läuft ohne CAPE weiter — genau das passiert
heute in AT und CH, wo das Feld nicht existiert. Der Index wird ohne CAPE
gröber, aber er verschwindet nicht.

`cape_ml` liegt **außerhalb** des Repack-Umfangs (Jans Entscheidung 2: nur Wind
und Temperatur). Der Posten ist damit kein Repack-Thema, sondern eine eigene
Frage — als **V-BW-22** aufgenommen, mit drei Wegen in §24.6. Er wird in dieser
Phase **nicht** angefasst: er ändert eine angezeigte Aussage, und das ist Jans
Entscheidung, nicht meine.

## 24.3 Die drei Maßnahmen des Plans — am Messwert

### (1) Das RV-Verzeichnis-Listing

Gemessen am 2026-08-24, 11:38 UTC, direkt gegen `opendata.dwd.de`:

```
Listing       157 973 B   1 478 ms   cache-control: —
Läufe         577 (48 h)  Abweichungen vom 5-Minuten-Raster: keine
```

Das Verzeichnis ist ein **lückenloses 5-Minuten-Raster über 48 Stunden**. Für
diese Auskunft lädt die App ein 154-KiB-HTML — und zwar **dreimal je
DE-Kaltsitzung** (gemessen: t = 307 ms, t = 312 ms, t = 7 103 ms) plus einmal je
5-Minuten-Refresh. Zweimal davon ist der Doppelabruf aus (3), einmal
`fetchRvAnalysisSequence`, das keinen Lauf-Cache hat.

Der Veröffentlichungsverzug ist die Größe, an der ein Rat scheitern oder
gelingen würde. Über zwölf aufeinanderfolgende Läufe (`Last-Modified` gegen die
Slot-Zeit):

```
2608241135 -> 11:38:20 UTC   3,33 min      2608241105 -> 11:08:26 UTC   3,43 min
2608241130 -> 11:33:20 UTC   3,33 min      2608241100 -> 11:03:19 UTC   3,32 min
2608241125 -> 11:28:21 UTC   3,35 min      2608241055 -> 10:58:18 UTC   3,30 min
2608241120 -> 11:23:22 UTC   3,37 min      2608241050 -> 10:53:17 UTC   3,28 min
2608241115 -> 11:18:18 UTC   3,30 min      2608241045 -> 10:48:20 UTC   3,33 min
2608241110 -> 11:13:17 UTC   3,28 min      2608241040 -> 10:43:22 UTC   3,37 min
                                    min/median/max: 3,28 / 3,33 / 3,43 min
```

**Streuung 9 Sekunden über eine Stunde.** Der Zeitstempel ist damit rechenbar,
und zwar ohne die Genauigkeit zu verlieren, die das Listing hat.

Die Richtung des Rats ist eine Ehrlichkeitsfrage, keine Geschmacksfrage. Wer
sicherheitshalber 4 Minuten zurückrechnet, trifft immer eine existierende Datei,
zeigt aber in rund 11 % der Aufrufe **stillschweigend einen 5 Minuten alten
Stand**, obwohl der neuere da ist. Wer beim frühestmöglichen Slot ansetzt
(3,3 min), trifft in ~97 % sofort und zahlt sonst **einen 404** — gemessen
788 ms gegen DWD, mit leerem Rumpf. Ein Fehlgriff, der sich selbst korrigiert,
ist besser als ein stiller Rückstand: **wir raten aggressiv und lassen den 404
korrigieren.**

Das Listing bleibt als benannter Fallback (Muster „Rule 2"): schlagen alle
gerechneten Kandidaten fehl, wird es geladen. Ändert der DWD Takt oder
Namensschema, funktioniert die Seite weiter — nur wieder mit 154 KB.

### (2) `seedDePastArchive` beim Öffnen

`NowcastRadarMap.tsx:221` startet den Seed, sobald der Stack geladen ist —
unabhängig davon, ob der Rückblick je benutzt wird. Gemessen: **acht weitere
RV-Tars** (`…1130` bis `…1055`), sequenziell über 27 Sekunden, **2,28 MiB**.

Der neunte Lauf ist der schon geladene aktuelle; er kommt aus dem Tar-Cache.

Die Tar-Größe hängt am Wetter, und zwar stark. Über 24 Läufe desselben
Vormittags: **123 150 / 226 847 / 336 207 B** (min/median/max). Der Seed kostet
also je nach Lage **1,0–2,6 MiB**; die 4,5 MiB des Plans stammen von einem
nasseren Tag und sind die obere Kante, nicht der Regelfall.

### (3) Der Doppelabruf

Er ist kein AT/CH-Thema. Er trifft **alle drei Länder**, und er hat genau eine
Ursache: `NowcastPage` und `NowcastRadarMap` montieren gleichzeitig und laden
dieselbe Quelle unabhängig voneinander —

```
NowcastPage    → buildNowcast → createRadarNowcastSampler(country)
NowcastRadarMap → getRadarStack(country)
```

Kein Cache greift dazwischen, weil beide Aufrufe **gleichzeitig** starten: die
Cache-API-Prüfung in `fetchRvBytesCached` läuft in beiden ab, bevor einer von
beiden abgelegt hat. Gemessen, jeweils zwei Einträge derselben URL wenige
Millisekunden auseinander:

| Land | doppelt geholt | Abstand | Bytes doppelt |
|---|---|---:|---:|
| DE | RV-Listing + `DE1200_RV2608241135.tar.bz2` | 5 ms / 2,3 s | **493 907 B** |
| AT | INCA-Raster `nowcast-v1-15min-1km` | 2 ms | **721 713 B** |
| CH | STAC-Tagesitem + `rzc…h5` | 3 ms | 206 440 B |

Bei DE und AT ist der zweite Abruf sicher Netz: weder `/_dwd_opendata` noch die
GeoSphere-API senden irgendeinen Cache-Header (§14.4). Für AT sind das **34 %
der gesamten Sitzung**.

Bei CH ist die Byte-Ersparnis **unsicher** und wird hier nicht behauptet: die
beiden Endpunkte senden `max-age=600` bzw. `max-age=7200`, ein warmer
HTTP-Cache fängt die Wiederholung also ab, und ob Chrome zwei gleichzeitige
identische GETs zusammenlegt, hängt am Zustand. Sicher ist bei CH nur das
**doppelte Dekodieren** des HDF5 — und das gilt für alle drei Länder: DE
entpackt und dekodiert den 25-Frame-Tar zweimal, AT das netCDF, CH das HDF5.

## 24.4 Zwei Nebenbefunde, die nicht zur Phase gehören

Sie stehen hier, damit sie nicht verloren gehen — angefasst werden sie nicht:

- **CH lädt 79 Stations-CSVs einzeln** (`ogd-smn_<stn>_t_now.csv`, ~8,5 KB je
  Datei) plus ein 151-KB-Stationsverzeichnis: **~0,81 MiB und 8 Sekunden**, mehr
  als das CH-Radar selbst. → **V-BW-23**.
- **`maps.dwd.de/geoserver/dwd/wms` wird viermal mit identischer URL geholt**
  (je 5 622 B). Klein, aber dieselbe Ursache wie (3). → **V-BW-24**.

## 24.5 Was das lokale Manifest zur Messung beiträgt

Der Arbeitsbaum ist 32 Commits hinter `origin/main` (ausschließlich
`public/latest-*.json` aus den Cron-Commit-backs), das lokale Manifest steht
deshalb auf Lauf **2026082312**, gestempelt 2026-08-23 13:17 UTC — 22 Stunden
alt und damit knapp innerhalb des 24-h-Staleness-Guards. Die CAPE-Dateien, die
oben gemessen wurden, sind entsprechend die Schritte 000–003 dieses Laufs.

Für die Bytes ändert das nichts (die Dateigrößen hängen am Feld, nicht am
Alter), für die Reproduzierbarkeit schon: wer nachmisst, bekommt andere
Dateinamen und ±5 % andere Größen.

## 24.6 V-BW-22 — der CAPE-Posten, drei Wege

Kein Weg wird in dieser Phase gegangen; die Wahl ist Jans.

| Weg | Ersparnis | Preis |
|---|---:|---|
| **a) Erst laden, wenn der Gewitter-Index sichtbar gebraucht wird** | 12,65 MiB in jeder Sitzung, die ihn nicht öffnet | Der Index steht zunächst auf dem `fallbackRiskPct` und wird nachträglich genauer — sichtbar, also anzusagen |
| **b) Auf Schritt 0 kürzen** | 9,49 MiB | Ändert die Aussage: aus „Spitze über 0–3 h" wird „Wert jetzt". Das ist eine andere Größe, kein Detail |
| **c) CAPE-Punktreihe vorprozessieren** (Producer wie BW-1, Ablage wie BW-2) | 12,65 MiB → einige KB | Neuer Producer, neue Datei, neuer Umfang — Jans Gate, und es weitet Entscheidung 2 (nur Wind + Temperatur) |

Meine Empfehlung ist **(a)**: sie erhält die Aussage vollständig, kostet keine
neue Infrastruktur und ist eine Zeile Lade-Zeitpunkt. **(b)** würde ich nicht
nehmen — sie sieht nach einer Kürzung aus und ist in Wahrheit eine stille
Änderung dessen, was die Zahl bedeutet.

## 24.7 Umgesetzt

Drei Maßnahmen, jede einzeln rücknehmbar. Der CAPE-Posten aus §24.2 ist
**nicht** angefasst.

### (1) Gerechnete Lauf-Zeitstempel · `src/sources/radolan.ts`

`guessRvRuns(count, nowMs)` liefert die jüngsten plausiblen Zeitstempel als
reine Rechnung. Der Rat setzt beim frühestmöglichen Slot an
(`RV_PUBLISH_LAG_MIN = 3.3`, der gemessene Minimalverzug), trifft damit in
~97 % sofort und lässt sich sonst durch einen 404 korrigieren — die Richtung,
die keinen stillen Rückstand erzeugt.

Die Kandidatenkette in `fetchRvNowcast` ist jetzt dreistufig und benennt jede
Stufe: **bekannter Lauf** (Modul-Cache, 60 s) → **drei gerechnete Kandidaten** →
**das Verzeichnis-Listing**. Die dritte Stufe ist der benannte Fallback aus
„Rule 2": ändert der DWD Takt oder Namensschema, funktioniert die Seite weiter,
nur wieder mit 154 KB. `fetchRvAnalysisSequence` (Rückblick-Archiv, auch von
`ml/radarHindcast.ts` benutzt) rechnet ebenso und fällt ebenso zurück.

Nebenbei behoben: ein Lauf aus dem Modul-Cache, der inzwischen 404 liefert,
führte bisher direkt in den Fehler; jetzt fällt er auf die gerechneten
Kandidaten durch.

### (2) Rückblick-Archiv auf Abruf · `src/nowcast/NowcastRadarMap.tsx`

`seedDePastArchive` startet nicht mehr beim Öffnen, sondern beim ersten Griff in
die Vergangenheit: **Abspielen**, **Rückwärts-Schritt** oder **Scrubben an den
Anfang**. Der Lade-Effekt hinterlegt die Nachlade-Funktion in einem Ref, die
Bedienelemente rufen sie — bewusst ein Ref und keine Dependency, damit der
Auslöser die Abspielschleife nicht neu aufsetzt.

Die StrictMode-Festigkeit der alten Lösung bleibt erhalten und ist im Code
begründet: `seededLocRef` wird weiterhin erst **nach** Erfolg gesetzt, das
`started`-Flag lebt je Effektlauf (Mount 2 bringt seine eigene Closure mit), und
ein Fehlschlag setzt es zurück, bleibt also wiederholbar.

Der Session-Past-Cache wächst unabhängig davon mit jedem 5-Minuten-Refresh
weiter — wer die Seite offen lässt, bekommt Vergangenheit auch ohne Klick.

### (3) Entdopplung · `src/sources/shareInFlight.ts` (neu)

Eine Stelle für alle drei Länder. `fetchRvNowcast`, `fetchIncaGrid` und
`fetchRzcLatest` führen ihren Lauf je Schlüssel nur einmal gleichzeitig aus.

Der Punkt, an dem so etwas im Projekt schon zweimal schiefgegangen ist, steht im
Modulkopf: **der laufende Abruf hängt an KEINEM Aufrufer-Signal.** Bräche der
erste Aufrufer ab, wäre der zweite sonst mit vergiftet — dieselbe Falle wie der
Brandflächen-Ladecache (Gate GBP1, Lehre 3) und der Meteostat-Stations-Cache
(BH4). Jeder Aufrufer bekommt stattdessen sein eigenes Abbruch-Versprechen auf
denselben Lauf, geprüft in `verify:radar-runs`.

Der Preis ist ausgesprochen, nicht versteckt: ein Abbruch beendet den Download
nicht mehr, er läuft zu Ende und landet im Cache. Das kostet im Ausnahmefall
einmal die Restbytes und spart im Regelfall jede Sitzung den zweiten Abruf.

Es ist eine **Entdopplung, kein Cache**: der Eintrag verschwindet mit dem
Abschluss, auch nach einem Fehler.

## 24.8 Nachgemessen

Gleiche Methode, eigener Port für die neue Konfiguration (5211 gegen 5210).

| Land | vorher | nachher | Δ |
|---|---:|---:|---:|
| DE | 16,576 MiB | **12,173 MiB** | −4,40 MiB |
| AT | 2,101 MiB | **1,413 MiB** | −0,688 MiB (−32,7 %) |
| CH | 2,290 MiB | **2,137 MiB** | −0,153 MiB (−6,7 %) |

**Die DE-Zeile darf man nicht ganz dieser Phase gutschreiben.** Zwischen den
beiden Läufen ist der ICON-D2-Lauf gewechselt, und `cape_ml` fiel dabei von
12 645 591 auf 11 115 509 B — 1,53 MiB, die niemand verursacht hat. Ehrlich
zugeordnet wird deshalb nur der RADOLAN-Anteil:

| DE, nur RADOLAN | vorher | nachher |
|---|---:|---:|
| Verzeichnis-Listings | 3 × 157 700 B | **0** |
| RV-Tars | 10 (davon 1 doppelt) = 3 058 351 B | **1 = 356 287 B** |
| **Summe** | **3 531 451 B** | **356 287 B** |

**−3,03 MiB, −89,9 %, und 13 Requests werden zu einem.** Die gesamte Gruppe
`/_dwd_opendata` fällt von 3 534 406 B auf 396 700 B; was übrig bleibt, ist das
eine RV-Tar, `uvi.json` und zwei ICON-D2-Verzeichnis-Scans für `cape_ml` (das
Feld steht nicht im Manifest, s. `iconD2Precip.ts`).

Mobil (390 × 844, DPR 3) identisch: 1 Tar, 0 Listings, 403 211 B in der Gruppe.

## 24.9 Gate GBW5

| Frage | Antwort | Beleg |
|---|---|---|
| 1 Funktionserhalt einzeln | **ja** — Karte, Layer (Niederschlag/Zellen/Blitze/Schneegrenze), Zeitachse, Ereignisse, Kennzahlen unverändert. Der Rückblick ist vollständig da, sobald er angefragt wird: „Abspielen" ⇒ 1 → 8 RV-Tars, 2 423 314 B, **0 Listings**, „JETZT" wandert nach rechts, links davon der gemessene Abschnitt | `bw5-desktop-1440-regenradar-de.png`, `bw5-desktop-1440-rueckblick-nach-play.png` |
| 2 Desktop pixelgleich | **nein, und zwar beabsichtigt** — beim Öffnen fehlt der Vergangenheits-Abschnitt der Zeitachse, bis er angefragt wird. Genau die Verhaltensänderung, die der Plan als „vom Eigentümer entschieden" führt. Sonst kein Pixel anders | beide Screenshots gegeneinander |
| 3 Touch-Targets ≥ 44 px | **ja** — keine neuen Bedienelemente; die vorhandenen sind unverändert | `bw5-mobile-390-regenradar-de.png` |
| 4 Konsole sauber | **ja** — DE (5211) null Meldungen. CH zeigt 10 Glyph-404s der Basiskarte (`openfreemap`, Schriftname `Open Sans Regular,Arial Unicode MS Regular`); **am alten Build auf Port 5210 wortgleich dieselben 10** ⇒ vorbestehend, nicht aus BW-5 | Gegenprobe 5210 |
| 5 keine Long Tasks > 200 ms | **ja** — `PerformanceObserver('longtask')` über 35 s Kaltstart mobil: keine einzige | Messung §24.8 |

**Prüfläufe:** `typecheck` grün · `budget` grün (`totalJs` 972,1/1017,7 KB, von
975,7 KB gefallen) · `verify:radar-runs` **22/22** (neu) ·
`verify:radar-sampling` 25/25 · `verify:precip-source` 30/30 ·
`verify:datenalter` 54/54 · `src/radar/_verify.ts` **67/67**.

**Ein vorbestehender Fehlschlag dabei gefunden und behoben** —
`src/radar/_verify.ts` stand vor dieser Phase auf 66/67: die Sonde
`add('Presets vorhanden', RADAR_PRESETS.length >= 4)` verlangte vier Presets, seit
einem Rückbau gibt es drei (`standard`, `storm`, `winter`). Genau die Familie
**V-BW-19**: eine eingefrorene Zahl meldet einen planmäßigen Schritt als Fehler.
Geprüft wird jetzt die Absicht — es gibt Presets, jedes hat eindeutige id, Label
und ein nicht leeres Layer-Set. → **V-BW-25**.

## 24.10 Was offen bleibt

- **V-BW-22 — `cape_ml`, 12,65 MiB für eine Zahl** (§24.2/§24.6). Der mit Abstand
  größte Posten der DE-Radarseite, drei Wege beschrieben, Empfehlung (a).
  **Jans Entscheidung** — er ändert eine angezeigte Aussage.
- **V-BW-23 — CH lädt 81 Stations-CSVs einzeln** (`ogd-smn_<stn>_t_now.csv`),
  nachgemessen **861 862 B** plus 151 KB Stationsverzeichnis: **40 % der
  CH-Sitzung** und 8 Sekunden.
- **V-BW-24 — `maps.dwd.de/geoserver/dwd/wms` viermal mit identischer URL**
  (je 5 622 B). Dieselbe Ursache wie §24.3, aber eine andere Stelle.
- **V-BW-25 — Verifier-Sonden auf eingefrorenen Zahlen.** Zwei Fälle in zwei
  Phasen (`verify:routing` SW-Version in BW-4, `RADAR_PRESETS` hier). Es lohnt
  ein Durchgang durch die übrigen Harnische mit derselben Frage.
- Die Quick Wins **Q4** (`GRIB_CACHE_MAX` 140 → 400) und **Q5** (`/_dwd_*` aus dem
  SW-Datencache) sind unverändert offen und unabhängig.
