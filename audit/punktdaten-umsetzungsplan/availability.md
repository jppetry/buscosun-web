# Bereitstellungszeiten der Punkt-Quellen — gemessene Reihe

> GENERIERT von `scripts/point/measure-availability.mjs` aus `availability.json` — nicht von Hand ändern.
> Stand 2026-09-14T20:37:38Z · 79 Proben · 3 Bau-Einträge.
>
> Ein Wert je (Quelle, Lauf): Zeitstempel der LETZTEN gebrauchten Datei des Laufs auf dem
> Server (DWD/ECMWF: Listing-`Last-Modified`; MeteoSchweiz: `created` der STAC-Items am letzten
> Horizont; GeoSphere: nur eine OBERGRENZE „Abrufzeit − Lauf", weil die Metadaten keine
> Veröffentlichungszeit führen). Quellen mit weniger als 7 Proben gelten als **noch nicht belastbar**.

## Zusammenfassung je Quelle und letztem Schritt

| Quelle | letzter Schritt | n | min | Median | max | Verifier `READY_H` | Bewertung |
|---|---:|---:|---:|---:|---:|---:|---|
| AIFS Single (`aifs_single`) | 360 h | 13 | 7,57 h | 7,57 h | 7,57 h | – | belastbar (n = 13) |
| C-LAEF (GeoSphere) (`claef`) | 60 h (Obergrenze) | 6 | 5,62 h | 13,12 h | 20,62 h | – | nur Obergrenze — engste ≤ 5,62 h |
| ICON-CH1-EPS (`icon_ch1_eps`) | 45 h | 1 | 2,12 h | 2,12 h | 2,12 h | – | **noch nicht belastbar** (n = 1 < 7) |
| ICON-CH1-EPS (`icon_ch1_eps`) | 33 h | 7 | 1,85 h | 1,89 h | 1,98 h | – | belastbar (n = 7) |
| ICON-CH2-EPS (`icon_ch2_eps`) | 120 h | 3 | 2,89 h | 2,91 h | 2,97 h | – | **noch nicht belastbar** (n = 3 < 7) |
| ICON-D2 (`icon_d2`) | 48 h | 8 | 1,35 h | 1,35 h | 1,36 h | 1,36 h | belastbar (n = 8) |
| ICON-D2-EPS (`icon_d2_eps`) | 48 h | 8 | 2,14 h | 2,15 h | 2,16 h | – | belastbar (n = 8) |
| ICON-EU (`icon_eu`) | 120 h | 4 | 3,60 h | 3,62 h | 3,65 h | 3,64 h | **noch nicht belastbar** (n = 4 < 7) |
| ICON-EU (`icon_eu`) | 48 h | 4 | 2,92 h | 2,92 h | 2,92 h | – | **noch nicht belastbar** (n = 4 < 7) |
| ICON global (`icon_global`) | 180 h | 2 | 3,47 h | 3,50 h | 3,54 h | – | **noch nicht belastbar** (n = 2 < 7) |
| ICON global (`icon_global`) | 120 h | 2 | 3,27 h | 3,27 h | 3,28 h | – | **noch nicht belastbar** (n = 2 < 7) |
| IFS HRES (`ifs_hres`) | 360 h | 7 | 7,57 h | 7,57 h | 7,57 h | 7,57 h | belastbar (n = 7) |
| IFS HRES (`ifs_hres`) | 144 h | 6 | 6,45 h | 6,45 h | 6,45 h | – | **noch nicht belastbar** (n = 6 < 7) |
| MOSMIX-L (`mosmix_l`) | 247 h | 8 | 1,20 h | 1,24 h | 1,28 h | – | belastbar (n = 8) |

## Einzelproben (jüngste zuerst)

