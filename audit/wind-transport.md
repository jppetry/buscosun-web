# audit/wind-transport.md — Diagnose & Verify: Phase T1 (Wind-Transport / Caching)

**Art:** Reiner Transport-/Datenschicht-Umbau (kein UI, kein Shader, keine Fusion, kein
Decode-Eingriff). Gate **GT1**. Oberste Direktive: **Output-Gleichheit** — Windpartikel
rendern nach dem Umbau numerisch/visuell identisch; es ändert sich nur, *woher* und *wie
schnell* dieselben Bytes kommen.

**Scope-Ehrlichkeit:** T1 fixt **nur den Wind-Layer**. Der `/_dwd_opendata`-Proxy bleibt für
Radar (RADOLAN) und übrige DWD-Quellen bestehen.

---

## §A — Befund (Ist-Zustand, aus `context.md` verdichtet)

Beim Kartenaufruf zieht der Client die rohen ICON-D2-GRIB-Dateien (`.grib2.bz2`, ~1,1 MB/Datei)
**live** über den `/_dwd_opendata`-Rewrite (Vite-Dev-Proxy bzw. Netlify-Prod-Rewrite) direkt vom
DWD-Fileserver `opendata.dwd.de`. Ein Wind-Load des nahen Horizonts = **5 Vorlauf-Schritte
(0–4 h)** × **2 Komponenten (`u_10m` + `v_10m`)** = **10 Requests**.

Drei Kernprobleme:
1. **DWD auf dem kritischen Pfad** → Latenz zur Request-Zeit unkontrollierbar.
2. **Kein geteilter Cache** — jeder Besucher fetcht neu; origin-gebunden (HTTP/2-multiplexed auf
   einen Origin, DWD = Flaschenhals), nicht bandbreitengebunden.
3. **Zusätzliche Directory-Auflösung**: `resolveLatestRun` lädt + regex-parst das HTML-
   Verzeichnis-Listing des Laufs, um Lauf + Schrittliste zu ermitteln.

**Was bereits existiert (nicht als Versäumnis fehldeuten):** Der Loader
(`src/wind/iconD2WindSource.ts`) lädt bereits **gestaffelt** (naher Horizont 0–4 h kritisch,
fern 5–12 h im Hintergrund), **spekulativ** (erste Steps parallel zur Lauf-Auflösung) und hält
einen **IndexedDB-„jetzt"-Cache** (`buscosun-wind`) + einen **Cache-API-Cache der entpackten
GRIB-Bytes** (`icon-d2-grib-decompressed-v1`). Die Wand ist damit primär ein **Kaltstart-/
Cross-User-Problem**.

Authoritative Referenz-Messung (aus `context.md`, 2026-07-12, 09z-Lauf, Produktions-nah):
**1 Cache-Hit in 314 ms, die anderen 9 in ~5000–5230 ms** — die ~5 s sind origin-gebunden.

---

## §B — Frische Kalt-Baseline (2026-07-18, `netlify dev` noch nicht involviert)

**Setup:** Vite-Dev-Server `http://localhost:5178/` (Ports 5173–5177 belegt), Wetterkarte-
Overview (Wind-Layer per Default aktiv, DE/Native), Chrome DevTools MCP in frischem Profil.
Vor der Messung: IndexedDB (`buscosun-wind`), Cache-API (`icon-d2-grib-decompressed-v1`,
`radolan-rv-tar-v1`) geleert; Service Worker war in diesem Profil nicht registriert.

**Messwerkzeug:** Network-Waterfall (`list_network_requests`) + Resource-Timing-API
(`performance.getEntriesByType('resource')`). *Caveat:* Die Dev-Proxy-Latenz auf `localhost`
ist **nicht** repräsentativ für die Produktions-Edge/DWD-Latenz — der **origin-gebundene
Round-Trip zu DWD ist aber derselbe Flaschenhals**. Absolute Sekunden erst auf Netlify
belastbar; die **Struktur** (Anzahl/Reihenfolge Requests) ist lokal 1:1 gültig.

