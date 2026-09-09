# Quellenmatrix — Punktvorhersage 0–336 h

**Stand:** 2026-09-09 · **Geltungsbereich:** DE, AT, CH · **Status:** Entwurf

Welche Primärquellen der Algorithmus je Standortland und Vorhersagestunde braucht.
Ergänzt die Ablaufpläne (`ABLAUFPLAENE.md`), wird aber getrennt geführt: Quellen
ändern sich unabhängig vom Algorithmus — Abschaltungen, neue Modelle, geänderte
Lizenzen betreffen nur diese Datei.

**Lesart der Tabellen**

| Auszeichnung | Bedeutung |
|---|---|
| **fett** | Primärquelle — ohne sie fehlt dem Bereich die tragende Information |
| normal | ergänzt die Fusion, verbessert Genauigkeit oder Unsicherheit |
| ⚠ | räumlich oder zeitlich eingeschränkt, siehe Fußnote |
| — | keine geeignete Quelle vorhanden |

---

## 1. Primärquellen nach Standortland und Vorhersagestunde

| Bereich | Deutschland | Österreich | Schweiz |
|---|---|---|---|
| **0–3 h** | **RADVOR RV** (1 km, 5 min, ≈ +2 h)<br>RADOLAN RY, HG<br>**ICON-D2** | **INCA Nowcast** (1 km, 15 min, +3 h)<br>RV ⚠¹<br>**ICON-D2** | **CombiPrecip** (5 min)<br>PRECIP RZC<br>**ICON-CH1-EPS** ⚠² |
| **3–33 h** | **ICON-D2** (2,2 km, 8 Läufe)<br>ICON-D2-EPS (20 M)<br>MOSMIX-S / -L | **C-LAEF AlpeAdria** (1 km)<br>C-LAEF-EPS ⚠³<br>ICON-D2, MOSMIX-L | **ICON-CH1-EPS** (1 km, 11 M)<br>**E4 Local Forecast** ⚠⁴<br>ICON-D2, KENDA-CH1 |
| **33–48 h** | **ICON-D2**<br>ICON-D2-EPS<br>MOSMIX-L | **C-LAEF AlpeAdria**<br>C-LAEF-EPS<br>ICON-D2, MOSMIX-L | **ICON-CH2-EPS** (2,1 km, 21 M)<br>**E4 Local Forecast**<br>ICON-D2 |
| **48–60 h** | **ICON-EU** ⚠⁵<br>ICON-EU-EPS (40 M)<br>MOSMIX-L | **C-LAEF AlpeAdria**<br>C-LAEF-EPS<br>ICON-EU, MOSMIX-L | **ICON-CH2-EPS**<br>**E4 Local Forecast**<br>ICON-EU |
| **60–120 h** | **ICON-EU** ⚠⁵<br>ICON-EU-EPS<br>MOSMIX-L | **ICON-EU** ⚠⁵<br>ICON-EU-EPS<br>MOSMIX-L | **ICON-CH2-EPS**<br>**E4 Local Forecast**<br>ICON-EU |
| **120–180 h** | **ICON global** ⚠⁶<br>**AICON** (KI, 13 km)<br>ICON-EPS global (40 M)<br>MOSMIX-L, IFS | **ICON global** ⚠⁶<br>**AICON**<br>ICON-EPS global<br>MOSMIX-L, IFS | **ICON global** ⚠⁶<br>**AICON**<br>**E4 Local Forecast**<br>ICON-EPS global, IFS |
| **180–240 h** | **IFS HRES + IFS ENS** (51 M)<br>**AIFS Single / ENS**<br>MOSMIX-L (bis 240 h) | **IFS HRES + IFS ENS**<br>**AIFS Single / ENS**<br>MOSMIX-L (bis 240 h) | **IFS HRES + IFS ENS**<br>**AIFS Single / ENS**<br>E4 (bis 216 h), MOSMIX-L |
| **240–336 h** | **IFS ENS**<br>**AIFS ENS**<br>IFS HRES ⚠⁷ | **IFS ENS**<br>**AIFS ENS**<br>IFS HRES ⚠⁷ | **IFS ENS**<br>**AIFS ENS**<br>IFS HRES ⚠⁷ |

### Fußnoten zur Matrix

**⚠¹ RADVOR RV in Österreich nur im Westen.** Das DWD-Komposit reicht 150 km um die
Radarstandorte, praktisch also nur **westlich ca. 14,0–14,3 °E**. Abgedeckt: Bregenz,
Kufstein, Salzburg, Innsbruck, Zell am See. Nicht abgedeckt: Linz, Graz, Klagenfurt,
Villach, **Wien**. Für Ostösterreich trägt allein INCA.

**⚠² ICON-CH1-EPS ist in Ostösterreich nicht nutzbar.** Die Domain reicht geometrisch
bis 17,7 °E, die Ostspitze Österreichs liegt aber nur ~15–20 km vom Rand entfernt —
mitten im lateralen Randrelaxationsbereich. MeteoSchweiz weist selbst darauf hin, dass
Werte am Domainrand zufällig sein können. Empfehlung: Domain um mindestens 20 km
einschneiden, wie Open-Meteo es tut.

