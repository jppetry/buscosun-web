# GM-12 B3 — Geländesonne in der Schmelze: eingefrorene Regel

Eingefroren am 27.11.2026, **vor** dem ersten gewerteten Lauf (vorher nur Zählungen, Ladezeiten und eine Laufzeitprobe ohne Wertung). Jans Entscheidungen zu Teil A vom 27.11. sind eingearbeitet. Werkzeug: `audit/gletscher-schneemodell/gm12-sun.mjs` (+ `gm12-sun-lib.mjs`); es prüft den sha256 dieser Datei gegen `gm12-sun-frozen.sha256` und bricht sonst ab. Änderungen nach dem ersten gewerteten Lauf sind Befunde mit Begründung.

## Mengen

- **E — urteilende Menge:** Schweizer Sommer 2012–2024 mit fester GLAMOS-Sommerbilanz (`massbalance_fixdate.csv`, Release 2025), deren Winter in `gm3/truth/gy.json` steht. Antrieb S (`loadWinters` + `attachRadiation`, unverändert gelesen): Temperaturstation, RhiresD, gemessene Globalstrahlung der Temperaturstation × Klarhimmel-Höhengewinn, Stunde ohne Messung = Klarhimmel × 0,55. Fenster 1. Okt. – 30. Sept. Bänder = GLAMOS-Höhenstufen des Jahres, Gewicht = Fläche; `ela` = Median der Höhe, `pGrad` 0, `zP` = Median (Konvention des Antriebs S wie §3q). Gletscherjahre, die `loadWinters` verwirft, fallen weg (gezählt).
- **GC — Nachbau und zweite Ansicht:** die 75 Gletscherjahre von Gate C mit dem Antrieb von Gate C. IDs mit altem SGI-Suffix werden auf die Katalog-ID abgebildet (Findelgletscher, Giétro, Murtèl `…g009821e46407n`).
- **W — Winterseite:** die 421 Schweizer Gletscherwinter 2011/12–2025/26 wie §3q.8/§3q.9 (Antrieb S, Fenster t0 … t1 der Wahrheit).
- **2024/25 (Prüfstand-Tresor):** geht in keinen Fit; nur gewertet. Betrifft den Winter 2025 in W und das Jahr 2025 in GC. E enthält 2025 nicht.

## Varianten

- **F0** flach, TF/SRF/pf des Betriebs (`melt-calibration.json`), nur berichtet.
- **F1** flach, neu geeicht. **T1** Geländesonne, neu geeicht. **T0** Geländesonne mit TF/SRF des Betriebs, nur berichtet.
- **Geländesonne je Band:** G_T = G · [(1 − d) · min(c / cosZ, 5) + d · svf], direkter Teil 0 bei cosZ < 0,02. c und svf aus `sun-table.json` über `sunC`/`sunSvf` (`scripts/glacier/lib/sunTable.mjs`, nur importiert) an der Bandhöhe; cosZ wie im Kern (Mitte der Stunde, Gletscherpunkt des Katalogs).
- **Diffusanteil (Entscheidung 2):** cf := min(1, G / Klarhimmel(cosZ, z_Ref)), d = Regel des Betriebs (0,15 bei klarem Himmel, linear bis 1 beim Wolkenfaktor der Vollbedeckung). z_Ref = Stationshöhe bei Gate C, Median bei Antrieb S (dort trägt G schon den Höhengewinn zum Median). **Erbs et al. 1982** nur als Empfindlichkeit.
- Bänder unter der tiefsten Höhe der Tabelle bekommen deren Wert und werden als „alte Zunge“ gezählt (Flächenanteil je Stufe).
- Die Geometrie ist Gelände 2026 auf Umrissen des Inventars; das steht in jeder Tabelle mit Geländesonne.

## Eichung (Prozedur von Gate C)

