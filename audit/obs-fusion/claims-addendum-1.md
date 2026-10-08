# Nachtrag 1 zu den Behauptungen — Stationswert an der Messminute (eingefroren vor der Messung)

Anlass (Befund **V-OF-10**, 08.10.2026 ≈ 10:05 UTC, nach den Läufen R0/R1/D0, vor D1–D3): der Stationswert (Phase FS)
bildet seine Innovation nur, wenn der Stempel der jüngsten Messung GENAU auf einem Schritt des Stationsprodukts liegt
(`stationForecastAt` = `stationAt.get(atMs)`, Stundenraster). Im Replay mit Archiv-Messungen (Stundenstempel) feuert er
immer; mit 10-min-Stempeln (das Produkt `obs/v1` — und ebenso BrightSky im heutigen Browser; TAWES/SMN hatten gar keinen
Stempel) feuert er nur an jedem sechsten Stempel (DE) bzw. nie (AT/CH). Die Verschlechterung von Rolle A in R1/D0 gegen
R0 (t 0–6 h −16 %, AT 1 h −92 %) ist genau dieser Ausfall, kein Fehler des Messsatzes.

## Variante (neu, zusätzlich zu `claims.md` §1)

| Kürzel | Messungen | Motor-Optionen | Was es misst |
|---|---|---|---|
| **D0′** | `dense` | `obsDense: 1, stationValueAtObsTime: 1` | Stationswert-Innovation mit dem Stationsprodukt linear auf die Messminute interpoliert (zwei Schritte um die Messung, Lücke ≤ 3 h — dieselbe Form wie `anchorAtObsTime`, Fusion 9) |
| **D3′** | `dense` | D3 + `stationValueAtObsTime: 1` | das volle Bündel, falls D1/D2 bestehen |

## Behauptung

| # | Größe | Rolle | Fenster | Erwartung | Gilt, wenn |
|---|---|---|---|---|---|
| C9 | t, td | A (Punkt = Station) | 0–6 h | D0′ **deutlich besser** als D0 — die FS-Gewinne (T +13/+6 %, Td +18 %) kehren zurück | Skill ≥ +5 % bei t und td, 0–6 h, Rolle A, alle Länder |
| C10 | ws, gust | A | 0–6 h | besser oder gleich | Skill ≥ −1 % |
| C11 | alles | B | alle | unverändert bis auf die Nachbarstation am Punkt (≤ 15 km, Δh ≤ 100 m, selten) | |Skill| ≤ 0,5 % in jeder Kernzelle |
| C12 | precip, wet, clct | A/B | alle | byte-gleich | 0,00 % |

## Regel

`stationValueAtObsTime: 1` kommt in das Bündel von buscosun Fusion 12, wenn C9 gilt und keine Kernzelle (Rolle A oder B,
Größe × Fenster × Land) um mehr als 1,5 % verliert. Gilt C9 nicht, bleibt die Option gebaut und aus; der Befund V-OF-10
bleibt als Defekt des Browser-Pfads offen (E-OF-3).

Konstanten: Lücke ≤ `ANCHOR_BRACKET_MAX_H` (3 h, bestehende Setzung von V-AW-33); keine neue Zahl.
