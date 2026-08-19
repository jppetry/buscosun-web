# audit/zellbahnen.md — Diagnose: Zellenzugbahnen (E3) als 2D-Kartenlayer

> Stand: 2026-08-05. Phase **Z1** („Zellbahnen"). Auftraggeber: Jan — „aus
> `https://opendata.dwd.de/weather/` die Zellenzugbahn erstellen, die auch als zusätzlicher Layer in
> der 2D-Karte einschaltbar ist."
> Diagnose **vor** Code (CLAUDE.md §Harte Regeln). Alle Zahlen unten sind an diesem Tag **selbst
> gemessen**, nicht aus der Altdoku übernommen.

---

## 1. Was gebaut wird — und was es nicht ist

Ein **zusätzlicher, standardmäßig inaktiver** Layer `cells` („Zellbahnen") in der 2D-Karte:
Zellumriss + **amtliche** Prognosespur + **amtlicher** Unsicherheits-Trichter + Zell-Steckbrief
per Klick. Datenbasis ist **ausschließlich** das DWD-Objektprodukt **KONRAD3D**.

**Abgrenzung — bewusst nicht Teil dieser Phase:**

| Nicht enthalten | Warum |
|---|---|
| E2 „Niederschlagszuglinien" (Pfeilgitter aus dem Optical Flow der RV-Frames) | anderer Datenpfad (Feld statt Objekt), gehört zu L6 (`docs/zuglinien-radar-spec.md` §10) |
| Playback/Zeitleiste (L5) | eigene Phase; der Zell-Layer hängt **nicht** daran (§5.3 unten) |
| Mesozyklonen als eigener Layer | `polar_motion/speed` war in allen beobachteten Ereignissen `0.0`, kein Richtungsfeld ⇒ Detektion, kein Track (`docs/zuglinien-radar-spec.md` §1.4). Nur als Zeile im Zell-Steckbrief |
| Warnsprache jeder Art | amtliche Warnungen kommen aus L3/L4, nicht von hier (D-19) |

**Phasendisziplin — offen ausgesprochen:** `docs/zuglinien-radar-spec.md` §11.1 terminiert E3 auf
Phase **L11** (nach L10), `prompt.md` beauftragt als nächstes **L5 + L6**. Diese Phase zieht E3
vor. Das ist Jans Entscheidung und wird hier nur protokolliert, nicht umgedeutet. Die Vorbedingung
von L11 („F-3 geklärt") ist seit 2026-08-05 erfüllt, und E3 hängt **an keiner** Zusage aus L5/L6:
eigener Datenpfad, eigenes Rendering, eigene Statusanzeige. Der Vorzug ist damit technisch
kollisionsfrei — er verschiebt nur die Reihenfolge, nicht die Abhängigkeiten.
⚠️ Konsequenz für L5: Wenn dort das Zeitmodell kommt, muss `cells` in `layerTime.ts` als
`TimeMode = 'window'` (0…+60 min) nachgetragen werden — als Aufgabe in `improvements.md` vermerkt.

---

## 2. Beleglage — live gemessen am 2026-08-05 (ca. 20:45 UTC)

Verzeichnis `https://opendata.dwd.de/weather/radar/konrad3d/`:

| Messung | Wert | Bedeutung für die Umsetzung |
|---|---|---|
| Dateien im Listing | **576** (`KONRAD3D_20260803T204500` … `_20260805T204000`) | 48 h Retention, **5-Minuten**-Takt — bestätigt `docs/DATA_SOURCES.md` §4.1 B2 |
| `latest`-Alias | **existiert nicht** | Verzeichnis-Scrape ist Pflicht, Regex `KONRAD3D_(\d{8}T\d{6})\.xml`, jüngster Zeitstempel gewinnt |
| Jüngste Datei | `KONRAD3D_20260805T204000.xml`, HTTP 200, `text/xml`, **645 376 B** | ~0,63 MB je Abruf ⇒ **~7,6 MB/h** bei Dauer-Polling |
| `Last-Modified` | `20:44:54Z` bei Referenzzeit `20:40:00Z` | **Latenz 4 min 54 s** — deckt sich mit der 4:53 aus der Spec-Session |
| `Access-Control-Allow-Origin` | **fehlt** | Proxy Pflicht → `/_dwd_opendata/*` (existiert bereits: `netlify.toml:27-31` + `vite.config.ts:8-12`) |
| Inhalt der Probe | **38** `<feature>`, je **1** `<polygon>`, **456** `<centroid_forecast>` = **12 je Zelle** (+5…+60 min) | Umriss und Prognosespur sind vollständig, keine Interpolation nötig |
| `cell_speed` | 19,5 … 60,9 km/h | plausibel, Betrag in km/h |
| `hail_flag` | 0: 30 · 1: 8 | warnungsnahe Größe ⇒ D-19-Wortwahl |
| **Sentinel `-1000000000`** | **567 Vorkommen in einer Datei** | ungefiltert entstehen Trichter mit −1 Mrd. m. Derselbe Fehlertyp wie der −999,9-CIN-Fill aus Phase F1 |
| **`not-a-date-time`** | **117 Vorkommen** | Zeitstempel-Sentinel, gleiche Behandlung |

**Schema an der echten Datei nachgeprüft** (Auszug Zelle `identifier="12"`, ohne Vermutung):

```
geometry/centroid_3d/geodetic_coordinate/{latitude 47.00915, longitude 11.87933, height_msl 4930}
geometry/polygons_projected/geodetic_coordinates/polygon[@no=0]/{latitudes,longitudes}  (72 Punkte)
tracking/cell_speed = 19.489 km/h · tracking/number_detections = 9
forecast/centroid_forecasts/centroid_forecast[@forecast_time]/geodetic_coordinate/{latitude,longitude}
                              …/uncertainty_ellipse/{major_axis 2.322→…, minor_axis, angle}
intensity/{max_value 58.95 dBZ, severity_decimal 0.77, hail_flag 1, gust_flag 0,
           maximum_estimated_wind_gust 48.645 km/h, heavy_rain_potential 10.26 mm}
lightning/lightning_rate = 14 · mesocyclone/number_assigned_mesocyclones = 0
```

Damit ist die Spec-Tabelle `docs/zuglinien-radar-spec.md` §1.3 **unverändert gültig**; es gab keine
Schema-Abweichung gegenüber dem Stand der Spec-Session.

**Ein Befund, der die Doku präzisiert:** Die erste Zelle der Probe liegt bei **47,009 °N / 11,879 °E
— das ist Österreich** (Wipptal/Brenner), erkannt aus den Sweeps der deutschen Radare *Isen* und
*Memmingen*. `docs/zuglinien-radar-spec.md` §11.2 und `docs/DATA_SOURCES.md` §11 führen die
Abdeckung als **„DE only"**. Richtig ist: **die Reichweite des deutschen Radarverbunds**, die über
die Grenze nach AT/CH hineinreicht und dort mit der Entfernung ausdünnt. Der Unterschied ist für
die Ehrlichkeitsfläche relevant — ein Nutzer in Tirol sieht Zellen, aber keine garantierte
Abdeckung. Der Layer formuliert das entsprechend (§4) statt „nur Deutschland" zu behaupten.
→ Doku-Korrektur in `docs/DATA_SOURCES.md` §11 und `docs/zuglinien-radar-spec.md` §11.2.

---

## 3. Architektur — vier neue Dateien, `MapView.tsx` nur additiv

| Datei | Rolle | Reinheit |
|---|---|---|
| `src/radar/konrad3d.ts` | **DOM-freier** Pull-Parser (D-12/D-06, Vorbild `gribDecode`/`jsfive`): scannt `<feature>`-Blöcke, liest die ~25 gebrauchten Pfade blockskopiert; Sentinel → `null`. Typen `StormCellObject`, `CellForecastPoint` | rein, headless |
| `src/radar/cellPolygons.ts` | Zellen → GeoJSON: Umriss, **Pfadkegel aus den amtlichen Ellipsen**, Prognosespur, Zentroid; `etaMinutesToPoint` | rein, headless |
| `src/sources/dwdKonrad3d.ts` | Transport: Verzeichnis-Scrape + jüngste Datei über `/_dwd_opendata`, TTL-Cache 60 s (Muster `_runCache`, `radolan.ts:144-145`), `AbortController` | I/O |
| `scripts/verify-cells.mjs` | Verifier gegen ein **echtes** Fixture (Sentinel-Fall inklusive) | Node strip-types |

**Warum ein eigener Parser statt `DOMParser`:** D-12 verlangt headless-testbare Reinheit — ein
Node-Verifier ohne DOM muss dieselbe Funktion aufrufen können, die der Browser benutzt. Zusätzlich
ist der Pull-Parser bei 645 KB deutlich sparsamer als ein voller DOM-Baum (~38 × 17 KB Features,
von denen nur ~25 Felder gebraucht werden).

**Kein Abhängigkeits-Zuwachs, keine Edge-Function-Änderung, kein Warm-Cron.** Der Proxy
`/_dwd_opendata/*` existiert unverändert in `netlify.toml:27-31` und `vite.config.ts:8-12` —
er wird nur **benutzt**, nicht angefasst. Damit ist **kein** STOPP-&-FRAGEN-Auslöser aus
`CLAUDE.md` berührt (kein Shader/WebGL, keine Fusion, keine Löschung, kein Dependency-Upgrade,
keine Manifest-/Cron-Mechanik).

**Rendering (Z-Band wie `snowline`: über den Rastern, unter den Stationen):** eine GeoJSON-Quelle,
fünf native MapLibre-Layer, per `kind`-Property gefiltert —
`cone` (fill) · `hull` (fill) · `hull-line` (line) · `path` (line, gestrichelt) · `dot` (circle).
**Bewusst ohne `symbol`/`text-field`:** der Basemap-Stil der 2D-Karte liefert keine garantierten
Glyphen (Text wird heute nur in `RadarMap.tsx:173` mit eigenem Stil benutzt). Zell-Details kommen
per **Popup** auf Klick — dasselbe Muster wie die Stationen (`MapView.tsx:1370-1384`).

**Polling-Budget (STOPP-Punkt S-3 aus `prompt.md`, hier entschieden und begrenzt):** 0,63 MB je
5 min sind nur dann vertretbar, wenn nicht dauerhaft gepollt wird. Regel: **nur** wenn der Layer
aktiv **und** `document.visibilityState === 'visible'` ist; ein Abruf beim Aktivieren, danach alle
5 min; sofortiger Abbruch (`AbortController`) beim Deaktivieren. Inaktiver Layer = **0 Byte**
(wird im Gate per Netzwerk-Beleg nachgewiesen, Muster F1–F5).

---

## 4. Ehrlichkeitsfläche (D-04 / D-19) — gate-blockierend

1. **Messung vs. Prognose ist optisch getrennt:** Umriss = durchgezogen (beobachtet, Referenzzeit),
   Spur + Trichter = **gestrichelt** und transparenter (prognostiziert, +5…+60 min).
2. **Der Trichter ist amtlich, nicht geschätzt.** Er entsteht ausschließlich aus
   `uncertainty_ellipse` je Stützstelle — **keine eigene Aufweitungsformel**. Das steht so in der
   Legende, weil es der entscheidende Qualitätsunterschied zur Eigenberechnung ist.
3. **Wortwahl:** „Zelle", „Hinweis auf Hagel in der Zelle", „geschätzte Spitzenböe ~X km/h",
   „erreicht … in ~X min". **Nie** „Tornado", „Unwetterwarnung", „Gefahr", „trifft".
   Fester Hinweis in Legende und Steckbrief: **kein amtliches Warnprodukt, kein Warnersatz —
   maßgeblich sind die DWD-Warnungen.**
4. **Abdeckung:** „Reichweite des deutschen Radarverbunds — reicht über die Grenze, dünnt dort aus;
   für AT/CH gibt es kein gleichwertiges Objektprodukt." (statt des falschen „nur Deutschland").
5. **Zeithorizont:** Die Spur endet bei +60 min. Jenseits **+1 h Slider-Stunde ist der Layer aus**
   (wie `nowcast` jenseits des Radarhorizonts, D-14-Muster) — statt eine Zelle zu zeigen, die für
   die eingestellte Stunde nichts aussagt. Die Legende benennt das.
6. **Datenalter** steht im Status (Referenzzeit der Datei, nicht Abrufzeit — V-19).

---

## 5. Risiken und ihre Behandlung

| Risiko | Behandlung |
|---|---|
| **Sentinel-Werte** (567 je Datei) erzeugen Unsinns-Geometrie | zentral in `num()`/`isoMs()` des Parsers: `<= -1e9` bzw. `not-a-date-time` ⇒ `null`; Verifier prüft es mit echtem Fixture (Rot-Test) |
| **Kein Richtungsfeld** in KONRAD3D | Richtung aus `centroid_3d` → erstem `centroid_forecast` via `bearingDeg` (`src/radar/gridGeo.ts:30`), Betrag aus `cell_speed`. Fällt die Spur aus, entfällt die Richtungsangabe — sie wird nicht geraten |
| **645 KB je Abruf** auf Mobilfunk | Polling nur bei aktivem Layer + sichtbarem Tab (§3); Parser streamt über Indizes statt DOM |
| Verzeichnis-Listing ändert Format | Scrape ist reine Regex über Dateinamen, kein HTML-Parsing; schlägt sie fehl → `LayerFailure`-Text statt stiller Leere |
| Konvektionsfreier Tag ⇒ **0 Zellen** | ist **kein Fehler**, sondern der Normalfall im Winter/nachts. Eigener Leerzustand: „aktuell keine konvektiven Zellen im Radarverbund erkannt" (dieselbe Lehre wie F1/F3/F4: leer ≠ kaputt) |
| Slider steht > 1 h | Layer unsichtbar + Begründung in der Legende (§4.5) |

---

## 6. Verifikationsplan

- `npm run verify:cells` — Parser (Pfade, 12 Prognosepunkte, geschlossener Umriss),
  **Sentinel-Filter**, Kegel-Monotonie (Ellipsen wachsen), Bearing, ETA, GeoJSON-Wohlgeformtheit.
  **Rot-Test-Pflicht** (V-99/O-02): einmal absichtlich zum Scheitern gebracht, Beleg im Gate.
- `npm run typecheck` grün.
- Chrome DevTools MCP: Desktop 1440×900 + iPhone 12 Pro 390×844 DPR 3 — Layer an/aus, Popup,
  Legende, Touch-Targets ≥ 44 px, Konsole sauber.
- **Netzwerk-Beleg**: vor Aktivierung **0** `konrad3d`-Requests; nach Aktivierung Listing + genau
  **eine** XML.
- Die fünf Selbstverifikationsfragen schriftlich in `context.md`.

**Gate: GZ1 in `checklist.md`.**
