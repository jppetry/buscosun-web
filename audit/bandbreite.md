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
| **V-BW-26** | **Zwei Funktionen für dieselben Ecken** (`gribCorners` vs `subsampledCorners(f, 1)`) liefern Gleitkomma-verschiedene Werte (Δ ~1e-15°) | kein Ortsfehler, aber ein „bit-gleich"-Beweis kippt daran (§25.11) | wo Ecken für einen Leser geschrieben werden, die Funktion DES LESERS nehmen — so gemacht für `precip` |
| **V-BW-27** | **Producer-Laufzeit 6,4 min je Lauf** mit pure-JS-bz2 (165 MiB Download) | unter dem 30-min-Timeout, aber Dreifaches von BW-2 | `bzip2`-Binary auf `ubuntu-latest` (Plan-Option), erst messen |
| **V-BW-28** | Der Niederschlag-PNG-Weg kennt die Rate des ERSTEN Fensterschritts, der GRIB-Pfad nicht (er ist dort nur Referenz) | eine Stunde mehr Deckung möglich | bewusst nicht genutzt (gleiche Frames = Funktionserhalt); als Entscheidung offen |
| **V-BW-29** | **RADOLAN-RV nach jsDelivr** wäre ein 5-Minuten-Batch: 288 Force-Pushes und 288 Manifest-Commits/Netlify-Builds je Tag, Actions-`schedule` unpünktlich, Verzug 5–10 min statt 3,3 (§26.3) | spart 0,36 MiB je DE-Sitzung — kleinster Posten gegen größte Betriebsänderung | **nicht bauen**; bei Bedarf Edge-Proxy an einen anderen Ort, nicht ein 5-Minuten-Batch. Jans Entscheidung |

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

---

# 25. BW-6 — alle Wetterkarten-Layer ohne Netlify-Traffic (Diagnose, 2026-08-24)

**Auftrag (Jan, 2026-08-24):** „alle Wetterlayer der Wetterkarte so gestalten, dass sie keinen
Netlify-Traffic erzeugen, genauso wie wir es für Wind und Temperatur gemacht haben." Das hebt
Plan-Entscheidung 2 („Repack-Umfang nur Wind + Temperatur") auf. Diese Diagnose steht **vor**
der ersten Zeile Code (Diagnose-First) und beantwortet drei Fragen: Was zieht die Karte heute
über Netlify? Was davon lässt sich mit dem BW-1…BW-4-Muster verlustfrei umpacken? Was bleibt —
und warum?

## 25.1 Inventar — alle 19 Layer-Keys, am Code geprüft

`src/map/layerTypes.ts:33-36` führt 19 Keys. Je Layer: Transportweg, Quelle, und die
entscheidende Spalte — **wie das Feld zur Textur wird**. Denn das Repack-Muster funktioniert nur,
weil der Client die Daten heute schon selbst auf 608 × 373 × 8 bit reduziert; der Producer macht
diesen Schritt einmal statt je Browser. Wo der Client Float behält, wäre ein PNG eine
Formatentscheidung mit Verlust — das ist ein anderes Vorhaben.

| Layer | Weg | Quelle / Felder | Feld → Textur | Netlify? | Befund |
|---|---|---|---|---|---|
| `wind` | jsDelivr (BW-3) · Fallback `/_dwd_wind` | `u_10m`,`v_10m`, 13 Schritte | `buildWindRgba` 608×373 RGB, Norm je Frame | **nein** (seit BW-4) | erledigt |
| `temp` | jsDelivr (BW-3) · Fallback `/_dwd_grib` | `t_2m` + `hsurf`, 25 | `buildTempRgba` Grau+Alpha + G = hsurf | **nein** | erledigt |
| `wind` **Druckfläche** 850/700/500 hPa | **`/_dwd_opendata`** (ungecacht, `iconEuPressureWind.ts:27`) | ICON-EU `U`,`V` je Level, 13 Schritte | derselbe Windbau, ICON-EU-Gitter 1377×657 | **ja — 26 × 1,10 MB = 28,6 MB je Umschaltung** (HEAD gemessen: 1 099 828 B) | **A2** eigene Familie je Level |
| `gust` | `/_dwd_grib` | `vmax_10m`, 25 | `buildGustImage` (`iconD2GustSource.ts:55`) 608×373, R = m/s ÷ 40, A = Maske | ja | **A1** 1:1 wie Temperatur |
| `thunder` | `/_dwd_grib` | `cape_ml`+`cin_ml`+`lpi`, 13 | `buildThunderImage` (`iconD2Thunder.ts:75`): `thunderScore` auf Float **vor** der Quantisierung, dann R = Score/100 | ja — **3 GRIB je Schritt, 2,7–3,2 MB** | **A1** — 3 GRIB → 1 PNG |
| `rotation` | `/_dwd_grib` | `uh_max`+`uh_max_low`+`sdi_2`, 12 | `buildRotationImage` (`iconD2Rotation.ts:83`): `rotationScore` → `smoothScores` → R | ja — 3 GRIB, 1,8–2,3 MB | **A1** — 3 GRIB → 1 PNG |
| `snow` | `/_dwd_grib` | Decke `h_snow` · Neuschnee `snow_gsp`+`snow_con`+`rho_snow`, 25 | `buildDepthImage`/`buildFreshImage` (`iconD2Snow.ts:85/118`): `freshSnowCmFromSwe` → R | ja (GRIB winzig, 4–23 KB) | **A1**, zwei Unterfamilien |
| `lightningfc` | `/_dwd_grib` | `lpi_max`, 1…12 | `buildLpiImage` (`iconD2Lpi.ts:84`): R = J/kg ÷ 30 | ja (9–32 KB) | **A1** |
| `nowcast` (Niederschlag-Toggle) | Radar DE `/_dwd_opendata` (BW-5) · AT/CH direkt · **plus** `/_dwd_grib` | Radar **und** ICON-D2 `tot_prec` 0…27 (`installIconD2`, `MapView.tsx:2388`, `:4324`) als Lückenfüller jenseits des Radarhorizonts (`precipComposite.ts:202-215`) | `decodeGridStep` (`gribGridDecode.ts:43`): **volle 1215×746**, deakkumuliert gegen den Vorschritt, `precipToU8` (mm/h ÷ 20) → `Uint8Array`, kein Canvas | ja — `tot_prec` 0,25–1,6 MB je Schritt | **A1**, aber volle Auflösung und Grau **ohne** Alpha (0 = transparent, `RainLayer.ts:318`) |
| `clouds` | `/_dwd_grib` (nicht gewärmt) | `clcl`,`clcm`,`clch`, 13 | `packCloudRGBA` (`iconD2Clouds.ts:72`) **volle 1215×746 RGBA**, CPU-Lerp auf dem Rohpuffer | ja, **aber im Dock auskommentiert** (`MapView.tsx` DECK_GROUPS) | **C** nicht erreichbar → nicht jetzt |
| `confidence` | `/_dwd_grib` (Lauf-Spread `t_2m`) + `/climaGrid.json` | vorheriger Lauf `t_2m` %6 | liest die 8-bit-Temp-Leinwand zurück | ja, **Dock auskommentiert** | **C** |
| `snowline` | abgeleitet | Temp-Leinwand + DEM | Marching Squares | nein (Ableitung) | — |
| `flownowcast` / `poprob` | RADOLAN (BW-5) | — | Optical Flow auf RV-Frames | RADOLAN bleibt (D-14, §24) | **B** |
| `sat` / `lightning` | `maps.dwd.de/geoserver` WMS direkt | — | MapLibre-Raster | **nein** (nie) | — |
| `hail` | CH STAC direkt · DE Konrad3D `/_dwd_opendata` | XML/Polygone, klein | GeoJSON + Palettenraster | ja, klein (kein ICON) | **B** |
| `cells` | Konrad3D `/_dwd_opendata` | XML, klein | GeoJSON | ja, klein | **B** |
| `warnings` | DE CAP-Zip `/_dwd_opendata` · CH `/_meteoalarm` | amtliche Warnungen | GeoJSON | ja | **B — Lizenz:** `docs/API.md` §7, kein Durable-Cache; außerdem amtliches Produkt (Zitatregel) |
| `stations` | `api.brightsky.dev` direkt | — | GeoJSON | nein | — |
| Basiskarte · DEM | openfreemap · S3 Terrarium | — | — | nein | — |
| Modell-Umschalter (EPS/GFS/IFS/AROME/ICON-CH) | `/_dwd_grib` (EPS) · `/_gfs` · `/_ecmwf` · `/_mf` · `/_cscs` | 5 Var × 3 Schritte EPS ≈ 240 MB dekomprimiert | **Float**, 14×9-Gitter, Fusion-Engine | ja, nur bei ausdrücklicher Wahl | **C — Fusion-Engine = STOPP & FRAGEN**, kein 8-bit-Konsument |

**A** = umpackbar mit dem bestehenden Muster · **B** = bleibt auf Netlify aus Sachgrund ·
**C** = nicht Teil dieser Linie (nicht erreichbar bzw. Float-Konsument).

Hinweise, damit spätere Leser nicht suchen: `docs/LAYER_SYSTEM.md` nennt 16 Keys — es fehlen
`cells`, `hail`, `warnings`. Und der Niederschlag-Toggle der Wetterkarte ist **nicht**
ICON-D2-frei (der Plan-Fallstrick hat sich bestätigt): `active.has('nowcast')` startet
`installIconD2` und zieht bis zu 28 `tot_prec`-Schritte über `/_dwd_grib`.

## 25.2 Der Befund, der die Linie trägt: kein Konsument braucht mehr als 8 bit

Die Frage „verliert ein PNG Präzision?" ist am Code beantwortet, nicht angenommen. Jede
Punktabfrage der Wetterkarte liest heute **dieselbe 8-bit-Leinwand**, die der Shader abtastet:

| Konsument | liest | Datei |
|---|---|---|
| Stadt-Labels | Temp-Leinwand R/G/A bilinear, Lapse-Korrektur nachgerechnet | `temperatureLabels.ts:353-383` |
| Windpfeile/Klick | Wind-Leinwand bilinear | `wind/windPointSample.ts:66` |
| Schneegrenze | Temp- + DEM-Leinwand | `scalar/snowLine.ts:82-96` |
| Vertrauens-Schleier | Temp-Leinwand per `getImageData` | `confidenceImage.ts:107-121` |
| QA-Sampler | Böen/Temp/Wolken-Leinwand | `qa/layerSampler.ts` |
| Niederschlag-Komposit | `IconD2Precip.values` = `Uint8Array` | `precipComposite.ts:215` |

Kein Layer auf der Karte trägt ein Float-Feld über den Bau hinaus. Der Repack ändert also
**nirgends** einen angezeigten oder abgefragten Wert — genau die Eigenschaft, die `verify:repack`
für Wind und Temperatur byte-genau beweist, und die für jede neue Familie ebenso bewiesen wird.

Die einzige echte Ausnahme ist die Fusion (EPS-Familie, 14×9-Float-Gitter) — sie ist kein
Kartenlayer, sondern der Modell-Umschalter, und ihre Änderung fällt unter STOPP & FRAGEN.

## 25.3 Gemessen, bevor gebaut wird: PNG-Größen je Familie

Sonde `scripts/l0/probe-bw6-repack-sizes.mjs`, Lauf **2026082418**, dieselben Module wie der
Client (`thunderScore`, `rotationScore`+`smoothScores`, `freshSnowCmFromSwe`, `decodeGridStep`),
Encoder `scripts/lib/png.mjs`:

| Familie | Schritt | GRIB (bz2) | PNG | Faktor |
|---|---:|---:|---:|---:|
| `gust` (Grau+Alpha 608×373) | 0 / 12 / 24 | 26 / 1 096 / 1 079 KB | 8 / 130 / 120 KB | **8,5×** |
| `thunder` (3 Felder → 1 Score) | 0 / 6 / 12 | 3 206 / 2 781 / 2 731 KB | 34 / 20 / 16 KB | **94–170×** |
| `rotation` (3 Felder → 1 Score, geglättet) | 1 / 6 / 12 | 1 808 / 2 058 / 2 274 KB | 32 / 25 / 25 KB | **56–90×** |
| `precipD2` (`tot_prec`, **volle** 1215×746, Grau) | 1 / 6 / 12 / 24 | 410 / 708 / 1 115 / 1 546 KB | 35 / 60 / 85 / 129 KB | **12–13×** |
| `lightningfc` | 1 / 6 / 12 | 32 / 12 / 9 KB | 9 / 4 / 3 KB | 3× |
| `snowDepth` | 0 / 12 / 24 | 4 KB | 3 KB | ~1× |
| `snowFresh` (3 Felder) | 1 / 12 / 24 | 20–23 KB | 2 KB | 10× |

Zwei Lesarten: Bei **Gewitter und Rotation** ist der Repack nicht nur Transport, sondern
beseitigt zwei Drittel der Abrufe — drei Felder werden zu einem Bild, und das Bild ist
zwei Größenordnungen kleiner als **eines** der drei GRIBs. Bei **Schnee und Blitzprognose**
spart der Repack keine nennenswerten Bytes (die GRIBs sind selbst nur Kilobytes) — hier geht es
nur um „nicht mehr über Netlify". Das ist der Auftrag, also gehören sie dazu, aber sie
rechtfertigen keinen eigenen Aufwand jenseits der Familie.

**Mengengerüst je Lauf** (Schrittzahlen aus dem Code, Größen aus der Tabelle, Median):

| Familie | Schritte | ≈ je Lauf |
|---|---:|---:|
| `gust` | 25 | 3,0 MB |
| `precipD2` | 28 | 2,0 MB |
| `thunder` | 13 | 0,3 MB |
| `rotation` | 12 | 0,3 MB |
| `lightningfc` | 12 | 0,05 MB |
| `snowDepth` + `snowFresh` | 25 + 24 | 0,12 MB |
| **neu zusammen** | **139 Bilder** | **≈ 5,8 MB** |
| bisher (`wind` + `temp` + `hsurf`) | 38 | 5,41 MB |
| **je Lauf gesamt** | **177** | **≈ 11,2 MB** |

Bei 4 Läufen Retention ≈ 45 MB im Daten-Repo (jsDelivr: 20 MB **je Datei**, die größte Datei
hier ist 130 KB; ob jsDelivr zusätzlich eine Repo-Größe deckelt, ist **am Gate nachzusehen**, nicht
anzunehmen). Download je Producer-Lauf steigt von 49,9 MB auf ≈ **135 MB** GRIB (Böen 25 × 1,1,
Gewitter 13 × 2,9, Rotation 12 × 2,0, `tot_prec` 28 × 1,1); mit dem pure-JS-bz2 (~1,5 s je Datei,
§20) sind das **≈ 6–7 min je Lauf** statt 2 — unter dem 30-min-Timeout des Workflows, aber die
im Plan genannte `bzip2`-Binary-Option wird damit relevant (**V-BW-27**).

**ICON-EU-Druckflächen-Wind (A2)** ist nicht mitgemessen — der Bau ist derselbe wie Surface-Wind
(`buildWindRgba`), also ≈ 250 KB je Schritt, **3 Level × 13 Schritte ≈ 10 MB je Lauf**. Das
verdoppelt das Mengengerüst fast; ICON-EU hat ein eigenes Gitter (1377×657 → `ss = 2` → 689×329)
und einen eigenen Lauf-Rhythmus, also eigene Discovery. Dafür ist es der **größte** Netlify-Posten
der Karte, sobald ein Nutzer ein Level wählt: 28,6 MB, ungecacht (`/_dwd_opendata`, kein Edge-Cache).

## 25.4 Vier fachliche Fallen (am Code gefunden, bevor sie zuschlagen)

1. **Der Grünkanal.** Alle neuen Familien sind Ein-Kanal (Grau+Alpha wie `temp`). Der Browser
   expandiert Grau auf R = G = B — bei `temp` musste `composeTempRgba` deshalb G durch `hsurf`
   ersetzen (§22.2). Für die neuen Familien ist das **unschädlich**: nur `tempLayer` hat
   `demRefine` (`MapView.tsx:1514`), alle anderen `ScalarLayer` (`:1519-1596`) lesen ausschließlich
   R und A. Trotzdem wird es im Verifier festgehalten, damit ein späteres `demRefine` an einem
   anderen Layer nicht still die Bezugshöhe aus dem Wert liest.
2. **Nebenfelder dürfen im Client fehlen.** `thunder`, `rotation` und `snowFresh` behandeln ein
   fehlendes Nebenfeld als 0 (`.catch(() => null)`, Grid-Mismatch → 0). Ein Producer, der dasselbe
   täte, legte ein Bild ab, das **anders aussieht als der Client mit vollständigen Feldern** — und
   niemand sähe es. Regel: der Producer packt einen Schritt nur mit **allen** Feldern, sonst
   `missing`; der Client fällt für diesen Schritt auf GRIB zurück und verhält sich wie heute.
3. **`tot_prec` ist sequenziell.** Die Deakkumulation braucht den Vorschritt (`decodeGridStep`,
   `refRawValues`); die Reihenfolge 0…27 ist im Producer trivial, aber ein **einzelner fehlender
   Schritt** macht alle folgenden falsch (Differenz gegen den falschen Vorschritt). Regel: ab dem
   ersten fehlenden Schritt keine weiteren packen. Außerdem hat die Familie **kein Alpha** —
   `precipToU8` kodiert „transparent" als 0 und die Domänenmaske nicht (der Kompositor liest die
   Index-Map, nicht die Maske); ein Grau-PNG ohne Alpha ist byte-gleich zum heutigen `Uint8Array`.
4. **Die Score-Module tragen Dev-Selbsttests** (`if (typeof window !== 'undefined' && import.meta.env.DEV)`,
   `thunderPotential.ts:169`, `rotationPotential.ts:198`, `alpineSplit.ts:166`) — sie sind schon
   Node-sicher (Sonde lief). Die Dev-Diagnosen in `buildThunderImage`/`buildRotationImage`
   (`import.meta.env.DEV && !cinSignLogged`) sind es **nicht** und bleiben im Client-Modul; das
   geteilte DOM-freie Modul bekommt nur die Schleife.

## 25.5 Was auf Netlify bleibt — Sachgrund je Posten

| Bleibt | Grund |
|---|---|
| RADOLAN-RV (`nowcast`, `flownowcast`, `poprob`) | Radar, kein ICON-D2; seit BW-5 −89,9 % (§24). Ein Repack von 5-Minuten-Messdaten wäre eine eigene Linie mit eigener Latenzfrage |
| Amtliche Warnungen (`warnings`) | Lizenz (`docs/API.md` §7): kein Durable-Cache, Datenalter sichtbar — ein CDN am Commit-SHA wäre genau das verbotene Durable-Caching |
| Konrad3D (`cells`, `hail` DE) | Radar-Zellprodukt, 5-Minuten-Takt, Kilobytes |
| App-Shell | 0,53 MiB gz, danach gecacht |
| Modell-Umschalter (EPS/GFS/IFS/AROME/ICON-CH) | Float-Konsument (Fusion), opt-in, STOPP & FRAGEN |
| `cape_ml` auf `/regenradar` (V-BW-22) | nicht die Wetterkarte — **aber** eine `cape`-Familie (4 Schritte, volle Auflösung, `capeToU8`) wäre mit demselben Producer ≈ 4 × ~100 KB statt 12,65 MB. Weg (d) zu §24.6, Jans Entscheidung |

Und was Netlify **nie** berührt hat: Basiskarte, DEM, Satellit/Blitze (WMS), Stationen, AT/CH-Radar.

## 25.6 Plan BW-6 — Phasen, Gate, Rücknahme