### B.1 Request-Struktur des Kalt-Loads (Wind, naher Horizont)

Beobachtete Sequenz (erster, wirklich kalter Load):

| # | Request | Zweck | Ergebnis |
|---|---------|-------|----------|
| reqid 201 | `GET …/grib/09/u_10m/` | Directory-Listing (Lauf-Auflösung) | `ERR_ABORTED` (Doublette) |
| reqid 202 | `GET …/grib/09/u_10m/` | Directory-Listing | **200, dur 1271 ms** |
| reqid 204–209 | `…_2026071806_00{0,1,2}_2d_{u,v}_10m.grib2.bz2` | **spekulativ** (Lauf **06z** geraten) | 200, je ~1,05 MB, dur 964–1285 ms |
| reqid 287–296 | `…_2026071809_00{0..4}_2d_{u,v}_10m.grib2.bz2` | naher Horizont (Lauf **09z**) | 200, 10 Requests, ~1,07 MB/Datei |
| reqid 256 | `…_2026071809_000_0_hsurf.grib2.bz2` | Orographie (einmalig) | 200 |

### B.2 Zwei Befunde, die die T1-These stützen

1. **Directory-Listing auf dem kritischen Pfad = 1271 ms (lokal).** Das Listing ist ein großes
   HTML-Dokument: es enthält **alle** Schritte des Laufs in **zwei** Gittertypen
   (`icosahedral` + `regular-lat-lon`, je ~49 Schritte ⇒ ~100 Einträge) und wird per RegExp
   geparst. Produktions-Referenz: ~1,9 s. **T1.3 (Manifest-Gate) entfernt diesen Schritt
   vollständig** vom kritischen Pfad (Manifest-Fetch ~50 ms statt Listing).

2. **Der spekulative Lauf-Rat ging daneben (geraten 06z, tatsächlich 09z) → 6 verschwendete
   ~1,05-MB-Fetches.** Das ist **kein Zyklusrand-Zufall**, sondern der Normalfall: der Code-
   Kommentar (`iconD2WindSource.ts:243–250`) beschreibt genau das — ICON-D2 braucht ~3–3,5 h
   von der Referenzzeit bis zur vollständigen Publikation, daher ist „aktueller Bucket minus
   ein Zyklus" für den Großteil jedes Zyklus der falsche Rat. Die spekulativen Frames werden
   verworfen und aus dem aufgelösten Lauf neu geladen. **Das Manifest-Gate (T1.3) macht die
   Spekulation überflüssig**, weil der zuletzt gewärmte Lauf schon im Manifest steht — kein
   Raten, kein Fehlgriff, keine Verschwendung.

### B.3 Warm-HTTP-Cache-Kontrast (zweiter Load, GRIB im Browser-HTTP-Cache)

Ein zweiter Load mit HTTP-gecachten GRIB-Bytes (transferSize 0): Directory-Listing sinkt auf
**170 ms**, Schritte laden in **22–391 ms**. **Aber:** Der Client führt **weiterhin** das
Directory-Listing aus **und rät weiterhin den falschen Lauf (06z)**. → Beleg, dass die
strukturelle Ineffizienz (Listing + Fehlrat) **unabhängig vom Cache-Zustand** besteht und genau
das ist, was T1.3 beseitigt — während T1.1/T1.2 die Byte-Latenz der 10 Schritt-Fetches
adressieren.

### B.4 Konsole

Konsole beim Kalt-Load **frei von Errors/Warnings** (`list_console_messages` → keine).

