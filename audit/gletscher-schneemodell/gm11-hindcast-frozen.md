# GM-11 Phase 1b — Hindcast-Prüfung, Stufe A gerechnet: eingefrorene Regel

Eingefroren am 26.11.2026 vor dem ersten gewerteten Lauf (sha256 in `gm11-hindcast-frozen.sha256`, über den Text mit LF). Grundlage:
`gm11-hindcast-plan-draft.md` mit Jans Entscheidungen vom 26.11. Das Urteil rechnet `gm11-hindcast.mjs`, das den Hash prüft.

## Frage

Wie gut ist dasselbe Schneemodell mit dem Antrieb, den buscosun Fusion geliefert hätte (H), gegen den Stationsantrieb der Eichung (S) — und
müsste der Faktor im Betrieb ein anderer sein?

## Stichprobe

- Gletscher: Grosser Aletsch (B36-26), Basòdino (C14-10), Murtèl (E23-16), Rhone (B43-03), Corvatsch (E23-18), Findelen (B56-03) — die sechs
  Schweizer Eichgletscher mit gespeicherter Hindcast-Zelle ≤ 3 km (§3q.5 a). Jeder wird einzeln berichtet. Sechs Gletscher sind eine
  Stichprobe, keine Eichung: aus dieser Prüfung kommt keine Tabelle für den Runner.
- Winter: 2023/24, 2024/25, 2025/26; Fenster der Wahrheit unverändert (01.10. bis 30.04. + 24 h).
- **2024/25 liegt im Tresor des Prüfstands:** nur gemessen, nichts daran angepasst, nichts geschrieben, was der Prüfstand liest.
- **2025/26 wurde einmal mit Antrieb S gesehen (§3q.4);** das steht an jeder Stelle, an der der Winter erscheint. Außerdem liegt
  2025/26 im Fit-Zeitraum der Lernstufe (Fit 5e, Hindcast 01.09.2025–21.09.2026): für H ist dieser Winter nicht ungesehen.

## Antriebe

- **S:** Station + RhiresD genau wie in der Eichung und §3q.4 (`loadWinters` + `attachRadiation`; 2024 und 2025 aus dem Cache von GM-3,
  2026 aus `gm11\w26`).
- **H:** Hindcast-Slots durch `fuseCubePoint` des Stands **`fusion-12x` (= buscosun Fusion 13; Commit `2d0eb64e`, Worktree des
  Prüfstands)** — der höchste Stand, den der Hindcast trägt: Fusion 14 braucht RUC, das im Hindcast fehlt; ohne Messungen ist 13 auf dem
  Hindcast die Kette ohne Anker, ohne Stationsprodukt, ohne Radar. Stufe t1 („Tag 0“), Slot 00 UTC je Tag, Aufruf je 3-h-Block mit
  `nowMs` = Blockbeginn (Vorlauf 0–2 h). Eingang: Reihe des Archivpunkts des Gletschers (dessen 2 × 2-Block), Ort und Höhe des
  Gletschers, flaches Gelände in der Höhe wie `melt.mjs` (`flatTerrain`), an Zunge, Median und Oberkante.
- Aus H in den Kern, wie `melt.mjs` (`forcingFromForecast`, `meltOfForcing`): Temperatur und Niederschlag (Mittel der Verteilung) an der
  Medianhöhe, `zT = zP = zMed`; Strahlung = klarer Himmel × Wolkenfaktor (Kasten & Czeplak) aus der Bewölkung an der Medianhöhe;
  kurze Lücken gefüllt wie dort (Temperatur und Wolken 6 h, Niederschlag 3 h).

## Kern und Faktor

Derselbe Kern (`simulate`, Schmelze `eti`, TF/SRF aus `melt-calibration.json`, `pGrad` 0), derselbe Faktor je Grundlage auf beiden
Seiten: Landeswert, eigener Faktor, eigener Faktor + Form, vorhergesagt (Form C). Kein Nachfit. **Hauptgrundlage des Urteils: eigener
Faktor** (so rechnet der Betrieb an diesen Gletschern); die übrigen werden mit demselben Urteil berichtet.

Für die Tauschläufe trennt eine Kopie von `simulate` im Werkzeug die Temperatur der Phase von der Temperatur der Schmelze. Sie muss
ohne Trennung `simulate` an jedem Gletscherwinter, jeder Grundlage und jedem Band **bitgleich** treffen (Kontrolle A).

## Läufe je Gletscherwinter und Grundlage

S; L1 Niederschlag (Menge aus H, Phase und Schmelze aus S); L2 Niederschlag + Phase (Menge aus H, Schneeanteil aus der Rampe des Kerns
auf der H-Temperatur — die Regel des Betriebs, `WEATHER_PHASE_DEFAULT = temperature`; Schmelze aus S); L3 Temperatur/Schmelze
(Temperatur und Strahlung der Schmelze aus H, Menge und Phase aus S); L4 alles H. Anteile am Fehler (je `s3` und `s2`): Niederschlag =
L1 − S, Phase = L2 − L1, Schmelze = L3 − S, Wechselwirkung = L4 − S − (Summe der drei). Zusatz, nur berichtet: L2b mit `pSnow` von buscosun
Fusion (in z linear zwischen den drei Höhen) statt der Rampe.

