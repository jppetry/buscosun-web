# audit/datenalter-und-datenlage.md — Diagnose & Spec (Phase R2)

> Stand: 2026-08-01. Auftrag von Jan: das **Ehrlichkeits-Restpaket V-19 + V-20 + V-21** als ein Thema, ein Gate (**GR2**).
> Damit ist Initiative **I-1** (`masterplan.md` §4) bis auf V-22 vollständig — V-22 (toter `warnings`-Toggle) ist ausdrücklich **nicht** Teil dieser Phase (Jans Freigabe steht aus, formal Funktions-Entzug).
> Vorgänger: `audit/rechts-und-ehrlichkeits-paket.md` (Phase R1, V-17/V-18/V-23/V-01/V-02/V-101/V-102/V-103/V-105).

## 0. Umfang

| V | Kern | Aufwand laut Katalog |
|---|---|---|
| **V-19** | Datenalter statt Abrufzeit — die Karte zeigt die **Referenzzeit der Daten** (Modelllauf bzw. Messzeit), nicht den Moment des Abrufs | P0 · M |
| **V-20** | Staleness-Hinweis aus dem Warm-Manifest — sichtbar machen, wenn der Schnellzugriff nicht greift | P1 · S |
| **V-21** | Ground-Truth der Hit-Rate benennen — „Ist" ist ein **Modellkonsens**, keine Messung | P1 · S |

**Ausdrücklich außerhalb dieser Phase:** V-22 (Radar-`warnings`-Toggle, STOPP & FRAGEN) · V-03/V-79 (Cron-Health, Betriebsseite) · jede Änderung an Warm-Skripten, Manifest-Mechanik oder Edge Functions · Fusion-Engine · Shader/WebGL. Diese Phase fasst **keine** STOPP-Zone an.

## 1. Ist-Stand am Code (belegt, 2026-08-01)

### 1.1 V-19 — was die Statusanzeige heute behauptet

`updateStatus` (`src/MapView.tsx:694`) trägt die Nutzlast `{ model, fetchedAt, captured? }`; der State liegt in `:432`. Gerendert wird sie an **drei** Stellen:

| Stelle | Kontext |
|---|---|
| `MapView.tsx:3034` | `.data-badge` (eingebettete/kompakte Kartenansicht) |
| `MapView.tsx:3100` | `layerRowDeck` — Sublabel je Layer-Zeile im Dock/Mobil-Layer-Screen |
| `MapView.tsx:3425` | `.mdk-status-chip` — die Statuspille des Command-Decks |

Alle drei formatieren über denselben Helfer `fmtTime` (`:2819`) und zeigen **`fetchedAt` als Uhrzeit**.

**Zählung der `ok`-Aufrufe (nachgezählt, nicht aus dem Katalog übernommen):** 21 Aufrufe setzen einen `ok`-Status. Davon setzen **19** `fetchedAt` auf einen Abruf- bzw. Rechenzeitpunkt:

`:1169` (temp/Fusion, `r.fetchedAt` — in `fusionEngine.ts:221` ebenfalls `Date.now()`) · `:1269` (sat, sofort) · `:1331` (stations, `data.fetchedAt` — in `dachStations.ts:196` ebenfalls `Date.now()`) · `:1452` (nowcast) · `:1496` (clouds) · `:1564` (wind) · `:1602` (temp) · `:1629` (gust) · `:1648` (thunder) · `:1667` (lightningfc) · `:1692` (snow) · `:1712` (rotation) · `:1748` (lightning, sofort) · `:2033` + `:2050` (confidence) · `:2133` (snowline) · `:2157` (flownowcast) · `:2190` (poprob) · `:2387` + `:2409` (wind surface/EU) · `:2751` (sat, Produktwechsel).

Nur **2** tragen eine echte Referenzzeit: `:1272` (Satellit, WMS-`TIME`) und `:1751` (Blitze, WMS-`TIME`) — beide mit `captured: true`.

> **Korrektur am Katalog:** V-19 nennt „15 von 17" und die Zeilen `1496,1564,…,2751`. Der Code ist seither gewachsen; korrekt sind heute **19 von 21**. Die Aussage des Eintrags bleibt inhaltlich unverändert richtig, die Zahlen werden hier präzisiert.