| Lauf | Quelle | letzter Schritt | fertig (UTC) | Lauf + h | Art | gemessen am |
|---|---|---:|---|---:|---|---|
| 2026091418 | `icon_ch1_eps` | 33 | 2026-09-14 19:52:38 UTC | 1,88 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091418 | `icon_d2` | 48 | 2026-09-14 19:20:59 UTC | 1,35 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091418 | `icon_d2_eps` | 48 | 2026-09-14 20:08:33 UTC | 2,14 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091415 | `claef` | 60 | 2026-09-14 20:36:55 UTC | ≤ 5,62 | Obergrenze | 2026-09-14 20:36:55 UTC |
| 2026091415 | `icon_ch1_eps` | 33 | 2026-09-14 16:52:07 UTC | 1,87 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091415 | `icon_d2` | 48 | 2026-09-14 16:21:06 UTC | 1,35 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091415 | `icon_d2_eps` | 48 | 2026-09-14 17:09:42 UTC | 2,16 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091415 | `icon_eu` | 48 | 2026-09-14 17:55:21 UTC | 2,92 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091415 | `mosmix_l` | 247 | 2026-09-14 16:16:16 UTC | 1,27 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091412 | `aifs_single` | 360 | 2026-09-14 19:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091412 | `claef` | 60 | 2026-09-14 20:36:55 UTC | ≤ 8,62 | Obergrenze | 2026-09-14 20:36:55 UTC |
| 2026091412 | `icon_ch1_eps` | 33 | 2026-09-14 13:50:54 UTC | 1,85 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091412 | `icon_ch2_eps` | 120 | 2026-09-14 14:53:13 UTC | 2,89 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091412 | `icon_d2` | 48 | 2026-09-14 13:21:39 UTC | 1,36 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091412 | `icon_d2_eps` | 48 | 2026-09-14 14:08:58 UTC | 2,15 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091412 | `icon_eu` | 120 | 2026-09-14 15:36:02 UTC | 3,60 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091412 | `icon_global` | 180 | 2026-09-14 15:32:17 UTC | 3,54 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091412 | `ifs_hres` | 360 | 2026-09-14 19:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091409 | `claef` | 60 | 2026-09-14 20:36:55 UTC | ≤ 11,62 | Obergrenze | 2026-09-14 20:36:55 UTC |
| 2026091409 | `icon_ch1_eps` | 33 | 2026-09-14 10:54:25 UTC | 1,91 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091409 | `icon_d2` | 48 | 2026-09-14 10:21:07 UTC | 1,35 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091409 | `icon_d2_eps` | 48 | 2026-09-14 11:08:59 UTC | 2,15 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091409 | `icon_eu` | 48 | 2026-09-14 11:55:23 UTC | 2,92 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091409 | `mosmix_l` | 247 | 2026-09-14 10:12:51 UTC | 1,21 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091406 | `aifs_single` | 360 | 2026-09-14 13:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091406 | `claef` | 60 | 2026-09-14 20:36:55 UTC | ≤ 14,62 | Obergrenze | 2026-09-14 20:36:55 UTC |
| 2026091406 | `icon_ch1_eps` | 33 | 2026-09-14 07:58:45 UTC | 1,98 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091406 | `icon_ch2_eps` | 120 | 2026-09-14 08:58:25 UTC | 2,97 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091406 | `icon_d2` | 48 | 2026-09-14 07:20:51 UTC | 1,35 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091406 | `icon_d2_eps` | 48 | 2026-09-14 08:09:03 UTC | 2,15 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091406 | `icon_eu` | 120 | 2026-09-14 09:38:58 UTC | 3,65 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091406 | `icon_global` | 120 | 2026-09-14 09:15:55 UTC | 3,27 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091406 | `ifs_hres` | 144 | 2026-09-14 12:27:00 UTC | 6,45 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091403 | `claef` | 60 | 2026-09-14 20:36:55 UTC | ≤ 17,62 | Obergrenze | 2026-09-14 20:36:55 UTC |
| 2026091403 | `icon_ch1_eps` | 45 | 2026-09-14 05:06:52 UTC | 2,12 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091403 | `icon_d2` | 48 | 2026-09-14 04:20:57 UTC | 1,35 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091403 | `icon_d2_eps` | 48 | 2026-09-14 05:09:20 UTC | 2,16 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091403 | `icon_eu` | 48 | 2026-09-14 05:55:18 UTC | 2,92 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091403 | `mosmix_l` | 247 | 2026-09-14 04:16:01 UTC | 1,27 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091400 | `aifs_single` | 360 | 2026-09-14 07:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091400 | `claef` | 60 | 2026-09-14 20:36:55 UTC | ≤ 20,62 | Obergrenze | 2026-09-14 20:36:55 UTC |
| 2026091400 | `icon_ch1_eps` | 33 | 2026-09-14 01:55:02 UTC | 1,92 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091400 | `icon_ch2_eps` | 120 | 2026-09-14 02:54:20 UTC | 2,91 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091400 | `icon_d2` | 48 | 2026-09-14 01:21:12 UTC | 1,35 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091400 | `icon_d2_eps` | 48 | 2026-09-14 02:09:39 UTC | 2,16 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091400 | `icon_eu` | 120 | 2026-09-14 03:37:15 UTC | 3,62 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091400 | `icon_global` | 180 | 2026-09-14 03:28:15 UTC | 3,47 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091400 | `ifs_hres` | 360 | 2026-09-14 07:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091321 | `icon_ch1_eps` | 33 | 2026-09-13 22:53:36 UTC | 1,89 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091321 | `icon_d2` | 48 | 2026-09-13 22:21:15 UTC | 1,35 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091321 | `icon_d2_eps` | 48 | 2026-09-13 23:09:09 UTC | 2,15 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091321 | `icon_eu` | 48 | 2026-09-13 23:55:09 UTC | 2,92 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091321 | `mosmix_l` | 247 | 2026-09-13 22:12:47 UTC | 1,21 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091318 | `aifs_single` | 360 | 2026-09-14 01:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091318 | `icon_eu` | 120 | 2026-09-13 21:37:13 UTC | 3,62 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091318 | `icon_global` | 120 | 2026-09-13 21:16:48 UTC | 3,28 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091318 | `ifs_hres` | 144 | 2026-09-14 00:27:00 UTC | 6,45 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091315 | `mosmix_l` | 247 | 2026-09-13 16:15:46 UTC | 1,26 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091312 | `aifs_single` | 360 | 2026-09-13 19:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091312 | `ifs_hres` | 360 | 2026-09-13 19:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091309 | `mosmix_l` | 247 | 2026-09-13 10:13:17 UTC | 1,22 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091306 | `aifs_single` | 360 | 2026-09-13 13:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091306 | `ifs_hres` | 144 | 2026-09-13 12:27:00 UTC | 6,45 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091303 | `mosmix_l` | 247 | 2026-09-13 04:16:32 UTC | 1,28 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091300 | `aifs_single` | 360 | 2026-09-13 07:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091300 | `ifs_hres` | 360 | 2026-09-13 07:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091221 | `mosmix_l` | 247 | 2026-09-12 22:12:16 UTC | 1,20 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091218 | `aifs_single` | 360 | 2026-09-13 01:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091218 | `ifs_hres` | 144 | 2026-09-13 00:27:00 UTC | 6,45 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091212 | `aifs_single` | 360 | 2026-09-12 19:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091212 | `ifs_hres` | 360 | 2026-09-12 19:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091206 | `aifs_single` | 360 | 2026-09-12 13:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091206 | `ifs_hres` | 144 | 2026-09-12 12:27:00 UTC | 6,45 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091200 | `aifs_single` | 360 | 2026-09-12 07:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091200 | `ifs_hres` | 360 | 2026-09-12 07:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091118 | `aifs_single` | 360 | 2026-09-12 01:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091118 | `ifs_hres` | 144 | 2026-09-12 00:27:00 UTC | 6,45 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091112 | `aifs_single` | 360 | 2026-09-11 19:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |
| 2026091112 | `ifs_hres` | 360 | 2026-09-11 19:34:00 UTC | 7,57 | gemessen | 2026-09-14 20:36:55 UTC |

