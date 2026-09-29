# fs-live-check — die neueste Stufe gegen den echten Cube

Stand 2026-09-28T20:33Z. A = Daten-Repo wie heute, B = mit dem Veröffentlichungspaket.

## HELGOLAND (DE, 4 m)

- **A (heute):** Stufe wirkt nicht; learned: point/fusion.client.json nicht lesbar — Rechnung ohne Lernstufe · stationValue: point/stack.client.json nicht lesbar — Rechnung ohne Stationswert · stage:fs — keine gelernten Tabellen ⇒ Rechnung wie ohne die Stufe (keine ihrer Optionen ist ohne Lernstufe gemessen) · learned: Option an, aber keine Tabellen im Eingang (CubeIo.learnedSource aus, Datei fehlt oder ungültig) ⇒ Rechnung ohne Lernstufe
- **B (mit Paket):** alle sieben Zeilen der Stufe in calib; stage:fs — neueste Stufe: Lernstufe mit learnedSpeed, learnedPrecip, learnedAtPoint, learnedClouds, ohne Klimatologie-Schritt, Stationswert · stationValue: HELGOLAND steht am Punkt (0.0 km, Δh 0 m); Innovation keine (keine Messung einer Station am Punkt ≤ jetzt mit Stationsvorhersage zur Messzeit) ⇒ Formen ohne w·I · stationValue: gesetzt an 240 Schritten (Formen S0 356, B 604, je Größe gezählt)
- T (A → B): +1 h 16.1 → 16.0 °C · +6 h 15.1 → 15.4 °C · +24 h 17.6 → 18.7 °C · +48 h 17.3 → 18.5 °C · +120 h 16.0 → 16.7 °C
- Zeiten B: gesamt 445 ms, Rechnung 128.2 ms, Ausgabe 22.7 ms (A: Rechnung 115.5 ms)

## WOLFSEGG (AT, 635 m)

- **A (heute):** Stufe wirkt nicht; learned: point/fusion.client.json nicht lesbar — Rechnung ohne Lernstufe · stationValue: point/stack.client.json nicht lesbar — Rechnung ohne Stationswert · stage:fs — keine gelernten Tabellen ⇒ Rechnung wie ohne die Stufe (keine ihrer Optionen ist ohne Lernstufe gemessen) · learned: Option an, aber keine Tabellen im Eingang (CubeIo.learnedSource aus, Datei fehlt oder ungültig) ⇒ Rechnung ohne Lernstufe
- **B (mit Paket):** alle sieben Zeilen der Stufe in calib; stage:fs — neueste Stufe: Lernstufe mit learnedSpeed, learnedPrecip, learnedAtPoint, learnedClouds, ohne Klimatologie-Schritt, Stationswert · stationValue: WOLFSEGG steht am Punkt (0.6 km, Δh 31 m); Innovation keine (keine Messung einer Station am Punkt ≤ jetzt mit Stationsvorhersage zur Messzeit) ⇒ Formen ohne w·I · stationValue: gesetzt an 240 Schritten (Formen S0 356, B 604, je Größe gezählt)
- T (A → B): +1 h 14.2 → 15.4 °C · +6 h 11.9 → 12.2 °C · +24 h 15.7 → 16.4 °C · +48 h 16.5 → 17.1 °C · +120 h 14.6 → 15.5 °C
- Zeiten B: gesamt 435 ms, Rechnung 146.2 ms, Ausgabe 18.4 ms (A: Rechnung 182.5 ms)

## Chasseral (CH, 1594 m)

- **A (heute):** Stufe wirkt nicht; learned: point/fusion.client.json nicht lesbar — Rechnung ohne Lernstufe · stationValue: point/stack.client.json nicht lesbar — Rechnung ohne Stationswert · stage:fs — keine gelernten Tabellen ⇒ Rechnung wie ohne die Stufe (keine ihrer Optionen ist ohne Lernstufe gemessen) · learned: Option an, aber keine Tabellen im Eingang (CubeIo.learnedSource aus, Datei fehlt oder ungültig) ⇒ Rechnung ohne Lernstufe
- **B (mit Paket):** alle sieben Zeilen der Stufe in calib; stage:fs — neueste Stufe: Lernstufe mit learnedSpeed, learnedPrecip, learnedAtPoint, learnedClouds, ohne Klimatologie-Schritt, Stationswert · stationValue: CHASSERAL steht am Punkt (0.4 km, Δh 20 m); Innovation keine (keine Messung einer Station am Punkt ≤ jetzt mit Stationsvorhersage zur Messzeit) ⇒ Formen ohne w·I · stationValue: gesetzt an 240 Schritten (Formen S0 356, B 604, je Größe gezählt)
- T (A → B): +1 h 13.3 → 14.6 °C · +6 h 12.1 → 14.1 °C · +24 h 13.3 → 15.2 °C · +48 h 12.5 → 13.9 °C · +120 h 10.0 → 11.6 °C
- Zeiten B: gesamt 628 ms, Rechnung 117.7 ms, Ausgabe 56.5 ms (A: Rechnung 88.6 ms)

**OK** — ohne die Dateien rechnet der Pfad wie bisher und nennt es; mit dem Paket trägt jede Abfrage die neueste Stufe.