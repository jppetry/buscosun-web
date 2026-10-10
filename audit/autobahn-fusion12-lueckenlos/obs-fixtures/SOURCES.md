# obs/v1 — gesicherte Versionen aus der Git-Historie von `jppetry/buscosun-data` (10.10.2026)

Quelle je Datei: `https://raw.githubusercontent.com/jppetry/buscosun-data/<commit>/obs/v1/{latest,stations}.json`, unverändert;
abgelegt als `full/<commit7>.{latest,stations}.json.gz` (gzip der Originalbytes; `SHA256SUMS` nennt die Summe der
Originalbytes und der `.gz`). Die Historie des Daten-Repos wird von der Kartenlinie überschrieben — diese Kopien sind der Beleg.

| Commit | Commit-Zeit (UTC) | Fenster |
|---|---|---|
| `574ef48538fba9c0653ae39bb367080cdc0e17de` | 2026-10-10T10:21:30Z | good |
| `fa2ca00c956c0e561b1768863e75164c22a4703b` | 2026-10-10T10:40:46Z | bad |
| `00519d66676eaa7fc536128b672b13f3c65ded8f` | 2026-10-10T10:44:21Z | bad |
| `9aa64bf5f5a5e75ad19b3aeebb514823e05de2af` | 2026-10-10T10:46:20Z | bad (wind at the stamp, T older) |
| `13d3b5882958e008edb36b769d7d744cef0d3c87` | 2026-10-10T11:11:40Z | bad |
| `9f46fab07d19e42716da2f85f68ecf57ce16a443` | 2026-10-10T11:16:12Z | bad (wind at the stamp, T older) |
| `a5552f21e2bf60cbde691f83e3fe87a014876a27` | 2026-10-10T11:21:32Z | good |

CI-Auszug `scripts/lib/fixtures/obs-v1-vaf9.json`: alle Stationen im Umkreis von 60 km um München, Berlin, Hamburg, Frankfurt, Stuttgart, Dresden, Wien, Zürich
aus `00519d6` (schlechtes Fenster) und `574ef48` (gutes Fenster), dazu die Stationen mit `rr` in `older` — ausgeschnitten, kein Wert geändert.
