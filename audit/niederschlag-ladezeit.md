# audit/niederschlag-ladezeit.md — Phase NL: Niederschlag in der Wetterkarte lädt manchmal sehr lange

> Jans Befund (01.10.): „die Ansicht Niederschlag in der Wetterkarte dauert manchmal sehr lange".
> Stand: **NL-1 + NL-2 umgesetzt (uncommitted), Gate s. §5.** Messwerkzeug und Rohdaten in `audit/niederschlag-ladezeit/`.

## §0 Kurzfassung

- **Bestätigt:** 11 kalte Aufrufe über einen ganzen 5-Minuten-Radartakt (Desktop, schnelle Leitung,
  Produktion). Regen sichtbar nach **2,2–3,5 s** in 6 Läufen, **4,0–7,0 s** in 3 Läufen, **10,7 s und
  20,7 s** in 2 Läufen, in **einem Lauf nach 30 s noch gar nicht**.
- **Ursache 1 (Fehler):** die vom Router vorgestarteten Abrufe (`warmRvTar`, LE1) haben **keine Frist**.
  Hängt jsDelivr, wartet der Leser unbegrenzt: Lauf #8 (> 30 s, roher Tar am CDN), Lauf #0 (meta.json 9,8 s,
  danach Folgefehler bis 20,7 s).
- **Ursache 2:** der Bild-Weg (RD3) ist **alles oder nichts** über 26 Dateien. Ein einziges Bild, das jsDelivr
  kalt nicht liefert — es hängt > 8 s (Lauf #1: 3 von 25) oder kommt als **403** (Läufe #9 und #10: dieselbe
  `f000.png` zweimal) —, verwirft den ganzen Slot und lädt den rohen Tar.
