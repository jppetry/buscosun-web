# Phase GS — GeoSphere `nwp-v1-1h-2500m` → `nwp-v2-1h-1km` im Live-Pfad und in der Karte

> Auftrag Jan 30.09.2026 (aus `audit/fusion-expertenbericht-2026-09-29.md` §3.4, E-EX-7). GeoSphere stellt
> `nwp-v1-1h-2500m` (AROME 2,5 km) am 04.11.2026 ein (Hinweis auf der Datensatzseite, 29.09. gelesen). Der Producer
> des Punkt-Cubes liest seit PD-B7 v2 (`scripts/point/adapters/geosphere.mjs`); offen waren der Live-Rückfallpfad
> von buscosun Fusion und die Kartenquelle der Rasterfusion.

## 1. Diagnose

### 1.1 Wer liest v1

| Stelle | Was | Folge nach dem 04.11. |
|---|---|---|
| `src/pointForecast/sampleSources.ts:427` `fetchAromePoint` | Punkt-Zeitreihe für den Live-Pfad (`?pf=live`, Rückfall des Panels bei Cube-Fehler), Anker-Historie, `PointForecastOverview`, Tour/Event über `getPointForecast` | AT/CH-Punkte im Live-Pfad ohne hochauflösendes Modell (nur MOSMIX-Nachbarn + Messung) |
| `src/sources/geosphereArome.ts:81` `fetchGeoSphereAromeGrid` | 12 × 7 Punkte als Gitter für die Rasterfusion der Karte (`loadFusedForecast.ts`, Katalogmodell `arome-at`, Vorgabe für AT/CH im Modell-Switcher) | Rasterfusion AT/CH fällt auf ICON-D2/MOSMIX zurück; das Katalogmodell `arome-at` ist tot |
| `src/point/sourceMatrix.ts:642` | Termin im Register | das Cron-Gate hält ab 03.11. 12 UTC an (Mechanik aus EX §3.1) |

Nicht betroffen: der Producer (v2), `nowcast-v1-15min-1km` (INCA; kein Hinweis auf der Seite), `ensemble-v1` (nirgends
gelesen).

### 1.2 Die beiden Datensätze, am 29./30.09. gemessen

| | v1 `nwp-v1-1h-2500m` | v2 `nwp-v2-1h-1km` |
|---|---|---|
| Modell | AROME-AT 2,5 km | C-LAEF AlpeAdria 1 km (Auflösung 0,0135° × 0,009°) |
| Läufe | 00/03/…/21 UTC, 61 Stunden | dieselben |
| BBox | 42,98–51,82 °N, 5,50–22,10 °E | 43,00–51,50 °N, 5,03–22,57 °E |
| Größen (Punktabfrage) | `t2m, u10m, v10m, ugust, vgust, rh2m, snowlmt, tcc (0…1), rr_acc (seit Laufbeginn), sp` | `2t, 10u, 10v, 10fg (Betrag), 2r, snowlmt, tcc (0…100 %), tp (Stundensumme, Stunde 0 leer), msl` |
| Punkt Innsbruck, Lauf 29.09. 15 UTC, erste Stunde | T 16,4 °C, Böe 2,4 m/s, RH 65,7 %, tcc 0 | T 20,1 °C, Böe 5,8 m/s, RH 49,2 %, tcc 0 % — eine andere Zelle (1 km) und ein anderes Modell |

Die Zeitachse ist gleich (Laufzeit + 0 … 60 h); die Semantik der Bewölkung und des Niederschlags nicht.
`tp` bei Stunde 0: die Grid-API liefert den Füllwert −1000 (im Producer gemessen, PD-B7); in der Punkt-API kommt an
derselben Stelle 0 oder null — beides wird als „kein Wert" gelesen, negativ ⇒ null.

### 1.3 Was die Umstellung ändert

