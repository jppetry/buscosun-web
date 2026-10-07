# Punktarchiv Schema 5 — Stationen und Stationsdichte

> Stand 07.10.2026 · Cowork-Sitzung. Gezählt am Slot `buscosun-archiv/2026-10-06/2323.json.gz` (Schema 5, 2 069 Punkte,
> 68,3 MB gz; zum Vergleich `2026-09-30/2322.json.gz`: 405 Punkte, 11,6 MB) und an den Punktlisten
> `scripts/punktarchiv/points.json` und `points-extra.json`. Nachrechnen: `node audit/fusion10-vorbereitung/stationsdichte.mjs`.

## Was das Archiv seit dem Slot vom 05.10.2026 sammelt

| Gruppe | Anzahl | Messwerte im Slot |
|---|---|---|
| Katalogpunkte (`role` fehlt) | 405 (DE 203, AT 84, CH 101, andere 17) | ja (DWD-Stationsmeldungen stündlich 220, TAWES 71, SMN 96, POI in AT/CH 18) |
| Eingabe-Punkte DWD CDC | 361 (293 mit Temperatur, 68 nur Wind) | nein — `truth.cdc` nennt die Kennung, Werte aus CDC nachladen |
| Eingabe-Punkte TAWES | 202 | ja (194 mit Temperatur am 06.10.) |
| Eingabe-Punkte SwissMetNet | 57 | ja (50 mit Temperatur am 06.10.) |
| Reine Niederschlagsstationen | 1 044 (903 DWD CDC, 141 MeteoSwiss `smnp`) | nein |

Cube t1/t2/t3 (mit 2×2-Block), Nowcast, Modellhöhen und Plan stehen an **allen 2 069 Punkten**; Live-Pfad und eigene
MOSMIX-Reihe nur an den Katalogpunkten (Eingabe-Punkte: MOSMIX nur als Verweis auf die nächste Katalogstation).
Stationen mit Temperatur: 405 → 957; mit Niederschlag: 405 → 2 001. Keine dieser Eingabe-Stationen war in einem Fit.

## Stationsdichte

Näherungsgitter 0,05° über bewohntem DACH (22 673 Punkte, Definition im Skript), Abstand zur nächsten Station:

| | nur Katalog | Katalog + Eingabe |
|---|---|---|
| Temperatur, Median | 16,4 km | 9,6 km |
| Temperatur, Anteil ≤ 10 km | 25 % (DE 20, AT 32, CH 55) | 53 % (DE 44, AT 82, CH 76) |
| Niederschlag, Median | 16,4 km | 6,7 km |
| Niederschlag, Anteil ≤ 10 km | 25 % | 85 % |

Katalogpunkt ohne eigene Station (Rolle-B-Lage), nächste andere Temperaturstation:

| | nur Katalog | Katalog + Eingabe |
|---|---|---|
| Abstand Median / p90 | 21,6 / 39,7 km | 13,8 / 27,5 km |
| \|Δh\| Median / p90 | 101 / 1 105 m | 75 / 997 m |
| ≤ 10 km und \|Δh\| ≤ 100 m | 6 % | 14 % |
| Schweiz: \|Δh\| Median | 565 m | 443 m |

Temperaturstationen ≥ 1 500 m: AT 11 → 27, CH 23 → 37, DE 1 → 1.

## Was das für ein besseres Fusion-Modell heißt (Hinweise, keine Vorgabe)

- **Echte Rolle-B-Prüfung:** ~550 Temperaturstationen, die nie im Fit waren. Ein Teil als feste, nie trainierte
  Prüfstationen reservieren, der Rest zum Lernen. Für diese Punkte liegt MOSMIX der nächsten Katalogstation bereits im
  Slot: das ist die faire Referenz für einen Ort ohne Station.
- **Gelände-Downscaling lernen:** Residuen (Messung − Cube) an ~950 Stationen gegen Höhe, TPI/Mulde, Hang, Exposition;
  in AT/CH erstmals genug Bergstationen.
- **Dichteres Ankernetz:** Beim Wind-Anker von Fusion 7 (e^(−(d/10 km)²)) steigt das Gewicht von ≈ 7 % bei 16 km auf
  ≈ 40 % bei 10 km. Für das Produkt bräuchte der Live-Pfad dann auch die Live-Messungen dieser Stationen.
- **Niederschlag:** ~2 000 Regenstationen ≈ Flächenwahrheit für Regen ja/nein.

## Grenzen

- Die Reihe beginnt am 05.10.2026 (Stand 07.10.: 2–3 Slots). Zum Fitten reicht das erst nach Wochen; ein Winter fehlt.
- Statistische Trennschärfe im Prüfstand hängt an Ausgabetagen, nicht an Stationen.
- Ein Slot je Tag um 23 UTC: 0–6 h ist immer Nacht (E-PA5-1: vier Slots je Tag „nicht machen“, Jan 05.10.).
- CDC-Messwerte der Eingabe-Punkte stehen nicht im Slot; W1 müsste sie für diese Kennungen nachladen.
- Ablage: ~68 MB je Slot ≈ 25 GB/Jahr; Entscheidung E-PA5-3 bis Ende November offen.
- Der Archiv-Cron klont `buscosun-web/main` täglich 23:10 UTC: Änderungen am Sammler wirken erst nach Jans Push.
