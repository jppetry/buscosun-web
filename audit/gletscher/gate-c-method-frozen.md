# Phase GL — eingefrorene Methode der Eichung für Gate C

Eingefroren am **11.10.2026**, **vor** dem ersten Fit und vor jeder Rückrechnung gegen GLAMOS. Ergänzt `claims-frozen.md` (Schwellen C-1 … C-7, sha256 in `audit/gletscher.md` §3):
diese Datei legt fest, **welches Modell, mit welchen Eingaben und welcher Prozedur** gegen die Schwellen geprüft wird. Eine Änderung nach dem ersten Fit ist ein Befund (V-GL-…) mit Begründung,
kein stilles Update; Fehlerkorrekturen im Code (kein Methodenwechsel) werden mit dem Fund benannt.

## Wahrheit

GLAMOS Massenbilanz, **feste Termine** (`massbalance_fixdate.csv`: Winterbilanz Bw = 1. Okt. bis 30. Apr., Sommerbilanz Bs = 1. Mai bis 30. Sept., glacier-wide, mm w. e.), Jahre **2023, 2024, 2025**, alle Gletscher der
Vergleichsmenge (`b1/truth.json`, Klasse A und B, 26 Gletscher), die eine Eingangsstation im Sinn der Stationsregel haben. Der Sommer 2023 ist mit SwissMetNet vollständig abgedeckt (die Hindcast-Wahrheit ab 24.05.2023
wird für die Eichung nicht gebraucht — Abweichung vom Entwurf in `claims-frozen.md`, zugunsten der Vollständigkeit). Hintereisferner 2024/25: UIBK, Sommerbilanz −2 595 mm w. e., Jahresbilanz −1 793 mm w. e.

## Eingaben (gemessen)

MeteoSwiss OGD SwissMetNet, stündlich (CC BY 4.0, „Quelle: MeteoSchweiz“): `tre200h0` (2-m-Temperatur), `rre150h0` (Niederschlag), `gre000h0` (Globalstrahlung, W m⁻²), 01.10.2022 – 01.10.2025.
**Stationsregel (zwei Rollen):** Temperatur und Globalstrahlung von der nächsten Station ≤ 30 km und |Δh| ≤ 1 800 m zur mittleren Höhe des Gletschers, die beide ≥ 90 % bzw. 80 % der Stunden meldet; Niederschlag von der nächsten Station unter denselben
Grenzen, die ≥ 80 % der Stunden meldet (die Hochstationen Jungfraujoch, Gornergrat, Corvatsch u. a. messen keinen Niederschlag). Lücken: Temperatur und Strahlung bis 3 h linear, sonst Stunde ohne Wert (Schmelze 0 für diese Stunde und gezählt);
Niederschlag: Lücke = 0 mm (gezählt). Ein Gletscherjahr mit mehr als 15 % Lücken in Temperatur oder Strahlung im Sommer wird nicht gezählt.
Hintereisferner: GeoSphere Austria, Station Obergurgl (11127) bzw. nächste mit Temperatur, Niederschlag und Globalstrahlung.

## Modell (Enhanced Temperature Index, Pellicciotti et al. 2005), je 50-m-Band

Bänder aus `hypso/<region>.json` (Fläche je Band aus Copernicus DEM und Umriss des Inventars); Gewicht = Bandfläche / Gletscherfläche.

