# Phase SG — Sounding-Absicherung vor dem DWD-Stichtag 30.11.2026

> Stand 2026-10-19 · Zweig `fix/sounding-guard` (Worktree `.wt-sg`, von `origin/main` `00d7c9b`) · ein Commit · Kickoff `prompt-sounding-guard.md`.
> Scope: genau eine kleine Absicherung. Keine neue Datenquelle, keine Migration auf den neuen DWD-Baum (`/weather/nwp/v1/m/`) — das ist Phase AM (`prompt-atmo-hoehen.md`); AM-1 dort ist mit dieser Phase erledigt und braucht nur noch eine Gegenprüfung.

## 1 Befund (Diagnose vor dem Code)

### 1.1 Ausfallbild heute

`src/sources/iconEuSounding.ts` liest die ICON-EU-Druckflächen aus dem alten DWD-Baum `/weather/nwp/icon-eu/grib/` (über `/_dwd_opendata`). Der DWD beendet dieses URL-Schema am **30.11.2026** (`QUELLENMATRIX.md` §6, `SCHEDULED_CHANGES` in `src/point/sourceMatrix.ts`, V-EX-4).

- `resolveRun()` probt bis zu 8 Läufe (3-h-Schritte rückwärts) per HEAD auf `…_000_500_T.grib2.bz2`. Antwortet der Baum 404, sind alle 8 Proben `false` ⇒ `throw new Error('… kein publizierter Druckflächen-Lauf gefunden')`.
- Verbraucher: `src/atmosphere/AtmosphereProfile.tsx` (Emagramm; daraus Föhn, Thermik, Inversion, Nerd-Panel über `profile-derivations.ts`) und `src/threed/SoundingPanel.tsx` (3D-Panel). Beide fangen den Fehler und zeigen „⚠ ICON-EU Sounding: kein publizierter Druckflächen-Lauf gefunden" — ab dem Stichtag dauerhaft, bei **jeder** Markerbewegung erneut 8 HEAD-Proben.
- **Abbruch = „nicht da":** `headOk()` fing *jede* Ausnahme und gab `false` zurück. Ein `AbortError` (Ortswechsel während der Probe) zählte damit als fehlende Datei; `resolveRun` warf nach einem Abbruch zudem `new Error('aborted')` statt eines `AbortError`. Die Verbraucher prüfen zwar `signal.aborted` vor dem Setzen des Fehlers, aber ein Rückfall-Wrapper hätte auf dieser Basis falsch auf GFS gewechselt (CLAUDE.md: `AbortError` ≠ absent).
- `src/sources/gfsSounding.ts` existiert mit demselben `SoundingProfile`-Shape und derselben Signatur `fetchSoundingAtPoint(lat, lon, surfaceM, leadHours, signal)` (NOAA GFS 1°, über `/_gfs`, Public Domain) — bisher von niemandem importiert.

### 1.2 Zeit-Semantik (gemessen 2026-10-19 18:54 UTC, `scratchpad/diag-sounding.mjs`)

Die Scrubber-Stunde `hour` des Stores ist **„jetzt + h"** (`atmosphereUrl.ts`: `hourFromValidAt(validAtMs, now)` = `round((validAt − now)/1 h)`, `validAtFromHour(h, now)` = `now + h`). Beide Quellen behandelten `leadHours` aber als **Schritt ab Laufbeginn** — das Profil galt für `runAt + h`, nicht für `now + h`.

| Quelle | jüngster Lauf | Versatz now − run | +0 h zeigte | +24 h zeigte | +48 h zeigte | gewollt (+0/+24/+48) |
|---|---|---|---|---|---|---|
| ICON-EU | 2026-10-19 15Z (2 HEAD-Proben: 18Z 404, 15Z 200) | **3 h** | 19.10. 15Z | 20.10. 15Z | 21.10. 15Z | 19.10. 18Z / 20.10. 18Z / 21.10. 18Z |
| GFS | 2026-10-19 12Z | **6 h** | 19.10. 12Z | 20.10. 12Z | 21.10. 12Z | dito |