**⚠³ C-LAEF-EPS liefert keine Einzelmember**, nur P10/P50/P90 je Parameter. Für
kalibrierte Bänder ausreichend, für member-basiertes Post-Processing (EMOS/BMA) nicht.

**⚠⁴ E4 Local Forecast ist eine Punktquelle, kein Gitter.** ~6.000 feste Punkte
(PLZ, SwissMetNet-Stationen, Berg-POIs), **ausschließlich in der Schweiz**, keine
grenzüberschreitenden Punkte. Läuft durchgehend über 0–216 h parallel zu den
Gitterquellen und ist gleichzeitig der Benchmark, den der Algorithmus in der Schweiz
schlagen muss.

**⚠⁵ ICON-EU reicht nur bei den Hauptläufen bis 120 h.** Bei 00/06/12/18 UTC: 120 h.
Bei **03/09/15/21 UTC: nur 48 h**. Für die Hälfte aller Läufe klafft zwischen 48 h und
120 h eine Lücke, die aus ICON global oder IFS gefüllt werden muss.

**⚠⁶ ICON global reicht nur bei 00/12 UTC bis 180 h**, bei 06/18 UTC nur bis 120 h.

**⚠⁷ IFS HRES reicht nur bei 00/12 UTC bis 360 h.** Die Läufe 06/18 UTC (`scda`)
enden bei 144 h. Für 240–336 h stehen also nur die beiden Hauptläufe zur Verfügung.

---

## 2. Räumliche Abdeckung der Quellen

Nicht jede Quelle deckt jedes Land ab. Für Punkte nahe der Landesgrenze entscheidet
die Domain, nicht die Staatszugehörigkeit.

| Quelle | Domain | DE | AT | CH |
|---|---|---|---|---|
| ICON-D2 / D2-EPS | 43,2–58,1 °N / 3,9 °W–20,3 °E | ✓ | ✓ | ✓ |
| ICON-EU / EU-EPS | 29,5–70,5 °N / 23,5 °W–62,5 °E | ✓ | ✓ | ✓ |
| ICON global, AICON, IFS, AIFS | global | ✓ | ✓ | ✓ |
| **RADVOR RV / RADOLAN** | DE1200-Gitter, real 150 km um DWD-Radare | ✓ | teilweise, nur < 14,1 °E | teilweise, nur > 46,5–46,8 °N |
| **C-LAEF AlpeAdria (1 km)** | 43,00–51,50 °N / 5,03–22,57 °E | teilweise, nur < 51,5 °N | ✓ | ✓ |
| **INCA Analyse / Nowcast** | 45,5–49,5 °N / 8,10–17,74 °E | teilweise (Süd) | ✓ | teilweise, nur > 8,1 °E |
| **ICON-CH1 / CH2-EPS** | ~42,0–50,5 °N / 0,8 °W–17,7 °E | teilweise, nur < 50,5 °N | ✓ aber Randlage ⚠² | ✓ |
| **CombiPrecip** | ~43,6–49,5 °N / 2,7–12,5 °E | teilweise (SW/S) | teilweise, nur < 12,4 °E | ✓ |
| **E4 Local Forecast** | 45,82–47,81 °N / 5,96–10,49 °E | ✗ | ✗ | ✓ (nur Punkte) |
| MOSMIX-L | Stationsnetz weltweit | ✓ | ✓ | ✓ (104 Stationen) |

**Praktische Konsequenz:** Zwei Punkte in Österreich brauchen unterschiedliche Quellen.
Bregenz bekommt RV, CombiPrecip und ICON-CH1; Wien bekommt keines davon und ist im
Nowcast allein auf INCA angewiesen. Die Quellenauswahl muss also **geometrisch** über
die Domain entschieden werden, nicht über das Land.

---

## 3. Querschnittsquellen — unabhängig von Ort und Zeitraum

### Statische Geodaten (einmalig, im Terrain-Stack)

| Zweck | Quelle | Auflösung | Zugang |
|---|---|---|---|
| Höhe | Copernicus DEM GLO-30 | 30 m | AWS-Bucket, anonym |
| Landnutzung, z₀ | ESA WorldCover v200 | 10 m | AWS-Bucket, anonym |
| Versiegelung | GHS-BUILT-S R2023A | 100 m | JRC, anonym |
| Gebäudehöhe | GHS-BUILT-H | 100 m | JRC, anonym |

Abgeleitet und mit ausgeliefert: Slope, Aspect, SVF, TPI (zwei Skalen), DAH, Sx je
Richtung, Föhn-Lee-Masken, Distanz zu Wasser.

### Beobachtungen — für Bias-Korrektur und Verifikation

