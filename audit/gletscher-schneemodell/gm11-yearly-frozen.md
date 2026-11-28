# GM-11 Phase 1d Teil B — Jahreskomponente des Faktors: eingefrorene Regel

Eingefroren am 26.11.2026 vor dem ersten gewerteten Lauf, nach Jans Wort zu §133. Das Werkzeug `gm11-yearly.mjs` prüft den sha256 dieser Datei (`gm11-yearly-frozen.sha256`) vor jedem Schritt `b1`, `b2`, `b3`. Nur Messung.

## 1. Gletscher und k*

- 37 Schweizer Eichgletscher, Winter 2011/12 … 2025/26 (Wahrheit `gm3/truth/gy.json` für 2012–2025, `gm11/w26/gy-2526.json` für 2026; 2024/25 nur aus der gemessenen Wahrheit, wie sie in `gm3` liegt).
- Kern wie gebaut (`simulate`, Modell `eti`, TF/SRF der Eichung, pGrad 0, Antrieb S = Station + RhiresD, Fenster t0 … t1 der Wahrheit), keine Variante.
- B_mod(f) = gletscherweite Winterbilanz des Kerns mit dem Faktor f. Für die Wertung wird B_mod je Gletscherwinter auf einem festen Gitter von 81 Faktoren (log-gleichmäßig 0,2 … 8) gerechnet und linear interpoliert; der Interpolationsfehler wird an k* gegen einen direkten Lauf gemessen und berichtet.
- k*(Y) = der Faktor mit B_mod(k*) = B_meas (Halbierung wie §3q.8, 0,2 … 8, 40 Schritte). Gletscherwinter ohne k* in dieser Spanne fallen heraus (gezählt).
- Anomalie des Gletschers: a_g(Y) = k*(Y) / Mittel von k* über die ÜBRIGEN Winter desselben Gletschers (mindestens 3 übrige Winter, sonst fällt der Gletscherwinter heraus).

## 2. Reihen und ihre Anomalie

- **Hauptreihen (Messung):** SLF-Messfelder (Neuschnee HN von Hand, cm) und SwissMetNet `htoauths` (Neuschnee = Summe der positiven Zuwächse der Tageswerte um 06 UTC, cm); eine Reihe zählt mit ≥ 8 gültigen Wintern (HN an ≥ 90 % der Tage 1. Oktober – 1. April); in einem einzelnen Winter zählt sie nur, wenn sie dort gültig ist.
- **Antrieb am Ort der Reihe:** S_s(Tag) = RhiresD der nächsten Gitterzelle × Schneeanteil des Kerns fs(T) = clamp((fsWarm − T)/(fsWarm − fsCold), 0, 1) mit T = Tagesmittel (06–06 UTC) der nächsten SwissMetNet-Station des Speichers mit Temperatur, mit −6,5 K/km auf die Höhe der Reihe; Faktor 1. RhiresD 2025/26 aus den Dateien in `gm11/w26` (Jahresdatei 2025, Monatsdateien „last“ Dez 2025 – Mai 2026). Ein Tag mit fehlendem RhiresD oder fehlender Temperatur zählt nicht (weder Zähler noch Nenner).
- **Anomalie der Reihe** an Stichtag d ∈ {1. Jan, 1. Feb, 1. Mär, 1. Apr}: q_s(Y, d) = Σ HN (1. Okt … Tag vor d) / Σ S_s (gleiche Tage); a_s(Y, d) = q_s(Y, d) / Mittel von q_s(·, d) über die ÜBRIGEN gültigen Winter derselben Reihe (mindestens 3). Σ S_s < 10 mm ⇒ kein Wert.
- **Bekannte Schwäche (im Audit zu nennen):** Neuschnee in cm hängt an der Dichte; ein warmer Winter mit schwerem Schnee liest sich schneearm.
- **Paarung:** Reihen ≤ 30 km vom Gletscherpunkt, höchstens 800 m UNTER dem Median des Gletschers (keine Obergrenze); in jedem Winter die nächsten bis zu drei an diesem Stichtag gültigen; gepaarte Anomalie a_p = Median ihrer a_s. Höhenklasse eines Paars = Höhenunterschied der nächsten gewählten Reihe zum Median: „≤ 500 m“ (auch über dem Median) oder „500–800 m“.
- **Nebenreihe OSHD (Analyse, keine Messung, nie mit den Hauptreihen gemischt):** SLF-Gitter Q20 v1.1, Wasserwert `swe` als Mittel der 250-m-Zellen im L1-Umriss (wie `gm10-q20.py`, v1.1-Schalter), q_o(Y, d) = (swe(d) − swe(1. Okt)) / Σ S_g (Antrieb S des Gletschers, Schneeanteil des Kerns am Median, Faktor 1, 1. Okt … Tag vor d); a_o wie a_s gebildet. Nur 2015/16 … 2024/25. Gleiche Stichtage, gleiche Wertung, gleiches Urteil, eigener Abschnitt im Bericht.

