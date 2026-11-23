# GM-3 — Nachtrag 1 zur eingefrorenen Methode (explorativ, NACH dem ersten gewerteten Lauf)

Stand 22.11.2026, geschrieben nach dem ersten gewerteten Lauf von Teil A (Bericht `gm3-report-A.json`, Methode `cf4c001b…`) und vor jeder Rechnung
dieses Nachtrags. Der Nachtrag ändert **weder die Auswahl noch das Urteil** von Teil A: Stellung, Tabelle und K-1 … K-4 bleiben die des ersten Laufs.
Alles hier ist im Wissen um dessen Ergebnis gewählt und trägt deshalb das Wort „explorativ“; eine Zahl aus diesem Nachtrag geht nur mit Jans Entscheidung
und einer neuen eingefrorenen Regel in eine Tabelle.

Anlass: K-2 und K-4 sind rot; die Empfindlichkeit S1 zeigt, dass Vorzeichen und Größe der Steigung am Gradtagfaktor der Winterschmelze hängen; die
Gegenprobe E vergleicht die Gesamtsteigung der Punktmessungen mit der Rest-Steigung des Niederschlags, also zwei verschiedene Größen.

## N1-0 Fehlerkorrektur (keine Methodenänderung)

`snowcal-fit.mjs` verglich in Teil E die Punktsteigung als Anteil je 100 m mit der Steigung aus A in Prozent je 100 m. Beide stehen jetzt als Anteil
je 100 m. Das Ergebnis der Gegenprobe („Widerspruch“, entgegengesetztes Vorzeichen) ändert sich dadurch nicht. Der Bericht des ersten Laufs liegt
unverändert als `gm3-report-A-run1.json` daneben.

## N1-a Faktor je Gletscher

Für jeden Gletscher mit mindestens vier nutzbaren Wintern: `F` allein aus den **anderen** Wintern desselben Gletschers (ein Winter ausgelassen), Steigung
fest auf dem Wert der gewählten Stellung. Kennzahlen s1 und s2 des ausgelassenen Winters, daneben dieselben Winter mit dem Landeswert aus dem LGO des
ersten Laufs. Frage: Wie viel des Fehlers ist eine feste Eigenschaft des Gletschers (Lage, Wind, Lawinen), die ein Faktor je Gletscher oder eine Kopplung
an Messungen (GM-4) abnehmen kann?

## N1-b Gesamtsteigung statt Rest-Steigung

Je Gletscherwinter eine flächengewichtete Gerade Winterbilanz gegen Höhe über die Stufen, relative Steigung = Steigung / Mittel, je 100 m — einmal aus der
Wahrheit, einmal aus dem Modell mit den Parametern des Voll-Fits der gewählten Stellung, einmal aus dem Modell ohne Verlauf (`g = 0`, `F` der Stellung
P0). Berichtet: Median und p10–p90 der drei, daneben der Median der Punktmessungen aus E. Nur Gletscherwinter mit mindestens 300 m Höhenspanne und
positivem Mittel.

## N1-c Winterschmelze frei

Die gewählte Stellung (P1, `F` je Land, Steigung gemeinsam), dieselbe ohne Verlauf (P0) und P3, je mit dem Gradtagfaktor × 0 / 0,25 / 0,5 / 0,75 (× 1 und
× 1,5 liegen aus dem ersten Lauf und S1 vor). Je Stellung und Faktor: Voll-Fit, LGO-s1, -s2, -s3 je Land, -s4. Kein Faktor wird hier „gewählt“.

## Was daraus folgen darf

Eine Empfehlung an Jan, ob (1) die Tabelle ohne Verlauf (`g = 0`, Herkunft `set`) statt mit der gemessenen, aber nicht belastbaren Steigung in den
Producer gehen soll, (2) ein Faktor je Gletscher für die vermessenen Gletscher gebaut wird, (3) die Winterschmelze in einer neuen eingefrorenen Runde
mitgeeicht und am Winter 2025/26 geprüft wird.