| Land | Echtzeit | Verifikation (geprüft) |
|---|---|---|
| DE | DWD POI, stündlich, 748+ Stationen | CDC `hourly` / `10_minutes`, ab 1946 bzw. 1991 |
| AT | TAWES 10 min ⚠ nur 3 Monate Vorhalt | **`klima-v2-1h`** mit Qualitätsflags, ab 1941 |
| CH | SwissMetNet, 10 min, ~160 Stationen | SwissMetNet-Historie, vor 1981 zurück |

⚠ In Österreich ist **`klima-v2`** die Verifikationsquelle, nicht TAWES: TAWES liefert
ungeprüfte Rohdaten und hält nur drei Monate.

---

## 4. Vorhaltezeiten — was archiviert werden muss

Der kritische Punkt für die Verifikation: Die meisten Quellen sind nach kurzer Zeit weg
und nirgends nachkaufbar.

| Quelle | Vorhalt beim Anbieter | Freies Archiv |
|---|---|---|
| ICON-D2, D2-EPS | ~24 h | **keines** |
| ICON-EU, EU-EPS | ~24 h | nur ab 2026-02 (~7 Monate) |
| ICON global, ICON-EPS | ~24 h | keines |
| AICON | laufender Tag | **keines** |
| MOSMIX-S / -L | 48 h | **keines** — PAMORE schließt MOSMIX aus |
| ICON-CH1 / CH2-EPS | **24 h** | keines |
| C-LAEF, INCA | API-abhängig | INCA-Analyse ab 2011 verfügbar |
| RADOLAN, RV | 48 h | keines |
| CombiPrecip | 14 Tage | keines |
| **IFS HRES / ENS, AIFS** | Portal ~3 Tage | **`s3://ecmwf-forecasts` ab 2023-01-18** |
| NOAA GFS / GEFS | — | ab 2021 bzw. 2017 |

**Was daraus folgt:** Alles außer den ECMWF- und NOAA-Quellen muss ab Tag 1 selbst
archiviert werden — als Punktextraktion an den Verifikationsstationen, nicht als
Volldaten. Jeder Tag ohne diesen Job ist für die Verifikation dauerhaft verloren.

---

## 5. Lizenzlage

| Quelle | Lizenz | Key nötig | Kommerziell | Auflage |
|---|---|---|---|---|
| DWD (alle Produkte) | CC BY 4.0 / GeoNutzV | nein | ja | „Datenbasis: Deutscher Wetterdienst" |
| GeoSphere Austria | CC BY 4.0 | nein | ja | Rate-Limit 240/h, 5/s |
| MeteoSchweiz | CC BY 4.0 | nein | ja | „Quelle: MeteoSchweiz"; **Warnungen nur unverändert** |
| ECMWF Open Data | CC BY 4.0 | nein | ja | ECMWF Terms of Use |
| NOAA GFS / GEFS | Public Domain | nein | ja | Attribution erbeten |
| Copernicus DEM | Copernicus-Lizenz | nein (AWS) | ja | Attributionstext bei Ableitungen |
| ESA WorldCover, GHSL | CC BY 4.0 | nein | ja | Namensnennung |

**Blockiert und nicht verwendbar:** CH-Nowcast E1 (nur auf Anfrage), DWD PAMORE
(Forschung/Lehre, entgeltpflichtig), Open-Meteo Free Tier (nicht-kommerziell),
CORINE-Direktabruf (Registrierung), Netatmo (OAuth-Key, Lizenz ungeklärt),
Blitzdaten (kostenpflichtig oder nicht-kommerziell).

---

## 6. Terminierte Änderungen

| Datum | Was | Konsequenz |
|---|---|---|
| **November 2026** | GeoSphere `nwp-v1-1h-2500m` (AROME 2,5 km) wird abgeschaltet | rechtzeitig auf `nwp-v2-1h-1km` migrieren; nicht neu darauf bauen |
| **30.09.2026** | `data.dynamical.org` ändert den Zugriffsweg | nur relevant, falls das ICON-EU-Teilarchiv genutzt wird |
| **Ende 2026** | MeteoSchweiz kündigt eine Einzelabfrage-API an | Chance: der CH-Nowcast könnte damit öffnen |
| offen | Copernicus DEM: CDSE hat den View-Service eingeschränkt (25.08.2026) | AWS-Bucket nutzen, Derivate selbst spiegeln |

---

## 7. Offene Punkte

- **MOSMIX-Stationszahlen für DE und AT nicht ermittelt.** Für die Schweiz sind es
  104 (verifiziert). Ob das Netz in Österreich dicht genug ist, damit MOSMIX dort als
  Fusionsquelle trägt, ist aus `mosmix_stationskatalog.cfg` auszuzählen.
- **Vorhersagelänge von RADVOR RV** (vermutlich +120 min in 5-min-Schritten) steckt im
  tar-Archiv und ist mit einem Download zu klären.
- **Praktisch nutzbarer Rand der ICON-CH-Domain** in Ostösterreich: 20 km Einschnitt ist
  eine Annahme nach Open-Meteo-Vorbild, keine Messung.