**Die Referenzzeit liegt in jedem einzelnen Fall bereits vor und wird verworfen.** Belegt an den Rückgabetypen:

| Layer | Ref-Zeit vorhanden in | Art |
|---|---|---|
| wind (surface) | `wind/iconD2WindSource.ts:118` `IconD2Wind.runAt` | Modelllauf |
| wind (Druckfläche) | `wind/iconEuPressureWind.ts:133` `runAt` | Modelllauf |
| temp | `sources/iconD2TempSource.ts:59` `runAt` | Modelllauf |
| gust | `sources/iconD2GustSource.ts:42` `runAt` | Modelllauf |
| clouds | `sources/iconD2Clouds.ts:60` `runAt` | Modelllauf |
| thunder | `sources/iconD2Thunder.ts:55` `runAt` | Modelllauf |
| lightningfc | `sources/iconD2Lpi.ts:65` `runAt` | Modelllauf |
| snow | `sources/iconD2Snow.ts:66` `runAt` | Modelllauf |
| rotation | `sources/iconD2Rotation.ts:63` `runAt` | Modelllauf |
| nowcast DE | `sources/radolan.ts:137` `RvNowcast.runAt` | Messung |
| nowcast CH | `sources/meteoSwissRadar.ts:37` `RadarFrame.validAt` (aus ODIM `/what`) | Messung |
| snowline | abgeleitet aus `iconD2TempRef.current.runAt` | Modelllauf |
| flownowcast, poprob | abgeleitet aus `nowcastRef.current.runAt` (`MapView.tsx:2147` nutzt ihn bereits als Cache-Key!) | Messung |

Die Kette, aus der die Zeit stammt, ist intakt: `gribManifest.ts:110` liefert `runAt` → `iconD2Precip.ts:119` reicht sie in `RunInfo` → jede Quelle gibt sie im Ergebnis zurück. Sie wird ausschließlich **an der Anzeige** weggeworfen.

**Zwei Quellen ohne Referenzzeit — und das bleibt so:**
- **AT INCA** (`sources/geosphereIncaGrid.ts:47-50`): `IncaGrid` führt nur `frames` + `corners`; die netCDF-Antwort wird auf `leadtime` reduziert, eine Lauf-/Analysezeit wird nicht geparst. (Dasselbe Loch, das V-33 für die Radar-Timeline beschreibt.)
- **confidence** (Klima-MOS): die Stationsklimatologie ist ein statisches Bundle-Asset ohne Lauf; ein „Datenalter" wäre hier eine Erfindung.

Für beide gilt die Konsequenz aus D-04: **kein Alter behaupten**, sondern die Abrufzeit als solche beschriften.

### 1.2 V-20 — was das Manifest weiß und nicht sagt

`sources/gribManifest.ts:60` liest `{run, runAt, params}` aus `latest-grib.json` und **parst `updatedAt` nicht einmal** — obwohl der Warm-Cron es schreibt und der Modulkopf (`:8`) es als Teil des Schemas führt. `resolveRunFromManifest` (`:110`) reicht `{runStr, runAt, steps}` an den Aufrufer; an die UI geht **nichts**.

Fällt das Manifest unter den 24-h-Staleness-Guard (`:33`, `:68`) oder ist es nicht erreichbar (`:59`, `:80`), läuft alles still auf den Directory-Scan (`iconD2Precip.ts:136-157`). Für Nutzer äußert sich das ausschließlich als plötzliche Ladezeit, für Jan als gar nichts.

Dasselbe gilt für den **zweiten**, parallelen Resolver des Wind-Layers: `wind/iconD2WindSource.ts:83-105` (Phase T1, bewusst nicht mit T2 zusammengelegt). Er verwirft `updatedAt` ebenso.

Wichtige Unterscheidung, die die Umsetzung treffen muss: `resolveRunFromManifest` gibt auch dann `null` zurück, wenn das Manifest **gesund** ist, den angefragten Param aber nicht führt (`:108-109` — z. B. `cape_ml`, `uh_max`, `h_snow`; genau die von V-80 beschriebene Lücke). Das ist **kein** Manifest-Defekt und darf keinen Hinweis auslösen.

### 1.3 V-21 — was der Rückblick zeigt und nicht sagt

