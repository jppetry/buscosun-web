# audit/windkarte-vorbild-wetteronline.md — Vorlagen-Analyse: WetterOnline WindRadar

> Stand: 2026-08-08, 16:45–17:00 MESZ. Auftraggeber: Jan.
> Auftrag (wörtlich): *„schau dir diese darstellung an: https://www.wetteronline.de/wind?wrx=51.23,10.62&wrm=6.63
> und erstelle die windkarte nach diesem vorbild"*.
> Anschlussdokument zu `audit/windpartikel-flaute.md` (Ursachenanalyse der stehenden Partikel).
> Belege: `audit/screenshots/windpartikel/vorbild-wetteronline/`.

---

## 0. Wie die Vorlage angesehen wurde — und was ich dabei nicht getan habe

`wetteronline.de/wind` liegt hinter einer Einwilligungsschranke: entweder „Akzeptieren & Weiter"
(Werbung und Tracking, 215 Partner) oder 1,99 €/Monat. Einen Ablehnen-Knopf gibt es nicht.
**Ich habe in Jans Browser weder zugestimmt noch etwas gekauft** — eine Einwilligung ist seine
Entscheidung, nicht meine.

Nötig war es auch nicht: Die Karte selbst ist ein eingebettetes iframe auf
`radar.wo-cloud.com/desktop/gust/interactive`. Diese Adresse liefert exakt dieselbe Darstellung
und wurde direkt geöffnet. Alle Messungen unten stammen von dort (Desktop 1440×900).

## 1. Was die Vorlage tatsächlich ist

**Es ist kein Wind-Layer, es ist ein Böen-Layer.** Der Text der Seite sagt es selbst: „Die Farben
geben die Stärke der zu erwartenden Windspitzen an." Die Legende führt **Böen** in m/s (0…56) und
km/h (0…200). Die Partikel zeigen die Richtung, die Fläche zeigt die Böenstärke.

Die Farbskala hat 18 Stufen (aus dem DOM ausgelesen, von schwach nach stark):

| Bereich | Farben |
|---|---|
| Grün (bis ~40 km/h) | `rgb(0,153,0)` · `rgb(0,166,0)` · `rgb(14,184,32)` · `rgb(29,199,47)` |
| Gelb→Orange (~40–80) | `rgb(255,205,0)` · `rgb(255,180,0)` · `rgb(255,155,0)` · `rgb(255,108,0)` · `rgb(255,64,0)` |
| Rot (~80–120) | `rgb(255,0,0)` · `rgb(235,0,0)` · `rgb(215,0,0)` |
| Magenta→Rosa (~120–200) | `rgb(238,0,187)` · `rgb(255,0,238)` · `rgb(255,68,255)` · `rgb(255,119,255)` · `rgb(255,153,255)` · `rgb(255,181,255)` |

Am Messtag (Böen 20–30 km/h) liegt damit **die gesamte Karte im untersten Grün** — die Fläche
trägt an einem ruhigen Tag praktisch keine Information, die Partikel tragen alles. Das ist eine
bewusste Auslegung auf Sturmlagen und ein Punkt, an dem buscosun **nicht** blind folgen sollte.

## 2. Die Partikel — vermessen

Belege: `wo-uebersicht-1440.png` (z ≈ 6,6), `wo-zoom9-1440.png` (z 9),
`wo-lupe-6x-strichform.png` (6-fach vergrößert, Strichform).

| Merkmal | Vorlage | buscosun vorher | buscosun jetzt |
|---|---|---|---|
| Form | Komet: scharfer heller Kopf, weich auslaufender Schweif | runder Punkt mit 4-px-Spur | Komet, ~22 px |
| Länge | ~25 px, zoomstufenübergreifend ähnlich | ~4 px | 19–38 px (windabhängig) |
| Breite | ~3 px, weiche Kanten | 2,5 px, weiche Kanten | unverändert 2,5 px |
| Farbe | reines Weiß, halbtransparent | Weiß 85 % | unverändert |
| Dichte | ~1 000 je Megapixel | ~1 600 je Megapixel | unverändert |
| Bildschirmtempo | über Zoomstufen nahezu **konstant** | ∝ 2^Zoom (z5,3: 8–19 px/s, z9: ~190 px/s) | z5,3: 19–38 px/s, z9: ~125 px/s |

Die Vorlage bestätigt damit dieselbe Auslegung, die unsere eigene Windy-Referenzmessung
(`audit/windpartikel-windy-paritaet.md`, `src/wind/particlePreset.ts`) ergeben hatte:
**~35 px/s Gleittempo, Schweif etwa eine halbe bis eine Sekunde lang, Tempo bildschirmkonstant.**
Zwei unabhängige Referenzen, dieselben Größenordnungen.

## 3. Umgesetzt (ohne Shader-Eingriff)

`src/MapView.tsx`, nur Parameter der bestehenden `points`-Pipeline:

| Parameter | vorher | jetzt | Wirkung |
|---|---|---|---|
| `speedFactor` | 0,02 | **0,045** | Gleittempo bei z5,5 von ~16 auf ~36 px/s → Vorlagen-Niveau |
| `speedZoomDamping` | 0 | **0,25** | dämpft das Ausreißen beim Reinzoomen (z9: 190 → 125 px/s) |
| `fadeOpacity` normal | 0,955 | **0,972** | Schweif von ~4 px auf ~22 px |
| `fadeOpacity` „Intensiv" | 0,972 | **0,982** | längerer Schweif, Funktion bleibt erhalten |

Gemessen danach (z5,3, 60 Update-Pässe bei dtScale 1, Windfeld frisch aus der GPU gelesen):

| Wind | stehende Partikel | Gleittempo |
|---|---|---|
| < 0,5 m/s | 89,9 % | 0 px/s |
| 0,5–1 m/s | 66,6 % | 0 px/s |
| 1–2 m/s | 4,2 % | 19 px/s |
| 2–3 m/s | 0 % | 22 px/s |
| 3–5 m/s | 0 % | 29 px/s |
| > 5 m/s | 0 % | 38 px/s |

Ab 1 m/s ist das Tempo der Vorlage erreicht. Unter 1 m/s bleibt das Bild stehen — die Ursache
aus `audit/windpartikel-flaute.md` wirkt dort unverändert.

## 3a. Nachjustierung nach Jans Sichtung („etwas zu schnell", gerätegerecht)

Auftrag: langsamer, dem echten Wind entsprechend, und an das Gerät angepasst.

| Parameter | vorher | jetzt | Warum |
|---|---|---|---|
| `speedFactor` | 0,045 | **0,038** | −15 % Grundtempo |
| `speedGamma` | 0,5 | **0,6** | Kennlinie staucht weniger → gezeigtes Tempo folgt dem echten Wind enger (10 m/s laufen 2,9× statt 2,2× so schnell wie 1 m/s) |
| `speedMin` | 2 | **2,35** | hebt **nur den Boden** mit, damit die Verlangsamung schwache Winde nicht unter die Rasterauflösung drückt (2 · 0,045 ≙ 2,35 · 0,038) |
| `viewportSpeedRefPx` (neu) | — | **800** | Geräte-Anpassung, s. u. |

**Geräte-Anpassung.** Die Advektion ist bildwiederholraten-normiert, das Tempo also auf allen
Geräten in px/s gleich — und genau das ist das Problem: Dieselben 36 px/s queren eine 390-px-Karte
dreimal so schnell wie eine 800-px-Karte. Neu ist deshalb `viewportSpeedFactor()`: Dämpfung mit
der **Wurzel** des Breitenverhältnisses zur Referenz (800 px), geklemmt auf 0,72…1,15. Desktop
(Kartenfläche 794 px) → Faktor 0,996, also unverändert; schmale Karte (500 px) → 0,791.

**Das Mindesttempo ist von dieser Dämpfung ausgenommen** (`u_speed_min / vf` hebt das `× vf`
exakt auf). Grund ist gemessen, nicht vermutet — mitgedämpft fällt der Schritt unter eine halbe
Rasterzelle:

| 1–2 m/s-Band auf schmaler Karte (500 px) | stehende Partikel |
|---|---|
| Dämpfung auch auf dem Mindesttempo | **64,6 %** |
| Mindesttempo ausgenommen (umgesetzt) | **0,7 %** |

Messung nach der Nachjustierung (z5,3, 60 Update-Pässe bei dtScale 1):

| Wind | Desktop (794 px) | schmal (500 px) |
|---|---|---|
| < 1 m/s | 0 px/s · 71 %/38 % stehend | 0 px/s · 61 % stehend |
| 1–2 m/s | 19 px/s · 2,8 % stehend | 19 px/s · 0,7 % stehend |
| 2–3 m/s | 19 px/s | 19 px/s |
| 3–5 m/s | 20 px/s | 19 px/s |
| > 5 m/s | 28 px/s | 26 px/s |

Gegenüber §3 sind die starken Winde ~26 % langsamer (38 → 28 px/s), die stehenden Partikel im
schwachen Bereich sind **zurückgegangen** (89,9 → 70,9 % bzw. 66,6 → 37,7 %), weil der angehobene
Boden mehr als ausgleicht.

⚠️ **Grenze, ehrlich benannt:** Die Zeile „19 · 19 · 19" zeigt, dass das gezeigte Tempo dem
echten Wind **noch nicht** folgt — das Positionsraster rastet fast alles auf einen Schritt je Bild
ein und planiert damit genau die Abstufung, die `speedGamma` 0,6 herstellen soll. Auch die
Geräte-Dämpfung verschwindet dadurch weitgehend im Raster (19 vs. 19; sichtbar nur bei > 5 m/s:
28 vs. 26). Beides wird erst mit dem stochastischen Runden aus **V-174** wirksam — dort war die
Reihe monoton (16 · 22 · 27 · 34 · 40 · 46 · 49 Felder/s).

