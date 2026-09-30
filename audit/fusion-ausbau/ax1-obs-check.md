# AX-1 — Messung der Station am Punkt: vorher / nachher (`ax1-obs-check.mjs`, Live-Netz, 30.09.2026)

Der Abruf des Browsers (`fetchCubeObs`) an acht Stadtpunkten. „MOSMIX-Station am Punkt" = nächste Station des Katalogs
(`point/stations/catalog.json`, 3 071 Einträge). „Messung ≤ 5 km / 50 m" = die Reichweite der Stationswert-Tabelle
(`StackTable.range`), Höhe des Punkts ≈ Stationshöhe.

## Vorher (09:56 UTC, Stand HEAD)

| Punkt | MOSMIX-Station am Punkt (Katalog) | Messungen | Messung ≤ 5 km / 50 m? | die ersten sechs |
|---|---|---|---|---|
| München (DE) | 10865 MUENCHEN STADT 5.0 km / 515 m | 6 in 434 ms | **nein** | dwd_obs 29.3 km · dwd_obs 29.7 km · dwd_obs 30.8 km · dwd_obs 42.5 km · dwd_obs 48.4 km · dwd_obs 54.9 km |
| Hamburg (DE) | P0489 HAMBURG INNENSTADT 0.7 km / 8 m | 6 in 170 ms | **nein** | dwd_obs 21.0 km · dwd_obs 40.4 km · dwd_obs 49.1 km · dwd_obs 51.2 km · dwd_obs 51.6 km · dwd_obs 52.3 km |
| Berlin (DE) | 10389 BERLIN-ALEX. 1.0 km / 37 m | 6 in 210 ms | **nein** | dwd_obs 31.8 km · dwd_obs 38.8 km · dwd_obs 44.2 km · dwd_obs 49.9 km · dwd_obs 51.4 km · dwd_obs 59.5 km |
| Frankfurt (DE) | P0445 FRANKFURT-SACHSENH. 1.1 km / 100 m | 6 in 181 ms | **nein** | dwd_obs 14.7 km · dwd_obs 25.5 km · dwd_obs 28.0 km · dwd_obs 37.8 km · dwd_obs 38.2 km · dwd_obs 44.6 km |
| Stuttgart (DE) | Q358 STUTTGART NECKARTAL 2.9 km / 223 m | 6 in 191 ms | **nein** | dwd_obs 27.8 km · dwd_obs 38.6 km · dwd_obs 39.2 km · dwd_obs 40.7 km · dwd_obs 49.3 km · dwd_obs 53.5 km |
| Dresden (DE) | 10487 DRESDEN-STADT 0.7 km / 113 m | 6 in 184 ms | **nein** | dwd_obs 8.7 km · dwd_obs 33.1 km · dwd_obs 35.1 km · dwd_obs 35.4 km · dwd_obs 36.8 km · dwd_obs 52.8 km |
| Wien (AT) | 11034 WIEN/CITY 1.1 km / 171 m | 6 in 1161 ms | **nein** | tawes 13.7 km · tawes 14.1 km · tawes 20.5 km · tawes 29.1 km · tawes 31.5 km · tawes 36.1 km |
| Zürich (CH) | 06660 ZUERICH (TOWN/VILLE) 2.5 km / 556 m | 6 in 611 ms | **nein** | smn 6.6 km · smn 16.2 km · smn 16.4 km · smn 19.6 km · smn 21.0 km · smn 26.8 km |

**0 von 8.** Die „sechs nächsten Stationen" waren in keiner Stadt die nächsten: DE 8,7–31,8 km, Wien 13,7 km (Innere Stadt
1,3 km fehlte), Zürich 6,6 km (Fluntern 2,4 km fehlte).

## Nachher (10:10 UTC, mit `near` und Stations-Hinweis; ohne Hinweis dasselbe Bild)

