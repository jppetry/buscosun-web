# Phase OF — Nachtrag 3: zweite Hypothese für Spur P und Vorzugsreihenfolge (E-OF-5), festgeschrieben 2026-10-08 vor dem ersten Tag der Spur P

Kandidat `fusion-12u` = `fusion-12t` mit `sigmaScale: 4` statt 3 (`SIGMA_SCALE_TABLE_U`): dieselbe Tabelle, nur der Windknoten
24–48 h steht auf 1 statt 1,026. Begründung: der Knoten ist ein Nebenprodukt des gemeinsamen Fits (das Fenster deckte am Hindcast
schon 79,8 % ab, die Nachbarknoten zogen ihn hoch); seine Verbreiterung um 2,6 % kostete in 12r und 12p in AT und CH 0,2 % CRPS
(signifikant) — der einzige Teil der Skala ≤ 48 h, der je eine Zelle verschlechtert hat.

Behauptung H-OF-5b: Auf Spur P sind für `fusion-12u` G1, G2, G3 und G4 grün und der Fortschrittsindex gegen buscosun Fusion 9
liegt bei ≥ +1,3 %.

Vorzugsreihenfolge (vorab): Sind 12t und 12u beide grün, gilt 12u (die einfachere Tabelle). Ist nur einer grün, gilt dieser.
Ist keiner grün, werden die roten Zellen beider benannt; keine Nachstellung an den Spur-P-Zahlen, kein dritter Kandidat ohne
neues Fenster. Beide Kandidaten werden ausschließlich mit `--modus=abnahme` bewertet, nie auf der Entwicklungsmenge.
