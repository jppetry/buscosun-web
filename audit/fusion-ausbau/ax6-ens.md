# AX-6 — Ensemble-Mittel in t3: roh am 0,25°-Punkt gegen die Wahrheit (MAE, Höhe mit Standardgradient)

Karte 2026-09-30T11:22Z · 389 Punkte · 129 Läufe (00z, jeder 3. Tag 2025-09-01…2026-09-21; 32 davon im Lauf-Fenster mit HRES/AIFS/ICON) · T 1742911, Wind 1739816, Böe 1631286 Zeilen. Skill = 1 − MAE(Kandidat)/MAE(Referenz); * signifikant besser, ! schlechter (DM auf Tagesmitteln, HLN, BH).

## MAE je Kandidat (Schicht all und window)

| Größe | Bin | Schicht | control | ensMean | ensMedian | dynMean2 | hres | aifsRun | runMean2 | clima |
|---|---|---|---|---|---|---|---|---|---|---|
| t | 126–240 | all | 2.896 (973176) | 2.500 (973176) | 2.487 (973176) | 2.473 (973176) | 2.639 (227362) | 2.390 (227362) | 2.304 (227362) | 3.245 (973176) |
| t | 126–240 | window | 2.639 (227362) | 2.274 (227362) | 2.282 (227362) | 2.304 (227362) | 2.639 (227362) | 2.390 (227362) | 2.304 (227362) | 3.190 (227362) |
| t | 126–240 | country:DE | 2.694 (510996) | 2.316 (510996) | 2.297 (510996) | 2.328 (510996) | 2.521 (119443) | 2.276 (119443) | 2.193 (119443) | 3.276 (510996) |
| t | 126–240 | country:AT | 3.075 (212020) | 2.649 (212020) | 2.657 (212020) | 2.627 (212020) | 2.756 (49482) | 2.493 (49482) | 2.395 (49482) | 3.126 (212020) |
| t | 126–240 | country:CH | 3.156 (250160) | 2.748 (250160) | 2.731 (250160) | 2.636 (250160) | 2.782 (58437) | 2.537 (58437) | 2.453 (58437) | 3.283 (250160) |
| t | 246–336 | all | 4.124 (769735) | 3.172 (769735) | 3.156 (769735) | 3.511 (769735) | 3.916 (173154) | 3.639 (173154) | 3.370 (173154) | 3.263 (769735) |
| t | 246–336 | window | 3.916 (173154) | 2.813 (173154) | 2.838 (173154) | 3.370 (173154) | 3.916 (173154) | 3.639 (173154) | 3.370 (173154) | 2.937 (173154) |
| t | 246–336 | country:DE | 3.948 (404170) | 3.060 (404170) | 3.054 (404170) | 3.416 (404170) | 3.770 (90975) | 3.582 (90975) | 3.304 (90975) | 3.282 (404170) |
| t | 246–336 | country:AT | 4.268 (167696) | 3.221 (167696) | 3.216 (167696) | 3.586 (167696) | 4.064 (37689) | 3.786 (37689) | 3.464 (37689) | 3.149 (167696) |
| t | 246–336 | country:CH | 4.363 (197869) | 3.359 (197869) | 3.313 (197869) | 3.641 (197869) | 4.089 (44490) | 3.632 (44490) | 3.426 (44490) | 3.320 (197869) |
| ws | 126–240 | all | 1.724 (971470) | 1.502 (971470) | — | — | — | — | — | — |
| ws | 126–240 | country:DE | 1.780 (507205) | 1.507 (507205) | — | — | — | — | — | — |
| ws | 126–240 | country:AT | 1.573 (209186) | 1.407 (209186) | — | — | — | — | — | — |
| ws | 126–240 | country:CH | 1.735 (255079) | 1.571 (255079) | — | — | — | — | — | — |
| ws | 246–336 | all | 1.889 (768346) | 1.592 (768346) | — | — | — | — | — | — |
| ws | 246–336 | country:DE | 2.000 (401125) | 1.633 (401125) | — | — | — | — | — | — |
| ws | 246–336 | country:AT | 1.681 (165454) | 1.455 (165454) | — | — | — | — | — | — |
| ws | 246–336 | country:CH | 1.839 (201767) | 1.623 (201767) | — | — | — | — | — | — |
| gust | 126–240 | all | 3.445 (910872) | 3.104 (910872) | — | — | — | — | — | — |
| gust | 126–240 | country:DE | 3.266 (446704) | 2.886 (446704) | — | — | — | — | — | — |
| gust | 126–240 | country:AT | 3.573 (209100) | 3.249 (209100) | — | — | — | — | — | — |
| gust | 126–240 | country:CH | 3.652 (255068) | 3.366 (255068) | — | — | — | — | — | — |
| gust | 246–336 | all | 3.847 (720414) | 3.404 (720414) | — | — | — | — | — | — |
| gust | 246–336 | country:DE | 3.719 (353268) | 3.214 (353268) | — | — | — | — | — | — |
| gust | 246–336 | country:AT | 3.916 (165392) | 3.513 (165392) | — | — | — | — | — | — |
| gust | 246–336 | country:CH | 4.015 (201754) | 3.648 (201754) | — | — | — | — | — | — |

