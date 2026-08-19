# audit/wetterwarnungen.md — Diagnose: amtliche Wetterwarnungen als 2D-Kartenlayer

> Phase **W1**, Auftrag Jan (2026-08-06): „aus dieser datenquelle:
> <https://opendata.dwd.de/weather/> wetter warnungen erstellen die auch als
> zusätzlicher layer in der 2D Karte einschalten kann."
> Diagnose-First (CLAUDE.md): kein Code vor diesem Dokument. Alle Zahlen unten
> sind an den echten Dateien vom **2026-08-06, 14:34 UTC** gemessen, nicht aus
> Dokumentation übernommen.

---

## 0. Vorbemerkung: dieser Layer ist ein Sonderfall

Alle bisherigen Layer dieser Reihe (Zellbahnen Z1, Hagel HA1, Gewitter F1,
Rotation F5) tragen den Satz „**kein amtliches Warnprodukt** — maßgeblich sind
die DWD-Warnungen". Dieser Layer **ist** dieses amtliche Warnprodukt. Damit
kehren sich zwei Regeln um:

- **D-19 (konservative Wortwahl)** verbietet bisher Warnsprache. Hier ist
  Warnsprache korrekt — aber **nur als Zitat**. Der Layer formuliert nichts
  selbst: `headline`, `description` und `instruction` werden **wortwörtlich**
  aus der amtlichen Meldung übernommen. Eigene Zusammenfassungen, Umformu-
  lierungen oder Verschärfungen sind ausgeschlossen.
- **D-04 (Ehrlichkeit)** wird strenger, nicht lockerer: Eine Warnung, die
  gezeigt und dabei falsch verortet, falsch datiert oder verkürzt wird, ist
  schädlicher als gar keine. Deshalb sind die Ehrlichkeits-Anforderungen in §7
  gate-blockierend.

Der Layer ersetzt außerdem **nichts**: `src/sources/dwdAlerts.ts` (BrightSky,
punktbezogen, im Punkt-Forecast) und `src/officialSources.ts` (Deep-Links
AT/CH) bleiben unverändert bestehen. Funktionserhalt.

---

## 1. Was unter `/weather/alerts/` wirklich liegt

```
/weather/alerts/
├── cap/     ← CAP 1.2, das Datenprodukt
├── txt/     ← Klartext-Bulletins (keine Geometrie) → für eine Karte unbrauchbar
└── content.log.bz2
```

`cap/` enthält 12 Verzeichnisse aus drei orthogonalen Achsen:

| Achse | Ausprägungen | Bedeutung |
|---|---|---|
| Gebietsschnitt | `DISTRICT` / `COMMUNEUNION` | Landkreis vs. Gemeindeverband |
| Warnart | `DWD` / `CELLS` / `EVENT` | amtliche Warnung / Zellwarnung / Ereignis |
| Stand | `STAT` / `DIFF` | Vollstand vs. Änderungsliste |

Je Verzeichnis liegen die Dateien in fünf Sprachen (`DE/EN/ES/FR/MUL`) und mit
einem stabilen `LATEST`-Alias.

---

## 2. Die Produktwahl — an der Geometrie entschieden

CAP kann ein Gebiet auf zwei Arten angeben: als `<polygon>` (echte Geometrie)
oder als `<geocode>` mit `WARNCELLID` (nur eine Kennziffer). Nur das Polygon
ist ohne fremdes Shapefile zeichenbar. Gemessen über die beiden Vollstände:

| Produkt | Meldungen | Gebiete | davon **mit Polygon** | Bytes |
|---|---|---|---|---|
| `DISTRICT_DWD_STAT` | 27 | 95 | **95 = 100 %** | 112 476 |
| `COMMUNEUNION_DWD_STAT` | 27 | 2029 | **67 = 3,3 %** | 104 068 |

Das ist eindeutig: Die **feinere** Variante ist für eine Karte die **schlechtere**
— sie zerlegt dieselbe Warnung in 2029 Gemeindeverbände und liefert für 1962
davon nur eine Nummer. Ohne den (nicht in diesem Repo vorhandenen) Warncell-
Datensatz wären 96,7 % der Fläche unzeichenbar.

**Entscheidung: `DISTRICT_DWD_STAT`, Sprache `DE`.** Landkreisgenau, vollständig
georeferenziert, ~110 KB.

Ebenfalls geprüft und verworfen:

- **`*_DIFF`** (real: `…_DIFFERENCE_…`, 146 Bytes = leer) — eine Änderungsliste
  verlangt clientseitige Zustandsführung über Sitzungen hinweg. Der Vollstand
  löst Aufhebungen implizit korrekt: Was nicht mehr in der Datei steht, ist
  weg. Weniger Code, keine Drift.
- **`CELLS` / `EVENT`** — andere Warnarten; `DWD` ist die amtliche
  Wetterwarnung, nach der Jan gefragt hat.
