# Phase OF — Nachtrag 5: Hypothese für `fusion-12w` (E-OF-9), festgeschrieben 2026-10-22 vor dem Prüfstandlauf und vor dem ersten Tag der Spur P

Anlass: Jans Auftrag vom 22.10., einen neuen Kandidaten aus den ungenutzten Daten zu bauen (belastbar heute nur die Tag-0-Reihe des
Hindcasts außerhalb des Tresors) und ihn gegen den Champion zu prüfen. Die roten Zellen von 12t/12u lagen bei Wind und Böe 0–6 h auf
Spur R (σ-Skala aus 95 Sommertagen, Vorlauf 1–6 h gepoolt; V-OF-17).

Kandidat `fusion-12w` = Register `fusion-12v` (= 12s + `anchorKSet: 1`) + `sigmaScale: 5` (`SIGMA_SCALE_TABLE_W`): sieben Knoten
(1,5 · 4,5 · 15,5 · 36,5 · 84,5 · 180,5 · 288,5 h), skaliert wird nur die **Böe** in den Knoten 1,5 h und 4,5 h, je Land (DE 0,891/0,913,
AT 0,96/0,904, CH 0,984/0,963, gepoolt 0,932/0,926); Wind, T und Td sowie alle Knoten ≥ 15,5 h stehen auf 1. Die Knoten kommen aus
Fenster A (echte Läufe 2026-06-18 … 09-13, Vorlauf 1–2 h bzw. 3–6 h, 80 % Abdeckung) mal dem Saisonfaktor R aus der Tag-0-Reihe
00 UTC außerhalb des Tresors (2023-06-01 … 2024-03-24 und 2025-09-08 … 2026-06-16; R = Knoten aller Jahreszeiten / Knoten JJA),
Regel `audit/obs-fusion.md` §15.5, gerechnet von `scripts/obsfusion/of8.mjs`, Zahlen in `audit/obs-fusion/of8-fit.json`. Die Regel
stand VOR dem Fit; die Zahlen sind nicht nachgestellt. Eine Änderung der Regel am Fit-Ergebnis, VOR jedem Prüfstandlauf (§15.6,
V-OF-24): die Windknoten bleiben 1, weil der Fit zeigt, dass die Kalibrierung des Windes bei 1–2 h von der Tageszeit beherrscht wird
(00 UTC 1,075, 12 UTC 0,77) und ein Faktor je Vorlauf sie nicht tragen kann — der Regelknoten hätte die Tag-0-Reihe weiter verengt.
Motor-Commit und Tabellen-Hashes nennt das Register; Tabellen des Daten-Repos, Cube-Schema und alle übrigen Optionen wie `fusion-12v`.

Freeze 2026-10-22 (Tag der Registrierung, wie 12v). Spur P = Archivtage ab 2026-10-23 mit reifer Wahrheit (7 Tage); erste Abnahme
mit ≥ 4 reifen Tagen frühestens am 03.11., belastbar mit ≥ 14 (≈ 13.11.). Bewertung ausschließlich mit `--modus=abnahme`; der Volltest
vom 22.10. auf der Entwicklungsmenge (14.09.–21.10.) ist Diagnose und Rangfolge, kein Urteil. Spur R wird vor der Abnahme nur auf
Jans Wort gerechnet. Voraussetzung (V-OF-22): dichte Tagesdatei für jeden Spur-P-Tag (`denseMissing = 0`), sonst kein Urteil.

Behauptung H-OF-5d:
(a) Auf Spur R ist `fusion-12w` in den Kernzellen Böe 0–6 h (DE, AT, CH) nicht signifikant schlechter als buscosun Fusion 9 (G2),
und die Abdeckung dieser Zellen liegt im Band um 80 % oder nicht signifikant weiter vom Sollwert als beim Champion (G3) — eine der
beiden roten Stellen von 12t/12u (die andere, Wind 0–6 h, lässt 12w unberührt: dort rechnet er wie der Champion). Alle übrigen
Zellen der Spur R rechnen wie Fusion 11 (= 12v dort).
(b) Auf Spur P sind G1, G2, G3 und G4 grün und der Fortschrittsindex gegen buscosun Fusion 9 liegt bei ≥ +0,5 %.

Vorzugsreihenfolge (vorab): Sind 12v und 12w beide grün, gilt der mit dem höheren Index gegen Fusion 9 auf Spur P; ist der
Unterschied zwischen beiden nicht nachweisbar, gilt 12v (die einfachere Tabelle). Ist nur einer grün, gilt dieser. Ist keiner grün,
werden die roten Zellen beider benannt; keine Nachstellung von Knoten, Klassen oder Form an den Spur-P- oder Spur-R-Zahlen. Bei grün
heißt der Stand buscosun Fusion 13; den Register-Status und die Liveschaltung setzt Jan.