## Paare (Skill des Kandidaten gegen die Referenz)

| Größe | Bin | Schicht | Kandidat | Referenz | n | Tage | MAE Kand. | MAE Ref. | Skill |
|---|---|---|---|---|---|---|---|---|---|
| gust | 126–240 | all | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 910872 | 127 | 3.104 | 3.445 | 9.9 %* |
| gust | 126–240 | country:AT | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 209100 | 127 | 3.249 | 3.573 | 9.1 %* |
| gust | 126–240 | country:CH | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 255068 | 127 | 3.366 | 3.652 | 7.8 %* |
| gust | 126–240 | country:DE | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 446704 | 127 | 2.886 | 3.266 | 11.7 %* |
| gust | 246–336 | all | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 720414 | 126 | 3.404 | 3.847 | 11.5 %* |
| gust | 246–336 | country:AT | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 165392 | 126 | 3.513 | 3.916 | 10.3 %* |
| gust | 246–336 | country:CH | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 201754 | 126 | 3.648 | 4.015 | 9.1 %* |
| gust | 246–336 | country:DE | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 353268 | 126 | 3.214 | 3.719 | 13.6 %* |
| t | 126–240 | all | IFS-ENS-Kontrolllauf | Klimatologie μ_c (LOSO) | 973176 | 127 | 2.896 | 3.245 | 10.8 %* |
| t | 126–240 | all | dyn-Route: (Kontrolle + AIFS)/2 | Klimatologie μ_c (LOSO) | 973176 | 127 | 2.473 | 3.245 | 23.8 %* |
| t | 126–240 | all | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 973176 | 127 | 2.500 | 2.896 | 13.7 %* |
| t | 126–240 | all | ENS-Mittel (50 Member) | dyn-Route: (Kontrolle + AIFS)/2 | 973176 | 127 | 2.500 | 2.473 | -1.1 % |
| t | 126–240 | all | ENS-Mittel (50 Member) | Klimatologie μ_c (LOSO) | 973176 | 127 | 2.500 | 3.245 | 23.0 %* |
| t | 126–240 | all | ENS-Mittel (50 Member) | Lauf: (HRES + AIFS)/2 | 227362 | 30 | 2.500 | 2.304 | 1.3 % |
| t | 126–240 | all | ENS-Mittel (50 Member) | IFS HRES (Lauf) | 227362 | 30 | 2.500 | 2.639 | 13.8 %* |
| t | 126–240 | all | ENS-Mittel (50 Member) | AIFS (Lauf) | 227362 | 30 | 2.500 | 2.390 | 4.9 % |
| t | 126–240 | all | ENS-Median | ENS-Mittel (50 Member) | 973176 | 127 | 2.487 | 2.500 | 0.5 % |
| t | 126–240 | all | IFS HRES (Lauf) | IFS-ENS-Kontrolllauf | 227362 | 30 | 2.639 | 2.896 | -0.0 % |
| t | 126–240 | all | Lauf: (HRES + AIFS)/2 | Klimatologie μ_c (LOSO) | 227362 | 30 | 2.304 | 3.245 | 27.8 %* |
| t | 126–240 | all | Lauf: (HRES + AIFS)/2 | IFS-ENS-Kontrolllauf | 227362 | 30 | 2.304 | 2.896 | 12.7 %* |
| t | 126–240 | country:AT | IFS-ENS-Kontrolllauf | Klimatologie μ_c (LOSO) | 212020 | 127 | 3.075 | 3.126 | 1.6 % |
| t | 126–240 | country:AT | dyn-Route: (Kontrolle + AIFS)/2 | Klimatologie μ_c (LOSO) | 212020 | 127 | 2.627 | 3.126 | 16.0 %* |
| t | 126–240 | country:AT | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 212020 | 127 | 2.649 | 3.075 | 13.9 %* |
| t | 126–240 | country:AT | ENS-Mittel (50 Member) | dyn-Route: (Kontrolle + AIFS)/2 | 212020 | 127 | 2.649 | 2.627 | -0.8 % |
| t | 126–240 | country:AT | ENS-Mittel (50 Member) | Klimatologie μ_c (LOSO) | 212020 | 127 | 2.649 | 3.126 | 15.3 %* |
| t | 126–240 | country:AT | ENS-Mittel (50 Member) | Lauf: (HRES + AIFS)/2 | 49482 | 30 | 2.649 | 2.395 | 1.4 % |
| t | 126–240 | country:AT | ENS-Mittel (50 Member) | IFS HRES (Lauf) | 49482 | 30 | 2.649 | 2.756 | 14.4 %* |
| t | 126–240 | country:AT | ENS-Mittel (50 Member) | AIFS (Lauf) | 49482 | 30 | 2.649 | 2.493 | 5.3 % |
| t | 126–240 | country:AT | ENS-Median | ENS-Mittel (50 Member) | 212020 | 127 | 2.657 | 2.649 | -0.3 % |
| t | 126–240 | country:AT | IFS HRES (Lauf) | IFS-ENS-Kontrolllauf | 49482 | 30 | 2.756 | 3.075 | 0.0 % |
| t | 126–240 | country:AT | Lauf: (HRES + AIFS)/2 | Klimatologie μ_c (LOSO) | 49482 | 30 | 2.395 | 3.126 | 23.6 % |
| t | 126–240 | country:AT | Lauf: (HRES + AIFS)/2 | IFS-ENS-Kontrolllauf | 49482 | 30 | 2.395 | 3.075 | 13.1 %* |
| t | 126–240 | country:CH | IFS-ENS-Kontrolllauf | Klimatologie μ_c (LOSO) | 250160 | 127 | 3.156 | 3.283 | 3.9 % |
| t | 126–240 | country:CH | dyn-Route: (Kontrolle + AIFS)/2 | Klimatologie μ_c (LOSO) | 250160 | 127 | 2.636 | 3.283 | 19.7 %* |
| t | 126–240 | country:CH | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 250160 | 127 | 2.748 | 3.156 | 12.9 %* |
| t | 126–240 | country:CH | ENS-Mittel (50 Member) | dyn-Route: (Kontrolle + AIFS)/2 | 250160 | 127 | 2.748 | 2.636 | -4.3 % |
| t | 126–240 | country:CH | ENS-Mittel (50 Member) | Klimatologie μ_c (LOSO) | 250160 | 127 | 2.748 | 3.283 | 16.3 %* |
| t | 126–240 | country:CH | ENS-Mittel (50 Member) | Lauf: (HRES + AIFS)/2 | 58437 | 30 | 2.748 | 2.453 | -0.3 % |
| t | 126–240 | country:CH | ENS-Mittel (50 Member) | IFS HRES (Lauf) | 58437 | 30 | 2.748 | 2.782 | 11.6 %* |
| t | 126–240 | country:CH | ENS-Mittel (50 Member) | AIFS (Lauf) | 58437 | 30 | 2.748 | 2.537 | 3.0 % |
| t | 126–240 | country:CH | ENS-Median | ENS-Mittel (50 Member) | 250160 | 127 | 2.731 | 2.748 | 0.6 % |
| t | 126–240 | country:CH | IFS HRES (Lauf) | IFS-ENS-Kontrolllauf | 58437 | 30 | 2.782 | 3.156 | -0.0 % |
| t | 126–240 | country:CH | Lauf: (HRES + AIFS)/2 | Klimatologie μ_c (LOSO) | 58437 | 30 | 2.453 | 3.283 | 25.9 %* |
| t | 126–240 | country:CH | Lauf: (HRES + AIFS)/2 | IFS-ENS-Kontrolllauf | 58437 | 30 | 2.453 | 3.156 | 11.8 %* |
| t | 126–240 | country:DE | IFS-ENS-Kontrolllauf | Klimatologie μ_c (LOSO) | 510996 | 127 | 2.694 | 3.276 | 17.8 %* |
| t | 126–240 | country:DE | dyn-Route: (Kontrolle + AIFS)/2 | Klimatologie μ_c (LOSO) | 510996 | 127 | 2.328 | 3.276 | 28.9 %* |
| t | 126–240 | country:DE | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 510996 | 127 | 2.316 | 2.694 | 14.0 %* |
| t | 126–240 | country:DE | ENS-Mittel (50 Member) | dyn-Route: (Kontrolle + AIFS)/2 | 510996 | 127 | 2.316 | 2.328 | 0.5 % |
| t | 126–240 | country:DE | ENS-Mittel (50 Member) | Klimatologie μ_c (LOSO) | 510996 | 127 | 2.316 | 3.276 | 29.3 %* |
| t | 126–240 | country:DE | ENS-Mittel (50 Member) | Lauf: (HRES + AIFS)/2 | 119443 | 30 | 2.316 | 2.193 | 2.1 % |
| t | 126–240 | country:DE | ENS-Mittel (50 Member) | IFS HRES (Lauf) | 119443 | 30 | 2.316 | 2.521 | 14.8 %* |
| t | 126–240 | country:DE | ENS-Mittel (50 Member) | AIFS (Lauf) | 119443 | 30 | 2.316 | 2.276 | 5.6 % |
| t | 126–240 | country:DE | ENS-Median | ENS-Mittel (50 Member) | 510996 | 127 | 2.297 | 2.316 | 0.8 % |
| t | 126–240 | country:DE | IFS HRES (Lauf) | IFS-ENS-Kontrolllauf | 119443 | 30 | 2.521 | 2.694 | 0.0 % |
| t | 126–240 | country:DE | Lauf: (HRES + AIFS)/2 | Klimatologie μ_c (LOSO) | 119443 | 30 | 2.193 | 3.276 | 30.5 %* |
| t | 126–240 | country:DE | Lauf: (HRES + AIFS)/2 | IFS-ENS-Kontrolllauf | 119443 | 30 | 2.193 | 2.694 | 13.0 %* |
| t | 126–240 | window | IFS-ENS-Kontrolllauf | Klimatologie μ_c (LOSO) | 227362 | 30 | 2.639 | 3.190 | 17.3 % |
| t | 126–240 | window | dyn-Route: (Kontrolle + AIFS)/2 | Klimatologie μ_c (LOSO) | 227362 | 30 | 2.304 | 3.190 | 27.8 %* |
| t | 126–240 | window | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 227362 | 30 | 2.274 | 2.639 | 13.8 %* |
| t | 126–240 | window | ENS-Mittel (50 Member) | dyn-Route: (Kontrolle + AIFS)/2 | 227362 | 30 | 2.274 | 2.304 | 1.3 % |
| t | 126–240 | window | ENS-Mittel (50 Member) | Lauf: (HRES + AIFS)/2 | 227362 | 30 | 2.274 | 2.304 | 1.3 % |
| t | 126–240 | window | ENS-Mittel (50 Member) | IFS HRES (Lauf) | 227362 | 30 | 2.274 | 2.639 | 13.8 %* |
| t | 126–240 | window | ENS-Mittel (50 Member) | AIFS (Lauf) | 227362 | 30 | 2.274 | 2.390 | 4.9 % |
| t | 126–240 | window | ENS-Mittel (50 Member) | Klimatologie μ_c (LOSO) | 227362 | 30 | 2.274 | 3.190 | 28.7 %* |
| t | 126–240 | window | ENS-Median | ENS-Mittel (50 Member) | 227362 | 30 | 2.282 | 2.274 | -0.3 % |
| t | 126–240 | window | IFS HRES (Lauf) | IFS-ENS-Kontrolllauf | 227362 | 30 | 2.639 | 2.639 | -0.0 % |
| t | 126–240 | window | Lauf: (HRES + AIFS)/2 | Klimatologie μ_c (LOSO) | 227362 | 30 | 2.304 | 3.190 | 27.8 %* |
| t | 126–240 | window | Lauf: (HRES + AIFS)/2 | IFS-ENS-Kontrolllauf | 227362 | 30 | 2.304 | 2.639 | 12.7 %* |
| t | 246–336 | all | IFS-ENS-Kontrolllauf | Klimatologie μ_c (LOSO) | 769735 | 126 | 4.124 | 3.263 | -26.4 %! |
| t | 246–336 | all | dyn-Route: (Kontrolle + AIFS)/2 | Klimatologie μ_c (LOSO) | 769735 | 126 | 3.511 | 3.263 | -7.6 % |
| t | 246–336 | all | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 769735 | 126 | 3.172 | 4.124 | 23.1 %* |
| t | 246–336 | all | ENS-Mittel (50 Member) | dyn-Route: (Kontrolle + AIFS)/2 | 769735 | 126 | 3.172 | 3.511 | 9.7 %* |
| t | 246–336 | all | ENS-Mittel (50 Member) | Klimatologie μ_c (LOSO) | 769735 | 126 | 3.172 | 3.263 | 2.8 % |
| t | 246–336 | all | ENS-Mittel (50 Member) | Lauf: (HRES + AIFS)/2 | 173154 | 29 | 3.172 | 3.370 | 16.5 % |
| t | 246–336 | all | ENS-Mittel (50 Member) | IFS HRES (Lauf) | 173154 | 29 | 3.172 | 3.916 | 28.2 %* |
| t | 246–336 | all | ENS-Mittel (50 Member) | AIFS (Lauf) | 173154 | 29 | 3.172 | 3.639 | 22.7 %* |
| t | 246–336 | all | ENS-Median | ENS-Mittel (50 Member) | 769735 | 126 | 3.156 | 3.172 | 0.5 % |
| t | 246–336 | all | IFS HRES (Lauf) | IFS-ENS-Kontrolllauf | 173154 | 29 | 3.916 | 4.124 | -0.0 % |
| t | 246–336 | all | Lauf: (HRES + AIFS)/2 | Klimatologie μ_c (LOSO) | 173154 | 29 | 3.370 | 3.263 | -14.8 % |
| t | 246–336 | all | Lauf: (HRES + AIFS)/2 | IFS-ENS-Kontrolllauf | 173154 | 29 | 3.370 | 4.124 | 13.9 %* |
| t | 246–336 | country:AT | IFS-ENS-Kontrolllauf | Klimatologie μ_c (LOSO) | 167696 | 126 | 4.268 | 3.149 | -35.5 %! |
| t | 246–336 | country:AT | dyn-Route: (Kontrolle + AIFS)/2 | Klimatologie μ_c (LOSO) | 167696 | 126 | 3.586 | 3.149 | -13.9 %! |
| t | 246–336 | country:AT | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 167696 | 126 | 3.221 | 4.268 | 24.5 %* |
| t | 246–336 | country:AT | ENS-Mittel (50 Member) | dyn-Route: (Kontrolle + AIFS)/2 | 167696 | 126 | 3.221 | 3.586 | 10.2 %* |
| t | 246–336 | country:AT | ENS-Mittel (50 Member) | Klimatologie μ_c (LOSO) | 167696 | 126 | 3.221 | 3.149 | -2.3 % |
| t | 246–336 | country:AT | ENS-Mittel (50 Member) | Lauf: (HRES + AIFS)/2 | 37689 | 29 | 3.221 | 3.464 | 18.0 %* |
| t | 246–336 | country:AT | ENS-Mittel (50 Member) | IFS HRES (Lauf) | 37689 | 29 | 3.221 | 4.064 | 30.1 %* |
| t | 246–336 | country:AT | ENS-Mittel (50 Member) | AIFS (Lauf) | 37689 | 29 | 3.221 | 3.786 | 25.0 %* |
| t | 246–336 | country:AT | ENS-Median | ENS-Mittel (50 Member) | 167696 | 126 | 3.216 | 3.221 | 0.1 % |
| t | 246–336 | country:AT | IFS HRES (Lauf) | IFS-ENS-Kontrolllauf | 37689 | 29 | 4.064 | 4.268 | 0.0 % |
| t | 246–336 | country:AT | Lauf: (HRES + AIFS)/2 | Klimatologie μ_c (LOSO) | 37689 | 29 | 3.464 | 3.149 | -18.5 %! |
| t | 246–336 | country:AT | Lauf: (HRES + AIFS)/2 | IFS-ENS-Kontrolllauf | 37689 | 29 | 3.464 | 4.268 | 14.8 %* |
| t | 246–336 | country:CH | IFS-ENS-Kontrolllauf | Klimatologie μ_c (LOSO) | 197869 | 126 | 4.363 | 3.320 | -31.4 %! |
| t | 246–336 | country:CH | dyn-Route: (Kontrolle + AIFS)/2 | Klimatologie μ_c (LOSO) | 197869 | 126 | 3.641 | 3.320 | -9.7 % |
| t | 246–336 | country:CH | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 197869 | 126 | 3.359 | 4.363 | 23.0 %* |
| t | 246–336 | country:CH | ENS-Mittel (50 Member) | dyn-Route: (Kontrolle + AIFS)/2 | 197869 | 126 | 3.359 | 3.641 | 7.8 %* |
| t | 246–336 | country:CH | ENS-Mittel (50 Member) | Klimatologie μ_c (LOSO) | 197869 | 126 | 3.359 | 3.320 | -1.2 % |
| t | 246–336 | country:CH | ENS-Mittel (50 Member) | Lauf: (HRES + AIFS)/2 | 44490 | 29 | 3.359 | 3.426 | 13.1 % |
| t | 246–336 | country:CH | ENS-Mittel (50 Member) | IFS HRES (Lauf) | 44490 | 29 | 3.359 | 4.089 | 27.2 %* |
| t | 246–336 | country:CH | ENS-Mittel (50 Member) | AIFS (Lauf) | 44490 | 29 | 3.359 | 3.632 | 18.0 %* |
| t | 246–336 | country:CH | ENS-Median | ENS-Mittel (50 Member) | 197869 | 126 | 3.313 | 3.359 | 1.4 % |
| t | 246–336 | country:CH | IFS HRES (Lauf) | IFS-ENS-Kontrolllauf | 44490 | 29 | 4.089 | 4.363 | -0.0 % |
| t | 246–336 | country:CH | Lauf: (HRES + AIFS)/2 | Klimatologie μ_c (LOSO) | 44490 | 29 | 3.426 | 3.320 | -10.2 % |
| t | 246–336 | country:CH | Lauf: (HRES + AIFS)/2 | IFS-ENS-Kontrolllauf | 44490 | 29 | 3.426 | 4.363 | 16.2 %* |
| t | 246–336 | country:DE | IFS-ENS-Kontrolllauf | Klimatologie μ_c (LOSO) | 404170 | 126 | 3.948 | 3.282 | -20.3 %! |
| t | 246–336 | country:DE | dyn-Route: (Kontrolle + AIFS)/2 | Klimatologie μ_c (LOSO) | 404170 | 126 | 3.416 | 3.282 | -4.1 % |
| t | 246–336 | country:DE | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 404170 | 126 | 3.060 | 3.948 | 22.5 %* |
| t | 246–336 | country:DE | ENS-Mittel (50 Member) | dyn-Route: (Kontrolle + AIFS)/2 | 404170 | 126 | 3.060 | 3.416 | 10.4 %* |
| t | 246–336 | country:DE | ENS-Mittel (50 Member) | Klimatologie μ_c (LOSO) | 404170 | 126 | 3.060 | 3.282 | 6.7 % |
| t | 246–336 | country:DE | ENS-Mittel (50 Member) | Lauf: (HRES + AIFS)/2 | 90975 | 29 | 3.060 | 3.304 | 17.6 % |
| t | 246–336 | country:DE | ENS-Mittel (50 Member) | IFS HRES (Lauf) | 90975 | 29 | 3.060 | 3.770 | 27.8 % |
| t | 246–336 | country:DE | ENS-Mittel (50 Member) | AIFS (Lauf) | 90975 | 29 | 3.060 | 3.582 | 24.0 %* |
| t | 246–336 | country:DE | ENS-Median | ENS-Mittel (50 Member) | 404170 | 126 | 3.054 | 3.060 | 0.2 % |
| t | 246–336 | country:DE | IFS HRES (Lauf) | IFS-ENS-Kontrolllauf | 90975 | 29 | 3.770 | 3.948 | -0.0 % |
| t | 246–336 | country:DE | Lauf: (HRES + AIFS)/2 | Klimatologie μ_c (LOSO) | 90975 | 29 | 3.304 | 3.282 | -15.6 % |
| t | 246–336 | country:DE | Lauf: (HRES + AIFS)/2 | IFS-ENS-Kontrolllauf | 90975 | 29 | 3.304 | 3.948 | 12.4 %* |
| t | 246–336 | window | IFS-ENS-Kontrolllauf | Klimatologie μ_c (LOSO) | 173154 | 29 | 3.916 | 2.937 | -33.3 %! |
| t | 246–336 | window | dyn-Route: (Kontrolle + AIFS)/2 | Klimatologie μ_c (LOSO) | 173154 | 29 | 3.370 | 2.937 | -14.7 % |
| t | 246–336 | window | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 173154 | 29 | 2.813 | 3.916 | 28.2 %* |
| t | 246–336 | window | ENS-Mittel (50 Member) | dyn-Route: (Kontrolle + AIFS)/2 | 173154 | 29 | 2.813 | 3.370 | 16.5 % |
| t | 246–336 | window | ENS-Mittel (50 Member) | Lauf: (HRES + AIFS)/2 | 173154 | 29 | 2.813 | 3.370 | 16.5 % |
| t | 246–336 | window | ENS-Mittel (50 Member) | IFS HRES (Lauf) | 173154 | 29 | 2.813 | 3.916 | 28.2 %* |
| t | 246–336 | window | ENS-Mittel (50 Member) | AIFS (Lauf) | 173154 | 29 | 2.813 | 3.639 | 22.7 %* |
| t | 246–336 | window | ENS-Mittel (50 Member) | Klimatologie μ_c (LOSO) | 173154 | 29 | 2.813 | 2.937 | 4.2 % |
| t | 246–336 | window | ENS-Median | ENS-Mittel (50 Member) | 173154 | 29 | 2.838 | 2.813 | -0.9 % |
| t | 246–336 | window | IFS HRES (Lauf) | IFS-ENS-Kontrolllauf | 173154 | 29 | 3.916 | 3.916 | -0.0 % |
| t | 246–336 | window | Lauf: (HRES + AIFS)/2 | Klimatologie μ_c (LOSO) | 173154 | 29 | 3.370 | 2.937 | -14.8 % |
| t | 246–336 | window | Lauf: (HRES + AIFS)/2 | IFS-ENS-Kontrolllauf | 173154 | 29 | 3.370 | 3.916 | 13.9 %* |
| ws | 126–240 | all | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 971470 | 127 | 1.502 | 1.724 | 12.8 %* |
| ws | 126–240 | country:AT | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 209186 | 127 | 1.407 | 1.573 | 10.6 %* |
| ws | 126–240 | country:CH | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 255079 | 127 | 1.571 | 1.735 | 9.4 %* |
| ws | 126–240 | country:DE | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 507205 | 127 | 1.507 | 1.780 | 15.3 %* |
| ws | 246–336 | all | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 768346 | 126 | 1.592 | 1.889 | 15.7 %* |
| ws | 246–336 | country:AT | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 165454 | 126 | 1.455 | 1.681 | 13.4 %* |
| ws | 246–336 | country:CH | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 201767 | 126 | 1.623 | 1.839 | 11.8 %* |
| ws | 246–336 | country:DE | ENS-Mittel (50 Member) | IFS-ENS-Kontrolllauf | 401125 | 126 | 1.633 | 2.000 | 18.3 %* |

## Monate (T, ENS-Mittel gegen Kontrolllauf)

| Monat | 126–240 h | 246–336 h |
|---|---|---|
| 2025-09 | 21.2 % | 24.0 %* |
| 2025-10 | 14.7 % | 23.0 %* |
| 2025-11 | 18.4 % | 12.1 % |
| 2025-12 | 11.2 % | 25.8 % |
| 2026-01 | 14.8 % | 31.2 % |
| 2026-02 | 12.2 % | 22.3 % |
| 2026-03 | 17.5 %* | 35.4 %* |
| 2026-04 | 5.7 % | 18.3 % |
| 2026-05 | 13.1 % | 9.7 % |
| 2026-06 | 3.7 % | 26.1 % |
| 2026-07 | 18.7 % | 27.7 %* |
| 2026-08 | 10.7 % | 15.6 % |
| 2026-09 | 16.8 % | 23.2 % |