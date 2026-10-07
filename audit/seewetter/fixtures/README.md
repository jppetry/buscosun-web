# Fixtures Seewetter – DWD-Textprodukte (Rohbytes)

Am 07.10.2026 von `https://opendata.dwd.de/weather/maritime/forecast/german/` geladen und **byte-genau** abgelegt (SHA-256 gegen den Download geprüft). Dateinamen wie beim DWD, ohne Endung. Nicht umkodieren, nicht umbrechen, keine Zeilenenden normalisieren: `.gitattributes` sollte diesen Ordner als binär führen (`audit/seewetter/fixtures/** -text`), sonst ändert Git unter Windows die `\r\r\n`.

| Datei | Kopf | Bytes | Last-Modified (UTC) | SHA-256 |
| --- | --- | --- | --- | --- |
| `FQEN50_EDZW_070800` | `FQDL50 DWHA 070800` | 4051 | 07.10.2026 08:15:08 | `d77cc404b327bca84060cee03b4ca89b6cd977e9cacab7d2e449d43a34ff1aea` |
| `FQEN51_EDZW_070800` | `FQDL51 DWHA 070800` | 1786 | 07.10.2026 08:15:08 | `1487e68444e3f215a2b9d09741639f4006b0f98d2b248e11f04cc0f63a5c246c` |
| `WODL45_EDZW_070900` | `WODL45 DWHA 070900` | 881 | 07.10.2026 08:45:33 | `cd08acd50856d06ccdde19b83d6638bba1f7f5c347adfe0d4f4f0140119664a8` |
| `FXDL40_EDZW_060000` | `FXDL40 DWHA 060000` | 1609 | 06.10.2026 07:52:58 | `d47be1c68a757d49baf45992a037462aaaf059c1272d1a15782b1199671db2f5` |
| `FQMM60_EDZW_061400` | `FQDL60 DWHA 061400` | 1063 | 06.10.2026 12:16:21 | `bcddbfb35e7c043cd88734fd1d2006ccb27d92b275d9e89bd7d1234714c43cfa` |

**Was sie abdecken:** Normalfall ohne Warnung (WODL45 mit `no warning.` und „besteht keine Starkwind-, Sturm- oder Orkanwarnung“), ISO-8859-1 mit Umlauten (FXDL40), HTML-Rest `<br>`, einzelne `\r` und `NIL`-Zeilen (FQDL60), mehrzeilige Werte und Leerzeichen am Zeilenende (FQDL50/51).

**Was fehlt:** ein WODL45 und ein FQDL50 **mit aktiver Warnung**. SW-0 sammelt sieben Tage und legt mindestens einen Warnfall hier ab, bevor `verify:sea-text` als vollständig gilt.

Quelle: Deutscher Wetterdienst, GeoNutzV.
