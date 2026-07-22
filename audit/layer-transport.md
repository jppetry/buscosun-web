# audit/layer-transport.md — Diagnose & Spec: Phase T2 (Layer-Transport / Caching für alle ICON-D2-Layer)

**Art:** Reiner Transport-/Datenschicht-Umbau (kein UI, kein Shader, keine Fusion, **kein Decode-Eingriff**). Gate **GT2**. Oberste Direktive wie T1: **Output-Gleichheit** — alle Layer rendern nach dem Umbau numerisch/visuell identisch; es ändert sich nur, *woher* und *wie schnell* dieselben Bytes kommen.

**Auslöser:** Der Wind-Layer wurde in Phase T1 (`audit/wind-transport.md`) über einen Durable-Edge-Proxy + GitHub-Action-Warm-Cron + Manifest-Gate vom kritischen DWD-Pfad genommen. Jan will **dasselbe Muster auf alle Kartenlayer** ausrollen. T1 hatte das bereits als Folge-Phase T2 vorgemerkt („Muster auf Precip/Clouds/Temp/Gust ausweiten — Radar passt nicht").

> **Status:** Diagnose abgeschlossen (2 Code-Analysen gegen den Ist-Stand). Umsetzung offen — erfolgt separat über die Claude-Code-CLI. Prod-Deploy + Cron-Aktivierung = **Jans Gate** (GitHub-Creds/Repo-Var, wie bei T1).

---

## §A — Scope: welche Layer passen, welche nicht

| Layer | Quelle | Transport heute | Passt T2? | Grund |
|---|---|---|---|---|
| **Temp** | `sources/iconD2TempSource.ts` | ICON-D2 `t_2m` (+Invariante `hsurf`) `.grib2.bz2`, `/_dwd_opendata`, ~25 Dateien | ✅ **ja** | immutable per-(Lauf,Step) GRIB |
| **Gust** | `sources/iconD2GustSource.ts` | ICON-D2 `vmax_10m`, ~25 Dateien | ✅ **ja** | dito |
| **Precip** | `sources/iconD2Precip.ts` | ICON-D2 `tot_prec`, ~27 Dateien | ✅ **ja** | dito (nutzt schon `fetchStepBytes`) |
| **Clouds** | `sources/iconD2Clouds.ts` | ICON-D2 `clcl/clcm/clch`(+`clct`), ~13×3 Dateien | ✅ **ja** (multi-Param) | dito |
| **CAPE** (Punkt) | `sources/iconD2Cape.ts` | ICON-D2 `cape_ml` | ✅ optional | keine Karten-Ebene, gleiche Familie |
| Confidence | `scalar/confidenceImage.ts` | **kein eigener Fetch** (rechnet über Temp/Precip/Radar + `climaGrid.json`) | — | nichts zu cachen (erbt Transport der Inputs) |
| **Radar / Nowcast / PoP** | `sources/radolan.ts` (+INCA/MeteoSwiss) | RADOLAN-RV **1 Tar ~1,6 MB/Lauf**, `/_dwd_opendata`, eigener Cache `radolan-rv-tar-v1` | ❌ **nein** | **5-Min-Kadenz** (Warm-Cron liefe hinterher), Tar-Bündel statt per-Step-URLs, eigener Rewrite+Cache, Live-WMS-Blitze |
| Wind | `wind/iconD2WindSource.ts` | bereits `/_dwd_wind` + Manifest | — | in T1 erledigt |

**T2-Scope = Temp, Gust, Precip, Clouds** (+ CAPE optional). **Radar und Confidence ausdrücklich außerhalb.** Radar bekäme, falls je gewünscht, eine **eigene** Optimierung (kurzlebiger Tar-Cache/Nowcast-Prefetch) — anderer Track, nicht T2.

---

## §B — Wiederverwendbare Hebel (aus T1, verifiziert)

Der Umbau ist klein, weil die Mechanik schon existiert und nur **wind-only verdrahtet** ist:

1. **`fetchStepBytes(runStr, param, step, signal?, base)`** (`sources/iconD2Precip.ts:208`) — der `base`-Parameter ist der Generalisierungs-Seam. Wind übergibt `/_dwd_wind/...`; Temp/Gust/Precip/Clouds nutzen **dieselbe** Funktion mit Default-`base` (`/_dwd_opendata`). Einen Layer auf den schnellen Pfad zu heben = **eigenen `base` übergeben, kein Fetch-/Decode-Umbau.**
2. **Edge-Handler** `netlify/edge-functions/dwd-wind.ts` — `ALLOWED_PREFIX` ist **bereits** das generische `weather/nwp/icon-d2/grib/` (`:29`). Caching/Passthrough/Fail-Logik ist layer-agnostisch. Nur Route-Name (`/_dwd_wind`) ist wind-benannt.
3. **Manifest-Vertrag** `{run, runAt, steps, …}` + `resolveWindRunFromManifest` + **24h-Staleness-Guard** + **Directory-Scan-Fallback** — Schema/Validator übertragbar; nur die Manifest-URL + Multi-Param-Erweiterung ändern sich.
4. **Warm-Cron-Skelett** (poll→warm-durch-Proxy→atomares Manifest→commit-back) + Env (`SITE_URL`, `WARM_MAX_STEP`, `NEAR_REQUIRED`).
5. **Vite-Proxy-Map** (`vite.config.ts`) — eine Zeile pro Pfad.
6. **Refresh-Koordinator** `MapView.refreshIconD2Layers` (`:1460`) — **fächert bereits alle fünf ICON-D2-Layer** aus einem 30-Min-Intervall auf, löst den Lauf **1×** vorab auf. **Kein Umbau nötig.**

**Nicht übertragbar (wind-spezifisch):** Zwei-Parameter-Vollständigkeit (u+v), der eine globale IndexedDB-Key (setzt ortsunabhängiges Grid voraus — gilt für Temp/Precip/Clouds/Gust zwar auch, ist aber separater Hebel, s. §D T2-7), das spekulative Lauf-Raten (ICON-D2-Publikationslag).

---

## §C — Umsetzungs-Spezifikation (für die CLI)

**T2-1 — Generische Edge-Route `/_dwd_grib/*`:** Neue Datei-basierte Edge Function `netlify/edge-functions/dwd-grib.ts` (Kopie von `dwd-wind.ts`, identische Cache-Header + `ALLOWED_PREFIX weather/nwp/icon-d2/grib/` + `.grib2.bz2`-Suffix). **Additiv** — `/_dwd_opendata` (Radar) und `/_dwd_wind` (Wind) **unangetastet**. (Optional später: Wind auf `/_dwd_grib` migrieren und `/_dwd_wind` einstampfen — **nicht** in T2, um den funktionierenden Wind-Pfad nicht anzufassen.)

**T2-2 — Layer durch den Proxy routen:** In `iconD2TempSource.ts`, `iconD2GustSource.ts`, `iconD2Clouds.ts` und dem Precip-Pfad je einen `base = GRIB_BASE = '/_dwd_grib/weather/nwp/icon-d2/grib'` an `fetchStepField`/`fetchStepBytes` durchreichen (analog Wind, `iconD2WindSource.ts:264`). **Kein** Decode-/Norm-/Shader-Eingriff. Temp braucht zusätzlich `hsurf` (Invariante) über denselben Base.

**T2-3 — Kombiniertes Manifest `public/latest-grib.json`:** Ein Manifest für **alle** T2-Params (alle teilen denselben ICON-D2-Lauf): `{run, runAt, updatedAt, warmedThroughProxy, params: { t_2m:[steps], vmax_10m:[…], tot_prec:[…], clcl:[…], clcm:[…], clch:[…], clct:[…] }}`. Client-Resolver `resolveWindRunFromManifest` zu einem geteilten `resolveRunFromManifest(url, param)` generalisieren (gleicher 24h-Guard + Scan-Fallback pro Layer). **Wichtig:** Step-Caps unterscheiden sich (Temp/Gust 24, Precip 27, Clouds 12) und Clouds ist multi-Param → Manifest **per-Param**. Wind behält sein eigenes `latest-wind.json` (nicht anfassen).

**T2-4 — Warm-Cron generalisieren:** `scripts/warm-grib.mjs` (aus `warm-wind.mjs` abgeleitet): pollt den ICON-D2-Lauf, warmt **alle T2-Params** durch `/_dwd_grib` bis zum jeweiligen Karten-Step-Cap, Near-Horizon als Fail-Safe-Gate, atomarer Write `latest-grib.json`, commit-back. Neuer Workflow `.github/workflows/warm-grib.yml` (`schedule` + `workflow_dispatch`, `SITE_URL`-Repo-Var, `permissions: contents:write`, `concurrency`). **Kosten-Hinweis:** ~100–135 Dateien/Lauf statt Winds ~10 — aber Commit-back nur pro **neuem Lauf** (~8/Tag, Early-Exit dazwischen), also Rebuild-Frequenz unverändert. Sequenzielles Warmen ggf. parallelisieren (im 15-Min-Fenster unkritisch).

**T2-5 — Vite-Dev-Proxy:** `/_dwd_grib`-Eintrag in die `upstreamProxy`-Map in `vite.config.ts` (eine Zeile, wie `/_dwd_wind`).

**T2-6 — Verifier:** `scripts/verify-layer-transport.mjs` (Node strip-types, **kein Vitest**, importiert den Edge-Handler direkt): Bytes SHA-256-identisch direkt-vs-Proxy **je Param**, Durable-Header vorhanden, Pfad-Whitelist-Rejection, fehlender Step = `no-store` (nie durable gecacht). Optional in `package.json` als `verify:layer-transport`.

**T2-7 (optional, sekundär) — Per-Layer-IndexedDB-„now"-Cache:** Temp/Precip/Clouds/Gust-Grids sind wie Wind **ortsunabhängig** (feste ICON-D2-DACH-Domäne) → der Raw-RGBA-IndexedDB-Now-Cache (`buscosun-wind`-Muster) ließe sich pro Layer nachbauen (versionierter Key, 24h-Guard, `rgbaToCanvas`). **Nicht Kern von T2** (das war der GitHub-Action-/Edge-Win); als optionaler Zusatzhebel vermerkt, nur falls Real-Device einen First-Paint-Bedarf zeigt.

**Kein Umbau nötig:** Refresh-Koordinator (`refreshIconD2Layers` fächert die Layer schon auf), Grib-Worker-Pool, `fetchDecompressedCached`/Cache-API-Store `icon-d2-grib-decompressed-v1` (bleibt als Client-seitige zweite Ebene).

---

## §D — Harte Regeln / Abgrenzung
- **Output-identisch:** dieselben GRIB-Bytes, nur Herkunft/Latenz ändern sich. **Kein** Decode-/`fetchDecodeCached`-/Norm-/Shader-/Fusion-Eingriff.
- **Additiv:** neue Edge-Route + neues Manifest + neuer Workflow. `/_dwd_opendata` (Radar) und `/_dwd_wind` (Wind) **unverändert**. Radar/Confidence außerhalb.
- Kein STOPP-Gate nötig (Infra wie T1) — **aber** Prod-Deploy + Cron-Aktivierung sind **Jans Gate** (GitHub-Creds für Repo-Var `SITE_URL`; Branch-Protection auf `main` kann den Bot-Commit-back blocken — wie in T1 beachten).

## §E — Verifikation
Protokoll **V-TRANSPORT-2** in `tests.md`. Kernpunkte: Bytes je Param identisch (Proxy vs. direkt), Durable-Header, Manifest-Gate eliminiert Directory-Listings + spekulative Fehl-Fetches je Layer, Konsole sauber, `npm run typecheck` grün, `node scripts/verify-layer-transport.mjs` grün. **Latenz erst nach Netlify-Deploy belastbar** (Dev-Proxy nicht repräsentativ — wie T1 §B). 🔴 Prod-Gegencheck (Durable-Cache-`hit`-Header je Param) nach Deploy durch Jan.

## §F — Offene Entscheidungen (Empfehlungen)
1. **Kombiniertes vs. per-Layer-Manifest** → **empfohlen: eines** (`latest-grib.json`, alle Params teilen den Lauf). ✅ so umgesetzt.
2. **Wind in die generische Route/Manifest zusammenlegen** → **empfohlen: vertagen** (Wind-Pfad funktioniert, additiv bleiben). ✅ vertagt.
3. **Warm-Budget** → **empfohlen: jeden Param bis Karten-Step-Cap warmen** (bester Cross-User-Kaltstart; Cron-Kosten moderat). ✅ so umgesetzt.
4. **IndexedDB-Now-Cache (T2-7)** → **empfohlen: optional/vertagt**, Kern-T2 = Transport. ✅ vertagt.

---

## §G — Verify-Protokoll-Log (V-TRANSPORT-2, lokal, 2026-07-22)

_(L = lokal; N = Netlify-Deploy — bewusst zurückgestellt, Jans Gate, s. §D.)_

**Setup:** Vite-Dev `localhost:5196` (Referenzlauf ICON-D2 **2026072215** für Vorher UND
Nachher — identische Quellbytes); Edge-Handler zusätzlich als Node-22-Modul
(`scripts/verify-layer-transport.mjs`) gegen Live-DWD; Chrome DevTools MCP für Client/
Netzwerk (Cache-API `icon-d2-grib-decompressed-v1` vor jedem Kaltlauf geleert,
Resource-Timing-Buffer 8000). Latenz-Caveat wie T1: Dev-Proxy ≠ Prod-Edge; lokal zählt
die **Struktur** (Anzahl/Art der Requests), Latenz erst nach Deploy (🔴 N).

- **G.1 Bytes identisch je Param (Verifier grün):** `node scripts/verify-layer-transport.mjs`
  → für **t_2m, vmax_10m, tot_prec, clcl, clcm, clch, clct + hsurf** Länge & **SHA-256
  identisch** (Direkt-DWD vs. Edge-Handler), alle 43 Checks grün. ✓
- **G.2 Cache-Header:** jede 200-Antwort trägt `Netlify-CDN-Cache-Control: public, durable,
  max-age=21600, immutable`; fehlender Step (404) → `cache-control: no-store`, ohne
  Durable-Header; Whitelist lehnt Fremdpfad, Directory-Listing, `..`-Traversal und
  Nicht-ICON-D2-Pfade ab (400). ✓
- **G.3 Manifest-Gate je Layer (Kaltload, Netzwerk-Beleg):**

  | Layer | Vorher (Scan-Pfad) | Nachher (Manifest-Gate) |
  |---|---|---|
  | Temp | 1 Listing (157 ms) + 25×t_2m + hsurf via `/_dwd_opendata` | **0 Listings**, `/latest-grib.json` (4 ms), 25×t_2m + hsurf via **`/_dwd_grib`** |
  | Böen | 1 Listing (113 ms) + 25×vmax_10m via `/_dwd_opendata` | **0 Listings**, 25×vmax_10m via **`/_dwd_grib`** |
  | Precip | 1 Listing (89 ms) + 28×tot_prec via `/_dwd_opendata` | **0 Listings**, 28×tot_prec via **`/_dwd_grib`** |
  | Wolken | 1 Listing (83 ms) + 3×13 clcl/clcm/clch via `/_dwd_opendata` | **0 Listings**, 3×13 via **`/_dwd_grib`** |

  Alle Nachher-Loads fragen ausschließlich den manifestierten Lauf 2026072215 an; **0**
  ICON-D2-GRIB-Requests via `/_dwd_opendata`. ✓
- **G.4 Fallback (Manifest weg):** `latest-grib.json` entfernt → Vite/SPA liefert HTML →
  Parser verwirft → **einmaliger** Directory-Scan (`…/15/vmax_10m/`-Listing), Layer lädt
  und rendert, **0** 4xx auf Step-Dateien (kein 404-Sturm). Identisches Verhalten deckt in
  Prod das Netlify-SPA-Fallback ab. ✓
- **G.5 Output-Gleichheit:** Vorher/Nachher-Screenshots je Layer
  (`audit/screenshots/layer-transport/{before,after}/…`) — Temp-/Böen-/Precip-/Wolken-
  Felder pixel-identisch (gleicher Lauf); Abweichungen nur Live-Uhr/Punktpanel
  (Stations-Refresh) und beim Temp-Vorher-Shot die Slider-Ticks (Screenshot fiel in den
  progressiven Fern-Horizont-Load — beide Loads erreichen 25 Frames, Netzwerk-Beleg G.3).
  Kein Decode-/Norm-/Shader-Eingriff (Diff-Beleg G.7). ✓
- **G.6 Warmer idempotent + fail-safe (`scripts/warm-grib.mjs`):**
  - #1 wärmt 130 Step-Dateien + hsurf durch `/_dwd_grib`, schreibt `latest-grib.json`
    atomar (Lauf 15z: t_2m/vmax 0–24, tot_prec 0–27, clcl/clcm/clch/clct 0–12). ✓
  - #2 Early-Exit in Sekunden („deckt alle warmbaren Steps ab"). Neu ggü. T1: Early-Exit
    vergleicht auch die **Step-Listen** (progressive ICON-D2-Publikation → ein reiner
    Lauf-Vergleich würde spät publizierte Steps bis zum nächsten Lauf nie nachwärmen). ✓
  - #3 `FORCE=1 FAIL_STEP=2` → Near-Horizon unvollständig → Manifest **unverändert**
    (SHA-1-identisch). ✓
  - #4 `DWD_BASE=…invalid…` → kein Lauf gefunden → Manifest unverändert. ✓
  - Beobachtet: ein transienter Listing-Fehler ließ Warm-Lauf #1 zunächst auf 12z gehen;
    der Folgelauf fand 15z und wärmte selbstheilend nach — genau das vorgesehene Verhalten.
- **G.7 Abgrenzung (Diff-Beleg):** T2 berührt ausschließlich `netlify/edge-functions/
  dwd-grib.ts` (neu), `src/sources/gribManifest.ts` (neu), `iconD2Precip/Temp/Gust/Clouds`
  (base + Manifest-Gate), `vite.config.ts`, `package.json`, `scripts/warm-grib.mjs` +
  `verify-layer-transport.mjs` (neu), `.github/workflows/warm-grib.yml` (neu),
  `public/latest-grib.json` (neu). `git diff` über `src/wind`, `src/scalar`, `src/fusion`,
  `radolan.ts`, `gribDecode.ts`, `gribGridDecode.ts`, `decompress.ts`, `gribGridWorker.ts`,
  `dwd-wind.ts`, `netlify.toml`, `MapView.tsx`, `latest-wind.json` → **leer**. Radar lädt
  weiter via `/_dwd_opendata` (Netzwerk-Beleg im Precip-Kaltload), Wind weiter über seinen
  T1-Pfad (`latest-wind.json`-Gate + `/_dwd_wind`, rendert unverändert). ✓
- **G.8 Konsole/Typecheck:** Kaltloads + Layer-Wechsel → `list_console_messages`
  (error/warn) leer; `npm run typecheck` grün. ✓

**Randnotizen (nicht T2, festgehalten):**
1. **Vorbestehender Dev-Only-Befund:** Unter React-StrictMode + kaltem Cache-API kann der
   Mount-Load des Temp-Gitters verklemmen (`tempLoadingRef`-Guard blockt den zweiten
   Mount, während der erste mit abortiertem Signal stirbt) → Temp bleibt bis zum
   30-min-Tick auf dem Fusion-Fallback. Mit warmem Cache unsichtbar, in Prod (kein
   StrictMode) nicht reproduzierbar. Vor T2 vorhanden (mit T2 unverändert), nur
   dokumentiert — kein Eingriff im Rahmen von T2.
2. `fetchIconD2Clouds` (Einzel-Param `clct`, Cap 27) hat aktuell keinen Aufrufer; das
   Manifest listet clct bis Cap 12 (Warm-Budget). Sollte die Funktion je mit Horizont > 12
   genutzt werden, Warm-Cap in `warm-grib.mjs` anheben.
3. Das committete `latest-grib.json` ist ein lokal gewärmter Seed (warmedThroughProxy =
   localhost). Ist es beim Deploy > 24 h alt, verwirft es der Staleness-Guard gefahrlos
   (T1-F.7-Beweis); der erste Prod-Cron-Lauf ersetzt es.

**Selbstverifikation (CLAUDE.md, sinngemäß):** (1) Alle vier Layer laden, scrubben und
rendern nach dem Umbau — Netzwerk-/Screenshot-Beleg G.3/G.5; Radar/Wind/Confidence
unberührt (G.7). (2) Output identisch — Byte-Beweis G.1 + identischer Lauf + unveränderte
Decode-/Shader-Pipeline. (3) Directory-Auflösung vom kritischen Pfad entfernt — G.3.
(4) Konsole sauber, keine CORS-Regression (same-origin wie zuvor) — G.8. (5) Warmer
idempotent + fail-safe — G.6.

---

## §H — Phase T2b: EPS/icosahedral-Transport (Gate GT2b)

**Auslöser (Prod-Traffic-Sample, 2026-07-22, Lauf 2026072215):** Der Kaltload zeigt zwei Datei-Familien mit dramatisch unterschiedlicher Latenz:

| Familie | Quelle | Latenz je Datei |
|---|---|---|
| `icon-d2_…_regular-lat-lon_…_clcl/clcm/clch` | 2D-Clouds-Layer (T2, proxied) | 200–1000 ms |
| `icon-d2-**eps**_…_**icosahedral**_…_tot_prec / clct / v_10m` | **Fusion-Engine** (`loadFusedForecast` → `iconD2EpsSource`) | **4,6 / 11,8 / 13,2 / 13,5 / 14,0 / 15,2 s** |

**Befund:** Die 4–15-s-Dateien sind ICON-D2-**EPS** (Ensemble, icosahedral) und laufen über `EPS_BASE = '/_dwd_opendata/weather/nwp/icon-d2-eps/grib'` ([iconD2EpsSource.ts:26](../src/sources/iconD2EpsSource.ts)) — den **Pass-Through-Rewrite ohne Durable-Cache**. T2 hat sie nie erfasst, weil der Edge-`ALLOWED_PREFIX` nur `weather/nwp/icon-d2/grib/` matcht ([dwd-grib.ts:27](../netlify/edge-functions/dwd-grib.ts)), **nicht** `icon-d2-**eps**/grib/`. Zusätzliche Kostenrealität: EPS-Dateien sind **~16 MB entpackt, ~20 Member, icosahedral** (GDT 101, ~542 k Zellen) — auch der **Client-Decode** (`decodeGrib2All` + Nearest-Cell-Resampling) ist teuer. Einziger Nutzer von `iconD2EpsSource` ist die Fusion-Engine (`src/fusion/loadFusedForecast.ts`).

**Scope T2b:** die EPS-Byte-Fetches auf den Durable-Proxy + Warm-Cron heben (Kern, **rein Transport**). Optional das icosahedrale Vor-Resampling in den Cron ziehen (killt Download **und** Decode). **Nicht** in T2b: *wann* Fusion EPS lädt (das wäre eine Fusion-Engine-Verhaltensänderung → **STOPP & FRAGEN**, nur als Vermerk).

### H.1 Umsetzungs-Spezifikation

**T2b-1 — Edge-Whitelist um den EPS-Baum erweitern:** In `dwd-grib.ts` `ALLOWED_PREFIX` von einem String zu einer Liste `['weather/nwp/icon-d2/grib/', 'weather/nwp/icon-d2-eps/grib/']`; `resolveDwdUrl` prüft `PREFIXES.some(p => rest.startsWith(p))`. Rest (Suffix `.grib2.bz2`, kein `..`, Header/Cache) unverändert. `scripts/verify-layer-transport.mjs` um EPS-Byte-Identität (proxy vs. direkt) + Whitelist-Akzeptanz beider Bäume erweitern.

**T2b-2 — EPS-Byte-Fetches durch den Proxy routen** (`iconD2EpsSource.ts`): **Base splitten** wie bei Precip/T1 — Directory-**Listing** bleibt auf `/_dwd_opendata` (`listSteps`/`resolveLatestEpsRun`, Listings kann die datei-only Edge nicht bedienen), aber die `.grib2.bz2`-**Byte-Fetches** (Steps + `clat`/`clon`-Invarianten) über `EPS_GRIB_PROXY_BASE = '/_dwd_grib/weather/nwp/icon-d2-eps/grib'`. **Kein** Decode-/Member-Mittel-/Resampling-Eingriff — dieselben Bytes, nur schnellere Herkunft.

**T2b-3 — EPS in den Warm-Cron** (`scripts/warm-grib.mjs`): die EPS-Params, die `fetchIconD2EpsGrid` zieht (t_2m, tot_prec, u_10m/v_10m, clct … bis `MAX_STEP_DEFAULT=6`), durch `/_dwd_grib` warmen. EPS hat einen **eigenen** Lauf (`resolveLatestEpsRun`) — dessen Steps warmen. Optional (sekundär) `latest-grib.json` um einen `eps`-Abschnitt ergänzen; der Byte-Warm ist der Gewinn, das Listing ist billig.

**T2b-4 — (OPTIONAL, größerer Track) Vor-Resampling im Cron:** Das icosahedrale EPS server-seitig einmal dekodieren (`decodeGrib2All` läuft in Node), Member-Mittel bilden, auf das coarse Ausgabe-Gitter (clat/clon-Nearest) resamplen und als **kompaktes Artefakt** (JSON/Binär) ausliefern. Der Client lädt es direkt → spart **16-MB-Download + bz2 + Multi-Member-Decode + 542-k-Zellen-Resampling** in einem. **Output-ÄQUIVALENZ statt -Identität** (abgeleitetes Artefakt): die vor-resampelte Grid **muss** numerisch gegen die aktuelle Client-Berechnung verifiziert werden. Grenzt an den Fusion-**Input** (nicht die Engine-Logik) → getrennt halten, sorgfältig verifizieren.

### H.2 Harte Regeln / Abgrenzung
- **T2b-1…3 rein Transport:** dieselben Bytes, derselbe Client-Decode; additiv; `/_dwd_opendata` (Radar) und `/_dwd_wind` (Wind) unberührt; Fusion-Engine-Logik unberührt.
- **T2b-4** wandelt EPS von „rohen Bytes" zu „abgeleitetem Artefakt" → **Äquivalenz-Beweis Pflicht**; weiterhin **kein** Eingriff in die Fusion-Blend-Logik.
- **Ausdrücklich außerhalb:** *Wann/ob* die Fusion-Engine EPS auf den kritischen Pfad lädt (Deferral/Lazy) = Fusion-Verhaltensänderung → **STOPP & FRAGEN** an Jan, nicht in T2b.

### H.3 Verifikation
Protokoll **V-TRANSPORT-2b** in `tests.md`: EPS-Bytes je Param identisch (Proxy vs. direkt), Durable-Header, EPS-Kaltload nicht mehr über `/_dwd_opendata` (Netzwerk-Beleg — die 4–15-s-Fetches verschwinden bei warmem Edge), Fusion-Ergebnis unverändert, Konsole/Typecheck grün. Für T2b-4 zusätzlich: vor-resampelte Grid numerisch == Client-Berechnung. 🔴 Latenz/Durable-`hit` erst nach Deploy (Jans Gate).

---

## §I — Verify-Protokoll-Log Phase T2b (V-TRANSPORT-2b, 2026-07-22)

Umsetzung T2b-1…3 (rein Transport, additiv). T2b-4 (Vor-Resampling) NICHT umgesetzt — per Vorgabe erst auf Zuruf. Fusion-Lade-Timing NICHT angefasst (STOPP-Vermerk §H.2 beachtet).

### I.1 Verifier (Punkt 1) — Byte-Identität + Whitelist beider Bäume
`node scripts/verify-layer-transport.mjs` → **ALLE CHECKS GRÜN** (73 Checks: 43 aus T2 + 30 neu). EPS-Lauf 2026072218. Je EPS-Param (Step 000) Länge + SHA-256 identisch (Proxy-Handler vs. DWD direkt) + `Netlify-CDN-Cache-Control: public, durable, max-age=21600, immutable`:
eps:t_2m 13.481.938 B (3898004d…) · eps:u_10m 14.917.229 B · eps:v_10m 14.894.033 B · eps:clct 11.706.682 B · eps:tot_prec 3.763.595 B · eps:clat 378.966 B · eps:clon 451.271 B.
Whitelist: akzeptiert `icon-d2/grib/` UND `icon-d2-eps/grib/`; lehnt EPS-Directory-Listing, Fremdpfad, Traversal, icon-eu weiter ab (400); fehlender Step → 404 + no-store, ohne Durable-Header.

### I.2 Netzwerk-Beleg Kaltload (Punkt 2) — dev :5196, Cache API geleert, Lauf 2026072218 beidseits
- **Vorher:** 18 EPS-Requests, ALLE über `/_dwd_opendata` (1 t_2m-Listing + 17 Byte-Fetches); Step-Dateien **4,9–17,6 s / 3,7–14,9 MB** je Datei (~195 MB gesamt) — exakt der §H-Befund.
- **Nachher:** 18 EPS-Requests — **17 Byte-Fetches über `/_dwd_grib`** (15 Steps + clat/clon), **genau 1** verbleibender `/_dwd_opendata`-Request = das t_2m-Directory-Listing (Lauf-Discovery, per Design T2b-2). Dev-Latenz naturgemäß unverändert (Vite-Proxy = Pass-Through ohne Edge-Cache); Durable-`hit`-Latenz = Prod, Jans Gate.
- Rohdaten: `eps-network-before/after.json`, `eps-probe-before/after.json` im Session-Scratchpad.

### I.3 Fusion-Ergebnis unverändert (Punkt 3) — Output-Identität
Numerische Sonde: `fetchIconD2EpsGrid({hours: 6})` (14×9-Grid, 3 Stützstellen, 2646 Werte, alle 7 Felder), Checksumme + 9 Stichprobenpunkte.
- **Nachher-Wert 25220,4635 vierfach reproduziert:** 2× auf warmem Decompressed-Cache, 2× frischer Download mit je zuvor geleertem Cache → Fetch+Decompress+Decode+Member-Mittel+Resampling **deterministisch**.
- **Byte-Identität beider Pfade browserseitig:** `tot_prec/006` (10.417.991 B) via `/_dwd_opendata` und `/_dwd_grib` gleichzeitig geholt → SHA-256 identisch (2de0f742…). Zusammen mit I.1: der Proxy-Pfad liefert bit-identischen Fusion-Input.
- **Einordnung Vorher-Sonde:** Die Vorher-Messung (25282,1838; 19:42–19:48Z) weicht ab. Ursache upstream, nicht Transport: die 18z-EPS-Dateien landeten 19:31:52–19:36:41Z auf opendata.dwd.de — die Vorher-Sonde lief mitten im Publikationsfenster (Replika-/Revisions-Churn). Beleg: beide Pfade bit-identisch (s. o.), Pipeline deterministisch → der ALTE Pfad hätte zu den Nachher-Zeitpunkten denselben Nachher-Wert geliefert. Kein T2b-Effekt.

### I.4 Warm-Cron (T2b-3) — Proben + realer Lauf
Scratch-Manifest-Proben (WARM_MAX_STEP=0, NEAR_REQUIRED=0):
- EPS-Discovery-Ausfall (EPS_DWD_BASE invalid) → „Kein EPS-Lauf gefunden → eps-Abschnitt UNVERÄNDERT“, **2D legt trotzdem um**.
- 2D-Discovery-Ausfall (DWD_BASE invalid) → „Kein vollständiger 2D-Lauf gefunden“, **EPS wärmt + eps-Abschnitt neu, 2D-Abschnitt 1:1 übernommen** — Unabhängigkeit in beide Richtungen belegt.
- FAIL_STEP=0 + FORCE=1 → beide Fail-Safes greifen („Nichts umzulegen“), Manifest **SHA-1-identisch** (e3103bd2…), Exit 0.
- Early-Exit ohne FORCE → „Early-Exit: Manifest deckt 2D und EPS bereits vollständig ab.“
Realer Lauf gegen `public/latest-grib.json` (SITE_URL=:5196): 2D-Lauf 2026072218 voll (t_2m/vmax 0–24, tot_prec 0–27, Clouds 0–12) + hsurf, EPS-Lauf 2026072218 Steps 0/3/6 × 5 Variablen + clat/clon; Manifest atomar umgelegt inkl. `eps`-Abschnitt; anschließender Lauf → Early-Exit. Client-Gegenprobe: `resolveRunFromManifest('/latest-grib.json','t_2m')` → 2026072218, Steps 0..24 — der zusätzliche `eps`-Schlüssel stört den 2D-Manifest-Parser nicht (er liest nur run/runAt/params; der Client liest den `eps`-Abschnitt bewusst NICHT, seine EPS-Discovery bleibt der Listing-Scan).

### I.5 Abgrenzung (Punkt 4) — Diff-Beweis
T2b-Diff = genau 4 Dateien: `netlify/edge-functions/dwd-grib.ts` (ALLOWED_PREFIX → Liste + Doku, 15 Diffzeilen), `src/sources/iconD2EpsSource.ts` (**+13/−2**: nur EPS_GRIB_PROXY_BASE-Split für Byte-Fetches + Kommentare; Listing-Base, Decode, Member-Mittel, Resampling, Bounds UNVERÄNDERT), `scripts/warm-grib.mjs`, `scripts/verify-layer-transport.mjs`.
`git diff` leer über: src/fusion/**, src/wind/**, src/scalar/**, gribDecode.ts, gribGridDecode.ts, decompress.ts, bz2Worker.ts, radolan.ts, iconD2Precip.ts, gribManifest.ts, netlify.toml, dwd-wind.ts. `/_dwd_opendata`-Rewrite + `/_dwd_wind` + Fusion-Blend-Logik unberührt.

### I.6 Konsole/Typecheck (Punkt 5)
Konsole: 0 Errors; nur vorbestehende Emscripten-Hinweise „still waiting on run dependencies: wasm-instantiate“ des bz2-Workers (existierten vor T2b, treten bei jedem GRIB-Entpacken auf). `npm run typecheck` grün.

### Selbstverifikation vor Gate GT2b
1. **Jede Funktion erhalten?** Ja — einziger iconD2EpsSource-Nutzer ist die Fusion-Engine; fetchIconD2EpsGrid liefert bit-identischen Input (I.1/I.3), Signatur/Options/Fehlerverhalten unverändert; 2D-Layer/Wind/Radar-Pfade diff-leer (I.5).
2. **Desktop unverändert?** Ja — reine Transportänderung, keinerlei UI/Layout-Datei berührt (I.5).
3. **Touch-Targets:** n. a. (Infrastruktur-Phase, kein UI).
4. **Konsole frei von NEUEN Errors/Warnings?** Ja (I.6).
5. **Performance:** Kein neuer Main-Thread-Code; erwarteter Gewinn (Durable-`hit` statt 4–15 s DWD-Kaltpfad) erst nach Deploy messbar — 🔴 Jans Gate.

**Offen (🔴 Jans Gate):** Netlify-Deploy → Durable-`Cache-Status: hit` + Kaltload-Latenz je EPS-Param vs. 4–15-s-Baseline; Warm-Cron-EPS-Coverage in Prod (warm-grib.yml unverändert — EPS läuft im selben Cron mit); Branch-Protection-Bot-Push wie gehabt. Das committete `latest-grib.json` ist ein localhost-Seed (Staleness-Guard macht ihn gefahrlos). **T2b-4 (Vor-Resampling im Cron) bewusst offen** — nur auf Zuruf; Hinweis: der Client-Decode (~16 MB × 15 + 542-k-Zellen-Resampling) bleibt bis dahin unverändert teuer, T2b-1…3 beschleunigt nur den Download.