| Punkt | MOSMIX-Station am Punkt (Katalog) | Messungen | Messung ≤ 5 km / 50 m? | die ersten sechs |
|---|---|---|---|---|
| München (DE) | 10865 MUENCHEN STADT 5.0 km / 515 m | 6 in 422 ms | **ja** — Muenchen-Stadt 3.8 km | Muenchen-Stadt 3.8 km [10865] · Muenchen-Flughafen 29.3 km [10870] · Holzkirchen 29.7 km [P856] · Weihenstephan-Duerna 30.8 km [10863] · Schweitenkirchen-Sue 42.5 km [P642] · Bichl 48.4 km [10970] |
| Hamburg (DE) | P0489 HAMBURG INNENSTADT 0.7 km / 8 m | 6 in 217 ms | **nein** | Hamburg-Fuhlsbuettel 9.3 km [10147] · Rosengarten-Klecken 21.0 km [E273] · Weddelbrook 40.4 km [A752] · Wendisch Evern 49.1 km [E298] · Boizenburg 49.4 km [10249] · Hasenkrug-Hardebek 51.2 km [A482] |
| Berlin (DE) | 10389 BERLIN-ALEX. 1.0 km / 37 m | 6 in 198 ms | **nein** | Berlin-Tempelhof 5.8 km [10384] · Trebbin-Thyrow 31.8 km [F545] · Heckelberg-Brunow 38.8 km [F361] · Schorfheide-Gross Sc 44.2 km [F265] · Zehdenick 49.9 km [F263] · Baruth 51.4 km [10376] |
| Frankfurt (DE) | P0445 FRANKFURT-SACHSENH. 1.1 km / 100 m | 6 in 262 ms | **ja** — Frankfurt/Main-Weste 2.0 km | Frankfurt/Main-Weste 2.0 km [L841] · Offenbach-Wetterpark 7.9 km [10641] · Frankfurt/Main 14.7 km [10637] · Darmstadt 25.5 km [L886] · Nauheim, Bad 28.0 km [L635] · Ober-Olm/Bellem 37.8 km [K579] |
| Stuttgart (DE) | Q358 STUTTGART NECKARTAL 2.9 km / 223 m | 6 in 247 ms | **nein** | Stuttgart (Schnarren 5.5 km [10739] · Metzingen 27.8 km [Q561] · Heilbronn/Neckar 38.6 km [Q243] · Pforzheim-Ispringen 39.2 km [Q332] · Obersulm-Willsbach 40.7 km [Q242] · Muensingen-Apfelstet 49.3 km [Q671] |
| Dresden (DE) | 10487 DRESDEN-STADT 0.7 km / 113 m | 6 in 164 ms | **nein** | Dresden-Hosterwitz 8.1 km [O458] · Dresden-Klotzsche 8.7 km [10488] · Rosenthal-Bielatal 33.1 km [O795] · Lichtenhain-Mittelnd 35.1 km [10591] · Zinnwald-Georgenfeld 35.4 km [10582] · Grossenhain-Strauch 36.8 km [O251] |
| Wien (AT) | 11034 WIEN/CITY 1.1 km / 171 m | 6 in 519 ms | **ja** — WIEN-INNERE STADT 1.3 km, WIEN/HOHE WARTE 4.4 km | WIEN-INNERE STADT 1.3 km [11034] · WIEN/HOHE WARTE 4.4 km [11035] · WIEN-DONAUFELD 6.9 km [11090] · WIEN JUBILAEUMSWARTE 7.9 km [11044] · WIEN/UNTERLAA 10.1 km [11040] · WIEN/MARIABRUNN 10.4 km [11080] |
| Zürich (CH) | 06660 ZUERICH (TOWN/VILLE) 2.5 km / 556 m | 6 in 141 ms | **ja** — SMA 2.4 km | SMA 2.4 km [SMA] · UEB 4.3 km [UEB] · REH 6.6 km [REH] · KLO 12.2 km [KLO] · PFA 16.2 km [PFA] · LAE 16.4 km [LAE] |

**4 von 8**, und in jeder Stadt sind die sechs jetzt die nächsten. Die vier verbliebenen sind strukturell, an der Quelle
geprüft (10:12 UTC):

| Punkt | Warum keine Messung am Punkt |
|---|---|
| Hamburg | P0489 ist ein MOSMIX-Interpolationspunkt ohne Messung; die nächste messende Station ist Fuhlsbüttel (9,3 km) |
| Berlin | 10389 Berlin-Alexanderplatz: BrightSky führt nur `observation_type: historical` bis 2011 (`/sources?dwd_station_id=00399`); `wmo_station_id=10389` ⇒ „No sources match" — die nächste messende Station ist Tempelhof (5,8 km) |
| Stuttgart | Q358 ist ein Interpolationspunkt; Schnarrenberg (10739) 5,5 km |
| Dresden | 10487 Dresden-Stadt: `wmo_station_id=10487` ⇒ „No sources match"; Hosterwitz (8,1 km), Klotzsche (8,7 km) |

Diese vier brauchen die σ des Stationsmembers je Abstand (V-FS-1, Kalender ≥ 30 Ausgabetage), nicht diesen Abruf.
SMN liest jetzt 12 statt 80 Dateien (611 → 141–206 ms), TAWES fragt die 60 nächsten statt der ersten 200 ab (1 161 → 459–519 ms).