`confidence/hitRate.ts:44-45` definiert `consensusActual` als „Mittel der Modell-Analysen … = Ground Truth"; der Modulkopf (`:8-10`) benennt das korrekt als „quellenunabhängige, faire Referenz".

In der UI steht davon nichts: `HitRatePanel.tsx:35` („wie nah lagen die Vorhersagen am echten Wetter?"), `:44` („Abgleich gegen das tatsächlich eingetretene Wetter") und `:50` („Quellen nach Treffsicherheit") behaupten durchweg eine Messung. Der einzige Ort, an dem der Begriff überhaupt vorkommt, ist die Chart-Legende (`:165`, „tatsächlich (Analyse-Konsens)") — dort aber ohne jede Erklärung, was das bedeutet.

**Warum das materiell ist:** Ein Modell gegen den Mittelwert aller Modell-Analysen zu prüfen fällt systematisch **milder** aus als gegen Stationsmessungen — und für ein Modell, das selbst in den Konsens eingeht, zusätzlich **wohlwollend**. Die Reihung bleibt brauchbar (alle Quellen werden gleich behandelt), die absolute Zahl ist keine Trefferquote gegen die Wirklichkeit.

## 2. Spec — was gebaut wird

### 2.1 Neues pures Modul `src/dataAge.ts` (D-12)

Alle Regeln für Referenzzeit, Alter und Schwellen wandern hinter die Purity-Grenze: kein DOM, kein React, kein Fetch → headless importierbar und verifizierbar (das ist zugleich Schnitt (1) aus V-96, ohne dessen Umfang zu öffnen).

```
export type DataRefKind = 'run' | 'measured'
export interface DataRef { atMs: number; kind: DataRefKind }
export const STALE_RUN_H = 9          // V-19: ab hier ruhiger Hinweis
export const MANIFEST_STALE_H = 6     // V-20: ab hier „Schnellzugriff nicht aktuell"
runLabel(atMs)      → '12z'                     (ICON-D2-Konvention, UTC)
ageText(ms)         → 'gerade eben' | 'vor 25 min' | 'vor 3 h' | 'vor 1 T 4 h'
dataAgeText(ref|null, fetchedAt, now) → 'Lauf 12z · vor 3 h' | 'Stand 14:35 · vor 10 min' | 'abgerufen 14:41'
isStale(ref, now)   → boolean (nur mit Referenzzeit; ohne → false, es wird nichts behauptet)
verifyDataAge()     → Selbsttest (V-95-Muster)
```

Der dritte Fall — **`abgerufen HH:MM`** — ist der ehrliche Ersatz für die heutige Anzeige: er sagt, dass dies der Abrufzeitpunkt ist, statt ihn als Datenstand auszugeben. Er greift für INCA-only-Komposite und die Klima-Schleier.

### 2.2 `updateStatus` bekommt `ref`

```
ok: { model, fetchedAt, ref?: DataRef, captured?: boolean }
```

`fetchedAt` bleibt **unverändert erhalten** (Funktionserhalt; es ist der Fallback für Quellen ohne Referenzzeit). `captured` bleibt als Feld erhalten, wird aber von `ref.kind==='measured'` abgelöst und an den beiden WMS-Stellen entsprechend gesetzt.

Alle 21 `ok`-Aufrufe werden versorgt. Zusammengesetzte Quellen (`nowcast`) nehmen die **älteste** bekannte Referenzzeit der beitragenden Landesradare (konservativ: das Komposit ist so alt wie sein ältester Teil). Trägt keine bei (nur AT), wird keine Referenz gesetzt → `abgerufen HH:MM`.

### 2.3 Anzeige

Alle drei Renderstellen nutzen **einen** Formatierer, damit sie nicht wieder auseinanderlaufen. Ab `STALE_RUN_H` bekommt der Eintrag ein ruhiges `⚠`-Präfix und eine CSS-Klasse `is-stale` (Sand/Ochre, keine Fehlerfarbe — der Layer funktioniert ja).

### 2.4 Manifest-Gesundheit (V-20)

Neues pures Modul `src/sources/manifestHealth.ts`: winzige Registry `report(url, state, updatedAt)` / `get()` / `subscribe(fn)`, `state ∈ 'fresh'|'stale'|'absent'|'unknown'`, `get()` liefert den **schlechtesten** Zustand über alle gemeldeten Manifeste (GRIB **und** Wind).

