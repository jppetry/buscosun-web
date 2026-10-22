# Phase OF — Nachtrag 4: Hypothese für ein neues Spur-P-Fenster (E-OF-8 b), festgeschrieben 2026-10-22 vor dem ersten Tag der Spur P

Anlass: `fusion-12t` und `fusion-12u` sind am 21.10. in der Abnahme abgelehnt (Spur R: Wind 0–6 h DE −2,1 %, Böe 0–6 h CH −0,5 %,
Abdeckung Wind 0–6 h 73,4 %; Spur P: alle Gates grün, Index +0,25 % statt ≥ +1,3 %). Die roten Zellen kommen aus der σ-Skala ≤ 48 h,
die aus 95 Sommertagen stammt (V-OF-17). Nach der Regel aus Nachtrag 3 braucht ein Nachfolger ein neues Fenster.

Kandidat `fusion-12v` = Register `fusion-12u` OHNE `sigmaScale` (Optionen von `fusion-12s` + `anchorKSet: 1`; `ANCHOR_KSET_TABLE`
aus OF-7b, Provenienz Hindcast 2026-06-18 … 09-13, außerhalb des Tresors). Motor-Commit `4350886` (derselbe wie 12t/12u),
Tabellen des Daten-Repos `1aaec969`, Cube-Schema und alle übrigen Optionen wie `fusion-12s`.

Freeze 2026-10-22 (Tag der Registrierung). Spur P = Archivtage ab 2026-10-23 mit reifer Wahrheit (7 Tage); erste Abnahme mit
≥ 4 reifen Tagen frühestens am 03.11., belastbar mit ≥ 14 (≈ 13.11.). Bewertung ausschließlich mit `--modus=abnahme`, nie auf der
Entwicklungsmenge (14.09. … 22.10.). Spur R sieht den Hebel nicht (der Tresor trägt keine Stationsmessungen): dort ist 12v
rechnerisch Fusion 11; Spur R dient nur als Gegenprobe, dass nichts schlechter wird.

Voraussetzung (V-OF-22): Der Replay muss für JEDEN Tag der Spur P die dichte Tagesdatei (`obs-dense/<Tag>.json.gz`) haben
(`denseMissing = 0`). Fehlt sie für einen Tag, ist der Lauf ungültig — kein Urteil, keine Zahl wird zitiert.

Behauptung H-OF-5c: Auf Spur P sind für `fusion-12v` G1, G2, G3 und G4 grün, der Fortschrittsindex gegen buscosun Fusion 9 liegt
bei ≥ +0,5 % (die Nachweisgrenze des Protokolls), und die Abdeckung T 0–6 h liegt im Band um 80 % (bei `fusion-12s` auf der
Entwicklungsmenge 74,4 %: zu schmal). Auf Spur R ist keine Kernzelle signifikant schlechter als beim Champion.

Regel: Trifft die Behauptung nicht zu, werden die roten Zellen benannt; keine Nachstellung von Klassen, Deckeln oder Form an den
Spur-P-Zahlen. Bei grün heißt der Stand buscosun Fusion 13; den Register-Status und die Liveschaltung setzt Jan.