- **`txt/`** — keine Geometrie.

---

## 3. Der stabile Abrufweg (kein Directory-Scraping)

```
/weather/alerts/cap/DISTRICT_DWD_STAT/Z_CAP_C_EDZW_LATEST_PVW_STATUS_PREMIUMDWD_DISTRICT_DE.zip
```

**Belegt:** `LATEST` ist mit der neuesten zeitgestempelten Datei
(`…20260806143445…`) **byte-identisch** — gleiche SHA-1
`33722337900f93ba12f9c83c52a1a0cb3b479a8c`. Das ist der Unterschied zu
KONRAD3D (Z1), das ein Verzeichnis-Listing brauchte: hier genügt **eine feste
URL**, kein Scrape, kein Vorgänger-Fallback, keine Listing-Cache-Logik.

`Last-Modified` liefert die Publikationszeit der Datei. Das ist wichtig für
den **Leerfall**: „keine Warnungen" ist eine Aussage, die nur etwas wert ist,
wenn belegt ist, wie frisch die Datei ist (V-19).

**Transport:** `/_dwd_opendata/*` ist in `netlify.toml` (Z. 27–31) ein
**generischer** Rewrite auf `opendata.dwd.de` und in `vite.config.ts` (Z. 8–12)
als Dev-Proxy gespiegelt. Der Pfad `weather/alerts/…` fällt ohne jede Änderung
darunter. → **Keine Edge-Function-, Whitelist- oder Manifest-Änderung, damit
keine STOPP-&-FRAGEN-Zone berührt.** Der gehärtete `/_dwd_grib`-Proxy hat eine
Präfix-Whitelist (`dwd-grib.ts` Z. 32) und ist hier bewusst **nicht** der Weg.

---

## 4. Der Container: ZIP mit DEFLATE

Die CAP-Meldungen liegen einzeln als XML in einem ZIP (27 Einträge,
Methode 8 = DEFLATE). Das Repo hat **keine** ZIP-Bibliothek und soll (D-06)
auch keine bekommen.

Kein Problem, weil beides Web-Standard ist:

- **ZIP-Verzeichnis** — End-of-Central-Directory suchen, Einträge lesen: rund
  50 Zeilen, gleiche Klasse wie der bereits vorhandene handgeschriebene
  GRIB2-/RADOLAN-Leser.
- **DEFLATE** — `DecompressionStream('deflate-raw')`, in Browser **und**
  Node 22 (`.nvmrc`: 22.17.0) vorhanden; am Node dieses Rechners verifiziert.

Damit läuft **derselbe** Code im Browser und im netzfreien Verifier — keine
zweite Implementierung, die auseinanderlaufen kann (D-12).

---

## 5. Das Feldschema, an 27 echten Meldungen gemessen

```xml
<alert>
  <identifier>2.49.0.0.276.0.DWD.PVW.1786001640000.dbb327c5-….DEU</identifier>
  <sent>2026-08-06T09:34:00+02:00</sent>
  <status>Actual</status>            <!-- gemessen: 27× Actual -->
  <msgType>Alert|Update</msgType>    <!-- gemessen: 22× Alert, 5× Update -->
  <info>
    <category>Met|Health</category>
    <urgency>Immediate</urgency>  <severity>Minor|Moderate</severity>
    <certainty>Likely</certainty>
    <eventCode>II / GROUP / AREA_COLOR / LICENSE / PROFILE_VERSION</eventCode>
    <effective/> <onset/> <expires/>
    <senderName>Deutscher Wetterdienst | DWD / Seewetterdienst Hamburg |
                Zentrum für Medizin-Meteorologische Forschung</senderName>
    <headline>Amtliche WARNUNG vor HITZE</headline>
    <description>…</description> <instruction>…</instruction>
    <parameter>gusts | precipitation | hail | wind direction | …</parameter>
    <area>
      <areaDesc>Kreis und Stadt Regensburg</areaDesc>
      <polygon>49.22378,12.179562 49.184986,12.194969 …</polygon>
      <geocode>WARNCELLID</geocode>
      <altitude>0.0</altitude> <ceiling>1968.50394</ceiling>
    </area>
  </info>
</alert>
```

Fünf Befunde, die die Umsetzung bestimmen:

**5.1 Die amtliche Farbe liegt bei.** `AREA_COLOR` liefert je Meldung das
RGB-Tripel der DWD-Warnfarbe — gemessen `255 235 59` (gelb, `Minor`),
`251 140 0` (orange, `Moderate`), `204 153 255` (violett, Hitze). **Damit
erfindet buscosun keine Warnfarbe, sondern zeichnet die amtliche.**
⚠️ Abweichung zum Bestand: `src/sources/dwdAlerts.ts:146` `severityColor()`
nutzt `#ffcc00`/`#ff7f00` — Näherungen, die von den amtlichen Werten
abweichen. Der neue Layer nimmt **die Farbe aus der Datei**; `severityColor()`
bleibt unangetastet (Funktionserhalt), wird aber als V-Eintrag vermerkt.
Für `Severe`/`Extreme` lag heute **keine** Meldung vor — deren Farbwerte sind
folglich **nicht gemessen**; sie kommen nur als dokumentierter Fallback zum
Zug, falls `AREA_COLOR` je fehlt.

