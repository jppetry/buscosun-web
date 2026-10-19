# Regenradar — 3D-Punktansicht am Mauszeiger (Phase P3D)

> Stand 2026-10-19. Schnellmodus-Session (Jan): umgesetzt ohne Gate-Protokoll; diese Notiz hält nur die vier
> Datenfragen aus dem Auftrag fest. Einordnung: erster Baustein von NP-4 (3D) aus `niederschlagsplattform-konzept.md`
> §7 — **kein** Custom-Layer der Karte (Canvas 2D in der Dock-Karte, kein WebGL, kein Shader), damit die STOPP-Grenze
> der Regenstriche/Flocken als Kartenlayer nicht berührt ist. Eine zweite 3D-Logik entsteht nicht: die Bühne ZT
> (`cellTowers/`) bleibt, die Punktansicht liest dieselben HD-Frames (`ProfileRadarPick`).

## 1. Datenwege (geklärt am Code, 19.10.)

| Frage | Antwort | Ort |
|---|---|---|
| Radarwert am Zeiger ohne neuen Abruf | `MapView` meldet je angezeigter Radarzeit die Frames je Land (`onProfileRadarPick`: DE RV, AT INCA, CH rzc, nativ, mit Log-Ebene `values2`, wenn der Slot eine trägt). Land des Zeigers aus der Besitz-Maske `fastCountryPicker()` (dieselbe wie die HD-Layer), Zelle über `sampleRadarIndex`, Byte → mm/h: Log-Ebene `precipFromU8Log`, sonst v1 linear `u/255·20`. Ohne HD (`?hd=0`) Rückfall auf den Deck-Stack des Seitenlandes. | `pointProbe/probeModel.ts` `sampleFrameMmH`, `usePointProbe.ts` |
| Einheit je Quelle | alle drei Spiegel-Ebenen tragen denselben Byte-Vertrag (v1 linear bis 19,96 mm/h, Log 0,06 … 200 mm/h); CH/AT ohne Log-Ebene lesen v1. Darstellungsschwelle 0,06 mm/h wie die Karte. | `scalar/RainLayer.ts` |
| Punktwerte | `getPointForecast({ pointSource: 'cube', hours: 6, includeRadarNowcast: false })` — dieselbe Kette wie Punkt-Streifen/Dashboard; T, rF, Wind 10 m, Böe, `snowLineM`, Ortshöhe `query.elevation` (0 ⇒ „unbekannt"), Taupunkt aus `v2.td2m.p50`, sonst Magnus aus T + rF (gekennzeichnet „gerechnet"). Stunde = die, die die Radarzeit enthält (Schritt t gilt für (t − 1 h, t]). Cache je 0,02°-Zelle (max. 64), Abruf nach 200 ms Ruhe, ältere abgebrochen. | `usePointProbe.ts` |
| Phasenlogik | vorhanden und wiederverwendet, Reihenfolge: buscosun Fusion `fusion.pSnow` → `phaseLabel` (Feuchtkugel); sonst `classifyPrecipitation` mit Schneefallgrenze + Ortshöhe (Regel der Nowcast-Engine); sonst Jennings et al. 2018 aus T + rF (neu, Konstanten `JENNINGS_*`, Mischzone 0,3–0,7 = Schneeregen); zuletzt T-Schwellen. Hagel nur mit `hasHail(cell)` der Zelle, in deren Umriss der Zeiger liegt. | `probeModel.ts` `derivePhase` |
| KONRAD3D-Zelle am Zeiger | `Konrad3dRun` liegt im Deck (`cellsRun`, Phase ZO); Zelle = Umriss enthält den Punkt, sonst nächster Schwerpunkt ≤ 10 km. Zugrichtung `bearing` (Peilung Schwerpunkt → erster Prognosepunkt, „wohin"), Tempo `speedKmh`, Echo-Top `echoTopM`. AT/CH: „KONRAD3D nur im DE-Verbund". | `probeModel.ts` `cellAtPoint` |

## 2. Darstellung (Stand 19.10. abends)

Die 3D-Säule (Canvas 2D, Teilchenphysik Marshall–Palmer/Atlas, Neigung α = atan(v_wind / v_fall)) war gebaut, hell
abgestimmt und ist auf Jans Wunsch wieder entfernt (Commit nach `652c181`). Die Glas-Pille am Zeiger über der Karte
(`ProbeTooltip.tsx`, Commit `652c181`) ist ebenfalls wieder entfernt („unnötig", Jan). Geblieben ist die Karte im Dock
unter den Layern (`PointProbeCard.tsx`, Langform mit Herkunft je Wert; mobil im Schnellblick nach Tippen).

## 3. Schalter, Bedienung, Prüfung

- `?p3d=0` = aus (Dock ohne die Karte, Hover-Readout der Karte wie vorher). Sonst an.
- Hover rAF-gebündelt; Klick fixiert (Marker der Karte rückt mit), Klick < 0,5 km neben dem fixierten Punkt oder Esc löst;
  mobil Tippen → Karte im Schnellblick des Bottom-Sheets. `prefers-reduced-motion` = Standbild; verborgener Tab pausiert.
- Zeit folgt dem Regler: Etikett „gemessen" (DE: Frame ≤ jüngste RV-Analyse; CH immer), „Nowcast" (DE/AT), „Modell"
  (kein Radarbild des Landes zu dieser Zeit ⇒ Rate von buscosun Fusion, nie im Radarkleid — die Säule bleibt gleich,
  das Etikett sagt es).
- Sichtprüfung 19.10. headless (CDP, `scripts/lib/cdpBrowser.mjs`, 1440 × 900) auf `/regenradar?ort=München`:
  Radarwert sofort („19:05 · gemessen · Hier fällt nichts"), buscosun Fusion 12 nach dem Kaltstart mit T 7,9 °C,
  Td 5,2 °C · 83 %, Wind aus ONO 14 km/h, Böe 28, Schneegrenze 2 386 m · Ort 331 m. Teilchenbild über eine temporäre
  Demo-Seite mit acht künstlichen Zuständen abgestimmt (Regen 0,3 / 2 / 8, Hagel 40, Schnee, Schneeregen, trocken,
  Modell). Echter Niederschlag war zur Prüfzeit in DACH nicht vorhanden — V-P3D-1.

## 4. Befunde

- **V-P3D-1** Teilchenbild an echtem Niederschlag noch nicht gesehen (DACH trocken am 19.10. abends); Hagel-Zweig nur
  mit künstlicher Zelle geprüft.
- **V-P3D-2** Die Chrome-Erweiterung war in der Session nicht verbunden; Prüfung nur headless (SwiftShader), kein
  Real-Device, keine Mobilprüfung des Bottom-Sheets.
- **V-P3D-3** Im Rückblick (Zeit vor „jetzt") liefert buscosun Fusion keine vergangene Stunde; die Karte zeigt dann die
  erste Stunde der Achse mit ihrer Uhrzeit im Fuß — ehrlich beschriftet, aber kein Messwert. Mehrwert: Stationsmessung
  aus `obs/v1` für vergangene Zeiten; Skizze: `obsStore` je Zelle lesen, Etikett „gemessen · Station ‹Name›".
- **V-P3D-4** Der Hover-Abruf ruft je 0,02°-Zelle eine volle Punktrechnung (≈ 0,7–1 s kalt); beim Überstreichen der Karte
  entstehen viele kurze Abrufe, die trotz Abbruch die Chunks laden (Cache wärmt). Mehrwert: nur das Cube-Feld lesen
  (`point/field/v1`, PAP 2) für den Hover und die volle Kette erst beim Fixieren.