- pf: kleinste Quadrate der gletscherweiten Winterbilanz, Winter nur sammelnd (Normalgleichung, Grenzen [0,5; 4]). Daher ist pf auf der Sommerseite für F und T gleich.
- TF/SRF: Nelder–Mead auf die mittlere quadratische Abweichung der Sommerbilanz, Grenzen TF [0,002; 0,12], SRF [0; 0,04], Starts (0,05; 0,01), (0,03; 0,02), (0,09; 0,004), 80 Iterationen; in den Falten warm vom vollen Fit, 40 Iterationen (wie `gate-c.mjs`).
- Für die Suche darf ein schneller Kern dieselbe Rechnung mit anderer Reihenfolge der Multiplikation rechnen (Abweichung zu `simulate` ≤ 1e-6 mm je Bandbilanz, Kontrolle A2). Jede **gewertete** Zahl wird danach mit `simulate` Band für Band neu gerechnet.
- `atBound` = ein Parameter liegt auf weniger als 1e-4 relativ an einer Grenze.

## Kontrollen (Abbruch, wenn eine fällt)

- **A1:** Band für Band (`simulate` je Band, corr = eigener Multiplikator) = Aufruf mit allen Bändern, `Object.is` an Bandbilanz, Zustand, Stundenschmelze (bis auf die Summationsreihenfolge der gletscherweiten Stundenschmelze, die auf ≤ 1e-9 geprüft wird) und gletscherweiter Bilanz, an jedem Gletscherjahr von E, GC und W. Dazu: Geländereihe des Werkzeugs = `terrainG` des Betriebs bei gleichem d (relativ ≤ 1e-12).
- **A2:** schneller Kern gegen `simulate` an jedem Gletscherjahr, F und T: ≤ 1e-6 mm je Bandbilanz.
- **B:** F0-Nachbau von Gate C (Code von `gate-c.mjs`, unverändert kopiert) trifft pf, TF, SRF, DDF von `melt-calibration.json` relativ ≤ 1e-9 und die MAE von LYO/LGO auf 1e-9 m.
- **C (synthetisch, auf E):** Wahrheit = T-Modell mit TF 0,06, SRF 0,006 und pf des vollen Fits + Rauschen N(0; 300 mm), Seed 12. Bestanden, wenn der volle Fit von T1 TF und SRF auf ±10 % wiederfindet und auf einer flach erzeugten Wahrheit (gleiche Werte, gleiches Rauschen) T1 nicht um ≥ 5 % besser ist als F1 (MAE im Fit). Ob F1 auf der Gelände-Wahrheit eine Steigung gegen sunDay zeigt, wird berichtet (Hebel des Designs), ist aber kein Abbruchgrund.

## B1 — Sommerseite (Urteil)

- Fehler: MAE der Sommerbilanz in m w. e., leave-one-glacier-out über E, Bias dazu. Gewinn = 1 − MAE(T1) / MAE(F1). p10 des Gewinns: Bootstrap über Gletscher (1 000 Ziehungen, Seed 12).
- Abhängigkeit: Steigung und Korrelation des mittleren LGO-Residuums je Gletscher (Modell − Messung, m) gegen sunDay (Mittel Juni–September, `terrain-params.json`). F1 hat eine **nachweisbare Steigung**, wenn die Bootstrap-Spanne 5–95 % (über Gletscher, 1 000, Seed 12) die Null nicht enthält.
- **„carries“:** Gewinn ≥ 0,05 **und** p10 > 0 **und** (bei nachweisbarer Steigung) |Steigung T1| ≤ 0,5 · |Steigung F1| **und** Median-Gewinn der Vertauschungen B4 ≤ 0,5 · Gewinn **und** Winterseite nicht schlechter: MAE_W(T1) ≤ 1,02 · MAE_W(F1) in LGO und LOWO.
- **„only the level“:** alle Bedingungen außer der Vertauschung (Vertauschungen gewinnen mehr als die Hälfte).
- **„does not carry“:** sonst.
- Ohne nachweisbare Steigung bei F1: Zusatz **„no leverage in summer“**; das Urteil steht dann auf dem Fehler allein (ohne Steigungsbedingung).
- Dieselben Kennzahlen auf GC (LGO, 2025 nie im Training) als zweite Ansicht, ohne Urteil.

## B2 — Winterseite (Urteil)