## 3. B1 — gemeinsamer Anteil

r² (Quadrat der Pearson-Korrelation) von a_g gegen den Median von a_g der ANDEREN Gletscher desselben Winters, (i) alle, (ii) nur Gletscher ≤ 50 km (mindestens 2, sonst fällt der Gletscherwinter in (ii) heraus). **Schwelle für die IMIS-Frage: r² ≥ 0,30 in (i) oder (ii) ⇒ nach B1 und B2 anhalten und Jan fragen; darunter wird IMIS nicht geholt.**

## 4. B2 — lesbarer Anteil

- Vorhersage der Anomalie: â = 1 + β · (a_p − 1). **β ist global und wird nie auf dem gewerteten Winter oder Gletscher geschätzt:** kleinste Quadrate durch den Ursprung von (a_g − 1) auf (a_p − 1) über die Trainingsfalte; zwei Auslassungen: leave-one-winter-out (alle Gletscherwinter des gewerteten Winters fehlen im Training) und leave-one-glacier-out (alle Winter des gewerteten Gletschers fehlen). Daneben die Variante **β = 1** mit derselben Wertung und demselben Urteil.
- Grundlagen: (G) eigener mittlerer Faktor k̄ = Mittel von k* der übrigen Winter des Gletschers; (L) Landeswert der Region (`precipRunOf`). Fehler e = |B_mod(Grundlage × â) − B_meas| gegen e0 = |B_mod(Grundlage) − B_meas|, nur über Gletscherwinter mit a_p.
- Gewinn = Mittel(e0) − Mittel(e) in mm und in % von Mittel(e0); je Stichtag, je Auslassung, je Grundlage, je β-Variante; dazu je Höhenklasse (≤ 500, 500–800 m), je Gletscher besser/schlechter (Mittel über seine Winter), 2025/26 getrennt.
- Bootstrap: 1 000 Ziehungen der Winter als Blöcke mit Zurücklegen (Seed 20261126), p10 des Gewinns in %.

## 5. B3 — Kontrollen (Pflicht)

- **Vertauschung:** 200 Permutationen der Winter der Reihen (je Ziehung dieselbe Permutation für alle Reihen, Seed 20261127); β wird in jeder Permutation in den Falten neu geschätzt; mittlerer Gewinn in %.
- **Synthetisch:** B_meas wird ersetzt durch B_mod(k̄ · a_syn) mit a_syn = 1 + 1,0 · (a_p − 1) + ε, ε normal mit der Standardabweichung der Residuen (a_g − 1) − (a_p − 1) der echten Daten (Seed 20261128); bestanden, wenn das zurückgeschätzte β (alle Gletscherwinter) zwischen 0,8 und 1,2 liegt und der Gewinn (G, leave-one-winter-out) > 0 ist.

## 6. Urteil (das Skript, je Stichtag, je Reihe Haupt/OSHD, je β-Variante; maßgeblich Grundlage G mit leave-one-winter-out)

- „too few pairs“: weniger als 15 Gletscher oder weniger als 100 Gletscherwinter mit a_p an diesem Stichtag;
- „yearly component carries“: Gewinn ≥ 5 % **und** Bootstrap-p10 > 0 **und** mittlerer Vertauschungsgewinn |≤ 1 %| **und** synthetische Kontrolle bestanden;
- sonst „does not carry“.
Die übrigen Kombinationen (leave-one-glacier-out, Grundlage L) werden mit derselben Regel beurteilt und berichtet, das maßgebliche Urteil ist das oben genannte.

## 7. Bericht

Im Repo `gm11-yearly-b-report.json` ohne Messwerte je Gletscherwinter (Summen, Mittel, Zählungen; je Gletscher nur besser/schlechter und Mittel über die Winter); alles andere im Cache `gm11\yearly\`.