- **Ursache 3:** der rohe Tar ist seit dem HDF5-Umstieg (30.09., `cdc9a9b`) **9,4–9,7 MB** statt 2,5–2,6 MB
  (heutige Slots beim DWD, beide Formen nebeneinander). In den ersten 72 s jedes Takts (Slot noch nicht
  „Bild-berechtigt", ≈ 24 % aller Aufrufe) ist er der **Normalweg** — vor 240 s über Netlify.
- **Verstärker:** eine Frist zählt als „harter CDN-Fehler"; nach zwei schaltet die Sitzung das CDN ganz ab
  (`RADAR_CDN_FAIL_LATCH`), jeder weitere Abruf geht dann über Netlify (9,6 MB).
- **Das Muster gegen genau diesen jsDelivr-Fehler gibt es im Projekt schon:** der Punkt-Leser holt seit
  V-FI-5 (16.09.) eine Datei, die jsDelivr nach 2,5 s nicht beantwortet oder mit 403 ablehnt, von
  `raw.githubusercontent.com` (`fallbackStore`/`withRawFallback`, `src/point/client/store.ts:334–428`).
  Der Radar-Leser nutzt es nicht. `raw.githubusercontent.com` liefert die Radarbilder heute mit
  0,27–0,35 s TTFB und `Access-Control-Allow-Origin: *` (curl, Slot 2610011640).

## §1 Messung

Eigener Chromium 148 (`--headless=new`, echte GPU, kein rAF-Drosseln), `buscosun.com/wetterkarte/niederschlag?ort=München…&land=de`,
frischer Browser-Kontext je Lauf (kalter HTTP-Cache, kalte Cache-API), ein Lauf alle ≈ 31 s von 16:35 bis 16:40 UTC.
„Regen sichtbar" = Konsolenzeile `[buscosun] Niederschlag-Layer → …` (danach folgt nur noch der Textur-Upload).
„Alter" = Alter des jüngsten geratenen Slots beim Aufruf (`guessRvRuns`, Verzug 3,3 min).
Werkzeug `audit/niederschlag-ladezeit/lab.mjs`, Abrufliste je Lauf `2026-10-01-messung.txt`.

| # | Alter | Regen nach | Weg | was passiert ist |
|---|---|---|---|---|
| 0 | 308 s | **20,7 s** | DWD (Netlify) | vorgestartete `meta.json` (jsDelivr kalt) 9,8 s ohne Frist; Bilderfrist (8 s) inzwischen abgelaufen ⇒ Bild-Weg verworfen; roher Tar am CDN 8 s ⇒ Frist; zwei „harte Fehler" ⇒ CDN für die Sitzung aus ⇒ Netlify |
| 1 | 339 s | **10,7 s** | CDN, roher Tar | 22 von 25 Bildern in 0,4–4,1 s, **3 hängen** bis zur Frist (8 s) ⇒ ganzer Slot verworfen ⇒ Tar 8,98 MB |
| 2–6 | 369–493 s | 2,2–3,5 s | Bilder | Edge warm (die Läufe davor haben ihn gewärmt) |
| 7 | 224 s | 4,0 s | DWD (Netlify) | Slot noch nicht Bild-berechtigt ⇒ Tar 9,4 MB über Netlify |
| 8 | 254 s | **> 30 s** | — | vorgestarteter roher Tar am CDN hängt; **keine Frist** ⇒ kein Regen im Messfenster |
| 9 | 285 s | 7,0 s | CDN, roher Tar | `f000.png` **403** (jsDelivr, neue Datei) ⇒ Slot verworfen ⇒ Tar 8,99 MB |
| 10 | 315 s | 4,9 s | CDN, roher Tar | dieselbe `f000.png` wieder **403** (65 ms — am Edge festgehalten) ⇒ Tar |

Alle Läufe Desktop auf schneller Leitung. Auf Mobil-4G (≈ 9 Mbit/s) kostet der Tar allein ≈ 8,5 s Bytes.

**Dateigrößen beim DWD (01.10., 15:00–16:40 UTC, je Slot beide Formen):** `composite_rv_*.tar` 9,37–9,68 MB,
`DE1200_RV*.tar.bz2` 2,49–2,61 MB — Faktor 3,7. Spiegel (`radar/status.json`): Bild-Slot 2,89 MB, Push
≈ 3:27 min nach dem Slot.

## §2 Ursache im Code

1. **Frühstart ohne Frist.** `warmRvTar` (`src/sources/radolanRuns.ts:215–254`) startet `meta.json` +
   `f000.png` bzw. den rohen Tar mit `priority: 'high'` und ohne Abbruchsignal. Der Leser nimmt die
   Antwort über `takeWarmRvTar` und wartet sie ab: `imgRes` (`radolan.ts:296–305`) und
   `fetchRvBytesCached` (`radolan.ts:171–185`). Die 8-s-Frist (`radarCdnDeadline`) gilt nur für selbst
   gestartete Abrufe. Folge in #0: die Frist von `fetchRvFromImg` läuft ab, während er noch auf die
   vorgestartete `meta.json` wartet — die Bildabrufe danach starten mit abgelaufenem Signal und scheitern sofort.
2. **Alles oder nichts.** `fetchRvFromImg` (`radolan.ts:312–341`): `Promise.all` über 25 Bilder unter
   einer Frist; jeder Fehler ⇒ `null` ⇒ roher Tar (`fetchRvTar`, `radolan.ts:422–442`).
3. **Roher Tar = HDF5.** `fetchRvDecoded` (`radolan.ts:407–420`) fragt seit EX-3 die HDF5-Form zuerst.
   `rvImgEligible` (`radolanRuns.ts:172–176`, Bild-Gate 270 s) gegen `guessRvRuns` (Verzug 3,3 min):
   ein Slot ist 198–270 s lang der jüngste, aber nicht Bild-berechtigt ⇒ roher Tar; < 240 s über Netlify.
4. **Sitzungs-Latch.** `noteRadarCdnFailure` zählt jede Frist und jeden Netzfehler (`radolan.ts:205–208`,
   `338`); ab 2 ist `radarCdnUsable()` falsch — für Bild-Weg und Tar-Weg, bis zum Neuladen.
5. **Kalter Edge.** Jeder Slot ist neu; der Spiegel wärmt jsDelivr nach dem Push nicht (offen seit V-FI-7).
   Wer als Erster kommt, trägt den kalten Abruf — bei wenig Verkehr fast jeder.

Dieselbe Kette speist die Seite Regenradar (`radar/radarFrames.ts:152`) und den Nowcast-Member von
buscosun Fusion (`pointForecast/radarNowcast.ts:57`, `shareInFlight` teilt den Lauf). INCA und rzc laufen
über denselben Bild-Helfer (`fetchImgRes`), sind aber 13 bzw. 2 Dateien und klein (10–40 KB je Bild).

## §3 Vorschlag (Reihenfolge = Nutzen je Risiko)

- **NL-1 (Fehler beheben):** die vorgestartete Antwort bekommt dieselbe Frist wie ein eigener Abruf
  (Wettlauf gegen `radarCdnDeadline`; läuft sie ab, weiter wie bei einer CDN-Frist). Ändert nichts, wenn
  der Frühstart rechtzeitig kommt.
- **NL-2 (bewährtes Muster übernehmen):** jedes Radarbild (und `meta.json`) über jsDelivr **mit
  Ausweichweg `raw.githubusercontent.com`**: Hedge nach 2,5 s ohne Kopfzeilen, 403/Frist/5xx ⇒ Ausweichweg,
  404 bleibt „nicht da" — exakt die Regeln von `fallbackStore` (V-FI-5, V-FI-40). Dann verwirft ein
  einzelnes hängendes oder abgelehntes Bild nicht mehr den Slot; der 9,6-MB-Tar wird wieder die Ausnahme.
  Ein Ausweich-Abruf zählt nicht als harter CDN-Fehler.
- **NL-3 (Jans Entscheidung E-NL-1):** in den ersten 72 s des Takts nicht den rohen Tar des jüngsten
  Slots laden, sondern **den vorigen Slot als Bilder** (fertig, klein, Edge meist warm) und den jüngsten
  nachladen, sobald er Bild-berechtigt ist (≤ 72 s später, die Anzeige nennt den Lauf). Entfernt den
  9,6-MB-Normalweg und die Netlify-Bytes. Preis: bis zu 72 s lang ein 5 Minuten älterer Lauf — das
  widerspricht der bisherigen Regel „aggressiv raten" (BW-5, `radolan.ts:110–114`), deshalb Jans Wahl.
  Betrifft auch den Nowcast-Member von buscosun Fusion (gleiche Kette).
- **NL-4 (Jans Gate, Daten-Repo):** Warm-up im Radar-Spiegel nach dem Push (V-FI-7) — erst wenn jsDelivr
  den neuen Commit auflöst, sonst hält der Edge 404/403 fest.

Prüfung: Verifier mit gestelltem `fetch` (hängender Frühstart ⇒ Frist greift; ein 403-Bild ⇒ Ausweichweg,
Slot bleibt Bild-Weg; 404 ⇒ kein Ausweichweg; Latch zählt Ausweich-Abrufe nicht), `verify:radar-runs`,
`verify:radar-repack`, `verify:layer-erstbild`, Lab-Messung vorher/nachher über einen ganzen Takt, typecheck,
Build, Budget.

## §4 Entscheidungen und Verbesserungen

- **Freigabe (Jan, 01.10.): NL-1 + NL-2 umsetzen.**
- **E-NL-1: entschieden (Jan, 01.10.): NL-3 nicht** — der jüngste Slot bleibt der erste Versuch (BW-5).
- **E-NL-2:** NL-4 Warm-up im Spiegel-Workflow (Daten-Repo).
- **V-NL-1** Der Sitzungs-Latch unterscheidet nicht zwischen „CDN gesperrt" (Firmennetz) und „ein kalter
  Abruf war langsam". Mehrwert: ein einzelner Ausreißer schickt nicht die ganze Sitzung über Netlify.
  Skizze: Fristen je Slot zählen oder erst nach zwei Slots latchen.
- **V-NL-2** Der rohe HDF5-Tar liegt mit 9,6 MB je Slot im Daten-Repo (12 Slots ≈ 115 MB im Baum, ×3,7
  gegen RADOLAN). Mehrwert: kleinere Pushes, weniger Repo-Wachstum. Skizze: prüfen, wer den rohen Tar am CDN
  noch braucht (Client-Rückfall, `nowcastReader.mjs`); ggf. nur die Bilder spiegeln.
- **V-NL-3** Der Bild-Weg zeigt erst, wenn alle 25 Bilder da sind. Mehrwert: Regen „jetzt" nach einem Bild
  statt nach 25. Skizze: `f000` zuerst anzeigen, den Rest nachreichen (Verbraucher brauchen heute den
  ganzen Stapel ⇒ eigener Schritt).
- **V-NL-4** `radarraw` (neu) und `rvfmt` (EX-3) stehen nicht in `SHARE_BLOCKED_KEYS` — ein geteilter Link
  kann den Diagnose-Schalter mitnehmen. Mehrwert: geteilte Links tragen nie Werkstatt-Schalter. Skizze: beide
  Schlüssel eintragen; das baut das Edge-Bündel `og-meta` neu (`npm run edge:share`, `verify:share` SH6) ⇒
  Edge-Function-Änderung = Jans Gate. Deshalb in NL bewusst nicht gemacht.
- **V-NL-5** Ein 404 von jsDelivr gilt weiter als „nicht da" (Jans Vorgabe). Ob jsDelivr für einen
  Bild-berechtigten Slot je 404 statt 403 antwortet (Auflösung von `@main` hinkt), ist nicht gemessen.
  Mehrwert: falls ja, rettete der Ausweichweg auch diesen Fall. Skizze: im Lab über einen Tag zählen.

## §5 Umsetzung NL-1 + NL-2 und Gate (01.10.)

**Geändert.**

| Datei | Änderung |
|---|---|
| `src/sources/radarImg.ts` | `fetchImgRes(url, signal, priority, started?)`: Ausweichweg `raw.githubusercontent.com` (`RADAR_RAW_BASE`, `radarRawUrl`) — Hedge nach `RADAR_RAW_HEDGE_MS` = 2 500 ms ohne Kopfzeilen, sofort bei 403/5xx/Netzfehler, 404 bleibt `RadarImg404` ohne Ausweichweg, schnellere Antwort gewinnt, Verlierer abgebrochen, Körper innerhalb der Frist gepuffert. `started` = vorgestartete Antwort unter derselben Frist/demselben Hedge (NL-1). Schalter `?radarraw=0\|1` / `localStorage.radarraw` (`radarRawFlagFrom`). Gilt für alle Bild-Wege (RV, INCA, rzc) |
| `src/sources/radolan.ts` | `imgRes` reicht den Frühstart an `fetchImgRes` (NL-1 Bild-Weg); `fetchRvBytesCached`: vorgestarteter CDN-Tar unter `radarCdnDeadline` (Kopfzeilen und Körper), Ablauf = harter CDN-Fehler, danach **kein** zweiter CDN-Versuch für denselben Tar, sondern Netlify (NL-1 Tar-Weg) |
| `scripts/verify-radar-fallback.mjs` (neu), `package.json` | `verify:radar-fallback` |
| `budget.json` | totalJs 1 514 → 1 516 mit Notiz (Ausweichweg +0,8 KB gzip im Lazy-Chunk `radarImg`) |

Nicht geändert: Bild-Gate, Rat des jüngsten Slots (E-NL-1), Sitzungs-Latch-Regel (V-NL-1), roher Tar-Weg selbst.

**Belege.**

- `verify:radar-fallback` **22/22**, rot vor der Umsetzung gesehen (11/21; B1 und B3 liefen in die
  Zeitüberschreitung = die gemessenen Hänger #0 und #8). A1–A13 `fetchImgRes` gegen gestelltes `fetch`
  (CDN gut ⇒ kein raw; 403/Netz ⇒ raw; Hedge ab 2 512 ms, CDN-Abruf abgebrochen; 404 ⇒ kein raw; 403 + 404 ⇒
  „nicht da"; beide Netzfehler ⇒ harter Fehler; Schalter; fremde Basis; Frist beendet beide Wege; hängender
  Frühstart ⇒ Hedge bzw. Frist). B1–B4 Ende zu Ende über `warmRvTar` + `fetchRvNowcast` mit echten
  1100 × 1200-PNG: #0 ⇒ Regen in 2,9 s über den Bild-Weg, kein Tar, Latch 0; #9 ⇒ nur `f000.png` über raw,
  0,6 s; #8 ⇒ Netlify nach 8 009 ms, CDN-Tar nicht zweimal; Gegenprobe 404 ⇒ kein raw, Tar wie bisher.
- `verify:radar-runs` 55/55 (+1 ⊘ live), `verify:radar-repack` 48/48 (+1 ⊘), `verify:layer-erstbild` 38/38,
  `verify:radar-sampling` grün, `verify:share` 528/528, typecheck 0, Build 249/249, `npm run budget` grün
  (eagerJs 108,6 / 108,7 unverändert, totalJs 1 514,3 / 1 516). Textsonde: `radarraw` und
  raw.githubusercontent nur im Lazy-Chunk `radarImg`, nicht in `index-*.js`.
- **Browser, neuer Build** (`vite preview`, echtes CDN/DWD, 11 kalte Aufrufe über einen ganzen Takt,
  21:09–21:14 UTC, `gate/2026-10-01-nachher.txt`):

| Fall | vorher (16:35–16:40) | nachher (21:09–21:14) |
|---|---|---|
| Slot Bild-berechtigt | 2,2–3,5 s; **10,7 s, 20,7 s, > 30 s** | **2,2–4,6 s** (7 Läufe) |
| Slot noch nicht Bild-berechtigt (roher Tar) | 4,0–7,0 s | 3,9–7,9 s (4 Läufe; E-NL-1 = so gewollt) |
| Lauf ≥ 10 s | 3 von 11 | **0 von 11** |

  Nachher-Lauf #1 zeigt den Ausweichweg am echten CDN: 12 von 25 Bildern kamen von jsDelivr kalt nicht
  (abgebrochen bei 3,8 s), raw.githubusercontent lieferte sie ab 3,47 s (Hedge 2,5 s nach dem Abrufstart),
  Regen nach 4,6 s — vorher führte genau dieser Fall (#1, 3 hängende Bilder) zu 10,7 s und 9 MB Tar.

**Fünf Fragen.** (1) Funktionserhalt: gleiche Wege, gleiche Daten; der Ausweichweg liefert dieselbe Datei
desselben Commits, 404 und Schalter verhalten sich wie bisher (A6/A9/B4). (2) Desktop pixelgleich: keine
UI-Änderung, die Bilder sind byte-gleich (dieselbe Datei). (3) Touch-Ziele: unverändert. (4) Konsole: in allen
Lab-Läufen ohne Warnung/Fehler. (5) Long Tasks: keine neuen (die Puffer sind ≤ 115 KB je Bild). Offen:
Messung auf Mobil-4G und Real-Device; die Läufe vorher/nachher lagen an verschiedenen Uhrzeiten (andere
Regenlage: Tar 9,6 → 7,3–7,9 MB, Bilder 2,9 → 2,3 MB) — der Vergleich der Ausreißer stützt sich deshalb auf
die gestellten Szenarien B1–B4, die Browser-Läufe zeigen, dass der Weg am echten CDN greift.

**Messbedingungen.** Auf der Maschine lief die ganze Zeit ein fremder Vite-Dev-Server (PID 14356, seit
30.09., ≈ 1 Kern Dauerlast, Gesamtlast 80 %) — nicht beendet, er gehört nicht zu dieser Sitzung. Er
verlängert die Start-Frames der Karte in beiden Builds (Kontrolle verschränkt alt/neu,
`audit/karte-ruckler/gate/2026-10-01-ab-unter-last.txt`).