## 4. Was ohne Eingriff in `updateFrag` nicht geht

### 4.1 Ost-West wird doppelt so schnell advektiert wie Nord-Süd (neuer Befund)

`updateFrag` rechnet `offset = vec2(dispVel.x / cos φ, -dispVel.y) · K`. Diese `/cos φ`-Korrektur
stammt aus der Vorlage-Implementierung, die auf einer **äquirektangulären** Leinwand zeichnet.
buscosun projiziert die Partikel aber nach **Mercator** — dort ist der richtige Faktor
`1/(2 cos φ)`.

Gegenprobe über MapLibres eigene Projektion, ohne jede Modellannahme: derselbe Wind, einmal rein
östlich, einmal rein nördlich, jeweils als Bodenstrecke pro Sekunde —

| Breite | Ost | Nord | Verhältnis |
|---|---|---|---|
| 45° N | 933 m | 464 m | **2,01** |
| 50° N | 933 m | 464 m | **2,01** |
| 55° N | 933 m | 464 m | **2,01** |

**Ostwind läuft exakt doppelt so schnell wie Nordwind gleicher Stärke.** Folgen: Die Strömung ist
zur Waagerechten geschert, ein echter 45°-Wind wird als 63° gezeichnet (Maximalfehler 18,4°), und
zonale Winde wirken doppelt so kräftig wie meridionale. Auf einer Windkarte ist das der
Kernfehler — die Vorlage hat ihn nicht.

Fix: `dispVel.x / (2.0 * distortion)` — **eine Zeile**, danach `speedFactor` nachziehen, weil das
mittlere Tempo dadurch sinkt.

> Nachtrag zu `audit/windpartikel-flaute.md` §3.3/§3.4: Die dortigen Richtungsfehler wurden in der
> Konvention des Shaders gemessen und erfassen daher **nur** den Rundungsfehler, nicht diese
> Scherung. Beide Fehler addieren sich.

### 4.2 Bildschirmkonstantes Tempo ist mit dem Positionsraster unvereinbar

Die Vorlage hält das Tempo über die Zoomstufen konstant (`speedZoomDamping` ≈ 1). Dann schrumpft
der geografische Schritt beim Reinzoomen — und fällt unter die Auflösung der RGBA8-Kodierung:

| Zoom | Rasterzelle | Schritt bei 36 px/s |
|---|---|---|
| z5 | 0,25 px | 2,4 Zellen/Bild ✓ |
| z7 | 1,0 px | 0,6 Zellen/Bild — grenzwertig |
| z9 | 4,0 px | 0,15 Zellen/Bild — **steht** |
| z11 | 16,1 px | 0,04 Zellen/Bild — **steht** |

Deshalb steht oben 0,25 statt 1: **0,25 ist der größte Dämpfungswert, bei dem schwacher Wind bis
z9 überhaupt noch driftet.** Das volle Vorlagen-Verhalten setzt das stochastische Runden aus
**V-174** voraus — dort ist es Voraussetzung, nicht Verschönerung.

## 5. Offene Produktentscheidungen (Jan)

| # | Frage | Empfehlung |
|---|---|---|
| P1 | Fläche einfärben wie die Vorlage — vollflächig, deckend, **Böen** statt 10-m-Wind? | Der Böen-Layer existiert (`gust`, eigene Palette). Vollflächig-deckend widerspricht aber D-27 und der Palettenordnung in `docs/WEATHER.md`; und an ruhigen Tagen trägt die Vorlagenfläche keine Information. Vorschlag: Deckkraft der Wind-Heatmap anheben, Skala beibehalten. |
| P2 | Zahlen an den Städten („25 km/h") | Fachlich stark — genau die Ehrlichkeit, die buscosun ohnehin anstrebt. Eigene Phase (Punktdaten + Beschriftungslogik), nicht Teil dieser. |
| P3 | Bedienleiste (unten Zeitband, oben rechts Layer-Icons) | **Nicht** übernehmen: D-27 (Command-Deck) ist gesetzt, unser Zeitband und Dock leisten dasselbe. |

## 6. Gate

Die Parameteränderungen aus §3 sind umgesetzt, `npm run typecheck` grün, Konsole sauber,
Funktionserhalt (Aus/Normal/Intensiv/Dichte) unberührt. §4.1 und §4.2 liegen in `updateFrag` und
damit unter **STOPP & FRAGEN**; beide sind Jan mit dieser Diagnose vorgelegt. Nach Freigabe:
Gate **GWV1** mit den fünf Selbstverifikations-Fragen, Desktop + iPhone-12-Pro-Profil,
Vorher/Nachher unter `audit/screenshots/windpartikel/vorbild-wetteronline/`.