- **Ein anderes Modell hinter der Kennung.** `arome_at` (Punkt-Tag), `arome` (Rasterquelle), `arome-at` (Katalog)
  und die Beschriftungen „GeoSphere AROME" an sieben Stellen sagen dann etwas Falsches. Der Punkt-Tag wird `claef`
  (derselbe Bezeichner wie im Producer, `sourceMatrix.ts`), mit eigenem Footprint 1 000 m; die Priors der Familie
  `highres` bleiben (die Fehler-σ des Motors sind je Familie gesetzt, nicht je Quelle). Die Katalog-Kennung
  `arome-at` bleibt als **URL-Schlüssel** (`modell=arome-at` in geteilten Links, gespeicherte Länderwahl, Parser der
  Edge Function) — sichtbar sind Name, Betreiberzeile, Auflösung und Beschreibung; E-GS-1.
- **Die Rasterfusion AT/CH rechnet auf 1 km** — am selben 12 × 7-Stützgitter der Karte (die Quelle liefert Punkte,
  kein Raster), also feinere Zellwerte an denselben Stützstellen. Bildvergleich vorher/nachher in §3.
- **Rule 2:** `?nwp=v1` (bzw. `localStorage.nwp = 'v1'`) liest bis zum 03.11. weiter v1 — gleicher Code, andere
  Zuordnungstabelle; Voreinstellung v2.

## 2. Bau

| Datei | Änderung |
|---|---|
| `src/sources/geosphereNwp.ts` (neu, pur) | Version (`geosphereNwpVersion`), Datensatz-Kennung, Parameterliste je Version, `readGeoSphereHour(params, h, version)` — EINE Zuordnung für beide Leser: T, u, v, Böe (v1 Betrag aus Komponenten, v2 `10fg`), RH, Schneefallgrenze, Bewölkung in % (v1 × 100), Stundensumme Niederschlag (v1 Differenz von `rr_acc`, v2 `tp`; Stunde 0 null, negativ null) |
| `src/pointForecast/sampleSources.ts` | `fetchAromePoint` benutzt die Zuordnung; Tag `claef` (v2) bzw. `arome_at` (v1); Fehlertext nennt den Datensatz |
| `src/sources/geosphereArome.ts` | `fetchGeoSphereAromeGrid` benutzt die Zuordnung |
| `src/pointForecast/fusion/priors.ts` | `FOOTPRINT_M.claef = 1_000` |
| `src/pointForecast/leadTimeWeights.ts` | `familyOf('claef') = 'highres'` |
| `src/pointForecast/pointForecast.ts` | `claef` in den Länder-Sets AT/CH und als `sourcesUsed` |
| `PointForecastOverview.tsx`, `countryProfiles.ts`, `ModelSwitcher.tsx`, `ModelLibraryOverlay.tsx`, `modelCatalog.ts`, `loadFusedForecast.ts`, SEO-Texte | Beschriftung „GeoSphere C-LAEF (1 km)" |
| `src/point/sourceMatrix.ts` | Termin 04.11. `resolved` mit Beleg |
| `scripts/verify-geosphere-nwp.mjs` (neu) | Zuordnung an echten Antworten beider Versionen (Fixtures vom 30.09.), Negativkontrollen, Live-Zeile gegen beide Datensätze; `npm run verify:geosphere-nwp`, in CI |
| `src/fusion/loadFusedForecast.ts` | das Badge der Rasterfusion nennt den Tag, den der Leser gesetzt hat (`claef` statt `arome`) |
| SEO-Generator (`scripts/seo/{audiences,content,explainers,methodik,glossary}.mjs`) | „AROME" als Modell für AT/CH → „C-LAEF"; Glossar erklärt den Wechsel; die falsche Zuschreibung „MeteoSwiss (AROME…)" berichtigt |

## 3. Belege (30.09.2026)

