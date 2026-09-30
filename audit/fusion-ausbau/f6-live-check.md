# f6-live-check — „buscosun Fusion 6" gegen den echten Cube und die echten Tabellen am CDN

Stand 2026-09-30T18:28Z. Store = https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main.

## Tabellen, wie der Client sie lädt

- fusion.client.json: fusionFit@3, 70 Mittel-Einträge, **16 Atome** (16 geschrieben)
- stack.client.json: stack@1, 701 Einträge — Landeseinträge T 162, Wind 162, Böe 157, **Td 0** (V-AX-15: 0 erwartet)

## Punkte

### HELGOLAND (DE, 4 m) — OK

- Stufe: 7 von 7 Zeilen in calib
- Stationswert: stationValue: gesetzt an 240 Schritten (Formen S0 356, B 604, je Größe gezählt; Landeseinträge DE 720 (AX-5))
- Bewölkung: 140 Verteilungen `cloudMix`, 1906 `censoredNormal` im ganzen Produkt (DE: Atome erwartet)
- T: +1 h 19.2 °C · +6 h 17.8 °C · +24 h 17.8 °C · +48 h 16.9 °C · +120 h 17.0 °C
- Zeiten: gesamt 625 ms, Rechnung 163.8 ms

### WOLFSEGG (AT, 635 m) — OK

- Stufe: 7 von 7 Zeilen in calib
- Stationswert: stationValue: gesetzt an 240 Schritten (Formen S0 356, B 604, je Größe gezählt; Landeseinträge AT 720 (AX-5))
- Bewölkung: 140 Verteilungen `cloudMix`, 1906 `censoredNormal` im ganzen Produkt (Atome sind an DE-Strata gelernt; hier je nach Stratum)
- T: +1 h 18.6 °C · +6 h 14.5 °C · +24 h 18.5 °C · +48 h 16.4 °C · +120 h 15.0 °C
- Zeiten: gesamt 432 ms, Rechnung 103.8 ms

### Basel / Binningen (CH, 316 m) — OK

- Stufe: 7 von 7 Zeilen in calib
- Stationswert: stationValue: gesetzt an 240 Schritten (Formen S0 356, B 604, je Größe gezählt; Landeseinträge CH 719 (AX-5))
- Bewölkung: 140 Verteilungen `cloudMix`, 1906 `censoredNormal` im ganzen Produkt (Atome sind an DE-Strata gelernt; hier je nach Stratum)
- T: +1 h 22.1 °C · +6 h 17.8 °C · +24 h 18.3 °C · +48 h 17.5 °C · +120 h 17.3 °C
- Zeiten: gesamt 420 ms, Rechnung 88.7 ms

**OK** — der Browser rechnet „buscosun Fusion 6": Atome und Landesparameter kommen aus dem CDN an und wirken.