Der Versatz ist real und beim Rückfall größer (GFS-Läufe sind 6-stündlich und später publiziert: typisch 4–9 h). Dazu am DWD-Verzeichnis gemessen: der 15Z-Lauf hat für 500 hPa T 34 Schritte — **stündlich bis +30, dann 3-stündlich bis +48**. Zwischenläufe (03/09/15/21 UTC) tragen also nicht jeden Schritt; Hauptläufe (00/06/12/18) stündlich bis +78, 3-stündlich bis +120. Der alte `pickStep` klemmte auf 48 und kannte das Raster nicht: `hour = 31…47` auf einem Zwischenlauf lief heute schon ins Leere („zu wenige Niveaus").

### 1.3 GFS funktioniert heute (echtes Modul in Node, direkter Bucket)

| Punkt | Höhe | +0 h | +24 h | +48 h | erster Abruf | Cache-Treffer |
|---|---|---|---|---|---|---|
| Frankfurt (50,11/8,68) | 112 m | 10 Niveaus (1000…200) | 10 | 10 | 2 414 / 1 193 / 1 095 ms | 0 ms |
| Innsbruck (47,27/11,40) | 574 m | 8 Niveaus (823…200) | 8 | 8 | 1 774 / 1 629 / 893 ms | 0–147 ms |
| Zugspitze (47,42/10,99) | 2 962 m | 8 Niveaus (842…200) | 8 | 8 | 1 670 / 1 856 / 1 664 ms | 143–151 ms |

Boden-T Innsbruck +0 h 10,9 °C, Zugspitze 11,5 °C — die GFS-Bodendruckfläche (1°-Orografie) liegt für den Gipfel bei 842 hPa, nicht bei ≈ 700 hPa (V-SG-4).

### 1.4 Stellen, die ICON-EU als Profilquelle nennen

`AtmosphereProfile.tsx` 86/114 (Platzhalter, Ladetext) · `VerticalProfile.tsx` 230 (Quellenzeile) · `NerdPanel.tsx` 84 · `SoundingPanel.tsx` 74/87–88 · `ThermalMap.tsx` 164 · `foehn.ts` `PRESSURE_GATE_NOTE` (über `FoehnPanel.tsx` 41) · `AtmospherePage.tsx` 95/128 (Intro-Stichpunkt, Trust-Zeile). Kommentar-Erwähnungen in `profile-derivations.ts`, `soundingMath.ts`, `thermalField.ts`, `isentropes.ts` bleiben (Meteorologie unverändert).

### 1.5 Terminregister

`SCHEDULED_CHANGES` (`src/point/sourceMatrix.ts`) trägt den Termin `2026-11-30` mit `affects: ['icon_eu', …]`. Das Register ist die Quellmatrix des Punkt-Producers (≈ 900 Zeilen Daten) und gehört nicht in den Atmosphäre-Chunk; deshalb **eine exportierte Konstante** `ICON_EU_OLD_TREE_END_MS` in `sources/sounding.ts`, und der Verifier prüft, dass sie dem Register-Eintrag gleicht (Prüfung 4).

## 2 Änderung

**Neu `src/sources/sounding.ts`** — `fetchSoundingWithFallback(lat, lon, surfaceM, hour, signal, opts?) → { profile, source: 'icon-eu' | 'gfs', note? }`:

1. Vor dem Stichtag ICON-EU zuerst; „nicht da" (`SoundingUnavailableError` `no-run`/`too-few-levels`, oder HTTP 404/410 im Fehlertext) ⇒ GFS mit `note` „ICON-EU nicht verfügbar — Rückfall auf GFS".
2. Ab `2026-11-30T00:00Z` direkt GFS, **null** Anfragen an den alten Baum; `note` „ICON-EU-Druckflächen (altes DWD-Schema) seit 30.11.2026 abgeschaltet — Profil aus GFS".
3. Abbruch (`AbortError` oder `signal.aborted`) wird weitergeworfen, nie Rückfall, nie Memo.
4. Memo: nach `no-run` wird ICON-EU 30 min übersprungen (`ICON_EU_ABSENT_MEMO_MS`); `too-few-levels` (Lauf da, Schritt fehlt) setzt **kein** Memo — das ist ein Schritt-, kein Baum-Problem.
5. Beide weg ⇒ ein Fehler „Sounding nicht verfügbar — ICON-EU: ‹Grund›; GFS: ‹Grund›".
6. Zielzeit `soundingTargetMs(now, hour)` = volle Stunde nächst jetzt + h; beide Quellen bekommen sie als neuen optionalen 6. Parameter `validAtMs` (alte Signatur bleibt: ohne das Feld rechnet die Quelle wie bisher ab Laufbeginn — Prüfung 6).
7. Schalter `?snd=gfs` (GFS erzwingen, Notiz „Testschalter ?snd=gfs — Profil aus GFS") und `?snd=icon-eu` (ICON-EU ohne Rückfall, ehrlicher Fehler).
8. Beschriftung aus **einer** Tabelle `SOUNDING_SOURCE_LABEL` (`name`, `grid`, `short`, `caveat`, `attribution`), `soundingSourceName()` für Fließtext („Modell", solange nichts geladen ist). Seam `opts.sources` für den Verifier.

**`iconEuSounding.ts`:** `headOk()` wirft Abbrüche weiter; `SoundingUnavailableError` mit `reason`; `resolveRun(signal, targetValidMs?)` überspringt einen Lauf, dessen Raster die Zielzeit nicht erreicht (Zwischenlauf jenseits +48 h), und verwirft den Lauf-Cache in diesem Fall; `pickStep(lead, runHour)` auf dem gemessenen Raster (stündlich bis 30/78, darüber auf 3 h gerundet, geklemmt bei 48/120); vor „zu wenige Niveaus" wird ein Abbruch als solcher geworfen. **`gfsSounding.ts`:** `validAtMs` ⇒ `fhour`, und `pickFhour` rundet auf das **3-h-Raster** — das 1°-Produkt `pgrb2.1p00` liegt nur 3-stündlich (V-SG-7, im Live-Lauf gefunden). Meteorologie beider Module unangetastet.

**Verbraucher:** `AtmosphereProfile.tsx`, `SoundingPanel.tsx` rufen den Wrapper; `atmosphereStore.tsx` `SoundingBundle` trägt `source` und `note`; `VerticalProfile.tsx` (Props `source`, `note`), `NerdPanel.tsx`, `ThermalMap.tsx`, `FoehnPanel.tsx` (`pressureGateNote(modelName)`, `PRESSURE_GATE_NOTE` bleibt als neutrale Fassung exportiert) beschriften aus der Tabelle; Ladetexte neutral („Modell-Druckflächen"); `AtmospherePage.tsx` Intro „Höhenprofil aus Modell-Druckflächen (ICON-EU, bei Ausfall GFS)", Trust-Zeile „ICON-EU/GFS" — `verify:seo` bleibt grün (läuft im Build, 260/260).

**Nicht angefasst:** `soundingMath.ts`, `profile-derivations.ts`, buscosun Fusion, `src/point/**`, Daten-Repos, Edge Functions, `netlify.toml`, Dependencies.

## 3 Verifier `npm run verify:sounding-guard` (`scripts/verify-sounding-guard.mjs`)

Gestellt sind nur `fetch` und die Uhr (`opts.nowMs`); gerechnet wird mit den echten Modulen. Wo eine Quelle liefern soll, steht eine Fixture in `SoundingProfile`-Form (Seam `opts.sources`). **46/46 grün** (2026-10-19 19:30 UTC):

```
OK   1 alter Baum 404 ⇒ source gfs · Rückfall-Notiz · ICON-EU: 8 HEAD-Proben, kein GET · GFS einmal gerufen
OK   7 Memo: 2. Aufruf binnen 30 min ⇒ keine Anfrage an den alten Baum · Notiz bleibt · nach 30 min wieder 8 Proben
OK   2 Abbruch ⇒ AbortError weitergeworfen · GFS nie gerufen · 1 HEAD · KEIN Memo (nächster Aufruf probt, 8)
OK   3 Gegenprobe: ICON-EU da ⇒ icon-eu · GFS nie gerufen · keine Notiz · Zielzeit = jetzt + 12 h
OK   3b Lauf gefunden, Dateien 404 ⇒ GFS mit Notiz · 41 GET gingen raus · KEIN Memo
OK   4 Stichtag 00:00Z ⇒ GFS direkt, 0 Anfragen an den alten Baum · 40 Tage danach ebenso · 1 ms davor ICON-EU noch
OK   4 Stichtag = SCHEDULED_CHANGES (icon_eu, URL-Schema) 2026-11-30 · = Date.UTC(2026, 10, 30)
OK   5 beide weg ⇒ EIN Fehler, nennt ICON-EU und GFS · kein AbortError · nach dem Stichtag „abgeschaltet" + GFS-Grund
OK   6 ICON-EU +0/+24/+48 h: ein Schritt je Abruf, validAt = Zielzeit (run 18Z step 1/25/49) · kein Zwischenlauf jenseits +48
OK   6 ICON-EU alte Signatur: Schritt = leadHours · GFS +0/+24/+48 h: f007/f031/f055 = Zielzeit − Laufbeginn 12Z
OK   8 ?snd=gfs ⇒ GFS, ICON-EU nie gerufen · ?snd=icon-eu bei 404 ⇒ kein Rückfall · Schalter-Parser
OK   Beschriftung: GFS nennt GFS, nie ICON-EU · ICON-EU nennt ICON-EU · Richtwert „~25 km, Standard-Druckflächen" · Zielzeit volle Stunde
verify:sounding-guard: 46/46 passed
```

Lehre aus dem ersten Lauf (45/46): die Gegenprobe „1 ms vor dem Stichtag" mit gestellter Uhr lief ins Leere, weil `resolveRun` seine Kandidaten aus der **echten** Uhr bildet und kein Oktober-Lauf eine November-Zielzeit erreicht. Die Gegenprobe des Datums-Tors prüft jetzt mit gestellter ICON-EU-Quelle, isoliert vom Lauf-Finder (V-SG-5).

## 4 Gates

### 4.1 Typecheck, Build, Budget

- `npm run typecheck` grün. `npm run build` grün (enthält `verify:seo` 260/260 und `verify:routing`).
- `npm run budget`: eagerJs **110,0 KB unverändert** (Kontrollbau `origin/main` `00d7c9b` in `.wt-sg-base`: 110,0), eagerCss 2,4, largestChunk 278,4; **totalJs 1 826,6 KB gegen 1 824,7 KB** am Kontrollbau = **+1,9 KB gzip** (neues Modul + Zielzeit in beiden Quellen, alles lazy). Die Ratsche stand auf 1 825 und wäre um 1,6 KB gerissen ⇒ mit Notiz in `budget.json` auf **1 830** angehoben (Jan 30.09.: Anheben mit Notiz erlaubt, nie `--update`).

### 4.2 Nachbar-Verifier

| Verifier | `.wt-sg` | Kontrollbau `origin/main` | Urteil |
|---|---|---|---|
| `verify:route-3d` | 587/589 | 587/589 (dieselben zwei: „Grenzwert-Modus ohne Schalter", Laufzeit-Abhängigkeiten @mui/@emotion) | vorbestehend, nicht aus SG |
| `verify:share` | 526/527 | 527/528 (SH6 Edge-Bündel ≠ Quelle, `npm run edge:share`) | vorbestehend, nicht aus SG |
| `verify:routing`, `verify:seo` | grün (im Build) | — | — |

### 4.3 Live im Dev-Server (`npx vite --port 5194`, headless Chromium über CDP, `scripts/lib/cdpBrowser.mjs`)

Innsbruck, Linse Föhn (`/atmosphaere/berg-und-weg/innsbruck`), kalter Browser-Kontext je Fall, 2026-10-19 ≈ 19:10–20:30 UTC. Belege: `audit/atmo-sounding-guard/*.png`, Rohwerte `live-2026-10-19.json` (erster Lauf, mit dem GFS-Fehlschlag V-SG-7) und `live-2026-10-19-atmo-desktop-gfs_atmo-mobile-gfs.json` (nach dem 3-h-Fix).

| Fall | Zeit bis Profil | Anfragen alter Baum (HEAD) | `/_gfs/` | Quellenzeile Profil | Nerd / Föhn-Notiz | Konsole |
|---|---|---|---|---|---|---|
| Desktop 1440×900, normal, `?nerd=1` | 7,2 s | 39 (2) | 0 | „ICON-EU (~7 km, Druckflächen) · Lauf 19.10. 15Z · gültig 19.10. 19Z" | „ICON-EU (~7 km) · Lauf 15Z (vor 4 h) · gültig 19Z" / „Index aus ICON-EU-Höhenwind" | 1× `Failed to load resource 404` (die HEAD-Probe des noch nicht publizierten 18Z-Laufs — Browser-Log, kein App-Fehler, wie vor SG) |
| Desktop, `?snd=gfs` | 21,3 s | **0** | 42 | „GFS (~25 km, Druckflächen) · Lauf 19.10. 12Z · gültig 19.10. 21Z · … · Testschalter ?snd=gfs — Profil aus GFS" | „GFS (~25 km) · Lauf 12Z (vor 8 h)" / „Index aus GFS-Höhenwind + Bodentrockenheit. Testschalter ?snd=gfs — Profil aus GFS." | 1× 404 (idx-Probe des 18Z-Laufs im Lauf-Finder) |
| Mobil 390×844 DPR 3, normal | 7,7 s | 39 (2) | 0 | wie Desktop (ICON-EU, 15Z, gültig 19Z) | Föhn-Notiz ICON-EU | 1× 404 (HEAD 18Z) |
| Mobil, `?snd=gfs` | 19,7 s | **0** | 42 | wie Desktop (GFS, 12Z, gültig 21Z, Testschalter-Notiz) | Föhn-Notiz GFS | 1× 404 (idx 18Z) |

Lesart: die Zielzeit stimmt (Abruf ≈ 19:00/20:30 UTC ⇒ ICON-EU gültig 19Z aus dem 15Z-Lauf = Schritt 4; GFS gültig 21Z aus 12Z = f009, das 3-h-Raster erlaubt ±1,5 h — vor SG hätten beide „15Z" bzw. „12Z" gezeigt). Emagramm, Verdikt, Föhn-Karte und Nerd-Tabelle rendern aus GFS vollständig (8 Niveaus ab 823 hPa; Screenshots `atmo-desktop-gfs.png`, `atmo-mobile-gfs.png`). Keine `exception`, keine `console.error` der App. Die beiden Fälle des 3D-Panels (`/tourenplanung/3d`) blieben ohne Beleg: die Seite rendert `ThreeDPage` nicht (V-SG-8).

### 4.4 Fünf Selbstverifikationsfragen

1. **Funktionserhalt:** ICON-EU bleibt erste Wahl (Gegenprobe 3, Live normal); Emagramm, Föhn, Thermik, Nerd, 3D-Panel laufen weiter; alte Signaturen beider Quellen erhalten (Prüfung 6). Nichts entfernt.
2. **Desktop pixelgleich:** nicht pixelgleich *per Design* — die Quellenzeile nennt das echte Modell und ggf. die Notiz; Layout/Geometrie des Profils unverändert (gleiche Klassen, kein CSS geändert).
3. **Touch-Targets:** keine neuen Bedienelemente.
4. **Konsole:** s. 4.3.
5. **Long Tasks:** kein neuer Rechenpfad auf dem Main-Thread; der Wrapper ist reine Steuerung.

## 5 Offene Punkte und Befunde (D-28)

- **V-SG-1 (umgesetzt):** `headOk()` wertete Abbrüche als „nicht da" — ein Rückfall hätte beim Ortswechsel fälschlich auf GFS gewechselt. Jetzt propagiert.
- **V-SG-2 (umgesetzt):** Scrubber-Stunde ≠ Modellstunde (3 h ICON-EU, 6 h GFS). Jetzt Zielzeit in beiden Quellen. **Mehrwert:** „+24 h" ist jetzt morgen um dieselbe Uhrzeit, nicht 3–9 h früher.
- **V-SG-3 (umgesetzt):** Zwischenläufe tragen ab +30 nur 3-h-Schritte; der alte Leser lief für `hour = 31…47` ins Leere. Jetzt Raster je Lauf und Laufwahl nach Reichweite. **Offen:** zwischen +30 und +48 auf einem Zwischenlauf ist die Auflösung 3 h (±1,5 h zur Zielzeit) — ein Hauptlauf (6 h älter) wäre stündlich; Abwägung Alter vs. Raster nicht umgesetzt.
- **V-SG-4 (offen, Meteorologie, nicht in dieser Phase):** GFS-Bodendruck aus der 1°-Orografie (Zugspitze 842 hPa statt ≈ 700) ⇒ Bodenniveau des GFS-Profils ist für Gipfel falsch; ICON-EU (7 km) hat dasselbe Prinzip in kleinerem Maß. **Skizze:** Bodendruck aus `surfaceM` (DEM) hypsometrisch mit der Modell-Temperatur, Modell-PS nur, wenn |Modellhöhe − DEM| < 300 m.
- **V-SG-5 (Verifier-Lehre):** eine gestellte Uhr im Wrapper trifft die echte Uhr im Lauf-Finder — Datums-Tore mit gestellter Quelle prüfen, Lauf-Finder mit echter Uhr.
- **V-SG-7 (umgesetzt, Live-Lauf):** Der erste Live-Lauf mit `?snd=gfs` endete in „GFS Sounding: zu wenige Niveaus" (45 Anfragen an `/_gfs/`, Felder 404). Am Bucket gemessen: `pgrb2.1p00` trägt nur f000, f003, … f384 (3-stündlich); stündlich ist nur `0p25` (hourly bis 120, ~13× größere Felder), `0p50` 3-stündlich. Die Modulnotiz „1°-Lauf: stündlich bis 120" war falsch — ein latenter Fehler, der schon vor SG jede Nicht-3er-Stunde ins 404 schickte. Jetzt rundet `pickFhour` auf 3 h; `validAt` nennt die echte Stunde (±1,5 h zur Zielzeit). **Lehre:** Registry-Angaben (Schritte) am Verzeichnis messen (CLAUDE.md), auch für Rückfallquellen, die „nur daliegen".
- **V-SG-8 (offen, Befund):** `src/threed/ThreeDPage.tsx` — und damit `SoundingPanel.tsx` — wird von **keiner Route** gerendert (kein Import außer Typ-Imports; die 3D-Tourenansicht ist `RoutePage` mit `view=3d`). Das „3D-Panel" aus dem Kickoff ist im Produkt heute nicht erreichbar; es ist umgestellt und typgeprüft, aber ohne Live-Beleg. **Skizze:** entweder das Sounding-Panel in `RoutePage`/`view=3d` einhängen (Knopf „Vertikal-Sounding" am Ort) oder ThreeDPage als Altbestand kennzeichnen — Jans Entscheidung (E-SG-1).
- **V-SG-6 (offen):** Memo und Lauf-Cache sind Modulzustand ohne Sicht für Jan; ein `?pflog=1`-artiges Konsolenprotokoll („ICON-EU übersprungen bis …") wäre bei der Abnahme am 30.11. hilfreich.
- **Phase AM:** die eigentliche Migration (neuer Baum, Dreiecksgitter, CCSDS) bleibt `prompt-atmo-hoehen.md`; AM-1 ist mit SG abgedeckt.

## 6 Jans Schritte

1. **Vor dem 30.11.:** `fix/sounding-guard` nach `main` mergen (oder den einen Commit cherry-picken) und deployen. Ohne das zeigt das Höhenprofil ab dem 30.11. nur noch den Fehler.
2. **Heute prüfbar:** `/atmosphaere/berg-und-weg/innsbruck?nerd=1&snd=gfs` — Quellenzeile unter dem Profil „GFS (~25 km, Druckflächen)", Nerd-Panel „GFS (~25 km)", Föhn-Notiz „Index aus GFS-Höhenwind", dazu die Notiz „Testschalter ?snd=gfs — Profil aus GFS". Das 3D-Sounding-Panel ist heute über keine Route erreichbar (V-SG-8, E-SG-1).
3. **Am 30.11.:** die Live-Seite einmal ohne Schalter öffnen — Notiz „… seit 30.11.2026 abgeschaltet — Profil aus GFS" und in den DevTools **keine** Anfrage an `/_dwd_opendata/weather/nwp/icon-eu/grib/`.
4. `CLAUDE.md`/`MANUELLE-SCHRITTE.md` wurden hier nicht angefasst. Zeile für die Statustabelle: **SG — Sounding-Absicherung** | `sources/sounding.ts`: ICON-EU zuerst, GFS als Rückfall, ab 30.11. direkt GFS, Zielzeit statt Laufschritt, Beschriftung je Quelle; Zweig `fix/sounding-guard` | `?snd=gfs`, `?snd=icon-eu` | Merge vor dem 30.11. (§ in MANUELLE-SCHRITTE), V-SG-3/4/6; Phase AM | `atmo-sounding-guard.md`.
