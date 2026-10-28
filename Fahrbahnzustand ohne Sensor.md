# Fahrbahnzustand ohne Sensor: physikalisch rechnen, statistisch korrigieren

## Kurzfazit

**Bauempfehlung:** Ein eindimensionales Energiebilanz-Modell pro Achspunkt, nach dem Vorbild von RoadSurf (FMI, MIT-Lizenz), ergänzt um die Latentwärme-Behandlung von METRo am Gefrierpunkt. Es läuft durchgehend mit ICON-D2 und ICON-D2-RUC als Antrieb, ohne Neustart ("Spin-up" statt Initialisierung). Darauf sitzt ein Speichermodell für Wasser, Schnee, Eis und Reif, das die Zustandsklassen regelbasiert ableitet. Eine gepoolte statistische Restfehler-Korrektur, gelernt an den funktionierenden Glättemeldeanlagen (GMA), korrigiert die Fahrbahntemperatur. An GMA-Punkten wird zusätzlich an die letzte gültige Messung gekoppelt. Sicht wird nicht selbst physikalisch modelliert, sondern aus fertigen VIS-Feldern, MOSMIX und eigenen Diagnosen gemischt und als Wahrscheinlichkeitsklasse ausgegeben. DWD SWSMOS dient als offene Vergleichsbasis an den GMA-Punkten.

**Realistische Genauigkeit je Größe** (Ableitung aus den Quellen in den Abschnitten unten):

| Größe | Realistisch erreichbar ohne Sensor | Wo es nicht reicht |
|---|---|---|
| Fahrbahntemperatur | RMSE etwa 1,5–2,5 K in den ersten Stunden, etwa 1,5 K bei 12–48 h. Das liegt auf dem Niveau von DWD METRo mit Sensor (RMSE 1,5 K). Ziel mit Restfehler-Korrektur: ≤ 1,5 K. | Klare, windschwache Nächte, Kältesenken, Brücken. Ein falsches Wolkenszenario kostet 2–5 K (eigene Rechnung). |
| Nässe (nass/trocken) | Gut, solange Niederschlag und Zeitpunkt stimmen. Abtrocknung bleibt eine grobe Schätzung. | Wasserfilmdicke: mit gemessenen Profilen MAE ±90–190 µm (BASt). Ohne Querneigung und Verwindungsbereiche ist die Filmdicke nur eine Größenordnung. |
| Aquaplaning | Nur als Potenzial aus Regenrate und Standard-Geometrie. | In Verwindungsbereichen unterschätzt die Standard-Geometrie den Film bei 10–40 mm h⁻¹ um den Faktor 2,5–4 (eigene Rechnung). Geometriedaten sind nicht offen gefunden. |
| Glätte | Als "Glättepotenzial ohne Streuung". Reif-Diagnose in der Literatur etwa 80 % richtig bei 13–15 % Fehlalarmen. | Gefrierender Regen: selbst das DWD-Radarprodukt erreicht nur POD 0,40–0,56. Salz ist unbekannt, also Fehlalarme bei T_s zwischen etwa −3 und 0 °C. Ein numerischer Reibwert ist nicht belastbar. |
| Sicht | Nebel ja/nein an der 1000-m-Schwelle mit POD um 60 % und FAR um 50 % (Analogie zu anderen Modellen). | Dichter Nebel < 150 m und < 50 m ist nicht vorhersagbar (POD < 30 % in ALADIN). Die 50-m-Klasse geht nur mit Messung. |

**Wo die offenen Daten nicht reichen:** Kein offenes Modell auf opendata.dwd.de liefert die langwellige Gegenstrahlung LW↓; sie muss rekonstruiert werden. ICON-D2-RUC hat gar kein Langwellenfeld. Es gibt keine offene Untergrundtemperatur, keine Streu- oder Räumdaten und keine offene Querneigung. Für Österreich und die Schweiz fehlen offene Straßenwetterdaten ganz. ASFINAG ist blockiert (Registrierung und Vertrag), die GeoSphere-API ist ratenbegrenzt. Das eigene GMA-Archiv reicht erst bis 03.10.2026 zurück. Nach dem 30.11.2026 fällt im neuen DWD-URL-Schema das VIS-Feld für ICON-D2 und ICON-EU weg.

**Ehrliche Einordnung:** buscosun kann für Fahrbahntemperatur, nass/trocken und Reif-/Überfrierpotenzial an jedem 5-km-Punkt eine echte Alternative zur ausgefallenen GMA werden. Die Fehler liegen dann in der Größenordnung des DWD-Modells an intakten Anlagen. Einen gemessenen Eis- oder Reibwertzustand ersetzt das nicht. Die Ausgabe muss als unbehandeltes Potenzial mit Unsicherheit gekennzeichnet sein.

## Fahrbahntemperatur

### Alle operativen Modelle lösen dieselbe 1-D-Energiebilanz

