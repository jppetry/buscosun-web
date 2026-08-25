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

Gemessen: 49,88 MiB GRIB (bz2) → 5,41 MiB PNG je Lauf (Wind + Temperatur, Faktor 9,2×);
mit allen Familien 165,14 MiB → 10,06 MiB (Faktor 16,4×, BW-6).

Die Bilder sind **byte-identisch** zu dem, was der bisherige Pfad im Browser
erzeugt hat — bewiesen über drei Läufe im Verifier `verify:repack` des
Anwendungs-Repos.

## Aufbau

```
index.json              welcher Commit welche Läufe trägt (von den Crons gelesen)
hsurf-v1.png            Modell-Orographie — zeit- UND lauf-invariant, deshalb einmal
runs/<YYYYMMDDHH>/
  repack.json           Gitter, Ecken, Normierung, Dateigrößen, je Familie
  wind-<SSS>.png        RGB: R = normierte u-Komponente, G = normierte v-Komponente
  temp-<SSS>.png        Grau + Alpha: Grau = normierte 2-m-Temperatur, Alpha = Maske
  gust-<SSS>.png        Grau + Alpha: Böe 0…40 m/s
  thunder-<SSS>.png     Grau + Alpha: Gewitterpotenzial-Score 0…100 (aus cape_ml, cin_ml, lpi)
  rotation-<SSS>.png    Grau + Alpha: Rotationspotenzial-Score 0…100 (uh_max, uh_max_low, sdi_2), geglättet
  lpi-<SSS>.png         Grau + Alpha: Blitzpotenzial lpi_max 0…30 J/kg
  snowdepth-<SSS>.png   Grau + Alpha: Schneedecke 0…150 cm
  snowfresh-<SSS>.png   Grau + Alpha: Neuschnee 0…50 cm (snow_gsp + snow_con, rho_snow)
  precip-<SSS>.png      Grau, VOLLE Auflösung 1215×746: Stundenrate 0…20 mm/h, deakkumuliert
                        gegen den in `repack.json` genannten Vorschritt (`ref`)
```

Alle Familien außer Wind/Temperatur seit BW-6 (2026-08-24). Die Familienliste
lebt an EINER Stelle im Anwendungs-Repo (`scripts/lib/repackManifest.mjs`).

Ein Bild ohne seinen Eintrag in `index.json` ist bedeutungslos: die
Wind-Normierung (`uMin`/`uMax`/`vMin`/`vMax`) wird **je Schritt** neu bestimmt,
und ein Niederschlagsbild ist nur mit seiner Referenz (`ref`) eine Rate.

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

## Takt und Frische (BW-9)

Der Batch startet zu den acht ICON-D2-Laufstunden bei Lauf + 20 min — sicher vor
den Daten — und wartet im Job erst auf den Lauf, dann auf die fehlenden Schritte
(DWD: Schritt 000 bei + 44 min, Schritt 027 bei ≈ + 66 min, gemessen an acht
Läufen), statt stündlich einen zufällig liegenden Slot zu treffen. GitHubs
Startverzögerung (7–31 min) fällt so in die Wartezeit. Ein zweiter Slot bei
Lauf + 150 min ist das Sicherheitsnetz.

Nach jedem Push purgt der Publisher `index.json` auf jsDelivr und prüft nach,
dass das CDN den neuen Commit liefert. Der Browser liest `index.json` deshalb
direkt vom CDN (`…@main/index.json`) — ein neuer Lauf ist dort ≈ 1 min nach dem
Push sichtbar, statt nach Warm-Cron-Slot und Netlify-Build. Der Abschnitt im
Manifest der Anwendung bleibt als Fallback.

⚠️ `.github/workflows/build.yml` kann der Batch **nicht selbst** aktualisieren
(eine Action darf ohne `workflows`-Scope keine Workflow-Datei pushen). Weicht die
Vorlage `buscosun-web/scripts/repack-repo/workflow-build.yml` ab, ist ein
manueller Commit dieser Datei nötig — sonst läuft der alte Stand weiter.

## Daten und Lizenz

Quelle: **Deutscher Wetterdienst**, ICON-D2, <https://opendata.dwd.de> —
lizenziert unter [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Die Daten wurden verändert: räumlich abgetastet, auf 8 bit quantisiert und nach
PNG kodiert. Sie sind **nicht** für amtliche Zwecke geeignet.

Der Producer liegt im Anwendungs-Repo:
[`scripts/repack-icon-d2.mjs`](https://github.com/jppetry/buscosun-web/blob/main/scripts/repack-icon-d2.mjs).