- `gribManifest.ts`: `updatedAt` parsen, in `ManifestRun` mitgeben, Zustand melden — gemeldet wird der Zustand des **Manifests**, nicht des Param-Treffers (s. §1.2).
- `iconD2WindSource.ts`: dieselbe Meldung, vier Zeilen, ohne Änderung an der Auflösungslogik.
- Anzeige in der Statuspille, eine dezente Zeile:
  - `absent` → „Schnellzugriff nicht aktuell — Daten kommen direkt von der Quelle."
  - `stale` → „Schnellzugriff zuletzt vor X h aufgefrischt."

> **Bewusste Abweichung vom Katalogtext:** V-20 schlägt für **beide** Fälle denselben Satz vor. Bei `stale` wäre er falsch — die Daten kommen dann sehr wohl aus dem Schnellzugriff, nur aus einem älteren Lauf. Zwei Sätze statt einem, aus demselben Ehrlichkeitsgrund, aus dem der Eintrag überhaupt existiert.

### 2.5 V-21

Ein Satz im Kopf von `HitRatePanel` (Klasse `fc-hit-note` existiert bereits, `:76`) und eine Präzisierung der Ranking-Überschrift. Kein neues CSS, keine Logikänderung an `hitRate.ts`/`hitRateModel.ts`.

### 2.6 Verifier `npm run verify:datenalter`

Netzfrei, importiert die **echten** Module (kein Nachbau — V-94-Lehre): `src/dataAge.ts` + `src/sources/manifestHealth.ts`. Prüft Formate, Schwellen (8,9 h ok / 9,1 h stale), die „keine Referenz ⇒ keine Behauptung"-Regel, die Worst-of-Aggregation und den Param-Miss-Fall aus §1.2. Zusätzlich eine **Quell-Sonde** über `MapView.tsx`: kein `ok:`-Aufruf darf `fetchedAt: Date.now()` ohne `ref` tragen — das ist der Rückfall-Schutz, den V-19 verlangt („danach ein Verifier, der `Date.now()` als Datenalter verbietet").

## 3. Funktionserhalt — was sich **nicht** ändert

- Kein Layer, kein Toggle, kein Modell, keine Legende wird entfernt, versteckt oder umsortiert.
- `fetchedAt` bleibt im Status-Objekt; kein Aufrufer verliert Information.
- Keine Änderung an Lade-Reihenfolge, Caches, Fetch-Pfaden, Manifest-**Mechanik**, Warm-Crons, Edge Functions.
- `resolveRunFromManifest` behält Signatur und Rückgabesemantik (`ManifestRun` wird additiv um ein optionales Feld erweitert).
- Der Directory-Scan-Fallback bleibt unangetastet — V-20 macht ihn nur sichtbar.

## 4. Risiken

| # | Risiko | Gegenmaßnahme |
|---|---|---|
| R-a | Ein Layer zeigt plötzlich „vor 8 h" und wirkt kaputt, obwohl das ein **normaler** ICON-D2-Lauf am Ende seines Zyklus ist | Schwelle bei 9 h (Lauf-Rhythmus 3 h + Publikationslag ~3,5–6,5 h ⇒ ein gesunder Lauf ist nie älter als ~9 h); Hinweis ist ruhig, nicht rot |
| R-b | Die Statuspille wird länger und bricht das Deck-Layout | Formate bewusst kurz („Lauf 12z · vor 3 h" ist kürzer als der heutige Modellname); Desktop- und Mobil-Sichtprüfung im Gate |
| R-c | Manifest-Health meldet `absent` in Dev (kein Warm-Lauf lokal) und erschreckt | Genau das ist die gewünschte Aussage; in Dev ist sie korrekt |
| R-d | Zwei Manifeste, ein Zustand → falsche Verallgemeinerung | `get()` liefert worst-of **und** die Herkunft; die Anzeige behauptet nichts über einzelne Layer |

## 5. Gate GR2 — Belege

Siehe `checklist.md` §Phase R2. Die fünf Selbstverifikations-Fragen werden in §6 dieses Dokuments beantwortet.

## 6. Selbstverifikation (Gate GR2, 2026-08-01)

Dev-Server `:5201`, Playwright-MCP (der Chrome-DevTools-MCP-Browser war durch die parallele KD-R-Session belegt — s. §8).

**1 · Funktionserhalt, jede Funktion einzeln.** Kein Layer, Toggle, Modell, Slider, Sheet oder Legendenblock entfällt. Belegt an der Karte mit sechs aktiven Layern (`screenshots/datenalter/desktop-karte.png`): Niederschlag, Gewitter, Wind, Temperatur, Satellit + Stationen-Zeile, Modell-Pille „Native", Wind-Dichte/Höhe-Deck, Zeit-Deck, Legenden — alles unverändert bedienbar. Am Status-Objekt ging nichts verloren: `fetchedAt` bleibt in jedem der 24 `ok`-Aufrufe erhalten, `ref` kommt additiv dazu. Das einzige entfernte Element ist das interne Feld `captured`, dessen Bedeutung vollständig in `ref.kind === 'measured'` aufgeht (identische Ausgabe „Stand HH:MM"); der Typecheck erzwingt, dass keine Stelle übersehen wurde. Der lokale Helfer `fmtTime` entfiel, weil alle drei Aufrufer auf `statusStamp` umgestellt sind.

