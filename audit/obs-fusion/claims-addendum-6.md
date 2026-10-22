# Phase OF — Nachtrag 6: Hypothese für das Projekt „buscosun Fusion 13" (E-OF-10 + E-OF-11), festgeschrieben 2026-10-22 abends vor dem Fit-Lesen und vor dem ersten Prüfstandlauf

Anlass: Jans Auftrag vom 22.10. abends — „dann start das Projekt fusion 13 und teste es gegen das bestehende fusion 12s" — mit dem Zitat
der Einschätzung aus `audit/obs-fusion.md` §15.8: der nächste Hebel liegt in Tagesstunde und Jahreszeit, nicht in weiteren Faktoren je
Vorlauf (V-OF-24: Wind ≤ 6 h will nachts 1,075 und tags 0,77; V-OF-26: die Sommer-K-Satz-Tabelle unterkoppelt im Herbst; §15.6: der
K-Satz koppelt im Winter stärker).

Drei Kandidaten, alle = Register `fusion-12s` (buscosun Fusion 12) plus eine oder zwei Motor-Optionen, Motor-Commit dieses Schritts,
Tabellen und Fit-Fenster von 12s plus die neuen Fenster, Freeze 2026-10-22 (Registrierungstag; Spur P ab 23.10. wie 12v/12w):

- `fusion-12x` = 12s + `sigmaScale: 6` (`SIGMA_SCALE_TABLE_H`: Faktor auf σ je Größe × Land × Vorlaufzeile {1–2, 3–6, 7–24, 25–48 h} ×
  Tagesstunde der Gültigzeit (acht Klassen zu 3 h), Knoten aus der Lauf-Route 2026-06-18 … 09-13 (acht Slots je Tag, Vorlauf 1–48 h, Kette
  ohne Anker) auf 80 % Abdeckung je Zelle; T/Td in den Zeilen ≤ 6 h = 1 (V-OF-27); Wind/Böe ≤ 6 h × Saisonfaktor R aus der Tag-0-Reihe
  (`of8-fit.json`, §15.6), zyklisch im Tag des Jahres interpoliert; Zeile 84,5 h = 1; Wächter je Zeile: verschlechtert die Zeile den CRPS ihrer
  Fit-Daten um > 0,1 %, steht sie auf 1; Regel `audit/obs-fusion.md` §16.4. Regeländerung §16.4a vor dem Prüfstandlauf: der Wächter hat
  alle Windzeilen auf 1 gesetzt (V-OF-30, Abdeckung rauf, CRPS runter in jedem Land); eine Größe ohne Fit-Knoten in den Zeilen ≤ 6 h
  trägt keinen Saisonfaktor — 12x skaliert den Wind nicht, sondern T/Td bei 7–48 h und die Böe in allen Zeilen).
- `fusion-12y` = 12s + `anchorKSet: 2` (`ANCHOR_KSET_TABLE_S`: C und V je f-Klasse und Jahreszeit DJF/MAM/JJA/SON aus der Tag-0-Reihe 00 UTC
  C1 + C2 bei τ = 1, Länder gepoolt, Klassen mit n ≥ 2 000 und C > 0; im Tag des Jahres zwischen den Saisonzentren interpoliert.
  Regeländerung §16.4a vor dem Prüfstandlauf: die Saisonklassen gelten nur für T, eine leere T-Klasse nimmt die OF-7b-Klasse statt der
  Klasse darunter, Wind und Böe behalten in jeder Jahreszeit die OF-7b-Klassen — die Tag-0-Reihe besetzt für Wind/Böe je Jahreszeit nur
  die Klasse f < 0,15, und die Rückfallregel hätte die Kopplung abgeschaltet statt saisonalisiert).
- `fusion-12z` = 12s + beides.

Die Regel stand VOR dem Fit; die Zahlen werden nicht nachgestellt. Erlaubt ist, wie bei OF-7 (§11.2) und OF-8 (§15.6), EINE Änderung der
Regel an den Fit-Ergebnissen VOR jedem Prüfstandlauf, die in §16 begründet und in diesem Nachtrag vor der Hash-Bildung nachgetragen wird.

Bewertung: der Volltest vom 22.10. (`--modus=voll`, Entwicklungsmenge 14.09.–21.10.) ist Diagnose und Rangfolge; der Vergleich gegen
`fusion-12s` wird aus den Paaren derselben `scores.json` gelesen (Rolle B, 95 %). Urteil ausschließlich mit `--modus=abnahme` (Spur P =
Archivtage ab 2026-10-23 mit reifer Wahrheit; erste Abnahme mit ≥ 4 reifen Tagen frühestens am 03.11., belastbar mit ≥ 14 ≈ 13.11.); Spur R
vorher nur auf Jans Wort; Voraussetzung V-OF-22 (dichte Tagesdatei je Spur-P-Tag).

Behauptung H-OF-6:
(a) Auf Spur P sind bei `fusion-12x` und `fusion-12z` G1, G2, G3 und G4 grün, und beide liegen im Fortschrittsindex gegen buscosun Fusion 9
    (Rolle B) nicht nachweisbar unter `fusion-12s`; mindestens einer liegt nachweisbar darüber (Paar `cand|fusion-12s` mit 95-%-Intervall
    ganz über 0).
(b) Auf Spur R liegt bei `fusion-12x` und `fusion-12z` die Abdeckung der Kernzellen Wind 0–6 h (DE, AT, CH) näher am Sollwert 80 % als bei
    buscosun Fusion 9 und 12s — die rote Stelle von 12t/12u — ohne G2-Rot in diesen Zellen.
(c) `fusion-12y` ist auf Spur P in keiner Kernzelle signifikant schlechter als 12s (G2 gegen 12s aus den Paaren) und bringt die Zellen T und
    Wind 0–6 h DE (Rolle B) näher ans Band als 12v (V-OF-26); auf Spur R rechnet er wie 12s (kein Anker im Tresor).

Vorzugsreihenfolge (vorab): Unter den Kandidaten mit vier grünen Gates auf Spur P gilt der mit dem höchsten Index gegen Fusion 9; sind zwei
nicht nachweisbar verschieden, gilt der einfachere (12x vor 12z vor 12y). Liegt kein grüner Kandidat nachweisbar vor 12s, bleibt buscosun
Fusion 12 der Stand und es wird keine 13 vergeben — kein 13 um Hundertstel. Ist keiner grün, werden die roten Zellen benannt; keine
Nachstellung an Spur-P- oder Spur-R-Zahlen, ein Nachfolger braucht ein neues Fenster. Bei grün heißt der Stand buscosun Fusion 13; den
Register-Status und die Liveschaltung setzt Jan.
