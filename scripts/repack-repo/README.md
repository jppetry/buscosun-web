# buscosun-data

Vorprozessierte ICON-D2-Raster für [buscosun.com](https://buscosun.com).

**Dieses Repo enthält keinen Anwendungscode.** Es ist ein reiner Datenspeicher:
Wind- und Temperaturfelder des Deutschen Wetterdienstes, umgepackt in verlustfreie
PNGs, ausgeliefert über [jsDelivr](https://www.jsdelivr.com/).

## Warum

Die Wetterkarte von buscosun holte bisher rohe GRIB2-Dateien und dekodierte sie in
**jedem** Browser einzeln — 6,55 MiB je Kaltsitzung. Dabei reduziert die App die
Daten ohnehin: das native 1215×746-Gleitkommagitter wird auf 608×373 × 8 bit
abgetastet, bevor irgendetwas gezeichnet wird. Dieser Schritt passiert jetzt
**einmal** hier statt einmal pro Besucher.

Gemessen: 49,88 MiB GRIB (bz2) → 5,41 MiB PNG je Lauf, Faktor 9,2×.

Die Bilder sind **byte-identisch** zu dem, was der bisherige Pfad im Browser
erzeugt hat — bewiesen über drei Läufe im Verifier `verify:repack` des
Anwendungs-Repos.

## Aufbau

```
index.json              welcher Commit welche Läufe trägt (von den Crons gelesen)
hsurf-v1.png            Modell-Orographie — zeit- UND lauf-invariant, deshalb einmal
runs/<YYYYMMDDHH>/
  repack.json           Gitter, Ecken, Normierung, Dateigrößen
  wind-<SSS>.png        RGB: R = normierte u-Komponente, G = normierte v-Komponente
  temp-<SSS>.png        Grau + Alpha: Grau = normierte 2-m-Temperatur, Alpha = Maske
```

Ein Bild ohne seinen Eintrag in `index.json` ist bedeutungslos: die
Wind-Normierung (`uMin`/`uMax`/`vMin`/`vMax`) wird **je Schritt** neu bestimmt.

Adressiert wird immer über den **Commit-SHA**, nie über `main` — jsDelivr liefert
unveränderliche Refs mit `max-age=31536000, immutable`, Branch-Refs dagegen mit
`s-maxage=43200` (12 h Zwischencache).

## Aufbewahrung

Nur die letzten Läufe (Standard 4 ≈ 12 h). Jeder Publish schreibt eine **frische
Historie** und force-pusht sie, damit das Repo nicht linear wächst. Ältere
Commits werden unerreichbar und irgendwann von GitHub geräumt.

Es geht dabei nichts verloren: alle Dateien sind aus den DWD-Rohdaten
reproduzierbar, und die Anwendung fällt bei jedem Fehlgriff auf den direkten
GRIB-Pfad zurück.

## Daten und Lizenz

Quelle: **Deutscher Wetterdienst**, ICON-D2, <https://opendata.dwd.de> —
lizenziert unter [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Die Daten wurden verändert: räumlich abgetastet, auf 8 bit quantisiert und nach
PNG kodiert. Sie sind **nicht** für amtliche Zwecke geeignet.

Der Producer liegt im Anwendungs-Repo:
[`scripts/repack-icon-d2.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/repack-icon-d2.mjs).