Das Muster ist BW-1…BW-4, je Familie. Was sich gegenüber BW-2 **strukturell** ändert: Producer,
`index.json`, Manifest-Abschnitt und Workflow kennen heute genau zwei Familien (`wind`/`temp`
hart in `indexEntry`, `sectionFor`, `findLatestRun`, `skipDecision`, im Workflow-Schritt „have").
Das wird eine **Familienliste** — eine Stelle, aus der alles andere folgt.

| Phase | Inhalt | Gate |
|---|---|---|
| **BW-6a** Geteilte Bauschleifen | je Familie ein DOM-freies `build*Rgba` (Muster `tempFrameBuild.ts`): `scalarFrameBuild.ts` mit `gust`/`lpi`/`snowDepth`/`snowFresh`/`thunder`/`rotation` (alle „R + Maske"), `precipD2` = `decodeGridStep` (existiert schon DOM-frei). Client-Module rufen sie; Bild bleibt Canvas | `typecheck`, Karte pixelgleich (die Schleife ist dieselbe) |
| **BW-6b** Producer + Ablage | Familienliste in `repack-icon-d2.mjs`, `repackManifest.mjs` (`indexEntry`/`sectionFor` generisch), `publish-repack.mjs` unverändert, Workflow-Schritt „have" generisch; Regel 2 + 3 aus §25.4; `hsurf` bleibt Wurzel | `verify:repack` erweitert: **Byte-Identität je neuer Familie** über ≥ 3 Läufe |
| **BW-6c** Client | je Loader `resolveRepackForRun(runStr, family)` + `load*Step` in `repackSource.ts` (Grau+Alpha → RGBA, Maße gegen `grid`, Fristen und Sitzungsgedächtnis **geteilt**), GRIB als benannter Fallback je Schritt; `precipD2` liefert `Uint8Array` statt Canvas | Karte pixelgleich je Layer (Screenshot-Diff), Fallback belegt, Konsole sauber, keine Long Tasks |
| **BW-6d** Nachmessen | je Layer Kaltsitzung vorher/nachher nach Origin, Desktop + Mobil | Tabelle wie §23.2 |
| **BW-6e** ICON-EU-Druckflächen (A2) | eigene Discovery (ICON-EU-Lauf), Familien `wind850/700/500`, sonst wie Wind | eigenes Gate; **Jans Wahl**, ob dabei (+10 MB je Lauf) |

**Manifest:** `latest-grib.json` trägt heute `repack` = **ein** Abschnitt mit `temp`. Die neuen
Familien kommen als weitere Schlüssel **in denselben Abschnitt** (`repack.gust`, `repack.thunder`, …),
weil sie am selben Lauf und demselben Commit hängen; `parseRepackSection(raw, family, run)` liest
heute schon nur die angeforderte Familie. Der Cron-Code ändert sich damit in **einer** Zeile
(`pickForRun(…, 'temp')` → alle Familien des GRIB-Manifests). Das berührt die Warm-Crons — sie
sind ohnehin uncommitted, und der Prod-Dispatch bleibt Jans Gate (§23.6). **Annahme, unter der
gebaut wird:** die Erweiterung des additiven Abschnitts ist vom Auftrag gedeckt; ein neuer
Mechanismus wird nicht eingeführt.

**Rücknahme:** jede Familie ist einzeln abschaltbar — fehlt ihr Schlüssel im Abschnitt, nimmt der
Loader GRIB („kein Abschnitt" als Normalfall, §22.4). `?repack=0` schaltet weiter alles.

## 25.7 Entscheidungen — mit Default, unter dem gebaut wird

| # | Frage | Default |
|---|---|---|
| E1 | Dock-verborgene Layer `clouds`/`confidence` mitpacken? | **Nein.** Nicht erreichbar, `clouds` wäre eine Auflösungsentscheidung (volle 1215×746 RGBA). Bleibt GRIB, kein Funktionsverlust |
| E2 | ICON-EU-Druckflächen (BW-6e)? | **Ja, als letzte Phase** — größter Posten (28,6 MB ungecacht), aber eigene Discovery und +10 MB je Lauf |
| E3 | `cape`-Familie für `/regenradar` (V-BW-22, Weg d)? | **offen** — nicht Wetterkarte; wird hier nur vorbereitet, wenn Jan es sagt |
| E4 | `bzip2`-Binary im Workflow statt pure-JS (V-BW-27)? | **erst messen** (BW-6b protokolliert die Laufzeit), dann entscheiden |
| E5 | Retention 4 Läufe bei 11 MB je Lauf? | **unverändert** — 45 MB, Force-Push-Historie wächst nicht |

## 25.8 Risiken

| Risiko | Umgang |
|---|---|
| Producer-Laufzeit × 3 (135 MB Download, pure-JS-bz2) | gemessen in BW-6b; `timeout-minutes: 30` hat Luft; V-BW-27 als Ausweg |
| Ein Bild sieht anders aus als der Client-Bau (Nebenfeld fehlt, Vorschritt fehlt) | Regeln 2 + 3 in §25.4, im Verifier als Ablehnungsfall |
| Familienliste driftet zwischen Producer, Manifest, Client, Verifier | **eine** Liste (`scripts/lib/repackManifest.mjs` exportiert sie, `repackSource.ts` spiegelt sie typisiert — der Verifier prüft Gleichheit) |
| `precipD2` mit 28 Schritten × 6-s-Frist = bis 168 s worst case im Fallback | Fristen greifen je Datei nur bei CDN-Hänger; ein Fehlschlag gilt für die Sitzung (§22.3) |
| Daten-Repo 45 MB, jsDelivr-Grenzen | am Gate nachsehen, nicht annehmen (§25.3) |

## 25.9 Umgesetzt (2026-08-24, BW-6a–6c)

**BW-6a — geteilte Bauschleifen.** `src/sources/scalarFrameBuild.ts` (neu): `buildGustRgba`,
`buildLpiRgba`, `buildSnowDepthRgba`, `buildSnowFreshRgba`, `buildThunderRgba`, `buildRotationRgba`
plus die Skalen-Konstanten (aus den fünf Client-Modulen dorthin gezogen, dort re-exportiert). Die
Client-Module (`iconD2GustSource/Lpi/Snow/Thunder/Rotation.ts`) bauen ihr Canvas nur noch per
`putImageData` aus diesem Ergebnis; die Dev-Diagnosen (`import.meta.env.DEV`) bleiben im Client.
**Beweis** `scripts/l0/probe-bw6a-equality.mjs` gegen die HEAD-Fassungen (`scripts/l0/bw6-old/`,
`document`-Shim): **27/27 byte-gleich** an echten Feldern des Laufs 2026082418, auch „ohne Nebenfelder".

**BW-6b — Producer, Ablage, Manifest.** EINE Familienliste `FAMILIES` in
`scripts/lib/repackManifest.mjs` (`manifest`, `file`, `channels`, `params`, `minStep`/`maxStep`,
`fullRes`, `sequential`); `indexEntry`/`sectionFor`/`pickForRun`/`sameSection` generisch,
`GRIB_FAMILIES` = alle außer Wind. `scripts/repack-icon-d2.mjs`: `familySteps` (Schnitt über alle
Felder der Familie, gedeckelte Listing-Parallelität mit Wiederholung — 15 gleichzeitige Listings
liefen in `UND_ERR_CONNECT_TIMEOUT`), `repackScalarStep` (ALLE Felder oder `missing`),
`repackPrecipStep` (sequenziell, `ref` je Schritt, Gitter aus `precipGridOf` = `gribCorners`),
`skipDecision` über `{ familie: schrittzahl }`, ENV `REPACK_HAVE_STEPS` (JSON) neben den zwei
Alt-Variablen. `scripts/warm-grib.mjs`: **eine Zeile** — `pickForRun(…, GRIB_FAMILIES)`; die
neuen Familien liegen als weitere Schlüssel im **selben** `repack`-Abschnitt von `latest-grib.json`.
Workflow-Vorlage `scripts/repack-repo/workflow-build.yml`: `steps=<JSON>` **und** weiterhin
`wind=`/`temp=` — damit ein Producer-Stand vor BW-6b mit der neuen Datei noch aussteigt (sonst
stündlich Neurechnen + Manifest-Commit + Netlify-Build, V-BW-4-Muster). README des Daten-Repos ergänzt.

**BW-6c — Client.** `src/sources/repackSource.ts`: `REPACK_FAMILIES` (typisierter Spiegel, mit
Skala je Familie), `parseRepackSection` für alle Familien (Skalen- oder Kanal-Drift ⇒ **ablehnen**;
`precip`: eigenes Gitter `ss = 1`, `ref` Pflicht, `ref < step`), `composeScalarRgba` (G = B = 0 —
Browser-Expansion zurückgenommen, byte-gleich zum Builder), `loadScalarStep`, `loadPrecipStep`,
`precipStepsUsable`. Fünf Loader: `resolveRepackForRun(runStr, fam)` → ohne GRIB-Abruf für die
Geometrie, je Schritt PNG oder GRIB-Fallback. `iconD2Precip.ts`: `fetchPrecipRepack` **alles oder
nichts** (gemischt ginge nicht: der GRIB-Pfad braucht die Rohwerte des Vorschritts, die ein PNG
nicht hat) — jeder Fehlschlag ⇒ `null` ⇒ die Familie über GRIB wie bisher.

**Nicht angefasst:** `MapView.tsx`, `ScalarLayer`, `RainLayer`, Shader, Warm-Cron-Mechanik jenseits
der einen Zeile, `wind`/`temp`-Pfade, Fristen und Sitzungsgedächtnis (geteilt).

## 25.10 Gemessen

| | |
|---|---|
| Vollauf Producer, Lauf 2026082418, alle 9 Familien, 178 Bilder | **383,7 s** (6,4 min; zweiter Lauf aus dem Plattencache 290,7 s) |
| GRIB (bz2) → PNG | **165,14 MiB → 10,06 MiB, Faktor 16,4×** |
| Publisher-Baum, 4 Läufe (3 davon nur Wind/Temp) | 25,95 MiB |
| Bundle | totalJs **972,1 → 973,1 KB** gz (Grenze 1 017,7), eager 101,5 KB unverändert |
| `verify:repack` | **230/230** (vorher 106) — je neuer Familie über **drei** Läufe: Producer-Bytes == Builder, PNG → Browser-Bytes (`toRgba`) → `composeScalarRgba` == Builder, Gegenprobe „ungefiltert wäre NICHT gleich"; Niederschlag-Kette 0 → 1 → 2 mit `ref`, Gitter bit-gleich `gribCorners`, vier `precipStepsUsable`-Fälle; Familienliste Producer == Client; Caps aller Familien; Ablage/Abschnitt/Client-URLs je Familie; fünf Ablehnungsfälle |
| `verify:layer-geometry` 15/15 · `verify:warm-budget` 30/30 · `typecheck` grün | |
| Prod-Preview, sechs Layer gleichzeitig (Böen · Gewitter · Rotation · Blitzprognose · Schnee · Niederschlag), **GRIB-Fallback** (kein Abschnitt für die neuen Familien) | Karte rendert Desktop 1440 und iPhone 12 Pro; **63 `/_dwd_grib`-Abrufe, 31,9 MB in 25 s** — genau der Posten, den der Batch künftig wegnimmt; Konsole: zwei transiente HTTP 500 des Vite-Proxys gegen den DWD (Listing + ein `lpi_max`-Schritt des Laufs 12 UTC), vom Loader wie bisher übersprungen |

Screenshots: `audit/screenshots/bw6-desktop-1440-sechs-layer-grib-fallback.png`,
`bw6-mobile-390-sechs-layer-grib-fallback.png`.

**Was NICHT gemessen ist — und warum.** Der Browser-Beleg des **CDN-Wegs** (Bilder wirklich von
jsDelivr, Bytes je Origin vorher/nachher je Layer) braucht einen Baum im Daten-Repo, der die neuen
Familien führt. Der Push (`REPACK_OUT=data/repack-full node scripts/publish-repack.mjs --push`) wurde
vom Freigabe-Klassifizierer dieser Sitzung **blockiert**; ich habe ihn nicht umgangen. Ein lokaler
Ersatz scheitert an der `https://`-Pflicht des Abschnitts (bewusst, §22). Damit ist Gate GBW6
**offen an genau dieser einen Zeile** — alles davor (Bytes, Ablage, Client-Parser, Fallback) ist belegt.

## 25.11 Zwei Befunde nebenbei

1. **Der Prod-Kreis ist geschlossen** — seit heute 19:44 UTC tragen `buscosun.com/latest-grib.json`
   und `latest-wind.json` einen `repack`-Abschnitt (Lauf 2026082418, Commit `1e840bb`, Familien
   `temp` bzw. `wind`); das Daten-Repo führt vier Läufe, sein Workflow läuft stündlich (`schedule`,
   success 18:37 / 19:35 / 20:36 UTC), `origin/main` von buscosun-web trägt die Repack-Skripte.
   **Wind und Temperatur laufen in Produktion über jsDelivr.** §23.6 ist damit erledigt; meine
   Aussage vom Nachmittag („nichts davon wirksam") war bis 19:44 UTC richtig und ist es seither nicht mehr.
2. **`subsampledCorners(f, 1)` ≠ `gribCorners(f)` um Gleitkomma-Rauschen** (−3.9499999999999975 vs
   −3.95, max Δ ~1e-15°). Rechnerisch dasselbe, kein Ortsfehler — aber der Client soll aus dem
   Abschnitt **bit-gleiche** Ecken bekommen, deshalb nimmt die Niederschlag-Familie `gribCorners`
   (V-BW-26 im Katalog: an jeder Stelle, die Ecken zweimal rechnet, die Funktion des Lesers nehmen).

## 25.12 Gate GBW6 — Stand

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt je Layer | GRIB-Fallback aller sechs Layer im Prod-Preview (Screenshots), Bytes byte-gleich (27/27, 230/230) |
| 2 Desktop pixelgleich | **nicht als Diff belegt** — der CDN-Weg ist ohne Push nicht zu laden; die Bytes, die er liefert, sind byte-gleich bewiesen (230/230), also gibt es nichts, was anders aussehen könnte |
| 3 Touch-Targets | keine UI-Änderung |
| 4 Konsole sauber | ja bis auf zwei transiente 500 des Proxys (vorbestehend, Schritt wird übersprungen) |
| 5 Long Tasks | nicht neu gemessen — der neue Weg dekodiert PNG statt GRIB (BW-4: weniger, nicht mehr) |

**Nächster Schritt (Jans Hand, ein Befehl):** `REPACK_OUT=data/repack-full node scripts/publish-repack.mjs --push`,
dann `node scripts/l0/probe-bw6-manifest.mjs` (schreibt das Prod-Manifest mit dem Abschnitt nach `public/`,
`--restore` stellt es zurück) und die Messung wie §23.2 je Layer. **Für Produktion** reicht der Commit:
der stündliche Batch klont `buscosun-web` `main` und rechnet ab dann alle Familien; die Crons hängen
den Abschnitt an.

**Offen:** E2 ICON-EU-Druckflächen (BW-6e, eigene Discovery) · E3 `cape`-Familie (V-BW-22) · V-BW-27
`bzip2`-Binary (6,4 min je Lauf sind unter dem Timeout, aber dreifache Laufzeit) · die Alt-Ausgaben
`wind=`/`temp=` im Workflow können fallen, sobald `main` BW-6b trägt · V-BW-28: der PNG-Weg könnte
für den ersten Schritt des Niederschlag-Fensters ein Frame liefern, das der GRIB-Pfad nicht hat
(bewusst NICHT genutzt — Funktionserhalt heißt hier gleiche Frames).

---

# 26. BW-7 — Regenradar ohne Netlify-Traffic (2026-08-25)

**Auftrag (Jan):** „alle Layer des Regenradars so umsetzen, dass sie ohne Netlify-Traffic auskommen."

## 26.1 Was `/regenradar` über Netlify zieht (Stand nach BW-5/BW-6, §24.1/§24.2)

| Posten | Weg | je DE-Sitzung | Befund |
|---|---|---:|---|
| `cape_ml` für den Gewitter-Index (`fetchPeakCapeAtPoint`, 0…3 h) | `/_dwd_grib` | **12,65 MiB** (76 %) | **A** — Familie `cape` (BW-7a, umgesetzt) |
| RADOLAN-RV-Tar (Nowcast) | `/_dwd_opendata` | 0,36 MiB (seit BW-5) | **B** — 5-Minuten-Produkt, s. §26.3 |
| Rückblick-Archiv (nur auf Abruf, BW-5) | `/_dwd_opendata` | 0 bis 2,28 MiB | **B** |
| RADOLAN-RY latest | `/_dwd_opendata` | 15 KB | B |
| Amtliche Warnungen am Punkt (`fetchDwdAlerts`) | `/_dwd_opendata` | KB | bleibt — Lizenz (§25.5) |
| Konrad3D-Zellen | `/_dwd_opendata` | KB | bleibt — 5-Minuten-Radarprodukt |
| Schnee (DE, `fetchIconD2Snow`) | `/_dwd_grib` → jsDelivr | — | **erledigt mit BW-6** |
| App-Shell | — | 0,52 MiB | bleibt |
| AT INCA · CH rzc/STAC · CH Stations-CSV · `maps.dwd.de` WMS | direkt | — | nie Netlify |

Das Regenradar hat damit **einen** großen Posten, und der ist kein Radar: ein Modellfeld
für eine Zahl. Nach BW-7a bleiben je DE-Sitzung ≈ 0,36 MiB RADOLAN + Kilobytes.

## 26.2 BW-7a — Familie `cape` (umgesetzt)

Gemessen (Sonde `scripts/l0/probe-bw7-cape-sizes.mjs`, Lauf 2026082418): PNG **49–125 KB je
Schritt** (volle Auflösung 1215×746, `capeToU8`, 1 Kanal) gegen 2,0–3,2 MB GRIB — **≈ 2,4 MiB je
Lauf bei 28 Schritten**, Faktor ~27×. Schritte 0…27, weil `EventResult.tsx:1101` bis 27 anfragt
(das Regenradar nur 0…3); die Familie trägt beide.

Auf der BW-6-Mechanik ohne neue Regel: `FAMILIES.cape` (`fullRes`, `kind: 'cape'`, nicht
sequenziell — also **kein `ref`**), Producer `repackGridStep` (verallgemeinert aus
`repackPrecipStep`; `decodeGridStep(bytes, null, false, 'cape')` — dieselben Bytes, die der
Client sonst selbst rechnet), Manifest-Eintrag mit eigenem Gitter (`ss = 1`, Ecken aus
`gribCorners`) und Skala `CAPE_MAX`; Client `REPACK_FAMILIES.cape`, Parser (Skalen-Drift ⇒
Ablehnung), `loadGridStep(section, 'cape' | 'precip', …)`; `iconD2Cape.ts` `fetchCapeRepack`
**alles oder nichts** je Aufruf (fehlt ein gewünschter Schritt, geht die Reihe wie bisher über
GRIB). Punktabfrage unverändert `sampleRadarQuad` auf demselben `Uint8Array` — der Wert ist
bit-gleich, nicht „gleich genug".

## 26.3 RADOLAN — warum das nicht dieselbe Bewegung ist

Das Format wäre kein Problem: der Client hält RV heute schon als 8-bit-Frames (`precipToU8`,
§25.1), ein Tar mit 25 Frames à 1100×1200 würde zu 25 Grau-PNGs von je ~20–40 KB. **Der Takt ist
das Problem.** RV erscheint alle **5 Minuten** mit 3,3 min Verzug (§24.3). Ein Producer, der ihn
nach jsDelivr legt, müsste:

1. **alle 5 Minuten laufen** — der GitHub-Actions-`schedule` hat 5 min als kleinsten Takt und
   ist dort **nicht pünktlich** (gemessen an diesem Repo: die stündlichen Batches liefen 18:37,
   19:35, 20:36 — Streuung ±2 min bei stündlichem Takt; bei 5-Minuten-Takt fallen Läufe aus, wenn
   die Warteschlange voll ist);
2. **288 Force-Pushes je Tag** ins Daten-Repo (Retention über Läufe hinweg, jeder Push ein neuer
   Commit-SHA) und 288 Manifest-Umlagen — jede davon heute ein Commit in `buscosun-web` und ein
   **Netlify-Build** (V-BW-4: die Rechnung, die wir gerade kleiner gemacht haben);
3. den **Veröffentlichungsverzug verdoppeln**: 3,3 min DWD + Action-Start (gemessen 30–90 s) +
   Repack + Push + jsDelivr-Erstabruf. Das Regenradar zeigte dann systematisch einen **5 bis
   10 min älteren Stand** — genau die stille Falschaussage, die BW-5 mit dem 404-Rat vermieden hat.

Dagegen steht der Gewinn: **0,36 MiB je DE-Sitzung** (nach BW-5), bei AT/CH null, weil deren
Radar nie über Netlify lief. Das ist der kleinste Posten der Seite gegen die größte betriebliche
Änderung der Linie. **Empfehlung: nicht bauen.** Wenn das RADOLAN-Volumen je auf der Rechnung
sichtbar wird, ist der billigere Weg ein anderer Ort für den Edge-Proxy, nicht ein
5-Minuten-Batch. Deine Entscheidung — bis dahin bleibt RV der EINE Radar-Posten auf Netlify,
benannt in §25.5.

## 26.4 Was das Regenradar nach BW-7a auf Netlify kostet

| | DE | AT | CH |
|---|---:|---:|---:|
| Modell (ICON-D2) | **0** (war 12,65 MiB) | 0 | 0 |
| Radar | 0,36 MiB (RV) | 0 (direkt) | 0 (direkt) |
| Warnungen/Zellen | KB (Lizenz/Takt) | — | — |
| Shell | 0,52 MiB (gecacht) | 0,52 | 0,52 |

## 26.5 Gemessen und geprüft

| | |
|---|---|
| Producer, Lauf 2026082418, 10 Familien, 206 Bilder | **539,5 s**, **218,34 MiB GRIB → 12,51 MiB PNG (17,5×)** — `cape` allein 28 × 49–125 KB |
| Publisher-Baum, 4 Läufe | 28,40 MiB |
| `verify:repack` | ****241/241**** — neu: `cape` Rundlauf PNG → Browser-Bytes → `values` byte-gleich (2 Schritte × 3 Läufe, kein `ref`), Familienliste 10/10, Cap `cape` gegen `EventResult.tsx` (27), Client-Quelltext `loadGridStep(…, 'cape')` + alles-oder-nichts, Abschnitt/URL/Maße je Familie |
| `typecheck` grün · Budget unverändert (Änderung nur in `iconD2Cape.ts`) | |

Lehre aus dem Lauf: der Publisher-Baum trägt inzwischen auch Läufe des **stündlichen Batches**
(2026082421, nur Wind/Temp) — ein Verifier, der `runs[0]` nimmt, prüft dann den falschen Lauf.
Er wählt jetzt den Lauf aus `state.json` des Producers.

**Gate GBW7:** wie GBW6 offen an derselben Zeile (Push ins Daten-Repo, §25.12); Browser-Beleg für
`/regenradar` danach: DE-Sitzung erwartet **16,6 → ≈ 1,4 MiB**, davon Netlify ≈ 0,9 MiB (Shell + RV).

---

# 27. BW-8 — Plattform-Inventar: was noch über Netlify läuft (Diagnose, 2026-08-25)

**Auftrag (Jan):** „die Plattform analysieren und schauen, wo wir noch die Bandbreite über Netlify
reduzieren oder vermeiden — ohne die Qualität zu beeinflussen." Reine Diagnose, kein Code.
Methode: alle 13 Routen am Code durchgezogen (Trigger, Deckel, Requests je Aufruf), Dateigrößen
per HEAD gegen die echten Upstreams gemessen (Läufe 2026082418/2026082400), Prod-Header per HEAD
gegen `buscosun.com`. Vier parallele Prüfläufe, hier zusammengeführt.

## 27.1 Transportwege — was Netlify je Weg kostet

| Weg | Mechanik | Cache | Egress zählt? |
|---|---|---|---|
| `cdn.jsdelivr.net` (Repack) | extern | immutable | **nein** |
| `/_dwd_grib`, `/_dwd_wind` | Edge Function | durable 6 h | ja (Cache spart Upstream, nicht Egress, §4.1) |
| `/_firms` | Edge Function | durable 30 min | ja — **liefert in Prod derzeit 503** (`FIRMS_MAP_KEY` fehlt im Deploy) |
| `/_dwd_opendata`, `/_meteoalarm`, `/_gfs`, `/_cscs`, `/_mf`, `/_ecmwf` | einfacher Rewrite | **keiner** | ja, jedes Byte |
| `dist/*` (Shell, `public/`) | statisch | **kein `_headers`, kein `[[headers]]`** → alles `max-age=0, must-revalidate`, live belegt auch für `/assets/maplibre-*.js` | ja |

## 27.2 Inventar nach Volumen je Aufruf (gemessen)

| # | Posten | Weg | je Aufruf | Auslöser | Datei |
|---|---|---|---:|---|---|
| 1 | **ICON-EU-Sondierung** (10 Druckflächen × T/RH/U/V + 5 Bodenfelder = 45 Dateien à ~1,08 MB) | `/_dwd_opendata` | **48,5 MB** | `/atmosphaere` mit Marker (URL-Hash oder Wiederkehr ⇒ **beim Öffnen**), jeder Marker- **und jeder Stunden-Schritt** des Scrubbers (`[lat, lon, hour]`-Deps, 500 ms Debounce); auch `/globus` → Sondierung | `iconEuSounding.ts:141-199`, `AtmosphereProfile.tsx:73` |
| 2 | **ICON-EU-Höhenwind** 850/700/500 (13 Schritte × U+V) | `/_dwd_opendata` | **28,9 MB je Ebene** (500 hPa 26,4), alle drei 83 MB | Wetterkarte, Wind-Dock „Höhe" | `iconEuPressureWind.ts:29-35`, `MapView.tsx:3374-3410` |
| 3 | **Modell-Umschalter** (Fusion): ICON-D2-EPS ~200 MB (`/_dwd_grib`) · ICON-CH1-EPS 69 MB (34,4 MB `horizontal_constants` einmalig) · ICON global 50–55 MB · AROME-FR 49 MB · AICON 42 MB · ICON-CH2 17 MB · ICON-EU 15 MB · IFS/AIFS 9 MB · ARPEGE 5 MB, aber **≤ 700 sequenzielle 768-B-Ranges** | `/_dwd_opendata`, `/_cscs`, `/_mf`, `/_ecmwf` | s. links | nur auf Modellwahl — **oder Deep-Link `?modell=…` beim Öffnen**. **Jede Wahl lädt doppelt**: Phase A `hours: 6`, Phase B `hours: 24`, `sourceKey` enthält `hours` ⇒ zweiter Netzlauf für ECMWF/ARPEGE/AICON (kein Cache-API-Layer) | `loadFusedForecast.ts:138-141`, `MapView.tsx:1700/1719` |
| 4 | **Waldbrand-Treiber**: `relhum_2m` 25 × 1,1 MB = 27,5 MB (**in der Default-Ansicht**), `smi` 25 × 0,8 MB = 20,4 MB je Tiefe | `/_dwd_grib` (Daten) + **`/_dwd_opendata`-Listing** (`smi` **143 KB** ungecacht ×1–6, je Tiefenwechsel erneut; `relhum` 19 KB) | 27,5 / 20,4 MB | `/waldbrand` öffnen bzw. Bodenlayer | `iconD2Relhum.ts:55`, `iconD2Smi.ts:86`, `iconD2Precip.ts:381-437` (kein Manifest-Gate für `smi`) |
| 5 | **Globus**: `/_gfs`-Ranges ~1 MB je Kaltsitzung (mit 3 Prefetch-Frames), **Animation ≈ 9,9 MB je 0…120-h-Schleife, läuft endlos**, `GRID_CACHE_MAX 72 < 123` Frames ⇒ zweite Schleife lädt neu; dazu `coastline-50m.geojson` 1,64 MB + `borders-50m.geojson` 0,76 MB ungehasht von Netlify | `/_gfs`, `public/globe` | 3,4 MB kalt, +9,9 MB je Schleife | `/globus` öffnen, ▶ | `gfs.ts:108`, `GlobePage.tsx:22,95-113`, `globeStyle.ts:60-61` |
| 6 | **Dock-verborgene Layer** `clouds` 14,8 MB, `confidence` ~4,7 MB (Vorlauf), nur per `#m=` erreichbar | `/_dwd_grib` + Listing `clcl` 18 KB | s. links | Permalink | `MapView.tsx:5356-5386` |
| 7 | **Warnungen**: CH-Atom-Index **265 KB roh / 82 KB gz** je Abruf + DE-CAP-Zip 13 KB (ruhig) … ~110 KB (Unwetter) + je CH-Warnung ein CAP-Dokument | `/_meteoalarm`, `/_dwd_opendata` | ~0,1–0,4 MB | `/warnungen` beim Öffnen, **alle 5 min** + jeder `visibilitychange`, Speicher-TTL nur 60 s | `MapView.tsx:359,3014`, `meteoAlarmCh.ts:84` |
| 8 | **Regenradar DE**: RV-Tar 0,36 MB je 5 min; Konrad3D-Listing **78,5 KB** + XML ~0,6 MB je 5 min | `/_dwd_opendata` | ~1 MB je 5 min | Layer aktiv | `dwdKonrad3d.ts:20`, `radolan.ts` |
| 9 | **Statik ohne Cache-Header**: JS/CSS (975 KB gz, hash-benannt, trotzdem `must-revalidate` ⇒ ~20 bedingte Requests je Warmstart), Fonts 516 KB, `fire/bh/index-season` 1,21 MB + `thermal-sites` 199 KB + `places-dach` 328 KB **mit `cache: 'no-store'`** (Umgehung der SW-Falle, s. 27.3) ⇒ je Sitzung voll neu; `params/background-v1.json` **164 KB ohne einen Aufrufer** | Netlify | — | jede Sitzung | `historyLoad.ts:45`, `thermalSites.ts:186`, `sw.js:49` |
| 10 | Manifeste: `/latest-grib.json` 7 KB `no-store` mit 60-s-TTL; `/latest-wind.json` `no-store` **ohne jede TTL** ⇒ jeder `resolveWindRunFromManifest` ein Request | Netlify | 7 KB | je Auflösung | `iconD2WindSource.ts:101` |

**Nie Netlify (belegt):** `/vorhersage` (Open-Meteo-Familie direkt), `/wetterarchiv` (Meteostat direkt),
`/tourenplanung` (nur UV-JSON 3 KB nach Upload), EFFIS/GWIS/EMS/EEA/GeoSphere direkt, Basemap, DEM.
Tote Pfade: `dwdFireIndex.ts`, `fetchRyLatest`, `gfsSounding.ts`, `public/globe/temp.png`.

## 27.3 Drei strukturelle Befunde (betreffen alle Posten)

**S1 — Kein einziger Cache-Header.** `netlify.toml` hat keinen `[[headers]]`-Block, `public/_headers`
fehlt. Netlify liefert daher auch die hash-benannten Vite-Chunks mit `max-age=0, must-revalidate`:
jeder Warmstart revalidiert ~20 Chunks (304, aber je ein Round-Trip). Ein `_headers` mit
`/assets/*` und `/fonts/*` → `immutable`, `/fire/bh/ev/*` lang (versioniert) kostet nichts an Qualität.

**S2 — Der Service Worker (`public/sw.js:49-52,104-118`) kennt die Proxys nicht.** `ASSET_RE` matcht
nach **Endung**, nicht nach Hash: `/_dwd_opendata/**/uvi.json`, `s31fg.json`, `/latest-*.json`,
`/fire/bh/*.json`, `/globe/*.geojson` laufen als „gehashte Assets" mit Stale-While-Revalidate —
das `cache: 'no-store'` der App wird vom SW überstimmt (**der erste Paint nach Reload zeigt UV/Pollen
vom Vortag**), und SWR feuert den Netzabruf ohnehin immer ⇒ null Ersparnis, `bsc-assets` wird **nie
getrimmt**. Alles andere (`.grib2.bz2`, `.tar.bz2`, `.zip`, `.xml`, `/_firms`, `/_meteoalarm`) landet
network-first in `bsc-data` — **jede GRIB-Datei liegt zweimal** (komprimiert im SW, dekomprimiert in
`icon-d2-grib-decompressed-v1`), jeder RV-Tar zweimal, ein 16-MB-AROME-File zweimal. Die V-BW-7-Ausnahme
wurde nur für `cdn.jsdelivr.net` gebaut, nie für `/_dwd_*`. 206-Antworten (GFS/ECMWF/ARPEGE-Ranges)
fliegen still raus (`cache.put` wirft, wird geschluckt). Sechs Dateien tragen deshalb heute ein
`no-store` als Umgehung (`historyLoad.ts:45,76`, `historyDetail.ts:40`, `thermalSites.ts:186`,
`estimate.ts:141`, `gribManifest.ts:67`, `iconD2WindSource.ts:101`) — und bezahlen es mit vollen
Downloads je Sitzung (1,21 MB Saison-Index, 328 KB Orte, 199 KB Standorte).

**S3 — Die Edge Functions können ICON-EU strukturell nicht** (`dwd-grib.ts:32` Whitelist `icon-d2`,
`icon-d2-eps`; `dwd-wind.ts:29`). Posten 1, 2 und 3 (ICON global, AICON, ICON-EU) laufen deshalb über
den **ungecachten** Rewrite — ein Edge-Cache würde den Egress ohnehin nicht senken (§4.1), ein Repack
könnte es. Beide Änderungswege (Whitelist, Repack-Familie) sind STOPP & FRAGEN.

## 27.4 Hebel, gereiht nach Wirkung ÷ Aufwand — alle ohne Qualitätsverlust

| # | Hebel | spart | Aufwand | Qualität | Zone |
|---|---|---|---|---|---|
| H1 | **`public/_headers`**: `/assets/*`, `/fonts/*`, `/fire/bh/ev/*`, `/globe/*` immutable/lang; Shells + `latest-*.json` bleiben revalidate | ~20 Requests je Warmstart auf jeder Route; Globus 2,4 MB je Wiederbesuch | 1 Datei | keine — Hash/Version im Namen | frei |
| H2 | **SW-Deny-Liste** für `/_dwd_*`, `/_gfs`, `/_mf`, `/_ecmwf`, `/_cscs`, `/_firms`, `/_meteoalarm` (Durchreichen wie jsDelivr) + `isHashedAsset` auf `/assets/` bzw. Vite-Hash begrenzen; danach die sechs `no-store` fallen lassen ⇒ ETag/304 für die Fire-Artefakte | Doppelspeicherung weg, UV/Pollen aktuell, 1,7 MB Fire-Statik je Sitzung → 304 | SW-Datei (Cache-Bump v3 → v4, eigener Gate-Punkt) | **besser** (kein Vortags-UV) | SW = STOPP & FRAGEN |
| H3 | **Sondierung: `hour` aus den Effekt-Deps nehmen** — alle 48 Schritte liegen im selben Lauf; je Marker einmal laden und die Stunde aus dem Cache-API-Treffer bedienen, statt je Scrubber-Halt 45 neue Dateien | 48,5 MB je Stundenschritt (Sitzung mit 4 Halts: 190 → 48 MB) | mittel | keine — dieselben Dateien | Client |
| H4 | **Repack-Familien für ICON-EU** — Sondierung (Producer legt je Lauf die 10 Druckflächen × 4 Felder als PNG ab) und Höhenwind (Muster `wind`, 3 Ebenen × 13 Schritte) | 48,5 MB → ~3 MB je Sondierung; 28,9 MB → ~2 MB je Ebene | groß (eigenes Gitter 1377×657; BW-6-Mechanik trägt es) | Sondierung: **prüfen** — 8-bit-Quantisierung T 0,2 K / RH 0,4 % liegt unter der Modellunsicherheit, muss aber am Profil belegt werden (BW-P-Muster); Höhenwind: wie `wind`, verlustfrei bewiesen | Repack |
| H5 | **Fusion Phase A/B**: `sourceKey` ohne `hours` bzw. Phase B aus Phase-A-Bytes | ECMWF 9 MB, AICON 42 MB, ARPEGE 700 Round-Trips je Modellwahl | klein | keine | **Fusion = STOPP & FRAGEN** |
| H6 | **`smi`/`relhum`/`clcl` ins Manifest-Gate** (Warm-Cron-Liste) statt HTML-Listing; `smi`-Run-Cache ohne Ebenen-Schlüssel | 143 KB je Bodenlayer-Aktivierung/Tiefenwechsel, 19 KB je Waldbrand-Öffnung | klein | keine | Warm-Cron-Liste = STOPP & FRAGEN |
| H7 | **Globus**: `GRID_CACHE_MAX` 72 → ≥ 130 (RAM ~34 MB) oder Schleife nach einem Durchlauf anhalten; GeoJSON per H1 | 9,9 MB je weiterer Schleife | klein | keine | Client |
| H8 | **Warnungen**: CH-Atom-Index bedingt (`If-None-Match`) oder Speicher-TTL 60 s → 5 min (Takt ist ohnehin 5 min) | 265 KB je 5 min je offener Warnseite | klein | keine — Takt bleibt 5 min, Lizenz §7 unberührt | Client |
| H9 | **`FIRMS_MAP_KEY` im Deploy setzen** | 3–6 Fehl-Invocations je Waldbrand-Sitzung; **Hotspots laufen heute nur über den GWIS-Fallback** | Netlify-UI | **besser** (Primärquelle zurück) | Jan |
| H10 | `public/params/background-v1.json` löschen (kein Aufrufer), `globe/temp.png` löschen | 344 KB Deploy | trivial | keine | Löschen = fragen |
| H11 | `/latest-wind.json` mit 60-s-TTL wie `gribManifest.ts` | 7 KB je Auflösung | trivial | keine | Client |
| H12 | Konrad3D: Listing (78,5 KB je 5 min) durch berechneten Zeitstempel ersetzen (BW-5-Muster `guessRvRuns`) | 78 KB je 5 min | klein | keine (404-Rat wie RV) | Client |

**Nicht empfohlen:** RADOLAN-Repack (V-BW-29) · Modell-Umschalter-Repack für ICON global/AICON/
AROME/CH-EPS (Opt-in, selten, je Modell eine eigene Gitter-Familie — Volumen je Klick hoch, je Monat
vermutlich klein; erst Netlify-Analytics lesen, **welche** Modelle überhaupt gewählt werden) ·
Edge-Cache für `/_dwd_opendata` (senkt Egress nicht, §4.1).

## 27.5 Was ich nicht weiß — und was die Reihenfolge entscheidet

Alle Zahlen sind **je Aufruf**. Was auf der Rechnung steht, ist Aufruf × Häufigkeit, und die
Häufigkeit kennt nur das Netlify-Analytics-Panel (Top-Pfade nach Bytes). Ohne diese Zahl ist H1/H2
sicher richtig (trifft jede Sitzung) und H3/H4 wahrscheinlich richtig (ein Atmosphären-Nutzer =
50–200 MB, das sind 7–28 Wetterkarten-Sitzungen vor BW-4). Vorschlag: **Jan liest die Top-20-Pfade
nach Bytes der letzten 30 Tage ab**, dann wird aus der Reihung ein Plan.

**V-Katalog-Nachtrag (§12):** V-BW-30 kein Cache-Header auf Netlify (S1) · V-BW-31 SW-Endungsregel und Doppelspeicherung der Proxys (S2) · V-BW-32 Sondierung lädt je Stundenschritt 45 Dateien (H3) · V-BW-33 Fusion Phase A/B doppelter Netzlauf (H5) · V-BW-34 `smi` ohne Manifest-Gate (H6) · V-BW-35 Globus-Schleife > Grid-Cache (H7) · V-BW-36 `FIRMS_MAP_KEY` fehlt im Prod-Deploy (H9).

## 27.6 Jans Netlify-Log vom 2026-08-25, 01:17–01:21 (Nachtrag)

Eine Sitzung der Wetterkarte mit Gewitter · Rotation · Blitzprognose · Schnee · Böen, Lauf
2026082421, alles über `/_dwd_grib` (Antwortzeiten 6–45 s je `cape_ml`/`cin_ml` = Edge-Miss,
frischer Lauf). Drei Befunde:

1. **Das ist exakt der BW-6-Posten** (§25.10: 63 Abrufe, 31,9 MB) — er verschwindet, sobald der
   Batch die neuen Familien rechnet (Commit von `main` genügt, Gate GBW6).
2. **Gewitter, Rotation, Blitzprognose und Schnee kennen `nowOnly` nicht.** Wind/Temp/Böen laden
   im Nur-Jetzt-Modus das Jetzt-Bracket (`stepsForNowWindow`, `iconD2GustSource.ts:82`,
   `iconD2TempSource.ts:179`); `fetchIconD2Thunder/Rotation/Lpi/Snow` (`MapView.tsx:2234-2298`)
   bekommen keine `opts` und laden **alle** Schritte (13 bzw. 25) — im Log sichtbar `cape_ml` 5…12
   und `h_snow` 7…24. **Hebel H13**: dieselbe Option an die vier Loader, spart heute ~85 % je
   Aktivierung (Gewitter 9,4 MB je Stunde × 13 → × 2) und nach BW-6 die entsprechenden PNG-Abrufe
   vom CDN. Keine Qualitätsänderung: der Slider lädt nach (Muster Wind/Temp seit 2026-07-23).
3. **RV-Listing trotz BW-5** (01:20:05, 1,1 s, danach Tar 2315): der Rat (`guessRvRuns`, 3 Kandidaten)
   greift nur, wenn der jüngste Lauf schon veröffentlicht ist; bei > 5 min Verzug fällt er auf das
   Listing (benannter Fallback, `radolan.ts:301`). Billiger: `RV_GUESS_TRIES` 3 → 4 (ein 404 ≈ 0 B
   gegen 154 KB HTML). Kleinposten, H14.
4. `/sw.js` sechsmal in 20 s (304, ~0 B) — Update-Check je Registrierung; Requests, keine Bytes.

## 27.7 H13 umgesetzt — Nur-Jetzt-Fenster für Gewitter · Blitzprognose · Schnee · Rotation (Gate GH13, 2026-08-25)

**Auftrag (Jan): „dann baue nur H13."** Reiner Client, kein STOPP-Bereich.

**Was gebaut wurde.** `fetchIconD2Thunder/Lpi/Snow/Rotation` nehmen dieselbe Option wie Wind/Temp/Böen
(`opts?: { nowOnly, aheadHours }` → `stepsForNowWindow(capped, runAt, aheadHours)`), ohne Option
unverändert alle Schritte. `MapView.tsx` reicht `{ nowOnly: START_NOW_ONLY && !embedded, aheadHours:
forecastAheadHRef.current }` an den vier Aufrufstellen durch und nimmt die vier Layer in den
Slider-Effekt auf, der beim ersten Zug das Fenster erweitert. Kill-Switch unverändert `?startnow=0`
(dann alle Schritte). Eingebettete Karten (Event-Tagesablauf) laden wie bisher vollständig.

**Verifier.** `verify:repack` **249/249** (neu: je Familie der `stepsForNowWindow`-Anker, 4/4
Aufrufstellen, Slider-Effekt); `typecheck` grün; Budget totalJs 975,5/1017,7 KB.

**Browser, Prod-Preview :5199, isolierter Kontext, Lauf 2026082421, 23:56 UTC (nowH ≈ 2,9):**

| | Abrufe `/_dwd_grib` | Schritte je Param |
|---|---:|---|
| vorher (Jans Log 01:17, §27.6) | 13 × 3 + 12 + 25 = **76** je Aktivierung | Gewitter 0…12, Schnee 0…24 |
| **nachher, Öffnen mit vier Layern** | 8 Params × 2 Schritte = **16** (gezählt 33, s. u.) | **[2, 3]** — das Jetzt-Bracket |
| **nachher, Slider auf +1 h** | +16 | **[2, 3, 4, 5]** = jetzt … +2 h (`NOWONLY_AHEAD_H`), identisch zu Wind/Temp |

Konsole leer. Screenshots `audit/screenshots/h13-desktop-1440-vier-layer-jetzt-fenster.png`,
`h13-mobile-390-vier-layer-jetzt-fenster.png`. Nach BW-6 gelten dieselben Zahlen für die PNG-Abrufe
vom CDN (16 statt 76 Bilder je Aktivierung).

**Nebenbefund V-BW-37 (vorbestehend, nicht gebaut):** beim Mount mit aktiven Layern aus der URL feuert
jeder Install **zweimal** (Schnee dreimal: Lazy-Effekt + Modus-Effekt) — Resource Timing zeigt
`cape_ml` Schritt 2 zweimal mit Start 792/797 ms und gleicher Dauer, `transferSize 0`. Der Guard
`!iconD2ThunderRef.current` schützt nicht, solange der erste Abruf läuft; `fetchDecompressedCached`
entdoppelt In-Flight nicht (`shareInFlight` aus BW-5 wird dort nicht benutzt). Ob der zweite Abruf den
Origin trifft oder Chromes Cache-Lock ihn koalesziert, ist am Preview nicht entscheidbar (SW liefert
`transferSize 0`) — am Netlify-Log prüfbar: erscheint dieselbe Datei zweimal in derselben Sekunde?
Jans Log vom 01:17 zeigt **keine** Doppel-Zeilen ⇒ vermutlich koalesziert, Kosten = 0 Bytes.
Fix wäre `shareInFlight` in `fetchDecompressedCached` (eine Zeile). Getrennt entscheiden.

**Fünf Fragen:** (1) Funktionserhalt — Layer zeichnen unverändert, Slider lädt nach (belegt);
(2) Desktop pixelgleich — kein UI-Code berührt; (3) Touch — keine UI-Änderung; (4) Konsole leer;
(5) Long Tasks — weniger Dekodes als vorher, nicht neu gemessen.

---

# 28. BW-9 — Die Repack-Kette schneller: von Lauf + 105…135 min auf Lauf + 70…80 min (Diagnose + Umsetzung, 2026-08-25)

**Auftrag (Jan):** „prüfe die allgemeine Möglichkeit, die Spiegelzeit zu minimieren — vor allem das
Bemerken ist ein großer Punkt." Anlass war die Hop-Tabelle aus der RV-Diskussion (§26.3 bleibt: RADOLAN
bleibt auf Netlify, Jans Entscheidung 2026-08-25). Gegenstand ist die **bestehende** ICON-D2-Kette
DWD → Producer → Daten-Repo → jsDelivr → Manifest → Client. Reine Messung zuerst, dann Hebel je Hop.

## 28.1 Was der DWD wann veröffentlicht (Listing-Zeitstempel, alle 8 Läufe der letzten 24 h)

Gemessen am 2026-08-25 13:1x UTC an `opendata.dwd.de/weather/nwp/icon-d2/grib/<HH>/{u_10m,tot_prec}/`
(`Last-Modified` je Datei, Schritt 000 und Schritt 048 des jeweils neuesten Laufs):

| Lauf | Schritt 000 | Schritt 048 | Dauer des Uploads |
|---|---|---|---|
| 24.08 15 | 15:44 | 16:20 | 36 min |
| 24.08 18 | 18:44 | 19:20 | 36 |
| 24.08 21 | 21:44 | 22:20 | 36 |
| 25.08 00 | 00:44 | 01:22 | 38 |
| 25.08 03 | 03:44 | 04:21 | 37 |
| 25.08 06 | 06:44 | 07:21 | 37 |
| 25.08 09 | 09:44 | 10:21 | 37 |
| 25.08 12 | 12:44 | (13:13 bei Schritt 38, Upload lief) | — |

**Auf die Minute regelmäßig:** Schritt 000 bei **Lauf + 44 min**, 48 Schritte bei **Lauf + 81 min**, ≈ 0,77 min
je Schritt. Der Repack braucht höchstens Schritt 27 (`precip`/`cape`, `FAMILIES.maxStep`) ⇒ **alles Nötige liegt
bei ≈ Lauf + 66 min**. Die „1,5–2 h" aus der Hop-Tabelle in der Session waren eine Schätzung und zu pessimistisch.

## 28.2 Was die Kette daraus macht (Actions-API des Daten-Repos + Git-Log der Manifest-Commits)

| Lauf | DWD komplett | Batch-Start (Cron `25 * * * *`) | Batch-Dauer | `repack` im Manifest-Commit | = nach Lauf | Wartezeit nach DWD |
|---|---|---|---|---|---|---|
| 24.08 12 | 13:20 | 13:39 | 3,3 min | 14:03 | +125 min | 43 min |
| 24.08 15 | 16:20 | 16:37 | 2,6 | 17:00 | +122 | 40 |
| 24.08 18 | 19:20 | 19:35 | 4,3 | 19:44 | +106 | 24 |
| 24.08 21 | 22:20 | 22:35 | 1,9 | 22:43 | +105 | 23 |
| 25.08 00 | 01:22 | **01:56** | 8,0 | 02:13 | +135 | 53 |

Dazu je ≈ 2 min Netlify-Build, bevor der Browser das Manifest sieht. **Heute: Lauf + 105…135 min.**

Die Hops, aus den Zahlen:

| Hop | gemessen | Ursache |
|---|---|---|
| Bemerken | Cron `:25` startet tatsächlich **:32…:56** (39 Läufe: Jitter +7 min typisch, +19…+31 min nachts) — und die Phase liegt zufällig zum DWD-Takt: alles Nötige liegt bei HH+1:06, der nächste Slot ist HH+1:25 nominal ⇒ HH+1:32…1:56 | GitHub-`schedule` ist unpünktlich (bekannt, §26.3), und die Cron-Phase ist nicht am DWD ausgerichtet |
| Verarbeiten | 7,6–10,1 min je Lauf (10 Familien) | pure-JS-bz2 (V-BW-27), 4-fach paralleler Download, sequenzielle Familien |
| Ablegen | ≈ 5–10 s | — |
| Sichtbar werden | Warm-Cron-Slot (`*/15`) + Jitter + Commit + Netlify-Build ⇒ **5–21 min nach Batch-Ende** (02:04 → 02:13; 16:40 → 17:00; 13:42 → 14:03) | der Client erfährt den Repack nur über `public/latest-grib.json`, das ein Cron committet und Netlify baut |

Und das Manifest springt schon bei ≈ Lauf + 50 min auf den neuen Lauf (`NEAR_REQUIRED 4`): in den folgenden
**55–85 min je Lauf** lädt jede Kartensitzung den neuen Lauf als GRIB über Netlify. 8 Läufe × ~1 h ⇒
**7–11 h am Tag ohne CDN** — das ist der Bandbreiten-Posten hinter der Verzögerung, nicht die Minute selbst.

## 28.3 Befund nebenbei: der Ausstieg greift nicht — der Batch rechnet jede Stunde neu (V-BW-38)

Seit 24.08 23:32 dauert **jeder** stündliche Lauf 7,6–10,1 min (Actions-API: #26…#39), vorher 0,4–0,6 min bei
„nichts zu tun". Um 12:38 rechnete #39 den Lauf 2026082509 neu, der seit 10:36 (#37) vollständig lag, und
force-pushte ihn mit neuem SHA (`188cf1e`, Index-Commit `3fdc987` um 12:48:02).

Ursache, per Diff belegt (`scripts/repack-repo/workflow-build.yml` gegen
`raw.githubusercontent.com/jppetry/buscosun-data/main/.github/workflows/build.yml`): **die live liegende
`build.yml` ist der Stand vor BW-6b** — sie gibt nur `wind=`/`temp=` aus, nicht `steps=`. Der Producer sieht die
acht anderen Familien als „unbekannt" (−1), `skipDecision` sagt „liegt schon, aber unvollständig → nachrechnen".
Folge je Stunde: 218 MB vom DWD, 8–10 min Rechenzeit, Force-Push mit neuem SHA ⇒ `index.json` ändert sich ⇒
`carryRepack` trägt den neuen Commit ins Manifest ⇒ **stündlicher Manifest-Commit + Netlify-Build** — im
Git-Log als 22:43 → 23:40 (derselbe Lauf 21 mit zwei SHAs) sichtbar. Genau das V-BW-4-Muster, vor dem der
Kommentar im Workflow warnt.

Warum die Datei alt ist: eine Action darf ohne `workflows`-Scope keine Workflow-Datei pushen; der Publisher
entfernt `.github/` deshalb bei Abweichung und warnt nur (`publish-repack.mjs:200-206`). **Das kann nur Jans
Hand fixen** — einmal `scripts/repack-repo/workflow-build.yml` als `.github/workflows/build.yml` ins Daten-Repo
committen (Web-UI oder lokaler Push mit eigenen Rechten). Wirkung: 8 statt 24 Producer-Läufe je Tag,
≈ 16 statt ≈ 24 Netlify-Builds je Tag, ohne Codeänderung. Bis dahin sind alle Zahlen dieser Phase mit diesem
Defekt gemessen.

## 28.4 Drei Messungen an jsDelivr, die den Weg öffnen

| Messung | Ergebnis | Folge |
|---|---|---|
| 404 auf `@main` für einen nicht existierenden Pfad | `Cache-Control: no-cache, no-store, must-revalidate` | ein noch nicht abgelegter Pfad wird nicht als 404 festgehalten |
| Branch-Auflösung nach Push (`@main/index.json`) | 4 s nach dem Push noch alter Inhalt; nach `purge.jsdelivr.net` bei +2:39 min der neue HEAD, während `raw.githubusercontent.com` (`max-age=300`) noch alt war | die 12-h-Sperre (`s-maxage=43200`) gilt für einen **gecachten** Pfad; ein Purge oder ein neuer Pfad löst den Branch frisch auf |
| Neuer Pfad `runs/2026082512/repack.json` auf `@main` | Publisher `publishedAt` 13:49:13, erstes 200 auf jsDelivr **13:50:10** (Poll-Raster 21 s) | **≈ 35–57 s** vom Push bis zur Sichtbarkeit |
| Purge-API | `status: finished`, `throttled: false`, ohne Freigabe | 8–24 Purges je Tag sind kein Thema |

Damit braucht die Frische des Repack-Abschnitts **keinen Manifest-Commit und keinen Netlify-Build**: der Client
kann `index.json` direkt vom CDN lesen, wenn der Publisher den Pfad nach jedem Push purgt.

## 28.5 Hebel je Hop

| Hop | Hebel | Gewinn | Zone |
|---|---|---|---|
| Bemerken | **B1** `schedule` nur zu den 8 Laufstunden bei HH+0:40 — **vor** den Daten —, im Job eine **DWD-Warteschleife** (erst auf den Lauf des Slots, dann Listing alle 30 s, bis jede Familie ihren Horizont `minStep…maxStep` hat, Budget 40 min); zweiter Slot HH+2:30 als Sicherheitsnetz (steigt bei vollständigem Lauf in 0,5 min aus). Der GitHub-Jitter (+7…+31) fällt damit in die Wartezeit statt auf den kritischen Pfad | Bemerken ≈ Poll-Pause (≤ 30 s) statt 26–50 min; die „Lauf halb hochgeschoben"-Falle (Wind 4/5 fehlten am 23.08.) entfällt, weil gewartet statt übersprungen wird | YAML des Daten-Repos = Jans Commit (STOPP & FRAGEN) |
| Verarbeiten | **V1** `bzip2`-Binary statt pure-JS (V-BW-27): lokal gemessen **1,26–1,49 s → 0,47–0,59 s je Datei** (t_2m 000, 913 KB → 1,62 MB, fünf Wiederholungen, Binary inkl. Prozessstart), Faktor ≈ 2,6; mit `Promise.all` je Familie laufen die Prozesse zusätzlich auf mehreren Kernen | ≈ 206 Dateien × 0,8 s ≈ **3 min weniger je Lauf** | Producer, flag-gated `REPACK_BZIP2=1`, JS bleibt Fallback |
| Ablegen | — | — | — |
| Sichtbar werden | **S1** Client liest `@main/index.json` vom CDN (`cache: 'no-store'`, Sitzungs-Cache 60 s), baut daraus den Abschnitt für **seinen** Lauf mit derselben Regel wie der Cron (`sectionFor`/`pickForRun`), prüft ihn mit derselben `parseRepackSection`; Publisher purgt `index.json` nach jedem Push und **prüft die Frische nach** (bis 3 Purges). Manifest-Abschnitt bleibt als benannter Fallback | 15-min-Slot + Build entfallen ⇒ **≈ 1–2 min** nach Batch-Ende; der Abschnitt im Manifest wird überflüssig ⇒ halb so viele Manifest-Commits/Builds, sobald Jan ihn abschaltet (`REPACK_INDEX_URL=''` im Cron) | Client + Publisher (frei), Cron-Abschaltung später (STOPP) |

**Summe:** Lauf + 66 (DWD) + ≤ 0,5 (Poll) + 2–5 (Rechnen) + 1–2 (Push/Purge/CDN) ≈ **Lauf + 70…74 min** statt
105…135 — Versatz DWD → CDN **≈ 4–8 min**, bei Jitter > 26 min (selten, nachts gemessen) bis ≈ 12. Das GRIB-Fenster
je Lauf schrumpft von 55–85 auf ≈ 20–25 min.

**Produktfrage (Jan, nicht entschieden):** das GRIB-Fenster gibt es nur, weil das Manifest bei Lauf + 50 springt,
bevor der Repack da ist. Alternative wäre, den Sprung an den Repack zu binden — Fenster null, dafür zeigt die
Karte den 3 h älteren Lauf ≈ 20–30 min länger (Laufzeit steht im Deck). Frische gegen Bytes.

**Nicht gebaut, bewusst:** ein Actions-`repository_dispatch` aus den Warm-Crons ins Daten-Repo (bräuchte einen
PAT — der Plan schließt Secrets aus, §21) · ein 5-Minuten-Batch (§26.3) · schrittweises Publizieren je Familie
(zweiter Force-Push = zweiter Manifest-Wechsel, solange der Cron den Abschnitt trägt).

## 28.6 Umsetzung (2026-08-25, Jans „ja setze das um")

**S1 — der Client liest den Index vom CDN** (`src/sources/repackSource.ts`, additiv):
- `REPACK_CDN_BASE` / `REPACK_INDEX_CDN_URL` spiegeln `CDN_BASE` / `INDEX_CDN_URL` aus
  `scripts/lib/repackManifest.mjs` (Verifier prüft Gleichheit).
- `sectionFromIndex(index, run, family)` baut den Abschnitt für GENAU den Lauf des Aufrufers — dieselbe Regel
  wie `sectionFor`/`pickForRun` im Cron; der Verifier hält beide am Publisher-Baum als JSON byte-gleich
  gegeneinander (jeder Lauf, jede Familie) und prüft, dass beide einen fremden Lauf nicht kennen.
- `resolveRepackSection(run, family, manifestRaw)`: Index vom CDN (`cache: 'no-store'`, Sitzungs-Cache
  60 s als EIN geteiltes Promise — zehn Quellen, ein Abruf; Frist `FIRST_TIMEOUT_MS`), Ergebnis durch
  **dieselbe** `parseRepackSection`; dann `chooseSection` (mehr Schritte gewinnen — ein Re-Publish ergänzt
  Schritte —, bei Gleichstand der Index). Index nicht lesbar/Lauf nicht drin/Schalter aus ⇒ der
  Manifest-Abschnitt wie bisher. Ein Index-Fehler ruft **nie** `markBroken` — die Bilder können liegen.
- `resolveRepackForRun` (neun Quellen) ruft es mit dem rohen Manifest-Abschnitt; der Wind-Pfad
  (`iconD2WindSource.ts:130`) übergibt `m.repack` aus `latest-wind.json` — kein zweiter Manifest-Abruf.
- Kill-Switch `?repackidx=0` / `localStorage.repackidx = '0'` (Query schlägt Speicher in beide
  Richtungen, Muster D-31); `?repack=0` schaltet weiter alles ab. Ohne `window` ist der Weg aus.

**Publisher** (`scripts/publish-repack.mjs`, `purgeIndexUntilFresh` in `repackManifest.mjs`): nach dem
Force-Push 8 s warten (Propagation), `index.json` purgen, vom CDN mit `no-store` lesen, `commit`
vergleichen — bis zu 3× im Abstand von 20 s. Ergebnis in `published.json` (`cdn.fresh`). Scheitert es,
wird es gesagt, nicht geworfen: der Cron-Weg trägt den Abschnitt weiter, ein alter Index nennt höchstens
einen älteren Lauf, den die Anti-Drift-Regel verwirft. `REPACK_NO_PURGE=1` für Tests gegen fremde Remotes.

**B1 — Takt und Warteschleife** (`scripts/repack-icon-d2.mjs`, Vorlage `scripts/repack-repo/workflow-build.yml`):
- Producer: `REPACK_WAIT_SEC` (Default 0 = bisheriges Verhalten) / `REPACK_POLL_SEC` (30). Nach
  `findLatestRun` wird gelistet, bis `stepsMissing(stepsBy, families)` leer ist oder das Budget aus —
  dann wird mit dem gerechnet, was liegt (`waitDecision`, beides rein und im Verifier). Log nur bei Änderung.
- Producer wartet zuerst auf den **Lauf des laufenden 3-h-Slots** (`expectedRunOf`) — ohne das nähme ein Job,
  der vor Lauf + 46 startet, den vorigen vollständigen Lauf und stiege aus; erst das Sicherheitsnetz fände den neuen.
- Vorlage: `schedule` `40 0,3,6,9,12,15,18,21 * * *` (Lauf + 40, vor den Daten) + Sicherheitsnetz `30 2,5,…,23 * * *`,
  `timeout-minutes` 60, `REPACK_WAIT_SEC: '2400'`, `REPACK_POLL_SEC: '30'`, `REPACK_BZIP2: '1'`.
  **Die Vorlage wird erst wirksam, wenn Jan sie als `.github/workflows/build.yml` ins Daten-Repo
  committet** (§28.3) — derselbe Commit, der V-BW-38 behebt.

**V1 — `bzip2`-Binary** (`decompressBz2`, flag-gated `REPACK_BZIP2=1`, Default pure-JS): `execFile('bzip2',
['-dc'])` je Datei, Binary-Erkennung einmal je Lauf, Fehlschlag fällt **je Datei** auf JS zurück.

**Zweite Runde (Jans „baue genau das": A + B + D), nach Profil je Stufe (§28.7):**

- **A — Prefetch-Pool** (`createFetchPool`, `REPACK_FETCH_PAR` Default 6): alle Dateien des Laufs in Schrittfolge
  (`planUrls`: hsurf, dann Schritt 0 aller Familien, dann 1, …) werden über 6 parallele Verbindungen vorausgeholt,
  während der Hauptthread rechnet; `fetchRaw` bezieht die Bytes aus dem Pool, Unbestelltes wird nachbestellt, keine
  URL zweimal, Fehlschläge gehen an den Aufrufer (kein stiller Hänger). Im Wartemodus wird nach jedem Listing
  nachbestellt. Gemessen: 39 Gewitter-Dateien (45 MB) in ≈ 10 s über den Pool — vorher 2–3 s **je** Datei seriell.
- **B — PNG-Encoder — mit Korrektur der Diagnose.** Die Filterwahl (`filterRows`) ist jetzt ein Durchlauf ohne
  `switch` je Byte (dieselbe Heuristik, kleinster Typ gewinnt bei Gleichstand; `encodePngReference` bleibt NUR
  für den Verifier, der byte-gleiche Dateien verlangt) — **aber das brachte nichts messbar** (169 vs 172 ms am
  Windbild). Die 190 ms saßen im `deflateSync` Stufe 9 auf den *gefilterten* Zeilen (meine 24 ms waren am
  ungefilterten Bild gemessen — falscher Eingang). Nachgemessen an allen 205 Bildern eines Laufs: Standard-Deflate
  **21,2 s je Lauf**, `Z_FILTERED` gleich teuer, **`Z_RLE` 0,46 s** — und in Summe 0,9 % **kleiner** (Wind −3 %,
  Niederschlag −11 %, CAPE −6 %; Temperatur +4,6 %, Böen +3 %, Rotation +11 % bei 0,31 MiB). Für eine Kaltsitzung
  (Wind + Temp) ändert das ≈ +0,3 % Bytes. Der Encoder nutzt jetzt `{ level: 9, strategy: Z_RLE }`; verlustfrei —
  der Verifier dekodiert jedes Bild auf seine Eingabe zurück, die BW-1-Rundläufe prüfen weiter die Werte. Die
  PNG-DATEIEN ändern sich damit gegenüber dem Bestand (andere Deflate-Bytes), die dekodierten Werte nicht.
- **D — Schritt für Schritt, sobald die Dateien liegen** (Producer-Hauptschleife): statt Familie für Familie läuft
  jetzt Schritt 0 aller Familien, dann 1, … — die Reihenfolge, in der der DWD ablegt. Im Wartemodus wartet der
  Producer je Schritt nur auf die Familien, deren Horizont ihn enthält (Listing alle 30 s, Nachbestellung an den
  Pool), rechnet ihn und geht weiter; das Wartebudget ist EIN Budget ab Jobstart. `want` für `skipDecision` ist
  im Wartemodus der volle Horizont (ein halber Bestand hielte sonst einen halben Lauf für fertig). Je Familie laufen
  DIESELBEN Schrittfunktionen wie vorher, die Einträge in `repack.json` werden vorab in Familienreihenfolge angelegt
  (Schlüsselreihenfolge unverändert), Niederschlag bleibt sequenziell über `prevBy` (fehlt ein Schritt, zeigt `ref`
  des nächsten auf den letzten gepackten — wie bisher). Belegt (vor der Deflate-Umstellung): Wind 13/13 PNGs byte-gleich zum alten
  Schleifen-Lauf; danach dekodiert-gleich (Datei −3 %), `repack.json`-Schlüssel und Wind-Einträge identisch, Niederschlag `ref` 0:null 1:0 2:1, Gitter
  1215×746; Wartemodus live (Lauf 12 vollständig: kein Warten, wind + thunder 14,6 s inkl. 45 MB Download);
  `skipDecision` im Wartemodus: 13/13 → aussteigen, 11/13 → nachrechnen.

## 28.7 Gemessen und geprüft

| | |
|---|---|
| Wind-Familie, Lauf 2026082512, 13 Schritte, alles im Cache (reine Dekodier-/Bauzeit) | pure-JS **87,3 s** → bzip2-Binary **6,4 s** (13,6×; mehr als die 2,6× je Datei, weil `Promise.all` der Felder jetzt echte Prozesse auf mehreren Kernen sind, während das JS-Modul nacheinander auf EINEM Thread rechnet) |
| Byte-Identität Binary-Lauf ↔ JS-Lauf | **13/13 PNGs identisch** (`cmp`); Verifier-Zeile „bzip2-Binary liefert dieselben Bytes wie pure-JS" zusätzlich an einer Cache-Datei |
| Warteschleife, live gegen den DWD (`REPACK_WAIT_SEC=20`, Lauf 12 vollständig, 14:14 UTC) | erwarteter Lauf 2026082512 = jüngster, „Horizont vollständig → rechnen." sofort; Lauf mit Download 22,2 s, aus dem Cache 5,8 s |
| Purge-Nachprüfung netzfrei | Attrappe liefert erst beim 2. Lesen den erwarteten Commit ⇒ `fresh` nach 2 Versuchen; unerreichbarer Commit ⇒ ehrlich `fresh: false` |
| **Profil je Wind-Schritt** (2 Dateien, Cache, bzip2-Binary) | bz2 166 ms · GRIB-Decode 30 ms · Bild 17 ms · **PNG 212 ms** (davon Deflate 24 ms — der Rest war die Filterwahl) · JS-bz2 zum Vergleich 4 097 ms |
| Download DWD → hier | seriell 2–3 s je 1-MB-Datei; 6 parallel: 6 Dateien in 4,5 s (3,3×) |
| PNG-Encoder nach B | Filterwahl allein: 172 → 169 ms je Windbild (nichts); Deflate L9 → `Z_RLE`: **21,2 s → 0,46 s je Lauf** (205 Bilder), Summe 12,43 → 12,31 MiB; Filter-Rewrite byte-gleich zur Referenz (Verifier, 5 Bilder), Rundlauf decode == Eingabe |
| Pool live (thunder, 39 Dateien, 45 MB, ungecacht) | ≈ 10 s im Lauf statt ≈ 90 s seriell |
| Wind-Lauf aus dem Cache, ganzer Producer inkl. Start + DWD-Listing | 6,0 s (nach V1) → **3,7 s** (nach A + B + D); 13/13 dekodiert identisch, Dateien −3,0 % |
| `typecheck` / `build` | grün |
| Budget `totalJs` | 1089,3 / 1109,8 KB (−0,4 KB) |
| `verify:repack` | **276/276** (nach S1b — Zeiger-URL-Spiegel, Publisher purgt Zeiger vor Index, Zeiger je Lauf im Baum == Index; davor 273/273 nach A + B + D; neu: Pool-Grenze/Dedupe/Nachbestellung/Fehlschlag, `planUrls`-Schrittfolge, `inHorizon`, PNG-Encoder == Referenz byte-gleich; davor 267/267 nach der Slot-Änderung, neu `expectedRunOf`) — die Zeile „bzip2-Binary == pure-JS" steht unter PowerShell als ⊘ (kein `bzip2` im PATH), unter Git-Bash direkt geprüft: IDENTISCH 1623229 (neu: Konstanten-Spiegel, `sectionFromIndex` == `pickForRun`, fremder Lauf, Index-Abschnitt besteht dieselbe Prüfung, `chooseSection`-Wahl, Publisher purgt NACH dem Push, Purge-Wiederholung, `stepsMissing`/`waitDecision`, Workflow-Vorlage, bzip2 == JS) |
| Build + Budget | totalJs **980,9/1017,7 KB** (vorher 975,5), eagerJs 101,5/106,5, alle Budgets eingehalten |

**Erwartung nach A + B + D:** Rechnen je Schritt ≈ 0,3–0,5 s (bz2 parallel im Pool, Decode, Bild, PNG ≈ 30 ms), d. h. während der DWD alle ~46 s einen Schritt ablegt, ist der Producer je Schritt in unter einer Sekunde fertig; nach Schritt 27 bleiben Push (5–10 s) + Purge/CDN (≈ 1 min) ⇒ **Versatz DWD → CDN ≈ 1,5–2 min**. Ein Lauf, der schon vollständig liegt (Sicherheitsnetz, Nachrechnen), braucht statt 8–10 min ≈ 1 min (Download 218 MB im Pool ≈ 50 s + Rechnen ≈ 30 s, überlappend).

**Was hier NICHT gemessen ist:** die Kette in Produktion — sie braucht Jans Commit der Vorlage ins Daten-Repo.
Erwartung aus §28.1/§28.4: Lauf + 66 (DWD) + Poll ≤ 0,5 + Rechnen 2–5 + Push/Purge/CDN 1–2 ⇒ **Lauf + 70…74 min**
(Versatz DWD → CDN ≈ 4–8 min; Jitter > 26 min schiebt es auf ≈ 12);
Nachmessung wie §28.2 (Actions-API + Purge-Zeilen im Log) nach dem ersten Tag.

## 28.8 Gate GBW9

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Kein Layer berührt; der neue Weg liefert denselben Abschnitt (JSON byte-gleich zum Cron-Weg, Verifier) oder fällt auf ihn zurück; GRIB-Fallback unverändert |
| 2 Desktop pixelgleich | kein UI-Code berührt |
| 3 Touch-Targets | keine UI-Änderung |
| 4 Konsole sauber | der Index-Weg meldet nichts — auch nicht beim Fehlschlag (Fallback ist der Normalfall) |
| 5 Long Tasks | ein zusätzlicher ~10-KB-JSON-Abruf je 60 s, kein Dekodieren |

**Jans Hand, in dieser Reihenfolge:** (1) `scripts/repack-repo/workflow-build.yml` als
`.github/workflows/build.yml` ins Daten-Repo committen (behebt V-BW-38 und schaltet B1/V1 scharf);
(2) nach dem ersten Tag §28.2 nachmessen; (3) danach optional `REPACK_INDEX_URL=''` in den Warm-Crons —
der Manifest-Abschnitt entfällt, die Manifest-Commits halbieren sich (STOPP & FRAGEN, Cron-Mechanik);
(4) die Produktfrage aus §28.5 (Manifest-Sprung an den Repack binden?).

**V-Katalog-Nachtrag (§12):** V-BW-38 live `build.yml` im Daten-Repo veraltet ⇒ stündliches Neurechnen +
Build (§28.3, Jans Commit) · V-BW-39 Cron-Phase lag zufällig zum DWD-Takt (§28.2, B1 gebaut) · V-BW-40 der
Client erfuhr den Repack nur über Manifest-Commit + Netlify-Build (§28.2, S1 gebaut) · V-BW-27 erledigt (V1).

## 28.9 Produktionsmessung, erste Runde (2026-08-25, 15:38–15:55 UTC) — und eine Korrektur an S1

**Stand beim Messen:** `buscosun-web` `main` trägt den neuen Producer (Jans Push), die `build.yml` im Daten-Repo
ist **noch die alte** (`25 */1`, kein `steps=`, kein `REPACK_WAIT_SEC`/`REPACK_BZIP2`) — der Publisher behält sie in
der Action bewusst (Token-Grenze, `publish-repack.mjs:195-203`), sie landet dort nur durch Jans eigenen Push. Lauf #42
(Slot `:25`, Start 15:37:56 = +13 min Jitter) ist damit: **neuer Producer, alte Vorlage** — Pool, Z_RLE und
Schrittfolge aktiv, aber pure-JS-bz2, kein Warten, und wegen des fehlenden `steps=` erneut ein Nachrechnen von
Lauf 12.

| Schritt (#42, Actions-Jobs-API) | Dauer |
|---|---|
| Checkout data repo | 20 s |
| **Checkout producer (`git clone --depth=1` von buscosun-web)** | **188 s** — vorher nie einzeln gesehen; der Klon holt public/, Fire-Artefakte, Doku |
| Install producer dependency | 3 s |
| **Repack** (206 Dateien, JS-bz2, Pool 6, Z_RLE, Schrittfolge) | **393 s** (vorher 456–606 s) — JS-bz2 ≈ 4–7 min davon; das Binary kommt erst mit der Vorlage |
| Publish (Klon, Commits, Force-Push, Purge + Nachprüfung) | 56 s |
| gesamt | 11,1 min (Start 15:37:56, Push 15:48:08) |

**Hebel aus der Messung, in die Vorlage aufgenommen:** blob-loser Klon mit Sparse-Checkout (`scripts`, `src`,
`package.json`) — lokal gemessen **5 s statt 188 s**, 12 MB statt des ganzen Baums; Producer-Dateien vollständig.

**Befund an jsDelivr (widerlegt §28.4 teilweise):** nach dem Push 15:48:08 zeigte `@main/index.json` um 15:52–15:55
weiter den Stand von 13:49 — auch nach Purge und mit `X-Cache: MISS, MISS` (beide Fastly-Schichten leer), während
`data.jsdelivr.com` im Listing bereits den neuen Hash führte und `@91bab88/index.json` (Commit-Pfad) frisch war.
**Der jsDelivr-Origin hält den Inhalt eines Branch-Pfads selbst; ein Purge erreicht ihn nicht.** Die Messung um
12:50 (+2:39 frisch) war ein Glückstreffer der Origin-TTL, keine Regel. Was gemessen frisch ist: ein Pfad, der noch
nie abgerufen wurde (13:50:10, 35–57 s nach dem Push).

**Korrektur S1 → S1b, gebaut:** der Publisher schreibt je Lauf einen **Zeiger** `runs/<run>/index.json`
(`schema`, `commit`, `base`, `publishedAt`, `runs: [Eintrag]` — dieselbe Form wie der Index, derselbe Leser). Für einen
neuen Lauf ist das ein neuer Pfad; der Client kennt ihn, weil er den Lauf aus dem Manifest kennt
(`repackRunPointerUrl`). Reihenfolge im Client: **Zeiger → CDN-Index → Manifest-Abschnitt**, alle durch dieselbe
Prüfung, es gilt der mit den meisten Schritten (Re-Publish ergänzt Schritte), bei Gleichstand die frischere Quelle.
Der Publisher purgt den Zeiger des jüngsten Laufs zuerst und prüft ihn nach, dann den Index (dort ohne
Frische-Garantie, ehrlich geloggt). Ein gecachter Zeiger eines älteren Laufs nennt einen älteren Daten-Commit —
dessen Objekte liegen bis zur Räumung (BW-2-Regel: 404 ⇒ GRIB).

**Voller Lauf lokal, erste echte Zahl (16:10 UTC, Lauf 15z frisch vom DWD, alle 10 Familien, 206 Dateien,
233,56 MiB → 12,21 MiB): **67,3 s** — Download über den Pool, bzip2-Binary, Z_RLE, Schrittfolge (vorher auf dem Runner
456–606 s; #42 ohne Binary 393 s). Der Publisher-Probelauf schrieb die vier Zeiger. Nebenbefund: die
hsurf-Invarianzprüfung schlug an („WEICHT AB"), weil sie DATEIBYTES verglich — nach der Deflate-Umstellung anders,
obwohl alle 226 784 Pixel identisch sind (geprüft: alt 61 244 B, neu 61 244 B, Pixel gleich). Die Prüfung vergleicht
jetzt die dekodierten Werte; ein Encoder-Wechsel ist keine Geländeänderung (nachgestellt: kein Alarm mehr).

**Origin-TTL, gemessen:** Push 15:48:08 → `@main/index.json` um 16:36:20 **immer noch alt** (Purge jede Minute, danach `MISS, HIT`/`MISS, MISS`) ⇒ **≥ 48 min**; die 12-h-`s-maxage` gilt offenbar auch am Origin. Für den Client ist der CDN-Index damit nur eine Reserve, der Zeiger die Quelle.

**Lauf #43 (16:37:14–16:47:12 UTC, Lauf 15z, alter Slot, neuer Producer inkl. Zeiger, ohne bzip2/Sparse-Klon):**

| | |
|---|---|
| Klon buscosun-web | **16 s** (in #42: 188 s — GitHub-seitig stark schwankend; der Sparse-Klon bleibt als Deckel drin) |
| Repack (JS-bz2, Pool 6, Z_RLE, Schrittfolge) | 361 s |
| Push | 16:43:54 |
| **Zeiger `runs/2026082515/index.json` erstes 200 auf jsDelivr** | 16:46:10–16:46:25 (Sonde alle 15 s) ⇒ **2,3–2,5 min nach dem Push** |
| `runs/2026082515/repack.json` erstes 200 (Monitor alle 20 s, seit 15:22 angefragt) | 16:47:17–16:47:37 ⇒ 3,4–3,7 min |
| Publish-Schritt | 210 s — die Purge-Nachprüfungen (3 × 20 s je Pfad) liefen alle ins Leere, weil jsDelivr ein vorher angefragtes 404 am Origin eine Weile festhält |
| Versatz DWD (Schritt 27 ≈ 16:05) → CDN | **≈ 41 min** — der alte Slot, wie erwartet |

Lehre zur Frische neuer Pfade: 13:50 waren es 35–57 s, jetzt 2,3–3,7 min — **die ehrliche Spanne ist 1–4 min**, und
sie hängt daran, ob der Pfad VOR dem Push schon angefragt wurde (die Sonden tun das, ein Client nach Manifest-Sprung
meist nicht). Der Publisher prüft den Zeiger jetzt bis zu 4 × im Abstand von 45 s nach (nur Protokoll, keine
Sichtbarkeit) und purgt den Index nur noch einmal ohne Nachprüfung (Origin ≥ 48 min alt, gemessen).

**Erledigt 20:20 UTC (Jans Go):** die Vorlage liegt als `.github/workflows/build.yml` im Daten-Repo (Commit
`3faf09b`, gepusht aus dieser Session per blob-losem Sparse-Klon — der volle Klon scheiterte zweimal mit
`fetch-pack: invalid index-pack output`). Erste Slots der neuen Vorlage: Sicherheitsnetz 20:30 UTC (soll bei
vollständigem 18z in ~0,5 min aussteigen — der erste Beleg für `steps=`), Hauptslot 21:20 UTC für Lauf 21z.

**Sicherheitsnetz #47 (20:40:24–20:42:35 UTC, erster Lauf der neuen Vorlage):** Sparse-Klon **2 s** (statt 16–188 s),
`Repack` 108 s bis „Lauf 2026082518 liegt vollständig → nichts zu tun", `Publish` 0 s — **kein Push, kein
Manifest-Wechsel, kein Netlify-Build**: V-BW-38 ist damit belegt behoben (`steps=` kommt an). Die 108 s sind nicht
der Producer (lokal derselbe Ausstiegspfad 2,3–4,1 s, einmal 45,9 s), sondern die 15 DWD-Listings, die um diese
Zeit langsam antworteten — V-BW-41: im Ausstiegspfad genügt EIN Listing je Familie (10 statt 15), noch besser die
Lauf-Erkennung über `index.json`-Vergleich vor jedem Listing.

**Hauptslot #48 — der erste vollständige Lauf der neuen Vorlage (Lauf 21z, 2026-08-25):**

| | |
|---|---|
| Slot / Start | 21:20 nominal, gestartet **21:31:03** (+11 min Jitter) — 13 min BEVOR der DWD Schritt 000 ablegt |
| Sparse-Klon | 1 s |
| Repack-Schritt | 21:31:27 – 22:07:07: Warten auf den Lauf (Schritt 000 um 21:44:21), dann Schritt für Schritt hinter dem Upload her (012 um 21:55:38, 024 um 22:04:26) |
| DWD Schritt 027 (`regular-lat-lon`, letzter nötiger) | **22:06:42–22:06:44** |
| Producer fertig / Commit + Push | 22:07:07 / **22:07:10** ⇒ **Versatz DWD → GitHub: 26–28 s** |
| Publish-Schritt | 18 s — der Zeiger war beim ersten Nachlesen frisch (nie zuvor angefragter Pfad) |
| Zeiger `runs/2026082521/index.json` auf jsDelivr | 200 spätestens **22:08:10** (Handabfrage; Monitor-Zyklus meldete 22:08:28) ⇒ **≤ 60 s nach dem Push** |
| **Versatz DWD → jsDelivr** | **≈ 1,5 min** (22:06:43 → ≤ 22:08:10) — vorher am selben Tag 39–43 min (§28.10) |
| Nebenwirkung | Index trägt 21/18/15/12 mit vollem Horizont (13/25/25/13/12/12/25/24/28/28); kein Zwischen-Publish, kein Nachrechnen |

Damit ist das Ziel der Phase erreicht und gemessen: **Lauf + 67 min** auf dem CDN (DWD-Grenze + 1,5 min) statt
Lauf + 105…135. Was bleibt, ist der DWD selbst (Schritt 027 bei + 66) und der jsDelivr-Erstabruf (≤ 1 min).

**Gate GBW9 — Nachtrag Produktion:** (1) Funktionserhalt — Index und Zeiger tragen dieselben Familien und
Schrittzahlen wie vor der Phase; Sicherheitsnetz #47 steigt ohne Push aus; (2)–(3) keine UI; (4) Konsole —
der Zeiger-Weg meldet nichts; (5) Long Tasks — ein 10-KB-JSON mehr je 60 s, kein Dekodieren. **Offen (Jans
Entscheidung):** `REPACK_INDEX_URL=''` in den Warm-Crons (Manifest-Abschnitt entfällt, Manifest-Commits halbieren
sich — die Zeiger tragen jetzt die Frische) · V-BW-41 (Listings im Ausstiegspfad) · die Produktfrage aus §28.5.

## 28.10 Versatz DWD-Verzeichnis → GitHub → jsDelivr, je Lauf (Jans Frage, 2026-08-25 19:20 UTC)

Zeitstempel aus `opendata.dwd.de/weather/nwp/icon-d2/grib/<HH>/tot_prec/` (Sekunden im Listing), Push aus der
Actions-API bzw. dem Commit des Daten-Repos, jsDelivr aus den Sonden. **Das Verzeichnis führt je Schritt ZWEI
Dateien:** `icosahedral` (natives Gitter, ~7 min früher) und `regular-lat-lon` (das, was Producer und Client
lesen). Meine erste Messung (§28.1) hatte per Regex beide gemischt und je Lauf das Maximum genommen — das Ergebnis
(+44/+66/+81) stimmt für `regular-lat-lon`; die Zwischenmessung „027 bei + 59" war das icosahedral-Gitter.

| Lauf | DWD 000 (regular) | DWD 027 (letzter nötiger) | DWD 048 | Push ins Daten-Repo | **Versatz 027 → GitHub** | jsDelivr |
|---|---|---|---|---|---|---|
| 09z | 09:44:26 | 10:06:45 | 10:21:11 | ≈ 10:44 (#37, Slot 10:36) | ≈ 38 min | — |
| 12z | 12:44:20 | 13:06:45 | 13:21:05 | 13:49:13 (#40, Slot 13:39) | 42,5 min | `repack.json` 13:50:10 |
| 15z | 15:44:26 | 16:06:47 | 16:21:16 | 16:43:54 (#43, Slot 16:37) | 37 min | Zeiger 16:46:10–25 ⇒ **≈ 39–40 min** |
| 18z | 18:44:31 | 19:06:48 | (Upload lief um 19:20) | **noch nicht** — #45 startete 18:37, VOR dem Lauf, und rechnete 10 min lang 15z nach; 18z kommt erst mit #46 (Slot 19:25 → Start ≈ 19:37, Push ≈ 19:47) | ≈ 40 min (erwartet) |

**Heute also ≈ 37–43 min zwischen „liegt beim DWD" und „liegt auf GitHub", plus 1–4 min bis jsDelivr.** Der Grund ist
unverändert der stündliche Slot `:25` mit +7…+31 min Jitter, der zufällig zum DWD-Takt liegt — 18z zeigt die
Pathologie live: der Batch lief, als der Lauf noch nicht existierte, und der nächste Slot ist eine Stunde später.

**Konsequenz für die Vorlage:** Slot von Lauf + 40 auf **Lauf + 20** vorgezogen (`20 0,3,6,9,12,15,18,21`). Bei + 40
hätte ein später Start (+71) die Daten (+66) schon 5 min liegen lassen; bei + 20 startet der Job bei +27…+51,
also sicher vor den Daten, und die Warteschleife (Budget 40 min ⇒ bis +67…+91) trägt den Rest. Erwarteter Versatz
027 → GitHub danach: Rechnen des letzten Schritts (Sekunden) + Push (5–10 s) ⇒ **< 1 min**, bis jsDelivr **1–4 min**.

---

# 29 BW-10 — Erstbild schneller: Service-Worker-Falle, kritischer Pfad, Concurrency (2026-08-26)

> **Phase:** BW-10. **Auftrag (Jan, 2026-08-25 spät):** „Die Wetterkarte lädt jetzt nur noch PNGs statt erst
> die GRIBs zu dekodieren — dadurch erwarte ich eine schnellere Bereitstellung, die bleibt aber aus. Woran
> liegt es?" Danach Jans Bildschirm beim Laden des Windlayers: **„Lauf 12z · vor 10 h · Schnellzugriff zuletzt
> vor 9 h aufgefrischt"**, während die Manifeste live Lauf 21z trugen. Freigabe: „mache es mit den 3
> Latenz-Hebeln zusammen." Alle Zahlen gemessen (curl/Node gegen Prod und jsDelivr, 2026-08-25 22:40–23:10 UTC).

## 29.1 Zwei Befunde, die nichts miteinander zu tun haben

**A — Der Repack war nie eine Geschwindigkeitsmaßnahme, und das steht schon in §22/§23.** GBW4 hat Weg A
(Temperatur-PNG) gegen Weg B (`?repack=0`, GRIB) je dreimal gemessen: bester Lauf **2 573 gegen 2 591 ms**, Median
2 595 gegen 2 668 — 18 ms Unterschied bei 83–113 ms Streuung innerhalb desselben Wegs; GBW3 davor 3 198 gegen
2 857 ms, ebenso Rauschen. Vier Gründe, alle heute nachgemessen:

1. **Der GRIB-Decode lag nie auf dem kritischen Pfad.** bz2 im `bz2Worker`, Decode + RGBA im
   `windFrameWorker`-Pool; das Producer-Profil (§28.7) nennt 30 ms Decode + 17 ms Bild je Schritt — parallel
   zum Netz, gegen 300–1 600 ms Wartezeit je Datei.
2. **Die Kette ist länger geworden.** `resolveRepackSection` (`repackSource.ts:811`) wartet seit BW-9 auf
   `Promise.all([Zeiger, Index])`, bevor das erste Bild angefragt wird: Manifest **0,55 s** (Netlify,
   `no-store`) → Zeiger 29 KB **0,46 s** ‖ Index 116 KB **0,94 s** → erstes PNG. Rund **1 s vor dem ersten
   Datenbyte**, bei jedem Aufruf neu (`cache: 'no-store'` auf beiden CDN-Abrufen), und der Index ist nur der
   Fallback hinter dem Zeiger — gewartet wird trotzdem auf ihn.
3. **Die Latenz je Datei ist nicht kleiner, nur die Bytes.** jsDelivr am Commit-SHA, `wind-004…006.png`:
   kalt TTFB **0,93 / 1,12 / 1,63 s** bei `X-Cache: MISS, MISS`; zweiter Abruf **0,32 / 0,34 / 0,37 s** bei
   `MISS, HIT`. Die Dateien eines neuen Laufs hat noch niemand angefragt — der Edge holt sie vom Shield, der
   Shield vom Origin. Der Netlify-Durable-Cache war dagegen von den Warm-Crons vorgewärmt: **wir sind von
   einem warmen auf einen kalten Cache umgezogen.**
4. **Die Zahl der Round-Trips ist gleich geblieben.** Bei 247 KB besteht die Wartezeit zu ~⅔ aus TTFB;
   Bytes achteln senkt die Zeit je Datei um ~⅓, und das fressen 2. und 3. auf.

Dazu die Pointe aus §23.5: die größte Aufgabe der Kaltsitzung ist `buildDemImage` (2,5 s Hauptthread,
Terrarium/S3) — sie hat mit ICON-D2 nichts zu tun, der Repack macht sie nur sichtbarer.

**B — Jans Bildschirm zeigt ein 9 h altes Manifest, und das ist der Service Worker.** Live um 22:57 UTC:

| | live (`curl`) | Jans Seite |
|---|---|---|
| `latest-wind.json` `run` | **2026082521**, 2,0 h alt | **12z, „vor 10 h"** |
| `updatedAt` | 22:08 UTC, **0,8 h** alt | **„vor 9 h"** |

`public/sw.js:49` führt `json` in `ASSET_RE`; `isHashedAsset()` prüft nur Origin + Endung. `/latest-wind.json`
und `/latest-grib.json` sind same-origin und enden auf `.json` ⇒ sie gelten als **gehashte Assets** und laufen
durch `hit || (await net)` (`sw.js:99`): der Cache antwortet sofort, das Netz revalidiert im Hintergrund — die
Antwort ist das Manifest der **vorigen** Sitzung. Der `ASSETS`-Cache wird nie getrimmt und nur beim
`VERSION`-Bump gelöscht (seit BW-3 `v3`). Ein `cache: 'no-store'` im App-Code (`iconD2WindSource.ts:101`,
`gribManifest.ts:63`) ändert daran nichts — der SW greift VOR dem HTTP-Cache; die Cache-API ignoriert den
Cache-Modus der Anfrage. Der Kommentar am Wind-Resolver („serviert höchstens den letzten Lauf und revalidiert —
konsistent mit ‚stale statt slow‘") beschreibt den Mechanismus richtig und die Folge falsch: bei einem
Besuch alle paar Stunden ist „der letzte Lauf" 3–9 h alt, und `manifestCoversNow` schlägt erst an, wenn der
letzte Schritt vor „jetzt" liegt (12z mit 0…12 h deckt bis 00z). Das ist V-BW-31 (§27.3 S2), bisher nur
katalogisiert.

**Folge für den Repack, die niemand sieht:** das CDN hält `keep: 4` Läufe (Zeiger 09z → 404, 12z…21z → 200).
Das Stand-Manifest nennt 12z, den ältesten der vier; nach dem nächsten Publish fällt er heraus,
`resolveRepackSection` findet keinen Abschnitt, und die Sitzung läuft **vollständig auf GRIB** — ohne
Konsolenzeile, weil ein fehlender Abschnitt laut §22.4 der Normalfall ist. Zeitweise misst man also gar nicht
den PNG-Weg.

## 29.2 Was Concurrency bringt — und was nicht

13 Bilder eines Laufs vom CDN, je Messung eine andere, noch nie angefragte Familie (`gust`/`thunder`/`rotation`):

| parallel | kalt (Wand) | je Datei Median / max | warm (Wand) |
|---:|---:|---:|---:|
| 6 | **4,16 s** | 1,37 / 2,73 s | 0,43 s |
| 12 | 3,29 s | 0,60 / 3,29 s | 0,21 s |
| 13 | **1,01 s** | 0,60 / 1,01 s | 0,11 s |

Die Zeit je Datei steigt mit der Parallelität NICHT (Median 0,60 bei 12–13 gegen 1,37 bei 6) — der Shield
holt parallel vom Origin. **Aber:** im Standard-Kaltstart (`START_NOW_ONLY`, `MapView.tsx:287`) will jede
Familie nur das Jetzt-Bracket, **2 Dateien**; Concurrency ändert dort nichts. Sie wirkt beim Slider-Fenster
(3–4 Dateien), im eingebetteten/`?startnow=0`-Modus (13 Wind + 25 Temperatur) und beim Nachfüllen des fernen
Horizonts (`Math.min(CONCURRENCY, 3)` — 8 Dateien in 3 Runden).

**Wechselwirkung mit der Frist (BW-3, §22.3).** `STEP_TIMEOUT_MS = 6 s` deckt heute Kopfzeilen UND Körper
einer Datei. Bei N parallelen Abrufen teilen sich N × 247 KB die Leitung; die Frist fällt, sobald
Bytes-in-der-Luft ÷ Bandbreite > 6 s — und ein Fehlschlag gilt für die Sitzung (`markBroken`), die dann auf GRIB
mit **8× so vielen Bytes** wechselt, ausgerechnet auf der langsamen Leitung:

| parallel | Bytes in der Luft | Frist fällt unter |
|---:|---:|---:|
| 6 (heute) | 1,5 MB | **≈ 2 Mbit/s** |
| 12 | 3,0 MB | ≈ 4 Mbit/s |

Das ist schon heute ein Defekt (2 Mbit/s ist 3G) und würde durch mehr Parallelität schlimmer. Die Frist muss
deshalb messen, wofür sie gebaut wurde: „antwortet das CDN?" (§21.6: ein force-weggedrückter Commit antwortete
nach 19,9 s mit 200) — das ist die Zeit bis zu den **Kopfzeilen**, unabhängig von Bandbreite und Parallelität.
Der **Körper** bekommt eine eigene, bandbreitentolerante Frist (30 s: 12 × 247 KB in 30 s sind 0,8 Mbit/s —
darunter hilft auch GRIB nicht mehr), die nur noch einen abgerissenen Strom fängt.

## 29.3 Hebel

| # | Hebel | Wirkung (gemessen/hergeleitet) | Eingriff |
|---|---|---|---|
| **S** | **SW: Live-Manifeste am Asset-Zweig vorbei** — `LIVE_RE` für `/latest-{grib,wind}.json` vor `ASSET_RE`, Cache-Namen `v3` → `v4` (sonst behält jeder Bestandsbrowser den vergifteten Eintrag) | frisches Manifest je Aufruf statt 3–9 h alt; der Repack-Weg bleibt am aktuellen Lauf | `public/sw.js`, ein Regex + Bump — **Manifest-Mechanik, Jans Freigabe liegt vor** |
| **1** | **Index vom kritischen Pfad**: Quellen in Kostenreihenfolge, Abbruch sobald eine die GEWÜNSCHTEN Schritte deckt — Manifest-Abschnitt (0 Abrufe) → Zeiger (29 KB) → Index (116 KB) | −0,94 s im Normalfall (vollständiger Abschnitt im Manifest); −0,48 s, wenn der Zeiger reicht; verlustfrei: ein Abschnitt, der jeden gewünschten Schritt trägt, kann von keiner Quelle mehr verbessert werden | `repackSource.ts` (`sectionCovers`, `resolveRepackSection(…, wanted)`), 9 Loader reichen `wanted` durch |
| **2** | **Preconnect** auf `cdn.jsdelivr.net`, sobald ein ICON-D2-Loader das Manifest anfragt — DNS + TCP + TLS laufen parallel zu den 0,55 s Manifest | −100…300 ms vor dem ersten Bild; nur auf Seiten, die ICON-D2 laden (nicht in `index.html` — die Startseite bräuchte die Verbindung nie) | `preconnectDataCdn()` in `repackSource.ts`, je ein Aufruf in den zwei Manifest-Resolvern |
| **3** | **Concurrency auf dem PNG-Weg** `REPACK_CONCURRENCY = 12` (GRIB-Weg unverändert 6); ferner Horizont die Hälfte (6 statt 3) — **zusammen mit** der Fristen-Trennung Kopfzeilen (3/6 s) / Körper (30 s) | volle Listen 4,2 → ~1 s kalt; Standard-Kaltstart unverändert (2 Dateien); Frist fällt jetzt erst unter ≈ 0,8 Mbit/s statt 2 | `repackSource.ts` (`BODY_TIMEOUT_MS`, `withDeadline.rearm`), Pumpen in Wind/Temp/Böen/Gewitter/Rotation/Blitz/Schnee; Niederschlag (`ref`-Kette, 3) und CAPE (3) bleiben |

**Nicht in dieser Phase, als V-Einträge:** **V-BW-42** — `fetchIconD2Temp` wartet auf `buildDemImage` (2,5 s
Hauptthread, §23.5), BEVOR es den ersten Temperaturschritt anfragt (`iconD2TempSource.ts:225`); Bilder und DEM
sind unabhängig, die 2,5 s könnten parallel zum Netz laufen — der größte verbleibende Posten des
Temperatur-Erstbilds. **V-BW-43** — Pollen (`s31fg.json`) und UV (`uvi.json`) über `/_dwd_opendata/` laufen
weiter unter der Asset-Regel des SW (Rest von V-BW-31); die Modelldateien `/fire/**-v1.json` sind versioniert
und dort richtig aufgehoben. Die amtlichen Warnungen (`.zip`) sind nicht betroffen — die Lizenzauflage „kein
Durable-Cache" (`docs/API.md` §7) war nie verletzt.

## 29.4 Umgesetzt (2026-08-26, Jans „mache es mit den 3 Latenz-Hebeln zusammen")

| Datei | Änderung |
|---|---|
| `public/sw.js` | **`LIVE_RE = /^\/latest-(?:grib\|wind)\.json$/`**, in `isHashedAsset()` ausgenommen ⇒ die Manifeste laufen durch den network-first-Zweig (Cache nur als Offline-Fallback). Cache-Namen **`v3` → `v4`** — `activate` löscht `bsc-assets-v3` samt vergiftetem Eintrag in jedem Bestandsbrowser. Kopfkommentar benennt die Ausnahme |
| `src/sources/repackSource.ts` | **Hebel 1:** `sectionCovers(section, family, wanted)`; `resolveRepackSection(run, family, manifestRaw, wanted?)` befragt Manifest → Zeiger → Index und bricht ab, sobald eine Quelle jeden gewünschten Schritt trägt (ohne `wanted`: BW-9-Regel unverändert, beide CDN-Quellen parallel). Zeiger und Index haben getrennte Sitzungs-Caches (`cdnPointer`/`cdnIndex`, je EIN geteiltes Promise je TTL-Fenster). `resolveRepackForRun(run, family, wanted?, url?)`. **Hebel 2:** `preconnectDataCdn()` — `<link rel="preconnect" crossorigin="anonymous">` auf den CDN-Origin, einmal je Dokument, nur mit eingeschaltetem Weg, ohne DOM ein No-op. **Hebel 3:** `REPACK_CONCURRENCY = 12`; Fristen getrennt — `withDeadline(…).rearm(ms)`, `loadRgba` misst die Kopfzeilen unter `FIRST/STEP_TIMEOUT_MS` (3/6 s) und den Körper unter **`BODY_TIMEOUT_MS = 30 s`**; `markBroken`-Semantik unverändert (ein Fehlschlag gilt für die Sitzung) |
| `src/wind/iconD2WindSource.ts` | Resolver gibt den ROHEN Abschnitt (`repackRaw`) zurück; geprüft wird er im Loader **nach** dem Nur-Jetzt-Fenster gegen `wanted`; `preconnectDataCdn()` vor dem Manifest-Abruf; nahe Pumpe `section ? 12 : 6`, ferne die Hälfte (6 statt 3 auf dem CDN-Weg). Der Resolver-Kommentar „stale statt slow" ist korrigiert — er beschrieb die Folge falsch |
| `src/sources/iconD2Precip.ts` | `preconnectDataCdn()` am Anfang von `resolveLatestRun` (deckt alle GRIB-Manifest-Familien); `steps` an `resolveRepackForRun` |
| `iconD2TempSource` · `iconD2GustSource` · `iconD2Lpi` · `iconD2Rotation` · `iconD2Snow` · `iconD2Thunder` · `iconD2Cape` | `wanted` an `resolveRepackForRun`; Pumpen `section ? REPACK_CONCURRENCY : CONCURRENCY` (CAPE bleibt 3, Niederschlag 3 — `ref`-Kette) |
| `scripts/verify-repack.mjs` | +19 Prüfungen: Fristen-Trennung (Körper-Frist ⇒ ≤ 1 Mbit/s bei 12 × 247 KB, `rearm` zwischen `fetch` und `blob`), Concurrency-Spanne, Preconnect ohne DOM, beide Resolver preconnecten VOR dem Manifest, alle acht Loader + Wind reichen `wanted` durch; `sectionCovers`-Fälle; **Attrappe mit `window` + zählendem `fetch` am Publisher-Baum** — Manifest deckt ⇒ 0 Abrufe · Zeiger deckt ⇒ 1 · keine Quelle ⇒ 2 (Gleichstand: Zeiger) · ohne `wanted` ⇒ 2 · kein Manifest-Abschnitt ⇒ 1 · Zeiger je TTL-Fenster EINMAL · Zeiger 404 ⇒ Index trägt, Weg nicht kaputt; SW: `LIVE_RE` trifft beide Manifeste und nichts sonst, `isHashedAsset` nimmt sie aus, `VERSION ≥ v4` |

Nicht angefasst: Shader, GRIB-Weg (Concurrency 6, keine Frist), `?repack=0`/`?repackidx=0`, Warm-Crons, Publisher.
`npm run typecheck` grün, Budget totalJs 986,2/1017,7 KB (alle Budgets eingehalten), Build 56,8 s.

## 29.5 Gemessen (Chrome DevTools MCP, Desktop, 2026-08-25 23:27–23:40 UTC)

**Prod, alter Code (v3-Worker), `https://buscosun.com/wetterkarte/wind`** — Resource Timing, ms ab Navigationsstart:

| Abruf | Start | Ende | Bemerkung |
|---|---:|---:|---|
| `/latest-wind.json` | 2 575 | 2 688 | über SW |
| `runs/2026082521/index.json` (Zeiger) ‖ `@main/index.json` | 2 691 | 3 184 ‖ 3 203 | **515 ms Wartezeit vor dem ersten Bild** (Edge warm; kalt per curl 0,94 s) |
| `wind-002.png` · `wind-003.png` | 3 206 | 3 891 | erste Bilder |
| `temp-002.png` · `temp-003.png` | **13 922** | 14 442 | **10,7 s nach dem Manifest** — dazwischen `hsurf` (3 207→3 649), Terrarium-Kacheln, `buildDemImage` |

**Lokal, neuer Build (`vite preview :5199`, v4-Worker, Manifeste = Prod-Stand 21z), Kaltstart (HTTP-Cache dieses Origins leer):**

| Abruf | Start | Ende | Bemerkung |
|---|---:|---:|---|
| `/latest-grib.json` · `/latest-wind.json` | 1 140 · 1 150 | 1 277 · 1 276 | über SW, **network-first** — Eintrag liegt in `bsc-data-v4`, NICHT in `bsc-assets-v4` |
| Zeiger / Index | — | — | **kein Abruf** (Manifest-Abschnitt deckt die zwei Bracket-Schritte) |
| `wind-002.png` · `wind-003.png` | **1 279** | 2 236 · 2 251 | **3 ms nach dem Manifest**; `dns 0 · connect 0 · tls 0` — `<link rel="preconnect" href="https://cdn.jsdelivr.net/" crossorigin="anonymous">` steht im `<head>`, und Chrome partitioniert Verbindungen je Top-Level-Site, also war es keine Restverbindung vom Prod-Besuch |
| `temp-002.png` · `temp-003.png` | 11 329 | 11 497 | 10,2 s nach dem Manifest — dieselbe DEM-Wartezeit wie in Prod (V-BW-42) |

**Warm-Reload lokal:** Manifest 894 → 906 (12 ms, Netz), Bilder ab 910. Long Tasks ≥ 50 ms: 5; **> 200 ms: 534 ms @ 2 162 und 3 392 ms @ 3 228** — die Temperaturbilder starten bei **6 620 = 3 228 + 3 392**, auf die Millisekunde das Ende von `buildDemImage`. Beide Aufgaben sind der vorbestehende DEM-Bau (§23.5: 2 573 ms best-of-3, unabhängig vom Datenweg); diese Phase fügt dem Hauptthread nichts hinzu, sie nimmt Wartezeit weg. **Konsole: 0 Fehler, 0 Warnungen.**

**Live-Beleg des SW-Mechanismus (Prod, v3-Worker, Automations-Profil):** in `bsc-assets-v3` einen Eintrag `/latest-wind.json` mit Lauf **12z** gelegt (Kopie des Live-Manifests, `run`/`runAt`/`updatedAt` 9 h zurückgesetzt), Seite neu geladen. Die Karte lud daraufhin **`runs/2026082512/wind-011.png` und `wind-012.png`** (Lauf 12z, Jetzt-Bracket um 23:35 UTC) und den Zeiger `runs/2026082512/index.json` — während der Server `2026082521` lieferte (Bypass-Abruf im selben Skript). Der Worker revalidierte den Eintrag im Hintergrund: ein Abruf NACH dem Seitenaufbau bekam schon 21z — genau die SWR-Mechanik, mit der jede Sitzung den Stand der **vorigen** sieht (Jans 9 h = Abstand zu seinem vorigen Besuch). Eintrag danach entfernt (`cache.delete` → `true`).

**Was die Messung nicht deckt:** Mobile (Emulation für WebGL nicht repräsentativ, Real-Device offen); Concurrency 12 im Browser (der Standard-Kaltstart lädt 2 Dateien — die Wirkung bei vollen Listen steht in §29.2 aus Node); die Körper-Frist auf einer echten 3G-Leitung (hergeleitet, nicht gemessen).

## 29.6 Gate GBW10

`npm run verify:repack` **295/295** (276 + 19 neue, keine ✗; Laufzeit ~45 min, weil ohne `bzip2` im PATH der JS-bz2 jede GRIB-Datei der Familienprüfung in ~4 s entpackt — V-BW-27 gilt auch für den Verifier). `npm run typecheck` grün. Budget 986,2/1017,7 KB.

1. **Funktionserhalt** — jeder Layer, jede Familie, derselbe Lauf, dieselben Bytes: der PNG-Loader ist bis auf die Fristen-Trennung unverändert, `sectionCovers` ist verlustfrei (ein Abschnitt mit allen gewünschten Schritten ist durch keine Quelle zu verbessern), ohne `wanted` gilt die BW-9-Regel wörtlich (Verifier: „beide CDN-Quellen, parallel"), der GRIB-Weg (Concurrency 6, keine Frist) und beide Kill-Switches sind unangetastet; `markBroken` hat dieselbe Semantik. Offline liefert der Worker die Manifeste weiter aus `bsc-data-v4` (Cache-Fallback des network-first-Zweigs).
2. **Desktop pixelgleich** — keine UI-Änderung; dieselben Bilder aus denselben URLs (lokal `wind-002/003`, `hsurf-v1`, `temp-002/003` wie in Prod).
3. **Touch-Targets** — nicht berührt.
4. **Konsole** — 0 Fehler, 0 Warnungen (Kaltstart und Warm-Reload, §29.5).
5. **Long Tasks** — 534 und 3 392 ms, beide der vorbestehende DEM-Bau (§23.5), auf die Millisekunde belegt (Temperaturbilder starten bei 3 228 + 3 392 = 6 620); die Phase legt keine Arbeit auf den Hauptthread.

**Offen (Jans Hand):** Deploy = Commit + Netlify-Build; danach holt jeder Bestandsbrowser den v4-Worker beim nächsten Aufruf (`skipWaiting` + `clients.claim`) — **der erste Aufruf nach dem Deploy kann noch das alte Manifest zeigen**, weil der Wechsel während des Ladens passiert; ab dem zweiten ist es frisch. Mobile Real-Device (§29.5 Vorbehalt). **V-BW-42** (Temperatur wartet 10 s auf das DEM) ist der nächste messbare Hebel für das Erstbild; **V-BW-43** Pollen/UV unter der SW-Asset-Regel. Die Fristen-Trennung ändert den BW-3-Vertrag „zwei Fristen" zu „zwei Kopfzeilen-Fristen + eine Körper-Frist" (§22.3 gilt mit diesem Zusatz).


# 30 BW-11 — Warum die BW-10-Korrektur die Bestandsbrowser nicht erreichte (2026-08-26)

**Jans Meldung:** „Die Wetterkarte nimmt immer noch nicht die letzten Daten der
Layer" — sein Bildschirm zeigte

    Wind · DWD ICON-D2 U/V 10M · 2,2 KM · Lauf 21z · vor 4 h

um 01:15 UTC, also 21z, obwohl 00z längst lag.

## 30.1 Was wirklich lag

| Stelle | Stand | Zeitpunkt |
|---|---|---|
| `buscosun.com/latest-wind.json` | `run 2026082600` | `updatedAt` 00:50 UTC |
| `buscosun.com/latest-grib.json` | `run 2026082600` | `updatedAt` 00:50 UTC |
| Daten-Repo `runs/2026082600/` | vorhanden, Index gezogen | ≈ 01:06 UTC |
| `buscosun.com/sw.js` | `VERSION = 'v4'` (BW-10) | ausgeliefert |

Beide Seiten waren also auf 00z. Der Fehler lag im Browser, nicht in der Kette.

## 30.2 Die Gegenprobe, die den Verdacht auf den Client lenkte

Ein **frischer** Browser auf `https://buscosun.com/wetterkarte/wind` zeigte

    Wind · DWD ICON-D2 U/V 10M · 2,2 KM · Lauf 00z · vor 1 h

— korrekt. Der Unterschied zwischen den beiden Browsern ist der Service Worker.

## 30.3 Der Befund (V-BW-44)

Im **Bestands**browser gemessen:

```
active:  https://buscosun.com/sw.js   state: activated
waiting:                              state: installed
caches:  bsc-shell-v2  bsc-data-v2  bsc-assets-v2  bsc-shell-v4  icon-d2-grib-decompressed-v1
bsc-assets-v2 enthält:  /latest-grib.json   /latest-wind.json
```

Zu lesen ist das so: der **alte** Worker bedient, der v4-Worker steht als
`installed` daneben und kommt nicht dran (`bsc-shell-v4` belegt, dass sein
`install` lief; dass `bsc-*-v2` **und** `icon-d2-grib-decompressed-v1` noch da
sind, belegt, dass sein `activate` **nicht** lief — es löscht beides). Und im
Cache des alten Workers liegen genau die zwei Live-Manifeste.

Damit ist V-BW-31 (§29.1 B) in Bestandsbrowsern **unverändert wirksam**: der alte
Worker führt `.json` als gehashtes Asset, antwortet erst aus dem Cache und frischt
danach auf — jede Sitzung sieht den Lauf der **vorigen**. Genau ein Lauf Rückstand,
genau Jans Bild.

**Die Lehre — und sie gilt über diese Phase hinaus:** `self.skipWaiting()` im
`install` ist eine **Bitte, kein Vollzug**. Solange ein Tab der Herkunft offen
ist, kann ein neuer Worker in `waiting` stehen bleiben. Eine Korrektur, die IM
Service Worker steht, ist deshalb nicht ausgeliefert, wenn sie deployt ist —
sie ist ausgeliefert, wenn der neue Worker **aktiviert** ist. Der Satz aus §29
(„der erste Aufruf nach dem Deploy kann noch das alte Manifest zeigen") war zu
milde: es ist nicht der erste Aufruf, es sind alle, bis der Worker wechselt.

## 30.4 Umgesetzt — zwei Nähte, jede für sich ausreichend

**(1) Die Übernahme wird vollzogen, nicht erbeten.**
`public/sw.js` bekommt einen `message`-Empfänger für `SKIP_WAITING`;
`src/main.tsx` registriert wie bisher, ruft zusätzlich `update()`, schickt einem
wartenden Worker die Nachricht und lädt bei `controllerchange` **genau einmal**
neu. Das Neuladen hängt an `hadController`: bei der Erstregistrierung feuert
`controllerchange` durch `clients.claim()` — dort wäre es eine zweite Ladung
ohne Anlass.

**(2) Die Frische hängt an keinem Worker mehr.**
`liveManifestUrl()` (in `gribManifest.ts`, EINE Regel, von beiden Resolvern
benutzt) hängt an den Abruf-URL der Live-Manifeste einen Minutenstempel im Takt
von `MANIFEST_TTL_MS`. Der **Pfad** bleibt unverändert — `LIVE_RE` prüft
`url.pathname`, die network-first-Regel des v4-Workers gilt also weiter —, aber
der **Cache-Schlüssel** ist neu, und ein alter Worker findet nichts und geht ans
Netz. `cache: 'no-store'` konnte das nie leisten: es wirkt im HTTP-Layer, der
Worker greift davor.

Der Identitätsschlüssel bleibt der Pfad ohne Stempel: Manifest-Cache
(`getManifest`) und Gesundheitsmeldung (`reportManifest`) sollen nicht je Minute
eine neue Datei zu sehen glauben.

**Preis von (2):** im Cache eines alten Workers wächst je Minute und Datei ein
Eintrag (~1 KB) — bis dessen `activate` ihn ohnehin löscht. Das ist der
bewusste Tausch: ein paar KB gegen die Gewissheit, dass niemand einen Lauf
Rückstand sieht.

## 30.5 Gate GBW11

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Registrierung und Cache-Strategien unverändert; nur additiv (Nachricht, `update()`, Stempel) |
| 2 Desktop | keine UI berührt |
| 3 Touch-Targets | keine UI berührt |
| 4 Konsole | s. u. |
| 5 Long Tasks | keine Rechenwege berührt |

**Offen:** die Wirkung auf einen echten Bestandsbrowser ist erst nach dem Deploy
zu sehen — **Deploy ist Jans Gate**. Bis dahin hilft Jan sofort: einmal Worker
abmelden und Caches leeren (DevTools → Application → Unregister + Clear storage),
oder `?repackidx=1` … nein — der schnellste ehrliche Weg ist das Abmelden.

## 30.6 V-Einträge

* **V-BW-44** — der Kern dieses Abschnitts: eine Service-Worker-Korrektur ist
  erst wirksam, wenn der Worker **aktiviert** ist; `skipWaiting()` im `install`
  garantiert das nicht.
* **V-BW-45** — `activate` des Workers löscht **jeden** fremden Cache-Namen,
  also auch `icon-d2-grib-decompressed-v1` (Dekomprimat-Cache der GRIB-Kette).
  Beim ersten Wechsel auf v4 geht dieser Cache verloren und wird neu aufgebaut:
  einmalig teurer Kaltstart, kein Datenfehler. Aufgefallen bei der Messung oben;
  nicht behoben, weil die Aufräumregel sonst eine Liste pflegen müsste — Jans
  Entscheidung.


# 31 BW-12 — Die Warm-Crons deployen 31×/Tag, ohne noch etwas zu wärmen (Diagnose, 2026-09-04)

**Jans Meldung:** „Die ständigen Deploys wegen Wind-GRIB kosten total viel
Netlify-Credits, sind diese überhaupt noch notwendig? Ich würde sie wenn möglich
komplett lassen und das ganze komplett entfernen."

## 31.1 Die Last, gezählt

    git log --since="7 days ago" -- public/latest-grib.json public/latest-wind.json

**218 Commits in 7 Tagen = 31,1 Produktions-Builds pro Tag ≈ 930 im Monat.**
Jeder ist ein voller `tsc -b && vite build && node scripts/generate-seo.mjs`
(`netlify.toml` `[build] command`), ausgelöst allein durch den Commit-back der
beiden Manifeste — die Workflows setzen bewusst KEIN `[skip ci]`, weil genau
dieser Build das Manifest statisch neu ausliefert.

Aufteilung je ICON-D2-Lauf (8/Tag):

| Cron | Commits/Lauf | Warum mehr als einer |
|---|---|---|
| `warm-grib` | 2–3 | erst der Lauf-Advance, dann der `repack`-Abschnitt, wenn der Producer nachzieht; dazwischen Step-Nachträge (ICON-D2 publiziert progressiv, V-81) |
| `warm-wind` | 1 | eigener Lauf, eigenes Manifest, eigener Commit |

Beispiel 2026-09-03: 19:13 wind, 19:13 grib, 19:37 grib, 19:49 grib — vier
Builds in 36 Minuten.

## 31.2 Korrektur an der ersten Einschätzung dieser Session

Meine erste Antwort an Jan nannte „Durable-Edge-Cache wärmen" als noch bestehende
Leistung der Crons. **Das ist falsch.** Beide Skripte tragen seit dem
2026-08-23 den Kopf „⚠️ Der Dateiname ist historisch: hier wird NICHTS mehr
gewärmt" (`scripts/warm-grib.mjs` Z. 15–50, `scripts/warm-wind.mjs` Z. 13–46) —
der wärmende Pfad wurde auf Jans Auftrag hin nicht abgeschaltet, sondern
gelöscht (§5, §14, §16: 372 MiB Egress je Durchlauf, `durable` auf Edge
Functions wirkungslos, Konto in `usage_exceeded`).

Beide Crons sind seitdem **reine Manifest-Publisher**. Das ändert die Bewertung
zugunsten des Rückbaus: es gibt keine zweite, versteckte Leistung mehr zu retten.

## 31.3 Was die Manifeste heute noch wert sind

Drei Dinge, und nur drei:

1. **Lauf-Auflösung ohne Directory-Scan.** `resolveLatestRun`
   (`src/sources/iconD2Precip.ts:128`) liest `run` + `steps` aus dem Manifest;
   ohne Manifest greift die Rückwärtssuche über DWD-Listings darunter — mit
   ~1,9 s beziffert (Kopf beider Warm-Skripte), pro Param und Kaltsitzung, und
   jedes Listing läuft über den Netlify-Proxy.
2. **Der `repack`-Abschnitt als kostenlose erste Quelle.** Seit BW-9 kann der
   Client den Abschnitt selbst vom CDN holen (`repackRunPointerUrl`,
   `REPACK_INDEX_CDN_URL`, `src/sources/repackSource.ts:836 ff.`) — das Manifest
   ist dort nicht mehr die einzige, sondern die **billigste** Quelle: BW-10
   (§29.3 Hebel 1) hält fest, dass ein vollständiger Manifest-Abschnitt
   **0 CDN-Abrufe** kostet, während Zeiger (29 KB) und Index (116 KB) zusammen
   gemessen **0,94 s** vor dem ersten Bild stehen.
3. **Der `eps`-Abschnitt** ist ausdrücklich Doku/Ops — „der Client liest ihn
   NICHT" (`warm-grib.mjs`, Phase T2b-3). Wert für die Auslieferung: null.

Ersatzloses Löschen kostet also ~1,9 s Lauf-Auflösung + bis zu 0,94 s vor dem
ersten Bild — gegen die gesamte LE-Linie (`audit/layer-erstbild.md`), die
zuletzt um Sekundenbruchteile gekämpft hat. Es ist nicht der billigste Weg.

## 31.4 Der Deploy ist das Problem, nicht der Cron

Der Cron kostet nichts: er zieht DWD-Listings und schreibt ~30 KB JSON. Teuer
ist ausschließlich der **Auslieferungsweg** — „Datei liegt im Site-Repo, also
muss Netlify bauen". Genau diesen Weg hat die Radar-Linie schon einmal verlassen
(RD2/RD3, `audit/radar-datenrepo.md`): der Client liest die Bilder direkt vom
Daten-CDN, Netlify sieht kein Byte und baut nicht.

**Jans Entscheidung 2026-09-04:** dieselbe Verlegung für die Manifeste —
`latest-{grib,wind}.json` wandern nach `buscosun-data`, Auslieferung über
jsDelivr, die same-origin-Datei bleibt eingefrorener Fallback.

Nebengewinn, der nicht kalkuliert war: `public/sw.js` reicht `cdn.jsdelivr.net`
unangetastet ans Netz durch (`DATA_CDN_HOST`, kein `respondWith`). Ein Manifest
auf dem CDN verlässt damit den Service-Worker-Zweig vollständig — die gesamte
Fehlerklasse aus BW-10 §29.1 B und BW-11 (`LIVE_RE`, Minutenstempel,
Worker-Aktivierung) entfällt ersatzlos statt gepflegt zu werden.

## 31.5 Die Frischefalle, die den Pfad bestimmt

BW-9 §28.9 ist hier bindend: **ein Purge erreicht den jsDelivr-Origin nicht.**
Gemessen am 2026-08-25 lieferte `@main/index.json` nach dem Purge mit
`MISS, MISS` trotzdem den alten Stand. Frisch war nur ein Pfad, der **noch nie
abgerufen wurde** (35–57 s nach dem Push). Dazu kommt die 404-Stickyness aus
RD0 (`audit/radar-datenrepo.md`): ein Pfad, den man probeweise anfragt, bevor
er existiert, kann als 404 hängenbleiben.

Daraus folgt die Pfadwahl — sie ist keine Geschmacksfrage:

| Quelle | Pfad | Frische | Rolle |
|---|---|---|---|
| Lauf-Zeiger | `@main/manifest/<run>/{grib,wind}.json` | 35–57 s (neuer Pfad je Lauf) | erste Quelle, aber **nur für einen Lauf, den der Client bereits kennt** — nie blind probieren (404-Sticky) |
| Stabiler Pfad | `@main/manifest/latest-{grib,wind}.json` | Minuten (Origin-Lag trotz Purge) | zweite Quelle; immer noch schneller als der heutige Weg (5–21 min Cron-Slot + Build, §28.2) |
| Site (eingefroren) | `/latest-{grib,wind}.json` | Stand des letzten echten Deploys | dritte Quelle; der 24-h-Staleness-Guard verwirft sie von selbst, sobald sie zu alt ist |
| Directory-Scan | DWD über `/_dwd_opendata` | live | vierte, unveränderte Rückfallebene |

Der Zeiger löst das Henne-Ei-Problem nicht allein (für den ERSTEN Abruf kennt
der Client den Lauf noch nicht); er wirkt ab der zweiten Auflösung und für
Läufe, die aus dem Repack-Index bekannt sind. Den Kaltstart trägt der stabile
Pfad. **Jede so entstehende CDN-Verzögerung ist kleiner als die
Netlify-Build-Verzögerung, die sie ersetzt** — das ist der Kern der
Rechtfertigung.

## 31.6 Was zu bauen ist

> **Überholt durch §31.12.** Dieser Abschnitt beschreibt den UMZUG der Manifeste
> nach `buscosun-data`. Gebaut wurde stattdessen ihre Abschaffung: der Client liest
> Lauf und Schritte aus dem Index, den der Producer ohnehin veröffentlicht. Der
> Abschnitt bleibt als Beschreibung des verworfenen Wegs stehen.

1. **Producer** (`.github/workflows/warm-{grib,wind}.yml`): Commit-back nicht
   mehr nach `jppetry/buscosun-web`, sondern nach `jppetry/buscosun-data`
   (`manifest/latest-*.json` + `manifest/<run>/*.json`), anschließend Purge des
   stabilen Pfads mit Frischeprüfung — dasselbe Muster wie
   `purgeIndexUntilFresh` in `scripts/lib/repackManifest.mjs`.
2. **Client** (`src/sources/liveManifest.ts`, `gribManifest.ts`,
   `iconD2WindSource.ts`): Quellenkette nach §31.5, **default-off hinter einem
   Flag mit benanntem Fallback (Rule 2)** — `?manifestcdn=0` schaltet zurück auf
   den heutigen same-origin-Weg, byte-identisch.
3. **Service Worker:** `LIVE_RE` bleibt, solange die same-origin-Datei die dritte
   Quelle ist. Keine neue Regel für den CDN-Host nötig (er wird durchgereicht).
4. **Verifier:** `verify:repack` prüft schon heute die Spiegelung der Konstanten
   zwischen Producer und Client; die neuen Pfadkonstanten gehören in dieselbe
   Prüfung. `verify:health`/`verify:datenalter` lesen die Manifest-URL — mitziehen.
5. **Aufräumen erst am Schluss:** die Dateien bleiben im Site-Repo liegen
   (eingefroren, dritte Quelle). Was entfällt, ist der Commit-back — und damit
   der Build.

## 31.7 Offen — Jans Hand

* ~~**Cross-Repo-Schreibrecht.**~~ **Hinfällig seit §31.12.** Der Umzug der
  Manifeste nach `buscosun-data` hätte einen Fine-grained-PAT gebraucht, den nur
  Jan anlegen kann. Der Index-Weg braucht ihn nicht: der Client liest, was der
  Producer ohnehin veröffentlicht. Der Absatz bleibt als Notiz stehen, falls der
  Umzug je wieder aufkommt.
* **Der Schalter.** `?repackrun=1` ist gebaut, der Default ist aus. Das Umlegen
  des Defaults UND das Abschalten der beiden Warm-Crons ist ein Schritt und
  Jans Freigabe (§31.12, „Noch offen").

## 31.8 Was vor dem Gate GBW12 zu messen ist — und was daraus wurde

* (a) Kaltstart-Erstbild mit `?repackrun=1` gegen den heutigen Stand, Desktop
  1440×900 und iPhone 12 Pro — darf nicht schlechter werden.
  ⇒ **erledigt, §31.17:** JSON-Abrufe vor dem ersten Bild 3 → 1, 0 GRIB, Konsole
  sauber, auf beiden Größen; der Rückfallweg holt exakt das, was er vorher holte.
* (b) Der angezeigte Lauf über mindestens drei Zyklen: wie weit hinkt der
  Index-Lauf dem DWD-Lauf nach, und wie oft?
  ⇒ **erledigt, §31.18** — rückwirkend über **24 Zyklen** statt über neun Stunden
  Warten. Der befürchtete Nachlauf existiert nicht, der Index-Weg ist ~15–30 min
  **früher** am neuen Lauf.
* (c) Netlify-Builds/Tag nach dem Abschalten der Crons (Ziel: 0 aus den Crons).
  ⇒ **erledigt, §31.16/§31.17:** nach dem Push fanden drei fällige Zeitplan-Läufe
  nicht statt, `main` blieb unverändert.
* (d) Netzwerk-Wasserfall: dass das Index-Gate keinen unnötigen Abruf erzeugt.
  ⇒ **erledigt, §31.15/§31.17** — und die erste Fassung der Behauptung war
  falsch (§31.13), was erst die Messung zeigte.

## 31.9 Sofortfix A — der Commit-SHA zählt nicht mehr als Änderung

**Befund.** Die beiden letzten Wind-Manifeste unterschieden sich in genau zwei
Feldern:

    "updatedAt": 2026-09-03T22:15:34.595Z  →  2026-09-03T23:38:01.150Z
    "commit":    0626976adc385d…           →  0eb686615d2172…

Sonst in nichts. Der Repack-Batch rechnet stündlich neu (V-BW-38) und pusht das
Ergebnis als neuen Commit; die Bilder sind dabei byte-gleich (BW-1-Determinismus).
`sameSection` verglich `a.commit === b.commit` und meldete deshalb „geändert" —
ein voller Netlify-Produktionsbuild für einen anderen Hex-String.

**Umgesetzt.** `sameSection` (`scripts/lib/repackManifest.mjs`) vergleicht nur
noch Lauf und Schrittzahl jeder Familie.

**Warum das gefahrlos ist.** Die URLs des Abschnitts sind commit-gepinnt und
unveränderlich; ein älterer SHA zeigt weiter auf dieselben Bytes. Genau darauf
verlässt sich `carryRepack` Fall 3 seit BW-3 („die Bilder liegen ja noch, der SHA
ist unveränderlich") — hier gilt dieselbe Annahme, nur bis zum nächsten Lauf statt
bis zum nächsten Tick, also höchstens ~3 h.

**Nachgemessen (2026-09-04), weil das Daten-Repo seinen Verlauf bei jedem Publish
stutzt** (`api.github.com/…/commits` liefert 10 erreichbare Commits, ältester
23:31:56Z — der Vorgänger `0626976` ist im Verlauf **nicht mehr erreichbar**):

    @0626976…/runs/2026090321/wind-000.png  → 200, 242 246 Bytes
    @0eb6866…/runs/2026090321/wind-000.png  → 200, 242 246 Bytes

Ein unerreichbarer Commit wird also weiter ausgeliefert (jsDelivr hält
commit-gepinnte Pfade, GitHub gibt das Objekt heraus). Das ist der Grund, die
Annahme auf einen Lauf zu begrenzen statt auf unbestimmte Zeit.

**Gemessene Wirkung — und eine Korrektur.** Ich hatte aus dem einen beobachteten
Paar auf „rund ein Drittel der Deploys" geschlossen. Über sieben Tage
ausgezählt sind es **11 von 85** Wind-Commits (13 %) und **0 von 136**
Grib-Commits. Der Fix trägt also ~11 Deploys/Woche, nicht ~70.

## 31.10 Sofortfix B — der `eps`-Abschnitt löst kein Umlegen mehr aus

Die Auszählung, die §31.9 relativiert hat, hat den eigentlichen Treiber gezeigt.
Was ändert sich je Grib-Commit (7 Tage, 136 Commits, jeweils gegen den Vorgänger)?

| Änderung | Commits | Anteil |
|---|---|---|
| nur der `eps`-Abschnitt | **46** | **34 %** |
| nur der Commit-SHA | 0 | 0 % |
| echte Client-Änderung (Lauf, Schritte, Repack-Lauf) | 90 | 66 % |

Der `eps`-Abschnitt ist ausdrücklich Doku/Ops — „der Abschnitt ist Doku/Ops —
**der Client liest ihn NICHT**, seine EPS-Lauf-Discovery bleibt der
Directory-Scan" (Phase T2b-3, Kopf von `scripts/warm-grib.mjs`). Ein Drittel
aller Produktionsbuilds entstand also für eine Information, die kein Browser
abruft.

**Umgesetzt.** Der Abschnitt wird nicht entfernt (Funktionserhalt), sondern
**fährt mit**: `advanceEps` bleibt unverändert und hält ihn frisch, aber ein
EPS-Advance allein löst kein Schreiben mehr aus. Sobald 2D oder der
Repack-Abschnitt ohnehin schreiben (2–3× je Lauf), geht der aktuelle Stand im
selben Commit mit raus. `EPS_FORCES_WRITE=1` stellt das alte Verhalten wieder
her (benannter Rückfallweg, Rule 2).

**Belegt am laufenden System** (live-Manifest von buscosun.com als Bestand,
Schreibziel im Scratch, DWD-Listings echt):

| Probe | Erwartet | Beobachtet |
|---|---|---|
| unverändertes Live-Manifest | Early-Exit | `Early-Exit: Manifest deckt 2D und EPS bereits vollständig ab.` |
| nur `eps` künstlich veraltet (je Param ein Step entfernt) | Early-Exit, kein Schreiben | `Early-Exit: nur der eps-Abschnitt hat sich bewegt — er fährt beim nächsten Umlegen mit (BW-12).` · `eps.t_2m` bleibt `[0,3]` |
| **Negativ-Kontrolle** dasselbe mit `EPS_FORCES_WRITE=1` | schreibt | `Manifest umgelegt …` · `eps.t_2m` → `[0,3,6]` |
| `eps` UND 2D veraltet | schreibt, `eps` fährt mit | `2D-Lauf … (neu) · EPS-Lauf … (neu)` · `t_2m` 24 → 25 Steps, `eps.t_2m` → `[0,3,6]` |

**Erwartete Gesamtwirkung beider Sofortfixe:** 57 der 221 Manifest-Commits
einer Woche entfallen (26 %) — von ~31 auf ~23 Deploys/Tag. Die restlichen 74 %
tragen echte Client-Information (neuer Lauf, neue Schritte, neuer Repack-Lauf)
und verschwinden erst mit dem Index-Weg (§31.6), der die Manifeste ganz
überflüssig macht.

## 31.11 Verifikation der Sofortfixe

* `npm run verify:warm-wind` **13/13**.
* `npm run verify:warm-budget` **30/30**.
* `verify:repack`: die Zusicherung „`sameSection` erkennt einen Commit-Wechsel"
  war die Spezifikation des alten Verhaltens und ist durch drei ersetzt —
  „ignoriert einen reinen Commit-Wechsel" plus zwei Negativ-Kontrollen
  (Lauf-Wechsel, Schrittzahl-Wechsel; letzterer zusätzlich für eine neue Familie
  weiter unten).
* Gegenprobe an den ECHTEN Manifesten aus dem Verlauf (22:15 und 23:38 des
  2026-09-03): `sameSection(w1.repack, w2.repack) === true` ⇒ genau der Deploy,
  der nichts trug, entsteht nicht mehr; beide Negativ-Kontrollen an denselben
  Daten halten.
**Gesamtstand der Phase (Sofortfixe + Index-Weg), zuletzt gelaufen 2026-09-04:**

| Verifier | Ergebnis |
|---|---|
| `verify:repack` | **321/321** (Stand nach dem Gate GBW12; 314/314 vor §31.14–§31.17) |
| `verify:warm-wind` | 13/13 |
| `verify:warm-budget` | 30/30 |
| `verify:health` | 20/20 |
| `verify:datenalter` | 54/54 |
| `verify:routing` | 105/105 |
| `npm run typecheck` / `build` | grün |
| Budget `totalJs` | 1089,7 / 1109,8 KB (keine Ratsche) |

Drei ✗ eines Zwischenlaufs waren **Altbestand**, kein Befund dieser Phase: die
Zusicherungen suchten Quelltext WÖRTLICH und passten nicht mehr, seit LE2/H7 dem
Bildabruf ein `priority` und dem CAPE-Aufruf ein fünftes Argument gibt und seit
LE1/H2 vor dem Manifest-Abruf der Frühstart steht. Die geprüften Eigenschaften
(Kopfzeilen → `rearm` → Körper; Preconnect vor dem Manifest; CAPE als GANZES)
waren nie verletzt — je einzeln nachgesehen und danach formunabhängig gefasst,
jede Reparatur mit Negativ-Kontrolle. Eine vierte ✗ gehörte dieser Phase: der
Wind-Zweig heißt seit dem Index-Gate `manifest?.repackRaw ?? null`; die
Zusicherung prüft jetzt, dass Lauf, Familie und Wunschliste durchgehen, statt den
Ausdruck wörtlich zu suchen.



## 31.12 Der Index-Weg, umgesetzt (default-off)

> **Nachtrag 2026-09-04:** der Schalter ist seit dem Gate GBW12 **default AN**
> (§31.16). Der Abschnitt beschreibt den Bauzustand bei der Fertigstellung; die
> `Noch offen`-Liste am Ende ist mit §31.14–§31.16 abgearbeitet.

Nicht der Umzug der Manifeste (§31.5/§31.6), sondern ihre Abschaffung: der
Client löst Lauf und Schritte aus dem Index des Daten-Repos auf, den er für den
Repack-Abschnitt ohnehin holt. Damit hat kein Warm-Cron mehr eine Aufgabe, die
einen Commit ins Site-Repo rechtfertigt.

**Warum das überhaupt geht — am 2026-09-04 gegen den Live-Index nachgesehen:**

    Index-Commit 0eb6866 · 4 Läufe
    wind         2026090321  13 Schritte (0…12)
    temp         2026090321  25 Schritte (0…24)
    gust         2026090321  25 Schritte (0…24)
    thunder      2026090321  13 Schritte (0…12)
    rotation     2026090321  12 Schritte (0…12)
    lightningfc  2026090321  12 Schritte (0…12)
    snowDepth    2026090321  25 Schritte (0…24)
    snowFresh    2026090321  24 Schritte (0…24)
    precip       2026090321  28 Schritte (0…27)
    cape         2026090321  28 Schritte (0…27)

Jeder Horizont ist exakt der Cap des zugehörigen Layers — dieselbe Gleichheit,
die `verify:repack` seit BW-6b je Familie prüft („Producer-Caps == Client-Caps").
Der Index sagt dem Client also alles, was `latest-grib.json`/`latest-wind.json`
ihm sagen.

**Gebaut.**

* `src/sources/repackSource.ts`: `newestRunFromIndex(index, family, now)` (rein,
  netzfrei) und `resolveRunFromRepackIndex(family, signal)` über den bestehenden
  60-s-Index-Cache — der Abschnitt, der gleich danach gebraucht wird, kostet
  deshalb **keinen** zweiten Abruf. Drei Regeln: nur Läufe mit nicht-leerer
  Schrittliste DIESER Familie; der jüngste gewinnt (Lauf-Kennung, nicht
  Array-Reihenfolge); Staleness-Guard wie beim Manifest (> 24 h alt oder > 2 h
  in der Zukunft ⇒ verworfen).
* `src/sources/iconD2Precip.ts`: `resolveLatestRun(param, signal, family?)` —
  additives drittes Argument. Mit Familie fragt ein INDEX-GATE vor dem
  Manifest-Gate; ohne Familie (`relhum_2m`, `clcl`) ist alles unverändert.
  Anders als das Manifest-Gate setzt es `sharedRun`: sonst löste ein Param ohne
  Familie per Rückwärtssuche womöglich einen anderen Lauf auf als die Layer
  daneben, und die Karte zeigte zwei Läufe nebeneinander.
* Aufrufstellen mit Familie: Temperatur (`temp`, 2×), Böen (`gust`), Gewitter
  (`thunder`), Blitz (`lightningfc`), Rotation (`rotation`), Schnee
  (`snowDepth`/`snowFresh` je Modus), Niederschlag (`precip`), CAPE (`cape`),
  Wind (`wind`) und der Vorwärmer in `MapView.tsx`.
* `src/wind/iconD2WindSource.ts`: dasselbe Gate vor `resolveWindRunFromManifest`.
  `usedManifest` heißt jetzt `usedShortcut` und deckt beide Abkürzungen — der
  Graceful-Degrade („keine Frames ⇒ einmal auf den Directory-Scan") gilt
  unverändert für Index UND Manifest.

**Rule 2: default-off.** `?repackrun=1` bzw. `localStorage.repackrun = '1'`
schaltet ein; ohne Flag ist der Client byte-identisch zu vorher. Rückfallkette
in jedem Fehlerfall unverändert: Index → Manifest → Directory-Scan.

**Der Fehler, den nur echte Daten gefunden haben (V-BW-51).** Die erste Fassung
las die Schrittliste des Index als Zahlen (`Number.isInteger`). Sie ist aber eine
Liste von OBJEKTEN — `{ step, file, bytes, … }`. Gegen synthetische Fixtures mit
Zahlen war alles grün; gegen den echten Index lieferte der Resolver für **jede**
Familie `null`, der Client wäre also stillschweigend auf dem alten Weg geblieben
und niemandem wäre etwas aufgefallen. Gefunden hat es ein Probelauf gegen
`index.json` vom CDN, nicht der Verifier. Konsequenz: die Fixtures tragen jetzt
die echte Form, **und** es gibt eine Zusicherung gegen den echten Publisher-Baum.

**Was sich für den Nutzer ändert, wenn Jan den Schalter umlegt:** der angezeigte
Lauf ist der neueste REPACKTE statt der neueste beim DWD publizierte. Hinkt der
Producer, bleibt die Karte auf dem vorherigen Lauf, statt auf frisches GRIB
umzuschwenken — ältere Daten, dafür kein GRIB-Egress über Netlify. Der Lauf steht
in der UI, wird also nicht verschwiegen. Gemessen am 2026-09-03 war der Abstand
gering: `latest-wind.json` nannte 21z um 22:15:35 UTC (Lauf + 76 min) und trug im
SELBEN Commit schon den Repack-Abschnitt für 21z — der Index war an diesem Zyklus
nicht langsamer. Beim Lauf davor (18z) lag das Manifest 22 min vorn (18:50 ohne
Abschnitt, 19:13 mit) — und genau in diesen 22 min lud der Client Wind-GRIB über
Netlify.

**Noch offen (bewusst, nicht vergessen):**

1. Der Schalter ist aus — die Phase spart heute noch keinen einzigen Deploy. Das
   Umlegen des Defaults und das Abschalten der beiden Crons ist **ein** Schritt
   und gehört an ein Gate mit Browser-Beleg (Kaltstart Desktop + Mobile, Lauf-
   Anzeige, Konsole, Netzwerk-Wasserfall) — Jans Freigabe.
2. Erst danach dürfen `warm-grib.yml`/`warm-wind.yml` weg. Die Manifeste selbst
   bleiben als eingefrorene dritte Quelle liegen (der 24-h-Staleness-Guard
   verwirft sie von allein).
3. `verify:health`/`verify:datenalter` prüfen die Manifest-Frische — sie messen
   nach dem Umlegen etwas, das niemand mehr benutzt. Mitziehen, wenn der Default
   fällt.


## 31.13 Im Browser gemessen (Dev-Server :5211, Playwright, Desktop 1440×900, 2026-09-04 00:34–00:36 UTC)

Zwei Kaltstarts derselben Seite (`/wetterkarte`), einzige Änderung der Schalter.
Chrome-DevTools-MCP war durch den bekannten Profilkonflikt blockiert, daher
Playwright.

| | `?repackrun=0` (Kontrolle) | `?repackrun=1` |
|---|---|---|
| aufgelöster Lauf | **2026090318** | **2026090321** |
| Anzeige in der UI | „Lauf 18z · vor 6 h" | „Lauf 21z · vor 3 h" |
| Repack-Commit der Bilder | `bfc9c1b` | `0eb6866` |
| CDN-JSON-Abrufe | **0** | **2** (`index.json`, `runs/2026090321/index.json`) |
| Manifest-Abrufe | 3 | 2 |
| GRIB über `/_dwd_*` | 0 | **0** |
| Konsole | 0 Fehler, 0 Warnungen | 0 Fehler, 0 Warnungen |

**Was das belegt.** Der Index-Weg löst auf, lädt die Bilder derselben Familien
vom CDN und kommt ohne ein einziges GRIB-Byte aus; die UI nennt den Lauf
korrekt; die Rückfallkette funktioniert in beide Richtungen (der Schalter auf
`0` liefert exakt das alte Verhalten).

**Was das NICHT belegt — die ehrliche Einschränkung.** Der Vorsprung von drei
Stunden ist ein Artefakt der Dev-Umgebung: same-origin liegt dort die
**committete** `public/latest-grib.json` des lokalen Arbeitsverzeichnisses
(Stand 18z), nicht das live deployte Manifest (das zur Messzeit ebenfalls auf 21z
stand, §31.9). In Produktion nennen beide Wege denselben Lauf; der Unterschied
ist der Auslieferungsweg, nicht die Frische. Der Lauf zeigt hier nur, dass der
Index-Weg auch dann greift, wenn das Manifest hinterherhinkt — nicht, dass er
generell drei Stunden voraus wäre.

**Eine Korrektur an meiner eigenen Behauptung.** Ich hatte notiert, das
Index-Gate koste „keinen zusätzlichen Abruf". Gemessen: ohne Flag **0**
CDN-JSON-Abrufe, mit Flag **2**. Richtig ist die engere Aussage: es kostet
keinen **zweiten Index**-Abruf, weil Lauf-Auflösung und Abschnitt sich dasselbe
60-s-Promise teilen. Solange die Manifeste noch liegen und ihr Abschnitt alles
abdeckt, wird der Index heute gar nicht geholt (BW-10 §29.3) — der Index-Weg ist
in diesem Übergangszustand also ein Zukauf von 2 Abrufen (BW-10 maß Zeiger 29 KB
+ Index 116 KB ≈ 0,94 s vor dem ersten Bild). Ohne die Manifeste ist er die
einzige Quelle, und die Rechnung dreht sich. Die Kommentare in
`repackSource.ts`/`iconD2WindSource.ts` sind entsprechend berichtigt.

Der Zeiger-Abruf ist dabei vermeidbar — s. V-BW-52.


## 31.14 Gate GBW12 — die Umstellung (2026-09-04, Jans „starte jetzt 2 und 3")

Jans Auftrag: V-BW-52 bauen und danach umstellen — **ohne** das Beobachtungsfenster
aus §31.8 abzuwarten („das wird schon alles laufen").

**Was damit ungemessen bleibt, ausdrücklich:**

* (b) Wie weit der Index-Lauf dem DWD-Lauf über drei Zyklen nachhinkt. Belegt ist
  nur ein Zyklus-Paar aus §31.12: am 2026-09-03 lag der Index für 21z gleichauf
  mit dem Manifest, für 18z war das Manifest 22 min voraus. Ein systematischer
  Nachlauf über den Tag ist damit **nicht ausgeschlossen**.
* (c) Die tatsächliche Deploy-Zahl nach der Umstellung. Sie ist jetzt allerdings
  trivial vorhersagbar: die Zeitpläne beider Crons sind still, also entstehen aus
  ihnen **null** Commits und **null** Builds.

**Warum das Risiko trotzdem klein ist.** Fällt der Producer aus, greift eine
Kette, die vollständig aus vorhandenen, geprüften Teilen besteht:
Index älter als 24 h ⇒ Staleness-Guard verwirft ihn ⇒ Manifest-Resolver (die
eingefrorenen Dateien liegen weiter im Site-Repo) ⇒ nach dessen eigenem
24-h-Guard der Directory-Scan gegen den DWD. Der schlimmste Fall ist also der
Zustand von vor T1: langsamer Kaltstart, korrekte Daten. Und die Anzeige schweigt
dabei nicht (§31.16, Gesundheitsanzeige).

**Eine Folge, die man kennen muss** (und die Messung (b) beziffert hätte): der
Lauf hängt jetzt an `@main/index.json`. BW-9 §28.9 hat gemessen, dass der
jsDelivr-**Origin** einen Branch-Pfad trotz Purge minutenlang alt ausliefern
kann — dafür wurde damals der Zeiger `runs/<run>/index.json` eingeführt. Der
Zeiger hilft hier nicht: er ist ein Pfad, den man erst kennt, wenn man den Lauf
schon kennt. Der Laufwechsel kann sich also um die Origin-Trägheit verzögern,
zusätzlich zur Producer-Zeit.

Ins Verhältnis gesetzt: der Weg, den er ersetzt, hing an Cron-Slot + Netlify-Build
— gemessen 5–21 min (§28.2), plus bis zu 15 min Slot-Wartezeit.

> **Nachgetragen (§31.18):** über 24 Zyklen gemessen ist die neue Kette nicht nur
> wahrscheinlich, sondern **belegt** kürzer — der Index führt den neuen Lauf ab
> ≈ Lauf + 69 min, der alte Weg trug ihn im Median erst bei Lauf + 80,5 min, und
> darauf kam noch der Build. Die Origin-Trägheit selbst ist in §31.19 gemessen:
> ≤ 1,1 min, und zwar im ungünstigen Fall einer 4,4 h alten Cache-Kopie.


## 31.15 V-BW-52 umgesetzt — der Zeiger-Abruf entfällt

**Befund aus §31.13:** der Index-Weg kostete 2 CDN-JSON-Abrufe (Index + Zeiger),
wo der Manifest-Weg 0 kostete. Der Zeiger war davon überflüssig: kommt der Lauf
aus dem Index, ist per Konstruktion belegt, dass genau dieses Dokument ihn führt.

**Gebaut.** `warmCdnIndex()` liefert das Index-Promise **nur**, wenn es im
laufenden 60-s-Fenster ohnehin schon geholt wurde, und löst selbst keinen Abruf
aus. `resolveRepackSection` fragt es in der `wanted`-Variante vor dem Zeiger.
Deckt es die Wunschliste, ist Schluss; deckt es sie nicht, läuft die BW-9-Kette
(Zeiger → Index → Manifest) unverändert weiter. **Die Naht kann nur sparen, nie
verschlechtern** — ohne vorgeholten Index verhält sich der Aufruf byte-identisch
zu vorher, weil `warmCdnIndex()` dann `null` liefert.

Wichtig für das Verständnis der BW-9-Regel: sie bleibt gültig. Der Zeiger ist
dort die *frischere* Quelle für einen Lauf, den man aus einer ANDEREN Quelle
kennt (dem Manifest). Kennt man den Lauf aus dem Index selbst, kann der Zeiger
per Definition nichts Neues sagen.

**Geprüft am Verhalten, nicht am Text** (`verify:repack`, echter Publisher-Baum
als Antwort, Abruf-URLs gezählt, Referenzzeit auf „vor 2 h" gestellt, damit der
Staleness-Guard das Fixture nicht zu Recht verwirft):

| Probe | Erwartet | Ergebnis |
|---|---|---|
| Lauf aus dem Index, dann Abschnitt | kein Zeiger-Abruf | ✓ |
| **Negativ-Kontrolle:** Cache geleert, dann Abschnitt | Zeiger wird geholt | ✓ |

## 31.16 Default umgelegt, Crons still — und was mitziehen musste

**1. Der Schalter ist an.** `repackrun` ist default AN; `?repackrun=0` (bzw.
`localStorage.repackrun = '0'`) ist der benannte Rückfallweg und stellt die alte
Kette wieder her. Die Fassung des Schalters ist von `repackSource.ts` nach
`liveManifest.ts` gewandert — dorthin, wo sie abhängigkeitsfrei ist, weil auch
der Router-Chunk sie braucht; `repackSource` reicht sie nur durch. Zwei Kopien
derselben Flag-Logik wären genau die Drift, die man später sucht, deshalb prüft
`verify:repack`, dass beide Namen auf dieselbe Funktion zeigen.

**2. Beide Warm-Crons sind still.** In `warm-grib.yml` und `warm-wind.yml` ist
der `schedule:`-Block auskommentiert, `workflow_dispatch` bleibt. **Nicht
gelöscht** — ein Handlauf kann die Manifeste jederzeit wieder auffrischen, falls
der Rückfallweg gebraucht wird. `verify:repack` hält das als Invariante fest:
*Index-Weg default an ⇒ kein Warm-Cron im Zeitplan*, mit einer Negativ-Kontrolle
für die Erkennung selbst und einer Zusicherung, dass beide Dateien noch da und
per Hand auslösbar sind.

**3. V-BW-53: der Manifest-Frühstart schweigt.** `warmLiveManifest` ist ein No-op,
solange der Index-Weg läuft — sonst wären es zwei Abrufe für Dateien, die niemand
liest. Geprüft am Verhalten mit gefälschtem `window` (ohne DOM liefert
`repackRunEnabled()` immer `false`, deshalb bleiben die Frühstart-Zusicherungen
in `verify:routing` unberührt). Preis, ehrlich benannt: fällt der Index zur
Laufzeit aus, holt der Verbraucher das Manifest selbst — ohne den ~1,5-s-Vorsprung
aus LE1/H2.

**4. Die Gesundheitsanzeige zeigt jetzt auf den Index.** Das war die Stelle, an
der die Umstellung still kaputtgegangen wäre: „Schnellzugriff" (V-20) meldete den
Zustand der Warm-Manifeste. Werden die nicht mehr gelesen, meldet niemand mehr
etwas — der Zustand bliebe `unknown`, und `unknown` erzeugt bewusst keine Zeile.
Ein eingefrorener Producer wäre damit **unsichtbar** geworden, und das verstößt
gegen das Ehrlichkeitsprinzip.

Deshalb meldet `resolveRunFromRepackIndex` jetzt selbst — und zwar **nur im
Erfolgsfall**. Das ist kein Detail: meldete der Index auch sein Scheitern, stünde
bei funktionierendem Rückfallweg (Index kaputt, Manifest gesund) ein Alarm auf
der Karte, weil `getManifestHealth()` den schlechtesten Zustand nimmt. So bleibt
der Manifest-Resolver der Alarmgeber, und der Index sagt nur, wie frisch er ist.

Frischemaß ist die Referenzzeit des jüngsten repackten Laufs. Sie pendelt im
Normalbetrieb zwischen ~1,5 h und ~4,5 h; `MANIFEST_STALE_H` = 6 h schlägt also
genau dann an, wenn ein ganzer 3-h-Zyklus ausgefallen ist — und dann zeigt die
Karte tatsächlich einen alten Lauf. Die zwei Tooltips in `MapView.tsx` sagen
nicht mehr „Warm-Manifest", sondern „Schnellzugriff"; welches Dokument gemeint
ist, stand ohnehin schon in `sources`.


## 31.17 Zwei Reste, die erst der laufende Browser gezeigt hat

Nach V-BW-52 und V-BW-53 war der Kaltstart im Netzwerk-Wasserfall fast leer —
und genau in diesem „fast" steckten zwei Befunde, die keine Zusicherung gefunden
hätte, weil beide korrektes Verhalten einzelner Bausteine sind und erst im
Zusammenspiel falsch werden.

### (1) Das eingefrorene Manifest wurde weiter abgeholt

Übrig blieb ein Abruf: `/latest-grib.json`. Herkunft war `resolveRepackForRun`,
das den Manifest-Abschnitt **immer zuerst** liest, bevor `resolveRepackSection`
überhaupt zum Zug kommt — sinnvoll, solange das Manifest die billigste Quelle
war (BW-10 §29.3). Seit dem Gate GBW12 ist es eine eingefrorene Datei: ~30 KB
same-origin je Kaltstart für eine Auskunft, die schon im Speicher liegt.

**Gebaut:** `resolveRepackForRun` fragt zuerst den bereits geholten Index
(`warmCdnIndex`, kein Abruf) und liest das Manifest nur, wenn der die
Wunschliste nicht deckt. Der Rückfallweg ist unberührt.

**Ergebnis am Dev-Server** (Wetterkarte kalt, Desktop 1440×900):

| | vorher (BW-10) | nach dem Gate |
|---|---|---|
| Manifest-Abrufe (Frühstart + Bedarf) | 3 | **0** |
| CDN-JSON (Index + Zeiger) | 0–2 | **1** |
| GRIB über `/_dwd_*` | 0 | **0** |
| **JSON-Abrufe gesamt vor dem ersten Bild** | **3** | **1** |

### (2) Ein abgebrochener Abruf schlug Fehlalarm

Die Karte zeigte „**Schnellzugriff nicht aktuell — Daten kommen direkt von der
Quelle**", während jedes Bild vom CDN kam. Der Tooltip nannte die Quelle:
`/latest-wind.json`.

Ursache: `resolveWindRunFromManifest` fängt jeden Fehler und meldet `absent` —
**auch einen Abbruch**. Die Karte bricht Loader beim Neuaufbau routinemäßig ab.
Bis BW-12 heilte sich das selbst, weil der nächste, erfolgreiche Versuch
DENSELBEN Schlüssel (`/latest-wind.json`) mit `fresh` überschrieb. Seit der Lauf
aus dem Index kommt, meldet der Erfolgsfall unter einem ANDEREN Schlüssel — und
der Fehlalarm des abgebrochenen Versuchs blieb für immer stehen.

Das ist die Sorte Fehler, die eine Ehrlichkeits-Anzeige wertlos macht: sie warnt,
wenn nichts ist. Zwei Nähte, jede für sich nötig:

* **Abbruch ist kein Befund.** Der `catch` unterscheidet jetzt: `signal.aborted`
  oder `AbortError` ⇒ `null` ohne Meldung; alles andere weiter `absent`.
* **Primäre Quelle entscheidet.** `reportManifest` kennt ein viertes Argument
  `primary`; `getManifestHealth` wertet **nur** die primären Einträge, sobald es
  welche gibt. Ohne diese Regel wäre der Fehlalarm ohnehin zurückgekommen: die
  Manifeste sind eingefroren und laufen zwangsläufig aus ihrem 24-h-Guard; die
  Params ohne Repack-Familie (`relhum_2m`, `clcl`) befragen sie weiterhin und
  meldeten ab dem zweiten Tag dauerhaft `absent`. Fällt der primäre Weg aus,
  meldet er gar nichts (`resolveRunFromRepackIndex` meldet nur den Erfolgsfall)
  — dann greift automatisch wieder die alte Regel über die Manifeste, und deren
  Befund ist dann auch der richtige.

**Nachgeprüft, Desktop 1440×900 und iPhone 12 Pro 390×844:**

| Probe | Lauf | JSON-Abrufe | GRIB | Schnellzugriff-Zeile | Konsole |
|---|---|---|---|---|---|
| Desktop, Index-Weg | 06z · vor 2 h | 1 (Index) | 0 | **keine** | 0 Fehler / 0 Warnungen |
| Mobil 390×844, Index-Weg | — (Layout) | 1 (Index) | 0 | keine | 0 Fehler / 0 Warnungen |
| Desktop, `?repackrun=0` | 06z · vor 2 h | 3 (Manifeste) | 0 | keine | 0 Fehler / 0 Warnungen |

Der Rückfallweg holt also wieder genau das, was er vorher holte — Frühstart
inklusive —, und liefert denselben Lauf. Vorher, mit dem Fehlalarm noch drin,
stand in derselben Zeile „Schnellzugriff nicht aktuell (/latest-wind.json)"; das
ist die Negativ-Kontrolle zu dieser Naht, an der echten Seite beobachtet.

**Lehre (V-BW-54):** Wird eine Quelle durch eine andere ersetzt, muss die
Gesundheitsanzeige mitwandern. Sonst passiert eines von beiden — sie schweigt
über den neuen Weg (Ausfall unsichtbar) oder sie alarmiert über den alten
(Rauschen). Beides ist schlimmer als vorher.


## 31.18 §31.8 (b) nachgemessen — rückwirkend statt abgewartet

Die offene Frage war: **hinkt der Index-Lauf dem DWD-Lauf systematisch nach?**
Sie braucht kein Beobachtungsfenster. Beide Seiten sind rückwirkend ablesbar:

* Das DWD-Verzeichnis `icon-d2/grib/<HH>/<param>/` trägt je Datei einen
  Zeitstempel und wird nur **einmal pro Tag** überschrieben — die letzten acht
  Zyklen liegen also gleichzeitig vor.
* Wann der Repack-Batch fertig war, steht in den Actions-Läufen von
  `buscosun-data` (öffentlich).
* Wann das alte Manifest einen Lauf zuerst nannte — und wann es ihn **mit**
  Repack-Abschnitt nannte —, steht im Git-Verlauf dieses Repos.

Gemessen `regular-lat-lon` (nicht `icosahedral`: das liegt ~7 min früher und hat
in §28.1 schon einmal eine Messung verdorben).

**DWD, 8 Zyklen (2026-09-03 09z … 2026-09-04 06z):**

| | Schritt 004 (Manifest-Gate `NEAR_REQUIRED`) | Schritt 027 (letzter, den der Repack braucht) |
|---|---|---|
| Lauf + | **50–51 min** | **67–68 min** |

Die Streuung über acht Zyklen ist **eine Minute**. Das DWD ist hier keine
Fehlerquelle.

**Repack-Batch** (Actions `build`, erfolgreiche Läufe): 01:08, 04:08, 07:07 UTC
gegen DWD-027 um 01:07, 04:06, 07:06 — der Batch landet **1–2 min** nach der
letzten Datei, die er braucht. Die BW-9-Vorverlegung des Slots auf Lauf + 20
(§28.10) wirkt also wie beabsichtigt.

⇒ **Der Index führt den neuen Lauf ab ≈ Lauf + 69 min**, plus die Ausbreitung
nach jsDelivr (§28.10: 1–4 min).

**Der alte Weg, 24 Zyklen aus dem Git-Verlauf** (`latest-grib.json`, wann das
Manifest den Lauf zuerst nannte, und wann es ihn mit passendem Repack-Abschnitt
trug — erst dann zeigt die Karte den neuen Lauf auf PNGs):

| | Median | Spanne |
|---|---|---|
| Manifest nennt den Lauf | Lauf + 75,5 min | 50 … 105 min |
| Manifest **mit** Repack-Abschnitt | **Lauf + 80,5 min** | 74 … 158 min |

Dazu kam der Netlify-Build (§28.2: 5–21 min), bevor ein Browser etwas davon sah.

**Ergebnis: der befürchtete Nachlauf existiert nicht — es ist umgekehrt.**

| Weg | Neuer Lauf auf PNGs sichtbar |
|---|---|
| alt (Manifest + Cron + Build) | ≈ Lauf + 86 … 102 min (Median + Build) |
| **neu (Index)** | **≈ Lauf + 70 … 74 min** |

Der Grund ist strukturell, nicht zufällig: das Manifest musste auf **denselben**
Repack-Abschnitt warten wie der Index — es konnte ihn nur später erfahren
(Cron-Slot) und noch später ausliefern (Build). Die zwei Ausreißer der alten
Spalte (158 min, 105 min) haben keine Entsprechung im neuen Weg, weil dort keine
zweite Kette dazwischenhängt.

**Was die Zahlen NICHT sagen.** Sie messen die Kette bis jsDelivr, nicht die
Trägheit des jsDelivr-**Origins** bei einem frisch gepushten Branch-Pfad
(BW-9 §28.9). Eine Stichprobe 2 h nach dem Push zeigte `@main/index.json` korrekt
auf dem Stand des 06z-Laufs (`8d9dfdc`, committet 07:07:06Z) — das belegt
Korrektheit, nicht die Ausbreitungszeit. **Nachgemessen in §31.19: ≤ 1,1 min.**

**Nebenbefund, der die alte Entscheidung bestätigt:** in **12 der 24 Zyklen** nannte
das Manifest den neuen Lauf **ohne** Abschnitt und bekam ihn erst 21–83 min
später (Median 29 min). Genau in diesem Fenster lud der Client GRIB über Netlify — der
teuerste Zustand des Systems, und der neue Weg kennt ihn nicht mehr.


## 31.19 Die Ausbreitung Repo → jsDelivr, gemessen — und ein Zwischenfall am selben Tag

### Die Zahl, die noch fehlte

Die letzte offene Behauptung war die Trägheit des jsDelivr-**Origins** für
`@main/index.json` (BW-9 §28.9). Gemessen am Publikationsfenster des 09z-Laufs,
am **baren** Pfad (ein Stempel erzeugte einen neuen Cache-Schlüssel und umginge
genau das, was zu messen ist):

    11:32:13Z  Daten-Repo: „index: 2026090409 → 51e9d2e"
    11:33:18Z  jsDelivr @main/index.json führt 2026090409 (@51e9d2e)
    ⇒ Ausbreitung ≤ 1,1 min (Poll-Auflösung 2 min)

Der Fall ist der ungünstige: die Datei hatte sich **4,4 h nicht geändert**, der
Origin hielt also eine alte Kopie — genau die Konstellation aus §28.9. Sie
propagierte trotzdem in gut einer Minute. Das Restrisiko aus §31.14 ist damit
gemessen und klein; es bleibt **eine** Stichprobe, keine Verteilung.

### Der Zwischenfall: der 09z-Lauf kam 84 min zu spät

Dieselbe Sonde deckte auf, warum sie eine Stunde lang nichts sah.

| Zeit (UTC) | Ereignis |
|---|---|
| 10:06:32 | DWD legt 09z Schritt 027 ab — **pünktlich**, wie an allen 24 Zyklen |
| 09:30:42 → 10:07:19 | Producer-Lauf `build`: Schritt **Repack** erfolgreich (wartet korrekt bis 10:06:58), Schritt **Publish** **fehlgeschlagen** nach 18 s |
| 11:30:58 → 11:32:34 | Sicherheitsnetz (`cron` Lauf + 150 min) greift, **erfolgreich** in 96 s |
| 11:33:18 | Lauf 09z am CDN sichtbar — bei **Lauf + 153 min** statt der üblichen ~69 |

**Das ist kein Fehler dieser Phase, und kein jsDelivr-Problem** — CDN und
Daten-Repo waren die ganze Zeit identisch, das CDN lieferte treu, was da war.
Es ist ein Producer-Fehler, und er war vorher genauso da. Was sich geändert hat,
ist seine **Sichtbarkeit**:

* **vorher:** das Manifest wäre trotzdem auf 09z gesprungen, und der Client hätte
  09z als GRIB über Netlify geladen — frischer Lauf, teurer Weg, Fehler unsichtbar.
* **jetzt:** die Karte bleibt auf 06z, bis der Producer nachzieht — älterer Lauf,
  kein Egress, Fehler sichtbar.

Genau der Kompromiss aus §31.14, live am ersten Tag. Die Karte hat dabei nie
gelogen: das Laufschild nannte durchgehend „Lauf 06z · vor N h". Die
Schnellzugriff-Zeile hätte um 12:00Z angeschlagen (6 h nach `runAt`); der
Producer war um 11:33Z wieder da, sie blieb also stumm — richtig, denn zu diesem
Zeitpunkt war nichts mehr zu melden.

**Was am Publish scheiterte, ist nicht bewiesen, aber eingegrenzt.** 18 Sekunden
in einem Schritt, der klont, schreibt und pusht, riecht nach der Push-Naht:
`scripts/publish-repack.mjs` macht **einen einzigen** `git push --force`, ohne
Wiederholung — während der Radar-Spiegel im selben Repo alle 1–2 min pusht
(RD0 nennt das „Force-Push-Rennen", RD1 entschärft es durch Terminwahl: „Push nie
ins Publikationsfenster"). Der 09z-Lauf lag durch die Warteschleife bei 10:07
**außerhalb** des geplanten Fensters — also mitten im Radar-Takt. Die Logs
brauchen ein Token, deshalb steht hier keine Ursache, sondern ein Verdacht mit
Zeitpunkt und Zeile.

**Empfehlung für die nächste Phase** (nicht in dieser gebaut — ein Thema, eine
Phase): dieselbe Kur wie T2c für die Warm-Crons — Push mit Wiederholung statt
einem Versuch. Das Muster liegt fertig in `.github/workflows/warm-grib.yml`
(sichern → auf den Remote-Tip zurücksetzen → drüberlegen → bis zu 3 Versuche).
Damit wäre der 09z-Lauf um 10:08 statt um 11:33 dagewesen.

### Ein handwerklicher Fehler an der Sonde selbst

Die erste Sonde pollte die GitHub-**API** alle 45 s und verbrannte damit das
Kontingent (60 Abrufe/Stunde ohne Token). Danach lief sie blind: `repoState()`
lieferte nur noch `null`, ein Push wäre nie erkannt worden. Die zweite Sonde
fasst die API nicht an — Push-Zeit aus dem Commit-Atom-Feed, Sichtbarkeit vom
CDN, 2-Minuten-Takt. **Eine Messsonde, die ihre eigene Quelle drosselt, misst
nichts** (V-BW-57).

## 31.20 V-Einträge

* **V-BW-46** — ein Auslieferungsweg kann eine Leistung überleben: beide
  Warm-Crons deployen seit dem 2026-08-23 für eine Wärmung, die es nicht mehr
  gibt. Wird eine Funktion zurückgezogen, gehört ihr Transportweg mit auf den
  Prüfstand.
* **V-BW-47** — die Kosten eines Mechanismus stehen nicht dort, wo er gebaut
  wird: der Cron ist gratis, der Commit-back kostet 930 Builds im Monat.
* **V-BW-48** — ein Abschnitt, den „nur die Ops liest", ist trotzdem teuer,
  wenn sein Transportweg ein Deploy ist: der `eps`-Abschnitt trieb 34 % aller
  Grib-Commits, obwohl kein Browser ihn abruft. Doku gehört ins Log des Jobs,
  nicht in die ausgelieferte Datei.
* **V-BW-49** — eine Hochrechnung aus EINEM beobachteten Paar ist keine
  Messung: „rund ein Drittel der Deploys sind nur ein Hex-String" wurde beim
  Auszählen über sieben Tage zu 13 % (Wind) bzw. 0 % (Grib). Erst die
  vollständige Auszählung fand den echten Treiber (§31.10).
* **V-BW-50** — der Index des Daten-Repos ist bereits ein Manifest: er nennt
  Lauf, Zeit und je Familie die Schritte, und die Producer-Caps sind mit den
  Client-Caps identisch. Ein zweites Manifest daneben zu committen war eine
  Doppelung, die zwei Crons und ~31 Deploys/Tag rechtfertigte.
* **V-BW-51** — **synthetische Fixtures müssen die echte Form tragen.** Der
  Index führt Schritte als Objekte `{ step, file, … }`; ein Resolver, der Zahlen
  erwartete, war gegen Zahlen-Fixtures grün und gegen die Wirklichkeit für jede
  Familie `null` — ein stiller Totalausfall, der nur deshalb auffiel, weil ein
  Probelauf gegen die echte `index.json` lief. Seither prüft `verify:repack`
  zusätzlich gegen den echten Publisher-Baum.
* **V-BW-52** — **der Zeiger-Abruf des Index-Wegs ist überflüssig.** Kommt der
  Lauf aus dem Index, ist per Konstruktion belegt, dass genau dieser Index den
  Lauf führt — der Abschnitt ließe sich aus dem bereits geholten Dokument lesen
  (`sectionFromIndex`), statt zuerst `runs/<run>/index.json` zu ziehen. Skizze:
  `resolveRepackSection` bekommt den schon aufgelösten Index als vierte Quelle
  gereicht und fragt ihn VOR dem Zeiger; die BW-9-Reihenfolge für den
  Manifest-Weg bleibt unangetastet. Ersparnis gemessen: 1 von 2 Abrufen, ~29 KB
  und ein RTT vor dem ersten Bild. Nicht in dieser Phase gebaut — sie ist schon
  groß genug, und der Weg ist default-off.
* **V-BW-53** — der Router startet die Live-Manifeste vor (`warmLiveManifest`,
  LE1/H2). Fällt der Manifest-Weg weg, ist dieser Frühstart zwei Abrufe für
  nichts. Mit dem Default-Umlegen mit entfernen.
* **V-BW-54** — wird eine Quelle durch eine andere ersetzt, muss die
  Gesundheitsanzeige mitwandern: sonst schweigt sie über den neuen Weg (Ausfall
  unsichtbar) oder alarmiert über den alten (Rauschen). Beides ist schlechter
  als vorher. Umgesetzt als `primary`-Regel in `manifestHealth` (§31.17).
* **V-BW-55** — ein **abgebrochener** Abruf ist kein Befund über seine Quelle.
  `resolveWindRunFromManifest` meldete jeden `catch` als `absent`, auch den
  AbortError eines neu aufgebauten Layers. Solange derselbe Schlüssel gleich
  darauf mit `fresh` überschrieben wurde, fiel es nicht auf — der Fehler war
  latent, seit es die Meldung gibt.
* **V-BW-56** — eine Frage nach dem *zeitlichen* Verhalten braucht nicht immer
  ein Beobachtungsfenster. DWD-Verzeichnisse tragen Dateizeitstempel und werden
  nur einmal täglich überschrieben, Actions-Läufe und Git-Verläufe sind
  öffentlich: §31.8 (b) war rückwirkend über 24 Zyklen zu beantworten statt über
  neun Stunden Warten — und die Antwort widerlegte die Befürchtung (§31.18).
* **V-BW-57** — eine Messsonde, die ihre eigene Quelle drosselt, misst nichts:
  45-s-Polling auf die GitHub-API (60 Abrufe/h ohne Token) machte die erste
  Sonde nach knapp einer Stunde blind. Push-Zeiten gibt es limitfrei aus
  `commits/main.atom`.
* **V-BW-58** — **`publish-repack.mjs` pusht genau einmal** (`git push --force`,
  ohne Wiederholung), während der Radar-Spiegel im selben Repo alle 1–2 min
  pusht. Am 2026-09-04 scheiterte der Publish des 09z-Laufs nach 18 s; das
  Sicherheitsnetz (Lauf + 150 min) reparierte es 84 min später. Fertiges Muster
  für die Kur: der Commit-back-Loop aus `warm-grib.yml` (T2c). Seit BW-12 ist
  ein solcher Aussetzer für den Nutzer sichtbar (älterer Lauf) statt teuer
  (GRIB über Netlify) — der Fehler ist damit dringender geworden, nicht neuer.


# 32 BW-13 — Der Windlayer kommt vollständig aus dem Daten-Repo (2026-09-04)

> **Auftrag (Jan):** „mir geht es darum, dass es warm gribs und latest wind
> deploys nicht mehr gibt und dass der Windlayer in der Wetterkarte komplett aus
> den Winddaten im buscosun-data Repo gebaut wird."

## 32.1 Was schon erfüllt war — und was nicht

Die Deploys waren mit dem Gate GBW12 (§31.16) erledigt: beide Zeitpläne still,
seit ~13 h null Cron-Commits. Und der Windlayer lud im Normalbetrieb bereits
ausschließlich PNGs aus dem Daten-Repo (§31.17: 1 JSON-Abruf, 0 GRIB).

Offen war das, was **darunter** noch stand: `/latest-wind.json` existierte weiter,
der Client konnte es lesen, der Router wärmte es vor, der Service Worker hatte
eine Regel dafür, ein Cron hätte es weiter schreiben können. Der Windlayer hing
also nicht mehr daran — aber er kannte es noch. Zwei Quellen für dieselbe
Auskunft sind eine Quelle zu viel: sie können sich widersprechen, und genau
gegen diesen Widerspruch stand seit BW-3 eigene Mechanik (Anti-Drift-Regel
§22.4, Staleness- und Horizont-Wächter im Wind-Resolver).

## 32.2 Warum genau eine Quelle reicht

Der Index des Daten-Repos nennt für die Familie `wind`:

* den **Lauf** (`run`, `runAt`) — geprüft gegen einen 24-h-Staleness-Guard,
* die **Schritte** 0…12 — exakt der Horizont dieses Layers (`MAX_STEP`, von
  `verify:repack` je Familie gegen die Producer-Caps geprüft),
* und die **Bytes** (`wind-NNN.png` samt `uMin/uMax/vMin/vMax` je Schritt).

Damit ist alles, was das Manifest je beitrug, in derselben Datei — und zwar in
der, aus der die Bilder ohnehin kommen. Lauf und Bild können nicht mehr
auseinanderlaufen, weil sie aus einem Dokument stammen.

## 32.3 Entfernt

| Was | Wo |
|---|---|
| `public/latest-wind.json` | gelöscht |
| `.github/workflows/warm-wind.yml` | gelöscht (sein Produkt gibt es nicht mehr) |
| `scripts/warm-wind.mjs`, `scripts/verify-warm-wind.mjs` | gelöscht, samt npm-Alias und CI-Schritt |
| `resolveWindRunFromManifest`, `WIND_MANIFEST_URL`, `MAX_MANIFEST_RUN_AGE_H` | `src/wind/iconD2WindSource.ts` |
| `WIND_MANIFEST_PATH` aus dem Frühstart-Plan | `src/router/prefetch.ts` |
| Wind-Zweig in `LIVE_RE` | `public/sw.js` |
| Wind-Eintrag der Gesundheitsüberwachung | `scripts/health-manifests.mjs` |
| `manifest: 'wind'` → `manifest: null` | `scripts/lib/repackManifest.mjs` |

## 32.4 Behalten — und warum

**Der Horizont-Guard.** Er hieß `manifestCoversNow` und prüfte, ob der letzte
Schritt eines Laufs überhaupt noch in der Zukunft liegt. Der Fall ist NICHT
manifest-spezifisch: auch ein Index-Lauf kann jung genug für den 24-h-Guard sein
und trotzdem keinen Schritt mehr für „jetzt" tragen — 00z mit 0…12 h endet um
12 UTC. Ohne ihn zeigte der Windlayer den letzten Frame als „jetzt", und der
Ausbreitungslayer im Brandradar (30-min-Schranke) fände für keine Stunde ein
Windfeld. Die Regel wandert also mit auf die neue Quelle und heißt seither
`runCoversNow`.

**Der Preconnect.** Er stand im Manifest-Resolver (BW-10 §29.3 Hebel 2) und wäre
mit ihm verschwunden. Er steht jetzt am Anfang von `fetchIconD2Wind` — und ist
dort sogar richtiger platziert: eine Karte, die NUR Wind zeigt, lief nie durch
`resolveLatestRun` und bekam den Preconnect deshalb nie.

**Der Notweg.** Directory-Scan gegen den DWD + GRIB über `/_dwd_wind` bleibt.
Er greift nur, wenn der Index gar nichts liefert oder alle Bilder scheitern —
also wenn jsDelivr ausfällt. Das ist kein Widerspruch zu „komplett aus dem
Repo": im Normalbetrieb wird er nicht berührt (gemessen unten). Ihn zu löschen
hieße, den Windlayer bei einem CDN-Ausfall **leer** zu lassen statt langsam; das
wäre Funktionsverlust ohne Gegenwert. Die Alternative steht als Frage offen.

## 32.5 Gemessen (Dev :5213, Playwright, Desktop 1440×900, 2026-09-04 20:53 UTC)

`/wetterkarte/wind`, Kaltstart. **Jeder** Abruf, der Daten holt:

    cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/index.json
    …@c7c88c9/runs/2026090418/wind-002.png
    …@c7c88c9/runs/2026090418/wind-003.png
    …@c7c88c9/hsurf-v1.png            (Temperatur-Layer)
    …@c7c88c9/runs/2026090418/temp-002.png
    …@c7c88c9/runs/2026090418/temp-003.png

| | |
|---|---|
| Abrufe an `/latest-wind.json` | **0** (die Datei gibt es nicht mehr) |
| Abrufe an `/latest-grib.json` | **0** |
| Abrufe an `/_dwd_wind` bzw. `/_dwd_opendata` | **0** |
| Anzeige | „Lauf 18z · vor 2 h" |
| Schnellzugriff-Zeile | keine |
| Konsole | 0 Fehler, 0 Warnungen |

Der Windlayer wird damit **vollständig** aus `buscosun-data` gebaut: eine Datei
nennt den Lauf, dieselbe Datei nennt die Bilder, und die Bilder kommen vom
selben Commit.

## 32.6 Verifikation

| Verifier | Ergebnis |
|---|---|
| `verify:repack` | **325/325** |
| `verify:routing` | 105/105 |
| `verify:health` | 20/20 |
| `verify:datenalter` | 54/54 |
| `verify:warm-budget` | 30/30 |
| `verify:layer-erstbild` | 37/37 |
| `typecheck` / `build` | grün |
| Budget `totalJs` | 1089,3 / 1109,8 KB (−0,4 KB) |

Neue bzw. umgestellte Zusicherungen in `verify:repack`:

* „Der Windlayer kennt kein Manifest mehr" — geprüft am MECHANISMUS, nicht an
  der Zeichenkette: erst Kommentare entfernen, dann nach `latest-wind.json`,
  `WIND_MANIFEST_URL`, `resolveWindRunFromManifest` und den beiden Importen
  (`liveManifest`, `manifestHealth`) suchen. Die erste Fassung suchte den Text
  roh und schlug an genau dem Kommentar fehl, der das Entfernen ERKLÄRT
  (V-BW-61) — mit Negativ-Kontrolle für den Kommentar-Entferner daneben.
* „`warm-wind.yml` und `latest-wind.json` sind WEG" — die drei gelöschten Dateien
  existieren nicht mehr.
* „Preconnect steht vor dem ersten CDN-Abruf — Wind (Index) wie Grib (Manifest)":
  die alte Zusicherung suchte den Manifest-Abruf des Windlayers; geprüft wird
  jetzt dieselbe Eigenschaft an der neuen Quelle.
* „Service Worker kennt das Live-Manifest — genau eines, und nur das": der frühere
  Wind-Pfad steht jetzt in der **Negativ-Liste**. Fasste die Regel ihn weiter,
  wäre das ein Rest, den die nächste Änderung wieder mitschleppt.
* „`latest-grib.json` bekommt alle Familien außer Wind; Wind hängt an keinem
  Manifest" — plus die Gegenprobe „… und der Index trägt Wind trotzdem", denn
  ohne die wäre die Zeile darüber auch dann grün, wenn der Windlayer gar keine
  Quelle mehr hätte.

## 32.7 Offen

* **Der Notweg (§32.4).** Er ist der einzige Rest, über den der Windlayer noch
  GRIB laden KANN. Streichen wäre die wörtliche Lesart von „komplett" — mit dem
  Preis, dass ein CDN-Ausfall den Layer leer statt langsam macht. Jans
  Entscheidung.
* **`relhum_2m`** (Feuerwetter im Brandradar) hat keine Repack-Familie und zieht
  1,08 MB je Schritt × 25 Schritte ≈ **27 MB roh über Netlify** je
  Kaltaktivierung. Das ist der letzte große Netlify-Posten unter den
  Wetter-Layern — eine eigene Phase (Familie im Producer ergänzen).
* **V-BW-58** (Publish-Race im Producer) ist mit BW-13 dringender geworden: für
  den Windlayer ist das Daten-Repo jetzt die einzige reguläre Quelle. Am
  2026-09-04 scheiterte der Publish dreimal (10:07, 16:07, 17:32), 15z fiel ganz
  aus, die Karte stand sechs Stunden auf 12z.

## 32.8 V-Einträge

* **V-BW-59** — wird eine von zwei Quellen abgeschafft, muss man die Wächter
  einzeln durchgehen: der Staleness-Guard war manifest-spezifisch (der Index hat
  seinen eigenen), der **Horizont-Guard nicht** — er hing nur zufällig am
  Manifest und wäre bei einem pauschalen Rückbau still verschwunden. Dasselbe
  gilt für den Preconnect, der im gelöschten Resolver stand.
* **V-BW-60** — eine Negativ-Liste ist die halbe Zusicherung: nach dem Entfernen
  eines Pfads muss die Regel, die ihn traf, ihn AKTIV nicht mehr treffen
  (`LIVE_RE`), sonst bleibt ein Rest, den niemand mehr bemerkt.
* **V-BW-61** — eine „das gibt es nicht mehr"-Zusicherung darf nicht nach dem
  Namen suchen: der Kommentar, der das Entfernen erklärt, enthält ihn
  zwangsläufig. Erst Kommentare entfernen, dann Bezeichner und Importe prüfen —
  und den Entferner selbst mit einer Negativ-Kontrolle absichern.