**2 · Desktop.** **Nicht** pixelgleich — und zwar genau an der einen Stelle, die diese Phase ändert: die Statusflächen zeigen jetzt Referenzzeit statt Abrufzeit, und die Manifest-Zeile ist neu. Alles andere ist unverändert; die Statuspille bleibt in ihren Maßen (`max-width: 300px`), die längeren Zeilen brechen nicht aus, die Zeile mit sechs Layern passt (Screenshot oben). Kein Layout-Shift an Deck, Rail, Dock, Sheet oder Readout-Spalte.

**3 · Touch-Targets ≥ 44 px.** Nicht berührt: die Phase fügt **kein** interaktives Element hinzu. Statuspille und Manifest-Zeile sind reiner Text (`role="status"`), der Mobil-Hinweis ein `<p>`.

**4 · Konsole.** Sauber: **0 Errors, 0 Warnings** über die gesamte Sitzung (Playwright-Konsolenprotokoll, Desktop + Mobil + Vorhersage-Seite).

**5 · Long Tasks > 200 ms.** Kein neuer Rechenpfad. Pro Statusfläche ein `dataAgeText`-Aufruf (String-Bau, kein Layout-Thrash); die Manifest-Zeile ist ein `useMemo` über zwei Werte; die Health-Registry ist eine `Map` mit ≤ 2 Einträgen und benachrichtigt **nur bei echter Zustandsänderung** (per Selbsttest belegt: unveränderte Meldung löst keinen Re-Render aus). Das Alter aktualisiert sich am bereits vorhandenen 30-s-`clockMs`-Tick mit — **kein** neuer Timer. Kein Trace aufgenommen, weil keine Änderung im Renderpfad der Karte liegt; das wäre eine Behauptung ohne Anlass.