`k*` = der für alle Bänder gleiche Faktor, mit dem die gletscherweite Winterbilanz genau getroffen wird (Halbierung in 0,2 … 8),
mit S und mit H; berichtet wird k*_H / k*_S je Gletscher und Winter — nicht benutzt.

## Urteil (je Grundlage, je Winter und über alle drei Winter)

Mittel `s2` über die Gletscherwinter; Bootstrap: Gletscher mit Zurücklegen, 1 000 Ziehungen, Seed 2026, Statistik = Mittel von
(s2_H − s2_S) über die gezogenen Gletscherwinter.

- **„Der Antrieb ist der Hauptfehler“**, wenn alle drei gelten: (1) s2_H ≥ 1,25 · s2_S und p10 der Bootstrap-Differenz > 0;
  (2) der Niederschlagslauf trägt mindestens die Hälfte der Zunahme: mittel(s2_L1 − s2_S) ≥ 0,5 · mittel(s2_H − s2_S);
  (3) der Median von k*_H / k*_S liegt außerhalb 0,8 … 1,25.
- **„Der Antrieb ist besser“** (Spiegelfall), wenn s2_H ≤ 0,75 · s2_S und p90 der Bootstrap-Differenz < 0.
- Sonst: **„weder noch“**; ist nur (1) erfüllt, wird es so benannt („H schlechter, aber nicht über den Niederschlag/Faktor“).

## Negativkontrolle (Pflicht, sonst STOPP)

Der S-Antrieb, durch denselben Weg geschickt wie H (Bau des Datensatzes aus Reihen, Kopie des Kerns, Wertung), trifft S **Byte für Byte**
(`s3`, `s2` und Bandbilanzen aller Gletscherwinter und Grundlagen, Vergleich mit `Object.is`).

## Zusätze, ohne Anpassung

- Niederschlag H gegen RhiresD am Gletscher, Wintersumme und je Monat; Schneeanteil; Schneefallgrenze (Höhe der 50-%-Stelle der Rampe in
  nassen Stunden ≥ 0,1 mm/h); Modellhöhe gegen Gletscherhöhe je Quelle (V-GM-148).
- Punktmessungen GLAMOS Release 2026 (bisher nie benutzt) an den sechs Gletschern: Winterpunkte (Datum im Oktober … Mai der drei Winter),
  Modell = Bilanz eines Bands in Punkthöhe vom 01.10. bis zum Messtag 12 UTC mit eigenem Faktor, S und H; Fehler je 250-m-Höhenstufe.
  Punkte nach dem Ende eines Antriebs werden gezählt und weggelassen. Nichts daran angepasst.
- Weissfluhjoch (Messfeld 5WJ0, 2 536 m): Schneekern (`stepLevel`/`stepPack`, Konstanten des Betriebs über `snowCoreSetup`) ohne Faktor,
  Eingang gemessener Wasserwert des Neuschnees (`HNW_1D`, gleichmäßig über die 24 h vor 06 UTC), Temperatur und Strahlung SwissMetNet WFJ
  (2 691 m, auf 2 536 m mit −6,5 K/km); Start leer am 01.10.; Wahrheit `HS` 06 UTC, Winter 2012–2026 (Oktober … Juni). Fehler der
  Schneehöhe je Monat; Setzung: Tage mit `HN_1D` ≥ 10 cm und danach drei Tagen mit `HN_1D` < 1 cm, Änderung der Schneehöhe über diese drei
  Tage, Modell gegen Messung. Dann dasselbe mit H (Archivpunkt 06780, flach auf 2 536 m, Menge × Rampe der H-Temperatur, Faktor 1) für die
  drei Winter. Ein Winter mit fehlendem `HNW_1D` an mehr als 10 % der Schneefalltage wird nicht gewertet. Sonnblick und Zugspitze: nicht in
  dieser Runde.

## Veröffentlichung

Im Repo stehen Werkzeuge, diese Regel und ein Bericht ohne gemessene Werte je Gletscherwinter über das hinaus, was unsere Tabellen schon
zeigen (E-GL-17): keine gemessene Bilanz, keine Modellbilanz (aus ihr und dem Fehler folgte die Messung), keine Punktwerte. Alles andere im
Cache `C:\dev\buscosun-glacier-cache\gm11\hindcast\`. Quellen: GLAMOS Release 2026 (Winterbilanzen und Punkte), MeteoSchweiz, SLF, Open-Meteo
und dynamical.org über den Hindcast (CC BY 4.0).