- TF/SRF je Variante aus ihrem vollen Sommerfit auf E. pf je Variante neu: kleinste Quadrate der gletscherweiten Winterbilanz, **mit** Schmelze im Fenster (die Prozedur von Gate C ist nur sammelnd und wäre für die Strahlung blind; das ist die einzige Lesart, in der sich F und T unterscheiden können), ein Wert für die Schweiz, Goldener Schnitt auf [0,5; 4] bis 1e-5. Falten: leave-one-glacier-out und leave-one-winter-out; Winter 2025 nie im Training.
- Fehler: MAE der gletscherweiten Winterbilanz; Gewinn wie B1; p10 Bootstrap über Gletscher (LGO) bzw. Winter (LOWO), 1 000, Seed 12.
- **„carries“:** Gewinn ≥ 0,05 und p10 > 0 in LGO **und** LOWO **und** Median-Gewinn der Vertauschungen (LGO) ≤ 0,5 · Gewinn **und** Sommerseite nicht schlechter: MAE_E(T1) ≤ 1,02 · MAE_E(F1). **„only the level“:** alles außer der Vertauschung. **„does not carry“:** sonst.
- Berichtet (ohne Urteil): Schmelze Okt–Nov je 250-m-Stufe als Anteil der Akkumulation (fester Niederschlag) im Fenster, Flächenanteil „alte Zunge“; k* je Gletscher (der eine Faktor, der die gletscherweite Winterbilanz genau trifft, Median über die Winter) für F0, F1, T1, Verhältnis zu F0 („heute“), Streuung über die Winter (Median des Variationskoeffizienten); MAE/Bias mit dem Landeswert des Betriebs; 2025/26 getrennt.

## B3 — Satellit (nachrangig, ohne Urteil)

Gletscherjahre von GC mit Szenen Juni–September 2023–2025 (Zustand `snowline`, Schneelinie vorhanden; Oktober fällt weg, weil der Antrieb dort ein neues Jahr ohne Altschnee beginnt). Modellierte Schneelinie am Szenentag (Ende des Tages 23 UTC): tiefste Bandmitte, ab der dieses und alle höheren Bänder SWE > `sweMin` tragen; ohne Schnee = höchste Bandmitte + 25 m, ganz verschneit = tiefste − 25 m (gekennzeichnet). Fehler Modell − Szene (MAE, Bias) je Drittel von sunDay, F1 gegen T1 mit den Parametern der zweiten Ansicht (voller Fit auf GC ohne 2025); pf und Winterzustand sind für beide gleich.

## B4 — Negativkontrolle (Pflicht)

20 Vertauschungen der Sonnentabellen zwischen den Gletschern von E ∪ W (Derangement, Seed 12 + Nummer): jeder Gletscher behält seine Höhen und bekommt c und svf eines anderen. Jede Vertauschung wird auf beiden Seiten genau wie T1 neu geeicht und gewertet (LGO; Winterseite LGO). Berichtet: Gewinn je Vertauschung, Median, p90.

## B5 — Satellit ohne Modell (beschreibend, ohne Urteil)

Alle Gletscher mit Szenen 2025 und 2026 (`glacier/v1/obs` auf `origin/main` des Daten-Repos, nur gelesen): je Gletscher und Jahr die letzte brauchbare Schneelinie August–Oktober (Zustand `snowline`, Wert vorhanden; Kennzeichen mitgeführt). y = Schneelinie − Median der Höhe (Katalog); Regression y ~ sunDay (Juni–Sep) + Region + Median der Höhe + Jahr. Berichtet: Steigung (m je 0,1 sunDay), Bootstrap über Gletscher 5–95 % (1 000, Seed 12), erwartetes Vorzeichen positiv (beschattet = tiefere Schneelinie), dieselbe Regression mit sunDay innerhalb der Regionen vertauscht (200, Seed 12), je Land; einmal mit allen, einmal ohne Szenen mit Kennzeichen `schatten`.

## Speicher und Ausgabe

Ein Prozess, freier Speicher protokolliert, Abbruch unter 3 GB. Volle Ergebnisse nach `C:\dev\buscosun-glacier-cache\gm12\sun\`. Bericht im Repo `gm12-sun-report.json` ohne gemessene oder modellierte Bilanz je Gletscherjahr (E-GL-17): nur Mittel, Mediane, Steigungen, Zählungen.

## Aufgezeichnet, nie im Urteil

Dieselben Fits mit TF-Obergrenze 0,30; Erbs-Diffusanteil; TF, SRF, pf und `atBound` in jeder Zeile.
