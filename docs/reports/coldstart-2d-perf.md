# 2D-Karte + Datenlayer — Cold-Start-Performance (messungsgetrieben)

> Ziel: Cold-Start Time-to-Interactive der 2D-Karte + 2D-Datenlayer (Desktop) < 2000 ms.
> Constraints eingehalten: PNG-Texture-Contract unverändert, RepaintScheduler-Architektur
> unverändert, `defaultProjectionData.mainMatrix` / `gl.bindVertexArray(null)` nicht angefasst.

## Messaufbau (reproduzierbarer Cold-Start)

- **Prod-Build** (`vite build`) + `vite preview` (:4183). Cold-Start = **frischer isolierter
  Browser-Kontext** pro Messung (leerer HTTP-Cache + frischer GL-Context), Deep-Link
  `#m={"l":[48.137,11.575,"München","DE"],"b":1,"h":0}` (landet direkt auf der Karte, Default-Layer
  Wind). Instrumentierung **ohne App-Änderung**, via `navigate_page(initScript=…)`: Resource-Timing
  (Netzwerk je Kategorie), WebGL-Hooks (`getContext`/`drawArrays`/`drawElements`/`texImage2D` →
  Context-Create, First-Draw, First-Texture), PerformanceObserver (FCP/Longtask). Chrome DevTools MCP.
- **Infra-Änderung nur fürs Messen:** `vite.config.ts` bekommt `preview.proxy` = Spiegel des
  `server.proxy` (`/_dwd_opendata`, `/_gfs`) — sonst SPA-fallbackt Preview `/_dwd_opendata` auf
  `index.html` und der Datenlayer lädt nie. Das spiegelt, was Prod ohnehin braucht (CLAUDE.md).

### Zwei harte Realitäten, die den Rahmen der Aufgabe korrigieren (brutal ehrlich)

1. **Es gibt kein Cloudflare R2 / PMTiles im Code.** Die Basemap ist das **remote** OpenFreeMap-
   Liberty-Vektorstyle (`https://tiles.openfreemap.org/styles/liberty`, `MapView.tsx:421`) — Style-
   JSON, Vektor-Tiles, Glyphs, Sprites liegen alle auf einem **fremden CDN**. Keine `addProtocol`,
   kein `pmtiles`, kein R2 irgendwo in `src/`. → Der im Task angenommene R2/PMTiles-Stack existiert
   nicht; „R2 Cache-Control" ist kein verfügbarer Hebel.
2. **Umgebungs-Uhr ≠ DWD-Serverdatum-Effekt.** Der Datenlayer (ICON-D2 GRIB über `opendata.dwd.de`)
   ist extern latenz-/durchsatz-gebunden und **stark schwankend** (Directory-Listing 108 ms–1.9 s,
   GRIB-Datei 0.9–2.6 s — je Messung anders). Einzel-Run-Vergleiche sind rausch-dominiert; nur
   **strukturelle** Änderungen (Wasserfall-Reihenfolge) sind stabil beweisbar.

## Baseline — Ranked Cost-Centers (cold, Wind-only)

Kritischer Pfad bis „Karte interaktiv + Wind-Frame sichtbar". Zahlen aus mehreren Cold-Runs
(Range, wegen externer Varianz):

| # | Cost-Center | Fenster (ms) | Beitrag | Kontrollierbar |
|---|---|---|---|---|
| 1 | **ICON-D2 `u_10m` Directory-Listing** — blockierte den ersten GRIB-Fetch | ~1.7 s → dann GRIB @3.7 s | **~1.9 s** (worst case) | ✅ (entkoppelt) |
| 2 | **GRIB u+v Step-0 Download** (DWD opendata, pro Datei 0.9–2.6 s) | nach #1 | **~1.3–2.6 s/Datei** | ❌ extern |
| 3 | JS-Parse + Map/GL-Init → First-Draw (Basemap interaktiv) | 0 → ~1.4–2.6 s | ~1.4–2.6 s (parallel) | ⚠️ schon schnell |
| 4 | bz2-Decompress (Worker) + GRIB-Decode (sync ~18 ms) + `buildWindFrame` | nach #2 | ~0.3–0.5 s | ⚠️ teils |
| — | Basemap-Glyphs/Labels (OpenFreeMap) | ~4.2 → 6.5 s | nicht auf Daten-TTI-Pfad | ❌ extern |
| — | DEM 92 Terrarium-Tiles + volle 12-Step-Prognose | → 22–30 s | deferred/Background | ✅ nicht TTI-blockierend |

**Gemessene TTI-Bausteine (cold):**
- Kritisches JS (index 95 KB + MapView 44 KB + maplibre 278 KB) geladen: **~460 ms** (localhost;
  Prod-CDN +200–500 ms).
- WebGL-Context: ~1.0–1.7 s · **Karte First-Paint (First-Draw): ~1.4–2.6 s** (Median ~1.9 s).
- **Wind-Daten First-Frame: ~3.5–5.5 s.**

## Change-Log (Diagnose-First, je Änderung neu gemessen)

