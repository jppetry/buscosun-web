# Nachtrag 1 zur eingefrorenen Satellitenmethode (11.10.2026, nach dem ersten Lauf der Fenster, vor jeder Auswertung)

`sat-method-frozen.md` (sha256 `5a20c42b…`) nannte als Messbefund: „Kein Versatz der DN“. Beim ersten Lauf des jüngsten Fensters (19.09.–10.10.2026) schlug der Wächter
`sceneEncodingSuspect` an zwei Kachel-Tagen an (24.09. 32TPT, 29.09. 32TLS). Die Untersuchung zeigte: **einzelne Kachel-Tage tragen den Versatz von +1 000 doch** — Rot-p5 der Vegetation
559 DN auf der ganzen Kachel (801 in einem Waldausschnitt) gegen 130–310 an neun Kachel-Tagen ohne Versatz; SWIR-Schnee p50 1 370 DN gegen 90–600. Der Verarbeitungsstand ist es nicht
(Szenen des Stands 05.13 anderer Kacheln haben keinen Versatz; `earthsearch:boa_offset_applied` ist an beiden true).

**Änderung (nur die Behandlung des Versatzes, keine Schwelle, keine Auswertung):** Der Versatz wird je Kachel-Tag aus den Daten bestimmt — 5. Perzentil der Rot-DN aller Vegetationspixel (SCL 4)
der ganzen Kachel bei 160 m, Schwelle 430 DN (Mitte der Lücke 310 … 559) ⇒ Versatz −0,1, sonst 0, bei weniger als 2 000 Vegetationspixeln 0; danach prüft der Fensterwächter
(`sceneEncodingSuspect`) die Wahl. Der Befund steht im Beobachtungsdokument (`encoding`). Getestet in `verify:glacier-sat` E3/E4 an echten Pixeln beider Fälle.

**Zustand der Fenster.** Der erste Lauf (alle Fenster außer dem jüngsten) wurde nach 2 % des Gate-Fensters 2025 abgebrochen und **verworfen, ohne ausgewertet zu sein**; alle sieben Fenster laufen mit dem
Code dieses Nachtrags neu. Methode, Parameter und Auswertungsprotokoll von `sat-method-frozen.md` gelten unverändert.
