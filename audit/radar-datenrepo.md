# RD0 — Radar (RADOLAN-RV) und KONRAD3D ins Daten-Repo? Diagnose

> Stand: 2026-08-29 · Auftrag (Jan): „ich überlege die Radar-Daten und KONRAD-Daten auch in
> buscosun-data zu speichern, um dadurch Bandbreite bei Netlify zu sparen. Prüfe die Umsetzung
> und die Konsequenzen." · **Kein Code.** Alle Zahlen sind heute gemessen (14:00 UTC), die
> Messbefehle stehen bei jeder Zahl. Vorgeschichte: `audit/bandbreite.md` §26.3 (V-BW-29,
> Empfehlung „nicht bauen", Jans Entscheidung 2026-08-25) — diese Diagnose prüft die Frage
> **neu und mit Zahlen von heute**, statt die alte Entscheidung nur zu zitieren.

## 0. Kurzfazit

1. **Was gespart würde, ist größer als damals angenommen — und wetterabhängig.** BW-5 hat den
   RV-Tar mit 0,36 MiB gemessen (ein trockener Tag). Heute, über 577 Läufe der letzten 48 h:
   **Median 1,36 MB, Maximum 2,41 MB** je Lauf. Dazu KONRAD3D: Median 0,26 MB, Maximum 1,03 MB.
   Eine offene Regenradar-Sitzung zieht damit **≈ 1,7 MB alle 5 Minuten** über Netlify — und
   zwar genau dann, wenn viele Leute das Radar öffnen (es regnet). Der RV-Tar hängt außerdem an
   **jeder DE-Punktvorhersage** (Vorhersage, Eventplanung, Tourenplanung), nicht nur am Radar (§1.3).
2. **Nur DE ist betroffen.** INCA (AT) und rzc (CH) liefen nie über Netlify (§1.1). Ein
   Daten-Repo-Spiegel würde AT/CH nichts sparen — und nichts kosten.
3. **Der Weg über das Daten-Repo scheitert nicht am Format oder an der Lizenz, sondern am
   Takt — und das ist heute messbar, nicht nur vermutet:** der Batch des Daten-Repos selbst
   startet gegen seine eigenen Cron-Slots mit **Median +17 min, 42 % über +20 min, nur 12 %
   innerhalb von 5 min** (45 geplante Läufe seit dem 26.08., §3.1). Ein 5-Minuten-Produkt an
   einem Cron mit 17 min Streuung ist kein Radar mehr, sondern eine Momentaufnahme mit
   zufälligem Alter. **Nachgemessen auf Jans Einwand (§8):** der ICON-Weg ist im Normalfall
   tatsächlich nur **+1 min** hinter der Quelle (17 von 29 Läufen) — weil sein Slot 47 min VOR den
   Daten liegt und der Producer wartet; die übrigen 12 Läufe lagen 7–85 min dahinter oder hatten
   drei Stunden lang keinen vollständigen Stand (4 Läufe). Beim Radar gibt es kein „vorher".
4. **Drei Konsequenzen, die §26.3 noch nicht kannte:** (a) das Daten-Repo hat **einen**
   Publisher, der die ganze Historie per Force-Push ersetzt — ein zweiter Schreiber alle
   5 Minuten würde mit ihm um denselben Baum kämpfen, verlorene Läufe inklusive (§3.3) ⇒ wenn
   überhaupt, dann ein **eigenes Repo**; (b) jsDelivr hält ein einmal angefragtes 404 am Origin
   fest (§28 gemessen) ⇒ der aggressive Zeitstempel-Rat aus BW-5 funktioniert dort nicht, der
   Client müsste **einen Slot zurück** raten ⇒ systematisch +5 min (§3.2); (c) die
   GitHub-Actions-Bedingungen verbieten ausdrücklich, Actions „as a content delivery network"
   zu benutzen — ein 24/7-Spiegel fremder Messdaten im 5-Minuten-Takt ist genau das, der
   8-mal-täglich-Repack eigener Ableitungen ist es nicht (§3.5).
5. **Es gibt einen Weg, der dieselben Netlify-Bytes spart und die Frische unangetastet lässt:**
   der Proxy an einen Ort, der Bandbreite nicht abrechnet — ein Cloudflare Worker als
   CORS-Proxy mit Cache (100 000 Anfragen/Tag frei, Egress nicht berechnet, kein Batch, kein
   Repo, DWD-Verzug bleibt 3,3 min). Das ist der Weg, den §26.3 als „anderer Ort für den
   Edge-Proxy" schon benannt hat; er kostet ein neues Konto (§4 B) — **deine Entscheidung**.
6. **Empfehlung:** kein Radar im Daten-Repo (V-BW-29 bestätigt, mit drei neuen Gründen). Wenn
   die Radar-Bytes auf der Netlify-Rechnung sichtbar sind: Weg B. Wenn du den Repo-Weg trotzdem
   willst: nur so, wie §5 ihn beschreibt (eigenes Repo, Dauerjob statt Cron, roher Spiegel,
   konservativer Rat, Retention ≤ 1 h) — und mit dem Wissen, dass das Radar dann 6–10 min alt ist.

## 1. Was heute über Netlify läuft (Ist-Messung)

### 1.1 Warum überhaupt Netlify: kein CORS beim DWD — heute nachgemessen

```
curl -sI -H 'Origin: https://buscosun.com' https://opendata.dwd.de/weather/radar/composite/rv/DE1200_RV2608291355.tar.bz2
HTTP/1.1 200 OK · Content-Length: 642449 · Last-Modified: Sat, 29 Aug 2026 13:58:26 GMT
(kein Access-Control-Allow-Origin — ebenso auf rv/, konrad3d/, KONRAD3D_20260829T135500.xml, ry/…latest)
```

Der Browser darf `opendata.dwd.de` nicht direkt lesen ⇒ jeder Radar-Byte für DE läuft über den
Rewrite `/_dwd_opendata/*` (`netlify.toml:24-29`, Pass-Through ohne Edge-Cache) und zählt auf
Netlify. AT (GeoSphere INCA, CORS `*`) und CH (MeteoSchweiz rzc via STAC, CORS `*`) werden **direkt**
geladen (`docs/API.md` §3/§4) — sie kosten Netlify nichts und sind für diese Frage irrelevant.

### 1.2 Größe je Lauf — 48 h Verzeichnis, heute (nasses Wetter über DE)

Gelesen aus den nginx-Listings (exakte Bytes je Datei), 577 RV-Läufe / 576 KONRAD3D-Dateien:

| Produkt | Takt | Mittel | Median | min | max | je Tag | je Monat (Quelle) |
|---|---|---:|---:|---:|---:|---:|---:|
| RADOLAN-RV `DE1200_RV<ts>.tar.bz2` (25 Frames 1100 × 1200) | 5 min | 1 226 KB | **1 362 KB** | 130 KB | **2 409 KB** | 345 MB | 10,1 GB |
| KONRAD3D `KONRAD3D_<ts>.xml` | 5 min | 324 KB | **255 KB** | 4 KB | **1 030 KB** | 91 MB | 2,7 GB |
| KONRAD3D-Verzeichnislisting (je Abruf) | — | 78,5 KB | | | | | |
| RADOLAN-RY latest (nicht verdrahtet) | 5 min | 23,8 KB | | | | | |

**Befund V-RD-1:** die 0,36 MiB aus BW-5 (§24) waren ein trockener Tag. Der Tar ist bz2 über
uint16-Rohdaten; seine Größe folgt der Regenfläche. Heute liegt der Median **3,8×** über der
BW-5-Zahl, das Maximum **6,7×**. Jede Bandbreiten-Rechnung für Radar muss mit dem **nassen**
Median rechnen, weil Radar-Nutzung und Tar-Größe dieselbe Ursache haben.

Veröffentlichungsverzug heute: RV-Slot 13:55 → abgelegt 13:58:26 (**3,4 min**, wie BW-5: 3,3),
KONRAD3D 13:55:00 → 13:59:45 (**4,75 min**).

### 1.3 Wer den Tar lädt — alle Verbraucher (Code)

| Verbraucher | Datei | Was | Wann |
|---|---|---|---|
| Regenradar DE | `nowcast/NowcastRadarMap.tsx:205` | RV-Tar + KONRAD3D (Listing + XML via `cellLayers.ts`) | beim Öffnen, dann **alle 5 min bei sichtbarem Tab** (`CELLS_POLL_MS`, `autoTick`) |
| Regenradar Rückblick | `radar/radarFrames.ts`, `fetchRvAnalysisSequence` | **8 weitere Tars** (nur auf Abruf, BW-5) | Abspielen / Rückwärts / Scrub an den Anfang |
| Wetterkarte Niederschlag / Flow-Nowcast / Regen-Chance | `MapView.tsx` (`refreshNowSource`, t9) | RV-Tar | beim Aktivieren, alle 5 min |
| Wetterkarte Zellbahnen / Hagel DE | `MapView.tsx:2746/2857` | KONRAD3D Listing + XML | alle 5 min (`CELLS_POLL_MS`/`HAIL_POLL_MS`), nur sichtbar |
| KI-Nowcaster-Hindcast | `ml/radarHindcast.ts` (`HINDCAST_FRAMES 4`) | 4 Tars (Cache greift) | Skill-Anzeige |
| **Punktvorhersage DE** | `pointForecast.ts:225` (`includeRadarNowcast`) | **den ganzen RV-Tar für einen Punkt** | `PointForecastPanel` (Vorhersage/Karte-Klick), `EventResult.tsx:100` (Eventplanung), `weatherEnrichment.ts:201` (Tourenplanung) |

**Befund V-RD-2:** die DE-Punktvorhersage lädt für **eine** Zahlenreihe (Regen am Punkt, 0–120 min)
den vollen 25-Frame-Tar (heute 1,36 MB). Es gibt beim DWD kein kleineres Produkt mit Vorlauf
(RY latest ist 24 KB, aber nur Analyse ohne Vorhersage). Innerhalb einer Sitzung dedupliziert die
Cache-API (`RV_TAR_CACHE`, `radolan.ts:136`) den Tar über alle Verbraucher — aber jede neue
Sitzung zahlt ihn einmal, auch die, die nie ein Radar öffnet.

### 1.4 Was eine Sitzung kostet (Netlify-Bytes, heute)

| Sitzung | Erstbild | je 5 min offen | Rückblick |
|---|---:|---:|---:|
| Regenradar DE (Tar + Listing + XML) | **≈ 1,7 MB** (nass) · ≈ 0,5 MB (trocken) | +1,7 MB | +10,9 MB (8 × 1,36) |
| Wetterkarte Niederschlag | 1,36 MB | +1,36 MB | — |
| Vorhersage / Event / Tour DE (Punkt) | 1,36 MB | — | — |

Hochrechnung (Netlify Starter: 100 GB/Monat; „Sitzung" = Erstbild + 2 Refreshes, kein Rückblick):

| Radar-Sitzungen je Tag | nass (≈ 5 MB) | trocken (≈ 1,5 MB) |
|---:|---:|---:|
| 100 | 15 GB | 4,5 GB |
| 300 | 45 GB | 13,5 GB |
| 700 | **105 GB** | 31,5 GB |

Das Repo kennt keine Besucherzahl — **die Zeile, in der buscosun heute steht, liest nur du im
Netlify-Dashboard.** Die Tabelle sagt nur: ab einigen hundert nassen Radar-Sitzungen je Tag ist
das Radar **allein** die ganze Freigrenze. Zum Vergleich §27: die ICON-EU-Sondierung kostet
48,5 MB je Aufruf, das Höhenwind-Dock 28,9 MB je Ebene — je Aufruf 20–30× mehr als ein Radar-Erstbild,
aber ohne 5-Minuten-Refresh und auf Seiten, die seltener geöffnet werden. Welcher Posten monatlich
größer ist, entscheidet die Besucherverteilung, nicht die Dateigröße.

## 2. Wie das Daten-Repo heute veröffentlicht — die Mechanik, an der ein Radar hängen müsste

| | Ist (ICON-D2-Repack, BW-2/BW-9) | Quelle |
|---|---|---|
| Producer | `scripts/repack-icon-d2.mjs`, läuft **im Daten-Repo** (Standard-Token, kein Secret), klont `buscosun-web` sparse | `scripts/repack-repo/workflow-build.yml` |
| Takt | **16 Slots/Tag** (`20 0,3,…` + Sicherheitsnetz `30 2,5,…`), Warteschleife bis 40 min | ebd. Z. 37/41 |
| Publish | `publish-repack.mjs`: `ls-remote`-Wächter → flacher Klon → Retention `KEEP 4` → **`git init` + ein Commit + `push --force HEAD:main`** — jeder Publish ersetzt die **gesamte** Historie | `publish-repack.mjs:100-265` |
| Sichtbar werden | Zeiger `runs/<run>/index.json` (neuer Pfad ⇒ 35–57 s), `index.json` purgen + nachprüfen; Dateien am **Commit-SHA** (`immutable`) | §28.6/§28.9 |
| Größe | Baum ≈ 21 MiB (4 Läufe); GitHub meldet heute **`size: 50 502 KB ≈ 49 MiB`** — die abgehängten Historien liegen bis zur GitHub-GC weiter im Repo (V-RD-4) | `api.github.com/repos/jppetry/buscosun-data` |
| Nebenläufigkeit | `concurrency: group: repack-build`, ein Job zur Zeit | Workflow Z. 46 |

Der Client liest `index.json` vom CDN (S1), das Manifest bleibt Fallback. **Für ein
5-Minuten-Produkt wäre keine dieser Stufen unverändert brauchbar** — s. §3.

## 3. Befunde — was ein Radar-Spiegel anders ist

### 3.1 R1 — Der Takt, gemessen am eigenen Batch

GitHub-Dokumentation (`docs.github.com/…/events-that-trigger-workflows`, heute gelesen):
„The shortest interval you can run scheduled workflows is once every 5 minutes." · „The
`schedule` event can be delayed during periods of high loads … High load times include the
start of every hour." · „In a public repository, scheduled workflows are automatically disabled
when no repository activity has occurred in 60 days."

Wie groß „delayed" wirklich ist, steht im eigenen Repo: die 45 geplanten Läufe des Daten-Repos
seit dem 26.08. gegen die **live** Cron-Slots (`created_at` des Laufs minus nächster
vorangehender Slot):

| | min | p50 | p90 | max | ≤ 5 min | > 10 min | > 20 min |
|---|---:|---:|---:|---:|---:|---:|---:|
| Start-Versatz | 0,9 min | **17,4 min** | 102 min | 114,6 min | **12 %** | 77 % | 42 % |

(Skript: `created_at` aus `api.github.com/repos/jppetry/buscosun-data/actions/runs`, Slots aus
der live `build.yml`; die sechs schlechtesten: 27.08 02:02 · 05:06 · 08:12, 28.08 05:11 · 08:14 · 16:29 —
jeweils > 100 min hinter dem Slot, also praktisch **ausgefallene** Slots, die erst mit dem nächsten
Fenster nachliefen.) Für den ICON-Batch ist das erträglich, weil die Warteschleife den Jitter
schluckt (§28.5 B1). Für ein 5-Minuten-Produkt heißt es: **ein Cron `*/5` träfe seinen Slot in
einem von acht Fällen**, die übrigen Läufe kämen 5–100 min später oder gar nicht.

**Der einzige Ausweg im Actions-Rahmen** ist ein **Dauerjob**: stündlich starten, innerhalb des
Jobs alle 5 min pollen und pushen (Job-Grenze 6 h, 20 gleichzeitige Jobs, 1 000 API-Anfragen/h je
Repo — alles unkritisch). Dann liegt der Jitter nur an der Stundennaht (überlappend starten,
z. B. 70-min-Jobs), aber der Runner ist **24 h am Tag belegt** (720 h/Monat — für öffentliche Repos
kostenlos, aber sichtbar, s. R5).

### 3.2 R2 — Die Frische-Kette: aus 3,3 min werden 6–25

| Glied | heute (Netlify-Rewrite) | Repo mit Cron `*/5` | Repo mit Dauerjob |
|---|---:|---:|---:|
| DWD-Ablage nach Slot | 3,3 (RV) / 4,75 (KONRAD) | 3,3 | 3,3 |
| Bemerken | 0 (Client rät den Slot, BW-5) | Cron-Jitter **p50 17** | Poll ≤ 0,5 |
| Herunterladen + Push | — | ≈ 1 | ≈ 1 |
| jsDelivr neuer Pfad sichtbar | — | 0,6–1 (§28.6: 35–57 s) | 0,6–1 |
| Client-Rat | aggressiv, 404 korrigiert (≈ 97 % Treffer) | **konservativ, ein Slot zurück** (s. u.) +0…5 | +0…5 |
| **Alter des „jetzt"-Bildes** | **≈ 3,5–4 min** | **p50 ≈ 22 min**, best 6 | **≈ 6–10 min** |

Warum der Rat konservativ werden muss: §28.9 hat gemessen, dass jsDelivr **ein vorher angefragtes
404 am Origin eine Weile festhält** (die Purge-Nachprüfungen liefen deshalb ins Leere; neue Pfade
„ehrlich 1–4 min"). Fragt der erste Client den Slot an, bevor der Spiegel ihn gepusht hat — und bei
3,3 min DWD-Verzug plus Push ist das der Normalfall —, hält das CDN die Abwesenheit fest, **für
alle**. Also muss der Client den Slot anfragen, der sicher schon liegt: einen zurück. Das sind
5 Minuten, die BW-5 mit dem 404-Rat bewusst gewonnen hat und die hier wieder verloren gingen.

Das Regenradar zeigt sein Alter schon heute an (`nowcastView.ts:118` `ageMin`) — die Anzeige wäre
also ehrlich. Aber der Rückblick verschöbe sich mit, der Hindcast des KI-Nowcasters (4 Frames) auch,
und die Punktvorhersage „Regen in 10 min" beruhte auf einem 10 min alten Lauf.

### 3.3 R3 — Zwei Schreiber, eine Historie

`publish-repack.mjs` baut den Baum aus **flachem Klon + lokaler Ausgabe** neu, `git init`, ein
Commit, `push --force HEAD:main`. Zwischen Klon und Push liegen gemessen **bis 210 s** (Publish-
Schritt §28.9, Purge-Nachprüfungen). Ein Radar-Publisher, der alle 5 min dasselbe täte, erzeugte
zwei Rennen:

- Radar pusht **während** der ICON-Publisher zwischen Klon und Push steht ⇒ der ICON-Push
  überschreibt den Radar-Lauf ⇒ ein Slot fehlt, Clients laufen in 404 (und in den Netlify-Fallback,
  wenn es einen gibt — dann genau in der Stunde, in der der Batch läuft: 16-mal am Tag).
- ICON pusht **während** der Radar-Publisher zwischen Klon und Push steht (≈ 30 s Fenster, alle
  5 min) ⇒ der Radar-Push überschreibt den ICON-Lauf. Dateien, die schon am Commit-SHA abgerufen
  wurden, liefert jsDelivr weiter aus seinem S3 („permanently cache"); alle anderen 404 ⇒ GRIB-
  Fallback (BW-3) für alle Besucher bis zum nächsten Slot — **drei Stunden**.

Das ließe sich nur mit einem **gemeinsamen Publisher** (der Radar-Dauerjob übernimmt den ICON-
Publish — ein Umbau der BW-2/BW-9-Kette) oder einem **eigenen Repo** (`buscosun-radar`: eigene
Historie, eigene Nebenläufigkeit, eigenes jsDelivr-Paket) vermeiden. **Wenn gebaut wird, dann
eigenes Repo** — das ist keine Option, sondern die Voraussetzung.

### 3.4 R4 — Grenzen von jsDelivr und GitHub

jsDelivr (`github.com/jsdelivr/jsdelivr` README, heute gelesen): „Packages larger than 150 MB or
single files larger than 20 MB (in the case of GitHub) are not supported by default." · Branches
„12 hours", Commit-Hashes „Effectively forever … permanently cache the files in our S3 storage." ·
„There are no bandwidth limits."

| Grenze | Radar-Spiegel | Bewertung |
|---|---|---|
| 20 MB je Datei | RV max 2,4 MB | ok |
| 150 MB je Paket (= Repo-Stand am Ref) | Retention muss **≤ 1 h** bleiben: 12 RV × 1,4 + 12 KONRAD × 0,3 ≈ 20 MB; die DWD-Retention (48 h, 437 MB) ist **nicht** abbildbar | ok nur mit kurzer Retention — der Rückblick (8 Läufe) passt, mehr nicht |
| Branch-Cache 12 h | unveränderliche Dateinamen je Lauf (haben wir) — aber **kein Verzeichnislisting** auf dem CDN ⇒ KONRAD3D braucht zwingend gerechnete Zeitstempel (H12) | Umbau nötig |
| GitHub-Repo-Wachstum | 288 Force-Pushes/Tag × 1,7 MB = **≈ 490 MB/Tag** neue Objekte; abgehängte Historie bleibt bis zur GitHub-GC — das Daten-Repo zeigt heute **49 MiB für einen 21-MiB-Baum** (V-RD-4). GitHub empfiehlt < 1 GB, warnt ab 5 GB; die GC-Kadenz ist undokumentiert | **Risiko**, nicht beherrschbar von unserer Seite |
| Actions-Minuten | öffentlich: „GitHub Actions usage is free … for public repositories that use standard GitHub-hosted runners" | ok |

### 3.5 R5 — Nutzungsbedingungen

GitHub Terms for Additional Products, „Actions" (heute gelesen): verboten ist „Any activity that
places a burden on our servers, where that burden is disproportionate to the benefits provided to
users (for example, **don't use Actions as a content delivery network** or as part of a serverless
application)" und „Any other activity unrelated to the production, testing, deployment, or
publication of the software project".

Der heutige Repack — 16 Läufe/Tag, **eigene Ableitung** (PNG aus GRIB mit den Modulen des Projekts),
8 Läufe Retention — ist als „publication of the software project" vertretbar. Ein Spiegel, der
**fremde Messdaten unverändert** alle 5 min 24/7 durch GitHub schleust, damit ein CDN sie
ausliefert, ist wörtlich „Actions as a content delivery network". Das ist keine juristische
Auskunft, aber der Text ist eindeutig genug, dass man ihn vor dem Bau gelesen haben sollte. Beim
Repack-Format (§3.7) wird der Unterschied kleiner, nicht null — der Takt bleibt.

jsDelivr selbst nennt keine Grenze, ist aber ein kostenloser Dienst ohne SLA (§21) — ein 288-Läufe-
Tag mit je 2 neuen Pfaden ist bei ihnen kein Volumen, aber wir hätten **den Radar-Erstbild-Pfad
an zwei Fremddienste** gehängt (GitHub + jsDelivr), wo heute einer steht (Netlify).

### 3.6 R6 — Lizenz: kein Blocker

RADOLAN und KONRAD3D sind DWD-OpenData, **CC BY 4.0 / GeoNutzV** (`docs/API.md` §2, Attribution in
`radolan.ts:39` und `dwdKonrad3d.ts:22`). Weiterverbreitung mit Namensnennung ist erlaubt — der
PNG-Repack (D-31) tut das für ICON-D2 seit BW-4 unter derselben Lizenz. Die Attribution bliebe
wortgleich. **Kein** Fall wie die amtlichen Warnungen (§7 `docs/API.md`, kein Durable-Cache).

### 3.7 R7 — Format: roher Spiegel oder Repack

| | Roher Spiegel (Tar/XML 1:1) | Repack (25 Grau-PNG + GeoJSON) |
|---|---|---|
| Job | Download + Push, ≈ 30–60 s, kein Decoder | Decode in Node: `radolanDecode.ts` ist DOM-frei (läuft im Worker), `parseKonrad3d` ist ein eigener Pull-Parser ohne `DOMParser` ⇒ **dieselben Module wie der Client**, BW-1-Regel hält |
| Größe je Lauf | 1,36 + 0,26 MB (Median) | RV ≈ 0,5–1 MB (§26.3: 20–40 KB je Frame), KONRAD ≈ 10–30 KB ⇒ **≈ 40–60 % kleiner** im nassen Fall, im trockenen **größer** als der Tar |
| Browser | bz2 bleibt (inkl. V-WF-10: 4-s-WASM-Timeout ⇒ pure-JS 33 s) | kein bz2, kein Tar-Split, Worker-Dekode entfällt |
| Aufwand | klein | mittel (Producer + Client-Leser + Verifier, Muster `repackSource.ts`) |
| Wenn gebaut | **erst roh** — der Takt ist das Problem, nicht das Format | zweite Stufe |

### 3.8 R8 — Was im Client zu ändern wäre

- `radolanRuns.ts` ist die **eine** Stelle für Verzeichnis und Tar-URL (`RV_DIR`, `rvTarUrl`), der
  Router-Frühstart (`warmRvTar`) und der Leser (`fetchRvBytesCached`) nehmen sie ⇒ ein Resolver
  „CDN zuerst, Netlify als benannter Fallback" bliebe an einem Ort. Aber: ein 404 vom CDN ist
  **zweideutig** („noch nicht gespiegelt" vs. „gibt es nicht") — der Fallback auf Netlify holte die
  Frische zurück, **genau in den Momenten, in denen der Spiegel hinterherhinkt** (Stundenanfang,
  R1) ⇒ die Netlify-Bytes kämen dann zurück, wenn es am vollsten ist.
- Cache-API-Schlüssel (`RV_TAR_CACHE`) wechseln mit der URL — unschädlich, ein Lauf = eine URL.
- `dwdKonrad3d.ts`: Listing entfällt (kein Listing auf dem CDN) ⇒ gerechnete Zeitstempel mit
  KONRAD-Verzug 4,75 min (H12, ohnehin offen — V-RD-3).
- Service Worker reicht `cdn.jsdelivr.net` durch (`sw.js:64/89`) — nichts zu tun.
- `shareInFlight`-Schlüssel, Decoder, Warp-Mesh, Punktabfrage: unverändert.

## 4. Die Wege im Vergleich

| | **A — Daten-Repo-Spiegel** (deine Idee) | **B — Proxy an einem Ort ohne Bandbreitenrechnung** (Cloudflare Worker) | **C — Netlify bleibt, Volumen senken** |
|---|---|---|---|
| Netlify-Bytes Radar DE | 0 (mit Fallback: 0 bis „hinkt") | **0** (Überlauf ⇒ Fehler ⇒ Netlify-Fallback) | −5 % (Listing, H12) bis −30 % (Punktvorhersage ohne Tar — geht nicht, V-RD-2) |
| Frische | **6–25 min** (R2) | **3,3 min, unverändert** — kein Batch, der Worker holt beim DWD und cacht je Lauf | unverändert |
| Betrieb | eigenes Repo + Dauerjob 24/7 + Publisher + Purge | 1 Worker (~60 Zeilen), Cache-API dedupliziert DWD-Abrufe | — |
| Grenzen | 150 MB Paket, Repo-Wachstum, ToS-Text (R4/R5) | Free: **100 000 Anfragen/Tag**, 10 ms CPU, 50 Subrequests, **Egress nicht berechnet**; Reset 00:00 UTC, Überschreiten ⇒ Fehler (`developers.cloudflare.com/workers/platform/pricing`, heute gelesen). Ein Radar-Tab ≈ 36 Anfragen/h ⇒ ≈ 2 800 Tab-Stunden je Tag frei | — |
| Neue Abhängigkeit | GitHub-Actions-Betrieb + jsDelivr (beide schon da) | **neues Konto** (Cloudflare) — Jans Vorbehalt aus §21 („neuer Provider"); kein Secret im Repo nötig, der Worker-Code ist öffentlich | keine |
| Latenz | jsDelivr-PoP (gut) | Cloudflare-PoP FRA/ZRH/VIE (besser als der Netlify-Rewrite, §21: Netlify-Knoten stehen nicht in DACH) | — |
| STOPP & FRAGEN | ja (Workflow, Speicherweg) | ja (Transportweg) | nein (Client) |
| Aufwand | 2–3 Sessions | ≈ 1 Session | < 1 Session |

**Zu B, damit es nicht wie ein Freibrief klingt:** Cloudflare misst Anfragen, nicht Bytes; 100 000
am Tag sind bei einem Radar mit 5-Minuten-Refresh kein Polster für alle Zeiten. Der Worker müsste
zwei Dinge tun, die der Netlify-Rewrite nicht tut: die Antwort **je Lauf** cachen (Cache-API,
`immutable`, Dateiname trägt den Zeitstempel) und Fehler als 5xx statt als leere 200 melden, damit
der Client sauber auf `/_dwd_opendata` zurückfällt (Rule 2). Und er wäre ein **zweiter
Transportweg**, den `docs/API.md` §1 heute nicht kennt.

## 5. Falls du A trotzdem willst — der einzig tragfähige Zuschnitt

1. **Eigenes Repo** `buscosun-radar` (R3), eigener Workflow, eigene Retention (12 Läufe ≈ 1 h,
   R4). Das Daten-Repo und `publish-repack.mjs` bleiben unangetastet.
2. **Dauerjob statt Cron** (R1): stündlich, 70 min Laufzeit, Poll alle 30 s auf den nächsten Slot
   (Muster `REPACK_WAIT_SEC`/`expectedRunOf`), Push je neuem Lauf; `concurrency` erlaubt zwei
   überlappende Jobs.
3. **Roher Spiegel** zuerst (R7), Repack als Stufe 2 — mit `verify:radar-mirror` (Byte-Gleichheit
   Spiegel ↔ DWD, Tar mit 25 Einträgen, KONRAD `refMs ≠ 0`).
4. **Client**: Resolver in `radolanRuns.ts` (CDN-Basis + Netlify-Fallback an zwei Fristen wie
   `repackSource.ts`), **konservativer Rat** (ein Slot zurück, R2) — und ein Satz im Regenradar,
   dass „jetzt" der Lauf von vor N Minuten ist (das Feld gibt es: `ageMin`).
5. **Kill-Switch** `?radarcdn=0` / `localStorage.radarcdn`, Query schlägt Speicher (D-31-Muster).
6. Vorher lesen: R5. Und die Frage in §1.4 beantworten — **ob** die Radar-Bytes überhaupt der
   Posten sind, der die Rechnung treibt. Ohne Besucherzahl ist das nicht aus dem Repo ableitbar.

## 6. Entscheidungen (Jan)

| # | Frage | Default |
|---|---|---|
| E1 | Radar/KONRAD ins Daten-Repo? | **Nein** — V-BW-29 bestätigt: Takt (R1), Frische (R2), Schreiber-Rennen (R3), ToS (R5) |
| E2 | Wenn die Radar-Bytes die Rechnung treiben: Weg B (Cloudflare Worker) freigeben? | offen — neues Konto ist deine Entscheidung; technisch der kleinere Eingriff und ohne Frischeverlust |
| E3 | Unabhängig davon H12 (KONRAD-Listing 78,5 KB je 5 min durch gerechnete Zeitstempel) umsetzen? | ja, klein, Client-only (V-RD-3) |
| E4 | Besucherzahl / Radar-Anteil aus dem Netlify-Dashboard nachtragen, damit §1.4 eine Zeile hat statt einer Tabelle? | ja |

## 7. V-Katalog

| # | Befund | Mehrwert | Skizze |
|---|---|---|---|
| **V-RD-1** | RV-Tar ist wetterabhängig 0,13–2,4 MB; die BW-5-Zahl 0,36 MiB war ein trockener Tag; Radar-Nutzung und Tar-Größe korrelieren | Bandbreiten-Rechnungen für Radar müssen mit dem nassen Median (1,36 MB) rechnen | `audit/bandbreite.md` §24/§26.4 mit Vorbehalt versehen |
| **V-RD-2** | DE-Punktvorhersage (Vorhersage, Event, Tour) lädt den vollen 25-Frame-Tar für eine Punktreihe; kein kleineres DWD-Produkt mit Vorlauf | benennt den zweitgrößten Radar-Posten außerhalb des Radars | nur ein Server-Repack könnte hier sparen (Punkt-Extrakt) — derselbe Takt wie A, nicht empfohlen |
| **V-RD-3** | KONRAD3D-Listing 78,5 KB je 5 min und Sitzung (= H12, offen) | ≈ 5 % der Radar-Bytes, Client-only | `guessRvRuns`-Muster mit Verzug 4,75 min, 404-Rat, Listing als Fallback |
| **V-RD-4** | Daten-Repo meldet 49 MiB bei 21-MiB-Baum — Force-Push-Historien bleiben bis zur GitHub-GC | jeder weitere Force-Push-Takt vergrößert das; Grenze und GC-Kadenz unbekannt | beobachten (`api.github.com/repos/jppetry/buscosun-data` `size`), ggf. GitHub-Support fragen, bevor ein 288/Tag-Takt dazukommt |
| **V-RD-5** | Cron-Jitter des Daten-Repo-Batches p50 17 min, 13 % > 100 min (praktisch ausgefallene Slots) | betrifft auch die §28-Aussage „Lauf + 70…74 min" — bei ausgefallenem Slot greift erst das Sicherheitsnetz (+150) | Slots und Ausfälle im Repack-Zeiger protokollieren (`publishedAt` vs. Slot), Verteilung nach einer Woche nachtragen |
| **V-RD-6** | Der Netlify-Rewrite `/_dwd_opendata` liefert DWD-Fehler als Pass-Through; ein Rückfall auf ihn aus einem CDN-Pfad heraus holt die Bytes zurück, wenn der Spiegel hinkt | Fallback-Semantik muss VOR dem Bau feststehen (404 = „noch nicht" vs. „nie") | Resolver mit Fristen statt Statuscodes, wie `repackSource.ts` |

## 8. Nachmessung (Jans Einwand): Wie groß ist der Versatz DWD → Daten-Repo heute wirklich?

> „Aber die aktuellen Daten in buscosun-data haben doch auch fast keinen Verzug zur
> Primärquelle, oder?" — Gemessen, nicht geschätzt: je Batch-Lauf seit dem 26.08. die
> Schrittzeiten `Repack`/`Publish` aus der Jobs-API (`…/actions/runs/<id>/jobs`, 33 Läufe), die
> DWD-Ablagezeit der **letzten** benötigten Datei (`tot_prec` Schritt 027, `Last-Modified`:
> 09z heute 10:07:11, 12z heute 13:07:38 ⇒ **Lauf + 67:38**; ältere Läufe hält der DWD nicht mehr,
> dort ist +67:38 die Annahme — §28.1 maß +66), Versatz = Publish-Ende − DWD-Ende. Dazu kommen
> auf dem CDN 35–57 s (§28.6). Skript: `scratchpad/offset.py`, Rohdaten `jobs.json`.

### 8.1 Die Antwort: ja — im Median. Nein — in der Verteilung.

| ICON-Lauf | Versatz DWD-Ende → Repo vollständig | Was passiert ist |
|---|---:|---|
| 26.08 00z · 03z · 06z · 09z · 12z · 15z | **−0,7 … −0,3 min** | Normalfall: Slot +20, Start +13…+33, Producer wartet, rechnet Schritt für Schritt, publiziert < 1 min nach der letzten DWD-Datei |
| 26.08 18z | +2,9 | Start +42, Daten lagen schon |
| 26.08 21z | +14 | Sicherheitsnetz 20:30 startete +47 (21:17), wartete auf **21z** statt 18z zu prüfen, publizierte 21z **unvollständig** um 21:58 (Budget); Hauptslot 21:20 kam +59 (22:19) und vervollständigte um 22:21 |
| 27.08 00z · 09z · 15z · 21z | −0,1 … +0,2 | Normalfall |
| 27.08 03z · 06z | **+7 · +66** | Slot-Start +53 bzw. +112 min (GitHub) |
| **27.08 12z** | **nie** | Slot 12:20 **ausgefallen**, 14:30 ausgefallen, 11:56-Lauf sprang vor den Daten ab; 16:01 rechnete schon 15z |
| **27.08 18z** | **nie vollständig** | Sicherheitsnetz 17:30 startete +42 (18:11), wartete auf 18z, publizierte um 18:53 einen Lauf mit **≈ 5 Schritten** (DWD-Schritt 000 kommt +44); 18:20 und 20:30 ausgefallen ⇒ 3 h lang unbrauchbar |
| **28.08 00z** | **nie** | 00:20 und 02:30 ausgefallen; 03:25-Lauf wartete auf 03z |
| 28.08 03z | −1,1 → **+65,5** | Start **+6** ⇒ Budget endete 04:05:54, DWD fertig 04:07:38 ⇒ **unvollständig** publiziert; vervollständigt vom Hauptslot, der +112 startete |
| 28.08 06z | +68 | Start +115 |
| 28.08 09z · 18z · 21z | 0,0 … +0,2 | Normalfall |
| **28.08 12z** | **nie vollständig** | Sicherheitsnetz 11:30 startete +47 (12:17), wartete auf 12z, Budget aus um 12:57 (DWD fertig 13:07) ⇒ unvollständig; 12:20 und 14:30 ausgefallen |
| 28.08 15z | +23 | Start +69 |
| 29.08 00z · 03z · 06z · 12z | −0,3 … +0,9 | Normalfall — **12z heute: DWD 13:07:38 → Publish-Ende 13:08:30 (+52 s)** |
| 29.08 09z | −1,4 → **+84,5** | Start **+5** ⇒ Budget endete 10:05:52, DWD-Schritt 026 kam 10:06:38, 027 um 10:07:11 ⇒ `precip`/`cape` unvollständig; Sicherheitsnetz 11:30 vervollständigte um 11:32 |

**Über 29 ICON-Läufe (26.–29.08.):** 17 Läufe (**59 %**) innerhalb **±1 min** nach der letzten
DWD-Datei — das ist die Zahl, die deinem Eindruck entspricht, und sie ist echt. Aber: 3 Läufe
kamen mit +7…+23 min, 4 Läufe mit **+65…+85 min** (erst unvollständig, dann nachgeliefert), und
**4 Läufe (14 %) hatten drei Stunden lang keinen vollständigen Stand auf dem CDN** — zwei gar
keinen, zwei einen mit 5 bzw. ~20 Schritten. In diesen Stunden liefen die Clients still auf den
GRIB-Pfad zurück (`sectionCovers`, BW-10; `precip`/`cape` alles-oder-nichts) — also **auf
Netlify**. Median ≈ 0, p75 ≈ 20 min, p90 ≈ 70 min, 14 % ∞.

### 8.2 Warum der Median so gut ist — und warum genau das für Radar nicht übertragbar ist

Der kleine Versatz entsteht **nicht**, weil GitHub pünktlich wäre (§3.1: p50 +17 min). Er
entsteht, weil der Slot **47 min vor den Daten** liegt und der Producer dann alle 30 s pollt:
der Jitter fällt in die Wartezeit. Das setzt drei Dinge voraus, die ein 5-Minuten-Produkt nicht hat:

1. **Ein bekannter Datenzeitpunkt weit in der Zukunft** (Lauf + 44…+68 min, auf die Minute
   regelmäßig) — Radar hat ihn alle 5 min, „vorher starten und warten" heißt dort: nie aufhören.
2. **Ein Produktzyklus, der Jitter schluckt** — 3 h Zyklus, 40 min Budget. Beim Radar ist der
   Zyklus 5 min; jeder Jitter über 5 min ist schon ein verpasster Lauf.
3. **Ein Sicherheitsnetz, das Ausfälle abfängt** — und selbst das schaffte hier an zwei von vier
   Tagen nicht alle: am 27. und 28.08. fielen **je ~6 von 16 Slots aus** (kein Lauf gestartet),
   am 26.08. keiner. Beim Radar wären das Lücken von 1–2 h, mehrmals am Tag, ohne Netz.

Der ICON-Weg ist also im Normalfall so frisch wie die Quelle **plus 1–2 min** — und in ~25 % der
Läufe 20 min bis 3 h dahinter. Für ein Modell, das alle 3 h kommt, ist das ein Schönheitsfehler
(V-RD-7/8/9 unten machen ihn kleiner). Für ein Radar, das alle 5 min kommt, wäre dieselbe
Verteilung das Produkt: „meistens 6–10 min alt, manchmal eine Stunde".

### 8.3 Drei Befunde an der laufenden ICON-Kette (Beifang, je ein Zeilen-Fix)

| # | Befund | Beleg | Skizze |
|---|---|---|---|
| **V-RD-7** | Das Wartebudget (`REPACK_WAIT_SEC 2400`) zählt **ab Job-Start**, nicht ab dem erwarteten Datenzeitpunkt. Slot +20 + 40 min = +60 < DWD-Ende +67:38 ⇒ **je pünktlicher GitHub startet, desto sicherer bricht der Lauf ab**: Start +5 (heute 09z) und +6 (28.08 03z) ⇒ unvollständig; Start +13 ⇒ vollständig. §28.5 rechnete mit Jitter +7…+31 und übersah den pünktlichen Fall | Läufe 76, 92 (Repack-Dauer 40,2/40,4 min, Publish vor DWD-Ende) | Budget an den Lauf binden: warten bis `max(start + 40 min, runAt + 75 min)` — eine Zeile in `repack-icon-d2.mjs` (`waitLeft`) |
| **V-RD-8** | Das Sicherheitsnetz (+150) landet bei Jitter > 30 min im **nächsten** 3-h-Slot; `expectedRunOf()` lässt es dann auf den **nächsten** Lauf warten und diesen bei Budgetende unvollständig publizieren — statt den vorigen zu prüfen | Läufe 63, 73, 80 (Repack 40,0/40,5/40,0 min, Publish vor DWD-Ende des nächsten Laufs) | Sicherheitsnetz mit `REPACK_RUN`-Vorgabe seines **eigenen** Slots (Workflow-Vorlage: `run=` aus dem Cron-Ausdruck), oder `expectedRunOf` mit Slot-Zeit statt `Date.now()` — Workflow-Datei = STOPP & FRAGEN |
| **V-RD-9** | GitHub startet an manchen Tagen **~6 von 16** Slots gar nicht (27./28.08.); zwei ICON-Läufe blieben deshalb ganz aus, zwei unvollständig — Clients drei Stunden auf GRIB/Netlify, unsichtbar | §8.1, Slot-Deckung aus `actions/runs` | Producer vervollständigt beim Start **alle** unvollständigen der `keep: 4` Läufe (nicht nur den erwarteten): `stepsMissing` je Lauf im Index statt nur für `run`; dritter Cron bei +90 als zweites Netz |

Damit ist auch eine Zahl aus §28 zu korrigieren: „Versatz DWD → CDN ≈ 1,5 min" gilt für den
**Normalfall** (hier 59 % der Läufe, heute 12z: +52 s + CDN), nicht für die Kette insgesamt.

## 9. Jans Frage: „Eine Action, die dauerhaft Änderungen in den Daten feststellt und sie sofort ins Daten-Repo legt — geht das?"

**Ja, in dieser Form:** nicht als *eine* dauerhaft laufende Action (die gibt es nicht — jeder Job
endet nach spätestens 6 h, GitHub-hosted), sondern als **Kette von Jobs, die sich selbst
nachstarten und die Quelle pollen**. Die drei Bausteine und was sie kosten:

| Baustein | Wie | Beleg / Grenze |
|---|---|---|
| **Änderung feststellen** | Es gibt vom DWD keinen Push, Webhook oder Feed ⇒ **pollen**. Aber nicht das Listing (154 KB/78 KB), sondern ein `HEAD` auf den **erwarteten** Pfad (`DE1200_RV<nächster Slot>.tar.bz2`, `KONRAD3D_<Slot>.xml`) alle 15–30 s: `200` = da, `404` = noch nicht. `Last-Modified` sagt, wann | Muster existiert: `REPACK_POLL_SEC` im ICON-Producer; DWD ohne Rate-Limit (`docs/API.md` §2) |
| **Sofort ablegen** | Herunterladen (1,4 + 0,3 MB, ~2 s), Retention beschneiden, committen, pushen (~10–20 s); danach ist die Datei auf jsDelivr in **35–57 s** sichtbar (§28.6). Rechnerisch: DWD-Ablage 3,3 min + Poll ≤ 0,5 + Push 0,3 + CDN 1 ⇒ **≈ 5–5,5 min nach dem Slot liegt der Lauf auf dem CDN** | Zwei Pushes je 5 min = **576 Pushes/Tag** (R4: Repo-Wachstum ≈ 490 MB/Tag bis zur GitHub-GC) |
| **Dauerhaft laufen** | Job A läuft 5 h 50, löst vor seinem Ende Job B per `workflow_dispatch` aus, B läuft weiter — **mit dem Standard-Token, ohne PAT**: „`workflow_dispatch` and `repository_dispatch` events always create workflow runs" (GitHub-Doku, heute gelesen; Ausnahme von der Regel, dass `GITHUB_TOKEN`-Ereignisse keine Läufe erzeugen; Token braucht `permissions: actions: write`). Alternative: stündlicher Cron mit 70-min-Jobs, die sich überlappen (`concurrency` mit Warteschlange) | Job-Grenze 6 h, 20 gleichzeitige Jobs, Runner **24 h/Tag belegt** (720 h/Monat, für öffentliche Repos kostenlos) |

**Was das an der Diagnose ändert — und was nicht:**

- **Ändert:** die Frische. Mit der Kette ist der Radarlauf ≈ 5–5,5 min nach dem Slot auf dem CDN,
  nicht 6–25 (Cron). Der Client muss trotzdem den **sicher liegenden** Slot anfragen (R2: ein zu
  früh angefragtes 404 hält jsDelivr 1–4 min fest) — also erst ab Slot + 6,5 min ⇒ das Bild im
  Browser ist **6,5–11,5 min** alt (heute 3,5–8,5). Rund 3 min Verlust statt 15; das ist der beste
  Fall, den der Repo-Weg erreichen kann.
- **Ändert nicht:** R3 (eigenes Repo, sonst Rennen mit `publish-repack.mjs`), R4 (Retention ≤ 1 h
  wegen 150 MB; Repo-Wachstum), und vor allem **R5** — eine Kette, die einen gehosteten Runner
  rund um die Uhr belegt, um fremde Messdaten alle 5 min in ein Repo zu spiegeln, das ein CDN
  ausliefert, ist der Fall, den die Actions-Bedingungen wörtlich ausschließen („don't use Actions
  as a content delivery network or as part of a serverless application"). Der 16-Slots-Repack ist
  ein Batch; die Kette ist ein Dienst.
- **Bleibt als Restrisiko:** die Naht. Job B muss einen Runner bekommen — `workflow_dispatch`
  läuft nicht durch die Cron-Warteschlange, ist aber nicht garantiert sofort; wenn der Nachfolger
  hängt, steht das Radar still, bis er kommt. Gemessen ist das hier nicht (es gäbe erst mit einem
  Workflow etwas zu messen = STOPP & FRAGEN). Ein Dauerjob auf **eigener** Hardware (self-hosted
  Runner, bis 5 Tage je Job, keine Warteschlange) hätte die Naht nicht — wäre aber ein Server, also
  genau das, was der Repo-Weg vermeiden soll.

**Jans Präzisierung („wie ICON, nur starten und dann alle 5 s schauen"):** genau so — mit drei
Unterschieden zum ICON-Producer, die nicht am Abtastschritt hängen:

1. **Der Job darf nicht enden.** Der ICON-Job rechnet einen Lauf und ist fertig; der nächste Cron
   nimmt den nächsten Lauf 3 h später. Beim Radar ist der nächste Termin 5 min entfernt, also
   **ein Job = viele Slots**: Schleife `Slot ausrechnen → HEAD auf den erwarteten Pfad → 200 ⇒ laden,
   pushen → nächster Slot`. Nach ≤ 6 h endet der Job zwangsläufig; die Übergabe an den Nachfolger
   ist die eigentliche Konstruktion (nicht das Polling). Sauberste Form ohne Selbst-Dispatch:
   **stündlicher Cron + `concurrency: group: radar, cancel-in-progress: false`** — GitHub hält je
   Gruppe genau *einen* wartenden Lauf (Doku: „by default only one run can be pending in a
   concurrency group"), der Cron füllt ihn stündlich nach, und wenn der laufende Job sich nach
   ≈ 5 h 50 direkt nach einem Push beendet, übernimmt der wartende in Sekunden (Checkout ~15 s).
   Damit fällt auch der Cron-Jitter weg — der Nachfolger wartet ja schon.
2. **Gezielt statt gelistet.** Nicht das RV-Listing (154 KB) pollen, sondern `HEAD` auf
   `DE1200_RV<Slot>.tar.bz2` (~200 B): 200 = da, 404 = noch nicht. Bei 5 s sind das 720 Anfragen
   je Stunde — für den DWD unkritisch, aber der Gewinn gegen 15 s beträgt höchstens 10 s, während
   DWD-Ablage (3,3 min) und jsDelivr-Sichtbarkeit (35–57 s) die Kette dominieren. 10–15 s reichen.
3. **Was bleibt, hängt nicht am Takt:** eigenes Repo (R3), Retention ≤ 1 h (R4, 150 MB), 576
   Pushes/Tag, der Client fragt den sicher liegenden Slot ab (R2 ⇒ Browser 6,5–11,5 min statt
   heute 3,5–8,5), und ein Runner, der **24 h am Tag** läuft, um fremde 5-Minuten-Daten für ein
   CDN zu spiegeln (R5). Ergebnis auf dem CDN: **≈ 4,5–5 min nach dem Slot** — ungefähr das, was
   §3.2 für die Kette schätzt; im Browser 3 min hinter heute.

**Einordnung gegen Weg B:** der Cloudflare-Worker erreicht dieselben 0 Netlify-Bytes mit **3,3 min**
statt 6,5–11,5, ohne Runner, ohne Pushes, ohne ToS-Frage — gegen ein neues Konto. Die Kette ist
technisch möglich und wäre, wenn du sie willst, der Zuschnitt aus §5 (Punkt 2 dort ist genau
diese Kette). Deine Entscheidung (E1/E2).

## 10. RD-T1 — Messlauf im Daten-Repo (Jans Auftrag: „einen Test machen, wie gut das funktionieren würde")

**Ziel:** den Versatz **DWD-Ablage → Sichtbarkeit auf dem CDN** für RADOLAN-RV und KONRAD3D
messen, je Stufe, an echten Slots — bevor irgendetwas gebaut wird.

### 10.1 Aufbau

| | |
|---|---|
| Wo | Daten-Repo `buscosun-data`, **Orphan-Zweig `radar-test`** — nie `main` (dort force-pusht `publish-repack.mjs` den ganzen Baum, R3); jsDelivr liefert `@radar-test/radar/…` |
| Was | `.github/workflows/radar-test.yml` + `scripts/mirror-test.mjs` (gepflegt in `buscosun-web/scripts/radar-mirror-test/`); **kein Cron**, nur `workflow_dispatch` von Hand; Eingaben `minutes` (120), `poll_sec` (10), `cdn_poll_sec` (5) |
| Messgerät | ohne Abhängigkeiten, ohne Import aus buscosun-web, dekodiert nichts — spiegelt Bytes und stempelt |
| Je Slot und Produkt | `dwdAt` (`Last-Modified`), `seenAt` (erster HEAD 200 auf den **erwarteten Pfad**, kein Listing), `downloadedAt` (+ Bytes, ms), `pushedAt` (Push zurück), `cdnAt` (erster HEAD 200 auf `cdn.jsdelivr.net`, nebenläufig, bis 10 min) |
| Gegenprobe R2 | bei **jedem zweiten Slot** fragt das Skript den CDN-Pfad **einmal vor dem Push** ab (`earlyProbe`, erwartet 404) — misst, ob und wie lange jsDelivr das 404 festhält, gegen die Slots ohne frühe Anfrage |
| Ergebnis | Tabelle in der Job-Zusammenfassung (`GITHUB_STEP_SUMMARY`) + `radar/log.jsonl` auf dem Zweig; Retention 12 Dateien; **Zweig danach löschen** (Historie ≈ 1,7 MB je Slot) |
| Was der Test NICHT misst | die Naht zwischen zwei Jobs (§9 Punkt 1) — dafür bräuchte es zwei Läufe hintereinander; die Client-Seite (konservativer Rat) — sie folgt aus `earlyProbe`; die ToS-Frage (R5) — die misst kein Lauf |

**Erwartung (§9, zu widerlegen oder zu bestätigen):** DWD→gesehen ≤ 10 s, Download ≈ 1–3 s,
Push ≈ 5–20 s, Push→CDN 35–57 s ⇒ **DWD→CDN ≈ 1–1,5 min**, Slot→CDN ≈ 4,5–5 min; mit früher
Anfrage Push→CDN **1–4 min** (sticky 404).

### 10.2 Lokaler Trockenlauf (DRY, ohne Git und CDN) — 2026-08-29 15:02–15:09 UTC

`DRY=1 TEST_MINUTES=7 POLL_SEC=10 node scripts/radar-mirror-test/mirror-test.mjs` von hier aus
(Heimleitung, nicht der GitHub-Runner — Download-Zeiten sind deshalb nur eine Obergrenze):

| Produkt | Slot | DWD-Ablage nach Slot | DWD→gesehen | Download | DWD→„Push" (ohne Git) |
|---|---|---:|---:|---:|---:|
| RV | 15:00 | 202 s (3,4 min) | **8 s** (7 HEADs) | 812 KB in 2,6 s | 10 s |
| KONRAD3D | 15:00 | 290 s (4,8 min) | **4 s** | 4 KB in 0,8 s | 5 s |
| RV | 15:05 | 204 s (3,4 min) | **13 s** (26 HEADs) | 813 KB in 3,0 s | 16 s |

Das Messgerät tut, was es soll: es findet die Datei **innerhalb einer Abtastperiode** nach der
DWD-Ablage (8–13 s bei 10 s Abtastung — ein Tick sind zwei HEADs à ~1,5 s plus die Pause), lädt
sie in 1–3 s und legt sie ab; der KONRAD-Verzug (4,8 min) wird getrennt vom RV-Verzug (3,4 min)
geführt. Was der Trockenlauf **nicht** zeigt und der Lauf im Daten-Repo zeigen muss: Push-Dauer,
CDN-Sichtbarkeit und die frühe-Anfrage-Gegenprobe (im DRY übersprungen).

### 10.3 Ergebnis des Laufs im Daten-Repo

Jans Go 2026-08-29 ≈ 15:15 UTC; Zweig `radar-test` gepusht (`d2a29ad`, Orphan, 3 Dateien), Workflow-Datei auf dem Zweig belegt (`raw.githubusercontent.com/…/radar-test/.github/workflows/radar-test.yml` → 200). **Lehre beim Start (V-RD-10):** ein Workflow, der NUR auf einem Nicht-Default-Zweig liegt, ist
nicht startbar — die `workflows`-Liste und `workflow_dispatch` kennen nur Dateien des Default-Zweigs
(`POST …/actions/workflows/radar-test.yml/dispatches` → **404**, obwohl die Datei auf `radar-test`
lag). Deshalb liegt `radar-test.yml` zusätzlich auf `main` (Commit `a520e20`, Nutzer-Token mit
`workflow`-Scope, 15:31 UTC — außerhalb des Publish-Fensters ≈ 16:07); der Lauf wurde mit
`ref: radar-test` gestartet und arbeitet ausschließlich auf dem Zweig. Der ICON-Publisher trägt
unbekannte Dateien aus seinem Klon unverändert weiter (er tut das jeden Lauf mit `build.yml` in
einem neuen Wurzel-Commit) ⇒ kein abgewiesener Push zu erwarten. **Nach dem Test:** die Datei von
`main` entfernen (Nutzer-Token, nicht in einem Publish-Fenster), Zweig `radar-test` löschen.

Lauf: `https://github.com/jppetry/buscosun-data/actions/runs/33260519387`, gestartet 15:32:17 UTC
(Dispatch 15:32:0x ⇒ Start in Sekunden — anders als der Cron), 120 min, DWD 10 s, CDN 5 s.

**Ergebnis (120 min, 15:32–17:32 UTC · 48 Messungen: 24 RV + 24 KONRAD3D · 0 `late`, 0 ohne CDN
· Rohdaten `audit/radar-datenrepo/radar-test-log.jsonl`, Zweig danach gelöscht):**

| Stufe | Median | min | max |
|---|---:|---:|---:|
| DWD-Ablage → gesehen (HEAD, 10-s-Abtastung) | **9 s** | — | 12 s |
| DWD-Ablage → im Repo gepusht | **11 s** | — | 15 s |
| Push → CDN sichtbar, **ohne** frühe Anfrage (24 Slots) | **1 s** | 1 | 4 s |
| Push → CDN sichtbar, **mit** früher 404-Anfrage vor dem Push (24 Slots, alle 404) | **66 s** | 62 | 118 s |

Zwei Erwartungen aus §9 sind damit korrigiert, beide nach oben:

1. **Die Kette ist schneller als geschätzt:** ein Slot, den niemand zu früh anfragt, steht
   **≈ 12 s nach der DWD-Ablage** auf dem CDN (nicht 1–1,5 min) — jsDelivr löst einen noch nie
   gesehenen Pfad in 1–4 s auf. Gesamt: Slot + ~3:20 (DWD) + 12 s ≈ **Slot + 3,5 min**.
2. **Das festgehaltene 404 kostet ~1 min, nicht 1–4:** eine Anfrage VOR dem Push macht denselben
   Pfad für 62–118 s (med 66) unsichtbar. Konsequenz für RD2: der Client fragt einen Slot
   **frühestens bei Slot + 3:40** an (DWD-Verzug 3:20–3:26 + Push 11 s + Reserve) — dann trifft er
   praktisch immer sofort, und das Radar ist im Browser **kaum älter als heute** (heute ≈ Slot +
   3,5–4 min über Netlify). Der pauschale „ein Slot zurück"-Rat aus §3.2 ist damit **überholt** —
   ein zeitgesteuertes Gate reicht.

## 11. RD1 — Produktivsetzung (Jans Entscheidung 2026-08-29 ≈ 15:50 UTC)

> Jan, nach 25 min Messlauf: „ich finde die Daten werden richtig schnell und gut bereitgestellt.
> Kannst du das Ganze jetzt mit dem main mergen und dafür sorgen, dass der Radar-Task immer wieder
> neu gestartet wird?" — Damit sind **E1 entschieden (Weg A)** und das ToS-Risiko R5 (§3.5)
> **bewusst getragen**; beides wurde vor der Entscheidung benannt (§0, §9).

### 11.1 Was gebaut wurde

| | |
|---|---|
| Skript | `scripts/radar-mirror.mjs` im Daten-Repo (Quelle: `buscosun-web/scripts/radar-mirror/radar-mirror.mjs`) — Messgerät aus §10 ohne CDN-Watcher und frühe Anfrage, dafür mit **Sync-Publish** und **Naht-Reserve** |
| Workflow | `.github/workflows/radar.yml` (Quelle: `workflow-radar.yml`): Cron **stündlich `:07`** + `workflow_dispatch`; `concurrency: radar-mirror, cancel-in-progress: false`; `permissions: contents: write, actions: write`; `timeout-minutes: 358` |
| Laufzeit | `RUN_MINUTES 345` (5 h 45); der Job endet **direkt nach einem Push** (spätestens +5 min), damit der Nachfolger ≈ 4,5 min Zeit hat |
| Neustart | der stündliche Cron stellt den Nachfolger in die Warteschlange — GitHub hält je Gruppe **einen** wartenden Lauf, weitere Ticks ersetzen ihn; beim Ende übernimmt er in Sekunden. **Reserve:** findet der Job beim Beenden keinen wartenden Lauf (`GET …/runs?status=queued|waiting|pending|requested`), löst er sich selbst per `workflow_dispatch` aus — mit `GITHUB_TOKEN`, das für `workflow_dispatch` ausdrücklich Läufe erzeugt (§9) |
| Erkennen | HEAD auf den erwarteten Pfad alle 10 s, je Produkt ein eigener Slot-Zeiger; ein Slot, der 30 min nicht erscheint, wird übersprungen (DWD-Ausfall) |
| Ablage | `radar/rv/DE1200_RV<ts>.tar.bz2`, `radar/konrad3d/KONRAD3D_<ts>.xml`, `radar/status.json` (Job, Start, letzte 24 Zeilen mit DWD-/Sicht-/Push-Zeit — Telemetrie für §11.3); Retention **12 je Produkt** (1 h; der Rückblick braucht 9) |
| Zwei Schreiber (R3) | **jeder** Push setzt neu auf: `fetch` → `main` auf `origin/main` → `radar/` komplett aus dem **lokalen Bestand** (`../radar-mirror-store`, außerhalb des Klons) einkopieren → commit → push; abgelehnt ⇒ bis 4× wiederholen. Der ICON-Publisher trägt `radar/`, das Skript und den Workflow aus seinem Klon unverändert weiter (§10.3: er tut das mit `build.yml` in jedem Wurzel-Commit). Fällt ein Radar-Commit in sein Klon→Push-Fenster (≤ 3,5 min, 16×/Tag), fehlt die Datei auf `main` bis zum nächsten Radar-Push (≤ 5 min) — der lokale Bestand heilt das. **Nebeneffekt, gewollt:** der Publisher setzt die `radar/`-Historie alle 3 h auf einen Wurzel-Commit zurück ⇒ das Repo wächst nicht (R4 entschärft) |
| Naht | der Nachfolger übernimmt beim Start den Bestand von `main` (`storeSeed`) und rät den nächsten Slot als den jüngsten, der noch nicht liegt |
| Paket | 24 Dateien ≈ 20 MB zusätzlich zum ICON-Baum (≈ 21 MB) — unter jsDelivrs 150 MB |
| Client | **noch unverändert** — die App liest Radar weiter über `/_dwd_opendata`. Die Umschaltung (CDN zuerst, Netlify als benannter Fallback, konservativer Slot, Kill-Switch) ist Phase **RD2** |

### 11.2 Lokaler Test gegen ein Bare-Repo (mit simuliertem Publisher-Force-Push) — 15:58–16:05 UTC

Aufbau: Bare-Repo mit `main` (README + Dummy-`runs/`), Klon als Arbeitsverzeichnis, Skript
`RUN_MINUTES=6`, echter DWD; bei Minute 4 aus einem **zweiten** Klon ein frischer Wurzel-Commit
**ohne `radar/`** per `push --force` (exakt das, was `publish-repack.mjs` tut).

| | Ergebnis |
|---|---|
| Live-Slots | RV 16:00: DWD 16:03:25 → gesehen 16:03:27 → Push 16:03:32 (**7 s**); KONRAD 16:00: DWD 16:04:59 → Push 16:05:12 (**13 s**) |
| Force-Push bei 16:02:2x | der nächste Radar-Push (16:03:32) setzte auf dem neuen Wurzel-Commit auf und stellte **alle** behaltenen Dateien wieder her: Baum danach `README.md` + 6 RV + 6 KONRAD + `status.json`, Historie `Wurzel → radar: RV1600 → radar: KONRAD1600` — **kein abgelehnter Push, kein Retry nötig** |
| Erststart mit leerem Bestand (zweiter Lauf, 3 min) | holt die letzten 11 Slots je Produkt nach (der DWD hält 48 h): 22 Pushes in 2,5 min, Baum 11 + 11 + `status.json`, 23 Commits. Erster Befund dabei: die ursprüngliche Regel „Slot > 30 min ⇒ überspringen" griff VOR dem HEAD und warf vorhandene ältere Slots als „nie erschienen" weg ⇒ jetzt nur bei **404 und > 30 min** |
| Selbst-Dispatch | lokal ohne Token bewusst „kein Selbst-Dispatch" — der Pfad läuft nur in Actions; die Warteschlange (Cron + `concurrency`) ist der Hauptweg |

### 11.3 Produktion

- Push auf `main`: `57805ef` (16:07 UTC, direkt nach dem Ende des ICON-Builds 16:04:45 — außerhalb
  des Publish-Fensters): `scripts/radar-mirror.mjs` + `.github/workflows/radar.yml`, `radar-test.yml`
  von `main` entfernt (der Messlauf auf dem Zweig läuft davon unberührt weiter bis ≈ 17:35).
- Erster Lauf per Dispatch: `https://github.com/jppetry/buscosun-data/actions/runs/33262140908`,
  Start **16:08:22 UTC**; ab dann stündlich `:07` der Nachfolger in der Warteschlange, erste Naht
  ≈ 21:55 UTC.
- Erststart füllt die Retention nach (11 Slots je Produkt, ≈ 22 Pushes in den ersten Minuten).

**Betriebsbild nach ≈ 31 h (Stand 30.08. 23:10 UTC):** der Spiegel läuft seit dem ersten Dispatch
**ununterbrochen** — `radar/status.json` 1,1 min alt, die letzten 12 RV-Slots (22:05–23:00) lückenlos,
**DWD→Push über die letzten 24 Dateien: Median 11 s, max 17 s**. Die Nähte funktionieren wie
konstruiert: 31 Läufe, davon 6 lange `success` (je ≈ 5 h 55, nahtloser Übergang — z. B. #23 endet
21:00, #29 startet 21:00:21) und ~24 `completed cancelled` — das sind **ersetzte wartende Läufe**
(je Gruppe hält GitHub genau einen Pending-Lauf, jeder Cron-Tick ersetzt den vorigen; „cancelled"
ist hier der Normalfall der Warteschlange, kein Fehler). Der ICON-Batch läuft parallel weiter grün
(#114–#116 success), kein abgelehnter Push auf beiden Seiten. **Zu beobachten bleibt V-RD-4:** GitHub
meldet `size` **98 MiB** (vor RD1 49) — die Force-Push-Historien und Radar-Objekte sammeln sich bis
zur GitHub-GC; die Zahl gehört auf die Beobachtungsliste, bevor sie dreistellig MiB überschreitet.
Der Messzweig `radar-test` ist gelöscht (Log als Beleg in `audit/radar-datenrepo/`).

### 11.4 „Die Ablage wurde gestoppt" (Jans Rückmeldung 31.08.) — war sie nicht; die Anzeige war das Problem

Befund 31.08. 00:57 UTC: `radar/status.json` **0 min alt**, jüngster Push `DE1200_RV2608310050`
um 00:53:33 (**13 s** nach DWD), die letzten 24 Slots beider Produkte lückenlos, DWD→Push med
10 s / max 16 s, Lauf #29 seit 21:00 aktiv, #32 wartend. **Die Daten sind nie stehen geblieben.**
Was nach Stopp aussah: die Warteschlangen-Konstruktion erzeugte **jede Stunde einen „completed
cancelled"-Lauf** (GitHub ersetzt den wartenden Lauf beim nächsten Cron-Tick und verschickt dafür
eine Abbruch-Mail an den Repo-Inhaber) — in der Actions-Liste standen damit ~24 „cancelled" je Tag
neben 4 „success". Eine Anzeige, die im Normalbetrieb wie ein Dauerfehler aussieht, ist ein
Konstruktionsfehler, auch wenn die Daten stimmen.

**Umbau (Commit `0e363fc`, 01:00 UTC, außerhalb des Publish-Fensters):** `radar.yml` verliert
seinen Cron — die Kette läuft primär über den **Selbst-Dispatch** am Laufzeitende (`ensureSuccessor`,
war schon eingebaut); neu `radar-watchdog.yml` (stündlich `:07`, keine concurrency-Gruppe, 10-s-Job):
prüft, ob ein Spiegel-Lauf aktiv oder wartend ist, und **nur wenn nicht**, startet er einen.
Ergebnis: keine ersetzten wartenden Läufe mehr, keine Abbruch-Mails; die Actions-Liste zeigt nur
noch echte Läufe. Ausfalldeckung unverändert: Absturz/Timeout des Spiegels wird spätestens nach
einer Stunde vom Wachhund aufgefangen. Der noch wartende Lauf #32 (aus dem alten Cron) bleibt das
nächste Kettenglied (~02:45).

## 12. RD2 — Der Client liest Radar vom Daten-Repo-CDN (Jans Auftrag 2026-08-31: „KONRAD- und Radar-Daten nicht mehr vom DWD-Server holen, sondern von GitHub — alles genau wie vorher, +2 h bleiben")

**Zu „+2 h":** der Spiegel legt den RV-Tar **byte-identisch** ab; die 25 Frames 0…+120 min sind
in jeder Datei. Der Client dekodiert vom CDN exakt dieselben Bytes — der Horizont ändert sich
nicht (im Browser belegt: „25 Frames (0…+120 min)" aus der CDN-Datei).

### 12.1 Umsetzung

| | |
|---|---|
| EINE Stelle für die Wegwahl | `radolanRuns.ts` (abhängigkeitsfrei — der Router-Frühstart nimmt denselben Resolver): `RADAR_CDN_BASE`, `rvTarCdnUrl`, `rvCdnEligible`, `rvTarUrlFor`, `radarCdnEnabled`, Latch, `radarCdnDeadline` |
| Zeit-Gate RV | `RV_CDN_GATE_MS` **240 s**: ein Slot wird auf dem CDN frühestens bei Slot + 4:00 angefragt (gemessene Kette: DWD 3:17–3:26 + Push ≤ 17 s + CDN ≤ 4 s; §10.3: eine zu frühe Anfrage hielte jsDelivr 62–118 s als 404 fest — **für alle**). Jünger ⇒ Netlify mit dem aggressiven Rat, **exakt wie vor RD2** ⇒ die Frische der App ändert sich nicht; nur in einem ~15-s-Fenster je 5 min kommt der frischeste Lauf weiter über Netlify (im Browser einmal live gesehen: 01:23:45, Lauf 0120 via Netlify) |
| Fenster | `RADAR_CDN_WINDOW_MS` 55 min (< Spiegel-Retention 60); Rückblick (9 Läufe = 45 min) passt komplett durchs Fenster ⇒ auch der Rückblick läuft über das CDN |
| KONRAD3D | gerechnete Zeitstempel (`guessKonradStamps`, Gate **330 s**, DWD-Verzug gemessen 4:45–4:57) statt des 78,5-KB-Listings — **H12/V-RD-3 damit umgesetzt**; Frische-Fenster-Regel wie bei RV (weichen aggressiver und gegatteter Rat ab, übernimmt der Listing-Weg); Listing + Proxy bleiben der benannte Fallback |
| RV-Leser | `fetchRvBytesCached(ts, …)`: Cache-API (beide URL-Schlüssel) → Frühstart (beide Schlüssel — zwischen Router-`now` und Leser-`now` kann der Slot das Gate passieren) → CDN mit 8-s-Frist → Netlify wie bisher. 404/5xx vom CDN = benannter Fallback; Netz/Timeout zählt auf den **Sitzungs-Latch** (2 harte Fehler ⇒ Sitzung auf Netlify) |
| Kill-Switch | `?radarcdn=0` / `localStorage.radarcdn = '0'`, Query schlägt Speicher in beide Richtungen (D-31-Muster); `radarcdn` läuft als unbekannter Key durch `parseMapSearch(…).extra` |
| Mitgenommen | ALLE RV-Verbraucher hängen an `fetchRvTar` ⇒ auch Wetterkarte (Niederschlag/Flow/PoP), **DE-Punktvorhersage** (V-RD-2: Vorhersage/Event/Tour), Rückblick und Hindcast lesen jetzt vom CDN |
| Sichtbarkeit | die Konsolenzeile des Niederschlag-Layers nennt die Quelle: „Daten-Repo (jsDelivr)" bzw. „DWD (Netlify)" |

### 12.2 Verifiziert

| | Beleg |
|---|---|
| `verify:radar-runs` | **52/52** (+30: Stempel-Rundlauf, Gate-/Fenster-Grenzen, Resolver-Wahl, Kill-Switch-Vorrang über die echte globale Leitung, Sitzungs-Latch, CDN-Frist (Selbstabbruch, `done()`, Aufrufer-Kopplung), KONRAD-Stempel/Gate/Frische-Fenster, Gate ≥ gemessene Kette, Rückblick ⊂ Fenster; **2 Live-Zeilen**: jüngster gegatteter RV- und KONRAD-Lauf liegen auf dem CDN — fragen nur gegattete Slots an, kein 404-Vergiften) |
| `verify:routing` | **105/105** (+1: Frühstart-URL = Resolver-Wahl, bei Test-Zeit die CDN-URL) |
| `verify:layer-erstbild` | **37/37** (2 Textsonden auf den RD2-Vertrag nachgezogen: Priorität kommt auf BEIDEN Wegen an; KONRAD hat jetzt 3 low-Abrufe) |
| `verify:radar-sampling` · `typecheck` · Budget | 25/25 · grün · totalJs 1 058,2/1 109,8 KB |
| Browser (Prod-Preview, Regenradar DE Kassel) | Erstaufruf: RV-Tar **1 725 KB von `cdn.jsdelivr.net/gh/…@main/radar/rv/`**, Konsole „25 Frames (0…+120 min) · Quelle Daten-Repo (jsDelivr)", 0 Fehler/Warnungen; KONRAD im ersten Aufruf über den Listing-Weg (Load fiel ins 45-s-Frische-Fenster — Konstruktion, nicht Fehler), im Reload **37 KB von `…@main/radar/konrad3d/`** ohne Listing; Reload bedient RV aus der Cache-API; `?radarcdn=0` ⇒ alles über `/_dwd_opendata`, Konsole „Quelle DWD (Netlify)", dabei den frischeren Lauf 0120 geholt (aggressiver Rat unverändert) |

**Damit ist der Netlify-Radar-Posten für DE im Normalbetrieb ≈ 0:** Tar, KONRAD-XML und das
Listing laufen über jsDelivr; über Netlify bleiben das ~15-s-Frischefenster je 5 min, der
Fallback, wenn der Spiegel hinkt, und der Kill-Switch.

## 13. Gemessen und geprüft

| | Beleg |
|---|---|
| CORS DWD (Verzeichnisse, Tar, XML, RY) | `curl -sI -H 'Origin: https://buscosun.com' …` — kein `Access-Control-Allow-Origin`, 2026-08-29 14:00 UTC |
| RV/KONRAD-Größen 48 h | nginx-Listings, 577/576 Dateien, Bytes je Datei |
| Verzug DWD | `Last-Modified` gegen Slot: RV 3,4 min, KONRAD 4,75 min |
| Actions-Jitter | `api.github.com/repos/jppetry/buscosun-data/actions/runs?per_page=60`, 45 `schedule`-Läufe seit 26.08., gegen live `build.yml` (`20 0,3,…` / `30 2,5,…`) |
| Repo-Größe | `api.github.com/repos/jppetry/buscosun-data` → `size: 50502` |
| jsDelivr-Grenzen | `raw.githubusercontent.com/jsdelivr/jsdelivr/master/README.md` |
| GitHub schedule/Limits/Billing/ToS | `docs.github.com` (events-that-trigger-workflows, actions/reference/limits, about-billing-for-github-actions, github-terms-for-additional-products-and-features) |
| Cloudflare Workers Free | `developers.cloudflare.com/workers/platform/limits`, `…/pricing` |
| Verbraucher, Timer, Sichtbarkeits-Gating | `NowcastRadarMap.tsx:205-207/340/353`, `MapView.tsx:2391/2775/2870`, `cellLayers.ts:57`, `pointForecast.ts:225`, `EventResult.tsx:100`, `weatherEnrichment.ts:201`, `PointForecastPanel.tsx:122` |
| Publisher-Mechanik | `scripts/publish-repack.mjs:100-265`, `scripts/repack-repo/workflow-build.yml` |
| Versatz DWD → Repo je Lauf (§8) | Jobs-API `actions/runs/<id>/jobs` (33 Läufe), DWD `Last-Modified` 09z/12z heute, `scratchpad/offset.py` |
| Nicht gemessen | Besucherzahl/Radar-Anteil (nur Netlify-Dashboard); jsDelivr-Verhalten bei 288 Pushes/Tag; GitHub-GC-Kadenz; Cloudflare-Latenz aus DACH |

## 14. RD3 — Radar als fertig aufbereitete Dateien (Jans Auftrag 2026-09-03: „Niederschlagsradar und KONRAD als Bild in buscosun-data, wie bei den anderen Wetterdaten; AT- und CH-Quelle dazu; Wetterkarte und Regenradar laden direkt die Bilder")

Plan freigegeben 2026-09-03 (Plan-Datei der Session). Kernidee: der laufende Radar-Spiegel (RD1)
bekommt einen **Derive-Schritt** — RV/INCA/rzc als Graustufen-PNGs mit exakt den `precipToU8`-Bytes,
KONRAD als kompaktes JSON —, der Client lädt Bild-CDN zuerst mit Zeit-Gate und fällt sonst auf den
heutigen Weg zurück. **Byte-verlustfrei per Konstruktion:** alle drei Quellen quantisieren schon heute
IM Decoder auf `Uint8` (`precipToU8`, Schwelle 0,06 mm/h, Schritt 0,0784 mm/h, Sättigung 20 mm/h —
`radolanDecode.ts:112`, `incaParse.ts:84`, `rzcParse.ts:34`), und alle 17 Verbraucher (Komposit,
Regenradar-Stack, Rückblick, Morph, Akkumulation, Flow-Nowcast, KI-Nowcaster, Hindcast,
Punktabfragen `(raw/255)*20`, Nowcast-Engine, Zell-Tracking) lesen dieselben u8-Bytes; der Producer
importiert DIESELBEN Decoder (BW-1-Regel). Der frühere §26.3-Vorbehalt („der Takt, nicht das Format")
ist durch den RD1-Dauerspiegel (DWD→Push median 11 s) entkräftet; R7 („erst roh, Repack als zweite
Stufe") — die Rohstufe läuft, RD3 IST die zweite Stufe. ToS-Haltung R5 verbessert sich (abgeleitetes
eigenes Werk statt 1:1-Spiegel fremder Messdaten).

### 14.1 M0 — Messsonde (2026-09-02 ≈ 22:30–22:45 UTC, `scripts/radar-mirror-test/derive-probe.mjs` + `cdn-probe.mjs`)

**RV → 25 Graustufen-PNGs 1100×1200** (größter und kleinster Tar der letzten 48 h, DWD direkt):

| Slot | Tar | PNG-Summe (25 Frames) | je Frame | Verhältnis | bz2 (Binary) | Tar-Dekode | Encode |
|---|---|---|---|---|---|---|---|
| 2609011225 (max 48 h) | 662,3 KB | **790,0 KB** | 31,2–33,0 KB | 1,19× | 916 ms | 357 ms | 520 ms (21 ms/F) |
| 2609020405 (min 48 h) | 136,7 KB | **114,2 KB** | 4,4–4,9 KB | 0,84× | 676 ms | 385 ms | 883 ms (35 ms/F) |

Derive-Gesamtzeit je Slot **1,8–1,9 s** (bz2 + Dekode + Encode) — passt bequem in das 11-s-Budget
DWD→Push. Achtung Hochrechnung: das 48-h-Fenster war relativ trocken; gegen die RD0-Messung
(nass Median 1 362 KB, max 2 409 KB) extrapoliert die PNG-Summe auf ≈ 1,6 MB (Median nass) bis
≈ 2,9 MB (Extrem) je Slot. bz2-Binary vs. pure-JS am 66-MB-Strom: 0,68 s vs. 6,9 s (Faktor 10) —
`bzip2 -dc` ist im Producer Pflicht, JS bleibt Datei-Rückfall (`scripts/lib/bz2.mjs`, aus
`repack-icon-d2.mjs` herausgelöst, Re-Export erhält den `verify:repack`-Vertrag).

**INCA → 12 PNGs 701×431:** NetCDF 824,3 KB → PNG-Summe **63,5 KB** (4,0–6,3 KB je Frame,
8 ms/Frame Encode), Parse 735 ms (Node). Leads 0,25…3,0 h. Wurzel-Variablen: `rr,
lambert_conformal_conic, lat, leadtime, lon, x, y, time`; `time` ist RELATIV ([0,15,30,…] min) —
eine absolute Referenzzeit ist über jsfive-Werte nicht lesbar ⇒ **der Spiegel stempelt den Slot über
die Abrufzeit** (floor 15 min), genau wie der Client heute an `Date.now()` ankert. Der
GeoSphere-Publish-Verzug je 15-min-Slot ist noch ungemessen — die Spiegel-Telemetrie (`seenAt` je
Slot) liefert ihn in RD3a, das Client-Gate wird danach gesetzt. Ecken [NW,NE,SE,SW] =
[[8.0909,49.3672],[17.7496,49.4008],[17.4363,45.5294],[8.4626,45.4982]] (aus der Datei; wandern in
die meta.json — der Verifier prüft Meta-Ecken ≡ Datei-Ecken je Live-Lauf).

**rzc → 1 PNG 710×640:** HDF5 32,6 KB → PNG **1,4 KB**; Parse 162 ms. **Dateiname NICHT
berechenbar:** die Assets desselben Tages tragen drei Suffix-Varianten (`rzc<YY><DOY><HHMM>` +
`nl|tl|vl` + `.001.h5`) ⇒ der Spiegel pollt das STAC-Tagesitem (ETag vorhanden, `cache-control:
max-age=10`, Item ~261 KB — konditional abfragen). validAt aus `/what` gelesen (22:35:00Z, plausibel).

**KONRAD → JSON:** konvektiv aktivster Slot der 48 h (`…0901T130000`, XML 342,1 KB, 21 Zellen) →
JSON **55,2 KB (gzip 12,0 KB)**, Parse 9 ms, `JSON.parse`-Rundlauf deep-equal exakt; ruhiger Slot
(3,8 KB XML, 0 Zellen) → 0,1 KB. Gegen den RD0-Median (255 KB XML) ≈ Faktor 5–20 auf dem Draht.

**jsDelivr, 26 frische Pfade nach EINEM Push** (Probe-Slot `probe/rd3/2609022230/`, 25 PNGs +
meta.json, danach wieder entfernt; Polling ERST nach dem Push — kein 404-Vergiften): Stichproben
`f120/f060/meta/f000` **200 nach 0,6/0,8/1,4/2,6 s**, Voll-Sweep **26/26 nach 6,9 s**. Ein
Verzeichnis-Push wird also praktisch atomar sichtbar; das Client-Gate muss nur den Derive+Push-Verzug
tragen, nicht eine Datei-Staffelung.

**Budget (150 MB/Paket):** Baum heute `runs/` 51 MB + `radar/` 4,8 MB (trockener Tag). Nass-Extrem
gerechnet: runs 51 + Roh-Radar ~32 (12×2,4 RV + KONRAD) + RV-img ~35 (12×2,9) + INCA/rzc/KONRAD-json
~1 ⇒ ≈ **119 MB < 150 MB** (Normalfall ≈ 75–90 MB). Benannter Hebel, falls es eng wird: Ausdünnen
der RV-img-Retention (volle 25-Frame-Slots nur für die jüngsten 3, ältere nur `f000.png` — der
Rückblick braucht genau die; heutige Wahl: symmetrisch KEEP 12, Hebel dokumentiert).

**Gate G-M0: GO.** Größen tragen (nass ~2× Tar auf dem CDN, aber frameweise ladbar und gratis;
trocken kleiner), Derive-Zeit ≪ Budget, 26-Pfad-Push atomar genug, KONRAD-JSON-Rundlauf exakt.
Offen in RD3a zu messen: GeoSphere-Publish-Verzug (Telemetrie), Derive-Zeit auf dem Actions-Runner.

### 14.2 RD3a — Producer + Daten-Repo (umgesetzt 2026-09-03, Gate G-RD3a)

**Bau:** `src/sources/radarImg.ts` (Vertrag: Meta-Schema samt Bauern/Prüfern, Stempel,
inca/rzc/konrad-Pfade, geteilte Browser-Helfer `fetchImgRes`/`loadRadarGrayPng`; die RV-/Gate-/
Schalter-Primitiven leben abhängigkeitsfrei in `radolanRuns.ts` — der Router-Frühstart braucht
sie ohne schwere Importe), `scripts/radar-mirror/radar-derive.mjs` (Kindprozess je Slot, atomar
über tmp-Verzeichnis + rename mit Windows-EPERM-Retry, validiert die eigene meta.json gegen den
Client-Prüfer), `scripts/lib/bz2.mjs` (aus `repack-icon-d2.mjs` herausgelöst, Re-Export erhält
den `verify:repack`-Vertrag), Spiegel-Umbau (`radar-mirror.mjs`: derive-Hook zwischen `storePut`
und `publish` in try/catch — **ein Derive-Fehler nimmt nie den Roh-Push**; neue Produkte `inca`
(Poll `/metadata` alle 45 s — Rate-Limit 240/h — `last_forecast_reftime` als Stempel) und `rzc`
(STAC-Tagesitem mit ETag alle 30 s, Stempel aus dem Asset-Namen `rzc<YY><DOY><HHMM>…`);
verzeichnisfähige Bild-Retention KEEP 12; `DERIVE=0`-Notaus; Header-Neufassung — „dekodiert
nichts" gilt nicht mehr), Workflow (Sparse-Checkout von buscosun-web + `npm install bz2@1
jsfive@0.4`, `continue-on-error`: ohne App-Klon läuft der Spiegel roh weiter).

**Befund beim Deployment (V-RD-12):** der Runner klont buscosun-web von GitHub — dort fehlen die
LE2-/RD-Module (`incaParse.ts`, `radolanRuns.ts` u. a. sind seit Wochen nur im Arbeitsbaum), und
ein Push auf `main` würde einen Netlify-Deploy auslösen (Jans Gate). Lösung: **Zweig
`rd3-producer`** in buscosun-web (`d3f72c1`) = origin/main + exakt die Derive-Module
(radar-mirror/*, `bz2.mjs`, `radarImg/radolanRuns/incaParse/rzcParse/geosphereIncaGeo`,
`quadWarpMesh` als deren Import) — kein Deploy, BW-1 bleibt (dieselben Module). Vorher lokal
gegen einen `git archive origin/main`-Baum belegt: alle vier Derives laufen. **Nach dem nächsten
main-Deploy von buscosun-web den Workflow auf `main` zurückstellen und den Zweig löschen.**

**Belegt in Produktion** (Deploy `cd6fa4c` + Nachtrag, Kette abgebrochen + neu dispatcht,
Lauf 33736849695): `status.json` schema 2, `derive: true` — RV **derive 1 328 ms → 972 KB**
je Slot, KONRAD ~0,4 s → 5–18 KB, rzc 258 ms → ~2,2 KB, INCA 613–724 ms → ~10–13 KB.
**INCA-reftime-Verzug gemessen: Lauf 0845 gepusht 09:06:24 — die GeoSphere-reftime hinkt dem
Slot ~15–30 min hinterher**; deshalb löst der Client den Stempel über denselben
`/metadata`-Endpunkt auf statt zu raten (§14.3). CDN-Stichprobe: gegatteter Slot `2609030905`
meta.json/f000/f120 alle **200**. Lokaler End-to-End-Test gegen ein Bare-Repo (KEEP 3):
Baumform exakt nach Vertrag, Erststart-Backfill inkl. Bildern. Budget: weit unter 150 MB
(Rechnung §14.1). `verify:radar-repack` **30/30** (A Vertrag/Gates/Schalter/Eligibility-Grenzen
über die echte localStorage-Leitung; B Byte-Identität aller vier Quellen über den ECHTEN
Kindprozess, `Buffer.compare === 0` je Frame, KONRAD deep-equal; C Live-CDN-Zeile mit
`RADAR_CHECK_CDN=1`).

### 14.3 RD3b/c/d — Der Client liest die Bilder (umgesetzt 2026-09-03, Gate G-RD3b/c/d)

**DE (RD3b):** `fetchRvTar` versucht gegatterte Slots zuerst als Frame-PNGs
(`fetchRvFromImg`: meta.json + 25 Frames parallel unter EINER 8-s-CDN-Frist,
**alles-oder-nichts** — die Verbraucher brauchen den kompletten Stapel; 404 = „noch nicht
gespiegelt", zählt NICHT in den Sitzungs-Latch, harte Fehler schon), sonst exakt der bisherige
Tar-Weg. Der **Rückblick** holt je Stempel nur noch `f000.png` (~30 KB statt Voll-Tar; je
Stempel Tar-Fallback). Der Frühstart wärmt bei Bild-Berechtigung meta.json + f000.png statt
des 1,4-MB-Tars. Die Konsolenzeile nennt die Quelle dreistufig: „Daten-Repo (PNG)" /
„Daten-Repo (jsDelivr)" / „DWD (Netlify)". Kill-Switch **`?radarimg=0|1` /
`localStorage.radarimg`** (Query schlägt Speicher, D-31); `?radarcdn=0` bleibt der äußere
Schalter über ALLE Radar-CDN-Wege.

**AT (RD3c):** `loadIncaFromImg` löst den Lauf DETERMINISTISCH über `/metadata`
(`last_forecast_reftime` → Stempel — kein Raten, kein Sticky-404-Fächer), lädt meta.json
(Ecken!) + 12 Frames; jeder Fehlschlag → Direkt-API unverändert inkl. `INCA_STALE_MAX_MS`.
Beide Wege liefern DENSELBEN Lauf, die Frische ändert sich nicht. **CH:** `loadRzcFromImg`
mit gerechneten 5-min-Stempeln (`RZC_PUBLISH_LAG_MIN` 1,5, Gate 240 s) und der
KONRAD-Frische-Regel: aggressiver Rat ≠ gegatteter Rat → STAC-Weg wie bisher — kein
Frische-Verlust; sonst meta.json + frame.png (~3 KB statt 261-KB-STAC-Item + 33-KB-HDF5).
**KONRAD (RD3d):** `fetchKonrad3dFromCdn` versucht je Stempel erst `cells.json`
(Schema-1-Umschlag, deep-equal zur `parseKonrad3d`-Ausgabe; jede Parser-Änderung bumpt
`schema`, alte Clients fallen sauber auf XML zurück), dann XML, dann Listing — Gate 330 s.

**Belegt (Prod-Preview :5213, Chrome; Spiegel live):**

1. **Regenradar DE Kassel:** Konsole „RADOLAN-RV … **25 Frames (0…+120 min) · Quelle
   Daten-Repo (PNG)**" (der +2-h-Horizont bleibt), Netz **26 Bild-Anfragen (meta + 25 PNGs),
   0 Tar-Bytes**; INCA „Lauf 20260903T0845 · 12 Frames · Quelle Daten-Repo (PNG)" (13
   Anfragen); rzc „Slot 20260903T0910 · Quelle Daten-Repo (PNG)".
2. **Die Gate-Leiter arbeitet:** ein Reload bei Slot-Alter 4:24 min (zwischen Tar-CDN-Gate
   4:00 und Bild-Gate 4:30) nahm korrekt den **Tar-CDN-Weg** („Daten-Repo (jsDelivr)"), der
   nächste den Bild-Weg; ein rzc-Load im Frische-Fenster nahm korrekt den STAC-Weg.
3. **KONRAD:** `konrad3d/20260903T091000/cells.json` mit **2 415 B übertragen** statt
   ~255-KB-XML + 79-KB-Listing; Konsole „3 Zellen" (Zellbahnen-Layer; das
   Sichtbarkeits-Gating des Bestands wurde für den Beleg test-halber überschrieben — der
   Abruf hängt an `visibilityState`, Konstruktion aus RL1).
4. **Kill-Switch-Drill `?radarimg=0`:** 0 Bild-Anfragen; RV über den Tar-Weg (Cache-API +
   „Daten-Repo (jsDelivr)" — radarcdn bleibt an, korrekte Schalter-Schichtung), INCA per
   NetCDF direkt, rzc per STAC direkt.
5. **Wetterkarte Niederschlag:** 26 Bild-Anfragen RV, **0 Tar**, INCA über CDN (13) mit
   EINEM benannten Direkt-Fallback im reftime-Wechselfenster — genau die gebaute Degradation.
6. **Konsole: 0 Fehler/Exceptions** über alle Läufe.
7. Headless: `verify:radar-repack` 30/30 · `verify:radar-runs` 52/52 · `verify:routing`
   **105/105** (4 Warm-Sonden auf den RD3-Vertrag umgestellt: Bild-berechtigt → meta + f000
   statt Tar, davor Tar wie bisher) · `verify:layer-erstbild` **37/37** (KONRAD zählt jetzt
   4 low-Abrufe; die Prioritäts-Sonden messen den Direktweg deterministisch mit
   `localStorage.radarimg` = '0') · `verify:radar-sampling` 25/25 · typecheck grün ·
   Build grün · Budget „alle eingehalten".

### 14.4 Selbstverifikation (Gate-Fragen) + offene Posten

1. **Funktionserhalt:** ✔ — alle Verbraucher erhalten byte-identische u8-Frames (B-Beweise);
   `?radarimg=0` stellt exakt RD2 wieder her (Drill 4); Frische über Gate-Leiter, Frische-
   Fenster und Metadata-Auflösung unverändert (Beleg 2, §14.3).
2. **Desktop-Regression:** ✔ — kein Pixel ändert sich (identische Werte, identische Layer);
   neu sind nur Netzpfade und Konsolenzeilen.
3. **Touch-Ziele:** ✔ — keine UI-Änderung.
4. **Konsole:** ✔ — 0 Fehler (Beleg 6).
5. **Long Tasks:** ⚠ NICHT gemessen — die 25 × `getImageData` (1100×1200) des Bild-Wegs sind
   ein möglicher Hauptthread-Posten; dafür entfallen bz2 (1,3–1,9 s Worker + V-WF-10-Falle)
   und Tar-Dekode. **V-RD-14:** am Prod-Build mit CPU-Drossel messen; bei > 200 ms
   `OffscreenCanvas` im Worker.

**V-Katalog:** **V-RD-12** Zweig `rd3-producer` nach dem nächsten main-Deploy zurückbauen
(Workflow auf `main`, Zweig löschen — Mitpflege-Pflicht bis dahin: Decoder-Änderungen auch auf
den Zweig). **V-RD-13** rzc-/INCA-Gates an der Spiegel-Telemetrie nachschärfen (das
rzc-Frische-Fenster kostet heute ~50 % der Loads den CDN-Weg; das KONRAD-Muster erlaubte
enger). **V-RD-14** s. o. **V-RD-15** Rückblick-Netz-Beleg im Browser nachholen (Code +
Verifier belegt; der Browser-Lauf traf keinen Rückblick-Einsatz). V-RD-4 (Repo-`size`) wächst
mit den zusätzlichen Pushes weiter — Beobachtungsposten bleibt. **V-RD-16:** die LIVE-Beobachtung
„`radar/img/` überlebt einen ICON-Force-Push" steht noch aus (die Wache wurde vor dem
09z-Publish gestoppt); die Heilung ist konstruktionsgleich zur RD1-belegten (publish() baut
`radar/` bei JEDEM Push komplett aus dem lokalen Bestand neu — Bilder gehen durch dieselbe
Kopie), beim nächsten Blick auf status.json nach einem :06-Publish gegenprüfen.