| # | Änderung | Rationale | Before → After | Entscheidung |
|---|---|---|---|---|
| A | `resolveLatestRun` Backward-Search **parallel** (6 Kandidaten gleichzeitig) | Annahme: 6-tiefer serieller Walk (~1.6 s) | **Regression**: `data-dwd-list` 6→**21** Requests fluteten den 6-Connections-pro-Host-Pool; First-GRIB-Pair **3.3 s → 5.5 s** | **REVERTED** |
| B | `minStep=12` für Wind (statt Gate ≥24), sequenziell | Wind braucht nur ≤12 h → jüngsten Lauf früher akzeptieren | **Inert**: Per-Request-Tracing zeigte, der Lauf löst bei back=0 auf (48 h publiziert) → **kein** Walk. Die 6 „dir"-Requests sind **6 verschiedene Quellen** (UV/Sturm-Alerts, Radar `rv/`, `u_10m`×2, `t_2m`), kein Walk. Bewegt die Zahl nicht. | **REVERTED** |
| C | **Spekulativer Step-0-Fetch** (`iconD2WindSource.ts`): u+v Step 0 des deterministischen aktuellen Laufs **parallel** zum Directory-Listing laden, statt danach | Der erste Frame braucht nicht die volle Step-Liste; das Directory-Listing (bis ~1.9 s) aus dem First-Frame-Pfad nehmen | **Struktureller Gewinn bestätigt**: GRIB-Start `2257 ms` **parallel** zum Dir (`2082–2190 ms`) — vs. Baseline GRIB-Start `3699 ms` **nach** Dir-Ende `3547 ms`. Nie schlechter (Fallback bei Lauf-Fehlschätzung); Wind rendert korrekt (Screenshot verifiziert). | **KEPT** |

**Warum A/B nichts brachten und C nur teils:** Die eigentliche Diagnose-Korrektur — der Bottleneck
ist **nicht** ein Lauf-Walk, sondern (i) die Latenz **eines** Directory-Listings (extern, 0.1–1.9 s
schwankend) und (ii) der **GRIB-Download selbst** (u+v, je 0.9–2.6 s, extern). C entfernt (i) aus dem
First-Frame-Pfad; (ii) bleibt.

## Finale Cold-Start-Messung vs. 2 s-Ziel — brutal ehrlich

| Definition von „Interaktiv" | Cold (gemessen) | < 2000 ms? |
|---|---|---|
| **Karte allein** (pan/zoom, Basemap gezeichnet) | ~1.4–2.6 s (Median ~1.9 s; Prod-CDN eher ~2–3 s) | **Grenzwertig** — lokal ja, Prod knapp drüber |
| **Karte + Wind-Datenlayer First-Frame** | ~3.5–5.5 s (mit C: Dir-Wait raus, GRIB-Download bleibt) | **Nein** |

**Das Ziel < 2000 ms für Karte + Datenlayer ist client-seitig nicht erreichbar**, ohne einen harten
Constraint bzw. die Architektur zu brechen. Die verbleibende Wall, quantifiziert:

- **Datenlayer-Wall = externer DWD-opendata-GRIB-Durchsatz.** Selbst bei sofortiger Lauf-Auflösung
  und sofortigem JS/GL kostet allein das u+v-Step-0-Paar **~1.3–2.6 s/Datei** (2 Dateien) + bz2-
  Decompress — das überschreitet 2 s für sich. Das ICON-D2-Auslieferungsmodell (pro Schritt eine
  `.grib2.bz2`-Datei per Directory-Listing + Range-losem Full-Fetch über `opendata.dwd.de`) ist ein
  Mehrsekunden-Cold-Pfad. **Sub-2 s bräuchte eine Backend-/Edge-Momentaufnahme** (ein vorgerechnetes
  „aktueller Wind"-PNG/Texture aus einem CDN/R2 in **einem** schnellen Request) — genau der R2-Stack,
  den der Task annimmt, der aber **nicht existiert**. Das ist ein Backend-/Architektur-Change,
  außerhalb des „nur 2D-Client, keine Constraints brechen"-Scopes.
- **Basemap-Label-Wall = OpenFreeMap-Glyph-/Tile-Durchsatz** (fremdes CDN, ~4.2–6.5 s bis Labels
  settlen). Nicht client-seitig kontrollierbar; ein Wechsel auf self-hosted PMTiles/Glyphs (R2) wäre
  der Hebel — wieder eine Architektur-/Backend-Änderung.

**Wie nah:** Die *Karte* ist ~1.9 s (≈ Ziel). Der *Datenlayer* liegt strukturell ~1.5–3.5 s über
Ziel; Change C nimmt bis ~1.9 s Directory-Wait raus, aber der ~1.3–2.6 s GRIB-Download-Floor bleibt.

## Gehaltene / verworfene Änderungen

- **KEPT:** `iconD2WindSource.ts` spekulativer Step-0-Fetch (Change C). Verifiziert: rendert korrekt,
  nie schlechter, entkoppelt GRIB vom Directory-Listing.
- **KEPT (Infra, kein Perf-Change):** `vite.config.ts` `preview.proxy` (spiegelt `server.proxy`;
  Prod braucht denselben Proxy).
- **REVERTED:** parallele Backward-Search (A, Regression), `minStep` (B, inert).

## Empfehlungen (außerhalb des erlaubten Scopes, für < 2 s)

1. **Edge/Backend „current wind"-Snapshot**: ein vorgerechnetes u/v-PNG (bestehender Texture-Contract)
   des jüngsten Laufs, aus R2/CDN in **einem** Request (~1 RTT statt Directory-Listing + N GRIB-Fetches
   + bz2). Bringt den Datenlayer-First-Frame realistisch < 1 s. **Backend-Arbeit.**
2. **Self-hosted Basemap (PMTiles/Glyphs auf R2)** statt OpenFreeMap → Style/Glyphs same-origin,
   cachebar, kein fremder CDN-Durchsatz. **Architektur/Infra.**
3. Beides ist genau der „R2/PMTiles"-Stack aus dem Task-Context — er muss erst **gebaut** werden;
   aktuell existiert er nicht.

## Proposed Commits

- `perf(wind): speculative step-0 grib fetch parallel to run-directory resolution (cold-start)`
- `chore(vite): mirror dev upstream proxy into preview for realistic cold-start measurement`
- `docs(perf): cold-start 2D map+data analysis — ranked cost-centers, external DWD/OpenFreeMap wall`
