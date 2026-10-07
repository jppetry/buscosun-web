# FR-2 — Messung je Plattformteil (Regel §8.4, eingefroren vor dem Lauf)

Läufe 2026-10-06T19:21:48.143Z (section) und 2026-10-06T19:26:38.042Z (route, event, notify), Dev-Server http://127.0.0.1:5231, Desktop ohne Drossel, je Messung frischer Kontext.

## route — NICHT bestanden

Orte ausgewertet 6/6, Rückfall des Cube-Pfads 0×, UV-Stunden aus dem DWD je Ort 24/24/24/0/0/0.

| Feld | live % | Cube % | K1 |
|---|---|---|---|
| temperature | 100.0 | 100.0 | ✓ |
| apparentTemperature | 100.0 | 100.0 | ✓ |
| windSpeed | 100.0 | 100.0 | ✓ |
| windDirection | 100.0 | 43.7 | ✗ |
| gustSpeed | 100.0 | 100.0 | ✓ |
| relativeHumidity | 69.0 | 100.0 | ✓ |
| cloudCoverTotal | 100.0 | 100.0 | ✓ |
| precipitation | 100.0 | 100.0 | ✓ |
| uvIndex | 28.6 | 28.6 | ✓ |
| snowLineM | 67.9 | 88.1 | ✓ |

| Ladezeit (Median) | live ms | Cube ms | K2 |
|---|---|---|---|
| cold | 775 | 1466 | ✗ |
| warm | 398 | 601 | ✓ |

Kontext (Median |Δ| Cube − live): T 0.60 K · Wind 0.36 m/s · Niederschlag 0.01 mm/h · Bewölkung 8.6 %

| Ort | live kalt/warm ms | Cube kalt/warm ms |
|---|---|---|
| München | 749 / 186 | 2421 / 891 |
| Hamburg | 752 / 221 | 1342 / 892 |
| Garmisch-Partenkirchen | 798 / 241 | 1422 / 860 |
| Innsbruck | 861 / 1096 | 2193 / 341 |
| Zürich | 936 / 555 | 1109 / 274 |
| Davos | 700 / 578 | 1510 / 244 |

## event — NICHT bestanden

Orte ausgewertet 6/6, Rückfall des Cube-Pfads 0×, UV-Stunden aus dem DWD je Ort 51/51/51/0/0/0.

| Feld | live % | Cube % | K1 |
|---|---|---|---|
| temperature | 100.0 | 100.0 | ✓ |
| apparentTemperature | 100.0 | 100.0 | ✓ |
| windSpeed | 100.0 | 100.0 | ✓ |
| windDirection | 100.0 | 27.1 | ✗ |
| gustSpeed | 100.0 | 100.0 | ✓ |
| relativeHumidity | 16.1 | 100.0 | ✓ |
| cloudCoverTotal | 100.0 | 100.0 | ✓ |
| precipitation | 100.0 | 100.0 | ✓ |
| uvIndex | 14.2 | 14.2 | ✓ |

| Ladezeit (Median) | live ms | Cube ms | K2 |
|---|---|---|---|
| cold | 889 | 1113 | ✓ |
| warm | 452 | 380 | ✓ |

Kontext (Median |Δ| Cube − live): T 0.39 K · Wind 0.17 m/s · Niederschlag 0.01 mm/h · Bewölkung 0.0 %

| Ort | live kalt/warm ms | Cube kalt/warm ms |
|---|---|---|
| München | 3038 / 221 | 1610 / 444 |
| Hamburg | 774 / 214 | 1203 / 430 |
| Garmisch-Partenkirchen | 832 / 297 | 974 / 530 |
| Innsbruck | 844 / 719 | 1022 / 292 |
| Zürich | 976 / 608 | 1539 / 330 |
| Davos | 933 / 959 | 1021 / 238 |

## notify — NICHT bestanden (K2)

_Korrektur nach dem Lauf: die Feldliste enthielt die Windrichtung, die die Benachrichtigungen nicht lesen; aus denselben Rohdaten neu ausgewertet — K1 jetzt erfüllt, K2 (kalt) bleibt rot._

Orte ausgewertet 6/6, Rückfall des Cube-Pfads 0×, UV-Stunden aus dem DWD je Ort 51/51/51/0/0/0.

| Feld | live % | Cube % | K1 |
|---|---|---|---|
| temperature | 100.0 | 100.0 | ✓ |
| apparentTemperature | 100.0 | 100.0 | ✓ |
| windSpeed | 100.0 | 100.0 | ✓ |
| gustSpeed | 100.0 | 100.0 | ✓ |
| relativeHumidity | 16.1 | 100.0 | ✓ |
| cloudCoverTotal | 100.0 | 100.0 | ✓ |
| precipitation | 100.0 | 100.0 | ✓ |
| uvIndex | 14.2 | 14.2 | ✓ |

| Ladezeit (Median) | live ms | Cube ms | K2 |
|---|---|---|---|
| cold | 784 | 1133 | ✗ |
| warm | 423 | 493 | ✓ |

Kontext (Median |Δ| Cube − live): T 0.39 K · Wind 0.17 m/s · Niederschlag 0.01 mm/h · Bewölkung 0.0 %

| Ort | live kalt/warm ms | Cube kalt/warm ms |
|---|---|---|
| München | 814 / 217 | 1135 / 476 |
| Hamburg | 677 / 217 | 921 / 509 |
| Garmisch-Partenkirchen | 754 / 250 | 1132 / 396 |
| Innsbruck | 751 / 883 | 1517 / 1003 |
| Zürich | 898 / 617 | 1907 / 1693 |
| Davos | 1536 / 597 | 918 / 236 |

## section — NICHT bestanden

Orte ausgewertet 6/6, Rückfall des Cube-Pfads 0×, UV-Stunden aus dem DWD je Ort 36/36/36/0/0/0.

| Feld | live % | Cube % | K1 |
|---|---|---|---|
| temperature | 100.0 | 100.0 | ✓ |
| windSpeed | 100.0 | 100.0 | ✓ |
| windDirection | 100.0 | 42.6 | ✗ |
| gustSpeed | 100.0 | 100.0 | ✓ |
| relativeHumidity | 51.4 | 100.0 | ✓ |
| cloudCoverTotal | 100.0 | 100.0 | ✓ |
| cloudCoverLow | 100.0 | 100.0 | ✓ |
| cloudCoverMid | 100.0 | 100.0 | ✓ |
| cloudCoverHigh | 100.0 | 100.0 | ✓ |

| Ladezeit (Median) | live ms | Cube ms | K2 |
|---|---|---|---|
| cold | 1187 | 1223 | ✓ |
| warm | 681 | 544 | ✓ |

Kontext (Median |Δ| Cube − live): T 0.58 K · Wind 0.13 m/s · Niederschlag 0.01 mm/h · Bewölkung 11.1 %

| Ort | live kalt/warm ms | Cube kalt/warm ms |
|---|---|---|
| München | 3277 / 468 | 1934 / 1362 |
| Hamburg | 926 / 549 | 1369 / 627 |
| Garmisch-Partenkirchen | 945 / 515 | 1616 / 660 |
| Innsbruck | 1123 / 812 | 1055 / 462 |
| Zürich | 1252 / 1369 | 1078 / 274 |
| Davos | 5664 / 1211 | 1046 / 194 |