## 7. Belege

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` | grün (17,9 s; die Impressum-Warnung ist der bekannte offene V-103-Punkt, nicht aus dieser Phase) |
| `npm run verify:datenalter` | **54/54** |
| **Red-Test** (V-99-Prinzip) | `STALE_RUN_H` 9 → 24 ⇒ Exit **1**; Rückbau ⇒ Exit **0**; Datei wiederhergestellt |

**Screenshots** (`audit/screenshots/datenalter/`):

| Datei | Zeigt |
|---|---|
| `desktop-statuspille.png` | Ein Layer: „Wind · DWD ICON-D2 U/V 10M · 2,2 KM · **Lauf 09z · vor 3 h**" + Manifest-Zeile |
| `desktop-karte.png` | Sechs Layer, alle drei Formate nebeneinander (s. u.) |
| `desktop-stale-erzwungen.png` | Stale-Optik: `⚠`-Präfix, Klasse `is-stale`, Tooltip „Dieser Datensatz ist ungewöhnlich alt (vor 3 h)." |
| `mobil-layer-detail.png` | Datenalter in den Layer-Sublabels (390×844, Detail-Modus) |
| `mobil-manifest-hinweis.png` | Manifest-Hinweis auf Mobil (dort ist die Statuspille per CSS ausgeblendet) |
| `desktop-hitrate-groundtruth.png` | V-21: Ground-Truth-Block zwischen Lead und Reihung |

Gemessener Zustand der Statuspille (Playwright-DOM-Auslesung, 2026-08-01 14:31):

```
Deutschland · DWD ICON-D2 / MOSMIX + Live + RADOLAN-RV
Wind         · DWD ICON-D2 U/V 10M · 2,2 KM               · Lauf 09z · vor 3 h      ← Modelllauf
Niederschlag · DACH-KOMPOSIT · DE RADOLAN · AT INCA · CH RZC · Stand 14:25 · vor 6 min ← Messung
Temperatur   · DWD ICON-D2 T_2M · 2,2 KM                  · Lauf 09z · vor 3 h
Satellit     · METEOSAT EUROPA (RGB TAG / IR NACHT)       · Stand 14:00 · vor 31 min ← echte WMS-Capture-Zeit
Gewitter     · DWD ICON-D2 CAPE_ML·CIN_ML·LPI · 2,2 KM    · Lauf 09z · vor 3 h
Schnellzugriff nicht aktuell — Daten kommen direkt von der Quelle.
```

**Das Manifest-Signal war sofort wahr:** beide lokalen Manifeste tragen den Lauf `2026072921` — zum Prüfzeitpunkt **63,5 h alt**, also weit jenseits des 24-h-Staleness-Guards ⇒ korrekt als `absent` gemeldet, die Layer lösen per Directory-Scan auf (daher der frische `09z`-Lauf trotz uraltem Manifest). Genau dieser Zustand war bisher unsichtbar.

> ⚠ **Keine Betriebsaussage:** Das ist der Stand des Arbeitsbaums, **nicht** der Produktion (Masterplan-Risiko R3, die A3-Fehldiagnose). Ob die Warm-Crons live advancen, kann nur die GitHub-API beantworten — hier steht ausschließlich, dass dieser Klon seit dem 29.07. keinen Manifest-Advance gesehen hat.

## 8. Zwischenfall: Sperrzonen-Kollision in `MapView.tsx`

Während der Umsetzung hat eine **parallele Session** dieselbe Datei bearbeitet (Phase KD-R, `audit/karten-readout.md`, `src/components/LayerInfoPanel.tsx`; Schreibvorgänge um 13:19, 13:21, 13:23:58, 13:24:46). Der Typecheck war nach dieser Phase zunächst grün und wurde dann durch die fremde, unfertige Arbeit rot (`Cannot find name 'showLayerInfo'` — oben entfernt, in zwei JSX-Handlern noch aufgerufen). Diese Phase hat die Stelle **nicht** angefasst; die Arbeit wurde bis zur Freigabe angehalten (Jan, 2026-08-01) und danach unverändert fortgesetzt.

Das ist Risiko **R8** aus `masterplan.md` und ein Verstoß gegen `agents.md` §3 (`MapView.tsx` nie parallel). Zusammengeführt funktionieren beide Arbeiten: die Readout-Spalte der KD-R-Phase liest `statuses` nicht, es gibt also **keine** vierte Statusfläche, die den gemeinsamen Formatierer umgeht — der Verifier prüft genau das dauerhaft mit.

## 9. Was diese Phase bewusst offen lässt

- **V-22** (toter `warnings`-Toggle im Radar) — Jans Freigabe steht aus, formal Funktions-Entzug.
- **AT-INCA ohne Referenzzeit** — `geosphereIncaGrid.ts` parst keine Analysezeit. Das Komposit weist deshalb die Zeit der übrigen Landesradare aus; ist AT die einzige Quelle, wird ehrlich „abgerufen HH:MM" gezeigt. Behebung gehört zu **V-33** (dort steht dasselbe Loch für die Radar-Timeline).
- **Fusions-Temperatur, Stationsnetz, Klima-Schleier** tragen dauerhaft keine Referenzzeit — begründet im Code und vom Verifier eingefordert.
- **Wind-Manifest-`updatedAt`** wird gemeldet, aber der Wind-Resolver gibt es (anders als `gribManifest`) nicht an seinen Aufrufer zurück — dafür gibt es keinen Bedarf, die Anzeige hängt an der Health-Registry.