## Wie gebaut (Cron-Manifeste aus `point/index.json`)

| veröffentlicht | Stufe | Lauf | Bau | discover | Quellen (Lauf · Versatz · Schritte · Abdeckung) | Stationen |
|---|---|---|---:|---:|---|---|
| 2026-09-14 19:53:01 UTC | t1 | 2026091418 | 9,3 min | 122 s | icon_d2 09-14T18 +0h 49<br>icon_d2_eps 09-14T15 +3h 8·partial<br>icon_ch1_eps 09-14T15 +3h 11·partial<br>claef 09-14T15 +3h 49<br>claef_eps 09-14T12 +6h 49<br>icon_eu 09-14T15 +3h 28·partial<br>ifs_hres 09-14T12 +6h 17·partial<br>aifs_single 09-14T12 +6h 9·partial | 2026091409 (7,1 h) |
| 2026-09-14 19:53:01 UTC | t2 | 2026091412 | 7,7 min | 128 s | icon_eu 09-14T12 +0h 24<br>icon_eu_eps 09-14T12 +0h 6·partial<br>icon_ch2_eps 09-14T12 +0h 24<br>icon_global 09-14T12 +0h 24<br>aicon 09-14T12 +0h 24<br>ifs_hres 09-14T06 +6h 24<br>aifs_single 09-14T06 +6h 12·partial | 2026091409 (7,1 h) |
| 2026-09-14 19:53:01 UTC | t3 | 2026091400 | 4,7 min | 14 s | icon_global 09-14T00 +0h 10·partial<br>icon_eps_global 09-14T00 +0h 2·partial<br>aicon 09-14T00 +0h 10·partial<br>ifs_hres 09-14T00 +0h 36<br>ifs_ens 09-14T00 +0h 5·partial<br>aifs_single 09-14T00 +0h 36 | 2026091409 (7,1 h) |