Alle betrachteten Modelle (METRo, RoadSurf, DMI, SMHI, Met Office, Météo-France, KNMI/RMI) sind eindimensional. Sie unterscheiden sich vor allem in Kopplung an Messungen, Schnee- und Eisphysik, Verkehr und Antrieb, nicht im Wärmeleitungskern ([Khalifa et al. 2016](https://gmd.copernicus.org/articles/9/547/2016/gmd-9-547-2016.pdf); [Karsisto 2024](https://gmd.copernicus.org/articles/17/4837/2024/gmd-17-4837-2024.pdf)).

Oberflächenbilanz in der Form von RoadSurf und METRo (aus dem Quellcode gelesen: [RoadSurf BalanceModel.f90](https://github.com/fmidev/RoadSurf/blob/master/src/BalanceModel.f90), [METRo coupla.f](https://github.com/K0I05/METRo/blob/master/src/model/coupla.f)):

```latex
G_0 = (1-\alpha)\,S_\downarrow\,C_S + \varepsilon\,L_\downarrow\,C_L - \varepsilon\,\sigma\,T_s^4 + H - LE + Q_{P} + Q_{V}
```

G_0 ist der Wärmestrom in die Fahrbahn in W m⁻². α ist die Albedo (dimensionslos). S↓ ist die kurzwellige Globalstrahlung in W m⁻². L↓ ist die langwellige Gegenstrahlung in W m⁻². C_S und C_L sind die Kopplungsfaktoren aus dem Abgleich mit der letzten Messung (dimensionslos, ohne Sensor gleich 1). ε ist die Emissivität der Fahrbahn. σ = 5,67·10⁻⁸ W m⁻² K⁻⁴ ist die Stefan-Boltzmann-Konstante. T_s ist die Oberflächentemperatur in K. H ist der fühlbare Wärmestrom in W m⁻² (positiv zur Fahrbahn). LE ist der latente Wärmestrom in W m⁻² (positiv bei Verdunstung). Q_P ist der Phasenwechsel-Term des Niederschlags in W m⁻² (bei METRo "PRG"). Q_V ist der Verkehrswärmestrom in W m⁻².

Die Wärmeleitung im Belag:

```latex
\rho c\,\frac{\partial T}{\partial t} = \frac{\partial}{\partial z}\left(\lambda\,\frac{\partial T}{\partial z}\right)
```

ρc ist die volumetrische Wärmekapazität in J m⁻³ K⁻¹. λ ist die Wärmeleitfähigkeit in W m⁻¹ K⁻¹. z ist die Tiefe in m, t die Zeit in s. G_0 ist die obere Randbedingung.

**Fühlbare Wärme.** RoadSurf iteriert eine Monin-Obukhov-Stabilitätskorrektur nach Campbell (5 bis 40 Iterationen, Konvergenz 0,001) ([BoundaryLayer.f90](https://github.com/fmidev/RoadSurf/blob/master/src/BoundaryLayer.f90)):

```latex
u_* = \frac{k\,U}{\ln\left(\frac{z_W+z_m}{z_m}\right)+\psi_m},\qquad
H = \frac{\rho_a c_p\,k\,u_*}{\ln\left(\frac{z_W+z_h}{z_h}\right)+\psi_h}\,(T_a - T_s)
```

```latex
\zeta = \frac{-k\,z_T\,g\,h_H\,(T_s-T_a)}{\rho_a c_p\,T_a\,u_*^3},\quad
\psi_h=\psi_m=4.7\,\zeta\ (\text{stabil}),\quad
\psi_h=-2\ln\frac{1+\sqrt{1-16\zeta}}{2},\ \psi_m=0.6\,\psi_h\ (\text{labil})
```

u_* ist die Schubspannungsgeschwindigkeit in m s⁻¹. k = 0,4 ist die von-Kármán-Konstante. U ist die Windgeschwindigkeit in z_W = 10 m Höhe in m s⁻¹. z_m = 0,4 m und z_h = 0,001 m sind die Rauigkeitslängen für Impuls und Wärme. z_T = 2 m ist die Temperaturmesshöhe. ψ_m und ψ_h sind Stabilitätskorrekturen. ζ ist der Stabilitätsparameter (gedeckelt bei ≤ 1). h_H ist der Leitwert (der Bruch vor (T_a − T_s)) in W m⁻² K⁻¹. g = 9,81 m s⁻². ρ_a ist die Luftdichte, ρ_a = 100000/(287,05·T_a) kg m⁻³. c_p ist die spezifische Wärme der Luft in J kg⁻¹ K⁻¹, bei RoadSurf c_p = 1005 + (T_a − 250)²/3364. T_a ist die Lufttemperatur in K.

METRo nutzt stattdessen das Bulk-Richardson-Verfahren FLXSURFZ mit z0 = 0,001 m und z0t = 0,0005 m ([flxsurfz.f](https://github.com/K0I05/METRo/blob/master/src/model/flxsurfz.f)). Eigene Rechnung, neutral geschichtet: RoadSurf ergibt etwa 6,8 W m⁻² K⁻¹ bei 1 m s⁻¹ und 20 W m⁻² K⁻¹ bei 3 m s⁻¹. METRo ergibt 2,8 und 8,3 W m⁻² K⁻¹. Die Kopplung an die Luft unterscheidet sich also um den Faktor 2,5. Das große z_m von RoadSurf bildet implizit Verkehrs- und Geländerauigkeit ab.

**Latente Wärme** (RoadSurf nach Calder 1990, [BoundaryLayer.f90](https://github.com/fmidev/RoadSurf/blob/master/src/BoundaryLayer.f90)):

```latex
LE = \frac{\rho_a c_p\,\left(e_s(T_s)-e_a\right)}{\gamma\,r_a},\qquad
\gamma = 0.1\,(0.00063\,T_a + 0.47496)
```

```latex
e_{s,w}(T) = 0.61078\,\exp\left(\frac{17.269\,T}{T+237.3}\right),\qquad
e_{s,i}(T) = 0.61078\,\exp\left(\frac{21.875\,T}{T+265.5}\right)
```

e_s ist der Sättigungsdampfdruck in kPa über Wasser (w) oder Eis (i), T in °C. e_a ist der Dampfdruck der Luft in kPa. γ ist die Psychrometerkonstante in kPa K⁻¹. r_a ist der aerodynamische Widerstand in s m⁻¹ (bei RoadSurf auf 30 s m⁻¹ begrenzt). Ohne Oberflächenwasser setzt RoadSurf die Verdunstung auf null. L_vap = 2,452·10⁶ J kg⁻¹, L_fus = 0,334·10⁶ J kg⁻¹.

**Unterer Rand.** RoadSurf setzt in etwa 4,3 m Tiefe eine Jahres-Sinuskurve an ([Initialization.f90](https://github.com/fmidev/RoadSurf/blob/master/src/Initialization.f90)):

```latex
T_{unten}(d,z) = T_{Klim} + A_Z\,\sin\left(\Omega d - 170\,\Omega - \frac{z}{D}\right),\qquad \Omega=\frac{2\pi}{365}
```

d ist der Tag im Jahr. T_Klim = 6,4 °C, A_Z = 0,6 K und D = 2,7 m sind finnische Beispielwerte. Für DACH müssten T_Klim und A_Z an die örtliche Bodenjahresmitteltemperatur angepasst werden. Die Notizen schätzen 9–11 °C für das deutsche Flachland (ungeprüft). METRo hängt stattdessen 20 m Sand an und setzt am Boden einen Null-Fluss ([grille.f](https://github.com/K0I05/METRo/blob/master/src/model/grille.f)).

### Parameter

| Parameter | METRo (Code) | RoadSurf (Code) | Andere Quellen |
|---|---|---|---|
| Albedo Asphalt | 0,10 | 0,10 | TEB 0,08; Schweden 0,1 |
| Albedo Schnee | 0,50 | 0,6 | – |
| Albedo Eis | linear mit Eisspeicher | 0,1 → 0,6 bei 0 → 1,5 mm | – |
| Albedo Umgebung | – | 0,15 | Bäume/Gebäude 0,15 |
| Emissivität | 0,92 | 0,95 | TEB 0,94–0,95; Bäume 0,98 |
| λ Asphalt | 0,80 W m⁻¹ K⁻¹ | effektiv ≈ 0,50 oben, ≈ 1,35 tief (Ableitung) | DMI: 0,8 Asphalt |
| λ Beton | 2,2 W m⁻¹ K⁻¹ | – | DMI: 1,5 Beton |
| ρc | 2,1·10⁶ J m⁻³ K⁻¹ (Asphalt, Beton) | 1,94·10⁶ trocken, Porosität 0,1 | TEB 2,0·10⁶ |
| Rauigkeit | z0 = 0,001 m, z0t = 0,0005 m | z_m = 0,4 m, z_h = 0,001 m | – |
| Verkehrswärme | 10 W m⁻² konstant | 10 W m⁻² Tag, 5 W m⁻² Nacht (19–04 UTC) | TEB original 20 W m⁻² |
| Mindestwind | – | 1,5 m s⁻¹ Tag, 0,4 m s⁻¹ Nacht | Jacobs & Raatz: 5,14 / 2,57 m s⁻¹ |
| Schichten | ≈ 28 gestreckt bis 1,4–2,1 m + 20 m Sand | 15 Knoten bis 4,28 m | TEB 5 Schichten bis 0,96 m |
| Zeitschritt | 30 s | 30 s | – |

Quellen: [METRo grille.f](https://github.com/K0I05/METRo/blob/master/src/model/grille.f), [macadam.c](https://github.com/K0I05/METRo/blob/master/src/model/macadam.c), [RoadSurf InputParameters.h](https://github.com/fmidev/RoadSurf/blob/master/examples/example1/src/InputParameters.h), [Initialization.f90](https://github.com/fmidev/RoadSurf/blob/master/src/Initialization.f90), [DMI TR 10-12](https://www.dmi.dk/fileadmin/Rapporter/TR/tr10-12.pdf), [Khalifa et al. 2016](https://gmd.copernicus.org/articles/9/547/2016/gmd-9-547-2016.pdf), [Springer s00704-015-1508-9](https://link.springer.com/article/10.1007/s00704-015-1508-9). Deutsche Belagswerte (Splittmastixasphalt, offenporiger Asphalt, BASt/RStO) wurden nicht gefunden.

### Numerik

Beide Modelle rechnen explizit (Vorwärts-Euler) mit 30 s ([BalanceModel.f90](https://github.com/fmidev/RoadSurf/blob/master/src/BalanceModel.f90); [constPhys.f](https://github.com/K0I05/METRo/blob/master/src/model/constPhys.f)). RoadSurf legt die Knoten bei z_{i+1} = z_i + 0,0103·1,4^{i−1} + 0,02 m. Die ausgegebene T_s ist das Mittel der Knoten bei 0 und 3 cm.

Stabilitätsgrenze des expliziten Verfahrens:

```latex
\Delta t \le \frac{\rho c\,\Delta z^2}{2\lambda}
```

Eigene Rechnung für Δz = 1 cm: etwa 125 s für Asphalt (ρc = 2,0·10⁶, λ = 0,8) und etwa 48 s für Beton (λ = 2,2). Daher die 30 s. Stündlicher Antrieb wird zeitlich interpoliert und in 30–60-s-Schritte zerlegt. Alternativ erlaubt ein implizites Crank-Nicolson-Verfahren größere Schritte. Der Rechenaufwand ist klein: METRo braucht etwa 2 s pro 48-h-Punktprognose, davon etwa 90 % XML-Ein-/Ausgabe ([Linden & Petty 2008](https://ams.confex.com/ams/pdfpapers/132234.pdf)). Eigene Rechnung: 48 h × 120 Schritte × 15 Knoten ≈ 86 000 Knotenupdates pro Punkt. Der Engpass ist das GRIB-Lesen, nicht die Physik.

### Kopplung an die letzte Messung

Beide Modelle passen in einem Kopplungsfenster einen Strahlungsfaktor an, bis die modellierte T_s auf 0,1 °C an die letzte Messung passt. Danach klingt der Faktor ab:

```latex
C(t) = 1 + (C_R - 1)\,e^{-t/\tau},\qquad \tau = 4\ \text{h}
```

C_R ist der im Kopplungsfenster gefundene Faktor. t ist die Zeit seit Prognosebeginn.

METRo: mindestens 3 h Überlappung von Messung und Prognose, sonst keine Kopplung. Kurzwelle wird korrigiert, wenn die Sonne über das Fenster scheint (FS > 100 W m⁻² am Ende), sonst Langwelle. Höchstens 25 Bisektionsschritte, bei Misserfolg Korrektur 0 ([coupla.f](https://github.com/K0I05/METRo/blob/master/src/model/coupla.f); [balanc.f](https://github.com/K0I05/METRo/blob/master/src/model/balanc.f)). RoadSurf: 180-min-Fenster, Faktor zwischen 0,01 und 3, sonst Rücksetzen auf 1. Zusätzlich relaxiert RoadSurf T_a, Feuchte und Wind mit derselben τ = 4 h von der Messung zur Prognose ([Coupling.f90](https://github.com/fmidev/RoadSurf/blob/master/src/Coupling.f90); [Relaxation.f90](https://github.com/fmidev/RoadSurf/blob/master/src/Relaxation.f90)). Ohne Sensor entfällt die Kopplung. Was das kostet, steht im Abschnitt "Sensorausfall überbrücken".

### METRo, RoadSurf und der DWD-Ansatz im Vergleich

| Merkmal | METRo | RoadSurf | DWD operativ |
|---|---|---|---|
| Lizenz | GPL-2.0 (Port wäre ebenfalls GPL) | MIT | geschlossen |
| Strahlungseingang | SW↓/LW↓ optional; sonst aus Bedeckung in Achteln | SW↓ und LW↓ Pflicht | METRo mit MOS-Antrieb |
| Latentwärme beim Gefrieren | ja, T_s wird am Gefrierpunkt gehalten | nein, Wasser friert sofort | – |
| Brücken | eigenes Gitter, Unterseite = Lufttemperatur | nicht eingebaut | früheres EBM: eigene Position "Brücke" |
| Abschattung | nicht im Kern | Horizontwinkel und Himmelssichtfaktor | früheres EBM: Position "beschattet" |
| Zustand/Reibung | 8 Zustandscodes | nur Speicher; Klassen und Reibung extern | SWSMOS: 6 Zustandscodes |
| Salz | Gefrierpunkt als Parameter | nein | – |
| Verifikation | Kanada: RMS 1,65 K bei 24 h | Finnland: besser als Persistenz ab 4–6 h | RMSE 1,5 K (METRo), 1,3 K (MOS) |

Quellen: [GitHub K0I05/METRo](https://github.com/K0I05/METRo), [GitHub fmidev/RoadSurf](https://github.com/fmidev/RoadSurf), [Karsisto 2024](https://gmd.copernicus.org/articles/17/4837/2024/gmd-17-4837-2024.pdf), [Crevier & Delage 2001](https://collaboration.cmc.ec.gc.ca/science/rpn/publications/pdf/METRo_JAM2001.pdf), [EMS2024-148](https://meetingorganizer.copernicus.org/EMS2024/EMS2024-148.html), [WMO RoadWeather Germany](https://old.wmo.int/extranet/pages/prog/amp/pwsp/documents/RoadWeather_Germany.pdf).

Der DWD rechnet METRo an etwa 1.500 Straßenwetterstationen bis 7 Tage, angetrieben von MOS aus IFS-HRES und ICON. Eine direkte MOS für die Fahrbahntemperatur war im Test genauer (RMSE 1,3 gegen 1,5 °C, Nov. 2023 bis Jan. 2024, etwa 1.100 Stationen, 2,2 Mio. Werte), ist aber nicht operativ ([EMS2024-148](https://meetingorganizer.copernicus.org/EMS2024/EMS2024-148.html)). Daraus folgt für buscosun (Ableitung): Statistik schlägt Physik dort, wo Messungen sind. Zwischen den Stationen braucht man trotzdem ein physikalisches Modell. Der sinnvolle Aufbau ist hybrid.

**Empfehlung (Ableitung):** RoadSurf als Vorlage wegen MIT-Lizenz, Pflicht-Eingang SW/LW passend zu ICON und eingebauter Abschattung. Von METRo übernehmen: Latentwärme-Halt am Gefrierpunkt, Brückengitter, Phasenaufteilung im Übergangsband.

### Empfindlichkeit: Wolken dominieren die Nacht

Eigene Rechnung (linearisiert): Die Dämpfung der Oberfläche ist etwa 4εσT³ (≈ 4,4 W m⁻² K⁻¹ bei 0 °C) plus Turbulenz (3–20 W m⁻² K⁻¹) plus Bodenadmittanz (≈ 11 W m⁻² K⁻¹ für Asphalt), zusammen 18–35 W m⁻² K⁻¹. Ein LW-Fehler von 10 W m⁻² gibt damit 0,3–0,6 K. Ein falsches Wolkenszenario bewegt LW↓ nachts um 60–85 W m⁻² und gibt 2–5 K. Die METRo-Wolkenformel liefert bei 0 °C 215 W m⁻² für 0 Achtel und 298 W m⁻² für 8 Achtel ([metro_constant.py](https://github.com/K0I05/METRo/blob/master/src/frontend/toolbox/metro_constant.py)). In einer RoadSurf-Klimastudie erklärte der Lufttemperaturfehler im Mittel 57 % der Varianz des monatlichen T_s-Bias, der LW-Fehler 16 % und der SW-Fehler etwa 4 % ([Toivonen et al. 2019](https://gmd.copernicus.org/articles/12/3481/2019/)). Bewölkungsfehler gelten in DMI-, tschechischen und US-Studien als Hauptfehlerquelle ([DMI TR 99-1](https://www.dmi.dk/fileadmin/user_upload/Rapporter/TR/1999/tr99-1.pdf); [Sokol et al. 2014](https://sirwec.org/wp-content/uploads/2022/04/Andorra-D-13.pdf); [Bližňák et al. 2023](https://asep.lib.cas.cz/arl-cav/en/detail-cav_un_epca-0573220-Impact-of-satellitederived-cloud-cover-on-road-weather-forecasts)).

### Brücken, Abschattung und Verkehr

**Brücken.** METRo rechnet Brücken mit gleichmäßigem Gitter Δz = max(0,01 m; Dicke/200) und setzt den untersten Knoten auf Lufttemperatur ([grille.f](https://github.com/K0I05/METRo/blob/master/src/model/grille.f); [lib_therm.f](https://github.com/K0I05/METRo/blob/master/src/model/lib_therm.f)). Messungen aus Ohio (Winter 2022/23, 44.252 Paare, studentische Arbeit, geringe Beweiskraft): Straße minus Brücke im Mittel 1,0 °C. In 36,7 % der Fälle mit Frost war nur die Brücke unter 0 °C, nur die Straße in 0,3 % ([Guidry 2023](https://caps.ou.edu/reu/reu23/finalpapers/Guidry_FinalPaper.pdf)). Europäische Brücken-Statistiken wurden nicht gefunden. Vorschlag (Ableitung): an Punkten mit Brücken-Flag eine zweite Säule mit Beton (λ ≈ 2,2, ρc ≈ 2,1·10⁶), etwa 0,3 m Dicke, 8 cm Asphaltdeckschicht und Luft-Unterrand. Die Bodenadmittanz √(ωρcλ) ist für Beton etwa 18 W m⁻² K⁻¹ gegen 11 für Asphalt (eigene Rechnung, ω = 7,27·10⁻⁵ s⁻¹). Beton dämpft den Tagesgang also stärker.

**Abschattung.** RoadSurf schaltet die Direktstrahlung ab, wenn der Horizontwinkel in Sonnenrichtung (1°-Raster) die Sonnenhöhe übersteigt, und gewichtet Diffus- und Langwelle mit dem Himmelssichtfaktor ([ModRadiation.f90](https://github.com/fmidev/RoadSurf/blob/master/src/ModRadiation.f90)):

```latex
S_{dif}' = F_{sv}\,S_{dif} + (1-F_{sv})\,\alpha_u\,(S_{dir}+S_{dif}),\qquad
L_\downarrow' = F_{sv}\,L_\downarrow + (1-F_{sv})\,L_u
```

F_sv ist der Himmelssichtfaktor (0 bis 1). S_dif = S_global − S_dir ist die Diffusstrahlung in W m⁻². α_u = 0,15 ist die Albedo der Umgebung. L_u ist die langwellige Ausstrahlung der Umgebung in W m⁻², bei RoadSurf aus der NWP-Netto-Langwelle abgeleitet (L_u = L↓ − L_net).

Himmelssichtfaktor aus Horizontwinkeln ([Zakšek et al. 2011](https://www.mdpi.com/2072-4292/3/2/398)):

```latex
F_{sv} = 1 - \frac{1}{n}\sum_{i=1}^{n}\sin\gamma_i
```

γ_i ist der Horizontwinkel in Richtung i. n ist die Zahl der Richtungen; mindestens 8, mehr als 32 bringt nichts.

Wirkung: Im FMI-Test (23 Stationen, F_sv 0,72–0,98, drei Winter) sank der Tages-RMSE meist; abends wurde er teils schlechter, und im Oktober und März wurde die ohnehin zu kalte Prognose noch kälter ([Karsisto & Horttanainen 2022](https://sirwec.org/wp-content/uploads/2023/10/sirwec2022_1.4_Karsisto_Horttanainen.pdf)). Der Himmelssichtfaktor ist laut Chapman et al. die dominante geografische Steuergröße nachts; ein 8-Parameter-Modell erklärte bis 72 % der Varianz bei RMSE 1 °C ([Chapman et al. 2001](https://research.birmingham.ac.uk/en/publications/modelling-of-road-surface-temperature-from-a-geographical-paramet/)). Bogren et al. fanden an klaren Tagen für beschattet minus offen ΔT = −2,7 + 0,46·β mit β als Sonnenhöhe; Einheiten und Vorzeichen sind ungeprüft ([Bogren et al. 2000](https://www.cambridge.org/core/journals/meteorological-applications/article/impact-of-screening-on-road-surface-temperature/7DA0FE1A4EA2EB57286855A3181EA3AB)). Quantitative Werte für Wald und Einschnitte in DACH wurden nicht gefunden.

**Verkehr.** Befahrene Fahrbahn ist tagsüber 1–3 °C wärmer als unbefahrene; nachts gleichen sich die Kurven an ([Khalifa et al. 2016](https://gmd.copernicus.org/articles/9/547/2016/gmd-9-547-2016.pdf)). TEB ließ mit 20 W m⁻² noch 3–4 °C Differenz, mit einem physikalisch aufgeteilten Ansatz (Reifenreibung, Fahrzeug-IR, Abgas) etwa 0,5 °C. Für Autobahnen mit nahezu durchgehendem Verkehr sind 10–20 W m⁻² am Tag und 5–10 W m⁻² nachts plus Mindestwind konsistent mit der Praxis (Ableitung). Eine US-Anwendung passte den METRo-Verkehrsterm täglich um 1,0 W m⁻² pro °C Nacht-Bias an ([Rutz & Gibson 2013](https://www.inscc.utah.edu/~rutz/pubs/Rutz_and_Gibson_2013.pdf)).

## Fahrbahnnässe und Wasserfilm

### Speichermodell in mm Wasseräquivalent

Beide Modelle führen wenige Speicher in mm Wasseräquivalent (1 mm = 1 kg m⁻²). METRo hat zwei (flüssig ER1, fest ER2), RoadSurf fünf (Wasser, Porenwasser, Schnee, Eis, Ablagerung/Reif) ([Karsisto 2024](https://gmd.copernicus.org/articles/17/4837/2024/gmd-17-4837-2024.pdf); [METRo lib_therm.f](https://raw.githubusercontent.com/K0I05/METRo/master/src/model/lib_therm.f)). Die METRo-Konstanten stammen aus einem GitHub-Spiegel und wurden nicht gegen die ECCC-Originalquelle geprüft.

METRo-Bilanz mit Abfluss oberhalb der Kapazität:

```latex
W_{1}^{n+1} = \max\left(0,\ W_1^n + \Delta t\,\left(P_1 + F_1 + D_X - k_1\,\max(0,\,W_1^n - W_{1,max})\right)\right)
```

```latex
W_{2}^{n+1} = \max\left(0,\ W_2^n + \Delta t\,\left(P_2 + F_2 - D_X - k_2\,\max(0,\,W_2^n - W_{2,max})\right)\right)
```

W_1 und W_2 sind flüssiger und fester Speicher in mm. P_1, P_2 sind die Niederschlagsraten je Phase in mm s⁻¹. F_1, F_2 sind Kondensation/Verdunstung bzw. Deposition/Sublimation in mm s⁻¹. D_X ist der Schmelz-/Gefrierübertrag in mm s⁻¹. W_1,max = 0,2 mm und W_2,max = 1,0 mm sind die Kapazitäten. k_1 = 3·10⁻³ s⁻¹ und k_2 = 3·10⁻⁴ s⁻¹ sind die Abflussraten. Eigene Rechnung: Das entspricht e-Faltungszeiten von 5,6 min (flüssig) und 56 min (fest) für den Überschuss.

Feuchte an der Oberfläche (METRo SRFHUM): Die Fläche gilt ab 0,5 mm als voll nass.

```latex
q_g = \min(1,w)\,q_{sat}(T_s) + \max(0,1-w)\,\min\left(q_{sat}(T_s),\,q_a\right),\qquad w=\frac{W_1+W_2}{0.5\ \text{mm}}
```

q_g ist die spezifische Feuchte an der Oberfläche in kg kg⁻¹. q_sat ist die Sättigungsfeuchte bei T_s. q_a ist die spezifische Feuchte der Luft.

RoadSurf (Standardwerte): Maximalspeicher Schnee 100 mm, Eis 50 mm, Ablagerung 2 mm, Oberflächenwasser 1 mm, Porenwasser 1 mm. Schnee wird bei Erreichen von 100 mm halbiert (grobe Räumung). Gefriergrenze −0,25 °C, Schmelzgrenze +0,25 °C, Reifschmelzgrenze 1,25 °C, Reifbildungsgrenze 0,25 °C ([InputParameters.h](https://github.com/fmidev/RoadSurf/blob/master/examples/example1/src/InputParameters.h)). Verdunstung und Kondensation nur ohne gefrorene Speicher und bei T_s ≥ 0,25 °C. Unter der Gefriergrenze geht alles Wasser sofort in Eis über, ohne Latentwärme ([Karsisto 2024](https://gmd.copernicus.org/articles/17/4837/2024/gmd-17-4837-2024.pdf)).

Verkehrsabrieb in RoadSurf:

```latex
A_x = f_x\,S_x\,\frac{\Delta t}{3600\ \text{s}}
```

A_x ist der Abtrag aus Speicher x in mm pro Zeitschritt. S_x ist der Speicherinhalt in mm. f_x ist der Abriebfaktor in h⁻¹: Schnee 0,45, Eis 0,319, Sekundäreis 2,552, Reif 1,16, Wasser 0,145. 55,6 % des abgetragenen Schnees wird zu Eis verdichtet ([Karsisto 2024](https://gmd.copernicus.org/articles/17/4837/2024/gmd-17-4837-2024.pdf)). Eigene Rechnung: e-Faltungszeiten Wasser 6,9 h, Schnee 2,2 h, Eis 3,1 h, Reif 0,86 h. Die Faktoren stammen von finnischen Straßen. Für Autobahnverkehr sind sie vermutlich zu klein (Ableitung, ungetestet).

Messungen zur Abtrocknung: Verdunstung von feuchtem Belag 0,128–0,268 mm h⁻¹, von trockenem 0,025–0,111 mm h⁻¹ ([Deckert & Hauf 2003](https://sirwec.org/wp-content/uploads/2022/04/Bingen-D-20.pdf)). Ableitung: Der Überschuss fließt in Minuten ab, der Rest von 0,2–1 mm verdunstet in 1–5 h. Eine Fahrbahn ist nach Regen nachts oder im Winter typisch 0,5–2 h "nass" und bis 2–5 h "feucht", bei Sonne kürzer. Eine validierte Abtrocknungsstudie für deutsche Autobahnen fehlt.

### Zustandsklassen und Schwellen

BASt V 329 definiert die Klassen über die Wasserfilmdicke WFT: trocken < 0,010 mm, feucht 0,010–0,030 mm, nass > 0,030 mm ([Schedler et al. 2020](https://opus4.hbz-nrw.de/opus45-bast/files/2399/V329_barrfreiPDF.pdf)). METRo setzt für "vorhanden" 0,2 mm je Speicher an und hat 8 Codes: 1 trocken, 2 nass, 3 Eis/Schnee, 4 Wasser/Schnee-Gemisch, 5 Tau, 6 schmelzender Schnee, 7 Reif/Glatteiswarnung, 8 gefrierender Regen ([lib_therm.f](https://raw.githubusercontent.com/K0I05/METRo/master/src/model/lib_therm.f)). Die numerischen Klassenregeln von RoadSurf/FMI (8 Klassen: trocken, feucht, nass, nasser Schnee, Reif, teilweise glatt, glatt, trockener Schnee) sind nicht öffentlich zugänglich ([Toivonen et al. 2019](https://gmd.copernicus.org/articles/12/3481/2019/gmd-12-3481-2019.pdf)).

Vorgeschlagene Klassifikation für buscosun (Ableitung; "gesetzt" heißt: Schwelle ohne Quelle). Auswertung von oben nach unten, erste Regel gewinnt:

| Klasse | Regel | Herkunft |
|---|---|---|
| Glatteis (gefrierender Regen) | Flüssiger Niederschlag ≥ 0,1 mm h⁻¹ trifft auf T_s ≤ 0 °C | METRo-Code 8; 0,1 mm h⁻¹ gesetzt |
| Schneeglätte | Schnee N ≥ 0,2 mm, W/(W+N) ≤ 0,1, T_s ≤ 0 °C | METRo 0,2 mm; RoadSurf-Verhältnis |
| Schneematsch | N ≥ 0,2 und W ≥ 0,2 mm, oder 0,1 < W/(W+N) ≤ 0,6, T_s um 0 °C | METRo-Code 4; RoadSurf |
| Eisglätte / überfrierende Nässe | Eis I ≥ 0,2 mm, oder W ≥ 0,03 mm beim Unterschreiten der Gefriergrenze | METRo; BASt |
| Reifglätte | Reif D wächst, W, N, I < 0,2 mm; oder D ≥ 0,01–0,05 mm | METRo-Code 7; Mindestmenge gesetzt |
| Nass | W > 0,03 mm, T_s > 0 °C | BASt |
| Feucht | 0,01 < W ≤ 0,03 mm, oder Tau | BASt; METRo-Code 5 |
| Trocken | W ≤ 0,01 mm, kein gefrorener Speicher | BASt |

Der bestehende buscosun-Katalog setzt für `nass` Stufe 3 "Tf ≤ 0 °C bei Wasserfilm ≥ 0,05 mm". Das liegt zwischen BASt (0,03 mm) und METRo (0,2 mm) und ist damit konsistent.

Wichtig: Die Speicher eines Modells sind nicht der Wasserfilm, den eine GMA misst. Die BASt-Schwellen gelten für gemessenen Film. Die Modellspeicher müssen deshalb auf GMA-Wasserfilmwerte kalibriert werden (Ableitung). RoadSurf unterschätzt Wasser systematisch (Häufigkeit −18 %, Klasse "feucht" −16 %) ([Toivonen et al. 2019](https://gmd.copernicus.org/articles/12/3481/2019/gmd-12-3481-2019.pdf)).

### Wasserfilm bei Regen nach Gallaway

Die Standardformel für den stationären Wasserfilm über den Texturspitzen ist die metrische Gallaway-Formel ([NTUA](https://nrso.ntua.gr/wp-content/uploads/Assessing-Aquaplaning-Thresholds-through-Critical-Vehicle-and-Freeway-Geometric-Parameters.pdf); Original: [Gallaway et al. 1971](https://library.ctr.utexas.edu/hostedPDFs/tti/138-5.pdf)):

```latex
d_W = \frac{0.103\,T_{XD}^{0.11}\,L^{0.43}\,I^{0.59}}{S^{0.42}} - T_{XD}
```

d_W ist die Wasserfilmdicke über der Textur in mm. T_XD ist die Makrotextur-Tiefe in mm. L ist die Fließweglänge in m. I ist die Regenintensität in mm h⁻¹. S ist das resultierende Gefälle in %. Eigene Kontrolle: T_XD 0,4, L 58,6, I 50, S 2,52 ergibt 3,256 mm; das TII-Rechenbeispiel nennt 3,258 mm ([TII](https://publications.tii.ie/media/2x4fswfi/review-of-geometric-design.pdf)). Gültigkeit nach Austroads: I ≤ 50,8 mm h⁻¹, L ≤ 14,6 m, Gefälle ≤ 8 % ([NZTA TM-2502](https://nzta.govt.nz/assets/resources/calculating-road-surface-water-run-off/docs/tm2502.pdf)).

Fließweg und Gefälle aus Querneigung q und Längsneigung g (beide in %):

```latex
L = B\,\sqrt{1 + (g/q)^2},\qquad S = \sqrt{q^2 + g^2}
```

B ist die entwässerte Breite in m.

Eigene Rechnung, T_XD = 0,5 mm:

| Regen (mm h⁻¹) | Normalabschnitt q = 2,5 %, B = 11,5–14,5 m | Verwindungsbereich S = 0,7 %, L ≈ 20 m |
|---|---|---|
| 5 | ≈ 0 mm | ≈ 0,5 mm |
| 10 | 0,2–0,3 mm | ≈ 1,1 mm |
| 15 | 0,4–0,5 mm | ≈ 1,5 mm |
| 20 | 0,6–0,7 mm | ≈ 1,9 mm |
| 25 | 0,7–0,9 mm | ≈ 2,2 mm |
| 40 | 1,1–1,3 mm | ≈ 3,0 mm |

Mit T_XD = 1,0 mm (offenporig oder ältere Beläge) liegt der Film etwa 0,3 mm tiefer. Der Verwindungsfall extrapoliert über L ≤ 14,6 m hinaus. Er passt zu Trapps Befund von bis zu 3 mm Wasserfilm in Verwindungsbereichen breiter Richtungsfahrbahnen, auch bei richtlinienkonformem Bau; auf dem Berliner Südring gilt deshalb bei Nässe 60 km/h ([Trapp 2002](https://trid.trb.org/View/957963)).

Umgekehrt gerechnet (eigene Rechnung): Die buscosun-Stufen 0,5 / 1,0 / 2,0 mm werden auf einem Normalabschnitt erst bei etwa 15–17 / 29–35 / 69–82 mm h⁻¹ erreicht (der letzte Wert liegt außerhalb des Gültigkeitsbereichs I ≤ 50,8 mm h⁻¹), im Verwindungsbereich schon bei etwa 5 / 9 / 22 mm h⁻¹. Die im Katalog genannten Regenraten 5 / 15 / 25 mm h⁻¹ entsprechen auf dem Normalabschnitt etwa 0 / 0,4 / 0,8 mm und im Verwindungsbereich etwa 0,5 / 1,5 / 2,2 mm. Ohne Geometrie unterschätzt eine Standard-Querneigung von 2,5 % das Risiko genau dort, wo Aquaplaning-Unfälle passieren.

Die Formel liefert den stationären Film auf dem Fließweg. Eine GMA misst im Rollspur-Bereich, mit Spritzwasser und Reifenpumpen. BASt erreichte bei Wasserfilm-Prognosen MAE ±190 µm, mit Standardprofilen ±90 µm und mit Nowcasting < ±50 µm. Gemessene Filme überschritten 2.000 µm ([Schedler et al. 2020](https://opus4.hbz-nrw.de/opus45-bast/files/2399/V329_barrfreiPDF.pdf)).

### Aquaplaning-Geschwindigkeit

PAVDRN-Formel für d_W < 2,4 mm ([Bagui & Das 2014](https://journals.utm.my/mjce/article/download/15882/7365/48063)), in metrische Einheiten umgerechnet (eigene Rechnung):

```latex
v_{AP} \approx 96.8\,d_W^{-0.259}
```

v_AP ist die Aquaplaning-Geschwindigkeit in km h⁻¹, d_W die Filmdicke in mm. Original: 26,04·WFT^−0,259 in mph und Zoll. Eigene Rechnung: 116 / 97 / 81 / 73 / 68 km h⁻¹ bei 0,5 / 1 / 2 / 3 / 4 mm. Ab 2,4 mm ist die Formel nicht gültig.

Gallaway-Formel mit Reifenparametern ([NTUA](https://nrso.ntua.gr/wp-content/uploads/Assessing-Aquaplaning-Thresholds-through-Critical-Vehicle-and-Freeway-Geometric-Parameters.pdf)):

```latex
v_{AP} = 1.609\,SD^{0.04}\,p^{0.3}\,\left(1 + \frac{t_P}{0.794}\right)^{0.06} A
```

```latex
A = \max\left\{\frac{12.639}{d_W^{0.06}} + 3.50\ ;\ \left(\frac{22.351}{d_W^{0.06}} - 4.97\right)T_{XD}^{0.14}\right\}
```

SD ist der Radschlupf in % (typisch 10 %). p ist der Reifendruck in psi. t_P ist die Profiltiefe in mm. d_W und T_XD in mm. Nicht gültig für d_W > 4 mm. Eigene Rechnung mit 32 psi und T_XD 0,8 mm: bei 1 mm Film 97 / 94 / 90 km h⁻¹ für 8 / 4 / 1,6 mm Profil, bei 2 mm Film 92 / 89 / 85 km h⁻¹.

Praxisregeln: Aquaplaning braucht bei guten Reifen typisch > 5 mm, bei schlechten 3 mm, bei abgefahrenen etwa 0,3 mm. Unter 80 km h⁻¹ ist es nicht zu erwarten ([TRL](https://expertwitness.trl.co.uk/?p=1278)). Bemessungsgrenzen für den Film liegen bei 2,5–4 mm ([TII](https://publications.tii.ie/media/2x4fswfi/review-of-geometric-design.pdf); [NZTA](https://nzta.govt.nz/assets/resources/calculating-road-surface-water-run-off/docs/tm2502.pdf)).

Ableitung: Bei 120–130 km h⁻¹ reicht ≥ 1 mm für Teil-Aquaplaning-Risiko. Ab 2–3 mm ist es auch bei 80–100 km h⁻¹ kritisch. Die buscosun-Stufen `aqua` 0,5 / 1,0 / 2,0 mm passen dazu: Stufe 1 Sprühfahnen und Beginn bei hoher Geschwindigkeit, Stufe 2 Aquaplaning unter etwa 100 km h⁻¹, Stufe 3 unter etwa 80 km h⁻¹. Die Stufen sollten aber aus der modellierten Filmdicke mit Segmentgeometrie berechnet werden, nicht aus der Regenrate allein.

## Glätte

### Reifglätte

Reif bildet sich, wenn T_s unter 0 °C und unter dem Frostpunkt der Luft liegt. Die Modelle rechnen die Deposition mit demselben Bulk-Ansatz wie die Kondensation, nur mit Sublimationswärme ([Karsisto 2024](https://gmd.copernicus.org/articles/17/4837/2024/gmd-17-4837-2024.pdf); [lib_therm.f](https://raw.githubusercontent.com/K0I05/METRo/master/src/model/lib_therm.f)):

```latex
F_D = \rho_a\,C_E\,U\,\left(q_a - q_{sat,i}(T_s)\right)
```

F_D ist der Depositionsfluss in kg m⁻² s⁻¹ (positiv = Reifzuwachs). C_E ist der Austauschkoeffizient (dimensionslos). q_sat,i ist die Sättigungsfeuchte über Eis bei T_s.

Eigene Rechnung mit angenommenem C_E = 1,5·10⁻³, U = 1–3 m s⁻¹, T_a = −1 °C, 95 % RH, T_s = −4 °C: etwa 4–13 g m⁻² h⁻¹. Eine klare Nacht mit 6–8 h ergibt etwa 0,03–0,1 mm Wasseräquivalent. Das ist sichtbarer Reif, weit unter dem RoadSurf-Deckel von 2 mm. Stärkerer Wind erhöht die Deposition nur, solange T_s unter dem Frostpunkt bleibt. Er mischt aber auch wärmere Luft herunter. Deshalb ist Reif bei 1–3 m s⁻¹ am häufigsten (Ableitung).

Frostpunkt statt Taupunkt (eigene Rechnung mit Magnus über Eis): T_d = −2 °C entspricht etwa −1,8 °C Frostpunkt, T_d = −5 °C etwa −4,4 °C. Die buscosun-Regel "Tf ≤ 0 °C und Tf < Td" ist damit leicht konservativ. Das ist in Ordnung.

Beobachtungen: Die Reifmenge steigt mit Wind, maximalem (T_d − T_s) und der Dauer von T_s < T_d. Die Menge korreliert nicht mit der Reibung ([Karlsson 2001](https://www.cambridge.org/core/journals/meteorological-applications/article/abs/prediction-of-hoarfrost-by-use-of-a-road-weather-information-system/EED31E01C4FD8293C852A736F23E245C)). Hewson & Gait schlagen ein Zeitintegral von T_s unter T_d vor ([Hewson & Gait 1992](https://trid.trb.org/View/375809)). Vorschlag (Ableitung, Schwelle gesetzt):

```latex
\int \max\left(0,\ T_{f}(q_a) - T_s\right)\,dt \ \ge\ 1\ \text{K h}\quad\text{bei}\ T_s \le 0\ ^\circ\text{C und ohne Niederschlag}
```

T_f ist der Frostpunkt der Luft in °C. Das Integral läuft über die Zeit in h. Die Schwelle 1 K h muss an GMA-Reifcodes kalibriert werden.

Eine probabilistische Variante: P_Reif = P(T_s < T_F) · P(T_d > T_s), mit Prognose-Bias und Fehler-Standardabweichung; es gibt keine allgemein richtige Schwelle ([Mewes & Hart](https://ams.confex.com/ams/pdfpapers/72264.pdf)). Eine russische Reif-Diagnose erreichte 79–83 % richtig, 13–15 % Fehlalarme und 2–8 % Treffer verfehlt ([Bezrukova et al. 2006](https://sirwec.org/wp-content/uploads/2022/04/Torino-D-08.pdf)).

### Überfrierende Nässe

Das ist der Übergang des Wasserspeichers in Eis, wenn T_s die Gefriergrenze unterschreitet. Hier entscheidet die Latentwärme. RoadSurf friert sofort und ohne Wärmefreisetzung. METRo hält T_s am Gefrierpunkt, bis die Energie W·L_f abgeführt ist ([balanc.f](https://raw.githubusercontent.com/K0I05/METRo/master/src/model/balanc.f)):

```latex
D_X = \frac{G_0}{L_f\,\rho_w}\quad\text{solange}\ |T_s - T_{FP}| \le \Delta T_{FZ}\ \text{und Phasenwechsel läuft}
```

D_X ist die Umwandlungsrate zwischen den Speichern in m s⁻¹ (mal 1000 = mm s⁻¹). G_0 ist der Bodenwärmestrom in W m⁻². L_f = 0,334·10⁶ J kg⁻¹. ρ_w = 1000 kg m⁻³. T_FP ist der Gefrierpunkt in °C (bei METRo ein Parameter). ΔT_FZ = 0,1 K ist das halbe Übergangsband.

Ableitung: Ein Modell ohne diesen Halt lässt T_s unter einem Wasserfilm zu schnell unter 0 °C fallen. Für buscosun sollte der METRo-Halt in das RoadSurf-artige Modell eingebaut werden. Beispiel: 0,2 mm Wasser brauchen 0,2 kg m⁻² × 334 kJ kg⁻¹ ≈ 67 kJ m⁻². Bei 30 W m⁻² Nettoverlust sind das etwa 37 min Verzögerung (eigene Rechnung).

### Gefrierender Regen und Niederschlagsphase

METRo-Phasenaufteilung an der Fahrbahn: Schnee bei T_s ≤ T_FP bleibt fest, Regen bei T_s > T_FP bleibt flüssig. Regen auf T_s ≤ T_FP − ΔT_FZ wird vollständig fest mit Wärmefreisetzung (Code 8, "icing rain"). Im Band gilt ([lib_therm.f](https://raw.githubusercontent.com/K0I05/METRo/master/src/model/lib_therm.f)):

```latex
r = 0.25\,\sin\left(\frac{\pi\,(T_s - T_{FP})}{\Delta T_{FZ}}\right) + 0.75
```

r ist der Aufteilungsanteil (dimensionslos).

RoadSurf diagnostiziert die Phase, falls nicht vorgegeben ([Karsisto 2024](https://gmd.copernicus.org/articles/17/4837/2024/gmd-17-4837-2024.pdf)):

```latex
P_{Regen} = \frac{1}{1 + \exp\left(22 - 2.7\,T_a - 0.2\,RH\right)}
```

T_a in °C, RH in %. P < 0,3 Schnee, > 0,7 Regen, dazwischen Schneeregen (50/50). Für buscosun ist das unnötig: ICON-D2 liefert die Raten je Phase (PRR_GSP, PRS_GSP, PRG_GSP), seit 09.09.2026 im v1-Schema zusätzlich FRZ_RAIN (Definition ungeprüft) ([v1 ICON-D2](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2/p/)). Ein PTYPE-Feld gibt es nicht.

Für gefrierenden Regen aus dem Vertikalprofil ist das Bourgouin-Verfahren der Standard (wie in NCEP UPP, [CALWXT_BOURG.f](https://www.nco.ncep.noaa.gov/pmb/codes/nwprod/rap.v5.1.20/sorc/rap_wrfpost.fd/CALWXT_BOURG.f)):

```latex
E = g\,\sum \Delta z\,\ln\left(\frac{T}{273.15}\right)
```

E ist die Energiefläche einer Schicht in J kg⁻¹. T ist die Schichttemperatur in K, Δz die Schichtdicke in m. PA ist die warme Fläche in der Höhe, NA die kalte Fläche darunter, SW die bodennahe warme Fläche. Entscheidung: Wenn PA < 2 J kg⁻¹, Schnee bei SW < 5,6, Regen bei SW > 13,2. Sonst: NA > 66 + 0,66·PA Eiskörner, NA < 46 + 0,66·PA gefrierender Regen (wenn die unterste Schicht < 273,15 K) oder Regen, dazwischen unentschieden.

Der buscosun-Katalog setzt `glatteis` derzeit mit T2m ≤ +1 °C, T850 ≥ +1 °C und Niederschlag ≥ 0,1 mm h⁻¹ an. Ableitung: Der T850-Proxy verpasst flache warme Nasen und warnt zu viel, wenn die warme Schicht über 850 hPa liegt oder die kalte Schicht dick ist (Eiskörner). Vorgeschlagene Kette:

1. Phase in der Höhe aus ICON-D2-Modellflächen mit Bourgouin.
2. Bodennah T2m ≤ 0 °C oder Feuchttemperatur ≤ 0 °C.
3. Fahrbahn: modellierte T_s ≤ 0 °C. Eine Marge bis +0,5 °C ist vertretbar, weil unterkühlte Tropfen laut DWD auch auf leicht positiven Flächen gefrieren ([wetterdienst.de](https://www.wetterdienst.de/Deutschlandwetter/Thema_des_Tages/4477/das-lied-von-eis-und-wasser)).
4. Glatteis immer, wenn flüssiger Niederschlag ≥ 0,1 mm h⁻¹ auf T_s ≤ 0 °C trifft, unabhängig von der Luftmasse. Das deckt Regen auf gefrorenen Boden nach Kälte ab.
5. Gefrierenden Regen direkt in den Eisspeicher buchen und L_f·P als Wärme an die Oberfläche geben.

Erwartbare Güte: Das DWD-Produkt HYMEC/NASMA (Radar plus ICON-D2-Feuchttemperaturprofile) erreichte im Winter 2023/24 für gefrierenden Regen POD 0,40–0,56, FAR 0,27–0,63 und CSI 0,26–0,39; für Schnee POD 0,81–0,97 ([Schultz et al. 2025](https://indico.kit.edu/event/4015/contributions/18464/attachments/9061/15237/PrePEP_mschultz.pdf)). buscosun sollte gefrierenden Regen deshalb als "möglich" oder Wahrscheinlichkeit zeigen, nicht als sicher.

### Schneeglätte

Schnee geht in den Schneespeicher. Schmelzen ist energiebegrenzt ([Karsisto 2024](https://gmd.copernicus.org/articles/17/4837/2024/gmd-17-4837-2024.pdf)):

```latex
M = \frac{1000\,Q_m\,\Delta t}{L_f\,\rho_w},\qquad Q_m = \frac{\rho_g c_g\,(z_2 - z_1)}{2\,\Delta t}\,(T_1 - T_m)
```

M ist die Schmelzmenge in mm pro Zeitschritt. Q_m ist die verfügbare Schmelzenergie in W m⁻². ρ_g c_g ist die Wärmekapazität des Belags in J m⁻³ K⁻¹. z_1, z_2 sind die Tiefen der oberen Knoten in m. T_1 ist die Temperatur des obersten Knotens, T_m die Schmelztemperatur in °C. Schnee wird bei W/(W+N) > 0,6 sofort zu Wasser; Schnee und Wasser frieren bei W/(W+N) > 0,1 unter der Gefriergrenze zu Eis.

Räumen ist nicht modelliert. METRo entfernt Schnee erst oberhalb von 1,0 kg m⁻² und behandelt gefrorene Speicher als Szenario "ohne Maßnahmen" ([Rutz & Gibson 2013](https://www.inscc.utah.edu/~rutz/pubs/Rutz_and_Gibson_2013.pdf)). Auf geräumten Autobahnen ist die Schneedecke also ein Potenzial, kein Zustand.

### Reibwert

FMI rechnet Reibung als Regression auf Wurzeln der Speicher, angepasst an optische Sensordaten (Vaisala DSC111) ([ROADIDEA D3.4b](https://cordis.europa.eu/docs/projects/cnect/5/215455/080/deliverables/001-ROADIDEAD34bRoadweathermodeldevelopment1.pdf)):

```latex
\mu_{gefr} = A_1\sqrt{N} + B_1\sqrt{I} + C_1\,T_s + D_1,\qquad \mu_{nass} = A_w\sqrt{W} + B_w,\qquad \mu_{trocken}=0.82
```

μ ist der Reibwert (dimensionslos). N, I, W sind Schnee, Eis, Wasser in mm. T_s in °C. Die Koeffizienten (Juga, Nurmi & Hippi 2013) sind hinter einer Bezahlschranke und lagen nicht vor. Unabhängige Verifikation 2009/10: r = 0,48–0,86 für Schnee/Eis, r = 0,96–0,98 für Wasser. Die Variante mit allen drei Speichern wird operativ nicht genutzt, weil ohne Salz kein unterkühltes Wasser existieren kann.

Ankerwerte: trocken etwa 0,8; nass 0,5–0,8 (Minimum etwa 0,5); festgefahrener Schnee etwa 0,3; hartes Eis etwa 0,2 (Spikes); glattes Eis etwa 0,1 ([Hippi et al. 2010](https://sirwec.org/wp-content/uploads/2022/04/Quebec-D-15.pdf); [Haavasoja & Pilli-Sihvola 2010](https://sirwec.org/wp-content/uploads/2022/04/Quebec-D-11.pdf); [Malmivuo 2011](https://sirwec.org/wp-content/uploads/2022/04/Helsinki-P-41.pdf)). Finnische Grenzwerte: Autobahn 0,30, kleinere Straßen 0,22. Risikoklassen: hoch < 0,3, mittel 0,3–0,5, gering > 0,5 ([Ding & Kwon 2022](https://www.mdpi.com/2673-7590/2/4/54)).

Ersatzform ohne Juga-Koeffizienten (Ableitung, Koeffizienten zu kalibrieren):

```latex
\mu_{nass} = \max\left(0.5,\ 0.82 - a_w\sqrt{W}\right),\qquad
\mu_{gefr} = \min\left(0.5,\ \max\left(0.1,\ \mu_0 - b\sqrt{N+I} + c\,T_s\right)\right)
```

a_w, b, c, μ_0 so wählen, dass etwa 1 mm Eis 0,15–0,2 und 0,2 mm Reif etwa 0,3 ergibt.

Bewertung: Das FMI-Modell bleibt auf vereisten Straßen "zu lange zu glatt", weil die Speicher überproduziert werden und Wartung fehlt ([Hippi et al. 2010](https://sirwec.org/wp-content/uploads/2022/04/Quebec-D-15.pdf)). ML-Reibungsmodelle mit Wetterdaten erreichen MAE 0,14–0,27 ([TPF-5(435)](https://publications.iowa.gov/43824/1/roadway_friction_modeling_w_cvr.pdf)). Ableitung: Auf einem gestreuten Autobahnnetz ist ein numerischer Reibwert aus Modellspeichern nicht belastbar. Ausgabe als Klasse (griffig / eingeschränkt / glatt / sehr glatt) mit dem Zusatz "ohne Streuung".

### Salz und seine Wirkung, wenn es unbekannt ist

Weder RoadSurf noch METRo modellieren Salz. Beide verstehen ihre Ausgabe als "schlimmster Fall ohne Winterdienst" ([Toivonen et al. 2019](https://gmd.copernicus.org/preprints/gmd-2018-330/gmd-2018-330.pdf); [ROADIDEA D3.4b](https://cordis.europa.eu/docs/projects/cnect/5/215455/080/deliverables/001-ROADIDEAD34bRoadweathermodeldevelopment1.pdf)). FMI führt die Überschätzung von Eis und die Unterschätzung von Wasser zum großen Teil darauf zurück.

Gefrierpunkt einer NaCl-Sole (TU Wien, R² = 0,99, gültig bis zum Eutektikum bei 23,3 % und etwa −21 °C) ([Hoffmann, Nutz & Blab 2014](https://proceedings-andorra2014.piarc.org/content/actes/72_eng.pdf)):

```latex
T_{FP} = -0.001866\,c^3 + 0.03995\,c^2 - 0.8580\,c - 0.3169
```

```latex
c = 100\,\frac{m_S}{m_S + m_W}
```

T_FP ist der Gefrierpunkt in °C. c ist die Solekonzentration in %. m_S ist die Restsalzmenge in g m⁻². m_W ist die Wassermenge in g m⁻² (1 mm = 1000 g m⁻²). FHWA-Kontrollwerte: 10 % → −6,7 °C, 15 % → −11,1 °C, 20 % → −17,8 °C ([FHWA](https://www.fhwa.dot.gov/publications/research/safety/95202/004.cfm)).

Ausbringung: vorbeugend 5–10 g m⁻², kurativ bis 40 g m⁻², etwa 60 % Anfangsverlust ([Nutz 2015](https://repositum.tuwien.at/handle/20.500.12708/2843); [Hoffmann et al. 2014](https://proceedings-andorra2014.piarc.org/content/actes/72_eng.pdf)). Auf nasser Fahrbahn ist das Salz in der Rollspur nach "einigen hundert Fahrzeugen" weg, auf feuchter nach "einigen tausend" ([Blomqvist et al. 2011](https://journals.sagepub.com/doi/10.3141/2258-16)). Niederschlag verdünnt, Abfluss und Spritzwasser entfernen Salz ([Lysbakken 2008](https://sirwec.org/wp-content/uploads/2022/04/Prague-D-31.pdf)). DMI rechnet bei unbekannter Streuung mit einem voreingestellten Salzwert ([Petersen 2022](https://sirwec.org/wp-content/uploads/2023/10/sirwec2022_1.7_Petersen.pdf)).

Größe des Effekts (eigene Rechnung mit der TU-Wien-Formel): 8 g m⁻² Restsalz in 0,2 mm Wasser ergibt 3,9 % Sole und etwa −3,1 °C Gefrierpunkt. Dasselbe Salz in 1 mm Regen ergibt 0,8 % und etwa −1,0 °C. 4 g m⁻² in 0,5 mm ergibt ebenfalls etwa −1,0 °C. Folgerung: Auf vorbeugend gestreuten Autobahnen erzeugt ein salzfreies Modell vor allem Fehlalarme für überfrierende Nässe und Reif bei T_s zwischen etwa −3 und 0 °C. Genau dort liegen die meisten deutschen Glättelagen. Unter etwa −5 °C oder nach ≥ 1–2 mm Regen und einigen hundert Fahrzeugen auf nasser Fahrbahn ist der Salzeffekt weitgehend weg. Eine veröffentlichte Zahl zum Fehler durch ignoriertes Salz wurde nicht gefunden.

Empfehlung (Ableitung): Hauptausgabe mit T_FP = 0 °C als "Glättepotenzial ohne Streuung" (FMI-Konvention). Optional ein zweites Szenario "gestreut" mit 5–10 g m⁻² Restsalz, das mit Regen und Verkehr abnimmt. Die Differenz als Unsicherheit zeigen, nicht als Prognose.

## Sichtweite

### Verfügbare Felder: VIS gibt es nur noch in RUC sicher

Stand der Verzeichnislisten vom 27.10.2026 (über WebFetch gelesen, also Modell-Zusammenfassungen der Listen, nicht Rohdaten):

| Quelle | Feld | Horizont, Takt | Schema | Status |
|---|---|---|---|---|
| ICON-D2 | `vis` (m) | 0–48 h, stündlich | altes Schema `icon-d2/grib/HH/vis/` | offen, endet nach 30.11.2026 |
| ICON-D2 | VIS | – | v1 `v1/m/icon-d2/p/` | fehlt |
| ICON-EU | `vis` | 0–120 h, später 3-stündlich | altes Schema | offen, endet nach 30.11.2026 |
| ICON-EU | VIS | – | v1 | fehlt |
| ICON global | – | – | beide | kein VIS |
| ICON-D2-RUC | VIS | 0–27 h in 15-min-Schritten, stündliche Läufe, ≈ 30 min nach Termin | nur v1 | offen |
| ICON-D2-RUC-EPS | VIS (20 Member) | 0–27 h | nur v1 | offen |
| ICON-D2-EPS | – | – | v1 | kein VIS |
| MOSMIX | VV (m), VV10 = P(VIS < 1000 m), wwM/wwM6/wwMh/wwMd (Nebelwahrscheinlichkeit 1/6/12/24 h) | bis +240 h | Stationen | offen |
| DWD POI | `horizontal_visibility` (km) | Echtzeit | Stationen | offen |
| DWD CDC | stündliche Sicht, 204 Stationen | Archiv | Stationen | offen |
| GMA (SWIS-BUFR) | horizontalVisibility | 15 min, 48 h | Stationen | offen |
| GeoSphere SYNOP | Sicht, etwa 150 Stationen | 1 h | API | ratenbegrenzt (blockiert für Massenabruf) |
| GeoSphere INCA, C-LAEF | – | – | – | keine Sicht |
| MeteoSwiss ICON-CH1/CH2 | ungeprüft | – | STAC | Parameterliste nicht gelesen |
| DWD Satellit | nur CTH, TS, Strahlung | – | – | kein Nebelprodukt |

Quellen: [icon-d2/grib/00/vis](https://opendata.dwd.de/weather/nwp/icon-d2/grib/00/vis/), [icon-eu/grib/00/vis](https://opendata.dwd.de/weather/nwp/icon-eu/grib/00/vis/), [v1 icon-d2/p](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2/p/), [v1 icon-eu/p](https://opendata.dwd.de/weather/nwp/v1/m/icon-eu/p/), [v1 icon-d2-ruc/p](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2-ruc/p/), [RUC VIS Laufliste](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2-ruc/p/VIS/r/), [v1 icon-d2-ruc-eps/p](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2-ruc-eps/p/), [MetElementDefinition.xml](https://opendata.dwd.de/weather/lib/MetElementDefinition.xml), [CDC visibility](https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/visibility/recent/), [GeoSphere synop-v1-1h](https://data.hub.geosphere.at/en/dataset/synop-v1-1h), [GeoSphere C-LAEF](https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v2-1h-1km/metadata), [MeteoSwiss NWP](https://opendatadocs.meteoswiss.ch/e-forecast-data/e2-e3-numerical-weather-forecasting-model).

Das Ende des alten Schemas nach 30.11.2026 steht im Projektdokument `claude/fusion-verbesserungen-2026-09-29.md` (dort mit DWD-Bezug). Ob der DWD VIS für ICON-D2 und ICON-EU noch ins v1-Schema übernimmt, ist unbekannt. Ein Dritter (GribStream) schreibt, der DWD habe VIS eingestellt, listet es aber im Juli 2026 noch ([GribStream](https://gribstream.com/models/icond2)). Ein COSMO-WG5-Foliensatz nennt eine neue bodennahe Sicht-Diagnose in ICON und ICON-D2 seit 23.04.2024 und eine Änderung `itune_vis_diag=2` gegen nächtliche Fehler ([Fundel 2025](https://www.cosmo-model.org/content/tasks/workGroups/wg5/meetings/2025-01/20250121_ICON-D2_model_errors_ffundel.pdf)). Wie das ICON-VIS genau berechnet wird, ließ sich nicht klären (DWD-Seiten blockiert).

Folge (Ableitung): Ab Dezember 2026 hat buscosun für 27–48 h kein natives VIS mehr, wenn der DWD nicht nachzieht. Dann muss eine eigene Diagnose aus v1-ICON-D2-Feldern (QC, TQC_DIA, RELHUM_2M, TD_2M, CEILING, QR, QS, QG) einspringen. Für Österreich und die Schweiz bleiben nur ICON-D2-RUC (Domäne deckt AT und CH), MOSMIX-Stationen und GeoSphere-SYNOP.

### Parametrisierungen

Alle Verfahren beruhen auf Koschmieder ([NCEP CALVIS.f](https://www.nco.ncep.noaa.gov/pmb/codes/nwprod/rap.v5.1.20/sorc/rap_wrfpost.fd/CALVIS.f); [MDPI-Review 2021](https://www.mdpi.com/2073-4433/12/12/1666)):

```latex
V = \frac{-\ln\varepsilon_K}{\sum_j \beta_j},\qquad \beta_j = a_j\,C_j^{\,b_j}
```

V ist die Sichtweite in km. ε_K ist die Kontrastschwelle: 0,02 nach WMO (−ln ε = 3,912) oder 0,05 nach ICAO (2,996). β_j ist der Extinktionskoeffizient der Hydrometeorart j in km⁻¹. C_j ist die Massenkonzentration in g m⁻³.

Koeffizienten (Stoelinga & Warner 1999, wie in NCEP UPP kodiert; Kunkel 1984 für Wolkenwasser):

| Art j | a_j | b_j | Quelle |
|---|---|---|---|
| Wolkenwasser (Nebel) | 144,7 | 0,88 | Kunkel, UPP |
| Regen | 2,24 | 0,75 | UPP |
| Wolkeneis | 327,8 | 1,0 | UPP |
| Schnee | 10,36 | 0,7776 | UPP |
| Graupel | 4,0 (HRRR-Code) / 2,4 (ALADIN) | 0,75 / 0,78 | HRRR, ALADIN |

Quellen: [CALVIS.f](https://www.nco.ncep.noaa.gov/pmb/codes/nwprod/rap.v5.1.20/sorc/rap_wrfpost.fd/CALVIS.f), [CALVIS_GSD.f](https://www.nco.ncep.noaa.gov/pmb/codes/nwprod/hrrr.v4.1.19/sorc/hrrr_wrfpost.fd/CALVIS_GSD.f), [ALADIN 2019](https://www.cnrm.meteo.fr/aladin/IMG/pdf/report_visibility_cy43t2bf10_updated20191030.pdf). Die Originalarbeiten waren nicht zugänglich.

Nebel mit Tröpfchenzahl (Gultepe et al. 2006) ([MDPI-Review 2021](https://www.mdpi.com/2073-4433/12/12/1666); [Gultepe et al.](https://ams.confex.com/ams/pdfpapers/149116.pdf)):

```latex
V_{Nebel} = \frac{1.002}{\left(Q_L\,N_d\right)^{0.6473}}
```

V in km. Q_L ist der Flüssigwassergehalt in g m⁻³ (gültig 0,005–0,5). N_d ist die Tröpfchenzahl in cm⁻³ (gültig 1–400; Standard kontinental 200, maritim 100). Restunsicherheit 27 %; bei 20–30 % Fehler in Q_L oder N_d kann der Sichtfehler 50 % übersteigen. Eine Quelle (Remote Sensing 2022) vertauscht die Koeffizienten; hier gilt die Zuordnung von ALADIN und MDPI-Review.

Eigene Rechnung (ε = 0,02): Kunkel ergibt 380 m bei 0,05 g m⁻³ und 110 m bei 0,2 g m⁻³. Gultepe ergibt 350 m (N_d 100, 0,05 g m⁻³) und 90 m (N_d 200, 0,2 g m⁻³). Für < 150 m braucht das Modell also ≥ 0,1–0,2 g m⁻³ in der untersten Schicht. Einmomenten-Schemata erreichen das selten. NWP-Sicht ist in dichtem Nebel daher meist zu hoch. Kunkel überschätzt die Sicht bei Nebel < 1 km laut Review deutlich.

Feuchte-Term (RUC/HRRR, Code-Fassung) ([CALVIS_GSD.f](https://www.nco.ncep.noaa.gov/pmb/codes/nwprod/hrrr.v4.1.19/sorc/hrrr_wrfpost.fd/CALVIS_GSD.f)):

```latex
V_{RH} = 60\,\exp(-2.5\,q_{rh}),\qquad q_{rh} = \min\left(0.8,\ \max\left(0,\ \frac{RH}{100} - 0.15\right)\right)
```

V_RH in km, RH in % (Maximum der zwei untersten Modellschichten). Eigene Rechnung: Ab RH ≈ 95 % greift die Kappung und V_RH bleibt bei etwa 8 km. Die veröffentlichte Form 60·exp(−2,5·(RH−15)/80) ergibt etwa 5 km bei 95 %; nahe 100 % liefert sie laut Gultepe etwa die doppelte beobachtete Sicht ([AMS 113177](https://ams.confex.com/ams/pdfpapers/113177.pdf)). Der Feuchte-Term kann also keinen Nebel erzeugen, nur Dunst. HRRR nimmt am Ende das Minimum aus Hydrometeor- und Feuchte-Sicht. ALADIN empfiehlt ebenfalls das Minimum aus Wolken- und Niederschlagssicht ([Sekula 2018](https://www.cnrm-game-meteo.fr/aladin/IMG/pdf/sekula_visibility_ljubljanasep2018-1.pdf)).

Schnee (Boudala & Isaac 2009, über eine Sekundärquelle) ([U Alberta](https://era.library.ualberta.ca/items/ed388411-0a30-46af-a1cb-67000d3ac64c/download/93eb4b8b-11c4-4196-b44b-92043a0341d4)):

```latex
\ln\sigma = 0.837 + 0.542\,\ln S,\qquad V_{Schnee} = \frac{3}{\sigma} \approx 1.30\,S^{-0.542}
```

σ ist die Extinktion in km⁻¹. S ist die Schneefallrate in mm h⁻¹ Wasseräquivalent. V in km. Eigene Rechnung: 1,3 km bei 1 mm h⁻¹, 0,7 km bei 3 mm h⁻¹. Der UPP-Schneeterm liefert bei 1 mm h⁻¹ etwa 1,0 km (Annahme Fallgeschwindigkeit 1 m s⁻¹). Die temperaturabhängige Form ist in der Quelle unleserlich und ungeprüft.

Regen (eigene Rechnung, UPP-Term, 5 mm h⁻¹, Fallgeschwindigkeit 5 m s⁻¹): etwa 4–5 km. Regen allein bringt kaum je < 50 m. Kritisch ist auf Autobahnen die Gischt, die kein Schema abbildet. Das bleibt bei der bestehenden buscosun-Regel `gischt`.

Schneetreiben: Das Blowing Snow Model (Baggaley & Hanesiak 2005) gibt eine Wahrscheinlichkeit für Sicht unter einer Schwelle aus T, Wind, Schneefallrate und Schneealter. Bei ≤ 0,5 Meilen POD ≈ 95 %, FAR 43–65 % ([NWS TA 16-02](https://www.weather.gov/media/crh/publications/TA/TA_1602.pdf)). Die Koeffizienten lagen nicht vor.

Tag/Nacht: Lichter sieht man weiter als dunkle Objekte, V_n = 1,31·V_d^0,71 in km ([Remote Sensing 2022](https://www.mdpi.com/2072-4292/14/19/4865)).

### Güte: Nebel ja/nein geht, dichter Nebel nicht

ALADIN: POD für Nebel meist < 70 %, FAR etwa 70 %, dichter Nebel < 100 m nicht vorhersagbar, Trefferquote < 30 % in zwei Einstellungen ([ALADIN 2019](https://www.cnrm.meteo.fr/aladin/IMG/pdf/report_visibility_cy43t2bf10_updated20191030.pdf)). DMI-HIRLAM, Oktober 2015, Nebel < 1000 m bei +12 h: Treffer 71 %, FAR 59 %; beste Variante 67 % / 42 % ([DMI 2016](https://www.dmi.dk/fileadmin/user_upload/Rapporter/TR/2016/fog_tst_v3.pdf)). COSMO-1 im Schweizer Mittelland: Nebel und Hochnebel schon zu Beginn unterschätzt, lösen sich mit der Vorlaufzeit zu schnell auf ([Westerhuis et al. 2019](https://meetingorganizer.copernicus.org/IFDA2019/IFDA2019-67.pdf)). XGBoost auf AROME-Ausgaben: mittlerer relativer Fehler etwa 47 % gegen 155 % für Kunkel ([Bari & Ouagabi 2020](https://link.springer.com/article/10.1007/s42452-020-2327-x)). Ordinale Nachbearbeitung von ECMWF-ENS-Sicht senkte den CRPS auf 64–70 % des Rohensembles; schon Klimatologie erreichte 68–76 % ([Baran & Lakatos 2023](https://arxiv.org/pdf/2305.15325)). Das zeigt, wie schwach rohe NWP-Sicht ist.

Für ICON-D2-VIS und MOSMIX VV/wwM wurden keine veröffentlichten Verifikationszahlen gefunden. Ableitung: ICON-D2/RUC-VIS taugt als Nebel-ja/nein-Signal an der 1000-m-Schwelle, nicht für 50/150-m-Klassen, und ist nachts verzerrt. Typische Fehlerlagen: Strahlungsnebel in klaren, ruhigen Nächten, Talnebel unter Modellauflösung, zu frühe Auflösung am Morgen, Föhn, flacher Bodennebel unter der untersten Modellschicht.

### Vorgeschlagene Mischung

Ein veröffentlichtes Mischverfahren für Autobahnpunkte wurde nicht gefunden. Vorschlag (Ableitung):

1. **Jetzt (0–1 h):** Inverse-Distanz-Gewichtung gemessener Sicht aus DWD-POI, GMA (nach QC) und GeoSphere-SYNOP. Nur Stationen mit |Δz| ≤ 100 m und gleicher Geländeklasse (Talboden, Hang, Hochfläche, Kuppe). Ohne Station in 10–20 km: Modell.
2. **0–27 h:** P(Nebel) als Mischung aus RUC-EPS-Memberanteil P(VIS < x) (optional 3×3-Nachbarschaft), MOSMIX wwM/VV10 der nächsten repräsentativen Station und RUC-deterministischem VIS als Zeitsignal. Gewichte je Vorlaufzeit per logistischer Regression gegen CDC-Stundensicht lernen.
3. **27–48 h:** ICON-D2 `vis` und ICON-EU `vis` aus dem alten Schema, solange vorhanden, plus MOSMIX. Danach eigene Diagnose V = min(V_Nebel, V_RH, V_Niederschlag) mit Gultepe (N_d = 200 cm⁻³) auf QC der untersten Schicht, Stoelinga-Terme auf QR/QS/QG oder Boudala auf die Fusion-Schneerate. Ergebnis per Kalibrierung in Wahrscheinlichkeiten umrechnen, nicht über harte Schwellen.
4. **Übertragung auf Achspunkte:** Kaltluftsee- und Talindex aus dem Geländemodell (topografischer Positionsindex, Höhe über Talboden, Gewässernähe) als Prädiktor für Strahlungsnebel. Bei Hochnebel Punkthöhe gegen CEILING und Inversionshöhe vergleichen: Punkte über der Obergrenze sind nebelfrei.
5. **Schneetreiben** als eigene Wahrscheinlichkeit nur auf exponierten Abschnitten (Damm, offenes Gelände).
6. **Ausgabe:** P(VIS < 1000 / 300 / 150 / 50 m) plus Herkunftslabel (gemessen / abgeleitet / prognostiziert).

Bezug zum Katalog: `nebel` Stufe 1 = < 300 m, 2 = < 150 m, 3 = < 50 m. Die 50-m-Grenze ist die einzige gesetzliche (StVO §3(1): höchstens 50 km/h; §17(3): Nebelschlussleuchte nur unter 50 m) ([§3 StVO](https://www.gesetze-im-internet.de/stvo_2013/__3.html); [§17 StVO](https://www.gesetze-im-internet.de/stvo_2013/__17.html)). Sie gilt auch für Schneefall und Regen. Die im Projekt vorgesehene Kappung von Prognosen auf Stufe 2 (E-AW-34) passt zur schlechten Trefferquote für dichten Nebel. Stufe 3 sollte nur aus Messung kommen.

## Eingangsdaten

### Antriebsgrößen

Stand der Listen 27.10.2026. "Offen" heißt: ohne Registrierung, ohne API-Schlüssel, ohne Ratenlimit. Der DWD nennt für opendata.dwd.de "Access is granted without registration" ([README](https://opendata.dwd.de/README.txt)); die Lizenz wird sekundär als CC BY 4.0 angegeben, ein GDI-DE-Eintrag nennt GeoNutzV ([wetterdienst](https://wetterdienst.readthedocs.io/en/latest/_sources/data/provider/dwd/index.md); [GDI-DE](https://gdk.gdi-de.org/geonetwork/srv/api/records/de.dwd.geoserver.fach.SWS_Beobachtungen)). Beide erlauben kommerzielle Nutzung mit Quellenangabe.

| Größe | Quelle | Feldname | Auflösung, Takt | Vorlaufzeit | Status |
|---|---|---|---|---|---|
| T2m, Taupunkt | ICON-D2 / RUC / EU | T_2M, TD_2M, RELHUM_2M | 2,2 km; RUC stündl. Läufe | D2 0–48 h, RUC 0–27 h, EU 0–120 h | offen |
| Wind 10 m, Böen | ICON-D2 / RUC / EU | U_10M, V_10M, VMAX_10M | wie oben | wie oben | offen |
| Direkte und diffuse Kurzwelle | ICON-D2 / RUC / EU | ASWDIR_S, ASWDIFD_S | RUC 15 min | wie oben | offen (laut ICON-Forum Mittel seit Modellstart) |
| Kurzwelle beobachtet | DWD Satellit | SIS, SID | 10–15 min, ≈ 20 min Latenz | Analyse | offen |
| Kurzwelle Prognose | DWD Satellit | SISfc | stündlich | +18 h | offen |
| Netto-Langwelle | ICON-D2 / EU | ATHB_S | stündlich (EU ab +78 h 3-stündlich) | 0–48 h / 0–120 h | offen |
| Gegenstrahlung LW↓ | ICON-D2 / EU / RUC | ATHD_S, ALWD_S | – | – | fehlt |
| Gegenstrahlung LW↓ | MeteoSwiss ICON-CH1 | ATHD_S | ≈ 1 km, 3-stündl. Läufe | 33 h | offen (CC BY 4.0, nur 24 h vorgehalten) |
| Gegenstrahlung beobachtet | LSA SAF DSLF, CM SAF SDL | – | 30 min | Analyse | blockiert (Registrierung) |
| Oberflächentemperatur Modell | ICON-D2 / RUC / EU | T_G | stündlich | wie oben | offen |
| Bodentemperatur | ICON-D2 / EU | T_SO (mehrere Tiefen) | stündlich | 0–48 h | offen; in RUC fehlt |
| Niederschlag je Phase | ICON-D2 / RUC | PRR_GSP, PRS_GSP, PRG_GSP | RUC 15 min | 0–48 h / 0–27 h | offen; ICON-EU nur RAIN_GSP/SNOW_GSP |
| Gefrierender Regen | ICON-D2 v1 | FRZ_RAIN | – | 0–48 h | offen seit 09.09.2026, Definition ungeprüft |
| Gefrierender Regen | MOSMIX | wwF | Station, stündlich | bis 240 h | offen |
| Wetter-Code | ICON-D2 / RUC / EU | WW | stündlich | wie oben | offen (Logik ungeprüft) |
| Bewölkung | ICON-D2 / RUC / EU, MOSMIX | CLCT, CLCL, CLCM, CLCH; N, Neff | stündlich | wie oben | offen |
| Sicht | siehe Abschnitt Sichtweite | VIS, VV | – | – | teils offen, teils endend |
| Strahlungsbilanz Station | MOSMIX | RadS3, RadL3, Rad1h, T5cm | Station | bis 240 h | offen (Vorhandensein je Station ungeprüft) |
| AT-Antrieb | GeoSphere | nwp-v1-1h-2500m, INCA, nowcast (pt = Niederschlagsart) | 1–2,5 km | 3–61 h | blockiert für Massenabruf (5 Anfragen/s, 240/h) |
| AT-Straßendaten | ASFINAG DATEX II | – | Echtzeit | – | blockiert (Registrierung, Vertrag) |
| CH-Straßendaten | ASTRA | – | – | – | nicht gefunden |

Quellen: [DWD nwp](https://opendata.dwd.de/weather/nwp/), [v1/m](https://opendata.dwd.de/weather/nwp/v1/m/), [alte ICON-D2-Liste](https://opendata.dwd.de/weather/nwp/icon-d2/grib/00/), [v1 ICON-D2](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2/p/), [v1 RUC](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2-ruc/p/), [RUC PRR_GSP](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2-ruc/p/PRR_GSP/r/2026-10-27T14:00/s/), [alte ICON-EU-Liste](https://opendata.dwd.de/weather/nwp/icon-eu/grib/00/), [SIS](https://opendata.dwd.de/weather/satellite/radiation/sis/), [ICON-CH1 STAC](https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-forecasting-icon-ch1/items?limit=100), [MeteoSwiss Nutzungsbedingungen](https://opendatadocs.meteoswiss.ch/general/terms-of-use), [LSA SAF](https://datalsasaf.lsasvcs.ipma.pt/), [CM SAF](https://wui.cmsaf.eu/safira/action/viewProduktSearch), [GeoSphere Limits](https://dataset.api.hub.geosphere.at/v1/docs/user-guide/request-limit.html), [GeoSphere NWP](https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v1-1h-2500m/metadata), [DATEX II Austria](https://repo.datex2.eu/implementations/profile_directory/austrian-reference-profile-srti).

Hinweis zum v1-Schema: Pfad `v1/m/<modell>/p/<PARAM>/r/<lauf>/s/PT…grib2`, unkomprimiert, nur 24 h Läufe vorgehalten. ICON-D2-RUC gibt es nur dort. RUC-Läufe erscheinen etwa 30–41 min nach Termin ([RUC T_G](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2-ruc/p/T_G/r/2026-10-27T14:00/s/)).

### Die Langwellen-Lücke und ihre Rekonstruktion

RoadSurf braucht LW↓ zwingend. Kein DWD-Modell auf opendata liefert es. RUC hat überhaupt kein Langwellenfeld. Rekonstruktion aus ICON-D2/EU (Ableitung, Feldkonventionen ungeprüft):

```latex
L_\downarrow \approx \frac{\overline{F_{LW,net}}}{\varepsilon_s} + \sigma\,\overline{T_G^4}
```

```latex
\overline{F}_{(t_1,t_2)} = \frac{t_2\,\overline{F}_{(0,t_2)} - t_1\,\overline{F}_{(0,t_1)}}{t_2 - t_1}
```

F_LW,net ist ATHB_S in W m⁻² (Netto-Langwelle, positiv nach unten). ε_s ist die Oberflächenemissivität des Modells (etwa 0,95–0,99, ungeprüft). T_G ist die Modell-Oberflächentemperatur in K; der Mittelwert über das Intervall wird aus den Werten an beiden Enden gebildet. Die zweite Gleichung macht aus "Mittel seit Modellstart" ein Intervallmittel; t_1, t_2 sind die Vorlaufzeiten in s. Dass ATHB_S als Mittel seit Start abgelegt ist, legt die fast leere Datei bei Schritt 0 nahe (200 Byte) ([ATHB_S-Liste](https://opendata.dwd.de/weather/nwp/icon-d2/grib/03/athb_s/)); für ASWDIR_S/ASWDIFD_S ist diese Konvention im ICON-Forum belegt ([MPI-M ICON Forum](https://code.mpimet.mpg.de/boards/2/topics/15240)). Eigene Einschätzung: Genauigkeit einige W m⁻², also deutlich besser als jede Wolken-Parametrisierung. Vor Nutzung gegen die ICON Database Reference prüfen.

Rückfallebenen: (1) ICON-CH1 ATHD_S direkt für die Schweiz und angrenzende Gebiete (Domänengrenze ungeprüft). (2) Für RUC-Zeitschritte LW↓ aus ICON-D2 übernehmen oder per Klarhimmel-Formel plus Wolkenterm aus RUC T_2M, TD_2M, CLCT, CLCL. (3) METRo-Formel aus Bedeckung in Achteln:

```latex
L_\downarrow = a(n)\,T_a + b(n)
```

T_a in °C, n in Achteln. a = [3,79; 4,13; 4,13; 4,26; 4,38; 4,19; 4,395; 4,34; 4,51] und b = [214,7; 226,2; 234,8; 243,4; 250,7; 259,2; 270,9; 280,9; 298,4] W m⁻² für n = 0…8 ([metro_constant.py](https://github.com/K0I05/METRo/blob/master/src/frontend/toolbox/metro_constant.py)). Beobachtete Langwelle gibt es offen nicht. Satelliten-Wolkenprodukte (CAL, CTH) können nur als Klar/Bewölkt-Schalter dienen.

### SWSMOS: offene DWD-Straßenprognose als Messlatte

Der DWD veröffentlicht stündlich `swsmos_YYYYMMDDHH0000_opendata.csv.bz2` (etwa 2 MB, etwa :57 nach dem Lauf, 48 Dateien vorgehalten) plus Stationskatalog ([SWSMOS](https://opendata.dwd.de/weather/local_forecasts/swsmos/)). Inhalt: TL, TD (MOS), TS (Fahrbahntemperatur aus METRo mit MOS-Antrieb), RRL1c, RR6, WWL6, R650 und RC (Zustandscode 1 trocken, 2 feucht, 3 Schnee, 4 Reif, 5 überfrierende Nässe, 6 Glatteis). Horizont stündlich bis +167 h an etwa 1.800 Stationen ([wetterdienst SWSMOS](https://wetterdienst.readthedocs.io/en/latest/_sources/data/provider/dwd/swsmos/hourly.md)); EMS2024 nennt etwa 1.500. Die RC-Codes sind andere als die BUFR-Zustandscodes. Bewertung (Ableitung): SWSMOS ist Vergleichsbasis und Rückfall an GMA-Punkten. Zwischen den Stationen und in AT/CH hilft es nicht. Bei kaputtem Sensor ist auch SWSMOS fraglich, weil METRo die Messung assimiliert.

### GMA-Beobachtungen

Offen unter `weather_reports/road_weather_stations/<gruppe>/`: 31 Gruppen mit 15-min-BUFR-Dateien, rollierendes 48-h-Fenster, plus `quality-assured/` mit je einer XML-Datei pro Station (nur letzter Wert). Parameter: Fahrbahntemperatur, Zustandscode, Wasserfilmdicke, Sicht, Niederschlagsart/-menge/-intensität, Lufttemperatur (in 4–5 m Höhe), Taupunkt, Feuchte, Wind. Untergrundtemperatur, Gefriertemperatur und Salzkonzentration fehlen in allen gefundenen Listen ([wetterdienst road](https://wetterdienst.readthedocs.io/en/latest/_sources/data/provider/dwd/road/15_minutes.md); [road_weather_stations](https://opendata.dwd.de/weather/weather_reports/road_weather_stations/)). Ob die BUFR-Dateien mehr enthalten, als wetterdienst dekodiert, ist ungeprüft. Veraltete Gruppen am 27.10.2026: HS (leer seit 10.01.2024), JS, JH, LV, LW, MK, NC; DD liefert seit 02.10.2026 nichts mehr ([DD](https://opendata.dwd.de/weather/weather_reports/road_weather_stations/DD/)). Das eigene Archiv (AW-6a) läuft seit 03.10.2026.

### Statische Standortparameter

| Parameter | Quelle | Lizenz/Status | Bemerkung |
|---|---|---|---|
| Brücke | OSM `bridge=yes`, `layer` | ODbL, offen | `points.json` hat bereits ein Brücken-Flag |
| Einschnitt, Damm | OSM `cutting=*`, `embankment=*` | ODbL, offen | Status "de facto" ([OSM cutting](https://wiki.openstreetmap.org/wiki/Key:cutting)) |
| Belag | OSM `surface=asphalt/concrete*` | ODbL, offen | Autobahnen oft ohne Tag; Standard Asphalt ([OSM surface](https://wiki.openstreetmap.org/wiki/Key:surface)) |
| Wald | OSM-Waldflächen | ODbL, offen | Copernicus Tree Cover Density: Lizenz ungeprüft |
| Horizont, Himmelssichtfaktor | Copernicus DEM GLO-30 (Oberflächenmodell mit Bäumen, Gebäuden) | frei mit Quellenangabe, AWS ohne Anmeldung ([AWS](https://registry.opendata.aws/copernicus-dem/)) | 30 m verwischt schmale Einschnitte |
| Gelände DE | BKG DGM200 | dl-de/by-2.0, offen ([BKG](https://gdz.bkg.bund.de/index.php/default/digitales-gelandemodell-gitterweite-200-m-dgm200.html)) | zu grob für Abschattung |
| Gelände DE fein | BKG DGM1/DGM5/DGM25 | blockiert (kostenpflichtig oder nur Behörden) | Länder-DGM1 teils offen (ungeprüft) |
| Gelände CH | swissALTI3D | OGD frei, ohne Registrierung; STAC nennt "proprietary" (Widerspruch) ([swisstopo](https://www.swisstopo.admin.ch/en/terms-and-conditions)) | 0,5–2 m |
| Gelände AT | data.gv.at 10 m | ungeprüft | – |
| Querneigung, Verwindungsbereiche | – | nicht offen gefunden | größte Lücke für Aquaplaning |
| Längsneigung | BKG DGM200 / GLO-30 | offen | im Projekt bereits geplant |

Ableitung: Horizontwinkel in 1°-Schritten und Himmelssichtfaktor einmalig je Achspunkt aus GLO-30 vorrechnen (Fernhorizont) und mit OSM-Einschnitten, Wald und Lärmschutz als Nahfeld korrigieren. Für die Schweiz swissALTI3D nutzen.

## Sensorausfall überbrücken

### Qualitätskontrolle der GMA-Daten

GMA-Sensoren fallen oft und typisch aus: keine Daten, festhängende Werte, Verzögerung, Schnee oder Schmutz auf dem Sensor, falsche Metadaten. In Minnesota waren 22 % der verifizierten Probleme "keine Daten" ([Crouch et al. 2005](https://www.d.umn.edu/natsrl/documents/FY2005reports/rwisSensorMalfunction2005.pdf)). Ein Fahrbahn-Puck erkannte 0 von 59 Schnee-/Eisfällen und meldete sie als "chemisch nass" ([Marosek 2005](https://westerntransportationinstitute.org/wp-content/uploads/2016/08/426218_Final_Report.pdf)). In einer DWD-Stichprobe lagen bei 21 von 887 Stationen Fahrbahn- und Lufttemperatur mehr als 10 K auseinander; markiert waren nur 4 ([wetterdienst road](https://wetterdienst.readthedocs.io/en/latest/_sources/data/provider/dwd/road/15_minutes.md)). Das eigene buscosun-Audit kennt bereits Füllwerte (z. B. 21,6 mm h⁻¹), falschen Reif aus Gerätefüllwerten und als gültig markierte unmögliche Werte (Projektdokument `claude/autobahnwetter-gefahren-2026-10-13.md`, Mängel D-1 bis D-4).

Die DWD-QC prüft nur Fahrbahn-, Luft- und Taupunkttemperatur: Grenzwerte, Konstanz (4 h unverändert), Differenz Fahrbahn − Luft und einen räumlichen Perzentiltest. Die beiden letzten laufen nur im Winter ([Schmitz 2019](https://resources.eumetrain.org/data/5/557/roadew2019_s3b.pdf); [Claußen 2020](https://www.ise.kit.edu/rd_download/SEB/KIT%20Kolloquium%2020200122%2001%20Stra%c3%9fen-Wetter-Informationen%20Clau%c3%9fen.pdf)). Der räumliche IQR-Test von Clarus/MADIS:

```latex
\left|Z_e - Z_o\right| > \max\left(M \cdot 0.7413 \cdot IQR,\ \Delta_{min}\right)
```

Z_o ist der Messwert, Z_e der aus Nachbarn geschätzte Wert. IQR ist der Interquartilsabstand der Nachbarn. M = 3. Δ_min ist die Mindesttoleranz: Fahrbahntemperatur 10 °C, Untergrund 3 °C, Luft 3,5 °C, Taupunkt 7 °C. Mindestens 5 Nachbarn in 111 km und ±350 m Höhe ([MADIS](https://madis.ncep.noaa.gov/madis_rwis_qc_notes.shtml)).

Vorgeschlagene QC-Kette für buscosun (Ableitung):

1. Dekodier- und Gültigkeitsschicht: Füllwerte, unmögliche Codes.
2. Bereichs- und Klimatest.
3. Sprungtest.
4. Konstanz: Fahrbahn- und Lufttemperatur gleichzeitig ≥ 4 h unverändert (wie DWD), damit echte Isothermie bei 0 °C unter Schnee nicht fälschlich fällt.
5. Gleichartige Sensoren an derselben Anlage (mehrere Spuren).
6. Differenz Fahrbahn − Luft im Winter.
7. Räumlicher IQR-Test auf Residuen gegen Fusion bzw. Fahrbahnmodell, mit Höhenband.
8. Modellkonsistenz: |Messung − virtueller Sensor| > k·σ(Wetterklasse). Die 10-°C-Toleranz von MADIS ist zu weit; σ nachts bei Bewölkung oder Wind eng, an klaren Sonnentagen weit.
9. Zustandscodes Schnee/Eis nur als schwache Information; "chemisch nass" bei Tf ≤ 0 °C nicht als sicher lesen.

Gruppenaktualität (HS, JS, JH, LV, LW, MK, NC, DD) als eigene Eingangsgröße überwachen.

### Kopplung und Abklingen der letzten Messung

Was die eigene Messung wert ist, hängt stark an der Vorlaufzeit:

| Studie | Gewinn durch eigene Messung |
|---|---|
| METRo ohne Sensor, Warschau, 1 Station ([Opara & Zieliński 2017](https://bjrbe-journals.rtu.lv/bjrbe/article/download/bjrbe.2017.30/428/732)) | Mehrfehler ohne Sensor: +1,19 K (1 h), +1,07 (2 h), +0,91 (3 h), +0,72 (6 h), +0,41 (12 h), +0,38 (24 h), +0,32 (48 h) |
| METRo Tschechien, 25 Stationen ([Sokol et al. 2014](https://sirwec.org/wp-content/uploads/2022/04/Andorra-D-13.pdf)) | MAE-Gewinn 0,43 K (1 h), 0,40 (2 h), 0,17 (3 h), 0 ab 4 h |
| Clarus, 150 Stationen ([Linden & Drobot](https://sirwec.org/wp-content/uploads/2022/04/Quebec-D-38.pdf)) | etwa 1 °C in den ersten 3 h |
| ISBA-Route ([Bouilloud 2012](https://sirwec.org/wp-content/uploads/2022/04/Helsinki-P-34.pdf)) | RMS-Gewinn 0,6 K bei 6 h, 0,25 K bei 30 h |
| METRo Initialisierung ([Crevier & Delage 2001](https://collaboration.cmc.ec.gc.ca/science/rpn/publications/pdf/METRo_JAM2001.pdf)) | ≤ 0,18 K bei 24 h zwischen voller und keiner Untergrund-Initialisierung |

Ableitung: Die Messung ist in den ersten 1–3 h 0,4–1 K wert und nach etwa 6 h fast nichts. Nach 12–24 h liegt ein gut eingeschwungenes Modell ohne Messung 0,2–0,4 K hinter einem gekoppelten. Daraus folgt eine Regel für buscosun:

1. **Sensor gerade ausgefallen (< 6 h):** Lauf mit Kopplung an die letzte gültige Messung, Korrekturfaktor klingt mit τ = 4 h ab. METRo braucht dafür ≥ 3 h Überlappung.
2. **Ausfall 6–12 h und länger:** ungekoppeltes, aber durchlaufendes Modell plus Standort-Biaskorrektur.
3. **Ohne jede Messung:** dasselbe. Der Untergrund wird durch Dauerbetrieb eingeschwungen, nicht durch eine analytische Startkurve. Der Warschauer Versuch zeigt: Nach 7 Tagen Einschwingen liegt die Oberfläche unter 1 °C Differenz, der Untergrund aber noch > 5 °C ([Opara & Zieliński 2017](https://bjrbe-journals.rtu.lv/bjrbe/article/download/bjrbe.2017.30/428/732)). Also lange einschwingen (Wochen) und den unteren Rand klimatologisch setzen.

Norwegen ersetzt fehlende Fahrbahntemperatur durch das 1-h-Mittel der 2-m-Temperatur und die Untergrundtemperatur durch Fahrbahn − 2 K ([Mayer et al. 2021](https://presentations.copernicus.org/EMS2021/EMS2021-294_presentation.pdf)). Das ist eine grobe Notlösung.

### Biaskorrektur, die einen Ausfall übersteht

Rekursive Filter (Kalman, gleitendes Fenster) bekommen bei totem Sensor kein Update mehr. GeoSphere stellt fest, dass Kalman-Filter in Gebieten ohne Messung nicht anwendbar sind ([Schicker et al. 2023](https://meetingorganizer.copernicus.org/EMS2023/EMS2023-471.html)). Das Met-Office-Kalmanfilter korrigierte beschattete Stationen auch an trüben Tagen, wo die Abschattung keine Rolle spielt ([Hopwood](https://sirwec.org/wp-content/uploads/2022/04/Bingen-D-12.pdf)).

Belegte Korrekturen:

- DMI-Tabelle je Station, Monat, Stunde und Vorlaufzeit, geschichtet nach Bewölkung, Wind, Ts−Ta und Ts−Td: MAE 0,762 → 0,643 °C ([DMI SR 12-05](https://www.dmi.dk/fileadmin/user_upload/Rapporter/SR/2012/sr12-05.pdf)).
- DMI-Regression über 3–30 Tage, Start ab 7 Tagen Daten: MAE 0,808 → 0,728 °C bei 3 h ([DMI SR 13-02](https://www.dmi.dk/fileadmin/user_upload/Rapporter/SR/2013/sr13-02.pdf)).
- METRo + LightGBM auf Residuen, 120 Stationen, Test auch auf ungesehenen Stationen: MAE 0,84 → 0,48 K (1 h), 1,66 → 0,89 K (2 h), 2,41 → 1,28 K (3 h) ([Smolyakov & Burnaev](https://arxiv.org/pdf/2003.09957)). Nutzt aber die Stationshistorie.
- FMI XGBoost auf RoadSurf-Residuen, 4 Winter: MAE etwa 1,5 °C über 1–62 h, vorläufig ([Karsisto 2025](https://meetingorganizer.copernicus.org/EMS2025/EMS2025-188.html)).

Vorschlag (Ableitung): Die Standortkorrektur in einer Form speichern, die keine aktuelle Messung braucht. (a) Residuentabelle je Stunde × Jahreszeit × Wetterklasse (klar/windstill, bewölkt, windig, nass), gelernt solange der Sensor lief. (b) Ein gepooltes Modell über alle GMA mit Standortmerkmalen (Höhe, Brücke, Himmelssichtfaktor, Lage, Region, mittleres Langzeit-Residuum). Verzögerte Messwerte als optionale Merkmale, im Training zufällig ausgeblendet, damit dasselbe Modell intakte und ausgefallene Stationen bedient. Gewicht des letzten Standort-Offsets mit der Ausfalldauer abklingen lassen. Mit dem Archiv seit Oktober 2026 reicht es für einfache Tabellen (DMI-Schwelle ≥ 7 Tage). Für monatliche Schichtung und Frostereignisse reicht es nicht; 56 Tage waren in Schweden "zu kurz, um Frostereignisse zu lernen" ([Almkvist & Moniaci 2006](https://sirwec.org/wp-content/uploads/2022/04/Torino-D-15.pdf)).

### Interpolation von Nachbarn

Direkte Interpolation der Fahrbahntemperatur ist in hügeligem Gelände und in klaren, ruhigen Nächten schwach, also genau in Frostlagen. Die Reichweite der räumlichen Korrelation schrumpft mit der Geländekomplexität ([Kwon, Aurora Phase II](https://www.intrans.iastate.edu/wp-content/uploads/sites/3/2020/01/Aurora-Project-Report_Phase-II_Final_Draft.pdf)). Über 4–5 m s⁻¹ Wind ist die nächtliche Variation gering ([Gustavsson 1990](https://link.springer.com/article/10.1007/BF00866454)). Luft in Randvegetation kann bis 8 °C kälter sein als über der Fahrbahn ([Almkvist et al. 2005](https://www.cambridge.org/core/journals/meteorological-applications/article/abs/an-attempt-to-define-the-road-climate-room/E6A1F316AEE2F06BB59EBAEF3E12A1E1)). Kriging mit Lufttemperatur als Kovariable half bei FMI meistens ([Karsisto & Pirinen 2019](https://meetingorganizer.copernicus.org/EMS2019/EMS2019-58.pdf)). Initialisierung mit interpolierter Stationstemperatur war im Winter etwa so gut wie mit korrigierten Mobilmessungen, in einem dichten, flachen Messnetz ([Karsisto & Lovén 2019](https://oulurepo.oulu.fi/handle/10024/24858)). Geografische "Fingerabdruck"-Modelle erklären bis 74 % der räumlichen Varianz bei RMS 1,06–1,07 °C ([Chapman & Thornes](https://sirwec.org/wp-content/uploads/2022/04/Bingen-D-15.pdf)). Eine Fehlerkurve über die Distanz in km wurde nicht gefunden.

Ableitung: Residuen (Messung − Modell) interpolieren, nicht die Rohtemperatur. Nur Nachbarn im gleichen Höhenband (Clarus: ±350 m; für Kaltluft enger) und gleicher Geländeklasse. Unsicherheit in klaren, windschwachen Nächten und an Kältesenken, Brücken und Waldschneisen erhöhen. Die 10-km-Grenze der bestehenden buscosun-Spezifikation passt zu Kwons Flachlandwerten, ist aber für Deutschland nicht validiert.

### Maschinelles Lernen

Reine Stations-ML-Modelle sind bei 1 h stark (LSTM-Ensemble RMSE 0,52 K gegen Persistenz 1,30 K), verlieren ohne NWP-Eingang aber bis 6 h fast alles (2,75 K) und brauchen die eigenen Messungen ([Li et al. 2026](https://gmd.copernicus.org/articles/19/9035/2026/gmd-19-9035-2026.pdf)). Für einen toten Sensor sind sie unbrauchbar. Sinnvoll ist ML als Restfehler-Korrektor auf einem physikalischen oder NWP-Lauf, gepoolt über viele Stationen und mit Validierung auf zurückgehaltenen Stationen (Ableitung). Physikalisch motivierte Merkmale (Ts−Ta, Tendenz) halfen, ERA5-Land-Merkmale verschlechterten den Frostbereich ([Li et al. 2026](https://gmd.copernicus.org/articles/19/9035/2026/gmd-19-9035-2026.pdf)). Bei Zustandsklassen ist ein regel- und speicherbasiertes Verfahren transparenter als ein Klassifikator auf einem Winter GMA-Codes, zumal die GMA-Codes für Schnee und Eis unzuverlässig sind.

### Was operative Dienste tun

Fast alle europäischen Dienste rechnen ein 1-D-Modell an Stationspunkten, gekoppelt an die eigene Messung und von NWP angetrieben, zunehmend mit Statistik dahinter: DWD (METRo + MOS), FMI (RoadSurf, Gitterläufe ohne Kopplung, interpolierte Werte wo keine Messung ist), DMI (Bias-Tabellen), Met Office (Kalman, Routenprognosen), RMI (Multi-NWP-Ensemble, Strahlungskorrektur aus den letzten 2 h Fehler), Met Éireann (ICEBreak + Thermalkarten) ([Karsisto 2024](https://gmd.copernicus.org/articles/17/4837/2024/gmd-17-4837-2024.pdf); [EMS2021-145](https://presentations.copernicus.org/EMS2021/EMS2021-145_presentation.pdf); [Van den Bergh et al. 2024](https://sirwec.org/wp-content/uploads/2024/07/7-sirwec2024_jvandenbergh.pdf); [TII 2021](https://tii.ie/media/na1nejz5/03-liz-walsh_met_pres_nov2021.pdf)). SWIS bietet nur regionale Mittel oder Punktprognosen an GMA ([BASt V 329](https://opus4.hbz-nrw.de/opus45-bast/files/2399/V329_barrfreiPDF.pdf)). Österreich nutzt INCA plus Wärme- und Stoffflussmodell und Thermalkarten-Downscaling ([Hadzimustafic & Kann 2016](https://meetingorganizer.copernicus.org/DACH2016/DACH2016-73.pdf)).

Was Nutzer bei Sensorausfall sehen, ist fast nirgends dokumentiert. Einziges Beispiel: das Schweizer Pilotsystem SGPS (2010) zeigt bei fehlendem zentralem Eingang schwarz "Keine Prognose möglich wegen fehlenden Daten". Bei fehlenden Nebeneingängen nutzt es Vorgaben (kein Salz; fehlende Oberflächentemperatur als unter 3 °C) ([BFH/ASTRA SGPS 2010](https://trimis.ec.europa.eu/system/files/project/documents/20150626_103439_19069_priloha_radek_1063_slipperyness.pdf)).

Anzeigeregel für buscosun (Ableitung): (1) gültige Messung: Messung zeigen. (2) Ausfall frisch: gekoppelte Modellschätzung, Label "Sensor ausgefallen seit hh:mm – Modellschätzung". (3) Ausfall länger: Modell plus Standortkorrektur mit breiterem Unsicherheitsband. (4) zentrale Eingänge fehlen (kein Fusion-Lauf): "unbekannt". Die bestehende Spezifikation zeigt bei totem GMA ohne Nachbar in 10 km "jetzt unbekannt, Prognose ab +1 h". Die Literatur stützt, auch für "jetzt" eine gekennzeichnete Modellschätzung zu zeigen, wenn deren validierter Fehler je Wetterklasse mit angezeigt wird. Das ist eine Designentscheidung, kein Standard.

## Genauigkeit und Verifikation

### Veröffentlichte Fehlerzahlen

Die Zahlen sind nur bedingt vergleichbar: MAE, RMSE und Median mischen sich, ebenso Ganztag und Nachtminimum, Klimazonen und Stationsdichten.

| Größe | Verfahren | Metrik | Wert | Vorlaufzeit | Quelle |
|---|---|---|---|---|---|
| Fahrbahntemp. | DWD METRo, ≈ 1.100 GMA | RMSE | 1,5 °C | nächster Tag + Nacht | [EMS2024-148](https://meetingorganizer.copernicus.org/EMS2024/EMS2024-148.html) |
| Fahrbahntemp. | DWD MOS (nicht operativ) | RMSE | 1,3 °C | nächster Tag + Nacht | [EMS2024-148](https://meetingorganizer.copernicus.org/EMS2024/EMS2024-148.html) |
| Fahrbahntemp. | METRo Kanada | Bias / RMS | −0,15 / 1,65 K; ≈ 50 % in ±2 K | 24 h | [Crevier & Delage 2001](https://collaboration.cmc.ec.gc.ca/science/rpn/publications/pdf/METRo_JAM2001.pdf) |
| Fahrbahntemp. | METRo Tschechien, stündlich gekoppelt | MAE | 0,6 / 1,0 K; morgens 2–3 K | 1 h / 2 h | [Sokol et al. 2014](https://sirwec.org/wp-content/uploads/2022/04/Andorra-D-13.pdf) |
| Fahrbahntemp. | METRo Ungarn, 165 GMA | MAE / RMSE | 1,48 / 2,12 K | Dez. 2014 | [Simon & Szarka 2018](https://sirwec.org/wp-content/uploads/2022/04/6.6_Simon.pdf) |
| Fahrbahntemp. | DMI RCM | MAE | 0,69 °C; 82 % in ±1 °C (3 h) | 5 h | [DMI TR 10-12](https://www.dmi.dk/fileadmin/Rapporter/TR/tr10-12.pdf) |
| Fahrbahntemp. | RMI, Nachtminimum, Ensemble | RMSE / CRPS | 0,87 / 0,52 K (Einzelmodelle 0,94–1,15) | 18-UTC-Lauf | [Van den Bergh et al. 2024](https://sirwec.org/wp-content/uploads/2024/07/7-sirwec2024_jvandenbergh.pdf) |
| Fahrbahntemp. | Met Office, Nachtminimum | RMS | ≈ 1,7 K automatisch | Nacht | [Hopwood](https://sirwec.org/wp-content/uploads/2022/04/Bingen-D-12.pdf) |
| Fahrbahntemp. | Météo-France | RMSE | 2,2 K automatisch | erste Nacht | [Bouilloud 2012](https://sirwec.org/wp-content/uploads/2022/04/Helsinki-P-34.pdf) |
| Fahrbahntemp. | METRo ohne Sensor | Mehrfehler | +1,19 / +0,72 / +0,38 K | 1 / 6 / 24 h | [Opara & Zieliński 2017](https://bjrbe-journals.rtu.lv/bjrbe/article/download/bjrbe.2017.30/428/732) |
| Fahrbahntemp. | METRo + LightGBM | MAE | 0,48 / 0,89 / 1,28 K | 1 / 2 / 3 h | [Smolyakov & Burnaev](https://arxiv.org/pdf/2003.09957) |
| Fahrbahntemp. | Persistenz, 1 Station | RMSE | 1,30 / 3,50 / 5,79 K | 1 / 3 / 6 h | [Li et al. 2026](https://gmd.copernicus.org/articles/19/9035/2026/gmd-19-9035-2026.pdf) |
| Fahrbahntemp. | RoadSurf ohne Initialisierung (Klimamodell) | Bias / MAE | −0,3 / 0,9 °C | Monatsstatistik | [Toivonen et al. 2019](https://gmd.copernicus.org/articles/12/3481/2019/) |
| Fahrbahntemp. | Fingerabdruck-Übertragung | RMS | 1,06–1,07 °C | räumlich | [Chapman & Thornes](https://sirwec.org/wp-content/uploads/2022/04/Bingen-D-15.pdf) |
| Fahrbahntemp. | BASt Transferfunktionen | MAE | 0,7–1,2 °C | räumlich | [BASt V 329](https://opus4.hbz-nrw.de/opus45-bast/files/2399/V329_barrfreiPDF.pdf) |
| Wasserfilm | BASt Routenprognose | MAE | ±190 µm; ±90 µm mit Profilen; < ±50 µm Nowcast | – | [BASt V 329](https://opus4.hbz-nrw.de/opus45-bast/files/2399/V329_barrfreiPDF.pdf) |
| Eis/Frost | Met Éireann, 102 Stationen | POD / FAR / CSI | 83,5 % / 8,2 % / 67,6 % | Tagesprognose | [TII 2021](https://tii.ie/media/na1nejz5/03-liz-walsh_met_pres_nov2021.pdf) |
| Kritischer Zustand | SGPS Schweiz | Erkennung / FAR | ≈ 90 % / 15 % (rot), 50 % (gelb) | 2 h | [SGPS 2010](https://trimis.ec.europa.eu/system/files/project/documents/20150626_103439_19069_priloha_radek_1063_slipperyness.pdf) |
| Reif | Diagnose Russland | richtig / Fehlalarm / verpasst | 79–83 % / 13–15 % / 2–8 % | – | [Bezrukova et al. 2006](https://sirwec.org/wp-content/uploads/2022/04/Torino-D-08.pdf) |
| Gefrierender Regen | DWD HYMEC/NASMA | POD / FAR / CSI | 0,40–0,56 / 0,27–0,63 / 0,26–0,39 | Analyse | [Schultz et al. 2025](https://indico.kit.edu/event/4015/contributions/18464/attachments/9061/15237/PrePEP_mschultz.pdf) |
| Reibung | FMI-Regression | r | 0,48–0,88 Schnee/Eis; 0,96–0,98 nass | – | [ROADIDEA D3.4b](https://cordis.europa.eu/docs/projects/cnect/5/215455/080/deliverables/001-ROADIDEAD34bRoadweathermodeldevelopment1.pdf) |
| Zustandsklassen | RoadSurf ohne Messung | Klassenanteil-Bias | trocken +7 %, feucht −16 %, nass −6 %, Eis +2 % | – | [Toivonen et al. 2019](https://gmd.copernicus.org/articles/12/3481/2019/gmd-12-3481-2019.pdf) |
| Nebel < 1 km | DMI-HIRLAM | Treffer / FAR | 67–71 % / 42–59 % | 12 h | [DMI 2016](https://www.dmi.dk/fileadmin/user_upload/Rapporter/TR/2016/fog_tst_v3.pdf) |
| Nebel | ALADIN | POD / FAR | < 70 % / ≈ 70 %; dicht < 30 % | – | [ALADIN 2019](https://www.cnrm.meteo.fr/aladin/IMG/pdf/report_visibility_cy43t2bf10_updated20191030.pdf) |

Nicht gefunden: POD/FAR für "T_s < 0 °C" von METRo, RoadSurf, DMI oder DWD; Verifikation von ICON-D2-VIS und MOSMIX-Sicht; Zustandsklassen-Kontingenztabellen. RoadSurf verifiziert Wasser-, Eis- und Schneemengen nicht, weil die Messungen dafür nicht zuverlässig genug sind ([Karsisto 2024](https://gmd.copernicus.org/articles/17/4837/2024/gmd-17-4837-2024.pdf)).

### Prüfstand für buscosun

Datengrundlage: das eigene GMA-Archiv seit 03.10.2026 (nach QC), SWSMOS-Archiv (selbst mitschneiden, nur 48 h vorgehalten), CDC-Stundensicht (204 Stationen).

| Größe | Metriken | Schichtung | Vergleichsbasis |
|---|---|---|---|
| Fahrbahntemperatur | Bias, MAE, RMSE, Anteil in ±1 K und ±2 K | Vorlaufzeit (0, 1, 3, 6, 12, 24, 48 h); Tageszeit; Wetterklasse (klar/ruhig, bewölkt, windig, nass); Brücke ja/nein | Persistenz der letzten Messung; SWSMOS TS; roher T_G aus ICON; T2m |
| T_s ≤ 0 °C und Reif (T_s ≤ T_d) | POD, FAR, CSI, Frequenz-Bias | nur Fälle mit T_s in [−3, +1] °C, dort sind Salz- und Temperaturfehler gemeinsam | SWSMOS RC; Persistenz |
| Zustandsklassen | Kontingenztabelle je Klasse, POD/FAR/CSI | wie oben | SWSMOS RC (Codes umschlüsseln) |
| Wasserfilm | MAE in µm | Regenrate, Abtrocknungsphase | BASt ±90–190 µm |
| Sicht | Brier Skill Score für P(VIS < 1000/300/150 m), Zuverlässigkeitsdiagramm, POD/FAR | Nacht/Tag, Gelände | MOSMIX VV10/wwM; Klimatologie; Persistenz |

Validierung grundsätzlich mit zurückgehaltenen Stationen (gruppierte Kreuzvalidierung) und Datumsblöcken. Nur das bildet den Fall "Sensor tot" ab. Zielwerte (Ableitung): Fahrbahntemperatur RMSE ≤ 1,5 K für "jetzt" bis Tag 1 an zurückgehaltenen Stationen. Frost-Kontingenz in Richtung Met-Office-Ziel (Trefferquote > 87 %, FAR < 30 %) ([Hopwood](https://sirwec.org/wp-content/uploads/2022/04/Bingen-D-12.pdf)). Persistenz ist in den ersten Stunden schwer zu schlagen; RoadSurf ist erst nach 4–6 h klar besser ([Karsisto 2024](https://gmd.copernicus.org/articles/17/4837/2024/gmd-17-4837-2024.pdf)).

## Umsetzungsvorschlag für buscosun

### Stufen

1. **Eingänge und Prüfstand (zuerst).** GMA-QC-Kette wie oben. SWSMOS stündlich archivieren. Gruppenaktualität überwachen. Prüfstand mit Persistenz, SWSMOS und T2m als Vergleich aufsetzen. LW↓-Rekonstruktion aus ATHB_S + T_G bauen und Mittelungskonvention prüfen. Klären, ob das alte DWD-URL-Schema nach 30.11.2026 wirklich endet.
2. **Statische Standortdaten je Achspunkt (einmalig).** Horizontwinkel 1°-Raster und Himmelssichtfaktor aus Copernicus GLO-30 (CH: swissALTI3D). Brücke, Einschnitt, Damm, Wald, Belag aus OSM. Geländeklasse und Talindex. Querneigung als Standard 2,5 %, Verwindungsbereiche als Unbekannt markieren.
3. **Fahrbahntemperatur-Modell.** RoadSurf-artiger 1-D-Kern (MIT) mit Abschattung, METRo-Latentwärmehalt, eigener Brückensäule, Verkehrsterm 10/5 W m⁻² und Mindestwind. Durchlaufender Betrieb über Wochen statt Neustart. Unterer Rand auf DACH-Bodenklimatologie setzen.
4. **Kopplung an GMA.** Wo eine gültige Messung ≤ 6 h alt ist: 3-h-Kopplungsfenster, Faktor mit τ = 4 h abklingen lassen.
5. **Restfehler-Korrektur.** Erst DMI-artige Tabellen je Station × Stunde × Wetterklasse. Ab einem vollen Winter gepooltes GBM mit Standortmerkmalen und maskierten Lag-Merkmalen. Residuen-Interpolation zu Achspunkten im Höhenband.
6. **Speicher und Zustand.** Wasser, Porenwasser, Schnee, Eis, Reif; Klassen nach der Tabelle oben. Gefrierender Regen über Bourgouin + T_s, direkt in den Eisspeicher mit Latentwärme. Wasserfilm nach Gallaway aus Fusion-/Radar-Regenrate und Segmentgeometrie. Hauptszenario ohne Salz, optional Szenario "gestreut".
7. **Sicht.** Mischung RUC-EPS + MOSMIX + RUC-VIS, ab 27 h altes VIS bzw. eigene Diagnose; Kalibrierung gegen CDC.
8. **Auswertung und Anzeige.** Schichtweise Verifikation; Anzeigeregel mit Herkunftslabel und Unsicherheit.

### Precompute oder Browser

| Aufgabe | Ort | Grund |
|---|---|---|
| GRIB-Abruf, Dekodieren, Interpolation auf Achspunkte | GitHub Actions | große Dateien, v1-RUC nur 24 h vorgehalten, ICON-CH1 nur 24 h |
| LW↓-Rekonstruktion, Ent-Mittelung | GitHub Actions | braucht Felder mehrerer Zeitschritte |
| Energiebilanz und Speichermodell, 0–48 h | GitHub Actions | Modellzustand muss zwischen Läufen gespeichert werden (Einschwingen); eigene Rechnung: pro Punkt ≈ 86.000 Knotenupdates, unkritisch |
| Modellzustand (Temperaturprofil, Speicher) | als Datei im Repo/Artefakt | ohne Backend der einzige Ort für den Zustand |
| GMA-QC, Kopplung, Restfehler-Korrektur | GitHub Actions | braucht Archiv und Nachbarn |
| Statische Standortparameter | einmalig offline | ändert sich selten |
| Aquaplaning-Stufe aus Film und gewählter Geschwindigkeit | Browser | billig, nutzerabhängig |
| Szenario "gestreut" / "ungestreut" umschalten | Browser, wenn beide Speicherläufe vorliegen; sonst Precompute | Darstellung |
| Ensemble-Wahrscheinlichkeiten Sicht | GitHub Actions | 20 Member |

Eigene Abschätzung zum Rechenaufwand: Bei 5 km Abstand und grob 13.000 km Autobahn in Deutschland sind es etwa 2.600 Punkte (Netzlänge nicht aus den Notizen, ungeprüft). Der Engpass ist GRIB-Lesen, nicht die Physik.

### Ausgabefelder je Achspunkt und Stunde

| Feld | Einheit/Werte | Herkunft |
|---|---|---|
| `tf` | °C | Energiebilanz + Korrektur |
| `tf_sigma` | K | Wetterklasse × Vorlaufzeit aus Prüfstand |
| `tf_src` | gemessen / gekoppelt / modelliert / unbekannt | Anzeigeregel |
| `tf_bruecke` | °C (nur bei Brücken-Flag) | Brückensäule |
| `wasser_mm`, `schnee_mm`, `eis_mm`, `reif_mm` | mm w.e. | Speichermodell |
| `wasserfilm_mm` | mm über Textur | Gallaway |
| `zustand` | trocken / feucht / nass / Reif / überfrierende Nässe / Eis / Schneematsch / Schnee / Glatteis | Klassenregel |
| `glaette_p` | 0–1 | Kontingenz-Kalibrierung |
| `griff` | griffig / eingeschränkt / glatt / sehr glatt | Ersatz-Reibformel, Klasse |
| `szenario` | ungestreut (Standard) / gestreut | Salzannahme |
| `aqua_stufe` | 0–3 | Film 0,5 / 1,0 / 2,0 mm |
| `vis_p1000`, `vis_p300`, `vis_p150`, `vis_p50` | 0–1 | Sichtmischung |
| `vis_src` | gemessen / abgeleitet / prognostiziert | Sichtmischung |

### Offene Entscheidungen

1. **Kern-Code:** RoadSurf nach TypeScript/WASM portieren oder Fortran in GitHub Actions bauen. METRo-Teile nur nachbauen, nicht kopieren, sonst gilt GPL-2.0 (Lizenz-Ableitung, keine Rechtsberatung).
2. **"Jetzt" bei totem Sensor:** weiter "unbekannt" oder gekennzeichnete Modellschätzung mit σ.
3. **Salz:** nur ungestreut, oder zusätzlich das gestreute Szenario mit welcher Restsalzannahme (5–10 g m⁻²).
4. **Geometrie:** Verwindungsbereiche ohne offene Daten ignorieren, aus Kurvenradien (OSM-Geometrie) schätzen oder manuell pflegen.
5. **Österreich und Schweiz:** nur mit DWD-Feldern (ICON-D2-Domäne) arbeiten oder ICON-CH1 (24-h-Spiegelung nötig) und GeoSphere-Gitterdownloads ergänzen; Verifikation dort ist mangels offener Straßendaten nicht möglich.
6. **Sicht nach 30.11.2026:** eigene Diagnose für 27–48 h bauen oder auf MOSMIX allein gehen.
7. **Verkehrsabrieb:** finnische Faktoren übernehmen oder für Autobahnverkehr erhöhen; Kalibrierung gegen GMA-Abtrocknung.
8. **Schwellen:** Reif-Integral 1 K h, Glatteis-Floor 0,1 mm h⁻¹ und Reif-Mindestmenge sind gesetzt und müssen am GMA-Archiv kalibriert werden.

## Quellen

- [ALADIN 2019: Visibility report cy43t2bf10](https://www.cnrm.meteo.fr/aladin/IMG/pdf/report_visibility_cy43t2bf10_updated20191030.pdf)
- [Almkvist & Moniaci 2006: Neural network road temperature, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/Torino-D-15.pdf)
- [Almkvist, Gustavsson & Bogren 2005: An attempt to define the road climate room, Meteorol. Appl. 12](https://www.cambridge.org/core/journals/meteorological-applications/article/abs/an-attempt-to-define-the-road-climate-room/E6A1F316AEE2F06BB59EBAEF3E12A1E1)
- [Atmosphere 12/1666 (2021): Review of visibility parameterizations](https://www.mdpi.com/2073-4433/12/12/1666)
- [AWS Open Data Registry: Copernicus DEM](https://registry.opendata.aws/copernicus-dem/)
- [Bagui & Das 2014: Hydroplaning speed models, MJCE](https://journals.utm.my/mjce/article/download/15882/7365/48063)
- [Baran & Lakatos 2023: Statistical post-processing of visibility ensemble forecasts, arXiv 2305.15325](https://arxiv.org/pdf/2305.15325)
- [Bari & Ouagabi 2020: Machine learning visibility forecasting, SN Appl. Sci.](https://link.springer.com/article/10.1007/s42452-020-2327-x)
- [Bezrukova et al. 2006: Hoar frost diagnosis, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/Torino-D-08.pdf)
- [BFH/ASTRA 2010: Glätteprognosesystem SGPS](https://trimis.ec.europa.eu/system/files/project/documents/20150626_103439_19069_priloha_radek_1063_slipperyness.pdf)
- [BKG: Digitales Geländemodell DGM200](https://gdz.bkg.bund.de/index.php/default/digitales-gelandemodell-gitterweite-200-m-dgm200.html)
- [Bližňák et al. 2023: Impact of satellite-derived cloud cover on road weather forecasts, Atmos. Res. 292](https://asep.lib.cas.cz/arl-cav/en/detail-cav_un_epca-0573220-Impact-of-satellitederived-cloud-cover-on-road-weather-forecasts)
- [Blomqvist et al. 2011: Residual salt on roads, TRR 2258](https://journals.sagepub.com/doi/10.3141/2258-16)
- [Bogren et al. 2000: Impact of screening on road surface temperature, Meteorol. Appl. 7](https://www.cambridge.org/core/journals/meteorological-applications/article/impact-of-screening-on-road-surface-temperature/7DA0FE1A4EA2EB57286855A3181EA3AB)
- [Bouilloud 2012: ISBA-Route initialisation with RWIS, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/Helsinki-P-34.pdf)
- [Chapman & Thornes: Geographical parameter (thermal fingerprint) model, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/Bingen-D-15.pdf)
- [Chapman, Thornes & Bradley 2001: Modelling road surface temperature from a geographical parameter database, Meteorol. Appl. 8](https://research.birmingham.ac.uk/en/publications/modelling-of-road-surface-temperature-from-a-geographical-paramet/)
- [Claußen 2020: Straßen-Wetter-Informationen, KIT-Kolloquium](https://www.ise.kit.edu/rd_download/SEB/KIT%20Kolloquium%2020200122%2001%20Stra%c3%9fen-Wetter-Informationen%20Clau%c3%9fen.pdf)
- [CM SAF Web UI](https://wui.cmsaf.eu/safira/action/viewProduktSearch)
- [Crevier & Delage 2001: METRo – a new model for road-condition forecasting in Canada, J. Appl. Meteor. 40](https://collaboration.cmc.ec.gc.ca/science/rpn/publications/pdf/METRo_JAM2001.pdf)
- [Crouch et al. 2005: RWIS sensor malfunction detection, UMN Duluth](https://www.d.umn.edu/natsrl/documents/FY2005reports/rwisSensorMalfunction2005.pdf)
- [DATEX II: Austrian reference profile SRTI](https://repo.datex2.eu/implementations/profile_directory/austrian-reference-profile-srti)
- [Deckert & Hauf 2003: Evaporation from road surfaces, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/Bingen-D-20.pdf)
- [Ding & Kwon 2022: Road friction risk classification, Future Transportation](https://www.mdpi.com/2673-7590/2/4/54)
- [DMI 2016: Fog visibility tests in HIRLAM](https://www.dmi.dk/fileadmin/user_upload/Rapporter/TR/2016/fog_tst_v3.pdf)
- [DMI Scientific Report 12-05: Road temperature bias correction](https://www.dmi.dk/fileadmin/user_upload/Rapporter/SR/2012/sr12-05.pdf)
- [DMI Scientific Report 13-02: SVD regression correction](https://www.dmi.dk/fileadmin/user_upload/Rapporter/SR/2013/sr13-02.pdf)
- [DMI Technical Report 10-12: Road conditions model](https://www.dmi.dk/fileadmin/Rapporter/TR/tr10-12.pdf)
- [DMI Technical Report 99-1: Road conditions model verification](https://www.dmi.dk/fileadmin/user_upload/Rapporter/TR/1999/tr99-1.pdf)
- [DWD Open Data README](https://opendata.dwd.de/README.txt)
- [DWD Open Data: alte ICON-D2-Liste](https://opendata.dwd.de/weather/nwp/icon-d2/grib/00/)
- [DWD Open Data: alte ICON-EU-Liste](https://opendata.dwd.de/weather/nwp/icon-eu/grib/00/)
- [DWD Open Data: ATHB_S-Liste](https://opendata.dwd.de/weather/nwp/icon-d2/grib/03/athb_s/)
- [DWD Open Data: CDC visibility](https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/visibility/recent/)
- [DWD Open Data: DD](https://opendata.dwd.de/weather/weather_reports/road_weather_stations/DD/)
- [DWD Open Data: DWD nwp](https://opendata.dwd.de/weather/nwp/)
- [DWD Open Data: icon-d2/grib/00/vis](https://opendata.dwd.de/weather/nwp/icon-d2/grib/00/vis/)
- [DWD Open Data: icon-eu/grib/00/vis](https://opendata.dwd.de/weather/nwp/icon-eu/grib/00/vis/)
- [DWD Open Data: MetElementDefinition.xml](https://opendata.dwd.de/weather/lib/MetElementDefinition.xml)
- [DWD Open Data: road_weather_stations](https://opendata.dwd.de/weather/weather_reports/road_weather_stations/)
- [DWD Open Data: RUC PRR_GSP](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2-ruc/p/PRR_GSP/r/2026-10-27T14:00/s/)
- [DWD Open Data: RUC T_G](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2-ruc/p/T_G/r/2026-10-27T14:00/s/)
- [DWD Open Data: RUC VIS Laufliste](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2-ruc/p/VIS/r/)
- [DWD Open Data: SIS](https://opendata.dwd.de/weather/satellite/radiation/sis/)
- [DWD Open Data: SWSMOS](https://opendata.dwd.de/weather/local_forecasts/swsmos/)
- [DWD Open Data: v1 ICON-D2](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2/p/)
- [DWD Open Data: v1 icon-d2-ruc-eps/p](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2-ruc-eps/p/)
- [DWD Open Data: v1 icon-d2-ruc/p](https://opendata.dwd.de/weather/nwp/v1/m/icon-d2-ruc/p/)
- [DWD Open Data: v1 icon-eu/p](https://opendata.dwd.de/weather/nwp/v1/m/icon-eu/p/)
- [DWD Open Data: v1/m](https://opendata.dwd.de/weather/nwp/v1/m/)
- [FHWA: Anti-icing manual, Appendix A](https://www.fhwa.dot.gov/publications/research/safety/95202/004.cfm)
- [Fundel 2025: ICON-D2 model errors, COSMO WG5](https://www.cosmo-model.org/content/tasks/workGroups/wg5/meetings/2025-01/20250121_ICON-D2_model_errors_ffundel.pdf)
- [Gallaway, Schiller & Rose 1971: Pavement surface water depth, TTI 138-5](https://library.ctr.utexas.edu/hostedPDFs/tti/138-5.pdf)
- [GDI-DE Metadaten: DWD SWS-Beobachtungen](https://gdk.gdi-de.org/geonetwork/srv/api/records/de.dwd.geoserver.fach.SWS_Beobachtungen)
- [GeoSphere Austria: SYNOP v1 1h](https://data.hub.geosphere.at/en/dataset/synop-v1-1h)
- [GeoSphere C-LAEF nwp-v2-1h-1km Metadaten](https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v2-1h-1km/metadata)
- [GeoSphere Dataset API: Request limits](https://dataset.api.hub.geosphere.at/v1/docs/user-guide/request-limit.html)
- [GeoSphere NWP nwp-v1-1h-2500m Metadaten](https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v1-1h-2500m/metadata)
- [GribStream: ICON-D2](https://gribstream.com/models/icond2)
- [Guidry 2023: Bridge vs road surface temperatures in Ohio, NWC REU](https://caps.ou.edu/reu/reu23/finalpapers/Guidry_FinalPaper.pdf)
- [Gultepe et al.: Ice fog and visibility parameterization, AMS-Konferenzbeitrag](https://ams.confex.com/ams/pdfpapers/149116.pdf)
- [Gultepe et al.: Visibility parameterizations (FRAM), AMS-Konferenzbeitrag](https://ams.confex.com/ams/pdfpapers/113177.pdf)
- [Gustavsson 1990: Variation in road surface temperature due to topography, Theor. Appl. Climatol. 41](https://link.springer.com/article/10.1007/BF00866454)
- [Haavasoja & Pilli-Sihvola 2010: Friction measurement, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/Quebec-D-11.pdf)
- [Hadzimustafic & Kann 2016: WINTER-FIT, DACH2016-73](https://meetingorganizer.copernicus.org/DACH2016/DACH2016-73.pdf)
- [Hewson & Gait 1992: Hoar frost deposition on roads](https://trid.trb.org/View/375809)
- [Hippi, Juga & Nurmi 2010: Friction model of FMI, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/Quebec-D-15.pdf)
- [Hoffmann, Nutz & Blab 2014: Holistic winter maintenance model, PIARC Andorra](https://proceedings-andorra2014.piarc.org/content/actes/72_eng.pdf)
- [Hopwood: Met Office road forecast verification and Kalman filter, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/Bingen-D-12.pdf)
- [Karlsson 2001: Prediction of hoar-frost by use of a road weather information system, Meteorol. Appl. 8](https://www.cambridge.org/core/journals/meteorological-applications/article/abs/prediction-of-hoarfrost-by-use-of-a-road-weather-information-system/EED31E01C4FD8293C852A736F23E245C)
- [Karsisto & Horttanainen 2022: Sky view factor and screening in RoadSurf, SIRWEC](https://sirwec.org/wp-content/uploads/2023/10/sirwec2022_1.4_Karsisto_Horttanainen.pdf)
- [Karsisto & Lovén 2019: Verification of road weather forecasts with mobile observations, WAF 34](https://oulurepo.oulu.fi/handle/10024/24858)
- [Karsisto & Pirinen 2019: Kriging of road surface temperature, EMS2019-58](https://meetingorganizer.copernicus.org/EMS2019/EMS2019-58.pdf)
- [Karsisto 2024: RoadSurf 1.1, GMD 17, 4837](https://gmd.copernicus.org/articles/17/4837/2024/gmd-17-4837-2024.pdf)
- [Karsisto 2025: XGBoost correction of RoadSurf, EMS2025-188](https://meetingorganizer.copernicus.org/EMS2025/EMS2025-188.html)
- [Karsisto et al. 2021: FMI road weather interpolation, EMS2021-145](https://presentations.copernicus.org/EMS2021/EMS2021-145_presentation.pdf)
- [Khalifa et al. 2016: Traffic effects in TEB road model, GMD 9, 547](https://gmd.copernicus.org/articles/9/547/2016/gmd-9-547-2016.pdf)
- [Kwon: Optimal RWIS sensor density, Aurora Phase II](https://www.intrans.iastate.edu/wp-content/uploads/sites/3/2020/01/Aurora-Project-Report_Phase-II_Final_Draft.pdf)
- [Li et al. 2026: ILES road surface temperature nowcasting, GMD 19, 9035](https://gmd.copernicus.org/articles/19/9035/2026/gmd-19-9035-2026.pdf)
- [LiDAR-based shading and sky-view factor vs road surface temperature, Theor. Appl. Climatol.](https://link.springer.com/article/10.1007/s00704-015-1508-9)
- [Linden & Drobot: Clarus/MDSS road temperature verification, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/Quebec-D-38.pdf)
- [Linden & Petty 2008: Pavement model comparisons in MDSS, AMS](https://ams.confex.com/ams/pdfpapers/132234.pdf)
- [LSA SAF Datenserver](https://datalsasaf.lsasvcs.ipma.pt/)
- [Lysbakken 2008: Salt on road surfaces, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/Prague-D-31.pdf)
- [MADIS: RWIS and Clarus QC notes](https://madis.ncep.noaa.gov/madis_rwis_qc_notes.shtml)
- [Malmivuo 2011: Friction limits in Finland, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/Helsinki-P-41.pdf)
- [Marosek 2005: Evaluation of RWIS pavement sensors, WTI](https://westerntransportationinstitute.org/wp-content/uploads/2016/08/426218_Final_Report.pdf)
- [Mayer et al. 2021: METRo in Norway, EMS2021-294](https://presentations.copernicus.org/EMS2021/EMS2021-294_presentation.pdf)
- [MeteoSwiss ICON-CH1 STAC-Items](https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-forecasting-icon-ch1/items?limit=100)
- [MeteoSwiss: Nutzungsbedingungen](https://opendatadocs.meteoswiss.ch/general/terms-of-use)
- [MeteoSwiss: NWP](https://opendatadocs.meteoswiss.ch/e-forecast-data/e2-e3-numerical-weather-forecasting-model)
- [METRo-Quellcode: balanc.f](https://github.com/K0I05/METRo/blob/master/src/model/balanc.f)
- [METRo-Quellcode: balanc.f](https://raw.githubusercontent.com/K0I05/METRo/master/src/model/balanc.f)
- [METRo-Quellcode: constPhys.f](https://github.com/K0I05/METRo/blob/master/src/model/constPhys.f)
- [METRo-Quellcode: coupla.f](https://github.com/K0I05/METRo/blob/master/src/model/coupla.f)
- [METRo-Quellcode: flxsurfz.f](https://github.com/K0I05/METRo/blob/master/src/model/flxsurfz.f)
- [METRo-Quellcode: GitHub-Spiegel (K0I05/METRo)](https://github.com/K0I05/METRo)
- [METRo-Quellcode: grille.f](https://github.com/K0I05/METRo/blob/master/src/model/grille.f)
- [METRo-Quellcode: lib_therm.f](https://github.com/K0I05/METRo/blob/master/src/model/lib_therm.f)
- [METRo-Quellcode: lib_therm.f](https://raw.githubusercontent.com/K0I05/METRo/master/src/model/lib_therm.f)
- [METRo-Quellcode: macadam.c](https://github.com/K0I05/METRo/blob/master/src/model/macadam.c)
- [METRo-Quellcode: metro_constant.py](https://github.com/K0I05/METRo/blob/master/src/frontend/toolbox/metro_constant.py)
- [Mewes & Hart: Probabilistic frost forecasting, AMS](https://ams.confex.com/ams/pdfpapers/72264.pdf)
- [MPI-M ICON-Forum: Averaging of ASWDIR_S/ASWDIFD_S](https://code.mpimet.mpg.de/boards/2/topics/15240)
- [NCEP HRRR CALVIS_GSD.f](https://www.nco.ncep.noaa.gov/pmb/codes/nwprod/hrrr.v4.1.19/sorc/hrrr_wrfpost.fd/CALVIS_GSD.f)
- [NCEP RAP CALVIS.f](https://www.nco.ncep.noaa.gov/pmb/codes/nwprod/rap.v5.1.20/sorc/rap_wrfpost.fd/CALVIS.f)
- [NCEP RAP CALWXT_BOURG.f](https://www.nco.ncep.noaa.gov/pmb/codes/nwprod/rap.v5.1.20/sorc/rap_wrfpost.fd/CALWXT_BOURG.f)
- [NTUA: Assessing aquaplaning thresholds through critical vehicle and freeway geometric parameters](https://nrso.ntua.gr/wp-content/uploads/Assessing-Aquaplaning-Thresholds-through-Critical-Vehicle-and-Freeway-Geometric-Parameters.pdf)
- [Nutz 2015: Straßenzustandsmodell beim Einsatz von Taumitteln, TU Wien](https://repositum.tuwien.at/handle/20.500.12708/2843)
- [NWS CRH TA 16-02: Blowing snow model](https://www.weather.gov/media/crh/publications/TA/TA_1602.pdf)
- [NZTA TM-2502: Calculating road surface water run-off](https://nzta.govt.nz/assets/resources/calculating-road-surface-water-run-off/docs/tm2502.pdf)
- [Opara & Zieliński 2017: Road temperature modelling without in-situ sensors, BJRBE 12(4)](https://bjrbe-journals.rtu.lv/bjrbe/article/download/bjrbe.2017.30/428/732)
- [OSM cutting](https://wiki.openstreetmap.org/wiki/Key:cutting)
- [OSM surface](https://wiki.openstreetmap.org/wiki/Key:surface)
- [Petersen 2022: DMI residual salt model, SIRWEC](https://sirwec.org/wp-content/uploads/2023/10/sirwec2022_1.7_Petersen.pdf)
- [Remote Sensing 14/4865 (2022): Visibility parameterization](https://www.mdpi.com/2072-4292/14/19/4865)
- [ROADIDEA D3.4b: Road weather model development (FMI)](https://cordis.europa.eu/docs/projects/cnect/5/215455/080/deliverables/001-ROADIDEAD34bRoadweathermodeldevelopment1.pdf)
- [RoadSurf GitHub (fmidev/RoadSurf)](https://github.com/fmidev/RoadSurf)
- [RoadSurf-Quellcode: BalanceModel.f90](https://github.com/fmidev/RoadSurf/blob/master/src/BalanceModel.f90)
- [RoadSurf-Quellcode: BoundaryLayer.f90](https://github.com/fmidev/RoadSurf/blob/master/src/BoundaryLayer.f90)
- [RoadSurf-Quellcode: Coupling.f90](https://github.com/fmidev/RoadSurf/blob/master/src/Coupling.f90)
- [RoadSurf-Quellcode: Initialization.f90](https://github.com/fmidev/RoadSurf/blob/master/src/Initialization.f90)
- [RoadSurf-Quellcode: InputParameters.h](https://github.com/fmidev/RoadSurf/blob/master/examples/example1/src/InputParameters.h)
- [RoadSurf-Quellcode: ModRadiation.f90](https://github.com/fmidev/RoadSurf/blob/master/src/ModRadiation.f90)
- [RoadSurf-Quellcode: Relaxation.f90](https://github.com/fmidev/RoadSurf/blob/master/src/Relaxation.f90)
- [Rutz & Gibson 2013: METRo road forecasts in the western US](https://www.inscc.utah.edu/~rutz/pubs/Rutz_and_Gibson_2013.pdf)
- [Schedler et al. 2020: Streckenbezogene Glättevorhersage, BASt V 329](https://opus4.hbz-nrw.de/opus45-bast/files/2399/V329_barrfreiPDF.pdf)
- [Schicker et al. 2023: Post-processing road surface temperature in Austria, EMS2023-471](https://meetingorganizer.copernicus.org/EMS2023/EMS2023-471.html)
- [Schmitz 2019: DWD road weather, EUMETrain Road Weather Event Week](https://resources.eumetrain.org/data/5/557/roadew2019_s3b.pdf)
- [Schultz et al. 2025: HYMEC/NASMA surface hydrometeor classification, PrePEP-Poster](https://indico.kit.edu/event/4015/contributions/18464/attachments/9061/15237/PrePEP_mschultz.pdf)
- [Sekula 2018: Visibility in ALADIN, Ljubljana](https://www.cnrm-game-meteo.fr/aladin/IMG/pdf/sekula_visibility_ljubljanasep2018-1.pdf)
- [Simon & Szarka 2018: METRo in Hungary, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/6.6_Simon.pdf)
- [Smolyakov & Burnaev: Road surface temperature forecasting with METRo and machine learning, arXiv 2003.09957](https://arxiv.org/pdf/2003.09957)
- [Sokol et al. 2014: METRo nowcasting in the Czech Republic, SIRWEC](https://sirwec.org/wp-content/uploads/2022/04/Andorra-D-13.pdf)
- [StVO § 17](https://www.gesetze-im-internet.de/stvo_2013/__17.html)
- [StVO § 3](https://www.gesetze-im-internet.de/stvo_2013/__3.html)
- [swisstopo: Terms and conditions](https://www.swisstopo.admin.ch/en/terms-and-conditions)
- [TII: Review of geometric design (water film depth)](https://publications.tii.ie/media/2x4fswfi/review-of-geometric-design.pdf)
- [Toivonen et al. 2019, GMD 12, 3481 (PDF)](https://gmd.copernicus.org/articles/12/3481/2019/gmd-12-3481-2019.pdf)
- [Toivonen et al. 2019, Preprint gmd-2018-330](https://gmd.copernicus.org/preprints/gmd-2018-330/gmd-2018-330.pdf)
- [Toivonen et al. 2019: Road weather model with climate model forcing, GMD 12, 3481](https://gmd.copernicus.org/articles/12/3481/2019/)
- [TPF-5(435): Roadway friction modeling, final report](https://publications.iowa.gov/43824/1/roadway_friction_modeling_w_cvr.pdf)
- [Trapp 2002: Wasserfilm in Verwindungsbereichen, Straße und Autobahn](https://trid.trb.org/View/957963)
- [Trepte & Schmitz 2024: DWD road surface temperature, METRo vs MOS, EMS2024-148](https://meetingorganizer.copernicus.org/EMS2024/EMS2024-148.html)
- [TRL Expert Witness: Aquaplaning](https://expertwitness.trl.co.uk/?p=1278)
- [University of Alberta Thesis: Visibility in snow](https://era.library.ualberta.ca/items/ed388411-0a30-46af-a1cb-67000d3ac64c/download/93eb4b8b-11c4-4196-b44b-92043a0341d4)
- [Van den Bergh et al. 2024: RMI multi-NWP road weather ensemble, SIRWEC](https://sirwec.org/wp-content/uploads/2024/07/7-sirwec2024_jvandenbergh.pdf)
- [Walsh 2021: Met Éireann road weather verification, TII](https://tii.ie/media/na1nejz5/03-liz-walsh_met_pres_nov2021.pdf)
- [Westerhuis et al. 2019: Fog and low stratus in COSMO-1, IFDA2019-67](https://meetingorganizer.copernicus.org/IFDA2019/IFDA2019-67.pdf)
- [wetterdienst-Dokumentation: DWD](https://wetterdienst.readthedocs.io/en/latest/_sources/data/provider/dwd/index.md)
- [wetterdienst-Dokumentation: DWD road weather 15 minutes](https://wetterdienst.readthedocs.io/en/latest/_sources/data/provider/dwd/road/15_minutes.md)
- [wetterdienst-Dokumentation: DWD SWSMOS hourly](https://wetterdienst.readthedocs.io/en/latest/_sources/data/provider/dwd/swsmos/hourly.md)
- [wetterdienst.de: Das Lied von Eis und Wasser](https://www.wetterdienst.de/Deutschlandwetter/Thema_des_Tages/4477/das-lied-von-eis-und-wasser)
- [WMO: Road weather services in Germany](https://old.wmo.int/extranet/pages/prog/amp/pwsp/documents/RoadWeather_Germany.pdf)
- [Zakšek, Oštir & Kokalj 2011: Sky-view factor, Remote Sensing 3(2)](https://www.mdpi.com/2072-4292/3/2/398)
