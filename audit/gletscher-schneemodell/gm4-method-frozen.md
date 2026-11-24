# GM-4 — Messregel M-6 … M-9, eingefroren vor dem ersten gewerteten Lauf (23.11.2026, 21:30 UTC)

Werkzeug: `audit/gletscher-schneemodell/gm4-probe.mjs` → `gm4-probe.json`. Das Urteil rechnet das Skript; ich ändere diese Datei nach dem Hash nicht mehr. Eine Änderung danach steht als Nachtrag mit eigenem Hash.

## Daten (nur gelesen)

- **Modell:** die Bahn des Startzustands der Schneedecke (Daten-Repo `4ae73e46`, `glacier/v1/snowpack/state.json`, Stand 23.11. 17:00 UTC, Regeln `country`/`board`), nachgerechnet mit derselben Schrittfunktion wie `snowpack-seed.mjs` aus dem Zwischenspeicher `C:\dev\buscosun-glacier-cache\gm3c-snowpack\seed` (INCA, Schweizer Tagesgitter, Wetterläufe). Aufgezeichnet: Schneehöhe (cm) und Wasserwert (mm) an den drei Höhen jedes Gletschers zu jeder vollen Stunde vom 20.11. 17:00 bis 23.11. 17:00 UTC.
- **Gültigkeit der Nachrechnung:** der Endzustand der Sonde muss Byte für Byte der eingespielte Startzustand sein (`g` aller Gletscher). Sonst ist die Messung ungültig und wird nicht gewertet.
- **Stationen:** die Slot-Dateien `glacier/v1/stn/h/<yyyymmddhh>.json` (volle Stunden; Kopie aus dem Daten-Repo `c0f4686f` unter `C:\dev\buscosun-glacier-cache\gm4\live`), Abschnitte `stations` und `ext.stations`; nur angenommene Werte (was die Prüfung der Linie verwirft, fehlt dort). Ein Wert zählt für die Stunde T, wenn sein Stempel höchstens 60 min vor T liegt und nicht nach T + 15 min.
- **Zuordnung:** `glacier/v1/stn/map/20261120-1.4.json`, Abschnitt `ext`, Größe `snow` (Station, km zum Umriss, Höhenunterschied). Eine Paarung = Gletscher × seine Schneestation.

## Modell in der Höhe der Station

Höhe der Station `zS` aus dem Katalog der Linie (`ext.stations[..].elev`). Höhen des Gletschers `z = [Zunge, Median, Oberkante]` wie im Producer (Bänder der Hypsometrie). Wert in `zS`: linear zwischen den zwei benachbarten Höhen; unter der Zunge der Wert der Zunge, über der Oberkante der der Oberkante (keine Hochrechnung). Klasse je Paarung: `inside`, `below`, `above`.

## Größen

- **Stand** zu T = 23.11. 17:00 UTC: Modell(zS, T) gegen Station(T).
- **Änderung** über 24 h und 48 h: Station(T) − Station(T − k) aus den Slot-Dateien (beide Enden nötig); Modell ebenso. Tirol zusätzlich: die gelieferten `HSD24/48/72` zu T gegen Modell(T) − Modell(T − 24/48/72 h).
- **Ereignis:** Station-Änderung über 24 h ≥ 3 cm (`set`). **Ruhe:** |Station-Änderung 24 h| < 1 cm.

## Kennzahlen (je Größe; gesamt, je Land, je Höhenband der Station < 2 000 / 2 000–2 499 / ≥ 2 500 m, je Netz, je Klasse)

Zahl der Paarungen und der verschiedenen Stationen; Median Station, Median Modell; mittlere Abweichung (Modell − Station); mittlerer Betragsfehler; Median des Verhältnisses Modell/Station (Stand: Station ≥ 5 cm; Änderung: nur Ereignisse); Pearson r.

Für Ereignisse: Trefferquote = Anteil der Ereignisse mit Modell-Änderung ≥ 1 cm; Fehlalarm = Anteil der Ruhe-Paarungen mit Modell-Änderung 24 h ≥ 3 cm.

## Behauptungen und ihr Urteil (rechnet das Skript)

- **B1 (V-GM-33):** Der Stand trägt den Gletscher-Faktor: Median des Verhältnisses Modell/Station im Stand (alle Paarungen, Station ≥ 5 cm) liegt in [1,5; 3,0] ⇒ `bestätigt`, sonst `widerlegt`.
- **B2:** Die Änderung bei Ereignissen trägt den Faktor ebenfalls: Median des Verhältnisses Modell/Station der 24-h-Änderung bei Ereignissen liegt in [0,67 · F̄; 1,5 · F̄] mit F̄ = Mittel der Landesfaktoren der Paarungen ⇒ `Faktor`; liegt er in [0,67; 1,5] ⇒ `eins zu eins`; sonst `keins von beiden`. Unter 20 Ereignis-Paarungen: `zu wenig`.
- **B3:** Das Modell sieht die Ereignisse: Trefferquote ≥ 0,8 ⇒ `ja`, sonst `nein` (unter 20 Ereignisse: `zu wenig`).
- **B4 (V-GM-38):** Setzung ohne Schneefall: mittlere Abweichung der 24-h-Änderung an Ruhe-Paarungen liegt in [−1; +1] cm ⇒ `stimmt`, sonst `weicht ab` (unter 20: `zu wenig`).

## Übertrag (M-8, leave-one-station-out)

Je Station s die Abweichung d_s = Median über ihre Paarungen von (a) Modell − Station im Stand, (b) log(Modell/Station) der 24-h-Änderung bei Ereignissen. Vorhersage für s aus den ANDEREN Stationen mit Wert: inverse Distanz (Gewicht 1/max(d, 1 km)) innerhalb R ∈ {15, 30, 60 km}, außerdem der Median des Landes. Fehler = |Vorhersage − d_s|; Bezug „ohne Übertrag“ = |d_s − Median aller anderen Stationen| bzw. |d_s| ohne jede Korrektur. Kennzahl: Anteil der Stationen mit Vorhersage, mittlerer Fehler, Gewinn = 1 − Fehler/Bezug. **B5:** Gewinn gegen „ohne Korrektur“ bei R = 30 km > 0,2 und mindestens 30 vorhergesagte Stationen ⇒ `trägt`, sonst `trägt nicht`.

## Satellit (M-9)

Die Zeilen der Saison 2026 (Daten-Repo `c0f4686f`, je Gletscher die jüngste Zeile, dieselbe Auswahl wie `melt.mjs`, Alter ≤ 20 Tage zu T, nur Gletscher mit Satellitenklasse) auf die Schneedecke zu T angewandt: je Band der Hypsometrie der Wasserwert linear zwischen den drei Höhen (außerhalb der Wert der nächsten Höhe), dann die Regel `nudgeState` von `melt.mjs` (250 mm setzen / 0). Gezählt: Gletscher mit mindestens einem geänderten Band, getrennt nach „gesetzt“ und „gelöscht“, und der Wasserwert, den die Regel an der Medianhöhe ändern würde. Kein Urteil, nur Zahlen.

## Nicht Teil dieser Messung

Antrieb buscosun Fusion (die Läufe des Schattenprodukts fehlen noch); die Wahrheit auf dem Eis; Gletscher ohne Schneestation (außer M-8).
