# Phase GL — Die Schweizer Inventare in GLIMS sind dieselben Umrisse wie bei GLAMOS

Zweck: Die Umrisse und früheren Umrisse der Schweiz kommen seit dem 11.10.2026 aus der **GLIMS Glacier Database** (öffentlicher WFS ohne Konto,
`https://www.glims.org/geoserver/ows`, Schicht `GLIMS:GLIMS_Glacier_Outlines`), nicht mehr aus den Dateien von glamos.ch (Jans Weg über das WGMS und GLIMS,
`audit/gletscher.md` §GL-1b). Dieses Blatt belegt, **welche GLIMS-Einreichungen welchem Schweizer Inventar entsprechen** (ihre Bezeichnungen sagen nur
„University of Zurich“ o. ä.) und dass es dieselben Umrisse sind. Die GLAMOS-Dateien werden dafür **nur gelesen und verglichen** — nichts davon geht in den Build.

Werkzeug: `audit/gletscher/glims-identity.py` (Vereinigung aller Umrisse eines Satzes gegen die Vereinigung der GLAMOS-Datei, in LV95). Die restliche Abweichung ist die
Datumstransformation ohne Gitter (pyproj-Näherung, ≈ 1 m) und die Digitalisiergenauigkeit — bei kleinen Gletschern von 0,01 km² reichen 1,5 m Versatz für einige Prozent.

| GLIMS-Satz (Einreichung) | Merkmale | Fl�che km� | gegen GLAMOS-Datei | Fl�che GLAMOS km� | IoU der Vereinigungen | Differenzfl�che km� |
| --- | --- | --- | --- | --- | --- | --- |
| sgi2016 (869) | 1834 | 961.4 | SGI 2016 | 961.4 | 0.9866 | 13.0 |
| sgi1850-a (594) | 899 | 765.9 | SGI 1850 | 1788.3 | 0.3993 | 1096.6 |
| sgi1850-b (595) | 1845 | 1063.1 | SGI 1850 | 1788.3 | 0.5784 | 761.7 |
| sgi1850-a+sgi1850-b (594+595) | 2744 | 1829.0 | SGI 1850 | 1788.3 | 0.9620 | 70.0 |
| sgi1931 (868) | 2694 | 1494.3 | SGI 1931 | 1494.2 | 0.9897 | 15.4 |
| sgi1973 (599) | 2061 | 1285.8 | SGI 1973 | 1311.1 | 0.9698 | 39.8 |
| sgi2010-a (596) | 2003 | 944.5 | SGI 2010 | 944.4 | 0.9888 | 10.7 |
| sgi2010-b (579) | 2003 | 944.3 | SGI 2010 | 944.4 | 0.9892 | 10.3 |

Lesart: SGI2016 (Einreichung 869) 98,7 % Überdeckung, Flächensumme gleich (961,4 km²); SGI1931 (868) 99,0 %; SGI2010 (596 und 579 sind zwei identische Einreichungen, genommen wird 596) 98,9 %;
SGI1973 (599) 97,0 % (GLIMS führt 1 286 statt 1 311 km² — ein paar Teilflächen fehlen); SGI1850 liegt in zwei Einreichungen (594 + 595, zusammen 96,2 %, 1 829 statt 1 788 km²).

## Gletscher aus Teilflächen

GLIMS führt die Inventare als **Teilflächen** (SGI2016: 1 834 Teilflächen der 1 400 SGI-Gletscher); die SGI-Nummer, die Höhen, die Exposition und das Einzugsgebiet gehören zu den
GLAMOS-Dateien und stehen in GLIMS nicht. Der Build bildet deshalb **eigene Gletscher** (`scripts/glacier/py/glims_inv.py`): Teilflächen gleichen Namens im Abstand ≤ 500 m, namenlose im Abstand
≤ 20 m. Geprüft gegen die 1 400 SGI-Gletscher (`audit/gletscher/glims-entities.py`, die GLAMOS-Datei ist dort **Orakel**, nie Eingabe): 1 396 Gletscher statt 1 400, **96,4 % exakt wie im SGI**,
18 Gletscher fälschlich zusammengelegt, 14 fälschlich geteilt; die Flächensumme ist bis auf 0,02 % gleich. Höhen kommen aus dem Copernicus DEM, die Region aus der Lage (fünf Teilgebiete, `GLACIER_REGIONS`).
