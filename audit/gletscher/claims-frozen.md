# Phase GL — eingefrorene Kriterien für Gate B1 und Gate C

Eingefroren am **11.10.2026**, **vor** der Rückrechnung 2025/2026 (Gate B1) und vor jedem Hold-out der Eichung (Gate C).
Der sha256 dieser Datei steht in `audit/gletscher.md` §3 und in `audit/gletscher/claims-frozen.sha256`. Eine spätere
Änderung dieser Datei ist ein Befund (V-GL-…), kein Update: die Kriterien werden nicht nach Sicht der Daten verschoben.

Regeln (Plan §5 Punkt 12): Schwellen sind nur **strenger** als die Richtwerte des Plans §11; jedes Kriterium hat eine
Basislinie; die Kriterien sind so formuliert, dass sie rot werden können. „Wahrheit“ ist je Kriterium genannt und
ausdrücklich getrennt von dem, was ein Satellit oder Modell selbst liefert.

## Datenlage, auf die sich die Kriterien stützen (am 11.10.2026 gemessen)

- GLAMOS Massenbilanz (Release 2025, DOI-Seiten: CC BY 4.0): Beobachtungsperiode je Gletscher und Jahr mit Winterbilanz Bw,
  Sommerbilanz Bs, Gleichgewichtslinie ELA, AAR, Fläche; dazu Höhenband-Bilanzen. Gletscher mit Messung im Ende-Jahr 2023 /
  2024 / 2025: **29 / 28 / 27** (davon ≥ 1 km²: 20 / 20 / 19). Jahr 2026 ist **nicht** veröffentlicht.
- TSLA (Zenodo 18223929, CC BY 4.0): End-of-Summer-Schneegrenze 2000–2025 je Gletscher > 1 km² (ein Satellitenprodukt, keine
  unabhängige Wahrheit — nur Konsistenzprüfung).
- Hindcast-Wahrheit (`C:\dev\buscosun-hindcast\truth`): stündlich, 24 Bergstationen ≥ 1 800 m, ab 24.05.2023;
  Größen t, td, rh, ff, dd, fx, rr, n, p — **keine Globalstrahlung**.

## Gate B1 — Satellit plausibel (blockiert GL-3)

| Nr. | Kriterium | Wahrheit / Vergleich | Schwelle |
| --- | --- | --- | --- |
| B1-1 | Endsaison-Schneegrenze gegen gemessene Gleichgewichtslinie | GLAMOS ELA, Gletscher mit AAR 5…95 % (ELA liegt auf dem Gletscher), Jahre 2023, 2024, 2025; Endsaison-Schneegrenze = Median der gültigen Szenen 25.08.–10.10. (mind. 2 Szenen, sonst Fall nicht gezählt) | **Median \|Δ\| ≤ 150 m** und **P90 \|Δ\| ≤ 400 m**, mindestens **12** gezählte Gletscherjahre |
| B1-2 | besser als die Basislinie „Klimatologie“ | Basislinie: Mittel der TSLA-End-of-Summer-Schneegrenze 2000–2022 je Gletscher (nur Gletscher in TSLA) als Schätzer für 2023–2025 | Median \|Δ\| der eigenen Schätzung **kleiner** als der Median \|Δ\| der Basislinie, an denselben Gletscherjahren |
| B1-3 | Konsistenz mit TSLA 2025 | TSLA EoS 2025 je Gletscher > 1 km² gegen die eigene Endsaison-Schneegrenze 2025 | **Median \|Δ\| ≤ 150 m** (Konsistenz, keine Wahrheit) |
| B1-4 | Vollständigkeit der Rückrechnung | alle Klasse-A- und Klasse-B-Gletscher, Juni–Oktober 2025 und 2026, alle STAC-Szenen | **≥ 90 %** der Klasse-A-Gletscher haben je Saison 2025 und 2026 mindestens eine gültige Szene (≥ 70 % klar) im Fenster 20.08.–10.10.; jede Quarantäne hat einen benannten Grund im Bericht |
| B1-5 | keine Unmöglichkeiten | Schneegrenze außerhalb [Gletscher-min − 300 m, Gletscher-max + 300 m]; AAR ∉ [0, 1]; Schneeanteil in der Maske > 100 % | **0** unquarantänierte Ausreißer |
| B1-6 | Maskenregel an Bildern bestätigt | Hintereisferner: je eine klare, eine bewölkte, eine Neuschnee-, eine schneebedeckte Szene mit Sen2Cor-Fehlwolke und eine Oktoberszene mit Geländeschatten als gespeicherte Fixtures mit Prüfsumme | Regel entscheidet jede der sechs Szenen wie in `audit/gletscher.md` §4 begründet (Fixture-Verifier grün) |

