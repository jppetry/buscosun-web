# GM-11 Schritt 1.5 e — Hindcast-Prüfung, Stufe B: Entwurf der Regel (NICHT eingefroren)

Stand 25.11.2026, Entwurf zur Prüfung durch Jan. Vor einem gewerteten Lauf wird dieser Text (nach Jans Wort, mit den Zahlen aus Stufe A)
eingefroren und mit sha256 versehen. Bis dahin ist nichts gerechnet.

## Frage

Wie groß ist der Fehler der Winterbilanz, wenn das Schneemodell mit dem Antrieb rechnet, den das Produkt wirklich benutzt
(buscosun Fusion über den Punkt-Cube), statt mit dem Stationsantrieb der Eichung (SwissMetNet/GeoSphere-Station + RhiresD/INCA)?

## Was verglichen wird (alles gleich außer dem Antrieb)

- **Gletscher:** die Eichgletscher, deren Fläche in Zellen des Hindcast-Speichers liegt (Liste aus Stufe A a), Schweiz und Österreich getrennt.
- **Winter:** die im Hindcast vollständigen Winter (Stufe A a: 2023/24, 2024/25, soweit t1 lückenlos), Fenster der Wahrheit (Beginn- bis
  Mitteldatum der Messung) unverändert.
- **Wahrheit:** Winterbilanz je Höhenstufe (GLAMOS Release 2026, WGMS FoG 2026-02-10); Punktmessungen (GLAMOS Punkte, WGMS, PANGAEA) als
  zweite Wahrheit, getrennt berichtet.
- **Kern und Parameter:** derselbe Kern (`simulate`, Schmelze `eti`, TF/SRF), dieselbe Dichte, **derselbe Faktor** je Grundlage (Landeswert,
  eigener Faktor, eigener Faktor + Form) wie in der Eichung — kein Nachfit.
- **Antrieb S (Station):** wie GM-3/GM-5b.
- **Antrieb H (Hindcast):** die Laufzeit-Hälfte von buscosun Fusion über die gespeicherten Slots, je Gletscher an Zunge, Medianhöhe und
  Oberkante wie `melt.mjs` (flaches Gelände in der jeweiligen Höhe), je Stunde aus dem jüngsten Slot davor (wie die Schneedecke nachspielt).
  Was dem Hindcast gegen Fusion 14 fehlt (RUC-Member, dichte Messungen), steht in Stufe A b und wird als Abweichung benannt.

## Wie der Fehler aufgeteilt wird (je Gletscherwinter, mm w. e., `s3` mit Vorzeichen)

Vier Läufe, die je genau eine Größe von S nach H tauschen:

1. **Niederschlag:** H-Niederschlag, sonst S (Temperatur, Strahlung).
2. **Phase:** H-Niederschlag mit dem Schneeanteil von buscosun Fusion (Regel des Betriebs) statt der Temperaturrampe des Kerns auf
   S-Temperatur.
3. **Temperatur/Schmelze:** H-Temperatur (und H-Strahlung, wenn vorhanden), sonst S.
4. **Alles H.**

Anteil einer Größe = Fehländerung ihres Laufs gegen S; Rest = Wechselwirkung (Lauf 4 minus Summe 1–3), benannt, nicht verteilt.
**Faktor:** derselbe Lauf 4 mit dem Faktor, der die Winterbilanz an diesen Wintern genau trifft (`k*`, nur berichtet, nicht benutzt) — das
Verhältnis k*_H / k*_S misst, wie viel des Faktors den Antrieb ersetzt (die „Brücke“, heute `bridge.value = 1`, `set`).
**Setzung:** nicht im Fehler der Winterbilanz (Wasserwert); getrennt an den Punktmessungen mit Schneehöhe und an den Langreihen (Stufe A d).

## Was „der Antrieb ist der Hauptfehler“ hieße

Vorschlag (Grenzen `set`, von Jan zu bestätigen):

- `s2` von Lauf 4 ist **mindestens 25 % größer** als `s2` von S (gleiche Winter, gleicher Faktor), mit p10 der Bootstrap-Differenz
  (Gletscher mit Zurücklegen, 1 000 Ziehungen) > 0, **und**
- der Niederschlagslauf (1) trägt mindestens die Hälfte dieser Zunahme, **und**
- k*_H / k*_S liegt außerhalb 0,8 … 1,25 (die Brücke ist nicht 1).

Gilt keines: „der Antrieb ist nicht der Hauptfehler an diesen Gletschern und Wintern“ — dann bleiben Faktor und Kern (Setzung, Dichte) die
Kandidaten, zu prüfen an den Langreihen (Stufe A d). Negativkontrolle: Lauf 4 mit dem S-Antrieb, durch denselben Weg geschickt (Slots
durch die Stationswerte ersetzt), muss S Byte für Byte treffen.

## Was offen ist

- Liste der Gletscher und Winter (Stufe A a), Laufzeit und Speicher (Stufe A b).
- Ob der Hindcast eine Fusion-Version trägt, die nahe genug an 14 ist; wenn nicht, wird der Stand benannt, mit dem gerechnet wird.