**5.2 Koordinaten sind `lat,lon` — GeoJSON will `lon,lat`.** Stichprobe
`49.22378,12.179562` = Regensburg. Vertauschen wäre ein Fehler, der die
Warnung irgendwo nach Zentralasien legt, ohne dass etwas „kaputt" aussieht →
eigener Verifier-Check gegen eine bekannte Ortslage.

**5.3 Höhenbänder sind in Fuß.** Gemessen: `ceiling` ∈ {1968.50394,
1312.33596, 9842.5197} → × 0,3048 = **exakt 600 m / 400 m / 3000 m**. 3000 m
ist der Standardwert („keine Höhenbeschränkung"), 600 m/400 m traten heute an
den **Hitzewarnungen** auf. Das ist ehrlichkeitsrelevant: Eine solche Warnung
gilt **nicht im ganzen** gezeichneten Landkreis, sondern nur unterhalb dieser
Höhe. Die Fläche kann das nicht zeigen — der Steckbrief muss es sagen.

**5.4 `expires` darf fehlen.** 18 von 27 hatten ein Ende, 9 nicht (durchweg
See-Warnungen des Seewetterdienstes). Fehlendes Ende = offen bis zur Aufhebung,
**nicht** „abgelaufen" und **nicht** „ewig gültig". Muss im Zeitfilter und im
Text getrennt behandelt werden.

**5.5 Warnungen überlappen — gemessen, nicht vermutet.** 27 Meldungen liegen
auf 90 Warnzellen; **5 Zellen tragen zwei Meldungen** (Kreis Ravensburg, Kreis
Traunstein, drei Küstenzellen in Schleswig-Holstein). Wie oft das *gleichzeitig*
gilt, ist die eigentliche Frage — und die Antwort ist knapper, als sie klingt:

- **Kreis Traunstein**, 14:12–15:00 UTC: zwei Gewitterwarnungen gleichzeitig.
  Das ist der einzige echte Gleichzeitigkeits-Fall in dieser Datei.
- Die drei Küstenzellen sind **Ablösungen**, keine Überlappungen: Sturmböen
  enden 19:00 UTC, Windböen beginnen 19:00 UTC. An dieser Naht darf **keine**
  Doppelung entstehen.

Beides ist im Verifier verankert. Für die Karte folgt daraus unverändert: Der
Klick muss **alle** Warnungen am Punkt zeigen, nicht die oberste — eine
verdeckte Warnung wäre ein Ehrlichkeitsdefekt, auch wenn der Fall selten ist.

*(Anmerkung zur Ehrlichkeit dieses Dokuments: Hier stand zunächst die Behauptung
„mehrere Warnungen je Landkreis, Hitze + Wind + Gewitter gleichzeitig". Der
Verifier hat sie widerlegt — zu den zuerst gewählten Prüfzeitpunkten gab es
**keine** gleichzeitige Überlappung. Die Zahlen oben sind die gemessenen.)*

---

## 6. Abdeckung: Deutschland — und das ist zu sagen, nicht zu kaschieren

Gemessene Bounding-Box aller Polygone: **6,200 … 14,271 °O / 47,394 …
55,058 °N**. Das ist Deutschland einschließlich der Nord- und Ostsee-Seegebiete
(`senderName` „DWD / Seewetterdienst Hamburg", 7 Meldungen).

Für **Österreich und die Schweiz enthält diese Quelle nichts**. Anders als bei
Zellbahnen/Hagel ist das keine ausdünnende Radarreichweite, sondern eine harte
Zuständigkeitsgrenze: Der DWD warnt nicht für fremdes Staatsgebiet. Eine leere
Karte über AT/CH sieht aber aus wie „keine Gefahr" — genau der Fehler, den
`src/officialSources.ts` bereits für den Punkt-Forecast löst.

**Konsequenz:** Der Layer nutzt das **vorhandene** Modul (`warningsSourceFor`,
`hasOwnWarnings`) und weist AT/CH mit Deep-Link auf GeoSphere Austria bzw. das
Naturgefahrenportal aus. Kein neues Mapping, keine Dopplung.

---

## 7. Was der Layer zeigt — und was er über sich sagt (gate-blockierend)

1. **Zitat statt Zusammenfassung.** `headline`/`description`/`instruction`
   erscheinen wortwörtlich. Keine Kürzung, die den Sinn verschiebt, keine
   eigene Bewertung, keine Verschärfung, keine Abschwächung.
2. **Amtliche Farbe.** Fläche und Umriss in `AREA_COLOR` aus der Meldung.
3. **Vollständigkeit am Klickpunkt.** Alle überlappenden Warnungen, nach
   Schwere sortiert. Keine wird verdeckt.
4. **Zeitliche Ehrlichkeit.** Der Layer folgt dem Zeit-Slider: gezeigt wird,
   was zur **eingestellten** Stunde gilt (`onset ≤ t < expires`). Ohne
   `expires`: „ohne festes Ende". Vorlaufende Warnungen (`onset` in der
   Zukunft) sind bei „jetzt" **nicht** aktiv und werden auch nicht so gezeigt.
5. **Höhenband ausweisen.** Bei `ceiling` < 3000 m steht im Steckbrief
   „gilt nur unterhalb 600 m" — sonst überzeichnet die Fläche die Warnung.
6. **Alter aus der Meldung.** Referenzzeit ist `sent` der jüngsten Meldung
   bzw. `Last-Modified` der Datei im Leerfall — nie die Abrufzeit (V-19).
7. **Der Leerfall ist eine Aussage.** „Keine amtlichen Warnungen für
   Deutschland — Stand HH:MM" statt einer stummen leeren Karte.
8. **Länder-Asymmetrie sichtbar.** AT/CH-Hinweis mit Deep-Link (§6).
9. **Kein Ersatz für die amtliche Quelle.** Fußzeile verweist auf
   `dwd.de/warnungen`; die Lizenzangabe aus dem `LICENSE`-`eventCode`
   („© GeoBasis-DE / BKG 2021 (Daten modifiziert)") wird mitgeführt.

---

## 8. Architektur (additiv, D-12-konform)

| Datei | Rolle | Netz? | DOM? |
|---|---|---|---|
| `src/warnings/capAlerts.ts` | **neu** — ZIP-Leser + CAP-1.2-Parser, reine Funktion `Uint8Array → CapAlert[]` | nein | nein |
| `src/warnings/warnField.ts` | **neu** — GeoJSON, Farben, Zeitfilter, Texte | nein | nein |
| `src/sources/dwdCapAlerts.ts` | **neu** — Fetch der LATEST-Datei, Kurzcache, Attribution | ja | nein |
| `src/MapView.tsx` | **additiv** — `LayerKey 'warnings'`, 3 Layer, Poll-Effekt, Popup, Legende | — | — |
| `src/components/LayerIcon.tsx` | **additiv** — Icon-Fall | — | — |
| `src/components/LayerInfoPanel.tsx` | **additiv** — Beschreibung + Skala | — | — |
| `scripts/verify-warnings.mjs` | **neu** — netzfreier Harness gegen die echten Module | nein | nein |

Unberührt bleiben: Shader/WebGL, Fusion-Engine, Edge Functions, Warm-Crons,
Manifeste, `dwdAlerts.ts`, `officialSources.ts`, jede bestehende Layer-Logik.

**Bandbreite:** ~110 KB je Abruf, 5-Minuten-Takt, **nur** solange der Layer
aktiv **und** der Tab sichtbar ist (Muster Z1/HA1). Inaktiver Layer = null Byte.

---

## 9. Verifikationsplan

| # | Prüfung | Beleg |
|---|---|---|
| 1 | ZIP-Leser findet alle Einträge, DEFLATE korrekt | Eintragszahl + XML-Wohlgeformtheit gegen Fixture |
| 2 | CAP-Parser liest alle Pflichtfelder | Feld-für-Feld gegen die eingefrorene Fixture |
| 3 | **Koordinatenreihenfolge** | Regensburg-Polygon muss in Bayern liegen, nicht in Kasachstan |
| 4 | Ringe geschlossen, GeoJSON-valide | 136/136 geschlossen (gemessen) |
| 5 | **Höhenband ft → m** | 1968.50394 ft ⇒ 600 m; **Rot-Test:** Umrechnung entfernt ⇒ muss rot werden |
| 6 | Zeitfilter | Warnung mit `onset` 21:00 ist um 15:00 **nicht** aktiv; ohne `expires` offen |
| 7 | Amtliche Farbe | `AREA_COLOR` „255 235 59" ⇒ `#ffeb3b`, kein Fallback |
| 8 | Überlappung | Punkt in mehreren Warnungen liefert **alle** |
| 9 | Leerfall | leeres ZIP ⇒ „keine Warnungen", kein Absturz |
| 10 | Netzdisziplin | 0 Requests vor Aktivierung; kein Abruf im Hintergrund-Tab |
| 11 | Desktop-Regression | Screenshot-Vergleich, Konsole sauber |

Zielgröße: ≥ 50 Checks, netzfrei lauffähig (`npm run verify:warnings`).