**Baseline-Screenshot (Wind, „jetzt"/Stunde 0, DE/Native):**
`audit/screenshots/wind-transport/before/baseline-wind-1440.png`.

---

## §C — Was T1 schlagen muss (Zielbild)

| Metrik | Baseline (ist) | Ziel nach T1 |
|--------|----------------|--------------|
| Directory-Listing auf kritischem Pfad | ~1,3 s lokal / ~1,9 s prod | **entfällt** (Manifest ~50 ms) |
| Spekulative Fehl-Fetches (Lauf-Rat) | 6 × ~1,05 MB/Kaltload | **0** (Manifest nennt den Lauf) |
| Near-Horizon-Bytes (10 Schritte) | origin-gebunden, ~5 s | **Edge-Cache-Hit** (~150 ms prod) |
| DWD auf kritischem Pfad | ja | **nein** (Edge fetcht server-seitig, gewärmt) |
| Worst Case bei Warmer-Ausfall | kalt/langsam | **stale, nie kalt** (letzter gewärmter Lauf) |

---

## §D — Scope-Bestätigung: was in T1 NICHT angefasst wird

Bestätigt vor Code-Beginn (Checklist GT1, Kasten „Bestätigt"):
- **`buildWindRgba`** (`src/wind/windFrameBuild.ts`) — unangetastet.
- **`blendWindFrames`** + `windFrameInterpolated` + `blendAndRefine` (Zeit-Interpolation/Scrub)
  — unangetastet.
- **Per-Frame-u/v-Normierung** (`uMin/uMax/vMin/vMax` pro Frame) — unangetastet.
- **Shader / RGBA8-Packing** (`WindLayer`, GPU-Ping-Pong) — unangetastet.
- **IndexedDB-„jetzt"-Cache** (`saveWindNowCache`/`loadWindNowCache`) — unangetastet.
- **Fusion-Engine** — nicht berührt (2D-Wind ist ohnehin nativer ICON-D2-Pfad).

T1 ändert ausschließlich die **Transportschicht**: (a) einen Caching-Layer vor die DWD-Fetches
(Edge Function), (b) einen Warm-Cron, der den Cache füllt und ein Manifest umlegt, (c) die
**Lauf-Auflösung** im Client (`resolveLatestRun` → Manifest statt Directory-Scan). Der übrige
Loader (`fetchStepBytes`, Worker-Decode, Blend, Norm) bleibt unverändert.

---

## §E — Selbstverifikation (CLAUDE.md, sinngemäß auf Transport)

1. **Funktioniert jede Funktion (Wind-Load, Slider-Scrub, ferner Horizont, Now-Cache) nach dem
   Umbau noch?** — **Ja.** Wind-Load: 26/26 (Lauf,Step)-Dateien laden über `/_dwd_wind`
   (Netzwerk-Beleg §F.4). Slider-Scrub auf Stunde 11,6 → Wind aktualisiert, **keine neuen
   Netz-Requests** (Blend nutzt geladene Frames, weiter 26), Konsole sauber (§F.6). Ferner
   Horizont (Steps 5–12) lädt im Hintergrund (im Manifest + Netzwerk sichtbar). Now-Cache
   (`saveWindNowCache`/`loadWindNowCache`) unangetastet — kein Code-Eingriff.
2. **Ist der visuelle/numerische Wind-Output identisch (Vektoren/Richtung/Dichte/FPS-Cap)?** —
   **Ja.** (a) Byte-Identität der Quell-GRIB bewiesen (SHA-256 == Direkt-Fetch, §F.1); (b)
   identischer Lauf (09z) + identische Steps; (c) `buildWindRgba`/`blendWindFrames`/Norm/Shader
   sind byte-für-byte unveränderter Code; (d) Vorher/Nachher-Screenshots zeigen dasselbe
   Windfeld (`before/baseline-wind-1440.png` vs `after/manifest-wind-1440.png`; der triviale
   Punkt-Wert 4,2→4,3 m/s stammt aus ~14 min realer Zeitfortschritt im Now-Valid-Time-Indexing,
   nicht aus dem Transport). FPS-Cap-Pfad (FrameGovernor) nicht berührt.
3. **Ist die Directory-Auflösung nachweislich vom kritischen Pfad entfernt?** — **Ja.** Mit
   Manifest: **0** Directory-Listings (`/_dwd_opendata/.../u_10m/`), stattdessen ein
   `/latest-wind.json`-Fetch von **3 ms** (Baseline: 1271 ms lokal). Zusätzlich **0**
   spekulative Fehl-Fetches (Baseline: 6 × ~1,05 MB an den falschen 06z-Lauf). Beleg §F.4.
4. **Ist die Konsole frei von neuen Errors/Warnings, keine CORS-Regression?** — **Ja.** Kalt-
   Load + Scrub → `list_console_messages` (error/warn) liefert nichts. Same-origin über
   `/_dwd_wind` (Dev-Proxy bzw. Edge Function) → keine CORS-Änderung ggü. `/_dwd_opendata`.
5. **Ist der Warmer idempotent + fail-safe (stale statt kalt)?** — **Ja.** Lauf #2 (kein neuer
   DWD-Lauf) → Early-Exit, Manifest unverändert. Lauf #3 (`FAIL_STEP=2`, Near-Horizon-Fehler) →
   Manifest **nicht** umgelegt (letzter guter Lauf bleibt). Lauf #4 (DWD unerreichbar) → kein
   Lauf gefunden, Manifest unverändert. In allen Fällen serviert der Client den letzten
   gewärmten Lauf (stale, nie kalt). Beleg §F.5.

---

## §F — Verify-Protokoll-Log (V-WIND-TRANSPORT, lokal)

_(L = lokal; N = Netlify-Deploy — in diesem Run **bewusst zurückgestellt**, s. §G.)_

**Setup:** Vite-Dev `localhost:5178`; Edge-Function-Handler zusätzlich als Node-22-Modul
(`scripts/verify-wind-transport.mjs`) gegen Live-DWD getestet; Chrome DevTools MCP für Client/
Netzwerk. Der `/_dwd_wind`-Pfad läuft lokal über den Vite-Dev-Proxy (Byte-Pass-Through); die
**Edge-Function-Bytes/Header** sind separat gegen den echten Handler bewiesen (F.1/F.2).

- **F.1 (L.1) Bytes identisch:** `verify-wind-transport.mjs` → Länge 1.062.522 == 1.062.522,
  **SHA-256 identisch** (Direkt-DWD vs. Edge-Handler), Sample
  `…/09/u_10m/…_2026071809_000_2d_u_10m.grib2.bz2`. ✓
- **F.2 (L.2) Cache-Header:** Edge-Response trägt
  `Netlify-CDN-Cache-Control: public, durable, max-age=21600, immutable`; Fehlender Step (404) →
  `cache-control: no-store` (kein Durable-Cache von Fehlern); Anti-Open-Proxy: Fremdpfad +
  Directory-Listing werden abgelehnt (`resolveDwdUrl` → null). ✓
- **F.3 (L.3) Wind lädt über den Pfad, Frames erscheinen, Slider scrubbar:** Wind rendert,
  Scrub auf 11,6 h ohne neue Netz-Requests, Vektoren/Dichte unverändert (Screenshots §E.2). ✓
- **F.4 (L.4) Manifest-Gate:** Netzwerk-Auszug (Chrome DevTools MCP, Kalt-Load):
  `/latest-wind.json` (2× je 3 ms — Dev-StrictMode-Doppelaufruf, harmlos, Prod = 1×);
  Wind-Steps **26**, davon **26 via `/_dwd_wind`**, **0 via `/_dwd_opendata`**; Directory-
  Listings **0**; angefragte Läufe **{2026071809: 26}** (nur der manifestierte). ✓
- **F.5 (L.5) Warmer idempotent + fail-safe:** #1 wärmt 13 Steps × u/v + schreibt Manifest
  (Lauf 09z, Steps 0–12); #2 Early-Exit (unverändert); #3 `FAIL_STEP=2` → Manifest unverändert;
  #4 `DWD_BASE=…invalid…` → kein Lauf → Manifest unverändert. Atomar (temp+rename). ✓
- **F.6 (L.6) Output-Gleichheit / Scrub:** `blendWindFrames`-Pfad unberührt; Scrub über
  Stunden identisch (keine Netz-Requests, Konsole sauber). ✓
- **F.7 Robustheit / Graceful-Degrade des Manifest-Gates (zusätzlich):** Das Manifest ist
  eine reine Optimierung — nie „schlechter als vor T1":
  - *Kein Manifest* (Datei entfernt) → Fallback auf Directory-Scan (bestehendes Verhalten).
  - *Manifest zeigt auf toten Lauf, aber < Staleness-Grenze* → Client versucht den Lauf, bekommt
    0 Frames → fällt **einmalig transparent** auf den Scan zurück und lädt den echten Lauf
    (getestet mit fabriziertem Manifest: 10 Fehlversuche, dann Scan → 09z geladen). ✓
  - *Manifest zu alt* (`run` > 24 h, z. B. versehentlich committetes Altmanifest) →
    **Staleness-Guard** verwirft es **vorab** → Scan holt den aktuellen Lauf, **ohne** 404-Sturm
    (getestet mit Manifest-Lauf 2020010100: **0** Fehlversuche, Konsole sauber). ✓
  Damit ist ein committetes Seed-Manifest gefahrlos, und ein ausgefallener Warmer führt zu
  „stale (aus Edge-Cache) bzw. frisch-aber-langsam (Scan)", nie zu „kalt/kaputt".
- **F.8 `netlify dev`-Integration (netlify-cli 26.2.0 global installiert):** `netlify dev`
  (`--target-port 5178 --port 8888`) lädt die Edge Function (Log „⬥ Loaded edge function
  dwd-wind"). Belege gegen die echte Edge-Routing-Verdrahtung:
  - **Routing:** `/_dwd_wind/...` auf **:8888** → `server: Netlify`,
    `cache-control: public, max-age=21600, immutable` **und**
    `netlify-cdn-cache-control: public, durable, max-age=21600, immutable`; derselbe Pfad auf
    **:5178** (nur Vite-Proxy) trägt **keinen** dieser Header → Edge Function greift eindeutig. ✓
  - **Bytes:** durch die Edge Function unter `netlify dev` **SHA-256-identisch** zum Direkt-DWD-
    Fetch (`a4a54c9a…`, 1.062.522 B). ✓
  - **Client (Chrome MCP, Origin :8888):** Wind lädt **26/26 via `/_dwd_wind`**, **0** via
    `/_dwd_opendata`, **0** Directory-Listings, nur der manifestierte Lauf; Wind rendert
    identisch (`after/netlifydev-wind-8888.png`), Konsole sauber. ✓
  - *Latenz-Caveat:* `netlify dev` persistiert lokal **keinen** Durable-Cache und hat pro Request
    Deno-Overhead → lokale Latenz **nicht** repräsentativ (Miss→Hit/~150 ms = Netlify-Deploy,
    N.7–N.11). `netlify dev` beweist **Routing + Bytes + Header**, nicht Latenz.

---

## §G — Für den nächsten Run zurückgestellt (Netlify + Cron) — Jans Gate

**Erledigt seit dem ersten Run:** `netlify dev`-Integrationslauf — netlify-cli 26.2.0 **global
installiert** (Jans Freigabe „mache jetzt die netlify integration"), Edge-Routing/Bytes/Header
unter echtem `netlify dev` bewiesen (§F.8).

Weiterhin bewusst **nicht** in diesem Run (HARD-STOP-Guardrails, brauchen Jans `netlify login`
bzw. CI-Aktivierung):
- **Netlify-Deploy** der Edge Function (durable Cache-Miss→Hit, reale ~150-ms-Latenz,
  Cross-Request-Warm) — Protokoll `tests.md` (N.7–N.11). Braucht `netlify login` + Site-Link.
- **Aktivieren des Warm-Crons** (`audit/warm-wind.workflow.yml` → `.github/workflows/`) —
  „Aktivieren eines Cron in der echten CI" ist STOPP&FRAGEN.
- **Prod-Manifest-Persistenz:** Commit-back (im YAML umgesetzt) vs. Netlify Blobs — Entscheidung
  am Deploy-Gate.