| Baustein | Festlegung | Herkunft |
| --- | --- | --- |
| Temperatur im Band | T_st + Γ · (z_Band − z_Station), Γ = −6,5 K/km | Literatur (Standard) |
| Temperatur über dem Eis | T_Eis = T_Band für T ≤ 0, sonst 0,85 · T_Band (a = 0) | Literatur (Gletscherwind; Shea & Moore 2010 Größenordnung) |
| Schmelze | M = TF · T_Eis + SRF · (1 − α) · G für T_Eis > T_T, sonst 0 (mm w. e. je Stunde) | Pellicciotti |
| Schwelle | T_T = 1,0 °C | Literatur |
| Strahlung im Band | G der Station (horizontal, gemessen), ohne Höhen-, Hang- oder Horizontkorrektur | `set` |
| Niederschlag im Band | pf · P_Station · (1 + 0,04 · (z_Band − z_Niederschlagsstation) / 100 m) | pf geeicht, 4 %/100 m `set` |
| Phase | fester Anteil = clip((2 − T_Band)/2, 0, 1) | `set` |
| Schneedecke | SWE je Band; wächst um den festen Niederschlag, schrumpft um die Schmelze; Regen wird nicht gespeichert | Modell |
| Albedo Schnee | α = α_alt + (0,85 − α_alt) · min(1, S/5 mm) bei Schneefall S (fest, mm je Stunde), sonst α → 0,55 mit e-Faltung 6 Tage; gilt bei SWE > 5 mm | Literatur (Oerlemans & Knap) |
| Albedo ohne Schnee | 0,30 (Eis) unter, 0,50 (Firn) über der mittleren GLAMOS-Gleichgewichtslinie des Gletschers der Jahre vor 2023 (ohne Daten: mittlere Höhe) | Literatur / GLAMOS-Vorjahre |
| Bilanz | Bw = Σ_Band Gewicht · SWE(30.04.) ; Bs = Σ_Band Gewicht · (fester Sommerniederschlag − Schmelze) (1. Mai – 30. Sept.), Schmelze verbraucht erst die Schneedecke, dann Eis | Modell |

## Eichung

- **Parameter:** pf ∈ [0,5; 4] (1 Parameter, aus der Winterbilanz), TF ∈ [0,002; 0,06] mm h⁻¹ K⁻¹ und SRF ∈ [0; 0,04] mm h⁻¹ (W m⁻²)⁻¹ (aus der Sommerbilanz). Alles andere fest (Tabelle).
- **Reihenfolge (Plan: Niederschlagsfehler dürfen nicht in die Schmelzparameter wandern):** (1) pf minimiert die Summe der Quadrate Bw_Modell − Bw_GLAMOS, wobei das Modell im Winter nur sammelt (Winterschmelze vernachlässigt), eindimensional (Goldener Schnitt);
  (2) mit diesem pf minimieren TF und SRF die Summe der Quadrate Bs_Modell − Bs_GLAMOS (Nelder–Mead, Start (0,02; 0,01), 3 Neustarts, Grenzen durch Abbildung).
- **Basislinie BL-C:** M = DDF · max(T_Band, 0), T_Band mit Standard-Lapse ohne Dämpfung, DDF(Eis) = 1,6 · DDF(Schnee), ein Faktor DDF, gleiche Schneedecke, gleiches pf, geeicht an denselben Daten.
- **Fall-Gruppen:** **LYO** (Fit auf zwei Jahre, Test auf dem dritten, drei Läufe), **LGO** (Fit auf allen übrigen Gletschern, Test auf dem ausgelassenen, ein Lauf je Gletscher), **HEF** (Fit auf allen 26 Gletschern der Menge, Anwendung auf den Hintereisferner 2024/25).
- **Kennzahlen** je Gruppe über alle Testfälle: MAE, mittlerer Fehler (Bias), Anzahl; C-1 … C-5 wie in `claims-frozen.md`. Bw wird nur in LYO bewertet (zwei Jahre, 2024 und 2025, wenn 2023 wegen fehlender Eingaben entfällt; sonst drei).
- **Rot heißt:** Gate C ist rot, das Feature zeigt nur den Schmelzindex ohne Einheit. Es wird nicht nachgestellt.

## Prognose-Prüfung (C-7) — Umfang

Antrieb aus der Vorhersage statt der Messung ist nur dort prüfbar, wo Hindcast-Slots mit der Kette des Gletscher-Jobs zusammengebracht werden können. Wenn der Lauf der Kette über das Hindcast-Archiv an den Stationspunkten nicht in dieser Session
gelingt, gilt C-7 als **nicht belegt** und die Anzeige mit Einheit bleibt für **alle** Vorlauf-Bins gesperrt (nur der Schmelzindex). Das ist die vorsichtige Lesart der Plan-Regel und wird so ausgewiesen.