Hinweis zur Vergleichbarkeit: ELA (glaziologisch, am Jahresende) und Schneegrenze der Szene (Zustand am Aufnahmetag) sind
verwandt, nicht gleich. Der Bericht nennt den Medianversatz (Bias) getrennt von der Streuung; die Schwelle gilt für
\|Δ\|, nicht für die Streuung allein.

## Gate C — Eichung grün (blockiert die Anzeige mit Einheit)

Basislinie **BL-C**: Gradtagmodell, Temperatur der nächsten Bergstation übertragen mit der **Standard-Lapse** −6,5 K/km auf die
Bandmitte, M = DDF · max(T, 0) stündlich, ein einziger Faktor je Oberfläche (Schnee/Eis, Eis = 1,6 × Schnee), gefittet auf
denselben Fit-Daten wie das ETI-Modell.

Fall-Gruppen (die Schwelle gilt für **jede** Gruppe einzeln, nicht für das Mittel über alle):

- **LYO** leave-year-out: Fit auf zwei der Sommer {2023 (ab 24.05. — die Wahrheit beginnt dort, Anfang der Periode fehlt,
  benannt), 2024, 2025}, Test auf dem dritten.
- **LGO** leave-glacier-out: Fit auf allen Gletschern außer einem (bzw. einer Gruppe nach Region), Test auf dem
  ausgelassenen; nur Gletscher mit einer Wahrheitsstation ≤ 30 km und |Δh| ≤ 1 800 m zur Gletschermitte.
- **HEF** Hintereisferner 2024/25 (UIBK: Sommerbilanz −2 595 mm w. e.), Parameter ohne diesen Fall gefittet.

| Nr. | Kriterium | Schwelle |
| --- | --- | --- |
| C-1 | Sommerbilanz je Gletscher und Jahr (glacier-wide, GLAMOS Bs): mittlerer absoluter Fehler je Fall-Gruppe | **MAE ≤ 0,30 m w. e.** in LYO und in LGO |
| C-2 | gegen die Basislinie | ETI-MAE **≤ 0,90 ×** BL-C-MAE in LYO und in LGO |
| C-3 | Verzerrung | \|mittlerer Fehler\| **≤ 0,15 m w. e.** in LYO und LGO |
| C-4 | Hintereisferner 2024/25 | \|Fehler der Sommerbilanz\| **≤ 0,40 m w. e.** |
| C-5 | Winterbilanz / Niederschlagsfaktor | MAE der Winterbilanz (GLAMOS Bw, glacier-wide) in LYO **≤ 0,35 m w. e.** und **besser** als „Niederschlag von buscosun Fusion ohne Faktor“ |
| C-6 | Band-Ebene (Information, kein Gate) | MAE je Höhenband der Sommerbilanz mit Basislinie im Bericht; fällt sie über 0,50 m w. e., wird es als V-Eintrag benannt |
| C-7 | Prognose-Hindcast (Vorhersage statt Messung als Antrieb), je Vorlauf-Bin 0–48 h, 49–120 h, 121–240 h, 241–336 h | die Anzeige mit Einheit ist **nur für Bins erlaubt**, in denen die mediane relative Abweichung der Tagesschmelze gegen die messungsgetriebene Referenz **≤ 35 %** und \|Bias\| **≤ 20 %** ist; sonst erscheint in diesem Bin der Schmelzindex ohne Einheit |

Ist C-1, C-2 oder C-3 in LYO oder LGO verletzt, ist **Gate C rot**: das Feature zeigt nur den **Schmelzindex ohne Einheit**
(Plan §8). Ist nur C-4/C-5 verletzt, wird der betroffene Teil (HEF-Aussage bzw. Neuschnee/Schneewasser) gesperrt und benannt.

## Grenzen der Prüfung (vorab benannt)

- 2025/26 (Hold-out des Plans) ist bei GLAMOS noch nicht veröffentlicht ⇒ Ersatz durch LYO über 2023–2025; die Live-Bestätigung ist Gate E (Sommer 2027).
- Der Sommer 2023 hat Wahrheit erst ab 24.05.2023; die Periode beginnt bei GLAMOS im Spätsommer/Herbst des Vorjahres bis Sept. —
  die Sommerbilanz-Periode (Frühjahr bis Herbst) ist ab Ende Mai abgedeckt, ein Rest vor dem 24.05. wird mit Klimatologie ergänzt und benannt.
- Hindcast-Wahrheit trägt keine Globalstrahlung: die Strahlung ist Modell (Klarhimmel × Bewölkungsfaktor) auch in der Eichung; sie wird an SwissMetNet-Globalstrahlung (Jungfraujoch u. a.) einzeln geprüft (kein Gate).
