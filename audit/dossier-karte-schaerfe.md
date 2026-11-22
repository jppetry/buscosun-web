# Dossier „Brand": „Karte · markiert" bleibt auf dem Telefon grob (Phase DKS)

Stand 22.11.2026. Jans Meldung: „im Brandradar wird Karte markiert manchmal nicht vollständig geladen im Dossier ‚Brand' — es hört einfach auf zu laden." Auf Nachfrage: **mobil**, die Karte bleibt **unscharf/grob**.

## 1 Diagnose

**Nicht die Ursache (geprüft):**
- Desktop, lokal und auf buscosun.com (mit Service Worker): sieben Brände schnell nacheinander, vier WMS-Ebenen an, Straßen und Satellit, Kapitel Satellit → Brand, vergrößerte Karte. Die Karte lud jedes Mal vollständig, kein Abruf blieb offen (eigener `fetch`-Zähler: 0 offen nach 10 s).
- Telefon-Emulation (390 × 844, DPR 3, Touch): Kasten 319 × 248, Canvas 957 × 744 vom ersten Bild an, also keine veraltete Canvas-Größe. Kacheln der Basisquelle: **6 von 6 `loaded`** (Zoom 10), `areTilesLoaded() = true`, nichts hängt.

**Ursache:** Die Satellitenquelle (`rasterStyle` in `src/fire/FireMap.tsx`) hat `tileSize: 256`. MapLibre wählt die Kachelstufe einer Rasterquelle nach CSS-Pixeln. Eine 256-px-Kachel liegt also auf 256 CSS-px, und bei DPR 3 wird jedes Bildpixel 2,1- bis 4,2-fach hochgezogen (mit `roundZoom` liegt der Maßstab zwischen 0,71 und 1,41 des Nennwerts). Die Karte ist fertig geladen und sieht trotzdem aus, als hinge sie. Schärfer wird sie nie, weil nichts mehr nachkommt. Wie stark es auffällt, hängt von der gebrochenen Zoomstufe ab, also von der Brandgröße — daher „manchmal". Am Desktop (DPR 1) tritt es nicht auf. Beleg: `dossier-karte-schaerfe/vorher-mobil-dpr3.png` (Niebla, Huelva).

**Gegenprobe der Hypothese:** Dieselbe Karte live mit `tileSize: 64` (zwei Stufen tiefer): 42 Kacheln Zoom 12, alle `loaded`, sichtbar scharf.

## 2 Umsetzung

- `src/fire/rasterSharp.ts` (rein): `sharpLevels(pixelRatio)` = round(log2 DPR), begrenzt auf 0…2. `sharpRasterStyle(style, pixelRatio)` gibt eine Kopie mit `tileSize >> k` und `maxzoom ≤ 19` zurück (darüber zoomt die Karte das letzte Esri-Bild hoch). Bei DPR < 1,42, URL-Stilen und Stilen ohne Rasterquelle kommt dasselbe Objekt zurück.
- `src/fire/FireMiniMap.tsx`: beide `setStyle`-Aufrufe laufen über `miniBasemapStyle(basemap, map.getPixelRatio())`. **Nur Satellit** wird angepasst: Gelände (Esri Topo) trägt Beschriftung im Bild, die mit kleinerem `tileSize` schrumpfen würde; Straßen sind Vektor und ohnehin scharf.
- Die Hauptkarte `FireMap` bleibt unberührt.
- Kosten: Minikarte am Telefon rund 42 statt 6 Kacheln (Esri-JPEG). Vergrößert (Vollbild 390 × 844) sind es entsprechend mehr. Am Desktop mit DPR 1 bleibt alles gleich.

## 3 Gate

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:fire-minimap-sharp` | 16/16 (Pegel je DPR, DPR 1 = dieselbe Referenz, keine Mutation, URL/Vektor unverändert, Verdrahtung beider `setStyle` mit Gegenprobe, Hauptkarte unberührt) |
| `npm run typecheck` | grün |
| `npm run build` | grün (281/281 Shell-Prüfungen) |
| `npm run budget` | eingehalten; totalJs 2 117,5 / 2 118 KB |
| Telefon-Emulation DPR 3 | Kacheln Zoom 12 (42) statt 10 (6), scharf — `dossier-karte-schaerfe/nachher-mobil-dpr3.png`; keine Seitenfehler |
| Desktop DPR 1 | Dossier lädt, keine Seitenfehler — `dossier-karte-schaerfe/nachher-desktop-dpr1.png` |

Selbstverifikation: (1) Funktionserhalt — die Minikarte zeigt dieselbe Fläche, denselben Punkt, dieselbe Basiskarte, Vergrößern und Klick sind unverändert. (2) Desktop pixelgleich bei DPR 1 — der Stil ist dasselbe Objekt (Verifier). Ein Desktop mit Retina (DPR 2) bekommt jetzt ebenfalls schärfere Kacheln; das ist gewollt, weil der Grund die Pixeldichte ist und nicht die Breite. (3) Touch-Ziele sind unverändert. (4) Konsole: keine `pageerror`. (5) Long Tasks: nicht gemessen, es läuft kein neuer Rechenpfad, nur mehr Kachelabrufe.

**Offen (Jan):** Real-Device am Telefon (Emulation ist für WebGL nicht repräsentativ), Commit/Push.

## 4 Befunde

- **V-DKS-1** — Die Hauptkarte des Brandradars hat am Telefon dieselbe Unschärfe der Satellitenbasis. *Mehrwert:* Die große Karte wäre am Handy ebenso scharf. *Skizze:* `sharpRasterStyle` auch in `FireMap` einsetzen. Vorher die Kachelmenge messen: Vollbild bei DPR 3 heißt rund 16-mal so viele Kacheln, also besser höchstens eine Stufe (`k ≤ 1`).
- **V-DKS-2** — Gelände (Esri Topo) bleibt auf dichten Bildschirmen grob. *Skizze:* eine Quelle mit @2x-Kacheln suchen (Lizenz prüfen); `tileSize` verkleinern verbietet sich wegen der Beschriftung.
- **V-DKS-3** — `FireMiniMap` setzt beim Aufbau den Stil zweimal (Aufbau-Effekt und `[basemap]`-Effekt laufen beide beim Mount). Der zweite Aufruf baut den Stil neu oder diffed ihn. Gelingt der Diff (z. B. Raster → Raster), entfernt `setState` die eigene Quelle `mini-fp`, ohne dass `style.load` feuert — die orange Fläche könnte nach einem Basiskartenwechsel fehlen. *Skizze:* den `[basemap]`-Effekt beim ersten Lauf überspringen und `setStyle(..., { diff: false })` setzen. Nicht Teil dieser Phase (nicht gemeldet, nicht nachgestellt).
