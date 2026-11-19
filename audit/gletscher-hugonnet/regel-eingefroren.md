# Phase GH — eingefrorene Regeln (vor dem ersten Zuordnungslauf, 19.11.2026)

Geschrieben, bevor eine Zuordnung Katalog ↔ Tabelle gezählt wurde. Bekannt waren nur: 3 927 Gletscher in der Tabelle,
515 davon ohne Wert, 1 698 von 2 199 Katalog-Gletschern mit einer RGI-Nummer aus der GloGEM-Brücke, 42 RGI-Nummern von
mehr als einem Katalog-Gletscher genannt.

## R1 Brücke
Dieselbe Geometrie wie die GloGEM-Brücke (`build_static.py` Schritt 4): Umriss des Katalog-Gletschers (Inventar des Builds
`20261012-1`) gegen die RGI-6-Umrisse der Region 11 (`11_rgi62_CentralEurope`), beide in EPSG:3035. Je Paar (G, R) mit
Schnittfläche > 0: `aG = |G∩R| / |G|`, `aR = |G∩R| / |R|`. Kein Name, kein Abstand.

## R2 Zuordnung (1 : 1 oder gar nicht)
G bekommt die Zeile von R genau dann, wenn
1. R unter allen RGI-Gletschern die größte Schnittfläche mit G hat,
2. G unter allen Katalog-Gletschern die größte Schnittfläche mit R hat,
3. `aG ≥ 0,5` und `aR ≥ 0,5` (`GLACIER_MATCH_MIN_OVERLAP` des Vertrags: mindestens die Hälfte BEIDER Flächen).
Sonst: keine Zuordnung, mit Grund (`no-rgi` kein RGI-Umriss schneidet · `not-mutual` R gehört mehrheitlich einem anderen
Gletscher · `part-of-rgi` aR < 0,5: G ist nur ein Teil des RGI-Gletschers · `several-rgi` aG < 0,5: G liegt über mehreren
RGI-Gletschern · `no-value` die Tabelle trägt für 2000–2019 keinen Wert). Werte mehrerer RGI-Gletscher werden nie gemittelt
oder gewichtet (das wäre eine eigene Ableitung samt eigener Unsicherheit).

## R3 Werte
Aus `dh_11_rgi60_pergla_rates.csv` nur die Spalten `dhdt` und `err_dhdt` (m pro Jahr, 1 σ), unverändert (vier Nachkommastellen
wie in der Tabelle), für die Zeilen `2000-01-01_2020-01-01`, `2000-01-01_2005-01-01`, `2005-01-01_2010-01-01`,
`2010-01-01_2015-01-01`, `2015-01-01_2020-01-01`; dazu `area` (Fläche des RGI-Umrisses, auf den sich der Wert bezieht).
Keine Dichteumrechnung, keine Masse, kein Volumen, keine Hochrechnung über 2019 hinaus. Ein Fünfjahreswert ohne Zahl bleibt
`null`; fehlt der Wert 2000–2019, gibt es keinen Block.

## R4 Anzeige
`err ≥ |Wert|` ⇒ nur die Spanne `Wert − err … Wert + err`, kein Vorzeichen-Satz, keine gefüllte Säule. Sonst Wert mit `± err`.
Eine Nachkommastelle; zwei, wenn die Unsicherheit unter 0,05 m pro Jahr liegt.
