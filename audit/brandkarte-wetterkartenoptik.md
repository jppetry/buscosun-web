# Phase BK — Brandkarte in der Optik der Wetterkarte

> Stand 2026-10-14. Auftrag (Jan, 14.10.): „im Feuer-Feature die gleiche DACH-Karte wie in der Wetterkarte verwenden";
> Präzisierung: „die Karte soll einfach genauso aussehen wie in der Wetterkarte". Kürzel **BK**.

## 1 Diagnose

| Merkmal | Wetterkarte (`MapView.tsx`) | Brandkarte (`fire/FireMap.tsx`) |
|---|---|---|
| Basiskarte | OpenFreeMap **dark** (`BASEMAP_STYLE`, seit 12./13.10.) | OpenFreeMap **positron** (`STREETS`) |
| Ink-Schleier | keiner | `fire-dim-fill`, `#2C2A26`, Deckkraft 0,7 (Nachbau des alten Wetterkarten-Looks) |
| Einfügepunkt unter den Grenzlinien | `firstBoundaryLayerId` (jede Ebene `boundary*`) | fest `boundary_3` (nur in positron vorhanden ⇒ im dunklen Stil `undefined`) |
| Ortsnamen | `germanBasemapLabels` (`name:de` statt `name_en`) | keine Anpassung |
| DACH-Maske | `loadDachMask()`, deckend `#E0D6BE` | **gleich** (`loadDachMask()`, `#E0D6BE`) — nichts zu tun |
| Startausschnitt | DACH-Fit (5,5–17,5 / 45,5–55,5) | gleiche Grenzen — nichts zu tun |

Die Maske und der Ausschnitt sind also schon dieselben; der sichtbare Unterschied ist die Basiskarte samt Schleier.

## 2 Entscheidung

Die Basiskarte `streets` der Brandkarte wird dieselbe wie die der Wetterkarte, über EINE gemeinsame Konstante
(`src/map/weatherBasemap.ts`), nicht über eine Kopie. `terrain` und `satellite` bleiben als Wahl (Funktionserhalt).
Im Stil `streets` entfällt der Schleier (wie in der Wetterkarte); bei `terrain`/`satellite` bleibt er (0,3).

## 3 Umsetzung

| Datei | Änderung |
|---|---|
| `src/map/weatherBasemap.ts` (neu) | `WEATHER_BASEMAP_STYLE`, `firstBoundaryLayerId`, `germanBasemapLabels` — aus `MapView.tsx` verschoben, Wortlaut unverändert |
| `src/MapView.tsx` | importiert die drei statt sie lokal zu definieren |
| `src/fire/FireMap.tsx` | `streets` = `WEATHER_BASEMAP_STYLE`; Schleier nur bei `terrain`/`satellite`; Einfügepunkt über `firstBoundaryLayerId`; `germanBasemapLabels` bei `style.load` |
| `src/fire/FireMiniMap.tsx` | unverändert, folgt über `basemapStyle()` |

## 4 Gate (14.10., uncommitted)

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` | grün, 260/260 Prüfungen (SEO/Routing) |
| `npm run budget` | grün — eagerJs 110/110 KB, largestChunk 278,4/302 KB, totalJs 1 824,6/1 825 KB |
| Bildbeleg `audit/brandkarte-wetterkartenoptik/` | `nachher-brandkarte-desktop.png` (1440 × 900): dunkler Stil, sandfarbene DACH-Maske, „DEUTSCHLAND"/„SCHWEIZ" deutsch, kein Schleier · `referenz-wetterkarte-desktop.png` · `nachher-brandkarte-mobil.png` (390 × 844) · `nachher-brandkarte-satellit.png`/`-gelaende.png` (Schleier 0,3 da, Raster-Basis) · `nachher-brandkarte-strassen-zurueck.png` (Schleier wieder weg) |
| Zustandsprobe je Bild | Straßen: `dim:false`, Basis vektor, Maske da · Satellit/Gelände: `dim:true`, Basis raster · zurück auf Straßen: `dim:false` |

### 4.1 Selbstverifikation

1. **Funktionserhalt:** Basiskarten Gelände/Satellit unverändert wählbar, Schleier dort wie vorher (0,3); alle Fachlayer, Maske und Ausschnitt unberührt.
2. **Desktop pixelgleich:** nicht gewollt — die Straßen-Basiskarte ändert sich; `MapView` ist nur um den Umzug dreier Funktionen verändert (Wortlaut gleich).
3. **Touch-Targets:** keine UI-Änderung.
4. **Konsole:** nicht aufgezeichnet (der Shooter liest keine Konsole) — **offen**.
5. **Long Tasks:** nicht gemessen; kein neuer Abruf, nur ein anderer Stil-URL.

### 4.2 Offen / Befunde (D-28)

- **V-BK-1** Konsole der Brandkarte im neuen Stil prüfen (Warnungen des Style-Parsers); von Hand in Chrome DevTools.
- **V-BK-2** Lesbarkeit von Hotspot-/Cluster-Farben, Legende und `FireMiniMap` (Dossier, Detailkarte) auf dunklem Grund von Hand ansehen; die Minikarte folgt über `basemapStyle()` mit.
- **V-BK-3** Real-Device (WebGL) — Emulation ist nicht repräsentativ.
