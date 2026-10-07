# Vorbereitung buscosun Fusion 10 — Material aus der Cowork-Sitzung vom 07.10.2026

Dieser Ordner hält fest, was die Cowork-Sitzung vom 07.10.2026 über buscosun Fusion 9 herausgefunden hat. Er ist
Eingangsmaterial für die autonome Entwicklungssitzung `prompt-fusion10-autonom.md` (Repo-Wurzel). Alles hier ist
**Befund oder Hinweis, keine Vorgabe**; bei Widerspruch gelten Code, Daten und Prüfstand.

| Datei | Inhalt |
|---|---|
| `fusion9-bewertung.md` | Bewertung von Fusion 9: Stärken, Schwächen, Wettbewerbsvergleich, Fazit (Abschrift des Claude-Docs, Diagramme als Tabellen) |
| `hinweise-fuer-fusion10.md` | Verbesserungsansätze nach Hebel, je mit Befund, Messweg und Fallen; Mechanik des Prüfstands |
| `kennzahlen-fusion9.csv` | 600 Zellen (Menge × Rolle × Land × Größe × Fenster): MAE/RMSE/CRPS/Bias/Abdeckung von Fusion 9 und MAE/CRPS aller Referenzen, Skill gegen beste deterministische Quelle (MAE und CRPS) und gegen Klimatologie |
| `kennzahlen.mjs` | erzeugt die CSV aus einer `scores.json` des Prüfstands (`node audit/fusion10-vorbereitung/kennzahlen.mjs`) |
| `archiv-schema5-stationsdichte.md` | was das Punktarchiv seit 05.10.2026 sammelt (2 069 Punkte) und wie viel dichter das Stationsnetz dadurch wird |
| `stationsdichte.mjs` | rechnet die Zählung und die Abstände aus `scripts/punktarchiv/points*.json` nach |
| `datenquellen-historisch.md` | historische Daten DE/AT/CH (DWD CDC/REA, GeoSphere, MeteoSwiss), was sie für Fusion leisten können, Fristen |

**Tresor:** `fusion9-bewertung.md` und die Zeilen `spurR` der CSV enthalten Ergebnisse aus Spur R (am 05.10. geöffnet).
Für die Entwicklung von Fusion 10 nur Kontext — Kandidaten auf der Entwicklungsmenge auswählen und tunen.

Grundlage aller Zahlen zu Fusion 9: Prüfstand P1, `audit/pruefstand/berichte/fusion-9/2026-10-05-abnahme/scores.json`
und `audit/pruefstand/vergleiche/2026-10-05*/`. Zahlen zum Archiv: Slot `buscosun-archiv/2026-10-06/2323.json.gz`.
Claude-Doc der Bewertung: https://claude.ai/code/artifact/b02dc649-31a2-4d34-97ea-25c9c07eb2e6