- `verify:geosphere-nwp` **26/26**: Zuordnung synthetisch (B1–B5, mit den Negativkontrollen „fehlende Größen ⇒ null"
  und „v2-Antwort mit v1-Tabelle ⇒ T/u/v/Böe/RH leer, Bewölkung ×100 falsch"), Fixtures beider Datensätze (2 Punkte ×
  55 Stunden, derselbe Lauf; T-Differenz v1 gegen v2 Median 0,20 K, max 3,30 K), Verdrahtung (Footprint, Familie,
  Tags, Beschriftungen, Register), live gegen beide Datensätze (drei Punkte; beim Lauf 03 UTC war v1 schon
  umgestellt, v2 noch bei 00 UTC — die Datensätze erscheinen Minuten versetzt, der Vergleich wird dann übersprungen).
- `npm run typecheck` 0 Fehler; `vite build` grün; Budget eagerJs 107,9 / 108, largestChunk 278,4 / 302, totalJs
  1 492,3 / 1 495 (Grenzen der Dashboard-Phase, unverändert) — kein neuer Chunk, die Zuordnung liegt bei den Lesern.
- `verify:model-source` 64/64, `verify:pv-fusion` 229/229, `verify:share` 528/528, `verify:routing` 231/231,
  `verify:point-data` 997/997 (Termin 04.11. jetzt „erledigt"), `verify:seo` 803 Prüfungen nach `generate-seo`,
  `verify:arome-fr` grün (Météo-France unberührt).
- **Browser (Chromium, Dev-Server):** Wetterkarte Temperatur, AT, `modell=arome-at`: mit `?nwp=v1` fragt die
  Rasterfusion `nwp-v1-1h-2500m` (`t2m,u10m,v10m,tcc,rr_acc`, 84 Stützpunkte, HTTP 200), ohne Schalter
  `nwp-v2-1h-1km` (`2t,10u,10v,tcc,tp`, HTTP 200). Badge „Modell · C-LAEF", Länderzeile „GeoSphere C-LAEF + INCA +
  TAWES". Screenshots `.playwright-mcp/gs-at-temp-v1.png` / `gs-at-temp-v2.png` (beide mit ICON-D2-Raster als
  Farbfläche, die Fusionspunkte darüber; im v1-Bild war das Raster noch nicht geladen — Ladezeitpunkt, kein
  Unterschied der Quelle).
- **Live-Pfad am Punkt** (Innsbruck, `getPointForecast({ country: 'AT', hours: 48 })` im Browser): `sourcesAvailable`
  = `tawes, mosmix, inca, claef`; Stunde +6 T 26,2 °C, Schneefallgrenze 3 491 m aus dem Modell; 48 Stunden; 6,9 s mit
  allen Quellen.

## 4. Entscheidungen und offene Punkte

| ID | Punkt | Stand |
|---|---|---|
| E-GS-1 | Katalog-Kennung `arome-at` bleibt als URL-Schlüssel (`modell=arome-at`, gespeicherte Länderwahl, Edge-Parser); sichtbar sind Name „C-LAEF", Auflösung 1 km, Beschreibung | umgesetzt, zur Bestätigung |
| E-GS-2 | Fehler-Priors der Familie `highres` unverändert für `claef` (gesetzt, wie zuvor für AROME); eine eigene σ braucht das Archiv | zur Kenntnis |
| E-GS-3 | Push von `buscosun-web/main` (Deploy) | Jans Gate |
| V-GS-1 | `?nwp=v1` ist nach dem 04.11. ein toter Schalter — entfernen, dann auch `arome_at` aus `NATIVE_POINT_SOURCES` und `FOOTPRINT_M` | offen, nach dem Stichtag |
| V-GS-2 | Rasterfusion: das v1-Stützgitter (12 × 7 Punkte, 1° Raster) nutzt die 1-km-Auflösung nicht — ein feineres Stützgitter kostet mehr Punkte je Anfrage (Grenze 10 Mio Datenpunkte, ≈ 5 req/s) | offen, eigene Messung |
| V-GS-3 | `nowcast-v1-15min-1km` (INCA) trägt dieselbe Versionsnummer; kein Abschalthinweis auf der Seite (30.09. gelesen) — beim nächsten GeoSphere-Newsletter prüfen | offen |
