# Phase GL — Nachtrag 2 zu Gate B1: „höchste Schneegrenze der Saison“ (E-GL-14)

Eingefroren am **11.10.2026** (Jans Entscheidung E-GL-14 am selben Tag: der Satellit bleibt bei Szenenwerten; die Regel unten wird vorab eingefroren und an der
Saison 2026 geprüft). Der sha256 dieser Datei steht in `claims-frozen-amendment-2-b1.sha256` und in `audit/gletscher.md` §3. Eine spätere Änderung dieser Datei
ist ein Befund (V-GL-…), kein Update.

## Warum dieser Nachtrag

Gate B1 ist nach dem eingefrorenen Protokoll (`claims-frozen.md`) **rot** (B1-1: Median |Δ| 282 m statt ≤ 150 m). Die Regel unten — das Maximum der Szenen-Schneegrenzen
der Saison statt ihres Medians — wurde **nachträglich an denselben 29 Gletscherjahren 2023–2025 gefunden** (Median |Δ| 92 m, P90 225 m, Bias +14 m; `b1/sensitivity.txt`) und
ist an diesen Jahren **kein bestandenes Gate**. Diese Jahre zählen für den Nachtrag **nicht**. Geprüft wird an Daten, die beim Einfrieren weder gemessen noch veröffentlicht sind:
der Saison **2026** (Gleichgewichtslinien 2026 von GLAMOS und von der Universität Innsbruck, ab Veröffentlichung, frühestens Spätherbst 2026).

## Die Regel (Schätzer HSL — „highest snow line“)

Für einen Gletscher der **Klasse A** und ein Jahr Y:

1. Gültige Szenen: die Beobachtungsdokumente `obs/<Y>/<Kachel>/<Datum>.json` mit Datum **15.07.Y bis 10.10.Y** (einschließlich), in denen der Gletscher den Zustand `snowline` hat,
   der Klaranteil der Maske **≥ 0,70** ist (die Maskenregel des Protokolls `sat-method-frozen.md` und ihres Nachtrags 1 unverändert) und die Szene **nicht** die Marke `neuschnee` trägt.
2. Mindestens **2** gültige Szenen, sonst zählt der Fall nicht (und wird als „nicht gezählt“ mit Grund genannt, nie ersetzt).
3. **HSL = das Maximum der Schneegrenzen dieser Szenen** (m ü. M., die Schneegrenze der Szene wie `buildSeasonRows` sie führt). Kein Perzentil, kein Abzug, kein Versatz.

Die Berechnung ist die von `audit/gletscher/b1/b1-sensitivity.mjs` (Zeile „Maximum 15.07.–10.10. ohne Neuschnee“), unverändert; `scripts/glacier/b1-evaluate.mjs` wird nur um genau diese Auswahl ergänzt.

## Daten, an denen geprüft wird (Stand beim Einfrieren)

- Satellit: alle Beobachtungsdokumente der Saison 2026 mit Datum 15.07.–10.10.2026. Beim Einfrieren **437 Kachel-Tage**; die sortierte Liste `<Kachel>|<Datum>|<Szene>`
  (eine Zeile je Kachel-Tag) hat den **sha256 `e6428a02555c07e0251e8c7fb3d5113d2bee8df7ef25d671f5e7dc3f24daf45a`**; die Liste liegt als `scenes-2026-frozen.txt` neben dieser Datei.
  Szenen, die später **nachgeladen** werden (andere Szene am selben Tag), zählen nicht; die Auswertung rechnet mit genau dieser Liste.
- Wahrheit: GLAMOS-Gleichgewichtslinie (Release 2026, Gletscher mit AAR 5…95 %) und Gleichgewichtslinie der Innsbrucker Messreihen (Hintereisferner, Kesselwandferner,
  Vernagtferner, Jamtalferner, Venedigerkees, Hallstätter, Seekarlesferner, Zettalunitz/Mullwitz) — **nur das Jahr 2026**. Die Wahrheit wird erst nach der Auswertung der Satellitenseite geöffnet.
- Basislinie: das Mittel der TSLA-End-of-Summer-Schneegrenze 2000–2022 je Gletscher (wie B1-2).

## Kriterien (jedes kann rot werden)

| Nr. | Kriterium | Schwelle |
| --- | --- | --- |
| B1b-1 | Median \|HSL − ELA\| | **≤ 150 m** |
| B1b-2 | P90 \|HSL − ELA\| | **≤ 400 m** |
| B1b-3 | Verzerrung \|mittlerer Fehler\| (neu gegenüber B1-1: HSL soll die ELA treffen, nicht nur streuen) | **≤ 100 m** |
| B1b-4 | besser als die Basislinie (gleiche Gletscher, gleiches Jahr) | Median \|Δ\| von HSL **kleiner** als der der Basislinie |
| B1b-5 | Fallzahl | **≥ 12** gezählte Gletscher (GLAMOS und UIBK zusammen), davon **≥ 5** außerhalb der Schweiz — sonst „nicht entscheidbar“ (kein Bestehen) und die Prüfung wird mit der Saison 2027 wiederholt |

## Folgen (vorab)

- **Bestanden** (B1b-1 … B1b-5): die Seite darf die höchste Schneegrenze der Saison als „ungefähr die Gleichgewichtslinie, geprüft an der Saison 2026 (n = …, Median …)“ führen — mit
  Herkunft Satellit und dem Prüfergebnis daneben; die Szenenwerte bleiben sichtbar. Nie „Gleichgewichtslinie“ ohne dieses Prüfergebnis.
- **Nicht bestanden oder nicht entscheidbar**: die Seite führt weiter nur Szenenwerte; die Regel wird verworfen (kein zweiter Nachtrag an denselben Daten).
- Bis zum Urteil heißen Satellitenwerte „Szenenwerte“ und nirgends „Gleichgewichtslinie“; das Wort steht nur an gemessenen Werten (Herkunft „gemessen“). Das ist eine Produktregel dieser Phase (Text der Seite), kein Prüfer-Schloss.

## Was nicht verändert wird

Die Maskenregel, die Schneeentscheidung (NDSI > 0,4 und Grün ≥ 0,45), der Versatz je Kachel-Tag, die Albedo-Quarantäne, das Fenster, die Mindestzahl der Szenen und die Schwellen
dieses Nachtrags. Wird die Satellitenmethode vor der Auswertung geändert, gilt der Nachtrag für die Szenenliste oben nicht mehr; die Prüfung wird dann an der Saison 2027 mit einer
neu eingefrorenen Fassung gemacht.
